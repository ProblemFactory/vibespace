'use strict';
/**
 * THE STARTER PROCESS (B-91aa; the hub's half is src/server/child-starter.js). A small node process the hub makes once:
 * it starts the programs of the hub's timer sites so the 5 GB hub never forks for them. One JSON line a request on
 * stdin — {op:'run', id, cmd, args, env (the names the site sets), timeoutMs, maxBuffer, capture} —
 * and one JSON line an event on stdout: started (its pid) · timeout (killed at its bound; the child may stay in D state
 * on a dead FUSE mount) · exit (code, signal, the captured output, capped). Its OWN env was built by the hub's
 * serviceEnv: a child gets it + the request's names, nothing else — or, for a request marked `whole` (B-323e), exactly the
 * request's env (its site built it through serviceEnv), and this process keeps none of it.
 * IT NEVER OUTLIVES THE HUB: when its stdin ends or closes (the hub is gone — the pipe closes with it), or its stdout
 * breaks, it kills the children it holds and ends. It signals only the children it spawned and holds (by request id).
 */
const { spawn } = require('child_process');

const held = new Map();   // request id → the ChildProcess this process spawned
let buf = '', ending = false;

function send(o) { try { process.stdout.write(JSON.stringify(o) + '\n'); } catch { bye(); } }
function bye() {
  if (ending) return;
  ending = true;
  for (const c of held.values()) { try { c.kill('SIGKILL'); } catch { } }   // only the children it spawned and holds
  held.clear();
  process.exit(0);
}
function handle(line) {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.op !== 'run') return;
  const id = m.id, max = Number(m.maxBuffer) > 0 ? Number(m.maxBuffer) : 1048576, capture = !!m.capture;
  const cmd = String(m.cmd || ''), args = Array.isArray(m.args) ? m.args.map(String) : [];
  const env = m.whole === true ? {} : { ...process.env };   // B-323e: a whole env is the child's env as its site built it
  for (const [k, v] of Object.entries(m.env || {})) { if (typeof v === 'string') env[k] = v; else if (v === null) delete env[k]; }   // null: the site's env lacks it
  let c, out = '', err = '', done = false, timedOut = false, timer = null;
  try { c = spawn(cmd, args, { env, stdio: ['ignore', capture ? 'pipe' : 'ignore', capture ? 'pipe' : 'ignore'] }); }
  catch (e) { send({ id, ev: 'exit', code: null, signal: null, error: String((e && e.code) || e) }); return; }
  held.set(id, c);
  if (capture) {
    c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
    c.stdout.on('data', (d) => { if (out.length < max) out += d; });
    c.stderr.on('data', (d) => { if (err.length < max) err += d; });
  }
  const end = (o) => { if (done) return; done = true; if (timer) clearTimeout(timer); held.delete(id); send({ id, ev: 'exit', timedOut, stdout: out.slice(0, max), stderr: err.slice(0, max), ...o }); };
  c.on('spawn', () => send({ id, ev: 'started', pid: c.pid }));
  c.on('error', (e) => end({ code: null, signal: null, error: String((e && e.code) || e) }));
  c.on('close', (code, signal) => end({ code, signal }));
  if (Number(m.timeoutMs) > 0) timer = setTimeout(() => { timedOut = true; try { c.kill('SIGKILL'); } catch { } send({ id, ev: 'timeout' }); }, Number(m.timeoutMs));
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) handle(line); } });
process.stdin.on('end', bye);
process.stdin.on('close', bye);
process.stdout.on('error', bye);
