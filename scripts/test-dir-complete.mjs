#!/usr/bin/env node
// THE PATH FIELD'S ANSWER (lane path-field — L1 of the New Session train, POC v2.2). Fast, in-process, temp HOMEs:
//   ① GET /api/dir-complete over a REAL folder tree shaped like the POC's machine (src/routes/files.js through an
//     express app, the SafeFs op run in-process): `bases` (a relative text listed against each base, in order), `q`
//     (the folder index searched — segment prefix > subsequence > token, CJK plain), `probe` (each folder's facts: exists,
//     git, fileCount, mtime), a link to a folder answered as a LINK (an alias of its target), `self` (the checkout the
//     server runs from, its data dir, a home folder whose package.json names vibespace); the PURE rank over the answer
//     gives the POC's winners from a real disk (ir q3 → Q3-董事会材料, 合同 via ~/合同, Q3 under 投资者关系, 草稿 twice);
//     the old shape (`suggestions`) unchanged for a caller that sends none of the new params
//   ② the exclusion (ADDENDUM, study round 4): ~/vibespace — the folder with the most files, the product's own checkout —
//     is never offered (the listing rank, the fuzzy rank), typed explicitly it resolves; GET /api/home-folders drops it,
//     so day one's chips start in work/ — RED CONTROL: the census itself holds it (and firstFilesFolder would pick it)
//   ③ the 500 ms budget: a walk stalled 1.5 s ⇒ the answer comes inside the budget marked `partial`, the walk still lands
//     in the cache and the next keystroke has the hits
//   ③b B-0f3d: a hung PROBE (a Task Group's folder on a stale mount) never throws the finished listing away — the reply lists what
//     was typed (not partial) and names its late probes in the field's own words; a late probe (and any path under it) is not asked
//     again for PROBE_LATE_MS; a slow probe that answers after all is unmarked; a probe call that fails is late, never the listing's
//     end; the field marks no late probe asked, through ONE helper at both sites — RED CONTROLS: the old shape (the probes inside the
//     listing's race), the field without its filter, a site that marks by itself
//   ③e B-5561: a listing reads names and types only — a dead folder nobody typed sitting in the home never holds the home's rows; each
//     kid's facts (git, package.json, a link's kind) come from its own call behind the answer (factsLate); RED: the release's listing
//   ④ the listing cache per folder with mtime invalidation: a second ask < 2 s lists nothing again; later the worker is
//     asked with `known` and a same mtime answers `same` (no re-read); a new folder (a new mtime) is listed fresh
//     · B-1c27: a listing read within a timestamp tick of its folder's mtime is RACY (no `known` sent back): a folder made in that
//     tick is listed once the window passes — RED the exact compare
//   ⑤ the host rung with a FAKE machine (the real HostManager, its ssh rung stubbed to run the same sh here under a Mac's
//     HOME, uname = Darwin, mdls = the OS display names): the same listing for that machine — its home, a group folder
//     probed there (present) and one absent, the one declared for it (`h-mac::/…`), 文稿 for ~/Documents (an alias),
//     its index searched; the PURE rank gives the POC's remote ① (there · declared · absent «create?») and ② under each
//     group's folder THERE; recentCounts (GET /api/hosts/:id/recent-cwds) counts per folder, newest first
//   ⑥ wiring pins: the two routes take bases / q / probe / kind, the host route answers counts, SafeFs deadlines
//   ⑦ a paired machine that CANNOT be reached (lane hub-dies-dead-ssh-host — the .346 verify round's HIGH: picking it in
//     New Session stopped the hub): the real HostManager + a stub `ssh` on PATH that exits 255 at once — the host rung
//     refuses it BY NAME (code host-unreachable, «my-mac», ssh's own line) with ONE bounded probe for six asks, the route
//     says `unreachable`; every stdin road (the tools tar, the usage scanner, the opencode op, the agent install, the
//     bootstrap) answers with the named refusal and NOTHING is uncaught. RED CONTROL: a copy of hosts.js whose feedStdin
//     does not listen ⇒ an uncaught write EPIPE (what server.js's handler exits the hub on)
// THE TWO HALVES (the coordinator's r2332, lane bl-chat-b, 2026-11-22 — the suite read 17 s alone): ONE table of sections (SECTIONS
//   below) names each section's half; scripts/test-dir-complete-pool.mjs runs the POOL half (③b / ③c over the real one-worker pool and
//   the dead-path stand-in), this file alone the rest — each a fast row of its own, measured alone; every run asserts that the two halves
//   are disjoint and cover the table, and that no leg ran outside a section
// Run: node scripts/test-dir-complete.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
let bad = 0, n = 0, CUR = null; const STRAY = [];   // r2332: CUR = the section running (a leg outside every section is STRAY)
const ok = (name, cond, got) => { n++; if (!cond) bad++; if (!CUR) STRAY.push(name); console.log(`${cond ? 'ok ' : 'BAD'} ${name}${cond ? '' : '  got ' + JSON.stringify(got).slice(0, 600)}`); };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dir-complete-'));
const T00 = Date.now();
const lap = (s) => console.log(String(s).replace(/^(\n?)/, (m) => m + '[' + ((Date.now() - T00) / 1000).toFixed(1) + ' s] '));   // r2178 (5): where the suite's seconds go (each section's start)
// THE TWO HALVES (the coordinator's r2332): ONE table, each section named once with its half. scripts/test-dir-complete-pool.mjs sets
// the part IN ITS OWN PROCESS (a global: no row, kit or machine can hand it in) before it loads this file; this file run by itself
// runs 'main'. A section is a section() call: one off the table runs in neither half, a leg outside every section in both — each red.
const HALVES = ['main', 'pool'], TWIN = { main: 'test-dir-complete-pool', pool: 'test-dir-complete' };
const PART = globalThis.__VS_DIR_COMPLETE_PART === undefined ? 'main' : globalThis.__VS_DIR_COMPLETE_PART;
const SECTIONS = [
  ['①', 'main'], ['②', 'main'], ['③', 'main'], ['③c B-d833', 'pool'], ['③c M1', 'pool'], ['③b hung probe', 'pool'],
  ['③b slow probe', 'pool'], ['③c R-a', 'pool'], ['③c R-c', 'pool'], ['③c one match', 'main'], ['③c press mark', 'pool'],
  ['③c walk', 'pool'], ['③c M3', 'pool'], ['③c R-b R-d', 'pool'], ['③c R-i', 'pool'], ['③c R-d seeded', 'pool'], ['③c S4 N5', 'pool'],
  ['③c FAILED', 'pool'], ['③e B-5561', 'main'], ['③b–③d the field', 'main'], ['④', 'main'], ['④ B-1c27', 'main'], ['⑤', 'main'],
  ['⑦ unreachable', 'main'], ['⑥', 'main'], ['⑦ B-5ce7', 'main'], ['⑧ folder made', 'main'],
];
const MET = new Map();
const section = async (id, fn) => {
  MET.set(id, (MET.get(id) || 0) + 1);
  const row = SECTIONS.find(([s]) => s === id);
  if (!row || row[1] !== PART) { console.log(`    (${id}: ${row ? `the ${row[1]} half — ${TWIN[PART]}` : 'OFF THE TABLE'})`); return; }
  CUR = id; try { await fn(); } finally { CUR = null; }
};
// r2332 (2): this run's half and its twin's are disjoint, their union the whole table (a pure check, its controls planted)
const halvesOf = (table, part) => {
  const ids = table.map(([s]) => s), mine = new Set(table.filter(([, p]) => p === part).map(([s]) => s));
  const theirs = new Set(table.filter(([, p]) => p !== part && HALVES.includes(p)).map(([s]) => s));
  const both = [...mine].filter((s) => theirs.has(s)), neither = ids.filter((s) => !mine.has(s) && !theirs.has(s));
  return { mine: mine.size, theirs: theirs.size, both, neither, whole: HALVES.includes(part) && new Set(ids).size === ids.length && !both.length && !neither.length && mine.size > 0 && theirs.size > 0 };
};
CUR = 'the table';
const H = halvesOf(SECTIONS, PART);
ok(`r2332 THE TWO HALVES: this run is the ${PART} half (${H.mine} sections), its twin ${TWIN[PART] || '?'} the other (${H.theirs}) — disjoint, their union the whole table of ${SECTIONS.length}`, H.whole, H);
const flip = (p) => (p === 'main' ? 'pool' : 'main');
ok('r2332 CONTROLS: a section named in both halves, one in neither, a part that is no half — each is red',
  !halvesOf([...SECTIONS, [SECTIONS[0][0], flip(SECTIONS[0][1])]], PART).whole && !halvesOf([...SECTIONS, ['③x', 'neither']], PART).whole && !halvesOf(SECTIONS, 'both').whole, null);
CUR = null;
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const HOME = path.join(TMP, 'home', 'me');
const mk = (rel, files = 0) => { const d = path.join(HOME, rel); fs.mkdirSync(d, { recursive: true }); for (let i = 0; i < files; i++) fs.writeFileSync(path.join(d, `f${i}.txt`), 'x'); return d; };
for (const [d, f] of [['work/investor-relations/Q3-董事会材料', 5], ['work/investor-relations/会议纪要', 3], ['work/investor-relations/草稿', 2], ['work/investor-relations/共享资料', 4], ['work/compute-deal/条款版本', 2], ['work/contracts', 23], ['work/payments/发票', 2], ['work/weekly-admin', 3], ['work/草稿', 2], ['code/ir-dashboard/src', 1], ['Downloads', 3], ['.config/vibespace', 1]]) mk(d, f);
fs.mkdirSync(path.join(HOME, 'code/ir-dashboard/.git')); fs.writeFileSync(path.join(HOME, 'code/ir-dashboard/notes.txt'), '#'); fs.writeFileSync(path.join(HOME, 'code/ir-dashboard/package.json'), '{"name":"ir-dashboard"}');
fs.symlinkSync(path.join(HOME, 'work/contracts'), path.join(HOME, '合同'));
/* the instance's own checkout in the home (a fresh pod): the folder with the MOST files, package.json names vibespace */
mk('vibespace/src', 60); fs.writeFileSync(path.join(HOME, 'vibespace/package.json'), JSON.stringify({ name: 'vibespace', version: '2.369.345' }));
process.env.HOME = HOME;

const PC = require('../src/path-candidates.js');
// r1636 (the machine collects, the hub shapes): the collector's laws live in src/dir-collect.js — a patched collector rides the REAL
// hub answer through src/server/dir-slice.js create's `DCm`; a patch goes to the file its anchor is in
const withDC = (D, DCm) => ({ ...D, create: (o = {}) => D.create({ ...o, DCm }) });
const { runOp } = require('../src/safe-fs-worker.js');
const express = require('express');
const app = express();
app.use(express.json());
// B-3b03 (lane hub-loop-stalls): the files router never runs an op in-main — a REAL one-worker pool, as server.js wires one
const FILE_POOL = new (require('../src/safe-fs.js').SafeFs)({ poolSize: 1, name: 'test-dir-complete' });
app.locals.safeFs = FILE_POOL;
const files = require('../src/routes/files.js');
const fsr0 = read('src/routes/files.js');
app.use(files);
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const get = async (p) => (await fetch(base + p)).json();
const ask = (text, { bases = ['~'], probe = [], q = '', kind = 'folder', host = '' } = {}) => get(`/api/dir-complete?path=${encodeURIComponent(text)}&bases=${encodeURIComponent(JSON.stringify(bases))}&probe=${encodeURIComponent(JSON.stringify(probe))}&q=${encodeURIComponent(q)}&kind=${kind}${host ? '&host=' + host : ''}`);
const mem = { home: '', machine: null, dirs: {}, links: {}, localized: {}, mounts: [] };
const G = [
  { id: 'g-ir', name: '投资者关系', color: '#2dd4bf', folders: ['~/work/investor-relations'], context: '~/work/investor-relations/共享资料' },
  { id: 'g-cd', name: '算力合同谈判', color: '#f59e0b', folders: ['~/work/compute-deal'], context: null },
];

console.log('── ① GET /api/dir-complete over a real tree: bases, q, probe, links, self ──');
await section('①', async () => {
  const a = await ask('Q3-董事会材料', { bases: ['~/work/investor-relations', '~'] });
  ok('the answer carries the slice + self + took', a.listing && a.listing.home === HOME && a.self && Array.isArray(a.self.roots) && Number.isFinite(a.took), Object.keys(a));
  ok('each base is LISTED (~/work/investor-relations kids include Q3-董事会材料)', (a.listing.dirs['~/work/investor-relations'] || {}).kids?.includes('Q3-董事会材料'), a.listing.dirs['~/work/investor-relations']);
  PC.mergeListing(mem, a.listing);
  const r = PC.resolveRelative('Q3-董事会材料', [{ path: '~/work/investor-relations', label: 'IR' }, { path: '~', label: 'home' }], mem);
  ok('…so the field resolves the relative text against the first base', r.resolved[0] && r.resolved[0].path === '~/work/investor-relations/Q3-董事会材料' && r.resolved[0].base === 'IR', r);
  const b = await ask('草稿', { bases: ['~/work/investor-relations', '~/work', '~'] });
  PC.mergeListing(mem, b.listing);
  const two = PC.resolveRelative('草稿', [{ path: '~/work/investor-relations', label: 'IR' }, { path: '~/work', label: 'work' }, { path: '~', label: 'home' }], mem);
  ok('草稿 = two resolutions from a real disk, each with its base', two.resolved.map((x) => x.path).join('|') === '~/work/investor-relations/草稿|~/work/草稿', two.resolved);
  const f = await ask('ir q3', { q: 'ir q3', bases: ['~'] });
  ok('q = the folder index searched: the hit is in the answer', !!f.listing.dirs['~/work/investor-relations/Q3-董事会材料'] && f.partial === false, Object.keys(f.listing.dirs).slice(0, 12));
  PC.mergeListing(mem, f.listing);
  const inp = (o = {}) => ({ bases: [{ path: '~', label: 'home' }], groups: G.map((g) => ({ ...g, selected: false })), recent: [], listing: mem, name: '', self: f.self, ...o });
  const top = (q) => { const m = PC.rankCandidates(q, inp()); return m.best && m.best.path; };
  ok('the PURE rank over the answer: ir q3 → ~/work/investor-relations/Q3-董事会材料 (the POC\'s winner, from a real disk)', top('ir q3') === '~/work/investor-relations/Q3-董事会材料', top('ir q3'));
  const c = await ask('合同', { q: '合同' });
  PC.mergeListing(mem, c.listing);
  ok('a link to a folder is a LINK (~/合同 → ~/work/contracts), not a second row', mem.links['~/合同'] === '~/work/contracts' && !mem.dirs['~/合同'], [mem.links, !!mem.dirs['~/合同']]);
  const ht = PC.rankCandidates('合同', inp());
  ok('合同 → ~/work/contracts through the link alias', ht.best && ht.best.path === '~/work/contracts' && ht.best.alias && ht.best.alias.from.key === 'link', ht.best);
  let g = await ask('', { probe: ['~/code/ir-dashboard', '~/nope', '~/code/ir-dashboard/notes.txt'] });
  for (let i = 0; i < 20 && g.factsLate; i++) { await sleep(25); g = await ask('', { probe: ['~/code/ir-dashboard', '~/nope', '~/code/ir-dashboard/notes.txt'] }); }   // B-5561: a home folder's package.json is its own call's (behind the answer): asked again while factsLate, as the page asks
  const ird = g.listing.dirs['~/code/ir-dashboard'] || {};
  ok('probe = each folder\'s facts: exists + git + fileCount + mtime; a missing one is absent; a file is a nondir', ird.git === true && ird.fileCount === 2 && ird.mtime > 0 && !g.listing.dirs['~/nope'] && g.listing.nondirs['~/code/ir-dashboard/notes.txt'] === true, [ird, g.listing.nondirs]);
  ok('self = the checkout the server runs from + its data dir + ~/vibespace (package.json names vibespace)', g.self.roots.includes(REPO) && g.self.roots.includes(path.join(REPO, 'data')) && g.self.roots.includes(path.join(HOME, 'vibespace')), g.self.roots);
  const legacy = await get(`/api/dir-complete?path=${encodeURIComponent(HOME + '/wo')}`);
  ok('a caller sending none of the new params gets the old shape (suggestions only)', JSON.stringify(Object.keys(legacy)) === '["suggestions"]' && legacy.suggestions.includes(path.join(HOME, 'work')), legacy);
  const both = await ask(HOME + '/wo');
  ok('…and the new answer still carries suggestions (the same folders)', both.suggestions.includes(path.join(HOME, 'work')), both.suggestions);
  const fl = await ask('~/work/investor-relations/共享资料/', { kind: 'file' });
  ok('kind=file lists the files (name, size, mtime)', (fl.listing.dirs['~/work/investor-relations/共享资料'] || {}).files?.length === 4, fl.listing.dirs['~/work/investor-relations/共享资料']);
});

lap('\n── ② never offered unasked: the product\'s own checkout (ADDENDUM) ──');
await section('②', async () => {
  const a = await ask('~/', {});
  PC.mergeListing(mem, a.listing);
  const inp = { bases: [{ path: '~', label: 'home' }], groups: [], recent: [], listing: mem, name: '', self: a.self };
  const list = PC.rankCandidates('~/', inp).rows.map((r) => r.path);
  ok('~/ lists the home without ~/vibespace and ~/.config', !list.includes('~/vibespace') && !list.includes('~/.config') && list.includes('~/work'), list);
  const v = await ask('vibe', { q: 'vibe' }); PC.mergeListing(mem, v.listing);
  const fz = PC.rankCandidates('vibe', inp).rows.map((r) => r.path);
  ok('fuzzy `vibe` offers neither the checkout nor ~/.config/vibespace', !fz.some((p) => p === '~/vibespace' || p.startsWith('~/vibespace/') || p.startsWith('~/.config')), fz);
  ok('typed explicitly (~/vibespace) it resolves', PC.resolveRelative('~/vibespace', [], mem).resolved[0]?.path === '~/vibespace', null);
  const hf = await get('/api/home-folders');
  const census = (await runOp('folderCensus', { path: HOME })).result.folders;
  const dayOne = require('../src/day-one.js');
  ok('RED CONTROL: the census holds ~/vibespace, the folder with the most files (firstFilesFolder would pick it)', census.some((x) => x.name === 'vibespace') && dayOne.firstFilesFolder(dayOne.folderChips({ folders: census })) === path.join(HOME, 'vibespace'), census.map((x) => [x.name, x.files]));
  ok('GET /api/home-folders drops it — day one\'s chips start in work/', !hf.folders.some((x) => x.name === 'vibespace') && dayOne.firstFilesFolder(dayOne.folderChips({ folders: hf.folders })) === path.join(HOME, 'work'), hf.folders.map((x) => [x.name, x.files]));
  // r1748 (a): THE ROUTE ON A COLD HUB — a fresh router and a fresh dir-slice (no home fact landed yet): its FIRST answer already drops
  // ~/vibespace (the exclusion waited for inside a bound; an answer built while a fact was out is never kept). RED: the tip's route
  // (self() as it stands — the facts behind it): the cold first answer offers the checkout
  {
    const MCh = mutantCopies('dir-complete-homefolders', REPO), fsrNow = read('src/routes/files.js');
    const coldOn = async (src, name) => {
      const R = require(MCh.write('src/routes/files.js', src, name, src === fsrNow ? { same: true } : undefined));   // (the real route, a fresh module: a deliberate unpatched copy)
      const app2 = express(); app2.use(express.json()); app2.locals.safeFs = FILE_POOL; app2.use(R);
      const srv = http.createServer(app2); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
      try { const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/home-folders`); return ((await r.json()).folders || []).map((x) => x.name); } finally { srv.close(); }
    };
    const cold = await coldOn(fsrNow, 'hf-cold');
    const tipR = await coldOn(anchored(fsrNow, '    const sw = await dirSliceOf(req).selfWhole(1500, hac.signal).catch(() => null);\n    const self = sw && sw.v;', '    const self = await dirSliceOf(req).self().catch(() => null), sw = { v: self, whole: true };', "the tip's route: self() as it stands"), 'hf-cold-tip');
    ok(`r1748 (a): GET /api/home-folders on a COLD hub — its first answer already drops ~/vibespace (${cold.join(' ')})`, !cold.includes('vibespace') && cold.includes('work'), cold);
    ok(`RED CONTROL (the tip's route: self() without the wait): the cold first answer OFFERS ~/vibespace (${tipR.join(' ')})`, tipR.includes('vibespace'), tipR);
  }
});

lap('\n── ③ the 500 ms budget (a stalled walk) ──');
await section('③', async () => {
  const DS = require('../src/server/dir-slice.js');
  /* the stall is a CONTROL measured in the run (no wall-clock literal): the walk's own end is stamped, the answer must come first */
  let stall = true, walkDone = null; let walked = null;
  const ds = DS.create({ home: HOME, repoDir: REPO, call: async (op, p) => { if (op === 'dirIndex' && stall) { await sleep(1500); const r = (await runOp(op, p)).result; walkDone = Date.now(); return r; } return (await runOp(op, p)).result; } });
  const a = await ds.slice({ text: 'ir q3', q: 'ir q3', bases: ['~'], budgetMs: 450 });
  const answeredAt = Date.now();
  ok('a walk stalled ⇒ the answer comes BEFORE the stalled walk ends, marked partial (the budget, not the walk, decided)', a.partial === true && walkDone === null, { partial: a.partial, walkDone, answeredAt });
  walked = await new Promise((r) => { const t = setInterval(() => { if (walkDone) { clearInterval(t); r(walkDone); } }, 50); });
  stall = false;
  const b = await ds.slice({ text: 'ir q3', q: 'ir q3', bases: ['~'], budgetMs: 450 });
  ok('…the walk landed in the cache: the next keystroke has the hit, complete', walked > answeredAt && b.partial === false && !!b.listing.dirs['~/work/investor-relations/Q3-董事会材料'], { partial: b.partial, walked, answeredAt });
  const real = await ask('ir q3', { q: 'ir q3' });
  ok(`the real route answers inside its own 450 ms budget (not partial; took ${real.took} ms)`, real.partial === false && Number.isFinite(real.took), real);
});

lap('\n── ③b the hung source and the slow one (B-0f3d, kept) · ③c THE FOURTH SHAPE (B-d833) ──');
{
  const DS = require('../src/server/dir-slice.js');
  const hold = () => { let open = null; const p = new Promise((r) => { open = r; }); return { p, open: (v) => open(v) }; };
  // THE STAND-IN POOL counts a touch by what a call REACHES (the read of the fourth shape, 2026-11-20 11:34Z): the real worker op runs
  // with every fs call it makes recorded (each op is synchronous), and a call whose fs calls reach a dead path — a stat / readdir /
  // realpath / read at or under it — waits until the leg opens it (then answers, or fails as the pool's deadline does). A `blocked` path is
  // refused at the door by the call's OWN path, as SafeFs's blocked check does; a call that reaches one anyway counts in `blockedReached`.
  // Every call's path is recorded; `touched` / `touchedAt[path]` count the calls that met a dead path; `out` / `maxOut` the calls in
  // flight. `run` = the worker's runOp (a mutant worker's for a control).
  const FS_REACH = ['statSync', 'lstatSync', 'readdirSync', 'realpathSync', 'readFileSync', 'existsSync', 'accessSync', 'opendirSync'];
  const reachOf = (run, op, p) => { const seen = [], orig = {}; for (const f of FS_REACH) { orig[f] = fs[f]; fs[f] = function (q, ...a) { seen.push(String(q)); return orig[f].call(this, q, ...a); }; } let res = null, err = null; try { res = run(op, p); } catch (e) { err = e; } finally { for (const f of FS_REACH) fs[f] = orig[f]; } return { seen, res, err }; };
  const underP = (q, d) => q === d || q.startsWith(d + '/');
  const standIn = (o = {}) => { const rec = [], run = o.run || runOp; const fn = async (op, p) => {
    const at = String(p.path || ''); rec.push(op + ':' + at);
    fn.out++; fn.maxOut = Math.max(fn.maxOut, fn.out);
    try {
      if (o.errOnce && op === 'pathStat' && p.facts && o.errOnce.has(at)) { const m = o.errOnce.get(at); o.errOnce.delete(at); return { stat: { path: at, exists: false, err: m } }; }   // a facts call that errs once (r2178 (1))
      if ((o.blocked || []).some((b) => underP(at, b))) throw Object.assign(new Error('The owner blocked this storage.'), { status: 503, code: 'mount_blocked' });
      const first = reachOf(run, op, p);
      if ((o.blocked || []).some((b) => first.seen.some((q) => underP(q, b)))) fn.blockedReached++;
      const d = (o.dead || []).find((x) => (!x.op || x.op === op) && first.seen.some((q) => underP(q, x.path)));   // `op`: that op alone hangs there (a listing's own read)
      if (d) { fn.touched++; fn.touchedAt[d.path] = (fn.touchedAt[d.path] || 0) + 1; fn.touchLog.push({ op, at, dead: d.path }); const v = await d.g.p; if (v instanceof Error) throw v; return run(op, p).result; }
      if (o.slow) { const ms = o.slow(op, p); if (ms) await sleep(ms); }
      if (first.err) throw first.err;
      return first.res.result;
    } finally { fn.out--; }
  }; fn.rec = rec; fn.touched = 0; fn.touchedAt = {}; fn.touchLog = []; fn.blockedReached = 0; fn.out = 0; fn.maxOut = 0; return fn; };
  const mkDS = (D, call, now) => D.create({ home: HOME, repoDir: REPO, call, ...(now ? { now } : {}) });
  const DSsrc = read('src/server/dir-slice.js'), DCsrc = read('src/dir-collect.js'), M = mutantCopies('dir-complete-d833s4', REPO);
  const mutant = (name, pairs) => {
    const inDC = pairs.filter(([a]) => DCsrc.includes(a)), inDS = pairs.filter(([a]) => !DCsrc.includes(a));
    const D = inDS.length ? M.load('src/server/dir-slice.js', inDS.reduce((src, [a, b, what]) => anchored(src, a, b, what), DSsrc), name) : DS;
    return inDC.length ? withDC(D, M.load('src/dir-collect.js', inDC.reduce((src, [a, b, what]) => anchored(src, a, b, what), DCsrc), name + '-dc')) : D;
  };
  const into = (rec, dir) => rec.filter((x) => { const q = x.slice(x.indexOf(':') + 1); return q === dir || q.startsWith(dir + '/'); });
  const deadlineOf = () => Object.assign(new Error('Storage not responding (operation timed out).'), { status: 503, safeFsTimeout: true });
  const IR = path.join(HOME, 'work', 'investor-relations'), WORK = path.join(HOME, 'work');
  const STALE = path.join(TMP, 'stale-share'); fs.mkdirSync(path.join(STALE, 'a', 'b'), { recursive: true });

  // B-d833's REMAINDER (2.369.414 shipped SafeFs `idleOnly`; the field now rides it): A HEALTHY FOLDER'S CHECK NEVER WAITS BEHIND A HUNG,
  // SLOWER CALL — the REAL pool (one worker, short deadlines) held by a placed stall (the worker's `__sleep`, the stand-in for a hung
  // listing: no mount of any kind); the field asks a healthy folder (~/work) while the worker is held, then again once the stall ended.
  // RED CONTROL: the field's calls as on the release (no idleOnly) — the check waits in the held worker, runs out its own deadline and
  // the folder is MARKED dead for 30 s (asked again: skipped)
  await section('③c B-d833', async () => {
    lap('  · the folder is MARKED dead for 30 s (asked again: skippe');   // (r2178 (5): where the seconds go)
    process.env.VIBESPACE_SAFEFS_TEST = '1';   // the worker's `__sleep` op (a placed stall), inherited by the worker this pool spawns
    const SF = require('../src/safe-fs.js').SafeFs;
    const idleRun = async (D, name) => {
      const P = new SF({ poolSize: 1, name, timeouts: { __sleep: 700, pathStat: 300, dirSlice: 300, dirIndex: 300 } });
      try {
        await P.call('pathStat', { path: HOME }).catch(() => null);   // the one worker up
        const d = D.create({ home: HOME, repoDir: REPO, call: (op, pl, o) => P.call(op, pl, o) });
        const stall = P.call('__sleep', { ms: 5000 }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String((e && (e.code || e.message)) || e)));
        await sleep(40);
        const a = await d.slice({ text: '~/work', bases: [], budgetMs: 200 });
        const st = await stall;
        for (let i = 0; i < 50 && !(P.stats().alive > 0); i++) await sleep(100);   // the worker back after the stall's end (bounded)
        await sleep(150);
        const b = await d.slice({ text: '~/work', bases: [], budgetMs: 1500 });
        return { stall: st, a: a.verdict && a.verdict.kind, b: b.verdict && b.verdict.kind, bUnread: !!b.rowsUnread, bSources: b.sourcesUnread || [], alive: P.stats().alive };
      } finally { try { P.close(); } catch { } }
    };
    // (the leg and its control run side by side: two pools of their own)
    lap('    · cure, rel');
    const [cure, rel] = await Promise.all([idleRun(DS, 'dir-complete-idle'), idleRun(mutant('d833-idle-out', [["const IDLE_ONLY = Object.freeze({ idleOnly: true });", 'const IDLE_ONLY = undefined;', 'the field\'s calls as on the release (no idleOnly)']]), 'dir-complete-idle-out')]);
    ok('B-d833 remainder: a healthy folder asked while the one worker is held by a hung, slower call is answered LATE at its reply\'s bound (refused by the pool and asked again while no worker freed — never sent into the held worker) — and asked once the stall ended, it EXISTS (never marked dead)', cure.a === 'late' && cure.b === 'exists' && !cure.bUnread, cure);
    // (the release's pool, B-23e5: the call whose deadline ends the held worker is the one MARKED; its siblings queued in that worker are
    // ended «storage worker restarted», unmarked — so the mark lands on whichever of the field's calls the slice sent first: the line's
    // ~/work, or the home's listing for its rows. Either is a HEALTHY folder marked dead behind a hung call: the fault)
    ok(`RED CONTROL: the field's calls as on the release — the healthy folder's check waited in the held worker (${rel.a}), ran out its own deadline, and asked again a healthy folder of the field is answered from its own mark (dead for 30 s): ~/work ${rel.b}, the home's rows ${rel.bUnread ? 'COULD NOT BE READ' : 'read'}`, rel.a === 'late' && (rel.b === 'skipped' || (rel.bUnread && rel.bSources.includes(HOME))), rel);
  });
  // M1, FOLDED INTO B-d833's REMAINDER (lane bl-chat-c's fresh read; the coordinator's r1507): A BUSY POOL IS NOT A DEAD FOLDER. The REAL
  // pool (one worker) kept busy by SHORT calls (the worker's `__sleep`, 60 ms each with a 60 ms gap — a Files window's ordinary work):
  // the field's healthy folder is ASKED AGAIN until the worker frees and answered inside its bound (exists); a person's PRESS the same
  // (law iii); a field whose page aborted stops asking (law i: no re-ask after its signal); every re-ask counted (law ii, stats()).
  // RED CONTROL: idleOnly alone (3b79c841b — a refusal answered LATE at once)
  await section('③c M1', async () => {
    lap('  · RED CONTROL: idleOnly alone (3b79c841b — a refusal answ');   // (r2178 (5): where the seconds go)
    const SF = require('../src/safe-fs.js').SafeFs;
    const busyRun = async (D, name) => {
      const P = new SF({ poolSize: 1, name, timeouts: { __sleep: 2000, pathStat: 300, dirSlice: 300, dirIndex: 300 } });
      let holding = true;
      try {
        await P.call('pathStat', { path: HOME }).catch(() => null);   // the one worker up
        const holder = (async () => { while (holding) { await P.call('__sleep', { ms: 60 }).catch(() => null); await sleep(60); } })();
        const d = D.create({ home: HOME, repoDir: REPO, call: (op, pl, o) => P.call(op, pl, o) });
        await sleep(20);
        const typed = await d.slice({ text: '~/work', bases: [], budgetMs: 450 });
        const pressed = await d.slice({ text: '~/work/investor-relations', bases: [], budgetMs: 450, press: true });
        const busyCount = d.stats().noIdle;
        holding = false; await holder;
        // the field ENDS: the worker held by one long call, the page aborts while its field is asking again
        const hold = P.call('__sleep', { ms: 600 }).catch(() => null);
        await sleep(20);
        const ac = new AbortController();
        const pAb = d.slice({ text: '~/code', bases: [], budgetMs: 2000, signal: ac.signal });
        await sleep(100);
        const before = d.stats().noIdle.reasked;
        ac.abort();
        await sleep(30); const r1 = d.stats().noIdle.reasked;
        await sleep(200); const r2 = d.stats().noIdle.reasked;
        const ab = await pAb; await hold;
        return { typed: typed.verdict && typed.verdict.kind, pressed: pressed.verdict && pressed.verdict.kind, busy: busyCount, abort: { before, r1, r2, kind: ab.verdict && ab.verdict.kind, late: d.stats().noIdle.late } };
      } finally { holding = false; try { P.close(); } catch { } }
    };
    lap('    · m1, m1c');
    const [m1, m1c] = await Promise.all([busyRun(DS, 'dir-complete-busy'), busyRun(mutant('d833-m1-at-once', [["if (!(mono() + REASK_MS <= askOpen(ask))) {", 'if (true) {', 'a refusal answered LATE at once (idleOnly alone)']]), 'dir-complete-busy-at-once')]);
    ok(`B-d833 M1: a pool kept busy by short calls — the field's healthy folder is asked again until the worker frees and EXISTS inside its bound (typed: ${m1.typed}); a person's PRESS the same (${m1.pressed}); counted: ${JSON.stringify(m1.busy)}`,
      m1.typed === 'exists' && m1.pressed === 'exists' && m1.busy.reasked > 0 && m1.busy.freed > 0, m1);
    ok(`B-d833 M1: the waiting ends WITH ITS FIELD — the page aborted: no re-ask after its signal (${m1.abort.before} before, ${m1.abort.r1} → ${m1.abort.r2} after), the reply late (${m1.abort.kind}), counted late`,
      m1.abort.before > 0 && m1.abort.r2 === m1.abort.r1 && m1.abort.kind === 'late' && m1.abort.late > 0, m1.abort);
    ok(`RED CONTROL: idleOnly alone (3b79c841b) — a busy pool answers a healthy folder LATE (typed: ${m1c.typed}, pressed: ${m1c.pressed})`, m1c.typed === 'late' || m1c.pressed === 'late', m1c);
    // r1748 MUST — A JOINED CALL BELONGS TO EVERY ASKER: the person types ~/work while the pool is busy; Enter's press JOINS the typed
    // ask's calls and the page aborts the typed ask; a worker frees inside the PRESS's own bound — the press EXISTS. RED: the tip's
    // once (every joiner rode the first asker's bound and signal): the press answered LATE
    const joinRun = async (D, name) => {
      const P = new SF({ poolSize: 1, name, timeouts: { __sleep: 2000, pathStat: 300, dirSlice: 300, dirIndex: 300 } });
      try {
        await P.call('pathStat', { path: HOME }).catch(() => null);   // the one worker up
        const d = D.create({ home: HOME, repoDir: REPO, call: (op, pl, o) => P.call(op, pl, o) });
        const held = P.call('__sleep', { ms: 450 }).catch(() => null);   // ordinary work holds the one worker ~450 ms
        await sleep(20);
        const acA = new AbortController();
        const pA = d.slice({ text: '~/work', bases: [], budgetMs: 150, signal: acA.signal });   // the typed ask: its bound ends before the worker frees
        await sleep(60);
        const pB = d.slice({ text: '~/work', bases: [], budgetMs: 1500, press: true });         // Enter: the press joins the typed ask's calls
        await sleep(15); acA.abort();                                                            // …and the page aborts the typed ask
        const [a, b] = await Promise.all([pA, pB]); await held;
        return { a: a.verdict && a.verdict.kind, b: b.verdict && b.verdict.kind, noIdle: d.stats().noIdle };
      } finally { try { P.close(); } catch { } }
    };
    lap('    · jr, jc');
    const [jr, jc] = await Promise.all([joinRun(DS, 'dir-complete-join'), joinRun(mutant('d833-join-first', [['  const joinAsk = (g, boundAt, signal) => { if (!g) return; g.asks = g.asks.filter(asking); const a = { boundAt, signal }; if (asking(a)) g.asks.push(a); };', '  const joinAsk = () => {};', 'a joiner rides the first asker'], ['if (s1.ask) s1.ask.asks.push(...ask.asks); return s1.p; }', 'return s1.p; }', '…at the grant too']]), 'dir-complete-join-first')]);
    ok(`r1748: a press JOINED behind a typed ask the page aborted — a worker frees inside the press's own bound: the press EXISTS (${jr.b}; the typed ask, its own bound past: ${jr.a})`, jr.b === 'exists' && jr.a === 'late', jr);
    ok(`RED CONTROL (the tip's once: every joiner rides the first asker's bound and signal): the press answered ${jc.b}`, jc.b === 'late', jc);
  });

  // ③b (B-0f3d, kept): a hung PROBE (a Task Group's folder on a dead mount) never holds the typed text — judged by its own stat
  await section('③b hung probe', async () => {
    lap('  · ③b (B-0f3d, kept): a hung PROBE (a Task Groups folder');   // (r2178 (5): where the seconds go)
    const g = hold(), c1 = standIn({ dead: [{ path: IR, g }] }), ds = mkDS(DS, c1);
    const a = await ds.slice({ text: '~/work/payments', bases: ['~'], probe: ['~/work/investor-relations'], budgetMs: 150 });
    ok('③b a hung probe: the typed text is still judged («exists» by its own stat), only the probe named late — the field marks it nothing', a.partial === false && a.verdict.kind === 'exists' && JSON.stringify(a.probesLate) === JSON.stringify(['~/work/investor-relations']), { partial: a.partial, verdict: a.verdict, probesLate: a.probesLate });
    c1.rec.length = 0;
    const b = await ds.slice({ text: '~/code/ir', bases: ['~'], probe: ['~/work/investor-relations', '~/work/investor-relations/测试'], budgetMs: 150 });
    ok('③b …the next ask sends NO call into the hung folder: its probe still out is JOINED, a name row under it waits for its chain (the folder itself)', into(c1.rec, IR).length === 0 && ['~/work/investor-relations', '~/work/investor-relations/测试'].every((x) => (b.probesLate || []).includes(x)), { rec: into(c1.rec, IR), probesLate: b.probesLate });
    g.open();
  });
  await section('③b slow probe', async () => {
    lap('  · ③b (B-0f3d, kept): a hung PROBE (a Task Groups folder');   // (r2178 (5): where the seconds go)
    const SL = { text: '~/work/payments', bases: ['~'], probe: ['~/work/investor-relations'], budgetMs: 450 };
    const factsOf = (r) => { const e = r.listing.dirs['~/work/investor-relations']; return !!(e && e.fileCount != null) && !(r.probesLate || []).includes('~/work/investor-relations'); };
    // SLOW STORAGE, NOT HUNG (the coordinator's law for 2.369.413, kept by shape 4's row probes): a Task Group's folder whose probe takes
    // 600 ms EVERY time (the budget is 450 ms). Only a HUNG probe is skipped; a late one is JOINED while it is out and its fact USED when it
    // lands — by the next ask whatever the gap, up to the mark's window (30 s); a kept fact older than 2 s is answered with and refreshed by
    // ONE call behind it. Asked at 0, 0.5 s (the late call still out), 1 s, 3 s and 5 s (the slice's clock runs WITH real time — a call's own
    // duration is measured — and jumps at each step)
    const PFMs = require('../src/path-field-model.js');
    const scene = async (D2, slowMs, budgetMs, steps) => {
      let off = 0, sends = 0; const t0 = Date.now(), out = {};
      const d = mkDS(D2, standIn({ slow: (op, p) => { if (op === 'dirSlice' && (p.probes || []).includes(IR)) { sends++; return slowMs; } return 0; } }), () => Date.now() + off);
      for (const [name, at, realWait] of steps) {
        if (realWait) await sleep(Math.max(0, realWait - (Date.now() - t0)));
        off = (t0 + at) - Date.now();
        const before = sends; const r = await d.slice({ ...SL, budgetMs }); await sleep(40);   // (a refresh sent BEHIND the reply is counted once it is out)
        out[name] = { facts: factsOf(r), late: (r.probesLate || []).includes('~/work/investor-relations'), asked: PFMs.askedOf(['~/work/investor-relations'], r).length, sends: sends - before };
      }
      return out;
    };
    const STEPS = [['at0', 0, 0], ['at05', 500, 500], ['at1', 1000, 1000], ['at3', 3000, 1000], ['at5', 5000, 1700]];
    // RED CONTROLS (a 300 ms probe, a 150 ms budget, steps at 0 / 0.17 / 0.4 / 2.5 s): each rule removed from a copy of the shipped dir-slice.js —
    // the four scenes run AT ONCE (each its own slice, clock and stand-in)
    const CSTEPS = [['at0', 0, 0], ['at05', 170, 170], ['at1', 400, 400], ['at3', 2500, 450]];
    const NOJOIN = mutant('s4-nojoin', [['    if (s0 && s0.hungAt == null && t - s0.at < PROBE_LATE_MS) { joinAsk(s0.ask, boundAt, signal); return s0.p; }\n', '', 'a call still out sent again']]);
    const NOLAND = mutant('s4-noland', [['    const t = now(), l = landed.get(a);\n    if (!l ||', '    const t = now(), l = null;\n    if (!l ||', 'the kept facts never used']]);
    const EXPIRE = mutant('s4-expire', [['    if (!l || t - l.at >= PROBE_LATE_MS || !(t - l.at < LANDED_FRESH_MS || l.late)) return null;', '    if (!l || t - l.at >= LANDED_FRESH_MS) return null;', 'kept facts dropped after 2 s']]);
    lap('    · g, cj, cl, ce');
    const [g, cj, cl, ce] = await Promise.all([scene(DS, 600, 450, STEPS), scene(NOJOIN, 300, 150, CSTEPS), scene(NOLAND, 300, 150, CSTEPS), scene(EXPIRE, 300, 150, CSTEPS)]);
    ok('③b SLOW storage (600 ms a probe, 450 ms budget), the first reply: the folder named late, no facts claimed, the field marks it nothing (no 新建, no «checked»)', g.at0.late && !g.at0.facts && g.at0.asked === 0, g);
    ok('③b …0.5 s later, while the late call is still out: NOT skipped — that call is JOINED inside this budget (no second call) and its facts are in the reply', g.at05.facts && g.at05.sends === 0, g);
    ok('③b …at 1 s: its facts in the reply — the late call\'s own result USED when it landed', g.at1.facts, g);
    ok('③b …at 3 s (a gap past 2 s — a person reading the form): its facts in the reply STILL (kept for the window), and ONE fresh call sent behind them', g.at3.facts && g.at3.sends === 1, g);
    ok('③b …at 5 s: its facts in the reply (the call sent at 3 s landed; never the late branch)', g.at5.facts, g);
    ok('③b RED CONTROLS (a shorter clock): without the JOIN the ask while the call is out has nothing; without the KEPT facts the ask after it landed has nothing; with the facts dropped after 2 s the ask 2.5 s later has nothing', !cj.at05.facts && !cl.at1.facts && !ce.at3.facts, { nojoin: cj.at05, noland: cl.at1, expire: ce.at3 });
    // a call is MARKED the moment it is SENT: two asks inside its first budget send ONE call for the same slow path — CONTROL: never joined
    // (two calls); a probe the ANSWER leaves out is late, never «answered» — CONTROL: read as answered
    const twoAsks = async (D2) => { let sends = 0; const d = mkDS(D2, standIn({ slow: (op, p) => { if (op === 'dirSlice' && (p.probes || []).includes(IR)) { sends++; return 300; } return 0; } })); const q = { text: '~/work/payments', bases: ['~'], probe: ['~/work/investor-relations'], budgetMs: 150 }; await Promise.all([d.slice(q), sleep(40).then(() => d.slice(q))]); await sleep(700); return sends; };   // (counted once every call SENT has landed: a second call waits for the rows' one slot)
    lap('    · one, two');
    const [one, two] = await Promise.all([twoAsks(DS), twoAsks(NOJOIN)]);
    ok(`③b two asks inside the first budget: ${one} call for the slow path (the second joins the call SENT) — CONTROL never joined: ${two}`, one === 1 && two === 2, { one, two });
    const leaves = async (D2) => mkDS(D2, async (op, p) => { const r = (await runOp(op, p)).result; if (op === 'dirSlice' && (p.probes || []).includes(IR)) r.probes = r.probes.filter((f) => f.path !== IR); return r; }).slice({ text: '~/work/payments', bases: ['~'], probe: ['~/work/investor-relations'], budgetMs: 450 });
    const lo = await leaves(DS), loC = await leaves(mutant('s4-answered', [[" || (r && 'ok' in r && !r.ok)) state.set(a, 'late');", ") state.set(a, 'late');", 'a probe left out read as answered']]));
    ok('③b a probe the ANSWER leaves out is named late (the field marks it nothing — no 新建 for a folder nobody stated) — CONTROL: read as answered', (lo.probesLate || []).includes('~/work/investor-relations') && !(loC.probesLate || []).includes('~/work/investor-relations'), { real: lo.probesLate, control: loC.probesLate });
    // A FAST PATH IS NEVER SERVED STALE: a probe that answers inside its budget is asked afresh past 2 s — a folder made in a terminal between
    // two asks is seen; only a path whose last call went LATE is served its kept fact. CONTROL: every kept fact served for the whole window
    const fresh = async (D2) => { const tag = Math.random().toString(36).slice(2, 7), NEWP = path.join(HOME, 'work', 'made-later-' + tag), EXP = path.join(TMP, 'counted-' + tag); fs.mkdirSync(EXP); fs.writeFileSync(path.join(EXP, 'a.txt'), 'x'); let clock = Date.now(); const d = mkDS(D2, async (op, p) => (await runOp(op, p)).result, () => clock); const q = { text: '~/work/payments', bases: ['~'], probe: [PC.toTilde(HOME, NEWP), EXP], budgetMs: 450 }; await d.slice(q); fs.mkdirSync(NEWP); fs.writeFileSync(path.join(EXP, 'b.txt'), 'x'); clock += 2500; const r = await d.slice(q); const e = r.listing.dirs[PC.toTilde(HOME, NEWP)], x = r.listing.dirs[EXP]; return { made: !!(e && e.fileCount != null), count: x ? x.fileCount : null }; };
    lap('    · fr, frC, frK');
    const [fr, frC, frK] = await Promise.all([fresh(DS), fresh(mutant('s4-stale', [['    if (!l || t - l.at >= PROBE_LATE_MS || !(t - l.at < LANDED_FRESH_MS || l.late)) return null;', '    if (!l || t - l.at >= PROBE_LATE_MS) return null;', 'every kept fact served']])), fresh(mutant('s4-knownstale', [['    if (k && t - k.at < LIST_FRESH_MS) return Promise.resolve({ ok: k.stat });', '    if (k) return Promise.resolve({ ok: k.stat });', 'a stat served whatever its age']]))]);
    ok('③b a FAST path is never served stale: 2.5 s apart, a folder made between the asks is seen, and a probed folder that gained a file says so (asked afresh) — CONTROLS: every kept fact served (the old count), a stat served whatever its age (still «not there»)', fr.made && fr.count === 2 && frC.count === 1 && !frK.made, { real: fr, kept: frC, known: frK });
  });

  // ③c R-a: the line asks STATS ONLY — a new folder beside a DEAD KID is ABSENT (create offered), in ms; a prefix completes by NAMES; an
  // exact hit is literal. RED CONTROL: the line waiting for its parent's LISTING (it stats the dead kid) — late
  await section('③c R-a', async () => {
    lap('  · exact hit is literal. RED CONTROL: the line waiting for');   // (r2178 (5): where the seconds go)
    const SH = path.join(WORK, 'share'); fs.mkdirSync(SH, { recursive: true });
    const run = async (D2) => { const g = hold(), d = mkDS(D2, standIn({ dead: [{ path: SH, g }] })); const r = { nw: await d.slice({ text: '~/work/q3-new', bases: ['~'], budgetMs: 150 }), pre: await d.slice({ text: '~/work/pay', bases: ['~'], budgetMs: 150 }), ex: await d.slice({ text: '~/work/payments', bases: ['~'], budgetMs: 150 }) }; g.open(); return r; };
    const a = await run(DS);
    ok('③c a new folder beside a DEAD KID (~/work/share): «absent», not partial — the create is offered; «~/work/pay» completes to ~/work/payments by the names (the one match stated under its own key — not literal); «~/work/payments» exists, literal', a.nw.verdict.kind === 'absent' && !a.nw.partial && a.pre.verdict.kind === 'exists' && a.pre.verdict.path === '~/work/payments' && a.pre.verdict.completed && !a.pre.verdict.literal && a.ex.verdict.kind === 'exists' && a.ex.verdict.literal === true, { nw: a.nw.verdict, pre: a.pre.verdict, ex: a.ex.verdict });
    const LISTED = mutant('s4-listed', [['    const ans = PT.lineAnswerOf(st, { files: o.files });', "    if (!st.exists) { const lr = await raceOf(listOne(path.dirname(a), { files: o.files, ...o }), o.untilSoft); if (lr === LATE || !lr || !lr.ok) return { path: c, answer: 'late', at: a }; }\n    const ans = PT.lineAnswerOf(st, { files: o.files });", 'the line waits for its parent\'s listing']]);
    // (B-5561: a listing reads names and types only, so the dead kid no longer holds it — the scene the control needs is a parent's
    // listing that HANGS by itself: the stand-in holds ~/work's listing alone; the line's stats there are not held)
    const runHung = async (D2) => { const g = hold(), gL = hold(), d = mkDS(D2, standIn({ dead: [{ path: SH, g }, { path: WORK, g: gL, op: 'dirSlice' }] })); const r = await d.slice({ text: '~/work/q3-new', bases: ['~'], budgetMs: 150 }); g.open(); gL.open(); return r; };
    lap('    · hr, hb');
    const [hr, hb] = await Promise.all([runHung(DS), runHung(LISTED)]);
    ok('③c …and while the parent\'s own LISTING hangs, the new folder is still «absent» from the line\'s stats alone (the create offered)', hr.verdict.kind === 'absent', hr.verdict);
    ok('③c RED CONTROL: the line waiting for its parent\'s LISTING — the new folder is LATE while that listing hangs (no folder there could ever be made)', hb.verdict.kind === 'late', hb.verdict);
  });
  // ③c R-c: EVERY CALL GOES DOWN ITS CHAIN, ONE KEY PER PATH — one dead folder meets ONE call whoever asks (the fresh read's M2): the
  // folder ITSELF typed (the line's own call), then texts under it (each level joined), a probe of it and one under it (row sources state
  // their folder first, the same key), and the rows' listing of the folder above (it names the dead kid, never states it). CONTROLS: without
  // the descent; the line's own call under a key of its own again; the release's LISTING (a .git stat per kid — it had to be given the
  // dead folder as a skip; since B-5561 a listing states no kid, so there is no skip left to take out)
  await section('③c R-c', async () => {
    lap('  · dead folder as a skip; since B-5561 a listing states no');   // (r2178 (5): where the seconds go)
    const OLDL = mutantCopies('dir-complete-s4-oldlist', REPO).load('src/dir-ops.js', anchored(read('src/dir-ops.js'), '        if (e.isDirectory()) { kids.push({ name: e.name }); continue; }', '        if (e.isDirectory()) { kids.push({ name: e.name, git: gitOf(path.join(d, e.name)) }); continue; }', 'the release listing: a .git stat per kid'), 'w-s4-oldlist');
    const run = async (D2, wrun) => { const g = hold(), c = standIn({ dead: [{ path: STALE, g }], ...(wrun ? { run: wrun } : {}) }), d = mkDS(D2, c); for (const [t, pr] of [['', []], ['a/b/q3', [STALE]], ['a/b', [path.join(STALE, 'a')]], ['a', []], ['c/z', []]]) await d.slice({ text: t ? path.join(STALE, t) : STALE, bases: [], probe: pr, budgetMs: 50 }); const n = c.touched; g.open(); return n; };
    lap('    · real, nod, keys, noskip');
    const [real, nod, keys, noskip] = await Promise.all([run(DS), run(mutant('s4-nodescent', [["      const d = await descend(a, 'line', o, false);", '      const d = null;', 'no descent']])), run(mutant('s4-linekey', [["      const own = () => once('stat:' + a, 'line', a,", "      const own = () => once('line:' + a, 'line', a,", 'the line\'s own call under its own key']])), run(DS, OLDL.runOp)]);
    ok(`③c one dead folder — typed itself, texts under it, a probe of it and under it, the listing above it: ${real} call met it — CONTROLS: no descent ${nod} (capped by the line's two slots) · the line's own key ${keys} · the release's listing (a .git stat per kid) ${noskip}`, real === 1 && nod >= 2 && keys >= 2 && noskip >= 2, { real, nod, keys, noskip });
  });
  // ③c THE ONE MATCH IS STATED UNDER ITS OWN NAME (the read of the fourth shape, 2026-11-20 11:34Z — its must): a dead mount is the only
  // entry of its folder starting with «n»; the person types «n», «na», «nas» one after another (each its own text). The worker answers
  // NAMES only; the hub states the one match through the level door, so: ONE call meets the dead folder, the line's two slots are never
  // both held, a healthy existing folder typed next is confirmed in its budget and a new one beside it is offered for creation; after the
  // deadline the MARK is on the dead folder (its whole name, then a longer prefix: no call). A BLOCKED mount's one match is never stated.
  // CONTROL (the in-worker stat of the one match, by name): the prefixes reach the dead folder each, both slots held, the blocked one stated
  await section('③c one match', async () => {
    lap('  · CONTROL (the in-worker stat of the one match, by name):');   // (r2178 (5): where the seconds go)
    const NP = path.join(TMP, 'np-parent'), NM = path.join(NP, 'nas-mount'); fs.mkdirSync(NM, { recursive: true }); fs.mkdirSync(path.join(NP, 'work-ok'), { recursive: true });
    const Wsrc = read('src/dir-ops.js'), WIN = mutantCopies('dir-complete-s4-inworker', REPO).load('src/dir-ops.js', anchored(Wsrc, '      stat.names = hits.slice(0, 20);\n', '      stat.names = hits.slice(0, 20);\n      if (hits.length === 1) stat.one = bare(path.join(dir, hits[0]));\n', 'the in-worker stat of the one match'), 'w-inworker');
    const typing = async (run) => {
      const g = hold(), c = standIn({ dead: [{ path: NM, g }], run }), d = mkDS(DS, c);
      for (const t of ['n', 'na', 'nas']) await d.slice({ text: path.join(NP, t), bases: [], budgetMs: 50 });
      const both = d._counters.line.busy, met = c.touchLog.filter((x) => x.dead === NM && x.op === 'pathStat').length, rows = c.touchLog.filter((x) => x.dead === NM && x.op !== 'pathStat').map((x) => x.op + ':' + x.at);
      const ok1 = (await d.slice({ text: path.join(NP, 'work-ok'), bases: [], budgetMs: 450 })).verdict, nw = (await d.slice({ text: path.join(NP, 'new-one'), bases: [], budgetMs: 450 })).verdict;
      g.open(deadlineOf()); await sleep(20);
      const before = c.touchedAt[NM] || 0;
      const whole = (await d.slice({ text: NM, bases: [], budgetMs: 150 })).verdict, longer = (await d.slice({ text: path.join(NP, 'nas-m'), bases: [], budgetMs: 150 })).verdict;
      return { met, rows, busy: both, ok: ok1 && ok1.kind, okLit: !!(ok1 && ok1.literal), nw: nw && nw.kind, nwParent: !!(nw && nw.missing && nw.missing.parentExists), after: (c.touchedAt[NM] || 0) - before, whole: whole && whole.kind, longer: longer && longer.kind };
    };
    // (the hub knows its mounts: a listing names a mount, never states it)
    const blockedRun = async (run) => { const c = standIn({ blocked: [NM], run }), d = DS.create({ home: HOME, repoDir: REPO, call: c, mounts: () => [{ path: NM, mounted: true, blocked: true, label: 'nas' }] }); const v = (await d.slice({ text: path.join(NP, 'n'), bases: [], budgetMs: 450 })).verdict; return { reached: c.blockedReached, kind: v && v.kind }; };
    lap('    · real, ctl, bl, blC');
    const [real, ctl, bl, blC] = await Promise.all([typing(runOp), typing(WIN.runOp), blockedRun(runOp), blockedRun(WIN.runOp)]);
    ok(`③c «n», «na», «nas» typed toward a dead mount: ${real.met} LINE call met it (the rows' listing of the folder holding it: ${real.rows.join(' ') || 'none'} — none since B-5561: a listing states no kid), ${real.busy} line slot held; «work-ok» next: ${real.ok} (literal), «new-one»: ${real.nw} (its folder there — Create offered); after the deadline the whole name and a longer prefix: ${real.after} call («${real.whole}», «${real.longer}»)`, real.met === 1 && real.rows.every((x) => x === 'dirSlice:' + NP) && real.busy <= 1 && real.ok === 'exists' && real.okLit && real.nw === 'absent' && real.nwParent && real.after === 0 && real.whole === 'skipped' && real.longer === 'skipped', real);
    ok(`③c a BLOCKED mount the only match of «n»: never stated (${bl.reached} call reached it; the pool refused the hub's own call by its path) — CONTROLS the in-worker stat of the one match: ${ctl.met} calls met the dead mount with ${ctl.busy} line slots held, the blocked one reached ${blC.reached}×`, bl.reached === 0 && ctl.met >= 2 && ctl.busy === 2 && blC.reached >= 1, { real: bl, control: ctl, blockedControl: blC });
  });
  // ③c (the read's should 2) A PRESS KEEPS THE MARK until its own call is SENT: with both line slots held the press's call waits, and a
  // listing of the dead folder's parent built meanwhile (another text's rows) still skips it. CONTROL: the mark deleted at the press (that
  // listing states inside the dead folder)
  await section('③c press mark', async () => {
    lap('  · listing states inside the dead folder)');   // (r2178 (5): where the seconds go)
    // (X1 and X2 under their own folder: the first ask's listing of STALE's parent must not meet them — it would hold the rows' one slot)
    const X1 = path.join(TMP, 'xs', 'x1-dead'), X2 = path.join(TMP, 'xs', 'x2-dead'); fs.mkdirSync(X1, { recursive: true }); fs.mkdirSync(X2, { recursive: true });
    const gap = async (D2) => {
      const gS = hold(), g1 = hold(), g2 = hold(), c = standIn({ dead: [{ path: STALE, g: gS }, { path: X1, g: g1 }, { path: X2, g: g2 }] }), d = mkDS(D2, c);
      // (the parent listed FIRST, while nothing holds the rows' one slot — since B-5561 the doors that reach a kid (its own facts call,
      // the one-match descent) open only on an ANSWERED listing, and that answer is kept 2 s: the gap below reads it from memory)
      await d.slice({ text: path.join(TMP, 'zz-first'), bases: [], budgetMs: 150 });
      await d.slice({ text: path.join(STALE, 'x'), bases: [], budgetMs: 50 }); gS.open(deadlineOf()); await sleep(20);
      await d.slice({ text: path.join(X1, 'q'), bases: [], budgetMs: 50 }); await d.slice({ text: path.join(X2, 'q'), bases: [], budgetMs: 50 });
      // the press (under the dead folder) goes through its mark and its call WAITS for a line slot; then ANOTHER text beside the dead
      // folder, its prefix («stale-sh»), lists their parent in that gap — and the doors that reach the kid since B-5561 (a listing reads no
      // kid: the kid's OWN facts call, the one-match descent's listing of it) must still obey the dead folder's mark
      await d.slice({ text: path.join(STALE, 'b'), bases: [], budgetMs: 80, press: true });
      const n0 = c.touchedAt[STALE] || 0, k0 = c.rec.length;
      const gr = await d.slice({ text: path.join(TMP, 'stale-sh'), bases: [], budgetMs: 150 });
      await sleep(20);   // (a kid's facts call goes out behind the answer)
      const n1 = c.touchedAt[STALE] || 0, held = d._counters.line.busy;
      const gapSeen = { listed: Object.keys((gr.listing && gr.listing.dirs) || {}).filter((k) => k.includes('stale') || k.endsWith('lanes') || k === PC.toTilde(HOME, TMP)), rowsLate: !!gr.rowsLate, factsLate: !!gr.factsLate, calls: c.rec.slice(k0).filter((x) => x.includes('stale')) };
      g1.open(); g2.open(); return { during: n1 - n0, held, gap: gapSeen };
    };
    lap('    · gr, gc');
    const [gr, gc] = await Promise.all([gap(DS), gap(mutant('s4-pressdelete', [['pressed.set(m.path, t); return { through: m }; }', 'pressed.set(m.path, t); if (sent.get(m.key) === m) sent.delete(m.key); return null; }', 'the mark deleted at the press']]))]);
    ok(`③c a press waiting for a line slot keeps the dead folder's mark: a text beside it meanwhile (its kid facts, the one-match descent) met it ${gr.during}× — CONTROL the mark deleted at the press: ${gc.during}×`, gr.during === 0 && gc.during >= 1, { real: gr, control: gc });
  });
  // ③c (the read of round wc9f6okda) THE WALK'S SKIP IS STABLE: a healthy base whose stat is still out (slow, 300 ms) is WALKED, and a
  // search asked twice inside the index's kept time makes ONE walk. CONTROL: calls still in flight in the walk's skip (the cache's name
  // differs at each ask — a second walk — and the first walk never entered the healthy base: no row for the folder under it)
  await section('③c walk', async () => {
    lap('  · differs at each ask — a second walk — and the first wal');   // (r2178 (5): where the seconds go)
    const SB = path.join(HOME, 'work', 'slowbase-r138'); fs.mkdirSync(path.join(SB, 'deep', 'needle-q7r'), { recursive: true });   // (two levels down: the base's own listing names only «deep» — only the WALK finds the needle)
    const walkTwice = async (D2) => {
      const c = standIn({ slow: (op, p) => (op === 'pathStat' && p.path === SB ? 300 : 0) }), d = mkDS(D2, c), q = { text: 'needle q7r', q: 'needle q7r', bases: [SB, '~'], probe: [SB], budgetMs: 1500 };
      await d.slice({ text: SB, bases: [], budgetMs: 50 });   // (the base typed first: its own stat goes OUT and stays out 300 ms — SENT when the search's walk takes its skip)
      const r1 = await d.slice(q), r2 = await d.slice(q);
      return { walks: c.rec.filter((x) => x.startsWith('dirIndex:')).length, row1: !!r1.listing.dirs['~/work/slowbase-r138/deep/needle-q7r'], row2: !!r2.listing.dirs['~/work/slowbase-r138/deep/needle-q7r'] };
    };
    lap('    · wr, wc');
    const [wr, wc] = await Promise.all([walkTwice(DS), walkTwice(mutant('s4-walkinflight', [['      skip = [...new Set([...me.roots, ...mountPaths, ...marked, ...walkSkip])];', '      skip = [...new Set([...me.roots, ...mountPaths, ...[...sent.values()].filter((m) => m.entrance).map((m) => m.path), ...walkSkip])];', 'calls still in flight in the walk\'s skip']]))]);
    ok(`③c the walk's skip holds only what is stable: a search asked twice makes ${wr.walks} walk, and the folder under a healthy base whose stat was out is in the rows (${wr.row1}, ${wr.row2}) — CONTROL calls in flight in the walk's skip: ${wc.walks} walks, the first rows ${wc.row1 ? 'had' : 'MISSED'} it`, wr.walks === 1 && wr.row1 && wr.row2 && wc.walks === 2 && !wc.row1, { real: wr, control: wc });
  });
  // ③c (the fresh read's M3) A ROW CALL THE DEADLINE ENDED is not sent again inside its window: a folder's listing hangs ONCE (since
  // B-5561 a listing reads no kid — the stand-in holds the listing's own read of its folder; the line's stats there answer), then the
  // rows say that folder could not be read for 30 s (no call). CONTROL: its own mark ignored — sent again
  await section('③c M3', async () => {
    lap('  · rows say that folder could not be read for 30 s (no cal');   // (r2178 (5): where the seconds go)
    const DK = path.join(TMP, 'dk-parent'), NAS = path.join(DK, 'nas'); fs.mkdirSync(NAS, { recursive: true });
    const run = async (D2) => { const g = hold(), c = standIn({ dead: [{ path: DK, g, op: 'dirSlice' }] }), d = mkDS(D2, c); await d.slice({ text: path.join(DK, 'x'), bases: [], budgetMs: 50 }); g.open(deadlineOf()); await sleep(10); const r2 = await d.slice({ text: path.join(DK, 'y'), bases: [], budgetMs: 150 }); return { lists: c.rec.filter((x) => x === 'dirSlice:' + DK).length, unread: !!r2.rowsUnread && (r2.sourcesUnread || []).includes(DK), verdict: r2.verdict && r2.verdict.kind }; };
    lap('    · real, ctl');
    const [real, ctl] = await Promise.all([run(DS), run(mutant('s4-nomark', [['    if (s0 && s0 !== through && s0.hungAt != null && t - s0.hungAt < PROBE_LATE_MS) return Promise.resolve({ skipped: markEnd(s0), at: p });   // its OWN deadline mark: never sent again inside the window\n', '', 'a row call\'s own mark ignored'], ['      if (s1 && s1 !== through && s1.hungAt != null && t1 - s1.hungAt < PROBE_LATE_MS) { free(); return { skipped: markEnd(s1), at: p }; }\n', '', '…at its grant too']]))]);
    ok(`③c a listing the deadline ended: ${real.lists} listing call in two asks, the rows say that folder COULD NOT BE READ (rowsUnread — never «no folders», never «still looking» for 30 s), the line still judges — CONTROL its own mark ignored: ${ctl.lists}`, real.lists === 1 && real.unread && real.verdict === 'absent' && ctl.lists === 2, { real, ctl });
  });
  // ③c R-b + R-d: four dead bases, a relative text — ONE line call into them (the first base; nothing after a late one is asked); then a
  // healthy absolute text is judged on the line's OWN slots while the rows' slot is held. CONTROLS: every candidate at once; one counter
  await section('③c R-b R-d', async () => {
    lap('  · healthy absolute text is judged on the lines OWN slots');   // (r2178 (5): where the seconds go)
    const B4 = ['b1', 'b2', 'b3', 'b4'].map((n) => { const d = path.join(TMP, 'dead-' + n); fs.mkdirSync(d, { recursive: true }); return d; });
    const run = async (D2) => { const g = hold(), c = standIn({ dead: B4.map((b) => ({ path: b, g })) }), d = mkDS(D2, c); const r1 = await d.slice({ text: './q3', bases: [...B4, '~'], budgetMs: 50 }); const busy = d._counters.line.busy; const r2 = await d.slice({ text: '~/work/payments', bases: [...B4, '~'], budgetMs: 450 }); g.open(); return { r1, r2, busy, line: c.rec.filter((x) => B4.some((b) => x === 'pathStat:' + b || x.startsWith('pathStat:' + b + '/'))).length }; };
    // (the CONCURRENT mutant: every candidate's chain at once — a sequential one that only skips the stop never asks past the budget,
    // its next chain loses the race at its first level before any call)
    lap('    · real, ALL, ONE');
    const [real, ALL, ONE] = await Promise.all([run(DS), run(mutant('s4-allatonce', [['      const out = [];\n      for (const x of cands) {\n', '      if (cands.length) return Promise.all(cands.map((x) => lineAnswer(x.c, x.a, o)));\n      const out = [];\n      for (const x of cands) {\n', 'every candidate asked at once']])), run(mutant('s4-onecounter', [['  const C = { line: { cap: LINE_SLOTS, busy: 0, q: [] }, rows: { cap: ROW_SLOTS, busy: 0, q: [] }, facts: { cap: FACT_SLOTS, busy: 0, q: [] } };', '  const C0 = { cap: LINE_SLOTS, busy: 0, q: [] }; const C = { line: C0, rows: C0, facts: { cap: FACT_SLOTS, busy: 0, q: [] } };', 'one shared counter (the line\'s and the rows\')']]))]);   // (each its own slice and stand-in: at once)
    ok(`③c four dead bases + «./q3»: late on the FIRST base (named), ${real.busy} line slot held — at most the one candidate (0 when the rows' stat of that base went first and the line JOINED it); then «~/work/payments» judged in time on the line's own slots`, real.r1.verdict.kind === 'late' && real.r1.verdict.base === B4[0] && real.busy <= 1 && real.r2.verdict.kind === 'exists' && real.r2.partial === false, { r1: real.r1.verdict, line: real.line, r2: [real.r2.verdict, real.r2.partial] });
    ok(`③c RED CONTROLS: every candidate asked at once (${ALL.busy} line slots held) · ONE shared counter (the healthy text: ${ONE.r2.verdict && ONE.r2.verdict.kind})`, ALL.busy === 2 && ONE.r2.verdict.kind !== 'exists', { all: ALL.busy, one: ONE.r2.verdict });
  });
  // ③c R-i: a dead entrance ENDED by the pool's deadline — every source there answers «skipped» with the time its mark ends (no call); a
  // person's PRESS sends the entrance's one call once inside the window. CONTROL: without the press-through
  await section('③c R-i', async () => {
    lap('  · persons PRESS sends the entrances one call once insid');   // (r2178 (5): where the seconds go)
    const run = async (D2) => {
      let deadNow = true; const g = hold(), c = standIn({ dead: [{ path: STALE, g }] }), d = mkDS(D2, async (op, p, co) => (deadNow ? c(op, p, co) : (c.rec.push(op + ':' + p.path), (await runOp(op, p)).result)));
      await d.slice({ text: path.join(STALE, 'a'), bases: [], budgetMs: 50 });
      g.open(deadlineOf()); await sleep(10);
      const n0 = c.rec.length;
      const sk = await d.slice({ text: path.join(STALE, 'a'), bases: [], budgetMs: 150 });
      const callsSkipped = c.rec.length - n0;
      deadNow = false;   // the mount is back
      const pr = await d.slice({ text: path.join(STALE, 'a'), bases: [], budgetMs: 450, press: true });
      return { sk: sk.verdict, callsSkipped, pr: pr.verdict };
    };
    lap('    · real, ctl');
    const [real, ctl] = await Promise.all([run(DS), run(mutant('s4-nopress', [["    if (press && m.path === p && !(pa != null && t - pa < PROBE_LATE_MS)) {", '    if (false) {', 'no press-through']]))]);
    ok('③c a dead entrance ended by the pool\'s deadline: the next ask answers «skipped» with when it is asked again (no call); a PRESS goes through once — the mount is back: judged', real.sk.kind === 'skipped' && real.sk.retryIn > 0 && real.callsSkipped === 0 && real.pr.kind === 'exists', real);
    ok('③c RED CONTROL: without the press-through a press is answered from the mark alone — still «skipped»', ctl.pr.kind === 'skipped', ctl.pr);
    // ONCE PER WINDOW (the fresh read's S1): the pressed call meets the dead folder again and the deadline ends it — a second press inside
    // the window is answered from the mark (no call). CONTROL: the press remembered nowhere (every press goes through)
    const twice = async (D2) => { const g = hold(), c = standIn({ dead: [{ path: STALE, g }] }), d = mkDS(D2, c); const q = { text: path.join(STALE, 'b'), bases: [], budgetMs: 50 }; await d.slice(q); g.open(deadlineOf()); await sleep(10); await d.slice({ ...q, press: true }); await sleep(10); const n1 = c.touched; const p2 = await d.slice({ ...q, press: true }); return { second: c.touched - n1, kind: p2.verdict && p2.verdict.kind }; };
    lap('    · t1, t2');
    const [t1, t2] = await Promise.all([twice(DS), twice(mutant('s4-everypress', [['    const pa = pressed.get(m.path);\n', '    const pa = null;\n', 'the press remembered nowhere']]))]);
    ok(`③c a press goes through ONCE per window: the second press after the pressed call hung again sends ${t1.second} call («${t1.kind}») — CONTROL remembered nowhere: ${t2.second}`, t1.second === 0 && t1.kind === 'skipped' && t2.second === 1, { real: t1, control: t2 });
  });
  // ③c R-d, THE COUNTERS UNDER ANY ORDER (the table's seeded law): random asks — dead folders typed and under them, healthy texts, dead
  // bases, probes into both — while the dead paths are released at random (as answers, or as the pool's deadline). After every ask no more
  // calls are out than LINE_SLOTS + ROW_SLOTS; when everything has landed both counters are 0 and nothing waits. CONTROL: a stall release
  // (a slot freed while its call is still out) — more calls out than the slots
  await section('③c R-d seeded', async () => {
    lap('  · (a slot freed while its call is still out) — more calls');   // (r2178 (5): where the seconds go)
    const DD = ['d1', 'd2', 'd3'].map((n) => { const d = path.join(TMP, 'seed-' + n); fs.mkdirSync(path.join(d, 'k'), { recursive: true }); return d; });
    const TEXTS = [...DD, ...DD.map((d) => path.join(d, 'k', 'q')), '~/work/payments', '~/work/q3-new', './q3'];
    const law = async (D2, seed) => {
      let x = seed * 2654435761 >>> 0; const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
      const gs = DD.map(() => hold()), c = standIn({ dead: DD.map((d, i) => ({ path: d, g: gs[i] })) }), d = mkDS(D2, c);
      const opened = new Set(); let worst = 0;
      for (let k = 0; k < 6; k++) {
        const t = TEXTS[Math.floor(rnd() * TEXTS.length)], pr = rnd() < 0.5 ? [DD[Math.floor(rnd() * DD.length)]] : [];
        await d.slice({ text: t, bases: t === './q3' ? [...DD, '~'] : ['~'], probe: pr, budgetMs: 30 + Math.floor(rnd() * 40) });
        worst = Math.max(worst, c.maxOut);
        const i = Math.floor(rnd() * DD.length); if (rnd() < 0.4 && !opened.has(i)) { opened.add(i); gs[i].open(rnd() < 0.5 ? deadlineOf() : undefined); }
      }
      DD.forEach((_, i) => { if (!opened.has(i)) gs[i].open(deadlineOf()); });
      for (let w = 0; w < 50 && (c.out || d._counters.line.busy || d._counters.rows.busy); w++) await sleep(10);
      return { worst: Math.max(worst, c.maxOut), settled: c.out === 0 && d._counters.line.busy === 0 && d._counters.rows.busy === 0 && !d._counters.line.q.length && !d._counters.rows.q.length };
    };
    const STALL = mutant('s4-stall', [['  const grant = (c) => new Promise((res) => { c.q.push(() => { c.busy++; let held = true; res(() => { if (!held) return; held = false; c.busy--; pump(c); }); }); pump(c); });', '  const grant = (c) => new Promise((res) => { c.q.push(() => { c.busy++; let held = true; setTimeout(() => { if (held) { held = false; c.busy--; pump(c); } }, 15); res(() => { if (!held) return; held = false; c.busy--; pump(c); }); }); pump(c); });', 'a stall release']]);
    const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
    lap('    · real, ctl');
    const [real, ctl] = await Promise.all([Promise.all(SEEDS.map((sd) => law(DS, sd))), Promise.all(SEEDS.map((sd) => law(STALL, sd)))]);
    const worst = Math.max(...real.map((r) => r.worst)), worstC = Math.max(...ctl.map((r) => r.worst));
    ok(`③c R-d over ${SEEDS.length} seeded orders: at most ${worst} calls out (LINE_SLOTS + ROW_SLOTS = ${DS.LINE_SLOTS + DS.ROW_SLOTS}); every counter back to 0, nothing queued, once all landed — CONTROL a stall release: ${worstC} out`, worst <= DS.LINE_SLOTS + DS.ROW_SLOTS && real.every((r) => r.settled) && worstC > DS.LINE_SLOTS + DS.ROW_SLOTS, { worst, unsettled: real.filter((r) => !r.settled).length, worstC });
  });
  // ③c an absolute text UNDER THE HOME is judged in the ~ form (the fresh read's S4): the verdict's paths match the listing's keys — a file
  // typed absolutely reads «is a file», never «create it?». And EVERY base is a candidate (N5): with 44 bases and the home last, a folder only
  // the home holds still EXISTS. CONTROLS: the candidates absolute; the candidates cut at 40
  await section('③c S4 N5', async () => {
    lap('  · the home holds still EXISTS. CONTROLS: the candidates a');   // (r2178 (5): where the seconds go)
    // (主开发 r304: the fixture's file is notes.txt, never README.md — a bare root file name on a path.join line is that ROOT file to the
    // push gate's deriver, test-ci-gate-push: the root readme became a gate input)
    const ex = async (D2) => { const d = mkDS(D2, standIn()); const a = await d.slice({ text: path.join(HOME, 'work', 'payments'), bases: ['~'], budgetMs: 450 }); const f = await d.slice({ text: path.join(HOME, 'code', 'ir-dashboard', 'notes.txt'), bases: ['~'], budgetMs: 450 }); return { path: a.verdict && a.verdict.path, missing: f.verdict && f.verdict.missing && f.verdict.missing.path, file: !!f.listing.nondirs['~/code/ir-dashboard/notes.txt'] }; };
    lap('    · tl, tlC');
    const [tl, tlC] = await Promise.all([ex(DS), ex(mutant('s4-abs', [['return { c: PC.toTilde(home, a), a };', 'return { c, a };', 'the candidates absolute']]))]);
    ok('③c an absolute text under the home: «exists» as ~/work/payments; a file typed absolutely is where the listing names it a file (~/code/ir-dashboard/notes.txt) — CONTROL the candidates absolute: the keys never meet', tl.path === '~/work/payments' && tl.missing === '~/code/ir-dashboard/notes.txt' && tl.file && tlC.path !== '~/work/payments' && tlC.missing !== '~/code/ir-dashboard/notes.txt', { real: tl, control: tlC });
    const MANY = Array.from({ length: 44 }, (_, i) => { const d = path.join(TMP, 'many', 'b' + i); fs.mkdirSync(d, { recursive: true }); return d; });
    const many = async (D2) => (await mkDS(D2, standIn()).slice({ text: 'work', bases: [...MANY, '~'], budgetMs: 2000 })).verdict;
    lap('    · mv, mvC');
    const [mv, mvC] = await Promise.all([many(DS), many(mutant('s4-cut40', [['  const cands = PC.textCandidates(text, tAll).map(', '  const cands = PC.textCandidates(text, tAll.slice(0, 40)).map(', 'the candidates cut at 40']]))]);
    ok('③c 44 bases and the home last: «work» EXISTS (every base a candidate, asked one at a time) — CONTROL cut at 40: «absent» with the home never asked', mv && mv.kind === 'exists' && mv.path === '~/work' && mvC && mvC.kind === 'absent', { real: mv, control: mvC });
  });
  // ③c FAILED is the machine's own answer about the path (a loop of links: ELOOP), never «absent» — CONTROL: the worker reading every
  // failed stat as absent. A row source that did not answer marks the reply rowsLate (the list says «still looking», never «no match»)
  await section('③c FAILED', async () => {
    lap('  · failed stat as absent. A row source that did not answer');   // (r2178 (5): where the seconds go)
    const LOOP = path.join(TMP, 'loop-a'); try { fs.symlinkSync(LOOP, LOOP); } catch { }
    const r5 = await mkDS(DS, standIn()).slice({ text: LOOP, bases: [], budgetMs: 450 });
    const W0 = mutantCopies('dir-complete-s4-worker', REPO).load('src/dir-ops.js', anchored(read('src/dir-ops.js'), "function goneOf(e) { return e && (e.code === 'ENOENT' || e.code === 'ENOTDIR') ? {} : { err: String((e && (e.message || e.code)) || e).slice(0, 200) }; }", 'function goneOf() { return {}; }', 'every failed stat read as absent'), 'w0');
    const r5c = await mkDS(DS, async (op, p) => (await W0.runOp(op, p)).result).slice({ text: LOOP, bases: [], budgetMs: 450 });
    ok('③c a stat that FAILED (ELOOP): the verdict «failed» with the machine\'s words — CONTROL: read as absent (the field would offer to create it)', r5.verdict.kind === 'failed' && /ELOOP/.test(r5.verdict.err) && r5c.verdict.kind === 'absent', { r5: r5.verdict, r5c: r5c.verdict });
    // …and a PROBE's (the coordinator's find, 2026-11-20): only «no such file» is «not there» — the worker's listing and probe stats say any
    // other error as such, and the reply names the probe FAILED (probesFailed: the field marks it nothing, never «absent»)
    const NOPE = path.join(TMP, 'no-such-folder');
    const w = (await runOp('dirSlice', { dirs: [{ path: LOOP }], probes: [LOOP, NOPE] })).result, wc = (await W0.runOp('dirSlice', { dirs: [{ path: LOOP }], probes: [LOOP, NOPE] })).result;
    const r6 = await mkDS(DS, standIn()).slice({ text: '', probe: [LOOP, NOPE], budgetMs: 450 });
    const r6c = await mkDS(DS, async (op, p) => (await W0.runOp(op, p)).result).slice({ text: '', probe: [LOOP, NOPE], budgetMs: 450 });
    ok('③c a PROBE whose stat FAILED (ELOOP): the worker says the error (listing and probe), «no such folder» stays plain absent; the reply names it in probesFailed, not late, not absent — CONTROL: the worker reading every failed stat as absent (no error, no name: the field would take it as not there)', /ELOOP/.test(w.probes[0].err || '') && !w.probes[1].err && w.probes[1].exists === false && /ELOOP/.test(w.dirs[0].err || '') && JSON.stringify(r6.probesFailed) === JSON.stringify([LOOP]) && !(r6.probesLate || []).includes(LOOP) && !wc.probes[0].err && !(r6c.probesFailed || []).includes(LOOP), { w: w.probes, dirs: w.dirs, r6: [r6.probesFailed, r6.probesLate], wc: wc.probes, r6c: r6c.probesFailed });
    const g = hold(), rl = await mkDS(DS, standIn({ dead: [{ path: STALE, g }] })).slice({ text: 'invrel', q: 'invrel', bases: [STALE, '~'], budgetMs: 150 }); g.open();
    ok('③c a row source that did not answer (a dead base, its walk): the reply says rowsLate — the list says «still looking», never «no match»', rl.rowsLate === true, { rowsLate: rl.rowsLate, sourcesLate: rl.sourcesLate });
  });
  // ③e B-5561 — A LISTING NEVER TOUCHES ITS KIDS' INSIDES (the coordinator's ruling r1203): the worker lists names and types only; each
  // kid's facts (a folder's git and package.json name, a symlink's kind and target) come from the KID'S OWN call, in a slot of their own,
  // behind the answer. THE SCENE: a home holding a DEAD folder nobody typed and the hub does not know as a mount (~/nas — the stand-in's
  // dead path), a git folder, a folder whose package.json names vibespace, a link to a folder, a link to a file, a dangling link. The
  // home's listing answers AT ONCE with ~/nas named (no rowsLate, no rowsUnread), no fs call of the listing reaches under any kid, the
  // dead kid is met by ONE call (its own facts call, behind), and the answer says factsLate. THE NAMED COST (one slot of their own): the
  // dead kid's call holds the facts slot until the pool's deadline ends it; then its MARK stands (no call more) and the other kids'
  // facts land — asked again (the page's one quiet ask) the listing carries the badge, the link, the file, the excluded checkout, and
  // factsLate no longer waits on the dead kid. RED CONTROL: the release's listing (a .git stat and a package.json read per folder kid,
  // a mutant of the worker) — the home's rows LATE, then COULD NOT BE READ (the listing's own deadline mark)
  await section('③e B-5561', async () => {
    lap('  · a mutant of the worker) — the homes rows LATE, then CO');   // (r2178 (5): where the seconds go)
    const K5 = path.join(TMP, 'home-5561'), NAS = path.join(K5, 'nas');
    for (const d of ['nas/inside', 'proj/.git', 'vs', 'work']) fs.mkdirSync(path.join(K5, d), { recursive: true });
    fs.writeFileSync(path.join(K5, 'vs', 'package.json'), JSON.stringify({ name: 'vibespace' }));
    fs.writeFileSync(path.join(K5, 'notes.txt'), 'n\n');
    try { fs.symlinkSync(path.join(K5, 'proj'), path.join(K5, 'ln-proj')); fs.symlinkSync(path.join(K5, 'notes.txt'), path.join(K5, 'ln-notes')); fs.symlinkSync(path.join(K5, 'gone'), path.join(K5, 'dangling')); } catch { }
    const Wsrc5 = read('src/dir-ops.js');
    const OLDW = mutantCopies('dir-complete-5561-oldlist', REPO).load('src/dir-ops.js', anchored(Wsrc5, '        if (e.isDirectory()) { kids.push({ name: e.name }); continue; }',
      '        if (e.isDirectory()) { const q = path.join(d, e.name); kids.push({ name: e.name, git: gitOf(q), ...pkgOf(q) }); continue; }', 'the release listing: a .git stat and a package.json read per folder kid'), 'w-oldlist');
    const reach = reachOf(runOp, 'dirSlice', { dirs: [{ path: K5 }], files: true });
    const fileKids = new Set(['notes.txt'].map((n) => path.join(K5, n)));
    const under = reach.seen.filter((q) => q !== K5 && q !== path.join(K5, '.git') && !fileKids.has(q));
    const kids0 = ((reach.res && reach.res.result.dirs[0]) || {}).kids || [];
    ok(`③e the worker's listing reads names and types only — no fs call under a kid (${under.length}: ${under.slice(0, 4).join(' ')}); a link is named «link: ''»`, under.length === 0 && kids0.some((k) => k.name === 'nas' && k.link == null && k.git === undefined) && kids0.filter((k) => k.link === '').map((k) => k.name).sort().join(',') === 'dangling,ln-notes,ln-proj', { under, kids0 });
    const LKW = mutantCopies('dir-complete-5561-linkstat', REPO).load('src/dir-ops.js', anchored(Wsrc5, "        if (e.isSymbolicLink()) { kids.push({ name: e.name, link: '' }); continue; }", "        if (e.isSymbolicLink()) { try { fs.statSync(path.join(d, e.name)); } catch { } kids.push({ name: e.name, link: '' }); continue; }", 'a link kid stated by the listing'), 'w-linkstat');
    const reachL = reachOf(LKW.runOp, 'dirSlice', { dirs: [{ path: K5 }], files: true });
    const underL = reachL.seen.filter((q) => q !== K5 && q !== path.join(K5, '.git') && !fileKids.has(q));
    ok(`③e RED CONTROL (a listing that states its link kids): ${underL.length} fs call(s) under a kid — ${underL.slice(0, 3).join(' ')}`, underL.length > 0, underL.slice(0, 4));
    const scene = async (run, D2 = DS, { hung = true } = {}) => {   // `hung`: S3's read while the dead kid holds a slot (the release-listing control reads none of it)
      const g = hold(), c = standIn({ dead: [{ path: NAS, g }], run }), d = D2.create({ home: K5, repoDir: REPO, call: c });
      const q = () => d.slice({ text: '~/', bases: ['~'], budgetMs: 450 });
      const kidsOf = (r) => ((r.listing && r.listing.dirs['~']) || {}).kids || [];
      const a1 = await q(); await sleep(20);   // (its facts calls go out behind it)
      const listMet = c.touchLog.filter((x) => x.dead === NAS && x.op === 'dirSlice').length;
      // S3 (r1507): TWO facts slots — while the dead kid's call holds one, the other serves the rest (asked again: ~/proj's badge is
      // there). ~/proj is asked AFTER ~/nas in either asking order (self's home folders, the rows' kids: both by name)
      const gitOfProj = (r) => !!((r.listing && r.listing.dirs['~/proj']) || {}).git;
      let held = await q(); for (let i = 0; hung && i < 20 && !gitOfProj(held); i++) { await sleep(25); held = await q(); }   // (r2178 (5): the release control's listing hangs, each ask its whole 450 ms — 20 rounds were 9.5 s of the suite, read by nothing)
      const whileHung = { git: gitOfProj(held), link: (held.listing.links || {})['~/ln-proj'] || null, met: c.touchedAt[NAS] || 0 };
      const metBefore = c.touchedAt[NAS] || 0;
      g.open(deadlineOf()); await sleep(20);   // the pool's deadline ends the dead kid's call
      let a2 = await q(); for (let i = 0; i < 20 && (a2.factsLate || !(a2.listing.links || {})['~/ln-proj']); i++) { await sleep(25); a2 = await q(); }   // (the facts land behind it: bounded)
      const a3 = await q(), a4 = a3;   // (r1748: «nothing left that can land» read from the FRESH reply, never the poll's own exit)
      const pick = (r) => ({ kids: kidsOf(r), late: !!r.rowsLate, unread: !!r.rowsUnread, factsLate: !!r.factsLate, git: !!(r.listing.dirs['~/proj'] || {}).git, link: (r.listing.links || {})['~/ln-proj'] || null,
        dangling: kidsOf(r).includes('dangling') || !!(r.listing.links || {})['~/dangling'], files: ((r.listing.dirs['~'] || {}).fileCount), self: r.self && r.self.roots.includes(path.join(K5, 'vs')) });
      return { a1: pick(a1), a2: pick(a2), a3: pick(a3), a4: pick(a4), listMet, whileHung, metBefore, metAfter: (c.touchedAt[NAS] || 0) - metBefore, facts: d._counters.facts && d._counters.facts.cap };
    };
    lap('    · real, rel');
    const [real, rel] = await Promise.all([scene(runOp), scene(OLDW.runOp, DS, { hung: false })]);
    ok(`③e a dead ~/nas nobody typed, in the home: the home's listing answers AT ONCE with it named (late ${real.a1.late}, unread ${real.a1.unread}; the listing met it ${real.listMet}×), the dead kid met by ${real.metBefore} call (its own, behind), factsLate ${real.a1.factsLate}`,
      real.a1.kids.includes('nas') && real.a1.kids.includes('proj') && !real.a1.late && !real.a1.unread && real.listMet === 0 && real.metBefore === 1 && real.a1.factsLate === true && real.facts === 2, real);
    ok(`③e S3: TWO facts slots — while the dead kid's own call holds one (${real.whileHung.met} call), the other serves the rest before the pool's deadline: ~/proj's git badge (${real.whileHung.git}), ~/ln-proj a LINK (${real.whileHung.link})`, real.whileHung.met === 1 && real.whileHung.git && real.whileHung.link === '~/proj', real.whileHung);
    ok('③e …the dead kid\'s call ended by the pool\'s deadline, asked again: each kid\'s OWN facts are in the listing — ~/proj\'s git badge, ~/ln-proj a LINK to ~/proj (no second row), ~/ln-notes a file of the home (2 files), the dangling link no row, ~/vs (package.json: vibespace) excluded by self',
      real.a2.git && real.a2.link === '~/proj' && !real.a2.kids.includes('ln-proj') && real.a2.files === 2 && !real.a2.dangling && real.a2.self, real.a2);
    ok(`③e …and the dead kid's MARK stands: ${real.metAfter} call more, ~/nas still named, the rows whole, factsLate ${real.a4.factsLate} (nothing left that can land)`,
      real.metAfter === 0 && real.a3.kids.includes('nas') && !real.a3.late && !real.a3.unread && !real.a4.factsLate, { a3: real.a3, a4: real.a4, metAfter: real.metAfter });
    ok(`③e RED CONTROL (the release's listing — a .git stat and a package.json read per folder kid): the home's rows LATE (${rel.a1.late}) while ~/nas hangs, then COULD NOT BE READ (${rel.a3.unread}) for the listing's own mark`, rel.a1.late === true && rel.a1.kids.length === 0 && rel.a3.unread === true, { a1: rel.a1, a3: rel.a3 });
    const DCsrc5 = read('src/dir-collect.js'), M5 = mutantCopies('dir-complete-5561-s2s3', REPO), M5dc = (src, name) => withDC(DS, M5.load('src/dir-collect.js', src, name));
    const one = await scene(runOp, M5dc(anchored(DCsrc5, 'const FACT_SLOTS = 2;', 'const FACT_SLOTS = 1;', 'one facts slot (84e43bb55)'), 'ds-one-slot'));
    ok(`③e S3 RED CONTROL (one facts slot): the dead kid's call holds it — no badge on ~/proj before the pool's deadline (${one.whileHung.git})`, one.whileHung.git === false && one.whileHung.met === 1, one.whileHung);
    // S2 (r1507): a home of 30 folders — a reply asks at most 24 of their own facts (the rest the next ask), and they are KEPT while the
    // home's time has not moved: past SELF_TTL_MS (the exclusion read again) no home folder is asked again. A text whose rows are about
    // no kid ('~/zzz'): only `self` asks. RED CONTROLS: no cap; the keep removed (84e43bb55's 30 s facts)
    const K6 = path.join(TMP, 'home-5561-s2');
    for (let i = 0; i < 30; i++) fs.mkdirSync(path.join(K6, 'f' + String(i).padStart(2, '0')), { recursive: true });
    fs.writeFileSync(path.join(K6, 'f07', 'package.json'), JSON.stringify({ name: 'vibespace' }));
    const s2 = async (D2) => {
      let ck = 1e12; const c = standIn(), d = D2.create({ home: K6, repoDir: REPO, call: c, now: () => ck });
      const homeFacts = () => c.rec.filter((x) => /^pathStat:.*\/f\d\d$/.test(x)).length;
      const q = () => d.slice({ text: '~/zzz', bases: ['~'], budgetMs: 450 });
      await q(); await sleep(150); const first = homeFacts();
      await q(); await sleep(150); const all = homeFacts();
      ck += DS.SELF_TTL_MS + 1000;
      const r3 = await q(); await sleep(150);
      return { first, all, later: homeFacts() - all, excluded: !!(r3.self && r3.self.roots.includes(path.join(K6, 'f07'))) };
    };
    lap('    · k2, k2cap, k2keep');
    const [k2, k2cap, k2keep] = await Promise.all([s2(DS),
      s2(M5dc(anchored(DCsrc5, 'const SELF_FACTS = 24;', 'const SELF_FACTS = 1000;', 'no cap'), 'ds-no-cap')),
      s2(M5dc(anchored(DCsrc5, 'const SELF_KEEP_MS = 10 * 60e3;', 'const SELF_KEEP_MS = 0;', 'no keep'), 'ds-no-keep'))]);
    ok(`③e S2: a home of 30 folders — ${k2.first} of their own facts asked by the first reply (the cap: 24), ${k2.all} after the next; past the exclusion's re-read ${k2.later} asked again (the home's time held); ~/f07 (vibespace) excluded`, k2.first === 24 && k2.all === 30 && k2.later === 0 && k2.excluded, k2);
    ok(`③e S2 RED CONTROLS: no cap — ${k2cap.first} asked at once; no keep — ${k2keep.later} asked again`, k2cap.first === 30 && k2keep.later > 0, { cap: k2cap, keep: k2keep });
    // (the facts go out behind each answer through two slots: a leg reads its counts once they have all gone — a condition, bounded 3 s)
    const settle = async (d) => { for (let i = 0; i < 120 && (d._counters.facts.busy || d._counters.facts.q.length); i++) await sleep(25); };
    // S2's other half: the keep holds while the HOME's own time holds — the home's time moved (a folder replaced in it), past the
    // exclusion's minute: its folders' facts are asked again. RED: the home-time compare taken out
    const s2t = async (D2) => {
      let ck = 1e12; const c = standIn(), d = D2.create({ home: K6, repoDir: REPO, call: c, now: () => ck });
      const homeFacts = () => c.rec.filter((x) => /^pathStat:.*\/f\d\d$/.test(x)).length;
      const q = () => d.slice({ text: '~/zzz', bases: ['~'], budgetMs: 450 });
      await q(); await settle(d); await q(); await settle(d); const all = homeFacts();
      const tt = Date.now() / 1000 + 7; fs.utimesSync(K6, tt, tt);   // the home's own time moves
      ck += DS.SELF_TTL_MS + 1000;
      await q(); await settle(d); return { all, again: homeFacts() - all };
    };
    lap('    · kt, ktc');
    const [kt, ktc] = [await s2t(DS), await s2t(M5dc(anchored(DCsrc5, 'if (sf && sf.homeAt === d.mtime && now() - sf.at < SELF_KEEP_MS)', 'if (sf && true && now() - sf.at < SELF_KEEP_MS)', 'the home-time compare taken out'), 'ds-no-hometime'))];
    ok(`③e S2: the home's own time moved — its folders' facts asked again (${kt.again} after ${kt.all}) — RED CONTROL the home-time compare taken out: ${ktc.again}`, kt.all === 30 && kt.again > 0 && ktc.again === 0, { real: kt, control: ktc });
    // r1748 (a): THE EXCLUSION NEVER SHRINKS — a home checkout's fact past its keep STANDS while its re-ask is out (here held). RED: the
    // tip's self() (the stale verdict dropped): the checkout offered for that reply
    const K9 = path.join(TMP, 'home-5561-keep');
    for (let i = 0; i < 6; i++) fs.mkdirSync(path.join(K9, 'f0' + i), { recursive: true });
    fs.writeFileSync(path.join(K9, 'f03', 'package.json'), JSON.stringify({ name: 'vibespace' }));
    const stands = async (D2) => {
      let ck = 1e12; const dead = [], g = hold(), F3 = path.join(K9, 'f03');
      const c = standIn({ dead }), d = D2.create({ home: K9, repoDir: REPO, call: c, now: () => ck });
      const q = () => d.slice({ text: '~/zzz', bases: ['~'], budgetMs: 450 });
      await q(); await settle(d); const r1 = await q(); await settle(d);
      dead.push({ path: F3, g, op: 'pathStat' });   // its fact's re-ask will be OUT
      ck += DS.SELF_KEEP_MS + 1000;
      const r2 = await q(); await sleep(30); const r3 = await q();
      const out = c.touchedAt[F3] || 0; g.open();
      return { before: r1.self.roots.includes(F3), during: r2.self.roots.includes(F3) && r3.self.roots.includes(F3), out };
    };
    lap('    · ks, ksc');
    const [ks, ksc] = await Promise.all([stands(DS), stands(M5dc(anchored(DCsrc5, '        if (sf && sf.pkg === PT.SELF_PACKAGE) roots.push(p);\n', '', 'the stale verdict dropped (the tip)'), 'ds-shrinks'))]);
    ok(`r1748 (a): a home checkout's fact past its keep STANDS while its re-ask is out (out: ${ks.out}) — excluded before (${ks.before}) and during (${ks.during}); RED CONTROL the tip's self(): during ${ksc.during}`, ks.before && ks.during && ks.out >= 1 && ksc.before && !ksc.during, { real: ks, control: ksc });
    // r1748 (b): A KID WHOSE FACTS CALL ERRS AT ONCE (twelve link loops, ELOOP) is kept AS SUCH: asked ONCE, the late flag settles, and
    // the 13th link gets its slot (a LINK). RED: the tip's askFacts (an error never kept)
    const K8 = path.join(TMP, 'home-loops'); fs.mkdirSync(path.join(K8, 'target'), { recursive: true }); fs.mkdirSync(path.join(K8, '.loop'), { recursive: true });
    try { fs.symlinkSync('b', path.join(K8, '.loop', 'a')); fs.symlinkSync('a', path.join(K8, '.loop', 'b')); for (let i = 0; i < 12; i++) fs.symlinkSync(path.join(K8, '.loop', 'a'), path.join(K8, 'l' + String(i).padStart(2, '0'))); fs.symlinkSync(path.join(K8, 'target'), path.join(K8, 'lz')); } catch { }
    const loops = async (D2) => {
      const c = standIn(), d = D2.create({ home: K8, repoDir: REPO, call: c });
      const q = () => d.slice({ text: '~/', bases: [], budgetMs: 450 });
      let r = await q(); for (let i = 0; i < 6; i++) { await settle(d); r = await q(); }
      return { asked: c.rec.filter((x) => x === 'pathStat:' + path.join(K8, 'l00')).length, lz: (r.listing.links || {})['~/lz'] || null, factsLate: !!r.factsLate };
    };
    lap('    · lr, lc');
    const [lr, lc] = await Promise.all([loops(DS), loops(M5dc(anchored(DCsrc5, '      } else if (st && st.err) keepErr(st.err);\n', '      }\n', 'an erred fact never kept (the tip)'), 'ds-err-unkept'))]);
    ok(`r1748 (b): twelve links that err at once (ELOOP) — each asked ${lr.asked}×, the 13th a LINK (${lr.lz}), factsLate ${lr.factsLate} — RED CONTROL the tip's askFacts: asked ${lc.asked}×, the 13th ${lc.lz}, factsLate ${lc.factsLate}`, lr.asked === 1 && lr.lz === '~/target' && !lr.factsLate && lc.asked > 1 && lc.lz === null && lc.factsLate, { real: lr, control: lc });
    // the two caps of 12 (KID_FACTS, LINK_FACTS — PER ANSWER, over every listing it holds: the home's too): a folder of 30 folders and 30
    // links, its whole listing asked once, under a home of its own with no kid (nothing of it shares the caps) — 12 of each asked.
    // REDS: each cap 1000
    const K10 = path.join(TMP, 'caps-12'), K10H = path.join(TMP, 'caps-home'); fs.mkdirSync(path.join(K10, 'tgt'), { recursive: true }); fs.mkdirSync(K10H, { recursive: true });
    for (let i = 0; i < 30; i++) { const nn = String(i).padStart(2, '0'); fs.mkdirSync(path.join(K10, 'd' + nn), { recursive: true }); try { fs.symlinkSync(path.join(K10, 'tgt'), path.join(K10, 'k' + nn)); } catch { } }
    const caps = async (D2) => {
      const c = standIn(), d = D2.create({ home: K10H, repoDir: REPO, call: c });
      await d.slice({ text: K10 + '/', bases: [], budgetMs: 450 }); await settle(d);
      const nOf = (re) => c.rec.filter((x) => re.test(x)).length;
      return { kids: nOf(/^pathStat:.*\/caps-12\/d\d\d$/), links: nOf(/^pathStat:.*\/caps-12\/k\d\d$/) };
    };
    lap('    · cr, ccK, ccL');
    const [cr, ccK, ccL] = await Promise.all([caps(DS), caps(M5dc(anchored(DCsrc5, 'const KID_FACTS = 12;', 'const KID_FACTS = 1000;', 'no kid cap'), 'ds-no-kidcap')), caps(M5dc(anchored(DCsrc5, 'const LINK_FACTS = 12;', 'const LINK_FACTS = 1000;', 'no link cap'), 'ds-no-linkcap'))]);
    ok(`③e the two caps of 12: a folder of 30 folders and 30 links listed whole — ${cr.kids} folder facts and ${cr.links} link facts asked — RED CONTROLS: no kid cap ${ccK.kids}, no link cap ${ccL.links}`, cr.kids === 12 && cr.links === 12 && ccK.kids === 30 && ccL.links === 30, { real: cr, kidCap: ccK, linkCap: ccL });
    // a MOUNT kid is named, never stated (askFacts' mount guard). RED: the guard taken out
    const K11 = path.join(TMP, 'with-mount'); fs.mkdirSync(path.join(K11, 'mnt'), { recursive: true }); fs.mkdirSync(path.join(K11, 'plain'), { recursive: true });
    const mg = async (D2) => {
      const c = standIn(), MK = path.join(K11, 'mnt'), d = D2.create({ home: K5, repoDir: REPO, call: c, mounts: () => [{ path: MK, mounted: true, label: 'share' }] });
      await d.slice({ text: K11 + '/', bases: [], budgetMs: 450 }); await settle(d);
      return { mount: c.rec.filter((x) => x === 'pathStat:' + MK).length, plain: c.rec.filter((x) => x === 'pathStat:' + path.join(K11, 'plain')).length };
    };
    lap('    · mr, mc');
    const [mr, mc] = await Promise.all([mg(DS), mg(M5dc(anchored(DCsrc5, 'if (factOf(p, t) || mountPaths.includes(p) || entranceAbove(p, t)) return false;', 'if (factOf(p, t) || entranceAbove(p, t)) return false;', 'the mount guard taken out'), 'ds-no-mountguard'))]);
    ok(`③e a hub MOUNT among a listing's kids is named, never stated: its facts asked ${mr.mount}× (a plain kid's ${mr.plain}×) — RED CONTROL the mount guard taken out: ${mc.mount}×`, mr.mount === 0 && mr.plain === 1 && mc.mount >= 1, { real: mr, control: mc });
    // r2178 (1): AN ERRED LINK FACT HEALS — a PASSING error (EIO while a mount comes up) keeps a listing's short time, then the link is
    // asked again and is a LINK; a LASTING one (ELOOP) keeps the full time, and a good stat of its own path (the person types it: the
    // line's stat) clears it. REDS: every error kept the full time (the tip's); no clear by a good stat
    const K12 = path.join(TMP, 'home-errlink'); fs.mkdirSync(path.join(K12, 'tgt'), { recursive: true }); try { fs.symlinkSync(path.join(K12, 'tgt'), path.join(K12, 'lnk')); } catch { }
    const LNK = path.join(K12, 'lnk');
    const heals = async (D2, msg, { press = false, ahead = 0 } = {}) => {
      let ck = 1e12; const c = standIn({ errOnce: new Map([[LNK, msg]]) }), d = D2.create({ home: K12, repoDir: REPO, call: c, now: () => ck });
      const q = (text = '~/') => d.slice({ text, bases: [], budgetMs: 450 });
      const linkOf = (r) => (r.listing.links || {})['~/lnk'] || null;
      await q(); await settle(d);
      const before = linkOf(await q()); await settle(d);
      if (press) { await q('~/lnk'); await settle(d); }
      ck += ahead;
      await q(); await settle(d);
      return { before, after: linkOf(await q()) };
    };
    const EIO = 'EIO: i/o error, stat \'' + LNK + '\'', ELOOP = 'ELOOP: too many symbolic links encountered, stat \'' + LNK + '\'';
    const ALLKEPT = M5dc(anchored(DCsrc5, 'LASTING_ERR.test(code) ? 0 : LIST_FRESH_MS); };', '0); };', 'every erred fact kept the full time (the tip)'), 'ds-err-allkept');
    const NOCLEAR = M5dc(anchored(DCsrc5, ' if (st && st.exists) { const kf = kidFacts.get(p); if (kf && kf.f && kf.f.errored) kidFacts.delete(p); } };', ' };', 'no clear by a good stat'), 'ds-err-noclear');
    lap('    · hp, hl, hs, hpC, hlC');
    const [hp, hl, hs, hpC, hlC] = await Promise.all([heals(DS, EIO, { ahead: DS.LIST_FRESH_MS + 100 }), heals(DS, ELOOP, { press: true }), heals(DS, ELOOP, { ahead: DS.LIST_FRESH_MS + 100 }), heals(ALLKEPT, EIO, { ahead: DS.LIST_FRESH_MS + 100 }), heals(NOCLEAR, ELOOP, { press: true })]);
    ok(`r2178 (1): an erred link heals — a PASSING error (EIO) is out for a listing's short time (${hp.before}) then a LINK again (${hp.after}); a LASTING one (ELOOP) stays out past it (${hs.after}) and the person's own text of its path clears it (${hl.after}) — RED CONTROLS: every error kept the full time ${hpC.after}; no clear by a good stat ${hlC.after}`,
      hp.before === null && hp.after === '~/tgt' && hs.after === null && hl.after === '~/tgt' && hpC.after === null && hlC.after === null, { passing: hp, lasting: hs, pressed: hl, allKept: hpC, noClear: hlC });
    // r2178 (2) and (3) — a busy pool refuses ~/work's own stat (a synchronous refusal by the pool's code), the typed ask re-asking:
    // (2) THE ASK GROUP: twelve answers about other texts each re-read the exclusion and ask ~/work's own facts — a join with no bound and
    // no field: the group holds the typed ask alone. RED: the tip's join (every asker kept). (3) THE «LATE» DECISION AND THE CALL'S
    // LEAVING ARE ONE STEP: two microtask steps after the refusal that ends it — between the decision and the call's own end — the call
    // is already out of `sent`. RED: the tip's (it left only at its own end: a joiner in that gap got LATE with its own bound open)
    const busyErr = () => Object.assign(new Error('every worker of the file pool is busy — the call was not sent'), { code: 'no-idle-worker' });
    const WK = path.join(HOME, 'work'), WKEY = 'stat:' + WK;
    const grp = async (D2) => {
      const c = standIn(); let refusing = true;
      const call = (op, pl, o) => { if (refusing && op === 'pathStat' && pl.path === WK) throw busyErr(); return c(op, pl, o); };
      const d = D2.create({ home: HOME, repoDir: REPO, call });
      const pA = d.slice({ text: '~/work', bases: [], budgetMs: 1500 });
      await sleep(40);
      for (let i = 0; i < 12; i++) await d.slice({ text: '~/zz' + i, bases: [], budgetMs: 60 });
      const e = d._caches.sent.get(WKEY), size = e && e.ask ? e.ask.asks.length : null;
      refusing = false; await pA; return { size };
    };
    const gap = async (D2) => {
      const c = standIn(), probes = []; let d = null;
      const call = (op, pl, o) => {
        if (op === 'pathStat' && pl.path === WK && !pl.facts) { const late0 = d.stats().noIdle.late; queueMicrotask(() => queueMicrotask(() => probes.push({ late: d.stats().noIdle.late > late0, inSent: d._caches.sent.has(WKEY) }))); throw busyErr(); }
        return c(op, pl, o);
      };
      d = D2.create({ home: HOME, repoDir: REPO, call });
      await d.slice({ text: '~/work', bases: [], budgetMs: 120 }); await sleep(30);
      return { refusals: probes.length, ending: probes.filter((x) => x.late)[0] || null };
    };
    const KEEPALL = M5dc(anchored(DCsrc5, 'const joinAsk = (g, boundAt, signal) => { if (!g) return; g.asks = g.asks.filter(asking); const a = { boundAt, signal }; if (asking(a)) g.asks.push(a); };', 'const joinAsk = (g, boundAt, signal) => { if (g) g.asks.push({ boundAt, signal }); };', 'every asker kept (the tip)'), 'ds-ask-keepall');   // stale-pins: kept (a red control: its replacement is the tip's own text)
    const LATEGAP = M5dc(anchored(DCsrc5, '{ busy.late++; if (sent.get(key) === e) sent.delete(key); throw err; }', '{ busy.late++; throw err; }', 'the entry left only at its own end (the tip)'), 'ds-late-gap');   // stale-pins: kept (a red control: its replacement is the tip's own text)
    lap('    · gr, grC, gp, gpC');
    const [gr, grC, gp, gpC] = await Promise.all([grp(DS), grp(KEEPALL), gap(DS), gap(LATEGAP)]);
    ok(`r2178 (2): twelve answers joined ~/work's call with no bound and no field — the group holds ${gr.size} asker (the typed ask) — RED CONTROL the tip's join: ${grC.size} (each join kept)`, gr.size === 1 && grC.size >= 13, { real: gr, control: grC });
    ok(`r2178 (3): the refusal that ends ~/work's call LATE — two microtask steps later it is out of \`sent\` (${gp.ending && gp.ending.inSent === false}) — RED CONTROL the tip's: still there (${gpC.ending && gpC.ending.inSent})`, gp.refusals > 1 && gp.ending && gp.ending.inSent === false && gpC.ending && gpC.ending.inSent === true, { real: gp, control: gpC });
    // r2178 (4): THE HOME ROUTE'S WAIT ENDS WITH ITS REQUEST — a home folder's facts held out, the request ends while it waits: selfWhole
    // answers then (not whole), never at its bound. RED: the tip's selfWhole (no abort read).
    // r4362 (row B-3dbd's family, the flake census at 2.369.419): judged on FACTS, never on the two copies' clocks (it was «the real's
    // ms under half its red copy's, the copy within 5 % of a 600 ms bound» — a loaded machine could lose it). Both copies wait under
    // ONE request (one AbortController) with a bound far past any answer judged here; the request ends once BOTH have asked for the held
    // fact (a fact, not 80 ms); the real answers on the request's end while the copy with no abort read is STILL waiting (its own run
    // judged: it answers only when its fact comes, whole). Every wait has a generous bound whose expiry is a NAMED line.
    const SW_BOUND_MS = 60000;   // the wait's own bound in this leg: far past any answer judged here — neither copy can end on it
    const SW_EXPIRY_MS = 20000;   // the harness's bound on an answer it waits for; its expiry is said by name in the leg
    const swStart = (D2, signal) => {
      const g = hold(), c = standIn({ dead: [{ path: path.join(K9, 'f01'), g, op: 'pathStat' }] }), d = D2.create({ home: K9, repoDir: REPO, call: c });
      const run = { g, c, done: null }; run.p = d.selfWhole(SW_BOUND_MS, signal).then((r) => (run.done = { whole: r.whole })); return run;
    };
    const swWithin = (p, what) => Promise.race([p, new Promise((r) => setTimeout(() => r({ expired: what }), SW_EXPIRY_MS))]);
    const swOf = async (D2, D2c) => {
      const ac = new AbortController(), real = swStart(D2, ac.signal), ctl = swStart(D2c, ac.signal);
      const asked = await swWithin((async () => { while (!(real.c.touched >= 1 && ctl.c.touched >= 1)) await sleep(10); return { asked: true }; })(), 'the held fact was never asked by both');
      ac.abort();   // the request ends — once both wait on the held fact
      const sa = await swWithin(real.p, 'the real route never ended with its request'), ctlAtReal = ctl.done;   // null: the copy still waits
      real.g.open(); ctl.g.open();
      const saC = await swWithin(ctl.p, 'the copy never answered once its fact came');
      return { asked: !asked.expired, sa, ctlAtReal, saC, expired: [asked, sa, saC].map((x) => x && x.expired).filter(Boolean) };
    };
    const NOABORT = M5dc(anchored(DCsrc5, 'if (mono() >= until || (signal && signal.aborted)) return { v, whole: false };', 'if (mono() >= until) return { v, whole: false };', 'no abort read (the tip)'), 'ds-sw-noabort');   // stale-pins: kept (a red control: its replacement is the tip's own text)
    lap('    · sa, saC');
    const sw = await swOf(DS, NOABORT);
    ok(`r2178 (4): the home route's wait ends with its request — the real answered on the request's end, not whole (${sw.sa.whole}) — RED CONTROL the tip's (no abort read): still waiting when the real answered (${sw.ctlAtReal === null}), answered only once its fact came (whole ${sw.saC.whole})${sw.expired.length ? ' — EXPIRED (' + SW_EXPIRY_MS + ' ms): ' + sw.expired.join('; ') : ''}`, sw.asked && !sw.expired.length && sw.sa.whole === false && sw.ctlAtReal === null && sw.saC.whole === true, sw);
  });
  // THE FIELD'S SIDE: askedOf (late and failed probes marked nothing) · replyKind (skipped / failed) · THE ONE RESOLVER (model() reads the
  // verdict in hand; target, rankOf and Tab read model) — source pins with their controls
  await section('③b–③d the field', async () => {
    const PFM = require('../src/path-field-model.js'), PCm = require('../src/path-candidates.js');
    const PF = read('src/lib/path-field.js');
    const mergeOf = (src) => { const i = src.indexOf('  function mergeReply(W, h, d, probe, key = null) {'), j = src.indexOf('\n  }\n', i); if (i < 0 || j < i) throw new Error('mergeReply moved'); return new Function('mergeInto', 't', 'askedOf', 'lateOf', `${src.slice(i, j + 4)}\nreturn mergeReply;`)(() => {}, (x) => x, PFM.askedOf, PFM.lateOf); };   // r4184: the block merges through mergeInto (the listing and its revision)
    const askedAfter = (src, d) => { const W = { L: { dirs: {} } }; mergeOf(src)(W, null, d, ['~/x', '~/y']); return [...((W.asked && W.asked.keys()) || [])].join(); };
    ok('③b the field: a reply marks asked ONLY the probes it answered (~/y), never a late or failed one (~/x); a partial reply marks none', askedAfter(PF, { listing: { dirs: {} }, probesLate: ['~/x'] }) === '~/y' && askedAfter(PF, { listing: { dirs: {} }, probesFailed: ['~/x'] }) === '~/y' && askedAfter(PF, { listing: { dirs: {} }, partial: true }) === '', [askedAfter(PF, { listing: { dirs: {} }, probesFailed: ['~/x'] })]);
    ok('③b CONTROL: the field without its filter marks the late probe asked', askedAfter(anchored(PF, 'for (const p of askedOf(probe, d)) W.asked.set(', 'for (const p of probe) W.asked.set(', 'the field without its filter'), { listing: { dirs: {} }, probesLate: ['~/x'] }).split(',').includes('~/x'));
    const RK = PFM.replyKind;
    ok('③c replyKind: a skipped verdict ⇒ \'skipped\' (not counted; one ask when its mark ends), FAILED ⇒ \'failed\', complete ⇒ \'listing\', partial ⇒ \'partial\'', [RK({ listing: {}, verdict: { kind: 'skipped' } }), RK({ listing: {}, verdict: { kind: 'failed' } }), RK({ listing: {} }), RK({ listing: {}, partial: true })].join() === 'skipped,failed,listing,partial');
    const resolverPin = (src) => /const kn = keyNow\(text\), a = incoming && incoming\.key === kn \? incoming : MM\.answer, v = a && a\.key === kn \? a\.verdict : null;/.test(src) && /if \(v && v\.kind === 'exists'\)/.test(src) && /function target\(text = textNow\(\)\) \{\n    const m = model\(text\);/.test(src) && /const rankOf = \(text\) => \{ const m = model\(text\);/.test(src) && /kind: replyKind\(d\)/.test(src) && /\$\{press \? '&press=1' : ''\}/.test(src) && !/&own=/.test(src);
    ok('③c THE ONE RESOLVER on the page: model() reads the verdict IN HAND for (text, machine, bases); target / rankOf (Tab, Enter, the line, the tick) read model(); the reply carries the verdict; a press rides `press`; no `own` — CONTROL: model() back on the page\'s memory is seen', resolverPin(PF) && !resolverPin(anchored(PF, "    const kn = keyNow(text), a = incoming && incoming.key === kn ? incoming : MM.answer, v = a && a.key === kn ? a.verdict : null;", '    const kn = keyNow(text), a = null, v = null;', 'model() on memory')));
    // (the fresh read's M1) A REPLY'S OWN VERDICT IS IN HAND while the step's env is built: an owed press (a pick, a chip, set(), an early
    // Enter) is judged on what the machine just said — CONTROL: the env built before (the press refused «does not exist» on a folder that does)
    const replyFirst = (src) => { const i = src.indexOf('  function fire(ev) {'), j = src.indexOf('const r = pfStep(M,', i), body = src.slice(i, j); return i > 0 && j > i && /if \(ev\.type === 'reply'\) incoming = \{ key: ev\.key, verdict: ev\.verdict \|\| null \};\n    let env; try \{ env = envNow\(\); \} finally \{ incoming = null; \}/.test(body); };
    ok('③c the page steps a reply with ITS verdict in hand: fire() sets the incoming verdict, builds the env, then clears it — CONTROL the env built first is seen', replyFirst(PF) && !replyFirst(anchored(PF, "    if (ev.type === 'reply') incoming = { key: ev.key, verdict: ev.verdict || null };\n    let env; try { env = envNow(); } finally { incoming = null; }", '    const env = envNow();', 'the env built before the reply\'s verdict')));
    // (the box pre-run r156) on a paired machine a group folder is ABSENT only once that machine answered for it — the page splits groupOn's
    // absent by knownAbsent; the rest is UNKNOWN (a plain row, never «does not exist»). CONTROL: the split removed
    const splitPin = (src) => /const known = v\.absent\.filter\(\(f\) => knownAbsent\(W, f\)\); return \{ \.\.\.v, absent: known, unknown: v\.absent\.filter\(\(f\) => !known\.includes\(f\)\) \};/.test(src);
    ok('③c the page splits a paired machine\'s absent group folders: absent only once that machine answered (knownAbsent), the rest unknown — CONTROL the split removed is seen', splitPin(PF) && !splitPin(anchored(PF, 'const known = v.absent.filter((f) => knownAbsent(W, f));', 'const known = v.absent;', 'the split removed')));
    // (主开发 r174) WHAT A MACHINE SENT FOR THE LIST IS NEVER DROPPED while nothing newer is out for that machine: a newer ask gives up only
    // the older ask for the SAME machine (one abort per machine), and a reply superseded by another machine's ask is merged into its own
    // world. CONTROL: the old «superseded ⇒ dropped» (any newer ask threw what the machine sent away)
    const keepPin = (src) => /const prev = st\.ctls\.get\(h\); if \(prev\) prev\.abort\(\);/.test(src) && /if \(my !== st\.seq\) \{[^\n]*\n\s*if \(d && d\.listing && !st\.ctls\.has\(h\)\) mergeReply\(W, h, d, probe\);/.test(src);
    ok('③c a reply superseded by ANOTHER machine\'s ask is kept in its world (one abort per machine) — CONTROL the old drop on any newer ask is seen', keepPin(PF) && !keepPin(anchored(PF, '          if (d && d.listing && !st.ctls.has(h)) mergeReply(W, h, d, probe);\n', '', 'superseded replies dropped')));
    // (主开发 r174, the (b) law as the lane wrote it) a paired machine's group folder is SETTLED (there / not there) or SAID BY NAME, never an
    // unknown row with no ask out: a probe the reply SENT and the machine did not answer (late, or its error) is UNSAID until a later reply
    // answers it; the field's own ask probes the unknown folders (a declared one too); the row says «{host} did not answer for it»
    const unsaidAfter = (src, d, seed) => { const W = { L: { dirs: {} }, ...(seed || {}) }; mergeOf(src)(W, 'h-mac', d, ['~/x', '~/y']); return [...((W.unsaid && W.unsaid.keys()) || [])].join(); };
    const noSet = (src) => anchored(src, 'if (late.has(p) && !(d && d.rowsHeld)) W.unsaid.set(p, Date.now()); else ', 'if (false) W.unsaid.set(p, Date.now()); else ', 'nothing unsaid');
    const noClear = (src) => anchored(src, ' else if (W.L.dirs[p] || W.asked.has(p)) W.unsaid.delete(p);', '', 'never cleared');
    const seeded = () => ({ unsaid: new Map([['~/x', 1]]) });
    ok('③d the field: a probe the reply SENT and the machine left LATE (~/x) or FAILED (~/y) is unsaid; an answered one is not — CONTROL the field that never marks it says nothing', unsaidAfter(PF, { listing: { dirs: {} }, probesLate: ['~/x'] }) === '~/x' && unsaidAfter(PF, { listing: { dirs: {} }, probesFailed: ['~/y'] }) === '~/y' && unsaidAfter(noSet(PF), { listing: { dirs: {} }, probesLate: ['~/x'] }) === '', [unsaidAfter(PF, { listing: { dirs: {} }, probesLate: ['~/x'] }), unsaidAfter(noSet(PF), { listing: { dirs: {} }, probesLate: ['~/x'] })]);
    ok('③d …a later reply that ANSWERS it (asked, not late) clears it; one still late keeps it — CONTROL the field that never clears keeps the old word', unsaidAfter(PF, { listing: { dirs: {} } }, seeded()) === '' && unsaidAfter(PF, { listing: { dirs: {} }, probesLate: ['~/x'] }, seeded()) === '~/x' && unsaidAfter(noClear(PF), { listing: { dirs: {} } }, seeded()) === '~/x', [unsaidAfter(PF, { listing: { dirs: {} } }, seeded()), unsaidAfter(noClear(PF), { listing: { dirs: {} } }, seeded())]);
    const UNSAID_PINS = [
      ['the field\'s ask probes the unknown folders', /for \(const f of g\.absent \|\| \[\]\) probe\.add\(f\); for \(const f of g\.unknown \|\| \[\]\) probe\.add\(f\);/, ' for (const f of g.unknown || []) probe.add(f);'],
      ['the page names the unsaid ones', /for \(const v of view\) if \(v\.unknown && v\.unknown\.length\) v\.unsaid = v\.unknown\.filter\(\(f\) => !!\(W\.unsaid && W\.unsaid\.has\(f\)\)\);/, '    for (const v of view) if (v.unknown && v.unknown.length) v.unsaid = v.unknown.filter((f) => !!(W.unsaid && W.unsaid.has(f)));\n'],
      ['the row draws its word', /if \(r\.unsaid\) chips\.push\(`<span class="pf-chip unsaid">\$\{escHtml\(whyText\(r\.why\)\)\}<\/span>`\);/, '      if (r.unsaid) chips.push(`<span class="pf-chip unsaid">${escHtml(whyText(r.why))}</span>`);\n'],
      ['its words', /case 'unsaid': return t\('\{host\} did not answer for it', p\);/, "    case 'unsaid': return t('{host} did not answer for it', p);\n"],
    ];
    const unsaidPin = (src) => UNSAID_PINS.every(([, re]) => re.test(src));
    ok('③d the page: the field\'s ask probes the unknown folders, names the unsaid ones, the row draws «{host} did not answer for it» — CONTROL each part removed is seen', unsaidPin(PF) && UNSAID_PINS.every(([what, , cut]) => !unsaidPin(anchored(PF, cut, '', what))), UNSAID_PINS.map(([what, re]) => [what, re.test(PF)]));
    const absentOf = (src) => { const i = src.indexOf('  const knownAbsent = (W, p) => {'), j = src.indexOf('\n  };\n', i); if (i < 0 || j < i) throw new Error('knownAbsent moved'); return new Function('parentOf', 'baseName', `${src.slice(i, j + 5)}\nreturn knownAbsent;`)(PCm.parentOf, PCm.baseName); };
    const W5 = (more) => ({ L: { dirs: { '~/g': { kids: ['a'], more } } } });
    ok('③b knownAbsent: a parent listed IN FULL decides absence; a listing cut at its 400 entries decides none — CONTROL: trusting the cut', absentOf(PF)(W5(false), '~/g/b') === true && absentOf(PF)(W5(true), '~/g/b') === false && absentOf(anchored(PF, ' && !up.more && ', ' && ', 'knownAbsent trusting a cut listing'))(W5(true), '~/g/b') === true);
  });
}

lap('\n── ④ the listing cache per folder, mtime invalidation ──');
await section('④', async () => {
  const DS = require('../src/server/dir-slice.js');
  let clock = 1e12; const calls = [];
  const ds = DS.create({ home: HOME, repoDir: REPO, now: () => clock, call: async (op, p) => { calls.push({ op, dirs: (p.dirs || []).map((d) => ({ path: d.path, known: d.known })) }); return (await runOp(op, p)).result; } });
  // (B-1c27: a listing read within a timestamp tick of its folder's mtime is RACY and sends no `known` — ~/work's mtime set a minute
  // back first, so this leg states the cache, never the tick: a suite that has just made the fixture would read it racy)
  { const back = new Date(Date.now() - 60e3); fs.utimesSync(path.join(HOME, 'work'), back, back); }
  await ds.slice({ text: '~/work/', bases: [] });
  const work = path.join(HOME, 'work');
  const listedFirst = calls.filter((c) => c.op === 'dirSlice' && c.dirs.some((d) => d.path === work)).length;
  calls.length = 0;
  await ds.slice({ text: '~/work/', bases: [] });
  ok('a second ask < 2 s lists ~/work from the cache (no worker call for it)', listedFirst === 1 && !calls.some((c) => c.dirs.some((d) => d.path === work)), calls);
  clock += 5000; calls.length = 0;
  const s2 = await ds.slice({ text: '~/work/', bases: [] });
  const asked = calls.flatMap((c) => c.dirs).find((d) => d.path === work);
  ok('later: the worker is asked with `known` = the cached mtime, a same mtime keeps the listing', asked && asked.known > 0 && s2.listing.dirs['~/work'].kids.includes('payments'), asked);
  fs.mkdirSync(path.join(work, 'new-project'));
  clock += 5000;
  const s3 = await ds.slice({ text: '~/work/', bases: [] });
  ok('a new folder (a new mtime) is listed fresh', s3.listing.dirs['~/work'].kids.includes('new-project'), s3.listing.dirs['~/work'].kids);
  // (主开发 r207, the hosted K46 red) THE DESIGN, BY NAME: the hub REUSES a listing for LIST_FRESH_MS — the window read from the module and
  // pinned at 2000 ms (widening it is a decision made here, never unseen). A folder made INSIDE the window after a listing is NOT in the
  // rows until it passes; the LINE states it at once (its stat asks an absence again, the names fresh); past the window the rows list it
  // (RU's own mtime set a minute back first: the worker answers `same` on an EXACT mtime, and a folder made in the same filesystem
  // timestamp tick as its parent's listing does not move it — a separate fact, said in the line; this leg states the WINDOW)
  const RU = path.join(work, 'reuse-window'); fs.mkdirSync(RU); { const back = new Date(Date.now() - 60e3); fs.utimesSync(RU, back, back); }
  clock += 5000; await ds.slice({ text: '~/work/reuse-window/', bases: [] });
  fs.mkdirSync(path.join(RU, 'alpha'));
  clock += DS.LIST_FRESH_MS - 1;
  const inWin = await ds.slice({ text: '~/work/reuse-window/al', bases: [] });
  clock += 2;
  const past = await ds.slice({ text: '~/work/reuse-window/al', bases: [] });
  const kidsRU = (r) => ((r && r.listing && r.listing.dirs['~/work/reuse-window']) || {}).kids || [];
  ok(`the hub's listing reuse BY NAME: LIST_FRESH_MS ${DS.LIST_FRESH_MS} ms (pinned at 2000) — a folder made inside it after a listing is not in the rows yet while the line states it at once (…/al completes to …/alpha); past it the rows list it`, DS.LIST_FRESH_MS === 2000 && !kidsRU(inWin).includes('alpha') && !!inWin.verdict && inWin.verdict.kind === 'exists' && inWin.verdict.path === '~/work/reuse-window/alpha' && kidsRU(past).includes('alpha'), { window: DS.LIST_FRESH_MS, inWindow: { kids: kidsRU(inWin), verdict: inWin.verdict }, past: { kids: kidsRU(past), verdict: past.verdict } });
});

// B-1c27 — A FOLDER MADE IN THE SAME TIMESTAMP TICK AS ITS PARENT'S LISTING (a coarse clock: the parent's mtime did not move) is in the
// rows once the reuse window passes: a listing read within a tick of its folder's mtime is RACY — the hub sends no `known`, the folder
// is listed again. Placed, no load: the folder's mtime set to a whole second of now (a coarse tick), listed, a kid made, the mtime set
// back to that same second (the tick did not move); the hub's clock past LIST_FRESH_MS. RED CONTROL: the exact compare (the release's):
// `same`, the kid out of the rows until the folder changes again
await section('④ B-1c27', async () => {
  const DS = require('../src/server/dir-slice.js'), work = path.join(HOME, 'work');
  const EXACT = withDC(DS, mutantCopies('dir-complete-1c27-exact', REPO).load('src/dir-collect.js', anchored(read('src/dir-collect.js'), 'known: base && !base.entry.racy ? base.entry.mtime : undefined', 'known: base ? base.entry.mtime : undefined', "the exact compare (the release's)"), 'ds-1c27-exact'));   // stale-pins: kept (the red control writes the release's exact compare back)
  const sameTick = async (D2, name) => {
    let ck = 1e12; const sent = [];
    const RT = path.join(work, name); fs.mkdirSync(RT);
    const d = D2.create({ home: HOME, repoDir: REPO, now: () => ck, call: async (op, p) => { if (op === 'dirSlice') for (const x of p.dirs || []) if (x.path === RT) sent.push(x.known); return (await runOp(op, p)).result; } });
    await sleep(1005 - (Date.now() % 1000));   // (r1748: just past a second's boundary — the read lands ~2 s inside the tick, never at its edge)
    const sec = Math.floor(Date.now() / 1000); fs.utimesSync(RT, sec, sec);   // the folder's mtime: a whole second of now (a coarse tick)
    const kidsOf = (r) => ((r.listing.dirs[`~/work/${name}`]) || {}).kids || [];
    const first = await d.slice({ text: `~/work/${name}/`, bases: [] });
    const racy = !!((d._caches.listCache.get(RT) || {}).entry || {}).racy;
    fs.mkdirSync(path.join(RT, 'made-in-the-tick')); fs.utimesSync(RT, sec, sec);   // made in the same tick: the folder's mtime did not move
    ck += DS.LIST_FRESH_MS + 1;
    const again = await d.slice({ text: `~/work/${name}/`, bases: [] });
    return { racy, first: kidsOf(first), again: kidsOf(again), known: sent.slice(1), mtime: sec * 1000 };
  };
  const [real, rel] = await Promise.all([sameTick(DS, 'tick-real'), sameTick(EXACT, 'tick-exact')]);   // (two folders of their own: side by side)
  ok(`B-1c27: a folder made in the same timestamp tick as its parent's listing is in the rows once the window passes — the listing was read RACY (${real.racy}), no \`known\` sent again (${JSON.stringify(real.known)}), the kid listed`, real.racy && !real.first.includes('made-in-the-tick') && real.again.includes('made-in-the-tick') && real.known.length >= 1 && real.known.every((k) => k === undefined), real);
  ok('B-1c27 RED CONTROL (the exact compare, the release\'s): the cached mtime sent back as `known`, the worker answers `same` — the kid stays out of the rows', !rel.again.includes('made-in-the-tick') && rel.known.includes(rel.mtime), rel);
});

lap('\n── ⑤ the host rung with a FAKE machine (the real HostManager, its ssh rung run here) ──');
await section('⑤', async () => {
  const MAC = path.join(TMP, 'fake', 'Users', 'me');
  for (const d of ['Projects/website/content', 'work/investor-relations/共享资料', 'Documents/算力合同', 'Downloads', 'Desktop']) fs.mkdirSync(path.join(MAC, d), { recursive: true });
  fs.mkdirSync(path.join(MAC, 'Projects/website/.git'));
  fs.writeFileSync(path.join(MAC, 'Documents/报价.pages'), 'x');
  const BIN = path.join(TMP, 'fakebin'); fs.mkdirSync(BIN);
  fs.writeFileSync(path.join(BIN, 'uname'), '#!/bin/sh\necho Darwin\n', { mode: 0o755 });
  fs.writeFileSync(path.join(BIN, 'mdls'), '#!/bin/sh\nfor a; do p="$a"; done\ncase "${p##*/}" in Documents) echo 文稿;; Downloads) echo 下载;; Desktop) echo 桌面;; *) echo "${p##*/}";; esac\n', { mode: 0o755 });
  const { HostManager } = require('../src/hosts.js');
  const hm = new HostManager({ dataDir: path.join(TMP, 'hub-data') });
  hm._state.hosts.push({ id: 'h-mac', name: 'my-mac', host: 'mac.example.test', user: 'me', port: 22, transport: 'ssh' });
  const ran = [];
  hm._ssh = (h, cmd) => new Promise((resolve, reject) => { ran.push(h.id); execFile('sh', ['-c', cmd], { env: { HOME: MAC, PATH: `${BIN}:/usr/bin:/bin` }, timeout: 8000, maxBuffer: 8 << 20 }, (e, out) => (e ? reject(e) : resolve(out))); });
  const a = await hm.dirSlice('h-mac', { text: '', bases: ['~/work/investor-relations', '~'], probe: ['~/work/investor-relations', '~/work/investor-relations/共享资料', '~/work/compute-deal', '~/work/investor-relations/payments', '~/payments'] });
  ok('one sh round trip over the ssh rung answers that machine\'s home + listing', ran.length >= 1 && a.listing.home === MAC && a.listing.machine === 'h-mac' && a.os === 'Darwin' && (a.listing.dirs['~'] || {}).kids?.includes('Projects'), { ran, home: a.listing.home, os: a.os });
  ok('the OS display names (mdls on a Mac): ~/Documents = 文稿, ~/Downloads = 下载', a.listing.localized['~/Documents'] === '文稿' && a.listing.localized['~/Downloads'] === '下载', a.listing.localized);
  ok('a group folder PROBED there: present (IR) / absent (compute-deal)', !!a.listing.dirs['~/work/investor-relations'] && !a.listing.dirs['~/work/compute-deal'], Object.keys(a.listing.dirs));
  const M = PC.mergeListing({ home: '', machine: null, dirs: {}, links: {}, localized: {}, mounts: [] }, a.listing);
  const f = await hm.dirSlice('h-mac', { text: '文稿', q: '文稿', bases: ['~'] }); PC.mergeListing(M, f.listing);
  /* 算力合同谈判 declares a folder FOR this machine (task-groups.js keeps `host::/abs`) */
  const view = G.map((g) => PC.groupOn(g.id === 'g-cd' ? { ...g, folders: ['~/work/compute-deal', 'h-mac::' + path.join(MAC, 'Documents/算力合同')] } : g, M));
  const ir = view[0], cd = view[1];
  ok('groupOn there: IR exists (probed); 算力 = its folder DECLARED for h-mac (no probe) + compute-deal ABSENT', ir.folders.join('|') === '~/work/investor-relations' && ir.context === '~/work/investor-relations/共享资料' && cd.declared.join('|') === '~/Documents/算力合同' && cd.absent.join('|') === '~/work/compute-deal', [ir.folders, ir.context, cd.folders, cd.declared, cd.absent]);
  const inp = { bases: [{ path: '~/work/investor-relations', label: 'IR' }, { path: '~/Documents/算力合同', label: '算力' }, { path: '~', label: 'my-mac home' }], groups: [{ ...ir, selected: true }, { ...cd, selected: true }], recent: [{ path: '~/Projects/website', count: 3, when: '3 天前' }], listing: M, name: 'payments', machine: 'my-mac' };
  const m = PC.rankCandidates('', inp);
  const s1 = m.sections.find((s) => s.sec === 1).rows;
  ok('the PURE rank over that machine\'s answer = the POC\'s remote ①: there · declared · absent «create?»', s1.map((r) => r.path + (r.absent ? '(absent)' : '')).join('|') === '~/work/investor-relations|~/work/investor-relations/共享资料|~/Documents/算力合同|~/work/compute-deal(absent)' && s1[0].chip.params.on === 'there' && s1[2].chip.params.on === 'declared' && s1[3].why.key === 'absent', s1.map((r) => [r.path, r.chip, r.why]));
  const s2 = m.sections.find((s) => s.sec === 2).rows.map((r) => r.path + (r.isNew ? '+' : ''));
  ok('② under each group\'s folder THERE + the machine\'s home (all 新建)', s2.join('|') === '~/work/investor-relations/payments+|~/Documents/算力合同/payments+|~/payments+', s2);
  const doc = PC.rankCandidates('文稿', { ...inp, name: '' });
  ok('文稿 → ~/Documents through the OS display name, computed on that machine', doc.best && doc.best.path === '~/Documents' && doc.best.alias && doc.best.alias.from.key === 'os-name', doc.best);
  ok('the index answered for that machine (its folders, ~/Library pruned)', !!M.dirs['~/Projects/website'] || Object.keys(M.dirs).some((p) => p.startsWith('~/Projects')), Object.keys(M.dirs));
  /* the same answer through /api/dir-complete?host= (the files router's remote dispatch) */
  app.locals.getRemoteFs = () => ({ dirSlice: (id, o) => hm.dirSlice(id, o) });
  const viaRoute = await ask('', { host: 'h-mac', bases: ['~'] });
  ok('…and through GET /api/dir-complete?host=h-mac (the router\'s remote dispatch)', viaRoute.listing && viaRoute.listing.home === MAC && viaRoute.listing.machine === 'h-mac', Object.keys(viaRoute));
  const rc = PC.recentCounts([{ cwd: '/Users/me/Projects/website', mtime: 1792000000 }, { cwd: '/Users/me/Downloads', mtime: 1791000000 }, { cwd: '/Users/me/Projects/website', mtime: 1792500000 }, { cwd: '' }]);
  ok('recentCounts: per folder, newest first, seconds scaled to ms', rc.length === 2 && rc[0].path === '/Users/me/Projects/website' && rc[0].count === 2 && rc[0].last === 1792500000 * 1000 && rc[1].count === 1, rc);
});

// ⑤b B-99b9 (the two asks on another machine — one hung source there never costs a healthy typed folder its listing) is its OWN fast
// suite since 主开发 r949: scripts/test-dir-slice-remote.mjs (this one keeps the fast bound)

lap('\n── ⑦ a paired machine that CANNOT be reached: refused by name before any spawn, its stdin roads never an uncaught ──');
await section('⑦ unreachable', async () => {
  const BIN7 = path.join(TMP, 'deadbin'); fs.mkdirSync(BIN7);
  const CALLS = path.join(TMP, 'ssh-calls.log');
  fs.writeFileSync(path.join(BIN7, 'ssh'), `#!/bin/sh\nexec 0<&-\necho x >> '${CALLS}'\necho "ssh: Could not resolve hostname mac.example.test: Name or service not known" >&2\nexit 255\n`, { mode: 0o755 });
  const calls = () => { try { return fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
  const PATH0 = process.env.PATH; process.env.PATH = `${BIN7}:${PATH0}`;
  const uncaught = []; const trap = (e) => uncaught.push(String((e && e.code) || e)); process.on('uncaughtException', trap);
  /* payloads bigger than a pipe holds: the child exits before it reads, so the write meets a closed pipe every time */
  const tools = path.join(TMP, 'tools7'); fs.mkdirSync(tools); fs.writeFileSync(path.join(tools, 'vibespace-status'), Buffer.alloc(3 << 20, 98));
  const big = path.join(TMP, 'scan7'); fs.writeFileSync(big, Buffer.alloc(2 << 20, 97));
  const bundle = path.join(TMP, 'agentd7.js'); fs.writeFileSync(bundle, Buffer.alloc(2 << 20, 99));
  const roadsOf = async (HM, tag) => {
    const hm = new HM({ dataDir: path.join(TMP, 'hub-data-' + tag) });
    hm._state.hosts.push({ id: 'h-dead', name: 'my-mac', host: 'mac.example.test', user: 'me', port: 22, transport: 'ssh' });
    const out = {};
    const road = async (k, f) => { try { await f(); out[k] = 'resolved'; } catch (e) { out[k] = (e && e.code) || String((e && e.message) || e).slice(0, 80); } };
    await road('installAgentTools', () => hm.installAgentTools('h-dead', tools));
    await road('harvestUsage', () => hm.harvestUsage('h-dead', { force: true, scannerPath: big }));
    await road('opencodeOp', () => hm.opencodeOp('h-dead', 'state', { pad: 'x'.repeat(1 << 20) }));
    await road('installAgentd', () => hm.installAgentd('h-dead', bundle, '2.369.346', 'tok'));
    const evs = []; await road('bootstrap', () => hm.bootstrap('h-dead', (ev) => evs.push(ev)));
    out.bootstrapDone = (evs.find((e) => e.type === 'done') || {}).refusal || 'none';
    await sleep(300);
    return out;
  };
  try {
    const { HostManager } = require('../src/hosts.js');
    const dead = new HostManager({ dataDir: path.join(TMP, 'hub-data-dead') });
    dead._state.hosts.push({ id: 'h-dead', name: 'my-mac', host: 'mac.example.test', user: 'me', port: 22, transport: 'ssh' });
    const errs = [];
    for (const text of ['', 'D', 'Do', 'Doc', 'Docs']) { try { await dead.dirSlice('h-dead', { text, q: text, bases: ['~'] }); errs.push(null); } catch (e) { errs.push(e); } }
    let dc = null; try { await dead.dirComplete('h-dead', '~/x'); } catch (e) { dc = e; }
    ok('the host rung refuses the machine BY NAME — code host-unreachable, «my-mac», ssh\'s own line (five keystrokes + a dirComplete)', errs.every((e) => e && e.code === 'host-unreachable' && e.host === 'my-mac' && /Could not resolve hostname/.test(e.sshLine)) && !!dc && dc.code === 'host-unreachable', errs.map((e) => e && [e.code, e.message]));
    ok('…with ONE bounded probe for all six (the verdict is kept a minute — nothing spawns per keystroke)', calls() === 1, calls());
    app.locals.getRemoteFs = () => ({ dirSlice: (id, o) => dead.dirSlice(id, o) });
    const viaRoute = await ask('Doc', { host: 'h-dead', bases: ['~'] });
    ok('…and GET /api/dir-complete?host= says `unreachable` (the path field\'s words: the machine\'s name + ssh\'s line)', viaRoute.unreachable && viaRoute.unreachable.host === 'my-mac' && /Could not resolve hostname/.test(viaRoute.unreachable.line) && Array.isArray(viaRoute.suggestions) && !viaRoute.suggestions.length, viaRoute);
    const reachable = new HostManager({ dataDir: path.join(TMP, 'hub-data-alive') });
    reachable._state.hosts.push({ id: 'h-up', name: 'up', host: 'up.example.test', user: 'me', port: 22, transport: 'ssh' });
    reachable._ssh = (h, cmd) => new Promise((resolve, reject) => execFile('sh', ['-c', cmd], { env: { HOME: TMP, PATH: '/usr/bin:/bin' }, timeout: 8000 }, (e, o) => (e ? reject(e) : resolve(o))));
    const up = await reachable.dirSlice('h-up', { text: '', bases: ['~'] });
    ok('a machine that answers keeps its rung (the probe rides the same _ssh road; the listing comes back)', up && up.listing && up.listing.home === TMP && !!(await reachable.reachable('h-up')).ok, up && up.listing && up.listing.home);
    const fixed = await roadsOf(HostManager, 'fixed');
    ok('every stdin road on the dead machine answers with the named refusal (tools tar · usage scanner · opencode op · agent install · bootstrap)', ['installAgentTools', 'harvestUsage', 'opencodeOp', 'installAgentd'].every((k) => fixed[k] === 'host-unreachable') && fixed.bootstrapDone === 'host-unreachable', fixed);
    ok('…and NOTHING is uncaught — each feed went through feedStdin', uncaught.length === 0, uncaught);
    const src = read('src/hosts.js');
    const mut = editAnchor(src, "  stdin.on('error', (e) => { if (!fed.error) fed.error = e; });\n", '', "src/hosts.js");
    const M = mutantCopies('dir-complete-nolisten', REPO);
    const preFix = await roadsOf(M.load('src/hosts.js', mut, 'nolisten').HostManager, 'prefix');
    ok('RED CONTROL: the same roads through a copy whose feedStdin does not listen ⇒ an uncaught stream write error, EPIPE or ECONNRESET (the hub\'s death)', mut !== src && uncaught.filter((c) => /^(?:EPIPE|ECONNRESET|ERR_STREAM_DESTROYED)$/.test(c)).length >= 2, { uncaught, preFix });
  } finally { process.removeListener('uncaughtException', trap); process.env.PATH = PATH0; }
});

lap('\n── ⑥ wiring pins ──');
await section('⑥', async () => {
  const fsr = read('src/routes/files.js'), ex = read('src/server/exit-routes.js'), hs = read('src/hosts.js'), sfsm = read('src/safe-fs.js');
  ok('files.js: /api/dir-complete answers the slice for bases / q / probe / kind, locally (dir-slice) and over ?host= (R.fs.dirSlice)', /const sliced = req\.query\.bases != null \|\| req\.query\.q != null/.test(fsr) && /R\.fs\.dirSlice\(R\.host,/.test(fsr) && /dirSliceOf\(req\)\.slice\(/.test(fsr), null);
  ok('files.js: /api/home-folders drops the excluded folders (isExcludedPath over self)', /isExcludedPath\(f\.path, self \|\| \{ home, roots: \[\] \}\)/.test(fsr), null);
  ok('exit-routes.js: /api/hosts/:id/dir-complete → hosts.dirSlice; recent-cwds answers COUNTS', /hosts\.dirSlice\(req\.params\.id,/.test(ex) && /recent: require\('\.\.\/path-candidates\.js'\)\.recentCounts\(sessions\)/.test(ex), null);
  ok('hosts.js: dirSlice runs ONE sh script (device runCmd first, the ssh rung otherwise) and sliceListing builds the answer', /async dirSlice\(id, \{ text = '', bases = \[\], probe = \[\], q = '', kind = 'folder', waitMs, press = false, late = false \} = \{\}/.test(hs) && /dm\.runCmd\('sh', \['-c', script\]/.test(hs) && /PC\.sliceListing\(\{ home, machine: id,/.test(hs), null);
  ok('SafeFs: dirSlice + dirIndex carry their deadlines (a stall is reclaimed, never answered on the loop)', /dirSlice: 15000, dirIndex: 15000/.test(sfsm), null);
});

lap('\n── ⑦ B-5ce7 cure: a PARKED storage\'s folder is refused with ITS words and doors (the files router, for real) ──');
await section('⑦ B-5ce7', async () => {
  const DOOR = require('../src/mount-door.js');
  const PARK = path.join(HOME, 'vibespace-mounts', 'OneDrive'), SLOW = path.join(HOME, 'vibespace-mounts', 'Box');
  const stand = { pathBlocked: (p) => (p === PARK || p.startsWith(PARK + '/')) ? PARK : (p === SLOW || p.startsWith(SLOW + '/')) ? SLOW : false,
    parkedAt: (p) => (p === PARK || p.startsWith(PARK + '/')) ? { id: 'od', name: 'OneDrive', mp: PARK } : null, shadowedBy: () => null };
  const askOn = async (router, p) => {
    const app2 = express(); app2.use(express.json()); app2.locals.mounts = stand; app2.locals.safeFs = FILE_POOL; app2.use(router);
    const srv = http.createServer(app2); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try { const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/files?path=${encodeURIComponent(p)}`); return { status: r.status, body: await r.json() }; }
    finally { srv.close(); }
  };
  const a = await askOn(files, PARK + '/Docs'), b = await askOn(files, SLOW);
  ok('a parked storage\'s folder: 503 storage_parked, its name for the reader\'s language, the words naming Connect and Reconnect', a.status === 503 && a.body.code === 'storage_parked' && a.body.params && a.body.params.name === 'OneDrive' && a.body.error === DOOR.parkedSentence('OneDrive'), a);
  ok('…a storage merely blocked (connecting, slow) keeps «try again in a moment»', b.status === 503 && b.body.error === DOOR.SENTENCE && !b.body.code, b);
  // RED CONTROL: the files router's parked branch removed (a patched copy) — the parked folder says «try again» again
  const from = "    const pk = mounts.parkedAt?.(p);\n    if (pk) return res.status(503).json(";
  if (!fsr0.includes(from)) ok('CONTROL: the parked branch was found in src/routes/files.js', false, null);
  else {
    const MCx = mutantCopies('dir-complete-parked', REPO);
    const noBranch = require(MCx.write('src/routes/files.js', editAnchor(fsr0, "    const pk = mounts.parkedAt?.(p);\n", '    const pk = null;\n', "src/routes/files.js"), 'noparked'));
    const c = await askOn(noBranch, PARK + '/Docs');
    ok('CONTROL (the parked branch removed): the parked folder answers «try again in a moment» (red)', c.status === 503 && c.body.error === DOOR.SENTENCE, c);
  }
});
lap('\n── ⑧ a folder made is in its parent\'s next listing (主开发 r4927: the collector\'s one door, the make-folder route) ──');
await section('⑧ folder made', async () => {
  // THE REAL ROUTE (src/routes/files.js) over the real pool, its collector handed in with a PLACED clock (the route takes the one it
  // finds): the parent is listed, a folder is made in it through POST /api/mkdir, the parent is listed again AT THE SAME INSTANT —
  // inside LIST_FRESH_MS. The door (src/dir-collect.js folderMade) dropped the kept listing: the disk was asked again, the folder is
  // in the rows. RED: the route without the drop (a patched copy) answers the kept rows, the folder missing.
  const DS = require('../src/server/dir-slice.js'), PARENT = path.join(HOME, 'work', 'made-here'); fs.mkdirSync(PARENT, { recursive: true });
  const MCm = mutantCopies('dir-complete-folder-made', REPO), fsrNow = read('src/routes/files.js');
  const NODROP = require(MCm.write('src/routes/files.js', anchored(fsrNow, "    if (ds && typeof ds.folderMade === 'function') { try { ds.folderMade(made); } catch { /* the listing ages out in its 2 s */ } }\n", '    // (the release: no drop)\n', 'test-dir-complete ⑧ the route without the drop'), 'no-drop'));
  const leg = async (R, name) => {
    const ck = 3e12, asked = [];   // the PLACED clock: one instant for both listings
    const app3 = express(); app3.use(express.json()); app3.locals.safeFs = FILE_POOL;
    app3.locals._dirSlice = DS.create({ home: HOME, repoDir: REPO, now: () => ck, call: async (op, p, o) => { if (op === 'dirSlice') for (const x of p.dirs || []) if (x.path === PARENT) asked.push(op); return (await runOp(op, p)).result; } });
    app3.use(R);
    const srv = http.createServer(app3); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const b3 = `http://127.0.0.1:${srv.address().port}`;
    const list = async () => (await fetch(`${b3}/api/dir-complete?path=${encodeURIComponent('~/work/made-here/')}&bases=${encodeURIComponent('[]')}`)).json();
    const kidsOf = (r) => (((r && r.listing && r.listing.dirs) || {})['~/work/made-here'] || {}).kids || [];
    try {
      const first = await list(), n0 = asked.length;
      const mk = await fetch(`${b3}/api/mkdir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path.join(PARENT, name) }) });
      const again = await list();
      return { status: mk.status, onDisk: fs.existsSync(path.join(PARENT, name)), first: kidsOf(first), again: kidsOf(again), askedAgain: asked.length - n0 };
    } finally { srv.close(); }
  };
  const real = await leg(files, 'made-by-the-route'), red = await leg(NODROP, 'made-by-the-release');
  ok(`⑧ r4927: a folder made inside the two seconds (one placed instant) is in its parent's next listing — the route made it (${real.status}), the disk was asked again (${real.askedAgain} listing), the rows name it (${real.again.join(' ')})`,
    real.status === 200 && real.onDisk && !real.first.includes('made-by-the-route') && real.again.includes('made-by-the-route') && real.askedAgain >= 1, real);
  ok(`⑧ RED CONTROL (the route without the drop, the release's): the folder is made (${red.status}) but the parent's next listing is the KEPT one — asked ${red.askedAgain} time(s), the folder missing`,
    red.status === 200 && red.onDisk && !red.again.includes('made-by-the-release') && red.askedAgain === 0, red);
  // the door itself: a make-folder that made its parents too (mkdir -p) drops the kept listing of every folder above it
  const DCm = require('../src/dir-collect.js'), c = DCm.create({ home: HOME, now: () => 1, call: async () => null, poolBusy: () => false });
  for (const d of [HOME, path.join(HOME, 'work'), PARENT, path.join(HOME, 'code')]) c._caches.listCache.set(d, { at: 1, entry: { kids: [] } });
  const dropped = c.folderMade(path.join(PARENT, 'a', 'b')), left = [...c._caches.listCache.keys()];
  ok(`⑧ the door (src/dir-collect.js folderMade): a make-folder of …/a/b drops the kept listing of every folder above it (${dropped} dropped), never another's (${left.map((x) => path.relative(HOME, x) || '~').join(' ')} kept); a relative path drops nothing (${c.folderMade('work/x')})`,
    dropped === 3 && left.length === 1 && left[0] === path.join(HOME, 'code') && c.folderMade('work/x') === 0, { dropped, left });
  // A LISTING ALREADY OUT when the folder is made (a PLACED hold: the parent's call read the disk BEFORE the folder existed and its
  // answer is held until after the door ran): answered to its asker, never KEPT — the next ask at the same placed instant asks the disk
  // again and names the folder. RED: the collector without that guard (its landing keeps the rows of before)
  const FLY = path.join(HOME, 'work', 'made-in-flight'); fs.mkdirSync(FLY, { recursive: true });
  const NOGUARD = withDC(DS, mutantCopies('dir-complete-folder-made-guard', REPO).load('src/dir-collect.js', anchored(read('src/dir-collect.js'), "        const moved = (madeGen.get(a) || 0) !== g0;", '        const moved = false;', 'test-dir-complete ⑧ a listing out at the door is kept'), 'no-guard'));
  const flight = async (D2, name) => {
    let gateOpen = null, readNow = null; const gate = new Promise((r) => { gateOpen = r; }), read0 = new Promise((r) => { readNow = r; });
    let hold = true, sentFly = 0;
    const d = D2.create({ home: HOME, repoDir: REPO, now: () => 4e12, call: async (op, p2) => {
      const mine = op === 'dirSlice' && (p2.dirs || []).some((x) => x.path === FLY);
      if (mine) sentFly++;
      const r = (await runOp(op, p2)).result;
      if (mine && hold) { hold = false; readNow(); await gate; }   // read BEFORE the folder exists; answered after the door
      return r;
    } });
    const kidsOf = (r) => (((r && r.listing && r.listing.dirs) || {})['~/work/made-in-flight'] || {}).kids || [];
    const p1 = d.slice({ text: '~/work/made-in-flight/', bases: [] });
    await read0;
    fs.mkdirSync(path.join(FLY, name)); d.folderMade(path.join(FLY, name));   // the folder made, the door run, the old call still out
    gateOpen(); await p1;
    const again = await d.slice({ text: '~/work/made-in-flight/', bases: [] });
    return { again: kidsOf(again), sent: sentFly };
  };
  const fr = await flight(DS, 'made-while-out'), frRed = await flight(NOGUARD, 'made-while-out-red');
  ok(`⑧ a listing of the parent already OUT when the folder was made is answered but never kept: the next ask at the same instant asked the disk again (${fr.sent} call(s)) and names it (${fr.again.join(' ')})`,
    fr.sent === 2 && fr.again.includes('made-while-out'), fr);
  ok(`⑧ RED CONTROL (no guard at the landing): the old call's rows are kept — the next ask answered from them (${frRed.sent} call), the folder missing`,
    frRed.sent === 1 && !frRed.again.includes('made-while-out-red'), frRed);
  // r5046 (the round's should): NO LATER ASK JOINS a listing begun before the door — an ask made after it, while the old call is still
  // out (held), gets the NEW rows from a call of its own. RED: the door without that rule (the old call stays joinable)
  const NOJOIN = withDC(DS, mutantCopies('dir-complete-folder-made-join', REPO).load('src/dir-collect.js', anchored(read('src/dir-collect.js'), "      for (const k of [`list::${d}`, `list:f:${d}`]) { const e = sent.get(k); if (e && e.hungAt == null) sent.delete(k); }", '      // (the door: an old listing stays joinable)', 'test-dir-complete ⑧ a later ask joins the old listing'), 'no-join-rule'));
  const joinFlight = async (D2, name) => {
    const JF = path.join(HOME, 'work', `made-join-${name}`); fs.mkdirSync(JF, { recursive: true });
    let gateOpen = null, readNow = null; const gate = new Promise((r) => { gateOpen = r; }), read0 = new Promise((r) => { readNow = r; });
    let hold = true, sentJ = 0;
    const d = D2.create({ home: HOME, repoDir: REPO, now: () => 4.5e12, call: async (op, p2) => {
      const mine = op === 'dirSlice' && (p2.dirs || []).some((x) => x.path === JF);
      if (mine) sentJ++;
      const r = (await runOp(op, p2)).result;
      if (mine && hold) { hold = false; readNow(); await gate; }
      return r;
    } });
    const text = `~/work/made-join-${name}/`, kidsOf = (r) => (((r && r.listing && r.listing.dirs) || {})[`~/work/made-join-${name}`] || {}).kids || [];
    const p1 = d.slice({ text, bases: [] });
    await read0;
    const old = d._caches.sent.get('list::' + JF);   // the held listing's own entry
    fs.mkdirSync(path.join(JF, 'kid')); d.folderMade(path.join(JF, 'kid'));
    const sig = new AbortController().signal;
    const p2 = d.slice({ text, bases: [], signal: sig, budgetMs: 5000 });   // AFTER the door, the old call still out (a budget past the wait)
    // the gate opens once the later ask has JOINED the old listing (a fact: its ask on the old call's list) — opened at once, the later
    // ask came after the old call had ended and could join nothing; its OWN call waits for the old one's slot, so it is not waited for
    // (bounded: 300 ms — the red's join shows within milliseconds)
    const joined = () => !!(old && old.ask && old.ask.asks.some((a) => a.signal === sig));
    const tw = Date.now(); while (!(sentJ >= 2 || joined()) && Date.now() - tw < 300) await new Promise((r) => setImmediate(r));
    const reached = sentJ >= 2 ? 'its own call' : joined() ? 'joined the old call' : 'did not join it';
    gateOpen(); await p1;
    return { later: kidsOf(await p2), sent: sentJ, reached };
  };
  const jn = await joinFlight(DS, 'real'), jnRed = await joinFlight(NOJOIN, 'red');
  ok(`⑧ r5046: an ask made after the door while the old listing was still out sent a call of its own (${jn.sent} calls) and got the new rows (${jn.later.join(' ')})`, jn.sent === 2 && jn.later.includes('kid'), jn);
  ok(`⑧ RED CONTROL (the door without the join rule): the later ask ${jnRed.reached} (${jnRed.sent} call) — the rows of before (${jnRed.later.join(' ') || 'none'})`, jnRed.reached === 'joined the old call' && jnRed.sent === 1 && !jnRed.later.includes('kid'), jnRed);
  // r5046 (THE ROUND's MUST): the HOME's listing out with its mtime KNOWN comes back «same» (no kids), and a folder made two levels
  // under the home moves the home's count, not its mtime: the kept entry's kids are the answer — the own-checkout exclusion never
  // shrinks. RED: the line's order (the guard before «same»: the answer handed on with NO kids, the exclusion kept a minute short)
  const LINEORDER = withDC(DS, mutantCopies('dir-complete-folder-made-same', REPO).load('src/dir-collect.js', anchored(read('src/dir-collect.js'), "        if (d.same) { if (!base) return null; if (!moved) listCache.set(a, { at: now(), entry: base.entry }); return base.entry; }\n        if (moved) return d;\n", "        if (moved) return d;\n        if (d.same) { if (!base) return null; if (!moved) listCache.set(a, { at: now(), entry: base.entry }); return base.entry; }\n", 'test-dir-complete ⑧ the line\'s order: the guard before «same»'), 'line-order'));
  const homeFlight = async (D2, name) => {
    let ck = 5e12, gateOpen = null, readNow = null, hold = false;
    const gate = new Promise((r) => { gateOpen = r; }), read0 = new Promise((r) => { readNow = r; });
    const d = D2.create({ home: HOME, repoDir: REPO, now: () => ck, call: async (op, p2) => {
      const mine = op === 'dirSlice' && (p2.dirs || []).some((x) => x.path === HOME);
      const r = (await runOp(op, p2)).result;
      if (mine && hold) { hold = false; readNow(!!((((r && r.dirs) || [])[0]) || {}).same); await gate; }
      return r;
    } });
    const old = Math.floor(Date.now() / 1000) - 3600; fs.utimesSync(HOME, old, old);   // the home's mtime well behind: never a racy listing
    const own = path.join(HOME, 'vibespace');
    const before = await d.selfWhole(5000);
    ck += 61e3;   // past the exclusion's minute (and the listing's 2 s): the next self() lists the home again, its mtime known
    hold = true;
    const p1 = d.self();
    const same = await read0;
    fs.mkdirSync(path.join(HOME, 'work', name)); d.folderMade(path.join(HOME, 'work', name));   // two levels under: the home's mtime holds
    gateOpen();
    const after = await p1;
    return { same, before: ((before && before.v && before.v.roots) || []).includes(own), after: ((after && after.roots) || []).includes(own) };
  };
  const hs = await homeFlight(DS, 'made-deep'), hsRed = await homeFlight(LINEORDER, 'made-deep-red');
  ok(`⑧ r5046 (the must): the HOME's listing out with its mtime known answered «same» (${hs.same}) while a folder was made two levels under it — the kept entry's kids are the answer, the own-checkout exclusion HOLDS (before ${hs.before}, after ${hs.after})`, hs.same && hs.before && hs.after, hs);
  ok(`⑧ RED CONTROL (the line's order: the guard before «same»): the answer handed on with NO kids — the exclusion SHRINKS (after ${hsRed.after})`, hsRed.same && hsRed.before && !hsRed.after, hsRed);
});

CUR = 'the table';   // r2332 (2): every row of the table met ONE section call, none off it, no leg outside a section
const unmet = SECTIONS.map(([s]) => s).filter((s) => MET.get(s) !== 1), offTable = [...MET.keys()].filter((s) => !SECTIONS.some(([x]) => x === s));
ok(`r2332 NO LEG FALLS BETWEEN THE TWO: each of the table's ${SECTIONS.length} rows met ONE section call (${H.mine} run here, ${H.theirs} named for the twin), none off the table, no leg outside a section`,
  unmet.length === 0 && offTable.length === 0 && STRAY.length === 0, { unmet, offTable, stray: STRAY.slice(0, 4) });
console.log(`the ${PART} half (r2332) — its twin: ${TWIN[PART]}`);
server.close();
console.log(`\n${n - bad}/${n} ok${bad ? ` — ${bad} BAD` : ''} — in ${((Date.now() - T00) / 1000).toFixed(1)} s`);
process.exit(bad ? 1 : 0);
