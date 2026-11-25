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
//   ⑮ THE «谁可以用…» WRITER'S CODES ON THE WIRE (lane vault-standing-request r11, MINOR 2 — the writer's except_unnamed went out
//      400 with the bare code): the census (every code src/server/vault-use-grants.js answers rides the route's maps with its
//      status and words) and the wire (the real route over the real writer: 409 + the writer's sentence)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { scratch, anchored } from './scratch.mjs';
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
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
const SEED_OWN = TP.base32Encode(crypto.randomBytes(20));   // lane vault-agent-own: the seed an agent adds itself
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
  const logins = require(path.join(REPO, 'src/server/browser-logins.js')).create({ vault: v, grants: () => require(path.join(REPO, 'src/server/grants-store.js')).create({ memory: true }), totpCode: (n, o) => totp.codeForLogin(n, o), now: () => clock });   // lane vault-agent-own: `login add`
  const tok = () => 'vsst_' + crypto.randomBytes(16).toString('hex');
  const sessions = new Map([['s1', { agentToken: tok(), backendSessionId: 'conv-1', _webuiId: 'sess-1-1', conv: 'conv-1', groups: [] }], ['s2', { agentToken: tok(), backendSessionId: 'conv-2', groups: ['T-1'] }], ['s3', { agentToken: tok(), backendSessionId: 'conv-3', isTmuxView: true, groups: [] }]]);
  // the wiring's sessionCallerOf: + its registered id (`scope`) and its fork-safe durable id (`conv`) — lane vault-agent-own
  const callerOf = (token) => { for (const s of sessions.values()) if (s.agentToken === token) return { conversationId: s.backendSessionId, live: !s.isTmuxView, groups: s.groups, scope: s._webuiId, ...('conv' in s ? { conv: s.conv } : {}) }; return null; };
  const runOf = (cid) => { for (const s of sessions.values()) if (!s.isTmuxView && s.backendSessionId === cid) return VT0.runOfToken(s.agentToken); return null; };
  const a = express();
  a.use(au.middleware()); au.registerRoutes(a); a.use(express.json());
  load('src/routes/vault.js', routesSrc).registerVaultRoutes(a, { vault: v, activeSessions: sessions, getJobs: () => ({ jobByToken: (t) => (t === 'jbt_live' ? { id: 'j1' } : null) }), contents, who: (req) => Auth.signInHandle(req),
    totp, logins, callerOf, runOf, grantLive: (g) => !g.subject.startsWith('session:') || runOf(g.subject.slice(8)) === g.run, subjects: () => ({ sessions: [...sessions.values()].filter((s) => !s.isTmuxView).map((s) => ({ subject: `session:${s.backendSessionId}`, name: s.backendSessionId })), groups: [{ subject: 'group:T-1', name: 'T-1' }] }) });
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
  return { dir, vault: v, sessions, go, agent, page, answers, lines, expect, audit, port, logins, step: (ms) => { clock += ms; }, close: () => { v.close(); s.close(); } };
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
  ['the AGENT pace: 20 answers a minute per conversation ⇒ 429 code_paced (with secondsLeft + retryInMs)', async (H) => {
    H.step(61e3);
    let last = null;
    for (let i = 0; i < 21; i++) last = await H.agent(H.sessions.get('s1').agentToken);
    H.step(61e3);
    return last.status === 429 && last.json.code === 'code_paced' && Number.isInteger(last.json.secondsLeft) && last.json.secondsLeft >= 1 && last.json.retryInMs >= 1 && /too many two-step codes requested in the last minute/.test(last.json.error || '') && (await H.agent(H.sessions.get('s1').agentToken)).status === 200;
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
  // lane vault-agent-own: the agent's OWN seed — `vibespace-vault totp add` (the owner 2026-10-26: 「它自己存的使用为啥还要我的允许？」)
  ['an AGENT adds a seed it holds (POST /api/agent/vault/totp, the seed off the body) ⇒ its name and entry — no seed, no code in the answer; the URL never carries one; a cookie is 401', async (H) => {
    const bearer = { authorization: 'Bearer ' + H.sessions.get('s1').agentToken };
    const r = await H.go('/api/agent/vault/totp', { method: 'POST', headers: bearer, body: { name: 'agent-okta', seed: SEED_OWN } });
    const q = await H.go(`/api/agent/vault/totp?seed=${SEED_NEW}`, { method: 'POST', headers: bearer, body: { name: 'q-okta' } });
    const c = await H.go('/api/agent/vault/totp', { method: 'POST', body: { name: 'c-okta', seed: SEED_NEW } });
    const add = H.audit().find((l) => l.event === 'vault-totp-add' && l.entry === 'totp:agent-okta');
    return r.status === 200 && r.json.name === 'agent-okta' && r.json.entry === 'totp:agent-okta' && !r.raw.includes(SEED_OWN) && !r.raw.includes(H.expect(SEED_OWN)) && !!add && add.by === 'agent' && q.status === 400 && q.json.code === 'value_in_argv' && c.status === 401;
  }],
  ['its code answers THE CONVERSATION THAT STORED IT with NO grant (audited via own) — another conversation is not_granted; the same name again ⇒ 409 exists, in words an agent can act on', async (H) => {
    const mine = await H.agent(H.sessions.get('s1').agentToken, 'agent-okta');
    const theirs = await H.agent(H.sessions.get('s2').agentToken, 'agent-okta');
    const again = await H.go('/api/agent/vault/totp', { method: 'POST', headers: { authorization: 'Bearer ' + H.sessions.get('s1').agentToken }, body: { name: 'agent-okta', seed: SEED_NEW } });
    const use = H.audit().filter((l) => l.event === 'vault-totp-use' && l.entry === 'totp:agent-okta' && l.ok);
    return mine.status === 200 && mine.json.code === H.expect(SEED_OWN) && !mine.raw.includes(SEED_OWN) && theirs.status === 403 && theirs.json.code === 'not_granted' && use.length === 1 && use[0].via === 'own' && again.status === 409 && again.json.code === 'exists' && /pick another name/.test(again.json.error);
  }],
  ['a conversation that ENDED AND CAME BACK (a new token, a new registered id, its durable id kept) still gets it; a pending fork (its durable id null, its parent\'s conversation id) does not', async (H) => {
    const T4 = 'vsst_' + crypto.randomBytes(16).toString('hex'), T5 = 'vsst_' + crypto.randomBytes(16).toString('hex');
    H.sessions.set('s4', { agentToken: T4, backendSessionId: 'conv-1', _webuiId: 'sess-4-4', conv: 'conv-1', groups: [] });
    H.sessions.set('s5', { agentToken: T5, backendSessionId: 'conv-1', _webuiId: 'sess-5-5', conv: null, groups: [] });
    const back = await H.agent(T4, 'agent-okta'), fork = await H.agent(T5, 'agent-okta');
    H.sessions.delete('s4'); H.sessions.delete('s5');
    return back.status === 200 && back.json.code === H.expect(SEED_OWN) && fork.status === 403 && fork.json.code === 'not_granted';
  }],
  ['the owner\'s Vault window lists it as the agent\'s: provenance agent-typed, the conversation that stored it, «stored by an agent» (origin put)', async (H) => {
    const l = await H.go('/api/vault/contents');
    const row = ((l.json && l.json.rows) || []).find((x) => x.entry === 'totp:agent-okta');
    return !!row && row.provenance && row.provenance.prov === 'agent-typed' && row.provenance.owner === 'conv-1' && row.origin === 'put' && row.kind === 'totp' && !l.raw.includes(SEED_OWN);
  }],
  ['THE SEED in no answer but the reveal\'s, no audit line, no log; data/vault-grants.json 0600 holds no seed, no code', async (H) => {
    const leak = H.answers.filter((x) => !x.p.startsWith('/api/vault/reveal') && (x.d.includes(SEED) || x.d.includes(SEED_NEW) || x.d.includes(SEED_OWN)));
    const f = path.join(H.dir, VT0.GRANTS_FILE);
    const txt = fs.readFileSync(f, 'utf8'), aud = fs.readFileSync(path.join(H.dir, VE.AUDIT_FILE), 'utf8');
    return leak.length === 0 && ![SEED, SEED_NEW, SEED_OWN].some((s) => aud.includes(s) || txt.includes(s) || H.lines.join('\n').includes(s)) && (fs.statSync(f).mode & 0o777) === 0o600;
  }],
];
console.log('⑨ two-step codes (design q-047 L1)');
{
  const H = await totpHub('shipped');
  for (const [name, fn] of TOTP_CHECKS) { let r = false; try { r = await fn(H); } catch (e) { r = false; console.error('    threw: ' + e.message); } ok(r, name); }
  // lane vault-agent-own: THE REAL CLI — `vibespace-vault totp add` / `login add` read the value from a 0600 file or stdin (NEVER
  // argv), the hub answers names; the code answers the storing conversation; a file others can read is refused before any call
  const cli = (args, { input = null } = {}) => new Promise((res) => {
    const p = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-vault'), ...args], { env: { PATH: process.env.PATH, HOME: H.dir, VIBESPACE_API: `http://127.0.0.1:${H.port}`, VIBESPACE_SESSION_TOKEN: H.sessions.get('s1').agentToken }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { err += c; });
    const k = setTimeout(() => p.kill('SIGKILL'), 15000);
    p.on('close', (code) => { clearTimeout(k); res({ code, out, err, argv: args.join(' ') }); });
    p.stdin.end(input == null ? '' : input);
  });
  const SEED_CLI = TP.base32Encode(crypto.randomBytes(20)), PW_CLI = ['cli', crypto.randomBytes(9).toString('hex'), 'pw'].join('-');
  const f600 = path.join(H.dir, 'seed.txt'), f644 = path.join(H.dir, 'open.txt');
  fs.writeFileSync(f600, `otpauth://totp/Shop:me?secret=${SEED_CLI}&issuer=Shop\n`, { mode: 0o600 }); fs.writeFileSync(f644, SEED_CLI, { mode: 0o644 }); fs.chmodSync(f644, 0o644);
  const add = await cli(['totp', 'add', 'cli-shop', '--from-file', f600]);
  const code = await cli(['totp', 'cli-shop']);
  const open = await cli(['totp', 'add', 'cli-open', '--from-file', f644]);
  const both = await cli(['totp', 'add', 'cli-two', '--from-file', f600, '--stdin']);
  const login = await cli(['login', 'add', 'https://shop.example.test', '--user', 'cli-user', '--stdin', '--totp', 'cli-shop'], { input: PW_CLI + '\n' });
  const kept = H.logins.names().find((x) => x.name === 'web-login:https://shop.example.test#cli-user');
  const all = [add, code, open, both, login].map((r) => r.out + r.err + r.argv).join('\n');
  ok(add.code === 0 && /stored the two-step code cli-shop/.test(add.out) && code.code === 0 && code.out.startsWith(H.expect(SEED_CLI) + ' (') && login.code === 0 && /stored the login cli-user on https:\/\/shop\.example\.test/.test(login.out) && !!kept && kept.owner === 'conv-1' && kept.source === 'agent-typed',
    'THE REAL CLI: `totp add <name> --from-file <0600>` stores the otpauth link, `totp <name>` answers ITS code with no grant, `login add … --stdin --totp` stores a web login this conversation owns (agent-typed)', { add, code: code.out, login, kept });
  ok(open.code === 1 && /readable by others/.test(open.err) && both.code === 2 && /exactly one of --from-file/.test(both.err) && !all.includes(SEED_CLI) && !all.includes(PW_CLI),
    '…a file others can read is refused (chmod 600 named), --from-file with --stdin is refused; no answer, no error and no command line holds the seed or the password', { open: open.err, both: both.err });
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
    ['the agent door without the grant', { totpSrc: TS.replace('const v = T.useVerdict({ grants, entry, caller, vaultState: vaultState(), owner: ownerOf(entry) });', "const v = vaultState() === 'unlocked' ? { ok: true, grant: { subject: 'none' } } : T.useVerdict({ grants, entry, caller, vaultState: vaultState(), owner: ownerOf(entry) });") }],
    ['a conversation\'s grant outlives its run', { totpSrc: TS.replace('const v = T.useVerdict({ grants, entry, caller, vaultState: vaultState(), owner: ownerOf(entry) });', 'const v = T.useVerdict({ grants: grants.map((g) => (g.run ? { ...g, run: caller && caller.run } : g)), entry, caller, vaultState: vaultState(), owner: ownerOf(entry) });') }],
    ['a view with no audit line', { totpSrc: TS.replace("    vault.audit('vault-totp-view', { who: w, ip, by: 'human', entry });\n", '') }],
    ['an agent\'s OWN seed still needs a grant (lane vault-agent-own)', { totpSrc: TS.replace('vaultState: vaultState(), owner: ownerOf(entry) });   // owner: lane vault-agent-own', 'vaultState: vaultState(), owner: null });   // owner: lane vault-agent-own') }],
    ['an agent\'s add answers the seed back (lane vault-agent-own)', { routesSrc: RS.replace('return r.ok ? res.json({ ok: true, name: r.name, entry: r.entry }) :', 'return r.ok ? res.json({ ok: true, name: r.name, entry: r.entry, seed: String(seed || uri || \'\') }) :') }],
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
  const runDoor = DOOR.create({ dataDir: dataDir2, vault: vault2, sources: { mounts: () => mountsSrc }, userTodos, instanceKind: () => 'cluster', runRoot: () => RUNROOT, agentEnv: () => ({ ...process.env, PATH: BIN + ':' + process.env.PATH }), isRootOwned: (p) => p === BIN || (typeof p === 'string' && p.startsWith(BIN + '/')), log: (m) => LOGS.push(String(m)) });   // round 12: a test cannot chown a scratch binary to root — model the fake-curl dir (the "a program no agent could have written" fixture) as root-owned (the ownership rule itself is driven in test-vault-run ⑫)
  const sessions2 = new Map([['s1', { agentToken: SESSION_TOKEN, backendSessionId: 'conv-r1', name: 'Route Lane', cwd: WORK }]]);
  const app2 = express();
  app2.use(auth.middleware());
  app2.use(express.json());
  // lane vault-job-approval: a Background job's approval card's door, recorded (the door's own rules are test-vault-job's) — the ROUTE's law here
  const jobAsks = { calls: [], revokes: [], alls: [], answer(id, o) { this.calls.push({ id, ...o }); return { ok: true, outcome: o.answer === 'deny' ? 'denied' : 'allowed', job: 'jb-0000aaaa' }; }, revoke(entry, job, o) { this.revokes.push({ entry, job, ...o }); return { ok: true, outcome: 'revoked', job, stopped: true }; }, revokeAll(job, o) { this.alls.push({ job, ...o }); return { ok: true, outcome: 'revoked', job, stopped: true, entries: 2 }; } };   // stage L3's F1: + revokeAll (the job card's ✕)
  registerVaultRoutes(app2, { vault: vault2, activeSessions: sessions2, getJobs: () => ({ jobByToken: (t) => (t === 'jbt_live' ? { id: 'j1' } : null) }), contents, run: runDoor, jobAsks });
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
  // lane vault-job-approval (design-vault-service-secret L1b): a Background job's approval card is a PERSON's door — a bearer
  // never answers it (human_only: the door is never asked); 允许 carries THIS page's 验证是你 only when the page holds it; 拒绝 is a click
  {
    const VJA = '/api/vault/job/asks/vj-' + '0'.repeat(16);
    const jaB = await hit(VJA, { headers: { ...PAGE, ...B }, body: { answer: 'allow', page } });
    const jaJ = await hit(VJA, { headers: { ...PAGE, authorization: 'Bearer jbt_live' }, body: { answer: 'allow', page } });
    const n0 = jobAsks.calls.length;
    const ja0 = await hit(VJA, { body: { answer: 'allow' } });
    const ja1 = await hit(VJA, { body: { answer: 'allow', page, rev: 2 } });
    const jaD = await hit(VJA, { body: { answer: 'deny', rev: 1 } });
    const cs = jobAsks.calls;
    ok(cs.length === 3 && cs[0].rev === null && cs[1].rev === 2 && cs[2].rev === 1, 'stage L3\'s F1: the press carries the card\'s revision it drew to the door (`rev`; none ⇒ null — the door refuses it ask_changed, nothing written)', cs.map((c) => c.rev));
    ok(jaB.status === 403 && jaB.json.code === 'human_only' && jaJ.status === 403 && jaJ.json.code === 'human_only' && n0 === 0, 'a Background job\'s approval card: a session bearer and a job token are refused human_only — its door is never asked', [jaB.json.code, jaJ.json.code, n0]);
    ok(ja0.status === 200 && ja1.status === 200 && jaD.status === 200 && cs.length === 3 && cs[0].reauthed === false && cs[1].reauthed === true && cs[2].answer === 'deny' && cs[2].reauthed === false && cs.every((c) => c.person === true && c.by === 'user' && c.id === 'vj-' + '0'.repeat(16)),
      'a PERSON\'s 允许 reaches the door with reauthed = this page\'s 验证是你 window (none on the page ⇒ false — the door refuses it); 拒绝 never needs it; every answer is the person\'s', cs);
    // MUTANT: the answer route WITHOUT person() ⇒ a bearer's answer reaches the door — RED on the copy
    const Mod = require('module'), rf = path.join(REPO, 'src/routes/vault.js'), rsrc = fs.readFileSync(rf, 'utf8');
    const PERSON_AT = "if (jobAsks) app.post('/api/vault/job/asks/:askId', person((req) => {";
    let rcut = null, rcutWhy = null;   // the copy through the ONE anchored door: its anchor gone ⇒ the control is RED by name (rcutWhy)
    try { rcut = anchored(rsrc, PERSON_AT, "if (jobAsks) app.post('/api/vault/job/asks/:askId', ((fn) => async (req, res) => res.json(await fn(req)))((req) => {", 'the job answer route without person()'); } catch (e) { rcutWhy = e.message; }
    let mutHit = null;
    if (rcut) {
      const rm = new Mod(rf); rm.filename = rf; rm.paths = Mod._nodeModulePaths(path.dirname(rf)); rm._compile(rcut, rf);
      const stub = { calls: [], answer(id, o) { this.calls.push({ id, ...o }); return { ok: true, outcome: 'allowed' }; } };
      const appM = express(); appM.use(auth.middleware()); appM.use(express.json());
      rm.exports.registerVaultRoutes(appM, { vault: vault2, activeSessions: sessions2, getJobs: () => null, contents, run: runDoor, jobAsks: stub });
      const srvM = await new Promise((r) => { const x = appM.listen(0, '127.0.0.1', () => r(x)); });
      await hit0(VJA, { headers: { ...PAGE0, origin: `http://127.0.0.1:${srvM.address().port}`, ...B }, body: { answer: 'allow' }, port: srvM.address().port });
      mutHit = stub.calls.length;
      srvM.close();
    }
    ok(mutHit === 1, 'CONTROL — the job card\'s answer route without person(): a session bearer\'s 允许 REACHES the door — RED on the copy', rcut ? { mutHit } : rcutWhy);
    // decision ④: the ✕ (take a job's use of an entry back — it STOPS the job) is a person's click too; a bearer never takes it back
    const RV = { entry: 'secrets:secret:k1#secret', job: 'jb-0000aaaa' };
    const rvB = await hit('/api/vault/job/revoke', { headers: { ...PAGE, ...B }, body: RV });
    const rvJ = await hit('/api/vault/job/revoke', { headers: { ...PAGE, authorization: 'Bearer jbt_live' }, body: RV });
    const r0 = jobAsks.revokes.length;
    const rvP = await hit('/api/vault/job/revoke', { body: RV });
    const rvA = await hit('/api/vault/job/revoke', { body: { job: 'jb-0000aaaa', all: true } });
    ok(rvA.status === 200 && rvA.json.outcome === 'revoked' && rvA.json.entries === 2 && jobAsks.alls.length === 1 && jobAsks.alls[0].job === 'jb-0000aaaa' && jobAsks.alls[0].by === 'user' && jobAsks.revokes.length === 1, 'stage L3\'s F1 (d): the JOB CARD\'s ✕ (`all: true`) reaches the door\'s take-back of ALL the job\'s approvals — a person\'s click, the same person() door', jobAsks.alls);
    ok(rvB.status === 403 && rvB.json.code === 'human_only' && rvJ.status === 403 && rvJ.json.code === 'human_only' && r0 === 0 && rvP.status === 200 && rvP.json.outcome === 'revoked' && jobAsks.revokes.length === 1 && jobAsks.revokes[0].entry === RV.entry && jobAsks.revokes[0].job === RV.job && jobAsks.revokes[0].by === 'user',
      'the ✕ on a job\'s vault use (POST /api/vault/job/revoke): a session bearer and a job token are refused human_only; a person\'s click reaches the door with the entry and the job', [rvB.json.code, rvJ.json.code, jobAsks.revokes]);
    // MUTANT (round w6tezed7d): the TAKE-BACK route without person() ⇒ a bearer's ✕ reaches the door — its own control, RED on the copy
    const REVOKE_AT = "if (jobAsks) app.post('/api/vault/job/revoke', person((req) => {";
    let vcut = null, vcutWhy = null;
    try { vcut = anchored(rsrc, REVOKE_AT, "if (jobAsks) app.post('/api/vault/job/revoke', ((fn) => async (req, res) => res.json(await fn(req)))((req) => {", 'the take-back route without person()'); } catch (e) { vcutWhy = e.message; }
    let revHit = null;
    if (vcut) {
      const rm = new Mod(rf); rm.filename = rf; rm.paths = Mod._nodeModulePaths(path.dirname(rf)); rm._compile(vcut, rf);
      const stub = { calls: [], revoke(entry, job, o) { this.calls.push({ entry, job, ...o }); return { ok: true, outcome: 'revoked', job, stopped: true }; } };
      const appM = express(); appM.use(auth.middleware()); appM.use(express.json());
      rm.exports.registerVaultRoutes(appM, { vault: vault2, activeSessions: sessions2, getJobs: () => null, contents, run: runDoor, jobAsks: stub });
      const srvM = await new Promise((r) => { const x = appM.listen(0, '127.0.0.1', () => r(x)); });
      await hit0('/api/vault/job/revoke', { headers: { ...PAGE0, origin: `http://127.0.0.1:${srvM.address().port}`, ...B }, body: RV, port: srvM.address().port });
      revHit = stub.calls.length;
      srvM.close();
    }
    ok(revHit === 1, 'CONTROL — the take-back route without person(): a session bearer\'s ✕ REACHES the door — RED on the copy', vcut ? { revHit } : vcutWhy);
  }
  const prG = hit('/api/agent/vault/run', { headers: B, body: { args: ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/z'], cwd: WORK } });
  const cardG = await waitCard();
  await hit(`/api/vault/run/asks/${cardG.action.askId}`, { body: { answer: 'once', page } });   // int331 seam: q-043 H1 (int330) — a sign-in-off hub's run-card «once» demands this page's 验证是你 window too (the grant opened the ENTRY; the shape card is still answered with the window)
  const rG = await prG;
  ok(rG.status === 200 && rG.json.ok && rG.json.stdout === 'curl got [vault:mounts/m1/secretKey]\n' && /^vr-[0-9a-f]{16}$/.test(rG.json.receipt), 'THE GRANT ROW IS HONOURED BY THE RUN VERDICT: the closed entry runs for that conversation (the cluster still shows the run card), scrubbed, with its receipt', rG.json);
  const rG2 = await hit('/api/agent/vault/run', { headers: B, body: { args: CURL, cwd: WORK } });
  const us2 = await hit('/api/agent/vault/uses', { method: 'GET', headers: B });
  ok(rG2.status === 403 && rG2.json.code === 'grant_expired' && /its one run was used at/.test(rG2.json.error || rG2.json.words || '') && us2.json.uses.some((u) => u.receipt === rG.json.receipt && u.purpose === REQ.purpose && u.outcome === 'ok' && u.door === 'run') && !JSON.stringify(us2.json).includes(RUNV),
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
  // lane lg-vault-file (B-0830): `put <name> --file <0600 file>` — the FILE's bytes ride the body (base64) with its name, size
  // and digest, taken off the request like `value`; the answer is facts (the file's name, size, kind), the road to use it, the
  // copy on disk the agent must delete itself — never a byte. A TEXT put keeps the release's road: no bound of this unit's (主开发 r4625 (3)).
  {
    const VF = require(path.join(REPO, 'src/vault-file.js'));
    const u32 = (x) => { const b = Buffer.alloc(4); b.writeUInt32BE(x); return b; };
    const sstr = (x) => { const b = Buffer.isBuffer(x) ? x : Buffer.from(String(x), 'latin1'); return Buffer.concat([u32(b.length), b]); };
    const ARMOR = ['OPENSSH', 'PRIVATE', 'KEY'].join(' ');
    const body = Buffer.concat([Buffer.from('openssh-key-v1\0', 'latin1'), sstr('aes256-ctr'), sstr('bcrypt'), sstr(Buffer.concat([sstr(crypto.randomBytes(16)), u32(16)])), u32(1), sstr(crypto.randomBytes(51)), sstr(crypto.randomBytes(160))]);
    const KEY = Buffer.from([`-----BEGIN ${ARMOR}-----`, ...body.toString('base64').match(/.{1,70}/g), `-----END ${ARMOR}-----`, ''].join('\n'), 'latin1');
    const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
    const fp = await H('/api/agent/vault/put', { body: { name: 'deploy-key', bytes: KEY.toString('base64'), filename: 'id_ed25519', size: KEY.length, sha256: sha(KEY) } });
    ok(fp.status === 200 && fp.json.name === 'agent:conv-NINE/deploy-key' && fp.json.file && fp.json.file.name === 'id_ed25519' && fp.json.file.size === KEY.length && fp.json.file.kind === 'ssh-key'
      && /\$VAULT_FILE\{KEY\}/.test(fp.json.use) && /delete that copy yourself/.test(fp.json.copy) && /passphrase/.test(fp.json.encrypted || '') && !JSON.stringify(fp.json).includes(KEY.toString('base64').slice(0, 30)) && !('bytes' in fp.json),
      'put --file ⇒ 200: the file\'s facts, the road to use it ($VAULT_FILE), the copy to delete, the passphrase fact (stored as is) — no byte back', fp.json);
    ok((await v2.fileOpen('agent:conv-NINE/deploy-key')).bytes.equals(KEY) && v2.secretGet('agent:conv-NINE/deploy-key').code === 'is_a_file', 'sealed to the very bytes; no door reads its key');
    const tries = [
      [{ name: 'f1', bytes: KEY.toString('base64'), filename: 'k', size: KEY.length + 1 }, 400, 'bytes_bad', 'a size that is not what arrived'],
      [{ name: 'f1', bytes: KEY.toString('base64'), filename: 'k', sha256: sha(Buffer.from('other')) }, 400, 'bytes_bad', 'a digest that is not what arrived'],
      [{ name: 'f1', bytes: 'not base64 at all', filename: 'k' }, 400, 'bytes_bad', 'bytes that are not strict base64'],
      [{ name: 'f1', bytes: KEY.toString('base64'), filename: '/' }, 400, 'file_name_bad', 'a file with no name'],
      [{ name: 'f1', bytes: KEY.toString('base64'), value: 'both', filename: 'k' }, 400, 'value_and_file', 'a value AND a file'],
      [{ name: 'vendor', bytes: KEY.toString('base64'), filename: 'k' }, 409, 'not_a_file', 'a file over a TEXT entry (never upgraded)'],
      [{ name: 'deploy-key', value: 'a text value now' }, 409, 'is_a_file', 'a text value over a FILE entry'],
    ];
    const got = [];
    for (const [b, st, code] of tries) { const r = await H('/api/agent/vault/put', { body: b }); got.push([r.status, r.json.code, r.json.error]); }
    ok(got.every(([st, code, err], i) => st === tries[i][1] && code === tries[i][2] && typeof err === 'string' && err.length > 15) && !v2.fileOf('agent:conv-NINE/f1'),
      `each refused BY NAME, in words, nothing stored: ${tries.map((t) => t[3]).join(' · ')}`, got);
    const long = 'L' + crypto.randomBytes(7500).toString('base64').slice(0, 9999);   // built at run time: 10 000 characters
    const okLong = await H('/api/agent/vault/put', { body: { name: 'long', value: long } });
    const bq = await H('/api/agent/vault/put', { query: '?bytes=QUJDREVGR0g', body: { name: 'q' } });
    ok(okLong.status === 200 && String(v2.secretGet('agent:conv-NINE/long').value) === long && bq.status === 400 && bq.json.code === 'value_in_argv',
      'a TEXT value of 10 000 characters is stored as at the release (主开发 r4625 (3): the unit\'s lower cap taken out); a file\'s bytes in the URL ⇒ value_in_argv (argv-readable)', [okLong.status, bq.json]);
  }
  // lane vault-agent-own: a conversation with a DURABLE id (its CLI session id — a resume keeps it) names a NEW entry by it, so a
  // conversation that ended and came back still owns it; a pending fork (it borrows its parent's id) falls back to its own
  // registered id; a mint records its --for (the one host a run sends it to without asking)
  const TOKD = 'vsst_' + crypto.randomBytes(16).toString('hex'), TOKF = 'vsst_' + crypto.randomBytes(16).toString('hex');
  sessions2.set('sess-31-1', { agentToken: TOKD, _webuiId: 'sess-31-1', claudeSessionId: 'conv-durable-1', name: 'Chat Durable' });
  sessions2.set('sess-32-1', { agentToken: TOKF, _webuiId: 'sess-32-1', claudeSessionId: 'conv-durable-1', _forkRequested: true, _forkSourceId: 'conv-durable-1', name: 'Chat Fork' });   // a PENDING fork: it still carries its source's id
  const dm = await H('/api/agent/vault/mint', { bearer: TOKD, body: { name: 'site-pw', for: 'https://api.example.com/login' } });
  const dp = await H('/api/agent/vault/put', { bearer: TOKD, body: { name: 'okta-seed', value: ['put', crypto.randomBytes(6).toString('hex')].join('-') } });
  const fm = await H('/api/agent/vault/mint', { bearer: TOKF, body: { name: 'fork-pw' } });
  const dn = v2.secretNames().find((x) => x.name === 'agent:conv-durable-1/site-pw') || {};
  const forkPending = require(path.join(REPO, 'src/claude-lock-capture.js')).addressableId(sessions2.get('sess-32-1')) === null;
  ok(dm.status === 200 && dm.json.ref === 'vault://agent:conv-durable-1/site-pw' && dp.json.name === 'agent:conv-durable-1/okta-seed' && dn.forHost === 'https://api.example.com/login' && dn.prov === 'minted' && forkPending && fm.json.name === 'agent:sess-32-1/fork-pw',
    'lane vault-agent-own: mint / put name a NEW entry by the conversation\'s DURABLE id (kept across a resume) and a mint records its --for; a pending fork names its own registered id, never its parent\'s', { dm: dm.json, dp: dp.json, fm: fm.json, forHost: dn.forHost, forkPending });
  // the review: --for is shown to the owner on a card — a control or direction character never survives the mint
  const cm = await H('/api/agent/vault/mint', { bearer: TOKD, body: { name: 'ctl-pw', for: 'api.example.com\u202e\nHosts: elsewhere.example.org' } });
  const cn = v2.secretNames().find((x) => x.name === 'agent:conv-durable-1/ctl-pw') || {};
  ok(cm.status === 200 && typeof cn.forHost === 'string' && !/[\u0000-\u001f\u202a-\u202e]/.test(cn.forHost) && cn.forHost === 'api.example.comHosts: elsewhere.example.org', 'a mint\'s --for keeps no control / direction character (it reaches the owner\'s card)', cn.forHost);
  sessions2.delete('sess-31-1'); sessions2.delete('sess-32-1');
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
    .replace("if (req.query && (typeof req.query.value !== 'undefined' || typeof req.query.bytes !== 'undefined')) return agentErr(res, { code: 'value_in_argv' });   // never the URL (argv-readable)", "/* mutant: the argv guard removed */");   // lane lg-vault-file: the guard reads `bytes` too
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
  const untimed = editAnchor(src, /\n  app\.use\(\['\/api\/vault', '\/api\/agent\/vault'\][\s\S]*?\n  \}\);/, '', "src/routes/vault.js");
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

console.log('⑮ (lane vault-standing-request r11, MINOR 2) THE «谁可以用…» WRITER\'S CODES ON THE WIRE — its status and its sentence, as the writer answers them');
{
  const UGC = require(path.join(REPO, 'src/server/vault-use-grants.js'));
  const GSU = require(path.join(REPO, 'src/server/grants-store.js'));
  const RT = require(path.join(REPO, 'src/routes/vault.js'));
  // the census: every code the writer answers rides the route's maps with the writer's status, and with words
  const gaps = Object.keys(UGC.STATUS).filter((c) => (RT.STATUS[c] || 400) !== UGC.STATUS[c]).map((c) => `${c} ${RT.STATUS[c] || 400}≠${UGC.STATUS[c]}`);
  const mute = Object.keys(UGC.WORDS).filter((c) => !RT.WORDS[c]);
  ok(!gaps.length && !mute.length && RT.STATUS.except_unnamed === 409 && RT.WORDS.except_unnamed === UGC.WORDS.except_unnamed, '⑮a CENSUS: every code the use-grants writer answers rides the route\'s maps with the writer\'s status, and with words — except_unnamed 409 + the writer\'s sentence (7e99ef689: the route had neither — 400, the bare code)', { gaps, mute });
  // the wire: the REAL route over the real writer (the door's saveRow) — an older page's Save leaving the stored 除了 out unnamed
  const uData = path.join(ROOT, 'use-data'), uRun = path.join(ROOT, 'use-run');
  for (const d of [uData, uRun]) fs.mkdirSync(d, { recursive: true });
  const vU = VE.create({ dataDir: uData, kdf: { N: 1024, r: 8, p: 1 }, log, idleTimer: false, register: false, signInPassword: (p) => auth.verifyPassword(p), bcast: () => {} });
  const grantsU = GSU.create({ dataDir: uData });
  const ugU = UGC.create({ grants: () => grantsU, vault: vU, dataDir: uData, log: () => {} });
  const doorU = DOOR.create({ dataDir: uData, vault: vU, userTodos: new UserTodoManager({ dataDir: uData, expirySweepMs: 3600e3 }), sources: { secrets: () => VC.secretSource({ vault: vU }) }, instanceKind: () => 'cluster', runRoot: () => uRun, useGrants: ugU, log: () => {} });
  const aU = express(); aU.use(auth.middleware()); aU.use(express.json());
  RT.registerVaultRoutes(aU, { vault: vU, activeSessions: new Map(), run: doorU });
  const sU = await new Promise((r) => { const x = aU.listen(0, '127.0.0.1', () => r(x)); });
  const pU = sU.address().port, pageU = { cookie: COOKIE, 'sec-fetch-site': 'same-origin', origin: `http://127.0.0.1:${pU}` };
  const suU = await hit('/api/vault/setup', { port: pU, headers: pageU, body: { password: PW } });
  const nameU = 'secret:' + crypto.randomBytes(5).toString('hex'), EIDU = `secrets:${nameU}#secret`;
  const putU = vU.secretPut(nameU, ['route', 'use', 'value', crypto.randomBytes(6).toString('hex')].join('-'), { prov: 'owner', label: 'Route key', kind: 'api-key', hosts: [] });
  const UNTIL = Date.now() + 30 * 86400e3, ALLX = { kind: 'everyone', scopes: [{ host: 'x.example', until: UNTIL }] };
  const seedU = ugU.setRow(EIDU, { to: [ALLX], except: [{ kind: 'conversation', key: 'cid-left-out', name: 'Left out' }] }, { reauthed: true });
  const excepted = () => ((ugU.publicFor(EIDU) || {}).except || []).some((x) => x && x.key === 'cid-left-out');
  const old = await hit('/api/vault/use-grants', { port: pU, headers: pageU, body: { id: EIDU, to: [ALLX], except: [] } });
  ok(!!(suU.status === 200 && putU && putU.ok && seedU && seedU.ok && old.status === 409 && old.json.code === 'except_unnamed' && old.json.error === UGC.WORDS.except_unnamed && old.json.principal === 'conversation:cid-left-out' && excepted()), '⑮b the WIRE (the real route, the real writer): an older page\'s Save leaving the stored 除了 out unnamed ⇒ HTTP 409 except_unnamed WITH the writer\'s sentence, naming who is left out — nothing written (7e99ef689: 400 and the bare code; the page said «Could not reach the vault — except_unnamed»)', { setup: suU.status, status: old.status, json: old.json });
  const named = await hit('/api/vault/use-grants', { port: pU, headers: pageU, body: { id: EIDU, to: [ALLX], except: [], removeExcept: ['conversation:cid-left-out'] } });
  ok(!!(named.status === 403 && named.json.code === 'reveal_needs_password' && excepted()), '⑮c control: the same Save NAMING the removal (removeExcept, through the route) is a widening — 403 reveal_needs_password without this page\'s 验证是你; still excepted', { status: named.status, code: named.json.code });
  // ⑯ B-f212's remainder (主开发 r1163 / r1177): THE ROW'S STAMP AT THE ONE WRITE — two clients over the REAL route, the real writer
  // and the run door. A Save over a row its page never saw is REFUSED BY NAME (409 row_changed, nothing written, the row that
  // holds answered with its stamp); ONE member added by a run card's «Always» (addMember) is not a whole-row write — never judged —
  // but it moves the stamp, so a dialog's next Save over the old one is refused with that member in the answer; a stamp that is
  // not an integer is no stamp the row could have; a page with no stamp (from before this release) is written as before, for
  // this one release; a Save naming members for an entry deleted meanwhile is refused entry_unknown. REDs: the writer that judges
  // no stamp (the release: B's Save over A's lands, A's member lost; the dialog's Save drops the card's member); a stamp read as
  // a number; a Save for a deleted entry written
  const J = JSON.stringify;
  const stampHub = async (UG, tag, DM = DOOR) => {
    const dd = path.join(ROOT, `stamp-${tag}`), dr = path.join(ROOT, `stamp-run-${tag}`);
    for (const d of [dd, dr]) fs.mkdirSync(d, { recursive: true });
    const v = VE.create({ dataDir: dd, kdf: { N: 1024, r: 8, p: 1 }, log, idleTimer: false, register: false, signInPassword: (p) => auth.verifyPassword(p), bcast: () => {} });
    const g = GSU.create({ dataDir: dd });
    const ug = UG.create({ grants: () => g, vault: v, dataDir: dd, log: () => {} });
    const door = DM.create({ dataDir: dd, vault: v, userTodos: new UserTodoManager({ dataDir: dd, expirySweepMs: 3600e3 }), sources: { secrets: () => VC.secretSource({ vault: v }) }, instanceKind: () => 'cluster', runRoot: () => dr, useGrants: ug, log: () => {} });
    const contents = VC.create({ vault: v, sources: { secrets: () => VC.secretSource({ vault: v }) }, runFacts: (row) => door.rowFacts(row) });   // the contents door: 验证是你's window (reveal-session) rides it
    const a = express(); a.use(auth.middleware()); a.use(express.json());
    RT.registerVaultRoutes(a, { vault: v, activeSessions: new Map(), run: door, contents });
    const s = await new Promise((r) => { const x = a.listen(0, '127.0.0.1', () => r(x)); });
    const port = s.address().port, page = { cookie: COOKIE, 'sec-fetch-site': 'same-origin', origin: `http://127.0.0.1:${port}` };
    const su = await hit('/api/vault/setup', { port, headers: page, body: { password: PW } });
    const nm = 'secret:' + crypto.randomBytes(5).toString('hex'), id = `secrets:${nm}#secret`;
    const put = v.secretPut(nm, ['stamp', 'value', crypto.randomBytes(6).toString('hex')].join('-'), { prov: 'owner', label: 'Stamp key', kind: 'api-key', hosts: [] });
    const until = Date.now() + 30 * 86400e3, mem = (key, host) => ({ kind: 'conversation', key, name: key, scopes: [{ host, until }] });
    const seed = ug.setRow(id, { to: [mem('cid-a', 'a.example'), mem('cid-b', 'b.example'), mem('cid-d', 'd.example')], except: [] }, { reauthed: true });
    const keys = () => ((ug.publicFor(id) || {}).to || []).map((m) => m.key).sort();
    let pageId = null;   // both clients' pages hold their 验证是你 window (a widening never stops a Save here: the stamp is what is judged)
    const save = (to, rev) => hit('/api/vault/use-grants', { port, headers: page, body: { id, to, except: [], ...(rev !== undefined ? { rev } : {}), page: pageId } });
    const pageRev = () => ((door.rowFacts({ id, store: 'secrets', kind: 'api-key', label: 'Stamp key', hosts: [] }) || {}).use || {}).rev;   // what a page reads: the contents row's `use`
    const keysOf = (x) => (x && x.json && x.json.use && Array.isArray(x.json.use.to) ? x.json.use.to.map((m) => m.key).sort() : null);
    const rsA = await hit('/api/vault/reveal-session', { port, headers: page, body: { password: PW } });   // the pages' 验证是你 window
    pageId = rsA.json && rsA.json.page;
    const r0 = pageRev();   // clients A and B both opened «Who may use it…» here: a, b, d
    const a1 = await save([mem('cid-a', 'a.example'), mem('cid-b', 'b.example'), mem('cid-d', 'd.example'), mem('cid-e', 'e.example')], r0);   // A adds e (a widening: its 验证是你)
    const b1 = await save([mem('cid-a', 'a.example'), mem('cid-d', 'd.example')], r0);   // B, over the row it read, takes b out (a click) — e it never saw
    const afterB = keys();
    const b2 = b1.json && b1.json.use ? await save([mem('cid-a', 'a.example'), mem('cid-d', 'd.example'), mem('cid-e', 'e.example')], b1.json.use.rev) : null;   // B again, its change kept over the row the refusal answered
    const afterB2 = keys(), r2 = pageRev();
    const card = ug.addMember(id, { kind: 'conversation', key: 'cid-f', name: 'cid-f' }, { hosts: ['f.example'], until });   // a run card's «Always» while a dialog is open: ONE member, never judged
    const afterCard = keys(), r3 = pageRev();
    const c1 = await save([mem('cid-a', 'a.example'), mem('cid-d', 'd.example'), mem('cid-e', 'e.example')], r2);   // the dialog that read r2 saves over it (f it never saw)
    const afterC = keys();
    const typed = await save([mem('cid-a', 'a.example'), mem('cid-d', 'd.example'), mem('cid-e', 'e.example')], String(pageRev()));   // a stamp as a string
    const afterTyped = keys();
    const old = await save([mem('cid-a', 'a.example'), mem('cid-d', 'd.example')]);   // a page from before this release: no stamp
    const afterOld = keys();
    // the read: an entry DELETED while a dialog is open (its row dropped — the stamp moves); a Save naming members for it, even
    // over the stamp it now has, is refused by name — no row is left waiting for the next entry stored under that name
    const dropped = v.secretDrop(nm), dropRow = ug.drop(id);
    const gone = await save([mem('cid-a', 'a.example')], pageRev());
    const afterGone = keys();
    // the narrow read: A RESTART — a row whose last member was ✕'d (the row removed, the stamp moved) and a NEW writer over the same
    // data, with no row on disk to load the sidecar through: the stamp it hands a page is the one it judges
    const nm2 = 'secret:' + crypto.randomBytes(5).toString('hex'), id2 = `secrets:${nm2}#secret`;
    const put2 = v.secretPut(nm2, ['stamp', 'two', crypto.randomBytes(6).toString('hex')].join('-'), { prov: 'owner', label: 'Stamp two', kind: 'api-key', hosts: [] });
    const seed2 = ug.setRow(id2, { to: [mem('cid-a', 'a.example')], except: [] }, { reauthed: true }), cut2 = ug.revoke(id2, 'conversation:cid-a');
    const knownRev = (ug.publicFor(id2) || {}).rev;
    const gR = GSU.create({ dataDir: dd }), ugR = UG.create({ grants: () => gR, vault: v, dataDir: dd, log: () => {} });   // the hub restarted
    const restartRev = (ugR.publicFor(id2) || {}).rev;
    const rSave = ugR.setRow(id2, { to: [mem('cid-a', 'a.example')], except: [], rev: restartRev }, { reauthed: true });
    const restart = { put2: !!(put2 && put2.ok), seed2: !!(seed2 && seed2.ok), cut2: !!(cut2 && cut2.ok), knownRev, restartRev, save: rSave && rSave.ok ? 'ok' : (rSave && rSave.code) || null };
    await new Promise((r) => setTimeout(r, 20)); s.close(); v.close();
    return { restart, setup: su.status, put: !!(put && put.ok), seed: !!(seed && seed.ok), reveal: !!(rsA.json && rsA.json.page), r0, a1: { status: a1.status, code: a1.json.code || null, rev: a1.json.use ? a1.json.use.rev : null },
      b1: { status: b1.status, code: b1.json.code || null, error: b1.json.error || null, use: keysOf(b1), rev: b1.json.use ? b1.json.use.rev : null }, afterB, b2: b2 ? { status: b2.status, code: b2.json.code || null } : null, afterB2, r2,
      card: !!(card && card.ok), afterCard, r3, c1: { status: c1.status, code: c1.json.code || null, use: keysOf(c1) }, afterC, typed: { status: typed.status, code: typed.json.code || null }, afterTyped,
      old: { status: old.status, code: old.json.code || null }, afterOld, dropped: !!(dropped && dropped.ok !== false), dropRow: !!(dropRow && dropRow.ok), gone: { status: gone.status, code: gone.json.code || null }, afterGone };
  };
  const st = await stampHub(UGC, 'real');
  const ABDE = ['cid-a', 'cid-b', 'cid-d', 'cid-e'], ADE = ['cid-a', 'cid-d', 'cid-e'], ADEF = ['cid-a', 'cid-d', 'cid-e', 'cid-f'];
  ok(st.setup === 200 && st.put && st.seed && st.reveal && Number.isSafeInteger(st.r0) && st.a1.status === 200 && st.a1.rev > st.r0
    && st.b1.status === 409 && st.b1.code === 'row_changed' && st.b1.error === UGC.WORDS.row_changed && J(st.b1.use) === J(ABDE) && st.b1.rev === st.a1.rev && J(st.afterB) === J(ABDE)
    && st.b2 && st.b2.status === 200 && J(st.afterB2) === J(ADE),
  `⑯a B-f212's remainder — TWO CLIENTS over the real route: A's Save lands (e added; the stamp moves), B's Save over the row it read (b out — e it never saw) is REFUSED 409 row_changed by name, nothing written, A's row answered with its stamp; B again over that stamp lands (b out, e kept) — ${J(st)}`, st);
  ok(st.card && J(st.afterCard) === J(ADEF) && st.r3 > st.r2 && st.c1.status === 409 && st.c1.code === 'row_changed' && J(st.c1.use) === J(ADEF) && J(st.afterC) === J(ADEF),
    `⑯b a run card's «Always» (ONE member, addMember) is never judged — it lands while a dialog is open and moves the stamp; that dialog's Save over the old stamp is refused with the card's member in the row it answers (kept) — ${J({ card: st.card, afterCard: st.afterCard, r2: st.r2, r3: st.r3, c1: st.c1, afterC: st.afterC })}`, st);
  ok(st.typed.status === 409 && st.typed.code === 'row_changed' && J(st.afterTyped) === J(ADEF) && st.old.status === 200 && J(st.afterOld) === J(['cid-a', 'cid-d']),
    `⑯c a stamp sent as a string is no stamp the row could have (refused, nothing written); a page with NO stamp (from before this release) is written as before, for this one release — ${J({ typed: st.typed, afterTyped: st.afterTyped, old: st.old, afterOld: st.afterOld })}`, st);
  ok(st.dropped && st.dropRow && st.gone.status === 404 && st.gone.code === 'entry_unknown' && J(st.afterGone) === J([]),
    `⑯e the read: an entry deleted while a dialog is open — a Save naming members for it is refused entry_unknown, no row left for it — ${J({ dropped: st.dropped, dropRow: st.dropRow, gone: st.gone, afterGone: st.afterGone })}`, st);
  ok(st.restart.put2 && st.restart.seed2 && st.restart.cut2 && Number.isSafeInteger(st.restart.knownRev) && st.restart.knownRev > 0 && st.restart.restartRev === st.restart.knownRev && st.restart.save === 'ok',
    `⑯f the narrow read: A RESTART — the row's last member ✕'d (its row gone, the stamp moved), a new writer over the same data hands a page the stamp it judges (the sidecar read once), and a Save over it lands — ${J(st.restart)}`, st.restart);
  const UG_REL = 'src/server/vault-use-grants.js', UGsrc = fs.readFileSync(path.join(REPO, UG_REL), 'utf8');
  const DOOR_REL0 = 'src/server/vault-run-door.js', DOORsrc = fs.readFileSync(path.join(REPO, DOOR_REL0), 'utf8');
  const mdir = path.join(ROOT, 'stamp-mutant'); fs.mkdirSync(mdir, { recursive: true });
  const mutant = (rel, name, src) => { const f = path.join(mdir, name); fs.writeFileSync(f, at(rel)(src)); return require(f); };
  const UGnone = mutant(UG_REL, 'vault-use-grants-none.js', anchored(UGsrc, "    if (rev !== undefined && !(Number.isSafeInteger(rev) && rev === revOf(id))) return named('row_changed', { use: landedUse(id) });\n", '', '⑯ RED the writer judges no stamp'));
  const sr = await stampHub(UGnone, 'red');
  ok(sr.b1.status === 200 && J(sr.afterB) === J(['cid-a', 'cid-d']) && sr.c1.status === 200 && J(sr.afterC) === J(ADE),
    `RED control: the writer that judges no stamp (the release) ⇒ B's Save over a row it never saw lands — A's member e lost — and the dialog's Save drops the card's member f — ${J({ b1: sr.b1, afterB: sr.afterB, c1: sr.c1, afterC: sr.afterC })}`, sr);
  const UGtyped = mutant(UG_REL, 'vault-use-grants-typed.js', anchored(UGsrc, '!(Number.isSafeInteger(rev) && rev === revOf(id))', 'Number(rev) !== revOf(id)', '⑯ RED a stamp read as a number'));
  const sr2 = await stampHub(UGtyped, 'red-typed');
  ok(sr2.typed.status === 200, `RED control: a stamp read as a number ⇒ the string stamp is taken as the row's — ${J({ typed: sr2.typed })}`, sr2.typed);
  const DOORgone = mutant(DOOR_REL0, 'vault-run-door-gone.js', anchored(DOORsrc, "    if (vaultState() === 'unlocked' && Array.isArray(to) && to.length && !(sref && rowOf(sref))) return named('entry_unknown');\n", '', '⑯ RED a Save for a deleted entry written'));
  const UGmem = mutant(UG_REL, 'vault-use-grants-memory.js', anchored(UGsrc, '  const revSeen = (id) => { if (!genLoaded) loadGen(); return revNow(id); };', '  const revSeen = (id) => revNow(id);', '⑯ RED the page\'s stamp from memory alone'));
  const sr4 = await stampHub(UGmem, 'red-memory');
  ok(sr4.restart.restartRev === 0 && sr4.restart.save === 'row_changed', `RED control: the page's stamp from memory alone ⇒ after a restart the page is handed 0 and its Save is refused over a stamp it was given — ${J(sr4.restart)}`, sr4.restart);
  const sr3 = await stampHub(UGC, 'red-gone', DOORgone);
  ok(sr3.gone.status === 200 && J(sr3.afterGone) === J(['cid-a']), `RED control: a Save for a deleted entry written ⇒ a row is left for it, waiting for the next entry stored under that name — ${J({ gone: sr3.gone, afterGone: sr3.afterGone })}`, sr3.gone);
  // ⑯d CENSUS (主开发 r1177): EVERY CALLER OF THE WHOLE-ROW WRITE at this tip — each sends the stamp, or is a named EXCEPTION with
  // its reason; a write of ONE member is not a whole-row write (never judged; it moves the stamp). Every row printed; a caller
  // the table does not name, a count that moved, a row that drops its stamp: red. REDs: an unnamed caller planted; the route's
  // stamp dropped
  const WHOLE_ROW = [
    { file: 'src/lib/vault-use-row.js', at: "post('/api/vault/use-grants', {", n: 1, stamp: '...(rev != null ? { rev } : {})', why: 'the «Who may use it…» dialog: sends the stamp of the row it last landed' },
    { file: 'src/routes/vault.js', at: "app.post('/api/vault/use-grants', ", n: 1, stamp: "...('rev' in b ? { rev: b.rev } : {})", why: 'the route: hands the page\'s stamp to the door (a body with none — a page from before this release — is written as before for one release)' },
    { file: 'src/server/vault-run-door.js', at: 'useGrants.setRow(String(id), {', n: 1, stamp: '...(rev !== undefined ? { rev } : {})', why: 'saveRow, the route\'s door: hands the stamp to the writer' },
    { file: 'src/server/vault-run-door.js', at: 'rawSetRow(id, row, opts)', n: 1, stamp: 'rawSetRow(id, row, opts)', why: 'the resume wrapper around the one writer: the row passes as it came, its stamp in it' },
    { file: 'src/server/vault-run-door.js', at: 'useGrants.restoreRow(', n: 1, stamp: null, why: 'EXCEPTION — the run door\'s all-or-nothing puts back the row it snapshotted for its OWN write a moment before (no page read that row)' },
    { file: 'src/server/vault-run-door.js', at: 'useGrants.carry(', n: 1, stamp: null, why: 'EXCEPTION — the boot carry of the old «always» rows into the grants (a migration: no page)' },
    { file: 'src/server/vault-run-door.js', at: 'useGrants.carryWildcards(', n: 1, stamp: null, why: 'EXCEPTION — the boot carry of the legacy wildcard grants (a migration: no page)' },
    { file: 'src/server/migrations.js', at: "g.set('vault-use', raw.resource,", n: 1, stamp: null, why: 'EXCEPTION — the boot migration reshapes each row to per-scope members IN PLACE, beneath the one writer (the same meaning, the same marks; at boot, before any page)' },
  ];
  const ONE_MEMBER = ['addMember', 'revoke', 'revokeWindow', 'pruneWindows', 'drop'];   // never judged: each moves the stamp
  const WRITE_RE = /\b(setRow|saveRow|rawSetRow|restoreRow|carryWildcards)\(|\.carry\(|\/api\/vault\/use-grants['"`]|\.(set|remove)\((U\.DOOR|['"]vault-use['"])/;   // + a grants-store write of the door anywhere but the one writer itself
  const wrFiles = (() => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) walk(r); else if (e.isFile()) out.push(r); } }; walk('src'); walk('data/bin'); return out.concat(['server.js']).sort(); })();
  // r1563 (B-7e49 slice 1, lane bl-tests-e): THE TREE ONCE A RUN — the census and its two RED controls read every file of
  // wrFiles through this suite's own memo (each read it from disk again); a control still plants its ONE file over it
  const WR_TEXT = new Map();
  const wrText = (f) => { let t = WR_TEXT.get(f); if (t === undefined) { try { t = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { t = ''; } WR_TEXT.set(f, t); } return t; };
  // r1708 (B-7e49 slice 2, lane bl-tests-e): THE WRITE LINES ONCE A TEXT — the census and its two RED controls tested WRITE_RE
  // (no /g: stateless) on every line of every file; each text's matching lines are found once here and the census judges only
  // those, its every condition as before
  const WRITE_LINES = new Map();
  const writeLinesOf = (text) => { let r = WRITE_LINES.get(text); if (r === undefined) { r = []; text.split('\n').forEach((l, i) => { if (WRITE_RE.test(l)) r.push([l, i]); }); WRITE_LINES.set(text, r); } return r; };
  const censusOf = (textOf) => {
    const unnamed = [], noStamp = [], counts = new Map(WHOLE_ROW.map((w) => [w, 0]));
    for (const f of wrFiles) {
      writeLinesOf(String(textOf(f) || '')).forEach(([l, i]) => {
        const tl = l.trim();
        if (!WRITE_RE.test(l) || /^(\/\/|\*|\/\*)/.test(tl) || /^(async )?function (setRow|saveRow|restoreRow|carry|carryWildcards)\(/.test(tl)) return;
        if (f === 'src/server/vault-use-grants.js' && /\.(set|remove)\(U\.DOOR/.test(l) && !/\b(setRow|saveRow|rawSetRow|restoreRow|carryWildcards)\(|\.carry\(/.test(l)) return;   // the one writer's own store writes (each inside a named function above)
        const w = WHOLE_ROW.filter((x) => x.file === f && l.includes(x.at));
        if (!w.length) { unnamed.push(`${f}:${i + 1}`); return; }
        for (const x of w) { counts.set(x, counts.get(x) + 1); if (x.stamp && !l.includes(x.stamp)) noStamp.push(`${f}:${i + 1}`); }
      });
    }
    return { unnamed, noStamp, miscounted: WHOLE_ROW.filter((w) => counts.get(w) !== w.n).map((w) => `${w.file} «${w.at}» ${counts.get(w)}≠${w.n}`), counts };
  };
  const cz = censusOf(wrText);
  for (const w of WHOLE_ROW) console.log(`  · whole-row write: ${w.file} «${w.at}» ×${cz.counts.get(w)} — ${w.stamp ? 'SENDS THE STAMP' : 'named exception'}: ${w.why}`);
  console.log(`  · not a whole-row write (never judged, each moves the stamp): ${ONE_MEMBER.join(', ')} — src/server/vault-use-grants.js`);
  ok(!cz.unnamed.length && !cz.noStamp.length && !cz.miscounted.length, `⑯d CENSUS: every caller of the whole-row write at this tip is named — ${WHOLE_ROW.filter((w) => w.stamp).length} send the stamp, ${WHOLE_ROW.filter((w) => !w.stamp).length} named exceptions; ${wrFiles.length} files read — ${J({ unnamed: cz.unnamed, noStamp: cz.noStamp, miscounted: cz.miscounted })}`, cz);
  const DOOR_REL = 'src/server/vault-run-door.js', ROUTE_REL = 'src/routes/vault.js';
  const sneak = anchored(wrText(DOOR_REL), '  function windowTakenBack(pk, until) {', '  function sneakRow(id) { return grantsW.setRow(String(id), { to: [], except: [] }, {}); }\n  function windowTakenBack(pk, until) {', '⑯d RED an unnamed caller');
  const czR = censusOf((f) => (f === DOOR_REL ? sneak : wrText(f)));
  const bare = anchored(wrText(ROUTE_REL), "...('rev' in b ? { rev: b.rev } : {}) }", ' }', '⑯d RED the route drops the stamp');
  const czR2 = censusOf((f) => (f === ROUTE_REL ? bare : wrText(f)));
  ok(czR.unnamed.length === 1 && czR.unnamed[0].startsWith(DOOR_REL) && czR2.noStamp.length === 1 && czR2.noStamp[0].startsWith(ROUTE_REL), `RED control: one more whole-row caller planted is named unnamed; the route without the stamp is named — ${J({ unnamed: czR.unnamed, noStamp: czR2.noStamp })}`, { czR, czR2 });
  await new Promise((r) => setTimeout(r, 20));
  sU.close(); vU.close();
}

srv.close(); vault.close(); console.warn = warn0;
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
