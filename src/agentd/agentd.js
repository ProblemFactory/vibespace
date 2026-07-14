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

// ── serve ──
try { fs.unlinkSync(SOCK); } catch { }
const server = net.createServer((sock) => {
  let authed = false;
  let upgrade = null;
  const sessions = new Map(); // chan → { proc, credit accounting is per-mux }
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
      if (sx) { try { sx.proc.write(buf.toString('utf-8')); } catch { } mux.credit(chan, buf.length); }
    },
    onDead() {
      // connection gone: dtach-attach ptys are DETACH points — killing the
      // attach does NOT kill the dtach session (invariant #1: session survives
      // server/daemon death). So we DETACH (kill the attach proc) but the
      // underlying dtach session keeps running for the next connect.
      for (const { proc } of sessions.values()) { try { proc.kill(); } catch { } }
      sessions.clear();
    },
  });
});
server.listen(SOCK, () => {
  try { fs.chmodSync(SOCK, 0o600); } catch { }
  log('listening on ' + SOCK);
});
server.on('error', (e) => { log('server error: ' + e.message); process.exit(1); });

process.on('SIGTERM', () => { log('SIGTERM — exiting (sessions unaffected by design)'); process.exit(0); });
