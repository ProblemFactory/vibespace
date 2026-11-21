#!/usr/bin/env node
// THE DOOR CLASS (the separation, M1 — lane B, piece B3a; src/door.js): ONE PURE function over what a request IS — its method,
// its path, its headers and whether its connection is TLS — answering how it comes in, before any cookie is read: a door, a
// cross-site refusal, an open instance, the login flow, or a page the owner's cookie decides.
//   ① THE FUNCTION: its five kinds; pure (the same request twice ⇒ the same class, a frozen request is never written); its
//     module graph is src/write-origin.js and built-ins only (no store, no clock, no I/O); the middleware's door lines live
//     there VERBATIM (15) and src/auth.js holds none of them any more.
//   ② THE CORPUS ANSWERED AS MASTER ANSWERS IT: every request of the corpus — each door, the login flow, pages and APIs behind
//     the gate, cross-site writes and WebSocket handshakes, same-origin writes — through MASTER's own gate (src/auth.js
//     middleware() frozen from 22353751e: scripts/fixtures/auth-middleware-before-b3a.cjs) and through TODAY's (the middleware
//     judging through doorOf), with sign-in on and off and with no cookie, a valid one and a stale one: the SAME answer every
//     time (next() or the status, the redirect, the body). Every row it judged is printed. RED CONTROL: a copy of src/door.js
//     with ONE door line cut (the OTel ingest), under a copy of the auth layer that requires it ⇒ the corpus differs, by name.
// in-process; a scratch dir under os.tmpdir().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 1500) : '')); } return !!c; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-door-class-'));
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
const D = require(path.join(REPO, 'src/door.js'));
const { Auth } = require(path.join(REPO, 'src/auth.js'));
const before = require(path.join(REPO, 'scripts/fixtures/auth-middleware-before-b3a.cjs'));

console.log('— ① THE FUNCTION: five kinds, pure, its graph, the door lines verbatim');
{
  const H = { host: 'hub.example:3456' };   // a host by name (test-architecture §81: no literal loopback endpoint in a suite)
  const kinds = new Set([
    D.doorOf({ method: 'POST', path: '/otel/v1/logs', headers: H }).kind,
    D.doorOf({ method: 'POST', path: '/api/tasks', headers: { ...H, origin: 'https://elsewhere.example' } }).kind,
    D.doorOf({ method: 'GET', path: '/api/home', headers: H }, { enabled: false }).kind,
    D.doorOf({ method: 'GET', path: '/login', headers: H }).kind,
    D.doorOf({ method: 'GET', path: '/api/home', headers: H }).kind,
  ]);
  ok(JSON.stringify([...kinds].sort()) === JSON.stringify(['door', 'login', 'open', 'page', 'refused']), `the five kinds: ${[...kinds].join(', ')}`);
  const r = Object.freeze({ method: 'POST', path: '/api/tasks', headers: Object.freeze({ ...H, origin: 'https://elsewhere.example' }), encrypted: false });
  const a = D.doorOf(r), b = D.doorOf(r);
  ok(JSON.stringify(a) === JSON.stringify(b) && a.kind === 'refused' && a.verdict && a.verdict.ok === false, `pure: the same (frozen) request twice ⇒ the same class: ${JSON.stringify(a).slice(0, 160)}`);
  const src = read('src/door.js');
  const reqs = [...src.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  const wo = [...read('src/write-origin.js').matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  ok(JSON.stringify(reqs) === JSON.stringify(['./write-origin.js']) && wo.every((x) => /^node:/.test(x)) && !/\b(fs|Date\.now|setTimeout|process\.env)\b/.test(src.replace(/\/\/.*$/gm, '')), `its graph: ${reqs.join(', ')} (which requires ${wo.join(', ') || 'nothing'}) — no store, no clock, no I/O`);
  const inDoor = (src.match(/return next\(\);/g) || []).length;   // a door may span lines (the device bundles' door does): count its «through a door» calls
  const asrc = read('src/auth.js'), mwBody = asrc.slice(asrc.indexOf('  middleware() {'), asrc.indexOf('  /** Issue a login token'));
  const predicates = (mwBody.match(/\bp === '|\bp\.startsWith\(|\.test\(p\)/g) || []).length;
  ok(inDoor === 15 && predicates === 0, `the middleware's door lines live in src/door.js (${inDoor} «through a door» calls) and src/auth.js middleware() holds no path predicate any more (${predicates})`);
  const mw = read('src/auth.js');
  ok(/const d = doorOf\(\{ method: req\.method, path: req\.path, headers: req\.headers, encrypted: !!\(req\.socket && req\.socket\.encrypted\) \}, \{ enabled: this\.enabled \}\);/.test(mw), 'src/auth.js middleware() judges every request THROUGH doorOf (one source)');
}

console.log('— ② THE CORPUS ANSWERED AS MASTER ANSWERS IT (master = the gate frozen from 22353751e)');
const OWN = 'hub.example:3456', OWN_ORIGIN = 'http://hub.example:3456', FOREIGN = 'https://elsewhere.example';   // hosts by name (§81)
const TOKEN24 = 'AbCdEfGhIjKlMnOpQrStUvWx';
/** [name, method, path, extra headers] — a door, the login flow, pages and APIs, cross-site writes and handshakes */
const CORPUS = [
  ['dav root', 'GET', '/dav', {}], ['dav file PROPFIND', 'PROPFIND', '/dav/a/b.txt', {}],
  ['agent API', 'GET', '/api/agent/session-status', {}], ['agent API write', 'POST', '/api/agent/msg', { 'content-type': 'application/json' }],
  ['the editor bridge', 'POST', '/api/editor/open', {}],
  ['device bundle', 'GET', '/agentd.js', {}], ['device installer sh', 'GET', '/agentd-install.sh', {}], ['device installer ps1', 'GET', '/agentd-install.ps1', {}],
  ['device bundle (new name)', 'GET', '/vibespace-device.js', {}], ['device installer (new name) sh', 'GET', '/vibespace-device-install.sh', {}], ['device installer (new name) ps1', 'GET', '/vibespace-device-install.ps1', {}],
  ['device dial', 'GET', '/api/agentd-dial', { upgrade: 'websocket', connection: 'Upgrade' }],
  ['node mirror', 'GET', '/vibespace-node/v24.22.1/node-v24.22.1-linux-x64.tar.xz', {}],
  ['telemetry ingest', 'POST', '/api/telemetry/ingest', {}],
  ['feedback forward POST', 'POST', '/api/feedback/forward', {}], ['feedback marks GET', 'GET', '/api/feedback/forward/marks', {}],
  ['feedback forward GET (no door)', 'GET', '/api/feedback/forward', {}], ['feedback PATCH (the cookie\'s)', 'PATCH', '/api/feedback/abc', { origin: OWN_ORIGIN }],
  ['CSP report POST', 'POST', '/api/csp-report', { origin: 'null' }], ['CSP report GET (no door)', 'GET', '/api/csp-report', {}],
  ['frame host GET', 'GET', `/frame-host/f/${TOKEN24}/index.html`, {}], ['frame host short token (no door)', 'GET', '/frame-host/f/short/x.html', {}], ['frame host POST (no door)', 'POST', `/frame-host/f/${TOKEN24}/x`, { origin: OWN_ORIGIN }],
  ['svc root', 'GET', '/svc', {}], ['svc mount', 'POST', '/svc/app/x', { origin: FOREIGN }],
  ['otel ingest', 'POST', '/otel/v1/logs', {}],
  ['published page', 'GET', '/p/pgabcdef1234/raw', {}],
  ['slack landing GET', 'GET', '/api/channels/oauth/cb/slack', { accept: 'text/html' }], ['slack landing POST (no door)', 'POST', '/api/channels/oauth/cb/slack', { origin: OWN_ORIGIN }],
  ['hook root', 'GET', '/hook', {}], ['hook POST', 'POST', '/hook/abc', {}], ['hook deep', 'PUT', '/hook/x/y', {}],
  ['webhook replies GET', 'GET', '/api/channels/webhook/abc/replies', {}], ['webhook pair POST', 'POST', '/api/channels/webhook/abc/pair', {}], ['webhook pair GET (no door)', 'GET', '/api/channels/webhook/abc/pair', {}],
  ['login page', 'GET', '/login', { accept: 'text/html' }], ['login POST', 'POST', '/api/login', { origin: OWN_ORIGIN }], ['clerk login', 'POST', '/api/clerk-login', { origin: OWN_ORIGIN }],
  ['logout', 'POST', '/api/logout', { origin: OWN_ORIGIN }], ['favicon', 'GET', '/favicon.ico', {}],
  ['home page', 'GET', '/', { accept: 'text/html,application/xhtml+xml' }], ['an API read', 'GET', '/api/home', { accept: 'application/json' }],
  ['a same-origin write', 'POST', '/api/tasks', { origin: OWN_ORIGIN, 'content-type': 'application/json' }], ['a same-origin delete', 'DELETE', '/api/tasks/T-1', { origin: OWN_ORIGIN }],
  ['a write with no origin', 'POST', '/api/tasks', {}],
  ['a cross-site write', 'POST', '/api/tasks', { origin: FOREIGN, 'sec-fetch-site': 'cross-site' }], ['a same-site sibling write', 'POST', '/api/tasks', { origin: 'http://hub.example:4000', 'sec-fetch-site': 'same-site' }],
  ['a same-origin WebSocket', 'GET', '/ws', { upgrade: 'websocket', connection: 'Upgrade', origin: OWN_ORIGIN }], ['a cross-site WebSocket', 'GET', '/ws', { upgrade: 'websocket', connection: 'Upgrade', origin: FOREIGN }],
  ['a cross-site write to a door', 'POST', '/otel/v1/logs', { origin: FOREIGN }],
];
/** one request through one middleware → what happened (next or the answer) */
function through(mw, [, method, p, extra], cookie, encrypted = false) {
  const headers = { host: OWN, ...extra, ...(cookie ? { cookie: `vs_token=${cookie}` } : {}) };
  const req = { method, path: p, url: p, originalUrl: p, headers, socket: { encrypted }, connection: { encrypted } };
  const out = { next: false, status: 200, location: null, body: null };
  const res = { statusCode: 200, headers: {}, status(c) { out.status = c; this.statusCode = c; return this; }, json(b) { out.body = b; return this; }, send(b) { out.body = b; return this; }, redirect(a, b) { out.status = typeof a === 'number' ? a : 302; out.location = typeof a === 'number' ? b : a; return this; }, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, getHeader(k) { return this.headers[String(k).toLowerCase()]; }, set(k, v) { this.headers[String(k).toLowerCase()] = v; return this; }, cookie() { return this; } };
  try { mw(req, res, () => { out.next = true; }); } catch (e) { out.threw = String(e && e.message); }
  return out;
}
const quietly = (f) => { const w = console.warn; console.warn = () => { }; try { return f(); } finally { console.warn = w; } };
function judge(AuthClass, name) {
  const rows = [], diff = [];
  for (const on of [true, false]) {
    const dir = fs.mkdtempSync(path.join(T, `${name}-${on ? 'on' : 'off'}-`));
    const auth = new AuthClass(dir, {}); if (on) auth.setPassword('pw-door-class-81');
    const good = on ? auth.issueToken('test-door-class') : null, stale = 'stale-token-never-issued-0000';
    const now = auth.middleware(), then = before(AuthClass).call(auth);
    for (const row of CORPUS) for (const [cname, cookie] of [['no cookie', null], ['a valid cookie', good], ['a stale cookie', stale]]) {
      if (!on && cname === 'a valid cookie') continue;
      const a = quietly(() => through(then, row, cookie)), b = quietly(() => through(now, row, cookie));
      const tag = `${row[0]} · sign-in ${on ? 'on' : 'off'} · ${cname}`;
      const same = JSON.stringify(a) === JSON.stringify(b);
      rows.push(`${tag}: ${b.next ? 'next' : b.status + (b.location ? ' → ' + b.location : '')}`);
      if (!same) diff.push({ tag, master: a, now: b });
    }
  }
  return { rows, diff };
}
{
  const law = judge(Auth, 'law');
  console.log('    ' + law.rows.join('\n    '));
  ok(law.rows.length >= CORPUS.length * 5 && law.diff.length === 0, `${law.rows.length} requests (${CORPUS.length} shapes × sign-in on / off × no, a valid and a stale cookie): today's gate answers every one as master's did — ${law.diff.length} differ`, law.diff.slice(0, 4));
  const kinds = new Set(CORPUS.map(([, m, p, h]) => D.doorOf({ method: m, path: p, headers: { host: OWN, ...h } }).kind));
  ok(['door', 'login', 'page', 'refused'].every((k) => kinds.has(k)), `the corpus reaches every kind of the class with sign-in on: ${[...kinds].join(', ')}`);
  // RED CONTROL: one door line cut from a COPY of the door class, under a copy of the auth layer that requires that copy
  const CUT = "  if (p.startsWith('/otel/')) return next();\n";
  const dsrc = read('src/door.js'); if (dsrc.split(CUT).length !== 2) throw new Error('CONTROL needle not found exactly once: the OTel door line');
  globalThis.__vsDoorCut = compileAt('src/door.js', dsrc.replace(CUT, ''));
  const asrc = read('src/auth.js'); if (asrc.split("require('./door.js')").length !== 2) throw new Error('CONTROL needle not found exactly once: auth.js requires the door class');
  const CutAuth = compileAt('src/auth.js', asrc.replace("require('./door.js')", 'globalThis.__vsDoorCut')).Auth;
  const red = judge(CutAuth, 'red');
  ok(red.diff.length > 0 && red.diff.every((d) => /^(otel ingest|a cross-site write to a door) · /.test(d.tag)), `RED CONTROL — the OTel door line cut from a copy: ${red.diff.length} answers differ from master's, all on the OTel door — ${red.diff.slice(0, 3).map((d) => `${d.tag}: master ${d.master.next ? 'next' : d.master.status}, now ${d.now.next ? 'next' : d.now.status}`).join(' | ')}`, red.diff.slice(0, 2));
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
