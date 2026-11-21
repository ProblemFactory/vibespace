#!/usr/bin/env node
// test-rewind-kept (fast, in-process — row B-437e, the files tier: THE KEPT COPY; 主开发 r1247 (2), r1304, r1327):
// src/rewind-kept.js (PURE), src/server/rewind-kept-door.js and its worker src/server/rewind-keep-worker.js (its ops run inline here)
//   ① THE DECISIONS — the keep's plan and its bounds (64 files, 32 MiB a file, 256 MiB a press, 1 GiB a machine), the kinds (a link
//      kept as a link; a folder, a device: cannot keep), the read-back (this hub: sha256; a paired machine: the size), the sweep
//      (only its own mark; the later of the mark's time and the folder's), the put-back's plan (named before it acts; a changed
//      kept copy refused)
//   ② THIS HUB — real files in a scratch folder: the press folder 0700, each kept file 0600, the original's mode recorded; a copy
//      whose read-back differs = no press (and no folder left); the kept copies full = no press; the sweep spares an unmarked folder;
//      the put-back keeps first, then puts back bytes and mode; a changed kept file refused by name
//   ③ A PAIRED MACHINE — a stand-in agent with the agent's own file semantics (stat follows links; copy never overwrites; no lstat):
//      the copies on that machine, the manifest at the hub too, «checked by size»; a kept copy shorter than its original = no press;
//      a kept file changed after the keep = the put-back refuses that row; an agent without fs-portable = «upgrade the agent»
//   the reader's round: the person's own string stamp on every device act; the total and the sweep are the MACHINE's; the put-back
//   fenced like a press (and holding its mark); a relative path never kept; the mark first; a temp a cut-short act left removed;
//   the put-back's own press spared from its sweep; a policy refusal named
//   RED CONTROLS (anchored copies): no hash compare, no size compare, the sweep without its mark, the total bound off, the put-back
//   without keeping first, the put-back unfenced, relative paths kept
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const K = require(path.join(REPO, 'src/rewind-kept.js'));
const KD = require(path.join(REPO, 'src/server/rewind-kept-door.js'));
const W = require(path.join(REPO, 'src/server/rewind-keep-worker.js'));
const { ok, report } = checker();
const M = mutantCopies('rewind-kept', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'src/rewind-kept.js'), 'utf8'), DSRC = fs.readFileSync(path.join(REPO, 'src/server/rewind-kept-door.js'), 'utf8');
const HUMAN = Object.freeze({ kind: 'human', actBy: null });
const MiB = 1024 * 1024, DAY = 24 * 3600 * 1000;
const T0 = Date.parse('2026-11-21T09:00:00.000Z');
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-kept-'));
process.on('exit', () => { try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch { } });
const call = (op, payload) => Promise.resolve().then(() => W.runOp(op, payload).result);   // the worker's own ops, inline
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

console.log('— ① the decisions');
{
  const F = (p, mode, size, extra = {}) => ({ path: p, mode, size, mtimeMs: T0, ...extra });
  const plan = K.keepPlanOf([F('/w/a.js', 0o100644, 10), F('/w/l', 0o120777, 4, { link: 'a.js' }), { path: '/w/gone', absent: true }]);
  ok(plan.ok && plan.rows.length === 3 && plan.rows[0].kind === 'file' && plan.rows[0].mode === 0o644 && plan.rows[1].kind === 'link' && plan.rows[1].link === 'a.js' && plan.rows[2].kind === 'absent' && plan.rows[2].existed === false && plan.bytes === 10,
    '① a file (its mode kept to restore), a LINK kept as a link (its target, never followed), a path absent now (put back: removed): one plan', plan);
  const no = (facts, opts) => K.keepPlanOf(facts, opts).refusals.map((r) => r.why);
  const NO = [['a file over 32 MiB', no([F('/w/big', 0o100644, 32 * MiB + 1)]), 'too-large'], ['a folder', no([F('/w/d', 0o040755, 0)]), 'folder'], ['a device', no([F('/dev/x', 0o020644, 0)]), 'device'],
    ['an unreadable path', no([{ path: '/w/x', error: 'EACCES' }]), 'unreadable'], ['a relative path (read against the hub\'s own folder)', no([F('src/a.js', 0o100644, 1)]), 'relative-path'], ['a «~» path', no([F('~/a.js', 0o100644, 1)]), 'relative-path'], ['65 files', no(Array.from({ length: 65 }, (_, i) => F(`/w/f${i}`, 0o100644, 1))), 'too-many'],
    ['nine files of 30 MiB (270 MiB)', no(Array.from({ length: 9 }, (_, i) => F(`/w/m${i}`, 0o100644, 30 * MiB))), 'press-full'], ['2 KiB more than the 1 GiB a machine holds', no([F('/w/a', 0o100644, 2048)], { used: 1024 * MiB - 1024 }), 'kept-full']];
  ok(NO.every(([, got, want]) => got.includes(want)) && K.KEEP.maxFiles === 64 && K.KEEP.fileMax === 32 * MiB && K.KEEP.pressMax === 256 * MiB && K.KEEP.totalMax === 1024 * MiB && K.KEEP.lifeMs === 7 * DAY,
    `① «cannot keep a copy», each by name: ${NO.map(([n, , w]) => `${n} ⇒ ${w}`).join(' · ')} (the bounds: 64 files, 32 MiB, 256 MiB a press, 1 GiB a machine — r1327 — 7 days)`, NO);
  const pp = K.keepPlanOf([F('/w/a.js', 0o100644, 10)], { paired: true });
  ok(pp.ok && pp.rows[0].kind === 'not-known', '① a paired machine (its stat follows links): the kind is «not known (a paired machine)» (r1327)', pp.rows);
  const rows = plan.rows;
  const good = { 0: { ok: true, sha256: 'a'.repeat(64), srcSha256: 'a'.repeat(64), size: 10 }, 1: { ok: true, link: 'a.js' } };
  const bad = { ...good, 0: { ...good[0], sha256: 'b'.repeat(64) } }, short = { 0: { ok: true, size: 9, srcSize: 10 } }, same = { 0: { ok: true, size: 10, srcSize: 10 } };
  ok(K.readBackOf(rows, good).ok && K.readBackOf(rows, bad).refusals[0].why === 'not-kept' && !K.readBackOf(rows, { ...good, 1: { ok: true, link: 'b.js' } }).ok && K.readBackOf(rows, { 0: { ok: false, timedOut: true }, 1: good[1] }).refusals[0].why === 'no-time'
    && K.readBackOf(pp.rows, same, { paired: true }).ok && !K.readBackOf(pp.rows, short, { paired: true }).ok,
    '① THE READ-BACK: this hub — the copy\'s sha256 against the original\'s (read in the same pass), a link\'s target; a paired machine — the copy\'s size against the original\'s (r1327: no byte crosses the link); a copy past its bound: no-time');
  const mark = (name, at) => ({ kind: K.MARK_KIND, press: name, at });
  const old = K.pressIdOf(T0 - 9 * DAY, '0000000a'), young = K.pressIdOf(T0 - 1 * DAY, '0000000b'), back = K.pressIdOf(T0 - 9 * DAY, '0000000c'), foreign = K.pressIdOf(T0 - 9 * DAY, '0000000d'), bare = K.pressIdOf(T0 - 9 * DAY, '0000000e');
  const swept = K.sweepOf([{ name: old, mark: mark(old, T0 - 9 * DAY), folderMtimeMs: T0 - 9 * DAY }, { name: young, mark: mark(young, T0 - DAY), folderMtimeMs: T0 - DAY },
    { name: back, mark: mark(back, T0 - 9 * DAY), folderMtimeMs: T0 - DAY }, { name: foreign, mark: mark(old, T0 - 9 * DAY), folderMtimeMs: T0 - 9 * DAY }, { name: bare, mark: null, folderMtimeMs: T0 - 9 * DAY }, { name: 'notes', mark: mark('notes', 0), folderMtimeMs: 0 }], T0);
  ok(JSON.stringify(swept) === JSON.stringify([old]), '① THE SWEEP (r1304 (v)): only a press folder past seven days carrying ITS OWN mark — counted from the LATER of the mark\'s time and the folder\'s (a folder touched a day ago stays); unmarked, foreign-marked, other names: never', swept);
  const man = K.manifestOf({ conv: 'c1', press: old, at: T0, rows, back: good });
  const cur = { '/w/a.js': { mode: 0o100644, size: 12, mtimeMs: T0 + 5 }, '/w/l': { mode: 0o120777, link: 'a.js' }, '/w/gone': { mode: 0o100644, size: 3, mtimeMs: T0 + 5 } };
  const kept = { 0: { sha256: 'a'.repeat(64) }, 1: { link: 'a.js' } };
  const pb = K.putBackPlanOf(man, cur, kept).map((r) => `${r.path}:${r.act}`);
  const pb2 = K.putBackPlanOf(man, { ...cur, '/w/a.js': { absent: true } }, { ...kept, 0: { sha256: 'c'.repeat(64) } }).map((r) => `${r.act}${r.why ? ':' + r.why : ''}`);
  const pman = K.manifestOf({ conv: 'c1', press: old, at: T0, rows: pp.rows, paired: true, back: { 0: { ok: true, size: 10, mtimeMs: T0 + 1, srcSize: 10 } } });
  const pb3 = K.putBackPlanOf(pman, { '/w/a.js': { mode: 0o100644, size: 12, mtimeMs: T0 + 9 } }, { 0: { size: 10, mtimeMs: T0 + 2 } }).map((r) => `${r.act}${r.why ? ':' + r.why : ''}`);
  console.log(`    (put-back plans: ${JSON.stringify({ pb, pb2, pb3 })})`);
  ok(JSON.stringify(pb) === '["/w/a.js:overwrite","/w/l:unchanged","/w/gone:remove"]' && JSON.stringify(pb2) === '["refused:kept-changed","unchanged","remove"]' && JSON.stringify(pb3) === '["refused:kept-changed"]' && man.check === 'sha256' && pman.check === 'size',
    '① THE PUT-BACK names each path\'s act BEFORE it acts (r1304 (iv)): overwritten, unchanged, removed (it did not exist then), created; a kept copy that no longer matches its manifest — this hub by its hash, a paired machine by its size and time — is REFUSED by name');
  ok([K.KEEP, K.KEEP_WHY, K.PUT_BACK_ACTS].every(Object.isFrozen) && K.DIR_MODE === 0o700 && K.FILE_MODE === 0o600, '① the tables frozen; the modes: the press folder 0700, each kept file 0600 (r1304 (iii))');
}

console.log('— ② this hub');
const KA = (root) => ({ dataRoot: root, call });
{
  const root = fs.mkdtempSync(path.join(SCRATCH, 'hub-')), work = fs.mkdtempSync(path.join(SCRATCH, 'work-'));
  const a = path.join(work, 'a.txt'), l = path.join(work, 'l.txt'), gone = path.join(work, 'gone.txt');
  fs.writeFileSync(a, 'the person\'s words\n'); fs.chmodSync(a, 0o644); fs.symlinkSync('a.txt', l);
  const r = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-1', files: [a, l, gone], by: HUMAN, now: T0, hex8: '0000aaaa', ...KA(root) });
  const dir = r.where, man = r.ok ? JSON.parse(fs.readFileSync(path.join(dir, K.MANIFEST_FILE), 'utf8')) : null;
  const st = (p) => fs.lstatSync(p).mode & 0o7777;
  console.log(`    (kept: ${JSON.stringify(r)} · folder ${r.ok ? st(dir).toString(8) : '-'} · file ${r.ok ? st(path.join(dir, '0.bin')).toString(8) : '-'})`);
  ok(r.ok && dir === path.join(root, 'conv-1', 'rewind-kept', K.pressIdOf(T0, '0000aaaa')) && st(dir) === 0o700 && st(path.join(dir, '0.bin')) === 0o600 && man.files[0].mode === 0o644 && man.files[0].sha256 === sha(fs.readFileSync(a))
    && fs.lstatSync(path.join(dir, '1.bin')).isSymbolicLink() && fs.readlinkSync(path.join(dir, '1.bin')) === 'a.txt' && man.files[2].existed === false && fs.existsSync(path.join(dir, K.MARK_FILE)) && man.check === 'sha256',
    '② a keep on this hub: the conversation\'s own folder under the hub\'s data, the press folder 0700, the kept file 0600 (the original\'s 0644 recorded), its sha256 the original\'s; the link kept AS A LINK; the absent path recorded; sealed with its mark');
  const lying = (op, p) => call(op, p).then((x) => (op === 'keepOne' && x.sha256 ? { ...x, sha256: '0'.repeat(64) } : x));
  const r2 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-1', files: [a], by: HUMAN, now: T0 + 1000, hex8: '0000bbbb', dataRoot: root, call: lying });
  ok(!r2.ok && r2.refusals[0].why === 'not-kept' && !fs.existsSync(path.join(root, 'conv-1', 'rewind-kept', K.pressIdOf(T0 + 1000, '0000bbbb'))), '② A COPY WHOSE READ-BACK DIFFERS = NO PRESS, and its unsealed folder is removed', r2);
  const fullRoot = fs.mkdtempSync(path.join(SCRATCH, 'full-')), fullName = K.pressIdOf(T0 - DAY, '0000cccc'), fullDir = path.join(fullRoot, 'conv-2', 'rewind-kept', fullName);
  fs.mkdirSync(fullDir, { recursive: true }); fs.writeFileSync(path.join(fullDir, K.MANIFEST_FILE), JSON.stringify({ files: [{ size: 1024 * MiB - 4 }] })); fs.writeFileSync(path.join(fullDir, K.MARK_FILE), JSON.stringify({ kind: K.MARK_KIND, press: fullName, at: T0 - DAY }));
  const r3 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-2', files: [a], by: HUMAN, now: T0, hex8: '0000dddd', ...KA(fullRoot) });
  const c3 = await KD.keepableOf({ session: { mode: 'chat' }, conv: 'conv-2', files: [a], by: HUMAN, now: T0, ...KA(fullRoot) });
  ok(!r3.ok && r3.refusals.some((x) => x.why === 'kept-full') && !c3.ok && c3.refusals.some((x) => x.why === 'kept-full') && fs.existsSync(fullDir), '② THE KEPT COPIES FULL (1 GiB a machine) = NO PRESS, said in the confirm too; nothing is removed early to make room (r1304 (i))', { r3, c3 });
  const sw = path.join(root, 'conv-1', 'rewind-kept'), oldM = K.pressIdOf(T0 - 9 * DAY, '0000eeee'), oldU = K.pressIdOf(T0 - 9 * DAY, '0000ffff');
  for (const n of [oldM, oldU]) { fs.mkdirSync(path.join(sw, n)); fs.writeFileSync(path.join(sw, n, '0.bin'), 'x'); }
  fs.writeFileSync(path.join(sw, oldM, K.MARK_FILE), JSON.stringify({ kind: K.MARK_KIND, press: oldM, at: T0 - 9 * DAY }));
  for (const n of [oldM, oldU]) fs.utimesSync(path.join(sw, n), new Date(T0 - 9 * DAY), new Date(T0 - 9 * DAY));
  fs.mkdirSync(path.join(sw, 'notes')); fs.utimesSync(path.join(sw, 'notes'), new Date(T0 - 9 * DAY), new Date(T0 - 9 * DAY));
  const r4 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-1', files: [a], by: HUMAN, now: T0 + 2000, hex8: '00001111', ...KA(root) });
  ok(r4.ok && JSON.stringify(r4.swept) === JSON.stringify([oldM]) && !fs.existsSync(path.join(sw, oldM)) && fs.existsSync(path.join(sw, oldU)) && fs.existsSync(path.join(sw, 'notes')),
    '② THE SWEEP at a keep: the old press folder carrying its own mark is removed; an unmarked one of the same age and a folder of another name are never touched', r4.swept);
  fs.writeFileSync(a, 'the agent\'s words, after the rewind\n'); fs.chmodSync(a, 0o600); fs.writeFileSync(gone, 're-created');
  const plan = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-1', press: r.press, by: HUMAN, dryRun: true, now: T0 + 3000, hex8: '00002222', ...KA(root) });
  const did = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-1', press: r.press, by: HUMAN, expect: plan.rows, now: T0 + 3000, hex8: '00002222', ...KA(root) });
  const firstKept = did.kept ? JSON.parse(fs.readFileSync(path.join(did.kept.where, K.MANIFEST_FILE), 'utf8')) : null;
  console.log(`    (put-back: plan ${JSON.stringify(plan.rows.map((x) => x.act))} · done ${JSON.stringify(did.rows && did.rows.map((x) => [x.act, x.done]))})`);
  ok(plan.ok && JSON.stringify(plan.rows.map((x) => x.act)) === '["overwrite","unchanged","remove"]' && did.ok && fs.readFileSync(a, 'utf8') === 'the person\'s words\n' && (fs.statSync(a).mode & 0o777) === 0o644 && !fs.existsSync(gone)
    && !!firstKept && firstKept.files.some((f) => f.path === a && f.sha256 === sha('the agent\'s words, after the rewind\n')) && !fs.readdirSync(work).some((n) => n.endsWith('.vs-tmp')),
    '② PUT MY FILES BACK: its plan named first (overwritten, unchanged, removed); what stood there was KEPT FIRST (its own press); then the bytes and the mode put back, the re-created file removed — by a temp name renamed over (none left)');
  fs.writeFileSync(path.join(r.where, '0.bin'), 'tampered');
  const ch = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-1', press: r.press, by: HUMAN, dryRun: true, ...KA(root) });
  const who = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-1', press: r.press, by: { kind: 'agent' }, dryRun: true, ...KA(root) });
  ok(ch.ok && ch.rows[0].act === 'refused' && ch.rows[0].why === 'kept-changed' && !who.ok && who.reason === 'not-the-person', '② a kept file changed after the keep: the put-back REFUSES that row by name; anyone but the person: refused', { ch: ch.rows, who });
  // THE MACHINE's total and sweep (the reader's MAJOR 2): every conversation's press folders count, and each keep sweeps them all
  const other = K.pressIdOf(T0 - 9 * DAY, '0000a1a1'), otherDir = path.join(fullRoot, 'conv-9', 'rewind-kept', other);
  fs.mkdirSync(otherDir, { recursive: true }); fs.writeFileSync(path.join(otherDir, K.MARK_FILE), JSON.stringify({ kind: K.MARK_KIND, press: other, at: T0 - 9 * DAY })); fs.utimesSync(otherDir, new Date(T0 - 9 * DAY), new Date(T0 - 9 * DAY));
  const r5 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-3', files: [a], by: HUMAN, now: T0, hex8: '0000a2a2', ...KA(fullRoot) });
  ok(!r5.ok && r5.refusals.some((x) => x.why === 'kept-full') && !fs.existsSync(otherDir) && fs.existsSync(fullDir), '② THE TOTAL AND THE SWEEP ARE THE MACHINE\'S: another conversation\'s 1 GiB refuses this one\'s keep; this keep swept another conversation\'s old marked press (its own mark), the young one stays', r5);
  // A RELATIVE PATH is never kept (the reader's MAJOR 4): it would be read against the hub's own folder
  const r6 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-1', files: ['a.txt'], by: HUMAN, now: T0 + 4000, hex8: '0000a3a3', ...KA(root) });
  ok(!r6.ok && r6.refusals[0].why === 'relative-path' && !fs.existsSync(path.join(root, 'conv-1', 'rewind-kept', K.pressIdOf(T0 + 4000, '0000a3a3'))), '② a relative listed path: «cannot keep a copy» (relative-path), so the press is refused; the opened folder removed', r6);
  // THE PUT-BACK IS FENCED (the reader's MAJOR 3): no running turn, no rewind out — and it holds the files mark while it acts
  const RQ = require(path.join(REPO, 'src/server/rewind-requests.js'));
  const plan2 = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-1', press: r4.press, by: HUMAN, dryRun: true, ...KA(root) });
  const busy = await KD.putBack({ session: { mode: 'chat', _isStreaming: true, _turnState: 'running' }, conv: 'conv-1', press: r4.press, by: HUMAN, expect: plan2.rows, ...KA(root) });
  const outS = { mode: 'chat' }; RQ.setFilesOut(outS, { id: 'x', at: Date.now(), files: true });
  const out = await KD.putBack({ session: outS, conv: 'conv-1', press: r4.press, by: HUMAN, expect: plan2.rows, ...KA(root) }); RQ.setFilesOut(outS, null);
  let seen = null; const watchS = { mode: 'chat' };
  const spy = (op, payload) => { if (op === 'putOne') seen = RQ.filesOutOf(watchS); return call(op, payload); };
  fs.writeFileSync(a, 'changed again\n');
  const plan3 = await KD.putBack({ session: watchS, conv: 'conv-1', press: r4.press, by: HUMAN, dryRun: true, dataRoot: root, call: spy });
  const did3 = await KD.putBack({ session: watchS, conv: 'conv-1', press: r4.press, by: HUMAN, expect: plan3.rows, now: T0 + 6000, hex8: '0000a4a4', dataRoot: root, call: spy });
  ok(!busy.ok && busy.reason === 'turn-running' && !out.ok && out.reason === 'pending' && did3.ok && !!seen && seen.files === true && RQ.filesOutOf(watchS) === null,
    '② THE PUT-BACK IS FENCED like a press: a running turn, a rewind out — refused; while it acts it holds the files mark (a press, a confirm, the person\'s send wait), released after', { busy: busy.reason, out: out.reason, held: !!seen });
  // its own press spared from the keep-first's sweep (the reader's MINOR 4); a temp a cut-short act left is removed (MINOR 3)
  const oldPress = K.pressIdOf(T0 - 9 * DAY, '0000a5a5'), work2 = fs.mkdirSync(path.join(SCRATCH, 'w2'), { recursive: true }) || path.join(SCRATCH, 'w2'), b = path.join(work2, 'b.txt');
  fs.writeFileSync(b, 'b as it was\n');
  const rOld = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-4', files: [b], by: HUMAN, now: T0 - 9 * DAY, hex8: '0000a5a5', ...KA(root) });
  fs.utimesSync(path.join(root, 'conv-4', 'rewind-kept', oldPress), new Date(T0 - 9 * DAY), new Date(T0 - 9 * DAY));
  fs.writeFileSync(b, 'b changed\n');
  const cut = (op, payload) => (op === 'putOne' ? Promise.resolve().then(() => { fs.writeFileSync(`${payload.row.path}.${payload.press}.vs-tmp`, 'half'); throw Object.assign(new Error('the worker was ended at its deadline'), { safeFsTimeout: true }); }) : call(op, payload));
  const planOld = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-4', press: oldPress, by: HUMAN, dryRun: true, dataRoot: root, call: cut });
  const didOld = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-4', press: oldPress, by: HUMAN, expect: planOld.rows, now: T0 + 7000, hex8: '0000a6a6', dataRoot: root, call: cut });
  ok(rOld.ok && didOld.ok && didOld.rows[0].done === false && fs.existsSync(path.join(root, 'conv-4', 'rewind-kept', oldPress)) && !fs.readdirSync(work2).some((n) => n.endsWith('.vs-tmp')),
    '② a put-back of a press nine days old: its keep-first\'s sweep SPARES it; a put-back act cut short (the pool\'s deadline) leaves no temp beside the person\'s file', didOld.rows);
}

console.log('— ③ a paired machine (a stand-in agent with the agent\'s own file semantics)');
/** the agent's file actions over a scratch «device» (src/agentd/agentd.js FS_ACTIONS: stat FOLLOWS links, copy never overwrites) */
function standIn({ home, shortCopy = false, noPortable = false, deny = null } = {}) {
  const enoent = (p) => Object.assign(new Error(`ENOENT: no such file or directory, stat '${p}'`), { code: 'ENOENT' });
  const acts = [];
  // the client's ONE send point (src/agentd/client.js _request): an act without a valid string `by` is refused, never sent; a
  // policy that does not allow `files` refuses by name (src/device-policy.js op-not-allowed)
  const act = (name, by) => { if (typeof by !== 'string' || !/^human:[A-Za-z0-9]/.test(by)) throw Object.assign(new Error('act_without_by'), { code: 'act_without_by' }); if (deny === name) throw Object.assign(new Error('op-not-allowed: files'), { code: 'op-not-allowed' }); acts.push([name, by]); };
  return {
    acts,
    fsHome: async () => { if (noPortable) throw Object.assign(new Error('daemon lacks fs-portable (capabilities gate) -- upgrade the agent on this machine'), { code: 'host_needs_daemon' }); return { home }; },
    fsStat: async (p) => { let st; try { st = fs.statSync(p); } catch { throw enoent(p); } return { ok: true, stat: { size: st.size, mtimeMs: st.mtimeMs, isDir: st.isDirectory(), mode: st.mode } }; },
    fsList: async (p) => { let names; try { names = fs.readdirSync(p, { withFileTypes: true }); } catch { throw enoent(p); } return { path: p, entries: names.map((e) => { let st = null; try { st = fs.statSync(path.join(p, e.name)); } catch { } return { name: e.name, isDir: e.isDirectory(), size: st ? st.size : 0, mtimeMs: st ? st.mtimeMs : 0 }; }) }; },
    fsMkdir: async (p, { by } = {}) => { act('mkdir', by); fs.mkdirSync(p, { recursive: true }); return { ok: true }; },
    fsWrite: async (p, buf, { by } = {}) => { act('write', by); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); return { ok: true }; },
    fsCopy: async (p, to, { by } = {}) => { act('copy', by); fs.cpSync(p, to, { recursive: true, force: false, errorOnExist: false }); if (shortCopy && fs.statSync(to).isFile()) fs.truncateSync(to, Math.max(0, fs.statSync(to).size - 1)); return { ok: true }; },
    fsRename: async (p, to, { by } = {}) => { act('rename', by); fs.renameSync(p, to); return { ok: true }; },
    fsRm: async (p, recursive = false, { by } = {}) => { act('rm', by); fs.rmSync(p, { recursive: !!recursive, force: true }); return { ok: true }; },
  };
}
{
  const home = fs.mkdtempSync(path.join(SCRATCH, 'device-')), hubRoot = fs.mkdtempSync(path.join(SCRATCH, 'hub2-')), work = fs.mkdtempSync(path.join(SCRATCH, 'dwork-'));
  const a = path.join(work, 'a.txt'), l = path.join(work, 'l.txt');
  fs.writeFileSync(a, 'on the paired machine\n'); fs.symlinkSync('a.txt', l);
  const dm = standIn({ home }), session = { mode: 'chat', host: 'h-2' }, BY = { kind: 'human', actBy: 'human:tester' };
  const r = await KD.keepFor({ session, conv: 'conv-p', files: [a, l], by: BY, now: T0, hex8: '0000a0a0', dataRoot: hubRoot, call, dm });
  const where = path.join(home, '.vibespace', 'agentd', 'rewind-kept', 'conv-p', K.pressIdOf(T0, '0000a0a0'));
  const hubMan = r.ok ? JSON.parse(fs.readFileSync(path.join(hubRoot, 'conv-p', 'rewind-kept', r.press, K.MANIFEST_FILE), 'utf8')) : null;
  console.log(`    (paired keep: ${JSON.stringify(r)} · agent acts ${JSON.stringify(dm.acts.map(([x]) => x))})`);
  ok(r.ok && r.where === where && r.machine === 'h-2' && r.check === 'size' && fs.readFileSync(path.join(where, '0.bin'), 'utf8') === 'on the paired machine\n' && fs.lstatSync(path.join(where, '1.bin')).isSymbolicLink()
    && !!hubMan && hubMan.check === 'size' && hubMan.files[0].kind === 'not-known' && hubMan.machine === 'h-2' && dm.acts.length > 0 && dm.acts.every(([, by]) => by === 'human:tester'),
    '③ a keep on a PAIRED machine: the copies ON that machine under the agent\'s own state, by its existing actions (each stamped with the person\'s own string `by` — the client refuses any other, the reader\'s MAJOR 1); «checked by size»; the kind «not known»; the device\'s own copy keeps a link as a link; the manifest sealed at the hub too');
  const shortDm = standIn({ home, shortCopy: true });
  const r2 = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: BY, now: T0 + 1000, hex8: '0000b0b0', dataRoot: hubRoot, call, dm: shortDm });
  ok(!r2.ok && r2.refusals[0].why === 'not-kept' && !fs.existsSync(path.join(home, '.vibespace', 'agentd', 'rewind-kept', 'conv-p', K.pressIdOf(T0 + 1000, '0000b0b0'))), '③ A KEPT COPY SHORTER THAN ITS ORIGINAL = NO PRESS (r1327), its folder removed', r2);
  fs.writeFileSync(a, 'after the rewind\n');
  const plan = await KD.putBack({ session, conv: 'conv-p', press: r.press, by: BY, dryRun: true, now: T0 + 5000, hex8: '0000c0c0', dataRoot: hubRoot, call, dm });
  const did = await KD.putBack({ session, conv: 'conv-p', press: r.press, by: BY, expect: plan.rows, now: T0 + 5000, hex8: '0000c0c0', dataRoot: hubRoot, call, dm });
  ok(did.ok && did.rows[0].act === 'overwrite' && did.rows[0].done === true && fs.readFileSync(a, 'utf8') === 'on the paired machine\n' && !!did.kept && !fs.readdirSync(work).some((n) => n.endsWith('.vs-tmp')),
    '③ the put-back on a paired machine: kept first, then the kept file copied to a temp name beside the path and renamed over it (the agent\'s copy never overwrites)', did.rows);
  fs.writeFileSync(path.join(where, '0.bin'), 'changed after the keep, longer');
  const ch = await KD.putBack({ session, conv: 'conv-p', press: r.press, by: BY, dryRun: true, dataRoot: hubRoot, call, dm });
  ok(ch.ok && ch.rows[0].act === 'refused' && ch.rows[0].why === 'kept-changed', '③ A KEPT FILE CHANGED AFTER THE KEEP: the put-back refuses that row by name (by its size and time — r1327)', ch.rows);
  const old = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: BY, now: T0, hex8: '0000d0d0', dataRoot: hubRoot, call, dm: standIn({ home, noPortable: true }) });
  const elsewhere = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-p', press: r.press, by: BY, dryRun: true, dataRoot: hubRoot, call });
  const denied = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: BY, now: T0 + 9000, hex8: '0000e0e0', dataRoot: hubRoot, call, dm: standIn({ home, deny: 'mkdir' }) });
  const noStamp = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: { kind: 'human', actBy: null }, now: T0 + 9500, hex8: '0000f0f0', dataRoot: hubRoot, call, dm: standIn({ home }) });
  ok(!old.ok && old.refusals[0].why === 'agent-too-old' && !elsewhere.ok && elsewhere.reason === 'stopped' && !denied.ok && denied.refusals[0].why === 'files-not-allowed' && noStamp.ok, '③ an agent without fs-portable: «cannot keep a copy: upgrade the agent»; a machine whose policy does not allow files: «cannot keep a copy: files not allowed»; a socket with no sign-in subject acts as the owner (human:owner); a paired press put back from anywhere but its machine\'s live conversation: refused', { old, elsewhere, denied, noStamp: noStamp.ok });
}

console.log('— red controls');
{
  const hubAt = (tag) => fs.mkdtempSync(path.join(SCRATCH, tag + '-'));
  const noHash = M.load('src/rewind-kept.js', anchored(SRC, ' && b.sha256 === b.srcSha256', '', 'kept: no hash compare'), 'no-hash');
  ok(noHash.readBackOf([{ n: 0, path: '/w/a', kind: 'file', size: 1 }], { 0: { ok: true, sha256: 'a'.repeat(64), srcSha256: 'b'.repeat(64), size: 1 } }).ok === true, 'RED CONTROL (no hash compare): a copy whose bytes differ reads kept');
  const noSize = M.load('src/rewind-kept.js', anchored(SRC, 'b.size === r.size && b.srcSize === r.size', 'true', 'kept: no size compare'), 'no-size');
  ok(noSize.readBackOf([{ n: 0, path: '/w/a', kind: 'not-known', size: 10 }], { 0: { ok: true, size: 9, srcSize: 10 } }, { paired: true }).ok === true, 'RED CONTROL (no size compare — a paired machine): a kept copy shorter than its original reads kept');
  const noMark = M.load('src/rewind-kept.js', anchored(SRC, ' && e.mark && e.mark.kind === MARK_KIND\n    && e.mark.press === e.name && Number.isFinite(e.mark.at) && Number.isFinite(e.folderMtimeMs) && Number(now) - Math.max(e.mark.at, e.folderMtimeMs) > lifeMs)', ' && Number.isFinite(e.folderMtimeMs) && Number(now) - e.folderMtimeMs > lifeMs)', 'kept: sweep without its mark'), 'no-mark');
  const n = K.pressIdOf(T0 - 9 * DAY, '0000abcd');
  ok(JSON.stringify(noMark.sweepOf([{ name: n, mark: null, folderMtimeMs: T0 - 9 * DAY }], T0)) === JSON.stringify([n]), 'RED CONTROL (the sweep without its mark): an unmarked press folder is removed');
  const noTotal = M.load('src/rewind-kept.js', anchored(SRC, "  if (Math.max(0, Number(used) || 0) + bytes > bounds.totalMax) refusals.push({ path: null, why: 'kept-full' });\n", '', 'kept: no total'), 'no-total');
  ok(noTotal.keepPlanOf([{ path: '/w/a', mode: 0o100644, size: 2048, mtimeMs: T0 }], { used: 1024 * MiB }).ok === true, 'RED CONTROL (the total bound off): a keep past 1 GiB a machine goes');
  const noFirst = M.load('src/server/rewind-kept-door.js', anchored(DSRC, '      kept = await keepFor({ session, conv, files: touch, hosts, by, now, spare: [press], ...opts });\n      if (!kept.ok) return', "      kept = { ok: true };\n      if (!kept.ok) return", 'kept: put-back without keeping first'), 'no-first');
  const root = hubAt('nf'), work = hubAt('nfw'), a = path.join(work, 'a.txt');
  fs.writeFileSync(a, 'v1');
  const r = await noFirst.keepFor({ session: { mode: 'chat' }, conv: 'c-nf', files: [a], by: HUMAN, now: T0, hex8: '0000eeee', ...KA(root) });
  fs.writeFileSync(a, 'v2 — the person\'s later words');
  const plan = await noFirst.putBack({ session: { mode: 'chat' }, conv: 'c-nf', press: r.press, by: HUMAN, dryRun: true, ...KA(root) });
  await noFirst.putBack({ session: { mode: 'chat' }, conv: 'c-nf', press: r.press, by: HUMAN, expect: plan.rows, now: T0 + 1, hex8: '0000ffff', ...KA(root) });
  const presses = fs.readdirSync(path.join(root, 'c-nf', 'rewind-kept'));
  ok(presses.length === 1 && fs.readFileSync(a, 'utf8') === 'v1', 'RED CONTROL (the put-back without keeping first): the person\'s later words are overwritten with no kept copy (one press folder only)');
  const unfenced = M.load('src/server/rewind-kept-door.js', anchored(DSRC, "  if (session && RQ.rewindStateOf(session).turnRunning) return { ok: false, reason: 'turn-running', cls: 'cannot' };\n", '', 'kept: put-back unfenced'), 'unfenced');
  const root2 = hubAt('uf'), w3 = hubAt('ufw'), c = path.join(w3, 'c.txt');
  fs.writeFileSync(c, 'c1');
  const rc = await unfenced.keepFor({ session: { mode: 'chat' }, conv: 'c-uf', files: [c], by: HUMAN, now: T0, hex8: '0000eeee', ...KA(root2) });
  fs.writeFileSync(c, 'c2 — the agent is writing');
  const pl = await unfenced.putBack({ session: { mode: 'chat' }, conv: 'c-uf', press: rc.press, by: HUMAN, dryRun: true, ...KA(root2) });
  const run = await unfenced.putBack({ session: { mode: 'chat', _isStreaming: true, _turnState: 'running' }, conv: 'c-uf', press: rc.press, by: HUMAN, expect: pl.rows, now: T0 + 1, hex8: '0000ffff', ...KA(root2) });
  ok(run.ok === true && fs.readFileSync(c, 'utf8') === 'c1', 'RED CONTROL (the put-back unfenced): during a running turn it writes over the file the agent is writing');
  const relKept = M.load('src/rewind-kept.js', anchored(SRC, "    if (!isAbsPath(path)) { refusals.push({ path, why: 'relative-path' }); return; }\n", '', 'kept: relative paths kept'), 'rel-kept');
  ok(relKept.keepPlanOf([{ path: 'src/a.js', absent: true }]).ok === true, 'RED CONTROL (relative paths kept): a relative listed path is planned (read against the hub\'s own folder)');
}

report();
