'use strict';
/**
 * THE ATTACH LAUNCH'S I/O HALF — lane one-browser-b1 (design q-026 r1 §2.1 / §2.4, B1). The rules are PURE
 * (src/browser-attach.js); this file touches the machine: it finds the Chrome executable on the PATH the keeper runs
 * with, makes a config's socket dir (0700, this uid's, never a symlink — browser-env's ensureSocketDir rule, both levels),
 * and SPAWNS Chrome — detached (its own session: a server restart adopts it by pid + starttime), its output into a FILE
 * (the stderr-pipe rule: never a pipe nobody reads), a stale DevToolsActivePort deleted BEFORE the spawn and a NEW one
 * (mtime after the spawn, both lines written) polled for at most PORT_WAIT_MS. No new file, or an early exit ⇒ the Chrome
 * it spawned is ended and the refusal is said by name — the keeper never connects to a port this launch did not write.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const A = require('../browser-attach.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The first executable of A.CHROME_NAMES on `env.PATH` (the keeper's base env — never process.env) | null. */
function chromeExecutable(env) {
  const dirs = String((env && env.PATH) || '').split(':').filter((d) => d.startsWith('/'));
  for (const n of A.CHROME_NAMES) {
    for (const d of dirs) {
      const f = path.join(d, n);
      try { fs.accessSync(f, fs.constants.X_OK); if (fs.statSync(f).isFile()) return f; } catch { /* the next */ }
    }
  }
  return null;
}
/** One directory a socket may live in: made 0700 when absent; refused when it is a symlink, not a directory, or another
 *  uid's (lstat BEFORE any mkdir / chmod — a chmod would follow a planted link). → `{ok}` | `{ok:false, why}`. */
function ownedDir(dir) {
  let st = null;
  try { st = fs.lstatSync(dir); } catch (e) { if (e.code !== 'ENOENT') return { ok: false, why: `cannot stat it: ${e.message}` }; }
  if (!st) {
    try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') return { ok: false, why: `mkdir failed: ${e.message}` }; }
    try { st = fs.lstatSync(dir); } catch (e) { return { ok: false, why: `vanished after mkdir: ${e.message}` }; }
  }
  if (st.isSymbolicLink()) return { ok: false, why: 'it is a SYMLINK, not a directory' };
  if (!st.isDirectory()) return { ok: false, why: 'it exists and is not a directory' };
  const me = typeof process.getuid === 'function' ? process.getuid() : null;
  if (me !== null && st.uid !== me) return { ok: false, why: `it is owned by uid ${st.uid}, not this user (${me})` };
  if ((st.mode & 0o777) !== 0o700) { try { fs.chmodSync(dir, 0o700); } catch (e) { return { ok: false, why: `cannot make it 0700: ${e.message}` }; } }
  return { ok: true };
}
/** A config's socket dir (A.attachSocketDir's answer) made and verified, the per-uid root first. */
function ensureSocketDir(sd) {
  if (!sd || !sd.dir) return { ok: false, code: 'socket_dir_unavailable', error: 'no socket directory could be named for this profile' };
  if (!sd.fits) return { ok: false, code: 'socket_dir_unavailable', error: `the socket directory ${sd.dir} makes a socket path of ${sd.bytes} bytes (the limit is ${A.SOCKET_PATH_MAX})` };
  for (const d of [sd.parent, sd.dir]) {
    const r = ownedDir(d);
    if (!r.ok) return { ok: false, code: 'socket_dir_unavailable', error: `the browser's socket directory ${d} cannot be used: ${r.why}` };
  }
  return { ok: true, dir: sd.dir };
}
/** The port file as it is NOW → `{text, mtimeMs}` (both null when it is absent or unreadable). */
function readPortFile(file) {
  try { const st = fs.statSync(file); return { text: fs.readFileSync(file, 'utf8'), mtimeMs: st.mtimeMs }; } catch { return { text: null, mtimeMs: null }; }
}
/** SIGTERM, a grace, then SIGKILL — the child THIS launch spawned (its handle is ours: no recycled-pid question). */
async function endChild(child, { termMs = 1500 } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill('SIGTERM'); } catch { /* gone */ }
  for (let i = 0; i < termMs / 50 && child.exitCode === null && child.signalCode === null; i++) await sleep(50);
  if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch { /* gone */ } }
}
/**
 * SPAWN Chrome for the attach road and read its port. `argv` = A.attachArgv's; `env` = the keeper's base env + the display
 * session's DISPLAY / XAUTHORITY (the caller composes it); `logFile` = where its stdout + stderr go (truncated per launch).
 * → `{ok: true, pid, port, wsPath, ms, child}` | `{ok: false, code, error}` (`cdp_port_missing` / `launch_failed`).
 */
async function spawnChrome({ exe, argv, env, profileDir, logFile, waitMs = A.PORT_WAIT_MS, stepMs = A.PORT_STEP_MS, now = Date.now } = {}) {
  const portFile = path.join(String(profileDir), A.PORT_FILE);
  try { fs.rmSync(portFile, { force: true }); } catch (e) { return { ok: false, code: 'launch_failed', error: `the stale ${A.PORT_FILE} in ${profileDir} could not be removed (${e.message}) — never connected to` }; }
  let fd = null;
  try { fs.mkdirSync(path.dirname(logFile), { recursive: true, mode: 0o700 }); fd = fs.openSync(logFile, 'w', 0o600); } catch { fd = null; }
  const spawnedAt = now();
  let child = null, exited = null;
  try { child = spawn(exe, argv, { env, cwd: String(profileDir), detached: true, stdio: ['ignore', fd === null ? 'ignore' : fd, fd === null ? 'ignore' : fd] }); }
  catch (e) { if (fd !== null) { try { fs.closeSync(fd); } catch { /* closed */ } } return { ok: false, code: 'launch_failed', error: `Chrome could not be started (${exe}): ${e.message}` }; }
  if (fd !== null) { try { fs.closeSync(fd); } catch { /* the child keeps its copy */ } }
  child.once('error', (e) => { exited = exited || `could not run ${exe}: ${e.message}`; });
  child.once('exit', (code, signal) => { exited = exited || (signal ? `ended by ${signal}` : `exit code ${code}`); });
  child.unref();
  let last = { state: 'missing' };
  while (now() - spawnedAt <= waitMs) {
    last = A.portFileVerdict({ ...readPortFile(portFile), spawnedAt });
    if (last.state === 'new') return { ok: true, pid: child.pid, port: last.port, wsPath: last.wsPath, ms: now() - spawnedAt, child };
    if (exited) break;
    await sleep(stepMs);
  }
  const early = exited; // it ended by itself before the deadline (the SIGTERM below is ours, never its verdict)
  await endChild(child);
  if (early) {
    let tail = '';
    try { tail = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-3).join(' | ').slice(0, 300); } catch { tail = ''; }
    return { ok: false, code: 'launch_failed', error: `Chrome exited before it wrote ${A.PORT_FILE} (${early})${tail ? ` — it said: ${tail}` : ''}` };
  }
  return { ok: false, ...A.portMissing({ waitedMs: waitMs, stale: last.state === 'stale' }) };
}

module.exports = { chromeExecutable, ensureSocketDir, ownedDir, readPortFile, spawnChrome };
