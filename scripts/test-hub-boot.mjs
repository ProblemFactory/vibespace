#!/usr/bin/env node
// THE SUITES' ONE HUB BOOT — scripts/hub-boot.mjs's legs (P0 of the client/server separation, 2026-11-17).
// A STAND-IN hub (a 20-line server.js written into a minted root: it listens, writes a line to stdout and one to stderr, and
// starts three DETACHED processes the way the real hub's children run — a grandchild through a parent that exits, so no parent
// id reaches it; one with its cwd outside the root and the HOME it was given inside; one with cwd `/`, a HOME outside and the
// device daemon root inside). A second stand-in hub in ANOTHER minted root is the look-alike: same name, same argv shape.
//   ① the root: minted fresh by the helper; a caller's root refused unless the helper made it; `/`, a home, a network mount,
//     the folder holding this checkout and the temp folder refused BY NAME; the tree / HOME / daemon root outside it refused
//   ② start + log: the hub answers, its stdout AND stderr in one file, waitForLog finds the line
//   ③ the rooted judgement on the live processes: cwd / home / daemon-root, the look-alike's none; the grandchild's parent is
//     not the hub (a parent id cannot reach it)
//   ④ hubOnly (a restart leg): only the hub ends, its sessions live on; a second start in the same root reads only its own log
//   ⑤ stop: the hub and EVERYTHING it started across both starts end, by identity; the look-alike and its children untouched
//   ⑥ RESOLVED paths (a fake /proc over real links): a link out of the root is not inside, a link into it makes no insider,
//     the argv is read only when cwd, HOME and the daemon root could not be, a deleted cwd is still the root's
//   ⑦ the identity re-read: a pid whose start time changed between the list and the signal is left alone and SAID
//   ⑧ the exit hook: a suite that exits without a stop leaves no process, no root and no git worktree record
//   ⑨ RED CONTROLS — each a copy of hub-boot.mjs with ONE named edit (scripts/mutant-copy.mjs), judged over a SNAPSHOT of this
//     run's own processes (a fake /proc holding only them) with a recording kill, so a control can never signal anything:
//     a pattern stop, a parent-id stop, no start-time re-read, no minted check, a lexical-only path, a realpath-only path,
//     the argv read although cwd was readable.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import * as HB from './hub-boot.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HB_SRC = fs.readFileSync(path.join(REPO, 'scripts/hub-boot.mjs'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, n = 400) => { for (let i = 0; i < n; i++) { const v = fn(); if (v) return v; await sleep(25); } return fn(); };
const statOf = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'latin1'); const f = st.slice(st.lastIndexOf(')') + 2).split(' '); return { state: f[0], ppid: Number(f[1]), starttime: Number(f[19]) }; } catch { return null; } };
const alive = (pid, starttime) => { const s = statOf(pid); return !!s && s.starttime === starttime && s.state !== 'Z'; };
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e && e.message)); } };

const OUT = scratchDir('hb-out');   // a dir OUTSIDE every minted root
const STANDIN = `'use strict';
const http = require('http'), { spawn } = require('child_process'), path = require('path');
const R = process.env.HB_ROOT, OUT = process.env.HB_OUT, TAG = process.env.HB_TAG, PATH = process.env.PATH;
const keep = (f) => "require('fs').writeFileSync(" + JSON.stringify(f) + ", String(process.pid)); setInterval(() => {}, 1 << 30)";
// g1: a DETACHED GRANDCHILD — started through a parent that exits, so the hub is not its parent; its cwd is in the root
const mid = spawn(process.execPath, ['-e', "require('child_process').spawn(process.execPath, ['-e', " + JSON.stringify(keep(path.join(R, TAG + '-g1.pid'))) + "], { cwd: " + JSON.stringify(path.join(R, 'proj')) + ", detached: true, stdio: 'ignore' }).unref()"], { stdio: 'ignore' });
// g2: cwd OUTSIDE the root, the HOME it was given inside (inherited from the hub)
spawn(process.execPath, ['-e', keep(path.join(R, TAG + '-g2.pid'))], { cwd: OUT, detached: true, stdio: 'ignore', env: { HOME: process.env.HOME, PATH } }).unref();
// g3: cwd '/', a HOME outside, the device daemon root inside
spawn(process.execPath, ['-e', keep(path.join(R, TAG + '-g3.pid'))], { cwd: '/', detached: true, stdio: 'ignore', env: { HOME: OUT, VIBESPACE_DEVICE_ROOT: path.join(R, 'dev'), PATH } }).unref();
mid.on('exit', () => http.createServer((q, s) => s.end('{}')).listen(Number(process.env.PORT), '127.0.0.1', () => {
  console.log('stand-in hub ' + process.pid + ' listening on ' + process.env.PORT);
  console.error('stand-in hub ' + process.pid + ' says this on stderr');
}));
`;
const freePortOf = async () => { const net = await import('node:net'); return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); };
const plant = (root) => { for (const d of ['t', 'proj', 'home', 'dev']) fs.mkdirSync(path.join(root, d), { recursive: true }); fs.writeFileSync(path.join(root, 't', 'server.js'), STANDIN); };
const envFor = (root, tag) => ({ PATH: process.env.PATH, HOME: path.join(root, 'home'), VIBESPACE_VNC_DISPLAY: 'stand-in', VIBESPACE_VNC_PORT: 'stand-in', HB_ROOT: root, HB_OUT: OUT, HB_TAG: tag });
const kidsOf = async (root, tag) => {
  const pids = {};
  for (const g of ['g1', 'g2', 'g3']) pids[g] = await waitFor(() => { try { return Number(fs.readFileSync(path.join(root, `${tag}-${g}.pid`), 'utf8')) || null; } catch { return null; } });
  for (const g of ['g1', 'g2', 'g3']) pids[g] = { pid: pids[g], starttime: pids[g] ? statOf(pids[g])?.starttime : null };
  return pids;
};
const boot = async (H, root, tag, log) => {
  const hub = H.startHub({ root, tree: path.join(root, 't'), port: await freePortOf(), env: envFor(root, tag), ...(log ? { log } : {}) });
  const ready = await hub.ready();
  return { hub, ready, kids: await kidsOf(root, tag) };
};

// ── ① THE ROOT ────────────────────────────────────────────────────────────────
console.log('① the root is minted by the helper; a caller\'s root is refused, the named ones by name');
const A = HB.mintRoot('hb-a'), B = HB.mintRoot('hb-b');
ok(/^\/tmp\/vs-hb-a-h[A-Za-z0-9]{6}$/.test(A) && fs.statSync(A).isDirectory() && fs.existsSync(path.join(A, '.vs-run.json')) && A !== B, `a fresh dir per mint, stamped with this run's record (${A}, ${B})`);
ok(HB.refusalOf(A) === null, 'the minted root itself is refused by no name');
const foreign = scratchDir('hb-foreign'); plant(foreign);
const startAt = (root, extra = {}) => () => HB.startHub({ root, tree: path.join(String(root), 't'), port: 1, env: envFor(String(root), 'x'), ...extra });
const named = [['/', /^.*it is the filesystem root$/], [os.homedir(), /it is a home$/], [path.dirname(os.homedir()), /it is a folder holding a home$/], [path.join(os.homedir(), 'x'), /it is inside a home$/], [path.dirname(REPO), /it is the folder holding this checkout \(the lanes folder\)$/], [REPO, /it is inside the folder holding this checkout/], [os.tmpdir(), /it is the temp folder itself$/], ['/tmp', /it is the temp folder itself$/]];
for (const [r, re] of named) ok(throwsWith(startAt(r), re), `startHub refuses root ${r} by name (${re.source})`);
ok(throwsWith(startAt(foreign), /did not mint it/), `a /tmp root the helper did not mint (${foreign}) is refused: it may be another run's`);
ok(throwsWith(() => HB.startHub({ tree: path.join(A, 't'), port: 1, env: envFor(A, 'x') }), /a minted root is required/), 'no root at all is refused');
ok(HB.refusalOf(OUT, { homes: [], mounts: [], checkout: '/nonexistent/checkout', temps: [path.join(OUT, 'tmpx')] }) === 'a folder holding the temp folder', 'a root holding the temp folder is refused as such');
const fakeMount = path.join(OUT, 'mnt');
ok(HB.refusalOf(fakeMount, { mounts: [fakeMount] }) === 'a network mount (the workspace mount)' && HB.refusalOf(path.join(fakeMount, 'x'), { mounts: [fakeMount] }) === 'inside a network mount (the workspace mount)' && HB.refusalOf(OUT, { mounts: [fakeMount] }) === 'a folder holding a network mount (the workspace mount)',
  'a root inside or holding a network mount is refused as the workspace mount');
const mi = path.join(OUT, 'mountinfo');
fs.writeFileSync(mi, ['22 1 0:21 / /proc rw - proc proc rw', '90 29 0:50 / /srv/work\\040space rw - fuse.bindfs bindfs rw', '91 29 0:51 / /mnt/share rw - nfs4 srv:/x rw', '92 29 0:52 / /run/x rw - tmpfs tmpfs rw'].join('\n'));
ok(JSON.stringify(HB.networkMounts(mi)) === JSON.stringify(['/srv/work space', '/mnt/share']), 'networkMounts reads the network / FUSE mount points (an escaped space decoded), never proc or tmpfs', HB.networkMounts(mi));
plant(A); plant(B);
ok(throwsWith(() => HB.startHub({ root: A, tree: path.join(foreign, 't'), port: 1, env: envFor(A, 'x') }), /must lie in the minted root/), 'a tree outside the minted root is refused');
ok(throwsWith(() => HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: { ...envFor(A, 'x'), HOME: OUT } }), /HOME .* must lie in the minted root/), 'a HOME outside the minted root is refused');
ok(throwsWith(() => HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: { ...envFor(A, 'x'), VIBESPACE_AGENTD_ROOT: OUT } }), /VIBESPACE_AGENTD_ROOT .* must lie in the minted root/), 'a daemon root outside the minted root is refused');
ok(throwsWith(() => HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: { ...envFor(A, 'x'), VIBESPACE_VNC_PORT: '' } }), /singleton-Desktop names/), 'an env without the per-run singleton-Desktop names is refused (test-architecture §57 kept at the one boot site)');

// ── ② START + LOG ─────────────────────────────────────────────────────────────
console.log('② start + log');
const a1 = await boot(HB, A, 'a1');
const b1 = await boot(HB, B, 'b1');
ok(a1.ready && b1.ready, 'both stand-in hubs answered GET /api/home');
ok(Number.isInteger(a1.hub.pid) && a1.hub.starttime === statOf(a1.hub.pid)?.starttime, `the hub's pid and start time were recorded at its spawn (${a1.hub.pid} @ ${a1.hub.starttime})`);
const line = await a1.hub.waitForLog(/listening on/);
ok(line === `stand-in hub ${a1.hub.pid} listening on ${a1.hub.port}`, 'waitForLog returns the hub\'s own stdout line', line);
ok(a1.hub.logFile === path.join(A, 'hub.log') && a1.hub.log().includes(`stand-in hub ${a1.hub.pid} says this on stderr`), 'stdout and stderr in ONE file in the root (<root>/hub.log)');
ok(throwsWith(() => HB.startHub({ root: A, tree: path.join(A, 't'), port: 1, env: envFor(A, 'x') }), /still writes .*hub\.log/), 'a second start on a log a running hub still writes is refused');

// ── ③ THE ROOTED JUDGEMENT, LIVE ──────────────────────────────────────────────
console.log('③ the rooted judgement over the live processes');
const viaOf = (root) => Object.fromEntries(HB.rootedProcesses(root).map((x) => [x.pid, x.via]));
const vA = viaOf(A);
const wantA = { [a1.hub.pid]: 'cwd', [a1.kids.g1.pid]: 'cwd', [a1.kids.g2.pid]: 'home', [a1.kids.g3.pid]: 'daemon-root' };
ok(JSON.stringify(vA) === JSON.stringify(Object.fromEntries(Object.entries(wantA).sort((x, y) => x[0] - y[0]))), 'rooted in A: the hub + g1 by cwd, g2 by the HOME it was given, g3 by the daemon root it was given — and nothing else', vA);
const bPids = [b1.hub.pid, b1.kids.g1.pid, b1.kids.g2.pid, b1.kids.g3.pid];
ok(bPids.every((p) => !(p in vA)) && Object.keys(viaOf(B)).length === 4, 'the look-alike hub in B (same name, same argv) and its children are not rooted in A');
ok(statOf(a1.kids.g1.pid).ppid !== a1.hub.pid && statOf(a1.kids.g2.pid).ppid === a1.hub.pid, `the grandchild's parent is not the hub (ppid ${statOf(a1.kids.g1.pid).ppid}) — a parent id cannot reach it; g2 is still the hub's child`);

// ⑨'s snapshot: a fake /proc holding ONLY this run's own processes, taken while they all live
const SNAP = scratchDir('hb-snap');
const snapPids = [a1.hub.pid, a1.kids.g1.pid, a1.kids.g2.pid, a1.kids.g3.pid, ...bPids];
for (const pid of snapPids) {
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
ok(['g1', 'g2', 'g3'].every((g) => alive(a1.kids[g].pid, a1.kids[g].starttime)), 'its detached children live on (a session outlives a hub restart)');
const a2 = await boot(HB, A, 'a2');
ok(a2.ready && a2.hub.log().includes(`stand-in hub ${a2.hub.pid} listening`) && !a2.hub.log().includes(`stand-in hub ${a1.hub.pid} `), 'the second start reads only its own lines of the same log');

// ── ⑤ STOP ────────────────────────────────────────────────────────────────────
console.log('⑤ stop: the hub and everything it started, by identity');
const everything = [{ pid: a2.hub.pid }, ...['g1', 'g2', 'g3'].flatMap((g) => [a1.kids[g], a2.kids[g]])];
const r2 = a2.hub.stop();
const got = new Set(r2.signalled.map((x) => x.pid));
ok(everything.every((x) => got.has(x.pid)) && r2.signalled.length === everything.length && !r2.left.some((x) => x.why !== 'gone'), `stop signalled the hub + the six children of BOTH starts — ${r2.signalled.length} processes, by identity`, r2);
ok(await waitFor(() => everything.slice(1).every((x) => !alive(x.pid, x.starttime))) && await waitFor(() => a2.hub.child.exitCode !== null || a2.hub.child.signalCode), 'all of them ended');
ok(alive(b1.hub.pid, b1.hub.starttime) && ['g1', 'g2', 'g3'].every((g) => alive(b1.kids[g].pid, b1.kids[g].starttime)), 'the look-alike hub in B and its three children are untouched');

// ── ⑥ RESOLVED PATHS ──────────────────────────────────────────────────────────
console.log('⑥ rooted on RESOLVED paths');
const R = HB.mintRoot('hb-r'); fs.mkdirSync(path.join(R, 'in')); fs.symlinkSync(OUT, path.join(R, 'out')); fs.symlinkSync(path.join(R, 'in'), path.join(OUT, 'into'));
const FAKE = scratchDir('hb-fake');
const fake = (pid, { cwd = null, env = null, argv = null, starttime = 1000 } = {}) => {
  const d = path.join(FAKE, String(pid)); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'stat'), `${pid} (x) S 1 ${pid} ${pid} 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${starttime} 0 0`);
  if (cwd) fs.symlinkSync(cwd, path.join(d, 'cwd'));
  if (env) fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
  if (argv) fs.writeFileSync(path.join(d, 'cmdline'), argv.join('\0') + '\0');
};
fake(5001, { cwd: path.join(R, 'in') });
fake(5002, { cwd: OUT, env: { HOME: path.join(R, 'out') } });                         // a link OUT of the root
fake(5003, { cwd: OUT, env: { HOME: path.join(OUT, 'into') } });                      // a link INTO the root
fake(5004, { argv: ['chrome', `--user-data-dir=${path.join(R, 'in', 'p')}`] });       // cwd + environ unreadable
fake(5005, { cwd: OUT, env: { HOME: OUT }, argv: ['x', path.join(R, 'in')] });        // cwd readable: the argv is not read
fake(5006, { env: { VIBESPACE_DEVICE_ROOT: path.join(R, 'dev') } });                  // cwd unreadable, the daemon root
fake(5007, { cwd: `${path.join(R, 'in')} (deleted)` });                               // a deleted cwd in the root
fake(5008, { cwd: path.join(R, 'in'), env: { HOME: path.join(R, 'out', 'h') } });     // cwd decides first
const fv = Object.fromEntries(HB.rootedProcesses(R, { procRoot: FAKE }).map((x) => [x.pid, x.via]));
const wantF = { 5001: 'cwd', 5004: 'argv', 5006: 'daemon-root', 5007: 'cwd', 5008: 'cwd' };
ok(JSON.stringify(fv) === JSON.stringify(wantF), 'cwd / home / daemon-root in order; a link out (5002) and a link in (5003) are not inside; the argv only when nothing else was readable (5004 yes, 5005 no); a deleted cwd is still the root\'s', fv);

// ── ⑦ THE IDENTITY RE-READ ────────────────────────────────────────────────────
console.log('⑦ a start time that changed between the list and the signal');
const listed = HB.rootedProcesses(R, { procRoot: FAKE });
fs.writeFileSync(path.join(FAKE, '5001', 'stat'), `5001 (x) S 1 5001 5001 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 2000 0 0`);
fs.rmSync(path.join(FAKE, '5006'), { recursive: true });
const rec = [], said = [];
const w0 = fs.writeSync;
fs.writeSync = (fd, s, ...rest) => { if (fd === 2 && String(s).startsWith('hub-boot: ')) { said.push(String(s)); return String(s).length; } return w0(fd, s, ...rest); };
let r7; try { r7 = HB.endByIdentity(listed, { procRoot: FAKE, kill: (pid) => rec.push(pid) }); } finally { fs.writeSync = w0; }
ok(!rec.includes(5001) && r7.left.some((x) => x.pid === 5001 && x.why === 'start time changed'), 'the recycled pid 5001 is left alone', r7);
ok(said.length === 1 && /left pid 5001 alone — listed with start time 1000, it reads 2000 now/.test(said[0]), 'and SAID on stderr — one line, the gone 5006 silent', said);
ok(!rec.includes(5006) && r7.left.some((x) => x.pid === 5006 && x.why === 'gone') && [5004, 5007, 5008].every((p) => rec.includes(p)), 'the gone pid is not signalled; the unchanged ones are');

// ── ⑧ THE EXIT HOOK ───────────────────────────────────────────────────────────
console.log('⑧ a suite that exits without a stop leaves nothing');
// a one-commit scratch repository; the child PLANTS a linked worktree of it in its root in git's own layout
// (.git/worktrees/<n>/{gitdir,commondir,HEAD} + the dir's `.git` file) — git lists it like any other, and no checkout is made
// (a `git worktree add` is a checkout, which THE TIER RULE keeps out of the fast tier)
const GREPO = path.join(OUT, 'repo');
const git = (...a) => spawnSync('git', a, { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: OUT, GIT_CONFIG_NOSYSTEM: '1' } });
git('init', '-q', GREPO); git('-C', GREPO, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'one');
const childOf = (url) => `import * as HB from ${JSON.stringify(url)};
import fs from 'node:fs'; import path from 'node:path'; import net from 'node:net'; import { spawnSync } from 'node:child_process';
const root = HB.mintRoot('hb-exit');
for (const d of ['t', 'proj', 'home', 'dev']) fs.mkdirSync(path.join(root, d), { recursive: true });
fs.writeFileSync(path.join(root, 't', 'server.js'), process.env.HB_STANDIN);
const meta = path.join(process.env.HB_GREPO, '.git', 'worktrees', 'wt'); fs.mkdirSync(meta, { recursive: true }); fs.mkdirSync(path.join(root, 'wt'));
fs.writeFileSync(path.join(root, 'wt', '.git'), 'gitdir: ' + meta + '\\n'); fs.writeFileSync(path.join(meta, 'gitdir'), path.join(root, 'wt', '.git') + '\\n');
fs.writeFileSync(path.join(meta, 'commondir'), '../..\\n'); fs.writeFileSync(path.join(meta, 'HEAD'), process.env.HB_HEAD + '\\n');
const listed = spawnSync('git', ['-C', process.env.HB_GREPO, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }).stdout.includes(path.join(root, 'wt'));
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const hub = HB.startHub({ root, tree: path.join(root, 't'), port, env: { PATH: process.env.PATH, HOME: path.join(root, 'home'), VIBESPACE_VNC_DISPLAY: 's', VIBESPACE_VNC_PORT: 's', HB_ROOT: root, HB_OUT: process.env.HB_OUT, HB_TAG: 'e' } });
await hub.ready();
const pids = [];
for (let i = 0; i < 400 && pids.length < 3; i++) { pids.length = 0; for (const g of ['g1', 'g2', 'g3']) { try { pids.push(Number(fs.readFileSync(path.join(root, 'e-' + g + '.pid'), 'utf8'))); } catch {} } if (pids.length < 3) await new Promise((r) => setTimeout(r, 25)); }
console.log(JSON.stringify({ root, pids: [hub.pid, ...pids], wt: listed }));
process.exit(3);   // a red: no stop, no cleanup of its own
`;
const runChild = (url) => spawnSync(process.execPath, ['--input-type=module', '-e', childOf(url)], { env: { PATH: process.env.PATH, HOME: OUT, GIT_CONFIG_NOSYSTEM: '1', HB_STANDIN: STANDIN, HB_OUT: OUT, HB_GREPO: GREPO, HB_HEAD: git('-C', GREPO, 'rev-parse', 'HEAD').stdout.trim() }, encoding: 'utf8', timeout: 60000 });
const ex = runChild(pathToFileURL(path.join(REPO, 'scripts/hub-boot.mjs')).href);
let exo = null; try { exo = JSON.parse(ex.stdout.trim().split('\n').pop()); } catch { /* judged below */ }
ok(ex.status === 3 && exo && exo.pids.length === 4 && exo.wt, 'the child suite planted a git worktree in its root (git lists it), booted a stand-in hub (4 processes) and exited 3 without a stop', { status: ex.status, out: ex.stdout.slice(-200), err: ex.stderr.slice(0, 600) });
ok(exo && !fs.existsSync(exo.root), 'its minted root is gone');
const wl = git('-C', GREPO, 'worktree', 'list', '--porcelain').stdout;
ok(exo && wl.split('\n').filter((l) => l.startsWith('worktree ')).length === 1 && !wl.includes(exo.root), 'and its git worktree went THROUGH GIT — the repository keeps no record of it', wl);
ok(exo && await waitFor(() => exo.pids.every((p) => { const s = statOf(p); return !s || s.state === 'Z'; })), 'and every process its hub started is gone', exo && exo.pids.map((p) => statOf(p)));

// ── ⑨ RED CONTROLS ────────────────────────────────────────────────────────────
console.log('⑨ red controls — each judged over the SNAPSHOT of this run\'s own processes with a recording kill');
const M = mutantCopies('hub-boot', REPO);
const patch = (a, b) => { if (!HB_SRC.includes(a)) throw new Error('control patch no longer applies: ' + a.slice(0, 80)); return HB_SRC.replace(a, b); };
const mutant = async (tag, src) => import(pathToFileURL(M.write('scripts/hub-boot.mjs', src, tag, { esm: true })).href);
const hubA = { pid: a1.hub.pid, starttime: a1.hub.starttime, root: A };
const ended = (H) => { const got = new Set(); H.endHub({ ...hubA, procRoot: SNAP, kill: (pid) => got.add(pid) }); return got; };
const same = (s) => s.size === aSet.size && [...aSet].every((p) => s.has(p));
ok(same(ended(HB)), 'THE HELPER over the snapshot: exactly A\'s four (the hub, g1, g2, g3) — the controls below are judged against this');
const PAT = await mutant('pattern', patch('  let read = false;\n', "  try { if (fs.readFileSync(`${procRoot}/${pid}/cmdline`, 'utf8').split('\\0').includes('server.js')) return 'argv'; } catch { /* control */ }\n  let read = false;\n"));
const sP = ended(PAT);
const exN = runChild(pathToFileURL(M.write('scripts/hub-boot.mjs', patch('    try { removeWorktrees(root); } catch { /* best effort at exit */ }\n', ''), 'noworktree', { esm: true })).href);
let exNo = null; try { exNo = JSON.parse(exN.stdout.trim().split('\n').pop()); } catch { /* judged below */ }
const wlN = git('-C', GREPO, 'worktree', 'list', '--porcelain').stdout;
ok(exNo && exNo.wt && wlN.includes(path.join(exNo.root, 'wt')), 'CONTROL no worktree removal at exit — RED: the repository keeps a record of a worktree whose directory is gone', wlN);
ok(exNo && await waitFor(() => exNo.pids.every((p) => { const s = statOf(p); return !s || s.state === 'Z'; })), '(that control\'s child still ended every process its hub started)');
ok(!same(sP) && sP.has(b1.hub.pid), 'CONTROL a pattern stop (argv names server.js) — RED: it reaches the look-alike hub in B', [...sP]);
const PPID = await mutant('ppid', patch('  const rest = endRooted(root, { signal, procRoot, kill, done: new Set([`${pid}:${starttime}`]) });', "  const kids = []; for (const d of fs.readdirSync(procRoot).filter((x) => /^\\d+$/.test(x))) { try { const st = fs.readFileSync(`${procRoot}/${d}/stat`, 'latin1'); if (Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]) === pid) kids.push({ pid: Number(d), starttime: starttimeOf(Number(d), procRoot) }); } catch { /* control */ } }\n  const rest = endByIdentity(kids, { signal, procRoot, kill });"));
const sQ = ended(PPID);
ok(!same(sQ) && !sQ.has(a1.kids.g1.pid), 'CONTROL a parent-id stop — RED: the detached grandchild g1 is missed', [...sQ]);
const NOREREAD = await mutant('noreread', patch("    if (now !== starttime) {", "    if (false) {"));
const recN = []; NOREREAD.endByIdentity([{ pid: 5001, starttime: 1000 }], { procRoot: FAKE, kill: (pid) => recN.push(pid) });
const recO = []; HB.endByIdentity([{ pid: 5001, starttime: 1000 }], { procRoot: FAKE, kill: (pid) => recO.push(pid) });
ok(recN.includes(5001) && !recO.includes(5001), 'CONTROL no start-time re-read — RED: the recycled pid 5001 is signalled (the helper: not)', { mutant: recN, helper: recO });
const NOMINT = await mutant('nomint', patch('  if (!MINTED.has(r)) throw', '  if (false) throw'));
let eN = ''; try { NOMINT.startHub({ root: foreign, tree: path.join(foreign, 'none'), port: 1, env: envFor(foreign, 'x') }); } catch (e) { eN = String(e.message); }
ok(!/did not mint it/.test(eN), 'CONTROL no minted check — RED: a root the helper did not make is no longer refused for that', eN);
const LEX = await mutant('lexical', patch('return isIn(lex, r) && isIn(real(lex), r); };', 'return isIn(lex, r); };'));
const REAL = await mutant('realpath', patch('return isIn(lex, r) && isIn(real(lex), r); };', 'return isIn(real(lex), r); };'));
const ARGV = await mutant('argv', patch('  if (read) return null;\n', ''));
const viaWith = (H) => Object.fromEntries(H.rootedProcesses(R, { procRoot: FAKE }).map((x) => [x.pid, x.via]));
ok('5002' in viaWith(LEX), 'CONTROL a lexical-only path — RED: the link OUT of the root (5002) counts as inside', viaWith(LEX));
ok('5003' in viaWith(REAL), 'CONTROL a realpath-only path — RED: the link INTO the root (5003) makes an insider', viaWith(REAL));
ok('5005' in viaWith(ARGV), 'CONTROL the argv read although cwd was readable — RED: 5005 counts by its argument', viaWith(ARGV));

// ── END ───────────────────────────────────────────────────────────────────────
const rb = b1.hub.stop();
ok(rb.signalled.length === 4 && await waitFor(() => bPids.slice(1).every((p, i) => !alive(p, b1.kids[['g1', 'g2', 'g3'][i]].starttime))), 'B\'s own stop ends B\'s four', rb);
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
