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

class DeviceManager {
  /**
   * @param {object} opts
   *  dataDir      server data/ (token hash store)
   *  bundlePath   built single-file daemon (data/bin/vibespace-agentd.js)
   *  version      release version (= daemonVersion expected)
   *  log          logger fn
   */
  constructor({ dataDir, bundlePath, version, nodeModules, transport, log = console.log } = {}) {
    this._tokFile = path.join(dataDir, 'agentd-tokens.json');
    this._bundlePath = bundlePath;
    this._version = version;
    this._nodeModules = nodeModules || null; // so the daemon can require node-pty (M1 localhost)
    this._log = log;
    this._root = process.env.VIBESPACE_AGENTD_ROOT || path.join(os.homedir(), '.vibespace', 'agentd');
    this._state = path.join(this._root, 'state');
    this._sock = path.join(this._state, 'agentd.sock');
    // Transport (M2): { kind:'local' } = unix socket on this machine; or
    // { kind:'ssh', host, remoteAgentd, sshArgs } = dial the STANDING remote
    // daemon over `ssh … -- node <remoteAgentd> --stdio` (the bridge). Default
    // local keeps M0/M1 unchanged.
    this._transport = transport || { kind: 'local' };
    this._tokenId = this._transport.kind === 'ssh' ? ('host:' + (this._transport.host?.id || 'remote')) : 'local';
    this._conn = null;         // {mux, info}
    this._backoffIdx = 0;
    this._connecting = false;
    this._stopped = false;
    try { this._tokens = JSON.parse(fs.readFileSync(this._tokFile, 'utf-8')); } catch { this._tokens = {}; }
  }

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
    if (!raw) {
      raw = 'vsht_' + crypto.randomBytes(24).toString('hex');
      fs.writeFileSync(devTok, raw, { mode: 0o600 });
    }
    const sha = crypto.createHash('sha256').update(raw).digest('hex');
    if (this._tokens.local !== sha) {
      this._tokens.local = sha;
      try { fs.writeFileSync(this._tokFile, JSON.stringify(this._tokens, null, 2), { mode: 0o600 }); } catch { }
    }
    return raw;
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
    const child = spawn(process.execPath, [path.join(this._root, 'current', 'agentd.js')], {
      detached: true, stdio: 'ignore',
      env: { ...process.env, ...(this._nodeModules ? { VIBESPACE_NODE_MODULES: this._nodeModules } : {}) },
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
    const token = this._transport.kind === 'ssh' ? this._transport.hostToken : this._ensureLocalToken();
    const backoffs = [500, 1000, 2000, 5000];
    for (let attempt = 0; !this._stopped; attempt++) {
      const conn = await this._tryOnce(token).catch(() => null);
      if (conn) { this._backoffIdx = 0; return conn; }
      if (attempt === 0 && this._transport.kind === 'local') this._spawnLocal(); // local: bring the daemon up (ssh bridge self-spawns the remote one)
      const delay = backoffs[Math.min(attempt, backoffs.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
      if (attempt > 12) throw new Error('agentd: cannot reach the local daemon');
    }
    throw new Error('stopped');
  }

  _openTransport() {
    if (this._transport.kind === 'ssh') {
      const t = this._transport;
      const remoteCmd = t.remoteCmd || `node ${JSON.stringify(t.remoteAgentd)} --stdio`;
      const child = spawn(t.sshBin || 'ssh', [...t.sshArgs, '--', remoteCmd], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
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
      let settled = false;
      const fail = (e) => { if (!settled) { settled = true; try { sock.destroy(); } catch { } reject(e || new Error('connect failed')); } };
      sock.on('error', fail);
      const timer = setTimeout(() => fail(new Error('handshake timeout')), 8000);
      const mux = new Mux(sock, {
        onControl: (msg) => {
          if (msg.op === 'hello-ack') {
            clearTimeout(timer);
            if (msg.daemonVersion !== this._version && fs.existsSync(this._bundlePath)) {
              // version drift → stream the new bundle (self-upgrade), then reconnect
              this._log(`[agentd] daemon ${msg.daemonVersion} ≠ ${this._version} — upgrading`);
              this._upgrade(mux).then(() => {
                settled = true;
                try { sock.destroy(); } catch { }
                setTimeout(() => resolve(this._connectLoop()), 700); // re-exec window
              }).catch(fail);
              return;
            }
            mux.control({ op: 'ok' });
            settled = true;
            const sessions = new Map(); // chan → { onData, onExit }
            const pending = new Map();  // id → resolve (fs/discovery/cmd/tcp acks)
            this._conn = { mux, info: msg, sessions, pending, nextChan: 2, nextId: 1 };
            // route byte-channel data + session control to the session handlers
            mux.onData = (chan, buf) => { sessions.get(chan)?.onData?.(buf); mux.credit(chan, buf.length); };
            const prevControl = mux.onControl;
            mux.onControl = (m) => {
              if (m.op === 'fs-result' || m.op === 'discovery-result' || m.op === 'discovery-watching' || m.op === 'cmd-result' || m.op === 'tcp-open') {
                const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); } 
                if (m.op === 'tcp-open' && !m.error) return; // channel stays live
                return;
              }
              if (m.op === 'fs-done') { sessions.get(m.chan)?.onDone?.(m); return; }
              if (m.op === 'tcp-close') { const h = sessions.get(m.chan); sessions.delete(m.chan); h?.onClose?.(); return; }
              if (m.op === 'discovery-dirty') { this._onDiscoveryDirty?.(); return; }
              if (m.op === 'session-open' || m.op === 'pipe-session-open') { sessions.get(m.chan)?.onOpen?.(m); return; }
              if (m.op === 'session-exit') { const h = sessions.get(m.chan); sessions.delete(m.chan); h?.onExit?.(m.code); return; }
              if (m.op === 'session-error') { const h = sessions.get(m.chan); sessions.delete(m.chan); h?.onError?.(m.error); return; }
              prevControl(m);
            };
            mux.onDead = () => { this._conn = null; this._log('[agentd] connection lost'); };
            resolve(this._conn);
            return;
          }
          if (msg.op === 'auth-fail') fail(new Error('agentd auth failed — token mismatch'));
          if (msg.op === 'proto-mismatch') fail(new Error('agentd protocol mismatch'));
        },
        onDead: () => fail(new Error('connection died during handshake')),
      });
      const sayHello = () => mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: token, serverVersion: this._version });
      if (this._transport.kind === 'ssh') sayHello(); // stdio is ready at spawn
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
        else origOnControl(msg);
      };
      mux.control({ op: 'upgrade', version: this._version, size: bundle.length });
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
    const chan = conn.nextChan++;
    const handle = { chan, onData: null, onExit: null };
    let resolveReady, rejectReady;
    handle.ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
    conn.sessions.set(chan, {
      onOpen: (m) => { handle.pid = m.pid; resolveReady({ pid: m.pid }); },
      onError: (e) => rejectReady(new Error(e)),
      onData: (buf) => handle.onData?.(buf),
      onExit: (code) => handle.onExit?.(code),
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
    const chan = conn.nextChan++;
    const handle = { chan, sid, onData: null, onExit: null };
    let resolveReady, rejectReady;
    handle.ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
    conn.sessions.set(chan, {
      onOpen: (m) => { handle.pid = m.pid; resolveReady({ pid: m.pid, existing: !!m.existing, exited: m.exited }); },
      onError: (e) => rejectReady(new Error(e)),
      onData: (buf) => handle.onData?.(buf),
      onExit: (code) => handle.onExit?.(code),
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
      conn.pending.set(id, (m) => (m.error ? reject(new Error(m.error)) : resolve(m)));
      conn.mux.control({ ...payload, id });
      setTimeout(() => { if (conn.pending.delete(id)) reject(new Error(payload.op + ' timeout')); }, payload.timeoutMs || 30000);
    });
  }

  // ── M3 ──
  fsStat(p) { return this._request({ op: 'fs-op', action: 'stat', path: p }); }
  fsList(p) { return this._request({ op: 'fs-op', action: 'list', path: p }); }
  fsWrite(p, buf) { return this._request({ op: 'fs-op', action: 'write', path: p, data64: Buffer.from(buf).toString('base64') }); }
  fsMkdir(p) { return this._request({ op: 'fs-op', action: 'mkdir', path: p }); }
  fsRm(p, recursive = false) { return this._request({ op: 'fs-op', action: 'rm', path: p, recursive }); }
  /** read [start, start+len) — resolves a Buffer (the transcript-slab primitive). */
  async fsReadRange(p, start, len) {
    const conn = await this.connect();
    const chan = conn.nextChan++;
    const chunks = [];
    let done;
    const donePromise = new Promise((r) => { done = r; });
    conn.sessions.set(chan, { onData: (b) => chunks.push(b), onDone: () => { conn.sessions.delete(chan); done(); } });
    const ack = await this._request({ op: 'fs-op', action: 'read-range', path: p, start, len, chan });
    await donePromise;
    return { size: ack.size, data: Buffer.concat(chunks) };
  }
  discoverySnapshot() { return this._request({ op: 'discovery-snapshot' }); }
  async watchDiscovery(onDirty) { this._onDiscoveryDirty = onDirty; return this._request({ op: 'discovery-watch' }); }
  // ── M4 ──
  runCmd(cmd, args = [], { stdin, env, timeoutMs } = {}) {
    return this._request({ op: 'run-cmd', cmd, args, env, timeoutMs, stdin64: stdin ? Buffer.from(stdin).toString('base64') : undefined });
  }
  /** loopback TCP forward on the device: returns {write, close, onData, onClose}. */
  async tcpForward(port) {
    const conn = await this.connect();
    const chan = conn.nextChan++;
    const handle = { chan, onData: null, onClose: null };
    conn.sessions.set(chan, { onData: (b) => handle.onData?.(b), onClose: () => handle.onClose?.() });
    await this._request({ op: 'tcp-connect', port, chan });
    handle.write = (b) => conn.mux.data(chan, Buffer.isBuffer(b) ? b : Buffer.from(b));
    handle.close = () => { conn.sessions.delete(chan); conn.mux.closeChan(chan); };
    return handle;
  }

  stop() { this._stopped = true; this._conn?.mux?.destroy(); this._conn = null; }
}

module.exports = { DeviceManager };
