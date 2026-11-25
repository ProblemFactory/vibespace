#!/usr/bin/env node
// test-rewind-kept (fast, in-process — row B-437e, the files tier: THE KEPT COPY; 主开发 r1247 (2), r1304, r1327):
// src/rewind-kept.js (PURE), src/server/rewind-kept-door.js and its worker src/server/rewind-keep-worker.js (its ops run inline here)
//   ① THE DECISIONS — the keep's plan and its bounds (64 files, 32 MiB a file, 256 MiB a press, 1 GiB a machine), the kinds (a link,
//      a folder, a device: cannot keep — a link because the rewind writes THROUGH it), the read-back (this hub: sha256; a paired machine: the size), the sweep
//      (only its own mark; the later of the mark's time and the folder's), the put-back's plan (named before it acts; a changed
//      kept copy refused)
//   ② THIS HUB — real files in a scratch folder: the press folder 0700, each kept file 0600, the original's mode recorded; a copy
//      whose read-back differs = no press (and no folder left); the kept copies full = no press; the sweep spares an unmarked folder;
//      the put-back keeps first, then puts back bytes and mode; a changed kept file refused by name
//   ③ A PAIRED MACHINE — a stand-in agent with the agent's own file semantics (stat follows links and says `link`; copy never overwrites):
//      the copies on that machine, the manifest at the hub too, «checked by size»; a kept copy shorter than its original = no press;
//      a kept file changed after the keep = the put-back refuses that row; an agent without fs-portable = «upgrade the agent»
//   the reader's round: the person's own string stamp on every device act; the total and the sweep are the MACHINE's; the put-back
//   fenced like a press (and holding its mark); a relative path never kept; the mark first; a temp a cut-short act left removed;
//   the put-back's own press spared from its sweep; a policy refusal named
//   the round wqdnv452s: a LINK is never kept (this hub: its lstat; a paired machine: its agent's lstat, the copy's too); the kept
//   copies in data/rewind-kept, beside the attachments' walk; a paired put-back drops a stale temp first; the manifest by a temp
//   renamed over; no sweep takes a press being put back; changed-since, no manifest, the mount door, the bounds, the real pool
//   its follow (r1859): the put-back's link check as strict as the keep's; one put-back of a press at a time; the REAL agent's stat
//   action (agentd.js as its own fs worker); the one bound inside one conversation's walk
//   RED CONTROLS (anchored copies): no hash compare, no size compare, the sweep without its mark, the total bound off, the put-back
//   without keeping first, the put-back unfenced, relative paths kept, links planned, a paired copy's link unread, the stale temp
//   not dropped first, the kept copies inside the attachments' folder, a press being put back swept, two put-backs of one press side
//   by side, one conversation's walk unbound
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
  const plan = K.keepPlanOf([F('/w/a.js', 0o100644, 10), { path: '/w/gone', absent: true }]);
  const linked = K.keepPlanOf([F('/w/a.js', 0o100644, 10), F('/w/l', 0o120777, 4)]);
  ok(plan.ok && plan.rows.length === 2 && plan.rows[0].kind === 'file' && plan.rows[0].mode === 0o644 && plan.rows[1].kind === 'absent' && plan.rows[1].existed === false && plan.bytes === 10
    && !linked.ok && JSON.stringify(linked.refusals) === JSON.stringify([{ path: '/w/l', why: 'link' }]),
    '① a file (its mode kept to restore) and a path absent now (put back: removed): one plan; a LINK is «cannot keep a copy: a link» by name (the round wqdnv452s\'s MUST: the rewind writes THROUGH a link — a copy of the link would hold none of its target\'s bytes)', { plan, linked: linked.refusals });
  const no = (facts, opts) => K.keepPlanOf(facts, opts).refusals.map((r) => r.why);
  const NO = [['a file over 32 MiB', no([F('/w/big', 0o100644, 32 * MiB + 1)]), 'too-large'], ['a folder', no([F('/w/d', 0o040755, 0)]), 'folder'], ['a device', no([F('/dev/x', 0o020644, 0)]), 'device'],
    ['an unreadable path', no([{ path: '/w/x', error: 'EACCES' }]), 'unreadable'], ['a relative path (read against the hub\'s own folder)', no([F('src/a.js', 0o100644, 1)]), 'relative-path'], ['a «~» path', no([F('~/a.js', 0o100644, 1)]), 'relative-path'], ['65 files', no(Array.from({ length: 65 }, (_, i) => F(`/w/f${i}`, 0o100644, 1))), 'too-many'],
    ['nine files of 30 MiB (270 MiB)', no(Array.from({ length: 9 }, (_, i) => F(`/w/m${i}`, 0o100644, 30 * MiB))), 'press-full'], ['2 KiB more than the 1 GiB a machine holds', no([F('/w/a', 0o100644, 2048)], { used: 1024 * MiB - 1024 }), 'kept-full']];
  ok(NO.every(([, got, want]) => got.includes(want)) && K.KEEP.maxFiles === 64 && K.KEEP.fileMax === 32 * MiB && K.KEEP.pressMax === 256 * MiB && K.KEEP.totalMax === 1024 * MiB && K.KEEP.lifeMs === 7 * DAY,
    `① «cannot keep a copy», each by name: ${NO.map(([n, , w]) => `${n} ⇒ ${w}`).join(' · ')} (the bounds: 64 files, 32 MiB, 256 MiB a press, 1 GiB a machine — r1327 — 7 days)`, NO);
  const pp = K.keepPlanOf([F('/w/a.js', 0o100644, 10, { isLink: false })], { paired: true });
  const pNo = (isLink) => K.keepPlanOf([F('/w/a.js', 0o100644, 10, isLink === 'none' ? {} : { isLink })], { paired: true }).refusals.map((r) => r.why).join();
  ok(pp.ok && pp.rows[0].kind === 'not-known' && pNo(true) === 'link' && pNo('none') === 'agent-too-old' && pNo(null) === 'unreadable',
    '① a paired machine (its stat follows links): the kind is «not known (a paired machine)» (r1327); its agent\'s own lstat says a LINK — «cannot keep a copy: a link»; an agent that does not say it: «upgrade the agent»; a link it could not read: unreadable', { pp: pp.rows, link: pNo(true), old: pNo('none') });
  const rows = plan.rows;
  const good = { 0: { ok: true, sha256: 'a'.repeat(64), srcSha256: 'a'.repeat(64), size: 10 } };
  const bad = { ...good, 0: { ...good[0], sha256: 'b'.repeat(64) } }, short = { 0: { ok: true, size: 9, srcSize: 10, isLink: false, srcIsLink: false } }, same = { 0: { ok: true, size: 10, srcSize: 10, isLink: false, srcIsLink: false } };
  const copiedLink = { 0: { ...same[0], isLink: true } }, becameLink = { 0: { ...same[0], srcIsLink: true } }, unsaid = { 0: { ok: true, size: 10, srcSize: 10 } };
  ok(K.readBackOf(rows, good).ok && K.readBackOf(rows, bad).refusals[0].why === 'not-kept' && K.readBackOf(rows, { 0: { ok: false, timedOut: true } }).refusals[0].why === 'no-time'
    && K.readBackOf(pp.rows, same, { paired: true }).ok && !K.readBackOf(pp.rows, short, { paired: true }).ok && !K.readBackOf(pp.rows, copiedLink, { paired: true }).ok && !K.readBackOf(pp.rows, becameLink, { paired: true }).ok && !K.readBackOf(pp.rows, unsaid, { paired: true }).ok,
    '① THE READ-BACK: this hub — the copy\'s sha256 against the original\'s (read in the same pass); a paired machine — the copy\'s size against the original\'s (r1327: no byte crosses the link) AND neither the copy nor the original a link by the agent\'s own lstat (a copy that is a link, an original that became one, an agent that did not say: not kept); a copy past its bound: no-time');
  const mark = (name, at) => ({ kind: K.MARK_KIND, press: name, at });
  const old = K.pressIdOf(T0 - 9 * DAY, '0000000a'), young = K.pressIdOf(T0 - 1 * DAY, '0000000b'), back = K.pressIdOf(T0 - 9 * DAY, '0000000c'), foreign = K.pressIdOf(T0 - 9 * DAY, '0000000d'), bare = K.pressIdOf(T0 - 9 * DAY, '0000000e');
  const swept = K.sweepOf([{ name: old, mark: mark(old, T0 - 9 * DAY), folderMtimeMs: T0 - 9 * DAY }, { name: young, mark: mark(young, T0 - DAY), folderMtimeMs: T0 - DAY },
    { name: back, mark: mark(back, T0 - 9 * DAY), folderMtimeMs: T0 - DAY }, { name: foreign, mark: mark(old, T0 - 9 * DAY), folderMtimeMs: T0 - 9 * DAY }, { name: bare, mark: null, folderMtimeMs: T0 - 9 * DAY }, { name: 'notes', mark: mark('notes', 0), folderMtimeMs: 0 }], T0);
  ok(JSON.stringify(swept) === JSON.stringify([old]), '① THE SWEEP (r1304 (v)): only a press folder past seven days carrying ITS OWN mark — counted from the LATER of the mark\'s time and the folder\'s (a folder touched a day ago stays); unmarked, foreign-marked, other names: never', swept);
  const man = K.manifestOf({ conv: 'c1', press: old, at: T0, rows, back: good });
  const cur = { '/w/a.js': { mode: 0o100644, size: 12, mtimeMs: T0 + 5 }, '/w/gone': { mode: 0o100644, size: 3, mtimeMs: T0 + 5 } };
  const kept = { 0: { sha256: 'a'.repeat(64) } };
  const pb = K.putBackPlanOf(man, cur, kept).map((r) => `${r.path}:${r.act}`);
  const pb2 = K.putBackPlanOf(man, { ...cur, '/w/a.js': { absent: true } }, { ...kept, 0: { sha256: 'c'.repeat(64) } }).map((r) => `${r.act}${r.why ? ':' + r.why : ''}`);
  const pman = K.manifestOf({ conv: 'c1', press: old, at: T0, rows: pp.rows, paired: true, back: { 0: { ok: true, size: 10, mtimeMs: T0 + 1, srcSize: 10 } } });
  const pb3 = K.putBackPlanOf(pman, { '/w/a.js': { mode: 0o100644, size: 12, mtimeMs: T0 + 9 } }, { 0: { size: 10, mtimeMs: T0 + 2 } }).map((r) => `${r.act}${r.why ? ':' + r.why : ''}`);
  const pb4 = K.putBackPlanOf(man, { ...cur, '/w/a.js': { mode: 0o120777, size: 4, mtimeMs: T0 + 5 } }, kept).map((r) => `${r.act}${r.why ? ':' + r.why : ''}`);
  console.log(`    (put-back plans: ${JSON.stringify({ pb, pb2, pb3, pb4 })})`);
  ok(JSON.stringify(pb) === '["/w/a.js:overwrite","/w/gone:remove"]' && JSON.stringify(pb2) === '["refused:kept-changed","remove"]' && JSON.stringify(pb3) === '["refused:kept-changed"]' && JSON.stringify(pb4) === '["refused:link","remove"]' && man.check === 'sha256' && pman.check === 'size',
    '① THE PUT-BACK names each path\'s act BEFORE it acts (r1304 (iv)): overwritten, removed (it did not exist then), created; a kept copy that no longer matches its manifest — this hub by its hash, a paired machine by its size and time — is REFUSED by name; a LINK standing at a path now is refused by name (a put-back must not write through it)');
  const pAt = (isLink) => K.putBackPlanOf(pman, { '/w/a.js': { mode: 0o100644, size: 12, mtimeMs: T0 + 9, ...(isLink === 'none' ? {} : { isLink }) } }, { 0: { size: 10, mtimeMs: T0 + 1 } }).map((r) => `${r.act}${r.why ? ':' + r.why : ''}`).join();
  ok(pAt(false) === 'overwrite' && pAt(true) === 'refused:link' && pAt('none') === 'refused:agent-too-old' && pAt(null) === 'refused:unreadable',
    '① THE PUT-BACK on a paired machine is as strict as the keep (r1854): only an explicit «not a link» is overwritten — a link refused by name, an agent that does not say it «upgrade the agent», a link it could not read: unreadable', { f: pAt(false), t: pAt(true), u: pAt('none'), n: pAt(null) });
  ok([K.KEEP, K.KEEP_WHY, K.PUT_BACK_ACTS].every(Object.isFrozen) && K.DIR_MODE === 0o700 && K.FILE_MODE === 0o600, '① the tables frozen; the modes: the press folder 0700, each kept file 0600 (r1304 (iii))');
}

/** TWO CLIENTS, ONE PUT-BACK (r1859 (2)): A is held right after it reads its kept copies, until B is past the fence it asks first;
 *  B is held at the same point until A has set its files mark (its first act after that read). → [A's answer, B's answer] */
async function twoPutBacks(door, { session, conv, press, expect, dataRoot }) {
  let releaseA, releaseB, aRead = false;
  const aHeld = new Promise((r) => { releaseA = r; }), bHeld = new Promise((r) => { releaseB = r; });
  const callA = async (op, payload) => { if (op === 'keptFacts') { const r = await call(op, payload); aRead = true; await aHeld; return r; } if (aRead) releaseB(); return call(op, payload); };
  const callB = async (op, payload) => { if (op === 'keptFacts') { releaseA(); const r = await call(op, payload); await bHeld; return r; } return call(op, payload); };
  const a = door.putBack({ session, conv, press, by: HUMAN, expect, now: T0 + 9820, hex8: '0000bab1', dataRoot, call: callA });
  const b = door.putBack({ session, conv, press, by: HUMAN, expect, now: T0 + 9830, hex8: '0000bab2', dataRoot, call: callB });
  return Promise.all([a, b.catch((e) => ({ ok: false, threw: String(e && e.message) }))]);
}

console.log('— ② this hub');
const KA = (root) => ({ dataRoot: root, call });
const DOOR = require(path.join(REPO, 'src/mount-door.js'));
const CA = require(path.join(REPO, 'src/server/chat-attachments.js'));
{
  const root = fs.mkdtempSync(path.join(SCRATCH, 'hub-')), work = fs.mkdtempSync(path.join(SCRATCH, 'work-'));
  const a = path.join(work, 'a.txt'), l = path.join(work, 'l.txt'), gone = path.join(work, 'gone.txt');
  fs.writeFileSync(a, 'the person\'s words\n'); fs.chmodSync(a, 0o644); fs.symlinkSync('a.txt', l);
  const r = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-1', files: [a, gone], by: HUMAN, now: T0, hex8: '0000aaaa', ...KA(root) });
  const dir = r.where, man = r.ok ? JSON.parse(fs.readFileSync(path.join(dir, K.MANIFEST_FILE), 'utf8')) : null;
  const st = (p) => fs.lstatSync(p).mode & 0o7777;
  console.log(`    (kept: ${JSON.stringify(r)} · folder ${r.ok ? st(dir).toString(8) : '-'} · file ${r.ok ? st(path.join(dir, '0.bin')).toString(8) : '-'})`);
  ok(r.ok && dir === path.join(root, 'conv-1', K.pressIdOf(T0, '0000aaaa')) && st(dir) === 0o700 && st(path.join(dir, '0.bin')) === 0o600 && man.files[0].mode === 0o644 && man.files[0].sha256 === sha(fs.readFileSync(a))
    && man.files[1].existed === false && fs.existsSync(path.join(dir, K.MARK_FILE)) && man.check === 'sha256' && !fs.readdirSync(dir).some((n) => n.endsWith('.tmp')),
    '② a keep on this hub: the hub\'s own kept folder (data/rewind-kept/<conversation>/<press>), the press folder 0700, the kept file 0600 (the original\'s 0644 recorded), its sha256 the original\'s; the absent path recorded; sealed with its mark, the manifest by a temp name renamed over (none left)');
  // A LINK (the round wqdnv452s's MUST): the rewind writes THROUGH it, so a copy of the link keeps none of its target's bytes
  const rl = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-1', files: [a, l], by: HUMAN, now: T0 + 500, hex8: '0000a9a9', ...KA(root) });
  const cl = await KD.keepableOf({ session: { mode: 'chat' }, conv: 'conv-1', files: [a, l], by: HUMAN, now: T0, ...KA(root) });
  const tgt = path.join(work, 'target.txt'), via = path.join(work, 'via.txt');
  fs.writeFileSync(tgt, 'the person\'s target\n'); fs.symlinkSync('target.txt', via); fs.writeFileSync(via, 'what a rewind writes\n');   // the write the CLI makes
  ok(!rl.ok && JSON.stringify(rl.refusals) === JSON.stringify([{ path: l, why: 'link' }]) && !fs.existsSync(path.join(root, 'conv-1', K.pressIdOf(T0 + 500, '0000a9a9'))) && !cl.ok && cl.refusals[0].why === 'link'
    && fs.readFileSync(tgt, 'utf8') === 'what a rewind writes\n' && fs.lstatSync(via).isSymbolicLink(),
    '② A LINK among the listed files: «cannot keep a copy: a link» by name, in the confirm and at the press (nothing kept, the opened folder removed) — because a write to a link\'s path lands in its TARGET (shown: the target\'s bytes replaced, the link still a link)', { rl: rl.refusals, cl: cl.refusals });
  const lying = (op, p) => call(op, p).then((x) => (op === 'keepOne' && x.sha256 ? { ...x, sha256: '0'.repeat(64) } : x));
  const r2 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-1', files: [a], by: HUMAN, now: T0 + 1000, hex8: '0000bbbb', dataRoot: root, call: lying });
  ok(!r2.ok && r2.refusals[0].why === 'not-kept' && !fs.existsSync(path.join(root, 'conv-1', K.pressIdOf(T0 + 1000, '0000bbbb'))), '② A COPY WHOSE READ-BACK DIFFERS = NO PRESS, and its unsealed folder is removed', r2);
  const fullRoot = fs.mkdtempSync(path.join(SCRATCH, 'full-')), fullName = K.pressIdOf(T0 - DAY, '0000cccc'), fullDir = path.join(fullRoot, 'conv-2', fullName);
  fs.mkdirSync(fullDir, { recursive: true }); fs.writeFileSync(path.join(fullDir, K.MANIFEST_FILE), JSON.stringify({ files: [{ size: 1024 * MiB - 4 }] })); fs.writeFileSync(path.join(fullDir, K.MARK_FILE), JSON.stringify({ kind: K.MARK_KIND, press: fullName, at: T0 - DAY }));
  const r3 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-2', files: [a], by: HUMAN, now: T0, hex8: '0000dddd', ...KA(fullRoot) });
  const c3 = await KD.keepableOf({ session: { mode: 'chat' }, conv: 'conv-2', files: [a], by: HUMAN, now: T0, ...KA(fullRoot) });
  ok(!r3.ok && r3.refusals.some((x) => x.why === 'kept-full') && !c3.ok && c3.refusals.some((x) => x.why === 'kept-full') && fs.existsSync(fullDir), '② THE KEPT COPIES FULL (1 GiB a machine) = NO PRESS, said in the confirm too; nothing is removed early to make room (r1304 (i))', { r3, c3 });
  const sw = path.join(root, 'conv-1'), oldM = K.pressIdOf(T0 - 9 * DAY, '0000eeee'), oldU = K.pressIdOf(T0 - 9 * DAY, '0000ffff');
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
  ok(plan.ok && JSON.stringify(plan.rows.map((x) => x.act)) === '["overwrite","remove"]' && did.ok && fs.readFileSync(a, 'utf8') === 'the person\'s words\n' && (fs.statSync(a).mode & 0o777) === 0o644 && !fs.existsSync(gone)
    && !!firstKept && firstKept.files.some((f) => f.path === a && f.sha256 === sha('the agent\'s words, after the rewind\n')) && !fs.readdirSync(work).some((n) => n.endsWith('.vs-tmp')),
    '② PUT MY FILES BACK: its plan named first (overwritten, removed); what stood there was KEPT FIRST (its own press); then the bytes and the mode put back, the re-created file removed — by a temp name renamed over (none left)');
  fs.writeFileSync(path.join(r.where, '0.bin'), 'tampered');
  const ch = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-1', press: r.press, by: HUMAN, dryRun: true, ...KA(root) });
  const who = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-1', press: r.press, by: { kind: 'agent' }, dryRun: true, ...KA(root) });
  ok(ch.ok && ch.rows[0].act === 'refused' && ch.rows[0].why === 'kept-changed' && !who.ok && who.reason === 'not-the-person', '② a kept file changed after the keep: the put-back REFUSES that row by name; anyone but the person: refused', { ch: ch.rows, who });
  // THE MACHINE's total and sweep (the reader's MAJOR 2): every conversation's press folders count, and each keep sweeps them all
  const other = K.pressIdOf(T0 - 9 * DAY, '0000a1a1'), otherDir = path.join(fullRoot, 'conv-9', other);
  fs.mkdirSync(otherDir, { recursive: true }); fs.writeFileSync(path.join(otherDir, K.MARK_FILE), JSON.stringify({ kind: K.MARK_KIND, press: other, at: T0 - 9 * DAY })); fs.utimesSync(otherDir, new Date(T0 - 9 * DAY), new Date(T0 - 9 * DAY));
  const r5 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-3', files: [a], by: HUMAN, now: T0, hex8: '0000a2a2', ...KA(fullRoot) });
  ok(!r5.ok && r5.refusals.some((x) => x.why === 'kept-full') && !fs.existsSync(otherDir) && fs.existsSync(fullDir), '② THE TOTAL AND THE SWEEP ARE THE MACHINE\'S: another conversation\'s 1 GiB refuses this one\'s keep; this keep swept another conversation\'s old marked press (its own mark), the young one stays', r5);
  // A RELATIVE PATH is never kept (the reader's MAJOR 4): it would be read against the hub's own folder
  const r6 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-1', files: ['a.txt'], by: HUMAN, now: T0 + 4000, hex8: '0000a3a3', ...KA(root) });
  ok(!r6.ok && r6.refusals[0].why === 'relative-path' && !fs.existsSync(path.join(root, 'conv-1', K.pressIdOf(T0 + 4000, '0000a3a3'))), '② a relative listed path: «cannot keep a copy» (relative-path), so the press is refused; the opened folder removed', r6);
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
  fs.utimesSync(path.join(root, 'conv-4', oldPress), new Date(T0 - 9 * DAY), new Date(T0 - 9 * DAY));
  fs.writeFileSync(b, 'b changed\n');
  const cut = (op, payload) => (op === 'putOne' ? Promise.resolve().then(() => { fs.writeFileSync(`${payload.row.path}.${payload.press}.vs-tmp`, 'half'); throw Object.assign(new Error('the worker was ended at its deadline'), { safeFsTimeout: true }); }) : call(op, payload));
  const planOld = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-4', press: oldPress, by: HUMAN, dryRun: true, dataRoot: root, call: cut });
  const didOld = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-4', press: oldPress, by: HUMAN, expect: planOld.rows, now: T0 + 7000, hex8: '0000a6a6', dataRoot: root, call: cut });
  ok(rOld.ok && didOld.ok && didOld.rows[0].done === false && fs.existsSync(path.join(root, 'conv-4', oldPress)) && !fs.readdirSync(work2).some((n) => n.endsWith('.vs-tmp')),
    '② a put-back of a press nine days old: its keep-first\'s sweep SPARES it; a put-back act cut short (the pool\'s deadline) leaves no temp beside the person\'s file', didOld.rows);
  // the round wqdnv452s: the walk of the dropped files never meets a kept copy (they live in data/rewind-kept, beside it)
  const data = fs.mkdtempSync(path.join(SCRATCH, 'data-')), att = path.join(data, 'chat-attachments');
  fs.mkdirSync(path.join(att, 'c-old', 'files'), { recursive: true }); fs.writeFileSync(path.join(att, 'c-old', 'files', 'drop.png'), 'png');
  const keptRoot = path.join(data, path.basename(KD.DATA_ROOT)), wa = path.join(work, 'walk.txt');
  fs.writeFileSync(wa, 'kept beside the attachments\n');
  const rw = await KD.keepFor({ session: { mode: 'chat' }, conv: 'c-old', files: [wa], by: HUMAN, now: T0, hex8: '0000a7a7', ...KA(keptRoot) });
  const store = CA.create({ root: att, log: { log() { } } }), orph = await store.orphans(), removedAll = await store.removeOrphans({ files: orph.files, bytes: orph.bytes });
  ok(rw.ok && path.basename(KD.DATA_ROOT) === 'rewind-kept' && orph.files === 1 && orph.ids.join() === 'c-old' && removedAll.removed === 1 && fs.existsSync(path.join(rw.where, K.MANIFEST_FILE)),
    '② the kept copies sit in data/rewind-kept, BESIDE the dropped files: the attachments\' «remove what is left» counts one dropped file of a gone conversation (not the kept copies) and removing it leaves the kept press whole', { orph: { files: orph.files, ids: orph.ids }, removedAll });
  // the put-back read: a plan the person did not read is refused (changed-since); a press with no manifest is no put-back (dark)
  fs.writeFileSync(a, 'v-after\n');
  const pc = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-1', press: r4.press, by: HUMAN, dryRun: true, ...KA(root) });
  const stale = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-1', press: r4.press, by: HUMAN, expect: pc.rows.map((x) => ({ ...x, act: 'unchanged' })), now: T0 + 8000, hex8: '0000a8a8', ...KA(root) });
  const noMan = K.pressIdOf(T0, '0000b1b1'); fs.mkdirSync(path.join(root, 'conv-1', noMan)); fs.writeFileSync(path.join(root, 'conv-1', noMan, K.MARK_FILE), JSON.stringify({ kind: K.MARK_KIND, press: noMan, at: T0 }));
  const dark = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-1', press: noMan, by: HUMAN, dryRun: true, ...KA(root) });
  ok(!stale.ok && stale.reason === 'changed-since' && fs.readFileSync(a, 'utf8') === 'v-after\n' && !dark.ok && dark.reason === 'not-kept',
    '② a put-back whose plan is not the one the person read: refused changed-since, nothing written; a press folder with no manifest (a keep never sealed): no put-back (not-kept)', { stale: stale.reason, dark: dark.reason });
  // a seal cut short leaves a temp: the next seal of that press refuses (never a torn manifest), and the keep discards its folder
  const tornAt = T0 + 9000, torn = K.pressIdOf(tornAt, '0000b2b2'), tornCall = (op, payload) => (op === 'seal' ? Promise.resolve().then(() => { fs.writeFileSync(path.join(payload.dir, K.MANIFEST_FILE + '.tmp'), '{"v":1,"fi'); return W.runOp(op, payload).result; }) : call(op, payload));
  const rt = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-1', files: [a], by: HUMAN, now: tornAt, hex8: '0000b2b2', dataRoot: root, call: tornCall });
  ok(!rt.ok && !fs.existsSync(path.join(root, 'conv-1', torn)), '② a manifest temp a cut-short seal left: the seal refuses (it never writes over it, never reads it), the keep is refused and its folder removed', rt);
  // no keep's sweep removes a press while it is being put back (another conversation's keep runs in the middle of it)
  const sp = K.pressIdOf(T0 - 9 * DAY, '0000b3b3'), w5 = path.join(SCRATCH, 'w5'); fs.mkdirSync(w5, { recursive: true }); const e5 = path.join(w5, 'e.txt');
  fs.writeFileSync(e5, 'e as it was\n');
  const r5k = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-5', files: [e5], by: HUMAN, now: T0 - 9 * DAY, hex8: '0000b3b3', ...KA(root) });
  fs.utimesSync(path.join(root, 'conv-5', sp), new Date(T0 - 9 * DAY), new Date(T0 - 9 * DAY));
  fs.writeFileSync(e5, 'e changed\n');
  let midKeep = null;
  const mid = (op, payload) => (op === 'putOne' && !midKeep ? Promise.resolve().then(async () => { midKeep = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-6', files: [a], by: HUMAN, now: T0 + 9500, hex8: '0000b4b4', ...KA(root) }); return call(op, payload); }) : call(op, payload));
  const p5 = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-5', press: sp, by: HUMAN, dryRun: true, dataRoot: root, call: mid });
  const d5 = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-5', press: sp, by: HUMAN, expect: p5.rows, now: T0 + 9400, hex8: '0000b5b5', dataRoot: root, call: mid });
  ok(r5k.ok && d5.ok && d5.rows[0].done === true && !!midKeep && midKeep.ok && !midKeep.swept.includes(sp) && fs.existsSync(path.join(root, 'conv-5', sp)) && fs.readFileSync(e5, 'utf8') === 'e as it was\n',
    '② another conversation\'s keep in the MIDDLE of a put-back: its machine-wide sweep spares the press being put back (nine days old), and the put-back ends whole', { swept: midKeep && midKeep.swept, rows: d5.rows });
  // the mount door: a listed file on a storage that is not answering is never read — «cannot keep a copy», nothing kept
  const blockedDir = path.join(SCRATCH, 'blocked'); fs.mkdirSync(blockedDir, { recursive: true }); const bf = path.join(blockedDir, 'f.txt'); fs.writeFileSync(bf, 'on a wedged mount');
  DOOR.register({ pathBlocked: (q) => (String(q).startsWith(blockedDir + path.sep) ? blockedDir : false) });
  const rb = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-1', files: [bf], by: HUMAN, now: T0 + 9700, hex8: '0000b6b6', ...KA(root) });
  DOOR.register(null);
  ok(!rb.ok && JSON.stringify(rb.refusals) === JSON.stringify([{ path: bf, why: 'unreadable' }]) && !fs.existsSync(path.join(root, 'conv-1', K.pressIdOf(T0 + 9700, '0000b6b6'))),
    '② the mount door asked first: a listed file on a storage that is not answering is «cannot keep a copy» (unreadable) — never read, nothing kept', rb.refusals);
  // a temp a cut-short put-back left beside the file goes FIRST on this hub too (its copy is exclusive: it would refuse the row)
  const w6 = path.join(SCRATCH, 'w6'); fs.mkdirSync(w6, { recursive: true }); const g = path.join(w6, 'g.txt'); fs.writeFileSync(g, 'g as kept\n');
  const rg = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-7', files: [g], by: HUMAN, now: T0 + 9800, hex8: '0000b8b8', ...KA(root) });
  fs.writeFileSync(g, 'g after\n'); fs.writeFileSync(`${g}.${rg.press}.vs-tmp`, 'a stale half');
  const pg = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-7', press: rg.press, by: HUMAN, dryRun: true, ...KA(root) });
  const dg = await KD.putBack({ session: { mode: 'chat' }, conv: 'conv-7', press: rg.press, by: HUMAN, expect: pg.rows, now: T0 + 9900, hex8: '0000b9b9', ...KA(root) });
  ok(rg.ok && dg.ok && dg.rows[0].done === true && fs.readFileSync(g, 'utf8') === 'g as kept\n' && !fs.existsSync(`${g}.${rg.press}.vs-tmp`),
    '② a stale temp of an old put-back beside the file: removed FIRST, then the kept bytes put back (the row done, no temp left)', dg.rows);
  // ONE PUT-BACK OF A PRESS AT A TIME (r1859 (2)): a second client presses the same put-back while the first is acting
  const w8 = path.join(SCRATCH, 'w8'); fs.mkdirSync(w8, { recursive: true }); const h8 = path.join(w8, 'h.txt'); fs.writeFileSync(h8, 'h as kept\n');
  const rh8 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-8', files: [h8], by: HUMAN, now: T0 + 9810, hex8: '0000bab0', ...KA(root) });
  fs.writeFileSync(h8, 'h after\n');
  const s8 = { mode: 'chat' };
  const ph8 = await KD.putBack({ session: s8, conv: 'conv-8', press: rh8.press, by: HUMAN, dryRun: true, ...KA(root) });
  const [first, second] = await twoPutBacks(KD, { session: s8, conv: 'conv-8', press: rh8.press, expect: ph8.rows, dataRoot: root });
  ok(rh8.ok && first.ok && first.rows[0].done === true && !second.ok && second.reason === 'pending' && fs.readFileSync(h8, 'utf8') === 'h as kept\n',
    '② TWO CLIENTS PRESS ONE PUT-BACK AT ONCE, both past its first fence: the second is refused by name (pending — the fence asked again right before the mark is set), the first ends whole', { first: first.rows, second });
  // U3 (主开发 r1988): THE KEPT LINES — a record of what a rewind did to a conversation's files, kept by the hub
  const klLroot = fs.mkdtempSync(path.join(SCRATCH, 'lines-')), klLw = path.join(SCRATCH, 'klLw'); fs.mkdirSync(klLw, { recursive: true });
  const klLf = path.join(klLw, 'l.txt'); fs.writeFileSync(klLf, 'l as it was\n');
  const klLk = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-l', files: [klLf], by: HUMAN, now: T0, hex8: '0000c9c9', ...KA(klLroot) });
  const klTold = [], klBcast = (sess, id, klFrame) => klTold.push([sess, id, klFrame]);
  const klLs = { mode: 'chat' };
  const klL1 = await KD.afterFilesPress(klLs, 'conv-l', { ok: true, results: { kept: { press: klLk.press, where: klLk.where, machine: null, check: 'sha256', files: 1 }, files: { ok: true } } }, { broadcastToSession: klBcast, msgId: 'p1', now: T0, ...KA(klLroot) });
  const klSeen1 = await KD.linesOf('conv-l', { now: T0 + 1000, ...KA(klLroot) });
  ok(klLk.ok && klL1 && klL1.state === 'kept' && klL1.until === T0 + K.KEEP.lifeMs && klL1.files === 1 && klL1.msgId === 'p1' && klL1.step === 'done' && klTold.length === 1 && klTold[0][0] === klLs && klTold[0][2].op === 'meta' && klTold[0][2].subtype === 'rewind-kept-line' && klTold[0][2].data.press === klLk.press
    && klTold[0][2].data.door === true && klTold[0][2].data.state === 'kept' && klSeen1.length === 1 && klSeen1[0].door === true && fs.existsSync(path.join(klLroot, 'conv-l', K.LINES_FILE)),
    '② A KEPT LINE (r1988): a files press that kept copies writes its line (data/rewind-kept/<conversation>/lines.json, synced) and tells EVERY client of the conversation live AS A PAGE DRAWS IT — its door on the told line itself (r2245 (1)); the door stands while its copy does', { klL1, told: klTold[0] && klTold[0][2].data, klSeen1 });
  // a put-back: its line reads «put back»; its keep-klFirst (what stood there) is a line of its own, with its door
  fs.writeFileSync(klLf, 'l after\n');
  const klLp = await KD.putBack({ session: klLs, conv: 'conv-l', press: klLk.press, by: HUMAN, dryRun: true, ...KA(klLroot) });
  const klLd = await KD.putBack({ session: klLs, conv: 'conv-l', press: klLk.press, by: HUMAN, expect: klLp.rows, now: T0 + 2000, hex8: '0000cac0', ...KA(klLroot) });
  klTold.length = 0;
  await KD.afterPutBack(klLs, 'conv-l', klLk.press, klLd, { broadcastToSession: klBcast, now: T0 + 2000, ...KA(klLroot) });
  const klSeen2 = await KD.linesOf('conv-l', { now: T0 + 3000, ...KA(klLroot) });
  const klWas = klSeen2.find((x) => x.press === klLk.press), klFirst = klSeen2.find((x) => x.press !== klLk.press);
  const klToldOf = (press) => (klTold.find((x) => x[2].data.press === press) || [])[2];
  ok(klLd.ok && klWas && klWas.state === 'put-back' && klWas.door === false && klWas.putBackAt === T0 + 2000 && klFirst && klFirst.state === 'kept' && klFirst.door === true && klFirst.of === 'put-back' && klTold.length === 2
    && klToldOf(klFirst.press).data.door === true && klToldOf(klLk.press).data.door === false && klToldOf(klLk.press).data.state === 'put-back',
    '② the put-back: its line stays and SAYS «put back» (no door); what stood there, kept first, is a line of its own with its door; both told live, the keep-first WITH its door (r2245 (1))', klSeen2);
  // the copy gone, or its seven days past: the line stays and says so — never a door
  const klSeen3 = await KD.linesOf('conv-l', { now: T0 + 2000 + K.KEEP.lifeMs + 1, ...KA(klLroot) });
  fs.rmSync(path.join(klLroot, 'conv-l', klFirst.press), { recursive: true, force: true });
  const klSeen4 = await KD.linesOf('conv-l', { now: T0 + 3000, ...KA(klLroot) });
  ok(klSeen3.find((x) => x.press === klFirst.press).state === 'gone' && klSeen3.every((x) => x.door === false) && klSeen4.find((x) => x.press === klFirst.press).state === 'gone' && klSeen4.length === 2,
    '② its seven days past, or its copy swept: the line STAYS and reads «gone» — the door only while the copy stands', { klSeen3: klSeen3.map((x) => x.state), klSeen4: klSeen4.map((x) => x.state) });
  // THE HUB RESTARTS: a fresh door (none of its memory) reads the same lines from disk
  const klDoorPath = require.resolve(path.join(REPO, 'src/server/rewind-kept-door.js'));
  delete require.cache[klDoorPath];
  const klKD2 = require(klDoorPath);
  const klSeen5 = await klKD2.linesOf('conv-l', { now: T0 + 3000, ...KA(klLroot) });
  ok(klKD2 !== KD && JSON.stringify(klSeen5) === JSON.stringify(klSeen4), '② A HUB RESTART keeps the lines (r1988 law 4): a fresh door reads them back from the conversation\'s own record', klSeen5.length);
  // an attach (a reload): the lines sent again — and a conversation with none starts no keep pool
  let klPoolCalls = 0; const klSpyCall = (op, payload) => { klPoolCalls++; return call(op, payload); };
  const klSentNone = [], klSentSome = [];
  await KD.sendKeptLines({ readyState: 1, send: (x) => klSentNone.push(x) }, 'conv-none', { dataRoot: klLroot, call: klSpyCall });
  const klBefore = klPoolCalls;
  await KD.sendKeptLines({ readyState: 1, send: (x) => klSentSome.push(x) }, 'conv-l', { dataRoot: klLroot, call: klSpyCall, now: T0 + 3000 });
  const klFrame = klSentSome[0] ? JSON.parse(klSentSome[0]) : null;
  ok(klBefore === 0 && !klSentNone.length && klFrame && klFrame.op === 'meta' && klFrame.subtype === 'rewind-kept-lines' && klFrame.data.lines.length === 2 && klPoolCalls > 0,
    '② AN ATTACH draws them again (their own meta, read off the loop); a conversation that never kept anything asks no keep pool (one async look for its lines file)', { klBefore, sent: klFrame && klFrame.data.lines.length });
  {   // r2245: the round wj16ir2eu's legs (their own names)
  // r2245 (2): A PARTIAL PUT-BACK — one row fails: the line stays KEPT (its door while the copy stands) and records the try
  const at2 = (tag) => fs.mkdtempSync(path.join(SCRATCH, tag + '-'));
  const pr = at2('plr'), pw = at2('plw'), pa = path.join(pw, 'a.txt'), pb = path.join(pw, 'b.txt');
  fs.writeFileSync(pa, 'a then\n'); fs.writeFileSync(pb, 'b then\n');
  const pk = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-pl', files: [pa, pb], by: HUMAN, now: T0, hex8: '0000d1d1', ...KA(pr) });
  const ps = { mode: 'chat' }, pTold = [], pB = (sess, id, fr) => pTold.push(fr.data);
  await KD.afterFilesPress(ps, 'conv-pl', { ok: true, results: { kept: { press: pk.press, machine: null, files: 2, msgAt: T0 - 60000 }, files: { ok: true } } }, { broadcastToSession: pB, now: T0, ...KA(pr) });
  fs.writeFileSync(pa, 'a now\n'); fs.writeFileSync(pb, 'b now\n');
  const failB = (op, payload) => (op === 'putOne' && payload && payload.row && payload.row.path === pb ? Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' })) : call(op, payload));
  const pplan = await KD.putBack({ session: ps, conv: 'conv-pl', press: pk.press, by: HUMAN, dryRun: true, ...KA(pr) });
  const pdone = await KD.putBack({ session: ps, conv: 'conv-pl', press: pk.press, by: HUMAN, expect: pplan.rows, now: T0 + 1000, hex8: '0000d2d2', dataRoot: pr, call: failB });
  pTold.length = 0;
  await KD.afterPutBack(ps, 'conv-pl', pk.press, pdone, { broadcastToSession: pB, now: T0 + 1000, ...KA(pr) });
  const pl = (await KD.linesOf('conv-pl', { now: T0 + 2000, ...KA(pr) })).find((x) => x.press === pk.press), plTold = pTold.find((x) => x.press === pk.press);
  ok(pdone.ok && pdone.rows.filter((x) => x.done === true).length === 1 && fs.readFileSync(pa, 'utf8') === 'a then\n' && fs.readFileSync(pb, 'utf8') === 'b now\n'
    && !!pl && pl.state === 'kept' && pl.door === true && pl.notPut === 1 && pl.triedAt === T0 + 1000 && pl.msgAt === T0 - 60000 && !!plTold && plTold.door === true && plTold.notPut === 1,
    '② A PARTIAL PUT-BACK (r2245 (2)): one row fails — the line stays KEPT, its door stands while the copy does, and it records how many were not put back and when (told so live)', { pl, rows: pdone.rows.map((x) => [x.act, x.done]) });
  const pplan2 = await KD.putBack({ session: ps, conv: 'conv-pl', press: pk.press, by: HUMAN, dryRun: true, ...KA(pr) });
  const pdone2 = await KD.putBack({ session: ps, conv: 'conv-pl', press: pk.press, by: HUMAN, expect: pplan2.rows, now: T0 + 3000, hex8: '0000d3d3', ...KA(pr) });
  await KD.afterPutBack(ps, 'conv-pl', pk.press, pdone2, { broadcastToSession: pB, now: T0 + 3000, ...KA(pr) });
  const pl2 = (await KD.linesOf('conv-pl', { now: T0 + 4000, ...KA(pr) })).find((x) => x.press === pk.press);
  ok(pdone2.ok && fs.readFileSync(pb, 'utf8') === 'b then\n' && pl2.state === 'put-back' && pl2.door === false && pl2.putBackAt === T0 + 3000,
    '② …its door puts back the rest: once every row that had an act is done, the line reads «put back»', { pl2, rows: pdone2.rows.map((x) => [x.act, x.done]) });
  // r2245 (7): a keep whose files step put nothing back, or may have put some back, still has its line and door — its step said
  const sr = at2('step'), stw = at2('stepw'), sf = path.join(stw, 's.txt'); fs.writeFileSync(sf, 's\n');
  const sk1 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-s', files: [sf], by: HUMAN, now: T0, hex8: '0000f4f4', ...KA(sr) });
  const sk2 = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-s', files: [sf], by: HUMAN, now: T0 + 1, hex8: '0000f5f5', ...KA(sr) });
  const s1 = await KD.afterFilesPress(ps, 'conv-s', { ok: false, reason: 'door-failed', results: { kept: { press: sk1.press, files: 1 } }, outcome: { failed: 'files', maybePartial: true } }, { broadcastToSession: () => { }, now: T0, ...KA(sr) });
  const s2 = await KD.afterFilesPress(ps, 'conv-s', { ok: true, results: { kept: { press: sk2.press, files: 1 }, files: { ok: false, reason: 'checkpoints-off', sent: true } }, outcome: { failed: 'files', maybePartial: false } }, { broadcastToSession: () => { }, now: T0 + 1, ...KA(sr) });
  ok(!!s1 && s1.step === 'partial' && s1.door === true && !!s2 && s2.step === 'none' && s2.door === true,
    '② A KEEP WHOSE FILES STEP DID NOT PUT THEM BACK (r2245 (7)): its line is written with its door, and says what the step did (may have put some back · put nothing back) — never «Files rewound» for a step that was refused', { s1: s1 && s1.step, s2: s2 && s2.step });
  // r2245 (5): THE CAP drops the oldest SETTLED line — never a line whose copy still stands
  const capCase = async (door, tag) => {
    const cr = at2(tag), live0 = K.pressIdOf(T0 - 5000, '0000e0e0');
    const settledLines = Array.from({ length: KD.LINES_MAX - 1 }, (_, i) => ({ press: K.pressIdOf(T0 - 4000 + i, (0xe100 + i).toString(16).padStart(8, '0')), at: T0 - 4000 + i, until: T0 + K.KEEP.lifeMs, state: 'put-back', putBackAt: T0 }));
    await call('writeLines', { root: path.join(cr, 'conv-cap'), lines: [{ press: live0, at: T0 - 5000, until: T0 + K.KEEP.lifeMs, state: 'kept', files: 1 }, ...settledLines] });
    const capNew = K.pressIdOf(T0, '0000efef');
    await door.noteLine('conv-cap', { press: capNew, at: T0, until: T0 + K.KEEP.lifeMs, state: 'kept', files: 1 }, { now: T0, ...KA(cr) });
    const after = (await call('readLines', { root: path.join(cr, 'conv-cap') })).lines;
    return { after, live0, capNew, first: settledLines[0].press };
  };
  const cap = await capCase(KD, 'cap');
  ok(cap.after.length === KD.LINES_MAX && cap.after[0].press === cap.live0 && cap.after.some((l) => l.press === cap.capNew) && !cap.after.some((l) => l.press === cap.first),
    `② THE CAP (r2245 (5)): past ${KD.LINES_MAX} lines the oldest SETTLED line leaves — the oldest line, whose copy still stands, is kept (its door is the only way back to it)`, cap.after.length);
  // r2245 (8): a record that cannot be read is never written over — the press's line is told NOT recorded; an attach says so
  const tr = at2('torn'), torn = '{"v":1,"lines":[{"press"';
  fs.mkdirSync(path.join(tr, 'conv-t'), { recursive: true }); fs.writeFileSync(path.join(tr, 'conv-t', K.LINES_FILE), torn);
  const tw = at2('tornw'), tf = path.join(tw, 't.txt'); fs.writeFileSync(tf, 't\n');
  const tk = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-t', files: [tf], by: HUMAN, now: T0, hex8: '0000f1f1', ...KA(tr) });
  const tTold = [], tSent = [];
  const tl = await KD.afterFilesPress({ mode: 'chat' }, 'conv-t', { ok: true, results: { kept: { press: tk.press, machine: null, files: 1 }, files: { ok: true } } }, { broadcastToSession: (sx, ix, fr) => tTold.push(fr.data), now: T0, ...KA(tr) });
  await KD.sendKeptLines({ readyState: 1, send: (x) => tSent.push(JSON.parse(x)) }, 'conv-t', { dataRoot: tr, call, now: T0 });
  ok(fs.readFileSync(path.join(tr, 'conv-t', K.LINES_FILE), 'utf8') === torn && !!tl && tl.unrecorded === true && tl.door === true && !!tTold[0] && tTold[0].unrecorded === true && !!tSent[0] && tSent[0].data.torn === true,
    '② A RECORD THAT CANNOT BE READ (r2245 (8)): never treated as empty — not written over; the press\'s line is told live and SAID not recorded; an attach says the record could not be read', { tl, sent: tSent[0] && tSent[0].data });
  // r2372 (1): THE RECORD FOLLOWS THE CONVERSATION — a session's end (the one remover every end path reads) KEEPS it; only the
  // conversation's DELETE forgets it, and a press answering after that writes nothing (r2372 (5))
  const WF = require(path.join(REPO, 'src/server/wrapper-files.js'));
  const KDnow = require(path.join(REPO, 'src/server/rewind-kept-door.js'));   // the door as loaded now (the restart leg above loaded it afresh)
  const fdata = at2('fdata'), fbuf = path.join(fdata, 'buffers'), froot = path.join(fdata, 'rewind-kept'), fpress = K.pressIdOf(T0, '0000f3f3');
  fs.mkdirSync(fbuf, { recursive: true });
  for (const c of ['claude-c-f', 'claude-c-g']) await call('writeLines', { root: path.join(froot, c), lines: [{ press: K.pressIdOf(T0, '0000f2f2'), at: T0, until: T0 + 1, state: 'put-back' }] });
  fs.mkdirSync(path.join(froot, 'claude-c-g', fpress));   // a press folder of that conversation still standing
  WF.removeWrapperFiles(fbuf, 'claude-c-f');
  await new Promise((r) => setTimeout(r, 50));
  const keptAtEnd = fs.existsSync(path.join(froot, 'claude-c-f', K.LINES_FILE));
  await KDnow.forgetLines('claude-c-g', { dataRoot: froot });
  const late = await KDnow.noteLine('claude-c-g', { press: K.pressIdOf(T0 + 5, '0000f6f6'), at: T0 + 5, until: T0 + K.KEEP.lifeMs, state: 'kept', files: 1 }, { dataRoot: froot, call, now: T0 + 5 });
  ok(keptAtEnd && !fs.existsSync(path.join(froot, 'claude-c-g', K.LINES_FILE)) && fs.existsSync(path.join(froot, 'claude-c-g', fpress)) && late === null,
    '② A SESSION\'s END KEEPS THE RECORD (r2372 (1): a resume or an exit is not a deletion); the conversation\'s DELETE forgets it (its press folders stay for their own days) and a press answering after the forget writes NOTHING (r2372 (5))', { keptAtEnd, late });
  // r4423 MUST 1: A BORROWED ID IS NOBODY's ADDRESS — a pending fork (its parent's id until its CLI announces its own) has NO key
  // the PRODUCTION shapes (r4512): a fork's live session before its CLI's first id-bearing line carries its parent's id in both fields and
  // _forkRequested; at that line (src/server/stdout/claude-stream-json.js) the parent goes into forkedFrom, its own id in, _forkRequested off
  const pP = { mode: 'chat', backend: 'claude', claudeSessionId: 'c-par', backendSessionId: 'c-par' }, pF = { mode: 'chat', backend: 'claude', claudeSessionId: 'c-par', backendSessionId: 'c-par', _forkRequested: true };
  const pr0 = at2('forkr'), pw0 = at2('forkw'), pfile = path.join(pw0, 'p.txt'); fs.writeFileSync(pfile, 'parent then\n');
  const pKey = KDnow.convKeyOf(pP), pk0 = await KDnow.keepFor({ session: pP, conv: pKey, files: [pfile], by: HUMAN, now: T0, hex8: '0000fbfb', ...KA(pr0) });
  await KDnow.afterFilesPress(pP, pKey, { ok: true, results: { kept: { press: pk0.press, machine: null, files: 1 }, files: { ok: true } } }, { broadcastToSession: () => { }, now: T0, ...KA(pr0) });
  fs.writeFileSync(pfile, 'parent now\n');
  const fKey = KDnow.convKeyOf(pF);
  const fPut = await KDnow.putBack({ session: pF, conv: fKey, press: pk0.press, by: HUMAN, dryRun: true, ...KA(pr0) });
  const fPutAct = await KDnow.putBack({ session: pF, conv: fKey, press: pk0.press, by: HUMAN, expect: [], ...KA(pr0) });
  const pressesBefore = fs.readdirSync(path.join(pr0, pKey)).filter((n) => K.PRESS_RE.test(n)).length;
  const fKeep = await KDnow.keepFor({ session: pF, conv: fKey, files: [pfile], by: HUMAN, now: T0 + 1, hex8: '0000fcfc', ...KA(pr0) });
  const pressesAfter = fs.readdirSync(path.join(pr0, pKey)).filter((n) => K.PRESS_RE.test(n)).length;
  const pF2 = { ...pF, claudeSessionId: 'c-fork-own', backendSessionId: 'c-fork-own', forkedFrom: ['c-par'], _forkRequested: false }, f2Key = KDnow.convKeyOf(pF2), f2Sent = [];
  if (f2Key) await KDnow.sendKeptLines({ readyState: 1, send: (x) => f2Sent.push(x) }, f2Key, { ...KA(pr0), dataRoot: pr0, now: T0 + 2 });
  ok(pKey === 'claude-c-par' && fKey === null && fPut.ok === false && fPut.reason === 'not-started' && fPutAct.ok === false && fPutAct.reason === 'not-started' && fs.readFileSync(pfile, 'utf8') === 'parent now\n'
    && fKeep.ok === false && fKeep.refusals[0].why === 'not-started' && pressesAfter === pressesBefore && f2Key === 'claude-c-fork-own' && f2Sent.length === 0,
    '② A PENDING FORK HAS NO KEY (r4423 MUST 1): with its parent\'s borrowed id it draws nothing (the attach asks for a key first), its put-back and its keep are refused «not started» and write nothing (the parent\'s file untouched, no press folder); once it announces its own id, its own empty record', { fKey, fPut: fPut.reason, fKeep: fKeep.refusals, f2Key });
  // the key's shape (r4423 (b)): a slash, dot-dot, empty, over-long, a backend in capitals: no key; codex's id lives in the other field
  const shapes = [['a/b', 'claude'], ['..', 'claude'], ['', 'claude'], ['x'.repeat(101), 'claude'], ['c-ok', 'Claude']].map(([id, be]) => KDnow.convKeyOf({ backend: be, claudeSessionId: id }));
  const cx = KDnow.convKeyOf({ backend: 'codex', claudeSessionId: null, backendSessionId: 'th-1' });
  ok(shapes.every((k) => k === null) && cx === 'codex-th-1', '② THE KEY\'s SHAPE (r4423 (b)): a slash, «..», an empty id, 101 characters, a backend in capitals — no key; a codex conversation is keyed by its thread id (the other field)', { shapes, cx });
  // r4423: THE FENCES ARE THE KEYED SESSION's — the conversation's one live session; a page whose session is not running is refused
  const sNew = { mode: 'chat', backend: 'claude', claudeSessionId: 'c-par', pty: { write() { } }, _isStreaming: true };
  const fenced = await KDnow.putBack({ session: sNew, conv: KDnow.convKeyOf(sNew), press: pk0.press, by: HUMAN, dryRun: true, ...KA(pr0) });
  const gone = await KDnow.putBack({ session: undefined, conv: pKey, press: pk0.press, by: HUMAN, dryRun: true, ...KA(pr0) });
  ok(fenced.ok === false && fenced.reason === 'turn-running' && gone.ok === false && gone.reason === 'not-running',
    '② THE PUT-BACK\'s FENCES ARE THOSE OF THE SESSION THE KEY NAMES (r4423): the resumed session whose own id is the key — its running turn holds the put-back; a page whose session no longer runs is refused «not running»', { fenced: fenced.reason, gone: gone.reason });
  // r4423 MUST 2: a put-back over a record that CANNOT BE READ tells the bare patch — no door, no state (the page keeps what it drew)
  const tr4 = at2('torn4'), tw4 = at2('torn4w'), tf4 = path.join(tw4, 't.txt'); fs.writeFileSync(tf4, 't\n');
  const tk4 = await KDnow.keepFor({ session: { mode: 'chat' }, conv: 'claude-c-torn4', files: [tf4], by: HUMAN, now: T0, hex8: '0000fdfd', ...KA(tr4) });
  await KDnow.afterFilesPress({ mode: 'chat' }, 'claude-c-torn4', { ok: true, results: { kept: { press: tk4.press, machine: null, files: 1 }, files: { ok: true } } }, { broadcastToSession: () => { }, now: T0, ...KA(tr4) });
  fs.writeFileSync(path.join(tr4, 'claude-c-torn4', K.LINES_FILE), '{"v":1,"lines":[');   // torn after the line was drawn
  const told4 = [], putRows = { ok: true, rows: [{ path: tf4, act: 'overwrite', done: false, why: 'EACCES' }] };
  await KDnow.afterPutBack({ mode: 'chat' }, 'claude-c-torn4', tk4.press, putRows, { broadcastToSession: (sx, id, fr) => told4.push(fr.data), now: T0 + 5, ...KA(tr4) });
  const t4 = told4[0] || {};
  ok(told4.length === 1 && t4.unrecorded === true && t4.notPut === 1 && !('door' in t4) && !('state' in t4),
    '② A PUT-BACK OVER A RECORD THAT CANNOT BE READ (r4423 MUST 2): the told frame is the bare patch — no door, no state — so a copy that still stands keeps its door on every page', t4);
  // r4512: a put-back's PATCH never makes a line of its own — a readable record with no line for that press keeps none, and nobody is told
  const sl = at2('slr'), sln = path.join(sl, 'claude-c-sl'); fs.mkdirSync(sln, { recursive: true });
  await call('writeLines', { root: sln, lines: [{ press: K.pressIdOf(T0, '0000fe11'), at: T0, until: T0 + K.KEEP.lifeMs, state: 'kept', files: 1 }] });
  const slTold = [], slPress = K.pressIdOf(T0, '0000fe12');
  await KDnow.afterPutBack({ mode: 'chat' }, 'claude-c-sl', slPress, { ok: true, rows: [{ path: '/w/x', act: 'overwrite', done: false, why: 'EACCES' }] }, { broadcastToSession: (sx, id, fr) => slTold.push(fr), now: T0 + 3, ...KA(sl) });
  const slLines = (await call('readLines', { root: sln })).lines;
  ok(slLines.length === 1 && !slLines.some((l) => l.press === slPress) && slTold.length === 0,
    '② A PUT-BACK\'s PATCH NEVER MAKES A LINE OF ITS OWN (r4512): a readable record with no line for that press keeps none — a stateless line would never be drawn and would say nothing true of a copy — and nobody is told', { slLines: slLines.length, told: slTold.length });
  // r4423 (c): the forget's SECOND check — a note already queued when the forget lands writes nothing (placed: the chain held, no timing)
  const qr = at2('fq'); let openQ = null; const gateQ = new Promise((r) => { openQ = r; });
  const qcall = (op, payload) => (op === 'readLines' ? gateQ.then(() => call(op, payload)) : call(op, payload));
  const q1 = KDnow.noteLine('claude-c-q', { press: K.pressIdOf(T0, '0000fe01'), at: T0, until: T0 + K.KEEP.lifeMs, state: 'kept', files: 1 }, { dataRoot: qr, call: qcall, now: T0 });
  const q2 = KDnow.noteLine('claude-c-q', { press: K.pressIdOf(T0, '0000fe02'), at: T0, until: T0 + K.KEEP.lifeMs, state: 'kept', files: 1 }, { dataRoot: qr, call: qcall, now: T0 });
  await new Promise((r) => setImmediate(r));   // the first note is inside its (held) read; the second waits its turn behind it
  const qf = KDnow.forgetLines('claude-c-q', { dataRoot: qr });
  openQ(); const [qa, qb] = await Promise.all([q1, q2]); await qf;
  ok(!!qa && qb === null && !fs.existsSync(path.join(qr, 'claude-c-q', K.LINES_FILE)), '② THE FORGET\'s SECOND CHECK (r4423 (c)): a note already queued when the forget lands writes nothing (the chain held by a placed gate; the note before it lands and the forget then takes it)', { qa: !!qa, qb });
  // r2372 (1): the key is the CONVERSATION's — a resumed session (a new session id, the same conversation) draws the line and its door
  const sA = { mode: 'chat', backend: 'claude', claudeSessionId: 'c-res-1' }, sB = { mode: 'chat', backend: 'claude', claudeSessionId: 'c-res-1' };
  const ck = KDnow.convKeyOf(sA), rr = at2('resr'), rw = at2('resw'), rf = path.join(rw, 'r.txt'); fs.writeFileSync(rf, 'r\n');
  const rk = await KDnow.keepFor({ session: sA, conv: ck, files: [rf], by: HUMAN, now: T0, hex8: '0000f7f7', ...KA(rr) });
  const rTold = [];
  await KDnow.afterFilesPress(sA, ck, { ok: true, results: { kept: { press: rk.press, machine: null, files: 1 }, files: { ok: true } } }, { broadcastToSession: (sx, id, fr) => rTold.push([id, fr]), now: T0, sid: 'sess-before', ...KA(rr) });
  const rSent = []; await KDnow.sendKeptLines({ readyState: 1, send: (x) => rSent.push(JSON.parse(x)) }, KDnow.convKeyOf(sB), { ...KA(rr), dataRoot: rr, sid: 'sess-after', now: T0 + 1 });
  ok(ck === 'claude-c-res-1' && KDnow.convKeyOf({ backend: 'claude' }) === null && rTold.length === 1 && rTold[0][0] === 'sess-before' && rTold[0][1].sessionId === 'sess-before'
    && !!rSent[0] && rSent[0].sessionId === 'sess-after' && rSent[0].data.lines.length === 1 && rSent[0].data.lines[0].door === true,
    '② THE KEY IS THE CONVERSATION\'s (r2372 (1)): <backend>-<its own id>; the session that pressed is told on ITS id, and the RESUMED session (a new id) draws the same line WITH its door', { ck, told: rTold.map((x) => x[0]), sent: rSent[0] && rSent[0].sessionId });
  // r2372 (3): a look at the machines that fails tells NOTHING (never a false «gone»); the line is still recorded
  const fr2 = at2('failr'), fw2 = at2('failw'), ff2 = path.join(fw2, 'f.txt'); fs.writeFileSync(ff2, 'f\n');
  const fk2 = await KDnow.keepFor({ session: { mode: 'chat' }, conv: 'claude-c-fail', files: [ff2], by: HUMAN, now: T0, hex8: '0000f8f8', ...KA(fr2) });
  const noList = (op, payload) => (op === 'list' ? Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })) : call(op, payload));
  const fTold = [];
  const fv = await KDnow.afterFilesPress({ mode: 'chat' }, 'claude-c-fail', { ok: true, results: { kept: { press: fk2.press, machine: null, files: 1 }, files: { ok: true } } }, { broadcastToSession: (sx, id, fr) => fTold.push(fr), now: T0, dataRoot: fr2, call: noList });
  ok(fTold.length === 0 && fv === null && (await KDnow.linesOf('claude-c-fail', { now: T0 + 1, ...KA(fr2) })).length === 1,
    '② A LOOK AT THE MACHINES THAT FAILS tells NOTHING (r2372 (3): never a false «gone» to every client); the line is recorded all the same and an attach draws it', { told: fTold.length });
  // r2372 (4): a row whose KEPT COPY cannot be read is named apart — not counted as «the kept copy still holds them»
  const lr = at2('lostr'), lw = at2('lostw'), lf = path.join(lw, 'l.txt'); fs.writeFileSync(lf, 'l\n');
  const lk = await KDnow.keepFor({ session: { mode: 'chat' }, conv: 'claude-c-lost', files: [lf], by: HUMAN, now: T0, hex8: '0000f9f9', ...KA(lr) });
  await KDnow.afterFilesPress({ mode: 'chat' }, 'claude-c-lost', { ok: true, results: { kept: { press: lk.press, machine: null, files: 2 }, files: { ok: true } } }, { broadcastToSession: () => { }, now: T0, ...KA(lr) });
  await KDnow.afterPutBack({ mode: 'chat' }, 'claude-c-lost', lk.press, { ok: true, rows: [{ path: '/w/a', act: 'overwrite', done: false, why: 'kept-changed' }, { path: '/w/b', act: 'overwrite', done: false, why: 'EACCES' }] }, { broadcastToSession: () => { }, now: T0 + 9, ...KA(lr) });
  const ll = (await KDnow.linesOf('claude-c-lost', { now: T0 + 10, ...KA(lr) }))[0];
  ok(!!ll && ll.state === 'kept' && ll.door === true && ll.notPut === 1 && ll.keptLost === 1 && ll.triedAt === T0 + 9,
    '② A ROW WHOSE KEPT COPY CANNOT BE READ is named apart (r2372 (4)): one not put back that the copy holds, one the copy cannot give back', ll);
  }
  // THE REAL POOL (no `call`): the «rewind-keep» worker thread does the keep and its read-back
  const poolRoot = fs.mkdtempSync(path.join(SCRATCH, 'pool-'));
  const rp = await KD.keepFor({ session: { mode: 'chat' }, conv: 'conv-pool', files: [a], by: HUMAN, now: T0, hex8: '0000b7b7', dataRoot: poolRoot });
  await KD.closePool();
  ok(rp.ok && rp.check === 'sha256' && fs.readFileSync(path.join(rp.where, '0.bin'), 'utf8') === fs.readFileSync(a, 'utf8') && JSON.parse(fs.readFileSync(path.join(rp.where, K.MANIFEST_FILE), 'utf8')).files[0].sha256 === sha(fs.readFileSync(a)),
    '② THE REAL POOL: a keep through the «rewind-keep» SafeFs worker thread itself (its workerPath, its message shape): the copy, its read-back and the manifest', rp);
}

console.log('— ③ a paired machine (a stand-in agent with the agent\'s own file semantics)');
/** the agent's file actions over a scratch «device» (src/agentd/agentd.js FS_ACTIONS: stat FOLLOWS links, copy never overwrites) */
function standIn({ home, shortCopy = false, noPortable = false, deny = null, oldStat = false, linkCopy = false, hangCopy = false, hangList = false, slowPress = 0 } = {}) {
  const enoent = (p) => Object.assign(new Error(`ENOENT: no such file or directory, stat '${p}'`), { code: 'ENOENT' });
  const acts = [];
  // the client's ONE send point (src/agentd/client.js _request): an act without a valid string `by` is refused, never sent; a
  // policy that does not allow `files` refuses by name (src/device-policy.js op-not-allowed)
  const act = (name, by) => { if (typeof by !== 'string' || !/^human:[A-Za-z0-9]/.test(by)) throw Object.assign(new Error('act_without_by'), { code: 'act_without_by' }); if (deny === name) throw Object.assign(new Error('op-not-allowed: files'), { code: 'op-not-allowed' }); acts.push([name, by]); };
  return {
    acts,
    fsHome: async () => { if (noPortable) throw Object.assign(new Error('daemon lacks fs-portable (capabilities gate) -- upgrade the agent on this machine'), { code: 'host_needs_daemon' }); return { home }; },
    fsStat: async (p) => { let st; try { st = fs.statSync(p); } catch { throw enoent(p); } const out = { size: st.size, mtimeMs: st.mtimeMs, isDir: st.isDirectory(), mode: st.mode }; if (!oldStat) { let link = null; try { link = fs.lstatSync(p).isSymbolicLink(); } catch { } out.link = link; } return { ok: true, stat: out }; },
    fsList: async (p) => { if (hangList) return new Promise(() => { }); if (slowPress && /[\\/]kp-[0-9a-z]+-[0-9a-f]{8}$/.test(p)) await new Promise((r) => setTimeout(r, slowPress)); let names; try { names = fs.readdirSync(p, { withFileTypes: true }); } catch { throw enoent(p); } return { path: p, entries: names.map((e) => { let st = null; try { st = fs.statSync(path.join(p, e.name)); } catch { } return { name: e.name, isDir: e.isDirectory(), size: st ? st.size : 0, mtimeMs: st ? st.mtimeMs : 0 }; }) }; },
    fsMkdir: async (p, { by } = {}) => { act('mkdir', by); fs.mkdirSync(p, { recursive: true }); return { ok: true }; },
    fsWrite: async (p, buf, { by } = {}) => { act('write', by); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); return { ok: true }; },
    fsCopy: async (p, to, { by } = {}) => { act('copy', by); if (hangCopy) return new Promise(() => { }); if (linkCopy && !fs.existsSync(to)) { fs.symlinkSync(p, to); return { ok: true }; } fs.cpSync(p, to, { recursive: true, force: false, errorOnExist: false }); if (shortCopy && fs.statSync(to).isFile()) fs.truncateSync(to, Math.max(0, fs.statSync(to).size - 1)); return { ok: true }; },
    fsRename: async (p, to, { by } = {}) => { act('rename', by); fs.renameSync(p, to); return { ok: true }; },
    fsRm: async (p, recursive = false, { by } = {}) => { act('rm', by); fs.rmSync(p, { recursive: !!recursive, force: true }); return { ok: true }; },
  };
}
{
  const home = fs.mkdtempSync(path.join(SCRATCH, 'device-')), hubRoot = fs.mkdtempSync(path.join(SCRATCH, 'hub2-')), work = fs.mkdtempSync(path.join(SCRATCH, 'dwork-'));
  const a = path.join(work, 'a.txt'), l = path.join(work, 'l.txt');
  fs.writeFileSync(a, 'on the paired machine\n'); fs.symlinkSync('a.txt', l);
  const dm = standIn({ home }), session = { mode: 'chat', host: 'h-2' }, BY = { kind: 'human', actBy: 'human:tester' };
  const r = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: BY, now: T0, hex8: '0000a0a0', dataRoot: hubRoot, call, dm });
  const where = path.join(home, '.vibespace', 'agentd', 'rewind-kept', 'conv-p', K.pressIdOf(T0, '0000a0a0'));
  const hubMan = r.ok ? JSON.parse(fs.readFileSync(path.join(hubRoot, 'conv-p', r.press, K.MANIFEST_FILE), 'utf8')) : null;
  console.log(`    (paired keep: ${JSON.stringify(r)} · agent acts ${JSON.stringify(dm.acts.map(([x]) => x))})`);
  ok(r.ok && r.where === where && r.machine === 'h-2' && r.check === 'size' && fs.readFileSync(path.join(where, '0.bin'), 'utf8') === 'on the paired machine\n' && !fs.lstatSync(path.join(where, '0.bin')).isSymbolicLink()
    && !!hubMan && hubMan.check === 'size' && hubMan.files[0].kind === 'not-known' && hubMan.machine === 'h-2' && dm.acts.length > 0 && dm.acts.every(([, by]) => by === 'human:tester'),
    '③ a keep on a PAIRED machine: the copies ON that machine under the agent\'s own state, by its existing actions (each stamped with the person\'s own string `by` — the client refuses any other, the reader\'s MAJOR 1); «checked by size» and «not a link» (the agent\'s own lstat, for the original and for the copy); the kind «not known»; the manifest sealed at the hub too');
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
  // THE MUST on a paired machine: the agent's own lstat names a link — the original, or a copy that came out a link
  const lr = await KD.keepFor({ session, conv: 'conv-p', files: [a, l], by: BY, now: T0 + 9600, hex8: '0000c1c1', dataRoot: hubRoot, call, dm: standIn({ home }) });
  const lc = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: BY, now: T0 + 9700, hex8: '0000c2c2', dataRoot: hubRoot, call, dm: standIn({ home, linkCopy: true }) });
  const lo = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: BY, now: T0 + 9800, hex8: '0000c3c3', dataRoot: hubRoot, call, dm: standIn({ home, oldStat: true }) });
  const pdir = (t, h) => path.join(home, '.vibespace', 'agentd', 'rewind-kept', 'conv-p', K.pressIdOf(t, h));
  ok(!lr.ok && JSON.stringify(lr.refusals) === JSON.stringify([{ path: l, why: 'link' }]) && !lc.ok && lc.refusals[0].why === 'not-kept' && !lo.ok && lo.refusals[0].why === 'agent-too-old'
    && [[T0 + 9600, '0000c1c1'], [T0 + 9700, '0000c2c2'], [T0 + 9800, '0000c3c3']].every(([t, h]) => !fs.existsSync(pdir(t, h))),
    '③ A LINK ON A PAIRED MACHINE (the round wqdnv452s): its agent\'s own lstat says so — «cannot keep a copy: a link»; a copy that came out a link: not kept; an agent whose stat does not say it: «upgrade the agent» (each folder removed)', { lr: lr.refusals, lc: lc.refusals, lo: lo.refusals });
  // a temp a cut-short put-back left beside the file goes FIRST (the agent's copy never overwrites: it would be renamed over)
  fs.writeFileSync(a, 'a as kept for the temp leg\n');
  const r7 = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: BY, now: T0 + 9890, hex8: '0000c7c7', dataRoot: hubRoot, call, dm });
  fs.writeFileSync(a, 'after the rewind, again\n');
  fs.writeFileSync(`${a}.${r7.press}.vs-tmp`, 'a stale half of an old put-back');
  const pt = await KD.putBack({ session, conv: 'conv-p', press: r7.press, by: BY, dryRun: true, dataRoot: hubRoot, call, dm });
  const dt = await KD.putBack({ session, conv: 'conv-p', press: r7.press, by: BY, expect: pt.rows, now: T0 + 9900, hex8: '0000c4c4', dataRoot: hubRoot, call, dm });
  ok(r7.ok && dt.ok && dt.rows[0].done === true && fs.readFileSync(a, 'utf8') === 'a as kept for the temp leg\n' && !fs.existsSync(`${a}.${r7.press}.vs-tmp`),
    '③ a stale temp of an old put-back beside the file: removed FIRST, then the kept copy copied and renamed over — the person\'s file holds the kept bytes, never the stale half', dt.rows);
  // every agent act carries the person's own stamp — the owner's when the socket names no one
  const ownerDm = standIn({ home });
  const ro = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: { kind: 'human', actBy: null }, now: T0 + 9950, hex8: '0000c5c5', dataRoot: hubRoot, call, dm: ownerDm });
  ok(ro.ok && ownerDm.acts.length >= 4 && ownerDm.acts.every(([, by]) => by === 'human:owner'), '③ a socket with no sign-in subject: EVERY agent act stamped human:owner (the person, never another string)', ownerDm.acts);
  // THE REAL AGENT's stat action (r1859 (3)): src/agentd/agentd.js run as its own fs worker (the role its pool starts it in) —
  // the field the keep reads is the one the agent says, not a hand copy of it
  const { Worker } = await import('node:worker_threads');
  // (r1992 (1)) its error and its exit fail every wait BY NAME, and its end is in a finally: a worker that does not load never hangs the suite
  const agentW = new Worker(path.join(REPO, 'src/agentd/agentd.js'), { workerData: { role: 'agentd-worker' } });
  let wid = 0, agentFault = null; const waits = new Map();
  const failAll = (why) => { agentFault = agentFault || why; for (const [, r] of waits) r({ error: why, code: 'EAGENTWORKER' }); waits.clear(); };
  agentW.on('message', (m) => { const r = waits.get(m.id); if (r) { waits.delete(m.id); r(m); } });
  agentW.on('error', (e) => failAll(`the agent's fs worker failed: ${(e && e.message) || e}`));
  agentW.on('exit', (code) => failAll(`the agent's fs worker exited (${code}) before it answered`));
  const realStat = (p) => new Promise((resolve, reject) => { if (agentFault) { reject(Object.assign(new Error(agentFault), { code: 'EAGENTWORKER' })); return; } const id = ++wid; waits.set(id, (m) => (m.error ? reject(Object.assign(new Error(m.error), { code: m.code })) : resolve({ ok: m.ok, stat: m.stat }))); agentW.postMessage({ id, action: 'stat', path: p }); });
  const realDm = { ...standIn({ home }), fsStat: realStat };
  let sl = { stat: {} }, sa = { stat: {} }, rlr = { ok: true, refusals: [] }, rar = { ok: false }, realErr = null;
  try {
    sl = await realStat(l); sa = await realStat(a);
    rlr = await KD.keepFor({ session, conv: 'conv-p', files: [a, l], by: BY, now: T0 + 9970, hex8: '0000c8c8', dataRoot: hubRoot, call, dm: realDm });
    rar = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: BY, now: T0 + 9971, hex8: '0000c8c9', dataRoot: hubRoot, call, dm: realDm });
  } catch (e) { realErr = (e && e.message) || String(e); } finally { agentW.removeAllListeners('exit'); await agentW.terminate(); }
  if (realErr || agentFault) console.log(`    (the real agent's worker: ${realErr || agentFault})`);
  ok(!realErr && !agentFault && sl.stat.link === true && sa.stat.link === false && !rlr.ok && JSON.stringify(rlr.refusals) === JSON.stringify([{ path: l, why: 'link' }]) && rar.ok && rar.check === 'size',
    '③ THE REAL AGENT\'s stat (src/agentd/agentd.js, its own fs worker): it says link: true for a link and false for a plain file; through it the keep refuses the link by name and keeps the file', { link: sl.stat.link, file: sa.stat.link, rlr: rlr.refusals, rar: rar.ok });
  // the ONE bound holds inside one conversation's walk of presses too (r1859 (4)): each press folder's list is slow, the walk is not
  const slowDm = standIn({ home, slowPress: 60 });
  const hp = await KD.keepableOf({ session, conv: 'conv-p', files: [a], by: BY, now: T0, dataRoot: hubRoot, call, dm: slowDm, allMs: 40 });
  ok(!hp.ok && hp.refusals[0].why === 'no-time', '③ the bound inside ONE conversation\'s walk: its press folders listed past the one bound — no-time, the total never guessed', hp.refusals);
  // the bounds: each agent call (here 40 ms) and the walk of the machine's kept copies (here none left) — past them: no-time.
  // The door's bound timers are unref'd (they never hold the hub open): this ref'd interval holds the suite's loop meanwhile
  const alive = setInterval(() => { }, 20);
  const hc = await KD.keepFor({ session, conv: 'conv-p', files: [a], by: BY, now: T0 + 9960, hex8: '0000c6c6', dataRoot: hubRoot, call, dm: standIn({ home, hangCopy: true }), callMs: 40 });
  const hl = await KD.keepableOf({ session, conv: 'conv-p', files: [a], by: BY, now: T0, dataRoot: hubRoot, call, dm: standIn({ home }), allMs: -1 });
  const hw = await KD.keepableOf({ session, conv: 'conv-p', files: [a], by: BY, now: T0, dataRoot: hubRoot, call, dm: standIn({ home, hangList: true }), callMs: 40 });
  clearInterval(alive);
  ok(!hc.ok && hc.refusals[0].why === 'no-time' && !hl.ok && hl.refusals[0].why === 'no-time' && !hw.ok && hw.refusals[0].why === 'no-time',
    '③ THE BOUNDS: an agent copy that never answers ends at its bound (no-time, no press); the walk of the machine\'s kept copies past its one bound, or a listing that never answers: no-time — the total is never guessed', { hc: hc.refusals, hl: hl.refusals, hw: hw.refusals });
}

console.log('— red controls');
{
  const hubAt = (tag) => fs.mkdtempSync(path.join(SCRATCH, tag + '-'));
  const noHash = M.load('src/rewind-kept.js', anchored(SRC, ' && b.sha256 === b.srcSha256', '', 'kept: no hash compare'), 'no-hash');
  ok(noHash.readBackOf([{ n: 0, path: '/w/a', kind: 'file', size: 1 }], { 0: { ok: true, sha256: 'a'.repeat(64), srcSha256: 'b'.repeat(64), size: 1 } }).ok === true, 'RED CONTROL (no hash compare): a copy whose bytes differ reads kept');
  const noSize = M.load('src/rewind-kept.js', anchored(SRC, 'b.size === r.size && b.srcSize === r.size', 'true', 'kept: no size compare'), 'no-size');
  ok(noSize.readBackOf([{ n: 0, path: '/w/a', kind: 'not-known', size: 10 }], { 0: { ok: true, size: 9, srcSize: 10, isLink: false, srcIsLink: false } }, { paired: true }).ok === true, 'RED CONTROL (no size compare — a paired machine): a kept copy shorter than its original reads kept');
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
  const presses = fs.readdirSync(path.join(root, 'c-nf'));
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
  // the round wqdnv452s's cures, each with its red
  const linkKept = M.load('src/rewind-kept.js', anchored(SRC, "    if (kind === 'link') { refusals.push({ path, why: 'link' }); return; }   // the rewind writes THROUGH it: no copy of a link keeps its bytes\n", '', 'kept: links planned'), 'link-kept');
  ok(linkKept.keepPlanOf([{ path: '/w/l', mode: 0o120777, size: 4, mtimeMs: T0 }]).ok === true, 'RED CONTROL (links planned): a listed LINK reads keepable — its copy would hold the link, not the bytes the rewind writes through it');
  const linkUnread = M.load('src/rewind-kept.js', anchored(SRC, ' && b.isLink === false && b.srcIsLink === false', '', 'kept: the copy\'s link unread'), 'link-unread');
  ok(linkUnread.readBackOf([{ n: 0, path: '/w/a', kind: 'not-known', size: 10 }], { 0: { ok: true, size: 10, srcSize: 10, isLink: true, srcIsLink: false } }, { paired: true }).ok === true, 'RED CONTROL (a paired copy\'s link unread): a kept copy that came out a link reads kept');
  const staleKept = M.load('src/server/rewind-kept-door.js', anchored(DSRC, "      await B(dm.fsRm(tmp, false, { by }));   // a temp a cut-short act left goes FIRST: the agent's copy never overwrites, so a stale one would be renamed over\n", '', 'kept: the stale temp not dropped'), 'stale-tmp');
  const sh = hubAt('sth'), shome = hubAt('std'), sw2 = hubAt('stw'), sa = path.join(sw2, 'a.txt'), sdm = standIn({ home: shome }), sses = { mode: 'chat', host: 'h-2' }, SBY = { kind: 'human', actBy: 'human:tester' };
  fs.writeFileSync(sa, 'kept bytes\n');
  const sk = await staleKept.keepFor({ session: sses, conv: 'c-st', files: [sa], by: SBY, now: T0, hex8: '0000d1d1', dataRoot: sh, call, dm: sdm });
  fs.writeFileSync(sa, 'after\n'); fs.writeFileSync(`${sa}.${sk.press}.vs-tmp`, 'stale half');
  const spl = await staleKept.putBack({ session: sses, conv: 'c-st', press: sk.press, by: SBY, dryRun: true, dataRoot: sh, call, dm: sdm });
  await staleKept.putBack({ session: sses, conv: 'c-st', press: sk.press, by: SBY, expect: spl.rows, now: T0 + 1, hex8: '0000d2d2', dataRoot: sh, call, dm: sdm });
  ok(sk.ok && fs.readFileSync(sa, 'utf8') === 'stale half', 'RED CONTROL (the stale temp not dropped first — a paired machine): the stale half is renamed over the person\'s file and the row reads done');
  const inAtt = M.load('src/server/rewind-kept-door.js', anchored(DSRC, "const DATA_ROOT = path.join(__dirname, '..', '..', 'data', 'rewind-kept');", "const DATA_ROOT = path.join(__dirname, '..', '..', 'data', 'chat-attachments');", 'kept: inside the attachments'), 'in-att');   // stale-pins: kept — the control PLANTS the old kept root inside the attachments' folder
  const d2 = hubAt('att'), att2 = path.join(d2, 'chat-attachments'), wa2 = path.join(hubAt('attw'), 'w.txt');
  fs.mkdirSync(path.join(att2, 'c-old', 'files'), { recursive: true }); fs.writeFileSync(path.join(att2, 'c-old', 'files', 'drop.png'), 'png'); fs.writeFileSync(wa2, 'kept\n');
  const rk2 = await inAtt.keepFor({ session: { mode: 'chat' }, conv: 'c-old', files: [wa2], by: HUMAN, now: T0, hex8: '0000d3d3', ...KA(path.join(d2, path.basename(inAtt.DATA_ROOT))) });
  const o2 = await CA.create({ root: att2, log: { log() { } } }).orphans();
  ok(rk2.ok && o2.files > 1, `RED CONTROL (the kept copies inside the attachments' folder): the «remove what is left» counts the kept copies as dropped files (${o2.files} files)`);
  const sweepAll = M.load('src/server/rewind-kept-door.js', anchored(DSRC, 'const entries = await road.listAll(), keep = new Set([...spare, ...PUTTING]);', 'const entries = await road.listAll(), keep = new Set(spare);', 'kept: a put-back\'s press swept'), 'sweep-all');   // stale-pins: kept — the control PLANTS the old sweep that spared no put-back
  const rr = hubAt('swr'), rw2 = hubAt('sww'), ra = path.join(rw2, 'r.txt'), rp9 = K.pressIdOf(T0 - 9 * DAY, '0000d4d4');
  fs.writeFileSync(ra, 'r as it was\n');
  await sweepAll.keepFor({ session: { mode: 'chat' }, conv: 'c-r5', files: [ra], by: HUMAN, now: T0 - 9 * DAY, hex8: '0000d4d4', ...KA(rr) });
  fs.utimesSync(path.join(rr, 'c-r5', rp9), new Date(T0 - 9 * DAY), new Date(T0 - 9 * DAY)); fs.writeFileSync(ra, 'r changed\n');
  let mk = null;
  const mid2 = (op, payload) => (op === 'putOne' && !mk ? Promise.resolve().then(async () => { mk = await sweepAll.keepFor({ session: { mode: 'chat' }, conv: 'c-r6', files: [ra], by: HUMAN, now: T0 + 1, hex8: '0000d5d5', ...KA(rr) }); return call(op, payload); }) : call(op, payload));
  const rpl = await sweepAll.putBack({ session: { mode: 'chat' }, conv: 'c-r5', press: rp9, by: HUMAN, dryRun: true, dataRoot: rr, call: mid2 });
  await sweepAll.putBack({ session: { mode: 'chat' }, conv: 'c-r5', press: rp9, by: HUMAN, expect: rpl.rows, now: T0 + 2, hex8: '0000d6d6', dataRoot: rr, call: mid2 }).catch(() => null);
  ok(!!mk && mk.ok && mk.swept.includes(rp9), 'RED CONTROL (a press being put back swept): another conversation\'s keep in the middle of the put-back removes the press it is putting back');
  // r1859's follow, its reds
  const twoAtOnce = M.load('src/server/rewind-kept-door.js', anchored(DSRC, "  if ((session && RQ.rewindOut(session, Date.now())) || PUTTING.has(press)) return { ok: false, reason: 'pending', cls: 'cannot' };\n", '', 'kept: one put-back of a press at a time'), 'two-at-once');
  const tr = hubAt('two'), tw = hubAt('twow'), ta = path.join(tw, 't.txt'); fs.writeFileSync(ta, 't as kept\n');
  const tk = await twoAtOnce.keepFor({ session: { mode: 'chat' }, conv: 'c-two', files: [ta], by: HUMAN, now: T0, hex8: '0000d7d7', ...KA(tr) });
  fs.writeFileSync(ta, 't after\n');
  const ts = { mode: 'chat' };
  const tp = await twoAtOnce.putBack({ session: ts, conv: 'c-two', press: tk.press, by: HUMAN, dryRun: true, ...KA(tr) });
  const [, t2] = await twoPutBacks(twoAtOnce, { session: ts, conv: 'c-two', press: tk.press, expect: tp.rows, dataRoot: tr });
  ok(t2.ok === true, 'RED CONTROL (two put-backs of one press side by side): the second client\'s press goes out while the first is acting');
  const walkUnbound = M.load('src/server/rewind-kept-door.js', anchored(DSRC, "      if (!e || !e.isDir || !K.PRESS_RE.test(e.name)) continue;\n      if (Date.now() - t0 > allMs) throw pastBound();\n", "      if (!e || !e.isDir || !K.PRESS_RE.test(e.name)) continue;\n", 'kept: one conversation\'s walk unbound'), 'walk-unbound');
  const wh = hubAt('wbh'), whome = hubAt('wbd'), wf = path.join(hubAt('wbw'), 'w.txt'), wses = { mode: 'chat', host: 'h-2' }, WBY = { kind: 'human', actBy: 'human:tester' };
  fs.writeFileSync(wf, 'w\n');
  for (const [t, h] of [[T0 - 3000, '0000e1e1'], [T0 - 2000, '0000e2e2'], [T0 - 1000, '0000e3e3']]) await walkUnbound.keepFor({ session: wses, conv: 'c-wb', files: [wf], by: WBY, now: t, hex8: h, dataRoot: wh, call, dm: standIn({ home: whome }) });
  const wu = await walkUnbound.keepableOf({ session: wses, conv: 'c-wb', files: [wf], by: WBY, now: T0, dataRoot: wh, call, dm: standIn({ home: whome, slowPress: 60 }), allMs: 40 });
  ok(wu.ok === true, 'RED CONTROL (one conversation\'s walk unbound): its slow press folders are all listed past the one bound and the confirm answers');
  // U3's red: a line never written to its record does not survive the hub's restart
  const noWrite = M.load('src/server/rewind-kept-door.js', anchored(DSRC, "    await hub.writeLines(i >= 0 ? lines.map((l, k) => (k === i ? line : l)) : cappedOf(lines.concat([line]), Number(opts.now) || Date.now()));\n", '', 'kept: lines never written'), 'no-write');
  const nr = hubAt('nwl'), nw = hubAt('nwlw'), nf = path.join(nw, 'n.txt'); fs.writeFileSync(nf, 'n\n');
  const nk = await noWrite.keepFor({ session: { mode: 'chat' }, conv: 'c-nw', files: [nf], by: HUMAN, now: T0, hex8: '0000cbcb', ...KA(nr) });
  await noWrite.afterFilesPress({ mode: 'chat' }, 'c-nw', { ok: true, results: { kept: { press: nk.press, machine: null, files: 1 }, files: { ok: true } } }, { broadcastToSession: () => { }, now: T0, ...KA(nr) });
  ok((await KD.linesOf('c-nw', { now: T0 + 1, ...KA(nr) })).length === 0, 'RED CONTROL (a kept line never written to its record): after the hub restarts the conversation shows no line of what was done to its files');
  const bySession = M.load('src/server/rewind-kept-door.js', anchored(DSRC, '  const id = addressableId(session);', '  const id = session && session.sessionId;', 'kept: keyed by the session'), 'by-session');
  { const a = { mode: 'chat', backend: 'claude', sessionId: 'sess-1', claudeSessionId: 'c-red-1' }, b = { mode: 'chat', backend: 'claude', sessionId: 'sess-2', claudeSessionId: 'c-red-1' };
    const br = hubAt('bysr'), bw = hubAt('bysw'), bf = path.join(bw, 'b.txt'); fs.writeFileSync(bf, 'b\n');
    const bk = await bySession.keepFor({ session: { mode: 'chat' }, conv: bySession.convKeyOf(a), files: [bf], by: HUMAN, now: T0, hex8: '0000fafa', ...KA(br) });
    await bySession.afterFilesPress(a, bySession.convKeyOf(a), { ok: true, results: { kept: { press: bk.press, machine: null, files: 1 }, files: { ok: true } } }, { broadcastToSession: () => { }, now: T0, ...KA(br) });
    const bs = []; await bySession.sendKeptLines({ readyState: 1, send: (x) => bs.push(x) }, bySession.convKeyOf(b), { ...KA(br), dataRoot: br, now: T0 + 1 });
    ok(bs.length === 0, 'RED CONTROL (the record keyed by the session): after a resume the conversation shows no line — a seven-day copy with no door'); }
  const borrowed = M.load('src/server/rewind-kept-door.js', anchored(DSRC, '  const id = addressableId(session);', '  const id = session && (session.claudeSessionId || session.backendSessionId);', 'kept: a borrowed id taken for the key'), 'borrowed');   // stale-pins: kept (a red control: it plants the old line)
  { const P = { mode: 'chat', backend: 'claude', claudeSessionId: 'c-bpar' }, Fk = { mode: 'chat', backend: 'claude', claudeSessionId: 'c-bpar', backendSessionId: 'c-bpar', _forkRequested: true };
    const br2 = hubAt('borr'), bw2 = hubAt('borw'), bf2 = path.join(bw2, 'b.txt'); fs.writeFileSync(bf2, 'b\n');
    const bk2 = await borrowed.keepFor({ session: P, conv: borrowed.convKeyOf(P), files: [bf2], by: HUMAN, now: T0, hex8: '0000ff01', ...KA(br2) });
    await borrowed.afterFilesPress(P, borrowed.convKeyOf(P), { ok: true, results: { kept: { press: bk2.press, machine: null, files: 1 }, files: { ok: true } } }, { broadcastToSession: () => { }, now: T0, ...KA(br2) });
    const fsent = []; const fk = borrowed.convKeyOf(Fk); if (fk) await borrowed.sendKeptLines({ readyState: 1, send: (x) => fsent.push(x) }, fk, { ...KA(br2), dataRoot: br2, now: T0 + 1 });
    ok(fsent.length === 1, 'RED CONTROL (the key from a borrowed id — 6718d50db): a pending fork\'s window draws its PARENT\'s kept lines, doors and all'); }
  const oldMap = M.load('src/server/rewind-kept-door.js', anchored(DSRC, '  const views = got.map((l) => (l.unrecorded && !l.state ? { ...l } : { ...viewOf(l, here, now), ...(l.unrecorded ? { unrecorded: true } : {}) }));', '  const views = got.map((l) => ({ ...viewOf(l, here, now), ...(l.unrecorded ? { unrecorded: true } : {}) }));', 'kept: the old told map'), 'old-map');
  { const tr5 = hubAt('t5r'), tw5 = hubAt('t5w'), tf5 = path.join(tw5, 't.txt'); fs.writeFileSync(tf5, 't\n');
    const tk5 = await oldMap.keepFor({ session: { mode: 'chat' }, conv: 'claude-c-t5', files: [tf5], by: HUMAN, now: T0, hex8: '0000ff02', ...KA(tr5) });
    await oldMap.afterFilesPress({ mode: 'chat' }, 'claude-c-t5', { ok: true, results: { kept: { press: tk5.press, machine: null, files: 1 }, files: { ok: true } } }, { broadcastToSession: () => { }, now: T0, ...KA(tr5) });
    fs.writeFileSync(path.join(tr5, 'claude-c-t5', K.LINES_FILE), '{"v":1,"lines":[');
    const t5 = []; await oldMap.afterPutBack({ mode: 'chat' }, 'claude-c-t5', tk5.press, { ok: true, rows: [{ path: tf5, act: 'overwrite', done: false, why: 'EACCES' }] }, { broadcastToSession: (sx, id, fr) => t5.push(fr.data), now: T0 + 5, ...KA(tr5) });
    ok(!!t5[0] && t5[0].door === false, 'RED CONTROL (the old told map): a put-back over an unreadable record tells «door: false» over a copy that still stands'); }
  const oneCheck = M.load('src/server/rewind-kept-door.js', anchored(DSRC, '    if (FORGOTTEN.has(conv)) return null;   // forgotten while this note waited its turn\n', '', 'kept: the forget\'s second check gone'), 'one-check');
  { const q5 = hubAt('q5'); let open5 = null; const g5 = new Promise((r) => { open5 = r; });
    const c5 = (op, payload) => (op === 'readLines' ? g5.then(() => call(op, payload)) : call(op, payload));
    const a5 = oneCheck.noteLine('claude-c-q5', { press: K.pressIdOf(T0, '0000ff03'), at: T0, until: T0 + K.KEEP.lifeMs, state: 'kept', files: 1 }, { dataRoot: q5, call: c5, now: T0 });
    const b5 = oneCheck.noteLine('claude-c-q5', { press: K.pressIdOf(T0, '0000ff04'), at: T0, until: T0 + K.KEEP.lifeMs, state: 'kept', files: 1 }, { dataRoot: q5, call: c5, now: T0 });
    await new Promise((r) => setImmediate(r));
    const f5 = oneCheck.forgetLines('claude-c-q5', { dataRoot: q5 });
    open5(); const [, bb5] = await Promise.all([a5, b5]); await f5;
    ok(bb5 !== null, 'RED CONTROL (the forget\'s second check gone): a note already queued when the forget lands writes its line for a forgotten conversation'); }
  const patchLine = M.load('src/server/rewind-kept-door.js', anchored(DSRC, "    if (i < 0 && !patch.state) { try { console.warn(`[rewind-kept] a patch for ${patch.press} of ${conv}, which has no line — not recorded`); } catch { } return null; }\n", '', 'kept: a patch makes a line'), 'patch-line');
  { const pr7 = hubAt('plr7'), pn7 = path.join(pr7, 'claude-c-p7'); fs.mkdirSync(pn7, { recursive: true });
    await call('writeLines', { root: pn7, lines: [] });
    const pp7 = K.pressIdOf(T0, '0000ff07');
    await patchLine.afterPutBack({ mode: 'chat' }, 'claude-c-p7', pp7, { ok: true, rows: [{ path: '/w/x', act: 'overwrite', done: false, why: 'EACCES' }] }, { broadcastToSession: () => { }, now: T0 + 3, ...KA(pr7) });
    const l7 = (await call('readLines', { root: pn7 })).lines;
    ok(l7.some((l) => l.press === pp7 && !l.state), 'RED CONTROL (a patch makes a line): a put-back\'s try over a record with no line for its press stores a line with no state, never drawn'); }
  const noCap = M.load('src/server/rewind-kept-door.js', anchored(DSRC, 'cappedOf(lines.concat([line]), Number(opts.now) || Date.now())', 'lines.concat([line]).slice(-LINES_MAX)', 'kept: the cap drops the oldest whatever it holds'), 'no-cap');   // stale-pins: kept (a red control: it plants the old text)
  const cr2 = hubAt('capr'), live9 = K.pressIdOf(T0 - 5000, '0000e0e0');
  await call('writeLines', { root: path.join(cr2, 'conv-cap'), lines: [{ press: live9, at: T0 - 5000, until: T0 + K.KEEP.lifeMs, state: 'kept', files: 1 }, ...Array.from({ length: KD.LINES_MAX - 1 }, (_, i) => ({ press: K.pressIdOf(T0 - 4000 + i, (0xe100 + i).toString(16).padStart(8, '0')), at: T0 - 4000 + i, until: T0 + K.KEEP.lifeMs, state: 'put-back' }))] });
  await noCap.noteLine('conv-cap', { press: K.pressIdOf(T0, '0000efef'), at: T0, until: T0 + K.KEEP.lifeMs, state: 'kept', files: 1 }, { now: T0, ...KA(cr2) });
  ok(!(await call('readLines', { root: path.join(cr2, 'conv-cap') })).lines.some((l) => l.press === live9), 'RED CONTROL (the cap drops the oldest whatever it holds): a line whose copy still stands loses its only door');
}

report();
