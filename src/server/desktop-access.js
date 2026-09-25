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
const path = require('path');
const { spawn } = require('child_process');
const S = require('../desktop-serve.js');
const M = require('../desktop-apps.js');

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
    installBusy: () => null,
  };
}

const named = (code, msg) => { const e = new Error(msg); e.code = code; return e; };
const INSTALL_LOG_NAME = `~/.vibespace/${M.INSTALL_FILES.log}`; // how a message names where the install's log is (a device's; the hub's own is data/)

/**
 * @param hosts   HostManager (deviceBounded / get / isLocal) or null (local only)
 * @param local   () => THIS machine's desktop-serve handle (the hub keeper's `machine`)
 */
function create({ hosts = null, local = null, env = () => process.env, log = console, install = true, connectMs = 8000, installMs = 15 * 60 * 1000, holdMs = 60 * 60 * 1000, pollMs = 15000 } = {}) {
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
  async function call(hostId, action, params = {}) {
    if (!S.DESKTOP_SERVE_OPS.includes(action)) throw named('bad-request', `unknown desktop-serve op '${action}'`);
    let r;
    if (isLocal(hostId)) r = await S.runDesktopServeOp(localOf(), action, params);
    else {
      const dm = await deviceOf(hostId);
      try { r = await dm.desktopServe(action, params); }
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
  /** Every machine the launch dialog may offer (this machine first), each with the PURE picker verdict
   *  (src/desktop-apps.js machinePickRow) — greyed rows carry their code, nothing is hidden. The label is a DISPLAY
   *  string (the host record's name): it goes to the dialog and the window title, never into a spawn. */
  async function machines() {
    const out = [{ hostId: 'local', label: null, transport: 'local', link: 'online', connected: true, platform: process.platform, ...M.machinePickRow({ hostId: 'local' }) }];
    let list = [];
    try { list = hosts && typeof hosts.list === 'function' ? hosts.list() : []; } catch { list = []; }
    const rows = await Promise.all(list.map(async (h) => {
      let link = 'unknown';
      try { link = typeof hosts.linkState === 'function' ? hosts.linkState(h.id) : (h.online ? 'online' : 'unknown'); } catch { link = 'unknown'; }
      const dm = await handleIfConnected(h);
      const info = dm && dm.status ? (dm.status().info || null) : null;
      const row = { hostId: h.id, label: String(h.name || h.id), transport: h.transport === 'dial' ? 'dial' : 'ssh', link: info ? 'online' : link, connected: !!info, capabilities: info && Array.isArray(info.capabilities) ? info.capabilities : null, platform: info ? info.platform || null : null };
      return { ...row, ...M.machinePickRow(row) };
    }));
    return out.concat(rows);
  }
  /** The install rung's facts + the PURE plan for one machine: the plan is SHOWN before anything runs. */
  async function installPlan(hostId) {
    const r = await call(hostId, 'facts', { install: true });
    const plan = M.xpraInstallPlan(r.install);
    return { hostId: isLocal(hostId) ? 'local' : hostId, facts: r.install || null, plan };
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
  async function runArgv(hostId, argv, { onData = () => { }, stateDir = '', mode = 'start' } = {}) {
    const launch = M.installLauncherArgv(argv, { stateDir, mode });
    let timer = null, abandoned = false;
    const relay = (d) => { if (!abandoned) onData(d); }; // the dialog's stream is closed once we answered
    const deadline = new Promise((_, rj) => { timer = setTimeout(() => rj(named('install_timeout', `the install on ${machineName(hostId)} did not finish within ${spell(installMs)} — it is still running there (VibeSpace never stops apt halfway; it runs detached, its log in ${stateDir ? path.join(String(stateDir), M.INSTALL_FILES.log) : INSTALL_LOG_NAME}); no second install starts until it ends, then check again`)), installMs); timer.unref?.(); });
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
      const stream = dm.runStream(launch[0], launch.slice(1), { env: { LC_ALL: 'C' }, onData: relay, timeoutMs: installMs + holdMs });
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
  async function installXpra(hostId, { onData = () => { }, onReattach = () => { } } = {}) {
    const key = machineKey(hostId);
    const cur = installs.get(key);
    if (cur) throw named('busy', `an install is already running on ${machineName(hostId)} (started ${new Date(cur.since).toISOString()}) — wait for it to finish, then check again`);
    const slot = { since: Date.now(), running: false };
    installs.set(key, slot);
    let held = null;
    try {
      const { plan, facts } = await installPlan(hostId);
      const running = facts && facts.installing && facts.installing.pid ? facts.installing : null;
      if (!running) {
        if (!plan.ok) { const e = named(plan.code, plan.error); e.plan = plan; throw e; }
        if (!plan.canRun) { const e = named('no_sudo', plan.error); e.plan = plan; throw e; }
        log.log?.(`[desktop] installing xpra on ${hostId || 'this machine'} from ${plan.source} (${plan.packages.join(' ')}), detached`);
      } else {
        if (running.since) slot.since = running.since;
        log.log?.(`[desktop] an install is still running on ${hostId || 'this machine'} (pid ${running.pid}) — re-attached to its log`);
        try { onReattach({ pid: running.pid, since: running.since || null }); } catch { /* the dialog is gone */ }
      }
      slot.running = true;
      let r;
      try { r = await runArgv(hostId, plan.ok ? M.installArgv(plan) : ['false'], { onData, stateDir: (facts && facts.stateDir) || '', mode: running ? 'follow' : 'start' }); }
      catch (e) { if (e && (e.code === 'install_timeout' || e.code === 'install_link_lost')) held = e.code; if (e && !e.plan) e.plan = plan; throw e; }
      if (r.code === M.INSTALL_UNRECORDED_EXIT) { const e = named('install_unrecorded', `the install on ${hostId || 'this machine'} ended without recording its exit (it was stopped, or the machine restarted) — check again`); e.plan = plan; throw e; }
      if (r.code !== 0) { const e = named('install_failed', `the install exited ${r.code} on ${hostId || 'this machine'} — the log above says why`); e.plan = plan; throw e; }
      const after = await call(hostId, 'facts', { install: true });
      return { ok: true, hostId: isLocal(hostId) ? 'local' : hostId, plan, before: facts, after: after.install || null, facts: after.facts || null, reattached: !!running };
    } finally {
      if (!held) installs.delete(key);
      else holdUntilGone(hostId, key, slot, held);
    }
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

  const layer = { call, forwardPort, closeForward, forwards: listForwards, hostKnown, isLocal, shutdown, machines, installPlan, installXpra, installBusy, runArgv, readFile };
  if (install) installed = layer;
  return layer;
}

module.exports = { create, access };
