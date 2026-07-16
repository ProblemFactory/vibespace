/**
 * PortForwardManager (B-0b60, the tunnel path) — vscode-style port forwarding
 * over the EXISTING agentd data plane. A machine (dial OR ssh) running the
 * device daemon exposes its loopback services; we bind a local 127.0.0.1 port
 * and pipe every connection into `device.tcpForward(remotePort)` (the same
 * mux primitive VNC + device-folder-mount already use), so a dev server on the
 * machine's 127.0.0.1:5173 becomes reachable at http://127.0.0.1:<localPort>
 * on THIS instance — NAT-proof, no public exposure, no frps.
 *
 * frps/frpc (PUBLIC internet exposure of a local port) is a DIFFERENT, deferred
 * path that needs the reverse-proxy server infra — see backlog B-0b60. This
 * manager is the private/tunnel half and reuses only verified primitives.
 *
 * Persistence: data/port-forwards.json — desired forwards re-established on
 * boot + when a machine (re)links.
 */
'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');

const LOCAL_ID = '__local__'; // machine #0 — this instance itself
const PORT_SCAN = `command -v ss >/dev/null 2>&1 && ss -tlnH 2>/dev/null || lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null`;
// local-watch noise: our own infrastructure listeners must not toast
const LOCAL_IGNORE_PROCS = new Set(['frpc', 'frps', 'tailscaled', 'sshd', 'rclone', 'Xtigervnc', 'Xvfb']);

function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

class PortForwardManager {
  /** @param deps { hosts, dataDir, broadcast, log, plugins, serverSetting } */
  constructor({ hosts, dataDir, broadcast, log, plugins, serverSetting }) {
    this.hosts = hosts;
    this.plugins = plugins || null; // PluginManager — for frp public exposure
    this.serverSetting = serverSetting || (() => undefined);
    this.file = path.join(dataDir, 'port-forwards.json');
    this.broadcast = broadcast || (() => {});
    this.log = log || (() => {});
    this._live = new Map(); // id → { server, sockets:Set, rec }
    try { this._state = JSON.parse(fs.readFileSync(this.file, 'utf-8')); } catch { this._state = { forwards: [] }; }
    if (!Array.isArray(this._state.forwards)) this._state.forwards = [];
    // vscode-style NEW-port watch: sweep machines with a LIVE device link and
    // announce listeners that appeared since the last sweep (the machine's
    // first sweep is a silent baseline). Never opens a connection just to
    // watch: dial machines are checked only while dialed-in (device() fails
    // fast offline), ssh machines only while a device link already exists.
    this._seenPorts = new Map(); // hostId → Set(port)
    this._watch = setInterval(() => this._watchSweep().catch(() => {}), 30000);
    if (this._watch.unref) this._watch.unref();
  }

  /** One watch pass over linked machines; new listeners broadcast as
   *  machine-ports-new. Ephemeral ports (>32767) and ports already forwarded
   *  are ignored. Gated by setting ports.watchNew (default on). */
  async _watchSweep() {
    try { const v = this.serverSetting('ports.watchNew'); if (v !== undefined && !v) return; } catch { }
    let all = [];
    try { all = (this.hosts.list?.() || []); } catch { return; }
    // machine #0 first — the instance itself is the PRIMARY workspace (a dev
    // server started in a local terminal is the flagship vscode case)
    const targets = [{ id: LOCAL_ID, name: 'This machine', transport: 'local' }, ...all];
    for (const h of targets) {
      if (!h || !h.id) continue;
      if (h.transport !== 'dial' && h.transport !== 'local') {
        // ssh: watch only over an ALREADY-connected device link
        let linked = false;
        try { linked = !!this.hosts._devices?.get(h.id)?.status().connected; } catch { }
        if (!linked) continue;
      }
      let ports;
      try { ports = await this.detect(h.id); } catch { continue; } // offline / no link — keep the old baseline
      const interesting = ports.filter((p) => p.port > 0 && p.port <= 32767);
      const cur = new Set(interesting.map((p) => p.port));
      const prev = this._seenPorts.get(h.id);
      this._seenPorts.set(h.id, cur);
      if (!prev) continue; // baseline sweep — silent
      const fwd = new Set(this._state.forwards.filter((r) => r.hostId === h.id).map((r) => r.remotePort));
      let fresh = interesting.filter((p) => !prev.has(p.port) && !fwd.has(p.port));
      // local: our own infrastructure (frpc admin, tailscale, VNC, …) must
      // not toast when a plugin starts after the baseline
      if (h.id === LOCAL_ID) fresh = fresh.filter((p) => !LOCAL_IGNORE_PROCS.has(p.proc) && p.port !== 7400);
      if (fresh.length) {
        this.log(`new port(s) on ${h.name || h.id}: ${fresh.map((p) => p.port + (p.proc ? '(' + p.proc + ')' : '')).join(', ')}`);
        this.broadcast?.({ type: 'machine-ports-new', hostId: h.id, hostName: h.name || h.id, ports: fresh });
      }
    }
  }

  _persist() { try { writeJsonAtomic(this.file, this._state); } catch (e) { this.log('port-forward persist: ' + e.message); } }

  _emit() {
    this.broadcast?.({ type: 'port-forwards-updated', forwards: this.list() });
  }

  list() {
    return this._state.forwards.map((r) => ({
      id: r.id, hostId: r.hostId, remotePort: r.remotePort, label: r.label || '',
      localPort: this._live.get(r.id)?.rec?.localPort || null,
      url: this._live.get(r.id)?.rec?.localPort ? `http://127.0.0.1:${this._live.get(r.id).rec.localPort}/` : null,
      active: this._live.has(r.id), error: r.error || null,
      // public (frp relay) exposure, if published
      publicUrl: r.publicUrl || null, published: !!r.publicUrl,
    }));
  }

  /** Detect listening TCP ports on a machine (dial or ssh) over the device
   *  link. Loopback + all-interface listeners only; returns [{port, proc}]. */
  async detect(hostId) {
    if (hostId === LOCAL_ID) return this.detectLocal();
    const dm = await this.hosts.device(hostId);
    // Linux: `ss -tlnH`; macOS/BSD: `lsof`. Try ss first, fall back to lsof.
    // -H (no header) is GNU-ss only, so parse defensively either way.
    let out = '';
    try { out = String((await dm.runCmd('sh', ['-c', PORT_SCAN], { timeoutMs: 8000 })).stdout || ''); } catch (e) { throw new Error('port scan failed: ' + e.message); }
    return this._parsePorts(out);
  }

  /** Listening ports on THIS instance (machine #0) — no device link needed;
   *  the pod/host VibeSpace itself runs on is the primary workspace. */
  async detectLocal() {
    const { execFile } = require('child_process');
    const out = await new Promise((resolve) => {
      execFile('sh', ['-c', PORT_SCAN], { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(String(stdout || '')));
    });
    return this._parsePorts(out);
  }

  _parsePorts(out) {
    const found = new Map(); // port → proc
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      // lsof line (match FIRST — its distinctive `(LISTEN)` suffix; an ss-style
      // IP:port pattern also matches inside an lsof line, so order matters):
      //   node  1234 user  22u  IPv4 ...  TCP 127.0.0.1:5173 (LISTEN)
      const lsof = line.match(/^(\S+)\s.*:(\d+)\s+\(LISTEN\)\s*$/);
      if (lsof) {
        const port = Number(lsof[2]);
        if (port && !found.has(port)) found.set(port, lsof[1]);
        continue;
      }
      // ss line:  LISTEN 0 511 127.0.0.1:5173 0.0.0.0:*   users:(("node",pid=...))
      const ss = line.match(/(?:^|\s)(?:\[[0-9a-f:]+\]|\d+\.\d+\.\d+\.\d+|\*|\[::\]):(\d+)\s/);
      if (ss) {
        const port = Number(ss[1]);
        const proc = (line.match(/"([^"]+)"/) || [])[1] || '';
        if (port && !found.has(port)) found.set(port, proc);
      }
    }
    return [...found.entries()]
      .map(([port, proc]) => ({ port, proc }))
      .filter((p) => p.port > 0 && p.port < 65536)
      .sort((a, b) => a.port - b.port);
  }

  /** Start a forward (idempotent by hostId+remotePort). Binds a local port and
   *  pipes each connection into device.tcpForward(remotePort). */
  async forward(hostId, remotePort, { label = '' } = {}) {
    remotePort = Number(remotePort);
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) throw new Error('invalid remote port');
    let rec = this._state.forwards.find((r) => r.hostId === hostId && r.remotePort === remotePort);
    if (!rec) { rec = { id: 'pf-' + hostId + '-' + remotePort, hostId, remotePort, label }; this._state.forwards.push(rec); this._persist(); }
    else if (label) { rec.label = label; this._persist(); }
    await this._start(rec);
    this._emit();
    return this.list().find((r) => r.id === rec.id);
  }

  async _start(rec) {
    if (this._live.has(rec.id)) return this._live.get(rec.id).rec;
    if (rec.hostId === LOCAL_ID) {
      // machine #0: the service ALREADY listens on this instance's loopback —
      // no tunnel or local server needed; the record is the handle that lets
      // the dialog Open it (browser proxy) and Publish it (frp)
      rec.error = null;
      this._live.set(rec.id, { server: null, sockets: new Set(), rec: { ...rec, localPort: rec.remotePort } });
      return { ...rec, localPort: rec.remotePort };
    }
    // reachable machine first — fail loud so the UI can say "device offline"
    await this.hosts.device(rec.hostId); // throws if offline
    const sockets = new Set();
    const server = net.createServer({ allowHalfOpen: true }, async (sock) => {
      sockets.add(sock);
      sock.on('close', () => sockets.delete(sock));
      sock.on('error', () => { try { sock.destroy(); } catch {} });
      let h;
      try {
        // resolve the device PER CONNECTION, never capture it: a dial device's
        // re-dial stop()s the old DeviceManager, so a captured one turns every
        // later connection into an instant failure while onMachineLinked skips
        // the "already live" forward — the forward looked up but was dead
        // (review finding, high). hosts.device() returns the cached live dm in
        // the steady state, so this costs nothing.
        const dm = await this.hosts.device(rec.hostId);
        h = await dm.tcpForward(rec.remotePort);
      } catch { try { sock.destroy(); } catch {} return; }
      if (sock.destroyed) { try { h.close(); } catch {} return; } // browser aborted while the tunnel opened
      h.onData = (b) => { try { sock.write(b); } catch {} };
      h.onClose = () => { try { sock.end(); } catch {} };
      sock.on('data', (b) => { try { h.write(b); } catch {} });
      sock.on('close', () => { try { h.close(); } catch {} });
    });
    const localPort = await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    rec.error = null;
    this._live.set(rec.id, { server, sockets, rec: { ...rec, localPort } });
    this.log(`port-forward ${rec.id}: 127.0.0.1:${localPort} → ${rec.hostId}:${rec.remotePort}`);
    return { ...rec, localPort };
  }

  /** Tear down a forward and forget it. */
  async unforward(id) {
    const rec = this._state.forwards.find((r) => r.id === id);
    if (rec?.publicUrl && this.plugins) { try { await this.plugins.frpUnpublish(rec.publicName || id); } catch {} }
    const l = this._live.get(id);
    if (l) {
      for (const s of l.sockets) { try { s.destroy(); } catch {} }
      try { l.server.close(); } catch {}
      this._live.delete(id);
    }
    this._state.forwards = this._state.forwards.filter((r) => r.id !== id);
    this._persist();
    this._emit();
  }

  /** Publish an ACTIVE forward to the public internet via the frp relay. */
  async publish(id) {
    if (!this.plugins) throw new Error('public URLs are not available on this instance');
    const rec = this._state.forwards.find((r) => r.id === id);
    if (!rec) throw new Error('no such forward');
    const l = this._live.get(id);
    if (!l?.rec?.localPort) await this._start(rec); // ensure a local port exists
    const localPort = this._live.get(id)?.rec?.localPort;
    if (!localPort) throw new Error('the forward is not active (is the machine online?)');
    const r = await this.plugins.frpPublish(id, localPort, { preferPort: rec.publicPort || 0, preferSub: rec.publicSub || '' });
    rec.publicUrl = r.url; rec.publicName = r.name; rec.publicPort = r.remotePort; rec.publicSub = r.subdomain || null;
    this._persist(); this._emit();
    return { publicUrl: r.url };
  }

  async unpublish(id) {
    const rec = this._state.forwards.find((r) => r.id === id);
    if (!rec) return;
    try { if (this.plugins) await this.plugins.frpUnpublish(rec.publicName || id); } catch { }
    rec.publicUrl = null; rec.publicName = null; rec.publicPort = null;
    this._persist(); this._emit();
  }

  /** Re-establish persisted forwards (boot / machine relink). Best-effort;
   *  an offline machine's forward stays recorded and retries on next link. */
  async restore() {
    for (const rec of this._state.forwards) {
      if (this._live.has(rec.id)) continue;
      // re-publish REUSES the persisted subdomain/port (preferSub/preferPort) —
      // regenerating them on every server restart silently broke previously
      // shared public URLs (review finding)
      try { await this._start(rec); if (rec.publicUrl && this.plugins) { try { const r = await this.plugins.frpPublish(rec.id, this._live.get(rec.id).rec.localPort, { preferPort: rec.publicPort || 0, preferSub: rec.publicSub || '' }); rec.publicUrl = r.url; rec.publicName = r.name; rec.publicPort = r.remotePort; rec.publicSub = r.subdomain || null; } catch (e) { this.log('re-publish ' + rec.id + ': ' + e.message); } } } catch (e) { rec.error = e.message; }
    }
    this._persist();
    this._emit();
  }

  /** A machine (re)linked — bring up any of its recorded forwards. */
  async onMachineLinked(hostId) {
    for (const rec of this._state.forwards) {
      if (rec.hostId !== hostId || this._live.has(rec.id)) continue;
      try { await this._start(rec); rec.error = null; } catch (e) { rec.error = e.message; }
    }
    this._emit();
  }

  /** A machine was unpaired/removed — drop its forwards. */
  onMachineUnpaired(hostId) {
    for (const rec of this._state.forwards.filter((r) => r.hostId === hostId)) {
      // unpublish FIRST — dropping the record without frpUnpublish left the
      // public relay proxy live (pointing at a freed loopback port) with no
      // UI handle left to ever remove it (review finding, high)
      if (rec.publicUrl && this.plugins) { this.plugins.frpUnpublish(rec.publicName || rec.id).catch(() => {}); }
      const l = this._live.get(rec.id);
      if (l) { for (const s of l.sockets) { try { s.destroy(); } catch {} } try { l.server.close(); } catch {} this._live.delete(rec.id); }
    }
    this._state.forwards = this._state.forwards.filter((r) => r.hostId !== hostId);
    this._persist();
    this._emit();
  }
}

module.exports = { PortForwardManager };
