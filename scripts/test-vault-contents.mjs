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
const MOUNT_ROUTE = (() => { const i = WIRING.indexOf("app.get('/api/mounts/:id/config', "); const j = WIRING.indexOf('\n});', i); return i > 0 && j > i ? WIRING.slice(i, j + 4) : null; })();
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
  new Function('app', 'mounts', 'refuseAgentBearer', MOUNT_ROUTE)(app, mounts, refuseAgentBearer);
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
  const mNo = await t.hit('/api/mounts/mnt1/config', { method: 'GET' });
  if (!(mNo.status === 200 && mNo.json.secretKey === '••••••••' && (mNo.json.masked || []).includes('secretKey')) || plantsIn(mNo.raw)) red.push('GET /api/mounts/:id/config without the window ⇒ not masked ' + mNo.raw.slice(0, 120));
  const mYes = await t.hit('/api/mounts/mnt1/config', { method: 'GET', headers: t.page(t.cookieA, { 'x-vault-page': String(PAGE) }) });
  if (!(mYes.status === 200 && mYes.json.secretKey === PLANT_MOUNT && !mYes.json.masked)) red.push('GET /api/mounts/:id/config inside the window ⇒ ' + mYes.raw.slice(0, 120));
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
    ['a reveal without the window check', { contentsSrc: C.replace("const v = door(who, page, ip);\n    if (!v.ok) return v;\n    const src", "const v = door(who, page, ip);\n    if (!v.ok && v.code !== 'reveal_needs_password') return v;\n    const src") }],
    ['a reveal WITHOUT the page secret accepted (the sign-in\'s window)', { contentsSrc: C.replace("return p ? windows.get(keyOf(who, p)) || null : null; };", "return (p && windows.get(keyOf(who, p))) || [...windows.values()].find((w) => w.who === whoOf(who)) || null; };") }],
    ['an agent token let through the contents doors', { routesSrc: Rt.replace("app.post('/api/vault/reveal', person((req) =>", "app.post('/api/vault/reveal', ((fn) => async (req, res) => res.json(await fn(req)))((req) =>") }],
    ['a store row worded from its value', { store: fakeStore((k) => PLANT[k]) }],
    ['the window extended by activity', { contentsSrc: C.replace("if (typeof vault.noteUse === 'function') vault.noteUse(ref.store, 'human');", "if (typeof vault.noteUse === 'function') vault.noteUse(ref.store, 'human');\n    { const w = windowOf(who, page); if (w) { w.startedAt = now(); w.until = now() + VI.REVEAL_MS; w.startedMono = mono(); } }") }],
    ['the pace forgotten', { contentsSrc: C.replace('const p = VI.paceVerdict(mine, t);', 'const p = { ok: true };').replace('const c = p.ok ? VI.paceVerdict(all, t, VI.REVEAL_PACE_CEILING) : p;', 'const c = p;') }],
    ['a lock that leaves the window open', { contentsSrc: C.replace("if (!(w.until > t) || w.epoch !== ep || !(m - w.startedMono < VI.REVEAL_MS)) windows.delete(k);", "if (!(w.until > t)) windows.delete(k); else w.epoch = ep;") }],
    ['the account key route without the window (the old road)', { accountsSrc: A.replace("if (gate && gate.state() !== 'not_set_up') {\n    const r = gate.reveal(req, `accounts:${req.params.id}#key`);", "if (false) {\n    const r = gate.reveal(req, `accounts:${req.params.id}#key`);") }],
  ];
  for (const [name, m] of mutants) {
    const applied = (m.contentsSrc ? m.contentsSrc !== C : true) && (m.routesSrc ? m.routesSrc !== Rt : true) && (m.accountsSrc ? m.accountsSrc !== A : true);
    const H = await hub('m-' + name.replace(/\W+/g, '-'), m);
    const red = await judge(H);
    H.close();
    ok(applied && red.length > 0, `RED: ${name} (${applied ? red[0] || 'NOT CAUGHT' : 'the mutant did not apply'})`);
  }
}

console.warn = warn0;
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
