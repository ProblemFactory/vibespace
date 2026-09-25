#!/usr/bin/env node
// PTY wrapper — runs inside dtach, spawns claude with a PTY, tees output to a buffer file.
// Survives server restarts (dtach keeps this process alive).
// Usage: node pty-wrapper.js <buffer-file> <meta-file> <command> [args...]

const fs = require('fs');
const path = require('path');
const os = require('os');

// Debug log to file (since stdout goes to dtach PTY, errors are invisible)
const logFile = path.join(path.dirname(process.argv[2] || '/tmp/pty-wrapper'), 'pty-wrapper.log');
// Rotate at 5MB (shared by all sessions' wrappers, grew without bound)
function log(msg) {
  try {
    try { if (fs.statSync(logFile).size > 5242880) fs.renameSync(logFile, logFile + '.old'); } catch {}
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

let pty;
try {
  pty = require(path.join(__dirname, '../../node_modules/node-pty'));
} catch (err) {
  log(`Failed to load node-pty: ${err.message}`);
  process.exit(1);
}

const bufferFile = process.argv[2];
const metaFile = process.argv[3];
const cmd = process.argv[4];
const args = process.argv.slice(5);

log(`Starting: cmd=${cmd} args=${JSON.stringify(args.slice(0, 3))}... cwd=${process.cwd()}`);

if (!bufferFile || !cmd) {
  log('Missing arguments');
  process.exit(1);
}

// Write initial metadata
try { fs.mkdirSync(path.dirname(metaFile), { recursive: true }); } catch {}
const meta = { pid: process.pid, startedAt: Date.now() };
try { fs.writeFileSync(metaFile, JSON.stringify(meta)); } catch (e) { log(`meta write failed: ${e.message}`); }

// REMOTE RETRY (2.124.0, env VIBESPACE_REMOTE_RETRY set by the server for
// remote TERMINAL sessions): the child is `ssh -t … dtach -A /tmp/vs-<id>` —
// the remote dtach already keeps the CLI alive across drops, but an ssh death
// used to kill THIS pipeline and flip the session to exited. Now we respawn
// the same ssh command with backoff (the remote dtach -A reattaches) until a
// CLEAN exit (code 0 = the user actually ended the remote session).
const REMOTE_RETRY = !!process.env.VIBESPACE_REMOTE_RETRY;
let retries = 0;       // delay-ladder index — reset only when a child LIVED (see onChildExit)
let totalAttempts = 0; // monotonic cap: ssh's own stderr ("Connection refused") arrives as pty DATA,
                       // and resetting the ladder on any bytes made a dead host retry every 1s forever (B-b87b)
let spawnedAt = 0;

// Spawn child with PTY
let child;
let childDead = true;
let childExit = null;  // {code, signal} of the LAST child exit (the wrapper-signal record says what it knew)
function spawnChild() {
  spawnedAt = Date.now();
  child = pty.spawn(cmd, args, {
    name: process.env.TERM || 'xterm-256color',
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 30,
    cwd: process.cwd(),
    env: process.env,
  });
  childDead = false;
  log(`Spawned child PID=${child.pid}${REMOTE_RETRY ? ` retry=${retries}` : ''}`);
  // Update metadata with child PID — server reads this for direct PID matching
  meta.childPid = child.pid;
  try { fs.writeFileSync(metaFile, JSON.stringify(meta)); } catch {}
  child.onData(onChildData);
  child.onExit(onChildExit);
}
try {
  spawnChild();
} catch (err) {
  log(`Failed to spawn: ${err.message}\ncmd=${cmd}\nargs=${JSON.stringify(args)}`);
  process.exit(1);
}

// Buffer management
let buffer = '';
const MAX_BUFFER = 50000;
let writeTimer = null;

function persistBuffer() {
  writeTimer = null;
  try { fs.writeFileSync(bufferFile, buffer); } catch {}
}

// Child output → stdout (dtach PTY) + buffer file
function onChildData(data) {
  // NOTE: deliberately no ladder reset here — the child is ssh, whose own
  // stderr diagnostics are pty data; the reset lives in onChildExit, gated on
  // the child having LIVED (uptime), which bytes can't fake.
  try { process.stdout.write(data); } catch {}
  buffer = (buffer + data).slice(-MAX_BUFFER);
  if (!writeTimer) writeTimer = setTimeout(persistBuffer, 2000);
}

// stdin (dtach PTY) → child
try {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (data) => { try { child.write(data); } catch {} });
} catch (err) {
  log(`stdin setup failed: ${err.message}`);
}

// Propagate SIGWINCH to child PTY
process.on('SIGWINCH', () => {
  try { child.resize(process.stdout.columns || 120, process.stdout.rows || 30); } catch {}
});

// Child exit → persist final buffer and exit. Remote terminals with a
// NON-zero exit (ssh dropped / network died) respawn instead — the remote
// dtach -A reattaches the surviving CLI. Clean exit 0 = the session really
// ended (user exited the shell/CLI remotely).
// node-pty's onExit carries {exitCode, signal}: a signal death is exitCode 0
// + signal N (a NUMBER, 0 = none) — reading only exitCode made a killed CLI
// look like a clean exit (B-3052). The name is what the meta records.
function signalName(n) {
  if (!n) return null;
  if (typeof n === 'string') return n;
  for (const [name, no] of Object.entries(os.constants.signals)) if (no === n) return name;
  return 'SIG' + n;
}
function onChildExit({ exitCode, signal }) {
  const sigName = signalName(signal);
  childDead = true;
  childExit = { code: exitCode ?? null, signal: sigName };
  log(`Child exited with code ${exitCode} signal ${sigName}`);
  if (REMOTE_RETRY && exitCode !== 0 && totalAttempts < 120) {
    // a child that survived a while = the link genuinely worked — restart the
    // DELAY ladder (but never the monotonic attempt cap)
    if (Date.now() - spawnedAt > 30000) retries = 0;
    retries++; totalAttempts++;
    // Mark the respawned child as a RECONNECT: a dial-terminal's device pty is
    // LIVE (killed with the link — not the dtach reattach shape), so the
    // respawn opens a brand-new CLI; attach-cli reads this to print an honest
    // new-session marker instead of silently impersonating a continuation.
    process.env.VIBESPACE_REMOTE_ATTEMPT = String(retries);
    const delay = [1000, 2000, 5000, 10000, 30000][Math.min(4, retries - 1)];
    try { process.stdout.write(`\r\n\x1b[33m[vibespace] connection lost — reconnecting in ${Math.round(delay / 1000)}s (attempt ${retries})…\x1b[0m\r\n`); } catch {}
    setTimeout(() => {
      try { spawnChild(); } catch (err) {
        log(`respawn failed: ${err.message}`);
        setTimeout(() => onChildExit({ exitCode: 255 }), 1000);
      }
    }, delay);
    return;
  }
  if (writeTimer) { clearTimeout(writeTimer); persistBuffer(); }
  // Post-mortem breadcrumb (2.207.0): keep the final meta WITH the child's
  // exit code — the server reads it at teardown (lifecycle log/telemetry)
  // and unlinks it itself. Unlinking here left crash exits evidence-free.
  try {
    const m = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    m.childExitCode = exitCode ?? null;
    m.childExitSignal = sigName;   // B-3052: which signal ended the child (null = it exited by itself)
    fs.writeFileSync(metaFile, JSON.stringify(m));
  } catch {}
  process.exit(exitCode);
}

// WRAPPER SIGNAL RECORD (B-3052) — the chat-wrapper.js twin: a wrapper killed
// by SIGTERM/SIGHUP/SIGINT used to die by the default action with no log line
// and no exit record. The handler RECORDS and still dies: synchronous writes
// only (no awaits/timers/streams), the child handed nothing (no forwarding, no
// new kill — the pty child still gets the kernel's SIGHUP when this process's
// pty master closes, exactly as under the default action), exit status
// 128+signo (what a shell reports for the signal death). SIGKILL is
// uncatchable — the server line says wrapper=unfinalized then.
// THE RECORD NEVER CREATES A FILE (B-3052 r2, see chat-wrapper.js): the kill
// path unlinks <id>.json/<id>.buf in the tick it SIGTERMs the dtach master and
// this handler runs a few ms later on the pty hangup — so the meta is written
// only into a file that still exists ('r+'), a pending buffer only into an
// existing .buf or while the meta still exists.
// r4: a META is overwritten in ONE write at offset 0, padded with spaces to the
// old length (JSON.parse ignores trailing whitespace) and never truncated — a
// reader never sees the empty or half-written file an ftruncate-then-write
// left readable between two syscalls (measured torn on the FUSE workspace).
// A buffer (`pad` off) may legitimately shrink and keeps the truncating form.
function overwriteIfPresent(file, data, { pad = false } = {}) {
  let fd;
  try { fd = fs.openSync(file, 'r+'); } catch { return false; }
  try {
    let b = Buffer.from(data);
    if (pad) {
      const old = fs.fstatSync(fd).size;
      if (b.length < old) b = Buffer.concat([b, Buffer.alloc(old - b.length, 0x20)]);
    } else fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, b, 0, b.length, 0);
  } finally { try { fs.closeSync(fd); } catch {} }
  return true;
}
const WRAPPER_SIGNO = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
function onWrapperSignal(sig) {
  try {
    // THE RECORD FIRST (r4): the meta is written before the buffer flush and
    // before the log line — the server's teardown is racing this handler (the
    // dtach master's death EOFs its attach client and SIGHUPs us at once), and
    // on the FUSE workspace a log append alone is ~3.5 ms, an 800 KB buffer
    // flush up to ~200 ms. The record lands first, everything else after.
    let m = meta;
    try { m = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {}
    m.wrapperSignal = sig;
    m.wrapperSignalAt = Date.now();
    if (childDead && childExit) {
      if (m.childExitCode === undefined) m.childExitCode = childExit.code;
      if (m.childExitSignal === undefined) m.childExitSignal = childExit.signal;
    }
    const recorded = overwriteIfPresent(metaFile, JSON.stringify(m), { pad: true });
    if (writeTimer) {
      clearTimeout(writeTimer); writeTimer = null;
      if (!overwriteIfPresent(bufferFile, buffer) && fs.existsSync(metaFile)) persistBuffer();
    }
    log(`wrapper received ${sig} (child pid ${child ? child.pid : null}, childDead=${childDead})`);
    if (!recorded) log(`wrapper record skipped: ${path.basename(metaFile)} is gone (the server tore the session down first)`);
  } catch {}
  process.exit(128 + WRAPPER_SIGNO[sig]);
}
for (const sig of Object.keys(WRAPPER_SIGNO)) process.on(sig, () => onWrapperSignal(sig));

process.on('uncaughtException', (err) => { log(`Uncaught: ${err.message}\n${err.stack}`); });
