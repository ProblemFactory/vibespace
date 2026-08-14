#!/usr/bin/env node
// POOL SELF-HEAL ON A SIGNED-OUT TARGET (2.330.2, real outage 2026-08-13).
// Two of the pool's subscriptions had their refresh tokens age out while idle
// (the CLI clears creds when a refresh is rejected). The pool's default target
// AND all three per-session links pointed at one of them, so EVERY resume died
// with "pooled target is not logged in" — a pool whose entire purpose is to
// route around an unusable account had turned into a hard stop with no way
// forward from the UI. A dead target must RE-POINT, not throw.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AccountManager } = require('../src/accounts.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pool-so-'));
const warn = console.warn; console.warn = () => {};
try {
  const am = new AccountManager({ dataDir: tmp });
  const live = (name) => {
    const a = am.createSubscription({ name });
    fs.writeFileSync(path.join(am.subDir(a.id), '.credentials.json'), JSON.stringify({
      claudeAiOauth: { accessToken: 'at-' + a.id, refreshToken: 'rt', expiresAt: Date.now() + 3600e3, scopes: ['user:inference'] },
    }));
    return a.id;
  };
  const kill = (id) => {
    // exactly what the CLI leaves behind when a refresh is rejected: the
    // record and the file survive, the tokens do not
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { scopes: [] } }));
  };

  const good = live('Good'), other = live('Other'), dead = live('Dead');
  const pool = am.createPool({ name: 'Pool' });
  am.setPoolTarget(pool.id, dead);
  kill(dead);

  ok(am.poolMembers(pool.id).map((m) => m.id).sort().join() === [good, other].sort().join(),
    'poolMembers already excludes the signed-out account');
  ok(am.poolCurrent(pool.id) === dead, 'precondition: the pool still POINTS at the dead account');

  // 1. plain spawn: heals instead of throwing
  const r = am.resolveForSpawn(pool.id);
  ok(!!r && r.pooled, 'a pooled spawn with a signed-out target still resolves (was: hard throw)');
  ok([good, other].includes(am.poolCurrent(pool.id)), 're-pointed to a LIVE member', am.poolCurrent(pool.id));
  ok([good, other].includes(r.poolTarget), 'the returned billing target is the live one');

  // 2. per-session link: a chooser that returns a dead member is overruled
  am.setPoolTarget(pool.id, good);
  const r2 = am.resolveForSpawn(pool.id, 'claude', { sessionKey: 'sess-x', chooseMember: () => dead });
  ok(r2.poolTarget !== dead, 'a chooser picking the signed-out member is overruled (quota ranking cannot beat credentials)', r2.poolTarget);
  ok(fs.realpathSync(r2.localEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR) === fs.realpathSync(am.subDir(r2.poolTarget)),
    'the per-session link points at the account it claims to bill');

  // 3. a chooser picking a LIVE member is still honoured (no regression to the
  //    plan-C model-aware placement)
  const r3 = am.resolveForSpawn(pool.id, 'claude', { sessionKey: 'sess-y', chooseMember: () => other });
  ok(r3.poolTarget === other, 'a live chooser pick is still honoured');

  // 4. everything dead ⇒ an ACTIONABLE error, not a bare "not logged in"
  kill(good); kill(other);
  let msg = '';
  try { am.resolveForSpawn(pool.id); } catch (e) { msg = e.message; }
  ok(/signed out/.test(msg) && /Manage Agents/.test(msg),
    'a fully signed-out pool fails with an actionable message naming the fix', msg);

  // ── DELETE hygiene (2.335.0, owner report: deleting the account a pool sat
  // on left the whole pool broken — dangling default symlink + dangling
  // per-session links + stale member lists, healed only by a lucky spawn) ──
  const m1 = live('M1'), m2 = live('M2'), m3 = live('M3');
  const pool2 = am.createPool({ name: 'P2', members: [m1, m2, m3] });
  am.setPoolTarget(pool2.id, m1);
  am.ensureSessionPoolLink(pool2.id, 'sess-a', m1);
  am.ensureSessionPoolLink(pool2.id, 'sess-b', m2);
  am.remove(m1);
  ok([m2, m3].includes(am.poolCurrent(pool2.id)), 'deleting the pool TARGET re-points the default link to a live member', am.poolCurrent(pool2.id));
  ok(am.readSubCreds(pool2.id).loggedIn, 'the pool reads as logged-in immediately (no dangling-symlink limbo)');
  ok(am.poolCurrentFor(pool2.id, 'sess-a') !== m1 && !!am.poolCurrentFor(pool2.id, 'sess-a'),
    'a per-session link that billed to the deleted account is re-pointed', am.poolCurrentFor(pool2.id, 'sess-a'));
  ok(am.poolCurrentFor(pool2.id, 'sess-b') === m2, 'a link on a SURVIVING member is untouched');
  ok(!(am.get(pool2.id).members || []).includes(m1), 'the deleted id is stripped from the explicit member list');
  // non-target member removal: default link stays put
  const cur2 = am.poolCurrent(pool2.id);
  am.remove(cur2 === m2 ? m3 : m2);
  ok(am.poolCurrent(pool2.id) === cur2, 'removing a NON-target member leaves the default link alone');
  // WIDEN GUARD (review finding): deleting the LAST explicit member must NOT
  // flip the list to null (= "ALL logged-in subs") — that would silently
  // re-point billing onto an account the user deliberately excluded
  const outsider = live('Personal'); // logged-in, deliberately NOT in P2's members
  am.updatePool(pool2.id, { members: [cur2] });
  am.remove(cur2);
  ok(!am.poolMembers(pool2.id).some((m) => m.id === outsider), 'deleting the last explicit member does NOT widen the pool onto excluded accounts');
  ok(am.poolCurrent(pool2.id) !== outsider, 'billing never re-points to the excluded account', am.poolCurrent(pool2.id));
  am.remove(outsider);
  ok(am.poolCurrent(pool2.id) === null, 'last member deleted → pool target honestly absent (no dangling link)');
  let msg2 = '';
  try { am.resolveForSpawn(pool2.id); } catch (e) { msg2 = e.message; }
  ok(/signed out|Manage Agents/.test(msg2), 'resolve on a memberless pool fails with the actionable message', msg2);
} finally {
  console.warn = warn;
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
