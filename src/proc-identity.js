'use strict';
/**
 * proc-identity — A PID IS NEVER AN IDENTITY (B-1cc6, lane pid-identity-census).
 *
 * This box's pid_max is 4 194 304 and its pids wrapped ≥ 3 times between the
 * 09-17 boot and 2026-10 (about once a day under the gate's churn); a fleet
 * pod's pid_max is smaller. A pid recorded hours ago can name a STRANGER by the
 * time it is signalled: `process.kill(pid)` on a recycled pid kills someone
 * else's process, and `kill -0` reads "alive" for a dead one (a zombie answers
 * kill -0 / tail --pid too). So every signal to a RECORDED pid goes through
 * here and proves the record first:
 *
 *   identity = { pid, starttime, bootId }   starttime = /proc/<pid>/stat field 22
 *                                           (clock ticks since boot, counted from
 *                                           the LAST ')' — comm may hold ") ");
 *                                           bootId = /proc/sys/kernel/random/boot_id
 *   no /proc (macOS)  → { pid, starttime: null, lstart, bootId: '' }   (`ps -o lstart=`)
 *
 * Verdicts (judge): same | zombie | pid-recycled | gone | unknown-identity | unknown.
 *   · a record WITHOUT a starttime (an older build wrote it) is `unknown-identity`:
 *     never signalled, REPORTED once — "a process this build cannot prove is ours";
 *   · a verdict that cannot be reached (no /proc and no ps) is a SAID `unknown`,
 *     never "alive" (the S9 round-11 lesson).
 * A pid this process spawned and still holds the ChildProcess handle for needs
 * none of this — the handle IS the identity (`child.kill`, or `child.pid` read
 * from the handle in the same tick). A pid read back from disk never is.
 *
 * SHARED: node builtins only (the agentd bundle carries it to paired machines).
 */
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROC_ROOT = '/proc';
const UNPROVABLE = 'a process this build cannot prove is ours — restart it to re-record';

const rootOf = (opts) => (opts && opts.procRoot) || PROC_ROOT;
const pidOk = (pid) => Number.isInteger(Number(pid)) && Number(pid) > 1;

/** The fields after comm (rest[0] = state, field 3; rest[19] = starttime, field 22), or null. */
function statRest(pid, opts) {
  if (!pidOk(pid)) return null;
  try {
    const s = fs.readFileSync(`${rootOf(opts)}/${Number(pid)}/stat`, 'utf8');
    return s.slice(s.lastIndexOf(')') + 2).split(' ');
  } catch { return null; }
}
/** Does this machine read process identities from a procfs at all? */
function hasProc(opts) {
  const root = rootOf(opts);
  return fs.existsSync(`${root}/self/stat`) || fs.existsSync(`${root}/sys/kernel/random/boot_id`);
}
let _bootId = null;
function bootIdOf(opts) {
  if (rootOf(opts) === PROC_ROOT && _bootId != null) return _bootId;
  let v = '';
  try { v = fs.readFileSync(`${rootOf(opts)}/sys/kernel/random/boot_id`, 'utf8').trim(); } catch { }
  if (rootOf(opts) === PROC_ROOT) _bootId = v;
  return v;
}
/** /proc/<pid>/stat field 22 as a Number, or null (gone / no /proc / unreadable). */
function starttimeOf(pid, opts) {
  const r = statRest(pid, opts);
  const v = r ? Number(r[19]) : NaN;
  return Number.isFinite(v) && r[19] !== '' ? v : null;
}
/** /proc/<pid>/stat field 3 ('R', 'S', 'Z' …) or null. */
function stateOf(pid, opts) { const r = statRest(pid, opts); return r ? r[0] : null; }
/** The no-/proc rung: `ps -o stat= -o lstart= -p <pid>` → { ran, state, lstart } (lstart null = no such pid). */
function psOf(pid, opts) {
  if (opts && typeof opts.ps === 'function') return opts.ps(Number(pid));
  const r = spawnSync('ps', ['-o', 'stat=', '-o', 'lstart=', '-p', String(Number(pid))], { encoding: 'utf8', timeout: 3000 });
  if (r.error) return { ran: false, state: null, lstart: null };
  const out = String(r.stdout || '').trim();
  if (!out) return { ran: true, state: null, lstart: null };
  const sp = out.indexOf(' ');
  return { ran: true, state: out.slice(0, sp), lstart: out.slice(sp + 1).trim().replace(/\s+/g, ' ') };
}

/** {pid, starttime, bootId} of a LIVE pid now (record it at spawn), or null. */
function identityOf(pid, opts) {
  if (!pidOk(pid)) return null;
  if (hasProc(opts)) {
    const starttime = starttimeOf(pid, opts);
    return starttime == null ? null : { pid: Number(pid), starttime, bootId: bootIdOf(opts) };
  }
  const p = psOf(pid, opts);
  return p.lstart ? { pid: Number(pid), starttime: null, lstart: p.lstart, bootId: '' } : null;
}

/** The verdict on a recorded identity: { verdict, cur } — see the header. */
function judge(identity, opts) {
  const rec = identity || {};
  if (!pidOk(rec.pid)) return { verdict: 'unknown-identity', cur: null };
  if (hasProc(opts)) {
    if (rec.starttime == null || rec.starttime === '' || !Number.isFinite(Number(rec.starttime))) return { verdict: 'unknown-identity', cur: null };
    const boot = bootIdOf(opts);
    if (rec.bootId && boot && rec.bootId !== boot) return { verdict: 'gone', cur: null }; // the box rebooted: that process is gone
    const r = statRest(rec.pid, opts);
    const cur = r ? Number(r[19]) : null;
    if (cur == null || !Number.isFinite(cur)) return { verdict: 'gone', cur: null };
    if (cur !== Number(rec.starttime)) return { verdict: 'pid-recycled', cur };
    return { verdict: r[0] === 'Z' ? 'zombie' : 'same', cur };
  }
  if (!rec.lstart) return { verdict: rec.starttime == null ? 'unknown-identity' : 'unknown', cur: null };
  const p = psOf(rec.pid, opts);
  if (!p.ran) return { verdict: 'unknown', cur: null };
  if (!p.lstart) return { verdict: 'gone', cur: null };
  if (p.lstart !== String(rec.lstart).replace(/\s+/g, ' ')) return { verdict: 'pid-recycled', cur: p.lstart };
  return { verdict: /^Z/.test(p.state || '') ? 'zombie' : 'same', cur: p.lstart };
}

/** Is `pid` still the process `identity` recorded (a zombie still is — it is just not alive)? */
function sameProcess(pid, identity, opts) {
  const v = judge({ ...(identity || {}), pid }, opts).verdict;
  return v === 'same' || v === 'zombie';
}
/** true = that very process runs · false = gone / recycled / a zombie · null = cannot be proven either way. */
function aliveIdentity(identity, opts) {
  const v = judge(identity, opts).verdict;
  if (v === 'same') return true;
  return v === 'unknown' || v === 'unknown-identity' ? null : false;
}

const _reported = new Set();
/** ONE line per (why, pid, start) — the journal hears a refusal once, not every tick. */
function reportOnce(why, identity, opts, cur) {
  const rec = identity || {};
  const key = `${why}:${rec.pid}:${rec.starttime != null ? rec.starttime : rec.lstart || ''}`;
  if (_reported.has(key)) return null;
  _reported.add(key);
  const what = (opts && opts.what) || 'a recorded process';
  const line = why === 'pid-recycled'
    ? `[proc-identity] pid ${rec.pid} (${what}) now names ANOTHER process (start ${cur} ≠ recorded ${rec.starttime != null ? rec.starttime : rec.lstart}) — pid-recycled, not signalled`
    : `[proc-identity] pid ${rec.pid} (${what}): ${UNPROVABLE} — not signalled`;
  const say = (opts && opts.say) || ((l) => console.warn(l));
  try { say(line); } catch { }
  return line;
}

/**
 * Signal the RECORDED process — only when judge() says it is still that very
 * process. → { ok: true, target } | { ok: false, why: 'pid-recycled' | 'gone' |
 * 'unknown-identity' | 'unknown' | 'not-ours' }. opts.group: the process group
 * first (-pid), its leader alone when it leads none. opts.kill: injectable.
 */
function signalIdentity(identity, signal, opts = {}) {
  const { verdict, cur } = judge(identity, opts);
  if (verdict !== 'same') {
    const why = verdict === 'zombie' ? 'gone' : verdict;
    if (why === 'pid-recycled' || why === 'unknown-identity' || why === 'unknown') reportOnce(why, identity, opts, cur);
    return { ok: false, why };
  }
  const kill = opts.kill || ((p, s) => process.kill(p, s));
  const pid = Number(identity.pid);
  const one = (target) => { try { kill(target, signal); return { ok: true, target }; } catch (e) { return { ok: false, why: e && e.code === 'EPERM' ? 'not-ours' : 'gone' }; } };
  if (opts.group) { const g = one(-pid); if (g.ok) return g; }
  return one(pid);
}

/** agentd's spawn-proof token (moved verbatim from src/agentd/agentd.js pidStartTime): 'l' + field 22 on a
 *  procfs, else 'p' + the `ps -o lstart=` string, else ''. Kept because session metas persist it as `startTime`. */
function startToken(pid) {
  try {
    const st = fs.readFileSync('/proc/' + pid + '/stat', 'utf-8');
    const rest = st.slice(st.lastIndexOf(')') + 2).split(' ');
    if (rest[19]) return 'l' + rest[19];
  } catch { }
  try {
    const r = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf-8' });
    const s = String(r.stdout || '').trim();
    if (s) return 'p' + s;
  } catch { }
  return '';
}

module.exports = {
  PROC_ROOT, UNPROVABLE,
  hasProc, bootIdOf, starttimeOf, stateOf, identityOf, judge, sameProcess, aliveIdentity, signalIdentity, reportOnce, startToken,
  _resetReported: () => _reported.clear(),
};
