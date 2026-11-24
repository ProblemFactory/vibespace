'use strict';
/**
 * THE BROWSER PROFILE REGISTRY, ITS LEASES AND THE KEEPER OF ITS BROWSERS —
 * ORCH (docs/design-agent-browser-v2.zh.md §3.3 / §3.4 / §3.5, phase P1).
 *
 * WHAT THIS OWNS. `data/browser-profiles.json` (writeJsonAtomic, 0600 — a
 * profile may carry a credentialed proxy URL; broadcast `browser-profiles-
 * updated` on every commit, the multi-client law), the LEASES on it (one per
 * (profile, browserKey) — the tab a conversation holds in a profile's browser,
 * §3.4), the BROWSER records (one running `agent-browser` daemon per profile,
 * reuse-or-spawn, adopted across a restart), the concurrency ceiling and the
 * resource REPORT from src/keeper-limits.js (the ONE constants home every keeper
 * shares), and the conversation's PIN (browserKey → profile, §3.2.5 — the fact
 * the spawn path reads for the `conversation` rung).
 *
 * THE DECISIONS ARE PURE (src/browser-profiles.js) and the machine facts are
 * SHARED (src/browser-facts.js); this file touches things. Modelled on
 * src/opencode-serve.js / the desktop-app keeper, whose scar tissue is
 * inherited rather than re-earned:
 *   · LAZY — no timer, no socket, no fs handle until a profile is attached.
 *   · BOOT RECONCILIATION BEFORE ANYTHING IS KEPT ALIVE (§3.5): every lease
 *     whose browser key no live session carries is dropped FIRST (logged by
 *     key and reason), then each recorded browser is adopted by pid AND
 *     starttime plus the CLI's own `session info` — an unproven pid is never
 *     signalled, a gone one is recorded ended.
 *   · THE KEEPER OWNS THE IDLE CLOCK: a profile browser is launched with the
 *     CLI's own timeout at 0 and this tick stops it once its LAST lease has
 *     been gone for `browser.idleTimeoutMs` — so a lease that drops and comes
 *     back (a Terminate → Resume) never costs a cold browser, and a lease on
 *     disk can never keep a chromium open with nothing to collect it.
 *   · CEILING: a start past `CONCURRENT_CAP` is refused, naming the holders.
 *   · RESOURCES, REPORTED — NEVER A STOP (the owner's 2026-09-25 ruling: a
 *     browser a person or an agent is using is not ended by a resource
 *     guard; Chrome legitimately passes any fixed ceiling): one /proc sample
 *     per GUARD_SAMPLE_MS over the daemon's tree, memory = ΣPss (never a sum
 *     of VmRSS), provider-scaled thresholds judged by src/runaway-guard.js;
 *     OVER ⇒ the live row names it, a server notice when a crossing begins
 *     (r2: hysteresis + an hourly floor + re-sent when nobody received it —
 *     runaway-guard.reportTransition), telemetry `browser-resource`. No stop, no
 *     park (the pre-2026-09-25 `runawayParkedUntil` is gone), no directory
 *     touched — the headless OpenCode serve is the only keeper that stops.
 *   · STOP = the CLI's own `close --all` under that namespace, then the
 *     recorded pid signalled ONLY when pid+starttime prove it is ours.
 *   · SPAWN HYGIENE: the sanitised base env, secrets never on argv (the proxy
 *     rides the profile's own config, P1 passes none).
 *   · THE MANAGED EPHEMERAL BROWSER (takeover C3, design-browser-takeover §5):
 *     a conversation's first page verb with no attachment gets a record of
 *     its own (`ensureEphemeral`: `ephemeral:true`, owned by the conversation,
 *     ns `vs-<browserKey>`, ONE lease aliased `ephemeral` that is never an
 *     attachment) started under EXACTLY the session's spawn pairs — never a
 *     re-run of the ladder. It counts against the ceiling (`browser_cap`),
 *     the resource report samples it, an idle-out is `stopped` (not an error),
 *     a restart adopts it, and when no live session carries its key any more
 *     the lease drops, the browser stops and the RECORD IS REMOVED BY ITSELF
 *     (a named profile never is). It emits no lease events: the live view,
 *     the takeover key and the trace scope stay the `ephemeral` ones.
 */
const fs = require('fs');
const i18nKey = (s) => s; // the extraction marker (scripts/i18n-extract.mjs): a notice's words, worded by the client with t(key) — r4130
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const B = require('../browser-profiles.js');
const SR = require('../store-read.js');   // the remainder of B-f276 (bl-jobs): a registry read that FAILED is no answer — HELD, never written over
const STH = require('../store-read-hold.js');   // r3261: the takeover requests through the tree's ONE hold
/** a registry the store-read law calls data: a plain object with its profiles list (a parse that is not one is CORRUPT — it was a silent
 *  EMPTY registry, then written over the file) */
const REG_VALID = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.profiles);
const GS = require('./grants-store.js'); // lane grants-unify: "Who can use it" is a row of the ONE grants store
const KEEPER_MAKE_SAY_MS = 60 * 1000; // B-e674 follow (r694 (4)): a keeper create in flight longer than this is said once in the journal
const BIdle = require('../browser-idle.js'); // lane browser-swiftshader-cpu: a browser nobody watches and nobody drives paints nothing
const J = require('../browser-job-principal.js'); // lane jobs-browser: a Background Work job's browser handle + its release rule
const SW = require('../browser-switch.js');
const F = require('../browser-facts.js');
const T = require('../browser-takeover.js');
const BF = require('../browser-fact.js'); // lane S2: THE browser fact (one answer per conversation) + the delete's refuse-or-warn
const M = require('../browser-mediation.js'); // P6: the per-session url + env of a MEDIATED lease
const TQ = require('../browser-takeover-request.js'); // lane browser-takeover-queue: a request for a human is a RECORD (one per lease, written here)
const INT = require('../browser-interrupt.js'); // the owner's ruling (2026-09-27): a takeover interrupts, tells, and the handback reminds
const VERBS = require('../browser-verbs.js'); // takeover r3: the ONE config rule (sanctionedConfig)
const GR = require('../browser-gone-record.js'); // B-346d's recorder (r1228): THE one journal record at «daemon gone» (PURE)
const SL = require('./signal-ledger.js'); // B-346d's recorder (c): the hub's own signals, one small ledger a pid
const BS = require('../browser-stuck.js'); // lane browser-unresponsive: THE hung-browser verdict (PURE) + its words
const LIMITS = require('../keeper-limits.js');
const RG = require('../runaway-guard.js'); // the ONE resource verdict + per-provider numbers + report level (2026-09-25: report only)
const O = require('../browser-orphans.js'); // lane daemon-orphan-end: a daemon nobody holds — THE verdict (PURE)
const HM = require('../browser-human.js'); // BROWSE YOURSELF (B-6ae8): the user as one more holder on his own tab
const DSP = require('../browser-display.js'); // lane headless-fallback: headed is a preference, the display is a fact (PURE)
const HC = require('../hidden-chars.js'); // lane browser-propose: a proposal card's words carry no character that is not drawn (THE one set)
const KB = require('../browser-kept.js'); // lane browser-resume (§3.9): the conversation's KEPT browser — tabs, D2's restore kind (PURE)
const BB = require('../browser-builds.js');
const ENV = require('../browser-environment.js'); // B-9584: a profile's own environment — the contract (U1): one resolve per start
const GH = require('./browser-geo-hold.js'); // B-9584 U2c: a stock profile's place (or «blocked») held on its browser — road B
const ENG = require('../browser-engines.js'); // lane engine-plugin: PURE — an engine plugin's verdicts, its launch env view, the default policy
const BE = require('../browser-stderr.js'); // lane browser-stderr-pipe: the quiet log switches + the stderr-pipe-full verdict
const CL = require('../browser-clone.js'); // lane browser-profile-clone (B-9669): New profile… copied from a stopped profile — the PURE tables + verdict
const CR = require('./browser-clone-run.js'); // … and its copy, off the event loop (atomic: <dir>.copying renamed at the end)
const BI = require('./browser-installs.js'); // rv-browser F7 (lane dc-browser-installs): THE install slot + one row per installable // lane browser-admin 2a: which Chrome build a profile runs (the machine's list + the ONE verdict)
const CDP = require('../cdp-census.js'); // lane chrome-builds-download: a version's relation to the CDP census, said on its row before the download
const WIN = require('../browser-windows.js'); // lane browser-windows: a window per holder — the measured placement, the window mates, the cap setting (PURE)
const TBS = require('../browser-tabs.js'); // lane browser-resume C (§3.9, ruling 3): whose tab it is — the agent's own tab verbs, the user's tab row (PURE)
const AT = require('../browser-attach.js'); // lane one-browser-b1: THE ATTACH ROAD — the argv, the port file, the socket dir per config, the road (PURE)
const ATL = require('./browser-attach-launch.js'); // lane one-browser-b1: …its I/O half (the executable, the socket dir, the spawn + the port poll)
const DA = require('../desktop-apps.js'); // lane one-browser-b1: the desktop keeper's display-only kind (isDisplayForBrowser)
const PIC = require('../browser-picture.js'); // lane browser-x-in-window (B2): THE PICTURE SWITCH — the source verdict, the holder's X window, Chrome's own dialog windows (PURE)

const STORE_FILE = 'browser-profiles.json';
const AUDIT_FILE = 'browser-audit.jsonl';
const TICK_MS = 5000;
const STOP_GRACE_MS = 3000;
/** Lane H: the longest a verb waits for the lease seam's listeners (the action-trace recorder arming its tap). */
const ARM_WAIT_MS = 3000;
/** verify r2 (B5): a Change build… whose new build closes this soon after the change FALLS BACK to the build it replaced —
 *  a build that launches and then dies within seconds (measured: one wrapped to die at 3 s was healed three times in its
 *  own daemon, then browser_unstable — the conversation told only "changed", the choice left on the dead build). Long
 *  enough for the keeper's tick (5 s) to see the loss; a browser that ran past it closes like any other (the heal). */
const CHANGE_SETTLE_MS = 30000;
/** VERIFY r1 L2: what a detach of a conversation's managed ephemeral browser does, said to the agent (and the UI). */
const EPHEMERAL_DETACH_NOTE = 'this conversation\'s own browser (its managed ephemeral) is stopped now and its record removed — its open pages close; the next browser command starts it again';
const FILE_MODE = 0o600;
/** The telemetry event of a resource crossing (report only — it was
 *  `browser-runaway` while the guard stopped and parked, until 2026-09-25). */
const RESOURCE_METRIC = 'browser-resource';

function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: FILE_MODE });
  fs.renameSync(tmp, file);
}
/** keeper-sweep-yields F5: a piece of the orphan walk — at most one registry write and one broadcast per this much of the REAL clock (and at its end). */
const SWEEP_PIECE_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const namedError = (code, msg, extra = {}) => { const e = new Error(msg); e.code = code; Object.assign(e, extra); return e; };
/** THE LAUNCH RECORD ON DISK BEFORE CHROME (the census cure, 主开发 2026-11-19 08:56Z — the hunt's finding 6): a launch stamps THIS
 *  machine's name on the record (stampLaunchHost — the lineage the next start reads to judge the profile's lock) and lands it
 *  synchronously (commitSync, under the writer's bound) before Chrome writes its lock into the folder; not landed ⇒ refused by name,
 *  nothing started (a kill after Chrome's lock and before the record would leave a lock the next pod on another name refuses) */
const LAUNCH_NOT_ON_DISK = 'its launch record (this machine\'s name on the profile, which the next start reads to judge the profile\'s lock) is not on disk yet — the storage has not written it, so nothing was started; try again in a moment';

let installed = null;
/** The ONE keeper of this process (ws-create asks for the conversation's pin
 *  lazily, so the ws ctx contract stays untouched). null before wiring. */
function keeper() { return installed; }

/**
 * @param {object} deps
 *   dataDir        — the instance's data/
 *   homeDir        — where `~/.agent-browser/vs-bp-<id>` profile dirs live
 *   env            — () => sanitised base env (ws-handler.agentEnv), NEVER process.env
 *   broadcast      — (msg) => void  (`browser-profiles-updated`)
 *   serverSetting  — (key) => value (browser.idleTimeoutMs / browser.headed / browser.defaultProfile)
 *   serverNotice   — (key, text, opts) => number (resource-crossing / ceiling notices; the clients reached — 0 ⇒ re-sent)
 *   userTodos      — the For-you store (lane H verify r5: the ONE notice when a profile's browser keeps closing — origin browser)
 *   getTelemetry   — () => telemetry | null
 *   liveKeys       — () => Set of the browser keys live sessions carry (activeSessions)
 *   remoteKeys     — () => Set of the keys carried by live sessions on ANOTHER machine (an ssh host, a paired device — rung H):
 *                    never admitted, never added to a list (identity verify r2, 2026-09-28); default none
 *   facts / runtime / limits / log / now / tickMs / guardSampleMs — injectable for the gate
 */
function create({ unreadRetry = null /* the B-f276 remainder: {firstMs, maxMs} of the held registry's read again (a suite's fast clock) */, geoHold = null /* B-9584 U2c: the place hold's maker ({log, now, onEvent}) ⇒ src/server/browser-geo-hold.js create — a suite's stand-in */, dataDir, homeDir = os.homedir(), env = () => ({}), broadcast = null, serverSetting = () => undefined, proxyLogins = null /* B-8b87: src/server/browser-proxy-logins.js — a profile proxy's login, read by the forwarder alone */,
  // B-7a30 unit 1': the CLI judge's one file check (injectable: the gate PLACES a stall in it), the doors' bound, the re-judge period
  cliFileFact = null, cliActMs = 5 * 1000, cliEveryMs = 10 * 1000,
  serverNotice = null, getTelemetry = () => null, liveKeys: sessionLiveKeys = () => new Set(), remoteKeys = () => new Set(), userTodos = null,
  oomEventsPath = null, // B-346d's recorder (d): the hub unit's cgroup memory.events (default: read off /proc/self/cgroup; a stand-in file in the fast gate)
  stderrPipeProbe = null, // lane browser-stderr-pipe: the /proc facts of a hung Chrome (default BE.probeStderrPipe; a fixture in the fast gate)
  tailnet = null, // lane tailnet-names: the tailnet door ({launch, missFor} — default the hub's shared one, src/server/tailnet-door.js)
  // lane jobs-browser (B-dbc1): is this Background Work job's run alive (state starting | up)? A running job CARRIES its
  // browser handle (src/browser-job-principal.js), so its lease outlives its owner conversation until the job ends
  jobRunning = () => false,
  // B-f276 family unit 2 (主开发 r3115): the settings store HELD? (the hub's persistence router) — the CLI pin is never computed from
  // a setting it could not read
  settingsHeld = () => null,
  jobName = () => null, // accept-fixes-strip F8: a Background Work job's name (the live view names a job's tab by it)
  facts = null, runtime = null, limits = LIMITS, log = console, now = Date.now, tickMs = TICK_MS, guardSampleMs = null, install = true, answerAskMs = null, /* lane browser-unresponsive: the gate's bound of one ask */
  probeLadder = null, // B-0b8c (lane browser-probe-transient): the gate's `{retryMs, timeoutMs, timers}` for the version probe's ladder (production: F.PROBE_RETRY_MS / F.PROBE_TIMEOUT_MS)
  // lane H: how long a verb waits for the lease seam's listeners (the recorder ARMING its tap) before it runs
  armWaitMs = ARM_WAIT_MS,
  askWaitMs = null, // lane browser-takeover-queue: how long ONE agent verb waits for the person (the gate's short one; production: the PURE module's WAIT_MS)
  daemonTable = null, endIdentity = null, orphanScanMs = O.SCAN_MS, /* lane daemon-orphan-end: the gate's process table (rows) + ending seam */
  pageAsk = null, pageAnswerMs = null, browserEndedMs = O.BROWSER_ENDED_MS, /* lane browser-daemon-survives-update: the gate's page ask (default browser-viewport pageAnswers), its bound, the ended-browser bound */
  taskGroupDefault = null, access = null, hostKnown = null,
  vncDisplay = null, // B-d635 (lane browser-reliability): VibeSpace's own VNC desktop display the probe also looks at (the server wiring names it)
  // P4 second half (§7.4 / §7.5): the integration store (a handle or a
  // getter) the key consumer resolves through; `keys` = src/server/browser-
  // backend.js's `{keyFor, sourceOf}` (built here over `integrations` when
  // not injected); `providers` = `{row, control}` overriding the PURE table
  // (a gate drives a world of its own rows)
  integrations = null, keys = null, providers = null,
  // where the egress proxies connect an ADMITTED name (identity in production; a gate maps a reserved `.test` host to a
  // loopback target so an admitted CONNECT never leaves the machine)
  egressResolve = null,
  // lane chrome-builds-download: where the build download's ONE fetch connects an ADMITTED url (identity in production; the gate
  // maps the two Chrome for Testing names to a loopback fake — the verdict is always taken on the name, before the request)
  chromeBuildsResolve = null,
  // P6 (§6.2 / §6.5 / D6): the CDP-mediating proxy (src/server/cdp-mediator.js)
  // — its presence is what makes `sharing:"instance"` a value; a MEDIATED
  // lease is handed its own scoped url instead of the profile's directory
  mediator = null,
  // takeover C3 (D2): the COUNT SEAM — the holders another keeper reports
  // against the shared CONCURRENT_CAP (the desktop-app keeper's live apps,
  // `[{label, kind}]`); wired late by server.js through `setOtherHolders`
  otherHolders = null,
  // lane one-browser-b1 (design q-026 §2.1 B1): THE DISPLAY KEEPER (src/server/desktop-app-keeper.js, or a gate's fake with
  // the same five methods: facts / launchDisplay / x11EnvFor / stop / liveRecords) — a browser on the attach road runs on a
  // display-only session it opens; wired late by server.js through `setDisplaySessions`. Absent ⇒ every launch is the
  // driver road. `attachSocketBase` = the short root of the per-config socket dirs (production B.SOCKET_DIR_BASE).
  displaySessions = null, attachSocketBase = null,
  // MULTIVIEW D4 / B-325a (docs/design-browser-multiview.zh.md): what the
  // keeper may ask about a CONVERSATION (its parent browser key) — `{turn}`:
  // the turn of the session carrying it ('idle'|'running'|'waiting', null =
  // unknown ⇒ nothing is released). Absent ⇒ no release.
  conversationFacts = null,
  // MULTIVIEW D4 (lane P verify, finding 5): the Task Group's default
  // per-conversation cap FOR A CREATE (`{cwd, initialGroupId, sessionKey}` →
  // 1..6 | null), asked once when a conversation STARTS (`stampGroupCap`) —
  // the browserProfileId precedent: a default is where a session starts,
  // never a retroactive edit of a running one. Absent ⇒ no group rung.
  taskGroupCap = null,
  // B-55dc THE DECIDING DOOR on the spawn road: (facts) → a promise of the Task Group store's first reads for these create
  // facts (bounded), or null when nothing is left to read — ws-create awaits it BEFORE the two synchronous reads above
  taskGroupRead = null,
  // "Who can use it" is a LIST (2026-09-27): the Task Groups a conversation belongs to NOW, by its browser key (the task
  // store's own live rule, `groupsForSession`, over the live session carrying it) → `{ids, unreadable}` — asked by the
  // PATCH's re-judge of every lease and by the pick that writes the list; and one Task Group's facts → `{title,
  // archived}` | null (a store that no longer lists it) — the write's `unknown_task` and the panel's words. Absent ⇒ no
  // Task Group admits anyone the keeper judges itself (the routes hand their own taskIds to attach).
  taskIdsForKey = null, taskInfo = null,
  groupNameOf = null,   // the chain's cure (B): a group id → its belted name (tasks.lineageNameOf) for the lineage words
  groupLineageOf = null,   // lane lg-group-parents U3b: (own Task Group ids) → their ancestors (tasks.grantGroupsOf — the ONE reader)
  // lane grants-unify (2026-10-23): "Who can use it" is a ROW of the ONE grants store (door `browser-profile`) — `grants` =
  // the store (or a getter; absent ⇒ the store of this data dir); a conversation is named there by its conversation id, so
  // the keeper maps a browser key to the conversation keys it answers to (`conversationKeysForKey(bk)` → {keys, live}) and
  // a conversation to its browser key for the panel (`browserKeyForConversation(cid)` → bk | null). Absent ⇒ a key is its
  // own caller only (every conversation may ⇒ it may; a named conversation never matches).
  grants = null, conversationKeysForKey = null, browserKeyForConversation = null,
  // BROWSE YOURSELF verify r1 (H6): the browser's page targets with their OPENER (CDP Target.getTargets over the keeper
  // browser's own endpoint) — what the user's own tabs are derived from; injectable for the gate (a fake has no CDP)
  readTargets = null,
  // lane browser-windows (U1): the window a holder's tab opens in — `(cdpUrl, {url}) → {ok, targetId, windowId}` over the
  // keeper browser's own endpoint (browser-viewport.openWindow); injectable for the gate (a fake has no CDP)
  openWindow: openWindowFn = null, closeTarget: closeTargetFn = null, openTabInWindow: openInWindowFn = null, windowOf: windowOfFn = null, openTabByActivate: activateFn = null, // verify r2 T1: rung 2 of a later tab (browser-viewport.openTabByActivate)
  markSayMs = null, // B-e674 follow (r694 (4)): how long a keeper create may stay in flight before ONE journal line says so (KEEPER_MAKE_SAY_MS; a gate's fast clock)
  visibilityOf: visibilityOfFn = null, // B-e674 unit 1: is a named tab visible — `(cdpUrl, targetId) → {ok, visibility}` (browser-viewport.visibilityOf); injectable for the gate
  // lane engine-plugin (design-custom-browser-plugin §1): THE ENGINE REGISTRY (src/server/browser-engines.js, or a getter) — a
  // profile whose `browser` is {kind:'plugin', id} runs that engine's kernel (its probe + launch options asked at each launch,
  // inside the in-flight start); `fleetFacts` = the presets' fleet.json facts (a getter → {browserEngine?} | null) the default
  // policy `browser.defaultEngine` reads. Absent ⇒ no engine (a plugin choice refused by name, browser_engine_missing) and
  // the policy is the user's own value or 'default'.
  engines = null, fleetFacts = null,
  // lane engine-distribution (P4): THE KERNEL'S DISTRIBUTION (src/server/engine-distribution.js, or a getter) — the kernel
  // downloaded into its place with a receipt, the version MEASURED once (`--version`) before the first launch, the engine
  // record's facts. Absent ⇒ a kernel is whatever was placed by hand, its version the plugin's word.
  engineDistribution = null,
  // lane browser-resume (§3.9, the owner's ruling 1): THE KEPT STORE (src/server/browser-kept.js, or a getter) — a
  // conversation's own browser's logins directory + its tabs survive the browser's stop; the keeper is its ONE feeder
  // (start / stop / the live tab list / a deliberate close). Absent ⇒ nothing is kept (today's ephemerality).
  kept = null,
  // verify r1 (F8, lane browser-admin): the wall clock of ONE step of THE install slot (default 15 min; injectable for the gate)
  installTimeoutMs = null } = {}) {
  const folderNotices = new Map();   // B-0645 cure: profileId → {id, rec} — the For-you notice of a download folder not confirmed put back (at the top: emitLease ends one at any time)
  if (!dataDir) throw new Error('browser-keeper: dataDir is required');
  const storeFile = path.join(dataDir, STORE_FILE);
  // lane lg-store-writes (B-0248 U5b): the registry's bytes go through THE STORE WRITER, keyed by the resolved path (browser-env
  // asks the writer for the same file before it reads it)
  const storeKey = path.resolve(storeFile);
  const writerOf = () => require('../store-writer.js').storeWriter();
  const grantsOf = typeof grants === 'function' ? grants : () => grants || GS.forDir(dataDir);
  // ONE base environment for the probe, the runtime and the socket-root answer
  // (r2): the root a command lands under is computed from exactly what the
  // runtime launches and probes with
  const rtEnv = env() || {};
  // lane browser-admin 2b: the browser CLI VibeSpace drives — the PINNED install first when `browser.cli` asks for it (the
  // keeper's in-memory answer, `cliPinPath`; never an fs read per call), else PATH; `bfPath` = the PATH binary alone (the
  // panel's "on PATH" fact)
  const pinnedCli = () => { try { return cliPinPath(); } catch { return null; } };
  // B-0b8c: THESE facts decide the act (pinTab, the installs page, the digest), so THEY carry the retry ladder — one failed
  // probe is a state that asks again (5 s → 15 s → 45 s → 2 min → 10 min), never a verdict (`bfPath` stays one-shot)
  const ladderOf = { retryMs: F.PROBE_RETRY_MS, timeoutMs: F.PROBE_TIMEOUT_MS, ...(probeLadder || {}) };
  const bf = facts || F.createBrowserFacts({ env: rtEnv, pinned: pinnedCli, retryMs: ladderOf.retryMs, timeoutMs: ladderOf.timeoutMs, timers: ladderOf.timers || null });
  const bfPath = F.createBrowserFacts({ env: rtEnv });
  // lane browser-resource-care: the daemon's TMPDIR = data/browser-env/tmp (browser-env.js TMP_DIR — the same verdict: the
  // keeper requires nothing of that module), so its ephemeral profiles and Xvfb auth files stay off the RAM-backed /tmp
  let daemonTmpMade = null; // made ONCE (data/ may be a network mount — never an mkdir per CLI call)
  const daemonTmp = () => { if (daemonTmpMade) return daemonTmpMade; const d = F.makeBrowserTmpDir({ dataDir, log }); if (d) daemonTmpMade = d; return d; }; // lane browser-tmpdir-socket-length: only while Chrome's socket fits, else a short /var/tmp root
  const rt = configured(runtime || F.createBrowserRuntime({ env: rtEnv, log, pinned: pinnedCli, tmpDir: daemonTmp }));
  /**
   * takeover r3 (finding 2): THE CONFIG IS NAMED, NEVER SEARCHED. Without
   * AGENT_BROWSER_CONFIG the binary searches `~/.agent-browser/config.json`
   * and then `./agent-browser.json` in the directory it runs from — this
   * process's cwd — and the launch keys of whatever it finds ride every
   * command (measured: a later command RELAUNCHES the browser with them). So
   * every call this keeper makes names a config: the one the browser's own
   * pairs carry (a rung-D ephemeral / child browser's generated config), else
   * the keeper's own file for the kind — `machine.json` for a profile browser
   * (the user file by the one rule, `VERBS.sanctionedConfig`: the machine's
   * own configuration minus the raw-CDP keys and the raw-debugging / user-
   * data-dir switches in `args`) or `machine-ephemeral.json` for an ephemeral
   * browser without one (the same, composed like rung D's: EPHEMERAL_DENY
   * dropped). `/resolve` names the SAME file to the CLI (`configFileFor`), so
   * a sanctioned command never differs from its browser's launch and never
   * reads a project file. A file that cannot be written (or a user file that
   * does not parse — the CLI would refuse it too) leaves the call as it was,
   * said once in the journal.
   */
  function configured(r) {
    // verify r2 (H1): every call also runs THE BROWSER'S OWN CLI (`cliOptOf` — the version its daemon runs), never the
    // current `browser.cli` when they differ; a caller that names one (`o.cli`) keeps it
    // (`session info` never restarts a daemon of another version — measured — so a browser whose CLI is gone is still ASKED
    // with the current one: its liveness / adoption reads keep working; every other call is refused by name)
    const add = async (ns, o, m) => {
      const opts = attachOpts(ns, o) || withConfig(ns, o, m);
      if (opts.cli) return opts;
      // verify r3 (Y1): a binary never asked its version is ASKED before the call is judged (cliOptReady) — a same-version
      // re-install at the same path used to be refused once, "no longer installed"
      const c = await cliOptReady(browserRecordForCall(ns, opts.extraEnv && typeof opts.extraEnv === 'object' ? opts.extraEnv : {}));
      if (!c || ((c.gone || c.unconfirmed) && m === 'info')) return opts; // B-7a30: an `info` read never restarts a daemon — it goes on
      return { ...opts, cli: c };
    };
    // lane one-browser-b1: a call in the namespace of a browser on the ATTACH road (the keeper's own session or a lease's) —
    // `--cdp <its ws url>` in the config's own socket root (AT.attachCall, in the runtime), never the profile directory and
    // never the LAUNCH file: the lease file. Both are the VALUES the agent's own commands carry (its pairs' AGENT_BROWSER_CDP,
    // /resolve's config) — measured: another endpoint spelling re-launches the session's connection, another config ends
    // its stream (src/browser-attach.js)
    const attachOpts = (ns, o) => {
      const rec = ns && String(ns).startsWith('vs-') ? recordFor(String(ns).slice(3)) : null;
      if (!rec || rec.launch !== 'attach' || !B.isLoopbackCdpUrl(rec.cdpUrl)) return null;
      const opts = o && typeof o === 'object' ? o : {};
      const ex = opts.extraEnv && typeof opts.extraEnv === 'object' ? opts.extraEnv : {};
      const file = machineConfigFile('machine');
      // lane browser-shared-profile-freeze: a lease session's call names ITS url (leaseCliOpts — the scope road's own), never the raw one
      const cdp = typeof ex.AGENT_BROWSER_CDP === 'string' && B.isLoopbackCdpUrl(ex.AGENT_BROWSER_CDP) ? ex.AGENT_BROWSER_CDP : rec.cdpUrl;
      return { ...opts, dir: null, attach: { cdp, socketDir: rec.socketDir || null }, extraEnv: { ...ex, ...(file ? { [VERBS.CONFIG_KEY]: file } : {}) } };
    };
    // B-8b87 round 3: a TEARDOWN or a READ opens no page — the close-all of a stop and the session info of an adoption never need the
    // proxy's switch, so when the config that carries it cannot be produced they keep the base file (said in the journal) and the
    // stop goes on to its identity-checked ladder, the adoption keeps its record; every other call stays refused by name
    const NO_PAGE_CALLS = new Set(['closeAll', 'info']);
    const withConfig = (ns, o, m = null) => {
      const opts = o && typeof o === 'object' ? o : {};
      const ex = opts.extraEnv && typeof opts.extraEnv === 'object' ? opts.extraEnv : {};
      // lane headless-fallback: every call of a browser whose LAUNCH fell back names the planned config (displayed)
      if (Object.prototype.hasOwnProperty.call(ex, VERBS.CONFIG_KEY)) return displayed(opts, ex, ex[VERBS.CONFIG_KEY], recordForCall(ns, opts.session || null, ex), m);
      const file = configForCall(ns, opts.session || null, ex);
      if (file) return displayed(opts, ex, file, recordForCall(ns, opts.session || null, ex), m);
      // B-8b87 cure: a record whose browser rides its profile's proxy and NO config file to carry the switch ⇒ refused by name (the
      // call would leave direct)
      const r0 = recordForCall(ns, opts.session || null, ex);
      if (r0 && r0.proxyRoad && r0.proxyRoad.arg && !NO_PAGE_CALLS.has(m)) throw namedError('egress_proxy_missing', `"${r0.profileId || '?'}" rides its profile's proxy, and no config file carries the switch — the call was refused, never run outside its proxy`);
      return opts;
    };
    const displayed = (opts, ex, file, rec, m = null) => {
      const eff0 = rec && rec.display ? displays.fileFor(file, rec.display) : file;
      const eff1 = rec && rec.engineView ? displays.engineFileFor(eff0, rec.engineView) : eff0; // lane engine-plugin: a conversation's browser on an ENGINE names its program + arguments at every call
      const eff2 = rec && rec.tailnet && rec.tailnet.arg ? displays.tailnetFileFor(eff1, rec.tailnet) : eff1;
      let eff = eff2;
      try { eff = rec && rec.proxyRoad && rec.proxyRoad.arg ? displays.proxyFileFor(eff2, rec.proxyRoad) : eff2; }
      catch (e) { if (!(e && e.code === 'egress_proxy_missing' && NO_PAGE_CALLS.has(m))) throw e; log.warn?.(`[browser] ${rec.profileId}: its ${m} keeps the base config — ${e.message} (a ${m === 'closeAll' ? 'teardown' : 'read'} opens no page)`); } // B-8b87: the profile's proxy (its forwarder's port) at every call // lane tailnet-names: a browser LAUNCHED with the tailnet PAC names it at every call (a different view relaunches)
      return eff === ex[VERBS.CONFIG_KEY] ? opts : { ...opts, extraEnv: { ...ex, [VERBS.CONFIG_KEY]: eff } };
    };
    const out = { ...r };
    for (const m of ['info', 'launch', 'cdpUrl', 'closeAll', 'streamStatus', 'streamEnable', 'streamPort']) {
      if (typeof r[m] === 'function') out[m] = async (ns, o) => r[m](ns, await add(ns, o, m));
    }
    if (typeof r.exec === 'function') out.exec = async (ns, argv, o) => r.exec(ns, argv, await add(ns, o, 'exec'));
    return out;
  }
  // P4 (§7.3 / D5 (b)): a browser on a PAIRED machine, or somebody else's
  // browser over CDP, is reached through the access layer — `hostId` is a
  // parameter it dispatches on, never a branch here. `access` and `hostKnown`
  // are injectable for the gate; unwired ⇒ every remote act refuses by name.
  const acc = () => access || require('./browser-access.js').access();
  const knownHost = (h) => (typeof hostKnown === 'function' ? !!hostKnown(h) : acc().hostKnown(h));
  // the B-f276 remainder's cure (主开发 23:20Z): a profile kept on a paired machine while the machines cannot be read is UNAVAILABLE by name —
  // never «not paired any more: pair it again» (a person who followed it minted a new pairing and ended the device's live link)
  const machinesHeld = () => { try { const a = acc(); return typeof a.held === 'function' ? a.held() : null; } catch { return null; } };
  /** A record whose process is NOT on this machine (a paired host's daemon)
   *  or is nobody's to signal (an external browser over CDP): never pid-
   *  checked, never sampled, never signalled here. */
  const isLocalRec = (rec) => !!rec && !rec.external && !rec.hostId;
  // P6: is a mediating proxy available in THIS process (the §6.2 verdict's
  // `mediation` fact), and is this record's attachment mediated?
  const mediationOn = () => !!(mediator && (typeof mediator.available !== 'function' || mediator.available()));
  /** RETIRED (the owner's ruling, 2026-09-27 — "直接打断所有脚本和agent操作"): the r4 switch `browser.fenceScriptsWhileDriven`
   *  is gone; the census refuses scripts and page edits while the user drives on every instance. A value still stored in
   *  data/settings.json is IGNORED and said once (never read again). */
  let retiredSwitchSaid = false;
  const sayRetiredSwitch = () => {
    if (retiredSwitchSaid) return;
    retiredSwitchSaid = true;
    let v; try { v = serverSetting('browser.fenceScriptsWhileDriven'); } catch { v = undefined; }
    if (v !== undefined && v !== null && v !== '') log.log?.(`[browser] browser.fenceScriptsWhileDriven (stored: ${JSON.stringify(v)}) is retired — a takeover now interrupts every script and page edit of the agent on that browser on every instance (the owner's ruling, 2026-09-27); the stored value is ignored`);
  };
  sayRetiredSwitch(); // at the keeper's birth — once; the grant sites only re-ask the flag
  const isMediated = (p) => B.isMediatedProfile(p);
  // owner ruling A: `scope` = who may use it ('all' | 'only'), DERIVED from `owner` (one field), never stored twice; `use` =
  // the list as keys and ids only (the broadcast — the panel names them from its own rows; the agent's route strips it)
  // BROWSE YOURSELF (B-6ae8, the owner 4): `recordMine` = "Also record my own actions" — an opt-OUT, absent = on
  // B-8b87 cure: the proxy origin the RUNNING browser was launched with (no login, no port of ours) — undefined when none runs
  const proxyLiveOf = (p) => { const rec = p ? reg.browsers[p.id] : null; if (!B.isLiveBrowser(rec)) return undefined; const e = rec.egress && rec.egress.proxy; return rec.proxyRoad && rec.proxyRoad.origin ? String(rec.proxyRoad.origin) : e && e.scheme ? `${e.scheme}://${e.host}:${e.port}` : null; };
  // round 3: …and the login's NAME it was launched with (the forwarder keeps the login named at the start until the next start)
  const proxyLiveLoginOf = (p) => { const rec = p ? reg.browsers[p.id] : null; if (!B.isLiveBrowser(rec)) return undefined; const e = rec.egress && rec.egress.proxy; return rec.proxyRoad ? String(rec.proxyRoad.credential || '') : e ? String(e.credential || '') : ''; };
  const pview = (p) => (p ? { ...B.publicProfileView(p), ...(proxyLiveOf(p) !== undefined ? { proxyLive: proxyLiveOf(p), proxyLiveLogin: proxyLiveLoginOf(p) } : {}), mediated: isMediated(p), agentRoad: dialogRoadOf(p).why, scope: B.scopeOf(p), use: B.useDigestOf(p), createdBy: p.createdBy || null, ...(B.isEphemeralProfile(p) ? {} : { recordMine: HM.recordsMine(p), disk: disk.diskOf(p) }) } : null); // (a conversation's own temporary browser is never browsed by the person — no switch of theirs rides its record: verify r1 H1)
  // ── lane grants-unify: "Who can use it" = the profile's row of the ONE grants store, mirrored as `p.grantUse` ──
  /** A conversation's browser key for the panel's spelling (null while it has none). */
  // (no resolver wired — a keeper built alone: a browser key IS the conversation key it is judged by, both ways)
  const bkOfConversation = (cid) => { if (typeof browserKeyForConversation !== 'function') return B.isBrowserKey(cid) ? cid : null; try { return browserKeyForConversation(String(cid)) || null; } catch { return null; } };
  /** Mirror ONE record's row (never an ephemeral record — its owner is its identity, not a grant). */
  function hydrateUse(p) {
    if (!p || typeof p !== 'object' || B.isEphemeralProfile(p)) return p;
    let rows = [];
    try { const g = grantsOf(); rows = g ? g.rowsFor('browser-profile', p.id) : []; } catch (e) { log.warn?.(`[browser] the grants store could not be read for ${p.id} — ${e && e.message}`); rows = [{ door: 'browser-profile', resource: p.id, to: null }]; }
    p.grantUse = B.useOfRows(rows, { browserKeyOf: bkOfConversation });
    return p;
  }
  function hydrateAllUse() { for (const p of reg.profiles) hydrateUse(p); }
  let ownUseWrite = false;   // the keeper's own write re-judges itself (its answer names who was detached)
  /** THE ONE WRITER for a profile's list: the row → the store (refused by name, nothing changed), then the mirror. */
  function writeUseRow(p, row, by = 'user', named = []) {
    const g = grantsOf();
    if (!g) throw namedError('not_written', 'the grants store is not available — "Who can use it" was not changed');
    let w;
    ownUseWrite = true;
    try { w = g.set('browser-profile', p.id, { to: row.to || [], except: row.except || [], removeExcept: [...(row.removeExcept || []), ...named] }, by); } finally { ownUseWrite = false; }   // lane held-except-doors: an exception leaves by name only (the PATCH's `named`, a pick's own lift)
    if (!w.ok) throw namedError(w.code, w.error || w.code);
    hydrateUse(p);
    return w;
  }
  // A profile's list written by ANY other writer (the permissions window, a script through the store) takes effect NOW:
  // the mirror refreshed, every lease it no longer admits detached (a narrowing — revoke now), the panel redrawn
  // lane lg-store-writes (the moved2 cure 2): the hook is DETACHED when this keeper ends (shutdown, a migration's private keeper,
  // a suite's «dead» keeper) — a keeper that no longer owns the registry never answers another's grant change with a commit of
  // its own stale state (a removal's grant row now goes at the landing, after the live keeper's commit)
  let offGrants = null;
  function detachGrants() { if (offGrants) { try { offGrants(); } catch { /* gone */ } offGrants = null; } }
  try {
    const g0 = grantsOf();
    if (g0 && typeof g0.onChange === 'function') offGrants = g0.onChange(({ door, resource }) => {
      if (door !== 'browser-profile' || ownUseWrite || !loaded) return;
      const p = reg.profiles.find((x) => x && x.id === resource);
      if (!p || B.isEphemeralProfile(p)) return;
      hydrateUse(p);
      try { rejudgeLeases(p.id, 'narrowed'); } catch (e) { log.warn?.(`[browser] ${p.id}: the re-judge after its list changed failed — ${e && e.message}`); }
      notify();
    });
  } catch (e) { log.warn?.(`[browser] the grants store's change hook is not wired — ${e && e.message}`); }
  /** A browser key → the conversation key the store names it by (the live session carrying it, else its binding). */
  const conversationOfKey = (bk) => { if (typeof conversationKeysForKey !== 'function') return B.isBrowserKey(B.parentKeyOf(String(bk || ''))) ? B.parentKeyOf(String(bk)) : null; try { const r = conversationKeysForKey(B.parentKeyOf(String(bk || ''))) || {}; return Array.isArray(r.keys) && r.keys.length ? String(r.keys[0]) : null; } catch { return null; } };
  /** The Task Groups the conversation carrying `browserKey` belongs to NOW → `{ids, unreadable, live}` (never throws);
   *  `live: false` = no running session carries the key (a stopped conversation: its membership is not readable NOW and
   *  it is not "no groups" — the re-judge keeps such a lease undecided when a Task Group row could admit it). */
  // lane grants-unify: + the browser key ITSELF — a key no binding names stands for its conversation (the migration carried
  // such a row by the key; the key is that conversation's own browser, never another's)
  const keysOfKey = (browserKey) => { const K = B.parentKeyOf(String(browserKey || '')); const own = B.isBrowserKey(K) ? [K] : []; if (typeof conversationKeysForKey !== 'function') return own; try { const r = conversationKeysForKey(K) || {}; return [...new Set([...(Array.isArray(r.keys) ? r.keys.map(String) : []), ...own])]; } catch { return own; } };
  const groupsOfKey = (browserKey) => {
    // lane grants-unify: + `keys` — the conversation keys the caller answers to (the ONE spelling the store names it by)
    const keys = keysOfKey(browserKey);
    if (typeof taskIdsForKey !== 'function') return { ids: [], unreadable: false, live: true, keys };
    try { const r = taskIdsForKey(B.parentKeyOf(String(browserKey || ''))) || {}; return { ids: Array.isArray(r.ids) ? r.ids.map(String) : [], unreadable: !!r.unreadable, live: r.live !== false, keys }; }
    catch (e) { log.warn?.(`[browser] the Task Group list could not be read for ${browserKey} — ${e && e.message}`); return { ids: [], unreadable: true, live: true, keys }; }
  };
  // lane lg-group-parents U3b: THE BROWSER DOOR TAKES THE LINEAGE — every judgement of a caller's Task Groups here asks the ONE
  // reader for the ancestors of the ids it judges (a child uses what its parents may; a parent's «除了» leaves it out); a lineage
  // read that throws is UNREADABLE, never «no parents». ONE helper, so no judgement can skip it (test-grants-store ⑪ pins it)
  const lineOf = (ids) => {
    if (typeof groupLineageOf !== 'function') return { inherited: [], unreadable: false };
    try { return { inherited: (groupLineageOf((Array.isArray(ids) ? ids : []).map(String)) || []).map(String), unreadable: false }; }
    catch (e) { log.warn?.(`[browser] the Task Group lineage could not be read — ${e && e.message}`); return { inherited: [], unreadable: true }; }
  };
  const mayAttachL = (p, f) => { const l = lineOf(f && f.taskIds); return B.mayAttach(p, { ...f, inheritedTaskIds: l.inherited, groupsUnreadable: !!(f && f.groupsUnreadable) || l.unreadable, nameOf: groupNameOf }); };
  /** A CONVERSATION ON ANOTHER MACHINE (identity verify r2, 2026-09-28): the wiring names the keys live remote sessions
   *  carry; `remote` = the caller's own knowledge (ws-create's spawn, before the session is registered). Never throws. */
  const isRemoteKey = (browserKey, remote = false) => { if (remote) return true; try { const v = remoteKeys(); const set = v instanceof Set ? v : new Set(v || []); return set.has(B.parentKeyOf(String(browserKey || ''))); } catch (e) { log.warn?.(`[browser] the remote-session list could not be read — ${e && e.message}`); return false; } };
  /** One Task Group's facts, or null (the store no longer lists it); `undefined` when the store itself is unreadable. */
  const taskFacts = (id) => {
    if (typeof taskInfo !== 'function') return undefined;
    try { return taskInfo(String(id)) || null; } catch (e) { log.warn?.(`[browser] the Task Group list could not be read (${id}) — ${e && e.message}`); return undefined; }
  };
  /** THE STORE HELD UNREAD (lane bl-windows): a group the lookup could not answer because the store is HELD — its words, else null */
  const heldTaskWords = (id) => { try { if (typeof taskInfo === 'function') taskInfo(String(id)); } catch (e) { if (e && e.code === 'TASK_GROUPS_UNREAD') return String(e.message); } return null; };
  /** a NEW group row of a «who may use» patch: known / unknown — or, while the Task Group store is held, refused BY THE HOLD'S WORDS */
  const knownTaskOrHeld = (tid) => { const f = taskFacts(tid); if (f === undefined) { const w = heldTaskWords(tid); if (w) return { refusal: { code: 'TASK_GROUPS_UNREAD', error: w } }; } return f !== null; };   // a refusal VALUE the pure verdict returns (主开发's follow), never a throw through its callback
  /** "who may use" in log words (never a name — keys and ids) */
  const whoWords = (p) => { const U = B.whoMayUse(p); if (!U || U.mode === 'all') return 'all conversations'; if (U.mode !== 'only') return 'an owner shape this release cannot judge'; return 'only ' + (U.who.map((w) => (w.kind === 'session' ? w.id : 'Task Group ' + w.id)).join(', ') || 'nobody'); };
  const sampleEvery = guardSampleMs || limits.GUARD_SAMPLE_MS;
  const rowOf = (id) => (providers && typeof providers.row === 'function' ? providers.row(id) : B.providerRow(id));
  // P10 (§7.6 tier 3, D27 (b)): the consent SETTING rides every control read —
  // the tier-3 row is usable only while it is true (a user act; agents cannot write settings)
  const desktopConsent = () => setting(require('../window-desktop').SETTING_KEY, false) === true;
  const control = (id, opts) => (providers && typeof providers.control === 'function' ? providers.control(id, opts) : B.providerControl(id, { desktopConsent: desktopConsent(), ...(opts || {}) }));
  // the row LIST the dialog, the digest's choices and the hint check judge by — the same override as rowOf / control (lane
  // engine-spi-egress L3: a table driven with a row the shipped one lacks must see it everywhere, or the seam is inconsistent)
  const providerIds = () => (providers && typeof providers.ids === 'function' ? providers.ids() : B.providerIds());
  let keysMemo = keys || null;
  const keysOf = () => { if (!keysMemo) keysMemo = require('./browser-backend.js').create({ integrations, log }); return keysMemo; };
  // does a key row REFUSE to run without a key? The key consumer answers (browser-backend keyRequired = the PURE table:
  // every cloud row yes); ONE answer for the gate, the view and start()
  const keyRequired = (id) => { const k = keysOf(); return typeof k.keyRequired === 'function' ? !!k.keyRequired(id) : SW.keyRequiredFor(id); };
  // B-50e7 (主开发 r3332 / r3443): WHILE THE SETTINGS ARE HELD (the persistence router's settingsHeld — the door setting-holds.js receives) the
  // held view carries no browser.* or plugin.* row: every read here would fall to its default. Each value read while they READ is noted in
  // ONE memo of THIS process (memory only: no file, nothing kept past the process); held, a read answers that memo; nothing known (a start
  // while held) ⇒ the scene's SAFE SIDE, never a default as if it were the person's choice. The lift is the door answering null: the next
  // read is the file's again — no restart. Nothing synchronous is added on the loop (the memo is a Map; the door is a property read).
  const lastKnown = new Map();
  const heldNow = () => { try { return settingsHeld() || null; } catch { return null; } };
  /** one setting read → { v, held, known }: readable ⇒ the file's value (noted); held ⇒ the last value known in this run, if any */
  const readSetting = (k) => {
    const h = heldNow();
    if (h) return lastKnown.has(k) ? { v: lastKnown.get(k), held: h, known: true } : { v: undefined, held: h, known: false };
    let v; try { v = serverSetting(k); } catch { v = undefined; }
    lastKnown.set(k, v);
    return { v, held: null, known: true };
  };
  /** `safe` (B-50e7): the value a HELD read with nothing known answers (a scene's safe side) — else the default `d` */
  const setting = (k, d, safe) => { const r = readSetting(k); if (r.held && !r.known) return safe === undefined ? d : safe; const v = r.v; return v === undefined || v === null || v === '' ? d : v; };
  const HELD_CODE = 'browser_settings_unread';
  const uid = () => (typeof process.getuid === 'function' ? process.getuid() : null);

  // ── state ──
  let reg = B.normalizeRegistry(null);
  const guard = new Map();      // profileId → { prev, hotSince, lastSampleAt, report: { reported, crossings }, memOffSaid }
  const live = new Map();       // profileId → { cpuPct, memBytes, memMetric, rssBytes (deprecated), pids, over, since, sampledAt }
  const starting = new Map();   // profileId → in-flight start promise (single flight)
  const stopping = new Set();
  const switching = new Set();  // P4 (§7.4): profiles mid-switch — attach/resolve answer `browser_restarting`, never a timeout
  const ephPairs = new Map();   // takeover C3: ephemeral profileId → the session's spawn pairs it runs under
  const retiring = new Map();   // takeover C3: ephemeral profileId → the in-flight stop + removal
  // MULTIVIEW B-325a: when THIS keeper first saw an ephemeral browser's
  // conversation idle (profileId → ms) and how many live-view viewers watch
  // each (conversation, browser) pair right now (inputKey → n, the bridge says)
  const turnIdleSince = new Map();
  const watchers = new Map();
  let othersFn = typeof otherHolders === 'function' ? otherHolders : null;
  let displayKeeper = displaySessions && typeof displaySessions === 'object' ? displaySessions : null; // lane one-browser-b1
  const othersNow = () => { if (!othersFn) return []; try { const v = othersFn(); return Array.isArray(v) ? v : []; } catch (e) { log.warn?.(`[browser] the ceiling's count seam failed — ${e && e.message}`); return []; } };
  // P3 (§4.3): WHO DRIVES each (conversation, browser) pair — IN MEMORY ONLY.
  // A server restart is a handback by construction (the viewer that held the
  // controls is gone and a reload never re-seizes them), so nothing here is
  // persisted; `inputs` keys are browser-takeover.inputKeyFor(browserKey,
  // profileId) with profileId null for the ephemeral browser (no lease).
  const inputs = new Map();     // key → input state (browser-takeover.newInputState)
  // BROWSE YOURSELF (B-6ae8, the owner 2026-09-28: "我其实也相当于是一个agent而已"): the USER as one more holder of a profile's
  // browser, on HIS OWN pinned tab (`vs-hu-<hex>` over the raw CDP url). profileId → {key, profileId, since, state
  // ('driving' | 'away'), awaySince, launched (he launched the browser: the 12 h keep), input (WHICH of his windows holds
  // his tab's controls — browser-takeover's state shape, never `inputs`: nothing of the agents is paused or told), ownTab,
  // fresh (the token of the window his last Browse yourself opened)}. In memory ONLY (a restart ends it — the `inputs` rule).
  const humans = new Map();
  const browsing = new Map();   // profileId → the ONE Browse yourself in flight (two presses never open two tabs)
  // the bridge's fact: is a viewer's socket live on ANY relay (verify r7's `viewerAlive`) — installed by the bridge
  let viewerAliveFn = null;
  // THE INTERRUPTION CYCLE of each pair (the owner's ruling, 2026-09-27; PURE src/browser-interrupt.js): from the
  // takeover to the handback — what was in flight (the recorder's trace), what the mediator aborted, what the agent
  // tried while the user drove. In memory like `inputs` (a restart is a handback by construction).
  const cycles = new Map();     // key → cycle
  const lastClosed = new Map(); // key → the last CLOSED cycle (the CLI's after-the-fact question outlives the handback)
  // the recorder's reader of what was IN FLIGHT at an instant (src/server/browser-trace.js installs it; absent = nothing known)
  let inFlightReader = null;
  const pending = new Map();    // key → Map(confirmationId → {id, action, category, at, expiresAt})
  const inputListeners = new Set();
  const confirmListeners = new Set();
  // P5 (§4.5): the LEASE SEAM — attach / detach / lease-dropped / browser-ready
  // / browser-stopped, one event each, so the action-trace recorder and the
  // per-profile screencast hang on the keeper without the keeper knowing them;
  // `digestExtras` lets them add their facts (recording state) to `list()`.
  const leaseListeners = new Set();
  const profileDropListeners = new Set();
  function onProfileDrop(fn) { if (typeof fn !== 'function') return () => {}; profileDropListeners.add(fn); return () => profileDropListeners.delete(fn); }
  // 主开发's word (r221, 2026-11-20 14:20Z — THE LAW: what the hub holds IN MEMORY of a removed profile's logins goes AT THE PRESS, in the
  // same step, never behind a write): the listeners that only clear MEMORY of a credential (the login values, the one-time codes, the
  // in-flight credential asks, the fill's scrub names) run at the removal's call; only what must match the disk rides its landing
  // (onProfileDrop). A stalled storage never keeps a removed profile's login values alive; a removal that then does not land brings
  // the profile back WITHOUT them — the strict side (signed in again or unlocked, as after a restart)
  const profileDropNowListeners = new Set();
  function onProfileDropNow(fn) { if (typeof fn !== 'function') return () => {}; profileDropNowListeners.add(fn); return () => profileDropNowListeners.delete(fn); }
  const digestExtras = new Set();
  const changeListeners = new Set(); // lane S2: `onChange` — the browser fact's re-publish hook (notify() fans out)
  function emitLease(ev) {
    if (ev && ev.profileId && ev.kind === 'browser-stopped') { if (geoHoldOwn) geoHoldOwn.disarm(String(ev.profileId), 'the browser stopped'); geoSaid.delete(String(ev.profileId)); geoGrantsRun.delete(String(ev.profileId)); }   // B-9584 U2c
    // verify r3 #2 (site-reset): the persisted witness dies with the browser — a stop, or a FRESH start (an adoption keeps it:
    // the tabs are still there; a named browser that outlives a VibeSpace restart is adopted at load with no event at all)
    if (ev && ev.profileId && (ev.kind === 'browser-stopped' || (ev.kind === 'browser-ready' && !ev.adopted))) { dropLeaseTabs(ev.profileId); endFolderNotice(ev.profileId, ev.kind === 'browser-stopped' ? 'browser-ended' : 'browser-restarted'); }   // B-0645 cure: the folder notice ends with its browser
    const out = [];
    for (const fn of leaseListeners) {
      try { const r = fn(ev); if (r && typeof r.then === 'function') out.push(Promise.resolve(r).catch((e) => log.warn?.(`[browser] lease listener failed: ${e && e.message}`))); }
      catch (e) { log.warn?.(`[browser] lease listener failed: ${e && e.message}`); }
    }
    return out;
  }
  /** Lane H (2026-09-25): a listener that answers a PROMISE (the recorder
   *  arming its tap on the browser that just became ready / the lease just
   *  taken) holds the verb that caused the event for at most `armWaitMs` — so
   *  the command the agent runs next lands on a TAPPED stream (the owner's
   *  first `open` was never recorded: the tap connected after it ran). A slow
   *  or failed arming never holds a verb longer and never fails it. */
  function settleArming(ps) {
    if (!ps || !ps.length || !(armWaitMs > 0)) return Promise.resolve();
    let t = null;
    return Promise.race([Promise.allSettled(ps), new Promise((r) => { t = setTimeout(r, armWaitMs); if (t.unref) t.unref(); })]).finally(() => { if (t) clearTimeout(t); });
  }
  function onLease(fn) { leaseListeners.add(fn); return () => leaseListeners.delete(fn); }
  // lane browser-disk-sample (B-5fab): every named profile's folder size on THIS machine — one bounded `du` child at a time
  // off the event loop (src/server/browser-disk-run.js), at its browser's start / stop too; REPORTED, never a stop
  const disk = require('./browser-disk-run.js').createDiskSampler({ profiles: () => { ensureLoaded(); return named(); }, userTodos, limits, log, now });
  // ── B-0b8c (lane browser-probe-transient): THE FLOOR NOTICE — ONE ATTEMPT NEVER DECIDES FOR EVER ──
  // The .268 boot's one probe timed out under boot I/O and a loud 「shared profiles stay off」 notice was filed for a
  // transient the memo healed minutes later. The floor now reads 'unknown' (not yet known — fail CLOSED for the act, no
  // shared profile opens) while `bf`'s ladder still asks; the ONE For-you item (origin browser) is filed only when the
  // ladder is EXHAUSTED, naming its tries + the last why, with a Check again door (`checkFloorNow`: one probe now, the
  // single flight a rung shares) — and the first answer after it WITHDRAWS it (a version read negates "could not read",
  // a too-old one included: that is browser-env's own notice). A restart ADOPTS an open item, never files a second.
  let floorItemId = null; // the open item, action browser-floor-check
  /** The facts API (GET /api/browser/floor, the digest's `floor`): the version the act reads, its verdict, the probe state. */
  function floorFacts() {
    const lv = bf.lastVersion();
    const probe = typeof bf.lastProbe === 'function' ? bf.lastProbe() : null;
    return { version: lv === undefined ? null : lv, floor: lv === undefined ? null : B.floorVerdict(lv, B.FLOOR_VERSION, probe), lastProbe: probe };
  }
  function openFloorItem() {
    if (!userTodos) return null;
    if (floorItemId) { try { const it = typeof userTodos.get === 'function' ? userTodos.get(floorItemId) : null; if (it && it.status === 'open') return it; } catch { /* gone */ } floorItemId = null; }
    try { const open = typeof userTodos.forSession === 'function' ? userTodos.forSession('browser') : []; const had = (open || []).find((i) => i && i.status === 'open' && i.action && i.action.type === 'browser-floor-check'); if (had) { floorItemId = had.id; return had; } } catch { /* the add below */ }
    return null;
  }
  function judgeFloor() {
    const v = floorFacts().floor;
    if (!v) return;
    if (v.state !== 'unknown') { // it answered: "could not read" is no longer true
      const it = openFloorItem();
      if (it) { try { userTodos.setStatus(it.id, 'done', 'agent'); log.log?.(`[browser] the browser version reads again (${v.state}${v.installed ? ' ' + v.installed : ''}) — its "could not read" notice is withdrawn`); } catch { /* gone already */ } }
      floorItemId = null;
      return;
    }
    if (!v.settled || openFloorItem()) return; // not yet known (the ladder still asks) / already filed (one item, adopted after a restart)
    const text = B.floorNotice(v);
    if (!text) return;
    if (!userTodos || typeof userTodos.add !== 'function') { log.warn?.(`[browser] ${text} (no For-you store is wired, so only this journal says so)`); return; }
    try {
      const it = userTodos.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', text, detail: B.floorNoticeDetail(v, { retryMs: ladderOf.retryMs, timeoutMs: ladderOf.timeoutMs }), sessionName: 'Agent browser', action: { type: 'browser-floor-check' } });
      floorItemId = it && typeof it.id === 'string' ? it.id : null;
      log.warn?.(`[browser] ${text}`);
    } catch (e) { log.warn?.(`[browser] the browser-version notice was not filed (${e && e.message}) — filed on the next miss`); }
  }
  if (typeof bf.onProbe === 'function') bf.onProbe(() => judgeFloor());
  /** The For-you item's Check again (POST /api/browser/floor/check): ONE probe now — an answer withdraws the notice. */
  async function checkFloorNow() { try { await bf.probeVersion({ fresh: true }); } catch { /* the state says it */ } return floorFacts(); }
  onLease((ev) => { if (ev && ev.profileId && ev.local && (ev.kind === 'browser-ready' || ev.kind === 'browser-stopped')) disk.event(ev.profileId, ev.kind === 'browser-stopped' ? 'stop' : 'start'); });
  function addDigest(fn) { digestExtras.add(fn); return () => digestExtras.delete(fn); }
  function digestExtra() { const out = {}; for (const fn of digestExtras) { try { Object.assign(out, fn() || {}); } catch (e) { log.warn?.(`[browser] digest extra failed: ${e && e.message}`); } } return out; }
  let timer = null;
  let loaded = false;
  // the follow-owed unit: the keys whose group cap was UNKNOWN (Task Groups held) — stamped at the store's read, once; KEPT in the
  // registry too (`reg.caps[bk].waiting` + the create's facts): load() seeds them and asks once (a restart that ended the hold fires
  // no store change — the delta read)
  const capWaiting = new Map();
  let dirty = false;
  // ── the remainder of B-f276: the registry HELD (its read failed / its bytes are not a registry) ──
  const heldRetryMs = { first: (unreadRetry && Number(unreadRetry.firstMs) > 0) ? Number(unreadRetry.firstMs) : 30000, max: (unreadRetry && Number(unreadRetry.maxMs) > 0) ? Number(unreadRetry.maxMs) : 300000 };
  let heldReg = null, heldSaid = false, heldSaveSaid = false, heldT = null, heldP = null, heldTries = 0, heldMissingAt = 0, heldStopped = false, bootOwed = false;
  const heldLifts = new Set();
  // 主开发 03:35Z (round wm6qxcqcw, its MUST): the hold is TOLD ONCE in For you — the person's own surface says why every agent browser
  // waits (the journal alone told nobody); one item a hold, resolved at the read
  const HELD_NOTICE = 'VibeSpace cannot read {file}, the file of your browser profiles, right now — so the agent browsers wait. Nothing is written over it, and VibeSpace reads it again by itself.';
  const HELD_TORN = 'VibeSpace cannot use {file}, the file of your browser profiles: its bytes are not a whole profile list (torn or damaged) — so the agent browsers wait. Nothing is written over it, and reading it again will not mend it: put back a copy from a backup.';   // its read r3 (S1): torn bytes ASK in words that say a read again will not mend them
  const HELD_ITEM_KEY = 'browser-registry-held';   // its read r2 (S1): ONE identity in the store — a re-file (a later run, new words) is the same item
  const HELD_DETAIL = 'If this stays: the file is {path} — check that VibeSpace can read it (its storage answers, its permissions), or put back a copy from a backup; VibeSpace reads it again by itself.';   // its read r1 (S2): the way out when a read again cannot fix it
  let heldItemId = null, heldItemTorn = false, heldNoStoreSaid = false;
  // its read r2 (S4): TORN bytes never lift by themselves (a read again finds the same bytes) — the item asks the person (an action,
  // high); a failed read (the storage, the permissions) may answer again by itself — a notice. A hold that turns torn re-files it raised;
  // its read r3 (N2): never lowered in the same hold (a failed read after torn bytes mends nothing — and each flip reopened a dismissed item)
  function fileHeldNotice() {
    const torn = heldItemTorn || !!(heldReg && heldReg.state === 'corrupt');
    if (heldItemId && torn === heldItemTorn) return;
    const key = torn ? HELD_TORN : HELD_NOTICE;   // its read r2 (S3): no raw code in the words; r3 (S1): torn bytes have their own
    const text = key.replace('{file}', STORE_FILE);
    if (!userTodos || typeof userTodos.add !== 'function') { if (!heldNoStoreSaid) { heldNoStoreSaid = true; log.warn?.(`[browser] ${text} (no For-you store is wired, so only this journal says so)`); } return; }   // r3 (N4): once
    // B-44f3 × the held registry (the meeting, lane bl-windows): For you itself held unread ⇒ the notice WAITS for its read (whenRead),
    // never lost to a refused write
    if (typeof userTodos.isHeldUnread === 'function' && userTodos.isHeldUnread()) { userTodos.whenRead(() => { if (heldReg) fileHeldNotice(); }, "the held profile registry's notice"); return; }   // still held at that read, else nothing to say
    // its read r1 (M3) / r2 (S1): filed under ONE item key — a previous run's open item IS this item (the store matches the key, a re-file updates it)
    try { const it = userTodos.add('browser', { origin: 'browser', kind: torn ? 'action' : 'notice', urgency: torn ? 'high' : 'normal', by: 'agent', text, detail: DET_TEXT(), sessionName: 'Agent browser', itemKey: HELD_ITEM_KEY, i18n: { text: { key, params: { file: STORE_FILE } }, detail: [{ key: HELD_DETAIL, params: { path: storeFile } }] } }); heldItemId = it && typeof it.id === 'string' ? it.id : null; heldItemTorn = torn; }
    catch (e) { log.warn?.(`[browser] the held registry's For-you notice was not filed (${e && e.message})`); }
  }
  const DET_TEXT = () => HELD_DETAIL.replace('{path}', storeFile);
  /** the open held-registry notices in For you (a previous run's included — found by the item key) */
  function openHeldNotices() {
    if (!userTodos || typeof userTodos.forSession !== 'function') return [];
    try { return (userTodos.forSession('browser') || []).filter((i) => i && i.status === 'open' && i.itemKey === HELD_ITEM_KEY); } catch { return []; }
  }
  /** its read r1 (M3): a load that READ closes every held notice still open — a previous run's that stopped while held too */
  function closeStaleHeldNotices() {
    if (heldReg || !userTodos || typeof userTodos.setStatus !== 'function') return;
    if (typeof userTodos.isHeldUnread === 'function' && userTodos.isHeldUnread()) { userTodos.whenRead(() => closeStaleHeldNotices(), "the held profile registry's stale notices"); return; }   // B-44f3: For you held ⇒ closed at its read
    for (const it of openHeldNotices()) { try { userTodos.setStatus(it.id, 'done', 'agent'); } catch (e) { log.warn?.(`[browser] a held-registry notice was not closed (${e && e.message})`); } }
  }
  function resolveHeldNotice() {
    const id = heldItemId; heldItemId = null; heldItemTorn = false;
    if (!id || !userTodos || typeof userTodos.setStatus !== 'function') return;
    if (typeof userTodos.isHeldUnread === 'function' && userTodos.isHeldUnread()) { userTodos.whenRead(() => { try { const it = userTodos.get ? userTodos.get(id) : null; if (!it || it.status === 'open') userTodos.setStatus(id, 'done', 'agent'); } catch (e) { log.warn?.(`[browser] the held registry's For-you notice was not resolved at For you's read (${e && e.message})`); } }, "the held profile registry's notice"); return; }   // B-44f3: For you held ⇒ resolved at its read
    try { const it = typeof userTodos.get === 'function' ? userTodos.get(id) : null; if (!it || it.status === 'open') userTodos.setStatus(id, 'done', 'agent'); } catch (e) { log.warn?.(`[browser] the held registry's For-you notice was not resolved (${e && e.message})`); }
  }
  function holdRegistry(a) {
    heldReg = { code: a.code, why: a.why, state: a.state || null, at: (heldReg && heldReg.at) || now() };
    if (!heldSaid) { heldSaid = true; fileHeldNotice(); log.warn?.(`[browser] ${STORE_FILE} could not be read (${a.code}: ${a.why}) — HELD: no profile is shown, nothing is written over it, every act that would record is refused by name, and it is read again off the main loop`); }
    heldRetrySoon();
  }
  /** the words a person reads while the registry is held */
  function heldWords() {
    return heldReg ? `${STORE_FILE} in VibeSpace's data folder could not be read (${heldReg.code}); ${heldP ? 'a read of it is still waiting for the storage to answer, and its answer is used the moment it comes' : 'VibeSpace reads it again every few minutes'}. No profile is lost: nothing is written over it, and the agent browsers wait until it reads.` : null;
  }
  function refuseIfHeld(what) { if (!loaded) ensureLoaded(); if (heldReg) throw namedError('store_unread', `${what}: ${heldWords()}`); }   // loaded first: the hold is known
  function heldRetrySoon() {
    if (heldT || heldStopped) return;
    const n = ++heldTries;
    heldT = setTimeout(() => { heldT = null; heldRetry().catch((e) => { log.warn?.(`[browser] ${STORE_FILE} read again failed: ${e && e.message}`); heldRetrySoon(); }); }, SR.retryDelay(n, { firstMs: heldRetryMs.first, maxMs: heldRetryMs.max }));
    heldT.unref?.();
  }
  /** one read again, OFF the loop: the next try armed FIRST, ONE read in flight (a hung read keeps its one thread; its answer is judged
   *  when it comes), «missing» right after an unreadable answer read once more; read, the registry loads and the boot's path runs once */
  async function heldRetry() {
    if (!heldReg) return;
    heldRetrySoon();
    if (heldP) return;
    const p = heldP = fs.promises.readFile(storeFile, 'utf8').then((text) => ({ text }), (error) => ({ error }));
    const read = await p; heldP = null;
    if (!heldReg || heldStopped) return;
    const a = SR.storeAnswer(read, { valid: REG_VALID });
    if (a.state === 'unreadable' || a.state === 'corrupt') { heldReg.code = a.code; heldReg.state = a.state; heldMissingAt = 0; fileHeldNotice(); return; }   // r2 (S4): turned torn ⇒ raised
    if (a.state === 'missing' && !heldMissingAt) { heldMissingAt = now(); return; }
    const was = heldReg;
    heldReg = null; heldMissingAt = 0;   // its read r3 (N19): the backoff and the said-once reset only once a load RETURNED (below)
    if (heldT) { clearTimeout(heldT); heldT = null; }
    // its read r1 (N4): a throw in the folder notices never skips the owed boot and the waiters (each step below is caught)
    // its read r2 (N17): a load that THROWS holds the store again (fail closed) — it may have thrown before the registry took the read,
    // and the owed boot would then judge and commit the EMPTY registry (the original harm); the next try reads afresh
    try { loadFrom(read); } catch (e) { heldReg = was; reg = B.normalizeRegistry(null);   /* the HOLD FIRST, then the empty registry (must 1's class): every write the load queued refuses from here */
      log.warn?.(`[browser] ${STORE_FILE}: the read's load failed: ${e && e.message} — held again`); holdRegistry({ code: 'load-threw', why: String((e && e.message) || e) }); return; }   // the READ answer — no second read (r3 N19: a half-loaded registry is not kept while held)
    heldTries = 0; heldSaid = false; heldSaveSaid = false;
    resolveHeldNotice();   // round wm6qxcqcw: the notice the hold filed goes with it
    if (!heldReg) closeStaleHeldNotices();   // its read r2 (S2): …and one a previous run left open — after the load RETURNED (a load that threw held again above)
    // its read r2 (S3): the creates the hold owed are judged FIRST — before the owed boot and the waiters (an agent's command in that
    // window found no pin and took a temporary browser; a pin made in it was overwritten)
    if (!heldReg) { try { judgeOwedPins(); } catch (e) { log.warn?.(`[browser] the pins the creates owed after the read: ${e && e.message}`); } }
    log.warn?.(`[browser] ${STORE_FILE} read again (held since ${new Date(was.at).toISOString()}, ${was.code}): ${a.state === 'data' ? `${reg.profiles.length} profile(s)` : 'the file is GONE — the registry starts empty'}`);
    try { reclaimFolderNotices(); } catch (e) { log.warn?.(`[browser] the folder notices after the read failed: ${e && e.message}`); }
    if (bootOwed) { bootOwed = false; try { await boot(); } catch (e) { log.warn?.(`[browser] the boot's path after the read failed: ${e && e.message}`); } }
    for (const fn of heldLifts) { try { await fn(); } catch (e) { log.warn?.(`[browser] a wait for the registry failed: ${e && e.message}`); } }
    notify();
  }
  let fileHost = null; // lane profile-lock-roll: the hostname the registry file was last saved under (read at load)

  function load() {
    // lane lg-store-writes U5b: a keeper made AGAIN in the same process (a suite's; the boot's legacy-adopt migration's private
    // keeper) lands what the last one still owed before it reads (a hub's boot owes nothing)… and a write still HELD past the
    // bound is read from the WRITER, never past (the moved2 cure 2's hunt (6): the file without the adopted record, then this
    // keeper's first save over it) — the owed bytes are the newest state of this file
    // (the census cure's gate, a meeting with the held store: BEFORE the read — the checkpoint's load reads the file and then hands
    // its bytes to loadFrom, so a landing inside loadFrom came after the read and a keeper made again read the older file)
    let owedText = null;
    try { const W = writerOf(); if (W.pending(storeKey)) { const r = W.flushSync([storeKey]); if ((r && r.deferred) || (r && (r.left || []).some((x) => x.file === storeKey))) owedText = typeof W.owed === 'function' ? W.owed(storeKey) : null; } } catch { }
    if (owedText != null) log.warn?.(`[browser] ${STORE_FILE}: the last keeper's write is still held by the storage — this load reads the writer's owed copy (the newest state), never the older file`);
    let read;
    if (owedText != null) read = { text: owedText };   // the writer's own bytes: whole by construction
    else { try { read = { text: fs.readFileSync(storeFile, 'utf8') }; } catch (error) { read = { error }; } }
    loadFrom(read);
    if (!heldReg) closeStaleHeldNotices();   // its read r1 (M3) / r2 (S2): a boot that READ closes a held notice a previous run left open — after the load returned
  }
  /** the load over one read's answer (the boot's, or the read again's — the remainder of B-f276, 主开发 00:38Z): a read that FAILED, or
   *  bytes that are not a registry, HOLD the store — the registry is EMPTY in memory because it is UNREAD: nothing is written over the
   *  file (the release's first save wrote the empty registry over every profile, run record, pin, lease, lineage row and login fence),
   *  every act that would record is refused by name (`store_unread`), every sweep that would read an absence as «gone» waits, and the
   *  file is read again off the loop; read, the boot's path runs once over what it READ. Torn bytes HOLD too (never set aside into an
   *  empty, writable registry: an empty registry here DELETES folders — the kept sweep, Housekeeping, a build's removal) */
  function loadFrom(read) {
    let rawDoc = null;
    const a = SR.storeAnswer(read, { valid: REG_VALID });
    if (a.state === 'data') { rawDoc = a.value; reg = B.normalizeRegistry(rawDoc); }
    else { reg = B.normalizeRegistry(null); if (a.state !== 'missing') holdRegistry(a); }
    // verify r7 (T1): one token ⇒ one entry — what the load's dedupe dropped is said (once) and in the ledger (each)
    { const dd = rawDoc && rawDoc.dirHosts ? B.dirHostsDeduped(rawDoc.dirHosts) : []; if (dd.length) { dirty = true; for (const x of dd) lineageLedger('deduped-at-load', { dir: x.key, keptAs: x.keptAs }); log.warn?.(`[browser] the launch-host lineage of ${dd.length === 1 ? dd[0].key : dd.length + ' directories'} dropped at load — the same marker token under another path (kept under ${dd.length === 1 ? dd[0].keptAs : 'the newest'})${dd.length === 1 ? '' : ' — each of: ' + dd.slice(0, 3).map((x) => x.key).join(', ') + (dd.length > 3 ? `, … +${dd.length - 3} more` : '')}`); } }
    // lane profile-lock-roll (L1): the hostname that WROTE the file (its last save, by whichever pod) — captured BEFORE this
    // process's first save re-stamps it with ours: the legacy witness of a record from before the per-launch `host`
    fileHost = reg.host || null;
    // verify r1 (F2): the witness is WRITTEN where it is read — a record from before the per-launch stamp takes the file's
    // writer as its lineage NOW (persisted at the next save), not only in this process's memory: reproduced — the boot after
    // a roll saved the file under THIS pod's name without launching, and the next restart (an Update, a second roll) found a
    // legacy record with no witness ⇒ the old pod's lock refused by name again (userW's class, one restart later)
    // verify r7 (T2 ③, userW's EXACT upgrade): a fleet pod's checkout is pulled at the boot AFTER a roll, so the first run of this
    // code is on the NEW pod against a 2.369.199 file — no `host`, no `dirHosts`, no marker (read on his pod) — and the file's
    // writer is nobody. The ONE witness .199 left is its own browser record: a kept directory whose lock names the pid THIS keeper
    // recorded as its own browser there (`rec.browser.pid`) was locked by that browser, so the lock's hostname is this volume's
    // previous name — bounded to a LEGACY record (no lineage at all) on its own directory (PURE legacyLockWitness). Read BEFORE the
    // boot's reconcile retires an ephemeral record (the directory then remembers what the record proved).
    // verify r8 (T2 ⑥ / ①): the fleet's other order (as it was — no boot pulls since 2.369.397) — the new pod's boot pull refused ⇒ the .199 keeper boots first there and NULLS
    // `rec.browser` (its reapOrphan) — leaves the record's `cdpUrl`; the directory's own `DevToolsActivePort` (Chrome's, MEASURED equal
    // to it on 0.38.1 + Chrome 154, surviving a SIGKILL) is the second witness form; the lock's ctime / the port file's mtime are
    // handed in so a fact from BEFORE the record's own life (a reused pid) is never its witness. The directory judged is the record's
    // own (its browser's, its own, else its profile's).
    { const witnessed = [];
      for (const rec of Object.values(reg.browsers)) {
        if (!rec || typeof rec !== 'object' || !isLocalRec(rec) || B.launchHostsOf(rec).length) continue;
        const pr = reg.profiles.find((x) => x && x.id === rec.profileId) || null;
        const own = (rec.browser && typeof rec.browser === 'object' && typeof rec.browser.dir === 'string' && rec.browser.dir) || (typeof rec.dir === 'string' && rec.dir) || (pr && typeof pr.dir === 'string' ? pr.dir : '');
        if (!own) continue;
        let lockAt = null; try { lockAt = fs.lstatSync(path.join(own, 'SingletonLock')).ctimeMs; } catch { lockAt = null; }
        let devtools = null; try { const df = path.join(own, 'DevToolsActivePort'); const d = B.parseDevToolsActivePort(fs.readFileSync(df, 'utf8')); devtools = d ? { ...d, at: fs.statSync(df).mtimeMs } : null; } catch { devtools = null; }
        const w = B.legacyLockWitness({ rec, lock: F.readSingletonLock(own), lockAt, devtools, dir: own, hostname: os.hostname() });
        if (!w) continue;
        rec.hosts = [...(fileHost ? [fileHost] : []), w.host].filter((x, i, a) => a.indexOf(x) === i); dirty = true; witnessed.push({ id: rec.profileId, dir: own, host: w.host, pid: rec.browser && rec.browser.pid ? rec.browser.pid : null, form: w.form });
      }
      for (const w of witnessed) lineageLedger('legacy-lock-witness', w);
      if (witnessed.length) log.log?.(`[browser] the launch-host lineage of ${witnessed.length === 1 ? witnessed[0].dir : witnessed.length + ' directories'} taken from the lock its own recorded browser left (${witnessed.length === 1 ? (witnessed[0].form === 'pid' ? `pid ${witnessed[0].pid} on ${witnessed[0].host}` : `its CDP endpoint in DevToolsActivePort, on ${witnessed[0].host}`) : 'a record from before the per-launch stamp'}) — this machine's previous name${witnessed.length === 1 ? '' : ' — each of: ' + witnessed.slice(0, 3).map((x) => `${x.dir} (${x.host})`).join(', ') + (witnessed.length > 3 ? `, … +${witnessed.length - 3} more` : '')}`); }
    if (fileHost) for (const rec of Object.values(reg.browsers)) if (rec && typeof rec === 'object' && isLocalRec(rec) && !B.launchHostsOf(rec).length) { rec.hosts = [fileHost]; dirty = true; }
    // verify r4 (S26b): a directory's remembered lineage goes when the directory is GONE (a Forget moved it aside; a sweep removed it).
    // verify r5 (S36): gone = ENOENT / ENOTDIR ONLY — any other error (EACCES, EIO, ESTALE: a flapping PVC at ONE load) KEEPS it and
    // is said once (reproduced: one unreadable load pruned the lineage, the next resume was refused as foreign); (S37) a prune is said;
    // (S42) a key is the directory's IDENTITY — one remembered under another spelling (the fleet's /home/vibe → /home/<name>) is re-keyed
    // verify r6 (S49): what the load does to MANY directories is said ONCE per kind (200 gone / re-keyed / unreadable at one boot were
    // 200 journal lines each) — the single-directory wording is unchanged
    const pruned = [], unreadable = [], rekeyed = [];
    for (const d of Object.keys(reg.dirHosts || {})) {
      let gone = false, err = null;
      try { fs.lstatSync(d); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) gone = true; else err = e; }
      if (gone) { delete reg.dirHosts[d]; dirty = true; pruned.push(d); lineageLedger('pruned-gone', { dir: d }); continue; }
      if (err) { unreadable.push({ d, code: (err && err.code) || err.message }); lineageLedger('kept-unreadable', { dir: d, code: (err && err.code) || err.message }); continue; }
      const id = dirKeyOf(d);
      if (id && id !== d) { reg.dirHosts = B.rekeyDirHosts(reg.dirHosts, d, id); dirty = true; rekeyed.push({ d, id }); lineageLedger('rekeyed-at-load', { from: d, to: id }); }
    }
    { const subject = (l) => (l.length === 1 ? l[0] : `${l.length} directories`); const each = (l, n = 3) => (l.length === 1 ? '' : ` — each of: ${l.slice(0, n).join(', ')}${l.length > n ? `, … +${l.length - n} more` : ''}`);
      if (pruned.length) log.log?.(`[browser] the launch-host lineage of ${subject(pruned)} forgotten — the directory is gone${each(pruned)}`);
      if (unreadable.length) { const codes = [...new Set(unreadable.map((x) => x.code))].join(', '); log.warn?.(`[browser] the launch-host lineage of ${subject(unreadable.map((x) => x.d))} kept — the directory cannot be read right now (${codes}); judged again at the next load${each(unreadable.map((x) => x.d))}`); }
      if (rekeyed.length) log.log?.(`[browser] the launch-host lineage of ${subject(rekeyed.map((x) => x.d))} is remembered under its real path ${rekeyed.length === 1 ? rekeyed[0].id : 'now'}${each(rekeyed.map((x) => `${x.d} → ${x.id}`))}`); }
    loaded = true;
    for (const [k, v] of Object.entries(reg.caps || {})) if (v && v.waiting === true) capWaiting.set(k, v.facts || {});
    if (capWaiting.size) Promise.resolve().then(() => retryWaitingCaps()).catch(() => { });
    hydrateAllUse();   // lane grants-unify: every record's "Who can use it" mirrored from the ONE store
    // BROWSE YOURSELF verify r1 (H4): the user's own holder SURVIVES a restart — restored AWAY (no window holds his tab
    // until one re-attaches; the keep runs from the restart when he was driving, from when he left when he was away), so
    // the idle clock still counts him and his tab is continued, never orphaned by a second `tab new`
    humans.clear();
    for (const r of Object.values(reg.humans || {})) {
      if (!r || !HM.isHumanKey(r.key) || HM.profileOfHumanKey(r.key) !== r.profileId) continue;
      humans.set(r.profileId, { key: r.key, profileId: r.profileId, since: r.since || now(), state: 'away', awaySince: r.state === 'away' && r.awaySince ? r.awaySince : now(), launched: !!r.launched, input: T.newInputState(), ownTab: r.ownTab || null, adopted: Array.isArray(r.adopted) ? r.adopted.slice() : [], fresh: null, freshUsed: false, restored: true });
    }
  }
  /** What of the user's holders goes to disk (never the window's controls or the one-time token). */
  const humansForDisk = () => Object.fromEntries([...humans.values()].map((h) => [h.profileId, { key: h.key, profileId: h.profileId, since: h.since, launched: !!h.launched, ownTab: h.ownTab || null, adopted: Array.isArray(h.adopted) ? h.adopted.slice(-32) : [], state: h.state === 'driving' ? 'driving' : 'away', awaySince: h.awaySince || 0 }]));
  function ensureLoaded() { if (!loaded) { load(); warmCliVersions(); cliBoot(); reclaimFolderNotices(); } }
  function save() {
    if (heldReg) { if (!heldSaveSaid) { heldSaveSaid = true; log.warn?.(`[browser] a ${STORE_FILE} write was refused: the file could not be read, and nothing is written over it until it reads`); } return false; }   // the B-f276 remainder: FIRST
    reg.humans = humansForDisk(); // BROWSE YOURSELF verify r1 (H4): mirrored at every write (the Map stays the truth)
    reg.host = os.hostname(); // lane profile-lock-roll (L1): the file names the machine that wrote it — the next pod's legacy witness
    // lane grants-unify: a record's `grantUse` is the grants store's row mirrored in memory — never written here
    // lane lg-store-writes (B-0248 U5b): browser-profiles.json was written whole (temp + rename) ON THE MAIN THREAD at every
    // registry change (4.2 s of holds in five hours on the production hub). Its bytes now go to the store writer by name, made
    // when the write is due (a burst of changes is one write), as an ACT (rank 0 + durable(): the writer's next writes). A
    // caller that must have it ON DISK before what follows (a directory's lineage before its move) asks saveNow().
    try {
      const W = writerOf();
      // must 1's class (主开发 2026-11-19 22:38Z): the bytes are made AT the write — a write queued before the hold came back (a
      // read again whose load threw) refuses while held (EHELD), never the EMPTY registry over the held file
      W.dirty(storeKey, { name: 'browser-profiles.write', rank: 0, mode: FILE_MODE, makeDir: true, produce: () => { if (heldReg) throw Object.assign(new Error(`${STORE_FILE} is held (its read failed) — nothing is written over it until it reads`), { code: 'EHELD' }); return JSON.stringify({ ...reg, profiles: reg.profiles.map((x) => { if (!x || typeof x !== 'object' || !('grantUse' in x)) return x; const { grantUse: _u, ...rest } = x; return rest; }) }, null, 2); },
        onWritten: (ok, e) => { if (!ok) log.warn?.(`[browser] could not write ${STORE_FILE}: ${(e && (e.code || e.message)) || 'an error'} — kept in memory, the store writer retries`); } });
      W.durable(storeKey).catch(() => { });
      dirty = false; return true;
    } catch (e) { log.warn?.(`[browser] could not write ${STORE_FILE}: ${e.message}`); return false; } // verify r9 (④): a caller that must know (a Forget's move) asks
  }
  /** the registry ON DISK before what follows (lane lg-store-writes U5b: a directory's lineage is written before the directory
   *  moves) — handed to the writer, then that one file's write waited for (a named wait); false: it did not land */
  function saveNow() { return save() && landNow(); }   // the lineage move (its one caller) — under the writer's own bound, as before the moved2 cure (the cure 3: a ten-minute hold of the main thread is not taken; a held write refuses the move by name, and the larger cure — both keys during a move — is said in LEFT)
  /** the registry's owed write waited for (a named wait): saveNow's, and a MIGRATION's reshape — the boot's next migration may
   *  read the FILE (2026-10-grants-unify reads browser-profiles.json from disk), so a reshape is on disk before it returns.
   *  false: it did not land — held past the writer's bound, failed, or DEFERRED by the exit (the exit's flush writes it; until
   *  then it is not on disk, so a move waiting on it is refused) */
  let landDeferred = false;   // the last landNow() was refused because the hub is STOPPING (the exit's flush writes it) — a refusal's words
  function landNow() { landDeferred = false; try { const W = writerOf(); if (!W.pending(storeKey)) return true; const r = W.flushSync([storeKey]); landDeferred = !!r.deferred; return !r.deferred && !r.left.some((x) => x.file === storeKey); } catch { return false; } }
  /** a MIGRATION's reshape that did not land fails that migration BY NAME (not recorded: it runs again next boot — the bytes stay
   *  in memory and the writer retries), and the runner HOLDS the migrations after it to the next boot (EVSNOTONDISK: a later one
   *  may read this file) — src/migration-runner.js, the order law */
  const landedOrThrow = () => { if (!landNow()) throw Object.assign(new Error(`${STORE_FILE}: the reshape is in memory and not on disk yet (the storage still holds the write) — not recorded, it runs again at the next boot`), { code: 'EVSNOTONDISK' }); };
  /** THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING (lane lg-store-writes, the moved2 cure 2 — store-writer afterLanding, the ONE
   *  helper): `step` runs once the registry as it is NOW is on disk; `timeoutMs` bounds only the reply's wait. → {landed, value} */
  function rideLanding(step, { what = null, timeoutMs = null } = {}) { return require('../store-writer.js').ride(writerOf(), storeKey, step, { what, timeoutMs }); }
  /** the registry as it is now on disk, waited for up to `timeoutMs` (a reply's bound; a login fill's fence) → {landed} */
  function whenLanded({ timeoutMs = 20000 } = {}) { ensureLoaded(); return rideLanding(() => true, { what: 'a reply waiting on the registry', timeoutMs }); }
  function notify() {
    try { broadcast?.({ type: 'browser-profiles-updated', ...list() }); } catch (e) { log.warn?.(`[browser] broadcast failed: ${e.message}`); }
    // lane S2: every registry change (a start, a failure, a pin, a removal, a label) may move a conversation's
    // BROWSER FACT — the wiring re-computes the facts and re-publishes active-sessions when a digest moved
    for (const fn of changeListeners) { try { fn(); } catch (e) { log.warn?.(`[browser] change listener failed: ${e && e.message}`); } }
    // lane browser-display-holders: a lease taken / dropped / re-judged, a person's stop stamped — the display records follow
    if (displayKeeper && typeof displayKeeper.browserHoldersMoved === 'function') { try { displayKeeper.browserHoldersMoved(); } catch (e) { log.warn?.(`[browser] the display records' holders were not re-read: ${e && e.message}`); } }
  }
  function onChange(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); }
  // ONE WRITE, ONE BROADCAST PER USER ACT (verifier 2026-09-28): a narrowing of "Who can use it" detaches every lease the
  // list no longer admits, and `detach()` commits — 50 leases were 50 registry writes (sync, on whatever disk data/ is) and
  // 50 whole-digest broadcasts + 50 active-sessions re-publishes to every client, for one Save. Inside `batched(fn)` a
  // commit only marks; the ONE commit runs when the outermost batch ends (nothing ran ⇒ nothing written).
  let batchDepth = 0, batchDirty = false;
  const adopting = new Set();   // the moved2 cure 3: adopted profiles whose folder move still rides their record's landing
  const sweepIds = new Set(); let sweepDirty = false; // keeper-sweep-yields F5: the ids the orphan walk is retiring now (retireInSteps) — their removals commit with the walk's piece
  function commit() { if (batchDepth > 0) { batchDirty = true; return; } save(); notify(); }
  function batched(fn) {
    batchDepth++;
    try { return fn(); }
    finally { if (--batchDepth === 0 && batchDirty) { batchDirty = false; save(); notify(); if (batchSync) { batchSync = false; landNow(); } } }
  }
  /** THIS SITE'S SAVE STAYS SYNCHRONOUS (lane lg-store-writes — the deferred-save census, a verdict of its table, 主开发 03:00Z): a
   *  person's or an agent's act whose reply or next step (a session started, a meta written, a card filed, a display stopped) follows
   *  at once — its registry write LANDS before that, under the writer's own bound (landNow), as the release's synchronous save did;
   *  inside a batch the batch's one commit lands. → whether it is on disk (false: held past the bound or failed — owed, said) */
  let batchSync = false;
  function commitSync() { if (batchDepth > 0) { batchDirty = true; batchSync = true; return true; } commit(); return landNow(); }
  /** the census cure ((b) — a word to a person follows the save): a proposal's card is shown over a record ON DISK — landed now,
   *  or the card rides the landing (never a card whose press would find nothing after a kill) */
  function cardOnLanding(entry, what, landed = commitSync()) { if (landed) emitProposal(entry); else rideLanding(() => emitProposal(entry), { what, timeoutMs: null }); }   // `landed`: a caller that already landed its record passes the answer

  // ── views ──
  /** The daemon namespace of a profile's browser: `vs-<profileId>` — or, for a
   *  managed EPHEMERAL record, `vs-<browserKey>` (P0's SESSION/NAMESPACE are
   *  its identity; the keeper never renames a browser the session already uses). */
  const nsOf = (profileId) => { const p = reg.profiles.find((x) => x.id === profileId); return p && B.isEphemeralProfile(p) ? B.sessionNameFor(p.owner.id) : B.sessionNameFor(profileId); };
  const isEph = (p) => B.isEphemeralProfile(p);
  /** The named profiles (what every picker, handle and label resolves against). */
  const named = () => reg.profiles.filter((p) => !isEph(p));
  const pairsOf = (profileId) => ephPairs.get(profileId) || (reg.browsers[profileId] && Array.isArray(reg.browsers[profileId].envPairs) ? reg.browsers[profileId].envPairs : null);
  const pairsEnv = (pairs) => require('../browser-stream.js').pairsToEnv(pairs || []);
  const S0 = { pairsToEnv: (pairs) => require('../browser-stream.js').pairsToEnv(pairs || []) };
  /**
   * takeover r2 (the socket root is IDENTITY): the daemon a command talks to is
   * `<root>/namespaces/<ns>/run/<session>.sock`, and this keeper launches,
   * probes and streams every browser under ONE root — its runtime's base env
   * (AGENT_BROWSER_* stripped) plus the pairs that name the browser: a managed
   * ephemeral / child browser's spawn pairs may carry AGENT_BROWSER_SOCKET_DIR
   * (the long-home remedy), an attachment's never do. `/resolve` hands this to
   * the CLI, which sets it on the child LAST — the shell's SOCKET_DIR or
   * XDG_RUNTIME_DIR can no longer point a sanctioned command at a daemon the
   * keeper does not see. → `{ socketDir, runtimeDir, via }` (the binary's
   * measured precedence: SOCKET_DIR > $XDG_RUNTIME_DIR/agent-browser > $HOME/.agent-browser).
   */
  function socketRootOf(pairs = null) {
    const own = pairsEnv(pairs).AGENT_BROWSER_SOCKET_DIR;
    const runtimeDir = typeof rtEnv.XDG_RUNTIME_DIR === 'string' && rtEnv.XDG_RUNTIME_DIR ? rtEnv.XDG_RUNTIME_DIR : null;
    const r = B.socketRootFor({ home: rtEnv.HOME || homeDir, xdgRuntimeDir: runtimeDir, socketDir: typeof own === 'string' && own ? own : null });
    return { socketDir: r.root, runtimeDir, via: r.via };
  }
  function browserView(rec) {
    if (!rec) return null;
    const l = live.get(rec.profileId) || null;
    return { ...rec, cdpUrl: undefined, remoteCdpUrl: undefined, envPairs: undefined, tailnet: require('../tailnet-reach.js').stampView(rec.tailnet), live: l ? { ...l } : null, runningBuild: BB.runningBuildOf(rec.cdpBrowser), // lane browser-admin 2a: the build the browser itself reports; lane tailnet-names r4: the tailnet stamp's {on, mode, why} — never its arg (the PAC token)
      cli: rec.cli ? { ...rec.cli, ...(cliFactOf(rec) || {}) } : null }; // verify r2 (H1): the CLI it runs (+ `gone` words when that version left this machine)
  }
  /** verify r1 (F5): a browser record for an AGENT — never its launch view (`launchEnv` carries the executable's path) and
   *  a path choice by kind only; the running build (the browser's own answer) stays. */
  function agentBrowserView(rec) {
    const v = browserView(rec);
    if (!v) return null;
    const { launchEnv, ...rest } = v; // eslint-disable-line no-unused-vars
    return { ...rest, cli: cliFactOf(rec), ...(v.browserChoice ? { browserChoice: BB.agentChoiceView(v.browserChoice) } : {}) }; // verify r2 (H1): the CLI by VERSION only
  }
  function leaseView(l) {
    const p = l ? profile(l.profileId) : null;
    const v = { ...l, mediated: !!(l && isMediated(p)) };
    delete v.tabRoots; // lane browser-resume C: a lease's tab roots are the keeper's own bookkeeping — never in a view
    delete v.rebound; // verify r3 (F4): a rebound note waiting for an answer is bookkeeping too
    // lane H: a managed ephemeral browser's lease is a lease row like any other, SAID to be one
    if (isEph(p)) { v.ephemeral = true; v.child = B.isChildKey(l.browserKey); }
    return v;
  }
  /** Lane H: THE holder rows (browser-profiles.holderRows) — named leases +
   *  each managed ephemeral browser's lease while its browser is READY. The
   *  digest's `leases` and the status route's `leases` are this, and nothing
   *  else; `leasesOn` / `leasesFor` answer the registry (an idle ephemeral's
   *  lease included, marked `ephemeral`). */
  const holders = (leases) => B.holderRows({ leases, profiles: reg.profiles, browsers: reg.browsers, view: leaseView });
  // ── BROWSE YOURSELF (B-6ae8): the user's own holder rows — ONE reader for every "who holds this browser" question ──
  /** The digest row of each human holder (`human: true`, `holder: 'user'`, `sessionId: null`), on one profile or all. */
  const humanRowsOn = (profileId = null) => [...humans.values()].filter((h) => !profileId || h.profileId === profileId).map((h) => HM.humanHolderRow(h, { viewers: watchers.get(inputKey(h.key, h.profileId)) || 0 })).filter(Boolean);
  /** EVERY holder of a profile's browser: the conversations' leases + the user's own row. A reader that asks "is this
   *  browser USED / who holds it" goes through here (the idle clock, the heal, the last-holder stamp, the switch's hold);
   *  a reader that needs a CONVERSATION (admission, caps, pins, the takeover's siblings, the re-judge) reads the leases —
   *  test-browser-human's holder census classifies every `reg.leases` site of this file. */
  function holdersOn(profileId) { ensureLoaded(); return [...reg.leases.filter((l) => l.profileId === profileId), ...humanRowsOn(profileId)]; }
  /** Is a viewer's socket live anywhere (the bridge's fact; none installed ⇒ unknown ⇒ treated live — never a double seat). */
  const viewerAliveOf = (id) => { if (id === null || id === undefined) return false; if (typeof viewerAliveFn !== 'function') return true; try { return !!viewerAliveFn(id); } catch { return true; } };
  /** The event fields every lease-seam event about a managed ephemeral
   *  browser carries: the listener needs its conversation (key + session) and
   *  whether it is a sub-agent's (a child's pairs are not its session's). */
  function ephEventFields(profileId) {
    const p = profile(profileId);
    if (!isEph(p)) return {};
    const l = reg.leases.find((x) => x.profileId === profileId) || null;
    // VERIFY r1 L2: a stop AFTER the lease left (a detach, a reconcile) still names its session — the last one its
    // lease named (in memory; at boot the lease is still there to read)
    return { ephemeral: true, browserKey: p.owner.id, sessionId: (l && l.sessionId) || ephSessions.get(profileId) || null, child: B.isChildKey(p.owner.id) };
  }
  /** VERIFY r1 L2: profileId → the session id a managed ephemeral browser's lease last named. */
  const ephSessions = new Map();
  // ── lane browser-resume (§3.9): THE KEPT BROWSER — the store (src/server/browser-kept.js) is fed from here only ──
  const keptStore = () => { try { return typeof kept === 'function' ? kept() : kept; } catch { return null; } };
  /** A conversation's kept directory — named by its key (browser-env's `scratchDirFor`), never read from anything else. */
  const keptDirFor = (bk) => { const ks = keptStore(); return ks && typeof ks.dirOf === 'function' ? ks.dirOf(bk) : path.join(dataDir, 'browser-profiles', String(bk)); };
  /** What the config a browser's pairs NAME says: its `profile` and whether it is fenced (unreadable ⇒ none). */
  function pairsConfigFacts(pairs) {
    const own = S0.pairsToEnv(Array.isArray(pairs) ? pairs : [])[VERBS.CONFIG_KEY];
    if (typeof own !== 'string' || !own.startsWith('/')) return { profile: null, fenced: false };
    try { const c = JSON.parse(fs.readFileSync(own, 'utf8')) || {}; return { profile: typeof c.profile === 'string' && c.profile ? c.profile : null, fenced: !!B.configFence(c) }; } catch { return { profile: null, fenced: false }; }
  }
  /** Rung D's kept directory, ACCEPTED only when the config the pairs name gives the conversation's OWN one (named by its
   *  key) — never a directory a pin handed it before owner ruling A (clearPinnedDir's class): that one is not kept. */
  const keptDirSaid = new Set();
  function ownKeptDirOf(bk, pairs) {
    if (!B.isBrowserKey(bk)) return null;
    const f = pairsConfigFacts(pairs);
    if (!f.profile) return null;
    if (B.sameDir(f.profile, keptDirFor(bk))) return keptDirFor(bk);
    if (!keptDirSaid.has(bk)) { keptDirSaid.add(bk); log.log?.(`[browser] ${bk}: its config names a directory that is not its own kept one (${f.profile}) — not recorded as kept`); }
    return null;
  }
  /** Does this ephemeral record run on its conversation's own kept directory (rung D's config names it; rung C's link points at it)? */
  function onKeptDir(p) {
    if (!p || !p.dir || !isEph(p) || !B.isBrowserKey(p.owner.id)) return false;
    const own = keptDirFor(p.owner.id);
    if (B.sameDir(p.dir, own)) return true;
    try { return B.sameDir(fs.readlinkSync(p.dir), own); } catch { return false; }
  }
  /** Tell the kept store about a conversation's own browser (never a helper's — D6): `start` | `stop` (+ `why`, `tabs`). */
  function keptNote(kind, p, extra = {}) {
    const ks = keptStore();
    if (!ks || !p || !isEph(p) || !B.isBrowserKey(p.owner.id)) return null;
    const facts = { hasDir: onKeptDir(p), fenced: pairsConfigFacts(pairsOf(p.id) || (reg.browsers[p.id] && reg.browsers[p.id].envPairs) || []).fenced, label: p.label, sessionId: ephEventFields(p.id).sessionId || null };
    try { return kind === 'start' ? ks.noteStart(p.owner.id, facts) : ks.noteStop(p.owner.id, { ...facts, ...extra }); }
    catch (e) { log.warn?.(`[browser] ${p.id}: the kept browser was not noted (${kind}) — ${e && e.message}`); return null; }
  }
  /** The live tab list of a conversation's own browser, read over CDP (the pages that exist NOW, with their titles), merged
   *  with the relay's last list (its order and the tab on show) — only while its daemon is provably OURS and ready (a read
   *  under the pairs of a gone daemon would start one: "a view never starts a browser"). Never throws; unreadable ⇒ the
   *  relay's list stands. */
  async function captureKeptTabs(p, rec, seenBy = 'the stop', { timeoutMs = 1500 } = {}) {
    const ks = keptStore();
    if (!ks || !p || !isEph(p) || !B.isBrowserKey(p.owner.id) || !rec || rec.state !== 'ready' || !isLocalRec(rec) || livenessOf(rec) !== 'ours') return null;
    let r = null;
    try {
      const ep = await cdpEndpointFor(p.id);
      if (!ep || !ep.ok) return null;
      r = await (typeof readTargets === 'function' ? readTargets(ep.url) : require('./browser-viewport.js').browserTargets(ep.url, { timeoutMs }));
    } catch (e) { r = { ok: false, error: String(e && e.message) }; }
    if (!r || !r.ok || !Array.isArray(r.targets)) { log.log?.(`[browser] ${p.id}: its tabs could not be read at ${seenBy} (${String((r && r.error) || 'no answer').slice(0, 120)}) — the last list the live view saw is kept`); return null; }
    const l = ks.latestOf(p.owner.id);
    const rows = KB.mergeTabs(l ? l.tabs : null, r.targets);
    ks.noteTabs(p.owner.id, rows, 'cdp');
    return rows;
  }
  /** The bridge's relay mirrored a `tabs` record of a conversation's own browser (never a helper's). */
  function noteTabs(target, tabs) {
    const ks = keptStore();
    if (!ks || !target || target.kind !== 'ephemeral' || target.child || !Array.isArray(tabs)) return false;
    const bk = String(target.browserKey || String(target.ns || '').replace(/^vs-/, ''));
    if (!B.isBrowserKey(bk)) return false;
    return ks.noteTabs(bk, tabs, 'relay');
  }
  /** The tick: a running conversation browser whose list nobody mirrored for a minute (no live view, the trace off) is
   *  read over CDP every 30 s — a crash keeps its tabs. One read in flight per browser. */
  const keptReading = new Map(); // profileId → when its last read started
  function refreshKeptTabs(t) {
    const ks = keptStore();
    if (!ks) return;
    for (const p of reg.profiles.filter(isEph)) {
      if (!B.isBrowserKey(p.owner.id)) continue;
      const rec = reg.browsers[p.id];
      if (!rec || rec.state !== 'ready' || stopping.has(p.id) || starting.has(p.id)) continue;
      const l = ks.latestOf(p.owner.id);
      if (l && t - l.at < 60000) continue;
      if (t - (keptReading.get(p.id) || 0) < 30000) continue;
      keptReading.set(p.id, t);
      captureKeptTabs(p, rec, 'the tick').catch(() => null);
    }
    for (const id of [...keptReading.keys()]) if (!profile(id)) keptReading.delete(id);
  }
  /** takeover C3: the managed ephemeral browsers — one row each (the record,
   *  whose conversation, the browser's state), for the housekeeping panel and
   *  the digest; never listed as a profile. */
  function ephemerals() {
    ensureLoaded();
    return reg.profiles.filter(isEph).map(ephRow);
  }
  /** B-7a30: ONE ephemeral profile's row — ephemeralFor(bk) builds only its own (it built all of ephemerals() to find one: a
   *  kept-folder read per ephemeral profile for each lookup, on every active-sessions broadcast). */
  function ephRow(p) {
      const b = reg.browsers[p.id] || null;
      const l = reg.leases.find((x) => x.profileId === p.id) || null;
      return { profileId: p.id, label: p.label, browserKey: p.owner.id, child: B.isChildKey(p.owner.id), sessionId: l ? l.sessionId || null : null, leased: !!l, dir: p.dir || null,
        state: b ? b.state : 'not-started', live: B.isLiveBrowser(b), startedAt: b ? b.startedAt || 0 : 0, endedAt: b ? b.endedAt || 0 : 0, pid: b ? b.pid || null : null, stoppedBy: b ? b.stoppedBy || null : null, lastError: b ? b.lastError || null : null,
        adopted: !!(b && b.adoptedAt), usage: live.get(p.id) ? { ...live.get(p.id) } : null, createdAt: p.createdAt || 0,
        display: b && b.display ? b.display : null, // lane headless-fallback: the launch's display fact (headless instead of a window, and why)
        kept: B.isBrowserKey(p.owner.id) && keptStore() ? keptStore().brief(p.owner.id) : null, // lane browser-resume: what its conversation keeps when it stops
        endedEarly: b && b.endedEarly ? { ...b.endedEarly } : null }; // B-346d law 2: its daemon ended before its idle timeout (the row's chip says so, never «idled out»)
  }
  function ephemeralFor(browserKey) { ensureLoaded(); const k = String(browserKey || ''); const p = reg.profiles.find((x) => isEph(x) && x.owner && String(x.owner.id) === k); return p ? ephRow(p) : null; } // B-7a30: one key's lookup computes one key
  function list() {
    ensureLoaded();
    const browsers = {};
    for (const [id, r] of Object.entries(reg.browsers)) browsers[id] = browserView(r);
    const running = Object.values(reg.browsers).filter(B.isLiveBrowser).length + othersNow().length;
    const ff = floorFacts(); // B-0b8c: the version, its verdict, the probe's state — one read
    return {
      // takeover C3: a managed ephemeral record is NOT a profile (no picker,
      // no handle, no label to resolve) — it rides `ephemerals`, and the
      // ceiling's `used` counts it (and the desktop apps the seam reports)
      // lane H: `leases` = the HOLDER rows — a live managed ephemeral browser is one, marked `ephemeral: true`
      // BROWSE YOURSELF (B-6ae8): + the user's own holder rows (named profiles only; `sessionId: null`)
      // (verify r1: the conversations' rows go through `holders` — the ONE holder-row path lane H's control patches — and
      // his row is appended after them, never a second derivation of theirs)
      profiles: named().map(pview), leases: [...holders(reg.leases), ...B.holderRows({ leases: [], profiles: reg.profiles, browsers: reg.browsers, humans: humanRowsOn() })], browsers, ephemerals: ephemerals(),
      // lane profile-lock-roll (L3): this machine's name — the panel compares a record's launch `host` with it
      machine: { host: os.hostname() },
      // P6 (§6.2 / §6.5): is `sharing:"instance"` a value HERE, and the grants
      // (counts only — never a token, never a raw url)
      mediation: { available: mediationOn(), port: mediator && mediationOn() ? mediator.port() : null, grants: mediator && mediationOn() ? mediator.list() : [] },
      pins: { ...reg.pins }, cap: { used: running, cap: machineCap(), setting: 'browser.maxRunning', ...(capUnread() ? { unread: true, code: HELD_CODE } : {}) },
      windowLeaks: { count: windowLeaks.count, last: windowLeaks.last ? { ...windowLeaks.last } : null }, // verify r3 T2 ①: rung-2 tabs that landed in another holder's window, closed at once — COUNTED (this run)
      // owner ruling A (2): who DRIVES each shared profile's browser right now (profileId → {browserKey, since, at}) — a
      // browser key, never a name (this digest also reaches agents); the client names it from its own session rows
      floor: ff.floor, lastProbe: ff.lastProbe, // B-0b8c: + the probe's state (an 'unknown' says whether the ladder still asks)
      // P4 (§7.1): the provider rows with their capability cells + the local
      // verdict — a control the digest's consumers disable WITH its reason
      providers: B.providerRows({ desktopConsent: desktopConsent() }),
      // P4 second half (§7.4): the backend CHIP per profile, the seat reading
      // per key row in its three states, the agent's blocked CLAIMS and the
      // per-site memory (claims with who made them) — the switcher's inputs
      chips: Object.fromEntries(named().map((p) => [p.id, chipFor(p)])),
      // the rebuilt switch dialog (2026-09-27): the chip's FACT unstringified + the backends a switch dialog would
      // draw a card for (SW.switchChoices — no fs read, no key resolve); an empty `choices` ⇒ no entry point offers it
      backends: Object.fromEntries(named().map((p) => [p.id, backendFactFor(p)])),
      seats: seatStates(), majors: { ...reg.majors }, blocked: reg.blocked.map((b) => ({ ...b, text: SW.blockedText(b) })), siteHints: reg.siteHints.map((h) => ({ ...h })),
      switching: [...switching],
      // P5: what the recorder adds (recording state per profile, trace on/off)
      ...digestExtra(),
    };
  }
  /** `chromium 146`: the profile's backend + the major it
   *  is known to write (its own record first, else the backend's last launch). */
  function chipFor(p) {
    const f = SW.backendFact(p, { seats: reg.seats, majors: reg.majors });
    return SW.backendChip({ provider: f.id, major: f.major, tier: f.plan });
  }
  /** The digest's `backends[id]`: the chip's fact + the switch choices (the dialog's cards, never the key/binary/version). */
  function backendFactFor(p) {
    return { ...SW.backendFact(p, { seats: reg.seats, majors: reg.majors }), choices: SW.switchChoices({ profile: p, providerIds: providerIds(), rowOf, controlOf: control }) };
  }
  /** Every key row's seat reading in its three states (known-fresh / known-
   *  stale / unknown) with `used` = this instance's own count. */
  function seatStates() {
    const out = {};
    for (const id of SW.KEY_IDS) {
      const rec = reg.seats[id] || {};
      const st = SW.seatState({ tier: rec.tier, total: rec.total, at: rec.at, now: now() });
      const provider = SW.KEY_ROWS[id].provider;
      out[id] = { ...st, used: runningOf(provider).length, source: rec.source || null, clusterKey: rec.clusterKey || null, provider };
    }
    return out;
  }
  /** The live browsers on a provider — the keeper's OWN count (§12.35: no
   *  vendor interface answers "how many seats is this key holding"). */
  function runningOf(provider) {
    return Object.values(reg.browsers).filter(B.isLiveBrowser).map((r) => profile(r.profileId)).filter((p) => p && String(p.provider) === String(provider)).map((p) => ({ profileId: p.id, label: p.label }));
  }
  function profile(id) { ensureLoaded(); return reg.profiles.find((p) => p.id === id) || null; }
  function profileByRef(ref) { ensureLoaded(); return B.findProfile(named(), ref); }
  function browserOf(profileId) { ensureLoaded(); return reg.browsers[profileId] || null; }
  /** lane chrome-157 (vault-login round 32, ruling Q8): THE one same-browser identity of a profile — browserIdentityOfRecord over
   *  this keeper's record (a watch hands its url for a browser the keeper has no record of). */
  function browserIdentityOf(profileId, { url = '' } = {}) { ensureLoaded(); return browserIdentityOfRecord(reg.browsers[String(profileId || '')] || null, url); }
  function leasesFor(browserKey, opts) { ensureLoaded(); return B.leasesOf(reg.leases, browserKey, opts).map(leaseView); }
  function leasesOn(profileId) { ensureLoaded(); return reg.leases.filter((l) => l.profileId === profileId).map(leaseView); }
  /**
   * lane browsers-stop (majordomo piece 6): every RUNNING browser with the facts browsers.stop's verdict reads — a READ (no
   * file, no registry write; the leases through leasesOn, a CONVERSATION reader). A conversation's OWN browser has its owner
   * as its one holder; a HELPER's browser (a child key) is its own kind and keeps nothing; a named profile's holders are its
   * leases and the person's own browsing is its human row; an attached external browser is its own kind. tabsKept is true
   * only where the keeper really keeps the tabs (a conversation's own browser, the kept store wired). inFlight = what the
   * dialog watch reports in flight on THIS browser — the fact asked for THIS profile (a fact on another profile of the same
   * conversation never hides it), mapped state by state: a page dialog, a browser prompt (a file chooser or a sign-in), a
   * passkey ceremony are in flight; a blind tab, a navigation loop and an unresponsive page are not. turn = the holder's turn
   * as the idle release reads it (null = unknown). Nothing here judges: src/browser-profiles.js stopVerdict does.
   */
  const IN_FLIGHT = Object.freeze({ dialog: 'a page dialog', prompt: 'a browser prompt (a file chooser or a sign-in)', passkey: 'a passkey ceremony' });
  // B-e799: a paired machine's stop outcome, kept for the manager's stop that asked it (read once, then dropped) — in memory only
  const stopOutcomes = new Map();
  /** The record's words for a paired machine's structured stop outcome (null = clean). A survivor is NAMED, never signalled. */
  const remoteStopWords = (host, r) => {
    const ids = (xs) => (Array.isArray(xs) ? xs : []).filter((x) => x && Number.isInteger(x.pid)).map((x) => `pid ${x.pid}`).join(', ');
    if (r.outcome === 'stopped') return null;
    if (r.outcome === 'survived') return `${host}: its browser is still running there after the stop (${ids(r.survivors) || 'its daemon'}) — nothing was freed; the machine's own process list decides it`;
    // round wvdrkjdvx (1)/(3): «not started by VibeSpace» ONLY for a holder the lock verdict calls the user's (no launch mark of ours);
    // any other foreign holder is said in the verdict's own words; an idle daemon that ended is said as such
    const hp = r.holder && Number.isInteger(r.holder.pid) ? ` (pid ${r.holder.pid})` : '';
    if (r.outcome === 'not_ours') return r.holder && r.holder.user === true ? `${host}: a browser VibeSpace did not start holds this profile's folder there${hp} — it was left running` : `${host}: this profile's folder there is held by another process${hp}: ${String((r.holder && r.holder.why) || 'its holder is not this browser').slice(0, 200)} — it was left running`;
    if (r.outcome === 'not_running') return r.daemonEnded && r.daemon && Number.isInteger(r.daemon.pid) ? `${host}: its browser was not running there; its idle daemon (pid ${r.daemon.pid}) was ended` : `${host}: it was not running there — nothing was stopped`;
    if (r.outcome === 'failed') return `${host}: its stop failed (${String(r.error || 'close --all failed').slice(0, 160)}) — the browser may still run there`;
    return `${host}: its stop answered an outcome VibeSpace does not know (${String(r.outcome).slice(0, 40)})`;
  };
  function stopRows() {
    refuseIfHeld('the running browsers');   // piece 6 meets the hold laws: while held the registry is EMPTY because it is unread — «none runs» would be a false answer
    const out = [];
    for (const p of reg.profiles) {
      const rec = reg.browsers[p.id];
      if (!B.isLiveBrowser(rec) || stopping.has(p.id)) continue;
      const own = isEph(p);
      const helper = own && !B.isBrowserKey(p.owner.id);
      const scope = own ? null : p.id;
      const leases = leasesOn(p.id);
      const keys = own ? [p.owner.id] : [...new Set(leases.map((l) => l.browserKey))];
      const sessionOf = (bk) => { const l = leases.find((x) => x.browserKey === bk); return l ? l.sessionId || null : null; };
      const holders = keys.map((bk) => { const f = convFacts(bk); return { browserKey: bk, sessionId: sessionOf(bk), turn: f.turn === undefined ? null : f.turn }; });
      const takenOver = takeoversHeld() ? null : keys.some((bk) => inputStateFor(bk, scope).input === 'user' || !!openRequestFor(bk, scope));   // r4130 MUST 2: the requests HELD ⇒ «unknown», never «nobody asked»
      const human = own ? null : humanOf(p.id);
      const viewers = keys.reduce((n, bk) => n + (watchers.get(inputKey(bk, scope)) || 0), 0) + (human ? Number(human.viewers) || 0 : 0);
      let inFlight = null;
      for (const bk of keys) {
        let st = null; try { st = stuckSource ? stuckSource(bk, p.id) || null : null; } catch { st = null; }
        if (st && (!st.profileId || st.profileId === p.id) && Object.prototype.hasOwnProperty.call(IN_FLIGHT, st.state)) { inFlight = IN_FLIGHT[st.state]; break; }
      }
      const u = live.get(p.id);
      out.push({ id: p.id, kind: rec.external ? 'external' : helper ? 'helper' : own ? 'own' : 'profile', machine: !rec.external && !isLocalRec(rec) ? (rec.hostId || null) : null, name: p.label || null, running: true,   // B-e799: a paired machine's browser is a named profile on its machine (own and helper browsers run only here)
        memBytes: u && Number.isFinite(u.memBytes) ? u.memBytes : null, lastCommandAt: Number.isFinite(p.lastVerbAt) ? p.lastVerbAt : null,
        holders, takenOver, viewers, personBrowsing: !!human, inFlight, tabsKept: own && !helper && !!keptStore() });
    }
    return out;
  }
  /** lane browsers-stop: the manager's stop — the keeper's own stop under its own closed reason (`manager`: automatic for the
   *  kept tabs, never deliberate). → { freed, why } — the TRUTH of what was freed: a browser still running, or ANY residue the stop
   *  left in its error field (the reason word aside), is NOT freed. Who stopped it is the record's `stoppedBy` (the Browser panel
   *  words it). B-e799: a PAIRED MACHINE's browser is asked for its structured outcome (`facts`) and is FREED only on «stopped»: a
   *  survivor is named (never signalled), a browser of another namespace holding its folder, a failed close, nothing running there —
   *  each its own why; a machine that cannot be asked refuses by name before anything moves (stop() throws). */
  async function managerStop(profileId) {
    refuseIfHeld('the stop');   // piece 6 meets the hold laws: refused by name before anything is stopped (the registry unread names no record)
    const rec0 = reg.browsers[profileId];
    const remote = !!rec0 && !isLocalRec(rec0) && !rec0.external;
    stopOutcomes.delete(profileId);
    await stop(profileId, { why: 'manager' });
    const rec = reg.browsers[profileId];
    if (!rec) return { freed: false, why: 'its record is gone' };
    if (remote) {
      const o = stopOutcomes.get(profileId) || null; stopOutcomes.delete(profileId);
      if (rec.lastError === 'manager') rec.lastError = null;   // who stopped it is `stoppedBy` — the panel says it; never the error field
      else if (typeof rec.lastError === 'string' && rec.lastError.startsWith('manager; ')) rec.lastError = rec.lastError.slice('manager; '.length);
      commit();
      if (!o) return { freed: false, why: `${rec.hostId || 'the machine'} did not say what its stop did` };
      return o.outcome === 'stopped' ? { freed: true, why: null } : { freed: false, why: o.why || `${rec.hostId}: ${o.outcome}` };
    }
    let left = typeof rec.lastError === 'string' ? rec.lastError : '';
    if (left === 'manager') left = ''; else if (left.startsWith('manager; ')) left = left.slice('manager; '.length);
    rec.lastError = left || null;   // who stopped it is `stoppedBy: 'manager'` (the stop wrote it) — the panel says it; never the error field
    commit();
    const freed = !B.isLiveBrowser(rec) && !left;
    return { freed, why: freed ? null : (left || 'it is still running') };
  }

  // ── profiles ──
  function mintId() { for (;;) { const id = B.mintProfileId(crypto.randomBytes(4).toString('hex')); if (!reg.profiles.some((p) => p.id === id)) return id; } }
  function userConfig() { try { return JSON.parse(fs.readFileSync(path.join(homeDir, B.USER_CONFIG_REL), 'utf8')) || {}; } catch { return {}; } }
  // takeover r3: the keeper's own config files (see `configured`) — written 0600 under data/browser-env/,
  // re-written only when their content changes (the user edited the file / the headed setting moved)
  const CONFIG_DIR = path.join(dataDir, 'browser-env');
  /** lane engine-args-string: line `n` of a config the keeper wrote (under CONFIG_DIR only) — the driver's refusal names its file + line */
  const ownConfigLine = (f, n) => { const r = path.resolve(String(f)); if (!r.startsWith(CONFIG_DIR + path.sep)) return null; try { return fs.readFileSync(r, 'utf8').split('\n')[n - 1] || null; } catch { return null; } };
  const configMemo = new Map();
  const configSaid = new Set();
  const configSay = (key, line) => { if (configSaid.has(key)) return; configSaid.add(key); try { log.warn?.(`[browser] ${line}`); } catch { /* none */ } };
  // lane headless-fallback: THIS machine's display, probed at every LOCAL launch; the planned config beside the keeper's files
  const displays = require('./browser-display-config.js').create({ dir: path.join(CONFIG_DIR, 'display'), writeJson: writeJsonAtomic, log, env: () => rtEnv, now, vncDisplay });
  /**
   * LANE H VERIFY r4 (MAJOR 2): THE LAUNCH MARK. Every browser THIS keeper launches runs with a config whose `args` carry
   * `--vibespace-keeper=<mark>` (a named profile's id, an ephemeral's browser key) — the file `machine-<mark>.json` /
   * `machine-ephemeral-<mark>.json`, the same rule as the unmarked one plus that switch. Measured on the real 0.38.1: the
   * switch reaches the Chrome's (title-rewritten) command line, Chrome runs normally with it, and a CONFIG that differs
   * (the mark added or dropped) makes the daemon's next verb RELAUNCH its Chrome — so a record keeps the config it was
   * launched with for every later call (`rec.mark`, set at the launch; a record launched before the mark keeps the
   * unmarked file, its Chrome proven by the pre-mark rule). A lease's own session never launches (it reaches the keeper's
   * browser over CDP) and keeps `machine.json`.
   */
  const MARK_RE = /^[a-z0-9][a-z0-9.-]{0,80}$/i;
  const markOf = (p) => (p ? (isEph(p) ? p.owner.id : p.id) : null);
  function markFileName(kind, mark) {
    const m = mark && MARK_RE.test(String(mark)) ? String(mark) : '';
    return (kind === 'ephemeral' ? 'machine-ephemeral' : 'machine') + (m ? '-' + m : '') + '.json';
  }
  /** The config ONE call runs with (no config in its env): the keeper's own session of a named profile ⇒ that record's
   *  launch file; an ephemeral's pairs (no config of their own) ⇒ its record's launch file; anything else (a lease's
   *  session, a mediated namespace) ⇒ `machine.json`. */
  function configForCall(ns, session, ex) {
    if (ns) {
      if (session && session !== ns) return machineConfigFile('machine');
      const rec = ns.startsWith('vs-') ? recordFor(ns.slice(3)) : null;
      return machineConfigFile('machine', rec && rec.mark ? rec.mark : null);
    }
    return ephemeralConfigFor(ex);
  }
  function recordFor(profileId) { try { const p = profile(profileId); return p && !isEph(p) ? reg.browsers[profileId] || null : null; } catch { return null; } }
  /** lane headless-fallback: the browser RECORD one call acts on (its launch's display fact decides the config it names) —
   *  the keeper's own session of a named profile, an ephemeral's pairs (by their session); a lease's session never
   *  launches (it reaches the keeper's browser over CDP) ⇒ none. */
  function recordForCall(ns, session, ex) {
    if (ns) return session && session !== ns ? null : (ns.startsWith('vs-') ? recordFor(ns.slice(3)) : null);
    const sess = ex && typeof ex.AGENT_BROWSER_SESSION === 'string' ? ex.AGENT_BROWSER_SESSION : '';
    try { const p = sess ? reg.profiles.find((x) => isEph(x) && B.sessionNameFor(x.owner.id) === sess) : null; return p ? reg.browsers[p.id] || null : null; } catch { return null; }
  }
  /** verify r2 (H1): the BROWSER a call reaches — whichever daemon it talks to (the keeper's own session, a lease's session
   *  in the profile's namespace, a mediated lease's namespace `vs-<profileId>-<browserKey>`, an ephemeral's namespace or
   *  its pairs) runs against ONE Chrome, and that Chrome's daemon decides the CLI version every client of it must be. */
  function browserRecordForCall(ns, ex) {
    try {
      if (ns) {
        const rest = String(ns).startsWith('vs-') ? String(ns).slice(3) : '';
        if (!rest) return null;
        let p = reg.profiles.find((x) => x.id === rest) || null;
        if (!p) { const i = rest.indexOf('-bk-'); if (i > 0) p = reg.profiles.find((x) => x.id === rest.slice(0, i)) || null; }
        if (!p) p = reg.profiles.find((x) => isEph(x) && x.owner.id === rest) || null;
        return p ? reg.browsers[p.id] || null : null;
      }
      const sess = ex && typeof ex.AGENT_BROWSER_SESSION === 'string' ? ex.AGENT_BROWSER_SESSION : '';
      const p = sess ? reg.profiles.find((x) => isEph(x) && B.sessionNameFor(x.owner.id) === sess) : null;
      return p ? reg.browsers[p.id] || null : null;
    } catch { return null; }
  }
  /** An ephemeral browser's keeper file, found by the SESSION its pairs name (`vs-<browserKey>`). */
  function ephemeralConfigFor(pairEnv) {
    const sess = pairEnv && typeof pairEnv.AGENT_BROWSER_SESSION === 'string' ? pairEnv.AGENT_BROWSER_SESSION : '';
    let rec = null;
    try { const p = sess ? reg.profiles.find((x) => isEph(x) && B.sessionNameFor(x.owner.id) === sess) : null; rec = p ? reg.browsers[p.id] || null : null; } catch { rec = null; }
    return machineConfigFile('ephemeral', rec && rec.mark ? rec.mark : null);
  }
  /** lane browser-stuck: does the file for (kind, mark) hold page dialogs? No mark ⇒ a lease session (never launches) ⇒
   *  yes; a mark ⇒ only the record launched with it (named: the profile id; ephemeral: its browser key). */
  function holdsDialogs(kind, mark) {
    if (!mark) return kind !== 'ephemeral';
    try {
      if (kind === 'ephemeral') { const p = reg.profiles.find((x) => isEph(x) && x.owner.id === mark); return !!(p && reg.browsers[p.id] && reg.browsers[p.id].holdDialogs); }
      return !!(reg.browsers[mark] && reg.browsers[mark].holdDialogs);
    } catch { return false; }
  }
  /** lane browser-propose (step 1): does the file for (kind, mark) carry the automation flag? Only a record LAUNCHED
   *  with it (`rec.automationFlag`, stamped at its launch from `browser.automationFlag` — the holdDialogs precedent: a
   *  different launch config relaunches Chrome, so a browser running at the update keeps its file until its next launch).
   *  No mark (a lease's session never launches) ⇒ no. */
  function automationFlagFor(kind, mark) {
    if (!mark) return false;
    try {
      if (kind === 'ephemeral') { const p = reg.profiles.find((x) => isEph(x) && x.owner.id === mark); return !!(p && reg.browsers[p.id] && reg.browsers[p.id].automationFlag); }
      return !!(reg.browsers[mark] && reg.browsers[mark].automationFlag);
    } catch { return false; }
  }
  /** lane browser-stderr-pipe: does the file for (kind, mark) carry the quiet log switches (BE.QUIET_LOG_ARGS)? Only a
   *  record LAUNCHED with them (`rec.quietLog`, the automationFlag precedent: a different launch config relaunches Chrome,
   *  so a browser running at the update keeps its file until its next launch). No mark ⇒ no. B-1789 cure: an EPHEMERAL's
   *  file too (named: the profile id; ephemeral: its browser key) — its launch is stamped since the cure. */
  function quietLogFor(kind, mark) {
    if (!mark) return false;
    try {
      if (kind === 'ephemeral') { const p = reg.profiles.find((x) => isEph(x) && x.owner.id === mark); return !!(p && reg.browsers[p.id] && reg.browsers[p.id].quietLog); }
      return !!(reg.browsers[mark] && reg.browsers[mark].quietLog);
    } catch { return false; }
  }
  const automationFlagOn = () => setting('browser.automationFlag', true) !== false;
  function machineConfigFile(kind = 'machine', mark = null) {
    const markOk = mark && MARK_RE.test(String(mark)) ? String(mark) : null;
    const file = path.join(CONFIG_DIR, markFileName(kind, markOk));
    const src = path.join(homeDir, B.USER_CONFIG_REL);
    let user = null;
    try { user = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (e) {
      if (e && e.code !== 'ENOENT') { configSay(`unreadable:${src}`, `${src} does not parse (${e.message}) — the browser CLI would refuse it too; the keeper's calls keep the CLI's own config search until it is fixed`); return null; }
      user = null;
    }
    if (user !== null && (typeof user !== 'object' || Array.isArray(user))) { configSay(`notobj:${src}`, `${src} is not a JSON object — the keeper's calls keep the CLI's own config search until it is fixed`); return null; }
    const h = headedSetting();
    // lane browser-stuck (measured on 0.38.1): the daemons AUTO-ACCEPT alert + beforeunload silently (a beforeunload
    // accept loses the typed draft) — `noAutoDialog` holds them for a decision the watch reports. A lease session's file
    // (unmarked) always carries it; a LAUNCH file only for a record launched with it (`rec.holdDialogs`, stamped at the
    // launch — the mark precedent: a different launch config relaunches Chrome, so a browser running at the update keeps
    // its file until its next launch)
    const hold = holdsDialogs(kind, markOk);
    const flag = automationFlagFor(kind, markOk); // lane browser-propose: the chromium launch stops announcing automation
    let cfg;
    // B-1789 cure: both files end their args with THE LAUNCH TAIL (B.launchTail — the quiet log switches, then the mark), the
    // switches only for a record launched with them (quietLogFor: its stamp)
    if (kind === 'ephemeral') cfg = B.generatedConfig({ userConfig: user || {}, projectConfig: null, pinnedDir: null, headed: h, mark: markOk, holdDialogs: hold, automationFlag: flag, quietLog: quietLogFor(kind, markOk) });
    else { cfg = VERBS.sanctionedConfig({ user }).config; if (h !== null) cfg.headed = h; if (flag) cfg.args = B.withAutomationFlag(cfg.args, { on: true }); if (markOk) cfg.args = B.launchTail(ENV.withEnvironmentArgs(cfg.args, envArgsFor(kind, markOk)), markOk, { quiet: quietLogFor(kind, markOk) }); if (hold) cfg.noAutoDialog = true; }
    { const a = VERBS.driverArgsText(cfg.args); if (!a.ok) { configSay(`args:${file}`, `the keeper's ${kind} browser config could not be written at ${file}: ${a.error} — its calls keep the CLI's own config search`); return null; } if (a.args !== cfg.args) cfg.args = a.args; } // lane engine-args-string: THE one writer of the driver's `args` (a list leaves as its one line)
    const text = JSON.stringify(cfg);
    const memoKey = kind + '|' + (markOk || '');
    const memo = configMemo.get(memoKey);
    // r4 (takeover finding 7, symmetry with the CLI's composeConfig): the memo names the file only while it is
    // still the keeper's own — a regular file (lstat: a symlink swapped in is NOT followed), this uid's, with the
    // content it wrote; anything else is re-written (the atomic rename replaces a planted link itself)
    const own = () => { try { const st = fs.lstatSync(file); return st.isFile() && !st.isSymbolicLink() && (typeof process.getuid !== 'function' || st.uid === process.getuid()) && fs.readFileSync(file, 'utf8') === JSON.stringify(cfg, null, 2); } catch { return false; } };
    if (memo === text && own()) return file;
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      writeJsonAtomic(file, cfg);
      const back = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!back || typeof back !== 'object' || Array.isArray(back)) throw new Error('read-back was not an object');
      configMemo.set(memoKey, text);
      return file;
    } catch (e) {
      configSay(`write:${file}`, `the keeper's ${kind} browser config could not be written at ${file} (${e && e.message}) — its calls keep the CLI's own config search (a project agent-browser.json in this process's directory would apply)`);
      return null;
    }
  }
  /** lane tailnet-names: THE TAILNET ROAD of a launch — the door's verdict (src/server/tailnet-door.js over PURE src/tailnet-reach.js)
   *  → the record's stamp `{arg, mode, why}`: `arg` = the ONE switch (--proxy-pac-url=http://127.0.0.1:<door>/tailnet-<token>.pac,
   *  comma-free) every call of the browser carries (the derived config on the driver's road, the argv on the attach road), or
   *  null and why not. A proxy the profile, the person's browser config or the launch's ENV names (HTTPS_PROXY / HTTP_PROXY /
   *  ALL_PROXY — Chrome on Linux honours them; r2) WINS (Chromium ranks a PAC above --proxy-server and the env — the PAC is
   *  never added beside one); never throws (a broken door = no PAC). */
  const userConfigProxy = () => {
    try { const u = JSON.parse(fs.readFileSync(path.join(homeDir, B.USER_CONFIG_REL), 'utf8')); return !!(u && typeof u === 'object' && !Array.isArray(u) && ((typeof u.proxy === 'string' && u.proxy.trim()) || VERBS.driverArgsList(u.args).some((a) => ENG.PROXY_ARG_RE.test(a)))); } catch { return false; }
  };
  async function tailnetFor(p, { engine = false, remote = false, env = rtEnv } = {}) {
    try {
      const explicit = B.proxyRoadOf({ profileProxy: !!(p && p.proxy), userConfigProxy: userConfigProxy(), envProxy: !!require('../tailnet-reach.js').envProxyOf(env), tailnet: true }).explicit;   // B-8b87: THE ONE ranking (src/browser-profiles.js proxyRoadOf)
      const v = await (tailnet || require('./tailnet-door.js')).launch({ explicit, engine, remote, label: (p && p.label) || '' });
      return v ? { arg: v.on && v.arg ? v.arg : null, mode: v.mode || null, why: v.on ? null : v.why || null } : null;
    } catch { return null; }
  }
  /** lane tailnet-names: a browser's launch stamp (the audit route's LAW 2 words) — undefined when it has no record */
  function tailnetOf(profileId) { const r = reg.browsers[String(profileId || '')]; return r ? (r.tailnet || null) : undefined; }
  /** The config file a command on THIS browser runs with — what `/resolve`
   *  names to the CLI (the file the keeper's own calls use): the pairs' own
   *  AGENT_BROWSER_CONFIG, else the keeper's file for the kind. null = none
   *  could be written (the CLI composes its own). */
  function configFileFor({ ephemeral = false, pairs = null } = {}) {
    const pe = S0.pairsToEnv(Array.isArray(pairs) ? pairs : []);
    const own = pe[VERBS.CONFIG_KEY];
    // lane headless-fallback: an ephemeral whose launch fell back names the PLANNED file (the launch's own) — never the base
    const rec = ephemeral ? recordForCall(null, null, pe) : null;
    const planned = (file) => (rec && rec.display && file ? displays.fileFor(file, rec.display) : file);
    const engined0 = (file) => (rec && rec.engineView && file ? displays.engineFileFor(file, rec.engineView) : file); // lane engine-plugin: the engine's view rides the agent's commands too
    const engined = (file) => { const f = engined0(file); return rec && rec.tailnet && rec.tailnet.arg && f ? displays.tailnetFileFor(f, rec.tailnet) : f; }; // lane tailnet-names: …and the tailnet PAC its launch carried
    if (typeof own === 'string' && own.startsWith('/')) return engined(planned(own));
    // r4: an ephemeral's command runs with the file its browser was LAUNCHED with (marked when the keeper launched it) —
    // a different one would relaunch its Chrome (measured); a lease's session with machine.json (it never launches)
    return ephemeral ? engined(planned(ephemeralConfigFor(pe))) : machineConfigFile('machine');
  }
  /**
   * Create a profile. `owner` = { kind, id }: a session-created profile is
   * owned by its CONVERSATION (kind 'session', id = browserKey — the identity
   * that survives resume), a UI-created one by the instance. The directory is
   * made 0700 under ~/.agent-browser/ (the CLI's own root, so `agent-browser
   * profiles` lists it too); an adopted directory keeps its path.
   */
  function createProfile(input = {}, { owner = null, dir = null, legacy = false, createdBy = null, use = null, knownKeys = null, by = 'user', builds = null, engine = null, id: mintedId = null, clonedFrom = null } = {}) {
    refuseIfHeld('creating a profile');   // the B-f276 remainder: refused by name while the registry is held (nothing minted, nothing written)
    ensureLoaded();
    const v = B.validateProfileInput(input, { existing: named(), control, mediation: mediationOn() });
    if (!v.ok) throw namedError(v.code, v.error, v.why ? { why: v.why } : {});
    // lane browser-admin (the New profile… dialog): "Who can use it" is chosen AT the create — the rows the route resolved
    // (a picked live session → its browser key) are judged by THE write's verdict over an empty record, BEFORE anything is
    // minted: a refusal writes nothing, and the record is born with its list (ONE write, never create-then-PATCH)
    const useRow = use != null ? rowFromUse(use, { knownKeys, label: v.value.label }) : B.rowForCreate(owner, { conversationOf: conversationOfKey });   // lane grants-unify
    // lane browser-admin 2a: the Chrome BUILD the profile runs — the USER's choice only (an agent's route passes `by`),
    // judged by THE verdict over the machine's own list (`builds` = the route's fresh listing of a paired machine; this
    // machine's is read here). A new directory was never written: no version ladder at the create.
    let choice = choiceAtCreate(input.browser, { provider: v.value.provider, host: v.value.host, by, builds, engine, label: v.value.label });
    // lane engine-plugin: THE DEFAULT POLICY — a brand-new local chromium profile naming no build is born with `browser.defaultEngine`'s
    // choice (the owner's / the fleet's — never an agent's; judged at its launch like any choice); an adopted or copied folder keeps its browser
    if (input.browser == null && dir == null && !clonedFrom && !v.value.host && (B.providerRow(v.value.provider) || {}).buildChoice) { const pc = policyChoice(); if (pc) choice = pc; }
    // P4: the ROW said a paired machine may run it; whether the id names one
    // is this instance's host registry's answer (refused by name, never a
    // silent local fallback)
    if (v.value.host && machinesHeld()) throw namedError('host_unavailable', `the paired machines cannot be read right now — ${machinesHeld()}`);
    if (v.value.host && !knownHost(v.value.host)) throw namedError('unsupported-host', `${JSON.stringify(v.value.host)} is not a paired machine on this instance — pair it first (Remote → Pair a device), or leave host empty for this machine`);
    const id = mintedId || mintId(); // lane browser-profile-clone: the clone mints the id (its directory's name) before the copy
    // The directory is OURS only for a row that owns one, on THIS machine: a
    // paired machine composes and owns its own (browser-serve), `cdp` has none.
    const ownsHere = v.value.ownsDir && !v.value.host;
    const d = dir ? String(dir) : (ownsHere ? path.join(homeDir, '.agent-browser', B.profileDirName(id)) : null);
    if (!dir && d) { try { fs.mkdirSync(d, { recursive: true, mode: 0o700 }); } catch (e) { throw namedError('dir_unwritable', `cannot create the profile directory ${d}: ${e.message}`); } }
    const { ownsDir, ...fields } = v.value;
    const rec = B.newProfileRecord({ id, ...fields, dir: d, owner, legacy, now: now(), createdBy });
    if (choice.kind !== 'default') rec.browser = choice;
    if (clonedFrom) rec.clonedFrom = { ...clonedFrom }; // lane browser-profile-clone: born with where its logins came from (ONE write)
    reg.profiles.push(rec);
    if (!legacy) bornWithRow(rec, useRow, by); else bornWithRow(rec, { to: [{ kind: 'everyone' }], except: [] }, by);   // lane grants-unify: the list is the store's row
    commit();   // U5b: a create is OWED (test-browser-pin) — the routes wait for its landing (src/routes/browser.js landedOf)
    log.log?.(`[browser] profile ${id} "${rec.label}" created${choice.kind === 'build' ? ' (Chrome ' + choice.version + ')' : choice.kind === 'path' ? ' (chrome at ' + choice.path + ')' : ''} (${rec.provider}${rec.host ? ' on ' + rec.host : ''}${rec.cdpPort ? ', cdp port ' + rec.cdpPort : ''}${isMediated(rec) ? ', separate tabs (mediated)' : ''}, ${legacy ? 'legacy shared' : 'usable by ' + whoWords(rec)}${rec.createdBy ? ', created by ' + rec.createdBy : ''})${d ? ' at ' + d : ''}`);
    return pview(rec);
  }
  // ── lane browser-admin 2a: WHICH CHROME BUILD a profile runs ──
  /** This machine's builds (`~/.agent-browser/browsers`, a readdir + a stat per build — asked on a user act or a
   *  launch, never per command). */
  function buildsHere() { return BB.listBuilds({ homeDir }); }
  /** A machine's builds: this one in-process, a paired machine through the `browser-serve` op's `builds` action (the
   *  client refuses an agent without the `browser-builds` capability BY NAME — never asked, never a hang). */
  async function buildsFor(hostId = null) {
    if (!hostId) return BB.buildsView(buildsHere());
    try { const r = await acc().call(hostId, 'builds', {}); return r && r.listing ? (r.ready ? { ...r.listing, ready: r.ready } : r.listing) : { ok: false, code: 'builds_unreadable', error: `${hostId} answered no build list` }; } // lane remote-profile-start: + the machine's `ready`
    catch (e) { return { ok: false, code: e && e.code === 'builds_unsupported' ? 'builds_unsupported' : (e && e.code) || 'host_unavailable', error: String(e && e.message) }; }
  }
  /** The verdict at a CREATE: a choice that is not the default is the user's, chromium's, and on that machine's list
   *  (`builds` for a paired machine comes from the route; this machine's is read now). Throws by name. */
  function choiceAtCreate(raw, { provider, host = null, by = 'user', builds = null, label = '', engine = null } = {}) {
    const c0 = BB.normalizeBrowserChoice(raw);
    if (c0 && c0.kind === 'default') return c0;
    const list = c0 && c0.kind === 'build' ? (host ? builds : buildsHere()) : null;
    const pf = c0 && c0.kind === 'path' && !host ? BB.fileFact(c0.path) : null;
    // lane engine-plugin: an engine plugin's probe is I/O — the route asks it first and hands the FACT in (`engine`, like `builds`)
    const eng = c0 && c0.kind === 'plugin' ? (host ? engineOffMachine(host) : engine) : null;
    const v = BB.browserChoiceVerdict({ choice: raw, provider, by, builds: list, pathFact: pf, engine: eng, machine: host || 'this computer', label });
    if (!v.ok) throw namedError(v.code, v.error, { ...(v.version ? { version: v.version } : {}), ...(v.failed ? { failed: v.failed } : {}) });
    return v.choice;
  }
  /** The chosen build's executable for a LOCAL chromium launch, judged NOW (a build that vanished since it was chosen is
   *  refused `browser_build_missing` by name — never a silent fall back to another build); a missing one is MARKED on
   *  the record (the panel row says it) and filed ONCE as a For-you item (origin browser); a present one clears the mark.
   *  → `{executablePath}` ({} for the default). Throws by name. */
  function launchBuildOf(p) {
    const c = BB.normalizeBrowserChoice(p.browser);
    if (!c || c.kind === 'default' || !(B.providerRow(p.provider) || {}).buildChoice) { if (p.buildMissing) { delete p.buildMissing; dirty = true; } return {}; }
    if (c.kind === 'plugin') return { engineChoice: c }; // lane engine-plugin: judged inside the in-flight start (launchEngineOf — its asks are I/O)
    const v = BB.browserChoiceVerdict({ choice: c, provider: p.provider, by: 'user', builds: c.kind === 'build' ? buildsHere() : null, pathFact: c.kind === 'path' ? BB.fileFact(c.path) : null, label: p.label });
    if (v.ok) { if (p.buildMissing) { delete p.buildMissing; dirty = true; log.log?.(`[browser] ${p.id} "${p.label}": its chosen Chrome build is back (${c.kind === 'build' ? c.version : c.path})`); } return { executablePath: v.executablePath }; }
    noteBuildMissing(p, c, v);
    throw namedError(v.code === 'browser_path_missing' || v.code === 'browser_path_not_executable' ? v.code : 'browser_build_missing', v.error, { version: c.kind === 'build' ? c.version : null });
  }
  // ── lane engine-plugin: A BROWSER ENGINE PLUGIN (design-custom-browser-plugin §1) — the registry's two verbs, the policy ──
  const engs = () => { try { return typeof engines === 'function' ? engines() : engines; } catch { return null; } };
  /** A paired machine has no engine: engine plugins run on the computer VibeSpace runs on (their process is this hub's). */
  const engineOffMachine = (host) => ({ code: 'browser_engine_missing', error: `browser engine plugins run on the computer VibeSpace runs on — a profile on ${host} runs that machine's own Chrome builds` });
  /** An engine's PROBE fact on this machine (ONE registry ask over the kernel path VibeSpace resolved) — the fact `{installed,
   *  executable, binaryPath, version, protocol, kinds, features, label}` | a refusal `{code, error}`. */
  async function engineFactOf(id, { host = null } = {}) {
    if (host) return engineOffMachine(host);
    const r = engs();
    if (!r || typeof r.probe !== 'function') return ENG.missingOf({ id });
    const v = await r.probe(id);
    return v.ok ? withKernelFact(v.fact) : { code: v.code, error: v.error, ...(v.failed ? { failed: v.failed } : {}) }; // B-a470: the plugin's own error rides to the card
  }
  // lane engine-distribution: the engine RECORD's facts beside the probe's — the version VibeSpace measured, the download
  const eds = () => { try { return typeof engineDistribution === 'function' ? engineDistribution() : engineDistribution; } catch { return null; } };
  function withKernelFact(f) {
    const d = eds();
    // L1b r2: an OWNER's program reads the record by ITS stamp — a version measured for another file is not this one's
    const k = d && typeof d.kernelFact === 'function' ? d.kernelFact(f.id, f.source === 'user' ? { source: 'user', stamp: f.binaryStamp || null } : {}) : null;
    if (!k) return f;
    // lane fleet-plugin-catalog r4 (N2): the WHOLE kernel fact — every field kernelFact gains (r3's `landing`, r4's `discarded`) reaches
    // the engines view, Change build… and New profile… (a hand-copied list dropped `landing`: the card's words never showed)
    return { ...f, measuredVersion: f.installed ? k.measuredVersion : null, measuredAt: f.installed ? k.measuredAt : null, measureFailed: !!(f.installed && k.measureError), kernel: { ...k } };
  }
  /** B-cf42: the RUNNING browsers on an engine whose kernel answers otherwise than its probe (their profiles' `kernelLive` marks, the
   *  profile still on that engine) — the card's count and the first one's answer; null = none. */
  const liveOfEngine = (id) => { const ms = reg.profiles.filter((p) => p && p.kernelLive && p.kernelLive.engine === id && p.browser && p.browser.kind === 'plugin' && p.browser.id === id && B.isLiveBrowser(reg.browsers[p.id])); return ms.length ? { n: ms.length, why: ms[0].kernelLive.why, probe: ms[0].kernelLive.probe, live: ms[0].kernelLive.live } : null; };
  /** The engine table as the USER's surfaces read it (Change build…, New profile…, Settings): each row's probe FACT, never its
   *  path (the kernel's place stays here). A paired machine's dialog has none. */
  async function engineRowsView({ host = null } = {}) {
    const r = engs();
    if (host || !r || typeof r.rows !== 'function') return [];
    const out = [];
    for (const row of r.rows()) {
      const f = await engineFactOf(row.id);
      out.push({ id: row.id, label: row.label, family: row.family, plugin: row.version || null, ...(f.code ? { code: f.code, error: f.error, ...(f.failed ? { failed: f.failed } : {}) } : { installed: !!f.installed, executable: !!f.executable, version: f.version, protocol: f.protocol, features: (f.features || []).slice(),
        // lane engine-distribution: 实测 / 声明 — the measured version beats the declared one; the receipt's read; the download
        declaredVersion: f.declaredVersion || null, measuredVersion: f.measuredVersion || null, measuredAt: f.measuredAt || null, integrity: f.integrity || null, kernel: f.kernel || null,
        // lane engine-spi-egress L1b: the kernel's SOURCE ('download' | 'user'), and the core's verdict on the owner's program (never its path)
        source: f.source || 'download', binary: f.userBinary ? { code: f.userBinary.code, why: f.userBinary.why } : null, measureFailed: !!f.measureFailed, geolocationIsolated: f.geolocationIsolated === true && !!f.installed && !!f.executable, live: liveOfEngine(row.id) }) });   // B-9584 r2916 / r3795: the kernel's place fact, said only of a kernel that can run
    }
    return out;
  }
  /** B-9584 r3795: may THIS profile's page say «cannot leak» now? The PURE verdict (ENG.placeIsolatedVerdict) over its record, its
   *  engine's row of the table just read (`rows`, a fresh probe), its live browser's recorded choice and its kernelLive mark. */
  function placeIsolatedFor(profileId, rows = []) {
    let p = null; try { p = profile(String(profileId || '')); } catch { p = null; }
    if (!p) return false;
    const c = p.browser ? BB.choiceView(p.browser) : null;
    const row = c && c.kind === 'plugin' ? (Array.isArray(rows) ? rows : []).find((r) => r && r.id === c.id) || null : null;
    const rg = reg.browsers[p.id];
    const running = rg && B.isLiveBrowser(rg) ? (rg.browserChoice || { kind: 'default' }) : null;
    return ENG.placeIsolatedVerdict({ choice: c, host: p.host || null, ephemeral: isEph(p), row, running, kernelLive: p.kernelLive || null });
  }
  /** THE DEFAULT POLICY now — `browser.defaultEngine`: the user's own stored value › the fleet's (fleet.json `browserEngine`) ›
   *  'default' → `{value, source, fleet: {plugin, default} | null}`. */
  function defaultEngineNow() {
    const own = readSetting('browser.defaultEngine').v;   // B-50e7: held ⇒ the last engine known in this run (nothing known ⇒ the default)
    let fe = null; try { const f = typeof fleetFacts === 'function' ? fleetFacts() : null; fe = f && f.browserEngine && typeof f.browserEngine === 'object' ? f.browserEngine : null; } catch { fe = null; }
    return { ...ENG.defaultEngineOf({ own, fleet: fe }), fleet: fe ? { plugin: fe.plugin || null, default: fe.default === true } : null };
  }
  /** The choice a NEW record is born with when nothing names one — read at a profile's create and at a conversation's
   *  browser's first start, then WRITTEN on the record (a later flip moves new records only). null = the default. */
  const policyChoice = () => ENG.choiceOfDefault(defaultEngineNow().value);
  /** lane engine-spi-egress (L2's F4): the `args` of the config the keeper wrote for this launch (its memo — no file read) with
   *  the display plan applied (`fact`, browser-display planForFact / applyPlan: the ozone pin, software GL) — the keeper's own
   *  list an engine's env list must carry; a WRAPPED launch drops every proxy switch from it (the keeper's proxy is the one).
   *  null when the keeper wrote no config (its calls keep the CLI's own search — the base arguments stand). */
  function plannedArgsOf(kind, mark, fact, { wrapped = false } = {}) {
    let cfg = null; try { cfg = JSON.parse(configMemo.get(kind + '|' + (mark || '')) || 'null'); } catch { cfg = null; }
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return null;
    const plan = DSP.planApplies(fact) ? DSP.planForFact(cfg, fact) : null;
    const list = DSP.argsList((plan && plan.changed ? DSP.applyPlan(cfg, plan) : cfg).args);
    return wrapped ? ENG.withoutProxyArgs(list) : list;
  }
  /** lane engine-spi-egress: THE KEEPER'S PART of an engine launch's env list (the profile road): `kept` = the planned config's
   *  own list (L2's F4: the user's switches, the mark, the display plan's ozone pin) else the base arguments below, the quiet
   *  switches composed before the split (lane engine-args-string r2). A WRAPPED launch (its proxy switches ride the wrapper, last)
   *  always carries this list — it REPLACES the config's, whose proxy switches (a user's pac url, no-proxy) are dropped. */
  function engineEnvOf(p, prow, be, kept, quietLog) {
    // lane engine-spi-egress L1b r6: on a WRAPPED launch the person's own list keeps switches only (a bare -- there would end the
    // switches before the keeper's proxy pair) — what is dropped is SAID (their config is theirs: dropped by name, never refused)
    const w = be.egress ? ENG.wrappedOwnArgs(kept || engineBaseArgs(p, prow, quietLog)) : null;
    if (w && w.dropped.length) log.warn?.(`[browser] ${p.id} "${p.label}": its browser config names ${w.dropped.slice(0, 3).map((a) => `«${String(a).slice(0, 40)}»`).join(', ')} — not a switch, so it is left out of this wrapped launch (a bare -- would put VibeSpace's proxy switches after the end of the browser's switches)`);
    const b0 = w ? w.args : kept || engineBaseArgs(p, prow, quietLog);
    return ENG.engineLaunchEnv(be, { base: quietLog ? B.launchTail(b0, p.id) : b0, always: !!be.egress }); // B-1789 cure: the launch tail
  }
  /** The arguments a launch carries anyway, riding an engine's env list (AGENT_BROWSER_ARGS REPLACES the config's list):
   *  the automation flag where the row stamps it, the keeper's mark LAST. */
  const engineBaseArgs = (p, prow, quietLog) => B.launchTail(B.withAutomationFlag([], { on: automationFlagOn() && !!(prow && prow.automationFlag) }), p.id, { quiet: quietLog });
  /** lane engine-args-string r2 — THE WRAPPER ROAD: the program the browser driver starts on an ENGINE launch (both driver
   *  roads: a profile's env, a conversation's derived config) — `exec '<kernel>' "$@" <the engine's part of the split>`, the
   *  engine's env as exports (browser-display-config engineWrapperFor: `engine-<profile id>.sh`, 0700, atomic, re-written only
   *  when its text changes, removed with the profile). The engine's switches never cross the driver's text (it cuts at every
   *  comma — the owner's kernel names four switches holding one). A wrapper that cannot be written refuses the launch by name:
   *  never the kernel without its switches, never Chrome in its place. → `{program, args}` (the wrapper, the engine's part). */
  function engineProgramOf(p, el) {
    const args = ENG.engineArgs(el); // lane engine-spi-egress r2: the plugin's part of the split + a wrapped launch's proxy switches, LAST
    const w = displays.engineWrapperFor(p.id, { program: el.executablePath, args, env: el.env || {} });
    if (!w.ok) throw namedError('launch_failed', `the browser did not start: ${w.error}`, { engine: el.engine && el.engine.id });
    return { program: w.file, args };
  }
  /** THE ENGINE'S LAUNCH — its probe judged by THE verdict now (a plugin or kernel gone since it was chosen is refused BY NAME,
   *  MARKED on the record + ONE For-you item; VibeSpace never starts Chrome in its place), then its launch options for THIS
   *  profile (the kernel VibeSpace resolved, the profile's directory) → `{executablePath, args, env, engine:{id, version,
   *  label}}`. A timeout (browser_engine_unanswered) is refused by name and marks nothing (the next launch asks again). */
  const placeHolds = new Map(); // lane fleet-plugin-catalog r2 (N3): profile id → its start's hold on its engine's kernel place
  const dropPlaceHold = (pid) => { const r = placeHolds.get(pid); if (r) { placeHolds.delete(pid); try { r(); } catch { /* released */ } } };
  /** B-9584 U2b: the STOCK browser's own start for the profile's environment — U1 resolved ONCE, its two language switches (one tag,
   *  comma-free: the driver's one config line and the attach argv both carry them) and its TZ (the process's own variable — the box
   *  measure: it reaches Chrome on the driver road). The store's mark `languageTold`: a profile ever started with a language STATES
   *  the machine's own tag when it is back at «this machine's» (Chrome keeps a prior one in its Preferences). What the start says
   *  (`environment`) only when there is something to say: an untouched profile's start and record are the release's. */
  function stockEnvFor(p) {
    const envR = ENV.resolveEnvironment(p.environment, ENV.keptExitOf(p));
    const st = ENV.stockLaunchOf(envR, { languageTold: !!p.languageTold, machineTag: ENV.machineLanguageTag() });
    const geolocation = geoPlanFor(p, envR);   // B-9584 U2c: a place (the stored denial + the hold on top) or «blocked» (the stored denial alone); null ⇒ nothing written, nothing armed — r1707 (4): ONE function for the record and the arm
    const notApplied = !geolocation && !!envR.geolocation;   // an ephemeral or a paired machine's profile: nothing written, no hold — said as not applied, never «blocked» or «fixed»
    const says = !!p.environment || st.args.length > 0;
    return { ...st, geolocation, environment: says ? { applied: { timezone: st.env.TZ || null, language: st.language, location: geolocation ? (geolocation.kind === 'place' ? 'fixed' : 'blocked') : notApplied ? 'not-applied' : 'machine' }, ...(geolocation && geolocation.kind === 'place' ? { locationSaid: placeSaid(geolocation) } : notApplied ? { locationSaid: NOT_APPLIED_SAID } : {}), confirmed: !notApplied && (!geolocation || geolocation.kind === 'blocked'), by: 'stock', unfollowed: envR.unfollowed } : null };   // «blocked» = the stored denial, written before its Chrome or the start is refused; a place is confirmed once held
  }
  // ── B-9584 U2c — THE PLACE ON THE STOCK BROWSER (road B: src/server/browser-geo-hold.js) ──
  // A stock profile whose location is a place or «blocked» gets the hold on its browser at its start, before the browser is anyone's
  // (both roads, before browser-ready), and again at a restart's adoption. A profile with neither never reaches the hold: nothing is
  // armed, its start is the release's. What the hold does is said where the person is (the For-you tray), never a place's value.
  let geoHoldOwn = null;
  const geo = () => geoHoldOwn || (geoHoldOwn = (typeof geoHold === 'function' ? geoHold : GH.create)({ log, now, onEvent: onGeoEvent }));
  const geoSaid = new Map();   // profile id → the hold's notices filed for its browser's run (one of each)
  /** The plan a STOCK profile's browser is held to (a named profile on this machine, never an engine's — the kernel takes its own). */
  /** B-9584 (B), r2311 (3)(4): the profile's location KIND as the person set it — 'place', 'blocked' or null — read live by the CDP
   *  mediator at an agent's geolocation call (a tab's position, the location permission): refused while it is not null. */
  /** r2767 (a) ONE PLAN WHILE A BROWSER RUNS: every gate (the mediator's, the dialog watch's) judges by what the RUNNING browser was
   *  started with — its record's applied location — until its restart; no running browser (or one started with no environment) ⇒ the
   *  saved setting. → 'place' | 'blocked' | null, or undefined when no running record says. */
  function runningPlaceKind(pid) {
    const rg = reg.browsers[String(pid || '')];
    if (!rg || !(rg.state === 'ready' || rg.state === 'starting') || !rg.environment || !rg.environment.applied) return undefined;
    const loc = rg.environment.applied.location;
    return loc === 'fixed' ? 'place' : loc === 'blocked' ? 'blocked' : null;
  }
  function placeKindFor(pid) { { const r = runningPlaceKind(pid); if (r !== undefined) return r; } try { const p = profile(String(pid || '')); if (!p) return null; const g = ENV.resolveEnvironment(p.environment, ENV.keptExitOf(p)).geolocation; return g ? g.kind : null; } catch { return null; } }
  function geoPlanFor(p, envR = null) {
    if (!p || isEph(p) || p.host || (p.browser && p.browser.kind === 'plugin')) return null;
    return geoPlanOf((envR || ENV.resolveEnvironment(p.environment, ENV.keptExitOf(p))).geolocation);
  }
  /** r1707 (4): THE RECORD TELLS THE TRUTH — «fixed» while no site may read the place says so in its own words; a profile this road
   *  does not hold (an ephemeral one, a paired machine's) says its location is not applied. */
  const PLACE_SAID = 'fixed on its tabs — every site is denied the location (the profile\'s own setting): no site is allowed the place';
  /** B-9584 (B): with sites on the profile's list, «fixed» says that ONLY they read the place (their count, never an origin). */
  /** r2311 (ii): the record's words when some listed sites were not given the place (the browser refused or did not answer). */
  const placeSaidShort = (of, n) => `fixed — ${n} of the ${of} grant${of === 1 ? '' : 's'} of the sites on its list (each site, in each browser context) ${n === 1 ? 'was' : 'were'} not given — there ${n === 1 ? 'it reads' : 'they read'} «denied»; every other site is denied the location (the profile\'s own setting)`;
  const geoGrantsRun = new Map();   // r2767 (b): pid → Map(context → its latest grant job { failed, of }) — cleared when the hold's socket goes
  const placeSaid = (g) => { const n = g && Array.isArray(g.sites) ? g.sites.length : 0; return n ? `fixed — only the ${n} site${n === 1 ? '' : 's'} on its list read the place; every other site is denied the location (the profile\'s own setting)` : PLACE_SAID; };
  const NOT_APPLIED_SAID = 'not applied — this browser is not held to a place or «blocked»: its sites get this machine\'s answer';
  /** r2172 (a): a place or «blocked» is held only on a NAMED profile of THIS machine's stock browser (the stored denial + the hold). An
   *  ephemeral profile or a paired machine's has neither, so it would read that machine's REAL position: its start is refused by name
   *  (the setting's own door — U3's writer — refuses it there too). An engine's profile hands its location to its kernel (U2a). */
  function placeRefusalOf(p) {
    if (!p || !(isEph(p) || p.host) || (p.browser && p.browser.kind === 'plugin')) return null;
    const g = ENV.resolveEnvironment(p.environment, ENV.keptExitOf(p)).geolocation;
    if (!g) return null;
    return namedError('browser_place_unsupported', `"${p.label}" was not started: a place or a blocked location is held only on a named profile of this machine's browser — on ${isEph(p) ? 'a conversation\'s own browser' : 'a paired machine'} its sites would read that machine's real position`);
  }
  /** U1's `geolocation` → this road's plan: «blocked» (the stored denial alone) or a place the hold can hold (GH.planOf); else null. */
  function geoPlanOf(g) { return g && g.kind === 'blocked' ? { kind: 'blocked' } : GH.planOf(g); }
  /** B-9584 U2c (主开发 r1264, MEASURED on a real Chrome): THE PROFILE'S OWN STORED DENIAL, written before its Chrome starts (no Chrome
   *  holds the folder: its lock was judged just before). A place or «blocked» ⇒ the default and EVERY stored geolocation row «block»
   *  (src/browser-environment.js geoStoredDenial: a site allowed before would win over the default alone), the person's own values
   *  kept beside the profile FIRST (GEO_KEPT_FILE, 0600, once — never a later denial's over them); each file written to a temp
   *  SYNCED to disk before its rename (r1897). Back at «this machine's» with values
   *  kept ⇒ given back (geoStoredRestore), the file removed. An untouched profile: one look for the file, nothing else — and NEVER a
   *  refusal from this road (r1707 (2): a give-back that cannot run now is said and tried at its next start). A held launch with a
   *  file of another shape, or one it cannot read or write: the start is refused by name (the file and what failed) — never overwritten. */
  const GEO_KEPT_FILE = 'vibespace-geo-kept.json';
  async function geoStoreAt(p, plan) {
    if (!p || !p.dir || isEph(p) || p.host || (p.browser && p.browser.kind === 'plugin')) return { ok: true, why: 'not a stock profile on this machine' };
    const file = path.join(p.dir, 'Default', 'Preferences'), keptFile = path.join(p.dir, GEO_KEPT_FILE);
    // r1707 (2): a profile that asks for no place and no «blocked» is NEVER refused by this road — a give-back that cannot run now is
    // said in the journal (no value) and tried again at its next start
    const later = (why) => { log.warn?.(`[browser] ${p.id} "${p.label}": its own location values were not given back now — ${why}; tried again at its next start`); return { ok: true, why: `not given back now (${why})` }; };
    const fail = (why) => (plan ? { ok: false, why } : later(why));
    let kept = null, keptThere = false;
    try { const raw = await fs.promises.readFile(keptFile, 'utf8'); keptThere = true; try { kept = JSON.parse(raw); } catch { return fail(`${GEO_KEPT_FILE}: not JSON`); } }
    catch (e) { if (e.code !== 'ENOENT') return fail(`${GEO_KEPT_FILE}: unreadable (${e.code || 'unreadable'})`); }
    if (keptThere && (!kept || typeof kept !== 'object' || Array.isArray(kept))) return fail(`${GEO_KEPT_FILE}: not of its shape`);   // never overwritten
    if (!plan && !keptThere) return { ok: true, why: 'nothing kept' };
    let prefs = null;
    try { const raw = await fs.promises.readFile(file, 'utf8'); try { prefs = JSON.parse(raw); } catch { return fail('Default/Preferences: not JSON'); } }
    catch (e) { if (e.code !== 'ENOENT') return fail(`Default/Preferences: unreadable (${e.code || 'unreadable'})`); }
    const writeAtomic = async (f, obj) => {
      await fs.promises.mkdir(path.dirname(f), { recursive: true, mode: 0o700 });
      const tmp = `${f}.vibespace-${process.pid}.tmp`;
      try {
        const fh = await fs.promises.open(tmp, 'w', 0o600);
        try { await fh.writeFile(JSON.stringify(obj)); await fh.sync(); } finally { await fh.close(); }   // r1897: the temp's bytes ON DISK before its rename (awaited) — a torn Preferences after a power cut is a person's browser reset
        await fs.promises.rename(tmp, f);
      }
      catch (e) { await fs.promises.rm(tmp, { force: true, recursive: false }).catch(() => { }); throw e; }   // never a temp file left beside it
    };
    const where = (f) => (f === keptFile ? GEO_KEPT_FILE : 'Default/Preferences');
    let writing = keptFile;
    try {
      if (plan) {
        const v = ENV.geoStoredDenial(prefs, { stamp: String((now() + 11644473600000) * 1000) });   // r2172 (b)(d): OUR rows told apart by their stamp (the browser's microseconds since 1601)
        if (!v.ok) return fail(`Default/Preferences: ${v.why}`);
        // the person's own values FIRST (a crash between the two writes loses nothing); r1707 (3): at every LATER held launch a row the
        // person allowed in Chrome's own settings meanwhile joins them (a row still OURS keeps its FIRST value — never a denial's; r2311 (1):
        // a row the person changed since our last denial takes the person's value, so a block they set while held gives back a block)
        if (!kept) await writeAtomic(keptFile, v.kept); else { const m = ENV.geoKeptMerge(kept, v.kept); if (!m.ok) return fail(`${GEO_KEPT_FILE}: ${m.why}`); if (m.changed) await writeAtomic(keptFile, m.kept); }
        writing = file;
        if (v.changed) await writeAtomic(file, v.prefs);
        return { ok: true, why: 'denied' };
      }
      if (prefs) { const r = ENV.geoStoredRestore(prefs, kept); if (!r.ok) return later(`Default/Preferences: ${r.why}`); writing = file; if (r.changed) await writeAtomic(file, r.prefs); }
      writing = keptFile;
      await fs.promises.rm(keptFile, { force: true });
      return { ok: true, why: 'given back' };
    } catch (e) { return fail(`${where(writing)}: not written (${e.code || 'failed'})`); }
  }
  /** Arm the hold (bounded). Refused AT A START ⇒ the start is refused BY NAME and the browser is stopped once it settles; refused at a
   *  restart's ADOPTION ⇒ the person's running browser is LEFT running (r1707 (5): the stored denial holds — no stop without a safety
   *  gain), said once a run. The record's word becomes «confirmed» only once every open tab holds the place. */
  async function armGeo(p, rec, plan, { after = null } = {}) {
    const r = await geo().arm(p.id, { url: () => ((reg.browsers[p.id] || {}).cdpUrl || rec.cdpUrl), plan, after });   // the record's CURRENT address: a relaunch moves it (r1264 must 2)
    if (r.ok) { if (rec.environment) rec.environment.confirmed = true; return r; }
    const what = plan.kind === 'blocked' ? 'its blocked location' : 'its place';
    if (after === 'restart') { log.warn?.(`[browser] ${p.id} "${p.label}": ${what} could not be given to its tabs after the restart (${r.error}) — its browser goes on denied the location`); onGeoEvent({ kind: 'down', profileId: p.id, at: now(), after: 'restart' }); return r; }
    const msg = `"${p.label}" was not started: ${what} could not be held on its browser (${r.error}) — it never runs with this machine's location; start it again`;
    log.warn?.(`[browser] ${p.id} ${msg}`);
    rec.lastError = msg; commit();
    const pid = p.id;
    setImmediate(() => { stop(pid, { why: 'place-not-held' }).catch((e) => log.warn?.(`[browser] ${pid}: the stop after its place could not be held failed — ${e && e.message}`)); });
    throw namedError('browser_place_not_held', msg);
  }
  /** The hold's events, said where the person is: a tab that runs without its place (denied the location); the hold that cannot come
   *  back (the browser goes on denied; a tab opening then may stay frozen). The place given again after a gap is a journal line only
   *  (r1707 (6)): while no site can read the place, a notice would tell nothing to act on. */
  function onGeoEvent(ev) {
    if (!ev || !ev.profileId) return;
    const pid = String(ev.profileId);
    let p = null; try { p = profile(pid); } catch { p = null; }
    const label = p ? p.label : pid;
    const f = geoHoldOwn ? geoHoldOwn.factOf(pid) : null;
    const what = f && f.kind === 'blocked' ? 'its blocked location' : 'its place';
    const said = geoSaid.get(pid) || new Set(); geoSaid.set(pid, said);
    // r2172 (c): THE RECORD TELLS THE TRUTH while it runs — «confirmed» falls when the hold is lost or down, comes back when it holds again
    { const rg = reg.browsers[pid]; const v = ev.kind === 'held' ? true : ev.kind === 'lost' || ev.kind === 'down' ? false : null;
      if (v !== null && rg && rg.environment && rg.environment.applied && rg.environment.applied.location === 'fixed' && rg.environment.confirmed !== v) { rg.environment.confirmed = v; commit(); }
      if (ev.kind === 'lost' || ev.kind === 'down') geoGrantsRun.delete(pid); }   // r2767 (b): the grants died with the socket — the next socket's jobs make the count
    const file = (key, text, detail, kind = 'notice') => {
      if (said.has(key)) return; said.add(key);
      if (!userTodos || typeof userTodos.add !== 'function') return;
      try { userTodos.add('browser', { origin: 'browser', kind, urgency: kind === 'action' ? 'high' : 'normal', by: 'agent', text, detail, sessionName: 'Agent browser' }); }
      catch (e) { log.warn?.(`[browser] ${pid} "${label}": the place hold's notice was not filed (${e && e.message})`); }
    };
    if (ev.kind === 'closed') {   // B-9584 (B, 主开发 r1791): with sites on the list, a tab the hold could not place is CLOSED — the person told once a run, the agent whose tab it was told BY NAME at its next command
      const tid = String(ev.targetId || '');
      let told = 0;
      if (tid) for (const l of reg.leases) if (l && l.profileId === pid && (String(l.targetId || '') === tid || (Array.isArray(l.tabs) && l.tabs.map(String).includes(tid)))) { markTabLost(pid, l.browserKey, 'place'); told++; }
      if (told) commit();
      file('closed', `"${label}": a tab was closed — its place could not be given to it in time`, `VibeSpace gives every tab of "${label}" its place before the tab runs; this one did not take it in time, and a site on the profile's list would have read this machine's location there — so the tab was closed${ev.shut === false ? ' (the browser did not close it: its browser context gives no site the place until the browser restarts)' : ''}. Open the page again; if this keeps happening, restart the browser.`);
    } else if (ev.kind === 'grants') {   // r2311 (ii): A GRANT THAT FAILED IS TOLD — the record's words follow the latest grant job; the person told once a run
      const runG = geoGrantsRun.get(pid) || new Map(); geoGrantsRun.set(pid, runG);
      runG.set(String(ev.ctx || ''), { failed: Math.max(0, Number(ev.failed) || 0), of: Math.max(0, Number(ev.of) || 0) });   // r2767 (b): each context's latest job
      let n = 0, of = 0; for (const v of runG.values()) { n += v.failed; of += v.of; }   // the run's whole count — a later context that succeeds never writes over one that failed
      const rg = reg.browsers[pid];
      if (rg && rg.environment && rg.environment.applied && rg.environment.applied.location === 'fixed') {
        const words = n ? placeSaidShort(of, n) : placeSaid({ sites: Array(Math.max(0, Number(f && f.sites) || Number(ev.of) || 0)).fill('') });   // all given: the LIST's own count
        if (rg.environment.locationSaid !== words) { rg.environment.locationSaid = words; commit(); }
      }
      // r2932 (4): the count is of GRANTS (one listed site in one browser context), as the record's words — never «N of the M sites»
      if (n) file('ungranted', `"${label}": ${n === 1 ? 'a site on its list was' : 'sites on its list were'} not given its place`, `VibeSpace gives each site on the list of "${label}" its place on the browser's own connection, once in each browser context (a grant each); the browser did not take ${n} of those ${of} grant${of === 1 ? '' : 's'}, so there ${n === 1 ? 'the site reads' : 'those sites read'} «denied» — never this machine's location. Restart the browser to try again.`);
    } else if (ev.kind === 'unplaced') {
      file('unplaced', `"${label}": a tab ${ev.opened ? 'opened' : 'was open'} without its place — sites there are denied the location`, `VibeSpace gives every tab of "${label}" its place before the tab runs. Its browser did not take the place on this one in time, so the tab runs with the profile's own setting: sites are denied the location — never given this machine's. Open the page again to get the place; if this keeps happening, restart the browser.`);
    } else if (ev.kind === 'held' && (ev.after === 'lost' || ev.after === 'restart')) {
      log.log?.(`[browser] ${pid} "${label}": ${what} given to its tabs again (${ev.after === 'restart' ? 'after a restart' : 'its hold dropped'}) — sites were denied the location meanwhile`);   // r1707 (6): QUIET — no For-you notice while no site can read the place (nothing to act on); the place's road brings it back
    } else if (ev.kind === 'down') {
      file('down', `"${label}": ${what} cannot be given to its tabs right now — sites are denied the location`, `VibeSpace's hold on the browser ${ev.after === 'restart' ? 'could not be armed after VibeSpace restarted' : 'dropped and could not be armed again'}. The browser goes on with the profile's own setting: sites are denied the location, never given this machine's. A tab that was opening at that moment may stay frozen (blank) until the browser restarts. Restart the browser to have ${what} again.`);
    }
  }
  /** B-9584 U2b: the store's mark, set by the LAUNCH that tells a language — on each road right before its OWN synchronous landing
   *  (commitSync before Chrome): on disk before the browser could keep a language, no deferred save of its own; a start refused
   *  before its launch marks nothing (the resolve itself is read-only — round wyx4vuerd 9 resolves ONCE, before the road). */
  function markLanguageTold(p, stockEnv) { if (stockEnv && stockEnv.languageTold && !p.languageTold) p.languageTold = true; }
  /** B-9584 U2b: the switches a browser's LAUNCH was stamped with (`rec.envArgs`) — its config file carries them until its next launch. */
  function envArgsFor(kind, mark) {
    if (kind !== 'machine' || !mark) return [];
    try { const r = reg.browsers[mark]; return r && Array.isArray(r.envArgs) ? r.envArgs : []; } catch { return []; }
  }
  async function launchEngineOf(p, c) {
    // B-9584 U2a (主开发 r745 / r771): A PROFILE'S OWN ENVIRONMENT on an engine — resolved ONCE (src/browser-environment.js, the
    // contract) and handed beside the exit as the hand-over's own object (`environment`; absent for a profile that sets nothing: its
    // body is the release's, byte for byte). A profile that SETS anything starts on an engine only when the engine STATES that it
    // reads it (its manifest's capabilities.browserEngine) — else refused by name FIRST (r991: before a place hold, a probe or a
    // first-use kernel download), never a browser in another time zone than the profile says
    const envR = ENV.resolveEnvironment(p.environment, ENV.keptExitOf(p));
    const engLabel = (() => { try { const r = engs().rows().find((x) => x && x.id === c.id); return String((r && r.label) || c.id).slice(0, 80); } catch { return String(c.id).slice(0, 80); } })();
    // round wyx4vuerd MUST — A REFUSAL NAMES ITS DOOR: «does not state the word» HERE only for an engine the loader lists valid, enabled
    // and trusted (`false`); switched off, untrusted or not installed (`null`) falls through to the verdict that names THAT door
    // (browser_engine_missing, its For-you line and its mark — the release's); anything still unstated past the verdict is refused there
    const statesEnv = !p.environment ? true : typeof engs().statesEnvironment === 'function' ? engs().statesEnvironment(c.id) : null;
    const unread = () => namedError('browser_engine_environment_unread', `${engLabel} does not state that it reads a profile's time zone, language and location — update the browser plugin; this profile's start is refused, never run in another time zone than the profile says`, { engine: c.id });
    if (statesEnv === false) throw unread();
    // lane fleet-plugin-catalog: a kernel that waited beside its place (downloaded while a browser ran the previous one) takes it
    // NOW when no browser runs the previous one — this start is «the next browser start»
    // round 2 (N3): then THIS start HOLDS the place until its spawn (released when the start settles — placeHolds) — no landing swaps the
    // kernel between this start's in-use check and its spawn. Round 3 (N2): ONE ask (`beforeStart`) — the waiting kernel lands only
    // when that is POSSIBLE (a browser on the kernel, another start holding it ⇒ this start goes on at once, no wait); it waits only
    // for a landing in progress, bounded ONCE (≤ 30 s for the whole ask) and said (the journal; the engine card meanwhile)
    { const d0 = p.host ? null : eds();
      if (d0 && typeof d0.beforeStart === 'function') { try { dropPlaceHold(p.id); const b = await d0.beforeStart(c.id); placeHolds.set(p.id, b.release); } catch (e) {
        // r4: a landing still in progress past the start's bound (the place may be half-landed) ⇒ the start is REFUSED by that name —
        // never spawned beside it; any other answer: no hold — the in-use check alone; asked again at the next start
        if (e && e.code === 'engine_kernel_landing') throw namedError(e.code, e.message, { engine: c.id }); } } }
    let engine = await engineFactOf(c.id, { host: p.host || null });
    // B-f276 (主开发 r3305 (a)): the plugin registry HELD — whether this engine's plugin is on and trusted is UNKNOWN: the start is refused
    // BY THE REGISTRY's NAME — nothing started, never Chrome in its place, NO mark and NO For-you item of a missing build (the family's
    // one notice says the hold); started again by the person once the list reads (nothing about the profile changed)
    if (engine && engine.code === 'plugin_registry_unread') throw namedError(engine.code, `"${p.label}" does not start now — it runs ${engLabel}, and VibeSpace cannot tell yet whether that plugin is on and trusted (${engine.error}); it never starts Chrome in its place — start it again once the plugin list reads`, { engine: c.id });
    // lane engine-distribution: the kernel's version MEASURED once before its first launch (cached per receipt — 5 s at most);
    // a kernel not there yet is downloaded on this FIRST USE (in the background — the launch is refused by name meanwhile)
    const d = p.host ? null : eds();
    let fetching = null, refused = null;
    if (d && engine && !engine.code && !engine.installed && engine.source !== 'user') { // lane engine-spi-egress L1b: the owner's program is never downloaded
      const k = d.kernelFact(c.id);
      if (k.state === 'downloading') fetching = k;
      // round 2: a Node this kernel cannot be unpacked on is REMEMBERED (the engine record, for that Node) — no download asked again
      else if (k.state === 'failed' && k.code === 'engine_node_unsupported') refused = { code: k.code, message: k.error };
      // lane kernel-asset-credential round 3: the launch waits for the download's FIRST ANSWER (bounded) — «downloading» only when
      // the archive answered; a refusal before any byte or at that answer is said by its name (one already running is downloading)
      else { try { fetching = await d.installKernel(c.id, { by: 'first-use', answer: true }); } catch (e) { fetching = e && e.code === 'install_running' ? d.kernelFact(c.id) : null; refused = fetching ? null : e; if (refused) log.warn?.(`[browser] ${p.id} "${p.label}": its engine's kernel cannot be downloaded — ${e && e.message}`); } }
      // round 3: the previous kernel PUT BACK in its place (a landing stopped between its renames) — no download: asked again
      if (fetching && fetching.restored) { fetching = null; engine = await engineFactOf(c.id, { host: p.host || null }); }
      // B-4d35 (the lane's adversarial read): its download stepped aside from a put-back in flight (past its bound) — the start is
      // refused BY THAT NAME, never «kernel missing» with a For-you item (the kernel is coming back into its place)
      if (refused && refused.code === 'engine_kernel_landing') throw namedError('engine_kernel_landing', refused.message || 'the kernel is being put back in its place — try again in a moment', { engine: c.id });
    } else if (d && engine && !engine.code && engine.installed && engine.source !== 'user' && typeof d.kernelDue === 'function') {
      // lane fleet-plugin-catalog: the kernel in its place is not the one named now (the cluster's new kernel, the plugin's new
      // kernel.json) ⇒ THIS start runs the current one and the new one downloads beside it — it serves the next start
      try { const due = await d.kernelDue(c.id); if (due.due && d.kernelFact(c.id).state !== 'downloading') d.installKernel(c.id, { by: 'first-use' }).then((r) => { if (r && r.started) log.log?.(`[browser] ${p.id} "${p.label}": its engine's kernel ${due.version} is named — downloading beside the current one (it serves the next start)`); }, (e) => log.warn?.(`[browser] ${p.id} "${p.label}": its engine's new kernel cannot be downloaded — ${e && e.message}`)); } catch { /* the current kernel runs; asked again at the next start */ }
    }
    // round 4: the probe finds the kernel IN its place while the record holds none (dropped once) ⇒ measure — the record follows it
    const unrecorded = !!(engine && engine.kernel && engine.kernel.state !== 'installed' && engine.kernel.state !== 'downloading');
    // L1b r2: an OWNER's program is measured at EVERY launch (the measure is cached by the file's stamp — a stale record never stands)
    if (d && engine && !engine.code && engine.installed && engine.executable && ((!engine.measuredVersion || unrecorded) || engine.source === 'user')) { try { await d.measure(c.id, engine.source === 'user' ? { path: engine.binaryPath, stamp: engine.binaryStamp } : {}); } catch { /* the version stays the plugin's word */ } engine = withKernelFact(engine); } // lane engine-spi-egress L1b: the owner's program measured by ITS stat
    const v = BB.browserChoiceVerdict({ choice: c, provider: p.provider, by: 'user', engine, label: p.label });
    if (!v.ok && !fetching && refused && refused.code === 'engine_node_unsupported' && v.code === 'browser_engine_kernel_missing') v.error = `${v.error} — VibeSpace cannot download it here: ${refused.message}`;
    else if (!v.ok && !fetching && refused && refused.code === 'engine_kernel_aside' && v.code === 'browser_engine_kernel_missing') v.error = `${v.error} — ${refused.message}`;
    else if (!v.ok && !fetching && refused && v.code === 'browser_engine_kernel_missing') v.error = `${v.error} — VibeSpace could not download it: ${refused.message || refused.code}`;
    if (!v.ok && fetching && fetching.answered === false && v.code === 'browser_engine_kernel_missing') v.error = `${v.error} — VibeSpace has asked ${fetching.host} for it and has no answer yet; start the browser again in a moment`;
    else if (!v.ok && fetching && v.code === 'browser_engine_kernel_missing') v.error = `${v.error} — VibeSpace is downloading it now (${fetching.total || fetching.bytes ? `${Math.round(Number(fetching.total || fetching.bytes) / 1e6)} MB` : 'its kernel.json\'s archive'}); start the browser again when it is done`;
    if (!v.ok) { if (v.code !== 'browser_engine_unanswered') noteBuildMissing(p, c, v, engine); throw namedError(v.code, v.error, { engine: c.id, ...(v.failed ? { failed: v.failed } : {}) }); }
    if (statesEnv !== true && !(typeof engs().statesEnvironment === 'function' && engs().statesEnvironment(c.id) === true)) throw unread();   // the belt past the verdict (r1120: asked ONCE MORE — a plugin turned on meanwhile is no refusal; r1707 (1): anything but a stated «true» refuses, as at the release — a list that cannot be read never starts an engine in this machine's environment
    // the exit check (the owner 2026-11-17): the profile's KEPT exit rides resolve-launch as `egress` {publicIp, country, timezone,
    // checkedAt, source} — the names settled with the plugin's conversation; absent when none is kept. NO request is made here.
    const lo = await engs().launchOptions(c.id, { profileId: p.id, binaryPath: v.executablePath, ...(p.dir ? { userDataDir: p.dir } : {}), ...(p.egress && typeof p.egress === 'object' ? { egress: egressHandOf(p.egress) } : {}), ...(envR.told ? { environment: envR.told } : {}) });
    // a refusal of the profile's ENVIRONMENT is no missing build (no mark, no For-you item of a build): said by its own name
    if (!lo.ok) { if (!['browser_engine_unanswered', 'browser_engine_location_unsupported', 'browser_engine_environment_refused'].includes(lo.code) && lo.echo !== 'malformed') noteBuildMissing(p, c, lo, engine); throw namedError(lo.code, lo.error, { engine: c.id, ...(lo.failed ? { failed: lo.failed } : {}) }); }
    // r991 MUST 1: «confirmed» means the echo EQUALS what was told — each of the three, the location as its word. A difference refuses
    // the start by name HERE, before the wrapper and the exit are built (nothing has started: the reply only names the program), naming
    // the setting by its word (never a place); no build is marked missing for it
    if (p.environment && lo.launch.applied) {
      const off = ENG.echoMismatch(envR.told, lo.launch.applied, { zone: ENV.canonicalZone, tag: ENV.canonicalTag });   // round wyx4vuerd (3): the hub's two forms, both sides
      const WORD = { timezone: 'time zone', language: 'language', location: 'location' };
      if (off.length) throw namedError('browser_engine_environment_mismatch', `${engLabel} answered that its browser would start with another ${off.map((k) => WORD[k]).join(' and ')} than this profile says — the start is refused; update the browser plugin, or set ${off.length > 1 ? 'those settings' : 'that setting'} to «This machine's»`, { engine: c.id, settings: off });
    }
    if (p.buildMissing) { delete p.buildMissing; dirty = true; log.log?.(`[browser] ${p.id} "${p.label}": ${BB.buildWords(c)} answers again`); } // the engine by its id (its label is the plugin's text)
    // lane engine-spi-egress: an engine that must stay inside a list is WRAPPED — THIS profile's allowlisting proxy (the keeper's,
    // its list = the engine's reserved row, read per request); one that cannot listen refuses the launch by name (egress_proxy_missing)
    const pv = B.proxyLaunchVerdict(p);   // B-8b87: judged at the start (refused there); here its proxy joins the engine's egress pair
    const pproxy = pv.ok && pv.proxy ? { scheme: pv.proxy.scheme, host: pv.proxy.host, port: pv.proxy.port, credential: pv.proxy.credential || '' } : null;
    const egress = engine.egress || pproxy ? await egressUrlFor(p.id, { engine: c.id, label: engine.label || '', ...(engine.egress ? { setting: engine.egress.setting, fallback: engine.egress.default } : {}), ...(pproxy ? { proxy: pproxy } : {}) }) : null;
    // B-9584 U2a: what the start SAYS — the engine's echo of what the browser really got (none ⇒ «not confirmed», never «applied»)
    // and every choice it could not follow (U1's `unfollowed`); nothing for a profile that sets nothing
    const environment = p.environment ? { applied: lo.launch.applied || null, confirmed: !!lo.launch.applied, unfollowed: envR.unfollowed } : null;
    return { executablePath: lo.launch.executablePath, args: lo.launch.args, env: lo.launch.env, egress, engine: { id: c.id, version: v.version, label: engine.label || null }, ...(environment ? { environment } : {}) };
  }
  /** What a launch RECORDS it was asked to run (`rec.browserChoice`): the choice, + an engine's version (the probe's fact). */
  const recordedChoice = (p, be) => (p.browser ? { ...BB.choiceView(p.browser), ...(be && be.engine ? { version: be.engine.version, geolocationIsolated: be.engine.geolocationIsolated === true } : {}) } : { kind: 'default' });   // B-9584 r3795: what the launched program's probe said of its place (what RUNS)
  /** ONE mark + ONE For-you item per (profile, choice) until it is resolved (the build is back, or the user picks another). */
  function noteBuildMissing(p, c, v, engine = null) {
    const what = c.kind === 'build' ? c.version : c.kind === 'plugin' ? c.id : c.path;
    const had = p.buildMissing && p.buildMissing.what === what;
    if (!had) { p.buildMissing = { what, kind: c.kind, code: v.code, at: now(), filed: false }; commit(); }
    if (p.buildMissing.filed) return;
    if (!userTodos || typeof userTodos.add !== 'function') { if (!had) log.warn?.(`[browser] ${p.id} "${p.label}": its Chrome build ${what} is missing — ${v.error} (no For-you store is wired, so only this journal says so)`); return; }
    // L1b r2: an OWNER's program refused is said as that (its Program file row), never as a kernel to install — by the engine's source
    const n = BB.missingNotice({ label: p.label, choice: c, code: v.code, engineLabel: engine && engine.label ? engine.label : '', source: engine && engine.source ? engine.source : null, why: engine && engine.userBinary ? engine.userBinary.why : null, launcher: v.launcher || null, rule: v.rule || null, arg: v.arg || null }); // L1b r3: a launcher switch said by its name — r6: every launch rule as itself
    try { userTodos.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', text: n.text, detail: n.detail, sessionName: 'Agent browser', ...(n.i18n ? { i18n: n.i18n } : {}) }); p.buildMissing.filed = true; commit(); }
    catch (e) { log.warn?.(`[browser] ${p.id} "${p.label}": the missing-build notice was not filed (${e && e.message}) — tried again at the next launch`); }
    log.warn?.(`[browser] ${p.id} "${p.label}": its Chrome build ${what} is missing — ${v.error}`);
  }
  /** B-cf42: an ENGINE profile's two answers about its kernel — its plugin's probe and the running browser's own
   *  VibeSpace.getVersion (handed in by the dialog watch, src/server/browser-dialogs.js crossCheckEngine) — said where the owner
   *  looks: a disagreement is a MARK on the profile (`kernelLive` — its Agent browser panel row, its engine's card) and ONE For-you
   *  item per engine version (a profile on the same engine and version already filed ⇒ none); an agreeing answer clears the mark.
   *  The live answer rules — the watch already follows it; this only says it. */
  /** B-cf42 cure (主开发 09:07Z): an engine version's For-you notice is resolved when the LAST mark of that engine and version
   *  clears — an agreeing answer, a profile that left the engine, a mark of another version, a profile removed. `m` = the mark
   *  that went, `p` = its profile (still listed, or already gone). */
  function markCleared(m, p) {
    if (!m || !m.noticeId) return;
    if (reg.profiles.some((x) => x && x !== p && x.kernelLive && x.kernelLive.engine === m.engine && x.kernelLive.version === m.version)) return;
    if (userTodos && typeof userTodos.setStatus === 'function') { try { const it = typeof userTodos.get === 'function' ? userTodos.get(m.noticeId) : null; if (!it || it.status === 'open') userTodos.setStatus(m.noticeId, 'done', 'kernel-answers-again'); } catch { /* gone already */ } }
  }
  function noteEngineLive(profileId, f = {}) {
    const p = reg.profiles.find((x) => x && x.id === String(profileId || '')); // a conversation's own browser on the default engine too
    const engine = String((f && f.engine) || '');
    if (!p) return null;
    if (!p.browser || p.browser.kind !== 'plugin' || p.browser.id !== engine) { if (p.kernelLive) { const m = p.kernelLive; delete p.kernelLive; markCleared(m, p); commit(); } return null; } // it left that engine: its mark goes
    const v = ENG.kernelLiveVerdict(f);
    if (!v) { if (p.kernelLive) { const m = p.kernelLive; delete p.kernelLive; markCleared(m, p); commit(); log.log?.(`[browser] ${p.id} "${p.label}": its running kernel answers as its engine's probe says again`); } return null; }
    const version = f.version ? String(f.version).replace(/[\0-\x1f\x7f]/g, ' ').slice(0, 120) : null;
    const prev = p.kernelLive || null;
    const was = prev && prev.engine === engine && prev.version === version ? prev : null;
    if (!was || was.why !== v.why || JSON.stringify(was.live) !== JSON.stringify(v.live) || JSON.stringify(was.probe) !== JSON.stringify(v.probe)) { p.kernelLive = { engine, version, why: v.why, probe: v.probe, live: v.live, at: now(), filed: !!(was && was.filed), ...(was && was.noticeId ? { noticeId: was.noticeId } : {}) }; if (prev && prev !== was) markCleared(prev, p); commit(); }
    if (p.kernelLive.filed) return p.kernelLive;
    const sib = reg.profiles.find((x) => x && x !== p && x.kernelLive && x.kernelLive.filed && x.kernelLive.engine === engine && x.kernelLive.version === version);
    if (sib) { p.kernelLive.filed = true; if (sib.kernelLive.noticeId) p.kernelLive.noticeId = sib.kernelLive.noticeId; commit(); return p.kernelLive; }
    if (!userTodos || typeof userTodos.add !== 'function') return p.kernelLive;
    const n = BB.liveKernelNotice({ engineLabel: f.label || '', id: engine, version, verdict: v });
    try { const it = userTodos.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', text: n.text, detail: n.detail, sessionName: 'Agent browser', i18n: n.i18n }); p.kernelLive.filed = true; if (it && it.id) p.kernelLive.noticeId = String(it.id); commit(); }
    catch (e) { log.warn?.(`[browser] ${p.id} "${p.label}": the running-kernel notice was not filed (${e && e.message}) — tried again at its next answer`); }
    return p.kernelLive;
  }
  /** lane browser-admin: the owner a NEW record is born with from the dialog's `use` (rows already resolved to keys by the
   *  route) — THE write's verdict over an empty record, so a create says the same refusals a PATCH says. Throws by name. */
  function rowFromUse(use, { knownKeys = null, label = '' } = {}) {
    const known = new Set(Array.isArray(knownKeys) ? knownKeys : []);
    const uv = B.usePatchVerdict({ profile: { id: 'bp-00000000', label: String(label || ''), grantUse: { to: [{ kind: 'everyone' }], except: [] } }, use, knownTask: knownTaskOrHeld, knownKey: (bk) => known.has(bk), conversationOf: conversationOfKey });
    if (!uv.ok) throw namedError(uv.code, uv.error);
    return uv.row;
  }
  /** lane grants-unify: a NEW record's row in the ONE store (written right after the record lands; a refused write takes
   *  the record back out — nobody may use a profile whose list was never written). */
  function bornWithRow(rec, row, by) {
    try { writeUseRow(rec, row, by === 'agent' ? 'agent' : 'user'); }
    catch (e) { const i = reg.profiles.indexOf(rec); if (i >= 0) reg.profiles.splice(i, 1); throw e; }
  }
  /** Adopt a directory that already exists (the migration's legacy record).
   *  Idempotent on `dir`. */
  function adoptDirectory({ label, dir, legacy = false, owner = null, createdBy = null }) {
    ensureLoaded();
    const have = reg.profiles.find((p) => !p.host && (p.dir === String(dir) || (p.dir && F.sameRealDir(p.dir, dir) === true))); // verify F1: one identity per directory — verify r2 (Y1e): never a paired machine's record (its path names another machine)
    if (have) return { profile: pview(have), created: false };
    try { if (!fs.statSync(dir).isDirectory()) return { profile: null, created: false, why: `${dir} is not a directory` }; } catch { return { profile: null, created: false, why: `${dir} does not exist` }; }
    const p = createProfile({ label }, { owner, dir, legacy, createdBy });
    return { profile: p, created: true };
  }
  // ── lane browser-profile-clone (B-9669, the owner 2026-10-08): NEW PROFILE… COPIED FROM a named profile on the same machine.
  // A one-time snapshot (logins drift after); a USER act only (the route refuses an agent's token); the measured answer to
  // "does a copy decrypt" is in src/browser-clone.js.
  const cloneHolders = (id) => reg.leases.filter((l) => l.profileId === id).map((l) => ({ sessionId: l.sessionId || null, browserKey: l.browserKey || null }));
  const cloneLive = (id) => B.isLiveBrowser(reg.browsers[id]) || starting.has(id);
  /** The dialog's "Copy logins from" rows for a profile that will run on `host` (null = this machine). */
  function cloneSources(host = null) { ensureLoaded(); return CL.sourceRows({ profiles: named(), host: host || null, liveOf: cloneLive, holdersOf: cloneHolders }); }
  /** Is a browser still on the source's directory — the recorded browser (pid + starttime) or the directory's lock holder? */
  function cloneHolderAlive(p) {
    const b = (reg.browsers[p.id] || {}).browser;
    if (b && Number.isInteger(b.pid) && (b.starttime != null ? F.sameProcess(b.pid, b.starttime) : F.pidAlive(b.pid))) return true;
    const l = F.readSingletonLock(p.dir);
    return !!(l && l.host === os.hostname() && F.pidAlive(l.pid));
  }
  /** `input.cloneFrom` = the source profile's id; the rest is the dialog's create body. `nameOf(sessionId)` names a holder.
   *  Judged BEFORE anything is stopped or written; a running source is stopped through the panel's own Stop, its exit
   *  witnessed (bounded); the copy is sized, then made atomically; the record is born with `clonedFrom`. Throws by name. */
  async function cloneProfile(input = {}, { nameOf = null, platform: hostPlatform = null, ...opts } = {}) {
    ensureLoaded();
    const src = profile(String(input.cloneFrom || ''));
    const host = input.host && input.host !== 'local' ? String(input.host) : null;
    const holders = (id) => cloneHolders(id).map((h) => ({ ...h, name: (typeof nameOf === 'function' && h.sessionId && nameOf(h.sessionId)) || null }));
    const judge = (bytes) => CL.cloneVerdict({ source: src && !isEph(src) ? src : null, host, live: !!src && cloneLive(src.id), holders: src ? holders(src.id) : [], platform: host ? (hostPlatform || 'linux') : process.platform, cloneOp: !host, bytes }); // a paired machine: its agent has no copy op yet
    const refuse = (v) => namedError(v.code, v.error, { ...(v.holders ? { holders: v.holders } : {}), ...(v.bytes != null ? { bytes: v.bytes } : {}), ...(src ? { source: src.label } : {}) });
    let v = judge(null);
    if (!v.ok) throw refuse(v);
    const { input: ci, clonedFrom } = CL.cloneInput(input, src, now());
    const pre = B.validateProfileInput(ci, { existing: named(), control, mediation: mediationOn() }); // a taken name never stops the source
    if (!pre.ok) throw namedError(pre.code, pre.error, pre.why ? { why: pre.why } : {});
    if (v.stopFirst) { log.log?.(`[browser] ${src.id} "${src.label}": stopped to copy its logins into a new profile`); await stop(src.id, { why: 'user' }); }
    const until = now() + CL.CLONE_EXIT_WAIT_MS;
    while (cloneHolderAlive(src) && now() < until) await sleep(100);
    if (cloneHolderAlive(src)) throw namedError('source_still_running', `the browser of ${JSON.stringify(src.label)} did not exit within ${CL.CLONE_EXIT_WAIT_MS / 1000} s — nothing was copied`, { source: src.label });
    v = judge(await CR.sizeToCopy(src.dir, { stopAt: CL.CLONE_MAX_BYTES })); // judged again: a lease may have landed meanwhile
    if (!v.ok || v.stopFirst) throw v.ok ? namedError('source_still_running', `${JSON.stringify(src.label)} started again while it was being copied — nothing was copied`, { source: src.label }) : refuse(v);
    const id = mintId();
    const d = path.join(homeDir, '.agent-browser', B.profileDirName(id));
    const t0 = now();
    await CR.copyProfileDir(src.dir, d);
    try {
      const out = createProfile(ci, { ...opts, id, dir: d, clonedFrom });
      log.log?.(`[browser] ${id} "${out.label}" copied from ${src.id} "${src.label}" in ${now() - t0} ms`);
      return out;
    } catch (e) { try { await fs.promises.rm(d, { recursive: true, force: true }); } catch { /* said by the refusal */ } throw e; }
  }
  /** lane S2: may this profile's record go at all (leases / a running browser) — asked BEFORE any pin is cleared for it. */
  function removeVerdict(id) {
    ensureLoaded();
    const p = profile(id);
    if (!p) return { ok: false, code: 'not-found', error: `no profile ${id}` };
    const held = reg.leases.filter((l) => l.profileId === id);
    if (held.length) return { ok: false, code: 'leased', error: `profile "${p.label}" is attached by ${held.length} session(s) (${held.map((l) => l.browserKey).join(', ')}) — detach them first` };
    if (B.isLiveBrowser(reg.browsers[id])) return { ok: false, code: 'running', error: `profile "${p.label}" has a running browser — stop it first` };
    { const ph = passkeyHeldNow(); if (ph) return { ok: false, code: 'passkeys_unread', status: 503, error: passkeyRemovalWords(ph) }; }   // r3632 MUST 1: HELD — refused in the VERDICT, before a caller unpins, unwatches or moves a lineage
    return { ok: true };
  }
  /** Removal is refused while anything holds or runs it — a cookie jar is
   *  somebody's login; the directory itself is NEVER deleted by this (D8). */
  function removeProfile(id, { unpin = false, machine = null, replyMs = null, lineageMoved = false } = {}) {
    ensureLoaded();
    const p = profile(id);
    if (!p) throw namedError('not-found', `no profile ${id}`);
    // lane S2 (naive study 2, T7): a profile a conversation PINS is never removed out from under it — refused
    // `pinned` with the count (the UI asks "N conversations use this profile — unpin them?"); with `unpin` every
    // such pin is cleared and MARKED (the conversation's browser fact says "work was deleted — its pin was cleared")
    // (the pin is judged LAST: a leased / running profile is refused first, so an unpin never runs for a removal that cannot happen)
    const rv = removeVerdict(id);
    if (!rv.ok) throw namedError(rv.code, rv.error);
    // r3261: THE PASSKEY STORE HELD (unread): a removed profile's keys could not go with it — the removal is refused BY NAME before
    // anything moves (the remover asks the fact; never «dropped» over a store that could not be read). A sweep's retire waits too.
    { const ph = passkeyHeldNow(); if (ph) throw namedError('passkeys_unread', passkeyRemovalWords(ph)); }   // r3632: the BELT (the verdict above refuses first)
    const pv = BF.deletePinnedVerdict({ label: p.label, pinnedBy: pinnedBy(id), unpin });
    if (!pv.ok) throw namedError(pv.code, pv.error, { pinnedCount: pv.count, pinnedNames: pv.names });
    // verify r4 (S26b): the DIRECTORY remembers the lineage its record carried — a retired ephemeral's kept directory outlives it
    // verify r8 (T2 ③): a record whose start was REFUSED (`failed` at the door: an adopted backup judged a copy, a stranger's directory)
    // has nothing to remember — its retire never mints into the directory (the launched record's retire remembers as r4 built it)
    // the moved line's must 3 (主开发 2026-11-19 22:38Z): a FORGET moves the folder itself and has written its lineage under the
    // new name already (`lineageMoved`) — its retire remember is done; a second one here would find the folder still at its old
    // path (the record now lands BEFORE the rename) and re-key the lineage BACK to a path the rename then empties (the release
    // renamed first, so this remember was skipped as gone). The line below is unchanged; its control cuts it whole
    if (lineageMoved && p.dir) lineageLedger('retire-skipped-forget', { dir: dirKeyOf(p.dir), id });
    else {
    if (p.dir && reg.browsers[id]) { const rr = reg.browsers[id]; if (rr.state !== 'failed') rememberDir(p.dir, launchHostsFor(rr, p.dir), { retire: true }); else lineageLedger('retire-skipped-refused', { dir: dirKeyOf(p.dir), id }); }
    }
    const goneRec = reg.profiles.find((x) => x.id === id) || null;
    reg.profiles = reg.profiles.filter((x) => x.id !== id);
    delete reg.browsers[id];
    for (const [k, v] of Object.entries(reg.pins)) if (v && v.profileId === id) reg.pins[k] = { profileId: null, origin: 'harness', at: now(), cleared: { id, label: p.label, at: now() } }; // lane S2: the cleared MARK (read by the browser fact)
    ephPairs.delete(id); ephSessions.delete(id); humans.delete(id); rung2Refusals.delete(String(id)); delete reg.leftTabs[id]; if (reg.loginFences) delete reg.loginFences[id]; // BROWSE YOURSELF: never outlives its record; verify r5 ②: nor the refusals told at a drive's end; vault-login Shape S: nor its persisted fences
    displays.dropEngineWrapper(id); // lane engine-args-string r2: its engine wrapper goes with it (removal needs a stopped browser)
    dropEgress(id); // lane engine-spi-egress: its egress proxy never outlives its record (a conversation's browser on a wrapped engine had one each)
    const sweep = sweepIds.has(id);   // read before the commit below (its piece's own id set)
    if (sweepIds.has(id)) sweepDirty = true; else commit(); // keeper-sweep-yields F5: the walk's own removal is written and broadcast with its PIECE (retireInSteps)
    for (const fn of [...profileDropNowListeners]) { try { fn(id); } catch { /* best effort */ } }   // r221: a credential's MEMORY goes at the press — never behind the write
    // lane lg-store-writes (the moved2 cure 2 — THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING, no roll back and no half state): the
    // record is out of memory and marked for the writer as always; what cannot be undone — its grant row, the keeper's marked config,
    // its passkeys, the drop listeners, and (`machine`: the record's snapshot) the paired machine's folder — runs once the removal is
    // ON DISK; a kill first brings the profile back WHOLE. The reply waits `replyMs` (landed = done; not yet = said, and the rest
    // follows by itself at the landing — a second press finds it gone and nothing left half taken). The sweep's ephemeral retire
    // keeps its piece (its removal is written with the walk's piece; an ephemeral record retires again at the next boot's sweep)
    const step = () => {
      if (goneRec && goneRec.kernelLive) markCleared(goneRec.kernelLive, goneRec);   // B-cf42 cure: a removed profile's mark goes with it — the moved2 census: at the landing (the engine's For-you notice is marked done only then)
      // lane grants-unify: its list goes with it (a record re-made under its id starts at its own default)
      if (!isEph(p)) { try { const g = grantsOf(); if (g) g.remove('browser-profile', id, 'user'); } catch (e) { log.warn?.(`[browser] the grant row of ${id} was not removed — ${e && e.message}`); } }
      // r4: the keeper's own marked config for this record goes with it (nothing runs on it — removal needs a stopped browser)
      { const mk = markOf(p); if (mk && MARK_RE.test(String(mk))) { try { fs.rmSync(path.join(CONFIG_DIR, markFileName(isEph(p) ? 'ephemeral' : 'machine', mk)), { force: true }); } catch { /* best effort */ } configMemo.delete((isEph(p) ? 'ephemeral' : 'machine') + '|' + mk); } }
      let passkeys = 0; try { passkeys = passkeyDrop ? Number(passkeyDrop(id)) || 0 : 0; } catch (e) { log.warn?.(`[browser] the passkeys of ${id} were not removed — ${e && e.message}`); }
      for (const fn of [...profileDropListeners]) { try { fn(id); } catch { /* best effort */ } }
      if (passkeys) log.log?.(`[browser] profile ${id}: its ${passkeys} passkey(s) removed with it`);
      const onMachine = machine ? removeOnMachine(id, { profile: machine }) : null;   // a promise: the machine's own op, asked only now
      return { passkeys, onMachine };
    };
    if (isEph(p)) log.log?.(`[browser] ephemeral browser record ${id} "${p.label}" removed with its conversation ${p.owner.id}${p.dir ? ' (its scratch directory ' + p.dir + ' is browser-env\'s sweep to reclaim)' : ''}`);
    else log.log?.(`[browser] profile ${id} "${p.label}" removed from the registry (its directory ${p.dir} is kept — deletion is a human act)`);
    let ran = null;
    const landing = sweep ? Promise.resolve({ landed: true, value: (ran = step()) }) : rideLanding(() => (ran = step()), { what: `profile ${id}'s removal`, timeoutMs: replyMs });
    // the answer: `passkeys` once the step ran here (a store with nothing owed runs it at once); `landing` (not a field of the
    // answer — a caller awaits it) resolves {landed, value: {passkeys, onMachine}} at the landing or at `replyMs`
    const out = { removed: id, dir: p.dir, ...(ran ? { passkeys: ran.passkeys } : {}) };
    Object.defineProperty(out, 'landing', { value: landing, enumerable: false });
    return out;
  }
  /** LANE REMOTE-PROFILE-START (design 014 lane 3b): a PAIRED machine's profile goes WITH its folder there — the machine's
   *  `remove` op (it composes ~/.agent-browser/vs-bp-<id> from the id itself; the hub never names a path), asked BEFORE the
   *  record goes; anything it could not remove (offline, an older agent, its browser running there) is SAID in `left` and
   *  the record still goes (the user asked). null = nothing lives on a machine (this computer's profile, a `cdp` one).
   *  verify r1: `profile` = the record's snapshot taken before removeProfile — the callers remove the record FIRST (no start
   *  can land between the folder's removal and a refused record), then ask the machine. */
  async function removeOnMachine(id, { profile: snap = null } = {}) {
    ensureLoaded();
    const p = snap && snap.id === id ? snap : profile(id);
    if (!p || !p.host || !(B.providerRow(p.provider) || {}).starts) return null;
    const where = `~/.agent-browser/${B.profileDirName(p.id)}`;
    try { const r = await acc().call(p.host, 'remove', { profileId: p.id }); log.log?.(`[browser] profile ${p.id} "${p.label}": its folder on ${p.host} ${r.removed ? 'deleted' : 'was already gone'} (${r.dir || where})`); return { host: p.host, removed: !!r.removed, dir: r.dir || where, left: null }; }
    catch (e) { const left = `its folder ${where} on ${p.host} was left there (${e && e.message})`; log.warn?.(`[browser] profile ${p.id} "${p.label}": ${left}`); return { host: p.host, removed: false, dir: where, code: (e && e.code) || 'remove_failed', left }; }
  }
  /** P5: the editable fields of a record — `record` (the per-profile screencast
   *  opt-in, D7), `label` (validated like a create: free text, unique, never a
   *  path) and `notes`. Anything else is refused by name. */
  /** The whole write is ONE commit (its narrowing's detaches included) — `batched`. */
  function updateProfile(id, patch = {}, opts = {}) { return batched(() => updateProfileNow(id, patch, opts)); }
  function updateProfileNow(id, patch = {}, opts = {}) {
    ensureLoaded();
    const p = profile(id);
    if (!p) throw namedError('not-found', `no profile ${id}`);
    if (isEph(p)) throw namedError('not_editable', `"${p.label}" is a conversation's managed ephemeral browser — it has no editable fields (it goes with its conversation); a login that should survive belongs in a named profile`);
    // "Who can use it" is a LIST (2026-09-27): `use` ({mode:'all'} | {mode:'only', who:[…]}) + the `base` stamp the reader
    // was given = the panel dialog's Save — a USER act. The 2.369.194 body (`scope` / `conversation`) is refused by name.
    const allowed = new Set(['record', 'label', 'notes', 'sharing', 'use', 'base', 'recordMine', 'removeExcept', 'proxy', 'proxyCredential']); // + B-8b87: the proxy and its login (a person's: the routes refuse a bearer) // + BROWSE YOURSELF: "Also record my own actions"
    const keys = Object.keys(patch || {}).filter((k) => patch[k] !== undefined);
    if (keys.includes('scope') || keys.includes('conversation')) throw namedError('bad-request', '"Who can use it" is a list now — send `use`: {mode:"all"} or {mode:"only", who:[{kind:"task", id} | {kind:"session", key}]} with the `base` stamp you read');
    const bad = keys.filter((k) => !allowed.has(k));
    if (bad.length) throw namedError('bad-request', `these fields cannot be changed here: ${bad.join(', ')} (only record / label / notes / sharing / use / recordMine / proxy / proxyCredential)`);
    if (!keys.filter((k) => k !== 'base').length) throw namedError('bad-request', 'nothing to change');
    if (keys.includes('base') && !keys.includes('use')) throw namedError('bad-request', '`base` goes with `use`');
    // lane held-except-doors: `removeExcept` = the exceptions («除了») this Save takes away, by principal key — the dialog SAID
    // each («X will no longer be excluded»); one left out unnamed is refused by the ONE writer (`except_unnamed`)
    if (keys.includes('removeExcept') && (!keys.includes('use') || !Array.isArray(patch.removeExcept) || patch.removeExcept.length > 1024 || patch.removeExcept.some((k) => typeof k !== 'string' || k.length > 260))) throw namedError('bad-request', '`removeExcept` goes with `use`: a list of the principal keys this Save takes out of «Except»');
    // `use` is saved ON ITS OWN: its narrowing detaches leases (each detach commits), so a later field refused in the same
    // body would leave half a write on disk
    if (keys.includes('use') && keys.some((k) => k !== 'use' && k !== 'base' && k !== 'removeExcept')) throw namedError('bad-request', '`use` is saved on its own — send the other fields in another request');
    const changed = {};
    let detached = [], undecided = [], added = [];
    if (keys.includes('use')) {
      // THE WHOLE-LIST RULE (mirror-193), asked HERE — after every await the route made resolving the picked sessions: a
      // list that moved since the dialog read it is never overwritten (409 list-changed, nothing written)
      const bv = B.useBaseVerdict(p, patch.base);
      if (!bv.ok) throw namedError(bv.code, bv.error, { added: bv.added || [], removed: bv.removed || [] });
      const known = knownKeysOf(p, opts.knownKeys);
      const v = B.usePatchVerdict({ profile: p, use: patch.use, knownTask: knownTaskOrHeld, knownKey: (bk) => known.has(bk), conversationOf: conversationOfKey });
      if (!v.ok) throw namedError(v.code, v.error);
      const wasStamp = B.useStamp(p), was = B.useDigestOf(p);
      const next = { ...p, grantUse: { to: v.row.to, except: v.row.except } };
      if (B.useStamp(next) !== wasStamp) {
        const wasRows = new Set((was.who || []).map((w) => (w.kind === 'session' ? 's:' + w.key : 't:' + w.id)));
        writeUseRow(p, v.row, 'user', patch.removeExcept || []);   // lane grants-unify: THE ONE WRITER (the store), the mirror refreshed
        p.scopeAt = now(); // the instant of the last change — logs and the row's tooltip; never an authorization input
        const nowUse = B.useDigestOf(p);
        added = (nowUse.who || []).filter((w) => !wasRows.has(w.kind === 'session' ? 's:' + w.key : 't:' + w.id));
        changed.use = { was, now: nowUse };
        // NARROWING (§3.1): every lease on this profile the new list no longer admits is detached NOW (by the user — its own
        // takeover ends with it, its tab closes); a conversation whose Task Groups cannot be read is KEPT and reported
        // `undecided`. A widening detaches nobody (every lease it admitted before, it admits now).
        const rj = rejudgeLeases(id, 'narrowed');
        detached = rj.detached; undecided = rj.undecided;
      }
    }
    if (keys.includes('label')) {
      const v = B.validateProfileInput({ label: patch.label }, { existing: named().filter((x) => x.id !== id), control });
      if (!v.ok) throw namedError(v.code, v.error);
      if (v.value.label !== p.label) { changed.label = { was: p.label, now: v.value.label }; p.label = v.value.label; }
    }
    // B-8b87: THE PROXY AND ITS LOGIN — the address alone (a login in it is refused: it goes in the vault), the login a vault entry
    // saved for THAT proxy; a profile on a paired machine takes none (the forwarder is this hub's); a browser running applies it at its
    // next start (its forwarder's upstream is read at the start)
    if (keys.includes('proxy') || keys.includes('proxyCredential')) {
      const np = B.normalizeProxy(keys.includes('proxy') ? patch.proxy : p.proxy);
      if (!np.ok) throw namedError(np.code || 'bad_proxy', np.error);
      if (np.value && p.host) throw namedError('proxy_off_machine', `"${p.label}" runs on another machine — a browser profile's proxy works for browsers on this machine only, for now`);
      if (np.value && B.isCloudProfile(p)) throw namedError('proxy_cloud_browser', `"${p.label}": ${B.PROXY_CLOUD_WHY}`);   // B-8b87 cure
      const nc = B.normalizeProxyCredential(keys.includes('proxyCredential') ? patch.proxyCredential : (np.value === p.proxy ? p.proxyCredential : null), np.value);
      if (!nc.ok) throw namedError(nc.code, nc.error);
      // the exit check (主开发 17:04Z): a KEPT EXIT belongs to the road it was kept for — any change of the proxy (its address, its removal,
      // its adding, its login) forgets it, measured or typed alike, said in this answer (changed.exitForgotten)
      if ((np.value !== (p.proxy || null) || nc.value !== (p.proxyCredential || null)) && p.egress) { delete p.egress; changed.exitForgotten = true; }
      if (np.value !== (p.proxy || null) || nc.value !== (p.proxyCredential || null)) { changed.proxy = { was: B.proxyPublicView(p.proxy), now: np.value, credential: nc.value, applies: 'at the next start' }; p.proxy = np.value; p.proxyCredential = nc.value; }
    }
    if (keys.includes('record')) { const v = patch.record === true || patch.record === 'true' || patch.record === 1; if (v !== !!p.record) { changed.record = { was: !!p.record, now: v }; p.record = v; } }
    // BROWSE YOURSELF (B-6ae8, the owner 4): the per-profile opt-OUT of recording the USER's own actions (default ON)
    if (keys.includes('recordMine')) { const v = !(patch.recordMine === false || patch.recordMine === 'false' || patch.recordMine === 0); if (v !== HM.recordsMine(p)) { changed.recordMine = { was: HM.recordsMine(p), now: v }; p.recordMine = v; } }
    if (keys.includes('notes')) { const v = String(patch.notes || '').slice(0, 2000); if (v !== p.notes) { changed.notes = true; p.notes = v; } }
    // P6 (§6.2): `sharing` flips only through the verdict (instance needs the
    // proxy and this machine), never on the legacy record, and never while a
    // session holds a lease — the env it was handed says which kind it is
    if (keys.includes('sharing')) {
      if (p.legacy) throw namedError('bad-request', 'the legacy shared profile keeps its cooperative sharing — adopt it as a new profile to mediate it');
      const sv = B.sharingVerdict({ sharing: patch.sharing, host: p.host || null, mediation: mediationOn() });
      if (!sv.ok) throw namedError(sv.code, sv.error, { why: sv.why });
      if (sv.value !== p.sharing) {
        const held = reg.leases.filter((l) => l.profileId === id).length;
        if (held) throw namedError('leased', `"${p.label}" is attached by ${held} session(s) — their environment names the kind of attachment; detach them first`);
        // owner ruling A: a pin is a default ATTACHMENT (never a directory), so a pinned profile may become mediated too
        changed.sharing = { was: p.sharing, now: sv.value }; p.sharing = sv.value;
      }
    }
    if (Object.keys(changed).length) { commitSync(); log.log?.(`[browser] profile ${id} "${p.label}" updated: ${Object.keys(changed).join(', ')}${changed.use ? ` (who can use it: ${whoWords(p)})` : ''}${detached.length ? ` (narrowed: ${detached.length} conversation(s) detached — ${detached.map((d) => d.browserKey).join(', ')})` : ''}${undecided.length ? ` (kept, undecided — the Task Group list could not be read: ${undecided.join(', ')})` : ''}`); emitLease({ kind: 'profile-updated', profileId: id, changed }); }
    return { profile: pview(p), changed, detached, undecided, added };
  }

  // ── the pin (§3.2.5): browserKey → profile ──
  function pinFor(browserKey) {
    ensureLoaded();
    const v = reg.pins[String(browserKey || '')];
    if (!v || !v.profileId) return null;
    const p = profile(v.profileId);
    if (!p || isEph(p)) return null;
    return { profileId: p.id, label: p.label, dir: p.dir, origin: v.origin || 'chosen', at: v.at || 0, by: v.by === 'agent' ? 'agent' : 'user' };
  }
  /** lane S2: the conversations whose pin names this profile — [{browserKey}] (the delete's refuse-or-warn). */
  function pinnedBy(profileId) {
    ensureLoaded();
    const id = String(profileId || '');
    return Object.entries(reg.pins).filter(([, v]) => v && v.profileId === id).map(([k, v]) => ({ browserKey: k, origin: v.origin || 'chosen', by: v.by === 'agent' ? 'agent' : 'user' })); // + origin/by (owner ruling A's seam shape)
  }
  /** lane S2: clear ONE conversation's pin because its profile is going (or is already gone) — with `cleared`, the
   *  entry keeps the mark `{id, label, at}` the browser fact reads ("work was deleted — its pin was cleared"). */
  function clearPin(browserKey, { cleared = null } = {}) {
    refuseIfHeld('clearing a pin');   // the B-f276 remainder: refused by name while the registry is held (nothing minted, nothing written)
    ensureLoaded();
    const bk = String(browserKey || '');
    if (!B.isBrowserKey(bk)) return false;
    if (!cleared && (!reg.pins[bk] || !reg.pins[bk].profileId)) return false;
    reg.pins[bk] = { profileId: null, origin: 'harness', at: now(), ...(cleared ? { cleared: { id: cleared.id || null, label: String(cleared.label || ''), at: now() } } : {}) };
    commit();
    return true;
  }
  /** The keys a "Who can use it" write may name (§6.2 `unknown_conversation`): the list's own rows, every key a live
   *  session carries, the conversation that made the profile, every lease / pin holder of THIS profile, and the keys the
   *  route just resolved from picked live sessions. */
  function knownKeysOf(p, extra = null) {
    const out = new Set();
    const U = B.whoMayUse(p);
    if (U) for (const w of [...(U.who || []), ...(U.kept || []), ...(U.except || [])]) if (w.kind === 'session') out.add(w.id);
    try { for (const k of liveKeys() || []) if (!isRemoteKey(k)) out.add(B.parentKeyOf(String(k))); } catch { /* none */ } // a remote session's key is never a list row
    if (p && p.createdBy) out.add(B.parentKeyOf(p.createdBy));
    for (const l of reg.leases) if (p && l.profileId === p.id) out.add(B.parentKeyOf(l.browserKey));
    for (const [k, v] of Object.entries(reg.pins)) if (p && v && v.profileId === p.id) out.add(B.parentKeyOf(k));
    for (const k of extra || []) out.add(B.parentKeyOf(String(k)));
    return out;
  }
  /**
   * THE RE-JUDGE (§3.1, ONE function): every lease on `profileId` (only the conversation `onlyKey`'s, when given) is
   * judged by the list as it is NOW with the holder's Task Groups as they are NOW (`facts` = the asker's, already read,
   * for the verb-time call); not admitted ⇒ detached by the user now (its tab closes, its takeover ends, it hears it on
   * its next message through the route's notice); the Task Group list unreadable ⇒ KEPT and reported `undecided`.
   * → `{detached:[{browserKey, sessionId}], undecided:[browserKey]}`.
   */
  function rejudgeLeases(profileId, why = 'rejudge', { onlyKey = null, facts = null, quietUndecided = false } = {}) {
    const out = { detached: [], undecided: [] };
    const p = profile(profileId);
    if (!p || isEph(p)) return out;
    for (const l of reg.leases.filter((x) => x.profileId === profileId && (!onlyKey || B.parentKeyOf(x.browserKey) === onlyKey))) {
      const g = facts || groupsOfKey(l.browserKey);
      // a holder whose Task Groups cannot be read NOW — the store threw, or NO running session carries its key (a
      // stopped conversation) — is judged by its key alone; with a Task Group row on the list it is UNDECIDED and kept:
      // its next command asks with live facts (verify 2026-09-28: "stopped" read as "in no group" let a WIDENING detach
      // a stopped member of the listed group — a tab closed for a change that kept it)
      const notNow = !!g.unreadable || g.live === false;
      const may = mayAttachL(p, { browserKey: l.browserKey, conversationKeys: g.keys || keysOfKey(l.browserKey), taskIds: g.ids, groupsUnreadable: notNow });
      if (may.ok) continue;
      if (may.code === 'groups_unreadable') { out.undecided.push(l.browserKey); if (!quietUndecided) log.log?.(`[browser] ${profileId} "${p.label}": ${l.browserKey} kept (${why}) — ${g.live === false && !g.unreadable ? 'no running session carries it, so its Task Groups are judged at its next command' : 'its Task Groups could not be read'}; whether the list still admits it is undecided`); continue; }
      try { detach({ profileId, browserKey: l.browserKey, by: 'user' }); out.detached.push({ browserKey: l.browserKey, sessionId: l.sessionId || null }); closeLeaseSession(p, l.browserKey, why); }
      catch (e) { log.warn?.(`[browser] ${profileId}: ${why} could not detach ${l.browserKey} — ${e && e.message}`); }
    }
    return out;
  }
  /**
   * identity verify r4 (2026-09-28): EVERY lease a list admits THROUGH A TASK GROUP, re-judged by the lists and the Task
   * Groups as they are NOW — the hook the task store's onChange calls (server.js). Before it, a conversation removed
   * from the Task Group a profile is kept to (or whose group was deleted) kept its lease until ITS OWN next CLI verb —
   * and a mediated lease's grant with it, so a raw CDP client on the mediated url (the daemon's channel; the url is in
   * the env the agent was handed) went on reading and driving the kept profile's browser for as long as the agent
   * chose to send no verb (reproduced on the real keeper + mediator: lease, grant and a Runtime.evaluate through it all
   * stood after the group change). Now the group change is judged like a narrowing: not admitted ⇒ detached by the user
   * now (its tab closes, the grant is revoked — its connections close 1008 lease_gone — it hears it at its next
   * message); a stopped conversation's lease (`live: false`) and an unreadable store stay UNDECIDED and kept, silently
   * (this runs on every task-store write). Only `only` lists with a Task Group row can change by a group change, and
   * only profiles with a lease are walked. → {profiles, detached:[{browserKey, sessionId, profileId}], undecided:[key]}
   */
  function rejudgeAll(why = 'task-groups-changed') {
    ensureLoaded();
    const out = { profiles: 0, detached: [], undecided: [] };
    for (const p of [...reg.profiles]) {
      if (isEph(p) || p.legacy) continue;
      // lane grants-unify: a Task Group in the list — or one LEFT OUT under All agents — is what a group change can move
      const row = B.grantRowOf(p);
      if (!row || ![...row.to, ...row.except].some((e) => e.kind === 'group')) continue;
      if (!reg.leases.some((l) => l.profileId === p.id)) continue;
      out.profiles++;
      const r = rejudgeLeases(p.id, why, { quietUndecided: true });
      for (const d of r.detached) out.detached.push({ ...d, profileId: p.id });
      for (const u of r.undecided) out.undecided.push(u);
    }
    if (out.detached.length) log.log?.(`[browser] ${why}: ${out.detached.length} lease(s) detached — ${out.detached.map((d) => `${d.browserKey} off ${d.profileId}`).join(', ')}`);
    return out;
  }
  /** A tab the USER took away (a narrowing, a conversation that left the listed Task Group) CLOSES in the shared browser:
   *  the lease session's own `close` — the CLI's `close` of an attachment, that session's connection and its tab, never
   *  the browser (the other conversations keep theirs). A mediated lease's tabs were closed by the mediator's revoke in
   *  detach(). Best effort, never awaited by the write that caused it; said in the journal. */
  const sessionCloses = new Map(); // B.sessionCloseKey → the close in flight (lane jobs-browser-f11-race: the same holder's next attach waits for it)
  function closeLeaseSession(p, browserKey, why) {
    if (!p || isEph(p) || isMediated(p)) return;
    const rec = reg.browsers[p.id];
    if (!B.isLiveBrowser(rec) || !isLocalRec(rec)) return;
    const ck = B.sessionCloseKey(p.id, browserKey);
    const run = (async () => {
      const o = await leaseCliOpts(p.id, browserKey);
      if (!o) return;
      // the session's OWN tab (its bound tab — measured on 0.38.1: a CDP-connected session's `close` ends its connection
      // and leaves its page in the browser), then its connection; never `--all`, never another session's tab
      const t = await rt.exec(nsOf(p.id), ['tab', 'close'], o);
      const c = await rt.exec(nsOf(p.id), ['close'], o);
      const said = (r) => (r && r.ok ? 'done' : 'failed (' + String((r && (r.stderr || r.error)) || '').trim().slice(0, 120) + ')');
      log.log?.(`[browser] ${browserKey}: its tab in ${p.id} "${p.label}" — tab close ${said(t)}, session close ${said(c)} (${why})`);
      // measured on 0.38.1: the session stays bound to the tab it lost (`tab_gone` on its next command) — marked, so the
      // conversation's NEXT attach binds it a new tab first (persisted: a restart in between keeps the mark)
      if (t && t.ok) { markTabLost(p.id, browserKey, 'closed'); commit(); }
    })().catch((e) => log.warn?.(`[browser] ${browserKey}: its tab in ${p.id} was not closed (${why}) — ${e && e.message}`)).finally(() => { if (sessionCloses.get(ck) === run) sessionCloses.delete(ck); });
    sessionCloses.set(ck, run);
  }
  /**
   * THE PICK WRITES THE LIST (§3.3 — the owner's default 1, 2026-09-27): the USER picked `p` for the conversation
   * `browserKey` (New Session's explicit pick, Session properties, the card menu, the UI's attach). If the list does not
   * admit it (not listed, none of its Task Groups listed — or the Task Group list unreadable: the user's pick is the
   * answer), the conversation is APPENDED to the list in the same commit and `scopeAt` stamped → `{profileId, label}`;
   * null when nothing was written (every conversation may, it is admitted already, the record has no list). The caller
   * commits.
   */
  function addConversation(p, browserKey, facts = null, { remote = false } = {}) {
    if (!p || isEph(p) || p.legacy) return null;
    // identity verify r2 (2026-09-28): a conversation on another machine is never listed — the picker never offers it,
    // the PATCH refuses its key, and its lease could never reach this machine's browser (the pin stays a preference)
    if (isRemoteKey(browserKey, remote)) { log.log?.(`[browser] ${B.parentKeyOf(browserKey)} NOT added to who can use ${p.id} "${p.label}" — it runs on another machine`); return null; }
    const g = facts || groupsOfKey(browserKey);
    const may = mayAttachL(p, { browserKey, conversationKeys: g.keys || keysOfKey(browserKey), taskIds: g.ids, groupsUnreadable: !!g.unreadable });
    if (may.ok) return null;
    // lane grants-unify: the user's pick names the CONVERSATION in the ONE store (and lifts an exception that left it out)
    const ck = conversationOfKey(browserKey);
    const row = ck ? B.rowWithConversation(p, ck) : null;
    if (!row) return null;
    try { writeUseRow(p, row, 'user', [`conversation:${ck}`]); } catch (e) { log.warn?.(`[browser] ${B.parentKeyOf(browserKey)} NOT added to who can use ${p.id} "${p.label}" — ${e && e.message}`); return null; }
    p.scopeAt = now();
    log.log?.(`[browser] ${B.parentKeyOf(browserKey)} added to who can use ${p.id} "${p.label}" — the user picked it for that conversation (now ${whoWords(p)})`);
    return { profileId: p.id, label: p.label };
  }
  /**
   * THE NEW SESSION FORM'S ADMISSION (lane new-session-form): may a conversation that does not exist yet use profile `id`
   * through the Task Groups it is about to join? — `B.mayAttach` over those groups and no key (a new conversation is on no
   * list by itself). ONE verdict for the form's list (GET /api/browser/admits) and the create (ws-create judges the form's
   * pick with it — the form never ADDS a conversation to "Who can use it"; the Agent browser panel keeps that road).
   */
  function mayAttachAtCreate(id, { taskIds = [] } = {}) {
    const p = profile(String(id || ''));
    if (!p || isEph(p)) return { ok: false, code: 'not-found', error: `no profile ${id}` };
    return mayAttachL(p, { browserKey: '', taskIds: Array.isArray(taskIds) ? taskIds.map(String) : [] });
  }
  /** «WHAT IT MAY USE» (Session Properties, unit what-it-may-use): every listed profile judged for ONE existing conversation by
   *  THE door's verdict (`B.mayAttach` — its keys, its browser key, its Task Groups now), answered as may-use-model answer
   *  rows; an exception that takes it out is named from the same row (`B.exceptEntryOf` — mayAttach's refusal carries no entry). A
   *  conversation's own temporary browser is not a grant and is not listed. */
  function admitsFor({ browserKey = '', conversationKeys = [], taskIds = [], groupsUnreadable = false } = {}) {
    ensureLoaded();
    const out = [];
    for (const p of reg.profiles) {
      if (isEph(p)) continue;
      const v = mayAttachL(p, { browserKey: String(browserKey || ''), conversationKeys, taskIds: Array.isArray(taskIds) ? taskIds.map(String) : [], groupsUnreadable: !!groupsUnreadable });   // lane lg-group-parents: THE keeper's one judge (the lineage)
      const base = { door: 'browser-profile', resource: String(p.id), name: String(p.label || p.id) };
      if (v.ok) { out.push({ ...base, ok: true, via: v.via, ...(v.taskId ? { groupId: String(v.taskId) } : {}) }); continue; }
      if (v.code === 'excepted') {
        const e = B.exceptEntryOf(p, { conversationKeys, taskIds, inheritedTaskIds: lineOf(taskIds).inherited, groupsUnreadable });
        out.push({ ...base, ok: false, code: 'excepted', ...(e ? { except: e } : {}) });
      } else if (v.code === 'groups_unreadable') out.push({ ...base, ok: false, code: 'groups_unreadable' });
      else if (v.code === 'not_owner' && (v.unknown || !B.grantRowOf(p))) out.push({ ...base, ok: false, code: 'unknown_shape' });   // B-e630: a row this release cannot read is said as that, never «not open»
      else if (v.code === 'not_owner') out.push({ ...base, ok: false, code: 'not_open' });   // B-e630 (ONE HOME): a profile whose READABLE grant row does not open it to this conversation is listed too — the person's door to it is here
    }
    return out;
  }
  /** Every listed profile's admission for a new conversation in `taskIds` (the form's 浏览器 row). */
  function admitsAtCreate({ taskIds = [] } = {}) {
    ensureLoaded();
    return reg.profiles.filter((p) => !isEph(p)).map((p) => { const v = mayAttachAtCreate(p.id, { taskIds }); return { id: p.id, ok: !!v.ok, via: v.ok ? v.via : null, ...(v.taskId ? { taskId: v.taskId } : {}), ...(v.ok ? {} : { code: v.code }) }; });
  }
  /**
   * The conversation's pin. OWNER RULING A: a pin is the conversation's DEFAULT ATTACHMENT — its next bare command opens
   * the profile THROUGH THE KEEPER (joining its running browser), never a directory handed to the session (P6's
   * `pin_refused` for a mediated profile existed only because a pin used to hand out the directory; gone). `by` says who
   * pinned. A PIN NEVER AUTHORIZES (the list does): the USER's explicit pick (`origin:'chosen'`) WRITES the list — the
   * conversation is added when the list does not admit it (`added` on the answer); a default the spawn ladder applied
   * (`conversation`, `task-group`, `instance`) never adds; an AGENT's pin must itself be admitted (refused `not_owner`
   * with the button sentence otherwise). `taskIds` / `groupsUnreadable` = the caller's read of the conversation's Task
   * Groups (else the keeper's own).
   */
  function setPin(browserKey, profileId, { origin = 'chosen', by = 'user', taskIds = null, groupsUnreadable = false, remote = false } = {}) {
    ensureLoaded();
    if (!B.isBrowserKey(browserKey)) throw namedError('bad-request', 'a pin needs a browser key');
    if (!profileId) { const had = !!reg.pins[browserKey]; delete reg.pins[browserKey]; pinFailures.delete(browserKey); if (had) commitSync(); return null; }
    const p = profile(profileId);
    if (!p || isEph(p)) throw namedError('not-found', `no profile ${profileId}`);
    const facts = Array.isArray(taskIds) ? { ids: taskIds.map(String), unreadable: !!groupsUnreadable } : null;
    if (by === 'agent') { const g = facts || groupsOfKey(browserKey); const may = mayAttachL(p, { browserKey, conversationKeys: g.keys || keysOfKey(browserKey), taskIds: g.ids, groupsUnreadable: !!g.unreadable }); if (!may.ok) throw namedError(may.code, may.error, may.remedy ? { remedy: may.remedy } : {}); }
    const added = by !== 'agent' && origin === 'chosen' ? addConversation(p, browserKey, facts, { remote }) : null;
    reg.pins[browserKey] = { profileId: p.id, origin, at: now(), by: by === 'agent' ? 'agent' : 'user' };
    pinFailures.delete(browserKey);
    commitSync();
    const out = pinFor(browserKey);
    return added && out ? { ...out, added } : out;
  }
  /**
   * B-f7ab verify r2: THE SPAWN'S WITNESSED PICK, written as the spawn would have written it. A keyless spawn (per-session
   * browsers off) still ran the pin ladder and recorded its pick (`browserPinAtStart`: profile, origin, date, by — a
   * fork's = its parent's row verbatim); the late key restores that row under the key it mints — the copy `copyPin`
   * makes for a fork, from a record instead of a live row (no `by:'agent'` re-admission: the pick was already made,
   * this only restores it). A PREFERENCE, never an admission (2.369.196): it NEVER edits any profile's `owner.who` — a
   * witness widens nothing (only the user's own `chosen` `setPin` adds a conversation to the list); whether the profile
   * admits the conversation is `whoMayUse` at every command. The date is the witness's (never later than this clock) —
   * informational. A vanished profile ⇒ null, said by the caller as the spawn says it ("pinned profile … no longer
   * exists — starting ephemeral"). → the pin, or null.
   */
  function restorePin(browserKey, witness) {
    ensureLoaded();
    if (!B.isBrowserKey(browserKey) || !B.isPinWitness(witness)) return null;
    const p = profile(witness.profileId);
    if (!p || isEph(p)) return null;
    reg.pins[browserKey] = { profileId: p.id, origin: witness.origin, at: Math.min(now(), Number(witness.at) || 0), by: witness.by === 'agent' ? 'agent' : 'user' };
    pinFailures.delete(browserKey);
    commitSync();
    return pinFor(browserKey);
  }
  /**
   * VERIFY S5 (2026-09-26) MAJOR: a FORK of a pinned conversation inherits the parent's pin AS THE KEEPER'S RECORD — an
   * honest COPY (the parent's `by` and `at` verbatim: an agent's pin stays an agent's; since 2.369.196 every pin is a
   * preference the list judges, never an authorization — so a copy widens nothing either), origin 'conversation' (the ladder's own rung). Before the
   * ruling the fork got the profile's DIRECTORY through the spawn env, so the missing keeper record was invisible; with a
   * pin as the default ATTACHMENT the keeper's record is the ONLY carrier, and a fork whose Session properties said
   * "Pinned: work" browsed in a temporary browser, silently — the study's path B in a new coat. → the copy, or null.
   */
  function copyPin(fromKey, toKey) {
    ensureLoaded();
    if (!B.isBrowserKey(fromKey) || !B.isBrowserKey(toKey) || fromKey === toKey) return null;
    const v = reg.pins[fromKey];
    if (!v || !v.profileId) return null;
    const p = profile(v.profileId);
    if (!p || isEph(p)) return null;
    reg.pins[toKey] = { profileId: p.id, origin: 'conversation', at: Number(v.at) || 0, by: v.by === 'agent' ? 'agent' : 'user' };
    pinFailures.delete(toKey);
    commitSync();
    log.log?.(`[browser] ${toKey}: inherits the pin of ${fromKey} (${p.id} "${p.label}", ${reg.pins[toKey].by}'s) — a fork's copy`);
    return pinFor(toKey);
  }
  // owner ruling A (5): a pin that did not OPEN is said — to the agent in its refusal (typed, `pinned:true`, never a
  // silent fall-back to a temporary browser: the study's path B), and here for the conversation's facts (the chip,
  // Session properties). browserKey → {profileId, label, code, error, at}; in memory (the next verb re-asks).
  const pinFailures = new Map();
  function notePinFailure(browserKey, { profileId = null, code = null, error = '' } = {}) {
    const p = profileId ? profile(profileId) : null;
    pinFailures.set(String(browserKey || ''), { profileId, label: p ? p.label : null, code: code || null, error: String(error || '').slice(0, 600), at: now() });
  }
  function pinFailureOf(browserKey) { const v = pinFailures.get(String(browserKey || '')); return v ? { ...v } : null; }
  function clearPinFailure(browserKey) { pinFailures.delete(String(browserKey || '')); }
  /** The Task-Group rung's FACT (§3.2.5 row 3): the default profile of the
   *  Task Group this create lands in — the spawned-into group first, else the
   *  earliest bound group that names one. The store is the wiring's
   *  (`taskGroupDefault({cwd, initialGroupId, sessionKey})` → id | ''); no
   *  wiring ⇒ '' (never a throw out of a create). */
  function taskGroupDefaultFor(facts = {}) {
    if (typeof taskGroupDefault !== 'function') return '';
    try { const v = taskGroupDefault(facts); return v && B.isProfileId(v) ? String(v) : ''; } catch (e) { log.warn?.(`[browser] task-group default unreadable — ${e && e.message}`); return ''; }
  }
  /** The instance default (setting `browser.defaultProfile`, an id or label). */
  /** B-f7ab verify r2: the Task Group's default CAP for a create's facts, READ (not stamped) — a keyless spawn records it
   *  as part of its start-time witness so the late key stamps what was in force at the START, never the group's later edit. */
  function taskGroupReadFor(facts = {}) {
    if (typeof taskGroupRead !== 'function') return null;
    try { return taskGroupRead(facts || {}) || null; } catch { return null; }
  }
  function taskGroupCapFor(facts = {}) {
    if (typeof taskGroupCap !== 'function') return null;
    try { return B.clampConversationCap(taskGroupCap(facts || {})); } catch (e) { if (e && e.code === 'TASK_GROUPS_UNREAD') return undefined; log.warn?.(`[browser] task-group cap unreadable — ${e && e.message}`); return null; }   // the follow-owed unit: Task Groups held ⇒ UNKNOWN (undefined), never «none in force» (null)
  }
  function instanceDefault() { return instanceDefaultOf(setting('browser.defaultProfile', '')); }
  /** the instance default as a profile id, from the setting's raw value (a label or an id) — r3 S8: a create the held registry owed
   *  keeps the raw value it read AT ITS START (readable without the registry), resolved when its pin is judged */
  function instanceDefaultOf(v) {
    if (!v) return '';
    const p = profileByRef(v);
    return p && !p.ambiguous ? p.id : '';
  }
  /**
   * WHICH profile does a create land on (§3.2.5's ladder, one call): the
   * explicit choice > the conversation's pin (a fork copies its parent's) >
   * the Task Group default (handed in by the caller when it has one) > the
   * instance default > nothing. Answers `{profileId, dir, origin}`; an empty
   * profileId is the ephemeral default with origin 'harness'.
   */
  function pinForCreate({ explicit = '', priorKey = '', forkParentKey = '', taskGroupDefault = '', resume = false, fork = false, instanceRef = undefined } = {}) {
    ensureLoaded();
    // the B-f276 remainder: a held registry names no profile — never «no longer exists» (the ladder wrote a null pin into the session):
    // the create keeps the session's pin fields untouched and its first browser command refuses by name
    if (heldReg) return { profileId: '', dir: null, origin: 'harness', held: true, refused: `the profile registry is held — ${heldWords()}` };
    const prior = priorKey ? (pinFor(priorKey)?.profileId || '') : '';
    const forkParent = forkParentKey ? (pinFor(forkParentKey)?.profileId || '') : '';
    const pick = B.pinForCreate({ explicit, prior, forkParent, taskGroup: taskGroupDefault, instanceDefault: instanceRef === undefined ? instanceDefault() : instanceDefaultOf(instanceRef), resume, fork });   // r3 S8: an owed create judges the instance default it had AT ITS START
    const p = pick.value ? profile(pick.value) || (profileByRef(pick.value) && !profileByRef(pick.value).ambiguous ? profileByRef(pick.value) : null) : null;
    if (pick.value && !p) return { profileId: '', dir: null, origin: 'harness', refused: `pinned profile ${pick.value} no longer exists` };
    // OWNER RULING A: a pin names a profile, NEVER a directory (`dir` stays in the answer for display only — ws-create
    // hands the spawn no pinned directory any more); a mediated profile is pinned like any other (P6's skip is gone)
    return { profileId: p ? p.id : '', dir: p ? p.dir : null, origin: p ? pick.origin : 'harness', label: p ? p.label : null };
  }
  /** THE verdict of a create's pin — ONE helper for both roads (the B-f276 remainder, its read r2 S2: a create judged now, and one
   *  the HELD registry owed to its read): the ladder; then the dialog's hint may only DOWNGRADE its own 'chosen' to the rung the value
   *  IS (B-6b6d r3: the New Session dialog sends the group's / the instance default it filled in as an explicit id); then the New
   *  Session form's pick is judged by the groups it sends (lane new-session-form: never added to «Who can use it» at create).
   *  → the pin; `refused` names why none, `formRefused` the form's pick its groups do not admit */
  function pinVerdictForCreate({ facts = {}, hint = null, formGroups = null } = {}) {
    let pin = pinForCreate(facts || {});
    if (pin.held) return pin;
    if (pin.origin === 'chosen' && (hint === 'task-group' || hint === 'instance')) {
      const rungValue = hint === 'task-group' ? (facts && facts.taskGroupDefault) : (facts && facts.instanceRef !== undefined ? instanceDefaultOf(facts.instanceRef) : instanceDefault());
      if (rungValue && pin.profileId === rungValue) pin = { ...pin, origin: hint };
    }
    if (pin.origin === 'chosen' && pin.profileId && Array.isArray(formGroups)) {
      const may = mayAttachAtCreate(pin.profileId, { taskIds: formGroups });
      if (!may.ok) pin = { profileId: '', dir: null, origin: 'harness', refused: may.code, formRefused: pin.profileId };
    }
    return pin;
  }
  // ── the B-f276 remainder, its read r2 (M1r / M3 / S3 / S4): a create the HELD registry could not judge OWES its pin ──
  // keyed by the CONVERSATION's browser key (never a live session's closure: a stop, a resume, the spawn's own awaits outran it),
  // judged right after the read (before the owed boot: an agent command in between found no pin), whatever became of the session:
  // the same verdict as a create's, a fork's copy of its parent's pin, the Task Group's cap stamped. A restart before the read: the
  // conversation's record carries the facts (`browserPinOwed`), owed again then
  const owedPins = new Map();
  const owedHooks = new Set();
  function owePin(browserKey, owed) {
    if (!B.isBrowserKey(browserKey) || !owed || typeof owed !== 'object' || Array.isArray(owed)) return null;
    // its read r3 (S7): a restored conversation owes BEFORE the boot loads the registry (after the migrations' gate) — kept, never a
    // load here; the boot judges what is owed FIRST, before its reconcile (no window where a restored agent finds no pin)
    if (loaded && !heldReg) return judgeOwedPin(browserKey, owed);   // read by now (a conversation restored later, the registry read)
    const had = owedPins.get(browserKey);
    // a resume while still held carries weaker facts (no pick of its own): it never replaces the create's pick
    if (!had || (owed.facts && owed.facts.explicit)) owedPins.set(browserKey, owed);
    return { owed: true, kept: owedPins.get(browserKey) };   // its read r4 (S12): the facts it KEEPS — the record carries those (a resume never records weaker ones)
  }
  function judgeOwedPin(browserKey, owed) {
    owedPins.delete(browserKey);
    const f = (owed && owed.facts && typeof owed.facts === 'object') ? owed.facts : {};
    // its read r3 (M4): a RESTORED record's facts are judged only when its key has no pin — a pin it has was judged before (the read
    // landed while its create was still spawning: the record kept the facts) or made since by the person; re-judging would revert it
    // round wm6qxcqcw (1): kept only when that pin is NEWER than the owe — a resume while held (an explicit pick over the file's older
    // pin) then a restart still held re-judges the owe, never the file's older pin over the person's newer pick
    if (owed && owed.restored && pinFor(browserKey) && Number(pinFor(browserKey).at || 0) >= Number(owed.at || 0)) {
      const kept = { pin: pinFor(browserKey), refused: null, formRefused: null, kept: true, cap: capOf(browserKey) };
      for (const fn of owedHooks) { try { fn(browserKey, kept); } catch (e) { log.warn?.(`[browser] a session's copy of its owed pin was not updated — ${e && e.message}`); } }
      return kept;
    }
    // judged in the SAME turn as the read's load (S3): nothing can pin this key in between (every act refused while held), so the
    // verdict is the create's own — a resume's explicit pick over its conversation's pin included, as the ladder ranks them
    let pin; try { pin = pinVerdictForCreate({ facts: f, hint: owed.hint || null, formGroups: Array.isArray(owed.formGroups) ? owed.formGroups : null }); } catch (e) { pin = { profileId: '', origin: 'harness', refused: String(e && e.message) }; }
    let out = null;
    try {
      if (pin.profileId && pin.origin === 'conversation' && f.fork && f.forkParentKey && f.forkParentKey !== browserKey) out = copyPin(String(f.forkParentKey), browserKey);   // M1r: a fork copies its parent's
      else if (pin.profileId && pin.origin !== 'conversation') out = setPin(browserKey, pin.profileId, { origin: pin.origin, remote: !!owed.remote });
      else if (pin.profileId) out = pinFor(browserKey);   // a resume's own pin (the ladder's conversation rung): kept as it is
    } catch (e) { pin = { ...pin, refused: String(e && e.message) }; }
    // its read r4 (S13): a verdict that finds the registry HELD judged nothing — the facts are owed again (never a «none» told to the
    // session, which would clear its record: the pick lost for good)
    if (pin.held) { owedPins.set(browserKey, owed); return { owed: true, kept: owed }; }
    const res = { pin: out, refused: out ? null : (pin.refused || null), formRefused: pin.formRefused || null };
    try { if (owed && owed.groupFacts && typeof owed.groupFacts === 'object') stampGroupCap(browserKey, owed.groupFacts, owed.cap !== undefined ? { value: owed.cap } : {}); } catch (e) { log.warn?.(`[browser] ${browserKey}: the Task Group's cap after the read was not stamped — ${e && e.message}`); }   // S4
    res.cap = capOf(browserKey);
    log.log?.(`[browser] ${browserKey}: the pin its create owed to the registry's read — ${res.pin ? `${res.pin.profileId} (${res.pin.origin})` : `none${res.refused ? ` (${res.refused})` : ''}`}`);
    for (const fn of owedHooks) { try { fn(browserKey, res); } catch (e) { log.warn?.(`[browser] a session's copy of its owed pin was not updated — ${e && e.message}`); } }
    return res;
  }
  // round wm6qxcqcw (2): an owe whose fork parent is itself owed is judged AFTER that parent (after a restart the owes come in restore
  // order — a fork judged first copied no pin: its parent had none yet)
  function judgeOwedPins() {
    const all = [...owedPins], done = new Set(), order = [];
    const parentOf = (o) => (o && o.facts && o.facts.fork && o.facts.forkParentKey) ? String(o.facts.forkParentKey) : '';
    const visit = (k, depth) => { if (done.has(k) || depth > 64) return; done.add(k); const o = owedPins.get(k); const pk = parentOf(o); if (pk && owedPins.has(pk)) visit(pk, depth + 1); order.push(k); };
    for (const [k] of all) visit(k, 0);
    for (const k of order) { const o = owedPins.get(k); if (o) judgeOwedPin(k, o); }
  }

  // ── the browser: reuse-or-spawn ──
  function idleMs() { return B.idleTimeoutMs(setting('browser.idleTimeoutMs', B.DEFAULT_IDLE_TIMEOUT_MS, 0)); }   // B-50e7: held, nothing known ⇒ 0 — the idle clock stops nothing
  /** lane browser-windows (U4): the machine's ceiling of running browsers is the SETTING `browser.maxRunning` (1–32), read
   *  at every judgement (a change applies to the next start); the keeper's CONCURRENT_CAP (6) is its default. Desktop apps
   *  keep their own ceiling. The resource guard only REPORTS, as before. */
  function machineCap() { return WIN.maxRunningOf(setting('browser.maxRunning', null), Number(limits.CONCURRENT_CAP) || LIMITS.CONCURRENT_CAP); }
  /** B-50e7 (r3443 hold 3): the machine's ceiling is UNREAD — held with nothing known: launches count against the product's default, and no number is the person's */
  const capUnread = () => { const r = readSetting('browser.maxRunning'); return !!(r.held && !r.known); };
  /** r4 LOW 5: the idle timeout an ephemeral's spawn pairs carry (frozen at spawn), else the setting. */
  function pairsIdleMs(pairs) {
    // ONE reading of the pairs' idle (2.369.183: lane P's PURE B.pairsIdleMs — the same fact its launch passes)
    const v = B.pairsIdleMs(pairs);
    return v === null ? idleMs() : B.idleTimeoutMs(v);
  }
  /** The ceiling over EVERY live browser record (named + managed ephemeral)
   *  plus the holders the count seam reports (desktop apps, D2). */
  function ceilingNow({ ephemeral = false, browserKey = null } = {}) {
    return B.ceilingVerdict(Object.values(reg.browsers).map((r) => { const q = profile(r.profileId); return { ...r, label: q?.label, ephemeral: isEph(q), owner: isEph(q) ? q.owner.id : null }; }), reg.leases, { ...limits, CONCURRENT_CAP: machineCap() }, { others: othersNow(), ephemeral, idleMs: idleMs(), browserKey });
  }
  // ── MULTIVIEW D4: the PER-CONVERSATION cap (below the machine ceiling) ──
  const convFacts = (bk) => { if (typeof conversationFacts !== 'function') return {}; try { return conversationFacts(B.parentKeyOf(bk)) || {}; } catch (e) { log.warn?.(`[browser] conversation facts unreadable — ${e && e.message}`); return {}; } };
  // reg.caps[<conversation key>] = { cap: explicit 1..6 | null, group: the Task Group default STAMPED when the
  // conversation started | null, at } — both kept per conversation (a resume carries the same key ⇒ the same facts)
  /** The conversation's EXPLICIT cap (the chip / Session Properties), or null. */
  function capOf(browserKey) { ensureLoaded(); const v = reg.caps[B.parentKeyOf(browserKey)]; return v && Number.isInteger(v.cap) ? v.cap : null; }
  /** The Task Group default this conversation STARTED with (stamped at create / resume), or null. */
  function groupCapOf(browserKey) { ensureLoaded(); const v = reg.caps[B.parentKeyOf(browserKey)]; return v && Number.isInteger(v.group) ? v.group : null; }
  /** The effective cap + its origin (explicit > the stamped Task Group default > instance setting > 3). Nothing is read live off a group. */
  function capFor(browserKey) {
    ensureLoaded();
    const bk = B.parentKeyOf(browserKey);
    return B.conversationCapFor({ explicit: capOf(bk), taskGroup: groupCapOf(bk), setting: setting('browser.defaultPerConversationCap', null) });
  }
  /**
   * lane P verify (finding 5): a conversation STARTS (ws-create: a create, a resume, a fork's new key) ⇒ its
   * Task Group's default cap is stamped ONCE — a conversation that already has its stamp keeps it (a later edit
   * of the group never reaches a running conversation, nor its resume). No group default ⇒ nothing stamped.
   */
  // the follow-owed read's must: asked again at EVERY store change (the lift, and each membership read that lands — a reply «still
  // being read» at the lift waits on), each key re-queued by stampGroupCap while its answer is still unknown; a keeper not loaded
  // yet is not loaded for it (load() seeds the registry's kept waits itself)
  const offCapLift = require('./groups-hold.js').onStoreChange(() => { if (loaded) retryWaitingCaps(); });
  function retryWaitingCaps() { if (!capWaiting.size) return; for (const [k, f] of [...capWaiting]) { capWaiting.delete(k); try { stampGroupCap(k, f); } catch (e) { log.warn?.(`[browser] ${k}: the waiting Task Group cap could not be stamped — ${e && e.message}`); } } }
  function stampGroupCap(browserKey, facts = {}, { value = undefined } = {}) {
    if (!loaded) ensureLoaded();   // its read r1 (N5): the hold is known before it is judged
    if (heldReg) return null;   // the B-f276 remainder: the conversation's own stamp is unread — never re-stamped from the group's live value
    ensureLoaded();
    const bk = B.parentKeyOf(browserKey);
    if (!B.isBrowserKey(bk)) return capFor(bk);
    const v = reg.caps[bk] || null;
    if (v && Number.isInteger(v.group)) return capFor(bk);
    // B-f7ab verify r2: the late key hands in the value its spawn WITNESSED at the start (`value`; null = none was in
    // force) instead of reading the group live — a group edited after the conversation started never reaches it
    let g = null;
    if (value !== undefined) g = B.clampConversationCap(value);
    else if (typeof taskGroupCap === 'function') {
      try { g = B.clampConversationCap(taskGroupCap(facts || {})); }
      catch (e) {
        // the follow-owed unit: Task Groups HELD — the group's cap is unknown NOW: the key WAITS and is stamped at the store's read
        // (groups-hold onStoreChange; the wait is KEPT in the registry across a restart), never the instance default in silence
        if (e && e.code === 'TASK_GROUPS_UNREAD') { capWaiting.set(bk, facts || {}); if (!(v && v.waiting === true)) { reg.caps[bk] = { cap: v && Number.isInteger(v.cap) ? v.cap : null, group: null, at: now(), waiting: true, facts: facts || {} }; commit(); } log.log?.(`[browser] ${bk}: the Task Group's browser cap waits for Task Groups to read`); return capFor(bk); }
        log.warn?.(`[browser] task-group cap unreadable — ${e && e.message}`); g = null;
        if (v && v.waiting === true) { capWaiting.set(bk, facts || {}); return capFor(bk); }   // a waiting key's other read error keeps it waiting (the delta read)
      }
    }
    if (g === null) { if (v && v.waiting === true) { if (Number.isInteger(v.cap)) reg.caps[bk] = { cap: v.cap, group: null, at: now() }; else delete reg.caps[bk]; commit(); } return capFor(bk); }   // read: no group cap — the wait ends
    reg.caps[bk] = { cap: v && Number.isInteger(v.cap) ? v.cap : null, group: g, at: now() };
    commit();
    log.log?.(`[browser] ${bk}: the Task Group's default browser cap ${g} stamped at start`);
    return capFor(bk);
  }
  /** Set (1..6) or clear (null) a conversation's explicit cap — a USER act; the digest broadcast carries it to every window. Clearing goes back to the default it STARTED with. */
  function setCap(browserKey, cap) {
    refuseIfHeld('the browser cap');   // the B-f276 remainder: refused by name while the registry is held (nothing minted, nothing written)
    ensureLoaded();
    const bk = B.parentKeyOf(browserKey);
    if (!B.isBrowserKey(bk)) throw namedError('bad-request', 'a cap needs a conversation\'s browser key');
    const c = cap === null || cap === undefined || cap === '' ? null : B.clampConversationCap(cap);
    if (cap !== null && cap !== undefined && cap !== '' && c === null) throw namedError('bad-request', `a per-conversation cap is ${B.CONVERSATION_CAP_MIN}..${B.CONVERSATION_CAP_MAX}`);
    const group = groupCapOf(bk);
    const w = reg.caps[bk] && reg.caps[bk].waiting === true ? { waiting: true, facts: reg.caps[bk].facts || {} } : {};   // a person's cap never ends a group cap's wait
    if (c === null && group === null && !w.waiting) delete reg.caps[bk]; else reg.caps[bk] = { cap: c, group, at: now(), ...w };
    commitSync();
    return { ...capFor(bk), own: ownLive(bk), explicit: c };
  }
  /** Is this live browser record THIS conversation's (its ephemeral, a helper's, or a profile it or a helper leases)?
   *  Owner ruling A: a SHARED profile's browser is one of EACH holding conversation's — the PURE rule, one reading. */
  function ownsLive(bk, profileId) { return B.ownsLiveBrowser({ profile: profile(profileId), leases: reg.leases, browserKey: bk }); }
  /** How many LIVE browsers this conversation holds now (the chip's numerator; helpers count) — B.conversationOwnCount. */
  function ownLive(browserKey) { ensureLoaded(); return B.conversationOwnCount({ browsers: reg.browsers, profiles: reg.profiles, leases: reg.leases, browserKey }); }
  /** The conversation cap's refusal for ONE more browser of `browserKey`, or null. */
  function conversationCapNow(browserKey) {
    const bk = B.parentKeyOf(browserKey);
    if (!B.isBrowserKey(bk)) return null;
    const v = B.conversationCapVerdict({ own: ownLive(bk), cap: capFor(bk).cap });
    if (v) log.log?.(`[browser] ${bk}: refused browser_cap (this conversation's cap ${v.cap}, ${v.own} running)`);
    return v;
  }
  /** An ephemeral daemon whose pid is gone: recorded `stopped` — not an error; the next verb starts it again. B-346d law 2:
   *  it idled out (the CLI's own timeout) ONLY when it was quiet that long. `endedEarly` = its daemon was found gone BEFORE its
   *  idle timeout, `withinMs` a BOUND (found gone within it of a command it served — never when it ended) — CERTAIN: the daemon served nothing later than max(the verb before the newest, its own start) (the newest verb
   *  may be the very one asking now, stamped before this judge — takeover C3), so its own quiet is no longer than that. Why it
   *  ended (a crash, a kill) is not known here: the words say so. stoppedBy stays 'idle': every behaviour keyed on it (the
   *  next verb starts it again, its kept tabs reopen) is the idle-out's. */
  /** B-346d law 1 (the coordinator's r803): HOW a stopped browser ended, from its own record — for the person's words on its view.
   *  `by` = the record's stoppedBy ('idle' = its daemon gone on its own / idled out; else the act that stopped it), `early` = found
   *  gone BEFORE its idle timeout (a BOUND, law 2's), `idleMs` = the idle it was launched with. null when the record says nothing. */
  function endedFactsOf(rec) {
    if (!rec || rec.state !== 'stopped') return null;
    const idle = Number.isInteger(rec.idleMs) ? rec.idleMs : null;
    const early = rec.endedEarly && Number.isFinite(Number(rec.endedEarly.withinMs)) ? { withinMs: Number(rec.endedEarly.withinMs), idleMs: Number(rec.endedEarly.idleMs) || idle } : null;
    return { by: rec.stoppedBy ? String(rec.stoppedBy).slice(0, 40) : null, idleMs: idle, early, at: Number(rec.endedAt) || null };
  }
  // ── B-346d's RECORDER (the coordinator's r1228): THE ONE JOURNAL RECORD AT «DAEMON GONE» — names and numbers only ──
  // (d) the hub unit's OOM kill counter: its cgroup's memory.events `oom_kill`, read ASYNC (never a sync read on the loop); the
  // path is read off /proc/self/cgroup once (an injected stand-in in the fast gate). r1311: THE RECORDER NEVER GATES THE TICK —
  // the read is its OWN flight (one at a time; a flight still out is not started again: a held file threadpool holds one read,
  // never the tick); `oomSeen` = the last value that came back, with its time.
  let oomPathP = null, oomSeen = null, oomFlight = null;
  const oomPath = () => oomPathP || (oomPathP = oomEventsPath ? Promise.resolve(oomEventsPath) : fs.promises.readFile('/proc/self/cgroup', 'utf8').then((t) => GR.memoryEventsPathFrom(t), () => null));
  const readOomKills = () => oomPath().then((p) => (p ? fs.promises.readFile(p, 'utf8').then((t) => GR.oomKillsFrom(t), () => null) : null), () => null);
  function refreshOom() {
    if (oomFlight) return;
    oomFlight = readOomKills().then((n) => { if (n != null) oomSeen = { n, at: now() }; }, () => { /* not read: said in the line */ }).then(() => { oomFlight = null; });
  }
  // (a) a tick saw this run's daemon alive: the record's lower bound, and (d) the first counter value read during its run — in
  // memory, one row a profile, keyed by the run's start (a run started again begins a new row: one run's facts are never the next
  // one's); r1311 (3): a run is FORGOTTEN when its record is no longer live (its stop, its idle end, its removal) at the next tick
  const aliveRuns = new Map(); // profileId → { run: startedAt, at: the last tick alive, oom: { n, at } | null }
  function aliveSeen(rec, at) {
    const run = Number(rec.startedAt) || 0, cur = aliveRuns.get(rec.profileId);
    if (cur && cur.run === run) { cur.at = at; if (!cur.oom && oomSeen) cur.oom = { ...oomSeen }; return; }
    aliveRuns.set(rec.profileId, { run, at, oom: oomSeen ? { ...oomSeen } : null });
  }
  function forgetEndedRuns() { for (const pid of [...aliveRuns.keys()]) { const r0 = reg.browsers[pid]; if (!r0 || !B.isLiveBrowser(r0)) aliveRuns.delete(pid); } }
  /** The facts of ONE gone daemon, read BEFORE the hub ends its Chrome — (a) the bound on both sides, (b) its Chrome said in every
   *  case, (c) the hub's own signals to either pid during the run (the ledger, read from the run's start: a reused pid's rows are
   *  not this run's; a row whose process start is not this run's process is said as another process), (d) the first counter value
   *  read during the run and the last one read. r1311 (2): the line is written WHEN ITS FACTS ARE READ — before the reap's own line,
   *  never after it (the reap's own signal to its Chrome is not one of the run's). Its callers fence it (r1311 (1)). */
  function goneRecord(rec, seenBy) {
    const at = now(), since = Number(rec.startedAt) || 0;
    const b = rec.browser && Number.isInteger(rec.browser.pid) ? rec.browser : null;
    const chrome = !b ? { state: 'none' } : !F.pidAlive(b.pid) ? { state: 'gone', pid: b.pid } : F.sameProcess(b.pid, b.starttime) ? { state: 'alive', pid: b.pid } : { state: 'other', pid: b.pid };
    const other = (x, start) => x.start != null && start != null && String(x.start) !== String(start);
    const signals = [...SL.signalsTo(rec.pid, { since }).map((x) => ({ ...x, of: 'daemon', other: other(x, rec.starttime) })), ...(b ? SL.signalsTo(b.pid, { since }).map((x) => ({ ...x, of: 'chrome', other: other(x, b.starttime) })) : [])].sort((x, y) => x.at - y.at);
    const seen = aliveRuns.get(rec.profileId); aliveRuns.delete(rec.profileId);
    const mine = seen && seen.run === since ? seen : null;
    const facts = { profileId: rec.profileId, ns: rec.ns || null, pid: rec.pid, startedAt: rec.startedAt || null, seenAliveAt: mine ? mine.at : null, foundGoneAt: at, seenBy, chrome, signals,
      ledgerSince: SL.HELD_SINCE, ledgerMax: SL.LEDGER_MAX, oomStart: mine && mine.oom ? { ...mine.oom } : null, oomEnd: oomSeen ? { ...oomSeen } : null };
    log.log?.(GR.goneRecordLine(facts));
    return facts;
  }
  function markEphemeralGone(rec, seenBy = 'the tick') {
    const idleFor = Number.isInteger(rec.idleMs) ? rec.idleMs : pairsIdleMs(pairsOf(rec.profileId));
    const pe = profile(rec.profileId);
    const served = Math.max(Number(pe && pe.verbBeforeAt) || 0, Number(rec.startedAt) || 0);
    const quietMs = served > 0 ? Math.max(0, now() - served) : null;
    const early = quietMs != null && Number(idleFor) > 0 && quietMs < Number(idleFor);
    rec.state = 'stopped'; rec.endedAt = now(); rec.stoppedBy = 'idle'; rec.lastError = null;
    rec.endedEarly = early ? { withinMs: quietMs, idleMs: Number(idleFor) } : null; // withinMs: a BOUND — found gone within it of a command it served, never when it ended
    dropEgress(rec.profileId); delete rec.egress; // lane engine-spi-egress r2: its proxy's port is free again
    rec.note = early ? `the browser was found gone within ${Math.round(quietMs / 1000)} s of a command it served, before its idle timeout of ${Math.round(Number(idleFor) / 60000)} min — why is not known here; the next command starts it again`
      : `the browser idled out (${Math.round(Number(idleFor) / 60000)} min without a command) — the next command starts it again`;
    guard.delete(rec.profileId); live.delete(rec.profileId);
    dirty = true;
    log.log?.(`[browser] ephemeral ${rec.profileId} (${rec.ns}) daemon gone (pid ${rec.pid}${livenessOf(rec) === 'recycled' ? ', now another process' : ''}, seen by ${seenBy}) — recorded stopped (${early ? `found gone within ${Math.round(quietMs / 1000)} s of a command it served, before its idle timeout of ${Math.round(Number(idleFor) / 60000)} min — why is not known here` : 'idle'}), the next verb restarts it`);
    emitLease({ kind: 'browser-stopped', profileId: rec.profileId, why: 'idle', local: true, ...ephEventFields(rec.profileId) }); // lane H: its holder row leaves the digest
    keptNote('stop', profile(rec.profileId), { why: early ? 'ended' : 'idle' }); // lane browser-resume: its logins + its last tabs are kept (the daemon is gone: the relay's list); B-346d: 'ended' reopens as 'idle' does
    try { goneRecord(rec, seenBy); } catch (e) { try { log.warn?.(`[browser] ${rec.profileId}: its gone record could not be written (${e && e.message}) — the stop and the reap go on`); } catch { /* the journal's own failure */ } } // B-346d's recorder, FENCED (r1311 (1)): its facts read BEFORE the hub ends its Chrome
    reapOrphan(rec, seenBy); // verify r2 M1: the Chrome its dead daemon left behind is ended (tracked; a start waits on it)
  }
  /** VERIFY r2 M1: a NAMED profile's local record whose daemon is gone (dead, or its pid recycled) — recorded stopped,
   *  and the browser that daemon launched is ended (it would hold the profile's SingletonLock: the relaunch's exit 21). */
  function markDaemonGone(rec, seenBy) {
    const v = livenessOf(rec);
    endFolderNotice(rec.profileId, 'browser-ended');   // B-0645 cure: a browser that died took the lent folder with it
    rec.state = 'stopped'; rec.endedAt = now();
    rec.lastError = v === 'recycled' ? `the browser daemon exited (pid ${rec.pid} is another process now)` : 'the browser daemon exited';
    if (rec.launch === 'attach') { rec.lastError = v === 'recycled' ? `the browser exited (pid ${rec.pid} is another process now)` : 'the browser exited (its window was closed, or it crashed)'; if (userStoppedRec(rec)) { rec.lastError = null; rec.stoppedBy = 'user'; rec.note = USER_STOPPED_NOTE; } endDisplay(rec, 'its browser exited'); tabsWentWithBrowser(rec, seenBy); } // lane one-browser-b1: Chrome IS the record's process — the user's own browsing went with it (the driver heal's rule)
    guard.delete(rec.profileId); live.delete(rec.profileId);
    dirty = true;
    log.log?.(`[browser] ${rec.profileId} daemon gone (pid ${rec.pid}${v === 'recycled' ? ', now another process' : ''}, seen by ${seenBy}) — recorded stopped`);
    tabsLost(rec.profileId, `its daemon gone (seen by ${seenBy})`); // lane profile-lock-roll (L2): every lease's tab went with it
    try { goneRecord(rec, seenBy); } catch (e) { try { log.warn?.(`[browser] ${rec.profileId}: its gone record could not be written (${e && e.message}) — the stop and the reap go on`); } catch { /* the journal's own failure */ } } // B-346d's recorder, FENCED (r1311 (1)): its facts read BEFORE the hub ends its Chrome
    return reapOrphan(rec, seenBy);
  }
  // ── LANE PROFILE-LOCK-ROLL (2026-10-01) ──
  // L1: THE LOCK VERDICT KNOWS A RENAMED MACHINE. userW's pod rolled (a new hostname, the same RWO home); his pinned
  // profile's SingletonLock named the dead pod and every start answered `profile_locked … names another machine … remove
  // SingletonLock` until his agent removed it by hand. The witness is the keeper's OWN registry: every launch stamps the
  // record with this machine's hostname (`host`, the lineage `hosts`); a lock naming a hostname this keeper itself launched on
  // is `stale-previous-host` — the Singleton symlinks are removed, the launch goes on, the profile says "renamed from <old>"
  // for a day. A legacy record (no stamp) inherits the hostname the registry FILE was last saved under (`fileHost`), else
  // nothing — a foreign hostname this keeper never launched on stays refused by name (a volume really shared with another
  // machine is never guessed).
  /** The hostnames this keeper's registry recorded at its launches of a record (the legacy witness: the file's writer). */
  //  verify r4 (S26b): …read in THIS order — the record's own lineage, then the DIRECTORY's (`reg.dirHosts`: the lineage that
  //  outlives a retired ephemeral record — a rolled pod's boot retires every one, and its kept directory keeps the old pod's
  //  lock), then the file's writer. Reproduced: one restart after the roll the conversation's own directory was refused as foreign.
  //  verify r5 (S42): a directory's lineage is keyed by its IDENTITY — the real path (the fleet's home is reached through a symlink,
  //  /home/vibe → /home/<name>, and the spelling flips once at the personalization; reproduced: remembered under one spelling, read
  //  under the other = refused as foreign); unresolvable ⇒ the spelling as given. (S32a) the inode is the witness that it is STILL that
  //  directory — a fresh one made at a forgotten one's path answers none. (S34) what the bound evicts is SAID.
  const dirKeyOf = (dir) => { const d = typeof dir === 'string' ? dir.replace(/\/+$/, '') : ''; if (!d) return ''; const id = F.dirIdentity(d); return id ? id.replace(/\/+$/, '') || id : d; };
  const dirInoOf = (dir) => { try { const i = fs.statSync(dir).ino; return Number.isInteger(i) && i > 0 ? i : null; } catch { return null; } };
  // verify r6 (S43 / S44 / S48 / S54): THE DIRECTORY'S OWN MARKER is the witness — `<dir>/.vibespace-lineage`, a token written ONCE at
  // the first remember (never rewritten; unwritable ⇒ none, the r5 inode rule stands for that entry). Reproduced on the real keeper:
  // ext4 hands a removed directory's inode to the next mkdir (20/20 on the fleet's RBD ext4), so the inode alone took a stranger's
  // old-pod lock over at a forgotten path; a file-level restore (every inode new) orphaned every kept directory's lineage — the
  // disaster-recovery path refused each as foreign; a tree under two mounts (bindfs) was two identities. A marker survives a restore
  // or a copy and is absent in a fresh directory; a stranger's carries another token; a path miss is found by the token.
  const dirTokOf = (dir) => { try { const s = fs.readFileSync(path.join(dir, B.LINEAGE_MARKER), 'utf8').trim(); return B.isLineageToken(s) ? s : null; } catch { return null; } };
  // verify r7 (T1 / T2 ①): ONE TOKEN, ONE DIRECTORY. The token's BEARER — the directory at an entry's own path, asked now (gone ⇒
  // null; else its marker + inode) — is what tells a restore from a copy (PURE lineageVerdict): a copy beside its original is refused
  // the lineage, SAID, and minted its OWN marker at its first remember (`fresh`), so no remember ever deletes the original's entry
  // (reproduced: r6's "one directory, one entry" let an agent's cp -a steal the original's lineage; the original was refused as
  // foreign once the copy was deleted). T2 ②: a deleted marker is re-minted at the next remember and the entry's hosts are KEPT
  // (united); the refusal in between is said with its cause. T2 ⑤: every prune / re-key / eviction / refusal lands in the per-boot
  // LEDGER (data/browser-lineage-journal.ndjson, a 1 MiB ring — the journal says once per kind, the ledger names every path).
  const dirBearerOf = (key) => { try { fs.lstatSync(key); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return null; } return { tok: dirTokOf(key), ino: dirInoOf(key) }; };
  const mintDirTok = (dir, { fresh = false } = {}) => { const have = fresh ? null : dirTokOf(dir); if (have) return have; const tok = crypto.randomBytes(12).toString('hex'); try { fs.writeFileSync(path.join(dir, B.LINEAGE_MARKER), tok + '\n', { mode: 0o600 }); return tok; } catch { return null; } };
  const LINEAGE_LEDGER = 'browser-lineage-journal.ndjson'; const LEDGER_MAX = 1 << 20; const bootId = `${now().toString(36)}-${process.pid}`;
  /** The per-boot ledger of what happened to a directory's lineage (one JSON line each, `boot` = this process): a ring of LEDGER_MAX
   *  bytes — past it the older half goes (whole lines). Never throws, never awaited. */
  let ledgerTailChecked = false; // verify r8 (T2 ⑤): a tail torn by a crash mid-append is terminated once per boot, before this boot's first line
  function lineageLedger(kind, fields = {}) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const f = path.join(dataDir, LINEAGE_LEDGER);
      if (!ledgerTailChecked) {
        ledgerTailChecked = true;
        let torn = false; try { const size = fs.statSync(f).size; if (size > 0) { const fd = fs.openSync(f, 'r'); try { const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, size - 1); torn = b[0] !== 0x0a; } finally { fs.closeSync(fd); } } } catch { torn = false; }
        if (torn) fs.appendFileSync(f, '\n' + JSON.stringify({ at: now(), boot: bootId, host: os.hostname(), kind: 'torn-tail-terminated' }) + '\n', { mode: 0o600 });
      }
      fs.appendFileSync(f, JSON.stringify({ at: now(), boot: bootId, host: os.hostname(), kind, ...fields }) + '\n', { mode: 0o600 });
      let size = 0; try { size = fs.statSync(f).size; } catch { size = 0; }
      if (size > LEDGER_MAX) { const txt = fs.readFileSync(f, 'utf8'); const cut = txt.indexOf('\n', txt.length - (LEDGER_MAX >> 1)); const tail = cut >= 0 ? txt.slice(cut + 1) : ''; const tmp = f + '.tmp'; fs.writeFileSync(tmp, tail, { mode: 0o600 }); fs.renameSync(tmp, f); }
    } catch { /* a ledger that cannot be written never fails the launch; the journal line stands */ }
  }
  const saidLineage = new Set(); // (why|key) said once per boot in the journal; the ledger has every ask
  /** THE lineage read of a directory: the PURE verdict over the registry with this keeper's fs facts; a refusal is said once per
   *  boot per (cause, directory) in the journal and every time in the ledger; a find by token is in the ledger. */
  const lineageOf = (dir) => {
    const key = dirKeyOf(dir);
    const v = B.lineageVerdict(reg.dirHosts, key, { ino: dirInoOf(dir), tok: dirTokOf(dir), bearer: dirBearerOf });
    if (v.via === 'none' && ['copy', 'marker-absent', 'marker-stranger', 'bearer-unknown', 'inode'].includes(v.why)) {
      const sk = v.why + '|' + key;
      lineageLedger('lineage-refused', { dir: key, why: v.why, original: v.key || null });
      if (!saidLineage.has(sk)) {
        saidLineage.add(sk);
        const sentence = v.why === 'copy' ? `${key} is a copy of ${v.key} (the same marker, another inode; the original is still there) — not its lineage; the copy gets its own marker at its first launch`
          : v.why === 'marker-absent' ? `${key} carries no marker (${B.LINEAGE_MARKER} deleted?) while its entry remembers one — its lineage is not answered (a fresh directory at a forgotten path looks the same); re-minted at its next launch under this name`
            : v.why === 'marker-stranger' ? `${key} carries a marker that is not its entry's and matches no other — a stranger's directory at a remembered path; its lineage is not answered`
              : v.why === 'inode' ? `${key} is not the directory remembered (an r5-era entry, another inode) — its lineage is not answered`
                : `${key} presents a token whose bearer could not be judged — its lineage is not answered`;
        log.warn?.(`[browser] the launch-host lineage of ${sentence}`);
      }
    } else if (v.via === 'token') lineageLedger('lineage-by-token', { dir: key, why: v.why, from: v.key });
    return v;
  };
  const launchHostsFor = (prev, dir = null) => { const own = B.launchHostsOf(prev); if (own.length) return own; const byDir = dir ? lineageOf(dir).hosts : []; if (byDir.length) return byDir; return B.launchHostsOf(null, fileHost); };
  // verify r8 (T2 ③): a RETIRE never mints — a never-launched record's removal (an adopted backup refused as a copy) rewrote the copy's
  // marker with a fresh one, and the backup then restored as a stranger (plv8-t1 S72 / S72b); a retire's remember on a copy is skipped
  // and said; a remember on a directory that is GONE (a Forget's rename ran first) writes nothing — the move itself re-keys the entry.
  function rememberDir(dir, hosts, { retire = false } = {}) {
    if (!dir) return;
    let gone = false; try { fs.lstatSync(dir); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) gone = true; }
    if (gone) { lineageLedger('remember-skipped-gone', { dir: dirKeyOf(dir), retire }); return; }
    const key = dirKeyOf(dir); const v = lineageOf(dir); const before = reg.dirHosts;
    if (retire && v.fresh) { lineageLedger('retire-skipped-copy', { dir: key, original: v.key || null }); return; }
    let hs = Array.isArray(hosts) ? hosts : [];
    // T2 ②: a re-mint at the directory's own path keeps what the entry remembered (the marker was deleted, not the directory)
    if (v.why === 'marker-absent' && before[key] && Array.isArray(before[key].hosts)) hs = [...before[key].hosts, ...hs].filter((x, i, a) => x && a.indexOf(x) === i);
    const tok = mintDirTok(dir, { fresh: !!v.fresh });
    if (v.fresh && tok) lineageLedger('fresh-marker', { dir: key, original: v.key || null, tok });
    reg.dirHosts = B.rememberDirHosts(before, key, hs, now(), B.DIR_HOSTS_MAX, { ino: dirInoOf(dir), tok });
    const ev = B.dirHostsEvicted(before, reg.dirHosts);
    const replaced = ev.filter((k) => tok && before[k] && before[k].tok === tok); // the same token under an older spelling: re-keyed, never "the bound"
    const bound = ev.filter((k) => !replaced.includes(k));
    for (const k of replaced) lineageLedger('rekeyed-by-token', { from: k, to: key });
    if (replaced.length) log.log?.(`[browser] the launch-host lineage of ${replaced.length === 1 ? replaced[0] : replaced.length + ' directories'} is remembered under its new spelling ${key}`);
    for (const k of bound) lineageLedger('evicted-at-bound', { dir: k, bound: B.DIR_HOSTS_MAX });
    if (bound.length) log.warn?.(`[browser] the launch-host lineage of ${bound.length} director${bound.length === 1 ? 'y' : 'ies'} forgotten at the ${B.DIR_HOSTS_MAX} bound (the oldest remembered): ${bound.slice(0, 3).join(', ')}${bound.length > 3 ? ', …' : ''}`);
  }
  /** Stamp the record with THIS launch's hostname (+ the lineage the previous record carried); the DIRECTORY remembers it too. */
  function stampLaunchHost(rec, prev, dir = null) { Object.assign(rec, B.withLaunchHost({ hosts: launchHostsFor(prev, dir) }, os.hostname())); if (dir) rememberDir(dir, rec.hosts); }
  /** verify r8 (T2 ②): THE PRODUCT'S OWN MOVE OF A DIRECTORY CARRIES ITS LINEAGE. A Forget renames `<dir>` → `<dir>.forgotten-<ts>`
   *  and the next boot pruned the entry at the old path (gone = ENOENT), so a forgotten directory adopted back after a restart had no
   *  lineage and its old-pod lock was foreign by name (plv8-t1 S75b). The key is asked BEFORE the rename (`lineageKeyOf`, the
   *  directory's identity while it exists) and moved after it (`moveDirLineage`), said in the ledger; a stranger's `mv` is not ours. */
  const lineageKeyOf = (dir, { retireOf = null } = {}) => {
    if (!dir) return '';
    // the retire-time remember runs HERE, while the directory still exists (a Forget renames before it removes the record): the
    // record's own lineage — a legacy witness the load stamped on it, never launched since — reaches the entry that will move
    const rr = retireOf && reg.browsers[retireOf]; if (rr && rr.state !== 'failed') rememberDir(dir, launchHostsFor(rr, dir), { retire: true });
    return dirKeyOf(dir);
  };
  /** verify r9 (T1 ④, S76 / S76b): THE ENTRY IS ON DISK BEFORE THE DIRECTORY MOVES. r8 re-keyed in memory AFTER the rename and left
   *  the write to the next commit — the orphan Forget never committed at all, so a crash (an OOM kill, a pod roll) before the next
   *  unrelated save, or a data/ that could not be written at that moment (EACCES / EIO), left the directory at `<dir>.forgotten-<ts>`
   *  with the disk still naming the old path ⇒ the next boot pruned it (gone = ENOENT) ⇒ the directory adopted back was foreign by
   *  name (F5 again by a different path; reproduced with the real keeper + browser-trace). The move is now re-keyed AND SAVED here,
   *  the caller renames only on `ok` (a refused write = a refused Forget, nothing moved, the cause named); a rename that then fails
   *  is rolled back with the same call (`moveDirLineage(key, dir)`). The window left is the rename syscall itself: an entry naming a
   *  path that does not exist yet is pruned at the next boot like any gone path — said, never guessed.
   *  → `{ok, moved, key, error}`: `moved` = an entry was re-keyed (none for a directory without lineage), `key` = the new key. */
  function moveDirLineage(fromKey, to) {
    const f = typeof fromKey === 'string' ? fromKey.replace(/\/+$/, '') : ''; if (!f || !to || !reg.dirHosts || !reg.dirHosts[f]) return { ok: true, moved: false, key: null, error: null };
    const t = dirKeyOf(to); if (!t || t === f) return { ok: true, moved: false, key: null, error: null };
    const before = reg.dirHosts;
    reg.dirHosts = B.rekeyDirHosts(reg.dirHosts, f, t); dirty = true;
    landDeferred = false; if (!saveNow()) { reg.dirHosts = before; dirty = true; lineageLedger('rekey-refused', { from: f, to: t }); log.warn?.(`[browser] the launch-host lineage of ${f} could not be written under ${t} (${landDeferred ? 'the hub is stopping — the exit\'s flush writes the registry' : STORE_FILE + ' unwritable'}) — the directory is NOT moved`); return { ok: false, moved: false, key: null, error: landDeferred ? 'the hub is stopping' : `${STORE_FILE} could not be written` }; }
    lineageLedger('rekeyed-by-move', { from: f, to: t });
    log.log?.(`[browser] the launch-host lineage of ${f} follows its directory to ${t} (written before the move)`);
    return { ok: true, moved: true, key: t, error: null };
  }
  /** The takeover: the stale previous-host lock's Singleton symlinks removed (browser-facts, symlinks only), said in the
   *  journal, the profile stamped `renamedFrom` (the panel shows it for a day). */
  function takeOverStaleLock(p, dir, v) {
    const removed = F.removeSingletonFiles(dir);
    // verify r1 (F5): the POST-CHECK — a lock still there after the removal (a read-only volume, a directory of another uid:
    // reproduced with EACCES, the journal said "taken over (nothing left to remove)" and the launch went into the locked
    // directory) is REFUSED BY NAME with the errno and the one command; never a launch that dies on it (exit 21)
    const left = F.singletonLeft(dir);
    if (left.includes('SingletonLock')) {
      const f = (removed.failed || []).find((x) => x.name === 'SingletonLock');
      const refusal = B.profileLockedRefusal({ label: p ? p.label : '', dir, verdict: { ...v, kind: 'stale-unremovable', removeError: f ? f.code : 'still present after the unlink' } });
      log.warn?.(`[browser] ${p ? p.id : '?'}${p && p.label ? ' "' + p.label + '"' : ''}: the lock named this machine's previous name ${v.host} but could NOT be removed (${f ? f.code : 'still present after the unlink'}) — NOT launched: ${refusal.error}`);
      return { ok: false, removed, refusal };
    }
    if (p) p.renamedFrom = { host: v.host, at: now() };
    log.warn?.(`[browser] ${p ? p.id : '?'}${p && p.label ? ' "' + p.label + '"' : ''}: the lock named this machine's previous name ${v.host} — taken over (${removed.length ? removed.join(', ') + ' removed' : 'nothing left to remove'} from ${dir}; this machine is ${os.hostname()})`);
    return { ok: true, removed };
  }
  // L2: A BOUND TAB OF A PREVIOUS LIFE REBINDS. The binary keeps each session's bound tab (by CDP target id) across a daemon
  // restart and, pinned, answers `tab_gone` once it is gone (0.38.1's own `tab --help`); every tab of a replaced browser is
  // gone. `stop()` already marks every lease (`tabClosed`) so its next attach binds a tab first — a browser life the keeper
  // did NOT end (a daemon found dead: a pod roll, a crash; a boot that could not adopt it; an in-place relaunch) left the
  // leases unmarked and the first pinned command answered `tab_gone` (userW, W2). The mark is written here for those too,
  // with WHY (`tabLostWhy`: `life` | `closed`) so the agent's note says which.
  function markTabLost(profileId, browserKey, why) {
    const k = `${profileId}|${browserKey}`;
    reg.tabClosed[k] = now();
    if (!reg.tabLostWhy || typeof reg.tabLostWhy !== 'object') reg.tabLostWhy = {};
    reg.tabLostWhy[k] = why === 'closed' || why === 'place' ? why : 'life';   // B-9584 (B): 'place' — the hold closed it, said by name
  }
  function clearTabLost(profileId, browserKey) {
    const k = `${profileId}|${browserKey}`;
    delete reg.tabClosed[k];
    if (reg.tabLostWhy) delete reg.tabLostWhy[k];
  }
  // verify r3 (F4): the rebound note rides the LEASE until an answer carries it — the answer that bound may never be read
  // (the agent harness's own tool timeout fired while this session's rebind queued behind another's; reproduced: the tab
  // bound, the mark spent, the next command's answer carried no note — the agent never told its tab was replaced). The
  // attach that binds takes it at its own return (the normal case: said once, as before); an abandoned one leaves it for
  // the next. Persisted with the lease (a restart in between still tells); never in a lease VIEW.
  function keepRebound(profileId, browserKey, rebound) { const l = B.findLease(reg.leases, profileId, browserKey); if (l && rebound) l.rebound = rebound; }
  function takeRebound(profileId, browserKey, rebound) { const l = B.findLease(reg.leases, profileId, browserKey); const note = rebound || (l && l.rebound) || null; if (l && l.rebound) { delete l.rebound; commit(); } return note; }
  // verify r1 (F3): the rebind is SERIALIZED per profile — two sessions' first commands after a replaced browser (two agents
  // resumed together) read the same page list concurrently, both picked the browser's one page and both bound it: ONE tab
  // for two conversations (one's `open` navigated the other's page). Reproduced on the real keeper; now the second waits
  // for the first and reads the page list AFTER it — the page is rooted by then, so the second opens its own tab.
  const rebinding = new Map(); // profileId → the rebind in flight
  function serialRebind(profileId, fn) {
    if (rebinding.has(profileId)) log.log?.(`[browser] ${profileId}: a tab bind waits for the one in flight (bounded by the browser CLI's own timeouts, ~30 s at most)`); // verify r2 (F3): the wait is said
    const prev = rebinding.get(profileId) || Promise.resolve();
    const run = prev.then(fn, fn);
    rebinding.set(profileId, run);
    return run.finally(() => { if (rebinding.get(profileId) === run) rebinding.delete(profileId); });
  }
  /** Every lease of a NAMED profile whose browser was replaced without a stop: marked `life` (its next attach rebinds). */
  function tabsLost(profileId, how) {
    const p = profile(profileId);
    if (!p || isEph(p)) return 0;
    let n = 0;
    for (const l of reg.leases) if (l.profileId === profileId) { markTabLost(profileId, l.browserKey, 'life'); n++; }
    if (n) { dirty = true; log.log?.(`[browser] ${profileId} "${p.label}": its browser is gone with ${how} — ${n} lease(s) bind a tab again at their next command`); }
    return n;
  }
  // ── VERIFY r2 M1 (2026-09-25): A KEEPER THAT STARTS A BROWSER IS THE ONE THAT ENDS IT ──
  // Measured on the real 0.38.1: `kill -9` of a daemon (a crash, an OOM — and stop()'s own SIGKILL after its close
  // grace) leaves its Chrome ALIVE, reparented, holding `<dir>/SingletonLock` and DevToolsActivePort; the relaunch on
  // that directory died "Chrome exited early (exit code: 21)" (the owner's "bank never starts" from a second path) and
  // an ephemeral's orphan just leaked (19 on the dev box, ≈3 GB). The browser a launch started is RECORDED (`rec.browser`
  // = the daemon's child: pid + starttime + its user-data-dir, browser-facts.browserOfDaemon); a gone daemon's browser is
  // ended while it is STILL that process naming that directory; and before EVERY launch on a directory the lock's holder
  // is judged (browser-profiles.profileLockVerdict): the keeper's own orphan is ended, anything it cannot prove its own is
  // refused `profile_locked` by name — never signalled, never the raw exit code.
  const reaping = new Map(); // profileId → the in-flight end of an orphaned browser (a launch on it waits)
  /** 'ours' | 'gone' | 'recycled' (alive, ANOTHER starttime) | 'unrecorded' (verify r3 LOW 3: its starttime readable, the
   *  record has none — unprovable) | 'unknown' (no starttime readable at all, no /proc — never guessed). */
  function livenessOf(rec) {
    if (!rec || !Number.isInteger(rec.pid) || rec.pid <= 0) return 'gone';
    const alive = F.pidAlive(rec.pid);
    const readable = alive && F.procStart(rec.pid) != null;
    return B.pidLiveness({ alive, sameStart: alive && F.sameProcess(rec.pid, rec.starttime), startKnown: rec.starttime != null && readable, startReadable: readable });
  }
  /** VERIFY r2 L4 + r3 LOW 3: a LOCAL record's daemon is gone when it is dead, its pid is another process now, or the record
   *  carries no starttime on a machine that reads them (the tick, judgeEphemeral, a view's port and a start decide by
   *  this); `stop()` still signals only a pid proven `ours`. */
  const daemonGone = (rec) => ['gone', 'recycled', 'unrecorded'].includes(livenessOf(rec));
  /** keeper-sweep-yields: for a RETIRE, «gone» is a fact the keeper has SEEN — a RECORDED pid that is not there, or is another
   *  process now by its start time. A record with no pid or with no recorded start time cannot be told: its daemon may run, so the
   *  retire closes it by the CLI as before — the absence of a fact is never read as «gone» (the tick's wider daemonGone would skip
   *  the close and leave a live daemon and its browser running, nobody ending them). After a restart the recorded pids are simply
   *  not there — seen gone — so the fast road keeps its zero program starts. */
  const daemonSeenGone = (rec) => !!rec && Number.isInteger(rec.pid) && rec.pid > 0 && ['gone', 'recycled'].includes(livenessOf(rec));
  /** r5 MAJOR 1 (iii): did THIS launch bring a browser up on `dir`? (its DevToolsActivePort / SingletonLock written anew
   *  since `stamp0`, on a machine that reads process facts) — the evidence that makes "no browser identified" a closure. */
  const launchEvidenced = (dir, stamp0) => !!dir && F.startsReadable() && F.launchStampMoved(stamp0, F.dirLaunchStamp(dir));
  /** Record the browser this record's daemon launched (after a launch, while the daemon is ours). */
  function captureBrowser(rec, dir = null) {
    if (!rec || !isLocalRec(rec) || !Number.isInteger(rec.pid)) return null;
    // r4 LOW 4: the directory's LOCK names the browser itself — preferred over an argv match (a wrapper between the daemon
    // and Chrome that does not exec carries the same flags) while its holder descends from THIS daemon (≤ 2 levels)
    let b = lockHeldUnder(rec, dir);
    if (!b) { try { b = F.browserOfDaemon(rec.pid, { dir: dir || null }); } catch { b = null; } }
    rec.browser = b ? { pid: b.pid, starttime: b.starttime, dir: b.dir, devtoolsPort: F.readDevToolsPort(b.dir) } : null;
    return rec.browser;
  }
  /** r4 LOW 4: the holder of `dir`'s lock when it is alive, names `dir`, has a starttime and THIS record's daemon is its
   *  parent or grandparent → `{pid, starttime, dir, devtoolsPort}` | null. */
  function lockHeldUnder(rec, dir) {
    if (!dir || !rec || !Number.isInteger(rec.pid)) return null;
    const f = F.lockHolderFacts(dir);
    const h = f.holder;
    if (!(h && h.alive && h.starttime != null && (h.ancestors || [h.parentPid]).includes(rec.pid) && (h.dirs || []).some((d) => B.sameDir(d, dir)))) return null;
    return { pid: h.pid, starttime: h.starttime, dir, devtoolsPort: f.devtoolsPort };
  }
  // ── VERIFY r3 (2026-09-25) M1: A RECORD OF A BROWSER IS RE-CAPTURED EVERY TIME IT IS JUDGED ──
  // Measured on the real 0.38.1 (five shapes): when the daemon's Chrome dies (the user closing a headed window, a
  // crash) the DAEMON LIVES and its next verb relaunches Chrome IN PLACE — a new pid, a new SingletonLock and
  // DevToolsActivePort, and without a profile a NEW temp user-data-dir. The browser recorded at launch then named a
  // dead pid: after a daemon SIGKILL the tick found it 'gone' and never ended the relaunched Chrome, and (the real
  // Chrome's environ carries no AGENT_BROWSER_* — the binary scrubs it — so r2's namespace witness never fired) a named
  // profile answered `profile_locked … it may be the user's own browser` FOREVER; an ephemeral's relaunched Chrome leaked
  // unseen. So: (a) the record FOLLOWS the relaunch — re-captured whenever it is judged while the daemon is provably ours
  // (the tick, a start's live return, a view's port, stop() before its first signal); (b) a holder nobody recorded is
  // still the keeper's own when its --user-data-dir IS a directory the keeper minted and no live daemon parents it.
  /** (b) Is `dir` a directory THIS KEEPER minted for `p` — a named profile's `<home>/.agent-browser/vs-<id>`
   *  (createProfile's own name, never a directory the user picked), an ephemeral's own directory (browser-env's, on its
   *  record) or the temp directory recorded for an ephemeral's browser (`recorded.dir`: the binary's per-launch one)?
   *  An ADOPTED directory (the user's, kept at its path) is never minted. */
  function mintedDirOf(p, dir, recorded) {
    if (!p || !dir) return false;
    if (!isEph(p)) return B.sameDir(dir, path.join(homeDir, '.agent-browser', B.profileDirName(p.id)));
    return !!((p.dir && B.sameDir(dir, p.dir)) || (recorded && recorded.dir && B.sameDir(dir, recorded.dir)));
  }
  /** (a) The record's browser AFTER judging it: kept while it is still the recorded process naming its directory; else —
   *  only while the daemon is provably OURS (pid AND starttime) — re-captured: the directory's LOCK read first (its
   *  holder a child of THIS daemon naming it), else the daemon's child naming it (rung N: no directory is known — each
   *  relaunch mints a temp one); a daemon with no Chrome right now records none (nothing to end). → rec.browser. */
  function recaptureBrowser(rec, seenBy) {
    if (!rec || !isLocalRec(rec) || !Number.isInteger(rec.pid) || rec.pid <= 0) return rec ? rec.browser || null : null;
    const b = rec.browser && Number.isInteger(rec.browser.pid) ? rec.browser : null;
    if (b && F.pidAlive(b.pid) && F.sameProcess(b.pid, b.starttime) && B.userDataDirsOf(F.procCmdline(b.pid), [b.dir]).some((d) => B.sameDir(d, b.dir))) return b;
    if (livenessOf(rec) !== 'ours') return rec.browser || null; // never re-captured under a daemon we cannot prove ours
    const p = profile(rec.profileId);
    const dir = (p && p.dir) || null;
    // r4 LOW 4: the lock's holder under THIS daemon — its child OR grandchild (a wrapper that does not exec between them)
    let next = lockHeldUnder(rec, dir);
    if (!next) { let c = null; try { c = F.browserOfDaemon(rec.pid, { dir }); } catch { c = null; } if (c && c.starttime != null) next = { pid: c.pid, starttime: c.starttime, dir: c.dir, devtoolsPort: F.readDevToolsPort(c.dir) }; }
    if (!b && !next) return null;
    // verify r2 (KILL CLASS / the heal): a NEW browser replaced one this record had identified (its Chrome died and the
    // tick's heal — or 0.38.1's in-place relaunch — runs another on the directory): every tab of the old one is GONE
    const replaced = !!next && (b ? !(next.pid === b.pid && next.starttime === b.starttime) : !!rec.browserLost);
    rec.browser = next; dirty = true;
    // r4 MAJOR 1: the EVIDENCE a heal needs — a browser this record had identified is gone and nothing replaced it (a daemon
    // whose browser was never identifiable — a provider launched some other way — is never "closed", never healed)
    rec.browserLost = next ? null : { pid: b.pid, at: now() };
    if (replaced) tabsWentWithBrowser(rec, seenBy);
    // verify r4 #3 (site-reset): every tab of the REPLACED browser is gone — so is every persisted witness naming one (the dead
    // socket sends no targetDestroyed; reproduced on the real 0.38.1: the dead ids stayed on the leases, a ghost-only scope read
    // as attributed and the conversation's `stop` said "nothing of yours" while it had no tab at all)
    if (replaced) { const n = dropLeaseTabs(rec.profileId); if (n) log.log?.(`[browser] ${rec.profileId}: the persisted tab witness of ${n} lease(s) went with the replaced browser`); tabsLost(rec.profileId, `its browser relaunched in place (seen by ${seenBy})`); } // lane profile-lock-roll (L2)
    log.log?.(`[browser] ${rec.profileId}: its daemon ${rec.pid} ${next ? `relaunched its browser in place — re-captured pid ${next.pid} (${next.dir}${next.devtoolsPort ? ', DevToolsActivePort ' + next.devtoolsPort : ''})` : 'has no browser right now'}${b ? `; the recorded pid ${b.pid} is gone` : ''} (seen by ${seenBy})`);
    return next;
  }
  /** verify r2 (KILL CLASS / the heal): every tab of a REPLACED browser is gone — measured on the real 0.38.1 + Chrome 154
   *  (verify/repro-r2-heal): after a crash + the tick's heal the user's pinned session answered `tab_gone` to his address
   *  row and "Continue", and Browse yourself only FOCUSED his window on the dead tab (his holder stayed `driving`). His
   *  browsing now ends `stopped` — his page went with the old Chrome: his window says so and Browse again joins the healed
   *  browser with a new tab. A CONVERSATION is left to the binary's own typed `tab_gone` naming `tab new` (lane H verify r4,
   *  measured and pinned in test-browser-mediation-chrome ④: the agent LEARNS its page is gone — never a silent blank tab
   *  under a command meant for the old page). Never an ephemeral record. */
  function tabsWentWithBrowser(rec, seenBy) {
    const p = profile(rec.profileId);
    if (!p || isEph(p) || !humans.has(p.id)) return;
    endHuman(p.id, 'stopped', { closeTab: false }).catch((e) => log.warn?.(`[browser] ${p.id}: the user's browsing could not be ended after the relaunch — ${e && e.message}`));
    log.log?.(`[browser] ${p.id} "${p.label}": its browser was replaced (seen by ${seenBy}) — the user's own tab went with the old one: his browsing ended (Browse again opens a new tab)`);
  }
  /** (a) + a NAMED profile's CDP url: a re-captured browser serves a new DevTools endpoint, so the cached url is re-asked
   *  under the keeper's own session and launch view (never a restart; the mediated leases follow — leaseCdpUrl). */
  async function followRelaunch(rec, seenBy, { heal = true, force = false } = {}) {
    const before = rec && rec.browser ? rec.browser.pid : null;
    const b = recaptureBrowser(rec, seenBy);
    const p = rec ? profile(rec.profileId) : null;
    if (!p || isEph(p) || rec.state !== 'ready' || !isLocalRec(rec)) return b;
    if (rec.launch === 'attach') return b; // lane one-browser-b1: no daemon relaunches it — its exit is the record's (markDaemonGone)
    // r4 MAJOR 1: a named profile's daemon whose identified browser is GONE (the user closed its window, a crash) —
    // nothing else relaunches it
    if (!b) return heal && (rec.browserLost || rec.closed) ? healBrowser(rec, p, seenBy, { force }) : null;
    if (rec.closed || rec.browserLost) { rec.closed = null; rec.browserLost = null; dirty = true; }
    if (b.pid === before) return b;
    rec.cdpUrl = null;
    try { await leaseCdpUrl(rec.profileId); } catch { /* the next lease call asks again */ }
    return b;
  }
  // ── VERIFY r4 (2026-09-25) MAJOR 1: A PROFILE BROWSER THE PRODUCT CANNOT RELAUNCH IS A DEAD LEASE — HEAL WHERE THE ABSENCE IS SEEN ──
  // Measured on the real keeper + 0.38.1 (3/3): SIGTERM the Chrome of a named profile (the user closing a headed window, a
  // crash) and the daemon LIVES with no browser; the agents run under their LEASE's session over AGENT_BROWSER_CDP (a CDP
  // client cannot launch), the keeper asked under its own session only when the cdp url was null — so the profile stayed
  // `ready` on a dead port and every verb, the live view, the recorder answered "Connection refused" for the rest of the
  // conversation. `get cdp-url` under the KEEPER's session on that daemon relaunches Chrome IN it (161 ms, a new
  // DevToolsActivePort, measured): the tick (while a lease holds it), a start's live return and a view's port — the three
  // places that already judge the record — heal it; the mediated grants are repointed, and a non-mediated lease is handed
  // the new port by its next /resolve (every verb asks). NEVER over a directory somebody else now holds (the user opened
  // the profile themselves): that is reported by name (`profile_locked`, the pid) and never raced — a relaunch there would
  // open a window in THEIR browser. A failed heal is retried by a verb at once, by the tick after HEAL_RETRY_MS.
  // ── VERIFY r5 (2026-09-25) MAJOR 1: A HEAL IS EVIDENCE-BOUND AND BUDGETED — NEVER A LOOP ──
  // r4's heal remembered nothing but the failed-heal gate and cleared its evidence after every answer. Measured (the
  // verifier, real keeper + 0.38.1 + a real Chrome): (a) a Chrome that dies ~1 s after every relaunch (a crash-on-load
  // page, a headed window the user keeps closing, an OOM) was relaunched on EVERY tick — 12/12 in 60 s, 39 journal lines a
  // minute, ≈600 CPU-s/h, a 165 MB Chrome every 5 s, `ready`, nobody told; (b) one that died before the recapture left
  // `ready` + no browser + no verdict, so nothing healed it again and an attach handed out the dead url (r4's dead lease,
  // reached through the fix) — and the same at a START whose Chrome died before its capture. Now: every relaunch is COUNTED
  // in the record's own persisted ledger (`rec.heals`, browser-profiles.healLedger); HEAL_BUDGET of them inside
  // HEAL_WINDOW_MS and the next closure is `browser_unstable` — no more relaunches (a verb's force included), ONE For-you
  // notice (origin browser) naming the profile and the count, the panel row says so, until a Stop ends the record (the next
  // start is a new record, a new ledger); a relaunch (or a start) after which no browser process is identified is
  // `browser_closed` by name — never a success — retried by the tick HEAL_RETRY_MS after THAT close, by a verb at once.
  // ── VERIFY r6 (2026-09-25) MINOR 1: only a relaunch whose url ANSWERED is an attempt (r5 counted before the ask, so three
  // asks the binary refused made the profile "keeps closing" in 93 s); a failed ask has its own streak + cap + words
  // (`rec.heals.failed`, B.failedAskVerdict: 10 spanning 4.5 min ⇒ `browser_unstable` "could not be started", `closed.unstable
  // = 'failing'`). B-47f9 (lane browser-reliability): r6's LOW 2 (the window slides — a browser closing every ~4 min was
  // restarted on every closure for good) is closed by a SECOND tier: HEAL_DAY_BUDGET relaunches in HEAL_DAY_MS ⇒ unstable.
  const HEAL_RETRY_MS = B.HEAL_RETRY_MS;
  const healing = new Map();
  const closedText = (p, why) => `"${p.label}"'s browser was closed (its window or process ended) and could not be started again${why ? ' — ' + why : ''}; stop it from the Browser panel, then run the command again`;
  const leasedNow = (profileId) => holdersOn(profileId).length > 0; // BROWSE YOURSELF: the user browsing it is a holder too (a heal is for somebody)
  /** r5 LOW 5: a closure a relaunch ATTEMPT made carries `retryAt` (its close + HEAL_RETRY_MS) and the tick waits for it; a
   *  refusal that attempted nothing (another browser holds the directory) carries none — the tick re-reads
   *  the lock every pass (a /proc read), so the heal follows the human's close within one tick. */
  const healGated = (rec) => !!(rec && rec.closed && Number.isFinite(rec.closed.retryAt) && now() < rec.closed.retryAt);
  // ── LANE BROWSER-DISPLAY-HOLDERS (the owner 2026-10-25, «可以»): A PERSON'S STOP IS A FACT THE KEEPER KEEPS, NEVER A CRASH ──
  // The owner stopped the display window of a profile two conversations were attached to («W8N3 · Screeps live»); its Chrome
  // died with the display and the tick read that as a crash under a holder — `started again on the attach road`, 4 s later,
  // twice (the heal budget would have called the person "unstable" on the third). Now the desktop keeper tells this keeper
  // of a PERSON's stop of a browser's display BEFORE its teardown (`userStoppedDisplay`): the record is stamped
  // `userStopped: {at, by: 'user', displayId}`, every holding conversation is told once (a `browser-user-stopped` lease event
  // → the wiring's notice), and NO heal runs while it stands (`userStoppedRec` — a named gate, never a budget hit). It ends
  // with the record: a conversation's next browser command starts a NEW record (its own act, `startedBy` its verb, no stamp).
  const USER_STOPPED_NOTE = 'you stopped its display window — the next browser command starts it again';
  const STOP_LAND_MS = 10000;   // the census cure: how long a person's display stop waits for its stamp to land before the teardown
  const userStoppedRec = (rec) => !!(rec && rec.userStopped && rec.userStopped.by === 'user');
  /** The desktop keeper's hook: the person stopped display session `displayId` of `profileId`'s browser (the route's
   *  `why: 'user'` — the window's Stop, a second ✕, the Desktop list's Close). → the stamped record's view | null. */
  function userStoppedDisplay({ profileId, displayId } = {}) {
    ensureLoaded();
    const rec = reg.browsers[String(profileId || '')];
    if (!rec || rec.launch !== 'attach' || !rec.displaySession || rec.displaySession.id !== displayId || !B.isLiveBrowser(rec) || !isLocalRec(rec)) return null;
    const p = profile(rec.profileId);
    const label = p ? p.label : rec.profileId;
    rec.userStopped = { at: now(), by: 'user', displayId };
    dirty = true;
    const holders = B.attachedHolders(leasesOn(rec.profileId));
    log.log?.(`[browser] ${rec.profileId} "${label}": the person stopped its display window (${displayId}) — its Chrome goes with it and is NOT started again by itself (user-stopped); ${holders.length} holding conversation(s) told: their next browser command starts it`);
    emitLease({ kind: 'browser-user-stopped', profileId: rec.profileId, label, holders, displayId, local: true });
    const landed = commitSync();
    const view = browserView(rec);
    // the census cure ((b) — 主开发 09:18Z: a step after the save that cannot be undone): the desktop keeper tears the display down
    // (its Chrome dies with it) right after this save — not on disk at the bound ⇒ the teardown waits for the stamp's landing
    // (bounded): a kill after the teardown never leaves a browser the person stopped without its stamp (the boot would heal it)
    if (!landed) return { ...view, landing: whenLanded({ timeoutMs: STOP_LAND_MS }) };
    return view;
  }
  /** The desktop keeper's reader: who holds the browser whose display record is `displayId` — the conversations attached
   *  to its profile, and the person's stop while it stands for THAT display (a newer start's display carries none). */
  function displayHoldersOf(profileId, displayId = null) {
    ensureLoaded();
    const id = String(profileId || '');
    const rec = reg.browsers[id] || null;
    const stamp = userStoppedRec(rec) && (!displayId || rec.userStopped.displayId === displayId) ? rec.userStopped : null;
    return { holders: B.attachedHolders(leasesOn(id)).length, ...(stamp ? { userStopped: { at: stamp.at, by: 'user' } } : {}) };
  }
  /** The two halves meet through the desktop keeper the attach road already holds: its record view asks
   *  displayHoldersOf, its stop tells userStoppedDisplay (wired at create and again by setDisplaySessions). */
  let displayStopOff = null;
  function wireDisplayKeeper() {
    try { if (displayStopOff) displayStopOff(); } catch { /* the old keeper is gone */ }
    displayStopOff = null;
    if (!displayKeeper) return;
    if (typeof displayKeeper.setBrowserHolders === 'function') displayKeeper.setBrowserHolders(displayHoldersOf);
    if (typeof displayKeeper.onBrowserDisplayStop === 'function') displayStopOff = displayKeeper.onBrowserDisplayStop(userStoppedDisplay);
  }
  /** r5: record a close verdict on a live record. `at` is when this close was FIRST seen (kept while the same code and holder
   *  recur — a re-judged refusal never re-writes the store); `retry` (a relaunch attempt made it) arms the gate from NOW.
   *  → true when the verdict is new (said once). */
  function setClosed(rec, c, { retry = false } = {}) {
    const same = !!(rec.closed && rec.closed.code === c.code && (rec.closed.holderPid || null) === (c.holderPid || null));
    if (same && !retry && rec.closed.error === c.error && !Number.isFinite(rec.closed.retryAt)) return false;
    rec.closed = { at: same && Number.isFinite(rec.closed.at) ? rec.closed.at : now(), code: c.code, error: c.error, holderPid: c.holderPid || null, ...(retry ? { retryAt: now() + HEAL_RETRY_MS } : {}), ...(c.unstable ? { unstable: c.unstable } : {}) };
    dirty = true;
    return !same;
  }
  const noteHeal = (rec, patch) => { rec.heals = { ...B.healLedger(rec.heals), ...patch }; dirty = true; };
  /** B-47f9 verify r1: the journal's count, per tier (the ledger keeps a day — its length is not the 10-min count). */
  const healTiers = (rec) => { const v = B.healBudgetVerdict({ attempts: B.healLedger(rec.heals).attempts, now: now() }); return `${v.recent.length} of ${B.HEAL_BUDGET} in ${Math.round(B.HEAL_WINDOW_MS / 60000)} min, ${v.kept.length} of ${B.HEAL_DAY_BUDGET} in ${Math.round(B.HEAL_DAY_MS / 3600e3)} h`; };
  /** r5: the budget is spent — `browser_unstable` (no more relaunches until a stop ends the record) + the ONE notice. r6
   *  MINOR 1: `kind` 'closing' (HEAL_BUDGET relaunches that each produced a browser that closed) or 'failing' (the failed-ask
   *  cap: every ask to start it again failed, `spanMs` the time they spanned) — two verdicts, two sets of words, one code. */
  function markUnstable(rec, p, count, seenBy, { kind = 'closing', spanMs = null, windowMs = B.HEAL_WINDOW_MS, display = null } = {}) {
    const failing = kind === 'failing';
    const first = setClosed(rec, { code: 'browser_unstable', error: B.unstableText({ label: p.label, count, windowMs, kind, spanMs }), ...(failing ? { unstable: 'failing' } : {}) });
    noteHeal(rec, { lastOutcome: 'unstable', unstableCount: count, unstableKind: failing ? 'failing' : null, unstableSpanMs: failing ? spanMs : null, unstableWindowMs: failing ? null : windowMs, unstableDisplay: failing && display ? display : null }); // lane browser-unstable-rejudge: the fact it was parked under
    if (first) {
      if (failing) log.warn?.(`[browser] ${p.id} "${p.label}": its browser could not be started — ${count} relaunch asks in ${Math.round((spanMs || 0) / 1000)} s all failed (daemon ${rec.pid} alive, seen by ${seenBy}; no browser started) — NOT asked again (browser_unstable) until it is stopped from the Browser panel`);
      else log.warn?.(`[browser] ${p.id} "${p.label}": its browser closed again (daemon ${rec.pid} alive, seen by ${seenBy}) after ${count} restarts in ${windowMs >= 2 * 3600e3 ? Math.round(windowMs / 3600e3) + ' h' : Math.round(windowMs / 60000) + ' min'} — NOT started again (browser_unstable) until it is stopped from the Browser panel`);
    }
    noticeUnstable(rec, p);
  }
  /** r5: ONE For-you notice per unstable record (origin browser) — filed once (`heals.noticedAt`, persisted); a store that is
   *  not wired or refuses is said in the journal and tried again on the next pass (a failed filing is never "filed"). */
  function noticeUnstable(rec, p) {
    const L = B.healLedger(rec.heals);
    if (L.noticedAt) return false;
    // a store that is not wired / refuses: said ONCE (never a journal line per tick), tried again silently on each pass
    const unfiled = (why) => { if (L.lastOutcome !== 'unstable-unfiled') { noteHeal(rec, { lastOutcome: 'unstable-unfiled' }); log.warn?.(`[browser] ${p.id} "${p.label}": keeps closing — ${why}`); } return false; };
    if (!userTodos || typeof userTodos.add !== 'function') return unfiled('no For-you store is wired, so only this journal says so');
    const n = B.unstableNotice({ label: p.label, count: L.unstableCount || B.HEAL_BUDGET, windowMs: L.unstableWindowMs || B.HEAL_WINDOW_MS, kind: L.unstableKind === 'failing' ? 'failing' : 'closing', spanMs: L.unstableSpanMs }); // r6: its own words
    let it = null;
    try { it = userTodos.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', text: n.text, detail: n.detail, sessionName: 'Agent browser' }); }
    catch (e) { return unfiled(`the For-you notice was not filed (${e && e.message}) — tried again on the next pass`); }
    noteHeal(rec, { noticedAt: now(), noticeId: it && typeof it.id === 'string' ? it.id : null }); // lane browser-unstable-rejudge: resolved by a re-judge that brings it back
    return true;
  }
  // ── lane browser-unresponsive (a fleet user's inc 2026-10-05: the shared "jarvis-work" answered 0 bytes for 80 min while
  // every verb said "run the command again"): A BROWSER THAT DOES NOT ANSWER IS A NAMED STATE WITH ONE WAY OUT. The tick
  // asks `/json/version` (≤ BS.ANSWER_ASK_MS), every refused tab read / window open counts as an ask that did not answer;
  // browser-stuck's PURE verdict decides; `rec.unresponsive` {since, lastAnswerAt, asks} is THE fact every surface reads
  // (the row, the live banner, the chip, the agent's refusal), cleared the moment an ask answers. Keepers REPORT — a hung
  // browser is in use by nobody (no verb runs, no picture moves), and Restart stays a human's act or a gated agent's.
  const answers = new Map(); // profileId → the asks so far {lastAnswerAt, since, asks} (memory: a boot re-judges within a minute)
  const asking = new Set();
  const browserPidOf = (rec) => (rec && rec.browser && Number.isInteger(rec.browser.pid) ? rec.browser.pid : (rec ? rec.pid : null));
  const gpuPctOf = (profileId) => { const l = live.get(profileId); return l && l.gpu && Number.isFinite(l.gpu.cpuPct) ? Math.round(l.gpu.cpuPct) : null; };
  function noteAnswer(rec, p, answered, by) {
    if (!rec || !p || !isLocalRec(rec)) return null;
    const at = now(), pid = browserPidOf(rec);
    // mirror-green-220 (the .220 Actions mirror: B-47f9's slow closer judged "has not answered since …"): the asks are ONE
    // browser process's — a closed one started again (another pid) begins a new run, never adds its misses to the dead one's;
    // a browser the keeper KNOWS is closed (rec.closed / browserLost) or mid-relaunch (a heal in flight) is never asked
    const known = answers.get(p.id) || null, replaced = !!known && known.pid !== pid;
    const running = !rec.closed && !rec.browserLost && !healing.has(p.id) && Number.isInteger(pid) && F.pidAlive(pid);
    const v = BS.browserAnswerVerdict(replaced ? null : known, { answered, at, pidAlive: running });
    if (v.next) answers.set(p.id, { ...v.next, pid }); else answers.delete(p.id);
    const was = rec.unresponsive || null;
    if (v.state === 'unresponsive') {
      const fact = BS.unresponsiveFact(v.next);
      if (was && was.since === fact.since && was.cause) fact.cause = was.cause; // lane browser-stderr-pipe: the cause rides the run
      rec.unresponsive = fact; dirty = true;
      if (!was || was.since !== fact.since) { log.warn?.(`[browser] ${BS.unresponsiveLine({ id: p.id, label: p.label, since: fact.since, asks: fact.asks, pid, gpu: gpuPctOf(p.id) })}`); noticeUnresponsive(rec, p); commit(); hangCause(rec, p, pid, fact.since); }
    } else if (was) {
      rec.unresponsive = null; dirty = true;
      log.log?.(`[browser] ${BS.answeredAgainLine({ id: p.id, label: p.label, since: was.since, at, by: v.state === 'closed' || replaced ? 'its process ended' : by })}`);
      resolveUnresponsive(rec, 'browser-answered'); commit();
    }
    return rec.unresponsive || null;
  }
  /** lane browser-stderr-pipe: WHY it hangs, when /proc can say — its Chrome blocked writing into a stderr pipe nothing
   *  reads (BE.stderrPipeVerdict over two samples) ⇒ `rec.unresponsive.cause` (the row's words, the journal line). Reports
   *  only: the Restart stays the user's act or a gated agent's. → a promise of the cause | null. */
  function hangCause(rec, p, pid, since) {
    if (!Number.isInteger(pid)) return null;
    return Promise.resolve().then(() => (stderrPipeProbe || BE.probeStderrPipe)(pid)).then((f) => {
      const cause = BE.stderrPipeVerdict({ ...(f || {}), answered: false });
      const u = rec.unresponsive;
      if (!cause || !u || u.since !== since || reg.browsers[p.id] !== rec) return null;
      u.cause = cause; dirty = true;
      log.warn?.(`[browser] ${BE.stderrPipeLine({ id: p.id, label: p.label, pid, fd2: f.fd2 })}`);
      commit();
      return cause;
    }).catch(() => null);
  }
  /** One `/json/version` ask of a live local browser (never two at once per profile). */
  async function askAnswer(rec, p, by = 'the tick') {
    if (!rec || !p || !rec.cdpUrl || asking.has(p.id)) return null;
    asking.add(p.id);
    try {
      const r = await probeCdp(rec.cdpUrl, { timeoutMs: answerAskMs || BS.ANSWER_ASK_MS });
      if (reg.browsers[p.id] !== rec || !B.isLiveBrowser(rec) || stopping.has(p.id) || starting.has(p.id)) return null;
      return noteAnswer(rec, p, !!(r.ok || /^HTTP \d+/.test(String(r.error || ''))), by); // any HTTP answer is an answer
    } finally { asking.delete(p.id); }
  }
  /** lane browser-daemon-survives-update: ONE bounded ask of every page of a browser (its endpoint's page list, then one
   *  Runtime.evaluate per page) → browser-viewport pageAnswers' shape, or null when no endpoint is known (never throws). */
  async function askPages(rec) {
    if (!rec || !rec.cdpUrl) return null;
    const boundMs = pageAnswerMs || BS.PAGE_ANSWER_MS;
    try { return { ...(await (pageAsk || require('./browser-viewport.js').pageAnswers)(rec.cdpUrl, { timeoutMs: boundMs })), boundMs }; }
    catch (e) { return { list: false, error: String(e && e.message), pages: [], boundMs }; }
  }
  /** The agent refusal's fact (browser-tabs' words), or null while the browser is not judged hung. */
  const unresponsiveOf = (rec, p) => (rec && rec.unresponsive && p ? { label: p.label, since: rec.unresponsive.since, now: now(), tabs: null } : null);
  /** ONE For-you item per (profile, since) — origin browser, its Restart act; self-resolving on an answer or a restart. */
  function noticeUnresponsive(rec, p) {
    const u = rec.unresponsive;
    if (!u || (rec.unresponsiveNotice && rec.unresponsiveNotice.since === u.since)) return false;
    rec.unresponsiveNotice = { since: u.since, id: null }; dirty = true; // claimed first: a refusal never files twice
    if (!userTodos || typeof userTodos.add !== 'function') { log.warn?.(`[browser] ${p.id} "${p.label}": not answering — no For-you store is wired, so only this journal says so`); return false; }
    const n = BS.unresponsiveNotice({ label: p.label, since: u.since, now: now() });
    try { const it = userTodos.add('browser', { origin: 'browser', kind: 'action', urgency: 'high', by: 'agent', text: n.text, detail: n.detail, sessionName: 'Agent browser', action: { type: 'browser-restart', profileId: p.id, since: u.since } }); rec.unresponsiveNotice.id = (it && it.id) || null; }
    catch (e) { log.warn?.(`[browser] ${p.id} "${p.label}": the not-answering For-you item was not filed (${e && e.message})`); return false; }
    return true;
  }
  function resolveUnresponsive(rec, by) {
    const n = rec && rec.unresponsiveNotice;
    if (!n) return;
    if (n.id && userTodos && typeof userTodos.setStatus === 'function') { try { const it = typeof userTodos.get === 'function' ? userTodos.get(n.id) : null; if (!it || it.status === 'open') userTodos.setStatus(n.id, 'done', by); } catch { /* gone already */ } }
    rec.unresponsiveNotice = null; dirty = true;
  }
  /**
   * RESTART = THE ONE RECOVERY of a hung browser: the stop (SIGTERM→SIGKILL by pid+starttime) + the relaunch made
   * explicit + every OTHER conversation holding a lease told by a card (one per lease, never a billed turn) + the audit
   * line. The user always (the cookie route); an agent ONLY while the verdict stands and no human drives it.
   */
  async function restartProfile(profileId, { by = 'user', browserKey = null, sessionName = null } = {}) {
    ensureLoaded();
    const rec = reg.browsers[profileId], p = profile(profileId);
    if (!rec || !p) throw namedError('not-found', `no browser record for ${profileId}`);
    let admitted = null;
    if (by !== 'user') {
      // lane browser-daemon-survives-update: THE PAGE'S ANSWERS, asked now (every page, bounded) + the agent's own last answers
      // (the dialog watch's fact) — never the helper's liveness alone: a browser whose endpoint answers while no page does is hung
      const driving = userDrivesAnyWindowOf(profileId);
      let pages = null, stuck = null;
      if (!rec.unresponsive && !driving) {
        try { stuck = stuckSource && browserKey ? stuckSource(browserKey) || null : null; } catch { stuck = null; }
        if (stuck && stuck.profileId && stuck.profileId !== profileId) stuck = null;
        pages = BS.pageAnswerVerdict(await askPages(rec));
      }
      const a = BS.restartAdmission({ by: 'agent', unresponsive: rec.unresponsive || null, humanDriving: driving, label: p.label, pages, stuck });
      if (!a.ok) { log.log?.(`[browser] ${browserKey || 'an agent'} on ${profileId}: restart refused ${a.code}${pages ? ` (its pages: ${pages.why}, ${pages.answered.length} answered, ${pages.silent.length} did not)` : ''}`); throw namedError(a.code, a.error); }
      admitted = { why: a.why, pages };
    }
    const u = rec.unresponsive || null;
    const who = by === 'user' ? 'the user' : `the conversation ${sessionName ? '"' + sessionName + '"' : browserKey || 'an agent'}`;
    const others = reg.leases.filter((l) => l.profileId === profileId && l.browserKey !== browserKey).map((l) => ({ browserKey: l.browserKey, sessionId: l.sessionId || null }));
    await stop(profileId, { why: 'user' });
    answers.delete(profileId);
    if (rec.unresponsive) rec.unresponsive = null;
    resolveUnresponsive(rec, 'browser-restarted');
    let browser = null;
    if (!isEph(p)) browser = await start(profileId, { why: `restarted by ${who}${u ? ` (not answering since ${BS.utcClock(u.since)})` : ''}` });
    const text = BS.restartedCardText({ label: p.label, by: who, since: u ? u.since : null, now: now() });
    for (const o of others) announceRelaunch({ kind: 'relaunch', outcome: 'restarted', profileId, label: p.label, browserKey: o.browserKey, sessionId: o.sessionId, text, n: 0, verbs: [] }); // int220: the builds row's seam (.219 moved the listeners there)
    log.log?.(`[browser] ${profileId} "${p.label}": restarted by ${who}${u ? ` — it had not answered since ${BS.utcClock(u.since)} (asks ${u.asks})` : admitted && admitted.why !== 'browser' ? ` — ${BS.restartWhyText(admitted.why, admitted.pages)}` : ''}; ${others.length} other conversation(s) told`);
    commit();
    return browser || browserView(reg.browsers[profileId]);
  }
  function healBrowser(rec, p, seenBy, { force = false } = {}) {
    if (!rec || !p || rec.state !== 'ready' || !isLocalRec(rec) || starting.has(p.id) || stopping.has(p.id) || switching.has(p.id)) return Promise.resolve(null);
    if (livenessOf(rec) !== 'ours') return Promise.resolve(null); // never under a daemon we cannot prove ours (the tick marks it gone)
    if (healing.has(p.id)) return healing.get(p.id);
    if (userStoppedRec(rec)) { if (!force) return Promise.resolve(null); rec.userStopped = null; dirty = true; } // lane browser-display-holders: the person's stop is never healed — only a verb's own start ends it
    // r5 MAJOR 1: an UNSTABLE browser is never started again by itself — not by a verb's force either; only a stop ends it
    if (rec.closed && rec.closed.code === 'browser_unstable') {
      if (noticeUnstable(rec, p)) commit();
      if (rec.closed.unstable !== 'failing') return Promise.resolve(null);
      // lane browser-unstable-rejudge: …except a `failing` verdict whose fact changed or whose world restarted — ONE fresh ask
      const rj = rejudgeUnstable(rec, p, seenBy);
      healing.set(p.id, rj);
      return rj.finally(() => { if (healing.get(p.id) === rj) healing.delete(p.id); });
    }
    if (!force && healGated(rec)) return Promise.resolve(null);
    // verify r2 (B5): a browser whose Chrome build was changed moments ago and is gone again: never healed on that build —
    // it falls back to the build it replaced (or says it is down), and the conversations told "changed" are told that too
    if (rec.buildChange && now() - Number(rec.buildChange.at || 0) <= CHANGE_SETTLE_MS) return fallBackFromChange(rec, p, seenBy);
    const pr = (async () => {
      // verify r2 (H1): the heal is a `get cdp-url` in the SAME daemon — it runs the daemon's own CLI version; that version
      // gone from this machine ⇒ closed BY NAME (a binary of another version would replace the daemon and its identity),
      // never counted as a failed relaunch — a restart (Stop, then the next command) runs the current CLI
      // B-7a30 unit 1': THE DOOR (a fresh judge, bounded) — the same answer the relaunch's own command would get; no answer
      // within the bound ⇒ no relaunch now and no failure counted (the next tick tries again)
      { const c = await cliOptReady(rec); if (reg.browsers[p.id] !== rec || rec.state !== 'ready' || starting.has(p.id) || stopping.has(p.id) || switching.has(p.id)) return null; /* B-7a30: re-checked after the door's await */ if (c && c.unconfirmed) { log.warn?.(`[browser] ${p.id} "${p.label}": its browser closed (daemon ${rec.pid} alive, seen by ${seenBy}) — not healed now: ${c.unconfirmed}`); return null; } if (c && c.gone) { if (setClosed(rec, { code: 'browser_cli_gone', error: closedText(p, c.gone) })) { log.warn?.(`[browser] ${p.id} "${p.label}": its browser closed (daemon ${rec.pid} alive, seen by ${seenBy}) and is NOT started again — ${c.gone}`); commit(); } return null; } }
      // a browser launched with the provider's own flags (its own executable + arguments) is never relaunched by a bare
      // `get cdp-url` (a launch view without them would relaunch it as plain chromium on that directory): said, not guessed
      // (lane dc-browser-providers: the pre-r4 record rung — no flag, the provider said — is gone with the row's `launchFlags`)
      if (rec.launchFlags === true) {
        if (setClosed(rec, { code: 'browser_closed', error: closedText(p, `a ${p.provider} browser is started again only by a start (its own launch flags)`) })) { log.warn?.(`[browser] ${p.id} "${p.label}": its browser closed (daemon ${rec.pid} alive, seen by ${seenBy}) — ${rec.closed.error}`); commit(); }
        return null;
      }
      const f = F.lockHolderFacts(p.dir);
      const v = B.profileLockVerdict({ lock: f.lock, holder: f.holder, hostname: os.hostname(), dir: p.dir, minted: mintedDirOf(p, p.dir, null), recorded: null, mark: markOf(p), preMarkAllowed: !rec.mark, launchHosts: launchHostsFor(rec, p.dir) });
      if (v.kind === 'stale-previous-host') { // lane profile-lock-roll: a previous name's lock never holds a live daemon's directory — removed, the heal goes on
        const t = takeOverStaleLock(p, p.dir, v);
        if (!t.ok) { setClosed(rec, t.refusal); commit(); return null; } // verify r1 (F5): still locked ⇒ closed by name, no heal into it
      } else if (v.kind === 'own-orphan') {
        const e = await endProcess(v.pid, f.holder.starttime);
        log.warn?.(`[browser] ${p.id} "${p.label}": ended its own orphaned browser pid ${v.pid} before healing (${v.why}): ${e}`);
        if (e === 'survived' || e === 'unproven') { setClosed(rec, B.profileLockedRefusal({ label: p.label, dir: p.dir, verdict: { ...v, kind: e === 'survived' ? 'survived' : 'foreign' } })); commit(); return null; }
        const c = clearEndedOrphanLock(p, p.dir, v.pid); // verify r2 (F4): its lock under a previous name would make the heal's launch hang
        if (!c.ok) { setClosed(rec, c.refusal); commit(); return null; } // verify r3 (F1): a clear that fails ⇒ closed by name, no heal into it
      } else if (v.kind !== 'free') {
        // r5 LOW 5: a refusal that attempted nothing — no gate armed, `at` kept, said once per holder
        const rf = B.profileLockedRefusal({ label: p.label, dir: p.dir, verdict: v });
        if (setClosed(rec, rf)) { log.warn?.(`[browser] ${p.id} "${p.label}": its browser closed (daemon ${rec.pid} alive, seen by ${seenBy}) and is NOT started again — ${rf.error}`); commit(); }
        return null;
      }
      // r5 MAJOR 1 (a): THE BUDGET — HEAL_BUDGET relaunches inside HEAL_WINDOW_MS ⇒ unstable, judged BEFORE the next ask.
      // r6 MINOR 1: a relaunch is COUNTED once its url ANSWERED (a browser was produced — whether or not it then died); an
      // ask the binary refused started nothing: it keeps the 30 s gate and its OWN streak, cap and words (below), so a
      // transient fault (the binary mid-reinstall, the folder unreadable, a full disk) never reads as "closed each time"
      const L = B.healLedger(rec.heals);
      const bud = B.healBudgetVerdict({ attempts: L.attempts, now: now() });
      if (!bud.ok) { markUnstable(rec, p, bud.count, seenBy, { windowMs: bud.windowMs }); commit(); return null; }
      // lane browser-unstable-rejudge: THE FRESH-DAEMON RUNG — the HEAL_FRESH_AT-th ask of a failed streak, when the display
      // its daemon was launched under is not the display now, is never sent to that daemon (it relaunches with its frozen
      // env): the keeper stops it (proven ours above — its pid + starttime, its launch mark) and starts a fresh one, probed now
      if (L.failed) {
        const dk = DSP.displayKey(await machineDisplay());
        if (reg.browsers[p.id] !== rec || rec.state !== 'ready') return null;
        if (B.freshDaemonDue({ failed: L.failed, launched: DSP.displayKey(rec.display), now: dk })) return freshDaemon(rec, p, seenBy, `${L.failed.count} relaunch asks failed through daemon ${rec.pid}, launched under the display ${DSP.displayKey(rec.display)} — the display now is ${dk}`);
      }
      const tAsk = now();
      const t0 = Date.now();
      rec.cdpUrl = null;
      let url = null; try { url = await leaseCdpUrl(p.id); } catch { url = null; }
      if (reg.browsers[p.id] !== rec || rec.state !== 'ready') return null;
      if (!url) {
        // r6 MINOR 1: a FAILED ask — its streak (consecutive, since its first) grows; HEAL_FAIL_BUDGET of them spanning
        // HEAL_FAIL_SPAN_MS ⇒ `browser_unstable` "could not be started" + ONE notice in those words, else `browser_closed`
        const F0 = B.healLedger(rec.heals).failed;
        const failed = { count: (F0 ? F0.count : 0) + 1, since: F0 ? F0.since : tAsk };
        noteHeal(rec, { lastOutcome: 'failed', failed });
        const fv = B.failedAskVerdict({ failed, now: now() });
        if (!fv.ok) {
          const dk = DSP.displayKey(await machineDisplay()); // lane browser-unstable-rejudge: the fact this verdict is parked under
          if (reg.browsers[p.id] !== rec || rec.state !== 'ready') return null;
          markUnstable(rec, p, fv.count, seenBy, { kind: 'failing', spanMs: fv.spanMs, display: dk }); commit(); return null;
        }
        setClosed(rec, { code: 'browser_closed', error: closedText(p, 'its daemon answered no CDP url (the relaunch failed)') }, { retry: true });
        log.warn?.(`[browser] ${p.id} "${p.label}": its browser closed (daemon ${rec.pid} alive, seen by ${seenBy}) and the relaunch failed — ${rec.closed.error} (failed ask ${failed.count}; the tick tries again in ${HEAL_RETRY_MS / 1000} s, a command at once; ${B.HEAL_FAIL_BUDGET} failed asks over ${B.HEAL_FAIL_SPAN_MS / 60000} min ⇒ browser_unstable)`);
        commit();
        return null;
      }
      // r6 MINOR 1: the url answered — THIS is a relaunch (the budget's attempt), and the failed streak ends
      noteHeal(rec, { attempts: [...B.healBudgetVerdict({ attempts: B.healLedger(rec.heals).attempts, now: tAsk }).kept, tAsk], failed: null }); // B-47f9: a day of attempts (the second tier)
      const lost = rec.browserLost;
      const b = recaptureBrowser(rec, `${seenBy}, healed`);
      if (!b) { // r5 MAJOR 1 (b): its CDP url answered but no browser process holds the directory — it died at birth: CLOSED, never a success
        rec.browserLost = { pid: lost ? lost.pid : null, at: now() };
        setClosed(rec, { code: 'browser_closed', error: closedText(p, 'it was started again but died before VibeSpace could identify it (a crash at startup?)') }, { retry: true });
        noteHeal(rec, { lastOutcome: 'unidentified' });
        log.warn?.(`[browser] ${p.id} "${p.label}": started again in daemon ${rec.pid} (seen by ${seenBy}) but no browser process holds ${p.dir} — it died at birth: browser_closed (the tick tries again in ${HEAL_RETRY_MS / 1000} s, a command at once)`);
        commit();
        return null;
      }
      rec.closed = null; rec.browserLost = null; dirty = true;
      noteHeal(rec, { lastOutcome: 'healed' });
      log.log?.(`[browser] ${p.id} "${p.label}": its browser had closed (${lost && lost.pid ? 'pid ' + lost.pid + ' gone, ' : ''}daemon ${rec.pid} alive, seen by ${seenBy}) — started again in that daemon in ${Date.now() - t0} ms: ${b ? 'pid ' + b.pid + (b.devtoolsPort ? ', DevToolsActivePort ' + b.devtoolsPort : '') : 'its CDP url answers (the process is not identified)'} (restart ${healTiers(rec)}); the leases follow (mediated: repointed; others: their next command)`);
      commit();
      return b;
    })();
    healing.set(p.id, pr);
    return pr.finally(() => { if (healing.get(p.id) === pr) healing.delete(p.id); });
  }
  // ── lane browser-unstable-rejudge (the owner's instance, 2026-10-06): A PARKED browser_unstable OUTLIVED THE DEAD
  // COMPOSITOR THAT CAUSED IT. systemd-oomd killed the GNOME session at 01:44; both profiles' Chromes (Wayland clients) died
  // with it; ten relaunch asks went to 42-h-old daemons whose frozen env named the dead compositor and all failed ⇒ parked
  // `failing`; the compositor came back at 03:36 and the 16:32 restart ADOPTED both daemons with the verdict — 15 h of
  // browser_unstable until a human pressed Stop. Now: a `failing` verdict is re-judged when its fact (the display key) changes
  // or at the boot that adopted its daemon — ONE fresh ask (rejudgeVerdict), the key recorded so one change earns one ask —
  // and that ask, like the ladder's fresh rung, is a NEW daemon launched with the display probed now (freshDaemon).
  const bootRejudge = new Set(); // profile ids adopted at boot with a parked `failing` verdict — each earns one ask
  async function rejudgeUnstable(rec, p, seenBy) {
    const dk = DSP.displayKey(await machineDisplay());
    if (reg.browsers[p.id] !== rec || rec.state !== 'ready' || !(rec.closed && rec.closed.code === 'browser_unstable')) return null;
    const L = B.healLedger(rec.heals);
    const v = B.rejudgeVerdict({ unstable: rec.closed.unstable || null, parked: L.unstableDisplay, now: dk, boot: bootRejudge.has(p.id) });
    bootRejudge.delete(p.id);
    if (!v.ask) { if (v.seed) { noteHeal(rec, { unstableDisplay: dk }); commit(); } return null; }
    noteHeal(rec, { unstableDisplay: dk, lastOutcome: 'rejudged' }); commit(); // the key it is asked under: the same world never asks twice
    const why = v.why === 'boot' ? 'VibeSpace restarted and adopted its daemon (a new world)' : `the display changed since it was parked (${L.unstableDisplay} → ${dk})`;
    log.warn?.(`[browser] ${p.id} "${p.label}": its browser_unstable (could not be started) is re-judged — ${why} (seen by ${seenBy}): ONE fresh ask`);
    return freshDaemon(rec, p, seenBy, `re-judged: ${why}`);
  }
  /** Heal from the one process that can launch: the record's daemon (proven ours by the caller — healBrowser's livenessOf)
   *  is STOPPED (the CLI's close, then its pid + starttime) and a FRESH daemon started by the keeper's own start — the
   *  display probed now, the planned config of THIS call. The day of relaunch attempts rides the new record (the B-47f9 tiers
   *  keep counting); a fresh start that fails ends the record `failed` with its own words — the tick never relaunches a
   *  failed record, the next command starts it again with the display probed then (never a loop). */
  async function freshDaemon(rec, p, seenBy, why) {
    const L = B.healLedger(rec.heals);
    const old = rec.pid;
    log.warn?.(`[browser] ${p.id} "${p.label}": ${why} — its daemon ${old} is stopped and a FRESH daemon started with the display probed now (seen by ${seenBy})`);
    try { await stop(p.id, { why: 'relaunch' }); /* §54b: a sanctioned stop reason — the daemon is replaced, not ended */ } catch (e) { log.warn?.(`[browser] ${p.id} "${p.label}": its daemon ${old} could not be stopped for a fresh one (${e && e.message})`); return null; }
    let v = null;
    try { v = await start(p.id, { why: 'heal' }); }
    catch (e) { log.warn?.(`[browser] ${p.id} "${p.label}": the fresh daemon did not start either — ${(e && e.code) || 'launch_failed'}: ${e && e.message} (failed by name; the next command starts it again with the display probed then — never a loop)`); return null; }
    const nrec = reg.browsers[p.id];
    if (!nrec || nrec === rec) return null;
    nrec.heals = { ...B.healLedger(null), attempts: [...B.healBudgetVerdict({ attempts: L.attempts, now: now() }).kept, now()], lastOutcome: 'fresh-daemon' }; dirty = true;
    if (L.noticeId && nrec.browser && userTodos && typeof userTodos.setStatus === 'function') { try { const it = typeof userTodos.get === 'function' ? userTodos.get(L.noticeId) : null; if (!it || it.status === 'open') userTodos.setStatus(L.noticeId, 'done', 'agent'); } catch { /* gone already */ } } // its "could not be started" notice is over
    log.log?.(`[browser] ${p.id} "${p.label}": a fresh daemon ${nrec.pid} replaced ${old} — ${nrec.browser ? 'its browser pid ' + nrec.browser.pid + ' is up' : 'no browser identified yet'} (display ${DSP.displayKey(nrec.display)})`);
    commit();
    return nrec.browser || (v && v.browser) || null;
  }
  /** r4 MAJOR 1 + r5: the refusal a lease / a view gets while its profile's browser is not there — the close verdict
   *  (`profile_locked` — somebody else's browser holds the directory —, `browser_closed`, `browser_unstable`), else (r5
   *  MINOR 2) a browser it had identified that is gone and nobody healed (an UNLEASED profile's: a view never starts one)
   *  ⇒ `browser_closed` "the next command starts it"; a browser never identifiable is not judged (null). */
  function closedRefusalOf(profileId) {
    const rec = reg.browsers[profileId];
    if (!(rec && rec.state === 'ready' && isLocalRec(rec)) || rec.browser) return null;
    if (rec.closed) return { code: rec.closed.code, error: rec.closed.error, holderPid: rec.closed.holderPid || null, ...(rec.closed.unstable ? { unstable: rec.closed.unstable } : {}) }; // r6: the verdict's kind rides
    if (rec.browserLost) { const p = profile(profileId); return { code: 'browser_closed', error: `"${p ? p.label : profileId}"'s browser was closed (its window or process ended) — the next browser command starts it again, and a live view reconnects then`, holderPid: null }; }
    return null;
  }
  /** SIGTERM, then SIGKILL — each only while the pid is STILL the process (pid + starttime). Real time, never the
   *  injectable clock (a stuck fake clock must not spin this). → 'ended' | 'gone' | 'unproven' | 'survived'. */
  async function endProcess(pid, starttime, { termMs = 1500, site = 'the keeper' } = {}) {
    const same = () => F.pidAlive(pid) && F.sameProcess(pid, starttime);
    if (!F.pidAlive(pid)) return 'gone';
    if (!same()) return 'unproven';
    try { process.kill(pid, 'SIGTERM'); SL.noteSignal(pid, site, 'SIGTERM', now(), starttime); } catch { /* gone meanwhile */ } // B-346d's recorder (c): noted only when the kill succeeded
    for (let i = 0; i < termMs / 100 && F.pidAlive(pid); i++) await sleep(100);
    if (same()) { try { process.kill(pid, 'SIGKILL'); SL.noteSignal(pid, site, 'SIGKILL', now(), starttime); } catch { /* gone */ } for (let i = 0; i < 10 && F.pidAlive(pid); i++) await sleep(50); }
    return F.pidAlive(pid) && F.sameProcess(pid, starttime) ? 'survived' : 'ended';
  }
  /** End the browser a record's (gone) daemon launched — tracked per profile, single flight. The RECORDED browser first
   *  (while it is still that process naming its directory); then (verify r3 M1 b) the LOCK of each directory the keeper
   *  minted for this record — ended only on browser-profiles.profileLockVerdict's `own-orphan` (r4: the holder carries
   *  THIS record's launch mark, or is the pre-mark CLI launch); a `foreign` holder (r4 MAJOR 2: a Chrome the user opened on
   *  our directory) is REPORTED — said once in the journal — and never signalled; then (r4 LOW 3) an ephemeral's browser
   *  wherever it runs — every Chrome carrying its mark with no live daemon above it (a relaunch in a NEW temp dir). */
  const saidForeign = new Map(); // `${profileId}|${pid}` → said once (a foreign holder is reported, not re-logged each tick)
  function reapOrphan(rec, seenBy) {
    if (!rec || !isLocalRec(rec)) return Promise.resolve(null);
    const b = rec.browser && Number.isInteger(rec.browser.pid) ? rec.browser : null;
    const p = profile(rec.profileId);
    const dirs = [...new Set([b && b.dir, p && p.dir].filter(Boolean).map(String))].filter((d) => mintedDirOf(p, d, b));
    const scanMark = isEph(p) && rec.mark ? String(rec.mark) : null;
    if (!b && !dirs.length && !scanMark) return Promise.resolve(null);
    if (reaping.has(rec.profileId)) return reaping.get(rec.profileId);
    const pr = (async () => {
      let r = null;
      if (b && !F.pidAlive(b.pid)) { rec.browser = null; dirty = true; r = 'gone'; }
      else if (b && (!F.sameProcess(b.pid, b.starttime) || !B.userDataDirsOf(F.procCmdline(b.pid), [b.dir]).some((d) => B.sameDir(d, b.dir)))) {
        log.warn?.(`[browser] ${rec.profileId}: pid ${b.pid} is no longer the browser recorded for it — left alone, never signalled`);
        rec.browser = null; dirty = true; r = 'unproven';
      } else if (b) {
        r = await endProcess(b.pid, b.starttime, { site: 'the keeper: its orphaned Chrome' });
        log.warn?.(`[browser] ${rec.profileId}: ended its own orphaned browser pid ${b.pid} (${b.dir}) — the one recorded for it; its daemon ${rec.pid} is gone (seen by ${seenBy}): ${r}`);
        if (r !== 'survived') { rec.browser = null; dirty = true; }
        if (!scanMark) return r;
      }
      for (const d of dirs) {
        const f = F.lockHolderFacts(d);
        const v = B.profileLockVerdict({ lock: f.lock, holder: f.holder, hostname: os.hostname(), dir: d, minted: true, recorded: null, mark: markOf(p), preMarkAllowed: !rec.mark, launchHosts: launchHostsFor(rec, d) });
        if (v.kind === 'stale-previous-host') continue; // lane profile-lock-roll: nothing of that name can hold it — the next start takes it over
        if (v.kind === 'foreign' && v.pid) {
          // r4 MAJOR 2: the owner's law — a used session is REPORTED, never killed (a start on it is refused by name)
          const k = `${rec.profileId}|${v.pid}`;
          if (!saidForeign.has(k)) { saidForeign.set(k, now()); log.warn?.(`[browser] ${rec.profileId}: its daemon ${rec.pid} is gone (seen by ${seenBy}); ${d} is held by pid ${v.pid}, which is left running — ${v.why}`); }
          continue;
        }
        if (v.kind !== 'own-orphan') continue; // free: nothing to end (the next start judges it again, by name)
        const e = await endProcess(v.pid, f.holder.starttime);
        log.warn?.(`[browser] ${rec.profileId}: ended its own orphaned browser pid ${v.pid} (${d}) — found by the directory's lock: ${v.why}; its daemon ${rec.pid} is gone (seen by ${seenBy}): ${e}`);
        if (e === 'survived') { rec.browser = { pid: v.pid, starttime: f.holder.starttime, dir: d }; dirty = true; }
        r = e;
      }
      // r4 LOW 3: an ephemeral's Chrome relaunched in place in a NEW temp directory after the record was made (rung N: no
      // directory the keeper knows names it) — its command line carries THIS conversation's mark, so it is found wherever it
      // runs; ended only when no live browser daemon is its parent or grandparent (a new start's Chrome carries it too)
      if (scanMark) {
        let hits = [];
        try { hits = await F.markedBrowsers(scanMark); } catch { hits = []; }
        for (const h of hits) {
          if (h.daemonPid || h.starttime == null) continue;
          const e = await endProcess(h.pid, h.starttime);
          log.warn?.(`[browser] ${rec.profileId}: ended its own orphaned browser pid ${h.pid}${h.dirs && h.dirs[0] ? ' (' + h.dirs[0] + ')' : ''} — it carries this conversation's launch mark (${B.keeperMarkArg(scanMark)}) and no live browser daemon is its parent; its daemon ${rec.pid} is gone (seen by ${seenBy}): ${e}`);
          r = e;
        }
      }
      return r;
    })();
    reaping.set(rec.profileId, pr);
    return pr.finally(() => { if (reaping.get(rec.profileId) === pr) reaping.delete(rec.profileId); });
  }
  /** Before a launch on `p.dir`: who holds its SingletonLock? The keeper's own orphan is ended; anything it cannot prove
   *  its own is a refusal by name (`profile_locked`, the pid named). → `{ok}` | `{ok:false, code, error, holderPid}`. */
  async function clearProfileLock(p, ns, prev) {
    if (!p || !p.dir) return { ok: true };
    const facts = F.lockHolderFacts(p.dir);
    const recorded = prev && prev.browser ? prev.browser : null;
    // verify r3: the holder is the keeper's own when it is the browser recorded (re-captured) for it OR the directory is
    // one the keeper minted (never "its environment names our namespace": the real binary scrubs its Chrome's env)
    // r4 MAJOR 2: …and a holder on a minted directory is the keeper's own only when it carries THIS record's launch mark (or
    // is the CLI's pre-mark launch) — a Chrome the user opened there is `foreign` (user): refused by name, left running
    // r5 LOW 3: the pre-mark fallback only for a record launched BEFORE the mark (its last record carries none)
    // lane profile-lock-roll (L1): a lock under a hostname THIS keeper recorded at a launch of this profile is the previous
    // name of this machine (an RWO home rolled to a new pod) — taken over here; any other foreign hostname stays refused
    const v = B.profileLockVerdict({ lock: facts.lock, holder: facts.holder, hostname: os.hostname(), dir: p.dir, minted: mintedDirOf(p, p.dir, recorded), recorded, mark: markOf(p), preMarkAllowed: !(prev && prev.mark), launchHosts: launchHostsFor(prev, p.dir) });
    if (v.kind === 'free') return { ok: true, verdict: v };
    if (v.kind === 'stale-previous-host') { const t = takeOverStaleLock(p, p.dir, v); if (!t.ok) return { ok: false, ...t.refusal }; return { ok: true, verdict: v, tookOver: v.host, removed: t.removed }; } // verify r1 (F5): a lock still there is a refusal, never a launch
    if (v.kind === 'own-orphan') {
      const r = await endProcess(v.pid, facts.holder.starttime);
      log.warn?.(`[browser] ${p.id} "${p.label}": ended its own orphaned browser pid ${v.pid} before launching on ${p.dir} (${v.why}${facts.devtoolsPort ? ', DevToolsActivePort ' + facts.devtoolsPort : ''}): ${r}`);
      if (r === 'ended' || r === 'gone') { const c = clearEndedOrphanLock(p, p.dir, v.pid); if (!c.ok) return { ok: false, ...c.refusal }; return { ok: true, ended: v.pid, ...(c.removed ? { removed: c.removed } : {}) }; } // verify r2 (F4); r3 (F1): a clear that fails is a refusal, never a launch
      return { ok: false, ...B.profileLockedRefusal({ label: p.label, dir: p.dir, verdict: { ...v, kind: r === 'survived' ? 'survived' : 'foreign', why: r === 'unproven' ? 'it changed while being judged' : v.why } }) };
    }
    // OWNER RULING A — the pre-upgrade case: the holder's launch mark names a CONVERSATION's browser key (a managed
    // ephemeral browser a pre-ruling pin launched on this very directory) — never ended by the keeper; the refusal
    // names the button (and the self-release after that conversation's turn)
    if (!isEph(p) && facts.holder && facts.holder.cmdline) {
      const bkMark = B.keeperMarksOf(facts.holder.cmdline).find((m) => B.isBrowserKey(m) || B.isChildKey(m));
      if (bkMark) {
        const f = convFacts(bkMark);
        const rf2 = B.ephemeralHolderRefusal({ label: p.label, holderPid: v.pid, holderName: f && f.name ? String(f.name) : '' });
        log.warn?.(`[browser] ${p.id} "${p.label}": NOT launched — the directory is held by conversation ${bkMark}'s own browser (pid ${v.pid}, a pre-ruling pin)`);
        return { ok: false, ...rf2 };
      }
    }
    const rf = B.profileLockedRefusal({ label: p.label, dir: p.dir, verdict: v });
    log.warn?.(`[browser] ${p.id} "${p.label}": NOT launched — ${rf.error}`);
    return { ok: false, ...rf };
  }
  /** VERIFY r2 (F4): OUR orphan ended under a PREVIOUS name of this machine (renamed under a running browser — hostnamectl, a
   *  DHCP-derived macOS name — then its daemon died) leaves a lock that still names that machine, and Chromium never clears a
   *  foreign name's lock (measured on 154: the launch hangs on its own dialog; the agent-browser binary: exit 21) — the
   *  launch right after the end died behind a generic failure and only the NEXT command took the lock over. The ended
   *  orphan's stale lock is removed now (our own name's stale lock is left to Chromium, as before). → the names removed, or null. */
  //  VERIFY r3 (F1 + F2): the ladder's step ③ as ONE PURE verdict (browser-profiles.lockVerdict, phase `ended`) — the lock removed
  //  is THE ORPHAN'S (its pid; a lock rewritten meanwhile — a relaunch in place, a stranger's — is left for the launch's own
  //  judgement, never called "this machine's previous name"), and a removal that FAILS (EACCES: a volume gone read-only, a
  //  directory of another uid) is refused by name with the errno and the one command (r1 F5's shape) — reproduced: "nothing
  //  removed" and a launch into a lock the real binary refuses (1.4 s, a generic failure). → {ok, removed, refusal?}
  function clearEndedOrphanLock(p, dir, endedPid = null) {
    const lk = F.readSingletonLock(dir);
    const v = B.lockVerdict({ phase: 'ended', lock: lk, hostname: os.hostname(), alive: lk ? F.pidAlive(lk.pid) : false, endedPid });
    if (v.kind === 'leave') { log.warn?.(`[browser] ${p.id} "${p.label}": after ending its own orphaned browser pid ${endedPid}, ${v.why}`); return { ok: true, removed: null }; }
    if (v.kind !== 'clear') return { ok: true, removed: null };
    const removed = F.removeSingletonFiles(dir);
    const left = F.singletonLeft(dir);
    if (left.includes('SingletonLock')) {
      const f = (removed.failed || []).find((x) => x.name === 'SingletonLock');
      const refusal = B.profileLockedRefusal({ label: p.label, dir, verdict: { kind: 'ended-unremovable', pid: v.pid, host: v.host, removeError: f ? f.code : 'still present after the unlink' } });
      log.warn?.(`[browser] ${p.id} "${p.label}": ${v.why} but could NOT be removed (${f ? f.code : 'still present after the unlink'}) — NOT launched: ${refusal.error}`);
      return { ok: false, removed, refusal };
    }
    log.warn?.(`[browser] ${p.id} "${p.label}": ${v.why} — ${removed.length ? removed.join(', ') + ' removed' : 'nothing removed'} from ${dir} (this machine is ${os.hostname()})`);
    return { ok: true, removed };
  }
  /** VERIFY r2 (F1): a launch that FAILED — or whose browser died at birth — on a directory a holder took BETWEEN the verdict
   *  and the launch (the user's own Chrome: exit 21 behind "the browser did not start" / "a crash at startup?") is judged
   *  AGAIN now; a holder that is not ours is named (`profile_locked`, the sentence the next command would have said), never a
   *  generic launch failure. A free directory, our own remains (a dead pid, our orphan) and a previous name's lock keep the
   *  generic sentence. Reproduced with a lock planted after the verdict: launch_failed first, profile_locked only second. */
  //  VERIFY r3 (F3): …and a PREVIOUS name's lock that reached the launch (it appeared after the verdict — the ④f race under
  //  the roll's shape; measured on the real 0.38.1: the binary refuses it in 1.4 s, the keeper answered a generic
  //  `launch_failed … Command failed` with an EMPTY journal and only the NEXT command took it over) is taken over NOW and
  //  named: the answer says what it was and the one next step. The ladder's step ⑤ is the PURE `afterLaunchVerdict`.
  function lockRefusalAfterLaunch(p, prev) {
    if (!p || !p.dir) return null;
    const facts = F.lockHolderFacts(p.dir);
    const recorded = prev && prev.browser ? prev.browser : null;
    const a = B.lockVerdict({ phase: 'after-launch', lock: facts.lock, holder: facts.holder, hostname: os.hostname(), dir: p.dir, minted: mintedDirOf(p, p.dir, recorded), recorded, mark: markOf(p), preMarkAllowed: !(prev && prev.mark), launchHosts: launchHostsFor(prev, p.dir) });
    if (a.kind === 'refuse') return B.profileLockedRefusal({ label: p.label, dir: p.dir, verdict: a.verdict });
    if (a.kind === 'take-over') {
      const t = takeOverStaleLock(p, p.dir, a.verdict);
      if (!t.ok) return t.refusal; // still locked (EACCES) ⇒ r1 F5's refusal, by name
      const rf = B.profileLockedRefusal({ label: p.label, dir: p.dir, verdict: { ...a.verdict, kind: 'stale-taken-over' } });
      return { ...rf, tookOver: a.verdict.host };
    }
    return null;
  }
  /**
   * VERIFY r1 H2: a managed ephemeral browser's liveness is its PROCESS, never its record. The record says `ready`
   * until the tick (5 s) notices the pid is gone, and a view reconnecting inside that window (the client retries 1 s
   * after `upstream-closed`) would ask the CLI `stream status` — which, measured on 0.38.1 as on 0.32.0, STARTS a
   * daemon the keeper never holds. So every reader that would act on `ready` judges the pid first: a ready local
   * record whose daemon is gone is marked stopped NOW and the digest is told (its holder row leaves at once).
   * Never while it is starting or stopping. → true when it marked it.
   */
  function judgeEphemeral(browserKey, seenBy) {
    const e = ephemeralFor(browserKey);
    if (!e || e.state !== 'ready') return false;
    const rec = reg.browsers[e.profileId];
    if (!rec || starting.has(e.profileId) || stopping.has(e.profileId) || !isLocalRec(rec) || !daemonGone(rec)) return false; // r2 L4: dead OR recycled
    markEphemeralGone(rec, seenBy);
    commit();
    return true;
  }

  // ── lane daemon-orphan-end: a daemon nobody holds (no browser, no lease, no conversation) — ended by identity ──
  const orphanSeen = new Map(); // `${pid}:${starttime}` → {browserAt, said}
  let orphanPending = 0; let lastOrphanScan = 0; let orphanRun = null;
  const orphanDirs = () => { const d = [CONFIG_DIR]; try { d.push(fs.realpathSync(CONFIG_DIR)); } catch { /* not yet */ } return d; };
  async function endOrphan(d, v, { rec, p, conversation, idleMs, rowIdleMs = idleMs, seenBy }) {
    const end = endIdentity || ((pid, st) => endProcess(pid, st, { termMs: 5000 })); // SIGTERM, SIGKILL after 5 s
    const result = await end(d.pid, d.starttime);
    const xvfb = [], chrome = [];
    // lane browser-daemon-survives-update: a daemon ended because its browser stopped answering takes that Chrome with it
    // (its child: proven ours by its parent, ended by pid + starttime — never left holding the profile's lock)
    if (v.ended) for (const c of d.chrome || []) if (c.starttime != null) chrome.push({ pid: c.pid, result: await end(c.pid, c.starttime) });
    for (const x of d.xvfb || []) if (x.starttime != null) xvfb.push({ pid: x.pid, result: await end(x.pid, x.starttime) });
    log.log?.(`[browser] ${O.endedLine({ pid: d.pid, why: v.why, conversation, idleMs, result, xvfb, chrome })} (seen by ${seenBy})`);
    if (rec && result !== 'survived') {
      if (B.isLiveBrowser(rec)) { if (isEph(p)) markEphemeralGone(rec, seenBy); else markDaemonGone(rec, seenBy); }
      rec.state = 'stopped'; rec.stoppedBy = 'idle'; rec.endedAt = rec.endedAt || now(); rec.note = v.ended ? O.endedNote({ why: v.why, at: now() }) : O.rowNote(rowIdleMs); dirty = true;
    } else if (!rec && v.ended && p && result !== 'survived') { // a daemon no record named (its mark): its profile's stopped row says it
      const r0 = reg.browsers[p.id];
      if (r0 && !B.isLiveBrowser(r0)) { r0.note = O.endedNote({ why: v.why, at: now() }); dirty = true; }
    }
    return result;
  }
  /** lane browser-daemon-survives-update: a daemon's own CDP endpoint — its record's url while the record names it, else its
   *  Chrome's (the DevToolsActivePort that Chrome writes in its --user-data-dir, else its --remote-debugging-port). */
  function endpointOfDaemon(d, rec) {
    if (rec && rec.pid === d.pid && rec.starttime === d.starttime && rec.cdpUrl) return rec.cdpUrl;
    for (const c of d.chrome || []) {
      if (c.dir) { try { const e = B.parseDevToolsActivePort(fs.readFileSync(path.join(c.dir, 'DevToolsActivePort'), 'utf8')); if (e) return `ws://127.0.0.1:${e.port}${e.path}`; } catch { /* not written */ } }
      if (c.port) return `http://127.0.0.1:${c.port}`;
    }
    return null;
  }
  /** Could the browser CLI be asked at all (a missing binary / a version gone is not a daemon that did not answer)? */
  const cliAsked = (i) => !!i && !(i.raw && (i.raw.code === 'ENOENT' || i.raw.code === 'browser_cli_gone' || /^binary_absent|^browser_cli_gone/.test(String(i.raw.error || ''))));
  /**
   * lane browser-daemon-survives-update — THE BOOT'S RE-OWN: a daemon of ours (its record names it, or its launch mark names a
   * known profile) that no live record keeps and whose Chrome runs: its own `session info` (under its pairs / its profile's
   * namespace — the answer must be THIS daemon's) + every page of its endpoint (bounded) ⇒ O.reownVerdict. Re-owned = its
   * profile's record names it again, ready (its leases are the profile's — kept by the boot's reconcile); ended = the daemon,
   * its Chrome and its Xvfb by identity, the row says why. → the verdict, or null when another daemon is this profile's
   * (the census judges this one) or the profile has no record to re-own it into.
   */
  async function bootReown(d, rec0, p) {
    const rec = rec0 || reg.browsers[p.id] || null;
    if (!rec || !isLocalRec(rec)) return null;
    if (B.isLiveBrowser(rec) && !(rec.pid === d.pid && rec.starttime === d.starttime)) return null;
    let i = null; try { i = isEph(p) && Array.isArray(rec.envPairs) ? await rt.info(null, { extraEnv: pairsEnv(rec.envPairs) }) : await rt.info(rec.ns || nsOf(p.id), { dir: p.dir || null }); } catch { i = null; }
    if (!cliAsked(i)) return null;
    if (i && i.ok && Number.isInteger(i.pid) && i.pid !== d.pid) return null; // another daemon answers under that name: not this one's to re-own
    const url = endpointOfDaemon(d, rec);
    const v = O.reownVerdict({ daemonAnswered: !!(i && i.ok), active: !!(i && i.active), ask: i && i.active && url ? await askPages({ cdpUrl: url }) : null });
    if (v.act === 're-own' && rec.egress) { const eg = await egressAdopt(rec); if (!eg.ok) { egressNotice(rec, p, eg); v.act = 'end'; v.why = eg.error; } } // lane engine-spi-egress r2: behind ITS proxy or ended
    if (v.act === 're-own') {
      Object.assign(rec, { pid: d.pid, starttime: d.starttime, cdpUrl: url && /^wss?:/.test(url) ? url : rec.cdpUrl, state: 'ready', adoptedAt: now(), lastError: null, note: null, stoppedBy: null, endedAt: null });
      recaptureBrowser(rec, 'boot'); dirty = true;
      log.log?.(`[browser] ${O.reownLine({ pid: d.pid, profileId: p.id, label: p.label, act: v.act, why: v.why })}`);
      return v;
    }
    const end = endIdentity || ((pid, st) => endProcess(pid, st, { termMs: 5000 }));
    v.result = await end(d.pid, d.starttime);
    for (const x of [...(d.chrome || []), ...(d.xvfb || [])]) if (x.starttime != null) await end(x.pid, x.starttime);
    if (!B.isLiveBrowser(rec)) { rec.note = O.endedNote({ why: v.why, at: now() }); rec.lastError = `${v.why} — its daemon was ended at the restart`; dirty = true; }
    log.log?.(`[browser] ${O.reownLine({ pid: d.pid, profileId: p.id, label: p.label, act: v.act, why: v.why, result: v.result })}`);
    return v;
  }
  /** The census over THIS machine's daemons (the tick, every orphanScanMs; the boot, once after adoption) and each
   *  paired machine's stopped record whose daemon still answers (through `browser-serve`, capability-gated). */
  function orphanCensus(seenBy, t = now(), { force = false } = {}) {
    if (heldReg) return Promise.resolve(null);   // the B-f276 remainder: a held registry names no record — every daemon would read «unkept» and be ENDED
    if (orphanRun) return orphanRun;
    if (!force && t - lastOrphanScan < orphanScanMs) return Promise.resolve(null);
    lastOrphanScan = t;
    orphanRun = (async () => {
      let rows = [];
      try { rows = await (daemonTable || F.daemonRows)(); } catch (e) { log.warn?.(`[browser] the daemon census could not read the process table: ${e && e.message}`); rows = []; }
      const live = liveKeys(); const dirs = orphanDirs(); const out = { ended: [], kept: [], reported: [], reowned: [] }; let pending = 0;
      const daemons = O.daemonsFromRows(rows); // lane ledger-dedup-law r12: once a pass (the forget below re-derived it per daemon seen)
      for (const d of daemons) {
        const id = `${d.pid}:${d.starttime}`; const seen = orphanSeen.get(id) || {}; orphanSeen.set(id, seen);
        const rec = Object.values(reg.browsers).find((r) => isLocalRec(r) && r.pid === d.pid && r.starttime === d.starttime) || null;
        if (rec && (starting.has(rec.profileId) || stopping.has(rec.profileId))) continue;
        const mark = O.daemonMark(d.env, dirs);
        const p = rec ? profile(rec.profileId) : mark ? (mark.kind === 'ephemeral' ? reg.profiles.find((x) => isEph(x) && x.owner.id === mark.mark) : profile(mark.mark)) || null : null;
        if (p && (starting.has(p.id) || stopping.has(p.id))) continue;
        const conversation = p && isEph(p) ? p.owner.id : mark && mark.kind === 'ephemeral' ? mark.mark : null;
        const browserAlive = d.chrome.length > 0; if (browserAlive) seen.browserAt = t;
        const noBrowserSince = Math.max(d.startedAt || 0, seen.browserAt || 0, (rec && rec.browserLost && rec.browserLost.at) || 0);
        const stoppedIdleAt = rec ? (!B.isLiveBrowser(rec) ? rec.endedAt || noBrowserSince : null) : noBrowserSince;
        const owned = !!(rec || mark), unkept = stoppedIdleAt != null && owned && !d.cdp && d.starttime != null;
        // lane browser-daemon-survives-update: AT BOOT a daemon of ours that no live record keeps, whose Chrome runs, is RE-OWNED
        // (its page answers) or ENDED with its Chrome — never left (the auto-update path is a plain restart: no special case)
        if (seenBy === 'boot' && unkept && browserAlive && p) {
          const r = await bootReown(d, rec, p);
          if (r) { (r.act === 're-own' ? out.reowned : out.ended).push({ pid: d.pid, why: r.why, ...(r.result ? { result: r.result } : {}) }); orphanSeen.delete(id); continue; }
        }
        // …and THE OTHER HALF on every census: such a daemon's Chrome is asked (its endpoint, bounded) — silent since ⇒ ended past the bound
        if (unkept && browserAlive) { const url = endpointOfDaemon(d, rec); if (url) { const a = await probeCdp(url, { timeoutMs: answerAskMs || BS.ANSWER_ASK_MS }); if (a.ok || /^HTTP \d+/.test(String(a.error || ''))) seen.silentSince = null; else seen.silentSince = seen.silentSince || t; } }
        const v = O.daemonVerdict({ daemon: { pid: d.pid, starttime: d.starttime, owned, cdp: d.cdp, stoppedIdleAt, noBrowserSince }, browserAlive,
          leases: rec && p ? holdersOn(p.id).length : 0 /* a lease names the RECORDED daemon, never a stray of the same mark */, conversationAlive: conversation ? (B.keyCarried(conversation, live) ? 'running' : 'gone') : null,
          lastVerbAt: (p && p.lastVerbAt) || 0, lastViewerAt: 0, now: t, silentSince: seen.silentSince || null, endedMs: browserEndedMs });
        if (v.act === 'end') { const r = await endOrphan(d, v, { rec, p, conversation, idleMs: t - noBrowserSince, rowIdleMs: t - Math.max((p && p.lastVerbAt) || 0, stoppedIdleAt == null ? noBrowserSince : stoppedIdleAt), seenBy }); out.ended.push({ pid: d.pid, why: v.why, result: r }); orphanSeen.delete(id); continue; }
        if (v.act === 'report') { out.reported.push({ pid: d.pid, why: v.why }); if (!seen.said && !d.cdp && !browserAlive) { seen.said = true; log.warn?.(`[browser] ${O.reportLine({ pid: d.pid, startedAt: d.startedAt, now: t })}`); } continue; }
        out.kept.push({ pid: d.pid, why: v.why }); if (!browserAlive) pending++;
      }
      const present = new Set(daemons.map((d) => `${d.pid}:${d.starttime}`));
      for (const k of [...orphanSeen.keys()]) if (!present.has(k)) orphanSeen.delete(k);
      await remoteOrphans(seenBy, t, out);
      orphanPending = pending;
      if (dirty) commit();
      return out;
    })().finally(() => { orphanRun = null; });
    return orphanRun;
  }
  /** A PAIRED machine: a stopped (idle) record of a profile there, no lease — its `status` answers the daemon facts;
   *  the verdict is applied through `end-daemon` (an agent without the capability is never asked: reported in the row). */
  async function remoteOrphans(seenBy, t, out) {
    for (const rec of Object.values(reg.browsers)) {
      if (isLocalRec(rec) || rec.external || !rec.hostId || B.isLiveBrowser(rec) || rec.stoppedBy !== 'idle') continue;
      const p = profile(rec.profileId); if (!p) continue;
      let st = null; try { st = await acc().call(rec.hostId, 'status', { profileId: rec.profileId }); } catch { continue; }
      const d = st && st.active && st.daemon ? st.daemon : null; if (!d) continue;
      const v = O.daemonVerdict({ daemon: { pid: d.pid, starttime: d.starttime, owned: true, stoppedIdleAt: rec.endedAt || 0, noBrowserSince: Math.max(rec.endedAt || 0, d.startedAt || 0) }, browserAlive: !!d.chrome,
        leases: holdersOn(p.id).length, conversationAlive: null, lastVerbAt: p.lastVerbAt || 0, now: t });
      if (v.act !== 'end') continue;
      const idleMs = t - (rec.endedAt || t);
      try {
        const r = await acc().call(rec.hostId, 'end-daemon', { profileId: rec.profileId, pid: d.pid, starttime: d.starttime });
        log.log?.(`[browser] ${rec.profileId} on ${rec.hostId}: ${O.endedLine({ pid: d.pid, why: v.why, idleMs, result: r && r.ok ? r.result : `refused (${(r && r.code) || '?'})` })} (seen by ${seenBy})`);
        if (r && r.ok) { rec.note = O.rowNote(idleMs); dirty = true; out.ended.push({ pid: d.pid, host: rec.hostId, why: v.why, result: r.result }); }
      } catch (e) {
        const note = `stopped — its daemon on ${rec.hostId} (pid ${d.pid}) has had no browser for ${O.durText(idleMs)}; reported, not ended (${e && e.code === 'end_daemon_unsupported' ? "that machine's agent predates ending it" : e && e.message})`;
        if (rec.note !== note) { rec.note = note; dirty = true; log.warn?.(`[browser] ${rec.profileId}: ${note}`); }
        out.reported.push({ pid: d.pid, host: rec.hostId, why: note });
      }
    }
  }
  /**
   * VERIFY r1 H2: the live-view bridge's upstream (the daemon's own stream server) closed on an EPHEMERAL relay —
   * the usual way a daemon's death is first seen. Judge the process at once; a daemon still exiting (its sockets
   * close before its pid is reaped) is re-judged every 200 ms for a second. A browser still alive is left alone.
   */
  function noteStreamClosed(target) {
    if (!target || target.kind !== 'ephemeral') return false;
    const bk = String(target.ns || '').replace(/^vs-/, '');
    if (!bk) return false;
    ensureLoaded();
    if (judgeEphemeral(bk, 'its stream closing')) return true;
    let n = 0;
    const again = () => { if (judgeEphemeral(bk, 'its stream closing') || ++n >= 5) return; const t2 = setTimeout(again, 200); if (t2.unref) t2.unref(); };
    const t = setTimeout(again, 200); if (t.unref) t.unref();
    return false;
  }
  /** VERIFY r3 (LOW 3): the daemon's starttime at launch, read twice (50 ms apart) before it is given up — on a machine that
   *  reads starttimes a null means the daemon was already gone, and a record without its identity is not `ready` (a
   *  recycled pid kept one ready forever). With no /proc (macOS) it stays null and the record is never signalled by pid. */
  async function launchStart(pid) {
    if (!pid) return null;
    let st = F.procStart(pid);
    if (st == null && F.startsReadable()) { await sleep(50); st = F.procStart(pid); }
    return st;
  }
  const unrecordedLaunch = (pid) => `the browser daemon (pid ${pid}) was gone right after its launch — its identity could not be recorded, so it is not held; run the command again`;
  /**
   * takeover C3 (§5.2 row 1): START a conversation's managed ephemeral
   * browser — the ceiling (`browser_cap`, D2), then ADOPT a
   * daemon an escaped command may already have started (`session info` under
   * the very pairs), else `open about:blank` under them with the idle setting.
   * NEVER a re-run of the browser-env ladder: the pairs are the session's.
   */
  function startEphemeral(p, { why = 'first verb' } = {}) {
    const profileId = p.id;
    const pairs = pairsOf(profileId);
    if (!pairs || !pairs.length) throw namedError('not_managed', `"${p.label}" has no spawn pairs recorded — run the command again from its session`);
    // MULTIVIEW D4: THIS conversation's own cap first (its helpers count), then the machine's ceiling —
    // whose refusal names only this conversation's holders (B-325a: another session's name never reaches an agent)
    const own = conversationCapNow(p.owner.id);
    if (own) throw namedError(own.code, own.error, { holders: own.holders, remedy: own.remedy, scope: own.scope, capOwn: own.own, capOf: own.cap });
    const cap = ceilingNow({ ephemeral: true, browserKey: p.owner.id });
    if (cap) throw namedError(cap.code, cap.error, { holders: cap.holders, remedy: cap.remedy, scope: cap.scope, others: cap.others });
    const p0 = (async () => {
      // lane engine-plugin: a conversation's browser whose record names an ENGINE (browser.defaultEngine, written at its first
      // start) — judged here, inside the in-flight start and before any record: refused by name (MARKED + ONE For-you item),
      // never Chrome in its place; its program + arguments ride the config every call of this browser names (rec.engineView)
      const ec = (() => { const c = BB.normalizeBrowserChoice(p.browser); return c && c.kind === 'plugin' ? c : null; })();
      const engineLaunch = ec ? await launchEngineOf(p, ec) : null;
      const ns = nsOf(profileId);
      const env0 = pairsEnv(pairs);
      const prev = reg.browsers[profileId] || null;
      const rec = { profileId, ns, pid: null, starttime: null, socketDir: null, cdpUrl: null, state: 'starting', startedAt: now(), endedAt: null, lastError: null, stoppedBy: null, lastLeaseDroppedAt: null, startedBy: why,
        hostId: null, external: false, forward: null, remoteCdpUrl: null, dir: p.dir || null, ephemeral: true, envPairs: pairs.slice(), starts: ((prev && prev.starts) || 0) + 1, note: null };
      // verify r3 (F5): what the NAMED start carries onto every new record (r5 LOW 3, lane L1), this row dropped — a REFUSED start
      // (a stranger's lock, F1's EACCES, an unreadable holder) committed a record with no mark and no lineage; the mark's loss
      // re-opened the pre-mark adoption (a hand-launched CLI Chrome on the kept directory ended as "our orphan"), the lineage's
      // loss made the next boot stamp this pod's name alone and the previous name's lock was refused as FOREIGN (userW's class,
      // one refusal later). Reproduced on a rolled kept directory; both ride the new record now (the mark + this machine's name
      // are set again at the launch below).
      if (prev && prev.mark) rec.mark = prev.mark;
      if (prev && prev.tailnet !== undefined) rec.tailnet = prev.tailnet; // lane tailnet-names: an ADOPTED daemon runs with its launch's view (a fresh launch below decides again)
      if (prev && prev.quietLog) rec.quietLog = true; // B-1789 cure: …and with its launch's quiet log switches — a server restart ADOPTS it with the keeper's file it launched under (no stamp ⇒ none: a daemon from before the cure); a fresh launch below stamps it
      { const lh = launchHostsFor(prev, p.dir || null); if (lh.length) { rec.hosts = lh; rec.host = prev && prev.host ? prev.host : lh[lh.length - 1]; } } // verify r4 (S26b): a retired record's directory still knows
      rec.egress = engineLaunch && engineLaunch.egress ? egressRecordOf(profileId) : null; // lane engine-spi-egress r2: the port the launch view names
      if (engineLaunch) { const ew = engineProgramOf(p, engineLaunch); rec.engineView = { executablePath: ew.program, args: ew.args, ...(engineLaunch.egress ? { wrapped: true } : {}) }; rec.browserChoice = recordedChoice(p, engineLaunch); if (engineLaunch.environment) rec.environment = engineLaunch.environment; } // B-9584 U2a: what this start says of the profile's environment · lane engine-args-string r2: the program = the keeper's wrapper (the engine's switches ride it whole); lane engine-spi-egress r2: a WRAPPED launch's proxy switches ride it too, last — `wrapped` = its config keeps no proxy switch of the base file
      reg.browsers[profileId] = rec;
      commit();
      if (reaping.has(profileId)) { try { await reaping.get(profileId); } catch { /* its own log */ } } // r2 M1: a dead daemon's browser is ended first
      let info = null;
      try { info = await rt.info(null, { extraEnv: env0 }); } catch { info = null; }
      let adopted = false;
      if (info && info.active && Number.isInteger(info.pid)) adopted = true;
      else {
        // r2 M1: a rung-C/D ephemeral launches on a DIRECTORY — its lock is judged first (the keeper's own orphan ended, a stranger's refused by name)
        const lk = await clearProfileLock(p, ns, prev);
        if (!lk.ok) { rec.state = 'failed'; rec.endedAt = now(); rec.lastError = lk.error; commit(); throw namedError(lk.code, lk.error, { holderPid: lk.holderPid }); }
        stampLaunchHost(rec, prev, p.dir || null); // lane profile-lock-roll (L1): a kept directory on a rolled home carries the same stale lock
        // r4 (MAJOR 2 / LOW 3): the launch carries this conversation's MARK (the keeper's file for it, unless its pairs name
        // their own config — rung D's, marked by browser-env); every later call of this record uses the same file
        rec.mark = p.owner.id;
        // lane browser-stuck: an ephemeral launch holds page dialogs only when its PAIRS name a config that does (rung D:
        // browser-env's spawn file). Pairs naming none (rung N) keep the keeper's file as it was — a bare command run with
        // those pairs (an escape) searches the default config, and a different launch view would restart this daemon
        rec.holdDialogs = pairsHoldDialogs(pairs);
        // lane browser-propose: the same rule for the automation flag — rung D's spawn file carries it (browser-env); pairs
        // naming none keep the keeper's file as it was (an escaped bare command must see the same launch view)
        rec.automationFlag = pairsAutomationFlag(pairs);
        // B-1789 cure: …and the quiet log switches — the keeper's file for this launch composes them (B.launchTail; rung D's
        // spawn file carries them by the same composer). An ADOPTED daemon carries its previous record's stamp (above): one from
        // before the cure has none, so its view is kept
        rec.quietLog = true;
        rec.tailnet = await tailnetFor(p, { engine: !!engineLaunch, env: { ...rtEnv, ...pairsEnv(pairs) } }); // lane tailnet-names: the tailnet road (its PAC rides the launch's derived config; the pairs' env proxy wins too)
        // r4 LOW 5 (lane H) = lane P verify r2 F2 (the same measured finding, reached by both lanes; measured on
        // 0.38.1): the launch passes the idle the PAIRS name — every other client of this daemon (the agent's verbs, a
        // live view's `stream status`) runs under them, and a client whose idle differs from the daemon's RESTARTS it
        // (`restartedBackground`, a new pid the record never names); the setting only when the pairs name none (a
        // setting changed since the spawn reaches the conversation at its next spawn — a resume — like every other pair)
        const launchIdle = B.pairsIdleMs(pairs) ?? idleMs();
        rec.idleMs = launchIdle;
        // lane headless-fallback: THE DISPLAY IS A FACT — probed now, here; a window asked of a machine with no desktop
        // session launches headless under the planned config (`configured` names it on this and every later call of the
        // record), and the fact rides the record to every surface and to the agent
        // lane hooks-create H5: the window PREFERENCE rides too — unset is resolved against the display just probed (no desktop
        // + Xvfb ⇒ the hidden-window rung), never at the spawn that composed the pairs' config
        rec.display = await displays.factFor({ baseFile: env0[VERBS.CONFIG_KEY] || ephemeralConfigFor(env0), prev: prev && prev.display, mode: noDisplayMode(), preference: headedSetting() });
        sayDisplay(rec.display, `ephemeral ${profileId} "${p.label}"`);
        rec.cli = await cliNow(); // verify r2 (H1): the CLI this launch runs — every later call of this browser runs that version
        cliKeptByLaunch(rec); // B-7a30: the keeper's own act — that file is the answer, kept now
        if (!commitSync()) { rec.state = 'failed'; rec.endedAt = now(); rec.lastError = LAUNCH_NOT_ON_DISK; commit(); throw namedError('launch_not_on_disk', LAUNCH_NOT_ON_DISK); }   // the census cure (finding 6): the stamped lineage on disk before Chrome
        const r = await rt.launch(null, { idleMs: launchIdle, headed: null, extraEnv: { ...env0, ...rec.display.env } });
        if (!r.ok) {
          const text = (r.stderr || r.error || r.stdout || '').trim().slice(0, 300);
          const lr = lockRefusalAfterLaunch(p, prev); // verify r2 (F1): its kept directory taken meanwhile ⇒ said by name
          rec.state = 'failed'; rec.endedAt = now(); rec.lastError = lr ? lr.error : ((B.launchFatalOf(r.stderr || r.error || r.stdout, { lineOf: ownConfigLine }) || {}).error || `the browser did not start: ${text}`); // lane browser-tmpdir-socket-length: a known FATAL named with its fix (lane engine-args-string: + the driver's refusal of our config)
          commit();
          // verify r3 (F3): said in the journal on this row too (the named start's sentence; the ephemeral start said nothing)
          if (lr) { log.warn?.(`[browser] ephemeral ${profileId} "${p.label}": NOT started — ${lr.tookOver ? `a lock of this machine's previous name ${lr.tookOver} reached the launch (taken over now)` : 'the directory was taken while launching'}: ${lr.error}`); throw namedError(lr.code, lr.error, lr.holderPid ? { holderPid: lr.holderPid } : {}); }
          throw namedError(r.code === 'browser_cli_unconfirmed' ? r.code : /binary_absent/.test(text) ? 'binary_absent' : 'launch_failed', rec.lastError); // B-7a30: the door's refusal keeps its name
        }
        try { info = await rt.info(null, { extraEnv: env0 }); } catch { info = null; }
      }
      if (!info || !info.active) {
        rec.state = 'failed'; rec.endedAt = now(); rec.lastError = 'the daemon did not report itself active after open';
        commit();
        throw namedError('launch_failed', rec.lastError);
      }
      rec.pid = info.pid; rec.starttime = await launchStart(info.pid); rec.socketDir = info.socketDir;
      if (info.pid && rec.starttime == null && F.startsReadable()) { rec.state = 'failed'; rec.endedAt = now(); rec.lastError = unrecordedLaunch(info.pid); commit(); throw namedError('launch_failed', rec.lastError); }
      // verify r2 (H1): an ADOPTED daemon runs the CLI it says; a launched one is cross-checked against its own answer
      if (adopted || !rec.cli || (info.version && info.version !== rec.cli.version)) { const cd = cliOfDaemon(info); rec.cli = cd || rec.cli || null; if (cd && cd.path) cliKeptByLaunch(rec); } // B-7a30: the daemon's own program (/proc/<pid>/exe) is its answer
      captureBrowser(rec, p.dir || null); // r2 M1: the browser it launched (the binary's temp dir on rung N) — ended if its daemon dies
      rec.state = 'ready';
      if (adopted) rec.adoptedAt = now();
      p.lastUsedAt = now(); p.lastBackend = 'chromium';
      commit();
      keptNote('start', p); // lane browser-resume: its kept entry is live now (the tabs it opens are noted as they move)
      log.log?.(`[browser] ephemeral ${profileId} "${p.label}" ${adopted ? 'ADOPTED (a daemon was already running under its pairs)' : 'started'} (${why}, ${ns}): daemon pid ${rec.pid ?? '?'}${rec.starttime != null ? '' : ' (starttime unreadable — never signalled by pid)'}${rec.cli && rec.cli.version ? ', ' + VERBS.CLI_PACKAGE + ' ' + rec.cli.version : ''}`); // verify r3 (Y1): the CLI this daemon runs, named where the record changes (a relaunch after a daemon's death runs the current one)
      // lane H: a first-class holder — the recorder arms its tap on this
      // browser before the verb that started it runs (bounded), exactly as a
      // named profile's start / attach does
      await settleArming(emitLease({ kind: 'browser-ready', profileId, why, local: true, adopted, ...ephEventFields(profileId) }));
      return browserView(rec);
    })();
    starting.set(profileId, p0);
    return p0.finally(() => { if (starting.get(profileId) === p0) starting.delete(profileId); dropPlaceHold(profileId); }); // r2 (N3): the start settled — its kernel hold ends
  }
  /**
   * takeover C3 (§5.1): THE ENTRY — a conversation's first page verb with no
   * attachment. Reuses the record this browser key owns (a resume carries the
   * same key ⇒ the same record; a fork's new key ⇒ a new one; a child key ⇒
   * its own), keeps ONE lease aliased `ephemeral` (never an attachment: no
   * handle, `profile_required` unaffected), then starts it. The pairs are the
   * session's spawn pairs, exactly — refused `not_managed` when they do not
   * name this conversation's browser.
   */
  async function ensureEphemeral({ browserKey, sessionId = null, envPairs = null, sessionName = '', variant = null, resume = null } = {}) {
    refuseIfHeld('a conversation\'s browser');   // the B-f276 remainder: refused by name while the registry is held (nothing minted, nothing written)
    // lane browser-resume B: `resume` = 'user' (the Resume button: NOT a command — no verb stamps, the tabs reopen) |
    // 'agent' (`vibespace-browser resume`: a command that asks for its kept tabs) | null (a page verb's start)
    ensureLoaded();
    const bk = String(browserKey || '');
    if (!B.isBrowserKey(bk) && !B.isChildKey(bk)) throw namedError('bad-request', 'a managed ephemeral browser needs a browser key');
    const v = B.ephemeralPairsVerdict(envPairs, bk);
    if (!v.ok) throw namedError('not_managed', v.why);
    const find = () => reg.profiles.find((x) => isEph(x) && x.owner.id === bk) || null;
    let p = find();
    if (p && retiring.has(p.id)) { try { await retiring.get(p.id); } catch { /* its own log */ } p = find(); }
    let created = false;
    // lane browser-resume (§3.9): rung D's generated config names the conversation's OWN kept directory — accepted only
    // when it is the one named by this key (a child's config names none, D6)
    const ownDir = B.ephemeralDirOf(v.pairs, { configProfile: ownKeptDirOf(bk, v.pairs) });
    if (!p) {
      p = B.newProfileRecord({ id: mintId(), label: B.ephemeralLabel(sessionName), dir: ownDir, ephemeral: true, owner: { kind: 'conversation', id: bk }, now: now() });
      { const pc = policyChoice(); if (pc) p.browser = pc; } // lane engine-plugin: the default policy, read at this browser's first start and WRITTEN here
      reg.profiles.push(p);
      created = true;
    } else if ((p.dir || null) !== (ownDir || null) && !B.isLiveBrowser(reg.browsers[p.id]) && !starting.has(p.id)) {
      // a record from before the kept directory (or a respawn onto another rung): its NEXT launch runs where its pairs say
      log.log?.(`[browser] ${bk}: its browser's directory is now ${ownDir || '(the binary\'s own temporary one)'} (was ${p.dir || 'none'}) — from its next start`);
      p.dir = ownDir || null;
    }
    let l = B.findLease(reg.leases, p.id, bk);
    if (!l) { l = { profileId: p.id, browserKey: bk, sessionId: sessionId || null, targetId: null, since: now(), input: 'agent', viewers: 0, carrierLostAt: null, alias: 'ephemeral' }; reg.leases.push(l); }
    else { if (sessionId && l.sessionId !== sessionId) l.sessionId = sessionId; l.carrierLostAt = null; }
    if (l.sessionId) ephSessions.set(p.id, l.sessionId); // VERIFY r1 L2
    ephPairs.set(p.id, v.pairs);
    // lane browser-resume B: the user's Resume is NOT a command — the release clock and the pin's "applied" stamp are the
    // agent's verbs' alone (a Resume the user pressed never tells the fact "the agent used its browser now")
    if (resume !== 'user') {
      turnIdleSince.delete(p.id); // MULTIVIEW B-325a: a verb is activity — the release clock starts again at the next idle turn
      p.verbBeforeAt = p.lastVerbAt || 0; // B-346d law 2: the verb before this one — the last a daemon gone before THIS verb served
      p.lastVerbAt = now(); // lane S2: a pin set before this verb has applied now (the browser fact's `pin_pending` ends here)
    }
    commit();
    if (created) log.log?.(`[browser] ${bk}${sessionId ? ' (' + sessionId + ')' : ''}: managed ephemeral browser ${p.id} "${p.label}" recorded (rung ${variant || '?'}, ns ${B.sessionNameFor(bk)})`);
    const rec0 = reg.browsers[p.id] || null;
    const wasReady = !!(rec0 && rec0.state === 'ready');
    // lane browser-resume B: what the conversation KEPT, read BEFORE the start (its start moves the kept tabs aside)
    const ks = B.isBrowserKey(bk) ? keptStore() : null;
    let entry0 = null; try { entry0 = ks ? ks.get(bk) : null; } catch { entry0 = null; }
    const browser = await start(p.id, { why: resume === 'user' ? 'resumed by the user' : (created ? 'first verb' : 'verb') });
    // lane H: a verb on a browser that was ALREADY live (no browser-ready this
    // time — a server restart adopted it, or its tap ended) still asks the
    // seam's listeners to hold a tap on it before the command runs
    if (resume !== 'user' && wasReady && reg.browsers[p.id] === rec0 && rec0.state === 'ready') await settleArming(emitLease({ kind: 'verb', profileId: p.id, local: true, ...ephEventFields(p.id) }));
    ensureTimer();
    const kept = ks && entry0 ? await keptAtStart(p, entry0, { started: !wasReady, resume }) : null;
    return { profile: pview(p), browser, lease: leaseView(l), created, ...(kept ? { kept } : {}) };
  }
  /**
   * lane browser-resume B (§3.9, the owner's ruling 2): WHAT A START DOES WITH THE KEPT BROWSER, and what the command is
   * told. `entry0` = the kept entry read before the start. A browser this call STARTED reopens its kept tabs when D2 says
   * so (an automatic stop's `restore`), when the user wrote a restore (Resume / hand back), or when it was ASKED to
   * (`resume`: the user's button, the agent's `vibespace-browser resume`); a deliberate stop's tabs stay waiting and the
   * answer says so (`kept`). A user restore is consumed by the AGENT's next command (told once); the user's own Resume
   * writes one. → `{kind: 'restored'|'resumed'|'kept', …}` | null (nothing to say).
   */
  // ONE reopen per start of a browser: two commands (or a command and the user's Resume) that raced into the same start
  // both read the kept entry before it — only the first reopens its tabs (the start's own instant is the token; the other
  // one says nothing), never a doubled set of tabs
  const reopenedFor = new Map(); // browser key → the startedAt of the start whose tabs were reopened
  async function keptAtStart(p, entry0, { started = false, resume = null } = {}) {
    const bk = p.owner.id;
    const ks = keptStore();
    if (!ks) return null;
    const r0 = entry0.restore || null;
    let out = null;
    const rec = reg.browsers[p.id] || null;
    const token = rec ? Number(rec.startedAt) || 0 : 0;
    if (started && token && reopenedFor.get(bk) === token) started = false; // another caller of this very start reopens them
    if (started && token) reopenedFor.set(bk, token);
    if (started) {
      const want = !!resume || !!(r0 && (r0.mode === 'auto' || r0.by === 'user'));
      const { tabs, currentIndex } = KB.resumeTabsOf(entry0);
      if (want && tabs.length) {
        const plan = KB.resumePlan({ tabs, currentIndex, intoCurrent: true });
        const res = await restoreTabs(p, plan, { boundMs: resume === 'user' ? KB.RESUME_BOUND_USER_MS : KB.RESUME_BOUND_AGENT_MS, seenBy: resume === 'user' ? 'the user\'s Resume' : (resume === 'agent' ? 'the agent\'s resume' : 'the start') });
        try { ks.afterReopen(bk, res.skipped.filter((x) => x.late)); } catch (e) { log.warn?.(`[browser] ${bk}: the reopened tabs were not noted — ${e && e.message}`); }
        out = { kind: 'restored', why: entry0.stoppedWhy || null, opened: res.opened.length, tabs: res.opened.map((x) => ({ url: x.url, title: x.title })), skipped: res.skipped.map((x) => ({ url: x.url, why: x.why })), current: res.current };
      } else if (tabs.length) out = { kind: 'kept', why: entry0.stoppedWhy || null, tabs: tabs.length, logins: entry0.kind === 'full' }; // B-7a30: «its logins» said only for a folder the last check found
    }
    if (resume === 'user') {
      // the user's Resume: the agent's next command is told (sticky until then) — never a note of his (he wrote none)
      const opened = out && out.kind === 'restored' ? out.tabs : [];
      const cur = out && out.current ? opened.findIndex((x) => x.url === out.current.url) : -1;
      try { ks.setRestore(bk, { tabs: opened.map((x, i) => ({ ...x, active: i === cur })), handedBack: false }); } catch (e) { log.warn?.(`[browser] ${bk}: the Resume was not noted for the agent — ${e && e.message}`); }
      notify();
      return out;
    }
    // the AGENT's command: a restore the user wrote is told now, once; an automatic one is gone with the reopen
    if (r0 && r0.by === 'user') {
      let r = null; try { r = ks.consumeRestore(bk); } catch { r = null; }
      if (r) {
        const live = (() => { try { const l = ks.latestOf(bk); return l ? KB.keptTabsOf(l.tabs) : null; } catch { return null; } })();
        const tabs = out && out.kind === 'restored' ? out.tabs.map((x) => ({ ...x, active: !!(out.current && x.url === out.current.url) })) : (live && live.length ? live : (r.tabs || []));
        out = { ...(out || {}), kind: 'resumed', handedBack: !!r.handedBack, drove: !!r.drove, note: r.note || '', tabs, currentIndex: KB.currentIndexOf(tabs) };
        notify();
      }
    } else if (r0 && started) { try { ks.consumeRestore(bk); } catch { /* the store says its own */ } notify(); }
    return out;
  }
  /**
   * lane browser-resume B: REOPEN a plan's tabs in a conversation's own browser, under its own pairs (never another
   * namespace), one step at a time, bounded (`boundMs` — what is not reached is named and stays waiting); then the tab
   * that was on show is switched back to by its CDP target id (the step's own `--json` answer — measured on 0.38.1).
   * A failed step is named (its url + the binary's reason) and the rest go on. Never throws.
   */
  async function restoreTabs(p, plan, { boundMs = KB.RESUME_BOUND_AGENT_MS, seenBy = 'a resume' } = {}) {
    const env = pairsEnv(pairsOf(p.id) || []);
    const t0 = now();
    const opened = [], skipped = [], ids = [];
    for (const step of plan.steps) {
      if (now() - t0 > boundMs) { skipped.push({ url: step.url, title: step.title, why: 'not reached in time', late: true }); continue; }
      let r = null;
      try { r = await rt.exec(null, step.argv, { extraEnv: env, timeout: KB.RESUME_STEP_MS }); } catch (e) { r = { ok: false, error: String(e && e.message) }; }
      if (r && r.ok) { const id = KB.targetIdOf(r.stdout); ids[step.i] = id; opened.push({ url: step.url, title: step.title, targetId: id }); }
      else skipped.push({ url: step.url, title: step.title, why: KB.stepWhyOf(r) });
    }
    const cs = plan.current >= 0 ? plan.steps[plan.current] : null;
    let current = null;
    if (cs && ids[cs.i]) {
      current = { url: cs.url, title: cs.title };
      // a `tab new` makes the new tab the active one — the tab that was on show is switched back to by its target id
      if (opened.length > 1 && plan.current !== plan.n - 1) {
        let r = null; try { r = await rt.exec(null, ['tab', ids[cs.i], '--json'], { extraEnv: env, timeout: KB.RESUME_STEP_MS }); } catch (e) { r = { ok: false, error: String(e && e.message) }; }
        if (!(r && r.ok)) { log.log?.(`[browser] ${p.id}: the tab that was on show could not be switched back to at ${seenBy} (${KB.stepWhyOf(r)})`); current = opened.length ? { url: opened[opened.length - 1].url, title: opened[opened.length - 1].title } : null; }
      }
    } else if (opened.length) current = { url: opened[opened.length - 1].url, title: opened[opened.length - 1].title };
    log.log?.(`[browser] ${p.id} "${p.label}": ${seenBy} reopened ${opened.length} of ${plan.n} kept tab(s) in ${Math.round((now() - t0) / 100) / 10} s${skipped.length ? ` — not reopened: ${skipped.map((x) => `${T.urlForLog(x.url)} (${x.why})`).join('; ')}` : ''}`); // the journal names origin + path, never a query
    return { opened, skipped, current };
  }
  /** lane browser-resume B: the named profile a conversation's kept directory BECAME (an adopt in place, `new --adopt`) — its
   *  label, else null. A Resume of it is refused `resume_adopted` (attach the profile instead). */
  function adoptedLabelOf(bk) {
    // verify F1: by the directory's REAL identity (a `//` / symlink spelling of the kept dir is the same directory), fail
    // CLOSED — a profile whose directory cannot be resolved counts (a Resume never relaunches over a profile's logins)
    try { const d = keptDirFor(bk); const p = named().find((x) => x.dir && !x.host && (B.sameDir(x.dir, d) || F.sameRealDir(x.dir, d) !== false)); return p ? p.label : null; } catch { return null; }
  }
  /**
   * lane browser-resume B (§3.9, the owner's ruling 2): RESUME a conversation's OWN browser — the Resume button (live view,
   * the chat's end card, the Agent browser panel: `by:'user'`) or the agent's `vibespace-browser resume` (`by:'agent'`).
   * The key is the SESSION's (the route resolves it; never a key a client names), so the directory is the conversation's
   * own (`data/browser-profiles/<its key>`) and only its: a helper's browser is refused `child_not_kept`, a directory
   * adopted into a named profile `resume_adopted`, nothing kept `not_kept`. A stopped browser is STARTED (the same start a
   * command runs: the caps, the directory's lock, the display) and its kept tabs reopened; a running one ⇒ `already` for
   * the user (the view just reconnects), and for the agent its WAITING tabs (a deliberate stop's) reopen as new tabs.
   * → `{ok, already, kept}` (kept = keptAtStart's outcome) — refusals thrown by name.
   */
  const resumingWaiting = new Set(); // browser keys whose waiting tabs a `resume` is reopening right now
  async function resumeFor({ browserKey, sessionId = null, envPairs = null, sessionName = '', variant = null, by = 'user' } = {}) {
    ensureLoaded();
    const bk = String(browserKey || '');
    const who = by === 'agent' ? 'agent' : 'user';
    if (B.isChildKey(bk)) { const v = KB.resumeVerdict({ child: true }); throw namedError(v.code, v.error); }
    if (!B.isBrowserKey(bk)) throw namedError('bad-request', 'a resume needs the conversation\'s browser key');
    const ks = keptStore();
    // B-7a30 r2: an ACT reads its kept folder through the store's door — asked fresh, bounded (5 s), refused by name
    // (`kept_unconfirmed`) past the bound: never «resumed» over a folder nobody confirmed. A user's Resume of a browser that RUNS
    // only reconnects the view (no folder is read), so it is not asked; the agent's reopen of its waiting tabs is.
    const e00 = ephemeralFor(bk);
    const reconnect = who === 'user' && !!(e00 && (e00.live || starting.has(e00.profileId)));
    // (the door runs BEFORE the adopted label is resolved: adoptedLabelOf reads real paths synchronously, so on a disk that
    // hangs the act is refused by name, bounded, and the loop is never held — its verdict's should)
    if (ks && !reconnect && typeof ks.checkThere === 'function' && typeof ks.has === 'function' && ks.has(bk)) await ks.checkThere(bk);
    let entry0 = null; try { entry0 = ks ? ks.get(bk) : null; } catch { entry0 = null; }
    const e0 = ephemeralFor(bk);
    const running = !!(e0 && (e0.live || starting.has(e0.profileId)));
    // (an in-place `new --adopt` of its own directory registered it as a named profile — whatever the kept entry says, the
    // directory is that profile's now: never launched as the conversation's own again)
    const v = KB.resumeVerdict({ entry: entry0, sessionLive: true, running, adoptedLabel: adoptedLabelOf(bk) });
    if (!v.ok) { log.log?.(`[browser] ${bk}: resume (${who}) refused ${v.code}`); throw namedError(v.code, v.error, v.label ? { label: v.label } : {}); }
    if (v.already) {
      if (who === 'user') return { ok: true, already: true, kept: null };
      // the agent's `resume` on a running browser: the tabs still WAITING from a deliberate stop open as NEW tabs (the page
      // it is on is never navigated away); nothing waiting ⇒ refused by name (its browser runs with what it has)
      const w = entry0 && entry0.waiting && Array.isArray(entry0.waiting.tabs) ? KB.keptTabsOf(entry0.waiting.tabs) : [];
      if (!w.length) throw namedError('not_kept', 'nothing is waiting to be reopened — your browser runs with the tabs it has (`vibespace-browser tab list`)');
      // one reopen of the waiting tabs at a time (two `resume`s at once never open them twice)
      if (resumingWaiting.has(bk)) throw namedError('not_kept', 'the waiting tabs are being reopened by another `resume` right now — nothing more to reopen');
      resumingWaiting.add(bk);
      const p = profile(e0.profileId);
      let res;
      try {
        res = await restoreTabs(p, KB.resumePlan({ tabs: w, currentIndex: KB.currentIndexOf(w), intoCurrent: false }), { boundMs: KB.RESUME_BOUND_AGENT_MS, seenBy: 'the agent\'s resume' });
        try { ks.afterReopen(bk, res.skipped.filter((x) => x.late)); } catch { /* the store says its own */ }
      } finally { resumingWaiting.delete(bk); }
      notify();
      return { ok: true, already: true, kept: { kind: 'restored', why: entry0.waiting.stoppedWhy || null, opened: res.opened.length, tabs: res.opened.map((x) => ({ url: x.url, title: x.title })), skipped: res.skipped.map((x) => ({ url: x.url, why: x.why })), current: res.current } };
    }
    if (!Array.isArray(envPairs) || !envPairs.length) throw namedError('not_managed', 'this session has no spawn pairs recorded for its own browser — resume the conversation (Terminate → Resume), then its browser');
    const r = await ensureEphemeral({ browserKey: bk, sessionId, envPairs, sessionName, variant, resume: who });
    log.log?.(`[browser] ${bk}${sessionId ? ' (' + sessionId + ')' : ''}: its own browser RESUMED by the ${who}${r.kept && r.kept.kind === 'restored' ? ` — ${r.kept.opened} tab(s) reopened` : ''}`);
    return { ok: true, already: false, browser: r.browser, profile: r.profile, kept: r.kept || null };
  }
  /**
   * lane browser-resume B: RESUME a NAMED profile this conversation LEASES (the live view's Resume on an attachment's
   * stopped browser). The lease is the precondition (never widened here: `by:'resume'` never adds the conversation to
   * "Who can use it") and THE ONE ADMISSION is attach's `decideAttach` — a conversation the list no longer admits is
   * refused `not_owner` by name (a pin never authorizes); the browser is started the way a command starts it (the caps,
   * the lock, the display), its lease's tab re-bound, then re-opened at the lease's last page (a web page only) under the
   * lease's own session — never another conversation's tab. A running browser ⇒ `already` (the view reconnects).
   */
  async function resumeAttachment({ profileId, browserKey, sessionId = null, taskIds = [], groupsUnreadable = false } = {}) {
    ensureLoaded();
    const bk = String(browserKey || '');
    const p = profile(profileId);
    if (!p || isEph(p)) throw namedError('not-found', 'that browser is not one of this conversation\'s');
    const l0 = B.findLease(reg.leases, p.id, bk);
    if (!l0) throw namedError('not_attached', `this conversation no longer holds "${p.label}" — pick it again for this conversation (Session properties → Agent browser)`);
    if (B.isLiveBrowser(reg.browsers[p.id]) || starting.has(p.id)) return { ok: true, already: true };
    const url = KB.keptUrl(l0.lastUrl || '');
    const r = await attach({ profileId: p.id, browserKey: bk, sessionId, taskIds, groupsUnreadable, by: 'resume' });
    let reopened = null;
    if (url) {
      let x = null;
      try {
        if (r.mediated) x = await rt.exec(null, [...(r.pinTab ? ['--pin-tab'] : []), 'open', url], { extraEnv: pairsEnv(r.env), timeout: KB.RESUME_STEP_MS });
        else { const o = await leaseCliOpts(p.id, bk); x = o ? await rt.exec(nsOf(p.id), [...(r.pinTab ? ['--pin-tab'] : []), 'open', url], { ...o, timeout: KB.RESUME_STEP_MS }) : { ok: false, error: noCdpError(p) }; }
      } catch (e) { x = { ok: false, error: String(e && e.message) }; }
      reopened = { url, title: '', ok: !!(x && x.ok), why: x && x.ok ? null : KB.stepWhyOf(x) };
    }
    log.log?.(`[browser] ${bk}${sessionId ? ' (' + sessionId + ')' : ''}: "${p.label}" (${p.id}) RESUMED by the user${reopened ? ` — its tab ${reopened.ok ? 'reopened at' : 'NOT reopened at'} ${T.urlForLog(url)}${reopened.ok ? '' : ' (' + reopened.why + ')'}` : ''}`);
    return { ok: true, already: false, browser: r.browser, reopened };
  }
  /**
   * lane browser-resume B: "HAND BACK AND CONTINUE" — the keeper's half (the announcer stashes + cards; the route answers).
   * The browser named is the conversation's own (`profileId` null) or an attachment it LEASES (the lease is the admission —
   * never a pin, never another conversation's). A takeover on it ENDS here with cause `continue` (the cycle closes: what it
   * interrupted rides the frame, the announcer delivers nothing). The tabs: the own browser's live list (a CDP read merged
   * with the relay's order; its kept list when it is not running); an attachment's = ITS OWN tab only (the page the user
   * left, never the other tabs of a shared Chrome — another holder's pages are not this conversation's to be told).
   * → `{ok, own, tabs, currentIndex, rerun, tookOver}` | `{ok:false, code, error}`.
   */
  async function continueState({ browserKey, profileId = null, sessionId = null } = {}) {
    ensureLoaded();
    const bk = String(browserKey || '');
    if (!B.isBrowserKey(bk)) return { ok: false, code: 'not_yours', error: 'a helper\'s browser is handed back by the helper\'s own view — only the conversation\'s browsers here' };
    let own = true, lease = null;
    if (profileId) {
      const p = profile(profileId);
      lease = p && !isEph(p) ? B.findLease(reg.leases, profileId, bk) : null;
      if (!lease) return { ok: false, code: 'not_yours', error: 'this conversation does not hold that browser — hand back from its own live view' };
      own = false;
    }
    const k = inputKey(bk, profileId || null);
    const s0 = inputs.get(k) || null;
    const url0 = s0 && s0.url ? s0.url : (lease && lease.lastUrl) || '';
    let rerun = [], userActs = [], tookOver = false;
    if (s0 && s0.input === 'user') {
      const h = handback({ browserKey: bk, profileId: profileId || null, viewerId: null, cause: 'continue', url: url0, sessionId });
      if (!h.ok) return h;
      rerun = h.rerun || []; userActs = h.userActs || []; tookOver = true;
    }
    let tabs = [];
    if (own) {
      const e = ephemeralFor(bk);
      const p = e ? profile(e.profileId) : null;
      const rec = p ? reg.browsers[p.id] : null;
      const ks = keptStore();
      if (p && rec && rec.state === 'ready') {
        const rows = await captureKeptTabs(p, rec, 'the hand-back');
        const l = !rows && ks ? ks.latestOf(bk) : null;
        tabs = KB.keptTabsOf(rows || (l ? l.tabs : []));
      } else if (ks) { try { tabs = KB.resumeTabsOf(ks.get(bk)).tabs; } catch { tabs = []; } }
    } else {
      const u = KB.keptUrl(url0);
      if (u) tabs = [{ url: u, title: '', active: true }];
    }
    log.log?.(`[browser] ${bk}${profileId ? ' on ' + profileId : ' (its own browser)'}: handed back for the next turn by the user (${tabs.length} tab(s)${tookOver ? ', the takeover ended' : ''}${rerun.length ? `, to re-run: ${rerun.join(', ')}` : ''}) — nothing delivered now`);
    return { ok: true, own, tabs, currentIndex: KB.currentIndexOf(tabs), rerun, userActs, tookOver };
  }
  /** lane browser-resume B: the hand-back's restore on the conversation's OWN kept entry — what its next command is told
   *  (the stash carried the note: `handedBack` ⇒ the command's note names the current tab only; a stash that could not
   *  take the words ⇒ the note rides the command's answer instead — never lost, never said twice). */
  function noteContinue({ browserKey, tabs = [], note = '', stashed = true, drove = false } = {}) {
    const ks = keptStore();
    const bk = String(browserKey || '');
    if (!ks || !B.isBrowserKey(bk) || !ks.has(bk)) return null;
    let r = null; try { r = ks.setRestore(bk, { tabs, note: stashed ? '' : note, handedBack: true, drove: !!drove }); } catch (e) { log.warn?.(`[browser] ${bk}: the hand-back was not noted for the agent's next command — ${e && e.message}`); }
    notify();
    return r;
  }

  // ── lane browser-resume C (§3.9, the owner's ruling 3): TABS — whose tab it is, the agent's own tab verbs, the user's row ──
  // MEASURED on 0.38.1 + Chrome 154 (PURE src/browser-tabs.js's header): on a shared profile's ONE Chrome every session
  // lists every page and `tab close` closes any tab — the binary is no fence. The fence is the PURE ownership over ONE CDP
  // read + the holders (the user first, then each lease's ROOTS: its tabs it provably opened or sat on while nobody held
  // them); every act here is judged BEFORE it runs, and runs under the session of the one who owns the tab.
  /** A browser's page targets with their openers — ONE raw CDP read (the injectable browse-yourself reads). null = unread. */
  async function tabTargetsOf(cdpUrl) {
    if (!cdpUrl) return null;
    let r = null;
    try { r = await (typeof readTargets === 'function' ? readTargets(cdpUrl) : require('./browser-viewport.js').browserTargets(cdpUrl)); } catch (e) { r = { ok: false, error: String(e && e.message) }; }
    return r && r.ok && Array.isArray(r.targets) ? r.targets : null;
  }
  /** One session's own `tab list --json` rows (every page, `active` = its tab) — null when it did not answer. */
  async function tabListUnder(ns, opts) {
    let r = null;
    // 2.369.199 integration (lane site-reset × lane browser-resume C): a session whose verb a navigation loop cut keeps its
    // daemon waiting until the binary's own 25 s timeout (site-reset's measurement on 0.38.1) — the list waits it out (30 s)
    // instead of calling the tabs unreadable, as the binary's own `tab` verb did before the server took the shared tabs
    try { r = await rt.exec(ns, ['tab', 'list', '--json'], { timeout: 30000, ...opts }); } catch (e) { r = { ok: false, error: String(e && e.message) }; }
    const d = r && r.ok && r.json && r.json.data;
    return d && Array.isArray(d.tabs) ? d.tabs.filter((x) => x && typeof x === 'object' && TBS.TARGET_ID_RE.test(String(x.targetId || ''))) : null;
  }
  /** THE HOLDERS of a profile's browser, IN ORDER: the user's own holder first (his tab is never a conversation's), then the
   *  conversations' leases by age, each with its ROOTS (+ `activeFor[key]`: its session's current tab where known). A
   *  CONVERSATION reader (the roots are the leases'); his row is added from `humans`, never a lease. */
  function tabHoldersOf(profileId, activeFor = {}) {
    const out = [];
    const h = humans.get(profileId);
    if (h) out.push({ key: h.key, roots: [h.ownTab, ...(Array.isArray(h.adopted) ? h.adopted : [])].filter(Boolean) });
    const ls = reg.leases.filter((l) => l.profileId === profileId).sort((a, b) => (Number(a.since) || 0) - (Number(b.since) || 0));
    for (const l of ls) out.push({ key: l.browserKey, roots: [...(l.targetId ? [l.targetId] : []), ...(Array.isArray(l.tabRoots) ? l.tabRoots : [])], active: activeFor[l.browserKey] || null });
    // B-e674 unit 2's cure (r683 (b)): the tabs the person's own input made (the birth stamp) claim AFTER every lease's roots — a
    // stamp never outranks a holder's provable claim; theirs still, never an orphan, when no holder roots them
    const mine = personRootsOf(profileId);
    if (mine.length) out.push({ key: h ? h.key : HM.humanKeyFor(profileId), roots: mine });
    return out;
  }
  /** A lease's tabs are STICKY: what it holds now becomes its roots (a popup whose opener closes stays its own) — written
   *  only when the set changed, and quietly (the digest never shows roots: nothing to broadcast). */
  // THE .229 MIRROR (test-jobs-browser F11): a root stamped while the read was in flight (a window opened between the CDP
  // read and the holders read) was pruned as gone — the job's lease kept no root, its finalize closed nothing, its window
  // stayed open. `before` = the roots as they stood when the read began (rootsAt): only those may be pruned by it.
  function rootsAt(profileId, browserKey) { const l = B.findLease(reg.leases, profileId, String(browserKey || '')); return new Set((Array.isArray(l && l.tabRoots) ? l.tabRoots : []).map((x) => String(x).toUpperCase())); }
  function keepTabRoots(profileId, browserKey, own, before = null) {
    if (!(own instanceof Set)) return;
    const l = B.findLease(reg.leases, profileId, browserKey);
    if (!l) return;
    const seen = (x) => !(before instanceof Set) || before.has(String(x).toUpperCase()); // a root newer than the read is not its to prune
    const next = TBS.cleanRoots([...(Array.isArray(l.tabRoots) ? l.tabRoots : []).filter((x) => own.has(String(x).toUpperCase()) || !seen(x)), ...own]);
    if (JSON.stringify(next) === JSON.stringify(TBS.cleanRoots(l.tabRoots))) return;
    l.tabRoots = next;
    save();
  }
  const CURRENT_TAB_READ_MS = 5000; // B-21cc: the current-tab read's bound (bootstrapTabRoot's own)
  /** B-21cc (the coordinator's r2491; report fb-03ae550a21): THE CONVERSATION's CURRENT TAB on a browser it holds a lease on — the
   *  row its OWN session's `tab list --json` marks active (the tab its `get url` and `snapshot` read), through the lease's own url,
   *  exactly as the agent's `tab` fence reads it (agentTabAct). ONE row marked, or refused BY NAME (`current_tab_unreadable`):
   *  never a guess. Its caller (the vault fill) asks only when the conversation already has a tab of its own in scope: a
   *  never-used session's `tab list` would bind a new tab (measured). An EPHEMERAL browser never reaches here on the vault fill's
   *  road (the login-channel law refuses it first: browser-mediation leaseRoadVerdict, ephemeral ⇒ no mode); asked anyway, it is
   *  refused by name (its own list would be read through its pairs, as userTabAct reads it). On a MEDIATED lease (the fill's road)
   *  the list comes through the proxy's scoped url, so it holds only this conversation's tabs. → { ok, targetId } | { ok: false, code, error } */
  async function currentTabOf({ profileId = '', browserKey = '', ephemeral = false } = {}) {
    ensureLoaded();
    const bk = String(browserKey || '');
    // round w41hvnm5h: a refusal a retry cannot cure names its door instead of «try again»
    const no = (why, next = 'try again') => ({ ok: false, code: 'current_tab_unreadable', error: `VibeSpace could not read which tab this conversation is on (${why}) — nothing was filled; ${next}` });
    const p = profile(String(profileId || ''));
    if (!p) return no('no such browser');
    if (ephemeral || isEph(p)) return no('a browser of its own is not read on this road');
    const rec = reg.browsers[p.id];
    if (p.host || !B.isLiveBrowser(rec) || !isLocalRec(rec)) return no('the browser is not running on this machine', `start it (\`vibespace-browser use ${p.label || p.id}\`), then fill again`);
    if (!B.findLease(reg.leases, p.id, bk)) return no('this conversation holds no lease on it', `\`vibespace-browser use ${p.label || p.id}\` first`);
    const o = await leaseCliOpts(p.id, bk);
    if (!o) return no('the browser answered no CDP url');
    const rows = await tabListUnder(nsOf(p.id), { ...o, timeout: CURRENT_TAB_READ_MS });
    if (!rows) return no('its tab list did not answer');
    const act = rows.filter((x) => x && x.active);
    if (act.length !== 1) return no(act.length ? 'more than one tab is marked current' : 'no tab is marked current');
    return { ok: true, targetId: String(act[0].targetId).toUpperCase() };
  }
  /** A lease's FIRST root, learned after its first command (the audit route asks): the tab its session is on — a session's
   *  first command binds a NEW tab of its own (measured), so that tab is its; judged like every active (the weakest claim:
   *  never a tab another holder roots, never what his tab opened). Only while the lease has no root (once per lease); a
   *  never-used session is never asked (a `tab list` would bind a tab of its own — measured). */
  async function bootstrapTabRoot(profileId, browserKey) {
    ensureLoaded();
    const p = profile(profileId);
    const rec = p ? reg.browsers[p.id] : null;
    if (!p || isEph(p) || isMediated(p) || p.host || !B.isLiveBrowser(rec) || !isLocalRec(rec)) return null;
    const l = B.findLease(reg.leases, p.id, String(browserKey || ''));
    if (!l || l.targetId || (Array.isArray(l.tabRoots) && l.tabRoots.length)) return null;
    const before = rootsAt(p.id, l.browserKey);
    const o = await leaseCliOpts(p.id, l.browserKey);
    if (!o) return null;
    const rows = await tabListUnder(nsOf(p.id), { ...o, timeout: 5000 });
    const act = rows ? String((rows.find((x) => x.active) || {}).targetId || '').toUpperCase() : '';
    const targets = act ? await tabTargetsOf(rawCdpOf(p.id, o)) : null;
    if (!targets) return null;
    const own = TBS.ownSetOf(TBS.tabOwners({ targets, holders: tabHoldersOf(p.id, { [l.browserKey]: act }) }), l.browserKey);
    keepTabRoots(p.id, l.browserKey, own, before);
    return own ? [...own] : null;
  }
  /** The user's tab act goes on the takeover's open cycle — said to the agent at the handback (never a delivery of its own). */
  /** → the record as written (its instant), or null when no takeover cycle is open — `unnoteUserTabAct` takes it back. */
  function noteUserTabAct(browserKey, profileId, act) {
    const k = inputKey(browserKey, profileId || null);
    if (!cycles.has(k)) return null;
    const rec = { ...act, at: now() };
    cycles.set(k, INT.noteUserAct(cycles.get(k), rec));
    return rec;
  }
  /** verify F3: an act recorded at its check whose exec failed — taken back while the cycle is open; after a handback
   *  that already carried it, the journal says the told act did not run (never silent). */
  function unnoteUserTabAct(browserKey, profileId, rec, why) {
    if (!rec) return;
    const k = inputKey(browserKey, profileId || null);
    if (cycles.has(k)) cycles.set(k, INT.dropUserAct(cycles.get(k), rec));
    else log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''}: the user's ${rec.kind} the handback already told the agent about did NOT run (${String(why || '').slice(0, 200)})`);
  }
  /** verify r3 T2 ①: ONE serial lock per browser for rung 2 — two holders' window-state cycles interleaved would hand one
   *  holder's create to the other's window (the cycle moves Chrome's sticky create target; measured). Bounded by profiles.
   *  lane browser-windows-rung-race (B-81c6): the map holds the queue's TAIL while any rung 2 of the browser is queued or in
   *  flight (r3 compared `cur`, never the stored value, so an entry outlived its rung 2 for good); a caller arriving while it is
   *  HELD is told so through `onWait` — synchronously, before its wait, so its place in the queue is a fact, never a guess */
  const rung2Locks = new Map();
  async function rung2Serialized(profileId, fn, onWait = null) { const k = String(profileId); const held = rung2Locks.get(k); const prev = held || Promise.resolve(); let done; const cur = new Promise((r) => { done = r; }); const tail = prev.then(() => cur, () => cur); rung2Locks.set(k, tail); if (held && typeof onWait === 'function') { try { onWait(); } catch { } } await prev.catch(() => { }); try { return await fn(); } finally { done(); if (rung2Locks.get(k) === tail) rung2Locks.delete(k); } }
  /** verify r3 T2 ①: THE LEAKS COUNTED — rung-2 tabs that landed in another holder's window and were closed at once (this run). */
  const windowLeaks = { count: 0, last: null };
  /** verify r4 T1 (the owner's invariant): does the USER drive ANY window of this browser right now — a takeover of any
   *  lease's window (the in-memory input side), or his own Browse-yourself window with the controls? Rung 2 never runs then.
   *  verify r5 ⑥: a HOLDER question, asked through holdersOn (the conversations' leases + his row — the census's holder
   *  class): each conversation's drive is read off the in-memory `inputs` (never the lease's mirrored field), his off his row. */
  const userDrivesAnyWindowOf = (profileId) => { const pid = String(profileId || ''); return holdersOn(pid).some((h) => h.human ? h.input === 'user' : ((inputs.get(inputKey(h.browserKey, pid)) || {}).input === 'user')); };
  /** verify r5 ② (MEASURED: a holder refused `user_driving` heard NOTHING at the handback — 0 events on its key over 10
   *  takeovers and 5 Browse-yourself releases; its retry was blind): the holders refused rung 2 while the user drove are
   *  remembered per profile and TOLD ONCE when his drive ENDS (no window of the browser driven any more: a handback, his
   *  window letting go, his row ending) — a `drive-ended` event the announcer turns into a FREE next-turn notice. */
  const rung2Refusals = new Map(); // profileId → Map(browserKey → {sessionId, n, at})
  const noteRung2Refused = (profileId, browserKey, sessionId) => { const pid = String(profileId || ''); const m = rung2Refusals.get(pid) || new Map(); const prev = m.get(browserKey) || { sessionId: null, n: 0, at: 0 }; m.set(browserKey, { sessionId: sessionId || prev.sessionId || null, n: prev.n + 1, at: now() }); rung2Refusals.set(pid, m); };
  const driveEnded = (profileId) => {
    const pid = String(profileId || ''); const m = rung2Refusals.get(pid);
    if (!m || !m.size || userDrivesAnyWindowOf(pid)) return null; // somebody still drives a window of it: not yet
    rung2Refusals.delete(pid);
    const refused = [...m].map(([browserKey, x]) => ({ browserKey, sessionId: x.sessionId, n: x.n, at: x.at }));
    log.log?.(`[browser] ${pid}: the user's drive ended — ${refused.length} holder(s) refused window_busy while he drove are told, free (${refused.map((x) => `${x.browserKey} ×${x.n}`).join(', ')})`);
    emitInput({ kind: 'drive-ended', browserKey: null, profileId: pid, sessionId: null, state: null, cause: 'drive-ended', url: '', refused });
    return refused;
  };
  const tabRowOf = (rows, id) => (Array.isArray(rows) ? rows.find((x) => String(x.targetId).toUpperCase() === String(id).toUpperCase()) : null) || null;
  const tabFacts = (x) => ({ title: x ? KB.keptTitle(x.title || '') : '', url: x ? (KB.keptUrl(x.url || '') || '') : '' });
  const execFailed = (r) => !(r && r.ok) || !!(r.json && r.json.success === false);
  const execWhy = (r) => String((r && r.json && r.json.error) || (r && (r.stderr || r.error)) || 'the browser did not answer').trim().slice(0, 300);
  /**
   * lane browser-windows (U1): EVERY TAB VIBESPACE OPENS FOR A HOLDER OPENS IN A WINDOW OF ITS OWN (src/browser-windows.js —
   * measured on 0.38.1 + Chrome 154: a create names no window; a plain one lands in Chrome's last focused window, often
   * another holder's, where it takes the show and hides that holder's page — 0 fps, a click 4.6 s). The window is made
   * over the keeper browser's own endpoint (`newWindow:true, focus:false`), the holder's session is BOUND to its tab (`tab
   * <targetId>` — the CLI's own switch, so its daemon holds it) and, with a url, navigates there ITSELF (`open <url>`: its
   * headers, init scripts and routes apply before the first document, as `tab new <url>` did). A browser on another
   * machine, or a create the browser refuses, ⇒ the session's own `tab new` as before — said by name (`window:'shared'`,
   * `why`); `fallback:false` (the attach) leaves it to the first command instead. A window no session could be bound to
   * is closed again (never left to nobody). → {ok, targetId, window:'own'|'shared', windowId?, intoWindow?, remade?, why?, json?, error?}
   *
   * T2 ⑧ (the owner, 2026-10-01 23:20 PDT — "agent 意外创建多个窗口"): ONE WINDOW PER HOLDER. The FIRST tab makes the
   * holder's window (`newWindow:true`, as U1); a LATER tab (this holder already has a live window, `lease.windowId`) opens
   * IN that window — measured: CDP names no window and `activateTarget`/`bringToFront` then a plain create is NOT reliable
   * in headless (state-dependent), but a page's `window.open` lands in its OPENER's window every time (headless + hidden),
   * so the keeper opens the new tab from a page of the holder's window (`openTabInWindow`) and VERIFIES it with
   * `Browser.getWindowForTarget` — a tab that landed elsewhere is closed, one retry, else a new single window is opened and
   * the lease re-bound (said once, `remade`). A mediated lease keeps `newWindow:true` per create (the proxy drives the
   * agent's own CDP; it cannot inject the opener rule without corrupting the agent's target map — its safety property, never
   * ANOTHER holder's window, still holds).
   */
  // B-e674 unit 2's cure (r683 (a)): A TAB THE KEEPER CREATES FOR A HOLDER IS THAT HOLDER'S by the keeper's own word — while one of
  // its creates is in flight on a browser (and for the tab it reports), the watch's birth stamp names nothing; a stamp a fast
  // event already wrote on that tab is taken back
  // The mark is PER BROWSER (a profile), never per holder: while ANY keeper create is in flight there, EVERY birth on that browser
  // is stamped for nobody — the person's own new tab and a takeover's birth too fall to the naming before the stamp (safe: no
  // wrong owner, a stamp lost). r694 (4): the mark is BOUNDED IN VIEW — a create still in flight after KEEPER_MAKE_SAY_MS says so
  // in ONE journal line (every await of openOwnTab's ladder is bounded: a create past it is not one the ladder makes)
  const keeperCreating = new Map(); // profileId → creates in flight
  const keeperMade = new Set(); // `${profileId}|${TARGETID}` the keeper created (bounded)
  const markSay = Number.isInteger(markSayMs) && markSayMs > 0 ? markSayMs : KEEPER_MAKE_SAY_MS;
  async function keeperMakes(profileId, fn, idOf = (r) => (r && r.targetId) || null) {
    const k = String(profileId || '');
    keeperCreating.set(k, (keeperCreating.get(k) || 0) + 1);
    const t0 = now();
    const said = setTimeout(() => { log.log?.(`[browser] ${k}: a tab the keeper creates is still in flight after ${Math.round((now() - t0) / 1000)} s (${keeperCreating.get(k) || 0} on this browser) — every tab born on it meanwhile is stamped for nobody until it settles`); }, markSay);
    if (said.unref) said.unref();
    let r;
    try { r = await fn(); } finally { clearTimeout(said); const n = (keeperCreating.get(k) || 1) - 1; if (n > 0) keeperCreating.set(k, n); else keeperCreating.delete(k); }
    const id = String(idOf(r) || '').toUpperCase();
    if (id) {
      keeperMade.add(`${k}|${id}`); if (keeperMade.size > 256) keeperMade.delete(keeperMade.values().next().value);
      const rec = reg.browsers[k]; if (rec && rec.bornBy && rec.bornBy[id]) { delete rec.bornBy[id]; commit(); }
    }
    return r;
  }
  function openOwnTabMarked(p, holderKey, o = {}) { return keeperMakes(p && p.id, () => openOwnTab(p, holderKey, o)); } // every caller outside the body goes through the mark
  async function openOwnTab(p, holderKey, { url = '', ns = null, opts = {}, pin = [], fallback = true, json = false, timeout = 30000, _again = false } = {}) {
    const rec = p ? reg.browsers[p.id] : null;
    const VP = () => require('./browser-viewport.js');
    let made = null;
    if (rec && rec.cdpUrl && isLocalRec(rec)) {
      // T2 ⑧: does this holder already have a live window of its own? (a mediated lease never does — it keeps newWindow)
      const lease = !isMediated(p) ? B.findLease(reg.leases, p.id, holderKey) : null;
      const windowOf = async (tid) => { try { const w = await (typeof windowOfFn === 'function' ? windowOfFn(rec.cdpUrl, tid) : VP().windowOf(rec.cdpUrl, tid)); return WIN.windowIdOf(w); } catch { return null; } }; // lane site-reset-windows: THE one reader — `Number(null)` was window 0 (a dead tab read as a stray window 0, a lease stamped window 0)
      const cands = lease ? [...new Set([lease.targetId, ...(Array.isArray(lease.tabRoots) ? lease.tabRoots : [])].filter(Boolean).map((x) => String(x).toUpperCase()))] : [];
      let wantWin = lease ? WIN.windowIdOf(lease.windowId) : null; // verify r2: null is not window 0
      const windows = new Map(); // candidate → its window (asked once)
      // verify r2 ② (THE UPGRADE PATH, reproduced): a lease whose first tab IS in a window of its own in this run (`windowIn`)
      // but whose window id was never stamped — a lease from before r1, or a `Browser.getWindowForTarget` that did not answer
      // at the first window — DERIVES it from its live tabs; without this every later tab was a new window, said to nobody
      if (wantWin == null && lease && WIN.hasOwnWindow(lease, WIN.instanceOf(rec))) {
        for (const c of cands) { const w = await windowOf(c); windows.set(c, w); if (w != null) { wantWin = w; lease.windowId = w; log.log?.(`[browser] ${holderKey} on ${p.id}: its window id was never stamped — derived ${w} from its tab ${c.slice(0, 8)}`); break; } }
      }
      // THE LIVE ANCHORS: every tab of the lease that answers the holder's window — the window is LOST only when none does;
      // verify r3 ④: the candidates answering ANOTHER window are the STRAYS (a lease from before r1 whose tabs sit in several
      // windows) — said once per browser run (STRAYS_NOTE), never folded (no page is closed on the agent's behalf)
      const anchors = [];
      if (wantWin != null) for (const c of cands) { const w = windows.has(c) ? windows.get(c) : await windowOf(c); windows.set(c, w); if (w != null && w === wantWin) anchors.push(c); }
      const strays = wantWin != null ? WIN.strayWindowsOf(windows, wantWin) : { windows: [], tabs: [] };
      let gone = false;
      if (anchors.length) {
        const open = async (fn, a) => { try { return await fn(a); } catch (e) { return { ok: false, code: 'open_failed', error: String(e && e.message) }; } };
        const viaOpener = (a) => open((x) => (typeof openInWindowFn === 'function' ? openInWindowFn(rec.cdpUrl, { anchorTargetId: x, windowId: wantWin }) : VP().openTabInWindow(rec.cdpUrl, { anchorTargetId: x, windowId: wantWin })), a);
        // verify r3 T2 ①: rung 2's PLAN from the browser's display fact (the window-state cycle, never on a real display), its
        // tries, and ONE serial lock per browser — two holders' cycles must not interleave (the cycle moves the sticky target)
        // verify r4 T2 ① + T1: the plan also reads WHO WATCHES this window (the bridge's viewer count — no cycle under a live
        // view: it flips the page hidden → visible, measured) and whether the USER DRIVES any window of this browser (then
        // rung 2 is not run at all — refused window_busy by name, never a cycle or an activation under his hands)
        // verify r5 ①/② (MEASURED on the product's Chrome, 30/30 per mode): r4 read the plan ONCE at the ladder's TOP — before
        // the opener rung's probes (up to OPENER_ANCHORS_MAX × ANCHOR_PROBE_MS) and before the wait for the browser's rung-2
        // lock — so a takeover that began inside them ran rung 2 under the user's hands and a live view that opened inside
        // them got the cycle under its first frames. THE PLAN IS READ AT RUNG 2, after the last await before it (the lock)
        const planNow = () => WIN.rung2Plan(rec.display, { viewers: watchers.get(inputKey(holderKey, p.id)) || 0, driven: userDrivesAnyWindowOf(p.id) });
        let plan = null;
        const viaActivate = (a) => rung2Serialized(p.id, () => { plan = planNow(); if (plan.run === false) return { ok: false, code: 'rung2_not_run', error: plan.why }; return open((x) => (typeof activateFn === 'function' ? activateFn(rec.cdpUrl, { anchorTargetId: x, windowId: wantWin, tries: WIN.RUNG2_TRIES, breaker: plan.breaker }) : VP().openTabByActivate(rec.cdpUrl, { anchorTargetId: x, windowId: wantWin, tries: WIN.RUNG2_TRIES, breaker: plan.breaker })), a); }, () => log.log?.(`[browser] ${holderKey} on ${p.id}: rung 2 waits for the browser's lock — another holder's rung 2 is in flight; the plan is read when the lock is granted`)); // B-81c6: the queue's place journaled
        const tried = [];
        // verify r2 T1 (reproduced on the fake target model, measured on Chrome 154): RUNG 1 = the opener rule from EACH live
        // anchor (≤ OPENER_ANCHORS_MAX — a dialog open, a crash, a navigation or a site hijacking window.open on ONE tab costs
        // no window; verify r3: an anchor that does not answer the probe costs ANCHOR_PROBE_MS, not the act's timeout);
        // RUNG 2 = the cycle + activate + a plain create from the first anchor, verified (lands where the page act cannot)
        for (const a of anchors.slice(0, WIN.OPENER_ANCHORS_MAX)) { made = await viaOpener(a); if (made && made.ok) { made.rung = 'opener'; break; } tried.push(`${a.slice(0, 8)}: ${(made && (made.code || made.error)) || 'failed'}`); }
        if (!(made && made.ok)) made = await viaActivate(anchors[0]); // verify r5: the plan is read in there, at rung 2
        if (made && made.code === 'rung2_not_run') {
          // verify r4 T1: the user drives a window of this browser — rung 2 is NOT run (no cycle, no activation under his
          // hands); said by name in the refusal, the agent tries again after the handback — verify r5 ②: and is TOLD then
          tried.push(`activate+create: not run (${plan.why})`);
          noteRung2Refused(p.id, holderKey, lease ? lease.sessionId : null);
          log.log?.(`[browser] ${holderKey} on ${p.id}: rung 2 NOT run — ${plan.why}; the opener rule failed on ${tried.length - 1} anchor(s): ${tried.slice(0, -1).join('; ')} — refused window_busy, the agent tries again after the handback (told then)`);
        } else if (!(made && made.ok) || made.rung !== 'opener') {
          // verify r3 T2 ①: every leak COUNTED — a tab that landed in another holder's window and was closed at once
          for (const lk of Array.isArray(made && made.leaks) ? made.leaks : []) { windowLeaks.count++; windowLeaks.last = { at: now(), browserKey: holderKey, profileId: p.id, window: lk.window == null ? null : lk.window, livedMs: Number(lk.livedMs) || 0 }; log.log?.(`[browser] ${holderKey} on ${p.id}: rung 2 (try ${lk.try}) opened its tab in window ${lk.window == null ? '(unknown)' : lk.window} — another holder's, not its own ${wantWin} — closed at once after ${Number(lk.livedMs) || 0} ms (leak ${windowLeaks.count} of this run; ${plan.breaker ? 'the window-state cycle before each try' : 'no cycle: ' + plan.why})`); }
          if (made && made.ok) made.rung = 'activate'; // the RUNG is the keeper's fact (the seam's own word is not trusted)
          if (made && made.ok) log.log?.(`[browser] ${holderKey} on ${p.id}: its tab opened by rung 2 (${plan.breaker ? 'the window-state cycle + ' : 'no cycle (' + plan.why + ') + '}activate + a background create, try ${made.tries || 1}) in its window ${wantWin} — the opener rule failed on ${tried.length} anchor(s): ${tried.join('; ')}`);
          else tried.push(`activate+create: ${(made && (made.code || made.error)) || 'failed'}`);
        }
        if (made && made.ok) { made.windowId = wantWin; made.inWindow = true; }
        else {
          // verify r3 ⑦ (measured: the anchor was its window's LAST tab and closed 0 ms into the act ⇒ no tab, the window gone):
          // the window is RE-ASKED before it is called busy — none of the lease's tabs answers it any more ⇒ it is gone ⇒
          // one new window of its own below (r2 said "your tabs are still there" for a window that was not)
          let answers = 0; for (const c of cands) { const w = await windowOf(c); if (w != null && w === wantWin) answers++; }
          if (!answers) { gone = true; log.log?.(`[browser] ${holderKey} on ${p.id}: its own window ${wantWin} went away during the ladder (${tried.join('; ')}) — no tab of its answers it now; a new window of its own is opened`); }
          else {
            // the window provably LIVES (its tabs answer) ⇒ NEVER re-minted (r1 re-minted here: a dialog on the anchor made a
            // second window, and the note claimed the old tabs were closed) — refused by name, the agent tries again
            log.log?.(`[browser] ${holderKey} on ${p.id}: its own window ${wantWin} could not take a new tab right now (${tried.join('; ')}) — refused window_busy, never a second window`);
            made = { ok: false, code: 'window_busy', why: plan && plan.run === false ? 'user_driving' : 'ladder', error: `your window could not take a new tab right now (${tried.join('; ')}) — your window and its tabs are still there; try again ${plan && plan.run === false ? 'after the user hands the browser back (VibeSpace tells you then)' : 'in a moment'}` };
          }
        }
      }
      if (!anchors.length || gone) {
        // no tab of the lease answers its window: the window is GONE (none yet, or a previous run's) ⇒ ONE new window of its own
        const hadWindow = wantWin != null;
        try { made = await (typeof openWindowFn === 'function' ? openWindowFn(rec.cdpUrl, { url: 'about:blank' }) : VP().openWindow(rec.cdpUrl, { url: 'about:blank' })); } catch (e) { made = { ok: false, error: String(e && e.message) }; }
        if (made && made.ok) { made.remade = hadWindow; made.rung = 'new-window'; } // the holder HAD a window and it was lost ⇒ a new single one of its own
      }
      if (made && made.ok && strays.windows.length) made.strays = strays; // verify r3 ④: said with the result, once per run
    } else made = { ok: false, error: rec && rec.cdpUrl ? 'a browser on another machine' : 'the browser answered no CDP url' };
    if (made && made.ok && made.targetId) {
      const id = String(made.targetId).toUpperCase();
      if (mediator && isMediated(p)) mediator.admitTarget(p.id, holderKey, id); // P6: the proxy scopes the lease to it before its session binds it
      else if (mediator && leaseRoadOf(p, holderKey).mode === M.SCOPE_MODE) mediator.admitTarget(p.id, holderKey, id); // lane browser-shared-profile-freeze: the scope road's too
      let b = null;
      try { b = await rt.exec(ns, [...pin, 'tab', id, '--json'], { ...opts, timeout }); } catch (e) { b = { ok: false, error: String(e && e.message) }; }
      if (!execFailed(b)) {
        let json = (b && b.json) || null;
        if (url) {
          // lane site-reset-windows: the url is NAVIGATED, never waited for — as the binary's own `tab new <url>` did before this
          // lane (0.38.1 waits for nothing there). The binary's `open` waits for the page's load: a page that never settles (userW's
          // stale-login loop) sat its 25 s timeout and the agent's `tab new` failed tab_failed with its tab opened and bound, the
          // loop never told. `Page.navigate` on the new tab's own socket answers at the commit; the binary's `open` only where no
          // page socket answers (a fake CDP endpoint, a refused navigation)
          let nav = null;
          try { nav = await VP().navigateTarget(rec.cdpUrl, id, url); } catch (e) { nav = { ok: false, error: String(e && e.message) }; }
          if (!(nav && nav.ok)) {
            let o = null;
            try { o = await rt.exec(ns, [...pin, 'open', url, '--json'], { ...opts, timeout }); } catch (e) { o = { ok: false, error: String(e && e.message) }; }
            if (execFailed(o)) return { ok: false, targetId: id, window: 'own', windowId: made.windowId, error: execWhy(o) };
            json = (o && o.json) || json;
          }
        }
        return { ok: true, targetId: id, window: 'own', windowId: made.windowId, intoWindow: !made.remade && made.windowId != null && !!made.inWindow, remade: !!made.remade, rung: made.rung || null, strays: made.strays || null, json }; // verify r3: the RUNG that landed is named; the strays ride once
      }
      // B-0cee (an agent's report, fb-61e4794124): the new tab itself GONE before its bind — the holder's window closed between the
      // create and the `tab <id>` (the browser's target list answers without it) ⇒ the keeper asks ONCE more itself, as its refusal
      // told the agent to (a window of its own that is gone gets a new one). A tab that still lives when its bind failed (the
      // B-19a9 stall), an unread list, or a second loss is refused as before
      let tabGone = false;
      if (fallback && !_again) { let tl = null; try { tl = await (typeof readTargets === 'function' ? readTargets(rec.cdpUrl) : VP().browserTargets(rec.cdpUrl)); } catch { tl = null; } tabGone = !!(tl && tl.ok && Array.isArray(tl.targets) && !tl.targets.some((t) => String(t.targetId || '').toUpperCase() === id)); }
      try { await (typeof closeTargetFn === 'function' ? closeTargetFn(rec.cdpUrl, id) : require('./browser-viewport.js').closeTarget(rec.cdpUrl, id)); } catch { /* the next start ends it */ }
      // verify r5 ③ (MEASURED on the product's Chrome, 30/30 per mode): a bind that fails — the user closed the holder's window
      // between the create and the `tab <id>` ("No tab with label …") — fell to the binary's own `tab new`, which lands in the
      // browser's LAST window in the FOREGROUND: the other holder's page hidden for good (the U0b class this lane exists to
      // end, on the fallback path). An own-window tab whose bind failed is REFUSED window_busy (why bind_failed): nothing
      // opened, the same `tab new` once more re-asks the window (gone ⇒ a new window of its own) — never the shared fallback
      if (fallback) { log.log?.(`[browser] ${holderKey} on ${p ? p.id : '?'}: its new tab ${id.slice(0, 8)} could not be bound to its session (${execWhy(b)}) — closed, refused window_busy (bind_failed), never the browser's last window`); made = { ok: false, code: 'window_busy', why: 'bind_failed', error: `your new tab could not be bound to your session (${execWhy(b)}) — nothing opened; run the same \`tab new\` once more (a window of yours that is gone gets a new one)` }; }
      else made = { ok: false, error: `its new window could not be bound to its session (${execWhy(b)})` };
      if (tabGone && made && made.why === 'bind_failed') { log.log?.(`[browser] ${holderKey} on ${p ? p.id : '?'}: its new tab ${id.slice(0, 8)} went away with its window before the bind — asked once more (B-0cee)`); const again = await openOwnTab(p, holderKey, { url, ns, opts, pin, fallback, json, timeout, _again: true }); if (again && again.ok && again.window === 'own') { again.remade = true; again.intoWindow = false; } return again; } // B-0cee follow-up: the second ask is SAID (tab_new_window) whether or not a window was stamped
    }
    if (made && made.code === 'window_busy') return { ok: false, code: 'window_busy', why: made.why || 'ladder', targetId: null, window: 'own', error: made.error }; // verify r2 T1: a living window is never traded for the browser's last window (another holder's)
    if (made && /timed out/i.test(String(made.error || '')) && p) noteAnswer(reg.browsers[p.id], p, false, 'a window open'); // lane browser-unresponsive: an ask that did not answer
    if (!fallback) { log.log?.(`[browser] ${holderKey} on ${p ? p.id : '?'}: no window of its own was opened — ${made && made.error ? made.error : 'no window'}; its first command opens its tab`); return { ok: false, targetId: null, window: null, why: made && made.error }; }
    log.log?.(`[browser] ${holderKey} on ${p ? p.id : '?'}: its tab opens in the browser's last window, not a window of its own — ${made && made.error ? made.error : 'no window'}`);
    let r = null;
    try { r = await rt.exec(ns, [...pin, 'tab', 'new', ...(url ? [url] : []), ...(json ? ['--json'] : [])], { ...opts, timeout }); } catch (e) { r = { ok: false, error: String(e && e.message) }; } // each caller's own pre-lane argv (only the agent's fenced `tab new` asked for --json)
    if (execFailed(r)) return { ok: false, targetId: null, window: 'shared', why: made && made.error, error: execWhy(r) };
    const d = r.json && r.json.data && typeof r.json.data === 'object' ? r.json.data : null;
    const tid = KB.targetIdOf(r.stdout) || (d ? (d.targetId || d.tabId || d.id || null) : null); // as the pre-lane callers read it (never re-cased)
    return { ok: true, targetId: tid ? String(tid) : null, window: 'shared', why: made && made.error, json: r.json || null };
  }
  /**
   * THE AGENT'S `tab` VERBS on a SHARED profile's browser (the CLI routes them here after its /resolve; the route is the
   * belt). `resolveFor` FIRST — the one admission and every refusal it answers (profile_changed, browser_paused while the
   * user drives, browser_busy, the handles) — then ONE read (its session's own `tab list` + the CDP targets), the PURE
   * verdict, and at most ONE act under ITS session: never another holder's tab (`not_your_tab` before any exec), an
   * unreadable browser fails closed (`tabs_unreadable`). A `tab new` records its tab as a ROOT. The conversation's own
   * browser, a helper's, a mediated lease (the proxy scopes its targets) and the shared machine browser need no fence here
   * ⇒ `{passthrough}` (the CLI runs the binary as before). → {ok, act, view:{tabs, others}, …} | a refusal object.
   */
  async function agentTabAct({ browserKey, handle = '', argv = [] } = {}) {
    ensureLoaded();
    const bk = String(browserKey || '');
    const w = TBS.parseTabArgv(argv);
    if (!w.ok) throw namedError(w.code, w.error);
    if (w.act === 'new') { const u = TBS.newTabUrlVerdict(w.url); if (!u.ok) throw namedError(u.code, u.error); w.url = u.url; }
    const v = resolveFor({ browserKey: bk, handle, verb: B.auditVerbOf((Array.isArray(argv) ? argv : []).map(String)) });
    if (!v.ok) return v;
    if (v.kind !== 'attachment') return { ok: true, passthrough: true, why: v.kind === 'child' ? 'a helper\'s own browser holds only its tabs' : 'this conversation\'s own browser holds only its tabs' };
    const p = profile(v.attachment.profileId);
    if (!p || isEph(p)) throw namedError('not-found', 'that browser is not one of this conversation\'s');
    if (isMediated(p)) return { ok: true, passthrough: true, why: 'this browser keeps each conversation\'s tabs apart (its proxy lists and reaches only yours)' };
    const rec = reg.browsers[p.id];
    // B-19a9 (round wpdtugrv1 MUST 1): the pass-through follows the ROAD's verdict, never the machine — a paired machine's shared profile
    // is on the scope road, whose judge leaves an explicit attach by id to THIS fence: it goes through the same fence and another
    // holder's tab is refused by the same name (not_your_tab). Only a RAW road (an outside endpoint, a remote conversation) passes as before
    if (leaseRoadOf(p, bk).mode !== M.SCOPE_MODE && (p.host || !isLocalRec(rec))) return { ok: true, passthrough: true, why: 'a browser on another machine' };
    if (!B.findLease(reg.leases, p.id, bk)) throw namedError('no_lease', `this conversation holds no lease on "${p.label}" — \`vibespace-browser use ${p.id}\` first`);
    const o = await leaseCliOpts(p.id, bk);
    if (!o) throw namedError('browser_no_cdp', noCdpError(p));
    const pinTab = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
    const pin = pinTab ? ['--pin-tab'] : [];
    const ns = nsOf(p.id);
    const read = async () => {
      const before = rootsAt(p.id, bk);
      const rows0 = await tabListUnder(ns, o);
      const lw = B.findLease(reg.leases, p.id, bk);
      const rows = rows0 ? WIN.withLabelsOnRows(rows0, lw && lw.tabLabels) : null; // lane browser-windows: the labels of the tabs VibeSpace opened in their own windows
      const targets = rows ? await tabTargetsOf(rawCdpOf(p.id, o)) : null;
      const active = rows ? ((rows.find((x) => x.active) || {}).targetId || null) : null;
      const owners = targets ? TBS.tabOwners({ targets, holders: tabHoldersOf(p.id, active ? { [bk]: String(active).toUpperCase() } : {}) }) : null;
      const own = TBS.ownSetOf(owners, bk);
      keepTabRoots(p.id, bk, own, before);
      return { rows, owners, own, active: active ? String(active).toUpperCase() : null, targets };
    };
    const s0 = await read();
    if (!s0.rows || !s0.owners) { const hung = noteAnswer(rec, p, false, 'a refused tab read') ? unresponsiveOf(rec, p) : null; const code = hung ? 'browser_unresponsive' : 'tabs_unreadable'; log.log?.(`[browser] ${bk} on ${p.id}: its \`tab ${w.act}\` refused ${code} (${s0.rows ? 'the CDP read' : 'its tab list'} did not answer) — nothing ran`); throw namedError(code, TBS.tabRefusalText('tabs_unreadable', { agent: true, ...(hung ? { unresponsive: hung } : {}) })); } // lane browser-unresponsive: a refusal is an ask that did not answer
    // lane browser-shared-profile-freeze: on the scope road the driver's own list holds only this conversation's tabs, so a
    // TARGET ID is also looked up in the browser's own list — another holder's tab is then refused not_your_tab (its owner
    // named by the fence), never no_such_tab
    const targetId = w.ref ? (TBS.resolveTabRef(w.ref, s0.rows) || TBS.resolveTabRef(TBS.TARGET_ID_RE.test(String(w.ref)) ? w.ref : '', s0.targets || [])) : null;
    const av = TBS.agentTabVerdict({ act: w.act, ref: w.ref, targetId, own: s0.own, current: s0.active });
    // B-19a9 (主开发 r2182 (1)): an ORPHAN on a paired machine's shared profile is refused by the same code in its own words (an update's
    // edge: its tabs from before the scope road were never recorded) — the fence is never widened for it
    const unrecorded = !av.ok && av.code === 'not_your_tab' && !!targetId && s0.owners instanceof Map && s0.owners.get(String(targetId).toUpperCase()) === 'orphan' && roadFactsOf(p, rec).paired;
    if (!av.ok) { log.log?.(`[browser] ${bk} on ${p.id}: its \`tab ${w.act}${w.ref ? ' ' + String(w.ref).slice(0, 40) : ''}\` refused ${av.code}${unrecorded ? ' (an unrecorded tab on a paired machine)' : ''} — nothing ran`); throw namedError(av.code, unrecorded ? TBS.tabRefusalText('not_your_tab', { agent: true, unrecorded: true }) : av.error); }
    const out = { ok: true, act: w.act, profileId: p.id };
    if (w.act === 'new') {
      // lane browser-windows (U1): the new tab opens in a WINDOW OF ITS OWN (measured: the binary's `tab new` lands in
      // Chrome's last focused window — often another conversation's, hiding its page); its session is bound there and
      // navigates itself; a label is the lease's (the binary labels only the tabs it creates)
      const made = await openOwnTabMarked(p, bk, { url: w.url || '', ns, opts: o, pin, json: true });
      if (!made.ok) throw namedError(made.code === 'window_busy' ? 'window_busy' : 'tab_failed', made.error || 'the tab could not be opened', made.code === 'window_busy' && made.why ? { why: made.why } : {}); // verify r2 T1: window_busy by name (the window lives; nothing opened); verify r5 ⑤: the refusal carries WHY (user_driving / bind_failed / ladder) to the route and the CLI's JSON
      const id = made.targetId;
      const l = B.findLease(reg.leases, p.id, bk);
      if (id && l) { l.tabRoots = TBS.addRoot(l.tabRoots, id); if (made.window === 'own') { l.windowIn = WIN.instanceOf(rec); if ((made.remade || WIN.windowIdOf(l.windowId) == null) && WIN.windowIdOf(made.windowId) != null) l.windowId = WIN.windowIdOf(made.windowId); } if (w.label) l.tabLabels = WIN.withTabLabel(l.tabLabels, w.label, id); save(); } // T2 ⑧: a later tab is IN the holder's window; a lost window is re-minted once
      if (made.window === 'own' && made.remade) { out.note = 'your window was gone (none of your tabs answered it), so this tab opened in a new window of your own'; out.noteCode = 'tab_new_window'; log.log?.(`[browser] ${bk} on ${p.id}: its window was gone — a new window of its own opened for its \`tab new\` (${String(id || '').slice(0, 8)})`); }
      // 2.369.199 integration (lane site-reset verify r4 #1 × this fence): the ack names the new tab as the browser spells it —
      // the route binds that id in the dialog watch to THIS conversation (the CLI's audit no longer sees a fenced `tab new`)
      const ack = id ? String(id) : null;
      out.opened = { targetId: id ? String(id).toUpperCase() : null, url: w.url || 'about:blank', ack, window: made.window || null, ...(made.window === 'own' ? { inWindow: !!made.intoWindow, windowId: WIN.windowIdOf(made.windowId), rung: made.rung || null } : {}) }; // verify r2 T1: the result SAYS the tab is in the holder's existing window; verify r3: and by which RUNG
      // verify r3 ④ (THE UPGRADE PATH, reproduced): a lease whose tabs sit in windows other than its own (the r1 bug's
      // leftovers) is TOLD so once per browser run — the state is said, never folded (no page of the agent's is closed)
      if (made.window === 'own' && made.strays && made.strays.windows.length && l && l.straysSaidIn !== WIN.instanceOf(rec) && !out.note) { l.straysSaidIn = WIN.instanceOf(rec); save(); out.note = `${made.strays.tabs.length} of your tabs sit in ${made.strays.windows.length} other window${made.strays.windows.length === 1 ? '' : 's'} of this browser (from before this version); your new tabs open in your window — close those with \`tab close <id>\` or leave them`; out.noteCode = WIN.STRAYS_NOTE; log.log?.(`[browser] ${bk} on ${p.id}: ${made.strays.tabs.length} of its tabs sit in ${made.strays.windows.length} other window(s) (${made.strays.windows.join(', ')}) besides its own ${WIN.windowIdOf(made.windowId)} — said once (${WIN.STRAYS_NOTE}); nothing closed`); }
      if (made.window !== 'own' && made.why) { out.note = `this tab opened in the browser's last window, not a window of your own (${String(made.why).slice(0, 160)}) — it may sit beside another conversation's tab`; out.noteCode = 'tab_shared_window'; }
    } else if (w.act === 'switch') {
      const r = await rt.exec(ns, [...pin, 'tab', av.targetId, '--json'], { ...o, timeout: 30000 });
      if (execFailed(r)) throw namedError('tab_failed', execWhy(r));
      out.switched = { targetId: av.targetId };
    } else if (w.act === 'close') {
      const r = await rt.exec(ns, ['tab', 'close', av.targetId, '--json'], { ...o, timeout: 30000 });
      if (execFailed(r)) throw namedError('tab_failed', execWhy(r));
      const l = B.findLease(reg.leases, p.id, bk);
      if (l && Array.isArray(l.tabRoots)) { l.tabRoots = TBS.cleanRoots(l.tabRoots.filter((x) => String(x).toUpperCase() !== av.targetId)); save(); }
      out.closed = { targetId: av.targetId, current: !!av.closesCurrent };
      if (av.closesCurrent) out.noteCode = 'tab_closed_current';
      if (av.closesCurrent) out.note = 'that was your current tab — your next page verb answers tab_gone until you switch to another of yours (`vibespace-browser tab <id>`) or open one (`vibespace-browser tab new <url>`)';
    }
    const s1 = w.act === 'list' ? s0 : await read();
    out.view = TBS.agentTabView({ tabs: s1.rows || [], owners: s1.owners, me: bk });
    out.lines = TBS.agentTabLines(out.view); // the CLI prints these (`t3  Title — url  [current]`, then the count of the rest)
    if (w.act !== 'list') log.log?.(`[browser] ${bk} on ${p.id} "${p.label}": its own \`tab ${w.act}\` ran (${out.view ? out.view.tabs.length : '?'} tab(s) of its own now${out.view && out.view.others ? `, ${out.view.others} other(s) not its` : ''})`);
    return out;
  }
  /**
   * WHOSE IS EACH TAB of the browser a live view shows, in the VIEW's words (the bridge asks after every `tabs` record):
   * a conversation's own browser / a helper's / a mediated lease's view ⇒ every listed tab is the viewed agent's (the
   * mediated stream is the proxy's scoped one); a shared profile's view ⇒ ONE CDP read over the holders — `agent` (the
   * viewed conversation's), `you` (his own tab), `other` (another conversation's), `orphan`; his browsing window ⇒ `you` /
   * `other` / `orphan`, and `adoptable` when no conversation leases the browser (the orphan rule). `activeTarget` = the
   * relay's session's tab (the `tabs` record's active — the viewed lease's). → {ok, all?, owners?, mediated, adoptable}
   */
  // lane browser-tabs-by-window (the owner, 2026-10-08): WHICH WINDOW each tab is in, for the live view's tab row and Tabs
  // pane — Browser.getWindowForTarget per page (the reader openOwnTab verifies with), KEPT per browser run + target (CDP has
  // no move: a tab's window is its window for life on the headless / hidden-window browsers this serves); an unread one is
  // null (never 0), not kept, asked again at the next read; ≤ TAB_WINDOW_READS new reads per record (a browser of thousands
  // of tabs costs a bounded number of sockets per `tabs` record, the rest answer null until a later read)
  const TAB_WINDOW_READS = 24, TAB_WINDOW_KEEP = 4096;
  const tabWindowKept = new Map(); // `${cdpUrl}|${instance}|${TARGETID}` → windowId
  async function tabWindowsOf(rec, targets) {
    const pre = `${rec.cdpUrl}|${WIN.instanceOf(rec) || ''}|`;
    const ids = TBS.pageTargets(targets).map((x) => x.targetId);
    const live = new Set(ids);
    for (const k of tabWindowKept.keys()) if (k.startsWith(pre) && !live.has(k.slice(pre.length))) tabWindowKept.delete(k);
    const out = {};
    let reads = 0;
    for (const id of ids) {
      const k = pre + id;
      if (tabWindowKept.has(k)) { out[id] = tabWindowKept.get(k); continue; }
      out[id] = null;
      if (reads++ >= TAB_WINDOW_READS) continue;
      let w = null;
      try { w = WIN.windowIdOf(await (typeof windowOfFn === 'function' ? windowOfFn(rec.cdpUrl, id) : require('./browser-viewport.js').windowOf(rec.cdpUrl, id))); } catch { w = null; }
      out[id] = w;
      if (w != null) { tabWindowKept.set(k, w); if (tabWindowKept.size > TAB_WINDOW_KEEP) tabWindowKept.delete(tabWindowKept.keys().next().value); }
    }
    return out;
  }
  /** The holders' windows in the VIEW's words, in the holders' order (tabHoldersOf's): his window = the one his own tab was
   *  made in; a lease's = its stamped `windowId` while it is of THIS browser run (`windowIn`) — a lease without one names no
   *  window (its tabs are "elsewhere", never guessed). → [{windowId, word, sessionId?, job?, name?}] */
  function holderWindowsOf(p, rec, windows, bk, h) {
    const out = [];
    const inst = WIN.instanceOf(rec);
    const hw = h && h.ownTab ? windows[String(h.ownTab).toUpperCase()] : null;
    if (hw != null) out.push({ windowId: hw, word: TBS.ownerWord(h.key, { me: bk, humanKey: h.key }) });
    for (const l of reg.leases.filter((x) => x.profileId === p.id).sort((a, b) => (Number(a.since) || 0) - (Number(b.since) || 0))) {
      const w = WIN.hasOwnWindow(l, inst) ? WIN.windowIdOf(l.windowId) : null;
      if (w == null) continue;
      const word = TBS.ownerWord(l.browserKey, { me: bk, humanKey: h ? h.key : null });
      out.push({ windowId: w, word, ...(word === 'other' ? whoseOf(p.id, l.browserKey) || {} : {}) });
    }
    return out;
  }
  async function tabOwnersFor(target, { activeTarget = null } = {}) {
    ensureLoaded();
    if (!target || !target.kind) return { ok: false };
    // accept-fixes-strip F7: every view gets the PAGES' OWN titles from the one CDP read (the binary's rows keep the title a
    // tab had while it loaded — measured on 0.38.1); `settling` = a page still names itself by its address (ask again soon)
    const titled = (targets) => (targets ? { titles: TBS.titlesOf(targets), settling: TBS.pageRows(targets).some((x) => !TBS.BLANK_URL_RE.test(x.url.trim()) && TBS.isUrlTitle(x.title, x.url)) } : {});
    if (target.kind === 'ephemeral' || target.kind === 'child') {
      const e = ephemeralFor(target.kind === 'child' ? String(target.handle || '') : String(target.ns || target.sessionName || '').replace(/^vs-/, ''));
      const r0 = e ? reg.browsers[e.profileId] : null;
      return { ok: true, all: 'agent', mediated: false, adoptable: false, ...titled(r0 && B.isLiveBrowser(r0) && isLocalRec(r0) ? await tabTargetsOf(r0.cdpUrl) : null) };
    }
    const p = profile(target.profileId);
    const rec = p ? reg.browsers[p.id] : null;
    if (!p || isEph(p) || !B.isLiveBrowser(rec) || !isLocalRec(rec)) return { ok: false };
    if (target.kind !== 'human' && isMediated(p)) return { ok: true, all: 'agent', mediated: true, adoptable: false, ...titled(await tabTargetsOf(rec.cdpUrl)) };
    const bk = target.kind === 'human' ? null : String(target.sessionName || '').replace(/^vs-/, '');
    const before = bk ? rootsAt(p.id, bk) : null;
    const targets = await tabTargetsOf(rec.cdpUrl);
    if (!targets) return { ok: false };
    const act = activeTarget && TBS.TARGET_ID_RE.test(String(activeTarget)) ? String(activeTarget).toUpperCase() : null;
    pruneBorn(p, targets); // B-e674 unit 2: a stamp lives as long as its tab
    const owners = TBS.tabOwners({ targets, holders: tabHoldersOf(p.id, bk && act ? { [bk]: act } : {}) });
    if (bk) keepTabRoots(p.id, bk, TBS.ownSetOf(owners, bk), before);
    const h = humans.get(p.id);
    const words = {};
    const whose = {};
    for (const [id, k] of owners) { words[id] = TBS.ownerWord(k, { me: bk, humanKey: h ? h.key : HM.humanKeyFor(p.id) }); if (words[id] === 'other') { const w = whoseOf(p.id, k); if (w) whose[id] = w; } } // B-e674 unit 2: the person's own key even with no Browse yourself (their stamped tabs)
    const windows = await tabWindowsOf(rec, targets); // lane browser-tabs-by-window: every tab's window + the holders' windows
    const leases = holderWindowsOf(p, rec, windows, bk, h);
    const front = await frontOfView(p, rec, { windows, words, act, bk, h, leases, whose }); // B-e674 unit 1
    const made = {}; for (const [id, s] of Object.entries(bornOf(p.id))) if (s && words[id] !== undefined) made[id] = { made: s.made === 'browse' ? 'browse' : 'takeover', person: !!s.person, mine: !!(s.made === 'takeover' && bk && s.of === bk && words[id] === 'agent'), at: Number(s.at) || 0 }; // B-e674 unit 2 (+ r683: named only on the taken-over conversation's view, on its own tab; r694 (3): its birth's instant — a handback counts THIS takeover's)
    return { ok: true, owners: words, whose, windows, leases, front, made, mediated: false, adoptable: target.kind === 'human' && !reg.leases.some((l) => l.profileId === p.id), ...titled(targets) };
  }
  // ── B-e674 unit 2 (the coordinator's r548 / r562 / r605): THE BIRTH STAMP — who drove this browser when a tab appeared ──
  // The dialog watch tells the keeper of every page tab the moment Chrome reports it (its own socket, `Target.targetCreated`),
  // with the tab's opener and the agent's verb its own witness saw in flight. The keeper stamps what it knows at that instant:
  // the person driving a TAKEOVER of a conversation's view, or their own BROWSING window. RULING (i): a tab a PAGE opened stays
  // its opener's holder's (the popup rule) and is NAMED «opened in your takeover»; a tab no page opened and no agent's verb made,
  // born while the person drives, is THE PERSON'S — a root of their holder, never an orphan (never adoptable or nobody's on a
  // view). A raw client creating a tab at that very moment would be read as the person's too: the stamp is a NAME and an owner,
  // never an act. Kept on the browser's record (persisted with it, gone with its run), ≤ BORN_KEEP, pruned at every read.
  const BORN_KEEP = 64;
  /** r694 (2): does the person drive THEIR OWN browsing window of this browser now? (the watch's «unclear»: they are a possible parent) */
  function personBrowsing(profileId) { const h = humans.get(String(profileId || '')); return !!(h && h.state === 'driving'); }
  function personDriving(p) {
    const drives = [];
    const h = humans.get(p.id);
    if (h && h.state === 'driving') drives.push({ made: 'browse', of: null });
    for (const l of reg.leases.filter((x) => x.profileId === p.id)) {
      if ([p.id, null].some((pid) => { const st = inputStateFor(l.browserKey, pid); return st && st.input === 'user'; })) drives.push({ made: 'takeover', of: String(l.browserKey) });
    }
    return drives.length === 1 ? drives[0] : null; // r683: «unclear» is not «nobody» — two drives at once stamp nothing
  }
  async function noteTabBorn(profileId, targetId, { opener = null, witness = null, unclear = false } = {}) {
    ensureLoaded();
    const p = profile(String(profileId || '')); const rec = p ? reg.browsers[p.id] : null;
    const tid = String(targetId || '').toUpperCase();
    if (!p || isEph(p) || isMediated(p) || !rec || !B.isLiveBrowser(rec) || !TBS.TARGET_ID_RE.test(tid)) return null;
    // r683 (a): the keeper's own create (in flight, or one it reported) is its holder's by the keeper's word — no stamp over it
    if ((keeperCreating.get(p.id) || 0) > 0 || keeperMade.has(`${p.id}|${tid}`)) return null;
    // r683 (c): no opener while two agents' verbs were in flight — the witness is unclear, and unclear is not nobody: no stamp
    if (!opener && !witness && unclear) return null;
    const d = personDriving(p);
    if (!d) return null; // nobody drove it (or two drives at once): no stamp — the ownership rules as before
    if (d.made === 'browse' && (opener || witness)) return null; // a page's or an agent's tab while the person browses: the rules as before
    // RULING (i), said again (r683): ANY tab born in a takeover of A's view with no opener is A'S — rooted to A, NAMED; a page's tab
    // follows its opener (the popup rule) and is named only where its owner is the conversation taken over. The person's OWN tab is
    // one born while they drive THEIR OWN window, with no opener and no agent's verb.
    const person = d.made === 'browse';
    const at = now(); // the birth's instant (the window read below never moves it)
    if (d.made === 'takeover' && !opener && !witness) {
      // r694 (1): A TAKEOVER BIRTH IS A'S ONLY WHEN IT IS BORN IN A'S OWN WINDOW — a tab the person opens in another holder's window
      // or in their own, or one a client the hub does not drive makes elsewhere, falls to the naming it had before the unit (no stamp)
      const l0 = B.findLease(reg.leases, p.id, d.of);
      const own = l0 && WIN.hasOwnWindow(l0, WIN.instanceOf(rec)) ? WIN.windowIdOf(l0.windowId) : null;
      const born = own == null ? null : await bornWindowOf(rec, tid);
      if (own == null || born == null || born !== own) {
        log.log?.(`[browser] "${p.label}": tab ${tid.slice(0, 8)} born while the person drove (a takeover of ${d.of}) ${own == null ? 'and that conversation has no window of its own here' : born == null ? 'in a window that did not answer' : `in window ${born}, not that conversation's own (${own})`} — not rooted to it, no stamp (the naming before the birth stamp)`);
        return null;
      }
      const l = B.findLease(reg.leases, p.id, d.of); // re-read after the window's answer: the lease may have gone meanwhile
      if (!l || reg.browsers[p.id] !== rec || !B.isLiveBrowser(rec)) return null;
      l.tabRoots = TBS.addRoot(Array.isArray(l.tabRoots) ? l.tabRoots : [], tid);
    }
    const stamps = { ...bornOf(p.id) };
    stamps[tid] = { made: d.made, ...(d.of ? { of: d.of } : {}), person, at };
    const keys = Object.keys(stamps); if (keys.length > BORN_KEEP) for (const k of keys.slice(0, keys.length - BORN_KEEP)) delete stamps[k];
    rec.bornBy = stamps; commit();
    log.log?.(`[browser] "${p.label}": tab ${tid.slice(0, 8)} born while the person drove (${d.made === 'browse' ? 'their browsing window' : 'a takeover of ' + d.of}) — ${person ? 'the person\'s own tab' : opener ? 'its opener\'s, named «opened in your takeover» on that conversation\'s view' : 'rooted to ' + d.of + ', named «opened in your takeover» on its view'}`);
    return stamps[tid];
  }
  /** r694 (1): the window a just-born tab is in, read NOW and bounded (BORN_WINDOW_MS) — null when it did not answer in time. */
  const BORN_WINDOW_MS = 1000;
  async function bornWindowOf(rec, tid) {
    let timer = null;
    const late = new Promise((r) => { timer = setTimeout(() => r(null), BORN_WINDOW_MS); if (timer.unref) timer.unref(); });
    try { return await Promise.race([refreshTabWindow(rec, tid), late]); } catch { return null; } finally { clearTimeout(timer); }
  }
  function bornOf(profileId) { const rec = reg.browsers[String(profileId || '')]; return rec && rec.bornBy && typeof rec.bornBy === 'object' && !Array.isArray(rec.bornBy) ? rec.bornBy : {}; }
  function personRootsOf(profileId) { return Object.entries(bornOf(profileId)).filter(([, s]) => s && s.person).map(([id]) => id); }
  function pruneBorn(p, targets) {
    const rec = reg.browsers[p.id]; if (!rec || !rec.bornBy || typeof rec.bornBy !== 'object') return;
    const live = new Set(TBS.pageTargets(targets).map((x) => x.targetId)); let n = 0;
    for (const id of Object.keys(rec.bornBy)) if (!live.has(id)) { delete rec.bornBy[id]; n++; }
    if (n) commit();
  }
  // ── B-e674 unit 1 (the coordinator's r548 / r562): THE FRONT OF THE VIEWED HOLDER'S WINDOW, SAID (src/browser-tabs.js
  // frontVerdict). Asked only when two or more tabs share that window. The view's own tab on show is asked first: visible ⇒ it
  // is the front (one read). Otherwise the window's other tabs are asked at once, at most TBS.FRONT_READS_MAX, each bounded
  // by the reader's own timeout. ONE journal line a change (a foreign front, and its end). Never an act: nothing is moved,
  // closed or activated for it (CDP has no move; a close loses a page; an activation changes what someone sees).
  const frontSaid = new Map(); // `${profileId}|${view}` → `${windowId}|${targetId}|${state}`, the last front this view's journal said
  const FRONT_SAID_KEEP = 512;
  async function frontOfView(p, rec, { windows = {}, words = {}, act = null, bk = null, h = null, leases = [], whose = {} } = {}) {
    const human = !bk;
    const own = (Array.isArray(leases) ? leases : []).find((l) => l && l.word === (human ? 'you' : 'agent'));
    const viewWindow = own ? own.windowId : act && windows[act] != null ? windows[act] : null;
    const v0 = TBS.frontVerdict({ windowId: viewWindow, windows, visible: [], owners: words, human });
    if (v0.state !== 'unread') return v0; // no window known, or one tab in it: nothing can stand in front
    const mates = Object.keys(windows).filter((id) => WIN.windowIdOf(windows[id]) === v0.windowId);
    const ask = async (id) => { // a read that throws, or answers no `ok`, is no answer (⇒ never a guessed front)
      const o = { timeoutMs: TBS.FRONT_READ_MS }; // B-e674 unit 2: shorter than the reader's own bound — one hung page delays the record ≤ ~2 s
      try { const r = await (typeof visibilityOfFn === 'function' ? visibilityOfFn(rec.cdpUrl, id, o) : require('./browser-viewport.js').visibilityOf(rec.cdpUrl, id, o)); return r && r.ok ? String(r.visibility || '') : null; } catch { return null; }
    };
    const mine = act && mates.includes(act) ? act : human && h && h.ownTab && mates.includes(String(h.ownTab).toUpperCase()) ? String(h.ownTab).toUpperCase() : null;
    let visible = [];
    if (mine && (await ask(mine)) === 'visible') visible = [mine];
    else { const rest = mates.filter((id) => id !== mine).slice(0, TBS.FRONT_READS_MAX); const ans = await Promise.all(rest.map(ask)); visible = rest.filter((id, i) => ans[i] === 'visible'); }
    // B-e674 unit 2 (its round's should 4): a tab's window is KEPT for its life (tabWindowsOf), and a person can drag a tab into
    // another window on a headed browser — the ONE tab about to be named in front has its window read again now; elsewhere ⇒ it
    // is not this window's front (the kept window follows it)
    if (visible.length === 1 && visible[0] !== mine) {
      const now0 = await refreshTabWindow(rec, visible[0]);
      if (now0 != null && now0 !== WIN.windowIdOf(v0.windowId)) { windows[visible[0]] = now0; visible = []; }
    }
    const v = TBS.frontVerdict({ windowId: viewWindow, windows, visible, owners: words, human });
    sayFront(p, bk, v, whose);
    return v;
  }
  /** One tab's window, read NOW (never the kept one), and kept again — null when it did not answer (the kept one stands). */
  async function refreshTabWindow(rec, id) {
    let w = null;
    try { w = WIN.windowIdOf(await (typeof windowOfFn === 'function' ? windowOfFn(rec.cdpUrl, id) : require('./browser-viewport.js').windowOf(rec.cdpUrl, id))); } catch { w = null; }
    if (w != null) tabWindowKept.set(`${rec.cdpUrl}|${WIN.instanceOf(rec) || ''}|${id}`, w);
    return w;
  }
  function sayFront(p, bk, v, whose) {
    if (!v || (v.state !== 'foreign' && v.state !== 'own')) return; // unread: nothing known, nothing said
    const k = `${p.id}|${bk || 'person'}`;
    const was = frontSaid.get(k) || '';
    const at = `${v.windowId}|${v.targetId}|${v.state}`;
    if (was === at) return;
    frontSaid.delete(k); frontSaid.set(k, at);
    if (frontSaid.size > FRONT_SAID_KEEP) frontSaid.delete(frontSaid.keys().next().value);
    const view = bk ? `the conversation ${bk}'s` : 'the person\'s browsing';
    if (v.state === 'own') { if (was.endsWith('|foreign')) log.log?.(`[browser] "${p.label}": ${view} window ${v.windowId} has its own tab ${String(v.targetId).slice(0, 8)} in front again`); return; } // a front never said foreign ends nothing
    const w = whose && whose[v.targetId];
    const who = v.owner === 'other' ? `another conversation's tab${w && w.sessionId ? ` (session ${w.sessionId})` : w && w.job ? ` (job ${w.job})` : ''}` : v.owner === 'you' ? 'the person\'s own tab' : 'a tab nobody holds';
    log.log?.(`[browser] "${p.label}": in front of ${view} window ${v.windowId}: ${who} ${String(v.targetId).slice(0, 8)} — said on its view; nothing moved, closed or activated`);
  }
  /** accept-fixes-strip F8: WHO holds another holder's tab — `{sessionId}` (the view names the conversation as its sidebar
   *  does) or `{job, name}` (a Background Work job's handle: its job's name, read live). null = not known. */
  function whoseOf(profileId, key) {
    const c = reg.children[String(key || '')];
    if (c && c.job) { let n = null; try { n = jobName(String(c.job)); } catch { n = null; } return { job: String(c.job), name: n ? String(n).slice(0, 120) : null, sessionId: null }; }
    const l = B.findLease(reg.leases, profileId, String(key || ''));
    return l && l.sessionId ? { sessionId: String(l.sessionId) } : null;
  }
  /**
   * THE USER'S ✕ AND SWITCH on a tab row (the bridge's `tab-act`; the facts are re-read HERE — never the client's words):
   *   his browsing window (`human`): a switch = the address row's `tab <id>` (navigateHuman: his tabs, an orphan he takes);
   *     a close = one of HIS tabs, never his last (Close ends his browsing), under HIS session — his current tab first moves
   *     to another of his (a closed bound tab would leave his window with nothing to show);
   *   a conversation's view: the viewed agent's tab only while THIS viewer holds the takeover (the keeper's input state,
   *     not the client's claim), never its last, never on a mediated browser — under the conversation's own session (its
   *     current tab first moves to a neighbour of its own) and RECORDED on the takeover's cycle (said at the handback);
   *     his own tab (`you`) closes under his session; another conversation's / nobody's ⇒ `not_your_tab`, nothing ran.
   * → {ok, act, targetId, switchedTo} | throws a named refusal.
   */
  async function userTabAct({ target, viewerId = null, act, targetId } = {}) {
    ensureLoaded();
    const id = String(targetId || '').toUpperCase();
    if (!TBS.USER_TAB_ACTS.includes(act) || !TBS.TARGET_ID_RE.test(id)) throw namedError('bad-request', 'a tab act is switch | close with a CDP target id');
    if (!target || !target.kind) throw namedError('not-found', 'no browser');
    const pinTab = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
    const pin = pinTab ? ['--pin-tab'] : [];
    const refuse = (v, facts) => { log.log?.(`[browser] the user's tab ${act} on ${id.slice(0, 8)} refused ${v.code} (${facts}) — nothing ran`); throw namedError(v.code, v.error); };
    // HIS browsing window
    if (target.kind === 'human') {
      const h = humanByKey(target.key);
      if (!h) throw namedError('not_browsing', 'you are not browsing this browser any more');
      if (act === 'stop') throw namedError('bad-request', 'a stop is a conversation view\'s door (lane ui-needs-a-button: the loop banner)');
      if (act === 'switch') { const r = await navigateHuman(h.key, { tab: id }); return { ok: true, act, targetId: id, switchedTo: id, ...(r.adopted ? { adopted: true } : {}) }; }
      return closeHumanTab(h, id);
    }
    // a conversation's view: its own browser / a helper's (every page its) or a shared profile's (the ownership read)
    const bk = target.kind === 'child' ? String(target.handle || '') : (target.kind === 'ephemeral' ? String(target.ns || target.sessionName || '').replace(/^vs-/, '') : String(target.sessionName || '').replace(/^vs-/, ''));
    const eph = target.kind === 'ephemeral' || target.kind === 'child';
    const e = eph ? ephemeralFor(bk) : null;
    const p = eph ? (e ? profile(e.profileId) : null) : profile(target.profileId);
    const rec = p ? reg.browsers[p.id] : null;
    if (!p || !B.isLiveBrowser(rec) || !isLocalRec(rec)) throw namedError('browser_stopped', 'this browser is not running');
    const profileId = eph ? null : p.id;
    const s = inputs.get(inputKey(bk, profileId));
    const driving = !!(s && s.input === 'user' && s.takenBy && viewerId !== null && s.takenBy.viewerId === viewerId);
    let opts, ns, rows, owner = 'agent', counts;
    if (eph) {
      ns = null; opts = { extraEnv: pairsEnv(pairsOf(p.id) || []) };
      rows = await tabListUnder(null, opts);
      if (!rows) throw namedError('tabs_unreadable', TBS.tabRefusalText('tabs_unreadable'));
      if (!tabRowOf(rows, id)) throw namedError('no_such_tab', TBS.tabRefusalText('no_such_tab'));
      counts = { agent: rows.length, you: 0 };
    } else {
      if (isMediated(p)) refuse(TBS.userTabVerdict({ act, owner: 'agent', mediated: true }), 'a mediated browser');
      opts = await leaseCliOpts(p.id, bk); ns = nsOf(p.id);
      if (!opts) throw namedError('browser_no_cdp', noCdpError(p));
      rows = await tabListUnder(ns, opts);
      const targets = rows ? await tabTargetsOf(rawCdpOf(p.id, opts)) : null;
      if (!rows || !targets) throw namedError('tabs_unreadable', TBS.tabRefusalText('tabs_unreadable'));
      if (!tabRowOf(rows, id)) throw namedError('no_such_tab', TBS.tabRefusalText('no_such_tab'));
      const act0 = (rows.find((x) => x.active) || {}).targetId || null;
      const owners = TBS.tabOwners({ targets, holders: tabHoldersOf(p.id, act0 ? { [bk]: String(act0).toUpperCase() } : {}) });
      const h = humans.get(p.id);
      owner = TBS.ownerWord(owners.get(id), { me: bk, humanKey: h ? h.key : null });
      const listed = new Set(rows.map((x) => String(x.targetId).toUpperCase()));
      counts = { agent: [...(TBS.ownSetOf(owners, bk) || [])].filter((x) => listed.has(x)).length, you: h ? [...(TBS.ownSetOf(owners, h.key) || [])].filter((x) => listed.has(x)).length : 0 };
      if (owner === 'you' && h && act !== 'stop') {   // a stop is judged below (it never closes a tab)
        const v = TBS.userTabVerdict({ act, owner, human: false, counts });
        if (!v.ok) refuse(v, 'his own tab from a conversation\'s view');
        return closeHumanTab(h, id);
      }
    }
    // lane ui-needs-a-button (主开发 Q2 — the loop banner's «Stop loading»): THE PERSON'S STOP — Page.stopLoading on that one tab
    // (server-side CDP; the endpoint never leaves); nothing else changes. RECORDED: on the takeover's cycle while this viewer drives
    // (said to the agent at the handback) and in the journal by name; an exec that fails takes its record back
    if (act === 'stop') {
      return personStop({ id, owner, driving, counts, row: tabRowOf(rows, id), target, withCdpUrl, refuse,
        note: (told) => noteUserTabAct(bk, profileId, told), unnote: (rec, why) => unnoteUserTabAct(bk, profileId, rec, why),
        said: (rec) => log.log?.(`[browser] ${eph ? `${bk} (its own browser)` : `${bk} on ${p.id}`}: viewer ${viewerId}'s stop on ${id.slice(0, 8)} (${owner}'s tab) — the page stopped loading, nothing else changed${rec ? ' (said to the agent at the handback)' : ''}`) });
    }
    const row = tabRowOf(rows, id);
    const active = (rows.find((x) => x.active) || {}).targetId || null;
    const isActive = !!active && String(active).toUpperCase() === id;
    const v = TBS.userTabVerdict({ act, owner, human: false, driving, mediated: false, counts, active: isActive });
    if (!v.ok) refuse(v, `${owner}, ${driving ? 'driving' : 'not driving'}, ${counts.agent} of the agent's`);
    const who = eph ? `${bk} (its own browser)` : `${bk} on ${p.id}`;
    // lane browser-windows (U0b, userW's inc-muqdohf0-hkjc): a click on the chip of the tab the session is ON is not a no-op —
    // that tab may be BEHIND another one in its window (Chrome activated a neighbour when a tab closed): it paints nothing
    // and the view is a frozen picture. The session's own switch (`tab <id>`, the binary activates it) brings it forward;
    // its current tab is unchanged, so nothing is told to the agent — the journal and the view say it
    if (v.noop && act === 'switch' && !eph) {
      if (!driving) refuse(TBS.userTabVerdict({ act, owner: 'agent', human: false, driving: false, mediated: false, counts }), 'not driving');
      const r = await rt.exec(ns, [...pin, 'tab', id, '--json'], { ...opts, timeout: 30000 });
      if (execFailed(r)) throw namedError('tab_failed', execWhy(r));
      log.log?.(`[browser] ${bk} on ${p.id}: the user brought the agent's current tab ${id.slice(0, 8)} to the front of its window while driving it (the agent's tab is unchanged — nothing to tell it)`);
      return { ok: true, act, targetId: id, switchedTo: id, broughtForward: true };
    }
    if (v.noop) return { ok: true, act, targetId: id, switchedTo: id, noop: true };
    // verify F3 — "checked at the door is not allowed at the answer": `driving` was read BEFORE the tab list and the CDP
    // reads; a handback (explicit, idle, viewer-left) landing inside them returned control to the agent, and the switch /
    // close still ran under its session, told to nobody. THIS viewer's takeover is re-asked right before EACH exec, and
    // the act is recorded on the takeover's cycle IN THE SAME TICK as that check — a handback landing while the exec runs
    // still carries it (the agent is told); an exec that fails takes its record back.
    const stillDriving = () => { const s2 = inputs.get(inputKey(bk, profileId)); return !!(s2 && s2.input === 'user' && s2.takenBy && viewerId !== null && s2.takenBy.viewerId === viewerId); };
    const execDriving = async (argv, told, step) => {
      if (!stillDriving()) refuse(TBS.userTabVerdict({ act, owner: 'agent', human: false, driving: false, mediated: false, counts }), `the takeover ended while the tabs were read — ${step} not run`);
      const rec = noteUserTabAct(bk, profileId, told);
      const r = await rt.exec(ns, argv, { ...opts, timeout: 30000 });
      if (execFailed(r)) { unnoteUserTabAct(bk, profileId, rec, execWhy(r)); throw namedError('tab_failed', execWhy(r)); }
      return r;
    };
    let switchedTo = null;
    const pinFor = eph ? [] : pin; // an ephemeral session runs WITHOUT --pin-tab (resolve answers pinTab:false) — and the flag is sticky per session
    if (act === 'switch') {
      await execDriving([...pinFor, 'tab', id, '--json'], { kind: 'tab-switch', ...tabFacts(row) }, 'the switch');
      switchedTo = id;
    } else {
      // the tab on show goes: the session first moves to a neighbour of its own (the live view keeps a picture; the agent's
      // next command runs there — and is told so at the handback, never a tab_gone of the user's making)
      if (isActive) {
        const i = rows.findIndex((x) => String(x.targetId).toUpperCase() === id);
        const ownIds = eph ? rows.map((x) => String(x.targetId).toUpperCase()) : null;
        const mine = (x) => (eph ? ownIds.includes(String(x.targetId).toUpperCase()) : true);
        let nb = null;
        if (!eph) {
          const targets = await tabTargetsOf(rawCdpOf(p.id, opts));
          const own2 = targets ? TBS.ownSetOf(TBS.tabOwners({ targets, holders: tabHoldersOf(p.id, { [bk]: id }) }), bk) : null;
          if (!own2) throw namedError('tabs_unreadable', TBS.tabRefusalText('tabs_unreadable'));
          nb = [...rows.slice(i + 1), ...rows.slice(0, i).reverse()].find((x) => own2.has(String(x.targetId).toUpperCase()) && String(x.targetId).toUpperCase() !== id) || null;
        } else nb = [...rows.slice(i + 1), ...rows.slice(0, i).reverse()].find((x) => mine(x) && String(x.targetId).toUpperCase() !== id) || null;
        if (!nb) refuse(TBS.userTabVerdict({ act: 'close', owner: 'agent', driving: true, counts: { agent: 1 } }), 'no other tab of the agent\'s to move to');
        await execDriving([...pinFor, 'tab', String(nb.targetId).toUpperCase(), '--json'], { kind: 'tab-switch', ...tabFacts(nb) }, 'the move to a neighbour');
        switchedTo = String(nb.targetId).toUpperCase();
      }
      await execDriving(['tab', 'close', id, '--json'], { kind: 'tab-close', ...tabFacts(row) }, 'the close');
      if (!eph) { const l = B.findLease(reg.leases, p.id, bk); if (l && Array.isArray(l.tabRoots)) { l.tabRoots = TBS.cleanRoots(l.tabRoots.filter((x) => String(x).toUpperCase() !== id)); save(); } }
    }
    log.log?.(`[browser] ${who}: the user ${act === 'switch' ? 'switched the agent\'s current tab' : 'closed a tab of the agent\'s'} while driving it${switchedTo && act === 'close' ? ' (its current tab moved to a neighbour of its own first)' : ''} — the agent is told at the handback`);
    return { ok: true, act, targetId: id, switchedTo };
  }
  /** One of HIS tabs closes under HIS session — never his last; his current tab first moves to another of his; the tab his
   *  set is rooted at, closed, hands the root to the ones that stay (his popups stay his). */
  async function closeHumanTab(h, id) {
    const p = profile(h.profileId);
    const rec = p ? reg.browsers[p.id] : null;
    if (!p || !B.isLiveBrowser(rec) || !isLocalRec(rec)) throw namedError('browser_stopped', 'this browser is not running');
    const o = await leaseCliOpts(p.id, h.key);
    if (!o) throw namedError('browser_no_cdp', noCdpError(p));
    const view = await humanTabView(h);
    if (!view) throw namedError('tabs_unreadable', TBS.tabRefusalText('tabs_unreadable'));
    const own = view.own;
    const pinTab = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
    const v = TBS.userTabVerdict({ act: 'close', owner: own.has(id) ? 'you' : 'other', human: true, counts: { you: own.size } });
    if (!v.ok) { log.log?.(`[browser] ${h.profileId}: the user's ✕ on ${id.slice(0, 8)} refused ${v.code} — nothing ran`); throw namedError(v.code, v.error); }
    const ns = nsOf(p.id);
    const rows = await tabListUnder(ns, o);
    const active = rows ? String((rows.find((x) => x.active) || {}).targetId || '').toUpperCase() : '';
    let switchedTo = null;
    if (active === id) {
      const order = rows ? rows.map((x) => String(x.targetId).toUpperCase()) : [...own];
      const i = order.indexOf(id);
      const nb = [...order.slice(i + 1), ...order.slice(0, Math.max(0, i)).reverse()].find((x) => own.has(x) && x !== id) || null;
      if (!nb) throw namedError('last_tab', TBS.tabRefusalText('last_tab', { yours: true }));
      const r0 = await rt.exec(ns, [...(pinTab ? ['--pin-tab'] : []), 'tab', nb, '--json'], { ...o, timeout: 30000 });
      if (execFailed(r0)) throw namedError('tab_failed', execWhy(r0));
      switchedTo = nb;
    }
    const r = await rt.exec(ns, ['tab', 'close', id, '--json'], { ...o, timeout: 30000 });
    if (execFailed(r)) throw namedError('tab_failed', execWhy(r));
    // his set stays his: a closed ROOT (or a tab that opened others) hands over to the tabs that stay (the one on show first)
    const rest = [...own].filter((x) => x !== id);
    const wasRoot = String(h.ownTab || '').toUpperCase() === id || (Array.isArray(h.adopted) && h.adopted.some((x) => String(x).toUpperCase() === id));
    const hadKids = (view.targets || []).some((x) => x && String(x.openerId || '').toUpperCase() === id);
    if (rest.length && (wasRoot || hadKids)) {
      const head = switchedTo || (String(h.ownTab || '').toUpperCase() !== id ? h.ownTab : rest[0]) || null;
      h.ownTab = head;
      h.adopted = TBS.cleanRoots(rest.filter((x) => x !== String(head || '').toUpperCase()));
      commit();
    }
    log.log?.(`[browser] ${h.profileId}: the user closed one of his own tabs${switchedTo ? ' (his window moved to another of his first)' : ''}; ${rest.length} of his remain`);
    return { ok: true, act: 'close', targetId: id, switchedTo, human: true };
  }
  /** takeover C3 (§5.2 "conversation gone"): stop an ephemeral browser whose
   *  lease dropped and remove its record — by itself (it has no name and no
   *  reference beyond its owner). A lease that came back meanwhile (a resume
   *  inside the grace) keeps it. Single flight per record. */
  function retireEphemeral(profileId, why = 'conversation gone') {
    if (retiring.has(profileId)) return retiring.get(profileId);
    const pr = (async () => {
      const p = profile(profileId);
      if (!p || !isEph(p)) return { removed: false, why: 'not an ephemeral record' };
      // keeper-sweep-yields L2 (measured: the stop's `close --all` under the record's own session was ONE browser-CLI start
      // per record — a start forks the whole hub and holds its main thread until the child execs, the field's second per
      // record): a record whose daemon is SEEN gone (its recorded pid is not there, or is another process now) has nothing for the CLI to close. It
      // is recorded stopped and the browser its dead daemon left is ended by identity — the tick's own act for a gone daemon
      // (markEphemeralGone, then its reap awaited) — with no CLI start. A daemon that runs is still closed by the CLI.
      { const rec0 = reg.browsers[profileId];
        if (B.isLiveBrowser(rec0) && isLocalRec(rec0) && !starting.has(profileId) && !stopping.has(profileId) && daemonSeenGone(rec0)) {
          markEphemeralGone(rec0, 'its retire');
          const rp = reaping.get(profileId); if (rp) { try { await rp; } catch { /* its own journal line */ } }
        } }
      // keeper-sweep-yields F2: NOTHING OF A CARRIED CONVERSATION IS ENDED BY THE SWEEP — the lease is read again after the
      // reap's await and before the stop (a conversation resumed meanwhile may have started its browser again)
      if (reg.leases.some((l) => l.profileId === profileId)) return { removed: false, kept: true, why: 'its conversation is carried again' };
      { const ph = passkeyHeldNow();   // r3702: the passkeys HELD — the retire asks BEFORE its stop (the road's order is the law's): nothing stopped, nothing removed
        if (ph) { if (!retireHeldSaid) log.warn?.(`[browser] ephemeral ${profileId}: not retired while the passkeys could not be read (${ph.code || 'unread'}) — nothing stopped or removed; said once, the ephemeral records retire at the first pass after they read`); retireHeldSaid = true; return { removed: false, why: 'the passkeys could not be read' }; }
        retireHeldSaid = false; }   // the store reads: the «said once» mark goes back
      try { if (B.isLiveBrowser(reg.browsers[profileId])) await stop(profileId, { why }); } catch (e) { log.warn?.(`[browser] ephemeral ${profileId}: stop failed — ${e && e.message}`); }
      if (reg.leases.some((l) => l.profileId === profileId)) return { removed: false, kept: true, why: 'its conversation is carried again' };
      if (B.isLiveBrowser(reg.browsers[profileId])) { log.warn?.(`[browser] ephemeral ${profileId} "${p.label}": its browser would not stop — the record is kept for the next pass`); return { removed: false, why: 'still running' }; }
      try { removeProfile(profileId); } catch (e) { if (!(e && e.code === 'passkeys_unread') || !retireHeldSaid) log.warn?.(`[browser] ephemeral ${profileId}: not removed — ${e && e.message}${e && e.code === 'passkeys_unread' ? ' (said once while the passkeys cannot be read: the ephemeral records wait for the next pass after they read)' : ''}`); if (e && e.code === 'passkeys_unread') retireHeldSaid = true; return { removed: false, why: String(e && e.message) }; }
      retireHeldSaid = false;
      return { removed: true };
    })();
    retiring.set(profileId, pr);
    return pr.finally(() => { if (retiring.get(profileId) === pr) retiring.delete(profileId); });
  }
  /** keeper-sweep-yields L1: THE ORPHAN SWEEP IN BOUNDED STEPS — one record per step, the main loop given back before each
   *  (setImmediate), so no loop turn holds more than one record's retire whatever the count (kb-design-lessons §19: no step
   *  holds the loop 250 ms); at boot and on the tick alike. A record whose conversation is carried again by the time its step
   *  comes is kept (no stop, no removal). The walk's removals reach the registry file once per piece and at its end (F5, below),
   *  and at a stop (shutdown, K1), so a restart redoes at most one piece. Its one reason is the conversation's end (test-architecture §54b reads every
   *  retireEphemeral caller's reason as a literal). → the results in order. */
  const yieldLoop = () => new Promise((res) => setImmediate(res));
  // keeper-sweep-yields F5: ONE REGISTRY WRITE AND ONE BROADCAST PER PIECE OF THE WALK, NOT PER RECORD — a removal the walk
  // makes (its id in sweepIds) marks sweepDirty instead of committing; the walk commits once per piece (SWEEP_PIECE_MS of the
  // REAL clock — never the injected now) and at its end. The keeper's batched() is synchronous (its finally runs when fn
  // returns), so around an async walk it would defer every other conversation's commit too; only the walk's own are deferred.
  // A restart redoes at most one piece (the file still names the records removed since the last write).
  async function retireInSteps(ids) {
    const out = [];
    let pieceAt = Date.now();
    const flush = () => { if (sweepDirty) { sweepDirty = false; commit(); } pieceAt = Date.now(); };
    try {
      for (const id of ids) {
        await yieldLoop();
        if (reg.leases.some((l) => l.profileId === id)) { out.push({ removed: false, kept: true, why: 'its conversation is carried again' }); continue; }
        sweepIds.add(id);
        try { out.push(await retireEphemeral(id, 'conversation gone').catch(() => ({ removed: false }))); } finally { sweepIds.delete(id); }
        if (Date.now() - pieceAt >= SWEEP_PIECE_MS) flush();
      }
    } finally { flush(); }
    return out;
  }
  /** `browser.headed` as STORED (true | false | null = unset) — the input of the ONE resolution (PURE
   *  browser-display.resolveHeaded, lane hooks-create H5), made where the display is probed: this keeper's launch fact
   *  (`displays.factFor({preference})`) for a local browser, the paired machine's own `browser-serve start` for its
   *  browser (that machine's display decides — this hub's would open a window on a remote desktop that has one). Base
   *  configs carry the stored value; the planned config every call names carries the resolved one. */
  function headedSetting() { const v = setting('browser.headed', ''); return v === true || v === 'yes' ? true : (v === false || v === 'no' ? false : null); }
  /** lane headless-fallback: one journal line per launch whose display fact changed something (a fallback, a recovery). */
  function sayDisplay(fact, what) { const line = DSP.journalLine(fact, what); if (line) { try { log.warn?.(`[browser] ${line}`); } catch { /* none */ } } }
  /** lane headless-fallback: THIS machine's display right now (Settings → Agent browser's read-only line) — a fresh probe. */
  function machineDisplay() { return displays.probe().then((v) => { displayCache = { v, at: now() }; return v; }); }
  /** lane browser-recipes: the LAST probe's verdict, sync (the tools intro is built synchronously) — a missing or stale
   *  (> 60 s) one asks a fresh probe for the NEXT reader (never a timer); null until a first probe answered. */
  let displayCache = null;
  function machineDisplayCached() {
    if (!displayCache || now() - displayCache.at > 60000) { if (!displayCache || !displayCache.pending) { const c = displayCache || { v: null, at: 0 }; c.pending = true; displayCache = c; machineDisplay().catch(() => { c.pending = false; }); } }
    return displayCache ? displayCache.v : null;
  }
  /** lane headless-fallback addendum: `browser.noDisplayMode` — 'auto' (a hidden window where Xvfb is here, else headless) | 'headless'. */
  function noDisplayMode() { return DSP.noDisplayModeOf(setting('browser.noDisplayMode', 'auto')); }
  async function start(profileId, { why = 'attach', browserKey = null } = {}) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p) throw namedError('not-found', `no profile ${profileId}`);
    { const pr = placeRefusalOf(p); if (pr) throw pr; }   // r2172 (a): never started «not applied» — it would read the machine's real position
    // the moved2 cure 3 (its read's should): an ADOPTED profile whose folder has not moved yet (its record's landing is owed) is never
    // started — a browser launched on the empty target would make the move fail under it
    if (adopting.has(String(profileId))) throw namedError('adopt_pending', `profile "${p.label}" is being adopted — its folder moves once its record is on disk; start it again in a moment`);
    const cur = reg.browsers[profileId];
    // takeover C3: an ephemeral daemon that idled out between two ticks is
    // judged NOW (a /proc read) so the verb restarts it instead of running on
    // a record that only looks live
    if (isEph(p) && B.isLiveBrowser(cur) && !starting.has(profileId) && daemonGone(cur)) markEphemeralGone(cur, 'a start');
    // VERIFY r2 M1: a NAMED profile's record is judged by its PROCESS too (the ephemeral rule) — a ready record whose
    // daemon is gone is recorded stopped and its browser ended before this start launches (never returned as live)
    if (!isEph(p) && cur && cur.state === 'ready' && isLocalRec(cur) && !starting.has(profileId) && !stopping.has(profileId) && daemonGone(cur)) { markDaemonGone(cur, 'a start'); commit(); }
    // OWNER RULING A (1): ONE BROWSER PER PROFILE — a live record is JOINED (the same process, the same CDP endpoint and
    // stream target), a launch in flight is WAITED on (two conversations' first commands at once used to get the half-
    // started record back and answer browser_no_cdp), and only a dead record launches (after the lane-H lock judgement)
    const how = B.joinOrLaunch({ record: cur, starting: starting.has(profileId) });
    if (how === 'wait') return starting.get(profileId);
    if (how === 'join') {
      // verify r3 M1 (a): a live record returned to a verb is re-captured first (the daemon may have relaunched its Chrome)
      // r4 MAJOR 1: …and a daemon with NO browser (the user closed it) is healed here — a verb is asking for it
      if (cur.state === 'ready' && isLocalRec(cur) && !starting.has(profileId) && !stopping.has(profileId)) await followRelaunch(cur, 'a start', { force: true });
      return browserView(reg.browsers[profileId] || cur); // lane browser-unstable-rejudge: a fresh daemon may have replaced it
    }
    if (isEph(p)) return startEphemeral(p, { why });
    const cap = ceilingNow({ ephemeral: false, browserKey });
    if (cap) throw namedError(cap.code, cap.error, { holders: cap.holders, scope: cap.scope, others: cap.others });
    const fence = B.configFence(userConfig());
    if (fence) throw namedError('fence_refused', `this machine's ~/.agent-browser/config.json restricts browsing to ${fence.join(', ')}, and the CLI refuses a domain fence beside a profile — a persistent profile cannot start under it (§6.3)`);
    // P4 second half (§7.4 / §7.5 / D33 / D34): the capability control for
    // the machine this profile runs on, then — for a key-bearing row on THIS
    // machine — THE ONE RESOLVE before the spawn. Both refuse BEFORE a browser
    // record exists: `backend_unavailable` names what is missing,
    // `backend_no_key` names the row and the one click out, and neither
    // spawns anything (a silent fallback to chromium is what D33 rejects).
    const pc = control(p.provider, { host: p.host || null });
    if (!pc.ok) throw namedError(pc.code === 'provider_unavailable' ? 'backend_unavailable' : pc.code, pc.error, { provider: p.provider, missing: (rowOf(p.provider) || {}).binary || null });
    const intId = p.host ? null : SW.integrationIdFor(p.provider, rowOf); // the keeper's own table, as the gate reads it
    let key = null, vendorEnv = {};
    if (intId) {
      key = keysOf().keyFor(intId);
      // a row whose key is OPTIONAL (its key row declares keyRequired: false) starts without one
      if ((!key || key.source === 'none') && keyRequired(intId)) throw namedError('backend_no_key', `${p.provider} needs a key and none is configured for ${intId}${key && key.why ? ' (' + key.why + ')' : ''} — open ⚙ → Integrations → ${intId} and paste yours, or use the cluster default there`, { provider: p.provider, integrationId: intId, action: { openIntegration: intId, label: 'open Integrations' } });
      vendorEnv = key && key.source !== 'none' ? SW.vendorEnvFor(p.provider, key.values, rowOf) : {};
    }
    let argvPrefix = [];
    // a launch's own executable / arguments ride agent-browser's own ENV names, carried by EVERY call of the keeper's
    // session (`rec.launchEnv`) — as argv they rode `open` only, and the keeper's own `get cdp-url` right after it
    // relaunched the browser without them (measured on 0.38.1)
    let providerEnv = {};
    // lane dc-browser-providers: THE ROW's launch shape (src/browser-profiles.js PROVIDERS) — never the provider's id
    const prow = rowOf(p.provider) || {}; // the keeper's own table (a gate's `providers` override reaches the launch too — one seam)
    // lane browser-admin 2a: a profile pinned to one Chrome build (a `buildChoice` row) — judged NOW (a build gone since it
    // was chosen is refused by name before any record exists); its executable rides the launch view of EVERY call
    let buildEnv = !p.host ? launchBuildOf(p) : {}; // lane engine-plugin: `let` — an engine choice is resolved inside p0 below
    if (!p.host && prow.buildChoice && buildEnv.executablePath) providerEnv = SW.launchEnvFor(p.provider, { executablePath: buildEnv.executablePath });
    if (!p.host) argvPrefix = SW.launchArgsFor(p.provider);
    // lane browser-stderr-pipe: a local launch that starts a Chrome carries the quiet log switches — in its config (a record
    // stamped `quietLog`, quietLogFor) and in a provider's own AGENT_BROWSER_ARGS (an env list replaces the config's)
    const quietLog = !p.host && !!prow.starts && !argvPrefix.length;
    if (quietLog && providerEnv.AGENT_BROWSER_ARGS) providerEnv = { ...providerEnv, AGENT_BROWSER_ARGS: B.launchTail(String(providerEnv.AGENT_BROWSER_ARGS), null) }; // B-1789 cure: the launch tail (no mark: an env list of the provider's own)
    const p0 = (async () => {
      // lane engine-plugin: an ENGINE choice is judged HERE — its probe + launch options are I/O, asked inside the in-flight
      // start (a second start of this profile waits on this one) and before any record exists (a refusal leaves none). Its
      // program — the keeper's wrapper over the kernel — rides the build pin's own road (AGENT_BROWSER_EXECUTABLE_PATH), the
      // keeper's switches AGENT_BROWSER_ARGS (the mark + the automation flag the config's list would have carried + the quiet
      // switches, minus every name the engine gives), the engine's switches + env (ENGINE_ENV_KEYS only) the wrapper
      // B-8b87: THE PROFILE'S PROXY — judged and its login read BEFORE anything starts (a refusal leaves no record and no process)
      const pproxy = await profileProxyFor(p, { why, browserKey, starts: !!prow.starts });
      if (buildEnv.engineChoice) {
        buildEnv = await launchEngineOf(p, buildEnv.engineChoice);
        // lane engine-args-string r2: the CLI starts the keeper's WRAPPER (the engine's switches ride it whole); AGENT_BROWSER_ARGS
        // carries the keeper's part only — the quiet switches composed BEFORE the split, so a log switch the engine names is its own;
        // lane engine-spi-egress: + a wrapped engine's proxy switches (the KEEPER's part, carried even when the engine names none)
        const ew = engineProgramOf(p, buildEnv);
        providerEnv = { ...SW.launchEnvFor(p.provider, { executablePath: ew.program }), ...engineEnvOf(p, prow, buildEnv, null, quietLog) };
      }
      // lane tailnet-names: the tailnet road — asked before the record exists (the door listens before Chrome reads its PAC)
      const tn = await tailnetFor(p, { engine: !!buildEnv.engine || argvPrefix.length > 0, remote: !!p.host || !prow.starts });
      const ns = nsOf(profileId);
      const prevRec = reg.browsers[profileId] || null; // r2 M1: the browser the last launch recorded (its lock holder, if orphaned)
      const rec = { profileId, ns, pid: null, starttime: null, socketDir: null, cdpUrl: null, state: 'starting', startedAt: now(), endedAt: null, lastError: null, stoppedBy: null, lastLeaseDroppedAt: null, startedBy: why,
        // P4: WHERE the process is (a paired machine) / that there is no
        // process of ours at all (an external browser over CDP), the hub-side
        // forward of its loopback port, and the machine's own url + dir
        hostId: p.host || null, external: !prow.starts, forward: null, remoteCdpUrl: null, dir: null,
        // lane browser-propose (step 1): a chromium launch on THIS machine stops announcing automation (stamped before the
        // display fact reads the base file)
        automationFlag: automationFlagOn() && !p.host && !!prow.automationFlag,
        quietLog }; // lane browser-stderr-pipe: launched with the quiet log switches (its config carries them)
      // B-8b87: the profile's proxy on THIS road — its forwarder's loopback port, the ONE switch every call carries (the derived config,
      // the attach argv); an engine's launch carries it in its own egress pair (launchEngineOf)
      rec.proxyRoad = pproxy && !buildEnv.engine ? { arg: `--proxy-server=${await egressUrlFor(p.id, pproxy)}`, origin: `${pproxy.proxy.scheme}://${pproxy.proxy.host}:${pproxy.proxy.port}`, credential: pproxy.proxy.credential || '' } : null;   // round 3: + the login's NAME it was launched with
      rec.tailnet = tn; // lane tailnet-names: the stamp every call reads (displayed / the attach argv) — a different view relaunches
      // r5 LOW 3: the LAUNCH-MARK lineage rides every new record (a refused start too) — a profile once launched with the
      // mark never falls back to the pre-mark rule, whatever record comes next (set again at the launch below)
      if (prevRec && prevRec.mark) rec.mark = prevRec.mark;
      // lane profile-lock-roll (L1): the LAUNCH-HOST lineage rides every new record too (a refused start keeps the witness;
      // this machine's name is added only at the launch below)
      { const lh = launchHostsFor(prevRec, p.dir || null); if (lh.length) { rec.hosts = lh; rec.host = prevRec && prevRec.host ? prevRec.host : lh[lh.length - 1]; } }
      rec.egress = !p.host && (buildEnv.egress || rec.proxyRoad) ? egressRecordOf(profileId) : null;   // B-8b87: + a profile proxy's forwarder (the boot re-binds THAT port) // lane engine-spi-egress r2: the port this launch view names (a wrapped engine's)
      reg.browsers[profileId] = rec;
      commit();
      const failed = (code, msg) => { rec.state = 'failed'; rec.endedAt = now(); rec.lastError = msg; commit(); return namedError(code, msg); };
      if (rec.external) {
        // `cdp` (§7.1): reached, never launched — the loopback port (on the
        // paired machine, tunnelled; else here) becomes a hub-side url, and
        // the endpoint is asked /json/version so a dead port is a NAMED
        // refusal now rather than a session that launches a local browser
        let fwd;
        try { fwd = await acc().forwardCdp(p.host, p.cdpPort); } catch (e) { throw failed(e.code || 'host_unavailable', `cannot reach ${p.host || 'this machine'}: ${e.message}`); }
        const probe = await probeCdp(fwd.url);
        if (!probe.ok) { try { fwd.close(); } catch { /* none */ } throw failed('cdp_unreachable', `no browser answers CDP at ${p.host ? p.host + ':' : '127.0.0.1:'}${p.cdpPort} (${probe.error}) — start one with --remote-debugging-port=${p.cdpPort} on a NON-default --user-data-dir (Chrome ≥ 136 refuses the default one, §7.3)`); }
        rec.cdpUrl = fwd.url; rec.forward = p.host ? { remotePort: p.cdpPort, localPort: fwd.localPort } : null; rec.cdpBrowser = probe.browser || null;
        rec.state = 'ready';
        if (mediator) mediator.repoint(profileId, rec.cdpUrl); // P6: every mediated lease follows the browser
        p.lastUsedAt = now(); p.lastBackend = p.provider;
        commit();
        log.log?.(`[browser] ${profileId} "${p.label}" reached over CDP (${why}): ${p.host ? p.host + ':' + p.cdpPort + ' → 127.0.0.1:' + fwd.localPort : '127.0.0.1:' + p.cdpPort}${probe.browser ? ' (' + probe.browser + ')' : ''} — nothing started, nothing of ours to signal`);
        return browserView(rec);
      }
      if (p.host) {
        // a PAIRED machine runs it (§7.3 / D5 (b)): the browser-serve op
        // starts it there, the machine answers its own loopback CDP url, the
        // hub forwards that port; a start that reports no CDP url is refused
        // (an env with no CDP pair would launch a LOCAL browser instead)
        let r;
        // lane browser-admin 2a: a pinned build runs only where its machine's agent can list builds (capability
        // `browser-builds`) — an older agent would ignore the choice and launch its default build, so it is refused by name
        const remoteChoice = BB.normalizeBrowserChoice(p.browser);
        if (remoteChoice && remoteChoice.kind === 'plugin') { const off = engineOffMachine(p.host); throw failed(off.code, off.error); } // lane engine-plugin: never asked of a machine
        if (remoteChoice && remoteChoice.kind !== 'default') {
          const bl = await buildsFor(p.host);
          if (!bl || bl.ok === false) throw failed((bl && bl.code) || 'builds_unsupported', `${p.host}: ${(bl && bl.error) || 'its Chrome builds could not be listed'}`);
        }
        try { r = await acc().call(p.host, 'start', { profileId, idleMs: 0, headed: headedSetting(), noDisplayMode: noDisplayMode(), ...(remoteChoice && remoteChoice.kind !== 'default' ? { browser: remoteChoice } : {}) }); } catch (e) { throw Object.assign(failed(e.code || 'launch_failed', `${p.host}: ${e.message}`), e && e.step ? { step: { ...e.step, machine: p.host } } : {}); } // lane remote-profile-start: the machine's one step rides the refusal (+ which machine)
        if (!r.cdpPort) throw failed('launch_failed', `${p.host} started the browser but reported no CDP url — the hub cannot reach it`);
        let fwd;
        try { fwd = await acc().forwardCdp(p.host, r.cdpPort, { remoteUrl: r.cdpUrl }); } catch (e) { throw failed(e.code || 'host_unavailable', `${p.host}: ${e.message}`); }
        rec.pid = r.pid; rec.starttime = r.starttime; rec.socketDir = r.socketDir; rec.dir = r.dir || null; rec.remoteCdpUrl = r.cdpUrl; rec.cdpUrl = fwd.url; rec.forward = { remotePort: r.cdpPort, localPort: fwd.localPort };
        if (mediator) mediator.repoint(profileId, rec.cdpUrl); // B-19a9 (r1846 (c)): a paired machine's scope leases follow its forward, as the local starts do (P6)
        rec.display = r.display && typeof r.display === 'object' ? r.display : null; // lane headless-fallback: the fact THAT machine probed at its launch
        sayDisplay(rec.display, `${profileId} "${p.label}" on ${p.host}`);
        rec.browserChoice = remoteChoice ? BB.choiceView(remoteChoice) : { kind: 'default' };
        // lane browser-admin 2a: the build THAT browser runs, from its own /json/version through the forward (the fact)
        { const pr = await probeCdp(rec.cdpUrl, { timeoutMs: 2500 }); if (pr.ok && pr.browser) rec.cdpBrowser = pr.browser; }
        rec.state = 'ready';
        p.lastUsedAt = now(); p.lastBackend = p.provider;
        commit();
        log.log?.(`[browser] ${profileId} "${p.label}" started on ${p.host} (${why}): daemon pid ${rec.pid ?? '?'} there, cdp ${p.host}:${r.cdpPort} → 127.0.0.1:${fwd.localPort}`);
        return browserView(rec);
      }
      // the vendor's key names exist in THIS child's environment and nowhere
      // else (§7.5); the provider's launch flags ride argv (no secret there)
      // naive study 2 (measured on 0.38.1): a later call under this session whose LAUNCH VIEW differs (the idle
      // timeout, headed) RESTARTS the daemon and RELAUNCHES Chrome — the keeper's own `get cdp-url` without the idle 0
      // killed the pid it had just recorded and started a second Chrome. Every call of the keeper's own session
      // carries this view (`rec.launchEnv`, no secret in it; the vendor's key names ride alongside, never recorded).
      let headed0 = headedSetting();
      // lane one-browser-b1 (design q-026 §2.1 B1): THE ROAD — xpra here ⇒ the keeper spawns Chrome on a display session of
      // its own and agent-browser ATTACHES (attachStart); anything else is today's driver launch below — the why on the record
      const attachExe = buildEnv.executablePath || ATL.chromeExecutable(rtEnv);
      const road = AT.launchRoad({ local: true, starts: !!prow.starts, ownLaunch: argvPrefix.length > 0, headed: headed0, wired: !!displayKeeper, driverVersion: displayKeeper ? ((await cliNow()) || {}).version || null : null, xpra: await displayHasXpra(), exe: attachExe });
      rec.launch = road.launch; rec.launchWhy = road.why;
      // B-9584 U2b: the stock browser's own environment (an engine's is its hand-over) — resolved ONCE a start (round wyx4vuerd 9): the
      // attach road takes this answer, and a display that did not come up falls back to the driver road with the same one
      const stockEnv = buildEnv && buildEnv.engine ? null : stockEnvFor(p);
      if (road.launch === 'attach') { const a = await attachStart(p, rec, prevRec, { exe: attachExe, why, ns, engineLaunch: buildEnv.engine ? buildEnv : null, stockEnv }); if (a) return a; } // null ⇒ its display did not come up: the driver road, said
      // lane headless-fallback: THE DISPLAY IS A FACT — probed now, here (the launch's view carries the plan: HEADED and the
      // planned config every call of this record names); the fact rides the record
      rec.display = await displays.factFor({ baseFile: machineConfigFile('machine', p.id), headedEnv: headed0, prev: prevRec && prevRec.display, mode: noDisplayMode(), preference: headed0 }); // H5: an unset preference resolved against this probe
      if (rec.display.fallback && headed0 !== null) headed0 = rec.display.headed;
      sayDisplay(rec.display, `${profileId} "${p.label}"`);
      // lane engine-spi-egress (L2's F4): an ENGINE's env list REPLACES the config's `args` — so it carries the keeper's OWN list
      // for this launch, read from THE config every call names (the user's switches, the automation flag, the mark, the display
      // plan's ozone pin / software GL): ONE source on both roads (a conversation's derived config merges the same file's list)
      if (buildEnv.engine) { const kept = plannedArgsOf('machine', p.id, rec.display, { wrapped: !!buildEnv.egress }); if (kept) providerEnv = { ...providerEnv, ...engineEnvOf(p, prow, buildEnv, kept, quietLog) }; }
      const launchEnv = { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0', ...(headed0 === true ? { AGENT_BROWSER_HEADED: '1' } : headed0 === false ? { AGENT_BROWSER_HEADED: '0' } : {}), ...providerEnv };
      // round wyx4vuerd (7): the ZONE rides the launch's own VIEW too — every later call of this record names it (a heal's relaunch
      // through `get cdp-url`, the stop's close): a Chrome its daemon starts again keeps the profile's zone, never the machine's
      if (stockEnv && stockEnv.env.TZ) launchEnv.TZ = stockEnv.env.TZ;
      rec.launchEnv = launchEnv;
      // VERIFY r2 M1: BEFORE EVERY LAUNCH ON THE DIRECTORY — a dead daemon's browser is ended first (in flight: waited),
      // then the lock's holder judged: the keeper's own orphan ended, anything else refused `profile_locked` by name
      if (reaping.has(profileId)) { try { await reaping.get(profileId); } catch { /* its own log */ } }
      const lk = await clearProfileLock(p, ns, prevRec);
      if (!lk.ok) { const e = failed(lk.code, lk.error); e.holderPid = lk.holderPid; throw e; }
      { const gs = await geoStoreAt(p, stockEnv && stockEnv.geolocation); if (!gs.ok) throw failed('browser_place_not_held', `"${p.label}" was not started: its location setting could not be written into its browser profile — ${gs.why}; it never runs where a site could read this machine's location`); }   // B-9584 U2c: FAIL CLOSED AT THE BROWSER (the profile's own stored denial), before its Chrome starts
      stampLaunchHost(rec, prevRec, p.dir || null); // lane profile-lock-roll (L1): THIS machine's name on the record — the witness the next pod reads
      rec.mark = p.id; // r4 (MAJOR 2): the launch carries this profile's MARK (machine-<id>.json); every later keeper call keeps that file
      rec.holdDialogs = true; // lane browser-stuck: …and holds page dialogs (noAutoDialog) from this launch on
      rec.launchFlags = !!prow.launchFlags && (argvPrefix.length > 0 || Object.keys(providerEnv).length > 0); // r4: a provider's own launch flags (its env pair; the row's `launchFlags`) — a heal never relaunches it. lane browser-admin 2a: a chromium build pin is NOT one — the heal's `get cdp-url` carries rec.launchEnv (the executable included), so it relaunches the SAME build
      if (stockEnv && stockEnv.args.length) rec.envArgs = stockEnv.args; // stamped: the config file carries them until the next launch
      markLanguageTold(p, stockEnv);   // B-9584 U2b: with the landing below (commitSync before Chrome)
      rec.browserChoice = recordedChoice(p, buildEnv); if (buildEnv && buildEnv.environment) rec.environment = buildEnv.environment; if (stockEnv && stockEnv.environment) rec.environment = stockEnv.environment; // B-9584 U2a (only when there is something to say: an untouched profile's record is the release's): the start's word on the profile's environment (an engine's echo, its unfollowed list) · what this launch was asked to run (the running build is `cdpBrowser`, the browser's own answer; lane engine-plugin: + an engine's version)
      const stamp0 = F.dirLaunchStamp(p.dir); // r5 MAJOR 1 (iii): the directory before this launch
      rec.cli = await cliNow(); // verify r2 (H1): the CLI this launch runs — every later call of this browser runs that version
      cliKeptByLaunch(rec); // B-7a30: the keeper's own act — that file is the answer, kept now
      if (!commitSync()) throw failed('launch_not_on_disk', LAUNCH_NOT_ON_DISK);   // the census cure (finding 6): the stamped lineage on disk before Chrome
      const r = await rt.launch(ns, { dir: p.dir, idleMs: 0, headed: headed0, extraEnv: { ...vendorEnv, ...providerEnv, ...(stockEnv ? stockEnv.env : {}), ...rec.display.env }, argvPrefix });   // the .197 integration: the provider pair + the display fact's env (last: DISPLAY / XAUTHORITY are the machine's)
      if (!r.ok) {
        const text = (r.stderr || r.error || r.stdout || '').trim().slice(0, 300);
        // verify r2 (F1): the directory may have been taken between the verdict and this launch — the holder said by name
        const lr = lockRefusalAfterLaunch(p, prevRec);
        if (lr) { rec.state = 'failed'; rec.endedAt = now(); rec.lastError = lr.error; commit(); log.warn?.(`[browser] ${profileId} "${p.label}": NOT started — ${lr.tookOver ? `a lock of this machine's previous name ${lr.tookOver} reached the launch (taken over now)` : 'the directory was taken while launching'}: ${lr.error}`); throw namedError(lr.code, lr.error, lr.holderPid ? { holderPid: lr.holderPid } : {}); }
        // a key-bearing launch that fails on licence/concurrency is the THIRD
        // named refusal (§7.4, round 8 #3) — under a cluster default it says
        // the seats are shared fleet-wide and offers the one click out
        const cls = r.code === 'browser_cli_unconfirmed' ? { code: r.code, error: String(r.error || r.code) } /* B-7a30: the door's refusal keeps its name */ : intId ? SW.classifyLaunchFailure({ provider: p.provider, text, source: key ? key.source : 'none', integrationId: intId }) : { code: 'launch_failed', error: (B.launchFatalOf(r.stderr || r.error || r.stdout, { lineOf: ownConfigLine }) || {}).error || `the browser did not start: ${text}`, action: null };
        rec.state = 'failed'; rec.endedAt = now(); rec.lastError = cls.error;
        commit();
        throw namedError(cls.code, cls.error, { provider: p.provider, action: cls.action || null });
      }
      const info = await rt.info(ns, { dir: p.dir });
      rec.pid = info.pid; rec.starttime = await launchStart(info.pid); rec.socketDir = info.socketDir;
      if (info.pid && rec.starttime == null && F.startsReadable()) { rec.state = 'failed'; rec.endedAt = now(); rec.lastError = unrecordedLaunch(info.pid); commit(); throw namedError('launch_failed', rec.lastError); }
      if (!rec.cli || (info.version && info.version !== rec.cli.version)) { const cd = cliOfDaemon(info); rec.cli = cd || rec.cli || null; if (cd && cd.path) cliKeptByLaunch(rec); } // verify r2 (H1): the daemon's own answer decides // B-7a30: the daemon's own program (/proc/<pid>/exe) is its answer
      captureBrowser(rec, p.dir); // r2 M1: the Chrome it launched on the profile dir — ended if this daemon dies
      const cdp = await rt.cdpUrl(ns, { dir: p.dir, extraEnv: { ...launchEnv, ...vendorEnv } });
      rec.cdpUrl = cdp.ok ? cdp.url : null;
      if (!info.active) {
        rec.state = 'failed'; rec.endedAt = now(); rec.lastError = 'the daemon did not report itself active after open';
        commit();
        throw namedError('launch_failed', rec.lastError);
      }
      // r5 MAJOR 1 (iii): a start whose browser died before its capture is never `ready` with no browser and no verdict (the
      // r4 dead lease at birth). `get cdp-url` above relaunches a dead Chrome in the daemon (0.38.1), so it is captured once
      // more; still none while THIS launch provably brought a browser up on the directory ⇒ `browser_closed` by name, the
      // loss kept (a verb retries at once, the tick after HEAL_RETRY_MS). A launch that never wrote the directory's stamp
      // (a machine without /proc, a provider whose browser is not identifiable) is never judged.
      if (!rec.browser) captureBrowser(rec, p.dir);
      if (!rec.browser && launchEvidenced(p.dir, stamp0)) {
        const lr = lockRefusalAfterLaunch(p, prevRec); // verify r2 (F1): a holder that took the directory meanwhile is named, never "a crash at startup?"
        rec.browserLost = { pid: null, at: now() };
        setClosed(rec, lr || { code: 'browser_closed', error: closedText(p, 'it died right after it started (a crash at startup?)') }, { retry: !lr || !!lr.tookOver }); // verify r3 (F3): a lock taken over now ⇒ the next ask relaunches
        noteHeal(rec, { lastOutcome: 'unidentified' });
        log.warn?.(lr ? `[browser] ${profileId} "${p.label}": started (daemon pid ${rec.pid}) but ${lr.tookOver ? `a lock of this machine's previous name ${lr.tookOver} reached the launch (taken over now)` : 'the directory is held by somebody else'}: ${lr.error}` : `[browser] ${profileId} "${p.label}": started (daemon pid ${rec.pid}) but no browser process holds ${p.dir} — it died at birth: browser_closed (a command retries at once, the tick in ${HEAL_RETRY_MS / 1000} s)`);
      }
      if (stockEnv && stockEnv.geolocation && stockEnv.geolocation.kind === 'place') await armGeo(p, rec, stockEnv.geolocation);   // B-9584 U2c: the place ADDED on top of the stored denial BEFORE the browser is anyone's (r1264: ahead of ready and the repoint; «blocked» is the stored denial alone)
      rec.state = 'ready';
      if (mediator) mediator.repoint(profileId, rec.cdpUrl); // P6: a restarted browser ⇒ live mediated connections close 1012, the SAME url reconnects
      p.lastUsedAt = now(); p.lastBackend = p.provider;
      // the Chromium major this backend WRITES, for the version ladder: from
      // the browser's own /json/version (never guessed); the profile records
      // the HIGHEST major that ever wrote its directory
      if (rec.cdpUrl) {
        const pr = await probeCdp(rec.cdpUrl, { timeoutMs: 2500 });
        if (pr.ok && pr.browser) {
          rec.cdpBrowser = pr.browser;
          const mj = SW.majorOfBrowserString(pr.browser);
          if (mj) { reg.majors[p.provider] = { major: mj, at: now() }; if ((rowOf(p.provider) || {}).ownsDir) p.lastChromiumMajor = Math.max(Number(p.lastChromiumMajor) || 0, mj); }
        }
      }
      commit();
      log.log?.(`[browser] ${profileId} "${p.label}" started (${why}, ${p.provider}${vendorEnv && Object.keys(vendorEnv).length ? ', key from ' + (key ? key.source : '?') : ''}): daemon pid ${rec.pid ?? '?'}${rec.starttime != null ? '' : ' (starttime unreadable — never signalled by pid)'}${rec.cdpUrl ? ', cdp known' : ', no cdp url'}${p.lastChromiumMajor ? ', chromium ' + p.lastChromiumMajor : ''}${rec.cli && rec.cli.version ? ', ' + VERBS.CLI_PACKAGE + ' ' + rec.cli.version : ''}`); // verify r3 (Y1): the CLI this launch runs
      emitLease({ kind: 'browser-ready', profileId, why, local: true });
      return browserView(rec);
    })();
    starting.set(profileId, p0);
    try { return await p0; } finally { if (starting.get(profileId) === p0) starting.delete(profileId); dropPlaceHold(profileId); } // r2 (N3): the start settled — its kernel hold ends
  }
  /** P4: does a browser answer CDP at this hub-side url? One bounded GET of
   *  /json/version (the endpoint every CDP browser serves); `{ok, browser}`
   *  or `{ok:false, error}` — never a throw. */
  function probeCdp(url, { timeoutMs = 4000 } = {}) {
    return new Promise((resolve) => {
      let target;
      try { target = new URL(String(url).replace(/^ws(s?):\/\//, 'http$1://')); } catch { return resolve({ ok: false, error: 'bad url' }); }
      const http = require(target.protocol === 'https:' ? 'https' : 'http');
      let done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      try {
        const req = http.get({ host: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), path: '/json/version', timeout: timeoutMs }, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { if (body.length < 65536) body += c; });
          res.on('end', () => {
            if (res.statusCode !== 200) return finish({ ok: false, error: `HTTP ${res.statusCode} from /json/version` });
            let j = null; try { j = JSON.parse(body); } catch { j = null; }
            finish({ ok: true, browser: j && (j.Browser || j['User-Agent']) ? String(j.Browser || j['User-Agent']).slice(0, 120) : null });
          });
        });
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.on('error', (e) => finish({ ok: false, error: e.message }));
      } catch (e) { finish({ ok: false, error: e.message }); }
    });
  }
  /** Is the recorded daemon still the process we recorded? */
  function pidVerdictOf(rec) {
    if (!rec || !Number.isInteger(rec.pid) || rec.pid <= 0) return 'gone';
    return B.pidVerdict({ alive: F.pidAlive(rec.pid), sameStart: F.sameProcess(rec.pid, rec.starttime) });
  }
  /**
   * NAIVE STUDY 2 (2026-09-25, the "bank" profile that never started): THE KEEPER IS THE ONLY LAUNCHER OF A
   * PROFILE BROWSER. Every CLI call made under a LEASE's own session (`vs-<browserKey>`) — its commands, the live
   * view's stream port, a confirmation answer, a screencast, a box probe, the backend switch's re-open — reaches
   * the keeper's ONE browser over its CDP url and gets its own tab; it is NEVER handed the profile directory.
   * Measured on the real 0.38.1: a second session given `AGENT_BROWSER_PROFILE` on a directory the keeper's browser
   * holds starts its OWN Chrome there and dies on `SingletonLock: File exists` (exit 21) — every launch, and the
   * live view's `stream status` too; with the CDP url, two sessions each got their own tab in the one Chrome.
   * The url is the record's (a local launch reads it right after `open`; a paired / external browser's is the
   * hub-side forward). A local record that has none is asked ONCE more under the keeper's OWN session (the
   * launcher's) and only while its daemon is provably ours. null ⇒ the caller refuses `browser_no_cdp`.
   */
  async function leaseCdpUrl(profileId) {
    const rec = reg.browsers[profileId];
    if (!rec || rec.state !== 'ready') return null;
    if (B.isLoopbackCdpUrl(rec.cdpUrl)) return rec.cdpUrl;
    const p = profile(profileId);
    if (!p || !isLocalRec(rec) || pidVerdictOf(rec) !== 'ours') return null;
    const c = await rt.cdpUrl(rec.ns, { dir: p.dir, extraEnv: rec.launchEnv || { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' } }); // the launch's own view (a different one restarts the daemon)
    if (!(c.ok && B.isLoopbackCdpUrl(c.url)) || reg.browsers[profileId] !== rec) return null;
    rec.cdpUrl = c.url;
    if (geoHoldOwn && geoHoldOwn.heldOf(profileId)) geoHoldOwn.rearmNow(profileId);   // B-9584 U2c (r1264 must 2): a Chrome its daemon relaunched on a new address is held again THERE, at once
    if (mediator) mediator.repoint(profileId, rec.cdpUrl); // P6: the mediated leases follow the url too
    commit();
    return rec.cdpUrl;
  }
  const noCdpError = (p) => `"${p ? p.label : 'this profile'}"'s browser answered no CDP url — a command cannot join it without starting a second browser on the same profile directory (Chrome refuses that); stop it from the Browser panel and run the command again`;
  /** The options of ONE CLI call under a lease's own session: `{ session, extraEnv: { AGENT_BROWSER_CDP } }` —
   *  never a `dir`. null when the browser has no CDP url (the caller refuses `browser_no_cdp`). */
  async function leaseCliOpts(profileId, browserKey) {
    const raw = await leaseCdpUrl(profileId);
    // the lease session's OWN launch view = what its CLI child runs with (attachedEnvFor: the CDP url + idle 0) —
    // a keeper call with another view would restart that daemon and lose the agent's pinned tab (measured on 0.38.1)
    // lane browser-shared-profile-freeze: …and that url is the lease's OWN on the scope road (leaseUrlFor), the SAME value
    const url = raw ? await leaseUrlFor(profile(profileId), browserKey, raw) : null;
    return url ? { session: B.sessionNameFor(String(browserKey || '')), extraEnv: { AGENT_BROWSER_CDP: url, AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' } } : null;
  }
  // ── lane browser-shared-profile-freeze (fb-8727ee62fb / fb-0898d92d0a: userW's jarvis-work «freezes for every session at
  // once — Runtime.evaluate / Page.navigate / tab new all time out while status and the tab list still answer»): THE SCOPE
  // ROAD. MEASURED (scripts/measure-shared-profile-freeze.mjs — this keeper, the routes, the CLI, agent-browser 0.38.2,
  // Chrome 154, four conversations on one profile): every driver attached to the RAW endpoint discovers every page target
  // of the browser and holds its next command until each NEW one answers Page.enable — one tab that could not answer at
  // birth (its page holding its main thread as it loaded; a confirm() at load) held the other conversations' own-tab
  // `eval 1+1` 19.8 s / 59.8 s, all at once. An AGENT's lease of a local named profile shared cooperatively is therefore
  // handed a url of its own through the proxy (cdp-mediator mode 'scope'): its driver discovers only the lease's tabs
  // (and the tabs they open); every call passes as written. No proxy here ⇒ the raw url, as before (said by the verdict).
  /** lane chrome-157 (the owner's law 2026-11-13): the road ANY agent's lease of this profile takes — the SAME verdict the leases use
   *  (never a second «is there a proxy» test). Read by the profile's view (the «Who can use it» dialog says what is true on it) and by
   *  the boot's adoption (THE WINDOW's fourth door). → {mode, why} */
  // B-19a9 (the coordinator's r1840 / r1846 (b)): the facts the ONE road verdict takes, each by ITS OWN reason — an outside endpoint (a
  // `cdp` profile, a browser this hub did not start) stays raw; a PAIRED machine's browser (reached by this hub's own loopback forward,
  // its drivers run here) is a parameter of the scope road, never a lump with the outside one
  const roadFactsOf = (p, rec) => { const prow = p && !isEph(p) ? rowOf(p.provider) : null; const external = !!((rec && rec.external) || (p && p.provider === 'cdp') || (prow && !prow.starts)); return { external, paired: !external && !!((p && p.host) || (rec && rec.hostId)) }; };
  const agentRoadOf = (p) => { const rec = p ? reg.browsers[p.id] : null; return M.leaseRoadVerdict({ mediated: isMediated(p), proxy: !!(mediator && mediationOn() && typeof mediator.grantFor === 'function'), ephemeral: !p || isEph(p), ...roadFactsOf(p, rec), agent: true }); };
  /** The road the «Who can use it» dialog words: the same verdict, except a mediated profile on a hub with no proxy — every agent lease
   *  there is refused `mediation_unavailable`, so the dialog says unavailable (the .401 read, L2b). → {mode, why} */
  const dialogRoadOf = (p) => { const v = agentRoadOf(p); return p && isMediated(p) && !(mediator && mediationOn() && typeof mediator.grantFor === 'function') ? { mode: v.mode, why: 'unavailable' } : v; };
  // lane chrome-157 (the closure list S2 / S5): THE WINDOW's words reach the lease whose download folder it was — the mediator says
  // WHY (onTold), the keeper words it with the profile's label and hands it to its listeners (browser-handback.js: ONE free notice at
  // that conversation's next turn) — the one road for the bound, the ceiling, a takeover, its connection ending, a download with no
  // folder of its lent
  // B-0645 cure (主开发 09:07Z, as if a must): A FOLDER THAT COULD NOT BE CONFIRMED PUT BACK IS TOLD TO THE PERSON — ONE For-you
  // notice per browser (its door: Restart), filed when the mediator gives the hub's own put-back up on a browser still alive,
  // resolved when a later put-back is confirmed or the browser ends (a stop, a fresh start: emitLease)
  /** B-0645 cure 2 (主开发 10:26Z): the notices are kept in memory, the items in the For-you store — at the first load after a
   *  hub restart an OPEN item is taken back: its browser still alive ⇒ held again (a later put-back, stop or death ends it),
   *  its browser gone ⇒ resolved now. Known by its words' key (FOLDER_LOST_WORDS.text). */
  function reclaimFolderNotices() {
    if (heldReg) return;   // the B-f276 remainder: no live record is known — every «folder not put back» notice would close (it runs at the read)
    if (!userTodos || typeof userTodos.openItems !== 'function') return;
    if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => reclaimFolderNotices(), 'the folder-lost notices reclaim'); return; }   // B-44f3: For you held unread — the reclaim judges the FILE's items, at the read
    let open = [];
    try { open = userTodos.openItems(); } catch { return; }
    for (const it of open) {
      const pid = it && it.i18n && it.i18n.text && it.i18n.text.key === M.FOLDER_LOST_WORDS.text && it.action ? String(it.action.profileId || '') : '';   // known by its words' key (no branch on the door's type: the For-you census)
      if (!pid || folderNotices.has(pid)) continue;
      const rec = reg.browsers[pid];
      if (rec && B.isLiveBrowser(rec) && profile(pid)) { folderNotices.set(pid, { id: it.id, rec }); continue; }
      if (typeof userTodos.setStatus === 'function') { try { userTodos.setStatus(it.id, 'done', 'browser-ended'); } catch { /* gone already */ } }
    }
  }
  function endFolderNotice(profileId, by) {
    const n = folderNotices.get(profileId);
    if (!n) return;
    folderNotices.delete(profileId);
    if (n.id && userTodos && typeof userTodos.setStatus === 'function') { try { const it = typeof userTodos.get === 'function' ? userTodos.get(n.id) : null; if (!it || it.status === 'open') userTodos.setStatus(n.id, 'done', by); } catch { /* gone already */ } }
  }
  if (mediator && typeof mediator.onFolder === 'function') mediator.onFolder((ev) => {
    if (!ev || !ev.profileId) return;
    if (ev.kind === 'back') return endFolderNotice(ev.profileId, 'put-back-confirmed');
    if (ev.kind !== 'lost') return;
    const rec = reg.browsers[ev.profileId], p = profile(ev.profileId);
    if (!rec || !B.isLiveBrowser(rec) || !p) return;   // a browser that ended took the folder with it
    const was = folderNotices.get(ev.profileId);
    if (was && was.rec === rec) return;   // ONE per browser
    if (was) endFolderNotice(ev.profileId, 'browser-restarted');
    const n = M.folderLostNotice({ label: B.cleanLabel(p.label) });
    const e = { id: null, rec };
    folderNotices.set(ev.profileId, e);
    if (!userTodos || typeof userTodos.add !== 'function') { log.warn?.(`[browser] ${ev.profileId} "${p.label}": its download folder may still be lent — no For-you store is wired, so only this journal says so`); return; }
    try { const it = userTodos.add('browser', { origin: 'browser', kind: 'action', urgency: 'high', by: 'agent', text: n.text, detail: n.detail, sessionName: 'Agent browser', i18n: n.i18n, action: { type: 'browser-restart', profileId: ev.profileId } }); e.id = (it && it.id) || null; }
    catch (err) { log.warn?.(`[browser] ${ev.profileId} "${p.label}": the download-folder For-you item was not filed (${err && err.message})`); }
  });
  const folderListeners = new Set();
  if (mediator && typeof mediator.onTold === 'function') mediator.onTold((t) => {
    if (!t || !t.browserKey) return;
    const p = t.profileId ? profile(t.profileId) : null;
    const l = t.profileId ? B.findLease(reg.leases, t.profileId, String(t.browserKey)) : null;
    const ev = { profileId: t.profileId || null, browserKey: String(t.browserKey), sessionId: (l && l.sessionId) || null, why: t.why, text: M.windowToldText(t.why, { label: p ? B.cleanLabel(p.label) : null }) };   // (the store's own cut — never a split pair)
    for (const fn of folderListeners) { try { fn(ev); } catch (e) { log.warn?.(`[browser] a download-folder listener threw — ${e && e.message}`); } }
  });
  const leaseRoadOf = (p, browserKey) => {
    const bk = String(browserKey || ''), rec = p ? reg.browsers[p.id] : null;
    return M.leaseRoadVerdict({ mediated: isMediated(p), proxy: !!(mediator && mediationOn() && typeof mediator.grantFor === 'function'), ephemeral: !p || isEph(p), ...roadFactsOf(p, rec), remoteSession: !!bk && isRemoteKey(bk), agent: (B.isBrowserKey(bk) || B.isChildKey(bk)) && !HM.isHumanKey(bk) });
  };
  /** The url ONE lease's driver is handed for `raw` (the browser's own endpoint): its scope grant's on the scope road (the
   *  lease's known tabs admitted first — holderTabs), else `raw` unchanged. A proxy that throws leaves `raw` (journalled). */
  async function leaseUrlFor(p, browserKey, raw) {
    if (!raw || !p || leaseRoadOf(p, browserKey).mode !== M.SCOPE_MODE) return raw;
    // a url is an authority: minted only for a lease that STANDS (attach took it after its fences — identity census)
    // lane chrome-157 (the .401 read, L2b): the scope road FAILS CLOSED — no standing lease, or no grant made, is no url at all (the
    // attach refuses `scope_unavailable` by name); it never hands the raw endpoint, where no fence and no window stands
    if (!B.findLease(reg.leases, p.id, String(browserKey))) return null;
    try {
      const g = await mediator.grantFor({ profileId: p.id, browserKey: String(browserKey), upstream: raw, targetIds: holderTabs(p.id, browserKey), mode: M.SCOPE_MODE, paused: () => inputStateFor(String(browserKey), p.id).input === 'user', place: () => placeKindFor(p.id) });   // (the window refuses a set while the person drives — W1 on the scope road)
      return g && g.url ? g.url : null;
    } catch (e) { log.warn?.(`[browser] ${browserKey} on ${p.id}: no scoped url (${e && e.message}) — refused by name, never the raw endpoint`); return null; }
  }
  /** The browser's OWN endpoint for the keeper's raw reads (the whole tab set — the fence judges ownership itself), never a
   *  lease's scoped url. */
  const rawCdpOf = (profileId, o) => (reg.browsers[profileId] && B.isLoopbackCdpUrl(reg.browsers[profileId].cdpUrl) ? reg.browsers[profileId].cdpUrl : (o && o.extraEnv && o.extraEnv.AGENT_BROWSER_CDP) || null);
  // ── LANE ONE-BROWSER-B1 (design q-026 r1 §2.1 / §2.4 / §3 row B1, 2026-10-16): THE ATTACH ROAD ──
  /** Does the display keeper's machine have xpra + xauth (the display-only session's recipe)? false when unwired / unknown. */
  async function displayHasXpra() {
    if (!displayKeeper || typeof displayKeeper.facts !== 'function') return false;
    try { const f = await displayKeeper.facts(); return !!(f && f.bins && f.bins.xpra && f.bins.xauth); } catch { return false; }
  }
  /** The display session goes WITH its browser record (a stop, Chrome's own exit, a failed launch, a boot that could not
   *  adopt it, a session no record names) — asked of the desktop keeper; a failure is journalled, never thrown. */
  function endDisplay(rec, why) {
    const id = rec && rec.displaySession && rec.displaySession.id;
    if (!id || !displayKeeper || typeof displayKeeper.stop !== 'function') return Promise.resolve(null);
    return Promise.resolve().then(() => displayKeeper.stop(id, { why: 'browser' })).then((v) => { log.log?.(`[browser] ${rec.profileId || '?'}: its display session ${id} stopped — ${why}`); return v; })
      .catch((e) => { log.warn?.(`[browser] ${rec.profileId || '?'}: its display session ${id} could not be stopped (${e && e.message}) — ${why}`); return null; });
  }
  /** A display-only session whose browser record no longer names it (a crash between the two writes, a record replaced) is
   *  stopped: its lifetime is the record's. The desktop keeper's live list, filtered by kind — cheap, once per tick. */
  function reconcileDisplays() {
    if (heldReg) return;   // the B-f276 remainder: no live record is known — every attach-road Chrome's display would be stopped
    if (!displayKeeper || typeof displayKeeper.liveRecords !== 'function') return;
    let recs = [];
    try { recs = displayKeeper.liveRecords() || []; } catch { return; }
    for (const d of recs) {
      if (!DA.isDisplayForBrowser(d) || !d.forBrowser || starting.has(d.forBrowser) || stopping.has(d.forBrowser)) continue;
      const rec = reg.browsers[d.forBrowser];
      if (rec && B.isLiveBrowser(rec) && rec.launch === 'attach' && rec.displaySession && rec.displaySession.id === d.id) continue;
      endDisplay({ profileId: d.forBrowser, displaySession: { id: d.id } }, 'no live browser record names it');
    }
  }
  /** THE ATTACH ROAD'S HEAL: its process IS Chrome, so a Chrome that died under a HOLDER (a lease, the user browsing it) is
   *  started again by the keeper — a fresh attach launch on the same profile (its lock judged again; every tab of the old
   *  Chrome went with it — markDaemonGone said so to the leases and the user's browsing), within the driver road's budget
   *  (B.healBudgetVerdict: HEAL_BUDGET in HEAL_WINDOW_MS, the day tier); past it the record stays stopped and says why — the
   *  next command starts it. Nobody holding it ⇒ no heal (the driver road's rule, r4 MAJOR 1). In memory: a restart counts anew. */
  const attachHeals = new Map(); // profileId → the times of its attach heals
  function healAttach(rec, seenBy) {
    if (!rec || rec.launch !== 'attach' || !leasedNow(rec.profileId) || starting.has(rec.profileId) || stopping.has(rec.profileId)) return null;
    if (userStoppedRec(rec)) { log.log?.(`[browser] ${rec.profileId}: its Chrome exited after the person stopped its display window (seen by ${seenBy}) — NOT started again (user-stopped, never a heal); the next browser command starts it`); return null; } // lane browser-display-holders
    const t = now();
    const bud = B.healBudgetVerdict({ attempts: attachHeals.get(rec.profileId) || [], now: t });
    if (!bud.ok) {
      rec.lastError = `${rec.lastError || 'the browser exited'} — it closed ${bud.count} times in ${Math.round(bud.windowMs / 60000)} min, so it is not started again by itself; the next command starts it`;
      dirty = true;
      log.warn?.(`[browser] ${rec.profileId}: ${rec.lastError} (seen by ${seenBy})`);
      return null;
    }
    attachHeals.set(rec.profileId, [...bud.kept, t]);
    log.log?.(`[browser] ${rec.profileId}: its Chrome exited under a holder (seen by ${seenBy}) — started again on the attach road (${bud.kept.length + 1} in the window)`);
    return start(rec.profileId, { why: 'heal' }).catch((e) => log.warn?.(`[browser] ${rec.profileId}: the attach road's heal did not start it — ${e && e.message}`));
  }
  /**
   * THE ATTACH LAUNCH — the keeper's own `launch` + `cdpUrl` (design §2.4: the boundary moves one step; `exec` is
   * `agent-browser --cdp <port>`, the stream stays the driver's). The directory's lock is judged as on the driver road; then
   * the config's socket dir (0700, ours), a display-only session from the desktop keeper (xpra-seamless, no app, no idle
   * stop), Google Chrome spawned on it with AT.attachArgv (never --disable-sync: its sign-in entry exists), its NEW
   * DevToolsActivePort read (≤ 5 s — else `cdp_port_missing`, the Chrome ended, never a stale port), the endpoint asked.
   * The record names CHROME as its process (pid + starttime): the tick's liveness, the stop's signal and the boot's
   * adoption judge that pid — no daemon of ours sits under it. → browserView(rec) | null when the display session did not
   * come up (said on the record; the caller runs the driver road).
   */
  async function attachStart(p, rec, prevRec, { exe, why, ns, engineLaunch = null, stockEnv = null }) {   // `stockEnv`: the start's ONE resolve (B-9584 U2b)
    const profileId = p.id;
    // lane hotfix-attach-engine-args (2.369.375): EVERY launch this road does not start is journaled BY NAME — its code, the argv
    // items it names — BEFORE its display session is stopped (the owner's hub journaled only «stopped — its launch was refused»;
    // the CLI alone was told why). `said` = the line was written already (before the display stop)
    const sayNotStarted = (code, msg, items = []) => log.warn?.(`[browser] ${profileId} "${p.label}": NOT started on the attach road [${code}]${items.length ? ` (${AT.argvItemsText(items)})` : ''} — ${msg}`);
    const failed = (code, msg, extra = {}, { said = false } = {}) => { if (!said) sayNotStarted(code, msg); rec.state = 'failed'; rec.endedAt = now(); rec.lastError = msg; commit(); return namedError(code, msg, extra); };
    const refused = async (code, msg, items = []) => { sayNotStarted(code, msg, items); await endDisplay(rec, 'its launch was refused'); return failed(code, msg, {}, { said: true }); };
    if (reaping.has(profileId)) { try { await reaping.get(profileId); } catch { /* its own log */ } }
    const lk = await clearProfileLock(p, ns, prevRec);
    if (!lk.ok) { const e = failed(lk.code, lk.error); e.holderPid = lk.holderPid; throw e; }
    { const gs = await geoStoreAt(p, stockEnv && stockEnv.geolocation); if (!gs.ok) throw failed('browser_place_not_held', `"${p.label}" was not started: its location setting could not be written into its browser profile — ${gs.why}; it never runs where a site could read this machine's location`); }   // B-9584 U2c: FAIL CLOSED AT THE BROWSER (the profile's own stored denial), before its Chrome starts
    const so = ATL.ensureSocketDir(AT.attachSocketDir({ base: attachSocketBase || B.SOCKET_DIR_BASE, uid: typeof process.getuid === 'function' ? process.getuid() : null, profileId }));
    if (!so.ok) throw failed(so.code, so.error);
    let ds = null;
    try { ds = await displayKeeper.launchDisplay({ forBrowser: profileId, label: p.label }); } catch (e) { ds = { state: 'failed', lastError: `${e && e.message}${e && e.code ? ` [${e.code}]` : ''}` }; }
    if (!ds || ds.state !== 'ready' || !ds.id) {
      if (ds && ds.id) endDisplay({ profileId, displaySession: { id: ds.id } }, 'its bring-up failed');
      rec.launch = 'driver'; rec.launchWhy = `its display session did not come up (${(ds && ds.lastError) || 'no answer'}) — the hidden window: this browser cannot sign in to Google`;
      log.warn?.(`[browser] ${profileId} "${p.label}": ${rec.launchWhy}`);
      commit();
      return null;
    }
    rec.displaySession = { id: ds.id, display: ds.display || null };
    stampLaunchHost(rec, prevRec, p.dir || null); // lane profile-lock-roll (L1): THIS machine's name on the record
    rec.mark = p.id; rec.holdDialogs = true; rec.automationFlag = true; rec.quietLog = true; // the argv carries the mark, AutomationControlled and the quiet switches
    rec.browserChoice = recordedChoice(p, engineLaunch);
    if (engineLaunch && engineLaunch.environment) rec.environment = engineLaunch.environment; // B-9584 U2a
    rec.launchEnv = { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' };
    rec.cli = await cliNow(); // the CLI every later call of this browser runs (it attaches; it never launches)
    cliKeptByLaunch(rec); // B-7a30: the keeper's own act — that file is the answer, kept now
    markLanguageTold(p, stockEnv);   // B-9584 U2b: with the landing below
    if (!commitSync()) throw await refused('launch_not_on_disk', LAUNCH_NOT_ON_DISK);   // the census cure (finding 6): the stamped lineage on disk before Chrome
    const engineArgs = engineLaunch && Array.isArray(engineLaunch.args) ? ENG.engineArgs(engineLaunch) : []; // lane engine-plugin: the engine's own arguments, censused by the builder (lane engine-spi-egress: + the keeper's proxy arguments when wrapped)
    if (rec.tailnet && rec.tailnet.arg) engineArgs.push(rec.tailnet.arg);
    if (rec.proxyRoad && rec.proxyRoad.arg) engineArgs.push(rec.proxyRoad.arg, ENG.PROXY_UDP_ARG); // B-8b87 (+ 14:25Z: the WebRTC policy beside it — UDP only through a proxy): the profile's proxy — its forwarder's loopback port, IN through the builder // lane tailnet-names: the keeper's tailnet PAC (never on an engine's launch) — IN through the builder
    // lane engine-spi-egress L1b r3: the second wall on THIS road (the launch verdict refused them first) — an engine argument that starts
    // another program (src/browser-engines.js LAUNCHER_SWITCHES) never reaches an argv
    // r4: on the argument's TRIMMED form (src/browser-engines.js switchFormOf — Chromium's own reading), and a padded argument refused too
    const launchers = ENG.launcherArgsOf(engineArgs), padded = ENG.paddedArgsOf(engineArgs);
    const engWho = ENG.engineWords({ id: engineLaunch && engineLaunch.engine && engineLaunch.engine.id, label: engineLaunch && engineLaunch.engine && engineLaunch.engine.label });
    if (launchers.length) throw await refused('browser_engine_protocol', `${engWho}'s launch names another program through ${launchers.join(', ')}; a plugin never names the program it runs`, launchers);
    if (padded.length) throw await refused('browser_engine_protocol', `${engWho} named an argument that starts or ends with whitespace — an engine switch may not: Chromium would read « --x» as --x`, padded);
    // L1b r5: the switch-only rule on this road too (a bare -- puts the keeper's proxy pair after the end of switches)
    const nonSwitch = ENG.nonSwitchArgsOf(engineArgs);
    if (nonSwitch.length) throw await refused('browser_engine_protocol', `${engWho}'s launch: ${ENG.notSwitchWords(nonSwitch)}`, nonSwitch);
    if (stockEnv) engineArgs.push(...stockEnv.args);   // B-9584 U2b: a stock start's language switches ride the argv, its TZ the env
    if (stockEnv && stockEnv.environment) rec.environment = stockEnv.environment;
    const av = AT.attachArgv({ profileDir: p.dir, mark: B.keeperMarkArg(p.id), quiet: BE.QUIET_LOG_ARGS, extra: engineArgs });
    if (!av.ok) throw await refused(av.code, av.error, av.offending || []);
    // lane hotfix-attach-engine-args: a switch the ENGINE passed that this road forbids was dropped by the builder — SAID, never
    // silent: one journal line + the record's fact (the Agent browser panel's row words it; a new launch writes a new record)
    if (av.dropped && av.dropped.length) {
      const engId = (engineLaunch && engineLaunch.engine && engineLaunch.engine.id) || '';
      rec.engineDropped = { engine: engId || null, switches: av.dropped.slice(0, 8) };
      log.warn?.(`[browser] ${profileId}: ${AT.droppedWords({ engine: engId, dropped: av.dropped })}`);
    }
    // the env: the keeper's base env (agentEnv — never process.env) minus every driver key, the display session's X, the
    // daemon's short TMPDIR (Chrome's singleton socket must fit sun_path — lane browser-tmpdir-socket-length)
    const env = { ...rtEnv };
    for (const k of Object.keys(env)) if (k.startsWith('AGENT_BROWSER_')) delete env[k];
    delete env.WAYLAND_DISPLAY;
    const xenv = (typeof displayKeeper.x11EnvFor === 'function' && displayKeeper.x11EnvFor(ds.id)) || {};
    if (xenv.DISPLAY) env.DISPLAY = xenv.DISPLAY; else if (ds.display) env.DISPLAY = ds.display;
    if (xenv.XAUTHORITY) env.XAUTHORITY = xenv.XAUTHORITY;
    { const td = daemonTmp(); if (td) env.TMPDIR = td; }
    if (stockEnv && stockEnv.env.TZ) env.TZ = stockEnv.env.TZ; // B-9584 U2b: the profile's own zone, the whole browser from its first page
    if (engineLaunch && engineLaunch.env) for (const k of ENG.ENGINE_ENV_KEYS) if (typeof engineLaunch.env[k] === 'string') env[k] = engineLaunch.env[k]; // lane engine-plugin: the whitelist only (none today)
    const r = await ATL.spawnChrome({ exe, argv: av.argv, env, profileDir: p.dir, logFile: path.join(dataDir, 'browser-env', 'attach', profileId + '.log') });
    if (!r.ok) {
      const lr = lockRefusalAfterLaunch(p, prevRec); // the directory taken meanwhile ⇒ its holder named
      sayNotStarted(lr ? lr.code : r.code, lr ? lr.error : r.error);
      await endDisplay(rec, 'its browser did not start');
      if (lr) throw failed(lr.code, lr.error, lr.holderPid ? { holderPid: lr.holderPid } : {}, { said: true });
      throw failed(r.code, r.error, {}, { said: true });
    }
    rec.pid = r.pid; rec.starttime = await launchStart(r.pid);
    if (rec.starttime == null && F.startsReadable()) { try { r.child.kill('SIGKILL'); } catch { /* gone */ } sayNotStarted('launch_failed', unrecordedLaunch(r.pid)); await endDisplay(rec, 'its browser could not be identified'); throw failed('launch_failed', unrecordedLaunch(r.pid), {}, { said: true }); }
    rec.browser = { pid: r.pid, starttime: rec.starttime, dir: p.dir, devtoolsPort: r.port };
    rec.socketDir = so.dir; rec.cdpPort = r.port; rec.cdpUrl = AT.cdpUrlOf(r.port, r.wsPath); rec.executable = exe;
    if (stockEnv && stockEnv.geolocation && stockEnv.geolocation.kind === 'place') await armGeo(p, rec, stockEnv.geolocation);   // B-9584 U2c: the place ADDED on top of the stored denial BEFORE the browser is anyone's (r1264: ahead of ready and the repoint; «blocked» is the stored denial alone)
    rec.state = 'ready';
    if (mediator) mediator.repoint(profileId, rec.cdpUrl); // P6: every mediated lease follows the browser
    p.lastUsedAt = now(); p.lastBackend = p.provider;
    { const pr = await probeCdp(rec.cdpUrl, { timeoutMs: 2500 }); if (pr.ok && pr.browser) { rec.cdpBrowser = pr.browser; const mj = SW.majorOfBrowserString(pr.browser); if (mj) { reg.majors[p.provider] = { major: mj, at: now() }; if ((rowOf(p.provider) || {}).ownsDir) p.lastChromiumMajor = Math.max(Number(p.lastChromiumMajor) || 0, mj); } } }
    commit();
    log.log?.(`[browser] ${profileId} "${p.label}" started on the ATTACH road (${why}): Chrome pid ${rec.pid} on ${rec.displaySession.display || '?'} (display session ${ds.id}), DevToolsActivePort ${r.port} after ${r.ms} ms${rec.cdpBrowser ? ', ' + rec.cdpBrowser : ''} — the driver attaches with --cdp`);
    emitLease({ kind: 'browser-ready', profileId, why, local: true });
    return browserView(rec);
  }
  // ── LANE BROWSER-X-IN-WINDOW (design q-026 r1 §2.1 / §3 row B2, 2026-10-23; the owner: 「目前 chrome 还是没有被放进 browser 窗口里面」):
  // THE PICTURE SWITCH — a profile on the attach road is SEEN and DRIVEN through its display session's X picture ──
  /** Which picture a profile's live view shows (PURE PIC.pictureSourceOf over its record): 'x' = its window on the display
   *  session (the attach road on this machine), else 'screencast' (the page's frames, as before) — with why + words. */
  function pictureSourceFor(profileId) {
    ensureLoaded();
    const rec = reg.browsers[String(profileId || '')] || null;
    return PIC.pictureSourceOf(rec, { remote: !!rec && !isLocalRec(rec) });
  }
  /** The display session's window rows — the desktop keeper's OWN `windows(id)` (its two bounded children, its census rows: no
   *  spawn site here), kept XROWS_MS so a verb's /resolve and a picture's ask in one burst read X once. */
  const XROWS_MS = 750;
  const xRows = new Map(); // display session id → {at, p}
  function xRowsOf(dsId, { fresh = false } = {}) {
    if (!dsId || !displayKeeper || typeof displayKeeper.windows !== 'function') return Promise.resolve([]);
    const c = xRows.get(dsId);
    if (!fresh && c && now() - c.at < XROWS_MS) return c.p;
    const p = Promise.resolve().then(() => displayKeeper.windows(dsId)).then((r) => (r && r.ok && Array.isArray(r.windows) ? r.windows : []), () => []);
    xRows.set(dsId, { at: now(), p });
    return p;
  }
  /** The CDP window a holder's picture is about: the lease's OWN window (lane browser-windows: one per holder), else the window
   *  of the tab named (the live view's active tab), else of its first holder tab (a human's own tab included). → {windowId, bounds} | null */
  async function holderWindowOf(rec, profileId, browserKey, targetId = null) {
    if (!rec || !rec.cdpUrl) return null;
    const VP = require('./browser-viewport.js');
    const l = browserKey ? B.findLease(reg.leases, profileId, String(browserKey)) : null;
    const own = l && WIN.hasOwnWindow(l, WIN.instanceOf(rec)) ? WIN.windowIdOf(l.windowId) : null;
    // hotfix 2026-11-17: the window of the tab on show FIRST (PIC.xWindowLookups) — every tab opens in a window of its own, so the
    // lease's own window is the tab's only when no tab is named
    for (const q of PIC.xWindowLookups({ targetId, own, holderTabs: browserKey ? holderTabs(profileId, browserKey) : [] })) { const b = await VP.windowBoundsOf(rec.cdpUrl, q); if (b) return b; }
    return null;
  }
  /** THE HOLDER'S X WINDOW — the wid its live view draws: its CDP window's bounds matched against the display's rows (PURE
   *  PIC.xWindowOf — measured: CDP bounds ARE the X geometry); two rows with those very bounds ⇒ its window is moved one pixel
   *  right and asked once more. Off the X road ⇒ {wid: null, why: <the source's why>}. */
  async function xWindowFor(profileId, { browserKey = null, targetId = null, fresh = false } = {}) {
    const v = pictureSourceFor(profileId);
    if (!PIC.isX(v)) return { wid: null, why: v.why, windowId: null, source: v };
    const pid = String(profileId), rec = reg.browsers[pid], p = profile(pid);
    const win = await holderWindowOf(rec, pid, browserKey, targetId);
    let m = PIC.xWindowOf({ bounds: win && win.bounds, rows: await xRowsOf(v.displaySession, { fresh }), profileDir: p && p.dir }); // hotfix cure r1: a follow's second look reads the rows FRESH
    if (m.why === 'ambiguous' && win && win.bounds) {
      const VP = require('./browser-viewport.js');
      await VP.setWindowBounds(rec.cdpUrl, win.windowId, { left: Number(win.bounds.left) + 1, top: Number(win.bounds.top) });
      const again = await VP.windowBoundsOf(rec.cdpUrl, { windowId: win.windowId });
      m = PIC.xWindowOf({ bounds: again && again.bounds, rows: await xRowsOf(v.displaySession, { fresh: true }), profileDir: p && p.dir });
    }
    return { ...m, windowId: win ? win.windowId : null, instance: WIN.instanceOf(rec), source: v }; // hotfix cure r3: the browser's RUN (its startedAt) — a new Chrome hands out the same X ids under new CDP windows
  }
  /** Chrome's own dialog WINDOWS over ONE holder's window (a GTK file chooser, a print dialog — PURE PIC.dialogsOver over the
   *  display's rows); [] off the X road or while its window cannot be told. The sign-in sheet is drawn INSIDE the window
   *  (measured) — the dialog watch's native prompt says that one. */
  async function nativeDialogsFor(profileId, { browserKey = null, targetId = null } = {}) {
    const v = pictureSourceFor(profileId);
    if (!PIC.isX(v)) return [];
    const xw = await xWindowFor(profileId, { browserKey, targetId });
    if (xw.wid == null) return [];
    const p = profile(String(profileId));
    return PIC.dialogsOver(xw.wid, await xRowsOf(v.displaySession), { profileDir: p && p.dir });
  }
  /** lane desktop-x-seat-browser r2 (MAJOR A): THE PERSON'S INPUT SEAT'S ROOT on a browser display — HIS window (his holder
   *  key's: the window of his own tab; PURE PIC.xScopeOf over the display's rows, read FRESH). r3: its transients and the popups
   *  his acts open are the desktop bridge's (xpra's own announcements, in order — no row says whose a menu is). {wids: [], …} untold.
   *  r4: his window only when his bounds TELL it (PIC.xSeatRootOf) — never the profile's only window. */
  async function xScopeFor(profileId, { browserKey = null } = {}) {
    const xw = await xWindowFor(profileId, { browserKey });
    const wid = PIC.xSeatRootOf(xw);
    if (wid == null) return { wid: null, why: xw.why, wids: [], rects: [], known: [] };
    const p = profile(String(profileId));
    return { wid, why: xw.why, ...PIC.xScopeOf(wid, await xRowsOf(xw.source.displaySession, { fresh: true }), { profileDir: p && p.dir }) };
  }
  async function stop(profileId, { why = 'user' } = {}) {
    ensureLoaded();
    const rec = reg.browsers[profileId];
    if (!rec) throw namedError('not-found', `no browser record for ${profileId}`);
    if (!B.isLiveBrowser(rec)) return browserView(rec);
    if (stopping.has(profileId)) return browserView(rec);
    stopping.add(profileId);
    try {
      const p = profile(profileId);
      const inflight = starting.get(profileId);
      if (inflight) { try { await inflight; } catch { /* the failed start already wrote its verdict */ } }
      if (!isLocalRec(rec)) {
        // P4: nothing of ours to signal HERE. An external browser is left
        // running (it is somebody else's) and only the forward is closed; a
        // paired machine's browser is stopped by ITS browser-serve op, and a
        // machine that cannot be reached is said so — never a silent success.
        let left = null;
        // B-e799: a machine whose agent announces `browser-stop-facts` answers its OUTCOME in fields — read, never its words; asked
        // with `facts` (the manager's stop), a machine that cannot be asked — unreachable, or an agent that predates the answer —
        // REFUSES by name and nothing here moves (the record, the forward, the lease stay as they were). A person's stop keeps its road.
        if (!rec.external) {
          const facts = why === 'manager';   // B-e799: the manager's stop (and only it) asks for the STRUCTURED outcome — its call stays `stop(id, { why })`
          let r = null;
          try { r = await acc().call(rec.hostId, 'stop', { profileId, ...(facts ? { facts: true } : {}) }); }
          catch (e) {
            if (e && e.code === 'stop_failed') r = { outcome: 'failed', error: String(e.message || ''), survivors: [], holder: null };   // the machine ANSWERED: its close failed (an ok:false answer reaches us thrown)
            else if (facts) throw namedError(e && e.code === 'stop_facts_unsupported' ? 'stop_facts_unsupported' : 'host_unavailable', `${rec.hostId}: ${(e && e.message) || 'the machine could not be asked'}`);
            else left = `${rec.hostId} could not be asked to stop it (${e.message}) — the browser may still run there`;
          }
          if (r && typeof r.outcome === 'string') {
            const said = remoteStopWords(rec.hostId, r);
            stopOutcomes.set(profileId, { outcome: r.outcome, survivors: Array.isArray(r.survivors) ? r.survivors.slice(0, 8) : [], holder: r.holder || null, why: said });
            if (said) left = said;
          } else if (r && r.left) left = `${rec.hostId}: ${r.left}`;
        }
        if (rec.forward) acc().closeForward(`${rec.hostId}:${rec.forward.remotePort}`);
        rec.state = why === 'failed' ? 'failed' : 'stopped';
        rec.endedAt = now(); rec.stoppedBy = why;
        if (why === 'idle') rec.lastError = `stopped after ${Math.round(idleMs() / 60000)} min with no lease (idle timeout)`;
        else if (why !== 'user') rec.lastError = why;
        if (left) rec.lastError = `${rec.lastError ? rec.lastError + '; ' : ''}${left}`;
        guard.delete(profileId); live.delete(profileId);
        if (mediator) mediator.repoint(profileId, null); // P6: a mediated url answers browser_stopped until the next start
        log.log?.(`[browser] ${profileId} "${p ? p.label : profileId}" ${rec.external ? 'released (external browser left running)' : 'stopped on ' + rec.hostId} (${why})${left ? ' — NOT clean: ' + left : ''}`);
        handBackOnStop(profileId, p, why); // r6 LOW 3
        if (humans.has(profileId)) await endHuman(profileId, 'stopped', { closeTab: false }); // BROWSE YOURSELF: his tab went with the browser
        commit();
        return browserView(rec);
      }
      // verify r3 M1 (a): BEFORE the first signal the record follows the daemon's in-place relaunch — the browser the
      // SIGKILL below might orphan is the one running NOW, not the one launched
      recaptureBrowser(rec, 'the stop');
      // lane browser-resume (§3.9): a conversation's own browser's tabs are READ before it closes (bounded; the relay's
      // last list stands when they cannot be) — they are what its kept entry gives back
      if (isEph(p)) await captureKeptTabs(p, rec, 'the stop');
      // The CLI's own stop first — it owns the daemon and chromium. A managed
      // ephemeral browser is asked under its session's pairs (its socket dir).
      if (isEph(p)) await rt.closeAll(null, { extraEnv: pairsEnv(pairsOf(profileId) || [`AGENT_BROWSER_SESSION=${rec.ns}`, `AGENT_BROWSER_NAMESPACE=${rec.ns}`]) });
      else { try { await rt.closeAll(rec.ns, { dir: p ? p.dir : null, extraEnv: rec.launchEnv || { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' } }); } catch (e) { log.warn?.(`[browser] ${profileId}: the CLI's close-all failed (${(e && e.code) || ''} ${(e && e.message) || e}) — the stop goes on to its ladder`); } } // naive study 2: the launch's own view // B-8b87 round 3: a close-all that fails never aborts the stop
      // lane one-browser-b1: on the ATTACH road the record's process IS Chrome (this keeper spawned it; a CDP session's close
      // never ends an attached browser — measured) — ended by its identity now, then its display session goes with it
      if (rec.launch === 'attach') { await endProcess(rec.pid, rec.starttime, { termMs: STOP_GRACE_MS, site: 'the keeper: its stop' }); await endDisplay(rec, `its browser stopped (${why})`); }
      let left = null;
      const until = now() + STOP_GRACE_MS;
      while (now() < until && rec.pid && F.pidAlive(rec.pid)) await sleep(100);
      if (rec.pid && F.pidAlive(rec.pid)) {
        const v = pidVerdictOf(rec);
        if (v === 'ours') {
          recaptureBrowser(rec, 'the stop'); // verify r3: again, right before our own signal
          try { process.kill(rec.pid, 'SIGTERM'); SL.noteSignal(rec.pid, 'the keeper: its stop', 'SIGTERM', now(), rec.starttime); } catch { /* gone */ } // B-346d's recorder (c)
          const t2 = now() + 1500;
          while (now() < t2 && F.pidAlive(rec.pid)) await sleep(100);
          if (F.pidAlive(rec.pid)) { try { process.kill(rec.pid, 'SIGKILL'); SL.noteSignal(rec.pid, 'the keeper: its stop', 'SIGKILL', now(), rec.starttime); } catch { /* gone */ } await sleep(200); }
          if (F.pidAlive(rec.pid)) left = `daemon pid ${rec.pid} survived SIGKILL`;
        } else left = `daemon pid ${rec.pid} is still alive but not provably ours (${v}) — left alone, never signalled`;
      }
      // VERIFY r2 M1: the daemon is gone (its own close, or the SIGKILL above) — its browser must be too: a moment to
      // exit by itself, then the recorded identity is ended (a SIGKILLed daemon leaves its Chrome holding the lock)
      if (!left) {
        // a moment for it to exit by itself (the recorded browser, or — verify r3 — whatever holds a minted directory's lock)
        const holderAlive = () => (rec.browser && F.pidAlive(rec.browser.pid)) || [rec.browser && rec.browser.dir, p && p.dir].filter(Boolean).some((d) => { const l = F.readSingletonLock(d); return !!(l && l.host === os.hostname() && F.pidAlive(l.pid)); });
        for (let i = 0; i < 15 && holderAlive(); i++) await sleep(100);
        const rr = await reapOrphan(rec, 'the stop');
        if (rr === 'survived') left = `its browser pid ${rec.browser ? rec.browser.pid : '?'} survived SIGKILL`;
      }
      rec.state = why === 'failed' ? 'failed' : 'stopped';
      rec.endedAt = now(); rec.stoppedBy = why;
      if (why === 'idle') rec.lastError = `stopped after ${Math.round(idleMs() / 60000)} min with no lease (idle timeout)`;
      else if (why === 'switch') rec.lastError = 'stopped to switch backend (§7.4) — restarted on the new one';
      else if (why === 'turn-idle') { rec.lastError = null; rec.note = 'released after the turn ended — the next command starts it again'; }
      else if (why !== 'user') rec.lastError = why;
      if (left) rec.lastError = `${rec.lastError ? rec.lastError + '; ' : ''}${left}`;
      guard.delete(profileId); live.delete(profileId);
      if (mediator) mediator.repoint(profileId, null); // P6
      log.log?.(`[browser] ${profileId} "${p ? p.label : profileId}" stopped (${why})${left ? ' — NOT clean: ' + left : ''}`);
      handBackOnStop(profileId, p, why); // r6 LOW 3
      // BROWSE YOURSELF (B-6ae8): the user's own tab went with the browser (a Stop, Quit, a switch, Delete…) — his browsing
      // ends `stopped` here, never outliving the Chrome it was in
      if (humans.has(profileId)) await endHuman(profileId, 'stopped', { closeTab: false });
      // …and every CONVERSATION on it lost its tab too (the owner, 5: "they reopen with `tab new` on their next command"):
      // measured on the real 0.38.1 (test-browser-human-ui (e)), a session pinned to a tab of the stopped Chrome answers
      // `tab_gone` on its next command — marked, so its next attach binds a new tab first (the rule the "Who can use it"
      // narrowing already follows). Never a switch (it re-opens its own tabs) or an ephemeral record. verify r1 (H3): a
      // MEDIATED lease too — measured on the real 0.38.1 + the real mediator, its session (its own namespace over its scoped
      // url) answered `tab_gone` to every command after a Quit; its next attach binds its new tab THROUGH its grant.
      if (p && !isEph(p) && why !== 'switch') for (const l of reg.leases) if (l.profileId === profileId) markTabLost(profileId, l.browserKey, 'closed');
      delete reg.leftTabs[profileId]; // verify r2: the tabs conversations left behind went with the browser
      dropEgress(profileId); if (rec) delete rec.egress; // lane engine-spi-egress r2: a stopped browser frees its proxy's port (the next start takes a new one)
      commit();
      if (isEph(p)) keptNote('stop', p, { why }); // lane browser-resume (§3.9): its logins + its tabs are KEPT (D2: `why` decides whether its next start reopens them)
      emitLease({ kind: 'browser-stopped', profileId, why, local: true, ...ephEventFields(profileId) }); // lane H: an ephemeral browser's stop is said like any other (ephemeral: true)
      return browserView(rec);
    } finally { stopping.delete(profileId); }
  }

  // ── leases (§3.4) ──
  /**
   * Attach a conversation to a profile: ownership → ceiling → the browser
   * (reuse-or-spawn) → the lease → commit. Returns the lease, the env the
   * session browses with and — for the WRAPPER only — the CDP url; a route
   * that prints the answer strips it (§5.1: `use` never prints a CDP URL).
   */
  /**
   * lane browser-windows (U1): A LEASE'S TAB IN THIS BROWSER IS IN A WINDOW OF ITS OWN. At the attach of a NEW lease, of a
   * lease whose tab is gone (`tabClosed`), and of a lease whose window was in a PREVIOUS run of this browser (a restart —
   * none of its windows survived), the keeper opens its window and binds its session there BEFORE its first command
   * (`openOwnTab`, no fallback: a window that cannot be made leaves the first command to open the tab as before). A lease
   * whose tab still lives in the browser's shared window (started before this lane, adopted across a restart) is left
   * where it is — its page is not moved (Chrome has no CDP move) and it stays taken over WITH the others in that window
   * until the browser restarts (`windowMates`). A MEDIATED lease's tabs land in windows of their own through the proxy's
   * create rewrite (src/browser-mediation.js) — it is only recorded. `windowIn` = the browser run its window is in.
   */
  async function ownWindowAtAttach(p, browserKey, { created = false } = {}) {
    const rec = reg.browsers[p.id];
    const inst = WIN.instanceOf(rec);
    const l = B.findLease(reg.leases, p.id, browserKey);
    if (!l || !inst || WIN.hasOwnWindow(l, inst)) return null;
    const k = `${p.id}|${browserKey}`;
    const stale = typeof l.windowIn === 'string' && l.windowIn !== inst;
    if (!(created || stale || reg.tabClosed[k])) return null;
    if (isMediated(p)) { l.windowIn = inst; commit(); return { window: 'own', mediated: true }; }
    const o = await leaseCliOpts(p.id, browserKey);
    if (!o) return null;
    const pinTab = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
    const r = await openOwnTabMarked(p, browserKey, { ns: nsOf(p.id), opts: o, pin: pinTab ? ['--pin-tab'] : [], fallback: false });
    if (!(r && r.ok && r.targetId)) return null;
    const l2 = B.findLease(reg.leases, p.id, browserKey);
    if (!l2) return null;
    l2.windowIn = inst;
    l2.windowId = WIN.windowIdOf(r.windowId); // T2 ⑧: THE holder's one window — every later tab opens in it (verify r2: an unread id stays null, never 0)
    l2.tabRoots = TBS.addRoot([], r.targetId); // its window's tab is its only root in this browser
    // lane browser-windows-fix (int201): a lease whose tab was LOST (L2's mark: a replaced browser — a pod roll, a crash — or the
    // user's close) or whose window was in a previous run is TOLD it was rebound, as L2's block below would have said it: this bind
    // takes the mark, so that block never runs. Before, the first command after a SingletonLock takeover printed no [tab_rebound]
    // and the agent silently lost its page (test-browser-share ⑩). The note rides the lease until an answer carries it (F4).
    const lostWhy = reg.tabClosed[k] ? (reg.tabLostWhy && (reg.tabLostWhy[k] === 'closed' || reg.tabLostWhy[k] === 'place') ? reg.tabLostWhy[k] : 'life') : stale ? 'life' : null;
    if (lostWhy) keepRebound(p.id, browserKey, { how: 'new', targetId: String(r.targetId), url: 'about:blank', why: lostWhy, text: TBS.reboundNoteText({ how: 'new', why: lostWhy }) });
    delete reg.tabClosed[k]; if (reg.tabLostWhy && typeof reg.tabLostWhy === 'object') delete reg.tabLostWhy[k];
    commit();
    log.log?.(`[browser] ${browserKey} on ${p.id} "${p.label}": its own window opened and bound (tab ${String(r.targetId).slice(0, 8)}${r.windowId ? ', window ' + r.windowId : ''}) — ${created ? 'a new lease' : stale ? 'its window was in a previous run of this browser' : 'its tab was gone'}`);
    return r;
  }
  /**
   * `by` = who asks: 'agent' (the CLI's `use`, a verb's resolve), 'user' (the UI's attach — the user's pick WRITES the list:
   * the conversation is added when the list does not admit it, §3.3) or 'pin' (a verb opening the conversation's pin —
   * judged by the list like any other: a pin never authorizes). `via: 'pin'` is stamped on a lease the pin CREATED, so a
   * pin that moves (or an unpin) detaches exactly the lease it made and no attachment the agent made. `taskIds` /
   * `groupsUnreadable` = the Task Groups the conversation belongs to NOW (asked at every command).
   */
  async function attach({ profile: ref, profileId, browserKey, sessionId = null, taskIds = [], groupsUnreadable = false, alias = '', by = 'agent' } = {}) {
    ensureLoaded();
    refuseIfHeld('attaching a browser');   // checkpoint 60's red cure, ALSO CURED: while held the registry is EMPTY and unread — «no profile» was a false answer
    const p = profileId ? profile(profileId) : profileByRef(ref);
    if (!p) throw namedError('not-found', `no profile ${profileId || ref}`);
    if (p.ambiguous) throw namedError('ambiguous', `"${ref}" names ${p.ambiguous.length} profiles (${p.ambiguous.join(', ')}) — use the id`);
    if (isEph(p)) throw namedError('not_attachable', `"${p.label}" is a conversation's managed ephemeral browser — a bare \`vibespace-browser <verb>\` of that conversation lands on it; it is never attached by id`);
    // lane jobs-browser-f11-race (the .229 rule's second ordering, PURE B.attachWaitVerdict): a narrowing's close of THIS
    // holder's session still in flight finishes first — else it lands on the tab this attach binds (closed, marked lost)
    const cw = B.attachWaitVerdict({ closing: sessionCloses, profileId: p.id, browserKey });
    if (cw.wait) { log.log?.(`[browser] ${browserKey}: its attach on ${p.id} waits for its session's close in flight (bounded by the browser CLI's own timeouts, ~30 s at most)`); await sessionCloses.get(cw.key); }
    // identity verify r2 (2026-09-28): a conversation on ANOTHER machine never holds a lease here — its `use` used to
    // launch this machine's Chrome and hand the other machine a loopback CDP url it cannot reach (refused BY NAME, first)
    if (isRemoteKey(browserKey)) {
      const rr = B.remoteSessionRefusal({ label: p.label });
      // a lease such a session took BEFORE this fence (kept across restarts — its key is a live one) goes with the refusal:
      // the panel stops naming a holder that never could reach the browser
      if (B.findLease(reg.leases, p.id, browserKey)) { try { detach({ profileId: p.id, browserKey, by: 'user' }); log.log?.(`[browser] ${browserKey}: its lease on ${p.id} "${p.label}" dropped — it runs on another machine`); } catch (e) { log.warn?.(`[browser] ${browserKey}: its remote lease on ${p.id} stays — ${e && e.message}`); } }
      throw namedError(rr.code, rr.error, { remedy: rr.remedy });
    }
    if (switching.has(p.id)) { const rr = SW.restartingRefusal(p); throw namedError(rr.code, rr.error); }
    const facts = { ids: (Array.isArray(taskIds) ? taskIds : []).map(String), unreadable: !!groupsUnreadable };
    let added = null;
    if (by === 'user') { added = addConversation(p, browserKey, facts); if (added) commit(); }
    const line = lineOf(facts.ids);   // lane lg-group-parents U3b
    const d = B.decideAttach({ profile: p, leases: reg.leases, browserKey, sessionId, now: now(), taskIds: facts.ids, inheritedTaskIds: line.inherited, groupsUnreadable: facts.unreadable || line.unreadable, conversationKeys: keysOfKey(browserKey) });   // lane grants-unify: judged by the keys the store names it by
    if (!d.ok) {
      // MEMBERSHIP IS JUDGED AT EVERY COMMAND (§2.3; the owner's default 2 — no store subscription): a conversation the
      // list no longer admits (it left the Task Group the profile is kept to, a narrowing it missed) is refused AND the
      // lease it still holds here is detached in the same call — its tab closes, its takeover ends; the refusal says so
      let closed = false;
      if (d.code === 'not_owner') {
        const rj = rejudgeLeases(p.id, 'verb-time', { onlyKey: B.parentKeyOf(browserKey), facts });
        closed = rj.detached.length > 0;
        // this refusal IS the telling (its words say the tab closed): the next command is not refused `profile_changed` for it
        if (closed) tell(B.parentKeyOf(browserKey));
      }
      throw namedError(d.code, closed ? `${d.error} (Your tab in its browser was closed.)` : d.error, { ...(d.remedy ? { remedy: d.remedy } : {}), ...(closed ? { closed: true } : {}) });
    }
    if (d.created && by === 'pin') d.lease.via = 'pin';
    // §3.7: the attachment's HANDLE. An explicit alias must be well-formed and
    // free within this session's set; otherwise the lease keeps the alias it
    // had, or is given the label's slug ONCE here (stored, so a later label
    // rename never renames the handle an agent is already using).
    {
      const set0 = setFor(browserKey);
      const taken = set0.attachments.filter((a) => a.profileId !== p.id).map((a) => a.alias);
      const want = String(alias || '').trim();
      if (want) {
        if (!B.isAlias(want)) throw namedError('bad_alias', `an alias is 1-32 chars of [a-z0-9_-], starting with a letter or digit — ${JSON.stringify(want)} is not`);
        if (taken.includes(want) || reg.profiles.some((x) => x.id === want && x.id !== p.id)) throw namedError('alias_taken', `alias ${JSON.stringify(want)} already names another attachment of this session`);
        d.lease.alias = want;
      } else if (!B.isAlias(d.lease.alias)) d.lease.alias = B.aliasFor(p.label, taken, p.id);
    }
    // The floor decides whether the wrapper form may pass `--pin-tab` (§3.4),
    // and this keeper's facts instance is the only one that answers for it —
    // ws-create's too-old notice probes ITS OWN. Probe once (cached per TTL,
    // including the negative answer); a probe that cannot run leaves the
    // answer 'unknown' and pinTab false, never a throw out of an attach
    // (B-0b8c: and its ladder asks again — the boot probe below started it).
    if (bf.lastVersion() === undefined) { try { await bf.probeVersion(); } catch { /* floorVerdict spells it */ } }
    // MULTIVIEW D4: attaching a browser this conversation does not already count
    // (not live, or live only for others) adds one to ITS cap
    if (!(B.isLiveBrowser(reg.browsers[p.id]) && ownsLive(B.parentKeyOf(browserKey), p.id))) {
      const own = conversationCapNow(browserKey);
      if (own) throw namedError(own.code, own.error, { holders: own.holders, remedy: own.remedy, scope: own.scope, capOwn: own.own, capOf: own.cap });
    }
    const browser = await start(p.id, { why: `attach ${browserKey}`, browserKey });
    // r4 MAJOR 1: a browser that was closed and could not be started again is refused BY NAME (the user's own browser
    // holds the directory: profile_locked naming its pid; else browser_closed) — never a dead port handed to the agent
    { const cr = closedRefusalOf(p.id); if (cr) throw namedError(cr.code, cr.error, cr.holderPid ? { holderPid: cr.holderPid } : {}); }
    // naive study 2: a non-mediated lease reaches the keeper's browser over its CDP url — resolved BEFORE the
    // lease is taken; none ⇒ refused by name (never the directory: a second Chrome on it dies on SingletonLock)
    const leaseCdp = isMediated(p) ? null : await leaseCdpUrl(p.id);
    if (!isMediated(p) && !leaseCdp) throw namedError('browser_no_cdp', noCdpError(p));
    if (d.created) reg.leases.push(d.lease);
    else reg.leases = reg.leases.map((l) => (l.profileId === p.id && l.browserKey === browserKey ? d.lease : l));
    // verify r2: it is back — its tab is its own again, not an orphan (verify r3: its own statement — r2 had put it between
    // the `if (d.created)` and its `else`, so the else bound to IT: an existing lease was re-carried only without a mark)
    if (reg.leftTabs[p.id] && reg.leftTabs[p.id][browserKey]) { delete reg.leftTabs[p.id][browserKey]; if (!Object.keys(reg.leftTabs[p.id]).length) delete reg.leftTabs[p.id]; }
    p.lastUsedAt = now();
    commit();
    await ownWindowAtAttach(p, browserKey, { created: !!d.created });
    // a conversation whose tab the keeper CLOSED (the user took the profile from it, closeLeaseSession) is bound to that
    // gone tab until it binds a new one — the keeper binds it here, before its first command runs (never a mediated
    // lease: the proxy scopes its tabs; never an unmarked session: a tab it still has is kept)
    let rebound = null; // lane profile-lock-roll (L2): what this attach bound, said once in the command's answer
    if (!isMediated(p) && reg.tabClosed[`${p.id}|${browserKey}`]) {
      let bound = false;
      const why = reg.tabLostWhy && ['life', 'place'].includes(reg.tabLostWhy[`${p.id}|${browserKey}`]) ? reg.tabLostWhy[`${p.id}|${browserKey}`] : 'closed';
      // verify r1 (F3): one rebind at a time per profile — the page list is read AFTER the previous session's bind landed
      await serialRebind(p.id, async () => { if (!reg.tabClosed[`${p.id}|${browserKey}`]) { bound = true; return; }
      // verify r2 (F2): re-asked AFTER the wait — a lease detached while it queued opens no tab (a blank tab nobody rooted was
      // left in the browser; its mark stays, so its next attach binds)
      if (!B.findLease(reg.leases, p.id, browserKey)) { log.log?.(`[browser] ${browserKey}: detached while waiting to bind a tab in ${p.id} "${p.label}" — no tab opened`); return; }
      try {
        const o = await leaseCliOpts(p.id, browserKey);
        const pinTab0 = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
        const pin = pinTab0 ? ['--pin-tab'] : [];
        // lane profile-lock-roll (L2): the browser's ONE page that nobody roots (a fresh launch's single blank tab) is bound
        // to — no second blank tab per relaunch; anything else ⇒ a new tab of its own (never another holder's)
        const pick = o ? TBS.rebindPick({ targets: await tabTargetsOf(rawCdpOf(p.id, o)), holders: tabHoldersOf(p.id), key: browserKey }) : null;
        let r = o && pick ? await rt.exec(nsOf(p.id), [...pin, 'tab', pick.targetId, '--json'], o) : null;
        let how = r && r.ok ? 'switched' : null;
        if (!how) { r = o ? await keeperMakes(p.id, () => rt.exec(nsOf(p.id), [...pin, 'tab', 'new'], o), (x) => (x && x.ok ? KB.targetIdOf(x.stdout) : null)) : null; how = r && r.ok ? 'new' : null; } // B-e674 unit 2's cure: the keeper's own create
        if (r && r.ok) {
          bound = true; clearTabLost(p.id, browserKey);
          const nid = how === 'switched' ? pick.targetId : KB.targetIdOf(r.stdout);
          const lr = nid ? B.findLease(reg.leases, p.id, browserKey) : null;
          if (lr) lr.tabRoots = TBS.addRoot([], nid); // lane browser-resume C: the bound tab is its only root now
          rebound = { how, targetId: nid || null, url: how === 'switched' ? pick.url : 'about:blank', why, text: TBS.reboundNoteText({ how, url: how === 'switched' ? pick.url : '', why }) };
          keepRebound(p.id, browserKey, rebound); // verify r3 (F4): kept on the lease until an answer carries it
          commit();
          log.log?.(`[browser] ${browserKey}: ${how === 'switched' ? `bound to the browser's only tab ${pick.url}` : 'a new tab bound'} in ${p.id} "${p.label}" (${why === 'life' ? 'its tab went with the replaced browser' : 'its last one was closed when the user took the profile from it'})`);
        } else log.warn?.(`[browser] ${browserKey}: no tab bound in ${p.id} — ${String((r && (r.stderr || r.error)) || 'no CDP url').trim().slice(0, 160)}; its next command may answer tab_gone`);
      } catch (e) { log.warn?.(`[browser] ${browserKey}: no tab bound in ${p.id} — ${e && e.message}`); }
      });
      // verify r3 (#3, "its next command never lands in his tab"): the tab this session is still bound to may be one the USER
      // TOOK (adoptOrphan marked it — it is alive, and his): a failed bind would run this command IN HIS PAGE. While his holder
      // keeps a tab he took, the attach is refused by name (fail closed; the mark stays, the next command binds again). A
      // mark whose tab was CLOSED (the user's narrowing, a stop) answers the binary's own `tab_gone` — safe, unchanged.
      const hu = humans.get(p.id);
      if (!bound && hu && Array.isArray(hu.adopted) && hu.adopted.length) throw namedError('tab_unbound', `a new tab for this conversation could not be opened in "${p.label}" (the tab it had is the user's now) — run the command again`);
    }
    // lane live-input (the owner's journal: this line on EVERY agent command, 175 in 18 min): said when the holder CHANGES —
    // a new lease or a re-carried one — never for a command of the conversation that already holds it
    if (d.created || d.resumed) log.log?.(`[browser] ${browserKey}${sessionId ? ' (' + sessionId + ')' : ''} ${d.created ? 'attached to' : 're-carries its lease on'} ${p.id} "${p.label}" (${d.others} other session(s) on it)`);
    // verify r6 (S2): a lease taken while the USER drives this browser (from another conversation's view) is paused from
    // birth — it joins the running takeover (its own cycle, card and reminder), never a fresh 'agent' seat beside the user
    joinTakeoverIfDriven(browserKey, p.id, sessionId || d.lease.sessionId || null);
    await settleArming(emitLease({ kind: 'attach', browserKey, profileId: p.id, sessionId: sessionId || d.lease.sessionId || null, created: !!d.created, resumed: !!d.resumed })); // lane H: the recorder's tap is armed before the verb runs (bounded)
    const rec = reg.browsers[p.id];
    const pinTab = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
    // P6 (§6.2 / §6.5): a MEDIATED profile hands the lease ITS OWN scoped url
    // — never the directory, never the raw endpoint. No proxy in this process
    // (a registry written by one that had it) is a NAMED refusal, never a
    // silent fall-back to the cooperative env; a browser that answered no
    // CDP url has nothing to mediate.
    if (isMediated(p)) {
      if (!mediationOn()) throw namedError('mediation_unavailable', `"${p.label}" is shared instance-wide and this instance has no mediating CDP proxy — it cannot be attached here`);
      if (!rec || !rec.cdpUrl) throw namedError('mediation_no_cdp', `"${p.label}" is shared instance-wide but its browser answered no CDP url — nothing to mediate; stop it and attach again`);
      sayRetiredSwitch();
      const g = await mediator.grantFor({ profileId: p.id, browserKey, upstream: rec.cdpUrl, targetIds: d.lease.targetId ? [d.lease.targetId] : [], paused: () => inputStateFor(browserKey, p.id).input === 'user', place: () => placeKindFor(p.id) });
      // verify r1 (H3): a mediated conversation whose tab went with a stopped browser (Quit the whole browser, the row's
      // Stop) binds a NEW tab before its first command — under ITS session in ITS namespace over ITS scoped url (the same
      // env its CLI runs with, so its daemon is not restarted), so the tab is created through the grant and is its own
      if (reg.tabClosed[`${p.id}|${browserKey}`] && g && g.url) {
        const why = reg.tabLostWhy && ['life', 'place'].includes(reg.tabLostWhy[`${p.id}|${browserKey}`]) ? reg.tabLostWhy[`${p.id}|${browserKey}`] : 'closed';
        try {
          const env = require('../browser-stream.js').pairsToEnv(M.mediatedEnvFor({ browserKey, profileId: p.id, url: g.url, idleMs: idleMs() }));
          const r = await rt.exec(null, [...(pinTab ? ['--pin-tab'] : []), 'tab', 'new'], { extraEnv: env });
          if (r && r.ok) { clearTabLost(p.id, browserKey); rebound = { how: 'new', targetId: KB.targetIdOf(r.stdout) || null, url: 'about:blank', why, text: TBS.reboundNoteText({ how: 'new', why }) }; keepRebound(p.id, browserKey, rebound); commit(); log.log?.(`[browser] ${browserKey}: a new tab bound in ${p.id} "${p.label}" through its mediated grant (${why === 'life' ? 'its tab went with the replaced browser' : 'its last one went with the stopped browser'})`); }
          else log.warn?.(`[browser] ${browserKey}: no new tab bound in ${p.id} through its grant — ${String((r && (r.stderr || r.error)) || 'no answer').trim().slice(0, 160)}; its next command may answer tab_gone`);
        } catch (e) { log.warn?.(`[browser] ${browserKey}: no new tab bound in ${p.id} through its grant — ${e && e.message}`); }
      }
      const noteOut = takeRebound(p.id, browserKey, rebound); // verify r3 (F4): this answer carries the note (its own, or one an abandoned answer left)
      return { lease: leaseView(d.lease), created: d.created, resumed: d.resumed, others: d.others, profile: pview(p), browser, mediated: true, env: M.mediatedEnvFor({ browserKey, profileId: p.id, url: g.url, idleMs: idleMs() }), cdpUrl: g.url, pinTab, note: M.mediationSentence({ profileLabel: p.label, others: d.others }), ...(added ? { added } : {}), ...(noteOut ? { rebound: noteOut } : {}) };
    }
    // P4: a browser REACHED (external / on a paired machine) is named by the
    // hub-side CDP url, never by a directory — the pair rides the env only
    // (the subshell and the `--` form), `use --print` withholds it (§5.1)
    const noteOut = takeRebound(p.id, browserKey, rebound); // verify r3 (F4): this answer carries the note (its own, or one an abandoned answer left)
    const leaseUrl = await leaseUrlFor(p, browserKey, leaseCdp); // lane browser-shared-profile-freeze: the scope road's own url (else the raw one)
    if (leaseCdp && !leaseUrl) throw namedError('scope_unavailable', `"${p.label}" is shared with your other conversations through VibeSpace, and VibeSpace could not give this conversation a connection of its own just now — it is not attached (the browser itself is never handed out); try again in a moment`);   // (lane chrome-157, the .401 read L2b)
    return { lease: leaseView(d.lease), created: d.created, resumed: d.resumed, others: d.others, profile: pview(p), browser, mediated: false, env: B.attachedEnvFor({ browserKey, profileId: p.id, cdpUrl: leaseUrl, socketDir: rec && rec.launch === 'attach' ? rec.socketDir : null }), cdpUrl: leaseUrl !== leaseCdp ? leaseUrl : rec ? rec.cdpUrl : null, pinTab, ...(added ? { added } : {}), ...(noteOut ? { rebound: noteOut } : {}) };
  }
  /** VERIFY r2 L8: the paused sentence, said about a DETACH (the refusal's own words name a command). */
  const detachPausedText = (err) => String(err || '').replace('your command did NOT run', 'your detach did NOT run (it would end their takeover and take the browser out from under them)');
  /**
   * `by` = who asks: 'agent' (the default — the agent route, the CLI's `detach` and its post-`close` drop) or 'user'
   * (the UI route). VERIFY r2 L8: while the USER drives this browser an agent's detach is REFUSED by name
   * (`browser_paused`) — it used to hand the takeover back with a `detach` cause the agent caused and, on a managed
   * ephemeral, retire the browser under the user. The user's own detach ends it as before.
   */
  function detach({ profileId, profile: ref, browserKey, by = 'agent' } = {}) {
    ensureLoaded();
    let id = profileId;
    if (!id && ref) { const p = profileByRef(ref); if (p && !p.ambiguous) id = p.id; }
    // a HANDLE (the attachment's alias) names it too (§3.7)
    if (!id && ref) { const a = setFor(browserKey).attachments.find((x) => x.alias === String(ref).trim()); if (a) id = a.profileId; }
    if (!id) {
      const mine = B.leasesOf(reg.leases, browserKey);
      if (mine.length === 1) id = mine[0].profileId;
      else if (!mine.length) throw namedError('no_lease', 'this session holds no lease');
      else throw namedError('ambiguous', `this session holds ${mine.length} leases (${mine.map((l) => l.profileId).join(', ')}) — name the profile`);
    }
    const d = B.decideDetach({ leases: reg.leases, profileId: id, browserKey });
    if (!d.ok) throw namedError(d.code, d.error);
    // VERIFY r1 L2: read BEFORE the lease leaves — a managed ephemeral browser's detach is an EPHEMERAL seam event
    // (its key, its session), so the recorder drops `<session>|ephemeral` instead of a `<session>|bp-…` it never had
    const evFields = ephEventFields(id);
    // r2 L8: the input side of THIS browser — a managed ephemeral's is keyed `<key>|ephemeral` (profileId null), a profile's by its id
    const inPid = evFields.ephemeral ? null : id;
    if (by !== 'user') { const paused = pausedVerdictFor(browserKey, inPid); if (paused) throw namedError(paused.code, detachPausedText(paused.error), { takenAt: paused.takenAt, lastUserInputAt: paused.lastUserInputAt }); }
    dropInputsFor(browserKey, inPid); // P3: a lease that goes away takes its input side with it
    if (mediator) mediator.revoke({ profileId: id, browserKey }); // P6: its url goes, and its own tabs are closed in the browser
    reg.leases = d.remaining;
    noteLeftTab(id, browserKey); // verify r3: a detached conversation's page stays (its session still bound to it) — never his to lose it to
    const rec = reg.browsers[id];
    if (rec && !d.others) rec.lastLeaseDroppedAt = now();
    commit();
    const eph = !!evFields.ephemeral;
    log.log?.(`[browser] ${browserKey} detached from ${id} (${d.others} lease(s) remain${eph ? '; it is this conversation\'s managed ephemeral browser — stopped and removed now, the next verb starts it again' : (!d.others && rec && B.isLiveBrowser(rec) ? `; the browser idles out in ${Math.round(idleMs() / 60000)} min unless re-attached` : '')})`);
    emitLease({ kind: 'detach', browserKey, profileId: id, sessionId: d.lease ? d.lease.sessionId || null : null, ...evFields });
    // VERIFY r1 L2: an ephemeral browser has no life without its lease (the next reconcile retired it silently) —
    // the detach retires it itself, now, and SAYS so (why 'user' — an explicit act, on §54b's closed list); a verb meanwhile waits on the retire and starts a fresh one
    if (eph) {
      // lane browser-resume (D2): a detach is a DELIBERATE stop — the kept tabs are not reopened by themselves
      if (B.isBrowserKey(browserKey)) { try { keptStore()?.noteDeliberate?.(browserKey, by === 'user' ? 'user' : 'agent'); } catch { /* the store says its own */ } }
      retireEphemeral(id, 'user').catch((e) => log.warn?.(`[browser] ephemeral ${id}: retire after detach failed — ${e && e.message}`));
      return { lease: leaseView(d.lease), others: d.others, ephemeral: true, retiring: true, note: EPHEMERAL_DETACH_NOTE };
    }
    return { lease: leaseView(d.lease), others: d.others };
  }
  /**
   * OWNER RULING A (6) — Delete… of a profile conversations use: every lease is detached BY THE USER (each conversation's
   * own takeover ends with it; a mediated one's tabs close), then its browser is stopped (the logins stay in the
   * directory, which the set-aside then moves beside itself). The pins are lane S2's seam (`unpinProfile`), asked by the
   * route after this. → `{detached:[{browserKey, sessionId}], stopped}`.
   */
  async function releaseAll(profileId) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p) throw namedError('not-found', `no profile ${profileId}`);
    if (isEph(p)) throw namedError('not_editable', `"${p.label}" is a conversation's own temporary browser — stop it instead`);
    // BROWSE YOURSELF verify r1 (H4): Delete… while the USER browses it (driving, or his page kept while away) is REFUSED BY
    // NAME before anything is released — never his page stopped under him by a confirm that did not name him (a Delete from
    // his phone while his desktop window holds a half-filled form); his Close / Quit the whole browser is the way out
    if (humans.has(profileId)) throw namedError('browsing_yourself', HM.humanRefusalText('browsing_yourself', { label: p.label }));
    const detached = [];
    for (const l of reg.leases.filter((x) => x.profileId === profileId)) {
      try { detach({ profileId, browserKey: l.browserKey, by: 'user' }); detached.push({ browserKey: l.browserKey, sessionId: l.sessionId || null }); }
      catch (e) { log.warn?.(`[browser] ${profileId}: release could not detach ${l.browserKey} — ${e && e.message}`); }
    }
    let stopped = false;
    if (B.isLiveBrowser(reg.browsers[profileId])) { await stop(profileId, { why: 'user' }); stopped = true; } // the user's Delete… — a user act
    log.log?.(`[browser] ${profileId} "${p.label}" released by the user: ${detached.length} lease(s) detached${stopped ? ', its browser stopped' : ''}`);
    return { detached, stopped };
  }
  /** Stop ONE conversation's managed ephemeral browser (the card's adopt moves its scratch directory — its Chrome holds the
   *  lock, and a lock whose mark names the conversation is never the keeper's to end at the adopted profile's launch). */
  async function stopEphemeralOf(browserKey) {
    const e = ephemeralFor(browserKey);
    if (!e || !e.live) return false;
    await stop(e.profileId, { why: 'user' });
    return true;
  }
  // ── BROWSE YOURSELF (B-6ae8): the USER as one more holder, on HIS OWN pinned tab ──
  /** How long this holder keeps his tab while AWAY (the owner, 8): he launched the browser ⇒ `browser.humanKeepMs` (12 h);
   *  he joined one an agent launched ⇒ the 10-min `browser.takeoverIdleMs` (the browser then follows its other holders). */
  /** r3941: a keep time in the journal's words — 0 is «never» (no lapse: the person's own, or the safe side while the settings are held), never «0 h» */
  const keepWords = (ms, unit, name) => (Number(ms) > 0 ? `${Math.round(ms / unit)} ${name}` : 'with no end (never lapses)');
  function humanKeepOf(h) { return HM.keepFor({ launched: !!(h && h.launched), keepMs: HM.humanKeepMs(setting(HM.HUMAN_KEEP_SETTING, HM.DEFAULT_HUMAN_KEEP_MS, 0)), joinKeepMs: takeoverIdleMs() }); }   // B-50e7 (r3747 must 3): held, nothing known ⇒ 0 — a person's own tab never ends on the default 12 h
  /** The panel row's fact for one profile (null = the user does not browse it). */
  function humanOf(profileId) { ensureLoaded(); const h = humans.get(String(profileId || '')); return h ? { ...HM.humanHolderRow(h, { viewers: watchers.get(inputKey(h.key, h.profileId)) || 0 }), keepMs: humanKeepOf(h) } : null; }
  /** The holder a human key names, or null (a stale key: its holder ended). */
  function humanByKey(key) { const pid = HM.profileOfHumanKey(key); const h = pid ? humans.get(pid) : null; return h && h.key === key ? h : null; }
  /** The bridge installs its cross-relay viewer fact (verify r7): a holder whose socket is gone never blocks. */
  function setViewerAlive(fn) { viewerAliveFn = typeof fn === 'function' ? fn : null; }
  /** The tab id a `tab new` answer names (its CDP target id, else its t<N>). */
  const tabIdOf = (json) => { const d = json && json.data && typeof json.data === 'object' ? json.data : {}; const v = d.targetId || d.tabId || d.id || null; return v && HM.TAB_REF_RE.test(String(v)) ? String(v) : null; };
  /**
   * BROWSE YOURSELF — the user presses the button on a profile's row. The PURE verdict first (every refusal named, "Who
   * can use it" never asked), then the SAME `start()` an agent's first command runs (join / wait / launch: the lane-H lock
   * judgement, the launch mark, the named config, the provider flags, the key resolve — egress and the domain fence are
   * the browser's, unchanged for a person), then HIS OWN tab: `--pin-tab tab new` under `vs-hu-<hex>` over the RAW CDP
   * url (never the directory, never mediated). Nothing of any agent is paused, interrupted or told (the owner, 2). The
   * holder starts `away`; the window the answer names takes his tab's controls when it attaches (`fresh`). Single
   * flight per profile. → {ok, how, key, syncId, profileId, label, fresh}
   */
  const BROWSE_WHY = 'browse yourself'; // the record's `startedBy` for a browser HIS press launched (verify r3)
  function browse(profileId) {
    ensureLoaded();
    const id = String(profileId || '');
    if (browsing.has(id)) return browsing.get(id);
    const pr = (async () => {
      const p = profile(id);
      const rec = p ? reg.browsers[p.id] || null : null;
      const h0 = p ? humans.get(p.id) || null : null;
      const running = Object.values(reg.browsers).filter(B.isLiveBrowser).length + othersNow().length;
      // lane remote-profile-start: a paired machine's profile is browsed through the same start() (`hostKnown`: refused only for a machine no longer paired)
      if (p && p.host && machinesHeld()) throw namedError('host_unavailable', `the paired machines cannot be read right now — ${machinesHeld()}`);   // the B-f276 remainder's cure: never «pair it again»
      const v = HM.browseYourselfVerdict({ profile: p ? { ...p, ephemeral: isEph(p) } : null, row: p ? rowOf(p.provider) : null, hostKnown: p && p.host ? knownHost(p.host) : true, control: p && !isEph(p) && !p.host ? control(p.provider, { host: null }) : null,
        switching: !!p && switching.has(p.id), closed: p ? closedRefusalOf(p.id) : null, live: B.isLiveBrowser(rec), human: h0 ? { state: h0.state, alive: h0.state === 'driving' && !!(h0.input && h0.input.takenBy) && viewerAliveOf(h0.input.takenBy.viewerId) } : null,
        running, cap: machineCap() });
      if (!v.ok) { log.log?.(`[browser] ${id}: browse yourself refused (${v.code})`); throw namedError(v.code, v.error, { ...(Number.isInteger(v.pid) ? { holderPid: v.pid } : {}), ...(v.detail ? { detail: v.detail } : {}) }); }
      if (v.how === 'focus') return { ok: true, how: 'focus', key: v.key, syncId: v.syncId, profileId: p.id, label: p.label, fresh: null };
      // verify r3 (the heal): "he LAUNCHED the browser" is the RECORD's fact — this daemon run was started by his press (a heal
      // relaunches its Chrome in the same daemon; a Close leaves it running): Browse again joins HIS launch and keeps his page
      // 12 h, never the 10 min of a browser an agent launched (the owner, 8)
      const launched = v.how === 'launch' || (v.how === 'join' && !!rec && rec.startedBy === BROWSE_WHY);
      // the SAME start() as an agent's first command (a launch-time refusal passes through with its own words)
      await start(p.id, { why: BROWSE_WHY });
      { const cr = closedRefusalOf(p.id); if (cr) throw namedError(cr.code, cr.error, cr.holderPid ? { holderPid: cr.holderPid } : {}); }
      const o = await leaseCliOpts(p.id, v.key); // the RAW CDP url of the keeper's one Chrome, the human's own session name
      if (!o) throw namedError('browser_no_cdp', noCdpError(p));
      if (switching.has(p.id)) { const rr = SW.restartingRefusal(p); throw namedError(rr.code, `"${p.label}" is restarting (its build or backend is being changed) — browse it again in a few seconds, when it is back`); } // verify r2 (H2): a restart that began during the awaits above
      let h = humans.get(p.id);
      if (!h) {
        const pinTab = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
        // lane browser-windows (U1): HIS OWN WINDOW — never a tab beside an agent's in a window it shows (no takeover needed)
        const made = await openOwnTabMarked(p, v.key, { ns: nsOf(p.id), opts: o, pin: pinTab ? ['--pin-tab'] : [] });
        const r = { ok: !!made.ok, json: made.ok && made.targetId ? { data: { targetId: made.targetId } } : made.json || null, error: made.error || null };
        if (!(r && r.ok)) {
          const why = String((r && (r.stderr || r.error)) || 'no answer').trim().slice(0, 200);
          log.warn?.(`[browser] ${p.id} "${p.label}": your own tab could not be opened — ${why}`);
          throw namedError('launch_failed', `"${p.label}"'s browser is running, but your own tab in it could not be opened: ${why}`);
        }
        h = { key: v.key, profileId: p.id, since: now(), state: 'away', awaySince: now(), launched, input: T.newInputState(), ownTab: tabIdOf(r.json), fresh: null, freshUsed: false };
        humans.set(p.id, h);
        log.log?.(`[browser] ${p.id} "${p.label}": the user browses it himself (${v.key}, ${launched ? 'he launched the browser — kept ' + keepWords(humanKeepOf(h), 3600000, 'h') + ' while away' : 'joined the running browser — kept ' + keepWords(humanKeepOf(h), 60000, 'min') + ' while away'}; his own tab ${h.ownTab || '(unnamed)'}; ${reg.leases.filter((l) => l.profileId === p.id).length} conversation(s) on it keep working)`);
        await settleArming(emitLease({ kind: 'human-start', profileId: p.id, key: v.key, launched, recordMine: HM.recordsMine(p) }));
      } else log.log?.(`[browser] ${p.id} "${p.label}": the user continues browsing it (${v.key}, ${h.state})`);
      h.fresh = crypto.randomBytes(8).toString('hex'); h.freshUsed = false;
      p.lastUsedAt = now();
      ensureTimer();
      commit();
      return { ok: true, how: v.how === 'rejoin' ? 'rejoin' : (v.how === 'launch' ? 'launch' : 'join'), key: v.key, syncId: v.syncId, profileId: p.id, label: p.label, fresh: h.fresh };
    })();
    browsing.set(id, pr);
    return pr.finally(() => { if (browsing.get(id) === pr) browsing.delete(id); });
  }
  /** The live view's target of a browsing window (`?browse=<key>`): the holder must exist on a live browser (a view never
   *  starts one). → the PURE target | {ok:false, code, error}. */
  function humanTargetFor(key) {
    ensureLoaded();
    const h = humanByKey(key);
    const pid = HM.profileOfHumanKey(key);
    const p = pid ? profile(pid) : null;
    if (!p || isEph(p)) return { ok: false, code: 'not-found', error: 'that profile no longer exists' };
    const rec = reg.browsers[p.id];
    if (!B.isLiveBrowser(rec)) return { ok: false, code: 'browser_stopped', state: rec ? rec.state : 'not-started', error: `"${p.label}"'s browser is not running — Browse yourself again to open it` };
    if (!h) return { ok: false, code: 'not_browsing', error: HM.humanRefusalText('not_browsing', { label: p.label }) };
    return require('../browser-stream.js').humanTarget({ key: h.key, profileId: p.id, label: p.label });
  }
  /** Who holds his tab's controls, as the keeper's `inputs` shape (the bridge mirrors it; never in `inputs`). */
  function humanInputState(key) { const h = humanByKey(key); return h ? { ...h.input, key: `${h.key}|${h.profileId}`, browserKey: h.key, profileId: h.profileId } : null; }
  function emitHuman(h, kind, cause = null) { emitInput({ kind, human: true, browserKey: h.key, profileId: h.profileId, sessionId: null, state: { ...h.input }, cause: cause || (kind === 'takeover' ? 'takeover' : 'handback'), url: h.input.url || '' }); }
  /** A window of his takes his tab's controls (`humanTake`), passes them on (`humanPass`) or loses them (`humanRelease`) —
   *  the PURE browser-takeover verdicts over HIS state; nothing of any conversation is touched. */
  function humanTake({ key, viewerId, holderAlive = null } = {}) {
    const h = humanByKey(key);
    if (!h) return { ok: false, code: 'not_browsing', error: 'you are not browsing this browser any more' };
    const alive = h.input.takenBy ? (holderAlive === null ? viewerAliveOf(h.input.takenBy.viewerId) : !!holderAlive) : false;
    const d = T.decideTakeover({ state: h.input, viewerId, now: now(), holderAlive: alive });
    if (!d.ok) return d.code === 'held' ? { ...d, error: 'you are browsing this in another window', human: true } : d;
    const was = h.state;
    h.input = d.state; h.state = 'driving'; h.awaySince = 0;
    // verify r1 (H4): the first take after a restart re-opens his session (the recorder ended the old one `restart` at boot)
    if (!d.already) { emitHuman(h, 'takeover'); if (was !== 'driving') { const p = profile(h.profileId); emitLease(h.restored ? { kind: 'human-start', profileId: h.profileId, key: h.key, launched: !!h.launched, recordMine: HM.recordsMine(p), restored: true } : { kind: 'human-driving', profileId: h.profileId, key: h.key }); h.restored = false; } commit(); }
    return { ok: true, already: !!d.already, state: humanInputState(key) };
  }
  function humanPass({ key, from, to } = {}) {
    const h = humanByKey(key);
    if (!h) return { ok: false, code: 'not_browsing', error: 'you are not browsing this browser any more' };
    const d = T.decidePass({ state: h.input, from, to, now: now() });
    if (!d.ok) return d;
    h.input = d.state;
    emitHuman(h, 'takeover', 'pass');
    return { ok: true, state: humanInputState(key) };
  }
  function humanRelease({ key, viewerId = null, cause = 'viewer-left', url = '' } = {}) {
    const h = humanByKey(key);
    if (!h) return { ok: false, code: 'not_browsing', error: 'you are not browsing this browser any more' };
    const d = T.decideHandback({ state: h.input, viewerId, cause, now: now(), url });
    if (!d.ok) return d;
    const step = HM.humanStep(h.state, 'viewer-left');
    h.input = d.state; h.state = step.state; h.awaySince = now();
    emitHuman(h, 'handback', d.cause);
    emitLease({ kind: 'human-away', profileId: h.profileId, key: h.key });
    log.log?.(`[browser] ${h.profileId}: the user's browsing window let go of his tab (${d.cause}) — kept ${Math.round(humanKeepOf(h) / 60000)} min for Continue`);
    commit();
    driveEnded(h.profileId); // verify r5 ②: his own window let go ⇒ the holders refused while he drove are told
    return { ok: true, cause: d.cause, state: humanInputState(key) };
  }
  /** The window that attaches to a browsing window's relay: take at once, claim from his other live window (the one he
   *  just opened wins), or watch ("You're browsing this in another window" + Continue here) — PURE `humanAttachVerdict`. */
  function humanAttach({ key, viewerId, token = null } = {}) {
    const h = humanByKey(key);
    if (!h) return { ok: false, code: 'not_browsing', error: 'you are not browsing this browser any more' };
    const fresh = !!token && token === h.fresh && !h.freshUsed;
    if (fresh) h.freshUsed = true;
    const holder = h.input.takenBy ? h.input.takenBy.viewerId : null;
    const v = HM.humanAttachVerdict({ fresh, driving: h.state === 'driving', holderAlive: holder !== null && holder !== viewerId && viewerAliveOf(holder) });
    if (!v.take) return { ok: true, take: false, why: v.why };
    const r = v.how === 'claim' ? humanPass({ key, from: holder, to: viewerId }) : humanTake({ key, viewerId });
    return { ok: !!r.ok, take: !!r.ok, how: v.how, why: v.why, ...(r.ok ? {} : { code: r.code, error: r.error }) };
  }
  /** His window's input restarts nothing of the agents (no idle clock to share); kept for the row's `lastInputAt`. */
  function noteHumanInput(key, at = null) { const h = humanByKey(key); if (!h || h.state !== 'driving') return false; h.input.lastUserInputAt = Number(at) || now(); return true; }
  /**
   * END his browsing: `released` (Close — his tab closes, the browser stays for the agents and idles out by the keeper's
   * rule), `left` (away past the keep — the same), `stopped` (the browser stopped / quit / the profile deleted — nothing
   * to close), `restart` (never here: nothing persists). His tab: `tab close <his own tab>`, `tab close` (the one his
   * session is on), `close` (his session's connection) — never `--all`, never an agent's tab. → {ended, key} | null
   */
  async function endHuman(profileId, reason = 'released', { closeTab = true, deleted = false } = {}) {
    ensureLoaded();
    const h = humans.get(String(profileId || ''));
    if (!h) return null;
    const r = HM.HUMAN_END_REASONS.includes(reason) ? reason : 'released';
    humans.delete(h.profileId);
    watchers.delete(inputKey(h.key, h.profileId));
    driveEnded(h.profileId); // verify r5 ②: his row ended (Close / Quit / the keep ran out) while he drove ⇒ the refused holders are told
    const p = profile(h.profileId);
    const rec = reg.browsers[h.profileId];
    let closed = null;
    if (closeTab && p && B.isLiveBrowser(rec) && isLocalRec(rec)) {
      try {
        const o = await leaseCliOpts(h.profileId, h.key);
        if (o) {
          const said = (x) => (x && x.ok ? 'done' : 'failed (' + String((x && (x.stderr || x.error)) || '').trim().slice(0, 100) + ')');
          // verify r1 (H6): ONLY his tabs, each BY ID — the popups his tab opened, then his own tab (a set that could not
          // be read ⇒ his own tab alone). Never the bare `tab close` (his session's CURRENT tab — measured on 0.38.1: after a
          // Tabs-pane switch it was a conversation's, and Close closed it: that conversation's next command `tab_gone`)
          const own = await humanTabsOf(h);
          const ids = own ? [...own].filter((id) => id !== h.ownTab) : [];
          if (h.ownTab) ids.push(h.ownTab);
          const done = [];
          for (const id of ids) done.push(said(await rt.exec(nsOf(h.profileId), ['tab', 'close', id], o)));
          const c = await rt.exec(nsOf(h.profileId), ['close'], o);
          closed = `his ${ids.length} tab(s) ${done.join(', ') || '(none named)'}${own ? '' : ' (his popups could not be read)'}, his session ${said(c)}`;
        }
      } catch (e) { closed = `not closed — ${e && e.message}`; }
    }
    if (rec && B.isLiveBrowser(rec) && !holdersOn(h.profileId).length) rec.lastLeaseDroppedAt = now(); // the idle clock starts NOW (the last holder left)
    h.input = { ...T.newInputState(), handedBackAt: now(), handbackCause: r === 'stopped' ? 'stop' : 'viewer-left' };
    emitHuman(h, 'handback', r === 'stopped' ? 'stop' : 'viewer-left');
    emitLease({ kind: 'human-end', profileId: h.profileId, key: h.key, reason: r, ...(deleted ? { deleted: true } : {}) });
    commit();
    log.log?.(`[browser] ${h.profileId}${p ? ' "' + p.label + '"' : ''}: the user's own browsing ended (${r}${deleted ? ', the profile was deleted' : ''})${closed ? ' — ' + closed : ''}${B.isLiveBrowser(rec) ? `; the browser stays (${reg.leases.filter((l) => l.profileId === h.profileId).length} conversation(s) on it, idles out in ${Math.round(idleMs() / 60000)} min with none)` : ''}`);
    return { ended: r, key: h.key };
  }
  /** HIS TABS NOW (verify r1, H6): his own tab + every tab it opened (PURE humanTabSet over Target.getTargets' openers),
   *  read over the keeper browser's raw endpoint. → Set | null (unreadable: every caller fails CLOSED — no switch, and a
   *  Close closes his own bound tab by id only). */
  async function humanTabsOf(h) { const v = await humanTabView(h); return v ? v.own : null; }
  /** …and the browser's page targets beside them (the orphan rule reads both from ONE read). → {own, targets} | null */
  async function humanTabView(h) {
    const rec = h ? reg.browsers[h.profileId] : null;
    if (!rec || !B.isLiveBrowser(rec) || !rec.cdpUrl || rec.hostId) return null;
    let r = null;
    try { r = await (typeof readTargets === 'function' ? readTargets(rec.cdpUrl) : require('./browser-viewport.js').browserTargets(rec.cdpUrl)); } catch (e) { r = { ok: false, error: String(e && e.message) }; }
    if (!r || !r.ok) { log.log?.(`[browser] ${h.profileId}: the user's own tabs could not be read — ${String((r && r.error) || 'no answer').slice(0, 160)}`); return null; }
    return { own: HM.humanTabSet(r.targets, h.ownTab, h.adopted), targets: r.targets };
  }
  /** verify r2 (the judge: orphan tabs "become his; an agent's later `tab new` never takes his"): he TOOK a tab a
   *  conversation that ended left behind — it joins his set (persisted with his holder: his Close closes it), and every
   *  conversation whose lease was DROPPED on this browser (`reg.leftTabs`: its session still remembers its bound tab and
   *  would return to it — 0.38.1 "returns to it after a daemon restart") binds a NEW tab first if it ever comes back. */
  /** verify r3 (orphan tabs — EVERY way a lease leaves its page): a conversation's (or a helper's) lease went while its page
   *  STAYED in a live shared browser — the tick's carrier drop (r2), a DETACH (the agent's verb, the UI's Detach, a pin that
   *  moves: the conversation is alive and its session still bound to that tab) and a helper's handle dropped (a child key:
   *  the next helper of the same conversation mints the SAME handle, `nextChildN`). Reproduced on the real 0.38.1 + Chrome
   *  154 (verify/repro-r3-detach, `--child`): only the tick's parent-key drop was remembered, so after a detach or a helper's
   *  drop he took that tab (nobody leased the browser: an orphan) and the returning session's next command landed IN HIS
   *  PAGE. A mediated lease's tabs close with its grant (nothing stays); an ephemeral record is never his. */
  function noteLeftTab(profileId, browserKey) {
    const pd = profile(profileId); const rec = pd ? reg.browsers[pd.id] : null;
    if (!pd || isEph(pd) || isMediated(pd) || !B.isLiveBrowser(rec) || !isLocalRec(rec) || !(B.isBrowserKey(browserKey) || B.isChildKey(browserKey))) return false;
    const m = reg.leftTabs[pd.id] || (reg.leftTabs[pd.id] = {});
    m[browserKey] = now();
    // verify r4 (the tab-release census): the bound FAILS CLOSED. A key it evicts is a conversation whose page may still be
    // in this browser, its session still bound to it — forgotten, the tab he takes later could be that page and its return
    // would run IN HIS PAGE (reproduced: 65 detaches, the oldest's return bound nothing). Marked `tabClosed` now instead:
    // its return binds a new tab first (a leftTabs key never holds a lease — attach clears its entry).
    const ks = Object.keys(m); if (ks.length > 64) for (const x of ks.sort((a, b) => m[a] - m[b]).slice(0, ks.length - 64)) { markTabLost(pd.id, x, 'closed'); delete m[x]; }
    return true;
  }
  function adoptOrphan(h, targetId) {
    h.adopted = [...new Set([...(Array.isArray(h.adopted) ? h.adopted : []), targetId])].slice(-32);
    const left = Object.keys(reg.leftTabs[h.profileId] || {});
    for (const bk of left) markTabLost(h.profileId, bk, 'closed');
    delete reg.leftTabs[h.profileId];
    commit();
    log.log?.(`[browser] ${h.profileId}: the user took the tab ${targetId} (nobody held the browser — a conversation that ended left it behind); it is his now${left.length ? `; ${left.length} conversation(s) that left this browser bind a new tab if they come back` : ''}`);
  }
  /** THE ADDRESS ROW (+ the Tabs pane): the daemon's own `open <url>` / `back` / `forward` / `reload` / `tab <ref>` under HIS
   *  session only (measured on 0.38.1: his tab navigates, an agent's pinned tab keeps its page) — web addresses only.
   *  verify r1 (H6): a TAB is HIS only — his own tab or one it opened (a login popup); a conversation's tab is refused
   *  `not_your_tab` (driving an agent's page is a takeover from that conversation's live view, never "a human is here"). */
  async function navigateHuman(key, act = {}) {
    ensureLoaded();
    const h = humanByKey(key);
    if (!h) throw namedError('not_browsing', 'you are not browsing this browser any more');
    const p = profile(h.profileId);
    const rec = p ? reg.browsers[p.id] : null;
    if (!p || !B.isLiveBrowser(rec)) throw namedError('browser_stopped', `"${p ? p.label : h.profileId}"'s browser is not running — Browse yourself again to open it`);
    const pinTab = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
    const v = HM.navArgv(act || {}, { pinTab });
    if (!v.ok) throw namedError(v.code, v.error);
    let tv = null;
    if (v.act === 'tab') {
      // verify r2: a tab nobody holds (no conversation holds the browser: a conversation that ended left it) is his to TAKE
      const view = await humanTabView(h);
      tv = HM.humanTabVerdict({ ref: act.tab, own: view ? view.own : null, orphans: view ? HM.orphanTabSet(view.targets, view.own, { leased: reg.leases.some((l) => l.profileId === p.id) }) : null });
      if (!tv.ok) { log.log?.(`[browser] ${h.profileId}: the user's Tabs pane asked for ${String(act.tab).slice(0, 40)} — refused ${tv.code}`); throw namedError(tv.code, tv.error); }
      // verify r4 (the tab-release census / THE TAKE IS MADE WHERE IT IS JUDGED): the orphan verdict reads "nobody leases the
      // browser" NOW; the take — the marks on every conversation that left a page here — is made in the same synchronous step,
      // before any await. r3 made it after his `tab <id>` returned (~10–300 ms): a conversation that came back inside that
      // window (its lease pushed, its own leftTabs entry cleared — "back on its own tab") was no longer in the map when the
      // adoption marked, and its next command ran IN THE PAGE HE HAD JUST TAKEN (reproduced on the real 0.38.1 + Chrome 154,
      // verify/repro-r4-real race, 5–10 ms gaps). A take whose switch then fails gives the tab back (never his to close);
      // the marks stay (a fresh tab on a return — fail closed).
      if (tv.adopt) adoptOrphan(h, tv.targetId);
    }
    const unadopt = () => { if (tv && tv.adopt && Array.isArray(h.adopted) && h.adopted.includes(tv.targetId)) { h.adopted = h.adopted.filter((x) => x !== tv.targetId); commit(); log.log?.(`[browser] ${h.profileId}: the tab ${tv.targetId} is not his after all (his switch to it did not go through); the conversations it marked still bind a new tab`); } };
    const o = await leaseCliOpts(p.id, key);
    if (!o) { unadopt(); throw namedError('browser_no_cdp', noCdpError(p)); }
    const r = await rt.exec(nsOf(p.id), v.argv, { ...o, timeout: 30000 });
    const j = r && r.json;
    if (!(r && r.ok) || (j && j.success === false)) {
      const why = String((j && j.error) || (r && (r.stderr || r.error)) || 'the browser did not answer').trim().slice(0, 300);
      // B-b56d (2.369.413): on the DISPLAY road a sign-in is Chrome's own sheet in its window — the driver's open reports the measured
      // ERR_INVALID_AUTH_CREDENTIALS while that sheet asks. The watch's record of it (set before Chrome fails the load: the watch's
      // own `Default` answer is what lets Chrome go on) makes it no failure: said as the sheet, the tab kept
      let sheet = null; if (stuckSource) { try { sheet = HM.openSignInVerdict({ why, stuck: stuckSource(key) }); } catch { sheet = null; } }
      if (sheet) { log.log?.(`[browser] ${h.profileId}: the user's ${v.act} asks for a sign-in — the browser shows its own sheet in its window (${String(sheet.origin || '').slice(0, 80)})`); return { ok: true, act: v.act, url: v.url || null, signIn: sheet, ...(tv && tv.adopt ? { adopted: true } : {}) }; }
      log.log?.(`[browser] ${h.profileId}: the user's ${v.act} did not go through — ${why}`);
      unadopt();
      throw namedError('nav_failed', why);
    }
    return { ok: true, act: v.act, url: v.url || null, ...(tv && tv.adopt ? { adopted: true } : {}) };
  }
  /** Close (the user's button): his browsing ends `released` — the browser stays. */
  function closeHuman(key) { const h = humanByKey(key); if (!h) return Promise.reject(namedError('not_browsing', 'you are not browsing this browser any more')); return endHuman(h.profileId, 'released'); }
  /** Quit the whole browser (the user's button): the profile's browser stops for everyone (today's Stop). */
  async function quitHuman(key) {
    const h = humanByKey(key);
    const pid = h ? h.profileId : HM.profileOfHumanKey(key);
    if (!pid || !profile(pid)) throw namedError('not-found', 'that profile no longer exists');
    const conversations = reg.leases.filter((l) => l.profileId === pid).map((l) => l.browserKey);
    const b = reg.browsers[pid] ? await stop(pid, { why: 'user' }) : null;
    if (humans.has(pid)) await endHuman(pid, 'stopped', { closeTab: false });
    return { stopped: true, browser: b, conversations };
  }
  /** The tick's arm: an away holder past its keep ends `left` (his tab closes); a holder whose browser is no longer live
   *  ends `stopped`. His own tab NEVER lapses by the idle clock while a window of his holds it (nobody to give it back to). */
  async function sweepHumans(t) {
    for (const h of [...humans.values()]) {
      const rec = reg.browsers[h.profileId];
      if (!B.isLiveBrowser(rec) && !starting.has(h.profileId)) { await endHuman(h.profileId, 'stopped', { closeTab: false }); continue; }
      if (HM.awayExpired({ state: h.state, awaySince: h.awaySince, now: t, keepMs: humanKeepOf(h) })) {
        const step = HM.humanStep(h.state, 'away-timeout');
        if (HM.endReasonOf(step) === 'left') await endHuman(h.profileId, 'left');
      }
    }
  }
  // ── MULTIVIEW B-325a: release an ephemeral browser a few minutes after its turn ended ──
  /** The live-view bridge says how many viewers watch a (conversation, browser) pair right now. */
  function noteViewers(browserKey, profileId = null, n = 0) {
    const k = inputKey(browserKey, profileId);
    const v = Math.max(0, Number(n) || 0);
    if (v) watchers.set(k, v); else watchers.delete(k);
    // lane browser-swiftshader-cpu: the viewer's last instant per browser (the idle-paint verdict) — a viewer arriving thaws now
    viewerSeen.set(k, { pid: profileId || `eph:${browserKey}`, n: v, at: now() });
    // r2: a viewer arriving shows ITS conversation's frozen front again (never another holder's window — heavy e)
    if (v && paintWatch) { const er = profileId ? null : ephemeralFor(browserKey); const pid = profileId || (er && er.profileId); if (pid) Promise.resolve().then(() => paintWatch.thawPaint(pid, { holder: { profileId: pid, browserKey, ephemeral: !profileId, windowId: profileId ? viewerWindowOf(pid, browserKey) : null } })).catch(() => { /* the next verb thaws */ }); }
  }
  /** B-1626 / K23 (its cure 2, 主开发 13:03Z): the window a viewer's CONVERSATION owns in this browser run — its lease's stamped
   *  `windowId` while the lease has a window of its own (WIN.hasOwnWindow), else null (a shared window of an older run names no
   *  window: its fronts are never judged by window). The KEEPER's answer, read when the viewer is noted — never the bridge's,
   *  which names nothing until its relay has read a tabs record. The watch shows a hidden front in that window (thawPaint). */
  function viewerWindowOf(profileId, browserKey) {
    const rec = reg.browsers[String(profileId || '')] || null;
    const l = rec && browserKey ? B.findLease(reg.leases, String(profileId), String(browserKey)) : null;
    return l && WIN.hasOwnWindow(l, WIN.instanceOf(rec)) ? WIN.windowIdOf(l.windowId) : null;
  }
  // ── lane browser-swiftshader-cpu: IDLE PAINT STOPS (src/browser-idle.js) — the page watch's socket does the act ──
  const viewerSeen = new Map(); // inputKey → {pid: profileId | 'eph:<browserKey>', n, at}
  let paintWatch = null;
  function setPaintWatch(api) { paintWatch = api && typeof api.paintFacts === 'function' ? api : null; }
  /** The page an unseen browser draws (the runaway report names it): `{hidden, title, who}` | null. */
  function drawingOf(rec, p) {
    if (!rec || !BIdle.unseenRung(rec.display)) return null;
    let f = null; try { f = paintWatch ? paintWatch.paintFacts(rec.profileId) : null; } catch { f = null; }
    return { hidden: true, title: f && f.title ? f.title : null, who: p && isEph(p) ? `The hidden browser of "${p.label}"` : `The hidden browser of profile "${p ? p.label : rec.profileId}"` };
  }
  function viewersOf(p) {
    const pid = isEph(p) ? `eph:${p.owner.id}` : p.id; let n = 0, at = 0;
    for (const x of viewerSeen.values()) if (x.pid === pid) { n += x.n; at = Math.max(at, x.at); }
    return { n, at };
  }
  /** Every live browser on an unseen rung (the hidden window, headless): freeze when nobody watches and nobody drives for
   *  IDLE_PAINT_MS, thaw when a viewer is there (a verb thaws at its resolve, before it runs). Never throws. */
  async function sweepIdlePaint(t) {
    if (!paintWatch) return;
    const enabled = setting('browser.idlePaintFreeze', BIdle.IDLE_PAINT_DEFAULT) === true; // lane browser-swiftshader-cpu-r2: the owner's switch, read at EVERY sweep — unset ⇒ IDLE_PAINT_DEFAULT (ON since 2.369.332, lane idle-paint-default-on)
    for (const rec of Object.values(reg.browsers)) {
      if (!B.isLiveBrowser(rec) || stopping.has(rec.profileId) || starting.has(rec.profileId) || !BIdle.unseenRung(rec.display)) continue;
      const p = profile(rec.profileId); if (!p) continue;
      let f = null; try { f = paintWatch.paintFacts(rec.profileId); } catch { f = null; }
      if (!f) continue;
      const vw = viewersOf(p);
      const v = BIdle.idlePaintVerdict({ enabled, viewers: vw.n, lastViewerAt: vw.at, lastVerbAt: f.lastVerbAt, now: t, busy: f.busy, frozen: f.frozen });
      try {
        if (v.act === 'freeze') { const r = await paintWatch.freezePaint(rec.profileId); if (r && r.ok) log.info?.(`[browser] ${rec.profileId}: nobody watches or drives it for ${Math.round(BIdle.IDLE_PAINT_MS / 1000)} s — its ${r.tabs} tab(s) stop drawing until the next verb or viewer`); }
        else if (v.act === 'thaw') await paintWatch.thawPaint(rec.profileId);
        else if (vw.n > 0 && f.owedShows > 0 && !f.busy && typeof paintWatch.retryOwedShows === 'function') { const pid = rec.profileId, pr = paintWatch.retryOwedShows(pid); if (pr && typeof pr.catch === 'function') pr.catch((e) => log.warn?.(`[browser] ${pid}: idle paint retry of a failed show failed: ${e && e.message}`)); } // r4176 (b) / r4186 (1): a viewer watching a front whose show failed — tried again, never while a verb runs or a dialog is open (busy), never awaited by the tick
      } catch (e) { log.warn?.(`[browser] ${rec.profileId}: idle paint ${v.act || 'retry'} failed: ${e && e.message}`); }
    }
  }
  function idleReleaseAfterMs() { return B.idleReleaseMs(setting('browser.idleReleaseAfterTurnMs', B.DEFAULT_IDLE_RELEASE_MS, 0)); }   // B-50e7: held, nothing known ⇒ 0 — no release by the clock
  /** The tick's release arm: every LIVE managed ephemeral / helper browser whose conversation's turn has been idle ≥ the setting.
   *  → the releases THIS sweep started, `[{profileId, why, settled}]` (`settled` = its stop, never rejecting): the tick
   *  ignores it; a gate samples past every one of them (the 2.369.187 mirror red — a sample at the FIRST stop observed
   *  read the helper's release, still in flight, as "kept"). */
  function sweepIdleReleases(t) {
    const releaseMs = idleReleaseAfterMs();
    const released = [];
    if (takeoversHeld()) return released;   // r4130 MUST 2: the takeover requests HELD — whether a person was asked is UNKNOWN: the idle release releases NOTHING (never the page a person was to sign in on)
    for (const p of reg.profiles.filter(isEph)) {
      const rec = reg.browsers[p.id];
      const live0 = B.isLiveBrowser(rec) && !stopping.has(p.id) && !starting.has(p.id) && !retiring.has(p.id);
      if (!live0) { turnIdleSince.delete(p.id); continue; }
      const f = convFacts(p.owner.id);
      const v = B.idleReleaseVerdict({ live: true, turn: f.turn === undefined ? null : f.turn, idleSince: turnIdleSince.has(p.id) ? turnIdleSince.get(p.id) : null, now: t, releaseMs,
        takenOver: inputStateFor(p.owner.id, null).input === 'user' || !!openRequestFor(p.owner.id, null), watched: (watchers.get(inputKey(p.owner.id, null)) || 0) > 0 });
      if (v.idleSince === null) turnIdleSince.delete(p.id); else turnIdleSince.set(p.id, v.idleSince);
      if (!v.release) continue;
      turnIdleSince.delete(p.id);
      log.log?.(`[browser] ephemeral ${p.id} "${p.label}" released (${v.why}) — the tab stays; the next command starts it again`);
      const settled = stop(p.id, { why: 'turn-idle' }).catch((e) => log.warn?.(`[browser] ephemeral ${p.id}: release failed — ${e && e.message}`));
      released.push({ profileId: p.id, why: v.why, settled });
    }
    return released;
  }
  // ── P3 (§4.3 / §4.3.1): the INPUT SIDE of a lease — takeover, handback, idle ──
  const inputKey = (browserKey, profileId) => T.inputKeyFor(browserKey, profileId || null);
  function takeoverIdleMs() { return T.takeoverIdleMs(setting('browser.takeoverIdleMs', T.DEFAULT_TAKEOVER_IDLE_MS, 0)); }   // B-50e7: held, nothing known ⇒ 0 — a person's takeover never lapses on a default time
  /** The state of one (conversation, browser) pair — a fresh 'agent' state when nobody ever took over. */
  function inputStateFor(browserKey, profileId = null) {
    const k = inputKey(browserKey, profileId);
    return { ...(inputs.get(k) || T.newInputState()), key: k, browserKey: String(browserKey || ''), profileId: profileId || null };
  }
  /** Mirror the side onto the lease (the registry's `input` field is a VIEW of
   *  this in-memory state, kept so `statusFor`/`leases` say who drives). */
  function mirrorLeaseInput(browserKey, profileId, input) {
    if (!profileId) return;
    const l = B.findLease(reg.leases, profileId, browserKey);
    if (l && l.input !== input) { l.input = input; commit(); }
  }
  function emitInput(ev) { requestOnInput(ev); for (const fn of inputListeners) { try { fn(ev); } catch (e) { log.warn?.(`[browser] input listener failed: ${e && e.message}`); } } }
  /** Subscribe to every takeover/handback (the bridge flips its relays, the
   *  announcer decides what to deliver, server.js re-publishes live facts). */
  function onInput(fn) { inputListeners.add(fn); return () => inputListeners.delete(fn); }
  /**
   * The user takes over (a viewer's click). `{ok:true, state, already}` or the
   * typed `held` when another live viewer drives. `holderAlive` is the
   * bridge's fact (a holder whose socket is gone never blocks).
   */
  function takeover({ browserKey, profileId = null, viewerId, sessionId = null, holderAlive = true, viewerAlive = null } = {}) {
    ensureLoaded();
    // verify r2 (H2): a browser being RESTARTED (Change build…, a backend switch — between its stop and its new launch) is
    // never taken over: the restart would launch the new browser, reopen every lease's tab and tell each conversation under
    // the user's hands (reproduced: the takeover landed after the stop, the tab reopened and the card told while he drove).
    // Refused by name — he takes over again when it is back (the live view says it); the restart's own gate refuses a
    // browser he already drives (browser_driven), so between the two nothing moves under his hands
    if (profileId && switching.has(String(profileId))) { const p = profile(profileId); log.log?.(`[browser] ${browserKey} on ${profileId}: takeover refused — its browser is restarting`); return { ok: false, code: 'browser_restarting', error: `"${p ? p.label : profileId}" is restarting (its build or backend is being changed) — take over again in a few seconds, when it is back` }; }
    // VERIFY S5 (2026-09-26): a takeover of a NAMED profile's browser needs a LEASE of this conversation on it — a live
    // view left open after the user's "Only <other chat>" (or an agent's detach) took the profile from this conversation
    // used to take it over anyway and refuse the holder's agent `browser_busy` "the user drives it from <this chat>";
    // refused by name now, and the bridge ends such a view on the detach (a stale picture is not a seat)
    if (profileId) {
      const p = profile(profileId);
      if (p && !isEph(p) && !B.findLease(reg.leases, profileId, browserKey)) return { ok: false, code: 'no_lease', error: `this conversation no longer holds "${p.label}" (the user kept it to another conversation, or it was detached) — the live view cannot take it over; pick it for this conversation in Session properties → Agent browser to use it again` };
    }
    const k = inputKey(browserKey, profileId);
    const alive = typeof viewerAlive === 'function' ? (id) => { try { return !!viewerAlive(id); } catch { return holderAlive; } } : () => holderAlive;
    // lane browser-windows (U2): ONE WINDOW, ONE HOLDER — the check runs over the WINDOW's mates only (a lease in a window of
    // its own has none: two views may drive two conversations' windows at once). verify r7 (S2): A sibling conversation's LIVE holder (driving from its own view, or holding
    // this lease WITH a primary takeover) blocks this takeover by name exactly as this lease's own would — the bridge's
    // per-relay `holderAlive` read every sibling's holder as gone (it sits on another relay), so a second view re-seized a
    // browser somebody was driving: two holders, both inputs forwarded, the handback from one view leaving the other's
    // lease paused. A holder whose socket IS gone never blocks: the whole browser moves to the new viewer (siblingTakeover).
    if (profileId) {
      for (const sib of windowMatesOf(browserKey, profileId)) {
        const s = inputs.get(inputKey(sib.browserKey, profileId));
        if (!s || s.input !== 'user' || !s.takenBy || s.takenBy.viewerId === viewerId) continue;
        const sd = T.decideTakeover({ state: s, viewerId, now: now(), holderAlive: alive(s.takenBy.viewerId) });
        if (!sd.ok) { log.log?.(`[browser] ${browserKey} on ${profileId}: takeover refused (${sd.code}) — ${sib.browserKey}, the same browser, is driven by viewer ${s.takenBy.viewerId}`); return { ...sd, heldBy: sib.browserKey }; }
      }
    }
    const own = inputs.get(k) || null;
    const d = T.decideTakeover({ state: own, viewerId, now: now(), holderAlive: own && own.takenBy ? alive(own.takenBy.viewerId) : holderAlive });
    if (!d.ok) return d;
    if (!d.already) delete d.state.with; // integration 2.369.192: a takeover from THIS view is its own, never a sibling's mark (below)
    inputs.set(k, d.state);
    mirrorLeaseInput(browserKey, profileId, 'user');
    ensureTimer();
    if (!d.already) {
      // THE TAKEOVER INTERRUPTS (the owner's ruling, 2026-09-27 — "直接打断所有脚本和agent操作，告知agent发生了打断"): the
      // mediated lease's calls in flight are answered browser_interrupted NOW (a running script is asked to stop), then
      // what was in flight is read off the trace AT the instant — both before anything is announced
      const at = d.state.takenAt;
      let ab = null;
      if (profileId && mediator && typeof mediator.interrupt === 'function') { try { ab = mediator.interrupt({ profileId, browserKey }); } catch (e) { log.warn?.(`[browser] ${browserKey} on ${profileId}: the takeover's interrupt failed — ${e && e.message}`); } }
      let inFlight = [];
      if (typeof inFlightReader === 'function') { try { inFlight = inFlightReader({ sessionId, browserKey, profileId: profileId || null, at }) || []; } catch (e) { log.warn?.(`[browser] ${browserKey}: the in-flight reader failed — ${e && e.message}`); inFlight = []; } }
      const oc = INT.openInterruption(cycles.get(k) || lastClosed.get(k) || null, { takenAt: at, inFlight, aborted: ab ? ab.aborted : [] }); // a closed cycle hands on the ids it counted (told once)
      cycles.set(k, oc.cycle);
      const view = INT.interruptionView(oc.cycle);
      log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ' (ephemeral)'}: the user took over (viewer ${viewerId}) — ${view.n ? `${view.n} operation(s) of the agent interrupted (${view.verbs.join(', ')})` : 'nothing of the agent\'s was in flight'}${ab && ab.aborted.length ? `; ${ab.aborted.length} mediated call(s) aborted${ab.terminated ? `, ${ab.terminated} running script(s) asked to stop` : ''}` : ''}${oc.fresh ? '' : ' (the same takeover goes on: a second viewer took it before the handback)'}; agent commands are refused until the handback`);
      emitInput({ kind: 'takeover', browserKey, profileId: profileId || null, sessionId, state: { ...d.state }, cause: null, url: d.state.url || '', interruption: { ...view, fresh: oc.fresh }, sharedWindow: sharedWindowOf(browserKey, profileId) }); // verify r2 ⑦: the words name a legacy shared window
      // lane browser-windows (U2): a takeover is of the WINDOW the view shows — only the leases IN that window (an older
      // browser run's shared window; none for a lease in a window of its own) are taken WITH it; every other conversation
      // runs on in its own window. verify r6 (S2, MEDIUM, when one window held every conversation's tab): the mates are
      // taken over WITH it by the same viewer: its calls in flight cut, its own cycle opened (its
      // own card, its own reminder naming ITS verbs), its next verbs refused browser_paused. Measured before: the sibling's
      // fill ran on under the user's hands, its `tab` switch moved what the user was looking at (the r3 F2 class across
      // conversations), and nobody told it. A sibling already driven by its own user keeps its own takeover.
      if (profileId) siblingTakeover({ browserKey, profileId, viewerId, at, alive });
    }
    return { ok: true, already: !!d.already, state: inputStateFor(browserKey, profileId) };
  }
  /** lane browser-windows (U2): THE OTHER LEASES IN THE WINDOW A TAKEOVER DRIVES — nobody for a lease in a window of its
   *  own (every lease after this lane); for a lease still in the shared window of an older browser run (its tab cannot be
   *  moved — Chrome has no CDP move), the other leases still in it (PURE `windowMates`: taken WITH it, as before). Never an
   *  ephemeral record's, never a child's own. Before this lane it was every lease of the profile — one takeover froze every
   *  conversation on the browser (userW's D-payments, 2026-10-01). */
  function windowMatesOf(browserKey, profileId) {
    const p = profileId ? profile(profileId) : null;
    if (!p || isEph(p)) return [];
    return WIN.windowMates({ leases: reg.leases, profileId, browserKey, instance: WIN.instanceOf(reg.browsers[profileId]) });
  }
  /** verify r2 ⑦: is this lease's tab in the SHARED window of an older browser run (no window of its own in this run)? — the
   *  takeover / handback / paused words then say "the shared window of …", never "your window" (r1 LOW 6). */
  function sharedWindowOf(browserKey, profileId) {
    const p = profileId ? profile(profileId) : null;
    if (!p || isEph(p)) return false;
    const l = B.findLease(reg.leases, profileId, browserKey);
    return !!(l && !WIN.hasOwnWindow(l, WIN.instanceOf(reg.browsers[profileId])));
  }
  function siblingTakeover({ browserKey, profileId, viewerId, at, alive = () => true }) {
    const taken = [];
    for (const l of windowMatesOf(browserKey, profileId)) {
      const sk = inputKey(l.browserKey, profileId);
      const prev = inputs.get(sk);
      // its own user drives it (its own cycle is open) — never taken from them; verify r7: unless that holder's socket is
      // GONE (a reload, a closed window — `takeover` let this one through for the same reason): the browser moves whole
      if (prev && prev.input === 'user' && (!prev.takenBy || prev.takenBy.viewerId === viewerId || alive(prev.takenBy.viewerId))) continue;
      const sd = T.decideTakeover({ state: prev || null, viewerId, now: at, holderAlive: false });
      if (!sd.ok || sd.already) continue;
      // integration 2.369.192 (S2 × S5): the sibling state names the conversation whose VIEW holds the takeover (`with`) —
      // owner ruling A (2)'s "who drives" (userDrivingOf, the strip's "you, in <chat>") names that view, never a sibling
      sd.state.with = browserKey;
      inputs.set(sk, sd.state);
      mirrorLeaseInput(l.browserKey, profileId, 'user');
      let ab = null;
      if (mediator && typeof mediator.interrupt === 'function') { try { ab = mediator.interrupt({ profileId, browserKey: l.browserKey }); } catch (e) { log.warn?.(`[browser] ${l.browserKey} on ${profileId}: the sibling's interrupt failed — ${e && e.message}`); } }
      let inFlight = [];
      if (typeof inFlightReader === 'function') { try { inFlight = inFlightReader({ sessionId: l.sessionId || null, browserKey: l.browserKey, profileId, at }) || []; } catch { inFlight = []; } }
      const oc = INT.openInterruption(cycles.get(sk) || lastClosed.get(sk) || null, { takenAt: at, inFlight, aborted: ab ? ab.aborted : [] });
      cycles.set(sk, oc.cycle);
      const view = INT.interruptionView(oc.cycle);
      log.log?.(`[browser] ${l.browserKey} on ${profileId}: taken over WITH ${browserKey} (the same browser; viewer ${viewerId}) — ${view.n ? `${view.n} operation(s) of its agent interrupted (${view.verbs.join(', ')})` : 'nothing of its agent\'s was in flight'}${ab && ab.aborted.length ? `; ${ab.aborted.length} mediated call(s) aborted` : ''}; its commands are refused until the handback`);
      emitInput({ kind: 'takeover', browserKey: l.browserKey, profileId, sessionId: l.sessionId || null, state: { ...sd.state }, cause: null, url: sd.state.url || '', interruption: { ...view, fresh: oc.fresh }, sibling: browserKey, sharedWindow: true }); // verify r2 ⑦: a mate is taken WITH the shared window — said so
      taken.push(l.browserKey);
    }
    return taken;
  }
  /** A new lease on a browser the user is driving (any sibling state 'user'): taken by that viewer at once (nothing in flight). */
  function joinTakeoverIfDriven(browserKey, profileId, sessionId = null) {
    const p = profileId ? profile(profileId) : null;
    if (!p || isEph(p)) return false;
    const k = inputKey(browserKey, profileId);
    const mine = inputs.get(k);
    if (mine && mine.input === 'user') return false;
    let holder = null, holderKey = null;
    // lane browser-windows (U2): only a takeover of the window THIS lease is in — a lease in a window of its own (every new
    // one) is never paused by the user driving another conversation's window
    const mates = new Set(windowMatesOf(browserKey, profileId).map((l) => inputKey(l.browserKey, profileId)));
    for (const [sk, s] of inputs) { if (s && s.input === 'user' && s.takenBy && sk.endsWith('|' + profileId) && sk !== k && mates.has(sk)) { holder = s.takenBy; holderKey = s.with || sk.slice(0, sk.length - String(profileId).length - 1); break; } } // a sibling's `with` names the view's conversation
    if (!holder) return false;
    const at = now();
    const sd = T.decideTakeover({ state: mine || null, viewerId: holder.viewerId, now: at, holderAlive: false });
    if (!sd.ok) return false;
    sd.state.with = holderKey; // integration 2.369.192: taken WITH the view's conversation (userDrivingOf names that one)
    inputs.set(k, sd.state);
    mirrorLeaseInput(browserKey, profileId, 'user');
    const oc = INT.openInterruption(cycles.get(k) || lastClosed.get(k) || null, { takenAt: at, inFlight: [], aborted: [] });
    cycles.set(k, oc.cycle);
    log.log?.(`[browser] ${browserKey} on ${profileId}: attached while the user drives this browser (from ${holderKey}, viewer ${holder.viewerId}) — paused from birth until the handback`);
    emitInput({ kind: 'takeover', browserKey, profileId, sessionId, state: { ...sd.state }, cause: null, url: sd.state.url || '', interruption: { ...INT.interruptionView(oc.cycle), fresh: oc.fresh }, sibling: holderKey });
    return true;
  }
  /** The sibling states this viewer holds (taken WITH a primary takeover): a handback, a pass and the idle clock follow it. */
  function siblingsHeldBy(browserKey, profileId, viewerId) {
    const out = [];
    if (viewerId === null || viewerId === undefined) return out;
    for (const l of windowMatesOf(browserKey, profileId)) {
      const sk = inputKey(l.browserKey, profileId);
      const s = inputs.get(sk);
      if (s && s.input === 'user' && s.takenBy && s.takenBy.viewerId === viewerId) out.push({ lease: l, key: sk, state: s });
    }
    return out;
  }
  /** r6 A-F9 (money): how many billed turns an EXPLICIT Hand back of this (conversation, browser) would start now — this
   *  conversation + each sibling taken WITH it whose own cycle has something to re-run (PURE `handbackWakes` = the
   *  announcer's own `announceVerdict` per conversation). 0 when nobody drives. */
  function handbackWakesFor(browserKey, profileId = null) {
    const k = inputKey(browserKey, profileId);
    const s = inputs.get(k);
    if (!s || s.input !== 'user') return 0;
    const sibs = profileId && s.takenBy ? siblingsHeldBy(browserKey, profileId, s.takenBy.viewerId).map((x) => ({ browserKey: x.lease.browserKey, rerun: INT.interruptedVerbs(cycles.get(x.key) || null) })) : [];
    return T.handbackWakes({ own: true, ownRerun: INT.interruptedVerbs(cycles.get(k) || null), siblings: sibs });
  }
  /**
   * Control goes back to the agent. `cause` ∈ browser-takeover.HANDBACK_CAUSES;
   * `url` is the page the human left it on. The lease flip is a STATE CHANGE
   * and happens regardless of what the announcer later decides to deliver.
   */
  function handback({ browserKey, profileId = null, viewerId = null, cause = 'explicit', url = '', sessionId = null, mirror = true, sibling = null, expectWakes, pressed = null } = {}) {
    ensureLoaded();
    const k = inputKey(browserKey, profileId);
    const held = (inputs.get(k) || {}).takenBy || null; // who drove — the siblings taken WITH this one follow (verify r6)
    const d = T.decideHandback({ state: inputs.get(k) || null, viewerId, cause, now: now(), url });
    if (!d.ok) return d;
    // r6 A-F9: an explicit Hand back that carries the count its control SHOWED is refused by name when the count moved
    // (a sibling's agent had something refused since) — nothing is handed back, the current count comes back
    if (d.cause === 'explicit' && mirror) { const echo = T.handbackWakeEcho({ wakes: handbackWakesFor(browserKey, profileId), expect: expectWakes }); if (!echo.ok) { log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''}: handback refused (${echo.code}: ${echo.wakes} wake(s), the control said ${expectWakes})`); return echo; } }
    delete d.state.with; // integration 2.369.192: the sibling mark ends with the takeover
    inputs.set(k, d.state);
    // verify r7: the mirrored event names the primary (`sibling`) — the announcer delivers a sibling's handback only when ITS
    // cycle has something to re-run (a billed wake of an idle agent that was doing nothing is not this click's to spend)
    if (mirror && profileId && held) for (const sib of siblingsHeldBy(browserKey, profileId, held.viewerId)) handback({ browserKey: sib.lease.browserKey, profileId, viewerId, cause: d.cause, url: '', sessionId: sib.lease.sessionId || null, mirror: false, sibling: browserKey, pressed });
    mirrorLeaseInput(browserKey, profileId, 'agent');
    // the handback CLOSES the cycle: ONE re-run reminder per takeover → handback (the owner's ruling: "交还时提醒它重新运行")
    const closed = INT.closeInterruption(cycles.get(k) || null, { at: d.state.handedBackAt });
    cycles.delete(k);
    if (closed) lastClosed.set(k, closed);
    const rerun = INT.interruptedVerbs(closed);
    const userActs = closed && Array.isArray(closed.userActs) ? closed.userActs.slice() : []; // lane browser-resume C: the user's tab acts while he drove
    log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ' (ephemeral)'}: handed back to the agent (${d.cause}${d.byHolder ? '' : ', not by the holder'}) after ${Math.round(d.heldMs / 1000)} s${d.state.url ? ' at ' + T.urlForLog(d.state.url) : ''}${rerun.length ? ` — to re-run: ${rerun.join(', ')}` : ''}${userActs.length ? ` — the user's tab acts while driving (said to the agent): ${userActs.map((a) => a.kind).join(', ')}` : ''}`); // lane live-input: origin + path in the journal — never the query (order ids, tokens)
    emitInput({ kind: 'handback', browserKey, profileId: profileId || null, sessionId, state: { ...d.state }, cause: d.cause, url: d.state.url || '', heldMs: d.heldMs, byHolder: d.byHolder, rerun, ...(userActs.length ? { userActs } : {}), interruption: INT.interruptionView(closed), ...(sibling ? { sibling } : {}), sharedWindow: sharedWindowOf(browserKey, profileId), pressed }); // verify r2 ⑦ — r2 (lane owner-press-attended): + the door's PRESS (an explicit handback is attended only with it)
    if (profileId) driveEnded(profileId); // verify r5 ②: no window of the browser driven any more ⇒ the holders refused meanwhile are told
    return { ok: true, cause: d.cause, heldMs: d.heldMs, byHolder: d.byHolder, rerun, userActs, state: inputStateFor(browserKey, profileId) };
  }
  /**
   * lane P verify (finding 3): the viewer driving PASSES the controls to another view of the same browser (a
   * fold-back of the window it drives). The takeover goes on — the lease stays 'user', nothing is handed back,
   * nothing is announced; the event says `takeover` with cause `pass` so every relay re-draws its holder.
   */
  function passControl({ browserKey, profileId = null, from, to, sessionId = null } = {}) {
    ensureLoaded();
    const k = inputKey(browserKey, profileId);
    const d = T.decidePass({ state: inputs.get(k) || null, from, to, now: now() });
    if (!d.ok) return d;
    inputs.set(k, d.state);
    log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ' (ephemeral)'}: the user's control passed from view ${from} to view ${to} (a fold-back — nothing handed back)`);
    emitInput({ kind: 'takeover', browserKey, profileId: profileId || null, sessionId, state: { ...d.state }, cause: 'pass', url: d.state.url || '' });
    // verify r6: the siblings taken WITH it follow the holder (their handback rides the new view's)
    if (profileId) for (const sib of siblingsHeldBy(browserKey, profileId, from)) { const ns = { ...sib.state, takenBy: { ...d.state.takenBy } }; inputs.set(sib.key, ns); emitInput({ kind: 'takeover', browserKey: sib.lease.browserKey, profileId, sessionId: sib.lease.sessionId || null, state: { ...ns }, cause: 'pass', url: ns.url || '' }); }
    return { ok: true, state: inputStateFor(browserKey, profileId) };
  }
  /** The bridge forwarded an input from the holder — the idle clock restarts. Cheap, in memory. */
  function noteUserInput(browserKey, profileId = null, at = null) {
    const k = inputKey(browserKey, profileId);
    const s = inputs.get(k);
    if (!s || s.input !== 'user') return false;
    s.lastUserInputAt = Number(at) || now();
    // verify r6: the siblings taken WITH this one (the same viewer) share its idle clock — one user drives one browser
    if (profileId && s.takenBy) for (const sib of siblingsHeldBy(browserKey, profileId, s.takenBy.viewerId)) sib.state.lastUserInputAt = s.lastUserInputAt;
    return true;
  }
  /** The bridge learned the page the user is on (the `url` mirror) — carried into the handback. */
  function noteUserUrl(browserKey, profileId = null, url = '') {
    noteLeaseUrl(browserKey, profileId, url); // §7.4: the lease's lastUrl is what a switch re-opens
    const k = inputKey(browserKey, profileId);
    const s = inputs.get(k);
    if (!s) return false;
    s.url = typeof url === 'string' ? url.slice(0, 2048) : '';
    return true;
  }
  /** §7.4 step 1: a lease carries its tab's LAST URL (the live view reports
   *  it; the CLI's `open` stamps it too) so the switch re-opens it. */
  function noteLeaseUrl(browserKey, profileId = null, url = '') {
    if (!profileId || typeof url !== 'string' || !/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
    const l = B.findLease(reg.leases, profileId, browserKey);
    if (!l) return false;
    if (l.lastUrl !== url.slice(0, 2048)) { l.lastUrl = url.slice(0, 2048); dirty = true; }
    return true;
  }
  /** The typed refusal an agent command gets while the user drives, or null. `verb` (the command the agent ran) goes
   *  on the cycle's re-run list — the handback names it (the owner's ruling, 2026-09-27). */
  /** verify r5: a verb joins a cycle's re-run list by NAME only when it is one of the CLI's own (browser-verbs.known — the
   *  page verbs + the refused ones); an agent-chosen first word that is none of them (a direct POST) is never spelled
   *  inside VibeSpace's own handback sentence, the zero-spend notice or the owner's For-you item. */
  const rerunVerb = (v) => { const s = String(v || '').trim().slice(0, 40); return s && VERBS.known(s) ? s : null; };
  function pausedVerdictFor(browserKey, profileId = null, { handles = [], verb = null } = {}) {
    const k = inputKey(browserKey, profileId);
    const s = inputs.get(k);
    if (!s || s.input !== 'user') return null;
    const rv = rerunVerb(verb);
    if (rv && cycles.has(k)) cycles.set(k, INT.noteRefused(cycles.get(k), { verb: rv, at: now() }));
    const p = profileId ? profile(profileId) : null;
    return T.browserPausedRefusal({ state: s, label: p ? p.label : null, handles, now: now(), idleMs: takeoverIdleMs(), shared: sharedWindowOf(browserKey, profileId) }); // verify r2 ⑦: a legacy shared window is named as such
  }
  /**
   * WAS THIS COMMAND INTERRUPTED? (the owner's ruling, 2026-09-27 — "告知agent发生了打断"). The CLI asks after its
   * command ended (the audit), naming the server instant its /resolve answered (`since`): a takeover that BEGAN at or
   * after it caught the command in flight. A managed ephemeral / child browser's record id maps to its pair like a
   * detach's (`ephEventFields`). → null | {code:'browser_interrupted', error, takenAt, input, aborted}
   *   `aborted` = the mediator answered a call of this lease browser_interrupted at that takeover (the command was
   *   cut); false = nothing sat between the agent's daemon and Chrome (a browser that is not shared instance-wide):
   *   the command ran on to its own end — the refusal still stands (the user drives; wait, then run it again).
   */
  function interruptionFor({ browserKey, profileId = null, since = 0, verb = null } = {}) {
    ensureLoaded();
    const ev = profileId ? ephEventFields(profileId) : {};
    const bk = ev.ephemeral ? ev.browserKey : browserKey;
    const pid = ev.ephemeral ? null : (profileId || null);
    const kk = inputKey(bk, pid);
    const s = inputs.get(kk);
    const t0 = Number(since) || 0;
    if (!s || !(Number(s.takenAt) > 0) || !(t0 > 0) || Number(s.takenAt) < t0) return null;
    // verify r5 (MEDIUM): the verb this audit names WAS interrupted — it joins the OPEN cycle's re-run list here, because the
    // ring cannot: a command resolved before the takeover whose daemon record lands after the instant is in flight to
    // nobody but the CLI (the card said nothing was running, the CLI says browser_interrupted, and the handback's reminder
    // omitted it). A closed cycle (the handback already went out) takes nothing — the CLI's own line says control is back.
    const rv = rerunVerb(verb);
    if (rv && cycles.has(kk)) cycles.set(kk, INT.noteRefused(cycles.get(kk), { verb: rv, at: now() }));
    const c = cycles.get(kk) || lastClosed.get(kk) || null;
    const p = pid ? profile(pid) : null;
    // `mediated`: a proxy stood between the agent's daemon and this browser (the CLI words "cut" vs "ran to its end" by it —
    // verify r5: `aborted` alone read a mediated takeover that found nothing in flight as "not shared instance-wide")
    // verify r6: `landed` = how many of this lease's aborted calls the browser still answered with a success — they had reached
    // the page and TOOK EFFECT (measured on 0.38.1 + Chrome 153: a `fill` caught on its one Input.insertText holds all 4000 chars
    // while the CLI said "cut short"); the CLI's words carry it so the agent checks the page before running it again
    // verify r7: `unsettled` = aborted calls the browser had NOT answered when this was written (the audit's settle-wait is
    // bounded; measured: a click's reply landed 200 ms after it) — whether they took effect is UNKNOWN, and the CLI says so
    // instead of a definite "cut" the agent would act on (a re-run of a call that then lands is a double click)
    let landed = 0, unsettled = 0;
    if (p && isMediated(p) && mediator && typeof mediator.interruptionOf === 'function') { try { const li = mediator.interruptionOf(pid, bk); if (li && Number(li.at) >= Number(s.takenAt) - 50) { landed = Number(li.landed) || 0; unsettled = Number(li.unsettled) || 0; } } catch { landed = 0; unsettled = 0; } }
    return { code: INT.INTERRUPTED_CODE, error: INT.INTERRUPTED_TEXT, takenAt: Number(s.takenAt), input: s.input, handedBackAt: Number(s.handedBackAt) || 0, aborted: !!(c && c.aborted.length), mediated: !!(p && isMediated(p)), landed, unsettled };
  }
  /** verify r6: the audit's answer waits — bounded — for the browser's late replies to the calls the takeover aborted (a
   *  fill's insertText answered `browser_interrupted` to the agent 1 ms after it left the proxy; Chrome's own reply, which
   *  says it LANDED, follows by a few ms — after the CLI's audit had already asked). ≤ maxMs, 20 ms steps, never throws. */
  async function awaitInterruptionSettled({ browserKey, profileId = null, maxMs = 250 } = {}) {
    const p = profileId ? profile(profileId) : null;
    if (!p || isEph(p) || !isMediated(p) || !mediator || typeof mediator.interruptionOf !== 'function') return 0;
    const t0 = Date.now();
    for (;;) {
      let li = null; try { li = mediator.interruptionOf(profileId, browserKey); } catch { li = null; }
      if (!li || !(Number(li.unsettled) > 0) || Date.now() - t0 >= maxMs) return Date.now() - t0;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  /** The recorder installs its in-flight reader (`({sessionId, browserKey, profileId, at}) → [{id, verb, at}]`). */
  function setInFlightReader(fn) { inFlightReader = typeof fn === 'function' ? fn : null; }
  /** The open cycle of a pair (a route / the suite): the PURE view, or null. */
  function interruptionOf(browserKey, profileId = null) { return INT.interruptionView(cycles.get(inputKey(browserKey, profileId)) || null); }
  /** What the session card / status bar publish for ONE conversation:
   *  {input:'user'|'agent', takenAt} or null when it has no browser at all. */
  function inputSummaryFor(browserKey, { hasBrowser = null } = {}) {
    const bk = String(browserKey || '');
    if (!bk) return null;
    const states = [];
    for (const [k, s] of inputs) if (k.startsWith(bk + '|')) states.push(s);
    const has = hasBrowser === null ? (B.leasesOf(reg.leases, bk).length > 0 || states.length > 0) : !!hasBrowser;
    return T.inputSummary(states, has);
  }
  /** Every input state of one conversation (Session Properties / the status route). */
  function inputsFor(browserKey) {
    const bk = String(browserKey || '');
    const out = [];
    for (const [k, s] of inputs) if (k.startsWith(bk + '|')) out.push({ ...s, key: k, browserKey: bk, profileId: k.endsWith('|ephemeral') ? null : k.slice(bk.length + 1) });
    return out;
  }
  /** The idle arm of the tick: a takeover somebody walked away from lapses. */
  function sweepIdleTakeovers(t) {
    const lim = takeoverIdleMs();
    for (const [k, s] of inputs) {
      if (s.input !== 'user') continue;
      const v = T.idleHandbackVerdict({ state: s, now: t, idleMs: lim });
      if (!v.lapsed) continue;
      const bar = k.indexOf('|');
      const bk = k.slice(0, bar); const pid = k.slice(bar + 1);
      handback({ browserKey: bk, profileId: pid === 'ephemeral' ? null : pid, cause: 'idle', url: s.url || '' });
    }
  }
  /** LANE H VERIFY r6 LOW 3: a STOP ends the browser a takeover was ON. r5 put Stop on every live named row (the remedy the
   *  unstable notice names) and `stop()` never touched the input side: the takeover outlived its browser, so the browser the
   *  agent's next command started was already `browser_paused` for it until the idle handback. Now every input state keyed on
   *  the stopped profile is handed back with cause `stop` through `handback` — the lease flips, the bridge and the card
   *  follow, the announcer queues the zero-spend notice for the conversation's next message (a state change, never a
   *  delivered turn) — and a pending confirmation of the ended browser is resolved `gone` (the daemon that asked is gone:
   *  nothing can answer it). A switch (§7.4) restarts the SAME profile's browser for the same holders at once: its takeover
   *  stands. → how many were handed back. */
  function handBackOnStop(profileId, p, why) {
    if (why === 'switch') return 0;
    const eph = !!p && isEph(p);
    const keys = eph ? [inputKey(p.owner.id, null)] : [...new Set([...inputs.keys(), ...pending.keys()])].filter((k) => k.endsWith('|' + profileId));
    let n = 0;
    for (const k of keys) {
      const bk = eph ? String(p.owner.id) : k.slice(0, k.length - String(profileId).length - 1);
      const pid = eph ? null : profileId;
      const s = inputs.get(k);
      if (s && s.input === 'user') {
        const l = eph ? null : B.findLease(reg.leases, profileId, bk);
        const sessionId = eph ? ephEventFields(profileId).sessionId || null : (l && l.sessionId) || null;
        if (handback({ browserKey: bk, profileId: pid, cause: 'stop', url: s.url || '', sessionId }).ok) n++;
      }
      const m = pending.get(k);
      if (m) for (const id of [...m.keys()]) resolvePending({ browserKey: bk, profileId: pid, id, decision: 'gone' });
    }
    return n;
  }
  /** A lease that goes away takes its input state with it (never a delivery). */
  function dropInputsFor(browserKey, profileId = null) {
    endLeaseRequest(browserKey, profileId); // lane browser-takeover-queue: the request on a lease that goes away is withdrawn ('lease-gone')
    const k = inputKey(browserKey, profileId);
    const s = inputs.get(k);
    if (!s) return;
    if (s.input === 'user') handback({ browserKey, profileId, cause: 'detach', url: s.url || '' });
    inputs.delete(k);
    cycles.delete(k);
    lastClosed.delete(k);
    pending.delete(k);
  }

  // ── lane browser-takeover-queue: THE TAKEOVER REQUESTS (PURE src/browser-takeover-request.js) ──
  // A request for a human is a RECORD: ONE per lease (browserKey × profileId — null = the conversation's own browser), written
  // HERE only — `requestTakeover` (the agent's `vibespace-browser ask-human`), `resolveTakeoverRequest` (its withdraw, the
  // person's Done) and the lease's own input events (`requestOnInput`: a takeover ⇒ taken, an explicit handback ⇒ done, a
  // handback nobody chose ⇒ waiting again) and its end (`endLeaseRequest`) — persisted (data/browser-takeovers.json,
  // writeJsonAtomic) and broadcast (`browser-takeovers-updated`) with the takeover / handback that moved it. A restart is a
  // handback by construction: a request `taken` at load waits again (nobody said it is done).
  const REQUESTS_FILE = path.join(dataDir, 'browser-takeovers.json');
  const requests = new Map(); // id → record
  let requestsLoaded = false;
  const requestListeners = new Set();
  // r3261 (主开发, its second unit; lane bl-machines-b's census of the stores, «37 more»): THE TAKEOVER REQUESTS UNDER THE STORE-READ
  // LAW. The release read ANY failure of the file as an empty queue, and the next write (an agent's ask, the person's Done, an item's
  // note, a lease's end) wrote it over: every open request waiting for a person lost, and a page verb ran on a browser a person had
  // been asked to take over (`human_asked` saw no request). Now its ONE read answers through src/store-read.js and the tree's ONE hold
  // (src/store-read-hold.js): HELD, no request is known — the queue, a request by its id and a browser's open request answer the
  // hold BY NAME (takeovers_unread, 503 on the routes); every writer is refused by name before any side effect; nothing is written over
  // the file; a page verb is refused (whether a person was asked cannot be told: fail closed); the file is read again off the loop;
  // LIFTED with no restart (a request `taken` waits again, as at a start). Torn bytes are kept aside once
  // (`browser-takeovers.json.corrupt-<mark>`, 0600), then it starts empty with the DAMAGED mark in the new file (`damaged {copy, at}`:
  // the queue's answer says it, read back at a start, gone when a store without it is read).
  const TQ_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && (v.requests === undefined || Array.isArray(v.requests));
  const tqAside = (mark) => REQUESTS_FILE + '.corrupt-' + mark;   // the torn bytes' copy beside the store (the hold's `aside`; its head bounds a mark read back)
  const tqDamagedOf = (v) => (v && v.damaged && typeof v.damaged === 'object' && typeof v.damaged.copy === 'string' && v.damaged.copy.startsWith(path.basename(tqAside(''))) && v.damaged.copy.length <= 160 ? { copy: v.damaged.copy, at: Number(v.damaged.at) || null } : null);   // r4130 (c): bounded — its known head and a length
  let tqDamaged = null;
  function takeRequests(v) {
    requests.clear();
    for (const r of Array.isArray(v && v.requests) ? v.requests : []) {
      if (!r || !TQ.ID_RE.test(String(r.id || '')) || !TQ.STATES.includes(r.state)) continue;
      requests.set(r.id, r.state === 'taken' ? { ...r, state: 'waiting', takenBy: null } : r);
    }
  }
  const tqHold = STH.create({
    file: REQUESTS_FILE, valid: TQ_SHAPE, code: 'takeovers_unread', aside: tqAside, now,
    words: (h) => `the requests waiting for a person to take over a browser could not be read (browser-takeovers.json in VibeSpace's data folder: ${h.code}); VibeSpace reads them again every few minutes. No request is lost: nothing is written over them, none is filed or ended, and no page action runs until they read. Wait and run your command again later — VibeSpace reads them again by itself; do not ask a person again`,   // r4130 (a)
    log: (l) => { try { log.warn?.('[browser] ' + l); } catch { /* a log is never the store's */ } },
    onLift: (v, f) => {
      takeRequests(v);
      tqDamaged = !v && f && f.setAside ? { copy: String(f.setAside), at: now() } : tqDamagedOf(v);
      if (!v && tqDamaged) saveRequests();   // the new empty queue carries the damaged mark at once (a restart still says it)
      try { broadcast?.({ type: 'browser-takeovers-updated', requests: takeoverRequests(), ...(tqDamaged ? { damaged: { ...tqDamaged } } : {}) }); } catch (e) { log.warn?.(`[browser] takeover requests not broadcast at their read: ${e && e.message}`); }
    },
  });
  /** the hold's refusal BY NAME — every writer's answer while the requests are unread */
  const tqRefusal = (what) => ({ ok: false, code: 'takeovers_unread', status: 503, error: `${what}: ${tqHold.words()}` });
  const tqUnread = (what) => namedError('takeovers_unread', `${what}: ${tqHold.words()}`);
  function loadRequests() {
    if (requestsLoaded) return;
    requestsLoaded = true;
    let read; try { read = { text: fs.readFileSync(REQUESTS_FILE, 'utf8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: TQ_SHAPE });
    if (tqHold.start(a) === 'data') { takeRequests(a.value); tqDamaged = tqDamagedOf(a.value); }
  }
  /** Are the requests HELD (their file could not be read)? — the announcer asks before an item's press moves anything */
  function takeoversHeld() { loadRequests(); return !!tqHold.held(); }
  /** a torn queue lifted empty: { copy, at } (the copy's base name) — null when none */
  function takeoversDamaged() { loadRequests(); return tqDamaged ? { ...tqDamaged } : null; }
  /** r4130 (b): a For-you item pressed while the requests are held is put back — SAID to the person at that press (one notice a hold, worded by
   *  the page in its own language). → the clients reached (0: nobody connected, or not held) */
  const TQ_PUT_BACK = i18nKey('The requests waiting for you to take over a browser could not be read right now, so the item you pressed was put back — VibeSpace reads them again by itself; press it again then.');
  function noteTakeoverPutBack() { const h = tqHold.held(); if (!h) return 0; try { return serverNotice?.(`takeovers-held-put-back:${h.since || 0}`, TQ_PUT_BACK, { i18n: { key: TQ_PUT_BACK } }) || 0; } catch { return 0; } }
  function saveRequests() {
    // the closed ones keep a short tail (the CLI's after-the-fact question), the open ones all
    const all = [...requests.values()];
    const closed = all.filter((r) => !TQ.isOpen(r)).sort((a, b) => (Number(b.doneAt) || 0) - (Number(a.doneAt) || 0));
    for (const r of closed.slice(TQ.LIMITS.closedKept)) requests.delete(r.id);
    if (!tqHold.writable('a takeover request change')) return false;   // r3261: HELD — nothing is written over the file
    try { fs.mkdirSync(dataDir, { recursive: true }); writeJsonAtomic(REQUESTS_FILE, { version: 1, requests: [...requests.values()], ...(tqDamaged ? { damaged: { ...tqDamaged } } : {}) }); return true; }
    catch (e) { log.warn?.(`[browser] could not write ${path.basename(REQUESTS_FILE)}: ${e && e.message}`); return false; }
  }
  /** Does the conversation still hold the browser a request is about (the live view's own rule)? */
  function requestLeaseHeld(r) {
    if (!r) return false;
    if (r.profileId) return !!B.findLease(reg.leases, r.profileId, r.browserKey);
    return reg.profiles.some((p) => isEph(p) && p.owner && p.owner.id === r.browserKey);
  }
  const requestLive = (r) => { try { return B.keyCarried(r.browserKey, sessionLiveKeys()); } catch { return true; } };
  /** THE QUEUE as the viewer may see it (PURE queueOf over the keeper's facts). */
  function takeoverRequests({ viewer = { kind: 'owner' } } = {}) { ensureLoaded(); loadRequests(); if (tqHold.held()) throw tqUnread('the takeover queue'); /* r3261: HELD — never an empty queue */ return TQ.queueOf([...requests.values()], { viewer, leaseHeld: requestLeaseHeld, live: requestLive }); }
  function takeoverRequest(id) { loadRequests(); if (tqHold.held()) throw tqUnread('a takeover request'); /* r3261: HELD — never «no such request» */ const r = requests.get(String(id || '')); return r ? { ...r } : null; }
  function openRequestFor(browserKey, profileId = null) {
    loadRequests();
    const lk = TQ.leaseKeyOf({ browserKey, profileId });
    for (const r of requests.values()) if (TQ.isOpen(r) && TQ.leaseKeyOf(r) === lk) return r;
    return null;
  }
  /** a browser's open request as the agent's route asks it (its --status, its withdraw): the hold BY NAME while held (r3261) — the
   *  keeper's own callers (an input event, a lease's end, the page verb's gate) ask `openRequestFor`, which never throws */
  function openRequestAsked(browserKey, profileId = null) { loadRequests(); if (tqHold.held()) throw tqUnread("this browser's takeover request"); return openRequestFor(browserKey, profileId); }
  function onTakeoverRequest(fn) { requestListeners.add(fn); return () => requestListeners.delete(fn); }
  /** ONE write, ONE broadcast, then the listeners (the For-you item, the agent's telling) — per change of a record. */
  function requestChanged(rec, ev) {
    saveRequests();
    try { broadcast?.({ type: 'browser-takeovers-updated', requests: takeoverRequests() }); } catch (e) { log.warn?.(`[browser] takeover requests not broadcast: ${e && e.message}`); }
    for (const fn of requestListeners) { try { fn({ ...ev, request: { ...rec } }); } catch (e) { log.warn?.(`[browser] takeover-request listener failed: ${e && e.message}`); } }
  }
  /**
   * THE AGENT ASKS (`vibespace-browser ask-human`): a NEW request on that lease, or the open one RE-ASSERTED (the same id).
   * → {ok:true, request, reasserted, cut} | {ok:false, code, error, remedy}
   */
  function requestTakeover({ browserKey, profileId = null, sessionId = null, conversationKey = null, conversationName = '', text = '', url = '', title = '' } = {}) {
    ensureLoaded(); loadRequests();
    if (tqHold.held()) return tqRefusal('asking a person to take over');   // r3261: HELD — nothing is filed over requests that could not be read
    const p = profileId ? profile(profileId) : null;
    const lease = { browserKey: String(browserKey || ''), profileId: p && !isEph(p) ? p.id : null };
    const v = TQ.askVerdict({ text, lease: lease.browserKey ? lease : null });
    if (!v.ok) return v;
    if (!requestLeaseHeld({ browserKey: lease.browserKey, profileId: lease.profileId })) return { ok: false, code: 'no_browser', error: lease.profileId ? `this conversation holds no lease on "${p ? p.label : profileId}"` : 'this conversation has no browser of its own yet — a person takes over a page that is open', remedy: 'open the page first (`vibespace-browser open <url>`), then ask' };
    const at = now();
    const open = openRequestFor(lease.browserKey, lease.profileId);
    if (open) {
      const r = TQ.reassert(open, { text: v.text, url, title, at, sessionId, conversationName });
      requests.set(open.id, r.rec);
      log.log?.(`[browser] ${lease.browserKey}${lease.profileId ? ' on ' + lease.profileId : ' (its own browser)'}: takeover request ${open.id} asked again (${r.rec.asks} asks) — the same row`);
      requestChanged(r.rec, { kind: 'reasserted' });
      return { ok: true, request: { ...r.rec }, reasserted: true, cut: v.cut };
    }
    if ([...requests.values()].filter(TQ.isOpen).length >= TQ.LIMITS.openMax) return { ok: false, code: 'too_many', error: `${TQ.LIMITS.openMax} requests already wait for a person on this instance`, remedy: 'withdraw one you no longer need (`vibespace-browser ask-human --withdraw`)' };
    let id; do { id = 'tr-' + crypto.randomBytes(4).toString('hex'); } while (requests.has(id));
    const input = inputStateFor(lease.browserKey, lease.profileId);
    let rec = TQ.newRequest({ id, browserKey: lease.browserKey, profileId: lease.profileId, conversationKey, sessionId, conversationName, profileLabel: p && !isEph(p) ? p.label : '', text: v.text, url, title, at });
    if (input.input === 'user') rec = TQ.transition(rec, 'take', { at, viewerId: input.takenBy ? input.takenBy.viewerId : null }).rec; // already driven: it is taken now
    requests.set(id, rec);
    if (tqDamaged) tqDamaged = null;   // r4130 (c): the damaged mark ENDS at the first request filed after the lift (the queue is live again; its save drops the mark)
    log.log?.(`[browser] ${lease.browserKey}${lease.profileId ? ' on ' + lease.profileId : ' (its own browser)'}: takeover request ${id} filed (${rec.state}) — the Agent browser window lists it`);
    requestChanged(rec, { kind: 'asked' });
    return { ok: true, request: { ...rec }, reasserted: false, cut: v.cut };
  }
  /** Move a record by `how` (PURE transition) — the ONE place a record changes after its birth. */
  function moveRequest(rec, how, { viewerId = null, cause = null, pressed = null } = {}) {
    const t = TQ.transition(rec, how, { at: now(), viewerId });
    if (!t.ok || !t.changed) return t;
    requests.set(rec.id, t.rec);
    log.log?.(`[browser] takeover request ${rec.id}: ${rec.state} → ${t.rec.state} (${how}${cause ? ', ' + cause : ''})`);
    requestChanged(t.rec, { kind: t.to, how, cause, from: t.from, pressed });
    return t;
  }
  /** The agent's withdraw / the person's Done (without a takeover) / a parked flag — by id. `how` ∈ withdraw | done. */
  function resolveTakeoverRequest(id, how, { pressed = null } = {}) {
    loadRequests();
    if (tqHold.held()) return tqRefusal(how === 'withdraw' ? 'withdrawing the request' : 'marking the request done');   // r3261: HELD — never «not found»
    const rec = requests.get(String(id || ''));
    if (!rec) return { ok: false, code: 'not_found', error: 'no such takeover request' };
    if (!TQ.isOpen(rec)) return { ok: false, code: 'closed', error: `request ${rec.id} is already ${rec.state}`, request: { ...rec } };
    if (how !== 'withdraw' && how !== 'done') return { ok: false, code: 'bad_how', error: 'a request is withdrawn (the agent) or done (the person)' };
    const t = moveRequest(rec, how, { pressed });
    return t.ok ? { ok: true, request: { ...t.rec } } : { ok: false, code: t.code, error: `request ${rec.id} did not move`, request: { ...rec } };
  }
  /** The For-you item that carries a request (its id, the conversation key it is filed under), its parking (a dismissal:
   *  band 4, still listed) and a reply the person sent through it (`replied` — the CLI's wait wakes and says so). */
  function noteRequestItem(id, { itemId, parked, conversationKey, replied = false } = {}) {
    loadRequests();
    if (tqHold.held()) return null;   // r3261: HELD — an item's note waits (the announcer puts the item back first)
    const rec = requests.get(String(id || ''));
    if (!rec) return null;
    const next = { ...rec, ...(itemId !== undefined ? { itemId: itemId || null } : {}), ...(parked !== undefined ? { parked: !!parked } : {}), ...(conversationKey ? { conversationKey: String(conversationKey).slice(0, 200) } : {}), ...(replied ? { repliedAt: now() } : {}) };
    if (!replied && next.itemId === rec.itemId && next.parked === rec.parked && next.conversationKey === rec.conversationKey) return { ...rec };
    requests.set(rec.id, next);
    if (replied) requestChanged(next, { kind: 'replied' });
    else if (next.parked !== rec.parked) requestChanged(next, { kind: 'parked', parked: next.parked });
    else saveRequests();
    return { ...next };
  }
  /** Every takeover / handback event (the primary, a mate taken WITH it, a pass, a detach's) moves the request on its lease. */
  function requestOnInput(ev) {
    if (!ev || ev.human || ev.target === 'window' || (ev.kind !== 'takeover' && ev.kind !== 'handback')) return;
    const rec = openRequestFor(ev.browserKey, ev.profileId || null);
    if (!rec) return;
    if (ev.kind === 'takeover') moveRequest(rec, 'take', { viewerId: ev.state && ev.state.takenBy ? ev.state.takenBy.viewerId : null, cause: ev.cause || null });
    else ev.request = { ...moveRequest(rec, TQ.howOfHandback(ev.cause), { cause: ev.cause || null }).rec }; // the announcer's handback words carry the request it ended
  }
  function endLeaseRequest(browserKey, profileId = null) { const rec = openRequestFor(browserKey, profileId); if (rec) moveRequest(rec, 'lease-gone'); }
  /** `human_asked` while a request WAITS on this lease (nobody took over yet) — null otherwise. */
  function askedVerdictFor(browserKey, profileId = null, { handles = [] } = {}) {
    loadRequests(); if (tqHold.held()) return { ...tqRefusal('this page action did NOT run — whether a person was asked to take over this browser cannot be told'), handles };   // r3261: fail closed
    const rec = openRequestFor(browserKey, profileId);
    return rec && rec.state === 'waiting' ? TQ.humanAskedRefusal(rec, { handles, now: now(), ...(askWaitMs ? { waitMs: askWaitMs } : {}) }) : null;
  }
  /** A paused refusal on a lease whose request is open carries it (the CLI then waits for the handback). */
  function withOpenRequest(paused, browserKey, profileId = null) { const rec = openRequestFor(browserKey, profileId); return rec ? { ...paused, request: TQ.agentRequestView(rec, now(), askWaitMs ? { waitMs: askWaitMs } : {}) } : paused; }

  // ── P3 (§4.3): --confirm-actions — pending confirmations, answered through upstream's own verbs ──
  function emitConfirmation(ev) { for (const fn of confirmListeners) { try { fn(ev); } catch (e) { log.warn?.(`[browser] confirmation listener failed: ${e && e.message}`); } } }
  function onConfirmation(fn) { confirmListeners.add(fn); return () => confirmListeners.delete(fn); }
  /** The bridge saw a `confirmation_required` result for this (conversation, browser). */
  function notePending({ browserKey, profileId = null, sessionId = null, confirmation } = {}) {
    if (!confirmation || !confirmation.id) return null;
    const k = inputKey(browserKey, profileId);
    const m = pending.get(k) || new Map();
    // r6 A-F8: FIRST WRITE WINS — a second record under a held id never changes what the owner was shown (a forged
    // record once overwrote an upload's card with "click", silently, and Confirm confirmed the upload)
    const held = m.get(confirmation.id) || null;
    const nv = T.pendingNoteVerdict(held, confirmation);
    if (nv.kind === 'conflict') {
      log.warn?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''}: ${nv.error}`);
      emitConfirmation({ kind: 'conflict', browserKey, profileId: profileId || null, sessionId, id: held.id, attempted: { action: confirmation.action || null, target: confirmation.target || null }, error: nv.error });
      return { ...T.confirmationView(held, now()), conflict: true };
    }
    if (nv.kind === 'same') return T.confirmationView(held, now());
    m.set(confirmation.id, { ...confirmation });
    pending.set(k, m);
    ensureTimer();
    log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''}: action ${JSON.stringify(confirmation.action)}${confirmation.target ? ' on ' + JSON.stringify(confirmation.target) : ''} is waiting for a confirmation (${confirmation.id}; the daemon auto-denies after ${Math.round(T.CONFIRM_TTL_MS / 1000)} s)`);
    emitConfirmation({ kind: 'pending', browserKey, profileId: profileId || null, sessionId, confirmation: { ...confirmation } });
    return T.confirmationView(confirmation, now());
  }
  /** The daemon saw an answer (or the ttl passed): forget it. */
  function resolvePending({ browserKey, profileId = null, id, decision = null } = {}) {
    const k = inputKey(browserKey, profileId);
    const m = pending.get(k);
    if (!m || !m.has(id)) return false;
    m.delete(id);
    if (!m.size) pending.delete(k);
    emitConfirmation({ kind: 'resolved', browserKey, profileId: profileId || null, id, decision });
    return true;
  }
  /** What is still pending for one (conversation, browser), expired ones swept. */
  function pendingFor(browserKey, profileId = null) {
    const k = inputKey(browserKey, profileId);
    const m = pending.get(k);
    if (!m) return [];
    const t = now(); const out = [];
    for (const [id, c] of [...m]) {
      const v = T.confirmationView(c, t);
      if (v.expired) { m.delete(id); emitConfirmation({ kind: 'resolved', browserKey, profileId: profileId || null, id, decision: 'expired' }); continue; }
      out.push(v);
    }
    if (!m.size) pending.delete(k);
    return out;
  }
  /** Every pending confirmation of one conversation (any of its browsers). */
  function pendingAllFor(browserKey) {
    const bk = String(browserKey || '');
    const out = [];
    for (const k of [...pending.keys()]) { if (!k.startsWith(bk + '|')) continue; const pid = k.slice(bk.length + 1); out.push(...pendingFor(bk, pid === 'ephemeral' ? null : pid).map((v) => ({ ...v, profileId: pid === 'ephemeral' ? null : pid }))); }
    return out;
  }
  function sweepPending() { for (const k of [...pending.keys()]) { const bar = k.indexOf('|'); const pid = k.slice(bar + 1); pendingFor(k.slice(0, bar), pid === 'ephemeral' ? null : pid); } }
  /**
   * Answer a pending confirmation with upstream's OWN `confirm <id>` / `deny
   * <id>` (never a second mechanism), under the lease's session in the
   * profile's namespace, or the ephemeral browser's spawn pairs. Typed:
   * `{ok, decision, id}` or `{ok:false, code, error}`.
   */
  async function answerConfirmation({ browserKey, profileId = null, id, decision, envPairs = null, shown } = {}) {
    ensureLoaded();
    const a = T.decisionArgv(id, decision);
    if (!a.ok) return a;
    // r6 A-F8: only an id PENDING FOR THIS BROWSER is answered, and a Confirm only for the card it was pressed on (the
    // digest of what that card showed) — else a named refusal and NOTHING reaches upstream
    const gate = T.answerGate({ entry: (pending.get(inputKey(browserKey, profileId)) || new Map()).get(a.id) || null, decision: a.decision, shown, now: now() });
    if (!gate.ok) { log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''}: ${a.decision} ${a.id} refused before upstream — ${gate.code}`); return gate; }
    let r;
    if (profileId) {
      const p = profile(profileId);
      if (!p) return { ok: false, code: 'not-found', error: `no profile ${profileId}` };
      if (isMediated(p) && !HM.isHumanKey(browserKey)) { // BROWSE YOURSELF: the user's own session is never mediated
        // P6: the confirmation lives in the session's OWN daemon (its namespace over its scoped url)
        const url = mediator && mediationOn() ? mediator.urlFor(profileId, browserKey) : null;
        if (!url) return { ok: false, code: 'no-browser', error: `"${p.label}" is shared instance-wide and this conversation holds no mediated url for it (attach again)` };
        r = await rt.exec(M.mediatedNamespace(profileId, browserKey), a.argv, { session: 'vs-' + String(browserKey || ''), extraEnv: { AGENT_BROWSER_CDP: url } });
      } else {
        // naive study 2: under the lease's own session over the keeper browser's CDP url — never the directory
        const o = await leaseCliOpts(profileId, browserKey);
        if (!o) return { ok: false, code: 'browser_no_cdp', error: noCdpError(p) };
        r = await rt.exec(nsOf(profileId), a.argv, o);
      }
    } else {
      const S = require('../browser-stream.js');
      const pairs = Array.isArray(envPairs) ? envPairs : [];
      if (!pairs.length) return { ok: false, code: 'no-browser', error: 'this session has no browser of its own to answer on' };
      r = await rt.exec(null, a.argv, { extraEnv: S.pairsToEnv(pairs) });
    }
    const v = T.decisionVerdict(r.json || (r.ok ? { success: true } : { success: false, error: (r.stderr || r.error || 'the browser CLI failed').trim() }));
    if (v.ok || v.code === 'no_confirmation') resolvePending({ browserKey, profileId, id: a.id, decision: v.ok ? a.decision : 'gone' });
    log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''}: ${a.decision} ${a.id} → ${v.ok ? 'ok' : v.code + ' (' + v.error + ')'}`);
    return v.ok ? { ok: true, decision: a.decision, id: a.id } : v;
  }
  /** What THIS conversation holds: its leases (children included), the
   *  browsers behind them, its pin and the pin's origin, and the ATTACHMENT
   *  SET view (§3.7: aliases, the default, the child handles) — `vibespace-
   *  browser status` and Session Properties read this one answer. */
  function statusFor(browserKey) {
    ensureLoaded();
    // lane H: the HOLDER rows — a live managed ephemeral browser is one (ephemeral: true), beside `ephemeral` below
    const leases = holders(B.leasesOf(reg.leases, browserKey, { children: true })).map((l) => {
      const p = profile(l.profileId);
      // lane browser-windows: who drives THIS lease's window from ANOTHER view — only the user, and only for a lease still in
      // an older run's shared window (its window mates' views); a lease in its own window is driven from its own view or not
      const ud = !l.ephemeral && p ? userDrivingOf(l.profileId, l.browserKey) : null;
      const driver = ud ? { browserKey: ud.browserKey, by: 'user' } : null;
      return { ...l, label: l.label || (p ? p.label : l.profileId), browser: agentBrowserView(reg.browsers[l.profileId]), others: reg.leases.filter((x) => x.profileId === l.profileId && x.browserKey !== l.browserKey).length, driver, scope: p ? B.scopeOf(p) : null };
    });
    const set = setFor(browserKey);
    // MULTIVIEW §4 (B-89d0): each helper's handle carries ITS OWN browser's state
    // (its managed ephemeral record — null until its first page verb) — the strip lists it
    const children = set.children.map((c) => { const e = ephemeralFor(c.handle); const jl = !e && c.job ? reg.leases.find((l) => l.browserKey === c.handle) : null; const jr = jl ? reg.browsers[jl.profileId] : null; return { ...c, browser: e ? { profileId: e.profileId, state: e.state, live: e.live, stoppedBy: e.stoppedBy, endedAt: e.endedAt, startedAt: e.startedAt } : (jl ? { profileId: jl.profileId, state: jr ? jr.state : 'stopped', live: !!(jr && B.isLiveBrowser(jr)), job: true } : null) }; });
    const cap = capFor(browserKey);
    return { browserKey, leases, pin: pinFor(browserKey), pinFailure: pinFailureOf(browserKey), defaultProfile: set.defaultId, attachments: set.attachments, handles: set.handles, children, fingerprint: set.fingerprint, told: reg.told[String(browserKey || '')]?.fingerprint || null,
      // P3 (§4.3): who drives each of this conversation's browsers (its helpers' too — MULTIVIEW), and what is waiting on a confirmation
      inputs: [...inputsFor(browserKey), ...set.children.flatMap((c) => inputsFor(c.handle))], input: inputSummaryFor(browserKey), pending: pendingAllFor(browserKey),
      // takeover C3: this conversation's managed ephemeral browser (null until its first page verb)
      ephemeral: ephemeralFor(browserKey),
      // MULTIVIEW D4: the strip's `own/cap` chip — this conversation's live browsers against ITS cap; the machine's ceiling beside it (a count, never names)
      cap: { own: ownLive(browserKey), cap: cap.cap, origin: cap.origin, explicit: capOf(browserKey), machine: { used: Object.values(reg.browsers).filter(B.isLiveBrowser).length + othersNow().length, cap: machineCap(), ...(capUnread() ? { unread: true, code: HELD_CODE } : {}) } }, ...(heldNow() ? { settingsHeld: { code: HELD_CODE } } : {}) };   // B-50e7 point 9: the settings held, said where the person looks
  }

  /** Lane H: the browser this conversation's agent holds LIVE right now, as
   *  the ONE scalar the session card and the status-bar chip publish
   *  (`browserLive`): '' none · 'ephemeral' its own managed ephemeral browser
   *  (a sub-agent's never counts — it is not this session's pane) · else a
   *  profile id: the one it LAST USED (`active`) when that is live, else the
   *  first live attachment, else its live ephemeral. From the holder rows,
   *  never a second reading of the registry. */
  function liveHoldingFor(browserKey, active = null) {
    ensureLoaded();
    const bk = String(browserKey || '');
    if (!bk) return '';
    const rows = holders(B.leasesOf(reg.leases, bk));
    const liveNamed = rows.filter((r) => !r.ephemeral && reg.browsers[r.profileId] && reg.browsers[r.profileId].state === 'ready');
    const eph = rows.find((r) => r.ephemeral && !r.child) || null;
    if (active === '' && eph) return 'ephemeral';
    if (active && liveNamed.some((r) => r.profileId === active)) return active;
    if (liveNamed.length) return liveNamed[0].profileId;
    return eph ? 'ephemeral' : '';
  }

  /**
   * lane S2 (naive study 2 — three answers to "which browser"): the registry VIEW the ONE browser fact is computed
   * over (src/browser-fact.js browserFactFor). Everything a surface would otherwise read from a different raw field —
   * the pin (with its cleared mark), the attachment set's default, each named browser's state + last failure, the
   * conversation's own browser (+ when its last verb ran), who drives, what runs live — in ONE read.
   */
  function factView(browserKey, { active = null } = {}) {
    ensureLoaded();
    const bk = String(browserKey || '');
    const set = setFor(bk);
    const ids = new Set(set.attachments.map((a) => a.profileId));
    const pin = reg.pins[bk] || null;
    if (pin && pin.profileId) ids.add(pin.profileId);
    const browsers = {};
    for (const id of ids) { const r = reg.browsers[id]; if (r) browsers[id] = { state: r.state, lastError: r.lastError || null, closed: !!r.closed, startedAt: r.startedAt || 0 }; }
    const e = ephemeralFor(bk);
    const ownP = e ? profile(e.profileId) : null;
    const own = e ? { profileId: e.profileId, state: e.state, lastError: e.lastError || null, startedAt: e.startedAt || 0, lastVerbAt: (ownP && ownP.lastVerbAt) || 0 } : null;
    let input = null; try { input = inputSummaryFor(bk).input || null; } catch { input = null; }
    let live = ''; try { live = liveHoldingFor(bk, active) || ''; } catch { live = ''; }
    let stuck = null; if (stuckSource) { try { stuck = stuckSource(bk) || null; } catch { stuck = null; } } // lane browser-stuck: a dialog open / an unresponsive page (the dialog watch's fact)
    let kept = null; if (B.isBrowserKey(bk)) { try { const ks = keptStore(); kept = ks ? ks.brief(bk) : null; } catch { kept = null; } } // lane browser-resume B: what its own browser keeps (the Resume)
    return { profiles: named().map((p) => ({ id: p.id, label: p.label })), pin: pin ? { ...pin } : null, attachments: set.attachments.map((a) => ({ profileId: a.profileId, alias: a.alias, label: a.label, isDefault: a.isDefault })), browsers, own, input, live, now: now(), stuck, kept };
  }
  /** lane browser-stuck: the dialog watch (src/server/browser-dialogs.js) answers a conversation's stuck fact. */
  let stuckSource = null;
  function setStuckSource(fn) { stuckSource = typeof fn === 'function' ? fn : null; }
  let passkeyDrop = null; // lane passkey-store-core: the dialog watch (the passkey store's one writer) drops a removed profile's keys
  function setPasskeyDrop(fn) { passkeyDrop = typeof fn === 'function' ? fn : null; }
  let passkeyHeld = null; // r3261: the dialog watch answers whether the passkey store is HELD (unread) — asked before a profile's removal
  function setPasskeyHeld(fn) { passkeyHeld = typeof fn === 'function' ? fn : null; }
  /** r3632: the passkey store HELD now? → its facts ({ words, … }) | null — the one fact every remover asks BEFORE anything moves */
  function passkeyHeldNow() { try { return passkeyHeld ? passkeyHeld() : null; } catch { return null; } }
  const passkeyRemovalWords = (ph) => `this browser profile was not removed: its passkeys could not be read (${(ph && ph.code) || 'unread'}), and removing it now would drop them from a store that could not be read — nothing was removed; VibeSpace reads them again by itself, then the removal can be pressed again`;   // r3702: a removal's words
  let retireHeldSaid = false;   // r3632 (should): the sweep's retire refused while held is said ONCE a hold, not every pass
  /** lane S2: THE browser fact of one live session (`sessionFacts` = browser-fact.sessionFactsOf(session)). */
  function factFor(sessionFacts) {
    if (!sessionFacts || !sessionFacts.browserKey) return null;
    return BF.browserFactFor(sessionFacts, factView(sessionFacts.browserKey, { active: sessionFacts.active }));
  }
  /**
   * lane S2 (naive study 2 T4 — "typed input during a takeover was not delivered, and nothing said so"). MEASURED on
   * agent-browser 0.38.1 through the real mediator: ONE viewer input record becomes exactly ONE CDP `Input.*` call
   * (mousePressed / mouseReleased / keyDown / char / keyUp / mouseWheel, 6 of 6), the stream server answers NOTHING
   * for it, and a MEDIATED lease's live view streams from the session's own daemon THROUGH the mediator — whose
   * paused fence refused every one of the user's own `Input.*` calls while the user drove (the page got nothing).
   * The bridge now mints ONE credit per forwarded record on the lease's grant before it forwards; the mediator admits
   * the next `Input.*` on that credit and answers Chrome's own reply as the receipt. A non-mediated target answers
   * null (the bridge's receipt is then the upstream's own write).
   */
  function creditUserInput(target, record = null, { targetId = null } = {}) {
    if (!target || target.kind !== 'attachment' || !mediator || typeof mediator.creditInput !== 'function') return null;
    const p = profile(target.profileId);
    if (!p || !isMediated(p)) return null;
    const bk = String(target.sessionName || '').replace(/^vs-/, '');
    return mediator.creditInput({ profileId: p.id, browserKey: bk, record, targetId }); // lane S2 verify: the credit is bound to THIS record's own CDP call; verify r2: and to the tab the user is looking at
  }

  // ── §3.7 the attachment set + handles; §3.8 layer ① the one-time refusal ──
  function childrenOf(browserKey) {
    return Object.entries(reg.children).filter(([k, c]) => c && B.parentKeyOf(k) === browserKey && k !== browserKey).map(([k, c]) => ({ handle: k, since: c.since || 0, sessionId: c.sessionId || null, ...(c.job ? { job: String(c.job) } : {}) }));
  }
  // ── lane jobs-browser (B-dbc1): A BACKGROUND WORK JOB BROWSES AS ITS OWNER CONVERSATION ──
  /** The job's handle under its owner's key (src/browser-job-principal.js): found, else minted — a child handle tagged
   *  `job` (reaped by the job's end, never by its owner's: a running job carries it). One per (job, owner key). */
  function jobHandleFor({ ownerKey, jobId } = {}) {
    refuseIfHeld('a job\'s browser');   // the B-f276 remainder: refused by name while the registry is held (nothing minted, nothing written)
    ensureLoaded();
    if (!B.isBrowserKey(ownerKey) || !jobId) throw namedError('bad-request', 'a job handle needs its owner\'s browser key and the job id');
    const have = J.jobHandleOf(reg.children, jobId, ownerKey);
    if (have) return have;
    const n = B.nextChildN(reg.children, ownerKey);
    if (n > 999) throw namedError('cap', 'this conversation has minted 999 child handles — detach some');
    const handle = B.childHandleFor(ownerKey, n);
    reg.children[handle] = { parent: ownerKey, since: now(), sessionId: null, carrierLostAt: null, job: String(jobId) };
    commit();
    ensureTimer();
    log.log?.(`[browser] ${ownerKey}: job ${jobId} uses the conversation's browser as ${handle} (its own lease and window; released when the job ends)`);
    return handle;
  }
  /** READ-ONLY: the job's existing handle under this owner key, or null (the belt's identity — it never mints). */
  function findJobHandle({ ownerKey, jobId } = {}) { ensureLoaded(); return J.jobHandleOf(reg.children, jobId, ownerKey); }
  /** The job's id for a handle, or null (the trace names the job by id; its name is read live). */
  function jobOf(handle) { const c = reg.children[String(handle || '')]; return c && c.job ? String(c.job) : null; }
  /** THE RELEASE: every handle of this job — its leases detached (its window closes, a takeover of it ends), the handle
   *  dropped. At the run's finalize (src/jobs.js onRunEnded) and by the reconcile's evidence rule. → handles released. */
  function releaseJob(jobId, why = 'the job ended') {
    ensureLoaded();
    const mine = J.jobHandles(reg.children).filter((x) => x.jobId === String(jobId));
    for (const { handle } of mine) releaseJobHandle(handle, why);
    return mine.map((x) => x.handle);
  }
  function releaseJobHandle(handle, why) {
    for (const l of reg.leases.filter((x) => x.browserKey === handle)) {
      const closeWindow = jobWindowCloser(l, why); // accept-fixes-jobs F11: its holders read while its lease still stands
      // the job never comes back for its page (its handle goes below): no "left tab" is kept for it, its window closes
      if (closeWindow) { closeWindow().catch((e) => log.warn?.(`[browser] ${handle}: its window on ${l.profileId} not closed — ${e && e.message}`)); }
      try { detach({ profileId: l.profileId, browserKey: handle, by: 'user' }); } catch (e) { log.warn?.(`[browser] ${handle}: its lease on ${l.profileId} not detached — ${e && e.message}`); }
      const lt = reg.leftTabs && reg.leftTabs[l.profileId]; if (lt && lt[handle]) { delete lt[handle]; commit(); }
    }
    if (dropChild(handle)) log.log?.(`[browser] ${handle}: job handle released (${why})`);
  }
  /** accept-fixes-jobs F11 (the acceptance of 2.369.202: a stopped job's window stayed open in the shared profile — the
   *  detach keeps a conversation's page for its return, and a job never returns): THE JOB'S WINDOW CLOSES WITH ITS RUN.
   *  Its own tabs, by the ONE ownership rule its `tab list` reads (TBS.tabOwners over one CDP read, the holders as they
   *  stand BEFORE the detach), are closed over CDP — the window goes with its last tab; the user's tabs, another holder's
   *  and an orphan are never touched. A mediated lease's tabs close in its revoke; a browser not running has no window.
   *  → an async closer (→ tabs closed), or null. */
  function jobWindowCloser(l, why) {
    const p = profile(l.profileId); const rec = p ? reg.browsers[p.id] : null;
    if (!p || isEph(p) || isMediated(p) || !B.isLiveBrowser(rec) || !isLocalRec(rec) || !rec.cdpUrl) return null;
    const holders = tabHoldersOf(p.id), key = String(l.browserKey), cdp = rec.cdpUrl;
    return async () => {
      const targets = await tabTargetsOf(cdp);
      const own = targets ? TBS.ownSetOf(TBS.tabOwners({ targets, holders }), key) : null;
      if (!own) { log.warn?.(`[browser] ${key} on ${p.id}: its window could not be read (${why}) — its tabs are left to the browser's next start`); return 0; }
      let n = 0;
      for (const id of own) { try { const r = await (typeof closeTargetFn === 'function' ? closeTargetFn(cdp, id) : require('./browser-viewport.js').closeTarget(cdp, id)); if (!r || r.ok !== false) n++; } catch { /* gone already */ } }
      log.log?.(`[browser] ${key} on ${p.id}: the job's window closed — ${n} tab(s) (${why})`);
      return n;
    };
  }
  /** The live set every carrier rule reads: the live sessions' keys + the handles of RUNNING jobs. */
  function liveKeys() {
    const out = new Set();
    try { for (const k of sessionLiveKeys() || []) out.add(k); } catch { /* none */ }
    try { for (const h of J.carriedJobHandles(reg.children, jobRunning)) out.add(h); } catch { /* none */ }
    return out;
  }
  /** The attachment set of ONE conversation, derived from the registry. */
  function setFor(browserKey) {
    ensureLoaded();
    const bk = String(browserKey || '');
    return B.attachmentsFor({ leases: reg.leases, profiles: reg.profiles, browserKey: bk, pin: reg.pins[bk] || null, children: childrenOf(bk) });
  }
  /** Record what this session has NOW been told (its answer names the set).
   *  Persisted only when the fingerprint moved — every command tells, few
   *  change. Returns the view. */
  function tell(browserKey) {
    ensureLoaded();
    const bk = String(browserKey || '');
    const view = B.toldView(setFor(bk), now());
    const had = reg.told[bk];
    reg.told[bk] = view;
    if (!had || had.fingerprint !== view.fingerprint) save();
    return view;
  }
  // ── OWNER RULING A (2), RETIRED (lane browser-windows, 2026-10-01): no driver claim between conversations — each runs
  // its own daemon in windows of its own (measured, src/browser-windows.js); the only pause is the user's takeover of a
  // WINDOW. Who the user drives is the input side (`inputs`); a lease in the shared window of an older browser run is
  // taken WITH the one in that window the user took (`windowMatesOf`), never a lease in a window of its own.
  /** The conversation from whose live view the USER drives the window `exceptKey`'s lease is in (a window mate's view —
   *  only a lease still in an older run's shared window has one), else null. Never the asker's own takeover. */
  function userDrivingOf(profileId, exceptKey) {
    const me = B.parentKeyOf(String(exceptKey || ''));
    const mates = new Set(windowMatesOf(exceptKey, profileId).map((l) => B.parentKeyOf(l.browserKey)));
    for (const [k, s] of inputs) {
      if (!s || s.input !== 'user' || !k.endsWith('|' + profileId)) continue;
      // integration 2.369.192 (S2 × S5): a lease taken WITH another view's takeover names that view's conversation in `with`
      const bk = s.with || k.slice(0, k.length - profileId.length - 1);
      if (B.parentKeyOf(bk) !== me && mates.has(B.parentKeyOf(bk))) return { browserKey: bk };
    }
    return null;
  }
  /**
   * identity verify r4 (2026-09-28): does ANYTHING this keeper holds name the conversation key `bk` (its parent key —
   * a child handle names its parent)? The registry as a whole (a list row, a lease, a pin, a cap, `told`, a child
   * handle, a blocked claim, `tabClosed`, an ephemeral record's owner — every field, present and future: the whole
   * serialized store is scanned, not a hand-written list of its fields) plus the in-memory maps (the input
   * sides). The fresh-key rule (browser-profiles.freshBrowserKey) asks this at every mint so a key the store still
   * names — a stopped conversation's — is never handed to a new conversation. Unreadable ⇒ named (fail closed).
   */
  function keyNamed(bk) {
    ensureLoaded();
    const K = B.parentKeyOf(String(bk || ''));
    if (!B.isBrowserKey(K)) return false;
    const re = new RegExp('(^|[^0-9a-f])' + K.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![0-9a-f])');
    try { if (re.test(JSON.stringify(reg))) return true; } catch { return true; }
    for (const k of inputs.keys()) if (B.parentKeyOf(String(k).slice(0, String(k).indexOf('|'))) === K) return true;
    try { for (const e of ephemerals()) if (B.parentKeyOf(String(e.browserKey || '')) === K) return true; } catch { return true; }
    // lane browser-resume (§3.9): a KEPT browser is its conversation's until it ends — a fresh key never lands on it
    try { const ks = keptStore(); if (ks && ks.has(K)) return true; } catch { return true; }
    return false;
  }
  /**
   * WHICH browser a command issued through the CLI acts on (§3.7), after
   * §3.8 layer ①'s check: if the set's fingerprint moved since this session
   * was last told, the command is refused ONCE with `profile_changed` (was →
   * now) and the session is told; every other outcome is `resolveHandle`'s.
   * Never throws: the answer is a typed verdict the route maps to a status.
   */
  function resolveFor({ browserKey, handle = '', subagent = false, verb = null } = {}) {
    ensureLoaded();
    const bk = String(browserKey || '');
    const set = setFor(bk);
    const changed = B.blindnessVerdict({ told: reg.told[bk] || null, set });
    tell(bk);
    if (changed) { log.log?.(`[browser] ${bk}: refused once with profile_changed (${changed.was ? (changed.was.default || 'no default') : 'unknown'} → ${changed.now.default || 'no default'})`); return changed; }
    const v = B.resolveHandle({ set, handle, subagent });
    // P3 (§4.3): while the user drives THIS browser the command is refused
    // with the typed `browser_paused` — the agent reads who took over and
    // when instead of guessing (the `tab_gone` rule). A child handle is its
    // own browser and is never paused by its parent's takeover.
    if (v.ok && v.kind !== 'child') {
      // P4 (§7.4): mid-switch the gap is a NAMED refusal, not a timeout
      if (v.kind === 'attachment' && switching.has(v.attachment.profileId)) { const rr = SW.restartingRefusal(profile(v.attachment.profileId)); return { ...rr, handles: v.handles || [] }; }
      const paused = pausedVerdictFor(bk, v.kind === 'attachment' ? v.attachment.profileId : null, { handles: v.handles || [], verb }); // the refused verb goes on the handback's re-run list
      if (paused) { log.log?.(`[browser] ${bk}: refused with browser_paused (the user drives${v.kind === 'attachment' ? ' ' + v.attachment.profileId : ' the ephemeral browser'})`); return withOpenRequest(paused, bk, v.kind === 'attachment' ? v.attachment.profileId : null); }
      { const asked = askedVerdictFor(bk, v.kind === 'attachment' ? v.attachment.profileId : null, { handles: v.handles || [] }); if (asked) { log.log?.(asked.request ? `[browser] ${bk}: refused with human_asked (request ${asked.request.id} waits for a person)` : `[browser] ${bk}: refused with ${asked.code} (the takeover requests could not be read)`); return asked; } } // lane browser-takeover-queue
      // lane browser-windows: no `browser_busy` between conversations any more (owner ruling A (2) retired) — another
      // conversation's agent works in its OWN window of this browser and never holds this one up (measured: one daemon each)
    }
    // MULTIVIEW §4: a helper's browser is watchable and can be taken over in the
    // live view — then IT is paused (keyed by the child handle), never by its parent's takeover
    if (v.ok && v.kind === 'child') {
      const paused = pausedVerdictFor(v.handle, null, { handles: v.handles || [], verb });
      if (paused) { log.log?.(`[browser] ${v.handle}: refused with browser_paused (the user drives this helper's browser)`); return paused; }
    }
    return v;
  }
  /** A child handle for a sub-agent (§3.7 / D23): `bk-<parent>.<n>`, recorded
   *  under the parent so the parent's teardown reaps it. */
  function newChild({ browserKey, sessionId = null } = {}) {
    refuseIfHeld('a helper\'s browser');   // the B-f276 remainder: refused by name while the registry is held (nothing minted, nothing written)
    ensureLoaded();
    if (!B.isBrowserKey(browserKey)) throw namedError('bad-request', 'a child handle needs its parent\'s browser key');
    const n = B.nextChildN(reg.children, browserKey);
    if (n > 999) throw namedError('cap', 'this conversation has minted 999 child handles — detach some');
    const handle = B.childHandleFor(browserKey, n);
    reg.children[handle] = { parent: browserKey, since: now(), sessionId: sessionId || null, carrierLostAt: null };
    commitSync();
    ensureTimer();
    log.log?.(`[browser] ${browserKey}: child handle ${handle} minted (its own ephemeral browser; reaped with the parent)`);
    return { handle, parent: browserKey, n };
  }
  function dropChild(handle) {
    ensureLoaded();
    if (!reg.children[handle]) return false;
    delete reg.children[handle];
    for (const l of reg.leases) if (l.browserKey === handle) noteLeftTab(l.profileId, handle); // verify r3: a helper's page stays on a named profile
    reg.leases = reg.leases.filter((l) => l.browserKey !== handle);
    commit();
    for (const p of reg.profiles.filter((x) => isEph(x) && x.owner.id === handle)) retireEphemeral(p.id, 'child handle dropped').catch(() => { });
    return true;
  }
  /** §3.7's audit: `{at, sessionId, browserKey, profileId, verb, ok}` and
   *  nothing else — never a `fill`'s content. Append-only, best-effort. */
  function audit({ sessionId = null, browserKey = null, profileId = null, verb = null, ok = true } = {}) {
    const line = B.auditLine({ at: now(), sessionId, browserKey, profileId, verb: B.auditVerbOf(Array.isArray(verb) ? verb : [verb]), ok });
    // lane browser-resume (D2): the agent's own `close` of its conversation's browser is a DELIBERATE stop (the tick may
    // already have recorded the daemon gone — the store re-words that stop)
    if (ok && profileId && String(Array.isArray(verb) ? verb[0] : verb) === 'close') { const pe = profile(profileId); if (pe && isEph(pe) && B.isBrowserKey(pe.owner.id) && B.parentKeyOf(String(browserKey || '')) === pe.owner.id) { try { keptStore()?.noteDeliberate?.(pe.owner.id, 'agent'); } catch { /* the store says its own */ } } }
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.appendFileSync(path.join(dataDir, AUDIT_FILE), line + '\n', { mode: FILE_MODE }); }
    catch (e) { log.warn?.(`[browser] audit line not written: ${e.message}`); }
    return line;
  }
  /**
   * "New persistent profile from this session's current browser" (§3.2.5):
   * ADOPT = move the browserKey-named scratch directory (rung C) under
   * ~/.agent-browser/ as a registered profile, the login kept in place. The
   * caller re-points the session's indirection afterwards (that is the pin
   * path, borrowed). Refused with the reason when the move cannot happen.
   */
  function adoptScratch({ label, scratchDir, owner = null, createdBy = null, use = null, knownKeys = null, onMoved = null } = {}) {
    refuseIfHeld('adopting a browser folder');   // the B-f276 remainder: refused by name while the registry is held (nothing minted, nothing written)
    ensureLoaded();
    const v = B.validateProfileInput({ label }, { existing: named() });
    if (!v.ok) throw namedError(v.code, v.error);
    const useRow = use != null ? rowFromUse(use, { knownKeys, label: v.value.label }) : B.rowForCreate(owner, { conversationOf: conversationOfKey }); // lane browser-admin: judged before the directory moves (lane grants-unify: the store's row)
    let st = null;
    try { st = fs.statSync(scratchDir); } catch { /* below */ }
    if (!st || !st.isDirectory()) throw namedError('adopt_failed', `this session's browser directory ${scratchDir} does not exist — nothing to adopt (the browser never launched, or it is on the ephemeral rung)`);
    const id = mintId();
    const target = path.join(homeDir, '.agent-browser', B.profileDirName(id));
    // the move cannot happen ⇒ refused NOW, nothing recorded (a folder on another filesystem is judged before the record is made)
    try { fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); if (fs.statSync(path.dirname(target)).dev !== fs.statSync(path.dirname(scratchDir)).dev) throw Object.assign(new Error('different filesystems'), { code: 'EXDEV' }); }
    catch (e) { throw namedError('adopt_failed', `could not move ${scratchDir} to ${target}: ${e.message}${e.code === 'EXDEV' ? ' (different filesystems — create a new profile and log in again instead)' : ''}`); }
    const rec = B.newProfileRecord({ id, ...v.value, dir: target, owner, legacy: false, now: now(), createdBy });
    reg.profiles.push(rec);
    bornWithRow(rec, useRow, 'user');   // lane grants-unify
    commit();
    // lane lg-store-writes (the moved2 cure 2's hunt (4) — THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING): the folder MOVES and the
    // conversation's kept entry ends (`onMoved`) only once the new record is ON DISK — a kill first leaves the old record, the folder
    // where it was and its kept entry: the adopt simply did not happen, and can be asked again. A move that fails at the landing
    // takes the record out again (it never had its folder) and says so
    adopting.add(id);   // no start of it until its folder moved (start refuses `adopt_pending`)
    const landing = rideLanding(() => {
      adopting.delete(id);
      try { fs.renameSync(scratchDir, target); }
      catch (e) {
        log.warn?.(`[browser] profile ${id} "${rec.label}": its folder could not be moved from ${scratchDir} (${e.message}) — the record goes again; the conversation's browser keeps its folder`);
        reg.profiles = reg.profiles.filter((x) => x.id !== id);
        // the moved2 census: the record's removal LANDS before its grant row goes (a kill between never leaves a record nobody may use) —
        // the census cure ((b)): not landed at the bound ⇒ the row goes AT the landing, never before it
        const dropRow = () => { try { const g = grantsOf(); if (g) g.remove('browser-profile', id, 'user'); } catch { /* the row of a gone record admits nobody */ } };
        if (commitSync()) dropRow(); else rideLanding(dropRow, { what: `profile ${id}'s failed adoption`, timeoutMs: null });
        // (the moved2 cure 3: a late failure is BROADCAST — commit() above republishes the list without it — and said in the log line)
        return { moved: false, error: `could not move ${scratchDir} to ${target}: ${e.message}` };
      }
      try { fs.chmodSync(target, 0o700); } catch { /* best effort */ }
      log.log?.(`[browser] profile ${id} "${rec.label}" ADOPTED from ${scratchDir} → ${target} (usable by ${whoWords(rec)}${rec.createdBy ? ', created by ' + rec.createdBy : ''})`);
      if (typeof onMoved === 'function') { try { onMoved(); } catch (e) { log.warn?.(`[browser] profile ${id}: the adopt's follow-up failed — ${e && e.message}`); } }
      return { moved: true };
    }, { what: `profile ${id}'s adopt` });
    const view = B.publicProfileView(rec);
    Object.defineProperty(view, 'landing', { value: landing, enumerable: false });   // a caller awaits it (not a field of the answer)
    return view;
  }

  // ── P4 second half (§7.4): the live backend switch, the agent's `blocked` claim, per-site memory ──
  const usableExe = (f) => { try { fs.accessSync(f, fs.constants.X_OK); return fs.statSync(f).isFile(); } catch { return false; } };
  const whichOnPath = (name) => { for (const d of String(env().PATH || process.env.PATH || '').split(':')) { if (!d) continue; const f = path.join(d, name); if (usableExe(f)) return f; } return null; };
  // ── THE ENFORCED BOUNDARY of a wrapped browser (lane engine-spi-egress) ──
  // ONE allowlisting proxy PER PROFILE (verify r1 V1 of lane browser-propose: a refusal must reach the agent whose
  // browser was refused — and only it; one shared proxy could not say whose request it refused), started at a wrapped launch.
  // r2 (主开发's acceptance): its PORT rides the browser record (`rec.egress`, persisted beside the launch view that names it) —
  // a browser SURVIVES a hub restart, so the boot that adopts it re-binds THAT port before it is ready (adoptAll / bootReown →
  // egressAdopt), never another; a port another program holds ⇒ the browser is ended by identity and said by name (never left
  // behind a dead or a foreign proxy); a new proxy never takes a port a live record names; a stop / a removal frees it. WHOSE list it admits is the
  // entry's `of`, re-read per request: an ENGINE declaring `egress-allowlist` = its reserved row `plugin.<id>.egressAllowlist`
  // (the stored value, else its manifest's default), the arguments appended by the keeper itself (src/browser-engines.js
  // engineArgs). Loopback / link-local is never admitted (egressVerdict).
  const EgressProxy = require('./egress-proxy');
  const egressProxies = new Map(); // profile id → {px, of} — its egress proxy and whose list it admits (`of` names the engine)
  const engineSites = (of) => { const r = readSetting(of.setting); if (r.held && !r.known) return ''; const v = r.v; return typeof v === 'string' ? v : String(of.fallback || ''); };   // B-50e7: held, nothing known ⇒ no site (the narrower side)
  /** a host through a profile's egress proxy → the verdict (B-50e7: an engine's list unread while held ⇒ refused naming the hold, nothing of the list) */
  const egressAllow = (of, h) => (of && of.setting ? (sitesUnread(of) ? { allow: false, why: HELD_EGRESS_WHY } : B.egressVerdict(h, egressListOf(of))) : B.profileProxyVerdict(h));
  const sitesUnread = (of) => { const r = of && of.setting ? readSetting(of.setting) : null; return !!(r && r.held && !r.known); };
  const HELD_EGRESS_WHY = 'VibeSpace\'s settings cannot be read right now — this plugin reaches no address until they read';   // r3443 hold 4: nothing of the list
  const egressListOf = (of) => B.parseEgressAllowlist(engineSites(of));
  const egressName = (of) => ENG.engineWords({ id: of.engine, label: of.label });
  async function egressUrlFor(profileId, of, { port = 0 } = {}) {
    const k0 = String(profileId || '');
    const have = egressProxies.get(k0);
    if (have && have.px.port() && (!port || have.px.port() === port)) { have.of = of; return have.px.url(); }
    const ent = { px: null, of };
    const w = egressWho(of), extra = { engine: of.engine };
    // r2: `port` = the one a surviving browser's launch view names (adoption) — that port or a refusal, never another; a NEW proxy
    // (port 0) never keeps a port another live record names (that browser's proxy is re-bound on it at its adoption)
    const named = new Set(Object.values(reg.browsers).filter((r) => r && r.egress && Number.isInteger(r.egress.port) && String(r.profileId) !== k0 && B.isLiveBrowser(r)).map((r) => r.egress.port));
    let px = null;
    for (let i = 0; i < 8 && !px; i++) {
      const c = EgressProxy.create({ allowlist: () => egressListOf(ent.of), allow: (h) => egressAllow(ent.of, h), upstream: () => proxyUpstreamOf(k0, ent.of), log, ...(egressResolve ? { resolve: egressResolve } : {}) });
      try { await c.listen({ port }); } catch (e) {
        if (port && e && e.code === 'EADDRINUSE') throw namedError('egress_proxy_missing', `its allowlisting egress proxy cannot listen on its port ${port} again — another program holds it, and ${w} is never left behind a proxy that is not its own`, { ...extra, port });
        throw namedError('egress_proxy_missing', `the allowlisting egress proxy for ${w} could not listen (${e && e.message}) — ${w} is never started without it`, extra);
      }
      if (!port && named.has(c.port())) { c.close().catch(() => {}); continue; }
      px = c;
    }
    if (!px) throw namedError('egress_proxy_missing', `the allowlisting egress proxy for ${w} found no free port — ${w} is never started without it`, extra);
    ent.px = px;
    if (have && port) { egressProxies.delete(k0); have.px.close().catch(() => {}); }
    const raced = egressProxies.get(k0); // two starts of one profile raced the listen: the first proxy stays the one
    if (raced && raced.px.port()) { raced.of = of; px.close().catch(() => {}); return raced.px.url(); }
    egressProxies.set(k0, ent);
    log.log?.(`[browser] egress proxy of ${w} for ${k0 || '?'} on ${px.url()} — admits: ${of.setting ? (sitesUnread(of) ? 'nothing while the settings cannot be read' : ((n) => (n ? `${n} site${n === 1 ? '' : 's'} of its list (an address list is private: never named here)` : `nothing (no sites in ${of.setting})`))(egressListOf(of).length)) : 'every name but loopback'}${of.proxy ? ` — through ${of.proxy.scheme}://${of.proxy.host}:${of.proxy.port}${of.proxy.credential ? ' with its login from the vault' : ''}` : ''}`);
    return px.url();
  }
  /** r2: what a launch RECORDS of its proxy (`rec.egress`, persisted with the record): the port its launch view names + whose list
   *  (an engine's reserved row) — what the boot needs to re-bind it. null = this profile has none. */
  function egressRecordOf(profileId) {
    const e = egressProxies.get(String(profileId || ''));
    if (!e || !e.px.port()) return null;
    return { port: e.px.port(), engine: String(e.of.engine || ''), label: String(e.of.label || ''), setting: String(e.of.setting || ''), fallback: String(e.of.fallback == null ? '' : e.of.fallback), ...(e.of.proxy ? { proxy: proxyOfRecord(e.of.proxy) } : {}) };   // B-8b87: + the profile's proxy (the address and the vault entry's NAME — never the secret)
  }
  const proxyOfRecord = (x) => (x && B.PROXY_SCHEMES.includes(x.scheme) && x.host && Number.isInteger(x.port) ? { scheme: x.scheme, host: String(x.host), port: x.port, credential: B.parseProxyLoginName(x.credential) ? String(x.credential) : '' } : null);
  const egressOfRecord = (e) => ({ engine: String(e.engine || ''), label: String(e.label || ''), setting: String(e.setting || ''), fallback: String(e.fallback || ''), ...(proxyOfRecord(e.proxy) ? { proxy: proxyOfRecord(e.proxy) } : {}) });
  /** r2: THE ADOPTION of a wrapped browser — its proxy listening again on the port its record names (the list read live as before,
   *  its refusals this profile's) → `{ok:true}` | `{ok:false, port, error}` (the port is another program's: never rebound elsewhere). */
  async function egressAdopt(rec) {
    const e = rec && rec.egress;
    if (!e || !Number.isInteger(e.port) || e.port <= 0) return { ok: true };
    const have = egressProxies.get(String(rec.profileId));
    if (have && have.px.port() === e.port) return { ok: true };
    try { await egressUrlFor(rec.profileId, egressOfRecord(e), { port: e.port }); return { ok: true }; }
    catch (err) { return { ok: false, port: e.port, error: String((err && err.message) || err) }; }
  }
  /** …and its refusal said: the journal, and ONE For-you line for a named profile (a conversation's browser is said to its agent
   *  at its next start — the record's lastError). */
  function egressNotice(rec, p, eg) {
    log.warn?.(`[browser] ${rec.profileId} "${p ? p.label : ''}": not adopted at the restart — ${eg.error}`);
    if (!p || isEph(p) || !userTodos || typeof userTodos.add !== 'function') return;
    try { userTodos.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', text: `"${p.label}" was stopped at the restart: its egress proxy's port ${eg.port} is in use`, detail: `${eg.error}. VibeSpace ended that browser rather than let anything else answer for it. Start it again — it gets a new proxy and keeps its site list.`, sessionName: 'Agent browser' }); }
    catch (e) { log.warn?.(`[browser] ${rec.profileId}: the egress notice was not filed (${e && e.message})`); }
  }
  /** A record removed ⇒ its proxy closed (removeProfile). */
  function dropEgress(profileId) { const k0 = String(profileId || ''), e = egressProxies.get(k0); proxyCreds.delete(k0); if (!e) return; egressProxies.delete(k0); e.px.close().catch(() => {}); }   // B-8b87: its login leaves memory with it
  // ── THE EXIT CHECK (the owner 2026-11-17 «A就行» — PURE rules src/browser-exit.js; its one request src/server/browser-exit-check.js).
  // A person presses «Check the exit…»: the profile's proxy EXIT read through ITS OWN forwarder from the owner's check address
  // (`browser.exitCheckUrl`), NOTHING kept until the person confirms (keepEgress); never a timer, never a launch.
  const EXIT = require('../browser-exit.js');
  const EXC = require('./browser-exit-check.js');
  const egressHandOf = (e) => ({ publicIp: String(e.publicIp || ''), country: String(e.country || ''), timezone: String(e.timezone || ''), checkedAt: Number(e.checkedAt) || 0, source: e.source === 'measured' ? 'measured' : 'typed' });
  /** → { ok: true, read: { publicIp, country, timezone } } | { ok: false, code, error, kind? }. Refused by name: no proxy of its own
   *  (its browser may leave by another road — the person's own browser config, the launch's environment, the tailnet — so a direct
   *  check could state an exit it does not use; a wrong exit handed to an engine is worse than none), no check address set (the dialog
   *  shows the field), the proxy's own refusals (the same as a launch's — a locked vault included). */
  async function exitCheck(profileId, { tlsConnect = null, deadlineMs = null } = {}) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p || isEph(p)) return { ok: false, code: 'not-found', error: `no profile ${profileId}` };
    // a profile whose browser the hub does NOT start: that browser leaves by its own settings — refused like no proxy, before anything
    // else is asked (no check address, no vault)
    const prow = rowOf(p.provider);
    if (prow && !prow.starts) return { ok: false, code: 'exit_external_browser', error: `"${p.label}" attaches to a browser VibeSpace does not start — that browser leaves by its own settings, so a check here could state an exit it does not use. Type the exit by hand if a plugin needs it` };
    if (!p.proxy) return { ok: false, code: 'exit_no_proxy', error: `"${p.label}" has no proxy of its own — its browser may leave by another road (your own browser config, the launch's environment, the tailnet), so a check here could state an exit it does not use. Type the exit by hand if a plugin needs it` };
    { const r = readSetting(EXIT.EXIT_URL_KEY); if (r.held && !r.known) return { ok: false, status: 503, code: 'browser_settings_unread', error: 'the exit check\'s address cannot be read right now — VibeSpace\'s settings are held; nothing was checked or kept: check again once they read' }; }   // B-50e7 (a person\'s press, refused by name: its one address is unread)
    const url = EXIT.checkUrlVerdict(readSetting(EXIT.EXIT_URL_KEY).v);
    if (!url.ok) return { ok: false, code: url.code, error: url.error };
    if (!url.value) return { ok: false, code: 'exit_url_unset', error: 'no exit check address is set — give one (an https address you trust) and check again, or type the exit by hand' };
    // the launch's own verdict on the stored proxy (a password in the address, socks4, a paired machine, a login saved for another proxy)
    const v = B.proxyLaunchVerdict(p);
    if (!v.ok) return { ok: false, code: v.code, error: v.error, ...(v.code === 'proxy_password_in_profile' && v.profileId ? { profileId: v.profileId } : {}) };   // B-7aef: the profile's id, as the launch's refusal carries it
    const px0 = v.proxy;
    const k0 = String(p.id), have = egressProxies.get(k0), rec = reg.browsers[k0];
    // 主开发 17:04Z: a RUNNING browser is measured only through the road it runs on — its own forwarder is THIS proxy WITH THIS login;
    // any other running state is restart-first. 17:56Z: this comparison comes BEFORE any vault read.
    if (rec && B.isLiveBrowser(rec)) {
      const hp = have && have.px.port() && have.of && have.of.proxy;
      if (!hp || hp.scheme !== px0.scheme || hp.host !== px0.host || hp.port !== px0.port || String(hp.credential || '') !== String(px0.credential || '')) return { ok: false, code: 'exit_restart_first', error: `"${p.label}"'s browser runs on another road than its proxy now names (the address or its login changed since it started, or it started without it) — restart it, then check the exit` };
    }
    // 主开发 17:56Z: THE LOGIN THE CHECK READS IS THE CHECK'S OWN — read into this call alone (the person's press, a use noted), never into
    // the entry a running browser's forwarder asks per request; it leaves memory with the check
    let auth = null;
    if (px0.credential) {
      const r = proxyLogins && typeof proxyLogins.read === 'function' ? proxyLogins.read(px0.credential, { by: 'human', purpose: `the exit check of browser profile ${k0}` })
        : { ok: false, error: 'this server has no vault for browser proxy logins', word: 'vault_not_set_up' };
      if (!r.ok) return { ok: false, code: 'proxy_credential_unreadable', error: `"${p.label}"'s exit was not checked — ${r.error}`, word: r.word || null };
      auth = { user: r.user, pass: r.pass };
    }
    // the check's OWN forwarder (one per press, never registered): the same upstream — this proxy with this login — admitting its ONE host
    // only (the check address's name); no engine's site list judges it or records its host; what it opens it closes on every path
    const checkHost = new URL(url.value).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const px = EgressProxy.create({ allow: (h) => (String(h || '').toLowerCase() === checkHost ? { allow: true } : { allow: false, why: 'the exit check reaches its one address only' }), upstream: () => ({ scheme: px0.scheme, host: px0.host, port: px0.port, ...(auth ? { auth } : {}) }), tag: 'exit-check', log: { log() { }, warn() { } } });
    try {
      const port = await px.listen();
      const r = await EXC.requestThrough({ url: url.value, forwarder: `http://127.0.0.1:${port}`, ...(tlsConnect ? { tlsConnect } : {}), ...(Number(deadlineMs) > 0 ? { deadlineMs: Number(deadlineMs) } : {}) });
      if (!r.ok) return r;
      const a = EXIT.readExitAnswer(r);
      return a.ok ? { ok: true, read: a.read } : { ok: false, code: 'exit_answer_unreadable', kind: a.kind, ...(a.kind === 'status' ? { status: r.status } : {}), error: a.said };
    } catch (e) { return { ok: false, code: e.code || 'exit_check_failed', error: String((e && e.message) || e) }; }
    finally { auth = null; await px.close({ cut: true }).catch(() => { }); }
  }
  /** The person's confirm (what was read, each field editable — or typed by hand) → kept on the profile under the hand-over's own
   *  names; `{ clear: true }` forgets it. The zone is validated by the runtime's own formatter (an offset or an abbreviation refused). */
  function keepEgress(profileId, input = {}) {
    return batched(() => {
      ensureLoaded();
      const p = profile(profileId);
      if (!p || isEph(p)) return { ok: false, code: 'not-found', error: `no profile ${profileId}` };
      if (input && input.clear === true) { if (p.egress) { delete p.egress; commitSync(); } return { ok: true, profile: pview(p) }; }
      const v = EXIT.egressRecordOf(input || {}, { now: now() });
      if (!v.ok) return v;
      p.egress = v.value;
      commitSync();
      log.log?.(`[browser] ${p.id}: its exit kept (${v.value.source})`);
      return { ok: true, profile: pview(p) };
    });
  }
  /** B-9584 U3 — THE PROFILE's ENVIRONMENT IS SET HERE ALONE: the person's save in the profile's «Environment…» dialog (the route
   *  refuses every bearer; no CLI verb, no agent verb). The setting judged WHOLE (ENV.environmentVerdict — each refusal by its own
   *  name); r2172 (a) where it is set: a place or «blocked» on a conversation's own browser or a paired machine's is refused by name
   *  (neither has the stored denial nor the hold: its sites would read that machine's real position); r2311: a list of sites on an
   *  ENGINE's profile is refused by name (its kernel gives the place to every site). Kept canonical (all «this machine's» ⇒ nothing
   *  kept); a running browser takes it at its NEXT start (decision 5a): the answer says `restartNeeded`, the dialog offers the restart. */
  function setEnvironment(profileId, input = {}) {
    return batched(() => {
      ensureLoaded();
      const p = profile(profileId);
      if (!p) return { ok: false, code: 'not-found', error: `no profile ${profileId}` };
      if (!input || typeof input !== 'object' || !Object.prototype.hasOwnProperty.call(input, 'environment')) return { ok: false, code: 'env_invalid', error: 'the environment is missing' };
      const v = ENV.environmentVerdict(input.environment);
      if (!v.ok) return { ok: false, code: v.code, error: v.error };
      const next = v.value || null;
      const engine = !!(p.browser && p.browser.kind === 'plugin');
      const g = next ? ENV.resolveEnvironment(next, ENV.keptExitOf(p)).geolocation : null;
      if (g && !engine && (isEph(p) || p.host)) return { ok: false, code: 'browser_place_unsupported', error: `a place or a blocked location is held only on a named profile of this machine's browser — on ${isEph(p) ? 'a conversation\'s own browser' : 'a paired machine'} its sites would read that machine's real position` };
      const sites = next && next.location && Array.isArray(next.location.sites) ? next.location.sites : [];
      if (sites.length && engine) return { ok: false, code: 'env_sites_engine', error: 'an engine\'s profile gives its place to every site (its kernel holds it) — a list of sites is kept only on this machine\'s own browser' };
      if (JSON.stringify(p.environment || null) === JSON.stringify(next)) return { ok: true, changed: false, restartNeeded: false, profile: pview(p) };
      if (next) p.environment = next; else delete p.environment;
      commit();   // r2767 (d): no next step needs it on disk (the browser reads it at its next start) — a person's press on a folder that may sit on a mount
      const rec = reg.browsers[p.id];
      const restartNeeded = !!(rec && (rec.state === 'ready' || rec.state === 'starting'));
      log.log?.(`[browser] ${p.id}: its environment set — ${JSON.stringify(ENV.environmentLogView(next || {}))}${restartNeeded ? ' (at its next start)' : ''}`);   // the log view: no place, no origin
      return { ok: true, changed: true, restartNeeded, profile: pview(p) };
    });
  }
  // ── B-8b87 (lane cli-update-needs-nothing): A PROFILE'S PROXY REACHES ITS BROWSER — THE LAW: a field the form validates reaches the
  // process it names. ONE road for every profile proxy: this profile's forwarder above (src/server/egress-proxy.js), its upstream =
  // the profile's proxy, the browser handed only its loopback port (`rec.proxyRoad.arg` on the driver's derived config and the
  // attach argv; an engine's own egress pair). Its LOGIN is read from the vault by the forwarder alone (proxyLogins.read — a use
  // noted with the launch's actor) and held HERE, in memory only: never on an argv, in an env, in a config file or a record.
  const proxyCreds = new Map();   // profile id → { ref, user, pass } | { ref, refused: { code, sentence, word }, at }
  const egressWho = (of) => (of && of.engine ? egressName(of) : `the proxy of "${(of && of.label) || '?'}"`);
  function readProxyCredential(profileId, ref, { by = 'system', conv = null, actor = null } = {}) {
    const k0 = String(profileId || '');
    const r = proxyLogins && typeof proxyLogins.read === 'function' ? proxyLogins.read(ref, { by, conv, actor, purpose: `the proxy of browser profile ${k0}` })
      : { ok: false, error: 'this server has no vault for browser proxy logins', word: 'vault_not_set_up' };
    const c = r.ok ? { ref, user: r.user, pass: r.pass } : { ref, refused: { code: 'proxy_credential_unreadable', sentence: r.error, word: r.word || null }, at: now() };
    proxyCreds.set(k0, c);
    return c;
  }
  /** The forwarder's upstream (asked per request): null | { scheme, host, port, auth? } | { refused } — a forwarder re-bound at a
   *  boot reads the login again (the hub's own use), at most every 30 s while the vault stays locked; meanwhile every request is
   *  answered with the vault's sentence — the browser is never sent direct. */
  function proxyUpstreamOf(profileId, of) {
    const px = of && of.proxy;
    if (!px || !px.scheme) return null;
    const up = { scheme: px.scheme, host: px.host, port: px.port };
    if (!px.credential) return up;
    let c = proxyCreds.get(String(profileId || ''));
    if (!c || c.ref !== px.credential || (c.refused && now() - c.at > 30000)) c = readProxyCredential(profileId, px.credential, { by: 'system' });
    return c.refused ? { refused: c.refused } : { ...up, auth: { user: c.user, pass: c.pass } };
  }
  /** THE LAUNCH'S STEP (every road asks it before anything starts): the verdict (refused BY NAME — a password still in the profile, a
   *  socks4 address, a paired machine, a login saved for another proxy), the login read (a locked vault / a name the vault holds
   *  nothing under ⇒ the launch is refused with the vault's own word — never a direct connection) → the forwarder's `of`, or null. */
  async function profileProxyFor(p, { why = null, browserKey = null, starts = true } = {}) {
    const v = B.proxyLaunchVerdict(p);
    // B-7aef (主开发 r2863): the verdict's profile id rides the refusal (a password still in the address: the page's press is that
    // profile's own move) — the id alone, the code's own; the route hands it to a person's page only (routes/browser.js fail)
    if (!v.ok) throw namedError(v.code, v.error, v.code === 'proxy_password_in_profile' && v.profileId ? { profileId: v.profileId } : {});
    if (v.proxy && !starts) throw namedError('proxy_external_browser', `"${p.label}" attaches to a browser VibeSpace does not start — that browser keeps its own proxy settings; clear this profile's proxy, or set it in that browser`);
    if (!v.proxy) { proxyCreds.delete(String(p.id)); return null; }
    if (v.proxy.credential) {
      const by = browserKey ? 'agent' : (why === 'user' || why === BROWSE_WHY ? 'human' : 'system');
      const c = readProxyCredential(p.id, v.proxy.credential, { by, conv: browserKey ? String(browserKey) : null, actor: browserKey ? 'a conversation' : null });
      if (c.refused) throw namedError('proxy_credential_unreadable', `"${p.label}" was not started — ${c.refused.sentence}`, { word: c.refused.word || null });
    } else proxyCreds.delete(String(p.id));
    return { label: p.label, proxy: { scheme: v.proxy.scheme, host: v.proxy.host, port: v.proxy.port, credential: v.proxy.credential || '' } };
  }
  /** «Move the password to the vault» — the profile card's ONE press (a person's: src/routes/vault.js person()). An address saved
   *  WITH its user name and password (before the proxy law) → the vault's proxy-login entry, the row rewritten to the address alone
   *  + that entry, the password gone from the profiles store — one act, the vault first (a locked vault changes nothing). */
  function moveProxyPassword(profileId) {
    return batched(() => {
      ensureLoaded();
      const p = profile(profileId);
      if (!p || isEph(p)) return { ok: false, code: 'not-found', error: `no profile ${profileId}` };
      const m = /^([a-z0-9]+):\/\/([^@/\s]+)@(.+)$/i.exec(String(p.proxy || ''));
      if (!m) return { ok: false, code: 'nothing_to_move', error: `"${p.label}"'s proxy carries no password` };
      const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
      const cut = m[2].indexOf(':');
      const user = dec(cut >= 0 ? m[2].slice(0, cut) : m[2]), password = dec(cut >= 0 ? m[2].slice(cut + 1) : '');
      const addr = B.normalizeProxy(`${m[1]}://${m[3]}`);
      if (!addr.ok) return { ok: false, code: addr.code || 'bad_proxy', error: `"${p.label}"'s proxy cannot be moved as it is — ${addr.error}` };
      if (!password) return { ok: false, code: 'nothing_to_move', error: `"${p.label}"'s proxy names a user but no password — choose its login in the profile` };
      if (!B.proxyLoginName(addr.value, user)) return { ok: false, code: 'proxy_user_unusable', error: `"${p.label}"'s proxy user name cannot name a vault entry (a space, a # or over 128 characters) — choose its login in the profile` };   // round 3
      const r = proxyLogins && typeof proxyLogins.save === 'function' ? proxyLogins.save({ proxy: addr.value, user, password }) : { ok: false, code: 'unavailable', error: 'this server has no vault for browser proxy logins' };
      if (!r.ok) return r;
      const was = { proxy: p.proxy, proxyCredential: p.proxyCredential };
      p.proxy = addr.value; p.proxyCredential = r.name;
      // B-8b87 cure: the write ASKED — the moved2 census (its keeper pass: save() only marks now, so this guard was dead): the write is
      // LANDED (bounded) first; a FAILED write (the storage refused it) is the cure's road — the row put back (the writer's retry then
      // writes what memory holds), the vault entry kept, not_written said; a write HELD past the bound is not a failed one: nothing put
      // back, the answer says it finishes by itself
      const landed = save() !== false && landNow();
      const failed = !landed && (() => { const nd = typeof writerOf().whyNotDurable === 'function' ? writerOf().whyNotDurable(storeKey) : null; return !!(nd && nd.why === 'failed'); })();
      if (failed) { p.proxy = was.proxy; p.proxyCredential = was.proxyCredential; save(); log.warn?.(`[browser] ${p.id} "${p.label}": its proxy's password is in the vault (${r.name}), but the profiles store could not be written — it still holds the password`); return { ok: false, code: 'not_written', credential: r.name, error: `"${p.label}"'s proxy login is saved in the vault, but the profiles store could not be written — it still holds the password; press «Move the password to the vault» again` }; }
      notify();
      log.log?.(`[browser] ${p.id} "${p.label}": its proxy's password moved to the vault (${r.name}) — the profiles store no longer holds it${landed ? '' : ' (once the storage answers: not on disk yet)'}`);
      return { ok: true, profile: pview(p), credential: r.name, ...(landed ? {} : { notOnDisk: true, code: 'finishes-on-landing' }) };
    });
  }
  /** What ONE profile's wrapped browser may reach right now and what was refused (no secrets): its proxy's url, the list it
   *  admits, the sites its row names, the counts and the last refusals; nothing for a profile with no proxy. */
  function egressFor(profileId = null) {
    const e = profileId != null ? egressProxies.get(String(profileId)) || null : null;
    const of = e ? e.of : null;
    const px = e && e.px.port() ? e.px : null;
    return { url: px ? px.url() : null, allowlist: of ? egressListOf(of) : [], sites: of ? B.parseEgressAllowlist(engineSites(of)) : [], stats: px ? { allowed: px.stats.allowed, refused: px.stats.refused, errors: px.stats.errors } : null, recent: px ? px.recent().slice(-20) : [], ...(of ? { engine: of.engine } : {}) };
  }
  /** lane engine-spi-egress: the ENGINE a profile's proxy wraps (`{id, label}`; null = none) — the verb answer names its site
   *  list by it. */
  function egressEngineOf(profileId) { const e = egressProxies.get(String(profileId || '')); return e ? { id: e.of.engine, label: e.of.label || '' } : null; }
  /** verify r1 V1: the hosts THIS profile's wrapped browser was refused at or after `since` (a verb's start) — by name,
   *  deduplicated, bounded; what the agent's verb answer carries so it can ask for exactly those sites. */
  function egressRefusals(profileId, since = 0) {
    const e = egressProxies.get(String(profileId || ''));
    const px = e && e.px;
    if (!px || !px.port()) return [];
    const out = [];
    for (const r of px.recent()) if ((Number(r.at) || 0) >= (Number(since) || 0) && r.host && !out.includes(r.host)) out.push(r.host);
    return out.slice(0, 8);
  }
  const installDir = path.join(dataDir, 'browser-tools');
  const hereTag = () => SW.platformTag(process.platform, process.arch);
  // ── §7.4 failure form (1): THE INSTALL SLOT — one install at a time (the browser CLI's, a Chrome build's) ──
  // rv-browser F7 (lane dc-browser-installs): the slot is src/server/browser-installs.js and each installable is a row its
  // own file declares (browser-cli-install.js, browser-builds-keeper.js — one INSTALLERS line
  // each); this keeper hands them what they read (its later consts and its reassigned lets at call time) and names no kind.
  const installs = BI.create({ refuseIfHeld /* the B-f276 remainder: a build's removal reads the registry's choices */, dataDir, installDir, installTimeoutMs, egressResolve, env, hereTag, log, namedError, notify, now, usableExe, whichOnPath, writeJsonAtomic, bf, bfPath, cliFolderOf, cliPin, installedCliOf, runningClis, browsing, buildsFor, buildsHere, engineFactOf, engineRowsView, chromeBuildsResolve, commit, ensureLoaded, healing, homeDir, humans, isEph, isLocalRec, isMediated, keptDirFor, keptStore, mediator, named, profile, pview, readDirMajor, reopenLeaseTabs, start, stop, stopping, switching, userTodos,
    get cliPrefix() { return cliPrefix; }, get cliWitnessOf() { return cliWitnessOf; }, get isMusl() { return isMusl; }, get inputsView() { return inputsView; },
    get reg() { return reg; }, get dirty() { return dirty; }, set dirty(v) { dirty = v; }, get inFlightReader() { return inFlightReader; },
    get cliGen() { return cliGen; }, set cliGen(v) { cliGen = v; }, get cliMemo() { return cliMemo; }, set cliMemo(v) { cliMemo = v; } });
  const { fallBackFromChange, announceRelaunch } = installs.api; // what this keeper still asks (the switch, rung 3, the heal)
  // ── lane browser-admin 2b: THE BROWSER CLI VERSION VIBESPACE DRIVES (`browser.cli`: path | pinned | x.y.z) ──
  // Installed with THE install slot above (one install at a time): `npm install --prefix
  // <data>/browser-tools/agent-browser-<v> --no-save --ignore-scripts agent-browser@<v>` — the registry only (the package's
  // postinstall, which fetches a binary from GitHub when the tarball lacks one, never runs). The npm child is DETACHED and
  // named in a marker file, so a server restart RE-ATTACHES to it (never a second install) and verifies its result. The pin
  // is the keeper's in-memory answer (`cliPin`), mirrored to `cli-pin.json` for the agent's CLI (data/bin/vibespace-browser
  // reads it beside itself — a remote machine has none, so PATH answers there).
  const cliPinFile = () => path.join(dataDir, 'browser-tools', 'cli-pin.json');
  // B-50e7 (scene 7): the pin the LAST run kept (cli-pin.json), read ONCE at the keeper's birth OFF the loop, held in memory only — what a
  // start while the settings are held launches with, before this run has computed a pin of its own
  let birthPin = null;
  const birthPinRead = !dataDir ? Promise.resolve() : fs.promises.readFile(cliPinFile(), 'utf8').then((s) => { try { const j = JSON.parse(s); if (j && typeof j.path === 'string' && j.path) birthPin = { version: typeof j.version === 'string' ? j.version : null, path: j.path }; } catch { /* not a pin */ } }, () => { /* no pin kept */ });
  const cliPrefix = (v) => path.join(dataDir, 'browser-tools', VERBS.cliInstallDirName(v));
  /** verify r1 (F2): THE WITNESS of a verified install — `<prefix>/verified.json` {version, path, at, says}, written by
   *  `finishCli` ONLY after the program itself said the version. Without it a folder is NOT an install: npm extracts the
   *  package in place (package.json + the 0755 launcher land first, the native binaries fill in over seconds), so a pin
   *  computed mid-install (the panel sets `browser.cli` right after the POST; a restart mid-install) resolved the launcher
   *  of a half-written package and the keeper, browser-env and the agent's CLI ran it. */
  const cliWitnessOf = (prefix) => path.join(prefix, 'verified.json');
  function cliWitnessRead(prefix) { try { const w = JSON.parse(fs.readFileSync(cliWitnessOf(prefix), 'utf8')); return w && typeof w === 'object' && typeof w.path === 'string' && typeof w.version === 'string' ? w : null; } catch { return null; } }
  let cliGen = 0, cliMemo = null, cliPinWritten;
  const isMusl = () => process.platform === 'linux' && (fs.existsSync('/lib/ld-musl-x86_64.so.1') || fs.existsSync('/lib/ld-musl-aarch64.so.1'));
  /** ONE version's install, read off ITS OWN package.json (never a guessed folder): the native binary the package ships for
   *  this machine (its launcher's naming, mirrored), else its declared launcher. → `{ok, version, path, prefix}` | `{ok:false, why}`. */
  function cliFolderOf(version) {
    let prefix; try { prefix = cliPrefix(String(version)); } catch { return { ok: false, why: 'not a version' }; }
    const pkgDir = path.join(prefix, 'node_modules', VERBS.CLI_PACKAGE);
    let pkg = null; try { pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')); } catch { return { ok: false, why: 'not installed' }; }
    if (!pkg || pkg.version !== String(version)) return { ok: false, why: `its folder holds ${pkg && pkg.version ? pkg.version : 'another package'}` };
    const native = VERBS.cliNativeName({ platform: process.platform, arch: process.arch, musl: isMusl() });
    const nat = native ? path.join(pkgDir, 'bin', native) : null;
    const rel = SW.binFromPackageJson(pkg, VERBS.CLI_PACKAGE);
    const launcher = rel ? path.join(pkgDir, rel) : null;
    const exe = nat && usableExe(nat) ? nat : (launcher && usableExe(launcher) ? launcher : null);
    return exe ? { ok: true, version: String(version), path: exe, prefix } : { ok: false, why: 'its program cannot be run' };
  }
  /** THE INSTALL (what the pin, the facts and the install verdict read): the folder's program AND its witness — a folder
   *  without one (verify r1 F2: mid-install, a crash, a program that did not say the version) is NOT an install. */
  function installedCliOf(version) {
    const f = cliFolderOf(version);
    if (!f.ok) return f;
    const w = cliWitnessRead(f.prefix);
    if (!w || w.version !== String(version) || w.path !== f.path) return { ok: false, why: w ? 'not verified (its folder changed since it was verified)' : 'not verified (an install that did not finish, or whose program did not say the version)' };
    return f;
  }
  /** B-7a30 unit 1': THE SAME INSTALL read OFF THE LOOP (the judge's): its package.json and witness read async, its program
   *  checked by the judge's one file check. → as installedCliOf. */
  let muslKnown = null;
  async function installedCliOfNow(version) {
    let prefix; try { prefix = cliPrefix(String(version)); } catch { return { ok: false, why: 'not a version' }; }
    const pkgDir = path.join(prefix, 'node_modules', VERBS.CLI_PACKAGE);
    let pkg = null; try { pkg = JSON.parse(await fs.promises.readFile(path.join(pkgDir, 'package.json'), 'utf8')); } catch { return { ok: false, why: 'not installed' }; }
    if (!pkg || pkg.version !== String(version)) return { ok: false, why: `its folder holds ${pkg && pkg.version ? pkg.version : 'another package'}` };
    if (muslKnown === null) muslKnown = process.platform === 'linux' && ((await fileFactOf('/lib/ld-musl-x86_64.so.1')).id !== null || (await fileFactOf('/lib/ld-musl-aarch64.so.1')).id !== null);
    const native = VERBS.cliNativeName({ platform: process.platform, arch: process.arch, musl: muslKnown });
    const nat = native ? path.join(pkgDir, 'bin', native) : null;
    const rel = SW.binFromPackageJson(pkg, VERBS.CLI_PACKAGE);
    const launcher = rel ? path.join(pkgDir, rel) : null;
    const exe = nat && (await fileFactOf(nat)).exe ? nat : (launcher && (await fileFactOf(launcher)).exe ? launcher : null);
    if (!exe) return { ok: false, why: 'its program cannot be run' };
    let w = null; try { const x = JSON.parse(await fs.promises.readFile(cliWitnessOf(prefix), 'utf8')); w = x && typeof x === 'object' && typeof x.path === 'string' && typeof x.version === 'string' ? x : null; } catch { w = null; }
    if (!w || w.version !== String(version) || w.path !== exe) return { ok: false, why: w ? 'not verified (its folder changed since it was verified)' : 'not verified (an install that did not finish, or whose program did not say the version)' };
    return { ok: true, version: String(version), path: exe, prefix };
  }
  /** THE PIN: `{mode: path|pinned|version, version, path|null, installed, why, invalid}` — recomputed when the setting moves or
   *  an install ends (never per command), mirrored to cli-pin.json on a change. */
  function cliPin() {
    // B-f276 family unit 2 (主开发 r3115 — the census's one unverified item, VERIFIED): while the SETTINGS are held `browser.cli` is
    // UNREAD (the held view carries no such row): the pin computed from it is the default's («path»), and the mirror below was REMOVED —
    // the person's pinned build gone from the agent's CLI on a guess. Held: the last pin stands, nothing is written; the lift recomputes
    let settingsUnread = false; try { settingsUnread = !!settingsHeld(); } catch { settingsUnread = false; }
    // B-50e7 (r3747 should 1): held, a pin is said «installed» only past the SAME check the memo's road makes (one stat per resolve,
    // usableExe) — a kept or memo pin whose program vanished is never said installed; PATH answers then, said so
    if (settingsUnread) {
      if (cliMemo && (!cliMemo.pin.path || usableExe(cliMemo.pin.path))) return cliMemo.pin;
      if (birthPin && usableExe(birthPin.path)) return { mode: 'pinned', version: birthPin.version, path: birthPin.path, installed: true, why: 'the settings cannot be read right now — the pin the last run kept is used', invalid: null, held: true };   // B-50e7 scene 7: nothing known ⇒ the kept pin before PATH
      return { mode: 'path', version: null, path: null, installed: false, why: cliMemo || birthPin ? 'the settings cannot be read right now and the pinned program is not a runnable file — the browser tool on PATH is used; the pin file is left as it is' : 'the settings cannot be read right now — the pin file is left as it is', invalid: null, held: true };
    }
    let raw = ''; try { const v0 = serverSetting('browser.cli'); raw = v0 == null ? '' : String(v0); } catch { raw = ''; }
    if (cliMemo && cliMemo.raw === raw && cliMemo.gen === cliGen) {
      // verify r1 (F4): a pinned install that VANISHED (data/browser-tools wiped, the folder moved) is said at once — the
      // memo is dropped the moment its program is not a runnable file (one stat per resolve), the pin file removed, PATH
      // answers and the panel says "not installed"; before, the facts read "installed" off the memo until a restart
      if (!cliMemo.pin.path || usableExe(cliMemo.pin.path)) return cliMemo.pin;
      cliGen++;
    }
    const ch = VERBS.cliChoiceOf(raw);
    let pin;
    if (ch.mode === 'path') pin = { mode: 'path', version: null, path: null, installed: false, why: null, invalid: ch.invalid || null };
    else { const i = installedCliOf(ch.version); pin = { mode: ch.mode, version: ch.version, path: i.ok ? i.path : null, installed: !!i.ok, why: i.ok ? null : i.why, invalid: null }; }
    cliMemo = { raw, gen: cliGen, pin };
    if (cliPinWritten !== (pin.path || null)) {
      try {
        if (pin.path) { fs.mkdirSync(path.dirname(cliPinFile()), { recursive: true, mode: 0o700 }); writeJsonAtomic(cliPinFile(), { version: pin.version, path: pin.path }); }
        else fs.rmSync(cliPinFile(), { force: true });
        cliPinWritten = pin.path || null;
        log.log?.(`[browser] the browser CLI VibeSpace drives: ${pin.path ? `the pinned ${VERBS.CLI_PACKAGE} ${pin.version} (${pin.path})` : pin.mode === 'path' ? 'whatever PATH has' : `PATH — the pinned ${pin.version} is ${pin.why}`}`);
      } catch (e) { log.warn?.(`[browser] the browser CLI pin file could not be written (${e && e.message}) — the agent's CLI keeps using PATH until it is`); }
    }
    return pin;
  }
  function cliPinPath() { return cliPin().path; }
  // ── verify r2 (H1, the coordinator's ruling): A RUNNING BROWSER KEEPS THE CLI IT WAS LAUNCHED WITH ──
  // `rec.cli` = {version, path, id} stamped at its LAUNCH (the binary that launch ran; `id` = that file's identity, so a
  // binary replaced in place — an `npm i -g` over PATH's — is not mistaken for it) or read off an ADOPTED daemon (its
  // `session info` version + its /proc exe). Every later call of that browser runs a binary of THAT version (`cliOptOf`,
  // wired into every runtime call by `configured`), so a `browser.cli` switch never restarts a running browser (the 0.38.x
  // daemon restarts itself and its Chrome for a client of another version — measured); it applies at the next launch.
  // That version gone from this machine ⇒ `browser_cli_gone` by name (never a silent fall to PATH).
  const cliIdOf = (p) => { try { const st = fs.statSync(p); return st.isFile() ? `${st.dev}:${st.ino}:${st.size}:${Math.round(st.mtimeMs)}` : null; } catch { return null; } };
  // ── B-7a30 unit 1' (the owner's hub witness: 23.8 s held in 16 holds — cliJudge stat'ed each stamped record's CLI file and,
  // on a mismatch, read the pinned install's package.json + witness and stat'ed every candidate, on EVERY list(), digest and
  // commit): A BROWSER'S CLI JUDGMENT IS A KEPT FACT. ONE async judge (`cliJudgeNow`) computes the whole answer OFF the loop —
  // every file check async (`fileFactOf`, injectable `cliFileFact`), a candidate never asked its version asked there (a fork
  // once per file identity) — kept per record (`cliKept`, keyed by the record's stamp). A VIEW (the row, list(), the digests,
  // the CLI row's counts) reads the kept answer: a record never judged since the boot (or newly stamped by no launch of this
  // keeper), or whose judge hangs past `cliActMs`, reads `{checking}` («checking…», never «runs»). The keeper's own timer
  // re-judges every stamped record each CLI_FRESH_MS, one at a time; a judgment that moves what a view drew notifies ONCE. A
  // DOOR (a command about to run: `configured`, the /resolve refusals, the heal) judges FRESH and waits at most `cliActMs` (5 s):
  // past it — or while a judge already hangs — the command is refused by name `browser_cli_unconfirmed` (an `info` read goes on).
  const CLI_FRESH_MS = 10 * 1000;
  const CLI_UNANSWERED = Symbol('unanswered');
  const checkFile = typeof cliFileFact === 'function' ? cliFileFact : async (p) => {
    let exe = false, id = null;
    try { await fs.promises.access(p, fs.constants.X_OK); exe = true; } catch { exe = false; }
    try { const st = await fs.promises.stat(p); if (st.isFile()) id = `${st.dev}:${st.ino}:${st.size}:${Math.round(st.mtimeMs)}`; else exe = false; } catch { exe = false; id = null; }
    return { exe, id };
  };
  async function fileFactOf(p) {
    let f = null; try { f = await checkFile(String(p)); } catch { f = null; }
    return { exe: !!(f && f.exe && f.id), id: (f && f.id) || null };
  }
  /** THE CURRENT CLI for the judge, off the loop: the hub's runtime answers the pin's program while its memo names one that is
   *  runnable (checked here, async), else PATH's (the resolver's own memo); an injected runtime (the gate's) answers itself.
   *  A pin never resolved since the boot is resolved once (cliPin — the act every runtime call already makes). */
  async function cliCurNow() {
    if (facts) return typeof bf.binPath === 'function' ? bf.binPath() : null;
    let m = cliMemo; if (!m) { try { cliPin(); } catch { /* PATH answers */ } m = cliMemo; }
    if (m && m.pin && m.pin.path && (await fileFactOf(m.pin.path)).exe) return m.pin.path;
    return typeof bfPath.binPath === 'function' ? bfPath.binPath() : null;
  }
  const cliVersions = new Map(); // path → {id, version} — `--version` of ONE binary file, asked again only when the file changed
  async function cliVersionAt(p) {
    const id = (await fileFactOf(p)).id;
    if (!id) return null;
    const m = cliVersions.get(p);
    if (m && m.id === id && (m.version || now() - (m.at || 0) < CLI_FRESH_MS)) return m.version; // B-7a30: a silent answer is remembered for 10 s
    // B-323e (lane bl-keys-misc, 主开发 r1351 (6)): the ask rides the hub's starter — the keeper's 5 s tick re-asks a binary that says
    // no version every CLI_FRESH_MS, never a fork of the hub; the child gets the service env + the PATH its site gave (the probe
    // needs no more). The starter's answer read as the probe table reads execFile's: missing ⇒ null, no answer / timed out ⇒ ''
    // r1381 gate: the site hands the NAMES its env had (the keeper's, sanitized — as the old road gave the child), never more; the
    // starter refuses a secret-shaped one by itself
    const probeEnv = F.sanitizeProbeEnv({ ...(env() || {}), PATH: (env() || {}).PATH || process.env.PATH || '' }), envAdd = {};
    for (const [k, v] of Object.entries(probeEnv)) if (typeof v === 'string') envAdd[k] = v;
    const r = await Promise.resolve().then(() => require('./child-starter').childStarter().run(p, ['--version'], { timeoutMs: 8000, capture: true, maxBuffer: 64 * 1024, envAdd })).catch(() => null);
    const er = !r || r.unknown || r.timedOut || r.overflow ? { killed: true } : r.started === false ? { code: r.error || null } : r.code !== 0 ? { code: r.code } : null;
    const v = F.versionFromProbe({ err: er, stdout: r && r.stdout, stderr: r && r.stderr }) || null; // verify r1 ⑦ + r2 ⑥: ONE probe table (browser-facts.versionFromProbe) — a crash names no version, a version on stdout counts whatever the exit
    cliVersions.set(p, { id, version: v, at: now() }); // B-7a30: a silent one too (asked again after CLI_FRESH_MS)
    return v;
  }
  /** The version a binary said (no fork) — null when it was never asked or its file changed since (checked off the loop). */
  async function knownVersionOf(p) { const m = p ? cliVersions.get(p) : null; if (!m || !m.version) return null; return (await fileFactOf(p)).id === m.id ? m.version : null; }
  /** THE CLI A LAUNCH RUNS NOW (the pin, else PATH) — stamped on the record before the launch. null = not knowable here (a
   *  fake runtime's bare name, a binary that would not say its version): the browser then follows the current CLI. */
  async function cliNow() {
    const p = typeof bf.binPath === 'function' ? bf.binPath() : null;
    if (!p || !String(p).startsWith('/')) return null;
    let timer = null;
    const v = await Promise.race([cliVersionAt(p), new Promise((res) => { timer = setTimeout(() => setImmediate(() => res(CLI_UNANSWERED)), cliActMs); })]);
    clearTimeout(timer);
    if (v === CLI_UNANSWERED) { log.warn?.(`[browser] the CLI ${p} did not answer within ${cliActMs} ms — this launch is not stamped (it follows the current CLI)`); return null; } // B-7a30: bounded
    return v ? { version: v, path: p, id: (cliVersions.get(p) || {}).id || null, at: now() } : null; // the identity cliVersionAt just checked
  }
  /** An ADOPTED daemon's CLI (a daemon this keeper did not launch — an escaped command, a restart): the version it SAYS
   *  (`session info`, launch-free and never a restart) and the program it runs (/proc/<pid>/exe; a deleted file is none). */
  function cliOfDaemon(info) {
    const v = info && typeof info.version === 'string' ? (info.version.match(/^(\d+\.\d+\.\d+)$/) || [])[1] || null : null;
    if (!v) return null;
    let exe = null; try { exe = Number.isInteger(info.pid) ? fs.readlinkSync(`/proc/${info.pid}/exe`) : null; } catch { exe = null; }
    if (exe && (/ \(deleted\)$/.test(exe) || !/^agent-browser/.test(path.basename(exe)))) exe = null; // (only the CLI's own program — a wrapper's interpreter is no CLI)
    if (exe && v) cliVersions.set(exe, { id: cliIdOf(exe), version: v });
    return { version: v, path: exe, id: exe ? cliIdOf(exe) : null, at: now(), adopted: true };
  }
  /** THE JUDGE (B-7a30 unit 1': async, off the loop): the binary ONE call of `rec`'s browser runs → `{path}` | `{gone: words}` |
   *  null (no record / no stamp / not local: the current CLI, as before). Same version only: the launch's own file, the current
   *  CLI, VibeSpace's verified install of that version, PATH's — never a binary of another version. A candidate never asked its
   *  version is asked here (verify r3 Y1: a same-version re-install is not «gone»); asked and silent ⇒ unproven ⇒ gone. */
  async function cliJudgeNow(rec) {
    const c = rec && rec.cli;
    if (!c || !c.version || !isLocalRec(rec)) return null;
    if (c.path) { const own = await fileFactOf(c.path); if (own.exe && (!c.id || own.id === c.id)) return { path: c.path }; }
    const cands = [];
    const cur = await cliCurNow();
    if (cur) cands.push({ path: cur, version: await knownVersionOf(cur), how: 'current' });
    try { const i = await installedCliOfNow(c.version); if (i.ok) cands.push({ path: i.path, version: c.version, how: 'installed' }); } catch { /* not a version */ }
    const onPath = typeof bfPath.binPath === 'function' ? bfPath.binPath() : null;
    if (onPath && onPath !== cur) cands.push({ path: onPath, version: await knownVersionOf(onPath), how: 'path' });
    for (const x of cands) if (x.version == null && x.path) x.version = await cliVersionAt(x.path).catch(() => null);
    const curV = cur ? (cands.find((x) => x.how === 'current') || {}).version || null : null;
    const v = VERBS.cliForBrowser({ want: c.version, candidates: cands, current: curV });
    if (v.ok) return v.path ? { path: v.path } : null;
    return { gone: v.error };
  }
  const cliKept = new Map(); // profileId → {sig, j, at, seq} — THE KEPT JUDGMENT (pruned when its record goes)
  const cliJudging = new Map(); // profileId → the judge in flight {p, since, seq, hung}
  const cliTold = new Map(); // profileId → what a view last read (the judgment's JSON | 'checking'): a judge notifies only when it moves it
  let cliSeq = 0;
  const cliSig = (rec) => { const c = rec && rec.cli; return c ? [c.version || '', c.path || '', c.id || '', isLocalRec(rec) ? 1 : 0].join('|') : ''; };
  const cliHung = (x) => !!x && (x.hung || Date.now() - x.since >= 3 * cliActMs); // REAL time: a door's timeout marked it, or 3 bounds passed (a loop held past one bound never reads a finished judge as hung)
  // «stuck» is scoped to a CLI FILE: a judge hung on this record, or on another record that runs the same file — never another
  // file's hang (a hang on one CLI path never refuses the browsers, or the restart, that run another)
  // (its verdict's must: the own-record clause is scoped to the STAMP — a judge still hung on the OLD stamp's file never refuses
  // the record re-stamped on another file: the restart the refusal's remedy names)
  const cliStuck = (rec) => { const path0 = rec && rec.cli ? rec.cli.path || '' : ''; const sig0 = cliSig(rec); for (const x of cliJudging.values()) if (cliHung(x) && ((x.id === rec.profileId && x.sig === sig0) || (path0 && x.path === path0))) return x; return null; };
  let cliNoteTimer = null; // the judges' notifications, batched (one broadcast per 250 ms however many records moved)
  const cliChanged = () => { if (cliNoteTimer) return; cliNoteTimer = setTimeout(() => { cliNoteTimer = null; notify(); }, 250); if (cliNoteTimer.unref) cliNoteTimer.unref(); };
  const cliUnconfirmedWords = () => `this browser's CLI could not be checked within ${cliActMs >= 1000 ? Math.round(cliActMs / 1000) + ' s' : cliActMs + ' ms'} — nothing was run; try again in a moment`;
  /** ONE judge of `rec`, off the loop; a newer judgment is never overwritten by an older judge that lands after it. */
  function startCliJudge(rec) {
    const id = rec.profileId; const sig = cliSig(rec);
    const job = { p: null, since: Date.now(), seq: ++cliSeq, hung: false, id, sig, path: rec.cli && rec.cli.path || '', door: false };
    job.p = Promise.resolve().then(() => cliJudgeNow(rec)).then((j) => {
      if (cliJudging.get(id) === job) cliJudging.delete(id);
      const r = reg.browsers[id];
      if (!r || cliSig(r) !== sig) return j; // the record moved on (another launch): its own judge follows
      const k = cliKept.get(id);
      if (!k || k.sig !== sig || k.seq < job.seq) cliKept.set(id, { sig, j, at: now(), seq: job.seq });
      const shown = JSON.stringify(cliKept.get(id).j || null);
      if (cliTold.has(id) && cliTold.get(id) !== shown) { cliTold.set(id, shown); cliChanged(); } // it moved what a view drew: said once (batched)
      return j;
    }, (e) => { if (cliJudging.get(id) === job) cliJudging.delete(id); log.warn?.(`[browser] ${id}: its CLI judge failed: ${e && e.message}`); return { unconfirmed: `this browser's CLI could not be judged (${String(e && e.message || e).slice(0, 120)}) — nothing was run; try again in a moment` }; }); // fails CLOSED (never «no stamp» ⇒ the current CLI)
    cliJudging.set(id, job);
    return job;
  }
  /** THE KEEPER'S OWN ACT (a launch stamped the CLI it ran): that file IS the answer — kept now, no check needed. */
  function cliKeptByLaunch(rec) { if (rec && rec.profileId && rec.cli && rec.cli.version && rec.cli.path && isLocalRec(rec)) cliKept.set(rec.profileId, { sig: cliSig(rec), j: { path: rec.cli.path }, at: now(), seq: ++cliSeq }); }
  /** THE TICK (B-7a30): every stamped local record re-judged OFF the loop, ONE at a time (a hung disk holds one judge, never a
   *  pile); a pass still waiting starts no other; a record gone is pruned. → the promise of the pass (the gate awaits it). */
  let cliPass = null;
  function rejudgeClis() {
    if (cliPass && !cliPass.done) return cliPass.p;
    // the pass is an OBJECT that ends itself: a pass whose body finished without an await (no live record yet) is never handed
    // out again by a call in the same synchronous run (a `.finally` that cleared it one microtask later did — and judged nothing)
    const pass = { done: false, p: null };
    cliPass = pass;
    pass.p = (async () => {
      try {
        for (const id of new Set([...cliKept.keys(), ...cliTold.keys(), ...cliJudging.keys()])) if (!reg.browsers[id]) { cliKept.delete(id); cliTold.delete(id); cliJudging.delete(id); }
        for (const rec of Object.values(reg.browsers || {})) {
          if (!rec || !rec.cli || !rec.cli.version || !isLocalRec(rec) || !B.isLiveBrowser(rec)) continue; // a stopped browser runs no CLI: its next start stamps its own
          if (cliStuck(rec)) continue; // its file's judge hangs: not stacked
          const j = cliJudging.get(rec.profileId);
          let t = null;
          await Promise.race([(j ? j.p : startCliJudge(rec).p), new Promise((res) => { t = setTimeout(res, 3 * cliActMs); if (t.unref) t.unref(); })]); // a hung judge never holds the pass
          clearTimeout(t);
        }
      } finally { pass.done = true; if (cliPass === pass) cliPass = null; }
    })();
    return pass.p;
  }
  /** The first pass at once (the views say «checking…» until it lands), then the keeper's own timer (unref'd; `cliEveryMs`). */
  let cliTimer = null;
  function cliBoot() {
    rejudgeClis().catch(() => { });
    // the timer passes over LIVE records only (a pass with none live costs one loop over the records, no file check)
    if (!cliTimer && cliEveryMs > 0) { cliTimer = setInterval(() => { rejudgeClis().catch(() => { }); }, cliEveryMs); if (cliTimer.unref) cliTimer.unref(); }
  }
  /** THE VIEWS' answer (sync, never a file check): the kept judgment, `{checking: true}` while there is none for this stamp
   *  (or its judge hangs, or a judge hangs and it is past its bound). A read past the bound asks for THE pass (one at a time,
   *  one judge at a time) — never a judge per record read, so a list of fifty never starts fifty checks on one disk. */
  function cliOptOf(rec) {
    const c = rec && rec.cli;
    if (!c || !c.version || !isLocalRec(rec)) return null;
    if (!B.isLiveBrowser(rec)) return null; // a STOPPED browser runs no CLI — its view says the version it last ran, no judgment either way
    const id = rec.profileId; const sig = cliSig(rec);
    const k = cliKept.get(id); const has = !!(k && k.sig === sig);
    const old = !has || now() - k.at >= CLI_FRESH_MS;
    const stuck = cliStuck(rec);
    if (old && !stuck) rejudgeClis().catch(() => { });
    const checking = !has || cliHung(cliJudging.get(id)) || (stuck && old);
    cliTold.set(id, checking ? 'checking' : JSON.stringify(k.j || null));
    return checking ? { checking: true } : k.j;
  }
  /** THE DOORS' answer (a command about to run, a refusal, the heal): a FRESH judge — never one already in flight that may
   *  predate a change — bounded at `cliActMs`; past it, or while a judge already hangs (no second one stacked on a hung disk),
   *  `{unconfirmed: words}` (refused by name `browser_cli_unconfirmed`). */
  async function cliOptReady(rec) {
    const c = rec && rec.cli;
    if (!c || !c.version || !isLocalRec(rec)) return null;
    if (cliStuck(rec)) return { unconfirmed: cliUnconfirmedWords() };
    const j0 = cliJudging.get(rec.profileId);
    const job = j0 && j0.door && j0.sig === cliSig(rec) && Date.now() - j0.since < 1000 ? j0 : startCliJudge(rec); // a door's judge under a second old IS fresh for this one
    job.door = true;
    let timer = null;
    // the bound is REF'D (a door in flight keeps the process up to its answer) and yields ONCE to finished I/O before it decides
    const r = await Promise.race([job.p, new Promise((res) => { timer = setTimeout(() => setImmediate(() => res(CLI_UNANSWERED)), cliActMs); })]);
    clearTimeout(timer);
    if (r === CLI_UNANSWERED) { job.hung = true; log.warn?.(`[browser] ${rec.profileId}: its CLI judge did not answer within ${cliActMs} ms — the command is refused (browser_cli_unconfirmed)`); return { unconfirmed: cliUnconfirmedWords() }; }
    return r;
  }
  /** The fact of one browser's CLI for an answer that REFUSES on it (the three /resolve forms): the candidates asked first. */
  async function cliFactReady(profileId) {
    ensureLoaded();
    const rec = reg.browsers[profileId];
    if (!rec) return null;
    const d = await cliOptReady(rec);
    if (d && d.unconfirmed && rec.cli && rec.cli.version) return { version: rec.cli.version, unconfirmed: d.unconfirmed }; // B-7a30: the door's own answer, by name
    return cliFactOf(rec);
  }
  /** verify r3 (Y1): the versions the sync readers need, kept warm — a stat per tick, a fork only when a file changed. */
  function warmCliVersions() {
    for (const f of [bf, bfPath]) { try { const x = typeof f.binPath === 'function' ? f.binPath() : null; if (x && String(x).startsWith('/')) cliVersionAt(x).catch(() => null); } catch { /* not resolvable */ } }
  }
  /** The CLI fact of one browser for a surface: `{version, gone}` (versions only — the agent's CLI finds that version on its
   *  own machine; `gone` = the words of browser_cli_gone). null = no stamp. */
  function cliFactOf(rec) {
    if (!rec || !rec.cli || !rec.cli.version) return null;
    const o = cliOptOf(rec);
    return { version: rec.cli.version, ...(o && o.gone ? { gone: o.gone } : {}), ...(o && o.checking ? { checking: true } : {}) }; // B-7a30: not judged yet ⇒ said
  }
  function runningClis(inUseV) {
    let previous = 0, gone = 0, checking = 0; const versions = new Set();
    for (const rec of Object.values(reg.browsers || {})) {
      if (!rec || !B.isLiveBrowser(rec) || !isLocalRec(rec) || !rec.cli || !rec.cli.version) continue;
      const o = cliOptOf(rec);
      if (o && o.checking) { checking++; continue; } // B-7a30: not judged yet — counted as neither
      if (o && o.gone) { gone++; versions.add(rec.cli.version); continue; }
      if (inUseV && rec.cli.version !== inUseV) { previous++; versions.add(rec.cli.version); }
    }
    return { previous, gone, checking, versions: [...versions].sort() };
  }
  const reattached = installs.reattach();
  /** The directory's own `Last Version` stamp (read-only): the major that
   *  actually wrote it, the primary evidence beside the registry's copy. */
  function readDirMajor(dir) {
    if (!dir) return null;
    try { return SW.parseLastVersion(fs.readFileSync(path.join(String(dir), 'Last Version'), 'utf8')); } catch { return null; }
  }
  // BROWSE YOURSELF (B-6ae8): the user browsing a profile himself HOLDS it for the switch (driving or kept while away) — a
  // switch restarts the browser and would close his page, so it is a proposal and the dialog offers "Close my browsing"
  // verify r1 (H1): an AGENT's reading of the switcher (GET /api/agent/browser/backend) is computed WITHOUT him — his presence
  // is his own fact; the switch itself still sees him (a proposal, never a stop under his page) and says no name
  const inputsView = ({ withHumans = true } = {}) => { const o = {}; for (const [k, v] of inputs) o[k] = { input: v.input }; if (withHumans) for (const h of humans.values()) o[`${h.key}|${h.profileId}`] = { input: 'user' }; return o; };
  /** THE SWITCHER'S VIEW of one profile: every backend row enabled or
   *  disabled WITH ITS REASON, the SOURCE chip from the masked view, the seat
   *  reading in its three states, the fingerprint sentence, the versions the
   *  ladder read, the blocked claims and the site hints. */
  function switcherView(profileId, { forAgent = false } = {}) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p) throw namedError('not-found', `no profile ${profileId}`);
    const dirMajor = readDirMajor(p.dir);
    const leases = reg.leases.filter((l) => l.profileId === p.id);
    // the rebuilt dialog: the rows carry their STATE — so the gate sees the real leases + who drives (a driven profile
    // is `in-use-by-hand`)
    const rows = SW.switcherRows({ profile: p, providerIds: providerIds(), rowOf, controlOf: control, capabilityRefusalOf: B.capabilityRefusal, sources: (id) => keysOf().sourceOf(id), seats: reg.seats, majors: reg.majors, dirMajor, now: now(), runningOf, leases, inputs: inputsView({ withHumans: !forAgent }), keyRequiredOf: keyRequired, humans: forAgent ? [] : humanRowsOn(p.id) });
    const rec1 = reg.browsers[p.id] || null; // lane browser-admin 2a: the Chrome build line (chromium only) — the choice + the build its browser reports
    return { build: (B.providerRow(p.provider) || {}).buildChoice ? { choice: forAgent ? BB.agentChoiceView(p.browser) : BB.choiceView(p.browser), running: rec1 ? BB.runningBuildOf(rec1.cdpBrowser) : null, missing: p.buildMissing ? (forAgent ? BB.agentMissingView(p.buildMissing) : { ...p.buildMissing }) : null, live: B.isLiveBrowser(rec1) } : null, /* verify r1 (F5): an agent's view names a chrome file by kind only */ profile: B.publicProfileView(p), chip: chipFor(p), rows, seats: seatStates(), siteHints: reg.siteHints.map((h) => ({ ...h })), blocked: blockedFor({ profileId: p.id }), leases: leasesOn(p.id), switching: switching.has(p.id), live: B.isLiveBrowser(reg.browsers[p.id]), versions: { recorded: p.lastChromiumMajor, dir: dirMajor, majors: { ...reg.majors } } };
  }
  /**
   * THE SWITCH (§7.4's sequence, the gate first and nothing moving until it
   * passes): 1 record each lease's lastUrl · 2 STOP the browser (Chromium's
   * singleton: one directory, one process — there is no live handover) ·
   * 3 start the target against the SAME directory with the SAME seed ·
   * 4 walk the lease table: open each lease's lastUrl under its own session
   * name, re-`--pin-tab`, write the new targetId back · 5 the lease was never
   * destroyed — looked up by (profileId, browserKey), only targetId re-minted.
   * Mid-way every attach/resolve answers `browser_restarting`. An agent's
   * switch that would stop somebody else's browser (another lease, or a
   * browser being DRIVEN) comes back as `mode:'proposal'` — the route files
   * the "For you" item; nothing here moves.
   */
  async function switchBackend({ profileId, target, by = { kind: 'user' }, browserKey = null, sessionId = null, confirmDowngrade = false, makeDefault = false, taskIds = null, groupsUnreadable = false } = {}) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p || isEph(p)) throw namedError('not-found', `no profile ${profileId}`);
    if (switching.has(p.id)) { const rr = SW.restartingRefusal(p); throw namedError(rr.code, rr.error); }
    const leases = reg.leases.filter((l) => l.profileId === p.id);
    // identity verify r3: an AGENT's switch is judged by THE ONE admission (a remote session is never admitted) — not
    // admitted ⇒ the PURE verdict makes it a proposal, never a direct switch of a profile the list keeps from it
    let admitted = null;
    if (by && by.kind === 'agent') {
      if (!browserKey || isRemoteKey(browserKey)) admitted = false;
      else { const g = Array.isArray(taskIds) ? { ids: taskIds.map(String), unreadable: !!groupsUnreadable } : groupsOfKey(browserKey); admitted = mayAttachL(p, { browserKey, conversationKeys: g.keys || keysOfKey(browserKey), taskIds: g.ids, groupsUnreadable: !!g.unreadable }).ok === true; }
    }
    const v = SW.switchVerdict({
      profile: p, target, rowOf, controlOf: control, capabilityRefusalOf: B.capabilityRefusal,
      resolveKey: (id) => keysOf().keyFor(id), // the ONE resolve of the gate — a masked source is all it keeps
      seats: reg.seats, majors: reg.majors, dirMajor: readDirMajor(p.dir), confirmed: !!confirmDowngrade,
      leases, inputs: inputsView(), by, byKey: browserKey, admitted, now: now(), hex: crypto.randomBytes(4).toString('hex'), runningOf, keyRequiredOf: keyRequired,
      humans: humanRowsOn(p.id), // BROWSE YOURSELF: the user browsing it himself ⇒ a proposal, never a stop under his page
    });
    if (!v.ok) throw namedError(v.code, v.error, { provider: v.provider || String(target), action: v.action || null, holders: v.holders || [], waysOut: v.waysOut || [], needsConfirm: !!v.needsConfirm, integrationId: v.integrationId || null, missing: v.missing || null });
    const from = v.from, to = v.to;
    if (v.mode === 'proposal') {
      log.log?.(`[browser] ${p.id} "${p.label}": switch ${from} → ${to} proposed by ${by.kind}${browserKey ? ' ' + browserKey : ''} (${v.reason})`);
      return { ok: true, mode: 'proposal', from, to, reason: v.reason, affected: v.affected, seats: v.seats, text: `switch "${p.label}" from ${from} to ${to}`, detail: `${v.reason}. Sessions affected: ${v.affected.join(', ') || 'none'}.${v.fingerprint ? ' ' + v.fingerprint : ''}` };
    }
    switching.add(p.id);
    const reopened = [];
    try {
      const rec0 = reg.browsers[p.id];
      const wasLive = B.isLiveBrowser(rec0);
      if (wasLive) await stop(p.id, { why: 'switch' });
      p.provider = to;
      if (makeDefault) p.defaultBackend = to;
      p.lastSwitchAt = now();
      commitSync();
      let browser;
      try { browser = await start(p.id, { why: `switch ${from} → ${to}` }); }
      catch (e) {
        // THE START-FAILURE ROLLBACK (the rebuilt dialog, 2026-09-27): the provider was committed before start(), so
        // ANY refusal start() throws (not_managed, browser_cap, backend_no_key on a stale view, launch_failed, …)
        // arrived with the profile stranded on a backend that cannot start. Put it back, try the old one ONCE, and
        // answer the original refusal with the facts: restored (did the old backend come back), from, to.
        p.provider = from;
        commitSync();
        // `restored` = the profile is as it was: back on `from`, and its browser running again when it ran before the
        // switch (a browser that was not running is not started by a rollback — nobody asked for it)
        let restored = !wasLive;
        if (wasLive) {
          try { await start(p.id, { why: 'switch rolled back' }); restored = true; }
          catch (e2) { log.warn?.(`[browser] ${p.id} "${p.label}": the switch ${from} → ${to} did not start (${e && e.code}) and the roll back to ${from} did not start either — ${e2 && e2.message}`); }
        }
        log.log?.(`[browser] ${p.id} "${p.label}": the switch ${from} → ${to} did not start (${e && e.code}: ${String(e && e.message).slice(0, 160)}) — rolled back to ${from}${restored ? '' : ' (not restarted)'}`);
        if (e && typeof e === 'object') { e.restored = restored; e.from = from; e.to = to; throw e; }
        throw namedError('launch_failed', String(e), { restored, from, to });
      }
      reopened.push(...await reopenLeaseTabs(p, leases));
      if (v.ladder && Number.isInteger(v.ladder.recordMajor)) p.lastChromiumMajor = Math.max(Number(p.lastChromiumMajor) || 0, v.ladder.recordMajor);
      commitSync();
      log.log?.(`[browser] ${p.id} "${p.label}" switched ${from} → ${to} by ${by.kind}${browserKey ? ' ' + browserKey : ''}: ${reopened.length} lease tab(s) re-opened${v.ladder && v.ladder.disagreement ? ', version stamps disagreed (' + v.ladder.disagreement.recorded + ' vs ' + v.ladder.disagreement.dir + ', took ' + v.ladder.disagreement.taken + ')' : ''}`);
      return { ok: true, mode: 'switch', from, to, ladder: v.ladder, seats: v.seats, reopened, browser, chip: chipFor(p), profile: B.publicProfileView(p) };
    } finally { switching.delete(p.id); commitSync(); }
  }
  /** §7.4 step 4, shared by the backend switch and Change build… (lane browser-admin 2a): every lease's tab re-opened in
   *  the NEW browser at its last URL, under the lease's own session over the CDP url (never the directory), the SAME
   *  lease object kept with only its targetId re-minted. → `[{browserKey, url, ok, targetId, error}]`. */
  async function reopenLeaseTabs(p, leases) {
    const ns = nsOf(p.id);
    const reopened = [];
    const pinTab = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
    for (const l of leases) {
      const url = l.lastUrl || 'about:blank';
      let targetId = null, ok = false, error = null;
      try {
        // naive study 2: the keeper's own re-open reaches the NEW browser over its CDP url under the lease's session —
        // never the directory (a second Chrome on it dies on SingletonLock); a mediated lease's tab is admitted below
        const o = await leaseCliOpts(p.id, l.browserKey);
        if (!o) throw new Error(noCdpError(p));
        // (the first switch on the REAL binaries, 2026-09-28): the lease's session is PINNED to its tab in the
        // browser that was just stopped — 0.38.1's pin is sticky per session, so `--pin-tab open <url>` answered
        // `tab_gone` ("bound tab is gone … Run `tab new <url>`") and every later verb of the lease did too; `tab new` is
        // the binary's own recovery: it opens the tab in the NEW browser and binds the session to it
        // lane browser-windows (U1): …in a WINDOW OF ITS OWN in the new browser (the old one's windows are gone with it)
        const r = await openOwnTabMarked(p, l.browserKey, { url, ns, opts: o, pin: pinTab ? ['--pin-tab'] : [] });
        ok = !!r.ok;
        targetId = r.targetId || null;
        if (ok && r.window === 'own') { l.windowIn = WIN.instanceOf(reg.browsers[p.id]); if (WIN.windowIdOf(r.windowId) != null) l.windowId = WIN.windowIdOf(r.windowId); } // T2 ⑧: the new browser's one window of this holder
        if (!ok) error = String(r.error || '').trim().slice(0, 200) || 'open failed';
      } catch (e) { error = String(e && e.message); }
      // the SAME lease object: only targetId is re-minted (§7.4 step 5)
      l.targetId = targetId ? String(targetId) : null;
      l.reopenedAt = now();
      if (mediator && isMediated(p) && l.targetId) mediator.admitTarget(p.id, l.browserKey, l.targetId); // P6: the re-opened tab is the lease's
      else if (mediator && l.targetId && leaseRoadOf(p, l.browserKey).mode === M.SCOPE_MODE) mediator.admitTarget(p.id, l.browserKey, l.targetId); // lane browser-shared-profile-freeze
      reopened.push({ browserKey: l.browserKey, url, ok, targetId: l.targetId, error });
    }
    return reopened;
  }
  /** `vibespace-browser blocked` — record the agent's CLAIM (who, which URL,
   *  why, what evidence, which tier it suggests). Bounded; one per
   *  (conversation, host). The server never manufactures one. */
  function blocked({ url, why = '', evidence = '', tier = null, browserKey = null, sessionId = null, profileId = null, sessionName = '', remote = false } = {}) {
    refuseIfHeld('a blocked page\'s report');   // the B-f276 remainder: refused by name while the registry is held (nothing minted, nothing written)
    ensureLoaded();
    // the words a card draws from the agent (its code, what it saw, the conversation's name that becomes a profile's
    // label) lose every character that is not drawn or reorders a line — what the user reads above Approve is what
    // is stored and what runs (the URL is parsed by SW.proposalUrlOf: ASCII by construction)
    const drawn = (s) => String(s == null ? '' : s).replace(HC.HIDDEN_RE, '');
    why = drawn(why); evidence = drawn(evidence); sessionName = drawn(sessionName);
    const v = SW.blockedClaim({ url, why, evidence, tier, browserKey, sessionId, profileId, at: now(), id: 'bl-' + crypto.randomBytes(4).toString('hex') });
    if (!v.ok) throw namedError(v.code, v.error);
    // lane browser-propose step 3: a tier-2 claim files ONE PROPOSAL (its card, its For-you item, its one Approve) — a second
    // claim on the same (conversation, host) while one stands is the SAME card; a rejection the agent was not told yet is
    // told now; a told rejection or a finished switch opens a new one (SW.claimVerdict)
    const mineOn = (b) => b.browserKey === v.value.browserKey && b.host === v.value.host;
    const prior = [...reg.blocked].reverse().find((b) => mineOn(b) && b.proposal) || null;
    const cv = SW.claimVerdict({ existing: prior, tier: v.value.tier });
    if (cv === 'same' || cv === 'rejected') {
      if (cv === 'rejected') { const st = SW.proposalStep(prior.proposal, { event: 'told' }); if (st.ok) { prior.proposal = st.next; cardOnLanding(prior, 'a rejected claim told'); } }
      log.log?.(`[browser] ${browserKey || '?'} claims blocked on ${v.value.host} again — ${cv === 'same' ? 'the proposal ' + prior.id + ' stands (' + prior.proposal.state + ')' : 'the user rejected ' + prior.id + ' (told now)'}`);
      return { claim: { ...prior }, text: SW.blockedText(prior), hint: SW.siteHintFor(reg.siteHints, prior.host), proposal: { ...prior.proposal }, duplicate: cv === 'same', rejected: cv === 'rejected' };
    }
    let proposal = null;
    if (cv === 'new') {
      // lane engine-spi-egress L3 (D1): no plan kind targets a browser in this version — the plan says why nothing is offered
      const target = proposalTargetFor(profileId, browserKey);
      const plan = SW.proposalPlan({ remote: !!remote || (browserKey ? isRemoteKey(browserKey) : false), target });
      proposal = SW.proposalFor({ claim: v.value, plan, at: now() });
    }
    const entry = proposal ? { ...v.value, proposal } : v.value;
    // a claim-only claim (tier 1 / 3) replaces the conversation's previous claim on the host (the pre-lane rule); an entry
    // carrying a proposal is its card's record and stays (bounded by the 50 below)
    // verify r1: the bound drops the entries nobody waits on first (SW.blockedKeep) — never another conversation's open
    // proposal to make room for a claim; one that must still go (50 undecided) is SAID: its listeners hear `dropped`
    const kept = SW.blockedKeep([...reg.blocked.filter((b) => !(mineOn(b) && !b.proposal)), entry]);
    reg.blocked = kept.keep;
    const claimLanded = commitSync();
    for (const d of kept.dropped) if (d.proposal && SW.blockedRank(d) >= 2) { log.warn?.(`[browser] the claim store is full — proposal ${d.id} (${d.proposal.state}, ${d.host}) was dropped to make room`); emitProposal({ ...d, dropped: true }); }
    log.log?.(`[browser] ${browserKey || '?'} claims blocked on ${v.value.host}${why ? ' (' + why + ')' : ''}, suggests tier ${v.value.tier}${proposal ? ` — proposal ${entry.id}: ${proposal.plan.kind}${proposal.plan.why ? ' (' + proposal.plan.why + ')' : ''}` : ''}`);
    if (proposal) cardOnLanding(entry, 'a blocked claim\'s card', claimLanded);   // the census cure ((b)): the card over a claim on disk
    return { claim: v.value, text: SW.blockedText(v.value), hint: SW.siteHintFor(reg.siteHints, v.value.host), ...(proposal ? { proposal: { ...proposal } } : {}) };
  }
  /** lane browser-propose: the facts the PLAN reads about THIS conversation's browser — its named profile (a lease it
   *  holds) or its own temporary browser. */
  function proposalTargetFor(profileId, browserKey) {
    const p = profileId ? profile(profileId) : null;
    if (!p || isEph(p)) return { kind: 'ephemeral' };
    const row = rowOf(p.provider) || {};
    const mine = B.parentKeyOf(String(browserKey || ''));
    const others = new Set(reg.leases.filter((l) => l.profileId === p.id && B.parentKeyOf(String(l.browserKey || '')) !== mine).map((l) => B.parentKeyOf(String(l.browserKey || '')))).size;
    return { kind: 'profile', id: p.id, label: p.label, provider: p.provider || 'chromium', host: p.host || null, ownsDir: !!row.ownsDir && row.canSwitchTo === 'in-place', recordedMajor: Number.isInteger(p.lastChromiumMajor) ? p.lastChromiumMajor : null, dirMajor: readDirMajor(p.dir), others };
  }
  /** verify r1 V2: how many OTHER conversations hold a lease on `profileId` right now (the count a switch card names). */
  function proposalOthers(profileId, browserKey) { ensureLoaded(); const t = proposalTargetFor(profileId, browserKey); return t.kind === 'profile' ? t.others : 0; }
  // ── the proposal store's accessors (the ORCH runner, src/server/browser-propose.js, acts; this keeps the record) ──
  const proposalListeners = new Set();
  /** Hear every proposal CHANGE (its card is patched, its For-you item follows). Never throws into the keeper. */
  function onProposal(fn) { proposalListeners.add(fn); return () => proposalListeners.delete(fn); }
  function emitProposal(entry) { for (const fn of proposalListeners) { try { fn({ ...entry, proposal: { ...entry.proposal } }); } catch (e) { log.warn?.(`[browser] a proposal listener threw — ${e && e.message}`); } } }
  /** lane site-reset step 3: the proposal record `id` lives in the claim store (`bl-…`, a backend switch) or the site-reset
   *  store (`sr-…`, clearing one site's login on a shared profile) — ONE lookup for every accessor below. */
  const proposalRec = (id) => { const k = String(id || ''); return (k.startsWith('sr-') ? reg.siteResets : reg.blocked).find((b) => b.id === k && b.proposal) || null; };
  /** The claim entry carrying proposal `id` (a copy), or null. */
  function proposalEntry(id) { ensureLoaded(); const e = proposalRec(id); return e ? { ...e, proposal: { ...e.proposal } } : null; }
  /** Apply ONE PURE transition to proposal `id` (SW.proposalStep) — the write is the record, committed and heard. */
  function stepProposal(id, ev) {
    ensureLoaded();
    const e = proposalRec(id);
    if (!e) return { ok: false, code: 'not-found', error: `no proposal ${id}` };
    const v = SW.proposalStep(e.proposal, { ...ev, at: ev.at || now() });
    if (!v.ok) return v;
    e.proposal = v.next;
    const landed = commitSync();
    // the census cure ((b)): the card over a step on disk, and the step answers its landing — an APPROVE not on disk runs nothing
    // until it is (browser-propose waits: its run clears a site's stored login, which cannot be undone)
    cardOnLanding(e, 'a proposal\'s step', landed);
    return { ok: true, entry: { ...e, proposal: { ...e.proposal } }, ...(landed ? {} : { landed: false, notOnDisk: true }) };
  }
  /** A field of the proposal record that is NOT a transition (the For-you item it filed). */
  function noteProposal(id, patch = {}) {
    ensureLoaded();
    const e = proposalRec(id);
    if (!e) return false;
    const allowed = {}; if (typeof patch.itemId === 'string') allowed.itemId = patch.itemId;
    e.proposal = { ...e.proposal, ...allowed };
    commit();
    return true;
  }
  /** Every claim entry carrying a proposal for this CONVERSATION (its helpers' included) — the chat's card source. */
  function proposalsFor(browserKey) {
    ensureLoaded();
    const k = B.parentKeyOf(String(browserKey || ''));
    return [...reg.blocked, ...reg.siteResets].filter((b) => b.proposal && B.parentKeyOf(String(b.browserKey || '')) === k).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0)).map((b) => ({ ...b, proposal: { ...b.proposal } }));
  }
  /** lane site-reset step 3: how many conversations use profile `profileId` now (distinct lease holders) and whether the
   *  user browses in it — what a site-reset card names, and what its Approve re-checks (more than the card said ⇒ stale). */
  function siteResetHolders(profileId, { except = null } = {}) {
    const rows = holdersOn(String(profileId)); // "who holds this browser" — THE holder reader (the conversations' leases + his row)
    const convs = new Set(rows.filter((r) => r && !r.human && r.browserKey).map((r) => B.parentKeyOf(String(r.browserKey))));
    const me = except ? B.parentKeyOf(String(except)) : null;
    return { holders: convs.size, others: [...convs].filter((k) => k !== me).length, human: rows.some((r) => r && r.human) };
  }
  /** verify r1 (site-reset): THE TABS VIBESPACE CAN ATTRIBUTE to holder `browserKey` on `profileId` — its lease's pinned
   *  tab, the tabs its MEDIATED lease created or was handed (the mediator grant's scope: the only authority a lease has on an
   *  instance-shared browser), and for the user's own key his tab + the ones he adopted. The dialog watch unions these with
   *  a live view's active target: before, a shared browser with no live view open attributed nothing, so a conversation's
   *  `stop` reached every tab and its loop was never told. Never throws; ids as strings. */
  function holderTabs(profileId, browserKey) {
    ensureLoaded();
    const pid = String(profileId || ''), bk = String(browserKey || '');
    if (!pid || !bk) return [];
    const out = new Set();
    if (HM.isHumanKey(bk)) { const h = humans.get(pid); if (h && h.key === bk) { if (h.ownTab) out.add(String(h.ownTab)); for (const a of (Array.isArray(h.adopted) ? h.adopted : [])) if (a) out.add(String(a)); } return [...out]; }
    for (const l of reg.leases) if (l && l.profileId === pid && String(l.browserKey) === bk) { if (l.targetId) out.add(String(l.targetId)); for (const t of (Array.isArray(l.tabs) ? l.tabs : [])) if (t) out.add(String(t)); } // verify r3 #2: + the tabs the watch witnessed as its (persisted on the lease)
    // lane browser-windows-fix (int201): + this holder's ROOTS — THE whose-tab answer the tab fence reads (tabHoldersOf), where the
    // keeper records the tab of the holder's OWN WINDOW (openOwnTab / ownWindowAtAttach: opened by the keeper, no verb in flight for
    // the watch to witness). Before, on a shared profile that tab was nobody's here: a bare `site-reset <host>` read no tab of its
    // own (`host_not_current`, its own site refused too) and its `stop` stopped nothing of its own — one answer, never a second rule
    for (const h of tabHoldersOf(pid)) if (h && h.key === bk) for (const t of (Array.isArray(h.roots) ? h.roots : [])) if (t) out.add(String(t));
    try { const g = mediator && typeof mediator._grant === 'function' ? mediator._grant(pid, bk) : null; if (g && g.scope && g.scope.targets) for (const t of g.scope.targets) if (t) out.add(String(t)); } catch { /* no grant: nothing to add */ }
    return [...out];
  }
  /** verify r3 #2 (site-reset): THE PERSISTED WITNESS — a tab the dialog watch attributed to a lease at its birth (the
   *  conversation's own `tab new`, its attach page, a popup of its page) is written on the lease record (`l.tabs`, ≤ 32)
   *  so a VibeSpace restart does not make the conversation's own tab nobody's again (reproduced on the real 0.38.1: after a
   *  restart mid-loop its `stop` was refused `unattributed` and its loop read `loopShared` — the r1 shape back on every
   *  Update). Never an ephemeral lease (its scope is every tab of its own browser — a persisted set would narrow it); gone
   *  with the tab (`forgetOwnTab`), with the browser (a stop, a fresh start — `emitLease`) and with the lease. The user's
   *  own key holds no lease: his tabs are his row's (`ownTab` / `adopted`). → true when recorded. */
  function noteOwnTab(profileId, browserKey, targetId) {
    ensureLoaded();
    const pid = String(profileId || ''), bk = String(browserKey || ''), tid = String(targetId || '').slice(0, 64);
    if (!pid || !bk || !tid) return false;
    const p = profile(pid);
    if (!p || isEph(p)) return false;
    const l = B.findLease(reg.leases, pid, bk);
    if (!l) return false;
    const tabs = Array.isArray(l.tabs) ? l.tabs.map(String) : [];
    if (tabs.includes(tid)) return true;
    l.tabs = [...tabs, tid].slice(-32);
    commit();
    return true;
  }
  function forgetOwnTab(profileId, browserKey, targetId) {
    ensureLoaded();
    const pid = String(profileId || ''), bk = String(browserKey || ''), tid = String(targetId || '');
    const l = pid && bk && tid ? B.findLease(reg.leases, pid, bk) : null;
    if (!l || !Array.isArray(l.tabs) || !l.tabs.map(String).includes(tid)) return false;
    l.tabs = l.tabs.filter((t) => String(t) !== tid);
    if (!l.tabs.length) delete l.tabs;
    commit();
    return true;
  }
  /** verify r4 #3: the persisted witness PRUNED to the tabs the browser has (the watch's first look at every connect — a
   *  VibeSpace restart, a healed browser): an id the browser does not know names nothing. → the number dropped. */
  function pruneOwnTabs(profileId, liveIds) {
    ensureLoaded();
    const pid = String(profileId || '');
    const live = new Set((Array.isArray(liveIds) ? liveIds : []).map(String));
    let n = 0;
    for (const l of reg.leases) {
      if (!l || l.profileId !== pid || !Array.isArray(l.tabs) || !l.tabs.length) continue;
      const kept = l.tabs.filter((t) => live.has(String(t)));
      if (kept.length === l.tabs.length) continue;
      n += l.tabs.length - kept.length;
      if (kept.length) l.tabs = kept; else delete l.tabs;
    }
    if (n) commit();
    return n;
  }
  /** lane browser-ui-prompts-r2: the conversation's own per-origin permission decision, written on its lease (`l.permissions`,
   *  ≤ 16, the newest per kind + origin) — gone with the browser (a fresh Chrome decides every kind again: denied). */
  function notePermission(profileId, browserKey, rec) {
    ensureLoaded();
    const pid = String(profileId || ''), bk = String(browserKey || '');
    const l = pid && bk && rec ? B.findLease(reg.leases, pid, bk) : null;
    if (!l) return false;
    const row = { kind: String(rec.kind || '').slice(0, 40), setting: rec.setting === 'granted' ? 'granted' : 'denied', origin: String(rec.origin || '').slice(0, 300), by: rec.by === 'user' ? 'user' : 'agent', at: Number(rec.at) || Date.now() };
    l.permissions = [...(Array.isArray(l.permissions) ? l.permissions : []).filter((x) => !(x && x.kind === row.kind && x.origin === row.origin)), row].slice(-16);
    commit();
    return true;
  }
  function dropLeaseTabs(profileId) {
    const pid = String(profileId || '');
    let n = 0;
    for (const l of reg.leases) if (l && l.profileId === pid && Array.isArray(l.permissions)) { delete l.permissions; n++; } // lane browser-ui-prompts-r2: a fresh Chrome forgot them
    for (const l of reg.leases) if (l && l.profileId === pid && Array.isArray(l.tabs) && l.tabs.length) { delete l.tabs; n++; }
    if (reg.loginFences && reg.loginFences[pid]) { delete reg.loginFences[pid]; n++; }
    for (const fn of [...profileDropListeners]) { try { fn(pid); } catch { /* best effort */ } }
    if (n) commit();
    return n;
  }
  /** lane vault-login (Shape S, r32): read/write persisted tab fences (`{targetId, urlAtFill, origin, at, browserKey?}`) & scrub entry names through the ONE registry writer (zero login identity, secret bytes, or digests on disk). */
  function loginFenceStateOf(profileId) {
    ensureLoaded();
    refuseIfHeld('a login fence');   // the B-f276 remainder: the fences are unread — never «none» (every caller fails CLOSED on a throw)
    const pid = String(profileId || '');
    const st = reg.loginFences && reg.loginFences[pid];
    if (!st || typeof st !== 'object') return { fences: [], scrubs: [] };
    const norm = B.normalizeLoginFenceState(st);
    return {
      fences: norm.fences.map((f) => ({ ...f })),
      scrubs: norm.scrubs.map((s) => ({ ...s })),
    };
  }
  function saveLoginFenceState(profileId, { fences = [], scrubs = [], guards = [] } = {}) {
    ensureLoaded();
    const pid = String(profileId || '');
    if (!pid || !B.isProfileId(pid)) return false;
    if (!reg.loginFences || typeof reg.loginFences !== 'object') reg.loginFences = {};
    const norm = B.normalizeLoginFenceState({ fences, scrubs, guards });
    const next = norm.fences.length || norm.scrubs.length ? norm : null;
    const prev = reg.loginFences[pid] || null;
    if (JSON.stringify(prev) === JSON.stringify(next)) return true;
    if (next) reg.loginFences[pid] = next;
    else delete reg.loginFences[pid];
    commit();
    return true;
  }
  /** lane vault-login r29: THE ONE channel check for `fill --vault` and `vibespace-vault request --kind login`.
   *  Resolves which browser this call targets (explicit `profileId`, else `B.resolveHandle` on `setFor(browserKey)` without
   *  mutating `told`), computes `usableProfiles` + `restrictedCount` among local mediated named profiles for THIS conversation,
   *  and delegates to PURE `M.leaseRoadVerdict` + `M.loginFillChannelVerdict`. */
  function loginChannelFor({ profileId = null, browserKey = '', ownerKey = '', handle = '', subagent = false, remoteSession = false, agentFacts = null, action = 'fill' } = {}) {
    ensureLoaded();
    const bk = String(browserKey || '');
    const parentBk = ownerKey ? B.parentKeyOf(String(ownerKey)) : B.parentKeyOf(bk);
    const proxy = !!(mediator && mediationOn() && typeof mediator.grantFor === 'function');
    const g = agentFacts && typeof agentFacts === 'object'
      ? {
          keys: Array.isArray(agentFacts.conversationKeys) && agentFacts.conversationKeys.length ? agentFacts.conversationKeys : keysOfKey(parentBk),
          ids: Array.isArray(agentFacts.taskIds) ? agentFacts.taskIds : groupsOfKey(parentBk).ids,
          unreadable: Boolean(agentFacts.groupsUnreadable),
        }
      : groupsOfKey(parentBk);
    const isLocalMediatedCandidate = (np) => {
      if (!np || isEph(np) || np.legacy || np.host) return false;
      const nrec = reg.browsers[np.id] || null;
      if (nrec && (!isLocalRec(nrec) || nrec.external)) return false;
      const nprow = rowOf(np.provider);
      return Boolean(nprow && nprow.starts && nprow.cdp !== false);
    };
    const usableProfiles = [];
    let restrictedCount = 0;
    if (proxy) {
      for (const np of named()) {
        if (!isLocalMediatedCandidate(np)) continue;
        const may = mayAttachL(np, { browserKey: parentBk || bk, conversationKeys: g.keys, taskIds: g.ids, groupsUnreadable: !!g.unreadable });
        if (may && may.ok) usableProfiles.push(np.label || np.id);
        else restrictedCount++;
      }
    }
    let pid = typeof profileId === 'string' && profileId.trim() ? profileId.trim() : '';
    let resolvedEphemeral = false;
    if (!pid) {
      if (!bk) {
        resolvedEphemeral = true;
      } else if (ownerKey) {
        const jv = J.jobResolveVerdict(B.resolveHandle({ set: setFor(String(ownerKey)), handle: String(handle || ''), subagent: false }));
        if (!jv.ok) return jv;
        pid = jv.profileId;
      } else if (B.isChildKey(bk)) {
        resolvedEphemeral = true;
      } else {
        const set = setFor(bk);
        const rv = B.resolveHandle({ set, handle: String(handle || ''), subagent: !!subagent });
        if (rv.ok && rv.kind === 'attachment' && rv.attachment && rv.attachment.profileId) {
          pid = rv.attachment.profileId;
        } else if (rv.ok && rv.kind === 'pin' && rv.profileId) {
          const pinP = profile(rv.profileId);
          const may = pinP ? mayAttachL(pinP, { browserKey: parentBk || bk, conversationKeys: g.keys, taskIds: g.ids, groupsUnreadable: !!g.unreadable }) : null;
          if (pinP && may && may.ok) pid = rv.profileId;
          else resolvedEphemeral = true;
        } else if (rv.ok) {
          resolvedEphemeral = true;
        } else {
          if (action === 'request' && rv.code === 'profile_required' && Array.isArray(set.attachments)) {
            const heldLocal = set.attachments.find((a) => isLocalMediatedCandidate(profile(a.profileId)));
            if (heldLocal) pid = heldLocal.profileId;
          }
          if (!pid) return rv;
        }
      }
    }
    const p = pid ? profile(pid) : null;
    const eph = resolvedEphemeral || !p || isEph(p);
    const rec = p ? (reg.browsers[p.id] || null) : null;
    const prow = p && !eph ? rowOf(p.provider) : null;
    const external = !eph && roadFactsOf(p, rec).external;   // B-19a9 (round wpdtugrv1): the ONE fact helper every road verdict reads
    const hasCdp = eph ? true : Boolean(!prow || prow.cdp !== false);
    const remote = Boolean((p && p.host) || (rec && rec.hostId));
    const remSess = Boolean(remoteSession || (bk && isRemoteKey(bk)));
    const agent = Boolean((!bk || B.isBrowserKey(bk) || B.isChildKey(bk)) && !HM.isHumanKey(bk));
    const road = M.leaseRoadVerdict({
      mediated: Boolean(p && !eph && isMediated(p)),
      proxy,
      ephemeral: eph,
      external,
      remoteSession: remSess,
      paired: roadFactsOf(p, rec).paired,   // B-19a9 (r1846 (b), r2182 (2)): the ONE fact helper; the login channel's own law below still refuses a paired machine
      agent,
    });
    return M.loginFillChannelVerdict(road, {
      proxy,
      external,
      remote,
      remoteSession: remSess,
      hasCdp,
      usableProfiles,
      restrictedCount,
      profileLabel: p && !eph ? (p.label || p.id) : '',
      action,
    });
  }
  /** lane site-reset step 3: the agent's `site-reset <host>` on a SHARED profile files ONE proposal (never runs): the same
   *  record shape as a backend switch's (SW.siteResetProposalFor, `sr-…`), the same card / For-you item / routes. A second
   *  ask on the same (conversation, profile, host) while one stands is the SAME card; a rejection not yet told is told now. */
  function proposeSiteReset({ profileId, host, url = '', browserKey = null, sessionId = null } = {}) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p) return { ok: false, code: 'not-found', error: `no profile ${profileId}` };
    const h = SW.normalizeHost(host);
    if (!h) return { ok: false, code: 'bad-host', error: 'not a host name' };
    const mine = (b) => B.parentKeyOf(String(b.browserKey || '')) === B.parentKeyOf(String(browserKey || '')) && b.profileId === p.id && b.proposal && b.proposal.site === h;
    const prior = [...reg.siteResets].reverse().find(mine) || null;
    const cv = SW.siteResetClaimVerdict({ existing: prior });
    if (cv === 'same' || cv === 'rejected') {
      if (cv === 'rejected') { const st = SW.proposalStep(prior.proposal, { event: 'told' }); if (st.ok) { prior.proposal = st.next; cardOnLanding(prior, 'a rejected site reset told'); } }
      return { ok: true, entry: { ...prior, proposal: { ...prior.proposal } }, duplicate: cv === 'same', rejected: cv === 'rejected' };
    }
    const who = siteResetHolders(p.id);
    const id = 'sr-' + crypto.randomBytes(4).toString('hex');
    const label = String(p.label || '').replace(HC.HIDDEN_RE, ''); // the card's words carry nothing that is not drawn (THE one set)
    const proposal = SW.siteResetProposalFor({ id, host: h, url, profileId: p.id, profileLabel: label, holders: Math.max(1, who.holders), human: who.human, at: now() });
    const entry = { id, at: now(), browserKey: browserKey || null, sessionId: sessionId || null, profileId: p.id, host: h, url: proposal.url, by: 'agent', proposal };
    const kept = SW.blockedKeep([...reg.siteResets, entry]);
    reg.siteResets = kept.keep;
    const resetLanded = commitSync();
    for (const d of kept.dropped) if (d.proposal && SW.blockedRank(d) >= 2) { log.warn?.(`[browser] the site-reset store is full — proposal ${d.id} (${d.proposal.state}, ${d.host}) was dropped to make room`); emitProposal({ ...d, dropped: true }); }
    log.log?.(`[browser] ${browserKey || '?'} proposes clearing ${h}'s stored login in the shared profile ${p.id} ("${label}") — proposal ${id}, ${who.holders} conversation(s)${who.human ? ' + the user\'s own tab' : ''}`);
    cardOnLanding(entry, 'a site reset\'s card', resetLanded);   // the census cure ((b)): the card over a proposal on disk
    return { ok: true, entry: { ...entry, proposal: { ...proposal } }, duplicate: false, rejected: false };
  }
  /** Open `url` in THIS lease's own tab of profile `profileId` (the switch's re-open, for one lease): `tab new` under the
   *  lease's session, pinned when the CLI pins; the new targetId written back. `{ok, targetId, error}`. */
  async function openInLease({ profileId, browserKey, url }) {
    ensureLoaded();
    const p = profile(profileId);
    const l = p ? B.findLease(reg.leases, p.id, browserKey) : null;
    if (!p || !l) return { ok: false, error: 'no lease of this conversation on that profile' };
    const o = await leaseCliOpts(p.id, l.browserKey);
    if (!o) return { ok: false, error: noCdpError(p) };
    const pinTab = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
    // lane browser-windows (U1): in a WINDOW OF ITS OWN (openOwnTab admits a mediated lease's tab before its session binds it)
    const r = await openOwnTabMarked(p, l.browserKey, { url: String(url || ''), ns: nsOf(p.id), opts: o, pin: pinTab ? ['--pin-tab'] : [] });
    const targetId = r.targetId || null;
    if (r.ok && targetId) { l.targetId = String(targetId); l.lastUrl = String(url || ''); if (r.window === 'own') { l.windowIn = WIN.instanceOf(reg.browsers[p.id]); if (WIN.windowIdOf(r.windowId) != null) l.windowId = WIN.windowIdOf(r.windowId); } if (mediator && isMediated(p)) mediator.admitTarget(p.id, l.browserKey, l.targetId); commit(); } // T2 ⑧: in the holder's one window (re-minted only when it was lost)
    return { ok: !!r.ok, targetId: targetId ? String(targetId) : null, error: r.ok ? null : (String(r.error || '').trim().slice(0, 200) || 'open failed') };
  }
  function blockedFor({ browserKey = null, profileId = null } = {}) {
    ensureLoaded();
    return reg.blocked.filter((b) => (!browserKey || b.browserKey === browserKey) && (!profileId || b.profileId === profileId)).map((b) => ({ ...b, text: SW.blockedText(b) }));
  }
  function clearBlocked(id) {
    ensureLoaded();
    const n = reg.blocked.length;
    reg.blocked = reg.blocked.filter((b) => b.id !== String(id));
    if (reg.blocked.length !== n) commitSync();
    return reg.blocked.length !== n;
  }
  /** Per-site memory (§7.4 / §7.6 rule 2): a claim keyed by EXACT host, with
   *  who made it; `tier` is legal only while `backend` is null. */
  function addSiteHint(h = {}) {
    refuseIfHeld('a site hint');   // the B-f276 remainder: refused by name while the registry is held (nothing minted, nothing written)
    ensureLoaded();
    const v = SW.siteHintVerdict({ ...h, at: now(), providerIds: providerIds() });
    if (!v.ok) throw namedError(v.code, v.error);
    reg.siteHints = [...reg.siteHints.filter((x) => x.host !== v.value.host), v.value];
    commitSync();
    return { ...v.value };
  }
  function dropSiteHint(host) {
    ensureLoaded();
    const h = SW.normalizeHost(host);
    const n = reg.siteHints.length;
    reg.siteHints = reg.siteHints.filter((x) => x.host !== h);
    if (reg.siteHints.length !== n) commitSync();
    return reg.siteHints.length !== n;
  }
  function siteHints() { ensureLoaded(); return reg.siteHints.map((h) => ({ ...h })); }

  // ── §3.5 boot reconciliation + adoption ──
  function reconcile({ graceMs = 0 } = {}) {
    ensureLoaded();
    // lane jobs-browser: a job handle whose job is not running (finished, archived, unknown) is released — evidence, at
    // boot and on every tick (a run that ended without its finalize hook too)
    for (const { handle } of J.jobChildrenToRelease(reg.children, jobRunning)) releaseJobHandle(handle, 'its job is not running');
    const live = liveKeys();
    const r = B.reconcileLeases({ leases: reg.leases, liveKeys: live, now: now(), graceMs });
    for (const d of r.dropped) {
      const rec = reg.browsers[d.lease.profileId];
      if (rec && !r.kept.some((l) => l.profileId === d.lease.profileId)) rec.lastLeaseDroppedAt = now();
      if (d.lease.profileId) dropInputsFor(d.lease.browserKey, d.lease.profileId); // P3
      if (mediator && d.lease.profileId) mediator.revoke({ profileId: d.lease.profileId, browserKey: d.lease.browserKey }); // P6
      // verify r2 (orphan tabs): the conversation's page stays in a live shared browser — remembered, so a tab the user TAKES
      // later is never returned to by its session (adoptOrphan marks it); a mediated one's tabs closed with its grant
      noteLeftTab(d.lease.profileId, d.lease.browserKey);
      log.log?.(`[browser] dropped the lease of ${d.lease.browserKey} on ${d.lease.profileId}: ${d.why}`);
      emitLease({ kind: 'lease-dropped', browserKey: d.lease.browserKey, profileId: d.lease.profileId, sessionId: d.lease.sessionId || null, why: d.why, ...(isEph(profile(d.lease.profileId)) ? { ephemeral: true, child: B.isChildKey(d.lease.browserKey) } : {}) });
    }
    // P3: an EPHEMERAL takeover (no lease) dies with its session too
    for (const k of [...inputs.keys()]) if (k.endsWith('|ephemeral') && !B.keyCarried(k.slice(0, -'|ephemeral'.length), live)) dropInputsFor(k.slice(0, -'|ephemeral'.length), null);
    reg.leases = r.kept;
    // §3.7: a child handle lives exactly as long as its parent is carried —
    // the same rule and the same grace as a lease (at boot, at once).
    const t = now();
    for (const [k, c] of Object.entries(reg.children)) {
      if (!c || typeof c !== 'object') { delete reg.children[k]; continue; }
      if (B.keyCarried(k, live)) { if (c.carrierLostAt) c.carrierLostAt = null; continue; }
      if (!(graceMs > 0) || (c.carrierLostAt && t - c.carrierLostAt >= graceMs)) { delete reg.children[k]; r.dropped.push({ lease: { browserKey: k, profileId: null }, why: 'child handle: no live session carries its parent' }); log.log?.(`[browser] reaped child handle ${k} (parent ${c.parent || B.parentKeyOf(k)} not carried)`); continue; }
      if (!c.carrierLostAt) { c.carrierLostAt = t; r.stamped.push(c); }
    }
    // and what a dead conversation was told is nobody's memory any more
    for (const k of Object.keys(reg.told)) if (!B.keyCarried(k, live) && !(graceMs > 0)) delete reg.told[k];
    // §7.4: a dead conversation's `blocked` claims go with it at boot
    if (!(graceMs > 0)) reg.blocked = reg.blocked.filter((b) => !b.browserKey || B.keyCarried(b.browserKey, live));
    if (!(graceMs > 0)) reg.siteResets = reg.siteResets.filter((b) => !b.browserKey || B.keyCarried(b.browserKey, live)); // lane site-reset: the same rule
    // takeover C3 (§5.2): a managed ephemeral record whose lease is gone (no
    // live session carries its conversation — after the same grace as any
    // lease) is stopped and REMOVED by itself; a named profile never is
    const orphanEph = reg.profiles.filter((p) => isEph(p) && !reg.leases.some((l) => l.profileId === p.id));
    for (const p of orphanEph) log.log?.(`[browser] ephemeral ${p.id} "${p.label}": no live session carries ${p.owner.id} — stopping it and removing the record`);
    r.retired = retireInSteps(orphanEph.map((p) => p.id)); // keeper-sweep-yields L1: bounded steps, never one loop turn
    r.retiring = orphanEph.map((p) => p.id);
    return r;
  }
  /** P4 boot adoption of a record whose process is not here: re-forward the
   *  port and re-ask — an external browser must still answer /json/version, a
   *  paired machine must still report the daemon active (then its cdp url is
   *  re-read and re-forwarded). Unreachable ⇒ recorded stopped WITH the
   *  reason; nothing is ever signalled from here. */
  async function adoptRemote(rec, p) {
    const ended = (why) => { rec.state = 'stopped'; rec.lastError = why; rec.endedAt = now(); rec.forward = null; rec.cdpUrl = null; log.warn?.(`[browser] ${rec.profileId} not adopted at boot: ${why}`); };
    if (!p) return ended('its profile is gone');
    try {
      if (rec.external) {
        const fwd = await acc().forwardCdp(p.host, p.cdpPort);
        const probe = await probeCdp(fwd.url);
        if (!probe.ok) { try { fwd.close(); } catch { /* none */ } return ended(`no browser answers CDP at ${p.host ? p.host + ':' : '127.0.0.1:'}${p.cdpPort} (${probe.error})`); }
        rec.cdpUrl = fwd.url; rec.forward = p.host ? { remotePort: p.cdpPort, localPort: fwd.localPort } : null; rec.state = 'ready'; rec.adoptedAt = now();
        log.log?.(`[browser] adopted ${rec.profileId} "${p.label}" (external browser over CDP)`);
        return;
      }
      const st = await acc().call(rec.hostId, 'status', { profileId: rec.profileId });
      if (!st.active) return ended(`${rec.hostId} reports the browser daemon gone`);
      const cdp = await acc().call(rec.hostId, 'cdp-url', { profileId: rec.profileId });
      const fwd = await acc().forwardCdp(rec.hostId, cdp.port, { remoteUrl: cdp.url });
      rec.pid = st.pid; rec.starttime = st.starttime; rec.remoteCdpUrl = cdp.url; rec.cdpUrl = fwd.url; rec.forward = { remotePort: cdp.port, localPort: fwd.localPort };
      if (mediator) mediator.repoint(rec.profileId, rec.cdpUrl); // B-19a9 (r1846 (c), round wpdtugrv1 MUST 2): the PAIRED adoption's new forward is its scope leases' upstream
      rec.state = 'ready'; rec.adoptedAt = now();
      log.log?.(`[browser] adopted ${rec.profileId} "${p.label}" on ${rec.hostId} (daemon pid ${rec.pid} there)`);
    } catch (e) { ended(`${rec.hostId || 'this machine'} could not be asked (${e.message})`); }
  }
  /** lane engine-spi-egress L3: a record a boot MIGRATION marked (`endAtBoot = {why, by}` — the migration's words; the keeper
   *  names no reason of its own) is ENDED by identity at the first boot of the new version, BEFORE it is adopted and before any
   *  proxy is re-bound (the road that launched it may no longer exist): the daemon by pid + starttime, then its browser by the
   *  record's directory (reapOrphan); a pid that is another process now is never signalled. Said in the journal and on the row. */
  async function endMarked(rec, p) {
    const m = rec.endAtBoot; delete rec.endAtBoot; dirty = true;
    const why = String((m && m.why) || 'closed at the update').replace(/[\0-\x1f\x7f]/g, ' ').slice(0, 300);
    const verdict = pidVerdictOf(rec);
    const result = verdict === 'ours' ? await endProcess(rec.pid, rec.starttime, { termMs: 5000 }) : verdict;
    rec.state = result === 'survived' ? 'failed' : 'stopped'; rec.endedAt = now();
    rec.lastError = `${why} — ended at the update (${result})`; rec.note = O.endedNote({ why, at: now() });
    log.warn?.(`[browser] ${rec.profileId} "${p ? p.label : ''}" ended at the update: ${why} (daemon pid ${rec.pid}: ${result}${m && m.by ? '; marked by ' + String(m.by).slice(0, 60) : ''})`);
    if (isEph(p)) keptNote('stop', p, { why: 'restart' }); else tabsLost(rec.profileId, 'the update that closed it');
    if (daemonGone(rec)) reapOrphan(rec, 'boot'); // its browser follows, proven by its directory (boot awaits every reap)
    if (rec.launch === 'attach') endDisplay(rec, 'a browser closed at the update');
  }
  /** round 2 (law C): why THIS version cannot read a live record (null = it can): a provider its table has no row for, or an egress
   *  record whose shape names no engine (the removed anti-bot backend's old shape — every engine egress names its engine). */
  function unreadableRecordWhy(rec, p) {
    const prov = p && p.provider ? String(p.provider) : '';
    if (prov && !rowOf(prov)) return `its profile names a browser backend this version does not have («${prov.replace(/[^\w:.-]/g, '').slice(0, 40)}»)`;
    const e = rec && rec.egress;
    // B-8b87 cure: a PROFILE PROXY's forwarder (no engine, its proxy readable) is this version's own shape — adopted and re-bound on its port
    if (e && typeof e === 'object' && !(typeof e.engine === 'string' && e.engine) && !proxyOfRecord(e.proxy)) return 'its site-list proxy is a shape this version does not read (no engine names it)';
    return null;
  }
  async function adoptAll() {
    ensureLoaded();
    for (const rec of Object.values(reg.browsers)) {
      if (!B.isLiveBrowser(rec)) { if (rec && rec.endAtBoot) { delete rec.endAtBoot; dirty = true; } continue; } // a mark on a stopped record has nothing to end
      const p = profile(rec.profileId);
      // lane engine-spi-egress L3: a marked record is never adopted, never re-bound (a paired machine's is never signalled from here)
      if (rec.endAtBoot) { if (isLocalRec(rec)) { await endMarked(rec, p); continue; } log.warn?.(`[browser] ${rec.profileId}: a mark to end it at the update is dropped — its browser runs on a paired machine, which is never signalled from here`); delete rec.endAtBoot; dirty = true; }
      // round 2 (主开发's law C): a live record THIS version cannot read — its profile names a provider the table has no row for, or
      // its egress is a shape with no engine (what a FAILED migration leaves on a running browser of the removed anti-bot backend:
      // its provider id, its old proxy shape) — is ended like a marked one (by identity, or let go), said; never adopted behind an
      // engine row that refuses every site. A paired machine's is never signalled from here: it is stopped on the record, said
      const unread = unreadableRecordWhy(rec, p);
      if (unread) {
        if (isLocalRec(rec)) { rec.endAtBoot = { why: unread, by: 'this version' }; await endMarked(rec, p); continue; }
        rec.state = 'stopped'; rec.endedAt = now(); rec.lastError = `${unread} — not adopted (its browser runs on a paired machine, which is never signalled from here)`; dirty = true;
        log.warn?.(`[browser] ${rec.profileId}: ${rec.lastError}`); continue;
      }
      if (!isLocalRec(rec)) { await adoptRemote(rec, p); continue; }
      const verdict = pidVerdictOf(rec);
      let active = false, own = null;
      // takeover C3: a managed ephemeral browser is asked under the session pairs it was started with
      if (verdict === 'ours' && rec.launch === 'attach') active = (await probeCdp(rec.cdpUrl, { timeoutMs: 2500 })).ok; // lane one-browser-b1: Chrome itself answers
      else if (verdict === 'ours') {
        let i = null; try { i = isEph(p) && Array.isArray(rec.envPairs) ? await rt.info(null, { extraEnv: pairsEnv(rec.envPairs) }) : await rt.info(rec.ns, { dir: p ? p.dir : null }); } catch { i = null; }
        active = !!(i && i.active);
        // lane browser-daemon-survives-update: RE-OWNED only when its PAGE answers — `session info` answers active:true with its
        // Chrome dead or wedged (measured 0.38.2) — else the daemon is ENDED by identity (its browser after it), never left
        // running unowned; a machine with no browser CLI to ask keeps the old reading (the record stops, nothing signalled)
        if (cliAsked(i)) {
          own = O.reownVerdict({ daemonAnswered: !!(i && i.ok), active, ask: active ? await askPages(rec) : null });
          if (own.act === 'end') { own.result = await endProcess(rec.pid, rec.starttime, { termMs: 5000 }); active = false; }
          log.log?.(`[browser] ${O.reownLine({ pid: rec.pid, profileId: rec.profileId, label: p ? p.label : '', act: own.act, why: own.why, result: own.result || null })}`);
        }
      }
      const v = B.adoptVerdict(rec, { verdict, active });
      if (!v) continue;
      // lane engine-spi-egress r2: a WRAPPED browser is ready only behind ITS proxy again — re-bound on the port its launch view
      // names; a port another program holds ⇒ ended by identity, said by name (never left behind a dead or a foreign proxy)
      if (v.state === 'ready' && rec.egress) { const eg = await egressAdopt(rec); if (!eg.ok) { egressNotice(rec, p, eg); own = { act: 'end', why: eg.error, result: await endProcess(rec.pid, rec.starttime, { termMs: 5000 }) }; v.state = 'failed'; } }
      if (own && own.act === 'end') { v.lastError = `${own.why} — its daemon was ended at the restart (${own.result})`; rec.note = O.endedNote({ why: own.why, at: now() }); }
      if (v.state === 'ready' && p && rec.cdpUrl && agentRoadOf(p).mode && mediator && typeof mediator.adopt === 'function') {   // (lane chrome-157: THE WINDOW's fourth door, W6 — a hub that stopped mid-download left the profile's folder an agent's: put back before this profile's first grant, tried again, said by the mediator when it could not be)
        mediator.adopt(p.id, rec.cdpUrl).catch(() => { });
      }
      if (v.state === 'ready') { rec.state = 'ready'; rec.adoptedAt = now(); recaptureBrowser(rec, 'boot'); if (rec.closed && rec.closed.code === 'browser_unstable' && rec.closed.unstable === 'failing') bootRejudge.add(rec.profileId); // lane browser-unstable-rejudge
        log.log?.(`[browser] adopted ${rec.profileId} "${p ? p.label : ''}" (daemon pid ${rec.pid})`); if (isEph(p)) keptNote('start', p); if (p) { const gp = geoPlanFor(p); if (gp && gp.kind === 'place') { try { await armGeo(p, rec, gp, { after: 'restart' }); } catch { /* a restart's arm never throws: refused, it leaves the browser running denied (r1707 (5)) */ } } } }   // B-9584 U2c: a place held again (the stored denial stood while VibeSpace was down); inside the ready block — the release's else stays its own
      else {
        rec.state = v.state; rec.lastError = v.lastError; rec.endedAt = now(); log.warn?.(`[browser] ${rec.profileId} ${v.state} at boot: ${v.lastError}`);
        if (isEph(p)) keptNote('stop', p, { why: 'restart' }); // lane browser-resume: it died while VibeSpace was down — its last persisted tabs are kept (D2: reopened at its next start)
        else tabsLost(rec.profileId, 'a boot that could not adopt it (a pod roll, a crash while VibeSpace was down)'); // lane profile-lock-roll (L2)
        if (daemonGone(rec)) reapOrphan(rec, 'boot'); // r2 M1: the daemon died while VibeSpace was down — its browser is ended too
        if (rec.launch === 'attach') { if (verdict === 'ours') await endProcess(rec.pid, rec.starttime); endDisplay(rec, 'a boot that could not adopt its browser'); } // lane one-browser-b1: an unanswering Chrome of ours is ended, its display goes with it
      }
    }
  }
  /** The boot path (§3.5), in this order and no other: drop every lease nobody
   *  carries, THEN judge each recorded browser, THEN start the tick. Runs
   *  after restoreSessions so `liveKeys` is final. */
  async function boot() {
    ensureLoaded();
    // the B-f276 remainder: on a HELD registry the boot's path judges NOTHING (its reconcile retired, adoptAll skipped, the orphan census
    // ENDED every daemon it could not name, the first commit wrote the empty registry over the file) — it runs once at the read
    if (heldReg) { bootOwed = true; log.warn?.(`[browser] the boot's reconcile, adoption and orphan census wait for ${STORE_FILE} to read`); return { held: true, droppedLeases: 0, browsers: 0, humans: 0 }; }
    // its read r3 (S7): what restored conversations owe is judged FIRST — before the reconcile and the adoption
    if (owedPins.size) { try { judgeOwedPins(); } catch (e) { log.warn?.(`[browser] the pins restored conversations owed: ${e && e.message}`); } }
    const r = reconcile({ graceMs: 0 });
    await r.retired;
    await adoptAll();
    await Promise.allSettled([...reaping.values()]); // r2 M1
    await orphanCensus('boot', now(), { force: true }); // lane daemon-orphan-end: the boot sweep (after restoreSessions: liveKeys is final)
    // BROWSE YOURSELF verify r1 (H4): a restored holder of the user's whose browser did not survive the restart ends
    // `stopped` (his tab went with it); one on an adopted browser stays away — kept, counted by the idle clock, continued
    for (const h of [...humans.values()]) if (!B.isLiveBrowser(reg.browsers[h.profileId])) await endHuman(h.profileId, 'stopped', { closeTab: false });
    commit();
    if (Object.values(reg.browsers).some(B.isLiveBrowser) || reg.leases.length || humans.size || orphanPending) startTimer();
    disk.start(); // lane browser-disk-sample: the minute clock of the disk sample (unref'd; stopped profiles are measured too)
    // B-0b8c: the act's version, asked once at boot (not awaited) — a miss starts THE ladder; the notice waits for its end
    if (bf.lastVersion() === undefined) { try { bf.probeVersion().catch(() => { }); } catch { /* the state says it */ } }
    return { droppedLeases: r.dropped.length, browsers: Object.values(reg.browsers).filter(B.isLiveBrowser).length, humans: humans.size };
  }

  // ── the tick: carrier grace, idle, the resource REPORT ──
  async function tick() {
    ensureLoaded();
    if (heldReg) return;   // the B-f276 remainder: nothing is judged on a held registry
    warmCliVersions(); // verify r3 (Y1): the row's sync readers see a replaced binary's version within a tick
    const t = now();
    refreshOom(); forgetEndedRuns(); // B-346d's recorder (r1311): the counter's own flight (never awaited) + runs no longer live forgotten
    const r = reconcile({ graceMs: B.LEASE_DROP_GRACE_MS });
    if (r.dropped.length || r.stamped.length) dirty = true;
    await r.retired;
    reconcileDisplays(); // lane one-browser-b1: a display-only session no live attach record names is stopped
    const asks = []; // lane browser-unresponsive: each live local browser's `/json/version` ask (parallel, awaited below)
    for (const rec of Object.values(reg.browsers)) {
      if (!B.isLiveBrowser(rec) || stopping.has(rec.profileId) || starting.has(rec.profileId)) continue;
      const p = profile(rec.profileId);
      // takeover C3: an ephemeral daemon's CLI owns its idle clock — a gone
      // pid is stopped, not an error (an idle-out, or B-346d: ended before its idle timeout, said so); the next verb restarts it
      // (verify r2 L4: dead OR recycled — a pid that is another process now is not the daemon; M1: its browser is ended)
      if (isEph(p) && daemonGone(rec)) { markEphemeralGone(rec); continue; }
      // P4: a process on a paired machine / an external browser is never
      // pid-judged or sampled here (the pid is not ours, or not local)
      if (isLocalRec(rec) && daemonGone(rec)) { markDaemonGone(rec, 'the tick'); healAttach(rec, 'the tick'); continue; } // lane one-browser-b1: an attach Chrome under a holder is started again
      if (isLocalRec(rec)) { try { aliveSeen(rec, t); } catch { /* the recorder never stops the tick (r1311 (1)) */ } } // B-346d's recorder (a): this tick saw its daemon alive
      // verify r3 M1 (a): the daemon is ours — its browser record follows an in-place relaunch (re-captured from the lock)
      // r4 MAJOR 1: a daemon with no browser is healed by the tick while a lease holds it (a conversation is using it); an
      // unleased one waits for its next start / view (or its idle clock) — nobody is asking for a window to reappear
      if (isLocalRec(rec) && rec.state === 'ready') { await followRelaunch(rec, 'the tick', { heal: leasedNow(rec.profileId) }); if (stopping.has(rec.profileId) || reg.browsers[rec.profileId] !== rec) continue; }
      if (p && isLocalRec(rec) && rec.state === 'ready' && rec.cdpUrl) asks.push(askAnswer(rec, p, 'the tick'));
      // BROWSE YOURSELF (B-6ae8): the user's own holder row counts — a browser he browses (or keeps while away) is USED
      const idle = B.browserIdle(rec, holdersOn(rec.profileId), t, idleMs());
      if (idle.expired) { stop(rec.profileId, { why: 'idle' }).catch(() => { }); continue; }
      const g = guard.get(rec.profileId) || { prev: null, hotSince: 0, lastSampleAt: 0 };
      if (isLocalRec(rec) && t - g.lastSampleAt >= sampleEvery) {
        // 2026-09-25: the tree sample is AWAITED (ΣPss via smaps_rollup, ≈1.1 ms per pid, on the libuv pool); the slot
        // is claimed first so an overlapping tick never samples twice, and a record stopped meanwhile is left alone
        g.lastSampleAt = t; guard.set(rec.profileId, g);
        const s = rec.pid ? await F.treeUsage(rec.pid) : null;
        if (stopping.has(rec.profileId) || reg.browsers[rec.profileId] !== rec || !B.isLiveBrowser(rec)) continue;
        // ONE verdict module (src/runaway-guard.js): memory = the sample's footprint metric (PSS), never an RSS sum.
        // REPORT ONLY (the owner's 2026-09-25 ruling): the browser keeps running whatever the sample says.
        const lim = RG.providerGuard(p ? p.provider : 'chromium', limits);
        const v = RG.resourceVerdict(s, g.prev, g.hotSince, t, { limits: lim });
        // lane browser-unresponsive: the GPU process's own share (a notice names it when it is the one over)
        const gpuPct = s && s.gpu && g.prev && g.prev.gpu && g.prev.gpu.pid === s.gpu.pid && t > g.prev.at ? (s.gpu.cpuTicks - g.prev.gpu.cpuTicks) * 1000 / (t - g.prev.at) : null;
        g.prev = s ? { at: t, cpuTicks: s.cpuTicks, gpu: s.gpu || null } : null; g.hotSince = v.hotSince;
        const lvl = RG.reportTransition(g.report, v, { now: t, limits: lim }); g.report = lvl.state;
        // ONE notice per CAUSE (never one per profile): a CPU crossing while memory is already reported is its own report
        const vc = v.overKind === 'memory' && v.cpuOver ? { ...v, over: v.cpuOver, overKind: 'cpu' } : v.overKind === 'cpu' ? null : { ...v, over: null, overKind: null, clear: !v.hotSince };
        const lvc = vc ? RG.reportTransition(g.cpuReport, vc, { now: t, limits: lim }) : null; if (lvc) g.cpuReport = lvc.state;
        guard.set(rec.profileId, g);
        if (s) { const was = live.get(rec.profileId); live.set(rec.profileId, { gpu: s.gpu && Number.isFinite(gpuPct) ? { pid: s.gpu.pid, cpuPct: gpuPct, drawing: drawingOf(rec, p)?.title || null } : null, cpuPct: v.cpuPct, memBytes: s.memBytes, memMetric: s.memMetric, rssBytes: s.rssBytes /* deprecated: ΣVmRSS, never judged — one release */, pids: s.pids.length, over: v.over, since: v.over ? ((was && was.over && was.since) || t) : null, sampledAt: t }); dirty = true; }
        if (v.memGuard === 'unavailable' && !g.memOffSaid) { g.memOffSaid = true; log.warn?.(`[browser] ${RG.memGuardOffLine(rec.profileId, s)}`); }
        const label = p ? p.label : rec.profileId;
        if (lvl.fire) {
          log.warn?.(`[browser] ${rec.profileId} "${label}" (${s.pids.length} process(es)) is over the reporting threshold: ${v.over} — reported, left running`);
          try { getTelemetry()?.record?.({ kind: 'event', name: RESOURCE_METRIC, detail: `${label}: ${v.over}`, value: Math.round((s.memBytes || 0) / 1048576) }); } catch { /* optional */ }
        }
        if (lvl.notify) {
          const who = isEph(p) ? `The agent browser of "${label}"` : `The agent browser of profile "${label}"`;
          let delivered;
          try { delivered = serverNotice?.(`browser-resource:${rec.profileId}:${lvl.state.crossings}`, RG.resourceNoticeText({ who, where: 'Browser panel', verdict: v, sample: s, gpuPct, drawing: drawingOf(rec, p) }), { level: 'warn' }); } catch (e) { log.warn?.(`[browser] ${rec.profileId}: the resource notice failed: ${e && e.message}`); }
          g.report = RG.reportDelivery(g.report, delivered);
        }
        if (lvc && lvc.fire) log.warn?.(`[browser] ${rec.profileId} "${label}" is over the reporting threshold: ${vc.over}${Number.isFinite(gpuPct) ? ` (GPU process ${Math.round(gpuPct)} %)` : ''} — reported, left running`);
        if (lvc && lvc.notify) {
          const who = isEph(p) ? `The agent browser of "${label}"` : `The agent browser of profile "${label}"`;
          let delivered;
          try { delivered = serverNotice?.(`browser-resource:${rec.profileId}:cpu:${lvc.state.crossings}`, RG.resourceNoticeText({ who, where: 'Browser panel', verdict: vc, sample: s, gpuPct, drawing: drawingOf(rec, p) }), { level: 'warn' }); } catch (e) { log.warn?.(`[browser] ${rec.profileId}: the CPU notice failed: ${e && e.message}`); }
          g.cpuReport = RG.reportDelivery(g.cpuReport, delivered);
        }
      }
    }
    await Promise.allSettled(asks); // lane browser-unresponsive: bounded by BS.ANSWER_ASK_MS
    await Promise.allSettled([...reaping.values()]); // r2 M1: every orphan this tick found is ended before it returns
    await orphanCensus('the tick', t); // lane daemon-orphan-end: a daemon nobody holds, ended by identity after the grace
    if (dirty) commit();
    // P3 (§4.3): a takeover somebody walked away from hands back by itself, a
    // pending confirmation the daemon has already auto-denied is forgotten.
    sweepIdleTakeovers(t);
    await sweepHumans(t); // BROWSE YOURSELF: an away holder past its keep ends `left`; one whose browser stopped ends `stopped`
    sweepPending();
    sweepIdleReleases(t); // MULTIVIEW B-325a
    await sweepIdlePaint(t); // lane browser-swiftshader-cpu
    refreshKeptTabs(t); // lane browser-resume: a running conversation browser nobody mirrors — its tabs read every 30 s (a crash keeps them)
    if (!Object.values(reg.browsers).some(B.isLiveBrowser) && !reg.leases.length && !inputs.size && !pending.size && !humans.size && !orphanPending) stopTimer();
  }
  function startTimer() {
    if (timer) return;
    timer = setInterval(() => { tick().catch((e) => log.warn?.(`[browser] tick failed: ${e.message}`)); }, tickMs);
    if (timer.unref) timer.unref();
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  /** Timers only — the browsers SURVIVE a VibeSpace exit by design (adopted next boot). */
  function shutdown() { try { offCapLift(); } catch { } try { tqHold.stop(); } catch { /* r3261: the requests' read again ends with the keeper */ } detachGrants(); if (heldReg && owedPins.size) log.warn?.(`[browser] ${owedPins.size} conversation pin(s) owed to ${STORE_FILE}'s read are not judged in this process (${[...owedPins.keys()].slice(0, 8).join(', ')}) — a conversation restored at the next start owes its pin again; one that is not restored then starts from its own pin or the defaults`); heldStopped = true; if (heldT) { clearTimeout(heldT); heldT = null; } stopTimer(); if (cliTimer) { clearInterval(cliTimer); cliTimer = null; } if (cliNoteTimer) { clearTimeout(cliNoteTimer); cliNoteTimer = null; } disk.stop(); try { bf.stop?.(); } catch { /* B-0b8c: the version ladder's rung is this keeper's to end */ } if (dirty || sweepDirty) { sweepDirty = false; save(); } installs.shutdown(); /* keeper-sweep-yields K1: what the walk deferred (sweepDirty) is written at the stop too */ /* lane chrome-builds-download: an in-process download ends with its keeper (the marker stays: the next keeper judges it) — lane dc-browser-installs: the running row's own shutdown */ try { keptStore()?.shutdown?.(); } catch { /* lane browser-resume: the kept store's throttled tab list is flushed with its feeder */ } try { mediator?.shutdown?.(); } catch { /* P6: the proxy is this keeper's to end */ } try { const ents = [...egressProxies.values()]; egressProxies.clear(); for (const e of ents) e.px.close().catch(() => {}); } catch { /* the egress proxies are this keeper's to end (r2: a surviving browser's port is re-bound by the next keeper's adoption) */ } }
  const ensureTimer = () => { if (Object.values(reg.browsers).some(B.isLiveBrowser) || reg.leases.length || inputs.size || pending.size || humans.size) startTimer(); };
  const attachTimed = async (a) => { const r = await attach(a); ensureTimer(); return r; };

  // ── P2 (§4.2): the stream port of ONE live-view target ──────────────────
  /**
   * lane P verify r2 (F2, 2026-09-26): a view that arrives WHILE a launch runs
   * waits for it. The record reads `starting` (live) from the commit before
   * `rt.launch`, the strip draws it idle and a hollow view reconnects at once;
   * without this wait the view's `stream status` ran under the same pairs while
   * `open` was still launching. The real 0.38.1 serializes it behind `open`
   * (measured — the daemon RESTART the verifier saw came from a client whose
   * idle differed from the launch's, fixed in `startEphemeral`), but a view
   * must never answer from a half-launched record, and a launch that FAILS must
   * be its answer — a `stream status` under the pairs of a browser that never
   * came up spawns a daemon (r1 finding 2): a view starting a browser.
   * `null` = nothing in flight or it settled; else the typed refusal.
   */
  async function launchSettled(profileId) {
    const inFlightLaunch = starting.get(profileId);
    if (!inFlightLaunch) return null;
    try { await inFlightLaunch; return null; } catch (e) { return { ok: false, port: null, code: (e && e.code) || 'launch_failed', error: String((e && e.message) || e) }; }
  }
  /**
   * The port the live view bridges to, for a target `browser-stream.streamTargetFor`
   * decided: an ATTACHMENT (the profile's daemon — never started by a view:
   * a stopped one is refused `browser_stopped` — asked under the
   * lease's own session name `vs-<browserKey>`), a HELPER's (MULTIVIEW), or the session's EPHEMERAL
   * browser (asked with the very pairs it was spawned with; no namespace of
   * ours, nothing started by us). Never throws: `{ok, port, error, code}`.
   */
  async function streamPortFor(target) {
    ensureLoaded();
    if (!target || !target.ok) return { ok: false, port: null, code: (target && target.code) || 'bad-request', error: (target && target.error) || 'no target' };
    const S = require('../browser-stream.js');
    // MULTIVIEW (design-browser-multiview §2 A1): a VIEW NEVER STARTS a
    // browser — the conversation's own, a helper's, or an attachment's (lane P
    // verify: P2's "viewing a held lease starts it" is gone) — a released /
    // stopped / never-started one is said, and the next COMMAND starts it.
    // lane P verify (2026-09-26, finding 1): the rule holds for an ATTACHMENT too — P2's "viewing a held
    // lease starts it" launched a Chromium the user never asked for from a click on a hollow tab
    // 2.369.183 (lanes H + P on one tree): ONE code for "a managed browser that is not running, and a view never starts
    // it" — lane H's shipped `browser_stopped` (lane P had minted `browser_released` for the same verdict); `state` rides
    // so the view tells a browser it WAS showing (greyed, lane H) from a hollow tab it was just switched to (lane P)
    const stoppedRefusal = (e, who) => ({ ok: false, port: null, code: 'browser_stopped', error: `${who} is not running — the agent's next browser command starts it again, and this view reconnects then`, state: e ? e.state : 'not-started' });
    if (target.kind === 'child') {
      // r2 F2: a launch in flight is awaited FIRST — every verdict below reads the settled record
      { const e0 = ephemeralFor(target.handle); if (e0) { const w = await launchSettled(e0.profileId); if (w) return w; } }
      const e = ephemeralFor(target.handle);
      if (!e) return { ok: false, port: null, code: 'no-browser', state: 'not-started', error: 'this helper has not opened its browser yet' }; // lane P verify: not-started ⇒ the view draws it hollow and picks it up by itself
      if (!e.live) return stoppedRefusal(e, 'this helper\'s browser');
      // THAT child's own recorded pairs — never the parent's (they name the parent's browser)
      const pairs = pairsOf(e.profileId);
      if (!pairs || !pairs.length) return { ok: false, port: null, code: 'not_managed', error: 'this helper\'s browser has no recorded pairs on this server — it cannot be viewed' };
      const r = await rt.streamPort(null, { extraEnv: S.pairsToEnv(pairs) });
      return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: (r.code === 'browser_cli_gone' || r.code === 'browser_cli_unconfirmed') ? r.code : 'stream_unavailable', error: r.error };
    }
    if (target.kind === 'ephemeral') {
      // lane H (measured on 0.32.0: `stream status` with no daemon STARTS one under the pairs): a conversation's
      // MANAGED ephemeral browser that is not running is refused BY NAME — a view of it (the auto-opened one
      // reconnecting after an idle-out, the recorder's tap) must never launch a daemon the keeper does not hold;
      // its next verb starts it, its holder row returns and the view reconnects
      const bk = String(target.ns || target.sessionName || '').replace(/^vs-/, '');
      // lane P verify r2 (F2): a launch in flight is awaited FIRST — every verdict below reads the settled record
      { const e0 = bk ? ephemeralFor(bk) : null; if (e0) { const w = await launchSettled(e0.profileId); if (w) return w; } }
      if (bk) judgeEphemeral(bk, 'a view asked for its port'); // VERIFY r1 H2: the PROCESS, not the record (a ready record lies until the tick)
      const e = bk ? ephemeralFor(bk) : null;
      { const eRec = e && e.state === 'ready' ? reg.browsers[e.profileId] : null; if (eRec && isLocalRec(eRec) && !starting.has(e.profileId) && !stopping.has(e.profileId)) recaptureBrowser(eRec, 'a view asked for its port'); } // verify r3 M1 (a)
      if (e && e.state !== 'ready') return { ok: false, port: null, code: 'browser_stopped', state: e.state, ...(e.state === 'stopped' ? { ended: endedFactsOf(reg.browsers[e.profileId]) } : {}), error: e.state === 'starting' ? 'this conversation\'s browser is starting — the view connects when it is ready' : 'this conversation\'s browser is not running (it idled out or was stopped) — the agent\'s next browser command starts it again, and this view reconnects then' };
      // lane P verify (2026-09-26, finding 2): NO record = the conversation has not opened its browser yet
      // (the default target of a live view opened before its first command). `stream status` under its
      // pairs would SPAWN a background daemon on the real 0.38.1 (measured) that nobody records — so only
      // the launch-free `session info` is asked: a daemon an escaped command (or a pre-C3 session) already
      // runs under those very pairs is SHOWN, none ⇒ `no-browser` (not-started), and the view waits.
      if (!e) {
        let info = null;
        try { info = typeof rt.info === 'function' ? await rt.info(null, { extraEnv: S.pairsToEnv(target.envPairs) }) : null; } catch { info = null; }
        if (!info || !info.active) return { ok: false, port: null, code: 'no-browser', state: 'not-started', error: 'this conversation has not opened its browser yet — its next command starts it' };
      }
      const r = await rt.streamPort(null, { extraEnv: S.pairsToEnv(target.envPairs) });
      return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: (r.code === 'browser_cli_gone' || r.code === 'browser_cli_unconfirmed') ? r.code : 'stream_unavailable', error: r.error };
    }
    const p = profile(target.profileId);
    if (!p) return { ok: false, port: null, code: 'not-found', error: `no profile ${target.profileId}` };
    // BROWSE YOURSELF (B-6ae8): the user's own browsing window — its holder must still exist (a view never starts one)
    if (target.kind === 'human' && !humanByKey(target.key)) return { ok: false, port: null, code: 'not_browsing', error: HM.humanRefusalText('not_browsing', { label: p.label }) };
    // P4: the stream server is the LOCAL daemon's; a browser reached over CDP
    // or running on a paired machine has none the hub can bridge yet
    if (p.host || !(B.providerRow(p.provider) || {}).starts) return { ok: false, port: null, code: 'stream_unavailable', error: `"${p.label}" is ${p.host ? 'on ' + p.host : 'an external browser over CDP'} — its live view is not bridged in this release` };
    // lane P verify r2 (F2): a launch in flight is awaited FIRST (`start()` answers a `starting` record at once — its live
    // shortcut precedes its single flight — so the wait cannot be left to it); a failed launch is the answer
    { const w = await launchSettled(p.id); if (w) return w; }
    // NAIVE STUDY 2 (finding 3): A VIEW NEVER STARTS A BROWSER — not an ephemeral one (lane H), not a profile's
    // (P2's "a view of a stopped browser is a start" made a reconnect after the user's Stop relaunch it, the view
    // showing about:blank "Agent is driving" as if a new browser had started). The PROCESS is judged first (the
    // tick's verdict, now); a start somebody else is making is waited for; a stopped browser is refused by name
    // and the view resumes when the digest says it runs again.
    { const rec0 = reg.browsers[p.id]; if (rec0 && rec0.state === 'ready' && isLocalRec(rec0) && !starting.has(p.id) && !stopping.has(p.id) && daemonGone(rec0)) { markDaemonGone(rec0, 'a view asking for its port'); commit(); } } // r2: dead OR recycled; its browser ended (M1)
    if (starting.has(p.id)) { try { await starting.get(p.id); } catch { /* its own verdict */ } }
    if (!reg.browsers[p.id] || reg.browsers[p.id].state !== 'ready') return { ok: false, port: null, code: 'browser_stopped', state: reg.browsers[p.id] ? reg.browsers[p.id].state : 'not-started', error: `"${p.label}"'s browser is not running — the agent's next browser command starts it again, and this view reconnects then` };
    { const recV = reg.browsers[p.id]; if (recV && recV.state === 'ready' && isLocalRec(recV) && !stopping.has(p.id)) await followRelaunch(recV, 'a view asking for its port', { heal: leasedNow(p.id), force: true }); } // verify r3 M1 (a): the cdp url follows too; r4 MAJOR 1: a closed browser is healed — r5 MINOR 2: only while a lease holds it (a view never starts a browser nobody uses: `browser_closed` below, the next command starts it)
    { const cr = closedRefusalOf(p.id); if (cr) return { ok: false, port: null, code: cr.code, error: cr.error, ...(cr.unstable ? { unstable: cr.unstable } : {}) }; } // r4: never a dead port; r6: the unstable kind (the view's words)
    // P6: a mediated lease's stream server is ITS OWN daemon's (the session's
    // namespace over its scoped url) — the profile daemon holds no session of it. BROWSE YOURSELF: the user's own session is
    // NEVER mediated (the mediator fences agents; his tab is outside every agent grant's scope) — the raw url below
    if (isMediated(p) && target.kind !== 'human') {
      const bk = String(target.sessionName || '').replace(/^vs-/, '');
      const rec = reg.browsers[p.id];
      if (!mediationOn() || !rec || !rec.cdpUrl) return { ok: false, port: null, code: 'stream_unavailable', error: `"${p.label}" is shared instance-wide and ${mediationOn() ? 'its browser answered no CDP url' : 'this instance has no mediating proxy'}` };
      sayRetiredSwitch();
      const g = await mediator.grantFor({ profileId: p.id, browserKey: bk, upstream: rec.cdpUrl, paused: () => inputStateFor(bk, p.id).input === 'user', place: () => placeKindFor(p.id) });
      const r = await rt.streamPort(M.mediatedNamespace(p.id, bk), { session: target.sessionName, extraEnv: { AGENT_BROWSER_CDP: g.url, AGENT_BROWSER_IDLE_TIMEOUT_MS: String(idleMs()) } });
      return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: (r.code === 'browser_cli_gone' || r.code === 'browser_cli_unconfirmed') ? r.code : 'stream_unavailable', error: r.error };
    }
    // naive study 2: the lease's own session over the keeper browser's CDP url — never the directory (on 0.38.1 a
    // `stream status` under the lease's session with the directory STARTS a second Chrome, which dies on SingletonLock)
    const o = await leaseCliOpts(p.id, String(target.sessionName || '').replace(/^vs-/, ''));
    if (!o) return { ok: false, port: null, code: 'browser_no_cdp', error: noCdpError(p) };
    const r = await rt.streamPort(target.ns, { session: target.sessionName, extraEnv: o.extraEnv });
    return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: (r.code === 'browser_cli_gone' || r.code === 'browser_cli_unconfirmed') ? r.code : 'stream_unavailable', error: r.error };
  }

  /** lane J (inc-muhgv0fb-9i4u): the PAGE's own viewport reading for a live
   *  view's target — CDP layout metrics of its active tab, asked server-side
   *  (src/server/browser-viewport.js). A profile browser's endpoint is on its
   *  record; an EPHEMERAL one is asked of its daemon under the session's own
   *  pairs (`get cdp-url` — the bridge drops that pair from the mirror, so the
   *  raw endpoint never reaches a viewer). The endpoint is remembered per
   *  target and forgotten on the first failure (a restarted browser has a new
   *  port), then asked once more. Never throws: `{ok, clientWidth, clientHeight}`. */
  const vpUrls = new Map();
  /** The target's CDP endpoint, remembered per target and forgotten on the first failure (a restarted browser has a
   *  new port), then asked once more — shared by the viewport reading (lane J) and the fresh frame (lane S4). lane S4:
   *  a HELPER's browser (kind 'child') resolves under its own recorded pairs (it had no endpoint before: 'p:undefined'). */
  /** lane browser-stuck: the raw CDP endpoint of a LOCAL browser by its profile id (named or a managed ephemeral) — the
   *  dialog watch's upstream; never leaves the server. → {ok, url} | {ok:false, error}. */
  /** lane browser-stuck: do this browser's daemons HOLD page dialogs (launched with noAutoDialog)? A named browser: its
   *  record's launch stamp. An ephemeral one: the config its pairs name (browser-env's spawn file — a conversation spawned
   *  before the lane keeps one without it), else the record's stamp. false ⇒ 0.38.1 accepts alert + beforeunload itself. */
  function pairsHoldDialogs(pairs) {
    const own = S0.pairsToEnv(Array.isArray(pairs) ? pairs : [])[VERBS.CONFIG_KEY];
    if (typeof own !== 'string' || !own.startsWith('/')) return false;
    try { return JSON.parse(fs.readFileSync(own, 'utf8')).noAutoDialog === true; } catch { return false; }
  }
  /** lane browser-propose: does the config the PAIRS name carry the automation flag (browser-env wrote it at spawn)? */
  function pairsAutomationFlag(pairs) {
    const own = S0.pairsToEnv(Array.isArray(pairs) ? pairs : [])[VERBS.CONFIG_KEY];
    if (typeof own !== 'string' || !own.startsWith('/')) return false;
    try { const a = JSON.parse(fs.readFileSync(own, 'utf8')).args; return (Array.isArray(a) ? a : String(a || '').split(/[,\n]/)).map((x) => String(x).trim()).includes(B.AUTOMATION_FLAG); } catch { return false; }
  }
  function holdsDialogsFor(profileId) {
    let p = null; try { p = profile(String(profileId || '')); } catch { p = null; }
    const rec = p ? reg.browsers[p.id] : null;
    if (!p || !rec) return false;
    if (isEph(p)) {
      const own = S0.pairsToEnv(pairsOf(p.id) || rec.envPairs || [])[VERBS.CONFIG_KEY];
      if (typeof own === 'string' && own.startsWith('/')) { try { return JSON.parse(fs.readFileSync(own, 'utf8')).noAutoDialog === true; } catch { return false; } }
    }
    return !!rec.holdDialogs;
  }
  async function cdpEndpointFor(profileId, { fresh = false } = {}) {
    let p = null; try { p = profile(String(profileId || '')); } catch { p = null; }
    if (!p) return { ok: false, code: 'no-browser', error: 'no such browser' };
    const rec = reg.browsers[p.id];
    if (!rec || rec.state !== 'ready') return { ok: false, code: 'not-running', error: 'the browser is not running' };
    if (rec.hostId) return { ok: false, code: 'remote', error: 'the browser runs on another machine' }; // lane passkey-browse-yourself r3: the watch says THIS answer's cause (never its own hostId branch)
    if (!isEph(p)) return rec.cdpUrl ? { ok: true, url: rec.cdpUrl } : { ok: false, error: 'the browser answered no CDP url' }; // the record's own (a restart writes the new one)
    if (fresh) vpUrls.delete(childUrlKey(p.owner.id)); // a watch that went down re-asks the daemon (a relaunched Chrome has a new port)
    return withCdpUrl({ kind: 'child', handle: p.owner.id }, async (url) => ({ ok: true, url }));
  }
  /** B-346d (the owner's live view: «not watching», ECONNREFUSED on the OLD port after its daemon restarted): a conversation's own
   *  browser's url is cached per RUN of its browser — the record's start — so a relaunched daemon (a new Chrome on a new port) is
   *  never answered with the previous run's port: its key misses and the url is asked of the live daemon. The cache had one key
   *  per conversation, and cdpEndpointFor's answer never fails, so nothing evicted it across a restart. A run's older keys go. */
  function childUrlKey(handle) {
    const h = String(handle || '');
    const key = B.childUrlKey(h, reg.profiles.filter(isEph), reg.browsers); // the profiles only — never ephemerals() (it stats every kept folder)
    for (const k of [...vpUrls.keys()]) if (k !== key && k.startsWith('child:' + h + '@')) vpUrls.delete(k); // the previous runs' urls go
    return key;
  }
  async function withCdpUrl(target, fn) {
    const S = require('../browser-stream.js');
    const key = target.kind === 'ephemeral' ? 'eph:' + String(target.sessionName || '') : target.kind === 'child' ? childUrlKey(target.handle) : 'p:' + String(target.profileId || '');
    const resolveUrl = async () => {
      if (target.kind === 'ephemeral' || target.kind === 'child') {
        const e = target.kind === 'child' ? ephemeralFor(String(target.handle || '')) : null;
        const pairs = target.kind === 'child' ? (e && e.state === 'ready' ? pairsOf(e.profileId) : null) : target.envPairs;
        if (!Array.isArray(pairs) || !pairs.length) return null;
        const r = await rt.cdpUrl(null, { extraEnv: S.pairsToEnv(pairs) });
        return r.ok ? r.url : null;
      }
      const rec = reg.browsers[target.profileId];
      return rec && rec.cdpUrl && !rec.hostId ? rec.cdpUrl : null;
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      let url = vpUrls.get(key) || null;
      const cached = !!url;
      if (!url) { try { url = await resolveUrl(); } catch { url = null; } }
      if (!url) return { ok: false, error: 'no CDP endpoint for this browser' };
      const v = await fn(url);
      if (v.ok) { vpUrls.set(key, url); return v; }
      vpUrls.delete(key);
      if (!cached) return v;
    }
    return { ok: false, error: 'unreachable' };
  }
  async function viewportFor(target, { activeUrl = '' } = {}) {
    ensureLoaded();
    if (!target || !target.ok) return { ok: false, error: 'no target' };
    const VP = require('./browser-viewport.js');
    return withCdpUrl(target, (url) => VP.readViewport(url, { activeUrl }));
  }

  /** lane S4 (naive study 2 — "实况画面只占窗格上面一截" + the phone's desktop-width strip): SIZE THE PAGE TO THE PANE.
   *  `set viewport W H` under the target's OWN session (the daemon that streams it is the one writer of its viewport —
   *  the agent's `set viewport` goes the same way, and new tabs inherit it: measured on 0.38.1), routed like a
   *  confirmation: an ephemeral / a helper's browser by its spawn pairs, an attachment under the lease's session over
   *  the keeper browser's CDP url (never the directory), a mediated lease in its own namespace. A VIEW NEVER STARTS A
   *  BROWSER: the target must be running per the keeper's own record (a `set` under the pairs of a daemon that is not
   *  up would launch one). Never throws: `{ok, code, error}`. */
  async function setViewportFor(target, { width, height, scale, device } = {}) {
    ensureLoaded();
    const FIT = require('../browser-fit.js');
    const argv = FIT.viewportArgv({ width, height, scale, device }); // verify r1: also the agent's own choice put back (its factor / `set device NAME`)
    if (!argv) return { ok: false, code: 'bad-request', error: 'a viewport needs a width and a height (or a device name)' };
    if (!target || !target.ok) return { ok: false, code: 'bad-request', error: 'no target' };
    const S = require('../browser-stream.js');
    let r;
    if (target.kind === 'ephemeral' || target.kind === 'child') {
      const bk = target.kind === 'child' ? String(target.handle || '') : String(target.ns || target.sessionName || '').replace(/^vs-/, '');
      const e = bk ? ephemeralFor(bk) : null;
      // a MANAGED ephemeral must be running; an unmanaged one (a pre-C3 session) is asked only under its own pairs
      if (e && (e.state !== 'ready' || starting.has(e.profileId) || stopping.has(e.profileId))) return { ok: false, code: 'browser_stopped', error: 'the browser is not running — its size is set when it runs again' };
      const pairs = target.kind === 'child' ? (e ? pairsOf(e.profileId) : null) : target.envPairs;
      if (!Array.isArray(pairs) || !pairs.length) return { ok: false, code: 'not_managed', error: 'this browser has no recorded pairs on this server' };
      if (!e) { // no record of ours: only a daemon that already runs under these pairs is asked (the launch-free `session info` first — lane P verify's rule)
        let info = null; try { info = typeof rt.info === 'function' ? await rt.info(null, { extraEnv: S.pairsToEnv(pairs) }) : null; } catch { info = null; }
        if (!info || !info.active) return { ok: false, code: 'browser_stopped', error: 'the browser is not running — its size is set when it runs again' };
      }
      r = await rt.exec(null, argv, { extraEnv: S.pairsToEnv(pairs), timeout: 15000 });
    } else {
      const p = profile(target.profileId);
      if (!p) return { ok: false, code: 'not-found', error: `no profile ${target.profileId}` };
      const rec = reg.browsers[p.id];
      if (!rec || rec.state !== 'ready' || starting.has(p.id) || stopping.has(p.id)) return { ok: false, code: 'browser_stopped', error: `"${p.label}"'s browser is not running` };
      if (p.host || !(B.providerRow(p.provider) || {}).starts) return { ok: false, code: 'stream_unavailable', error: `"${p.label}" is ${p.host ? 'on ' + p.host : 'an external browser over CDP'} — its page size is its own` };
      const bk = String(target.sessionName || '').replace(/^vs-/, '');
      if (isMediated(p) && target.kind !== 'human') { // BROWSE YOURSELF: the user's own session is never mediated — his tab's size is his window's
        // builder r2 (the reality verifier's A): a SHARED browser keeps its size while somebody drives it — the mediator's
        // paused fence refuses every viewport call on the lease's url, the live view's own set included (it arrives like
        // the agent's). Asked anyway, a CLI was spawned to be refused, the view printed the agent's refusal text and the
        // bridge remembered a failure that kept the page unfitted after the handback. Said by its code; no spawn.
        const held = { ok: false, code: 'held_while_driving', error: `"${p.label}" is a shared browser — its size is kept while it is driven by hand` };
        if (inputStateFor(bk, p.id).input === 'user') return held;
        const url = mediator && mediationOn() ? mediator.urlFor(p.id, bk) : null;
        if (!url) return { ok: false, code: 'no-browser', error: `"${p.label}" holds no mediated url for this conversation` };
        r = await rt.exec(M.mediatedNamespace(p.id, bk), argv, { session: target.sessionName, extraEnv: { AGENT_BROWSER_CDP: url, AGENT_BROWSER_IDLE_TIMEOUT_MS: String(idleMs()) }, timeout: 15000 });
        const j0 = r && r.json;
        // …and a set in flight when the takeover began is interrupted by the same fence: the same verdict
        if (!(r && r.ok && !(j0 && j0.success === false)) && String((j0 && j0.error) || (r && (r.stderr || r.error)) || '').includes(M.INTERRUPTED_CODE)) return held;
      } else {
        const o = await leaseCliOpts(p.id, bk);
        if (!o) return { ok: false, code: 'browser_no_cdp', error: noCdpError(p) };
        r = await rt.exec(nsOf(p.id), argv, { ...o, timeout: 15000 });
      }
    }
    const j = r && r.json;
    if (r && r.ok && !(j && j.success === false)) return { ok: true, code: null, error: null };
    return { ok: false, code: 'viewport_failed', error: String((j && j.error) || (r && (r.stderr || r.error)) || 'the browser CLI failed').trim().slice(0, 300) };
  }
  /** verify r1: the browser record a target's PAGE-SIZE NOTE lives on — `rec.viewport` = {agent, applied, baseline, floorW, at}
   *  (src/browser-fit.js fitNoteOf). The record is REPLACED at every launch (a relaunched browser has its own size), so the
   *  note dies with the browser it describes and a server restart still knows the agent chose the size / what to restore. */
  function viewportRecOf(target) {
    ensureLoaded();
    if (!target || !target.ok) return null;
    if (target.kind === 'ephemeral' || target.kind === 'child') {
      const bk = target.kind === 'child' ? String(target.handle || '') : String(target.ns || target.sessionName || '').replace(/^vs-/, '');
      const e = bk ? ephemeralFor(bk) : null;
      return e ? (reg.browsers[e.profileId] || null) : null;
    }
    return target.profileId ? (reg.browsers[target.profileId] || null) : null;
  }
  function viewportNoteFor(target) { const rec = viewportRecOf(target); return rec && rec.viewport && typeof rec.viewport === 'object' ? { ...rec.viewport } : null; }
  function noteViewport(target, note) {
    const rec = viewportRecOf(target);
    if (!rec) return false;
    const next = note && typeof note === 'object' ? { ...note } : null;
    const same = JSON.stringify(rec.viewport ? { ...rec.viewport, at: 0 } : null) === JSON.stringify(next ? { ...next, at: 0 } : null);
    if (same) return true;
    rec.viewport = next ? { ...next, at: now() } : null;
    save(); // no notify: the note is the bridge's, not a roster change
    return true;
  }
  /** lane S4 (the blank picture): a FRESH frame of the target's active tab, asked of the page over CDP (server-side;
   *  the raw endpoint never leaves it — lane J's rule) when the stream sent none after a navigation. The endpoint
   *  resolves exactly like `viewportFor`'s (remembered per target, forgotten on the first failure). */
  async function freshFrameFor(target, { activeUrl = '' } = {}) {
    ensureLoaded();
    if (!target || !target.ok) return { ok: false, error: 'no target' };
    const VP = require('./browser-viewport.js');
    return withCdpUrl(target, (url) => VP.captureFrame(url, { activeUrl }));
  }

  /** lane live-input: COPY OUT — watch the target's active tab for the copies the page performs while the user drives
   *  (browser-viewport.js watchCopies: an isolated world + a binding, one persistent page socket). The endpoint resolves
   *  exactly like the viewport reading's. → {ok, close, targetId} | {ok:false, error}; never throws. */
  async function watchCopiesFor(target, { targetId = null, activeUrl = '', onCopy, onEnd } = {}) {
    ensureLoaded();
    if (!target || !target.ok) return { ok: false, error: 'no target' };
    const VP = require('./browser-viewport.js');
    return withCdpUrl(target, (url) => VP.watchCopies(url, { targetId, activeUrl, onCopy, onEnd }));
  }

  /** lane browser-windows (U0b): is this tab PAINTING — asked of the page (server-side CDP; the endpoint never leaves it).
   *  A background tab of its window paints nothing (measured: 0 fps); the bridge says so and polls its picture. */
  async function tabVisibilityFor(target, targetId) {
    ensureLoaded();
    if (!target || !target.ok || !TBS.TARGET_ID_RE.test(String(targetId || ''))) return { ok: false, error: 'no tab' };
    const VP = require('./browser-viewport.js');
    return withCdpUrl(target, (url) => (typeof visibilityOfFn === 'function' ? visibilityOfFn : VP.visibilityOf)(url, String(targetId).toUpperCase())); // B-e674: the gate's seam
  }
  /** lane browser-windows (U3/U0b): ONE fresh picture of a named tab (a background tab's polled frame). */
  async function captureTabFor(target, targetId) {
    ensureLoaded();
    if (!target || !target.ok || !TBS.TARGET_ID_RE.test(String(targetId || ''))) return { ok: false, error: 'no tab' };
    const VP = require('./browser-viewport.js');
    return withCdpUrl(target, (url) => VP.captureTarget(url, String(targetId).toUpperCase()));
  }
  /** lane browser-windows (U3): WATCH a tab the session is not on — the screencast, else ≤ 2 fps captures (said by mode).
   *  The tab must be one the VIEW may show: the bridge judged its owner (the viewed conversation's own, his own). */
  async function watchTabFor(target, targetId, hooks = {}) {
    ensureLoaded();
    if (!target || !target.ok || !TBS.TARGET_ID_RE.test(String(targetId || ''))) return { ok: false, code: 'no_tab', error: 'no tab' }; // live-watch-polish G5: the code the client words
    const VP = require('./browser-viewport.js');
    return withCdpUrl(target, (url) => VP.watchTarget(url, String(targetId).toUpperCase(), { ...hooks, firstFrameMs: WIN.WATCH_FIRST_FRAME_MS, pollMs: WIN.WATCH_POLL_MS }));
  }

  const api = {
    /** lane hub-loop-stalls «loop-day-report» M6: the browsers this keeper holds READY (a live record) and how many had no command for
     *  over an hour (their profile's last verb) — counts only, read in memory; null before the registry was loaded (never a load) */
    /** loop-day-report (cure r2, S3): the main pids of the live browsers this keeper runs — every engine, whatever its program is
     *  called — so the hour counts them (and the processes under them) as browsers by what they are; in memory, null before a load */
    browserPids: () => { if (!loaded) return []; const out = []; const add = (x) => { if (x && Number.isInteger(x.pid) && x.starttime != null) out.push({ pid: x.pid, starttime: Number(x.starttime) }); }; for (const r of Object.values(reg.browsers || {})) if (B.isLiveBrowser(r)) { add(r); add(r.browser); } return out; },   // loop-day-report cure r3: the daemon's and the browser's {pid, starttime} as the record holds them — a pid counts only while its start time is still the record's
    readyCounts: (t = now()) => {
      if (!loaded) return null;
      let ready = 0, idle1h = 0;
      for (const r of Object.values(reg.browsers || {})) {
        if (!B.isLiveBrowser(r)) continue;
        ready++;
        const p = (reg.profiles || []).find((x) => x && x.id === r.profileId) || null;
        if (!(t - Number((p && p.lastVerbAt) || 0) < 3600000)) idle1h++;
      }
      return { ready, idle1h };
    },
    /** lane chrome-157: the road an agent's lease of profile `id` takes ({mode, why}) — or, with no id, the road a NEW profile on `host`
     *  would take — the same verdict the leases use; the sharing dialogs word «each conversation in its own tab» only where it holds.
     *  B-19a9 (the coordinator's r2669 (3)): a new profile's road is asked FOR ITS PROVIDER, through the SAME facts helper its leases
     *  will use (roadFactsOf: an outside endpoint — a `cdp` row, or one that starts no browser — is «external»); no provider = the
     *  default row, as before */
    onDownloadFolder: (fn) => { if (typeof fn !== 'function') return () => { }; folderListeners.add(fn); return () => folderListeners.delete(fn); },   // (lane chrome-157: THE WINDOW's notice road)
    agentRoadFor: (id, { host = null, provider = null } = {}) => (id ? dialogRoadOf(named().find((p) => p.id === String(id)) || null) : M.leaseRoadVerdict({ mediated: false, proxy: !!(mediator && mediationOn() && typeof mediator.grantFor === 'function'), ephemeral: false, ...roadFactsOf({ provider: provider || null, host: host || null }, null), agent: true })),
    list, profile, profileByRef, browserOf, browserIdentityOf, leasesFor, leasesOn, createProfile, adoptDirectory, removeProfile, cloneSources, cloneProfile,
    buildsFor, // lane browser-admin 2a: Change build… (buildsView, machineBuilds, setBrowserChoice, onRelaunch: the builds row, in ...installs.api)
    enginesHeld: () => { const r = engs(); try { return r && typeof r.held === 'function' ? r.held() : null; } catch { return null; } }, // B-f276 (r3305 (a)): the engine table's registry held
    engineFactOf, engineRowsView, placeIsolatedFor, defaultEngineNow, noteEngineLive, // B-cf42: the dialog watch hands each engine profile's live kernel answer in // lane engine-plugin: an engine's probe fact (the create route hands it in), the user's engine table, the default policy
    installEngineKernel: (id) => { const d = eds(); if (!d) throw namedError('browser_engine_missing', 'this instance does not download browser engine kernels'); return d.installKernel(id, { by: 'user' }); }, // lane engine-distribution: a person's «Download kernel»
    restartProfile, askAnswer: (id, by) => { ensureLoaded(); const rec = reg.browsers[id]; return askAnswer(rec, profile(id), by); }, // lane browser-unresponsive: THE recovery + one ask (the gate's seam)
    cliPin, cliFactReady, rejudgeClis /* B-7a30: the CLI judge's pass (the gate awaits it) */, _cliNow: () => cliNow() /* B-7a30: the launch's bounded stamp (the gate places a stall in it) */, _reattached: () => reattached, // cliFacts + installCli: the CLI row, in ...installs.api
    ...installs.api, // rv-browser F7 (lane dc-browser-installs): every install row's own routes (lane chrome-builds-download (design 004): Download another build…) // lane browser-admin 2b: the browser CLI VibeSpace drives (verify r3: cliFactReady = the doors' fact, the candidates asked first)
    machineDisplay, machineDisplayCached, noDisplayMode, headedSetting, // lane headless-fallback (+ H5: the stored window preference, for Settings' fact line): this machine's display now (a fresh probe — Settings' read-only line) + the no-display setting
    reshapeStore: (fn) => { ensureLoaded(); refuseIfHeld('a migration of the profile registry'); const r = fn(reg); commit(); landedOrThrow(); return r; }, // MIGRATIONS ONLY (2026-09-runaway-parks-void): reshape the in-memory registry, then the ONE atomic save — ON DISK before it returns, else it THROWS by name (lane lg-store-writes U5b: the boot's next migration may read the file)
    diskOf: (id) => { ensureLoaded(); return disk.diskOf(profile(id)); }, _disk: disk,
    _heldReads: () => ({ idleMs: idleMs(), releaseMs: idleReleaseAfterMs(), takeoverMs: takeoverIdleMs(), humanKeepMs: humanKeepOf({ launched: true }), cap: machineCap(), capUnread: capUnread(), egress: (of, h) => egressAllow(of, h), egressStart: (pid, of) => egressUrlFor(pid, of), egressStop: (pid) => dropEgress(pid), pinRead: birthPinRead }),   // B-50e7: the readers a held settings store reaches (read-only; the legs' seam) // lane browser-disk-sample: THE disk fact (the panel row, GET /api/browser/profiles)
    stopRows, managerStop, // lane browsers-stop (majordomo piece 6)
    usageOf: (id) => { const l = live.get(id); return l ? { ...l } : null; }, // 2026-09-25: the Browser panel's memory cell (memBytes + memMetric, over)
    // takeover C3 (design-browser-takeover §5): the managed ephemeral browser + the ceiling's count seam
    ensureEphemeral, retireEphemeral, ephemerals, ephemeralFor, isEphemeral: (id) => isEph(profile(id)), nsOf,
    restoreRebound: keepRebound, // verify r3 (F4): the route puts a note back when the answer that carried it could not be delivered (the client gone)
    liveHoldingFor, // lane H: the session card / status chip's `browserLive` fact
    factView, factFor, pinnedBy, clearPin, removeVerdict, removeOnMachine, onChange, creditUserInput, // lane S2: THE browser fact, the delete's refuse-or-warn, the re-publish hook, the input receipt's credit
    holdersFor: (browserKey) => { ensureLoaded(); return holders(B.leasesOf(reg.leases, String(browserKey || ''), { children: true })); }, // lane H: THE holder rows of one conversation (the recorder arms only on a holder)
    socketRootOf, // takeover r2: the root every command of a browser this keeper runs must land under
    configFileFor, machineConfigFile, tailnetOf, // takeover r3: the config a command on a browser this keeper runs is NAMED with; lane tailnet-names: tailnetOf = a browser's launch stamp (the audit's LAW 2 words)
    setOtherHolders: (fn) => { othersFn = typeof fn === 'function' ? fn : null; },
    setDisplaySessions: (dk) => { displayKeeper = dk && typeof dk === 'object' ? dk : null; wireDisplayKeeper(); }, // lane one-browser-b1: the desktop keeper (the attach road's display sessions); lane browser-display-holders: its records read the holders, its person's stop reaches the keeper
    pictureSourceFor, xWindowFor, nativeDialogsFor, // lane browser-x-in-window (B2): the picture switch — the source verdict, the holder's X window, Chrome's own dialog windows over it
    xScopeFor, // lane desktop-x-seat-browser r2: the person's input seat's root (his window — r3: the bridge reads the rest)
    streamPortFor, // P2: the live view's port (attachment or ephemeral; MULTIVIEW: a helper's — a view never STARTS any of them: released / stopped / not-started are said)
    noteStreamClosed, // VERIFY r1 H2: the bridge's upstream closed on an ephemeral relay — judge the process now
    leaseCliOpts, // naive study 2: the ONE way a CLI call under a lease's session reaches the keeper's browser (CDP, never the directory)
    agentTabAct, tabOwnersFor, userTabAct, bootstrapTabRoot, currentTabOf, // lane browser-resume C (§3.9, ruling 3): the agent's own tab verbs, whose tab it is (the bridge's row), the user's ✕ / switch
    ephemeralPairsFor: (browserKey) => { ensureLoaded(); const p = reg.profiles.find((x) => isEph(x) && x.owner.id === String(browserKey || '')); return p ? (pairsOf(p.id) || null) : null; }, // naive study 2 (finding 4): a sub-agent browser's OWN pairs — the recorder's tap on it
    viewportFor, // lane J: the page's own viewport (the live view's input space)
    tabVisibilityFor, captureTabFor, watchTabFor, // lane browser-windows (U3/U0b): a background tab is said and polled; a watched tab's frames
    setViewportFor, freshFrameFor, // lane S4: size the page to the pane (never starting a browser) + a fresh frame after a navigation
    watchCopiesFor, // lane live-input: the copies the page performs while the user drives (copy out)
    geoRegrant: (profileId) => (geoHoldOwn ? geoHoldOwn.regrant(String(profileId || '')).catch(() => false) : Promise.resolve(false)),   // r2311 (i): the dialog watch's reset or leaving ⇒ the hold grants again
    placeKindFor,   // r2767 (a): the profile's location kind the gates judge by (the running browser's, else the saved)
    cdpEndpointFor, geoHeldFor: (profileId) => { const r = runningPlaceKind(profileId); if (r !== undefined) return r === 'place' ? ((geoHoldOwn && geoHoldOwn.heldOf(String(profileId || ''))) || { kind: 'place' }) : r === 'blocked' ? { kind: 'blocked' } : null; let gp = null; try { gp = profile(String(profileId || '')); } catch { gp = null; } return geoPlanFor(gp); }, /* r2767 (a): the running browser's plan until its restart */ /* B-9584 U2c: the PERSON's setting (a place or «blocked») — the dialog watch never replaces or clears it, alive hold or not */ viewersFor: (profileId) => { let p = null; try { p = profile(String(profileId || '')); } catch { p = null; } return p ? viewersOf(p).n : 0; }, /* B-346d: the live views watching a browser now — the dialog watch re-arms while one is open */ setStuckSource, setPasskeyDrop, setPasskeyHeld /* r3261 */, passkeyHeldNow /* r3632 */, holdsDialogsFor, setPaintWatch, sweepIdlePaint, // lane browser-swiftshader-cpu
    // lane browser-stuck: the dialog watch's upstream by profile id; the conversation's stuck fact on factView
    viewportNoteFor, noteViewport, // verify r1: the page-size note on the browser's own record (agent choice / applied / baseline / floor)
    // MULTIVIEW D4 / B-325a: the per-conversation cap, the own count, the release after the turn, the viewers the bridge reports
    capOf, capFor, setCap, stampGroupCap, groupCapOf, ownLive, noteViewers, sweepIdleReleases, idleReleaseAfterMs,
    pairsForKey: (k) => { const e = ephemeralFor(k); return e ? (pairsOf(e.profileId) || null) : null; }, // MULTIVIEW §4: a helper's OWN pairs (the bridge's child relay answers confirmations under them)
    pinFor, setPin, pinForCreate, instanceDefault, taskGroupDefaultFor,
    mayAttachAtCreate, admitsAtCreate, admitsFor, // admitsFor: unit what-it-may-use (Session Properties); lane new-session-form: the New Session form's profile list + the create's judge (ONE verdict: mayAttach)
    restorePin, taskGroupCapFor, // B-f7ab verify r2: the spawn's witnessed pick restored under the late key (a PREFERENCE — it never edits "Who can use it"); the group cap READ for the witness
    // owner ruling A: a pin that did not open is said; one driver at a time; Delete… releases everything first; the adopt
    // stops the conversation's own browser first. "Who can use it" is a list (2026-09-27): the ONE re-judge, the pick that
    // writes the list, the keys a write may name, the Task Group seams (the routes' GET …/use reads them)
    rejudgeLeases, rejudgeAll, addConversation, knownKeysOf, keyNamed, taskIdsForKey: (bk) => groupsOfKey(bk), taskInfo: (id) => taskFacts(id), taskGroupReadFor,
    copyPin, notePinFailure, pinFailureOf, clearPinFailure, releaseAll, stopEphemeralOf,
    start, stop, attach: attachTimed, detach, statusFor,
    // BROWSE YOURSELF (B-6ae8): the user as one more holder on his own tab — the button, his window's controls, the two ends
    browse, humanOf, humanTargetFor, humanInputState, humanAttach, humanTake, humanPass, humanRelease, noteHumanInput, navigateHuman, closeHuman, quitHuman, endHuman, holdersOn, setViewerAlive, humanKeepOf: (id) => { const h = humans.get(String(id || '')); return h ? humanKeepOf(h) : null; },
    // P3 (§4.3 / §4.3.1): the input side — takeover/handback/idle, the typed paused refusal, the confirmation registry
    takeoverIdleMs, inputStateFor, inputsFor, inputSummaryFor, takeover, handback, handbackWakesFor, passControl, noteUserInput, noteUserUrl, pausedVerdictFor, onInput,
    requestTakeover, resolveTakeoverRequest, takeoverRequests, takeoverRequest, openRequestFor: openRequestAsked /* r3261: the hold by name */, onTakeoverRequest, noteRequestItem, takeoversHeld, takeoversDamaged, noteTakeoverPutBack /* r4130 */, _takeoverHold: tqHold /* the suite's seam */, // lane browser-takeover-queue: the request record's ONE writer
    interruptionFor, interruptionOf, setInFlightReader, awaitInterruptionSettled, // the owner's ruling (2026-09-27): a takeover interrupts, tells, and the handback reminds
    clock: () => now(), // the ONE clock a takeover's instant and a /resolve's instant are compared on (the route stamps with it)
    notePending, resolvePending, pendingFor, pendingAllFor, answerConfirmation, onConfirmation,
    // P1 second half (§3.7/§3.8): the set, handles, the one-time refusal, children, the audit, adopt
    setFor, tell, resolveFor, newChild, dropChild, jobHandleFor, findJobHandle, jobOf, releaseJob, audit, adoptScratch, auditFile: path.join(dataDir, AUDIT_FILE),
    reconcile, adoptAll, boot, tick, startTimer, shutdown, orphanCensus,
    recorderRuns: () => [...aliveRuns.keys()], // B-346d's recorder (r1311 (3)): the runs it holds — a run no longer live is forgotten
    // P4 (§7.3): the paired-machine question the routes ask before a create is judged
    hostKnown: knownHost, machinesHeld, isLocalRec, probeCdp, desktopConsent,
    // P4 second half (§7.4 / §7.5): the switch, its view, the chip, seats, the agent's claims, per-site memory, the lease's last URL
    switchBackend, switcherView, chipFor, choicesFor: (id) => { const p = profile(id); return p && !isEph(p) ? backendFactFor(p).choices : []; }, seatStates, runningOf, blocked, blockedFor, clearBlocked, addSiteHint, dropSiteHint, siteHints, noteLeaseUrl, readDirMajor, keys: () => keysOf(),
    onProposal, proposalEntry, stepProposal, noteProposal, proposalsFor, proposalOthers, openInLease,
    proposeSiteReset, siteResetHolders, holderTabs, noteOwnTab, forgetOwnTab, pruneOwnTabs, noteTabBorn /* B-e674 unit 2: the birth stamp */, personBrowsing /* B-e674 follow (r694 (2)) */, notePermission /* lane browser-ui-prompts-r2 */, loginFenceStateOf, saveLoginFenceState, loginChannelFor, onProfileDrop /* lane vault-login */, onProfileDropNow /* r221: memory-only credential drops, at the press */, // lane site-reset step 3 (verify r3 #2: the persisted witness; r4 #3: pruned at a connect) (+ verify r1: a holder's attributable tabs): one site's login on a shared profile — a proposal // lane browser-propose: the proposal record + what its runner acts through
    // §7.4 failure form (1): the install action (verdict = PURE over the proof record; the act spawns npm ONLY on ok)
    installDir, retiredInstall: () => installs.slot.retiredAtBoot(), egressFor, egressRefusals, egressEngineOf, // lane engine-spi-egress: a wrapped engine's proxy per profile (L3: the names lost the anti-bot backend's word); the install rows' api in ...installs.api
    // P5 (§4.5 / D7 / D35): the lease seam the recorder and the screencast hang on, the digest hook, the editable fields
    onLease, addDigest, updateProfile, moveProxyPassword, // + B-8b87: «Move the password to the vault»
    exitCheck, keepEgress, // + the exit check (a person's press; the person's confirm)
    setEnvironment, // B-9584 U3: the profile's environment — the person's save in its «Environment…» dialog
    // P6 (§6.2 / §6.5): is `sharing:"instance"` a value here; the proxy (the routes ask it nothing directly)
    mediationOn, isMediated, mediator: () => (mediationOn() ? mediator : null),
    storeFile, STORE_FILE, uid, _reg: () => reg, _proxyCredHeld: (id) => proxyCreds.has(String(id || '')), /* a suite's seam: whether the forwarders' login entry holds this profile (a yes/no — no secret crosses) */ _forwardersClose: () => Promise.all([...egressProxies.values()].map((e) => e.px.close({ cut: true }).catch(() => { }))).then(() => { egressProxies.clear(); }), /* B-8b87 cure: a suite's stand-in for this process's end (its forwarders' ports free for the next keeper's re-bind) */ _facts: bf, _runtime: rt,
    floorFacts, checkFloorNow, // B-0b8c (lane browser-probe-transient): the facts API + the For-you notice's Check again
    detachGrants, // lane lg-store-writes, the moved2 cure 2: a keeper that ends (a migration's private one) answers no grant change
    whenLanded, // lane lg-store-writes, the moved2 cure 2: a reply / a login fill waits (bounded) for the registry as it is now
    landNow, // lane lg-store-writes U5b: a migration's PRIVATE keeper (the legacy adopt) lands its write before the next migration reads the file
    lineageKeyOf, moveDirLineage, // verify r8 (T2 ②): the product's own move of a directory (a Forget) carries its lineage

    // lane browser-resume (§3.9): the relay's tab list of a conversation's own browser, the CDP read at a stop, the store
    held: () => { if (!loaded) ensureLoaded(); return !!heldReg; }, heldWords, onReadAgain: (fn) => { heldLifts.add(fn); return () => heldLifts.delete(fn); }, owePin, onOwedPin: (fn) => { owedHooks.add(fn); return () => owedHooks.delete(fn); }, pinVerdictForCreate, instanceDefaultRef: () => setting('browser.defaultProfile', ''), owedPending: (k) => owedPins.has(String(k || '')),   // the B-f276 remainder
    profileDirRegistered: (dir) => { ensureLoaded(); refuseIfHeld('is this folder a profile\'s'); return !!dir && named().some((p) => p.dir && !p.host && (B.sameDir(p.dir, dir) || F.sameRealDir(p.dir, dir) !== false)); }, // lane browser-resume: a kept directory a named profile registered in place is never removed by the kept store — verify F1: by REAL identity, unknown ⇒ registered (fail closed)
    noteTabs, captureKeptTabs: (profileId, seenBy) => { const pp = profile(String(profileId || '')); return captureKeptTabs(pp, pp ? reg.browsers[pp.id] : null, seenBy || 'a read'); }, keptStore: () => keptStore(),
    // lane browser-resume B (§3.9, ruling 2): Resume, the reopen, the hand-back's two halves
    factsMoved: () => { for (const fn of changeListeners) { try { fn(); } catch (e) { log.warn?.(`[browser] change listener failed: ${e && e.message}`); } } }, // lane B: the kept store moved a fact (no registry write)
    resumeFor, resumeAttachment, restoreTabs: (profileId, plan, o) => restoreTabs(profile(String(profileId || '')), plan, o), continueState, noteContinue,
    displayHoldersOf, userStoppedDisplay, // lane browser-display-holders: a browser display's holders; the person's stop of it
  };
  wireDisplayKeeper(); // lane browser-display-holders: a display keeper handed in at create is wired like a late one
  if (install) installed = api;
  if (install) { try { require('../proc-identity.js').keepOut('agent-browsers', () => api.browserPids().map((x) => [x.pid, x.starttime])); } catch { } }   // B-69a7: the hub's keeper's own records — never a conversation's leftover
  return api;
}

/** lane chrome-157 (vault-login round 32, ruling Q8): THE ONE same-browser identity, PURE, built from what exists — the browser's
 *  own id (the devtools UUID Chrome mints per launch, off the url the caller watches, else the record's cdpUrl) and the keeper's
 *  process identity of the record (pid + starttime + startedAt). Two answers are the same browser only when they are equal and
 *  not null: a replacement browser that reuses the process number has another starttime and another UUID. null when neither
 *  exists, or for a record that is neither starting nor ready (a stopped or failed browser is nobody's to inherit). */
const DEVTOOLS_UUID = /\/devtools\/browser\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
function browserIdentityOfRecord(rec, url = '') {
  if (rec && rec.state && rec.state !== 'starting' && rec.state !== 'ready') return null;
  const m = DEVTOOLS_UUID.exec(String(url || '').trim()) || DEVTOOLS_UUID.exec(String((rec && rec.cdpUrl) || ''));   // (the url the watch CONNECTED to first — the reviewers' note)
  const uuid = m ? m[1].toLowerCase() : '';
  const proc = rec && rec.pid != null ? `${rec.pid}:${rec.starttime ?? ''}:${rec.startedAt || ''}` : '';
  return uuid || proc ? `${uuid}|${proc}` : null;
}

/** lane ui-needs-a-button (主开发 Q2 — the loop banner's «Stop loading»; reader follow-up #4: its own function, so a suite drives it with
 *  a fake CDP): THE PERSON'S STOP — judged (browser-tabs userTabVerdict over the facts the keeper re-read), RECORDED on the takeover's
 *  cycle while this viewer drives (`note` — said to the agent at the handback), sent (Page.stopLoading over the keeper's own CDP:
 *  `withCdpUrl`; the endpoint never leaves), and its record taken back when the page did not stop (`unnote`) → {ok, act, targetId,
 *  stopped} | throws the verdict's refusal (`refuse`) / stop_failed. */
async function personStop({ id, owner, driving, counts, row = null, target, withCdpUrl, refuse, note = () => null, unnote = () => {}, said = () => {}, VP = require('./browser-viewport.js') }) {
  const vs = TBS.userTabVerdict({ act: 'stop', owner, human: false, driving, mediated: false, counts });
  if (!vs.ok) refuse(vs, `${owner}, a stop`);
  const rec = driving ? note({ kind: 'tab-stop', title: row && row.title, url: row && row.url }) : null;
  const rs = await withCdpUrl(target, (url) => VP.stopLoadingOf(url, id));
  if (!rs || !rs.ok) { unnote(rec, (rs && rs.error) || 'no answer'); throw namedError('stop_failed', TBS.tabRefusalText('stop_failed')); }
  said(rec);
  return { ok: true, act: 'stop', targetId: id, stopped: true };
}
module.exports = { create, keeper, browserIdentityOfRecord, SWEEP_PIECE_MS, STORE_FILE, AUDIT_FILE, TICK_MS, STOP_GRACE_MS, ARM_WAIT_MS, RESOURCE_METRIC, EPHEMERAL_DETACH_NOTE, personStop };
