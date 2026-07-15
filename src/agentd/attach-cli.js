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
