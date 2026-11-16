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
const PI = require('../proc-identity.js');   // THE tree's process identity ({pid, starttime, bootId}): a record read after a reboot never matches

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
  /** end these processes (each found with its birth): SIGTERM, then SIGKILL after graceMs → {ended: [names], survivors: [names],
   *  lastEnded: [pids]}. THE RACE (the hosted red of 11-16, 主开发 09:00Z — «the kill never outruns the sentence»): `last` are
   *  the processes a sentence just written must still pass through (the reader of its pipe, the command's own top that its CLI
   *  waits on). They are signalled only AFTER every other process, once they ended by themselves (their end of input) or
   *  after `boundMs` — read every `pollMs`, a count of reads, never a clock. They are never spared: SIGTERM at the bound, and
   *  the hard kill below takes every survivor, them included. `lastEnded` = the kept pids that ended by themselves. */
  async function endTree(list, { graceMs = 3000, last = [], boundMs = 2000, pollMs = 25 } = {}) {
    const live = (list || []).filter(sameBirth);
    const keep = new Set((last || []).map((p) => p && p.pid));
    const kept = live.filter((p) => keep.has(p.pid));
    for (const p of live) if (!keep.has(p.pid)) signalOne(p, 'SIGTERM');
    const lastEnded = [];
    if (kept.length) {
      const reads = Math.ceil(Math.max(0, Number(boundMs) || 0) / Math.max(1, pollMs));
      for (let i = 0; i < reads && kept.some(sameBirth); i++) await wait(pollMs);
      for (const p of kept) { if (sameBirth(p)) signalOne(p, 'SIGTERM'); else lastEnded.push(p.pid); }
    }
    await wait(graceMs);
    for (const p of live) if (sameBirth(p)) signalOne(p, 'SIGKILL');
    await wait(300);
    const survivors = live.filter(sameBirth);
    return { ended: live.filter((p) => !survivors.includes(p)).map((p) => p.comm), survivors: survivors.map((p) => p.comm), lastEnded };
  }
  /** S6 (the look at 99f65d547; the closure check, 主开发 10:53Z): a conversation ended while its wrapper was already killed past
   *  its own exit handler leaves agy (its own session) and its command running. After `graceMs` — the wrapper's own handler ends
   *  its group first when it can — the agy its sidecar RECORDED (`left` = proc-identity's {pid, starttime, bootId}) is ended
   *  through the tree's own signalIdentity (its group first): only while judge() says it is still that very process (another
   *  boot, a recycled pid, a zombie, no birth ⇒ nothing sent), never under the floor nor our own group. SIGTERM, then SIGKILL
   *  after `killMs`. → 'not-recorded' | 'refused' (ours / under the floor) | 'gone' (nothing to end) | 'ended' | 'survived' */
  async function endLeftGroup(left, { graceMs = 5000, killMs = 3000, say = () => { }, procOpts = {} } = {}) {
    if (!left) return 'not-recorded';
    if (!pidFloor(Number(left.pid), self) || Number(left.pid) === myGroup()) return 'refused';
    await wait(graceMs);
    const send = (sig) => PI.signalIdentity(left, sig, { ...procOpts, group: true, ...(kill ? { kill } : {}), what: 'the agy a killed wrapper left', say: () => { } });
    if (!send('SIGTERM').ok) return 'gone';
    say(`agy (pid ${left.pid}) outlived its wrapper — its group was sent SIGTERM`);
    await wait(killMs);
    if (!send('SIGKILL').ok) return 'ended';
    await wait(300);
    if (PI.judge(left, procOpts).verdict === 'same') { say(`agy (pid ${left.pid}) outlived its wrapper and SIGKILL — still running`); return 'survived'; }
    return 'ended';
  }
  return { sameBirth, signalOne, killGroup, endTree, endLeftGroup };
}

/** S6: the agy a wrapper's sidecar records — its proc-identity `childIdentity` {pid, starttime, bootId} → that identity, or null
 *  when a part is missing (no birth, no boot: answering nothing — never a bare pid) — read off the loop */
async function recordedChildOf(sidecarFile, { readFile = (f) => fs.promises.readFile(f, 'utf8') } = {}) {
  try {
    const j = JSON.parse(await readFile(sidecarFile)), r = j && j.childIdentity;
    const pid = Number(r && r.pid), starttime = Number(r && r.starttime), bootId = r && typeof r.bootId === 'string' ? r.bootId : '';
    return pidFloor(pid) && r && r.starttime != null && Number.isFinite(starttime) && starttime > 0 && bootId ? { pid, starttime, bootId } : null;
  } catch { return null; }
}

module.exports = { create, pidFloor, groupOf, recordedChildOf };
