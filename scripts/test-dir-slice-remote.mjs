#!/usr/bin/env node
// THE PATH FIELD ON ANOTHER MACHINE: ONE HUNG SOURCE THERE NEVER COSTS A HEALTHY TYPED FOLDER ITS LISTING (B-99b9, lane bl-machines-b;
// 主开发 r826 THE SMALLER SHAPE, r880, r949 — moved out of test-dir-complete ⑤b so that suite keeps the fast bound). Fast, in-process:
//   ① THE TWO ASKS on the field's own road — exit-routes' real GET /api/hosts/:id/dir-complete handler (its create, a recording app) over
//     the real HostManager, its ssh rung stubbed to run the SAME sh script here under a temp HOME with PLACED stalls (a process that
//     ignores TERM and sleeps, its pid recorded, ended by this suite): the healthy typed folder listed while a base and a probe hang —
//     judged by the ORDER (it lands while the hung run is still out, and the next ask serves it; 主开发 r2574: never a wall-clock bound;
//     r2691: the same for ②, ③, the base-relative ask and the link-reached file ask — each waits on its landing, ends its own stall;
//     r2789: ④'s slow folder and ⑦'s landing step too); a
//     mount point child by name only; links never followed (unchecked); / as /x; one typed ask a folder; the cap; slow is not hung; ten
//     asks one run; a hung typed folder marked 30 s; the rest's hold doubling; (r949) a child's marker file never read through a link;
//     THE MOUNT TEST COMPARES REAL PATHS (a typed folder reached through a link whose real child is a mount point lands; the home's walk
//     prunes by the home's real path) — each with its RED CONTROL where a mechanism can be cut
//   ② (r949 MUST 1) THE DRAWN ROW of an unchecked link — its words «A link to {target} — not checked», the LINK icon (never the folder's),
//     its tooltip — and the drawn words of a list that did not finish (held, capped, unread, late) and of a probe the HELD rest did not
//     ask; the page's wiring to them pinned — RED CONTROL: the drawing as it was (the chip's case and the icon cut: «Folder», a folder)
//   ③ (r949 MUST 2) A HANG IS TOLD BY THE RUN'S OWN FACTS, never by its words — the REAL _ssh over a stand-in ssh on PATH: a run killed at
//     its bound that wrote ONE line on its error stream is a hang (marked, held, no new run); ssh's own connect failure whose words say
//     «timed out» is a refusal (nothing marked); the device road: no answer by the hub's own bound, or the machine's own bound
//     (`timedOut`), is a hang, a named refusal is not — RED CONTROL: a copy of hosts.js with the rejection's facts dropped and the old
//     words test (the killed run counted as a refusal, the connect failure as a hang)
// Run: node scripts/test-dir-slice-remote.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
let bad = 0, n = 0;
const ok = (name, cond, got) => { if (typeof name !== 'string' || name === '' || typeof cond !== 'boolean') throw new TypeError(`ok(name, cond): «${String(name).slice(0, 80)}» — the condition is a ${cond === null ? 'null' : typeof cond}, not a boolean (or the arguments are swapped)`); n++; if (!cond) bad++; console.log(`${cond ? 'ok ' : 'BAD'} ${name}${cond ? '' : '  got ' + JSON.stringify(got).slice(0, 600)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(20); return cond(); };   // the condition, not a clock
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dir-slice-remote-'));

console.log('\n── ① THE TWO ASKS on the field\'s own road: one hung source there never costs a healthy typed folder its listing — the state in the hub ──');
{
  const DSS = require('../src/dir-slice-script.js');
  const { HostManager } = require('../src/hosts.js');
  const MH = path.join(TMP, 'fake99', 'home', 'me');
  for (const d of ['work/healthy/inside', 'work/sub/kid2', 'net/a', 'net/inner', 'net/sub', 'dead/sub', 'slow/kid', 'slow2/kid', 'lost', 'tools', 'hop1x', 'b1/x', 'b2/x', 'b3/x', 'b4/x', 'b5/x', 'b6/x', 'real', 'pkgl']) fs.mkdirSync(path.join(MH, d), { recursive: true });
  fs.writeFileSync(path.join(MH, 'tools', 'deploy.sh'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(MH, 'net', 'package.json'), '{ "name": "vibespace" }');   // a test of the mount child would READ this (the release did)
  fs.symlinkSync('../hop1', path.join(MH, 'work', 'two')); fs.symlinkSync('net/inner', path.join(MH, 'hop1'));   // a two-hop link into the stalled mount
  fs.symlinkSync('../tools/deploy.sh', path.join(MH, 'work', 'deploy')); fs.symlinkSync('../nowhere/x', path.join(MH, 'work', 'gone'));   // a link to a FILE, a DANGLING link
  fs.writeFileSync(path.join(MH, 'real', 'stallm'), 'x'); fs.symlinkSync('real', path.join(MH, 'viaw'));   // (r949) a typed folder reached through a link: its child a mount point by its REAL path (planted below)
  fs.symlinkSync('../tools/deploy.sh', path.join(MH, 'pkgl', 'package.json'));   // (r949) a link named like a child's marker file
  const REALMH = fs.realpathSync(MH);   // the machine's table holds REAL paths
  const PL = path.join(TMP, 'planted99.pids'), NOSTALL = path.join(TMP, 'nostall99');
  // THE PLACED STALL (never load): a process that IGNORES TERM and sleeps — the stand-in for one stuck in the kernel on a dead mount (no
  // one can end it); its pid to a file, so the leg counts what stayed and ends exactly those. ~/net is planted as a MOUNT POINT of that
  // machine (its table read, as the script reads it); everything under it, ~/dead and ~/lost stall; a fake grep stalls on the mount's
  // package.json — reached ONLY by a test of the mount child, which the script must not make
  const STALL = `{ [ -e "${NOSTALL}" ] || sh -c 'trap "" TERM; echo $$ >> "$VS_PL"; [ -z "$VS_PL_RUN" ] || echo $$ >> "$VS_PL_RUN"; exec sleep 300'; }`;   // r2909: a run's own mark too (VS_PL_RUN), when its harness asks it
  const FB = path.join(TMP, 'fakebin99'); fs.mkdirSync(FB);
  const realGrep = ['/usr/bin/grep', '/bin/grep'].find((p) => fs.existsSync(p));
  fs.writeFileSync(path.join(FB, 'grep'), `#!/bin/sh\nfor a; do case "$a" in */net/package.json|*/pkgl/package.json) ${STALL};; esac; done\nexec ${realGrep} "$@"\n`, { mode: 0o755 });
  const realStat = ['/usr/bin/stat', '/bin/stat'].find((p) => fs.existsSync(p));   // (r949) a test of the mount child «stallm» (its stat) is the placed stall
  fs.writeFileSync(path.join(FB, 'stat'), `#!/bin/sh\nfor a; do case "$a" in */stallm) ${STALL};; esac; done\nexec ${realStat} "$@"\n`, { mode: 0o755 });
  const OVR = `ls1() { case "$1" in "$H"/net|"$H"/net/*|"$H"/dead|"$H"/dead/*) ${STALL};; "$H"/slow|"$H"/slow2) sleep 0.3; ls1_real "$@";; *) ls1_real "$@";; esac; }\npr() { case "$1" in "$H"/net/*|"$H"/lost) ${STALL};; *) pr_real "$@";; esac; }\n`;
  const INM = 'inm() { case "$NL$2$NL" in *"$NL$1$NL"*) return 0;; esac; return 1; }';
  const plant = (script, { mount = true } = {}) => anchored(anchored(anchored(script, '\nls1() {', '\nls1_real() {', 'B-99b9 the lister renamed'), '\npr() {', '\npr_real() {', 'B-99b9 the prober renamed'),
    INM, INM + (mount ? '\nMP="$MP$NL$H/net$NL' + REALMH + '/real/stallm"' : '') + '\n' + OVR, 'B-99b9 the plant after the mount table');
  const unwrap = (cmd) => { const m = /^exec sh -c '([\s\S]*)'$/.exec(cmd); return m ? m[1].split(`'\\''`).join("'") : cmd; };   // the ssh rung's plain-sh wrapper
  const WAITT = 200, runs = [];
  // the run's own bound there: 250 ms where a run must end at a bound; ⑥'s hung typed folder and ⑦'s hung rests END AT THEIR STALL (r2909:
  // shOf's atPlant — their counts and misses are those legs' facts, taken at that state); a NET of 20 s that judges nothing where a leg judges a healthy or slow run by its LANDING (r2574 / r2691 /
  // r2789: ④'s slow folder — 0.3 s, past the hub's 200 ms wait — and ⑦'s landing step, run while the no-stall mark is set)
  // h-99o (主开发 r2574): ① judges the ORDER — the healthy typed folder LANDS while the hung run is still OUT — so its runs carry a NET
  // of 20 s that judges nothing (a real sh and ls under twelve lanes read past the hub's own 200 ms wait once); the leg ends its own stall
  const NET20 = new Set(['h-99o', 'h-99a', 'h-99e', 'h-99g', 'h-99b']);   // r2691 / r2789: every host whose leg judges a healthy or slow typed run by its LANDING (①, ②, ③, the base-relative ask, the link-reached file ask, ④)
  const runtOf = (id) => (NET20.has(id) || (id === 'h-99d' && fs.existsSync(NOSTALL)) ? 20e3 : 250);   // their net twice the legs' 10 s landing wait: a hung run of theirs is surely still out then
  let runSeq = 0;
  // r2909 (主开发): a run of ⑥'s and ⑦'s hosts is ended at A STATE when it stalls — the moment its own stall is planted, seen by its
  // own mark (VS_PL_RUN) — never by a bound a loaded machine can outrun before it plants (then a count read one less); `atPlant` keeps the
  // 20 s net as its backstop. The end is a kill of its own child: the run's own facts say «killed», as at a bound
  const shOf = (script, timeout, { atPlant = false } = {}) => new Promise((resolve, reject) => {
    const mark = atPlant ? path.join(TMP, `run-${++runSeq}.pid`) : null;
    const c = execFile('sh', ['-c', script], { env: { HOME: MH, PATH: `${FB}:/usr/bin:/bin`, VS_PL: PL, ...(mark ? { VS_PL_RUN: mark } : {}) }, timeout, maxBuffer: 8 << 20 }, (e, out) => { if (iv) clearInterval(iv); return e ? reject(e) : resolve(out); });
    const iv = mark ? setInterval(() => { let t = ''; try { t = fs.readFileSync(mark, 'utf8'); } catch { } if (t.trim()) { clearInterval(iv); try { if (c.stdout) c.stdout.destroy(); if (c.stderr) c.stderr.destroy(); c.kill('SIGTERM'); } catch { } } }, 10) : null;   // its stall planted: the run ends there — its read: the pipes let go FIRST (the stall's sleep holds them, and execFile answers at their close), as execFile's own timeout and hosts.js's resolveAlias timer do
  });
  const mkHm = (id) => {
    const hm = new HostManager({ dataDir: path.join(TMP, 'hub-data-' + id) });
    hm._state.hosts.push({ id, name: 'nas-' + id, host: id + '.example.test', user: 'me', port: 22, transport: 'ssh' });
    hm.refuseUnreachable = async () => {};
    hm._clock = 1_800_000_000_000; hm._now = () => hm._clock;
    hm._ssh = (h, cmd) => { const sc = unwrap(cmd), r = { id: h.id, sc, plain: cmd.startsWith("exec sh -c '"), settled: false }; runs.push(r); let p; try { const atPlant = h.id === 'h-99c' || (h.id === 'h-99d' && !fs.existsSync(NOSTALL)); p = shOf(plant(sc), atPlant ? 20e3 : runtOf(h.id), { atPlant }); } catch (e) { r.settled = true; throw e; } p.then(() => { r.settled = true; }, () => { r.settled = true; }); return p; };   // the run's own bound there; `settled` — the run ended (r2574: ①'s order)
    return hm;
  };
  const alive = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return !/^\d+ \(.*\) [ZX]/.test(st) && fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('sleep'); } catch { return false; } };
  const planted = () => (fs.existsSync(PL) ? fs.readFileSync(PL, 'utf8').split('\n').filter(Boolean).map(Number) : []);
  const stuck = async () => { await sleep(20); return planted().filter(alive).length; };
  const until = async (cond, ms) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(20); return cond(); };   // the condition, not a clock
  const listed = (a, dir, kid) => !!(a && a.listing && a.listing.dirs[dir] && (a.listing.dirs[dir].kids || []).includes(kid));
  // THE FIELD'S OWN ROAD: the exit route GET /api/hosts/:id/dir-complete, its real handler (registered by exit-routes' own create)
  const ER = require('../src/server/exit-routes.js'), routes = new Map();
  const reg = (m) => (p, ...hs) => { if (typeof p === 'string' && hs.length) routes.set(m + ' ' + p, hs[hs.length - 1]); };
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : any()), apply: () => any() });
  const HMS = new Map(); const hmOf = (id) => HMS.get(id) || (HMS.set(id, mkHm(id)), HMS.get(id));
  const hostsP = new Proxy({}, { get: (t, k) => (k === 'dirSlice' ? (id, o, x) => hmOf(id).dirSlice(id, { ...o, waitMs: WAITT }, x) : (...a) => undefined) });
  let roadErr = null;
  try { ER.create({ app: new Proxy({ get: reg('GET'), post: reg('POST'), put: reg('PUT'), delete: reg('DELETE'), patch: reg('PATCH'), all: reg('ALL'), use: () => {}, locals: {} }, { get: (t, k) => (k in t ? t[k] : () => {}) }),
    rootDir: TMP, AGENT_BIN_DIR: TMP, activeSessions: new Map(), auth: any(), wss: null, WS_OPEN: 1, bcastAll: () => {}, integrationEnabled: () => false, unpairDialDevice: () => {}, hosts: hostsP,
    getExitProxy: () => null, getMounts: () => null, getPortForwards: () => null }); } catch (e) { roadErr = String((e && e.message) || e).slice(0, 200); }
  const DC = routes.get('GET /api/hosts/:id/dir-complete');
  const field = (id, text, bases = [], probe = [], kind = 'folder') => new Promise((resolve) => DC({ params: { id }, query: { path: text, bases: JSON.stringify(bases), probe: JSON.stringify(probe), q: '', kind }, headers: {} }, { json: resolve, status() { return this; } }));
  ok('B-99b9 the field\'s own road: exit-routes\' real GET /api/hosts/:id/dir-complete handler (its create, a recording app)', !roadErr && typeof DC === 'function', roadErr);
  try {
    // 1. THE ROW'S SENTENCE: a healthy TYPED folder with a base and a probe on the placed stall — listed, NOT partial
    // its read: the reply's own judge is the hub's 200 ms wait (both runs raced against it), so the first reply says only what had landed
    // by then; the leg waits on the healthy run's LANDING (a fact — load decides only how long, a 10 s wait inside the runs' 20 s net), reads the ORDER
    // there, and asks again: the kept landing is served while the hung run is still out (as ④ «slow is not hung» does)
    const C1 = () => hmOf('h-99o')._sliceCache.get('h-99o');
    const a1first = await field('h-99o', '~/work/healthy/', ['~/net/a'], ['~/lost']);
    const landed1 = await until(() => !!C1() && [...C1().r1.values()].some((e) => e.raw && e.raw.dirs.some((d) => d.path.endsWith('/work/healthy'))), 10e3);
    const hungOut = landed1 && runs.some((r) => r.id === 'h-99o' && r.sc.includes('lost') && !r.settled);   // THE ORDER: landed while the hung run is still OUT
    const a1 = await field('h-99o', '~/work/healthy/', ['~/net/a'], ['~/lost']);
    ok('B-99b9 THE ROW\'S SENTENCE: the healthy typed folder ~/work/healthy is LISTED and the reply is NOT partial while a base (~/net/a) and a probe (~/lost) hang there — the ORDER: it LANDED while the hung run was still out, and the next ask serves it (the hub replies at its own 200 ms wait; the leg waits on the landing, never a wall-clock bound on a real child, r2574); the rest is said late (rowsLate, probesLate), never «did not answer»',
      listed(a1, '~/work/healthy', 'inside') && a1.partial === false && a1.rowsLate === true && (a1.probesLate || []).includes('~/lost') && !a1.error && !a1.verdict && hungOut, { landed1, hungOut, firstPartial: a1first.partial, partial: a1.partial, rowsLate: a1.rowsLate, probesLate: a1.probesLate, dirs: Object.keys((a1.listing || {}).dirs || {}), error: a1.error });
    fs.writeFileSync(NOSTALL, '1');   // ①'s own stall ended: no new one, its sleeps by the pids they wrote, every run of that host's end awaited (a fact)
    const ended1 = await until(() => { for (const pid of planted()) { if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { } } } return runs.filter((r) => r.id === 'h-99o').every((r) => r.settled); }, 10e3);
    ok('B-99b9 ① ends its own stall: every run of its host ended before the next leg (no sleep of it left to plant another)', ended1, runs.filter((r) => r.id === 'h-99o' && !r.settled).length);
    if (ended1) fs.rmSync(NOSTALL, { force: true });   // a run still out keeps the mark: it plants nothing more
    // r2691: THE SAME SHAPE for every leg that judges a healthy typed run (主开发: wait on the landing, read the order, ask again, each
    // ending its own stall): the first reply is the hub's own 200 ms wait, so the leg waits on the LANDING of the typed folder whose raw
    // rows end with `dirEnds` (a fact in the hub's cache; load decides only how long, inside the host's 20 s net), reads THE ORDER where its
    // host has a hung run (`hungOf(script)`: landed while that run is still out), asks again and judges THAT reply (the landing kept, or a fresh
    // run's — ④ is the leg that proves keeping), and ends any stall of its own
    const seenDead = new Set();
    const landedAsk = async (id, ask, dirEnds, hungOf = null) => {
      const C = () => hmOf(id)._sliceCache.get(id);
      const first = await ask();
      const landed = await until(() => !!C() && [...C().r1.values()].some((e) => e.raw && e.raw.dirs.some((d) => d.path.endsWith(dirEnds))), 10e3);
      const hungOut = hungOf ? landed && runs.some((r) => r.id === id && hungOf(r.sc) && !r.settled) : true;   // read in the landing's own turn
      const again = await ask();
      fs.writeFileSync(NOSTALL, '1');   // its own stall ended: no new one, the sleeps by the pids they wrote, every run of its host ended — asserted by the leg
      const ended = await until(() => { for (const pid of planted()) { if (seenDead.has(pid)) continue; if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { } } else seenDead.add(pid); } return runs.filter((r) => r.id === id).every((r) => r.settled); }, 10e3);   // its read: a pid seen dead is never signalled again (a reused number)
      if (ended) fs.rmSync(NOSTALL, { force: true });   // a run still out keeps the mark: it plants nothing more
      return { first, again, landed, hungOut, ended, firstPartial: first && first.partial };
    };
    const PC2 = require('../src/path-candidates.js'), ask1 = PC2.sliceAsk('~/work/healthy/', [{ path: '~/net/a' }]);
    const oneScript = plant(DSS.sliceScript({ list: ask1.list, probes: ['~/lost'] }));
    const rel = await shOf(oneScript, 600).then((o) => ({ out: o }), (e) => ({ killed: !!(e && e.killed), out: String((e && e.stdout) || '') }));
    ok('RED CONTROL: TODAY\'S ONE SCRIPT (the typed folder, the bases and the probes in one run) under the same stall never ends (killed at 600 ms, no VS-SLICE-END): the release\'s reply could not list the healthy folder',
      rel.killed === true && !String(rel.out).includes('VS-SLICE-END'), { killed: rel.killed });
    // 2. THE MOUNT CHILD BY NAME: the typed home lists ~/net (a planted mount point of that machine) by name only — never tested
    const L2 = await landedAsk('h-99a', () => field('h-99a', '~/'), path.join('fake99', 'home', 'me')), a2 = L2.again;   // r2691: the landing, then the kept answer
    ok('B-99b9 a mount point child of the typed home is listed BY NAME ONLY: the home listing lands (net and work in it), not partial — the mount\'s own package.json is never read',
      listed(a2, '~', 'net') && listed(a2, '~', 'work') && a2.partial === false && L2.landed && L2.ended, { landed: L2.landed, ended: L2.ended, firstPartial: L2.firstPartial, partial: a2.partial, kids: ((a2.listing || {}).dirs || {})['~'] });
    const tested = await shOf(plant(DSS.sliceScript({ list: ['~'], files: false }), { mount: false }), 600).then(() => ({ killed: false }), (e) => ({ killed: !!(e && e.killed) }));
    ok('RED CONTROL: the same home listing with ~/net NOT in the machine\'s mount table (so tested, as the release tested every child) stalls on that test', tested.killed, tested);
    // 2b. (r949) A CHILD'S OWN MARKER FILES ARE NEVER READ THROUGH A LINK named like them: ~/pkgl/package.json is a link (the fake grep
    // stalls on it — only a read through that link reaches it); the home listing ends
    const homeScript = DSS.sliceScript({ list: ['~'], files: false });
    const [pk0, pk] = await Promise.all([
      shOf(plant(homeScript), 3000).then((o) => ({ done: DSS.parseSlice(o).done }), (e) => ({ killed: !!(e && e.killed) })),
      shOf(plant(anchored(homeScript, '[ ! -L "$e/package.json" ] && ', '', 'B-99b9 the marker link followed')), 600).then(() => ({ killed: false }), (e) => ({ killed: !!(e && e.killed) })),
    ]);
    ok('B-99b9 (r949) a child\'s marker file is never read THROUGH A LINK named like it (~/pkgl/package.json): the home listing ends — RED CONTROL: the link followed (the release\'s road) stalls on it, killed at 600 ms',
      pk0.done === true && pk.killed === true, { pk0, pk });
    // 3. A LINK NEVER FOLLOWED: ~/work/two → ../hop1 → net/inner (into the stalled mount): the parent listing lands, the link by its target as written
    const L3 = await landedAsk('h-99a', () => field('h-99a', '~/work/'), path.join('home', 'me', 'work')), a3 = L3.again;   // r2691
    const UC = (a3.listing || {}).unchecked || {}, LK = (a3.listing || {}).links || {}, D3 = (a3.listing || {}).dirs || {};
    ok('B-99b9 (主开发 r880) a link to a FILE, a DANGLING link and a two-hop link INTO THE STALL: none tested, none followed, none hangs ~/work (it lands, not partial); each is UNCHECKED with its target as written — never a folder, never a stub of its target',
      L3.landed && L3.ended && listed(a3, '~/work', 'healthy') && a3.partial === false && UC['~/work/two'] === '~/hop1' && UC['~/work/deploy'] === '~/tools/deploy.sh' && UC['~/work/gone'] === '~/nowhere/x'
        && !LK['~/work/two'] && !LK['~/work/deploy'] && !D3['~/tools/deploy.sh'] && !D3['~/nowhere/x'] && !D3['~/hop1'], { landed: L3.landed, ended: L3.ended, firstPartial: L3.firstPartial, partial: a3.partial, unchecked: UC, links: LK });
    const PCr = require('../src/path-candidates.js');
    const rows3 = PCr.rankCandidates('~/work/de', { listing: a3.listing, bases: [], machine: 'h-99a' }).sections.flatMap((x) => x.rows);
    const dep = rows3.find((r) => r.path === '~/work/deploy');
    ok('B-99b9 the unchecked link is a row of its own whose words say what it is («a link to ~/tools/deploy.sh — not checked»), never a folder row, never resolved (no check mark)',
      !!dep && dep.unchecked === true && !!dep.chip && dep.chip.key === 'unchecked' && dep.chip.params.target === '~/tools/deploy.sh', dep);
    const PCSRC = read('src/path-candidates.js'), MU = mutantCopies('dir-complete-unchecked', REPO);
    const stubbed = MU.load('src/path-candidates.js', anchored(PCSRC, "      if (k.link != null && k.unchecked) { unchecked(kid(d.path, k.name), k.link); continue; }   // B-99b9: never tested — never a folder\n", '', 'B-99b9 the unchecked road cut'), 'unchecked-cut');
    const L3r = stubbed.sliceListing({ home: MH, machine: 'h-99a', dirs: [{ path: path.join(MH, 'work'), exists: true, isDir: true, kids: [{ name: 'deploy', git: false, link: path.join(MH, 'tools', 'deploy.sh'), unchecked: true }] }] });
    ok('RED CONTROL: the road that made every link a folder (the unchecked branch cut) STUBS the file link\'s target as a folder (~/tools/deploy.sh in the dirs)', !!L3r.dirs['~/tools/deploy.sh'] && L3r.links['~/work/deploy'] === '~/tools/deploy.sh', Object.keys(L3r.dirs));
    // (M2) listing «/»: its children are /x (never //x), so the machine's own mount points directly under / are said by name only
    const rootOut = await shOf(DSS.sliceScript({ list: ['/'] }), 8000);
    const rootRow = DSS.parseSlice(rootOut).dirs.find((d) => d.path === '/') || { kids: [] };
    ok('B-99b9 listing / on that machine: /proc (a mount point in its own table) is a child said by NAME ONLY (flagged `mount`), never tested — the children are /x, never //x', rootRow.kids.some((k) => k.name === 'proc' && k.mount === true), rootRow.kids.filter((k) => k.mount).map((k) => k.name));
    // (M3) ONE TYPED ASK A TYPED FOLDER: a relative text against a healthy base and a dead one — the healthy one lands, NOT partial, the dead one said late
    const L3c = await landedAsk('h-99e', () => new Promise((resolve) => DC({ params: { id: 'h-99e' }, query: { path: 'sub/', bases: JSON.stringify(['~/work', '~/net']), probe: '[]', q: '', kind: 'folder' }, headers: {} }, { json: resolve, status() { return this; } })), path.join('home', 'me', 'work', 'sub'), (sc) => sc.includes('/net/sub')), a3c = L3c.again;   // r2691: the ORDER — ~/work/sub landed while ~/net/sub's run is still out
    ok('B-99b9 (主开发 r880) ONE TYPED ASK A FOLDER: «sub/» against ~/work (healthy) and ~/net (dead) — ~/work/sub LISTED, NOT partial, ~/net/sub said late (sourcesLate), no skipped verdict',
      listed(a3c, '~/work/sub', 'kid2') && a3c.partial === false && (a3c.sourcesLate || []).includes('~/net/sub') && !a3c.verdict && L3c.landed && L3c.hungOut && L3c.ended, { landed: L3c.landed, hungOut: L3c.hungOut, ended: L3c.ended, firstPartial: L3c.firstPartial, partial: a3c.partial, late: a3c.sourcesLate, verdict: a3c.verdict });
    // THE CAP: a text naming more typed folders than the cap asks the first SLICE_TYPED_CAP (the bases' order) and NAMES the rest unread
    const a3d = await new Promise((resolve) => DC({ params: { id: 'h-99f' }, query: { path: 'x/', bases: JSON.stringify(['~/b1', '~/b2', '~/b3', '~/b4', '~/b5', '~/b6']), probe: '[]', q: '', kind: 'folder' }, headers: {} }, { json: resolve, status() { return this; } }));
    const asked = runs.filter((r) => r.id === 'h-99f' && /ls1 "\$H"'\/b[0-9]\/x'/.test(r.sc)).length;
    ok(`B-99b9 THE CAP: «x/» against six bases asks ${asked} typed folders (the cap 4, the bases' order) and NAMES the two past it unread (rowsCapped 4, sourcesUnread ~/b5/x ~/b6/x), never dropped`,
      asked === 4 && a3d.rowsCapped === 4 && ['~/b5/x', '~/b6/x'].every((p) => (a3d.sourcesUnread || []).includes(p)), { asked, capped: a3d.rowsCapped, unread: a3d.sourcesUnread });
    // 4. SLOW IS NOT HUNG: a typed folder that lists in 0.3 s (past the hub's wait) — partial, never marked; its landing KEPT for the next ask
    const a4 = await field('h-99b', '~/slow/');
    const e4 = () => [...(hmOf('h-99b')._sliceCache.get('h-99b').r1.values())].find((e) => e.raw && e.raw.dirs.some((d) => d.path.endsWith('/slow')));
    const landed4 = await until(() => !!e4(), 10e3);   // r2789: the slow run's landing waited on as a fact (its run carries the net — never killed for being slow)
    const notHung4 = ![...hmOf('h-99b')._sliceCache.get('h-99b').hung.keys()].includes('~/slow');   // its read: «never marked» read off the hub's own hung marks
    const a4b = await field('h-99b', '~/slow/');
    ok('B-99b9 SLOW IS NOT HUNG: past the hub\'s wait the first reply is partial (no landed result, no «asked again» mark); the run lands, and the next ask serves it — not partial',
      a4.partial === true && landed4 && notHung4 && !a4b.verdict && listed(a4b, '~/slow', 'kid') && a4b.partial === false, { landed4, notHung4, a4: [a4.partial, a4.verdict], a4b: [a4b.partial, a4b.verdict] });
    // 5. TEN ASKS IN TWO SECONDS ARE ONE R1 (joined)
    const n0 = runs.filter((r) => r.id === 'h-99b' && r.sc.includes("ls1 \"$H\"'/slow2'")).length;
    await Promise.all(Array.from({ length: 10 }, (_, i) => sleep(i * 20).then(() => field('h-99b', '~/slow2/'))));
    const n1 = runs.filter((r) => r.id === 'h-99b' && r.sc.includes("ls1 \"$H\"'/slow2'")).length;
    ok(`B-99b9 ten asks for one typed folder within a second are ONE run there (${n1 - n0}): the run in flight is joined`, n1 - n0 === 1, { runs: n1 - n0 });
    // 6. A TYPED FOLDER THAT IS ITSELF HUNG: marked only when its run never lands by the run's own bound; 30 s, text under it too, no new run
    const deadRuns = () => runs.filter((r) => r.id === 'h-99c' && r.sc.includes("ls1 \"$H\"'/dead'")).length;
    const s0 = await stuck();
    await field('h-99c', '~/dead/');
    await until(() => [...(hmOf('h-99c')._sliceCache.get('h-99c').hung.keys())].includes('~/dead'), 20e3);   // its read: the mark comes when its run reached its stall — inside the net, never a short clock
    const a6 = await field('h-99c', '~/dead/'), a6b = await field('h-99c', '~/dead/sub/');
    const s1 = await stuck();
    hmOf('h-99c')._clock += 31e3; await field('h-99c', '~/dead/'); await until(() => deadRuns() >= 2, 2000);
    const ended6 = await until(() => runs.filter((r) => r.id === 'h-99c' && r.sc.includes("ls1 \"$H\"'/dead'")).every((r) => r.settled), 20e3);   // r2909: the second dead run ended AT ITS STALL — a state, never its bound's clock (inside the net)
    const s2 = await stuck();
    ok(`B-99b9 a HUNG typed folder: marked once its run never landed (the run's own bound); the reply says «asked again in ${a6.verdict && Math.round(a6.verdict.retryIn / 1000)} s» for it AND for text under it, with NO new run in the 30 s (runs ${deadRuns()}); after the mark one more — ONE stuck process a 30 s window (${s1 - s0}, then ${s2 - s0})`,
      a6.partial === true && !!a6.verdict && a6.verdict.kind === 'skipped' && a6.verdict.retryIn > 25e3 && !!a6b.verdict && a6b.verdict.kind === 'skipped' && s1 - s0 === 1 && s2 - s0 === 2 && deadRuns() === 2 && ended6, { a6: a6.verdict, a6b: a6b.verdict, runs: deadRuns(), ended6, s: [s0, s1, s2] });
    // 7. THE REST'S HOLD, DOUBLING: a rest that does not land holds that machine's rest 30 s, then 60 s, 120 s; a landing resets it — ONE stuck process a hold window
    const H7 = hmOf('h-99d'), r2Of = () => H7._sliceCache.get('h-99d').r2;
    const holdNext = async () => { await field('h-99d', '', ['~/net/a']); await until(() => !r2Of().p, 20e3); const a = await field('h-99d', '', ['~/net/a']); return a; };
    const t0s = await stuck();
    const h1 = await holdNext(); H7._clock += 31e3; const h2 = await holdNext(); H7._clock += 61e3; const h3 = await holdNext();
    const t1s = await stuck();
    fs.writeFileSync(NOSTALL, '1'); H7._clock += 121e3; await field('h-99d', '', ['~/net/a']); const stepEnded = await until(() => !r2Of().p, 10e3); fs.rmSync(NOSTALL, { force: true });   // r2789: the healthy rest's END waited on as a fact (its run, started under the mark, carries the net) — its landing is landedMiss === 0
    const landedMiss = r2Of().miss; H7._clock += 1e3; const h4 = await holdNext();
    ok(`B-99b9 THE REST'S HOLD: ${[h1, h2, h3, h4].map((a) => a.heldFor).join(' / ')} ms — 30 s, doubled to 60 s and 120 s on the misses in a row, back to 30 s after a landing; said «held» (rowsHeld), never partial; ONE stuck process a hold window (${t1s - t0s} for three)`,
      [h1, h2, h3, h4].every((a) => a.rowsHeld === true && a.partial === false) && h1.heldFor === 30e3 && h2.heldFor === 60e3 && h3.heldFor === 120e3 && stepEnded && landedMiss === 0 && h4.heldFor === 30e3 && t1s - t0s === 3,
      { held: [h1, h2, h3, h4].map((a) => [a.heldFor, a.rowsHeld, a.partial]), stepEnded, landedMiss, stuck: t1s - t0s });
    { const end7 = Date.now() + 3000; while (planted().some((pid) => !seenDead.has(pid) && alive(pid)) && Date.now() < end7) { for (const pid of planted()) { if (seenDead.has(pid)) continue; if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { } } else seenDead.add(pid); } await sleep(30); } }   // r2789: ⑦ ends every live placed stall (its own and the ones before it), by the pids they wrote
    // 8. (主开发 r949, RULED) THE MOUNT TEST COMPARES REAL PATHS — the machine's table holds real paths: ~/viaw is a LINK to ~/real,
    // whose child «stallm» the table names a mount point by its REAL path; a test of it (its stat, as a file field asks) is the placed
    // stall. The typed folder reached through the link LANDS, the child said by name only
    const L8 = await landedAsk('h-99g', () => field('h-99g', '~/viaw/', [], [], 'file'), '/viaw'), a8 = L8.again;   // r2691
    ok('B-99b9 (主开发 r949) a typed folder REACHED THROUGH A LINK (~/viaw → ~/real) whose real child is a mount point of that machine LANDS in a file field: the child listed by NAME ONLY (never tested — its stat is the placed stall), not partial',
      listed(a8, '~/viaw', 'stallm') && a8.partial === false && !a8.verdict && L8.landed && L8.ended, { landed: L8.landed, ended: L8.ended, firstPartial: L8.firstPartial, partial: a8.partial, verdict: a8.verdict, kids: (((a8.listing || {}).dirs || {})['~/viaw'] || {}).kids });
    const via = DSS.sliceScript({ list: ['~/viaw'], files: true });
    const viaRow = (out) => (DSS.parseSlice(out).dirs.find((d) => d.path === path.join(MH, 'viaw')) || { kids: [] }).kids.find((k) => k.name === 'stallm');
    const [r8, r8t] = await Promise.all([
      shOf(plant(via), 3000).then((o) => ({ row: viaRow(o) || null }), (e) => ({ killed: !!(e && e.killed) })),
      shOf(plant(anchored(via, ' || { [ "$rp" != "$p" ] && inm "$rp/$b" "$MP"; }', '', 'B-99b9 the textual compare')), 600).then((o) => ({ row: viaRow(o) || null }), (e) => ({ killed: !!(e && e.killed) })),
    ]);
    ok('…the run there says it as a MOUNT row (`mount`, by name) — RED CONTROL: the children compared only AS TYPED test it and stall (killed at 600 ms)', !!(r8.row && r8.row.mount === true) && r8t.killed === true, { r8, r8t });
    // 9. THE HOME'S WALK PRUNES BY THE HOME'S REAL PATH: a home under a linked folder (…/lnk/me, lnk → realp) whose mount point the table
    // names under the REAL home (…/realp/me/nas) — the walk's find is told to prune it AS THE WALK SPELLS IT (…/lnk/me/nas)
    const R9 = path.join(TMP, 'fake99r'); fs.mkdirSync(path.join(R9, 'realp', 'me', 'nas'), { recursive: true }); fs.symlinkSync('realp', path.join(R9, 'lnk'));
    const H9 = path.join(R9, 'lnk', 'me'), REC = path.join(TMP, 'find99.args'), FB9 = path.join(TMP, 'fakebin99f'); fs.mkdirSync(FB9);
    const realFind = ['/usr/bin/find', '/bin/find'].find((p) => fs.existsSync(p));
    fs.writeFileSync(path.join(FB9, 'find'), `#!/bin/sh\nprintf '%s\\n' "$@" -- >> '${REC}'\nexec ${realFind} "$@"\n`, { mode: 0o755 });   // records each call's arguments, then the real find
    const walk = DSS.sliceScript({ index: true }), plantNas = (s) => anchored(s, INM, INM + `\nMP="$MP$NL${fs.realpathSync(path.join(R9, 'realp'))}/me/nas"`, 'B-99b9 the real mount planted');
    const argsOf = async (s) => { fs.rmSync(REC, { force: true }); await new Promise((res) => execFile('sh', ['-c', s], { env: { HOME: H9, PATH: `${FB9}:/usr/bin:/bin` }, timeout: 5000 }, () => res())); return (fs.existsSync(REC) ? fs.readFileSync(REC, 'utf8') : '').split('\n--\n')[0].split('\n'); };
    const w9 = await argsOf(plantNas(walk)), w9t = await argsOf(plantNas(anchored(walk, `if [ "$RH" != "$H" ]; then case "$m" in "$RH"/*) printf '%s\\n' "$H\${m#"$RH"}";; esac; fi; `, '', 'B-99b9 the walk prunes by the typed home only')));
    ok('B-99b9 (主开发 r949) THE HOME\'S WALK PRUNES BY THE HOME\'S REAL PATH: a mount point the table names under the real home is pruned as the walk spells it (…/lnk/me/nas) — RED CONTROL: pruned by the typed home only, it is not',
      w9.includes(path.join(H9, 'nas')) && !w9t.includes(path.join(H9, 'nas')), { w9: w9.filter((a) => a.includes('nas')), w9t: w9t.filter((a) => a.includes('nas')) });
    ok('B-99b9 the ssh rung runs the script under PLAIN sh (`exec sh -c …`), never the login shell\'s prelude', runs.length > 0 && runs.every((r) => r.plain), runs.filter((r) => !r.plain).length);
  } finally {
    await sleep(80);
    // this leg's own stalls, known by their pid file and their sleep — killed at EVERY pass of the wait (B-1217: a stall a late background
    // run plants after a single kill pass lived out the wait on a loaded box; each pass now ends what is planted by then)
    const killPlanted = () => { for (const pid of planted()) { if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { } } } };
    fs.writeFileSync(NOSTALL, '1');   // its read: no run still out plants a stall after this wait
    killPlanted();
    const end = Date.now() + 3000; while (planted().some(alive) && Date.now() < end) { await sleep(30); killPlanted(); }
    ok('B-99b9 the leg ends its own planted stalls (none left)', !planted().some(alive), planted().filter(alive));
  }
}

console.log('\n── ② (主开发 r949 MUST 1) THE DRAWN ROW of an unchecked link — its words, an icon not the folder\'s, its tooltip; the drawn words of a list that did not finish and of a held probe ──');
{
  const PF = read('src/lib/path-field.js');
  const IC = await import(path.join(REPO, 'src/lib/icons.js'));
  const PC = require('../src/path-candidates.js'), PFM = require('../src/path-field-model.js');
  const tw = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, k2) => (p && p[k2] != null ? String(p[k2]) : m));   // the words, their slots filled (English)
  // the page's own drawing functions, cut from src/lib/path-field.js (chipText … rowsWords: pure over a row) — the page draws through them
  const drawOf = (src) => {
    const i = src.indexOf('function chipText(c) {'), j = src.indexOf('function aliasText(a) {', i);
    if (i < 0 || j < i) throw new Error('chipText … aliasText moved');
    return new Function('t', 'UI_ICONS', 'FILE_ICONS', 'getFileIcon', 'baseName', 'onWords', `${src.slice(i, j)}\nreturn { chipText, whyText, rowIcon: typeof rowIcon === 'function' ? rowIcon : null, rowTip: typeof rowTip === 'function' ? rowTip : null, rowsWords: typeof rowsWords === 'function' ? rowsWords : null };`)(
      tw, IC.UI_ICONS, IC.FILE_ICONS, () => '<file icon>', PC.baseName, () => '');
  };
  const L = PC.sliceListing({ home: '/h', machine: 'h-m', dirs: [{ path: '/h/work', exists: true, isDir: true, kids: [{ name: 'healthy', git: false }, { name: 'deploy', git: false, link: '/h/tools/deploy.sh', unchecked: true }] }] });
  const rows = PC.rankCandidates('~/work/de', { listing: L, bases: [], machine: 'h-m' }).sections.flatMap((x) => x.rows);
  const dep = rows.find((r) => r.path === '~/work/deploy'), folderRow = { path: '~/work/healthy', chip: { key: 'dir', params: {} } };
  const D = drawOf(PF), WORDS = 'A link to ~/tools/deploy.sh — not checked';
  const drawn = (X) => (dep ? { words: X.chipText(dep.chip), link: X.rowIcon ? X.rowIcon(dep) === IC.UI_ICONS.link : null, folder: X.rowIcon ? X.rowIcon(dep) === IC.FILE_ICONS.folder : null, tip: X.rowTip ? X.rowTip(dep) : null } : null);
  const d1 = drawn(D);
  ok(`B-99b9 (主开发 r949 MUST 1) the unchecked link's row is DRAWN as what it is: the words «${d1 && d1.words}», the LINK icon (never the folder's), the words under its path in the tooltip; a folder row keeps «Folder» and the folder icon`,
    !!d1 && d1.words === WORDS && d1.link === true && d1.folder === false && d1.tip === '~/work/deploy\n' + WORDS && D.chipText(folderRow.chip) === 'Folder' && D.rowIcon(folderRow) === IC.FILE_ICONS.folder, { d1, folder: D.chipText(folderRow.chip) });
  const TODAY = anchored(anchored(PF, "    case 'unchecked': return t('A link to {target} — not checked', { target: p.target }) + (p.relative ? ' · ' + t('relative to {base}', { base: p.relative }) : '');", '', 'B-99b9 the chip\'s case cut'),
    'r.unchecked ? UI_ICONS.link : ', '', 'B-99b9 the link icon cut');
  const d0 = drawn(drawOf(TODAY));
  ok('RED CONTROL: the drawing as it was (no chip case, no link icon) draws the unchecked link as «Folder» with the FOLDER icon', !!d0 && d0.words === 'Folder' && d0.folder === true, d0);
  const WIRE = [
    ['the list row\'s icon is rowIcon', 'const icon = !r.file && r.isNew ? UI_ICONS.plus : rowIcon(r);'],
    ['the list row\'s chip is chipText', '${escHtml(chipText(r.chip))}</span>`);'],
    ['the list row\'s tooltip is rowTip', 'const tip = rowTip(r);'],
    ['the picker row\'s icon is rowIcon', '${rowIcon(r)}<span class="pf-path">'],
    ['the empty list\'s words are rowsWords', "rowsWords(rowsNow(), t('No matching folder.'))"],
    ['the hint\'s words are rowsWords', "rowsWords(rowsNow(), t('Nothing found — try other letters, or press the folder button.'))"],
    ['the page names a held probe', '    for (const v of view) if (v.unknown && v.unknown.length) v.held = v.unknown.filter((f) => !(v.unsaid || []).includes(f) && !!(W.heldP && W.heldP.has(f)));'],
  ];
  const wired = (src) => WIRE.filter(([, s]) => src.split(s).length - 1 !== 1).map(([w]) => w);
  ok(`B-99b9 WIRING: the page draws every row and list word through them (${WIRE.length} sites, each once) — CONTROL: each site cut is seen`, wired(PF).length === 0 && WIRE.every(([w, s]) => wired(anchored(PF, s, '', w)).includes(w)), wired(PF));
  // THE DRAWN WORDS OF A LIST THAT DID NOT FINISH (the round's: no fast leg had them): held first, then capped, unread, late
  const HELD = 'Suggestions from this machine are held for a while — it was slow to list them; the folder you type still works';
  const RW = D.rowsWords;
  ok('B-99b9 the drawn words of a list that did not finish: the machine\'s rest HELD first, then «Only the first 4 folders this text names were asked», then unread, then late; a finished list keeps its own words',
    !!RW && RW({ held: true, capped: 4, unread: true, late: true }, 'END') === HELD && RW({ capped: 4, unread: true, late: true }, 'END') === 'Only the first 4 folders this text names were asked'
      && RW({ unread: true, late: true }, 'END') === 'Some folders here could not be read — the machine did not answer for them' && RW({ late: true }, 'END') === 'Still looking — this machine has not finished' && RW({}, 'END') === 'END',
    RW && [RW({ held: true, capped: 4 }, 'END'), RW({ capped: 4 }, 'END')]);
  const noHeldW = drawOf(anchored(PF, `R.held ? t('${HELD}') : `, '', 'B-99b9 the held words cut')).rowsWords;
  ok('RED CONTROL: without the held words a held rest is said as «the machine did not answer for them» (it was not asked)', noHeldW({ held: true, unread: true, late: true }, 'END') !== HELD, noHeldW({ held: true, unread: true, late: true }, 'END'));
  // A PROBE THE HELD REST DID NOT ASK (the round's: a probe row with nothing said): marked HELD by the reply, said on its row
  const mergeOf = (src) => { const i = src.indexOf('  function mergeReply(W, h, d, probe, key = null) {'), j = src.indexOf('\n  }\n', i); if (i < 0 || j < i) throw new Error('mergeReply moved'); return new Function('mergeInto', 't', 'askedOf', 'lateOf', `${src.slice(i, j + 4)}\nreturn mergeReply;`)(() => {}, (x) => x, PFM.askedOf, PFM.lateOf); };   // r4184: the block merges through mergeInto (the listing and its revision)
  const marks = (src, d, seed) => { const W = { L: { dirs: {} }, ...(seed || {}) }; mergeOf(src)(W, 'h-mac', d, ['~/x']); return { held: [...((W.heldP && W.heldP.keys()) || [])].join(), unsaid: [...((W.unsaid && W.unsaid.keys()) || [])].join() }; };
  const mH = marks(PF, { listing: { dirs: {} }, probesLate: ['~/x'], rowsHeld: true }), mL = marks(PF, { listing: { dirs: {} }, probesLate: ['~/x'] }), mA = marks(PF, { listing: { dirs: {} } }, { heldP: new Map([['~/x', 1]]) });
  const LG = PC.sliceListing({ home: '/h', machine: 'h-mac', dirs: [] });
  const rowOf = (g) => PC.rankCandidates('', { listing: LG, bases: [], machine: 'h-mac', groups: [g] }).sections.flatMap((x) => x.rows).find((r) => r.path === '~/x');
  const rH = rowOf({ name: 'G', folders: [], absent: [], unknown: ['~/x'], held: ['~/x'] });
  ok(`B-99b9 (r949) a probe the HELD rest did not ask is marked HELD (never «did not answer»), a later answer clears it, a plain late one is unsaid; its row says «${rH && rH.why ? D.whyText(rH.why) : '-'}»`,
    mH.held === '~/x' && mH.unsaid === '' && mL.held === '' && mL.unsaid === '~/x' && mA.held === '' && !!rH && rH.unsaid === true && rH.why.key === 'held' && D.whyText(rH.why) === 'h-mac was slow to answer — this folder is not asked for a while', { mH, mL, mA, rH });
  const noMark = marks(anchored(PF, 'if (late.has(p) && d && d.rowsHeld) W.heldP.set(p, Date.now()); else ', '', 'B-99b9 the held mark cut'), { listing: { dirs: {} }, probesLate: ['~/x'], rowsHeld: true });
  ok('RED CONTROL: the field without the held mark leaves that probe\'s row with nothing said', noMark.held === '' && noMark.unsaid === '', noMark);
}

console.log('\n── ③ (主开发 r949 MUST 2) A HANG IS TOLD BY THE RUN\'S OWN FACTS, never by its words — the REAL _ssh over a stand-in ssh, and the device road ──');
{
  const { HostManager } = require('../src/hosts.js');
  const HSRC = read('src/hosts.js');
  const BIN = path.join(TMP, 'sshbin'); fs.mkdirSync(BIN);
  // the stand-in ssh: it counts its runs, writes ONE line on its error stream (what a login's banner, a locale warning or ssh's own
  // «Warning: Permanently added …» writes) and gives no answer until its bound ends it (a plain sleep: the bound's TERM ends it, nothing
  // is left); for a host named refuse-… it is ssh's own connect failure whose words say «timed out», exit 255 at once
  const LOG = path.join(TMP, 'ssh-runs.log');
  fs.writeFileSync(path.join(BIN, 'ssh'), `#!/bin/sh\nfor a; do case "$a" in *=*) ;; *.example.test) echo "$a" >> '${LOG}';; esac; done\ncase "$*" in *refuse-*) echo "ssh: connect to host refuse.example.test port 22: Connection timed out" >&2; exit 255;; esac\necho "Warning: Permanently added 'nas.example.test' (ED25519) to the list of known hosts." >&2\nexec sleep 30\n`, { mode: 0o755 });
  const runsOf = (id) => { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.endsWith(id + '.example.test')).length; } catch { return 0; } };   // this host's runs only
  const PATH0 = process.env.PATH; process.env.PATH = `${BIN}:${PATH0}`;
  const mk = (HM, id, host = { transport: 'ssh' }) => {
    const hm = new HM({ dataDir: path.join(TMP, 'hub-data-' + id) });
    hm._state.hosts.push({ id, name: 'nas-' + id, host: (host.refuse ? 'refuse-' : '') + id + '.example.test', user: 'me', port: 22, ...host });
    hm.refuseUnreachable = async () => {};
    hm._clock = 1_800_000_000_000; hm._now = () => hm._clock;
    hm._sliceRunMs = 300;   // the run's own bound there (the seam): 300 ms, the product's 6 s
    return hm;
  };
  const ask = (hm, id) => hm.dirSlice(id, { text: '~/work/', waitMs: 2000 }).catch((e) => ({ threw: String((e && e.message) || e).slice(0, 120) }));
  // two asks: the first starts both runs (the typed folder, the rest); once both ENDED, the second — what it marks, holds and starts
  const scene = async (hm, id) => {
    const c = () => hm._sliceCache.get(id), n0 = runsOf(id);
    const first = await ask(hm, id);
    await until(() => !!c() && [...c().r1.values()].every((e) => !e.p) && !c().r2.p, 3000);
    const n1 = runsOf(id), again = await ask(hm, id);
    await until(() => [...c().r1.values()].every((e) => !e.p) && !c().r2.p, 3000);   // every run the second ask started ended too (its bound): nothing left running
    return { first: first.threw || (first.partial ? 'partial' : 'listed'), runs: n1 - n0, hung: [...c().hung.keys()], miss: c().r2.miss, again: again.threw || (again.verdict ? again.verdict.kind : 'none'), newRuns: runsOf(id) - n1 };
  };
  const NEW_REJECT = "          return reject(Object.assign(new Error((stderr?.toString() || err.message || '').trim().slice(0, 300)), { killed: !!err.killed, signal: err.signal || null }));";
  const NEW_HANG = '    const isHang = (e) => !!(e && (e.hang === true || e.killed === true));';
  const WORDS = mutantCopies('dir-slice-remote-words', REPO).load('src/hosts.js', anchored(anchored(HSRC, NEW_REJECT, "          return reject(new Error((stderr?.toString() || err.message || '').trim().slice(0, 300)));", 'B-99b9 the rejection\'s facts dropped'),   // stale-pins: kept (the red control plants today's rejection shape in a copy)
    NEW_HANG, "    const isHang = (e) => !!(e && (e.killed || e.code === 'ETIMEDOUT' || /time(d)? ?out|timeout/i.test(String(e.message || ''))));", 'B-99b9 the old words test'), 'words').HostManager;   // stale-pins: kept (…and today's words test)
  // the device road: a stand-in link — no answer at all, the machine's own bound (`timedOut`), a refusal by name
  const dev = (id, runCmd) => { const hm = mk(HostManager, id, { transport: 'dial', deviceId: 'dev-' + id }); hm.deviceBounded = async () => ({ runCmd }); return hm; };
  try {
    const [kill, refuse, killW, refuseW, silent, stopped, named, cut] = await Promise.all([
      scene(mk(HostManager, 'h-s1'), 'h-s1'), scene(mk(HostManager, 'h-s2', { transport: 'ssh', refuse: true }), 'h-s2'),
      scene(mk(WORDS, 'h-s3'), 'h-s3'), scene(mk(WORDS, 'h-s4', { transport: 'ssh', refuse: true }), 'h-s4'),
      scene(dev('h-d1', () => new Promise(() => {})), 'h-d1'),
      scene(dev('h-d2', async () => ({ code: 143, stdout: '', stderr: 'a line\n', timedOut: true, signal: 'SIGTERM' })), 'h-d2'),
      scene(dev('h-d3', async () => { throw Object.assign(new Error('this machine has no POSIX sh'), { code: 'host_needs_posix_shell' }); }), 'h-d3'),
      scene(dev('h-d4', async () => ({ code: 0, stdout: 'H\t/h\n', stderr: '', truncated: true })), 'h-d4'),
    ]);
    ok(`B-99b9 (主开发 r949 MUST 2) THE REAL _ssh: a run KILLED AT ITS BOUND that wrote one line on its error stream is a HANG — the typed folder marked (${kill.hung}), the rest held (miss ${kill.miss}), the next ask «asked again» with NO new run (${kill.newRuns})`,
      kill.runs === 2 && kill.hung.join() === '~/work' && kill.miss === 1 && kill.again === 'skipped' && kill.newRuns === 0, kill);
    ok('…ssh\'s OWN connect failure whose words say «timed out» is a REFUSAL — said by its words, nothing marked, nothing held, the next ask asks again',
      /Connection timed out/.test(refuse.first) && refuse.hung.length === 0 && refuse.miss === 0 && /Connection timed out/.test(refuse.again) && refuse.newRuns >= 1, refuse);
    ok('RED CONTROL: today\'s shape (the rejection\'s facts dropped, the words read): the killed run is counted a refusal (nothing marked, a new run each ask) and the connect failure a hang (marked)',
      killW.hung.length === 0 && killW.newRuns >= 1 && refuseW.hung.join() === '~/work', { killW, refuseW });
    ok('B-99b9 (r949) THE DEVICE ROAD by its facts: no answer by the hub\'s own bound is a hang (marked, held), the machine\'s own bound (`timedOut`) is a hang; a refusal by name and an answer CUT at its size bound are said and mark nothing',
      silent.hung.join() === '~/work' && silent.miss === 1 && silent.again === 'skipped' && stopped.hung.join() === '~/work' && stopped.miss === 1 && named.hung.length === 0 && named.miss === 0 && /no POSIX sh/.test(named.first)
        && cut.hung.length === 0 && cut.miss === 0 && /over the bound and cut/.test(cut.first), { silent, stopped, named, cut });
  } finally { process.env.PATH = PATH0; }
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${n - bad}/${n} ok${bad ? ` — ${bad} BAD` : ''}`);
process.exit(bad ? 1 : 0);
