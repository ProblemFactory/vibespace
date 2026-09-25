'use strict';
// THE LOCAL CLAUDE LOCK CAPTURE — ONE implementation for the create-time
// chain (src/ws-create.js) and the boot re-arm (src/server/boot-restore.js).
//
// A local claude session whose id the stream parser cannot adopt (TERMINAL
// mode has no parser; a restart can land inside the create-time window)
// learns its conversation id from the CLI's own lock file
// (~/.claude/sessions/<pid>.json = {pid, sessionId, cwd, startedAt}).
//
// THE WITNESS IS THE PID, NEVER THE CLOCK (2026-09-25, fork-group round 2 —
// five findings reproduced on a scratch server with a fake CLI): the server
// spawned the CLI, so it KNOWS which lock is its own — the wrapper records its
// own pid in the sidecar (<BUFFERS_DIR>/<id>.json `pid`) before it spawns the
// CLI, and the lock file is named by the CLI's pid. A lock is this session's
// iff its pid is ALIVE and DESCENDS from this session's wrapper (the §4
// discovery rule — a lock is verified by its process, not by what it says).
// Every time-window rule before this one guessed:
//   ① "the first unclaimed same-cwd lock started after my creation" handed
//      two sessions created together each other's ids whenever the later
//      one's CLI wrote its lock first (two forks of one parent; a new session
//      beside a fork) — both rows persisted the wrong id for life.
//   ② the 5 s pre-creation slack with no liveness check adopted a dead CLI's
//      leftover lock or an external same-cwd claude, and a restored pending
//      fork cleared its flag on that guess — irreversibly.
//   ③ the chain gave up after ~17 s, so a slow fork kept its parent's id for
//      life; it now stays armed (backing off) while the capture is wanted.
// Nearest-descendant wins (a `claude` the CLI itself runs from a tool is a
// deeper descendant with a lock of its own); a tie is refused. The nearest is
// found FIRST and judged after (round 4): a seed / claimed / pre-creation
// nearest lock means null, never "try the next one down" — and (round 5) so
// does a nearest lock that exists but cannot be read (torn mid-rewrite).
// THE WRITER WITNESS (round 3): a live descendant is not yet the CLI — a stale
// lock whose pid NAME was re-used by a `sleep`/git/shell child the CLI runs
// descends from the wrapper too (pids wrap ~daily on a busy box). The lock
// must have been written by the live pid: its `procStart` equals the pid's
// /proc stat field 22, or (no usable procStart) the pid is a claude by
// cli-identity (`lockWrittenByItsPid`). The start-time floor is NOT the reuse
// guard — it only drops a file that predates the session.
//
// A FORK is seeded with its PARENT's id (`--resume <parent> --fork-session`)
// until the harness announces its own. In chat the stream parser usually
// adopts it, in terminal mode only this capture can; since round 3 the capture
// runs for a pending fork in EITHER mode (a chat fork's init that landed while
// the server was down is never replayed). `lockCaptureWanted` is re-asked on
// every attempt — a parser that won the race ends it — and the seed is never a
// pick (`excludeId`), a claim (`claimedLockIds`) nor a boot-dedup key
// (`ownsItsId`).

const fs = require('fs');
const path = require('path');

/** Should the lock capture run (still) for this session?
 *  local + claude + (no id yet | a pending fork still carrying its source's
 *  id) — in EITHER mode (round 3): a restored pending CHAT fork whose init
 *  landed while the server was down is never replayed to the stream parser,
 *  so its own lock is the only witness left. The pid witness is
 *  mode-independent; a parser that wins the race ends the chain (the
 *  predicate is re-asked on every attempt). */
function lockCaptureWanted(session) {
  if (!session || session.host || (session.backend || 'claude') !== 'claude') return false;
  if (!session.claudeSessionId) return true;
  return !!session._forkRequested;
}

/** The ids other live claude sessions hold AS THEIR OWN. A pending fork's id
 *  is its source's (borrowed), so it claims nothing. */
function claimedLockIds(activeSessions, selfId) {
  const claimed = new Set();
  for (const [oid, os] of activeSessions || []) {
    if (oid === selfId || !os || (os.backend || 'claude') !== 'claude' || !os.claudeSessionId) continue;
    if (os._forkRequested) continue;
    claimed.add(os.claudeSessionId);
  }
  return claimed;
}

/** PURE: which lock is this session's? `locks` = parsed lock objects (any
 *  order). `pidDepth(pid)` = how many parent hops from that pid reach THIS
 *  session's wrapper (0 / falsy = not ours, dead, or unknown). `isWriter(lock)`
 *  (captureLockId passes `lockWrittenByItsPid`) is asked only of a lock that
 *  already descends from the wrapper — the descendant may be any child of the
 *  CLI. No witness ⇒ null: a lock is never picked by cwd or by clock.
 *  TWO STEPS, IN THIS ORDER (round 4, reproduced on a scratch upgrade): first
 *  the NEAREST live wrapper-descendant lock written by its pid — that lock IS
 *  the session's CLI (a tie is refused: null, the chain asks again); only then
 *  is it judged: the fork seed (`excludeId`), an id another session holds
 *  (`claimed`) or a file older than the session (`createdAt`) ⇒ null. An
 *  UNREADABLE nearest lock (`{pid, unreadable}` from readClaudeLocks, still
 *  asked `isWriter` — with no procStart the pid must be a claude) is no answer
 *  this step either (round 5), never a reason to judge the next one down. The old
 *  one-pass filter skipped the excluded depth-1 lock and let a DEEPER one win:
 *  a restored record misread as a pending fork (its OWN id as the seed) took
 *  the lock of a `claude -p` its Bash tool ran and persisted that foreign id.
 *  A deeper lock is a child of the CLI, never the CLI — no exclusion falls
 *  through to it. */
function pickClaudeLock({ locks, createdAt, claimed, excludeId = null, pidDepth, isWriter = null }) {
  if (typeof pidDepth !== 'function') return null;
  const t0 = Number(createdAt) || 0;
  let best = null, bestDepth = Infinity, tie = false;
  for (const l of locks || []) {
    if (!l) continue;
    const unreadable = !!l.unreadable || typeof l.sessionId !== 'string' || !l.sessionId;
    if (unreadable && !Number.isInteger(Number(l.pid))) continue;
    const d = Number(pidDepth(l.pid)) || 0;
    if (d <= 0) continue;
    if (isWriter && !isWriter(l)) continue; // the live pid must be the process that WROTE this file (round 3)
    if (d < bestDepth) { best = l; bestDepth = d; tie = false; }
    else if (d === bestDepth && l.sessionId !== best.sessionId) tie = true; // a placeholder's missing id differs from any real one
  }
  if (!best || tie) return null;
  // round 5: the nearest lock exists but could not be read (torn mid-rewrite)
  // ⇒ no answer this step; the lock below it is a child's, never judged.
  // (The start floor below would refuse a placeholder too — it has no
  // startedAt — but the rule is stated here, not inherited from that one.)
  if (best.unreadable || typeof best.sessionId !== 'string' || !best.sessionId) return null;
  // the CLI's own lock, judged — never skipped in favour of a deeper one (round 4)
  if (excludeId && best.sessionId === excludeId) return null;
  if (claimed && claimed.has(best.sessionId)) return null;
  if (!(Number(best.startedAt) >= t0)) return null;
  return best.sessionId;
}

/** The ownership walk: pid → its parents, up to `maxHops`, looking for the
 *  session's wrapper. A dead or unreadable pid answers 0 (liveness is part of
 *  the witness). `readPpid` is src/cli-identity.js's (procfs, or ONE ps table). */
function wrapperDepthOf(wrapperPid, readPpid, maxHops = 8) {
  const w = Number(wrapperPid);
  return (pid) => {
    let p = Number(pid);
    if (!Number.isInteger(w) || w <= 1 || !Number.isInteger(p) || p <= 1 || p === w) return 0;
    for (let d = 1; d <= maxHops; d++) {
      const q = readPpid(p);
      if (q == null || !Number.isInteger(q)) return 0;
      if (q === w) return d;
      if (q <= 1) return 0;
      p = q;
    }
    return 0;
  };
}

/** The lock dir as parsed objects; a lock without a pid field is named by
 *  its file. Round 5: an unreadable/half-written `<pid>.json` (the CLI
 *  rewrites its lock after start — 8 of 12 live locks on this box had an
 *  mtime past `startedAt`) is returned as `{pid, unreadable: true}`, never
 *  skipped: skipping it made a nested claude's deeper lock "the nearest". A
 *  file that vanished between readdir and read (the CLI exited) is skipped. */
function readClaudeLocks(dir) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { return out; }
  for (const n of names) {
    const namePid = /^\d+\.json$/.test(n) ? Number(n.slice(0, -5)) : null;
    let raw;
    try { raw = fs.readFileSync(path.join(dir, n), 'utf-8'); }
    catch (e) {
      if (e && e.code === 'ENOENT') continue; // the CLI removed its lock between readdir and read
      if (namePid) out.push({ pid: namePid, unreadable: true });
      continue;
    }
    let l = null;
    try { l = JSON.parse(raw); } catch {}
    if (l && typeof l === 'object' && typeof l.sessionId === 'string' && l.sessionId) {
      if (!Number.isInteger(l.pid) && namePid) l.pid = namePid;
      out.push(l);
    } else if (namePid) {
      // round 5: a torn/half-written lock (the CLI rewrites its lock after
      // start) is a PLACEHOLDER named by its file, never silently absent —
      // otherwise the nested claude's lock below it became "the nearest"
      out.push({ pid: namePid, unreadable: true });
    }
  }
  return out;
}

/** IS THE LIVE PID THE PROCESS THAT WROTE THIS LOCK? (round 3, reproduced:
 *  a stale lock under a pid name that now belongs to a `sleep` the CLI ran
 *  descends from the wrapper, starts inside the window, and was adopted — a
 *  restored pending fork cleared its flag on it.) The §4 rule, the one
 *  session-store's isLockClaude applies to discovery: the CLI stamps its own
 *  `/proc/<pid>/stat` field 22 into `procStart` (verified byte-equal on live
 *  locks), so where the lock carries it and the pid is readable they MUST be
 *  equal — a re-used pid name cannot fake a start instant; with no usable
 *  procStart (a macOS lock writes `procStartFt`; an older CLI none) the pid
 *  must BE a claude by cli-identity's one predicate. Pure /proc reads — no
 *  spawn per lock (the fork-tax law). */
function lockWrittenByItsPid(lock, { procStartOf, isCli } = {}) {
  const pid = Number(lock && lock.pid);
  if (!Number.isInteger(pid) || pid <= 1) return false;
  const ci = (procStartOf && isCli) ? null : require('./cli-identity');
  const startOf = procStartOf || ci.procStartTicks;
  const cli = isCli || ci.isCliProcess;
  const want = lock.procStart != null && /^\d+$/.test(String(lock.procStart)) ? String(lock.procStart) : null;
  if (want) {
    const have = startOf(pid);
    if (have != null) return String(have) === want;
  }
  return !!cli(pid, 'claude');
}

/** The wrapper's own pid, from the sidecar it writes BEFORE it spawns the CLI. */
function wrapperPidOf(sidecarPath) {
  try { const m = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8')); return Number.isInteger(m?.pid) ? m.pid : null; }
  catch { return null; }
}

/** ONE attempt, for either site: the session's own lock id, or null. */
function captureLockId({ session, id, activeSessions, sessionsDir, sidecarPath, readPpid, procStartOf = null, isCli = null }) {
  if (!lockCaptureWanted(session)) return null;
  const wrapperPid = wrapperPidOf(sidecarPath);
  if (!wrapperPid) return null;
  return pickClaudeLock({
    locks: readClaudeLocks(sessionsDir),
    createdAt: session.createdAt,
    claimed: claimedLockIds(activeSessions, id),
    excludeId: session._forkRequested ? session.claudeSessionId : null,
    pidDepth: wrapperDepthOf(wrapperPid, readPpid),
    isWriter: (l) => lockWrittenByItsPid(l, { procStartOf, isCli }),
  });
}

/** PURE: the wait before attempt `n` (0-based). Brisk while a CLI normally
 *  starts, then backing off — but never giving up while the capture is wanted
 *  (a fork whose CLI replays a big parent transcript can take far longer than
 *  the old 15-attempt window, and nothing else re-armed it). */
function captureDelay(n) {
  if (n <= 0) return 2000;
  if (n < 15) return 1000;
  if (n < 45) return 5000;
  return 30000;
}

/** Arm the chain for one live session: one attempt per `captureDelay` step
 *  until the id is adopted, the session leaves the live list (or is replaced
 *  under its id), or it no longer wants a capture. `onAdopt(lockId)` persists.
 *  Returns false when this session already has a chain. */
const ARMED = new WeakSet();
function armLockCapture({ id, session, activeSessions, attempt, onAdopt, schedule = setTimeout }) {
  if (!session || ARMED.has(session)) return false; // one chain per session (the boot sweep may meet a fresh create's)
  ARMED.add(session);
  let n = 0;
  const step = () => {
    if (activeSessions.get(id) !== session || !lockCaptureWanted(session)) { ARMED.delete(session); return; }
    let lockId = null;
    try { lockId = attempt(); } catch {}
    if (lockId) { ARMED.delete(session); try { onAdopt(lockId); } catch {} return; }
    const t = schedule(step, captureDelay(++n));
    t?.unref?.();
  };
  const t = schedule(step, captureDelay(0));
  t?.unref?.();
  return true;
}

/** Apply a captured id to a live session. A pending fork records its source
 *  in `forkedFrom` (the stream parser's bookkeeping) and disarms. Returns the
 *  fields the caller persists into the session meta. */
function adoptCapturedId(session, sessionId) {
  const wasFork = !!session._forkRequested && !!session.claudeSessionId && session.claudeSessionId !== sessionId;
  if (wasFork) {
    const prev = session.forkedFrom || [];
    if (!prev.includes(session.claudeSessionId)) prev.push(session.claudeSessionId);
    session.forkedFrom = prev;
  }
  session.claudeSessionId = sessionId;
  session.backendSessionId = sessionId;
  if (session._forkRequested) session._forkRequested = false;
  return {
    backendSessionId: sessionId,
    claudeSessionId: sessionId,
    ...(wasFork ? { forkedFrom: session.forkedFrom, forkRequested: false } : {}),
  };
}

/** A persisted fork flag is PENDING only while the record still names its
 *  source (or no id at all): an adopted fork whose meta kept `forkRequested:
 *  true` must not come back from a restart as a pending fork — its OWN id
 *  would then claim nothing and could be adopted by a neighbour.
 *  With no `forkSourceId` (every record before 2.369.134), the adoption's own
 *  bookkeeping decides (round 4): the parser and adoptCapturedId push the
 *  seed into `forkedFrom` when they adopt, so a non-empty `forkedFrom` that
 *  does not name the current id means the id is the record's OWN (every chat
 *  fork a pre-.134 server adopted still carries `forkRequested: true` — that
 *  server never cleared it). Only a record with no id, or with neither a
 *  source nor any adoption trace, is still pending. */
function restoredForkPending(meta) {
  if (!meta || !meta.forkRequested) return false;
  const cur = meta.claudeSessionId || meta.backendSessionId || null;
  if (!cur) return true;
  if (meta.forkSourceId) return cur === meta.forkSourceId;
  const ff = Array.isArray(meta.forkedFrom) ? meta.forkedFrom : [];
  return !(ff.length > 0 && !ff.includes(cur));
}

/** May this restored meta take part in the boot DEDUP (boot-restore: one
 *  socket per conversation, the losers SIGTERMed + unlinked)? Only a record
 *  that holds its id AS ITS OWN (round 3, reproduced on a scratch server): a
 *  pending fork carries its SOURCE's id, and the dedup called the parent the
 *  "stale duplicate" of its own fork — every restart inside a fork's pending
 *  window, and the update boot for every terminal fork an older server created
 *  (those kept their parent's id for life), retired the live parent. The same
 *  rule as claimedLockIds: a borrowed id is not a claim. */
function ownsItsId(meta) {
  return !!(meta && meta.claudeSessionId) && !restoredForkPending(meta);
}

module.exports = {
  lockCaptureWanted, claimedLockIds, pickClaudeLock, wrapperDepthOf, readClaudeLocks, wrapperPidOf,
  lockWrittenByItsPid, captureLockId, captureDelay, armLockCapture, adoptCapturedId, restoredForkPending, ownsItsId,
};
