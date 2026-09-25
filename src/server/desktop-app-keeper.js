'use strict';
/**
 * DESKTOP-APP KEEPER — the REGISTRY + POLICY of every desktop application
 * VibeSpace opens in a window (docs/design-desktop-apps.zh.md §2 row 3; P8-1,
 * 2026-09-13; r2 2026-09-14). ORCH tier: it knows NO application, NO rung and
 * touches NO WebSocket (the bridge is src/server/desktop-stream.js, the
 * routes src/routes/desktop-apps.js).
 *
 * LANE C1 (2026-09-25, docs/design-desktop-apps-seamless.zh.md §3.5): the
 * half that happens ON THE MACHINE — bring-up, part identity, the marker
 * census, teardown, the fit belt, window enumeration, the resource SAMPLE and
 * the record file — moved VERBATIM to the SHARED src/desktop-serve.js (the
 * daemon bundles the same module; its essay carries the keeper's ten rules).
 * THIS file keeps what a hub decides: the x5 viewer election, the IDLE
 * verdict, the resource REPORT (never a stop — the 2.369.171 law), the Scale ▸
 * relaunch's seat carry, and the broadcasts. For device #0 the machine keeper
 * runs IN-PROCESS and the two halves share ONE store (data/desktop-apps.json,
 * every record `hostId: 'local'`): the hub's policy reaches it through the
 * install hooks, called exactly where the pre-extraction keeper ran that code,
 * so the local behaviour is byte-identical. A paired device's apps are reached
 * through src/server/desktop-access.js (the `desktop-serve` agentd op).
 *
 * The policy, as it always was:
 *   · a COUNT CAP (a refusal AT LAUNCH naming the holders — never a kill;
 *     counted by the machine over its own sessions)
 *   · a RESOURCE REPORT, NEVER A STOP (the owner's 2026-09-25 ruling: "这个
 *     keeper到底是干啥的，没必要别乱加会影响使用的feature" — a person is using
 *     this app; Chrome legitimately passes any fixed ceiling). One /proc
 *     sample per GUARD_SAMPLE_MS over the whole session set; memory = ΣPss
 *     (never a sum of VmRSS), judged by src/runaway-guard.js against
 *     src/keeper-limits.js (a browser row by the browser numbers, `guardFor`).
 *     OVER ⇒ the live row carries it, a server notice when a crossing begins
 *     (r2: re-armed only by 3 clear samples under 90 % of the line, never
 *     within an hour of the last one, re-sent under the same key when no
 *     client received it), telemetry `desktop-app-resource` — and the
 *     app keeps running: no stop, no park, no profile removed. Until
 *     2026-09-25 this was a runaway STOP + an hour's PARK + the profile
 *     deleted; the headless OpenCode serve keeps that policy, nothing a
 *     person uses does
 *   · per-app IDLE timeout from the last INPUT the bridge reported (DA3:
 *     30 min default, settings `desktop.idleTimeoutMin`, 0 = never; "keep
 *     running" is one explicit action)
 *   · stop = SIGTERM the app, then the picture server, then the WM, then the
 *     X display, each VERIFIED gone (SIGKILL after a grace), then whatever
 *     still carries the session marker (rule 10) — no orphans on a machine
 *     with a readable /proc (the machine half's rules 1–10, src/desktop-serve.js)
 *   · every state change is saved AND broadcast (`desktop-apps-updated`)
 */
const M = require('../desktop-apps');
const RG = require('../runaway-guard'); // the ONE resource verdict + guard pick + report level (2026-09-25: report only, never a stop)
const LIMITS = require('../keeper-limits');
const displayFacts = require('../desktop-display');
const DV = require('../desktop-viewers');
const DS = require('../desktop-serve'); // THE MACHINE HALF (SHARED — the daemon bundles it)
const fs = require('fs');
const path = require('path');
const namedError = (code, msg) => { const e = new Error(msg); e.code = code; return e; };

/** P8-2 x5 defaults (2.369.156, the verifier's two INFO items made the
 *  product's defaults): when the ACTIVE viewer's socket closes while other
 *  viewers remain, the seat is HELD for its pane for VIEWER_GRACE_MS — a
 *  page reload or a network blip must not hand the app to another device;
 *  the same pane (or the window that names it as its predecessor, `prev`)
 *  reconnecting inside the grace takes the seat back, and only when the
 *  grace runs out is the most recently active remaining viewer elected. */
const VIEWER_GRACE_MS = 5000;
/** Desktop A r1: a Scale ▸ relaunch CARRIES the old window's active pane to the successor — held (every other joiner
 *  blocked) through the old session's teardown, then for RELAUNCH_SEAT_MS after the answer for that pane to attach.
 *  Without it the relaunching client (it learns the successor from the HTTP answer, after the teardown) always lost the
 *  first-attach election to a client that retargeted from the `replacedBy` broadcast (measured: the blocked one won). */
const RELAUNCH_SEAT_MS = 10000;
/** The xpra rung's app title for a BLOCKED pane (it has no protocol session
 *  to read it from): re-read from X (`windows(id)`, two spawns) when a
 *  blocked seat appears and on the tick while one exists, at most this often. */
const XPRA_TITLE_EVERY_MS = 10000;
/** LANE C2 — the hub's REGISTRY of a paired machine's apps (D8: the device holds the record, the hub keeps what it
 *  last saw so a restart can show — and re-ask — an app whose machine is not answering): data/<REMOTE_FILE>, ONE
 *  file beside the local store and never inside it (the local machine keeper owns data/desktop-apps.json whole; a
 *  remote record there would be judged by THIS machine's pids and reaped). */
const REMOTE_FILE = 'desktop-apps-hosts.json';
/** A launching remote record is re-asked this often until it settles (the tick's cadence would make the window wait
 *  up to a whole TICK_MS after the device's app was ready); bounded by REMOTE_SETTLE_MS. */
const REMOTE_FOLLOW_MS = 400;
const REMOTE_SETTLE_MS = 45000;
/** A machine that did not answer is re-asked at most this often (every live record of an offline machine would
 *  otherwise start a connect attempt per tick). */
const REMOTE_OFFLINE_RETRY_MS = 30000;
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * @param {object} deps
 *   dataDir        — the instance's data/ (record + per-app logs)
 *   env            — () => sanitised base env (ws-handler.agentEnv), NEVER process.env
 *   broadcast      — (msg) => void  (desktop-apps-updated)
 *   serverSetting  — (key) => value (desktop.idleTimeoutMin, desktop.backendPrefs, desktop.appScale)
 *   getTelemetry   — () => telemetry | null
 *   singleton      — optional () => ({ running, display, port, authFile, refresh? }) — the
 *                    pre-existing in-container desktop (src/vnc.js) for the
 *                    desktop-singleton rung; absent ⇒ that rung never resolves.
 *                    `refresh()` (= vnc.js status()) is asked before every verdict.
 *   display        — the desktop-display module (injectable for the suite)
 *   limits         — src/keeper-limits (injectable: the resource suite shrinks them)
 *   serverNotice   — optional (key, text, opts) => number — the resource report (server.js's notice; returns the clients
 *                    it reached — 0 ⇒ the report level re-sends the same key on the next over sample)
 *   registryRows   — the registry (default DEFAULT_REGISTRY; the suite hands a CPU burner)
 *   backends       — the capability table (default M.DISPLAY_BACKENDS; the suite hands a copy
 *                    with a fourth rung to prove this file needs no change for one)
 *   log, now, tickMs, geometry, hostId
 *   fitSlowBeltMs  — the settled belt's cadence (default FIT_SLOW_BELT_MS; the suite shrinks it)
 *   viewerGraceMs  — x5: how long the active pane's seat is held after its socket closed (default VIEWER_GRACE_MS; 0 = re-elect at once)
 *   relaunchSeatMs — A r1: how long a relaunch's carried seat waits for its pane after the answer (default RELAUNCH_SEAT_MS)
 */
function create({ dataDir, env, broadcast, serverSetting = () => undefined, getTelemetry = () => null, serverNotice = null, singleton = null,
  display = displayFacts, limits = LIMITS, registryRows = M.DEFAULT_REGISTRY, backends = M.DISPLAY_BACKENDS, log = console, now = Date.now, tickMs = DS.TICK_MS, guardSampleMs = null, geometry, hostId = null, fitSlowBeltMs = DS.FIT_SLOW_BELT_MS, viewerGraceMs = VIEWER_GRACE_MS, relaunchSeatMs = RELAUNCH_SEAT_MS,
  access = null, hostLabel = (h) => h, remoteHosts = () => [] } = {}) {
  if (!dataDir) throw new Error('desktop-app-keeper: dataDir is required');
  if (typeof env !== 'function') throw new Error('desktop-app-keeper: env must be a function returning the sanitised base env');

  // ── state (the POLICY's; the machine's lives in src/desktop-serve.js) ──
  const guard = new Map();      // id -> { prev, hotSince, report: { reported, crossings }, memOffSaid } (the report level's slot)
  const live = new Map();       // id -> { cpuPct, memBytes, memMetric, rssBytes (deprecated), pids, over, since, sampledAt }
  // P8-2 x5 — THE VIEWERS of each app window (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"): ONE active
  // human viewer per window, the rule PURE in src/desktop-viewers.js. Viewer ids only — the sockets are the bridge's (this
  // file touches no WebSocket); never persisted: a restart re-elects from the sockets that come back.
  const viewerSets = new Map(); // id -> { active: viewerId|null, entries: Map viewerId -> {viewerId, pane, label, since, joinedAt}, paneActiveAt: Map pane -> ms, grace: {pane, timer, until}|null }
  const viewerListeners = new Set();
  const titleReads = new Map(); // id -> { at, inflight } (x5: the xpra rung's app title for a blocked pane)
  let dirty = false;            // the report's live row changed (the machine's end-of-tick commit carries it)
  let timer = null;

  // THE MACHINE KEEPER of device #0 — in-process, ONE store shared with this registry; the policy is handed in as hooks
  const machine = DS.install({ dataDir, env, serverSetting, singleton, display, limits, registryRows, backends, log, now, tickMs, guardSampleMs, geometry, hostId, fitSlowBeltMs,
    hooks: { view, onCommit: () => { dirty = false; notify(); }, idle: idleVerdict, readyTick, onSample: reportSample, onTeardown } });
  /** The shared store, read through the machine (it owns load/save). */
  const store = { get apps() { return machine._store().apps; } };

  function notify() {
    try { broadcast?.({ type: 'desktop-apps-updated', apps: listApps() }); } catch (e) { log.warn?.(`[desktop] broadcast failed: ${e.message}`); }
    // x5: a session that ended takes its viewer set with it — the bridge's refresh closes the sockets it still holds open
    for (const id of [...viewerSets.keys()]) { const r = recOf(id); if (!r || !M.isLiveState(r.state)) { clearGrace(viewerSets.get(id)); viewerSets.delete(id); titleReads.delete(id); publishViewers(id); } }
  }
  /** The stored record of an id on ANY machine (the local store first) — the remote one as the hub last saw it. */
  function recOf(id) { return store.apps[id] || (remoteOf(id) || {}).rec || null; }
  function commit() { machine.commit(); }

  // ── P8-2 x5: the viewer election (see the state block) ──
  const seatOf = (id) => { let s = viewerSets.get(id); if (!s) { s = { active: null, entries: new Map(), paneActiveAt: new Map(), grace: null }; viewerSets.set(id, s); } return s; };
  const clearGrace = (s) => { if (s && s.grace) { clearTimeout(s.grace.timer); s.grace = null; } };
  /** The `desktop-app-viewers` payload: viewers by their PUBLIC pane key, the active pane (never a socket's id) —
   *  during a grace the pane that holds the seat while it reconnects (so the others stay blocked, never "nobody"). */
  function viewersView(id) { const s = viewerSets.get(id); return DV.viewersView(id, { active: s ? s.active : null, activePane: s && s.grace ? s.grace.pane : null }, s ? [...s.entries.values()] : []); }
  function publishViewers(id) {
    const v = viewersView(id);
    try { broadcast?.(v); } catch (e) { log.warn?.(`[desktop] viewers broadcast failed: ${e.message}`); }
    for (const fn of viewerListeners) { try { fn(id, v); } catch (e) { log.warn?.(`[desktop] a viewers listener failed: ${e && e.message}`); } }
  }
  /** Moves the active seat, stamping the instant each pane stopped / started being active (the re-election's recency). */
  function moveActive(s, viewerId) {
    const t = now();
    const prev = s.active != null ? s.entries.get(s.active) : null;
    if (prev) s.paneActiveAt.set(prev.pane, t);
    s.active = viewerId != null ? String(viewerId) : null;
    const cur = s.active != null ? s.entries.get(s.active) : null;
    if (cur) s.paneActiveAt.set(cur.pane, t);
  }
  const paneOf = (s, viewerId) => { const e = viewerId != null ? s.entries.get(String(viewerId)) : null; return e ? e.pane : null; };
  /** A viewer's socket opened. The first one (or the first after the active one left) becomes active; the ACTIVE
   *  pane reconnecting through a NEWER socket takes the seat with it at once (LOW-4: a pane is one client — its older
   *  socket may be a silent drop the pings have not noticed yet, up to two rounds); during a grace the seat is the
   *  held pane's (or its successor's, `prev`), every other joiner is blocked. */
  function viewerJoined(id, { viewerId, pane = null, prev = null, label = '' } = {}) {
    if (!id || !viewerId) return null;
    const s = seatOf(id);
    const v = String(viewerId), p = String(pane || viewerId), pv = prev != null && prev !== '' ? String(prev) : null;
    const t = now();
    let since = t;
    for (const e of s.entries.values()) if (e.pane === p && e.since < since) since = e.since; // a pane reconnecting keeps its first join
    s.entries.set(v, { viewerId: v, pane: p, label: String(label || '').slice(0, 80), since, joinedAt: t });
    const cur = s.active != null ? s.entries.get(s.active) : null;
    if (cur && cur.pane === p && s.active !== v) {
      moveActive(s, v);
      log.log?.(`[desktop] ${id}: the active pane ${p} reconnected through a new socket — the seat moves to it (a pane is one client; its older socket is cut)`);
    } else if (s.grace && (s.grace.pane === p || (pv !== null && s.grace.pane === pv))) {
      const held = s.grace.pane;
      clearGrace(s);
      if (held !== p && s.paneActiveAt.has(held)) s.paneActiveAt.set(p, s.paneActiveAt.get(held)); // the successor inherits its predecessor's recency
      moveActive(s, v);
      log.log?.(`[desktop] ${id}: pane ${p}${held !== p ? ` (the successor of pane ${held})` : ''} came back inside the ${Math.round(viewerGraceMs / 1000)} s grace — it keeps the seat`);
    } else if (!s.grace) {
      const next = DV.activeAfterJoin({ active: s.active }, [...s.entries.values()], v);
      if (next !== s.active) { moveActive(s, next); log.log?.(`[desktop] ${id}: viewer pane ${p} is ACTIVE (first attach) — its pane drives the app, the others are blocked`); }
    }
    publishViewers(id);
    if (s.active !== v) refreshAppTitle(id, 'blocked-join'); // a blocked pane has no protocol to name the app — the record does (xpra rung)
    return viewersView(id);
  }
  /** The grace ran out with nobody back: the most recently active remaining viewer takes over. */
  function graceExpired(id) {
    const s = viewerSets.get(id);
    if (!s || !s.grace) return;
    const held = s.grace.pane;
    s.grace = null;
    if (s.active == null) {
      const next = DV.nextActive([...s.entries.values()], null, s.paneActiveAt);
      if (next) { moveActive(s, next); log.log?.(`[desktop] ${id}: pane ${held} did not come back within ${Math.round(viewerGraceMs / 1000)} s — pane ${paneOf(s, next)} (the most recently active) takes over`); }
    }
    publishViewers(id);
  }
  /** A viewer's socket closed: when it was the active one and others remain, the seat is HELD for its pane for
   *  viewerGraceMs (a reload / a blip must not hand the app to another device), then the most recently active
   *  remaining viewer takes over; with a grace of 0 at once. */
  function viewerLeft(id, viewerId) {
    const s = viewerSets.get(id);
    const v = viewerId != null ? String(viewerId) : null;
    if (!s || v == null || !s.entries.has(v)) return false;
    const wasActive = s.active === v;
    const leftPane = paneOf(s, v);
    if (wasActive) moveActive(s, null);
    s.entries.delete(v);
    if (wasActive && s.entries.size) {
      if (viewerGraceMs > 0) {
        clearGrace(s);
        const timer = setTimeout(() => graceExpired(id), viewerGraceMs);
        timer.unref?.();
        s.grace = { pane: leftPane, timer, until: now() + viewerGraceMs };
        log.log?.(`[desktop] ${id}: the active viewer (pane ${leftPane}) left — its seat is held ${Math.round(viewerGraceMs / 1000)} s for it to come back, the others stay blocked`);
      } else {
        const next = DV.nextActive([...s.entries.values()], v, s.paneActiveAt);
        if (next) { moveActive(s, next); log.log?.(`[desktop] ${id}: the active viewer (pane ${leftPane}) left — pane ${paneOf(s, next)} (the most recently active) takes over`); }
      }
    } else if (wasActive) log.log?.(`[desktop] ${id}: the active viewer (pane ${leftPane}) left — nobody else is watching`);
    if (!s.entries.size) { clearGrace(s); viewerSets.delete(id); }
    publishViewers(id);
    return true;
  }
  /** "Resume here": this viewer becomes the active one, the previous active one is blocked (a pending grace ends —
   *  a person's explicit move wins). */
  function takeoverViewer(id, viewerId) {
    const s = viewerSets.get(id);
    const v = viewerId != null ? String(viewerId) : null;
    if (!s || v == null || !s.entries.has(v)) return { ok: false, code: 'no_viewer', error: `no live viewer of ${id} by that id — the pane is not connected (reconnect, then Resume here)` };
    if (s.active === v) return { ok: true, already: true, viewers: viewersView(id) };
    const prevPane = paneOf(s, s.active) || (s.grace ? s.grace.pane : null);
    clearGrace(s);
    moveActive(s, v);
    log.log?.(`[desktop] ${id}: pane ${paneOf(s, v)} RESUMED here — it is active${prevPane ? `, pane ${prevPane} is blocked` : ''}`);
    publishViewers(id);
    refreshAppTitle(id, 'takeover'); // the pane just blocked keeps its last protocol title; the record's is re-read for later joiners
    return { ok: true, already: false, viewers: viewersView(id) };
  }
  /** x5 LOW-2: the app window's OWN title on the xpra rung's RECORD (the keeper-fitted rungs record it at every fit
   *  run): a blocked pane has no protocol session, so without this its overlay named the launch label. Read from X
   *  (`windows(id)` — the seamless rows, the main = the largest classed one, PURE `appMainWindow`) when a blocked
   *  seat appears, at a takeover, and on the tick while one exists — at most every XPRA_TITLE_EVERY_MS; an
   *  unreadable name keeps the last one. Fire-and-forget: a failure is a log line, never a thrown join. */
  function refreshAppTitle(id, why) {
    const rec = recOf(id);
    if (!rec || rec.state !== 'ready' || M.streamKindOf(rec, backends) !== 'xpra') return null;
    let tr = titleReads.get(id);
    if (!tr) { tr = { at: 0, inflight: null }; titleReads.set(id, tr); }
    if (tr.inflight) return tr.inflight;
    const t = now();
    if (why === 'tick' && t - tr.at < XPRA_TITLE_EVERY_MS) return null;
    if (why !== 'tick' && t - tr.at < 1000) return null; // a burst of joins reads X once
    tr.at = t;
    tr.inflight = (async () => {
      const r = await windows(id);
      if (!r || !r.ok) return null;
      const main = M.appMainWindow(r.windows.map((w) => ({ ...w, name: w.title })), { seamless: true }); // windows(id) already kept only the app's own rows on this rung
      const title = main ? M.windowTitleOf(main.name) : null;
      const ro = store.apps[id] ? null : remoteOf(id);
      if (ro) { // lane C2: a paired machine's record — the title is the HUB's row (the device's record never learns it)
        const hub = hubRow(ro.hostId, id);
        if (title && ro.rec.state === 'ready' && hub.appTitle !== title) { hub.appTitle = title; saveRemote(); notify(); }
        return title;
      }
      const cur = store.apps[id];
      if (title && cur && cur.state === 'ready' && cur.appTitle !== title) { cur.appTitle = title; commit(); }
      return title;
    })().catch((e) => { log.warn?.(`[desktop] ${id}: could not read the app's title (${why}): ${e && e.message}`); return null; }).finally(() => { tr.inflight = null; });
    return tr.inflight;
  }
  function activeViewer(id) { const s = viewerSets.get(id); return s ? s.active : null; }
  /** Desktop A r1 — a relaunch CARRIES the seat: the old window's active pane (or the pane its grace holds) holds the
   *  successor's seat as a grace with NO timer (the old session is still being torn down — however long that takes,
   *  every other joiner is blocked; the same pane attaching takes it through viewerJoined's grace branch). The returned
   *  `arm()` starts the RELAUNCH_SEAT_MS countdown once the answer is out; nobody active on the old window ⇒ nothing
   *  carried (arm is a no-op). */
  function carrySeat(fromId, toId) {
    const from = viewerSets.get(fromId);
    const pane = from ? (paneOf(from, from.active) || (from.grace ? from.grace.pane : null)) : null;
    if (!pane || !toId) return () => {};
    const s = seatOf(toId);
    if (s.active != null) return () => {}; // somebody already holds the successor (never overridden)
    clearGrace(s);
    const hold = { pane, timer: null, until: null };
    s.grace = hold;
    if (from.paneActiveAt.has(pane)) s.paneActiveAt.set(pane, from.paneActiveAt.get(pane));
    log.log?.(`[desktop] ${toId}: the relaunch of ${fromId} carries the seat — pane ${pane} holds it, other clients attach blocked`);
    publishViewers(toId);
    return () => {
      if (s.grace !== hold || viewerSets.get(toId) !== s) return; // taken (or the set is gone): nothing to arm
      hold.until = now() + relaunchSeatMs;
      hold.timer = setTimeout(() => graceExpired(toId), relaunchSeatMs);
      hold.timer.unref?.();
    };
  }
  /** The bridge's hook: every change of a window's viewer set (join / leave / takeover / the session ended). */
  function onViewers(fn) { if (typeof fn !== 'function') return () => {}; viewerListeners.add(fn); return () => viewerListeners.delete(fn); }

  // ── views ──
  /** The machine's view + the POLICY's rows: the resource report's live row and the idle verdict (same key order as ever). */
  function view(rec) {
    const l = live.get(rec.id) || null;
    return { ...machine.machineView(rec), live: l ? { ...l } : null, idle: M.isLiveState(rec.state) ? M.idleState(rec, now(), rec.idleTimeoutMs) : null };
  }
  /** Every record of the registry: device #0's, then every paired machine's (lane C2) — newest first. With no
   *  remote record the answer is the machine's own list, untouched (local behaviour byte-identical). */
  function listApps() {
    const local = machine.listApps();
    const rem = remoteViews();
    return rem.length ? local.concat(rem).sort((a, b) => b.startedAt - a.startedAt) : local;
  }
  /** THIS machine's live sessions only — the capacity other keepers count against (the browser keeper's ONE
   *  ceiling) and the window-targets engine's world are both this machine's; a paired machine counts its own. */
  function liveRecords() { return machine.liveRecords(); }
  function get(id) { return machine.get(id) || remoteGet(id); }
  /** The launch dialog's per-machine answer: THAT machine's catalog, ladder and cap (greyed by ITS facts), and the
   *  running sessions of every machine. `host` absent / 'local' = this machine, exactly as before lane C2. */
  async function list(opts = {}) {
    const host = opts && opts.host;
    if (isLocalHost(host)) { const r = await machine.list(); return hasRemote() ? { ...r, apps: listApps() } : r; }
    const r = await acc().call(host, 'list', { settings: settingsForOp() });
    ingestHost(host, r.apps, { www: r.availability && r.availability.xpra ? r.availability.xpra.www || null : null });
    return { apps: listApps(), registry: r.registry, availability: r.availability, cap: r.cap, idleTimeoutMin: r.idleTimeoutMin, host: { hostId: host, label: labelOf(host) } };
  }

  // ── the machine's acts (device #0 in-process — zero hops; a paired machine through the desktop-serve op) ──
  async function launch(body, opts = {}) {
    const host = opts && opts.host;
    if (isLocalHost(host)) { const o = { ...opts }; delete o.host; return machine.launch(body, o); }
    const r = await acc().call(host, 'launch', { body, settings: settingsForOp() });
    ingestOne(host, r.app);
    followUntilSettled(host, r.app.id);
    return remoteGet(r.app.id) || r.app;
  }
  async function stop(id, opts = {}) {
    const ro = store.apps[id] ? null : remoteOf(id);
    if (!ro) return machine.stop(id, opts);
    const r = await acc().call(ro.hostId, 'stop', { id, why: opts.why || 'user' });
    ingestOne(ro.hostId, r.app);
    return remoteGet(id) || r.app;
  }
  function keepAlive(id) {
    const ro = store.apps[id] ? null : remoteOf(id);
    if (!ro) return machine.keepAlive(id);
    return acc().call(ro.hostId, 'keep-alive', { id }).then((r) => { ingestOne(ro.hostId, r.app); return remoteGet(id) || r.app; });
  }
  function noteInput(id) {
    const ro = store.apps[id] ? null : remoteOf(id);
    if (!ro) return machine.noteInput(id);
    if (!M.isLiveState(ro.rec.state)) return;
    hubRow(ro.hostId, id).lastInputAt = now(); remoteDirty = true; // the IDLE verdict is the hub's: a device never sees the input
  }
  function noteDesktopSize(id, w, h) {
    const ro = store.apps[id] ? null : remoteOf(id);
    if (!ro) return machine.noteDesktopSize(id, w, h);
    acc().call(ro.hostId, 'fit', { id, w, h }).catch((e) => log.warn?.(`[desktop] ${id}: the fit on ${ro.hostId} failed — ${e && e.message}`));
  }
  async function windows(id) {
    const ro = store.apps[id] ? null : remoteOf(id);
    if (!ro) return machine.windows(id);
    try { const r = await acc().call(ro.hostId, 'windows', { id }); return { ok: true, why: null, windows: r.windows || [] }; }
    catch (e) { return { ok: false, why: `${labelOf(ro.hostId)}: ${e && e.message}`, code: e && e.code, windows: [] }; }
  }
  /** The bridge's target: THIS machine's port, or a paired machine's (with `hostId`, which the bridge turns into a
   *  hub-side loopback port through desktop-access.forwardPort — streamEndpointFor). null while it is not ready or
   *  its machine does not answer. */
  function streamTarget(id) {
    if (store.apps[id]) return machine.streamTarget(id);
    const ro = remoteOf(id);
    if (!ro || remote.hosts[ro.hostId].online === false) return null;
    const t = M.streamTargetOf(ro.rec);
    return t ? { ...t, hostId: ro.hostId } : null;
  }
  /** The installed xpra html5 client the hosted-client route serves for a record: THIS machine's, else — a remote
   *  record on a hub without xpra — the paired machine's own tree (`{hostId, dir}`: read through the agent). */
  async function xpraWwwFor(id) {
    let own = null;
    try { own = await machine.xpraWww(); } catch { own = null; }
    if (own || store.apps[id]) return own ? { hostId: 'local', dir: own } : null;
    const ro = remoteOf(id);
    const www = ro && remote.hosts[ro.hostId].www;
    return www ? { hostId: ro.hostId, dir: www } : null;
  }

  /** Round 3 A3 (docs/design-desktop-apps-seamless §3.4): the per-window Scale ▸ — the SAME app (catalog row or typed
   *  command) launched again at the chosen scale (GDK_SCALE is read once, at the app's start: a relaunch is the only
   *  way), then the old session stopped. The successor starts FIRST (a refusal — the cap, a vanished binary — leaves
   *  the running app untouched), the old record names it (`replacedBy`, committed before its stop broadcasts) so every
   *  client showing it follows the successor in the SAME window instead of closing it.
   *  → { app: <the new record>, replaced: <the old record, exited, stoppedBy 'relaunch'> } */
  async function relaunch(id, body) {
    const ro = store.apps[id] ? null : remoteOf(id);
    if (ro) { // lane C2: the device's ONE relaunch runs there (the op); the seat is carried the moment the answer is back
      const r = await acc().call(ro.hostId, 'relaunch', { id, body: body || {}, settings: settingsForOp() });
      ingestOne(ro.hostId, r.replaced); ingestOne(ro.hostId, r.app);
      carrySeat(id, r.app.id)();
      followUntilSettled(ro.hostId, r.app.id);
      return { app: remoteGet(r.app.id) || r.app, replaced: remoteGet(id) || r.replaced };
    }
    // ONE implementation (src/desktop-serve.js relaunch — the device's `relaunch` op runs it too): the successor
    // first, the seat carried between its record and the old session's stop, a browser's profile moved onto it (2.369.176)
    return machine.relaunch(id, body, { onSuccessor: (nextId) => carrySeat(id, nextId) });
  }

  // ── the POLICY in the machine's tick (called exactly where the pre-extraction tick ran it) ──
  /** The IDLE verdict: a ready record with no input for its timeout is stopped (why 'idle'); true = the machine skips it. */
  function idleVerdict(rec, t) {
    const idle = M.idleState(rec, t, rec.idleTimeoutMs);
    if (idle.expired) { stop(rec.id, { why: 'idle' }).catch(() => { }); return true; }
    return false;
  }
  /** x5 LOW-2: while a BLOCKED pane exists on the xpra rung, the record keeps the app's own title fresh (rate-limited). */
  function readyTick(rec) { const vs = viewerSets.get(rec.id); if (vs && [...vs.entries.keys()].some((v) => v !== vs.active)) refreshAppTitle(rec.id, 'tick'); }
  /** A session ended (every terminal path passes the machine's teardown): its report slot and live row go with it. */
  function onTeardown(id) { guard.delete(id); live.delete(id); }
  /**
   * THE RESOURCE REPORT of one sample (the machine sampled the whole session set; `pids` = what it counted).
   * ONE verdict module (src/runaway-guard.js) and ONE guard pick per record (guardFor: a browser row by the browser
   * numbers). REPORT ONLY (the owner's 2026-09-25 ruling): the app a person is using keeps running whatever the
   * sample says — no stop, no park, no profile touched. OVER ⇒ the live row names it; a notice when a crossing
   * begins (r2: hysteresis + a per-session floor, and a notice nobody received is re-sent on the next over sample).
   * Returns true when the live row changed (the machine's end-of-tick commit carries it).
   */
  function reportSample(rec, s, t, pids) {
    const g = guard.get(rec.id) || { prev: null, hotSince: 0 };
    const lim = RG.guardFor(rec, limits);
    const v = RG.resourceVerdict(s, g.prev, g.hotSince, t, { limits: lim });
    g.prev = s ? { at: t, cpuTicks: s.cpuTicks } : null; g.hotSince = v.hotSince;
    const lvl = RG.reportTransition(g.report, v, { now: t, limits: lim }); g.report = lvl.state;
    guard.set(rec.id, g);
    if (s) { const was = live.get(rec.id); live.set(rec.id, { cpuPct: v.cpuPct, memBytes: s.memBytes, memMetric: s.memMetric, rssBytes: s.rssBytes /* deprecated: ΣVmRSS, a fact never judged — one release */, pids: s.pids, over: v.over, since: v.over ? ((was && was.over && was.since) || t) : null, sampledAt: t }); dirty = true; }
    if (v.memGuard === 'unavailable' && !g.memOffSaid) { g.memOffSaid = true; log.warn?.(`[desktop] ${RG.memGuardOffLine(`${rec.id} (${rec.label})`, s)}`); }
    if (lvl.fire) {
      log.warn?.(`[desktop] ${rec.id} (${rec.label}, ${pids.length} process(es) in its sessions) is over the reporting threshold: ${v.over} — reported, left running`);
      try { getTelemetry()?.record?.({ kind: 'event', name: 'desktop-app-resource', detail: `${rec.label}: ${v.over}`, value: Math.round((s?.memBytes || 0) / 1048576) }); } catch { /* telemetry is optional */ }
    }
    if (lvl.notify) {
      const who = rec.appTitle || rec.label || rec.appId || rec.id;
      let delivered;
      try { delivered = serverNotice?.(`desktop-app-resource:${rec.id}:${lvl.state.crossings}`, RG.resourceNoticeText({ who, where: 'Desktop panel', verdict: v, sample: s }), { level: 'warn' }); } catch (e) { log.warn?.(`[desktop] ${rec.id}: the resource notice failed: ${e && e.message}`); }
      g.report = RG.reportDelivery(g.report, delivered);
    }
    return dirty;
  }
  /** ONE pass: the machine's tick (liveness, the idle verdict, the belt, the sample + this report), then a row the
   *  report changed and the machine did not carry. */
  async function tick() {
    await machine.tick();
    if (dirty) commit();
    await syncRemoteAll();
  }
  function start() {
    if (timer) return;
    timer = setInterval(() => { tick().catch((e) => log.warn?.(`[desktop] tick failed: ${e.message}`)); }, tickMs);
    if (timer.unref) timer.unref();
  }
  /** Timers only — the apps SURVIVE a VibeSpace exit by design. */
  function shutdown() { if (timer) clearInterval(timer); timer = null; for (const s of viewerSets.values()) clearGrace(s); machine.shutdown(); if (remoteDirty) saveRemote(); }

  // ── LANE C2: the paired machines' apps (docs/design-desktop-apps-seamless §3.5, D5 / D8) ──────────────────────
  // The device's machine keeper holds each record (~/.vibespace/desktop-apps.json there); the hub keeps what it last
  // SAW per machine (REMOTE_FILE) plus its own rows — the last input (the idle verdict is the hub's), the app's title
  // for a blocked pane — and re-asks: `status` on every tick while a machine has a live record, `list` at boot for
  // every machine it knows. A machine that does not answer keeps its records, shown as HOST_OFFLINE_STATE until it
  // answers again (never "exited": the app may well be running there). The resource REPORT judges the device's own
  // sample with the same verdict module (report only — the 2.369.171 law); the idle verdict stops through the op.
  let remote = { hosts: {} }; // hostId → { apps: {id: device view}, hub: {id: {lastInputAt, appTitle}}, online, lastSyncAt, lastError, www }
  let remoteDirty = false;
  const syncing = new Map();   // hostId → the in-flight sync (single flight)
  const judged = new Map();    // id → the sample instant last judged (a device sample is judged once)
  const following = new Set(); // ids a launch/relaunch is following until they settle
  const remoteFile = path.join(dataDir, REMOTE_FILE);
  function loadRemote() {
    try {
      const j = JSON.parse(fs.readFileSync(remoteFile, 'utf8'));
      if (j && typeof j === 'object' && j.hosts && typeof j.hosts === 'object') remote = { hosts: j.hosts };
    } catch (e) { if (e.code !== 'ENOENT') log.warn?.(`[desktop] ${REMOTE_FILE} unreadable (${e.message}) — the paired machines are re-asked at boot`); }
    for (const h of Object.values(remote.hosts)) { h.apps = h.apps || {}; h.hub = h.hub || {}; h.online = null; } // not asked yet this boot
  }
  function saveRemote() {
    try { fs.mkdirSync(dataDir, { recursive: true }); writeJsonAtomic(remoteFile, remote); remoteDirty = false; }
    catch (e) { log.warn?.(`[desktop] could not write ${REMOTE_FILE}: ${e.message}`); }
  }
  const acc = () => {
    const a = typeof access === 'function' ? access() : access;
    if (!a || typeof a.call !== 'function') { const e = new Error('desktop apps on other machines are not wired on this instance'); e.code = 'host_unavailable'; throw e; }
    return a;
  };
  const isLocalHost = (h) => h == null || h === '' || h === 'local';
  const labelOf = (h) => { try { return hostLabel(h) || h; } catch { return h; } };
  const hasRemote = () => Object.values(remote.hosts).some((h) => h && Object.keys(h.apps || {}).length);
  function hostRow(hostId) { let h = remote.hosts[hostId]; if (!h) { h = { apps: {}, hub: {}, online: null, lastSyncAt: 0, lastError: null, www: null }; remote.hosts[hostId] = h; } return h; }
  function hubRow(hostId, id) { const h = hostRow(hostId); let r = h.hub[id]; if (!r) { r = {}; h.hub[id] = r; } return r; }
  function remoteOf(id) {
    for (const [hid, h] of Object.entries(remote.hosts)) { const rec = h && h.apps && h.apps[id]; if (rec) return { hostId: hid, h, rec }; }
    return null;
  }
  const settingsForOp = () => { const o = {}; for (const k of DS.SETTING_KEYS) { const v = serverSetting(k); if (v !== undefined) o[k] = v; } return o; };
  /** A paired machine's record as every client sees it: the device's view, re-labelled with the HUB's host id and
   *  label (a DISPLAY string — never into a spawn), the hub's rows over it, the offline state when its machine does
   *  not answer, the report's live row and the idle verdict (same keys as a local view). */
  function remoteView(hostId, rec) {
    const h = remote.hosts[hostId];
    const hub = (h && h.hub && h.hub[rec.id]) || {};
    const base = { ...rec, hostId, hostLabel: labelOf(hostId), appTitle: hub.appTitle || rec.appTitle || null };
    delete base.live; delete base.idle;
    if (hub.lastInputAt && hub.lastInputAt > (Number(rec.lastInputAt) || 0)) base.lastInputAt = hub.lastInputAt;
    const offline = !!(h && h.online === false && M.isLiveState(rec.state));
    if (offline) { base.state = M.HOST_OFFLINE_STATE; base.lastKnownState = rec.state; base.hostError = h.lastError || null; }
    const l = live.get(rec.id) || null;
    return { ...base, live: l ? { ...l } : null, idle: M.isLiveState(rec.state) && !offline ? M.idleState(base, now(), rec.idleTimeoutMs) : null };
  }
  function remoteGet(id) { const ro = remoteOf(id); return ro ? remoteView(ro.hostId, ro.rec) : null; }
  function remoteViews() { const out = []; for (const [hid, h] of Object.entries(remote.hosts)) for (const rec of Object.values((h && h.apps) || {})) out.push(remoteView(hid, rec)); return out; }
  /** One record the device answered (launch / stop / keep-alive / relaunch): stored as the device's view. */
  function ingestOne(hostId, app) {
    if (!app || !app.id) return;
    if (store.apps[app.id]) { log.warn?.(`[desktop] ${hostId} answered a record ${app.id} this machine also holds — kept this machine's, ignored the other`); return; }
    const other = remoteOf(app.id);
    if (other && other.hostId !== hostId) { log.warn?.(`[desktop] ${hostId} answered a record ${app.id} that ${other.hostId} holds — ignored (adoption is by host and id)`); return; }
    const h = hostRow(hostId);
    const rec = { ...app }; delete rec.live; delete rec.idle; rec.hostId = 'local'; // the DEVICE's view of itself (D8) — re-labelled on the way out
    const was = h.apps[app.id];
    h.apps[app.id] = rec; h.online = true; h.lastError = null; h.lastSyncAt = now();
    if (!M.isLiveState(rec.state) && (!was || M.isLiveState(was.state))) remoteEnded(app.id);
    saveRemote(); notify();
  }
  /** A machine's WHOLE list (list / status answered): records it no longer holds leave the registry (its history
   *  prune); a collision with another machine's id is refused by name (adoption is by host AND id). */
  function ingestHost(hostId, apps, { www = undefined } = {}) {
    const h = hostRow(hostId);
    const before = JSON.stringify(h.apps);
    const next = {};
    for (const app of Array.isArray(apps) ? apps : []) {
      if (!app || !app.id) continue;
      if (store.apps[app.id]) { log.warn?.(`[desktop] ${hostId} lists ${app.id}, an id this machine holds — ignored`); continue; }
      const other = remoteOf(app.id);
      if (other && other.hostId !== hostId) { log.warn?.(`[desktop] ${hostId} lists ${app.id}, which ${other.hostId} holds — ignored`); continue; }
      const rec = { ...app }; delete rec.live; delete rec.idle; rec.hostId = 'local';
      const was = h.apps[app.id];
      if (was && M.isLiveState(was.state) && !M.isLiveState(rec.state)) remoteEnded(app.id);
      next[app.id] = rec;
    }
    for (const id of Object.keys(h.apps)) if (!next[id]) { remoteEnded(id); delete h.hub[id]; }
    const wasOnline = h.online;
    h.apps = next; h.online = true; h.lastError = null; h.lastSyncAt = now();
    if (www !== undefined) h.www = www;
    const changed = before !== JSON.stringify(h.apps) || wasOnline !== true;
    if (changed || remoteDirty) saveRemote();
    if (changed) notify();
    return changed;
  }
  function remoteEnded(id) { guard.delete(id); live.delete(id); judged.delete(id); }
  function markOffline(hostId, e) {
    const h = hostRow(hostId);
    const was = h.online;
    h.online = false; h.lastError = String((e && e.message) || e || 'no answer').slice(0, 300); h.lastSyncAt = now();
    if (was !== false) { log.warn?.(`[desktop] ${hostId} did not answer (${h.lastError}) — its ${Object.values(h.apps).filter((r) => M.isLiveState(r.state)).length} live app(s) are shown as ${M.HOST_OFFLINE_STATE} until it does`); saveRemote(); notify(); }
  }
  /** ONE sync of a machine (single flight): `status` → the records + the device's latest samples → the hub's
   *  policy on each live one (the idle verdict, the resource report, the blocked pane's title). */
  function syncHost(hostId) {
    if (syncing.has(hostId)) return syncing.get(hostId);
    const p = (async () => {
      let r;
      try { r = await acc().call(hostId, 'status', {}); }
      catch (e) {
        if (e && (e.code === 'unsupported-host')) { // the machine was removed from this instance: its records go with it
          log.log?.(`[desktop] ${hostId} is no longer a machine on this instance — its desktop-app records are dropped`);
          for (const id of Object.keys(hostRow(hostId).apps)) remoteEnded(id);
          delete remote.hosts[hostId]; saveRemote(); notify(); return false;
        }
        markOffline(hostId, e); return false;
      }
      ingestHost(hostId, r.apps);
      const t = now();
      let changed = false;
      for (const rec of Object.values(hostRow(hostId).apps)) {
        if (rec.state !== 'ready') continue;
        const v = remoteView(hostId, rec);
        if (v.idle && v.idle.expired) { stop(rec.id, { why: 'idle' }).catch((e) => log.warn?.(`[desktop] ${rec.id}: the idle stop on ${hostId} failed — ${e && e.message}`)); continue; }
        const smp = r.samples && r.samples[rec.id];
        if (smp && smp.at && judged.get(rec.id) !== smp.at) { judged.set(rec.id, smp.at); if (reportSample(v, smp.sample || null, t, new Array(Number(smp.pids) || 0).fill(0))) changed = true; }
        readyTick(rec);
      }
      if (remoteDirty) saveRemote();
      if (changed) notify(); // the report's live row of a REMOTE record (the local commit's `dirty` is this machine's alone)
      return true;
    })().finally(() => syncing.delete(hostId));
    syncing.set(hostId, p);
    return p;
  }
  /** Every machine with a live record is re-asked each tick; one that did not answer, at most every
   *  REMOTE_OFFLINE_RETRY_MS. */
  async function syncRemoteAll() {
    const t = now();
    const due = Object.entries(remote.hosts).filter(([, h]) => h && Object.values(h.apps || {}).some((r) => M.isLiveState(r.state)) && (h.online !== false || t - (h.lastSyncAt || 0) >= REMOTE_OFFLINE_RETRY_MS)).map(([hid]) => hid);
    await Promise.all(due.map((hid) => syncHost(hid).catch((e) => log.warn?.(`[desktop] sync of ${hid} failed: ${e && e.message}`))));
  }
  /** A launch / relaunch answered `launching`: re-ask THAT machine every REMOTE_FOLLOW_MS until the record settles
   *  (ready / exited / failed) or REMOTE_SETTLE_MS pass — the window must not wait a whole tick for its picture. */
  function followUntilSettled(hostId, id) {
    if (following.has(id)) return;
    following.add(id);
    const until = now() + REMOTE_SETTLE_MS;
    const step = async () => {
      const rec = (remote.hosts[hostId] && remote.hosts[hostId].apps[id]) || null;
      if (!rec || rec.state !== 'launching' || now() > until) { following.delete(id); return; }
      await syncHost(hostId).catch(() => { });
      const tm = setTimeout(step, REMOTE_FOLLOW_MS); tm.unref?.();
    };
    const tm = setTimeout(step, REMOTE_FOLLOW_MS); tm.unref?.();
  }
  /** BOOT: every machine the registry remembers, and every machine the instance says is dialed in now
   *  (`remoteHosts()`), is asked `list`; its records are adopted by host AND id. One that does not answer keeps its
   *  records (offline) and is re-asked by the tick. Runs AFTER this machine's own adoption, in the background: a slow
   *  or dead link never holds this machine's apps. */
  async function adoptRemote() {
    let extra = [];
    try { extra = (remoteHosts() || []).filter((h) => h && !isLocalHost(h)); } catch { extra = []; }
    const ids = [...new Set([...Object.keys(remote.hosts), ...extra])];
    await Promise.all(ids.map(async (hid) => {
      const known = !!remote.hosts[hid];
      try {
        const r = await acc().call(hid, 'list', { settings: settingsForOp() });
        if (!known && !(r.apps || []).length) return; // a dialed-in machine with no desktop app: nothing to register
        ingestHost(hid, r.apps, { www: r.availability && r.availability.xpra ? r.availability.xpra.www || null : null });
        const n = Object.values(hostRow(hid).apps).filter((x) => M.isLiveState(x.state)).length;
        if (n) log.log?.(`[desktop] adopted ${n} live app(s) on ${hid}`);
      } catch (e) {
        if (!known) return; // never asked before and not answering (an old agent, an ssh host) — nothing to keep
        if (e && e.code === 'unsupported-host') { for (const id of Object.keys(hostRow(hid).apps)) remoteEnded(id); delete remote.hosts[hid]; saveRemote(); notify(); return; }
        markOffline(hid, e);
      }
    }));
  }
  async function adoptAll() {
    await machine.adoptAll();
    adoptRemote().catch((e) => log.warn?.(`[desktop] adopting the paired machines' apps failed: ${e && e.message}`));
  }
  /** The window-targets engine's world is THIS machine's (an agent acts through xdotool / AT-SPI here): a view of this
   *  keeper whose get / listApps never answer a paired machine's record. */
  function localOnly(k) { return Object.assign({}, k, { get: (id) => machine.get(id), listApps: () => machine.listApps() }); }
  loadRemote();

  const keeper = { launch, relaunch, startDeferred: machine.startDeferred, stop, reshapeStore: machine.reshapeStore, keepAlive, noteInput, noteDesktopSize, setWatchProbe: machine.setWatchProbe, fitApp: machine.fitApp, get, list, listApps, liveRecords, streamTarget, x11EnvFor: machine.x11EnvFor, windows, xpraWww: machine.xpraWww, xpraWwwFor, instancePrefs: machine.instancePrefs, facts: machine.facts, registry: machine.registry, adoptAll, adoptRemote, syncHost, start, shutdown, tick, sessionPids: machine.sessionPids,
    viewerJoined, viewerLeft, takeoverViewer, activeViewer, viewersView, onViewers, refreshAppTitle, viewerGraceMs, carrySeat, relaunchSeatMs, // P8-2 x5 + A r1
    machine, // lane C1: device #0's machine keeper — src/server/desktop-access.js runs its local rung against THIS object (never a second keeper on the same store)
    storeFile: machine.storeFile, logRoot: machine.logRoot, STORE_FILE: DS.STORE_FILE, LOG_DIR: DS.LOG_DIR, SESSION_ENV: DS.SESSION_ENV, _store: machine._store,
    remoteFile, REMOTE_FILE, _remote: () => remote }; // lane C2
  keeper.local = localOnly(keeper);
  return keeper;
}

module.exports = { create, REMOTE_FILE, REMOTE_FOLLOW_MS, REMOTE_SETTLE_MS, REMOTE_OFFLINE_RETRY_MS, STORE_FILE: DS.STORE_FILE, LOG_DIR: DS.LOG_DIR, TICK_MS: DS.TICK_MS, STOP_GRACE_MS: DS.STOP_GRACE_MS, RFB_DEADLINE_MS: DS.RFB_DEADLINE_MS, SETTLE_BRINGUP_MS: DS.SETTLE_BRINGUP_MS, SESSION_ENV: DS.SESSION_ENV, FIT_DEBOUNCE_MS: DS.FIT_DEBOUNCE_MS, FIT_FIRST_STEP_MS: DS.FIT_FIRST_STEP_MS, FIT_FIRST_WINDOW_MS: DS.FIT_FIRST_WINDOW_MS, FIT_REFUSED_RETRY_MS: DS.FIT_REFUSED_RETRY_MS, FIT_SETTLE_RUNS: DS.FIT_SETTLE_RUNS, FIT_ACTIVE_MS: DS.FIT_ACTIVE_MS, FIT_SLOW_BELT_MS: DS.FIT_SLOW_BELT_MS, VIEWER_GRACE_MS, RELAUNCH_SEAT_MS, XPRA_TITLE_EVERY_MS, EXIT_CENSUS_MS: DS.EXIT_CENSUS_MS };
