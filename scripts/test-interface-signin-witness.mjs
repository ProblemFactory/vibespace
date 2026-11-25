#!/usr/bin/env node
// test-interface-signin-witness — B-dc3f (1)'s remainder (主开发 r2341 / r3433, lane lg-text-legs-3): THE PIPED FORM's SIGN-IN TABLE
// GETS THE SAME VERDICT as the plain form. The interface (src/interface/signin.js) holds the table; its start line NAMES the data
// folder, the root, the home, the uid, throwaway and declared (src/interface/main.js, additive); the start's facts are read ONCE before
// it listens, every write after is OFF THE LOOP; the verdict and the writer's choice are src/signin-witness.js's own (one implementation).
// Scratch roots and a stand-in home only — no real sign-in file of anybody's; an unreadable id file by a PLACED refusal of the read call.
//   ① a missing table + a witness of another folder: HELD by the folder's words — RED an older supervisor's line (no folder named): opens
//   ② a table that says off + another folder's witness: held; the same folder turned off: opens
//   ③ no witness anywhere: opens, the folder's id minted once — the witness kept by the one writer's choice (none with no password)
//   ④ a password: the witness written OFF THE LOOP at the start and after a set — no synchronous disk call; RED the sync writer
//   ⑤ the id file unreadable (six codes): with a witness HELD, never open; with none open, NOTHING minted over it
//   ⑥ the declaration: named in the line, held with no password; NEVER read from the environment
//   ⑦ the start line's named fields judged by name (main.js), additive
//   ⑧ 主开发 r3629 (round w43tjwjp5): a line naming the folder but not the home or uid gets the plain form's defaults (held, never «no
//     place») — RED the old «no place»; the declaration's cell is the plain form's own (SW.declaredCell): the page's «off» gives way to
//     the line's password, the page's turn-off refused 409 — RED each call cut; the turn-off removes the witness at once — RED cut
//   ⑨ 主开发 r3788 (round w80b4230f's must): THE START LINE's WALK — every field by four states (absent, empty, of the wrong kind, of the
//     wrong value): only ABSENT is defaulted, every named value that is not this process's own is refused by name — RED each check cut
//     (the wrong uid's red OPENS against a witness); what the start took is said once (a defaulted home / uid, a throwaway start)
//   ⑩ 主开发 r3926 (round w123c6963's must): THE LINE's VALUES ARE CLAIMS, NEVER PLACES — a right value in another spelling (a root with a
//     trailing slash, a folder with a dot segment and no root, a folder with a trailing slash), a witness at the home and the table lost:
//     HELD by the folder's own words — RED the raw text handed on (two OPEN, one held by a misleading word); the facts' builder names no
//     field of the line but the two marks (a static claim)
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113 THE ORDER (主开发 r1845 (2)): the first import after node's own
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = require(path.join(REPO, 'src/signin-witness.js'));
const T = require(path.join(REPO, 'src/signin-table.js'));
const SI = require(path.join(REPO, 'src/interface/signin.js'));
const M = require(path.join(REPO, 'src/interface/main.js'));
const MUT = mutantCopies('dc3f-piped', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok() was handed a ${typeof c}: ${n}`); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? `\n      ${typeof e === 'string' ? e : JSON.stringify(e)}` : ''}`); } };
const J = (x) => JSON.stringify(x);
const ROOT = scratchDir('dc3f-piped');
const UID = typeof process.getuid === 'function' ? process.getuid() : null;
const SIGNIN_SRC = fs.readFileSync(path.join(REPO, 'src/interface/signin.js'), 'utf-8');
const siCut = (from, to, label) => MUT.load('src/interface/signin.js', anchored(SIGNIN_SRC, from, to, label), `signin-${label}`);
function install(name) {
  fs.mkdirSync(path.join(ROOT, name), { recursive: true });
  const base = fs.realpathSync(path.join(ROOT, name)), root = path.join(base, 'root'), data = path.join(root, 'data'), home = path.join(base, 'home');   // the real path: the places main.js computes are real
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  return { base, root, data, home, table: path.join(data, 'auth.json'), id: path.join(data, SW.INSTANCE_FILE) };
}
const witnessCfg = (it, extra = {}) => ({ folder: it.data, root: it.root, throwaway: false, declared: false, scratch: { home: it.home, varTmp: path.join(it.base, 'vartmp') }, ...extra });   // scratch: the install's own home and var-tmp rung (a suite's seam: no start line sets it)g (never the machine's /var/tmp)
const homeWitness = (it) => path.join(it.home, '.vibespace', 'local', SW.witnessFileOf(it.root));
const lines = [];
const log = { log: () => { }, warn: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) };
const tableOf = (it, { witness = witnessCfg(it), Mod = SI, hashOf } = {}) => Mod.create({ file: it.table, log, witness, ...(hashOf ? { hashOf } : {}) });
const plantWitness = (it, id) => { fs.mkdirSync(path.dirname(homeWitness(it)), { recursive: true, mode: 0o700 }); fs.writeFileSync(homeWitness(it), J(SW.witnessDoc({ root: it.root, dataDir: it.data, id }))); };
const plantId = (it, id) => fs.writeFileSync(it.id, J({ v: 1, id, createdAt: 1 }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(10); } return !!(await fn()); };
const idIn = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf-8')).id; } catch { return null; } };
const bytesOf = (f) => { try { return fs.readFileSync(f, 'utf-8'); } catch { return null; } };
/** THE PLACED REFUSAL: the read call of ONE path refused with `code` (fs.readFileSync and fs.promises.readFile, that path only) → the undo */
function refuseRead(file, code) {
  const rs = fs.readFileSync, rp = fs.promises.readFile;
  const err = () => Object.assign(new Error(`${code}: the read refused (placed), open '${file}'`), { code });
  fs.readFileSync = function (p, ...r) { if (p === file) throw err(); return rs.call(this, p, ...r); };
  fs.promises.readFile = function (p, ...r) { if (p === file) return Promise.reject(err()); return rp.call(this, p, ...r); };
  return () => { fs.readFileSync = rs; fs.promises.readFile = rp; };
}

console.log('① a missing table + a witness of another folder: HELD by the folder\'s words — never a new open instance');
{
  const it = install('missing-other'); plantId(it, 'vi-111111111111'); plantWitness(it, 'vi-222222222222');
  const t = tableOf(it); await t.load();
  const w = t.held ? T.heldWords('en', false, t.held) : null;
  ok(!!t.held && t.held.kind === 'folder' && /not the one/.test(t.held.why) && !!w && w.fix.includes(homeWitness(it)) && t.stateLine().held === t.held.why, 'the piped form\'s table: the sign-in table missing, the witness names another folder — HELD, its words name the witness file to delete (the plain form\'s own)', t.held);
  const it2 = install('missing-older'); plantId(it2, 'vi-111111111111'); plantWitness(it2, 'vi-222222222222');
  lines.length = 0; const t2 = tableOf(it2, { witness: null }); await t2.load();
  ok(!t2.held && lines.some((l) => /names no data folder/.test(l)), 'BY DESIGN (an older supervisor\'s line: no folder named) — today\'s reading, BY NAME: it opens, and the journal says why once (the red control is the next claim)', { held: t2.held, lines });
  const RV = siCut("    else if (v.hold) hold(v.hold.why, v.hold.kind, v.hold);", "    else if (false) hold(v.hold.why, v.hold.kind, v.hold);", 'verdict-unheard');
  const it3 = install('missing-red'); plantId(it3, 'vi-111111111111'); plantWitness(it3, 'vi-222222222222');
  const t3 = tableOf(it3, { Mod: RV }); await t3.load();
  ok(!t3.held, 'RED CONTROL: the verdict not heard — the replaced folder comes up a new open instance (the release\'s piped form)');
}

console.log('② a table that says off: another folder\'s witness holds it; the same folder turned off opens');
{
  const it = install('off-other'); plantId(it, 'vi-333333333333'); plantWitness(it, 'vi-444444444444'); fs.writeFileSync(it.table, J({ userSet: true, tokens: {} }));
  const t = tableOf(it); await t.load();
  ok(!!t.held && t.held.kind === 'folder' && /says sign-in is off/.test(t.held.why), 'its own table says off, the witness names another folder: HELD (H2) — a folder that is not the one never opens by saying off', t.held);
  const s = install('off-same'); plantId(s, 'vi-555555555555'); plantWitness(s, 'vi-555555555555'); fs.writeFileSync(s.table, J({ userSet: true, tokens: {} }));
  const ts = tableOf(s); await ts.load(); await ts.witnessed();
  ok(!ts.held && !ts.enabled && !fs.existsSync(homeWitness(s)), 'the same folder turned off by the person: it opens, and its own witness is removed (the one writer\'s choice, off the loop)');
}

console.log('③ no witness anywhere: it opens; the folder\'s id minted ONCE, off the loop');
{
  const it = install('fresh'); const t = tableOf(it); await t.load(); await t.witnessed();
  const first = idIn(it.id), t2 = tableOf(it); await t2.load(); await t2.witnessed();   // a SECOND start over the same folder
  ok(!t.held && !t.enabled && SW.ID_RE.test(String(first)) && !fs.existsSync(homeWitness(it)) && !t2.held && idIn(it.id) === first, `a new instance opens as before; its id written ONCE (${first}) — the next start keeps it (${idIn(it.id)}); no witness with no password`);
}

console.log('④ a password: the witness written OFF THE LOOP — no synchronous disk call once loaded');
{
  const it = install('pw'); const t = tableOf(it); await t.load();
  const NAMES = Object.keys(fs).filter((k) => /Sync$/.test(k) && typeof fs[k] === 'function'), keep = NAMES.map((n) => [n, fs[n]]);
  const syncs = async (fn) => { const seen = []; for (const [n, f0] of keep) fs[n] = function (...a) { seen.push(n); return f0.apply(this, a); }; try { await fn(); } finally { for (const [n, f0] of keep) fs[n] = f0; } return seen; };
  const there = (f) => fs.promises.access(f).then(() => true, () => false);   // (an async look: the watched window counts the suite's own calls too)
  const settle = async (tt, it0) => { await tt.flushed(); await until(() => there(homeWitness(it0))); await tt.witnessed(); };   // a wait on the fact (the witness there)
  const seen = await syncs(async () => { await t.ensure({ password: 'pw-piped-0001' }); await settle(t, it); });
  ok(t.enabled && idIn(homeWitness(it)) === idIn(it.id) && seen.length === 0, `the boot's password set: the table on disk, then the witness written with the folder's id — ${seen.length} synchronous fs call(s) (the interface's law)`, seen.slice(0, 6));
  const RS = siCut("      for (const w of plan.write) { try { await SW.writeWitnessAsync({ place: { dir: path.dirname(w) }, file: w,", "      for (const w of plan.write) { try { SW.writeWitness({ place: { dir: path.dirname(w) }, file: w,", 'sync-writer');
  const r = install('pw-red'); const tr = tableOf(r, { Mod: RS }); await tr.load();
  const seenR = await syncs(async () => { await tr.ensure({ password: 'pw-piped-0002' }); await settle(tr, r); });
  ok(seenR.length > 0, `RED CONTROL: the plain form's synchronous writer — ${seenR.length} synchronous fs call(s) after the load`, seenR.slice(0, 6));
}

console.log('⑤ the id file unreadable — every failed read holds with a witness; with none it opens and NOTHING is minted over it');
{
  const codes = ['EACCES', 'EIO', 'ETIMEDOUT', 'EISDIR', 'ELOOP', 'EPERM'], heldBy = [], untouched = [];
  for (const code of codes) {
    const it = install(`code-${code}`); plantId(it, 'vi-666666666666'); plantWitness(it, 'vi-666666666666');
    let t; const undo = refuseRead(it.id, code);
    try { t = tableOf(it); await t.load(); } finally { undo(); }
    if (t.held && t.held.kind === 'folder') heldBy.push(code);
    const n = install(`none-${code}`); plantId(n, 'vi-777777777777'); const before = bytesOf(n.id);
    let tn; const undo2 = refuseRead(n.id, code);
    try { tn = tableOf(n); await tn.load(); await tn.witnessed(); } finally { undo2(); }
    if (!tn.held && bytesOf(n.id) === before) untouched.push(code);
  }
  ok(heldBy.length === codes.length, `with the folder's own witness there, each failed read holds (${heldBy.join(', ')}) — no error class opens the instance`);
  ok(untouched.length === codes.length, `with no witness anywhere it opens as before, and the unreadable id file is NOT written over (${untouched.join(', ')})`);
  const SW_SRC = fs.readFileSync(path.join(REPO, 'src/signin-witness.js'), 'utf-8');
  const SWcut = MUT.load('src/signin-witness.js', anchored(SW_SRC, "  try { await fs.promises.lstat(file); return null; } catch (e) { if (!e || e.code !== 'ENOENT') return null; }", '  void 0;', 'no-lstat-guard'), 'sw-no-lstat-guard');
  const keepEnsure = SW.ensureInstanceAsync, rn = install('none-red'); plantId(rn, 'vi-777777777777'); const beforeR = bytesOf(rn.id);
  SW.ensureInstanceAsync = SWcut.ensureInstanceAsync;   // the interface asks the module's own name: the cut writer, for this one start
  const undoR = refuseRead(rn.id, 'EIO');
  try { const tr = tableOf(rn); await tr.load(); await tr.witnessed(); } finally { undoR(); SW.ensureInstanceAsync = keepEnsure; }
  ok(bytesOf(rn.id) !== beforeR, 'RED CONTROL: the async id writer\'s look cut — the unreadable id file IS written over (a new id)');
}

console.log('⑥ the declaration: named in the start line — never read from the environment');
{
  const it = install('declared'); const t = tableOf(it, { witness: witnessCfg(it, { declared: true }) }); await t.load(); await t.ensure({});
  ok(!!t.held && t.held.kind === 'declared', 'declared in the line, no password: HELD «declared»', t.held);
  const was = process.env.VIBESPACE_SIGNIN; process.env.VIBESPACE_SIGNIN = 'required';
  let tn; try { const n = install('declared-env'); tn = tableOf(n); await tn.load(); await tn.ensure({}); } finally { if (was === undefined) delete process.env.VIBESPACE_SIGNIN; else process.env.VIBESPACE_SIGNIN = was; }
  ok(!tn.held, 'VIBESPACE_SIGNIN=required in the ENVIRONMENT and not in the line: not held — the interface reads no environment for sign-in');
  const RE = siCut('  const declared = (extra = {}) => SW.declaredCell({ declared: !!(witness && witness.declared),', '  const declared = (extra = {}) => SW.declaredCell({ declared: !!(witness && witness.declared) || SW.declaredOf(process.env),', 'reads-env');
  process.env.VIBESPACE_SIGNIN = 'required';
  let te; try { const n = install('declared-env-red'); te = tableOf(n, { Mod: RE }); await te.load(); await te.ensure({}); } finally { if (was === undefined) delete process.env.VIBESPACE_SIGNIN; else process.env.VIBESPACE_SIGNIN = was; }
  ok(!!te.held && te.held.kind === 'declared', 'RED CONTROL: an interface that reads the environment — held «declared» by an env it was never handed');
}

console.log('⑦ the start line\'s named fields, judged by name (src/interface/main.js), additive');
{
  const it = install('line'), base = { file: it.table };
  const bad = await M.signinWhy({ ...base, folder: 'relative/data' }, UID), badUid = await M.signinWhy({ ...base, folder: it.data, uid: 'x' }, UID), good = await M.signinWhy({ ...base, folder: it.data, root: it.root, home: os.homedir(), uid: UID, throwaway: false, declared: false }, UID), older = await M.signinWhy(base, UID);
  const ill = [{ folder: '' }, { folder: null }, { folder: it.data, root: 'rel/root' }, { folder: it.data, home: 'rel/home' }, { folder: it.data, throwaway: 'yes' }, { folder: it.data, declared: 1 }];
  const illWhy = []; for (const f of ill) illWhy.push(await M.signinWhy({ ...base, ...f }, UID));
  ok(illWhy.every((w) => typeof w === 'string' && /signin\.|data folder/.test(w)), 'every other ill-named field — an empty or null folder, a relative root or home, a throwaway or declared that is not true or false: a bad start BY NAME', illWhy);
  ok(/not an absolute path/.test(String(bad)) && /not a whole number/.test(String(badUid)) && good === null && older === null && (await M.witnessFor(base)) === null && (await M.witnessFor({ ...base, folder: it.data })).root === it.root, 'a relative folder or a uid that is no number: a bad start BY NAME; the fields well named, or none at all (an older supervisor): accepted', { bad, badUid, good, older });
}

console.log('⑧ 主开发 r3629 (round w43tjwjp5): the plain form\'s defaults for an unnamed home or uid; the declaration\'s cell is the plain form\'s own');
{
  const MAIN_SRC = fs.readFileSync(path.join(REPO, 'src/interface/main.js'), 'utf-8');
  const OLD = 'vi-0e0e0e0e0e0e', NOW = 'vi-0f0f0f0f0f0f';
  const withEnv = async (k, v, fn) => { const was = process.env[k]; process.env[k] = v; try { return await fn(); } finally { if (was === undefined) delete process.env[k]; else process.env[k] = was; } };
  const plantAt = (file, it, id) => { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.writeFileSync(file, J(SW.witnessDoc({ root: it.root, dataDir: it.data, id }))); };
  /** must 4 (and r3926): the line names the folder; a witness of ANOTHER folder at a place THIS PROCESS reads — its HOME (a scratch home
   *  for the leg, as a supervisor's HOME would be) or the var-tmp rung of its uid */
  const dflt = async (name, { at = 'home', Mod = SI } = {}) => {
    const it = install(name); plantId(it, NOW);
    const home = path.join(it.base, 'process-home'), vt = path.join(it.base, 'vartmp'); fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    plantAt(at === 'home' ? path.join(home, '.vibespace', 'local', SW.witnessFileOf(it.root)) : path.join(vt, `vibespace-${UID}`, SW.witnessFileOf(it.root)), it, OLD);
    const w = await M.witnessFor({ file: it.table, folder: it.data });
    const t = await withEnv('HOME', home, async () => { const x = tableOf(it, { witness: { ...w, scratch: { varTmp: vt } }, Mod }); await x.load(); return x; });
    return { w, t };
  };
  const h1 = await dflt('dflt-home'), h2 = await dflt('dflt-uid', { at: 'var-tmp' });
  ok(!('home' in h1.w) && !('uid' in h1.w) && !!h1.t.held && h1.t.held.kind === 'folder' && !!h2.t.held && h2.t.held.kind === 'folder',
    `the witness carries no home or uid: this process's own are read (the plain form's) — a witness of another folder at its home, or at its uid's var-tmp rung, HOLDS it (${h1.t.held && h1.t.held.kind}, ${h2.t.held && h2.t.held.kind})`);
  const RNP = siCut('    try { facts = SW.startFactsSync({ ...(witness.scratch || {}), dataDir: witness.folder, root: witness.root, env: {},', "    try { facts = SW.startFactsSync({ ...(witness.scratch || {}), dataDir: witness.folder, root: witness.root, home: '', uid: null, env: {},", 'no-place');
  const r1 = await dflt('dflt-home-red', { Mod: RNP }), r2 = await dflt('dflt-uid-red', { at: 'var-tmp', Mod: RNP });
  ok(!r1.t.held && !r2.t.held, 'RED CONTROL: the home and the uid read as «no place» (the released form) — no witness read, the start OPENS against one');

  // must 5: THE DECLARATION's CELL, the plain form's own — the page's «off» gives way to the line's password, the turn-off is refused
  const onDisk = (it) => { try { return JSON.parse(fs.readFileSync(it.table, 'utf-8')); } catch { return null; } };
  // a QUICK hash for these tables (create's own `hashOf` seam): the declaration's cell is under test here, not the hash — the real scrypt is ④'s
  // and test-interface-signin's; sixteen real hashes made this suite 0.4 → 1.1 s and the fast tier's sum met its cap (test-ci-gate)
  const QUICK = async (pw, salt) => crypto.createHash('sha256').update(`${salt}:${pw}`).digest('hex');
  const pwIs = async (it, pw) => { const r = onDisk(it); return !!(r && r.passwordHash && T.hashMatches(await QUICK(pw, r.salt), r.passwordHash)); };
  const offLine = async (name, Mod = SI) => {
    const it = install(name); plantId(it, NOW); fs.writeFileSync(it.table, J({ userSet: true, tokens: {} }));
    const t = tableOf(it, { witness: witnessCfg(it, { declared: true }), Mod, hashOf: QUICK }); await t.load(); await t.ensure({ password: 'pw-line-0001' }); await t.flushed();
    return { it, t };
  };
  const o1 = await offLine('declared-off-line');
  ok(!o1.t.held && o1.t.enabled && await pwIs(o1.it, 'pw-line-0001') && onDisk(o1.it).userSet === false, 'declared, the page turned the sign-in off earlier, the line names a password: NOT held — guarded by it (the held words\' act works, as the plain form\'s r2152 (d))');
  const o2 = await offLine('declared-off-line-red', siCut('    if (d.keepOff) return {};\n', '    if (state?.userSet) return {};\n', 'userset-first'));   // stale-pins: kept — the first form's early return, the red's text
  ok(!!o2.t.held && o2.t.held.kind === 'declared', 'RED CONTROL: the page\'s «off» first — the line\'s password ignored, held «declared» at every start');
  const serve = async (t) => {
    const srv = http.createServer((req, res) => { const facts = { secure: false, addr: req.socket.remoteAddress, port: req.socket.remotePort }; if (t.road(req, res, facts)) return; req.resume(); res.writeHead(299); res.end(); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    return { port: srv.address().port, close: () => new Promise((r) => srv.close(r)) };
  };
  const post = (port, p, body, cookie = '') => new Promise((resolve) => {
    const data = Buffer.from(J(body));
    const q = http.request({ host: '127.0.0.1', port, method: 'POST', path: p, agent: false, headers: { 'content-type': 'application/json', 'content-length': data.length, 'sec-fetch-site': 'same-origin', ...(cookie ? { cookie } : {}) } }, (r) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c) => { d += c; }); r.on('end', () => { let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: r.statusCode, json: j, cookies: [].concat(r.headers['set-cookie'] || []) }); }); });
    q.on('error', (e) => resolve({ status: 0, error: e.code, cookies: [] })); q.write(data); q.end();
  });
  /** the page's «turn sign-in off» as a person does it: signed in first (its cookie), then the route with the current password */
  const removeAsk = async (port, current) => {
    const inn = await post(port, '/api/login', { password: current });
    const tok = inn.cookies.map((c) => /^vs_token=([a-f0-9]+);/.exec(c)).find(Boolean);
    if (!tok) return { status: -1, json: { error: `no sign-in (${inn.status})` } };
    return post(port, '/api/auth/set-password', { remove: true, current }, `vs_token=${tok[1]}`);
  };
  const turnOff = async (name, { declared = true, Mod = SI } = {}) => {
    const it = install(name); plantId(it, NOW);
    const t = tableOf(it, { witness: witnessCfg(it, { declared }), Mod, hashOf: QUICK }); await t.load(); await t.ensure({ password: 'pw-line-0002' }); await t.flushed(); await t.witnessed();
    const had = await until(() => fs.existsSync(homeWitness(it)), 2000), s = await serve(t);   // the set's witness, written after its table landed
    try { const a = await removeAsk(s.port, 'pw-line-0002'); await t.flushed(); await t.witnessed(); return { it, t, a, had, left: fs.existsSync(homeWitness(it)) }; } finally { await s.close(); }
  };
  const d1 = await turnOff('declared-turn-off');
  ok(d1.a.status === 409 && d1.a.json && d1.a.json.error === 'signin-required' && d1.t.enabled && await pwIs(d1.it, 'pw-line-0002'), `declared: the page's «turn sign-in off» REFUSED by name, as the plain form's route (${d1.a.status} ${d1.a.json && d1.a.json.error})`);
  const d2 = await turnOff('declared-turn-off-red', { Mod: siCut('        const off = declared().turnOff; if (off) return json(res, 409', '        const off = null; if (off) return json(res, 409', 'no-turn-off-guard') });
  ok(d2.a.status === 200 && !d2.t.enabled, `RED CONTROL: the turn-off's check cut — the sign-in IS turned off under the declaration (${d2.a.status})`);
  const n1 = await turnOff('turn-off-witness', { declared: false });
  ok(n1.a.status === 200 && n1.had && !n1.left, `no declaration: the page's turn-off works and the witness is REMOVED at once, as the plain form's (it was there: ${n1.had}; after: ${n1.left})`);
  const n2 = await turnOff('turn-off-witness-red', { declared: false, Mod: siCut('        writeWitnesses();   // the sign-in turned off', '        void 0;   // the sign-in turned off', 'no-turn-off-witness') });
  ok(n2.a.status === 200 && n2.had && n2.left, 'RED CONTROL: the turn-off\'s witness removal cut — the copy stays until the next start');
  // ONE IMPLEMENTATION (r3629 must 5): the interface asks the shared cell and writes nothing of its rule
  const calls = SIGNIN_SRC.split('SW.declaredCell(').length - 1;
  ok(calls === 1 && !SIGNIN_SRC.includes('=required is set') && !SIGNIN_SRC.includes("'signin-required'"), `src/interface/signin.js asks SW.declaredCell (${calls} call) and holds none of the declaration's words or codes`);   // stale-pins: kept — a deliberate absence check (the words live in the shared cell)
}

console.log('⑨ 主开发 r3788: the start line\'s walk — only an ABSENT value is defaulted; a named value that is not this process\'s own is refused by name');
{
  const MAIN_SRC = fs.readFileSync(path.join(REPO, 'src/interface/main.js'), 'utf-8');
  const it = install('walk'), base = { file: it.table, folder: it.data }, other = install('walk-other');
  const OTHER_UID = UID === null ? 4242 : UID + 1;
  // [field, state, the line's fields, the expected word] — 'refused' ⇒ a bad start BY NAME (its why names the field); otherwise the cell is accepted
  const CELLS = [
    ['folder', 'absent (no field named)', { file: it.table }, 'today'],
    ['folder', 'absent (other fields named)', { file: it.table, root: it.root, uid: UID }, 'refused'],
    ['folder', 'empty', { file: it.table, folder: '' }, 'refused'], ['folder', 'wrong kind', { file: it.table, folder: 5 }, 'refused'],
    ['folder', 'wrong value (not the table\'s folder)', { file: it.table, folder: other.data }, 'refused'],
    ['root', 'absent', base, 'default'], ['root', 'empty', { ...base, root: '' }, 'refused'], ['root', 'wrong kind', { ...base, root: 5 }, 'refused'],
    ['root', 'wrong value (not the folder\'s parent)', { ...base, root: other.root }, 'refused'],
    ['home', 'absent', base, 'default'], ['home', 'empty', { ...base, home: '' }, 'refused'], ['home', 'wrong kind', { ...base, home: 5 }, 'refused'],
    ['home', 'wrong value (not this account\'s home)', { ...base, home: it.home }, 'refused'],
    ['uid', 'absent', base, 'default'], ['uid', 'empty (null)', { ...base, uid: null }, 'refused'], ['uid', 'wrong kind', { ...base, uid: '1000' }, 'refused'],
    ['uid', 'wrong value (another account\'s)', { ...base, uid: OTHER_UID }, 'refused'], ['uid', 'wrong value (negative)', { ...base, uid: -1 }, 'refused'],
    ...(UID !== 0 ? [['uid', 'wrong value (0)', { ...base, uid: 0 }, 'refused']] : []),
    ['throwaway', 'absent', base, 'default'], ['throwaway', 'empty', { ...base, throwaway: '' }, 'refused'], ['throwaway', 'wrong kind', { ...base, throwaway: 'yes' }, 'refused'],
    ['declared', 'absent', base, 'default'], ['declared', 'empty', { ...base, declared: '' }, 'refused'], ['declared', 'wrong kind', { ...base, declared: 1 }, 'refused'],
    // 主开发 r3926: A RIGHT VALUE IN ANOTHER SPELLING — accepted, and the witness's places are the COMPUTED ones, never the line's text
    ['folder', 'another spelling (a trailing slash)', { file: it.table, folder: `${it.data}/` }, 'spelling'],
    ['folder', 'another spelling (a dot segment)', { file: it.table, folder: `${it.root}/./data` }, 'spelling'],
    ['root', 'another spelling (a trailing slash)', { ...base, root: `${it.root}/` }, 'spelling'],
    ['home', 'another spelling (a trailing slash)', { ...base, home: `${os.homedir()}/` }, 'spelling'],
  ];
  const wrong = [];
  for (const [field, state, line, want] of CELLS) {
    const why = await M.signinWhy(line, UID), w = why === null ? await M.witnessFor(line) : null;
    const okCell = want === 'refused' ? typeof why === 'string' && why.includes(`signin.${field}`)
      : want === 'today' ? why === null && w === null
      : want === 'spelling' ? why === null && !!w && w.folder === it.data && w.root === it.root && !('home' in w) && !('uid' in w)
      : why === null && !!w && (field === 'root' ? w.root === it.root : field === 'home' || field === 'uid' ? w[field] === undefined : w[field] === false);
    if (!okCell) wrong.push({ field, state, want, why, w });
  }
  ok(wrong.length === 0, `the walk's ${CELLS.length} cells: an absent root / home / uid / throwaway / declared is DEFAULTED (the folder's parent, this process's home and uid, false); every empty, ill-kinded or wrong value is refused BY NAME (exit 2); a right value in another spelling is accepted and the witness carries the COMPUTED places; a line naming no field keeps today's reading`, wrong);
  // THE MUST's SCENE: a start line naming ANOTHER account's uid — refused; RED the check cut: the line is taken and the table OPENS against a witness
  const mustLine = { ...base, uid: OTHER_UID };
  const why = await M.signinWhy(mustLine, UID);
  ok(typeof why === 'string' && why.includes(`${OTHER_UID}`) && why.includes('not this process'), `another account's uid in the start line: a bad start BY NAME («${why}»)`);
  const cut = (from, to, label) => MUT.load('src/interface/main.js', anchored(MAIN_SRC, from, to, label), `main-${label}`);
  const Mu = cut("    if (signin.uid !== undefined && signin.uid !== own) return", "    if (false) return", 'uid-own-cut');
  const mu = install('walk-uid-red'); plantId(mu, 'vi-0a1b2c3d4e5f');
  const uhome = path.join(mu.base, 'process-home'), uw = path.join(uhome, '.vibespace', 'local', SW.witnessFileOf(mu.root));
  fs.mkdirSync(path.dirname(uw), { recursive: true, mode: 0o700 }); fs.writeFileSync(uw, J(SW.witnessDoc({ root: mu.root, dataDir: mu.data, id: 'vi-5f4e3d2c1b0a' })));
  const muLine = { file: mu.table, folder: mu.data, uid: OTHER_UID };
  const taken = await Mu.signinWhy(muLine, UID);
  const was = process.env.HOME; process.env.HOME = uhome;
  let tu; try { tu = tableOf(mu, { witness: { ...(await Mu.witnessFor(muLine)), scratch: { varTmp: path.join(mu.base, 'vartmp') } } }); await tu.load(); } finally { process.env.HOME = was; }
  ok(taken === null && !!tu.held && tu.held.kind === 'folder', 'RED CONTROL: the uid check cut — the line is TAKEN, and the table STILL HOLDS: the places are this process\'s own, the line\'s uid moves no place (r3926: the claim is only compared)');
  const reds = [
    ['home-own-cut', "    if (signin.home !== undefined && (await realForm(signin.home)) !== (await realForm(os.homedir()))) return", "    if (false) return", { ...base, home: it.home }],
    ['root-own-cut', "    if (signin.root !== undefined && (await realForm(signin.root)) !== at.root) return", "    if (false) return", { ...base, root: other.root }],
    ['folder-own-cut', "    if ((await folderForm(signin.folder)) !== at.folder) return", "    if (false) return", { file: it.table, folder: other.data }],
    ['stray-cut', "    if (stray.length) return", "    if (false) return", { file: it.table, root: it.root, uid: UID }],
  ];
  const acceptedCut = [];
  for (const [label, from, to, line] of reds) if ((await cut(from, to, label).signinWhy(line, UID)) === null) acceptedCut.push(label);
  ok(acceptedCut.length === reds.length, `RED CONTROL: each check cut, its wrong value is TAKEN (${acceptedCut.join(', ')})`);
  // what the start TOOK is said once — a defaulted home and uid, a throwaway start
  const said = (re) => lines.filter((l) => re.test(l)).length;
  const sd = install('walk-said'); plantId(sd, 'vi-0c1d2e3f4a5b'); lines.length = 0;
  const td = tableOf(sd, { witness: { ...(await M.witnessFor({ file: sd.table, folder: sd.data })), scratch: { varTmp: path.join(sd.base, 'vartmp') } } }); await td.load(); await td.ensure({});
  const st = install('walk-throwaway'); plantId(st, 'vi-0d1e2f3a4b5c');
  const tt = tableOf(st, { witness: witnessCfg(st, { throwaway: true }) }); await tt.load();
  const placesSaid = said(/the sign-in witness is read at this process's own places — the data folder .* the uid \d+ \(a folder, root, home or uid the start line names is compared, never used\)/);   // counted AFTER the throwaway table too: a throwaway start says no places line (主开发 r3969 (1))
  ok(placesSaid === 1 && said(/a throwaway start \(signin\.throwaway\): no sign-in witness is read or written/) === 1,
    'what the start took is SAID ONCE in the journal: the places it read (this process\'s own data folder, home and uid), and a throwaway start (no witness read) — which says NO places line (r3969: the two never contradict)', lines.slice(-4));
  ok(!SIGNIN_SRC.includes("'required'"), 'src/interface/signin.js spells no value of the declaration (the stand-in environment is gone; the cell is the shared module\'s)');   // stale-pins: kept — a deliberate absence check
}

console.log('⑩ 主开发 r3926: the start line\'s values are CLAIMS, never places — every place is computed by this process from the table\'s own folder');
{
  const MAIN_SRC = fs.readFileSync(path.join(REPO, 'src/interface/main.js'), 'utf-8');
  const OLD = 'vi-1a2b3c4d5e6f', NOW = 'vi-6f5e4d3c2b1a';
  const SPELLINGS = [
    ['a root with a trailing slash', (it) => ({ file: it.table, folder: it.data, root: `${it.root}/` })],
    ['a folder with a dot segment and no root', (it) => ({ file: it.table, folder: `${it.root}/./data` })],
    ['a folder with a trailing slash', (it) => ({ file: it.table, folder: `${it.data}/` })],
  ];
  /** the replaced folder's scene: its own id, the table LOST, a witness of ANOTHER folder at this process's home (a scratch HOME) */
  const scene = async (name, lineOf, Mm = M) => {
    const it = install(name); plantId(it, NOW);
    const home = path.join(it.base, 'process-home'), hw = path.join(home, '.vibespace', 'local', SW.witnessFileOf(it.root));
    fs.mkdirSync(path.dirname(hw), { recursive: true, mode: 0o700 }); fs.writeFileSync(hw, J(SW.witnessDoc({ root: it.root, dataDir: it.data, id: OLD })));
    const line = lineOf(it), why = await Mm.signinWhy(line, UID), w = await Mm.witnessFor(line);
    const was = process.env.HOME; process.env.HOME = home;
    let t; try { t = tableOf(it, { witness: { ...w, scratch: { varTmp: path.join(it.base, 'vartmp') } } }); await t.load(); } finally { process.env.HOME = was; }
    return { why, held: t.held ? { kind: t.held.kind, unread: !!t.held.unread } : null, idNow: idIn(it.id) };
  };
  const got = []; for (const [label, lineOf] of SPELLINGS) got.push([label, await scene(`spell-${got.length}`, lineOf)]);
  ok(got.every(([, g]) => g.why === null && g.held && g.held.kind === 'folder' && !g.held.unread && g.idNow === NOW),
    `each right value in another spelling is TAKEN, and the table is HELD by the folder's own words (another folder's witness at this process's home), never open, nothing minted — ${got.map(([l, g]) => `${l}: ${g.held ? g.held.kind + (g.held.unread ? ' (unread)' : '') : 'OPEN'}`).join('; ')}`, got);
  const RAW = MUT.load('src/interface/main.js', anchored(MAIN_SRC, '  return witnessOf(at, signin);', '  return witnessOf({ folder: signin.folder, root: signin.root || path.dirname(signin.folder) }, signin);', 'raw-text'), 'main-raw-text');
  const red = []; for (const [label, lineOf] of SPELLINGS) red.push([label, await scene(`spell-red-${red.length}`, lineOf, RAW)]);
  ok(!red[0][1].held && !red[1][1].held && !!red[2][1].held && red[2][1].held.unread,
    `RED CONTROL: the line's raw text handed on as the places — the two first spellings name another witness file and the start OPENS, the third finds the file and holds by a word that misleads («not this folder's witness») — ${red.map(([l, g]) => `${l}: ${g.held ? g.held.kind + (g.held.unread ? ' (unread)' : '') : 'OPEN'}`).join('; ')}`, red);
  // the facts' builder names no field of the line but the two marks; the table's facts read no home, uid or place of the line
  const builder = (MAIN_SRC.split('\n').find((l) => l.startsWith('const witnessOf = ')) || '');
  const marksOnly = /^const witnessOf = \(places, \{ throwaway, declared \} = \{\}\) => \(\{ folder: places\.folder, root: places\.root, throwaway: throwaway === true, declared: declared === true \}\);$/.test(builder);
  const bodyOf = (name) => { const i = MAIN_SRC.indexOf(`async function ${name}(`); return i < 0 ? '' : MAIN_SRC.slice(i, MAIN_SRC.indexOf('\n}\n', i)); };
  const placesBody = bodyOf('placesOf'), forBody = bodyOf('witnessFor');
  const lineValues = (t) => [...t.matchAll(/signin\.(\w+)/g)].map((m) => m[1]);
  // 主开发 r3969 (3): no value of the line stands in the two bodies that compute and hand the places — placesOf names nothing of the line,
  // witnessFor only the table's file (to compute) and the folder's presence (the switch); the marks reach witnessOf, which takes two
  const bodiesClean = placesBody.length > 0 && forBody.length > 0 && !/\bsignin\b/.test(placesBody) && JSON.stringify([...new Set(lineValues(forBody))].sort()) === JSON.stringify(['file', 'folder']) && /signin\.folder === undefined/.test(forBody);
  const seamFirst = SIGNIN_SRC.includes('SW.startFactsSync({ ...(witness.scratch || {}), dataDir: witness.folder, root: witness.root,');
  const handedOnce = MAIN_SRC.includes('witness: await witnessFor(line.signin, judged.places)') && (MAIN_SRC.match(/await placesOf\(/g) || []).length === 2;
  ok(bodiesClean && seamFirst && handedOnce, `the two bodies that compute and hand the places name no value of the line (placesOf: none; witnessFor: ${[...new Set(lineValues(forBody))].join(', ')}); the suite's seam is spread FIRST (it overrides no computed place or mark); the start hands its judge's places on (computed once)`, { forBody: forBody.slice(0, 300) });
  ok(marksOnly && !/signin\./.test(builder) && !/witness\.(home|uid|varTmp)\b/.test(SIGNIN_SRC) && MAIN_SRC.includes('  return witnessOf(at, signin);'),
    'the facts\' builder (src/interface/main.js witnessOf) takes the COMPUTED places and the line\'s two marks only; the table\'s facts read no home, uid or place of the line (only a suite\'s scratch seam)', builder.slice(0, 200));
}

console.log('⑪ 主开发 r3969 (2): PARITY — the places the piped form computes are the plain form\'s, for the same install');
{
  const MAIN_SRC = fs.readFileSync(path.join(REPO, 'src/interface/main.js'), 'utf-8');
  /** THE PLAIN FORM's places: server.js hands Auth path.join(__dirname, 'data') — __dirname is node's REAL path of the install — and
   *  startFactsSync takes its root as that folder's parent (src/signin-witness.js, the facts both forms read) */
  const plainOf = (installReal, sc) => { const f = SW.startFactsSync({ dataDir: path.join(installReal, 'data'), home: sc, varTmp: sc, env: {}, mountinfo: '' }); return { folder: f.dataDir, root: f.root }; };
  /** three installs: a plain root; the SAME root reached through a link (the table named by the link's path); a data folder that is a link */
  const installs = () => {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(ROOT, 'parity-'))), sc = path.join(base, 'scratch'); fs.mkdirSync(sc);
    const plain = path.join(base, 'plain'); fs.mkdirSync(path.join(plain, 'data'), { recursive: true });
    const real = path.join(base, 'real'); fs.mkdirSync(path.join(real, 'data'), { recursive: true }); const via = path.join(base, 'via'); fs.symlinkSync(real, via);
    const dl = path.join(base, 'dl'), dt = path.join(base, 'data-elsewhere'); fs.mkdirSync(dl); fs.mkdirSync(dt); fs.symlinkSync(dt, path.join(dl, 'data'));
    return { sc, cases: [['a plain root', plain, path.join(plain, 'data', 'auth.json')], ['a root reached through a link', real, path.join(via, 'data', 'auth.json')], ['a data folder that is a link', dl, path.join(dl, 'data', 'auth.json')]] };
  };
  const compare = async (Mm) => { const { sc, cases } = installs(), out = []; for (const [label, installReal, file] of cases) { const p = await Mm.placesOf(file), q = plainOf(installReal, sc); out.push({ label, same: p.folder === q.folder && p.root === q.root, piped: p, plain: q }); } return out; };
  const got = await compare(M);
  ok(got.every((g) => g.same), `the piped form's places equal the plain form's for the same install — ${got.map((g) => `${g.label}: ${g.same ? 'the same' : 'DIFFER'}`).join('; ')}`, got.filter((g) => !g.same));
  const DRIFT = MUT.load('src/interface/main.js', anchored(MAIN_SRC, '  return { folder: path.join(root, path.basename(folderRaw)), root };', '  return { folder: await fsp.realpath(folderRaw), root };', 'places-drift'), 'main-places-drift');
  const drift = await compare(DRIFT);
  ok(!drift[2].same && drift[0].same, `RED CONTROL: a piped form that also resolves the data folder's own link — the parity leg names the drift (${drift.map((g) => `${g.label}: ${g.same ? 'the same' : 'DIFFER'}`).join('; ')})`, drift[2]);
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
