'use strict';
/**
 * ONE way to reach a desktop application's MACHINE, on ANY machine
 * (docs/design-desktop-apps-seamless.zh.md §3.5, lane C1 2026-09-25). ORCH
 * tier: it owns only the DISPATCH — which transport reaches the machine named
 * by `hostId` — while the op names and shapes live in the SHARED table
 * src/desktop-serve.js and the work runs where the app runs. The shape of
 * src/server/browser-access.js, verbatim, on purpose.
 *
 *   hostId falsy / 'local' → THIS machine: the runner in-process against the
 *                     hub keeper's own machine keeper (`local`) — never a
 *                     second keeper on the same store (two would fight over
 *                     data/desktop-apps.json and reap each other's sessions)
 *   paired device   → the `desktop-serve` agentd op (the daemon bundles the
 *                     same module and runs the same runDesktopServeOp)
 *   ssh host        → the SAME op: HostManager.device() installs the bundled
 *                     daemon over ssh and drives it over ssh stdio, so an ssh
 *                     host is SERVED by a daemon, never by a one-shot
 *                     ssh-started xpra (D5: that has no keeper process and is
 *                     an orphan at the first link drop). A bootstrap that
 *                     fails (no node there, ssh down) is `host_unavailable`
 *                     naming the reason, at the latest after `connectMs`
 *   a handle that cannot run the op → REFUSED by name (`host_needs_daemon`)
 *                     BEFORE any request: an agent that predates
 *                     desktop-serve (the client's capability gate —
 *                     src/agentd/client.js desktopServe), or a handle with no
 *                     desktopServe at all. Never a silent local fallback:
 *                     the local rung is taken ONLY for a falsy / 'local' id
 *
 * THE PICTURE FORWARD (`forwardPort`, the CDP forward verbatim): an app's
 * loopback picture port on a paired machine (xpra's ws, x11vnc/Xvnc's rfb)
 * becomes a hub-side loopback port — `net.createServer` on 127.0.0.1:0
 * piping each connection into `device.tcpForward(remotePort)` over the
 * existing agentd data plane. The device is resolved PER CONNECTION (a
 * re-dial stop()s the old DeviceManager; a captured handle would go stale).
 * NAT-proof, nothing public, nothing on a LAN; xpra's protocol is end to end,
 * so clipboard / input / geometry / the x5 seats ride it untouched. ONE
 * listener per (hostId, remotePort), REFERENCE-COUNTED (two viewers' bridges
 * may name the same record); `shutdown()` and a forced close are the only
 * unconditional teardowns.
 */
const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const S = require('../desktop-serve.js');
const DA = require('../device-acts.js'); // lane device-act-audit: `by` on every act this layer sends a device
const M = require('../desktop-apps.js');
const SLOT = require('../install-slot.js'); // the machine's ONE package slot (its launcher, its files, its argv)
const I = require('../installs.js'); // THE INSTALLABLES: one row each — this layer asks the row, never a name
const SYS = require('../app-system.js'); // Layer 1: a sys plan's digest binds what it runs (sysDigestPart)
const MW = require('../machine-window.js'); // lane machine-app-crop: the run's launch report (one app as its own window)
const D = require('../desktop-display.js'); // design 014 D1: the PURE RFB greeting read of the vnc-native rung
const AGENT_VERSION = (() => { try { return require('../../package.json').version; } catch { return ''; } })(); // lane remoteapp-r1b: the agent version that answers `remoteapp-facts` = this hub's (its agents upgrade to it)
const MI = require('../mic-install.js'); // lane stream-mic-road: the virtual microphone's exits
const MIC = require('../mic-model.js'); // lane stream-mic-road: the machine's microphone state (PURE)
const RA = require('../remoteapp.js'); // lane remoteapp-r1a (design q-024 §1.2): the RemoteApp setup words, the platform verdict, the RDP port
const SMOD = require('../stream-model.js'); // lane stream-p1a-transport: the webrtc rung's PURE verdict (the agent's capability, a source)
const MC = require('../desktop-machines-cache.js'); // lane desktop-picker-instant: the machine rows' last known state (PURE)
const RS = require('./rfb-signin.js'); // lane desktop-vnc-remember: which sign-ins the hub answers itself (the bridge's gate)
const KF = require('../key-file.js'); // lane desktop-vnc-remember: VAULT_LOCKED — the store's key read while the vault is locked
const IA = require('../installed-apps.js'); // lane machine-desktop-apps: a Windows / macOS machine's installed apps (SHARED: the device lists, the hub judges again)

let installed = null;
/** The wired layer; an unwired process gets a LOUD refusal, never a no-op. */
function access() {
  return installed || {
    call: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    forwardPort: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    hostKnown: () => false, closeForward: () => false, forwards: () => [],
    machines: async () => [{ hostId: 'local', label: null, transport: 'local', link: 'online', connected: true, selectable: true, code: 'ready' }],
    installPlan: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    installXpra: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    installPackage: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    installBusy: () => null, setAppPlanner: () => { },
    machineDesktopTarget: () => null, machineDesktopGone: () => null, // design 014 D1
    installedApps: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; }, // lane machine-desktop-apps
    // lane remoteapp-r1a: the RemoteApp seam the hub keeper's machine half asks, and the launcher's door
    remoteappSetup: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    remoteappForward: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    launchRemoteApp: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    // lane remoteapp-r1b: the RemoteApp settings card's doors
    remoteappSignin: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    remoteappFacts: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    remoteappSetupView: () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    saveRemoteappSetup: () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    trustRemoteApp: async () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    // lane desktop-vnc-remember: a machine's remembered desktop sign-in
    signinsView: () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    rememberSignin: () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    forgetSignin: () => { const e = new Error('the desktop access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
  };
}

const named = (code, msg) => { const e = new Error(msg); e.code = code; return e; };
const INSTALL_LOG_NAME = `~/.vibespace/${SLOT.INSTALL_FILES.log}`; // how a message names where the install's log is (a device's; the hub's own is data/)

/**
 * @param hosts   HostManager (deviceBounded / get / isLocal) or null (local only)
 * @param local   () => THIS machine's desktop-serve handle (the hub keeper's `machine`)
 */
function create({ hosts = null, local = null, env = () => process.env, log = console, install = true, connectMs = 8000, installMs = 15 * 60 * 1000, holdMs = 60 * 60 * 1000, pollMs = 15000, vncPort = D.VNC_NATIVE.port, probeMs = 3000, audit = null, installedStore = null, helloListMs = 3000, rdpSetup = null, integrations = null, dataDir = null, broadcast = null } = {}) {
  const forwards = new Map(); // `${hostId}:${remotePort}` → { server, sockets, localPort, hostId, remotePort, refs }
  const opening = new Map();  // key → the in-flight listen (a concurrent second caller joins it)
  const installs = new Map(); // machine key → { since, running } — THIS hub's follower; the machine's own slot is its pidfile (installState)

  function isLocal(hostId) { return !hostId || hostId === 'local' || (hosts && typeof hosts.isLocal === 'function' && hosts.isLocal(hostId)); }
  /** Is this a machine we know (paired device / ssh host)? Local always. */
  function hostKnown(hostId) {
    if (isLocal(hostId)) return true;
    if (!hosts || typeof hosts.get !== 'function') return false;
    try { return !!hosts.get(hostId); } catch { return false; }
  }
  function localOf() {
    const ds = typeof local === 'function' ? local() : local;
    if (!ds) throw named('host_unavailable', 'this machine\'s desktop keeper is not wired on this instance');
    return ds;
  }
  async function deviceOf(hostId) {
    if (!hosts || typeof hosts.deviceBounded !== 'function') throw named('host_unavailable', 'remote machines are not configured on this instance');
    if (!hostKnown(hostId)) throw named('unsupported-host', `${JSON.stringify(hostId)} is not a paired machine on this instance`);
    let dm;
    try { dm = await hosts.deviceBounded(hostId, connectMs); }
    catch (e) { throw named(e && e.code === 'host_needs_daemon' ? 'host_needs_daemon' : 'host_unavailable', `${hostId}: ${e && e.message}`); }
    if (!dm || typeof dm.desktopServe !== 'function') throw named('host_needs_daemon', `${hostId}: this machine has no VibeSpace agent that can run desktop apps (its agent handle has no desktop-serve) — install or upgrade the agent on it`);
    return dm;
  }

  /** Run ONE desktop-serve op on the machine named by hostId. Throws a coded error on every failure (no silent
   *  failures law); the op's own `{ok:false, code, error}` is thrown too, so callers see ONE shape. */
  /** `by` (lane device-act-audit): who asked — the caller's, else the app record's own `by` (an install names its
   *  conversation / the person), else this module. */
  async function call(hostId, action, params = {}, { by = null } = {}) {
    if (!S.DESKTOP_SERVE_OPS.includes(action)) throw named('bad-request', `unknown desktop-serve op '${action}'`);
    let r;
    if (isLocal(hostId)) r = await S.runDesktopServeOp(localOf(), action, params);
    else {
      const dm = await deviceOf(hostId);
      try { r = await dm.desktopServe(action, params, { by: DA.validBy(by) ? by : DA.byOfWho(params && params.by, 'system:desktop-access') }); }
      catch (e) { throw named(e && e.code === 'host_needs_daemon' ? 'host_needs_daemon' : 'host_unavailable', `${hostId}: ${e && e.message}`); }
    }
    if (!r || r.ok === false) throw named((r && r.code) || 'op_failed', (r && r.error) || `desktop-serve ${action} failed on ${hostId || 'this machine'}`);
    return r;
  }

  /**
   * A hub-side loopback listener for a paired machine's loopback port. Idempotent per (hostId, remotePort); returns
   * `{localPort, close}`. For THIS machine no forward is made: the port is already ours.
   */
  async function forwardPort(hostId, remotePort) {
    const rp = Number(remotePort);
    if (!Number.isInteger(rp) || rp < 1 || rp > 65535) throw named('bad-request', `bad picture port ${JSON.stringify(remotePort)}`);
    if (isLocal(hostId)) return { localPort: rp, close: () => false, local: true };
    const key = `${hostId}:${rp}`;
    const have = forwards.get(key);
    if (have) { have.refs++; return { localPort: have.localPort, close: () => closeForward(key) }; }
    if (opening.has(key)) { await opening.get(key); return forwardPort(hostId, rp); }
    const p = (async () => {
      await deviceOf(hostId); // fail loud NOW so the caller can say "device offline"
      const sockets = new Set();
      const server = net.createServer({ allowHalfOpen: true }, async (sock) => {
        sock.setNoDelay(true); // a person's input and picture: never behind Nagle (a small write waited ~40 ms for the bridge's delayed ACK)
        sockets.add(sock);
        sock.on('close', () => sockets.delete(sock));
        sock.on('error', () => { try { sock.destroy(); } catch { /* gone */ } });
        let h;
        try { const dm = await deviceOf(hostId); h = await dm.tcpForward(rp); }
        catch (e) { log.warn?.(`[desktop] picture forward ${key}: upstream failed — ${e && e.message}`); try { sock.destroy(); } catch { /* gone */ } return; }
        if (sock.destroyed) { try { h.close(); } catch { /* gone */ } return; }
        h.onData = (b) => { try { sock.write(b); } catch { /* gone */ } };
        h.onClose = () => { try { sock.end(); } catch { /* gone */ } };
        sock.on('data', (b) => { try { h.write(b); } catch { /* gone */ } });
        sock.on('close', () => { try { h.close(); } catch { /* gone */ } });
        // design 014 D1: the bridge never half-closes — its FIN is its leaving, so the machine-side connection goes with it
        // (allowHalfOpen kept it open until the LAST viewer left; a Mac's Screen Sharing shows a viewer while one is connected)
        sock.on('end', () => { try { h.close(); } catch { /* gone */ } try { sock.destroy(); } catch { /* gone */ } });
      });
      const localPort = await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
      });
      forwards.set(key, { server, sockets, localPort, hostId, remotePort: rp, refs: 1 });
      log.log?.(`[desktop] picture forward: 127.0.0.1:${localPort} → ${hostId}:${rp}`);
      return { localPort, close: () => closeForward(key) };
    })();
    opening.set(key, p.catch(() => { }));
    try { return await p; } finally { opening.delete(key); }
  }
  /** Release ONE reference on the (hostId:remotePort) forward; the listener and its connections go down when the last
   *  holder releases (or on `force`). Returns true when THIS call tore the listener down. */
  function closeForward(key, { force = false } = {}) {
    const f = forwards.get(key);
    if (!f) return false;
    f.refs = Math.max(0, f.refs - 1);
    if (f.refs > 0 && !force) return false;
    for (const s of f.sockets) { try { s.destroy(); } catch { /* gone */ } }
    try { f.server.close(); } catch { /* gone */ }
    forwards.delete(key);
    return true;
  }
  function listForwards() { return [...forwards.values()].map((f) => ({ hostId: f.hostId, remotePort: f.remotePort, localPort: f.localPort, connections: f.sockets.size, refs: f.refs })); }
  function shutdown() { for (const k of [...forwards.keys()]) closeForward(k, { force: true }); }

  // ── LANE C2: the machine picker + the xpra INSTALL RUNG (design §3.5 "auto seamless setup", D6) ──
  /** A connected agent handle for a host WITHOUT starting a connect ladder (the picker must never bootstrap an ssh
   *  machine just to draw a row): the cached connected DeviceManager, or — for a live dial link — the dial handle
   *  (bounded; a dialed-in stream answers in milliseconds). */
  async function handleIfConnected(h) {
    try { const dm = hosts && typeof hosts.connectedDevice === 'function' ? hosts.connectedDevice(h.id) : null; if (dm) return dm; } catch { /* none */ }
    const dialLive = h.transport === 'dial' ? !!h.online : !!h.dialLive;
    if (!dialLive || !hosts || typeof hosts.deviceBounded !== 'function') return null;
    try { const dm = await hosts.deviceBounded(h.id, Math.min(connectMs, 3000)); return dm && dm.status && dm.status().connected ? dm : null; } catch { return null; }
  }
  // ── lane desktop-picker-instant (owner 2026-10-19 「这个界面的加载时间怎么越来越长了」): THE ROWS ANSWER AT ONCE from what this
  // hub last knew — in memory and in data/desktop-machines.json (a restart paints too). Every answer kicks a background
  // refresh when due (ONE probe in flight per machine — a second asker joins it); the landed row is BROADCAST
  // (`desktop-machines-updated` — the cache-invalidation-must-NOTIFY law) and the open dialogs patch that row in place.
  // The rules (fresh / stale / none, the floor, the payload, the log lines, the file) are PURE: src/desktop-machines-cache.js
  const known = new Map();      // hostId → { row, at, ms } — each machine's last probe
  const refreshing = new Map(); // hostId → the probe in flight
  const knownFile = dataDir ? path.join(dataDir, MC.FILE_NAME) : null;
  if (knownFile) { try { for (const [id, e] of MC.fromFile(JSON.parse(fs.readFileSync(knownFile, 'utf8')))) known.set(id, e); } catch { /* none yet (or unreadable): each row says 「检查中…」 until its probe lands */ } }
  const hostList = () => { try { return hosts && typeof hosts.list === 'function' ? hosts.list() : []; } catch { return []; } };
  const linkOf = (h) => { try { return typeof hosts.linkState === 'function' ? hosts.linkState(h.id) : (h.online ? 'online' : 'unknown'); } catch { return 'unknown'; } };
  /** What the hub knows of a machine WITHOUT asking it (synchronous): its record, its link, a connected handle's platform. */
  const recOf = (h) => {
    let info = null;
    try { const dm = hosts && typeof hosts.connectedDevice === 'function' ? hosts.connectedDevice(h.id) : null; info = dm && dm.status ? dm.status().info || null : null; } catch { info = null; }
    return { hostId: h.id, label: String(h.name || h.id), transport: h.transport === 'dial' ? 'dial' : 'ssh', link: info ? 'online' : linkOf(h), connected: !!info, platform: info ? info.platform || null : null };
  };
  /** THE ROWS NOW — this machine first, then every paired machine's last known row (no history: 「检查中…」). */
  const rowsNow = () => [{ hostId: 'local', label: null, transport: 'local', link: 'online', connected: true, platform: process.platform, ...M.machinePickRow({ hostId: 'local' }) }].concat(MC.answerRows(hostList().map(recOf), known, Date.now()));
  /** ONE machine's row asked LIVE (what machines() awaited per machine before this lane), timed by step: the handle without a
   *  connect ladder (`dial`), then — a connected Windows / macOS machine — its own VNC server (`forward` + `greeting`). Logs
   *  ONE line; a probe over 2 s logs a second naming its slowest step. The label is a DISPLAY string (the host record's
   *  name): it goes to the dialog and the window title, never into a spawn. → { row, ms } */
  async function probeRow(h, why) {
    const t0 = Date.now(), steps = {};
    const link = linkOf(h);
    const dm = await handleIfConnected(h);
    steps.dial = Date.now() - t0;
    const info = dm && dm.status ? (dm.status().info || null) : null;
    const row = { hostId: h.id, label: String(h.name || h.id), transport: h.transport === 'dial' ? 'dial' : 'ssh', link: info ? 'online' : link, connected: !!info, capabilities: info && Array.isArray(info.capabilities) ? info.capabilities : null, platform: info ? info.platform || null : null, elevated: info ? info.elevated === true : null };
    // design 014 D1: a connected Windows / macOS machine's own VNC server, probed as the launcher opens (Linux rows untouched)
    if (row.connected && M.DESKTOP_PLATFORMS.includes(row.platform)) { const p = await probeTimed(h.id, dm).catch((e) => ({ vnc: { ok: false, code: 'no_listener', why: String((e && e.message) || e) }, steps: {} })); row.vnc = p.vnc; Object.assign(steps, p.steps); }
    const out = { ...row, ...M.machinePickRow(row) };
    const ms = Date.now() - t0;
    log.log?.(MC.probeLine(h.id, ms, out.code, why));
    const slow = MC.slowLine(h.id, ms, steps);
    if (slow) log.warn?.(slow);
    return { row: out, ms };
  }
  function saveKnown() {
    if (!knownFile) return;
    try { require('../channel-store.js').writeJsonAtomic(knownFile, MC.toFile(known, new Set(hostList().map((h) => h.id)))); } catch (e) { log.warn?.(`[desktop] could not keep the machine rows in ${MC.FILE_NAME}: ${(e && e.message) || e}`); }
  }
  /** Refresh ONE machine's row when due (MC.refreshDue — `force`: Check again, the daemon's hello); a probe in flight is
   *  JOINED. The landed row is kept, written and broadcast. → the probe's promise | null (nothing due) */
  function refreshHost(h, why, { force = false } = {}) {
    const inFlight = refreshing.get(h.id) || null;
    if (!MC.refreshDue(known.get(h.id), { now: Date.now(), inFlight: !!inFlight, force, linkNow: linkOf(h) })) return inFlight;
    const p = probeRow(h, why).then(({ row, ms }) => {
      known.set(h.id, { row, at: Date.now(), ms });
      saveKnown();
      if (typeof broadcast === 'function') { try { broadcast(MC.machinesPayload(rowsNow(), h.id)); } catch { /* a broadcast never fails a probe */ } }
    }).catch((e) => { log.warn?.(`[desktop] ${h.id} probe failed: ${(e && e.message) || e}`); }).finally(() => { refreshing.delete(h.id); });
    refreshing.set(h.id, p);
    return p;
  }
  /** Every machine the launch dialog may offer (this machine first), each with the PURE picker verdict
   *  (src/desktop-apps.js machinePickRow) — greyed rows carry their code, nothing is hidden — every machine PROBED NOW
   *  (the probes in flight joined). The route answers machinesNow instead (at once). */
  async function machines({ why = 'recheck' } = {}) {
    await Promise.all(hostList().map((h) => refreshHost(h, why, { force: true })));
    return rowsNow();
  }
  /** THE ROUTE'S ANSWER, AT ONCE: the last known rows, each machine's refresh kicked when due. `wait` = the answer once the
   *  probes in flight landed (the page's follow-up — a broadcast it missed still lands); `fresh` = probe now and wait for
   *  it (`host` = that machine only — Check again). → { machines, refreshing: [hostId] } */
  async function machinesNow({ wait = false, fresh = false, host = null } = {}) {
    const waits = [];
    for (const h of hostList()) {
      const force = !!fresh && (!host || host === h.id);
      const p = refreshHost(h, force ? 'recheck' : 'picker', { force });
      if (p && (wait || force)) waits.push(p);
    }
    if (waits.length) await Promise.all(waits);
    return { machines: rowsNow(), refreshing: [...refreshing.keys()] };
  }
  /** The install rung's facts + the PURE plan for one machine: the plan is SHOWN before anything runs. `what` (§7.9) =
   *  which install — absent / 'xpra' the display rung, a LibreOffice install by its catalog id (I.installPlanFor: a
   *  closed set, anything else `bad-request` by name, before the machine is asked). */
  /** Layer 0 apps (docs/design-app-persistence.zh.md §3.1): an `app:<…>` install is planned BY THE MACHINE (its own
   *  `app-plan` op — the simulations as its user, the argv with its own paths and a fresh nonce), through the planner the
   *  apps engine registers: `(hostId, what, planOpts) → {plan, install}`. The run is then THIS slot's, like xpra's. */
  let appPlanner = null;
  function setAppPlanner(fn) { appPlanner = typeof fn === 'function' ? fn : null; }
  async function installPlan(hostId, what = I.DEFAULT_INSTALL, planOpts = null) {
    const w = what || I.DEFAULT_INSTALL;
    const row = I.installRow(w);
    if (row && row.from === 'hello') { // design 014 D1 (the Windows one-time setup): planned from the agent's hello (no facts op)
      if (row.local && isLocal(hostId)) throw named(row.local.code, row.local.error);
      const plan = row.plan({ platform: platformOfHandle(await deviceOf(hostId)) });
      return { hostId, facts: null, plan, digest: planDigest(plan) };
    }
    if (row && row.from === 'mic') { // lane stream-mic-road: planned from the agent's `stream-mic` facts (`prepare`: a Mac builds + stages its plug-in)
      if (row.local && isLocal(hostId)) throw named(row.local.code, row.local.error);
      const dm = await deviceOf(hostId);
      if (typeof dm.streamMic !== 'function') throw named('host_needs_daemon', `${hostId}: its agent cannot read its microphone facts — upgrade the agent on it`);
      const mic = await dm.streamMic({ prepare: true, by: 'system:desktop-access' });
      const plan = row.plan({ platform: platformOfHandle(dm), mic, lang: planOpts && typeof planOpts.lang === 'string' ? planOpts.lang : null });
      return { hostId, facts: null, mic, plan, digest: planDigest(plan) };
    }
    if (/^app:[a-z0-9][a-z0-9:.+-]{0,80}$/.test(String(w))) {
      if (!appPlanner) throw named('host_unavailable', 'the apps engine is not wired on this instance');
      const r = await appPlanner(hostId, w, planOpts || {});
      return { hostId: isLocal(hostId) ? 'local' : hostId, facts: r.install || null, plan: r.plan, digest: planDigest(r.plan) };
    }
    if (!row) throw named('bad-request', `unknown install ${JSON.stringify(String(w).slice(0, 40))} — one of ${I.INSTALL_WHATS.join(', ')}`);
    const r = await call(hostId, 'facts', { install: true });
    const plan = I.installPlanFor(w, r.install);
    return { hostId: isLocal(hostId) ? 'local' : hostId, facts: r.install || null, plan, digest: planDigest(plan) };
  }
  /** verify-r6 I1: WHAT THE DIALOG SHOWED, as one value — the commands (and where they come from) the owner reads above
   *  Install. The run recomputes the plan from the machine's facts at the press; a digest that differs (the machine's
   *  package sources, its xpra, its sudo changed in between — apt steps shown, the xpra.org key + repo + pin 1001 run
   *  as root) is refused `plan_changed` with the new plan, nothing run. null for a refused plan. */
  function planDigest(plan) {
    if (!plan || !plan.ok) return null;
    // the app system (Layer 1): a sys plan also binds its RUN (SYS_SCRIPT's argv, the nonce aside) and its layer — a host
    // plan never stands in for a sys plan; a plan whose layer and argv disagree has no digest and never runs
    const sys = SYS.sysDigestPart(plan);
    if (!sys) return null;
    // an app plan also binds its CLOSURE (every package + version apt would install — `closureKey`): the same commands
    // over a moved archive are another plan; an xpra / LibreOffice plan carries none, so its digest is unchanged
    return crypto.createHash('sha256').update(JSON.stringify({ commands: plan.commands || [], source: plan.source || null, packages: plan.packages || [], ...(plan.closureKey != null ? { closure: String(plan.closureKey) } : {}), ...sys })).digest('hex').slice(0, 32);
  }
  const machineKey = (hostId) => (isLocal(hostId) ? 'local' : String(hostId));
  const machineName = (hostId) => (isLocal(hostId) ? 'this machine' : String(hostId));
  const spell = (ms) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`);
  /** Is THIS hub following (or waiting out) an install on this machine? → { since, running } | null. The MACHINE's own
   *  slot is its pidfile (the facts op's `installing`): a hub that restarted re-attaches to it inside installXpra. */
  function installBusy(hostId) { const i = installs.get(machineKey(hostId)); return i ? { since: i.since, running: !!i.running } : null; }
  /** Run the install `argv` on the machine named by hostId DETACHED (verify r2 F3 + F4 — src/desktop-apps.js
   *  INSTALL_LAUNCHER): the launcher starts it in its own session with its output in `<stateDir>/xpra-install.log` and a
   *  pidfile beside it, then FOLLOWS that log to onData — ONE argv, two transports: an in-process child for this machine,
   *  the agentd `run-stream` op for a paired one. The follower is what this call waits on; the install never depends on
   *  it (a follower that dies — this hub, the link, the daemon's re-exec — leaves the install running, and the next
   *  follower re-attaches: a live recorded install is FOLLOWED, never started twice). `mode: 'follow'` never starts one.
   *  → { code } = the install's RECORDED exit (M.INSTALL_UNRECORDED_EXIT when it ended without recording one). Every
   *  other ending is a coded throw, never a made-up exit code:
   *    install_timeout   — past installMs: this call stops following; the install runs on (VibeSpace never kills apt).
   *    install_link_lost — the device's link dropped: the install runs on there, unobserved until the link is back.
   *  The machine's slot outlives both (installXpra holds it until the machine's facts say the install is gone). */
  async function runArgv(hostId, argv, { onData = () => { }, stateDir = '', mode = 'start', by = 'system:desktop-access' } = {}) {
    const launch = SLOT.installLauncherArgv(argv, { stateDir, mode });
    let timer = null, abandoned = false;
    const relay = (d) => { if (!abandoned) onData(d); }; // the dialog's stream is closed once we answered
    const deadline = new Promise((_, rj) => { timer = setTimeout(() => rj(named('install_timeout', `the install on ${machineName(hostId)} did not finish within ${spell(installMs)} — it is still running there (VibeSpace never stops apt halfway; it runs detached, its log in ${stateDir ? path.join(String(stateDir), SLOT.INSTALL_FILES.log) : INSTALL_LOG_NAME}); no second install starts until it ends, then check again`)), installMs); timer.unref?.(); });
    try {
      if (isLocal(hostId)) {
        const run = new Promise((resolve) => {
          let child;
          try { child = spawn(launch[0], launch.slice(1), { env: { ...env(), LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { relay(Buffer.from(`${e.message}\n`)); resolve({ code: 127 }); return; }
          child.stdout.on('data', (d) => relay(d));
          child.stderr.on('data', (d) => relay(d));
          child.on('error', (e) => { relay(Buffer.from(`${e.message}\n`)); resolve({ code: 127 }); });
          child.on('close', (code) => resolve({ code: code == null ? 1 : code }));
        });
        return await Promise.race([run, deadline]);
      }
      const dm = await deviceOf(hostId);
      if (typeof dm.runStream !== 'function') throw named('host_needs_daemon', `${hostId}: its agent cannot stream a command`);
      // the launcher folds its own stderr into stdout (run-stream relays stdout only); the stream's belt outlives the
      // install deadline (the 120 s default abandoned a long apt as "exit 1")
      const stream = dm.runStream(launch[0], launch.slice(1), { env: { LC_ALL: 'C' }, onData: relay, timeoutMs: installMs + holdMs, by });
      const r = await Promise.race([stream, deadline]);
      if (r && r.code != null) return { code: r.code };
      if (r && r.timedOut) throw named('install_timeout', `the install on ${hostId} did not report an exit within ${spell(installMs + holdMs)} — it may still be running there`);
      throw named('install_link_lost', `the link to ${hostId} dropped during the install (${(r && r.error) || 'no exit reported'}) — it runs on there, detached; reconnect, then check again`);
    } catch (e) {
      if (e && e.code === 'install_timeout') abandoned = true;
      if (e && e.code === 'link_lost') throw named('install_link_lost', `the link to ${hostId} dropped as the install started (${e.message}) — reconnect, then check again`);
      throw e;
    } finally { clearTimeout(timer); }
  }
  /** Hold THIS hub's slot for an install it stopped following (timed out / link lost) until the MACHINE says it is
   *  gone: the facts op's `installState` (the pidfile's pid + starttime, nothing probed) is asked every pollMs; unreachable = still held;
   *  at most holdMs. The line that frees it names the EVIDENCE (verify r2 F3: a lost link used to free the slot at
   *  once, and a timed-out install that lost its link freed it saying "ended" — neither had seen it end). */
  function holdUntilGone(hostId, key, slot, cause) {
    const t0 = Date.now();
    let timer = null, unreachable = false;
    const who = hostId && !isLocal(hostId) ? hostId : 'this machine';
    const free = (why) => { clearTimeout(timer); if (installs.get(key) !== slot) return; installs.delete(key); log.log?.(`[desktop] the install slot on ${who} is free again — ${why}`); };
    const tick = async () => {
      if (installs.get(key) !== slot) return;
      let f = null, answered = false;
      // the SLOT alone (`installState`: the pidfile + exit file, nothing probed — never `sudo -n` every poll); an agent
      // predating it answers the full install facts instead (`install`), one older still answers neither
      try { const r = await call(hostId, 'facts', { installState: true }); answered = true; f = r.installState || r.install || null; } catch { f = null; unreachable = true; }
      if (installs.get(key) !== slot) return;
      if (f && 'installing' in f && !f.installing) {
        const ended = f.lastInstall ? `, exit ${f.lastInstall.code}` : '';
        return free(cause === 'install_link_lost'
          ? `the link was lost during the install; ${who}, reached again, reports the install process gone${ended}`
          : `the timed-out install ended — ${who} reports the install process gone${ended}${unreachable ? ' (the link dropped meanwhile; seen after it came back)' : ''}`);
      }
      if (Date.now() - t0 >= holdMs) {
        return free(answered && !(f && 'installing' in f)
          ? `its agent cannot report the install (an older agent) and ${spell(holdMs)} have passed — the install was never observed to end`
          : `${cause === 'install_link_lost' ? 'the link was lost during the install' : 'the install timed out'} and it was not seen to end within ${spell(holdMs)}${f ? ` (${who} still reports pid ${f.installing && f.installing.pid})` : ` (${who} did not answer)`}`);
      }
      timer = setTimeout(tick, Math.min(pollMs, Math.max(0, holdMs - (Date.now() - t0)))); timer.unref?.();
    };
    timer = setTimeout(tick, pollMs); timer.unref?.();
  }
  /** THE INSTALL RUNG: facts → plan → (refused by name without passwordless sudo / off Linux / off apt) → the script
   *  as root, DETACHED, its log followed → facts again (the ladder re-read). Never silent: every refusal is a coded throw
   *  carrying the plan (the commands to copy). ONE install per machine: the machine's pidfile says whether one runs —
   *  a live one is RE-ATTACHED (`onReattach({pid, since})` first, then its log from the start), never a second apt; a
   *  second click on THIS hub while it follows / waits one out is `busy`. The slot of a run this hub stopped following
   *  (install_timeout / install_link_lost) is held until the machine's facts say the install is gone (or holdMs). */
  async function installXpra(hostId, opts = {}) { return installPackage(hostId, { ...opts, what: I.DEFAULT_INSTALL }); } // the legacy door (POST install-xpra): the default row
  /** §7.9 — THE INSTALL RUNG, GENERALISED: the xpra install's machinery verbatim (facts → plan → refusals by name → the
   *  script as root, DETACHED under the machine's ONE install slot — its pidfile + lock, `xpra-install.*` by their
   *  historical names: renaming them would orphan an install running across an upgrade — its log followed, a live one
   *  RE-ATTACHED, `busy` / held slots as before) for any plan I.installPlanFor names: `what` = 'xpra' | a LibreOffice
   *  install. The machine has ONE slot for every package (dpkg runs one install at a time anyway): an install of
   *  another package already running there is FOLLOWED like any live install (the dialog is told `reattached`), and
   *  the caller re-checks what it wanted afterwards (the route: `still-absent` by name). */
  async function installPackage(hostId, { what = I.DEFAULT_INSTALL, onData = () => { }, onReattach = () => { }, expectDigest = null, planOpts = null, by = 'system:desktop-access' } = {}) {
    const key = machineKey(hostId);
    const cur = installs.get(key);
    if (cur) throw named('busy', `an install is already running on ${machineName(hostId)} (started ${new Date(cur.since).toISOString()}) — wait for it to finish, then check again`);
    const slot = { since: Date.now(), running: false };
    installs.set(key, slot);
    let held = null;
    try {
      const { plan, facts } = await installPlan(hostId, what, planOpts);
      if (plan && (plan.uac || plan.adminDialog)) { // design 014 D1: Windows asks on its own screen (lane stream-mic-road: a Mac's password dialog too)
        const done = await runUacInstall(hostId, plan, { onData, expectDigest, by });
        if (plan.after === 'mic') done.after = (await micFacts(hostId, { force: true, by })).facts; // lane stream-mic-road: the machine's microphone facts, read again
        return done;
      }
      const running = facts && facts.installing && facts.installing.pid ? facts.installing : null;
      if (!running) {
        if (!plan.ok) { const e = named(plan.code, plan.error); e.plan = plan; throw e; }
        if (!plan.canRun) { const e = named('no_sudo', plan.error); e.plan = plan; throw e; }
        // verify-r6 I1: the plan that runs is the plan that was SHOWN (a caller that names none — an older client, the
        // API — keeps the pre-r6 behaviour)
        if (planDigest(plan) == null) { const e = named('refused', 'this plan does not run what it shows (an app-system plan runs its own script, nothing else) — nothing ran'); e.plan = plan; throw e; }
        if (expectDigest != null && planDigest(plan) !== String(expectDigest)) { const e = named('plan_changed', `what would run on ${machineName(hostId)} changed after it was shown (${plan.source}: ${(plan.packages || []).join(' ')}) — nothing ran; read the new commands, then press Install again`); e.plan = plan; e.digest = planDigest(plan); throw e; }
        log.log?.(`[desktop] installing ${plan.label || 'xpra'} on ${hostId || 'this machine'} from ${plan.source} (${(plan.packages || []).join(' ')}), detached`);
      } else {
        if (running.since) slot.since = running.since;
        log.log?.(`[desktop] an install is still running on ${hostId || 'this machine'} (pid ${running.pid}) — re-attached to its log`);
        try { onReattach({ pid: running.pid, since: running.since || null }); } catch { /* the dialog is gone */ }
      }
      slot.running = true;
      let r;
      // an app plan carries its own argv (the machine's paths + the run's nonce — src/app-manifest.js appArgv); every
      // other plan's argv is its script under sudo -n — the SAME slot either way: one install per machine, re-attached
      try { r = await runArgv(hostId, plan.ok ? (Array.isArray(plan.argv) ? plan.argv : SLOT.installArgv(plan)) : ['false'], { onData, stateDir: (facts && facts.stateDir) || '', mode: running ? 'follow' : 'start', by }); }
      catch (e) { if (e && (e.code === 'install_timeout' || e.code === 'install_link_lost')) held = e.code; if (e && !e.plan) e.plan = plan; throw e; }
      if (r.code === SLOT.INSTALL_UNRECORDED_EXIT) { const e = named('install_unrecorded', `the install on ${hostId || 'this machine'} ended without recording its exit (it was stopped, or the machine restarted) — check again`); e.plan = plan; throw e; }
      if (r.code !== 0) { const e = named('install_failed', `the install exited ${r.code} on ${hostId || 'this machine'} — the log above says why`); e.plan = plan; throw e; }
      if (Array.isArray(plan.argv)) return { ok: true, what, hostId: isLocal(hostId) ? 'local' : hostId, plan, before: facts, after: null, facts: null, reattached: !!running }; // an app's own record op reads the result (src/app-serve.js)
      const after = await call(hostId, 'facts', { install: true });
      return { ok: true, what, hostId: isLocal(hostId) ? 'local' : hostId, plan, before: facts, after: after.install || null, facts: after.facts || null, reattached: !!running };
    } finally {
      if (!held) installs.delete(key);
      else holdUntilGone(hostId, key, slot, held);
    }
  }


  // ── design 014 D1 (lane desktop-vnc-native): a Windows / macOS machine's WHOLE DESKTOP — the `vnc-native` rung ──
  /** The ONE desktop per machine this hub has opened: hostId → { dm, platform, vnc } (in memory; NOT a keeper record —
   *  nothing runs to stop, nothing to sample; closing the last viewer releases the picture forward). The handle is the
   *  one the open resolved (a dialed device's handle is not in the host table's connected cache). */
  const desktops = new Map();
  /**
   * THE PROBE of a machine's own VNC server: ONE connection to its 127.0.0.1:<vncPort> through the agent's existing
   * tcp-connect (dm.tcpForward — no new op), the greeting read by the PURE src/desktop-display.js rfbGreeting, our
   * version answered so the server names its sign-in types, then closed before any sign-in. Asked when the launcher
   * lists machines and when a desktop window first opens on a link — never on a timer. → the greeting verdict, or
   * `{ok:false, code:'no_listener'}` when nothing listens there.
   */
  async function probeDesktop(hostId, dmIn = null, why = 'open') {
    const t0 = Date.now();
    const dm = dmIn || await deviceOf(hostId);
    const dial = Date.now() - t0;
    const { vnc, steps } = await probeTimed(hostId, dm);
    const ms = Date.now() - t0;
    log.log?.(MC.probeLine(hostId, ms, vnc.ok ? 'desktop_ready' : 'no_vnc', why)); // lane desktop-picker-instant: every probe is ONE line
    const slow = MC.slowLine(hostId, ms, { dial, ...steps });
    if (slow) log.warn?.(slow);
    return vnc;
  }
  /** THE PROBE ITSELF, timed by step (lane desktop-picker-instant): `forward` = the agent's tcp-connect, `greeting` = the
   *  server's first bytes. → { vnc: the greeting verdict, steps } */
  async function probeTimed(hostId, dm) {
    const t0 = Date.now();
    let h;
    try { h = await dm.tcpForward(vncPort); } catch (e) { return { vnc: { ok: false, code: 'no_listener', why: `nothing listens on port ${vncPort} there (${(e && e.message) || 'refused'})` }, steps: { forward: Date.now() - t0 } }; }
    const t1 = Date.now();
    const vnc = await new Promise((resolve) => {
      let buf = Buffer.alloc(0), replied = false, done = false, timer = null;
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); try { h.close(); } catch { /* gone */ } resolve(v); };
      const ended = (code, why) => { const g = D.rfbGreeting(buf); return g.ok || g.code !== 'truncated' ? g : { ...g, code: buf.length ? g.code : code, why: buf.length ? g.why : why }; };
      timer = setTimeout(() => finish(ended('silent', `port ${vncPort} answered no VNC greeting within ${spell(probeMs)}`)), probeMs); timer.unref?.();
      h.onData = (d) => {
        if (done) return;
        buf = Buffer.concat([buf, Buffer.isBuffer(d) ? d : Buffer.from(d)]).subarray(0, 2048);
        const g = D.rfbGreeting(buf);
        if (!replied && g.reply) { replied = true; try { h.write(Buffer.from(g.reply, 'latin1')); } catch { /* gone */ } }
        if (g.ok || g.code !== 'truncated') finish(g);
      };
      h.onClose = () => finish(ended('no_listener', `nothing listens on port ${vncPort} there`));
    });
    return { vnc, steps: { forward: t1 - t0, greeting: Date.now() - t1 } };
  }
  const platformOfHandle = (dm) => { try { const st = dm && dm.status ? dm.status() : null; return st && st.connected && st.info ? st.info.platform || null : null; } catch { return null; } };
  const notDesktop = (hostId, platform) => named('not_desktop_machine', `${hostId} runs ${platform || 'an unknown system'} — "Its desktop" is for Windows and macOS machines (a Linux machine's apps open in their own windows)`);
  /** OPEN a machine's desktop (the window's connect gate): the machine is reached (bounded), must be Windows / macOS,
   *  and its VNC server must answer with a sign-in the viewer speaks — else `no_vnc` by name with the probe. The probe
   *  is asked once per link (a reconnect of the same link reuses its answer). → { ok, id, hostId, platform, auth, type } */
  async function openMachineDesktop(hostId) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'this machine\'s own desktop is the Desktop window');
    const dm = await deviceOf(hostId);
    const platform = platformOfHandle(dm);
    if (!M.DESKTOP_PLATFORMS.includes(platform)) throw notDesktop(hostId, platform);
    const have = desktops.get(hostId);
    const vnc = have && have.dm === dm && have.vnc && have.vnc.ok ? have.vnc : await probeDesktop(hostId, dm);
    if (!vnc.ok) { desktops.delete(hostId); const e = named('no_vnc', `${hostId}: ${vnc.why || vnc.code}`); e.vnc = vnc; e.platform = platform; throw e; }
    desktops.set(hostId, { dm, platform, vnc });
    return { ok: true, id: M.machineDesktopId(hostId), hostId, platform, auth: vnc.auth, type: vnc.type, signin: signinState(hostId) }; // lane desktop-vnc-remember: whether the hub signs in by itself
  }
  /** The bridge's target for a `machine-desktop.<hostId>` id (SYNC): the opened machine while its link is up — `rfb` to
   *  its 5900 through the picture forward, people only (`humanOnly`: the bridge refuses an agent token by name).
   *  lane desktop-vnc-remember: `signIn` = the machine's REMEMBERED sign-in for the relay's gate — `take()` opens the sealed
   *  row for ONE connection (null = the person signs in: none kept, the vault locked, refused before, a type the hub does not
   *  speak), `said(verdict)` = how it went (a refusal is remembered against THAT row: never tried again). */
  function machineDesktopTarget(id) {
    const hostId = M.machineDesktopHost(id);
    const d = hostId ? desktops.get(hostId) : null;
    if (!d || !M.DESKTOP_PLATFORMS.includes(platformOfHandle(d.dm))) return null;
    let taken = null;
    const signIn = { take: () => { const c = rememberedSignin(hostId); taken = c ? c.at : null; return c; }, said: (v) => { if (v && !v.ok && v.code === 'refused' && taken != null) signinRefused.set(hostId, taken); } };
    return { kind: D.VNC_NATIVE.stream, port: vncPort, hostId, humanOnly: true, signIn };
  }
  /** The bridge's words when a machine desktop's upstream closed: the machine's link is gone ⇒ it went offline. */
  function machineDesktopGone(id) {
    const hostId = M.machineDesktopHost(id);
    const d = hostId ? desktops.get(hostId) : null;
    return d && !platformOfHandle(d.dm) ? `${hostId} went offline` : null;
  }
  /** "RUN ON ITS DESKTOP…" — the OWNER's click (the route refuses an agent token): the PURE plan (src/desktop-apps.js
   *  desktopRunPlan — the line refused by name, else an argv that starts it detached), run by the agent's existing
   *  `run-cmd`. → { ok, hostId, platform, shown } — `shown` is the line, as it ran. */
  // verify r1 F4: every run (and every refusal of a typed line) is ONE line of the exit proxy's audit (`audit` = its ONE
  // writer, wired in server.js) — the owner's "Commands run on {machine}" list shows it like an exit run; agents never
  // see it (no conversation key)
  const auditRun = (hostId, line, extra) => {
    if (typeof audit !== 'function' || typeof line !== 'string' || !line.trim()) return;
    let machine = hostId; try { const h = hosts && hosts.get ? hosts.get(hostId) : null; machine = String((h && (h.name || h.id)) || hostId); } catch { /* the id */ }
    try { audit({ hostId, machine, sessionId: null, sessionKey: null, name: 'you — Run on its desktop', by: 'user', grant: 'run', verb: 'run', via: 'desktop', cmd: line, ...extra }); } catch (e) { log.warn?.(`[desktop] the run on ${hostId} was not audited: ${e && e.message}`); }
  };
  async function runOnDesktop(hostId, line, { report = false, by = 'system:desktop-access' } = {}) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'this machine runs apps through the Apps launcher');
    const dm = await deviceOf(hostId);
    const platform = platformOfHandle(dm);
    const plan = M.desktopRunPlan(platform, line, { report }); // lane machine-app-crop: `report` = "show it as its own window" (the launch report)
    if (!plan.ok) { auditRun(hostId, line, { ok: false, refusal: plan.code, ...(platform ? { platform } : {}) }); throw named(plan.code, plan.error); }
    let r;
    const t0 = Date.now();
    try { r = await dm.runCmd(plan.argv[0], plan.argv.slice(1), { timeoutMs: 20000, waitMs: 25000, by }); }
    catch (e) { auditRun(hostId, line, { ok: false, refusal: 'host_unavailable', platform, ms: Date.now() - t0 }); throw named('host_unavailable', `${hostId}: ${e && e.message}`); }
    auditRun(hostId, line, { ok: !!r && r.code === 0, code: r && Number.isInteger(r.code) ? r.code : null, ms: Date.now() - t0, platform, ...(!r || r.code !== 0 ? { refusal: 'run_failed' } : {}) });
    if (!r || r.code !== 0) throw named('run_failed', `the command did not start on ${hostId} (exit ${r ? r.code : '?'}${r && r.stderr ? `: ${String(r.stderr).trim().split('\n')[0].slice(0, 200)}` : ''})`);
    log.log?.(`[desktop] started on ${hostId}'s desktop at the owner's click (${String(line).length} characters)`);
    return { ok: true, hostId, platform, shown: plan.shown, ...(report ? { launched: MW.parseLaunchReport(r.stdout) } : {}) };
  }
  // ── design q-024 r1 §1.2 (lane remoteapp-r1a): THE REMOTEAPP SEAM — the hub keeper hands these two to its machine half ──
  /** A machine's RemoteApp setup, read FRESH at every launch and relaunch: `{ user, domain?, certFp, password: () =>
   *  string }`. Lane remoteapp-r1b: THE SEALED INTEGRATION ROW `remoteapp/<hostId>` (src/server/integration-store.js
   *  resolveMachine — `integrations`, wired in server.js): the user, the domain, the certificate the first connection pinned,
   *  and the password as a GETTER that opens the seal again at the spawn (the plaintext is never carried between reads). The
   *  R1a seam stays for tests (`create({ rdpSetup })` / `setRdpSetup(fn)` outrank the store). A part missing ⇒
   *  `remoteapp_needs_setup` naming it — its door is the machine's RemoteApp settings card. */
  const credentialsOf = () => (typeof integrations === 'function' ? integrations() : integrations);
  const sealed = (hostId) => { const st = credentialsOf(); return st && typeof st.resolveMachine === 'function' ? st.resolveMachine('remoteapp', hostId) : null; }; // the row's id spelled at the call (the registry's consumer census reads it; = RA.CREDENTIAL_ROW)
  function storeSetup(hostId) {
    const r = sealed(hostId);
    if (!r) return null;
    const v = r.values || {};
    const password = v.password ? () => { const again = sealed(hostId); const pw = again && again.values ? again.values.password : ''; if (!pw) throw named('remoteapp_needs_setup', RA.needsSetupWords(['password'], hostName(hostId))); return pw; } : undefined;
    return { user: v.user || '', domain: v.domain || '', certFp: v.certFp || '', password };
  }
  let rdpSetupGetter = typeof rdpSetup === 'function' ? rdpSetup : credentialsOf() ? storeSetup : null;
  function setRdpSetup(fn) { rdpSetupGetter = typeof fn === 'function' ? fn : null; }
  const hostName = (hostId) => { try { const h = hosts && hosts.get ? hosts.get(hostId) : null; return String((h && (h.name || h.id)) || hostId); } catch { return String(hostId); } }; // the machine's own name (a display string)
  async function remoteappSetup(hostId) {
    const s = rdpSetupGetter ? await rdpSetupGetter(hostId) : null;
    const missing = RA.setupMissing(s);
    if (missing.length) { const e = named('remoteapp_needs_setup', RA.needsSetupWords(missing, hostName(hostId))); e.missing = missing; throw e; }
    return s;
  }
  /** lane remoteapp-r1b: what the FIRST CONNECTION needs — the sign-in without a pinned certificate (it is what pins one):
   *  `{ user, domain, password: () => string }`, the user and the password refused by name when missing. */
  async function remoteappSignin(hostId) {
    const s = rdpSetupGetter ? await rdpSetupGetter(hostId) : null;
    const missing = RA.setupMissing(s).filter((k) => k !== 'certificate');
    if (missing.length) { const e = named('remoteapp_needs_setup', RA.needsSetupWords(missing, hostName(hostId))); e.missing = missing; throw e; }
    return { user: s.user, domain: s.domain || '', password: s.password };
  }
  /** The loopback forward to the machine's 127.0.0.1:3389 through its agent's tcpForward — forwardPort's (reference
   *  counted: a relaunch's successor shares it until the old session lets go; the same pipe as VNC). → { port, forwardId, close } */
  async function remoteappForward(hostId) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'RemoteApp reaches a PAIRED machine — never this one');
    const fw = await forwardPort(hostId, RA.RDP_PORT);
    return { port: fw.localPort, forwardId: `${hostId}:${RA.RDP_PORT}`, close: fw.close };
  }
  /** "RemoteApp…" — the OWNER's click (the route refuses an agent token: design §1.6 fence 4, an agent never starts one).
   *  The machine is reached and must be Windows, its setup complete — asked HERE first, so the launcher's answer names what
   *  is missing before anything else — then THIS machine's keeper starts xfreerdp (src/desktop-serve.js launchRemoteApp
   *  through the seam above). → the record's view */
  async function launchRemoteApp(hostId, app = {}, { launchedBy = { kind: 'person' } } = {}) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'RemoteApp opens an app of a paired Windows machine — this machine\'s own apps open through the Apps launcher');
    const dm = await deviceOf(hostId);
    const pv = RA.platformVerdict(platformOfHandle(dm), hostName(hostId));
    if (pv) throw named(pv.code, pv.error);
    await remoteappSetup(hostId);
    const a = app && typeof app === 'object' ? app : {};
    return localOf().launch({ remoteapp: { hostId, program: a.program, name: a.name, args: a.args, kbdUnicode: a.kbdUnicode } }, { launchedBy, remoteappDoor: true }); // the ONE door that sets it
  }
  /** design 014 D1, the owner's option A (2026-10-03): THE WINDOWS INSTALL. The agent runs unelevated, so the plan's
   *  argv asks Windows for elevation ON THAT MACHINE'S SCREEN and waits: someone there clicks Yes and types the VNC
   *  password into the administrator window — VibeSpace never carries it. Declined / nobody there ⇒ `no_admin` by name
   *  with the plan (its commands = the same script for an administrator PowerShell). Done = the 5900 probe, after. */
  async function runUacInstall(hostId, plan, { onData = () => { }, expectDigest = null, by = 'system:desktop-access' } = {}) {
    if (!plan.ok) { const e = named(plan.code, plan.error); e.plan = plan; throw e; }
    if (expectDigest != null && planDigest(plan) !== String(expectDigest)) { const e = named('plan_changed', `what would run on ${hostId} changed after it was shown — nothing ran; read the new commands, then press Install again`); e.plan = plan; e.digest = planDigest(plan); throw e; }
    const dm = await deviceOf(hostId);
    if (typeof dm.runStream !== 'function') throw named('host_needs_daemon', `${hostId}: its agent cannot stream a command`);
    log.log?.(`[desktop] installing ${plan.label} on ${hostId}: ${plan.adminDialog ? 'the Mac asks for an administrator password' : 'Windows asks for administrator rights'} on that machine's screen`);
    const r = await dm.runStream(plan.argv[0], plan.argv.slice(1), { onData, timeoutMs: installMs, by, ...(plan.env ? { env: plan.env } : {}) }); // lane stream-mic-road: every name rides the env
    const fail = (code, msg) => { const e = named(code, msg); e.plan = plan; return e; };
    if (r && r.code === M.TIGHTVNC_NO_ADMIN_EXIT) throw fail('no_admin', plan.adminDialog ? `the Mac ${hostId} got no administrator password (the dialog was cancelled there) — nothing was installed; press again with someone at that Mac` : `Windows on ${hostId} granted no administrator rights (Yes was not clicked there) — nothing was installed; click Install again with someone at that machine, or run the commands above in an administrator PowerShell there`);
    if (r && plan.adminDialog && r.code === MI.MIC_NO_PASSWORD_EXIT) throw fail('no_password', `nobody answered the administrator password dialog on the Mac ${hostId} in ${MIC.MIC_LIMITS.macWaitSec} s — it was withdrawn and nothing was installed; press again with someone at that Mac`);
    if (!r || r.code == null) throw fail(r && r.timedOut ? 'install_timeout' : 'install_link_lost', `the install on ${hostId} reported no exit (${(r && r.error) || (r && r.timedOut ? 'past its deadline' : 'the link dropped')}) — check again`);
    if (r.code !== 0) throw fail('install_failed', `the install exited ${r.code} on ${hostId} — the administrator window there said why`);
    installedNow(hostId, plan.label); // lane machine-desktop-apps: what our door installed is on the machine's list at once
    if (plan.after === 'mic') return { ok: true, what: plan.what, hostId, plan, before: null, after: null, facts: null, reattached: false }; // lane stream-mic-road: installPackage reads the microphone facts again
    desktops.delete(hostId);
    return { ok: true, what: plan.what, hostId, plan, before: null, after: await probeDesktop(hostId, dm, 'install'), facts: null, reattached: false };
  }

  /** ONE file of a paired machine, read through its agent (bounded) — the hosted xpra client's files when the hub has
   *  no xpra of its own (src/routes/desktop-apps.js). Never for this machine (the route serves those from disk). */
  async function readFile(hostId, absPath, maxBytes = 8 * 1024 * 1024) {
    if (isLocal(hostId)) throw named('bad-request', 'readFile is for a paired machine');
    const dm = await deviceOf(hostId);
    if (typeof dm.fsReadRange !== 'function') throw named('host_needs_daemon', `${hostId}: its agent cannot read files`);
    const r = await dm.fsReadRange(String(absPath), 0, maxBytes);
    if (r.size != null && r.size > maxBytes) throw named('too-large', `${absPath} on ${hostId} is ${r.size} bytes (over ${maxBytes})`);
    return r.data;
  }

  // ── lane stream-mic-road (B-7af0): a Windows / macOS machine's MICROPHONE ROAD — people only (the routes) ──
  /** The machine's microphone facts (the agent's `stream-mic` op — src/desktop-mic.js) + the PURE verdicts: the state (where the
   *  viewer's voice goes), the 「设为默认麦克风」 / 「改回」 doors. An agent that predates the op is never asked (host_needs_daemon). */
  async function micFacts(hostId, { force = false, by = 'system:desktop-access' } = {}) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'the microphone reaches a paired Windows or macOS machine — never this one');
    const dm = await deviceOf(hostId);
    if (typeof dm.streamMic !== 'function') throw named('host_needs_daemon', `${hostId}: its agent cannot read its microphone facts — upgrade the agent on it`);
    const f = await dm.streamMic({ force, by });
    const state = f && f.state ? f.state : MIC.micStateOf(f);
    return { hostId, facts: f, state, doors: MIC.micDefaultDoors(state, f && f.previous), words: MIC.micRoadWords(state) };
  }
  /** 「设为默认麦克风」 (`to: 'virtual'`) / 「改回」 (`to: 'restore'`) — the device remembers what it replaced. */
  async function micDefault(hostId, to, { by = 'system:desktop-access' } = {}) {
    if (to !== 'virtual' && to !== 'restore') throw named('bad-request', 'to = virtual | restore');
    if (isLocal(hostId)) throw named('not_desktop_machine', 'the microphone reaches a paired Windows or macOS machine — never this one');
    const dm = await deviceOf(hostId);
    if (typeof dm.streamMic !== 'function') throw named('host_needs_daemon', `${hostId}: its agent cannot change its default microphone — upgrade the agent on it`);
    const r = await dm.streamMic({ action: 'default', to, by });
    if (!r || !r.ok) throw named((r && r.code) || 'set_failed', (r && r.error) || 'the default microphone was not changed');
    log.log?.(`[desktop] ${hostId}: the default microphone is now ${r.device && r.device.name} (${to})`);
    const f = r.facts || null, state = f && f.state ? f.state : MIC.micStateOf(f);
    return { hostId, to, device: r.device || null, facts: f, state, doors: MIC.micDefaultDoors(state, f && f.previous), words: MIC.micRoadWords(state) };
  }

  // ── lane machine-desktop-apps: a Windows / macOS machine's INSTALLED apps, listed BY WITNESS on the machine ──
  /** The list the hub keeps per machine (`installedStore` = the keeper: data/desktop-apps-hosts.json `installed`), asked
   *  through the `desktop-apps-list` device op (src/installed-apps.js listInstalled — the SHARED lister the daemon runs,
   *  bounded there) only when IA.listDue says so: Check again (`recheck`), an install through our door (`install`), the
   *  daemon's hello (`hello`), a dialog opening on a list older than 10 min (`open`). ONE listing per machine at a time
   *  (a second caller joins it); the device's rows are judged again here (IA.rowsFromDevice). An agent that predates the
   *  op is never asked (the client's capability gate): `code: 'host_needs_daemon'` with the list as it was; a machine
   *  not answering: `offline`. → { hostId, platform, rows, total, truncated, listedAt, code?, error? } */
  const listing = new Map(); // hostId → the in-flight listing
  const storeOf = () => { const st = typeof installedStore === 'function' ? installedStore() : installedStore; return st && typeof st.installedOf === 'function' ? st : null; };
  const listAnswer = (hostId, e, extra = {}) => ({ hostId, platform: (e && e.platform) || null, rows: e ? e.rows : [], total: e ? (Number.isFinite(e.total) ? e.total : e.rows.length) : 0, truncated: !!(e && e.truncated), listedAt: (e && e.listedAt) || null, ...extra });
  async function installedApps(hostId, { why = 'open', wait = true } = {}) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'this machine\'s apps are in the Apps launcher');
    const store = storeOf();
    const cached = store ? store.installedOf(hostId) : null;
    if (!IA.listDue(cached, why, Date.now())) return listAnswer(hostId, cached);
    // lane desktop-picker-instant: a dialog OPENING never waits for the machine to list (391–446 apps took 5–20 s on the
    // owner's Windows box) — `wait: false` answers the list it gave last with `listing: true`; the landed list is
    // announced (`desktop-installed-updated`) and the page's follow-up (`wait`) joins the listing in flight
    if (listing.has(hostId)) return wait ? listing.get(hostId) : listAnswer(hostId, cached, { listing: true });
    const p = (async () => {
      let dm;
      try { dm = await deviceOf(hostId); } catch (e) { if (e.code === 'unsupported-host') throw e; return listAnswer(hostId, cached, { code: e.code === 'host_needs_daemon' ? e.code : 'offline', error: e.message }); }
      const platform = platformOfHandle(dm);
      if (!M.DESKTOP_PLATFORMS.includes(platform)) throw notDesktop(hostId, platform);
      if (typeof dm.desktopAppsList !== 'function') return listAnswer(hostId, cached, { code: 'host_needs_daemon', error: `${hostId}: its agent cannot list its apps` });
      let r;
      const t0 = Date.now();
      try { r = await dm.desktopAppsList({ budgetMs: IA.LIST_BUDGET_MS, timeoutMs: IA.LIST_BUDGET_MS + 10000 }); }
      catch (e) { return listAnswer(hostId, cached, { code: e && e.code === 'host_needs_daemon' ? 'host_needs_daemon' : 'list_failed', error: `${hostId}: ${e && e.message}` }); }
      if (!r || r.ok === false) return listAnswer(hostId, cached, { code: (r && r.code) || 'list_failed', error: (r && r.error) || `${hostId} did not list its apps` });
      const at = Date.now();
      const rows = IA.rowsFromDevice(platform, r.rows, at);
      const entry = { platform, rows, total: Number.isFinite(r.total) ? r.total : rows.length, truncated: !!r.truncated, listedAt: at, ...(r.timedOut ? { timedOut: true } : {}) };
      if (store) store.noteInstalled(hostId, entry);
      log.log?.(`[desktop] ${hostId} listed ${rows.length} installed app(s) in ${at - t0} ms (${why})`);
      return listAnswer(hostId, entry);
    })().finally(() => listing.delete(hostId)).then((a) => { if (typeof broadcast === 'function') { try { broadcast(MC.installedPayload(hostId, a)); } catch { /* the notice never fails a listing */ } } return a; });
    listing.set(hostId, p);
    p.catch(() => { /* a refused listing is the waiting asker's answer — an open that did not wait never sees it */ });
    return wait ? p : listAnswer(hostId, cached, { listing: true });
  }
  /** An install through our door finished on a machine: its app is on the list AT ONCE (`pending` — nothing to press yet)
   *  and the machine is listed again; that listing (the machine's own records) replaces it. */
  function installedNow(hostId, name) {
    const store = storeOf();
    if (!store || !name) return;
    const cur = store.installedOf(hostId);
    const rows = [{ name: String(name).slice(0, 200), launch: null, source: 'install', seenAt: Date.now(), pending: true }, ...(cur ? cur.rows.filter((r) => r.name !== name) : [])];
    store.noteInstalled(hostId, { platform: cur ? cur.platform : null, rows, total: rows.length, truncated: !!(cur && cur.truncated), listedAt: cur ? cur.listedAt : null });
    installedApps(hostId, { why: 'install' }).catch((e) => log.warn?.(`[desktop] listing ${hostId}'s apps after the install failed: ${e && e.message}`));
  }
  // the daemon's hello (every dial-in): a Windows / macOS machine is listed once its link answers (IA.listDue 'hello' —
  // a flapping link is not listed twice a minute); any other machine, or an agent without the op, is never asked
  if (hosts && typeof hosts.addDialInHook === 'function') {
    hosts.addDialInHook((hostId) => {
      if (!hostId) return;
      // lane desktop-picker-instant: the machine's row is probed again once its link answers — an open picker hears it
      const again = setTimeout(() => { const h = hostList().find((x) => x.id === hostId); if (h) refreshHost(h, 'hello', { force: true }); }, helloListMs);
      again.unref?.();
      if (!storeOf()) return;
      const t = setTimeout(() => { installedApps(hostId, { why: 'hello' }).catch(() => { /* not a Windows / macOS machine, or gone again */ }); }, helloListMs);
      t.unref?.();
    });
  }

  /** §7.9: is this machine reachable RIGHT NOW without starting a connect ladder (this machine, or a paired machine
   *  whose agent handle is already connected)? The explorer's menu asks it so a right-click never bootstraps an ssh
   *  machine's agent — the click on "Open with LibreOffice" (an explicit act) is what connects. */
  /** lane desktop-v2-entry (design q-030 §3): the machine's OWN screen table through its agent (the `display-facts` op) — the
   *  display picker maps it onto the framebuffer. A machine whose agent predates the op answers `host_needs_daemon` (named). */
  async function displayFacts(hostId) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'this machine\'s own desktop is the Desktop window');
    const dm = await deviceOf(hostId);
    const platform = platformOfHandle(dm);
    if (!M.DESKTOP_PLATFORMS.includes(platform)) throw notDesktop(hostId, platform);
    if (typeof dm.displayFacts !== 'function') throw named('host_needs_daemon', `${hostId}: its agent cannot list its displays`);
    return dm.displayFacts();
  }
  /** lane stream-p1b-screen: the machine's SCREEN-SOURCE facts through its agent (the `stream-facts` op — HDR + SDR white per
   *  display, the ffmpeg found, the primary display's plan). An agent that predates the op answers `host_needs_daemon`. */
  async function streamFacts(hostId, { force = false } = {}) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'this machine\'s own desktop is the Desktop window');
    const dm = await deviceOf(hostId);
    const platform = platformOfHandle(dm);
    if (!M.DESKTOP_PLATFORMS.includes(platform)) throw notDesktop(hostId, platform);
    if (typeof dm.streamFacts !== 'function') throw named('host_needs_daemon', `${hostId}: its agent cannot read its screen facts`);
    return dm.streamFacts({ force });
  }
  /** lane stream-p1a-transport (design q-041 r2 §2): THE WEBRTC RUNG beside vnc-native — may this machine's desktop open as a
   *  low-latency stream from its agent (src/stream-model.js streamRungVerdict over the agent's hello-ack: the `stream-offer`
   *  capability and a source — this instance's fake source when it names one (VIBESPACE_STREAM_FAKE_SOURCE, for the suites
   *  and demos), else a Windows agent's own screen (`stream-screen`, lane stream-p1b-screen). Asks NOTHING of the machine (its hello is in hand); every "no"
   *  is named and the window shows the VNC picture. `want: 'window'` = ONE window of the machine instead of its screen —
   *  a Mac's (lane stream-p3m-build) or a Windows machine's application window (lane stream-p2w-build): the agent's
   *  `stream-window` capability, one verdict (int304). → { take, source, code, why, dm, platform, sourceId } */
  async function streamRung(hostId, { want = null } = {}) {
    if (isLocal(hostId)) return { take: false, source: null, code: 'not_desktop_machine', why: 'this machine\'s own desktop is the Desktop window', dm: null, platform: null, sourceId: null };
    const dm = await deviceOf(hostId);
    let info = {};
    try { const st = dm && dm.status ? dm.status() : null; info = (st && st.connected && st.info) || {}; } catch { info = {}; }
    const fake = String((env() || {}).VIBESPACE_STREAM_FAKE_SOURCE || '') || null;
    const v = SMOD.streamRungVerdict({ capabilities: info.capabilities || [], desktop: M.DESKTOP_PLATFORMS.includes(info.platform), platform: info.platform || null, fakeSource: fake, want }); // want: 'window' = ONE window (a Mac's or a Windows machine's — int304)
    return { ...v, dm, platform: info.platform || null };
  }
  /** lane stream-p2w-build: the machine's APPLICATION WINDOWS for the one-window stream's picker — or, with `restore`, that
   *  window brought back from minimized without the focus — through its agent (the `stream-windows` op). An agent that
   *  predates it answers `agent_too_old` naming the version it has. → the agent's answer */
  async function streamWindows(hostId, { restore = null } = {}) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'this machine\'s own windows are VibeSpace\'s own');
    const dm = await deviceOf(hostId);
    const platform = platformOfHandle(dm);
    if (!M.DESKTOP_PLATFORMS.includes(platform)) throw notDesktop(hostId, platform);
    const tooOld = (have) => ({ ok: false, code: 'agent_too_old', platform, have: have || null, need: AGENT_VERSION, error: `${hostName(hostId)}'s agent ${have ? `(${have}) ` : ''}cannot stream one window — it needs version ${AGENT_VERSION} or later` });
    if (typeof dm.streamWindows !== 'function') return tooOld(null);
    try { return await dm.streamWindows({ restore }); }
    catch (e) { if (e && e.code === 'host_needs_daemon') return tooOld(e.daemonVersion); throw named('host_unavailable', `${hostId}: ${e && e.message}`); }
  }
  /** lane stream-mac-stall: the strip's 「打开系统设置」 — the Mac shows the Settings pane itself (`screen` | `accessibility`)
   *  through its agent (the `settings-open` op). No Mac: not_mac; an agent that predates the op is never asked: `agent_too_old`
   *  naming the version it has (the page then copies the link, as before). → the agent's answer */
  async function settingsOpen(hostId, pane, { by = 'system:desktop-access' } = {}) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'this machine\'s own Settings are its own');
    const dm = await deviceOf(hostId);
    const platform = platformOfHandle(dm);
    if (platform !== 'darwin') return { ok: false, code: 'not_mac', platform, error: `${hostName(hostId)} is not a Mac` };
    const tooOld = (have) => ({ ok: false, code: 'agent_too_old', platform, have: have || null, need: AGENT_VERSION, error: `${hostName(hostId)}'s agent ${have ? `(${have}) ` : ''}cannot open its Settings — it needs version ${AGENT_VERSION} or later` });
    if (typeof dm.settingsOpen !== 'function') return tooOld(null);
    try { return await dm.settingsOpen(pane, { by }); }
    catch (e) { if (e && e.code === 'host_needs_daemon') return tooOld(e.daemonVersion); throw named('host_unavailable', `${hostId}: ${e && e.message}`); }
  }
  // ── design q-024 r1 §1.3–§1.4 (lane remoteapp-r1b): THE REMOTEAPP SETTINGS CARD'S DOORS — the owner's (the routes refuse an agent token) ──
  /** The machine's Remote Desktop facts through its agent (the `remoteapp-facts` op, read-only) → `{ ok, platform, facts, rows,
   *  ready }`. An agent that predates the op is never asked: `agent_too_old` naming the version it has and the one it needs
   *  (this hub's — the version that ships the op; never a guess). */
  async function remoteappFacts(hostId) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'RemoteApp reaches a PAIRED Windows machine — never this one');
    const dm = await deviceOf(hostId);
    const platform = platformOfHandle(dm);
    const pv = RA.platformVerdict(platform, hostName(hostId));
    if (pv) throw named(pv.code, pv.error);
    const tooOld = (have) => ({ ok: false, code: 'agent_too_old', platform, have: have || null, need: AGENT_VERSION, error: `${hostName(hostId)}'s agent ${have ? `(${have}) ` : ''}cannot read its Remote Desktop facts — it needs version ${AGENT_VERSION} or later` });
    if (typeof dm.remoteappFacts !== 'function') return tooOld(null);
    let f;
    try { f = await dm.remoteappFacts(); }
    catch (e) { if (e && e.code === 'host_needs_daemon') return tooOld(e.daemonVersion); throw named('host_unavailable', `${hostId}: ${e && e.message}`); }
    if (!f || f.ok !== true) return { ok: false, code: (f && f.code) || 'facts_failed', platform, error: (f && f.error) || 'the machine did not answer its facts' };
    return { ok: true, platform, facts: f, rows: RA.remoteappFactRows(f), ready: RA.factsReady(f) };
  }
  /** The card's view of the machine's sealed row: user + domain, whether a password is SET (never its bytes, never a tail), the
   *  pinned certificate — the store's machineView (src/server/integration-store.js) — and `refused`: the newest RemoteApp
   *  session of this machine ended rdp_cert_changed UNDER THE PIN STILL IN FORCE (the card's 「重新信任」 sentence; a re-trust
   *  moves the pin and the old refusal is no longer this pin's). */
  function remoteappSetupView(hostId) {
    const st = credentialsOf();
    if (!st || typeof st.machineView !== 'function') throw named('host_unavailable', 'the integration store is not wired on this instance');
    if (isLocal(hostId) || !hostKnown(hostId)) throw named('unsupported-host', `${JSON.stringify(hostId)} is not a paired machine on this instance`);
    const view = st.machineView(RA.CREDENTIAL_ROW, hostId);
    let last = null;
    try { const ds = typeof local === 'function' ? local() : local; last = ds && typeof ds.listApps === 'function' ? ds.listApps().find((r) => r.remoteapp && r.remoteapp.hostId === hostId && r.rdp) || null : null; } catch { last = null; }
    const refused = last && last.rdp.ended === 'rdp_cert_changed' && view.values.certFp && last.rdp.certFp === view.values.certFp ? { code: last.rdp.ended, id: last.id, at: last.endedAt || last.startedAt || null } : null;
    return { ...view, refused };
  }
  // one audit line per settings change / first connection (the exit proxy's ONE writer) — WHAT changed, never a value
  const auditRemoteapp = (hostId, verb, extra) => {
    if (typeof audit !== 'function') return;
    try { audit({ hostId, machine: hostName(hostId), sessionId: null, sessionKey: null, name: 'you — RemoteApp settings', by: 'user', verb, via: 'remoteapp', ...extra }); } catch (e) { log.warn?.(`[desktop] the RemoteApp ${verb} on ${hostId} was not audited: ${e && e.message}`); }
  };
  /** Save the sign-in typed on the card — `{ user, domain, password }` ONLY (the certificate is pinned by the first connection,
   *  never typed): the store validates, trims and SEALS the password; an omitted field stays as it was, '' clears it. */
  function saveRemoteappSetup(hostId, body = {}) {
    remoteappSetupView(hostId); // the same refusals first (no store / not a paired machine)
    const patch = {};
    for (const k of ['user', 'domain', 'password']) if (body && body[k] !== undefined) patch[k] = body[k];
    credentialsOf().setMachineValues(RA.CREDENTIAL_ROW, hostId, patch);
    auditRemoteapp(hostId, 'remoteapp-setup', { ok: true, fields: Object.keys(patch) });
    return remoteappSetupView(hostId);
  }
  /** 「首次连接」 / 「重新信任」 — the owner's click: ONE sign-in with no app through the loopback forward (this machine's keeper
   *  runs it: src/desktop-serve.js trustRemoteApp — `/auth-only /cert:tofu` into a fresh config dir), and the certificate the
   *  machine showed is PINNED on its sealed row. A failed sign-in pins nothing. → the card's view */
  async function trustRemoteApp(hostId) {
    if (isLocal(hostId)) throw named('not_desktop_machine', 'RemoteApp reaches a PAIRED Windows machine — never this one');
    remoteappSetupView(hostId);
    const dm = await deviceOf(hostId);
    const pv = RA.platformVerdict(platformOfHandle(dm), hostName(hostId));
    if (pv) throw named(pv.code, pv.error);
    await remoteappSignin(hostId); // the user + password are asked HERE first: the card hears what is missing before anything opens
    let r;
    try { r = await localOf().trustRemoteApp({ hostId, machine: hostName(hostId) }); }
    catch (e) { auditRemoteapp(hostId, 'remoteapp-trust', { ok: false, refusal: (e && e.code) || 'error' }); throw e; }
    const before = remoteappSetupView(hostId).values.certFp || null;
    credentialsOf().setMachineValues(RA.CREDENTIAL_ROW, hostId, { certFp: r.certFp });
    const view = remoteappSetupView(hostId);
    auditRemoteapp(hostId, 'remoteapp-trust', { ok: true, certFp: r.certFp, ...(before && before !== r.certFp ? { replaced: before } : {}) });
    log.log?.(`[desktop] RemoteApp: ${hostId}'s Remote Desktop certificate pinned at the owner's click (sha256 ${r.certFp.slice(0, 11)}…)`);
    return { ...view, changed: !!before && before !== r.certFp, client: r.client || null };
  }

  // ── lane desktop-vnc-remember (owner 2026-10-19 「现在远程桌面密码能保留了吧 就存到 vault 里？」): A MACHINE'S DESKTOP SIGN-IN,
  // REMEMBERED — the sealed integration row `desktop-signin/<hostId>` {auth, username?, password} (its key is the vault's).
  // WRITTEN only by the person's sign-in dialog with 「记住这台机器的登录」 ticked, after the machine took that sign-in (POST
  // …/signin: the page sends it ONCE; no answer ever carries it back); READ only by the picture bridge when a window connects
  // (machineDesktopTarget's `signIn.take` — the hub answers the machine's handshake itself, src/server/rfb-signin.js). A
  // refusal there is remembered against THAT row (`signinRefused` — a machine's lockout counts failures: the hub never tries
  // it again until the person signs in anew or forgets it); unpairing the machine forgets it (hosts.onRemoved below).
  const signinRefused = new Map(); // hostId → the updatedAt of the row the machine refused
  const hubSpeaks = (vnc) => !!(vnc && vnc.ok && vnc.reply !== 'RFB 003.003\n' && RS.rowAuthOf(vnc.type)); // verify r1: an RFB 3.3 server picks the type itself — the gate never answers one: no tick, no auto
  const sealedSignin = (hostId) => { const st = credentialsOf(); return st && typeof st.resolveMachine === 'function' ? st.resolveMachine('desktop-signin', hostId) : null; }; // the row's id spelled at the call (the registry's consumer census)
  /** Is the vault locked (the store's key unreadable for that reason — src/key-file.js VAULT_LOCKED)? */
  const vaultLocked = () => { const st = credentialsOf(); try { const r = st && typeof st.keyRefusal === 'function' ? st.keyRefusal() : null; return !!r && r.code === KF.VAULT_LOCKED; } catch { return false; } };
  /** THE STATE the page words (never a secret): `kept` a row exists · `auth` its kind · `at` when it was written · `locked`
   *  the vault is · `refused` the machine refused THIS row · `can` the hub could sign in to this machine (its sign-in type,
   *  from the last probe — the dialog offers the tick only then) · `auto` the next connection is signed in by the hub. */
  function signinState(hostId) {
    const st = credentialsOf();
    const vnc = (desktops.get(hostId) || {}).vnc || null;
    const can = !!(st && typeof st.setMachineValues === 'function' && hubSpeaks(vnc));
    let view = null;
    try { view = st && typeof st.machineView === 'function' ? st.machineView('desktop-signin', hostId) : null; } catch { view = null; }
    const kept = !!(view && view.hasValues);
    const at = kept ? view.updatedAt || null : null;
    const auth = kept ? view.values.auth || null : null;
    const locked = vaultLocked();
    const refused = kept && signinRefused.has(hostId) && signinRefused.get(hostId) === at;
    const auto = kept && !locked && !refused && hubSpeaks(vnc) && RS.pickType(auth, vnc.types) !== null;
    return { kept, auth, at, locked, refused, can, auto };
  }
  /** The sealed row opened for ONE connection of the bridge — null when the hub does not sign in by itself. */
  function rememberedSignin(hostId) {
    const s = signinState(hostId);
    if (!s.auto) return null;
    const r = sealedSignin(hostId);
    const v = (r && r.values) || {};
    if (!v.password || !RS.AUTHS.includes(v.auth)) return null;
    return { auth: v.auth, username: v.username || '', password: v.password, at: s.at };
  }
  // one audit line per remember / forget (the exit proxy's ONE writer) — WHAT happened, never a value
  const auditSignin = (hostId, verb, extra) => {
    if (typeof audit !== 'function') return;
    try { audit({ hostId, machine: hostName(hostId), sessionId: null, sessionKey: null, name: 'you — desktop sign-in', by: 'user', verb, via: 'desktop', ...extra }); } catch (e) { log.warn?.(`[desktop] the ${verb} on ${hostId} was not audited: ${e && e.message}`); }
  };
  const signinStore = () => { const st = credentialsOf(); if (!st || typeof st.setMachineValues !== 'function') throw named('host_unavailable', 'the integration store is not wired on this instance'); return st; };
  const pairedOnly = (hostId) => { if (isLocal(hostId) || !hostKnown(hostId)) throw named('unsupported-host', `${JSON.stringify(hostId)} is not a paired machine on this instance`); };
  /** GET …/signins[?host=] — ONE machine's state, or every machine that has a row kept ({ signins: {hostId: state}, locked }). */
  function signinsView(hostId = null) {
    if (hostId) { pairedOnly(hostId); return { signin: signinState(hostId) }; }
    const out = {};
    let list = [];
    try { list = hosts && typeof hosts.list === 'function' ? hosts.list() : []; } catch { list = []; }
    for (const h of list) { if (!h || isLocal(h.id)) continue; const s = signinState(h.id); if (s.kept) out[h.id] = s; }
    return { signins: out, locked: vaultLocked() };
  }
  /** 「记住这台机器的登录」 — the sign-in the machine just took, SEALED: `{ username?, password }` (the row's kind is the hub's
   *  own probe of the machine, never the page's word). Refused by name: the vault locked (nothing stored), a sign-in type the
   *  hub cannot answer itself, a missing part. → the state */
  function rememberSignin(hostId, body = {}) {
    pairedOnly(hostId);
    const st = signinStore();
    const vnc = (desktops.get(hostId) || {}).vnc || null;
    const auth = hubSpeaks(vnc) ? RS.rowAuthOf(vnc.type) : null;
    if (!auth) throw named('signin_unsupported', `the hub cannot sign in to ${hostName(hostId)}'s VNC server by itself (${vnc && vnc.ok ? `its sign-in type ${vnc.type}` : 'it was not reached yet'}) — nothing was stored`);
    if (vaultLocked()) throw named('vault_locked', 'the vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it); nothing was stored');
    const password = body && typeof body.password === 'string' ? body.password : '';
    const username = body && typeof body.username === 'string' ? body.username : '';
    if (!password) throw named('bad-request', 'a password is required — nothing was stored');
    if (RS.namesUser(auth) && !username) throw named('bad-request', 'a user name is required for this machine — nothing was stored');
    st.setMachineValues('desktop-signin', hostId, { auth, username: RS.namesUser(auth) ? username : '', password });
    signinRefused.delete(hostId);
    auditSignin(hostId, 'desktop-signin-remember', { ok: true, auth });
    log.log?.(`[desktop] ${hostId}: its desktop sign-in remembered — sealed (${auth})`);
    return signinState(hostId);
  }
  /** 「忘掉登录」 — the row gone (allowed while the vault is locked: nothing is opened). → the state */
  function forgetSignin(hostId) {
    pairedOnly(hostId);
    const st = signinStore();
    const had = signinState(hostId).kept;
    st.clearMachineValues('desktop-signin', hostId);
    signinRefused.delete(hostId);
    if (had) { auditSignin(hostId, 'desktop-signin-forget', { ok: true }); log.log?.(`[desktop] ${hostId}: its desktop sign-in forgotten`); }
    return signinState(hostId);
  }
  /** A machine UNPAIRED (src/hosts.js remove → onRemoved): every sign-in this layer sealed for it is forgotten — its desktop
   *  sign-in and its RemoteApp sign-in — and its opened desktop dropped. */
  function forgetMachineSignins(hostId) {
    desktops.delete(hostId);
    signinRefused.delete(hostId);
    const st = credentialsOf();
    if (!st || typeof st.clearMachineValues !== 'function') return;
    for (const row of ['desktop-signin', RA.CREDENTIAL_ROW]) {
      let had = false;
      try { had = !!st.machineView(row, hostId).hasValues; } catch { had = false; }
      if (!had) continue;
      try { st.clearMachineValues(row, hostId); auditSignin(hostId, `${row}-forget`, { ok: true, why: 'unpaired' }); log.log?.(`[desktop] ${hostId} was unpaired — its ${row} sign-in forgotten`); }
      catch (e) { log.warn?.(`[desktop] ${hostId} was unpaired, but its ${row} sign-in could not be forgotten: ${(e && e.code) || (e && e.message)}`); }
    }
  }
  if (hosts && typeof hosts.onRemoved === 'function') hosts.onRemoved((hostId) => forgetMachineSignins(hostId));

  /** The hub ⇄ machine link's round trip now (one mux PING) — the stats strip's second number. → { ms } | { ms: null } */
  async function linkPing(hostId) {
    if (isLocal(hostId)) return { ms: 0 };
    const dm = await deviceOf(hostId);
    const t0 = Date.now();
    const okPing = typeof dm.ping === 'function' ? await dm.ping(1500) : false;
    return { ms: okPing ? Date.now() - t0 : null };
  }
  function connectedNow(hostId) {
    if (isLocal(hostId)) return true;
    try { return !!(hosts && typeof hosts.connectedDevice === 'function' && hosts.connectedDevice(hostId)); } catch { return false; }
  }

  const layer = { call, forwardPort, closeForward, forwards: listForwards, hostKnown, isLocal, shutdown, machines, installPlan, installXpra, installPackage, installBusy, runArgv, readFile, connectedNow, setAppPlanner, planDigest, probeDesktop, machinesNow, openMachineDesktop, streamRung, machineDesktopTarget, machineDesktopGone, runOnDesktop, installedApps, installedNow, deviceOf, displayFacts, streamFacts, streamWindows, settingsOpen, linkPing, remoteappSetup, remoteappForward, setRdpSetup, launchRemoteApp, remoteappSignin, remoteappFacts, remoteappSetupView, saveRemoteappSetup, trustRemoteApp, signinsView, rememberSignin, forgetSignin, micFacts, micDefault };
  if (install) installed = layer;
  return layer;
}

module.exports = { create, access };
