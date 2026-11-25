#!/usr/bin/env node
// THE SIGN-IN TABLE IN THE INTERFACE (the separation, M1 — lane B, piece B3b-1; 主开发 r1060 «the interface's ONE store», r1517:
// GO with decision (A); B3b-1 and B3b-2 are picked only together: no train ever holds a piped hub that takes the interface's word
// for a cookie without recomputing it). FAST, in-process: the REAL table (src/interface/signin.js) over the REAL shared law
// (src/signin-table.js), the REAL interface (src/interface/index.js) with today's hub as its party (src/server/interface-party.js)
// behind the REAL gate in the piped form (src/server/piped-auth.js over src/auth.js's middleware), every file on a scratch folder
// of this account's alone — never a real sign-in file.
//   ① ONE LAW, BOTH HOLDERS: every shape B-dc3f holds (text that does not parse, a table that is null, a folder in its place, a
//      link to nothing, a link loop, a password record that is not text, a file that cannot be opened) is HELD by the plain form's
//      hub and by the interface, with the same words; a missing file is a new instance in both; a table one holder wrote verifies
//      in the other (the same scrypt). RED: the interface's hold cut — a torn table reads as no sign-in.
//   ② THE ROAD, BOTH FORMS (a differential): one script of requests — sign-in off, the first password, the page, a wrong and a
//      right password, set-password without a login and with a wrong current one, the change that signs the others out, the
//      logout, a cross-site write, the counters' lock — and single sign-on through a stand-in; each step's status, body and
//      cookie kind are the plain form's. RED: the counters cut in the interface — the lock step differs.
//   ③ THE FIFTH HASH IS REFUSED BY NAME: four hashes in flight, the fifth sign-in answered 503 «signin-busy» at once. RED: the
//      bound lifted.
//   ④ HELD IN THE INTERFACE: shut — every head 503 by name (an API, a page in en and ja), the sign-in page 200 with the held words
//      (GET and HEAD), every upgrade refused but a paired machine's dial-in; under single sign-on the password road refused, a
//      single sign-on login kept in memory; NOTHING written (the path and its folder compared). RED: the held answer cut.
//   ⑤ THE START LINE NAMES THE TABLE: no `signin`, a relative path, a folder other accounts can write — each a bad start by name
//      (exit 2); a good one listens and says the table; `generate` makes a password and says it once. RED: the check cut.
//   ⑥ ONE WRITER, END TO END: the piped hub opens NO auth.json (a spy on every synchronous fs call naming it) while the interface
//      signs a person in, the hub's gate takes the stamp's fact (off ⇒ open; a live login ⇒ served; none or a forged cookie ⇒
//      401 / the login page), the table's state line reaches the hub, the slide's cookie rides the answer once, and the hub's
//      revoke line signs every login out (written). RED: today's hub (src/auth.js) under the same spy reads the file.
//   ⑦ THE ASYNC WRITER: never through a link (ELOOP), the old bytes overwritten in the retired inode, 0600; ONE write in flight,
//      the newest table coalesced (three changes in a burst: two writes). RED: a second writer allowed — two in flight.
import './scratch.mjs';   // FIRST (主开发 r1845 2, test-architecture §113: the scratch import before every other)
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const express = require('express');
const { ok: check, report } = checker();
/** the condition first (made a boolean), the name a string — a swap throws (test-ci-gate-tiers §7b) */
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError('ok(condition, name): the name comes second, a string'); return check(!!c, n, d); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iface-signin-'));   // 0700: this account's alone (the table's folder rule)
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
/** `rel` compiled with ONE piece swapped — the needle must occur exactly once, or the control is void (it throws) */
function mutant(rel, needle, into) { const src = read(rel); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once in ${rel}: ${needle.slice(0, 80)}`); return compileAt(rel, src.replace(needle, into)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) return false; await sleep(5); } return true; };
const quiet = { log() { }, error() { }, warn() { } };
const said = (lines) => ({ log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)) });
const ST = require(path.join(REPO, 'src/signin-table.js'));
const SI = require(path.join(REPO, 'src/interface/signin.js'));
const { Auth } = require(path.join(REPO, 'src/auth.js'));
const LW = require(path.join(REPO, 'src/login-words.js'));
const SF = require(path.join(REPO, 'src/secret-file.js'));
let nDir = 0;
const freshDir = () => { const d = path.join(T, `d${++nDir}`); fs.mkdirSync(d, { mode: 0o700 }); return d; };
/** what stands at the table's path and in its folder — compared before and after, so «nothing is written» is a fact */
function stateOf(dir) {
  const p = path.join(dir, 'auth.json'); let at;
  try {
    const st = fs.lstatSync(p);
    at = { kind: st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : 'file', ino: st.ino, size: st.size, mtime: st.mtimeMs, mode: st.mode };
    if (at.kind === 'link') at.to = fs.readlinkSync(p); else if (at.kind === 'dir') at.list = fs.readdirSync(p);
    else { try { at.sha = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (e) { at.sha = `unreadable ${e.code}`; } }
  } catch (e) { at = { kind: 'none', code: e.code }; }
  return JSON.stringify({ at, dir: fs.readdirSync(dir).sort() });
}
/** the plain form's hub over `dir`, its journal silenced (B-dc3f says the held line once) */
function plainAuth(dir, opts = {}) { const e = console.error, w = console.warn; console.error = () => { }; console.warn = () => { }; try { return new Auth(dir, opts); } finally { console.error = e; console.warn = w; } }
/** ONE request → { status, headers, body, json, cookies } */
function ask(port, method, p, { headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const q = http.request({ host: '127.0.0.1', port, method, path: p, agent: false, headers: { ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}), ...headers } }, (r) => {
      let d = ''; r.setEncoding('utf8'); r.on('data', (c) => { d += c; });
      r.on('end', () => { let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: r.statusCode, headers: r.headers, body: d, json: j, cookies: [].concat(r.headers['set-cookie'] || []) }); });
    });
    q.on('error', (e) => resolve({ status: 0, error: e.code, headers: {}, body: '', json: null, cookies: [] }));
    if (data) q.write(data); q.end();
  });
}
const SAME = { 'sec-fetch-site': 'same-origin' };
const CROSS = { 'sec-fetch-site': 'cross-site', origin: 'https://elsewhere.example' };
const tokenIn = (cookies) => { for (const c of cookies) { const m = /^vs_token=([a-f0-9]+);/.exec(c); if (m) return m[1]; } return null; };
/** what a cookie line does: cleared, set with its Max-Age (the slide's 30 days on a sign-in), or nothing */
const cookieKind = (cookies) => { if (cookies.some((c) => /^vs_token=;.*Max-Age=0/.test(c))) return 'clear'; const m = cookies.map((c) => /^vs_token=[a-f0-9]{48};.*Max-Age=(\d+)/.exec(c)).find(Boolean); return m ? `set:${m[1]}` : 'none'; };
/** a stand-in for the outside sign-in service (src/clerk-auth.js's shape) */
const clerkStandIn = () => ({ enabled: true, frontendApi: 'sso.example', publishableKey: 'pk_test_c3NvLmV4YW1wbGUk', emailAllowed: (e) => /@example\.test$/.test(e), verifyToken: async (t) => { if (t === 'bad') throw new Error('bad signature'); return { email: t === 'noemail' ? '' : t === 'stranger' ? 'x@elsewhere.example' : 'person@example.test' }; } });

/** the INTERFACE'S road alone: a page server whose every head meets the table first; what it does not answer is «relayed» —
 *  answered 299 with the fact the stamp would carry (no hub here: ② and ④ judge the table's own answers) */
async function tableServer(table) {
  const srv = http.createServer((req, res) => {
    const facts = { secure: false, addr: req.socket.remoteAddress, port: req.socket.remotePort };
    if (table.road(req, res, facts)) return;
    const h = table.head(req, facts); req.resume();
    res.writeHead(299, { 'content-type': 'application/json', 'x-fact': JSON.stringify(h.fact), ...(h.lines.length ? { 'set-cookie': h.lines[1] } : {}) }); res.end(JSON.stringify({ relayed: true, fact: h.fact }));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, close: () => new Promise((r) => srv.close(r)) };
}
/** the PLAIN form's hub: the gate first, the road, one page route (server.js's mount order) */
async function plainServer(auth) {
  const app = express(); app.use(auth.middleware()); auth.registerRoutes(app); app.get('/api/x', (req, res) => res.json({ served: true }));
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, close: () => new Promise((r) => srv.close(r)) };
}

console.log('— ① ONE LAW, BOTH HOLDERS (B-dc3f\'s shapes: the plain form\'s hub and the interface)');
{
  const MODE0 = 'a file that cannot be opened (mode 000)';
  const SHAPES = [
    ['text that does not parse', (d) => fs.writeFileSync(path.join(d, 'auth.json'), '{"passwordHash":"ab')],
    ['a table that is null', (d) => fs.writeFileSync(path.join(d, 'auth.json'), 'null')],
    ['a folder in its place', (d) => fs.mkdirSync(path.join(d, 'auth.json'))],
    ['a link to nothing', (d) => fs.symlinkSync(path.join(d, 'gone.json'), path.join(d, 'auth.json'))],
    ['a link loop', (d) => fs.symlinkSync(path.join(d, 'auth.json'), path.join(d, 'auth.json'))],
    ['a password record that is not text', (d) => fs.writeFileSync(path.join(d, 'auth.json'), JSON.stringify({ passwordHash: 5, salt: 'aa' }))],
    ...(process.getuid && process.getuid() !== 0 ? [[MODE0, (d) => { fs.writeFileSync(path.join(d, 'auth.json'), '{}'); fs.chmodSync(path.join(d, 'auth.json'), 0); }]] : []),
  ];
  for (const [name, make] of SHAPES) {
    const d = freshDir(); make(d); const before = stateOf(d);
    const plain = plainAuth(d), lines = [], t = SI.create({ file: path.join(d, 'auth.json'), log: said(lines) });
    await t.load();
    ok(!!plain.held && !!t.held && plain.held.why === t.held.why && t.shut && t.enabled && lines.filter((l) => /THE SIGN-IN FILE IS HELD/.test(l)).length === 1 && stateOf(d) === before,
      `${name}: HELD by both holders, the same words («${t.held && t.held.why}»), the interface says it once, nothing written`, { plain: plain.held, iface: t.held, lines });
    if (name === MODE0) fs.chmodSync(path.join(d, 'auth.json'), 0o600);   // the scratch folder is removable again
  }
  const dm = freshDir(), tm = SI.create({ file: path.join(dm, 'auth.json'), log: quiet }); await tm.load();
  const pm = plainAuth(dm);
  ok(!tm.held && !tm.enabled && !pm.held && !pm.enabled && stateOf(dm) === JSON.stringify({ at: { kind: 'none', code: 'ENOENT' }, dir: [] }), 'a missing file: a new instance in both (sign-in off, nothing held, nothing written)');
  // a table the PLAIN form wrote verifies in the interface, and the other way round (one scrypt)
  const d1 = freshDir(); plainAuth(d1).setPassword('plain-wrote-1');
  const t1 = SI.create({ file: path.join(d1, 'auth.json'), log: quiet }); await t1.load(); const s1 = await tableServer(t1);
  const a1 = await ask(s1.port, 'POST', '/api/login', { headers: SAME, body: { password: 'plain-wrote-1' } }); await s1.close();
  const d2 = freshDir(), t2 = SI.create({ file: path.join(d2, 'auth.json'), log: quiet }); await t2.load(); const s2 = await tableServer(t2);
  const a2 = await ask(s2.port, 'POST', '/api/auth/set-password', { headers: SAME, body: { newPassword: 'iface-wrote-2' } }); await t2.flushed(); await s2.close();
  ok(a1.status === 200 && cookieKind(a1.cookies) === 'set:2592000' && a2.status === 200 && plainAuth(d2).verifyPassword('iface-wrote-2') && !plainAuth(d2).verifyPassword('iface-wrote-3'),
    'a table the plain form wrote signs a person in through the interface, and one the interface wrote verifies in the plain form (one hash)', { a1: a1.status, a2: a2.status });
  const cut = mutant('src/interface/signin.js', '    if (j.held) hold(j.held);\n', '    if (j.held) state = null;\n');
  const dc = freshDir(); fs.writeFileSync(path.join(dc, 'auth.json'), '{"passwordHash":"ab');
  const tc = cut.create({ file: path.join(dc, 'auth.json'), log: quiet }); await tc.load();
  ok(!tc.held && !tc.enabled, 'RED CONTROL — the interface\'s hold cut: a torn table reads as NO sign-in (the instance open)', { held: tc.held, enabled: tc.enabled });
}

console.log('— ② THE ROAD, BOTH FORMS (one script; each step\'s status, body and cookie kind are the plain form\'s)');
/** the script over one form → each step's { status, body (JSON, or html / the redirect's Location), cookie kind } */
async function script(port, sso) {
  const out = [], jar = {};
  const step = async (name, method, p, { cookie = null, headers = {}, body } = {}) => {
    const r = await ask(port, method, p, { headers: { ...(cookie && jar[cookie] ? { cookie: `vs_token=${jar[cookie]}` } : {}), ...headers }, body });
    const t = tokenIn(r.cookies); if (t) jar[name] = t;
    const own = (j) => JSON.parse(JSON.stringify(j).split(`127.0.0.1:${port}`).join('OWN'));   // each form's own origin, by name
    out.push({ name, status: r.status, body: r.json !== null ? own(r.json) : r.status === 302 ? `→ ${r.headers.location}` : /<html|<!doctype/i.test(r.body) ? `html${r.headers['content-security-policy-report-only'] ? '+csp' : ''}` : r.body.slice(0, 40), cookie: cookieKind(r.cookies) });
    return r;
  };
  if (!sso) {
    await step('off-login', 'POST', '/api/login', { headers: SAME, body: { password: 'x' } });
    await step('off-page', 'GET', '/login', { headers: { accept: 'text/html' } });
    await step('first', 'POST', '/api/auth/set-password', { headers: SAME, body: { newPassword: 'pw-one-1' } });
    await step('page', 'GET', '/login', { headers: { accept: 'text/html' } });
    await step('page-in', 'GET', '/login', { cookie: 'first', headers: { accept: 'text/html' } });
    await step('wrong', 'POST', '/api/login', { headers: SAME, body: { password: 'nope' } });
    await step('right', 'POST', '/api/login', { headers: SAME, body: { password: 'pw-one-1' } });
    await step('set-anon', 'POST', '/api/auth/set-password', { headers: SAME, body: { current: 'pw-one-1', newPassword: 'pw-two-2' } });
    await step('set-wrong', 'POST', '/api/auth/set-password', { cookie: 'right', headers: SAME, body: { current: 'nope', newPassword: 'pw-two-2' } });
    await step('set-short', 'POST', '/api/auth/set-password', { cookie: 'right', headers: SAME, body: { current: 'pw-one-1', newPassword: 'ab' } });
    await step('change', 'POST', '/api/auth/set-password', { cookie: 'right', headers: SAME, body: { current: 'pw-one-1', newPassword: 'pw-two-2' } });
    await step('old-out', 'GET', '/login', { cookie: 'right', headers: { accept: 'text/html' } });
    await step('new-in', 'GET', '/login', { cookie: 'change', headers: { accept: 'text/html' } });
    await step('logout', 'POST', '/api/logout', { cookie: 'change', headers: SAME });
    await step('after-out', 'GET', '/login', { cookie: 'change', headers: { accept: 'text/html' } });
    await step('cross', 'POST', '/api/login', { headers: CROSS, body: { password: 'pw-two-2' } });
    for (let i = 0; i < 5; i++) await step(`lock${i}`, 'POST', '/api/login', { headers: SAME, body: { password: 'nope' } });
    await step('locked', 'POST', '/api/login', { headers: SAME, body: { password: 'pw-two-2' } });
  } else {
    await step('sso-page', 'GET', '/login', { headers: { accept: 'text/html' } });
    await step('sso-in', 'POST', '/api/clerk-login', { headers: SAME, body: { token: 'ok' } });
    await step('sso-noemail', 'POST', '/api/clerk-login', { headers: SAME, body: { token: 'noemail' } });
    await step('sso-stranger', 'POST', '/api/clerk-login', { headers: SAME, body: { token: 'stranger' } });
    await step('sso-bad', 'POST', '/api/clerk-login', { headers: SAME, body: { token: 'bad' } });
    await step('sso-pw-anon', 'POST', '/api/auth/set-password', { headers: SAME, body: { newPassword: 'pw-sso-3' } });
    await step('sso-pw', 'POST', '/api/auth/set-password', { cookie: 'sso-in', headers: SAME, body: { newPassword: 'pw-sso-3' } });
    await step('sso-pw-login', 'POST', '/api/login', { headers: SAME, body: { password: 'pw-sso-3' } });
  }
  return out;
}
/** the interface's form of the script (its table on a fresh folder) */
async function ifaceForm(sso, mod = SI) {
  const t = mod.create({ file: path.join(freshDir(), 'auth.json'), clerkAuth: sso ? clerkStandIn() : null, log: quiet }); await t.load();
  const I = await tableServer(t); const out = await script(I.port, sso); await I.close(); return out;
}
const diffOf = (plain, iface) => plain.map((p, i) => ({ p, q: iface[i] })).filter(({ p, q }) => JSON.stringify(p) !== JSON.stringify(q));
async function bothForms(sso) {
  const P = await plainServer(plainAuth(freshDir(), sso ? { clerk: clerkStandIn() } : {}));
  const plain = await script(P.port, sso); await P.close();
  const iface = await ifaceForm(sso);
  return { plain, iface, diff: diffOf(plain, iface) };
}
{
  const a = await bothForms(false);
  ok(a.diff.length === 0 && a.plain.length === 22 && a.plain.find((s) => s.name === 'locked').status === 429 && a.plain.find((s) => s.name === 'cross').status === 403 && a.plain.find((s) => s.name === 'change').cookie === 'set:2592000',
    `the password road: ${a.plain.length} steps, each the plain form's (${a.plain.map((s) => `${s.name} ${s.status}${s.cookie === 'none' ? '' : ' ' + s.cookie}`).join(' · ')})`, a.diff);
  const b = await bothForms(true);
  ok(b.diff.length === 0 && b.plain.find((s) => s.name === 'sso-in').cookie === 'set:2592000' && b.plain.find((s) => s.name === 'sso-pw-anon').status === 401 && b.plain.find((s) => s.name === 'sso-pw-login').status === 200,
    `single sign-on (a stand-in of the outside service): ${b.plain.length} steps, each the plain form's (${b.plain.map((s) => `${s.name} ${s.status}`).join(' · ')})`, b.diff);
  const noLock = mutant('src/interface/signin.js', "      if (!enabled()) return json(res, 200, { success: true }, cookies);\n      const release = reserve(ip);\n      if (!release) return json(res, 429,", "      if (!enabled()) return json(res, 200, { success: true }, cookies);\n      const release = () => { };\n      if (false) return json(res, 429,");   // the follow: the counters' place is reserve()
  const c = { diff: diffOf(a.plain, await ifaceForm(false, noLock)) };   // against the plain form's reading above
  ok(c.diff.some(({ p, q }) => p.name === 'locked' && p.status === 429 && q.status === 200), 'RED CONTROL — the counters cut in the interface: the lock step differs from the plain form (429 there, a sign-in here)', c.diff.map(({ p, q }) => `${p.name}: ${p.status}/${q.status}`));
}

console.log('— ③ THE FIFTH HASH IS REFUSED BY NAME (four in flight)');
async function fifth(mod) {
  const d = freshDir(); plainAuth(d).setPassword('pw-busy-4');
  const waiting = [];
  const slow = (pw, salt) => new Promise((resolve) => waiting.push(() => resolve(ST.hash(pw, salt))));
  const t = mod.create({ file: path.join(d, 'auth.json'), log: quiet, hashOf: slow }); await t.load();
  const s = await tableServer(t);
  const rs = [0, 1, 2, 3].map(() => ask(s.port, 'POST', '/api/login', { headers: SAME, body: { password: 'pw-busy-4' } }));
  await until(() => waiting.length >= 4, 3000);
  const five = await Promise.race([ask(s.port, 'POST', '/api/login', { headers: SAME, body: { password: 'pw-busy-4' } }), sleep(600).then(() => null)]);
  const inFlight = waiting.length;
  while (waiting.length) waiting.shift()();
  const four = await Promise.all(rs); await s.close();
  return { five, four: four.map((r) => r.status), inFlight };
}
{
  const r = await fifth(SI);
  ok(r.inFlight === 4 && r.five && r.five.status === 503 && r.five.json && r.five.json.code === 'signin-busy' && r.four.every((x) => x === 200),
    `four hashes in flight, the fifth sign-in answered at once: ${r.five && r.five.status} «${r.five && r.five.json && r.five.json.code}»; the four signed in (${r.four.join(', ')})`, r);
  const lifted = await fifth(mutant('src/interface/signin.js', 'const SCRYPT_MAX = 4;', 'const SCRYPT_MAX = 99;'));
  ok(!lifted.five || lifted.five.status !== 503, `RED CONTROL — the bound lifted: the fifth is not refused (${lifted.five ? lifted.five.status : 'it waits with the others'})`, lifted);
}

console.log('— ③b THE GUESS BOUND COUNTS THE GUESSES IN FLIGHT (the follow: an address gets RATE_FAILS tries, not more, however many at once)');
async function guesses(mod) {
  const d = freshDir(); plainAuth(d).setPassword('pw-guess-9');
  const waiting = []; let hold = false, hashed = 0;
  const hashOf = (pw, salt) => { if (!hold) return ST.hash(pw, salt); hashed++; return new Promise((resolve) => waiting.push(() => resolve(ST.hash(pw, salt)))); };
  const t = mod.create({ file: path.join(d, 'auth.json'), log: quiet, hashOf }); await t.load();
  const s = await tableServer(t);
  for (let i = 0; i < ST.RATE_FAILS - 1; i++) await ask(s.port, 'POST', '/api/login', { headers: SAME, body: { password: 'wrong' } });   // one try left
  hold = true;
  const rs = Array.from({ length: 4 }, () => ask(s.port, 'POST', '/api/login', { headers: SAME, body: { password: 'wrong' } }));   // then four AT ONCE
  await until(() => waiting.length >= 1, 3000); await sleep(80);
  const inFlight = hashed;
  while (waiting.length) waiting.shift()();
  const all = await Promise.all(rs); await s.close();
  return { hashed: inFlight, refused: all.filter((r) => r.status === 429).length, statuses: all.map((r) => r.status) };
}
{
  const r = await guesses(SI);
  ok(r.hashed === 1 && r.refused === 3, `one try left, then four wrong guesses AT ONCE from the address: ${r.hashed} reaches the hash, ${r.refused} are answered 429 before any (the release's ${ST.RATE_FAILS} a lock, not more)`, r);
  const loose = await guesses(mutant('src/interface/signin.js', '    if ((a ? a.fails : 0) + inflight >= T.RATE_FAILS) return null;\n', ''));
  ok(loose.hashed === 4, `RED CONTROL — the guesses in flight not counted: all ${loose.hashed} pass the bound before any fail is counted (${ST.RATE_FAILS - 1 + loose.hashed} guesses in one lock)`, loose);
}

console.log('— ③c CLERK\'S KEY SET: the last good one answers when a refresh fails (the interface\'s option); none ⇒ fails closed');
{
  const { ClerkAuth } = require(path.join(REPO, 'src/clerk-auth.js'));
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' };
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b64u({ alg: 'RS256', kid: 'k1' }), pl = b64u({ email: 'person@example.test', iss: 'https://sso.example', exp: Math.floor(Date.now() / 1000) + 600 });
  const jwt = `${h}.${pl}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${pl}`), privateKey).toString('base64url')}`;
  const pk = 'pk_test_' + Buffer.from('sso.example$').toString('base64');
  const realFetch = globalThis.fetch; let up = true, asked = 0;
  globalThis.fetch = async () => { asked++; if (!up) throw new Error('the key service is unreachable'); return { ok: true, status: 200, json: async () => ({ keys: [jwk] }) }; };
  const verify = (c) => c.verifyToken(jwt).then((v) => v.email, (e) => `refused: ${e.message}`);
  try {
    const keep = new ClerkAuth({ publishableKey: pk, allowedEmails: 'person@example.test', keepLastGood: true });
    const first = await verify(keep); keep._jwksFetchedAt = 0; up = false;   // an hour on: the refresh fails
    const kept = await verify(keep);
    up = true; const plain = new ClerkAuth({ publishableKey: pk, allowedEmails: 'person@example.test' });
    await verify(plain); plain._jwksFetchedAt = 0; up = false;
    const plainAfter = await verify(plain);
    const never = await verify(new ClerkAuth({ publishableKey: pk, allowedEmails: 'person@example.test', keepLastGood: true }));
    ok(first === 'person@example.test' && kept === 'person@example.test' && /unreachable/.test(String(keep.lastFetchError)),
      `keepLastGood: a refresh that fails keeps the last good key set — the sign-in still verifies (${kept}; the failure kept: «${keep.lastFetchError}»)`, { first, kept });
    ok(/^refused: the key service is unreachable/.test(plainAfter) && /^refused: the key service is unreachable/.test(never),
      `without the option (the plain form, today's) the same refresh refuses (${plainAfter}); with no set ever fetched it FAILS CLOSED (${never})`, { plainAfter, never, asked });
  } finally { globalThis.fetch = realFetch; }
}

console.log('— ④ HELD IN THE INTERFACE (shut, and under single sign-on): refused by name, nothing written');
async function heldLeg(mod, { sso = false } = {}) {
  const d = freshDir(); fs.writeFileSync(path.join(d, 'auth.json'), '{"passwordHash":"ab'); const before = stateOf(d);
  const t = mod.create({ file: path.join(d, 'auth.json'), clerkAuth: sso ? clerkStandIn() : null, log: quiet }); await t.load();
  const s = await tableServer(t);
  const r = {
    api: await ask(s.port, 'GET', '/api/x', { headers: { accept: 'application/json' } }),
    page: await ask(s.port, 'GET', '/', { headers: { accept: 'text/html' } }),
    pageJa: await ask(s.port, 'GET', '/', { headers: { accept: 'text/html', 'accept-language': 'ja' } }),
    login: await ask(s.port, 'GET', '/login', { headers: { accept: 'text/html' } }),
    head: await ask(s.port, 'HEAD', '/LOGIN/'),
    pw: await ask(s.port, 'POST', '/api/login', { headers: SAME, body: { password: 'x' } }),
    set: await ask(s.port, 'POST', '/api/auth/set-password', { headers: SAME, body: { newPassword: 'pw-held-5' } }),
    sso: sso ? await ask(s.port, 'POST', '/api/clerk-login', { headers: SAME, body: { token: 'ok' } }) : null,
  };
  const fakeUp = (u) => ({ url: u, headers: {} });
  r.upgradeWs = t.upgradeRefused(fakeUp('/ws')); r.upgradeDial = t.upgradeRefused(fakeUp('/api/agentd-dial'));
  if (r.sso) { const tok = tokenIn(r.sso.cookies); r.ssoFact = t.head({ method: 'GET', url: '/api/x', headers: { cookie: `vs_token=${tok}`, accept: 'application/json' } }, {}).fact; }
  t.revokeAll(); await t.load(); await t.flushed(); await s.close();
  r.same = stateOf(d) === before;
  return r;
}
{
  const r = await heldLeg(SI);
  const en = LW.loginWords('en'), ja = LW.loginWords('ja');
  ok(r.api.status === 503 && r.api.json && r.api.json.error === 'signin-held' && r.api.headers['retry-after'] === '3600' && r.page.status === 503 && r.page.body.includes(en['signin-held']) && r.pageJa.body.includes(ja['signin-held']),
    `shut: an API 503 «signin-held» (Retry-After 3600), a page 503 in the asked language (en, ja) — before every door and route`, { api: r.api.status, page: r.page.status });
  ok(r.login.status === 200 && r.login.body.includes(en['signin-held']) && r.head.status === 200 && r.pw.status === 503 && r.set.status === 503,
    `shut: the sign-in page answers AS A PAGE (GET ${r.login.status}, HEAD /LOGIN/ ${r.head.status}: a health check asks it); the password road ${r.pw.status} / ${r.set.status}`);
  ok(r.upgradeWs === true && r.upgradeDial === false && r.same, 'shut: every upgrade refused but a paired machine\'s dial-in; NOTHING written (a sign-in, a set-password, a revoke and a second load ran)', r.same);
  const q = await heldLeg(SI, { sso: true });
  ok(q.pw.status === 503 && q.pw.json && q.pw.json.why === LW.loginWords('en')['signin-held-sso'] && q.set.status === 503 && q.login.status === 200 && q.sso.status === 200 && q.ssoFact && /^[0-9a-f]{64}$/.test(q.ssoFact.alive) && q.api.status === 299 && q.upgradeWs === false && q.same,
    `held under single sign-on: the password road refused (${q.pw.status}, the sso words), the page served (${q.login.status}), a single sign-on login KEPT IN MEMORY (its fact alive), the rest relayed — nothing written`, { pw: q.pw.status, sso: q.sso.status, api: q.api.status, same: q.same });
  const cut = await heldLeg(mutant('src/interface/signin.js', "      if (shut()) { req.resume(); refuseHeld(req, res, { page: (req.method === 'GET' || req.method === 'HEAD') && key === '/login' }); return true; }\n", ''));
  ok(cut.api.status !== 503, `RED CONTROL — the held answer cut: an API head is relayed past a held table (${cut.api.status})`, cut.api.status);
}

console.log('— ⑤ THE START LINE NAMES THE TABLE (src/interface/main.js)');
async function startWith(signin, mod = require(path.join(REPO, 'src/interface/main.js'))) {
  const pipe = new PassThrough(), exits = [], lines = [];
  const link = path.join(T, `l${++nDir}.sock`);
  const m = mod.main({ pipe, env: { PORT: '0', HOST: '127.0.0.1' }, exit: (c) => exits.push(c), log: said(lines) });
  pipe.write(JSON.stringify({ op: 'start', party: 'interface', secret: crypto.randomBytes(32).toString('hex'), link, ...(signin === undefined ? {} : { signin }) }) + '\n');
  const up = await m.ready.then(() => true, () => false);
  if (up) await m.stop(0); else await until(() => exits.length, 2000);
  return { up, exits, lines };
}
{
  const none = await startWith(undefined), rel = await startWith({ file: 'data/auth.json' });
  const open = freshDir(); fs.chmodSync(open, 0o777); const foreign = await startWith({ file: path.join(open, 'auth.json') });
  ok(!none.up && none.exits[0] === 2 && none.lines.some((l) => /names no sign-in table/.test(l)) && !rel.up && rel.exits[0] === 2 && rel.lines.some((l) => /is not absolute/.test(l)) && !foreign.up && foreign.exits[0] === 2 && foreign.lines.some((l) => /sign-in table's folder .* can be written by other accounts/.test(l)),
    `no table, a relative path, a folder other accounts can write: each a bad start by name, exit 2 (${[none, rel, foreign].map((x) => x.exits[0]).join(', ')})`, [none.lines, rel.lines, foreign.lines]);
  fs.chmodSync(open, 0o700);
  const good = freshDir(), g = await startWith({ file: path.join(good, 'auth.json') });
  const gen = freshDir(), made = await startWith({ file: path.join(gen, 'auth.json'), generate: true });
  const pw = (made.lines.find((l) => /Generated workspace password: /.test(l)) || '').replace(/^.*Generated workspace password: (\S+).*$/, '$1');
  ok(g.up && g.lines.some((l) => /the sign-in table .*auth\.json \(sign-in off\)/.test(l)) && made.up && pw.length === 12 && plainAuth(gen).verifyPassword(pw) && made.lines.filter((l) => l.includes(pw)).length === 1,
    'a good table: it listens and says it (sign-in off); `generate` makes a password, written, and says it ONCE', { g: g.lines, made: made.lines.length });
  const cut = await startWith(undefined, mutant('src/interface/main.js', '    if (judged.why) { const e = new Error(judged.why); e.badStart = true; throw e; }\n', ''));
  ok(cut.exits[0] !== 2, `RED CONTROL — the check cut: a start line with no table is no longer refused by name (exit ${cut.exits[0]})`, cut.lines);
}

console.log('— ⑥ ONE WRITER, END TO END: the piped hub opens no auth.json; its gate takes the stamp\'s fact');
const SYNC_FS = ['readFileSync', 'openSync', 'lstatSync', 'statSync', 'existsSync', 'writeFileSync', 'renameSync', 'accessSync', 'realpathSync', 'readdirSync'];
/** every synchronous fs call naming `file` while `f` runs (and its awaits) */
async function spyOn(file, f) {
  const seen = [], saved = SYNC_FS.map((k) => [k, fs[k]]);
  for (const [k, orig] of saved) fs[k] = function (...a) { if (typeof a[0] === 'string' && a[0].includes(file)) seen.push(`${k} ${path.basename(a[0])}`); return orig.apply(this, a); };
  try { return { out: await f(), seen }; } finally { for (const [k, orig] of saved) fs[k] = orig; }
}
async function endToEnd(AuthClass) {
  const dir = freshDir(), file = path.join(dir, 'auth.json');
  let base = Date.now(), shift = 0; const now = () => base + shift;
  const table = SI.create({ file, log: quiet, now }); await table.load();
  const I = require(path.join(REPO, 'src/interface/index.js')).create({ signin: table, log: quiet });
  const where = await I.listen(0, '127.0.0.1');
  const sock = path.join(T, `e${++nDir}.sock`); const linkSrv = net.createServer((s) => I.attachLink(s)).listen(sock); await new Promise((r) => linkSrv.once('listening', r));
  let stateFn = () => { }; const states = [];
  const { out, seen } = await spyOn(file, async () => {
    const auth = new AuthClass(dir, { subscribe: (fn) => { stateFn = fn; } });
    const app = express(); const hubSaw = [];
    app.use((req, res, next) => { hubSaw.push(req.path); next(); });
    app.use(auth.middleware()); auth.registerRoutes(app);
    const { signinFactOf } = require(path.join(REPO, 'src/server/interface-party.js'));
    app.get('/api/x', (req, res) => res.json({ served: true, fact: signinFactOf(req.socket) === undefined ? 'none' : signinFactOf(req.socket) }));
    const hub = http.createServer(app);
    const k = crypto.randomBytes(32).toString('hex'); I.admit({ party: 'hub', digest: crypto.createHash('sha256').update(k).digest('hex') });
    const P = require(path.join(REPO, 'src/server/interface-party.js'));
    const party = await P.join({ start: { party: 'hub', secret: k, link: sock }, server: hub, onSignin: (m) => { states.push(m); stateFn(m); }, log: quiet });
    const port = where.port, r = {};
    r.off = await ask(port, 'GET', '/api/x', { headers: { accept: 'application/json' } });
    r.first = await ask(port, 'POST', '/api/auth/set-password', { headers: SAME, body: { newPassword: 'pw-e2e-6' } });
    const A = tokenIn(r.first.cookies);
    r.told = await until(() => states.some((m) => m.enabled === true), 2000);
    r.anon = await ask(port, 'GET', '/api/x', { headers: { accept: 'application/json' } });
    r.anonPage = await ask(port, 'GET', '/', { headers: { accept: 'text/html' } });
    r.mine = await ask(port, 'GET', '/api/x', { headers: { accept: 'application/json', cookie: `vs_token=${A}` } });
    r.forged = await ask(port, 'GET', '/api/x', { headers: { accept: 'application/json', cookie: `vs_token=${'ab'.repeat(24)}` } });
    shift = 2 * 3600e3;   // two hours on: the next use moves usedAt on disk, and its answer carries the cookie again
    r.slid = await ask(port, 'GET', '/api/x', { headers: { accept: 'application/json', cookie: `vs_token=${A}` } });
    r.again = await ask(port, 'GET', '/api/x', { headers: { accept: 'application/json', cookie: `vs_token=${A}` } });
    party.mux.control({ op: 'signin-revoke-all', why: 'the vault was locked' });   // B3b-2's sender, said here by hand
    const ack = () => states.find((m) => m.op === 'signin-revoke-all-ack');
    r.acked = await until(() => !!ack(), 2000); r.revoked = ack() && ack().revoked;
    r.after = await ask(port, 'GET', '/api/x', { headers: { accept: 'application/json', cookie: `vs_token=${A}` } });
    await table.flushed();
    r.road = hubSaw.filter((p) => /login|logout|set-password/.test(p));
    r.A = A; r.auth = auth;
    try { party.mux.destroy(); } catch { } hub.close();
    return r;
  });
  await I.close(); linkSrv.close();
  return { r: out, seen, file };
}
{
  const PA = require(path.join(REPO, 'src/server/piped-auth.js'));
  const { r, seen, file } = await endToEnd(PA.PipedAuth);
  ok(seen.length === 0, `the piped hub opens NO auth.json: ${seen.length} synchronous fs calls named it while the interface signed a person in, slid and revoked`, seen);
  ok(r.off.status === 200 && r.off.json && r.off.json.fact === 'off' && r.first.status === 200 && !!r.A && r.told,
    `sign-in off: the stamp says 'off' and the hub serves (${r.off.status}); the first password set through the interface (${r.first.status}); its state line reached the hub`, { off: r.off.json, told: r.told });
  ok(r.anon.status === 401 && r.anonPage.status === 302 && r.anonPage.headers.location === '/login' && r.mine.status === 200 && r.mine.json.fact && r.mine.json.fact.alive === ST.tokenDigest(r.A) && r.forged.status === 401,
    `the hub's gate takes the fact: no cookie 401 / the login page; the interface's login served (its fact the login's full digest); a forged cookie 401`, { anon: r.anon.status, page: r.anonPage.status, mine: r.mine.status, forged: r.forged.status });
  ok(r.slid.status === 200 && r.slid.cookies.some((c) => c.startsWith(`vs_token=${r.A};`) && /Max-Age=\d+/.test(c)) && r.again.cookies.length === 0,
    'THE SLIDE: two hours on, the use moves the login on disk and its answer carries the cookie again — once', { slid: r.slid.cookies, again: r.again.cookies });
  const tokens = JSON.parse(fs.readFileSync(file, 'utf8')).tokens || {};
  ok(r.acked && r.revoked >= 1 && r.after.status === 401 && Object.keys(tokens).length === 0 && r.road.length === 0,
    `the hub's revoke line: every login signed out (${r.revoked}), written; the old cookie 401; no head of the sign-in road reached the hub`, { revoked: r.revoked, after: r.after.status, tokens: Object.keys(tokens).length, road: r.road });
  ok(r.auth.bootLine().includes('in the interface') && r.auth.exportPasswordRecord() === null && r.auth.revokeAllTokens() === 0 && (() => { try { r.auth.importPasswordRecord({ passwordHash: 'a', salt: 'b' }); return false; } catch (e) { return e.code === PA.IN_INTERFACE; } })(),
    'DECLARED, in the piped hub: its boot line says the table is the interface\'s; no password record to export; an import refused by name; a revoke from here 0 (B3b-2 sends it on the link)');
  const red = await endToEnd(class extends Auth { constructor(d) { super(d); } });
  ok(red.seen.length > 0, `RED CONTROL — today's hub (src/auth.js) under the same spy reads the file (${red.seen.slice(0, 3).join(', ')})`, red.seen);
}

console.log('— ⑦ THE ASYNC WRITER (src/secret-file.js replaceShreddingAsync): one in flight, the newest coalesced');
{
  const d = freshDir(), f = path.join(d, 'auth.json');
  fs.writeFileSync(path.join(d, 'target.json'), 'kept'); fs.symlinkSync(path.join(d, 'target.json'), f);
  const viaLink = await SF.replaceShreddingAsync(f, 'new').then(() => 'written', (e) => e.code);
  fs.unlinkSync(f); fs.writeFileSync(f, 'secret-old-bytes', { mode: 0o600 }); fs.linkSync(f, path.join(d, 'retired'));
  await SF.replaceShreddingAsync(f, '{"new":1}');
  const retired = fs.readFileSync(path.join(d, 'retired'));
  ok(viaLink === 'ELOOP' && fs.readFileSync(path.join(d, 'target.json'), 'utf8') === 'kept' && fs.readFileSync(f, 'utf8') === '{"new":1}' && (fs.statSync(f).mode & 0o777) === 0o600 && retired.length === 16 && !retired.toString().includes('secret-old'),
    'never through a link (ELOOP, the target untouched); the new text 0600; the old bytes overwritten in the retired inode', { viaLink, retired: retired.toString('hex').slice(0, 16) });
  async function burst(rel) {
    let inFlight = 0, most = 0, writes = 0;
    globalThis.__vsSigninWriter = { replaceShreddingAsync: async (file, text) => { inFlight++; most = Math.max(most, inFlight); writes++; await sleep(30); try { return await SF.replaceShreddingAsync(file, text); } finally { inFlight--; } } };
    const WRITER = "const { replaceShreddingAsync } = require('../secret-file.js');";
    if (read('src/interface/signin.js').split(WRITER).length !== 2) throw new Error('CONTROL needle not found exactly once: the table\'s writer');
    const src = read('src/interface/signin.js').replace(WRITER, 'const { replaceShreddingAsync } = globalThis.__vsSigninWriter;');
    const M = compileAt('src/interface/signin.js', rel ? rel(src) : src);
    const dd = freshDir(); plainAuth(dd).setPassword('pw-burst-7');
    const t = M.create({ file: path.join(dd, 'auth.json'), log: quiet }); await t.load();
    t.revokeAll(); t.revokeAll(); t.revokeAll();
    await sleep(5); await t.flushed(); await sleep(5); await t.flushed();
    return { most, writes };
  }
  const one = await burst(null);
  ok(one.most === 1 && one.writes === 2, `three changes in a burst: ${one.writes} writes, at most ${one.most} in flight (the first, then the newest coalesced)`, one);
  const two = await burst((src) => { if (src.split('    if (!writing) writing = drain();\n').length !== 2) throw new Error('CONTROL needle'); return src.replace('    if (!writing) writing = drain();\n', '    writing = drain();\n'); });
  ok(two.most > 1, `RED CONTROL — a second writer allowed: ${two.most} writes in flight at once`, two);
}

report();
