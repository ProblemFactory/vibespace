#!/usr/bin/env node
// test-progress-archive (fast, in-process) — 2.369.204, the owner 2026-10-03 "进展记录不再删除": a Task Group's
// Activity log keeps its newest 500 entries live and MOVES the overflow to data/task-groups-archive/<taskId>/<YYYY-MM>.ndjson
// (append-only, written BEFORE the live list is trimmed). Judged on the REAL store in a scratch data dir: nothing is
// lost, a crash duplicate is read once, pages walk the whole log by `before` within a byte budget, a clear reaches the
// archive copy (ONE month file rewritten), a delete takes the directory, a config bundle carries it — each rule bitten
// by a patched copy of src/task-groups.js (scripts/mutant-copy.mjs).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(repo, 'src/task-groups.js'), 'utf8');
const RC = require(path.join(repo, 'src/record-clear.js'));
const MUT = mutantCopies('progress-archive', repo);
let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + JSON.stringify(e).slice(0, 600) : ''}`); } };
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-parch-'));
let seq = 0;
const freshDir = () => { const d = path.join(tmpRoot, String(++seq)); fs.mkdirSync(d, { recursive: true }); return d; };
const patched = (from, to, tag) => { if (!SRC.includes(from)) throw new Error(`control anchor gone: ${tag}`); return MUT.load('src/task-groups.js', SRC.replace(from, to), tag); };
const REAL = require(path.join(repo, 'src/task-groups.js'));
const mk = (M = REAL, dir = freshDir()) => { const tg = new M.TaskGroupManager({ dataDir: dir, onChange: () => {} }); const t = tg.create({ title: 'arch' }); return { tg, id: t.id, dir }; };
const archDir = (w) => path.join(w.dir, 'task-groups-archive', w.id);
const archLines = (w) => { try { return fs.readdirSync(archDir(w)).sort().flatMap((f) => fs.readFileSync(path.join(archDir(w), f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))); } catch { return []; } };
/** n entries written straight into the live list (the store's own shape), then one addProgress = the real overflow path */
const seed = (w, n, t0 = Date.UTC(2026, 8, 30, 23, 0), step = 60e3) => {
  const t = w.tg._state.tasks[w.id];
  t.progress = Array.from({ length: n }, (_, i) => ({ id: 'P-' + (0x100000 + i).toString(16), at: t0 + i * step, note: `note ${i}`, ...(i % 7 === 0 ? { detail: `detail ${i}` } : {}), session: i % 2 ? 'claude:a' : 'claude:b' }));
};
const walk = (w, limit = 100) => { const all = []; let before = null, pages = 0, r; do { r = w.tg.readProgress(w.id, { before, limit }); all.push(...r.entries); if (r.entries.length) before = r.entries[r.entries.length - 1].at; pages++; } while (r.more && pages < 500); return { all, pages }; };

console.log('① the overflow is MOVED, never dropped (written before the trim; a failed write keeps it live)');
const ruleMoved = (M) => { const w = mk(M); seed(w, 500); for (let i = 0; i < 12; i++) w.tg.addProgress(w.id, { note: `fresh ${i}`, session: 'claude:a' }); const live = w.tg.get(w.id).progress; const arch = archLines(w); const ids = new Set([...arch, ...live].map((p) => p.id)); return { live: live.length, arch: arch.length, union: ids.size, oldestArchived: arch[0] && arch[0].note }; };
{ const r = ruleMoved(REAL); check('500 live + 12 added ⇒ 500 live, 12 archived, 512 distinct entries (nothing lost)', r.live === 500 && r.arch === 12 && r.union === 512 && r.oldestArchived === 'note 0', r); }
{ const M = patched('t.progress = this._keepLive(id, t.progress);', 't.progress = t.progress.slice(-500);', 'dropped'); const r = ruleMoved(M); check('CONTROL: the pre-lane trim (slice(-500), no archive) loses the 12 — the rule above goes red', r.union === 500 && r.arch === 0, r); }
{ const w = mk(); seed(w, 500); fs.mkdirSync(path.join(w.dir, 'task-groups-archive'), { recursive: true }); fs.writeFileSync(archDir(w), 'not a dir'); const err = console.error; console.error = () => {}; try { w.tg.addProgress(w.id, { note: 'x' }); } finally { console.error = err; } check('a failed archive write keeps the overflow LIVE (501 entries), never a loss', w.tg.get(w.id).progress.length === 501); }
{ const order = []; const w = mk(); seed(w, 500); const a = w.tg._archiveProgress.bind(w.tg); w.tg._archiveProgress = (...x) => { order.push('archive:' + w.tg.get(w.id).progress.length); return a(...x); }; w.tg.addProgress(w.id, { note: 'y' }); check('the archive append runs while the live list still holds the entry (before the trim and the save)', order[0] === 'archive:501', order); }

console.log('② pages walk the whole log by `before` — newest first, deduped, nothing skipped at a shared instant');
{ const w = mk(); seed(w, 900); w.tg._state.tasks[w.id].progress = w.tg._keepLive(w.id, w.tg._state.tasks[w.id].progress);
  const files = fs.readdirSync(archDir(w)).sort();
  check('the archive splits by the entry\'s UTC month (2026-09 / 2026-10 files)', files.join() === '2026-09.ndjson,2026-10.ndjson', files);
  w.tg._archiveProgress(w.id, [w.tg.get(w.id).progress[0]]);   // a crash between the append and the trim: the oldest live entry is in both
  const { all, pages } = walk(w, 100);
  const ids = all.map((p) => p.id);
  check('a 100-entry walk returns all 900 entries once each (the crash duplicate read once)', ids.length === 900 && new Set(ids).size === 900, { n: ids.length, uniq: new Set(ids).size, pages });
  check('…newest first, every page', all.every((p, i) => !i || all[i - 1].at >= p.at));
  check('limit is clamped to 200', w.tg.readProgress(w.id, { limit: 5000 }).entries.length === 200); }
{ const w = mk(); seed(w, 520, Date.UTC(2026, 9, 1), 60e3); const t = w.tg._state.tasks[w.id]; for (const i of [17, 18, 19]) t.progress[i].at = t.progress[16].at; t.progress = w.tg._keepLive(w.id, t.progress);
  const p1 = w.tg.readProgress(w.id, { before: t.progress[0].at, limit: 4 }); const p2 = w.tg.readProgress(w.id, { before: p1.entries[p1.entries.length - 1].at, limit: 4 });
  const got = [...p1.entries, ...p2.entries].map((p) => p.id);
  check('four entries of ONE millisecond at a page boundary ride together (a `before` cursor never skips one)', ['P-100010', 'P-100011', 'P-100012', 'P-100013'].every((x) => got.includes(x)), got); }

console.log('③ one page reads a bounded number of bytes (binary search into the month, not a scan from its end)');
const ruleBounded = (M) => { const w = mk(M); const t = w.tg._state.tasks[w.id]; const big = 'x'.repeat(900); seed(w, 6500, Date.UTC(2026, 9, 1), 1000); for (const p of t.progress) p.detail = big; t.progress = w.tg._keepLive(w.id, t.progress);
  const lines = archLines(w); const mid = lines[1000].at; let bytes = 0; const rs = fs.readSync; fs.readSync = (fd, b, o, l, p) => { const n = rs(fd, b, o, l, p); bytes += n; return n; };
  let r; try { r = w.tg.readProgress(w.id, { before: mid, limit: 100 }); } finally { fs.readSync = rs; }
  return { bytes, size: fs.statSync(path.join(archDir(w), '2026-10.ndjson')).size, n: r.entries.length, first: r.entries[0] && r.entries[0].at < mid };
};
{ const r = ruleBounded(REAL); check('a page 1000 lines into a ~5.7 MB month reads < 1.5 MB and answers 100 entries older than the cursor', r.bytes < 1.5e6 && r.n === 100 && r.first && r.size > 5e6, r); }
{ const M = patched('  if (!Number.isFinite(lim)) return size;', '  return size;', 'scan-from-end'); const r = ruleBounded(M); check('CONTROL: without the binary search the same page scans from the month\'s end (> 1.5 MB) — the rule goes red', r.bytes > 1.5e6, r); }

console.log('④ a clear reaches the archive copy — ONE month file rewritten, the rest byte-identical');
const ruleClear = (M) => { const w = mk(M); seed(w, 560, Date.UTC(2026, 8, 30, 23, 30)); const t = w.tg._state.tasks[w.id]; t.progress[40].note = 'PLANTED-word'; t.progress[40].detail = 'PLANTED-detail'; t.progress = w.tg._keepLive(w.id, t.progress);
  const other = fs.readFileSync(path.join(archDir(w), '2026-09.ndjson'), 'utf8');
  const r = w.tg.clearProgress(w.id, ['P-100028'], { by: 'owner' });
  const oct = fs.readFileSync(path.join(archDir(w), '2026-10.ndjson'), 'utf8');
  return { r, gone: !oct.includes('PLANTED') && !other.includes('PLANTED'), sentence: oct.includes(RC.CLEARED_TEXT), otherSame: fs.readFileSync(path.join(archDir(w), '2026-09.ndjson'), 'utf8') === other, tmp: fs.readdirSync(archDir(w)).filter((f) => f.endsWith('.tmp')), stamp: !!w.tg.get(w.id).archiveClearedAt, w };
};
{ const t0 = ruleClear(REAL); check('an archived entry (planted words) cleared by its P- id: the words gone, the sentence there, cleared:[id]', t0.r.cleared.join() === 'P-100028' && t0.gone && t0.sentence, t0.r);
  check('…the other month file byte-identical, no .tmp left, the group stamps archiveClearedAt (the window re-reads)', t0.otherSame && !t0.tmp.length && t0.stamp, t0);
  const w = t0.w; const lines = archLines(w); const atRef = String(lines.find((p) => p.id === 'P-100009').at);
  check('…by its ms `at` too', w.tg.clearProgress(w.id, [atRef]).cleared.join() === 'P-100009' && archLines(w).find((p) => p.id === 'P-100009').note === RC.CLEARED_TEXT);
  const refused = w.tg.clearProgress(w.id, ['P-10000a'], { allow: () => ({ ok: false, code: 'not_yours' }) });
  check('…the caller\'s verdict is asked of an archived entry (refused ⇒ untouched)', refused.refused.length === 1 && archLines(w).find((p) => p.id === 'P-10000a').note === 'note 10');
  const dup = w.tg.get(w.id).progress[0]; w.tg._archiveProgress(w.id, [dup]);
  w.tg.clearProgress(w.id, [dup.id]);
  check('…a LIVE entry\'s crash-duplicate in the archive is cleared with it', archLines(w).filter((p) => p.id === dup.id).every((p) => p.note === RC.CLEARED_TEXT) && w.tg.get(w.id).progress[0].note === RC.CLEARED_TEXT); }
{ const M = patched('if (!hits.length) { hits = this._archiveFind(id, ref); live = false; }', '', 'live-only'); const r = ruleClear(M); check('CONTROL: a clear that looks in the live list only misses the planted archive line (unknown) — red', !r.gone && r.r.unknown.length === 1, r.r); }

console.log('⑤ a Task Group delete takes its archive; Backup & migrate carries it');
const ruleDelete = (M) => { const w = mk(M); seed(w, 505); w.tg._state.tasks[w.id].progress = w.tg._keepLive(w.id, w.tg._state.tasks[w.id].progress); const had = fs.existsSync(archDir(w)); w.tg.remove(w.id); return { had, after: fs.existsSync(archDir(w)) }; };
{ const r = ruleDelete(REAL); check('delete ⇒ data/task-groups-archive/<id>/ is gone', r.had && !r.after, r); }
{ const M = patched('if (archivableId(id)) fs.rmSync(path.join(this._archiveRoot, id), { recursive: true, force: true });', '', 'keep-dir'); const r = ruleDelete(M); check('CONTROL: without the rmSync the archived words outlive the group — red', r.had && r.after, r); }
{ const a = mk(); seed(a, 530); const t = a.tg._state.tasks[a.id]; t.progress = a.tg._keepLive(a.id, t.progress); a.tg.clearProgress(a.id, ['P-100002']);
  const bundle = JSON.parse(JSON.stringify(a.tg.exportBundle()));
  const b = { tg: new REAL.TaskGroupManager({ dataDir: freshDir(), onChange: () => {} }) }; b.id = a.id; b.dir = b.tg._file.replace(/\/task-groups\.json$/, '');
  fs.mkdirSync(archDir(b), { recursive: true }); fs.writeFileSync(path.join(archDir(b), '2026-09.ndjson'), JSON.stringify({ id: 'P-100002', at: archLines(a).find((p) => p.id === 'P-100002').at, note: 'old copy words', session: null }) + '\n');
  b.tg.importBundle(bundle);
  const got = archLines(b);
  check('exportBundle carries the archive months; importBundle writes them (30 archived entries arrive)', !!bundle.archive && got.length === 30 && walk(b).all.length === 530, { n: got.length });
  check('…merged by id, a cleared copy wins over the target\'s uncleared one', got.find((p) => p.id === 'P-100002').note === RC.CLEARED_TEXT && !got.some((p) => /old copy words/.test(p.note))); }
{ const M = patched("return { version: 1, tasks: Object.values(this._state.tasks), ...(Object.keys(archive).length ? { archive } : {}) };", 'return { version: 1, tasks: Object.values(this._state.tasks) };', 'no-export'); const a = mk(M); seed(a, 530); a.tg._state.tasks[a.id].progress = a.tg._keepLive(a.id, a.tg._state.tasks[a.id].progress); check('CONTROL: a bundle without the archive leaves the 30 behind — red', !a.tg.exportBundle().archive); }

console.log('⑥ the doors: the route, the Task log window');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const server = strip(fs.readFileSync(path.join(repo, 'server.js'), 'utf8'));
const log = strip(fs.readFileSync(path.join(repo, 'src/lib/task-log.js'), 'utf8'));
check('server.js: GET /api/tasks/:id/progress answers readProgress(before, limit); an agent token only for a group it belongs to', /app\.get\('\/api\/tasks\/:id\/progress'[\s\S]{0,900}?groupsForSession\([\s\S]{0,200}?\.some\(\(g\) => g\.id === req\.params\.id\)[\s\S]{0,200}?tasks\.readProgress\(req\.params\.id, \{ before: req\.query\.before, limit: req\.query\.limit \}\)/.test(server));
check('task-log.js: every read of the rows goes through allEntries() (the archive rows included) — no bare task.progress list read left in the activity paths', (log.match(/allEntries\(\)/g) || []).length >= 6 && !/const shownEntries = \(\) => \(task\.progress/.test(log) && !/\(task\.progress \|\| \[\]\)\.find\(\(p\) => keyOf\(p\) === k\)/.test(log));
check('task-log.js: no "Show more" button — the sentinel row loads as the reader nears the end (scroll, one screen ahead)', !/Show more|Load more|Show older/i.test(log) && /moreEl\.getBoundingClientRect\(\)\.top - body\.getBoundingClientRect\(\)\.bottom < body\.clientHeight/.test(log));
check('task-log.js: a clear that reached the archive re-reads the held rows; an answer begun before it is dropped (generation)', /if \(\(task\.archiveClearedAt \|\| 0\) !== older\.clearedAt\) \{[^\n]*older\.gen\+\+;[^\n]*loadOlder\(older\.list\.length\)/.test(log) && /\n\s*if \(g0 !== older\.gen\) return;/.test(log));
for (const row of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 5, label: 'CONTROL: ' })) check(row.name, row.pass, row.detail);

fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(`${failed ? `FAILED (${failed})` : 'ALL PASS'} (${passed} passed)`);
process.exit(failed ? 1 : 0);
