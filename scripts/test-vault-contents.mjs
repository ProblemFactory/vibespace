#!/usr/bin/env node
// THE VAULT WINDOW'S DOORS (lane vault-contents-window — src/routes/vault.js's contents doors behind the REAL src/auth.js
// gate, in server.js's mount order; src/server/vault-contents.js over a real engine and three planted rows). Fast tier:
// express on 127.0.0.1.
//   ① PEOPLE ONLY: an agent token (vsst_ / jbt_ bearer, a body `token`) ⇒ 403 human_only on GET /api/vault/contents and
//      POST reveal-session / reveal / reveal-end — the collector never saw the call; a cross-site page / a browser-less
//      write ⇒ refused (the gate's 403 / the door's cross_site); no cookie ⇒ 401
//   ② the list is MASKED (no planted value); the reveal window is THIS PAGE's (r2, verify r1): reveal-session answers a page
//      secret; a reveal without it — the same sign-in, another tab — ⇒ 403 reveal_needs_password; another sign-in too
//   ③ ONE VALUE per answer: the raw body of each reveal holds exactly ONE planted value
//   ④ the pace (20 a minute per sign-in ⇒ the 21st 429 paced); a lock ends the window; reveal-end ends it
//   ⑤ THE CREDENTIAL ROADS through the window (r2): GET /api/accounts/:id/key (the real route) — no window ⇒ 403
//      reveal_needs_password, an agent token ⇒ human_only, the page's window ⇒ the key; GET /api/mounts/:id/config (the
//      route's own text lifted out of the wiring, over a real MountManager) — no window ⇒ the sealed fields MASKED, the
//      window ⇒ real; POST /api/config/export {includeSensitive} (the real route) — no second password ⇒ refused, a wrong
//      one ⇒ 403 wrong_password, the right one ⇒ the export (audited vault-export-sensitive), locked ⇒ 423 (int317: vault_locked is 423 on every door)
//   ⑥ the AUDIT: vault-reveal {who, ip, store, entry, field} per value — no value, no password, no page secret
//   ⑦ A HUB WITH NO SIGN-IN (verify r1): the owner's page opens its window; a headerless local process (no cookie, a forged
//      Sec-Fetch-Site) ⇒ reveal_needs_password, and its reveal-end ends nothing
//   ⑧ MUTANTS (judged by the same checks ⇒ RED): /reveal answering two values; no window check; a reveal WITHOUT the page
//      secret accepted; an agent token let through; a row worded from its value; a window extended by activity; the pace
//      forgotten; a lock that leaves the window open; the account route without the window
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
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : '')); } };
const ROOT = scratch('vault-contents');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const LOGS = [];
const log = { log: (m) => LOGS.push(String(m)), warn: (m) => LOGS.push(String(m)) };
const warn0 = console.warn; console.warn = (...a) => LOGS.push(a.join(' '));
const PW = 'contents second password';
const SIGN_IN = 'contents-signin-42';
const PLANT = { a: 'PLANT-a-' + crypto.randomBytes(16).toString('hex'), b: 'PLANT-b-' + crypto.randomBytes(16).toString('hex'), c: 'PLANT-c-' + crypto.randomBytes(16).toString('hex') };
const PLANT_MOUNT = 'PLANT-m-' + crypto.randomBytes(16).toString('hex');
/** A store over the planted values (the shape every real store answers — test-vault-inventory runs the six real ones). */
const fakeStore = (labelOf = (k) => `row ${k}`) => ({
  vaultRows: () => Object.keys(PLANT).map((k) => ({ entry: 'e-' + k, field: 'apiKey', label: labelOf(k), cipher: 'x' })),
  vaultReveal: (entry, field) => ((field === 'apiKey' || field === 'key') && PLANT[String(entry).slice(2)]) || null,
});
const WIRING = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
// the mount config door's text: its ONE answer (B-ee0a) and its two routes (GET, and the page's POST) — run in a stand-in app below
const extractMountRoute = (text) => { const i = text.indexOf('function mountConfigAnswer('); const p = text.indexOf("app.post('/api/mounts/:id/config', ", i); const j = text.indexOf('\n});', p); return i > 0 && p > i && j > p ? text.slice(i, j + 4) : null; };
const MOUNT_ROUTE = extractMountRoute(WIRING);
// (r1061, owed) THE EXTRACTION SAYS BY NAME WHEN IT FINDS NOTHING: a moved anchor would compile an app with no routes and every leg
// below would go red as a 404. CONTROL: the same extraction over the wiring with its anchor renamed finds nothing — the check names it.
ok(!!MOUNT_ROUTE, `the mount config door's text is found in src/server/mounts-plugins-wiring.js (mountConfigAnswer through its POST route)${MOUNT_ROUTE ? '' : " — NOT FOUND: an anchor moved («function mountConfigAnswer(», «app.post('/api/mounts/:id/config', »); the mount legs below cannot run"}`);
ok(extractMountRoute(WIRING.replace('function mountConfigAnswer(', 'function mountConfigReply(')) === null, 'CONTROL: the same extraction over the wiring with its anchor renamed finds NOTHING — the check above says so by name, never a 404');
const refuseAgentBearer = (req, res) => { if (/^Bearer\s+(vsst_|jbt_)/i.test(String(req.headers.authorization || ''))) { res.status(403).json({ error: 'agent', code: 'agent_forbidden' }); return true; } return false; };
/** A patched copy lives in a scratch dir: every relative require is made absolute against the original file's dir. */
const at = (file) => (s) => s.replace(/require\((['"])(\.{1,2}\/[^'"]+)\1\)/g, (m, q, p) => `require(${JSON.stringify(path.resolve(path.join(REPO, path.dirname(file)), p))})`);
process.setMaxListeners(40);   // ten hubs in one process (each store adds its exit hook)
let persistenceUsed = false;

/** One hub: the gate, the JSON body, the vault routes with the contents doors + the gate, the three credential roads. */
async function hub(tag, { contentsSrc = null, routesSrc = null, accountsSrc = null, store = fakeStore(), signIn = true, persistence = false } = {}) {
  const dataDir = path.join(ROOT, tag); fs.mkdirSync(dataDir, { recursive: true });
  const auth = new Auth(dataDir, {});
  if (signIn) auth.setPassword(SIGN_IN);
  const frames = [];
  let clock = Date.parse('2026-10-19T12:00:00Z');
  const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log, idleTimer: false, now: () => clock, register: false, signInPassword: (p) => auth.verifyPassword(p), bcast: (m) => frames.push(JSON.stringify(m)) });
  await vault.setup(PW);
  const load = (rel, src) => { if (!src) return require(path.join(REPO, rel)); const f = path.join(dataDir, path.basename(rel)); fs.writeFileSync(f, at(rel)(src)); return require(f); };
  const VC = load('src/server/vault-contents.js', contentsSrc);
  const calls = [];
  const contents0 = VC.create({ vault, sources: { accounts: () => store }, now: () => clock, mono: () => clock });
  const contents = Object.fromEntries(Object.entries(contents0).map(([k, f]) => [k, typeof f === 'function' ? (...a) => { calls.push(k); return f(...a); } : f]));
  const SESSION_TOKEN = 'vsst_' + crypto.randomBytes(16).toString('hex');
  const app = express();
  app.use(auth.middleware());
  auth.registerRoutes(app);
  app.use(express.json());
  const VR = load('src/routes/vault.js', routesSrc);
  const who = (req) => Auth.signInHandle(req);
  VR.registerVaultRoutes(app, { vault, activeSessions: new Map([['s1', { agentToken: SESSION_TOKEN }]]), getJobs: () => ({ jobByToken: (t) => (t === 'jbt_live' ? { id: 'j1' } : null) }), contents, who });
  app.locals.vaultGate = VR.vaultGate({ vault, contents, who });
  // the account key route — the REAL module (stubs for what this suite does not reach)
  load('src/server/account-usage-routes.js', accountsSrc).create({ app, rootDir: dataDir, HOST: '127.0.0.1', activeSessions: new Map(), auth, engine: { clearSealedOrders() {} }, serverSetting: () => undefined, getAccounts: () => ({ revealKey: () => 'THE-OLD-ROAD' }), getHosts: () => null, getMounts: () => null, getTelemetry: () => null, getUsageHistory: () => null, getLoginExpiryWatch: () => null });
  // the mount config route — its own text, lifted out of the wiring, over a real MountManager
  const mDir = path.join(dataDir, 'mounts-store'); fs.mkdirSync(mDir, { recursive: true });   // its own dir: no vault.json beside its key (this suite's engine registers none)
  const mounts = new MountManager({ dataDir: mDir, broadcast: () => {}, getSetting: () => undefined });
  mounts._state.mounts.push({ id: 'mnt1', name: 'Team bucket', type: 's3', endpoint: 'https://s3.example.invalid', bucket: 'b', accessKey: 'AK', secretKeyEnc: mounts._enc(PLANT_MOUNT) }); mounts._save();
  if (MOUNT_ROUTE) new Function('app', 'mounts', 'refuseAgentBearer', 'personOnlyDoor', MOUNT_ROUTE)(app, mounts, refuseAgentBearer, require(path.join(REPO, 'src/routes/account-tails.js')).personOnlyDoor);   // (not found: said by name at the top)
  if (persistence) {
    const P = require(path.join(REPO, 'src/routes/persistence.js'));
    if (!persistenceUsed) { persistenceUsed = true; P.setup({ dataDir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth, getHosts: () => null, getMounts: () => null, getTasks: () => null, getAccounts: () => ({ list: () => ({ accounts: [] }), exportBundle: () => ({ accounts: [{ id: 'e-c', key: PLANT.c }] }) }), getUsageHistory: () => null, onSettingsWrite: () => {} }); }
    app.use(P.router);
  }
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const PORT = srv.address().port, OWN = `http://127.0.0.1:${PORT}`;
  const cookieA = signIn ? `vs_token=${auth.issueToken('owner')}` : '', cookieB = signIn ? `vs_token=${auth.issueToken('owner')}` : '';
  const page = (cookie = cookieA, extra = {}) => ({ ...(cookie ? { cookie } : {}), 'sec-fetch-site': 'same-origin', origin: OWN, ...extra });
  const answers = [];
  const hit = (p, { method = 'POST', headers = page(), body } = {}) => new Promise((resolve, reject) => {
    const b = method === 'GET' ? null : JSON.stringify(body || {});
    const h = { ...headers };
    if (b !== null) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(b); }
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: h }, (x) => {
      let d = ''; x.on('data', (c) => d += c);
      x.on('end', () => { answers.push(d); let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: x.statusCode, json: j || {}, raw: d }); });
    });
    r.on('error', reject); r.end(b === null ? undefined : b);
  });
  return { dataDir, vault, calls, hit, page, cookieA, cookieB, SESSION_TOKEN, frames, answers, step: (ms) => { clock += ms; }, close: () => { vault.close(); srv.close(); } };
}
const ID = (k) => `accounts:e-${k}#apiKey`;
const plantsIn = (s) => [...Object.values(PLANT), PLANT_MOUNT].filter((v) => String(s).includes(v)).length;

/** THE CHECKS (the shipped tree must pass every one; each mutant must fail at least one). → the failing check names. */
async function judge(t) {
  const red = [];
  // ① people only
  for (const [m, p] of [['GET', '/api/vault/contents'], ['POST', '/api/vault/reveal-session'], ['POST', '/api/vault/reveal'], ['POST', '/api/vault/reveal-end']]) {
    for (const headers of [{ ...t.page(), authorization: 'Bearer ' + t.SESSION_TOKEN }, { ...t.page(), authorization: 'Bearer jbt_live' }]) {
      const r = await t.hit(p, { method: m, headers, body: { password: PW, id: ID('a') } });
      if (!(r.status === 403 && r.json.code === 'human_only')) red.push(`human_only ${m} ${p} ${r.status}`);
    }
    if (m === 'POST') { const r = await t.hit(p, { headers: t.page(), body: { token: t.SESSION_TOKEN, password: PW, id: ID('a') } }); if (!(r.status === 403 && r.json.code === 'human_only')) red.push(`human_only body token ${p}`); }
    const curl = await t.hit(p, { method: m, headers: { cookie: t.cookieA }, body: { password: PW, id: ID('a') } });
    if (!(curl.status === 403)) red.push(`cross_site ${p} ${curl.status}`);
    const none = await t.hit(p, { method: m, headers: { 'sec-fetch-site': 'same-origin' }, body: { password: PW } });
    if (none.status !== 401) red.push(`no cookie ${p} ${none.status}`);
  }
  if (t.calls.some((c) => c !== 'windowFacts' && c !== 'list')) red.push('an agent / cross-site call reached the collector: ' + t.calls.join());
  // ② masked list; THIS page's window
  const list = await t.hit('/api/vault/contents', { method: 'GET' });
  if (!(list.status === 200 && list.json.rows && list.json.rows.length === 3)) red.push('the list ' + list.status);
  if (plantsIn(list.raw)) red.push('THE LIST CARRIES A VALUE');
  if (list.json.reveal && list.json.reveal.open) red.push('a window open before any password');
  const r0 = await t.hit('/api/vault/reveal', { body: { id: ID('a') } });
  if (!(r0.status === 403 && r0.json.code === 'reveal_needs_password') || plantsIn(r0.raw)) red.push('a reveal without the window answered ' + r0.status);
  const wrong = await t.hit('/api/vault/reveal-session', { body: { password: 'not it' } });
  if (!(wrong.status === 403 && wrong.json.code === 'wrong_password')) red.push('a wrong second password ' + wrong.status);
  const rs = await t.hit('/api/vault/reveal-session', { body: { password: PW } });
  const PAGE = rs.json.page;
  if (!(rs.status === 200 && rs.json.ok && rs.json.leftMs === 300000 && /^[0-9a-f]{32}$/.test(String(PAGE)))) red.push('the right one (and its page secret) ' + rs.status);
  const facts = await t.hit('/api/vault/contents', { method: 'GET', headers: t.page(t.cookieA, { 'x-vault-page': String(PAGE) }) });
  if (!(facts.json.reveal && facts.json.reveal.open)) red.push('the list does not see this page\'s window');
  const tab2 = await t.hit('/api/vault/reveal', { body: { id: ID('a') } });
  if (!(tab2.status === 403 && tab2.json.code === 'reveal_needs_password') || plantsIn(tab2.raw)) red.push('THE SAME SIGN-IN WITHOUT THE PAGE SECRET (a second tab) got ' + tab2.status);
  const other = await t.hit('/api/vault/reveal', { headers: t.page(t.cookieB), body: { id: ID('a'), page: PAGE } });
  if (!(other.status === 403 && other.json.code === 'reveal_needs_password')) red.push('another sign-in shared the window (with the page secret)');
  // ③ one value per answer
  for (const k of Object.keys(PLANT)) {
    const r = await t.hit('/api/vault/reveal', { body: { id: ID(k), page: PAGE } });
    if (!(r.status === 200 && r.json.value === PLANT[k])) red.push(`reveal ${k} ${r.status}`);
    if (plantsIn(r.raw) !== 1) red.push(`ONE VALUE: the answer for ${k} holds ${plantsIn(r.raw)} planted values`);
  }
  // ⑤ the credential roads inside / outside the window
  const keyNo = await t.hit('/api/accounts/e-a/key', { method: 'GET' });
  if (!(keyNo.status === 403 && keyNo.json.code === 'reveal_needs_password') || plantsIn(keyNo.raw)) red.push('GET /api/accounts/:id/key without the window ⇒ ' + keyNo.status);
  const keyAgent = await t.hit('/api/accounts/e-a/key', { method: 'GET', headers: t.page(t.cookieA, { 'x-vault-page': String(PAGE), authorization: 'Bearer ' + t.SESSION_TOKEN }) });
  if (!(keyAgent.status === 403 && keyAgent.json.code === 'human_only') || plantsIn(keyAgent.raw)) red.push('GET /api/accounts/:id/key with an agent token ⇒ ' + keyAgent.status);
  const keyYes = await t.hit('/api/accounts/e-a/key', { method: 'GET', headers: t.page(t.cookieA, { 'x-vault-page': String(PAGE) }) });
  if (!(keyYes.status === 200 && keyYes.json.key === PLANT.a && plantsIn(keyYes.raw) === 1)) red.push('GET /api/accounts/:id/key inside the window ⇒ ' + keyYes.status + ' ' + keyYes.raw.slice(0, 80));
  // B-ee0a: the page's road is a POST (a plain-http page sends no Origin on a GET) — the same window, the same answer
  const keyPost = await t.hit('/api/accounts/e-a/key', { method: 'POST', headers: t.page(t.cookieA, { 'x-vault-page': String(PAGE) }), body: {} });
  if (!(keyPost.status === 200 && keyPost.json.key === PLANT.a && plantsIn(keyPost.raw) === 1)) red.push('POST /api/accounts/:id/key inside the window ⇒ ' + keyPost.status + ' ' + keyPost.raw.slice(0, 80));
  const mNo = await t.hit('/api/mounts/mnt1/config', { method: 'GET' });
  // lane ui-controls-and-bugs (THE WRITE-ONLY LAW, 主开发's ruling 2026-11-13): a storage secret is HELD — named, never sent — for the owner's cookie too
  if (!(mNo.status === 200 && !('secretKey' in mNo.json) && (mNo.json.held || []).includes('secretKey')) || plantsIn(mNo.raw)) red.push('GET /api/mounts/:id/config without the window ⇒ not held ' + mNo.raw.slice(0, 120));
  const mYes = await t.hit('/api/mounts/mnt1/config', { method: 'GET', headers: t.page(t.cookieA, { 'x-vault-page': String(PAGE) }) });
  if (!(mYes.status === 200 && !('secretKey' in mYes.json) && (mYes.json.held || []).includes('secretKey') && !mYes.json.masked) || plantsIn(mYes.raw)) red.push('GET /api/mounts/:id/config inside the window ⇒ the secret travelled ' + mYes.raw.slice(0, 120));
  const mTab2 = await t.hit('/api/mounts/mnt1/config', { method: 'GET', headers: t.page(t.cookieB, { 'x-vault-page': String(PAGE) }) });
  if (plantsIn(mTab2.raw)) red.push('GET /api/mounts/:id/config from another sign-in carried the secret');
  // the window is fixed: activity (reveals) never extends it
  t.step(4 * 60e3);
  await t.hit('/api/vault/reveal', { body: { id: ID('a'), page: PAGE } });
  t.step(60e3);
  const late = await t.hit('/api/vault/reveal', { body: { id: ID('a'), page: PAGE } });
  if (!(late.status === 403 && late.json.code === 'reveal_needs_password')) red.push('the window outlived 5 minutes (' + late.status + ')');
  // ④ the pace, the lock, reveal-end
  const p2 = (await t.hit('/api/vault/reveal-session', { body: { password: PW } })).json.page;
  t.step(61e3);
  let n = 0, paced = null;
  for (let i = 0; i < 25 && !paced; i++) { const r = await t.hit('/api/vault/reveal', { body: { id: ID('b'), page: p2 } }); if (r.status === 200) n++; else if (r.status === 429) paced = r; }
  if (!(n === 20 && paced && paced.json.code === 'paced')) red.push(`the pace: ${n} answered before a 429`);
  await t.hit('/api/vault/lock');
  const lr = await t.hit('/api/vault/reveal', { body: { id: ID('b'), page: p2 } });
  if (!(lr.status === 423 && lr.json.code === 'vault_locked')) red.push('locked ⇒ ' + lr.status);
  await t.hit('/api/vault/unlock', { body: { password: PW } });
  t.step(61e3);
  const after = await t.hit('/api/vault/reveal', { body: { id: ID('b'), page: p2 } });
  if (!(after.status === 403 && after.json.code === 'reveal_needs_password')) red.push('a lock did not end the window (' + after.status + ')');
  const p3 = (await t.hit('/api/vault/reveal-session', { body: { password: PW } })).json.page;
  await t.hit('/api/vault/reveal-end', { body: {} });
  if ((await t.hit('/api/vault/reveal', { body: { id: ID('b'), page: p3 } })).status !== 200) red.push('a reveal-end WITHOUT the page secret ended this page\'s window');
  await t.hit('/api/vault/reveal-end', { body: { page: p3 } });
  const ended = await t.hit('/api/vault/reveal', { body: { id: ID('b'), page: p3 } });
  if (!(ended.status === 403 && ended.json.code === 'reveal_needs_password')) red.push('reveal-end did not end the window');
  // ⑥ the audit; no value anywhere but its one answer
  const audit = fs.readFileSync(path.join(t.dataDir, VE.AUDIT_FILE), 'utf8');
  const rev = audit.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.event === 'vault-reveal');
  if (!(rev.length >= 3 && rev.every((l) => /^[0-9a-f]{12}$/.test(l.who) && l.ip === '127.0.0.1' && ((l.store === 'accounts' && /^e-[abc]$/.test(l.entry) && /^(apiKey|key)$/.test(l.field)) || (l.store === 'mounts' && l.entry === 'mnt1' && l.field === '*'))))) red.push('the audit lines ' + JSON.stringify(rev.slice(0, 2)));
  if (plantsIn(audit) || [PW, 'not it', PAGE, p2, p3].some((p) => p && audit.includes(p))) red.push('THE AUDIT CARRIES A VALUE / A PASSWORD / A PAGE SECRET');
  if (plantsIn(LOGS.join('\n') + t.frames.join('\n'))) red.push('A VALUE IN THE LOG / A BROADCAST');
  const carrying = t.answers.filter((a) => plantsIn(a));
  if (!carrying.every((a) => { try { const j = JSON.parse(a); return (j.ok === true && typeof j.value === 'string' && plantsIn(a) === 1) || (typeof j.key === 'string' && plantsIn(a) === 1) || (j.secretKey === PLANT_MOUNT && plantsIn(a) === 1); } catch { return false; } })) red.push('a value rode an answer that is not its own reveal');
  return red;
}

console.log('① ② ③ ④ ⑤ ⑥ the shipped doors');
{
  const H = await hub('shipped', { persistence: true });
  const red = await judge(H);
  ok(red.length === 0, 'people only (human_only ×4 doors × 3 agent forms, cross_site, 401); the list masked; the window THIS PAGE\'s (a second tab / another sign-in refused), fixed 5 min, ended by a lock and by reveal-end (only with its secret); ONE value per answer; 20 a minute; the account key + the mount config through the window; the audit without a value', red);
  const audit = fs.readFileSync(path.join(H.dataDir, VE.AUDIT_FILE), 'utf8');
  ok(/"event":"vault-reveal-window"/.test(audit) && /"event":"vault-reveal-refused".*"code":"wrong_password"/.test(audit) && /"event":"vault-reveal-paced"/.test(audit), 'the audit also says: the window opened, the refused password, the pace');
  console.log('⑤b the sensitive export');
  const EXP = (body, headers) => H.hit('/api/config/export', { headers: headers || H.page(), body: { sections: ['settings'], passphrase: 'abcd', ...body } });
  const plain = await EXP({});
  ok(plain.status === 200 && !plain.json.sensitive, 'an export without credentials needs no second password (as before)', plain.status);
  const noPw = await EXP({ includeSensitive: ['accounts'] });
  ok(noPw.status === 400 && noPw.json.code === 'password_not_text' && plantsIn(noPw.raw) === 0, 'credentials WITHOUT the second password ⇒ refused (400 password_not_text) — nothing exported', noPw.json);
  const wrongPw = await EXP({ includeSensitive: ['accounts'], secondPassword: 'not it' });
  ok(wrongPw.status === 403 && wrongPw.json.code === 'wrong_password' && plantsIn(wrongPw.raw) === 0, 'a wrong second password ⇒ 403 wrong_password (the unlock\'s pace counts it)', wrongPw.json);
  const agentExp = await EXP({ includeSensitive: ['accounts'], secondPassword: PW }, { ...H.page(), authorization: 'Bearer ' + H.SESSION_TOKEN });
  ok(agentExp.status === 403 && agentExp.json.code === 'human_only', 'an agent token ⇒ 403 human_only (even with the right second password)', agentExp.json);
  const rightPw = await EXP({ includeSensitive: ['accounts'], secondPassword: PW });
  ok(rightPw.status === 200 && rightPw.json.sensitive && JSON.stringify(rightPw.json.sensitive.manifest) === '["accounts"]' && !rightPw.raw.includes(PW), 'the right second password ⇒ the export, its shape unchanged (the manifest + the passphrase cipher)', Object.keys(rightPw.json));
  ok(/"event":"vault-export-sensitive"/.test(fs.readFileSync(path.join(H.dataDir, VE.AUDIT_FILE), 'utf8')), 'audited vault-export-sensitive (who / ip — never a password)');
  await H.hit('/api/vault/lock');
  const lockedExp = await EXP({ includeSensitive: ['accounts'], secondPassword: PW });
  ok(lockedExp.status === 423 && lockedExp.json.code === 'vault_locked', 'a LOCKED vault ⇒ 423 vault_locked', lockedExp.json);
  const info = await H.hit('/api/config/export-info', { method: 'GET' });
  ok(info.json.sensitive && info.json.sensitive.secondPassword === true, 'export-info tells the dialog to ask for the second password', info.json.sensitive);
  H.close();
}

console.log('⑦ a hub with NO sign-in');
{
  const H = await hub('nosignin', { signIn: false });
  const owner = H.page('');
  const rs = await H.hit('/api/vault/reveal-session', { headers: owner, body: { password: PW } });
  ok(rs.status === 200 && /^[0-9a-f]{32}$/.test(String(rs.json.page)), 'the owner\'s page opens its window (its page secret in the answer)', rs.json);
  const proc = { 'sec-fetch-site': 'same-origin' };   // a headerless local process forging the page's one header
  const p1 = await H.hit('/api/vault/reveal', { headers: proc, body: { id: ID('a') } });
  const p2 = await H.hit('/api/vault/reveal', { headers: proc, body: { id: ID('a'), page: crypto.randomBytes(16).toString('hex') } });
  ok(p1.status === 403 && p1.json.code === 'reveal_needs_password' && p2.status === 403 && plantsIn(p1.raw + p2.raw) === 0, 'a headerless local process (no cookie, a forged Sec-Fetch-Site) ⇒ reveal_needs_password — with no secret and with a guessed one', [p1.status, p2.status]);
  const k1 = await H.hit('/api/accounts/e-a/key', { method: 'GET', headers: proc });
  ok(k1.status === 403 && k1.json.code === 'reveal_needs_password' && plantsIn(k1.raw) === 0, '… and the account key route too', k1.json);
  await H.hit('/api/vault/reveal-end', { headers: proc, body: {} });
  const o1 = await H.hit('/api/vault/reveal', { headers: owner, body: { id: ID('a'), page: rs.json.page } });
  ok(o1.status === 200 && o1.json.value === PLANT.a, 'the process\'s reveal-end ended nothing: the owner\'s page still reveals (with its secret)', o1.status);
  H.close();
}

console.log('⑧ MUTANTS — each RED');
{
  const C = fs.readFileSync(path.join(REPO, 'src/server/vault-contents.js'), 'utf8');
  const Rt = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8');
  const A = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8');
  const mutants = [
    ['/reveal answers TWO values', { contentsSrc: C.replace("return { ok: true, id: VI.refOf(ref.store, ref.entry, ref.field), value, leftMs: v.leftMs };", "return { ok: true, id: VI.refOf(ref.store, ref.entry, ref.field), value, leftMs: v.leftMs, next: src.vaultReveal(ref.entry === 'e-a' ? 'e-b' : 'e-a', ref.field) };") }],
    // lane lg-vault-file (U1b): the reveal's window check is followed by the FILE branch now — anchored on its first line
    ['a reveal without the window check', { contentsSrc: C.replace("const v = door(who, page, ip);\n    if (!v.ok) return v;\n    // lane lg-vault-file (B-0830, design q-058 §1 reveal)", "const v = door(who, page, ip);\n    if (!v.ok && v.code !== 'reveal_needs_password') return v;\n    // lane lg-vault-file (B-0830, design q-058 §1 reveal)") }],
    ['a reveal WITHOUT the page secret accepted (the sign-in\'s window)', { contentsSrc: C.replace("return p ? windows.get(keyOf(who, p)) || null : null; };", "return (p && windows.get(keyOf(who, p))) || [...windows.values()].find((w) => w.who === whoOf(who)) || null; };") }],
    ['an agent token let through the contents doors', { routesSrc: Rt.replace("app.post('/api/vault/reveal', person((req) =>", "app.post('/api/vault/reveal', ((fn) => async (req, res) => res.json(await fn(req)))((req) =>") }],
    ['a store row worded from its value', { store: fakeStore((k) => PLANT[k]) }],
    ['the window extended by activity', { contentsSrc: C.replace("if (typeof vault.noteUse === 'function') vault.noteUse(ref.store, { by: 'human', door: 'vault-window' });", "if (typeof vault.noteUse === 'function') vault.noteUse(ref.store, { by: 'human', door: 'vault-window' });\n    { const w = windowOf(who, page); if (w) { w.startedAt = now(); w.until = now() + VI.REVEAL_MS; w.startedMono = mono(); } }") }],
    ['the pace forgotten', { contentsSrc: C.replace('const p = VI.paceVerdict(mine, t);', 'const p = { ok: true };').replace('const c = p.ok ? VI.paceVerdict(all, t, VI.REVEAL_PACE_CEILING) : p;', 'const c = p;') }],
    ['a lock that leaves the window open', { contentsSrc: C.replace("if (!(w.until > t) || w.epoch !== ep || !(m - w.startedMono < VI.REVEAL_MS)) windows.delete(k);", "if (!(w.until > t)) windows.delete(k); else w.epoch = ep;").replace("vault.onLock(() => { windows.clear(); });", "vault.onLock(() => { });") }],   // lane vault-manual-and-lock: + the lock's own close
    // (B-ee0a: the route's door is src/routes/account-tails.js revealKeyDoorOf — the old road put in its place, in this copy)
    ['the account key route without the window (the old road)', { accountsSrc: A.replace("const revealKeyDoor = AT.revealKeyDoorOf({ accounts });", "const revealKeyDoor = (req, res) => res.json({ key: accounts.revealKey(req.params.id) });   // MUTANT: the old road") }],
  ];
  for (const [name, m] of mutants) {
    const applied = (m.contentsSrc ? m.contentsSrc !== C : true) && (m.routesSrc ? m.routesSrc !== Rt : true) && (m.accountsSrc ? m.accountsSrc !== A : true);
    const H = await hub('m-' + name.replace(/\W+/g, '-'), m);
    const red = await judge(H);
    H.close();
    ok(applied && red.length > 0, `RED: ${name} (${applied ? red[0] || 'NOT CAUGHT' : 'the mutant did not apply'})`);
  }
}

console.log('⑳ THE OWNER\'S DOWNLOAD (lane lg-vault-file, B-0830): a FILE is never shown — inside the window it is downloaded, through the engine\'s ONE road');
{
  const d = path.join(ROOT, 'file-download'); fs.mkdirSync(d, { recursive: true });
  const v = VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log, idleTimer: false, register: false });
  await v.setup(PW);
  const VCm = require(path.join(REPO, 'src/server/vault-contents.js'));
  const c = VCm.create({ vault: v, sources: { secrets: () => VCm.secretSource({ vault: v }) } });
  const BYTES = Buffer.concat([Buffer.from([0, 255, 0]), crypto.randomBytes(300)]);
  ok((await v.filePut('keyfile:0a1b2c3d4e', BYTES, { filename: 'licence.lic', prov: 'uploaded', label: 'Licence' })).ok && (await v.agentFilePut('agent:conv-1/deploy-key', BYTES, { filename: 'id_ed25519', actor: 'Lane X' })).ok, 'two files: the owner\'s and an agent\'s');
  const id = 'secrets:keyfile:0a1b2c3d4e#file';
  const before = await c.reveal('owner', null, id);
  ok(!before.ok && before.code === 'reveal_needs_password' && !('bytes' in before), 'without the window ⇒ reveal_needs_password, no byte');
  const w = await c.startReveal('owner', PW);
  const got = await c.reveal('owner', w.page, id);   // the U1a cure: a file's download answers a promise (read off the main loop)
  ok(got.ok && typeof got.bytes === 'string' && Buffer.from(got.bytes, 'base64').equals(BYTES) && got.file.name === 'licence.lic' && !('value' in got), 'inside the window ⇒ { file: {name, size, kind}, bytes (base64) } — the file whole, ONCE; never `value`', { code: got.code });
  const ag = await c.reveal('owner', w.page, 'secrets:agent:conv-1/deploy-key#secret');
  ok(ag.ok && Buffer.from(ag.bytes, 'base64').equals(BYTES) && ag.file.name === 'id_ed25519', 'an agent\'s file downloads the same way (the owner\'s door — an agent never reads it back)');
  const audit = fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8');
  ok((audit.match(/"event":"vault-download"/g) || []).length === 2 && !audit.includes(BYTES.toString('base64').slice(0, 24)), 'each download is ONE audit line (vault-download: who, the entry, the size) — no byte');
  v.lock('door');
  const lk = await c.reveal('owner', w.page, id);
  ok(!lk.ok && !('bytes' in lk), 'a lock ends the window: no byte after it', lk.code);
  v.close();
}

console.log('㉑ THE RUN FIT ON THE FILE ROW (主开发 r4378 (a)(b), B-0830 U1b): a file past what a run can carry says so on its row, at once — the run\'s refusal in a person\'s words; a file within it says nothing');
{
  const VFm = require(path.join(REPO, 'src/vault-file.js'));
  const noop = () => {};
  const mkEl = (tag) => { const e = { tagName: String(tag || 'div').toUpperCase(), children: [], listeners: {}, dataset: {}, style: {}, className: '', textContent: '', hidden: false, type: '', title: '', disabled: false,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; }, addEventListener: noop, removeEventListener: noop,
    setAttribute: noop, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [], closest: () => null, focus: noop, remove: noop }; return e; };
  const had = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener };   // never navigator: Node 22's is a getter
  globalThis.window = globalThis; globalThis.addEventListener = globalThis.addEventListener || noop; globalThis.removeEventListener = globalThis.removeEventListener || noop;
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  globalThis.document = { createElement: mkEl, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop, removeEventListener: noop, documentElement: { style: {}, lang: 'en' }, body: mkEl('body'), head: mkEl('head') };
  try {
    const { pathToFileURL } = await import('node:url');
    const FR = await import(pathToFileURL(path.join(REPO, 'src/lib/vault-file-row.js')).href);
    const max = VFm.RUN_FILE_BYTES_MAX;
    const rowOf = (size, lines) => ({ id: 'secrets/keyfile:0123456789/file', file: VFm.publicFactsOf({ name: 'chain.pem', size, lines, kind: 'pem' }) });
    const runLineOf = (row) => { const x = FR.fileExtras(row); return (x.box && x.box.children.find((c) => c.className === 'vw-file-run')) || null; };
    const big = rowOf(max + 4096, 470), small = rowOf(max, 400), noLines = rowOf(max + 1, null);
    const m = runLineOf(big), m0 = runLineOf(small), m2 = runLineOf(noLines);
    ok(big.file.forRun && big.file.forRun.fits === false && small.file.forRun.fits === true, `the hub's facts say it (forRun: ${max + 4096} B does not fit, ${max} B fits)`, [big.file.forRun, small.file.forRun]);
    ok(m && m.dataset.state === 'too-large-for-a-run' && /^Too large for a run \(470 lines, 28 KB\)/.test(m.textContent) && /up to 24 KB in all/.test(m.textContent) && /you can download it/.test(m.textContent) && /an agent can still ask you for it/.test(m.textContent),
      'a file past the figure: its ROW says it at once — its lines, its size, the figure, and what still works (download; an agent\'s ask)', m && m.textContent);
    ok(m0 === null, 'CONTROL: a file AT the figure fits — its row says nothing of it (the mark follows the hub\'s fact, not the kind)', m0 && m0.textContent);
    ok(m2 && /^Too large for a run \(24 KB\)/.test(m2.textContent), 'a file whose lines are not known says its size alone', m2 && m2.textContent);
    const doors = FR.fileExtras(big).doors;
    ok(doors.length === 1 && doors[0].disabled === false && /Download/.test(doors[0].textContent), 'a plain MARK: the row\'s Download stays a live door — nothing is greyed by it (r1423)', doors.map((d) => [d.textContent, d.disabled]));
  } finally {
    for (const [k, v] of Object.entries(had)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
  }
  const FRS = fs.readFileSync(path.join(REPO, 'src/lib/vault-file-row.js'), 'utf8');
  ok(/onPick: \(p\) => \{ picked = p; sayRunFit\(p\);/.test(FRS) && /const over = !!p && p\.size > RUN_FILE_BYTES_MAX;/.test(FRS) && /body\.append\(help, field\(t\('File'\), pick\.el\), runNote, /.test(FRS),
    'the upload door says it at the PICK (sayRunFit on every pick and clear, the note under the file box) — the save stays a save');
  const ZH = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), JA = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const words = ['Too large for a run ({lines} lines, {size})', 'Too large for a run ({size})', 'Larger than a run can carry ({max} in all)'];
  ok(words.every((w) => ZH.includes(JSON.stringify(w).slice(0, -1)) && JA.includes(JSON.stringify(w).slice(0, -1))), 'its words in zh and ja beside the English (the row\'s two forms and the door\'s note)');
}

console.log('㉒ THE FILE ROW\'s SMALLS (主开发 r5043): the download is an octet-stream SAVE through a download link, a name with markup is drawn as text, a read error clears the pick — each with its red copy');
{
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const JDIR = scratch('vault-contents-row'); fs.mkdirSync(JDIR, { recursive: true });
  const STUBS = {
    './i18n.js': 'export const t = (s, p) => (p ? String(s).replace(/\\{(\\w+)\\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : s);',
    './utils.js': 'const P = () => globalThis.__vfr; export const createModalShell = (o) => (P() && P().shell ? P().shell(o) : { dialog: null, body: null, close() {}, raised: true }); export const fetchJson = async (u, o) => (P() && P().fetch ? P().fetch(u, o) : { ok: false }); export const showToast = (m, o) => P().toast(String(m), o); export const showConfirmDialog = async (o) => (P() && P().confirm ? P().confirm(o) : false);',
    './vault-reveal.js': 'const P = () => globalThis.__vfr; export const revealValue = (id) => P().reveal(id); export const revealWords = () => "refused"; export const revealLeftMs = () => (P() && P().leftMs ? P().leftMs() : 0); export const revealHeaders = () => (P() && P().headers ? P().headers() : {}); export const askRevealPassword = async () => (P() && P().askPw ? P().askPw() : false); export const noteRevealLeft = () => {}; export const forgetReveal = () => {};',
    './page-time.js': 'export const stampAt = (ms) => "at " + ms;',
    './vault-paste-box.js': 'export const wordsRefusalWords = () => "";',
  };
  const SRC = fs.readFileSync(path.join(REPO, 'src/lib/vault-file-row.js'), 'utf8');
  let nb = 0;
  const rowOf = async (src) => {   // the module bundled from TEXT (its imports stubbed; ../vault-file.js the real one), with its two inner functions exported for the legs only
    const out = await esbuild.build({ stdin: { contents: src + '\nexport { downloadFile, filePickEl, showFileReplaceDialog };\n', resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'vault-file-row.js', loader: 'js' }, bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
      plugins: [{ name: 'vfr', setup(b) { b.onResolve({ filter: /^\.\/(i18n|utils|vault-reveal|vault-paste-box|page-time)\.js$/ }, (a) => ({ path: a.path, namespace: 'vfr' })); b.onLoad({ filter: /.*/, namespace: 'vfr' }, (a) => ({ contents: STUBS[a.path], loader: 'js' })); } }] });
    const f = path.join(JDIR, `row-${++nb}.cjs`); fs.writeFileSync(f, out.outputFiles[0].text); return require(f);
  };
  const cut = (src, from, to, what) => { if (src.split(from).length !== 2) throw new Error(`the anchor of the control «${what}» is not in the source once`); return src.replace(from, to); };
  // a small DOM that RECORDS: every innerHTML write, every element's text, the anchors clicked, the Blobs made
  const noop = () => {};
  const made = [], html = [], clicks = [], blobs = [];
  const mkEl = (tag) => { const e = { tagName: String(tag || 'div').toUpperCase(), children: [], dataset: {}, style: {}, className: '', textContent: '', hidden: false, type: '', title: '', disabled: false, value: '', href: '', download: undefined, target: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; }, addEventListener: noop, removeEventListener: noop,
    setAttribute: noop, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [], closest: () => null, focus: noop, remove: noop, click() { clicks.push({ tag: this.tagName, href: this.href, download: this.download, target: this.target }); if (typeof this.onclick === 'function') this.onclick(); } };
    Object.defineProperty(e, 'innerHTML', { set(v) { html.push(String(v)); }, get() { return ''; } }); made.push(e); return e; };
  const had = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, FileReader: globalThis.FileReader, addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener, __vfr: globalThis.__vfr };
  const keepURL = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  globalThis.window = globalThis; globalThis.addEventListener = noop; globalThis.removeEventListener = noop;
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  globalThis.document = { createElement: mkEl, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop, removeEventListener: noop, documentElement: { style: {}, lang: 'en' }, body: mkEl('body'), head: mkEl('head') };
  URL.createObjectURL = (b) => { blobs.push(b); return 'blob:vfr-' + blobs.length; }; URL.revokeObjectURL = noop;
  const toasts = [];
  try {
    const MARK = '<img src=x onerror=alert(1)>.pem', BYTES = Buffer.from('-----BEGIN CERTIFICATE-----\nMIIB' + crypto.randomBytes(24).toString('base64') + '\n-----END CERTIFICATE-----\n');
    globalThis.__vfr = { toast: (m) => toasts.push(m), reveal: async () => ({ ok: true, bytes: BYTES.toString('base64'), file: { name: MARK } }) };
    const row = { id: 'secrets/keyfile:0a0b0c0d0e/file', file: { name: MARK, size: BYTES.length, kind: 'pem', lines: 3, forRun: { fits: true, size: BYTES.length, lines: 3, max: 24576 } } };
    const pressDownload = async (M) => { made.length = 0; html.length = 0; clicks.length = 0; blobs.length = 0; toasts.length = 0; await M.downloadFile(row, null); const b = blobs[0]; const text = made.map((e) => e.textContent).join('\n') + toasts.join('\n'); return { type: b && b.type, size: b && b.size, click: clicks[0] || null, html: html.length, toasts: toasts.slice(), bytesShown: text.includes(BYTES.toString().slice(30, 50)) || text.includes(BYTES.toString('base64').slice(10, 40)) }; };
    const REAL = await rowOf(SRC);
    const d0 = await pressDownload(REAL);
    ok(d0.type === 'application/octet-stream' && d0.size === BYTES.length && d0.click && d0.click.tag === 'A' && d0.click.download === MARK && /^blob:/.test(d0.click.href) && !d0.bytesShown,
      '(b) Download SAVES the bytes: a Blob of type application/octet-stream behind a link WITH the download attribute (the file\'s name), pressed once — no byte in any element\'s text or toast', d0);
    const asHtml = await pressDownload(await rowOf(cut(SRC, "new Blob([bytes], { type: 'application/octet-stream' })", "new Blob([bytes], { type: 'text/html' })", 'the file\'s own type')));
    ok(asHtml.type !== 'application/octet-stream', `red control: «the Blob typed text/html» is RED (type ${asHtml.type})`, asHtml);
    const noAttr = await pressDownload(await rowOf(cut(SRC, "a.href = url; a.download = (r.file && r.file.name) || (row.file && row.file.name) || 'file'; a.hidden = true;", "a.href = url; a.target = '_blank'; a.hidden = true;", 'the link without the download attribute')));
    ok(!(noAttr.click && noAttr.click.download), 'red control: «the blob opened without the download attribute» is RED (the link would show it in a tab)', noAttr.click);
    // (c) a name with markup lands as TEXT on the row (and in the download's link and toast above); red: a copy that draws it as HTML
    const drawRow = (M) => { made.length = 0; html.length = 0; const x = M.fileExtras(row); const name = x.box && x.box.children.find((c) => c.className === 'vw-file-name'); return { text: name && name.textContent, html: html.slice() }; };
    const r0 = drawRow(REAL);
    ok(r0.text === MARK && r0.html.length === 0 && d0.html === 0 && d0.toasts.join(' ').includes(MARK), '(c) a file name holding markup is drawn as TEXT on its row, in the download link and its toast — nothing is written as HTML', r0);
    const asMarkup = drawRow(await rowOf(cut(SRC, "box.append(mk('span', 'vw-file-name', f.name), ", "box.append(Object.assign(mk('span', 'vw-file-name'), { innerHTML: f.name }), ", 'the name drawn as HTML')));
    ok(asMarkup.html.includes(MARK), 'red control: «the name drawn as HTML» is RED (the markup reached innerHTML)', asMarkup);
    // (d) a READ ERROR of the picked file clears the pick and its label (as the too-large branch does); red: the old branch
    const readError = async (M) => {
      globalThis.FileReader = class { readAsArrayBuffer() { setTimeout(() => this.onerror && this.onerror(new Error('a read error')), 0); } };
      const picks = [], errs = []; const box = M.filePickEl({ onPick: (p) => picks.push(p), onError: (w) => errs.push(w) });
      const label = box.el.children.find((c) => c.className === 'vault-file-picked'); label.textContent = 'old.pem · 3 KB';   // a pick before it
      const input = box.el.children.find((c) => c.className === 'vault-file-input'); input.files = [{ name: 'new.pem', size: 64 }]; input.onchange();
      for (let n = 0; n < 200 && !errs.some(Boolean); n++) await new Promise((r) => setTimeout(r, 5));
      return { lastPick: picks.length ? picks[picks.length - 1] : 'none', label: label.textContent, err: errs.filter(Boolean).pop() || null };
    };
    const e0 = await readError(REAL);
    ok(e0.lastPick === null && e0.label === 'or drop it here' && /could not be read/.test(e0.err || ''), '(d) a read error clears the pick (onPick(null)) and its label, and says it — no old file is left to save', e0);
    const e1 = await readError(await rowOf(cut(SRC, "rd.onerror = () => { onPick(null); label.textContent = t('or drop it here'); onError(t('That file could not be read')); };", "rd.onerror = () => onError(t('That file could not be read'));", 'the old read-error branch')));
    ok(e1.lastPick !== null || e1.label !== 'or drop it here', 'red control: «the old read-error branch» keeps the old pick\'s label (a save would send the earlier file)', e1);
    // 主开发 r5048 — «Replace file…»: the OWNER's file row carries the door; its dialog passes the entry's name as TEXT (the shell draws its
    // title as a text node: utils buildShell `h3.textContent = title`), writes no HTML, says the ONE sentence about runs and agents, and
    // the press posts the picked file to the entry's own replace route; red: a copy that writes the name into the dialog as HTML
    const replaceLeg = async (M) => {
      const ownerRow = { id: 'secrets/keyfile:0a0b0c0d0e/file', store: 'secrets', entry: 'keyfile:0a0b0c0d0e', label: MARK, file: row.file };
      made.length = 0; html.length = 0;
      const doors = M.fileExtras(ownerRow).doors, rp = doors.find((d) => /^Replace file/.test(d.textContent));
      const noDoor = M.fileExtras({ ...ownerRow, store: 'secrets', entry: 'agent:conv-1/key' }).doors.length;
      let opts = null, parts = null; const posts = [];
      globalThis.__vfr.shell = (o) => { opts = o; parts = { dialog: mkEl('div'), body: mkEl('div') }; return { ...parts, close: noop, raised: false }; };
      globalThis.__vfr.fetch = async (u, o) => { posts.push({ u, body: JSON.parse(o.body) }); return { ok: true }; };
      globalThis.FileReader = class { readAsArrayBuffer(f) { this.result = new Uint8Array(f.bytes).buffer; setTimeout(() => this.onload && this.onload(), 0); } };
      if (rp) rp.onclick();
      const help = parts && parts.body.children[0], box = parts && parts.body.children[1];
      const input = box && box.children.find((c) => c.className === 'vault-file-input');
      const NB = Buffer.from('-----BEGIN CERTIFICATE-----\nMIIC' + crypto.randomBytes(20).toString('base64') + '\n-----END CERTIFICATE-----\n');
      if (input) { input.files = [{ name: 'chain-2027.pem', size: NB.length, bytes: NB }]; input.onchange(); await new Promise((r) => setTimeout(r, 20)); }
      const save = parts && parts.dialog.children[0] && parts.dialog.children[0].children[1];
      if (save) await save.onclick();
      delete globalThis.__vfr.shell; delete globalThis.__vfr.fetch;
      return { door: !!rp, noDoor, title: opts && opts.title, html: html.slice(), help: help && help.textContent, post: posts[0] || null, nb: NB };
    };
    const rl = await replaceLeg(REAL);
    ok(rl.door && rl.noDoor === 1 && rl.title === `Replace «${MARK}»` && rl.html.length === 0
      && rl.help === 'Runs and agents that may use this file get the new file from their next run on; its name, its description and who may use it stay as they are.'
      && rl.post && rl.post.u === '/api/vault/files/0a0b0c0d0e/replace' && rl.post.body.filename === 'chain-2027.pem' && rl.post.body.size === rl.nb.length && Buffer.from(rl.post.body.bytes, 'base64').equals(rl.nb),
      '«Replace file…» (r5048): on the OWNER\'s file row only; its dialog takes the name with markup as TEXT (no HTML written), says the one sentence, and posts the picked file to the entry\'s own replace route', { door: rl.door, noDoor: rl.noDoor, title: rl.title, html: rl.html, post: rl.post && rl.post.u });
    const rlHtml = await replaceLeg(await rowOf(cut(SRC, "  if (raised) return null;\n  const err = mk('div', 'vault-secret-error'); err.setAttribute('role', 'status');\n  const runNote = mk('div', 'vault-file-run-note'); runNote.setAttribute('role', 'status'); runNote.hidden = true;\n  const sayFit",
      "  if (raised) return null;\n  dialog.innerHTML = name;\n  const err = mk('div', 'vault-secret-error'); err.setAttribute('role', 'status');\n  const runNote = mk('div', 'vault-file-run-note'); runNote.setAttribute('role', 'status'); runNote.hidden = true;\n  const sayFit", 'the replace dialog writing the name as HTML')));
    ok(rlHtml.html.includes(MARK), 'red control: «the replace dialog writes the name as HTML» is RED', rlHtml.html);
    ok(/h3\.textContent = title;/.test(fs.readFileSync(path.join(REPO, 'src/lib/utils.js'), 'utf8')), 'the shell draws a dialog\'s title as TEXT (utils buildShell: h3.textContent = title) — the name the replace dialog hands it is never HTML');
    // U1c (主开发 r4774 B): «Remove them…» — 验证是你 FIRST when the page has no window, then a confirm that lists sizes and dates
    // ONLY and says once that it cannot be undone, then ONE POST with the page's window; nothing is sent when either is refused
    {
      const kept = { count: 2, files: [{ size: 30, at: 1700000000000 }, { size: 2048, at: 1700000100000 }] };
      const seen = { askPw: 0, confirm: null, posts: [], refreshed: 0 };
      globalThis.__vfr = { toast: (m) => toasts.push(m), leftMs: () => 0, askPw: async () => { seen.askPw++; return false; }, confirm: async (o) => { seen.confirm = o; return true; }, headers: () => ({ 'X-Vault-Page': 'pg' }), fetch: async (u, o) => { seen.posts.push({ u, o }); return { ok: true, removed: 2, left: 0, leftMs: 1000 }; } };
      const r0 = await REAL.removeKeptFiles(kept, { refresh: () => seen.refreshed++ });
      ok(r0 === false && seen.askPw === 1 && seen.confirm === null && seen.posts.length === 0, 'U1c: «Remove them…» asks 验证是你 FIRST when the page has no window — refused, nothing confirmed, nothing sent', seen);
      globalThis.__vfr.askPw = async () => { seen.askPw++; return true; };
      const r1 = await REAL.removeKeptFiles(kept, { refresh: () => seen.refreshed++ });
      const items = (seen.confirm && seen.confirm.items) || [];
      ok(r1 === true && items.length === 2 && items.every((x) => /bytes|KB/.test(x) && /at 17/.test(x)) && /cannot be undone/.test((seen.confirm && seen.confirm.message) || '') && seen.posts.length === 1 && seen.posts[0].u === '/api/vault/files/kept/remove' && seen.posts[0].o.headers['X-Vault-Page'] === 'pg' && seen.refreshed === 1,
        'U1c: then a confirm that lists each file\'s size and date ONLY and says once that removal cannot be undone; ONE POST with the page\'s window; the window refreshed', { items, message: seen.confirm && seen.confirm.message, posts: seen.posts.map((p) => p.u) });
      ok(REAL.keptLineWords(2).startsWith('2 sealed files are kept') && /Put the right vault record back to open them, or remove them\.$/.test(REAL.keptLineWords(2)) && /open it, or remove it\.$/.test(REAL.keptLineWords(1)),
        'U1c: the line names the gentler road FIRST — «Put the right vault record back to open them, or remove them»', REAL.keptLineWords(2));
    }
  } finally {
    for (const [k, v] of Object.entries(had)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
    URL.createObjectURL = keepURL.create; URL.revokeObjectURL = keepURL.revoke;
  }
  // (a) the Download door's words say the reveal's own rule; (e) a file's row says its kind once (the window's kind word is not added)
  const FRS = fs.readFileSync(path.join(REPO, 'src/lib/vault-file-row.js'), 'utf8'), VWS = fs.readFileSync(path.join(REPO, 'src/lib/vault-window.js'), 'utf8');
  ok(FRS.includes("asks for the second password unless this page verified it in the last 5 minutes") && /if \(!row\.file\) meta\.push\(kindWord\(row\.kind\)\);/.test(VWS),
    '(a) the Download door says it asks for the second password unless this page verified it in the last 5 minutes; (e) a file row\'s kind is said once, on its file line');
}

console.log('㉓ THE KEPT FILES\' DOOR (lane lg-vault-file, B-0830 U1c, 主开发 r4774 B): the list says them — a count, sizes, dates, never an id; the removal only inside the window');
{
  const d = path.join(ROOT, 'file-kept'); fs.mkdirSync(d, { recursive: true });
  const mk = () => VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log, idleTimer: false, register: false });
  const v0 = mk(); await v0.setup(PW); await v0.filesSettled(); v0.close();
  fs.mkdirSync(path.join(d, 'vault-files'), { recursive: true });
  const planted = path.join(d, 'vault-files', '00000000c1.vfile'); fs.writeFileSync(planted, Buffer.alloc(40, 3));   // a sealed file the record does not name
  const v = mk(); await v.unlock(PW); await v.filesSettled();
  const VCm = require(path.join(REPO, 'src/server/vault-contents.js'));
  const c = VCm.create({ vault: v, sources: { secrets: () => VCm.secretSource({ vault: v }) } });
  const l = c.list();
  ok(l.kept && l.kept.count === 1 && l.kept.files.length === 1 && l.kept.files[0].size === 40 && l.kept.files[0].at > 0 && !JSON.stringify(l).includes('00000000c1'),
    'the contents list carries the kept files\' line — the count, the size, the date; never the id', l.kept);
  const no = await c.removeKept('owner', null);
  ok(!no.ok && no.code === 'reveal_needs_password' && fs.existsSync(planted), 'the removal WITHOUT the window (验证是你) ⇒ reveal_needs_password — the file stays', no);
  const w = await c.startReveal('owner', PW);
  const yes = await c.removeKept('owner', w.page);
  ok(yes.ok && yes.removed === 1 && yes.left === 0 && !fs.existsSync(planted) && !('kept' in c.list()), 'inside the window ⇒ the hub removes it and the line goes (the list carries no kept facts)', yes);
  v.close();
}

console.warn = warn0;
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
