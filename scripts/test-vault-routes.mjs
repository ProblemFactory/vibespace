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

srv.close(); vault.close(); console.warn = warn0;
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
