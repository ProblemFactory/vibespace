#!/usr/bin/env node
// test-auth — THE OWNER'S AUTH LAYER over the REAL src/auth.js, mounted in server.js's own order (the cookie middleware
// and registerRoutes: the order is READ from server.js, never assumed).
//   ① WHO MAY SET A PASSWORD, by the instance's state (lane owner-write-origin hotfix, .273): SSO and no password ⇒ a
//      signed-in request only; a password configured ⇒ the current password (and, behind the gate since .274, the
//      session cookie); neither (first-run onboarding) ⇒ open. RED CONTROL: the route's own check cut AND the pre-fix
//      order (the routes before the gate) ⇒ the anonymous POST takes a Clerk-only instance (the measured hole); the
//      check cut in today's order is still 401 (the gate is the second wall).
//   ② THE SAME-ORIGIN VERDICT TABLE (PURE src/write-origin.js crossSiteVerdict, B-6b2b): every method × auth form ×
//      Sec-Fetch-Site × Origin against an oracle written here — reads never gated, a WebSocket handshake gated like a
//      write, a Bearer never the cookie's, Sec-Fetch-Site decides first, else Origin vs ours, neither = no browser.
//   ③ THE REQUEST'S OWN ORIGIN on the deployments (ownOriginOf): the hub behind Tailscale serve, the hub's own https,
//      the fleet behind the ingress (a same-site sibling pod refused), plain http on localhost, a relay that forwards
//      no proto (Sec-Fetch-Site still decides) — and the dial-address list / published pages ask the same function.
//   ④ THE GATE over the real middleware, in server.js's order, per auth mode (password / Clerk / none): a cross-site
//      write with the cookie ⇒ 403 {error:'cross-site', origin, own} + ONE log line (5 a minute, the rest counted); the
//      same write same-origin / without browser headers / with a Bearer ⇒ through; reads never; the auth routes
//      (login / logout / set-password) behind it; the doors never. RED CONTROL: the gate cut ⇒ the cross-site POST
//      with the cookie succeeds.
//   ⑤ WEBSOCKET HANDSHAKES (a real `ws` client through a dispatcher shaped like server.js's): another site's handshake
//      is refused with the cookie and on an instance with no sign-in; our page's and a CLI's open. Every upgrade
//      door asks auth.requestAuthed (pins); nothing else reads the cookie. RED CONTROL: requestAuthed without the
//      verdict ⇒ the cross-site handshake opens.
//   ⑥ THE ROUTE CENSUS (grep-derived, acorn): every POST/PUT/PATCH/DELETE route registered on `app` / a router in the
//      hub tree, each driven through the REAL middleware as a cross-site cookie write: refused ⇒ behind the gate;
//      reached ⇒ it must sit in a declared DOOR row (its own credential, the reason named) — none outside. server.js
//      mounts nothing before the gate (an AST walk of the statements between `express()` and the gate) and creates
//      the only express app; no other origin rule in the tree (the Sec-Fetch-Site / Origin readers declared).
//      RED CONTROLS: a planted router before the gate, the pre-fix auth-routes order, the gate cut ⇒ N outside.
//   ⑦ LOGIN TOKENS AT REST (lane vault-e2e-password-fix-r2): auth.json keys a login by sha256(token) only; 30 days from the
//      last use (the slide reaches the disk + the cookie at most hourly), never past 180 days from the sign-in; a plaintext
//      map an older build wrote is hashed at the first start (each login valid once; the old bytes overwritten); a vault
//      LOCK act (the real engine + src/server/vault-hooks.js) revokes every login and closes every page socket with 4401 —
//      the shutdown's quiet lock does not.
// Run: node scripts/test-auth.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { gitEnvFrom } from './git-env.mjs';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'package.json'));
const express = require('express');
const acorn = require('acorn');
const { WebSocket, WebSocketServer } = require('ws');
const AUTH = 'src/auth.js';
const WO = require(path.join(REPO, 'src/write-origin.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const MUT = mutantCopies('auth', REPO);
const DIR = scratch('auth'); fs.mkdirSync(DIR, { recursive: true });
const fresh = (rel) => { const f = path.join(REPO, rel); delete require.cache[require.resolve(f)]; return require(f); };
const readRepo = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
const codeLines = (t) => t.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l));

// server.js's own order of the two auth mounts (code lines only — a comment naming them never counts)
const SERVER_SRC = readRepo('server.js');
const SERVER = codeLines(SERVER_SRC);
const lineOf = (re) => SERVER.findIndex((l) => re.test(l));
const AT = { routes: lineOf(/^\s*auth\.registerRoutes\(app\);/), gate: lineOf(/^\s*app\.use\(auth\.middleware\(\)\);/) };
const ORDER = AT.routes < AT.gate ? ['routes', 'gate'] : ['gate', 'routes'];

// the console's warn lines, counted per leg (the refusal's ONE log line)
const WARN = [];
const warn0 = console.warn;
console.warn = (...a) => { const s = a.join(' '); if (/^\[auth\]/.test(s)) WARN.push(s); else warn0(...a); };

const OWN_HOST = '127.0.0.1';
let seq = 0;
/** An instance: `mode` 'password' | 'clerk' | 'open'; `authMod` = the real module or a patched copy; `order` = the
 *  mount order (default: server.js's); `extra(app)` mounts the stand-in routes AFTER the auth layer. */
async function instance(mode, { authMod = fresh(AUTH), order = ORDER, extra = null } = {}) {
  const dataDir = path.join(DIR, `${mode}-${++seq}`); fs.mkdirSync(dataDir, { recursive: true });
  const clerk = mode === 'clerk' ? { enabled: true, emailAllowed: () => true, verifyToken: async () => ({ email: 'o@example.test' }) } : null;
  const auth = new authMod.Auth(dataDir, { clerk });
  const pw = 'pw-' + crypto.randomBytes(6).toString('hex');
  if (mode === 'password') auth.setPassword(pw);
  const app = express();
  for (const step of order) { if (step === 'routes') auth.registerRoutes(app); else app.use(auth.middleware()); }
  app.use(express.json());
  if (extra) extra(app);
  else app.all(/.*/, (req, res) => res.json({ reached: true, method: req.method, path: req.path }));
  const srv = await new Promise((r) => { const s = app.listen(0, OWN_HOST, () => r(s)); });
  const port = srv.address().port;
  return { auth, pw, port, own: `http://${OWN_HOST}:${port}`, srv, cookie: { cookie: `vs_token=${auth.issueToken('owner-ua')}` }, close: () => new Promise((r) => srv.close(r)) };
}
/** One raw request — exact headers (no client adds one of its own). */
function hit(I, p, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const b = body === undefined ? (method === 'GET' || method === 'HEAD' ? null : '{}') : JSON.stringify(body);
    const h = { ...headers };
    if (b !== null) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(b); }
    const r = http.request({ host: OWN_HOST, port: I.port, path: p, method, headers: h }, (x) => {
      let d = ''; x.on('data', (c) => d += c);
      x.on('end', () => { let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: x.statusCode, cookie: x.headers['set-cookie'] || null, json: j, text: d }); });
    });
    r.on('error', reject);
    r.end(b === null ? undefined : b);
  });
}
const XS = { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' };
const SAME = (I) => ({ origin: I.own, 'sec-fetch-site': 'same-origin' });
const refused = (r) => r.status === 403 && r.json && r.json.error === 'cross-site';

// ── ① WHO MAY SET A PASSWORD ────────────────────────────────────────────────────────────────────────────────────────
console.log(`① who may set a password, by the instance's state (server.js order: ${ORDER.join(' → ')})`);
ok(AT.routes >= 0 && AT.gate >= 0 && ORDER[0] === 'gate', `server.js mounts the gate FIRST: app.use(auth.middleware()) at ${AT.gate + 1}, auth.registerRoutes(app) at ${AT.routes + 1}`);
{
  const I = await instance('clerk');
  const owner = I.cookie.cookie.split('=')[1];
  const anon = await hit(I, '/api/auth/set-password', { body: { newPassword: 'attacker1' } });
  ok(anon.status === 401 && !anon.cookie && !I.auth.passwordEnabled && I.auth.checkToken(owner),
    'SSO, no password: an ANONYMOUS POST {newPassword} is 401 — no password set, no cookie handed out, the signed-in session kept', { status: anon.status, cookie: anon.cookie, pw: I.auth.passwordEnabled });
  const anonRm = await hit(I, '/api/auth/set-password', { body: { remove: true } });
  ok(anonRm.status === 401, 'SSO, no password: an anonymous {remove:true} is 401 too', anonRm.status);
  const forged = await hit(I, '/api/auth/set-password', { headers: { cookie: `vs_token=${'ab'.repeat(24)}` }, body: { newPassword: 'attacker1' } });
  ok(forged.status === 401 && !I.auth.passwordEnabled, 'SSO, no password: a cookie that is no session (unknown token) is 401', forged.status);
  const mine = await hit(I, '/api/auth/set-password', { headers: { ...I.cookie, ...SAME(I) }, body: { newPassword: 'owner-pw-1' } });
  ok(mine.status === 200 && I.auth.passwordEnabled && I.auth.verifyPassword('owner-pw-1') && /vs_token=[a-f0-9]+/.test(String(mine.cookie)),
    'SSO, no password: the SIGNED-IN owner (session cookie, from its own page) sets a password — 200, a fresh session cookie', { status: mine.status, json: mine.json });
  await I.close();
}
{
  const I = await instance('password');
  const wrong = await hit(I, '/api/auth/set-password', { headers: I.cookie, body: { current: 'nope', newPassword: 'other-pw-1' } });
  ok(wrong.status === 401 && I.auth.verifyPassword(I.pw), 'a password configured: signed in, the wrong current password is 401, the password unchanged', wrong.status);
  const anon = await hit(I, '/api/auth/set-password', { body: { current: I.pw, newPassword: 'other-pw-1' } });
  ok(anon.status === 401 && I.auth.verifyPassword(I.pw), 'a password configured: the current password WITHOUT a session is 401 — the cookie gate stands in front of the auth routes now', anon.status);
  const right = await hit(I, '/api/auth/set-password', { headers: I.cookie, body: { current: I.pw, newPassword: 'other-pw-1' } });
  ok(right.status === 200 && I.auth.verifyPassword('other-pw-1'), 'a password configured: signed in + the current password changes it', right.status);
  await I.close();
}
{
  const I = await instance('open');
  ok(!I.auth.enabled, 'neither configured: auth is off');
  const first = await hit(I, '/api/auth/set-password', { body: { newPassword: 'first-pw-1' } });
  ok(first.status === 200 && I.auth.enabled && I.auth.verifyPassword('first-pw-1') && /vs_token=[a-f0-9]+/.test(String(first.cookie)),
    'neither configured (first-run onboarding, src/lib/setup-flows.js #ob-setpw): {newPassword} sets the first password — 200 + a session cookie, as before', { status: first.status, json: first.json });
  const after = await hit(I, '/api/x', { body: {} });
  ok(after.status === 401, 'and from then on the cookie gate stands (an anonymous write is 401)', after.status);
  await I.close();
}
{
  const src = readRepo(AUTH);
  const cut = src.split('\n').filter((l) => /this\.enabled && !this\.passwordEnabled && !this\.requestAuthed\(req\)/.test(l));
  const M = MUT.load(AUTH, src.split('\n').filter((l) => !cut.includes(l)).join('\n'), 'no-state-check');
  const I = await instance('clerk', { authMod: M, order: ['routes', 'gate'] });
  const owner = I.cookie.cookie.split('=')[1];
  const anon = await hit(I, '/api/auth/set-password', { body: { newPassword: 'attacker1' } });
  ok(cut.length === 1 && anon.status === 200 && I.auth.passwordEnabled && /vs_token=[a-f0-9]+/.test(String(anon.cookie)) && !I.auth.checkToken(owner),
    'CONTROL — the check cut + the pre-fix order (routes before the gate) ⇒ the anonymous POST answers 200, sets a password, revokes the owner\'s session and hands the caller a cookie (① red by the same asserts)', { cut: cut.length, status: anon.status, pw: I.auth.passwordEnabled });
  await I.close();
  const J = await instance('clerk', { authMod: M });
  const anon2 = await hit(J, '/api/auth/set-password', { body: { newPassword: 'attacker1' } });
  ok(anon2.status === 401 && !J.auth.passwordEnabled, 'the check cut in TODAY\'s order is still 401 — the gate in front is the second wall', anon2.status);
  await J.close();
}

// ── ② THE VERDICT TABLE ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('② the same-origin verdict table (PURE crossSiteVerdict — every combination against an oracle)');
{
  const OWN = 'https://box.tail0.ts.net';
  const METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE', 'GET+upgrade'];
  const AUTHS = { cookie: null, 'vsst_ bearer': 'Bearer vsst_' + 'a'.repeat(32), 'jbt_ bearer': 'Bearer jbt_' + 'b'.repeat(32), 'owner bearer': 'Bearer ' + 'c'.repeat(48), 'basic (not a bearer)': 'Basic dXNlcjpwYXNz' };
  const SITES = [undefined, 'same-origin', 'none', 'same-site', 'cross-site', 'bogus'];
  const ORIGINS = { none: undefined, ours: OWN, 'ours spelled :443 upper-case': 'HTTPS://BOX.TAIL0.TS.NET:443', foreign: 'https://evil.example', sibling: 'https://other.tail0.ts.net', 'null': 'null', 'http of ours': 'http://box.tail0.ts.net' };
  const oracle = (m, a, s, o) => {
    const gated = m === 'GET+upgrade' || ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m);
    if (!gated) return true;
    if (a && /^Bearer /.test(a)) return true;
    if (s === 'same-origin' || s === 'none') return true;
    if (s === 'same-site' || s === 'cross-site') return false;
    if (o === undefined) return true;
    return o === OWN || o === 'HTTPS://BOX.TAIL0.TS.NET:443';
  };
  let rows = 0; const bad = []; const tally = {};
  for (const m of METHODS) for (const [an, a] of Object.entries(AUTHS)) for (const s of SITES) for (const [on, o] of Object.entries(ORIGINS)) {
    const headers = { cookie: 'vs_token=' + 'd'.repeat(48) };
    if (a) headers.authorization = a;
    if (s !== undefined) headers['sec-fetch-site'] = s;
    if (o !== undefined) headers.origin = o;
    if (m === 'GET+upgrade') { headers.upgrade = 'websocket'; headers.connection = 'Upgrade'; }
    const v = WO.crossSiteVerdict({ method: m === 'GET+upgrade' ? 'GET' : m, headers }, OWN);
    const want = oracle(m, a, s, o);
    rows++;
    const key = `${v.ok ? 'allowed' : 'REFUSED'} · ${v.why}`; tally[key] = (tally[key] || 0) + 1;
    if (v.ok !== want) bad.push({ m, an, s, on, got: v });
    if (!v.ok && (v.origin !== (o === undefined ? null : o) || v.own !== OWN)) bad.push({ m, an, s, on, shape: v });
  }
  ok(rows === METHODS.length * 5 * SITES.length * Object.keys(ORIGINS).length && bad.length === 0, `${rows} combinations (${METHODS.length} methods × 5 auth forms × ${SITES.length} Sec-Fetch-Site × ${Object.keys(ORIGINS).length} Origin) match the oracle; a refusal names what was offered and ours`, bad.slice(0, 4));
  console.log('    tally: ' + Object.entries(tally).sort().map(([k, n]) => `${k} ${n}`).join(' · '));
  const named = [
    ['a cross-site form POST with the cookie', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' } }, false, 'cross-site'],
    ['a same-site sibling (another pod of the fleet)', { method: 'POST', headers: { 'sec-fetch-site': 'same-site', origin: 'https://other.tail0.ts.net' } }, false, 'same-site'],
    ['an old browser (no Sec-Fetch-Site), a foreign Origin', { method: 'DELETE', headers: { origin: 'https://evil.example' } }, false, 'origin'],
    ['a sandboxed frame / data: page (Origin null)', { method: 'PUT', headers: { origin: 'null' } }, false, 'null-origin'],
    ['our own page', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: OWN } }, true, 'same-origin'],
    ['a user-typed request (Sec-Fetch-Site none)', { method: 'POST', headers: { 'sec-fetch-site': 'none' } }, true, 'none'],
    ['an old browser on our page', { method: 'PATCH', headers: { origin: OWN } }, true, 'origin'],
    ['curl / node / a CLI riding the cookie', { method: 'POST', headers: {} }, true, 'no-browser'],
    ['an agent\'s vsst_ token from anywhere', { method: 'POST', headers: { authorization: 'Bearer vsst_x', 'sec-fetch-site': 'cross-site' } }, true, 'token'],
    ['a link from another site (a read)', { method: 'GET', headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' } }, true, 'read'],
    ['another site\'s WebSocket handshake', { method: 'GET', headers: { upgrade: 'websocket', 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' } }, false, 'cross-site'],
    ['a stale proxy with no forwarded proto — Sec-Fetch-Site still decides', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'https://relay.example' } }, true, 'same-origin'],
  ];
  for (const [what, req, want, why] of named) {
    const v = WO.crossSiteVerdict(req, OWN);
    ok(v.ok === want && v.why === why, `${what} ⇒ ${want ? 'allowed' : 'REFUSED'} (${why})`, v);
  }
}

// ── ③ THE REQUEST'S OWN ORIGIN ON THE DEPLOYMENTS ───────────────────────────────────────────────────────────────────
console.log('③ the request\'s own origin behind each deployment (ownOriginOf) — and who else asks it');
{
  const D = [
    ['the hub behind Tailscale serve', { host: 'box.tail0.ts.net', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'box.tail0.ts.net', 'x-forwarded-for': '100.64.0.7' }, {}, 'https://box.tail0.ts.net', 'https://box.tail0.ts.net', ['http://box.tail0.ts.net', 'https://box2.tail0.ts.net']],
    ['the hub\'s own https (src/server/tls.js, one port)', { host: 'box.tail0.ts.net:3456' }, { encrypted: true }, 'https://box.tail0.ts.net:3456', 'https://box.tail0.ts.net:3456', ['http://box.tail0.ts.net:3456', 'https://box.tail0.ts.net']],
    ['the same port over plain http', { host: 'box.tail0.ts.net:3456' }, {}, 'http://box.tail0.ts.net:3456', 'http://box.tail0.ts.net:3456', ['https://box.tail0.ts.net:3456']],
    ['the fleet behind the cluster ingress', { host: 'alice.pods.example', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'alice.pods.example', 'x-forwarded-port': '443' }, {}, 'https://alice.pods.example', 'https://alice.pods.example', ['https://bob.pods.example', 'https://pods.example']],
    ['the fleet ingress on a WebSocket UPGRADE (Traefik forwards wss — 2.369.275, userW\'s instance)', { host: 'alice.pods.example', 'x-forwarded-proto': 'wss', 'x-forwarded-host': 'alice.pods.example', upgrade: 'websocket', connection: 'Upgrade' }, {}, 'https://alice.pods.example', 'https://alice.pods.example', ['https://bob.pods.example', 'http://alice.pods.example']],
    ['the same upgrade through a plain-http ingress (ws)', { host: 'alice.pods.example', 'x-forwarded-proto': 'ws', 'x-forwarded-host': 'alice.pods.example', upgrade: 'websocket' }, {}, 'http://alice.pods.example', 'http://alice.pods.example', ['https://alice.pods.example']],
    ['an ingress that rewrites Host (forwarded host kept)', { host: 'vibespace.svc.cluster.local:3000', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'alice.pods.example' }, {}, 'https://alice.pods.example', 'https://alice.pods.example', ['http://vibespace.svc.cluster.local:3000']],
    ['a proxy chain (the first forwarded value)', { host: 'inner:3000', 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'alice.pods.example, inner' }, {}, 'https://alice.pods.example', 'https://alice.pods.example', ['http://alice.pods.example']],
    ['plain http on localhost', { host: 'localhost:3000' }, {}, 'http://localhost:3000', 'http://localhost:3000', ['http://127.0.0.1:3000', 'http://localhost:3001', 'https://localhost:3000']],
    ['loopback by address', { host: '127.0.0.1:3000' }, {}, 'http://127.0.0.1:3000', 'http://127.0.0.1:3000', ['http://localhost:3000']],
    ['IPv6 loopback', { host: '[::1]:3000' }, {}, 'http://[::1]:3000', 'http://[::1]:3000', ['http://[::2]:3000']],
    ['a host that is no host', { host: 'evil.example/x' }, {}, '', null, ['http://evil.example']],
  ];
  const tbl = [];
  for (const [where, headers, opt, own, mine, others] of D) {
    const got = WO.ownOriginOf(headers, opt);
    const okMine = mine === null || WO.crossSiteVerdict({ method: 'POST', headers: { origin: mine } }, got).ok;
    const refusedOthers = others.every((o) => !WO.crossSiteVerdict({ method: 'POST', headers: { origin: o } }, got).ok);
    ok(got === own && okMine && refusedOthers, `${where}: own = ${own || "'' (refuses every Origin)"}; its page allowed, ${others.join(' / ')} refused (no Sec-Fetch-Site: the Origin compare)`, { got });
    tbl.push(`${where} → ${own || '—'}`);
  }
  { // THE .275 INCIDENT, as the handshake arrived: a GET upgrade with Origin = the page, no Sec-Fetch-Site, X-Forwarded-Proto wss
    const hs = { method: 'GET', headers: { origin: 'https://alice.pods.example', upgrade: 'websocket', connection: 'Upgrade', 'sec-websocket-version': '13' } };
    const fwd = { host: 'alice.pods.example', 'x-forwarded-proto': 'wss', 'x-forwarded-host': 'alice.pods.example' };
    const now = WO.crossSiteVerdict(hs, WO.ownOriginOf(fwd));
    ok(now.ok && now.why === 'origin', 'a WebSocket handshake of the instance\'s own page through Traefik (X-Forwarded-Proto: wss) is allowed — Origin is ours', now);
    const before = WO.crossSiteVerdict(hs, ''); // what .274 computed: own '' — the control, the incident\'s exact log shape
    ok(!before.ok && before.why === 'origin' && before.own === null && before.origin === 'https://alice.pods.example', 'CONTROL: with own \'\' (the .274 reading of wss) the same handshake is refused as "origin … (own -)" — the incident', before);
  }
  const sib = WO.crossSiteVerdict({ method: 'POST', headers: { 'sec-fetch-site': 'same-site', origin: 'https://bob.pods.example' } }, WO.ownOriginOf(D[3][1]));
  ok(!sib.ok && sib.why === 'same-site' && sib.own === 'https://alice.pods.example', 'the fleet: a page on a SIBLING pod (same-site — the cookie rides along under SameSite=Lax) is refused', sib);
  const relay = WO.ownOriginOf({ host: 'pub.relay.example' });
  ok(relay === 'http://pub.relay.example' && WO.crossSiteVerdict({ method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'https://pub.relay.example' } }, relay).ok,
    'a relay that terminates TLS and forwards no proto: own reads http, yet the browser\'s same-origin decides — no false refusal on a modern browser', relay);
  // ONE implementation: the dial-address list and published pages ask the same function (no copy of the rule)
  const wiring = codeLines(readRepo('src/server/mounts-plugins-wiring.js')).join('\n');
  const pages = codeLines(readRepo('src/server/published-pages.js')).join('\n');
  ok(/const origin = req\.headers\.origin \|\| require\('\.\.\/write-origin\.js'\)\.ownOriginOf\(req\.headers, /.test(wiring) && /require\('\.\.\/write-origin\.js'\)\.ownOriginOf\(req\.headers, /.test(pages)
    && /pub = require\('\.\/src\/write-origin\.js'\)\.ownOriginOf\(req\.headers, /.test(SERVER.join('\n')),
    'the dial-address list (mounts-plugins-wiring), published pages and the mount-push fallback (server.js) ask ownOriginOf — one rule');
  const hand = [];
  for (const f of hubFiles()) {
    if (f === 'src/write-origin.js') continue;
    codeLines(readRepo(f)).forEach((l, i) => { if (/:\/\//.test(l) && /req\.protocol|req\.get\('host'\)|headers\.host\b|x-forwarded-(proto|host)/.test(l)) hand.push(`${f}:${i + 1} ${l.trim().slice(0, 80)}`); });
  }
  ok(hand.length === 0, 'no other file composes "<scheme>://<host>" from the request by hand (req.protocol / Host / X-Forwarded-*) — the Slack consent fallback and the WebDAV link ask ownOriginOf too', hand);
  ok(/return require\('\.\.\/write-origin\.js'\)\.ownOriginOf\(req\.headers, /.test(readRepo('src/routes/channels.js')) && /const url = require\('\.\.\/write-origin\.js'\)\.ownOriginOf\(req\.headers, /.test(readRepo('src/server/mounts-plugins-wiring.js')),
    'the Slack consent\'s return address (its fallback after the browser\'s Origin) and the WebDAV link ask ownOriginOf');
  console.log('    ' + tbl.join(' · '));
}

// ── ④ THE GATE ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ the gate over the real middleware (server.js order), per auth mode');
for (const mode of ['password', 'clerk', 'open']) {
  const I = await instance(mode);
  const C = mode === 'open' ? {} : I.cookie;
  WARN.length = 0;
  const xs = await hit(I, '/api/sessions/x/kill', { headers: { ...C, ...XS } });
  ok(refused(xs) && xs.json.origin === 'https://evil.example' && xs.json.own === I.own && WARN.length === 1 && /cross-site POST \/api\/sessions\/x — cross-site, origin "https:\/\/evil\.example" \(own http:\/\/127\.0\.0\.1:\d+\)/.test(WARN[0]),
    `${mode}: a cross-site POST with the owner's ${mode === 'open' ? 'open door' : 'cookie'} ⇒ 403 {error:'cross-site', origin, own} + ONE log line (route cut at 3 segments)`, { status: xs.status, json: xs.json, warn: WARN });
  const sib = await hit(I, '/api/x', { method: 'DELETE', headers: { ...C, 'sec-fetch-site': 'same-site', origin: 'http://pod2.127.0.0.1.nip.example' } });
  const old = await hit(I, '/api/x', { method: 'PUT', headers: { ...C, origin: 'https://evil.example' } });
  const nul = await hit(I, '/api/x', { method: 'PATCH', headers: { ...C, origin: 'null' } });
  ok(refused(sib) && refused(old) && refused(nul), `${mode}: same-site DELETE, a foreign Origin without Sec-Fetch-Site (PUT), Origin null (PATCH) ⇒ 403 cross-site`, [sib.status, old.status, nul.status]);
  const same = await hit(I, '/api/x', { headers: { ...C, ...SAME(I) } });
  const oldOurs = await hit(I, '/api/x', { headers: { ...C, origin: I.own } });
  const cli = await hit(I, '/api/x', { headers: { ...C } });
  const read = await hit(I, '/api/x', { method: 'GET', headers: { ...C, ...XS } });
  ok([same, oldOurs, cli, read].every((r) => r.status === 200 && r.json && r.json.reached),
    `${mode}: our page, an old browser on our page, a CLI with no browser headers, and a cross-site READ ⇒ through`, [same.status, oldOurs.status, cli.status, read.status]);
  const bearer = await hit(I, '/api/x', { headers: { ...C, ...XS, authorization: 'Bearer vsst_' + 'e'.repeat(32) } });
  ok(bearer.status === 200 && bearer.json && bearer.json.reached, `${mode}: a Bearer token is not the cookie's authority ⇒ the origin rule does not judge it (the route judges the token)`, bearer.status);
  // the doors: their own credential, never this rule (their refusals are their own)
  const doors = [];
  for (const p of ['/hook/ci', '/api/agent/channels/proposals/p-1/withdraw', '/api/editor/open', '/api/telemetry/ingest', '/dav/x', '/svc/app/x', '/otel/v1/logs', '/p/pg0123456789', '/api/channels/webhook/ci/pair']) {
    const r = await hit(I, p, { headers: XS });
    doors.push(`${p} ${r.status}`);
  }
  ok(doors.every((d) => / 200$/.test(d)), `${mode}: the doors (webhook, agent, editor bridge, telemetry, dav, svc, otel, published pages, pairing) are not the cookie's — a cross-site call reaches their own judge`, doors);
  // the auth routes stand behind it now
  const login = await hit(I, '/api/login', { headers: XS, body: { password: I.pw } });
  const logout = await hit(I, '/api/logout', { headers: { ...C, ...XS } });
  const setpw = await hit(I, '/api/auth/set-password', { headers: { ...C, ...XS }, body: { current: I.pw, newPassword: 'zz-' + mode } });
  ok(refused(login) && refused(logout) && refused(setpw), `${mode}: login, logout and set-password from another site ⇒ 403 cross-site (the auth routes are behind the gate)`, [login.status, logout.status, setpw.status]);
  if (mode === 'password') {
    const li = await hit(I, '/api/login', { headers: SAME(I), body: { password: I.pw } });
    const lo = await hit(I, '/api/logout', { headers: { cookie: 'vs_token=' + 'f'.repeat(48), ...SAME(I) } });
    ok(li.status === 200 && lo.status === 200, 'password: our login page signs in; logout with a stale cookie still answers (it revokes only what it presents)', [li.status, lo.status]);
  }
  await I.close();
  const T = await instance(mode);   // a fresh minute: 8 refusals ⇒ 5 lines
  WARN.length = 0;
  for (let i = 0; i < 8; i++) await hit(T, '/api/x', { headers: { ...(mode === 'open' ? {} : T.cookie), ...XS } });
  ok(WARN.length === 5, `${mode}: 8 refusals in a minute ⇒ 5 log lines (the rest counted, a hostile page cannot flood the journal)`, WARN.length);
  await T.close();
}
{
  // the refusal in words — only a page that ever meets it (VibeSpace's own never does): fetchJson and api() say the sentence
  const u = readRepo('src/lib/utils.js'), zh = readRepo('src/lib/i18n-zh.js'), ja = readRepo('src/lib/i18n-ja.js');
  const EN = 'This action came from another site and was refused';
  ok(/body\.error === 'cross-site' \? \{ \.\.\.body, code: 'cross-site', error: t\('This action came from another site and was refused'\) \}/.test(u)
    && /return refusalWords\(await res\.json\(\)\);/.test(u) && /body = refusalWords\(await res\.json\(\)\);/.test(u)
    && zh.includes(`"${EN}": "这次操作来自别的站点，已拒绝"`) && ja.includes(`"${EN}": "`),
    'a page that meets the refusal says it in words: fetchJson and api() turn {error:\'cross-site\'} into 「这次操作来自别的站点，已拒绝」 (zh / ja / en), the code kept');
}
{
  // RED CONTROL: the gate cut ⇒ another site's write with the owner's cookie goes through
  const src = readRepo(AUTH);
  const cut = src.split('\n').filter((l) => /return res\.status\(403\)\.json\(\{ error: 'cross-site'/.test(l));
  const M = MUT.load(AUTH, src.split('\n').filter((l) => !cut.includes(l)).join('\n'), 'no-gate');
  const I = await instance('password', { authMod: M });
  const xs = await hit(I, '/api/sessions/x/kill', { headers: { ...I.cookie, ...XS } });
  ok(cut.length === 1 && xs.status === 200 && xs.json && xs.json.reached, 'CONTROL — the gate cut ⇒ a cross-site POST with the owner\'s cookie reaches the route (④ red by the same asserts)', { cut: cut.length, status: xs.status });
  await I.close();
}

// ── ⑤ WEBSOCKET HANDSHAKES ──────────────────────────────────────────────────────────────────────────────────────────
console.log('⑤ WebSocket handshakes — a real ws client through a dispatcher shaped like server.js\'s');
async function wsInstance(mode, authMod = fresh(AUTH)) {
  const I = await instance(mode, { authMod });
  const wss = new WebSocketServer({ noServer: true });
  I.srv.on('upgrade', (req, socket, head) => {   // server.js: `if (!auth.requestAuthed(req)) return deny();` then handleUpgrade
    if (!I.auth.requestAuthed(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => { ws.send('hello'); });
  });
  return I;
}
const shake = (I, headers, origin) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://${OWN_HOST}:${I.port}/ws`, { headers, ...(origin ? { origin } : {}) });
  const done = (v) => { try { ws.terminate(); } catch { } resolve(v); };
  ws.on('message', () => done('open'));
  ws.on('unexpected-response', (q, r) => done(String(r.statusCode)));
  ws.on('error', (e) => done('error:' + e.message));
  setTimeout(() => done('timeout'), 3000);
});
for (const mode of ['password', 'open']) {
  const I = await wsInstance(mode);
  const C = mode === 'open' ? {} : I.cookie;
  WARN.length = 0;
  const xs = await shake(I, { ...C, 'sec-fetch-site': 'cross-site' }, 'https://evil.example');
  const sib = await shake(I, { ...C, 'sec-fetch-site': 'same-site' }, 'https://pod2.example');
  const oldXs = await shake(I, { ...C }, 'https://evil.example');
  const ours = await shake(I, { ...C, 'sec-fetch-site': 'same-origin' }, I.own);
  const cli = await shake(I, { ...C });
  ok(xs === '401' && sib === '401' && oldXs === '401' && WARN.length === 3 && /cross-site WebSocket \/ws/.test(WARN[0]),
    `${mode}: another site's handshake (cross-site, a same-site sibling, an old browser's foreign Origin) is refused${mode === 'open' ? ' — on an instance nobody signs in to too' : ' with the cookie'}, one log line each`, { xs, sib, oldXs, warn: WARN });
  ok(ours === 'open' && cli === 'open', `${mode}: our page's handshake and a CLI's (no browser headers) open`, { ours, cli });
  await I.close();
}
{
  const src = readRepo(AUTH);
  const cut = src.split('\n').filter((l) => /if \(!v\.ok\) \{ this\._logCrossSite\(req, v\); return false; \}/.test(l));
  const M = MUT.load(AUTH, src.split('\n').filter((l) => !cut.includes(l)).join('\n'), 'no-ws-verdict');
  const I = await wsInstance('open', M);
  const xs = await shake(I, { 'sec-fetch-site': 'cross-site' }, 'https://evil.example');
  ok(cut.length === 1 && xs === 'open', 'CONTROL — requestAuthed without the verdict ⇒ another site\'s handshake to a local instance OPENS (a drive-by page would drive its terminals; ⑤ red)', { cut: cut.length, xs });
  await I.close();
}
{
  // every upgrade door asks auth.requestAuthed; nobody else reads the cookie
  const S = SERVER.join('\n');
  const dispatcher = S.slice(S.indexOf("hub.attachToServers('upgrade'"), S.indexOf("pathname === '/api/device-dial'"));
  const pins = [
    ['server.js /ws', /if \(pathname === '\/ws'\) \{\s*if \(!auth\.requestAuthed\(req\)\) return deny\(\);/.test(dispatcher)],
    ['server.js /proxy/', /pathname\.startsWith\('\/proxy\/'\)\) \{\s*if \(!auth\.requestAuthed\(req\)\) return deny\(\);/.test(dispatcher)],
    ['server.js path mounts', /path-mounts\.js'\)\.create\(\{[^\n]*requestAuthed: \(req\) => auth\.requestAuthed\(req\)/.test(S)],
    ['server.js published pages', /requestAuthed: \(req\) => auth\.requestAuthed\(req\), log:/.test(S)],
    ['mounts-plugins-wiring browser stream', /browser-stream'\)\.create\(\{[^\n]*requestAuthed: \(req\) => auth\.requestAuthed\(req\)/.test(readRepo('src/server/mounts-plugins-wiring.js'))],
    ['window-live-wiring desktop stream (auth handed in)', /desktop-stream\.js'\)\.create\(\{\s*auth, /.test(readRepo('src/server/window-live-wiring.js'))],
    ['desktop-stream asks it inside handleUpgrade', /if \(!auth\.requestAuthed\(req\)\) \{ refuse\(socket, 401/.test(readRepo('src/server/desktop-stream.js'))],
    ['browser-stream asks it', /if \(!requestAuthed\(req\)\) \{ socket\.write\('HTTP\/1\.1 401/.test(readRepo('src/server/browser-stream.js'))],
    ['path-mounts asks it (HTTP + upgrade, private mounts)', (readRepo('src/server/path-mounts.js').match(/!t\.rec\?\.pathPublic && !requestAuthed\(req\)/g) || []).length === 2],
  ];
  ok(pins.every((p) => p[1]), `every cookie door of the upgrade dispatcher and the per-mount / per-page doors ask auth.requestAuthed (${pins.length} pins)`, pins.filter((p) => !p[1]).map((p) => p[0]));
  const raw = [];
  const WITHDRAW = /\(req\.headers\.cookie \|\| req\.headers\['sec-fetch-site'\]\)\) return res\.status\(403\)\.json\(\{ error: 'only the agent that proposed it can withdraw/;
  for (const f of hubFiles()) { if (f === 'src/auth.js') continue; codeLines(readRepo(f)).forEach((l, i) => { if (/\bcookieToken\(|\.checkToken\(|headers\.cookie\b|headers\[['"]cookie['"]\]/.test(l) && !(f === 'src/agent-routes.js' && WITHDRAW.test(l))) raw.push(`${f}:${i + 1}`); }); }
  ok(raw.length === 0, 'no file but src/auth.js reads the session cookie (cookieToken / checkToken / the Cookie header) — every cookie decision passes the verdict; the withdraw route\'s presence check is the declared role refusal (⑥)', raw);
}

// ── ⑥ THE ROUTE CENSUS ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ the route census — every write route in the hub tree, driven through the real gate');
function hubFiles() {
  const out = execFileSync('git', ['ls-files', 'server.js', 'src/*.js', 'src/**/*.js'], { cwd: REPO, encoding: 'utf8', env: gitEnvFrom(process.env) }).trim().split('\n').filter(Boolean);
  return out.filter((f) => !f.startsWith('src/lib/') && fs.existsSync(path.join(REPO, f)));
}
function parse(src) {
  for (const sourceType of ['script', 'module']) { try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true }); } catch { } }
  return null;
}
function walk(n, fn, parent = null) {
  if (!n || typeof n.type !== 'string') return;
  fn(n, parent);
  for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach((x) => walk(x, fn, n)); else if (v && typeof v.type === 'string') walk(v, fn, n); }
}
const WRITE = new Set(['post', 'put', 'patch', 'delete', 'all', 'use']);
// a route written as a regex: the sample path the census drives through the gate (an undeclared regex is unparsed ⇒ red)
const REGEX_SAMPLES = { '/^\\/hook(?:\\/.*)?$/': '/hook/x' };
/** Every `<app|router>.<post|put|patch|delete|all>(<path>, …)` and every `.use('<prefix>', …)` mount in the hub tree:
 *  { file, line, method (all / use ⇒ probed as POST), paths[] } */
function writeRoutes(read = readRepo) {
  const rows = [], unparsed = [];
  for (const f of hubFiles()) {
    const src = read(f), ast = parse(src);
    if (!ast) { unparsed.push(f + ' (no parse)'); continue; }
    walk(ast, (n) => {
      if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed || !WRITE.has(n.callee.property.name)) return;
      const recv = src.slice(n.callee.object.start, n.callee.object.end);
      const verb = n.callee.property.name;
      if (!/^(app|router|r|routes?)$/.test(recv) || n.arguments.length < 2) return;
      const a = n.arguments[0];
      const line = src.slice(0, n.start).split('\n').length;
      let paths = null;
      if (a.type === 'Literal' && typeof a.value === 'string') paths = [a.value];
      else if (a.type === 'ArrayExpression' && a.elements.every((e) => e && e.type === 'Literal' && typeof e.value === 'string')) paths = a.elements.map((e) => e.value);
      else if (a.type === 'Literal' && a.regex && REGEX_SAMPLES[src.slice(a.start, a.end)]) paths = [REGEX_SAMPLES[src.slice(a.start, a.end)]];
      if (verb === 'use' && !paths) return;   // app.use(router) / app.use(fn): the router's own routes are counted one by one
      if (!paths) { unparsed.push(`${f}:${line} ${recv}.${verb}(${src.slice(a.start, a.end).slice(0, 50)})`); return; }
      rows.push({ file: f, line, method: verb === 'all' || verb === 'use' ? 'POST' : verb.toUpperCase(), verb, paths });
    });
  }
  return { rows, unparsed };
}
// the DOORS: callers that are not the owner's browser — the auth layer's own list, each with what judges it
const DOORS = [
  [/^\/api\/agent\//, 'agent sessions (vsst_) and Background Work jobs (jbt_): the route judges the token'],
  [/^\/api\/editor\/open$/, 'the Ctrl+G bridge in a session shell: the route judges its vsst_ token'],
  [/^\/api\/telemetry\/ingest$/, 'remote instances: the collector\'s shared Bearer token'],
  [/^\/hook(\/|$)/, 'webhook callers: their own token / signature (src/routes/webhook.js)'],
  [/^\/api\/channels\/webhook\/[a-z0-9][a-z0-9-]{0,62}\/pair$/, 'the pairing completion: the pairing code is the credential'],
  [/^\/dav(\/|$)/, 'WebDAV: scoped Bearer mount tokens'],
  [/^\/otel\//, 'the local CLI\'s OTLP exporter: loopback + the persisted otel token'],
  [/^\/svc(\/|$)/, 'path-mounted services: per mount — a private one asks requestAuthed (the same verdict)'],
  [/^\/p\//, 'published pages: per page — a private one asks requestAuthed (the same verdict)'],
];
const concrete = (p) => p.replace(/:[A-Za-z_]\w*(\([^)]*\))?\??/g, 'x').replace(/\*/g, 'x').replace(/\/+$/, '') || '/';
async function census(authMod = fresh(AUTH)) {
  const I = await instance('password', { authMod });
  const { rows, unparsed } = writeRoutes();
  const gated = [], doors = [], outside = [];
  for (const r of rows) for (const p of r.paths) {
    const cp = concrete(p);
    const x = await hit(I, cp, { method: r.method, headers: { ...I.cookie, ...XS } });
    const tag = `${r.verb === 'use' ? 'USE' : r.verb === 'all' ? 'ALL' : r.method} ${p} (${r.file}:${r.line})`;
    if (refused(x)) gated.push(tag);
    else { const d = DOORS.find(([re]) => re.test(cp)); if (d && x.status === 200 && x.json && x.json.reached) doors.push(tag); else outside.push(`${tag} → ${x.status}`); }
  }
  await I.close();
  return { rows, unparsed, gated, doors, outside };
}
{
  const c = await census();
  const files = new Set(c.rows.map((r) => r.file));
  ok(c.rows.length > 300 && c.unparsed.length === 0 && c.rows.some((r) => r.verb === 'all') && c.rows.some((r) => r.verb === 'use'), `the census found ${c.rows.length} write registrations (POST / PUT / PATCH / DELETE, every \`.all\`, every prefix \`.use\`, the /hook regex by its declared sample) in ${files.size} files (server.js + src/routes/* + src/agent-routes* + the channels / integrations / desktop / browser routers + src/server/*); none with a path it cannot read`, c.unparsed);
  ok(c.outside.length === 0, `${c.gated.length} cookie-write routes are behind the gate (a cross-site write with the cookie ⇒ 403), ${c.doors.length} sit in a declared door (their own credential), 0 outside`, c.outside.slice(0, 10));
  const perFile = {}; for (const t of c.gated) { const f = t.replace(/^.*\((.*):\d+\)$/, '$1'); perFile[f] = (perFile[f] || 0) + 1; }
  console.log('    behind the gate: ' + Object.entries(perFile).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f.replace(/^src\//, '')} ${n}`).join(' · '));
  console.log('    doors: ' + c.doors.map((t) => t.replace(/ \(.*$/, '')).join(' · '));
  for (const want of ['src/agent-routes.js', 'src/routes/channels.js', 'src/routes/integrations.js', 'src/routes/desktop-apps.js', 'src/routes/browser.js', 'server.js', 'src/auth.js']) ok(c.rows.some((r) => r.file === want), `the census reads ${want}`);
  ok(c.gated.some((t) => /POST \/api\/auth\/set-password/.test(t)) && c.gated.some((t) => /POST \/api\/logout/.test(t)) && c.gated.some((t) => /POST \/api\/login /.test(t)), 'the auth routes are counted behind the gate (login, logout, set-password)');
  const cut = readRepo(AUTH).split('\n').filter((l) => /return res\.status\(403\)\.json\(\{ error: 'cross-site'/.test(l));
  const M = MUT.load(AUTH, readRepo(AUTH).split('\n').filter((l) => !cut.includes(l)).join('\n'), 'census-no-gate');
  const r = await census(M);
  ok(r.outside.length === c.gated.length && r.gated.length === 0, `CONTROL — the gate cut ⇒ all ${r.outside.length} cookie-write routes are outside (the census sees a missing gate)`, { outside: r.outside.length, gated: c.gated.length });
}
/** server.js mounts nothing before the gate: every top-level statement between `const app = express()` and
 *  `app.use(auth.middleware())` names `app` only as the allowlist does. Returns the findings. */
function beforeGate(src) {
  const ast = parse(src);
  if (!ast) return ['server.js does not parse'];
  const body = ast.body;
  const iApp = body.findIndex((s) => s.type === 'VariableDeclaration' && s.declarations.some((d) => d.id.name === 'app' && d.init && d.init.type === 'CallExpression' && d.init.callee.name === 'express'));
  const gates = body.map((s, i) => [s, i]).filter(([s]) => s.type === 'ExpressionStatement' && /^app\.use\(auth\.middleware\(\)\)$/.test(src.slice(s.expression.start, s.expression.end)));
  if (iApp < 0 || gates.length !== 1) return [`the app (${iApp}) or exactly one gate (${gates.length}) not found`];
  const iGate = gates[0][1];
  const findings = [];
  const ALLOWED = [
    (n, p, t) => p && p.type === 'MemberExpression' && p.object === n && !p.computed && p.property.name === 'locals',   // Object.defineProperty(app.locals, …)
    (n, p, t) => p && p.type === 'CallExpression' && /^http\.createServer$/.test(t(p.callee)) && p.arguments[0] === n,   // http.createServer(app)
  ];
  const TLS_TWIN = /^const hub = require\('\.\/src\/server\/tls\.js'\)\.create\(\{ app, /;   // the https twin of the SAME app (src/server/tls.js) — it mounts no route
  for (let i = iApp + 1; i < iGate; i++) {
    const s = body[i], t = (x) => src.slice(x.start, x.end);
    const txt = t(s).replace(/\s+/g, ' ');
    if (/^app\.use\(compression\(\)\);$/.test(txt)) continue;
    if (/^app\.use\(\(req, res, next\) => \{ const t0 = process\.hrtime\.bigint\(\); res\.on\('finish'/.test(txt) && !/res\.(json|send|status|end|redirect)\(/.test(txt)) continue; // the latency observer: watches, never answers
    const twin = TLS_TWIN.test(txt);
    walk(s, (n, p) => {
      if (n.type === 'Identifier' && n.name === 'app' && !(twin && p && p.type === 'Property' && p.shorthand) && !ALLOWED.some((f) => f(n, p, t))) findings.push(`server.js:${src.slice(0, n.start).split('\n').length} ${t(s).split('\n')[0].slice(0, 80)}`);
    });
    if (/\.(registerRoutes|register\w*Routes?|mount)\(/.test(txt)) findings.push(`server.js: a registration before the gate — ${txt.slice(0, 80)}`);
  }
  return [...new Set(findings)];
}
{
  const f = beforeGate(SERVER_SRC);
  ok(f.length === 0, 'server.js mounts nothing before the gate: between `const app = express()` and `app.use(auth.middleware())` the app is only created, served (http + the tls twin) and given its locals; compression + the latency observer only', f);
  const g = SERVER_SRC.indexOf('app.use(auth.middleware());');
  const planted = SERVER_SRC.slice(0, g) + "app.use(require('./src/routes/planted.js').router);\n" + SERVER_SRC.slice(g);
  const fp = beforeGate(planted);
  ok(fp.length === 1 && /planted/.test(fp[0]), 'CONTROL — a planted cookie-write router mounted before the gate ⇒ RED', fp);
  const preFix = SERVER_SRC.replace(/app\.use\(auth\.middleware\(\)\);([^\n]*)\nauth\.registerRoutes\(app\);\n/, 'auth.registerRoutes(app);\napp.use(auth.middleware());$1\n');
  const fr = beforeGate(preFix);
  ok(preFix !== SERVER_SRC && fr.length >= 1 && fr.some((x) => /registerRoutes/.test(x)), 'CONTROL — the pre-fix order (auth.registerRoutes before the gate) ⇒ RED', fr);
  const apps = [];
  for (const file of hubFiles()) codeLines(readRepo(file)).forEach((l, i) => { if (/\bexpress\(\)/.test(l)) apps.push(`${file}:${i + 1}`); });
  ok(apps.length === 1 && apps[0].startsWith('server.js:'), 'the hub tree creates ONE express app (server.js) — no route file serves its own behind no gate', apps);
}
{
  // no second origin rule: who reads Sec-Fetch-Site / Origin in the hub tree, and why
  const READERS = [
    ['src/write-origin.js', 'THE rule'],
    ['src/agent-routes.js', /req\.headers\['sec-fetch-site'\]\)\) return res\.status\(403\)\.json\(\{ error: 'only the agent that proposed it can withdraw/, 'a ROLE refusal, not an origin rule: a browser (the owner\'s own tab too) holds no agent identity — withdraw is the drafting agent\'s verb, refused by name (verify r2 LOW 6, test-channels-engine)'],
    ['src/server/mounts-plugins-wiring.js', /const origin = req\.headers\.origin \|\| /, 'a FACT, not a rule: the browser\'s Origin is the first dial-address row (test-dial-facts\' receiver census)'],
    ['src/routes/channels.js', /const o = req\.headers && req\.headers\.origin;/, 'a FACT, not a rule: the address the browser used, carried in the Slack consent state so the relay sends the browser back (slack-manifest judges it again)'],
  ];
  const seen = [];
  for (const f of hubFiles()) codeLines(readRepo(f)).forEach((l, i) => { if (/sec-fetch|req\.headers\.origin\b|headers\[['"]origin['"]\]/.test(l)) seen.push([f, i + 1, l]); });
  const stray = seen.filter(([f, , l]) => f !== 'src/write-origin.js' && !READERS.some((r) => r[0] === f && r[1] instanceof RegExp && r[1].test(l)));
  ok(stray.length === 0 && READERS.slice(1).every((r) => seen.some(([f, , l]) => f === r[0] && r[1].test(l))), `no second origin rule: Sec-Fetch-Site / Origin are read by write-origin.js and ${READERS.length - 1} declared readers (${READERS.slice(1).map((r) => r[0]).join(', ')})`, stray.map(([f, n, l]) => `${f}:${n} ${l.trim().slice(0, 90)}`));
}

console.log('⑦ LOGIN TOKENS AT REST (lane vault-e2e-password-fix-r2, the owner\'s decision ④ / design q-042 D9): sha256 only, 30-day slide, 180-day cap, a vault LOCK signs every login out');
{
  const A = fresh(AUTH);
  const DAY = 86400e3;
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const dataDir = path.join(DIR, `rest-${++seq}`); fs.mkdirSync(dataDir, { recursive: true });
    const auth = new A.Auth(dataDir);
    auth.setPassword('pw-rest-1');
    const tok = auth.issueToken('ua-1');
    const file = path.join(dataDir, 'auth.json');
    const text = fs.readFileSync(file, 'utf8');
    ok(!text.includes(tok) && text.includes(A.tokenDigest(tok)) && (fs.statSync(file).mode & 0o777) === 0o600 && JSON.parse(text).tokensHashed === 1, 'issueToken: auth.json keys the login by sha256(token) — the token itself is in no byte of the file (0600)');
    ok(auth.checkToken(tok) && !auth.checkToken(A.tokenDigest(tok)), 'the cookie\'s token opens; the DIGEST (what a disk thief reads) opens nothing');
    // MUTANT: the pre-r2 issue (the token itself as the map key) ⇒ the at-rest census above is RED
    const anchor = "this._state.tokens[tokenDigest(token)] = { createdAt: now, usedAt: now, ua: String(ua).slice(0, 120) };";
    const mutSrc = readRepo(AUTH);
    ok(mutSrc.includes(anchor), 'the mutant\'s anchor is issueToken\'s write');
    const AM = require(MUT.write(AUTH, mutSrc.replace(anchor, "this._state.tokens[token] = { createdAt: now, usedAt: now, ua: String(ua).slice(0, 120) };"), 'plain-key'));
    const dm = path.join(DIR, `rest-mut-${++seq}`); fs.mkdirSync(dm, { recursive: true });
    const am = new AM.Auth(dm); am.setPassword('pw-m'); const tm = am.issueToken('m');
    ok(fs.readFileSync(path.join(dm, 'auth.json'), 'utf8').includes(tm), 'MUTANT (the token stored as the key) ⇒ RED: the census reads the token in auth.json');
    // THE SLIDE: each use extends 30 days; THE CAP: 180 days from the sign-in, however often used
    const t0 = clock;
    clock = t0 + 29 * DAY; ok(auth.checkToken(tok), 'day 29, used: alive (and the slide moves)');
    clock = t0 + 58 * DAY; ok(auth.checkToken(tok), 'day 58 (29 days after the last use): alive — the slide moved at day 29');
    clock = t0 + 58 * DAY + 31 * DAY; ok(!auth.checkToken(tok), 'day 89 (31 days unused): DEAD — the 30-day slide');
    const tok2 = (clock = t0, auth.issueToken('ua-2'));
    for (let dd = 20; dd < 180; dd += 20) { clock = t0 + dd * DAY; auth.checkToken(tok2); }
    clock = t0 + 179 * DAY; ok(auth.checkToken(tok2), 'used every 20 days: alive at day 179');
    clock = t0 + 181 * DAY; ok(!auth.checkToken(tok2), 'day 181: DEAD however often it was used — the 180-day cap');
    // the slide reaches the disk at most once an hour, and the cookie's Max-Age follows it (never past the cap)
    clock = t0 + 200 * DAY;
    const tok3 = auth.issueToken('ua-3');
    const disk = () => JSON.parse(fs.readFileSync(file, 'utf8')).tokens[A.tokenDigest(tok3)].usedAt;
    clock += 10 * 60e3; auth.checkToken(tok3);
    ok(disk() === t0 + 200 * DAY, 'a use 10 min after the last: the slide is in memory only (no auth.json write per request)');
    clock += 2 * 3600e3;
    const cookies = [];
    const res = { append: (k, v) => cookies.push([k, v]) };
    ok(auth.checkToken(tok3) && disk() === clock, 'a use an hour later: usedAt reaches the disk');
    auth._slideCookie({ headers: {} }, res, tok3);
    const ma = Number((/Max-Age=(\d+)/.exec((cookies[0] || [])[1] || '') || [])[1]);
    ok(cookies.length === 1 && ma === 30 * 86400, 'and the cookie is re-set with the slide\'s 30 days (Max-Age) — a login used every day never expires in the browser before the cap', cookies);
    clock = t0 + 200 * DAY + 175 * DAY;
    ok(A.Auth.cookieMaxAge(JSON.parse(fs.readFileSync(file, 'utf8')).tokens[A.tokenDigest(tok3)], clock) === 5 * 86400, 'near the cap the cookie\'s Max-Age is what is LEFT of the 180 days (5 days), never the full 30');
    ok(/Max-Age=\$\{Math\.floor\(TOKEN_IDLE_MS \/ 1000\)\}/.test(readRepo(AUTH)) && !/Max-Age=\$\{Math\.floor\(TOKEN_TTL_MS/.test(readRepo(AUTH)), 'a sign-in sets the 30-day cookie (never the 180-day one)');
    // THE MIGRATION: a plaintext map an older build wrote is hashed at the first start — every login inside the cap stays valid once
    clock = realNow();
    const d2 = path.join(DIR, `rest-${++seq}`); fs.mkdirSync(d2, { recursive: true });
    const old = [crypto.randomBytes(24).toString('hex'), crypto.randomBytes(24).toString('hex'), crypto.randomBytes(24).toString('hex')];
    fs.writeFileSync(path.join(d2, 'auth.json'), JSON.stringify({ passwordHash: 'x'.repeat(64), salt: 'ab'.repeat(16), userSet: true, tokens: { [old[0]]: { createdAt: clock - 5 * DAY }, [old[1]]: { createdAt: clock - 170 * DAY }, [old[2]]: { createdAt: clock - 190 * DAY } } }));
    fs.linkSync(path.join(d2, 'auth.json'), path.join(d2, 'before.link'));
    const a2 = new A.Auth(d2);
    const t2 = fs.readFileSync(path.join(d2, 'auth.json'), 'utf8');
    ok(old.every((x) => !t2.includes(x)) && !old.some((x) => fs.readFileSync(path.join(d2, 'before.link'), 'latin1').includes(x)), 'MIGRATION: the plaintext keys become digests at the first start, and the old file\'s bytes are overwritten (the hard link to the retired inode reads no token)');
    ok(a2.checkToken(old[0]) && a2.checkToken(old[1]) && !a2.checkToken(old[2]), 'every login inside the cap stays valid once (the migration counts as its use); one past 180 days is gone');
    const a3 = new A.Auth(d2);
    ok(a3.checkToken(old[0]) && fs.readFileSync(path.join(d2, 'auth.json'), 'utf8') === fs.readFileSync(path.join(d2, 'auth.json'), 'utf8') && Object.keys(JSON.parse(fs.readFileSync(path.join(d2, 'auth.json'), 'utf8')).tokens).every((k) => /^[0-9a-f]{64}$/.test(k)), 'a second start does not hash the digests again (logins still valid)');
  } finally { Date.now = realNow; }
  // THE LOCK SIGNS EVERY LOGIN OUT — the REAL vault engine + the REAL hooks (src/server/vault-hooks.js) + a REAL ws server
  {
    const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
    const { wireVaultHooks, SIGNED_OUT_CODE } = require(path.join(REPO, 'src/server/vault-hooks.js'));
    const I = await instance('password', { authMod: A, extra: (app) => app.get('/api/home', (req, res) => res.json({ ok: true })) });
    const vd = path.join(DIR, `vault-${++seq}`); fs.mkdirSync(vd, { recursive: true });
    const v = VE.create({ dataDir: vd, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {} }, idleTimer: false, register: false });
    const wss = new WebSocketServer({ port: 0, host: OWN_HOST });
    await new Promise((r) => wss.on('listening', r));
    const closed = [];
    const c1 = new WebSocket(`ws://${OWN_HOST}:${wss.address().port}/ws`);
    await new Promise((r) => c1.on('open', r));
    c1.on('close', (code) => closed.push(code));
    await new Promise((r) => setTimeout(r, 30));
    wireVaultHooks({ vault: v, auth: I.auth, wss, log: { log() {}, warn() {} } });
    ok((await v.setup('second-password-1', {})).ok, 'a vault set up (its hooks wired the way the hub wires them)');
    const before = await hit(I, '/api/home', { method: 'GET', headers: I.cookie });
    ok(before.status === 200, 'before the lock: the cookie opens /api/home');
    v.lock('sigterm', { quiet: true });
    ok((await hit(I, '/api/home', { method: 'GET', headers: I.cookie })).status === 200, 'the SHUTDOWN\'s quiet lock signs nobody out (a restart is not a lock act — the unlock modal is the gate)');
    await v.unlock('second-password-1', {});
    v.lock('door');
    await new Promise((r) => setTimeout(r, 100));
    const after = await hit(I, '/api/home', { method: 'GET', headers: I.cookie });
    ok(after.status === 401 && closed.includes(SIGNED_OUT_CODE) && Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, `password-${seq - 1}`, 'auth.json'), 'utf8')).tokens || {}).length === 0,
      'a LOCK (the door): every login revoked (the old cookie ⇒ 401 — the page shows the sign-in, then the unlock), every page socket closed with 4401, auth.json\'s map empty', { status: after.status, closed });
    v.close(); wss.close(); await I.close();
  }
}

console.warn = warn0;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
