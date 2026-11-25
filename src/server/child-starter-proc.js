'use strict';
/**
 * THE STARTER PROCESS (B-91aa; the hub's half is src/server/child-starter.js). A small node process the hub makes once:
 * it starts the programs of the hub's timer sites so the 5 GB hub never forks for them. One JSON line a request on
 * stdin — {op:'run', id, cmd, args, env (the names the site sets), timeoutMs, maxBuffer, capture} —
 * and one JSON line an event on stdout: started (its pid) · timeout (killed at its bound; the child may stay in D state
 * on a dead FUSE mount) · exit (code, signal, the captured output, capped). A child whose output passes maxBuffer is ENDED
 * (its pipes closed, SIGTERM — as execFile did) and both events say `overflow`. Its OWN env was built by the hub's
 * serviceEnv: a child gets it + the request's names, nothing else — or, for a request marked `whole` (B-323e), exactly the
 * request's env (its site built it through serviceEnv), and this process keeps none of it.
 * IT NEVER OUTLIVES THE HUB: when its stdin ends or closes (the hub is gone — the pipe closes with it), or its stdout
 * breaks, it kills the children it holds and ends. It signals only the children it spawned and holds (by request id).
 * A DETACHED CHILD (op 'detach', B-323e — the mount daemon's own start, 主开发 r1299) is the one it NEVER signals, NEVER holds,
 * NEVER counts: started in its own session, its output to the log file the hub named (opened here for append; the hub judged the
 * path and wrote its marker first), unref'd, answered at its SPAWN (started + pid) or by its start error; it outlives this process
 * and the hub. Its env (a record's sign-in material, the request's whole env) is handed to that one child and kept by nothing
 * here: the request is dropped once it is started, and no later child sees it (each child's env is built anew).
 */
const { spawn } = require('child_process');
const fs = require('fs');

const held = new Map();   // request id → the ChildProcess this process spawned
let buf = '', ending = false;

function send(o) { try { process.stdout.write(JSON.stringify(o) + '\n'); } catch { bye(); } }
/** B-323e's remainder (lane bl-chat-b, the coordinator's r2689 / r2862): a SESSION child's group — the one this process made itself (the
 *  child was started detached, so its pid is its group's id) — ended by this process's own handle on that child; never a name, never a
 *  pattern. ONCE: at the child's exit (or at the bound while it still runs), and `vsSession` is cleared in the same step, so nothing is
 *  ever sent to that number again — not at the bound, not at this process's end (r2862: the number of a reaped leader may be reused) */
function endOwnGroup(c) { if (c && c.vsSession && Number.isInteger(c.pid) && c.pid > 1) { c.vsSession = false; try { process.kill(-c.pid, 'SIGKILL'); } catch { } } }
/** r2862: a session child's run ENDS at its exit, after this short drain (its last output read), its pipes then closed — a holder the
 *  person's rc started outside the group (a `setsid` tool with no redirect) never holds the answer, nor the entry in `held` */
const SESSION_DRAIN_MS = 100;   // …then ONE more turn of the loop before the pipes close (r2917: bytes already in a pipe are read first, even on a stalled loop)
function bye() {
  if (ending) return;
  ending = true;
  for (const c of held.values()) { try { c.kill('SIGKILL'); } catch { } endOwnGroup(c); }   // only the children it spawned and holds (a session child: its own group too)
  held.clear();
  process.exit(0);
}
function handle(line) {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.op === 'detach') { detach(m); return; }   // B-323e: never held (below)
  if (m.op !== 'run') return;
  const id = m.id, max = Number(m.maxBuffer) > 0 ? Number(m.maxBuffer) : 1048576, capture = !!m.capture;
  const cmd = String(m.cmd || ''), args = Array.isArray(m.args) ? m.args.map(String) : [];
  const env = m.whole === true ? {} : { ...process.env };   // B-323e: a whole env is the child's env as its site built it
  for (const [k, v] of Object.entries(m.env || {})) { if (typeof v === 'string') env[k] = v; else if (v === null) delete env[k]; }   // null: the site's env lacks it
  let c, out = '', err = '', done = false, timedOut = false, timer = null, outN = 0, errN = 0, overflow = false, drainT = null, graceT = null;
  // line 1004's follow (主开发 r4444): `termFirst` — the ending at the bound as execFile's: SIGTERM first (a parent that relays it, as sudo
  // does to a mount program under it, passes it on), SIGKILL only after this grace (ms). Absent: SIGKILL at the bound, as before.
  const termFirst = Number(m.termFirst) > 0 ? Number(m.termFirst) : 0;
  // B-323e's remainder (r2689): a SESSION request — the child in its own session (detached) and folder; at its exit and at the bound
  // this process ends that session's group (a shell whose rc left a job holding the pipe answers when the shell itself has ended)
  const session = m.session && typeof m.session === 'object' ? { cwd: typeof m.session.cwd === 'string' && m.session.cwd ? m.session.cwd : undefined } : null;
  try { c = spawn(cmd, args, { env, stdio: ['ignore', capture ? 'pipe' : 'ignore', capture ? 'pipe' : 'ignore'], ...(session ? { detached: true, cwd: session.cwd } : {}) }); }
  catch (e) { send({ id, ev: 'exit', code: null, signal: null, error: String((e && e.code) || e) }); return; }
  held.set(id, c);
  // the error listener FIRST (ckpt61): a start that fails at once (EMFILE / ENFILE) returns with no pipes and its 'error' queued for
  // the next tick — answered as the child's end, never an uncaught exception (this process's own table full: the hub's request
  // answers the error, the starter lives)
  const end = (o) => { if (done) return; done = true; if (timer) clearTimeout(timer); if (drainT) clearTimeout(drainT); if (graceT) clearTimeout(graceT); held.delete(id); send({ id, ev: 'exit', timedOut, overflow, stdout: out.slice(0, max), stderr: err.slice(0, max), ...o }); };
  c.on('error', (e) => end({ code: null, signal: null, error: String((e && e.code) || e) }));
  if (session) { c.vsSession = true; c.on('exit', (code, signal) => { endOwnGroup(c); if (timer) { clearTimeout(timer); timer = null; } drainT = setTimeout(() => { drainT = null; setImmediate(() => { if (done) return; try { c.stdout?.destroy(); c.stderr?.destroy(); } catch { } end({ code, signal }); }); }, SESSION_DRAIN_MS); }); }   // r2862: the group ended ONCE, the run answered at the exit
  if (capture && c.stdout && c.stderr) {
    c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
    // past the bound the child is ENDED, as execFile's maxBuffer did (B-323e smalls, the reader's M2: kept running, a slow listing past
    // 1 MB reached its timer and read «hung»)
    const over = () => { if (overflow) return; overflow = true; try { c.stdout?.destroy(); c.stderr?.destroy(); c.kill('SIGTERM'); } catch { } };   // execFile's kill(): the pipes first (a grandchild holding them never holds the answer)
    c.stdout.on('data', (d) => { if (out.length < max) out += d; outN += Buffer.byteLength(d); if (outN > max) over(); });   // BYTES, as execFile counted
    c.stderr.on('data', (d) => { if (err.length < max) err += d; errN += Buffer.byteLength(d); if (errN > max) over(); });
  }
  c.on('spawn', () => send({ id, ev: 'started', pid: c.pid }));
  c.on('close', (code, signal) => end({ code, signal }));
  if (Number(m.timeoutMs) > 0) timer = setTimeout(() => { timedOut = true; if (termFirst) { try { c.kill('SIGTERM'); } catch { } graceT = setTimeout(() => { graceT = null; if (done) return; try { c.kill('SIGKILL'); } catch { } endOwnGroup(c); }, termFirst); } else { try { c.kill('SIGKILL'); } catch { } endOwnGroup(c); } send({ id, ev: 'timeout', overflow, signal: termFirst ? 'SIGTERM' : 'SIGKILL' }); }, Number(m.timeoutMs));   // an overflow kept: the bound past the cut is not «hung»
}

/** B-323e (主开发 r1299): THE DETACHED START — never in `held`, never signalled, never counted; the env dropped once started */
function detach(m) {
  const id = m.id, cmd = String(m.cmd || ''), args = Array.isArray(m.args) ? m.args.map(String) : [], logPath = String(m.log || '');
  const env = (m.whole === true) ? {} : { ...process.env };   // (as the run op builds it — its text kept apart: a suite's red anchors the run op's line; no closure below holds it)
  for (const [k, v] of Object.entries(m.env || {})) { if (typeof v === 'string') env[k] = v; else if (v === null) delete env[k]; }
  m.env = null;   // the request keeps no sign-in material once its child's env is built
  let fd = null, c = null, said = false, startErr = null, closeErr = null;
  const no = (e) => { send({ id, ev: 'exit', code: null, signal: null, error: String((e && e.code) || e) }); };
  if (m.quiet !== true) { try { fd = fs.openSync(logPath, 'a'); } catch (e) { return no(e); } }   // B-91aa's remainder: a job's start (quiet) has no log — its wrapper writes its own
  try { c = spawn(cmd, args, { env, detached: true, stdio: fd === null ? 'ignore' : ['ignore', fd, fd] }); } catch (e) { startErr = e; }
  // ONE close of the log's descriptor, here: spawn returns after the fork, so the child already holds its own copy (or none started)
  if (fd !== null) { try { fs.closeSync(fd); } catch (e) { closeErr = String((e && e.code) || e); } }
  if (!c) return no(startErr);
  c.on('error', (e) => { if (said) return; said = true; no(e); });
  c.on('spawn', () => { if (said) return; said = true; try { c.unref(); } catch { } send({ id, ev: 'started', pid: c.pid, detached: true, starttime: (() => { try { return require('../proc-identity.js').starttimeOf(c.pid); } catch { return null; } })(), ...(closeErr ? { logClose: closeErr } : {}) }); });   // its start time read here, before this process can reap it (the hub's adoption proof)
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) handle(line); } });
process.stdin.on('end', bye);
process.stdin.on('close', bye);
process.stdout.on('error', bye);
