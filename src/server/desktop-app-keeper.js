'use strict';
/**
 * DESKTOP-APP KEEPER — the LIFECYCLE of every desktop application VibeSpace
 * opens in a window (docs/design-desktop-apps.zh.md §2 row 3; P8-1,
 * 2026-09-13; r2 2026-09-14). ORCH tier: it owns processes and a record
 * file; it knows NO application, NO rung and touches NO WebSocket (the
 * bridge is src/server/desktop-stream.js, the routes src/routes/desktop-apps.js).
 *
 * One app session = ONE private X display + ONE picture server + the app
 * (DA2: per-app isolation, independent idle, independent stop), all spawned
 * DETACHED (setsid) with stdio to data/desktop-apps/<id>/app.log, so a
 * VibeSpace restart ADOPTS them instead of orphaning them. The record
 * (data/desktop-apps.json, writeJsonAtomic) stores FACTS ONLY — pids AND their
 * starttimes (a bare pid is recycled; src/cli-identity's rule), the port, the
 * display, which rung was chosen and why — never a derived value.
 *
 * The discipline is opencode-serve's, inherited rather than re-learned:
 *   · adopt-or-reap at boot by pid+starttime+port (a dead pid ⇒ `exited` with
 *     the lastError KEPT, its leftovers reaped)
 *   · a COUNT CAP + a RUNAWAY GUARD (>150 % CPU for 5 min or RSS > 2 GB ⇒
 *     stop + park the registry row for an hour + telemetry + a broadcast the
 *     window turns into a toast) — the numbers are src/keeper-limits.js, the
 *     ONE home this keeper shares with opencode-serve and the browser keeper
 *   · per-app IDLE timeout from the last INPUT the bridge reported (DA3:
 *     30 min default, settings `desktop.idleTimeoutMin`, 0 = never; "keep
 *     running" is one explicit action)
 *   · stop = SIGTERM the app, then the picture server, then the WM, then the
 *     X display, each VERIFIED gone (SIGKILL after a grace), then whatever
 *     still carries the session marker (rule 10) — no orphans on a machine
 *     with a readable /proc; the stated BOUNDARY (rule 8) is the one without
 *   · every state change is saved AND broadcast (`desktop-apps-updated`)
 *
 * r2 — SIX RULES THE FIRST ROUND BROKE (each reproduced on the real keeper):
 *   1. THE BRING-UP IS A TABLE LOOKUP, NEVER A RUNG NAME. `M.recipeFor(backend,
 *      via)` names a recipe, `display.RECIPES[name]` runs it; a pair the table
 *      cannot name is refused BY NAME (`no-recipe`). A fourth rung is one row
 *      + one recipe + one relay, and this file does not change.
 *   2. A PID IS RECORDED THE MOMENT IT IS KNOWN. Every recipe hands each part
 *      back through `onPart`, which stamps pid+starttime and COMMITS at once,
 *      so a failure one step later (the picture server's spawn refused) still
 *      leaves a record the teardown and the next boot can reap. Every spawn
 *      is awaited and keeps an `error` listener (desktop-display), so a spawn
 *      failure is a `failed` record, never an uncaught exception.
 *   3. THE PICTURE PORT IS A MEASURED FACT. The banner proves SOMEBODY listens;
 *      `listenerHeldBy` proves it is OUR picture server's session before the
 *      record turns `ready` (x11vnc keeps the same number on `[::1]` when the
 *      IPv4 bind loses a race — the bridge would relay a stranger's display).
 *   4. A SESSION IS A SET OF PROCESSES, NOT THREE PIDS. Every leader is spawned
 *      detached (sid == pid) and stamped `VIBESPACE_DESKTOP_APP=<id>` in its
 *      env; stop signals the leader's whole SESSION (group + every member),
 *      verified empty, with the env marker as the identity when the leader is
 *      already gone (a recycled pid must never be signalled).
 *   5. THE RUNAWAY GUARD SAMPLES THE WHOLE SESSION SET (app + X + picture
 *      server + WM, each with its children) — a launcher whose work is in a
 *      child was invisible to a per-pid sample.
 *   6. A CACHED FACT IS RE-ASKED BEFORE A DESTRUCTIVE VERDICT. The singleton
 *      desktop's `running` is vnc.js's last status() answer and starts false
 *      at boot; `singletonLive()` calls its `refresh()` before adoption, the
 *      tick and bring-up judge by it.
 *
 * r3 — TWO MORE, THE ROUND-2 VERIFIER'S (each reproduced on the real keeper):
 *   7. A BRING-UP EXIT REAPS WHAT ARRIVED AFTER THE RECORD DIED. A stop()
 *      landing during the bring-up (the UI shows Stop while `launching`, and
 *      POST …/stop is one request away) found no recorded pids, answered
 *      `exited`, and the recipe went on to spawn an Xvfb and a passwordless
 *      x11vnc under that terminal record — leftovers no teardown and no boot
 *      ever visited (measured: stop 0 ms after launch ⇒ 2 processes carrying
 *      the session marker 4 s later, `exited` on disk). Three layers, each
 *      with its own control: `stop()` marks the record STOPPING first (the
 *      `stopping` set the bring-up reads at every await — it adds no more
 *      parts), tears down what is recorded, WAITS (bounded) for the in-flight
 *      bring-up, tears down again, and only THEN writes the verdict (a
 *      terminal state keeps meaning "torn down, verified"); `onPart` on a
 *      record that DIED under it (a part exited, the guard) kills the part
 *      the moment it is known (a future recipe may wait seconds after a part
 *      exists); and bringUp's `finally` reaps whenever the record died — the
 *      same three returns that used to leave silently. The BOOT belt is the
 *      fourth:
 *      `adoptAll` runs ONE marker census (`display.markerCensus`) over every
 *      record's id and reaps whatever still carries a terminal record's
 *      `VIBESPACE_DESKTOP_APP=<id>` — the only layer that survives a SIGKILL
 *      of this server between a stop's verdict and its teardown.
 *   8. AN IDENTITY NOBODY RECORDED IS NOT PROVEN. `sameProcess(pid, null)`
 *      degraded to bare liveness, so a record with null starttimes made boot
 *      adoption call a RECYCLED pid a verified leader and SIGKILL a
 *      stranger's whole process group (measured: three detached strangers,
 *      all dead after adoptAll). `partIsOurs` is now ONE ladder: a live
 *      ChildProcess handle this process spawned (node reaps it, so an
 *      unreaped handle names exactly that process) → pid AND starttime →
 *      nothing; an unproven leader is never signalled — only members that
 *      carry the session marker are. BOUNDARY, stated: on a machine with no
 *      readable /proc a session cannot be proven ours after a restart, so it
 *      is recorded as ended and LEFT RUNNING (nothing unproven is signalled;
 *      the user stops it by hand) — v1 desktop apps are a /proc-machine
 *      feature, and this process's own children still stop through their
 *      handles.
 *
 * r4 — TWO MORE, THE ROUND-3 VERIFIER'S (each reproduced on the real keeper):
 *   9. THE IN-FLIGHT BRING-UP IS CAPTURED BEFORE THE FIRST TEARDOWN. Rule 7
 *      asked `inflight.has(id)` AFTER tearing down what was recorded — but
 *      that teardown waits ≥ 100 ms per part it signals, long enough for the
 *      bring-up to record its NEXT part, read `gone()`, return and settle,
 *      and launch()'s `finally` then forgot it in `inflight` before stop()
 *      looked: no settle, no second teardown, the verdict written with the
 *      new part alive under it (measured: a stop at the app's spawn ⇒
 *      `exited`, pids.app set, `/bin/sleep 3600` carrying the marker 5 s
 *      later — the round-2 class one window narrower). `stop()` now takes
 *      the promise BEFORE it signals anything and settles on THAT.
 *  10. THE SID TABLE IS NOT THE SESSION. Rule 4 identified a session's
 *      members by their session id; a member that `setsid()`s itself (a
 *      daemonising launcher, `setsid …`/`nohup … & disown` inside the app's
 *      terminal) leaves every leader's session and the sid-based teardown
 *      never sees it — while the env it INHERITED still names this session,
 *      and the keeper already owned the reader (`display.markerCensus`) but
 *      asked it only at boot. `teardown` — the ONE place every terminal path
 *      passes (stop, an app that exited, a failed bring-up, boot adoption) —
 *      now ends with that census for this record's id and reaps whatever
 *      still carries the marker (measured: `setsid sleep 3600 &` survived
 *      stop() AND the app-exit path under `exited`, lastError null); the
 *      runaway guard unions the same census (ONE walk per tick, only when a
 *      sample is due) into its sample set (measured: a setsid'd `yes` read
 *      cpuPct 0 / pids 3 for 12 s, trips at 2.6 s once counted). COST,
 *      measured: one /proc environ walk ≈ 50 ms over 3,856 pids, paid per
 *      teardown and per GUARD_SAMPLE_MS while an app session is live.
 *
 * THE PICTURE IS THE APP ON THE vnc-display RUNG TOO (P8-2 x4, 2026-09-22;
 * owner: "就算是vnc也不能这样啊，完全无法做自动贴合，尺寸匹配吗？"): a whole-display
 * rung showed the app small in the top-left of a 1280x800 black root. Now the
 * keeper is the window manager's one job on that rung — the APP-FIT step:
 * the app's top-level is moved to 0,0 and resized to the framebuffer
 * (`display.applyWindowPlan` over PURE `M.appFitPlan`) (1) after the record
 * turns ready, retried every FIT_FIRST_STEP_MS until the app has mapped a
 * window (bounded by FIT_FIRST_WINDOW_MS), (2) on every SetDesktopSize the
 * bridge reports (`noteDesktopSize`, debounced FIT_DEBOUNCE_MS — noVNC asks
 * the display to follow its pane, Xvnc honours it in ~50 ms, and the fit
 * reads the size the server ACTUALLY took through xdpyinfo, never the ask),
 * and (3) at the tick as the belt (a window the app re-sized itself, a new
 * main after the old closed; nothing is touched when the plan is settled) —
 * since 2026-09-22 only while the plan settles, while input is recent or on
 * a 60 s slow belt, and a run whose `xwininfo -tree` text did not change
 * forks nothing more (FIT_SLOW_BELT_MS). In a WM FRAME (the fleet image
 * starts xfwm4) the plan fits the CLIENT, the act MAXIMISES it through the WM
 * and `appTitle` is the client's own name (M.appWindows). Whether the display can follow at all is the
 * rung's `fit` column (`M.fitPolicyOf`: Xvnc follows, Xvfb is FIXED — the
 * app is fitted to the fixed framebuffer once and the browser scales; the
 * view carries `fitMode` so the window chip names the limit); xpra fits from
 * the client (x2) and the shared desktop is never touched. `fb` (the
 * framebuffer as xdpyinfo states it) and `fit` (the last act: wid, size, why,
 * ms — or a refusal by name, e.g. xdotool missing, retried once a minute) are
 * FACTS on the record, committed only when they change. Every act is one
 * bounded child process (xdpyinfo, xwininfo/xdotool search, xdotool) — never
 * a sync spawn, never per window.
 *
 * A DEAD LEADER'S SESSION IS PROVEN BY THE APP'S OWN EVIDENCE (2026-09-22):
 * xpra hands its Xvfb a sanitised env without the session marker, so a
 * crashed xpra's Xvfb (sid = the dead pid) was proven by nothing and leaked;
 * `needlesOf(rec)` adds the per-app `XAUTHORITY=<data>/desktop-apps/<id>/
 * Xauthority` every process on the record's own display carries — the
 * teardown, the leftover census and the boot belt all ask both.
 *
 * THE XPRA RUNG (P8-2, 2026-09-21) is one more recipe, not one more branch:
 * `xpra-seamless` hands back `{display, port, wm:false, probe:'http'}` — the
 * xpra pid is recorded as `x` AND `server` (one process owns the Xvfb and the
 * picture socket), no WM of ours is started (xpra is the WM), the READY probe
 * is the recipe's own kind (`display.waitForListen`), and the app is STILL the
 * keeper's own detached child on that display (handle + starttime + session
 * marker, so app-exit / identity / teardown / the runaway sample are the same
 * code on every rung). Records carry `probe` so boot adoption asks the same
 * question the bring-up did. DA1: a launch resolves the ladder fresh (xpra
 * first when installed) — an EXISTING record keeps the backend it was born
 * with; adoption never re-resolves. The instance may reorder the ladder with
 * settings `desktop.backendPrefs` (a row's own `backendPrefs` still wins).
 */
const fs = require('fs');
const path = require('path');
const M = require('../desktop-apps');
const LIMITS = require('../keeper-limits');
const displayFacts = require('../desktop-display');
const DV = require('../desktop-viewers');

const STORE_FILE = 'desktop-apps.json';
const LOG_DIR = 'desktop-apps';
const TICK_MS = 5000;              // liveness + idle sweep
const STOP_GRACE_MS = 3000;        // SIGTERM → SIGKILL
const RFB_DEADLINE_MS = 15000;     // picture server must answer its banner within this
/** How long stop() waits for an in-flight bring-up to notice the verdict
 *  before its second teardown (rule 7). The bring-up's own longest wait after
 *  a part exists is the X server's `-displayfd` deadline (10 s, measured
 *  ~40 ms); RFB_DEADLINE_MS is the recipe's own ceiling, so a stop never
 *  waits longer than the launch it is cancelling could have taken. */
const SETTLE_BRINGUP_MS = RFB_DEADLINE_MS;
const HISTORY_KEEP = 50;           // terminal records kept for the launcher's "recent"/history
const HISTORY_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const FACTS_TTL_MS = 60000;
const DEFAULT_GEOMETRY = '1280x800';
/** P8-2 x4 — the app-fit step's clocks: a client's SetDesktopSize burst is
 *  debounced; after ready the first window is awaited in steps; a refused
 *  fit (a missing binary) is re-asked once a minute (binOnPath re-checks a
 *  NO on the same clock). */
const FIT_DEBOUNCE_MS = 250;
const FIT_FIRST_STEP_MS = 500;
const FIT_FIRST_WINDOW_MS = 15000;
const FIT_REFUSED_RETRY_MS = FACTS_TTL_MS;
/** THE BELT'S CADENCE (2026-09-22, the spawn-count finding: the tick re-read
 *  xdpyinfo + xwininfo + xdotool for every settled session every 5 s — 3
 *  forks per session per tick, ≈72 ms of blocked loop each at a 1.5 GB RSS).
 *  The belt now runs on a tick only while the plan is SETTLING (the
 *  FIT_SETTLE_RUNS reads after any act), while INPUT arrived within
 *  FIT_ACTIVE_MS (an app resizes itself because somebody pressed something —
 *  the calculator's mode switch), while a viewer is CONNECTED
 *  (`setWatchProbe` — the bridge's open sockets), or on the SLOW belt every
 *  FIT_SLOW_BELT_MS; a run reads xdpyinfo only when a client asked for a
 *  size (or on the slow belt), and the viewable-window read + the plan only
 *  when `xwininfo -tree`'s text changed. Settled + unwatched = 0 forks per
 *  tick; settled + watched = 1 (xwininfo). */
const FIT_SETTLE_RUNS = 2;
const FIT_ACTIVE_MS = 30000;
const FIT_SLOW_BELT_MS = 60000;
/** P8-2 x5 defaults (2.369.156, the verifier's two INFO items made the
 *  product's defaults): when the ACTIVE viewer's socket closes while other
 *  viewers remain, the seat is HELD for its pane for VIEWER_GRACE_MS — a
 *  page reload or a network blip must not hand the app to another device;
 *  the same pane (or the window that names it as its predecessor, `prev`)
 *  reconnecting inside the grace takes the seat back, and only when the
 *  grace runs out is the most recently active remaining viewer elected. */
const VIEWER_GRACE_MS = 5000;
/** The xpra rung's app title for a BLOCKED pane (it has no protocol session
 *  to read it from): re-read from X (`windows(id)`, two spawns) when a
 *  blocked seat appears and on the tick while one exists, at most this often. */
const XPRA_TITLE_EVERY_MS = 10000;
/** The env marker every process of a session inherits — its identity when
 *  the leader is gone (KEEPER_ENV in the PURE model reserves the name). */
const SESSION_ENV = 'VIBESPACE_DESKTOP_APP';
const PARTS = Object.freeze(['app', 'server', 'wm', 'x']); // teardown order

function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const namedError = (code, msg) => { const e = new Error(msg); e.code = code; return e; };

/**
 * @param {object} deps
 *   dataDir        — the instance's data/ (record + per-app logs)
 *   env            — () => sanitised base env (ws-handler.agentEnv), NEVER process.env
 *   broadcast      — (msg) => void  (desktop-apps-updated)
 *   serverSetting  — (key) => value (desktop.idleTimeoutMin)
 *   getTelemetry   — () => telemetry | null
 *   singleton      — optional () => ({ running, display, port, authFile, refresh? }) — the
 *                    pre-existing in-container desktop (src/vnc.js) for the
 *                    desktop-singleton rung; absent ⇒ that rung never resolves.
 *                    `refresh()` (= vnc.js status()) is asked before every verdict.
 *   display        — the desktop-display module (injectable for the suite)
 *   limits         — src/keeper-limits (injectable: the runaway suite shrinks them)
 *   registryRows   — the registry (default DEFAULT_REGISTRY; the suite hands a CPU burner)
 *   backends       — the capability table (default M.DISPLAY_BACKENDS; the suite hands a copy
 *                    with a fourth rung to prove this file needs no change for one)
 *   log, now, tickMs, geometry, hostId
 *   fitSlowBeltMs  — the settled belt's cadence (default FIT_SLOW_BELT_MS; the suite shrinks it)
 *   viewerGraceMs  — x5: how long the active pane's seat is held after its socket closed (default VIEWER_GRACE_MS; 0 = re-elect at once)
 */
function create({ dataDir, env, broadcast, serverSetting = () => undefined, getTelemetry = () => null, singleton = null,
  display = displayFacts, limits = LIMITS, registryRows = M.DEFAULT_REGISTRY, backends = M.DISPLAY_BACKENDS, log = console, now = Date.now, tickMs = TICK_MS, guardSampleMs = null, geometry = DEFAULT_GEOMETRY, hostId = null, fitSlowBeltMs = FIT_SLOW_BELT_MS, viewerGraceMs = VIEWER_GRACE_MS } = {}) {
  if (!dataDir) throw new Error('desktop-app-keeper: dataDir is required');
  if (typeof env !== 'function') throw new Error('desktop-app-keeper: env must be a function returning the sanitised base env');
  display.assertLocal(hostId, 'keeper');
  const storeFile = path.join(dataDir, STORE_FILE);
  const logRoot = path.join(dataDir, LOG_DIR);
  const sampleEvery = guardSampleMs || limits.GUARD_SAMPLE_MS;

  // ── state ──
  let store = { apps: {}, runawayParkedUntil: {} };
  const children = new Map();   // id -> { x, server, wm, app } ChildProcess handles (this process's spawns only)
  const inflight = new Map();   // id -> the bringUp promise while it runs (rule 7: stop() waits for it)
  const guard = new Map();      // id -> { prev, hotSince, lastSampleAt }
  const live = new Map();       // id -> { cpuPct, rssBytes, sampledAt }
  const fits = new Map();       // id -> { timer, inflight, firstUntil, refusedAt } (P8-2 x4: the app-fit step's state, never persisted)
  const stopping = new Set();
  // P8-2 x5 — THE VIEWERS of each app window (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"): ONE active
  // human viewer per window, the rule PURE in src/desktop-viewers.js. Viewer ids only — the sockets are the bridge's (this
  // file touches no WebSocket); never persisted: a restart re-elects from the sockets that come back.
  const viewerSets = new Map(); // id -> { active: viewerId|null, entries: Map viewerId -> {viewerId, pane, label, since, joinedAt}, paneActiveAt: Map pane -> ms, grace: {pane, timer, until}|null }
  const viewerListeners = new Set();
  const titleReads = new Map(); // id -> { at, inflight } (x5: the xpra rung's app title for a blocked pane)
  let dirty = false;
  let factsCache = null;        // { at, facts }
  let timer = null;

  function load() {
    try {
      const j = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
      if (j && typeof j === 'object' && j.apps && typeof j.apps === 'object') store = { apps: j.apps, runawayParkedUntil: j.runawayParkedUntil || {} };
    } catch (e) { if (e.code !== 'ENOENT') log.warn?.(`[desktop] ${STORE_FILE} unreadable (${e.message}) — starting empty; the old file is left in place`); }
  }
  function save() {
    try { fs.mkdirSync(dataDir, { recursive: true }); writeJsonAtomic(storeFile, store); dirty = false; }
    catch (e) { log.warn?.(`[desktop] could not write ${STORE_FILE}: ${e.message}`); }
  }
  function notify() {
    try { broadcast?.({ type: 'desktop-apps-updated', apps: listApps() }); } catch (e) { log.warn?.(`[desktop] broadcast failed: ${e.message}`); }
    // x5: a session that ended takes its viewer set with it — the bridge's refresh closes the sockets it still holds open
    for (const id of [...viewerSets.keys()]) { const r = store.apps[id]; if (!r || !M.isLiveState(r.state)) { clearGrace(viewerSets.get(id)); viewerSets.delete(id); titleReads.delete(id); publishViewers(id); } }
  }
  function commit() { save(); notify(); }

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
    const rec = store.apps[id];
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
      const cur = store.apps[id];
      if (title && cur && cur.state === 'ready' && cur.appTitle !== title) { cur.appTitle = title; commit(); }
      return title;
    })().catch((e) => { log.warn?.(`[desktop] ${id}: could not read the app's title (${why}): ${e && e.message}`); return null; }).finally(() => { tr.inflight = null; });
    return tr.inflight;
  }
  function activeViewer(id) { const s = viewerSets.get(id); return s ? s.active : null; }
  /** The bridge's hook: every change of a window's viewer set (join / leave / takeover / the session ended). */
  function onViewers(fn) { if (typeof fn !== 'function') return () => {}; viewerListeners.add(fn); return () => viewerListeners.delete(fn); }

  // ── the shared desktop, RE-ASKED (rule 6) ──
  /** The singleton facts with `running` refreshed through vnc.js's own probe
   *  when it offers one; the cached answer only when it does not. */
  async function singletonLive() {
    let s = null;
    try { s = singleton?.() || null; } catch { s = null; }
    if (!s) return null;
    if (typeof s.refresh === 'function') {
      try { const st = await s.refresh(); if (st && typeof st.running === 'boolean') s = { ...s, running: st.running, port: st.port || s.port }; }
      catch (e) { log.warn?.(`[desktop] shared desktop probe failed (${e.message}) — using its last answer (running=${!!s.running})`); }
    }
    return s;
  }

  // ── facts + ladder ──
  async function facts({ fresh = false } = {}) {
    if (!fresh && factsCache && now() - factsCache.at < FACTS_TTL_MS) return factsCache.facts;
    const f = await display.hostFacts({ hostId, env: env() });
    const s = await singletonLive();
    const out = { ...f, singletonRunning: !!(s && s.running) };
    factsCache = { at: now(), facts: out };
    return out;
  }
  /** The instance's ladder order (settings `desktop.backendPrefs`), a row's own
   *  `backendPrefs` taking precedence — empty ⇒ the table's DA1 order. */
  function instancePrefs() { return M.parseBackendPrefs(serverSetting('desktop.backendPrefs'), backends); }
  function prefsFor(row) { return row && Array.isArray(row.backendPrefs) && row.backendPrefs.length ? row : { backendPrefs: instancePrefs() }; }
  function resolve(hostFacts, prefs) { return M.resolveBackend(hostFacts, prefsFor(prefs), backends); }

  function registry(hostFacts) {
    const bins = (hostFacts && hostFacts.bins) || {};
    return registryRows.map((row) => {
      const p = row.exec.includes('/') ? (fs.existsSync(row.exec) ? row.exec : null) : (bins[row.exec] !== undefined ? bins[row.exec] : display.binOnPath(row.exec, { env: env() }));
      const park = M.runawayParkVerdict(row.id, store.runawayParkedUntil, now());
      return { ...row, args: [...row.args], available: !!p, path: p, reason: p ? (park ? park.error : null) : `${row.exec} not on PATH`, parkedUntil: park ? park.until : null };
    });
  }

  // ── views ──
  function view(rec) {
    const l = live.get(rec.id) || null;
    const b = rec.backend ? M.backendById(rec.backend, backends) : null;
    // `stream` / `wired` / `fitMode` are the rung's TABLE facts laid over the record in the VIEW (the stored record keeps facts only)
    const fp = M.fitPolicyOf(rec, backends);
    return { ...rec, pids: { ...rec.pids }, starts: { ...rec.starts }, stream: b ? b.stream : null, wired: b ? b.wired !== false : null, fitMode: fp ? fp.mode : null, fitBy: fp ? fp.by : null, fb: rec.fb ? { ...rec.fb } : null, fit: rec.fit ? { ...rec.fit } : null, live: l ? { ...l } : null, idle: M.isLiveState(rec.state) ? M.idleState(rec, now(), rec.idleTimeoutMs) : null };
  }
  function listApps() { return Object.values(store.apps).map(view).sort((a, b) => b.startedAt - a.startedAt); }
  function liveRecords() { return Object.values(store.apps).filter((r) => M.isLiveState(r.state)); }
  function get(id) { const r = store.apps[id]; return r ? view(r) : null; }

  async function list() {
    const f = await facts();
    const resolved = resolve(f);
    return { apps: listApps(), registry: registry(f), availability: { backend: resolved.backend, via: resolved.via, recipe: resolved.recipe, stream: resolved.stream, fallbackWhy: resolved.fallbackWhy, ladder: resolved.ladder, prefs: instancePrefs(), xpra: f.xpra, bins: f.bins }, cap: { used: liveRecords().length, cap: limits.CONCURRENT_CAP }, idleTimeoutMin: idleTimeoutMin() };
  }

  function idleTimeoutMin() {
    const v = Number(serverSetting('desktop.idleTimeoutMin'));
    return Number.isFinite(v) && v >= 0 ? v : M.DEFAULT_IDLE_TIMEOUT_MIN;
  }

  // ── launch ──
  function resolveExec(exec) {
    if (exec.includes('/')) {
      const p = path.resolve(exec);
      try { const st = fs.statSync(p); if (st.isFile() && (st.mode & 0o111)) return p; } catch { /* fall through */ }
      throw namedError('exec-not-found', `${exec} is not an executable file`);
    }
    const p = display.binOnPath(exec, { env: env() });
    if (!p) throw namedError('exec-not-found', `${exec} not on PATH`);
    return p;
  }
  function resolveCwd(cwd) {
    if (!cwd) return null;
    const p = path.resolve(cwd);
    try { if (fs.statSync(p).isDirectory()) return p; } catch { /* fall through */ }
    throw namedError('cwd-missing', `cwd ${cwd} does not exist`);
  }
  function newId() { return `da-${now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }

  async function launch(body) {
    const f = await facts();
    const reg = registry(f);
    const v = M.validateLaunchRequest(body || {}, reg);
    if (!v.ok) throw namedError('bad-request', v.error);
    const row = v.launch.row;
    const cap = M.capVerdict(liveRecords(), limits);
    if (cap) throw namedError(cap.code, cap.error);
    if (v.launch.source === 'registry') {
      const park = M.runawayParkVerdict(row.id, store.runawayParkedUntil, now());
      if (park) throw namedError(park.code, park.error);
    }
    if (row.needsWayland) throw namedError('needs-wayland', `${row.label} needs a Wayland compositor and cannot run on a private X display`);
    const execPath = resolveExec(row.exec);
    const cwd = resolveCwd(row.cwd);
    const resolved = resolve(f, row);
    if (!resolved.backend) throw namedError('no-backend', `no display backend on this machine (${resolved.fallbackWhy})`);
    const backend = M.backendById(resolved.backend, backends);
    if (!backend.wired) throw namedError('backend-not-wired', `${resolved.backend} is probed and recorded but its relay is not wired (${resolved.via})`); // unreachable through the shipped table (resolveBackend passes an unwired rung over) — the belt for a table copy
    if (!resolved.recipe || typeof display.RECIPES?.[resolved.recipe] !== 'function') throw namedError('no-recipe', `${resolved.backend} via ${resolved.via} names no bring-up recipe (${resolved.recipe || 'none'}) — the capability table and desktop-display disagree`);
    const line = M.fallbackLogLine(resolved);
    if (line) log.log?.(line);
    const id = newId();
    const rec = M.newRecord({ id, label: row.label, exec: execPath, args: row.args || [], cwd, env: row.env, source: v.launch.source, backend: resolved.backend, via: resolved.via, fallbackWhy: resolved.fallbackWhy, idleTimeoutMs: idleTimeoutMin() * 60000, now: now() });
    if (v.launch.source === 'registry') rec.appId = row.id;
    rec.recipe = resolved.recipe;
    store.apps[id] = rec;
    pruneHistory();
    commit();
    const p = bringUp(rec, f).catch((e) => log.warn?.(`[desktop] ${id} bring-up crashed: ${e.stack || e.message}`));
    inflight.set(id, p);
    p.finally(() => { if (inflight.get(id) === p) inflight.delete(id); }).catch(() => { });
    return view(rec);
  }

  function appDir(id) { const d = path.join(logRoot, id); fs.mkdirSync(d, { recursive: true }); return d; }
  const sessionMarker = (id) => `${SESSION_ENV}=${id}`;
  /** The environ needles that PROVE a pid belongs to `rec` (2026-09-22): the
   *  marker every process the keeper starts inherits, and — on a display of
   *  its own — the per-app `XAUTHORITY=<data>/desktop-apps/<id>/Xauthority`
   *  every process on that display carries. xpra's own Xvfb gets a sanitised
   *  env WITHOUT the marker but WITH that path (measured on 6.5.3), so a dead
   *  xpra's Xvfb (~100-190 MB) was proven by nothing and leaked for ever. */
  const needlesOf = (rec) => (rec.backend === 'desktop-singleton' ? [sessionMarker(rec.id)] : [sessionMarker(rec.id), `XAUTHORITY=${path.join(logRoot, rec.id, 'Xauthority')}`]);
  const carriesEvidence = (pid, needles) => needles.some((n) => display.environHas(pid, n));
  /** ONE /proc walk over the needles of `recs` → Map<id, pid[]> (never this process). */
  function evidenceCensus(recs) {
    const want = new Map();
    for (const r of recs) for (const n of needlesOf(r)) want.set(n, r.id);
    const out = display.environCensus(want);
    for (const [id, pids] of out) out.set(id, pids.filter((p) => p !== process.pid));
    return out;
  }
  /** Wait (bounded) for `id`'s bring-up to finish — a stop must not race the
   *  recipe that is still minting parts (rule 7). `p0` is the promise the
   *  caller CAPTURED before it started tearing down (rule 9: by the time the
   *  first teardown returns, `inflight` may already have forgotten it).
   *  Resolves true when there was one and it settled inside the bound. */
  async function settleBringUp(id, boundMs = SETTLE_BRINGUP_MS, p0 = null) {
    const p = p0 || inflight.get(id);
    if (!p) return false;
    let timer = null;
    const settled = await Promise.race([p.then(() => true, () => true), new Promise((r) => { timer = setTimeout(() => r(false), boundMs); })]);
    if (timer) clearTimeout(timer);
    if (!settled) log.warn?.(`[desktop] ${id}: bring-up still running ${boundMs} ms after the stop — its remaining parts are reaped as they appear and again when it ends`);
    return settled;
  }

  async function bringUp(rec, f) {
    const id = rec.id;
    const dir = appDir(id);
    const logFd = fs.openSync(path.join(dir, 'app.log'), 'a');
    const handles = { x: null, server: null, wm: null, app: null };
    children.set(id, handles);
    const base = { ...env(), [SESSION_ENV]: id };
    // rule 7: the record can turn terminal UNDER this function (a part that
    // exited, the guard) or a stop can be in progress (`stopping`) — every
    // await is followed by this question, and a `true` answer means "add
    // nothing more": a stop reaps through its own settle + second teardown,
    // any other terminal path through onPart's late reap and the finally.
    const gone = () => !M.isLiveState(rec.state) || stopping.has(id);
    const dead = () => !M.isLiveState(rec.state);
    const failed = async (why) => { if (gone()) return; fail(rec, 'spawn-error', why); await teardown(rec, handles); commit(); };
    try {
      const recipe = display.RECIPES[rec.recipe];
      if (typeof recipe !== 'function') throw namedError('no-recipe', `no bring-up recipe named ${JSON.stringify(rec.recipe)}`);
      const cookie = display.newCookie();
      const authFile = path.join(dir, 'Xauthority');
      display.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }]);
      const ctx = {
        bins: f.bins, dir, authFile, cookie, geometry, base, logFd,
        freePort: () => display.freePort(),
        x11Env: (disp) => display.x11Env(base, { display: disp, authFile }),
        writeAuth: (disp) => display.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }, { display: disp, cookieHex: cookie }]),
        singleton: () => singletonLive(),
        // rule 2: a part is RECORDED and COMMITTED the moment its pid exists
        onPart: (part, child, facts = {}) => {
          handles[part] = child;
          rec.pids[part] = child.pid; rec.starts[part] = display.procStart(child.pid);
          if (facts.alsoServer) { rec.pids.server = child.pid; rec.starts.server = rec.starts[part]; }
          if (facts.display) rec.display = facts.display;
          if (facts.port) rec.port = facts.port;
          child.once('exit', (code, signal) => onPartExit(id, part, code, signal));
          commit();
          // rule 7: a part that arrives AFTER the record died is killed the
          // moment it is known — the recipe may wait seconds before its next
          // step, and the finally below is only reached when it returns.
          if (dead()) {
            log.warn?.(`[desktop] ${id}: ${part} (pid ${child.pid}) was spawned after the record turned ${rec.state} — reaping it now`);
            killSessionVerified(rec, part, handles).then(() => commit()).catch((e) => log.warn?.(`[desktop] ${id}: late reap of ${part} failed: ${e.message}`));
          }
        },
      };
      const up = await recipe(ctx);
      if (gone()) return; // died during the bring-up (a part exited, or a stop)
      rec.display = up.display; rec.port = up.port; rec.probe = up.probe || 'rfb'; // the READY probe's kind is a FACT of the record (boot adoption asks the same one)
      const own = !up.shared;
      const sessionAuth = own ? authFile : (up.authFile || null);
      if (own && up.wm !== false) { // a recipe that IS the window manager (xpra) says wm:false
        const wm = await display.startWindowManager({ bins: f.bins, env: ctx.x11Env(up.display), logFd });
        if (wm) ctx.onPart('wm', wm.child, {});
        if (gone()) return;
      } else commit();
      // the app itself — the sanitised env + the row's own + the display
      const appEnv = { ...display.x11Env(base, { display: up.display, authFile: sessionAuth || base.XAUTHORITY }), ...(rec.env || {}) };
      if (!sessionAuth) delete appEnv.XAUTHORITY;
      const a = await display.startApp({ exec: rec.exec, args: rec.args, cwd: rec.cwd, env: appEnv, logFd });
      ctx.onPart('app', a, {});
      if (gone()) return;
      const w = await display.waitForListen(rec.probe, up.port, { deadlineMs: RFB_DEADLINE_MS, child: handles.server || handles.x, now });
      if (gone()) return; // died during the wait
      if (!w.ok) { await failed(w.why); return; }
      if (own) {
        // rule 3: the banner proved SOMEBODY listens on 127.0.0.1:<port>; the
        // record turns ready only when that somebody is our picture server's
        // session (an Xvnc shim's real listener is its child).
        const serverPid = rec.pids.server || rec.pids.x;
        const holder = display.listenerHeldBy(up.port, display.sessionCensus([serverPid], { fresh: true }));
        if (!holder) { await failed(`127.0.0.1:${up.port} answered ${rec.probe === 'http' ? 'HTTP' : 'an RFB banner'} but the socket is not held by the picture server (pid ${serverPid}) — the port was taken by another process; nothing was recorded as ready`); return; }
      }
      if (gone()) return;
      rec.state = M.transition(rec.state, 'server-listening') || rec.state;
      rec.readyAt = now();
      log.log?.(`[desktop] ${id} ready: ${rec.label} on ${rec.display} via ${rec.backend}/${rec.via} (${rec.recipe}) port ${rec.port}${rec.fallbackWhy ? ` (${rec.fallbackWhy})` : ''}`);
      commit();
      armFirstFit(id); // P8-2 x4: the app's window may map seconds after ready (GTK ~1-2 s) — fitted the moment it exists
    } catch (e) {
      await failed(e.code ? `${e.message} [${e.code}]` : e.message);
    } finally {
      try { fs.closeSync(logFd); } catch { /* already closed */ }
      // rule 7: whatever this bring-up recorded after its record DIED is
      // reaped HERE, on every exit — the early returns above and the catch.
      // (A stop in progress is not `dead()` yet: it is waiting on this very
      // promise and tears down again the moment it settles.)
      if (dead()) {
        const left = PARTS.filter((part) => rec.pids[part] && partIsOurs(rec, part, handles));
        if (left.length) log.warn?.(`[desktop] ${id}: bring-up ended on a ${rec.state} record with ${left.join(', ')} still alive — reaping`);
        try { await teardown(rec, handles); } catch (e) { log.warn?.(`[desktop] ${id}: reap at bring-up exit failed: ${e.message}`); }
        commit();
      }
    }
  }

  function fail(rec, event, why) {
    const next = M.transition(rec.state, event);
    if (!next) return;
    rec.state = next; rec.lastError = why; rec.endedAt = now();
    log.warn?.(`[desktop] ${rec.id} ${next}: ${why}`);
  }
  function onPartExit(id, part, code, signal) {
    const rec = store.apps[id];
    if (!rec || !M.isLiveState(rec.state) || stopping.has(id)) return;
    if (part === 'app') {
      rec.exitCode = code;
      fail(rec, 'app-exit', signal ? `application ended by ${signal}` : `application exited (code ${code})`);
    } else if (part === 'x') fail(rec, 'display-gone', `X display ${rec.display} exited (${signal || `code ${code}`})`);
    else if (part === 'wm') { log.warn?.(`[desktop] ${id}: the window manager exited (${signal || `code ${code}`}) — the app keeps running bare`); return; }
    else fail(rec, 'display-gone', `picture server exited (${signal || `code ${code}`})`);
    teardown(rec, children.get(id)).then(() => commit());
  }

  // ── identity (rule 8): is this recorded part STILL the process we mean? ──
  /** A ChildProcess this process spawned and node has not yet reaped names
   *  exactly that process (node owns the wait; a reaped handle carries an
   *  exitCode/signalCode and its pid is free to be recycled). */
  const handleLive = (h) => !!(h && h.pid && h.exitCode == null && h.signalCode == null);
  /**
   * ONE ladder for "is `rec.pids[part]` ours right now": a live handle this
   * process spawned → pid AND recorded starttime → not proven. An identity
   * nobody recorded (a null starttime: an older record, a machine with no
   * readable /proc) is NOT proven — `sameProcess` says so — and an unproven
   * leader is never signalled; only members carrying the session marker are.
   */
  function partIsOurs(rec, part, handles) {
    const pid = rec.pids[part];
    if (!pid) return false;
    const h = handles && handles[part];
    if (h && h.pid === pid) return handleLive(h);
    return display.sameProcess(pid, rec.starts[part]);
  }

  // ── stop / teardown (rule 4: a SESSION, verified empty) ──
  const signalAll = (pids, sig) => { for (const p of pids) { try { process.kill(p, sig); } catch { /* gone or not ours */ } } };
  const anyAlive = (pids) => pids.some((p) => display.pidAlive(p));
  /** SIGTERM `targets` (+ the group of a PROVEN leader), verify gone, SIGKILL
   *  what is left, verify again. Returns true when nothing survived. */
  async function signalVerified(rec, label, targets, leaderPid) {
    if (!targets.length) return true;
    if (leaderPid) { try { process.kill(-leaderPid, 'SIGTERM'); } catch { /* the group is already gone */ } }
    signalAll(targets, 'SIGTERM');
    const until = now() + STOP_GRACE_MS;
    while (now() < until) { if (!anyAlive(targets)) return true; await sleep(100); }
    if (leaderPid) { try { process.kill(-leaderPid, 'SIGKILL'); } catch { /* gone */ } }
    signalAll(targets, 'SIGKILL');
    const until2 = now() + 1500;
    while (now() < until2) { if (!anyAlive(targets)) return true; await sleep(100); }
    const left = targets.filter((p) => display.pidAlive(p));
    log.warn?.(`[desktop] ${rec.id}: ${label} left ${left.length} process(es) alive after SIGKILL: ${left.join(', ')}`);
    return false;
  }
  /**
   * Stop ONE part's whole session: the recorded leader (proven by a live
   * handle or by pid+starttime) and every pid whose session id is the
   * leader's. When the leader is proven ours, its session is ours by
   * construction (sid == our detached pid) and the group is signalled too;
   * when it is gone, recycled, or NEVER PROVEN (rule 8) only members carrying
   * THIS session's own evidence (`needlesOf`: the env marker, or the per-app
   * XAUTHORITY — xpra's Xvfb carries only the latter) are ours, and a member
   * without it is left alone (it may be a stranger's). Returns true when nothing of ours
   * survived. `fresh:false` = the caller refreshed the session table itself.
   */
  async function killSessionVerified(rec, part, handles = null, { fresh = true } = {}) {
    const pid = rec.pids[part];
    if (!pid) return true;
    const leaderOk = partIsOurs(rec, part, handles);
    const needles = needlesOf(rec);
    let members = display.sessionMembers(pid, { fresh }).filter((p) => p !== pid);
    if (!leaderOk) members = members.filter((p) => carriesEvidence(p, needles));
    const targets = leaderOk ? [pid, ...members] : members;
    return signalVerified(rec, `${part} session`, targets, leaderOk ? pid : null);
  }
  /**
   * Every live pid that still carries `rec`'s session marker — ONE /proc
   * environ walk (~50 ms over 3,856 pids on the dev box). The sid table is
   * NOT the session (rule 10): a member that `setsid()`s itself — a
   * daemonising launcher, `setsid …`/`nohup … & disown` typed into the
   * app's own terminal — leaves every leader's session and the sid-based
   * teardown never sees it again, while the env it INHERITED still names
   * this session. Never this process (a hand-written env could name it).
   */
  function markerLeftovers(rec) {
    let census;
    try { census = evidenceCensus([rec]); } catch (e) { log.warn?.(`[desktop] ${rec.id}: marker census failed after the teardown (${e.message}) — a member that left the sid table cannot be found`); return []; }
    return census.get(rec.id) || [];
  }
  /** app → picture server → WM → X, each session verified empty (ONE fresh
   *  session-table read for the whole pass), THEN whatever still carries the
   *  session marker (rule 10 — the members the sid table lost). Every
   *  terminal path passes here (stop, an app that exited, a failed bring-up,
   *  boot adoption), so `exited`/`failed` mean "nothing of this session's
   *  runs" on every one of them. Returns true when nothing survived. */
  async function teardown(rec, handles) {
    const own = rec.backend !== 'desktop-singleton';
    let clean = true;
    display.refreshSessions();
    for (const part of PARTS) {
      if (!own && part !== 'app') continue;
      if (part === 'server' && rec.pids.server && rec.pids.server === rec.pids.x) continue; // one pid, signalled as `x`
      if (!(await killSessionVerified(rec, part, handles, { fresh: false }))) clean = false;
    }
    const escaped = markerLeftovers(rec);
    if (escaped.length) {
      log.warn?.(`[desktop] ${rec.id}: ${escaped.length} process(es) still carry its marker after the session teardown (in no recorded leader's session: a member that setsid()'d, or a part that arrived after the sweep): ${escaped.join(', ')} — reaping`);
      if (!(await signalVerified(rec, 'session marker leftover', escaped, null))) clean = false;
    }
    children.delete(rec.id); guard.delete(rec.id); live.delete(rec.id); clearFit(rec.id);
    return clean;
  }
  async function stop(id, { why = 'user' } = {}) {
    const rec = store.apps[id];
    if (!rec) throw namedError('not-found', `no desktop app ${id}`);
    if (!M.isLiveState(rec.state)) return view(rec);
    if (stopping.has(id)) return view(rec);
    stopping.add(id);
    try {
      // rule 7: `stopping` is what a bring-up still in flight reads at its next
      // await (it adds no more parts); tear down what is recorded now (this
      // also ends the recipe's RFB wait, which watches the picture server's
      // exit), WAIT for the bring-up itself (bounded), tear down whatever it
      // recorded meanwhile — and only THEN the verdict: a terminal state keeps
      // meaning "torn down, verified" to every reader of the record.
      // rule 9: the in-flight bring-up is CAPTURED before the first teardown.
      // That teardown waits ≥ 100 ms per part it signals, which is long
      // enough for the bring-up to record its next part, hit `gone()` and
      // settle — and its `finally` in launch() then FORGETS it in `inflight`
      // before this function looks again, so an `inflight.has(id)` asked
      // afterwards answered false and the part it had just recorded was never
      // torn down (measured: stop injected at the app's spawn ⇒ `exited` with
      // pids.app set and `/bin/sleep 3600` carrying the marker 5 s later).
      const handles = children.get(id);
      const inflightP = inflight.get(id) || null;
      let clean = await teardown(rec, handles);
      if (inflightP) {
        await settleBringUp(id, SETTLE_BRINGUP_MS, inflightP);
        if (!(await teardown(rec, handles))) clean = false;
      }
      const next = M.transition(rec.state, why === 'runaway' ? 'runaway' : 'stop');
      rec.state = next || 'exited';
      rec.endedAt = now();
      rec.stoppedBy = why;
      if (why === 'idle') rec.lastError = `stopped after ${Math.round(rec.idleTimeoutMs / 60000)} min without input (idle timeout)`;
      else if (why !== 'user' && why !== 'runaway') rec.lastError = why;
      if (!clean) rec.lastError = `${rec.lastError ? rec.lastError + '; ' : ''}a process survived SIGKILL — check ${LOG_DIR}/${id}/app.log`;
      log.log?.(`[desktop] ${id} stopped (${why}): ${rec.label}${clean ? '' : ' — NOT clean'}`);
      commit();
      return view(rec);
    } finally { stopping.delete(id); }
  }
  function keepAlive(id) {
    const rec = store.apps[id];
    if (!rec) throw namedError('not-found', `no desktop app ${id}`);
    rec.idleTimeoutMs = 0; rec.lastInputAt = now();
    commit();
    return view(rec);
  }
  function noteInput(id) {
    const rec = store.apps[id];
    if (!rec || !M.isLiveState(rec.state)) return;
    rec.lastInputAt = now(); dirty = true;
    if (fitApplies(rec)) fitState(id).activeUntil = rec.lastInputAt + FIT_ACTIVE_MS; // somebody is acting: the app may resize itself — the belt runs every tick for a while
  }

  // ── P8-2 x4: THE APP-FIT STEP (the picture is the app and nothing else) ──
  function fitState(id) { let f = fits.get(id); if (!f) { f = { timer: null, inflight: null, firstUntil: 0, refusedAt: 0, sizeAsked: true, tree: null, settledRuns: 0, beltAt: 0, activeUntil: 0 }; fits.set(id, f); } return f; }
  /** "Is somebody watching record `id` right now" — the bridge's open-socket
   *  count, handed in by the desktop scene's wiring (window-live-wiring);
   *  absent ⇒ nobody is known to watch. A WATCHED session is checked every
   *  tick (one xwininfo; nothing more when the tree is unchanged) — a window
   *  that appears or moves WITHOUT input (an agent acting through window
   *  targets, a dialog the app opens by itself, an xterm spawned on the
   *  display) is seen within a tick; an unwatched one waits for the slow belt. */
  let watchProbe = null;
  function setWatchProbe(fn) { watchProbe = typeof fn === 'function' ? fn : null; }
  const watched = (id) => { try { return !!(watchProbe && watchProbe(id)); } catch { return false; } };
  /** Is a TICK's belt due for this record (see FIT_SLOW_BELT_MS)? */
  function beltDue(id, f, t) { return f.settledRuns < FIT_SETTLE_RUNS || t < f.activeUntil || watched(id) || t - f.beltAt >= fitSlowBeltMs; }
  function clearFit(id) { const f = fits.get(id); if (f) { clearTimeout(f.timer); fits.delete(id); } }
  /** Does the keeper fit this record's app at all (a live, ready, OWN rfb
   *  display whose rung's `fit` column says the keeper does it)? */
  function fitApplies(rec) { return !!rec && rec.state === 'ready' && !stopping.has(rec.id) && M.keeperFits(M.fitPolicyOf(rec, backends)); }
  /** The bridge's report: a client asked the display to be w×h. The server
   *  may or may not take it (Xvnc does, x11vnc cannot) — the fit reads the
   *  truth; the ask is only the trigger, debounced. */
  function noteDesktopSize(id, w, h) {
    const rec = store.apps[id];
    if (!fitApplies(rec)) return;
    fitState(id).sizeAsked = true;
    scheduleFit(id, `client asked ${w}x${h}`, FIT_DEBOUNCE_MS);
  }
  function scheduleFit(id, why, delayMs) {
    const f = fitState(id);
    clearTimeout(f.timer);
    f.timer = setTimeout(() => { f.timer = null; fitApp(id, why).catch((e) => log.warn?.(`[desktop] ${id}: fit failed: ${e.message}`)); }, delayMs);
    if (f.timer.unref) f.timer.unref();
  }
  /** After ready: ask every FIT_FIRST_STEP_MS until the app has a top-level
   *  window (bounded by FIT_FIRST_WINDOW_MS); the tick is the belt after. */
  function armFirstFit(id) {
    const f = fitState(id);
    f.firstUntil = now() + FIT_FIRST_WINDOW_MS;
    scheduleFit(id, 'ready', 0);
  }
  /**
   * ONE fit: the framebuffer as the server states it (xdpyinfo) → the app's
   * windows (enumerateWindows) → PURE plan → xdotool. Records `fb` and `fit`
   * as FACTS and commits only when they changed; logs one line per act or
   * per NEW refusal. Serialised per record (a second call while one runs
   * shares its promise). Returns the plan's verdict.
   */
  async function fitApp(id, why = 'tick') {
    const rec = store.apps[id];
    if (!fitApplies(rec) || !rec.display) return { ok: false, why: 'not applicable' };
    const f = fitState(id);
    if (f.inflight) return f.inflight;
    f.inflight = (async () => {
      const t = now();
      if (f.refusedAt && t - f.refusedAt < FIT_REFUSED_RETRY_MS) return { ok: false, why: rec.fit && rec.fit.why };
      const hf = await facts();
      const xenv = x11EnvFor(id);
      if (!xenv) return { ok: false, why: 'no display' };
      const belt = why === 'tick';
      const slow = t - f.beltAt >= fitSlowBeltMs;
      if (belt) f.beltAt = t;
      let changed = false;
      // the framebuffer changes only when a client asked (Xvnc follows SetDesktopSize) — read it then, on a non-belt run, or on the slow belt
      if (!rec.fb || f.sizeAsked || !belt || slow) {
        const size = await display.displaySize({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv, bins: hf.bins });
        if (!size.ok) return refuse(rec, f, size.why);
        f.sizeAsked = false;
        if (!rec.fb || rec.fb.w !== size.w || rec.fb.h !== size.h) { rec.fb = { w: size.w, h: size.h, at: t }; changed = true; }
      }
      const tree = await display.windowTree({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv, bins: hf.bins });
      if (!tree.ok) return refuse(rec, f, tree.why, changed);
      // an UNCHANGED tree over an unchanged framebuffer after a settled read: nothing moved — no visibility read, no plan
      if (belt && !changed && f.tree === tree.text && f.settledRuns > 0) { f.settledRuns++; return { ok: true, settled: true, wid: rec.fit && rec.fit.wid, unchanged: true }; }
      const visible = await display.viewableWindows({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv, bins: hf.bins });
      const windows = tree.rows.map((r) => ({ ...r, mapped: visible ? visible.has(r.id) : null }));
      const plan = M.appFitPlan(windows, rec.fb, { applied: rec.fit && rec.fit.ok ? rec.fit : null });
      if (!plan.main) {
        f.tree = null; f.settledRuns = 0;
        // no window yet: keep asking while the first-window budget lasts, then the tick's belt
        if (f.firstUntil && t < f.firstUntil && !stopping.has(id)) scheduleFit(id, why, FIT_FIRST_STEP_MS);
        if (changed) commit();
        return { ok: false, why: plan.why };
      }
      f.firstUntil = 0;
      // the main window's OWN title (a fact read by the same enumeration — no extra spawn): the window shows it instead of the label
      const title = M.windowTitleOf(plan.main.name);
      if ((rec.appTitle || null) !== title) { rec.appTitle = title; changed = true; }
      if (plan.settled) { f.tree = tree.text; f.settledRuns++; if (changed) commit(); return { ok: true, settled: true, wid: plan.main.id }; }
      f.tree = null; f.settledRuns = 0;
      const act = await display.applyWindowPlan({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv, bins: hf.bins, plan });
      if (!act.ok) return refuse(rec, f, act.why, changed);
      f.refusedAt = 0;
      rec.fit = { ok: true, wid: plan.main.id, w: rec.fb.w, h: rec.fb.h, moved: plan.moves.length, at: t, why, ms: act.ms, via: act.via || null };
      log.log?.(`[desktop] ${id}: fitted ${rec.label}'s window 0x${plan.main.id.toString(16)} ${plan.main.w}x${plan.main.h}+${plan.main.x}+${plan.main.y} → ${rec.fb.w}x${rec.fb.h}+0+0 (${why}, ${act.ms} ms${act.via === 'wm' ? ', maximised by the window manager' : ''}${plan.moves.length ? `, ${plan.moves.length} other window(s) nudged inside` : ''})`);
      commit();
      return { ok: true, settled: false, wid: plan.main.id };
    })().finally(() => { f.inflight = null; });
    return f.inflight;
  }
  /** A fit the machine refused (a binary missing, a display that will not
   *  answer): recorded by name, said ONCE, re-asked in a minute. */
  function refuse(rec, f, why, changed = false) {
    const t = now();
    f.refusedAt = t;
    const fresh = !rec.fit || rec.fit.ok || rec.fit.why !== why;
    if (fresh) { rec.fit = { ok: false, why, at: t }; log.warn?.(`[desktop] ${rec.id}: cannot fit ${rec.label}'s window to the display (${why}) — the app is shown where X put it; asked again in ${Math.round(FIT_REFUSED_RETRY_MS / 1000)} s`); }
    if (fresh || changed) commit();
    return { ok: false, why };
  }
  /** The x11 env a process ADDRESSING record `id`'s display gets (P9 window
   *  targets: xdotool / the screenshot helper) — the same rule as the app's
   *  own env (`x11Env` over the sanitised base, the per-app Xauthority for an
   *  owned display, the singleton's cookie file for a shared one). null when
   *  the record has no display yet. */
  function x11EnvFor(id) {
    const rec = store.apps[id];
    if (!rec || !rec.display) return null;
    let authFile = null;
    if (rec.backend === 'desktop-singleton') { let s = null; try { s = singleton?.(); } catch { s = null; } authFile = (s && s.authFile) || null; }
    else authFile = path.join(logRoot, id, 'Xauthority');
    const base = env();
    return display.x11Env(base, { display: rec.display, authFile: authFile || base.XAUTHORITY });
  }
  function streamTarget(id) {
    const rec = store.apps[id];
    if (!rec) return null;
    if (rec.backend === 'desktop-singleton') { let s = null; try { s = singleton?.(); } catch { s = null; } return s && s.running && rec.state === 'ready' ? { kind: 'rfb', port: s.port, backend: rec.backend } : null; }
    return M.streamTargetOf(rec);
  }
  /** The APPLICATION's windows on a record's display (P8-2 per-window facts):
   *  `enumerateWindows` (two spawns) over the record's own x11 env; on an xpra
   *  display xpra's own wrappers and 1x1 leaders are dropped
   *  (`display.seamlessWindows`), elsewhere the mapped rows are returned. The
   *  LIVE title/icon the window shows ride the picture protocol (free); this
   *  is the on-demand snapshot a route answers, never a poll. */
  async function windows(id) {
    const rec = store.apps[id];
    if (!rec) throw namedError('not-found', `no desktop app ${id}`);
    if (!rec.display || !M.isLiveState(rec.state)) return { ok: false, why: rec.display ? `the app is ${rec.state}` : 'no display yet', windows: [] };
    const xenv = x11EnvFor(id);
    const r = await display.enumerateWindows({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv });
    if (!r.ok) return r;
    const rows = M.streamKindOf(rec, backends) === 'xpra' ? display.seamlessWindows(r.windows) : r.windows.filter((w) => w.mapped !== false && w.w > 1 && w.h > 1);
    return { ok: true, why: null, windows: rows.map((w) => ({ id: w.id, title: w.name, cls: w.cls, instance: w.instance, x: w.x, y: w.y, w: w.w, h: w.h, mapped: w.mapped, depth: w.depth == null ? null : w.depth })) }; // depth 1 = a top-level (P8-2 x4)
  }
  /** Where this machine's xpra ships its html5 client (null = no xpra, or a
   *  build without the www tree) — the hosted-client route's root. */
  async function xpraWww() { const f = await facts(); return (f.xpra && f.xpra.www) || null; }
  /** Every pid a record owns right now — the leaders' sessions (rule 4/5)
   *  plus `extra` (rule 10: the marker-carrying members the sid table lost,
   *  handed in by the tick's ONE census). */
  function sessionPids(rec, extra = []) {
    const own = rec.backend !== 'desktop-singleton';
    const out = new Set(display.sessionCensus(own ? [rec.pids.app, rec.pids.server, rec.pids.wm, rec.pids.x] : [rec.pids.app]));
    for (const p of extra) if (p !== process.pid) out.add(p);
    return [...out];
  }

  // ── boot adoption ──
  /**
   * The boot belt (rule 7): ONE marker census over every record's id, then
   * every pid that still carries a TERMINAL record's `VIBESPACE_DESKTOP_APP=<id>`
   * is reaped, verified — the leftover of a stop torn in half by a SIGKILL of
   * this server, or of a bring-up that outlived its record. The marker is
   * what those processes INHERITED, so a recycled pid is never signalled and
   * an id outside this store is never asked (two instances under one uid mint
   * disjoint ids). Runs BEFORE pruneHistory: a record is forgotten only after
   * its leftovers are gone (or the failure is on it, named).
   */
  async function reapTerminalLeftovers() {
    let census;
    try { census = evidenceCensus(Object.values(store.apps)); } catch (e) { log.warn?.(`[desktop] marker census failed at boot: ${e.message}`); return 0; }
    let reaped = 0;
    for (const [id, pids] of census) {
      const rec = store.apps[id];
      if (!rec || M.isLiveState(rec.state)) continue;
      log.warn?.(`[desktop] ${id} (${rec.state}) still has ${pids.length} process(es) carrying its marker or its per-app XAUTHORITY at boot: ${pids.join(', ')} — reaping`);
      const clean = await signalVerified(rec, 'boot leftover', pids, null);
      if (!clean) rec.lastError = `${rec.lastError ? rec.lastError + '; ' : ''}a leftover process survived SIGKILL at boot — check ${LOG_DIR}/${id}/app.log`;
      reaped += pids.length;
    }
    // THE MARKER IS NOT THE ONLY IDENTITY A RECORD HOLDS (P8-2): xpra rewrites its
    // own environ (setproctitle — /proc/<pid>/environ reads as 2 KB of nothing,
    // measured) and hands its Xvfb a SANITIZED env, so neither carries the
    // marker; a terminal record's part that is STILL the recorded process (pid
    // AND starttime — rule 8's proof) is a leftover too, and its session goes
    // with it (the leader is proven, so its sid is ours by construction).
    for (const rec of Object.values(store.apps)) {
      if (M.isLiveState(rec.state)) continue;
      for (const part of PARTS) {
        if (!rec.pids[part] || !partIsOurs(rec, part, null)) continue;
        log.warn?.(`[desktop] ${rec.id} (${rec.state}) still has its recorded ${part} (pid ${rec.pids[part]}, same starttime) at boot — reaping its session`);
        if (!(await killSessionVerified(rec, part, null))) rec.lastError = `${rec.lastError ? rec.lastError + '; ' : ''}a leftover ${part} survived SIGKILL at boot — check ${LOG_DIR}/${rec.id}/app.log`;
        reaped++;
      }
    }
    return reaped;
  }
  async function adoptAll() {
    const f = await facts({ fresh: true });
    void f;
    const shared = await singletonLive(); // rule 6: asked, not remembered
    for (const rec of Object.values(store.apps)) {
      if (!M.isLiveState(rec.state)) continue;
      const own = rec.backend !== 'desktop-singleton';
      // rule 8: no child handles exist at boot, so every part is judged by
      // pid AND starttime — a record with none is not proven and is reaped
      // by MARKER only (see partIsOurs / killSessionVerified)
      const alive = {
        x: own ? partIsOurs(rec, 'x', null) : !!(shared && shared.running),
        server: own ? (rec.pids.server === rec.pids.x ? partIsOurs(rec, 'x', null) : partIsOurs(rec, 'server', null)) : !!(shared && shared.running),
        app: partIsOurs(rec, 'app', null),
      };
      // the same READY question the bring-up asked (`probe`: the RFB banner, or xpra's HTTP answer); an older record without one is an RFB rung
      let portOk = rec.port ? await display.portAnswers(rec.probe || 'rfb', rec.port, 1500) : false;
      if (portOk && own && alive.server) {
        const serverPid = rec.pids.server || rec.pids.x;
        if (!display.listenerHeldBy(rec.port, display.sessionCensus([serverPid], { fresh: true }))) { portOk = false; rec.lastError = rec.lastError || `127.0.0.1:${rec.port} answers but is not held by the recorded picture server (pid ${serverPid})`; }
      }
      const verdict = M.adoptVerdict(rec, alive, portOk);
      if (!verdict) continue;
      if (verdict.state === 'ready') {
        rec.state = 'ready'; rec.adoptedAt = now();
        log.log?.(`[desktop] adopted ${rec.id}: ${rec.label} on ${rec.display} port ${rec.port} (pid ${rec.pids.app})`);
        armFirstFit(rec.id); // P8-2 x4: its window exists — fitted now, not at the first tick
      } else {
        rec.state = verdict.state; rec.lastError = verdict.lastError; rec.endedAt = now();
        log.warn?.(`[desktop] ${rec.id} ${verdict.state} at boot: ${verdict.lastError} — reaping what is left`);
        await teardown(rec, null);
      }
    }
    await reapTerminalLeftovers();
    pruneHistory();
    commit();
  }
  function pruneHistory() {
    const t = now();
    const done = Object.values(store.apps).filter((r) => !M.isLiveState(r.state)).sort((a, b) => (b.endedAt || b.startedAt) - (a.endedAt || a.startedAt));
    done.forEach((r, i) => { if (i >= HISTORY_KEEP || t - (r.endedAt || r.startedAt) > HISTORY_MAX_AGE_MS) delete store.apps[r.id]; });
    for (const [appId, until] of Object.entries(store.runawayParkedUntil)) if (Number(until) <= t) delete store.runawayParkedUntil[appId];
  }

  // ── the tick: liveness (adopted sessions have no child handles), idle, runaway ──
  async function tick() {
    const t = now();
    const recs = liveRecords();
    const shared = recs.some((r) => r.backend === 'desktop-singleton') ? await singletonLive() : null;
    // rule 10: ONE marker census per tick, and only on a tick where some
    // record is due a runaway sample — the guard must see the member that
    // setsid()'d out of every leader's session (measured: a setsid'd `yes`
    // read cpuPct 0 / pids 3 for 12 s through the sid table alone).
    const due = recs.filter((r) => !stopping.has(r.id) && t - ((guard.get(r.id) || {}).lastSampleAt || 0) >= sampleEvery).map((r) => r.id);
    let escapedMap = null;
    const escapedOf = (id) => {
      if (!escapedMap) { try { escapedMap = due.length ? evidenceCensus(due.map((id) => store.apps[id]).filter(Boolean)) : new Map(); } catch (e) { log.warn?.(`[desktop] marker census failed in the tick (${e.message}) — the guard samples the sid table alone this round`); escapedMap = new Map(); } }
      return escapedMap.get(id) || [];
    };
    for (const rec of recs) {
      if (stopping.has(rec.id)) continue;
      const own = rec.backend !== 'desktop-singleton';
      const handles = children.get(rec.id) || null;
      if (rec.pids.app && !partIsOurs(rec, 'app', handles)) { onPartExit(rec.id, 'app', null, null); continue; }
      if (own && rec.pids.x && !partIsOurs(rec, 'x', handles)) { onPartExit(rec.id, 'x', null, null); continue; }
      if (!own && shared && !shared.running) { onPartExit(rec.id, 'x', null, null); continue; }
      if (rec.state === 'ready') {
        const idle = M.idleState(rec, t, rec.idleTimeoutMs);
        if (idle.expired) { stop(rec.id, { why: 'idle' }).catch(() => { }); continue; }
        // P8-2 x4: the belt — only while settling, while input is recent, while a viewer is connected, or on the slow belt (FIT_SLOW_BELT_MS); an act only when the plan is not settled
        const f = fits.get(rec.id);
        if (fitApplies(rec) && !(f && (f.timer || f.inflight)) && beltDue(rec.id, fitState(rec.id), t)) fitApp(rec.id, 'tick').catch((e) => log.warn?.(`[desktop] ${rec.id}: tick fit failed: ${e.message}`));
        // x5 LOW-2: while a BLOCKED pane exists on the xpra rung, the record keeps the app's own title fresh (rate-limited)
        { const vs = viewerSets.get(rec.id); if (vs && [...vs.entries.keys()].some((v) => v !== vs.active)) refreshAppTitle(rec.id, 'tick'); }
      }
      const g = guard.get(rec.id) || { prev: null, hotSince: 0, lastSampleAt: 0 };
      if (t - g.lastSampleAt >= sampleEvery) {
        // rule 5: the whole session set, never one pid — rule 10: plus what left it
        const pids = sessionPids(rec, escapedOf(rec.id));
        const s = pids.length ? display.sessionSample(pids) : null;
        const v = M.runawayVerdict(s, g.prev, g.hotSince, t, { limits });
        g.prev = s ? { at: t, cpuTicks: s.cpuTicks } : null; g.hotSince = v.hotSince; g.lastSampleAt = t;
        guard.set(rec.id, g);
        if (s) { live.set(rec.id, { cpuPct: v.cpuPct, rssBytes: s.rssBytes, pids: s.pids, sampledAt: t }); dirty = true; }
        if (v.why) {
          log.error?.(`[desktop] RUNAWAY — ${rec.id} (${rec.label}, ${pids.length} process(es) in its sessions) stopped: ${v.why}${rec.appId ? `; not launching ${rec.appId} again for ${Math.round(limits.RUNAWAY_COOLDOWN_MS / 60000)} min` : ''}`);
          if (rec.appId) store.runawayParkedUntil[rec.appId] = t + limits.RUNAWAY_COOLDOWN_MS;
          rec.lastError = `stopped as a runaway: ${v.why}`;
          try { getTelemetry()?.record?.({ kind: 'event', name: 'desktop-app-runaway', detail: `${rec.label}: ${v.why}`, value: Math.round((s?.rssBytes || 0) / 1048576) }); } catch { /* telemetry is optional */ }
          stop(rec.id, { why: 'runaway' }).catch(() => { });
          continue;
        }
      }
    }
    if (dirty) commit();
  }
  function start() {
    if (timer) return;
    timer = setInterval(() => { tick().catch((e) => log.warn?.(`[desktop] tick failed: ${e.message}`)); }, tickMs);
    if (timer.unref) timer.unref();
  }
  /** Timers only — the apps SURVIVE a VibeSpace exit by design. */
  function shutdown() { if (timer) clearInterval(timer); timer = null; for (const id of [...fits.keys()]) clearFit(id); for (const s of viewerSets.values()) clearGrace(s); if (dirty) save(); }

  load();
  return { launch, stop, keepAlive, noteInput, noteDesktopSize, setWatchProbe, fitApp, get, list, listApps, liveRecords, streamTarget, x11EnvFor, windows, xpraWww, instancePrefs, facts, registry, adoptAll, start, shutdown, tick, sessionPids,
    viewerJoined, viewerLeft, takeoverViewer, activeViewer, viewersView, onViewers, refreshAppTitle, viewerGraceMs, // P8-2 x5
    storeFile, logRoot, STORE_FILE, LOG_DIR, SESSION_ENV, _store: () => store };
}

module.exports = { create, STORE_FILE, LOG_DIR, TICK_MS, STOP_GRACE_MS, RFB_DEADLINE_MS, SETTLE_BRINGUP_MS, SESSION_ENV, FIT_DEBOUNCE_MS, FIT_FIRST_STEP_MS, FIT_FIRST_WINDOW_MS, FIT_REFUSED_RETRY_MS, FIT_SETTLE_RUNS, FIT_ACTIVE_MS, FIT_SLOW_BELT_MS, VIEWER_GRACE_MS, XPRA_TITLE_EVERY_MS };
