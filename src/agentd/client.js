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
  constructor({ dataDir, bundlePath, version, log = console.log } = {}) {
    this._tokFile = path.join(dataDir, 'agentd-tokens.json');
    this._bundlePath = bundlePath;
    this._version = version;
    this._log = log;
    this._root = process.env.VIBESPACE_AGENTD_ROOT || path.join(os.homedir(), '.vibespace', 'agentd');
    this._state = path.join(this._root, 'state');
    this._sock = path.join(this._state, 'agentd.sock');
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
      detached: true, stdio: 'ignore', env: { ...process.env },
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
    const token = this._ensureLocalToken();
    const backoffs = [500, 1000, 2000, 5000];
    for (let attempt = 0; !this._stopped; attempt++) {
      const conn = await this._tryOnce(token).catch(() => null);
      if (conn) { this._backoffIdx = 0; return conn; }
      if (attempt === 0) this._spawnLocal(); // not running — bring it up
      const delay = backoffs[Math.min(attempt, backoffs.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
      if (attempt > 12) throw new Error('agentd: cannot reach the local daemon');
    }
    throw new Error('stopped');
  }

  _tryOnce(token) {
    return new Promise((resolve, reject) => {
      const sock = net.connect(this._sock);
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
            this._conn = { mux, info: msg };
            mux.onDead = () => { this._conn = null; this._log('[agentd] connection lost'); };
            // rebind: Mux constructor took our handlers; onDead replacement above
            resolve(this._conn);
            return;
          }
          if (msg.op === 'auth-fail') fail(new Error('agentd auth failed — token mismatch'));
          if (msg.op === 'proto-mismatch') fail(new Error('agentd protocol mismatch'));
        },
        onDead: () => fail(new Error('connection died during handshake')),
      });
      sock.on('connect', () => {
        mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: token, serverVersion: this._version });
      });
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

  stop() { this._stopped = true; this._conn?.mux?.destroy(); this._conn = null; }
}

module.exports = { DeviceManager };
