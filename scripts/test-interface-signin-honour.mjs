#!/usr/bin/env node
// THE PIPED HUB RECOMPUTES THE INTERFACE'S WORD (the separation, M1 — lane B, piece B3b-2; 主开发 r1517 (A): B3b-1 and B3b-2 are
// picked only together — no train ever holds a piped hub that takes the interface's word for a cookie without recomputing it).
// FAST, in-process: today's hub as the interface's party (src/server/interface-party.js, src/server/hub-port.js) behind the REAL
// gate in the piped form (src/server/piped-auth.js over src/auth.js's middleware); a FAKE interface where a leg must write a fact
// the real one never writes, the REAL interface with its table (src/interface/signin.js) where it must answer.
//   ① THE HONOUR CHECK (law 4): a fact that names the head's own login is served; one that names ANOTHER login than the cookie the
//      head carries — or a fact with no cookie, or a malformed one — is refused, and the refusal is said by name. RED: B3b-1's
//      gate (the fact taken as it came) serves the head whose fact names another login.
//   ② THE REVOKE LINE, HELD UNTIL ITS ANSWER: a vault lock (revokeAllTokens) says `{op:'signin-revoke-all', why}` on the link; until
//      the interface answers it, NO login is honoured, even one whose fact matches; its answer lifts the hold and names the count in
//      the hub's journal. RED: the hold cut — a login is honoured before the answer.
//   ③ ACROSS A RE-JOIN: the interface gone, a vault lock; the order is kept; a NEW interface on the same path (its table over the
//      same file) hears it FIRST after the join — before any answer the hub writes — and signs the old login out (written); the old
//      cookie is refused there. RED: the order not said after the join — the file keeps the old login.
//   ④ THE CENSUS: one sign-in reader in the hub's tree (server.js builds PipedAuth in the piped form; no `new Auth(` anywhere
//      else), no quoted 'auth.json' outside src/auth.js but the vendor CLI's own (codex) files, and src/auth.js required elsewhere
//      for its statics only. RED: each rule planted.
import './scratch.mjs';   // FIRST (主开发 r1845 2, test-architecture §113: the scratch import before every other)
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const express = require('express');
const { ok: check, report } = checker();
/** the condition first (made a boolean), the name a string — a swap throws (test-ci-gate-tiers §7b) */
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError('ok(condition, name): the name comes second, a string'); return check(!!c, n, d); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iface-honour-'));   // 0700: this account's alone
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
function mutant(rel, needle, into) { const src = read(rel); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once in ${rel}: ${needle.slice(0, 80)}`); return compileAt(rel, src.replace(needle, into)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) return false; await sleep(5); } return true; };
const quiet = { log() { }, error() { }, warn() { } };
const said = (lines) => ({ log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)) });
const { Mux } = require(path.join(REPO, 'src/agentd/mux.js'));
const IP = require(path.join(REPO, 'src/server/interface-party.js'));
const HP = require(path.join(REPO, 'src/server/hub-port.js'));
const PA = require(path.join(REPO, 'src/server/piped-auth.js'));
const ST = require(path.join(REPO, 'src/signin-table.js'));
const SI = require(path.join(REPO, 'src/interface/signin.js'));
const LP = require(path.join(REPO, 'src/link-proof.js'));
let n = 0;
const sock = () => path.join(T, `s${++n}.sock`);
const secretPair = () => { const s = crypto.randomBytes(32).toString('hex'); return { secret: s, digest: crypto.createHash('sha256').update(s).digest('hex') }; };
const tok = () => crypto.randomBytes(24).toString('hex');

/** the hub's app: the gate in the piped form (`AuthClass` over `opts`), one page route */
function hubApp(AuthClass, opts) {
  const auth = new AuthClass(fs.mkdtempSync(path.join(T, 'hub-')), opts);
  const app = express(); app.use(auth.middleware()); app.get('/api/x', (req, res) => res.json({ served: true }));
  return { auth, server: http.createServer(app) };
}
/** a FAKE interface on `link`: any proof admitted; it writes the open lines a leg names and holds its revoke answer until told */
async function fakeInterface(link, { holdAck = false } = {}) {
  let side = null, chan = 0; const got = new Map(), revokes = []; let release = null;
  const srv = net.createServer((s) => {
    side = new Mux(s, { heartbeat: false, closeAfterQueue: true,
      onControl: (m) => {
        if (m && m.op === 'hello') { side.control({ op: 'hello-ack', protoVersion: 2, party: 'interface', capabilities: ['relay@1', 'signin@1'] }); side.control({ op: 'signin-state', enabled: true, password: true, sso: false, held: null }); }
        else if (m && m.op === 'signin-revoke-all') { revokes.push(m); const ack = () => side.control({ op: 'signin-revoke-all-ack', revoked: 3 }); if (holdAck) release = ack; else ack(); }
      },
      onData: (c, b) => { got.set(c, (got.get(c) || '') + b.toString('latin1')); side.credit(c, b.length); }, onClose: () => { } });
    side.control({ op: 'challenge', protoVersion: 2, nonce: LP.challenge() });
  }).listen(link);
  await new Promise((r) => srv.once('listening', r));
  /** ONE head on its own channel with `fact` on its stamp → the hub's status */
  const head = async (cookie, fact) => {
    const c = ++chan;
    side.control({ op: 'open', chan: c, to: 'hub', trace: 't', stamp: { secure: false, addr: '127.0.0.1', port: 1, signin: fact } });
    side.data(c, Buffer.from(`GET /api/x HTTP/1.1\r\nHost: hub.example\r\nAccept: application/json\r\n${cookie ? `Cookie: vs_token=${cookie}\r\n` : ''}Connection: close\r\n\r\n`, 'latin1'));
    await until(() => /HTTP\/1\.1 \d{3}/.test(got.get(c) || ''), 3000);
    return Number((/HTTP\/1\.1 (\d{3})/.exec(got.get(c) || '') || [])[1] || 0);
  };
  return { head, revokes, ack: () => release && release(), linked: () => !!side, close: () => { try { side && side.destroy(); } catch { } srv.close(); } };
}
/** the hub joined to a fake interface by hand (no wiring): its gate over the given class */
async function joinedHub(AuthClass, opts = {}) {
  const link = sock(), F = await fakeInterface(link), k = secretPair(), lines = [];
  const H = hubApp(AuthClass, { subscribe: () => { }, revoke: () => { }, revokePending: () => false, log: said(lines), ...opts });
  const party = await IP.join({ start: { party: 'hub', secret: k.secret, link }, server: H.server, log: quiet });
  return { F, H, lines, close: () => { try { party.mux.destroy(); } catch { } F.close(); } };
}

console.log('— ① THE HONOUR CHECK: the hub recomputes the digest from the cookie of the head it parsed itself (law 4)');
async function honour(AuthClass) {
  const J = await joinedHub(AuthClass);
  const A = tok(), B = tok();
  const r = {
    own: await J.F.head(A, { alive: ST.tokenDigest(A) }),
    other: await J.F.head(A, { alive: ST.tokenDigest(B) }),
    noCookie: await J.F.head(null, { alive: ST.tokenDigest(A) }),
    malformed: await J.F.head(A, { alive: 'not-a-digest' }),
    none: await J.F.head(A, null),
    off: await J.F.head(null, 'off'),
  };
  r.named = J.lines.filter((l) => /names another login than the cookie it carries/.test(l)).length;
  J.close(); return r;
}
{
  const r = await honour(PA.PipedAuth);
  ok(r.own === 200 && r.other === 401 && r.noCookie === 401 && r.malformed === 401 && r.none === 401 && r.off === 200 && r.named === 1,
    `the fact naming the head's own login: ${r.own}; ANOTHER login than its cookie: ${r.other}, said by name (${r.named}); a fact with no cookie ${r.noCookie}, a malformed one ${r.malformed}, none ${r.none}; 'off' ${r.off}`, r);
  const asTaken = mutant('src/server/piped-auth.js', "    if (!hashMatches(tokenDigest(token), f.alive)) { this._mismatch(); return false; }   // THE HONOUR CHECK\n", '');
  const red = await honour(asTaken.PipedAuth);
  ok(red.other === 200, `RED CONTROL — B3b-1's gate (the fact taken as it came): the head whose fact names another login is SERVED (${red.other})`, red);
}

console.log('— ② THE REVOKE LINE, HELD UNTIL ITS ANSWER (a vault lock in the piped form)');
async function held(mod) {
  const link = sock(), F = await fakeInterface(link, { holdAck: true }), k = secretPair(), lines = [];
  const H = hubApp(mod.PipedAuth, { subscribe: (fn) => { HP.onSigninState(fn); }, log: said(lines) });
  const hubObj = { listen: () => hubObj };
  HP.wire({ form: 'piped', start: { party: 'hub', secret: k.secret, link } }, { hub: hubObj, server: H.server, join: (o) => IP.join({ ...o, log: quiet }), end: () => { }, log: quiet, rejoinMs: 3000 });
  let booted = false; hubObj.listen(0, '127.0.0.1', () => { booted = true; });
  await until(() => booted, 3000);
  const A = tok(), fact = { alive: ST.tokenDigest(A) };
  const r = { before: await F.head(A, fact) };
  r.returned = H.auth.revokeAllTokens();
  r.said = await until(() => F.revokes.length === 1, 2000);
  r.why = F.revokes[0] && F.revokes[0].why;
  r.pending = HP.revokePending();
  r.waiting = await F.head(A, fact);
  F.ack();
  r.lifted = await until(() => !HP.revokePending(), 2000);
  r.after = await F.head(A, fact);
  r.count = lines.filter((l) => /the interface signed 3 login\(s\) out/.test(l)).length;
  F.close(); return r;
}
{
  const r = await held(PA);
  ok(r.before === 200 && r.returned === 0 && r.said && r.why === 'the vault was locked' && r.pending && r.waiting === 401 && r.lifted && r.after === 200 && r.count === 1,
    `a vault lock: the order said on the link («${r.why}»); until the interface answers it, a login whose fact MATCHES is refused (${r.waiting}); the answer lifts the hold (${r.after}) and names the count in the journal`, r);
  const cut = await held(mutant('src/server/piped-auth.js', "    if (this.#pending()) return false;   // a vault lock's revoke said, not yet answered: no login is honoured\n", ''));
  ok(cut.waiting === 200, `RED CONTROL — the hold cut: a login is honoured before the interface answered the revoke (${cut.waiting})`, cut);
}

console.log('— ③ ACROSS A RE-JOIN: the order kept while no interface holds the hub, said FIRST to the next one');
async function rejoin(hp) {
  const dir = fs.mkdtempSync(path.join(T, 'tbl-')), file = path.join(dir, 'auth.json');
  const link = sock(), k = secretPair(), lines = [];
  const anInterface = async () => {
    const t = SI.create({ file, log: quiet }); await t.load();
    const I = require(path.join(REPO, 'src/interface/index.js')).create({ signin: t, log: quiet, helloMs: 2000 });
    const where = await I.listen(0, '127.0.0.1');
    try { fs.rmSync(link, { force: true }); } catch { }
    const srv = net.createServer((s) => I.attachLink(s)); await new Promise((r) => srv.listen(link, r));
    I.admit({ party: 'hub', digest: k.digest });
    return { I, t, port: where.port, close: async () => { srv.close(); await I.close(); try { fs.rmSync(link, { force: true }); } catch { } } };
  };
  const ask = (port, method, p, { cookie, body } = {}) => new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const q = http.request({ host: '127.0.0.1', port, method, path: p, agent: false, headers: { accept: 'application/json', 'sec-fetch-site': 'same-origin', ...(cookie ? { cookie: `vs_token=${cookie}` } : {}), ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) } }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, cookies: [].concat(res.headers['set-cookie'] || []) })); });
    q.on('error', () => resolve({ status: 0, cookies: [] })); if (data) q.write(data); q.end();
  });
  const A = await anInterface();
  const H = hubApp(PA.PipedAuth, { subscribe: (fn) => { hp.onSigninState(fn); }, revoke: (why) => hp.signinRevokeAll(why), revokePending: () => hp.revokePending(), log: said(lines) });   // the hooks of THIS hub-port (a red's copy too)
  const out = []; const connect = (p) => { const s = net.connect(p); const w = s.write.bind(s); s.write = (d, ...rest) => { out.push({ at: out.length, d: Buffer.from(d) }); return w(d, ...rest); }; return s; };
  const hubObj = { listen: () => hubObj };
  hp.wire({ form: 'piped', start: { party: 'hub', secret: k.secret, link } }, { hub: hubObj, server: H.server, join: (o) => IP.join({ ...o, connect, log: quiet }), end: () => { lines.push('ENDED'); }, log: said(lines), rejoinMs: 4000 });
  let booted = false; hubObj.listen(0, '127.0.0.1', () => { booted = true; });
  await until(() => booted, 3000);
  const first = await ask(A.port, 'POST', '/api/auth/set-password', { body: { newPassword: 'pw-rejoin-8' } });
  const C = (first.cookies.map((c) => /^vs_token=([a-f0-9]+);/.exec(c)).find(Boolean) || [])[1];
  await A.t.flushed();
  const r = { mine: (await ask(A.port, 'GET', '/api/x', { cookie: C })).status };
  await A.close();   // THE INTERFACE GOES
  await until(() => lines.some((l) => l.includes('link ended')), 2000);
  H.auth.revokeAllTokens();   // a vault lock while no interface holds this hub
  r.kept = hp.revokePending();
  const mark = out.length;
  const B = await anInterface();   // a NEW interface on the same path, its table over the same file (the old login still in it)
  r.rejoined = await until(() => lines.some((l) => l.includes('a new interface took this hub')), 4000);
  r.answered = await until(() => !hp.revokePending(), 2000);
  await B.t.flushed();
  r.old = (await ask(B.port, 'GET', '/api/x', { cookie: C })).status;
  const sent = Buffer.concat(out.slice(mark).map((x) => x.d)).toString('latin1');
  r.order = { revoke: sent.indexOf('"op":"signin-revoke-all"'), hello: sent.indexOf('"op":"hello"'), answer: sent.indexOf('HTTP/1.1 ') };
  r.tokens = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).tokens || {}).length;
  await B.close(); try { H.server.close(); } catch { }
  return r;
}
{
  const r = await rejoin(HP);
  ok(r.mine === 200 && r.kept && r.rejoined && r.answered && r.old === 401 && r.tokens === 0,
    `the interface gone, a vault lock: the order KEPT (${r.kept}); a new interface on the same path takes the hub, hears it and signs the old login out — written (${r.tokens} left); the old cookie ${r.old} there`, r);
  ok(r.order.hello >= 0 && r.order.revoke > r.order.hello && r.order.answer > r.order.revoke,
    `and the order is the FIRST thing the hub says after its hello to the new interface — before any answer it writes (hello ${r.order.hello} < revoke ${r.order.revoke} < the first answer ${r.order.answer})`, r.order);
  const SAY = '            party = p; sayRevoke();   // B3b-2: a revoke not yet answered is the FIRST thing this hub says to the new interface\n';
  const silent = await rejoin(mutant('src/server/hub-port.js', SAY, '            party = p;\n'));
  ok(silent.tokens >= 1 && silent.answered === false, `RED CONTROL — the order not said after the join: the new interface never hears it — the file keeps the old login (${silent.tokens}), the hold never lifts`, silent);
}

console.log('— ④ THE CENSUS: one sign-in reader in the hub\'s tree; no reader of data/auth.json but src/auth.js');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const files = ['server.js', ...(function walk(d) { return fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'lib' && d === 'src' ? [] : walk(`${d}/${e.name}`)) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : [])); })('src')];
  const VENDOR = 'src/harnesses/codex.js';   // the vendor CLI's own descriptor: ITS auth.json (~/.codex), never the sign-in table
  /** → the rules' findings over { rel → text } */
  function census(texts) {
    const out = [];
    for (const [rel, raw] of texts) {
      const src = strip(raw);
      if (/\bnew Auth\(/.test(src)) out.push(`${rel}: new Auth( — a second sign-in reader`);
      if (rel !== 'src/auth.js' && rel !== VENDOR) for (const [i, l] of src.split('\n').entries()) if (/['"]auth\.json['"]/.test(l) && !/codex/i.test(l)) out.push(`${rel}:${i + 1}: a quoted 'auth.json' outside src/auth.js — a reader of the sign-in table`);
      if (rel !== 'server.js' && rel !== 'src/auth.js' && /require\(\s*['"][./]*(?:src\/)?auth(?:\.js)?['"]\s*\)/.test(src)) {
        const uses = [...src.matchAll(/\bAuth\b(?:\.(\w+))?/g)].map((m) => m[1] || '').filter((u) => !['signInHandle', 'cookieToken', ''].includes(u));
        const extendsOnly = /class \w+ extends Auth\b/.test(src);
        const bareUses = [...src.matchAll(/\bAuth\b(?!\.)/g)].length - (src.match(/\{ Auth \}/g) || []).length - (extendsOnly ? 1 : 0);
        if (uses.length || bareUses > 0) out.push(`${rel}: src/auth.js used beyond its statics (${uses.join(', ') || `${bareUses} bare`})`);
      }
    }
    const srv = texts.get('server.js') || '';
    if ((srv.match(/new \(require\('\.\/src\/server\/hub-port\.js'\)\.piped\(\) \? require\('\.\/src\/server\/piped-auth\.js'\)\.PipedAuth : Auth\)\(/g) || []).length !== 1) out.push('server.js: the ONE sign-in reader is not built by the piped switch (PipedAuth in the piped form)');
    return out;
  }
  const texts = new Map(files.map((f) => [f, read(f)]));
  const real = census(texts);
  ok(real.length === 0, `over server.js and ${files.length - 1} src/ files: one sign-in reader (server.js's piped switch), no quoted 'auth.json' outside src/auth.js but codex's own, src/auth.js elsewhere for its statics only (${real.length} findings)`, real);
  const plant = (rel, f) => { const m = new Map(texts); m.set(rel, f(m.get(rel))); return census(m); };
  const p1 = plant('server.js', (t) => t.replace("new (require('./src/server/hub-port.js').piped() ? require('./src/server/piped-auth.js').PipedAuth : Auth)(", 'new Auth('));
  const p2 = plant('src/server/vault-hooks.js', (t) => t + "\nconst _peek = (d) => require('fs').readFileSync(require('path').join(d, 'auth.json'), 'utf8');\n");
  const p3 = plant('src/device-audit.js', (t) => t + '\nconst _second = (d) => new Auth(d);\n');
  ok(p1.some((x) => /piped switch/.test(x)) && p1.some((x) => /new Auth\(/.test(x)) && p2.some((x) => /vault-hooks.*auth\.json/.test(x)) && p3.some((x) => /device-audit/.test(x)),
    'RED CONTROLS — server.js building today\'s Auth in every form, a hub module reading data/auth.json, a second reader built from src/auth.js: each found by name', { p1, p2, p3 });
}

report();
