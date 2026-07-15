// vibespace-agentd-attach — the LOCAL-side session bridge (CS refactor M2
// wiring). Drop-in replacement for `vibespace-remote-keeper run` with the SAME
// contract, so chat-wrapper's remote machinery works unchanged:
//   • stdout carries ONLY raw session bytes (the wrapper counts them for the
//     next offset); diagnostics go to stderr.
//   • own stdin → the session's stdin.
//   • the {type:'_remote_exit'} sentinel rides the byte stream (the daemon's
//     pipe-session appends it to the buffer).
//   • exits non-zero on transport death → the wrapper reconnects with a fresh
//     byte offset (substituted into __VS_OFFSET__ by chat-wrapper).
// Difference from the keeper: this process runs LOCALLY and reaches the
// STANDING remote agentd over its own ssh stdio bridge — the daemon owns the
// session (persistent pipe session), this bridge is disposable.
//
// Usage (assembled by ws-handler, spawned by chat-wrapper as its child):
//   node vibespace-agentd-attach.js --config <json-file> --offset <n>
// The 0600 config file carries { sshBin, sshArgs, remoteCmd, hostToken, sid,
// spawn?: {cmd, args, cwd, env} } — nothing secret in argv (2.126.0 law).
'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { Mux, PROTO_VERSION } = require('./mux.js');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
const configPath = arg('--config');
const offset = Math.max(0, Number(arg('--offset')) || 0);
if (!configPath) { process.stderr.write('agentd-attach: --config <file> required\n'); process.exit(2); }
let cfg;
try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) { process.stderr.write('agentd-attach: bad config: ' + e.message + '\n'); process.exit(2); }
const log = (m) => { try { process.stderr.write('[agentd-attach] ' + m + '\n'); } catch { } };

// ── transport: ssh stdio bridge to the standing remote daemon, OR a loopback
// TCP bridge for DIAL devices (graduation B.2: the dialed-in ws link lives
// inside the SERVER process — this disposable attach can't reach it directly,
// so the server exposes a per-device mux PROXY on 127.0.0.1 and we speak the
// exact same protocol to it). cfg.tcp = { port } selects this mode. ──
let stream, onTransportReady;
if (cfg.tcp && cfg.tcp.port) {
  const net = require('net');
  const sock = net.connect(Number(cfg.tcp.port), '127.0.0.1');
  sock.on('error', (e) => { log('bridge connect failed: ' + e.message); process.exit(5); });
  stream = {
    write: (d) => { try { return sock.write(d); } catch { return false; } },
    on: (ev, fn) => {
      if (ev === 'data') sock.on('data', fn);
      else if (ev === 'close') sock.on('close', fn);
      else if (ev === 'error') sock.on('error', fn);
    },
    destroy: () => { try { sock.destroy(); } catch { } },
  };
  onTransportReady = (fn) => sock.on('connect', fn);
} else {
  const child = spawn(cfg.sshBin || 'ssh', [...(cfg.sshArgs || []), '--', cfg.remoteCmd], {
    stdio: ['pipe', 'pipe', 'inherit'], // ssh stderr → our stderr (diagnostics only)
  });
  child.on('error', (e) => { log('transport spawn failed: ' + e.message); process.exit(5); });
  stream = {
    write: (d) => { try { return child.stdin.write(d); } catch { return false; } },
    on: (ev, fn) => {
      if (ev === 'data') child.stdout.on('data', fn);
      else if (ev === 'close') { child.on('close', fn); child.stdout.on('close', fn); }
      else if (ev === 'error') child.on('error', fn);
    },
    destroy: () => { try { child.kill(); } catch { } },
  };
  onTransportReady = (fn) => child.on('spawn', fn);
}

const CHAN = 2;
let opened = false;
let exiting = false;
let tail = Buffer.alloc(0); // sentinel scan window

// ── PTY / TERMINAL mode (B-0d70 terminal-on-dial): cfg.pty = {cmd, args, cwd,
// env, cols, rows} opens a device-side node-pty via `open-session` instead of
// a buffered pipe session. This runs UNDER pty-wrapper (dtach → pty-wrapper →
// this) — mirroring `ssh -t`: we make OUR controlling tty raw (so claude's TUI
// bytes pass through unmangled, both directions) and forward SIGWINCH resize.
// A pty stream is LIVE (no byte offset / replay) — pty-wrapper's REMOTE_RETRY
// respawns us on transport death (fresh session). ──
if (cfg.pty) {
  // full-raw the controlling tty (OPOST off too — setRawMode is input-only).
  try { require('child_process').execFileSync('stty', ['raw', '-echo'], { stdio: ['inherit', 'inherit', 'ignore'] }); } catch { }
  try { if (process.stdin.isTTY) process.stdin.setRawMode(true); } catch { }
  const size = () => ({ cols: process.stdout.columns || cfg.pty.cols || 120, rows: process.stdout.rows || cfg.pty.rows || 30 });
  const mux = new Mux(stream, {
    onControl(msg) {
      if (msg.op === 'hello-ack') {
        const s = size();
        mux.control({ op: 'open-session', chan: CHAN, cmd: cfg.pty.cmd, args: cfg.pty.args, cwd: cfg.pty.cwd, env: cfg.pty.env, cols: s.cols, rows: s.rows });
        return;
      }
      if (msg.op === 'session-open') { opened = true; log(`pty session open pid=${msg.pid}`); return; }
      // A device-session END (clean OR crash) means the terminal is OVER —
      // exit 0 so pty-wrapper FINALIZES instead of respawning. pty-wrapper's
      // REMOTE_RETRY respawns on ANY nonzero exit, which turned a claude that
      // exited (missing binary → sh 127, user `exit 1`, crash) into a 120×
      // reconnect loop that never showed the real cause (review finding).
      // Only a TRANSPORT death (onDead) exits nonzero → a real reconnect.
      if (msg.op === 'session-exit') { log('pty session exit code=' + msg.code); process.exit(0); }
      // Permanent failures likewise must NOT loop — print once, exit 0. The
      // message must FLUSH before exit (a pipe write + immediate exit can
      // truncate), so print then exit on the write callback.
      const bail = (text, logMsg) => { log(logMsg); try { process.stdout.write('\r\n[vibespace] ' + text + '\r\n', () => process.exit(0)); } catch { process.exit(0); } setTimeout(() => process.exit(0), 200); };
      if (msg.op === 'auth-fail') { return bail('device auth failed (re-pair the device).', 'auth failed — host token mismatch'); }
      if (msg.op === 'proto-mismatch') { return bail('device/server version mismatch — update the device daemon.', 'protocol mismatch'); }
      if (msg.op === 'session-error') { return bail(msg.error || 'session error', 'session error: ' + msg.error); }
    },
    onData(chan, buf) { if (chan !== CHAN) return; process.stdout.write(buf); mux.credit(chan, buf.length); },
    onDead(reason) { log('transport dead: ' + reason); process.exit(opened ? 1 : 5); },
  });
  onTransportReady(() => mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: cfg.hostToken, serverVersion: cfg.version || '0' }));
  process.stdin.on('data', (d) => { try { mux.data(CHAN, d); } catch { } });
  process.stdin.resume();
  // DEFER the size read: on SIGWINCH, Node's OWN listener refreshes
  // process.stdout.columns/rows — reading them synchronously in our handler
  // races that refresh and forwards the STALE size (verified: pty-wrapper
  // resized to 100×40 but a sync read still saw 120×30). setImmediate runs
  // after Node's refresh, so we forward the true new size to the device pty.
  process.on('SIGWINCH', () => setImmediate(() => { const s = size(); try { mux.control({ op: 'resize-session', chan: CHAN, cols: s.cols, rows: s.rows }); } catch { } }));
} else {
  const mux = new Mux(stream, {
    onControl(msg) {
      if (msg.op === 'hello-ack') {
        const spawnSpec = cfg.spawn || null;
        mux.control(spawnSpec
          ? { op: 'open-pipe-session', chan: CHAN, sid: cfg.sid, cmd: spawnSpec.cmd, args: spawnSpec.args, cwd: spawnSpec.cwd, env: spawnSpec.env, offset }
          : { op: 'attach-pipe-session', chan: CHAN, sid: cfg.sid, offset });
        return;
      }
      if (msg.op === 'pipe-session-open') { opened = true; log(`attached sid=${cfg.sid} pid=${msg.pid} existing=${!!msg.existing} offset=${offset}`); return; }
      if (msg.op === 'auth-fail') { log('auth failed — host token mismatch'); process.exit(4); }
      if (msg.op === 'proto-mismatch') { log('protocol mismatch'); process.exit(4); }
      if (msg.op === 'session-error') { log('session error: ' + msg.error); process.exit(6); }
    },
    onData(chan, buf) {
      if (chan !== CHAN) return;
      process.stdout.write(buf); // RAW bytes only — the wrapper's offset contract
      mux.credit(chan, buf.length);
      // keeper exit semantics: after forwarding the _remote_exit sentinel, exit 3
      // (drain done) — the wrapper finalizes on child-exit + remoteExited set.
      // Rolling tail scan only; the passthrough above is untouched.
      tail = Buffer.concat([tail, buf]).subarray(-4096);
      if (!exiting && tail.includes('"_remote_exit"')) {
        exiting = true;
        log('exit sentinel seen — draining');
        setTimeout(() => process.exit(3), 300);
      }
    },
    onDead(reason) {
      log('transport dead: ' + reason);
      process.exit(opened ? 3 : 5); // wrapper reconnects with a fresh offset
    },
  });
  onTransportReady(() => {
    mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: cfg.hostToken, serverVersion: cfg.version || '0' });
  });

  process.stdin.on('data', (d) => { try { mux.data(CHAN, d); } catch { } });
  process.stdin.on('end', () => { /* dtach/pipe closed — keep relaying until killed */ });
  process.stdin.resume();
}
