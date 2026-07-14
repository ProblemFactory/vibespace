// vibespace-agentd — the per-device machine agent (CS refactor M0 skeleton,
// docs/design-remote-cs.md). M0 scope: lifecycle only — flock singleton,
// setsid detach, 0700 unix socket, multi-connection accept, hello/auth
// (vsht_ token, sha-compared against the state file), heartbeat, and
// server-initiated SELF-UPGRADE (bundle streamed on chan 1 → versioned dir →
// atomic `current` repoint → re-exec). NO session/fs/discovery code lives
// here yet (invariant #2: the daemon ships bytes and runs mechanical
// primitives; #1/#7: nothing this process does may ever kill a session).
// Built as a ZERO-DEPENDENCY single-file bundle (npm run build:agentd).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { Mux, PROTO_VERSION } = require('./mux.js');

const VERSION = process.env.VIBESPACE_AGENTD_VERSION || require('./version.js').VERSION;
const ROOT = process.env.VIBESPACE_AGENTD_ROOT || path.join(os.homedir(), '.vibespace', 'agentd');
const STATE = path.join(ROOT, 'state');
const SOCK = path.join(STATE, 'agentd.sock');
const LOCK = path.join(STATE, 'agentd.lock');
const LOG = path.join(STATE, 'agentd.log');
const TOKEN_FILE = path.join(STATE, 'token');

fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });

// ── STDIO BRIDGE (M2): `agentd.js --stdio` reaches the STANDING daemon over
// ssh — ensure the daemon runs (setsid-detached, so it PERSISTS after this
// bridge / the ssh pipe dies), then pipe our stdin/stdout ↔ its unix socket.
// The server dials remote via `ssh host -- node <agentd> --stdio`; an ssh drop
// kills only this bridge, the daemon + its sessions survive (the keeper's
// persistence, now in the daemon architecture). ──
if (process.argv.includes('--stdio')) {
  const netB = require('net');
  const cpB = require('child_process');
  const connect = (tries = 0) => {
    const c = netB.connect(SOCK);
    c.on('connect', () => {
      process.stdin.pipe(c);
      c.pipe(process.stdout);
      c.on('close', () => process.exit(0));
      process.stdin.on('end', () => { try { c.end(); } catch {} });
    });
    c.on('error', () => {
      if (tries === 0) {
        // daemon not up — spawn it detached from the CURRENT (M2 stdio-bridge)
        // file, then retry connecting to the socket it will create
        const child = cpB.spawn(process.execPath, [__filename], {
          detached: true, stdio: 'ignore', env: process.env,
        });
        child.unref();
      }
      if (tries > 40) { process.stderr.write('agentd --stdio: daemon unreachable\n'); process.exit(6); }
      setTimeout(() => connect(tries + 1), 250);
    });
  };
  connect();
}

// node-pty is loaded LAZILY (only when a session opens) so M0's zero-dep
// bundle keeps working. On localhost the server passes VIBESPACE_NODE_MODULES
// = the repo's node_modules; M2 (remote) will package prebuilds in the bundle.
let _pty = null;
function pty() {
  if (_pty) return _pty;
  const nm = process.env.VIBESPACE_NODE_MODULES;
  _pty = require(nm ? require('path').join(nm, 'node-pty') : 'node-pty');
  return _pty;
}

function pidCmdline(pid) {
  try { return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf-8').replace(/\0/g, ' '); } catch { return ''; }
}

// ── log (rotated at 5MB ×2) ──
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  try {
    try { if (fs.statSync(LOG).size > 5 * 1024 * 1024) { fs.renameSync(LOG, LOG + '.1'); } } catch { }
    fs.appendFileSync(LOG, line);
  } catch { }
}

// ── flock singleton: O_EXCL pidfile with liveness+identity verification ──
// (no node flock without deps; an exclusive lock file whose pid is verified
// via /proc cmdline is equivalent for our single-user scope)
function acquireSingleton() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(LOCK, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      process.on('exit', () => { try { fs.unlinkSync(LOCK); } catch { } });
      return true;
    } catch {
      try {
        const pid = Number(fs.readFileSync(LOCK, 'utf-8').trim());
        let cmd = '';
        try { cmd = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf-8').replace(/\0/g, ' '); } catch { }
        let alive = false;
        try { process.kill(pid, 0); alive = true; } catch { }
        if (alive && (cmd === '' || cmd.includes('agentd'))) return false; // genuine second instance
        fs.unlinkSync(LOCK); // stale (dead or recycled pid) — retry
      } catch { return false; }
    }
  }
  return false;
}

if (!process.argv.includes('--stdio')) {
if (!acquireSingleton()) {
  process.stderr.write('agentd: already running\n');
  process.exit(3);
}

const tokenSha = (() => {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
    return require('crypto').createHash('sha256').update(raw).digest('hex');
  } catch { return null; }
})();

log(`agentd ${VERSION} starting (proto ${PROTO_VERSION}, pid ${process.pid})`);
fs.writeFileSync(path.join(STATE, 'agentd.pid'), String(process.pid));

// ── upgrade: receive a new bundle on chan 1, land it versioned, re-exec ──
function beginUpgrade(mux, { version, size }) {
  const dir = path.join(ROOT, version);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, 'agentd.js.tmp');
  const fd = fs.openSync(tmp, 'w', 0o700);
  let got = 0;
  log(`upgrade to ${version} (${size} bytes) begins`);
  return {
    data(buf) {
      fs.writeSync(fd, buf);
      got += buf.length;
      mux.credit(1, buf.length);
      if (got >= size) {
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fs.renameSync(tmp, path.join(dir, 'agentd.js'));
        // atomic current repoint: symlink swap via rename
        const curTmp = path.join(ROOT, '.current.tmp');
        try { fs.unlinkSync(curTmp); } catch { }
        fs.symlinkSync(dir, curTmp);
        fs.renameSync(curTmp, path.join(ROOT, 'current'));
        mux.control({ op: 'upgrade-done', version });
        log(`upgrade to ${version} landed — re-exec`);
        // re-exec from the new dir; the singleton lock is released on exit and
        // NOTHING outside our install dir is touched (invariant #1/#7)
        setTimeout(() => {
          const { spawn } = require('child_process');
          try { fs.unlinkSync(LOCK); } catch { }
          try { fs.unlinkSync(SOCK); } catch { }
          const child = spawn(process.execPath, [path.join(dir, 'agentd.js')], {
            detached: true, stdio: 'ignore',
            env: { ...process.env, VIBESPACE_AGENTD_VERSION: version },
          });
          child.unref();
          process.exit(0);
        }, 200);
      }
    },
  };
}

// ── M2 pipe-session registry (keeper semantics inside the daemon) ──
const SESS_DIR = path.join(STATE, 'sessions');
const pipeSessions = {
  _tails: new Map(), // mux → Map(chan → {sid, pos, timer, fd})
  _paths(sid) {
    if (!/^[\w-]+$/.test(sid)) throw new Error('bad sid');
    return {
      out: path.join(SESS_DIR, sid + '.out'),
      fifo: path.join(SESS_DIR, sid + '.in'),
      meta: path.join(SESS_DIR, sid + '.json'),
      err: path.join(SESS_DIR, sid + '.err'),
    };
  },
  _meta(sid) { try { return JSON.parse(fs.readFileSync(this._paths(sid).meta, 'utf-8')); } catch { return null; } },
  _childAlive(m) {
    if (!m || !m.childPid) return false;
    try { process.kill(m.childPid, 0); } catch { return false; }
    const c = pidCmdline(m.childPid);
    const argv0 = path.basename(String((m.cmd && m.cmd[0]) || ''));
    return c === '' ? true : (argv0 ? c.includes(argv0) : false);
  },
  stat(sid) {
    const m = this._meta(sid);
    if (!m) throw new Error('no such pipe session: ' + sid);
    return { pid: m.childPid, exited: m.exited, alive: this._childAlive(m) };
  },
  open({ sid, cmd, args, cwd, env }) {
    fs.mkdirSync(SESS_DIR, { recursive: true, mode: 0o700 });
    const P2 = this._paths(sid);
    const m = this._meta(sid);
    if (m && m.exited === undefined && this._childAlive(m)) return { pid: m.childPid, existing: true };
    if (m && m.exited !== undefined) return { pid: m.childPid, existing: true }; // drain-only: sentinel in buffer
    if (m && !this._childAlive(m)) {
      // crashed without a sentinel — synthesize (never silently respawn: B-0343)
      try { fs.appendFileSync(P2.out, JSON.stringify({ type: '_remote_exit', code: 143, crashed: true }) + '\n'); } catch { }
      fs.writeFileSync(P2.meta, JSON.stringify({ ...m, exited: 143, crashed: true }));
      return { pid: m.childPid, existing: true };
    }
    // fresh spawn: setsid-detached, stdout→file fd, stdin←O_RDWR fifo
    try { fs.unlinkSync(P2.fifo); } catch { }
    const mk = require('child_process').spawnSync('mkfifo', ['-m', '600', P2.fifo]);
    if (mk.status !== 0) throw new Error('mkfifo unavailable');
    const outFd = fs.openSync(P2.out, 'a');
    const errFd = fs.openSync(P2.err, 'a');
    const inFd = fs.openSync(P2.fifo, 'r+');
    const child = require('child_process').spawn(cmd, args || [], {
      detached: true, stdio: [inFd, outFd, errFd],
      cwd: cwd || process.env.HOME, env: { ...process.env, ...(env || {}) },
    });
    child.unref();
    fs.writeFileSync(P2.meta, JSON.stringify({ childPid: child.pid, startedAt: Date.now(), cmd: [cmd, ...(args || [])] }));
    // we CAN wait on our own detached child — write the real exit sentinel
    child.on('exit', (code) => {
      try { fs.appendFileSync(P2.out, JSON.stringify({ type: '_remote_exit', code: code ?? 0 }) + '\n'); } catch { }
      const cur = this._meta(sid) || {};
      fs.writeFileSync(P2.meta, JSON.stringify({ ...cur, exited: code ?? 0, exitedAt: Date.now() }));
    });
    fs.closeSync(outFd); fs.closeSync(errFd); // child holds its own copies
    log(`pipe-session ${sid} spawned pid=${child.pid}`);
    return { pid: child.pid, existing: false };
  },
  attach(sid, chan, mux, offset) {
    const P2 = this._paths(sid);
    let pos = Math.max(0, offset);
    let fd = null;
    const pump = () => {
      if (fd === null) { try { fd = fs.openSync(P2.out, 'r'); } catch { return; } }
      try {
        const size = fs.fstatSync(fd).size;
        if (pos > size) pos = 0;
        while (pos < size) {
          const want = Math.min(65536, size - pos);
          const b = Buffer.alloc(want);
          const n = fs.readSync(fd, b, 0, want, pos);
          if (n <= 0) break;
          pos += n;
          mux.data(chan, b.subarray(0, n));
        }
      } catch { }
    };
    const timer = setInterval(pump, 150);
    pump();
    let tails = this._tails.get(mux);
    if (!tails) { tails = new Map(); this._tails.set(mux, tails); }
    tails.set(chan, { sid, timer, get fd() { return fd; } });
  },
  writeStdin(mux, chan, buf) {
    const t = this._tails.get(mux)?.get(chan);
    if (!t) return false;
    try {
      const inFd = fs.openSync(this._paths(t.sid).fifo, 'r+');
      fs.writeSync(inFd, buf);
      fs.closeSync(inFd);
      return true;
    } catch { return true; } // attached but stdin gone (exited) — swallow
  },
  detachAll(mux) {
    const tails = this._tails.get(mux);
    if (!tails) return;
    for (const t of tails.values()) { clearInterval(t.timer); try { if (t.fd !== null) fs.closeSync(t.fd); } catch { } }
    this._tails.delete(mux);
  },
  kill(sid) {
    const m = this._meta(sid);
    if (!m) return;
    if (this._childAlive(m)) {
      try { process.kill(m.childPid, 'SIGTERM'); } catch { }
      setTimeout(() => { try { if (this._childAlive(m)) process.kill(m.childPid, 'SIGKILL'); } catch { } }, 2500);
    }
  },
};

// ── serve ──
try { fs.unlinkSync(SOCK); } catch { }
// One connection handler for EVERY transport: local unix socket accepts AND
// outbound dial-out websockets (Transport B) — the stream shape is identical.
function serveConnection(sock) {
  let authed = false;
  let upgrade = null;
  const sessions = new Map(); // chan → { proc, credit accounting is per-mux }
  const tcpChans = new Map(); // chan → net.Socket (M4 tcp-forward)
  const mux = new Mux(sock, {
    onControl(msg) {
      if (msg.op === 'hello') {
        if (msg.protoVersion !== PROTO_VERSION) { mux.control({ op: 'proto-mismatch', protoVersion: PROTO_VERSION }); sock.end(); return; }
        const sha = msg.hostToken ? require('crypto').createHash('sha256').update(String(msg.hostToken)).digest('hex') : null;
        if (!tokenSha || sha !== tokenSha) { mux.control({ op: 'auth-fail' }); log('auth-fail from a connection'); sock.end(); return; }
        authed = true;
        mux.control({
          op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: VERSION,
          platform: process.platform, arch: process.arch, nodeVersion: process.version,
          capabilities: [],
        });
        return;
      }
      if (!authed) { sock.end(); return; }
      if (msg.op === 'ok') return; // server accepted us as-is
      if (msg.op === 'upgrade') { upgrade = beginUpgrade(mux, msg); return; }
      if (msg.op === 'ping-info') { mux.control({ op: 'info', version: VERSION, pid: process.pid, uptime: process.uptime() }); return; }
      // ── M1 session primitive: spawn a pty, relay its bytes on a byte channel
      // (invariant #2: mechanical only — no normalization/discovery here). The
      // spawn spec (cmd/args/env) is assembled SERVER-side and shipped here. ──
      // ── M2 persistent PIPE session (chat-class; the keeper model natively):
      // child runs setsid-DETACHED with stdout→buffer file (direct fd) and
      // stdin←O_RDWR fifo — daemon death/upgrade harms it in no way; any
      // connection reattaches by byte offset. Registry survives daemon
      // restarts (state/sessions/<sid>.json). ──
      if (msg.op === 'open-pipe-session') {
        try {
          const r = pipeSessions.open(msg);
          mux.control({ op: 'pipe-session-open', chan: msg.chan, sid: msg.sid, pid: r.pid, existing: r.existing });
          pipeSessions.attach(msg.sid, msg.chan, mux, Number(msg.offset) || 0);
        } catch (e) { mux.control({ op: 'session-error', chan: msg.chan, error: e.message }); }
        return;
      }
      if (msg.op === 'attach-pipe-session') {
        try {
          const st = pipeSessions.stat(msg.sid);
          mux.control({ op: 'pipe-session-open', chan: msg.chan, sid: msg.sid, pid: st.pid, existing: true, exited: st.exited });
          pipeSessions.attach(msg.sid, msg.chan, mux, Number(msg.offset) || 0);
        } catch (e) { mux.control({ op: 'session-error', chan: msg.chan, error: e.message }); }
        return;
      }
      if (msg.op === 'kill-pipe-session') { try { pipeSessions.kill(msg.sid); } catch { } return; }
      // ── M3: fs ops (mechanical; large payloads ride byte channels) ──
      if (msg.op === 'fs-op') {
        (async () => {
          const rid = msg.id;
          try {
            const p = String(msg.path || '');
            if (!path.isAbsolute(p)) throw new Error('absolute path required');
            switch (msg.action) {
              case 'stat': {
                const st = fs.statSync(p);
                mux.control({ op: 'fs-result', id: rid, stat: { size: st.size, mtimeMs: st.mtimeMs, isDir: st.isDirectory(), mode: st.mode } });
                break;
              }
              case 'list': {
                const entries = fs.readdirSync(p, { withFileTypes: true }).slice(0, 5000).map((e) => {
                  let st = null; try { st = fs.statSync(path.join(p, e.name)); } catch { }
                  return { name: e.name, isDir: e.isDirectory(), size: st?.size ?? 0, mtimeMs: st?.mtimeMs ?? 0 };
                });
                mux.control({ op: 'fs-result', id: rid, entries });
                break;
              }
              case 'read-range': {
                // stream [start, start+len) on the given byte channel — the
                // transcript-slab primitive (server keeps its line-index math)
                const fd = fs.openSync(p, 'r');
                try {
                  const size = fs.fstatSync(fd).size;
                  const start = Math.max(0, Number(msg.start) || 0);
                  const want = Math.min(Number(msg.len) || 0, size - start);
                  mux.control({ op: 'fs-result', id: rid, size, sending: Math.max(0, want) });
                  let pos = start;
                  const CHUNK = 65536;
                  while (pos < start + want) {
                    const n = Math.min(CHUNK, start + want - pos);
                    const b = Buffer.alloc(n);
                    const got = fs.readSync(fd, b, 0, n, pos);
                    if (got <= 0) break;
                    mux.data(msg.chan, b.subarray(0, got));
                    pos += got;
                    await new Promise((r) => setImmediate(r)); // yield: credit frames must interleave
                  }
                  mux.control({ op: 'fs-done', id: rid, chan: msg.chan });
                } finally { fs.closeSync(fd); }
                break;
              }
              case 'write': {
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, Buffer.from(String(msg.data64 || ''), 'base64'));
                mux.control({ op: 'fs-result', id: rid, ok: true });
                break;
              }
              case 'mkdir': fs.mkdirSync(p, { recursive: true }); mux.control({ op: 'fs-result', id: rid, ok: true }); break;
              case 'rename': fs.renameSync(p, String(msg.to)); mux.control({ op: 'fs-result', id: rid, ok: true }); break;
              case 'rm': fs.rmSync(p, { recursive: !!msg.recursive, force: true }); mux.control({ op: 'fs-result', id: rid, ok: true }); break;
              default: throw new Error('unknown fs action: ' + msg.action);
            }
          } catch (e) { mux.control({ op: 'fs-result', id: msg.id, error: e.message }); }
        })();
        return;
      }
      // ── M3: session discovery RAW FACTS (locks + jsonl inventory + tail
      // bytes); the lock-first CLAIM algorithm stays server-side ──
      if (msg.op === 'discovery-snapshot') {
        try {
          const home = os.homedir();
          const locks = [];
          try {
            for (const f of fs.readdirSync(path.join(home, '.claude', 'sessions'))) {
              if (!f.endsWith('.json')) continue;
              const pid = Number(f.slice(0, -5));
              let alive = false; try { process.kill(pid, 0); alive = true; } catch { }
              if (!alive) continue;
              try { locks.push({ pid, ...JSON.parse(fs.readFileSync(path.join(home, '.claude', 'sessions', f), 'utf-8')) }); } catch { }
            }
          } catch { }
          const jsonls = [];
          try {
            const projRoot = path.join(home, '.claude', 'projects');
            for (const d of fs.readdirSync(projRoot).slice(0, 500)) {
              const dp = path.join(projRoot, d);
              let files = []; try { files = fs.readdirSync(dp); } catch { continue; }
              for (const f of files) {
                if (!f.endsWith('.jsonl') || f.startsWith('agent-')) continue;
                try {
                  const st = fs.statSync(path.join(dp, f));
                  jsonls.push({ projDir: d, file: f, size: st.size, mtimeMs: st.mtimeMs });
                } catch { }
              }
            }
          } catch { }
          jsonls.sort((a, b) => b.mtimeMs - a.mtimeMs);
          mux.control({ op: 'discovery-result', id: msg.id, locks, jsonls: jsonls.slice(0, 200) });
        } catch (e) { mux.control({ op: 'discovery-result', id: msg.id, error: e.message }); }
        return;
      }
      if (msg.op === 'discovery-watch') {
        // fs.watch push: any change under sessions/ or projects/ → one
        // debounced 'discovery-dirty' (server re-snapshots; events carry no
        // interpretation — invariant #2)
        try {
          if (!this._discoWatch) {
            const home = os.homedir();
            let timer = null;
            const kick = () => { if (timer) return; timer = setTimeout(() => { timer = null; try { mux.control({ op: 'discovery-dirty' }); } catch { } }, 500); };
            const watches = [];
            for (const d of [path.join(home, '.claude', 'sessions'), path.join(home, '.claude', 'projects')]) {
              try { watches.push(fs.watch(d, { recursive: true }, kick)); } catch { try { watches.push(fs.watch(d, kick)); } catch { } }
            }
            this._discoWatch = watches;
          }
          mux.control({ op: 'discovery-watching', id: msg.id });
        } catch (e) { mux.control({ op: 'discovery-watching', id: msg.id, error: e.message }); }
        return;
      }
      // ── M4: bounded one-shot command (clipboard/xclip class; NOT a shell —
      // argv only, hard timeout, output capped) ──
      if (msg.op === 'run-cmd') {
        try {
          const { execFile } = require('child_process');
          const child = execFile(String(msg.cmd), (msg.args || []).map(String), {
            timeout: Math.min(Number(msg.timeoutMs) || 10000, 30000), maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, ...(msg.env || {}) },
          }, (err, stdout, stderr) => {
            mux.control({ op: 'cmd-result', id: msg.id, code: err ? (err.code ?? 1) : 0, stdout: String(stdout).slice(0, 1024 * 1024), stderr: String(stderr).slice(0, 65536) });
          });
          if (msg.stdin64) { try { child.stdin.end(Buffer.from(msg.stdin64, 'base64')); } catch { } } else { try { child.stdin.end(); } catch { } }
        } catch (e) { mux.control({ op: 'cmd-result', id: msg.id, code: 127, error: e.message }); }
        return;
      }
      // ── M4: TCP forward (the VNC-bridge shape): byte channel ↔ a LOCAL
      // 127.0.0.1 port on the device. Loopback only — never a general proxy. ──
      if (msg.op === 'tcp-connect') {
        try {
          const port = Number(msg.port);
          if (!port || port < 1 || port > 65535) throw new Error('bad port');
          const tsock = net.connect({ host: '127.0.0.1', port });
          const chanT = msg.chan;
          tsock.on('connect', () => mux.control({ op: 'tcp-open', id: msg.id, chan: chanT }));
          tsock.on('data', (d) => { mux.data(chanT, d); });
          tsock.on('close', () => { tcpChans.delete(chanT); mux.control({ op: 'tcp-close', chan: chanT }); });
          tsock.on('error', (e) => { tcpChans.delete(chanT); mux.control({ op: 'tcp-open', id: msg.id, chan: chanT, error: e.message }); });
          tcpChans.set(chanT, tsock);
        } catch (e) { mux.control({ op: 'tcp-open', id: msg.id, chan: msg.chan, error: e.message }); }
        return;
      }
      if (msg.op === 'open-session') {
        try {
          const { chan, cmd, args, cols, rows, cwd, env } = msg;
          if (!chan || chan < 1) throw new Error('bad session channel');
          const proc = pty().spawn(cmd, args || [], {
            name: 'xterm-256color', cols: cols || 120, rows: rows || 30,
            cwd: cwd || process.env.HOME,
            env: { ...process.env, ...(env || {}), TERM: 'xterm-256color', COLORTERM: 'truecolor' },
          });
          sessions.set(chan, { proc });
          proc.onData((d) => { try { mux.data(chan, Buffer.from(d, 'utf-8')); } catch { } });
          proc.onExit(({ exitCode }) => {
            sessions.delete(chan);
            mux.control({ op: 'session-exit', chan, code: exitCode });
          });
          mux.control({ op: 'session-open', chan, pid: proc.pid });
        } catch (e) {
          mux.control({ op: 'session-error', chan: msg.chan, error: e.message });
        }
        return;
      }
      if (msg.op === 'resize-session') {
        const sx = sessions.get(msg.chan);
        if (sx) { try { sx.proc.resize(msg.cols, msg.rows); } catch { } }
        return;
      }
      if (msg.op === 'kill-session') {
        const sx = sessions.get(msg.chan);
        if (sx) { try { sx.proc.kill(); } catch { } sessions.delete(msg.chan); }
        return;
      }
      log('unknown control op: ' + msg.op);
    },
    onData(chan, buf) {
      if (!authed) return;
      if (chan === 1 && upgrade) { upgrade.data(buf); return; }
      const sx = sessions.get(chan);
      if (sx) { try { sx.proc.write(buf.toString('utf-8')); } catch { } mux.credit(chan, buf.length); return; }
      if (pipeSessions.writeStdin(mux, chan, buf)) { mux.credit(chan, buf.length); return; }
      const t = tcpChans.get(chan);
      if (t) { try { t.write(buf); } catch { } mux.credit(chan, buf.length); }
    },
    onDead() {
      // connection gone: dtach-attach ptys are DETACH points — killing the
      // attach does NOT kill the dtach session (invariant #1: session survives
      // server/daemon death). So we DETACH (kill the attach proc) but the
      // underlying dtach session keeps running for the next connect.
      for (const { proc } of sessions.values()) { try { proc.kill(); } catch { } }
      sessions.clear();
      for (const t of tcpChans.values()) { try { t.destroy(); } catch { } }
      tcpChans.clear();
      if (this._discoWatch) { for (const w of this._discoWatch) { try { w.close(); } catch { } } this._discoWatch = null; }
      pipeSessions.detachAll(mux);
    },
  });
}
const server = net.createServer(serveConnection);
server.listen(SOCK, () => {
  try { fs.chmodSync(SOCK, 0o600); } catch { }
  log('listening on ' + SOCK);
});
server.on('error', (e) => { log('server error: ' + e.message); process.exit(1); });

// ── Transport B: dial-out (M4-lite). `--dial <wss-url> --dial-token <t>`
// persists the dial config; every boot re-dials. The outbound ws is served by
// the SAME connection handler — the server speaks hello over it like any
// transport (auth still via the device token in hello; the dial token only
// gates the server's upgrade endpoint). Reconnect with backoff, forever —
// a NAT'd device keeps itself reachable. ──
const DIAL_FILE = path.join(STATE, 'dial.json');
(function setupDial() {
  const di = process.argv.indexOf('--dial');
  if (di >= 0) {
    const cfg = { url: process.argv[di + 1], token: (process.argv[process.argv.indexOf('--dial-token') + 1] || '') };
    try { fs.writeFileSync(DIAL_FILE, JSON.stringify(cfg), { mode: 0o600 }); } catch { }
  }
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(DIAL_FILE, 'utf-8')); } catch { }
  if (!cfg?.url) return;
  const wsMin = require('./ws-min.js');
  let attempts = 0;
  const dial = () => {
    const ws = wsMin.connect(cfg.url, { headers: { 'x-vibespace-dial-token': cfg.token || '' } });
    let up = false;
    ws.on('open', () => { up = true; attempts = 0; log('dial-out connected: ' + cfg.url); serveConnection(ws); });
    ws.on('close', () => {
      const delay = [1000, 2000, 5000, 15000, 30000][Math.min(4, attempts++)];
      log(`dial-out ${up ? 'lost' : 'failed'} — retry in ${delay}ms`);
      setTimeout(dial, delay);
    });
  };
  dial();
})();

process.on('SIGTERM', () => { log('SIGTERM — exiting (sessions unaffected by design)'); process.exit(0); });
} // end !--stdio daemon body
