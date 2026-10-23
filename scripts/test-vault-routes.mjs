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
//   ⑨ TWO-STEP CODES (design q-047 L1, lane vault-totp): the person doors (human_only / 401) — add (a link; refused by name),
//      preview (nothing stored), 看码 (the RFC code at the hub's clock, no-store, ONE audit line, paced 20 a minute), the seed
//      ONLY behind the reveal door (the otpauth link, audited vault-reveal); THE AGENT DOOR scoped: no grant ⇒ 403, a grant to
//      the conversation in THIS run ⇒ named fields only, another conversation / a new run ⇒ 403, a Task Group ⇒ its member,
//      a view ⇒ 409, a job / unknown token ⇒ 401, paced, LOCKED ⇒ 423, ✕ ⇒ refused again; delete takes its grants first (a
//      new seed under the old name is never covered); the seed in no answer but the reveal's, no audit, no log, no grants file
//   ⑩ MUTANTS (the same checks ⇒ RED): the agent door answers the SEED · no grant check · a grant outliving its run · a view
//      with no audit · the view pace forgotten · 看码 open to an agent token · a deleted entry's grants outliving it
//   ⑪ THE RUN DOORS (lane vault-run-door, design q-043 §8 P0-f): the BEARER may run (POST /api/agent/vault/run), a COOKIE may
//      not (401), a job token is refused (job_no_use); the switch (POST /api/vault/runnable) and the shape card's answer (POST
//      /api/vault/run/asks/:askId) are a PERSON's (any bearer human_only), ON / «always» behind this page's 验证是你 window; the
//      shape card answers and the run's output comes back scrubbed — no answer of the whole suite carries the value
//   ⑬ THE USE LAW (lane vault-use-law): a bearer refused at a person's door = one vault-use line naming it (its session /
//      job), the 20th in a day runs the owner's card once; the guess it sent is in no line
//   ⑭ A SLOW DOOR NAMES ITSELF (lane vault-slow-load — inc-mvk5jyv3 «保险库操作好像加载时间有点长», the server console had no
//      vault line at all): a door slower than 250 ms = ONE log line (method, the route's PATTERN, ms) — never a parameter, a
//      query, a password; a fast door says nothing; the agent doors too. RED CONTROL: the routes without the timer say nothing
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
const VC = require(path.join(REPO, 'src/server/vault-contents.js'));   // lane vault-run-door: the page's 验证是你 window (the switch, «always»)
const DOOR = require(path.join(REPO, 'src/server/vault-run-door.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
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
const REFUSED = [];   // lane vault-manual-and-lock: the refused answers alone (a run that RAN answers its receipt — design D1)
function hit(p, { method = 'POST', headers = PAGE, body, port = PORT } = {}) {
  return new Promise((resolve, reject) => {
    const b = method === 'GET' ? null : JSON.stringify(body || {});
    const h = { ...headers };
    if (b !== null) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(b); }
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: h }, (x) => {
      let d = ''; x.on('data', (c) => d += c);
      x.on('end', () => { ANSWERS.push(d); if (x.statusCode >= 400) REFUSED.push(d); let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: x.statusCode, json: j || {} }); });
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
  // lane agent-context-owner-facts (B-7960): + the hub's WORDS vibespace-vault prints — the lock time in the owner's zone, named, and the tray's label + place
  ok(s.status === 200 && s.json.state === 'locked' && Object.keys(s.json).sort().join() === 'keys,lockedSince,setUpAt,state,tray,when' && Object.keys(s.json.when).join() === 'lockedSince' && / [A-Z]{2,5}$| GMT[+-][\d:]+$/.test(s.json.when.lockedSince) && /^the “[^”]+”( \(For you\))? tray$/.test(s.json.tray),
    'an agent reads the state (state, since, setUpAt, key count — and the words it prints: when.lockedSince, tray — nothing else)', s.json);
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

// ── ⑨ TWO-STEP CODES (design q-047 L1, lane vault-totp — src/server/vault-totp.js over PURE src/totp.js) ──
const VT0 = require(path.join(REPO, 'src/server/vault-totp.js'));
const TP = require(path.join(REPO, 'src/totp.js'));
const at = (file) => (s) => s.replace(/require\((['"])(\.{1,2}\/[^'"]+)\1\)/g, (m, q, p) => `require(${JSON.stringify(path.resolve(path.join(REPO, path.dirname(file)), p))})`);
const hmacT = (a, k, m) => crypto.createHmac(String(a).toLowerCase(), k).update(m).digest();
const SEED = TP.base32Encode(crypto.randomBytes(20)), SEED_NEW = TP.base32Encode(crypto.randomBytes(20));   // planted seeds, built at runtime
const URI = `otpauth://totp/GitHub:owner%40example.com?secret=${SEED}&issuer=GitHub`;
/** One hub: the gate, the JSON body, the vault routes with the contents doors and the two-step doors; three sessions. */
async function totpHub(tag, { routesSrc = null, totpSrc = null } = {}) {
  const dir = path.join(ROOT, 'totp-' + tag); fs.mkdirSync(dir, { recursive: true });
  const au = new Auth(dir, {}); au.setPassword(SIGN_IN);
  let clock = Date.parse('2026-10-20T12:00:05Z');
  const lines = [];
  const v = VE.create({ dataDir: dir, kdf: { N: 1024, r: 8, p: 1 }, log: { log: (m) => lines.push(String(m)), warn: (m) => lines.push(String(m)) }, idleTimer: false, now: () => clock, register: false, signInPassword: (p) => au.verifyPassword(p), bcast: () => {} });
  await v.setup(PW);
  const load = (rel, src) => { if (!src) return require(path.join(REPO, rel)); const f = path.join(dir, path.basename(rel)); fs.writeFileSync(f, at(rel)(src)); return require(f); };
  const VC = require(path.join(REPO, 'src/server/vault-contents.js'));
  const contents = VC.create({ vault: v, sources: { secrets: () => VC.secretSource({ vault: v }) }, now: () => clock, mono: () => clock });
  const totp = load('src/server/vault-totp.js', totpSrc).create({ dataDir: dir, vault: v, now: () => clock, log: (m) => lines.push(String(m)) });
  const tok = () => 'vsst_' + crypto.randomBytes(16).toString('hex');
  const sessions = new Map([['s1', { agentToken: tok(), backendSessionId: 'conv-1', groups: [] }], ['s2', { agentToken: tok(), backendSessionId: 'conv-2', groups: ['T-1'] }], ['s3', { agentToken: tok(), backendSessionId: 'conv-3', isTmuxView: true, groups: [] }]]);
  const callerOf = (token) => { for (const s of sessions.values()) if (s.agentToken === token) return { conversationId: s.backendSessionId, live: !s.isTmuxView, groups: s.groups }; return null; };
  const runOf = (cid) => { for (const s of sessions.values()) if (!s.isTmuxView && s.backendSessionId === cid) return VT0.runOfToken(s.agentToken); return null; };
  const a = express();
  a.use(au.middleware()); au.registerRoutes(a); a.use(express.json());
  load('src/routes/vault.js', routesSrc).registerVaultRoutes(a, { vault: v, activeSessions: sessions, getJobs: () => ({ jobByToken: (t) => (t === 'jbt_live' ? { id: 'j1' } : null) }), contents, who: (req) => Auth.signInHandle(req),
    totp, callerOf, runOf, grantLive: (g) => !g.subject.startsWith('session:') || runOf(g.subject.slice(8)) === g.run, subjects: () => ({ sessions: [...sessions.values()].filter((s) => !s.isTmuxView).map((s) => ({ subject: `session:${s.backendSessionId}`, name: s.backendSessionId })), groups: [{ subject: 'group:T-1', name: 'T-1' }] }) });
  const s = await new Promise((r) => { const x = a.listen(0, '127.0.0.1', () => r(x)); });
  const port = s.address().port, own = `http://127.0.0.1:${port}`;
  const page = { cookie: `vs_token=${au.issueToken('owner')}`, 'sec-fetch-site': 'same-origin', origin: own };
  const answers = [];
  const go = (p, { method = 'GET', headers = page, body } = {}) => new Promise((resolve, reject) => {
    const b = method === 'GET' ? null : JSON.stringify(body || {});
    const h = { ...headers };
    if (b !== null) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(b); }
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: h }, (x) => {
      let d = ''; x.on('data', (c) => d += c);
      x.on('end', () => { answers.push({ p, d }); let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: x.statusCode, json: j || {}, raw: d, cache: x.headers['cache-control'] || '' }); });
    });
    r.on('error', reject); r.end(b === null ? undefined : b);
  });
  const agent = (token, name = 'github-owner') => go(`/api/agent/vault/totp/${encodeURIComponent(name)}`, { headers: { authorization: 'Bearer ' + token } });
  const expect = (seed = SEED) => TP.totp(TP.base32Decode(seed).bytes, { now: clock, hmac: hmacT }).code;
  const audit = () => { try { return fs.readFileSync(path.join(dir, VE.AUDIT_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return { dir, vault: v, sessions, go, agent, page, answers, lines, expect, audit, step: (ms) => { clock += ms; }, close: () => { v.close(); s.close(); } };
}
/** THE CHECKS, in order on one hub (the shipped tree passes every one; each mutant must fail at least one). */
const TOTP_CHECKS = [
  ['the person doors refuse an agent token (human_only) and a missing sign-in (401) — list, add, view, delete, grant', async (H) => {
    const bearer = { ...H.page, authorization: 'Bearer ' + H.sessions.get('s1').agentToken };
    const rs = await Promise.all([H.go('/api/vault/totp', { headers: bearer }), H.go('/api/vault/totp', { method: 'POST', headers: bearer, body: { uri: URI } }), H.go('/api/vault/totp/github-owner', { headers: bearer }), H.go('/api/vault/totp/github-owner', { method: 'DELETE', headers: bearer }), H.go('/api/vault/totp/github-owner/grants', { method: 'POST', headers: bearer, body: { subjects: ['session:conv-1'] } })]);
    const anon = await H.go('/api/vault/totp/github-owner', { headers: { 'sec-fetch-site': 'same-origin' } });
    return rs.every((r) => r.status === 403 && r.json.code === 'human_only') && anon.status === 401;
  }],
  ['添加: an otpauth link ⇒ 200 and its default name (github-owner); the answer carries no seed', async (H) => {
    const r = await H.go('/api/vault/totp', { method: 'POST', body: { uri: URI } });
    return r.status === 200 && r.json.name === 'github-owner' && r.json.entry === 'totp:github-owner' && !r.raw.includes(SEED) && H.audit().some((l) => l.event === 'vault-totp-add' && l.entry === 'totp:github-owner' && l.source === 'paste' && l.ip === '127.0.0.1');
  }],
  ['添加 refused by name: the same name ⇒ 409 exists · a hotp link ⇒ 400 hotp_unsupported · a 40-bit seed ⇒ 400 seed_too_short', async (H) => {
    const a = await H.go('/api/vault/totp', { method: 'POST', body: { uri: URI } });
    const b = await H.go('/api/vault/totp', { method: 'POST', body: { uri: `otpauth://hotp/x?secret=${SEED}&counter=0` } });
    const c = await H.go('/api/vault/totp', { method: 'POST', body: { seed: 'JBSWY3DP', name: 'short' } });
    return a.status === 409 && a.json.code === 'exists' && b.status === 400 && b.json.code === 'hotp_unsupported' && c.status === 400 && c.json.code === 'seed_too_short';
  }],
  ['preview: the code a typed seed makes and the name it would take — nothing stored', async (H) => {
    const r = await H.go('/api/vault/totp', { method: 'POST', body: { seed: SEED_NEW, issuer: 'Cloudflare', account: 'dash', digits: 6, period: 30, algorithm: 'SHA1', preview: true } });
    const list = await H.go('/api/vault/totp');
    return r.status === 200 && r.json.preview === true && r.json.name === 'cloudflare-dash' && r.json.code === H.expect(SEED_NEW) && !r.raw.includes(SEED_NEW) && list.json.entries.map((e) => e.name).join() === 'github-owner';
  }],
  ['看码: the CURRENT code (RFC 6238 at the hub\'s clock), the seconds left, the period — no 「验证是你」, never cached', async (H) => {
    const r = await H.go('/api/vault/totp/github-owner');
    return r.status === 200 && r.json.code === H.expect() && r.json.secondsLeft === 25 && r.json.period === 30 && /no-store/.test(r.cache) && !r.raw.includes(SEED);
  }],
  ['every view is ONE audit line vault-totp-view {who, ip, entry, by: human} — never the code', async (H) => {
    const code = H.expect();
    const v = H.audit().filter((l) => l.event === 'vault-totp-view');
    return v.length === 1 && v[0].entry === 'totp:github-owner' && v[0].by === 'human' && v[0].ip === '127.0.0.1' && typeof v[0].who === 'string' && !JSON.stringify(v).includes(code);
  }],
  ['THE PACE: 20 views a minute per sign-in ⇒ the 21st is 429 paced (audited vault-totp-paced); a minute on ⇒ answered', async (H) => {
    for (let i = 0; i < 19; i++) await H.go('/api/vault/totp/github-owner');
    const p = await H.go('/api/vault/totp/github-owner');
    H.step(61e3);
    const again = await H.go('/api/vault/totp/github-owner');
    return p.status === 429 && p.json.code === 'paced' && H.audit().some((l) => l.event === 'vault-totp-paced') && again.status === 200 && again.json.code === H.expect();
  }],
  ['THE SEED behind the reveal door only: no window ⇒ 403 reveal_needs_password; the second password ⇒ its otpauth link (the seed + every setting), audited vault-reveal', async (H) => {
    const id = 'secrets:totp:github-owner#seed';
    const no = await H.go('/api/vault/reveal', { method: 'POST', body: { id } });
    const w = await H.go('/api/vault/reveal-session', { method: 'POST', body: { password: PW } });
    const r = await H.go('/api/vault/reveal', { method: 'POST', body: { id, page: w.json.page } });
    return no.status === 403 && no.json.code === 'reveal_needs_password' && r.status === 200 && r.json.value === `otpauth://totp/GitHub:owner%40example.com?secret=${SEED}&issuer=GitHub&algorithm=SHA1&digits=6&period=30` && H.audit().some((l) => l.event === 'vault-reveal' && l.entry === 'totp:github-owner' && l.field === 'seed');
  }],
  ['the AGENT door with no grant ⇒ 403 not_granted (an audit line vault-totp-use ok:false) — and a name it never had says the same', async (H) => {
    const r = await H.agent(H.sessions.get('s1').agentToken);
    const ghost = await H.agent(H.sessions.get('s1').agentToken, 'no-such-code');
    const u = H.audit().filter((l) => l.event === 'vault-totp-use');
    return r.status === 403 && r.json.code === 'not_granted' && ghost.status === 403 && ghost.json.code === 'not_granted' && u.length === 2 && u.every((l) => l.ok === false && l.code === 'not_granted' && l.subject === 'session:conv-1' && l.by === 'agent');
  }],
  ['用于… conversation conv-1 ⇒ ITS token gets { ok, name, code, secondsLeft, period } — named fields only, never the seed', async (H) => {
    const g = await H.go('/api/vault/totp/github-owner/grants', { method: 'POST', body: { subjects: ['session:conv-1'] } });
    const r = await H.agent(H.sessions.get('s1').agentToken);
    return g.status === 200 && g.json.added.length === 1 && !('run' in g.json.added[0]) && r.status === 200 && Object.keys(r.json).join() === 'ok,name,code,secondsLeft,period' && r.json.code === H.expect() && /no-store/.test(r.cache)
      && H.audit().some((l) => l.event === 'vault-totp-use' && l.ok === true && l.via === 'session:conv-1' && !('code' in l)) && H.audit().some((l) => l.event === 'vault-totp-grant' && l.subject === 'session:conv-1');
  }],
  ['SCOPED: another conversation ⇒ 403; the same conversation in a NEW run (it ended and came back: a new token) ⇒ 403 — the grant was that run\'s', async (H) => {
    const other = await H.agent(H.sessions.get('s2').agentToken);
    const s1 = H.sessions.get('s1'), old = s1.agentToken;
    s1.agentToken = 'vsst_' + crypto.randomBytes(16).toString('hex');
    const reborn = await H.agent(s1.agentToken);
    const list = await H.go('/api/vault/totp');
    s1.agentToken = old;
    const back = await H.agent(old);
    return other.status === 403 && other.json.code === 'not_granted' && reborn.status === 403 && reborn.json.code === 'not_granted' && list.json.entries[0].grants[0].live === false && back.status === 200;
  }],
  ['a Task Group grant ⇒ its member conversation gets the code; a view (not running) ⇒ 409 not_running; a job token, an unknown token ⇒ 401', async (H) => {
    await H.go('/api/vault/totp/github-owner/grants', { method: 'POST', body: { subjects: ['group:T-1'] } });
    const m = await H.agent(H.sessions.get('s2').agentToken);
    const view = await H.agent(H.sessions.get('s3').agentToken);
    const job = await H.agent('jbt_live');
    const unk = await H.agent('vsst_' + 'f'.repeat(32));
    return m.status === 200 && m.json.code === H.expect() && view.status === 409 && view.json.code === 'not_running' && job.status === 401 && unk.status === 401;
  }],
  ['用于… a conversation that is not running ⇒ 409 not_running; not a subject ⇒ 400', async (H) => {
    const a = await H.go('/api/vault/totp/github-owner/grants', { method: 'POST', body: { subjects: ['session:conv-9'] } });
    const b = await H.go('/api/vault/totp/github-owner/grants', { method: 'POST', body: { subjects: ['external'] } });
    return a.status === 409 && a.json.code === 'not_running' && b.status === 400 && b.json.code === 'bad_args';
  }],
  ['the AGENT pace: 20 answers a minute per conversation ⇒ 429 paced', async (H) => {
    H.step(61e3);
    let last = null;
    for (let i = 0; i < 21; i++) last = await H.agent(H.sessions.get('s1').agentToken);
    H.step(61e3);
    return last.status === 429 && last.json.code === 'paced' && (await H.agent(H.sessions.get('s1').agentToken)).status === 200;
  }],
  ['LOCKED ⇒ the agent door and 看码 answer 423 vault_locked; unlocked ⇒ answered again', async (H) => {
    H.vault.lock('test');
    const a = await H.agent(H.sessions.get('s1').agentToken);
    const p = await H.go('/api/vault/totp/github-owner');
    await H.vault.unlock(PW);
    const b = await H.agent(H.sessions.get('s1').agentToken);
    return a.status === 423 && a.json.code === 'vault_locked' && p.status === 423 && b.status === 200;
  }],
  ['the ✕ (ungrant) ⇒ that conversation is refused again', async (H) => {
    const list = await H.go('/api/vault/totp');
    const g = list.json.entries[0].grants.find((x) => x.subject === 'session:conv-1');
    const d = await H.go(`/api/vault/totp/grants/${g.id}`, { method: 'DELETE' });
    const r = await H.agent(H.sessions.get('s1').agentToken);
    return d.status === 200 && r.status === 403 && r.json.code === 'not_granted';
  }],
  ['删除 ⇒ its grants go first, then the entry; the same name re-added with a NEW seed is NOT covered by the old Task Group grant', async (H) => {
    const d = await H.go('/api/vault/totp/github-owner', { method: 'DELETE' });
    const file = JSON.parse(fs.readFileSync(path.join(H.dir, VT0.GRANTS_FILE), 'utf8'));
    const gone = await H.go('/api/vault/totp/github-owner');
    const re = await H.go('/api/vault/totp', { method: 'POST', body: { seed: SEED_NEW, name: 'github-owner' } });
    const m = await H.agent(H.sessions.get('s2').agentToken);
    return d.status === 200 && file.grants.length === 0 && gone.status === 404 && re.status === 200 && m.status === 403 && m.json.code === 'not_granted';
  }],
  ['THE SEED in no answer but the reveal\'s, no audit line, no log; data/vault-grants.json 0600 holds no seed, no code', async (H) => {
    const leak = H.answers.filter((x) => !x.p.startsWith('/api/vault/reveal') && (x.d.includes(SEED) || x.d.includes(SEED_NEW)));
    const f = path.join(H.dir, VT0.GRANTS_FILE);
    const txt = fs.readFileSync(f, 'utf8'), aud = fs.readFileSync(path.join(H.dir, VE.AUDIT_FILE), 'utf8');
    return leak.length === 0 && ![SEED, SEED_NEW].some((s) => aud.includes(s) || txt.includes(s) || H.lines.join('\n').includes(s)) && (fs.statSync(f).mode & 0o777) === 0o600;
  }],
];
console.log('⑨ two-step codes (design q-047 L1)');
{
  const H = await totpHub('shipped');
  for (const [name, fn] of TOTP_CHECKS) { let r = false; try { r = await fn(H); } catch (e) { r = false; console.error('    threw: ' + e.message); } ok(r, name); }
  H.close();
}

console.log('⑩ MUTANTS — each RED');
{
  const TS = fs.readFileSync(path.join(REPO, 'src/server/vault-totp.js'), 'utf8');
  const RS = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8');
  const mutants = [
    ['the agent door answers the SEED', {
      totpSrc: TS.replace('return { ok: true, name: String(name), code: r.code, secondsLeft: r.secondsLeft, period: r.period };', 'return { ok: true, name: String(name), code: r.code, secondsLeft: r.secondsLeft, period: r.period, seed: withRecord(entry, (rec) => ({ ok: true, seed: rec.seed })).seed };'),
      routesSrc: RS.replace('return r.ok ? res.json({ ok: true, name: r.name, code: r.code, secondsLeft: r.secondsLeft, period: r.period }) : answer(res, r);', 'return r.ok ? res.json(r) : answer(res, r);') }],
    ['the agent door without the grant', { totpSrc: TS.replace('const v = T.useVerdict({ grants, entry, caller, vaultState: vaultState() });', "const v = vaultState() === 'unlocked' ? { ok: true, grant: { subject: 'none' } } : T.useVerdict({ grants, entry, caller, vaultState: vaultState() });") }],
    ['a conversation\'s grant outlives its run', { totpSrc: TS.replace('const v = T.useVerdict({ grants, entry, caller, vaultState: vaultState() });', 'const v = T.useVerdict({ grants: grants.map((g) => (g.run ? { ...g, run: caller && caller.run } : g)), entry, caller, vaultState: vaultState() });') }],
    ['a view with no audit line', { totpSrc: TS.replace("    vault.audit('vault-totp-view', { who: w, ip, by: 'human', entry });\n", '') }],
    ['the view pace forgotten', { totpSrc: TS.replace('const p = VI.paceVerdict(mine, t, T.VIEW_PACE_MAX);', 'const p = { ok: true };').replace('const c = p.ok ? VI.paceVerdict(viewAll, t, T.VIEW_PACE_CEILING) : p;', 'const c = p;') }],
    ['看码 lets an agent token through', { routesSrc: RS.replace("app.get('/api/vault/totp/:name', noStore(person((req) => totp.view(whoT(req), req.params.name, { ip: ipOf(req) }))));", "app.get('/api/vault/totp/:name', noStore((req, res) => answer(res, totp.view(whoT(req), req.params.name, { ip: ipOf(req) }))));") }],
    ['a deleted entry\'s grants outlive it (a new seed under the old name is covered)', { totpSrc: TS.replace('    if (!dropGrantsOf(entry)) return named(\'failed\', `${GRANTS_FILE} could not be read or written — nothing was deleted`);\n', '').replace('    if (!dropGrantsOf(entry)) return named(\'failed\', `${GRANTS_FILE} could not be read or written — nothing is stored`);   // a stale grant never covers a new seed\n', '') }],
  ];
  for (const [name, m] of mutants) {
    const applied = (!m.totpSrc || m.totpSrc !== TS) && (!m.routesSrc || m.routesSrc !== RS);
    const H = await totpHub('m-' + name.replace(/\W+/g, '-').slice(0, 40), m);
    const red = [];
    for (const [cn, fn] of TOTP_CHECKS) { let r = false; try { r = await fn(H); } catch { r = false; } if (!r) red.push(cn.slice(0, 70)); }
    H.close();
    ok(applied && red.length > 0, `RED: ${name} (${applied ? red[0] || 'NOT CAUGHT' : 'the mutant did not apply'})`);
  }
}

console.log('⑪ the run doors — the bearer may run, a cookie may not; the shape card answers (lane vault-run-door)');
const hit0 = hit, PAGE0 = PAGE;
{
  // ITS OWN WORLD: a fresh engine (the legs above leave theirs paced, its password changed), the For-you store, a storage row,
  // the Vault window's contents (the page's 验证是你 window), the run door on a CLUSTER instance (every run asks), a fake curl
  // first on the child's PATH — behind the same sign-in gate, on its own port
  const dataDir2 = path.join(ROOT, 'data2'), WORK = path.join(ROOT, 'work'), RUNROOT = path.join(ROOT, 'run'), BIN = path.join(ROOT, 'bin');
  for (const d of [dataDir2, WORK, RUNROOT, BIN]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(BIN, 'curl'), `#!/usr/bin/env node\nprocess.stdout.write('curl got ' + process.env.T + '\\n');\n`, { mode: 0o555 });
  fs.chmodSync(BIN, 0o555);   // a program no agent could have written («always» is offered only for one) — given back at the end
  const RUNV = 'route-run-value-0123456789';
  const mountsSrc = { vaultRows: () => [{ entry: 'm1', field: 'secretKey', label: 'bucket', cipher: 'x'.repeat(60) }], vaultReveal: (e, f) => (e === 'm1' && f === 'secretKey' ? RUNV : null) };
  const vault2 = VE.create({ dataDir: dataDir2, kdf: { N: 1024, r: 8, p: 1 }, log, idleTimer: false, register: false, signInPassword: (p) => auth.verifyPassword(p) });
  const userTodos = new UserTodoManager({ dataDir: dataDir2, expirySweepMs: 3600e3 });
  const contents = VC.create({ vault: vault2, sources: { mounts: () => mountsSrc }, runFacts: (row) => runDoor.rowFacts(row) });
  const runDoor = DOOR.create({ dataDir: dataDir2, vault: vault2, sources: { mounts: () => mountsSrc }, userTodos, instanceKind: () => 'cluster', runRoot: () => RUNROOT, agentEnv: () => ({ ...process.env, PATH: BIN + ':' + process.env.PATH }), log: (m) => LOGS.push(String(m)) });
  const sessions2 = new Map([['s1', { agentToken: SESSION_TOKEN, backendSessionId: 'conv-r1', name: 'Route Lane', cwd: WORK }]]);
  const app2 = express();
  app2.use(auth.middleware());
  app2.use(express.json());
  registerVaultRoutes(app2, { vault: vault2, activeSessions: sessions2, getJobs: () => ({ jobByToken: (t) => (t === 'jbt_live' ? { id: 'j1' } : null) }), contents, run: runDoor });
  const srv2 = await new Promise((r) => { const x = app2.listen(0, '127.0.0.1', () => r(x)); });
  const P2 = srv2.address().port, OWN2 = `http://127.0.0.1:${P2}`;
  const PAGE2 = { ...PAGE0, origin: OWN2 };
  const hit = (p, o = {}) => hit0(p, { headers: PAGE2, ...o, port: P2 });
  const PAGE = PAGE2;
  const B = { authorization: 'Bearer ' + SESSION_TOKEN };
  const su = await hit('/api/vault/setup', { body: { password: PW } });
  ok(su.status === 200 && vault2.state() === 'unlocked', 'a person sets this world\'s vault up (the run legs)', su.json);
  const ARGS = ['--env', 'T=vault://mounts/m1/secretKey', '--', process.execPath, '-e', 'console.log("got " + process.env.T)'];
  const ck = await hit('/api/agent/vault/run', { body: { args: ARGS, cwd: WORK } });
  ok(ck.status === 401 && ck.json.code === 'unauthorized', 'a COOKIE may not run — no bearer ⇒ 401 (only a conversation\'s own session token runs)', ck.json);
  const jb = await hit('/api/agent/vault/run', { headers: { authorization: 'Bearer jbt_live' }, body: { args: ARGS, cwd: WORK } });
  ok(jb.status === 403 && jb.json.code === 'job_no_use', 'a Background Work job token ⇒ 403 job_no_use', jb.json);
  const bad = await hit('/api/agent/vault/run', { headers: { authorization: 'Bearer vsst_' + 'f'.repeat(32) }, body: { args: ARGS, cwd: WORK } });
  ok(bad.status === 401, 'an unknown session token ⇒ 401');
  const no = await hit('/api/agent/vault/run', { headers: B, body: { args: ARGS, cwd: WORK } });
  ok(no.status === 403 && no.json.code === 'entry_not_runnable' && /Usable by agent runs/.test(no.json.error), 'the BEARER may run — an entry the owner has not opened ⇒ 403 entry_not_runnable, by name', no.json);
  const swB = await hit('/api/vault/runnable', { headers: { ...PAGE, ...B }, body: { id: 'mounts:m1#secretKey', on: true } });
  ok(swB.status === 403 && swB.json.code === 'human_only', 'an agent never opens an entry for runs (human_only)', swB.json);
  const sw0 = await hit('/api/vault/runnable', { body: { id: 'mounts:m1#secretKey', on: true } });
  ok(sw0.status === 403 && sw0.json.code === 'reveal_needs_password', 'a person switching ON without this page\'s 验证是你 window ⇒ 403 reveal_needs_password', sw0.json);
  const rs = await hit('/api/vault/reveal-session', { body: { password: PW } });
  const page = rs.json.page;
  const sw1 = await hit('/api/vault/runnable', { body: { id: 'mounts:m1#secretKey', on: true, page } });
  ok(rs.status === 200 && sw1.status === 200 && sw1.json.open === true, '验证是你 (the second password again) ⇒ ON', sw1.json);
  const cont = await hit('/api/vault/contents', { method: 'GET', headers: PAGE });
  const row = (cont.json.rows || []).find((x) => x.id === 'mounts:m1#secretKey');
  ok(row && row.run && row.run.can === true && row.run.open === true, 'the Vault window\'s row says so (run: can, open)', row);
  const list = await hit('/api/agent/vault/runnable', { method: 'GET', headers: B });
  ok(list.status === 200 && list.json.entries.length === 1 && list.json.entries[0].ref === 'vault://mounts/m1/secretKey' && !JSON.stringify(list.json).includes(RUNV), 'GET /api/agent/vault/runnable names the opened entry (a reference, a label) — never its value', list.json);
  const listCk = await hit('/api/agent/vault/runnable', { method: 'GET', headers: PAGE });
  ok(listCk.status === 401, '…and a cookie gets nothing (401)');
  const waitCard = async () => { for (let i = 0; i < 300; i++) { const c = (userTodos.snapshot().open || []).find((x) => x.action && x.action.type === 'vault-run-ask'); if (c) return c; await new Promise((r) => setTimeout(r, 10)); } return null; };
  const pr = hit('/api/agent/vault/run', { headers: B, body: { args: ARGS, cwd: WORK } });
  const card = await waitCard();
  const byAgent = await hit(`/api/vault/run/asks/${card.action.askId}`, { headers: { ...PAGE, ...B }, body: { answer: 'once' } });
  ok(byAgent.status === 403 && byAgent.json.code === 'human_only', 'an agent never answers the shape card (human_only)', byAgent.json);
  const onceNoWin = await hit(`/api/vault/run/asks/${card.action.askId}`, { body: { answer: 'once' } });
  ok(onceNoWin.status === 403 && onceNoWin.json.code === 'reveal_needs_password', 'q-043 H1 (sign-in-off): 允许一次 WITHOUT this page\'s 验证是你 window ⇒ 403 reveal_needs_password — a local shell cannot forge its OWN card\'s Allow once (the card stays up)', onceNoWin.json);
  const once = await hit(`/api/vault/run/asks/${card.action.askId}`, { body: { answer: 'once', page } });
  const r = await pr;
  ok(once.status === 200 && once.json.outcome === 'allowed' && r.status === 200 && r.json.ok === true && r.json.stdout === 'got [vault:mounts/m1/secretKey]\n', 'the shape card answers: a PERSON\'s 允许一次 ⇒ the bearer\'s run answers 200, its output SCRUBBED', [once.json.outcome, r.json]);
  const again = await hit(`/api/vault/run/asks/${card.action.askId}`, { body: { answer: 'once', page } });
  ok(again.status === 409 && again.json.code === 'ask_settled', 'a second answer ⇒ 409 ask_settled', again.json);
  const CURL = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/x'];
  const pr2 = hit('/api/agent/vault/run', { headers: B, body: { args: CURL, cwd: WORK } });
  const card2 = await waitCard();
  const al0 = await hit(`/api/vault/run/asks/${card2.action.askId}`, { body: { answer: 'always' } });
  ok(al0.status === 403 && al0.json.code === 'reveal_needs_password', '此形状总是 WITHOUT this page\'s 验证是你 window ⇒ 403 reveal_needs_password (the card stays up)', al0.json);
  const al1 = await hit(`/api/vault/run/asks/${card2.action.askId}`, { body: { answer: 'always', page } });
  const r2 = await pr2;
  ok(al1.status === 200 && al1.json.outcome === 'always' && r2.status === 200 && r2.json.by === 'always' && r2.json.stdout === 'curl got [vault:mounts/m1/secretKey]\n', '…WITH it ⇒ 200 always, the run answers', [al1.json, r2.json.by]);
  const r3 = await hit('/api/agent/vault/run', { headers: B, body: { args: ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/y'], cwd: WORK } });
  ok(r3.status === 200 && r3.json.by === 'always' && !(userTodos.snapshot().open || []).some((x) => x.action && x.action.type === 'vault-run-ask'), 'the same shape (another positional) then runs without a card, on a cluster too', r3.json.by);
  // lane vault-manual-and-lock (design D4): REQUEST — the bearer may, a cookie may not; the ask lands ONCE; a person answers;
  // the grant row is honoured by the run verdict; USES reads this conversation's own lines back
  const off = await hit('/api/vault/runnable', { body: { id: 'mounts:m1#secretKey', on: false } });
  const closed = await hit('/api/agent/vault/run', { headers: B, body: { args: CURL, cwd: WORK } });
  ok(off.status === 200 && off.json.open === false && closed.status === 403 && closed.json.code === 'entry_not_runnable' && /vibespace-vault request/.test(closed.json.error), 'the entry switched OFF (no 验证是你 needed to close) ⇒ the run is refused entry_not_runnable, naming `vibespace-vault request`', closed.json);
  const REQ = { entry: 'vault://mounts/m1/secretKey', purpose: 'sync the bucket for the nightly report' };
  const rqC = await hit('/api/agent/vault/request', { body: REQ });
  const rqJ = await hit('/api/agent/vault/request', { headers: { authorization: 'Bearer jbt_live' }, body: REQ });
  ok(rqC.status === 401 && rqC.json.code === 'unauthorized' && rqJ.status === 403 && rqJ.json.code === 'job_no_use', 'REQUEST: a COOKIE may not ask (401 — only a conversation\'s own token), a job token ⇒ 403 job_no_use', [rqC.json.code, rqJ.json.code]);
  const asksOf = () => (userTodos.snapshot().open || []).filter((x) => x.action && x.action.type === 'vault-grant-ask');
  const rq1 = await hit('/api/agent/vault/request', { headers: B, body: REQ });
  const rq2 = await hit('/api/agent/vault/request', { headers: B, body: { ...REQ, purpose: 'please' } });
  ok(rq1.status === 200 && rq1.json.ok && rq1.json.askId && rq2.status === 409 && rq2.json.code === 'request_pending' && asksOf().length === 1 && asksOf()[0].detail.includes(REQ.purpose) && asksOf()[0].text === 'Route Lane asks to use a stored secret',
    'the BEARER may ask: the ask lands ONCE in For you (the agent, the entry, the purpose); a second request for the same entry while it is open ⇒ 409 request_pending', [rq1.json, rq2.json.code]);
  const usC = await hit('/api/agent/vault/uses', { method: 'GET', headers: PAGE });
  const us1 = await hit('/api/agent/vault/uses', { method: 'GET', headers: B });
  ok(usC.status === 401 && us1.status === 200 && us1.json.requests.length === 1 && us1.json.requests[0].entry === REQ.entry && Array.isArray(us1.json.uses) && !us1.json.grants.length, 'USES: the bearer reads its open request back; a cookie gets nothing (401)', us1.json);
  const ansB = await hit(`/api/vault/request/asks/${rq1.json.askId}`, { headers: { ...PAGE, ...B }, body: { answer: 'once' } });
  ok(ansB.status === 403 && ansB.json.code === 'human_only', 'an agent never answers a request (human_only)', ansB.json);
  const ans0 = await hit(`/api/vault/request/asks/${rq1.json.askId}`, { body: { answer: 'once' } });
  ok(ans0.status === 403 && ans0.json.code === 'reveal_needs_password' && asksOf().length === 1, 'a person\'s Allow WITHOUT this page\'s 验证是你 ⇒ 403 reveal_needs_password, the ask stays (a grant opens the entry as the switch does — never a bare click a local process could forge)', ans0.json);
  const ans = await hit(`/api/vault/request/asks/${rq1.json.askId}`, { body: { answer: 'once', page } });
  ok(ans.status === 200 && ans.json.outcome === 'granted-once' && !asksOf().length, 'WITH it (Allow once) ⇒ the grant row; the ask resolved', ans.json);
  const prG = hit('/api/agent/vault/run', { headers: B, body: { args: ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/z'], cwd: WORK } });
  const cardG = await waitCard();
  await hit(`/api/vault/run/asks/${cardG.action.askId}`, { body: { answer: 'once', page } });   // int331 seam: q-043 H1 (int330) — a sign-in-off hub's run-card «once» demands this page's 验证是你 window too (the grant opened the ENTRY; the shape card is still answered with the window)
  const rG = await prG;
  ok(rG.status === 200 && rG.json.ok && rG.json.stdout === 'curl got [vault:mounts/m1/secretKey]\n' && /^vr-[0-9a-f]{16}$/.test(rG.json.receipt), 'THE GRANT ROW IS HONOURED BY THE RUN VERDICT: the closed entry runs for that conversation (the cluster still shows the run card), scrubbed, with its receipt', rG.json);
  const rG2 = await hit('/api/agent/vault/run', { headers: B, body: { args: CURL, cwd: WORK } });
  const us2 = await hit('/api/agent/vault/uses', { method: 'GET', headers: B });
  ok(rG2.status === 403 && rG2.json.code === 'entry_not_runnable' && us2.json.uses.some((u) => u.receipt === rG.json.receipt && u.purpose === REQ.purpose && u.outcome === 'ok' && u.door === 'run') && !JSON.stringify(us2.json).includes(RUNV),
    'once was once (the next run is refused); USES reads the run back — the entry, its purpose, the outcome, the same receipt — never a value', us2.json.uses && us2.json.uses.slice(0, 2));
  // B-4934 (q-043 verify L2): the hub-wide bound counts CONVERSATIONS — 32 asking at once, the 33rd refused BY NAME over the
  // route (429 too_many_askers); past 8 asking, the owner's For you holds ONE Vault notice «N conversations are asking»
  const CAPS = Array.from({ length: 33 }, () => 'vsst_' + crypto.randomBytes(16).toString('hex'));
  CAPS.forEach((tok, k) => sessions2.set('cap' + k, { agentToken: tok, backendSessionId: 'conv-cap' + k, name: 'Cap Lane ' + k, cwd: WORK }));
  const capAsk = (k) => hit('/api/agent/vault/request', { headers: { authorization: 'Bearer ' + CAPS[k] }, body: { entry: REQ.entry, purpose: 'the cap leg ' + k } });
  const lineOf = () => (userTodos.snapshot().open || []).filter((i) => i.sessionKey === 'vault' && i.text === DOOR.ASKING_TEXT);
  const cap8 = []; for (let k = 0; k < 8; k++) cap8.push(await capAsk(k));
  ok(cap8.every((x) => x.status === 200 && x.json.ok) && !lineOf().length, 'THE CAP (B-4934): eight conversations asking ⇒ every ask filed, no «are asking» line (8 is not more than 8)', cap8.map((x) => x.status));
  const cap9 = await capAsk(8);
  ok(cap9.status === 200 && lineOf().length === 1 && lineOf()[0].i18n.text.params.n === 9 && lineOf()[0].origin === 'vault' && lineOf()[0].kind === 'notice', 'the NINTH conversation ⇒ filed (200); the owner\'s For you holds ONE Vault notice «9 conversations are asking to use stored secrets»', [cap9.status, lineOf().map((i) => i.i18n.text.params.n)]);
  const capRest = []; for (let k = 9; k < 32; k++) capRest.push(await capAsk(k));
  const cap33 = await capAsk(32);
  ok(capRest.every((x) => x.status === 200) && cap33.status === 429 && cap33.json.code === 'too_many_askers' && cap33.json.error === DOOR.MORE_WORDS.too_many_askers && lineOf().length === 1 && lineOf()[0].i18n.text.params.n === 32,
    '32 conversations asking ⇒ the 33rd ⇒ 429 too_many_askers BY NAME (its words: nothing was filed, ask again once some are answered); the one line says 32', [cap33.status, cap33.json, lineOf().map((i) => i.i18n.text.params.n)]);
  ok(!ANSWERS.some((a) => a.includes(RUNV)), 'no answer of this whole suite carries the value (every route, every refusal, every run)');
  srv2.close(); vault2.close();
  try { fs.chmodSync(BIN, 0o755); } catch { }
}


console.log('⑫ agents: mint / put in their own namespace (q-043 §9, lane vault-mint-put)');
{
  const Mod = require('module');
  const d2 = path.join(ROOT, 'data9'); fs.mkdirSync(d2);
  fs.writeFileSync(path.join(d2, '.accounts-key'), crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  const auth2 = new Auth(d2, {}); auth2.setPassword('sign-in-nine-9');
  const v2 = VE.create({ dataDir: d2, kdf: { N: 1024, r: 8, p: 1 }, log, idleTimer: false, register: false, signInPassword: (p) => auth2.verifyPassword(p) });
  await v2.setup('second password nine');
  const TOK = 'vsst_' + crypto.randomBytes(16).toString('hex');
  const JTOK = 'jbt_nine';
  const sessions2 = new Map([['conv-NINE', { agentToken: TOK, _webuiId: 'conv-NINE', name: 'Chat Nine' }]]);
  const getJobs2 = () => ({ jobByToken: (t) => (t === JTOK ? { id: 'j9', name: 'Job Nine' } : null) });
  const VC = require(path.join(REPO, 'src/server/vault-contents.js'));
  const contents2 = VC.create({ vault: v2, sources: { secrets: () => VC.secretSource({ vault: v2 }) } });
  const app2 = express(); app2.use(auth2.middleware()); auth2.registerRoutes(app2); app2.use(express.json());
  registerVaultRoutes(app2, { vault: v2, activeSessions: sessions2, getJobs: getJobs2, contents: contents2, who: () => 'owner' });
  const srv2 = await new Promise((r) => { const sv = app2.listen(0, '127.0.0.1', () => r(sv)); });
  const P2 = srv2.address().port;
  const H = (p, { method = 'POST', bearer = TOK, body, query = '', cookie = null, sfs = null } = {}) => new Promise((resolve, reject) => {
    const b = method === 'GET' ? null : JSON.stringify(body || {});
    const h = {}; if (bearer) h.authorization = 'Bearer ' + bearer; if (cookie) h.cookie = cookie; if (sfs) h['sec-fetch-site'] = sfs; if (b !== null) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(b); }
    const rq = http.request({ host: '127.0.0.1', port: P2, path: p + query, method, headers: h }, (x) => { let d = ''; x.on('data', (c) => d += c); x.on('end', () => { let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: x.statusCode, json: j || {} }); }); });
    rq.on('error', reject); rq.end(b === null ? undefined : b);
  });
  const mi = await H('/api/agent/vault/mint', { body: { name: 'signup-pw', length: 20, charset: 'alnum' } });
  ok(mi.status === 200 && mi.json.name === 'agent:conv-NINE/signup-pw' && mi.json.ref === 'vault://agent:conv-NINE/signup-pw' && !('value' in mi.json), 'a session bearer MINTS under agent:<its conversation>/<name> — name + ref, never a value', mi.json);
  const esc1 = await H('/api/agent/vault/mint', { body: { name: 'agent:other/evil' } });
  const esc2 = await H('/api/agent/vault/mint', { body: { name: '../other/x' } });
  ok(esc1.status === 400 && esc1.json.code === 'bad_name' && esc2.status === 400 && esc2.json.code === 'bad_name', 'a name that tries to escape the namespace (agent:other/… or ../) ⇒ 400 bad_name — the scope is the SESSION\'s, never the agent\'s', [esc1.json.code, esc2.json.code]);
  const pb = await H('/api/agent/vault/put', { body: { name: 'vendor', value: 'sk-BODY-PUT-9' } });
  ok(pb.status === 200 && pb.json.name === 'agent:conv-NINE/vendor' && !('value' in pb.json), 'a session bearer PUTs a value from the BODY ⇒ ok, no value echoed', pb.json);
  const pq = await H('/api/agent/vault/put', { query: '?value=LEAKED', body: { name: 'k' } });
  ok(pq.status === 400 && pq.json.code === 'value_in_argv', 'put with the value in the URL (argv-readable) ⇒ 400 value_in_argv', pq.json);
  const pe = await H('/api/agent/vault/put', { body: { name: 'k' } });
  ok(pe.status === 400 && pe.json.code === 'value_required', 'put with no value ⇒ 400 value_required');
  const jm = await H('/api/agent/vault/mint', { bearer: JTOK, body: { name: 'token' } });
  ok(jm.status === 200 && jm.json.name === 'agent:job-j9/token', 'a live job token mints under agent:job-<id>/<name>', jm.json);
  const un = await H('/api/agent/vault/mint', { bearer: 'vsst_' + 'f'.repeat(32), body: { name: 'x' } });
  ok(un.status === 401, 'an unknown session token ⇒ 401 (no mint)');
  // THE q-043 ① LAW: a bearer can NEVER read a value back
  const noGet = await H('/api/agent/vault/mint', { method: 'GET' });
  ok(noGet.status === 404, 'there is no GET agent mint door (404) — a bearer reads no value by any agent route');
  const rvBearer = await H('/api/vault/reveal', { bearer: TOK, cookie: 'vs_token=' + auth2.issueToken('owner'), sfs: 'same-origin', body: { id: 'secrets:agent:conv-NINE/signup-pw#secret' } });
  ok(rvBearer.status === 403 && rvBearer.json.code === 'human_only', 'the person reveal door refuses a bearer even past the sign-in gate (human_only) — only the owner reveals a value', rvBearer);
  const names = v2.secretNames().map((x) => x.name).sort();
  ok(JSON.stringify(names) === JSON.stringify(['agent:conv-NINE/signup-pw', 'agent:conv-NINE/vendor', 'agent:job-j9/token']), 'every entry landed under the caller\'s OWN scope (conv-NINE / job-j9) — the agent chose none of them', names);
  v2.lock('test');
  const ml = await H('/api/agent/vault/mint', { body: { name: 'z' } });
  const pl = await H('/api/agent/vault/put', { body: { name: 'z', value: 'v' } });
  ok(ml.status === 423 && ml.json.code === 'vault_locked' && pl.status === 423 && pl.json.code === 'vault_locked', 'a LOCKED vault ⇒ mint and put refused 423 vault_locked (nothing read, nothing minted)', [ml.json.code, pl.json.code]);
  await v2.unlock('second password nine');
  // MUTANT: a put route that reads the value from the QUERY (argv) ⇒ it ACCEPTS ?value= — the real route refuses it
  const rf = path.join(REPO, 'src/routes/vault.js');
  const rsrc = fs.readFileSync(rf, 'utf8');
  const rcut = rsrc
    .replace("const value = b.value; if (b && typeof b === 'object') delete b.value;   // taken OFF the request — no later reader sees it", "const value = (b.value != null ? b.value : (req.query && req.query.value)); if (b && typeof b === 'object') delete b.value;")
    .replace("if (req.query && typeof req.query.value !== 'undefined') return agentErr(res, { code: 'value_in_argv' });   // never the URL (argv-readable)", "/* mutant: the argv guard removed */");
  const rm = new Mod(rf); rm.filename = rf; rm.paths = Mod._nodeModulePaths(path.dirname(rf)); rm._compile(rcut, rf);
  const appM = express(); appM.use(auth2.middleware()); auth2.registerRoutes(appM); appM.use(express.json());
  rm.exports.registerVaultRoutes(appM, { vault: v2, activeSessions: sessions2, getJobs: getJobs2 });
  const srvM = await new Promise((r) => { const sv = appM.listen(0, '127.0.0.1', () => r(sv)); });
  const PM = srvM.address().port;
  const mq = await new Promise((resolve, reject) => { const rq = http.request({ host: '127.0.0.1', port: PM, path: '/api/agent/vault/put?value=SECRET-FROM-URL', method: 'POST', headers: { authorization: 'Bearer ' + TOK, 'content-type': 'application/json', 'content-length': Buffer.byteLength('{"name":"argv"}') } }, (x) => { let d = ''; x.on('data', (c) => d += c); x.on('end', () => { let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: x.statusCode, json: j || {} }); }); }); rq.on('error', reject); rq.end('{"name":"argv"}'); });
  ok(rcut !== rsrc && pq.json.code === 'value_in_argv' && mq.status === 200 && v2.secretNames().some((x) => x.name === 'agent:conv-NINE/argv'), 'MUTANT (put reads the value from the URL) ⇒ ?value= is ACCEPTED and sealed — the real route refuses it value_in_argv (RED on the argv law)', mq.json);
  srvM.close(); srv2.close(); v2.close();
}

console.log('⑬ THE USE LAW (lane vault-use-law — design q-043 D1/D7): a BEARER at a person\'s door is a refused USE — one vault-use line naming it, and its count');
{
  const VU = require(path.join(REPO, 'src/vault-use.js'));
  const linesOf = () => fs.readFileSync(path.join(dataDir, VE.AUDIT_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.event === 'vault-use');
  const l2 = linesOf();
  ok(l2.length > 0 && l2.every((l) => l.outcome === 'human_only' && ['setup', 'unlock', 'change'].includes(l.door) && l.entry === VU.VAULT_ENTRY && Object.keys(l).join() === VU.LINE_KEYS.join()), `② left one vault-use line per bearer refused at setup / unlock / change (${l2.length}) — entry the second password, outcome human_only, the closed key set`, l2.slice(0, 3));
  ok(l2.some((l) => l.by === 'agent' && l.conv === 's1' && l.actor === 'a conversation') && l2.some((l) => l.by === 'job' && l.conv === 'job-j1' && l.actor === 'a job'), 'the bearer is NAMED by its own token: a session (its conversation key) and a job (job-<id>) — a nameless one by its kind', l2.map((l) => `${l.by}:${l.conv}:${l.actor}`));
  ok(!l2.some((l) => l.door === 'lock' || l.door === 'idle') && !REFUSED.join('').includes('vr-'), 'the lock / idle doors open no entry (no use); a receipt is the audit\'s, never in a refused answer');
  const cards = []; vault.onFailing((c) => cards.push(c));
  const before = l2.filter((l) => l.by === 'agent' && l.conv === 's1').length;
  const calls0 = calls.length;
  for (let i = before; i < VU.FAIL_PER_DAY + 5; i++) {
    const r = await hit('/api/vault/unlock', { headers: { ...PAGE, authorization: 'Bearer ' + SESSION_TOKEN }, body: { password: 'a guess' } });
    if (!(r.status === 403 && r.json.code === 'human_only')) ok(false, 'a bearer at the unlock door ⇒ 403 human_only', r);
  }
  ok(cards.length === 1 && cards[0].by === 'agent' && cards[0].key === 'agent:s1' && cards[0].entry === VU.VAULT_ENTRY && cards[0].door === 'unlock' && cards[0].n === VU.FAIL_PER_DAY, `the ${VU.FAIL_PER_DAY}th refused use of the session in a day runs the owner's card ONCE (${VU.FAIL_PER_DAY + 5 - before} more knocks)`, cards);
  ok(!fs.readFileSync(path.join(dataDir, VE.AUDIT_FILE), 'utf8').includes('a guess') && calls.length === calls0, 'the guess a bearer sent is in no line, and the engine\'s unlock was never asked');
}

console.log('⑭ A SLOW DOOR NAMES ITSELF (lane vault-slow-load): one line above 250 ms — the route\'s pattern and the ms, nothing else');
{
  const R = require(path.join(REPO, 'src/routes/vault.js'));
  ok(R.VAULT_SLOW_MS === 250, 'the threshold is 250 ms');
  ok(R.slowLineOf({ method: 'GET', route: { path: '/api/vault/totp/:name' }, originalUrl: '/api/vault/totp/my-bank?x=1' }, 812.4) === '[vault] GET /api/vault/totp/:name answered in 812 ms', 'the line names the ROUTE\'S PATTERN — never the parameter, never the query');
  ok(R.slowLineOf({ method: 'POST', originalUrl: '/api/vault/totp/my-bank/grants?x=1' }, 300) === '[vault] POST /api/vault/totp answered in 300 ms', 'no matched route ⇒ the first three path segments (the server\'s own slow-request rule)');
  const sData = path.join(ROOT, 'slow-data'); fs.mkdirSync(sData);
  fs.writeFileSync(path.join(sData, '.accounts-key'), crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  const vS = VE.create({ dataDir: sData, kdf: { N: 1024, r: 8, p: 1 }, log, idleTimer: false, signInPassword: (p) => auth.verifyPassword(p), bcast: () => {} });
  const realUnlock = vS.unlock;
  vS.unlock = async (...a) => { await new Promise((r) => setTimeout(r, 320)); return realUnlock(...a); };   // the door is the subject: an engine 320 ms slow
  const MUT = path.join(ROOT, 'vault-routes-untimed.js');
  const src = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8');
  const untimed = src.replace(/\n  app\.use\(\['\/api\/vault', '\/api\/agent\/vault'\][\s\S]*?\n  \}\);/, '');
  ok(untimed !== src, 'CONTROL premise: the timer is cut out of the copy');
  fs.writeFileSync(MUT, at('src/routes/vault.js')(untimed));
  const drive = async (mod, opts = {}) => {
    const lines = [];
    const a = express(); a.use(auth.middleware()); auth.registerRoutes(a); a.use(express.json());
    mod.registerVaultRoutes(a, { vault: vS, activeSessions, log: (l) => lines.push(String(l)), ...opts });
    const s = await new Promise((r) => { const x = a.listen(0, '127.0.0.1', () => r(x)); });
    const port = s.address().port, page = { cookie: COOKIE, 'sec-fetch-site': 'same-origin', origin: `http://127.0.0.1:${port}` };
    const st = {};
    if (vS.state() === 'not_set_up') st.setup = (await hit('/api/vault/setup', { port, headers: page, body: { password: PW } })).status;
    st.lock = (await hit('/api/vault/lock', { port, headers: page })).status;
    st.unlock = (await hit('/api/vault/unlock', { port, headers: page, body: { password: PW } })).status;
    st.state = (await hit('/api/vault/state', { method: 'GET', port, headers: page })).status;
    st.agent = (await hit('/api/agent/vault/state', { method: 'GET', port, headers: { authorization: 'Bearer ' + SESSION_TOKEN } })).status;
    await new Promise((r) => setTimeout(r, 50));
    s.close();
    return { lines, st };
  };
  const d = await drive(R);
  ok(d.st.lock === 200 && d.st.unlock === 200 && d.st.state === 200 && d.st.agent === 200, 'the doors answered (lock, a 320 ms unlock, the state, the agent state)', d.st);
  ok(d.lines.length === 1 && /^\[vault\] POST \/api\/vault\/unlock answered in \d{3,} ms$/.test(d.lines[0]) && Number(d.lines[0].match(/(\d+) ms$/)[1]) >= 320, 'the slow unlock is ONE line: the method, the route, the ms — and the fast doors say nothing', d.lines);
  ok(!d.lines.join('\n').includes(PW), 'the line carries no password');
  const all = await drive(R, { slowMs: -1 });
  ok(all.lines.some((l) => /^\[vault\] GET \/api\/vault\/state answered in \d+ ms$/.test(l)) && all.lines.some((l) => /^\[vault\] GET \/api\/agent\/vault\/state answered in \d+ ms$/.test(l)) && all.lines.length === 4, 'every vault door is timed — the person doors and the agent doors (a threshold below 0 names each)', all.lines);
  const red = await drive(require(MUT));
  ok(red.st.unlock === 200 && red.lines.length === 0, 'RED CONTROL: the routes without the timer — the same 320 ms unlock leaves no line (the owner\'s console)', red);
  vS.close();
}

srv.close(); vault.close(); console.warn = warn0;
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
