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
//   ④ the listing cache per folder with mtime invalidation: a second ask < 2 s lists nothing again; later the worker is
//     asked with `known` and a same mtime answers `same` (no re-read); a new folder (a new mtime) is listed fresh
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
let bad = 0, n = 0;
const ok = (name, cond, got) => { n++; if (!cond) bad++; console.log(`${cond ? 'ok ' : 'BAD'} ${name}${cond ? '' : '  got ' + JSON.stringify(got).slice(0, 600)}`); };
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
{
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
  const g = await ask('', { probe: ['~/code/ir-dashboard', '~/nope', '~/code/ir-dashboard/notes.txt'] });
  const ird = g.listing.dirs['~/code/ir-dashboard'] || {};
  ok('probe = each folder\'s facts: exists + git + fileCount + mtime; a missing one is absent; a file is a nondir', ird.git === true && ird.fileCount === 2 && ird.mtime > 0 && !g.listing.dirs['~/nope'] && g.listing.nondirs['~/code/ir-dashboard/notes.txt'] === true, [ird, g.listing.nondirs]);
  ok('self = the checkout the server runs from + its data dir + ~/vibespace (package.json names vibespace)', g.self.roots.includes(REPO) && g.self.roots.includes(path.join(REPO, 'data')) && g.self.roots.includes(path.join(HOME, 'vibespace')), g.self.roots);
  const legacy = await get(`/api/dir-complete?path=${encodeURIComponent(HOME + '/wo')}`);
  ok('a caller sending none of the new params gets the old shape (suggestions only)', JSON.stringify(Object.keys(legacy)) === '["suggestions"]' && legacy.suggestions.includes(path.join(HOME, 'work')), legacy);
  const both = await ask(HOME + '/wo');
  ok('…and the new answer still carries suggestions (the same folders)', both.suggestions.includes(path.join(HOME, 'work')), both.suggestions);
  const fl = await ask('~/work/investor-relations/共享资料/', { kind: 'file' });
  ok('kind=file lists the files (name, size, mtime)', (fl.listing.dirs['~/work/investor-relations/共享资料'] || {}).files?.length === 4, fl.listing.dirs['~/work/investor-relations/共享资料']);
}

console.log('\n── ② never offered unasked: the product\'s own checkout (ADDENDUM) ──');
{
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
}

console.log('\n── ③ the 500 ms budget (a stalled walk) ──');
{
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
}

console.log('\n── ③b the hung source and the slow one (B-0f3d, kept) · ③c THE FOURTH SHAPE (B-d833) ──');
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
      if ((o.blocked || []).some((b) => underP(at, b))) throw Object.assign(new Error('The owner blocked this storage.'), { status: 503, code: 'mount_blocked' });
      const first = reachOf(run, op, p);
      if ((o.blocked || []).some((b) => first.seen.some((q) => underP(q, b)))) fn.blockedReached++;
      const d = (o.dead || []).find((x) => first.seen.some((q) => underP(q, x.path)));
      if (d) { fn.touched++; fn.touchedAt[d.path] = (fn.touchedAt[d.path] || 0) + 1; fn.touchLog.push({ op, at, dead: d.path }); const v = await d.g.p; if (v instanceof Error) throw v; return run(op, p).result; }
      if (o.slow) { const ms = o.slow(op, p); if (ms) await sleep(ms); }
      if (first.err) throw first.err;
      return first.res.result;
    } finally { fn.out--; }
  }; fn.rec = rec; fn.touched = 0; fn.touchedAt = {}; fn.touchLog = []; fn.blockedReached = 0; fn.out = 0; fn.maxOut = 0; return fn; };
  const mkDS = (D, call, now) => D.create({ home: HOME, repoDir: REPO, call, ...(now ? { now } : {}) });
  const DSsrc = read('src/server/dir-slice.js'), M = mutantCopies('dir-complete-d833s4', REPO);
  const mutant = (name, pairs) => M.load('src/server/dir-slice.js', pairs.reduce((src, [a, b, what]) => anchored(src, a, b, what), DSsrc), name);
  const into = (rec, dir) => rec.filter((x) => { const q = x.slice(x.indexOf(':') + 1); return q === dir || q.startsWith(dir + '/'); });
  const deadlineOf = () => Object.assign(new Error('Storage not responding (operation timed out).'), { status: 503, safeFsTimeout: true });
  const IR = path.join(HOME, 'work', 'investor-relations'), WORK = path.join(HOME, 'work');
  const STALE = path.join(TMP, 'stale-share'); fs.mkdirSync(path.join(STALE, 'a', 'b'), { recursive: true });

  // B-d833's REMAINDER (2.369.414 shipped SafeFs `idleOnly`; the field now rides it): A HEALTHY FOLDER'S CHECK NEVER WAITS BEHIND A HUNG,
  // SLOWER CALL — the REAL pool (one worker, short deadlines) held by a placed stall (the worker's `__sleep`, the stand-in for a hung
  // listing: no mount of any kind); the field asks a healthy folder (~/work) while the worker is held, then again once the stall ended.
  // RED CONTROL: the field's calls as on the release (no idleOnly) — the check waits in the held worker, runs out its own deadline and
  // the folder is MARKED dead for 30 s (asked again: skipped)
  {
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
    const cure = await idleRun(DS, 'dir-complete-idle');
    ok('B-d833 remainder: a healthy folder asked while the one worker is held by a hung, slower call is answered LATE at its reply\'s bound (refused by the pool and asked again while no worker freed — never sent into the held worker) — and asked once the stall ended, it EXISTS (never marked dead)', cure.a === 'late' && cure.b === 'exists' && !cure.bUnread, cure);
    const rel = await idleRun(mutant('d833-idle-out', [["const IDLE_ONLY = Object.freeze({ idleOnly: true });", 'const IDLE_ONLY = undefined;', 'the field\'s calls as on the release (no idleOnly)']]), 'dir-complete-idle-out');
    // (the release's pool, B-23e5: the call whose deadline ends the held worker is the one MARKED; its siblings queued in that worker are
    // ended «storage worker restarted», unmarked — so the mark lands on whichever of the field's calls the slice sent first: the line's
    // ~/work, or the home's listing for its rows. Either is a HEALTHY folder marked dead behind a hung call: the fault)
    ok(`RED CONTROL: the field's calls as on the release — the healthy folder's check waited in the held worker (${rel.a}), ran out its own deadline, and asked again a healthy folder of the field is answered from its own mark (dead for 30 s): ~/work ${rel.b}, the home's rows ${rel.bUnread ? 'COULD NOT BE READ' : 'read'}`, rel.a === 'late' && (rel.b === 'skipped' || (rel.bUnread && rel.bSources.includes(HOME))), rel);
  }
  // M1, FOLDED INTO B-d833's REMAINDER (lane bl-chat-c's fresh read; the coordinator's r1507): A BUSY POOL IS NOT A DEAD FOLDER. The REAL
  // pool (one worker) kept busy by SHORT calls (the worker's `__sleep`, 60 ms each with a 60 ms gap — a Files window's ordinary work):
  // the field's healthy folder is ASKED AGAIN until the worker frees and answered inside its bound (exists); a person's PRESS the same
  // (law iii); a field whose page aborted stops asking (law i: no re-ask after its signal); every re-ask counted (law ii, stats()).
  // RED CONTROL: idleOnly alone (3b79c841b — a refusal answered LATE at once)
  {
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
    const [m1, m1c] = await Promise.all([busyRun(DS, 'dir-complete-busy'), busyRun(mutant('d833-m1-at-once', [["if ((signal && signal.aborted) || !(Date.now() + REASK_MS <= boundAt)) {", 'if (true) {', 'a refusal answered LATE at once (idleOnly alone)']]), 'dir-complete-busy-at-once')]);
    ok(`B-d833 M1: a pool kept busy by short calls — the field's healthy folder is asked again until the worker frees and EXISTS inside its bound (typed: ${m1.typed}); a person's PRESS the same (${m1.pressed}); counted: ${JSON.stringify(m1.busy)}`,
      m1.typed === 'exists' && m1.pressed === 'exists' && m1.busy.reasked > 0 && m1.busy.freed > 0, m1);
    ok(`B-d833 M1: the waiting ends WITH ITS FIELD — the page aborted: no re-ask after its signal (${m1.abort.before} before, ${m1.abort.r1} → ${m1.abort.r2} after), the reply late (${m1.abort.kind}), counted late`,
      m1.abort.before > 0 && m1.abort.r2 === m1.abort.r1 && m1.abort.kind === 'late' && m1.abort.late > 0, m1.abort);
    ok(`RED CONTROL: idleOnly alone (3b79c841b) — a busy pool answers a healthy folder LATE (typed: ${m1c.typed}, pressed: ${m1c.pressed})`, m1c.typed === 'late' || m1c.pressed === 'late', m1c);
  }

  // ③b (B-0f3d, kept): a hung PROBE (a Task Group's folder on a dead mount) never holds the typed text — judged by its own stat
  {
    const g = hold(), c1 = standIn({ dead: [{ path: IR, g }] }), ds = mkDS(DS, c1);
    const a = await ds.slice({ text: '~/work/payments', bases: ['~'], probe: ['~/work/investor-relations'], budgetMs: 150 });
    ok('③b a hung probe: the typed text is still judged («exists» by its own stat), only the probe named late — the field marks it nothing', a.partial === false && a.verdict.kind === 'exists' && JSON.stringify(a.probesLate) === JSON.stringify(['~/work/investor-relations']), { partial: a.partial, verdict: a.verdict, probesLate: a.probesLate });
    c1.rec.length = 0;
    const b = await ds.slice({ text: '~/code/ir', bases: ['~'], probe: ['~/work/investor-relations', '~/work/investor-relations/测试'], budgetMs: 150 });
    ok('③b …the next ask sends NO call into the hung folder: its probe still out is JOINED, a name row under it waits for its chain (the folder itself)', into(c1.rec, IR).length === 0 && ['~/work/investor-relations', '~/work/investor-relations/测试'].every((x) => (b.probesLate || []).includes(x)), { rec: into(c1.rec, IR), probesLate: b.probesLate });
    g.open();
  }
  {
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
    const NOJOIN = mutant('s4-nojoin', [['    if (s0 && s0.hungAt == null && t - s0.at < PROBE_LATE_MS) return s0.p;\n', '', 'a call still out sent again']]);
    const NOLAND = mutant('s4-noland', [['    const t = now(), l = landed.get(a);\n    if (!l ||', '    const t = now(), l = null;\n    if (!l ||', 'the kept facts never used']]);
    const EXPIRE = mutant('s4-expire', [['    if (!l || t - l.at >= PROBE_LATE_MS || !(t - l.at < LANDED_FRESH_MS || l.late)) return null;', '    if (!l || t - l.at >= LANDED_FRESH_MS) return null;', 'kept facts dropped after 2 s']]);
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
    const [one, two] = await Promise.all([twoAsks(DS), twoAsks(NOJOIN)]);
    ok(`③b two asks inside the first budget: ${one} call for the slow path (the second joins the call SENT) — CONTROL never joined: ${two}`, one === 1 && two === 2, { one, two });
    const leaves = async (D2) => mkDS(D2, async (op, p) => { const r = (await runOp(op, p)).result; if (op === 'dirSlice' && (p.probes || []).includes(IR)) r.probes = r.probes.filter((f) => f.path !== IR); return r; }).slice({ text: '~/work/payments', bases: ['~'], probe: ['~/work/investor-relations'], budgetMs: 450 });
    const lo = await leaves(DS), loC = await leaves(mutant('s4-answered', [[" || (r && 'ok' in r && !r.ok)) state.set(a, 'late');", ") state.set(a, 'late');", 'a probe left out read as answered']]));
    ok('③b a probe the ANSWER leaves out is named late (the field marks it nothing — no 新建 for a folder nobody stated) — CONTROL: read as answered', (lo.probesLate || []).includes('~/work/investor-relations') && !(loC.probesLate || []).includes('~/work/investor-relations'), { real: lo.probesLate, control: loC.probesLate });
    // A FAST PATH IS NEVER SERVED STALE: a probe that answers inside its budget is asked afresh past 2 s — a folder made in a terminal between
    // two asks is seen; only a path whose last call went LATE is served its kept fact. CONTROL: every kept fact served for the whole window
    const fresh = async (D2) => { const tag = Math.random().toString(36).slice(2, 7), NEWP = path.join(HOME, 'work', 'made-later-' + tag), EXP = path.join(TMP, 'counted-' + tag); fs.mkdirSync(EXP); fs.writeFileSync(path.join(EXP, 'a.txt'), 'x'); let clock = Date.now(); const d = mkDS(D2, async (op, p) => (await runOp(op, p)).result, () => clock); const q = { text: '~/work/payments', bases: ['~'], probe: [PC.toTilde(HOME, NEWP), EXP], budgetMs: 450 }; await d.slice(q); fs.mkdirSync(NEWP); fs.writeFileSync(path.join(EXP, 'b.txt'), 'x'); clock += 2500; const r = await d.slice(q); const e = r.listing.dirs[PC.toTilde(HOME, NEWP)], x = r.listing.dirs[EXP]; return { made: !!(e && e.fileCount != null), count: x ? x.fileCount : null }; };
    const [fr, frC, frK] = await Promise.all([fresh(DS), fresh(mutant('s4-stale', [['    if (!l || t - l.at >= PROBE_LATE_MS || !(t - l.at < LANDED_FRESH_MS || l.late)) return null;', '    if (!l || t - l.at >= PROBE_LATE_MS) return null;', 'every kept fact served']])), fresh(mutant('s4-knownstale', [['    if (k && t - k.at < LIST_FRESH_MS) return Promise.resolve({ ok: k.stat });', '    if (k) return Promise.resolve({ ok: k.stat });', 'a stat served whatever its age']]))]);
    ok('③b a FAST path is never served stale: 2.5 s apart, a folder made between the asks is seen, and a probed folder that gained a file says so (asked afresh) — CONTROLS: every kept fact served (the old count), a stat served whatever its age (still «not there»)', fr.made && fr.count === 2 && frC.count === 1 && !frK.made, { real: fr, kept: frC, known: frK });
  }

  // ③c R-a: the line asks STATS ONLY — a new folder beside a DEAD KID is ABSENT (create offered), in ms; a prefix completes by NAMES; an
  // exact hit is literal. RED CONTROL: the line waiting for its parent's LISTING (it stats the dead kid) — late
  {
    const SH = path.join(WORK, 'share'); fs.mkdirSync(SH, { recursive: true });
    const run = async (D2) => { const g = hold(), d = mkDS(D2, standIn({ dead: [{ path: SH, g }] })); const r = { nw: await d.slice({ text: '~/work/q3-new', bases: ['~'], budgetMs: 150 }), pre: await d.slice({ text: '~/work/pay', bases: ['~'], budgetMs: 150 }), ex: await d.slice({ text: '~/work/payments', bases: ['~'], budgetMs: 150 }) }; g.open(); return r; };
    const a = await run(DS);
    ok('③c a new folder beside a DEAD KID (~/work/share): «absent», not partial — the create is offered; «~/work/pay» completes to ~/work/payments by the names (the one match stated under its own key — not literal); «~/work/payments» exists, literal', a.nw.verdict.kind === 'absent' && !a.nw.partial && a.pre.verdict.kind === 'exists' && a.pre.verdict.path === '~/work/payments' && a.pre.verdict.completed && !a.pre.verdict.literal && a.ex.verdict.kind === 'exists' && a.ex.verdict.literal === true, { nw: a.nw.verdict, pre: a.pre.verdict, ex: a.ex.verdict });
    const LISTED = mutant('s4-listed', [['    const ans = PC.lineAnswerOf(st, { files: o.files });', "    if (!st.exists) { const lr = await raceOf(listOne(path.dirname(a), { files: o.files, ...o }), o.untilSoft); if (lr === LATE || !lr || !lr.ok) return { path: c, answer: 'late', at: a }; }\n    const ans = PC.lineAnswerOf(st, { files: o.files });", 'the line waits for its parent\'s listing']]);
    const b = await run(LISTED);
    ok('③c RED CONTROL: the line waiting for its parent\'s LISTING — the new folder is LATE while the kid is dead (no folder there could ever be made)', b.nw.verdict.kind === 'late', b.nw.verdict);
  }
  // ③c R-c: EVERY CALL GOES DOWN ITS CHAIN, ONE KEY PER PATH — one dead folder meets ONE call whoever asks (the fresh read's M2): the
  // folder ITSELF typed (the line's own call), then texts under it (each level joined), a probe of it and one under it (row sources state
  // their folder first, the same key), and the rows' listing of the folder above (it names the dead kid, never states it). CONTROLS: without
  // the descent; the line's own call under a key of its own again; a listing with no skip
  {
    const run = async (D2) => { const g = hold(), c = standIn({ dead: [{ path: STALE, g }] }), d = mkDS(D2, c); for (const [t, pr] of [['', []], ['a/b/q3', [STALE]], ['a/b', [path.join(STALE, 'a')]], ['a', []], ['c/z', []]]) await d.slice({ text: t ? path.join(STALE, t) : STALE, bases: [], probe: pr, budgetMs: 50 }); const n = c.touched; g.open(); return n; };
    const [real, nod, keys, noskip] = await Promise.all([run(DS), run(mutant('s4-nodescent', [["      const d = await descend(a, 'line', o, false);", '      const d = null;', 'no descent']])), run(mutant('s4-linekey', [["      const own = () => once('stat:' + a, 'line', a,", "      const own = () => once('line:' + a, 'line', a,", 'the line\'s own call under its own key']])), run(mutant('s4-noskip', [['files, pkg, skip: skipNow(o.skipAlso) }', 'files, pkg, skip: [] }', 'a listing with no skip']]))]);
    ok(`③c one dead folder — typed itself, texts under it, a probe of it and under it, the listing above it: ${real} call met it — CONTROLS: no descent ${nod} (capped by the line's two slots) · the line's own key ${keys} · a listing with no skip ${noskip}`, real === 1 && nod >= 2 && keys >= 2 && noskip >= 2, { real, nod, keys, noskip });
  }
  // ③c THE ONE MATCH IS STATED UNDER ITS OWN NAME (the read of the fourth shape, 2026-11-20 11:34Z — its must): a dead mount is the only
  // entry of its folder starting with «n»; the person types «n», «na», «nas» one after another (each its own text). The worker answers
  // NAMES only; the hub states the one match through the level door, so: ONE call meets the dead folder, the line's two slots are never
  // both held, a healthy existing folder typed next is confirmed in its budget and a new one beside it is offered for creation; after the
  // deadline the MARK is on the dead folder (its whole name, then a longer prefix: no call). A BLOCKED mount's one match is never stated.
  // CONTROL (the in-worker stat of the one match, by name): the prefixes reach the dead folder each, both slots held, the blocked one stated
  {
    const NP = path.join(TMP, 'np-parent'), NM = path.join(NP, 'nas-mount'); fs.mkdirSync(NM, { recursive: true }); fs.mkdirSync(path.join(NP, 'work-ok'), { recursive: true });
    const Wsrc = read('src/safe-fs-worker.js'), WIN = mutantCopies('dir-complete-s4-inworker', REPO).load('src/safe-fs-worker.js', anchored(Wsrc, '      stat.names = hits.slice(0, 20);\n', '      stat.names = hits.slice(0, 20);\n      if (hits.length === 1) stat.one = bare(path.join(dir, hits[0]));\n', 'the in-worker stat of the one match'), 'w-inworker');
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
    const [real, ctl, bl, blC] = await Promise.all([typing(runOp), typing(WIN.runOp), blockedRun(runOp), blockedRun(WIN.runOp)]);
    ok(`③c «n», «na», «nas» typed toward a dead mount: ${real.met} LINE call met it (the rows' listing of the folder holding it: ${real.rows.join(' ') || 'none'} — the named cost of a dead kid nobody typed, B-5561), ${real.busy} line slot held; «work-ok» next: ${real.ok} (literal), «new-one»: ${real.nw} (its folder there — Create offered); after the deadline the whole name and a longer prefix: ${real.after} call («${real.whole}», «${real.longer}»)`, real.met === 1 && real.rows.every((x) => x === 'dirSlice:' + NP) && real.busy <= 1 && real.ok === 'exists' && real.okLit && real.nw === 'absent' && real.nwParent && real.after === 0 && real.whole === 'skipped' && real.longer === 'skipped', real);
    ok(`③c a BLOCKED mount the only match of «n»: never stated (${bl.reached} call reached it; the pool refused the hub's own call by its path) — CONTROLS the in-worker stat of the one match: ${ctl.met} calls met the dead mount with ${ctl.busy} line slots held, the blocked one reached ${blC.reached}×`, bl.reached === 0 && ctl.met >= 2 && ctl.busy === 2 && blC.reached >= 1, { real: bl, control: ctl, blockedControl: blC });
  }
  // ③c (the read's should 2) A PRESS KEEPS THE MARK until its own call is SENT: with both line slots held the press's call waits, and a
  // listing of the dead folder's parent built meanwhile (another text's rows) still skips it. CONTROL: the mark deleted at the press (that
  // listing states inside the dead folder)
  {
    // (X1 and X2 under their own folder: the first ask's listing of STALE's parent must not meet them — it would hold the rows' one slot)
    const X1 = path.join(TMP, 'xs', 'x1-dead'), X2 = path.join(TMP, 'xs', 'x2-dead'); fs.mkdirSync(X1, { recursive: true }); fs.mkdirSync(X2, { recursive: true });
    const gap = async (D2) => {
      const gS = hold(), g1 = hold(), g2 = hold(), c = standIn({ dead: [{ path: STALE, g: gS }, { path: X1, g: g1 }, { path: X2, g: g2 }] }), d = mkDS(D2, c);
      // (texts UNDER the dead folder first: nothing lists its parent before the gap — a listing kept 2 s would answer from memory)
      await d.slice({ text: path.join(STALE, 'x'), bases: [], budgetMs: 50 }); gS.open(deadlineOf()); await sleep(20);
      await d.slice({ text: path.join(X1, 'q'), bases: [], budgetMs: 50 }); await d.slice({ text: path.join(X2, 'q'), bases: [], budgetMs: 50 });
      // the press (under the dead folder) goes through its mark and its call WAITS for a line slot; then ANOTHER text beside the dead
      // folder lists their parent in that gap — the listing's skip must still hold the dead folder
      await d.slice({ text: path.join(STALE, 'b'), bases: [], budgetMs: 80, press: true });
      const n0 = c.touchedAt[STALE] || 0;
      await d.slice({ text: path.join(TMP, 'zz-gap'), bases: [], budgetMs: 150 });
      const n1 = c.touchedAt[STALE] || 0, held = d._counters.line.busy; g1.open(); g2.open(); return { during: n1 - n0, held };
    };
    const [gr, gc] = await Promise.all([gap(DS), gap(mutant('s4-pressdelete', [['pressed.set(m.path, t); return { through: m }; }', 'pressed.set(m.path, t); if (sent.get(m.key) === m) sent.delete(m.key); return null; }', 'the mark deleted at the press']]))]);
    ok(`③c a press waiting for a line slot keeps the dead folder's mark: the parent's listing meanwhile met it ${gr.during}× — CONTROL the mark deleted at the press: ${gc.during}×`, gr.during === 0 && gc.during >= 1, { real: gr, control: gc });
  }
  // ③c (the read of round wc9f6okda) THE WALK'S SKIP IS STABLE: a healthy base whose stat is still out (slow, 300 ms) is WALKED, and a
  // search asked twice inside the index's kept time makes ONE walk. CONTROL: calls still in flight in the walk's skip (the cache's name
  // differs at each ask — a second walk — and the first walk never entered the healthy base: no row for the folder under it)
  {
    const SB = path.join(HOME, 'work', 'slowbase-r138'); fs.mkdirSync(path.join(SB, 'deep', 'needle-q7r'), { recursive: true });   // (two levels down: the base's own listing names only «deep» — only the WALK finds the needle)
    const walkTwice = async (D2) => {
      const c = standIn({ slow: (op, p) => (op === 'pathStat' && p.path === SB ? 300 : 0) }), d = mkDS(D2, c), q = { text: 'needle q7r', q: 'needle q7r', bases: [SB, '~'], probe: [SB], budgetMs: 1500 };
      await d.slice({ text: SB, bases: [], budgetMs: 50 });   // (the base typed first: its own stat goes OUT and stays out 300 ms — SENT when the search's walk takes its skip)
      const r1 = await d.slice(q), r2 = await d.slice(q);
      return { walks: c.rec.filter((x) => x.startsWith('dirIndex:')).length, row1: !!r1.listing.dirs['~/work/slowbase-r138/deep/needle-q7r'], row2: !!r2.listing.dirs['~/work/slowbase-r138/deep/needle-q7r'] };
    };
    const [wr, wc] = await Promise.all([walkTwice(DS), walkTwice(mutant('s4-walkinflight', [['      const skip = [...new Set([...me.roots, ...mountPaths, ...marked])];', '      const skip = [...new Set([...me.roots, ...skipNow()])];', 'calls still in flight in the walk\'s skip']]))]);
    ok(`③c the walk's skip holds only what is stable: a search asked twice makes ${wr.walks} walk, and the folder under a healthy base whose stat was out is in the rows (${wr.row1}, ${wr.row2}) — CONTROL calls in flight in the walk's skip: ${wc.walks} walks, the first rows ${wc.row1 ? 'had' : 'MISSED'} it`, wr.walks === 1 && wr.row1 && wr.row2 && wc.walks === 2 && !wc.row1, { real: wr, control: wc });
  }
  // ③c (the fresh read's M3) A ROW CALL THE DEADLINE ENDED is not sent again inside its window: the listing of a folder holding a dead kid
  // nobody typed hangs ONCE, then the rows say they are still looking for 30 s (no call). CONTROL: its own mark ignored — sent again
  {
    const DK = path.join(TMP, 'dk-parent'), NAS = path.join(DK, 'nas'); fs.mkdirSync(NAS, { recursive: true });
    const run = async (D2) => { const g = hold(), c = standIn({ dead: [{ path: NAS, g }] }), d = mkDS(D2, c); await d.slice({ text: path.join(DK, 'x'), bases: [], budgetMs: 50 }); g.open(deadlineOf()); await sleep(10); const r2 = await d.slice({ text: path.join(DK, 'y'), bases: [], budgetMs: 150 }); return { lists: c.rec.filter((x) => x === 'dirSlice:' + DK).length, unread: !!r2.rowsUnread && (r2.sourcesUnread || []).includes(DK), verdict: r2.verdict && r2.verdict.kind }; };
    const [real, ctl] = await Promise.all([run(DS), run(mutant('s4-nomark', [['    if (s0 && s0 !== through && s0.hungAt != null && t - s0.hungAt < PROBE_LATE_MS) return Promise.resolve({ skipped: markEnd(s0), at: p });   // its OWN deadline mark: never sent again inside the window\n', '', 'a row call\'s own mark ignored'], ['      if (s1 && s1 !== through && s1.hungAt != null && t1 - s1.hungAt < PROBE_LATE_MS) { free(); return { skipped: markEnd(s1), at: p }; }\n', '', '…at its grant too']]))]);
    ok(`③c a listing the deadline ended (a dead kid nobody typed): ${real.lists} listing call in two asks, the rows say that folder COULD NOT BE READ (rowsUnread — never «no folders», never «still looking» for 30 s), the line still judges — CONTROL its own mark ignored: ${ctl.lists}`, real.lists === 1 && real.unread && real.verdict === 'absent' && ctl.lists === 2, { real, ctl });
  }
  // ③c R-b + R-d: four dead bases, a relative text — ONE line call into them (the first base; nothing after a late one is asked); then a
  // healthy absolute text is judged on the line's OWN slots while the rows' slot is held. CONTROLS: every candidate at once; one counter
  {
    const B4 = ['b1', 'b2', 'b3', 'b4'].map((n) => { const d = path.join(TMP, 'dead-' + n); fs.mkdirSync(d, { recursive: true }); return d; });
    const run = async (D2) => { const g = hold(), c = standIn({ dead: B4.map((b) => ({ path: b, g })) }), d = mkDS(D2, c); const r1 = await d.slice({ text: './q3', bases: [...B4, '~'], budgetMs: 50 }); const busy = d._counters.line.busy; const r2 = await d.slice({ text: '~/work/payments', bases: [...B4, '~'], budgetMs: 450 }); g.open(); return { r1, r2, busy, line: c.rec.filter((x) => B4.some((b) => x === 'pathStat:' + b || x.startsWith('pathStat:' + b + '/'))).length }; };
    // (the CONCURRENT mutant: every candidate's chain at once — a sequential one that only skips the stop never asks past the budget,
    // its next chain loses the race at its first level before any call)
    const [real, ALL, ONE] = await Promise.all([run(DS), run(mutant('s4-allatonce', [['      const out = [];\n      for (const x of cands) {\n', '      if (cands.length) return Promise.all(cands.map((x) => lineAnswer(x.c, x.a, o)));\n      const out = [];\n      for (const x of cands) {\n', 'every candidate asked at once']])), run(mutant('s4-onecounter', [['  const C = { line: { cap: LINE_SLOTS, busy: 0, q: [] }, rows: { cap: ROW_SLOTS, busy: 0, q: [] } };', '  const C0 = { cap: LINE_SLOTS, busy: 0, q: [] }; const C = { line: C0, rows: C0 };', 'one shared counter']]))]);   // (each its own slice and stand-in: at once)
    ok(`③c four dead bases + «./q3»: late on the FIRST base (named), ${real.busy} line slot held — at most the one candidate (0 when the rows' stat of that base went first and the line JOINED it); then «~/work/payments» judged in time on the line's own slots`, real.r1.verdict.kind === 'late' && real.r1.verdict.base === B4[0] && real.busy <= 1 && real.r2.verdict.kind === 'exists' && real.r2.partial === false, { r1: real.r1.verdict, line: real.line, r2: [real.r2.verdict, real.r2.partial] });
    ok(`③c RED CONTROLS: every candidate asked at once (${ALL.busy} line slots held) · ONE shared counter (the healthy text: ${ONE.r2.verdict && ONE.r2.verdict.kind})`, ALL.busy === 2 && ONE.r2.verdict.kind !== 'exists', { all: ALL.busy, one: ONE.r2.verdict });
  }
  // ③c R-i: a dead entrance ENDED by the pool's deadline — every source there answers «skipped» with the time its mark ends (no call); a
  // person's PRESS sends the entrance's one call once inside the window. CONTROL: without the press-through
  {
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
    const [real, ctl] = await Promise.all([run(DS), run(mutant('s4-nopress', [["    if (press && m.path === p && !(pa != null && t - pa < PROBE_LATE_MS)) {", '    if (false) {', 'no press-through']]))]);
    ok('③c a dead entrance ended by the pool\'s deadline: the next ask answers «skipped» with when it is asked again (no call); a PRESS goes through once — the mount is back: judged', real.sk.kind === 'skipped' && real.sk.retryIn > 0 && real.callsSkipped === 0 && real.pr.kind === 'exists', real);
    ok('③c RED CONTROL: without the press-through a press is answered from the mark alone — still «skipped»', ctl.pr.kind === 'skipped', ctl.pr);
    // ONCE PER WINDOW (the fresh read's S1): the pressed call meets the dead folder again and the deadline ends it — a second press inside
    // the window is answered from the mark (no call). CONTROL: the press remembered nowhere (every press goes through)
    const twice = async (D2) => { const g = hold(), c = standIn({ dead: [{ path: STALE, g }] }), d = mkDS(D2, c); const q = { text: path.join(STALE, 'b'), bases: [], budgetMs: 50 }; await d.slice(q); g.open(deadlineOf()); await sleep(10); await d.slice({ ...q, press: true }); await sleep(10); const n1 = c.touched; const p2 = await d.slice({ ...q, press: true }); return { second: c.touched - n1, kind: p2.verdict && p2.verdict.kind }; };
    const [t1, t2] = await Promise.all([twice(DS), twice(mutant('s4-everypress', [['    const pa = pressed.get(m.path);\n', '    const pa = null;\n', 'the press remembered nowhere']]))]);
    ok(`③c a press goes through ONCE per window: the second press after the pressed call hung again sends ${t1.second} call («${t1.kind}») — CONTROL remembered nowhere: ${t2.second}`, t1.second === 0 && t1.kind === 'skipped' && t2.second === 1, { real: t1, control: t2 });
  }
  // ③c R-d, THE COUNTERS UNDER ANY ORDER (the table's seeded law): random asks — dead folders typed and under them, healthy texts, dead
  // bases, probes into both — while the dead paths are released at random (as answers, or as the pool's deadline). After every ask no more
  // calls are out than LINE_SLOTS + ROW_SLOTS; when everything has landed both counters are 0 and nothing waits. CONTROL: a stall release
  // (a slot freed while its call is still out) — more calls out than the slots
  {
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
    const [real, ctl] = await Promise.all([Promise.all(SEEDS.map((sd) => law(DS, sd))), Promise.all(SEEDS.map((sd) => law(STALL, sd)))]);
    const worst = Math.max(...real.map((r) => r.worst)), worstC = Math.max(...ctl.map((r) => r.worst));
    ok(`③c R-d over ${SEEDS.length} seeded orders: at most ${worst} calls out (LINE_SLOTS + ROW_SLOTS = ${DS.LINE_SLOTS + DS.ROW_SLOTS}); every counter back to 0, nothing queued, once all landed — CONTROL a stall release: ${worstC} out`, worst <= DS.LINE_SLOTS + DS.ROW_SLOTS && real.every((r) => r.settled) && worstC > DS.LINE_SLOTS + DS.ROW_SLOTS, { worst, unsettled: real.filter((r) => !r.settled).length, worstC });
  }
  // ③c an absolute text UNDER THE HOME is judged in the ~ form (the fresh read's S4): the verdict's paths match the listing's keys — a file
  // typed absolutely reads «is a file», never «create it?». And EVERY base is a candidate (N5): with 44 bases and the home last, a folder only
  // the home holds still EXISTS. CONTROLS: the candidates absolute; the candidates cut at 40
  {
    // (主开发 r304: the fixture's file is notes.txt, never README.md — a bare root file name on a path.join line is that ROOT file to the
    // push gate's deriver, test-ci-gate-push: the root readme became a gate input)
    const ex = async (D2) => { const d = mkDS(D2, standIn()); const a = await d.slice({ text: path.join(HOME, 'work', 'payments'), bases: ['~'], budgetMs: 450 }); const f = await d.slice({ text: path.join(HOME, 'code', 'ir-dashboard', 'notes.txt'), bases: ['~'], budgetMs: 450 }); return { path: a.verdict && a.verdict.path, missing: f.verdict && f.verdict.missing && f.verdict.missing.path, file: !!f.listing.nondirs['~/code/ir-dashboard/notes.txt'] }; };
    const [tl, tlC] = await Promise.all([ex(DS), ex(mutant('s4-abs', [['return { c: PC.toTilde(home, a), a };', 'return { c, a };', 'the candidates absolute']]))]);
    ok('③c an absolute text under the home: «exists» as ~/work/payments; a file typed absolutely is where the listing names it a file (~/code/ir-dashboard/notes.txt) — CONTROL the candidates absolute: the keys never meet', tl.path === '~/work/payments' && tl.missing === '~/code/ir-dashboard/notes.txt' && tl.file && tlC.path !== '~/work/payments' && tlC.missing !== '~/code/ir-dashboard/notes.txt', { real: tl, control: tlC });
    const MANY = Array.from({ length: 44 }, (_, i) => { const d = path.join(TMP, 'many', 'b' + i); fs.mkdirSync(d, { recursive: true }); return d; });
    const many = async (D2) => (await mkDS(D2, standIn()).slice({ text: 'work', bases: [...MANY, '~'], budgetMs: 2000 })).verdict;
    const [mv, mvC] = await Promise.all([many(DS), many(mutant('s4-cut40', [['    const cands = PC.textCandidates(text, tAll).map(', '    const cands = PC.textCandidates(text, tAll.slice(0, 40)).map(', 'the candidates cut at 40']]))]);
    ok('③c 44 bases and the home last: «work» EXISTS (every base a candidate, asked one at a time) — CONTROL cut at 40: «absent» with the home never asked', mv && mv.kind === 'exists' && mv.path === '~/work' && mvC && mvC.kind === 'absent', { real: mv, control: mvC });
  }
  // ③c FAILED is the machine's own answer about the path (a loop of links: ELOOP), never «absent» — CONTROL: the worker reading every
  // failed stat as absent. A row source that did not answer marks the reply rowsLate (the list says «still looking», never «no match»)
  {
    const LOOP = path.join(TMP, 'loop-a'); try { fs.symlinkSync(LOOP, LOOP); } catch { }
    const r5 = await mkDS(DS, standIn()).slice({ text: LOOP, bases: [], budgetMs: 450 });
    const W0 = mutantCopies('dir-complete-s4-worker', REPO).load('src/safe-fs-worker.js', anchored(read('src/safe-fs-worker.js'), "function goneOf(e) { return e && (e.code === 'ENOENT' || e.code === 'ENOTDIR') ? {} : { err: String((e && (e.message || e.code)) || e).slice(0, 200) }; }", 'function goneOf() { return {}; }', 'every failed stat read as absent'), 'w0');
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
  }
  // THE FIELD'S SIDE: askedOf (late and failed probes marked nothing) · replyKind (skipped / failed) · THE ONE RESOLVER (model() reads the
  // verdict in hand; target, rankOf and Tab read model) — source pins with their controls
  const PFM = require('../src/path-field-model.js'), PCm = require('../src/path-candidates.js');
  const PF = read('src/lib/path-field.js');
  const mergeOf = (src) => { const i = src.indexOf('  function mergeReply(W, h, d, probe, key = null) {'), j = src.indexOf('\n  }\n', i); if (i < 0 || j < i) throw new Error('mergeReply moved'); return new Function('mergeListing', 't', 'askedOf', 'lateOf', `${src.slice(i, j + 4)}\nreturn mergeReply;`)(() => {}, (x) => x, PFM.askedOf, PFM.lateOf); };
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
}

console.log('\n── ④ the listing cache per folder, mtime invalidation ──');
{
  const DS = require('../src/server/dir-slice.js');
  let clock = 1e12; const calls = [];
  const ds = DS.create({ home: HOME, repoDir: REPO, now: () => clock, call: async (op, p) => { calls.push({ op, dirs: (p.dirs || []).map((d) => ({ path: d.path, known: d.known })) }); return (await runOp(op, p)).result; } });
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
}

console.log('\n── ⑤ the host rung with a FAKE machine (the real HostManager, its ssh rung run here) ──');
{
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
}

// ⑤b B-99b9 (the two asks on another machine — one hung source there never costs a healthy typed folder its listing) is its OWN fast
// suite since 主开发 r949: scripts/test-dir-slice-remote.mjs (this one keeps the fast bound)

console.log('\n── ⑦ a paired machine that CANNOT be reached: refused by name before any spawn, its stdin roads never an uncaught ──');
{
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
}

console.log('\n── ⑥ wiring pins ──');
{
  const fsr = read('src/routes/files.js'), ex = read('src/server/exit-routes.js'), hs = read('src/hosts.js'), sfsm = read('src/safe-fs.js');
  ok('files.js: /api/dir-complete answers the slice for bases / q / probe / kind, locally (dir-slice) and over ?host= (R.fs.dirSlice)', /const sliced = req\.query\.bases != null \|\| req\.query\.q != null/.test(fsr) && /R\.fs\.dirSlice\(R\.host,/.test(fsr) && /dirSliceOf\(req\)\.slice\(/.test(fsr), null);
  ok('files.js: /api/home-folders drops the excluded folders (isExcludedPath over self)', /isExcludedPath\(f\.path, self \|\| \{ home, roots: \[\] \}\)/.test(fsr), null);
  ok('exit-routes.js: /api/hosts/:id/dir-complete → hosts.dirSlice; recent-cwds answers COUNTS', /hosts\.dirSlice\(req\.params\.id,/.test(ex) && /recent: require\('\.\.\/path-candidates\.js'\)\.recentCounts\(sessions\)/.test(ex), null);
  ok('hosts.js: dirSlice runs ONE sh script (device runCmd first, the ssh rung otherwise) and sliceListing builds the answer', /async dirSlice\(id, \{ text = '', bases = \[\], probe = \[\], q = '', kind = 'folder', waitMs \} = \{\}/.test(hs) && /dm\.runCmd\('sh', \['-c', script\]/.test(hs) && /PC\.sliceListing\(\{ home, machine: id,/.test(hs), null);
  ok('SafeFs: dirSlice + dirIndex carry their deadlines (a stall is reclaimed, never answered on the loop)', /dirSlice: 15000, dirIndex: 15000/.test(sfsm), null);
}

console.log('\n── ⑦ B-5ce7 cure: a PARKED storage\'s folder is refused with ITS words and doors (the files router, for real) ──');
{
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
}
server.close();
console.log(`\n${n - bad}/${n} ok${bad ? ` — ${bad} BAD` : ''}`);
process.exit(bad ? 1 : 0);
