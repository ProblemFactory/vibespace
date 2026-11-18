'use strict';
/**
 * THE STARTER (B-91aa, lane bl-loop-a): no timer, sweep or belt starts a program from the hub's main process. Every child
 * the hub starts is a fork of a 4.5–5 GB process, and its main thread waits until the child execs (the witness's
 * «anon_pipe_read in uv_spawn», 17 s in 13 holds over five hours at 2.369.407). The three TIMER sites — the mount
 * liveness probe (src/mounts.js), the local port scan (src/port-forward.js) and the X tools of the desktop belt
 * (src/desktop-display.js run, injected — the daemon keeps its own small process's starts) — hand their program to ONE
 * small node process made once (src/server/child-starter-proc.js): it forks a few MB, never the hub.
 *
 * THE LAWS:
 *  · THE STARTER NEVER OUTLIVES THE HUB: it ends by itself when its pipe to the hub closes (the production unit stops
 *    the hub with KillMode=process — only node's main process is killed; the kernel closes the pipe).
 *  · THE KILL LAW: the hub signals only the starter it spawned and holds (its ChildProcess, by identity); the starter
 *    signals only the children it spawned and holds (by request id). No pattern, no bare pid.
 *  · A DEAD OR SLOW STARTER IS NEVER «the mount is down»: a request whose start was never confirmed, or that got no
 *    answer by its own bound + GUARD_MS — + one more GUARD_MS while the starter lives (a whole-box stall) — answers
 *    `unknown` (never «hung», never «error»). That starter is replaced ONCE; a second fault puts the old road back (a direct
 *    start from this process, the site's own env) — said once in the journal and named by every hourly loop line while in force
 *    («program-starts=direct-since-…»); a fresh starter is tried again at most once an hour (REARM_MS), and a fault after
 *    that re-arm falls back for the hour (a broken starter costs one `unknown` an hour).
 *  · HYGIENE: the starter is born with serviceEnv (the service list, never the hub's secrets); a request carries the
 *    names its site sets (`envAdd`: DISPLAY / XAUTHORITY / a locale / DOCKER_*), never a secret-shaped name; argv as the
 *    site had it. A child gets the starter's env + those names — never more than the site gave before.
 */
const path = require('path');
const { spawn } = require('child_process');
const { serviceEnv, SECRET_SHAPE } = require('../agent-env');

const STARTER_SCRIPT = path.join(__dirname, 'child-starter-proc.js');
const GUARD_MS = 2000;            // a request's answer may come this long after its own bound (the starter's turn, the pipe)
const NO_BOUND_MS = 60000;        // a request with no bound of its own is answered `unknown` past this
const REARM_MS = 60 * 60000;      // the old road is not for the process's life: a fresh starter is tried again AT MOST once an hour (a fault after a re-arm falls back for the hour)
const SECRET_NAME = SECRET_SHAPE;   // its read (S): THE one secret shape (src/agent-env.js), never a second, weaker copy

function createChildStarter({ script = STARTER_SCRIPT, log = console, guardMs = GUARD_MS, rearmMs = REARM_MS } = {}) {
  let proc = null, seq = 0, restarted = false, direct = false, directAt = 0, directSince = 0, said = false, buf = '';
  const mono = () => performance.now();   // the re-arm's clock never steps with the wall clock (its read: a clock stepped back kept the old road an hour longer)
  const pending = new Map();      // id → { resolve, settled, onTimeout, onLateExit, timer, started, pid }
  const stats = { starts: 0, requests: 0, unknown: 0, faults: 0, direct: 0, rearmed: 0 };

  function start() {
    stats.starts++;
    const p = spawn(process.execPath, [script], { env: serviceEnv(process.env), stdio: ['pipe', 'pipe', 'inherit'] });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => { if (p !== proc) return; buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) onLine(line); } });
    p.stdin.on('error', () => { });
    p.on('error', () => { if (p === proc) fault('the starter could not be started'); });
    p.on('exit', () => { if (p === proc) fault('the starter ended'); });
    p.unref(); p.stdout.unref?.(); p.stdin.unref?.();
    proc = p; buf = '';
    return p;
  }
  function refs() { let live = false; for (const q of pending.values()) if (!q.settled) { live = true; break; } try { if (live) { proc?.stdout.ref?.(); proc?.stdin.ref?.(); } else { proc?.stdout.unref?.(); proc?.stdin.unref?.(); } } catch { } }
  // its read (M1): a timed-out request's mark is made HERE, synchronously, before anything else is read — its exit line may be
  // in the same chunk, and onLateExit must find the mark it clears
  function settle(id, r) { const q = pending.get(id); if (!q || q.settled) return; q.settled = true; clearTimeout(q.timer); if (r.timedOut) { try { q.onTimeout?.(q.pid || 0); } catch { } } if (!q.onLateExit || !r.timedOut) pending.delete(id); q.resolve({ ...r, pid: q.pid || 0 }); refs(); }
  function onLine(line) {
    let m; try { m = JSON.parse(line); } catch { return; }
    if (!m || typeof m !== 'object') return;   // only an object is an answer (a stray `null` / number never throws in the pipe's handler)
    const q = pending.get(m.id); if (!q) return;
    if (m.ev === 'started') { q.started = true; q.pid = Number(m.pid) || 0; return; }
    if (m.ev === 'timeout') { settle(m.id, { started: true, timedOut: true, code: null, signal: 'SIGKILL', stdout: '', stderr: '' }); return; }
    if (m.ev === 'exit') {
      if (q.settled) { pending.delete(m.id); refs(); try { q.onLateExit?.(); } catch { } return; }   // a timed-out child that ended at last
      settle(m.id, { started: q.started || m.code != null, timedOut: !!m.timedOut, code: m.code, signal: m.signal || null, stdout: m.stdout || '', stderr: m.stderr || '', error: m.error || null });
    }
  }
  /** a fault of the held starter: its pending requests answer `unknown`; it is replaced ONCE, then the old road */
  function fault(why) {
    stats.faults++;
    const p = proc; proc = null;
    if (p) { try { p.kill('SIGKILL'); } catch { } }   // the ONE we spawned and hold — by identity
    for (const [id, q] of pending) { if (!q.settled) { stats.unknown++; settle(id, { unknown: true, why }); } else pending.delete(id); }
    if (!restarted) { restarted = true; return; }
    if (!direct) {
      direct = true; directAt = mono(); directSince = Date.now();
      if (!said) { said = true; try { log.warn?.(`[child-starter] the starter failed twice (${why}) — the timer sites start their programs from the hub's process again (the old road)`); } catch { } }
    }
  }
  /** run(cmd, args, {timeoutMs, maxBuffer, capture, env, envAdd, onLateExit}) → {started, timedOut, unknown, code, signal, stdout, stderr, error}.
   *  `env` is the site's own env, used ONLY on the old road; `envAdd` the names it sets, the only ones sent to the starter. */
  function run(cmd, args = [], o = {}) {
    stats.requests++;
    if (direct && mono() - directAt >= rearmMs) { direct = false; restarted = true; stats.rearmed++; }   // a fresh starter, tried again (a whole-box stall is not for good) — ONE: a fault after the re-arm falls back for the hour
    if (direct) return runDirect(cmd, args, o);
    if (!proc) { try { start(); } catch (e) { fault('the starter could not be started'); return direct ? runDirect(cmd, args, o) : Promise.resolve({ unknown: true, why: 'no starter' }); } }
    const id = ++seq, add = {};
    for (const [k, v] of Object.entries(o.envAdd || {})) if ((typeof v === 'string' || v === null) && !SECRET_NAME.test(k)) add[k] = v;   // null = the site's env lacks it (removed)
    return new Promise((resolve) => {
      const bound = (o.timeoutMs > 0 ? o.timeoutMs : NO_BOUND_MS) + guardMs;
      const q = { resolve, settled: false, started: false, pid: 0, onTimeout: o.onTimeout || null, onLateExit: o.onLateExit || null, timer: null };
      // its read (S): a timer runs before the loop reads its pipe — a hub held past the bound would fault a working starter; the
      // check waits one turn (setImmediate runs after the poll phase), so an answer already in the pipe is read first
      // + ONE more guard while the starter lives (its readers: a whole-box stall freezes both processes — the hub's timer fires on
      // resume, before the starter has written its line), then the fault
      const check = () => { if (q.settled) return; if (!q.grace && proc) { q.grace = true; q.timer = setTimeout(() => setImmediate(check), guardMs); return; } fault(q.started ? 'the starter did not answer in time' : 'the starter never started it'); };
      q.timer = setTimeout(() => setImmediate(check), bound);
      pending.set(id, q); refs();
      const p = proc;
      if (!p.stdin.listenerCount('error')) p.stdin.on('error', () => { });   // a pipe the starter closed is never an uncaught 'error' (§101)
      try { p.stdin.write(JSON.stringify({ op: 'run', id, cmd: String(cmd), args: (args || []).map(String), env: add, timeoutMs: o.timeoutMs > 0 ? o.timeoutMs : 0, maxBuffer: o.maxBuffer || 1048576, capture: !!o.capture }) + '\n'); }
      catch { fault('the pipe to the starter broke'); }
    });
  }
  /** THE OLD ROAD (after two faults): a direct start from this process, with the site's own env — as before the unit */
  function runDirect(cmd, args, o) {
    stats.direct++;
    return new Promise((resolve) => {
      let c, out = '', err = '', done = false, timedOut = false;
      const max = o.maxBuffer || 1048576;
      try { c = spawn(cmd, args, { env: o.env, stdio: ['ignore', o.capture ? 'pipe' : 'ignore', o.capture ? 'pipe' : 'ignore'] }); }
      catch (e) { resolve({ started: false, code: null, error: String((e && e.code) || e) }); return; }
      if (o.capture) { c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8'); c.stdout.on('data', (d) => { if (out.length < max) out += d; }); c.stderr.on('data', (d) => { if (err.length < max) err += d; }); }
      const t = o.timeoutMs > 0 ? setTimeout(() => { timedOut = true; try { c.kill('SIGKILL'); } catch { } if (!done) { done = true; try { o.onTimeout?.(c.pid || 0); } catch { } resolve({ started: true, timedOut: true, code: null, signal: 'SIGKILL', stdout: '', stderr: '', pid: c.pid || 0 }); } }, o.timeoutMs) : null;
      c.on('error', (e) => { if (t) clearTimeout(t); if (!done) { done = true; resolve({ started: false, code: null, error: String((e && e.code) || e), stdout: out, stderr: err }); } });
      c.on('close', (code, signal) => { if (t) clearTimeout(t); if (!done) { done = true; resolve({ started: true, timedOut, code, signal, stdout: out, stderr: err }); } else if (timedOut) { try { o.onLateExit?.(); } catch { } } });
    });
  }
  /** the hub's end of the pipe closed (a test's «the hub is gone»): the starter ends by itself — nothing is signalled */
  function closePipe() { const p = proc; proc = null; if (p) { if (!p.stdin.listenerCount('error')) p.stdin.on('error', () => { }); try { p.stdin.end(); } catch { } } return p; }
  return { run, closePipe, stats: () => ({ ...stats, restarted, direct, directSince: direct ? directSince : 0, pending: pending.size, pid: proc ? proc.pid : null }), _proc: () => proc };
}

let shared = null;
/** THE hub's starter (one per process) */
function childStarter() { if (!shared) shared = createChildStarter(); return shared; }
/** a suite's seam: hand the process a starter of its own (null = the default again) */
function setChildStarter(s) { shared = s || null; }

module.exports = { createChildStarter, childStarter, setChildStarter, STARTER_SCRIPT, GUARD_MS, SECRET_NAME };
