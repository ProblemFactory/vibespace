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

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
