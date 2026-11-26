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
// The 0600 config file carries { sshBin, sshArgs, remoteCmd, sid, hub: {port},
// spawn?: {cmd, args, cwd, env} } — nothing secret in argv (2.126.0 law), and
// since lane vault-e2e-password-fix-r2 NO TOKEN in the file either: the device
// link token is asked of the hub at every (re)start (askLinkToken below).
'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { Mux, PROTO_VERSION } = require('./mux.js');
const AR = require('./attach-roads.js'); // B-beaf: both roads under the link's credit (the device credited for what stdout took; stdin paused on a held link)

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

// ── THE LINK TOKEN (lane vault-e2e-password-fix-r2, design q-042 D1) — THE ONE ROAD: the config carries NO token (not in the
// file, the argv or the env). The hub hands it over loopback to THIS session's attach — its own session token
// (VIBESPACE_SESSION_TOKEN, already in this process's env) proves which session asks — and it lives in this process's
// memory only. A LOCKED vault answers 423 `vault_locked`: said on stderr (the wrapper's reconnect line shows it) and exit 7
// — the wrapper retries, and the session reattaches once a person unlocks. ──
function askLinkToken() {
  return new Promise((resolve) => {
    const port = Number((cfg.hub && cfg.hub.port) || process.env.CLAUDE_WEBUI_PORT) || 0;
    const session = String(process.env.VIBESPACE_SESSION_TOKEN || '');
    if (!port || !session) return resolve({ ok: false, code: 'no-hub', why: 'this process holds no hub port or session token — it cannot ask for the link token' });
    const req = require('http').get({ host: '127.0.0.1', port, path: '/api/agent/vault/link-token', headers: { Authorization: 'Bearer ' + session }, timeout: 15000 }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { if (b.length < 65536) b += d; });
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch { }
        if (res.statusCode === 200 && j && typeof j.token === 'string' && j.token) resolve({ ok: true, token: j.token, hubPub: typeof j.hubPub === 'string' ? j.hubPub : null });
        else resolve({ ok: false, code: (j && j.code) || `http-${res.statusCode}`, why: (j && j.error) || `the hub answered ${res.statusCode}` });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (e) => resolve({ ok: false, code: 'hub-unreachable', why: e.message }));
  });
}
askLinkToken().then((r) => {
  // 7 = THE VAULT WAIT (data/bin/pty-wrapper.js never counts it toward its cap; the chat-wrapper retries every 30 s anyway)
  // B-f276 (r4721's round): a link token HELD unread (the hub reads its file again by itself) waits as the locked vault does
  if (!r.ok) { log(`no link token (${r.code}): ${r.why}`); process.exit(r.code === 'vault_locked' || r.code === 'link_token_unread' ? 7 : 5); }
  main(r.token, r.hubPub);
});

function main(hostToken, hubPub = null) {
// lane lg-remote-hardening (B-7f0b — design q-042 D3 half b): THIS child holds no hub key. Its hello names the hub's PUBLIC key
// (the link-token door's answer) with a fresh nonce; a device that pins this hub answers with its own nonce, and the hub's
// SIGNING DOOR (POST /api/agent/vault/link-sign, this child's session token) signs THE ONE SHAPE over that device's key and
// nonce — the `ok` carrying it goes before any op. A device too old to ask (no nonceD) is never asked for anything.
const MA = require('../mutual-auth.js');
const nonceH = MA.newNonce({ crypto: require('crypto') });
const helloOf = () => ({ op: 'hello', protoVersion: PROTO_VERSION, hostToken, serverVersion: cfg.version || '0', nonceH, ...(hubPub ? { hubPub } : {}) });
function proveHub(ack) {
  return new Promise((resolve) => {
    if (!hubPub || !MA.isNonce(ack && ack.nonceD)) return resolve({ ok: true });
    const port = Number((cfg.hub && cfg.hub.port) || process.env.CLAUDE_WEBUI_PORT) || 0;
    const session = String(process.env.VIBESPACE_SESSION_TOKEN || '');
    const body = JSON.stringify({ devPub: ack.devPub, nonceD: ack.nonceD });
    const req = require('http').request({ host: '127.0.0.1', port, method: 'POST', path: '/api/agent/vault/link-sign', headers: { Authorization: 'Bearer ' + session, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 15000 }, (res) => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', (d) => { if (b.length < 65536) b += d; });
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { } if (res.statusCode === 200 && j && typeof j.sigH === 'string') resolve({ ok: true, sigH: j.sigH }); else resolve({ ok: false, code: (j && j.code) || `http-${res.statusCode}`, why: (j && j.error) || `the hub answered ${res.statusCode}` }); });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (e) => resolve({ ok: false, code: 'hub-unreachable', why: e.message }));
    req.end(body);
  });
}
const afterProof = (mux, ack, go) => proveHub(ack).then((p) => {
  if (!p.ok && p.code === 'vault_locked') { log(`the hub's signature waits for the vault (${p.code}): ${p.why}`); process.exit(7); } // the reader: the link-token branch's wait
  if (!p.ok && p.code === 'not_this_machine') { log(`the hub has not learned this device's key yet — waiting for its own link to the machine (${p.code})`); process.exit(4); } // retried by the wrapper
  if (!p.ok) { log(`the hub's signature for this device was refused (${p.code}): ${p.why}`); process.exit(4); }
  if (p.sigH) mux.control({ op: 'ok', sigH: p.sigH });
  go();
});

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
  let roads = null;
  const mux = new Mux(stream, {
    onControl(msg) {
      if (msg.op === 'hello-ack') {
        afterProof(mux, msg, () => { const s = size(); mux.control({ op: 'open-session', chan: CHAN, cmd: cfg.pty.cmd, args: cfg.pty.args, cwd: cfg.pty.cwd, env: cfg.pty.env, cols: s.cols, rows: s.rows }); });
        return;
      }
      if (msg.op === 'session-open') {
        opened = true; log(`pty session open pid=${msg.pid}`);
        // HONEST RECONNECT MARKER (audit #12): the device pty is LIVE — the
        // dropped link KILLED the previous CLI (daemon onDead), and this
        // respawned attach (pty-wrapper REMOTE_RETRY sets the env) just opened
        // a brand-new one under the old window title. Say so — the transcript
        // survives on the device, so the old conversation stays resumable.
        if (process.env.VIBESPACE_REMOTE_ATTEMPT) {
          try { process.stdout.write('\r\n\x1b[33m[vibespace] reconnected — the previous CLI on the device ended with the dropped link; this is a NEW session (resume the old conversation from the sidebar).\x1b[0m\r\n'); } catch { }
        }
        return;
      }
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
    onData(chan, buf) { if (chan !== CHAN) return; roads.out(buf); },   // B-beaf: credited when the terminal took it
    onWritable(chan) { if (roads) roads.writable(chan); },              // B-beaf: the link took the queued input — read stdin again
    onDead(reason) { log('transport dead: ' + reason); process.exit(opened ? 1 : 5); },
  });
  roads = AR.attachRoads({ mux, chan: CHAN, stdin: process.stdin, stdout: process.stdout });
  onTransportReady(() => mux.control(helloOf()));
  process.stdin.on('data', (d) => { roads.in(d); });   // B-beaf: a held link pauses stdin (it never queues here without bound)
  process.stdin.resume();
  // DEFER the size read: on SIGWINCH, Node's OWN listener refreshes
  // process.stdout.columns/rows — reading them synchronously in our handler
  // races that refresh and forwards the STALE size (verified: pty-wrapper
  // resized to 100×40 but a sync read still saw 120×30). setImmediate runs
  // after Node's refresh, so we forward the true new size to the device pty.
  process.on('SIGWINCH', () => setImmediate(() => { const s = size(); try { mux.control({ op: 'resize-session', chan: CHAN, cols: s.cols, rows: s.rows }); } catch { } }));
} else {
  let roads = null;
  const mux = new Mux(stream, {
    onControl(msg) {
      if (msg.op === 'hello-ack') {
        const spawnSpec = cfg.spawn || null;
        afterProof(mux, msg, () => mux.control(spawnSpec
          ? { op: 'open-pipe-session', chan: CHAN, sid: cfg.sid, cmd: spawnSpec.cmd, args: spawnSpec.args, cwd: spawnSpec.cwd, env: spawnSpec.env, offset }
          : { op: 'attach-pipe-session', chan: CHAN, sid: cfg.sid, offset }));
        return;
      }
      if (msg.op === 'pipe-session-open') { opened = true; log(`attached sid=${cfg.sid} pid=${msg.pid} existing=${!!msg.existing} offset=${offset}`); return; }
      if (msg.op === 'auth-fail') { log(msg.code ? `refused by the device (${msg.code}): ${String(msg.error || '').slice(0, 200)}` : 'auth failed — host token mismatch'); process.exit(4); }
      if (msg.op === 'proto-mismatch') { log('protocol mismatch'); process.exit(4); }
      if (msg.op === 'session-error') { log('session error: ' + msg.error); process.exit(6); }
    },
    onData(chan, buf) {
      if (chan !== CHAN) return;
      roads.out(buf); // RAW bytes only — the wrapper's offset contract; B-beaf: the device credited when stdout took them
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
    onWritable(chan) { if (roads) roads.writable(chan); },   // B-beaf: the link took the queued input — read stdin again
    onDead(reason) {
      log('transport dead: ' + reason);
      process.exit(opened ? 3 : 5); // wrapper reconnects with a fresh offset
    },
  });
  roads = AR.attachRoads({ mux, chan: CHAN, stdin: process.stdin, stdout: process.stdout });
  onTransportReady(() => {
    mux.control(helloOf());
  });

  process.stdin.on('data', (d) => { roads.in(d); });   // B-beaf: a held link pauses stdin
  process.stdin.on('end', () => { /* dtach/pipe closed — keep relaying until killed */ });
  process.stdin.resume();
}
}
