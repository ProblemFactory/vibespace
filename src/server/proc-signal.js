'use strict';
// THE KILL LAW'S HELPERS (lane turn-never-silent — the look at 99f65d547, 主开发 07:49Z: «the kill helpers in one small module
// so each proof has its leg and its mutant»). data/bin/agy-wrapper.js signals through these alone:
//  · a PID IS NEVER AN IDENTITY: one process is signalled only when its birth (/proc/<pid>/stat starttime) is the one read
//    when it was found, and it is not a zombie (sameBirth → signalOne);
//  · a GROUP only through the handle this process spawned itself (killGroup: the ChildProcess it spawned detached — its pid
//    is its group's id);
//  · THE FLOOR, both: never pid 0 (our own group), 1 (init), a negative, a non-integer, our own pid, or our own group —
//    a signal to pid 0 (our own group) or to -1 (every process we may signal) is the shape that took the box's user manager
//    down before.
// Each `process.kill(` here is a pid-identity census row (scripts/pid-identity-census.mjs). `kill` is injectable for the
// suites' floor legs only (a floor mutant must never reach a real kill(0)).
const fs = require('fs');
const TL = require('../turn-liveness.js');

/** the floor of every signal: an integer pid above 1 that is not this process */
function pidFloor(pid, self = process.pid) { return Number.isInteger(pid) && pid > 1 && pid !== self; }
/** the process group of `pid` from its stat (the field after ppid) — or 0 */
function groupOf(statText) { try { const t = String(statText); const f = t.slice(t.lastIndexOf(')') + 2).split(' '); return Number(f[2]) || 0; } catch { return 0; } }

function create({ readStat = (pid) => fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), kill = null, self = process.pid, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let ownGroup = null;
  const myGroup = () => { if (ownGroup === null) { try { ownGroup = groupOf(readStat(self)); } catch { ownGroup = 0; } } return ownGroup; };
  /** the process found as `p` ({pid, startTicks}) is still that process, alive (not a zombie), above the floor */
  function sameBirth(p) {
    if (!p || !pidFloor(p.pid, self)) return false;
    try { const s = TL.parseStat(readStat(p.pid)); return !!s && s.startTicks === p.startTicks && s.state !== 'Z'; } catch { return false; }
  }
  /** one process, its birth checked AT the signal → whether a signal was sent */
  function signalOne(p, sig) { if (!sameBirth(p)) return false; try { if (kill) kill(p.pid, sig); else process.kill(p.pid, sig); return true; } catch { return false; } }
  /** the group of a child THIS process spawned detached (`proc` = its ChildProcess handle) — never a group under the floor
   *  or our own → whether a signal was sent */
  function killGroup(proc, sig) {
    if (!proc || !pidFloor(proc.pid, self) || proc.pid === myGroup()) return false;
    try { if (kill) kill(-proc.pid, sig); else process.kill(-proc.pid, sig); return true; } catch { try { return proc.kill(sig) === true; } catch { return false; } }
  }
  /** end these processes (each found with its birth): SIGTERM, then SIGKILL after graceMs → {ended: [names], survivors: [names]} */
  async function endTree(list, { graceMs = 3000 } = {}) {
    const live = (list || []).filter(sameBirth);
    for (const p of live) signalOne(p, 'SIGTERM');
    await wait(graceMs);
    for (const p of live) if (sameBirth(p)) signalOne(p, 'SIGKILL');
    await wait(300);
    const survivors = live.filter(sameBirth);
    return { ended: live.filter((p) => !survivors.includes(p)).map((p) => p.comm), survivors: survivors.map((p) => p.comm) };
  }
  /** the group of a process found by its RECORDED birth (`left` = the agy a wrapper's sidecar names) — signalled only while
   *  its leader is still that very process (sameBirth: above the floor, its birth, not a zombie), never our own group */
  function signalRecordedGroup(left, sig) { if (!sameBirth(left) || left.pid === myGroup()) return false; try { if (kill) kill(-left.pid, sig); else process.kill(-left.pid, sig); return true; } catch { return false; } }
  /** S6 (the look at 99f65d547): a conversation ended while its wrapper was already killed past its own exit handler leaves
   *  agy (its own session) and its command running. After `graceMs` — the wrapper's own handler ends its group first when it
   *  can — the agy its sidecar recorded, if it is STILL that process, is ended: SIGTERM to its group, SIGKILL after `killMs`.
   *  → 'not-recorded' | 'gone' (nothing to end) | 'ended' | 'survived' */
  async function endLeftGroup(left, { graceMs = 5000, killMs = 3000, say = () => { } } = {}) {
    if (!left) return 'not-recorded';
    await wait(graceMs);
    if (!signalRecordedGroup(left, 'SIGTERM')) return 'gone';
    say(`agy (pid ${left.pid}) outlived its wrapper — its group was sent SIGTERM`);
    await wait(killMs);
    if (!signalRecordedGroup(left, 'SIGKILL')) return 'ended';
    await wait(300);
    if (sameBirth(left)) { say(`agy (pid ${left.pid}) outlived its wrapper and SIGKILL — still running`); return 'survived'; }
    return 'ended';
  }
  return { sameBirth, signalOne, killGroup, endTree, signalRecordedGroup, endLeftGroup };
}

/** S6: the agy a wrapper's sidecar records ({childPid, childStart}) → {pid, startTicks} | null — read off the loop */
async function recordedChildOf(sidecarFile, { readFile = (f) => fs.promises.readFile(f, 'utf8') } = {}) {
  try { const j = JSON.parse(await readFile(sidecarFile)); const pid = Number(j && j.childPid), st = Number(j && j.childStart); return pidFloor(pid) && Number.isFinite(st) && st > 0 ? { pid, startTicks: st } : null; } catch { return null; }
}

module.exports = { create, pidFloor, groupOf, recordedChildOf };
