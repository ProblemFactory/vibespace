#!/usr/bin/env node
// THE DOOR CLASS (the separation, M1 — lane B, piece B3a; src/door.js): ONE PURE function over what a request IS — its method,
// its path, its headers and whether its connection is TLS — answering how it comes in, before any cookie is read: a door, a
// cross-site refusal, an open instance, the login flow, or a page the owner's cookie decides.
//   ① THE FUNCTION: its five kinds; pure (the same request twice ⇒ the same class, a frozen request is never written); its
//     module graph is src/write-origin.js and built-ins only (no store, no clock, no I/O); the middleware's door lines live
//     there VERBATIM (15) and src/auth.js holds none of them any more.
//   ② THE CORPUS, GENERATED, ANSWERED AS MASTER ANSWERS IT (B3a's round wtyy237tl): every door of the class by its canonical
//     request, the login flow, pages and APIs — each varied (a suffix, a trailing slash, upper case, a double slash, an
//     encoded slash, dot segments, near-miss names) × 8 methods × the Origin header three ways, then 4000 SEEDED over
//     Sec-Fetch-Site, the forwarded headers, TLS on / off, sign-in on / off, three cookies and WebSocket handshakes (the seed
//     printed; DOOR_CORPUS_SEED replays another) — through MASTER's gate (src/auth.js middleware() frozen from 22353751e:
//     scripts/fixtures/auth-middleware-before-b3a.cjs) and TODAY's: every answer the same; per base its answers and a digest
//     printed. RED CONTROL 1: one door line cut from a copy ⇒ differs on that door only. RED CONTROL 2, THE ORDER: the
//     same-origin verdict moved above the doors in a copy ⇒ differs on every cross-site request to a door, and nowhere else.
//   ③ THE GATE FAILS CLOSED: the classes that pass without a cookie are NAMED (door, open, login); a planted sixth class is
//     refused by name (500 «unclassed»), sign-in on and off. RED CONTROL: the gate as B3a left it ⇒ the sixth is let in.
// in-process; a scratch dir under os.tmpdir().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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
    D.doorClassOf({ method: 'POST', path: '/otel/v1/logs', headers: H }).kind,
    D.doorClassOf({ method: 'POST', path: '/api/tasks', headers: { ...H, origin: 'https://elsewhere.example' } }).kind,
    D.doorClassOf({ method: 'GET', path: '/api/home', headers: H }, { enabled: false }).kind,
    D.doorClassOf({ method: 'GET', path: '/login', headers: H }).kind,
    D.doorClassOf({ method: 'GET', path: '/api/home', headers: H }).kind,
  ]);
  ok(JSON.stringify([...kinds].sort()) === JSON.stringify(['door', 'login', 'open', 'page', 'refused']), `the five kinds: ${[...kinds].join(', ')}`);
  const r = Object.freeze({ method: 'POST', path: '/api/tasks', headers: Object.freeze({ ...H, origin: 'https://elsewhere.example' }), encrypted: false });
  const a = D.doorClassOf(r), b = D.doorClassOf(r);
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
  ok(/const d = doorClassOf\(\{ method: req\.method, path: req\.path, headers: req\.headers, encrypted: !!\(req\.socket && req\.socket\.encrypted\) \}, \{ enabled: this\.enabled \}\);/.test(mw), 'src/auth.js middleware() judges every request THROUGH doorClassOf (one source)');
}

console.log('— ② THE CORPUS, GENERATED, ANSWERED AS MASTER ANSWERS IT (master = the gate frozen from 22353751e)');
const OWN = 'hub.example:3456', OWN_ORIGIN = 'http://hub.example:3456', FOREIGN = 'https://elsewhere.example';   // hosts by name (§81)
const TOKEN24 = 'AbCdEfGhIjKlMnOpQrStUvWx';
// THE BASES: every door of the class by its canonical request, the login flow, pages and APIs behind the gate
const BASES = ['/dav', '/dav/a/b.txt', '/api/agent/msg', '/api/editor/open', '/agentd.js', '/agentd-install.sh', '/agentd-install.ps1', '/vibespace-device.js',
  '/vibespace-device-install.sh', '/vibespace-device-install.ps1', '/api/agentd-dial', '/vibespace-node/v24.22.1/node.tar.xz', '/api/telemetry/ingest',
  '/api/feedback/forward', '/api/feedback/forward/marks', '/api/csp-report', `/frame-host/f/${TOKEN24}/index.html`, '/svc', '/svc/app/x', '/otel/v1/logs',
  '/p/pgabcdef1234/raw', '/api/channels/oauth/cb/slack', '/hook', '/hook/abc', '/api/channels/webhook/abc/replies', '/api/channels/webhook/abc/pair',
  '/login', '/api/login', '/api/clerk-login', '/api/logout', '/favicon.ico', '/', '/api/home', '/api/tasks', '/ws'];
// THE VARIANTS of each: itself, a suffix, a trailing slash, upper case, a double slash, an encoded slash, dot segments, near-miss names
const bump = (p) => p.replace(/[a-y](?=[^a-y]*$)/, (c) => String.fromCharCode(c.charCodeAt(0) + 1));
const variantsOf = (p) => [...new Set([p, p + 'x', p + '/', p.toUpperCase(), '/' + p, p.replace(/\/([^/]+)$/, '%2F$1'), p + '/../api/home', '/x/..' + p, p.length > 2 ? p.slice(0, -1) : p, bump(p)])];
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'PROPFIND'];
const ORIGINS = [[], ['origin', OWN_ORIGIN], ['origin', FOREIGN]];
const SFS = [null, 'same-origin', 'same-site', 'cross-site', 'none'];
const FORWARDED = [{}, { 'x-forwarded-proto': 'https' }, { 'x-forwarded-host': 'other.example' }, { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'other.example' }];
const COOKIES = ['no cookie', 'a valid cookie', 'a stale cookie'];
// THE SEED: printed; DOOR_CORPUS_SEED replays another (mulberry32)
const SEED = (Number(process.env.DOOR_CORPUS_SEED) || 20261121) >>> 0;
let st = SEED; const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const CORPUS = [];
for (const base of BASES) for (const path of variantsOf(base)) for (const method of METHODS) for (const o of ORIGINS) {   // THE CORE: every door × every variant × every method × the Origin header three ways
  CORPUS.push({ base, path, method, headers: o.length ? { [o[0]]: o[1] } : {}, encrypted: false, on: true, cookie: 'no cookie' });
}
for (let i = 0; i < 4000; i++) {   // THE SEEDED PART: every other dimension at once — Sec-Fetch-Site, the forwarded headers, TLS, sign-in off, the cookies, a WebSocket
  const base = pick(BASES), o = pick(ORIGINS), f = pick(SFS), headers = { ...(o.length ? { [o[0]]: o[1] } : {}), ...(f ? { 'sec-fetch-site': f } : {}), ...pick(FORWARDED), ...(rnd() < 0.15 ? { upgrade: 'websocket', connection: 'Upgrade' } : {}) };
  CORPUS.push({ base, path: pick(variantsOf(base)), method: pick(METHODS), headers, encrypted: rnd() < 0.5, on: rnd() < 0.7, cookie: pick(COOKIES) });
}
/** one request through one middleware → what happened (next, or the answer) */
function through(mw, r, cookie) {
  const headers = { host: OWN, ...r.headers, ...(cookie ? { cookie: `vs_token=${cookie}` } : {}) };
  const req = { method: r.method, path: r.path, url: r.path, originalUrl: r.path, headers, socket: { encrypted: r.encrypted }, connection: { encrypted: r.encrypted } };
  const out = { next: false, status: 200, location: null, body: null };
  const res = { statusCode: 200, headers: {}, status(c) { out.status = c; this.statusCode = c; return this; }, json(b) { out.body = b; return this; }, send(b) { out.body = b; return this; }, redirect(a, b) { out.status = typeof a === 'number' ? a : 302; out.location = typeof a === 'number' ? b : a; return this; }, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, getHeader(k) { return this.headers[String(k).toLowerCase()]; }, set(k, v) { this.headers[String(k).toLowerCase()] = v; return this; }, cookie() { return this; } };
  try { mw(req, res, () => { out.next = true; }); } catch (e) { out.threw = String(e && e.message); }
  return out;
}
const quietly = (f) => { const w = console.warn; console.warn = () => { }; try { return f(); } finally { console.warn = w; } };
const said = (o) => (o.next ? 'next' : o.status + (o.location ? ' → ' + o.location : ''));
const tagOf = (r) => `${r.method} ${r.path} ${JSON.stringify(r.headers)}${r.encrypted ? ' tls' : ''} · sign-in ${r.on ? 'on' : 'off'} · ${r.cookie}`;
/** the whole corpus through master's gate and through `AuthClass`'s → { n, diff, byBase, digest } */
function judge(AuthClass, name) {
  const gates = {};
  for (const on of [true, false]) {
    const auth = new AuthClass(fs.mkdtempSync(path.join(T, `${name}-${on ? 'on' : 'off'}-`)), {}); if (on) auth.setPassword('pw-door-class-81');
    gates[on] = { now: auth.middleware(), then: before(AuthClass).call(auth), cookie: { 'no cookie': null, 'a valid cookie': on ? auth.issueToken('test-door-class') : null, 'a stale cookie': 'stale-token-never-issued-0000' } };
  }
  const diff = [], byBase = new Map(), h = crypto.createHash('sha256');
  for (const r of CORPUS) {
    const g = gates[r.on], cookie = g.cookie[r.cookie];
    const a = quietly(() => through(g.then, r, cookie)), b = quietly(() => through(g.now, r, cookie));
    h.update(tagOf(r) + ' = ' + said(b) + '\n');
    const tally = byBase.get(r.base) || {}; tally[said(b)] = (tally[said(b)] || 0) + 1; byBase.set(r.base, tally);
    if (JSON.stringify(a) !== JSON.stringify(b)) diff.push({ r, master: a, now: b });
  }
  return { n: CORPUS.length, diff, byBase, digest: h.digest('hex').slice(0, 16) };
}
{
  const law = judge(Auth, 'law');
  console.log(`    the seed ${SEED} (DOOR_CORPUS_SEED replays another) · ${law.n} requests · their answers' digest ${law.digest}`);
  for (const [base, tally] of law.byBase) console.log(`    ${base} and its variants: ${Object.entries(tally).map(([k, v]) => `${k} ×${v}`).join(' · ')}`);
  for (const d of law.diff.slice(0, 20)) console.log(`    DIFFERS ${tagOf(d.r)}: master ${said(d.master)}, now ${said(d.now)}`);
  ok(law.n > 10000 && law.diff.length === 0, `${law.n} generated requests (${BASES.length} bases × their variants × ${METHODS.length} methods × the Origin header three ways, then ${4000} seeded over Sec-Fetch-Site, the forwarded headers, TLS, sign-in off, three cookies and WebSocket handshakes): today's gate answers every one as master's did — ${law.diff.length} differ`, law.diff.slice(0, 3).map((d) => ({ tag: tagOf(d.r), master: said(d.master), now: said(d.now) })));
  const kinds = new Set(CORPUS.slice(0, 2000).map((r) => D.doorClassOf({ method: r.method, path: r.path, headers: { host: OWN, ...r.headers } }).kind));
  ok(['door', 'login', 'page', 'refused'].every((k) => kinds.has(k)), `the corpus reaches every kind of the class: ${[...kinds].join(', ')}`);
  // RED CONTROL 1: ONE door line cut from a COPY of the door class, under a copy of the auth layer that requires it
  const authCopyOver = (doorSrc) => { globalThis.__vsDoorCopy = compileAt('src/door.js', doorSrc); const asrc = read('src/auth.js'); if (asrc.split("require('./door.js')").length !== 2) throw new Error('CONTROL needle not found exactly once: auth.js requires the door class'); return compileAt('src/auth.js', asrc.replace("require('./door.js')", 'globalThis.__vsDoorCopy')).Auth; };
  const dsrc = read('src/door.js');
  const CUT = "  if (p.startsWith('/otel/')) return next();\n";
  if (dsrc.split(CUT).length !== 2) throw new Error('CONTROL needle not found exactly once: the OTel door line');
  const red1 = judge(authCopyOver(dsrc.replace(CUT, '')), 'red1');
  ok(red1.diff.length > 0 && red1.diff.every((d) => d.r.path.startsWith('/otel/')), `RED CONTROL 1 — the OTel door line cut from a copy: ${red1.diff.length} answers differ from master's, every one on a path under /otel/ — ${red1.diff.slice(0, 2).map((d) => `${tagOf(d.r)}: master ${said(d.master)}, now ${said(d.now)}`).join(' | ')}`);
  // RED CONTROL 2: THE ORDER — the same-origin verdict moved ABOVE the doors in a copy ⇒ the cross-site rows to a door go red
  const V = "  const v = crossSiteVerdict({ method: req.method, headers: req.headers }, ownOriginOf(req.headers, { encrypted: !!(r && r.encrypted) }));\n  if (!v.ok) return { kind: 'refused', verdict: v };\n";
  const NX = "  const next = () => DOOR;";
  if (dsrc.split(V).length !== 2 || dsrc.split(NX).length !== 2) throw new Error('CONTROL needle not found exactly once: the same-origin verdict or the door lines\' start');
  const moved = dsrc.replace(V, '').replace(NX, V.trimEnd() + '\n' + NX);
  const red2 = judge(authCopyOver(moved), 'red2');
  const crossSite = (d) => d.r.headers.origin === FOREIGN || d.r.headers['sec-fetch-site'] === 'cross-site' || d.r.headers['sec-fetch-site'] === 'same-site';
  ok(red2.diff.length > 0 && red2.diff.every((d) => d.master.next && d.now.status === 403 && crossSite(d)), `RED CONTROL 2 — the ORDER: the same-origin verdict moved above the doors in a copy ⇒ ${red2.diff.length} answers differ, every one a CROSS-SITE request to a door that master let through and the copy refuses — ${red2.diff.slice(0, 2).map((d) => tagOf(d.r)).join(' | ')}`);
}

console.log('— ③ THE GATE FAILS CLOSED: a class nobody named in the gate is refused by name, never let in by default');
{
  const dsrc = read('src/door.js'), NX = "  const next = () => DOOR;";
  globalThis.__vsSixth = compileAt('src/door.js', dsrc.replace(NX, NX + "\n  if (p === '/sixth-class') return { kind: 'sixth' };   // PLANTED: a sixth class"));
  const withSixth = (authSrc) => compileAt('src/auth.js', authSrc.replace("require('./door.js')", 'globalThis.__vsSixth')).Auth;
  const asrc = read('src/auth.js');
  const run = (AuthClass) => [true, false].map((on) => { const auth = new AuthClass(fs.mkdtempSync(path.join(T, `sixth-${on}-`)), {}); if (on) auth.setPassword('pw-door-class-81'); return quietly(() => through(auth.middleware(), { method: 'GET', path: '/sixth-class', headers: {}, encrypted: false }, null)); });
  const law = run(withSixth(asrc));
  ok(law.every((o) => !o.next && o.status === 500 && o.body && o.body.error === 'unclassed' && o.body.kind === 'sixth'), `a planted sixth class, sign-in on and off: ${law.map((o) => `${said(o)} ${JSON.stringify(o.body)}`).join(' · ')}`, law);
  const OLD = "      if (PASSES.has(d.kind)) return next();   // a door, the open instance, the login flow\n";
  if (asrc.split(OLD).length !== 2) throw new Error('CONTROL needle not found exactly once: the named passes');
  const open = run(withSixth(asrc.replace(OLD, "      if (d.kind !== 'page') return next();\n")));   // stale-pins: kept (the red plants the gate as B3a left it)
  ok(open.every((o) => o.next), `RED CONTROL — the gate as B3a left it («every class but a page passes»): the sixth class is let in — ${open.map(said).join(' · ')}`, open);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
