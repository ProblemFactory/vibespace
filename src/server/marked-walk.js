'use strict';
/**
 * THE MARKED WALK, OFF THE HUB'S LOOP (row B-d8f4 (9), 主开发 r1745). Which processes carry a job's mark: the walk reads every
 * process's environment, and each read takes that process's memory lock — one in uninterruptible sleep holds it, so on the hub's
 * main thread it is not a 250 ms hold, it is the hub. So the walk NEVER runs on the hub's main thread and NEVER on the shared file
 * threadpool (an async read there parks one of its few threads for good): ONE CHILD through THE STARTER (src/server/child-starter.js,
 * called), which runs src/proc-identity.js membersOf ITSELF — the same function, so the same laws: the cut said and never counted, the
 * newest pid first, a D-state process never read. It is ENDED at a deadline; a walk that was ended, or that the starter could not
 * answer, is said by the caller and the stop goes on with what was found. It hands back PIDS AND START TIMES ONLY — never an
 * environment's value, in no log and no message (the child prints no more; this side keeps no more).
 * walkMarked({mark, since, pgid, first, deadlineMs, procRoot, runImpl}) → Promise<{rows: [{pid, starttime}], scan, ended}>
 *   ended: null (it answered) · 'deadline' (ended at its bound) · 'unknown' (the starter could not say) · 'no answer'
 */
const path = require('path');

const WALKER = path.join(__dirname, 'marked-walk-child.js');
const DEADLINE_MS = 3000;   // the child's start (~50 ms) + membersOf's own 250 ms bound, with room for a loaded machine
const ROWS_MAX = 4096;      // membersOf's own row bound — never more handed back

let standIn = null;   // a suite's stand-in for the starter's run of this walk (setRunImpl) — null in the product
/** a SUITE's seam: hand every walk of this process a stand-in for the starter's run (the same call, the same answer); null = the starter */
function setRunImpl(fn) { standIn = typeof fn === 'function' ? fn : null; }
function walkMarked({ mark = '', since = 0, pgid = 0, first = [], deadlineMs = DEADLINE_MS, procRoot = null, runImpl = null } = {}) {
  const run = runImpl || standIn || ((c, a, o) => require('./child-starter.js').childStarter().run(c, a, o));
  // the arguments: the mark (a job id and a run's start — never a secret, never a person's text), numbers, pids — and a suite's stand-in root
  const firsts = (Array.isArray(first) ? first : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 256).join(',');
  const args = ['--max-old-space-size=64', WALKER, String(mark), String(Number(since) || 0), String(Number(pgid) || 0), firsts, ...(typeof procRoot === 'string' && procRoot ? [procRoot] : [])];
  let p;
  try { p = Promise.resolve(run(process.execPath, args, { timeoutMs: deadlineMs, capture: true, maxBuffer: 1 << 20, wholeEnv: true, env: { PATH: process.env.PATH || '/usr/bin:/bin' } })); }
  catch { return Promise.resolve({ rows: [], scan: null, ended: 'unknown' }); }
  return p.then((r) => {
    if (!r || r.unknown) return { rows: [], scan: null, ended: 'unknown' };
    if (r.timedOut) return { rows: [], scan: null, ended: 'deadline' };
    let a = null; try { a = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch { }
    if (!a || typeof a !== 'object' || !Array.isArray(a.rows)) return { rows: [], scan: null, ended: 'no answer' };
    const rows = a.rows.filter((x) => Array.isArray(x) && Number.isInteger(x[0]) && x[0] > 1 && Number.isFinite(x[1])).slice(0, ROWS_MAX).map(([pid, starttime]) => ({ pid, starttime }));
    const s = a.scan && typeof a.scan === 'object' ? a.scan : null, num = (v) => (Number.isFinite(v) ? v : 0);
    const scan = s ? { scanned: num(s.scanned), total: num(s.total), unreadable: num(s.unreadable), others: num(s.others), ending: num(s.ending), cut: !!s.cut, ...(typeof s.unread === 'string' ? { unread: s.unread.slice(0, 20) } : {}) } : null;   // numbers and an errno only
    return { rows, scan, ended: null };
  }, () => ({ rows: [], scan: null, ended: 'unknown' }));
}
/** the caller's words for an ended walk (said in the job's log and the hub's) */
const endedWords = (ended, deadlineMs = DEADLINE_MS) => (ended === 'deadline' ? `its walk for what carries its mark was ended at its ${Math.round(deadlineMs / 1000)} s bound` : ended === 'unknown' ? 'its walk for what carries its mark could not be started or answered' : ended ? 'its walk for what carries its mark gave no answer' : '');

module.exports = { walkMarked, endedWords, setRunImpl, DEADLINE_MS, WALKER };
