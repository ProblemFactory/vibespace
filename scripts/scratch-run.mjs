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
import path from 'node:path';

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
