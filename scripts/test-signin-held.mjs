#!/usr/bin/env node
// A SIGN-IN FILE THAT CANNOT BE READ HOLDS THE INSTANCE CLOSED (B-dc3f, HIGH — 主开发 r1123; its round, r1148). The real
// src/auth.js over express in server.js's mount order (the gate FIRST), on a scratch data dir — never a real sign-in file:
//   ① EACH SHAPE THAT CANNOT BE READ IS HELD: a file whose text does not parse, a ZERO-BYTE file, one that holds no table
//     (`null`, an array, a number, a JSON string), a password record that is not text, logins that are not a table, one
//     that cannot be opened (a link loop; a mode-000 file when not root), a FOLDER in its place, a link to nothing. Each:
//     every API, page and door is refused 503 by name (the words, the way out); THE SIGN-IN PAGE ANSWERS AS A PAGE (200, the
//     held words — a health check's start, ready and alive probes ask it: GET with any accept, HEAD; ja when asked);
//     `enabled` / `passwordEnabled` answer «on», no login is valid, requestAuthed (every upgrade that asks) is false, the
//     journal says it ONCE at the start — and NOTHING is written: the path and the data dir are as they were after the
//     env password, a generated one, a set / remove / import / token road and a vault lock's revoke all ran.
//     RED CONTROL: the tip's page (refused 503 like every other) ⇒ a health check never sees the instance alive.
//   ② A FILE THAT IS TRULY MISSING stays a new instance (open, as before), and a readable one is today's.
//   ③ THE HOLD CLOSES WHAT THE FILE GUARDS (r1148 1): held with single sign-on on, a stand-in for the outside service — SSO
//     still signs a person in (the login in MEMORY only), the sign-in page says it is held (no password form), the local
//     password road is refused by name, a vault lock still signs everyone out, NOTHING is written. RED CONTROL: the tip's
//     hold (every request refused) ⇒ the SSO sign-in refused, every person of such an instance locked out.
//   ④ THE REAL UPGRADE ROAD (r1148 2): server.js's own dispatcher (its text, up to the dial-in) over the real Auth, a real
//     `ws` server and the real path mounts: while held every upgrade is refused 503 — /ws, and a PUBLIC /svc mount's socket,
//     as its plain requests are; a paired machine's dial-in keeps its own rule (its own dial token). RED CONTROL: the
//     dispatcher's held line cut ⇒ the public mount's socket is served by a held instance.
//   ⑤ THE WRITER CANNOT TEAR IT (r1148 4): src/secret-file.js replaceShredding, recorded over a stand-in of node's fs — the
//     temp file's bytes are SYNCED before the rename points the name at them, the folder synced after. RED CONTROL: the
//     release's order (write, then rename, no sync) ⇒ the rename comes with no sync before it.
//   RED CONTROL of ①: the release's reading (an unreadable file taken as «no sign-in») — the page is served with no
//   sign-in, and a generated password is then written over the file.
// in-process; a scratch dir under os.tmpdir().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const express = require('express');
const { WebSocket, WebSocketServer } = require('ws');
const { ok: check, report } = checker();
// the ONE assertion helper (scripts/lib/check.mjs); here every condition is read as a boolean, and a swap throws
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(condition, name): the name comes second, a string'); return check(!!c, n, extra === undefined ? undefined : JSON.stringify(extra).slice(0, 900)); };
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-signin-held-'));
process.on('exit', () => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
/** `rel` compiled with ONE piece swapped — the needle must occur exactly once, or the control is void (it throws) */
function mutant(rel, needle, into) { const src = read(rel); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once in ${rel}: ${needle.slice(0, 80)}`); return compileAt(rel, src.replace(needle, into)); }
const AUTH = require(path.join(REPO, 'src/auth.js'));
const LW = require(path.join(REPO, 'src/login-words.js'));
const PM = require(path.join(REPO, 'src/server/path-mounts.js'));

/** what stands at a path and in its folder — compared before and after, so «nothing is written» is a fact */
function stateOf(dataDir) {
  const p = path.join(dataDir, 'auth.json');
  let at = null;
  try {
    const st = fs.lstatSync(p);
    at = { kind: st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : 'file', ino: st.ino, size: st.size, mtime: st.mtimeMs, mode: st.mode };
    if (at.kind === 'link') at.to = fs.readlinkSync(p);
    else if (at.kind === 'dir') at.list = fs.readdirSync(p);
    else { try { at.sha = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (e) { at.sha = `unreadable ${e.code}`; } }
  } catch (e) { at = { kind: 'none', code: e.code }; }
  return JSON.stringify({ at, dir: fs.readdirSync(dataDir).sort() });
}
/** a stand-in for the outside sign-in service (src/clerk-auth.js's shape): any token is a person of this instance */
const clerkStandIn = () => ({ enabled: true, frontendApi: 'sso.example', emailAllowed: () => true, verifyToken: async (t) => ({ email: t ? 'person@example.test' : '' }) });
/** one instance over `make(dataDir)` — the journal captured while the gate reads its file */
let seq = 0;
async function instance(make, Auth = AUTH.Auth, { clerk = null } = {}) {
  const dataDir = path.join(DIR, `d${++seq}`); fs.mkdirSync(dataDir);
  make(dataDir);
  const journal = []; const err = console.error, warn = console.warn;
  console.error = (...a) => journal.push(a.join(' ')); console.warn = (...a) => journal.push(a.join(' '));
  let auth; try { auth = new Auth(dataDir, { clerk }); } finally { console.error = err; console.warn = warn; }
  const app = express();
  app.use(auth.middleware()); auth.registerRoutes(app);
  app.all(/.*/, (req, res) => res.json({ reached: true, path: req.path }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  return { auth, dataDir, journal, port: srv.address().port, close: () => new Promise((r) => srv.close(r)) };
}
const hit = (I, p, { method = 'GET', headers = {}, body = null } = {}) => new Promise((resolve) => {
  const h = { host: `hub.example:${I.port}`, ...headers }; if (body !== null) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(body); }
  const q = http.request({ host: '127.0.0.1', port: I.port, path: p, method, headers: h }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { } resolve({ status: res.statusCode, json: j, text: b, headers: res.headers }); }); });
  q.on('error', () => resolve({ status: 0 })); q.end(body === null ? undefined : body);
});
/** every road that could write the file, run while held — each refused or a no-op, never a write */
function everyWriteRoad(auth) {
  const out = {};
  const env = process.env.VIBESPACE_PASSWORD;
  process.env.VIBESPACE_PASSWORD = 'pw-from-env-' + crypto.randomBytes(4).toString('hex');
  try { out.env = JSON.stringify(auth.ensurePassword({})); } finally { if (env === undefined) delete process.env.VIBESPACE_PASSWORD; else process.env.VIBESPACE_PASSWORD = env; }
  out.generated = JSON.stringify(auth.ensurePassword({ generateIfMissing: true }));
  for (const [name, f] of [['set', () => auth.setPassword('pw-held-' + crypto.randomBytes(4).toString('hex'))], ['remove', () => auth.removePassword()], ['import', () => auth.importPasswordRecord({ passwordHash: 'a'.repeat(64), salt: 'b'.repeat(32) })], ['token', () => auth.issueToken('ua')]]) {
    try { f(); out[name] = 'ran'; } catch (e) { out[name] = e && e.code; }
  }
  out.revoked = auth.revokeAllTokens();   // a vault lock's road
  auth.revokeToken('a'.repeat(48));
  return out;
}
const file = (text) => (d) => fs.writeFileSync(path.join(d, 'auth.json'), text, { mode: 0o600 });
const SHAPES = [
  ['a file whose text does not parse', file('{"passwordHash":"0123')],
  ['a ZERO-BYTE file', file('')],
  ['a file that holds no table (null)', file('null')],
  ['a file that holds no table (an array)', file('[]')],
  ['a file that holds no table (a number)', file('5')],
  ['a file that holds no table (a JSON string)', file('"a sign-in table"')],
  ['a password record that is not text', file('{"passwordHash":5,"salt":"ab"}')],
  ['logins that are not a table', file('{"userSet":true,"tokens":5}')],
  ['a file that cannot be opened (a link loop)', (d) => fs.symlinkSync('auth.json', path.join(d, 'auth.json'))],
  ['a FOLDER in its place', (d) => fs.mkdirSync(path.join(d, 'auth.json'))],
  ['a link to a file that is not there', (d) => fs.symlinkSync('gone.json', path.join(d, 'auth.json'))],
];
if (typeof process.getuid === 'function' && process.getuid() !== 0) SHAPES.push(['a file that cannot be opened (mode 000)', (d) => { fs.writeFileSync(path.join(d, 'auth.json'), '{"passwordHash":"x"}'); fs.chmodSync(path.join(d, 'auth.json'), 0o000); }]);
else console.log('    (running as root: a mode-000 file can be read here, so «cannot be opened» is the link loop alone)');
/** the sign-in page as a health check asks it (any accept), as a browser (html, ja) and as HEAD */
async function signInPage(I) {
  const probe = await hit(I, '/login', { headers: { accept: '*/*', 'user-agent': 'kube-probe/1.31' } });
  const ja = await hit(I, '/login', { headers: { accept: 'text/html', 'accept-language': 'ja' } });
  const head = await hit(I, '/login', { method: 'HEAD' });
  return { probe, ja, head, alive: probe.status === 200 && probe.text.includes(LW.LOGIN_WORDS['signin-held'].en) && probe.text.includes(LW.LOGIN_WORDS['signin-held-fix'].en) && ja.status === 200 && ja.text.includes(LW.LOGIN_WORDS['signin-held'].ja) && head.status === 200 };
}

console.log('— ① EACH SHAPE THAT CANNOT BE READ IS HELD: refused by name everywhere but the sign-in page, which answers as a page; nothing written');
for (const [name, make] of SHAPES) {
  const I = await instance(make);
  const before = stateOf(I.dataDir);
  const api = await hit(I, '/api/sessions', { headers: { accept: 'application/json' } });
  const page = await hit(I, '/', { headers: { accept: 'text/html' } });
  const login = await hit(I, '/api/login', { method: 'POST', body: JSON.stringify({ password: 'anything' }), headers: { origin: `http://hub.example:${I.port}` } });
  const door = await hit(I, '/hook/abc', { method: 'POST', body: '{}' });
  const dav = await hit(I, '/dav/x');
  const sp = await signInPage(I);
  const roads = everyWriteRoad(I.auth);
  const after = stateOf(I.dataDir);
  const held = I.auth.held, journal = I.journal.filter((l) => l.includes('THE SIGN-IN FILE IS HELD'));
  const refused = [api, page, login, door, dav];
  console.log(`    ${name}: «${held && held.why}» · refused ${refused.map((r) => r.status).join(' ')} · the sign-in page ${sp.probe.status} / ${sp.ja.status} / HEAD ${sp.head.status} · roads ${JSON.stringify(roads)}`);
  ok(held && refused.every((r) => r.status === 503) && api.json && api.json.error === 'signin-held' && api.json.fix === LW.LOGIN_WORDS['signin-held-fix'].en && page.text.includes(LW.LOGIN_WORDS['signin-held'].en) && door.json && door.json.error === 'signin-held',
    `${name}: every API, page and door refused 503 by name — the API says why and the way out, a page says it`, { api: api.json, page: page.text.slice(0, 200) });
  ok(sp.alive, `${name}: THE SIGN-IN PAGE ANSWERS AS A PAGE — 200 with the held words to a health check (any accept), a browser (ja when asked) and HEAD`, { probe: [sp.probe.status, sp.probe.text.slice(0, 160)], ja: sp.ja.status, head: sp.head.status });
  ok(I.auth.enabled === true && I.auth.passwordEnabled === true && I.auth.shut === true && I.auth.checkToken('a'.repeat(48)) === false && I.auth.requestAuthed({ method: 'GET', headers: { host: 'hub.example' }, socket: {} }) === false && I.auth.verifyPassword('anything') === false && I.auth.exportPasswordRecord() === null,
    `${name}: the held state reaches every reader from ONE place — sign-in reads «on», no login is valid, requestAuthed (every upgrade that asks) is false`);
  ok(journal.length === 1 && journal[0].includes('if it looks whole, restart VibeSpace first'), `${name}: the journal says it once, at the start, leading the way out with «restart first» (${journal.length})`, I.journal);
  ok(before === after && roads.set === 'signin-held' && roads.remove === 'signin-held' && roads.import === 'signin-held' && roads.token === 'signin-held' && roads.revoked === 0, `${name}: NOTHING written — the env password, a generated one, set / remove / import / a token and a vault lock's revoke each refused or a no-op; the path and its folder as they were`, { before, after, roads });
  await I.close();
}
{
  // RED CONTROL: the tip's sign-in page (refused 503 like every request) — a health check never sees the instance alive
  const Tip = mutant('src/auth.js', "        if (this.shut) return refuseHeld(this._held, req, res, { page: (req.method === 'GET' || req.method === 'HEAD') && p === '/login' });", '        if (this.shut) return refuseHeld(this._held, req, res, { page: false });').Auth;
  const I = await instance(SHAPES[0][1], Tip);
  const sp = await signInPage(I);
  ok(!sp.alive && sp.probe.status === 503, `RED CONTROL — the tip's page: the sign-in page refused ${sp.probe.status} to a health check — the pod never ready, restarted for ever`);
  await I.close();
}
{
  const words = ['signin-held-fix', 'signin-held-sso-fix'].map((k) => LW.LOGIN_WORDS[k].en);
  ok(words.every((w) => w.startsWith('If the file looks whole, restart VibeSpace first') && (w.match(/restart/g) || []).length >= 2), 'the way out LEADS with «if the file looks whole, restart first» (a read that failed for a moment must not make a person delete a good table) and says «restart» in both branches', words);
}

console.log('— ② A FILE THAT IS TRULY MISSING stays a new instance; a readable one is today\'s');
{
  const none = await instance(() => { });
  const r = await hit(none, '/api/sessions', { headers: { accept: 'application/json' } });
  ok(!none.auth.held && none.auth.enabled === false && r.status === 200 && r.json && r.json.reached, `nothing at the path: a new instance with no sign-in, as before (${r.status})`, r);
  await none.close();
  const pw = 'pw-' + crypto.randomBytes(4).toString('hex');
  const made = await instance(() => { });
  made.auth.setPassword(pw);
  await made.close();
  const real = new AUTH.Auth(made.dataDir, {});   // the file that setPassword wrote, read again as the next start reads it
  ok(!real.held && real.passwordEnabled && real.verifyPassword(pw), 'a readable sign-in file is read as today (its password verifies, nothing held)');
}

console.log('— ③ THE HOLD CLOSES WHAT THE FILE GUARDS: held with single sign-on on, SSO still guards; nothing written');
async function ssoHeld(Auth = AUTH.Auth) {
  const I = await instance(SHAPES[0][1], Auth, { clerk: clerkStandIn() });
  const before = stateOf(I.dataDir);
  const own = { origin: `http://hub.example:${I.port}` };
  const page = await hit(I, '/login', { headers: { accept: 'text/html' } });
  const sso = await hit(I, '/api/clerk-login', { method: 'POST', body: JSON.stringify({ token: 'sso-session' }), headers: own });
  const cookie = String((sso.headers && sso.headers['set-cookie'] || [])[0] || '').split(';')[0];
  const inside = await hit(I, '/api/sessions', { headers: { accept: 'application/json', cookie } });
  const local = await hit(I, '/api/login', { method: 'POST', body: JSON.stringify({ password: 'anything' }), headers: own });
  const setPw = await hit(I, '/api/auth/set-password', { method: 'POST', body: JSON.stringify({ newPassword: 'pw-new' }), headers: { ...own, cookie } });
  const locked = I.auth.revokeAllTokens();   // a vault lock: every login ends, in memory
  const afterLock = await hit(I, '/api/sessions', { headers: { accept: 'application/json', cookie } });
  const roads = everyWriteRoad(I.auth);
  const after = stateOf(I.dataDir);
  await I.close();
  return { I, page, sso, cookie, inside, local, setPw, roads, locked, afterLock, before, after };
}
{
  const r = await ssoHeld();
  console.log(`    SSO held: the page ${r.page.status} · SSO sign-in ${r.sso.status} · inside ${r.inside.status} · the password road ${r.local.status} / set ${r.setPw.status} · after a lock ${r.afterLock.status} · roads ${JSON.stringify(r.roads)}`);
  ok(r.I.auth.held && r.I.auth.shut === false && r.sso.status === 200 && r.sso.json && r.sso.json.success && /^vs_token=[0-9a-f]+$/.test(r.cookie) && r.inside.status === 200 && r.inside.json && r.inside.json.reached, `held with single sign-on on: SSO still signs a person in (${r.sso.status}) and the login opens the instance (${r.inside.status}) — the hold closes only what the file guards`, { sso: r.sso.json, inside: r.inside.status });
  ok(r.page.status === 200 && r.page.text.includes(LW.LOGIN_WORDS['signin-held-sso'].en) && r.page.text.includes(LW.LOGIN_WORDS['signin-held-sso-fix'].en) && !r.page.text.includes('id="pw"') && r.page.text.includes('id="sso"'), 'the sign-in page says the file is held, offers single sign-on alone (no password form) and the way out', r.page.text.slice(0, 300));
  ok(r.local.status === 503 && r.local.json && r.local.json.error === 'signin-held' && r.local.json.why === LW.LOGIN_WORDS['signin-held-sso'].en && r.setPw.status === 503, `the local password road stays refused by name: the password sign-in ${r.local.status}, setting a password ${r.setPw.status}`, { local: r.local.json, setPw: r.setPw.status });
  ok(r.locked >= 1 && r.afterLock.status === 401, `a vault lock still signs everyone out: ${r.locked} in-memory login(s) revoked, the cookie then refused (${r.afterLock.status})`);
  ok(r.before === r.after && r.roads.token === 'ran' && r.roads.set === 'signin-held' && r.roads.remove === 'signin-held' && r.roads.import === 'signin-held' && r.roads.generated === '{}' && r.roads.env === '{}', 'NOTHING written: the SSO login lived in memory only; the env password, a generated one, set / remove / import refused; the path and its folder as they were', { before: r.before, after: r.after, roads: r.roads });
  const Tip = mutant('src/auth.js', '  get shut() { return !!this._held && !this._clerk?.enabled; }', '  get shut() { return !!this._held; }').Auth;
  const t = await ssoHeld(Tip);
  ok(t.sso.status === 503 && t.inside.status === 503, `RED CONTROL — the tip's hold (every request refused): the SSO sign-in is refused ${t.sso.status} — every person of such an instance locked out`);
}

console.log('— ④ THE REAL UPGRADE ROAD: server.js\'s own dispatcher — while held every upgrade is refused, a public /svc socket too; the dial-in keeps its own rule');
{
  const S = read('server.js');
  const a = S.indexOf("hub.attachToServers('upgrade', (req, socket, head) => {");
  const b = S.indexOf("  } else if (pathname === '/api/device-dial' || pathname === '/api/agentd-dial') {", a);
  if (a < 0 || b < 0) throw new Error('the upgrade dispatcher is not where it was: read it again');
  const body = S.slice(S.indexOf('(req, socket, head) => {', a), b) + '  } else { socket.destroy(); }\n}';
  const HELD_LINE = body.split('\n').filter((l) => l.includes('auth.upgradeHeld(pathname)'));
  // the public service behind a mount: a real ws server that greets
  const svcHttp = http.createServer((q, r) => r.end('svc')); const svcWss = new WebSocketServer({ server: svcHttp }); svcWss.on('connection', (ws) => ws.send('svc-hello'));
  await new Promise((r) => svcHttp.listen(0, '127.0.0.1', r));
  async function road(dispatcherSrc, auth) {
    const wss = new WebSocketServer({ noServer: true }); wss.on('connection', (ws) => ws.send('ws-hello'));
    const pathMounts = PM.create({ getPortForwards: () => ({ pathMountTarget: (n) => (n === 'app' ? { rec: { pathPublic: true }, localPort: svcHttp.address().port } : null) }), requestAuthed: (req) => auth.requestAuthed(req) });
    const reached = [];
    const dispatch = new Function('auth', 'wss', 'unblocker', 'desktopStream', 'browserStream', 'pathMounts', `return ${dispatcherSrc};`)(auth, wss, { onUpgrade: (q, s) => { reached.push('proxy'); s.destroy(); } }, { upgradeId: () => null }, null, pathMounts);
    const srv = http.createServer((q, r) => r.end()); srv.on('upgrade', dispatch);
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const shake = (p) => new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${srv.address().port}${p}`);
      const done = (v) => { try { ws.terminate(); } catch { } resolve(v); };
      ws.on('message', (m) => done(`open: ${m}`)); ws.on('unexpected-response', (q, r) => done(String(r.statusCode))); ws.on('error', (e) => done('error ' + e.message)); setTimeout(() => done('timeout'), 3000);
    });
    const out = { ws: await shake('/ws'), svc: await shake('/svc/app/'), proxy: await shake('/proxy/x'), reached };
    await new Promise((r) => srv.close(r)); wss.close();
    return out;
  }
  const I = await instance(SHAPES[0][1]);
  const held = await road(body, I.auth);
  ok(HELD_LINE.length === 1 && held.ws === '503' && held.svc === '503' && held.proxy === '503' && held.reached.length === 0, `while held, server.js's own dispatcher refuses every upgrade 503 by name: /ws ${held.ws}, a PUBLIC /svc mount's socket ${held.svc} (as its plain requests are), /proxy/ ${held.proxy}`, held);
  ok(I.auth.upgradeHeld('/api/device-dial') === false && I.auth.upgradeHeld('/api/agentd-dial') === false && I.auth.upgradeHeld('/svc/app/') === true, 'a paired machine\'s dial-in keeps its own rule while held (its own dial token): the held state never shuts /api/device-dial nor /api/agentd-dial');
  const open = await road(body.replace(HELD_LINE[0] + '\n', ''), I.auth);
  ok(open.svc === 'open: svc-hello' && open.ws === '401', `RED CONTROL — the dispatcher's held line cut: a held instance serves the public mount's socket («${open.svc}»); /ws still ${open.ws} through requestAuthed`, open);
  await I.close();
  const fresh = await instance(() => { });
  const plain = await road(body, fresh.auth);
  ok(plain.svc === 'open: svc-hello' && plain.ws === 'open: ws-hello', `an instance that is not held is today's: the public mount's socket opens («${plain.svc}»), /ws opens with no sign-in («${plain.ws}»)`, plain);
  await fresh.close();
  svcWss.close(); await new Promise((r) => svcHttp.close(r));
}

console.log('— ⑤ THE WRITER CANNOT TEAR IT: the temp file is synced BEFORE the rename points the name at it');
{
  /** replaceShredding (or a copy) run over a RECORDING stand-in of node's fs: every open / sync / rename, in order */
  function recorded(mod) {
    const steps = [], fds = new Map(), saved = {};
    for (const k of ['openSync', 'fsyncSync', 'renameSync', 'writeFileSync', 'closeSync']) saved[k] = fs[k];
    fs.openSync = (p, ...r) => { const fd = saved.openSync.call(fs, p, ...r); fds.set(fd, String(p)); steps.push(['open', path.basename(String(p))]); return fd; };
    fs.fsyncSync = (fd) => { steps.push(['sync', path.basename(fds.get(fd) || '?')]); return saved.fsyncSync.call(fs, fd); };
    fs.renameSync = (x, y) => { steps.push(['rename', path.basename(String(x)), path.basename(String(y))]); return saved.renameSync.call(fs, x, y); };
    fs.writeFileSync = (p, ...r) => { steps.push(['write', typeof p === 'number' ? path.basename(fds.get(p) || '?') : path.basename(String(p))]); return saved.writeFileSync.call(fs, p, ...r); };
    try { const f = path.join(DIR, `w${++seq}`, 'auth.json'); fs.mkdirSync(path.dirname(f)); saved.writeFileSync.call(fs, f, '{"old":1}', { mode: 0o600 }); mod.replaceShredding(f, '{"new":1}'); steps.final = fs.readFileSync(f, 'utf8'); }
    finally { Object.assign(fs, saved); }
    return steps;
  }
  const isTmp = (n) => /\.tmp-\d+-[0-9a-f]{8}$/.test(n);
  const now = recorded(compileAt('src/secret-file.js', read('src/secret-file.js')));
  const renameAt = now.findIndex((s) => s[0] === 'rename'), syncedTmp = now.findIndex((s) => s[0] === 'sync' && isTmp(s[1])), dirSync = now.findIndex((s, i) => i > renameAt && s[0] === 'sync' && !isTmp(s[1]) && s[1] !== 'auth.json');
  console.log(`    the steps: ${now.map((s) => s.join(' ')).join(' → ')}`);
  ok(renameAt > 0 && syncedTmp >= 0 && syncedTmp < renameAt && isTmp(now[renameAt][1]) && now[renameAt][2] === 'auth.json' && dirSync > renameAt && now.final === '{"new":1}', `the temp file's bytes are synced (step ${syncedTmp + 1}) BEFORE the rename points the name at them (step ${renameAt + 1}), the folder synced after (step ${dirSync + 1})`, now);
  const RELEASE = "    const fd = fs.openSync(tmp, 'wx', 0o600);\n    try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }   // THE BYTES ON DISK FIRST\n";
  const src = read('src/secret-file.js'); if (src.split(RELEASE).length !== 2) throw new Error('CONTROL needle not found exactly once: the synced write');
  const then = recorded(compileAt('src/secret-file.js', src.replace(RELEASE, "    fs.writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' });\n")));   // stale-pins: kept — the release's own write, the red's text
  const r2 = then.findIndex((s) => s[0] === 'rename');
  ok(r2 >= 0 && !then.slice(0, r2).some((s) => s[0] === 'sync'), `RED CONTROL — the release's order (write, then rename): the rename comes with no sync before it (${then.slice(0, r2 + 1).map((s) => s[0]).join(' → ')})`, then);
}

console.log('— RED CONTROL: the release\'s reading (an unreadable file taken as «no sign-in»)');
{
  const CUT = '    this._held = { why };\n';
  const src = read('src/auth.js'); if (src.split(CUT).length !== 2) throw new Error('CONTROL needle not found exactly once: the held mark');
  const Release = compileAt('src/auth.js', src.replace(CUT, '')).Auth;
  const I = await instance(SHAPES[0][1], Release);
  const before = stateOf(I.dataDir);
  const page = await hit(I, '/api/sessions', { headers: { accept: 'application/json' } });
  const openThen = I.auth.enabled === false;   // read BEFORE the write roads: the release's reading lets the env password land
  const roads = everyWriteRoad(I.auth);
  const after = stateOf(I.dataDir);
  ok(page.status === 200 && page.json && page.json.reached && openThen, `RED CONTROL — the release's reading: a torn sign-in file and the page is served with NO sign-in (${page.status})`, page);
  ok(before !== after, 'RED CONTROL — and a generated password is then written OVER the file (the real table lost)', { before, after, roads });
  await I.close();
}

report();
