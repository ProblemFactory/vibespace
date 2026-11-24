#!/usr/bin/env node
// THE OLDER READERS NEVER READ A READER's REFUSAL AS EMPTY (row B-422c, second half — 主开发 r3499 / r3507; lane mask-value-shape).
// A refusal BY THE OFF-THREAD READER (SafeFs's worker restarting after a deadline — no-worker —, or its own deadline) is UNKNOWN:
// «not read now», with why, never «empty», «absent» or «not answering». Every refusal here is PLACED (a stand-in reader, a placed
// storage root — never a real mount); each leg has its RED: a copy of the module as the release read it (2.369.417, 9cdd6ba46).
//   ① the Task Group's context table (src/task-groups.js): the row's kind and words, the folder's LAST READ listing with its age, a
//     told file's size, the signature that never moves on a refused read (the seen marks); the page's words in three languages.
//     It runs on the manager's OWN storage facts (src/storage-facts.js) over a stand-in reader, so their landing clear fires
//     (line 834's round, 主开发 r3771); the facts' 4 s life is passed by a placed clock, never waited out
//   ② the ask judge (src/server/artifact-registry.js judgeAsk): «not checked now — run vibespace-ask again», never «a folder without
//     design.json»; the agent's words stay English
//   ③ the legacy GET /api/dir-complete (src/routes/files.js): its bound is `partial` with words, a refusal its error and code; a
//     parent that does not exist stays a plain empty answer
//   ④ an upload refused at file k (src/routes/files.js POST /api/upload + src/lib/utils.js uploadFilesBatched): the reply says what
//     LANDED (a field gained, none lost), and the page's retry posts only the rest — a landed file is never placed twice
import './scratch.mjs';   // FIRST (B-ba47): this suite runs on a temp home of its own
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, got) => { if (typeof n !== 'string') throw new TypeError('ok(c, n): the name is a ' + typeof n + ' — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (got === undefined ? '' : '  got ' + JSON.stringify(got).slice(0, 500))); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME
function editAnchor(text, from, to, file) {
  const n = String(text).split(String(from)).length - 1;
  if (n !== 1) ok(false, `ANCHOR (${file}): ${JSON.stringify(String(from)).slice(0, 100)} — found ${n} times, one meant: the red copy is not the release's`);
  return String(text).replace(from, to);
}
const M = mutantCopies('b422c', REPO);
const NO_WORKER = () => Object.assign(new Error('no worker of the file pool is running — one did not answer in time and is restarting, or none could start'), { code: 'no-worker', status: 503 });
const TIMED_OUT = () => Object.assign(new Error('Storage not responding (operation timed out).'), { status: 503, safeFsTimeout: true });
const ENOENT = () => Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
const EIO = () => Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
// line 834's round (主开发 r3771): SafeFs's one-try refusal, and its deadline met while NO worker was ever taken (src/safe-fs.js)
const TRYING = () => Object.assign(new Error('this folder or file is still being tried — the first press on it has not answered yet: /x'), { status: 503, code: 'path-trying' });
const NO_WORKER_DEADLINE = () => Object.assign(TIMED_OUT(), { noWorker: true });

console.log('① THE TASK GROUP\'s CONTEXT TABLE: a reader refusal is «not read now», the last read listing kept and said with its age');
{
  const SP = require(path.join(REPO, 'src/storage-path.js'));
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'b422c-placed-storage-'));   // a PLACED storage root: nothing reads it (the reader is a stand-in)
  SP.setRoots([{ root: ROOT, kind: 'storage', name: 'placed' }]);
  const DIR = path.join(ROOT, 'notes'), FILE = path.join(ROOT, 'brief.md');
  const SRC = read('src/task-groups.js');
  const RELEASE = M.load('src/task-groups.js', editAnchor(SRC, 'const readerDownWhy = (f) => (', 'const readerDownWhy = (f) => false && (', 'src/task-groups.js'), 'b422c-tg-release');   // the release read every refusal as a fact
  // the unit's first form (6f3e594b3): the walk kept only its own cache's hit — the one the facts' landing clears
  const FIRST = M.load('src/task-groups.js', editAnchor(SRC, 'const kept = (this._lastGood && this._lastGood.get(dir)) || hit;', 'const kept = hit;', 'src/task-groups.js'), 'b422c-tg-first');
  // line 834's follow (主开发 r3809): its cure's form (2c43d13f4) — the kept listing stamped when the walk TOOK the facts' reply, its age
  // in seconds whatever its size, and an older listing allowed back over a newer one
  const TAKEN = M.load('src/task-groups.js', editAnchor(editAnchor(editAnchor(SRC, 'this._keepGood(dir, w, this._lastReadFrom != null ? this._lastReadFrom : at);', 'this._keepGood(dir, w, at);', 'src/task-groups.js'),
    'const readAgo = (ms) => { ', 'const readAgo = (ms) => `${Math.max(0, Math.round(Number(ms) / 1000))} s ago`; const readAgo0 = (ms) => { ', 'src/task-groups.js'),
    'if (had && had.at > at) return;', 'if (false) return;', 'src/task-groups.js'), 'b422c-tg-taken');
  const NOW = require(path.join(REPO, 'src/task-groups.js'));
  const realNow = Date.now; let SHIFT = 0;
  Date.now = () => realNow() + SHIFT;   // the placed clock (restored below): the facts' and the caches' 4 s pass without a wait
  const mgrOf = (mod) => {
    const A = new Map();   // 'op path' → the placed answer: a value, or an Error made fresh
    const reader = { call: async (op, p) => { const a = A.get(op + ' ' + (p && p.path)); if (!a) throw ENOENT(); const v = a(); if (v instanceof Error) throw v; return v; } };
    const m = new mod.TaskGroupManager({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'b422c-tg-')), mirrorFs: () => reader });
    m.__A = A;
    return m;
  };
  // a placed answer LANDS: the clock passes the facts' life, a reader asks (the kept fact answers meanwhile), the read lands
  const landed = async (m, key, answer, ask) => { m.__A.set(key, answer); SHIFT += 5000; const t0 = Date.now(); ask(); await m._facts.settled(); return t0; };
  const answers = { no: NO_WORKER, slow: TIMED_OUT, eio: EIO, enoent: ENOENT, trying: TRYING, noWorkerDeadline: NO_WORKER_DEADLINE };
  const kinds = async (m) => { const out = []; for (const [k, a] of Object.entries(answers)) { await landed(m, 'stat ' + FILE, a, () => m._kindOf(FILE)); out.push([k, m._kindOf(FILE), m._notReadOf(FILE)]); } return out; };
  const view = async (m) => {
    const listing = [{ path: 'a.md', size: 3, mtime: 1 }, { path: 'b.md', size: 4, mtime: 2 }];
    const t0 = await landed(m, 'contextFiles ' + DIR, () => listing, () => m._walk(DIR, { fresh: true }));   // the read BEGINS here
    const first = m._walk(DIR, { fresh: true });
    await landed(m, 'contextFiles ' + DIR, NO_WORKER, () => m._walk(DIR));
    const clearedByLanding = !(m._walkCache && m._walkCache.get(DIR));   // the facts' OWN landing cleared the walk's cache
    const later = m._walk(DIR);
    const row = m._rowAt({ path: DIR, note: '' }, { abs: DIR, kind: 'dir' }, 'names');
    await landed(m, 'stat ' + FILE, NO_WORKER, () => m._kindOf(FILE));
    const file = m._rowAt({ path: FILE, note: '' }, { abs: FILE, kind: 'file' }, 'names');
    const head = m._rowHead({ path: FILE, note: 'the brief' }, { abs: FILE, kind: m._kindOf(FILE) });
    const ages = [];   // the same refused folder 10 min, then 3 h, then 3 d later (the placed clock)
    for (const step of [600000, 3 * 3600000, 3 * 86400000]) { SHIFT += step; ages.push(m._rowAt({ path: DIR, note: '' }, { abs: DIR, kind: 'dir' }, 'names').lines[0] || ''); await m._facts.settled(); }
    return { t0, first, later, clearedByLanding, row: row.lines.join('\n'), file: file.lines.join('\n'), head, ages };
  };
  const sigs = async (m) => {   // the no-reader road's signature (a suite, a CLI): a fact not read now DEFERS — the seen marks never move
    const t = { id: 'g-b422c', ctx: [] };
    m._hasTold = () => true; m._sigKey = () => 'k-b422c'; m._sigJobs = () => [{ kind: 'file', abs: FILE }]; m._sigReader = () => null;
    await landed(m, 'stat ' + FILE, () => ({ size: 7, mtimeMs: 1000, isFile: true, isDirectory: false }), () => m.signatureFact(t));
    const a = m.signatureFact(t);
    await landed(m, 'stat ' + FILE, NO_WORKER, () => m.signatureFact(t));
    const b = m.signatureFact(t);
    return { a, b };
  };
  const k = await kinds(mgrOf(NOW)), v = await view(mgrOf(NOW)), s = await sigs(mgrOf(NOW));
  const K = Object.fromEntries(k.map(([n, kind, why]) => [n, [kind, why]]));
  ok(K.no[0] === 'reading' && K.no[1] === 'restarting' && K.slow[0] === 'reading' && K.slow[1] === 'slow' && K.eio[0] === 'blocked' && K.enoent[0] === 'missing',
    `① the row's kind: a restarting reader and a timed-out read are «reading» with their why, the storage's own EIO stays blocked, ENOENT missing (${JSON.stringify(k)})`);
  ok(K.trying[0] === 'reading' && K.trying[1] === 'slow' && K.noWorkerDeadline[0] === 'reading' && K.noWorkerDeadline[1] === 'restarting',
    `① the reader's one-try refusal (path-trying) is «did not answer in time», and a deadline met with NO worker taken is «restarting» (its noWorker carried by the facts) (${JSON.stringify({ trying: K.trying, noWorkerDeadline: K.noWorkerDeadline })})`);
  ok(/— not read now \(its reader is restarting\): it is read again at the next ask/.test(v.head) && !/not answering/.test(v.head), `① the row's words: «not read now (its reader is restarting)», never «not answering» (${JSON.stringify(v.head)})`);
  ok(v.clearedByLanding === true && v.first.files.length === 2 && v.later.files.length === 2 && v.later.notRead === 'restarting' && typeof v.later.readAt === 'number',
    `① the facts' OWN landing cleared the walk's cache, and the refused listing still keeps the LAST READ one, marked with its why and when it was read — never an empty folder (${JSON.stringify({ cleared: v.clearedByLanding, n: v.later.files.length, notRead: v.later.notRead })})`);
  ok(/not read now \(its reader is restarting\): the listing below is the LAST READ one, \d+ s ago — 2 files/.test(v.row) && /a\.md/.test(v.row) && !/0 files/.test(v.row), `① the folder's row says it is the last read listing, with its age (${JSON.stringify(v.row)})`);
  ok(/size not read now \(its reader is restarting\)/.test(v.file) && !/— 0 B/.test(v.file), `① a told file's size not read now is said so, never «0 B» (${JSON.stringify(v.file)})`);
  ok(s.a.stale === false && s.a.sig.length > 0 && s.b.stale === true, `① a refused read moves no seen mark: the signature DEFERS (stale) — the hook then defers the group whole, so only a true change is re-sent (${JSON.stringify(s)})`);
  const kr = await kinds(mgrOf(RELEASE)), vr = await view(mgrOf(RELEASE)), sr = await sigs(mgrOf(RELEASE));
  ok(kr[0][1] === 'blocked' && vr.later.files.length === 0 && /— 0 B/.test(vr.file) && /not answering/.test(vr.head) && sr.b.stale === false && sr.b.sig !== sr.a.sig,
    `RED CONTROL (the release's readers): «not answering», an EMPTY folder, «0 B», and a signature that changed on a refused read (${JSON.stringify({ kind: kr[0][1], files: vr.later.files.length, sig: sr.b })})`);
  const vf = await view(mgrOf(FIRST));
  ok(vf.clearedByLanding === true && vf.later.files.length === 0 && vf.later.readAt === null && /no listing read yet/.test(vf.row),
    `RED CONTROL (the unit's first form, 6f3e594b3): the facts' landing cleared the walk's cache and the row said «no listing read yet» — a listing read seconds before (${JSON.stringify(vf.row)})`);
  // line 834's follow (主开发 r3809): the kept listing is as old as the READ that gave it, and its age reads as the tree's marks do
  ok(v.later.readAt - v.t0 >= 0 && v.later.readAt - v.t0 < 1000, `① the kept listing is stamped with its READ's own time (when it began), never when a walk took the facts' reply 5 s later (${v.later.readAt - v.t0} ms after the read began)`);
  ok(/LAST READ one, 10 min ago — 2 files/.test(v.ages[0]) && /LAST READ one, 3 h ago — 2 files/.test(v.ages[1]) && /LAST READ one, 3 d ago — 2 files/.test(v.ages[2]),
    `① the kept listing's age reads as the tree's marks do: min, h, d (${JSON.stringify(v.ages.map((l) => (l.match(/LAST READ one, [^—]+—/) || [''])[0]))})`);
  const vt = await view(mgrOf(TAKEN));
  ok(vt.later.readAt - vt.t0 >= 5000 && /LAST READ one, \d{4,} s ago/.test(vt.ages[1]), `RED CONTROL (line 834's cure, 2c43d13f4): stamped when the walk took the reply (${vt.later.readAt - vt.t0} ms after the read began), and «${(vt.ages[1].match(/\d+ s ago/) || [''])[0]}»`);
  const keepOrder = (mod) => { const m = mgrOf(mod); m._keepGood('/b422c-k', { files: [{ path: 'new.md', size: 1, mtime: 2 }], over: false }, 2000); m._keepGood('/b422c-k', { files: [{ path: 'old.md', size: 1, mtime: 1 }], over: false }, 1000); return m._lastGood.get('/b422c-k'); };
  const kn = keepOrder(NOW), kt = keepOrder(TAKEN);
  ok(kn.w.files[0].path === 'new.md' && kn.at === 2000, `① a signature hit adopted late never puts an OLDER listing back over a newer kept one (${JSON.stringify(kn)})`);
  ok(kt.w.files[0].path === 'old.md', `RED CONTROL (line 834's cure): the older listing replaced the newer one (${JSON.stringify(kt.w.files)})`);
  Date.now = realNow;
  // the page (src/lib/task-detail.js) words the why in three languages; the agent's table words stay English
  const td = read('src/lib/task-detail.js'), zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const W = ['Not read now: its storage did not answer in time — look again in a moment', 'Not read now: its reader is restarting — look again in a moment'];
  ok(/kind === 'reading' && x && \(x\.why === 'restarting' \|\| x\.why === 'slow'\)/.test(td) && W.every((w) => td.includes(`t('${w}')`) && zh.includes(`"${w}":`) && ja.includes(`"${w}":`)),
    '① the person\'s page words a reader refusal by its why, in English, Chinese and Japanese (the context row\'s state line)');
  ok(/\.\.\.\(x\.kind === 'reading' && NOT_READ_WORDS\[this\._notReadOf\(x\.abs\)\] \? \{ why: this\._notReadOf\(x\.abs\) \} : \{\}\)/.test(SRC), '① the page\'s wire (ctxRes) carries the why of a reading row');
}

console.log('② THE ASK JUDGE: a refused manifest probe is «not checked now — run vibespace-ask again», never «a folder without design.json»');
{
  const SRC = read('src/server/artifact-registry.js');
  const NOW = require(path.join(REPO, 'src/server/artifact-registry.js'));
  let rel = editAnchor(SRC, "if (readerDown(e)) return 'try-again'; ", '', 'src/server/artifact-registry.js');
  const i = rel.indexOf('      catch (e) {   // B-422c: the manifest'), j = rel.indexOf('        continue;\n      }', i);
  if (i < 0 || j < 0) ok(false, 'ANCHOR (src/server/artifact-registry.js): the manifest catch — not found: the red copy is not the release\'s');
  else rel = rel.slice(0, i) + "      catch { bad.push({ item, why: 'folder', error: `${item}: a folder without ${ASK_MANIFEST} — attach a file in it, or a design folder (vibespace-design new|open makes one)` }); continue; }" + rel.slice(j + '        continue;\n      }'.length);   // stale-pins: kept (the release's line is this red copy's REPLACEMENT, never an anchor)
  const RELEASE = M.load('src/server/artifact-registry.js', rel, 'b422c-ar-release');
  const DIR = path.join(os.tmpdir(), 'b422c-design-folder');
  const judge = (mod, manifestErr, firstErr = null) => mod.judgeAsk({ session: { host: 'local', cwd: '/' }, items: [DIR], fsCall: async (op, p) => {
    if (p.path === DIR) { if (firstErr) throw firstErr(); return { isDirectory: true }; }
    if (p.path.endsWith('/design.json')) throw manifestErr();
    return { isDirectory: false };
  } });
  const a = await judge(NOW, NO_WORKER), b = await judge(NOW, TIMED_OUT), c = await judge(NOW, ENOENT), d = await judge(NOW, ENOENT, NO_WORKER);
  const e1 = await judge(NOW, TRYING), e2 = await judge(NOW, ENOENT, TRYING), e3 = await judge(NOW, NO_WORKER_DEADLINE);
  ok(a.bad[0] && a.bad[0].why === 'try-again' && /not checked now \(its reader is restarting\) — run vibespace-ask again in a moment/.test(a.bad[0].error) && !/without design\.json/.test(a.bad[0].error), `② a restarting reader on the manifest: try again, in English (${JSON.stringify(a.bad[0])})`);
  ok(b.bad[0] && b.bad[0].why === 'try-again' && /its storage did not answer in time/.test(b.bad[0].error), `② a timed-out manifest probe: try again (${JSON.stringify(b.bad[0])})`);
  ok(c.bad[0] && c.bad[0].why === 'folder' && /a folder without design\.json/.test(c.bad[0].error), `② a manifest TRULY missing keeps today's words (${JSON.stringify(c.bad[0])})`);
  ok(d.bad[0] && d.bad[0].why === 'try-again' && !/check the path/.test(d.bad[0].error), `② a refused first probe is «not checked now», never «check the path» (${JSON.stringify(d.bad[0])})`);
  ok([e1, e2].every((x) => x.bad[0] && x.bad[0].why === 'try-again' && /not checked now \(its storage did not answer in time\)/.test(x.bad[0].error)) && e3.bad[0] && /not checked now \(its reader is restarting\)/.test(e3.bad[0].error),
    `② the reader's one-try refusal (path-trying), on either probe, is «not checked now (its storage did not answer in time)»; a deadline with no worker taken «its reader is restarting» (${JSON.stringify([e1.bad[0], e2.bad[0], e3.bad[0]])})`);
  const FIRST = M.load('src/server/artifact-registry.js', editAnchor(SRC, "e.code === 'path-trying' || e.noWorker", 'e.noWorker', 'src/server/artifact-registry.js'), 'b422c-ar-first');
  const f1 = await judge(FIRST, TRYING);
  ok(f1.bad[0] && f1.bad[0].why !== 'try-again', `RED CONTROL (the unit's first form): the one-try refusal judged as a fact about the folder (${JSON.stringify(f1.bad[0])})`);
  const ar = await judge(RELEASE, NO_WORKER);
  ok(ar.bad[0] && ar.bad[0].why === 'folder' && /a folder without design\.json/.test(ar.bad[0].error), `RED CONTROL (the release's catch-all): a restarting reader told «a folder without design.json» (${JSON.stringify(ar.bad[0])})`);
}

// an express app over a files router (the real one, or a red copy), its SafeFs a stand-in
const express = require('express');
const serve = async (router, sf, locals = {}) => { const app = express(); app.use(express.json()); app.locals.safeFs = sf; Object.assign(app.locals, locals); app.use(router); const s = http.createServer(app); await new Promise((r) => s.listen(0, '127.0.0.1', r)); return { s, base: `http://127.0.0.1:${s.address().port}` }; };
const FILES_SRC = read('src/routes/files.js');

console.log('③ THE LEGACY GET /api/dir-complete: a refusal is named, its bound is `partial`; a parent that does not exist stays empty');
{
  const NOW = require(path.join(REPO, 'src/routes/files.js'));
  let rel = editAnchor(FILES_SRC, "res.json({ suggestions: [], partial: true, error: 'storage did not answer in time — try again in a moment' }); }, 500);", 'res.json({ suggestions: [] }); }, 500);', 'src/routes/files.js');   // stale-pins: kept (the release's line is this red copy's REPLACEMENT, never an anchor)
  const i = rel.indexOf("    if (res.headersSent) return;\n    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return res.json({ suggestions: [] });"), j = rel.indexOf('\n  }\n});', i);
  if (i < 0 || j < 0) ok(false, 'ANCHOR (src/routes/files.js): the legacy catch — not found');
  else rel = rel.slice(0, i) + '    if (!res.headersSent) res.json({ suggestions: [] });' + rel.slice(j);   // stale-pins: kept (the release's line is this red copy's REPLACEMENT, never an anchor)
  const RELEASE = M.load('src/routes/files.js', rel, 'b422c-files-dc-release');
  let mode = 'no';
  const sf = { call: async (op) => { if (op !== 'readdirNames') return {}; if (mode === 'no') throw NO_WORKER(); if (mode === 'enoent') throw ENOENT(); return new Promise(() => {}); } };
  const a = await serve(NOW, sf), r = await serve(RELEASE, sf);
  const get = async (b) => (await fetch(b + '/api/dir-complete?path=' + encodeURIComponent('/b422c-nowhere/x'))).json();
  mode = 'no'; const x1 = await get(a.base); mode = 'enoent'; const x2 = await get(a.base); mode = 'hang'; const x3 = await get(a.base);
  mode = 'no'; const y1 = await get(r.base); mode = 'hang'; const y3 = await get(r.base);
  ok(Array.isArray(x1.suggestions) && !x1.suggestions.length && /not read now: its reader is restarting/.test(x1.error || '') && x1.code === 'no-worker', `③ a refusal answers its error and code (${JSON.stringify(x1)})`);
  ok(JSON.stringify(x2) === '{"suggestions":[]}', `③ a parent that does not exist stays a plain empty answer (${JSON.stringify(x2)})`);
  ok(x3.partial === true && /did not answer in time/.test(x3.error || '') && Array.isArray(x3.suggestions), `③ the 500 ms bound answers partial with its words (${JSON.stringify(x3)})`);
  ok(JSON.stringify(y1) === '{"suggestions":[]}' && JSON.stringify(y3) === '{"suggestions":[]}', `RED CONTROL (the release's legacy branch): a refusal and the bound look like «no matching folders» (${JSON.stringify([y1, y3])})`);
  a.s.close(); r.s.close();
}

console.log('④ AN UPLOAD REFUSED AT FILE k: the reply says what LANDED, the page re-posts only the rest');
{
  const NOW = require(path.join(REPO, 'src/routes/files.js'));
  const rel = editAnchor(FILES_SRC, "    res.status(err.status || 400).json({ ...(err.pullBody || { error: err.message }), ...landedBody(landedL, landedDir) });", '    res.status(err.status || 400).json(err.pullBody || { error: err.message });', 'src/routes/files.js');   // stale-pins: kept (the release's line is this red copy's REPLACEMENT, never an anchor)
  const RELEASE = M.load('src/routes/files.js', rel, 'b422c-files-up-release');
  // the unit's first form (6f3e594b3): the local refusal road answered `landed` and noted nothing — the landed file had no upload row
  const FIRST = M.load('src/routes/files.js', editAnchor(FILES_SRC, '    note(landedL);\n    res.status(err.status || 400)', '    res.status(err.status || 400)', 'src/routes/files.js'), 'b422c-files-up-first');
  const AR = require(path.join(REPO, 'src/server/artifact-registry.js')), realNote = AR.noteUploads, notes = [];
  AR.noteUploads = (o) => { notes.push(o); };   // the conversation's upload rows, as the route feeds them (restored below)
  const DEST = fs.mkdtempSync(path.join(os.tmpdir(), 'b422c-upload-dest-'));
  let copies = 0;
  const sf = { call: async (op, p) => { if (op === 'mkdir') { fs.mkdirSync(p.path, { recursive: true }); return {}; } if (op === 'copy') { copies++; if (copies === 2) throw NO_WORKER(); fs.copyFileSync(p.src, p.dest); return {}; } return {}; } };
  const post = async (base, q = '') => { const fd = new FormData(); for (const n of ['one.txt', 'two.txt', 'three.txt']) fd.append('files', new Blob([n]), n); fd.append('destDir', DEST); fd.append('fileNames', JSON.stringify(['one.txt', 'two.txt', 'three.txt'])); fd.append('sessionId', 's-b422c'); fd.append('uploadDirSet', '1'); const res = await fetch(base + '/api/upload' + q, { method: 'POST', body: fd }); return { status: res.status, body: await res.json() }; };
  const a = await serve(NOW, sf); copies = 0; const x = await post(a.base);
  const notedNow = notes.splice(0);   // this tree's rows only (the release copy below keeps this tree's note line)
  const r = await serve(RELEASE, sf); copies = 0; const y = await post(r.base);
  notes.splice(0);
  const f = await serve(FIRST, sf); copies = 0; await post(f.base);
  const notedFirst = notes.splice(0);
  // line 834's follow (主开发 r3809): THE PAIRED MACHINE's refusal road (?host=) — its RemoteFs a stand-in that refuses the second write
  let writes = 0;
  const RFS = { write: async (host, dest) => { if (++writes === 2) throw Object.assign(new Error('the device link refused the write'), { code: 'device_refused' }); return { dest }; }, stat: async () => null, home: async () => '/home/r', mkdir: async () => ({}) };
  const FIRST_R = M.load('src/routes/files.js', editAnchor(FILES_SRC, '      note(landedL);\n      return res.status(400)', '      return res.status(400)', 'src/routes/files.js'), 'b422c-files-up-first-r');
  const ra = await serve(NOW, sf, { getRemoteFs: () => RFS }); writes = 0; const rx = await post(ra.base, '?host=pair-b422c');
  const notedRemote = notes.splice(0);
  const rf = await serve(FIRST_R, sf, { getRemoteFs: () => RFS }); writes = 0; await post(rf.base, '?host=pair-b422c');
  const notedRemoteFirst = notes.splice(0);
  AR.noteUploads = realNote; f.s.close(); ra.s.close(); rf.s.close();
  const rowOf = (list) => list.filter((o) => o.sessionId === 's-b422c').flatMap((o) => o.files.map((x) => x.name));
  ok(rx.status === 400 && Array.isArray(rx.body.landed) && rx.body.landed.length === 1 && rx.body.landed[0].name === 'one.txt' && rowOf(notedRemote).join() === 'one.txt' && notedRemote.every((o) => o.host === 'pair-b422c'),
    `④ the paired machine's refusal road: the file written before the refused one is in \`landed\` and gets its upload row, with its machine (${JSON.stringify({ status: rx.status, landed: rx.body.landed, rows: notedRemote.map((o) => [o.host, o.files.map((x) => x.name)]) })})`);
  ok(!rowOf(notedRemoteFirst).includes('one.txt'), `RED CONTROL (the unit's first form, the paired machine's road): no upload row for the written file (${JSON.stringify(rowOf(notedRemoteFirst))})`);
  ok(x.status === 503 && typeof x.body.error === 'string' && Array.isArray(x.body.landed) && x.body.landed.length === 1 && x.body.landed[0].name === 'one.txt' && x.body.landedOf === 3,
    `④ the refusal at file 2 of 3 keeps its error and GAINS landed: [one.txt], landedOf 3 (${JSON.stringify(x)})`);
  ok(rowOf(notedNow).includes('one.txt'), `④ the file that landed before the refusal gets its conversation's upload row (the refusal road notes it) (${JSON.stringify(rowOf(notedNow))})`);
  ok(!rowOf(notedFirst).includes('one.txt'), `RED CONTROL (the unit's first form): the landed file got no upload row — the page never posts it again (${JSON.stringify(rowOf(notedFirst))})`);
  ok(y.status === 503 && !('landed' in y.body), `RED CONTROL (the release's reply): file 1 landed and the answer does not say so (${JSON.stringify(y)})`);
  a.s.close(); r.s.close();
  // the page's retry (src/lib/utils.js uploadFilesBatched, its own source run with stand-ins): a chunk refused after file 1 landed
  const U = read('src/lib/utils.js'), s0 = U.indexOf('export async function uploadFilesBatched('), s1 = U.indexOf('\n}\n', s0);
  const body = U.slice(s0, s1 + 2).replace('export async function', 'async function');
  const runUpload = (src, keptRoad, countOff = 0) => {
    const posts = [];
    const fetchStub = async (url, o) => {
      const names = JSON.parse(o.body.get('fileNames')); posts.push(names);
      if (names.length > 1) return { ok: false, status: 503, json: async () => ({ error: 'no worker of the file pool is running', code: 'no-worker', landed: [{ name: names[0], path: '/d/' + names[0], size: 1 }], landedOf: names.length + countOff, ...(keptRoad ? { keptWithConversation: true, keptFrom: '/tmp/x', dir: '/d' } : {}) }) };
      return { ok: true, status: 200, json: async () => ({ success: true, files: names.map((n) => ({ name: n, path: '/d/' + n, size: 1 })) }) };
    };
    const ctx = vm.createContext({ fetch: fetchStub, FormData, performance, metric: () => {}, _uploadName: (f) => f.name, console });
    vm.runInContext(src + '\nglobalThis.__up = uploadFilesBatched;', ctx);
    return ctx.__up([{ name: 'one.txt', size: 1 }, { name: 'two.txt', size: 1 }, { name: 'three.txt', size: 1 }], { destDir: '/d', sessionId: 's1' }).then((r) => ({ r, posts }));
  };
  const P = await runUpload(body, true);
  const relBody = editAnchor(editAnchor(body, '        const landed = Array.isArray(e.landed) && e.landed.length < chunk.length && e.landedOf === chunk.length ? e.landed : [];\n        uploaded.push(...landed);\n        for (const f of chunk.slice(landed.length)) {', '        for (const f of chunk) {', 'src/lib/utils.js'), ", { landed: landedOf(), landedOf: typeof data.landedOf === 'number' ? data.landedOf : null });", ');', 'src/lib/utils.js');   // stale-pins: kept (the release's line is this red copy's REPLACEMENT, never an anchor)
  const Q = await runUpload(relBody, true);
  const reposted = (x) => x.posts.slice(1).flat();
  ok(!reposted(P).includes('one.txt') && reposted(P).join() === 'two.txt,three.txt' && P.r.uploaded.map((f) => f.name).join() === 'one.txt,two.txt,three.txt' && P.r.uploaded[0].keptFrom === '/tmp/x',
    `④ the page's retry takes the landed file as uploaded (kept road: with its kept folder) and re-posts ONLY the rest (${JSON.stringify({ reposted: reposted(P), uploaded: P.r.uploaded.map((f) => f.name) })})`);
  const C = await runUpload(body, true, 1);   // a reply that did not count THIS chunk
  ok(reposted(C).includes('one.txt') && reposted(C).length === 3, `④ a refusal whose landedOf is not the chunk's count is not trusted: the whole chunk is retried, as before (${JSON.stringify(reposted(C))})`);
  ok(reposted(Q).includes('one.txt'), `RED CONTROL (the release's retry): the landed file is posted a second time — on the kept road, a second copy «one (1).txt» (${JSON.stringify(reposted(Q))})`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
