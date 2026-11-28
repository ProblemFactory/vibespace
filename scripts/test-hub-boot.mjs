#!/usr/bin/env node
// THE SUITES' ONE HUB BOOT — scripts/hub-boot.mjs's legs (P0 of the client/server separation, 2026-11-17; the cure of 主开发's
// four must-fixes the same day). A STAND-IN hub (a 20-line server.js written into a minted root: it listens, writes a line to
// stdout and one to stderr, and starts three DETACHED processes the way the real hub's children run — a grandchild through a
// parent that exits, so no parent id reaches it; one with its cwd outside the root and the HOME it was given inside; one with cwd
// `/`, a HOME outside and the device daemon root inside). A second stand-in hub in ANOTHER minted root is the look-alike: same
// name, same argv shape. An OUTSIDER — a process the helper never started, its cwd in the root and its own HOME outside (a person's
// shell that cd'd in to watch the log) — must survive every stop and every exit. Every stand-in process ends itself when its root
// (or its marker) goes — never on a wall clock shorter than the suite's own deadlines.
//   ① the root — minted fresh; a caller's root refused; the refusals BY NAME judged with EXPLICIT lists of homes, mounts, the
//     checkout and the temp folders, so each leg reads the same in a lanes clone, in production (a checkout under a home on a
//     network mount) and on the runner; a checkout directly under the temp folder mints (the gate's own isolated worktree);
//     a mount table that cannot be read refuses; startHub's own refusals (tree / HOME / a HOME linked out / daemon roots / §57)
//   ② start + log · ③ the judgement over live processes: selected ONLY by the environ (the HOME / the daemon root the helper
//     handed out); the outsider (cwd only) is near, never selected · ④ hubOnly + a second start · ⑤ stop: everything of both
//     starts ended, the outsider and the look-alike untouched, the outsider SAID on stderr
//   ⑥ RESOLVED paths and the order (a fake /proc over real links) · ⑦ the identity re-read, the re-list, «not ours to signal»,
//     «no start time recorded», a process in an uninterruptible wait never read, another user's never read (fake /proc) · ⑧ the
//     exit: no process, no root, no worktree record; the outsider survives and is named · ⑨ a signal: a child suite ended by
//     SIGTERM, SIGINT or SIGHUP leaves nothing and DIES BY THAT SIGNAL (its parent reads it) · ⑩ nothing is stopped at a start ·
//     ⑪ a mount inside the root (or an unreadable mount table) stops both removals — the worktree's and the root's
//   ⑫ RED CONTROLS — each a copy of hub-boot.mjs with ONE named edit (scripts/mutant-copy.mjs), in the form named on its line:
//     over a SNAPSHOT of this run's own processes (a fake /proc holding only them) with a recording kill — a cwd selects, a
//     pattern stop, a parent-id stop; over a FAKE /proc — the argv selects, no start-time re-read, a lexical-only path, a
//     realpath-only path, a stuck process read; no /proc at all — no minted check, «inside» the checkout's parent; a REAL child
//     suite in its own fresh root — no worktree removal, no signal armed, a signal ended by an exit code; the suite's OWN process
//     in a fresh root — a clean at start.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import * as HB from './hub-boot.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HB_SRC = fs.readFileSync(path.join(REPO, 'scripts/hub-boot.mjs'), 'utf8');
const HB_URL = pathToFileURL(path.join(REPO, 'scripts/hub-boot.mjs')).href;
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, n = 400) => { for (let i = 0; i < n; i++) { const v = fn(); if (v) return v; await sleep(25); } return fn(); };
const statOf = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'latin1'); const f = st.slice(st.lastIndexOf(')') + 2).split(' '); return { state: f[0], ppid: Number(f[1]), starttime: Number(f[19]) }; } catch { return null; } };
const alive = (pid, starttime) => { const s = statOf(pid); return !!s && s.starttime === starttime && s.state !== 'Z'; };
const gone = (pid) => { const s = statOf(pid); return !s || s.state === 'Z'; };
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e && e.message)); } };
/** What hub-boot SAID on stderr during fn(). */
const saidDuring = (fn) => {
  const said = [], w0 = fs.writeSync;
  fs.writeSync = (fd, s, ...rest) => { if (fd === 2 && String(s).startsWith('hub-boot: ')) { said.push(String(s)); return String(s).length; } return w0(fd, s, ...rest); };
  let out; try { out = fn(); } finally { fs.writeSync = w0; }
  return { out, said };
};

const OUT = scratchDir('hb-out');   // a dir OUTSIDE every minted root
// a stand-in process's body: its pid to a file, then alive until `watch` is gone (or two minutes) — never an endless timer
const KEEP = (pidFile, watch) => `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => { if (!require('fs').existsSync(${JSON.stringify(watch)})) process.exit(0); }, 200);`;
const STANDIN = `'use strict';
const http = require('http'), fs = require('fs'), { spawn } = require('child_process'), path = require('path');
const R = process.env.HB_ROOT, OUT = process.env.HB_OUT, TAG = process.env.HB_TAG, PATH = process.env.PATH;
const keep = (f) => "require('fs').writeFileSync(" + JSON.stringify(f) + ", String(process.pid)); setInterval(() => { if (!require('fs').existsSync(" + JSON.stringify(R) + ")) process.exit(0); }, 200);";
// g1: a DETACHED GRANDCHILD — started through a parent that exits, so the hub is not its parent; its cwd in the root, the HOME inherited
const mid = spawn(process.execPath, ['-e', "require('child_process').spawn(process.execPath, ['-e', " + JSON.stringify(keep(path.join(R, TAG + '-g1.pid'))) + "], { cwd: " + JSON.stringify(path.join(R, 'proj')) + ", detached: true, stdio: 'ignore' }).unref()"], { stdio: 'ignore' });
// g2: cwd OUTSIDE the root, the HOME it was given inside (inherited from the hub)
spawn(process.execPath, ['-e', keep(path.join(R, TAG + '-g2.pid'))], { cwd: OUT, detached: true, stdio: 'ignore', env: { HOME: process.env.HOME, PATH } }).unref();
// g3: cwd '/', a HOME outside, the device daemon root inside
spawn(process.execPath, ['-e', keep(path.join(R, TAG + '-g3.pid'))], { cwd: '/', detached: true, stdio: 'ignore', env: { HOME: OUT, VIBESPACE_DEVICE_ROOT: path.join(R, 'dev'), PATH } }).unref();
setInterval(() => { if (!fs.existsSync(R)) process.exit(0); }, 200);
mid.on('exit', () => http.createServer((q, s) => s.end('{}')).listen(Number(process.env.PORT), '127.0.0.1', () => {
  console.log('stand-in hub ' + process.pid + ' listening on ' + process.env.PORT);
  console.error('stand-in hub ' + process.pid + ' says this on stderr');
}));
`;
const freePortOf = async () => { const net = await import('node:net'); return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); };
const plant = (root) => { for (const d of ['t', 'proj', 'home', 'dev']) fs.mkdirSync(path.join(root, d), { recursive: true }); fs.writeFileSync(path.join(root, 't', 'server.js'), STANDIN); };
const envFor = (root, tag) => ({ PATH: process.env.PATH, HOME: path.join(root, 'home'), VIBESPACE_VNC_DISPLAY: 'stand-in', VIBESPACE_VNC_PORT: 'stand-in', HB_ROOT: root, HB_OUT: OUT, HB_TAG: tag });
const readPid = (f) => { try { return Number(fs.readFileSync(f, 'utf8')) || null; } catch { return null; } };
const kidsOf = async (root, tag) => {
  const pids = {};
  for (const g of ['g1', 'g2', 'g3']) { const p = await waitFor(() => readPid(path.join(root, `${tag}-${g}.pid`))); pids[g] = { pid: p, starttime: p ? statOf(p)?.starttime : null }; }
  return pids;
};
const boot = async (H, root, tag, log) => {
  const hub = H.startHub({ root, tree: path.join(root, 't'), port: await freePortOf(), env: envFor(root, tag), ...(log ? { log } : {}) });
  const ready = await hub.ready({ ms: 30000 });
  return { hub, ready, kids: await kidsOf(root, tag) };
};
/** A process the SUITE starts (never the helper): `cwd`, `env` given; alive until OUT/<marker> is removed (or two minutes). */
const keeper = async (name, { cwd, env }) => {
  const marker = path.join(OUT, `${name}.marker`), pidFile = path.join(OUT, `${name}.pid`);
  fs.writeFileSync(marker, '');
  spawn(process.execPath, ['-e', KEEP(pidFile, marker)], { cwd, env: { PATH: process.env.PATH, ...env }, detached: true, stdio: 'ignore' }).unref();
  const pid = await waitFor(() => readPid(pidFile));
  return { pid, starttime: pid ? statOf(pid)?.starttime : null, marker };
};
const endKeeper = (k) => { try { fs.rmSync(k.marker, { force: true }); } catch { /* gone */ } HB.endByIdentity([k]); };

// ── ① THE ROOT ────────────────────────────────────────────────────────────────
console.log('① the root is minted by the helper; a caller\'s root is refused, the named ones by name');
const A = HB.mintRoot('hb-a'), B = HB.mintRoot('hb-b');
ok(gateOf(/^\/tmp\/vs-hb-a-h[A-Za-z0-9]{6}$/.test(A)) && gateOf(fs.statSync(A).isDirectory()) && gateOf(fs.existsSync(path.join(A, '.vs-run.json'))) && A !== B, `a fresh dir per mint, stamped with this run's record (${A}, ${B})`);
const foreign = scratchDir('hb-foreign'); plant(foreign);
const startAt = (root, extra = {}) => () => HB.startHub({ root, tree: path.join(String(root), 't'), port: 1, env: envFor(String(root), 'x'), ...extra });
ok(verdictOf(throwsWith(startAt('/'), /it is the filesystem root$/)), 'startHub refuses the filesystem root by name');
ok(verdictOf(throwsWith(startAt(foreign), /did not mint it/)), `a /tmp root the helper did not mint (${foreign}) is refused: it may be another run's`);
ok(verdictOf(throwsWith(() => HB.startHub({ tree: path.join(A, 't'), port: 1, env: envFor(A, 'x') }), /a minted root is required/)), 'no root at all is refused');
// THE TABLE, with EXPLICIT lists (never the box's own: a lanes clone, production and the runner lay the checkout out differently)
const L = { homes: ['/hh/u'], mounts: ['/mm/share'], checkout: '/vt/lanes/wt', temps: ['/tt'] };
const TABLE = [['/', 'the filesystem root'], ['/hh/u', 'a home at /hh/u'], ['/hh', 'a folder holding a home at /hh/u'], ['/hh/u/x', 'inside a home at /hh/u'],
  ['/mm/share', 'a network mount (the workspace mount) at /mm/share'], ['/mm', 'a folder holding a network mount (the workspace mount) at /mm/share'], ['/mm/share/x', 'inside a network mount (the workspace mount) at /mm/share'],
  ['/vt/lanes/wt', 'this checkout at /vt/lanes/wt'], ['/vt/lanes/wt/x', 'inside this checkout at /vt/lanes/wt'], ['/vt/lanes', 'the folder holding this checkout (the lanes folder) at /vt/lanes'], ['/vt', 'a folder holding this checkout at /vt/lanes/wt'],
  ['/vt/lanes/other', null], ['/tt', 'the temp folder itself at /tt'], ['/tt/vs-x-h1', null]];
const tableBad = TABLE.filter(([r, want]) => HB.refusalOf(r, L) !== want).map(([r, want]) => `${r}: ${HB.refusalOf(r, L)} ≠ ${want}`);
ok(!tableBad.length, `the refusals by name — each naming the entry it matched — ${TABLE.length} roots over explicit lists: IS / HOLDS / INSIDE a home, a network mount, this checkout; never «inside» the checkout's parent (/vt/lanes/other) or the temp folder (/tt/vs-x-h1)`, tableBad);
ok(HB.refusalOf('/tt/vs-x-h1', { ...L, homes: ['/', '/tt'] }) === null && HB.refusalOf('/tt/vs-x-h1', { ...L, homes: ['/', '/tt', '/hh/u'] }) === null, 'the filesystem root and a temp root are never counted as a home (a HOME=/ or HOME=/tmp does not refuse every mint)');
const UNDER_TEMP = { homes: [], mounts: [], checkout: '/tt/vs-ci-full-abc123-4242', temps: ['/tt'] };   // the gate's isolated worktree (ci.mjs addScratchWorktree)
const PROD = { homes: ['/hh/u'], mounts: ['/hh/u/workspace'], checkout: '/hh/u/workspace/AIWorkspace/vibespace', temps: ['/tt'] };   // a checkout under a home on a network mount
ok(HB.refusalOf('/tt/vs-hb-a-h1', UNDER_TEMP) === null && HB.refusalOf('/tt/vs-hb-a-h2', PROD) === null, 'MUST 3: a checkout directly under the temp folder mints; a checkout under a home on a network mount mints');
ok(HB.refusalOf('/hh/u/workspace/AIWorkspace/vibespace/x', PROD) === 'inside a home at /hh/u' && HB.refusalOf('/vt/lanes/wt/x', L) === 'inside this checkout at /vt/lanes/wt',
  'MUST 2 (why every leg passes its lists): the same «inside the checkout» question answers «inside a home» under the production layout — a leg that leaned on the box\'s own lists would be red there');
fs.mkdirSync(path.join(OUT, 'fakehome')); fs.symlinkSync(path.join(OUT, 'fakehome'), path.join(OUT, 'homelink'));
fs.mkdirSync(path.join(OUT, 'tmpx')); fs.symlinkSync(path.join(OUT, 'tmpx'), path.join(OUT, 'templink'));
ok(HB.refusalOf(path.join(OUT, 'homelink'), { ...L, homes: [path.join(OUT, 'fakehome')] }) === `a home at ${path.join(OUT, 'fakehome')}` && HB.refusalOf(path.join(OUT, 'templink'), { ...L, temps: [path.join(OUT, 'tmpx')] }) === `the temp folder itself at ${path.join(OUT, 'tmpx')}`,
  'a root that resolves through a link to a home or to the temp folder is refused as that');
const mi = path.join(OUT, 'mountinfo');
fs.writeFileSync(mi, ['22 1 0:21 / /proc rw - proc proc rw', '90 29 0:50 / /srv/work\\040space rw - fuse.bindfs bindfs rw', '91 29 0:51 / /mnt/share rw - nfs4 srv:/x rw', '92 29 0:52 / /run/x rw - tmpfs tmpfs rw'].join('\n'));
ok(JSON.stringify(HB.networkMounts(mi)) === JSON.stringify(['/srv/work space', '/mnt/share']), 'networkMounts reads the network / FUSE mount points as written (an escaped space decoded), never proc or tmpfs', HB.networkMounts(mi));
ok(HB.networkMounts(path.join(OUT, 'no-such-mountinfo')) === null && HB.refusalOf('/tt/vs-x-h1', { ...L, mounts: null, mountinfo: path.join(OUT, 'no-such-mountinfo') }) === HB.UNJUDGEABLE,
  'a mount table that cannot be read refuses the mint — never «no mounts»');
plant(A); plant(B);
fs.symlinkSync(OUT, path.join(A, 'homeout'));
ok(verdictOf(throwsWith(() => HB.startHub({ root: A, tree: path.join(foreign, 't'), port: 1, env: envFor(A, 'x') }), /must lie in the minted root/)), 'a tree outside the minted root is refused');
ok(verdictOf(throwsWith(() => HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: { ...envFor(A, 'x'), HOME: OUT } }), /HOME .* must lie in the minted root/)), 'a HOME outside the minted root is refused');
ok(verdictOf(throwsWith(() => { const e = envFor(A, 'x'); delete e.HOME; HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: e }); }, /must carry a HOME in the minted root/)), 'an env with NO HOME is refused — the hub\'s children would carry nothing the helper hands out');
ok(verdictOf(throwsWith(() => HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: { ...envFor(A, 'x'), HOME: path.join(A, 'homeout') } }), /HOME .* must lie in the minted root/)), 'a HOME that is a link OUT of the root is refused');
ok(verdictOf(['VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT'].every((k) => throwsWith(() => HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: { ...envFor(A, 'x'), [k]: OUT } }), new RegExp(`${k} .* must lie in the minted root`)))), 'a daemon root outside the minted root is refused (both names)');
ok(verdictOf(throwsWith(() => HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: { ...envFor(A, 'x'), VIBESPACE_VNC_PORT: '' } }), /singleton-Desktop names/)), 'an env without the per-run singleton-Desktop names is refused (test-architecture §57 kept at the one boot site)');

// ── ② START + LOG ─────────────────────────────────────────────────────────────
console.log('② start + log');
const a1 = await boot(HB, A, 'a1');
const b1 = await boot(HB, B, 'b1');
ok(gateOf(a1.ready) && verdictOf(b1.ready), 'both stand-in hubs answered GET /api/home');
ok(gateOf(Number.isInteger(a1.hub.pid)) && a1.hub.starttime === statOf(a1.hub.pid)?.starttime, `the hub's pid and start time were recorded at its spawn (${a1.hub.pid} @ ${a1.hub.starttime})`);
const line = await a1.hub.waitForLog(/listening on/);
ok(line === `stand-in hub ${a1.hub.pid} listening on ${a1.hub.port}`, 'waitForLog returns the hub\'s own stdout line', line);
ok(a1.hub.logFile === path.join(A, 'hub.log') && verdictOf(a1.hub.log().includes(`stand-in hub ${a1.hub.pid} says this on stderr`)), 'stdout and stderr in ONE file in the root (<root>/hub.log)');
ok(verdictOf(throwsWith(() => HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: envFor(A, 'x') }), /still writes .*hub\.log/)), 'a second start on a log a running hub still writes is refused');

// ── ③ THE JUDGEMENT, LIVE ─────────────────────────────────────────────────────
console.log('③ the judgement over the live processes — selected by the environ only');
const O = await keeper('outsider-a', { cwd: path.join(A, 'proj'), env: { HOME: OUT } });   // the outsider: its cwd in A, its own HOME outside
const judge = (root) => { const near = []; const sel = Object.fromEntries(HB.rootedProcesses(root, { near }).map((x) => [x.pid, x.via])); return { sel, near: Object.fromEntries(near.map((x) => [x.pid, x.near])) }; };
const jA = judge(A);
const wantA = { [a1.hub.pid]: 'home', [a1.kids.g1.pid]: 'home', [a1.kids.g2.pid]: 'home', [a1.kids.g3.pid]: 'daemon-root' };
ok(JSON.stringify(jA.sel) === JSON.stringify(wantA), 'selected in A: the hub, g1 and g2 by the HOME it was given, g3 by the daemon root it was given — and nothing else', jA.sel);
ok(jA.near[O.pid] === 'cwd' && !(O.pid in jA.sel), `the outsider (${O.pid}, cwd in A, its own HOME outside) is NEAR by its cwd — never selected`, jA.near);
const bPids = [b1.hub.pid, b1.kids.g1.pid, b1.kids.g2.pid, b1.kids.g3.pid];
ok(gateOf(bPids.every((p) => !(p in jA.sel) && !(p in jA.near))) && Object.keys(judge(B).sel).length === 4, 'the look-alike hub in B (same name, same argv) and its children are not A\'s');
ok(statOf(a1.kids.g1.pid).ppid !== a1.hub.pid && statOf(a1.kids.g2.pid).ppid === a1.hub.pid, `the grandchild's parent is not the hub (ppid ${statOf(a1.kids.g1.pid).ppid}) — a parent id cannot reach it; g2 is still the hub's child`);

// ⑫'s snapshot: a fake /proc holding ONLY this run's own processes (A's four, the outsider, B's four), taken while they all live
const SNAP = scratchDir('hb-snap');
for (const pid of [a1.hub.pid, a1.kids.g1.pid, a1.kids.g2.pid, a1.kids.g3.pid, O.pid, ...bPids]) {
  const d = path.join(SNAP, String(pid)); fs.mkdirSync(d);
  for (const f of ['stat', 'environ', 'cmdline']) fs.writeFileSync(path.join(d, f), fs.readFileSync(`/proc/${pid}/${f}`));
  fs.symlinkSync(fs.readlinkSync(`/proc/${pid}/cwd`), path.join(d, 'cwd'));
}
const aSet = new Set([a1.hub.pid, a1.kids.g1.pid, a1.kids.g2.pid, a1.kids.g3.pid]);

// ── ④ hubOnly + A SECOND START ────────────────────────────────────────────────
console.log('④ hubOnly (a restart leg) and a second start in the same root');
const r1 = a1.hub.stop({ hubOnly: true });
ok(r1.signalled.length === 1 && r1.signalled[0].pid === a1.hub.pid && r1.left.length === 0, 'hubOnly signals the hub alone, by its identity', r1);
await waitFor(() => a1.hub.child.exitCode !== null || a1.hub.child.signalCode);
ok(verdictOf(['g1', 'g2', 'g3'].every((g) => alive(a1.kids[g].pid, a1.kids[g].starttime))), 'its detached children live on (a session outlives a hub restart)');
const a2 = await boot(HB, A, 'a2');
ok(gateOf(a2.ready) && gateOf(a2.hub.log().includes(`stand-in hub ${a2.hub.pid} listening`)) && !a2.hub.log().includes(`stand-in hub ${a1.hub.pid} `), 'the second start reads only its own lines of the same log');

// ── ⑤ STOP ────────────────────────────────────────────────────────────────────
console.log('⑤ stop: the hub and everything it started, by identity — never the outsider');
const everything = [{ pid: a2.hub.pid }, ...['g1', 'g2', 'g3'].flatMap((g) => [a1.kids[g], a2.kids[g]])];
const { out: r2, said: said5 } = saidDuring(() => a2.hub.stop());
const got = new Set(r2.signalled.map((x) => x.pid));
ok(gateOf(everything.every((x) => got.has(x.pid))) && r2.signalled.length === everything.length, `stop signalled the hub + the six children of BOTH starts — ${r2.signalled.length} processes, by identity`, r2);
ok(gateOf(await waitFor(() => everything.slice(1).every((x) => !alive(x.pid, x.starttime)))) && verdictOf(await waitFor(() => a2.hub.child.exitCode !== null || a2.hub.child.signalCode)), 'all of them ended');
ok(gateOf(alive(O.pid, O.starttime)) && verdictOf(r2.left.some((x) => x.pid === O.pid && x.why === 'its cwd only')), 'the OUTSIDER (cwd in the root, its own HOME outside) survives the stop');
ok(verdictOf(said5.some((s) => s.startsWith(`hub-boot: left pid ${O.pid} (`) && s.includes(`alone — its working directory lies in ${A}, but its environ carries no HOME or daemon root the helper handed out`))), 'and the line on stderr names it', said5);
ok(gateOf(alive(b1.hub.pid, b1.hub.starttime)) && verdictOf(['g1', 'g2', 'g3'].every((g) => alive(b1.kids[g].pid, b1.kids[g].starttime))), 'the look-alike hub in B and its three children are untouched');

// ── ⑥ RESOLVED PATHS AND THE ORDER ────────────────────────────────────────────
console.log('⑥ selected on RESOLVED paths, the HOME before the daemon root; a cwd or an argv alone is near');
const R = HB.mintRoot('hb-r'); fs.mkdirSync(path.join(R, 'in')); fs.symlinkSync(OUT, path.join(R, 'out')); fs.symlinkSync(path.join(R, 'in'), path.join(OUT, 'into'));
const FAKE = scratchDir('hb-fake');
const fakeIn = (dir) => (pid, { cwd = null, env = null, argv = null, starttime = 1000, state = 'S', threads = null } = {}) => {
  const d = path.join(dir, String(pid)); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'stat'), `${pid} (x) ${state} 1 ${pid} ${pid} 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${starttime} 0 0`);
  if (threads) threads.forEach((st, i) => { const t = path.join(d, 'task', String(pid + i)); fs.mkdirSync(t, { recursive: true }); fs.writeFileSync(path.join(t, 'stat'), `${pid + i} (x) ${st} 1 ${pid} ${pid} 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${starttime} 0 0`); });
  if (cwd) fs.symlinkSync(cwd, path.join(d, 'cwd'));
  if (env) fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
  if (argv) fs.writeFileSync(path.join(d, 'cmdline'), argv.join('\0') + '\0');
};
const fake = fakeIn(FAKE);
fake(5001, { cwd: path.join(R, 'in'), env: { HOME: OUT } });                         // a cwd only (a person's shell)
fake(5002, { cwd: OUT, env: { HOME: path.join(R, 'out') } });                         // a HOME that is a link OUT of the root
fake(5003, { cwd: OUT, env: { HOME: path.join(OUT, 'into') } });                      // a HOME that is a link INTO the root
fake(5004, { argv: ['chrome', `--user-data-dir=${path.join(R, 'in', 'p')}`] });       // an argv only, nothing readable
fake(5005, { cwd: OUT, env: { HOME: OUT }, argv: ['x', path.join(R, 'in')] });        // an argv only
fake(5006, { env: { VIBESPACE_DEVICE_ROOT: path.join(R, 'dev') } });                  // the daemon root
fake(5007, { cwd: `${path.join(R, 'in')} (deleted)` });                               // a deleted cwd in the root, only
fake(5008, { cwd: path.join(R, 'in'), env: { HOME: path.join(R, 'out', 'h') } });     // a cwd + a HOME linked out
fake(5009, { env: { HOME: path.join(R, 'h'), VIBESPACE_AGENTD_ROOT: path.join(R, 'd') } });   // both: the HOME is read first
fake(5010, { env: { HOME: path.join(R, 'h2') } });
fake(5011, { cwd: OUT, env: { HOME: OUT, VIBESPACE_DEVICE_ROOT: OUT } });             // nothing of the root
const jF = (H) => { const near = []; const sel = Object.fromEntries(H.rootedProcesses(R, { procRoot: FAKE, near }).map((x) => [x.pid, x.via])); return { sel, near: Object.fromEntries(near.map((x) => [x.pid, x.near])) }; };
const f6 = jF(HB);
ok(JSON.stringify(f6.sel) === JSON.stringify({ 5006: 'daemon-root', 5009: 'home', 5010: 'home' }), 'selected: the daemon root (5006), the HOME — read before the daemon root (5009) — and nothing reached through a link out (5002) or in (5003)', f6.sel);
ok(JSON.stringify(f6.near) === JSON.stringify({ 5001: 'cwd', 5004: 'argv', 5005: 'argv', 5007: 'cwd', 5008: 'cwd' }), 'near (said, never signalled): a cwd only, an argv only, a deleted cwd, a cwd beside a HOME linked out', f6.near);
fakeIn(FAKE)(5012, { env: { HOME: path.join(R, 'h3') } }); fs.rmSync(path.join(FAKE, '5012', 'stat'));
ok(!('5012' in jF(HB).sel), 'a pid whose start time cannot be read is never listed (the judgement is bound to one process)');
// MUST B — a process in an uninterruptible wait (state D, wedged on a network mount) holds the lock an environ read waits on
const FAKE3 = scratchDir('hb-fake3'), fake3 = fakeIn(FAKE3);
fake3(5101, { env: { HOME: path.join(R, 'h') }, cwd: path.join(R, 'in'), argv: ['x', path.join(R, 'in')], state: 'D' });
fake3(5102, { cwd: OUT, env: { HOME: OUT }, argv: ['chrome', `--user-data-dir=${path.join(R, 'in', 'p')}`] });
fake3(5103, { env: { HOME: path.join(R, 'h') }, threads: ['S', 'D', 'S'] });   // the leader runs; ONE of its threads is in D
const readsOf = (fn) => { const seen = [], r0 = fs.readFileSync, l0 = fs.readlinkSync, d0 = fs.readdirSync, m0 = fs.rmSync;
  fs.readFileSync = (f, ...a) => { seen.push(String(f)); return r0(f, ...a); }; fs.readlinkSync = (f, ...a) => { seen.push(String(f)); return l0(f, ...a); };
  fs.readdirSync = (f, ...a) => { seen.push('readdir ' + String(f)); return d0(f, ...a); }; fs.rmSync = (f, ...a) => { seen.push('rm ' + String(f)); return m0(f, ...a); };
  let out; try { out = fn(); } finally { fs.readFileSync = r0; fs.readlinkSync = l0; fs.readdirSync = d0; fs.rmSync = m0; } return { out, seen }; };
const rec8 = [];
const { out: b8, seen: seen8 } = readsOf(() => saidDuring(() => HB.endRooted(R, { procRoot: FAKE3, kill: (pid) => rec8.push(pid) })));
ok(!rec8.includes(5101) && gateOf(b8.out.left.some((x) => x.pid === 5101 && x.why === 'in an uninterruptible wait')) && !seen8.some((f) => /\/5101\/(environ|cwd|cmdline)$/.test(f)),
  'MUST B: a process in state D is never read (not its environ, cwd or argv) and never signalled — it is retried by the next passes and left', { rec8, seen: seen8.filter((f) => f.includes('/5101/')) });
ok(gateOf(b8.said.some((s) => s.startsWith('hub-boot: left pid 5101 (?) unjudged — it is in an uninterruptible wait (state D'))) && b8.said.filter((s) => s.includes(' 5101 ')).length === 1, 'and SAID once, after the last pass', b8.said);
ok(!rec8.includes(5103) && gateOf(b8.out.left.some((x) => x.pid === 5103 && x.why === 'in an uninterruptible wait')) && !seen8.some((f) => /\/5103\/(environ|cwd|cmdline)$/.test(f)),
  'a process whose LEADER runs but ONE THREAD is in state D is stuck too (its task/<tid>/stat read, never its environ)', seen8.filter((f) => f.includes('/5103/')));
ok(verdictOf(b8.said.some((s) => s === `hub-boot: left pid 5102 (?) alone — its argv lies in ${R}, but its environ carries no HOME or daemon root the helper handed out\n`)), 'an argv-only match is said in those words', b8.said);
// THE ENDS REFUSE A ROOT THE HELPER DID NOT MINT — handed the scratch area or a home by a mistake, nothing is read or signalled
for (const bad of ['/tmp', os.homedir(), path.join('/tmp', String(undefined))]) {
  const recE = [];
  const { seen: seenE } = readsOf(() => {
    for (const [end, fn] of [['endRooted', () => HB.endRooted(bad, { kill: (p) => recE.push(p) })], ['endHub', () => HB.endHub({ pid: a1.hub.pid, starttime: a1.hub.starttime, root: bad, kill: (p) => recE.push(p) })], ['finishRoot', () => HB.finishRoot(bad)]]) {
      let msg = ''; try { fn(); } catch (e) { msg = String(e.message); }
      // the NAME is the start's own for THIS layout (in a checkout directly under /tmp, /tmp is the folder holding it, named first)
      const want = HB.refusalOf(bad) || 'no root the helper mints';
      ok(verdictOf(msg.startsWith(`hub-boot: ${end} refuses root ${JSON.stringify(bad)} — it is ${want}`)), `${end} refuses ${bad} by name — ${msg.replace(/^hub-boot: /, '').slice(0, 90)}`, msg);
    }
  });
  ok(!recE.length && !seenE.some((f) => (f.includes('/proc') && f !== '/proc/self/mountinfo') || f.startsWith('rm ')), `…and for ${bad} no process was read (only the helper's own mount table, for the refusal), nothing removed, nothing signalled`, { recE, seen: seenE.slice(0, 5) });
}
ok(HB.rootedProcesses(R, { procRoot: FAKE, uid: process.getuid() + 1 }).length === 0, 'another user\'s process is never read: the owner is read first (here every entry belongs to someone else, so none is listed)');

// ── ⑦ THE RE-READ, THE RE-LIST, THE ANSWERS ───────────────────────────────────
console.log('⑦ the identity re-read and the answers of the end');
const listed = HB.rootedProcesses(R, { procRoot: FAKE });
fs.writeFileSync(path.join(FAKE, '5009', 'stat'), `5009 (x) S 1 5009 5009 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 2000 0 0`);
fs.rmSync(path.join(FAKE, '5010'), { recursive: true });
const rec = [];
const { out: r7, said } = saidDuring(() => HB.endByIdentity(listed, { procRoot: FAKE, kill: (pid) => rec.push(pid) }));
ok(!rec.includes(5009) && verdictOf(r7.left.some((x) => x.pid === 5009 && x.why === 'start time changed')), 'the recycled pid 5009 is left alone', r7);
ok(said.length === 1 && verdictOf(/left pid 5009 alone — listed with start time 1000, it reads 2000 now/.test(said[0])), 'and SAID on stderr — one line, the gone 5010 silent', said);
ok(!rec.includes(5010) && gateOf(r7.left.some((x) => x.pid === 5010 && x.why === 'gone')) && JSON.stringify(rec) === '[5006]', 'the gone pid is not signalled; the unchanged one is');
const FAKE2 = scratchDir('hb-fake2'), fake2 = fakeIn(FAKE2);
fake2(6001, { env: { HOME: path.join(R, 'h') } });
const rec2 = [];
const r7b = HB.endRooted(R, { procRoot: FAKE2, kill: (pid) => { rec2.push(pid); if (pid === 6001) fake2(6002, { env: { HOME: path.join(R, 'h') } }); } });
ok(JSON.stringify(rec2) === '[6001,6002]' && r7b.signalled.length === 2, 'the re-list: a process forked between the first list and its signal (6002) is ended by the next pass', rec2);
const r7c = HB.endByIdentity([{ pid: 6001, starttime: 1000 }], { procRoot: FAKE2, kill: () => { const e = new Error('denied'); e.code = 'EPERM'; throw e; } });
ok(r7c.left.length === 1 && r7c.left[0].why === 'not ours to signal' && !r7c.signalled.length, 'a signal the kernel refuses is answered «not ours to signal»', r7c);
const rec3 = [];
const r7d = HB.endHub({ pid: 6001, starttime: null, root: R, hubOnly: true, procRoot: FAKE2, kill: (pid) => rec3.push(pid) });
ok(!rec3.length && r7d.left.length === 1 && r7d.left[0].why === 'no start time recorded at its spawn', 'a hub with no start time recorded at its spawn is never signalled by its pid', r7d);

// ── ⑧ THE EXIT ────────────────────────────────────────────────────────────────
console.log('⑧ a suite that exits without a stop leaves nothing of its hub — and never the outsider');
// a one-commit scratch repository; the child PLANTS a linked worktree of it in its root in git's own layout
// (.git/worktrees/<n>/{gitdir,commondir,HEAD} + the dir's `.git` file) — git lists it like any other, and no checkout is made
// (a `git worktree add` is a checkout, which THE TIER RULE keeps out of the fast tier)
const GREPO = path.join(OUT, 'repo');
const git = (...a) => spawnSync('git', a, { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: OUT, GIT_CONFIG_NOSYSTEM: '1' } });
git('init', '-q', GREPO); git('-C', GREPO, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'one');
const childOf = (url) => `import * as HB from ${JSON.stringify(url)};
import fs from 'node:fs'; import path from 'node:path'; import net from 'node:net'; import { spawn, spawnSync } from 'node:child_process';
if (process.env.HB_THROWER === '1') process.on('exit', () => { throw new Error('a suite exit listener that throws, registered before the mint'); });
const root = HB.mintRoot('hb-exit');
for (const d of ['t', 'proj', 'home', 'dev']) fs.mkdirSync(path.join(root, d), { recursive: true });
fs.writeFileSync(path.join(root, 't', 'server.js'), process.env.HB_STANDIN);
const meta = path.join(process.env.HB_GREPO, '.git', 'worktrees', path.basename(root)); fs.mkdirSync(meta, { recursive: true }); fs.mkdirSync(path.join(root, 'wt'));
fs.writeFileSync(path.join(root, 'wt', '.git'), 'gitdir: ' + meta + '\\n'); fs.writeFileSync(path.join(meta, 'gitdir'), path.join(root, 'wt', '.git') + '\\n');
fs.writeFileSync(path.join(meta, 'commondir'), '../..\\n'); fs.writeFileSync(path.join(meta, 'HEAD'), process.env.HB_HEAD + '\\n');
const listed = spawnSync('git', ['-C', process.env.HB_GREPO, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }).stdout.includes(path.join(root, 'wt'));
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const kept = path.join(process.env.HB_OUT, path.basename(root) + '.kept.log');
const hub = HB.startHub({ root, tree: path.join(root, 't'), port, env: { PATH: process.env.PATH, HOME: path.join(root, 'home'), VIBESPACE_VNC_DISPLAY: 's', VIBESPACE_VNC_PORT: 's', HB_ROOT: root, HB_OUT: process.env.HB_OUT, HB_TAG: 'e' }, keepLog: kept });
const ready = await hub.ready({ ms: 30000 });
const oFile = path.join(process.env.HB_OUT, path.basename(root) + '.outsider'), oMark = oFile + '.marker'; fs.writeFileSync(oMark, '');
spawn(process.execPath, ['-e', process.env.HB_KEEP.replace('PIDFILE', oFile).replace('WATCH', oMark)], { cwd: path.join(root, 'proj'), env: { PATH: process.env.PATH, HOME: process.env.HB_OUT }, detached: true, stdio: 'ignore' }).unref();
// a stand-in BROWSER the suite starts itself, its profile in the root (rule nine: it carries the root's HOME — unless HB_BHOME=out)
const bFile = path.join(process.env.HB_OUT, path.basename(root) + '.browser'), bMark = bFile + '.marker'; fs.writeFileSync(bMark, '');
spawn(process.execPath, ['-e', process.env.HB_KEEP.replace('PIDFILE', bFile).replace('WATCH', bMark), '--', '--user-data-dir=' + path.join(root, 'prof')], { cwd: process.env.HB_OUT, env: { PATH: process.env.PATH, HOME: process.env.HB_BHOME === 'out' ? process.env.HB_OUT : path.join(root, 'home') }, detached: true, stdio: 'ignore' }).unref();
const files = { g1: path.join(root, 'e-g1.pid'), g2: path.join(root, 'e-g2.pid'), g3: path.join(root, 'e-g3.pid'), outsider: oFile, browser: bFile };
const read = (f) => { try { return Number(fs.readFileSync(f, 'utf8')) || null; } catch { return null; } };
for (let i = 0; i < 400 && Object.values(files).some((f) => read(f) === null); i++) await new Promise((r) => setTimeout(r, 25));
const st = (p) => { try { const s = fs.readFileSync('/proc/' + p + '/stat', 'latin1'); return Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[19]); } catch { return null; } };
const map = { hub: hub.pid, g1: read(files.g1), g2: read(files.g2), g3: read(files.g3) };   // a FIXED map: null for a missing pid
const o = read(files.outsider);
const b = read(files.browser);
console.log(JSON.stringify({ root, ready, map, pids: Object.values(map), starttimes: Object.values(map).map((p) => (p ? st(p) : null)), outsider: { pid: o, starttime: o ? st(o) : null, marker: oMark }, browser: { pid: b, starttime: b ? st(b) : null, marker: bMark }, wt: listed, kept, hubPid: hub.pid }));
if (process.env.HB_MODE === 'wait') setInterval(() => { if (!fs.existsSync(process.env.HB_OUT)) process.exit(4); }, 200);   // ended by the parent's signal; never a clock
else if (process.env.HB_MODE === 'throw') throw new Error('a suite that throws after its boot');   // the THROWN road: an uncaught throw, no exit call
else process.exit(3);   // a red: no stop, no cleanup of its own
`;
const childEnv = (mode, extra = {}) => ({ PATH: process.env.PATH, HOME: OUT, GIT_CONFIG_NOSYSTEM: '1', HB_STANDIN: STANDIN, HB_OUT: OUT, HB_GREPO: GREPO, HB_HEAD: git('-C', GREPO, 'rev-parse', 'HEAD').stdout.trim(), HB_KEEP: KEEP('PIDFILE', 'WATCH'), HB_MODE: mode, ...extra });
const runChild = (url, extra = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', childOf(url)], { env: childEnv('exit', extra), encoding: 'utf8', timeout: 60000 });
const report = (stdout) => { try { return JSON.parse(String(stdout).trim().split('\n').filter((l) => l.startsWith('{')).pop()); } catch { return null; } };
const ex = runChild(HB_URL);
const exo = report(ex.stdout);
ok(ex.status === 3 && gateOf(exo) && gateOf(exo.ready) && gateOf(exo.pids.every(Boolean)) && gateOf(exo.wt) && verdictOf(exo.outsider.pid), 'the child suite planted a git worktree in its root (git lists it), booted a stand-in hub that answered (a fixed map of 4 pids, none missing), started an outsider in its root, and exited 3 without a stop', { status: ex.status, out: ex.stdout.slice(-200), err: ex.stderr.slice(0, 600) });
ok(gateOf(exo) && !fs.existsSync(exo.root), 'its minted root is gone');
const wl = git('-C', GREPO, 'worktree', 'list', '--porcelain').stdout;
ok(gateOf(exo) && wl.split('\n').filter((l) => l.startsWith('worktree ')).length === 1 && !wl.includes(exo.root), 'and its git worktree went THROUGH GIT — the repository keeps no record of it', wl);
ok(gateOf(exo) && verdictOf(await waitFor(() => exo.pids.every(gone))), 'and every process its hub started is gone', exo && exo.pids.map((p) => statOf(p)));
ok(gateOf(exo) && gateOf(alive(exo.outsider.pid, exo.outsider.starttime)) && gateOf(ex.stderr.includes(`hub-boot: left pid ${exo.outsider.pid} (`)) && verdictOf(ex.stderr.includes(`its working directory lies in ${exo.root}`)), 'the OUTSIDER survives the exit, and the child\'s stderr names it', ex.stderr.slice(0, 400));
ok(gateOf(exo) && verdictOf((() => { try { return fs.readFileSync(exo.kept, 'utf8').includes(`stand-in hub ${exo.hubPid} listening`); } catch { return false; } })()), 'keepLog: the hub\'s log was APPENDED to the kept path outside the root before the root went (the suite\'s artifact survives its end)', exo && exo.kept);
ok(verdictOf(throwsWith(() => HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: envFor(A, 'x'), keepLog: path.join(A, 'kept.log') }), /keepLog .* lies in the minted root/)), 'a keepLog inside the minted root is refused (it would go with the root)');
ok(gateOf(exo) && gateOf(exo.browser.pid) && !alive(exo.browser.pid, exo.browser.starttime) && !fs.existsSync(exo.root),
  'RULE NINE: the stand-in browser the suite started itself (its profile in the root, the root\'s HOME) was ended by the helper BEFORE the root went — it watches a marker outside, so nothing but the helper ended it');
if (exo && exo.outsider.pid) endKeeper(exo.outsider);   // the suite's own outsider, ended by its identity
const exB = runChild(HB_URL, { HB_BHOME: 'out' });   // RED CONTROL (a real child, the real helper): the browser WITHOUT the root's HOME
const exBo = report(exB.stdout);
ok(gateOf(exBo) && gateOf(exBo.browser.pid) && gateOf(alive(exBo.browser.pid, exBo.browser.starttime)) && !fs.existsSync(exBo.root) && gateOf(exB.stderr.includes(`hub-boot: left pid ${exBo.browser.pid} (`)) && verdictOf(exB.stderr.includes(`its argv lies in ${exBo.root}`)),
  'CONTROL (a real child) the same browser WITHOUT the root\'s HOME — RED: it is only near (its profile argv), said and LEFT running while the root is removed under it', exB.stderr.slice(0, 300));
if (exBo) { if (exBo.browser.pid) endKeeper(exBo.browser); if (exBo.outsider.pid) endKeeper(exBo.outsider); }
const exT = runChild(HB_URL, { HB_THROWER: '1', HB_MODE: 'throw' });   // the THROWN road (an uncaught throw after the boot), and a suite 'exit' listener registered BEFORE the mint throws too
const exTo = report(exT.stdout);
ok(gateOf(exTo) && exT.status === 1 && gateOf(exT.stderr.includes('a suite that throws after its boot')) && !fs.existsSync(exTo.root) && gateOf(await waitFor(() => exTo.pids.every((p) => !p || gone(p)))) && verdictOf(exT.stderr.includes("hub-boot: a suite 'exit' listener threw (a suite exit listener that throws, registered before the mint) — the helper's end runs anyway")),
  'the THROWN road: the suite throws after its boot (exit 1, its error said) and a suite \'exit\' listener registered before the mint throws too — wrapped at the mint, that throw is said and the end still runs (no root, no process)', { status: exT.status, err: exT.stderr.slice(0, 300) });
ok(gateOf(exTo) && verdictOf((() => { try { return fs.readFileSync(exTo.kept, 'utf8').includes(`stand-in hub ${exTo.hubPid} listening`); } catch { return false; } })()), 'keepLog on the THROWN road: the hub\'s log is kept outside the root', exTo && exTo.kept);
if (exTo && exTo.outsider.pid) endKeeper(exTo.outsider);

// ── ⑨ A SIGNAL ────────────────────────────────────────────────────────────────
console.log('⑨ a child suite ended by a signal leaves no process and no root — and DIES BY THAT SIGNAL (its parent reads it)');
const signalRun = async (url, sig = 'SIGTERM', extra = {}) => {
  const c = spawn(process.execPath, ['--input-type=module', '-e', childOf(url)], { env: childEnv('wait', extra), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
  const ended = new Promise((res) => c.on('exit', (code, s9) => res({ code, sig: s9 })));
  const rep = await waitFor(() => report(out), 2400);
  c.kill(sig);
  return { rep, end: await ended, err };
};
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  const t9 = await signalRun(HB_URL, sig);
  ok(gateOf(t9.rep) && gateOf(t9.rep.ready) && t9.end.sig === sig && t9.end.code === null, `${sig}: the child died BY ${sig} — its parent reads the signal (code ${t9.end.code}, signal ${t9.end.sig}), so the gate reads «killed from outside», never a red`, t9.err.slice(0, 300));
  ok(gateOf(t9.rep) && !fs.existsSync(t9.rep.root) && verdictOf(await waitFor(() => t9.rep.pids.every((p) => !p || gone(p)))), `${sig}: its root is gone and every process its hub started is gone`);
  if (sig === 'SIGTERM') ok(gateOf(t9.rep) && verdictOf((() => { try { return fs.readFileSync(t9.rep.kept, 'utf8').includes(`stand-in hub ${t9.rep.hubPid} listening`); } catch { return false; } })()), 'keepLog on the SIGNAL road: the hub\'s log is kept outside the root after a death by SIGTERM', t9.rep && t9.rep.kept);
  if (t9.rep && t9.rep.outsider.pid) endKeeper(t9.rep.outsider);
}
const t9t = await signalRun(HB_URL, 'SIGTERM', { HB_THROWER: '1' });
ok(gateOf(t9t.rep) && t9t.end.sig === 'SIGTERM' && !fs.existsSync(t9t.rep.root) && verdictOf(await waitFor(() => t9t.rep.pids.every((p) => !p || gone(p)))),
  'a suite \'exit\' listener registered before the mint THROWS during the end — the helper\'s end runs anyway (its own call after the emit): the root gone, everything ended, death by SIGTERM', t9t.end);
if (t9t.rep && t9t.rep.outsider.pid) endKeeper(t9t.rep.outsider);

// ── ⑩ NOTHING AT START ────────────────────────────────────────────────────────
console.log('⑩ a start stops nothing');
const S = HB.mintRoot('hb-start'); plant(S);
const P = await keeper('in-s-before-start', { cwd: OUT, env: { HOME: path.join(S, 'home') } });   // selected by the HOME — already there before the start
const s1 = await boot(HB, S, 's1');
ok(gateOf(s1.ready) && verdictOf(alive(P.pid, P.starttime)), 'a process the root\'s own rule would select, alive before startHub, is alive after it — the helper never «cleans up before»');
s1.hub.stop(); endKeeper(P);

// ── ⑪ A MOUNT INSIDE THE ROOT ─────────────────────────────────────────────────
console.log('⑪ a mount inside the root (or an unreadable mount table) stops BOTH removals — the worktree\'s and the root\'s');
const RM = HB.mintRoot('hb-rm'); fs.mkdirSync(path.join(RM, 'mnt'), { recursive: true });   // a minted root: the ends refuse any other
const plantWt = (root) => {   // a linked worktree of the scratch repository, in git's own layout (no checkout)
  const meta = path.join(GREPO, '.git', 'worktrees', path.basename(root)); fs.mkdirSync(meta, { recursive: true }); fs.mkdirSync(path.join(root, 'wt'));
  fs.writeFileSync(path.join(root, 'wt', '.git'), `gitdir: ${meta}\n`); fs.writeFileSync(path.join(meta, 'gitdir'), `${path.join(root, 'wt', '.git')}\n`);
  fs.writeFileSync(path.join(meta, 'commondir'), '../..\n'); fs.writeFileSync(path.join(meta, 'HEAD'), git('-C', GREPO, 'rev-parse', 'HEAD').stdout);
};
plantWt(RM);
const listedWt = () => git('-C', GREPO, 'worktree', 'list', '--porcelain').stdout.includes(path.join(RM, 'wt'));
const mi2 = path.join(OUT, 'mountinfo2'); fs.writeFileSync(mi2, `22 1 0:21 / /proc rw - proc proc rw\n93 29 0:53 / ${path.join(RM, 'mnt')} rw - fuse.rclone r rw\n`);
const { out: rmA, said: saidRm } = saidDuring(() => HB.finishRoot(RM, { mountinfo: mi2 }));
ok(rmA === false && gateOf(fs.existsSync(path.join(RM, 'wt', '.git'))) && gateOf(listedWt()) && verdictOf(saidRm.some((s) => s.includes(`${path.join(RM, 'mnt')} is mounted inside it`))), 'a mount point inside the root stops the worktree\'s removal AND the root\'s, and that is said', saidRm);
const { out: rmB } = saidDuring(() => HB.finishRoot(RM, { mountinfo: path.join(OUT, 'no-such-mountinfo') }));
ok(rmB === false && gateOf(listedWt()) && verdictOf(fs.existsSync(RM)), 'a mount table that cannot be read stops both too');
ok(HB.finishRoot(RM, { mountinfo: mi }) === true && !fs.existsSync(RM) && !listedWt(), 'with no mount inside: the worktree through git, then the root');

// ── ⑫ RED CONTROLS ────────────────────────────────────────────────────────────
console.log('⑫ red controls — each in the form its line names');
const M = mutantCopies('hub-boot', REPO);
const patch = (a, b) => { if (!HB_SRC.includes(a)) throw new Error('control patch no longer applies: ' + a.slice(0, 80)); return HB_SRC.replace(a, b); };
const mutantFile = (tag, src) => M.write('scripts/hub-boot.mjs', src, tag, { esm: true });
const mutant = async (tag, src) => import(pathToFileURL(mutantFile(tag, src)).href);
const hubA = { pid: a1.hub.pid, starttime: a1.hub.starttime, root: A };
const endedOver = (H) => { const got = new Set(); saidDuring(() => H.endHub({ ...hubA, procRoot: SNAP, kill: (pid) => got.add(pid) })); return got; };
const same = (s) => s.size === aSet.size && [...aSet].every((p) => s.has(p));
ok(verdictOf(same(endedOver(HB))), 'THE HELPER over the snapshot: exactly A\'s four (the hub, g1, g2, g3), never the outsider — the snapshot controls are judged against this');
const CWD = await mutant('cwd-selects', patch("return { via: null, near: 'cwd' };", "return { via: 'cwd', near: null };"));
const sC = endedOver(CWD);
ok(gateOf(sC.has(O.pid)) && '5001' in jF(CWD).sel, 'CONTROL (snapshot) a cwd selects — RED: the outsider is signalled (and the fake shell 5001 is selected)', [...sC]);
const PAT = await mutant('pattern', patch('  let env = null; try {', "  try { if (fs.readFileSync(`${procRoot}/${pid}/cmdline`, 'utf8').split('\\0').includes('server.js')) return { via: 'argv', near: null }; } catch { /* control */ }\n  let env = null; try {"));
const sP = endedOver(PAT);
ok(!same(sP) && verdictOf(sP.has(b1.hub.pid)), 'CONTROL (snapshot) a pattern stop (argv names server.js) — RED: it reaches the look-alike hub in B', [...sP]);
const PPID = await mutant('ppid', patch('  const rest = endRooted(root, { signal, procRoot, kill, done: new Set([`${pid}:${starttime}`]) });', "  const kids = []; for (const d of fs.readdirSync(procRoot).filter((x) => /^\\d+$/.test(x))) { try { const st = fs.readFileSync(`${procRoot}/${d}/stat`, 'latin1'); if (Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]) === pid) kids.push({ pid: Number(d), starttime: starttimeOf(Number(d), procRoot) }); } catch { /* control */ } }\n  const rest = endByIdentity(kids, { signal, procRoot, kill });"));
const sQ = endedOver(PPID);
ok(!same(sQ) && !sQ.has(a1.kids.g1.pid), 'CONTROL (snapshot) a parent-id stop — RED: the detached grandchild g1 is missed', [...sQ]);
const ARGVSEL = await mutant('argv-selects', patch("return { via: null, near: 'argv' };", "return { via: 'argv', near: null };"));
ok('5005' in jF(ARGVSEL).sel, 'CONTROL (fake /proc) the argv selects — RED: 5005, whose HOME is outside, is selected by an argument', jF(ARGVSEL).sel);
const STUCK = await mutant('stuck-read', patch("    if (f.state === 'D' || anyThreadStuck(pid, procRoot)) { if (stuck) stuck.push({ pid, starttime: st0 }); continue; }   // an uninterruptible wait: its environ is not read\n", ''));
const { seen: seenS } = readsOf(() => STUCK.rootedProcesses(R, { procRoot: FAKE3 }));
const LEADER = await mutant('leader-only', patch("    if (f.state === 'D' || anyThreadStuck(pid, procRoot)) {", "    if (f.state === 'D') {"));
const { seen: seenL } = readsOf(() => LEADER.rootedProcesses(R, { procRoot: FAKE3 }));
ok(gateOf(seenL.some((f) => f.endsWith('/5103/environ'))) && !seenL.some((f) => f.endsWith('/5101/environ')), 'CONTROL (fake /proc) the leader\'s state only — RED: the process whose one thread is in D is read', seenL.filter((f) => f.includes('/510')));
ok(verdictOf(seenS.some((f) => f.endsWith('/5101/environ'))), 'CONTROL (fake /proc) a stuck process read — RED: the environ of the process in state D is read (on the box, that read can hang the exit)', seenS.filter((f) => f.includes('/5101/')));
const NOREREAD = await mutant('noreread', patch('    if (now !== starttime) {', '    if (false) {'));
const recN = []; NOREREAD.endByIdentity([{ pid: 5009, starttime: 1000 }], { procRoot: FAKE, kill: (pid) => recN.push(pid) });
const recO = []; saidDuring(() => HB.endByIdentity([{ pid: 5009, starttime: 1000 }], { procRoot: FAKE, kill: (pid) => recO.push(pid) }));
ok(gateOf(recN.includes(5009)) && !recO.includes(5009), 'CONTROL (fake /proc) no start-time re-read — RED: the recycled pid 5009 is signalled (the helper: not)', { mutant: recN, helper: recO });
const LEX = await mutant('lexical', patch('return isIn(lex, r) && isIn(real(lex), r); };', 'return isIn(lex, r); };'));
const REAL = await mutant('realpath', patch('return isIn(lex, r) && isIn(real(lex), r); };', 'return isIn(real(lex), r); };'));
ok('5002' in jF(LEX).sel, 'CONTROL (fake /proc) a lexical-only path — RED: the HOME linked OUT of the root (5002) counts as inside', jF(LEX).sel);
ok('5003' in jF(REAL).sel, 'CONTROL (fake /proc) a realpath-only path — RED: the HOME linked INTO the root (5003) makes an insider', jF(REAL).sel);
const NOMINT = await mutant('nomint', patch('  if (!MINTED.has(r)) throw', '  if (false) throw'));
let eN = ''; try { NOMINT.startHub({ root: foreign, tree: path.join(foreign, 'none'), port: 1, env: envFor(foreign, 'x') }); } catch (e) { eN = String(e.message); }
ok(!/did not mint it/.test(eN) && verdictOf(/no server\.js in the tree/.test(eN)), 'CONTROL (no /proc) no minted check — RED: a root the helper did not make passes that gate and stops only at the NEXT one (no server.js in the tree)', eN);
const PARENT = await mutant('inside-parent', patch('for (const [why, xs] of named.slice(1, 4)) {', 'for (const [why, xs] of named.slice(1, 5)) {'));
ok(PARENT.refusalOf('/tt/vs-hb-a-h1', UNDER_TEMP) === 'inside the folder holding this checkout (the lanes folder) at /tt' && PARENT.refusalOf('/vt/lanes/other', L) !== null,
  'CONTROL (no /proc) «inside» the checkout\'s parent refused — RED: a checkout directly under the temp folder refuses every mint (the gate\'s isolated worktree)', PARENT.refusalOf('/tt/vs-hb-a-h1', UNDER_TEMP));
const exK = runChild(pathToFileURL(mutantFile('no-keep', patch("    for (const h of m.hubs) if (h.keepLog) try { fs.appendFileSync(h.keepLog, h.log()); } catch (e) { say(`could not keep ${h.logFile} at ${h.keepLog} (${e && e.code})`); }   // the kept artifact, before the root goes\n", ''))).href);
const exKo = report(exK.stdout);
ok(gateOf(exKo) && !fs.existsSync(exKo.kept) && !fs.existsSync(exKo.root), 'CONTROL (a real child in its own fresh root) no copy at the end — RED: the kept log is missing, the root (and its log) gone');
if (exKo) { if (exKo.outsider.pid) endKeeper(exKo.outsider); }
const exN = runChild(pathToFileURL(mutantFile('noworktree', patch('  removeWorktrees(root);\n', ''))).href);
const exNo = report(exN.stdout);
const wlN = git('-C', GREPO, 'worktree', 'list', '--porcelain').stdout;
ok(gateOf(exNo) && gateOf(exNo.wt) && verdictOf(wlN.includes(path.join(exNo.root, 'wt'))), 'CONTROL (a real child in its own fresh root) no worktree removal at exit — RED: the repository keeps a record of a worktree whose directory is gone', wlN);
ok(gateOf(exNo) && verdictOf(await waitFor(() => exNo.pids.every(gone))), '(that control\'s child still ended every process its hub started)');
if (exNo && exNo.outsider.pid) endKeeper(exNo.outsider);
const t9c = await signalRun(pathToFileURL(mutantFile('exit-code', patch('    for (const sig of SIGNALS) { OWN[sig] = () => endBySignal(sig); process.on(sig, OWN[sig]); }\n', '    for (const sig of SIGNALS) process.on(sig, () => process.exit(128 + os.constants.signals[sig]));\n'))).href);
ok(gateOf(t9c.rep) && t9c.end.code === 143 && t9c.end.sig === null, `CONTROL (a real child in its own fresh root) the exit-code form — RED: the parent reads code ${t9c.end.code} and no signal, so the gate would read a suite it ended as a product red`, t9c.end);
if (t9c.rep && t9c.rep.outsider.pid) endKeeper(t9c.rep.outsider);
const NOWRAP_SRC = patch("    for (const l of process.rawListeners('exit')) {\n      process.removeListener('exit', l);\n      process.on('exit', (...a) => { try { l(...a); } catch (e) { say(`a suite 'exit' listener threw (${e && e.message}) \u2014 the helper's end runs anyway`); } });\n    }\n", '');
const exW = runChild(pathToFileURL(mutantFile('no-wrap', NOWRAP_SRC)).href, { HB_THROWER: '1', HB_MODE: 'throw' });
const exWo = report(exW.stdout);
ok(gateOf(exWo) && verdictOf(fs.existsSync(exWo.root)), 'CONTROL (a real child in its own fresh root) the exit listeners NOT wrapped — RED: on the thrown road the throwing listener stops the emit, the end never runs, the root stays', exW.stderr.slice(0, 200));
if (exWo) {
  const leftW = exWo.pids.map((p, i) => ({ pid: p, starttime: exWo.starttimes[i] })).filter((x) => x.pid && alive(x.pid, x.starttime));
  if (exWo.browser.pid) leftW.push(exWo.browser);
  HB.endByIdentity(leftW); await waitFor(() => leftW.every((x) => gone(x.pid)));
  saidDuring(() => HB.finishRoot(exWo.root)); if (exWo.outsider.pid) endKeeper(exWo.outsider); if (exWo.browser.pid) endKeeper(exWo.browser);
}
const t9e = await signalRun(pathToFileURL(mutantFile('no-wrap-no-second-end', NOWRAP_SRC.replace("  try { endAll(); } catch { /* idempotent: a no-op when the emit already ran it */ }\n", ''))).href, 'SIGTERM', { HB_THROWER: '1' });
ok(gateOf(t9e.rep) && verdictOf(fs.existsSync(t9e.rep.root)), 'CONTROL (a real child in its own fresh root) no wrap AND no end after the emit — RED: on the signal road a suite listener that throws first skips the end, the root stays', t9e.end);
if (t9e.rep) {   // that control's leftovers: ended by their identity, then its root
  const leftE = t9e.rep.pids.map((p, i) => ({ pid: p, starttime: t9e.rep.starttimes[i] })).filter((x) => x.pid && alive(x.pid, x.starttime));
  if (t9e.rep.browser.pid) leftE.push(t9e.rep.browser);
  HB.endByIdentity(leftE.filter((x) => x.pid)); await waitFor(() => leftE.every((x) => gone(x.pid)));
  saidDuring(() => HB.finishRoot(t9e.rep.root)); if (t9e.rep.outsider.pid) endKeeper(t9e.rep.outsider); if (t9e.rep.browser.pid) endKeeper(t9e.rep.browser);
}
const t9n = await signalRun(pathToFileURL(mutantFile('nosignal', patch('    for (const sig of SIGNALS) { OWN[sig] = () => endBySignal(sig); process.on(sig, OWN[sig]); }\n', ''))).href);
const leftN = t9n.rep ? t9n.rep.pids.map((p, i) => ({ pid: p, starttime: t9n.rep.starttimes[i] })).filter((x) => x.pid && alive(x.pid, x.starttime)) : [];
ok(gateOf(t9n.rep) && t9n.end.sig === 'SIGTERM' && gateOf(fs.existsSync(t9n.rep.root)) && leftN.length > 0, `CONTROL (a real child in its own fresh root) the exit event alone — RED: SIGTERM leaves the root and ${leftN.length} processes`, t9n.end);
if (t9n.rep) {   // that control's leftovers: ended by their identity (the child reported each pid with its start time), then its root
  if (t9n.rep.browser.pid) leftN.push(t9n.rep.browser);
  HB.endByIdentity(leftN);
  await waitFor(() => leftN.every((x) => gone(x.pid)));
  saidDuring(() => HB.finishRoot(t9n.rep.root));
  if (t9n.rep.outsider.pid) endKeeper(t9n.rep.outsider); if (t9n.rep.browser.pid) endKeeper(t9n.rep.browser);
}
const CLEAN = await mutant('clean-at-start', patch('  const r = ownRoot(root);\n', '  const r = ownRoot(root);\n  endRooted(r);\n'));
const S2 = CLEAN.mintRoot('hb-clean'); plant(S2);
const P2 = await keeper('in-s2-before-start', { cwd: OUT, env: { HOME: path.join(S2, 'home') } });
const c1 = await boot(CLEAN, S2, 'c1');
ok(gateOf(c1.ready) && verdictOf(await waitFor(() => !alive(P2.pid, P2.starttime))), 'CONTROL (the suite\'s own process, in the copy\'s own fresh root) a clean at start — RED: the process alive before startHub is ended by the start');
c1.hub.stop(); endKeeper(P2);

// ── END ───────────────────────────────────────────────────────────────────────
const rb = b1.hub.stop();
ok(rb.signalled.length === 4 && verdictOf(await waitFor(() => bPids.slice(1).every((p, i) => !alive(p, b1.kids[['g1', 'g2', 'g3'][i]].starttime)))), 'B\'s own stop ends B\'s four', rb);
endKeeper(O);

// ── B-ba47's follow-up pick (主开发 r791, r863): A SUITE CARRIES NO CALLER ROUTE OR CREDENTIAL — AND KEEPS THE PROCESS MARKS ────────
// scripts/scratch.mjs removes the caller conversation's names at its first import (src/conversation-env.js, the one list: the
// hub's address, the tokens, the telemetry pair, the account's sign-in, the browser and harness families), so a child a suite
// spawns cannot reach the caller's hub or bill the caller's account; it KEEPS the three process marks (ids, no route, no
// credential), so the person's Stop and a job's stop still find what a suite left behind. strippedEnv drops them all for a hub
// under test. The line names, never values. CONTROLS: the rule over the child with the marks deleted, and over the child the
// import never ran in (the class before the pick — and every suite pick C has not reached), are each red.
console.log('— the caller\'s conversation names: removed at the scratch import (the marks kept), dropped by strippedEnv (B-ba47 follow-up)');
{
  const STAND_IN = (tag) => ['stand', 'in', tag, process.pid].join('-');   // invented values, minted per run: never a credential
  const ROUTE_CRED = { VIBESPACE_API: 'http://caller-hub.invalid', VIBESPACE_SESSION_TOKEN: STAND_IN('s'), VIBESPACE_JOB_TOKEN: STAND_IN('j'), CODEX_WEBUI_MODEL: STAND_IN('m'),
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://caller-hub.invalid/otel', OTEL_EXPORTER_OTLP_HEADERS: ['x', 'vibespace', 'otel'].join('-') + '=' + STAND_IN('o'),
    CLAUDE_CODE_OAUTH_TOKEN: STAND_IN('a'), AGENT_BROWSER_SOCKET_DIR: path.join(os.tmpdir(), STAND_IN('sock')) };
  const MARKS = { CLAUDE_WEBUI_SESSION_ID: STAND_IN('id'), VIBESPACE_JOB_ID: STAND_IN('job'), VIBESPACE_JOB_RUN: STAND_IN('run') };
  const CALLER = { ...ROUTE_CRED, ...MARKS };
  const SCRATCH_URL = pathToFileURL(path.join(REPO, 'scripts/scratch.mjs')).href;
  const probe = (withImport) => {
    const code = (withImport ? `await import(${JSON.stringify(SCRATCH_URL)});\n` : '')
      + "const { spawnSync } = await import('node:child_process');\n"
      + "const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))'], { encoding: 'utf8' });\n"
      + 'process.stdout.write(r.stdout);';
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, ...CALLER }, encoding: 'utf8', timeout: 20000 });
    let env = null; try { env = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch { }
    return { env, stderr: String(r.stderr || '').slice(0, 600), status: r.status };
  };
  // THE RULE: the child carries none of the route / credential names, and every mark with the caller's own value
  const carried = (o) => (o && o.env ? Object.keys(ROUTE_CRED).filter((k) => k in o.env) : ['(no env read)']);
  const marksKept = (o) => !!(o && o.env) && Object.entries(MARKS).every(([k, v]) => o.env[k] === v);
  const rule = (o) => !!o && o.status === 0 && carried(o).length === 0 && marksKept(o);
  const on = probe(true), off = probe(false);
  const said = /the caller's conversation names are not carried: [^\n]*VIBESPACE_SESSION_TOKEN[^\n]*; the process marks are kept: CLAUDE_WEBUI_SESSION_ID, VIBESPACE_JOB_ID, VIBESPACE_JOB_RUN/.test(on.stderr);
  const noValue = Object.values(CALLER).every((v) => !on.stderr.includes(v));
  ok(gateOf(rule(on)) && gateOf(said) && verdictOf(noValue),
    'a suite\'s child, spawned after the scratch import, carries NONE of the caller\'s route or credential names (the hub\'s address, the tokens, the telemetry pair, an account\'s sign-in, the browser socket, a harness name) and EVERY process mark with the caller\'s value — the import names what it removed and what it kept, and prints no value',
    { carried: carried(on), marksKept: marksKept(on), said, noValue, stderr: on.stderr });
  const noMarks = on.env ? { ...on, env: Object.fromEntries(Object.entries(on.env).filter(([k]) => !(k in MARKS))) } : null;
  ok(!!noMarks && !rule(noMarks) && carried(noMarks).length === 0,
    'RED CONTROL: the same child with the marks deleted fails the rule (a stopped turn\'s or a stopped job\'s escapees would go unfound)', noMarks && Object.keys(MARKS).filter((k) => k in noMarks.env));
  ok(!rule(off) && verdictOf(['VIBESPACE_SESSION_TOKEN', 'OTEL_EXPORTER_OTLP_HEADERS', 'CLAUDE_CODE_OAUTH_TOKEN'].every((k) => carried(off).includes(k))),
    'RED CONTROL: the same child WITHOUT the scratch import fails the rule — it carries the caller\'s token, the telemetry credential and the account\'s sign-in', carried(off));
  const st = HB.strippedEnv({ PATH: '/usr/bin', HOME: '/tmp/vs-ba47-x', TERM: 'xterm', ...CALLER, ACP_WEBUI_MODE: 'x' });
  ok(st.PATH === '/usr/bin' && st.HOME === '/tmp/vs-ba47-x' && st.TERM === 'xterm' && !Object.keys(st).some((k) => k in CALLER || k === 'ACP_WEBUI_MODE'),
    'strippedEnv drops a caller conversation\'s names from any env it is handed — the marks too, a hub under test inherits none — and keeps the person\'s session (PATH, HOME, TERM)', Object.keys(st));
}
// ── THE COMPUTED MARK IS THE CLASS (B-ba47's follow-up, 主开发 r979 / r985) ─────────────────────────────────────────────────────
// Not its members: for EVERY road that finishes a conversation's (or a job's) child env — the local line, the remote command,
// the job's run — and for every harness and every account kind the tree can spawn (read from the harness table and each
// descriptor's own creds, so a new harness, a new creds field or a new provider auth joins by itself), the child env is built
// by the PRODUCT'S OWN road with stand-in values, the scratch import runs in that child, and the child's env is judged: no name
// the road handed survives but the three process marks; none of the stand-in values is anywhere in it; what the person (the
// hub's own untouched name, the remote machine's, a job owner's word) set stays. RED: the mark cut from one road; one handed
// name left out of the mark.
console.log('— the computed mark (B-ba47 follow-up, r979): every road × every harness × every account kind — the import drops exactly what the road handed');
{
  const req = createRequire(import.meta.url);
  const CE = req(path.join(REPO, 'src/conversation-env.js'));
  const HARNESSES = req(path.join(REPO, 'src/harnesses')).list();
  const MP = req(path.join(REPO, 'src/model-providers.js'));
  const { agentEnv } = req(path.join(REPO, 'src/agent-env.js'));
  const { sessionSpawnLine } = req(path.join(REPO, 'src/spawn/line.js'));
  const { buildRemoteExec, acctFolderAssign, acctSecretAssign, keeperRunTail } = req(path.join(REPO, 'src/remote-shell.js'));   // the remote roads' own shapes (主开发 r1043 item 4)
  const { jobRunEnv } = req(path.join(REPO, 'src/jobs.js'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-handed-'));
  process.on('exit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { } });
  let seq = 0; const SV = (tag) => ['sv', tag, process.pid, ++seq].join('-');   // stand-in values, minted per run: never a credential
  const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const SCRATCH_URL2 = pathToFileURL(path.join(REPO, 'scripts/scratch.mjs')).href;
  const CHILD = `await import(${JSON.stringify(SCRATCH_URL2)}); process.stdout.write(JSON.stringify(process.env));`;
  // THE HUB a conversation starts from: its own family (the keeper's folder, the instance, the device and daemon roots — 主开发
  // r985: each is a road to the hub's own keeper or daemon), a name the person set on it that no road touches, the session
  // the person's OWN homes for two harnesses, set on their machine (r1043 item 4): a machine-login conversation never touches them,
  // so they stay — the true form of «the machine login's home stays»; an account kind that sets one replaces (and so marks) it
  const PERSON_HOMES = { CODEX_HOME: path.join(root, 'person-codex-home'), CLAUDE_CONFIG_DIR: path.join(root, 'person-claude-config') };
  const keptHomes = (kenv) => Object.fromEntries(Object.entries(PERSON_HOMES).filter(([n]) => !(n in kenv)));
  const HUB = { PATH: '/usr/bin:/bin', HOME: path.join(root, 'home'), LANG: 'C.UTF-8', VIBESPACE_KEEPER_DIR: path.join(root, SV('keeper')),
    VIBESPACE_INSTANCE_NAME: SV('inst'), VIBESPACE_DEVICE_ROOT: path.join(root, SV('dev')), VIBESPACE_AGENTD_ROOT: path.join(root, SV('agentd')), PERSON_OWN_NAME: 'person-kept', ...PERSON_HOMES };
  const probeProvider = (auth) => ({ id: 'pv-standin', kind: 'self-hosted', label: 'stand-in', preset: 'other', baseUrl: `https://${SV('prov')}.invalid/v1`, auth, wire: 'anthropic-messages', models: [{ id: SV('model') }], defaultModel: '', aliases: {} });
  // THE ACCOUNT KINDS, from each descriptor's own creds: the machine login (no account), an account folder (spawnEnvVar), an
  // isolated home (creds.spawnEnv), each key name (keyEnvVars), the provider plan under every auth the tree knows (MP.AUTHS)
  const kindsOf = (d) => {
    const c = d.creds || {}, out = [{ kind: 'machine login', env: {} }];
    if (typeof c.spawnEnv === 'function') { try { out.push({ kind: 'isolated home', env: c.spawnEnv(path.join(root, SV('acct'))) }); } catch { } }
    else if (c.spawnEnvVar) out.push({ kind: `account folder (${c.spawnEnvVar})`, env: { [c.spawnEnvVar]: path.join(root, SV('acct')) } });
    for (const k of c.keyEnvVars || []) out.push({ kind: `key (${k})`, env: { [k]: SV('key') } });
    if (typeof c.providerSpawn === 'function') for (const auth of MP.AUTHS) {
      try { const sp = c.providerSpawn({ provider: probeProvider(auth), key: SV('pkey'), home: path.join(root, 'provider-homes', 'pv-standin', d.id) }); out.push({ kind: `provider plan (${auth})`, env: (sp && sp.localEnv) || {} }); } catch { }
    }
    return out;
  };
  // the harness's own adapter env (the families: <FAMILY>WEBUI_*) — the adapter as the registry builds it
  const adapterEnv = (d) => { try { return (new d.Adapter(d.adapterConfig({})).buildSessionArgs({ cwd: root, mode: 'chat', resumeId: null }) || {}).env || {}; } catch { return {}; } };
  // the values a road handed that must be gone (a person's session name — HOME set to an isolated account's root among them —
  // stays by rule, so its value is not judged here; the re-home is what replaces such a HOME)
  const vals = (o) => Object.entries(o).filter(([n]) => !CE.PERSON_SESSION_ENV.includes(n)).map(([, v]) => v);
  const sessionNames = () => ({ VIBESPACE_API: `http://${SV('api')}.invalid`, VIBESPACE_SESSION_TOKEN: SV('tok'), CLAUDE_WEBUI_SESSION_ID: SV('sid') });
  const CASES = [];
  for (const d of HARNESSES) for (const k of kindsOf(d)) {
    const fam = adapterEnv(d), names = sessionNames();
    // ROAD (a) — the local line, as the create calls it: the sanitized base, the session's names, the adapter's env, the account
    const base = agentEnv(HUB);
    const env = sessionSpawnLine({ node: process.execPath, wrapper: 'w.js', bufFile: 'b', metaFile: 'm', exe: 'x', env: { ...base, TERM: 'xterm-256color', COLORTERM: 'truecolor', ...names, ...fam, ...k.env },
      pairs: [`PATH=${path.join(root, 'agent-bin')}:${HUB.PATH}`, 'EDITOR=/usr/bin/true'], handedFrom: base }).env;
    CASES.push({ road: 'local', harness: d.id, kind: k.kind, env, handed: CE.handedNames(env, base), values: [...vals(k.env), ...vals(names), ...vals(fam), HUB.VIBESPACE_KEEPER_DIR, HUB.VIBESPACE_INSTANCE_NAME, HUB.VIBESPACE_DEVICE_ROOT, HUB.VIBESPACE_AGENTD_ROOT], keep: { PERSON_OWN_NAME: 'person-kept', LANG: 'C.UTF-8', ...keptHomes(k.env) } });
    // ROAD (b) — the remote command in the remote roads' OWN shapes (r1043 item 4): the token and a key by the dial road's $(cat) form
    // (acctSecretAssign), an account's folder by the quoted folder form (acctFolderAssign, its $HOME expanding on the far side);
    // the session's and the adapter's names as pre-quoted pairs. A provider plan has no remote road («runs on this machine only»).
    if (!/provider plan/.test(k.kind)) {
      const tokFile = path.join(root, SV('tokfile'));
      const tok = SV('rtok'); fs.writeFileSync(tokFile, tok, { mode: 0o600 });
      const secrets = [], folders = [], secretVals = [];
      for (const [n, v] of Object.entries(k.env)) {
        if (/^key /.test(k.kind)) { const kf = path.join(root, SV('keyfile')); fs.writeFileSync(kf, v, { mode: 0o600 }); secrets.push(acctSecretAssign(n, kf)); secretVals.push(v); }
        else if (!CE.PERSON_SESSION_ENV.includes(n)) folders.push(acctFolderAssign(n, `$HOME/.vibespace/${SV('subs')}`));
      }
      const pairs = Object.entries({ ...names, ...fam }).filter(([n]) => n !== 'VIBESPACE_SESSION_TOKEN').map(([n, v]) => shq(`${n}=${v}`));
      const cmd = buildRemoteExec({ cwd: root, shq, tokenAssign: secrets.join('') + acctSecretAssign('VIBESPACE_SESSION_TOKEN', tokFile), acctEnv: folders.join(''), parts: [...pairs, shq(process.execPath), '--input-type=module', '-e', shq(CHILD)] });
      const kNames = Object.keys(k.env).filter((n) => !CE.PERSON_SESSION_ENV.includes(n));
      CASES.push({ road: 'remote', harness: d.id, kind: k.kind, sh: cmd, env: { PATH: HUB.PATH, HOME: HUB.HOME, LANG: 'C.UTF-8', REMOTE_OWN_NAME: 'remote-kept', ...PERSON_HOMES },
        handed: [...new Set(['VIBESPACE_SESSION_CWD', 'VIBESPACE_SESSION_TOKEN', ...Object.keys({ ...names, ...fam }), ...kNames])].filter((n) => !CE.PERSON_SESSION_ENV.includes(n)),
        values: [tok, ...secretVals, ...vals({ ...names, ...fam }).filter((v) => v !== names.VIBESPACE_SESSION_TOKEN)], keep: { REMOTE_OWN_NAME: 'remote-kept', ...keptHomes(k.env) } });
    }
  }
  // ROAD (b′) — the keeper road's TAIL (keeperRunTail): the command ends in ` node <keeper> run <sid> __VS_OFFSET__ -- <cmd>`; a
  // stand-in keeper (the remote machine's) runs what follows its «--» with the env it was born with
  {
    const kbin = path.join(HUB.HOME, '.vibespace', 'bin'); fs.mkdirSync(kbin, { recursive: true });
    fs.writeFileSync(path.join(kbin, 'vibespace-remote-keeper'), "const a = process.argv, i = a.indexOf('--'); const r = require('child_process').spawnSync(a[i + 1], a.slice(i + 2), { stdio: 'inherit' }); process.exit(r.status == null ? 1 : r.status);\n");
    const names = sessionNames(), tokFile = path.join(root, SV('tokfile')), tok = SV('ktok'); fs.writeFileSync(tokFile, tok, { mode: 0o600 });
    const pairs = Object.entries(names).filter(([n]) => n !== 'VIBESPACE_SESSION_TOKEN').map(([n, v]) => shq(`${n}=${v}`));
    const cmd = buildRemoteExec({ cwd: root, shq, tokenAssign: acctSecretAssign('VIBESPACE_SESSION_TOKEN', tokFile), parts: pairs, tail: keeperRunTail({ sid: SV('ksid'), shq, cmd: [shq(process.execPath), '--input-type=module', '-e', shq(CHILD)] }) });
    CASES.push({ road: 'remote', harness: '-', kind: 'the keeper road\'s tail', sh: cmd, env: { PATH: `${path.dirname(process.execPath)}:${HUB.PATH}`, HOME: HUB.HOME, LANG: 'C.UTF-8', REMOTE_OWN_NAME: 'remote-kept', ...PERSON_HOMES },
      handed: ['VIBESPACE_SESSION_CWD', ...Object.keys(names)], values: [tok, ...vals(names).filter((v) => v !== names.VIBESPACE_SESSION_TOKEN)], keep: { REMOTE_OWN_NAME: 'remote-kept', ...PERSON_HOMES } });
  }
  // ROAD (c) — a job's run (src/jobs.js jobRunEnv): the owner's own words (a VIBESPACE_* switch among them) and the hub's additions,
  // the vault plan's names marked (主开发 r985 4 (ii))
  {
    const own = { OWNER_WORD: 'owner-kept', VIBESPACE_SKIP_AGENT_HOOKS: '1' };
    const handed = { VAULT_STANDIN_SECRET: SV('vault'), VIBESPACE_API: `http://${SV('api')}.invalid`, VIBESPACE_JOB_ID: SV('job'), VIBESPACE_JOB_RUN: SV('run'), VIBESPACE_JOB_TOKEN: SV('jtok'), VIBESPACE_JOB_CWD: path.join(root, 'job'), PATH: `${path.join(root, 'bin')}:${HUB.PATH}` };
    const env = jobRunEnv({ own, handed, base: HUB });
    CASES.push({ road: 'job', harness: '-', kind: 'a run with a vault grant', env, handed: Object.keys(handed).filter((n) => n !== 'PATH'), values: Object.values(handed).filter((v) => !v.includes(path.join(root, 'bin'))), keep: own });
  }
  const runCase = (c, envOverride) => new Promise((resolve) => {
    const args = c.sh ? ['sh', ['-c', c.sh]] : [process.execPath, ['--input-type=module', '-e', CHILD]];
    const ch = spawn(args[0], args[1], { env: envOverride || c.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; ch.stdout.on('data', (b) => { out += b; }); ch.stderr.on('data', (b) => { err += b; });
    const t = setTimeout(() => ch.kill('SIGKILL'), 20000);
    ch.on('close', (code) => { clearTimeout(t); let env = null; try { env = JSON.parse(out); } catch { } resolve({ code, env, err: err.slice(0, 16000) }); });   // whole: a plan's names make the line long, its «(by …)» is at its end
  });
  const pool = async (items, n, fn) => { const res = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k]); } })); return res; };
  const MARKS = new Set(CE.CONVERSATION_MARKS);
  const judge = (c, r) => {
    const env = (r && r.env) || null;
    if (!env) return { ok: false, why: 'no env read', err: r && r.err };
    const survived = c.handed.filter((n) => !MARKS.has(n) && n in env);
    // the values judged are the ones this leg MINTED (sv-…): an adapter's own words ('1', 'never') say nothing of a leak
    const leaked = c.values.filter((v) => /\bsv-[a-z]+-\d+-\d+/.test(String(v || ''))).filter((v) => Object.entries(env).some(([k, x]) => !MARKS.has(k) && String(x).includes(String(v))));
    const lost = Object.entries(c.keep).filter(([k, v]) => env[k] !== v).map(([k]) => k);
    const marksOk = c.road === 'job' ? true : !!env.CLAUDE_WEBUI_SESSION_ID;
    return { ok: r.code === 0 && !survived.length && !leaked.length && !lost.length && marksOk && !(CE.HANDED_MARK in env), survived, leaked: leaked.length, lost, marksOk };
  };
  const results = await pool(CASES, 8, runCase);
  const bad = CASES.map((c, i) => ({ c, j: judge(c, results[i]) })).filter((x) => !x.j.ok).map((x) => `${x.c.road}/${x.c.harness}/${x.c.kind}: ${JSON.stringify(x.j)}`);
  const kinds = new Set(CASES.map((c) => c.kind));
  ok(HARNESSES.length >= 4 && CASES.length >= 30 && gateOf([...kinds].some((k) => /provider plan/.test(k))) && gateOf([...kinds].some((k) => /CODEX_HOME/.test(k))) && gateOf([...kinds].some((k) => /isolated home/.test(k))) && !bad.length,
    `EVERY road × harness × account kind (${CASES.length} children: ${HARNESSES.length} harnesses, ${kinds.size} kinds read from their own creds, the local line, the remote command, a job's run): after the import no handed name survives but the three marks, no stand-in value is anywhere in the child's env, and what the person set stays`, bad.slice(0, 4));
  ok(verdictOf(results.filter((r, i) => CASES[i].road !== 'job').every((r) => /\(by the hub's mark\)/.test(r.err))), 'each import says it went by the hub\'s mark (names only)', (results.map((r) => r.err).find((e) => !/\(by the hub's mark\)/.test(e)) || '').slice(-300));
  // RED CONTROLS: the mark cut from one road; one handed name left out of the mark
  const prov = CASES.find((c) => c.road === 'local' && /provider plan/.test(c.kind) && Object.keys(c.env).some((k) => /BASE_URL/.test(k)));
  const urlName = prov && Object.keys(prov.env).find((k) => /BASE_URL/.test(k));
  const cut = prov && Object.fromEntries(Object.entries(prov.env).filter(([k]) => k !== CE.HANDED_MARK));
  const short = prov && { ...prov.env, [CE.HANDED_MARK]: CE.namesOfMark(prov.env[CE.HANDED_MARK]).filter((n) => n !== urlName).join(',') };
  const [rCut, rShort] = prov ? await Promise.all([runCase(prov, cut), runCase(prov, short)]) : [null, null];
  ok(!!prov && !judge(prov, rCut).ok && gateOf(rCut.env) && urlName in rCut.env, `RED CONTROL: the mark cut from the local road — the floor list alone keeps the provider plan's address (${urlName}) in the child`, prov && judge(prov, rCut));
  ok(!!prov && !judge(prov, rShort).ok && gateOf(rShort.env) && urlName in rShort.env && !('VIBESPACE_SESSION_TOKEN' in rShort.env), `RED CONTROL: one handed name (${urlName}) left out of the mark survives the import, while every name the mark holds is gone`, prov && judge(prov, rShort));
}
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
