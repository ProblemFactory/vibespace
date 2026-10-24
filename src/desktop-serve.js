'use strict';
/**
 * DESKTOP-SERVE — THE MACHINE HALF of every desktop application VibeSpace
 * opens in a window, SHARED (node builtins + the PURE model + the machine
 * facts; the daemon bundles it). docs/design-desktop-apps-seamless.zh.md §3.5
 * (lane C1, 2026-09-25): the half of the keeper that happens ON THE MACHINE —
 * bring-up of X / the picture server / the app, part identity (pid +
 * starttime, the marker census), teardown verified empty, the fit belt, the
 * window enumeration, the resource SAMPLE and the machine-local record file
 * `<dataDir>/desktop-apps.json` (on a paired device `~/.vibespace/
 * desktop-apps.json`) — moved here VERBATIM from src/server/desktop-app-keeper.js,
 * which keeps the POLICY (the viewers' election, the idle verdict, the
 * resource REPORT, the relaunch seat, the broadcasts). ONE implementation runs
 * where the app runs: in-process for device #0 (the hub keeper holds this
 * object and shares its store), inside the agentd for a paired device (the
 * `desktop-serve` op, src/server/desktop-access.js picks the transport).
 *
 * THE POLICY HOOKS (install's `hooks`): the hub keeper hands its policy in —
 * `view` (the record as the hub shows it), `onCommit` (the broadcast),
 * `idle(rec, t)` (the idle verdict; true = it stopped the record), `readyTick`
 * (the x5 title refresh), `onSample(rec, sample, t, pids)` (the resource
 * REPORT; true = the hub's row changed) and `onTeardown(id)` (the hub's guard
 * rows go with the session) — each called exactly where the pre-extraction
 * keeper ran that code, so the local behaviour is byte-identical. A daemon
 * installs NO hooks: a device never decides idle and never speaks a notice;
 * it keeps the latest sample for the `status` op and the hub judges it.
 *
 * `runDesktopServeOp(ds, op, params)` is the wire: the closed op set
 * DESKTOP_SERVE_OPS, every op answering a plain-JSON object with `ok` and, on
 * failure, `code` + `error` — nothing throws across the wire (the daemon
 * relays the object; src/server/desktop-access.js re-throws it by code).
 *
 * THE KEEPER'S RULES (the pre-extraction essay, verbatim — every rule is the
 * machine half's):
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
 *   · a COUNT CAP (a refusal AT LAUNCH naming the holders — never a kill)
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
 *   · stop = (a LibreOffice session first ASKED to quit through its own File ▸
 *     Exit — B-04da ④, `askAppToClose`: its save prompt answers, never a
 *     signal over unsaved edits unless the person confirmed the loss) SIGTERM
 *     the app, then the picture server, then the WM, then the
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
 *   5. THE RESOURCE SAMPLE COVERS THE WHOLE SESSION SET (app + X + picture
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
 *      resource sample unions the same census (ONE walk per tick, only when a
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
 * marker, so app-exit / identity / teardown / the resource sample are the same
 * code on every rung). Records carry `probe` so boot adoption asks the same
 * question the bring-up did. DA1: a launch resolves the ladder fresh (xpra
 * first when installed) — an EXISTING record keeps the backend it was born
 * with; adoption never re-resolves. The instance may reorder the ladder with
 * settings `desktop.backendPrefs` (a row's own `backendPrefs` still wins).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const SP = require('./storage-path.js'); // lane hub-fuse-sync-guard: the witness's storage roots
const M = require('./desktop-apps');
const { parsePin, pinOf, pinSupportVerdict } = require('./desktop-pin'); // lane e2b (§E2.2): the record's fact `pin` (PURE); lane launch-picture-size: which rungs can be born pinned
const O = require('./office-open'); // §7.9: the LibreOffice rows as a machine serves them, the open-with verdict, the argv
const LIMITS = require('./keeper-limits');
const displayFacts = require('./desktop-display');
const AWD = require('./argv-words.js'); // PURE — a launch journalled as the one line a person reads (rel254 verify F4b)
const RA = require('./remoteapp'); // lane remoteapp-r1a (design q-024 §1.2): the RemoteApp request, argv, client build + end verdicts — PURE
const AS = require('./app-serve'); // Layer 0 apps (docs/design-app-persistence.zh.md §3.1): the app-* ops + the catalog rows of the apps the user installed

const STORE_FILE = 'desktop-apps.json';
const LOG_DIR = 'desktop-apps';
const TICK_MS = 5000;              // liveness + idle sweep
const STOP_GRACE_MS = 3000;        // SIGTERM → SIGKILL
/** B-04da ④: how long a stop waits for LibreOffice's own quit (`.uno:Quit` handed over its profile pipe) before it
 *  answers `app-asked` — an unmodified document quits in ~250 ms (measured 224 ms); a longer wait means its "Save
 *  changes?" prompt is up in the app's window, and only the person answers that. */
const ASK_CLOSE_MS = 4000;
/** …and how many times a hand-over that RETURNED while the app still runs is sent again (a quit dropped during the load). */
const ASK_TRIES = 3;
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
// round 3 A2: the one window census at an app's exit (two X spawns, ~10 ms measured) never holds the teardown longer
const EXIT_CENSUS_MS = 2000;
/** §7.9: how long a stat of an opened document may take before it is refused / not recorded (a dead mount). */
const FILE_STAT_MS = 4000;
/** The env marker every process of a session inherits — its identity when
 *  the leader is gone (KEEPER_ENV in the PURE model reserves the name). */
const SESSION_ENV = 'VIBESPACE_DESKTOP_APP';
const PARTS = Object.freeze(['app', 'portal', 'server', 'wm', 'x']); // teardown order (`portal` = a sandboxed app's own bus + portal, lane app-display-portal)

function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const namedError = (code, msg) => { const e = new Error(msg); e.code = code; return e; };

/** The closed op set — a caller cannot invent one (an unknown op on an old
 *  daemon HANGS: src/agentd/client.js asks only a daemon whose hello-ack names
 *  `desktop-serve`; an unknown op here is refused by name). */
/** lane e2a (design-agent-browser-v2 §E2): the record origin of a browser an agent launched through its own door. */
const AGENT_BROWSER_ORIGIN = 'agent-browser';
/** lane app-launch-singleton: WHO started a record — `{ kind: 'agent', sessionId, name }` (an agent's door: `vibespace-window
 *  open`, the agent browser, a session token on the launch route) | `{ kind: 'person' }` (the person's own door) | null. */
function launchedByOf(b) {
  if (!b || typeof b !== 'object') return null;
  if (b.kind === 'person') return { kind: 'person' };
  if (b.kind !== 'agent') return null;
  return { kind: 'agent', ...(b.sessionId ? { sessionId: String(b.sessionId).slice(0, 80) } : {}), ...(b.name ? { name: String(b.name).slice(0, 120) } : {}) };
}
/** lane e2a r3 (verify r1 #12): what an agent browser's ending says (rec.lastError — the exit toast words its own). */
const AGENT_BROWSER_ENDING_WORDS = Object.freeze({ 'opener-ended': 'closed with the conversation that opened it', 'opener-gone': 'closed: the conversation that opened it ended while it started', 'opener-stopped': 'closed by the agent that opened it' });
const DESKTOP_SERVE_OPS = Object.freeze(['facts', 'launch', 'stop', 'status', 'list', 'windows', 'fit', 'keep-alive', 'pin', 'relaunch', 'close-asked', ...AS.APP_OPS]);
/** The hub settings a machine's decisions read (the op carries them as `settings`; in-process they are the hub's own reader). */
const SETTING_KEYS = Object.freeze(['desktop.backendPrefs', 'desktop.appScale', 'desktop.idleTimeoutMin', 'desktop.appPortal', 'desktop.appNotifications', 'desktop.appSecrets']);
const settingsReader = (obj) => (key) => (obj && typeof obj === 'object' && SETTING_KEYS.includes(key) ? obj[key] : undefined);

/**
 * @param {object} deps
 *   dataDir        — the machine's data dir (the record + per-app logs): the hub's data/, a device's ~/.vibespace
 *   env            — () => sanitised base env (the hub: ws-handler.agentEnv; a daemon: daemonEnv) — a plain object is accepted
 *   serverSetting  — (key) => value — the hub's own reader in-process; an op's `settings` object shadows it per call
 *   singleton      — optional () => ({ running, display, port, authFile, refresh? }) — the
 *                    pre-existing in-container desktop (src/vnc.js) for the
 *                    desktop-singleton rung; absent ⇒ that rung never resolves.
 *                    `refresh()` (= vnc.js status()) is asked before every verdict.
 *   display        — the desktop-display module (injectable for the suite)
 *   limits         — src/keeper-limits (injectable: the resource suite shrinks them)
 *   registryRows   — the registry (default DEFAULT_REGISTRY; the suite hands a CPU burner)
 *   backends       — the capability table (default M.DISPLAY_BACKENDS; the suite hands a copy
 *                    with a fourth rung to prove this file needs no change for one)
 *   log, now, tickMs, guardSampleMs, geometry, hostId
 *   fitSlowBeltMs  — the settled belt's cadence (default FIT_SLOW_BELT_MS; the suite shrinks it)
 *   askCloseMs     — B-04da ④: the wait for an asked LibreOffice to quit (default ASK_CLOSE_MS)
 *   hooks          — the hub's policy (see the header); absent on a daemon
 *   apps           — the apps machine half (src/app-serve.js; default: created here over `appsHome` + dataDir as
 *                    the package slot's state dir) — its catalog rows join the registry (`app.<entry>`)
 *   appsHome       — the user's home on this machine (default: the base env's HOME, else os.homedir())
 *   remoteapp      — lane remoteapp-r1a: the HUB's way to a paired Windows machine for a RemoteApp launch —
 *                    `{ setup(hostId) → { user, domain?, certFp, password: () => string }, forward(hostId) → { port,
 *                    forwardId, close }, signin(hostId) → { user, domain, password: () => string } }` (src/server/
 *                    desktop-access.js through the hub keeper; `signin` = lane remoteapp-r1b's first connection, which
 *                    needs no pin — it takes one); absent on a daemon, where RemoteApp is refused `remoteapp_unwired`
 */
function install({ dataDir, env, serverSetting = () => undefined, singleton = null,
  display = displayFacts, limits = LIMITS, registryRows = M.DEFAULT_REGISTRY, backends = M.DISPLAY_BACKENDS, log = console, now = Date.now, tickMs = TICK_MS, guardSampleMs = null, geometry = DEFAULT_GEOMETRY, hostId = null, fitSlowBeltMs = FIT_SLOW_BELT_MS, askCloseMs = ASK_CLOSE_MS, hooks = {}, apps = null, appsHome = null, remoteapp = null } = {}) {
  if (!dataDir) throw new Error('desktop-serve: dataDir is required');
  if (env && typeof env === 'object') { const e0 = env; env = () => e0; }
  if (typeof env !== 'function') throw new Error('desktop-serve: env must be a function returning the sanitised base env');
  // Layer 0 apps: the machine half lives beside the keeper (the same state dir = the same package slot as xpra's install)
  if (!apps) {
    let home = appsHome;
    if (!home) { try { home = (env() || {}).HOME || null; } catch { home = null; } }
    apps = AS.create({ home: home || os.homedir(), stateDir: dataDir, env, log, now, engineIds: () => registryRows.map((r) => r.id), binOnPath: display.binOnPath ? (n, o) => display.binOnPath(n, o) : null, installState: display.installState ? (d) => display.installState(d) : null });
  }
  display.assertLocal(hostId, 'keeper');
  const storeFile = path.join(dataDir, STORE_FILE);
  const logRoot = path.join(dataDir, LOG_DIR);
  const sampleEvery = guardSampleMs || limits.GUARD_SAMPLE_MS;
  const H = hooks && typeof hooks === 'object' ? hooks : {};
  // lane apps-dialog-fast: the open never waits for the witness walk — a listing that LANDS is pushed as its result (the
  // registry's own witnessed rows, decorated as an open's answer is) through `hooks.onWitness`
  if (typeof apps.onWitness === 'function') apps.onWitness((witness) => { facts().then((f) => H.onWitness?.({ witness, rows: registry(f).filter((r) => r.witnessed) })).catch((e) => log.warn?.(`[apps] the witness push failed: ${e.message}`)); });

  // ── state ──
  let store = { apps: {} }; // (no `runawayParkedUntil` since 2026-09-25 — an old file's map is dropped on read; migration 2026-09-runaway-parks-void clears the disk)
  const children = new Map();   // id -> { x, server, wm, app } ChildProcess handles (this process's spawns only)
  const inflight = new Map();   // id -> the bringUp promise while it runs (rule 7: stop() waits for it)
  const sampledAt = new Map();  // id -> the instant of the last resource sample (the cadence; the verdict is the hub's)
  const samples = new Map();    // id -> { at, sample, pids } — the latest sample, for the `status` op (a device's hub judges it)
  const fits = new Map();       // id -> { timer, inflight, firstUntil, refusedAt } (P8-2 x4: the app-fit step's state, never persisted)
  const stopping = new Set();
  const quitAsks = new Map();   // id -> the ChildProcess of a `.uno:Quit` hand-over still waiting on LibreOffice's save prompt (B-04da ④)
  const deferred = new Map();   // id -> () => bringUp — a launch whose start waits for the record it replaces to stop (a browser relaunch, 2.369.176)
  const rdpSeats = new Map();   // id -> { close, password, configDir } — a RemoteApp session's forward + its password GETTER (lane remoteapp-r1a; never persisted)
  const rdpTrusting = new Set(); // hostIds whose first connection runs now (lane remoteapp-r1b: one at a time per machine)
  let dirty = false;
  let factsCache = null;        // { at, facts }
  let timer = null;

  function load() {
    try {
      const j = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
      if (j && typeof j === 'object' && j.apps && typeof j.apps === 'object') store = { apps: j.apps };
    } catch (e) { if (e.code !== 'ENOENT') log.warn?.(`[desktop] ${STORE_FILE} unreadable (${e.message}) — starting empty; the old file is left in place`); }
  }
  function save() {
    try { fs.mkdirSync(dataDir, { recursive: true }); writeJsonAtomic(storeFile, store); dirty = false; }
    catch (e) { log.warn?.(`[desktop] could not write ${STORE_FILE}: ${e.message}`); }
  }
  /** The machine's own view of a record: the stored facts + the rung's TABLE facts. The hub lays its policy rows
   *  (the resource report's live row, the idle verdict) over it through `hooks.view`. */
  function machineView(rec) {
    const b = rec.backend ? M.backendById(rec.backend, backends) : null;
    // `stream` / `wired` / `fitMode` / `caps` (the capability cells — the client reads these, never a rung id) are the rung's TABLE facts laid over the record in the VIEW (the stored record keeps facts only)
    const fp = M.fitPolicyOf(rec, backends);
    return { ...rec, pids: { ...rec.pids }, starts: { ...rec.starts }, stream: b ? b.stream : null, wired: b ? b.wired !== false : null, fitMode: fp ? fp.mode : null, fitBy: fp ? fp.by : null, caps: M.capsOf(rec, backends), fb: rec.fb ? { ...rec.fb } : null, fit: rec.fit ? { ...rec.fit } : null };
  }
  const view = (rec) => (typeof H.view === 'function' ? H.view(rec) : machineView(rec));
  function commit() { save(); try { H.onCommit?.(); } catch (e) { log.warn?.(`[desktop] commit hook failed: ${e.message}`); } }
  /** The hub marks a row it owns (input, a fact of the viewers) — the tick's end commits it. */
  function markDirty() { dirty = true; }

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
    const f = await display.hostFacts({ hostId, env: env(), fresh }); // §7.9: `fresh` re-asks a NO about LibreOffice (an install just ended)
    const s = await singletonLive();
    const out = { ...f, singletonRunning: !!(s && s.running) };
    factsCache = { at: now(), facts: out };
    return out;
  }
  /** LANE C2: the facts the xpra install rung plans from (distro / codename / apt's candidate / sudo) — asked only
   *  by the `facts` op's `install: true` (the dialog's "Install xpra…" step), never cached: an install changes them. */
  async function installFacts() {
    if (typeof display.installFacts !== 'function') return null;
    return display.installFacts({ env: env(), now, stateDir: dataDir }); // the install's log + pidfile live beside this machine's record (verify r2 F3/F4)
  }
  /** verify r2 (F3): the install SLOT alone — the pidfile + exit file, no probe spawned (no `sudo -n`, no apt-cache):
   *  what a hub holding a slot for an install it stopped following asks every poll. */
  async function installState() {
    if (typeof display.installState !== 'function') return null;
    return { stateDir: dataDir, ...(await display.installState(dataDir)) };
  }
  /** The instance's ladder order (settings `desktop.backendPrefs`), a row's own
   *  `backendPrefs` taking precedence — empty ⇒ the table's DA1 order. */
  function instancePrefs(read = serverSetting) { return M.parseBackendPrefs(read('desktop.backendPrefs'), backends); }
  function prefsFor(row, read) { return row && Array.isArray(row.backendPrefs) && row.backendPrefs.length ? row : { backendPrefs: instancePrefs(read) }; }
  function resolve(hostFacts, prefs, read = serverSetting) { return M.resolveBackend(hostFacts, prefsFor(prefs, read), backends); }

  function registry(hostFacts) {
    const bins = (hostFacts && hostFacts.bins) || {};
    const binOf = (name) => (bins[name] !== undefined ? bins[name] : display.binOnPath(name, { env: env() }));
    // lane hub-fuse-sync-guard: a program path on a STORAGE mount is listed as it reads (this runs on every GET of the
    // catalog) — never a stat from the loop; its launch says by name if it is not there
    const execHere = (x) => (SP.storageRootOf(x) ? x : fs.existsSync(x) ? x : null);
    // the apps the user installed (Layer 0): one row per .desktop file root recorded for an entry — `app.<entry>`;
    // absent ⇒ greyed with its code (the hub's apps engine words it: restoring… after a rebuild, or why not)
    const appRows = (apps && typeof apps.catalogRows === 'function' ? apps.catalogRows() : []).filter((r) => !registryRows.some((x) => x.id === r.id)).map((row) => {
      const p = row.exec.includes('/') ? execHere(row.exec) : binOf(row.exec);
      // Layer 1: an app-system row is greyed while its app system cannot run here (not enabled, another architecture, no helper…)
      if (row.changed) return { ...row, args: [...row.args], available: false, path: p, reason: `${row.label}: this entry was changed outside VibeSpace and is not runnable: ${row.changed}`, reasonCode: 'changed_outside' }; // rel254 verify F4/F8: shown, never run
      if (row.blocked) return { ...row, args: [...row.args], available: false, path: p, reason: row.blocked === 'shim-not-ours' ? `${row.label}: its launcher in ~/.vibespace/sysroot/bin is not VibeSpace's — it is not run` : `${row.label} lives in the app system, which cannot run here (${row.blocked})`, reasonCode: 'app-system' };
      if (!p && (row.registered || row.flatpak) && row.app) return { ...row, args: [...row.args], available: false, path: null, reason: `${row.label}: its program is gone${row.reinstall ? ` — reinstall: ${[row.reinstall.exec, ...(row.reinstall.args || [])].join(' ')} (your click)` : ''}`, reasonCode: 'exec-gone' }; // lane app-register-model: a home app is never reinstalled silently
      return { ...row, args: [...row.args], available: !!p, path: p, reason: p ? null : `${row.label} is not installed on this machine (yet)`, reasonCode: p ? null : 'app-missing' };
    });
    // lane apps-launcher-witness: what is installed OUTSIDE the door (src/app-witness.js) — its own `seen.` ids, flagged
    // `witnessed`, never an engine row's id; a row whose program is gone stays listed and says so (never hidden)
    const seenRows = (apps && typeof apps.witnessRows === 'function' ? apps.witnessRows() : []).filter((r) => !registryRows.some((x) => x.id === r.id) && !appRows.some((x) => x.id === r.id)).map((row) => {
      const p = row.exec.includes('/') ? (row.execGone ? null : row.exec) : binOf(row.exec); // execGone: judged by the listing (async), never a sync stat of a user-written path here
      return { ...row, args: [...row.args], available: !!p, path: p, reason: p ? null : `${row.exec} no longer resolves on this machine`, reasonCode: p ? null : 'exec-gone' };
    });
    return registryRows.map((row) => {
      if (row.browser) return browserRegistryRow(row, binOf);
      if (row.office) return { ...O.officeRowFor(row, officeFactsOf(hostFacts, binOf)), args: [...(row.args || [])] }; // §7.9: presence = the binary AND the module's library
      const p = row.exec.includes('/') ? execHere(row.exec) : binOf(row.exec);
      return { ...row, args: [...row.args], available: !!p, path: p, reason: p ? null : `${row.exec} not on PATH` };
    }).concat(appRows, seenRows).map(launchFacts);
  }
  /** lane app-launch-singleton (fleet inc-mv7hxc2n-2cvr, .268): what a catalog row's LAUNCH is — an installed / witnessed /
   *  registered browser of a known family gets that family (`browserBy: 'exec'`), so its launch takes browserArgv's own
   *  profile dir like the catalog's browser row (DEFECT #0: `app.<entry>` with `Exec=/usr/bin/google-chrome-stable %U`
   *  ran AS TYPED on the user's default profile); every row says whether a second instance can run beside a running one
   *  (`runsTwice` — the card offers "Open another" only then). */
  function launchFacts(row) {
    let r = row;
    if (!r.browser) { const bv = M.appBrowserVerdict(r); if (bv.browser) r = { ...r, browser: bv.browser, browserBy: 'exec' }; }
    return { ...r, runsTwice: M.runsTwiceVerdict(r).twice };
  }
  /** lane app-launch-singleton: WHO HOLDS a browser row's DEFAULT profile (Chrome's SingletonLock — display.profileLockFact)
   *  → `row.lock = { pid, live, recordId }` (`recordId` = the live record whose app process — or its session — holds it: an
   *  instance of that browser the card names). Read for the browser rows the dialog lists, one read per profile dir. */
  async function lockFacts(rows) {
    if (typeof display.profileLockFact !== 'function') return rows;
    const home = homeOf(), live = liveRecords(), seen = new Map();
    for (const row of rows) {
      if (!M.appBrowserVerdict(row).isBrowser) continue;
      const dir = M.defaultProfileDirOf(row.path || row.exec);
      if (!dir) continue;
      if (!seen.has(dir)) { let f = null; try { f = await display.profileLockFact({ home, dir }); } catch { f = null; } seen.set(dir, f); }
      const f = seen.get(dir);
      if (!f) continue;
      const rec = f.live ? live.find((r) => r.pids && Number.isInteger(r.pids.app) && (r.pids.app === f.pid || r.pids.app === f.sid)) : null;
      row.lock = { pid: f.pid, live: f.live, recordId: rec ? rec.id : null };
    }
    return rows;
  }
  /** §7.9: the machine's LibreOffice facts — hostFacts carries them (desktop-display officeFacts); a facts object from an
   *  older display module (a suite's stand-in) is read from its bins alone: the binary known, the modules not. */
  function officeFactsOf(hostFacts, binOf) {
    if (hostFacts && hostFacts.office && typeof hostFacts.office === 'object') return hostFacts.office;
    for (const e of O.OFFICE_EXECS) { const p = binOf(e); if (p) return { exec: e, path: p, program: null, confinement: null, modules: null }; }
    return { exec: null, path: null, program: null, confinement: null, modules: null };
  }
  /** §7.9: a stat that cannot hang the caller (a file on a dead mount): the libuv pool's answer or a named timeout. */
  function statBounded(file, ms = FILE_STAT_MS) {
    let timer = null;
    return Promise.race([
      fs.promises.stat(file),
      new Promise((_, rj) => { timer = setTimeout(() => rj(namedError('file-stat-timeout', `no answer from the file system within ${ms} ms`)), ms); timer.unref?.(); }),
    ]).finally(() => clearTimeout(timer));
  }
  /** §7.9 — THE AFTER-EDIT FACT, recorded on the machine that holds the file (every terminal path passes teardown, the
   *  app's parts already gone): the file's mtime now vs at launch ⇒ `fileChanged`. The hub turns a changed one into ONE
   *  `file-changed {host, path, mtime}` broadcast (src/server/desktop-app-keeper.js); a stat that fails is said
   *  (`fileEndError`), never guessed. */
  async function noteFileEnd(rec, { clean = false } = {}) {
    if (!rec || !rec.file) return;
    try {
      const st = await statBounded(rec.file);
      rec.fileMtimeAtEnd = st.mtimeMs;
      rec.fileChanged = Number.isFinite(rec.fileMtimeAtLaunch) ? st.mtimeMs !== rec.fileMtimeAtLaunch : null;
      delete rec.fileEndError;
    } catch (e) { rec.fileEndError = String((e && e.message) || e).slice(0, 300); }
    if (clean && rec.office && rec.profileDir && !rec.fileLockDone) await retireFileLock(rec);
  }
  /** §7.9 — the DOCUMENT'S LOCK: LibreOffice ended by a signal (Stop, a relaunch) leaves `.~lock.<name>#` beside the
   *  document (measured) and the next open says "Document in use". After a VERIFIED-CLEAN teardown the machine removes
   *  it only when it names THIS session's own profile (PURE staleLockVerdict — a witness, never a time); any other lock
   *  is kept and said on the record (`fileLockKept`). Bounded reads; never throws. */
  async function retireFileLock(rec) {
    const lock = O.lockFileOf(rec.file);
    if (!lock) return;
    let txt = null;
    try { txt = await Promise.race([fs.promises.readFile(lock, 'utf8'), new Promise((_, rj) => { const t = setTimeout(() => rj(namedError('file-stat-timeout', 'no answer')), FILE_STAT_MS); t.unref?.(); })]); }
    catch (e) { if (e && e.code === 'ENOENT') { rec.fileLockDone = true; return; } rec.fileLockKept = `the lock ${lock} could not be read (${e.message})`; return; }
    const v = O.staleLockVerdict(txt, rec.profileDir);
    if (!v.remove) { rec.fileLockKept = v.why; rec.fileLockDone = true; log.log?.(`[desktop] ${rec.id}: kept ${lock}: ${v.why}`); return; }
    try { await fs.promises.unlink(lock); rec.fileLockRemovedAt = now(); rec.fileLockDone = true; log.log?.(`[desktop] ${rec.id}: removed the stale LibreOffice lock ${lock} (${v.why})`); }
    catch (e) { if (e && e.code === 'ENOENT') rec.fileLockDone = true; else rec.fileLockKept = `could not remove ${lock}: ${e.message}`; }
  }
  // ── B-bfe6: a BROWSER as a desktop app — the human's own window, its OWN profile (PURE verdicts in desktop-apps.js) ──
  /** $HOME as the apps see it (the sanitised base env), for the "never the user's real profiles" verdict. */
  const homeOf = () => { let e = null; try { e = env(); } catch { e = null; } return (e && e.HOME) || os.homedir(); };
  /** The profile directory an app session OWNS: inside its own per-app dir, so the session's teardown is its owner. */
  const profileDirOf = (id) => path.join(logRoot, id, 'profile');
  /** A browser row as the catalog serves it: the family's first binary on PATH (`M.browserRowFor`) and, when that
   *  binary is a snap (desktop-display's fact), whether the snap can reach a profile under this keeper's root — a
   *  row that cannot launch is DIMMED with the verdict's own sentence, never hidden. */
  function browserRegistryRow(row, binOf) {
    const probe = {};
    for (const e of (row.execs && row.execs.length ? row.execs : (M.BROWSER_KINDS[row.browser] || { execs: [] }).execs)) probe[e] = binOf(e);
    const b = M.browserRowFor(row, probe);
    const base = { ...(b.row || row), args: [...(row.args || [])] };
    // `reasonCode` = the verdict's CODE beside its sentence: the catalog card says a short, translated reason by
    // code and keeps the sentence for its tooltip (B-bfe6 r1 — a 204-char sentence in a 10 px card was cut to ~27 chars)
    if (!b.ok) return { ...base, available: false, path: null, confinement: null, reason: b.error, reasonCode: b.code };
    const confinement = display.browserConfinement ? display.browserConfinement(b.row.path) : null;
    const pv = M.profileDirVerdict(profileDirOf('da-probe'), { home: homeOf(), ownedRoot: logRoot, confinement, exec: b.row.exec });
    return { ...base, available: pv.ok, path: b.row.path, confinement, reason: pv.ok ? null : pv.error, reasonCode: pv.ok ? null : pv.code };
  }
  /**
   * Retire a finished browser session's profile: removed (async — a Chrome profile is thousands of files and data/
   * may sit on NFS: never a sync walk on the event loop) ONLY when the PURE `M.profileRetireVerdict` says the session
   * ended by a PERSON (Stop, a relaunch, the app's own exit, or no app ever ran — 2026-09-25: an idle-out or any other
   * keeper-decided ending KEEPS it, `profileKept` + `profileKeptWhy` on the record); re-proven OURS by the
   * PURE verdict before any recursive delete; left in place — and said so on the record — when a process of the
   * session survived its teardown (it could still be writing). Facts on the record: `profileRemovedAt` /
   * `profileKept` / `profileError`. Called from every terminal path (teardown of a terminal record, stop()'s
   * verdict, boot adoption for a SIGKILL between a verdict and its removal).
   */
  async function retireProfile(rec, { clean = true, why = 'ended' } = {}) {
    if (!rec || !rec.profileDir || rec.profileRemovedAt || M.isLiveState(rec.state)) return null;
    if (rec.profileCarriedTo) return null; // 2.369.176: the profile went WITH the relaunch's successor — nothing here to retire
    const rv = M.profileRetireVerdict(rec);
    if (!rv.remove) { if (!rec.profileKept) { rec.profileKept = true; rec.profileKeptWhy = rv.why; log.log?.(`[desktop] ${rec.id}: kept ${rec.label}'s profile at ${rec.profileDir} (${rv.why})`); } return 'kept'; }
    if (!clean) { rec.profileError = `the profile at ${rec.profileDir} was left in place: a process of the session survived its teardown`; log.warn?.(`[desktop] ${rec.id}: ${rec.profileError}`); return 'left'; }
    const pv = M.profileDirVerdict(rec.profileDir, { home: homeOf(), ownedRoot: logRoot });
    if (!pv.ok) { rec.profileError = `not removed: ${pv.error}`; log.warn?.(`[desktop] ${rec.id}: profile ${rec.profileError}`); return 'refused'; }
    try {
      await fs.promises.rm(pv.dir, { recursive: true, force: true });
      rec.profileRemovedAt = now(); delete rec.profileError;
      log.log?.(`[desktop] ${rec.id}: removed ${rec.label}'s profile ${pv.dir} (${why})`);
      return 'removed';
    } catch (e) { rec.profileError = `could not remove ${pv.dir}: ${e.message}`; log.warn?.(`[desktop] ${rec.id}: ${rec.profileError}`); return 'failed'; }
  }

  // ── views ──
  function listApps() { return Object.values(store.apps).map(view).sort((a, b) => b.startedAt - a.startedAt); }
  function liveRecords() { return Object.values(store.apps).filter((r) => M.isLiveState(r.state)); }
  function get(id) { const r = store.apps[id]; return r ? view(r) : null; }

  /** `opts.settings` = the hub's settings as an op carries them (absent in-process: the hub's own reader). */
  async function list(opts = {}) {
    const serverSetting0 = opts.settings ? settingsReader(opts.settings) : serverSetting;
    const f = await facts();
    try { await apps.refreshCatalog(); } catch (e) { log.warn?.(`[apps] the catalog could not be read (${e.message}) — its last rows are served`); }
    let witness = null; // lane apps-launcher-witness: `opts.witness: 'recheck'` = the group's Check again (else the open rule)
    try { if (typeof apps.refreshWitness === 'function') witness = await apps.refreshWitness({ reason: opts.witness === 'recheck' ? 'recheck' : 'open' }); } catch { /* the last list */ }
    const resolved = resolve(f, undefined, serverSetting0);
    return { apps: listApps(), registry: await lockFacts(registry(f)), witness, hostName: os.hostname(), availability: { backend: resolved.backend, via: resolved.via, recipe: resolved.recipe, stream: resolved.stream, caps: M.capsOf({ backend: resolved.backend }, backends), fallbackWhy: resolved.fallbackWhy, ladder: resolved.ladder, prefs: instancePrefs(serverSetting0), xpra: f.xpra, bins: f.bins }, cap: { used: liveRecords().length, cap: limits.CONCURRENT_CAP }, idleTimeoutMin: idleTimeoutMin(serverSetting0) };
  }

  function idleTimeoutMin(read = serverSetting) {
    const v = Number(read('desktop.idleTimeoutMin'));
    return Number.isFinite(v) && v >= 0 ? v : M.DEFAULT_IDLE_TIMEOUT_MIN;
  }

  const serverSetting0 = serverSetting;
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

  /** `body.scaleChoice` (lane D) = the app's default scale from the launch dialog (origin 'app' — PURE scalePick).
   *  `opts` (internal — the relaunch's): `scaleChoice` = the Scale ▸ row ('auto' | 1 | 1.5 | 2 | 2.5 | 3; origin
   *  'chosen' — it outranks the body's default), `replacing` = the
   *  id this launch replaces (it is about to stop, so it does not count against the cap); `id` + `deferBringUp` = a
   *  browser relaunch's successor, minted and recorded now, brought up by startDeferred(id) once the record it
   *  replaces has stopped and handed over its profile (2.369.176; never reachable through the op); `settings` = the hub's
   *  settings when the call arrived as an op (in-process the hub's own reader). The cap is THIS MACHINE's: a
   *  bound on its own resources, counted over its own live sessions. */
  async function launch(body, opts = {}) {
    // lane remoteapp-r1a: an app of a PAIRED Windows machine — ONLY through its own door (design §1.6 fence 4: a person's click,
    // desktop-access.launchRemoteApp, or the relaunch of such a session); the generic launch (POST /api/desktop/apps — an agent's
    // token reaches it —, `vibespace-window open`, the `launch` op) can never set `remoteappDoor`, so a `remoteapp` body there is refused
    if (body && typeof body === 'object' && body.remoteapp !== undefined) {
      if (opts.remoteappDoor !== true) throw namedError('remoteapp_door', 'a RemoteApp session starts only from the launcher\'s RemoteApp… (a person\'s click) — never through the generic launch');
      return launchRemoteApp(body, opts);
    }
    const serverSetting = opts.settings ? settingsReader(opts.settings) : serverSetting0; // an op's settings shadow the hub's reader
    const f = await facts();
    try { await apps.refreshCatalog(); } catch { /* the last rows */ }
    if (body && typeof body.appId === 'string' && body.appId.startsWith('seen.') && typeof apps.refreshWitness === 'function') { try { await apps.refreshWitness({ reason: 'open' }); } catch { /* the last list */ } } // a witnessed row: its list read (cheap when fresh)
    const reg = registry(f);
    const v = M.validateLaunchRequest(body || {}, reg);
    if (!v.ok) throw namedError(v.code || 'bad-request', v.error);
    // lane launch-picture-size: the launch's PICTURE SIZE — the Apps dialog's select / `vibespace-window open --size` (the body's
    // `pin`: 'WxH' | {w,h} | null), else the door's / a relaunch's opts.pin; refused in parsePin's words before anything starts
    const pv = parsePin(body && body.pin !== undefined && body.pin !== '' ? body.pin : null);
    if (!pv.ok) throw namedError(pv.code, pv.error);
    const pinAsked = pv.pin || pinOf(opts.pin);
    let row = v.launch.row;
    // lane app-launch-singleton: `ifRunning: 'attach'` (the Apps card's press, For you's Open) — a RUNNING instance of the
    // row is answered (`attached: true`) instead of a second launch its singleton would swallow; a document always opens
    const ifRunning = body && body.ifRunning !== undefined ? body.ifRunning : null;
    if (ifRunning !== null && ifRunning !== 'attach') throw namedError('bad-request', 'ifRunning must be "attach"');
    if (ifRunning === 'attach' && v.launch.source === 'registry' && !v.launch.file) {
      const lv = M.launchVerdict({ row, apps: liveRecords().map(view), host: 'local' });
      if (lv.act === 'attach') {
        log.log?.(`[desktop] launch of ${row.id} attached to ${lv.target.id} (running on ${lv.target.display || 'its display'}) — no second instance started`);
        return { ...lv.target, attached: true };
      }
    }
    if (row.browserBy === 'exec') { const fam = M.browserFamilyOf(row.exec); if (fam) row = { ...row, browser: fam }; else { row = { ...row }; delete row.browser; delete row.browserBy; } } // a variant runs its own executable
    // §7.9: a DOCUMENT opens in its own module's row — THE open-with verdict again, here, with THIS machine's catalog
    // (the route ran the machine rule before asking; a request never skips a check by arriving another way)
    let doc = null;
    if (v.launch.file) {
      const ov = O.openWithVerdict({ row, file: v.launch.file, machine: { hostId: 'local', fileHost: 'local', registry: reg } });
      if (!ov.ok) { const e = namedError(ov.code, ov.error); if (ov.remedy) e.remedy = ov.remedy; throw e; }
      row = reg.find((r) => r.id === ov.catalogId) || row;
      let st;
      try { st = await statBounded(ov.file); } catch (e) { throw namedError('file-missing', `${ov.file} cannot be opened on this machine (${e.code === 'ENOENT' ? 'no such file' : e.message})`); }
      if (!st.isFile()) throw namedError('file-missing', `${ov.file} is not a regular file on this machine`);
      doc = { file: ov.file, label: ov.label, mtime: st.mtimeMs };
    }
    const cap = M.capVerdict(liveRecords().filter((r) => r.id !== opts.replacing), limits);
    if (cap) throw namedError(cap.code, cap.error);
    if (row.needsWayland) throw namedError('needs-wayland', `${row.label} needs a Wayland compositor and cannot run on a private X display`);
    if (row.browser && !row.path) throw namedError('browser-absent', row.reason || `${row.label} is not installed`); // the catalog's own verdict (browserRowFor), never a guessed binary
    if (row.office && !row.available) { const e = namedError(row.reasonCode || 'app-absent', row.reason || `${row.label} is not installed`); if (row.remedy) e.remedy = row.remedy; throw e; } // §7.9: the catalog's own verdict (officeRowFor) — the binary AND the module
    if (row.layer === 'sys' && !row.available) throw namedError(row.reasonCode || 'app-system', row.reason || `${row.label} cannot run from the app system here`); // Layer 1: a blocked app-system row (its launcher not VibeSpace's, no helper…) never launches
    if (row.changed) { // rel254 verify F4: re-checked at every read — a changed home row never launches; int255 (verify r2 N2): the refusal is journalled
      log.log?.(`[apps] launch ${row.id}${row.variant ? ` (variant ${row.variant})` : ''} refused (changed_outside): nothing ran`);
      throw namedError('changed_outside', `this entry was changed outside VibeSpace and is not runnable: ${row.changed}`);
    }
    const execPath = resolveExec(row.exec);
    const cwd = resolveCwd(row.cwd);
    if (row.registered || row.flatpak) log.log?.(`[apps] launch ${row.id}${row.variant ? ` (variant ${row.variant})` : ''}: ${AWD.commandLine({ exec: execPath, args: row.args, env: row.env, cwd })}`); // F4b: every launch of a home app journalled with its exact argv
    const id = opts.id || newId(); // a relaunch mints the successor's id first (the old record names it before it stops)
    // B-bfe6: a browser row gets its OWN profile dir (the app session's), its argv from the PURE model (profile flags,
    // then the optional URL) — every refusal by name BEFORE anything is recorded or started
    let browser = null;
    if (row.browser) {
      const confinement = display.browserConfinement ? display.browserConfinement(execPath) : null;
      const pv = M.profileDirVerdict(profileDirOf(id), { home: homeOf(), ownedRoot: logRoot, confinement, exec: row.exec });
      if (!pv.ok) throw namedError(pv.code, pv.error);
      const av = M.browserArgv(row, { profileDir: pv.dir, url: v.launch.url });
      if (!av.ok) throw namedError(av.code, av.error);
      browser = { kind: row.browser, profileDir: pv.dir, argv: av.argv, url: av.url, env: av.env || {}, keepProfile: v.launch.keepProfile === true, confinement }; // lane E (D4): av.env = the accessibility switch (firefox)
    }
    // §7.9: a LibreOffice session gets its OWN profile (-env:UserInstallation — without it a second launch hands its
    // document to the first LibreOffice over its pipe and exits) under its own dir, removed by the browser rule
    // (M.profileRetireVerdict: a person's ending); its argv from the PURE model — the module switch, then the path LAST
    let office = null;
    if (row.office) {
      const pv = M.profileDirVerdict(profileDirOf(id), { home: homeOf(), ownedRoot: logRoot, confinement: row.confinement || null, exec: row.exec });
      if (!pv.ok) throw namedError(pv.code, pv.error);
      const av = O.officeArgv(row, { file: doc ? doc.file : null, profileDir: pv.dir });
      if (!av.ok) throw namedError(av.code, av.error);
      office = { module: row.office, profileDir: pv.dir, argv: av.argv };
    }
    const resolved = resolve(f, row, serverSetting);
    if (!resolved.backend) throw namedError('no-backend', `no display backend on this machine (${resolved.fallbackWhy})`);
    const backend = M.backendById(resolved.backend, backends);
    if (!backend.wired) throw namedError('backend-not-wired', `${resolved.backend} is probed and recorded but its relay is not wired (${resolved.via})`); // unreachable through the shipped table (resolveBackend passes an unwired rung over) — the belt for a table copy
    if (!resolved.recipe || typeof display.RECIPES?.[resolved.recipe] !== 'function') throw namedError('no-recipe', `${resolved.backend} via ${resolved.via} names no bring-up recipe (${resolved.recipe || 'none'}) — the capability table and desktop-display disagree`);
    // lane launch-picture-size: a rung that cannot hold the launch's OWN pin (the dialog's select, `vibespace-window open --size`)
    // refuses it BY NAME — never a window that silently follows the pane; the e2a door's `--size` / E2c's default and a
    // relaunch's carried pin (opts.pin) keep e2b's road (the keeper fits them)
    if (pv.pin) { const sv = pinSupportVerdict(M.fitPolicyOf({ backend: resolved.backend, via: resolved.via }, backends), { backend: resolved.backend, via: resolved.via }); if (!sv.ok) throw namedError(sv.code, sv.error); }
    const line = M.fallbackLogLine(resolved);
    if (line) log.log?.(line);
    // HiDPI (2.369.158): the app's SCALE is decided ONCE, here, from `desktop.appScale` and the launching
    // client's devicePixelRatio — on the xpra rung only (its client maps CSS px → device px; a whole-display
    // rung's picture is CSS px, so an app scaled there would only look twice as big). A change needs a relaunch.
    // Round 3 A3: × the client's UI scale (VibeSpace's own effective scale), and a relaunch's Scale ▸ choice wins;
    // lane D: then the app's OWN default scale the person chose in the launch dialog (the body's `scaleChoice`, origin
    // 'app'), then an explicit `desktop.appScale`, then auto — the ORIGIN is recorded beside the value (the chip says which).
    const pick = M.scalePick({ choice: opts.scaleChoice, appDefault: v.launch.scaleChoice, setting: serverSetting('desktop.appScale'), dpr: v.launch.dpr, uiScale: v.launch.uiScale });
    // lane D (a): a fraction is a REAL scale (GDK_SCALE at the ceiling, the picture shown at s ÷ it) — a browser row keeps the
    // floor rule (it scales whole from the font dpi, measured); the record stores what it was rendered at (gdkScale, pictureScale)
    const rungScales = M.capsOf({ backend: backend.id }, backends).scales; // the row's cell: only a rung that scales takes the knobs
    const knobs = rungScales ? M.scaleKnobs(pick.scale, { rule: M.scaleRuleOf(row) }) : M.scaleKnobs(1);
    if (office) {
      try { await fs.promises.mkdir(office.profileDir, { recursive: true, mode: 0o700 }); await fs.promises.chmod(office.profileDir, 0o700); }
      catch (e) { throw namedError('profile-dir', `could not create the LibreOffice profile ${office.profileDir}: ${e.message}`); }
    }
    if (browser) {
      // created 0700 (the profile holds the browser's cookies and saved secrets); firefox's first-run switch is its user.js
      try {
        await fs.promises.mkdir(browser.profileDir, { recursive: true, mode: 0o700 });
        await fs.promises.chmod(browser.profileDir, 0o700);
        if (browser.kind === 'firefox') await fs.promises.writeFile(path.join(browser.profileDir, 'user.js'), M.firefoxUserJs(), { mode: 0o600 });
      } catch (e) { throw namedError('profile-dir', `could not create the browser profile ${browser.profileDir}: ${e.message}`); }
    }
    const rec = M.newRecord({ id, label: doc ? doc.label : row.label, exec: execPath, args: browser ? browser.argv : office ? office.argv : (row.args || []), cwd, env: browser && Object.keys(browser.env).length ? { ...(row.env || {}), ...browser.env } : row.env, source: v.launch.source, backend: resolved.backend, via: resolved.via, fallbackWhy: resolved.fallbackWhy, idleTimeoutMs: idleTimeoutMin(serverSetting) * 60000, now: now(), scale: knobs.scale, dpi: knobs.dpi, gdkScale: rungScales ? knobs.gdkScale : null, pictureScale: rungScales ? knobs.pictureScale : null, scaleOrigin: rungScales ? pick.origin : null, scaleFrom: rungScales ? pick.from : null });
    if (v.launch.source === 'registry') rec.appId = row.id;
    if (browser) { rec.browser = browser.kind; rec.profileDir = browser.profileDir; rec.keepProfile = browser.keepProfile; rec.url = browser.url; rec.confinement = browser.confinement; }
    // lane e2a (design-agent-browser-v2 §E2): a browser an AGENT launched through `vibespace-browser new --backend desktop-app`
    // (the window-targets engine's openAgentBrowser — the only caller passing it) carries its origin + opener; every other
    // launch (the dialog, `vibespace-window open`, an op) has none, so `browser_is_human` keeps judging it
    if (browser && opts.origin === AGENT_BROWSER_ORIGIN) {
      rec.origin = AGENT_BROWSER_ORIGIN;
      rec.by = opts.by && opts.by.sessionId ? { sessionId: String(opts.by.sessionId), ...(opts.by.name ? { name: String(opts.by.name).slice(0, 120) } : {}) } : null;
      if (typeof opts.label === 'string' && opts.label.trim()) rec.label = opts.label.trim().slice(0, 120); // r3 (#11): the agent's own label (the door cleaned it)
    }
    stampPin(rec, pinAsked); // lane e2b (§E2.2): the pinned pixel size — the record is BORN with it (the dialog's select, `--size`, a relaunch carrying it)
    const lb = launchedByOf(opts.launchedBy || (rec.origin === AGENT_BROWSER_ORIGIN && rec.by ? { kind: 'agent', ...rec.by } : null));
    if (lb) rec.launchedBy = lb; // lane app-launch-singleton: WHO started it — the card / the Desktop list say it ("started by agent session X")
    if (office) { rec.office = office.module; rec.profileDir = office.profileDir; } // §7.9
    if (doc) { rec.file = doc.file; rec.fileMtimeAtLaunch = doc.mtime; } // §7.9: the after-edit fact's baseline
    rec.recipe = resolved.recipe;
    // lane app-display-portal: a sandboxed app (or a `portal: true` row, or every app under `desktop.appPortal = all`) gets its OWN
    // portal on its own display — decided once, here, from the setting; the bring-up starts it (M.portalWanted / M.portalPlan)
    const portalWhy = M.portalWanted(row, { mode: serverSetting('desktop.appPortal'), ownsDisplay: M.capsOf({ backend: backend.id }, backends).ownsDisplay });
    if (portalWhy) rec.portalWhy = portalWhy;
    store.apps[id] = rec;
    pruneHistory();
    commit();
    const start = () => {
      const p = bringUp(rec, f).catch((e) => log.warn?.(`[desktop] ${id} bring-up crashed: ${e.stack || e.message}`));
      inflight.set(id, p);
      p.finally(() => { if (inflight.get(id) === p) inflight.delete(id); }).catch(() => { });
    };
    // 2.369.176: a browser relaunch records the successor NOW (every refusal already happened above, the record is
    // committed and named) but brings it up only after the record it replaces has stopped and handed over its profile
    if (opts.deferBringUp) deferred.set(id, start); else start();
    return view(rec);
  }
  function startDeferred(id) { const start = deferred.get(id); deferred.delete(id); if (start) start(); return !!start; }

  /** design q-024 r1 §1.2 (lane remoteapp-r1a): ONE app of a PAIRED Windows machine as a real X window — THIS machine's
   *  xfreerdp in RemoteApp (RAIL) mode, an app on its own xpra display (the table's `remote` row), connected to the
   *  machine's 127.0.0.1:3389 through the agent's loopback forward. The way there is the hub's seam (`remoteapp`). Every
   *  refusal happens BEFORE the forward opens; a refusal after it closes it at once, the session's teardown otherwise. The
   *  record holds FACTS only — `remoteapp` (the machine + the app: what a relaunch asks again) and `rdp` (forwardId, the
   *  pinned certFp, the forward's port, the client's version); the password stays a GETTER in `rdpSeats`, read once at the
   *  spawn for xfreerdp's stdin. A relaunch (Scale ▸) comes back here through relaunchBodyOf: a new forward reference, the
   *  setup read again. xfreerdp ignores GDK_SCALE, so the session is recorded at 1× (a relaunch reconnects at 1×). */
  async function launchRemoteApp(body, opts = {}) {
    const serverSetting = opts.settings ? settingsReader(opts.settings) : serverSetting0;
    const rq = RA.remoteappRequestVerdict(body.remoteapp);
    if (!rq.ok) throw namedError(rq.code, rq.error);
    if (!remoteapp || typeof remoteapp.setup !== 'function' || typeof remoteapp.forward !== 'function') throw namedError('remoteapp_unwired', 'RemoteApp runs only on the VibeSpace server — this machine has no way to a paired machine');
    const row = backends.find((b) => b.remote === RA.REMOTE_KIND);
    if (!row) throw namedError('no-backend', 'this machine\'s display table has no RemoteApp row');
    const f = await facts();
    const nv = M.needsVerdict(row, f.bins || {});
    if (!nv.ok) throw namedError('no-backend', RA.needsClientWords(nv.missing));
    const recipe = M.recipeFor(row.id, nv.via, backends);
    if (!recipe || typeof display.RECIPES?.[recipe] !== 'function') throw namedError('no-recipe', `${row.id} via ${nv.via} names no bring-up recipe (${recipe || 'none'}) — the capability table and desktop-display disagree`);
    const cap = M.capVerdict(liveRecords().filter((r) => r.id !== opts.replacing), limits);
    if (cap) throw namedError(cap.code, cap.error);
    // design §1.6 fence 5: Windows Pro gives ONE remote session per machine — a second launch is refused, naming the first
    const busy = liveRecords().find((r) => r.id !== opts.replacing && r.remoteapp && r.remoteapp.hostId === rq.hostId);
    if (busy) throw namedError('rdp_session_busy', `${rq.hostId} already shows a RemoteApp session (${busy.label}, ${busy.id}) — Windows gives one remote session per machine; use that window or stop it first`);
    const exec = f.bins[RA.rdpClientOf(nv.via)];
    const build = RA.rdpBuildVerdict(typeof display.rdpBuildFacts === 'function' ? await display.rdpBuildFacts(exec, { env: env() }) : {});
    if (!build.ok) throw namedError(build.code, build.error);
    const setup = await remoteapp.setup(rq.hostId); // the seam refuses an incomplete setup BY NAME (remoteapp_needs_setup); checked again here
    const missing = RA.setupMissing(setup);
    if (missing.length) throw namedError('remoteapp_needs_setup', RA.needsSetupWords(missing, rq.hostId));
    const fp = RA.certFpVerdict(setup.certFp).fp;
    const fwd = await remoteapp.forward(rq.hostId);
    let closed = false;
    const close = () => { if (closed) return; closed = true; try { fwd.close(); } catch (e) { log.warn?.(`[desktop] RemoteApp forward ${fwd.forwardId}: close failed — ${e.message}`); } };
    const id = opts.id || newId();
    let rec, configDir;
    try {
      const av = RA.remoteappArgv({ port: fwd.port, user: setup.user, domain: setup.domain || '', program: rq.program, name: rq.name, args: rq.args, certFp: fp, kbdUnicode: rq.kbdUnicode, h264: build.h264 });
      if (!av.ok) throw namedError(av.code, av.error);
      // the client's OWN config dir, fresh and empty (0700): a certificate an earlier TOFU stored under ~/.config/freerdp wins over the pin (measured)
      configDir = path.join(appDir(id), 'rdp-config');
      await fs.promises.rm(configDir, { recursive: true, force: true });
      await fs.promises.mkdir(configDir, { recursive: true, mode: 0o700 });
      const knobs = M.scaleKnobs(1);
      rec = M.newRecord({ id, label: rq.name, exec, args: av.argv, cwd: null, env: undefined, source: 'remoteapp', backend: row.id, via: nv.via, fallbackWhy: null, idleTimeoutMs: idleTimeoutMin(serverSetting) * 60000, now: now(), scale: knobs.scale, dpi: knobs.dpi, gdkScale: knobs.gdkScale, pictureScale: knobs.pictureScale, scaleOrigin: 'auto', scaleFrom: null });
    } catch (e) { close(); throw e; }
    rec.recipe = recipe;
    rec.remoteapp = { hostId: rq.hostId, program: rq.program, name: rq.name, args: rq.args, kbdUnicode: rq.kbdUnicode };
    rec.rdp = { forwardId: fwd.forwardId, certFp: fp, port: fwd.port, client: build.version };
    const lb = launchedByOf(opts.launchedBy);
    if (lb) rec.launchedBy = lb;
    rdpSeats.set(id, { close, password: setup.password, configDir });
    store.apps[id] = rec;
    pruneHistory();
    commit();
    log.log?.(`[desktop] RemoteApp ${id}: ${rq.name} on ${rq.hostId} through 127.0.0.1:${fwd.port} (FreeRDP ${build.version}${build.h264 ? ', H.264' : ''})`);
    const start = () => {
      const p = bringUp(rec, f).catch((e) => log.warn?.(`[desktop] ${id} bring-up crashed: ${e.stack || e.message}`));
      inflight.set(id, p);
      p.finally(() => { if (inflight.get(id) === p) inflight.delete(id); }).catch(() => { });
    };
    if (opts.deferBringUp) deferred.set(id, start); else start();
    return view(rec);
  }
  /** lane remoteapp-r1b (design q-024 r1 §1.4 「首次连接」 / 「重新信任」): ONE sign-in to the machine with no app — THIS machine's
   *  xfreerdp `/auth-only /cert:tofu` (src/remoteapp.js remoteappTrustArgv, measured) through the loopback forward a launch
   *  takes, into a FRESH config dir of its own (0700, removed after): the one certificate it stored there is the machine's,
   *  its sha256 the pin the hub writes on the sealed row. The password rides stdin as ONE line (`/from-stdin:force` —
   *  `/auth-only` will not start before it knows one). Exit 0 alone is success (trustVerdict: the run also prints the
   *  certificate warnings when it succeeds); a failed sign-in pins nothing. → { ok, certFp, client } */
  async function trustRemoteApp({ hostId, machine = null } = {}) {
    if (!remoteapp || typeof remoteapp.signin !== 'function' || typeof remoteapp.forward !== 'function') throw namedError('remoteapp_unwired', 'RemoteApp runs only on the VibeSpace server — this machine has no way to a paired machine');
    if (typeof hostId !== 'string' || hostId === 'local' || !/^[\w.:-]{1,128}$/.test(hostId)) throw namedError('bad-request', 'the first connection is to a PAIRED Windows machine — name it by its host id');
    const who = machine || hostId;
    const row = backends.find((b) => b.remote === RA.REMOTE_KIND);
    if (!row) throw namedError('no-backend', 'this machine\'s display table has no RemoteApp row');
    const f = await facts();
    const nv = M.needsVerdict(row, f.bins || {});
    if (!nv.ok) throw namedError('no-backend', RA.needsClientWords(nv.missing));
    // a live session IS the machine's trusted certificate in use — re-trusting under it is refused, naming the session
    const busy = liveRecords().find((r) => r.remoteapp && r.remoteapp.hostId === hostId);
    if (busy) throw namedError('rdp_session_busy', `${who} shows a RemoteApp session now (${busy.label}, ${busy.id}) — stop it before connecting to the machine again`);
    if (rdpTrusting.has(hostId)) throw namedError('rdp_trust_busy', `a first connection to ${who} is already running`);
    rdpTrusting.add(hostId); // taken with the check, BEFORE any await (verify r1: two clicks during a cold build read both ran /auth-only)
    let fwd = null;
    const configDir = path.join(logRoot, `rdp-trust-${newId()}`);
    try {
      const exec = f.bins[RA.rdpClientOf(nv.via)];
      const build = RA.rdpBuildVerdict(typeof display.rdpBuildFacts === 'function' ? await display.rdpBuildFacts(exec, { env: env() }) : {});
      if (!build.ok) throw namedError(build.code, build.error);
      const signin = await remoteapp.signin(hostId); // refuses a missing user / password BY NAME
      fwd = await remoteapp.forward(hostId);
      const av = RA.remoteappTrustArgv({ port: fwd.port, user: signin.user, domain: signin.domain || '' });
      if (!av.ok) throw namedError(av.code, av.error);
      let line = String(await signin.password()); // read NOW, once: the run's stdin and nowhere else
      if (/[\r\n]/.test(line)) throw namedError('bad-request', 'the RemoteApp password holds a line break — it cannot be handed over as one line');
      await fs.promises.rm(configDir, { recursive: true, force: true });
      await fs.promises.mkdir(configDir, { recursive: true, mode: 0o700 });
      const runEnv = { ...env(), XDG_CONFIG_HOME: configDir }; // its OWN config dir: an earlier TOFU elsewhere is never read, and nothing it stores outlives the run
      delete runEnv.DISPLAY; // measured: `/auth-only` opens no window and needs no display
      const run = await display.rdpTrustRun({ exec, argv: av.argv, env: runEnv, configDir, stdinLine: () => { const l = line; line = null; return l; }, deadlineMs: RA.TRUST_DEADLINE_MS });
      const v = RA.trustVerdict({ code: run.code, signal: run.signal, lines: RA.scrubRdpLog(run.out).split('\n'), timedOut: run.timedOut, machine: who });
      if (!v.ok) throw namedError(v.code, v.error);
      const fp = RA.certFpVerdict(run.certFp || '');
      if (!fp.ok) throw namedError('rdp_trust_no_cert', `${who} took the sign-in, but the client left no certificate to pin (${run.certWhy || fp.error}) — nothing was pinned`);
      log.log?.(`[desktop] RemoteApp first connection to ${hostId}: signed in, certificate sha256 ${fp.fp.slice(0, 11)}… (FreeRDP ${build.version})`);
      return { ok: true, certFp: fp.fp, client: build.version };
    } finally {
      rdpTrusting.delete(hostId);
      if (fwd) { try { fwd.close(); } catch (e) { log.warn?.(`[desktop] RemoteApp forward ${fwd.forwardId}: close failed — ${e.message}`); } }
      await fs.promises.rm(configDir, { recursive: true, force: true }).catch((e) => log.warn?.(`[desktop] the first connection's config dir was not removed: ${e.message}`));
    }
  }
  /** lane remoteapp-r1a: a RemoteApp session's forward reference goes with it (every terminal path runs teardown). */
  function closeRdp(id) { const seat = rdpSeats.get(id); if (!seat) return; rdpSeats.delete(id); seat.close(); }
  /** lane remoteapp-r1b (design q-024 r1 §1.3): a RemoteApp session's app.log AT REST holds no password shape — rewritten
   *  through src/remoteapp.js scrubRdpLog once its parts are gone (the client logs at WARN and measured none: the belt). */
  const SCRUB_MAX_BYTES = 32 * 1024 * 1024;
  async function scrubRdpLogFile(id) {
    const f = path.join(logRoot, id, 'app.log');
    try {
      const st = await fs.promises.stat(f);
      if (st.size > SCRUB_MAX_BYTES) { log.warn?.(`[desktop] ${id}: app.log is ${st.size} bytes — over the scrub's bound, left as written`); return; }
      const text = await fs.promises.readFile(f, 'utf8');
      const clean = RA.scrubRdpLog(text);
      if (clean === text) return;
      const tmp = `${f}.scrub-${process.pid}`;
      await fs.promises.writeFile(tmp, clean, { mode: 0o600 });
      await fs.promises.rename(tmp, f);
      log.warn?.(`[desktop] ${id}: a password-shaped token in the RemoteApp client's log was scrubbed`);
    } catch (e) { if (e && e.code !== 'ENOENT') log.warn?.(`[desktop] ${id}: app.log not scrubbed (${e.code || e.message})`); }
  }
  /** lane remoteapp-r1a: why a RemoteApp session ended — the client's own words in the tail of its log + its exit code
   *  (src/remoteapp.js rdpEndVerdict). → { code, words } | null */
  async function rdpEndOf(rec, code, signal) {
    let text = '';
    try {
      const fh = await fs.promises.open(path.join(logRoot, rec.id, 'app.log'), 'r');
      try { const st = await fh.stat(); const n = Math.min(st.size, 16384); const b = Buffer.alloc(n); await fh.read(b, 0, n, st.size - n); text = b.toString('utf8'); } finally { await fh.close(); }
    } catch { /* no log: the exit code alone */ }
    return RA.rdpEndVerdict({ code, signal, lines: RA.scrubRdpLog(text).split('\n'), machine: rec.remoteapp ? rec.remoteapp.hostId : 'the machine' }); // lane remoteapp-r1b: scrubbed before a word of it reaches the record
  }
  /**
   * lane one-browser-b1 (design q-026 r1 §2.1 B1): A DISPLAY-ONLY SESSION for an agent browser (`kind: display-for-browser`,
   * `forBrowser` = the browser profile's id) — brought up like any session by the xpra-seamless recipe (pid + starttime +
   * port recorded the moment each is known, adopted or reaped at boot, torn down verified empty), but with NO app (the
   * browser keeper spawns Google Chrome on it itself) and NO idle stop (idleTimeoutMs 0: its lifetime is the browser
   * record's — the browser keeper stops it with the record). Never counted against the app ceiling. This machine only.
   * → the record's view once its bring-up settled (`ready`, or `failed` with its lastError); no xpra ⇒ refused `no-xpra`.
   */
  async function launchDisplay(body = {}) {
    const forBrowser = body && typeof body.forBrowser === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/i.test(body.forBrowser) ? body.forBrowser : null;
    if (!forBrowser) throw namedError('bad-request', 'forBrowser must name a browser profile id');
    const f = await facts();
    const bins = (f && f.bins) || {};
    if (!bins.xpra || !bins.xauth) throw namedError('no-xpra', `no ${bins.xpra ? 'xauth' : 'xpra'} on this machine — a browser's display session needs xpra and xauth`);
    const id = newId();
    const rec = M.newRecord({ id, label: M.displayForBrowserLabel(body.label), exec: null, args: [], cwd: null, env: null, source: 'browser', backend: 'xpra', via: 'xpra', fallbackWhy: null, idleTimeoutMs: 0, now: now() });
    rec.kind = M.DISPLAY_FOR_BROWSER; rec.forBrowser = forBrowser; rec.recipe = 'xpra-seamless';
    store.apps[id] = rec;
    pruneHistory();
    commit();
    const p = bringUp(rec, f).catch((e) => log.warn?.(`[desktop] ${id} bring-up crashed: ${e.stack || e.message}`));
    inflight.set(id, p);
    p.finally(() => { if (inflight.get(id) === p) inflight.delete(id); }).catch(() => { });
    await p;
    return view(rec);
  }

  /** The Scale ▸ relaunch as ONE machine act (the `relaunch` op, and the in-process hub keeper's relaunch()): the
   *  successor first (a refusal — the cap, a vanished binary — leaves the running app untouched), `replacedBy`
   *  committed before the old session's stop. `onSuccessor(nextId)` = the hub's seat carry, called between the
   *  successor's record and the old session's stop; it returns the arm function, called once the stop has settled
   *  (src/server/desktop-app-keeper.js carrySeat; absent over the op).
   *  2.369.176 — a BROWSER relaunch keeps its profile (logins, tabs): a browser locks its profile dir, so the
   *  successor cannot start beside the running one. Order: mint the successor's id and RECORD it (every refusal
   *  happens here, the running browser untouched), the old record names it, stop the old one with `profileCarryTo`
   *  on its record (stop() MOVES the profile dir onto the successor's path once every part is gone), then bring the
   *  successor up on that profile. The seat carries exactly as for any other app.
   *  → { app, replaced } */
  async function relaunch(id, body, { settings = null, onSuccessor = null } = {}) {
    const rec = store.apps[id];
    if (!rec) throw namedError('not-found', `no desktop app ${id}`);
    const rv = M.validateRelaunchRequest(body || {});
    if (!rv.ok) throw namedError(rv.code, rv.error);
    const why = M.relaunchVerdict(rec, backends) || (stopping.has(id) || rec.replacedBy ? { code: 'not-ready', error: `${rec.label || id} is already stopping` } : null);
    if (why) throw namedError(why.code, why.error);
    // lane e2a r3 (verify r1 #2/#6): the agent's own browser stays the agent's through a Scale ▸ relaunch — its origin, opener
    // and label ride to the successor (keepProfile + url already ride the body); the engine carries the lease along replacedBy
    const lopts = { scaleChoice: rv.choice, replacing: id, ...(rec.origin === AGENT_BROWSER_ORIGIN ? { origin: rec.origin, by: rec.by, label: rec.label } : {}), ...(pinOf(rec.pin) ? { pin: rec.pin } : {}) }; // lane e2b: the pin rides the relaunch
    if (rec.launchedBy) lopts.launchedBy = rec.launchedBy; // lane app-launch-singleton: and who started it
    if (rec.remoteapp) lopts.remoteappDoor = true; // lane remoteapp-r1a: the relaunch of a RemoteApp session a person started reconnects it
    if (settings) lopts.settings = settings;
    // §7.9: a LibreOffice session relaunches the same way — its document is LOCKED by the running instance
    // (.~lock.<name>#: a successor started beside it would open "Document in use"), and its profile goes with it
    if (rec.browser || rec.office) {
      // B-04da ④: a LibreOffice session is ASKED to quit first (its own save prompt, in its window) — the successor is
      // minted only once it has; an app still asking leaves everything as it was (`app-asked`: the person answers the
      // prompt, or relaunches again with `force`). `stopping` is HELD from the ask to the stop: the app's own exit in
      // between is the relaunch's, never an `exited` verdict that would close the window before its successor exists.
      let held = false;
      if (M.askCloseVerdict(rec, { force: rv.force }).ask) {
        stopping.add(id);
        let a = null;
        try { a = await askAppToClose(rec); } finally { if (!(a && a.closed)) stopping.delete(id); }
        if (!a.closed) throw askedError(rec, a, 'relaunch');
        held = true;
      }
      const nextId = newId();
      let next;
      try { next = await launch({ ...M.relaunchBodyOf(rec), ...(rec.browser ? { url: rec.url || undefined, keepProfile: rec.keepProfile === true } : {}), dpr: rv.dpr, uiScale: rv.uiScale }, { ...lopts, id: nextId, deferBringUp: true }); }
      catch (e) { if (held) await stop(id, { why: 'user', held: true }); throw e; } // the app already quit: its record ends as a person's stop
      const armSeat = typeof onSuccessor === 'function' ? onSuccessor(nextId) : null;
      rec.replacedBy = nextId;
      commit();
      let old;
      rec.profileCarryTo = nextId; // stop() moves the profile onto this successor once every part is gone (the record carries the order; stop's reasons stay the closed list §54b pins)
      // verify r1: a FORCED relaunch (the person confirmed losing the edits) stops with that force — a stop that asked
      // again would answer `app-asked` AFTER the successor was minted, and the window would follow it off the old app
      try { old = await stop(id, { why: 'relaunch', held, force: rv.force }); } finally { startDeferred(nextId); if (typeof armSeat === 'function') armSeat(); }
      log.log?.(`[desktop] ${id} relaunched as ${nextId} at ${next.scale}× (${next.scaleOrigin}) with its profile carried: ${rec.label}`);
      return { app: get(nextId) || next, replaced: old };
    }
    const next = await launch({ ...M.relaunchBodyOf(rec), dpr: rv.dpr, uiScale: rv.uiScale }, lopts);
    const armSeat = typeof onSuccessor === 'function' ? onSuccessor(next.id) : null;
    rec.replacedBy = next.id;
    commit();
    let old;
    try { old = await stop(id, { why: 'relaunch' }); } finally { if (typeof armSeat === 'function') armSeat(); }
    log.log?.(`[desktop] ${id} relaunched as ${next.id} at ${next.scale}× (${next.scaleOrigin}): ${rec.label}`);
    return { app: get(next.id) || next, replaced: old };
  }

  /** LANE D (a) item C: `Default/Preferences` gets `browser.custom_chrome_frame: true` when the key is ABSENT (PURE
   *  chromiumFramePrefs — an existing choice is kept, an unreadable file is never overwritten), written tmp + rename at
   *  0600 in a 0700 `Default/`; then the marker, so a profile is seeded once in its life. → { ok, why } */
  async function seedChromiumFrame(profileDir) {
    const marker = path.join(profileDir, M.CHROMIUM_FRAME_MARKER);
    try { await fs.promises.access(marker); return { ok: true, why: 'seeded-before' }; } catch { /* not yet */ }
    const dir = path.join(profileDir, 'Default'), file = path.join(dir, 'Preferences');
    let prefs = null;
    try {
      const raw = await fs.promises.readFile(file, 'utf8');
      try { prefs = JSON.parse(raw); } catch { return { ok: false, why: `${file} is not JSON` }; }
    } catch (e) { if (e.code !== 'ENOENT') return { ok: false, why: `${file}: ${e.message}` }; }
    const v = M.chromiumFramePrefs(prefs);
    if (!v.ok) return { ok: false, why: `${file}: ${v.why}` };
    try {
      if (v.changed) {
        await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
        const tmp = `${file}.vibespace-${process.pid}.tmp`;
        await fs.promises.writeFile(tmp, JSON.stringify(v.prefs), { mode: 0o600 });
        await fs.promises.rename(tmp, file);
      }
      await fs.promises.writeFile(marker, `${v.why}\n`, { mode: 0o600 });
    } catch (e) { return { ok: false, why: e.message }; }
    return { ok: true, why: v.why };
  }
  function appDir(id) { const d = path.join(logRoot, id); fs.mkdirSync(d, { recursive: true }); return d; }
  // ── lane app-display-notify-sink: THE NOTIFICATIONS of an app on its own display — the sink (src/notify-sink.py) on the
  // app's private bus appends one JSON line per Notify to <app dir>/portal/notify.jsonl; this reads what is new (a watch
  // on the dir + every tick), keeps the last NOTIFY_JOURNAL_MAX per app (the window's ⋯ ▸ Notifications) and hands each
  // new one to the hub (`hooks.onNotify` — a daemon installs none: its ring answers the hub's read). A restart reads the
  // file's tail into the ring without re-announcing it.
  const notes = new Map(); // id -> { off, tail, ring: [], watch: FSWatcher|null }
  const NOTE_READ_MAX = 256 * 1024;
  function drainNotes(rec, { announce = true } = {}) {
    if (!rec || rec.notify !== 'on') return;
    const dir = path.join(logRoot, rec.id, 'portal'), file = path.join(dir, 'notify.jsonl');
    let n = notes.get(rec.id);
    const first = !n;
    if (first) {
      n = { off: 0, tail: '', ring: [], watch: null };
      notes.set(rec.id, n);
      try { n.watch = fs.watch(dir, (ev, name) => { if (name === 'notify.jsonl') drainNotes(store.apps[rec.id]); }); n.watch.on('error', () => {}); } catch { /* the tick still drains */ }
    }
    let size = 0;
    try { size = fs.statSync(file).size; } catch { return; }
    if (size < n.off) { n.off = 0; n.tail = ''; } // a new bus wrote a new file
    if (size === n.off) return;
    const from = Math.max(n.off, size - NOTE_READ_MAX), buf = Buffer.alloc(size - from);
    let fd = null;
    try { fd = fs.openSync(file, 'r'); fs.readSync(fd, buf, 0, buf.length, from); } catch (e) { log.warn?.(`[desktop] ${rec.id}: notifications not read — ${e.message}`); return; } finally { if (fd !== null) try { fs.closeSync(fd); } catch { /* closed */ } }
    n.off = size;
    const lines = (n.tail + buf.toString('utf8')).split('\n');
    n.tail = lines.pop();
    for (const line of lines) {
      const note = M.notifyRecord(line, { now: now() });
      if (!note) continue;
      if (note.closed) { const o = n.ring.find((x) => x.nid === note.nid); if (o) o.closed = true; continue; }
      n.ring.push(note);
      if (n.ring.length > M.NOTIFY_JOURNAL_MAX) n.ring.splice(0, n.ring.length - M.NOTIFY_JOURNAL_MAX);
      if (announce && !first) { try { H.onNotify?.(rec, note); } catch (e) { log.warn?.(`[desktop] ${rec.id}: notification hook failed: ${e.message}`); } }
    }
  }
  function endNotes(id) { const n = notes.get(id); if (n && n.watch) { try { n.watch.close(); } catch { /* closed */ } } notes.delete(id); }
  /** The app's last notifications (newest last) — the window's ⋯ ▸ Notifications. */
  function notifications(id) { const rec = store.apps[id]; if (rec) drainNotes(rec); return { notify: (rec && rec.notify) || 'off', notes: ((notes.get(id) || {}).ring || []).map((x) => ({ ...x })) }; }
  const sessionMarker = (id) => `${SESSION_ENV}=${id}`;
  /** The environ needles that PROVE a pid belongs to `rec` (2026-09-22): the
   *  marker every process the keeper starts inherits, and — on a display of
   *  its own — the per-app `XAUTHORITY=<data>/desktop-apps/<id>/Xauthority`
   *  every process on that display carries. xpra's own Xvfb gets a sanitised
   *  env WITHOUT the marker but WITH that path (measured on 6.5.3), so a dead
   *  xpra's Xvfb (~100-190 MB) was proven by nothing and leaked for ever. */
  const needlesOf = (rec) => (!M.capsOf(rec, backends).ownsDisplay ? [sessionMarker(rec.id)] : [sessionMarker(rec.id), `XAUTHORITY=${path.join(logRoot, rec.id, 'Xauthority')}`]);
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
        bins: f.bins, dir, authFile, cookie, geometry: bornGeometry(rec), base, logFd, dpi: rec.dpi || 96,
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
      // lane app-display-portal: the app's OWN session bus + desktop portal ON ITS DISPLAY (a flatpak's file chooser is the
      // portal's — on the user's bus it drew on the main desktop, never in this pane). Started BEFORE the app (the app is
      // launched on that bus); a missing binary or a bus that never listens is recorded, and the app starts as before.
      let portalEnv = {};
      if (own && rec.portalWhy) {
        const notify = display.notifySinkFacts ? await display.notifySinkFacts({ env: base, mode: serverSetting('desktop.appNotifications') }) : null; // lane app-display-notify-sink
        const plan = M.portalPlan({ dir, display: up.display, authFile: sessionAuth, bins: display.portalBins({ env: base }), a11y: await display.a11yBusAddress({ env: base }), why: rec.portalWhy, notify });
        if (gone()) return;
        // lane app-display-secrets (B-4a59 piece 4): the same bus activates the app's Secret Service — its service file
        // and (lane display-secret-fd, B-6c6d) its one-shot key FILE are laid over the plan here, written 0600 with the
        // rest before the bus starts. NOTHING of the key goes into plan.env: that env is dbus-daemon's own environ and
        // every service it activates inherits it. `rec.secrets` is said once the bus runs.
        const secrets = plan.ok && display.appSecretsFacts ? M.secretServicePlan({ plan, facts: await display.appSecretsFacts({ env: base, mode: serverSetting('desktop.appSecrets'), dataDir, id }) }) : null;
        if (gone()) return;
        if (secrets && secrets.files.length) plan.files.push(...secrets.files);
        if (!plan.ok) rec.portal = `unavailable: ${plan.why}`;
        else {
          try { const pc = await display.startPortalBus({ plan, env: ctx.x11Env(up.display), logFd }); ctx.onPart('portal', pc, {}); rec.portal = 'on'; rec.notify = plan.notify; portalEnv = plan.appEnv; drainNotes(rec); } // drainNotes: a launch announces from byte 0
          catch (e) { rec.portal = `unavailable: ${e.message}`; }
        }
        if (secrets) rec.secrets = rec.portal === 'on' ? secrets.secrets : `unavailable: no private bus (${rec.portal})`; // lane app-display-secrets
        if (rec.portal !== 'on') log.warn?.(`[desktop] ${id}: no portal of its own (${rec.portal}) — its file dialogs open on the session's portal`);
        commit();
        if (gone()) return;
      }
      // lane app-display-a11y-bus (B-4a59 piece 3): an app on its OWN bus gets an a11y bus — the user's when there is one
      // (the plan handed it), else the private bus's own (at-spi-bus-launcher, asked once); the record keeps the address
      // (`a11yBus`) so the agent's tree reads target THIS app's bus. No at-spi2-core ⇒ `a11y: 'unavailable: <why>'`, it starts.
      if (rec.portal === 'on' && display.appA11yBus) {
        const ab = await display.appA11yBus({ user: portalEnv.AT_SPI_BUS_ADDRESS || null, address: portalEnv.DBUS_SESSION_BUS_ADDRESS, env: base });
        if (gone()) return;
        rec.a11y = ab.a11y;
        if (ab.bus) rec.a11yBus = ab.bus; else delete rec.a11yBus;
        portalEnv = { ...portalEnv, ...ab.appEnv };
        if (ab.a11y.startsWith('unavailable')) log.warn?.(`[desktop] ${id}: no accessibility bus of its own (${ab.a11y}) — an agent cannot read its tree`);
        commit();
      }
      // the app itself — the sanitised env + the scale's knobs + the row's own (a row may pin GDK_SCALE) + the display
      const knobs = M.scaleKnobs(rec.scale || 1, { rule: M.scaleRuleOf(rec) }); // the same rule the launch recorded (lane D (a))
      const appEnv = { ...display.x11Env(base, { display: up.display, authFile: sessionAuth || base.XAUTHORITY }), ...(M.capsOf(rec, backends).scales ? knobs.env : {}), ...portalEnv, ...(rec.env || {}) };
      if (!sessionAuth) delete appEnv.XAUTHORITY;
      // r2 (the verifier's race): xpra REPLACES the display's resource database ~1 s after its display is up — an app
      // started before read no Xft.dpi (Xvfb's 100 dpi: a "1.5×" xterm got a 7×14 cell) and a merge before it was wiped.
      // Wait for xpra's write (bounded; a miss is logged, the app still starts), THEN merge, THEN start the app.
      if (own && M.capsOf(rec, backends).crispText) {
        const xd = await display.waitForXftDpi({ binPath: f.bins.xrdb, env: appEnv }); // wall clock (an injected test clock never stalls a real display wait)
        if (!xd.ok) log.warn?.(`[desktop] ${id}: ${xd.why} — the app starts without the display's font dpi`);
        if (gone()) return;
      }
      if (own && knobs.xresources) { // an Xft face for xterm at a scale > 1 (its bitmap default no dpi reaches) — on OUR display only, before the app reads its resources
        const xr = await display.applyXResources({ binPath: f.bins.xrdb, env: appEnv, text: knobs.xresources });
        if (!xr.ok) log.warn?.(`[desktop] ${id}: ${xr.why} — a bitmap-font terminal stays at 1x on this ${rec.scale}x display`);
        if (gone()) return;
      }
      // lane D (a) item C: a chromium-family profile draws its OWN frame (seamless) — seeded once per profile, BEFORE the
      // browser starts (a fresh scaffold, a kept profile and one carried to a Scale ▸ successor alike); a failure is logged
      if (rec.browser === 'chromium' && rec.profileDir) {
        const sd = await seedChromiumFrame(rec.profileDir);
        if (!sd.ok) log.warn?.(`[desktop] ${id}: the browser's own frame was not seeded (${sd.why}) — it keeps the system title bar and VibeSpace's`);
        if (gone()) return;
      }
      // lane remoteapp-r1a: a RemoteApp's password is read from its getter NOW (nothing spawned yet when it fails) and handed to
      // xfreerdp's stdin as ONE line (`/from-stdin`), the pipe then closed; the client gets its own empty config dir
      const seat = rdpSeats.get(id) || null;
      let stdinLine = null;
      if (seat) {
        try { stdinLine = String(await seat.password()); } catch (e) { await failed(`the RemoteApp sign-in could not be read (${(e && e.code) || 'error'})`); return; }
        seat.password = null;
        if (/[\r\n]/.test(stdinLine)) { stdinLine = null; await failed('the RemoteApp password holds a line break — it cannot be handed over as one line'); return; }
        if (gone()) return;
      }
      rec.appAt = now(); // lane app-launch-singleton: the app's own start — a quick exit is measured from here
      const a = M.isDisplayForBrowser(rec) ? null : await display.startApp({ exec: rec.exec, args: rec.args, cwd: rec.cwd, env: seat ? { ...appEnv, XDG_CONFIG_HOME: seat.configDir } : appEnv, logFd, ...(seat ? { stdinOnce: () => { const line = stdinLine; stdinLine = null; return line; } } : {}) });
      if (a) ctx.onPart('app', a, {}); // lane one-browser-b1: a browser's display-only session starts no app (its browser keeper spawns Chrome)
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
      if (!M.isDisplayForBrowser(rec)) armFirstFit(id); // P8-2 x4: the app's window may map seconds after ready (GTK ~1-2 s) — fitted the moment it exists
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

  function fail(rec, event, why, tail = '') {
    const next = M.transition(rec.state, event);
    if (!next) return;
    rec.state = next; rec.lastError = why; rec.endedAt = now();
    log.warn?.(`[desktop] ${rec.id} ${next}: ${why}${tail ? ` — ${tail}` : ''}`);
  }
  function onPartExit(id, part, code, signal) {
    const rec = store.apps[id];
    if (!rec || !M.isLiveState(rec.state) || stopping.has(id)) return;
    if (part === 'app') {
      rec.exitCode = code;
      // lane app-launch-singleton (fleet inc-mv7hxc2n-2cvr): the journal line says WHEN (`… exited: application exited (code 0)
      // — 0.8 s after ready`); an app that ends within QUICK_EXIT_MS of its start was no window at all — `quickExit` on the
      // record (the window keeps the sentence, the card says it, the hub files a notice) naming a RUNNING instance of the same
      // app when one exists (the usual cause: its singleton took the launch over)
      const qv = M.quickExitVerdict(rec, now());
      fail(rec, 'app-exit', signal ? `application ended by ${signal}` : `application exited (code ${code})`, qv.tail);
      if (qv.quick) {
        const other = liveRecords().find((r) => r.id !== id && M.sameAppRecord(r, { id: rec.appId, path: rec.exec }, r.hostId));
        rec.quickExit = { afterMs: qv.afterMs, sinceReadyMs: qv.sinceReadyMs, code: signal ? null : code, signal: signal || null, running: other ? other.id : null, runningDisplay: other ? other.display || null : null };
        log.warn?.(`[desktop] ${id}: the app ended ${qv.tail} — a launch that showed no window; ${other ? `the same app runs as ${other.id} on ${other.display}` : 'no other instance of it is recorded'}`);
      }
      // round 3 A2 (docs/design-desktop-apps-seamless §3.2): the windows LEFT on the display at the exit — ONE census
      // while X is still up, BEFORE the teardown, recorded on the record the commit broadcasts. Every client decides
      // "the app exited ⇒ close my window" from this one fact (M.exitCloseVerdict): 0 = the app took its windows with it
      // (the app's own ✕, a quit), > 0 = a forking launcher exited while its child still shows one, null = not counted.
      const handles = children.get(id);
      (async () => {
        if (rec.rdp) { const rv = await rdpEndOf(rec, code, signal); if (rv) { rec.rdp.ended = rv.code; rec.lastError = rv.words; } } // lane remoteapp-r1a: the client's own reason
        rec.windowsAtExit = await windowsLeftAtExit(rec);
        // lane exit-close-cadence (B-8778): the exit + its census ARE the verdict — committed (saved + broadcast) HERE, so
        // every client closes its window at the app's exit; the teardown is the keeper's own and commits again. Committed
        // only AFTER it, every window closed late by whatever outlived SIGTERM in the app's session — measured: an env
        // with no session bus makes GLib autolaunch one (`dbus-launch --autolaunch`, a member of the app's session) whose
        // babysitter dies 3.0 s after a SIGTERM (it ends its bus, then sleeps 3 s), so the close landed 3.1 s after the
        // exit. A crash in between leaves an exited record with live leftovers: boot adoption reaps them (rule 7).
        commit();
        await teardown(rec, handles);
        commit();
        if (rec.quickExit) { try { H.onQuickExit?.(view(rec)); } catch (e) { log.warn?.(`[desktop] ${id}: quick-exit hook failed: ${e.message}`); } } // the hub's notice
      })().catch((e) => { log.warn?.(`[desktop] ${id}: app-exit teardown failed: ${e.message}`); commit(); });
      return;
    } else if (part === 'x') fail(rec, 'display-gone', `X display ${rec.display} exited (${signal || `code ${code}`})`);
    else if (part === 'wm') { log.warn?.(`[desktop] ${id}: the window manager exited (${signal || `code ${code}`}) — the app keeps running bare`); return; }
    else fail(rec, 'display-gone', `picture server exited (${signal || `code ${code}`})`);
    teardown(rec, children.get(id)).then(() => commit());
  }

  /** round 3 A2: how many windows a person could still see on the record's OWN display right after its app exited
   *  (the keeper's app-window rows through M.windowsLeftCount); null = not counted — a SHARED display (the singleton:
   *  other apps' windows are not this app's), no display, or a census that failed / outlived EXIT_CENSUS_MS. */
  async function windowsLeftAtExit(rec) {
    if (!rec.display || !M.capsOf(rec, backends).ownsDisplay) return null;
    const xenv = x11EnvFor(rec.id);
    if (!xenv) return null;
    let timer = null;
    try {
      const r = await Promise.race([
        display.enumerateWindows({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv }),
        new Promise((res) => { timer = setTimeout(() => res({ ok: false, why: `no answer in ${EXIT_CENSUS_MS} ms` }), EXIT_CENSUS_MS); }),
      ]);
      if (!r || !r.ok) { log.warn?.(`[desktop] ${rec.id}: the window census at the app's exit could not run (${r && r.why}) — not counted`); return null; }
      // xpra keeps each managed app window inside a Corral wrapper that is MAPPED only while a client is connected
      // (measured 6.5.3: with no client the forking launcher's surviving xterm read viewable=false) — on that rung the
      // window's existence is the fact, not X's viewability; the other rungs keep X's mapped state
      const rows = M.capsOf(rec, backends).perWindow ? display.seamlessWindows(r.windows).map((w) => ({ ...w, mapped: null })) : M.appWindows(r.windows);
      return M.windowsLeftCount(rows);
    } catch (e) { log.warn?.(`[desktop] ${rec.id}: the window census at the app's exit threw (${e.message}) — not counted`); return null; }
    finally { clearTimeout(timer); }
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
   *  runs" on every one of them once it returns — an app's own exit commits
   *  its verdict BEFORE this pass (lane exit-close-cadence), the teardown's
   *  commit follows. Returns true when nothing survived. */
  async function teardown(rec, handles) {
    const own = M.capsOf(rec, backends).ownsDisplay;
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
    if (rec.portal === 'on') { try { await display.unmountUnder(path.join(logRoot, rec.id, 'portal')); } catch (e) { log.warn?.(`[desktop] ${rec.id}: portal unmount failed: ${e.message}`); } } // the document portal's FUSE outlives a killed portal
    // lane display-secret-fd: the key is handed over ONCE — the service unlinks it as it starts. An app that never asked
    // its keyring leaves the file behind, so the display's teardown takes it with it (never at rest beside the store).
    try { fs.unlinkSync(path.join(logRoot, rec.id, 'portal', M.SECRETS_KEY_FILE)); } catch { /* read by the service, or never written */ }
    children.delete(rec.id); sampledAt.delete(rec.id); samples.delete(rec.id); clearFit(rec.id); endNotes(rec.id);
    closeRdp(rec.id); // lane remoteapp-r1a: the RemoteApp's loopback forward goes with its session
    if (rec.rdp) await scrubRdpLogFile(rec.id); // lane remoteapp-r1b: its log at rest holds no password shape
    if (rec.file) await noteFileEnd(rec, { clean }); // §7.9: every part is gone — the document's mtime now vs at launch (the hub's file-changed); its lock, when this session wrote it
    try { H.onTeardown?.(rec.id); } catch (e) { log.warn?.(`[desktop] ${rec.id}: teardown hook failed: ${e.message}`); } // the hub's guard + live rows go with the session
    if (rec.profileDir && !M.isLiveState(rec.state) && !stopping.has(rec.id)) await retireProfile(rec, { clean, why: rec.state }); // B-bfe6: a stop retires AFTER its verdict (below)
    return clean;
  }
  /**
   * B-04da ④ — ASK, NEVER SIGNAL, WHILE A DOCUMENT MAY HOLD EDITS. A LibreOffice session is asked to quit through its
   * OWN File ▸ Exit (O.officeQuitArgv: `.uno:Quit` handed over the session's profile pipe — every modified document
   * raises LibreOffice's "Save changes?" in its window), then its app part is watched for `askCloseMs` (wall clock).
   * → { closed:true, why: 'quit'|'not-running' } | { closed:false, why: 'asking'|'pending'|'no-handover'|'spawn-failed',
   * error? } — 'pending' = a hand-over still waits on that prompt (never a second prompt stacked on it). The hand-over
   * carries the session marker, so a forced stop's teardown reaps it with the rest. The CALLER holds `stopping` (the
   * app's own exit meanwhile is the stop's to judge — onPartExit ignores it).
   */
  async function askAppToClose(rec) {
    const handles = children.get(rec.id) || null;
    if (!rec.pids.app || !partIsOurs(rec, 'app', handles)) return { closed: true, why: 'not-running' };
    const prev = quitAsks.get(rec.id);
    if (prev && handleLive(prev)) return { closed: false, why: 'pending' };
    const argv = O.officeQuitArgv(rec.profileDir);
    const xenv = x11EnvFor(rec.id);
    if (!argv || !xenv || !rec.exec) return { closed: false, why: 'no-handover', error: 'the session has no profile or display to hand the request to' };
    // the hand-over BLOCKS while LibreOffice's save prompt is up (measured) — one that RETURNED while the app still runs
    // was dropped (a request landing while the document still loads) and is asked again, at most ASK_TRIES times
    const ask = async () => {
      const c = await display.spawnDetached(rec.exec, argv, { env: { ...xenv, [SESSION_ENV]: rec.id }, name: 'libreoffice .uno:Quit' }).spawned;
      quitAsks.set(rec.id, c);
      c.once('exit', () => { if (quitAsks.get(rec.id) === c) quitAsks.delete(rec.id); });
      return c;
    };
    let child = null, tries = 1;
    try { child = await ask(); }
    catch (e) { log.warn?.(`[desktop] ${rec.id}: could not ask LibreOffice to quit: ${e.message}`); return { closed: false, why: 'spawn-failed', error: e.message }; }
    const until = Date.now() + askCloseMs;
    while (Date.now() < until) {
      if (!partIsOurs(rec, 'app', handles)) { log.log?.(`[desktop] ${rec.id}: LibreOffice quit on its own when asked: ${rec.label}`); return { closed: true, why: 'quit' }; }
      await sleep(100);
      if (!handleLive(child) && partIsOurs(rec, 'app', handles) && tries < ASK_TRIES) { await sleep(400); if (partIsOurs(rec, 'app', handles)) { tries++; try { child = await ask(); } catch { /* the wait below answers */ } } }
    }
    log.log?.(`[desktop] ${rec.id}: LibreOffice did not quit within ${askCloseMs} ms of being asked — its save prompt is up: ${rec.label}`);
    return { closed: false, why: 'asking' };
  }
  /** The refusal of a stop / relaunch whose app is still asking (B-04da ④): `app-asked`, said for a person, the record
   *  stamped (`closeAskedAt` / `closeAskedBy`) and broadcast. */
  function askedError(rec, a, why) {
    rec.closeAskedAt = now(); rec.closeAskedBy = why;
    commit();
    const name = rec.label || rec.id;
    const msg = a.why === 'no-handover' || a.why === 'spawn-failed'
      ? `${name} could not be asked to close (${a.error || a.why}) — stopping it now loses any unsaved edits`
      : `${name} is asking in its own window whether to save its changes — answer it there, or stop it anyway and lose the unsaved edits`;
    const e = namedError('app-asked', msg);
    e.asked = a.why;
    return e;
  }
  async function stop(id, { why = 'user', force = false, held = false } = {}) {
    const rec = store.apps[id];
    if (!rec) throw namedError('not-found', `no desktop app ${id}`);
    if (!M.isLiveState(rec.state)) { if (held) stopping.delete(id); return view(rec); }
    if (stopping.has(id) && !held) return view(rec);
    stopping.add(id);
    try {
      // B-04da ④: a LibreOffice session is asked first (`held` = the relaunch already asked it, under this same hold).
      // Still asking ⇒ a person's Stop / relaunch is refused `app-asked` (the client offers "stop anyway" = `force`);
      // the idle timeout never forces — the app keeps running with its prompt up (the hub restarts its idle clock)
      if (!held && M.askCloseVerdict(rec, { force }).ask) {
        const a = await askAppToClose(rec);
        if (!a.closed) {
          const e = askedError(rec, a, why);
          if (why === 'idle') { log.log?.(`[desktop] ${id}: idle timeout — ${e.message}; kept running`); return view(rec); }
          throw e;
        }
      }
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
      const next = M.transition(rec.state, 'stop');
      rec.state = next || 'exited';
      rec.endedAt = now();
      rec.stoppedBy = why;
      if (force) rec.stopForced = true; // B-04da ④: the person confirmed losing unsaved edits
      if (why === 'idle') rec.lastError = `stopped after ${Math.round(rec.idleTimeoutMs / 60000)} min without input (idle timeout)`;
      else if (why === 'relaunch') rec.lastError = `relaunched as ${rec.replacedBy || 'a new session'} at another scale`;
      else if (why !== 'user') rec.lastError = AGENT_BROWSER_ENDING_WORDS[why] || why; // r3 (#12): the agent rung's endings in words
      if (!clean) rec.lastError = `${rec.lastError ? rec.lastError + '; ' : ''}a process survived SIGKILL — check ${LOG_DIR}/${id}/app.log`;
      // 2.369.176: a browser relaunch CARRIES the profile — every part is verified gone (the browser's lock is released),
      // so the dir is moved onto the successor's own path (its empty scaffold removed first); a failed move is said by
      // name on both records and the successor starts from an empty profile rather than never
      const carryProfileTo = why === 'relaunch' && typeof rec.profileCarryTo === 'string' ? rec.profileCarryTo : null;
      if (carryProfileTo && rec.profileDir && clean) {
        const target = profileDirOf(carryProfileTo);
        try {
          try { await fs.promises.rmdir(target); } catch { /* absent or not empty — the rename below decides */ }
          await fs.promises.rename(rec.profileDir, target);
          rec.profileCarriedTo = carryProfileTo; delete rec.profileCarryTo;
          log.log?.(`[desktop] ${id}: its profile moved to ${target} for the relaunch ${carryProfileTo}`);
        } catch (e) {
          rec.profileError = `the profile at ${rec.profileDir} could not be moved to the relaunch (${e.message}) — it starts from an empty one`;
          const succ = store.apps[carryProfileTo]; if (succ) succ.lastError = `started from an empty profile: ${e.message}`;
          log.warn?.(`[desktop] ${id}: ${rec.profileError}`);
        }
      } else if (carryProfileTo && rec.profileDir) {
        rec.profileError = `the profile at ${rec.profileDir} was not moved to the relaunch: a process of the session survived its teardown`;
        log.warn?.(`[desktop] ${id}: ${rec.profileError}`);
      }
      if (rec.profileDir) await retireProfile(rec, { clean, why: `stopped (${why})` }); // B-bfe6: every part is verified gone — the profile goes with the session IF a person ended it (M.profileRetireVerdict: an idle-out keeps it)
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
  /** int267 seam (the guard-programmatic-not-the-press law): the person's own close — the window's outer ✕ stamps the
   *  record BEFORE it sends close-window, so the exit that answers it is an exit (`quickExitVerdict` asked ⇒ never a
   *  quick exit: the window closes, no notice). A record no longer live is answered as it stands. */
  function closeAsked(id) {
    const rec = store.apps[id];
    if (!rec) throw namedError('not-found', `no desktop app ${id}`);
    if (!M.isLiveState(rec.state)) return view(rec);
    rec.closeAskedAt = now(); rec.closeAskedBy = 'window';
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
  function fitApplies(rec) { return !!rec && rec.state === 'ready' && !stopping.has(rec.id) && (M.keeperFits(M.fitPolicyOf(rec, backends)) || !!pinOf(rec.pin)); } // lane e2b r2: a PINNED window's geometry owner is the keeper on every rung
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
      // lane e2b r2 (the ruling): a PINNED window — the keeper sets the ROOT to the pin first (xrandr), whoever views or leases it;
      // the relay drops every viewer's display/geometry packets meanwhile, so the plan below fits the main window to the pin
      const pin = pinOf(rec.pin);
      // r3 (the ruling): on the per-window rung the desktop size is XPRA's — never fought with xrandr; the stream bridge asks
      // xpra for the pin on every viewer connection, and the keeper only plans the main window to the pin (below)
      const xpraRoot = !!pin && !M.keeperFits(M.fitPolicyOf(rec, backends));
      if (!rec.fb || f.sizeAsked || !belt || slow || (pin && !xpraRoot && (rec.fb.w !== pin.w || rec.fb.h !== pin.h))) {
        let size = await display.displaySize({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv, bins: hf.bins });
        if (!size.ok) return refuse(rec, f, size.why);
        if (pin && !xpraRoot && (size.w !== pin.w || size.h !== pin.h)) { // a keeper-fitted (no-xpra) rung: the keeper's own act on the root
          const rs = await display.setDisplaySize({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv, bins: hf.bins, w: pin.w, h: pin.h });
          if (!rs.ok) return refuse(rec, f, rs.why);
          size = await display.displaySize({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv, bins: hf.bins });
          if (!size.ok) return refuse(rec, f, size.why);
        }
        f.sizeAsked = false;
        if (!rec.fb || rec.fb.w !== size.w || rec.fb.h !== size.h) { rec.fb = { w: size.w, h: size.h, at: t }; changed = true; }
      }
      const tree = await display.windowTree({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv, bins: hf.bins });
      if (!tree.ok) return refuse(rec, f, tree.why, changed);
      // an UNCHANGED tree over an unchanged framebuffer after a settled read: nothing moved — no visibility read, no plan
      if (belt && !changed && f.tree === tree.text && f.settledRuns > 0) { f.settledRuns++; return { ok: true, settled: true, wid: rec.fit && rec.fit.wid, unchanged: true }; }
      const visible = await display.viewableWindows({ hostId, display: rec.display, authFile: xenv.XAUTHORITY, env: xenv, bins: hf.bins });
      // r3: with NO viewer xpra leaves an app's windows UNMAPPED (measured, the LibreOffice in-process repro) — a pinned window
      // on the xpra rung is fitted mapped or not, so the pin holds for a boot / a restore before anybody looks
      const windows = tree.rows.map((r) => ({ ...r, mapped: xpraRoot ? null : visible ? visible.has(r.id) : null }));
      const target = xpraRoot ? { w: pin.w, h: pin.h } : rec.fb; // r3: a pinned window's plan maximises its main window to the PIN
      const plan0 = M.appFitPlan(windows, target, { applied: rec.fit && rec.fit.ok ? rec.fit : null });
      // r3 (measured: the agent's Chrome keeps a SECOND named top-level at its first size, 2033×2284, which the plan only moved
      // to 0,0 — the screenshot's bounding box stayed that size): a pinned window's other top-levels larger than the pin are
      // clamped INTO it, so every pixel the agent is shown is the pin's
      const clamps = xpraRoot && plan0.main ? windows.filter((w) => w.id !== plan0.main.id && (w.depth == null || w.depth === 1) && w.w > 1 && w.h > 1 && (w.w > target.w || w.h > target.h)).map((w) => ({ id: w.id, w: Math.min(w.w, target.w), h: Math.min(w.h, target.h) })) : [];
      // MEASURED (r3, xwininfo -tree): xpra REPARENTS an app's window into its own `Xpra-CorralWindow-<client>` top-level — the plan's
      // main is that corral, and resizing it left the Chrome client inside at its first size; the client is sized to the pin too
      const corral = xpraRoot && plan0.main ? /^Xpra-CorralWindow-(0x[0-9a-f]+)$/i.exec(String(plan0.main.name || '')) : null;
      const client = corral ? tree.rows.find((r) => r.id === parseInt(corral[1], 16)) : null;
      if (client && (client.w !== target.w || client.h !== target.h)) clamps.push({ id: client.id, w: target.w, h: target.h });
      const plan = clamps.length ? { ...plan0, clamps, settled: false } : plan0;
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
      rec.fit = { ok: true, wid: plan.main.id, w: target.w, h: target.h, moved: plan.moves.length, at: t, why, ms: act.ms, via: act.via || null };
      log.log?.(`[desktop] ${id}: fitted ${rec.label}'s window 0x${plan.main.id.toString(16)} ${plan.main.w}x${plan.main.h}+${plan.main.x}+${plan.main.y} → ${target.w}x${target.h}+0+0 (${why}, ${act.ms} ms${act.via === 'wm' ? ', maximised by the window manager' : ''}${plan.moves.length ? `, ${plan.moves.length} other window(s) nudged inside` : ''})`);
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
    if (!M.capsOf(rec, backends).ownsDisplay) { let s = null; try { s = singleton?.(); } catch { s = null; } authFile = (s && s.authFile) || null; }
    else authFile = path.join(logRoot, id, 'Xauthority');
    const base = env();
    return display.x11Env(base, { display: rec.display, authFile: authFile || base.XAUTHORITY });
  }
  function streamTarget(id) {
    const rec = store.apps[id];
    if (!rec) return null;
    if (!M.capsOf(rec, backends).ownsDisplay) { let s = null; try { s = singleton?.(); } catch { s = null; } return s && s.running && rec.state === 'ready' ? { kind: M.streamKindOf(rec, backends), port: s.port, backend: rec.backend } : null; }
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
    const rows = M.capsOf(rec, backends).perWindow ? display.seamlessWindows(r.windows) : r.windows.filter((w) => w.mapped !== false && w.w > 1 && w.h > 1);
    return { ok: true, why: null, windows: rows.map((w) => ({ id: w.id, title: w.name, cls: w.cls, instance: w.instance, x: w.x, y: w.y, w: w.w, h: w.h, mapped: w.mapped, depth: w.depth == null ? null : w.depth, ...(w.frame ? { frame: w.frame } : {}) })) }; // depth 1 = a top-level (P8-2 x4); frame = its xpra corral
  }
  /** Where this machine's xpra ships its html5 client (null = no xpra, or a
   *  build without the www tree) — the hosted-client route's root. */
  async function xpraWww() { const f = await facts(); return (f.xpra && f.xpra.www) || null; }
  /** Every pid a record owns right now — the leaders' sessions (rule 4/5)
   *  plus `extra` (rule 10: the marker-carrying members the sid table lost,
   *  handed in by the tick's ONE census). */
  function sessionPids(rec, extra = []) {
    const own = M.capsOf(rec, backends).ownsDisplay;
    const out = new Set(display.sessionCensus(own ? [rec.pids.app, rec.pids.portal, rec.pids.server, rec.pids.wm, rec.pids.x] : [rec.pids.app])); // `portal`: its chooser is the app's dialog (the tree's pid set)
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
      const own = M.capsOf(rec, backends).ownsDisplay;
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
        // verify r1 (B-04da ④): a LibreOffice session whose display AND app survived is never signalled for its picture
        // server's silence — asked first (its own save prompt); still asking ⇒ kept ready, the person decides (Stop asks)
        if (verdict.state === 'failed' && alive.x && alive.app && M.askCloseVerdict(rec).ask) {
          stopping.add(rec.id);
          let a = null;
          try { a = await askAppToClose(rec); } finally { stopping.delete(rec.id); }
          if (!a.closed) { rec.adoptedAt = now(); rec.lastError = `${verdict.lastError} — kept: LibreOffice may hold unsaved edits (asked to close: ${a.why})`; log.warn?.(`[desktop] ${rec.id} at boot: ${rec.lastError}`); continue; }
        }
        rec.state = verdict.state; rec.lastError = verdict.lastError; rec.endedAt = now();
        log.warn?.(`[desktop] ${rec.id} ${verdict.state} at boot: ${verdict.lastError} — reaping what is left`);
        await teardown(rec, null);
      }
    }
    await reapTerminalLeftovers();
    // B-bfe6: a browser profile whose removal a SIGKILL of this server interrupted (the verdict was written, the rm was not)
    for (const rec of Object.values(store.apps)) if (rec.profileDir && !rec.profileRemovedAt && !rec.profileKept && !rec.keepProfile && !M.isLiveState(rec.state)) await retireProfile(rec, { why: 'boot' }); // the same person-only verdict decides
    pruneHistory();
    commit();
  }
  function pruneHistory() {
    const t = now();
    const done = Object.values(store.apps).filter((r) => !M.isLiveState(r.state)).sort((a, b) => (b.endedAt || b.startedAt) - (a.endedAt || a.startedAt));
    done.forEach((r, i) => { if (i >= HISTORY_KEEP || t - (r.endedAt || r.startedAt) > HISTORY_MAX_AGE_MS) delete store.apps[r.id]; });
  }

  // ── the tick: liveness (adopted sessions have no child handles), the hub's idle verdict, the belt, the resource SAMPLE ──
  async function tick() {
    const t = now();
    const recs = liveRecords();
    const shared = recs.some((r) => !M.capsOf(r, backends).ownsDisplay) ? await singletonLive() : null;
    // rule 10: ONE marker census per tick, and only on a tick where some
    // record is due a resource sample — the sample must see the member that
    // setsid()'d out of every leader's session (measured: a setsid'd `yes`
    // read cpuPct 0 / pids 3 for 12 s through the sid table alone).
    const due = recs.filter((r) => !stopping.has(r.id) && t - (sampledAt.get(r.id) || 0) >= sampleEvery).map((r) => r.id);
    let escapedMap = null;
    const escapedOf = (id) => {
      if (!escapedMap) { try { escapedMap = due.length ? evidenceCensus(due.map((id) => store.apps[id]).filter(Boolean)) : new Map(); } catch (e) { log.warn?.(`[desktop] marker census failed in the tick (${e.message}) — the guard samples the sid table alone this round`); escapedMap = new Map(); } }
      return escapedMap.get(id) || [];
    };
    for (const rec of recs) {
      if (stopping.has(rec.id)) continue;
      const own = M.capsOf(rec, backends).ownsDisplay;
      const handles = children.get(rec.id) || null;
      if (rec.pids.app && !partIsOurs(rec, 'app', handles)) { onPartExit(rec.id, 'app', null, null); continue; }
      if (own && rec.pids.x && !partIsOurs(rec, 'x', handles)) { onPartExit(rec.id, 'x', null, null); continue; }
      if (!own && shared && !shared.running) { onPartExit(rec.id, 'x', null, null); continue; }
      if (rec.state === 'ready') {
        if (typeof H.idle === 'function' && H.idle(rec, t)) continue; // the hub's idle verdict (it stopped the record); a device never decides idle
        // P8-2 x4: the belt — only while settling, while input is recent, while a viewer is connected, or on the slow belt (FIT_SLOW_BELT_MS); an act only when the plan is not settled
        const f = fits.get(rec.id);
        if (fitApplies(rec) && !(f && (f.timer || f.inflight)) && beltDue(rec.id, fitState(rec.id), t)) fitApp(rec.id, 'tick').catch((e) => log.warn?.(`[desktop] ${rec.id}: tick fit failed: ${e.message}`));
        // x5 LOW-2: while a BLOCKED pane exists on the xpra rung, the record keeps the app's own title fresh (rate-limited)
        H.readyTick?.(rec, t);
        drainNotes(rec); // lane app-display-notify-sink: the watch's fallback
      }
      if (t - (sampledAt.get(rec.id) || 0) >= sampleEvery) {
        // rule 5: the whole session set, never one pid — rule 10: plus what left it
        const pids = sessionPids(rec, escapedOf(rec.id));
        // 2026-09-25: the sample is AWAITED (smaps_rollup ≈1.1 ms per pid runs on the libuv pool, never the loop). The
        // slot is claimed BEFORE the await so an overlapping tick never samples the same record twice, and a record a
        // stop claimed meanwhile is left alone (its live row and its verdict belong to nobody now).
        sampledAt.set(rec.id, t);
        const s = pids.length ? await display.sessionSample(pids) : null;
        if (stopping.has(rec.id) || store.apps[rec.id] !== rec || !M.isLiveState(rec.state)) continue;
        samples.set(rec.id, { at: t, sample: s, pids: pids.length });
        // THE REPORT IS THE HUB'S (src/server/desktop-app-keeper.js reportSample — one verdict module, report only, never
        // a stop): in-process it runs HERE, where it always ran; a device keeps the sample for the `status` op
        if (typeof H.onSample === 'function' && H.onSample(rec, s, t, pids)) dirty = true;
      }
    }
    if (dirty) commit();
  }
  function start() {
    if (timer) return;
    timer = setInterval(() => { tick().catch((e) => log.warn?.(`[desktop] tick failed: ${e.message}`)); }, tickMs);
    if (timer.unref) timer.unref();
  }
  /** Timers only — the apps SURVIVE a VibeSpace (or daemon) exit by design. */
  function shutdown() { if (timer) clearInterval(timer); timer = null; for (const id of [...fits.keys()]) clearFit(id); if (dirty) save(); }

  /** MIGRATIONS ONLY (src/server/migrations.js, 2026-09-runaway-parks-void): reshape the IN-MEMORY store and commit
   *  (atomic save + broadcast) — a file edit beside a loaded keeper is overwritten by its next save. */
  function reshapeStore(fn) { const r = fn(store); commit(); return r; }
  /** lane launch-picture-size: the pin's ONE stamp — the launch (a record born pinned) and setPin write the fact here only. */
  function stampPin(rec, pin) { const p = pinOf(pin); if (p) rec.pin = p; else delete rec.pin; return p; }
  /** lane launch-picture-size: the X server's first size — a pinned window on the Xvfb+x11vnc rung (fit 'fixed': its
   *  framebuffer never follows a viewer) is started AT the pin; every other rung starts at the keeper's geometry. */
  function bornGeometry(rec) { const p = pinOf(rec.pin); const pol = M.fitPolicyOf(rec, backends); return p && pol && pol.mode === 'fixed' ? `${p.w}x${p.h}` : geometry; }
  /** lane e2b (design-agent-browser-v2 §E2.2): the record's fact `pin` ({w, h} device px | null = fit the pane) — set
   *  and cleared HERE only, saved + broadcast (commit): the showing clients re-fit in place, a restart restores it, a
   *  relaunch carries it. Who may and the bounds are the caller's verdict (src/desktop-pin.js). */
  function setPin(id, pin) {
    const rec = store.apps[id];
    if (!rec) throw namedError('not-found', `no desktop app ${id} on this machine`);
    const p = stampPin(rec, pin);
    commit();
    // r2 (the ruling): the KEEPER fits X to the pin at once (and at a launch's ready, a restart's adopt, every belt — fitApplies);
    // auto hands the geometry back to the active viewer (today's one-owner rule) — the keeper's fit stops unless its rung fits anyway
    if (p && fitApplies(rec)) scheduleFit(id, `pinned ${p.w}x${p.h}`, 0);
    else if (!p && !M.keeperFits(M.fitPolicyOf(rec, backends))) clearFit(id);
    return get(id);
  }
  /** The latest resource sample of a record (the `status` op; a device's hub judges it). */
  function latestSample(id) { const s = samples.get(id); return s ? { at: s.at, pids: s.pids, sample: s.sample } : null; }
  const isStopping = (id) => stopping.has(id);

  load();
  return { notifications, launch, launchDisplay, relaunch, trustRemoteApp, startDeferred, stop, reshapeStore, setPin, keepAlive, closeAsked, noteInput, noteDesktopSize, setWatchProbe, fitApp, get, list, listApps, liveRecords, streamTarget, x11EnvFor, windows, xpraWww, instancePrefs, facts, installFacts, installState, registry, adoptAll, start, shutdown, tick, sessionPids, apps,
    machineView, commit, markDirty, latestSample, isStopping, backends,
    storeFile, logRoot, STORE_FILE, LOG_DIR, SESSION_ENV, _store: () => store };
}

const STOP_WHYS = Object.freeze(['user', 'idle', 'relaunch']);
const bad = (error) => ({ ok: false, code: 'bad-request', error });
const idOf = (p) => (typeof p.id === 'string' && /^da-[\w-]{1,64}$/.test(p.id) ? p.id : null);

/**
 * Run ONE op on install()'s handle. Shapes (every failure `{ok:false, code, error}`, never a throw):
 *   facts      {fresh?, install?}                     → {ok, facts, install?} (install: the install rung's facts — lane C2)
 *              {installState: true}                   → {ok, installState} (the install slot only — verify r2; nothing probed)
 *   list       {settings?}                            → {ok, apps, registry, availability, cap, idleTimeoutMin}
 *   launch     {body, settings?, scaleChoice?, replacing?} → {ok, app}
 *              (lane D: `body.scaleChoice` = the app's default scale from the launch dialog, origin 'app' — a field of the
 *              launch REQUEST, validated like every other; the op's own `scaleChoice` = a relaunch's pick, origin 'chosen')
 *   stop       {id, why?, force?}                     → {ok, app}  (B-04da ④: refused `app-asked` while LibreOffice asks)
 *   status     {id?}                                  → {ok, app, sample} | {ok, apps, samples}
 *   windows    {id}                                   → {ok, windows}
 *   fit        {id, w?, h?}                           → {ok, fit} (w×h = a client asked the display that size)
 *   keep-alive {id}                                   → {ok, app}
 *   relaunch   {id, body, settings?}                  → {ok, app, replaced}
 *   app-status / app-plan / app-install / app-remove / app-refresh / app-adopt-drift — Layer 0 apps (src/app-serve.js
 *              runAppOp: the plan as the user, the RECORD after the package slot ran; the hub asks a daemon only when
 *              its hello-ack names `app-install`)
 */
async function runDesktopServeOp(ds, action, params = {}) {
  const op = String(action || '');
  if (!DESKTOP_SERVE_OPS.includes(op)) return bad(`unknown desktop-serve op ${JSON.stringify(op)} — one of ${DESKTOP_SERVE_OPS.join(', ')}`);
  if (!ds || typeof ds.launch !== 'function') return { ok: false, code: 'host_unavailable', error: 'the desktop-serve machine keeper is not installed on this machine' };
  if (AS.APP_OPS.includes(op)) return AS.runAppOp(ds.apps, op, params); // Layer 0 apps: the machine half's own table (src/app-serve.js)
  const p = params && typeof params === 'object' ? params : {};
  const settings = p.settings && typeof p.settings === 'object' ? p.settings : null;
  const needId = () => { const id = idOf(p); if (!id) return null; return id; };
  try {
    if (op === 'facts') {
      if (p.installState === true) return { ok: true, installState: typeof ds.installState === 'function' ? await ds.installState() : null };
      const facts = await ds.facts({ fresh: p.fresh === true || p.install === true });
      if (p.install !== true) return { ok: true, facts };
      return { ok: true, facts, install: typeof ds.installFacts === 'function' ? await ds.installFacts() : null };
    }
    if (op === 'list') return { ok: true, ...(await ds.list({ ...(settings ? { settings } : {}), ...(p.witness === 'recheck' ? { witness: 'recheck' } : {}) })) };
    if (op === 'launch') {
      if (!p.body || typeof p.body !== 'object') return bad('launch needs a `body` (the launch request)');
      const opts = {};
      if (settings) opts.settings = settings;
      if (p.scaleChoice != null) opts.scaleChoice = p.scaleChoice;
      if (typeof p.replacing === 'string') opts.replacing = p.replacing;
      return { ok: true, app: await ds.launch(p.body, opts) };
    }
    if (op === 'status' && p.id == null) {
      const apps = ds.listApps();
      const samples = {};
      for (const a of apps) { const s = ds.latestSample(a.id); if (s) samples[a.id] = s; }
      return { ok: true, apps, samples };
    }
    const id = needId();
    if (!id) return bad(`${op} needs a desktop app id (da-…), got ${JSON.stringify(p.id)}`);
    if (!ds.get(id)) return { ok: false, code: 'not-found', error: `no desktop app ${id} on this machine` };
    if (op === 'status') return { ok: true, app: ds.get(id), sample: ds.latestSample(id) };
    if (op === 'stop') return { ok: true, app: await ds.stop(id, { why: STOP_WHYS.includes(p.why) ? p.why : 'user', force: p.force === true }) }; // B-04da ④: `force` = the person confirmed the loss
    if (op === 'keep-alive') return { ok: true, app: ds.keepAlive(id) };
    if (op === 'close-asked') return { ok: true, app: ds.closeAsked(id) }; // int267 seam: the person's ✕ asked the app (never a quick exit)
    if (op === 'pin') { const v = parsePin(p.pin); return v.ok ? { ok: true, app: ds.setPin(id, v.pin) } : bad(v.error); } // lane e2b: a paired machine's window pinned by the hub's verdict
    if (op === 'windows') {
      const r = await ds.windows(id);
      return r && r.ok ? { ok: true, windows: r.windows } : { ok: false, code: 'no_windows', error: (r && r.why) || 'the window census failed', windows: [] };
    }
    if (op === 'fit') {
      const w = Number(p.w), h = Number(p.h);
      if (p.w != null || p.h != null) {
        if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= 16384 && h <= 16384)) return bad(`fit needs a positive integer w×h, got ${JSON.stringify([p.w, p.h])}`);
        ds.noteDesktopSize(id, w, h);
        return { ok: true, fit: { scheduled: true } };
      }
      return { ok: true, fit: await ds.fitApp(id, 'hub') };
    }
    // relaunch
    return { ok: true, ...(await ds.relaunch(id, p.body || {}, { settings })) };
  } catch (e) {
    return { ok: false, code: (e && e.code) || 'op_failed', error: String((e && e.message) || e) };
  }
}

module.exports = { install, runDesktopServeOp, DESKTOP_SERVE_OPS, SETTING_KEYS, settingsReader, STORE_FILE, LOG_DIR, TICK_MS, STOP_GRACE_MS, ASK_CLOSE_MS, RFB_DEADLINE_MS, SETTLE_BRINGUP_MS, SESSION_ENV, FIT_DEBOUNCE_MS, FIT_FIRST_STEP_MS, FIT_FIRST_WINDOW_MS, FIT_REFUSED_RETRY_MS, FIT_SETTLE_RUNS, FIT_ACTIVE_MS, FIT_SLOW_BELT_MS, EXIT_CENSUS_MS, HISTORY_KEEP, PARTS };
