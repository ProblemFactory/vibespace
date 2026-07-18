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
const { probeProto } = require('./plugins');

const LOCAL_ID = '__local__'; // machine #0 — this instance itself
// -p adds process names (own-user processes always visible; drop it if the ss
// build errors). macOS/BSD: lsof (its first column IS the command name).
const PORT_SCAN = `command -v ss >/dev/null 2>&1 && { ss -tlnpH 2>/dev/null || ss -tlnH 2>/dev/null; } || lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null`;
// local-watch noise: our own infrastructure listeners must not toast
const LOCAL_IGNORE_PROCS = new Set(['frpc', 'frps', 'tailscaled', 'sshd', 'rclone', 'Xtigervnc', 'Xvfb']);
// Known NON-web system listeners (vscode-style): still returned by detect(),
// but flagged `hidden` — the ports UIs fold them behind a "system listeners"
// expander and the new-port watch never notifies about them. DB servers
// (postgres/mysql/redis) are deliberately NOT here — forwarding one is a real
// use case. lsof truncates macOS names (ControlCe = ControlCenter/AirPlay).
const NONWEB_PROCS = new Set([
  'sshd', 'systemd', 'systemd-resolve', 'systemd-resolved', 'systemd-networkd', 'init', 'launchd',
  'dnsmasq', 'cupsd', 'cups-browsed', 'rpcbind', 'rpc.statd', 'chronyd', 'ntpd', 'master', 'exim4',
  'sendmail', 'smbd', 'nmbd', 'avahi-daemon', 'dtach', 'frpc', 'frps', 'tailscaled', 'vibespace-device',
  'Xtigervnc', 'Xvfb', 'x11vnc', 'dockerd', 'containerd', 'kubelet', 'rapportd', 'ControlCe', 'identityse', 'remoted',
]);
const NONWEB_PORTS = new Set([22, 25, 53, 111, 631]);

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
    this._protoCache = new Map(); // `${hostId}:${port}` → { proto, ts }
    this._watch = setInterval(() => this._watchSweep().catch(() => {}), 30000);
    if (this._watch.unref) this._watch.unref();
  }

  /** Probe what a machine's port speaks (http / https / tcp) — local ports
   *  directly, remote ports through a fresh device-tunnel stream per pass.
   *  Cached 5 min per host:port (the panel re-renders often). */
  async probeHostPort(hostId, port, { fresh = false, targetHost = '' } = {}) {
    const key = `${hostId}:${targetHost || ''}:${port}`;
    const hit = this._protoCache.get(key);
    if (!fresh && hit && Date.now() - hit.ts < 5 * 60 * 1000) return hit.proto;
    const lan = targetHost && targetHost !== '127.0.0.1' && targetHost !== 'localhost' ? targetHost : null;
    let proto;
    try {
      proto = hostId === LOCAL_ID
        // LAN target from THIS instance → probe targetHost:port directly (the
        // service is NOT on loopback; probing loopback mislabeled it TCP)
        ? (lan ? await probeProto({ connect: () => this._localSocket(lan, port) }, { timeoutMs: 1800 })
               : await probeProto(port, { timeoutMs: 1800 }))
        : await probeProto({ connect: () => this._remoteSocket(hostId, port, targetHost) }, { timeoutMs: 2500 });
    } catch { return hit?.proto || null; } // unreachable — keep last knowledge
    this._protoCache.set(key, { proto, ts: Date.now() });
    return proto;
  }

  /** A fresh direct TCP socket to <host>:<port> from THIS instance (used to
   *  probe a LAN/Tailscale target of a local forward). */
  _localSocket(host, port) {
    return new Promise((resolve, reject) => {
      const s = net.connect({ host, port });
      s.once('connect', () => resolve(s));
      s.once('error', reject);
      s.setTimeout(2500, () => { s.destroy(); reject(new Error('timeout')); });
    });
  }

  /** One fresh duplex stream to <hostId>'s <targetHost||loopback>:<port> over
   *  the device link — the same tcpForward primitive the forwards pipe over. */
  async _remoteSocket(hostId, port, targetHost) {
    const dm = await this.hosts.device(hostId);
    const h = await dm.tcpForward(port, targetHost || undefined);
    const { Duplex } = require('stream');
    const d = new Duplex({
      read() {},
      write(chunk, enc, cb) { try { h.write(chunk); cb(); } catch (e) { cb(e); } },
      destroy(err, cb) { try { h.close(); } catch { } cb(err); },
    });
    h.onData = (b) => { try { d.push(b); } catch { } };
    h.onClose = () => { try { d.push(null); } catch { } };
    return d;
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
      let fresh = interesting.filter((p) => !prev.has(p.port) && !fwd.has(p.port) && !p.hidden);
      // local: our own infrastructure (frpc admin, tailscale, VNC, …) must
      // not toast when a plugin starts after the baseline
      if (h.id === LOCAL_ID) fresh = fresh.filter((p) => !LOCAL_IGNORE_PROCS.has(p.proc) && p.port !== 7400);
      if (fresh.length) {
        this.log(`new port(s) on ${h.name || h.id}: ${fresh.map((p) => p.port + (p.proc ? '(' + p.proc + ')' : '')).join(', ')}`);
        this.broadcast?.({ type: 'machine-ports-new', hostId: h.id, hostName: h.name || h.id, ports: fresh });
      }
      // Orphaned listeners (B-16d9): a dev server whose cwd was DELETED is
      // garbage regardless of when it appeared — announce on the baseline
      // sweep too (unlike new-port noise), but each pid only once.
      if (h.id === LOCAL_ID) {
        const seenO = this._seenOrphans || (this._seenOrphans = new Set());
        const freshO = interesting.filter((p) => p.orphan && p.pid && !seenO.has(p.pid));
        freshO.forEach((p) => seenO.add(p.pid));
        if (freshO.length) {
          this.log(`orphaned listener(s): ${freshO.map((p) => `${p.port}(${p.proc || '?'} pid ${p.pid}, cwd deleted)`).join(', ')}`);
          this.broadcast?.({ type: 'machine-ports-orphan', hostId: h.id, hostName: h.name || h.id, ports: freshO });
        }
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
      targetHost: r.targetHost || null, // set = a LAN machine reached via this device (jump host)
      localPort: this._live.get(r.id)?.rec?.localPort || null,
      url: this._live.get(r.id)?.rec?.localPort ? `http://127.0.0.1:${this._live.get(r.id).rec.localPort}/` : null,
      active: this._live.has(r.id), error: r.error || null,
      // protocol: what the backend was DETECTED to speak + the user's override
      // (effective = override || detected) — drives the publish mode + UI chip
      proto: r.protoOverride || r.proto || null,
      protoDetected: r.proto || null, protoOverride: r.protoOverride || null,
      // public (frp relay) exposure, if published
      publicUrl: r.publicUrl || null, publicProto: r.publicProto || null, published: !!r.publicUrl,
    }));
  }

  /** User override of the detected protocol ('http'|'https'|'tcp'|null=auto).
   *  A published forward is transparently re-published in the new mode. */
  async setProtoOverride(id, proto) {
    const rec = this._state.forwards.find((r) => r.id === id);
    if (!rec) throw new Error('no such forward');
    if (proto !== null && !['http', 'https', 'tcp'].includes(proto)) throw new Error('proto must be http, https, tcp or null (auto)');
    if (proto) rec.protoOverride = proto; else delete rec.protoOverride;
    this._persist();
    if (rec.publicUrl && this.plugins) {
      // re-publish in the new mode — the URL SHAPE changes (subdomain vs
      // ip:port), so the old proxy must go first; keep the stored subdomain
      // so flipping back to http restores the same public URL
      try { await this.plugins.frpUnpublish(rec.publicName || rec.id); } catch { }
      rec.publicUrl = null;
      try { await this.publish(id); } catch (e) { rec.error = 'republish: ' + e.message; this._persist(); }
    }
    this._emit();
    return this.list().find((r) => r.id === id);
  }

  /** Detect listening TCP ports on a machine (dial or ssh) over the device
   *  link. Loopback + all-interface listeners only; returns [{port, proc}].
   *  With {probe:true} (the UI path — NOT the 30s watch sweep) each visible
   *  port also gets `proto` (http/https/tcp) from probeHostPort, bounded by a
   *  3.5s overall budget — late probes still land in the cache for the next
   *  render. */
  async detect(hostId, { probe = false } = {}) {
    let ports;
    if (hostId === LOCAL_ID) ports = await this.detectLocal();
    else {
      const dm = await this.hosts.device(hostId);
      // Linux: `ss -tlnH`; macOS/BSD: `lsof`. Try ss first, fall back to lsof.
      // -H (no header) is GNU-ss only, so parse defensively either way.
      let out = '';
      try { out = String((await dm.runCmd('sh', ['-c', PORT_SCAN], { timeoutMs: 8000 })).stdout || ''); } catch (e) { throw new Error('port scan failed: ' + e.message); }
      ports = this._parsePorts(out).map((p) => this._classify(p));
    }
    if (probe) {
      // cache serves every row; the probe budget goes to UNCACHED ports only,
      // so repeat scans progressively cover hosts with many listeners
      const vis = ports.filter((p) => !p.hidden);
      for (const p of vis) {
        // scanned ports have no LAN target — same key shape probeHostPort writes
        const hit = this._protoCache.get(`${hostId}::${p.port}`);
        if (hit && Date.now() - hit.ts < 5 * 60 * 1000) p.proto = hit.proto;
      }
      const cand = vis.filter((p) => !p.proto).slice(0, 12);
      const jobs = cand.map((p) => this.probeHostPort(hostId, p.port).then((proto) => { if (proto) p.proto = proto; }).catch(() => {}));
      await Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, 3500))]);
    }
    return ports;
  }

  /** Flag known non-web system listeners (UI folds them; watch skips them). */
  _classify(p) {
    const proc = String(p.proc || '').replace(/^.*\//, '');
    if (NONWEB_PROCS.has(proc) || NONWEB_PORTS.has(p.port) || p.port === (Number(process.env.PORT) || 3456)) p.hidden = true;
    return p;
  }

  /** Listening ports on THIS instance (machine #0) — no device link needed;
   *  the pod/host VibeSpace itself runs on is the primary workspace. */
  async detectLocal() {
    const { execFile } = require('child_process');
    const out = await new Promise((resolve) => {
      execFile('sh', ['-c', PORT_SCAN], { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(String(stdout || '')));
    });
    const parsed = this._parsePorts(out);
    if (parsed.length) return parsed.map((p) => this._classifyOrphan(this._classify(p)));
    // slim container images ship NEITHER ss NOR lsof (real fleet pods — the
    // whole local watch was silently blind); /proc/net is always there.
    // st column '0A' = LISTEN; local_address is HEXIP:HEXPORT; the inode column
    // lets a bounded /proc/*/fd scan recover the owning process name (same-user
    // processes only — exactly what a single-user container is).
    const found = new Map(); // port → inode
    for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
      let txt = '';
      try { txt = fs.readFileSync(f, 'utf-8'); } catch { continue; }
      for (const line of txt.split('\n').slice(1)) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 10 || cols[3] !== '0A') continue;
        const port = parseInt(String(cols[1]).split(':').pop(), 16);
        if (port && !found.has(port)) found.set(port, cols[9]);
      }
    }
    const byInode = this._resolveInodeProcs(new Set([...found.values()]));
    return [...found.entries()]
      .map(([port, inode]) => { const hit = byInode.get(inode); return this._classifyOrphan(this._classify({ port, proc: hit?.comm || '', ...(hit?.pid ? { pid: hit.pid } : {}) })); })
      .filter((p) => p.port > 0 && p.port < 65536)
      .sort((a, b) => a.port - b.port);
  }

  /** socket inode → process name via /proc/<pid>/fd (best-effort, bounded). */
  _resolveInodeProcs(inodes) {
    const map = new Map();
    if (!inodes.size) return map;
    let budget = 6000; // total readlinks — keeps a busy host bounded
    let pids = [];
    try { pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)); } catch { return map; }
    for (const pid of pids) {
      if (map.size >= inodes.size || budget <= 0) break;
      let fds = [];
      try { fds = fs.readdirSync(`/proc/${pid}/fd`); } catch { continue; } // not ours — skip
      for (const fd of fds) {
        if (--budget <= 0) break;
        let ln = '';
        try { ln = fs.readlinkSync(`/proc/${pid}/fd/${fd}`); } catch { continue; }
        const m = ln.match(/^socket:\[(\d+)\]$/);
        if (!m || !inodes.has(m[1]) || map.has(m[1])) continue;
        let comm = '';
        try { comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf-8').trim(); } catch { }
        if (comm) map.set(m[1], { pid: Number(pid), comm });
      }
    }
    return map;
  }

  _parsePorts(out) {
    const found = new Map(); // port → {proc, pid}
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      // lsof line (match FIRST — its distinctive `(LISTEN)` suffix; an ss-style
      // IP:port pattern also matches inside an lsof line, so order matters):
      //   node  1234 user  22u  IPv4 ...  TCP 127.0.0.1:5173 (LISTEN)
      const lsof = line.match(/^(\S+)\s+(\d+)\s.*:(\d+)\s+\(LISTEN\)\s*$/);
      if (lsof) {
        const port = Number(lsof[3]);
        if (port && !found.has(port)) found.set(port, { proc: lsof[1], pid: Number(lsof[2]) || 0 });
        continue;
      }
      // ss line:  LISTEN 0 511 127.0.0.1:5173 0.0.0.0:*   users:(("node",pid=...))
      const ss = line.match(/(?:^|\s)(?:\[[0-9a-f:]+\]|\d+\.\d+\.\d+\.\d+|\*|\[::\]):(\d+)\s/);
      if (ss) {
        const port = Number(ss[1]);
        const proc = (line.match(/"([^"]+)"/) || [])[1] || '';
        const pid = Number((line.match(/pid=(\d+)/) || [])[1]) || 0;
        if (port && !found.has(port)) found.set(port, { proc, pid });
      }
    }
    return [...found.entries()]
      .map(([port, { proc, pid }]) => ({ port, proc, ...(pid ? { pid } : {}) }))
      .filter((p) => p.port > 0 && p.port < 65536)
      .sort((a, b) => a.port - b.port);
  }

  /** Orphan flag (B-16d9, LOCAL only): a listener whose cwd was DELETED is a
   *  zombie dev server — a session started it in a throwaway worktree and
   *  removed the directory without killing it (real case: two next-servers
   *  eating 12GB for a day). /proc/<pid>/cwd readlink ends " (deleted)". */
  _classifyOrphan(p) {
    if (!p.pid) return p;
    try {
      if (fs.readlinkSync(`/proc/${p.pid}/cwd`).endsWith(' (deleted)')) p.orphan = true;
    } catch { }
    return p;
  }

  /** Kill a LOCAL orphaned listener — re-verifies the deleted-cwd condition at
   *  kill time so the route can never be pointed at an arbitrary process. */
  killOrphan(pid) {
    pid = Number(pid);
    if (!Number.isInteger(pid) || pid <= 1) throw new Error('bad pid');
    let cwd = '';
    try { cwd = fs.readlinkSync(`/proc/${pid}/cwd`); } catch { throw new Error('process is gone already'); }
    if (!cwd.endsWith(' (deleted)')) throw new Error('refusing: the process cwd still exists (not an orphan)');
    process.kill(pid, 'SIGTERM');
    this.log(`killed orphaned listener pid ${pid} (cwd ${cwd})`);
    return { ok: true };
  }

  /** Start a forward (idempotent by hostId+remotePort). Binds a local port and
   *  pipes each connection into device.tcpForward(remotePort). */
  async forward(hostId, remotePort, { label = '', targetHost = '' } = {}) {
    remotePort = Number(remotePort);
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) throw new Error('invalid remote port');
    // targetHost = another machine on the device's LAN (jump-host forward);
    // empty/loopback ⇒ the device's own service (the common case).
    targetHost = String(targetHost || '').trim();
    if (targetHost && !/^[A-Za-z0-9._-]{1,255}$/.test(targetHost)) throw new Error('invalid target host (ip or hostname)');
    const isLan = targetHost && targetHost !== '127.0.0.1' && targetHost !== 'localhost';
    const key = isLan ? `${targetHost}:${remotePort}` : String(remotePort);
    let rec = this._state.forwards.find((r) => r.hostId === hostId && r.remotePort === remotePort && (r.targetHost || '') === (isLan ? targetHost : ''));
    if (!rec) { rec = { id: 'pf-' + hostId + '-' + key.replace(/[^\w.-]/g, '_'), hostId, remotePort, label, ...(isLan ? { targetHost } : {}) }; this._state.forwards.push(rec); this._persist(); }
    else if (label) { rec.label = label; this._persist(); }
    await this._start(rec);
    this._probeForward(rec);
    this._emit();
    return this.list().find((r) => r.id === rec.id);
  }

  /** Refresh a forward's detected protocol in the background (never blocks
   *  forward/restore); re-broadcasts when the answer changes the record. */
  _probeForward(rec) {
    this.probeHostPort(rec.hostId, rec.remotePort, { targetHost: rec.targetHost || '' })
      .then((proto) => { if (proto && rec.proto !== proto) { rec.proto = proto; this._persist(); this._emit(); } })
      .catch(() => {});
  }

  async _start(rec) {
    if (this._live.has(rec.id)) return this._live.get(rec.id).rec;
    const lanTarget = (rec.targetHost && rec.targetHost !== '127.0.0.1' && rec.targetHost !== 'localhost') ? rec.targetHost : null;
    if (rec.hostId === LOCAL_ID && !lanTarget) {
      // machine #0, no LAN target: the service ALREADY listens on THIS
      // instance's own loopback — no proxy needed; the record is just the
      // handle that lets the dialog Open it (browser proxy) and Publish it (frp)
      rec.error = null;
      this._live.set(rec.id, { server: null, sockets: new Set(), rec: { ...rec, localPort: rec.remotePort } });
      return { ...rec, localPort: rec.remotePort };
    }
    // Per-connection upstream:
    //  - LOCAL_ID + LAN target: net.connect(targetHost:remotePort) DIRECTLY —
    //    the instance reaches it over its own network (e.g. Tailscale), which
    //    is NOT its loopback, so a real proxy IS needed (the short-circuit above
    //    served a bare 127.0.0.1:<port> that had nothing on it — blank browser,
    //    TCP misdetection, frp-published an empty port; real report).
    //  - remote machine: dm.tcpForward(remotePort, targetHost) over the link.
    let openUpstream;
    if (rec.hostId === LOCAL_ID) {
      openUpstream = () => new Promise((resolve, reject) => {
        const up = net.connect({ host: lanTarget, port: rec.remotePort });
        const handle = { onData: null, onClose: null, write: (b) => { try { up.write(b); } catch {} }, close: () => { try { up.destroy(); } catch {} } };
        up.once('connect', () => resolve(handle));
        up.on('data', (b) => handle.onData?.(b));
        up.on('close', () => handle.onClose?.());
        up.on('error', (e) => { handle.onClose?.(); reject(e); });
      });
    } else {
      await this.hosts.device(rec.hostId); // remote: fail loud so the UI can say "device offline"
      // resolve the device PER CONNECTION, never capture it: a dial re-dial
      // stop()s the old DeviceManager (review finding, high). Steady-state
      // hosts.device() returns the cached live dm, so this costs nothing.
      openUpstream = async () => { const dm = await this.hosts.device(rec.hostId); return dm.tcpForward(rec.remotePort, rec.targetHost || undefined); };
    }
    const sockets = new Set();
    const server = net.createServer({ allowHalfOpen: true }, async (sock) => {
      sockets.add(sock);
      sock.on('close', () => sockets.delete(sock));
      sock.on('error', () => { try { sock.destroy(); } catch {} });
      let h;
      try { h = await openUpstream(); } catch { try { sock.destroy(); } catch {} return; }
      if (sock.destroyed) { try { h.close(); } catch {} return; } // browser aborted while the upstream opened
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
    this.log(`port-forward ${rec.id}: 127.0.0.1:${localPort} → ${lanTarget || rec.hostId}:${rec.remotePort}`);
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
    // effective proto: the user's override wins; otherwise frpPublish probes
    // the backend itself (authoritative at publish time)
    const r = await this.plugins.frpPublish(id, localPort, { preferPort: rec.publicPort || 0, preferSub: rec.publicSub || '', proto: rec.protoOverride || '' });
    rec.publicUrl = r.url; rec.publicName = r.name; rec.publicPort = r.remotePort; rec.publicSub = r.subdomain || null; rec.publicProto = r.proto || null;
    if (!rec.protoOverride && r.proto) rec.proto = r.proto; // publish probe refreshes detection
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
      try { await this._start(rec); this._probeForward(rec); if (rec.publicUrl && this.plugins) { try { const r = await this.plugins.frpPublish(rec.id, this._live.get(rec.id).rec.localPort, { preferPort: rec.publicPort || 0, preferSub: rec.publicSub || '', proto: rec.protoOverride || rec.publicProto || '' }); rec.publicUrl = r.url; rec.publicName = r.name; rec.publicPort = r.remotePort; rec.publicSub = r.subdomain || null; rec.publicProto = r.proto || null; } catch (e) { this.log('re-publish ' + rec.id + ': ' + e.message); } } } catch (e) { rec.error = e.message; }
    }
    this._persist();
    this._emit();
  }

  /** A machine (re)linked — bring up any of its recorded forwards. */
  async onMachineLinked(hostId) {
    for (const rec of this._state.forwards) {
      if (rec.hostId !== hostId || this._live.has(rec.id)) continue;
      try { await this._start(rec); rec.error = null; this._probeForward(rec); } catch (e) { rec.error = e.message; }
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
