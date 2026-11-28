#!/usr/bin/env node
// test-progress-archive (fast, in-process) — 2.369.204, the owner 2026-10-03 "进展记录不再删除": a Task Group's
// Activity log keeps its newest 500 entries live and MOVES the overflow to data/task-groups-archive/<taskId>/<YYYY-MM>.ndjson
// (append-only, through the store writer since B-0248 step 3 (c): the live list is trimmed only once the append LANDED).
// Judged on the REAL store in a scratch data dir: nothing is
// lost, a crash duplicate is read once, pages walk the whole log by `before` within a byte budget, a clear reaches the
// archive copy (ONE month file rewritten), a delete takes the directory, a config bundle carries it — each rule bitten
// by a patched copy of src/task-groups.js (scripts/mutant-copy.mjs).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { anchored } from './scratch.mjs';   // a control's edit through the one door (B-0248 step 3 (c) follow)
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(repo, 'src/task-groups.js'), 'utf8');
const RC = require(path.join(repo, 'src/record-clear.js'));
const MUT = mutantCopies('progress-archive', repo);
let passed = 0, failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + JSON.stringify(e).slice(0, 600) : ''}`); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); check(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-parch-'));
let seq = 0;
const freshDir = () => { const d = path.join(tmpRoot, String(++seq)); fs.mkdirSync(d, { recursive: true }); return d; };
const patched = (from, to, tag) => { if (!SRC.includes(from)) throw new Error(`control anchor gone: ${tag}`); return MUT.load('src/task-groups.js', editAnchor(SRC, from, to, "src/task-groups.js"), tag); };
const REAL = require(path.join(repo, 'src/task-groups.js'));
const mk = (M = REAL, dir = freshDir()) => { const tg = new M.TaskGroupManager({ dataDir: dir, onChange: () => {} }); const t = tg.create({ title: 'arch' }); return { tg, id: t.id, dir }; };
const archDir = (w) => path.join(w.dir, 'task-groups-archive', w.id);
const archLines = (w) => { try { return fs.readdirSync(archDir(w)).sort().flatMap((f) => fs.readFileSync(path.join(archDir(w), f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))); } catch { return []; } };
/** n entries written straight into the live list (the store's own shape), then one addProgress = the real overflow path */
const seed = (w, n, t0 = Date.UTC(2026, 8, 30, 23, 0), step = 60e3) => {
  const t = w.tg._state.tasks[w.id];
  t.progress = Array.from({ length: n }, (_, i) => ({ id: 'P-' + (0x100000 + i).toString(16), at: t0 + i * step, note: `note ${i}`, ...(i % 7 === 0 ? { detail: `detail ${i}` } : {}), session: i % 2 ? 'claude:a' : 'claude:b' }));
};
// B-0248 step 3 (c): the appends go through the process's store writer (its thread) — a leg lands them (and the trim's save) before it reads
const SW = require(path.join(repo, 'src/store-writer.js')).storeWriter();
const land = () => { for (let i = 0; i < 4; i++) SW.flushSync(); };
const monthKey = (at) => new Date(at).toISOString().slice(0, 7);
/** a crash between the append and the trim: `p` written straight into its month file while it is still live */
const crashDup = (w, p) => { fs.mkdirSync(archDir(w), { recursive: true }); fs.appendFileSync(path.join(archDir(w), monthKey(p.at) + '.ndjson'), JSON.stringify(p) + '\n'); };
// the belts of a clear of an entry still owed, as anchors for the controls (each belt alone holds; all three cut is red)
const SETTLE_LINE = "    if (archivableId(id) && months.size) { const why = this._archiveSettle([...months.keys()].map((m) => path.join(this._archiveRoot, id, m + '.ndjson'))); if (why) throw ARCHIVE_BUSY(why); }";
const BELT = {
  snap: [['      q.ids.add(p.id); this._archQ.set(file, q);', '      q.ids.add(p.id); (q.snap || (q.snap = new Map())).set(p.id, { ...p }); this._archQ.set(file, q);'], ["    const live = new Map(((t && t.progress) || []).filter((p) => p && p.id).map((p) => [p.id, p]));", '    const live = q.snap || new Map();']],
  settle: [[SETTLE_LINE, '    void 0;']],
  late: [['      for (const x of fly) { const p = byId.get(x.id); if (p && p.clearedAt && p.clearedAt !== x.clearedAt) this._archiveClear(', '      for (const x of []) { const p = byId.get(x.id); if (p && p.clearedAt && p.clearedAt !== x.clearedAt) this._archiveClear(']],
};
const cuts = (pairs, tag) => MUT.load('src/task-groups.js', pairs.reduce((src, [a, b]) => { if (src.split(a).length !== 2) throw new Error('control anchor gone: ' + tag); return editAnchor(src, a, b, "src/task-groups.js"); }, SRC), tag);
const walk = (w, limit = 100) => { const all = []; let before = null, pages = 0, r; do { r = w.tg.readProgress(w.id, { before, limit }); all.push(...r.entries); if (r.entries.length) before = r.entries[r.entries.length - 1].at; pages++; } while (r.more && pages < 500); return { all, pages }; };

console.log('① the overflow is MOVED, never dropped (written before the trim; a failed write keeps it live)');
const ruleMoved = (M) => { const w = mk(M); seed(w, 500); for (let i = 0; i < 12; i++) w.tg.addProgress(w.id, { note: `fresh ${i}`, session: 'claude:a' }); land(); const live = w.tg.get(w.id).progress; const arch = archLines(w); const ids = new Set([...arch, ...live].map((p) => p.id)); return { live: live.length, arch: arch.length, union: ids.size, oldestArchived: arch[0] && arch[0].note }; };
{ const r = ruleMoved(REAL); check('500 live + 12 added ⇒ 500 live, 12 archived, 512 distinct entries (nothing lost)', r.live === 500 && r.arch === 12 && r.union === 512 && r.oldestArchived === 'note 0', r); }
{ const M = patched('t.progress = this._keepLive(id, t.progress);', 't.progress = t.progress.slice(-500);', 'dropped'); const r = ruleMoved(M); check('CONTROL: the pre-lane trim (slice(-500), no archive) loses the 12 — the rule above goes red', r.union === 500 && r.arch === 0, r); }
{ const w = mk(); seed(w, 500); fs.mkdirSync(path.join(w.dir, 'task-groups-archive'), { recursive: true }); fs.writeFileSync(archDir(w), 'not a dir'); const warn = console.warn; console.warn = () => {}; try { w.tg.addProgress(w.id, { note: 'x' }); land(); } finally { console.warn = warn; } check('a failed archive append keeps the overflow LIVE (501 entries), never a loss', w.tg.get(w.id).progress.length === 501);
  fs.rmSync(archDir(w), { force: true }); land(); check('…and once the storage answers, the retry lands it (500 live, 1 archived)', w.tg.get(w.id).progress.length === 500 && archLines(w).length === 1); }
{ const M = patched('    if (list.length <= LIVE_PROGRESS || !archivableId(id)) return list;\n    for (const p of list.slice(0, list.length - LIVE_PROGRESS)) {', '    if (list.length <= LIVE_PROGRESS || !archivableId(id)) return list;\n    if (list) { for (const p of list.slice(0, list.length - LIVE_PROGRESS)) if (p && p.id) { const file = path.join(this._archiveRoot, id, monthOf(p.at) + \'.ndjson\'); const q = this._archQ.get(file) || { gid: id, month: monthOf(p.at), ids: new Set(), flying: null }; q.ids.add(p.id); this._archQ.set(file, q); this._archiveAsk(file); } return list.slice(-LIVE_PROGRESS); }\n    for (const p of list.slice(0, list.length - LIVE_PROGRESS)) {', 'trim-at-once');
  const w = mk(M); seed(w, 500); fs.mkdirSync(path.join(w.dir, 'task-groups-archive'), { recursive: true }); fs.writeFileSync(archDir(w), 'not a dir'); const warn = console.warn; console.warn = () => {}; try { w.tg.addProgress(w.id, { note: 'x' }); land(); } finally { console.warn = warn; }
  check('CONTROL (a copy that trims at the hand-off, before the append landed): the failed append LOSES the overflow (500 live, nothing archived) — red', w.tg.get(w.id).progress.length === 500 && !archLines(w).length);
  fs.rmSync(archDir(w), { force: true }); land(); }
// B-0248 step 3 (c): A NOTE AT THE BOUND OPENS NOTHING ON THE MAIN THREAD — the append is handed to the writer; the entry stays live until it landed
const ruleOffLoop = (M) => { const w = mk(M); seed(w, 500); const n = { mkdir: 0, append: 0, open: 0 }; const mk0 = fs.mkdirSync, ap0 = fs.appendFileSync, op0 = fs.openSync;
  fs.mkdirSync = (...a) => { if (String(a[0]).includes('task-groups-archive')) n.mkdir++; return mk0(...a); }; fs.appendFileSync = (...a) => { if (String(a[0]).includes('task-groups-archive')) n.append++; return ap0(...a); }; fs.openSync = (...a) => { if (String(a[0]).includes('task-groups-archive')) n.open++; return op0(...a); };
  let atNote; try { w.tg.addProgress(w.id, { note: 'y' }); atNote = { live: w.tg.get(w.id).progress.length, file: fs.existsSync(path.join(archDir(w), '2026-09.ndjson')) }; } finally { fs.mkdirSync = mk0; fs.appendFileSync = ap0; fs.openSync = op0; }
  land(); return { n, atNote, after: { live: w.tg.get(w.id).progress.length, arch: archLines(w).length } }; };
{ const r = ruleOffLoop(REAL); check('a note at the 500 bound opens, makes and appends NOTHING on the main thread; the entry stays live (501, no file) until its append landed (then 500 live, 1 archived)', r.n.mkdir + r.n.append + r.n.open === 0 && r.atNote.live === 501 && !r.atNote.file && r.after.live === 500 && r.after.arch === 1, r); }
{ const M = patched('    if (list.length <= LIVE_PROGRESS || !archivableId(id)) return list;\n    for (const p of list.slice(0, list.length - LIVE_PROGRESS)) {', '    if (list.length <= LIVE_PROGRESS || !archivableId(id)) return list;\n    if (list) { const dir = path.join(this._archiveRoot, id); fs.mkdirSync(dir, { recursive: true }); for (const p of list.slice(0, list.length - LIVE_PROGRESS)) fs.appendFileSync(path.join(dir, monthOf(p.at) + \'.ndjson\'), JSON.stringify(p) + \'\\n\'); return list.slice(-LIVE_PROGRESS); }\n    for (const p of list.slice(0, list.length - LIVE_PROGRESS)) {', 'sync-append');
  const r = ruleOffLoop(M); check('CONTROL (the release\'s synchronous append, a copy): the note makes the folder and appends on the main thread — red', r.n.mkdir + r.n.append > 0, r); }

console.log('② pages walk the whole log by `before` — newest first, deduped, nothing skipped at a shared instant');
{ const w = mk(); seed(w, 900); w.tg._state.tasks[w.id].progress = w.tg._keepLive(w.id, w.tg._state.tasks[w.id].progress); land();
  const files = fs.readdirSync(archDir(w)).sort();
  check('the archive splits by the entry\'s UTC month (2026-09 / 2026-10 files)', files.join() === '2026-09.ndjson,2026-10.ndjson', files);
  crashDup(w, w.tg.get(w.id).progress[0]);   // a crash between the append and the trim: the oldest live entry is in both
  const { all, pages } = walk(w, 100);
  const ids = all.map((p) => p.id);
  check('a 100-entry walk returns all 900 entries once each (the crash duplicate read once)', ids.length === 900 && new Set(ids).size === 900, { n: ids.length, uniq: new Set(ids).size, pages });
  check('…newest first, every page', verdictOf(all.every((p, i) => !i || all[i - 1].at >= p.at)));
  check('limit is clamped to 200', w.tg.readProgress(w.id, { limit: 5000 }).entries.length === 200); }
{ const w = mk(); seed(w, 520, Date.UTC(2026, 9, 1), 60e3); const t = w.tg._state.tasks[w.id]; for (const i of [17, 18, 19]) t.progress[i].at = t.progress[16].at; t.progress = w.tg._keepLive(w.id, t.progress); land();
  const p1 = w.tg.readProgress(w.id, { before: t.progress[0].at, limit: 4 }); const p2 = w.tg.readProgress(w.id, { before: p1.entries[p1.entries.length - 1].at, limit: 4 });
  const got = [...p1.entries, ...p2.entries].map((p) => p.id);
  check('four entries of ONE millisecond at a page boundary ride together (a `before` cursor never skips one)', verdictOf(['P-100010', 'P-100011', 'P-100012', 'P-100013'].every((x) => got.includes(x))), got); }

console.log('③ one page reads a bounded number of bytes (binary search into the month, not a scan from its end)');
const ruleBounded = (M) => { const w = mk(M); const t = w.tg._state.tasks[w.id]; const big = 'x'.repeat(900); seed(w, 6500, Date.UTC(2026, 9, 1), 1000); for (const p of t.progress) p.detail = big; t.progress = w.tg._keepLive(w.id, t.progress); land();
  const lines = archLines(w); const mid = lines[1000].at; let bytes = 0; const rs = fs.readSync; fs.readSync = (fd, b, o, l, p) => { const n = rs(fd, b, o, l, p); bytes += n; return n; };
  let r; try { r = w.tg.readProgress(w.id, { before: mid, limit: 100 }); } finally { fs.readSync = rs; }
  return { bytes, size: fs.statSync(path.join(archDir(w), '2026-10.ndjson')).size, n: r.entries.length, first: r.entries[0] && r.entries[0].at < mid };
};
{ const r = ruleBounded(REAL); check('a page 1000 lines into a ~5.7 MB month reads < 1.5 MB and answers 100 entries older than the cursor', r.bytes < 1.5e6 && r.n === 100 && gateOf(r.first) && r.size > 5e6, r); }
{ const M = patched('  if (!Number.isFinite(lim)) return size;', '  return size;', 'scan-from-end'); const r = ruleBounded(M); check('CONTROL: without the binary search the same page scans from the month\'s end (> 1.5 MB) — the rule goes red', r.bytes > 1.5e6, r); }

console.log('④ a clear reaches the archive copy — ONE month file rewritten, the rest byte-identical');
const ruleClear = (M) => { const w = mk(M); seed(w, 560, Date.UTC(2026, 8, 30, 23, 30)); const t = w.tg._state.tasks[w.id]; t.progress[40].note = 'PLANTED-word'; t.progress[40].detail = 'PLANTED-detail'; t.progress = w.tg._keepLive(w.id, t.progress); land();
  const other = fs.readFileSync(path.join(archDir(w), '2026-09.ndjson'), 'utf8');
  const r = w.tg.clearProgress(w.id, ['P-100028'], { by: 'owner' });
  const oct = fs.readFileSync(path.join(archDir(w), '2026-10.ndjson'), 'utf8');
  return { r, gone: !oct.includes('PLANTED') && !other.includes('PLANTED'), sentence: oct.includes(RC.CLEARED_TEXT), otherSame: fs.readFileSync(path.join(archDir(w), '2026-09.ndjson'), 'utf8') === other, tmp: fs.readdirSync(archDir(w)).filter((f) => f.endsWith('.tmp')), stamp: !!w.tg.get(w.id).archiveClearedAt, w };
};
{ const t0 = ruleClear(REAL); check('an archived entry (planted words) cleared by its P- id: the words gone, the sentence there, cleared:[id]', t0.r.cleared.join() === 'P-100028' && gateOf(t0.gone) && verdictOf(t0.sentence), t0.r);
  check('…the other month file byte-identical, no .tmp left, the group stamps archiveClearedAt (the window re-reads)', gateOf(t0.otherSame) && !t0.tmp.length && verdictOf(t0.stamp), t0);
  const w = t0.w; const lines = archLines(w); const atRef = String(lines.find((p) => p.id === 'P-100009').at);
  check('…by its ms `at` too', w.tg.clearProgress(w.id, [atRef]).cleared.join() === 'P-100009' && archLines(w).find((p) => p.id === 'P-100009').note === RC.CLEARED_TEXT);
  const refused = w.tg.clearProgress(w.id, ['P-10000a'], { allow: () => ({ ok: false, code: 'not_yours' }) });
  check('…the caller\'s verdict is asked of an archived entry (refused ⇒ untouched)', refused.refused.length === 1 && archLines(w).find((p) => p.id === 'P-10000a').note === 'note 10');
  const dup = w.tg.get(w.id).progress[0]; crashDup(w, dup);
  w.tg.clearProgress(w.id, [dup.id]);
  check('…a LIVE entry\'s crash-duplicate in the archive is cleared with it', gateOf(archLines(w).filter((p) => p.id === dup.id).every((p) => p.note === RC.CLEARED_TEXT)) && w.tg.get(w.id).progress[0].note === RC.CLEARED_TEXT); }
{ const M = patched('if (!hits.length) { hits = this._archiveFind(id, ref); live = false; }', '', 'live-only'); const r = ruleClear(M); check('CONTROL: a clear that looks in the live list only misses the planted archive line (unknown) — red', !r.gone && r.r.unknown.length === 1, r.r); }

console.log('⑤ a Task Group delete takes its archive; Backup & migrate carries it');
const ruleDelete = (M) => { const w = mk(M); seed(w, 505); w.tg._state.tasks[w.id].progress = w.tg._keepLive(w.id, w.tg._state.tasks[w.id].progress); land(); const had = fs.existsSync(archDir(w)); w.tg.remove(w.id); return { had, after: fs.existsSync(archDir(w)) }; };
{ const r = ruleDelete(REAL); check('delete ⇒ data/task-groups-archive/<id>/ is gone', gateOf(r.had) && !r.after, r); }
{ const M = patched('this._archiveDrop(id); fs.rmSync(path.join(this._archiveRoot, id), { recursive: true, force: true });', 'this._archiveDrop(id);', 'keep-dir'); const r = ruleDelete(M); check('CONTROL: without the rmSync the archived words outlive the group — red', gateOf(r.had) && verdictOf(r.after), r); }
{ const a = mk(); seed(a, 530); const t = a.tg._state.tasks[a.id]; t.progress = a.tg._keepLive(a.id, t.progress); land(); a.tg.clearProgress(a.id, ['P-100002']);
  const bundle = JSON.parse(JSON.stringify(a.tg.exportBundle()));
  const b = { tg: new REAL.TaskGroupManager({ dataDir: freshDir(), onChange: () => {} }) }; b.id = a.id; b.dir = b.tg._file.replace(/\/task-groups\.json$/, '');
  fs.mkdirSync(archDir(b), { recursive: true }); fs.writeFileSync(path.join(archDir(b), '2026-09.ndjson'), JSON.stringify({ id: 'P-100002', at: archLines(a).find((p) => p.id === 'P-100002').at, note: 'old copy words', session: null }) + '\n');
  b.tg.importBundle(bundle);
  const got = archLines(b);
  check('exportBundle carries the archive months; importBundle writes them (30 archived entries arrive)', !!bundle.archive && got.length === 30 && walk(b).all.length === 530, { n: got.length });
  check('…merged by id, a cleared copy wins over the target\'s uncleared one', got.find((p) => p.id === 'P-100002').note === RC.CLEARED_TEXT && !got.some((p) => /old copy words/.test(p.note))); }
{ const M = patched("return { version: 1, tasks: Object.values(this._state.tasks), ...(Object.keys(archive).length ? { archive } : {}) };", 'return { version: 1, tasks: Object.values(this._state.tasks) };', 'no-export'); const a = mk(M); seed(a, 530); a.tg._state.tasks[a.id].progress = a.tg._keepLive(a.id, a.tg._state.tasks[a.id].progress); land(); check('CONTROL: a bundle without the archive leaves the 30 behind — red', !a.tg.exportBundle().archive); }

console.log('⑦ B-0248 step 3 (c): what is still OWED to the archive — a clear, a removal');
// an entry CLEARED while its append is owed reaches the file cleared — TWO belts since r2104 (c) (the settle judges a month's own FLIGHT,
// so a month only owed is not settled: the settle guards an append already on its way): the bytes are made at the write from the live
// entry, and a landed entry cleared meanwhile is cleared in the file (either alone holds; the control removes both, and the settle)
const ruleQueuedClear = (M) => { const w = mk(M); seed(w, 500); const t = w.tg._state.tasks[w.id]; t.progress[0].note = 'QUEUED-words'; t.progress[0].detail = 'QUEUED-detail';
  w.tg.addProgress(w.id, { note: 'z' }); const r = w.tg.clearProgress(w.id, ['P-100000'], { by: 'owner' }); land();
  const raw = fs.readFileSync(path.join(archDir(w), '2026-09.ndjson'), 'utf8'); return { cleared: r.cleared.join(), words: raw.includes('QUEUED'), sentence: raw.includes(RC.CLEARED_TEXT), live: w.tg.get(w.id).progress.length }; };
{ const r = ruleQueuedClear(REAL); check('an entry cleared while its append was owed reaches the file CLEARED (the sentence, never its words); then it leaves the live list', r.cleared === 'P-100000' && !r.words && gateOf(r.sentence) && r.live === 500, r); }
{ const M = cuts([...BELT.snap, ...BELT.settle, ...BELT.late], 'snap-at-queue');
  const r = ruleQueuedClear(M); check('CONTROL (a copy that takes the bytes when the entry is QUEUED, rewrites a month without settling it first, and never clears a landed entry late — every belt gone): the cleared entry\'s words reach the archive — red', verdictOf(r.words), r); }
for (const [keep, cut] of [['the bytes made at the write', [...BELT.settle, ...BELT.late]], ['the late clear', [...BELT.snap, ...BELT.settle]]]) {
  const r = ruleQueuedClear(cuts(cut, 'belt-' + keep.replace(/\W+/g, '-'))); check(`EACH BELT ALONE HOLDS — only ${keep} left (a copy without the other two): the cleared entry reaches the file cleared`, !r.words && gateOf(r.sentence) && r.live === 500, r); }
// A HOLDING writer (a stand-in) keeps one append in flight: its thread took the bytes, the landing is the scene's.
const holdWriter = () => {
  const st = { owed: new Map(), flying: null };
  const writeOut = (file, o, bytes) => { if (bytes && typeof bytes === 'object' && 'append' in bytes) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, bytes.append); } else if (bytes != null) fs.writeFileSync(file, bytes); if (o.onWritten) o.onWritten(true); };
  const W = { st, dirty: (f, o) => st.owed.set(f, o), forget: (f) => { st.owed.delete(f); }, durable: () => Promise.resolve(true),
    pending: (f) => st.owed.has(f) || !!(st.flying && st.flying.file === f),
    take: (f) => { const o = st.owed.get(f); st.owed.delete(f); st.flying = { file: f, o, bytes: o.produce() }; },   // the writer's thread took the bytes
    landFlying: () => { const x = st.flying; if (!x) return; st.flying = null; writeOut(x.file, x.o, x.bytes); },
    landLost: () => { const x = st.flying; if (!x) return; st.flying = null; if (x.o.onWritten) x.o.onWritten(true); },   // it lands in a REPLACED file's old copy: its bytes reach no file the store reads
    flushSync: (files) => { if (st.otherHeld) return { written: [], left: (files || [...st.owed.keys()]).map((file) => ({ file, why: 'the writer thread was still held by the storage (another store, a stand-in)' })) };
      if (st.flying && st.failNext && (!files || files.includes(st.flying.file))) { const x = st.flying; st.flying = null; st.failNext = false; if (x.o.onWritten) x.o.onWritten(false, Object.assign(new Error('a stand-in'), { code: 'EDQUOT' })); return { written: [], left: [{ file: x.file, why: 'the write failed (EDQUOT; 1 attempt)' }] }; }
      if (st.flying && (!files || files.includes(st.flying.file))) { if (st.holdPast) return { written: [], left: [{ file: st.flying.file, why: 'its write was still held by the storage after 10.0 s (a stand-in)' }] }; W.landFlying(); } const left = []; for (const f of files || [...st.owed.keys()]) { const o = st.owed.get(f); if (!o) continue; st.owed.delete(f); const b = o.produce();
        if (st.failOwed && b != null && f.endsWith('.ndjson')) { if (o.onWritten) o.onWritten(false, Object.assign(new Error('a stand-in'), { code: 'EDQUOT' })); left.push({ file: f, why: 'the write failed (EDQUOT; 1 attempt)' }); continue; }   // r2292: the storage keeps failing
        writeOut(f, o, b); } return { written: [], left }; } };
  return W;
};
// an entry cleared while its append FLIES (r2104): the clear's settle lets that append land FIRST, then the month file is rewritten
// cleared; two belts for it — the settle, and the late clear of a landed entry cleared meanwhile (either alone holds; red: both cut)
const ruleFlyingClear = (M) => { const W = holdWriter(), dir = freshDir(); const tg = new M.TaskGroupManager({ dataDir: dir, onChange: () => {}, writer: W }); const g = tg.create({ title: 'arch' }); const w = { tg, id: g.id, dir };
  seed(w, 500); W.flushSync(); tg._state.tasks[g.id].progress[0].note = 'FLYING-words';
  tg.addProgress(g.id, { note: 'z' }); const file = path.join(archDir(w), '2026-09.ndjson'); W.take(file);   // its append is on its way, with the words it had
  let code = null; try { tg.clearProgress(g.id, ['P-100000'], { by: 'owner' }); } catch (e) { code = e.code || e.message; }
  W.landFlying(); W.flushSync();   // whatever was still on its way lands
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; return { code, words: raw.includes('FLYING'), sentence: raw.includes(RC.CLEARED_TEXT), live: tg.get(g.id).progress.length }; };
{ const r = ruleFlyingClear(REAL); check('an entry cleared while its append flies: the clear lets the append land first, then the month file holds the sentence, never its words; it leaves the live list', r.code === null && !r.words && gateOf(r.sentence) && r.live === 500, r); }
for (const [keep, cut] of [['the settle', BELT.late], ['the late clear', BELT.settle]]) {
  const r = ruleFlyingClear(cuts(cut, 'fly-' + keep.replace(/\W+/g, '-'))); check(`…EACH BELT ALONE HOLDS for a flying entry — only ${keep} left: the month file holds the sentence`, !r.words && verdictOf(r.sentence), r); }
{ const r = ruleFlyingClear(cuts([...BELT.settle, ...BELT.late], 'fly-none')); check('CONTROL (a copy without the settle AND the late clear): the words it flew with stay in the archive — red', verdictOf(r.words), r); }
// a group REMOVED: an append still owed makes no bytes (its group is gone), and one already ON ITS WAY lands BEFORE the folder goes —
// an append that landed after the removal would make the folder again, and a group made again under the same id would inherit it.
const ruleFlyingDelete = (M) => { const W = holdWriter(), dir = freshDir(); const tg = new M.TaskGroupManager({ dataDir: dir, onChange: () => {}, writer: W }); const g = tg.create({ title: 'arch' }); const w = { tg, id: g.id, dir };
  seed(w, 505); tg._state.tasks[g.id].progress = tg._keepLive(g.id, tg._state.tasks[g.id].progress);
  const file = path.join(archDir(w), '2026-09.ndjson'); W.take(file);   // its append is on its way
  tg.remove(g.id); const atRemove = fs.existsSync(archDir(w)); W.landFlying();   // whatever was still on its way lands now
  return { atRemove, after: fs.existsSync(archDir(w)) }; };
{ const r = ruleFlyingDelete(REAL); check('a group removed while its archive append FLIES: the append lands first, then the folder goes — nothing is written after the removal', !r.atRemove && !r.after, r); }
{ const M = patched('this._archiveDrop(id); fs.rmSync(', 'fs.rmSync(', 'no-drop'); const r = ruleFlyingDelete(M); check('CONTROL (a copy that does not settle what flies): the append lands after the removal and makes the folder again — red', verdictOf(r.after), r); }
{ const w = mk(); seed(w, 505); w.tg._state.tasks[w.id].progress = w.tg._keepLive(w.id, w.tg._state.tasks[w.id].progress); w.tg.remove(w.id); land();
  check('a group removed with its archive append still OWED (not taken): nothing is written after the removal', !fs.existsSync(archDir(w))); }

// r1821 (1): A SETTLE THAT RAN OUT OF ITS BOUND IS NOT A SETTLE — an append held PAST the writer's bound: a clear's rewrite, an import's
// rewrite and a group's removal are each REFUSED BY NAME (EVSARCHIVEBUSY), nothing changed; once it lands, nothing is lost
const heldScene = (M, act) => { const W = holdWriter(), dir = freshDir(); const tg = new M.TaskGroupManager({ dataDir: dir, onChange: () => {}, writer: W }); const g = tg.create({ title: 'arch' }); const w = { tg, id: g.id, dir };
  seed(w, 505); tg._state.tasks[g.id].progress = tg._keepLive(g.id, tg._state.tasks[g.id].progress); W.flushSync();   // 5 archived, 500 live
  const bundle = JSON.parse(JSON.stringify(tg.exportBundle()));
  tg.addProgress(g.id, { note: 'one more' }); const file = path.join(archDir(w), '2026-09.ndjson'); W.take(file); W.st.holdPast = true;   // P-100005's append on its way, held past the bound
  let code = null; try { if (act === 'clear') tg.clearProgress(g.id, ['P-100001'], { by: 'owner' }); else if (act === 'import') tg.importBundle(bundle, { log: () => {} }); else tg.remove(g.id); } catch (e) { code = e.code || e.message; }
  const atAct = { code, group: !!tg._state.tasks[g.id], cleared: archLines(w).some((p) => p.id === 'P-100001' && p.note === RC.CLEARED_TEXT) };
  W.st.holdPast = false; if (code || act === 'remove') W.landFlying(); else W.landLost();   // refused: its append lands as it would; a rewrite gone on over it: it lands in the replaced file's old copy; a removal gone on over it: it lands at its path (the folder made again)
  const t = tg._state.tasks[g.id]; const inLive = !!(t && t.progress.some((p) => p.id === 'P-100005')), inFile = archLines(w).some((p) => p.id === 'P-100005');
  return { ...atAct, inLive, inFile, folder: fs.existsSync(archDir(w)) };
};
{ const r = heldScene(REAL, 'clear'); check('a CLEAR whose month an append still flies into (past the bound) is refused BY NAME (EVSARCHIVEBUSY), nothing cleared; once it lands the entry is in the file', r.code === 'EVSARCHIVEBUSY' && !r.cleared && verdictOf(r.inFile), r); }
{ const r = heldScene(cuts([[SETTLE_LINE, "    this._archiveSettle([...months.keys()].map((m) => path.join(this._archiveRoot, id, m + '.ndjson')));"]], 'clear-overtakes'), 'clear'); check('CONTROL (a copy whose clear goes on over the held append): the append lands in the rewritten file\'s old copy and the entry is in NEITHER place — red', r.code === null && !r.inLive && !r.inFile, r); }
{ const r = heldScene(REAL, 'import'); check('an IMPORT while an append still flies (past the bound) is refused BY NAME (EVSARCHIVEBUSY), nothing imported; once it lands the entry is in the file', r.code === 'EVSARCHIVEBUSY' && verdictOf(r.inFile), r); }
{ const IMP = '    { const no = this._archiveImportSettle(); if (no) throw no; }';
  const M = MUT.load('src/task-groups.js', anchored(SRC, IMP, '    this._archiveImportSettle();', 'import-overtakes', { count: 2 }), 'import-overtakes');
  const r = heldScene(M, 'import'); check('CONTROL (a copy whose import goes on over the held append): the entry is in NEITHER place — red', r.code === null && !r.inLive && !r.inFile, r); }
{ const r = heldScene(REAL, 'remove'); check('a REMOVAL while an append still flies (past the bound) is refused BY NAME (EVSARCHIVEBUSY): the group stays; once it lands the entry is in its file', r.code === 'EVSARCHIVEBUSY' && gateOf(r.group) && verdictOf(r.inFile), r); }
{ const r = heldScene(cuts([['    if (why) throw ARCHIVE_BUSY(why);\n    for (const [file, q] of mine)', '    for (const [file, q] of mine)']], 'remove-overtakes'), 'remove'); check('CONTROL (a copy whose removal goes on over the held append): the append lands after it and makes the removed group\'s folder again (a ghost archive) — red', r.code === null && !r.group && verdictOf(r.folder), r); }

// r1821 (3): A KILL BETWEEN THE APPEND AND THE TRIM, on the real road: the append landed, the trim's save never did — the next start reads
// the entry live AND in the archive, and every reader gives it once; the next overflow appends it again (a line twice, read once)
{ const dir = freshDir(); const w = mk(REAL, dir); seed(w, 500); land(); w.tg.addProgress(w.id, { note: 'at the bound' });
  const file = path.join(archDir(w), '2026-09.ndjson'); SW.flushSync([file]);   // the append lands (and its trim dirties the store)…
  SW.forget(w.tg._file);   // …and the process is killed before the store's write: what it owed is gone
  const tg2 = new REAL.TaskGroupManager({ dataDir: dir, onChange: () => {} }); const w2 = { tg: tg2, id: w.id, dir };
  const live2 = tg2.get(w.id).progress.some((p) => p.id === 'P-100000'), arch2 = archLines(w2).filter((p) => p.id === 'P-100000').length;
  const ids = walk(w2).all.map((p) => p.id);
  tg2.addProgress(w.id, { note: 'after the restart' }); land();
  const ids3 = walk(w2).all.map((p) => p.id);
  { const Mx = MUT.load('src/task-groups.js', anchored(SRC, '      if (p.id && seen.has(p.id)) return;\n', '', 'no-dedup'), 'no-dedup'); const tgx = new Mx.TaskGroupManager({ dataDir: dir, onChange: () => {} }); const idsx = walk({ tg: tgx, id: w.id, dir }).all.map((p) => p.id);
    check('CONTROL (a copy whose page reader does not drop a second copy by id): the entry in both places is read TWICE after the kill — red', idsx.filter((x) => x === 'P-100000').length >= 2, idsx.filter((x) => x === 'P-100000').length); }
  check('a kill between the append and the trim: the entry is live AND archived at the next start, read ONCE; the next overflow appends it again and it is still read once', gateOf(live2) && arch2 === 1 && ids.filter((x) => x === 'P-100000').length === 1 && archLines(w2).filter((p) => p.id === 'P-100000').length === 2 && ids3.filter((x) => x === 'P-100000').length === 1 && new Set(ids3).size === ids3.length, { live2, arch2 }); }

// r1821 (3): A BUNDLE NEVER CARRIES AN ENTRY TWICE — one in both places (owed, or a crash duplicate) rides in its live list only
const ruleExportOnce = (M) => { const w = mk(M); seed(w, 505); w.tg._state.tasks[w.id].progress = w.tg._keepLive(w.id, w.tg._state.tasks[w.id].progress); land();
  crashDup(w, w.tg.get(w.id).progress[0]); crashDup(w, archLines(w)[0]);   // a live entry's duplicate in the archive, and an archived line twice
  const b = w.tg.exportBundle(); const live = b.tasks.find((t) => t.id === w.id).progress.map((p) => p.id);
  const arch = Object.values((b.archive || {})[w.id] || {}).flatMap((text) => text.split('\n').filter(Boolean).map((l) => JSON.parse(l).id));
  const all = [...live, ...arch]; return { n: all.length, uniq: new Set(all).size }; };
{ const r = ruleExportOnce(REAL); check('exportBundle carries every entry ONCE (an entry live and archived, and an archived line twice: one each)', r.n === r.uniq && r.uniq === 505, r); }
{ const NEW = "      for (const f of this._archiveMonths(id)) {\n        const kept = this._monthEntries(id, f).filter((p) => !live.has(p.id)).sort((a, b) => a.at - b.at);\n        if (kept.length) (archive[id] = archive[id] || {})[f.slice(0, 7)] = kept.map((p) => JSON.stringify(p) + '\\n').join('');\n      }";
  const OLD = "      for (const f of this._archiveMonths(id)) { try { (archive[id] = archive[id] || {})[f.slice(0, 7)] = fs.readFileSync(path.join(this._archiveRoot, id, f), 'utf8'); } catch { } }";
  const r = ruleExportOnce(cuts([[NEW, OLD]], 'export-verbatim')); check('CONTROL (the release\'s verbatim month copy): the bundle carries entries twice — red', r.n > r.uniq, r); }

// r1821 (3): A BURST OF 200 NOTES AT THE BOUND costs a BOUNDED number of writes: ONE append job per month file and at most two writes of
// task-groups.json per write turn (the notes' saves coalesce; the trims' saves coalesce) — counted over a stand-in that writes when asked
{ const W = holdWriter(), dir = freshDir(); const tg = new REAL.TaskGroupManager({ dataDir: dir, onChange: () => {}, writer: W }); const g = tg.create({ title: 'burst' }); const w = { tg, id: g.id, dir };
  seed(w, 500); W.flushSync(); const n = { appends: 0, saves: 0 }; const wo = W.flushSync; let turn = 0;
  const flushCounted = () => { const owed = [...W.st.owed.entries()]; for (const [f, o] of owed) { W.st.owed.delete(f); const b = o.produce(); if (b && typeof b === 'object' && 'append' in b) { n.appends++; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, b.append); } else if (b != null) { n.saves++; fs.writeFileSync(f, b); } if (o.onWritten) o.onWritten(true); } turn++; };
  for (let i = 0; i < 200; i++) tg.addProgress(g.id, { note: `burst ${i}` });
  flushCounted(); const first = { ...n }; flushCounted(); void wo;
  check('a burst of 200 notes at the bound: ONE append job per month file (2: September and October) and at most two writes of the store over two write turns; 500 live after, 200 archived', first.appends === 2 && n.appends === 2 && n.saves <= 2 && tg.get(g.id).progress.length === 500 && archLines(w).length === 200, { first, n, turn }); }
// …its red (r2104 smalls): a copy that writes ONE entry an append job — the archive lags a burst (one month file's job a turn carries one entry)
{ const M = MUT.load('src/task-groups.js', anchored(SRC, '    q.ids.clear();\n    if (!lines.length)', '    { const keep = sent.slice(1).map((x) => x.id); q.ids.clear(); for (const k of keep) q.ids.add(k); sent.length = Math.min(sent.length, 1); lines.length = Math.min(lines.length, 1); }\n    if (!lines.length)', 'one-a-job'), 'one-a-job');
  const W = holdWriter(), dir = freshDir(); const tg = new M.TaskGroupManager({ dataDir: dir, onChange: () => {}, writer: W }); const g = tg.create({ title: 'burst' }); const w = { tg, id: g.id, dir };
  seed(w, 500); W.flushSync(); for (let i = 0; i < 200; i++) tg.addProgress(g.id, { note: `burst ${i}` }); W.flushSync(); W.flushSync();
  check('CONTROL (a copy that carries one entry an append job): two turns archive 2 of the 200 — the bound above is the code\'s, not the stand-in\'s (red)', archLines(w).length < 200, { arch: archLines(w).length }); }

// r1821 (4): nothing owed leaves NO empty entry in the owed map
const ruleNoEmpty = (M) => { const w = mk(M); seed(w, 501); const t = w.tg._state.tasks[w.id]; t.progress = w.tg._keepLive(w.id, t.progress); t.progress = t.progress.slice(1); land(); return { left: w.tg._archQ.size }; };
{ const r = ruleNoEmpty(REAL); check('an owed append whose entry left the live list meanwhile writes nothing and leaves no empty entry in the owed map', r.left === 0, r); }
{ const r = ruleNoEmpty(cuts([['    if (!q || !q.ids.size) { if (q && !q.flying) this._archQ.delete(file); return null; }', '    if (!q || !q.ids.size) return null;'], ['    if (!lines.length) { if (!q.flying) this._archQ.delete(file); return null; }', '    if (!lines.length) return null;']], 'empty-left')); check('CONTROL (a copy that keeps the empty entry): it stays in the owed map — red', r.left === 1, r); }   // the control writes the old text back on purpose — stale-pins: kept

// r2104 (a)(b)(c): THE SETTLE JUDGES THE FILE'S OWN FLIGHT — (a) a press after a held settle, or over an append already older than the
// bound, is refused AT ONCE (no second hold of the hub); (b) a FAILED append is no flight: the clear goes on; (c) a month only OWED while
// another store's write is held is safe: the clear goes on
const settleScene = (M, mode) => { const W = holdWriter(), dir = freshDir(); const tg = new M.TaskGroupManager({ dataDir: dir, onChange: () => {}, writer: W }); const g = tg.create({ title: 'arch' }); const w = { tg, id: g.id, dir };
  seed(w, 505); tg._state.tasks[g.id].progress = tg._keepLive(g.id, tg._state.tasks[g.id].progress); W.flushSync();
  tg.addProgress(g.id, { note: 'one more' }); const file = path.join(archDir(w), '2026-09.ndjson');
  let flushes = 0; const fs0 = W.flushSync; W.flushSync = (...a) => { flushes++; return fs0(...a); };
  const press = () => { try { tg.clearProgress(g.id, ['P-100001'], { by: 'owner' }); return 'cleared'; } catch (e) { return e.code || e.message; } };
  const out = { mode };
  if (mode === 'held') { W.take(file); W.st.holdPast = true; out.first = press(); out.f1 = flushes; out.second = press(); out.f2 = flushes;
    W.st.holdPast = false; W.landFlying(); flushes = 0; tg.addProgress(g.id, { note: 'and one more' }); W.take(file); tg._archQ.get(file).flyingSince = Date.now() - 31 * 60e3; out.old = press(); out.f3 = flushes; W.landFlying(); }
  else if (mode === 'failed') { W.take(file); W.st.failNext = true; out.first = press(); out.owed = tg._archQ.has(file) && tg._archQ.get(file).ids.has('P-100005'); out.live = tg.get(g.id).progress.some((p) => p.id === 'P-100005'); }
  else { W.st.otherHeld = true; out.first = press(); W.st.otherHeld = false; }
  return out; };
{ const r = settleScene(REAL, 'held'); check('(a) a held settle refuses BY NAME; the NEXT press is refused AT ONCE (no second hold: no flush asked), and an append already older than the bound is refused without a flush', r.first === 'EVSARCHIVEBUSY' && r.second === 'EVSARCHIVEBUSY' && r.f1 === 1 && r.f2 === 1 && r.old === 'EVSARCHIVEBUSY' && r.f3 === 0, r); }
{ const r = settleScene(cuts([['if (q.heldAt || age >= bound) return', 'if (false) return']], 'no-at-once'), 'held'); check('CONTROL (a copy without the at-once refusal): every press holds the hub for the bound again (a second flush) — red', r.f2 === 2 || r.f3 === 1, r); }
{ const r = settleScene(REAL, 'failed'); check('(b) a FAILED append is no flight: the clear goes on (nothing on its way), the entry stays owed and live, retried', r.first === 'cleared' && gateOf(r.owed) && verdictOf(r.live), r); }
{ const r = settleScene(REAL, 'owed'); check('(c) a month only OWED while another store\'s write is held is safe: the clear goes on (no flush, no refusal)', r.first === 'cleared', r); }
{ const NEW_SETTLE = SRC.slice(SRC.indexOf('  _archiveSettle(files, { owed = false } = {}) {'), SRC.indexOf("  /** THE TWO IMPORT DOORS' settle"));
  const OLD_SETTLE = "  _archiveSettle(files) {\n    const W = this._writer();\n    const owed = (files || [...this._archQ.keys()]).filter((f) => W.pending(f));\n    if (!owed.length) return null;\n    const r = W.flushSync(owed) || {};\n    if (r.deferred) return 'the hub is stopping';\n    const miss = (r.left || []).find((x) => owed.includes(x.file));\n    if (miss) return String(miss.why || 'its write has not landed');\n    return owed.some((f) => W.pending(f) && this._archQ.has(f) && this._archQ.get(f).flying) ? 'its write has not landed' : null;\n  }\n";   // the control writes the settle of 76703d7b5 back on purpose — stale-pins: kept
  const M = MUT.load('src/task-groups.js', anchored(SRC, NEW_SETTLE, OLD_SETTLE, 'settle-of-76703d7b5'), 'settle-old');
  const rb = settleScene(M, 'failed'), rc = settleScene(M, 'owed');
  check('CONTROL (the settle of 76703d7b5, judging the writer\'s whole answer): a failed append and an owed month beside another store\'s held write are both REFUSED — red', rb.first === 'EVSARCHIVEBUSY' && rc.first === 'EVSARCHIVEBUSY', { rb, rc }); }

// r2292: THE IMPORT DOORS WRITE WHAT IS OWED FIRST — an import REPLACES a group's live list: an entry only OWED to its month file
// (overflowed, its append not made yet: inside the writer's pause, or after a FAILED append) would no longer be found by its append
// after it — in NEITHER place. The doors flush it first (a flush, not a refusal); a write that keeps failing refuses the import BY NAME
const importOwed = (M, mode) => { const W = holdWriter(), dir = freshDir(); const tg = new M.TaskGroupManager({ dataDir: dir, onChange: () => {}, writer: W }); const g = tg.create({ title: 'arch' }); const w = { tg, id: g.id, dir };
  seed(w, 3); const older = JSON.parse(JSON.stringify(tg.exportBundle()));   // an OLDER backup of the same group: its first three notes
  seed(w, 505); tg._state.tasks[g.id].progress = tg._keepLive(g.id, tg._state.tasks[g.id].progress); W.flushSync();   // 5 archived (the backup's three among them), 500 live
  tg.addProgress(g.id, { note: 'one more' });   // P-100005 overflows: OWED to its month file, its append not made yet
  const file = path.join(archDir(w), '2026-09.ndjson'), owed = !!(tg._archQ.get(file) && tg._archQ.get(file).ids.has('P-100005') && !tg._archQ.get(file).flying);
  if (mode === 'failing') W.st.failOwed = true;
  let code = null; try { tg.importBundle(older, { log: () => {} }); } catch (e) { code = e.code || e.message; }
  W.st.failOwed = false; const t = tg._state.tasks[g.id], liveN = t ? t.progress.length : 0, live = !!(t && t.progress.some((p) => p.id === 'P-100005'));
  W.flushSync();   // whatever is still owed is written now
  return { code, owed, liveN, live, inFile: archLines(w).some((p) => p.id === 'P-100005') };
};
{ const r = importOwed(REAL, 'owed'); check('an OLDER backup imported while an entry is only OWED to the archive: the import writes it first (a flush, not a refusal) — it is in its month file after the import', gateOf(r.owed) && r.code === null && r.liveN === 3 && verdictOf(r.inFile), r); }
{ const DOOR = '    { const no = this._archiveImportSettle(); if (no) throw no; }';
  const M = MUT.load('src/task-groups.js', anchored(SRC, DOOR, '    { const why = this._archiveSettle(); if (why) throw ARCHIVE_BUSY(why); }', 'import-flight-only', { count: 2 }), 'import-flight-only');   // the control writes the doors' settle of 62ebdb2fa back on purpose — stale-pins: kept
  const r = importOwed(M, 'owed'); check('CONTROL (the doors\' settle of 62ebdb2fa, judging flights only): the owed entry is in NEITHER place after the import — red', gateOf(r.owed) && r.code === null && !r.live && !r.inFile, r); }
{ const r = importOwed(REAL, 'failing'); check('an import while the owed write KEEPS FAILING is refused BY NAME (EVSARCHIVEFAILING), nothing replaced: the entry stays live and owed, and lands once the storage writes again', r.code === 'EVSARCHIVEFAILING' && r.liveN === 501 && gateOf(r.live) && verdictOf(r.inFile), r); }
{ const r = importOwed(cuts([['    const unmade = owed ? due.filter(', '    const unmade = false ? due.filter(']], 'import-over-failing'), 'failing');
  check('CONTROL (a copy whose import goes on over the failed write): the owed entry is in NEITHER place — red', r.code === null && !r.live && !r.inFile, r); }
const taskImportOwed = (M) => { const w = mk(M); seed(w, 3); const fsrc = path.join(w.dir, 'group.md'); fs.writeFileSync(fsrc, `---\nvibespace_task: ${w.id}\ntitle: arch\n---\n\n## Objective\nthe same group, from a file\n`); const W = w.tg._writer(); const f0 = W.flushSync;
  let asked = null; W.flushSync = (files, ...a) => { if (files && asked === null) asked = files.slice(); return f0(files, ...a); };
  const t = w.tg._state.tasks[w.id]; t.progress = Array.from({ length: 501 }, (_, i) => ({ id: 'P-' + (0x100000 + i).toString(16), at: Date.UTC(2026, 8, 30, 23, 0) + i * 60e3, note: `n ${i}` })); t.progress = w.tg._keepLive(w.id, t.progress);
  let code = null; try { w.tg.importFromFile(fsrc); } catch (e) { code = e.code || e.message; } finally { W.flushSync = f0; } land();
  return { code, asked, flushed: Array.isArray(asked) && asked.some((f) => f.endsWith('2026-09.ndjson')), inFile: archLines(w).some((p) => p.id === 'P-100000') }; };
{ const r = taskImportOwed(REAL); check('the TASK import (a group file) takes the same door: the month an entry is owed to is written before it (its flush asks for that month)', gateOf(r.flushed) && verdictOf(r.inFile), r); }
{ const r = taskImportOwed(MUT.load('src/task-groups.js', anchored(SRC, '    { const no = this._archiveImportSettle(); if (no) throw no; }', '    { const why = this._archiveSettle(); if (why) throw ARCHIVE_BUSY(why); }', 'task-import-flight-only', { count: 2 }), 'task-import-flight-only'));   // the doors' settle of 62ebdb2fa written back on purpose — stale-pins: kept
  check('CONTROL (the doors\' settle of 62ebdb2fa): the task import asks no flush for an owed month — red', !r.flushed, r); }

// r2104 THE MUST: THE CONFIGURATION IMPORT (Backup & migrate) is refused WHOLE before any section is applied — the ROUTE driven (src/routes/
// persistence.js on a fake app): a bundle with settings and Task Groups, imported while an Activity-log append is held past its bound
const PRS = fs.readFileSync(path.join(repo, 'src/routes/persistence.js'), 'utf8');
const configImport = async (Pmod, tag, mode = 'held') => {
  const D = freshDir(); fs.writeFileSync(path.join(D, 'settings.json'), JSON.stringify({ language: 'en' }));
  const W = holdWriter(); const tg = new REAL.TaskGroupManager({ dataDir: D, onChange: () => {}, writer: W }); const g = tg.create({ title: 'arch' }); const w = { tg, id: g.id, dir: D };
  seed(w, 505); tg._state.tasks[g.id].progress = tg._keepLive(g.id, tg._state.tasks[g.id].progress); W.flushSync();
  Pmod.setup({ dataDir: D, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => null, getMounts: () => [], getTasks: () => tg, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
  const door = (p) => Pmod.router.stack.find((l) => l.route && l.route.path === p && l.route.methods.post).route.stack[0].handle;
  const call = (p, body) => new Promise((resolve) => { const out = { status: 200 }; const res = { status(c) { out.status = c; return this; }, set() { return this; }, setHeader() { }, get() { return undefined; }, json(o) { out.body = o; resolve(out); }, send(o) { out.body = o; resolve(out); }, end() { resolve(out); } };
    try { door(p)({ body, headers: { 'sec-fetch-site': 'same-origin' }, query: {}, params: {}, app: { locals: {} }, socket: {} }, res, () => resolve(out)); } catch (e) { out.status = 'threw'; out.code = e && e.code; resolve(out); } });
  const ex = await call('/api/config/export', { sections: ['settings', 'tasks'] });
  const file = ex.body; if (file && file.sections && file.sections.settings) file.sections.settings = { ...file.sections.settings, language: 'ja' };
  tg.addProgress(g.id, { note: 'one more' }); if (mode === 'failing') W.st.failOwed = true; else { W.take(path.join(archDir(w), '2026-09.ndjson')); W.st.holdPast = true; }   // an append held past its bound — or (r2292) an owed one whose write keeps failing
  const im = await call('/api/config/import', { file, sections: ['settings', 'tasks'], includeSensitive: [] });
  land(); W.st.holdPast = false; W.st.failOwed = false; W.landFlying();
  const again = await call('/api/config/export', { sections: ['settings'] });
  return { exported: ex.status, hadSettings: !!(ex.body && ex.body.sections && ex.body.sections.settings), status: im.status, code: (im.body && im.body.code) || im.code || null, applied: (im.body && im.body.applied) || null, language: again.body && again.body.sections && again.body.sections.settings && again.body.sections.settings.language };
};
{ const r = await configImport(require(path.join(repo, 'src/routes/persistence.js')), 'real');
  check('THE MUST: a configuration import while an Activity-log append is held past its bound is refused WHOLE by name (409 EVSARCHIVEBUSY), and NO section is applied (the settings stay as they were)', r.exported === 200 && gateOf(r.hadSettings) && r.status === 409 && r.code === 'EVSARCHIVEBUSY' && !r.applied && r.language === 'en', r); }
{ const BUSY = "    { const busy = sections.includes('tasks') && file.sections.tasks !== undefined ? getTasks?.()?.archiveBusy?.() : null;";
  const r = await configImport(MUT.load('src/routes/persistence.js', anchored(PRS, BUSY, "    { const busy = null;", 'import-busy-cut'), 'import-busy-cut'), 'red');
  check('CONTROL (a copy of the route without the whole refusal): the settings are applied first and the Task Groups refused after them — the import is HALF applied (red; the tasks line\'s belt names what was applied)', r.language === 'ja' && r.code === 'EVSARCHIVEBUSY' && gateOf(Array.isArray(r.applied)) && r.applied.length > 0, r); }

{ const PR = path.join(repo, 'src/routes/persistence.js'); delete require.cache[require.resolve(PR)];   // a fresh module: its router is module-level — a second setup's routes would sit behind the first's
  const r = await configImport(require(PR), 'real-failing', 'failing');
  check('r2292: a configuration import while an OWED archive write keeps failing is refused WHOLE by name (503 EVSARCHIVEFAILING), and NO section is applied', r.status === 503 && r.code === 'EVSARCHIVEFAILING' && !r.applied && r.language === 'en', r); }
{ const BUSY = "    { const busy = sections.includes('tasks') && file.sections.tasks !== undefined ? getTasks?.()?.archiveBusy?.() : null;";
  const BELT_LINE = "if (e && (e.code === 'EVSARCHIVEBUSY' || e.code === 'EVSARCHIVEFAILING')) return afterAll(";
  const r = await configImport(MUT.load('src/routes/persistence.js', anchored(anchored(PRS, BUSY, '    { const busy = null;', 'import-busy-cut2'), BELT_LINE, 'if (false) return afterAll(', 'import-busy-belt-cut'), 'import-busy-belt-cut'), 'red2');
  check('CONTROL (a copy without the whole refusal AND without the belt — the release): the refusal leaves the route unanswered (the server\'s bare 500; the page says only «Import failed») after the settings were applied — red', r.status === 'threw' && r.code === 'EVSARCHIVEBUSY' && !r.applied && r.language === 'ja', r); }

console.log('⑥ the doors: the route, the Task log window');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const server = strip(fs.readFileSync(path.join(repo, 'server.js'), 'utf8'));
const tgw = strip(fs.readFileSync(path.join(repo, 'src/server/task-groups-wiring.js'), 'utf8')); // the Task Groups' routes, «make room» 2026-11-17: moved whole out of server.js (server.js mounts them through mountRoutes)
const log = strip(fs.readFileSync(path.join(repo, 'src/lib/task-log.js'), 'utf8'));
check('server.js: GET /api/tasks/:id/progress answers readProgress(before, limit); an agent token only for a group it belongs to', gateOf(/app\.get\('\/api\/tasks\/:id\/progress'[\s\S]{0,900}?groupsForSession\([\s\S]{0,200}?\.some\(\(g\) => g\.id === req\.params\.id\)[\s\S]{0,200}?tasks\.readProgress\(req\.params\.id, \{ before: req\.query\.before, limit: req\.query\.limit \}\)/.test(tgw)) && verdictOf(/task-groups-wiring\.js'\)\.mountRoutes\(\{ app,/.test(server)));   // stale-pins: kept — it reads src/server/task-groups-wiring.js (tgw), where the route still asks groupsForSession( (B-55dc took the word only out of server.js's groupsOf wrappers)
check('task-log.js: every read of the rows goes through allEntries() (the archive rows included) — no bare task.progress list read left in the activity paths', (log.match(/allEntries\(\)/g) || []).length >= 6 && !/const shownEntries = \(\) => \(task\.progress/.test(log) && !/\(task\.progress \|\| \[\]\)\.find\(\(p\) => keyOf\(p\) === k\)/.test(log));
check('task-log.js: no "Show more" button — the sentinel row loads as the reader nears the end (scroll, one screen ahead)', !/Show more|Load more|Show older/i.test(log) && verdictOf(/moreEl\.getBoundingClientRect\(\)\.top - body\.getBoundingClientRect\(\)\.bottom < body\.clientHeight/.test(log)));
check('task-log.js: a clear that reached the archive re-reads the held rows; an answer begun before it is dropped (generation)', gateOf(/if \(\(task\.archiveClearedAt \|\| 0\) !== older\.clearedAt\) \{[^\n]*older\.gen\+\+;[^\n]*loadOlder\(older\.list\.length\)/.test(log)) && verdictOf(/\n\s*if \(g0 !== older\.gen\) return;/.test(log)));
for (const row of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 5, label: 'CONTROL: ' })) check(row.name, verdictOf(row.pass), row.detail);

fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(`${failed ? `FAILED (${failed})` : 'ALL PASS'} (${passed} passed)`);
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
