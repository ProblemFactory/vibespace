#!/usr/bin/env node
// test-signin-id-held — 主开发 r3336 / r3340 (lane lg-text-legs-3): THE DATA FOLDER's OWN ID FILE (data/instance.json) UNDER THE
// STORE-READ LAW. The release read ANY failure of that read as «no id», and the same start minted a new id OVER the file: the
// folder's own id was lost. Now an unread id file is HELD (src/store-read-hold.js): nothing is minted over it, it is read again off
// the loop, its lift judges the start again with no restart, torn bytes are kept aside once — and no error class opens the instance.
// Every unreadable file here is made by a PLACED refusal of the read call (the id file's path only: no mount, no mode change); scratch
// roots and a stand-in home only — no real sign-in file of anybody's. Every claim its RED (a mutant copy), and the whole suite is red
// at the release 0a031b541 (it reads no export the release lacks before its first claim).
//   ① a password: the instance opens guarded, NOTHING minted over the unread file, no witness written — both at the lift (the OLD id)
//   ② the sign-in file missing, a witness of this folder's id: HELD by the id file's own words (never «holds no id»); every request
//      refused meanwhile; the lift OPENS it with no restart
//   ③ missing, no witness anywhere (a local home): opens as today — nothing minted while unread
//   ④ every failed read's code holds (EACCES, EIO, ETIMEDOUT, EISDIR, ELOOP) — no error class opens the instance
//   ⑤ r3340: TORN BYTES OVER TWO STARTS — missing, a witness present: held at start one AND start two, the torn bytes kept aside ONCE,
//      nothing minted over them
//   ⑥ r3340 (1): a NETWORK home — «no witness anywhere» only when the home has ANSWERED none: still checking ⇒ held; answered ⇒ opens
//   ⑦ the family's notice lists the hold by the file's plain name while unread, never after the lift
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113 THE ORDER (主开发 r1845 (2)): the first import after node's own
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = require(path.join(REPO, 'src/signin-witness.js'));
const { Auth } = require(path.join(REPO, 'src/auth.js'));
const LW = require(path.join(REPO, 'src/login-words.js'));
const MUT = mutantCopies('dc3f-id-held', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok() was handed a ${typeof c}: ${n}`); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? `\n      ${typeof e === 'string' ? e : JSON.stringify(e)}` : ''}`); } };
const J = (x) => JSON.stringify(x);
const ROOT = scratchDir('dc3f-id-held');
const UID = typeof process.getuid === 'function' ? process.getuid() : null;
const quiet = (fn) => { const e = console.error, w = console.warn, lines = []; console.error = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { return { v: fn(), lines }; } finally { console.error = e; console.warn = w; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(10); } return !!(await fn()); };
function install(name) {
  const base = path.join(ROOT, name), root = path.join(base, 'root'), data = path.join(root, 'data'), home = path.join(base, 'home');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  return { base, root, data, home, id: path.join(data, SW.INSTANCE_FILE), auth: path.join(data, 'auth.json') };
}
const cfgOf = (it, extra = {}) => ({ home: it.home, uid: UID, env: {}, mountinfo: '', varTmp: path.join(it.base, 'vartmp'), xdgRuntimeDir: '', throwaway: false, ...extra });
const start = (it, extra = {}, A = Auth, envPw = null) => quiet(() => {
  const was = process.env.VIBESPACE_PASSWORD;
  if (envPw) process.env.VIBESPACE_PASSWORD = envPw; else delete process.env.VIBESPACE_PASSWORD;
  try { const a = new A(it.data, { witness: cfgOf(it, extra) }); a.ensurePassword({}); return a; }
  finally { if (was === undefined) delete process.env.VIBESPACE_PASSWORD; else process.env.VIBESPACE_PASSWORD = was; }
});
const varWitness = (it) => path.join(it.base, 'vartmp', `vibespace-${UID}`, SW.witnessFileOf(it.root));   // the install's own var-tmp rung
const homeWitness = (it) => path.join(it.home, '.vibespace', 'local', SW.witnessFileOf(it.root));   // the home rung (a local home's place)
const witnesses = (it) => [homeWitness(it), varWitness(it)];
// the release's tree has no hold to cut: its red controls are built only where the cure stands (the claims read the release itself)
const NEW = typeof SW.instanceValid === 'function';
const red = (label, fn) => { if (NEW) return fn(); console.log(`  · (the release's tree: the red control «${label}» is not built — the claim above reads the release itself)`); return null; };
const bytesOf = (f) => { try { return fs.readFileSync(f, 'utf-8'); } catch { return null; } };
const idIn = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf-8')).id; } catch { return null; } };
const res0 = () => ({ code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, type() { return this; }, send(b) { this.body = b; return this; } });
const api = (a, lang = null) => { const res = res0(); a.middleware()({ method: 'GET', path: '/api/whatever', url: '/api/whatever', headers: lang ? { 'accept-language': lang } : {}, cookies: {} }, res, () => { res.code = 200; }); return res; };
const MUT_AUTH = fs.readFileSync(path.join(REPO, 'src/auth.js'), 'utf-8');
const authCut = (from, to, label) => MUT.load('src/auth.js', anchored(MUT_AUTH, from, to, label), `auth-${label}`).Auth;
/** THE PLACED REFUSAL: the read call of ONE path refused with `code` — the start's sync read and the helper's read again off the loop
 *  (fs.readFileSync and fs.promises.readFile, that path only) → the undo */
function refuseRead(file, code = 'EACCES') {
  const rs = fs.readFileSync, rp = fs.promises.readFile;
  const err = () => Object.assign(new Error(`${code}: the read refused (placed), open '${file}'`), { code });
  fs.readFileSync = function (p, ...r) { if (p === file) throw err(); return rs.call(this, p, ...r); };
  fs.promises.readFile = function (p, ...r) { if (p === file) return Promise.reject(err()); return rp.call(this, p, ...r); };
  return () => { fs.readFileSync = rs; fs.promises.readFile = rp; };
}
/** a read again of the held id file, as the helper's ladder does it (off the loop) — `a._idHold` is the store-read hold (none at the release) */
const readAgain = async (a) => { if (a && a._idHold && typeof a._idHold.again === 'function') { try { return await a._idHold.again(); } catch { return false; } } return false; };
/** an install whose folder's sign-in was set (its id file and the witness on the var-tmp rung written), then its sign-in file removed */
function signedThenMissing(name, { keepAuth = false } = {}) {
  const it = install(name), a = start(it).v; quiet(() => a.setPassword('pw-id-0001', { userSet: true }));
  const id = idIn(it.id);
  if (!keepAuth) fs.rmSync(it.auth, { force: true });
  return { it, id };
}

console.log('① a password set, the id file unreadable: the instance opens guarded by it — NOTHING is minted over the file, no witness written');
{
  const { it, id } = signedThenMissing('pw', { keepAuth: true });
  for (const w of witnesses(it)) fs.rmSync(w, { force: true });   // the start writes the witness again at each start: removed, so a write shows
  const before = bytesOf(it.id), undo = refuseRead(it.id);
  let a;
  try { a = start(it).v; } finally { undo(); }   // the refusal undone BEFORE the file is looked at (a look under it reads nothing)
  ok(!a.held && a.passwordEnabled && bytesOf(it.id) === before && !witnesses(it).some((w) => fs.existsSync(w)), 'the start opens guarded by its password; the unreadable id file\'s bytes are UNCHANGED (nothing minted over it) and no witness is written (no id is known)', { held: a.held && a.held.kind, minted: bytesOf(it.id) !== before, witness: witnesses(it).filter((w) => fs.existsSync(w)) });
  const lifted = await readAgain(a);
  ok(lifted && bytesOf(it.id) === before && witnesses(it).some((w) => idIn(w) === id), `the read answers again (off the loop): the witness is written then — with the folder's OWN id (${id}), the id file untouched`, { lifted, witness: witnesses(it).map(idIn) });
  red('mint-over', () => {
    const RM = authCut("    if (this._idHeld()) {   // 主开发 r3336", "    if (false) {   // 主开发 r3336", 'mint-over');
    const P2 = signedThenMissing('pw-red', { keepAuth: true }), b2 = bytesOf(P2.it.id), u2 = refuseRead(P2.it.id);
    try { start(P2.it, {}, RM); } finally { u2(); }
    ok(bytesOf(P2.it.id) !== b2, 'RED CONTROL: the guard cut — a new id is minted OVER the unread file (the release\'s harm: the folder\'s own id lost)');
  });
}

console.log('② the sign-in file missing, a witness of this folder\'s id, the id file unreadable: HELD by its own words; the lift opens it with no restart');
{
  const { it, id } = signedThenMissing('held');
  const before = bytesOf(it.id), undo = refuseRead(it.id);
  let a, during;
  try {
    a = start(it).v; during = api(a);
  } finally { undo(); }
  const w = LW.loginWords('en')['signin-held-id-unread'], fill = (t) => String(t || '').replace('{dir}', it.data).replace('{idfile}', it.id);
  const zh = LW.loginWords('zh')['signin-held-id-unread'];
  ok(!!a.held && a.held.kind === 'folder' && a.held.idUnread === true && !!w && during.code === 503 && during.body.why === fill(w) && api(a, 'zh').body.why === fill(zh) && /reads it again by itself/.test(during.body.fix) && !/once the folder is back/.test(during.body.fix) && bytesOf(it.id) === before,
    'HELD: «the data folder … cannot read its own id file … right now» (en, zh through the server\'s fill) — never «it holds no id», whose act (delete the witness) would open it as new; nothing minted; every request refused (503)', { held: a.held, code: during.code, why: during.body && during.body.why });
  const lifted = await readAgain(a), after = api(a);
  ok(lifted && !a.held && after.code === 200 && bytesOf(it.id) === before && idIn(it.id) === id, `THE LIFT, with no restart: the id read (${id}) is the witness's — the instance opens; the held page drew no change by itself, the next request is answered open (${after.code}); no request made while held was answered open (${during.code})`, { held: a.held && a.held.kind, code: after.code });
  await red('id-silence and lift-unjudged', async () => {
  const RV = authCut("      const v = f ? SW.verdictOf({ auth: 'missing', dataLink: f.dataLink, instance: f.instance, idUnread: f.idUnread, found: f.found, dataDir: this._dataDir }) : { hold: null };", "      const v = f ? SW.verdictOf({ auth: 'missing', dataLink: f.dataLink, instance: f.instance, found: f.found, dataDir: this._dataDir }) : { hold: null };", 'id-silence');   // stale-pins: kept (the red's TO is the verdict call before r3336, put back on purpose)
  const H2 = signedThenMissing('held-red'), u2 = refuseRead(H2.it.id);
  let r2; try { r2 = start(H2.it, {}, RV).v; } finally { u2(); }
  ok(!!r2.held && !r2.held.idUnread && /holds no id/.test(r2.held.why), 'RED CONTROL: the id\'s silence read as «no id» — held by «it holds no id», whose act would start it as new and mint over the file', r2.held);
  const RL = authCut("    if (this._held && this._held.idUnread) {\n      const was = this._idWas", "    if (false) {\n      const was = this._idWas", 'lift-unjudged');
  const H3 = signedThenMissing('lift-red'), u3 = refuseRead(H3.it.id);
  let r3; try { r3 = start(H3.it, {}, RL).v; } finally { u3(); }
  await readAgain(r3);
  ok(!!r3.held, 'RED CONTROL: the lift not judged again — the start stays held until a restart', r3.held && r3.held.kind);
  });
}

console.log('③ the sign-in file missing, NO witness anywhere (a local home), the id file unreadable: opens as today — nothing minted');
{
  const it = install('none'); fs.writeFileSync(it.id, J({ v: 1, id: 'vi-0a0a0a0a0a0a', createdAt: 1 }));
  const before = bytesOf(it.id), undo = refuseRead(it.id);
  let a; try { a = start(it).v; } finally { undo(); }
  ok(!a.held && !a.passwordEnabled && bytesOf(it.id) === before, 'no witness anywhere: the id decides nothing — the instance opens as a new one does, and the unreadable file is NOT written over', { held: a.held && a.held.kind, minted: bytesOf(it.id) !== before });
  await readAgain(a);
  ok(bytesOf(it.id) === before, 'the lift: the id read is the folder\'s own — kept as it is');
}

console.log('④ every failed read holds — no error class opens the instance');
{
  const codes = ['EACCES', 'EIO', 'ETIMEDOUT', 'EISDIR', 'ELOOP', 'EPERM'], held = [];
  for (const code of codes) {
    const { it } = signedThenMissing(`code-${code}`), undo = refuseRead(it.id, code);
    try { const a = start(it).v; if (a.held && a.held.idUnread) held.push(code); } finally { undo(); }
  }
  ok(held.length === codes.length, `each failed read's code holds by the id file's words (${held.join(', ')} of ${codes.join(', ')}); only ENOENT is «missing»`);
}

console.log('⑤ r3340: TORN BYTES OVER TWO STARTS — missing, a witness present: held at start one AND start two; kept aside ONCE; nothing minted');
{
  const torn = '{"v":1,"id":"vi-', tornRun = async (name, A0) => {
    const { it } = signedThenMissing(name); fs.writeFileSync(it.id, torn);
    const copies = () => fs.readdirSync(it.data).filter((n) => n.startsWith(`${SW.INSTANCE_FILE}.corrupt-`));
    const a1 = start(it, {}, A0).v;
    await until(() => copies().length > 0 && !(a1._idHold && a1._idHold.held()));
    const s1 = { held: a1.held && a1.held.kind, copies: copies().length, live: bytesOf(it.id) };
    const a2 = start(it, {}, A0).v;
    await until(() => !(a2._idHold && a2._idHold.held()));
    const s2 = { held: a2.held && a2.held.kind, copies: copies().length, live: bytesOf(it.id), copy: copies()[0] ? bytesOf(path.join(it.data, copies()[0])) : null };
    return { s1, s2 };
  };
  const t = await tornRun('torn');
  ok(t.s1.held === 'folder' && t.s2.held === 'folder', `held at start one (${t.s1.held}) AND at start two (${t.s2.held}) — a torn id file never opens the instance by its replacement alone`, t);
  ok(t.s1.copies === 1 && t.s2.copies === 1 && t.s2.copy === torn && t.s1.live === torn && t.s2.live === torn, 'the torn bytes kept aside ONCE (one copy, the same bytes, at both starts) — and NOTHING minted over them while a witness stands', t);
  // RED: the lift treated as the person's act (the id minted and the copies removed «as at a start that opened») — start two opens
  await red('torn-minted', async () => {
  const RT = authCut("      if (v.hold) { this._hold(v.hold.why, v.hold.kind, v.hold); return; }   // the folder's own rule, now that the id is known\n", "      if (v.hold) { try { f.instance = SW.ensureInstance(this._dataDir, null); this._held = null; this._syncWitness(); } catch { } this._hold(v.hold.why, v.hold.kind, v.hold); return; }\n", 'torn-minted');
  const r = await tornRun('torn-red', RT);
  ok(!r.s2.held, 'RED CONTROL: the torn lift minting and clearing as a person\'s act — start two OPENS (an open by the id\'s silence, one restart late)', r);
  });
}

console.log('⑥ r3340 (1): a NETWORK home — «no witness anywhere» only when the home has ANSWERED that it holds none');
{
  const standIn = (mode) => ({ call: (op, payload = {}) => (mode === 'stall' ? new Promise(() => { }) : Promise.resolve(op === 'netRead' ? { file: path.join(payload.path || '', 'signin-x.json'), none: true } : {})) });
  const nfs = (it) => `25 1 0:50 / ${it.home} rw,relatime shared:1 - nfs4 server:/home rw\n`;
  const quick = { netBoundMs: 30, netReaskMs: 60, netReaskMaxMs: 120 };
  const run = async (name, mode) => {
    const it = install(name); fs.writeFileSync(it.id, J({ v: 1, id: 'vi-0b0b0b0b0b0b', createdAt: 1 }));
    const before = bytesOf(it.id), undo = refuseRead(it.id);
    let a; try { a = start(it, { mountinfo: nfs(it), pool: standIn(mode), ...quick }).v; await until(() => !a.held || a.held.kind !== 'checking', 400); } finally { undo(); }
    return { held: a.held ? a.held.kind : null, minted: bytesOf(it.id) !== before };
  };
  const still = await run('net-stall', 'stall'), none = await run('net-none', 'none');
  ok(!!still.held && !still.minted, `the home still not answering: held «${still.held}» — a home still checking (or one whose read failed) is NOT «no witness»`, still);
  ok(!none.held && !none.minted, 'the home answered «none»: no witness anywhere — the instance opens as a new one does, nothing minted over the unread file', none);
}

console.log('⑦ the family\'s notice: the hold listed by the file while unread, never after the lift');
{
  let HOLD = null; try { HOLD = require(path.join(REPO, 'src/store-read-hold.js')); } catch { HOLD = null; }
  const n = () => (HOLD ? HOLD.holds().filter((h) => h.file === SW.INSTANCE_FILE && h.held !== false).length : 0);   // (the reds' holds stay listed: counted)
  const { it } = signedThenMissing('notice'), n0 = n(), undo = refuseRead(it.id);
  let a; try { a = start(it).v; } finally { undo(); }
  const n1 = n();
  await readAgain(a);
  const n2 = n();
  ok(!!HOLD && n1 === n0 + 1 && n2 === n0, `the family's one list of holds names ${SW.INSTANCE_FILE} while it is unread (${n0} → ${n1}) and not after it reads again (${n2})`);
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
