#!/usr/bin/env node
// THE VAULT'S DOORS (lane vault-e2e-password — src/routes/vault.js behind the REAL src/auth.js gate, in server.js's mount
// order: the gate, then the JSON body, then the routes). Fast tier: express on 127.0.0.1, a real engine on a scratch dir.
//   ① behind sign-in: no cookie ⇒ 401 from the gate (state, setup, unlock …)
//   ② PEOPLE ONLY: an agent token (vsst_ / jbt_ bearer, a body `token`) ⇒ 403 human_only on setup / unlock / change / lock
//      / idle — and the engine never saw the call
//   ③ SAME-ORIGIN: a cross-site / same-site page ⇒ the gate's 403; a browser-less write (no Origin, no Sec-Fetch-Site — a
//      local curl on an open instance) ⇒ the door's own 403 cross_site; Sec-Fetch-Site same-origin or Origin = own ⇒ through
//   ④ the doors: setup → unlocked; lock; unlock (wrong ⇒ 403 wrong_password, right ⇒ 200); change; idle; state
//   ⑤ the RATE LIMIT: 5 wrong ⇒ the 6th is 429 paced (the right password too)
//   ⑥ the AUDIT: vault-unlock-failed with the caller's address — never the password; no password in any answer, log or broadcast
//   ⑦ the BROADCAST: vault-state on every change (every client)
//   ⑧ AGENTS: GET /api/agent/vault/state and POST /api/agent/vault/lock with a live session token; an unknown token ⇒ 401;
//      there is no agent unlock door
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const express = require(path.join(REPO, 'node_modules/express'));
const { Auth } = require(path.join(REPO, 'src/auth.js'));
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const { registerVaultRoutes, personVerdict } = require(path.join(REPO, 'src/routes/vault.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const ROOT = scratch('vault-routes');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const PW = 'second password for the routes';
const LOGS = [];
const log = { log: (m) => LOGS.push(String(m)), warn: (m) => LOGS.push(String(m)) };
const warn0 = console.warn; console.warn = (...a) => LOGS.push(a.join(' '));

const dataDir = path.join(ROOT, 'data'); fs.mkdirSync(dataDir);
fs.writeFileSync(path.join(dataDir, '.accounts-key'), crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const auth = new Auth(dataDir, {});
const SIGN_IN = 'xyzzy-signin-77';
auth.setPassword(SIGN_IN);
const frames = [];
const calls = [];
const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log, idleTimer: false, signInPassword: (p) => auth.verifyPassword(p), bcast: (m) => frames.push(JSON.stringify(m)) });
for (const k of ['setup', 'unlock', 'change', 'lock', 'setIdleLock']) { const f = vault[k]; vault[k] = (...a) => { calls.push(k); return f(...a); }; }
const SESSION_TOKEN = 'vsst_' + crypto.randomBytes(16).toString('hex');
const activeSessions = new Map([['s1', { agentToken: SESSION_TOKEN }]]);
const app = express();
app.use(auth.middleware());
auth.registerRoutes(app);
app.use(express.json());
registerVaultRoutes(app, { vault, activeSessions, getJobs: () => ({ jobByToken: (t) => (t === 'jbt_live' ? { id: 'j1' } : null) }) });
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const PORT = srv.address().port, OWN = `http://127.0.0.1:${PORT}`;
const COOKIE = `vs_token=${auth.issueToken('owner')}`;
const PAGE = { cookie: COOKIE, 'sec-fetch-site': 'same-origin', origin: OWN };
const ANSWERS = [];
function hit(p, { method = 'POST', headers = PAGE, body } = {}) {
  return new Promise((resolve, reject) => {
    const b = method === 'GET' ? null : JSON.stringify(body || {});
    const h = { ...headers };
    if (b !== null) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(b); }
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: h }, (x) => {
      let d = ''; x.on('data', (c) => d += c);
      x.on('end', () => { ANSWERS.push(d); let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: x.statusCode, json: j || {} }); });
    });
    r.on('error', reject); r.end(b === null ? undefined : b);
  });
}

console.log('① behind sign-in');
for (const [m, p] of [['GET', '/api/vault/state'], ['POST', '/api/vault/setup'], ['POST', '/api/vault/unlock'], ['POST', '/api/vault/lock']]) {
  const r = await hit(p, { method: m, headers: { 'sec-fetch-site': 'same-origin' }, body: { password: PW } });
  ok(r.status === 401, `${m} ${p} without the sign-in cookie ⇒ 401 from the gate`, r);
}
ok(calls.length === 0, 'the engine was never reached');

console.log('② people only');
for (const p of ['/api/vault/setup', '/api/vault/unlock', '/api/vault/change', '/api/vault/lock', '/api/vault/idle']) {
  for (const [label, headers, body] of [['a vsst_ bearer', { ...PAGE, authorization: 'Bearer ' + SESSION_TOKEN }, { password: PW }], ['a jbt_ bearer', { ...PAGE, authorization: 'Bearer jbt_live' }, { password: PW }], ['a body token', PAGE, { password: PW, token: SESSION_TOKEN }]]) {
    const r = await hit(p, { headers, body });
    if (!(r.status === 403 && r.json.code === 'human_only')) ok(false, `${p} with ${label}`, r);
  }
}
ok(calls.length === 0, 'every agent-token call to the five person doors ⇒ 403 human_only, and the engine never saw one');

console.log('③ same-origin');
{
  const xs = await hit('/api/vault/setup', { headers: { cookie: COOKIE, 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }, body: { password: PW } });
  ok(xs.status === 403 && xs.json.error === 'cross-site', 'a cross-site page ⇒ the gate refuses (403 cross-site)', xs);
  const ss = await hit('/api/vault/unlock', { headers: { cookie: COOKIE, 'sec-fetch-site': 'same-site', origin: 'https://sibling.example' }, body: { password: PW } });
  ok(ss.status === 403, 'a same-site sibling ⇒ 403', ss);
  const curl = await hit('/api/vault/setup', { headers: { cookie: COOKIE }, body: { password: PW } });
  ok(curl.status === 403 && curl.json.code === 'cross_site', 'a browser-less write (no Origin, no Sec-Fetch-Site) passes the gate but NOT the vault door ⇒ 403 cross_site', curl);
  const other = await hit('/api/vault/setup', { headers: { cookie: COOKIE, origin: 'http://127.0.0.1:1' }, body: { password: PW } });
  ok(other.status === 403, 'an Origin that is not this instance ⇒ 403', other);
  ok(calls.length === 0, 'none of them reached the engine');
  ok(personVerdict({ headers: { origin: OWN, host: `127.0.0.1:${PORT}` }, socket: {} }).ok && personVerdict({ headers: { 'sec-fetch-site': 'same-origin' }, socket: {} }).ok, 'Origin = own, or Sec-Fetch-Site same-origin ⇒ a person on this page');
}

console.log('④ the doors');
{
  const st0 = await hit('/api/vault/state', { method: 'GET' });
  ok(st0.status === 200 && st0.json.state === 'not_set_up', 'GET /api/vault/state ⇒ not_set_up', st0);
  ok((await hit('/api/vault/setup', { body: { password: SIGN_IN } })).json.code === 'same_as_sign_in', 'the sign-in password is refused as the second (400 same_as_sign_in)');
  ok((await hit('/api/vault/setup', { body: { password: 'short' } })).status === 400, 'a short password ⇒ 400');
  const su = await hit('/api/vault/setup', { body: { password: PW } });
  ok(su.status === 200 && su.json.ok && su.json.state === 'unlocked' && su.json.sealed.includes('.accounts-key'), 'setup ⇒ 200, unlocked, the key file sealed', su.json);
  ok((await hit('/api/vault/setup', { body: { password: PW } })).status === 409, 'a second setup ⇒ 409 already_set_up');
  const lk = await hit('/api/vault/lock');
  ok(lk.status === 200 && lk.json.state === 'locked', 'lock ⇒ locked');
  const w = await hit('/api/vault/unlock', { body: { password: 'not the password' } });
  ok(w.status === 403 && w.json.code === 'wrong_password' && w.json.state === 'locked' && w.json.failedTries === 1, 'a wrong password ⇒ 403 wrong_password, still locked, one failed try', w.json);
  const u = await hit('/api/vault/unlock', { body: { password: PW } });
  ok(u.status === 200 && u.json.state === 'unlocked', 'the right password ⇒ 200 unlocked');
  const ch = await hit('/api/vault/change', { body: { old: PW, new: PW + ' v2' } });
  ok(ch.status === 200 && ch.json.ok, 'change ⇒ 200');
  const idle = await hit('/api/vault/idle', { body: { hours: 4 } });
  ok(idle.status === 200 && idle.json.idleLockHours === 4 && (await hit('/api/vault/idle', { body: { hours: -1 } })).status === 400, 'idle ⇒ 4 h; a bad value ⇒ 400');
  ok((await hit('/api/vault/active')).status === 200, 'a person\'s activity ping ⇒ 200');
}

console.log('⑤ the rate limit');
{
  await hit('/api/vault/lock');
  for (let i = 0; i < 5; i++) await hit('/api/vault/unlock', { body: { password: 'wrong guess ' + i } });
  const p = await hit('/api/vault/unlock', { body: { password: PW + ' v2' } });
  ok(p.status === 429 && p.json.code === 'paced' && p.json.retryInMs > 0 && p.json.state === 'locked', '5 wrong ⇒ the 6th is 429 paced — the right password too', p.json);
}

console.log('⑥ the audit, and no password anywhere');
{
  const audit = fs.readFileSync(path.join(dataDir, VE.AUDIT_FILE), 'utf8');
  const fails = audit.split('\n').filter((l) => l.includes('"vault-unlock-failed"'));
  ok(fails.length >= 6 && fails.every((l) => /"ip":"127\.0\.0\.1"/.test(l)), `every failure is an audit line with the caller's address (${fails.length})`);
  const all = [audit, LOGS.join('\n'), ANSWERS.join('\n'), frames.join('\n')].join('\n');
  const leaked = [PW, PW + ' v2', 'not the password', 'wrong guess 0', SIGN_IN].filter((s) => all.includes(s));
  ok(leaked.length === 0, 'no password — set, right, wrong or the sign-in one — in the audit, the log, any answer or any broadcast', leaked);
}

console.log('⑦ the broadcast');
ok(['unlocked', 'locked'].every((s) => frames.some((f) => JSON.parse(f).type === 'vault-state' && JSON.parse(f).state === s)), `vault-state on every change (${frames.length} frames)`);

console.log('⑧ agents');
{
  const s = await hit('/api/agent/vault/state', { method: 'GET', headers: { authorization: 'Bearer ' + SESSION_TOKEN } });
  ok(s.status === 200 && s.json.state === 'locked' && Object.keys(s.json).sort().join() === 'keys,lockedSince,setUpAt,state', 'an agent reads the state (state, since, setUpAt, key count — nothing else)', s.json);
  const bad = await hit('/api/agent/vault/state', { method: 'GET', headers: { authorization: 'Bearer vsst_' + 'f'.repeat(32) } });
  ok(bad.status === 401, 'an unknown session token ⇒ 401');
  vault.setIdleLock(0);
  const jobState = await hit('/api/agent/vault/state', { method: 'GET', headers: { authorization: 'Bearer jbt_live' } });
  ok(jobState.status === 200, 'a live job token reads it too');
  const ul = await hit('/api/agent/vault/unlock', { headers: { authorization: 'Bearer ' + SESSION_TOKEN }, body: { password: PW } });
  ok(ul.status === 404, 'there is no agent unlock door (404)');
  const lk2 = await hit('/api/agent/vault/lock', { headers: { authorization: 'Bearer ' + SESSION_TOKEN } });
  ok(lk2.status === 200 && lk2.json.state === 'locked', 'an agent may LOCK');
}

srv.close(); vault.close(); console.warn = warn0;
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
