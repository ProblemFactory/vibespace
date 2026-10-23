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
//   ④ the listing cache per folder with mtime invalidation: a second ask < 2 s lists nothing again; later the worker is
//     asked with `known` and a same mtime answers `same` (no re-read); a new folder (a new mtime) is listed fresh
//   ⑤ the host rung with a FAKE machine (the real HostManager, its ssh rung stubbed to run the same sh here under a Mac's
//     HOME, uname = Darwin, mdls = the OS display names): the same listing for that machine — its home, a group folder
//     probed there (present) and one absent, the one declared for it (`h-mac::/…`), 文稿 for ~/Documents (an alias),
//     its index searched; the PURE rank gives the POC's remote ① (there · declared · absent «create?») and ② under each
//     group's folder THERE; recentCounts (GET /api/hosts/:id/recent-cwds) counts per folder, newest first
//   ⑥ wiring pins: the two routes take bases / q / probe / kind, the host route answers counts, SafeFs deadlines
// Run: node scripts/test-dir-complete.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
let bad = 0, n = 0;
const ok = (name, cond, got) => { n++; if (!cond) bad++; console.log(`${cond ? 'ok ' : 'BAD'} ${name}${cond ? '' : '  got ' + JSON.stringify(got).slice(0, 600)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dir-complete-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const HOME = path.join(TMP, 'home', 'me');
const mk = (rel, files = 0) => { const d = path.join(HOME, rel); fs.mkdirSync(d, { recursive: true }); for (let i = 0; i < files; i++) fs.writeFileSync(path.join(d, `f${i}.txt`), 'x'); return d; };
for (const [d, f] of [['work/investor-relations/Q3-董事会材料', 5], ['work/investor-relations/会议纪要', 3], ['work/investor-relations/草稿', 2], ['work/investor-relations/共享资料', 4], ['work/compute-deal/条款版本', 2], ['work/contracts', 23], ['work/payments/发票', 2], ['work/weekly-admin', 3], ['work/草稿', 2], ['code/ir-dashboard/src', 1], ['Downloads', 3], ['.config/vibespace', 1]]) mk(d, f);
fs.mkdirSync(path.join(HOME, 'code/ir-dashboard/.git')); fs.writeFileSync(path.join(HOME, 'code/ir-dashboard/README.md'), '#'); fs.writeFileSync(path.join(HOME, 'code/ir-dashboard/package.json'), '{"name":"ir-dashboard"}');
fs.symlinkSync(path.join(HOME, 'work/contracts'), path.join(HOME, '合同'));
/* the instance's own checkout in the home (a fresh pod): the folder with the MOST files, package.json names vibespace */
mk('vibespace/src', 60); fs.writeFileSync(path.join(HOME, 'vibespace/package.json'), JSON.stringify({ name: 'vibespace', version: '2.369.345' }));
process.env.HOME = HOME;

const PC = require('../src/path-candidates.js');
const { runOp } = require('../src/safe-fs-worker.js');
const express = require('express');
const app = express();
app.use(express.json());
const files = require('../src/routes/files.js');
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
  const g = await ask('', { probe: ['~/code/ir-dashboard', '~/nope', '~/code/ir-dashboard/README.md'] });
  const ird = g.listing.dirs['~/code/ir-dashboard'] || {};
  ok('probe = each folder\'s facts: exists + git + fileCount + mtime; a missing one is absent; a file is a nondir', ird.git === true && ird.fileCount === 2 && ird.mtime > 0 && !g.listing.dirs['~/nope'] && g.listing.nondirs['~/code/ir-dashboard/README.md'] === true, [ird, g.listing.nondirs]);
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

console.log('\n── ⑥ wiring pins ──');
{
  const fsr = read('src/routes/files.js'), ex = read('src/server/exit-routes.js'), hs = read('src/hosts.js'), sfsm = read('src/safe-fs.js');
  ok('files.js: /api/dir-complete answers the slice for bases / q / probe / kind, locally (dir-slice) and over ?host= (R.fs.dirSlice)', /const sliced = req\.query\.bases != null \|\| req\.query\.q != null/.test(fsr) && /R\.fs\.dirSlice\(R\.host,/.test(fsr) && /dirSliceOf\(req\)\.slice\(/.test(fsr), null);
  ok('files.js: /api/home-folders drops the excluded folders (isExcludedPath over self)', /isExcludedPath\(f\.path, self \|\| \{ home, roots: \[\] \}\)/.test(fsr), null);
  ok('exit-routes.js: /api/hosts/:id/dir-complete → hosts.dirSlice; recent-cwds answers COUNTS', /hosts\.dirSlice\(req\.params\.id,/.test(ex) && /recent: require\('\.\.\/path-candidates\.js'\)\.recentCounts\(sessions\)/.test(ex), null);
  ok('hosts.js: dirSlice runs ONE sh script (device runCmd first, the ssh rung otherwise) and sliceListing builds the answer', /async dirSlice\(id, \{ text = '', bases = \[\], probe = \[\], q = '', kind = 'folder' \} = \{\}/.test(hs) && /dm\.runCmd\('sh', \['-c', script\]/.test(hs) && /PC\.sliceListing\(\{ home: raw\.home, machine: id,/.test(hs), null);
  ok('SafeFs: dirSlice + dirIndex carry their deadlines (a stall is reclaimed, never answered on the loop)', /dirSlice: 15000, dirIndex: 15000/.test(sfsm), null);
}

server.close();
console.log(`\n${n - bad}/${n} ok${bad ? ` — ${bad} BAD` : ''}`);
process.exit(bad ? 1 : 0);
