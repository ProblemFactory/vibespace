#!/usr/bin/env node
// A SIGN-IN FILE THAT CANNOT BE READ HOLDS THE INSTANCE CLOSED (B-dc3f, HIGH — 主开发 r1123). The real src/auth.js over
// express in server.js's mount order (the gate FIRST), on a scratch data dir — never a real sign-in file:
//   ① EACH SHAPE THAT CANNOT BE READ IS HELD: a file whose text does not parse, one that holds no table (`null`), one that
//     cannot be opened (a link loop; a mode-000 file when not root), a FOLDER in its place, a link to nothing. Each:
//     every page, API and door is refused 503 by name (the words, the way out), the sign-in page says it (en, and ja when
//     asked), `enabled` / `passwordEnabled` answer «on», no login is valid, requestAuthed (every upgrade that asks) is
//     false, the journal says it ONCE at the start — and NOTHING is written: the path and the data dir are as they were
//     after the env password, a generated one, a set / remove / import / token road and a vault lock's revoke all ran.
//   ② A FILE THAT IS TRULY MISSING stays a new instance (open, as before), and a readable one is today's.
//   RED CONTROL: the release's reading (an unreadable file taken as «no sign-in») — the page is served with no sign-in,
//   and a generated password is then written over the file.
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
const { ok: check, report } = checker();
// the ONE assertion helper (scripts/lib/check.mjs); here every condition is read as a boolean, and a swap throws
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(condition, name): the name comes second, a string'); return check(!!c, n, extra === undefined ? undefined : JSON.stringify(extra).slice(0, 900)); };
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-signin-held-'));
process.on('exit', () => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
const AUTH = require(path.join(REPO, 'src/auth.js'));
const LW = require(path.join(REPO, 'src/login-words.js'));

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
/** one instance over `make(dataDir)` — the journal captured while the gate reads its file */
let seq = 0;
async function instance(make, Auth = AUTH.Auth) {
  const dataDir = path.join(DIR, `d${++seq}`); fs.mkdirSync(dataDir);
  make(dataDir);
  const journal = []; const err = console.error, warn = console.warn;
  console.error = (...a) => journal.push(a.join(' ')); console.warn = (...a) => journal.push(a.join(' '));
  let auth; try { auth = new Auth(dataDir, {}); } finally { console.error = err; console.warn = warn; }
  const app = express();
  app.use(auth.middleware()); auth.registerRoutes(app);
  app.all(/.*/, (req, res) => res.json({ reached: true, path: req.path }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  return { auth, dataDir, journal, port: srv.address().port, close: () => new Promise((r) => srv.close(r)) };
}
const hit = (I, p, { method = 'GET', headers = {}, body = null } = {}) => new Promise((resolve) => {
  const h = { host: `hub.example:${I.port}`, ...headers }; if (body !== null) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(body); }
  const q = http.request({ host: '127.0.0.1', port: I.port, path: p, method, headers: h }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { } resolve({ status: res.statusCode, json: j, text: b }); }); });
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
const SHAPES = [
  ['a file whose text does not parse', (d) => fs.writeFileSync(path.join(d, 'auth.json'), '{"passwordHash":"0123', { mode: 0o600 })],
  ['a file that holds no table (null)', (d) => fs.writeFileSync(path.join(d, 'auth.json'), 'null', { mode: 0o600 })],
  ['a file that cannot be opened (a link loop)', (d) => fs.symlinkSync('auth.json', path.join(d, 'auth.json'))],
  ['a FOLDER in its place', (d) => fs.mkdirSync(path.join(d, 'auth.json'))],
  ['a link to a file that is not there', (d) => fs.symlinkSync('gone.json', path.join(d, 'auth.json'))],
];
if (typeof process.getuid === 'function' && process.getuid() !== 0) SHAPES.push(['a file that cannot be opened (mode 000)', (d) => { fs.writeFileSync(path.join(d, 'auth.json'), '{"passwordHash":"x"}'); fs.chmodSync(path.join(d, 'auth.json'), 0o000); }]);
else console.log('    (running as root: a mode-000 file can be read here, so «cannot be opened» is the link loop alone)');

console.log('— ① EACH SHAPE THAT CANNOT BE READ IS HELD: refused by name everywhere, nothing written');
for (const [name, make] of SHAPES) {
  const I = await instance(make);
  const before = stateOf(I.dataDir);
  const api = await hit(I, '/api/sessions', { headers: { accept: 'application/json' } });
  const page = await hit(I, '/', { headers: { accept: 'text/html' } });
  const pageJa = await hit(I, '/login', { headers: { accept: 'text/html', 'accept-language': 'ja' } });
  const login = await hit(I, '/api/login', { method: 'POST', body: JSON.stringify({ password: 'anything' }), headers: { origin: `http://hub.example:${I.port}` } });
  const door = await hit(I, '/hook/abc', { method: 'POST', body: '{}' });
  const dav = await hit(I, '/dav/x');
  const roads = everyWriteRoad(I.auth);
  const after = stateOf(I.dataDir);
  const held = I.auth.held, journal = I.journal.filter((l) => l.includes('THE SIGN-IN FILE IS HELD'));
  const all503 = [api, page, pageJa, login, door, dav].every((r) => r.status === 503);
  console.log(`    ${name}: «${held && held.why}» · statuses ${[api, page, pageJa, login, door, dav].map((r) => r.status).join(' ')} · roads ${JSON.stringify(roads)}`);
  ok(held && all503 && api.json && api.json.error === 'signin-held' && api.json.fix === LW.LOGIN_WORDS['signin-held-fix'].en && page.text.includes(LW.LOGIN_WORDS['signin-held'].en) && pageJa.text.includes(LW.LOGIN_WORDS['signin-held'].ja) && door.json && door.json.error === 'signin-held',
    `${name}: every page, API and door refused 503 by name — the API says why and the way out, the sign-in page says it (en; ja when asked)`, { api: api.json, page: page.text.slice(0, 200) });
  ok(I.auth.enabled === true && I.auth.passwordEnabled === true && I.auth.checkToken('a'.repeat(48)) === false && I.auth.requestAuthed({ method: 'GET', headers: { host: 'hub.example' }, socket: {} }) === false && I.auth.verifyPassword('anything') === false && I.auth.exportPasswordRecord() === null,
    `${name}: the held state reaches every reader from ONE place — sign-in reads «on», no login is valid, requestAuthed (every upgrade that asks) is false`);
  ok(journal.length === 1, `${name}: the journal says it once, at the start (${journal.length})`, I.journal);
  ok(before === after && roads.set === 'signin-held' && roads.remove === 'signin-held' && roads.import === 'signin-held' && roads.token === 'signin-held' && roads.revoked === 0, `${name}: NOTHING written — the env password, a generated one, set / remove / import / a token and a vault lock's revoke each refused or a no-op; the path and its folder as they were`, { before, after, roads });
  await I.close();
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
