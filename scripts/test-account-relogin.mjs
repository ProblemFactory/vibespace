#!/usr/bin/env node
// Re-login-on-this-machine (2.332.0): the route's building blocks — the login
// command must target the EXISTING account dir (identity/pool membership
// survive), and the attempt-baseline plumbing must never throw on accounts
// that have no login-status file yet.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AccountManager } = require('../src/accounts.js');
const { buildClaudeSubscriptionLoginCommand } = require('../src/claude-subscription-login.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-relogin-'));
try {
  const am = new AccountManager({ dataDir: tmp });
  const { id } = am.createSubscription({ name: 'ReloginMe' });
  const dir = am.subDir(id);
  const cmd = buildClaudeSubscriptionLoginCommand({ nodeCmd: 'node', helperPath: '/x/helper.mjs', claudeCmd: 'claude', configDir: dir });
  ok(cmd.includes(dir), 'login command is scoped to the EXISTING account dir', cmd);
  ok(/--config-dir/.test(cmd), 'dir travels as --config-dir argv — the HELPER sets both config envs itself (env isolation is its contract)');
  ok(am._subscriptionLoginStatus(id) == null || typeof am._subscriptionLoginStatus(id) === 'object',
    'login-status read never throws on a status-less account (baseline=null path)');
  // a token-less husk (the real trigger for this feature) still yields a
  // usable dir + command — re-login needs no remove/re-add
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { scopes: [] } }));
  ok(!am.readSubCreds(id).loggedIn, 'husk reads as signed out');
  const cmd2 = buildClaudeSubscriptionLoginCommand({ nodeCmd: 'node', helperPath: '/x/helper.mjs', claudeCmd: 'claude', configDir: am.subDir(id) });
  ok(cmd2.includes(dir), 'signed-out account still gets a valid re-login command into the SAME dir');

  // ── identity guard (2.333.0, owner: "orgid不对得自动变成新条目") ──
  const login = (accId, email) => {
    fs.writeFileSync(path.join(am.subDir(accId), '.credentials.json'), JSON.stringify({
      claudeAiOauth: { accessToken: 'at-' + email, refreshToken: 'rt', expiresAt: Date.now() + 3600e3, email },
    }));
  };
  // 1. same identity → in-place refresh, no new records
  am.setEmail(id, 'me@x.com'); login(id, 'me@x.com');
  const before = am.list().accounts.length;
  let r = am.reloginResolve(id);
  ok(r.outcome === 'same' && am.list().accounts.length === before, 'same identity → in-place refresh, no split', r.outcome);
  // 2. mismatched identity, no matching record → NEW entry; original reverts signed-out
  login(id, 'stranger@y.com');
  r = am.reloginResolve(id);
  ok(r.outcome === 'split', 'unknown identity → split to a NEW entry', r.outcome);
  ok(am.list().accounts.length === before + 1, 'a new record exists');
  ok(!am.readSubCreds(id).loggedIn, 'the ORIGINAL record reverts to signed-out (history intact)');
  const nw = am.list().accounts.find((x) => (x.email || x.name || '').includes('stranger'));
  ok(nw && am.readSubCreds(nw.id).loggedIn, 'the new record holds the fresh login');
  // 3. mismatched identity matching ANOTHER record → creds move there
  const otherId = am.createSubscription({ name: 'OtherAcct' }).id;
  am.setEmail(otherId, 'other@z.com');
  login(id, 'other@z.com');
  r = am.reloginResolve(id);
  ok(r.outcome === 'moved' && r.movedTo?.id === otherId, 'identity matching an EXISTING record → login moves there', r);
  ok(am.readSubCreds(otherId).loggedIn && !am.readSubCreds(id).loggedIn, 'creds landed on the matching record; original signed out');
  // 4. not-yet-completed login → pending, nothing changes
  fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { scopes: [] } }));
  ok(am.reloginResolve(id).outcome === 'pending', 'husk (login not finished) → pending, no action');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
