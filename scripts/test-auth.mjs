#!/usr/bin/env node
// test-auth — THE OWNER'S AUTH LAYER over the REAL src/auth.js, mounted in server.js's own order (registerRoutes and
// the cookie middleware: the order is READ from server.js, never assumed).
//   ① WHO MAY SET A PASSWORD, by the instance's state (lane owner-write-origin, 2026-10-14): server.js registers the
//      auth routes BEFORE the cookie gate, so POST /api/auth/set-password judges its own caller —
//      SSO and no password ⇒ a signed-in request only (anonymous: 401, no password, no cookie, every session kept);
//      a password configured ⇒ the current password (unchanged); neither (first-run onboarding) ⇒ open, as before.
//      RED CONTROL (patched copy, never src/): the route's own check cut ⇒ the anonymous POST on a Clerk-only
//      instance answers 200, sets a password and hands the caller a session cookie (the measured hole).
// Run: node scripts/test-auth.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'package.json'));
const express = require('express');
const AUTH = 'src/auth.js';
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const MUT = mutantCopies('auth', REPO);
const DIR = scratch('auth'); fs.mkdirSync(DIR, { recursive: true });
const fresh = (rel) => { const f = path.join(REPO, rel); delete require.cache[require.resolve(f)]; return require(f); };

// server.js's own order of the two auth mounts (code lines only — a comment naming them never counts)
const SERVER = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8').split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l));
const lineOf = (re) => SERVER.findIndex((l) => re.test(l));
const AT = { routes: lineOf(/^\s*auth\.registerRoutes\(app\);/), gate: lineOf(/^\s*app\.use\(auth\.middleware\(\)\);/) };
const ORDER = AT.routes < AT.gate ? ['routes', 'gate'] : ['gate', 'routes'];

let seq = 0;
/** An instance: `mode` 'password' | 'clerk' | 'open'; `authMod` = the real module or a patched copy. */
async function instance(mode, { authMod = fresh(AUTH) } = {}) {
  const dataDir = path.join(DIR, `${mode}-${++seq}`); fs.mkdirSync(dataDir, { recursive: true });
  const clerk = mode === 'clerk' ? { enabled: true, emailAllowed: () => true, verifyToken: async () => ({ email: 'o@example.test' }) } : null;
  const auth = new authMod.Auth(dataDir, { clerk });
  const pw = 'pw-' + crypto.randomBytes(6).toString('hex');
  if (mode === 'password') auth.setPassword(pw);
  const app = express();
  for (const step of ORDER) { if (step === 'routes') auth.registerRoutes(app); else app.use(auth.middleware()); }
  app.use(express.json());
  app.post('/api/x', (req, res) => res.json({ ok: true }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  return { auth, pw, port: srv.address().port, close: () => new Promise((r) => srv.close(r)) };
}
/** One raw request — exact headers (no client adds a header of its own). */
function hit(I, p, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const b = body === undefined ? null : JSON.stringify(body);
    const h = { ...headers };
    if (b !== null) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(b); }
    const r = http.request({ host: '127.0.0.1', port: I.port, path: p, method, headers: h }, (x) => {
      let d = ''; x.on('data', (c) => d += c);
      x.on('end', () => { let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: x.statusCode, cookie: x.headers['set-cookie'] || null, json: j, text: d }); });
    });
    r.on('error', reject);
    r.end(b === null ? undefined : b);
  });
}
const cookieOf = (tok) => ({ cookie: `vs_token=${tok}` });

console.log(`① who may set a password, by the instance's state (server.js order: ${ORDER.join(' → ')})`);
ok(AT.routes >= 0 && AT.gate >= 0, `server.js mounts both: auth.registerRoutes(app) at ${AT.routes + 1}, app.use(auth.middleware()) at ${AT.gate + 1}`);
{
  // SSO and no password: anonymous refused, the instance unchanged; a signed-in owner sets one
  const I = await instance('clerk');
  const owner = I.auth.issueToken('owner-ua');
  const anon = await hit(I, '/api/auth/set-password', { body: { newPassword: 'attacker1' } });
  ok(anon.status === 401 && !anon.cookie && !I.auth.passwordEnabled && I.auth.checkToken(owner),
    'SSO, no password: an ANONYMOUS POST {newPassword} is 401 — no password set, no cookie handed out, the signed-in session kept', JSON.stringify({ status: anon.status, cookie: anon.cookie, pw: I.auth.passwordEnabled }));
  const anonRm = await hit(I, '/api/auth/set-password', { body: { remove: true } });
  ok(anonRm.status === 401, 'SSO, no password: an anonymous {remove:true} is 401 too', anonRm.status);
  const forged = await hit(I, '/api/auth/set-password', { headers: cookieOf('ab'.repeat(24)), body: { newPassword: 'attacker1' } });
  ok(forged.status === 401 && !I.auth.passwordEnabled, 'SSO, no password: a cookie that is no session (unknown token) is 401', forged.status);
  const mine = await hit(I, '/api/auth/set-password', { headers: cookieOf(owner), body: { newPassword: 'owner-pw-1' } });
  ok(mine.status === 200 && I.auth.passwordEnabled && I.auth.verifyPassword('owner-pw-1') && /vs_token=[a-f0-9]+/.test(String(mine.cookie)),
    'SSO, no password: the SIGNED-IN owner (session cookie) sets a password — 200, a fresh session cookie', JSON.stringify({ status: mine.status, json: mine.json }));
  await I.close();
}
{
  // a password configured: the current password, exactly as before (with or without a cookie)
  const I = await instance('password');
  const wrong = await hit(I, '/api/auth/set-password', { body: { current: 'nope', newPassword: 'other-pw-1' } });
  ok(wrong.status === 401 && I.auth.verifyPassword(I.pw), 'a password configured: the wrong current password is 401, the password unchanged', wrong.status);
  const right = await hit(I, '/api/auth/set-password', { body: { current: I.pw, newPassword: 'other-pw-1' } });
  ok(right.status === 200 && I.auth.verifyPassword('other-pw-1'), 'a password configured: the current password changes it (unchanged rule)', right.status);
  await I.close();
}
{
  // neither: the first-run onboarding sets the first password (src/lib/setup-flows.js #ob-setpw: {newPassword} alone)
  const I = await instance('open');
  ok(!I.auth.enabled, 'neither configured: auth is off');
  const first = await hit(I, '/api/auth/set-password', { body: { newPassword: 'first-pw-1' } });
  ok(first.status === 200 && I.auth.enabled && I.auth.verifyPassword('first-pw-1') && /vs_token=[a-f0-9]+/.test(String(first.cookie)),
    'neither configured (first-run onboarding): {newPassword} sets the first password — 200 + a session cookie, as before', JSON.stringify({ status: first.status, json: first.json }));
  const after = await hit(I, '/api/x', { body: {} });
  ok(after.status === 401, 'and from then on the cookie gate stands (an anonymous write is 401)', after.status);
  await I.close();
}
{
  // RED CONTROL: the route's own check cut (a patched copy) ⇒ the anonymous POST takes the Clerk-only instance
  const src = fs.readFileSync(path.join(REPO, AUTH), 'utf-8');
  const cut = src.split('\n').filter((l) => /this\.enabled && !this\.passwordEnabled && !this\.requestAuthed\(req\)/.test(l));
  const M = MUT.load(AUTH, src.split('\n').filter((l) => !cut.includes(l)).join('\n'), 'no-state-check');
  const I = await instance('clerk', { authMod: M });
  const owner = I.auth.issueToken('owner-ua');
  const anon = await hit(I, '/api/auth/set-password', { body: { newPassword: 'attacker1' } });
  ok(cut.length === 1 && anon.status === 200 && I.auth.passwordEnabled && /vs_token=[a-f0-9]+/.test(String(anon.cookie)) && !I.auth.checkToken(owner),
    'CONTROL — the check cut ⇒ the anonymous POST answers 200, sets a password, revokes the owner\'s session and hands the caller a cookie (① red by the same asserts)', JSON.stringify({ cut: cut.length, status: anon.status, pw: I.auth.passwordEnabled }));
  await I.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
