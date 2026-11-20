// THE RUN RECORD — who owns a scratch root (B-1d08, 2026-09-29). NOT a
// test-*.mjs on purpose (the tier census would demand a tier) — like
// scratch.mjs, which writes it, and scripts/ci.mjs, whose scratch-orphan
// reaper reads it. Node builtins only: the stub repositories the gate's own
// gate builds copy ci.mjs with its two siblings (git-env.mjs + this file), so
// a dependency here is a dependency of every stub.
//
// WHY IT EXISTS. The reaper used to convict a process by what its cmdline /
// environ NAMED: a `/tmp/vs-*` path whose root was gone (or stale and unowned
// by any live parent) made it an orphan. Three incidents on one day
// (2026-09-29) showed that a name is not evidence of ownership:
//   ① two lanes ran `ci.mjs` fast tiers at once; one run's sweep reaped the
//     other's freshly planted process under a scratch dir that suite had
//     already removed (exit 144, a planted stray reaped);
//   ② a coordinator's `node scripts/ci.mjs --check-heavy > /tmp/vs-checkheavy.txt`
//     was killed by a lane's fast tier — a FILE whose name has the scratch
//     shape was read as a root;
//   ③ and the reaper's actual target: a finished verifier's scratch server left
//     15 `vibespace-device` daemons re-parented to systemd for an hour.
// A root is now judged by its OWNER. The process that creates a scratch root
// writes `<root>/.vs-run.json` = {v, run, pid, starttime, bootId, createdAt};
// the owner is ALIVE only while /proc/<pid> still carries that starttime on
// that boot (a recycled pid, a zombie, another boot or a vanished pid are all
// DEAD — jobs.js `_verifyAlive` is the same identity rule). A process naming a
// root whose owner is alive is never a candidate, whatever else it names.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUN_RECORD = '.vs-run.json';
export const RUN_RECORD_VERSION = 1;

/** /proc/<pid>/stat, parsed: {comm, state, ppid, starttime, exitCode} or null.
 *  PURE over a proc root (a test drives a fake one). `exitCode` is field 52 —
 *  the waitpid(2) status of a ZOMBIE, readable before its parent reaps it. */
export function procStat(pid, procRoot = '/proc') {
  let s;
  try { s = fs.readFileSync(path.join(procRoot, String(pid), 'stat'), 'latin1'); } catch { return null; }
  const rp = s.lastIndexOf(')'); if (rp < 0) return null;
  const f = s.slice(rp + 2).split(' ');
  return { comm: s.slice(s.indexOf('(') + 1, rp), state: f[0], ppid: Number(f[1]), starttime: Number(f[19]) || 0, exitCode: f.length > 49 ? Number(f[49]) : null };
}

/** USER_HZ: the unit of /proc/<pid>/stat's `starttime` — 100 on every Linux ABI node runs on (a fixed ABI value,
 *  not the kernel's CONFIG_HZ; `getconf CLK_TCK`). */
export const USER_HZ = 100;
/** The boot's wall-clock start in ms (`btime` of <procRoot>/stat), or null when the proc root states none (a fake
 *  table in a test). */
export function procBootMs(procRoot = '/proc') {
  try { const m = /^btime (\d+)$/m.exec(fs.readFileSync(path.join(procRoot, 'stat'), 'latin1')); return m ? Number(m[1]) * 1000 : null; } catch { return null; }
}
/** A process's BIRTH in ms since the epoch, by the kernel's own clock: btime + starttime / USER_HZ (what `ps -o
 *  lstart` prints). null when the boot time or the starttime is unknown. B-442c (2026-10-02): NEVER the mtime of
 *  /proc/<pid> — procfs stamps that when it instantiates the inode, and it re-instantiates every one after a dentry
 *  eviction: after the 16:23 OOM every /proc dir on the box read 16:23:10, a 45-min-old orphan read "8 min" and
 *  `--reap --dry-run` spared hour-old orphans as "young: 42 s". */
export function procBornMs(st, bootMs) {
  return bootMs != null && st && Number(st.starttime) > 0 ? bootMs + (Number(st.starttime) * 1000) / USER_HZ : null;
}

/** This boot's id ('' when the proc root has none — a fake root in a test, or no /proc). */
export function machineBootId(procRoot = '/proc') {
  try { return fs.readFileSync(path.join(procRoot, 'sys', 'kernel', 'random', 'boot_id'), 'utf8').trim(); } catch { return ''; }
}

/** The record a root's creator writes. `run` names the gate run it belongs to
 *  (`VIBESPACE_CI_RUN`, exported by ci.mjs to every suite it starts) or, outside
 *  a gate, the owner itself. */
export function makeRunRecord({ pid = process.pid, procRoot = '/proc', now = Date.now(), run = process.env.VIBESPACE_CI_RUN || '' } = {}) {
  const st = procStat(pid, procRoot);
  const starttime = st ? st.starttime : 0;
  return { v: RUN_RECORD_VERSION, run: run || `pid${pid}@${starttime}`, pid, starttime, bootId: machineBootId(procRoot), createdAt: now };
}

/** Stamp an EXISTING directory as owned by `pid` (default: this process) —
 *  atomically (tmp + rename), so a reader never sees half a record. Called by
 *  scratch.mjs `scratchDir` / `scratchHome`, mutant-copy's dirs and ci.mjs's
 *  scratch worktrees (after `git worktree add`, which wants an empty target).
 *  Returns the record. */
export function stampScratchRun(dir, opts = {}) {
  const rec = makeRunRecord(opts);
  const f = path.join(dir, RUN_RECORD), tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec) + '\n');
  fs.renameSync(tmp, f);
  return rec;
}

/** The record of `dir`, or null when there is none or it cannot prove an
 *  identity (no pid, no starttime — e.g. written where /proc was unreadable). */
export function readRunRecord(dir) {
  let rec;
  try { rec = JSON.parse(fs.readFileSync(path.join(dir, RUN_RECORD), 'utf8')); } catch { return null; }
  if (!rec || typeof rec !== 'object' || !Number.isInteger(rec.pid) || rec.pid <= 0 || !(Number(rec.starttime) > 0)) return null;
  return rec;
}

/** The REAL uid of a process off /proc/<pid>/status (readable whatever the process's dumpable state), or null when the
 *  proc root has none (a fake table in a test). */
export function procUid(pid, procRoot = '/proc') {
  try { const m = /^Uid:\s+(\d+)/m.exec(fs.readFileSync(path.join(procRoot, String(pid), 'status'), 'latin1')); return m ? Number(m[1]) : null; } catch { return null; }
}

/** Is the record's owner still THAT process? {alive, why}. A pid is not an
 *  identity: the number is recycled, so a live pid with another starttime is a
 *  different process (the owner is dead), and so is anything on another boot.
 *  verify r3 (T4, 2026-09-30): and it is a process of THIS uid — a record names
 *  the run that made the root, and the root is this user's (ci.mjs refuses another
 *  user's directory); a forged record naming pid 1 (init: root's, alive for the
 *  boot, its starttime real) read as an owner alive for ever — a stale seam under
 *  it accepted, every process naming that root spared. `uid` is the caller's
 *  (null = not asked, e.g. no getuid on the platform). */
export function runOwnerState(rec, { procRoot = '/proc', bootId = machineBootId(procRoot), uid = typeof process.getuid === 'function' ? process.getuid() : null } = {}) {
  const who = `run ${rec.run || '?'} pid ${rec.pid}`;
  if (rec.bootId && bootId && rec.bootId !== bootId) return { alive: false, why: `${who} is from another boot` };
  const st = procStat(rec.pid, procRoot);
  if (!st) return { alive: false, why: `${who} is gone` };
  if (st.state === 'Z' || st.state === 'X') return { alive: false, why: `${who} has exited (a zombie)` };
  if (st.starttime !== Number(rec.starttime)) return { alive: false, why: `${who} was reused (starttime ${st.starttime} ≠ recorded ${rec.starttime})` };
  const puid = uid == null ? null : procUid(rec.pid, procRoot);
  if (puid != null && puid !== uid) return { alive: false, why: `${who} is another user's process (uid ${puid}, not ${uid})` };
  return { alive: true, why: `${who} is alive` };
}

// ── THE SCRATCH ROOTS (moved here from scripts/ci.mjs, 2026-11-20 — the reach cure). THE HARNESS IMPORTS NOTHING OF THE GATE'S:
// most heavy suites load this file, so the stamp door's dynamic import of ci.mjs (.414 line 46) put ci.mjs, reach-model.mjs
// and affected-model.mjs in the harness the reach model derives — test-reach-model red, and every ci.mjs change (the fast cap's
// arithmetic, nearly every pick) would have selected every heavy suite. ONE implementation, here; ci.mjs imports and re-exports
// it; test-reach-model pins that no harness file names the gate's tooling.
export const SCRATCH_ROOT_RE = /^\/tmp\/vs-[A-Za-z0-9._-]+/;   // the built-in shape /tmp/vs-<name> (ci.mjs's reaper essay: candidacy is evidence)
// B-f397 (lane bl-scratch, 2026-11-17): SCRATCH ROOTS OUTSIDE /tmp/vs-*, BY CONFIGURATION. An acceptance run on a lanes box boots
// its scratch hubs and Chromes inside its own worktree (`…/wt-accept-<lane>/.rev-shell/`, `…/.chrome-<n>/`), never under /tmp/vs-*:
// a dtach + chat-wrapper pair and a headless Chrome outlived their runs by hours there, and no census listed them. The box's gate
// names those roots in VIBESPACE_CI_SCRATCH_ROOTS — ':'-separated absolute PATTERNS, `*` = one name ([A-Za-z0-9._-]+) inside one
// path segment (`/srv/lanes/wt-accept-*/.rev-*`) — and the reaper judges a process naming one exactly as one naming /tmp/vs-*: its
// run record, its owner (owner-gone), its directory (dir-gone) — never the record-less name rule: an acceptance in flight looks
// exactly like its stray, so a configured root with no record is spared and said. Unset (the default, every runner): nothing changes.
// Never the directory sweep's units (a root here is a worktree's folder, removed by whoever made it) and never a test seam's
// table root (procRootSeam keeps /tmp/vs-*), never the deleted-cwd stat (a configured root may sit on a slow mount). A pattern that
// is not absolute, has an empty, `.` or `..` segment, fewer than three segments, no `*` in its last segment, no two-character
// name before that `*` or a character outside the name set is refused and said, once per value; a root that is, holds or lies
// inside the home, the checkout or the gate's cwd is never a root.
export const SCRATCH_ROOTS_ENV = 'VIBESPACE_CI_SCRATCH_ROOTS';
/** The patterns of a VIBESPACE_CI_SCRATCH_ROOTS value: { ok: [{ pattern, re }], refused: [{ pattern, why }] } (PURE). */
export function extraRootPatterns(v = process.env[SCRATCH_ROOTS_ENV]) {
  const ok = [], refused = [];
  for (const pattern of String(v || '').split(':').map((x) => x.trim()).filter(Boolean)) {
    const segs = pattern.split('/');
    const why = !pattern.startsWith('/') ? 'not absolute' : segs.slice(1).some((x) => !x) ? 'an empty segment'
      : segs.some((x) => x === '.' || x === '..') ? 'a . or .. segment' : segs.length < 4 ? 'fewer than three segments'
        : !segs[segs.length - 1].includes('*') ? 'no * in its last segment' : !/^[^*]{2,}\*/.test(segs[segs.length - 1]) ? 'no name of two characters before the * of its last segment (a bare * claims every folder there)'
          : !segs.every((x) => /^[A-Za-z0-9._*-]*$/.test(x)) ? 'a character outside [A-Za-z0-9._-] and *' : null;
    if (why) refused.push({ pattern, why });
    else ok.push({ pattern, re: new RegExp('^' + segs.map((x) => x.replace(/\./g, '\\.').replace(/\*/g, '[A-Za-z0-9._-]+')).join('/')) });
  }
  return { ok, refused };
}
let extraRootsSeen = { v: null, res: [] };
export const extraRootRes = () => {
  const v = process.env[SCRATCH_ROOTS_ENV] || '';
  if (extraRootsSeen.v !== v) {
    const p = extraRootPatterns(v);
    for (const r of p.refused) console.error(`[ci] scratch reaper: ${SCRATCH_ROOTS_ENV} pattern «${r.pattern}» refused — ${r.why}`);
    extraRootsSeen = { v, res: p.ok.map((x) => x.re) };
  }
  return extraRootsSeen.res;
};
/** The scratch root a (normalized) path begins with — `/tmp/vs-<name>`, else a VIBESPACE_CI_SCRATCH_ROOTS root — or null. A
 *  configured root that IS, holds or lies inside the account's home, this checkout or the gate's cwd is never one. */
// batch 34 cure (主开发 09:32Z): THE REAL HOME IS NEVER A SCRATCH ROOT — the home is judged by the ACCOUNT'S REAL home (the passwd
// entry) as well as by HOME, so a gate run under a scratch HOME still refuses a configured root that is, holds or lies inside the
// real one (and the mount under it). A path compared, nothing read there (test-architecture §68's one reasoned scripts site). Read
// once, and only once a pattern is configured (an import of this file or of ci.mjs — every suite, the pre-push hook — reads no passwd entry).
let passwdHomeMemo;
export const passwdHome = () => (passwdHomeMemo !== undefined ? passwdHomeMemo : (passwdHomeMemo = (() => { try { return os.userInfo().homedir || null; } catch { return null; } })()));
export function scratchRootOf(s) {
  const m = SCRATCH_ROOT_RE.exec(s); if (m) return m[0];
  const extras = extraRootRes(); if (!extras.length) return null;
  const near = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
  const kept = [os.homedir(), process.env.HOME, passwdHome(), path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), process.cwd()].filter(Boolean).map((p) => path.resolve(p));
  for (const re of extras) { const x = re.exec(s); if (x && !kept.some((k) => near(x[0], k))) return x[0]; }
  return null;
}

// B-f397: THE STAMP DOOR — a root made outside this tree's helpers (an acceptance's `.rev-shell/` or `.chrome-<n>/` under its own
// worktree, named by the box gate's VIBESPACE_CI_SCRATCH_ROOTS) is stamped by whoever made it, at once:
//   node scripts/scratch-run.mjs stamp <root> --owner <pid>
// The OWNER is required: the root's own long-lived process — the scratch hub or the browser started in it, its pid — never this
// command's own pid, which ends at once (its record would read the root's live processes as orphaned at the next sweep).
// Refused by name, exit 2, nothing written: no root named or not a directory; a folder the reaper does not name as a root
// (scratchRootOf, above: /tmp/vs-* or a configured pattern — the root itself, never a folder beneath one, never the home or the checkout);
// an owner that is no live process of this user, or a SERVICE MANAGER (pid 1, a `systemd` or `init` — it never ends, so the root would
// never be judged: under env.sh a command's $PPID is the user manager). Then `ci.mjs --reap --dry-run` judges the root's processes by that owner, as it
// judges every root's.
export async function stampCli(argv = process.argv.slice(2), { procRoot = '/proc', out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  const refuse = (why) => { err(`scratch-run stamp: refused — ${why}\n`); return 2; };
  if (argv[0] !== 'stamp') return refuse('usage: node scripts/scratch-run.mjs stamp <root> --owner <pid>');
  const root = argv[1] && !argv[1].startsWith('--') ? path.resolve(argv[1]) : null;
  const oi = argv.indexOf('--owner'), owner = oi > 0 ? Number(argv[oi + 1]) : NaN;
  if (!root) return refuse('no root named');
  if (!Number.isInteger(owner) || owner <= 1) return refuse("no --owner <pid>: the root's long-lived process owns it (this command ends at once)");
  let st = null; try { st = fs.statSync(root); } catch { return refuse(`${root} does not exist`); }
  if (!st.isDirectory()) return refuse(`${root} is not a directory`);
  let real = root; try { real = fs.realpathSync(root); } catch { real = root; }
  if (scratchRootOf(real) !== real) return refuse(`${real} is no scratch root the reaper names (/tmp/vs-* or a VIBESPACE_CI_SCRATCH_ROOTS pattern — the root itself, never a folder beneath one)`);
  const ps = procStat(owner, procRoot);
  if (!ps || ps.state === 'Z' || ps.state === 'X') return refuse(`the owner ${owner} is no live process`);
  if (owner === 1 || ps.comm === 'systemd' || ps.comm === 'init') return refuse(`the owner ${owner} is ${ps.comm} — a service manager never ends, so the root would never be judged: name the root's own long-lived process`);
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (uid !== null && procUid(owner, procRoot) !== uid) return refuse(`the owner ${owner} is not this user's process`);
  const rec = stampScratchRun(real, { pid: owner, procRoot });
  out(JSON.stringify(rec) + '\n');
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) stampCli().then((code) => { process.exitCode = code; });

