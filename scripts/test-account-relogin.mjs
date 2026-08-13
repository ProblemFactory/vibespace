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
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
