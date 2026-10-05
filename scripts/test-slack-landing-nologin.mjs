#!/usr/bin/env node
// THE SLACK CONSENT LANDING NEEDS NO VIBESPACE LOGIN (2.369.214, userW). A fleet user pressed Allow in ANOTHER browser
// profile (their Slack identity lives apart from their SSO login); src/auth.js's gate saw a GET with text/html and no
// cookie and redirected to /login — the code + state address was lost. The signed STATE is the landing's credential;
// the RECORD is still made by the owner's cookied tab. Over a REAL `Auth` middleware + the REAL channels router (the
// engine a stub whose oauthLanding runs the real SlackManifest.stateVerdict):
//   ① password AND a stubbed Clerk: GET /api/channels/oauth/cb/slack?code&state with NO cookie and text/html reaches
//      the route (200, the "go back" page naming the identity, no "sign in"); POST /oauth/callback, GET /oauth/status,
//      a POST to the landing path, /oauth/cb (no kind), /oauth/cbx/slack stay behind the cookie (401 / redirect)
//   ② a forged / expired / used state refused BY NAME without a cookie
//   ③ the door limit: the 31st landing in a minute from one address is 429 html, the state never judged; its page
//      says wait + reload in en / zh / ja (verify r1: never "start again"); a clock stepped BACK opens a new window
//   ④ the owner's finish line names the identity the status poll answered (a DOM-free render, en / zh / ja keys)
//   ⑤ patched-copy controls (scripts/mutant-copy.mjs): the exemption removed ⇒ ① redirects to /login; the limit
//      removed ⇒ the 31st lands
// Run: node scripts/test-slack-landing-nologin.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'package.json'));
const express = require('express');
const M = require(path.join(REPO, 'src/channels/slack-manifest.js'));
// int214 (dc-channels-consent): the route sends :kind's DECLARED consent page — the real Slack adapter's row
const SLACK = require(path.join(REPO, 'src/channels/slack.js'));
const AUTH = 'src/auth.js', ROUTES = 'src/routes/channels.js';
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const MUT = mutantCopies('slack-landing-nologin', REPO);
const DIR = scratch('slack-landing-nologin'); fs.mkdirSync(DIR, { recursive: true });

const KEY = crypto.randomBytes(32);
const sign = (clear) => crypto.createHmac('sha256', KEY).update(String(clear)).digest('base64url');
const stateAt = (t = Date.now()) => M.stateOf({ origin: 'https://pod.example.test', flowId: crypto.randomBytes(8).toString('hex'), issuedAt: t }, sign);
const USER = 'Acme · @mart';
/** The engine's first steps, verbatim in shape: the verdict first, then a code used once. */
function stubEngine() {
  const calls = [], used = new Set();
  return {
    calls,
    async oauthLanding({ kind, state }) {
      calls.push(kind);
      const v = M.stateVerdict(state, { sign, now: Date.now(), ttlMs: 30 * 60e3 });
      if (!v.ok) return { ok: false, why: v.why, user: null, error: null };
      if (used.has(state)) return { ok: false, why: 'used', user: null, error: null };
      used.add(state);
      return { ok: true, why: null, user: USER, error: null };
    },
    oauthStatus() { return { token: null }; },
    consentLandingOf(kind) { return kind === SLACK.kind && SLACK.consent && SLACK.consent.landing ? SLACK.consent.landing.landingHtml : null; },
  };
}
const fresh = (rel) => { const f = path.join(REPO, rel); delete require.cache[require.resolve(f)]; return require(f); };
let seq = 0;
/** An instance: `mode` 'password' | 'clerk'; `authMod` / `routesMod` = the real modules or patched copies. */
async function instance(mode, { authMod = fresh(AUTH), routesMod = fresh(ROUTES) } = {}) {
  const dataDir = path.join(DIR, `${mode}-${++seq}`); fs.mkdirSync(dataDir, { recursive: true });
  const clerk = mode === 'clerk' ? { enabled: true, emailAllowed: () => true, verifyToken: async () => ({ email: 'o@example.test' }) } : null;
  const auth = new authMod.Auth(dataDir, { clerk });
  if (mode === 'password') auth.setPassword('pw-' + crypto.randomBytes(6).toString('hex'));
  const eng = stubEngine();
  routesMod.setup({ getEngine: () => eng });
  const app = express();
  app.use(express.json());
  app.use(auth.middleware());
  app.use(routesMod.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  return { auth, eng, base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}
async function hit(base, p, { method = 'GET', accept = 'text/html,application/xhtml+xml', cookie = null, body = null } = {}) {
  const headers = { accept };
  if (cookie) headers.cookie = cookie;
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  return { status: r.status, loc: r.headers.get('location'), type: r.headers.get('content-type') || '', text: await r.text() };
}
const cb = (state, code = '1.2.abcdef') => `/api/channels/oauth/cb/slack?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
const landed = (r) => r.status === 200 && /data-landing="ok"/.test(r.text) && r.text.includes('Go back to the VibeSpace window where you pressed Connect') && r.text.includes(USER) && !/sign[ -]?in/i.test(r.text);

console.log('① no cookie: the landing passes the ONE gate, nothing else does');
for (const mode of ['password', 'clerk']) {
  const I = await instance(mode);
  ok(I.auth.enabled && (mode === 'password' ? I.auth.passwordEnabled : (I.auth.ssoEnabled && !I.auth.passwordEnabled)), `${mode}: the gate is on (${mode === 'password' ? 'a password' : 'Clerk SSO, no password'})`);
  const L = await hit(I.base, cb(stateAt()));
  ok(landed(L) && I.eng.calls.length === 1, `${mode}: GET …/oauth/cb/slack?code&state, text/html, NO cookie → the route (200, “go back” page naming ${USER}, no sign-in words; engine asked once)`, JSON.stringify({ status: L.status, loc: L.loc, calls: I.eng.calls.length, text: L.text.slice(0, 300) }));
  const others = [
    ['POST /api/channels/oauth/callback', await hit(I.base, '/api/channels/oauth/callback', { method: 'POST', accept: 'application/json', body: { url: 'x' } }), 401],
    ['GET /api/channels/oauth/status', await hit(I.base, '/api/channels/oauth/status', { accept: 'application/json' }), 401],
    ['POST /api/channels/oauth/cb/slack', await hit(I.base, cb(stateAt()), { method: 'POST', accept: 'application/json', body: {} }), 401],
    ['GET /api/channels/oauth/cb (no kind)', await hit(I.base, '/api/channels/oauth/cb?code=1&state=2'), 302],
    ['GET /api/channels/oauth/cbx/slack', await hit(I.base, '/api/channels/oauth/cbx/slack?code=1&state=2'), 302],
    ['GET /api/channels/oauth/cb/slack/extra', await hit(I.base, '/api/channels/oauth/cb/slack/extra?code=1&state=2', { accept: 'application/json' }), 401],
  ];
  const wrong = others.filter(([, r, want]) => r.status !== want || (want === 302 && r.loc !== '/login'));
  ok(!wrong.length && I.eng.calls.length === 1, `${mode}: the exemption is exact — ${others.map(([n, , w]) => `${n} → ${w}`).join(' · ')}; the engine never asked`, JSON.stringify(wrong.map(([n, r]) => [n, r.status, r.loc])));
  if (mode === 'password') {
    const tok = I.auth.issueToken('test');
    const C = await hit(I.base, cb(stateAt()), { cookie: `vs_token=${tok}` });
    const S = await hit(I.base, '/api/channels/oauth/status', { accept: 'application/json', cookie: `vs_token=${tok}` });
    ok(landed(C) && S.status === 200, 'password: the same landing WITH the owner\'s cookie still lands; the cookied status poll answers 200');
  }
  await I.close();
}

console.log('② refusals by name, still without a cookie');
{
  const I = await instance('password');
  const good = stateAt();
  const flip = good.slice(0, -1) + (good.endsWith('A') ? 'B' : 'A');
  const R = { forged: await hit(I.base, cb(flip)), expired: await hit(I.base, cb(stateAt(Date.now() - 31 * 60e3))), first: await hit(I.base, cb(good)), used: await hit(I.base, cb(good)) };
  const said = (r, words) => r.status === 400 && /data-landing="refused"/.test(r.text) && r.text.includes(`(${words})`);
  ok(said(R.forged, 'not signed by this VibeSpace') && said(R.expired, 'expired') && landed(R.first) && said(R.used, 'already used') && I.eng.calls.length === 4, 'a forged signature, a state past the TTL, a replay of a used one: 400 refused pages BY NAME (not signed by this VibeSpace / expired / already used) — no redirect, no login', JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, r]) => [k, r.status, r.text.slice(-200)]))));
  await I.close();
}

const flood = async (I, n) => { const out = []; for (let i = 0; i < n; i++) out.push(await hit(I.base, cb('nonsense-' + i))); return out; };
console.log('③ the door limit: ≤ 30 landings / address / minute');
{
  const I = await instance('clerk');
  const rs = await flood(I, 31);
  const last = rs[30];
  ok(rs.slice(0, 30).every((r) => r.status === 400) && last.status === 429 && /text\/html/.test(last.type) && /data-landing="too-many"/.test(last.text) && ['Wait a minute, then reload this page', '等一分钟后刷新本页', '1 分待ってからこのページを再読み込み'].every((w) => last.text.includes(w)) && !/Start again|重新开始|やり直/.test(last.text) && I.eng.calls.length === 30, 'thirty landings are judged (400 bad-shape); the 31st is 429 html saying wait + reload in en / zh / ja (never "start again") and the state is NEVER judged (the engine asked 30 times)', JSON.stringify({ last: [last.status, last.type, last.text.slice(-200)], calls: I.eng.calls.length }));
  const real = Date.now, t0 = real();
  Date.now = () => t0 - 3600e3;   // verify r1: an NTP step back used to keep the window until the clock caught up (an hour of 429)
  let back; try { back = (await flood(I, 1))[0]; } finally { Date.now = real; }
  ok(back.status !== 429 && I.eng.calls.length === 31, 'a clock stepped back an hour opens a new window: the next landing is judged, not 429', JSON.stringify({ status: back.status, calls: I.eng.calls.length }));
  await I.close();
}

console.log('④ the owner\'s finish line names who landed (DOM-free)');
{
  const esbuild = require('esbuild');
  const STUBS = {
    'utils.js': 'export const createModalShell = () => null, showToast = () => {}, copyText = () => {}, escHtml = (s) => String(s);',
    'autocomplete.js': 'export const setupDirAutocomplete = () => {};',
    'i18n.js': 'export const t = (s, p) => { const v = (globalThis.__I18N && globalThis.__I18N[s]) || s; return p ? v.replace(/\\{(\\w+)\\}/g, (m, k) => (k in p ? String(p[k]) : m)) : v; };',
  };
  const stub = { name: 'stub-dom', setup(b) {
    b.onResolve({ filter: /^\.\/(utils|autocomplete|i18n)\.js$/ }, (a) => (/mounts-dialog\.js$/.test(a.importer) ? { path: path.basename(a.path), namespace: 'stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
  } };
  const out = path.join(DIR, 'mounts-dialog.mjs');
  await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/mounts-dialog.js')], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent', plugins: [stub] });
  const D = await import(pathToFileURL(out).href);
  const table = (rel) => new Function(fs.readFileSync(path.join(REPO, rel), 'utf-8').replace(/^export default/m, 'return'))();
  const en = D.connectedLine(USER), none = D.connectedLine(null);
  globalThis.__I18N = table('src/lib/i18n-zh.js'); const zh = D.connectedLine(USER);
  globalThis.__I18N = table('src/lib/i18n-ja.js'); const ja = D.connectedLine(USER);
  globalThis.__I18N = null;
  ok(en === `✓ Connected as ${USER} — finish with the “Connect” button below.` && none === '✓ Connected — finish with the “Connect” button below.', `en: “${en}”; no identity answered → the old line`);
  ok(zh.includes(USER) && /连接/.test(zh) && ja.includes(USER) && /接続/.test(ja), `zh / ja carry the identity: “${zh}” · “${ja}”`);
  const dlg = fs.readFileSync(path.join(REPO, 'src/lib/mounts-dialog.js'), 'utf-8');
  ok(/if \(st\.token\) finish\(st\.token, st\.user \|\| null\)/.test(dlg) && /status\.textContent = typeof finishText === 'function' \? finishText\(user\) : \(finishText \|\| connectedLine\(user\)\)/.test(dlg), 'the consent block\'s status poll hands st.user to finish(), which draws connectedLine(user)');
}

console.log('⑤ patched-copy controls (never src/)');
{
  const asrc = fs.readFileSync(path.join(REPO, AUTH), 'utf-8');
  const ex = asrc.split('\n').filter((l) => /oauth\\\/cb\\\//.test(l) && /return next\(\)/.test(l));
  const noEx = MUT.load(AUTH, asrc.split('\n').filter((l) => !ex.includes(l)).join('\n'), 'no-exemption');
  const I = await instance('password', { authMod: noEx });
  const L = await hit(I.base, cb(stateAt()));
  ok(ex.length === 1 && !landed(L) && L.status === 302 && L.loc === '/login' && I.eng.calls.length === 0, 'the exemption removed ⇒ the no-cookie landing is redirected to /login (① red by the same assert), the engine never reached', JSON.stringify({ ex: ex.length, status: L.status, loc: L.loc }));
  await I.close();
  const rsrc = fs.readFileSync(path.join(REPO, ROUTES), 'utf-8');
  const lim = rsrc.split('\n').filter((l) => /^\s*if \(!landingAllowed\(/.test(l));
  const noLim = MUT.load(ROUTES, rsrc.split('\n').filter((l) => !lim.includes(l)).join('\n'), 'no-limit');
  const J = await instance('clerk', { routesMod: noLim });
  const rs = await flood(J, 31);
  ok(lim.length === 1 && rs[30].status === 400 && J.eng.calls.length === 31, 'the door limit removed ⇒ the 31st landing is judged (③ red)', JSON.stringify({ lim: lim.length, last: rs[30].status, calls: J.eng.calls.length }));
  await J.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
