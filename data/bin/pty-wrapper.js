#!/usr/bin/env node
// PTY wrapper — runs inside dtach, spawns claude with a PTY, tees output to a buffer file.
// Survives server restarts (dtach keeps this process alive).
// Usage: node pty-wrapper.js <buffer-file> <meta-file> <command> [args...]

const fs = require('fs');
const path = require('path');

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
let retries = 0;

// Spawn child with PTY
let child;
function spawnChild() {
  child = pty.spawn(cmd, args, {
    name: process.env.TERM || 'xterm-256color',
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 30,
    cwd: process.cwd(),
    env: process.env,
  });
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
  retries = 0; // real output = the link works — reset the backoff ladder
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
function onChildExit({ exitCode }) {
  log(`Child exited with code ${exitCode}`);
  if (REMOTE_RETRY && exitCode !== 0 && retries < 120) {
    retries++;
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
  try { fs.unlinkSync(metaFile); } catch {}
  process.exit(exitCode);
}

process.on('uncaughtException', (err) => { log(`Uncaught: ${err.message}\n${err.stack}`); });
