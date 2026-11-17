// THE SUITES' ONE HUB BOOT (P0 of the client/server separation, 2026-11-17). Every suite that runs a hub starts it, reads
// its output and stops it HERE — so when the hub becomes several processes, this file changes, not two hundred suites.
// NOT a test-*.mjs on purpose (like scratch.mjs: the tier census would demand a tier). Its legs: scripts/test-hub-boot.mjs.
//
//   mintRoot(name) → root
//     A FRESH directory the helper creates itself (mkdtemp `/tmp/vs-<name>-h??????`), stamped with this run's record (the
//     gate's reaper reads the owner as alive). A hub runs ONLY in a root minted here, by this process: a root handed in by a
//     caller is refused unless the helper made it, so no run names another run's root. Refused BY NAME, the most precise name
//     first: a root that IS the filesystem root, a home, a network mount (the workspace mount), this checkout, the folder
//     holding this checkout (the lanes folder) or the temp folder; one that HOLDS any of them; one INSIDE a home, a network
//     mount or this checkout. A root inside the temp folder is the point (every mint is one), and a root inside the folder
//     holding the checkout is not refused either — the gate's own isolated worktree lives directly under the temp folder, so
//     that folder IS the temp folder there. A mount table that cannot be read refuses the mint (never «no mounts»).
//     The first mint ARMS, once: the exit event, and SIGTERM / SIGINT / SIGHUP, each ending with exit(128 + its number) so the
//     exit's end runs — a suite ended by a signal (the gate's timeout) leaves nothing; no suite carries a signal line of its own.
//   startHub({ root, tree, port, env, nodeArgs, args, log }) → hub
//     spawns `node [...nodeArgs] server.js [...args]` in `tree` (inside `root`) with the suite's env + PORT. The env MUST carry a
//     HOME in the root (the hub's children are ended by it), and a device daemon root (VIBESPACE_DEVICE_ROOT /
//     VIBESPACE_AGENTD_ROOT), when given, must lie in the root too (resolved: a link out is refused), and the env must carry the per-run singleton-Desktop names (scratch.mjs vncEnv — test-architecture
//     §57's law, kept at the one boot site). The hub's stdout and stderr go to ONE file, `<root>/<log>.log` (default `hub`;
//     two hubs running at once in one root name two logs); its pid and start time are recorded at the spawn. Nothing is
//     stopped or cleaned at a start. Hubs that must outlive each other's stop take a root each.
//   hub.ready({ ms, path }) → true | false — waits (bounded, never throws) until GET <path> (default /api/home) answers.
//   hub.log() → what THIS start wrote to the log so far · hub.waitForLog(re, ms) → the first matching line | null
//   hub.stop({ signal, hubOnly }) → { signalled: [{pid, via}], left: [{pid, why}] } — ends the hub and EVERYTHING IT STARTED,
//     BY IDENTITY, never by a name, a pattern, a parent id or a working directory (the kill law):
//     ① the hub: the pid AND start time recorded at its spawn, re-read just before the signal;
//     ② (unless hubOnly — a restart leg whose sessions must outlive the hub) every process whose READABLE environ carries a
//        value the helper handed out and startHub checked: the HOME inside the root, or the daemon root inside the root (in
//        that order; both judged on resolved paths — a link out of the root is not inside, a link into it makes no insider).
//        A process whose cwd or argv alone lies in the root (a person's shell that cd'd in to watch the log, a suite's own
//        Chrome) is SAID on stderr and left alone. The start time is read before AND after that judgement (it belongs to one
//        process), and again just before the signal: one that changed is left alone and SAID. Passes repeat (≤ 3) until one
//        lists nothing new — a process forked between a list and its signal is caught by the next.
//   At exit (and after an armed signal): in every minted root, each hub, everything rooted, every git worktree directly in it
//     (removed THROUGH GIT), then the root — unless a mount point lies inside it (then it stays, and that is said).
//   Synchronous end: it runs inside an 'exit' handler.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { stampScratchRun } from './scratch-run.mjs';
const require = createRequire(import.meta.url);
const { FIXTURE_CWD_PREFIX, TMP_ROOTS } = require('../src/fixture-guard.js');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** src/agentd/agentd.js ROOT: VIBESPACE_DEVICE_ROOT, else VIBESPACE_AGENTD_ROOT (scratch.mjs DAEMON_ROOT_ENV). */
export const DAEMON_ROOT_ENV = Object.freeze(['VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT']);
/** A network or FUSE file system — the workspace mount's kind (a bindfs view over an NFS share on a dev box). */
const NETWORK_FS = /^(?:nfs4?|cifs|smb3?|9p|ceph|glusterfs|fuse\..+)$/;

/** A path RESOLVED: its realpath, or — when it does not exist (yet, or any more) — its deepest existing ancestor's realpath with the
 *  rest appended, so a missing name under a link out of the root still resolves outside it. */
const real = (p) => { const r = path.resolve(String(p)); try { return fs.realpathSync(r); } catch { const d = path.dirname(r); return d === r ? r : path.join(real(d), path.basename(r)); } };
const isIn = (p, dir) => p === dir || p.startsWith(dir === '/' ? '/' : dir + '/');

/** The mount table's rows (/proc/self/mountinfo: field 5 = the mount point, already canonical — never resolved, a stale network
 *  mount would hang a stat; the fstype after « - »), or null when the table cannot be read. */
function mountRows(mountinfo = '/proc/self/mountinfo') {
  let t; try { t = fs.readFileSync(mountinfo, 'utf8'); } catch { return null; }
  const out = [];
  for (const line of t.split('\n')) {
    const [pre, post] = line.split(' - ');
    if (!post) continue;
    const mp = (pre.split(' ')[4] || '').replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
    if (mp) out.push({ mp, fstype: post.split(' ')[0] });
  }
  return out;
}
/** The network / FUSE mount points of this machine — null when the mount table cannot be read. */
export function networkMounts(mountinfo) { const rows = mountRows(mountinfo); return rows && rows.filter((x) => NETWORK_FS.test(x.fstype)).map((x) => x.mp); }
/** Every mount point lying inside `dir` — null when the mount table cannot be read. */
export function mountsInside(dir, mountinfo) { const rows = mountRows(mountinfo); return rows && rows.map((x) => x.mp).filter((mp) => mp !== dir && isIn(mp, dir)); }

export const UNJUDGEABLE = 'a root the helper cannot judge: the mount table cannot be read';
/** WHY a root is refused by name, or null. Three rounds, the most precise name first: a root that IS the filesystem root, a home,
 *  a network mount, this checkout, the folder holding it or the temp folder; then one that HOLDS any of them; then one INSIDE a
 *  home, a network mount or this checkout (never «inside» the checkout's parent, never «inside» the temp folder). Homes and mount
 *  points are compared as written (never resolved); the root itself is resolved. */
export function refusalOf(root, { homes = null, mounts = null, checkout = REPO, temps = null, mountinfo } = {}) {
  const p = real(String(root || '/'));
  const M = mounts ?? networkMounts(mountinfo);
  if (!M) return UNJUDGEABLE;
  const C = real(checkout);
  const named = [
    ['the filesystem root', ['/']],
    ['a home', (homes ?? [os.homedir(), process.env.HOME, '/root']).filter(Boolean).map((h) => path.resolve(h))],
    ['a network mount (the workspace mount)', M],
    ['this checkout', [C]],
    ['the folder holding this checkout (the lanes folder)', [path.dirname(C)]],
    ['the temp folder itself', (temps ?? [os.tmpdir(), ...TMP_ROOTS]).map(real)],
  ];
  for (const [why, xs] of named) if (xs.includes(p)) return why;
  for (const [why, xs] of named) if (xs.some((x) => isIn(x, p))) return `a folder holding ${why.replace(/ itself$/, '')}`;
  for (const [why, xs] of named.slice(1, 4)) if (xs.some((x) => isIn(p, x))) return `inside ${why}`;
  return null;
}

const MINTED = new Map();   // resolved root → { hubs: [] } — this process's mints only
let armed = false;
const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];

/** A fresh root for one suite's hub(s): `/tmp/vs-<name>-h??????`, created here (mkdtemp), stamped with this run's record. The
 *  first mint arms the end: the exit event, and each of SIGTERM / SIGINT / SIGHUP → exit(128 + its number). */
export function mintRoot(name) {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(name))) throw new Error(`hub-boot: mintRoot(): bad name ${JSON.stringify(name)}`);
  const root = real(fs.mkdtempSync(path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}${name}-h`)));
  const why = refusalOf(root);
  if (why) { fs.rmdirSync(root); throw new Error(`hub-boot: the minted root ${root} is ${why} — refused`); }
  stampScratchRun(root);
  MINTED.set(root, { hubs: [] });
  if (!armed) {
    armed = true;
    process.on('exit', endAll);
    for (const sig of SIGNALS) process.on(sig, () => process.exit(128 + os.constants.signals[sig]));
  }
  return root;
}

/** The minted root `root` names (resolved), or a throw that names why it is refused. */
function ownRoot(root) {
  const why = refusalOf(root);
  if (why) throw new Error(`hub-boot: refusing root ${JSON.stringify(root)} — it is ${why}`);
  const r = real(String(root || ''));
  if (!MINTED.has(r)) throw new Error(`hub-boot: refusing root ${JSON.stringify(root)} — the helper did not mint it (mintRoot), so it may be another run's`);
  return r;
}

/** A /proc pid's start time (clock ticks since boot, field 22 of stat) — null when it is gone or unreadable. */
export function starttimeOf(pid, procRoot = '/proc') {
  try { const st = fs.readFileSync(`${procRoot}/${pid}/stat`, 'latin1'); return Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[19]); } catch { return null; }
}
const commOf = (pid, procRoot) => { try { return fs.readFileSync(`${procRoot}/${pid}/comm`, 'utf8').trim(); } catch { return '?'; } };

/** Inside `r` on RESOLVED paths: the value as written AND what it resolves to both lie in `r` — a link out of the root is not
 *  inside, a link into it does not make an outsider an insider; a missing name is resolved through its existing ancestors. (The
 *  resolution runs only for a value already written inside the root — never a stat of an outside path.) */
const insideRoot = (v, r) => { if (!v || !path.isAbsolute(v)) return false; const lex = path.resolve(v); return isIn(lex, r) && isIn(real(lex), r); };

/** THE ROOTED JUDGEMENT of one pid → { via: 'home' | 'daemon-root' | null, near: 'cwd' | 'argv' | null }. SELECTED (via) only by
 *  its READABLE environ: the HOME inside the root, else a daemon root inside the root — values the helper handed out. A cwd or an
 *  argv path in the root alone is `near`: said, never signalled. */
export function rootedVia(pid, r, procRoot = '/proc') {
  let env = null; try { env = fs.readFileSync(`${procRoot}/${pid}/environ`, 'utf8').split('\0'); } catch { /* not ours to read, or gone */ }
  const val = (k) => { const kv = env && env.find((x) => x.startsWith(k + '=')); return kv ? kv.slice(k.length + 1) : null; };
  if (env) {
    if (insideRoot(val('HOME'), r)) return { via: 'home', near: null };
    for (const k of DAEMON_ROOT_ENV) if (insideRoot(val(k), r)) return { via: 'daemon-root', near: null };
  }
  try { if (insideRoot(fs.readlinkSync(`${procRoot}/${pid}/cwd`).replace(/ \(deleted\)$/, ''), r)) return { via: null, near: 'cwd' }; } catch { /* unreadable */ }
  try {
    const toks = fs.readFileSync(`${procRoot}/${pid}/cmdline`, 'utf8').split('\0');
    if (toks.some((t) => insideRoot(t, r) || (t.includes('=') && insideRoot(t.slice(t.indexOf('=') + 1), r)))) return { via: null, near: 'argv' };
  } catch { /* gone */ }
  return { via: null, near: null };
}

/** The processes ROOTED in `root` (selected by the environ), never `self` or its ancestors — each {pid, starttime, via}; the
 *  cwd-only / argv-only ones go to `near` when given. The start time is read before AND after the judgement and must not move.
 *  PURE over `procRoot` (a fake /proc in the suite's legs). */
export function rootedProcesses(root, { procRoot = '/proc', self = process.pid, near = null } = {}) {
  const r = real(String(root));
  const skip = new Set();
  for (let q = self; q > 1 && !skip.has(q);) {
    skip.add(q);
    try { const st = fs.readFileSync(`${procRoot}/${q}/stat`, 'latin1'); q = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); } catch { break; }
  }
  const out = [];
  let pids = []; try { pids = fs.readdirSync(procRoot).filter((d) => /^\d+$/.test(d)).map(Number); } catch { return out; }
  for (const pid of pids) {
    if (skip.has(pid)) continue;
    const st0 = starttimeOf(pid, procRoot);
    if (st0 == null) continue;
    const j = rootedVia(pid, r, procRoot);
    if (!j.via && !j.near) continue;
    if (starttimeOf(pid, procRoot) !== st0) continue;   // the judgement read another process than the start time did
    if (j.via) out.push({ pid, starttime: st0, via: j.via });
    else if (near) near.push({ pid, starttime: st0, near: j.near });
  }
  return out;
}

const say = (line) => { try { fs.writeSync(2, `hub-boot: ${line}\n`); } catch { /* no stderr */ } };

/** Signal each {pid, starttime} ONLY while that pid is still there with that start time, read again just before the signal.
 *  → { signalled: [{pid, via}], left: [{pid, why}] }; a changed start time is SAID. */
export function endByIdentity(list, { signal = 'SIGKILL', procRoot = '/proc', kill = (pid, sig) => process.kill(pid, sig) } = {}) {
  const signalled = [], left = [];
  for (const { pid, starttime, via = null } of list) {
    if (!Number.isInteger(pid) || pid <= 0) { left.push({ pid, why: 'no pid' }); continue; }
    const now = starttimeOf(pid, procRoot);
    if (now === null) { left.push({ pid, why: 'gone' }); continue; }
    if (now !== starttime) { left.push({ pid, why: 'start time changed' }); say(`left pid ${pid} alone — listed with start time ${starttime}, it reads ${now} now (another process holds that pid)`); continue; }
    try { kill(pid, signal); signalled.push({ pid, via }); } catch (e) { left.push({ pid, why: e && e.code === 'EPERM' ? 'not ours to signal' : 'gone' }); }
  }
  return { signalled, left };
}

const settle = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* no wait */ } };

/** Everything rooted in `root`, ended by identity, pass after pass (≤ 3) until a pass lists nothing NEW — a process forked
 *  between a list and its signals shows in the next. `done` = the identities already ended (pid:starttime). A cwd-only or
 *  argv-only match is SAID once and left. */
export function endRooted(root, { signal = 'SIGKILL', procRoot = '/proc', kill, done = new Set() } = {}) {
  const signalled = [], left = [], said = new Set();
  for (let pass = 0; pass < 3; pass++) {
    if (pass) settle(50);
    const near = [];
    const fresh = rootedProcesses(root, { procRoot, near }).filter((x) => !done.has(`${x.pid}:${x.starttime}`));
    for (const n of near) {
      if (said.has(`${n.pid}:${n.starttime}`)) continue;
      said.add(`${n.pid}:${n.starttime}`);
      left.push({ pid: n.pid, why: `its ${n.near} only` });
      say(`left pid ${n.pid} (${commOf(n.pid, procRoot)}) alone — its ${n.near === 'cwd' ? 'working directory' : 'argv'} lies in ${root}, but its environ carries no HOME or daemon root the helper handed out`);
    }
    if (!fresh.length) break;
    for (const x of fresh) done.add(`${x.pid}:${x.starttime}`);
    const r = endByIdentity(fresh, { signal, procRoot, kill });
    signalled.push(...r.signalled); left.push(...r.left);
  }
  return { signalled, left };
}

/** THE STOP, pure over `procRoot` / `kill`: the hub by the identity recorded at its spawn, then (unless hubOnly) everything
 *  rooted in its root. → { signalled: [{pid, via}], left: [{pid, why}] } */
export function endHub({ pid, starttime, root, hubOnly = false, signal = 'SIGKILL', procRoot = '/proc', kill } = {}) {
  const own = starttime == null ? { signalled: [], left: [{ pid, why: 'no start time recorded at its spawn' }] }
    : endByIdentity([{ pid, starttime, via: 'the hub' }], { signal, procRoot, kill });
  if (hubOnly) return own;
  const rest = endRooted(root, { signal, procRoot, kill, done: new Set([`${pid}:${starttime}`]) });
  return { signalled: [...own.signalled, ...rest.signalled], left: [...own.left, ...rest.left] };
}

/** Every git worktree directly in `root` (a `.git` FILE naming its gitdir) removed through git — its record in the checkout's
 *  .git/worktrees goes with it. Synchronous (the exit hook). → the dirs removed. */
export function removeWorktrees(root) {
  const gone = [];
  let ents = []; try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { return gone; }
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    let gitdir = null; try { gitdir = /^gitdir: (.+)$/m.exec(fs.readFileSync(path.join(dir, '.git'), 'utf8'))?.[1] || null; } catch { continue; }
    if (!gitdir) continue;
    const r = spawnSync('git', ['--git-dir', path.resolve(dir, gitdir), 'worktree', 'remove', '--force', dir], { stdio: 'ignore', timeout: 60000 });
    if (r.status === 0) gone.push(dir);
  }
  return gone;
}

/** The root removed — unless a mount point lies inside it, or the mount table cannot be read (then it stays and that is said).
 *  → true when removed. */
export function removeRoot(root, { mountinfo } = {}) {
  const inside = mountsInside(root, mountinfo);
  if (inside === null) { say(`left ${root} in place — the mount table cannot be read, so a mount inside it cannot be ruled out`); return false; }
  if (inside.length) { say(`left ${root} in place — ${inside[0]} is mounted inside it`); return false; }
  fs.rmSync(root, { recursive: true, force: true });
  return true;
}

/** The exit hook: in every minted root, each hub by its identity, then everything rooted there, then its git worktrees, then
 *  the root itself. */
function endAll() {
  for (const [root, m] of MINTED) {
    for (const h of m.hubs) try { if (!h.stopped) h.stop({ hubOnly: true }); } catch { /* best effort at exit */ }
    try { endRooted(root); } catch { /* best effort at exit */ }
    try { removeWorktrees(root); } catch { /* best effort at exit */ }
    try { removeRoot(root); } catch { /* best effort at exit */ }
  }
  MINTED.clear();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function startHub({ root, tree, port, env = process.env, nodeArgs = [], args = [], log = 'hub' } = {}) {
  if (!root) throw new Error('hub-boot: a minted root is required (mintRoot)');
  const r = ownRoot(root);
  const t = real(String(tree || ''));
  if (!tree || !isIn(t, r) || t === r) throw new Error(`hub-boot: the tree ${JSON.stringify(tree)} must lie in the minted root ${r}`);
  if (!fs.existsSync(path.join(t, 'server.js'))) throw new Error(`hub-boot: no server.js in the tree ${t}`);
  if (!Number.isInteger(Number(port)) || Number(port) <= 0) throw new Error(`hub-boot: a port is required — got ${JSON.stringify(port)}`);
  if (env.HOME == null || env.HOME === '') throw new Error(`hub-boot: the env must carry a HOME in the minted root ${r} — the hub's children are ended by it`);
  for (const k of ['HOME', ...DAEMON_ROOT_ENV]) if (env[k] != null && !insideRoot(String(env[k]), r)) throw new Error(`hub-boot: the env's ${k} (${env[k]}) must lie in the minted root ${r}`);
  if (!env.VIBESPACE_VNC_DISPLAY || !env.VIBESPACE_VNC_PORT) throw new Error('hub-boot: the env must carry the per-run singleton-Desktop names VIBESPACE_VNC_DISPLAY + VIBESPACE_VNC_PORT (scratch.mjs vncEnv — test-architecture §57)');
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(log))) throw new Error(`hub-boot: bad log name ${JSON.stringify(log)}`);
  const logFile = path.join(r, `${log}.log`);
  if (MINTED.get(r).hubs.some((h) => !h.stopped && h.logFile === logFile)) throw new Error(`hub-boot: a running hub of this root still writes ${logFile} — name another log`);
  const fd = fs.openSync(logFile, 'a');
  const from = fs.fstatSync(fd).size;
  let child;
  try { child = spawn(process.execPath, [...nodeArgs, 'server.js', ...args], { cwd: t, env: { ...env, PORT: String(port) }, stdio: ['ignore', fd, fd] }); }
  finally { fs.closeSync(fd); }
  const hub = {
    pid: child.pid, starttime: child.pid ? starttimeOf(child.pid) : null, port: Number(port), root: r, tree: t, logFile, child, stopped: false,
    url: (p = '') => `http://127.0.0.1:${port}${p}`,
    async ready({ ms = 120000, path: p = '/api/home' } = {}) {
      const until = Date.now() + ms;
      for (;;) {
        try { await fetch(hub.url(p)); return true; } catch { /* not listening yet */ }
        if (child.exitCode !== null || child.signalCode || Date.now() >= until) return false;
        await sleep(250);
      }
    },
    log() { try { const b = fs.readFileSync(logFile); return b.subarray(Math.min(from, b.length)).toString('utf8'); } catch { return ''; } },
    async waitForLog(re, ms = 30000) {
      const until = Date.now() + ms;
      for (;;) {
        const line = hub.log().split('\n').find((l) => re.test(l));
        if (line != null) return line;
        if (Date.now() >= until) return null;
        await sleep(100);
      }
    },
    stop({ signal = 'SIGKILL', hubOnly = false } = {}) {
      hub.stopped = true;
      return endHub({ pid: hub.pid, starttime: hub.starttime, root: r, hubOnly, signal });
    },
  };
  MINTED.get(r).hubs.push(hub);
  return hub;
}
