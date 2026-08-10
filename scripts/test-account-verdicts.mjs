#!/usr/bin/env node
// Account-verdict MATRIX (B-f531, 2.244.0) — the single evaluateOnHost
// authority, exercised across every combination that produced a field
// incident: linked / host-held / both (held wins) / identity-mismatch /
// never-signed-in / ship gate / dial / api-key. Six incidents happened
// because this matrix only ever ran in users' browsers; now it runs here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-verdicts-'));
const AccountManager = require('../src/accounts.js');
const AM = AccountManager.AccountManager || AccountManager;
const accounts = new AM({ dataDir: tmp, onChange: () => {} });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };

// ── fixtures ──
// API key account
const api = accounts.add({ name: 'Key A', key: 'sk-ant-api03-' + 'x'.repeat(80) });
// Subscription LOGGED IN locally (fabricate a creds dir with the marker)
const subIn = accounts.createSubscription({ name: 'SubIn' });
fs.writeFileSync(path.join(accounts.subDir(subIn.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 3600e3 } }));
accounts.setEmail(subIn.id, 'alice@example.com');
// Subscription NEVER signed in (empty dir)
const subOut = accounts.createSubscription({ name: 'SubOut' });
accounts.setEmail(subOut.id, 'bob@example.com');

const evalV = (a, facts, opts) => accounts.evaluateOnHost(accounts.get(a.id), facts, opts || {});
const F = (over = {}) => ({ subscription: { email: 'machine@example.com' }, codex: { email: '' }, hostSubs: [], hostSubEmails: {}, transport: 'ssh', ...over });

console.log('── local ──');
check('api key local → local-env', (() => { const v = evalV(api, null); return v.usable && v.how === 'local-env'; })());
check('logged-in sub local → local-env', (() => { const v = evalV(subIn, null); return v.usable && v.how === 'local-env'; })());
check('never-signed-in sub local → blocked', (() => { const v = evalV(subOut, null); return !v.usable && v.reason === 'never-signed-in'; })());

console.log('── remote ──');
check('api key remote → ship (always)', (() => { const v = evalV(api, F()); return v.usable && v.how === 'ship'; })());
check('sub remote, nothing on host, no opt-in → ship-disabled', (() => { const v = evalV(subIn, F()); return !v.usable && v.reason === 'ship-disabled'; })());
check('sub remote + opt-in → ship', (() => { const v = evalV(subIn, F(), { allowShip: true }); return v.usable && v.how === 'ship'; })());
check('sub remote + opt-in + DIAL → dial-no-ship', (() => { const v = evalV(subIn, F({ transport: 'dial' }), { allowShip: true }); return !v.usable && v.reason === 'dial-no-ship'; })());
check('never-signed-in sub remote, nothing on host → never-signed-in', (() => { const v = evalV(subOut, F()); return !v.usable && v.reason === 'never-signed-in'; })());

console.log('── email-linked ──');
check('email matches machine login → host-login', (() => { const v = evalV(subIn, F({ subscription: { email: 'ALICE@example.com' } })); return v.usable && v.how === 'host-login' && v.linked; })());
check('linked works even when NOT logged in locally (2.237.3)', (() => { const v = evalV(subOut, F({ subscription: { email: 'bob@example.com' } })); return v.usable && v.how === 'host-login'; })());

console.log('── host-held ──');
check('held dir, identity unreported → host-held (unverified)', (() => { const v = evalV(subOut, F({ hostSubs: [subOut.id] })); return v.usable && v.how === 'host-held' && !v.heldVerified; })());
check('held dir, identity MATCHES → host-held (verified)', (() => { const v = evalV(subOut, F({ hostSubs: [subOut.id], hostSubEmails: { [subOut.id]: 'Bob@Example.com' } })); return v.usable && v.how === 'host-held' && v.heldVerified; })());
check('held dir, identity MISMATCH → refused loudly', (() => { const v = evalV(subOut, F({ hostSubs: [subOut.id], hostSubEmails: { [subOut.id]: 'stranger@example.com' } })); return !v.usable && v.reason === 'held-identity-mismatch' && v.dirEmail === 'stranger@example.com'; })());
check('HELD+LINKED both → held WINS (2.243.2 precedence: dir creds are deterministic, config email can be stale)', (() => {
  const v = evalV(subOut, F({ subscription: { email: 'bob@example.com' }, hostSubs: [subOut.id] }));
  return v.usable && v.how === 'host-held' && v.held && v.linked;
})());

console.log('── not-on-this-host vs never-signed-in ──');
accounts.noteHostLogins('host-nov', [subOut.id]);
check('no login HERE but held elsewhere → not-on-this-host (+otherHosts)', (() => {
  const v = evalV(subOut, F({ hostId: 'host-cw' }));
  return !v.usable && v.reason === 'not-on-this-host' && (v.otherHosts || []).includes('host-nov');
})());
check('local pick of a host-only account → not-on-this-host', (() => {
  const v = evalV(subOut, null);
  return !v.usable && v.reason === 'not-on-this-host';
})());
check('evaluated ON the holding host itself w/o live dir → NOT listed as its own other-host', (() => {
  const v = evalV(subOut, F({ hostId: 'host-nov' }));
  return !v.usable && !(v.otherHosts || []).includes('host-nov');
})());

console.log('── long-lived token (oat, B-211a) ──');
// oat on the never-signed-in sub: valid token shape, encrypted at rest
const OAT = 'sk-ant-oat01-' + 'a'.repeat(60);
accounts.setOat(subOut.id, OAT);
check('oat stored encrypted (raw token never on disk)', !fs.readFileSync(path.join(tmp, 'accounts.json'), 'utf-8').includes(OAT));
check('getOat round-trips', accounts.getOat(subOut.id) === OAT);
check('list() exposes oat state', (() => { const a = accounts.list().accounts.find((x) => x.id === subOut.id); return a.oat === true && a.oatDaysLeft > 360; })());
check('bad token shape refused', (() => { try { accounts.setOat(subOut.id, 'sk-ant-api03-nope'); return false; } catch { return true; } })());
check('oat on an API-key account refused', (() => { try { accounts.setOat(api.id, OAT); return false; } catch { return true; } })());

check('oat-only sub local → usable via oat', (() => { const v = evalV(subOut, null); return v.usable && v.how === 'oat'; })());
check('oat-only sub on ssh host → usable via oat', (() => { const v = evalV(subOut, F()); return v.usable && v.how === 'oat'; })());
check('oat sub on DIAL host → usable via oat (no dial-no-ship)', (() => { const v = evalV(subOut, F({ transport: 'dial' })); return v.usable && v.how === 'oat'; })());
check('host-held still beats oat', (() => { const v = evalV(subOut, F({ hostSubs: [subOut.id], hostSubEmails: { [subOut.id]: 'bob@example.com' } })); return v.usable && v.how === 'host-held'; })());
check('linked still beats oat', (() => { const v = evalV(subOut, F({ subscription: { email: 'bob@example.com' } })); return v.usable && v.how === 'host-login'; })());

// resolveForSpawn shapes
check('oat-only local spawn → env token, no dir', (() => { const r = accounts.resolveForSpawn(subOut.id, 'claude'); return r.oatOnly && r.localEnv.CLAUDE_CODE_OAUTH_TOKEN === OAT && !r.localEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR; })());
check('oat-only spawn carries the secret channel', (() => { const r = accounts.resolveForSpawn(subOut.id, 'claude'); return r.secret?.var === 'CLAUDE_CODE_OAUTH_TOKEN' && r.secret.value === OAT; })());
accounts.setOat(subIn.id, OAT);
check('logged-in + oat: local spawn keeps the DIR (hot-swap intact)', (() => { const r = accounts.resolveForSpawn(subIn.id, 'claude'); return !!r.localEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR && !r.localEnv.CLAUDE_CODE_OAUTH_TOKEN; })());
check('logged-in + oat: remote secret channel present', (() => { const r = accounts.resolveForSpawn(subIn.id, 'claude'); return r.secret?.var === 'CLAUDE_CODE_OAUTH_TOKEN'; })());
accounts.clearOat(subIn.id);
check('clearOat restores the plain-subscription shape', (() => { const r = accounts.resolveForSpawn(subIn.id, 'claude'); return r.secret === null; })());
// expired oat: verdict NOT usable with its own honest reason (review fix —
// a usable verdict made the switcher kill-then-fail, and a default account
// silently flipped billing to the host login the day the token expired)
accounts.setOat(subOut.id, OAT);
accounts.get(subOut.id).oatMintedAt = Date.now() - 366 * 86400000;
check('EXPIRED oat verdict → not usable, reason oat-expired (local)', (() => { const v = evalV(subOut, null); return !v.usable && v.reason === 'oat-expired'; })());
check('EXPIRED oat verdict → oat-expired on a host too', (() => { const v = evalV(subOut, F()); return !v.usable && v.reason === 'oat-expired'; })());
check('EXPIRED oat-only spawn refuses with re-mint guidance', (() => { try { accounts.resolveForSpawn(subOut.id, 'claude'); return false; } catch (e) { return /re-mint/.test(e.message); } })());
check('expired oat drops the secret for a logged-in account', (() => { accounts.get(subIn.id).oatEnc = accounts.get(subOut.id).oatEnc; accounts.get(subIn.id).oatMintedAt = Date.now() - 366 * 86400000; const r = accounts.resolveForSpawn(subIn.id, 'claude'); delete accounts.get(subIn.id).oatEnc; return r.secret === null; })());
check('clearOat removes verdict usability', (() => { accounts.clearOat(subOut.id); const v = evalV(subOut, F()); return !v.usable; })());

// ── macOS local-only rung (PR #23, walter): a Darwin-platform manager marks
// Claude subscriptions Keychain-backed — the SHIP rung is forbidden (the file
// fallback forks the rotating refresh token), but held/linked stay usable.
console.log('── macOS local-only (PR #23) ──');
{
  const { AccountManager: AM } = await import('../src/accounts.js');
  const mac = new AM({ dataDir: tmp + '/mac', platform: 'darwin' });
  const ms = mac.createSubscription({ name: 'MacSub' });
  fs.writeFileSync(path.join(mac.subDir(ms.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 3600e3 } }));
  mac.setEmail(ms.id, 'mac@example.com');
  const mF = (over = {}) => ({ subscription: { email: 'machine@example.com' }, codex: { email: '' }, hostSubs: [], hostSubEmails: {}, transport: 'ssh', ...over });
  const mv = (facts, opts) => mac.evaluateOnHost(mac.get(ms.id), facts, opts || {});
  check('darwin sub is localOnly in list()', mac.list().accounts.find((x) => x.id === ms.id)?.localOnly === true);
  check('darwin sub + allowShip → BLOCKED reason local-only-mac', (() => { const v = mv(mF(), { allowShip: true }); return !v.usable && v.reason === 'local-only-mac'; })());
  check('darwin sub, ship off → reason local-only-mac (not ship-disabled)', (() => { const v = mv(mF()); return !v.usable && v.reason === 'local-only-mac'; })());
  check('darwin sub HELD on host stays usable (host-held)', (() => { const v = mv(mF({ hostSubs: [ms.id], hostSubEmails: { [ms.id]: 'mac@example.com' } })); return v.usable && v.how === 'host-held'; })());
  check('darwin sub LINKED to host login stays usable (host-login)', (() => { const v = mv(mF({ subscription: { email: 'mac@example.com' } })); return v.usable && v.how === 'host-login'; })());
  check('darwin sub local spawn unaffected', (() => { const v = mv(null); return v.usable && v.how === 'local-env'; })());
  check('resolveForSpawn marks remoteCreds non-shippable', mac.resolveForSpawn(ms.id, 'claude').remoteCreds?.shippable === false);
  check('linux manager (this one) marks nothing localOnly', accounts.list().accounts.every((x) => !x.localOnly));
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
