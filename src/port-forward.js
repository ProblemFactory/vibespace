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
// B-73c4: the instance URL's own relay file (src/server/instance-url.js PROXY_NAME — its own store's): never judged an orphan here
const INSTANCE_PROXY = 'vibespace-instance';
/** B-73c4: a name as the relay writes its file (src/plugins/frp.js: [^\w-] → _, 60 at most) */
const relayFileName = (n) => String(n).replace(/[^\w-]/g, '_').slice(0, 60);
// -p adds process names (own-user processes always visible; drop it if the ss
// build errors). macOS/BSD: lsof (its first column IS the command name).
const PORT_SCAN = `command -v ss >/dev/null 2>&1 && { ss -tlnpH 2>/dev/null || ss -tlnH 2>/dev/null; } || lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null`;
// ss -p only names SOCKETS YOU OWN — on a docker box every container port
// (root's docker-proxy) scans nameless (owner report: AIDev rows had zero
// detail). docker's own port table recovers the container name without root.
const DOCKER_PORTS = `command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null || true`;
// last-resort OWNER labeling: /proc/net/tcp's uid column names who owns a
// listener even when the process is invisible to us (root services, other
// users) — "root"/"postgres" is honest detail where a name is impossible
/** B-91aa: the names the docker CLI reads from the hub's env (where its daemon is, its config) — the ONLY ones its starter request carries */
const DOCKER_ENV_NAMES = ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_CERT_PATH', 'DOCKER_TLS_VERIFY'];
const dockerEnv = () => { const o = {}; for (const k of DOCKER_ENV_NAMES) if (typeof process.env[k] === 'string') o[k] = process.env[k]; return o; };
const UID_PORTS = `cat /proc/net/tcp /proc/net/tcp6 2>/dev/null; echo ---PASSWD---; cat /etc/passwd 2>/dev/null`;
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


// r3009 (B-f276 family, lane bl-machines-a): port-forwards.json under THE STORE-READ LAW (src/store-read-hold.js, one helper for
// every store of the family) — see the constructor's read
const HOLD = require('./store-read-hold.js');
const SR = require('./store-read.js');
const PF_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v);   // { forwards: [...], names?: {...} }

// r3287 (round wbbbpdgvd): ONE relay call of the replay is bounded — a relay that never answers leaves that row as it is, marked, and
// the replay ENDS (the jobs reconcile then runs with what it knows)
const RELAY_BOUND_MS = 20000;

class PortForwardManager {
  /** @param deps { hosts, dataDir, broadcast, log, plugins, serverSetting } */
  constructor({ hosts, dataDir, broadcast, log, plugins, serverSetting, getJobs, relayBoundMs = RELAY_BOUND_MS, storeWriter = null }) {
    this._storeWriter = storeWriter;   // B-574d «mounts-and-forwards» (主开发 r4751 / r4758 / r4796, lane nl-mounts): the store writer port-forwards.json is written by (a suite's; else the process's)
    this.relayBoundMs = relayBoundMs;   // r3287: a relay call of the replay waits at most this long
    this._replayed = false;             // r3287: the list has REPLAYED once (restore's end) — the jobs reconcile's gate
    this._relayUnanswered = new Set();  // r3287: rows whose replay the relay did not answer within the bound (left as they are)
    this._pubGen = new Map();           // r3287: a publish's generation per row — an unpublish that waited never clears a newer publish
    this.getJobs = getJobs || null; // Background Work registry (2.343.0): service⇄ports sync
    this.hosts = hosts;
    this.plugins = plugins || null; // PluginManager — for frp public exposure
    this.serverSetting = serverSetting || (() => undefined);
    this.file = path.join(dataDir, 'port-forwards.json');
    this.broadcast = broadcast || (() => {});
    this.log = log || (() => {});
    this._live = new Map(); // id → { server, sockets:Set, rec }
    // r3009 (B-f276 family, lane bl-machines-a): THE STORE-READ LAW. The release read ANY failure as «no forwards», and the next
    // write — a person's Forward, a published service's forward, the heal sweep, a protocol change — wrote over the file: every forward,
    // label and protocol override and the kept public subdomain and port gone (the public URLs change). HELD: no forward is listed (the
    // Ports panel says why — heldWords), every change is refused by name, nothing is written over it, the boot's replay waits and runs
    // at the lift; nothing is torn down or re-minted (the relay's proxies stay as they are: nothing here removes by the list's
    // silence); it is read again off the loop; torn bytes are kept aside once per content, then the list starts empty
    this._hold = HOLD.create({
      file: this.file, valid: PF_SHAPE, code: 'ports_unread', aside: (mark) => this.file + '.corrupt-' + mark,
      words: (h) => `port-forwards.json in VibeSpace's data folder could not be read (${h.code}); VibeSpace reads it again every few minutes. No forward is lost: nothing is written over it, and new forwards wait until it reads. Addresses published before stay published at the relay; to take them all down now, stop the relay plugin.`,
      log: (m) => this.log('[ports] ' + m), onLift: (v, f) => this._lifted(v, f),
    });
    // B-574d (r4796): a list made AGAIN in this process (a suite's restart on the same data folder) lands what the last one still owed
    // before it reads the file; a hub's start owes nothing (pending() is false: no wait)
    { const W = this._writer(); if (W.pending(this.file)) W.flushSync([this.file], { waitedBy: 'port-forwards.json, a list made again in this process' }); }
    let read; try { read = { text: fs.readFileSync(this.file, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: PF_SHAPE });
    this._state = this._hold.start(a) === 'data' ? a.value : { forwards: [] };
    if (!Array.isArray(this._state.forwards)) this._state.forwards = [];
    this._asked = a.state === 'data' && !this._hold.held() ? JSON.stringify(this._state, null, 2) : null;   // B-574d (r4796 (b)): the bytes on disk — a save that would write them again writes nothing
    // vscode-style NEW-port watch: sweep machines with a LIVE device link and
    // announce listeners that appeared since the last sweep (the machine's
    // first sweep is a silent baseline). Never opens a connection just to
    // watch: dial machines are checked only while dialed-in (device() fails
    // fast offline), ssh machines only while a device link already exists.
    this._seenPorts = new Map(); // hostId → Set(port)
    this._protoCache = new Map(); // `${hostId}:${port}` → { proto, ts }
    // Heal state: forwards whose boot _start()/frpPublish() failed (machine
    // not linked yet, frpc admin not up) retry on a timer — ssh machines have
    // NO dial-in event, so onMachineLinked alone can never heal them (the
    // machine-mounts pull-retry lesson, review finding).
    this._published = new Set(); // rec.id with a LIVE relay proxy from THIS process
    this._healRetryAt = new Map(); // rec.id → next attempt ts (5-min backoff)
    this._watch = setInterval(() => { this._healSweep().catch(() => {}); this._watchSweep().catch(() => {}); }, 30000);
    if (this._watch.unref) this._watch.unref();
  }

  /** Probe what a machine's port speaks (http / https / tcp) — local ports
   *  directly, remote ports through a fresh device-tunnel stream per pass.
   *  Cached 5 min per host:port (the panel re-renders often). */
  async probeHostPort(hostId, port, { fresh = false, targetHost = '' } = {}) {
    const key = `${hostId}:${targetHost || ''}:${port}`;
    const hit = this._protoCache.get(key);
    if (!fresh && hit && Date.now() - hit.ts < 5 * 60 * 1000) return hit.proto;
    let proto;
    try { proto = await this._probeRaw(hostId, port, targetHost); } catch { return hit?.proto || null; } // unreachable — keep last knowledge
    this._protoCache.set(key, { proto, ts: Date.now() });
    return proto;
  }

  /** One uncached probe; THROWS when nothing answers (undecided — never 'tcp'). */
  async _probeRaw(hostId, port, targetHost = '') {
    const lan = targetHost && targetHost !== '127.0.0.1' && targetHost !== 'localhost' ? targetHost : null;
    return hostId === LOCAL_ID
      // LAN target from THIS instance → probe targetHost:port directly (the
      // service is NOT on loopback; probing loopback mislabeled it TCP)
      ? (lan ? probeProto({ connect: () => this._localSocket(lan, port) }, { timeoutMs: 1800 })
             : probeProto(port, { timeoutMs: 1800 }))
      : probeProto({ connect: () => this._remoteSocket(hostId, port, targetHost) }, { timeoutMs: 2500 });
  }

  /** The publish protocol (lane job-publish-stable, the 2026-10-04 incident: a boot-replayed service probed before it
   *  listened was republished TCP and lost its subdomain): the user's override wins; else a FRESH probe; a probe that
   *  cannot decide (nothing answers yet) keeps the forward's LAST known protocol — never a TCP fallback — and marks
   *  the forward `protoPending` so reprobe() / the heal sweep settle it once the backend answers. */
  async _decideProto(rec) {
    if (rec.protoOverride) return { proto: rec.protoOverride, why: 'override' };
    let proto = null;
    try { proto = await this._probeRaw(rec.hostId, rec.remotePort, rec.targetHost || ''); } catch { }
    if (proto) return { proto, why: 'probe' };
    const last = rec.publicProto || rec.proto || '';
    return { proto: last || 'http', why: last ? 'nothing answers yet, kept the last protocol' : 'nothing answers yet, http by default', pending: true };
  }

  /** Adopt a relay answer. The public NAME is sticky (lane job-publish-stable): a publish in the other mode never
   *  discards the subdomain (or the TCP port) the user or the broker gave this forward — only an explicit unpublish
   *  clears them — so a forward that comes back as http gets its old https://<sub>.… URL again. */
  _adoptPublish(rec, r) {
    this._pubGen.set(rec.id, (this._pubGen.get(rec.id) || 0) + 1);   // r3287
    rec.publicUrl = r.url; rec.publicName = r.name; rec.publicProto = r.proto || null;
    rec.publicSub = r.subdomain || rec.publicSub || null;
    rec.publicPort = r.remotePort || rec.publicPort || null;
    this._published.add(rec.id);
    this._dropSaid = false;   // lane frp-token-proof: the relay takes a login again — the next drop is a new episode
    // lane job-notice-dedupe (fb-666f37fd38): the relay's success is THE fact a service job's public-URL state follows — told
    // here, in the same tick, whoever published (the heal sweep, a restore, a machine link, the Ports panel, the job itself)
    try { const jm = this.getJobs && this.getJobs(); if (jm && typeof jm.relayPublished === 'function') jm.relayPublished(rec, r.url || null); } catch (e) { this.log('jobs follow ' + rec.id + ': ' + e.message); }
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
    const dm = await this.hosts.deviceBounded(hostId);
    const h = await dm.tcpForward(port, targetHost || undefined, { by: 'system:port-forward' });
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
    if (this._hold.held()) return;   // r3228: held — which ports are forwarded is unknown: no port is «new» until the list reads
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
      // ACCUMULATE seen ports — never reset to the current snapshot (owner
      // report: our own reverse-tunnel port churns per session lifecycle, so
      // replacing the set made the SAME port toast as "new" on every
      // reappearance). A port is news exactly once per server lifetime.
      const prev = this._seenPorts.get(h.id);
      const seen = prev || new Set();
      if (seen.size > 4000) seen.clear(); // bounded; a clear = one silent re-baseline
      const fwd = new Set(this._state.forwards.filter((r) => r.hostId === h.id).map((r) => r.remotePort));
      // compute novelty BEFORE recording (seen === prev by reference)
      let fresh = prev ? interesting.filter((p) => !seen.has(p.port) && !fwd.has(p.port) && !p.hidden) : [];
      for (const p of interesting) seen.add(p.port);
      this._seenPorts.set(h.id, seen);
      if (!prev) continue; // baseline sweep — silent
      // local: our own infrastructure (frpc admin, tailscale, VNC, …) must
      // not toast when a plugin starts after the baseline
      if (h.id === LOCAL_ID) fresh = fresh.filter((p) => !LOCAL_IGNORE_PROCS.has(p.proc) && p.port !== 7400);
      if (h.id === LOCAL_ID) fresh = fresh.filter((p) => !p.service); // registered services never toast as anonymous new ports
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

  _writer() { return this._storeWriter || require('./store-writer.js').storeWriter(); }
  /** B-574d «mounts-and-forwards» (主开发 r4751 / r4758 / r4796, lane nl-mounts): port-forwards.json goes through THE STORE WRITER (src/store-writer.js:
   *  its thread writes the temp, SYNCS it and renames it — a power loss never leaves the list empty or torn), the bytes made AT the
   *  write; ONE road for the file, so a later state always lands last. NO WRITE WHEN NOTHING CHANGED (r4796 (b)): the bytes the writer
   *  was last handed are never asked again — a dial-in of a machine with nothing to change, the heal sweep's retry that changed
   *  nothing, a service's restart that publishes the same address write NOTHING. THE CALLER NAMES THE SIDE (r4827): ONLY a person's own
   *  act — from the Ports routes (server.js passes `now`) and, r5036, a machine's REMOVAL (removeHost, unpairDialDevice pass `now`) —
   *  lands before it answers, the writer's own synchronous road (flushSync: with `now` a write still owed is landed too, an unchanged
   *  state included); every caller no person pressed (the jobs engine's forward and publish at a service's start or restart, its
   *  recheck, reprobe, the heal sweep, a dial-in, a probe's answer, the unpair at a LIFT, the boot's replay) rides the writer off the
   *  loop, and for them an unchanged state asks nothing even while a write is owed (no landing waited for, whatever the storage). A failed landing
   *  is the writer's own line (said at its first failure and every tenth) and stays owed; nothing is thrown (as before: said, never
   *  thrown). r3009: held ⇒ nothing written over the file */
  _persist({ now = false } = {}) {
    if (!this._hold.writable('a forward change')) return;
    try {
      const W = this._writer(), json = JSON.stringify(this._state, null, 2);
      if (json === this._asked && !(now && W.pending(this.file))) return;   // r4827: unchanged — nothing asked (a person's act still lands what is owed)
      W.dirty(this.file, { name: 'port-forwards.write', produce: () => {
        const j = JSON.stringify(this._state, null, 2); this._asked = j; return j;
      } });
      if (now && now.bound) { const b = now.bound, dl = b.deadline != null ? b.deadline : (b.deadline = W.flushDeadline()); W.flushSync([this.file], { waitedBy: 'port-forwards.json: a machine removed (its bound shared, r5156)', deadline: dl }); return; }   // r5225: taken from THIS store's writer at its landing when still empty
      if (now) W.flushSync([this.file], { waitedBy: 'port-forwards.json: a forward changed by a person (a Ports press, a machine removed) or a service' });
    } catch (e) { this.log('port-forward persist: ' + e.message); }
  }
  /** r3009: the words the Ports panel reads while port-forwards.json is held (null when it reads) */
  heldWords() { return this._hold.words(); }
  /** r3104: after torn bytes lifted as empty — the copy's base name (the panel says the list was damaged and where those bytes are kept;
   *  never «restore it»: they are the damaged bytes) — null otherwise */
  tornCopy() { return this._tornCopy || null; }
  /** r3009: the hold LIFTED — the records read (null: empty); the boot's replay runs now if it was asked while held; every page is told */
  _lifted(v, facts) {
    this._state = v || { forwards: [] };
    this._asked = null;   // B-574d (r4796 (b)): read again — the next save writes
    this._tornCopy = (facts && facts.setAside) || null;   // r3104: torn bytes lifted as EMPTY — the panel says where they are kept
    if (!Array.isArray(this._state.forwards)) this._state.forwards = [];
    this._emit();
    // r3174: a machine unpaired meanwhile loses its forwards now
    const unpaired = this._unpairedHeld; this._unpairedHeld = null;
    if (unpaired) for (const h of unpaired) { try { this.onMachineUnpaired(h); } catch (e) { this.log('[ports] unpair at the lift: ' + e.message); } }
    // r3228 (round whu7689zw): THE LIST's OWN REPLAY FIRST (when it was asked while held), THEN the jobs engine's ONE reconcile from
    // the facts as they are — never beside the replay (a stop's unpublish raced the replay's republish of the same name)
    if (this._restoreAsked) { this._restoreAsked = false; this.restore().catch(() => {}); }   // restore() ends with the reconcile
    else if (this._replayed) this._jobsReconcile('the lift').catch(() => {});
    // r3287: a lift BEFORE the boot's replay was asked does not reconcile — that replay, when it runs, ends with the one pass
  }
  /** r3287: the list reads AND has replayed once — what the jobs engine's reconcile waits for (it asks; this answers) */
  replayedOnce() { return !this._hold.held() && this._replayed; }
  /** r3287: ONE relay call, bounded (relayBoundMs): no answer in time ⇒ the row is marked not answered and `relay_unanswered` is thrown
   *  (the call itself goes on: an answer that comes late clears the mark) */
  async _relayBounded(p, rec, what) {
    let t = null; const LATE = Symbol('late');
    const r = await Promise.race([p, new Promise((res) => { t = setTimeout(() => res(LATE), this.relayBoundMs); })]).finally(() => clearTimeout(t));   // a bound that must fire: never unref'd (cleared when the call answers)
    if (r === LATE) {
      this._relayUnanswered.add(rec.id);
      Promise.resolve(p).then(() => this._relayUnanswered.delete(rec.id), () => this._relayUnanswered.delete(rec.id));
      throw Object.assign(new Error(`the relay did not answer within ${Math.round(this.relayBoundMs / 1000)} s (${what})`), { code: 'relay_unanswered' });
    }
    this._relayUnanswered.delete(rec.id);
    return r;
  }
  /** r3228: the jobs engine's ONE reconcile of its forwards (src/jobs.js forwardsReconcile), after the list's replay settled */
  async _jobsReconcile(why) {
    try { const jm = this.getJobs && this.getJobs(); if (jm && typeof jm.forwardsReconcile === 'function') await jm.forwardsReconcile(why); } catch (e) { this.log('[ports] the jobs reconcile (' + why + '): ' + e.message); }
  }

  _emit() {
    this.broadcast?.({ type: 'port-forwards-updated', forwards: this.list(), held: this.heldWords(), torn: this.tornCopy() });
  }

  list() {
    const jm = (() => { try { return this.getJobs && this.getJobs(); } catch { return null; } })();
    const gone = (id) => { try { return !!id && !!jm && typeof jm.ownerKnown === 'function' && jm.ownerKnown(id) === false; } catch { return false; } };   // r3327
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
      publicUrl: r.forwardGone || r.orphan ? null : r.publicUrl || null, publicProto: r.publicProto || null, published: !!r.publicUrl && !r.forwardGone && !r.orphan,   // B-73c4: an owed removal is no published forward
      publicSub: r.publicSub || null, pathMount: r.pathMount || null, pathPublic: !!r.pathPublic,
      ownerJob: r.ownerJob || null,   // r3228: the job whose service this row is (written by the jobs engine only); a person's row has none
      relayUnanswered: this._relayUnanswered.has(r.id),   // r3287: its replay's relay call did not answer within the bound — left as it is
      ownerGone: gone(r.ownerJob),   // r3327: its background job is gone (the engine can say so) — the Ports panel says it; unknown is never «gone»
      // B-73c4: a public address whose removal the relay has not CONFIRMED (the row stays until it is), and the rows that are nothing
      // else: a forward already removed (forwardGone; its machine removed: machineGone) or a relay file of this hub no forward names (orphan)
      unpublishOwed: r.unpublishOwed ? { code: r.unpublishOwed.code || null, reason: r.unpublishOwed.reason || '', since: r.unpublishOwed.since || null, ownerJob: r.unpublishOwed.ownerJob || null, ownerSet: !!r.unpublishOwed.ownerSet } : null,
      forwardGone: !!r.forwardGone, machineGone: !!r.machineGone, orphan: !!r.orphan,
    }));
  }

  /** User override of the detected protocol ('http'|'https'|'tcp'|null=auto).
   *  A published forward is transparently re-published in the new mode. */
  async setProtoOverride(id, proto, { now = false } = {}) {
    this._hold.refuse("changing a forward's protocol");   // r3009: held — refused by name, nothing written
    const rec = this._state.forwards.find((r) => r.id === id);
    if (!rec) throw new Error('no such forward');
    if (proto !== null && !['http', 'https', 'tcp'].includes(proto)) throw new Error('proto must be http, https, tcp or null (auto)');
    if (proto) rec.protoOverride = proto; else delete rec.protoOverride;
    this._persist({ now });
    if (rec.publicUrl && this.plugins) {
      // re-publish in the new mode — the URL SHAPE changes (subdomain vs
      // ip:port), so the old proxy must go first; keep the stored subdomain
      // so flipping back to http restores the same public URL
      await this._relayUnpublish(rec, { owe: false, bounded: false });   // B-73c4: its failure SAID (the journal, the row's error); the republish below writes the same-named file over it
      rec.publicUrl = null;
      try { await this.publish(id, { now }); } catch (e) { rec.error = 'republish: ' + e.message; this._persist({ now }); }
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
    if (hostId === LOCAL_ID) {
      ports = await this.detectLocal();
      // Background Work sync (2.343.0): a listener on a registered ACTIVE
      // service's declared port is that service — the panel names it and the
      // new-port toast skips it (registration-first, discovery-second).
      try {
        const jm = this.getJobs && this.getJobs();
        if (jm && jm.ready) {
          const owned = new Map(); // port → the job (its name to show, its id for a clear to find the page's cached scan)
          for (const j of jm.jobs.values()) {
            if (j.kind === 'service' && ['up', 'starting', 'awaiting-user'].includes(j.state)) for (const pt of j.ports || []) owned.set(Number(pt), j);
          }
          // the NAME through the engine's ONE accessor (lane job-notify-user r5, accept-r4 confirmed 0): r4 belted the forward
          // label and this row — one line from it in the same panel — still showed the record's raw name
          const nameOf = require('./job-model.js').labelVia(jm);
          for (const row of ports) if (owned.has(row.port)) { row.service = nameOf(owned.get(row.port)); row.serviceJob = owned.get(row.port).id; }
        }
      } catch { }
      // B-91aa: the docker / uid rungs' `sh` is started by THE STARTER, never a fork of the hub from its 30 s watch; the
      // docker CLI keeps the DOCKER_* names the hub's env carried (nothing else of it)
      const starter = require('./server/child-starter').childStarter();
      await this._enrichDocker(ports, (cmd) => starter.run('sh', ['-c', cmd], { timeoutMs: 6000, maxBuffer: 1024 * 1024, capture: true, envAdd: dockerEnv() }).then((r) => String(r.stdout || '')));
    }
    else {
      const dm = await this.hosts.deviceBounded(hostId);
      // Linux: `ss -tlnH`; macOS/BSD: `lsof`. Try ss first, fall back to lsof.
      // -H (no header) is GNU-ss only, so parse defensively either way.
      let out = '';
      try { out = String((await dm.runCmd('sh', ['-c', PORT_SCAN], { timeoutMs: 8000, by: 'system:port-forward' })).stdout || ''); } catch (e) { throw new Error('port scan failed: ' + e.message); }
      ports = this._parsePorts(out).map((p) => this._classify(p));
      await this._enrichDocker(ports, async (cmd) => String((await dm.runCmd('sh', ['-c', cmd], { timeoutMs: 6000, by: 'system:port-forward' })).stdout || ''));
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

  /** Name still-anonymous ports from docker's port table (ONE implementation
   *  for local and remote — `run` executes on the right machine). ss -p can't
   *  see other users' processes; docker-proxy listeners are root's. */
  async _enrichDocker(ports, run) {
    if (!ports.some((p) => !p.proc && !p.hidden)) return;
    let out = '';
    try { out = await run(DOCKER_PORTS); } catch { out = ''; } // no docker ≠ no uid rung below
    const map = new Map(); // host port → container name
    for (const line of String(out).split('\n')) {
      const [name, portsStr] = line.split('\t');
      if (!name || !portsStr) continue;
      for (const m of portsStr.matchAll(/(?:[\d.]+|\[[^\]]*\]):(\d+)->/g)) { const pt = Number(m[1]); if (!map.has(pt)) map.set(pt, name.trim()); }
    }
    if (map.size) for (const p of ports) if (!p.proc && map.has(p.port)) p.proc = 'docker:' + map.get(p.port);
    // second rung: owner uid → user name for whatever is STILL anonymous
    if (!ports.some((pt) => !pt.proc && !pt.hidden)) return;
    let uidOut = '';
    try { uidOut = await run(UID_PORTS); } catch { return; }
    const [tcpPart, passwdPart] = String(uidOut).split('---PASSWD---');
    const uidByPort = new Map();
    for (const line of String(tcpPart || '').split('\n')) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 8 || cols[3] !== '0A') continue; // 0A = LISTEN
      const port = parseInt(String(cols[1]).split(':').pop(), 16);
      if (port && !uidByPort.has(port)) uidByPort.set(port, cols[7]);
    }
    const nameByUid = new Map();
    for (const line of String(passwdPart || '').split('\n')) {
      const [name, , uid] = line.split(':');
      if (name && uid !== undefined) nameByUid.set(uid, name);
    }
    for (const p of ports) {
      if (p.proc || !uidByPort.has(p.port)) continue;
      const uid = uidByPort.get(p.port);
      p.proc = 'user:' + (nameByUid.get(uid) || uid); // owner, not a process name — the best truth available
    }
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
    // B-91aa: the scan's `sh` is started by THE STARTER (the same command, the same answer) — never a fork of the hub from its
    // 30 s watch. Not the /proc road alone: its inode → name walk stops at 6 000 readlinks, which a busy hub's own fds can
    // spend, and a listener whose name is missed is not folded as a system port. No answer ⇒ the /proc road below
    const out = await require('./server/child-starter').childStarter().run('sh', ['-c', PORT_SCAN], { timeoutMs: 8000, maxBuffer: 4 * 1024 * 1024, capture: true })
      .then((r) => String(r.stdout || ''));
    const parsed = this._parsePorts(out);
    if (parsed.length) return parsed.map((p) => this._classifyOrphan(this._classify(p)));
    // slim container images ship NEITHER ss NOR lsof (real fleet pods — the
    // whole local watch was silently blind); /proc/net is always there.
    // st column '0A' = LISTEN; local_address is HEXIP:HEXPORT; the inode column
    // lets a bounded /proc/*/fd scan recover the owning process name (same-user
    // processes only — exactly what a single-user container is).
    const found = new Map(); // port → inode
    for (const s of await require('./proc-listen.js').listenSockets()) if (!found.has(s.port)) found.set(s.port, s.inode); // the ONE /proc reader (src/proc-listen.js — the jobs engine's service facts read it too)
    const byInode = await this._resolveInodeProcs(new Set([...found.values()]));
    return [...found.entries()]
      .map(([port, inode]) => { const hit = byInode.get(inode); return this._classifyOrphan(this._classify({ port, proc: hit?.comm || '', ...(hit?.pid ? { pid: hit.pid } : {}) })); })
      .filter((p) => p.port > 0 && p.port < 65536)
      .sort((a, b) => a.port - b.port);
  }

  /** socket inode → process name via /proc/<pid>/fd (best-effort, bounded).
   *  ASYNC (2.241.2): this runs on the 30s local watch — on the slim fleet
   *  image (no ss/lsof) with a busy pod (userN: 184 dtach + hundreds of
   *  procs) the sync sweep was the single largest main-thread consumer in a
   *  live profile (~0.2-0.5s EVERY pass, all readdirSync/readlinkSync). The
   *  promises variants spread the same bounded work over the threadpool. */
  async _resolveInodeProcs(inodes) {
    const map = new Map();
    if (!inodes.size) return map;
    let budget = 6000; // total readlinks — keeps a busy host bounded
    let pids = [];
    try { pids = (await fs.promises.readdir('/proc')).filter((d) => /^\d+$/.test(d)); } catch { return map; }
    for (const pid of pids) {
      if (map.size >= inodes.size || budget <= 0) break;
      let fds = [];
      try { fds = await fs.promises.readdir(`/proc/${pid}/fd`); } catch { continue; } // not ours — skip
      for (const fd of fds) {
        if (--budget <= 0) break;
        let ln = '';
        try { ln = await fs.promises.readlink(`/proc/${pid}/fd/${fd}`); } catch { continue; }
        const m = ln.match(/^socket:\[(\d+)\]$/);
        if (!m || !inodes.has(m[1]) || map.has(m[1])) continue;
        let comm = '';
        try { comm = (await fs.promises.readFile(`/proc/${pid}/comm`, 'utf-8')).trim(); } catch { }
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
  async forward(hostId, remotePort, { label = '', targetHost = '', owner = null, claim = null, reown = null, now = false } = {}) {
    this._hold.refuse('adding a forward');   // r3009: held — refused by name, nothing written
    remotePort = Number(remotePort);
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) throw new Error('invalid remote port');
    // targetHost = another machine on the device's LAN (jump-host forward);
    // empty/loopback ⇒ the device's own service (the common case).
    targetHost = String(targetHost || '').trim();
    if (targetHost && !/^[A-Za-z0-9._-]{1,255}$/.test(targetHost)) throw new Error('invalid target host (ip or hostname)');
    const isLan = targetHost && targetHost !== '127.0.0.1' && targetHost !== 'localhost';
    const key = isLan ? `${targetHost}:${remotePort}` : String(remotePort);
    let rec = this._state.forwards.find((r) => r.hostId === hostId && r.remotePort === remotePort && (r.targetHost || '') === (isLan ? targetHost : ''));
    // B-73c4 (r5334): a REMOVED row whose old address's removal is still owed is OWNED BY NOBODY — never the ownership checks' row (a
    // person's new forward is never a service's to take, a service is never refused over a forward a person removed): set aside here,
    // revived AFTER them as a new row would be — the CALLER's owner (none for a person) and label; its owed removal and its old address
    // stay, so a publish still waits for them
    const gone = rec && rec.forwardGone ? rec : null;
    if (gone) rec = null;
    // r3228 (round whu7689zw): OWNERSHIP IS WRITTEN ON THE ROW — the jobs engine (`owner` = a job id) makes, keeps or takes only a row
    // that says it is that job's service; a row a person made carries no owner and the engine never takes it. A row the release's
    // engine wrote (no owner yet) is claimed once by the release's own mark on it: its label «service: <that job's name>» (`claim`)
    // a row of ANOTHER job: refused — unless the engine names that job as no longer asking for it (`reown`: removed, stopped)
    if (owner && rec && rec.ownerJob && rec.ownerJob !== owner) {
      if (!reown || rec.ownerJob !== reown) throw Object.assign(new Error(`port ${remotePort} is forwarded for another service`), { code: 'forward_owned', status: 409 });
      rec.ownerJob = owner; this._persist({ now });
    }
    if (owner && rec && !rec.ownerJob) {
      if (!(Array.isArray(claim) && claim.includes(rec.label))) throw Object.assign(new Error(`port ${remotePort} is already forwarded in the Ports panel by hand — that forward is not this service's: publish it there, or remove it and start the service again`), { code: 'forward_not_owned', status: 409 });
      rec.ownerJob = owner; this._persist({ now });
    }
    if (gone) {
      rec = gone; const was = rec.ownerJob || null;
      delete rec.forwardGone; delete rec.machineGone; if (owner) rec.ownerJob = owner; else delete rec.ownerJob; rec.label = label;
      // a NEW owner: the old one's name preferences (its subdomain, port, protocol choice) never pass to it; the old address — owed — stays
      // its old owner's (its card still says it is up)
      if ((rec.ownerJob || null) !== was) { rec.publicSub = null; rec.publicPort = null; delete rec.protoOverride; if (rec.unpublishOwed && !rec.unpublishOwed.ownerSet) { rec.unpublishOwed.ownerJob = was; rec.unpublishOwed.ownerSet = true; } }   // r5421: the old owner named even when it was a person (none); r5486: named ONCE — a second change of owner never moves it (the address being taken down is still the first one's)
      this._persist({ now });
    }
    if (!rec) {
      rec = { id: 'pf-' + hostId + '-' + key.replace(/[^\w.-]/g, '_'), hostId, remotePort, label, ...(isLan ? { targetHost } : {}), ...(owner ? { ownerJob: owner } : {}) };
      // a stopped service's forward left its public name behind (unforward keepName) — its next start gets it back
      const kept = this._state.names && this._state.names[rec.id];
      if (kept) { rec.publicSub = kept.sub || null; rec.publicPort = kept.port || null; if (kept.proto) rec.proto = kept.proto; delete this._state.names[rec.id]; }
      this._state.forwards.push(rec); this._persist({ now });
    }
    else if (label && rec.label !== label) { rec.label = label; this._persist({ now }); }   // B-574d (r4796 (b)): a service's restart names the same label — nothing to write
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
      await this.hosts.deviceBounded(rec.hostId, 8000); // remote: fail loud so the UI can say "device offline"
      // resolve the device PER CONNECTION, never capture it: a dial re-dial
      // stop()s the old DeviceManager (review finding, high). Steady-state
      // hosts.device() returns the cached live dm, so this costs nothing.
      openUpstream = async () => { const dm = await this.hosts.deviceBounded(rec.hostId, 8000); return dm.tcpForward(rec.remotePort, rec.targetHost || undefined, { by: 'system:port-forward' }); };
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
  async unforward(id, { keepName = false, now = false } = {}) {
    this._hold.refuse('removing a forward');   // r3009: held — refused by name, nothing written
    const rec = this._state.forwards.find((r) => r.id === id);
    // keepName = a Background Work service stopping: its public name waits for the next start (forward() restores it)
    if (keepName && rec && (rec.publicSub || rec.publicPort)) (this._state.names = this._state.names || {})[id] = { sub: rec.publicSub || null, port: rec.publicPort || null, proto: rec.publicProto || rec.proto || null };
    else if (this._state.names) delete this._state.names[id];
    const owed = !!(rec && (rec.publicUrl || rec.unpublishOwed) && !(await this._relayUnpublish(rec, { bounded: false })));   // B-73c4: confirmed, or the row KEPT as owed
    const l = this._live.get(id);
    if (l) {
      for (const s of l.sockets) { try { s.destroy(); } catch {} }
      try { l.server.close(); } catch {}
      this._live.delete(id);
    }
    this._published.delete(id);
    this._healRetryAt.delete(id);
    this._pubGen.delete(id); this._relayUnanswered.delete(id);   // r3327: the row leaves — its marks with it
    // B-73c4: its public address is still up (the relay's removal not confirmed): the forward is gone, its ROW stays (owed: a Ports row
    // with its reason and «Try again»), retried on the pace; it leaves only on a confirmed removal
    if (owed) { rec.forwardGone = true; rec.pathMount = null; rec.pathPublic = false; this._persist({ now }); this._emit(); return { ok: true, owed: rec.unpublishOwed }; }
    this._state.forwards = this._state.forwards.filter((r) => r.id !== id);
    this._persist({ now });
    this._emit();
  }

  /** Publish an ACTIVE forward to the public internet via the frp relay.
   *  opts.sub = a user-CHOSEN fixed subdomain (2.358.0 — frps routes any
   *  name under subDomainHost; persisted, so it survives restarts like the
   *  broker-assigned ones; a taken name fails loudly at the relay). */
  async publish(id, { sub, now = false } = {}) {
    this._hold.refuse('publishing a forward');   // r3009: held — refused by name, nothing written
    if (!this.plugins) throw new Error('public URLs are not available on this instance');
    const rec = this._state.forwards.find((r) => r.id === id);
    if (!rec) throw new Error('no such forward');
    if (rec.unpublishOwed || rec.forwardGone || rec.orphan) throw Object.assign(new Error('its earlier public address is still being taken down (Ports shows it) — publish again once it is down'), { code: 'unpublish_owed', status: 409 });   // B-73c4: never a new file over an owed removal
    if (sub !== undefined && sub !== null && String(sub).length) {
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(String(sub))) throw new Error('subdomain must be lowercase letters/digits/hyphens');
      rec.publicSub = String(sub);
    }
    const l = this._live.get(id);
    if (!l?.rec?.localPort) await this._start(rec); // ensure a local port exists
    const localPort = this._live.get(id)?.rec?.localPort;
    if (!localPort) throw new Error('the forward is not active (is the machine online?)');
    const d = await this._decideProto(rec);
    const previousUrl = rec.publicUrl || null;
    const r = await this.plugins.frpPublish(id, localPort, { preferPort: rec.publicPort || 0, preferSub: rec.publicSub || '', proto: d.proto });
    this._adoptPublish(rec, r);
    if (d.why === 'probe' && r.proto) rec.proto = r.proto; // publish probe refreshes detection
    if (d.pending) rec.protoPending = true; else delete rec.protoPending;
    this.log(`[ports] publish ${id}: ${r.proto || d.proto} (${d.why}) → ${r.url}`);
    this._persist({ now }); this._emit();
    return { publicUrl: r.url, proto: r.proto || d.proto, pending: !!d.pending, previousUrl };
  }

  /** Re-probe a published forward; a decision that differs from the published mode republishes under the SAME name
   *  (a TCP publish of a web service that answered late is repaired to http). Undecided → { pending: true }. */
  async reprobe(id) {
    const rec = this._state.forwards.find((r) => r.id === id);
    if (!rec || !rec.publicUrl || rec.protoOverride || !this.plugins) return { changed: false };
    let proto = null;
    try { proto = await this._probeRaw(rec.hostId, rec.remotePort, rec.targetHost || ''); } catch { }
    if (!proto) return { changed: false, pending: true };
    if (proto === rec.publicProto) {
      if (rec.protoPending) { delete rec.protoPending; rec.proto = proto; this.log(`[ports] reprobe ${id}: ${proto} confirmed`); this._persist(); }
      return { changed: false, publicUrl: rec.publicUrl };
    }
    this.log(`[ports] reprobe ${id}: answers ${proto}, published ${rec.publicProto || '?'} — republishing under the same name`);
    const r = await this.publish(id);
    return { changed: r.publicUrl !== r.previousUrl, publicUrl: r.publicUrl, previousUrl: r.previousUrl };
  }

  /** Take a forward's public URL down. An EXPLICIT unpublish (the user, the API) is the one act that forgets the public
   *  name (lane job-publish-stable); keepName = a stopping service, whose next start publishes the same name again. */
  async unpublish(id, { keepName = false, now = false } = {}) {
    this._hold.refuse('unpublishing a forward');   // r3009: held — refused by name, nothing written
    const rec = this._state.forwards.find((r) => r.id === id);
    if (!rec) return;
    const gen0 = this._pubGen.get(id) || 0;
    // r5334: the relay is asked only when this row MAY have a public address (one recorded, an owed removal, a removed row, an orphan) —
    // never for a row that was never published: a refusal there wrote a false «still up» row that nothing could clear
    const mayBeUp = !!(rec.publicUrl || rec.publicName || rec.unpublishOwed || rec.forwardGone || rec.orphan);
    if (mayBeUp && !(await this._relayUnpublish(rec, { bounded: false }))) { this._persist({ now }); this._emit(); return { ok: true, owed: rec.unpublishOwed }; }   // B-73c4: not confirmed — the address is still up: KEPT, owed
    if (rec.forwardGone || rec.orphan) { this._settleConfirmed(rec); this._persist({ now }); this._emit(); return { ok: true, confirmed: true }; }   // B-73c4: confirmed — a row that was only an owed removal leaves
    // r3287: a publish that landed while this unpublish waited (a start in the same window) stands — its address is never cleared under it
    if ((this._pubGen.get(id) || 0) !== gen0) {   // r3327: said to the caller (a person's Unpublish press reads it), never a silent success
      this.log(`[ports] unpublish ${id}: a publish came meanwhile — the new address stands`);
      throw Object.assign(new Error('not unpublished: this forward was published again while the relay was asked — it is public again; unpublish it again'), { code: 'republished_meanwhile', status: 409 });
    }
    rec.publicUrl = null; rec.publicName = null; delete rec.protoPending;
    if (!keepName) { rec.publicSub = null; rec.publicPort = null; rec.publicProto = null; if (this._state.names) delete this._state.names[id]; }
    this._published.delete(id);
    this._persist({ now }); this._emit();
  }

  /** Mount a forward under the MAIN domain at /svc/<name>/ (2.358.0, owner
   *  request: no per-service random subdomains). The route resolves the LIVE
   *  local port per request, so mounts survive restarts with zero
   *  re-establishment — and they sit behind VibeSpace auth (a feature the
   *  public frp URL deliberately lacks). name=null unmounts. */
  setPathMount(id, name, { public: pub, now = false } = {}) {
    this._hold.refuse("changing a forward's path");   // r3009: held — refused by name, nothing written
    const rec = this._state.forwards.find((r) => r.id === id);
    if (!rec) throw new Error('no such forward');
    if (name === null || name === undefined || name === '') { rec.pathMount = null; rec.pathPublic = false; this._persist({ now }); this._emit(); return { pathMount: null }; }
    name = String(name).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) throw new Error('path name must be lowercase letters/digits/hyphens');
    const clash = this._state.forwards.find((r) => r.id !== id && r.pathMount === name);
    // the clash is named by WHERE it points, never by its label: a Background Work service's forward is labelled
    // `service: <the job's name>` and this sentence is toasted into every device's toast history (the For-you
    // Notifications tab) — "Clear content…" relabels the forward but can never reach a device's history (lane-redact
    // verify r8, the interpolation census §I)
    if (clash) throw new Error(`/svc/${name} is already mounted by the forward of ${clash.hostId === LOCAL_ID ? 'this machine' : clash.hostId}:${clash.targetHost ? clash.targetHost + ':' : ''}${clash.remotePort}`);
    rec.pathMount = name;
    // public = shareable WITHOUT VibeSpace login (2.359.0, owner request);
    // DEFAULT stays private — exposure is an explicit act, never a side
    // effect of mounting. Re-posting the same name with a flag toggles it.
    if (pub !== undefined) rec.pathPublic = !!pub;
    this._persist({ now }); this._emit();
    return { pathMount: name, public: !!rec.pathPublic, url: `/svc/${name}/` };
  }

  /** LIVE local target for a path mount — null when unmounted or the tunnel
   *  is down (the /svc route turns that into an honest 502). */
  pathMountTarget(name) {
    const rec = this._state.forwards.find((r) => r.pathMount === name);
    if (!rec) return null;
    const localPort = this._live.get(rec.id)?.rec?.localPort;
    return localPort ? { localPort, rec } : { localPort: null, rec };
  }

  /** Re-establish a restored forward's public URL at its CURRENT localPort,
   *  reusing the persisted subdomain/port (preferSub/preferPort — regenerating
   *  them on restart silently broke previously shared public URLs, review
   *  finding). On failure the stale relay proxy is torn down: the persistent
   *  frpc proxy toml still names the PRE-restart ephemeral localPort, so
   *  boot-replayed frpc would serve the shared URL against a freed loopback
   *  port (silent connection-refused for everyone holding the link).
   *  Returns false on a failed publish so callers keep their retry backoff. */
  async _republish(rec) {
    if (!rec.publicUrl || !this.plugins) return true;
    if (rec.unpublishOwed) return true;   // B-73c4: its address is owed a REMOVAL — never published again over it
    const localPort = this._live.get(rec.id)?.rec?.localPort;
    if (!localPort) return false; // not active — nothing to bind the proxy to
    try {
      const r = await this._relayBounded(this.plugins.frpPublish(rec.id, localPort, { preferPort: rec.publicPort || 0, preferSub: rec.publicSub || '', proto: rec.protoOverride || rec.publicProto || '' }), rec, 'republish');   // r3287: bounded
      this._adoptPublish(rec, r);
      return true;
    } catch (e) {
      // r3287: NO ANSWER in time — the row is left as it is (no unpublish: the relay may well serve it), said on the row, retried by the heal sweep
      if (e && e.code === 'relay_unanswered') { rec.error = 'public URL: ' + e.message + ' — kept as it is; tried again'; this.log('re-publish ' + rec.id + ': ' + e.message); return false; }
      // lane frp-token-proof: THE DROPPED LOGIN is the relay's state, not this forward's — ONE journal line per episode (the
      // frp plugin's For-you item carries it), never a line per forward per sweep; the forward's error is its words
      const dropped = e && e.code === 'relay_login_dropped';
      if (!dropped) this.log('re-publish ' + rec.id + ': ' + e.message);
      else if (!this._dropSaid) { this._dropSaid = true; this.log('re-publish: ' + e.message + ' (said once — every published forward waits for it)'); }
      this._published.delete(rec.id);
      await this._relayUnpublish(rec, { owe: false, bounded: false });   // B-73c4: its failure SAID (the row still wants its address: the next republish writes its file again)
      rec.error = dropped ? 'public URL down — ' + e.message : 'public URL down — retrying republish';
      return false;
    }
  }

  /** Re-establish persisted forwards (boot / machine relink). Best-effort;
   *  a failed forward stays recorded and retries via _healSweep AND on the
   *  next machine link (dial machines routinely re-dial AFTER our +5s boot
   *  restore — the single-attempt restore was a review finding). */
  async restore() {
    if (this._hold.held()) { this._restoreAsked = true; return; }   // r3009: held — the list is unread, not empty: the replay runs at the lift
    for (const rec of this._state.forwards) {
      if (this._live.has(rec.id)) continue;
      if (rec.forwardGone || rec.orphan) continue;   // B-73c4: a row that is only an owed removal is no forward to start (a live forward owed its address's removal still runs: _republish skips it)
      try {
        await this._start(rec);
        rec.error = null;
        this._probeForward(rec);
        await this._republish(rec);
      } catch (e) {
        rec.error = e.message;
        // _start failed but the pre-restart relay proxy toml persists on the
        // instance — take it down NOW or frpc serves the shared URL against
        // a freed loopback port until the heal/relink re-publishes
        if (rec.publicUrl && this.plugins) await this._relayUnpublish(rec, { owe: false });   // B-73c4: awaited and SAID (the row still wants its address: the heal sweep republishes it)
      }
    }
    this._persist();   // B-574d (r4827): the boot's replay rides the writer (no person asked it)
    this._emit();
    this._replayed = true;   // r3287: the replay ENDED (each relay call bounded) — the gate the jobs reconcile waits for
    await this._jobsReconcile('the replay');   // r3228: after the replay settled — the jobs engine's ONE reconcile (at every start, after every lift)
    await this._owedPass('the replay');   // B-73c4: then the owed removals retried and the relay folder judged — the list has READ
  }

  /** A machine (re)linked — bring up any of its recorded forwards (incl. the
   *  public URL: a dial-in after a failed boot restore used to restart the
   *  forward at a NEW localPort while the relay proxy kept the stale one). */
  async onMachineLinked(hostId) {
    for (const rec of this._state.forwards) {
      if (rec.hostId !== hostId || this._live.has(rec.id)) continue;
      if (rec.forwardGone || rec.orphan) continue;   // B-73c4: a row that is only an owed removal, never a forward
      try {
        await this._start(rec);
        rec.error = null;
        this._probeForward(rec);
        await this._republish(rec);
        this._healRetryAt.delete(rec.id);
      } catch (e) { rec.error = e.message; }
    }
    this._persist();
    this._emit();
  }

  /** Retry pass for forwards that are recorded but not live (or live with a
   *  down public URL) — the boot attempt is otherwise the ONLY one for ssh
   *  machines. 5-min per-record backoff (mirrors machine-mounts' pull retry);
   *  a machine-link event still heals immediately via onMachineLinked. */
  async _healSweep() {
    let changed = false;
    // r3660: a job's row whose job the engine KNOWS no longer asks for its address (ownerAsks false: a take-down the relay answered late
    // left the address on the row) is never published again here — the jobs engine's pass takes it down; unknown (null) keeps this road
    const jm = (() => { try { return this.getJobs && this.getJobs(); } catch { return null; } })();
    const asksNot = (rec) => { try { return !!(rec.ownerJob && jm && typeof jm.ownerAsks === 'function' && jm.ownerAsks(rec.ownerJob, rec.remotePort) === false); } catch { return false; } };
    for (const rec of this._state.forwards) {
      if (rec.forwardGone || rec.orphan) continue;   // B-73c4: a row that is only an owed removal — the owed pass's (below)
      const needStart = !this._live.has(rec.id);
      const noAsk = !!(rec.publicUrl && asksNot(rec));
      const needPublish = !!(rec.publicUrl && this.plugins && !this._published.has(rec.id)) && !noAsk && !rec.unpublishOwed;   // B-73c4: never over an owed removal
      if (!needStart && !needPublish) continue;
      const at = this._healRetryAt.get(rec.id) || 0;
      if (Date.now() < at) continue;
      this._healRetryAt.set(rec.id, Date.now() + 5 * 60000);
      try {
        if (needStart) { await this._start(rec); rec.error = null; this._probeForward(rec); }
        const pubOk = noAsk ? true : await this._republish(rec);
        if (pubOk) { this._healRetryAt.delete(rec.id); rec.error = null; }
        changed = true;
      } catch (e) { if (rec.error !== e.message) { rec.error = e.message; changed = true; } }
    }
    // a publish the probe could not settle (nothing answered yet) is re-probed each sweep until the backend answers
    for (const rec of this._state.forwards.filter((r) => r.protoPending && r.publicUrl && this._published.has(r.id))) {
      try { await this.reprobe(rec.id); } catch (e) { this.log('reprobe ' + rec.id + ': ' + e.message); }
    }
    if (changed) { this._persist(); this._emit(); }
    await this._owedPass('the heal sweep');   // B-73c4: on the sweep's pace (each owed row its own 5-minute retry), one out at a time
  }

  /** A machine was unpaired/removed — drop its forwards. r5036 (主开发): a machine's REMOVAL is a PERSON's act — its two callers (removeHost in
   *  src/server/exit-routes.js, unpairDialDevice in src/server/dial-pairing.js) pass `now`, so port-forwards.json holds the truth when the
   *  route replies (a hub killed right after never comes back with that machine's forwards) — as every Ports press, a landing that
   *  fails or meets the flush's bound is the writer's own line and stays owed. While the list is HELD (unread) the removal waits for the
   *  lift, and the unpair at a LIFT names no side — no press there: the writer's crash window, the family's accepted cost */
  onMachineUnpaired(hostId, { now = false, bound = null } = {}) {
    // r5156 / r5225: the removal's ONE bound rides `now` into _persist as { bound } — so its two lines test-port-forward's red controls
    // anchor (the unpair's save, the now road's flush) stay as they are; started by the removal's FIRST landing, reused by the second
    if (now && bound) now = { bound };
    if (this._hold.held()) { (this._unpairedHeld = this._unpairedHeld || new Set()).add(hostId); return; }   // r3174: held — its forwards go at the lift
    for (const rec of this._state.forwards.filter((r) => r.hostId === hostId)) {
      // unpublish FIRST — dropping the record without frpUnpublish left the
      // public relay proxy live (pointing at a freed loopback port) with no
      // UI handle left to ever remove it (review finding, high)
      // B-73c4: its row is KEPT, owed, until the relay CONFIRMS the removal (asked below, after the landing) — never dropped at once
      if ((rec.publicUrl || rec.unpublishOwed) && this.plugins) { rec.forwardGone = true; rec.machineGone = true; rec.pathMount = null; rec.pathPublic = false; rec.unpublishOwed = rec.unpublishOwed || { code: 'relay_unpublish_pending', reason: 'its removal is being asked of the relay', since: Date.now() }; }
      const l = this._live.get(rec.id);
      if (l) { for (const s of l.sockets) { try { s.destroy(); } catch {} } try { l.server.close(); } catch {} this._live.delete(rec.id); }
      this._published.delete(rec.id);
      this._healRetryAt.delete(rec.id);
      this._pubGen.delete(rec.id); this._relayUnanswered.delete(rec.id);   // r3327
    }
    this._state.forwards = this._state.forwards.filter((r) => r.hostId !== hostId || r.forwardGone);   // B-73c4: a public address still up keeps its row
    this._persist({ now });   // r5036: a machine's REMOVAL by a person lands at once (its callers pass now); the unpair at a lift rides the writer
    this._emit();
    // B-73c4 (r5334): the removed machine's public addresses are THE OWED PASS's (oldest first, ONE out at a time, each bounded, off the
    // loop) — never a removal beside one still out; a pass already running takes them in the round it runs next; a confirmed one's row leaves
    if (this._state.forwards.some((r) => r.hostId === hostId && r.forwardGone)) this._owedPass('a removed machine').catch((e) => this.log('[ports] a removed machine\'s relay removals: ' + ((e && e.message) || e)));
  }

  /** B-73c4 (主开发 r5159 / r5162): ONE removal of a row's public address — CONFIRMED by the relay (its file gone and its reload answered:
   *  src/plugins/frp.js unpublish) or OWED, never swallowed. Owed = the row keeps `unpublishOwed` { code, reason, since }: a Ports row
   *  with its reason and «Try again», retried at a start after the list reads and on the heal sweep's pace; it leaves only on a confirmed
   *  removal. Bounded by the relay's own bound (no answer ⇒ relay_unanswered, owed). The reason is the relay's words: never a sign-in part */
  async _relayUnpublish(rec, { owe = true, bounded = true } = {}) {
    if (!this.plugins) return true;   // no relay on this instance: none of its addresses can be up through it
    try {
      const call = this.plugins.frpUnpublish(rec.publicName || rec.id);
      // still OUT at the relay until it answers (even past the bound); a LATE confirmation settles the row at once (never 5 more minutes)
      this._unpubOut = (this._unpubOut || 0) + 1;
      Promise.resolve(call).then(() => 'ok', () => 'no').then((how) => { this._unpubOut--; if (how === 'ok' && owe && rec.unpublishOwed && rec.unpublishOwed.code === 'relay_unanswered') { delete rec.unpublishOwed; this._settleConfirmed(rec); this._persist(); this._emit(); this._askOwedReconcile(); } });
      if (bounded) await this._relayBounded(call, rec, 'unpublish'); else await call;   // unbounded: a person's / the jobs engine's road (its caller judges lateness, as at the release)
      // r5550: these lines never name the row's id — a LAN forward's id holds the target host a person typed, an orphan's its file's name
      if (rec.unpublishOwed) { delete rec.unpublishOwed; this.log('[ports] a forward\'s public address is down now (its relay removal confirmed)'); }
      return true;
    } catch (e) {
      const code = (e && e.code) || 'relay_unpublish_failed', reason = String((e && e.message) || code).slice(0, 300), was = rec.unpublishOwed;
      if (!owe) { rec.error = 'the old public address could not be taken down: ' + reason; this.log(`[ports] an old public address could not be taken down (${code}): ${reason}`); return false; }   // a cleanup: said, never owed
      rec.unpublishOwed = { code, reason, since: (was && was.since) || Date.now(), ...(was && was.ownerSet ? { ownerJob: was.ownerJob || null, ownerSet: true } : {}) };   // r5421: a refused retry keeps whose old address it is
      if (!was || was.code !== code) this.log(`[ports] a forward's public address could not be taken down (${code}) — kept in Ports, owed: ${reason}`);
      return false;
    }
  }
  /** B-73c4: a CONFIRMED removal — a forward already gone, or an orphan, leaves; a forward that stays keeps its row, unpublished */
  _settleConfirmed(rec) {
    if (rec.forwardGone || rec.orphan) { this._state.forwards = this._state.forwards.filter((r) => r !== rec); this._healRetryAt.delete(rec.id); return; }
    rec.publicUrl = null; rec.publicName = null; delete rec.protoPending; this._published.delete(rec.id);
    // r5486 (S6): a service waiting on this row (its publish refused while the old address was up) is published NOW — a reconcile of the
    // jobs engine is OWED; it is asked ONCE, after the caller's own save and broadcast, never in the middle of the owed pass and never
    // on a timer (two settles of one confirm — its late answer and the pass — ask once)
    if (rec.ownerJob) this._reconcileOwed = true;
  }
  /** r5486: the ONE ask of a reconcile owed by confirmed removals (see _settleConfirmed) — none while the owed pass runs (its end asks) */
  _askOwedReconcile() {
    if (!this._reconcileOwed || this._owedBusy) return;
    this._reconcileOwed = false;
    try { const jm = this.getJobs && this.getJobs(); if (jm && typeof jm.forwardsReconcile === 'function') Promise.resolve(jm.forwardsReconcile('an earlier public address confirmed down')).catch((e) => this.log('[ports] the jobs reconcile after a confirmed removal: ' + ((e && e.message) || e))); } catch (e) { this.log('[ports] the jobs reconcile after a confirmed removal: ' + ((e && e.message) || e)); }
  }
  /** B-73c4: «Try again» on a row whose public address is still up — a PERSON's press only (the route's door: src/server/ports-relay-routes.js) */
  async unpublishAgain(id) {
    this._hold.refuse('removing a public address');   // held: refused by name, nothing written
    const rec = this._state.forwards.find((r) => r.id === id);
    if (!rec || !rec.unpublishOwed) throw Object.assign(new Error('this row has no public address waiting to be taken down'), { code: 'not_owed', status: 404 });
    const ok = await this._relayUnpublish(rec, { bounded: false });
    if (ok) this._settleConfirmed(rec);
    this._persist({ now: true }); this._emit();   // a person's act: on disk when the route replies
    this._askOwedReconcile();
    return { ok: true, confirmed: ok, ...(ok ? {} : { owed: rec.unpublishOwed }) };
  }
  /** B-73c4: the relay files of this home with NO owner mark and no row (written before this unit) — shown once in Ports as words, never
   *  touched; null when none (or not judged yet) */
  unmarkedRelayFiles() { return this._unmarked || null; }
  /** B-73c4: THE OWED PASS — every owed removal whose retry is due, ONE out at a time (each awaited before the next), each its own 5-minute
   *  pace (the heal sweep's); then this home's relay folder judged (law 4): only on a READ list and with this instance's own relay client
   *  running. Never on the loop: every relay call and folder read is the relay's async verbs */
  async _owedPass(why) {
    if (this._owedBusy) { this._owedAgain = true; return; }   // r5334: asked while a pass runs (a removed machine): one more round after it
    if (this._hold.held() || !this.plugins) return;
    this._owedBusy = true;
    let changed = false;
    try {
      const at = Date.now();
      const due = this._state.forwards.filter((r) => r.unpublishOwed && at >= (this._healRetryAt.get(r.id) || 0)).sort((a, b) => (a.unpublishOwed.since || 0) - (b.unpublishOwed.since || 0));
      for (const rec of due) {
        if (this._unpubOut > 0) break;   // ONE out: a removal the relay has not answered yet (past its bound too) is still out — nothing more is asked
        if (rec.orphan && this._namedFiles(rec).has(rec.publicName)) { this._state.forwards = this._state.forwards.filter((r) => r !== rec); changed = true; continue; }   // a row names that file now: no longer an orphan, never removed
        const still = rec.orphan ? await this._orphanStill(rec) : 'mine';   // r5334: an orphan's mark read once more, just before its removal
        if (rec.orphan && (!this._state.forwards.includes(rec) || this._namedFiles(rec).has(rec.publicName))) { this._state.forwards = this._state.forwards.filter((r) => r !== rec); changed = true; continue; }   // the re-read awaited: a row may name its file now — never removed
        if (still === 'drop') { this._state.forwards = this._state.forwards.filter((r) => r !== rec); changed = true; this.log('[ports] a relay file no longer carries this hub\'s mark — never removed; its row leaves');   /* r5550: its name never in the journal (it can hold a host a person typed) */ continue; }
        if (still === 'wait') { this._healRetryAt.set(rec.id, Date.now() + 5 * 60000); continue; }   // its folder not read now: nothing removed, asked on the pace
        if (this._unpubOut > 0) break;   // (the re-read awaited: a removal asked meanwhile is out — still ONE)
        this._healRetryAt.set(rec.id, Date.now() + 5 * 60000);
        if (await this._relayUnpublish(rec)) this._settleConfirmed(rec);
        changed = true;
      }
      if (at >= (this._orphansAt || 0)) { this._orphansAt = at + 5 * 60000; if (await this._judgeOrphans()) changed = true; }
    } catch (e) { this.log(`[ports] ${why}: the owed relay removals — ${(e && e.message) || e}`); }
    finally { this._owedBusy = false; }
    if (changed) { this._persist(); this._emit(); }
    if (this._owedAgain) { this._owedAgain = false; await this._owedPass(why + ', once more'); }
    this._askOwedReconcile();   // r5486: after the pass's own save and broadcast — one ask for every confirm the pass made
  }
  /** r5334: an orphan's relay file read once more just before its removal (the judgement may be minutes old, or from before a restart):
   *  still THIS hub's mark, or the file gone already (its removal's reload confirms the address down) ⇒ 'mine'; another hub's mark or none
   *  now ⇒ 'drop' (never removed: only its row leaves); the folder not read (held, not this instance's client, no listing) ⇒ 'wait' */
  async _orphanStill(rec) {
    let pf = null;
    try { pf = typeof this.plugins.frpProxyFiles === 'function' ? await this.plugins.frpProxyFiles() : null; } catch { pf = null; }
    if (!pf || pf.held || !pf.own) return 'wait';
    const f = (pf.files || []).find((x) => x && x.name === rec.publicName);
    return !f || f.mark === 'mine' ? 'mine' : 'drop';
  }
  /** B-73c4 (r5162 item 8): this home's relay folder, by OWNER MARK. A file carrying THIS hub's mark that no row names becomes an OWED row
   *  (an orphan: its removal asked like any owed one); a file with ANOTHER hub's mark is never touched nor listed; a file with NO mark and no
   *  row is never touched and never judged by its name — kept for the one words row in Ports. The instance URL's own file (its store's,
   *  src/server/instance-url.js PROXY_NAME) is never an orphan here. → true when a row was added */
  /** the relay file names the rows (but `except`) stand for — as the relay writes them (src/plugins/frp.js: [^\w-] → _, 60 at most) */
  _namedFiles(except = null) { const s = new Set(); for (const r of this._state.forwards) { if (r === except || r.orphan) continue; for (const n of [r.id, r.publicName]) if (n) s.add(relayFileName(n)); } return s; }
  async _judgeOrphans() {
    const quiet = () => { if (this._unmarked) { this._unmarked = null; this._emit(); } return false; };   // not judged now: nothing listed
    if (typeof this.plugins.frpProxyFiles !== 'function') return quiet();
    if (this._tornCopy) return quiet();   // the list was lifted from TORN bytes this run: it is not «empty», nothing is judged against it
    let pf = null;
    try { pf = await this.plugins.frpProxyFiles(); } catch { return quiet(); }   // no relay, or a relay with no listing: nothing judged
    if (!pf || pf.held || !pf.own) return quiet();   // another instance's client holds the folder, or this instance's own client is not running
    const named = this._namedFiles();
    const standing = new Set(this._state.forwards.filter((r) => r.orphan).map((r) => r.publicName));   // r5334: the orphans already rows
    let added = false; const unmarked = [];
    for (const f of pf.files || []) {
      if (!f || !f.name || named.has(f.name) || f.name === INSTANCE_PROXY) continue;
      if (standing.has(f.name)) continue;   // r5334: its row stands already (a removal refused, or not asked yet) — never a second row
      if (f.mark === 'mine' && !/^[\w-]{1,60}$/.test(f.name)) { unmarked.push(f.name); continue; }   // a name the relay never writes: a hand's — listed, never touched
      if (f.mark === 'mine') {
        this._state.forwards.push({ id: 'pf-orphan-' + f.name, hostId: null, remotePort: null, label: f.name, orphan: true, publicName: f.name, unpublishOwed: { code: 'relay_orphan', reason: 'no forward of this instance names this public address', since: Date.now() } });
        added = true; this.log('[ports] a relay file of this hub that no forward names — kept in Ports, owed its removal');   // r5550: never its NAME in the journal — the file is named from the forward's id, which holds a target host a person typed (Ports shows it)
      } else if (f.mark === 'none') unmarked.push(f.name);   // 'other': another hub's — never touched, never listed
    }
    const was = JSON.stringify(this._unmarked || null);
    this._unmarked = unmarked.length ? { folder: pf.folder || '', names: unmarked.sort() } : null;
    if (!added && JSON.stringify(this._unmarked || null) !== was) this._emit();
    return added;
  }
}

module.exports = { PortForwardManager };
