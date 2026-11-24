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
  const base = path.join(ROOT, name), root = path.join(base, 'root'), data = path.join(root, 'data'), home = path.join(base, 'home');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  return { base, root, data, home, table: path.join(data, 'auth.json'), id: path.join(data, SW.INSTANCE_FILE) };
}
const witnessCfg = (it, extra = {}) => ({ folder: it.data, root: it.root, home: it.home, uid: UID, throwaway: false, declared: false, varTmp: path.join(it.base, 'vartmp'), ...extra });   // varTmp: the install's own scratch rung (never the machine's /var/tmp)
const homeWitness = (it) => path.join(it.home, '.vibespace', 'local', SW.witnessFileOf(it.root));
const lines = [];
const log = { log: () => { }, warn: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) };
const tableOf = (it, { witness = witnessCfg(it), Mod = SI } = {}) => Mod.create({ file: it.table, log, witness });
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
  ok(!t2.held && lines.some((l) => /names no data folder/.test(l)), 'RED CONTROL (an older supervisor\'s line: no folder named) — today\'s reading, BY NAME: it opens, and the journal says why once', { held: t2.held, lines });
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
  ok(!t.held && !t.enabled && SW.ID_RE.test(String(idIn(it.id))) && !fs.existsSync(homeWitness(it)), `a new instance opens as before; its id written once (${idIn(it.id)}); no witness with no password`);
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
}

console.log('⑥ the declaration: named in the start line — never read from the environment');
{
  const it = install('declared'); const t = tableOf(it, { witness: witnessCfg(it, { declared: true }) }); await t.load(); await t.ensure({});
  ok(!!t.held && t.held.kind === 'declared', 'declared in the line, no password: HELD «declared»', t.held);
  const was = process.env.VIBESPACE_SIGNIN; process.env.VIBESPACE_SIGNIN = 'required';
  let tn; try { const n = install('declared-env'); tn = tableOf(n); await tn.load(); await tn.ensure({}); } finally { if (was === undefined) delete process.env.VIBESPACE_SIGNIN; else process.env.VIBESPACE_SIGNIN = was; }
  ok(!tn.held, 'VIBESPACE_SIGNIN=required in the ENVIRONMENT and not in the line: not held — the interface reads no environment for sign-in');
}

console.log('⑦ the start line\'s named fields, judged by name (src/interface/main.js), additive');
{
  const it = install('line'), base = { file: it.table };
  const bad = await M.signinWhy({ ...base, folder: 'relative/data' }, UID), badUid = await M.signinWhy({ ...base, folder: it.data, uid: 'x' }, UID), good = await M.signinWhy({ ...base, folder: it.data, root: it.root, home: it.home, uid: UID, throwaway: false, declared: false }, UID), older = await M.signinWhy(base, UID);
  ok(/not an absolute path/.test(String(bad)) && /not a whole number/.test(String(badUid)) && good === null && older === null && M.witnessOf(base) === null && M.witnessOf({ ...base, folder: it.data }).root === it.root, 'a relative folder or a uid that is no number: a bad start BY NAME; the fields well named, or none at all (an older supervisor): accepted', { bad, badUid, good, older });
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
