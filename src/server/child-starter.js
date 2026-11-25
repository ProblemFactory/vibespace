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
 *    start from this process, with the env the starter's road gives: the service env + the request's names, or a whole env as its site built it) — said once in the journal and named by every hourly loop line while in force
 *    («program-starts=direct-since-…»); a fresh starter is tried again at most once an hour (REARM_MS), and a fault after
 *    that re-arm falls back for the hour (a broken starter costs one `unknown` an hour).
 *  · HYGIENE: the starter is born with serviceEnv (the service list, never the hub's secrets); a request carries the
 *    names its site sets (`envAdd`: DISPLAY / XAUTHORITY / a locale / DOCKER_*), never a secret-shaped name; argv as the
 *    site had it. A child gets the starter's env + those names — never more than the site gave before.
 *  · THE WHOLE ENV (B-323e, ruled (A)): a site that BUILT its child's whole env through the lawful builder (serviceEnv — the
 *    mount sweep's rclone probes: rcloneEnv, whose proxy names and RCLONE_CONFIG_VS_* credential the name rule would drop)
 *    sends it whole (`wholeEnv: true` + `env`): the starter starts THAT ONE child with exactly it — the env the old road
 *    gave it — and keeps nothing. The hub's OWN secret prefixes (THE one secret shape's first half) are refused in it, a
 *    guard against a mistake (a site handing process.env whole). It is never said: no part of it reaches a journal, a log
 *    line or an error's words (the refusal is said once, as a count).
 *  · THE DETACHED START (B-323e — the mount daemon's own start, 主开发 r1299): `run(cmd, args, { detach: { log }, wholeEnv, env,
 *    timeoutMs })` — a long-lived child the starter NEVER signals, NEVER holds, NEVER counts (its fault, its end, its re-arm and the
 *    hub's end leave it alone: the kill law still reads «only what it holds»). Its own session, its output to the log the caller
 *    judged (opened for append there), its answer AT THE SPAWN: {started, pid} or its start error; `timeoutMs` bounds only that
 *    answer. NO ANSWER IS NO VERDICT: `unknown` — the caller's own look decides whether one lives (a reply lost is not «no start»).
 *    The old road (after two faults) starts it the same way from this process.
 *  · THE ENDING AT THE BOUND (line 1004's follow, 主开发 r4444): a start past its bound is ended by SIGKILL — unless its site asks
 *    `termFirst: <grace ms>`: then SIGTERM first (a parent that RELAYS it — sudo, to the mount or unmount program under it — passes it
 *    on; a SIGKILL it cannot relay would leave a root program running after the hub said «failed»), SIGKILL only after the grace. On
 *    both roads; the answer is «timed out» at the bound either way (signal SIGTERM). Every other site's ending is unchanged.
 *  · THE JOB'S START (B-91aa's remainder, 主开发 r4525 / r4591): a background job's wrapper is a DETACHED start too —
 *    `detach: { job: true, quiet: true }`: no log (the wrapper writes its own; its stdio ignored, as the hub's own start gave it)
 *    and the job's MARK admitted by name in its whole env (JOB_MARKS: VIBESPACE_JOB_ID, the /proc mark the hub's walks read —
 *    scoped to the request that built it). A VAULT job keeps the direct start (its values ride the hub's own pipe on fd 3): the
 *    jobs engine notes each such start (`noteDirect`), counted in `directJobs` — the hourly line says how many an hour.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { serviceEnv, SECRET_SHAPE } = require('../agent-env');

const STARTER_SCRIPT = path.join(__dirname, 'child-starter-proc.js');
const GUARD_MS = 2000;            // a request's answer may come this long after its own bound (the starter's turn, the pipe)
const NO_BOUND_MS = 60000;        // a request with no bound of its own is answered `unknown` past this
const REARM_MS = 60 * 60000;      // the old road is not for the process's life: a fresh starter is tried again AT MOST once an hour (a fault after a re-arm falls back for the hour)
const SECRET_NAME = SECRET_SHAPE;   // its read (S): THE one secret shape (src/agent-env.js), never a second, weaker copy
const HUB_OWN = ((h) => (h ? new RegExp(h[0], 'i') : SECRET_SHAPE))(/^\^\([^)]*\)/.exec(SECRET_SHAPE.source));   // B-323e: THE one shape's first half — the hub's own prefixes (VIBESPACE_ / CLAUDE_ / …), read from it, never retyped (a reshaped shape: all of it, refused — test-mount-probe-starts ③ says so)

function createChildStarter({ script = STARTER_SCRIPT, log = console, guardMs = GUARD_MS, rearmMs = REARM_MS } = {}) {
  let proc = null, seq = 0, restarted = false, direct = false, directAt = 0, directSince = 0, said = false, buf = '';
  const mono = () => performance.now();   // the re-arm's clock never steps with the wall clock (its read: a clock stepped back kept the old road an hour longer)
  const pending = new Map();      // id → { resolve, settled, onTimeout, onLateExit, timer, started, pid }
  const stats = { starts: 0, requests: 0, unknown: 0, faults: 0, direct: 0, rearmed: 0, refused: 0, directJobs: 0 };   // directJobs: a vault job's start, by design on the hub's own road (B-91aa's remainder, r4591)
  let saidRefused = false;
  /** B-323e: a whole env's names, the hub's own prefixes refused (counted; said once as a count — never a name, never a value) */
  function wholeOf(env, marks = false) {   // marks: a SESSION request's whole env may carry WHOLE_MARKS (r2862's reader: the mark scoped to the request that built it); a JOB's, JOB_MARKS (a Set)
    const out = {}; let n = 0;
    for (const [k, v] of Object.entries(env || {})) { if (typeof v !== 'string') continue; if (HUB_OWN.test(k) && !(marks && (marks instanceof Set ? marks : WHOLE_MARKS).has(k))) { n++; continue; } out[k] = v; }
    if (n) { stats.refused += n; if (!saidRefused) { saidRefused = true; try { log.warn?.(`[child-starter] a whole env carried ${n} name(s) of the hub's own secret prefixes — refused (a site must build its child's env through serviceEnv)`); } catch { } } }
    return out;
  }

  function start() {
    stats.starts++;
    const p = spawn(process.execPath, [script], { env: serviceEnv(process.env), stdio: ['pipe', 'pipe', 'inherit'] });
    // THE ERROR LISTENER FIRST (ckpt61's hosted red: test-restore-liveness's minute at a FULL file table ended the hub, exit 1).
    // A start that fails at once — EMFILE / ENFILE: node's ChildProcess.spawn queues the 'error' for the next tick and RETURNS
    // with no pipes (stdout, stdin null) — is the starter's fault, answered by run(): a pipe touched before this line threw, and
    // the queued 'error' then found no listener — an uncaught exception, and the hub ended. STARTING A HELPER NEVER ENDS THE HUB.
    p.on('error', () => { if (p === proc) fault('the starter could not be started'); });
    if (!p.stdout || !p.stdin) throw new Error('the starter has no pipes: its start failed at once');
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => { if (p !== proc) return; buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) onLine(line); } });
    p.stdin.on('error', () => { });
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
    if (m.ev === 'started') { q.started = true; q.pid = Number(m.pid) || 0; if (q.detach && m.logClose) log.warn(`[child-starter] a detached start's log descriptor did not close in the starter: ${m.logClose}`); if (q.detach) settle(m.id, { started: true, detached: true, starttime: m.starttime == null ? null : m.starttime, code: null, signal: null, stdout: '', stderr: '', error: null }); return; }   // B-323e: a detached start answers at its spawn
    if (m.ev === 'timeout') { settle(m.id, { started: true, timedOut: true, overflow: !!m.overflow, code: null, signal: m.signal === 'SIGTERM' ? 'SIGTERM' : 'SIGKILL', stdout: '', stderr: '' }); return; }
    if (m.ev === 'exit') {
      if (q.settled) { pending.delete(m.id); refs(); try { q.onLateExit?.(); } catch { } return; }   // a timed-out child that ended at last
      settle(m.id, { started: q.started || m.code != null, timedOut: !!m.timedOut, overflow: !!m.overflow, code: m.code, signal: m.signal || null, stdout: m.stdout || '', stderr: m.stderr || '', error: m.error || null });
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
  /** run(cmd, args, {timeoutMs, maxBuffer, capture, env, envAdd, onLateExit, session, termFirst}) → {started, timedOut, overflow, unknown, code, signal, stdout, stderr, error} (overflow: the output passed maxBuffer and the child was ended, as execFile did).
   *  `env` is read ONLY with `wholeEnv` (below); `envAdd` the names it sets, the only ones sent to the starter, on both roads —
   *  or, with `wholeEnv: true`, `env` IS the child's whole env (built through serviceEnv), sent whole (B-323e). */
  function run(cmd, args = [], o = {}) {
    stats.requests++;
    if (o.wholeEnv) o = { ...o, env: wholeOf(o.env, o.detach && o.detach.job ? JOB_MARKS : !!o.session) };   // B-323e: the same refused names on both roads (the starter's and the old one); a job's mark by name
    if (direct && mono() - directAt >= rearmMs) { direct = false; restarted = true; stats.rearmed++; }   // a fresh starter, tried again (a whole-box stall is not for good) — ONE: a fault after the re-arm falls back for the hour
    if (direct) return runDirect(cmd, args, o);
    if (!proc) { try { start(); } catch (e) { fault('the starter could not be started'); if (direct) return runDirect(cmd, args, o); stats.unknown++; return Promise.resolve({ unknown: true, why: 'no starter' }); } }   // the request answers unknown, counted as one
    const id = ++seq, add = o.wholeEnv ? o.env : {};
    if (!o.wholeEnv) for (const [k, v] of Object.entries(o.envAdd || {})) if ((typeof v === 'string' || v === null) && (!SECRET_NAME.test(k) || PLAN_MARKS.has(k))) add[k] = v;   // null = the site's env lacks it (removed); a PLAN MARK kept by its whole name (below)
    return new Promise((resolve) => {
      const bound = (o.timeoutMs > 0 ? o.timeoutMs : NO_BOUND_MS) + guardMs;
      const q = { resolve, settled: false, started: false, pid: 0, onTimeout: o.onTimeout || null, onLateExit: o.onLateExit || null, timer: null, detach: !!o.detach };
      // its read (S): a timer runs before the loop reads its pipe — a hub held past the bound would fault a working starter; the
      // check waits one turn (setImmediate runs after the poll phase), so an answer already in the pipe is read first
      // + ONE more guard while the starter lives (its readers: a whole-box stall freezes both processes — the hub's timer fires on
      // resume, before the starter has written its line), then the fault
      const check = () => { if (q.settled) return; if (!q.grace && proc) { q.grace = true; q.timer = setTimeout(() => setImmediate(check), guardMs); return; } fault(q.started ? 'the starter did not answer in time' : 'the starter never started it'); };
      q.timer = setTimeout(() => setImmediate(check), bound);
      pending.set(id, q); refs();
      const p = proc;
      if (!p.stdin.listenerCount('error')) p.stdin.on('error', () => { });   // a pipe the starter closed is never an uncaught 'error' (§101)
      try { p.stdin.write(JSON.stringify(o.detach
        ? { op: 'detach', id, cmd: String(cmd), args: (args || []).map(String), env: add, ...(o.wholeEnv ? { whole: true } : {}), log: String(o.detach.log || ''), ...(o.detach.quiet ? { quiet: true } : {}) }   // B-323e: never held there; a job's start: no log
        : { op: 'run', id, cmd: String(cmd), args: (args || []).map(String), env: add, ...(o.wholeEnv ? { whole: true } : {}), ...(o.session ? { session: { cwd: typeof o.session.cwd === 'string' ? o.session.cwd : '' } } : {}), timeoutMs: o.timeoutMs > 0 ? o.timeoutMs : 0, maxBuffer: o.maxBuffer || 1048576, capture: !!o.capture, ...(o.termFirst > 0 ? { termFirst: Number(o.termFirst) } : {}) }) + '\n'); }
      catch { fault('the pipe to the starter broke'); }
    });
  }
  /** THE OLD ROAD's env (主开发 05:18Z, B-323e left): exactly what the starter's road gives — a whole env as its site built it
   *  (`wholeEnv`, already through wholeOf), else the service env with the request's names on top (a secret-shaped name refused,
   *  null removes). A site's non-whole `env` is never read (its read's must: the desktop belt hands an env made from the agent
   *  env — a cloud key, a token — that the starter's road never gave its child) — never the hub's whole env */
  function directEnv(o) {
    if (o.wholeEnv) return o.env;
    const env = serviceEnv(process.env);
    for (const [k, v] of Object.entries(o.envAdd || {})) { if (SECRET_NAME.test(k) && !PLAN_MARKS.has(k)) continue; if (typeof v === 'string') env[k] = v; else if (v === null) delete env[k]; }   // the same PLAN MARKS as the starter's road
    return env;
  }
  /** THE OLD ROAD (after two faults): a direct start from this process, with the starter road's env (directEnv) */
  function runDirect(cmd, args, o) {
    stats.direct++;
    if (o.detach) return new Promise((resolve) => {   // B-323e: the detached start, as the starter makes it (its own session, the log, the answer at its spawn)
      let fd = null, c = null, said = false, startErr = null;
      const no = (e) => resolve({ started: false, code: null, error: String((e && e.code) || e) });
      if (!o.detach.quiet) { try { fd = fs.openSync(String(o.detach.log || ''), 'a'); } catch (e) { no(e); return; } }   // a job's start (quiet): no log, its stdio ignored
      try { const env = directEnv(o); c = spawn(cmd, args, { env, detached: true, stdio: fd === null ? 'ignore' : ['ignore', fd, fd] }); } catch (e) { startErr = e; }
      // ONE close of the log's descriptor, here: spawn returns after the fork, so the child already holds its own copy (or none started)
      if (fd !== null) { try { fs.closeSync(fd); } catch (e) { log.warn(`[child-starter] the old road's log descriptor did not close: ${(e && e.code) || e}`); } }
      if (!c) { no(startErr); return; }
      c.on('error', (e) => { if (said) return; said = true; no(e); });
      c.on('spawn', () => { if (said) return; said = true; try { c.unref(); } catch { } resolve({ started: true, detached: true, pid: c.pid, starttime: (() => { try { return require('../proc-identity.js').starttimeOf(c.pid); } catch { return null; } })(), code: null, signal: null, stdout: '', stderr: '', error: null }); });
    });
    return new Promise((resolve) => {
      let c, out = '', err = '', done = false, timedOut = false, outN = 0, errN = 0, overflow = false, t = null, g = null;
      const max = o.maxBuffer || 1048576;
      const termFirst = o.termFirst > 0 ? Number(o.termFirst) : 0;   // line 1004's follow (r4444): the same ending on this road
      const over = () => { if (overflow) return; overflow = true; try { c.stdout?.destroy(); c.stderr?.destroy(); c.kill('SIGTERM'); } catch { } };   // past the bound: ended, as execFile did (the pipes first)
      try { c = spawn(cmd, args, { env: directEnv(o), stdio: ['ignore', o.capture ? 'pipe' : 'ignore', o.capture ? 'pipe' : 'ignore'], ...(o.session ? { detached: true, cwd: (typeof o.session.cwd === 'string' && o.session.cwd) || undefined } : {}) }); }
      catch (e) { resolve({ started: false, code: null, error: String((e && e.code) || e) }); return; }
      // the error listener FIRST, as the starter's own (ckpt61): a start that fails at once has no pipes and its 'error' queued
      c.on('error', (e) => { if (t) clearTimeout(t); if (!done) { done = true; resolve({ started: false, code: null, error: String((e && e.code) || e), stdout: out, stderr: err }); } });
      if (o.session && c) { c.vsSession = true; c.on('exit', (code, signal) => { endOwnGroup(c); if (t) { clearTimeout(t); t = null; } setTimeout(() => setImmediate(() => { if (done) return; done = true; try { c.stdout?.destroy(); c.stderr?.destroy(); } catch { } resolve({ started: true, timedOut, overflow, code, signal, stdout: out, stderr: err }); }), SESSION_DRAIN_MS); }); }   // B-323e's remainder (r2689 / r2862): as the starter's own session branch — the group ended once, the run answered at the exit
      if (o.capture && c.stdout && c.stderr) { c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8'); c.stdout.on('data', (d) => { if (out.length < max) out += d; outN += Buffer.byteLength(d); if (outN > max) over(); }); c.stderr.on('data', (d) => { if (err.length < max) err += d; errN += Buffer.byteLength(d); if (errN > max) over(); }); }
      t = o.timeoutMs > 0 ? setTimeout(() => { timedOut = true; if (termFirst) { try { c.kill('SIGTERM'); } catch { } g = setTimeout(() => { g = null; if (c.exitCode !== null || c.signalCode !== null) return; try { c.kill('SIGKILL'); } catch { } endOwnGroup(c); }, termFirst); } else { try { c.kill('SIGKILL'); } catch { } endOwnGroup(c); } if (!done) { done = true; try { o.onTimeout?.(c.pid || 0); } catch { } resolve({ started: true, timedOut: true, overflow, code: null, signal: termFirst ? 'SIGTERM' : 'SIGKILL', stdout: '', stderr: '', pid: c.pid || 0 }); } }, o.timeoutMs) : null;
      c.on('close', (code, signal) => { if (t) clearTimeout(t); if (g) { clearTimeout(g); g = null; } if (!done) { done = true; resolve({ started: true, timedOut, overflow, code, signal, stdout: out, stderr: err }); } else if (timedOut) { try { o.onLateExit?.(); } catch { } } });
    });
  }
  /** the hub's end of the pipe closed (a test's «the hub is gone»): the starter ends by itself — nothing is signalled */
  function closePipe() { const p = proc; proc = null; if (p) { if (!p.stdin.listenerCount('error')) p.stdin.on('error', () => { }); try { p.stdin.end(); } catch { } } return p; }
  /** B-91aa's remainder (r4591): a job start the jobs engine made ITSELF by design (a vault job: its values ride the hub's pipe) — counted */
  function noteDirect() { stats.directJobs++; }
  return { run, closePipe, noteDirect, stats: () => ({ ...stats, restarted, direct, directSince: direct ? directSince : 0, pending: pending.size, pid: proc ? proc.pid : null }), _proc: () => proc };
}

/** B-323e's remainder (lane bl-chat-b, the coordinator's r2689 / r2862): the old road's SESSION child's group — the one this process made
 *  (started detached: its pid is its group's id) — ended by its own handle, ONCE (`vsSession` cleared in the same step: nothing is sent to
 *  that number again after the child's exit); never a name, never a pattern */
function endOwnGroup(c) { if (c && c.vsSession && Number.isInteger(c.pid) && c.pid > 1) { c.vsSession = false; try { process.kill(-c.pid, 'SIGKILL'); } catch { } } }
const SESSION_DRAIN_MS = 100;   // r2917: then ONE more turn of the loop before the pipes close (bytes already in a pipe are read first); r2862: a session child's run ends at its exit after this drain, its pipes then closed (the starter's own rule)
/** B-323e's remainder (lane bl-chat-b, r2689): the MARKS a whole env may carry under the hub's own prefixes — a word a person's rc
 *  reads, never a secret: the login-shell look's VIBESPACE_SHELL_PROBE=1 («skip a tmux autostart or a banner») */
const WHOLE_MARKS = new Set(['VIBESPACE_SHELL_PROBE']);
/** B-91aa's remainder (主开发 r4591): THE JOB'S MARK — a job wrapper's whole env (jobs.js wrapperEnv: PATH / HOME / LANG / TMPDIR + this)
 *  carries the job's id under the hub's own prefix: the /proc mark the hub's walks read (jobs.js _walkMarked, left-behind.js), an id,
 *  never a secret. Admitted by its WHOLE name, only on a job's request (`detach.job`) */
const JOB_MARKS = new Set(['VIBESPACE_JOB_ID']);
/** B-ddf3 (lane bl-scratch, the coordinator's r4027): the NAMED PLAN MARKS a request's `envAdd` may carry under the hub's own prefixes
 *  — a plan the site built, never a secret: the CLI-config helper's plan (VIBESPACE_CLI_CONFIG, src/server/cli-config-runner.js; the
 *  shipped helper reads it by that name). Matched by the WHOLE name, on BOTH roads (the starter's and the direct one); every other name
 *  of the one secret shape is still refused. Its value rides the request's env only — never an argument, never a journal line */
const PLAN_MARKS = new Set(['VIBESPACE_CLI_CONFIG']);
let shared = null;
/** THE hub's starter (one per process) */
function childStarter() { if (!shared) shared = createChildStarter(); return shared; }
/** B-360d (lane bl-keys-misc, r1020) — a program run through the starter, answered in execFile's shape: → (bin, args, {timeout, maxBuffer})
 *  → Promise<{ err, stdout }>; `err` = a failure, a timeout, an output past the buffer, or the starter's «no answer» — said as what it
 *  is, never «the program failed» as a guess. The hub hands it to a SHARED module that keeps execFile on the device agent
 *  (src/sysinfo.js useStarter), so the device's bundle carries none of these words. */
function execFileVia(starter) {
  return (bin, args, { timeout = 8000, maxBuffer = 1024 * 1024 } = {}) => Promise.resolve().then(() => starter.run(bin, args, { timeoutMs: timeout, maxBuffer, capture: true, envAdd: {} })).then((r) => {
    const ok = !!r && r.code === 0 && !r.timedOut && !r.overflow && !r.unknown;
    const why = !r ? 'no answer' : r.unknown ? 'the starter gave no answer' : r.timedOut ? 'timed out' : r.overflow ? `its output passed ${maxBuffer} bytes` : (r.error || `exit ${r.code}`);
    return { err: ok ? null : Object.assign(new Error(`${bin}: ${why}`), { code: r ? r.code : null, killed: !!(r && r.timedOut) }), stdout: String((r && r.stdout) || '') };
  }, (e) => ({ err: e instanceof Error ? e : new Error(String(e)), stdout: '' }));
}
/** a suite's seam: hand the process a starter of its own (null = the default again) */
function setChildStarter(s) { shared = s || null; }

module.exports = { createChildStarter, childStarter, setChildStarter, execFileVia, STARTER_SCRIPT, GUARD_MS, SECRET_NAME, JOB_MARKS };
