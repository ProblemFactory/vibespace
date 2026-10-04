// DeviceManager (CS refactor M0, server side) — install / token mint / spawn
// supervision / handshake / self-upgrade for vibespace-agentd instances.
// M0 covers DEVICE #0 (localhost) only, but through the SAME protocol every
// device will use (invariant #3: no local special case — the server talks to
// its own machine over the unix socket like any device).
// Lifecycle decision (design addendum): the daemon is ALWAYS setsid-detached;
// the server supervises BY CONNECT — a failed connect (re)spawns from the
// `current` install with backoff. A server restart never touches the daemon.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Mux, PROTO_VERSION } = require('./mux.js');
const { daemonEnv } = require('../agent-env.js');

// lane windows-device-fs — THE DOOR: a POSIX shell is never asked of a WINDOWS agent THAT HAS NONE. The hub ran `sh -c …`
// over the device link for the Files view, the home, path completion, the sweeps; a Windows machine without `sh` answered
// each one "command failed (127)" — a number nobody can act on (GET /api/files?host=<a Windows machine> answered exactly
// that). verify-r1 F1: the shell is the DEVICE'S FACT, not the platform's — Git for Windows / MSYS2 / Cygwin put `sh.exe` on
// PATH and those machines ran every one of these lines. The hello says which shells start there (`posixShells`); a shell
// that list leaves out is refused HERE, by name, before anything is sent (`windows_no_shell`). An agent too old to say is
// ASKED (today's behaviour) and a spawn that fails there is named afterwards (posixShellFailed). Callers that can do the job
// without a shell route around it (src/remote-fs.js).
const winShellOf = (info, cmd) => {
  if (!info || info.platform !== 'win32') return null;
  const base = String(cmd || '').split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');
  return /^(sh|bash|dash|zsh|ksh)$/.test(base) ? base : null;
};
function noShellError(base) {
  const e = new Error(`this needs a POSIX shell (${base}), and this Windows machine has none — not available on Windows machines without one yet`);
  e.code = 'windows_no_shell'; e.params = { shell: base }; // verify-r2: the client words it (zh / ja)
  return e;
}
function posixShellRefusal(info, cmd) {
  const base = winShellOf(info, cmd);
  if (!base || !Array.isArray(info.posixShells) || info.posixShells.includes(base)) return null; // the device has it, or cannot say ⇒ asked
  return noShellError(base);
}
/** a Windows agent was ASKED a shell (it has one, or is too old to say) and the spawn failed — named, not "(127)" */
function posixShellFailed(info, cmd, r) {
  const base = winShellOf(info, cmd);
  if (!base || !r) return null;
  return (r.spawnError && r.spawnError.code === 'ENOENT') || (r.code === 127 && /ENOENT/.test(String(r.error || ''))) ? noShellError(base) : null;
}

class DeviceManager {
  /**
   * @param {object} opts
   *  dataDir      server data/ (token hash store)
   *  bundlePath   built single-file daemon (data/bin/vibespace-agentd.js)
   *  version      release version (= daemonVersion expected)
   *  log          logger fn
   */
  constructor({ dataDir, bundlePath, version, nodeModules, transport, log = console.log, upgradeLedger = null, onUpgradeStuck = null, onVersionMatch = null, onUpgradeBegin = null, onAnswer = null } = {}) {
    this._tokFile = path.join(dataDir, 'agentd-tokens.json');
    this._bundlePath = bundlePath;
    this._version = version;
    // THE UPGRADE LEDGER (verify-r1 C1, 2026-09-28): the 2.330.0 loop breaker counted attempts ON THIS INSTANCE —
    // and the dial path builds a NEW DeviceManager for every fresh stream (the stale-stream guard), so a device
    // whose upgrade never moves its reported version re-dialed after every re-exec into a counter at 0: measured
    // 180 upgrades in 45 s (4 pushes of 1.6 MB a second, the daemon re-exec'ing each time) once the handshake ran
    // on every dial-in. A ledger OUTLIVES the instance (dial-pairing.js keeps one per device); `get(expected)` →
    // `{tries, gaveUp}` for THIS bundle version, `set(expected, {tries, gaveUp})` after every change.
    this._upgradeLedger = upgradeLedger;
    // lane device-upgrade-stuck: THE door of a stuck / healed upgrade (the construction site binds the machine —
    // hosts.onAgentUpgrade → src/server/device-upgrade-watch.js). Pre-fix nothing ever assigned `_onUpgradeStuck`.
    this._onUpgradeStuck = typeof onUpgradeStuck === 'function' ? onUpgradeStuck : null;
    this._onVersionMatch = typeof onVersionMatch === 'function' ? onVersionMatch : null;
    // lane win-upgrade-pipe: an upgrade the hub STARTED and every hello (the device answered) — the same door, so a device
    // that never dials back after its re-exec reaches the user (src/server/device-upgrade-watch.js begun / answered)
    this._onUpgradeBegin = typeof onUpgradeBegin === 'function' ? onUpgradeBegin : null;
    this._onAnswer = typeof onAnswer === 'function' ? onAnswer : null;
    // The version a freshly-upgraded daemon will REPORT is the one baked into
    // the bundle we ship — not this server's package version. They diverge
    // whenever the repo is rebuilt without restarting the server (or vice
    // versa), and comparing against the wrong one makes the upgrade check
    // UNSATISFIABLE: every reconnect sees a mismatch and upgrades again,
    // forever (real incident 2026-08-13: ~8h of 10s-cycle re-installs, 20GB
    // RSS). Read it from the bundle, cached by mtime+size.
    this._bundleVerCache = null;
    this._nodeModules = nodeModules || null; // so the daemon can require node-pty (M1 localhost)
    this._log = log;
    this._root = process.env.VIBESPACE_AGENTD_ROOT || path.join(os.homedir(), '.vibespace', 'agentd');
    this._state = path.join(this._root, 'state');
    // the local daemon's socket (lane-pairing ④): its WITNESS (<root>/state/socket-path, what the daemon really
    // listens on) when it names a live socket, else THE rule (src/sock-path.js) — never the bare natural path,
    // which a long root puts over the platform's sun_path (the daemon then listens on a short rung)
    this._sockOverride = null;
    // Transport (M2): { kind:'local' } = unix socket on this machine; or
    // { kind:'ssh', host, remoteAgentd, sshArgs } = dial the STANDING remote
    // daemon over `ssh … -- node <remoteAgentd> --stdio` (the bridge). Default
    // local keeps M0/M1 unchanged.
    this._transport = transport || { kind: 'local' };
    this._conn = null;         // {mux, info}
    this._connecting = false;
    this._stopped = false;
    // reverse forwards (port → connectLocal fn) survive the connection object:
    // re-registered on every reconnect so device-side listeners self-heal
    this._reverseForwards = new Map();
    try { this._tokens = JSON.parse(fs.readFileSync(this._tokFile, 'utf-8')); } catch { this._tokens = {}; }
  }

  get _sock() {
    if (this._sockOverride) return this._sockOverride;
    if (process.platform === 'win32') return '\\\\.\\pipe\\vibespace-agentd-' + require('crypto').createHash('sha1').update(this._root).digest('hex').slice(0, 12);
    const SP = require('../sock-path.js');
    return SP.witnessOrRule({ root: this._root, platform: process.platform, tmpdir: os.tmpdir(), xdgRuntimeDir: process.env.XDG_RUNTIME_DIR || '', uid: typeof process.getuid === 'function' ? process.getuid() : null }).path
      || path.join(this._state, 'agentd.sock');
  }
  set _sock(v) { this._sockOverride = v || null; }

  status() {
    return {
      connected: !!this._conn,
      info: this._conn?.info || null,
      version: this._version,
      socket: this._sock,
    };
  }

  // ── token: vsht_ minted once for device #0; plaintext ONLY in the device's
  // 0600 state file (invariant #4), sha256 server-side ──
  _ensureLocalToken() {
    fs.mkdirSync(this._state, { recursive: true, mode: 0o700 });
    const devTok = path.join(this._state, 'token');
    let raw = null;
    try { raw = fs.readFileSync(devTok, 'utf-8').trim(); } catch { }
    // verify-r3: THE ONE DOOR of a pairing token (src/pairing-token.js) — the mint and the hash
    const PT = require('../pairing-token.js');
    if (!raw) {
      raw = PT.mintToken('host');
      fs.writeFileSync(devTok, raw, { mode: 0o600 });
    }
    const sha = PT.tokenHash(raw);
    if (this._tokens.local !== sha) {
      this._tokens.local = sha;
      try { fs.writeFileSync(this._tokFile, JSON.stringify(this._tokens, null, 2), { mode: 0o600 }); } catch { }
    }
    return raw;
  }

  // Version baked into the bundle we ship (what an upgraded daemon reports).
  // Falls back to our package version when the marker is unreadable.
  _expectedVersion() {
    try {
      const st = fs.statSync(this._bundlePath);
      const key = st.mtimeMs + ':' + st.size;
      if (this._bundleVerCache?.key === key) return this._bundleVerCache.v;
      // the WHOLE file: the marker (src/agentd/version.js, bundled) sits wherever esbuild puts that module —
      // measured at byte 1 076 247 of the 1.6 MB bundle, past the first 400 000 this once read (verify-r1 C1)
      const text = fs.readFileSync(this._bundlePath, 'utf-8');
      const m = /\bVERSION\s*:\s*"(\d+\.\d+\.\d+)"/.exec(text);
      const v = m ? m[1] : this._version;
      this._bundleVerCache = { key, v };
      return v;
    } catch { return this._version; }
  }

  /** The loop breaker's count for THIS bundle version: the ledger's when one is wired (survives a rebuilt instance),
   *  else this instance's own fields (the pre-ledger shape every other transport keeps). */
  _ledgerRead(expected) {
    if (this._upgradeLedger) { const r = this._upgradeLedger.get(expected); return { tries: Number(r && r.tries) || 0, gaveUp: !!(r && r.gaveUp) }; }
    return { tries: Number(this._upgradeTries) || 0, gaveUp: !!this._upgradeGaveUp };
  }
  _ledgerWrite(expected, { tries, gaveUp }) {
    this._upgradeTries = tries; this._upgradeGaveUp = gaveUp;
    if (this._upgradeLedger) { try { this._upgradeLedger.set(expected, { tries, gaveUp }); } catch { } }
  }

  // ── install: land the built bundle into <root>/<version>/ + repoint current ──
  installLocal() {
    if (!fs.existsSync(this._bundlePath)) throw new Error('agentd bundle missing: ' + this._bundlePath);
    const dir = path.join(this._root, this._version);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const dst = path.join(dir, 'agentd.js');
    fs.copyFileSync(this._bundlePath, dst);
    fs.chmodSync(dst, 0o700);
    const curTmp = path.join(this._root, '.current.tmp');
    try { fs.unlinkSync(curTmp); } catch { }
    fs.symlinkSync(dir, curTmp);
    fs.renameSync(curTmp, path.join(this._root, 'current'));
    return dst;
  }

  _spawnLocal() {
    const cur = path.join(this._root, 'current', 'agentd.js');
    if (!fs.existsSync(cur)) this.installLocal();
    // THE DAEMON IS BORN WITH THE SANITIZED ENV (src/agent-env.js, 2026-09-14):
    // it outlives every server restart by design, and `agentd.spawnEnv()`
    // merges each child over ITS environ — so a `{...process.env}` here handed
    // every cluster secret (the integration env family, the drive presets,
    // the login password…) to every pipe-session claude for as long as the
    // daemon lived, restarts and withdrawn defaults included. Measured on a
    // real CLI's /proc/<pid>/environ. `daemonEnv` keeps the two names the
    // daemon tier itself reads on top of the agent set.
    const child = spawn(process.execPath, [path.join(this._root, 'current', 'agentd.js')], {
      detached: true, stdio: 'ignore',
      env: { ...daemonEnv(process.env), ...(this._nodeModules ? { VIBESPACE_NODE_MODULES: this._nodeModules } : {}) },
    });
    child.unref();
    this._log(`[agentd] spawned local daemon pid=${child.pid}`);
  }

  /** connect (spawning if needed) — resolves with {mux, info}; retries internally. */
  async connect() {
    if (this._conn) return this._conn;
    if (this._connecting) return this._connectPromise;
    this._connecting = true;
    this._connectPromise = this._connectLoop();
    try { return await this._connectPromise; }
    finally { this._connecting = false; }
  }

  async _connectLoop() {
    const token = this._transport.kind === 'local' ? this._ensureLocalToken() : this._transport.hostToken;
    const backoffs = [500, 1000, 2000, 5000];
    for (let attempt = 0; !this._stopped; attempt++) {
      let lastErr = null;
      const conn = await this._tryOnce(token).catch((e) => { lastErr = e; return null; });
      if (conn) return conn;
      // lane-pairing ③: a DIALED device that refused OUR host key (its state/token came from another command) is not
      // helped by retrying the same key for a minute — say it now, so the machine row reads `auth-fail`
      if (this._transport.kind === 'stream' && lastErr && /auth failed/.test(String(lastErr.message))) throw lastErr;
      if (attempt === 0 && this._transport.kind === 'local') this._spawnLocal(); // local: bring the daemon up (ssh bridge self-spawns the remote one)
      const delay = backoffs[Math.min(attempt, backoffs.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
      if (attempt > 12) throw new Error('agentd: cannot reach the local daemon');
    }
    throw new Error('stopped');
  }

  _openTransport() {
    if (this._transport.kind === 'stream') {
      // Transport B consumption: a device that DIALED IN. Its ws stream is
      // handed to us via getStream() (the server's agentdDials registry). A
      // single-use stream — if it's gone (device disconnected), throw so the
      // connect loop backs off and retries; the device's --dial reconnects and
      // a fresh stream appears.
      const s = this._transport.getStream?.();
      if (!s) throw new Error('dial device not connected');
      return s;
    }
    if (this._transport.kind === 'ssh') {
      const t = this._transport;
      const remoteCmd = t.remoteCmd || `node ${JSON.stringify(t.remoteAgentd)} --stdio`;
      const child = spawn(t.sshBin || 'ssh', [...t.sshArgs, '--', remoteCmd], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      // stdin/stdout errors arrive ASYNC as 'error' events on the pipe socket
      // itself — the write wrapper's try/catch only stops sync throws, so a
      // dying ssh child (heartbeat PING → write EPIPE on its stdin) was an
      // UNCAUGHT exception that took the whole server down (2.241.1, userN's
      // 10:34 exit-code-1: crashed 28s after boot during the reattach storm).
      // Swallow here; the 'close' event drives mux teardown + reconnect.
      child.stdin.on('error', () => {});
      child.stdout.on('error', () => {});
      // present the child as a duplex stream for the Mux (write→stdin, data←stdout)
      return {
        write: (d) => { try { return child.stdin.write(d); } catch { return false; } },
        on: (ev, fn) => {
          if (ev === 'data') child.stdout.on('data', fn);
          else if (ev === 'close') { child.on('close', fn); child.stdout.on('close', fn); }
          else if (ev === 'error') child.on('error', fn);
        },
        destroy: () => { try { child.kill(); } catch {} },
      };
    }
    return net.connect(this._sock);
  }

  _tryOnce(token) {
    return new Promise((resolve, reject) => {
      const sock = this._openTransport();
      let settled = false, keepStream = false;
      const fail = (e) => { if (!settled) { settled = true; if (!keepStream) { try { sock.destroy(); } catch { } } reject(e || new Error('connect failed')); } };
      sock.on('error', fail);
      const timer = setTimeout(() => fail(new Error('handshake timeout')), 8000);
      const mux = new Mux(sock, {
        onControl: (msg) => {
          if (msg.op === 'hello-ack') {
            clearTimeout(timer);
            const expected = this._expectedVersion();
            try { this._onAnswer?.(msg.daemonVersion); } catch { }
            // LOOP BREAKER (2.330.0): an upgrade that does not change the
            // reported version can never converge — a daemon that fails to
            // install, a stale singleton that will not die, a host missing
            // node. Retry a bounded number of times, then KEEP THE LINK and
            // say so loudly. Capability gating already makes an older daemon
            // safe to talk to; spinning forever is not (it re-installed every
            // ~10s for 8h, drove RSS to 20GB and produced no error anywhere).
            const led = this._ledgerRead(expected);
            if (msg.daemonVersion !== expected && led.tries > 2) {
              if (!led.gaveUp) {
                led.gaveUp = true; this._ledgerWrite(expected, led);
                this._log(`[agentd] daemon stays at ${msg.daemonVersion} after ${this._upgradeTries} upgrade attempts to ${expected} — GIVING UP and using it as-is (capability-gated). Fix the device install manually; no further attempts this connection.`);
                try { global.__vsEvent?.('agentd-upgrade-stuck', { detail: `${msg.daemonVersion}→${expected}` }); } catch { }
                try { this._onUpgradeStuck?.(msg.daemonVersion, expected, { platform: msg.platform, capabilities: msg.capabilities }); } catch { }
              }
            } else if (msg.daemonVersion !== expected && fs.existsSync(this._bundlePath)) {
              led.tries += 1; this._ledgerWrite(expected, led);
              // version drift → stream the new bundle (self-upgrade), then reconnect
              this._log(`[agentd] daemon ${msg.daemonVersion} ≠ ${expected} — upgrading (attempt ${led.tries}/3)`);
              try { this._onUpgradeBegin?.(msg.daemonVersion, expected, { platform: msg.platform }); } catch { }
              this._upgrade(mux).then(() => {
                settled = true;
                try { sock.destroy(); } catch { }
                setTimeout(() => resolve(this._connectLoop()), 700); // re-exec window
              }).catch(fail);
              return;
            }
            if (msg.daemonVersion === expected) { this._ledgerWrite(expected, { tries: 0, gaveUp: false }); try { this._onVersionMatch?.(expected); } catch { } }
            mux.control({ op: 'ok' });
            settled = true;
            const sessions = new Map(); // chan → { onData, onExit }
            const pending = new Map();  // id → resolve (fs/discovery/cmd/tcp acks)
            this._conn = { mux, info: msg, sessions, pending, nextChan: 2, nextId: 1 };
            // route byte-channel data + session control to the session handlers.
            // A handler may set manualCredit and credit as it truly consumes
            // (backpressure for socket-piping consumers).
            mux.onData = (chan, buf) => {
              const s = sessions.get(chan);
              s?.onData?.(buf);
              if (!s?.manualCredit) mux.credit(chan, buf.length);
            };
            mux.onWritable = (chan) => { sessions.get(chan)?.onWritable?.(); };
            const prevControl = mux.onControl;
            mux.onControl = (m) => {
              if (m.op === 'fs-result' || m.op === 'discovery-result' || m.op === 'discovery-watching' || m.op === 'usage-events-watching' || m.op === 'session-events-watching' || m.op === 'cmd-result' || m.op === 'probe-result' || m.op === 'secret-result' || m.op === 'quota-result' || m.op === 'sysinfo-result' || m.op === 'dial-status-result' || m.op === 'proc-list-result' || m.op === 'opencode-serve-result' || m.op === 'browser-serve-result' || m.op === 'desktop-serve-result' || m.op === 'peer-post-result' || m.op === 'pool-orders-ok' || m.op === 'tcp-open' || m.op === 'listen-open' || m.op === 'serve-folder-result' || m.op === 'serve-socks-result') {
                const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); }
                if (m.op === 'tcp-open' && !m.error) return; // channel stays live
                return;
              }
              // reverse forward: the daemon accepted a device-local connection
              // on a listener we registered — pipe it to our local target
              if (m.op === 'tcp-accept') { this._onTcpAccept(m); return; }
              if (m.op === 'fs-done') { sessions.get(m.chan)?.onDone?.(m); return; }
              if (m.op === 'stream-start') { const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } return; }
              // stream-exit rides the control channel and can OVERTAKE queued
              // stdout (same class as the fs-done truncation) — a handler that
              // sets onExitMsg keeps its registration and settles itself once
              // the counted bytes landed; legacy handlers keep the old delete.
              if (m.op === 'stream-exit') {
                const h = sessions.get(m.chan);
                if (h?.onExitMsg) { h.onExitMsg(m); return; }
                sessions.delete(m.chan); h?.onExit?.(m.code, m.error); return;
              }
              if (m.op === 'tcp-close') { const h = sessions.get(m.chan); sessions.delete(m.chan); h?.onClose?.(); return; }
              if (m.op === 'discovery-dirty') { this._onDiscoveryDirty?.(); return; }
              if (m.op === 'usage-events') { this._onUsageEvents?.(m); return; }
              if (m.op === 'session-events') { this._onSessionEvents?.(m); return; } // step-2 dark stream (unsolicited push branch — the three-touch rule)
              if (m.op === 'pool-orders-executed') { this._onPoolOrdersExecuted?.(m.events || []); return; }
              if (m.op === 'session-open' || m.op === 'pipe-session-open') { sessions.get(m.chan)?.onOpen?.(m); return; }
              if (m.op === 'session-exit') { const h = sessions.get(m.chan); sessions.delete(m.chan); h?.onExit?.(m.code); return; }
              if (m.op === 'session-error') { const h = sessions.get(m.chan); sessions.delete(m.chan); h?.onError?.(m.error); return; }
              prevControl(m);
            };
            mux.onDead = () => {
              // Tear down local sockets we opened for reverse-forward accepts
              // (mirrors the daemon's own onDead). Without this, each accepted
              // /dav connection's socket + its listeners leak on every link
              // drop — the reconnect self-heal re-listens but never reconciles
              // the stale sockets (review finding, client.js:206).
              // ALSO fire onExit: pty/pipe session handles wire onExit, not
              // onClose — a daemon re-exec (self-upgrade) otherwise left the
              // server holding a silently-dead pty shim, so the detach-path
              // auto-reattach never ran and local terminals froze/blanked
              // until a page reload (real report, 3× in one evening).
              for (const s of sessions.values()) { try { s.onClose?.(); } catch { } try { s.onExit?.(-1); } catch { } }
              sessions.clear();
              // FAIL EVERY IN-FLIGHT REQUEST NOW (lane C2 fix, 2026-09-25): a
              // request already written to THIS mux can never be answered — a
              // re-dial is a NEW connection with its own pending map — yet each
              // one used to wait out its own timeoutMs (desktop-serve 60 s,
              // browser-serve 90 s) while the device was back in ~110 ms. The
              // reply shape carries `linkLost` so _request names it by code.
              for (const r of pending.values()) { try { r({ error: 'device link lost', linkLost: true }); } catch { } }
              pending.clear();
              this._conn = null;
              this._log('[agentd] connection lost');
            };
            resolve(this._conn);
            // self-heal reverse forwards: re-own each registered device port
            for (const [port] of this._reverseForwards) {
              this._request({ op: 'tcp-listen', port }).catch(() => { });
            }
            // re-arm the discovery watch (R4: it also drives the push-
            // triggered usage harvest) — the daemon-side watch survives, but
            // a RESTARTED daemon starts unwatched; idempotent either way
            if (this._onDiscoveryDirty) this._request({ op: 'discovery-watch' }).catch(() => { });
            if (this._onUsageEvents) this._request({ op: 'usage-events-watch' }).catch(() => { });
            if (this._onSessionEvents) this._request({ op: 'session-events-watch' }).catch(() => { }); // session-brain step 2 re-arm
            return;
          }
          if (msg.op === 'auth-fail') {
            // A DIALED device that refused our host key KEEPS ITS LINK (verify-r1 C2, 2026-09-28): destroying the
            // stream made the device re-dial every second forever (accept → hello → auth-fail → close → re-dial:
            // hosts.json rewritten and every client repainted each second, the row reading "offline — no dial
            // attempt has reached this server" 99 % of the time). The link stays up and unauthenticated — the
            // machine row reads `auth-fail`, every op on it is refused fast (dial-pairing.js remembers the
            // refused stream), and this mux stays alive only to answer the daemon's heartbeat.
            if (this._transport.kind === 'stream') { keepStream = true; mux.onControl = () => { }; }
            fail(Object.assign(new Error('agentd auth failed — token mismatch'), { code: 'auth_failed' }));
          }
          if (msg.op === 'proto-mismatch') fail(new Error('agentd protocol mismatch'));
        },
        onDead: () => fail(new Error('connection died during handshake')),
      });
      const sayHello = () => mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: token, serverVersion: this._version });
      // ssh stdio + a dialed-in ws stream are already connected at open; a unix
      // socket needs its 'connect' event first.
      if (this._transport.kind === 'ssh' || this._transport.kind === 'stream') sayHello();
      else sock.on('connect', sayHello);
    });
  }

  async _upgrade(mux) {
    const bundle = fs.readFileSync(this._bundlePath);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('upgrade timeout')), 30000);
      const origOnControl = mux.onControl;
      mux.onControl = (msg) => {
        if (msg.op === 'upgrade-done') { clearTimeout(timer); mux.onControl = origOnControl; resolve(); }
        // lane device-upgrade-stuck: a daemon that could not LAND the bundle says so (≥ 2.369.203) — the attempt ends
        // now with the device's own reason, never a silent 30 s timeout
        else if (msg.op === 'upgrade-failed') { clearTimeout(timer); mux.onControl = origOnControl; reject(new Error('the device could not land the upgrade — ' + String(msg.error || '?').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200))); }
        else origOnControl(msg);
      };
      // the version the daemon lands under and REPORTS after its re-exec (VIBESPACE_AGENTD_VERSION) is the
      // BUNDLE's own — the one `_expectedVersion()` compares against. Naming the package version here made a
      // rebuilt-without-restart server upgrade the same device on every natural restart (verify-r1 C1).
      mux.control({ op: 'upgrade', version: this._expectedVersion(), size: bundle.length });
      // stream on chan 1 in credit-sized slices (the mux queues past the window)
      for (let off = 0; off < bundle.length; off += 65536) {
        mux.data(1, bundle.subarray(off, Math.min(off + 65536, bundle.length)));
      }
    });
  }

  /**
   * Open a device-side session: the daemon spawns the pty and relays bytes.
   * Returns a handle { write(str), resize(cols,rows), kill(), onData, onExit,
   * ready } — onData/onExit are set by the caller before/after; ready resolves
   * with {pid} on session-open or rejects on session-error.
   */
  async openSession({ cmd, args, cols, rows, cwd, env }) {
    const conn = await this.connect();
    const noShell = posixShellRefusal(conn.info, cmd); if (noShell) throw noShell; // lane windows-device-fs: THE DOOR
    const chan = conn.nextChan++;
    const handle = { chan, onData: null, onExit: null };
    let resolveReady, rejectReady, readySettled = false;
    handle.ready = new Promise((res, rej) => {
      resolveReady = (v) => { readySettled = true; res(v); };
      rejectReady = (e) => { readySettled = true; rej(e); };
    });
    conn.sessions.set(chan, {
      onOpen: (m) => { handle.pid = m.pid; resolveReady({ pid: m.pid }); },
      onError: (e) => rejectReady(new Error(e)),
      onData: (buf) => handle.onData?.(buf),
      // Pre-ready link death (2.271.0 T1-6): reject `ready` so a terminal-on-
      // dial open that races a link drop fails visibly instead of hanging.
      onExit: (code) => { if (!readySettled) rejectReady(new Error('device link lost before session opened')); else handle.onExit?.(code); },
      onClose: () => { if (!readySettled) rejectReady(new Error('device link lost before session opened')); },
    });
    handle.write = (str) => conn.mux.data(chan, Buffer.from(str, 'utf-8'));
    handle.resize = (c, r) => conn.mux.control({ op: 'resize-session', chan, cols: c, rows: r });
    handle.kill = () => conn.mux.control({ op: 'kill-session', chan });
    conn.mux.control({ op: 'open-session', chan, cmd, args, cols, rows, cwd, env });
    return handle;
  }

  /**
   * Open/attach a PERSISTENT pipe session (chat-class; keeper semantics — the
   * child is daemon-owned, setsid-detached, buffer-file backed). Reattach with
   * a byte offset; the {type:'_remote_exit'} sentinel line in the byte stream
   * means the child really ended. Omit cmd to attach-only.
   */
  async openPipeSession({ sid, cmd, args, cwd, env, offset = 0 }) {
    const conn = await this.connect();
    const noShell = cmd === undefined ? null : posixShellRefusal(conn.info, cmd); if (noShell) throw noShell; // lane windows-device-fs: THE DOOR (an attach names no cmd)
    const chan = conn.nextChan++;
    const handle = { chan, sid, onData: null, onExit: null };
    let resolveReady, rejectReady, readySettled = false;
    handle.ready = new Promise((res, rej) => {
      resolveReady = (v) => { readySettled = true; res(v); };
      rejectReady = (e) => { readySettled = true; rej(e); };
    });
    conn.sessions.set(chan, {
      onOpen: (m) => { handle.pid = m.pid; resolveReady({ pid: m.pid, existing: !!m.existing, exited: m.exited }); },
      onError: (e) => rejectReady(new Error(e)),
      onData: (buf) => handle.onData?.(buf),
      // Pre-ready link death (2.271.0 T1-6, the pre-ready twin of the B-b87b
      // CRITICAL): mux.onDead fires onExit(-1)/onClose before the daemon's
      // open reply — if `ready` is still pending the bridge would `await` it
      // FOREVER and the dial chat/terminal window stayed blank with no error.
      // Reject ready when the link dies unsettled; else pass the real exit on.
      onExit: (code) => { if (!readySettled) rejectReady(new Error('device link lost before session opened')); else handle.onExit?.(code); },
      onClose: () => { if (!readySettled) rejectReady(new Error('device link lost before session opened')); },
    });
    handle.write = (str) => conn.mux.data(chan, Buffer.from(str, 'utf-8'));
    handle.kill = () => conn.mux.control({ op: 'kill-pipe-session', sid });
    conn.mux.control(cmd
      ? { op: 'open-pipe-session', chan, sid, cmd, args, cwd, env, offset }
      : { op: 'attach-pipe-session', chan, sid, offset });
    return handle;
  }

  async _request(payload) {
    const conn = await this.connect();
    const id = conn.nextId++;
    return new Promise((resolve, reject) => {
      conn.pending.set(id, (m) => (m.error ? reject(Object.assign(new Error(m.error), m.linkLost ? { code: 'link_lost' } : {})) : resolve(m)));
      conn.mux.control({ ...payload, id });
      setTimeout(() => { if (conn.pending.delete(id)) reject(new Error(payload.op + ' timeout')); }, payload.waitMs || payload.timeoutMs || 30000);
    });
  }

  /** Kill a daemon pipe session by sid without attaching (the dial-chat
   *  terminate path — SIGTERM→SIGKILL escalation happens daemon-side). */
  async killPipeSession(sid) {
    const conn = await this.connect();
    conn.mux.control({ op: 'kill-pipe-session', sid });
  }

  // ── M3 ──
  fsStat(p) { return this._request({ op: 'fs-op', action: 'stat', path: p }); }
  fsList(p) { return this._request({ op: 'fs-op', action: 'list', path: p }); }
  fsWrite(p, buf) { return this._request({ op: 'fs-op', action: 'write', path: p, data64: Buffer.from(buf).toString('base64') }); }
  fsRename(p, to) { return this._request({ op: 'fs-op', action: 'rename', path: p, to }); }
  fsMkdir(p) { return this._request({ op: 'fs-op', action: 'mkdir', path: p }); }
  fsRm(p, recursive = false) { return this._request({ op: 'fs-op', action: 'rm', path: p, recursive }); }
  /** lane windows-device-fs: the Files view's ops WITHOUT a shell (`fs-portable`; `~` expanded by the device) — what a
   *  Windows agent does with its own fs. Capability-gated: an older agent is never asked an op it lacks (it would hang). */
  async _fsPortable(payload, waitMs) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('fs-portable')) { const e = new Error('daemon lacks fs-portable (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    return this._request({ op: 'fs-op', ...payload, ...(waitMs ? { waitMs } : {}) });
  }
  fsHome() { return this._fsPortable({ action: 'home', path: '~' }); }
  fsCopy(p, to) { return this._fsPortable({ action: 'copy', path: p, to }, 130000); }
  fsMove(p, to) { return this._fsPortable({ action: 'move', path: p, to }, 130000); }
  fsDu(p) { return this._fsPortable({ action: 'du', path: p }, 70000); }
  /** read [start, start+len) — resolves a Buffer (the transcript-slab primitive).
   *  COUNT-GATED: fs-done rides the credit-EXEMPT control channel, so it can
   *  OVERTAKE data still queued daemon-side behind the 256KB credit window —
   *  resolving on fs-done alone truncated every read past the in-flight window
   *  to exactly INITIAL_WINDOW bytes (real incident: a 45MB remote transcript
   *  cached as a 256KB prefix and stamped complete = permanently ancient chat
   *  history). Resolve only once the expected byte count (ack.sending,
   *  adjusted down by fs-done's `sent` if the file shrank mid-read) has
   *  actually arrived; a 30s data stall rejects so callers can fall back.
   *  lane exit-transfer — THE SINK FORM (`{sink}`): every piece goes to `sink(buf)` as it arrives and nothing is kept;
   *  a sink that returns a promise (the file write) is CREDITED back only once it settles — the device then sends no
   *  faster than the disk takes the bytes (in flight ≤ the link's 256 KiB window, the tcp-forward rule) →
   *  `{size, sent, sha256}`; `{sha256: true}` asks the device for the hash of the bytes it sent (an older daemon ignores
   *  the flag ⇒ `sha256: null`). */
  async fsReadRange(p, start, len, { sink = null, sha256 = false } = {}) {
    const conn = await this.connect();
    const chan = conn.nextChan++;
    const chunks = [];
    // NOTE: mux frames dispatch SYNCHRONOUSLY in one socket-read burst, so for
    // a big read the burst is [ack, ~window of data, fs-done] and the awaited
    // ack's continuation (a microtask) runs only AFTER fs-done was handled —
    // never derive the target from "bytes seen at done time".
    let received = 0, sending = null, sentDone = null, doneSeen = false, legacy = false, stall = null, doneSha = null;
    let resolveP, rejectP;
    const donePromise = new Promise((res, rej) => { resolveP = res; rejectP = rej; });
    donePromise.catch(() => {}); // a stall while still awaiting the ack must not be an unhandled rejection
    const cleanup = () => { clearTimeout(stall); conn.sessions.delete(chan); };
    const bumpStall = () => { clearTimeout(stall); stall = setTimeout(() => { cleanup(); rejectP(new Error('read-range stalled')); }, 30000); };
    const maybeFinish = () => {
      if (!doneSeen) return;
      const t = sentDone != null ? (sending != null ? Math.min(sentDone, sending) : sentDone) : sending;
      if (t != null ? received >= t : legacy) { cleanup(); resolveP(); }
    };
    conn.sessions.set(chan, {
      manualCredit: !!sink,
      onData: (b) => {
        if (sink) {
          let done;
          try { done = sink(b); } catch (e) { cleanup(); rejectP(e); return; }
          Promise.resolve(done).then(() => { try { conn.mux.credit(chan, b.length); } catch { } }, (e) => { cleanup(); rejectP(e); });
        } else chunks.push(b);
        received += b.length; bumpStall(); maybeFinish();
      },
      onDone: (m) => { doneSeen = true; if (typeof m?.sent === 'number') sentDone = m.sent; if (typeof m?.sha256 === 'string' && /^[0-9a-f]{64}$/.test(m.sha256)) doneSha = m.sha256; maybeFinish(); },
    });
    bumpStall();
    const ack = await this._request({ op: 'fs-op', action: 'read-range', path: p, start, len, chan, ...(sha256 ? { sha256: true } : {}) });
    if (ack?.error) { cleanup(); throw new Error(ack.error); }
    if (typeof ack?.sending === 'number') sending = ack.sending;
    else legacy = true; // ancient daemon without counts: resolve on fs-done like before
    maybeFinish();
    await donePromise;
    if (sink) return { size: ack.size, sent: received, sha256: doneSha };
    return { size: ack.size, data: Buffer.concat(chunks) };
  }
  /** lane exit-transfer — an agent's PUSH: `source` (a Readable: the CLI's request body) streamed onto the device's
   *  `write-stream` (`fs-write-stream`; an older agent is NEVER asked — it would hang — `host_needs_daemon` by name):
   *  open ⇒ `<path>.vs-part` made new; the bytes on a byte channel under the window (the source PAUSED while the window
   *  is full); `end` with the count and the sha256 THIS side computed ⇒ the device compares both, renames, answers.
   *  `size` is announced up front: more or fewer bytes is a failure, never a short file. `check()` is asked every
   *  window (8 MiB) — a throw (the grant revoked, the caller gone) aborts. Any failure removes the part. → `{size, sha256}`. */
  async fsWriteStream(p, { source, size, overwrite = false, check = null, windowBytes = 8 * 1024 * 1024 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('fs-write-stream')) { const e = new Error('daemon lacks fs-write-stream (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    const chan = conn.nextChan++;
    const crypto = require('crypto');
    const contentHash = crypto.createHash('sha256'); // the bytes of a file (the device compares it at `end`)
    let sent = 0, nextCheck = windowBytes, waitW = null;
    conn.sessions.set(chan, { onWritable: () => { const f = waitW; waitW = null; f?.(); } });
    const linkGone = () => this._stopped || this._conn !== conn;
    const abort = async () => { if (linkGone()) return; try { await this._request({ op: 'fs-op', action: 'write-stream', step: 'abort', path: p, chan, waitMs: 15000 }); } catch { } }; // a dropped link: the agent removes the part itself
    try {
      await this._request({ op: 'fs-op', action: 'write-stream', step: 'open', path: p, chan, size, overwrite: !!overwrite, waitMs: 20000 });
      // never destroyOnReturn: a refusal mid-body must still answer the HTTP request the body arrived on
      const it = typeof source.iterator === 'function' ? source.iterator({ destroyOnReturn: false }) : source;
      for await (const piece of it) {
        const b = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
        sent += b.length;
        if (sent > size) throw Object.assign(new Error(`more than the ${size} bytes announced arrived`), { code: 'size_changed' });
        contentHash.update(b);
        for (let o = 0; o < b.length; o += 65536) {
          if (!conn.mux.data(chan, b.subarray(o, Math.min(o + 65536, b.length)))) {
            // the window is full: wait for the device's credit (the dead-link belt: a link that never answers fails)
            await new Promise((res, rej) => {
              const t0 = Date.now();
              const iv = setInterval(() => {
                const why = linkGone() ? 'the link to the machine dropped' : Date.now() - t0 > 60000 ? 'the machine stopped taking bytes for 60 s' : null;
                if (why) { clearInterval(iv); waitW = null; rej(Object.assign(new Error(why), { code: 'stalled' })); }
              }, 250);
              waitW = () => { clearInterval(iv); res(); };
            });
          }
        }
        if (linkGone()) throw Object.assign(new Error('the link to the machine dropped'), { code: 'stalled' });
        if (sent >= nextCheck) { nextCheck += windowBytes; if (check) await check(sent); }
      }
      if (sent !== size) throw Object.assign(new Error(`${sent} bytes arrived of the ${size} announced`), { code: 'size_changed' });
      if (check) await check(sent);
      const r = await this._request({ op: 'fs-op', action: 'write-stream', step: 'end', path: p, chan, sent, sha256: contentHash.digest('hex'), waitMs: 120000 });
      return { size: r.size, sha256: r.sha256 };
    } catch (e) { await abort(); throw e; }
    finally { conn.sessions.delete(chan); }
  }
  discoverySnapshot() { return this._request({ op: 'discovery-snapshot' }); }
  /** R5 `discovery.v2` (DARK): the device interprets its OWN snapshot into
   *  session cards with the shared functions — the server's job shrinks to
   *  cross-machine merging. Capability-gated (unknown ops hang old daemons). */
  async discoveryClaims({ hostId, hostName, forceInline } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('discovery-claims')) throw new Error('daemon lacks discovery-claims (capabilities gate)');
    return this._request({ op: 'discovery-claims', hostId, hostName, forceInline, timeoutMs: 40000 });
  }
  async watchDiscovery(onDirty) { this._onDiscoveryDirty = onDirty; return this._request({ op: 'discovery-watch' }); }

  /** Subscribe the usage-events PUSH stream (R4 finale). onBatch({batch, seq})
   *  fires per chunk; when a chunk carries `seq`, call ackUsageEvents(seq)
   *  AFTER durable ingest — that commits the device-side cursor (two-phase;
   *  an unacked batch re-emits and the server's rid dedup absorbs it). */
  async watchUsageEvents(onBatch) {
    this._onUsageEvents = onBatch;
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('usage-events')) throw new Error('daemon lacks usage-events (capabilities gate)');
    const r = await this._request({ op: 'usage-events-watch', timeoutMs: 20000 });
    if (r?.error) throw new Error(r.error); // an error-ack resolves — never swallow it
    return true;
  }
  /** Push a pool's sealed orders (ranked member snapshot) to the device;
   *  null clears. onExecuted(events) receives fallback switches the device
   *  performed while no orchestrator was reachable — call ackPoolOrdersLog()
   *  after recording them. */
  async poolOrders(orders, onExecuted) {
    if (onExecuted) this._onPoolOrdersExecuted = onExecuted;
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('pool-orders')) throw new Error('daemon lacks pool-orders (capabilities gate)');
    const r = await this._request({ op: 'pool-orders', orders, timeoutMs: 15000 });
    if (r?.error) throw new Error(r.error);
    if (r?.events?.length && this._onPoolOrdersExecuted) this._onPoolOrdersExecuted(r.events);
    return r?.events || [];
  }
  ackPoolOrdersLog() { try { this._conn?.mux?.control({ op: 'pool-orders-log-ack' }); } catch { } }

  ackUsageEvents(seq) {
    try { this._conn?.mux?.control({ op: 'usage-events-ack', seq }); } catch { }
  }
  // ── M4 ──
  /** R1 machine facts (shared src/machine-probes.js runs daemon-side).
   *  Old daemons don't know these ops — callers bound with a timeout and
   *  fall back to the legacy ssh scripts. */
  probeCli() { return this._request({ op: 'probe-cli', timeoutMs: 9000 }); }
  probeCreds() { return this._request({ op: 'probe-creds', timeoutMs: 9000 }); }
  /** R3 transcript.* — run one transcript-service method ON the device and
   *  return the parsed JSON result. The result streams on a byte channel with
   *  the read-range count-gating contract (never resolve on the done marker:
   *  control overtakes data, 2.187.0). DARK: no production consumer yet — the
   *  parity suite is the only caller until the switchover round. */
  async transcriptOp(method, ref, params = {}) {
    const conn = await this.connect();
    const chan = conn.nextChan++;
    const chunks = [];
    let received = 0, sending = null, sentDone = null, doneSeen = false, stall = null;
    let resolveP, rejectP;
    const donePromise = new Promise((res, rej) => { resolveP = res; rejectP = rej; });
    donePromise.catch(() => {});
    const cleanup = () => { clearTimeout(stall); conn.sessions.delete(chan); };
    const bumpStall = () => { clearTimeout(stall); stall = setTimeout(() => { cleanup(); rejectP(new Error('transcript-op stalled')); }, 30000); };
    const maybeFinish = () => {
      if (!doneSeen) return;
      const t = sentDone != null ? (sending != null ? Math.min(sentDone, sending) : sentDone) : sending;
      if (t != null && received >= t) { cleanup(); resolveP(); }
    };
    conn.sessions.set(chan, {
      onData: (b) => { chunks.push(b); received += b.length; bumpStall(); maybeFinish(); },
      onDone: (m) => { doneSeen = true; if (typeof m?.sent === 'number') sentDone = m.sent; maybeFinish(); },
    });
    bumpStall();
    // parse can legitimately take a while on a huge transcript — generous ack timeout
    const ack = await this._request({ op: 'transcript-op', method, ref, params, chan, timeoutMs: 60000 });
    if (ack?.error) { cleanup(); throw new Error(ack.error); }
    if (typeof ack?.sending === 'number') sending = ack.sending;
    else { cleanup(); throw new Error('daemon lacks transcript-op counts'); }
    maybeFinish();
    await donePromise;
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  }
  /** `waitMs` (lane-pairing ⑥): how long THIS side waits for the reply — the daemon kills the child at `timeoutMs`
   *  (capped at 30 s there) and still has to send the result, so a caller that uses the cap itself waits past it. */
  async runCmd(cmd, args = [], { stdin, env, timeoutMs, waitMs } = {}) {
    const { info } = await this.connect();
    const noShell = posixShellRefusal(info, cmd); if (noShell) throw noShell; // lane windows-device-fs: THE DOOR (the device's fact)
    const r = await this._request({ op: 'run-cmd', cmd, args, env, timeoutMs, ...(waitMs ? { waitMs } : {}), stdin64: stdin ? Buffer.from(stdin).toString('base64') : undefined });
    const failed = posixShellFailed(info, cmd, r); if (failed) throw failed; // verify-r1 F1: asked, and it was not there ⇒ named
    return r;
  }
  /** lane-exit-run-output E1: a SHELL LINE run under the interpreter the DEVICE has (cmd.exe on Windows, sh elsewhere —
   *  PURE src/exit-shell.js decides THERE); the reply carries `interpreter`, and `spawnError` when the child never
   *  started. Capability-gated (`run-shell` in the hello-ack): an older daemon only knows the argv form — the caller
   *  falls back to `sh -lc` itself and says which it ran; a daemon is never asked an op it lacks (it would hang). */
  async runShell(line, { env, timeoutMs, waitMs } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('run-shell')) { const e = new Error('daemon lacks run-shell (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    return this._request({ op: 'run-cmd', shell: String(line), env, timeoutMs, ...(waitMs ? { waitMs } : {}) });
  }
  /** streaming argv exec: stdout arrives via onData (byte channel); resolves
   *  {code} at exit. For outputs too large for runCmd (usage-scan NDJSON).
   *  COUNT-GATED like fsReadRange: a NEW daemon's stream-exit carries `sent`
   *  (total stdout bytes) — the resolve holds until that many arrived, so the
   *  credit-gated tail can't be overtaken and silently dropped (truncated
   *  usage harvests / streamed downloads). Old daemons omit it → resolve at
   *  exit as before. A 15s post-exit stall resolves {truncated:true}. */
  async runStream(cmd, args = [], { env, cwd, stdin, onData, timeoutMs } = {}) {
    const { info } = await this.connect();
    const noShell = posixShellRefusal(info, cmd); if (noShell) throw noShell; // lane windows-device-fs: THE DOOR (the device's fact)
    const r = await this._streamOp({ op: 'run-stream', cmd, args, env, cwd, stdin64: stdin ? Buffer.from(stdin).toString('base64') : undefined }, { onData, timeoutMs });
    const failed = posixShellFailed(info, cmd, r); if (failed) throw failed; // verify-r1 F1: asked, and it was not there ⇒ named
    return r;
  }
  /** ONE streaming-op consumer (run-stream + usage-scan): count-gated settle
   *  (stream-exit's `sent` vs received), link-death settles, deadline belt. */
  async _streamOp(req, { onData, timeoutMs = 120000 } = {}) {
    const conn = await this.connect();
    const chan = conn.nextChan++;
    let exitR;
    const done = new Promise((r) => { exitR = r; });
    let received = 0, exitMsg = null, stall = null, settled = false;
    const settle = (extra) => {
      if (settled) return; settled = true;
      clearTimeout(stall); conn.sessions.delete(chan);
      exitR({ code: exitMsg?.code, error: exitMsg?.error, ...(extra || {}) });
    };
    const check = () => {
      if (!exitMsg) return;
      if (typeof exitMsg.sent !== 'number' || received >= exitMsg.sent) return settle();
      clearTimeout(stall); stall = setTimeout(() => settle({ truncated: true }), 15000);
    };
    conn.sessions.set(chan, {
      onData: (b) => { received += b.length; onData?.(b); check(); },
      onExitMsg: (m) => { exitMsg = m; check(); },
      // Link death mid-stream (2.271.0 T1-5): mux.onDead fires onClose/onExit —
      // WITHOUT these the `done` promise NEVER settled, so a single device flap
      // during a usage harvest hung hosts.harvestUsage forever and pinned
      // _harvestBusy true for every host until a server restart.
      onClose: () => settle({ error: 'device link lost' }),
      onExit: () => settle({ error: 'device link lost' }),
    });
    // Overall deadline belt: even absent a clean onClose/onExit (a wedged
    // half-open link that never errors), never leave the caller hanging.
    // `timeoutMs` (default 120 s, every pre-C2 caller): a caller that runs something LONG (the desktop install rung —
    // apt on a small VM) names its own; `timedOut` tells a deadline apart from a real exit (the child is NOT killed —
    // the belt only stops waiting).
    const deadline = setTimeout(() => settle({ error: 'run-stream timed out', timedOut: true }), timeoutMs);
    if (deadline.unref) deadline.unref();
    done.finally?.(() => clearTimeout(deadline));
    const ack = await this._request({ ...req, chan });
    if (ack.error) { conn.sessions.delete(chan); clearTimeout(stall); throw new Error(ack.error); }
    return done;
  }
  /** R4 `usage.scan`: run the daemon's BUNDLED ledger walker (no per-harvest
   *  script ship) — returns {ndjson, cursors, cursorFile}. The device does
   *  NOT persist the cursor; the caller commits it (fsWrite+fsRename) only
   *  after this resolves, i.e. after the full transfer landed (two-phase).
   *  Old daemons never answer unknown ops (they'd hang the request), so gate
   *  on the hello's daemonVersion and throw fast → caller falls back. */
  /** Place a secret file (0600, atomic) on the device — THE sanctioned secret
   *  channel; capability-gated so old daemons fall back to fsWrite+chmod. */
  async placeSecret(remotePath, buf) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('place-secret')) throw new Error('daemon lacks place-secret (capabilities gate)');
    const r = await this._request({ op: 'place-secret', path: remotePath, data: Buffer.from(buf).toString('base64'), timeoutMs: 15000 });
    if (r.error) throw new Error(r.error);
    return r.path;
  }

  /** Human-gated quota refresh executed ON the device (its own token, its own
   *  IP — design §Quota refresh origin). Never called from any scheduler. */
  async watchSessionEvents(cb) {
    // Session-brain step 2: subscribe to the daemon's device-side normalizer
    // stream (dark — the caller compares, it must NOT act on these yet).
    this._onSessionEvents = cb;
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('session-events')) throw new Error('daemon lacks session-events (capabilities gate)');
    await this._request({ op: 'session-events-watch' });
  }

  /** lane-pairing ③ (THREE-TOUCH): the device's own record of its dial outcomes (state/dial-status.json).
   *  Capability-gated — an old daemon does not know the op and would HANG the request (the 2.300.0 rule). */
  async dialStatus() {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('dial-status')) { const e = new Error('daemon lacks dial-status (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'dial-status', timeoutMs: 10000 });
    if (r.error) throw new Error(r.error);
    return r.status || null;
  }

  async sysinfo() {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('sysinfo')) throw new Error('daemon lacks sysinfo (capabilities gate)');
    const r = await this._request({ op: 'sysinfo', timeoutMs: 15000 });
    if (r.error) throw new Error(r.error);
    const { id, op, ...rest } = r;
    return rest;
  }

  /** One OpenCode-serve op on THIS device (S9 remainder piece (e), B-eac2).
   *  The op names and shapes come from the SHARED table src/opencode-remote.js
   *  -- the daemon runs the very same runOpencodeOp() against its own facts,
   *  so `hostId` really is only a transport choice. Capability-gated: an old
   *  daemon that does not know the op would HANG (the 2.300.0 rule). */
  async opencodeServe(action, params = {}, { timeoutMs = 20000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('opencode-serve')) throw new Error('daemon lacks opencode-serve (capabilities gate) -- upgrade the agent on this machine');
    const r = await this._request({ op: 'opencode-serve', action, params, timeoutMs });
    if (r.error) throw new Error(r.error);
    return r.result || {};
  }

  /** One `browser-serve` op on THIS device (agent browser P4, design §7.3 /
   *  D5 (b)): start / status / stop / cdp-url / version of a PROFILE browser
   *  where it runs. The op names and shapes are the SHARED table
   *  src/browser-serve.js — the daemon runs the same runBrowserServeOp()
   *  against its own facts. Capability-gated: an old daemon that does not
   *  know the op would HANG (the 2.300.0 rule), so it is never asked. */
  async browserServe(action, params = {}, { timeoutMs = 90000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('browser-serve')) { const e = new Error('daemon lacks browser-serve (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    // lane browser-admin 2a: the Chrome build list is its own capability — an older agent is never asked (it would refuse
    // the action by name; a start carrying a build it ignores would run its default build), said by name here
    if ((action === 'builds' || (action === 'start' && params && params.browser && params.browser.kind && params.browser.kind !== 'default')) && !conn.info.capabilities.includes('browser-builds')) { const e = new Error('this machine\'s agent cannot list Chrome builds (it predates the list) -- upgrade the agent on this machine'); e.code = 'builds_unsupported'; throw e; }
    // lane remote-profile-start: removing a profile's folder is its own capability — an older agent is never asked (said by name)
    if (action === 'remove' && !conn.info.capabilities.includes('browser-remove')) { const e = new Error('this machine\'s agent cannot remove a profile\'s folder (it predates it) -- upgrade the agent on this machine'); e.code = 'remove_unsupported'; throw e; }
    const r = await this._request({ op: 'browser-serve', action, params, timeoutMs });
    if (r.error) throw new Error(r.error);
    return r.result || {};
  }

  /** One `desktop-serve` op on THIS device (desktop apps lane C1, docs/design-desktop-apps-seamless §3.5): facts /
   *  launch / stop / status / list / windows / fit / keep-alive / relaunch of a desktop application WHERE it runs. The
   *  op names and shapes are the SHARED table src/desktop-serve.js — the daemon runs the same runDesktopServeOp()
   *  against its own machine keeper. Capability-gated: an old daemon that does not know the op would HANG (the
   *  2.300.0 rule), so it is never asked — refused by name `host_needs_daemon`. */
  async desktopServe(action, params = {}, { timeoutMs = 60000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('desktop-serve')) { const e = new Error('daemon lacks desktop-serve (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    // Layer 0 apps (docs/design-app-persistence.zh.md §3.1): the app-* actions are asked only of a daemon whose hello-ack
    // names `app-install` — an agent that predates them would refuse them by name, but the GATE is the capability
    if (/^app-/.test(String(action)) && !conn.info?.capabilities?.includes?.('app-install')) { const e = new Error('daemon lacks app-install (capabilities gate) -- upgrade the agent on this machine to install apps there'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'desktop-serve', action, params, timeoutMs });
    if (r.error) throw new Error(r.error);
    return r.result || {};
  }

  /** Full process table (System panel process manager, 2.354.0). */
  async procList({ max } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('proc-list')) throw new Error('daemon lacks proc-list (capabilities gate)');
    const r = await this._request({ op: 'proc-list', max, timeoutMs: 15000 });
    if (r.error) throw new Error(r.error);
    const { id, op, ...rest } = r;
    return rest;
  }

  /** Post one message into a conversation whose CLI runs on THIS device
   *  (2.362.0 cross-machine delivery rung). */
  async peerPost({ cid, text }) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('peer-post')) throw new Error('daemon lacks peer-post (capabilities gate)');
    const r = await this._request({ op: 'peer-post', cid, text, timeoutMs: 15000 });
    if (r.error) throw new Error(r.error);
    const { id, op, ...rest } = r;
    return rest;
  }

  async quotaRefresh({ subDir = null, humanGated = false } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('quota-refresh')) throw new Error('daemon lacks quota-refresh (capabilities gate)');
    const r = await this._request({ op: 'quota-refresh', subDir, humanGated, timeoutMs: 40000 });
    if (r.error) throw new Error(r.error);
    return { usage: r.usage, roles: r.roles, passive: r.passive || null };
  }

  async usageScan({ cursorFile } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('usage-scan')) throw new Error('daemon lacks usage-scan (capabilities gate)');
    const chunks = [];
    const r = await this._streamOp({ op: 'usage-scan', cursorFile }, { onData: (buf) => chunks.push(buf) });
    if (r.error) throw new Error(r.error);
    if (r.truncated) throw new Error('usage-scan stream truncated');
    if (r.code !== 0) throw new Error('usage-scan exit ' + r.code);
    const lines = Buffer.concat(chunks).toString('utf-8').split('\n').filter((l) => l.trim());
    let cursors = null, cf = null;
    if (lines.length) {
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        if (last && last.__cursors__) { cursors = last.__cursors__; cf = last.__cursorFile__ || null; lines.pop(); }
      } catch { }
    }
    if (!cursors) throw new Error('usage-scan output missing cursor manifest');
    return { ndjson: lines.length ? lines.join('\n') + '\n' : '', cursors, cursorFile: cf };
  }

  /** loopback TCP forward on the device: returns {write, close, onData, onClose}. */
  async tcpForward(port, host) {
    const conn = await this.connect();
    const chan = conn.nextChan++;
    const handle = { chan, onData: null, onClose: null };
    conn.sessions.set(chan, { onData: (b) => handle.onData?.(b), onClose: () => handle.onClose?.() });
    // host defaults to loopback on the device; an explicit host reaches the
    // device's LAN (a user-driven forward to another internal machine)
    await this._request({ op: 'tcp-connect', port, chan, ...(host && host !== '127.0.0.1' ? { host } : {}) });
    handle.write = (b) => conn.mux.data(chan, Buffer.isBuffer(b) ? b : Buffer.from(b));
    handle.close = () => { conn.sessions.delete(chan); conn.mux.closeChan(chan); };
    return handle;
  }

  // ── REVERSE forward (the tunnel primitive, "互挂云盘"): the daemon binds
  // 127.0.0.1:<port> ON THE DEVICE; every accepted connection is pushed back
  // here and piped into connectLocal() (usually our own HTTP port). NAT-proof
  // by construction — the bytes ride whatever link the device already has
  // (ssh stdio or wss dial-out). Registration survives reconnects. ──
  async reverseForward({ port = 0, connectLocal }) {
    const ack = await this._request({ op: 'tcp-listen', port });
    this._reverseForwards.set(ack.port, connectLocal);
    return { port: ack.port };
  }
  async reverseUnforward(port) {
    this._reverseForwards.delete(port);
    try { await this._request({ op: 'tcp-unlisten', port }); } catch { }
  }

  // ── device-folder-mount: serve a device folder over HTTP (the daemon binds
  // 127.0.0.1:<port>), returns {port}. The server tcp-forwards that port and
  // rclone-http-mounts it. unserveFolder tears the server down. ──
  serveFolder(path) { return this._request({ op: 'serve-folder', path }); }
  unserveFolder(port) { return this._request({ op: 'unserve-folder', port }); }

  // on-demand egress: the device serves a SOCKS5 proxy on its loopback, the
  // server reaches it via tcpForward (the exit-proxy shape). CONNECT only.
  serveSocks() { return this._request({ op: 'serve-socks' }); }
  unserveSocks(port) { return this._request({ op: 'unserve-socks', port }); }
  _onTcpAccept(m) {
    const conn = this._conn;
    if (!conn) return;
    const mkLocal = this._reverseForwards.get(m.port);
    const reject = () => { try { conn.mux.closeChan(m.chan); } catch { } };
    if (!mkLocal) return reject();
    let sock;
    try { sock = mkLocal(); } catch { return reject(); }
    const { mux, sessions } = conn;
    sessions.set(m.chan, {
      manualCredit: true, // credit as the local socket truly drains
      onData: (b) => {
        let ok = false; try { ok = sock.write(b); } catch { }
        if (ok) mux.credit(m.chan, b.length);
        else sock.once('drain', () => { try { mux.credit(m.chan, b.length); } catch { } });
      },
      onClose: () => { try { sock.destroy(); } catch { } },
      onWritable: () => { try { sock.resume(); } catch { } },
    });
    sock.on('data', (d) => { try { if (!mux.data(m.chan, d)) sock.pause(); } catch { } });
    sock.on('close', () => { if (sessions.delete(m.chan)) { try { mux.closeChan(m.chan); } catch { } } });
    sock.on('error', () => { });
  }

  /** Is the device answering on THIS link right now? (a bounded mux ping; false when not connected) */
  ping(ms = 1500) { const mux = this._conn?.mux; return mux ? mux.ping(ms) : Promise.resolve(false); }
  stop() { this._stopped = true; this._conn?.mux?.destroy(); this._conn = null; }
}

module.exports = { posixShellRefusal, posixShellFailed, DeviceManager };
