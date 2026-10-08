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
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const B = require('../browser-profiles.js');
const BIdle = require('../browser-idle.js'); // lane browser-swiftshader-cpu: a browser nobody watches and nobody drives paints nothing
const J = require('../browser-job-principal.js'); // lane jobs-browser: a Background Work job's browser handle + its release rule
const SW = require('../browser-switch.js');
const F = require('../browser-facts.js');
const T = require('../browser-takeover.js');
const BF = require('../browser-fact.js'); // lane S2: THE browser fact (one answer per conversation) + the delete's refuse-or-warn
const M = require('../browser-mediation.js'); // P6: the per-session url + env of a MEDIATED lease
const INT = require('../browser-interrupt.js'); // the owner's ruling (2026-09-27): a takeover interrupts, tells, and the handback reminds
const VERBS = require('../browser-verbs.js'); // takeover r3: the ONE config rule (sanctionedConfig)
const BS = require('../browser-stuck.js'); // lane browser-unresponsive: THE hung-browser verdict (PURE) + its words
const LIMITS = require('../keeper-limits.js');
const RG = require('../runaway-guard.js'); // the ONE resource verdict + per-provider numbers + report level (2026-09-25: report only)
const HM = require('../browser-human.js'); // BROWSE YOURSELF (B-6ae8): the user as one more holder on his own tab
const DSP = require('../browser-display.js'); // lane headless-fallback: headed is a preference, the display is a fact (PURE)
const HC = require('../hidden-chars.js'); // lane browser-propose: a proposal card's words carry no character that is not drawn (THE one set)
const KB = require('../browser-kept.js'); // lane browser-resume (§3.9): the conversation's KEPT browser — tabs, D2's restore kind (PURE)
const BB = require('../browser-builds.js');
const BI = require('./browser-installs.js'); // rv-browser F7 (lane dc-browser-installs): THE install slot + one row per installable // lane browser-admin 2a: which Chrome build a profile runs (the machine's list + the ONE verdict)
const CDP = require('../cdp-census.js'); // lane chrome-builds-download: a version's relation to the CDP census, said on its row before the download
const WIN = require('../browser-windows.js'); // lane browser-windows: a window per holder — the measured placement, the window mates, the cap setting (PURE)
const TBS = require('../browser-tabs.js'); // lane browser-resume C (§3.9, ruling 3): whose tab it is — the agent's own tab verbs, the user's tab row (PURE)

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const namedError = (code, msg, extra = {}) => { const e = new Error(msg); e.code = code; Object.assign(e, extra); return e; };

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
function create({ dataDir, homeDir = os.homedir(), env = () => ({}), broadcast = null, serverSetting = () => undefined,
  serverNotice = null, getTelemetry = () => null, liveKeys: sessionLiveKeys = () => new Set(), remoteKeys = () => new Set(), userTodos = null,
  // lane jobs-browser (B-dbc1): is this Background Work job's run alive (state starting | up)? A running job CARRIES its
  // browser handle (src/browser-job-principal.js), so its lease outlives its owner conversation until the job ends
  jobRunning = () => false,
  jobName = () => null, // accept-fixes-strip F8: a Background Work job's name (the live view names a job's tab by it)
  facts = null, runtime = null, limits = LIMITS, log = console, now = Date.now, tickMs = TICK_MS, guardSampleMs = null, install = true, answerAskMs = null, /* lane browser-unresponsive: the gate's bound of one ask */
  // lane H: how long a verb waits for the lease seam's listeners (the recorder ARMING its tap) before it runs
  armWaitMs = ARM_WAIT_MS,
  taskGroupDefault = null, access = null, hostKnown = null,
  vncDisplay = null, // B-d635 (lane browser-reliability): VibeSpace's own VNC desktop display the probe also looks at (the server wiring names it)
  // P4 second half (§7.4 / §7.5): the integration store (a handle or a
  // getter) the key consumer resolves through; `keys` = src/server/browser-
  // backend.js's `{keyFor, sourceOf}` (built here over `integrations` when
  // not injected); `providers` = `{row, control}` overriding the PURE table
  // (the gate drives a world where cloak is wired over the fake binary)
  integrations = null, keys = null, providers = null,
  // lane-cloak: where the egress proxies connect an ADMITTED name (identity in production; the gate maps the vendor's
  // download host to a loopback target so an admitted CONNECT never leaves the machine)
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
  // "Who can use it" is a LIST (2026-09-27): the Task Groups a conversation belongs to NOW, by its browser key (the task
  // store's own live rule, `groupsForSession`, over the live session carrying it) → `{ids, unreadable}` — asked by the
  // PATCH's re-judge of every lease and by the pick that writes the list; and one Task Group's facts → `{title,
  // archived}` | null (a store that no longer lists it) — the write's `unknown_task` and the panel's words. Absent ⇒ no
  // Task Group admits anyone the keeper judges itself (the routes hand their own taskIds to attach).
  taskIdsForKey = null, taskInfo = null,
  // BROWSE YOURSELF verify r1 (H6): the browser's page targets with their OPENER (CDP Target.getTargets over the keeper
  // browser's own endpoint) — what the user's own tabs are derived from; injectable for the gate (a fake has no CDP)
  readTargets = null,
  // lane browser-windows (U1): the window a holder's tab opens in — `(cdpUrl, {url}) → {ok, targetId, windowId}` over the
  // keeper browser's own endpoint (browser-viewport.openWindow); injectable for the gate (a fake has no CDP)
  openWindow: openWindowFn = null, closeTarget: closeTargetFn = null, openTabInWindow: openInWindowFn = null, windowOf: windowOfFn = null, openTabByActivate: activateFn = null, // verify r2 T1: rung 2 of a later tab (browser-viewport.openTabByActivate)
  // lane browser-resume (§3.9, the owner's ruling 1): THE KEPT STORE (src/server/browser-kept.js, or a getter) — a
  // conversation's own browser's logins directory + its tabs survive the browser's stop; the keeper is its ONE feeder
  // (start / stop / the live tab list / a deliberate close). Absent ⇒ nothing is kept (today's ephemerality).
  kept = null,
  // verify r1 (F8, lane browser-admin): the wall clock of ONE step of THE install slot (default 15 min; injectable for the gate)
  installTimeoutMs = null } = {}) {
  if (!dataDir) throw new Error('browser-keeper: dataDir is required');
  const storeFile = path.join(dataDir, STORE_FILE);
  // ONE base environment for the probe, the runtime and the socket-root answer
  // (r2): the root a command lands under is computed from exactly what the
  // runtime launches and probes with
  const rtEnv = env() || {};
  // lane browser-admin 2b: the browser CLI VibeSpace drives — the PINNED install first when `browser.cli` asks for it (the
  // keeper's in-memory answer, `cliPinPath`; never an fs read per call), else PATH; `bfPath` = the PATH binary alone (the
  // panel's "on PATH" fact)
  const pinnedCli = () => { try { return cliPinPath(); } catch { return null; } };
  const bf = facts || F.createBrowserFacts({ env: rtEnv, pinned: pinnedCli });
  const bfPath = F.createBrowserFacts({ env: rtEnv });
  // lane browser-resource-care: the daemon's TMPDIR = data/browser-env/tmp (browser-env.js TMP_DIR — spelled here: the
  // keeper requires nothing of that module), so its ephemeral profiles and Xvfb auth files stay off the RAM-backed /tmp
  let daemonTmpMade = null; // made ONCE (data/ may be a network mount — never an mkdir per CLI call)
  const daemonTmp = () => { if (daemonTmpMade) return daemonTmpMade; const d = path.join(dataDir, 'browser-env', 'tmp'); try { fs.mkdirSync(d, { recursive: true, mode: 0o700 }); daemonTmpMade = d; return d; } catch { return null; } };
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
      const opts = withConfig(ns, o);
      if (opts.cli) return opts;
      // verify r3 (Y1): a binary never asked its version is ASKED before the call is judged (cliOptReady) — a same-version
      // re-install at the same path used to be refused once, "no longer installed"
      const c = await cliOptReady(browserRecordForCall(ns, opts.extraEnv && typeof opts.extraEnv === 'object' ? opts.extraEnv : {}));
      if (!c || (c.gone && m === 'info')) return opts;
      return { ...opts, cli: c };
    };
    const withConfig = (ns, o) => {
      const opts = o && typeof o === 'object' ? o : {};
      const ex = opts.extraEnv && typeof opts.extraEnv === 'object' ? opts.extraEnv : {};
      // lane headless-fallback: every call of a browser whose LAUNCH fell back names the planned config (displayed)
      if (Object.prototype.hasOwnProperty.call(ex, VERBS.CONFIG_KEY)) return displayed(opts, ex, ex[VERBS.CONFIG_KEY], recordForCall(ns, opts.session || null, ex));
      const file = configForCall(ns, opts.session || null, ex);
      return file ? displayed(opts, ex, file, recordForCall(ns, opts.session || null, ex)) : opts;
    };
    const displayed = (opts, ex, file, rec) => {
      const eff = rec && rec.display ? displays.fileFor(file, rec.display) : file;
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
  const pview = (p) => (p ? { ...B.publicProfileView(p), mediated: isMediated(p), scope: B.scopeOf(p), use: B.useDigestOf(p), createdBy: p.createdBy || null, ...(B.isEphemeralProfile(p) ? {} : { recordMine: HM.recordsMine(p) }) } : null); // (a conversation's own temporary browser is never browsed by him — no switch of his rides its record: verify r1 H1)
  /** The Task Groups the conversation carrying `browserKey` belongs to NOW → `{ids, unreadable, live}` (never throws);
   *  `live: false` = no running session carries the key (a stopped conversation: its membership is not readable NOW and
   *  it is not "no groups" — the re-judge keeps such a lease undecided when a Task Group row could admit it). */
  const groupsOfKey = (browserKey) => {
    if (typeof taskIdsForKey !== 'function') return { ids: [], unreadable: false, live: true };
    try { const r = taskIdsForKey(B.parentKeyOf(String(browserKey || ''))) || {}; return { ids: Array.isArray(r.ids) ? r.ids.map(String) : [], unreadable: !!r.unreadable, live: r.live !== false }; }
    catch (e) { log.warn?.(`[browser] the Task Group list could not be read for ${browserKey} — ${e && e.message}`); return { ids: [], unreadable: true, live: true }; }
  };
  /** A CONVERSATION ON ANOTHER MACHINE (identity verify r2, 2026-09-28): the wiring names the keys live remote sessions
   *  carry; `remote` = the caller's own knowledge (ws-create's spawn, before the session is registered). Never throws. */
  const isRemoteKey = (browserKey, remote = false) => { if (remote) return true; try { const v = remoteKeys(); const set = v instanceof Set ? v : new Set(v || []); return set.has(B.parentKeyOf(String(browserKey || ''))); } catch (e) { log.warn?.(`[browser] the remote-session list could not be read — ${e && e.message}`); return false; } };
  /** One Task Group's facts, or null (the store no longer lists it); `undefined` when the store itself is unreadable. */
  const taskFacts = (id) => {
    if (typeof taskInfo !== 'function') return undefined;
    try { return taskInfo(String(id)) || null; } catch (e) { log.warn?.(`[browser] the Task Group list could not be read (${id}) — ${e && e.message}`); return undefined; }
  };
  /** "who may use" in log words (never a name — keys and ids) */
  const whoWords = (p) => { const U = B.whoMayUse(p); if (!U || U.mode === 'all') return 'all conversations'; if (U.mode !== 'only') return 'an owner shape this release cannot judge'; return 'only ' + (U.who.map((w) => (w.kind === 'session' ? w.id : 'Task Group ' + w.id)).join(', ') || 'nobody'); };
  const sampleEvery = guardSampleMs || limits.GUARD_SAMPLE_MS;
  const rowOf = (id) => (providers && typeof providers.row === 'function' ? providers.row(id) : B.providerRow(id));
  // P10 (§7.6 tier 3, D27 (b)): the consent SETTING rides every control read —
  // the tier-3 row is usable only while it is true (a user act; agents cannot write settings)
  const desktopConsent = () => setting(require('../window-desktop').SETTING_KEY, false) === true;
  const control = (id, opts) => (providers && typeof providers.control === 'function' ? providers.control(id, opts) : B.providerControl(id, { desktopConsent: desktopConsent(), ...(opts || {}) }));
  let keysMemo = keys || null;
  const keysOf = () => { if (!keysMemo) keysMemo = require('./browser-backend.js').create({ integrations, log }); return keysMemo; };
  // lane-cloak: does a key row REFUSE to run without a key? The key consumer answers (browser-backend keyRequired =
  // the PURE table: cloak no — measured —, every cloud row yes); ONE answer for the gate, the view and start()
  const keyRequired = (id) => { const k = keysOf(); return typeof k.keyRequired === 'function' ? !!k.keyRequired(id) : SW.keyRequiredFor(id); };
  const setting = (k, d) => { try { const v = serverSetting(k); return v === undefined || v === null || v === '' ? d : v; } catch { return d; } };
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
  const digestExtras = new Set();
  const changeListeners = new Set(); // lane S2: `onChange` — the browser fact's re-publish hook (notify() fans out)
  function emitLease(ev) {
    // verify r3 #2 (site-reset): the persisted witness dies with the browser — a stop, or a FRESH start (an adoption keeps it:
    // the tabs are still there; a named browser that outlives a VibeSpace restart is adopted at load with no event at all)
    if (ev && ev.profileId && (ev.kind === 'browser-stopped' || (ev.kind === 'browser-ready' && !ev.adopted))) dropLeaseTabs(ev.profileId);
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
  function addDigest(fn) { digestExtras.add(fn); return () => digestExtras.delete(fn); }
  function digestExtra() { const out = {}; for (const fn of digestExtras) { try { Object.assign(out, fn() || {}); } catch (e) { log.warn?.(`[browser] digest extra failed: ${e && e.message}`); } } return out; }
  let timer = null;
  let loaded = false;
  let dirty = false;
  let fileHost = null; // lane profile-lock-roll: the hostname the registry file was last saved under (read at load)

  function load() {
    let rawDoc = null;
    try { rawDoc = JSON.parse(fs.readFileSync(storeFile, 'utf8')); reg = B.normalizeRegistry(rawDoc); }
    catch (e) { if (e.code !== 'ENOENT') log.warn?.(`[browser] ${STORE_FILE} unreadable (${e.message}) — starting from an empty registry; the old file is left in place`); reg = B.normalizeRegistry(null); }
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
    // verify r8 (T2 ⑥ / ①): the fleet's other order — the new pod's boot pull refused ⇒ the .199 keeper boots first there and NULLS
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
  function ensureLoaded() { if (!loaded) { load(); warmCliVersions(); } }
  function save() {
    reg.humans = humansForDisk(); // BROWSE YOURSELF verify r1 (H4): mirrored at every write (the Map stays the truth)
    reg.host = os.hostname(); // lane profile-lock-roll (L1): the file names the machine that wrote it — the next pod's legacy witness
    try { fs.mkdirSync(dataDir, { recursive: true }); writeJsonAtomic(storeFile, reg); dirty = false; return true; }
    catch (e) { log.warn?.(`[browser] could not write ${STORE_FILE}: ${e.message}`); return false; } // verify r9 (④): a caller that must know (a Forget's move) asks
  }
  function notify() {
    try { broadcast?.({ type: 'browser-profiles-updated', ...list() }); } catch (e) { log.warn?.(`[browser] broadcast failed: ${e.message}`); }
    // lane S2: every registry change (a start, a failure, a pin, a removal, a label) may move a conversation's
    // BROWSER FACT — the wiring re-computes the facts and re-publishes active-sessions when a digest moved
    for (const fn of changeListeners) { try { fn(); } catch (e) { log.warn?.(`[browser] change listener failed: ${e && e.message}`); } }
  }
  function onChange(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); }
  // ONE WRITE, ONE BROADCAST PER USER ACT (verifier 2026-09-28): a narrowing of "Who can use it" detaches every lease the
  // list no longer admits, and `detach()` commits — 50 leases were 50 registry writes (sync, on whatever disk data/ is) and
  // 50 whole-digest broadcasts + 50 active-sessions re-publishes to every client, for one Save. Inside `batched(fn)` a
  // commit only marks; the ONE commit runs when the outermost batch ends (nothing ran ⇒ nothing written).
  let batchDepth = 0, batchDirty = false;
  function commit() { if (batchDepth > 0) { batchDirty = true; return; } save(); notify(); }
  function batched(fn) {
    batchDepth++;
    try { return fn(); }
    finally { if (--batchDepth === 0 && batchDirty) { batchDirty = false; save(); notify(); } }
  }

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
    return { ...rec, cdpUrl: undefined, remoteCdpUrl: undefined, envPairs: undefined, live: l ? { ...l } : null, runningBuild: BB.runningBuildOf(rec.cdpBrowser), // lane browser-admin 2a: the build the browser itself reports
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
    return reg.profiles.filter(isEph).map((p) => {
      const b = reg.browsers[p.id] || null;
      const l = reg.leases.find((x) => x.profileId === p.id) || null;
      return { profileId: p.id, label: p.label, browserKey: p.owner.id, child: B.isChildKey(p.owner.id), sessionId: l ? l.sessionId || null : null, leased: !!l, dir: p.dir || null,
        state: b ? b.state : 'not-started', live: B.isLiveBrowser(b), startedAt: b ? b.startedAt || 0 : 0, endedAt: b ? b.endedAt || 0 : 0, pid: b ? b.pid || null : null, stoppedBy: b ? b.stoppedBy || null : null, lastError: b ? b.lastError || null : null,
        adopted: !!(b && b.adoptedAt), usage: live.get(p.id) ? { ...live.get(p.id) } : null, createdAt: p.createdAt || 0,
        display: b && b.display ? b.display : null, // lane headless-fallback: the launch's display fact (headless instead of a window, and why)
        kept: B.isBrowserKey(p.owner.id) && keptStore() ? keptStore().brief(p.owner.id) : null }; // lane browser-resume: what its conversation keeps when it stops
    });
  }
  function ephemeralFor(browserKey) { const k = String(browserKey || ''); return ephemerals().find((e) => e.browserKey === k) || null; }
  function list() {
    ensureLoaded();
    const browsers = {};
    for (const [id, r] of Object.entries(reg.browsers)) browsers[id] = browserView(r);
    const running = Object.values(reg.browsers).filter(B.isLiveBrowser).length + othersNow().length;
    const lv = bf.lastVersion();
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
      pins: { ...reg.pins }, cap: { used: running, cap: machineCap(), setting: 'browser.maxRunning' },
      windowLeaks: { count: windowLeaks.count, last: windowLeaks.last ? { ...windowLeaks.last } : null }, // verify r3 T2 ①: rung-2 tabs that landed in another holder's window, closed at once — COUNTED (this run)
      // owner ruling A (2): who DRIVES each shared profile's browser right now (profileId → {browserKey, since, at}) — a
      // browser key, never a name (this digest also reaches agents); the client names it from its own session rows
      floor: lv === undefined ? null : B.floorVerdict(lv, B.FLOOR_VERSION),
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
  /** `chromium 146` / `cloak 146 (free)`: the profile's backend + the major it
   *  is known to write (its own record first, else the backend's last launch). */
  function chipFor(p) {
    const f = SW.backendFact(p, { seats: reg.seats, majors: reg.majors });
    return SW.backendChip({ provider: f.id, major: f.major, tier: f.plan });
  }
  /** The digest's `backends[id]`: the chip's fact + the switch choices (the dialog's cards, never the key/binary/version). */
  function backendFactFor(p) {
    return { ...SW.backendFact(p, { seats: reg.seats, majors: reg.majors }), choices: SW.switchChoices({ profile: p, providerIds: B.providerIds(), rowOf, controlOf: control }) };
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
  function leasesFor(browserKey, opts) { ensureLoaded(); return B.leasesOf(reg.leases, browserKey, opts).map(leaseView); }
  function leasesOn(profileId) { ensureLoaded(); return reg.leases.filter((l) => l.profileId === profileId).map(leaseView); }

  // ── profiles ──
  function mintId() { for (;;) { const id = B.mintProfileId(crypto.randomBytes(4).toString('hex')); if (!reg.profiles.some((p) => p.id === id)) return id; } }
  function userConfig() { try { return JSON.parse(fs.readFileSync(path.join(homeDir, B.USER_CONFIG_REL), 'utf8')) || {}; } catch { return {}; } }
  // takeover r3: the keeper's own config files (see `configured`) — written 0600 under data/browser-env/,
  // re-written only when their content changes (the user edited the file / the headed setting moved)
  const CONFIG_DIR = path.join(dataDir, 'browser-env');
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
   *  No mark (a lease's session never launches) ⇒ no. A cloak launch is never stamped (its own build, `launchEnvFor`). */
  function automationFlagFor(kind, mark) {
    if (!mark) return false;
    try {
      if (kind === 'ephemeral') { const p = reg.profiles.find((x) => isEph(x) && x.owner.id === mark); return !!(p && reg.browsers[p.id] && reg.browsers[p.id].automationFlag); }
      return !!(reg.browsers[mark] && reg.browsers[mark].automationFlag);
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
    if (kind === 'ephemeral') cfg = B.generatedConfig({ userConfig: user || {}, projectConfig: null, pinnedDir: null, headed: h, mark: markOk, holdDialogs: hold, automationFlag: flag });
    else { cfg = VERBS.sanctionedConfig({ user }).config; if (h !== null) cfg.headed = h; if (flag) cfg.args = B.withAutomationFlag(cfg.args, { on: true }); if (markOk) cfg.args = B.withKeeperMark(cfg.args, markOk); if (hold) cfg.noAutoDialog = true; }
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
    if (typeof own === 'string' && own.startsWith('/')) return planned(own);
    // r4: an ephemeral's command runs with the file its browser was LAUNCHED with (marked when the keeper launched it) —
    // a different one would relaunch its Chrome (measured); a lease's session with machine.json (it never launches)
    return ephemeral ? planned(ephemeralConfigFor(pe)) : machineConfigFile('machine');
  }
  /**
   * Create a profile. `owner` = { kind, id }: a session-created profile is
   * owned by its CONVERSATION (kind 'session', id = browserKey — the identity
   * that survives resume), a UI-created one by the instance. The directory is
   * made 0700 under ~/.agent-browser/ (the CLI's own root, so `agent-browser
   * profiles` lists it too); an adopted directory keeps its path.
   */
  function createProfile(input = {}, { owner = null, dir = null, legacy = false, createdBy = null, use = null, knownKeys = null, by = 'user', builds = null } = {}) {
    ensureLoaded();
    const v = B.validateProfileInput(input, { existing: named(), control, mediation: mediationOn() });
    if (!v.ok) throw namedError(v.code, v.error, v.why ? { why: v.why } : {});
    // lane browser-admin (the New profile… dialog): "Who can use it" is chosen AT the create — the rows the route resolved
    // (a picked live session → its browser key) are judged by THE write's verdict over an empty record, BEFORE anything is
    // minted: a refusal writes nothing, and the record is born with its list (ONE write, never create-then-PATCH)
    if (use != null) owner = ownerFromUse(use, { knownKeys, label: v.value.label });
    // lane browser-admin 2a: the Chrome BUILD the profile runs — the USER's choice only (an agent's route passes `by`),
    // judged by THE verdict over the machine's own list (`builds` = the route's fresh listing of a paired machine; this
    // machine's is read here). A new directory was never written: no version ladder at the create.
    const choice = choiceAtCreate(input.browser, { provider: v.value.provider, host: v.value.host, by, builds, label: v.value.label });
    // P4: the ROW said a paired machine may run it; whether the id names one
    // is this instance's host registry's answer (refused by name, never a
    // silent local fallback)
    if (v.value.host && !knownHost(v.value.host)) throw namedError('unsupported-host', `${JSON.stringify(v.value.host)} is not a paired machine on this instance — pair it first (Remote → Pair a device), or leave host empty for this machine`);
    const id = mintId();
    // The directory is OURS only for a row that owns one, on THIS machine: a
    // paired machine composes and owns its own (browser-serve), `cdp` has none.
    const ownsHere = v.value.ownsDir && !v.value.host;
    const d = dir ? String(dir) : (ownsHere ? path.join(homeDir, '.agent-browser', B.profileDirName(id)) : null);
    if (!dir && d) { try { fs.mkdirSync(d, { recursive: true, mode: 0o700 }); } catch (e) { throw namedError('dir_unwritable', `cannot create the profile directory ${d}: ${e.message}`); } }
    const { ownsDir, ...fields } = v.value;
    // §7.4: a seeded backend's fingerprint seed is minted ONCE, here, and
    // carried through every later switch (never re-minted per launch)
    if (SW.providerNeedsSeed(fields.provider) && !Number.isInteger(fields.fingerprintSeed)) fields.fingerprintSeed = SW.mintSeed(crypto.randomBytes(4).toString('hex'));
    const rec = B.newProfileRecord({ id, ...fields, dir: d, owner, legacy, now: now(), createdBy });
    if (choice.kind !== 'default') rec.browser = choice;
    reg.profiles.push(rec);
    commit();
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
  function choiceAtCreate(raw, { provider, host = null, by = 'user', builds = null, label = '' } = {}) {
    const c0 = BB.normalizeBrowserChoice(raw);
    if (c0 && c0.kind === 'default') return c0;
    const list = c0 && c0.kind === 'build' ? (host ? builds : buildsHere()) : null;
    const pf = c0 && c0.kind === 'path' && !host ? BB.fileFact(c0.path) : null;
    const v = BB.browserChoiceVerdict({ choice: raw, provider, by, builds: list, pathFact: pf, machine: host || 'this computer', label });
    if (!v.ok) throw namedError(v.code, v.error, v.version ? { version: v.version } : {});
    return v.choice;
  }
  /** The chosen build's executable for a LOCAL chromium launch, judged NOW (a build that vanished since it was chosen is
   *  refused `browser_build_missing` by name — never a silent fall back to another build); a missing one is MARKED on
   *  the record (the panel row says it) and filed ONCE as a For-you item (origin browser); a present one clears the mark.
   *  → `{executablePath}` ({} for the default). Throws by name. */
  function launchBuildOf(p) {
    const c = BB.normalizeBrowserChoice(p.browser);
    if (!c || c.kind === 'default' || !(B.providerRow(p.provider) || {}).buildChoice) { if (p.buildMissing) { delete p.buildMissing; dirty = true; } return {}; }
    const v = BB.browserChoiceVerdict({ choice: c, provider: p.provider, by: 'user', builds: c.kind === 'build' ? buildsHere() : null, pathFact: c.kind === 'path' ? BB.fileFact(c.path) : null, label: p.label });
    if (v.ok) { if (p.buildMissing) { delete p.buildMissing; dirty = true; log.log?.(`[browser] ${p.id} "${p.label}": its chosen Chrome build is back (${c.kind === 'build' ? c.version : c.path})`); } return { executablePath: v.executablePath }; }
    noteBuildMissing(p, c, v);
    throw namedError(v.code === 'browser_path_missing' || v.code === 'browser_path_not_executable' ? v.code : 'browser_build_missing', v.error, { version: c.kind === 'build' ? c.version : null });
  }
  /** ONE mark + ONE For-you item per (profile, choice) until it is resolved (the build is back, or the user picks another). */
  function noteBuildMissing(p, c, v) {
    const what = c.kind === 'build' ? c.version : c.path;
    const had = p.buildMissing && p.buildMissing.what === what;
    if (!had) { p.buildMissing = { what, kind: c.kind, code: v.code, at: now(), filed: false }; commit(); }
    if (p.buildMissing.filed) return;
    if (!userTodos || typeof userTodos.add !== 'function') { if (!had) log.warn?.(`[browser] ${p.id} "${p.label}": its Chrome build ${what} is missing — ${v.error} (no For-you store is wired, so only this journal says so)`); return; }
    const n = BB.missingNotice({ label: p.label, choice: c });
    try { userTodos.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', text: n.text, detail: n.detail, sessionName: 'Agent browser' }); p.buildMissing.filed = true; commit(); }
    catch (e) { log.warn?.(`[browser] ${p.id} "${p.label}": the missing-build notice was not filed (${e && e.message}) — tried again at the next launch`); }
    log.warn?.(`[browser] ${p.id} "${p.label}": its Chrome build ${what} is missing — ${v.error}`);
  }
  /** lane browser-admin: the owner a NEW record is born with from the dialog's `use` (rows already resolved to keys by the
   *  route) — THE write's verdict over an empty record, so a create says the same refusals a PATCH says. Throws by name. */
  function ownerFromUse(use, { knownKeys = null, label = '' } = {}) {
    const known = new Set(Array.isArray(knownKeys) ? knownKeys : []);
    const uv = B.usePatchVerdict({ profile: { id: 'bp-00000000', label: String(label || ''), owner: { kind: 'instance', id: null } }, use, knownTask: (tid) => taskFacts(tid) !== null, knownKey: (bk) => known.has(bk) });
    if (!uv.ok) throw namedError(uv.code, uv.error);
    return uv.owner;
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
  /** lane S2: may this profile's record go at all (leases / a running browser) — asked BEFORE any pin is cleared for it. */
  function removeVerdict(id) {
    ensureLoaded();
    const p = profile(id);
    if (!p) return { ok: false, code: 'not-found', error: `no profile ${id}` };
    const held = reg.leases.filter((l) => l.profileId === id);
    if (held.length) return { ok: false, code: 'leased', error: `profile "${p.label}" is attached by ${held.length} session(s) (${held.map((l) => l.browserKey).join(', ')}) — detach them first` };
    if (B.isLiveBrowser(reg.browsers[id])) return { ok: false, code: 'running', error: `profile "${p.label}" has a running browser — stop it first` };
    return { ok: true };
  }
  /** Removal is refused while anything holds or runs it — a cookie jar is
   *  somebody's login; the directory itself is NEVER deleted by this (D8). */
  function removeProfile(id, { unpin = false } = {}) {
    ensureLoaded();
    const p = profile(id);
    if (!p) throw namedError('not-found', `no profile ${id}`);
    // lane S2 (naive study 2, T7): a profile a conversation PINS is never removed out from under it — refused
    // `pinned` with the count (the UI asks "N conversations use this profile — unpin them?"); with `unpin` every
    // such pin is cleared and MARKED (the conversation's browser fact says "work was deleted — its pin was cleared")
    // (the pin is judged LAST: a leased / running profile is refused first, so an unpin never runs for a removal that cannot happen)
    const rv = removeVerdict(id);
    if (!rv.ok) throw namedError(rv.code, rv.error);
    const pv = BF.deletePinnedVerdict({ label: p.label, pinnedBy: pinnedBy(id), unpin });
    if (!pv.ok) throw namedError(pv.code, pv.error, { pinnedCount: pv.count, pinnedNames: pv.names });
    // verify r4 (S26b): the DIRECTORY remembers the lineage its record carried — a retired ephemeral's kept directory outlives it
    // verify r8 (T2 ③): a record whose start was REFUSED (`failed` at the door: an adopted backup judged a copy, a stranger's directory)
    // has nothing to remember — its retire never mints into the directory (the launched record's retire remembers as r4 built it)
    if (p.dir && reg.browsers[id]) { const rr = reg.browsers[id]; if (rr.state !== 'failed') rememberDir(p.dir, launchHostsFor(rr, p.dir), { retire: true }); else lineageLedger('retire-skipped-refused', { dir: dirKeyOf(p.dir), id }); }
    reg.profiles = reg.profiles.filter((x) => x.id !== id);
    delete reg.browsers[id];
    for (const [k, v] of Object.entries(reg.pins)) if (v && v.profileId === id) reg.pins[k] = { profileId: null, origin: 'harness', at: now(), cleared: { id, label: p.label, at: now() } }; // lane S2: the cleared MARK (read by the browser fact)
    ephPairs.delete(id); ephSessions.delete(id); humans.delete(id); rung2Refusals.delete(String(id)); delete reg.leftTabs[id]; // BROWSE YOURSELF: never outlives its record; verify r5 ②: nor the refusals told at a drive's end
    // r4: the keeper's own marked config for this record goes with it (nothing runs on it — removal needs a stopped browser)
    { const mk = markOf(p); if (mk && MARK_RE.test(String(mk))) { try { fs.rmSync(path.join(CONFIG_DIR, markFileName(isEph(p) ? 'ephemeral' : 'machine', mk)), { force: true }); } catch { /* best effort */ } configMemo.delete((isEph(p) ? 'ephemeral' : 'machine') + '|' + mk); } }
    commit();
    if (isEph(p)) log.log?.(`[browser] ephemeral browser record ${id} "${p.label}" removed with its conversation ${p.owner.id}${p.dir ? ' (its scratch directory ' + p.dir + ' is browser-env\'s sweep to reclaim)' : ''}`);
    else log.log?.(`[browser] profile ${id} "${p.label}" removed from the registry (its directory ${p.dir} is kept — deletion is a human act)`);
    return { removed: id, dir: p.dir };
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
    const allowed = new Set(['record', 'label', 'notes', 'sharing', 'use', 'base', 'recordMine']); // + BROWSE YOURSELF: "Also record my own actions"
    const keys = Object.keys(patch || {}).filter((k) => patch[k] !== undefined);
    if (keys.includes('scope') || keys.includes('conversation')) throw namedError('bad-request', '"Who can use it" is a list now — send `use`: {mode:"all"} or {mode:"only", who:[{kind:"task", id} | {kind:"session", key}]} with the `base` stamp you read');
    const bad = keys.filter((k) => !allowed.has(k));
    if (bad.length) throw namedError('bad-request', `these fields cannot be changed here: ${bad.join(', ')} (only record / label / notes / sharing / use / recordMine)`);
    if (!keys.filter((k) => k !== 'base').length) throw namedError('bad-request', 'nothing to change');
    if (keys.includes('base') && !keys.includes('use')) throw namedError('bad-request', '`base` goes with `use`');
    // `use` is saved ON ITS OWN: its narrowing detaches leases (each detach commits), so a later field refused in the same
    // body would leave half a write on disk
    if (keys.includes('use') && keys.some((k) => k !== 'use' && k !== 'base')) throw namedError('bad-request', '`use` is saved on its own — send the other fields in another request');
    const changed = {};
    let detached = [], undecided = [], added = [];
    if (keys.includes('use')) {
      // THE WHOLE-LIST RULE (mirror-193), asked HERE — after every await the route made resolving the picked sessions: a
      // list that moved since the dialog read it is never overwritten (409 list-changed, nothing written)
      const bv = B.useBaseVerdict(p, patch.base);
      if (!bv.ok) throw namedError(bv.code, bv.error, { added: bv.added || [], removed: bv.removed || [] });
      const known = knownKeysOf(p, opts.knownKeys);
      const v = B.usePatchVerdict({ profile: p, use: patch.use, knownTask: (tid) => taskFacts(tid) !== null, knownKey: (bk) => known.has(bk) });
      if (!v.ok) throw namedError(v.code, v.error);
      const wasStamp = B.useStamp(p), was = B.useDigestOf(p);
      const next = { ...p, owner: v.owner };
      if (B.useStamp(next) !== wasStamp) {
        const wasRows = new Set((was.who || []).map((w) => (w.kind === 'session' ? 's:' + w.key : 't:' + w.id)));
        p.owner = v.owner;
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
    if (Object.keys(changed).length) { commit(); log.log?.(`[browser] profile ${id} "${p.label}" updated: ${Object.keys(changed).join(', ')}${changed.use ? ` (who can use it: ${whoWords(p)})` : ''}${detached.length ? ` (narrowed: ${detached.length} conversation(s) detached — ${detached.map((d) => d.browserKey).join(', ')})` : ''}${undecided.length ? ` (kept, undecided — the Task Group list could not be read: ${undecided.join(', ')})` : ''}`); emitLease({ kind: 'profile-updated', profileId: id, changed }); }
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
    if (U && U.mode === 'only') for (const w of U.who) if (w.kind === 'session') out.add(w.id);
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
      const may = B.mayAttach(p, { browserKey: l.browserKey, taskIds: g.ids, groupsUnreadable: notNow });
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
      const U = B.whoMayUse(p);
      if (!U || U.mode !== 'only' || !U.who.some((w) => w.kind === 'task')) continue;
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
  function closeLeaseSession(p, browserKey, why) {
    if (!p || isEph(p) || isMediated(p)) return;
    const rec = reg.browsers[p.id];
    if (!B.isLiveBrowser(rec) || !isLocalRec(rec)) return;
    (async () => {
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
    })().catch((e) => log.warn?.(`[browser] ${browserKey}: its tab in ${p.id} was not closed (${why}) — ${e && e.message}`));
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
    const may = B.mayAttach(p, { browserKey, taskIds: g.ids, groupsUnreadable: !!g.unreadable });
    if (may.ok) return null;
    const owner = B.ownerWithConversation(p, browserKey);
    if (!owner) return null;
    p.owner = owner; p.scopeAt = now();
    log.log?.(`[browser] ${B.parentKeyOf(browserKey)} added to who can use ${p.id} "${p.label}" — the user picked it for that conversation (now ${whoWords(p)})`);
    return { profileId: p.id, label: p.label };
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
    if (!profileId) { const had = !!reg.pins[browserKey]; delete reg.pins[browserKey]; pinFailures.delete(browserKey); if (had) commit(); return null; }
    const p = profile(profileId);
    if (!p || isEph(p)) throw namedError('not-found', `no profile ${profileId}`);
    const facts = Array.isArray(taskIds) ? { ids: taskIds.map(String), unreadable: !!groupsUnreadable } : null;
    if (by === 'agent') { const g = facts || groupsOfKey(browserKey); const may = B.mayAttach(p, { browserKey, taskIds: g.ids, groupsUnreadable: !!g.unreadable }); if (!may.ok) throw namedError(may.code, may.error, may.remedy ? { remedy: may.remedy } : {}); }
    const added = by !== 'agent' && origin === 'chosen' ? addConversation(p, browserKey, facts, { remote }) : null;
    reg.pins[browserKey] = { profileId: p.id, origin, at: now(), by: by === 'agent' ? 'agent' : 'user' };
    pinFailures.delete(browserKey);
    commit();
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
    commit();
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
    commit();
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
  function taskGroupCapFor(facts = {}) {
    if (typeof taskGroupCap !== 'function') return null;
    try { return B.clampConversationCap(taskGroupCap(facts || {})); } catch (e) { log.warn?.(`[browser] task-group cap unreadable — ${e && e.message}`); return null; }
  }
  function instanceDefault() {
    const v = setting('browser.defaultProfile', '');
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
  function pinForCreate({ explicit = '', priorKey = '', forkParentKey = '', taskGroupDefault = '', resume = false, fork = false } = {}) {
    ensureLoaded();
    const prior = priorKey ? (pinFor(priorKey)?.profileId || '') : '';
    const forkParent = forkParentKey ? (pinFor(forkParentKey)?.profileId || '') : '';
    const pick = B.pinForCreate({ explicit, prior, forkParent, taskGroup: taskGroupDefault, instanceDefault: instanceDefault(), resume, fork });
    const p = pick.value ? profile(pick.value) || (profileByRef(pick.value) && !profileByRef(pick.value).ambiguous ? profileByRef(pick.value) : null) : null;
    if (pick.value && !p) return { profileId: '', dir: null, origin: 'harness', refused: `pinned profile ${pick.value} no longer exists` };
    // OWNER RULING A: a pin names a profile, NEVER a directory (`dir` stays in the answer for display only — ws-create
    // hands the spawn no pinned directory any more); a mediated profile is pinned like any other (P6's skip is gone)
    return { profileId: p ? p.id : '', dir: p ? p.dir : null, origin: p ? pick.origin : 'harness', label: p ? p.label : null };
  }

  // ── the browser: reuse-or-spawn ──
  function idleMs() { return B.idleTimeoutMs(setting('browser.idleTimeoutMs', B.DEFAULT_IDLE_TIMEOUT_MS)); }
  /** lane browser-windows (U4): the machine's ceiling of running browsers is the SETTING `browser.maxRunning` (1–32), read
   *  at every judgement (a change applies to the next start); the keeper's CONCURRENT_CAP (6) is its default. Desktop apps
   *  keep their own ceiling. The resource guard only REPORTS, as before. */
  function machineCap() { return WIN.maxRunningOf(setting('browser.maxRunning', null), Number(limits.CONCURRENT_CAP) || LIMITS.CONCURRENT_CAP); }
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
  function stampGroupCap(browserKey, facts = {}, { value = undefined } = {}) {
    ensureLoaded();
    const bk = B.parentKeyOf(browserKey);
    if (!B.isBrowserKey(bk)) return capFor(bk);
    const v = reg.caps[bk] || null;
    if (v && Number.isInteger(v.group)) return capFor(bk);
    // B-f7ab verify r2: the late key hands in the value its spawn WITNESSED at the start (`value`; null = none was in
    // force) instead of reading the group live — a group edited after the conversation started never reaches it
    let g = null;
    if (value !== undefined) g = B.clampConversationCap(value);
    else if (typeof taskGroupCap === 'function') { try { g = B.clampConversationCap(taskGroupCap(facts || {})); } catch (e) { log.warn?.(`[browser] task-group cap unreadable — ${e && e.message}`); g = null; } }
    if (g === null) return capFor(bk);
    reg.caps[bk] = { cap: v && Number.isInteger(v.cap) ? v.cap : null, group: g, at: now() };
    commit();
    log.log?.(`[browser] ${bk}: the Task Group's default browser cap ${g} stamped at start`);
    return capFor(bk);
  }
  /** Set (1..6) or clear (null) a conversation's explicit cap — a USER act; the digest broadcast carries it to every window. Clearing goes back to the default it STARTED with. */
  function setCap(browserKey, cap) {
    ensureLoaded();
    const bk = B.parentKeyOf(browserKey);
    if (!B.isBrowserKey(bk)) throw namedError('bad-request', 'a cap needs a conversation\'s browser key');
    const c = cap === null || cap === undefined || cap === '' ? null : B.clampConversationCap(cap);
    if (cap !== null && cap !== undefined && cap !== '' && c === null) throw namedError('bad-request', `a per-conversation cap is ${B.CONVERSATION_CAP_MIN}..${B.CONVERSATION_CAP_MAX}`);
    const group = groupCapOf(bk);
    if (c === null && group === null) delete reg.caps[bk]; else reg.caps[bk] = { cap: c, group, at: now() };
    commit();
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
  /** An ephemeral daemon whose pid is gone idled out (the CLI's own timeout):
   *  recorded `stopped` — not an error; the next verb starts it again. */
  function markEphemeralGone(rec, seenBy = 'the tick') {
    rec.state = 'stopped'; rec.endedAt = now(); rec.stoppedBy = 'idle'; rec.lastError = null;
    rec.note = `the browser idled out (${Math.round((Number.isInteger(rec.idleMs) ? rec.idleMs : pairsIdleMs(pairsOf(rec.profileId))) / 60000)} min without a command) — the next command starts it again`;
    guard.delete(rec.profileId); live.delete(rec.profileId);
    dirty = true;
    log.log?.(`[browser] ephemeral ${rec.profileId} (${rec.ns}) daemon gone (pid ${rec.pid}${livenessOf(rec) === 'recycled' ? ', now another process' : ''}, seen by ${seenBy}) — recorded stopped (idle), the next verb restarts it`);
    emitLease({ kind: 'browser-stopped', profileId: rec.profileId, why: 'idle', local: true, ...ephEventFields(rec.profileId) }); // lane H: its holder row leaves the digest
    keptNote('stop', profile(rec.profileId), { why: 'idle' }); // lane browser-resume: its logins + its last tabs are kept (the daemon is gone: the relay's list)
    reapOrphan(rec, seenBy); // verify r2 M1: the Chrome its dead daemon left behind is ended (tracked; a start waits on it)
  }
  /** VERIFY r2 M1: a NAMED profile's local record whose daemon is gone (dead, or its pid recycled) — recorded stopped,
   *  and the browser that daemon launched is ended (it would hold the profile's SingletonLock: the relaunch's exit 21). */
  function markDaemonGone(rec, seenBy) {
    const v = livenessOf(rec);
    rec.state = 'stopped'; rec.endedAt = now();
    rec.lastError = v === 'recycled' ? `the browser daemon exited (pid ${rec.pid} is another process now)` : 'the browser daemon exited';
    guard.delete(rec.profileId); live.delete(rec.profileId);
    dirty = true;
    log.log?.(`[browser] ${rec.profileId} daemon gone (pid ${rec.pid}${v === 'recycled' ? ', now another process' : ''}, seen by ${seenBy}) — recorded stopped`);
    tabsLost(rec.profileId, `its daemon gone (seen by ${seenBy})`); // lane profile-lock-roll (L2): every lease's tab went with it
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
    if (!save()) { reg.dirHosts = before; dirty = true; lineageLedger('rekey-refused', { from: f, to: t }); log.warn?.(`[browser] the launch-host lineage of ${f} could not be written under ${t} (${STORE_FILE} unwritable) — the directory is NOT moved`); return { ok: false, moved: false, key: null, error: `${STORE_FILE} could not be written` }; }
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
    reg.tabLostWhy[k] = why === 'closed' ? 'closed' : 'life';
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
   *  refusal that attempted nothing (another browser holds the directory, a cloak record) carries none — the tick re-reads
   *  the lock every pass (a /proc read), so the heal follows the human's close within one tick. */
  const healGated = (rec) => !!(rec && rec.closed && Number.isFinite(rec.closed.retryAt) && now() < rec.closed.retryAt);
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
      rec.unresponsive = fact; dirty = true;
      if (!was || was.since !== fact.since) { log.warn?.(`[browser] ${BS.unresponsiveLine({ id: p.id, label: p.label, since: fact.since, asks: fact.asks, pid, gpu: gpuPctOf(p.id) })}`); noticeUnresponsive(rec, p); commit(); }
    } else if (was) {
      rec.unresponsive = null; dirty = true;
      log.log?.(`[browser] ${BS.answeredAgainLine({ id: p.id, label: p.label, since: was.since, at, by: v.state === 'closed' || replaced ? 'its process ended' : by })}`);
      resolveUnresponsive(rec, 'browser-answered'); commit();
    }
    return rec.unresponsive || null;
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
    if (by !== 'user') {
      const a = BS.restartAdmission({ by: 'agent', unresponsive: rec.unresponsive || null, humanDriving: userDrivesAnyWindowOf(profileId), label: p.label });
      if (!a.ok) { log.log?.(`[browser] ${browserKey || 'an agent'} on ${profileId}: restart refused ${a.code}`); throw namedError(a.code, a.error); }
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
    log.log?.(`[browser] ${profileId} "${p.label}": restarted by ${who}${u ? ` — it had not answered since ${BS.utcClock(u.since)} (asks ${u.asks})` : ''}; ${others.length} other conversation(s) told`);
    commit();
    return browser || browserView(reg.browsers[profileId]);
  }
  function healBrowser(rec, p, seenBy, { force = false } = {}) {
    if (!rec || !p || rec.state !== 'ready' || !isLocalRec(rec) || starting.has(p.id) || stopping.has(p.id) || switching.has(p.id)) return Promise.resolve(null);
    if (livenessOf(rec) !== 'ours') return Promise.resolve(null); // never under a daemon we cannot prove ours (the tick marks it gone)
    if (healing.has(p.id)) return healing.get(p.id);
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
      { const c = cliOptOf(rec); if (c && c.gone) { if (setClosed(rec, { code: 'browser_cli_gone', error: closedText(p, c.gone) })) { log.warn?.(`[browser] ${p.id} "${p.label}": its browser closed (daemon ${rec.pid} alive, seen by ${seenBy}) and is NOT started again — ${c.gone}`); commit(); } return null; } }
      // a browser launched with the provider's own flags (cloak's executable + fingerprint) is never relaunched by a bare
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
  async function endProcess(pid, starttime) {
    const same = () => F.pidAlive(pid) && F.sameProcess(pid, starttime);
    if (!F.pidAlive(pid)) return 'gone';
    if (!same()) return 'unproven';
    try { process.kill(pid, 'SIGTERM'); } catch { /* gone meanwhile */ }
    for (let i = 0; i < 15 && F.pidAlive(pid); i++) await sleep(100);
    if (same()) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } for (let i = 0; i < 10 && F.pidAlive(pid); i++) await sleep(50); }
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
        r = await endProcess(b.pid, b.starttime);
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
      { const lh = launchHostsFor(prev, p.dir || null); if (lh.length) { rec.hosts = lh; rec.host = prev && prev.host ? prev.host : lh[lh.length - 1]; } } // verify r4 (S26b): a retired record's directory still knows
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
        const r = await rt.launch(null, { idleMs: launchIdle, headed: null, extraEnv: { ...env0, ...rec.display.env } });
        if (!r.ok) {
          const text = (r.stderr || r.error || r.stdout || '').trim().slice(0, 300);
          const lr = lockRefusalAfterLaunch(p, prev); // verify r2 (F1): its kept directory taken meanwhile ⇒ said by name
          rec.state = 'failed'; rec.endedAt = now(); rec.lastError = lr ? lr.error : `the browser did not start: ${text}`;
          commit();
          // verify r3 (F3): said in the journal on this row too (the named start's sentence; the ephemeral start said nothing)
          if (lr) { log.warn?.(`[browser] ephemeral ${profileId} "${p.label}": NOT started — ${lr.tookOver ? `a lock of this machine's previous name ${lr.tookOver} reached the launch (taken over now)` : 'the directory was taken while launching'}: ${lr.error}`); throw namedError(lr.code, lr.error, lr.holderPid ? { holderPid: lr.holderPid } : {}); }
          throw namedError(/binary_absent/.test(text) ? 'binary_absent' : 'launch_failed', rec.lastError);
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
      if (adopted || !rec.cli || (info.version && info.version !== rec.cli.version)) rec.cli = cliOfDaemon(info) || rec.cli || null;
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
    return p0.finally(() => { if (starting.get(profileId) === p0) starting.delete(profileId); });
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
      } else if (tabs.length) out = { kind: 'kept', why: entry0.stoppedWhy || null, tabs: tabs.length };
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
    const targets = act ? await tabTargetsOf(o.extraEnv.AGENT_BROWSER_CDP) : null;
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
   *  holder's create to the other's window (the cycle moves Chrome's sticky create target; measured). Bounded by profiles. */
  const rung2Locks = new Map();
  async function rung2Serialized(profileId, fn) { const k = String(profileId); const prev = rung2Locks.get(k) || Promise.resolve(); let done; const cur = new Promise((r) => { done = r; }); rung2Locks.set(k, prev.then(() => cur, () => cur)); await prev.catch(() => { }); try { return await fn(); } finally { done(); if (rung2Locks.get(k) === cur) rung2Locks.delete(k); } }
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
  async function openOwnTab(p, holderKey, { url = '', ns = null, opts = {}, pin = [], fallback = true, json = false, timeout = 30000 } = {}) {
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
        const viaActivate = (a) => rung2Serialized(p.id, () => { plan = planNow(); if (plan.run === false) return { ok: false, code: 'rung2_not_run', error: plan.why }; return open((x) => (typeof activateFn === 'function' ? activateFn(rec.cdpUrl, { anchorTargetId: x, windowId: wantWin, tries: WIN.RUNG2_TRIES, breaker: plan.breaker }) : VP().openTabByActivate(rec.cdpUrl, { anchorTargetId: x, windowId: wantWin, tries: WIN.RUNG2_TRIES, breaker: plan.breaker })), a); });
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
      try { await (typeof closeTargetFn === 'function' ? closeTargetFn(rec.cdpUrl, id) : require('./browser-viewport.js').closeTarget(rec.cdpUrl, id)); } catch { /* the next start ends it */ }
      // verify r5 ③ (MEASURED on the product's Chrome, 30/30 per mode): a bind that fails — the user closed the holder's window
      // between the create and the `tab <id>` ("No tab with label …") — fell to the binary's own `tab new`, which lands in the
      // browser's LAST window in the FOREGROUND: the other holder's page hidden for good (the U0b class this lane exists to
      // end, on the fallback path). An own-window tab whose bind failed is REFUSED window_busy (why bind_failed): nothing
      // opened, the same `tab new` once more re-asks the window (gone ⇒ a new window of its own) — never the shared fallback
      if (fallback) { log.log?.(`[browser] ${holderKey} on ${p ? p.id : '?'}: its new tab ${id.slice(0, 8)} could not be bound to its session (${execWhy(b)}) — closed, refused window_busy (bind_failed), never the browser's last window`); made = { ok: false, code: 'window_busy', why: 'bind_failed', error: `your new tab could not be bound to your session (${execWhy(b)}) — nothing opened; run the same \`tab new\` once more (a window of yours that is gone gets a new one)` }; }
      else made = { ok: false, error: `its new window could not be bound to its session (${execWhy(b)})` };
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
    if (p.host || !isLocalRec(rec)) return { ok: true, passthrough: true, why: 'a browser on another machine' };
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
      const targets = rows ? await tabTargetsOf(o.extraEnv.AGENT_BROWSER_CDP) : null;
      const active = rows ? ((rows.find((x) => x.active) || {}).targetId || null) : null;
      const owners = targets ? TBS.tabOwners({ targets, holders: tabHoldersOf(p.id, active ? { [bk]: String(active).toUpperCase() } : {}) }) : null;
      const own = TBS.ownSetOf(owners, bk);
      keepTabRoots(p.id, bk, own, before);
      return { rows, owners, own, active: active ? String(active).toUpperCase() : null };
    };
    const s0 = await read();
    if (!s0.rows || !s0.owners) { const hung = noteAnswer(rec, p, false, 'a refused tab read') ? unresponsiveOf(rec, p) : null; const code = hung ? 'browser_unresponsive' : 'tabs_unreadable'; log.log?.(`[browser] ${bk} on ${p.id}: its \`tab ${w.act}\` refused ${code} (${s0.rows ? 'the CDP read' : 'its tab list'} did not answer) — nothing ran`); throw namedError(code, TBS.tabRefusalText('tabs_unreadable', { agent: true, ...(hung ? { unresponsive: hung } : {}) })); } // lane browser-unresponsive: a refusal is an ask that did not answer
    const targetId = w.ref ? TBS.resolveTabRef(w.ref, s0.rows) : null;
    const av = TBS.agentTabVerdict({ act: w.act, ref: w.ref, targetId, own: s0.own, current: s0.active });
    if (!av.ok) { log.log?.(`[browser] ${bk} on ${p.id}: its \`tab ${w.act}${w.ref ? ' ' + String(w.ref).slice(0, 40) : ''}\` refused ${av.code} — nothing ran`); throw namedError(av.code, av.error); }
    const out = { ok: true, act: w.act, profileId: p.id };
    if (w.act === 'new') {
      // lane browser-windows (U1): the new tab opens in a WINDOW OF ITS OWN (measured: the binary's `tab new` lands in
      // Chrome's last focused window — often another conversation's, hiding its page); its session is bound there and
      // navigates itself; a label is the lease's (the binary labels only the tabs it creates)
      const made = await openOwnTab(p, bk, { url: w.url || '', ns, opts: o, pin, json: true });
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
    const owners = TBS.tabOwners({ targets, holders: tabHoldersOf(p.id, bk && act ? { [bk]: act } : {}) });
    if (bk) keepTabRoots(p.id, bk, TBS.ownSetOf(owners, bk), before);
    const h = humans.get(p.id);
    const words = {};
    const whose = {};
    for (const [id, k] of owners) { words[id] = TBS.ownerWord(k, { me: bk, humanKey: h ? h.key : null }); if (words[id] === 'other') { const w = whoseOf(p.id, k); if (w) whose[id] = w; } }
    return { ok: true, owners: words, whose, mediated: false, adoptable: target.kind === 'human' && !reg.leases.some((l) => l.profileId === p.id), ...titled(targets) };
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
      const targets = rows ? await tabTargetsOf(opts.extraEnv.AGENT_BROWSER_CDP) : null;
      if (!rows || !targets) throw namedError('tabs_unreadable', TBS.tabRefusalText('tabs_unreadable'));
      if (!tabRowOf(rows, id)) throw namedError('no_such_tab', TBS.tabRefusalText('no_such_tab'));
      const act0 = (rows.find((x) => x.active) || {}).targetId || null;
      const owners = TBS.tabOwners({ targets, holders: tabHoldersOf(p.id, act0 ? { [bk]: String(act0).toUpperCase() } : {}) });
      const h = humans.get(p.id);
      owner = TBS.ownerWord(owners.get(id), { me: bk, humanKey: h ? h.key : null });
      const listed = new Set(rows.map((x) => String(x.targetId).toUpperCase()));
      counts = { agent: [...(TBS.ownSetOf(owners, bk) || [])].filter((x) => listed.has(x)).length, you: h ? [...(TBS.ownSetOf(owners, h.key) || [])].filter((x) => listed.has(x)).length : 0 };
      if (owner === 'you' && h) {
        const v = TBS.userTabVerdict({ act, owner, human: false, counts });
        if (!v.ok) refuse(v, 'his own tab from a conversation\'s view');
        return closeHumanTab(h, id);
      }
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
          const targets = await tabTargetsOf(opts.extraEnv.AGENT_BROWSER_CDP);
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
      try { if (B.isLiveBrowser(reg.browsers[profileId])) await stop(profileId, { why }); } catch (e) { log.warn?.(`[browser] ephemeral ${profileId}: stop failed — ${e && e.message}`); }
      if (reg.leases.some((l) => l.profileId === profileId)) return { removed: false, kept: true, why: 'its conversation is carried again' };
      if (B.isLiveBrowser(reg.browsers[profileId])) { log.warn?.(`[browser] ephemeral ${profileId} "${p.label}": its browser would not stop — the record is kept for the next pass`); return { removed: false, why: 'still running' }; }
      try { removeProfile(profileId); } catch (e) { log.warn?.(`[browser] ephemeral ${profileId}: not removed — ${e && e.message}`); return { removed: false, why: String(e && e.message) }; }
      return { removed: true };
    })();
    retiring.set(profileId, pr);
    return pr.finally(() => { if (retiring.get(profileId) === pr) retiring.delete(profileId); });
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
    const intId = p.host ? null : SW.integrationIdFor(p.provider);
    let key = null, vendorEnv = {};
    if (intId) {
      key = keysOf().keyFor(intId);
      // lane-cloak: a row whose key is OPTIONAL (cloak — measured: the free build needs none) starts without one
      if ((!key || key.source === 'none') && keyRequired(intId)) throw namedError('backend_no_key', `${p.provider} needs a key and none is configured for ${intId}${key && key.why ? ' (' + key.why + ')' : ''} — open ⚙ → Integrations → ${intId} and paste yours, or use the cluster default there`, { provider: p.provider, integrationId: intId, action: { openIntegration: intId, label: 'open Integrations' } });
      vendorEnv = key && key.source !== 'none' ? SW.vendorEnvFor(p.provider, key.values) : {};
    }
    let argvPrefix = [];
    // lane-cloak (measured on 0.38.1): cloak's executable + arguments ride agent-browser's own ENV names, carried by
    // EVERY call of the keeper's session (`rec.launchEnv`) — as argv they rode `open` only, and the keeper's own
    // `get cdp-url` right after it relaunched the browser without them (measured; without --no-sandbox it then died)
    let providerEnv = {};
    // lane dc-browser-providers: THE ROW's launch shape (src/browser-profiles.js PROVIDERS) — never the provider's id
    const prow = B.providerRow(p.provider) || {};
    // lane browser-admin 2a: a profile pinned to one Chrome build (a `buildChoice` row) — judged NOW (a build gone since it
    // was chosen is refused by name before any record exists); its executable rides the launch view of EVERY call, as cloak's does
    const buildEnv = !p.host ? launchBuildOf(p) : {};
    if (!p.host && prow.buildChoice && buildEnv.executablePath) providerEnv = SW.launchEnvFor(p.provider, { executablePath: buildEnv.executablePath });
    if (!p.host && prow.executable === 'installed') {
      const exe = cloakExecutable();
      if (!exe.ok) throw namedError('backend_unavailable', exe.error, { provider: p.provider, missing: prow.binary });
      providerEnv = SW.launchEnvFor(p.provider, { seed: p.fingerprintSeed, executablePath: exe.path, proxy: prow.egressProxy ? await cloakEgressUrl(p.id) : '' });
    } else if (!p.host) argvPrefix = SW.launchArgsFor(p.provider);
    const p0 = (async () => {
      const ns = nsOf(profileId);
      const prevRec = reg.browsers[profileId] || null; // r2 M1: the browser the last launch recorded (its lock holder, if orphaned)
      const rec = { profileId, ns, pid: null, starttime: null, socketDir: null, cdpUrl: null, state: 'starting', startedAt: now(), endedAt: null, lastError: null, stoppedBy: null, lastLeaseDroppedAt: null, startedBy: why,
        // P4: WHERE the process is (a paired machine) / that there is no
        // process of ours at all (an external browser over CDP), the hub-side
        // forward of its loopback port, and the machine's own url + dir
        hostId: p.host || null, external: !(B.providerRow(p.provider) || {}).starts, forward: null, remoteCdpUrl: null, dir: null,
        // lane browser-propose (step 1): a chromium launch on THIS machine stops announcing automation (stamped before the
        // display fact reads the base file; a cloak launch carries its own build's patches — never stamped)
        automationFlag: automationFlagOn() && !p.host && !!prow.automationFlag };
      // r5 LOW 3: the LAUNCH-MARK lineage rides every new record (a refused start too) — a profile once launched with the
      // mark never falls back to the pre-mark rule, whatever record comes next (set again at the launch below)
      if (prevRec && prevRec.mark) rec.mark = prevRec.mark;
      // lane profile-lock-roll (L1): the LAUNCH-HOST lineage rides every new record too (a refused start keeps the witness;
      // this machine's name is added only at the launch below)
      { const lh = launchHostsFor(prevRec, p.dir || null); if (lh.length) { rec.hosts = lh; rec.host = prevRec && prevRec.host ? prevRec.host : lh[lh.length - 1]; } }
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
        if (remoteChoice && remoteChoice.kind !== 'default') {
          const bl = await buildsFor(p.host);
          if (!bl || bl.ok === false) throw failed((bl && bl.code) || 'builds_unsupported', `${p.host}: ${(bl && bl.error) || 'its Chrome builds could not be listed'}`);
        }
        try { r = await acc().call(p.host, 'start', { profileId, idleMs: 0, headed: headedSetting(), noDisplayMode: noDisplayMode(), ...(remoteChoice && remoteChoice.kind !== 'default' ? { browser: remoteChoice } : {}) }); } catch (e) { throw Object.assign(failed(e.code || 'launch_failed', `${p.host}: ${e.message}`), e && e.step ? { step: { ...e.step, machine: p.host } } : {}); } // lane remote-profile-start: the machine's one step rides the refusal (+ which machine)
        if (!r.cdpPort) throw failed('launch_failed', `${p.host} started the browser but reported no CDP url — the hub cannot reach it`);
        let fwd;
        try { fwd = await acc().forwardCdp(p.host, r.cdpPort, { remoteUrl: r.cdpUrl }); } catch (e) { throw failed(e.code || 'host_unavailable', `${p.host}: ${e.message}`); }
        rec.pid = r.pid; rec.starttime = r.starttime; rec.socketDir = r.socketDir; rec.dir = r.dir || null; rec.remoteCdpUrl = r.cdpUrl; rec.cdpUrl = fwd.url; rec.forward = { remotePort: r.cdpPort, localPort: fwd.localPort };
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
      // lane headless-fallback: THE DISPLAY IS A FACT — probed now, here (the launch's view carries the plan: HEADED and the
      // planned config every call of this record names); the fact rides the record
      rec.display = await displays.factFor({ baseFile: machineConfigFile('machine', p.id), headedEnv: headed0, prev: prevRec && prevRec.display, mode: noDisplayMode(), preference: headed0 }); // H5: an unset preference resolved against this probe
      if (rec.display.fallback && headed0 !== null) headed0 = rec.display.headed;
      sayDisplay(rec.display, `${profileId} "${p.label}"`);
      const launchEnv = { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0', ...(headed0 === true ? { AGENT_BROWSER_HEADED: '1' } : headed0 === false ? { AGENT_BROWSER_HEADED: '0' } : {}), ...providerEnv };
      rec.launchEnv = launchEnv;
      // VERIFY r2 M1: BEFORE EVERY LAUNCH ON THE DIRECTORY — a dead daemon's browser is ended first (in flight: waited),
      // then the lock's holder judged: the keeper's own orphan ended, anything else refused `profile_locked` by name
      if (reaping.has(profileId)) { try { await reaping.get(profileId); } catch { /* its own log */ } }
      const lk = await clearProfileLock(p, ns, prevRec);
      if (!lk.ok) { const e = failed(lk.code, lk.error); e.holderPid = lk.holderPid; throw e; }
      stampLaunchHost(rec, prevRec, p.dir || null); // lane profile-lock-roll (L1): THIS machine's name on the record — the witness the next pod reads
      rec.mark = p.id; // r4 (MAJOR 2): the launch carries this profile's MARK (machine-<id>.json); every later keeper call keeps that file
      rec.holdDialogs = true; // lane browser-stuck: …and holds page dialogs (noAutoDialog) from this launch on
      rec.launchFlags = !!prow.launchFlags && (argvPrefix.length > 0 || Object.keys(providerEnv).length > 0); // r4: a provider's own launch flags (cloak: its env pair; the row's `launchFlags`) — a heal never relaunches it. lane browser-admin 2a: a chromium build pin is NOT one — the heal's `get cdp-url` carries rec.launchEnv (the executable included), so it relaunches the SAME build
      rec.browserChoice = p.browser ? BB.choiceView(p.browser) : { kind: 'default' }; // what this launch was asked to run (the running build is `cdpBrowser`, the browser's own answer)
      const stamp0 = F.dirLaunchStamp(p.dir); // r5 MAJOR 1 (iii): the directory before this launch
      rec.cli = await cliNow(); // verify r2 (H1): the CLI this launch runs — every later call of this browser runs that version
      const r = await rt.launch(ns, { dir: p.dir, idleMs: 0, headed: headed0, extraEnv: { ...vendorEnv, ...providerEnv, ...rec.display.env }, argvPrefix });   // the .197 integration: lane-cloak's provider pair + the display fact's env (last: DISPLAY / XAUTHORITY are the machine's)
      if (!r.ok) {
        const text = (r.stderr || r.error || r.stdout || '').trim().slice(0, 300);
        // verify r2 (F1): the directory may have been taken between the verdict and this launch — the holder said by name
        const lr = lockRefusalAfterLaunch(p, prevRec);
        if (lr) { rec.state = 'failed'; rec.endedAt = now(); rec.lastError = lr.error; commit(); log.warn?.(`[browser] ${profileId} "${p.label}": NOT started — ${lr.tookOver ? `a lock of this machine's previous name ${lr.tookOver} reached the launch (taken over now)` : 'the directory was taken while launching'}: ${lr.error}`); throw namedError(lr.code, lr.error, lr.holderPid ? { holderPid: lr.holderPid } : {}); }
        // a key-bearing launch that fails on licence/concurrency is the THIRD
        // named refusal (§7.4, round 8 #3) — under a cluster default it says
        // the seats are shared fleet-wide and offers the one click out
        const cls = intId ? SW.classifyLaunchFailure({ provider: p.provider, text, source: key ? key.source : 'none', integrationId: intId }) : { code: 'launch_failed', error: `the browser did not start: ${text}`, action: null };
        rec.state = 'failed'; rec.endedAt = now(); rec.lastError = cls.error;
        commit();
        throw namedError(cls.code, cls.error, { provider: p.provider, action: cls.action || null });
      }
      const info = await rt.info(ns, { dir: p.dir });
      rec.pid = info.pid; rec.starttime = await launchStart(info.pid); rec.socketDir = info.socketDir;
      if (info.pid && rec.starttime == null && F.startsReadable()) { rec.state = 'failed'; rec.endedAt = now(); rec.lastError = unrecordedLaunch(info.pid); commit(); throw namedError('launch_failed', rec.lastError); }
      if (!rec.cli || (info.version && info.version !== rec.cli.version)) rec.cli = cliOfDaemon(info) || rec.cli || null; // verify r2 (H1): the daemon's own answer decides
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
      rec.state = 'ready';
      if (mediator) mediator.repoint(profileId, rec.cdpUrl); // P6: a restarted browser ⇒ live mediated connections close 1012, the SAME url reconnects
      p.lastUsedAt = now(); p.lastBackend = p.provider;
      // §7.4 (round 8 #2): the seat TIER is read back from the FIRST REAL
      // LAUNCH of this key — a by-product of a launch the user asked for,
      // never a poll; nothing recognisable ⇒ the reading stays unknown
      if (intId === 'cloak' && key) { const t = SW.tierFromLaunch(`${r.stdout || ''}\n${r.stderr || ''}`); if (t) reg.seats[intId] = { ...t, at: now(), source: key.source, clusterKey: key.clusterKey || null }; }
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
    try { return await p0; } finally { if (starting.get(profileId) === p0) starting.delete(profileId); }
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
    if (mediator) mediator.repoint(profileId, rec.cdpUrl); // P6: the mediated leases follow the url too
    commit();
    return rec.cdpUrl;
  }
  const noCdpError = (p) => `"${p ? p.label : 'this profile'}"'s browser answered no CDP url — a command cannot join it without starting a second browser on the same profile directory (Chrome refuses that); stop it from the Browser panel and run the command again`;
  /** The options of ONE CLI call under a lease's own session: `{ session, extraEnv: { AGENT_BROWSER_CDP } }` —
   *  never a `dir`. null when the browser has no CDP url (the caller refuses `browser_no_cdp`). */
  async function leaseCliOpts(profileId, browserKey) {
    const url = await leaseCdpUrl(profileId);
    // the lease session's OWN launch view = what its CLI child runs with (attachedEnvFor: the CDP url + idle 0) —
    // a keeper call with another view would restart that daemon and lose the agent's pinned tab (measured on 0.38.1)
    return url ? { session: B.sessionNameFor(String(browserKey || '')), extraEnv: { AGENT_BROWSER_CDP: url, AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' } } : null;
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
        if (!rec.external) { try { const r = await acc().call(rec.hostId, 'stop', { profileId }); if (r.left) left = `${rec.hostId}: ${r.left}`; } catch (e) { left = `${rec.hostId} could not be asked to stop it (${e.message}) — the browser may still run there`; } }
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
      else await rt.closeAll(rec.ns, { dir: p ? p.dir : null, extraEnv: rec.launchEnv || { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' } }); // naive study 2: the launch's own view
      let left = null;
      const until = now() + STOP_GRACE_MS;
      while (now() < until && rec.pid && F.pidAlive(rec.pid)) await sleep(100);
      if (rec.pid && F.pidAlive(rec.pid)) {
        const v = pidVerdictOf(rec);
        if (v === 'ours') {
          recaptureBrowser(rec, 'the stop'); // verify r3: again, right before our own signal
          try { process.kill(rec.pid, 'SIGTERM'); } catch { /* gone */ }
          const t2 = now() + 1500;
          while (now() < t2 && F.pidAlive(rec.pid)) await sleep(100);
          if (F.pidAlive(rec.pid)) { try { process.kill(rec.pid, 'SIGKILL'); } catch { /* gone */ } await sleep(200); }
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
    const r = await openOwnTab(p, browserKey, { ns: nsOf(p.id), opts: o, pin: pinTab ? ['--pin-tab'] : [], fallback: false });
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
    const lostWhy = reg.tabClosed[k] ? (reg.tabLostWhy && reg.tabLostWhy[k] === 'closed' ? 'closed' : 'life') : stale ? 'life' : null;
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
    const p = profileId ? profile(profileId) : profileByRef(ref);
    if (!p) throw namedError('not-found', `no profile ${profileId || ref}`);
    if (p.ambiguous) throw namedError('ambiguous', `"${ref}" names ${p.ambiguous.length} profiles (${p.ambiguous.join(', ')}) — use the id`);
    if (isEph(p)) throw namedError('not_attachable', `"${p.label}" is a conversation's managed ephemeral browser — a bare \`vibespace-browser <verb>\` of that conversation lands on it; it is never attached by id`);
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
    const d = B.decideAttach({ profile: p, leases: reg.leases, browserKey, sessionId, now: now(), taskIds: facts.ids, groupsUnreadable: facts.unreadable });
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
    // ws-create's floor notice probes ITS OWN. Probe once (cached per TTL,
    // including the negative answer); a probe that cannot run leaves the
    // answer 'unknown' and pinTab false, never a throw out of an attach.
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
      const why = reg.tabLostWhy && reg.tabLostWhy[`${p.id}|${browserKey}`] === 'life' ? 'life' : 'closed';
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
        const pick = o ? TBS.rebindPick({ targets: await tabTargetsOf(o.extraEnv.AGENT_BROWSER_CDP), holders: tabHoldersOf(p.id), key: browserKey }) : null;
        let r = o && pick ? await rt.exec(nsOf(p.id), [...pin, 'tab', pick.targetId, '--json'], o) : null;
        let how = r && r.ok ? 'switched' : null;
        if (!how) { r = o ? await rt.exec(nsOf(p.id), [...pin, 'tab', 'new'], o) : null; how = r && r.ok ? 'new' : null; }
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
      const g = await mediator.grantFor({ profileId: p.id, browserKey, upstream: rec.cdpUrl, targetIds: d.lease.targetId ? [d.lease.targetId] : [], paused: () => inputStateFor(browserKey, p.id).input === 'user' });
      // verify r1 (H3): a mediated conversation whose tab went with a stopped browser (Quit the whole browser, the row's
      // Stop) binds a NEW tab before its first command — under ITS session in ITS namespace over ITS scoped url (the same
      // env its CLI runs with, so its daemon is not restarted), so the tab is created through the grant and is its own
      if (reg.tabClosed[`${p.id}|${browserKey}`] && g && g.url) {
        const why = reg.tabLostWhy && reg.tabLostWhy[`${p.id}|${browserKey}`] === 'life' ? 'life' : 'closed';
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
    return { lease: leaseView(d.lease), created: d.created, resumed: d.resumed, others: d.others, profile: pview(p), browser, mediated: false, env: B.attachedEnvFor({ browserKey, profileId: p.id, cdpUrl: leaseCdp }), cdpUrl: rec ? rec.cdpUrl : null, pinTab, ...(added ? { added } : {}), ...(noteOut ? { rebound: noteOut } : {}) };
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
  function humanKeepOf(h) { return HM.keepFor({ launched: !!(h && h.launched), keepMs: HM.humanKeepMs(setting(HM.HUMAN_KEEP_SETTING, HM.DEFAULT_HUMAN_KEEP_MS)), joinKeepMs: takeoverIdleMs() }); }
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
        const made = await openOwnTab(p, v.key, { ns: nsOf(p.id), opts: o, pin: pinTab ? ['--pin-tab'] : [] });
        const r = { ok: !!made.ok, json: made.ok && made.targetId ? { data: { targetId: made.targetId } } : made.json || null, error: made.error || null };
        if (!(r && r.ok)) {
          const why = String((r && (r.stderr || r.error)) || 'no answer').trim().slice(0, 200);
          log.warn?.(`[browser] ${p.id} "${p.label}": your own tab could not be opened — ${why}`);
          throw namedError('launch_failed', `"${p.label}"'s browser is running, but your own tab in it could not be opened: ${why}`);
        }
        h = { key: v.key, profileId: p.id, since: now(), state: 'away', awaySince: now(), launched, input: T.newInputState(), ownTab: tabIdOf(r.json), fresh: null, freshUsed: false };
        humans.set(p.id, h);
        log.log?.(`[browser] ${p.id} "${p.label}": the user browses it himself (${v.key}, ${launched ? 'he launched the browser — kept ' + Math.round(humanKeepOf(h) / 3600000) + ' h while away' : 'joined the running browser — kept ' + Math.round(humanKeepOf(h) / 60000) + ' min while away'}; his own tab ${h.ownTab || '(unnamed)'}; ${reg.leases.filter((l) => l.profileId === p.id).length} conversation(s) on it keep working)`);
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
    if (v && paintWatch) { const er = profileId ? null : ephemeralFor(browserKey); const pid = profileId || (er && er.profileId); if (pid) Promise.resolve().then(() => paintWatch.thawPaint(pid, { holder: { profileId: pid, browserKey, ephemeral: !profileId } })).catch(() => { /* the next verb thaws */ }); }
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
    const enabled = setting('browser.idlePaintFreeze', false) === true; // lane browser-swiftshader-cpu-r2: the owner's switch, read at EVERY sweep (off by default)
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
      } catch (e) { log.warn?.(`[browser] ${rec.profileId}: idle paint ${v.act} failed: ${e && e.message}`); }
    }
  }
  function idleReleaseAfterMs() { return B.idleReleaseMs(setting('browser.idleReleaseAfterTurnMs', B.DEFAULT_IDLE_RELEASE_MS)); }
  /** The tick's release arm: every LIVE managed ephemeral / helper browser whose conversation's turn has been idle ≥ the setting.
   *  → the releases THIS sweep started, `[{profileId, why, settled}]` (`settled` = its stop, never rejecting): the tick
   *  ignores it; a gate samples past every one of them (the 2.369.187 mirror red — a sample at the FIRST stop observed
   *  read the helper's release, still in flight, as "kept"). */
  function sweepIdleReleases(t) {
    const releaseMs = idleReleaseAfterMs();
    const released = [];
    for (const p of reg.profiles.filter(isEph)) {
      const rec = reg.browsers[p.id];
      const live0 = B.isLiveBrowser(rec) && !stopping.has(p.id) && !starting.has(p.id) && !retiring.has(p.id);
      if (!live0) { turnIdleSince.delete(p.id); continue; }
      const f = convFacts(p.owner.id);
      const v = B.idleReleaseVerdict({ live: true, turn: f.turn === undefined ? null : f.turn, idleSince: turnIdleSince.has(p.id) ? turnIdleSince.get(p.id) : null, now: t, releaseMs,
        takenOver: inputStateFor(p.owner.id, null).input === 'user', watched: (watchers.get(inputKey(p.owner.id, null)) || 0) > 0 });
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
  function takeoverIdleMs() { return T.takeoverIdleMs(setting('browser.takeoverIdleMs', T.DEFAULT_TAKEOVER_IDLE_MS)); }
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
  function emitInput(ev) { for (const fn of inputListeners) { try { fn(ev); } catch (e) { log.warn?.(`[browser] input listener failed: ${e && e.message}`); } } }
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
  function handback({ browserKey, profileId = null, viewerId = null, cause = 'explicit', url = '', sessionId = null, mirror = true, sibling = null, expectWakes } = {}) {
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
    if (mirror && profileId && held) for (const sib of siblingsHeldBy(browserKey, profileId, held.viewerId)) handback({ browserKey: sib.lease.browserKey, profileId, viewerId, cause: d.cause, url: '', sessionId: sib.lease.sessionId || null, mirror: false, sibling: browserKey });
    mirrorLeaseInput(browserKey, profileId, 'agent');
    // the handback CLOSES the cycle: ONE re-run reminder per takeover → handback (the owner's ruling: "交还时提醒它重新运行")
    const closed = INT.closeInterruption(cycles.get(k) || null, { at: d.state.handedBackAt });
    cycles.delete(k);
    if (closed) lastClosed.set(k, closed);
    const rerun = INT.interruptedVerbs(closed);
    const userActs = closed && Array.isArray(closed.userActs) ? closed.userActs.slice() : []; // lane browser-resume C: the user's tab acts while he drove
    log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ' (ephemeral)'}: handed back to the agent (${d.cause}${d.byHolder ? '' : ', not by the holder'}) after ${Math.round(d.heldMs / 1000)} s${d.state.url ? ' at ' + T.urlForLog(d.state.url) : ''}${rerun.length ? ` — to re-run: ${rerun.join(', ')}` : ''}${userActs.length ? ` — the user's tab acts while driving (said to the agent): ${userActs.map((a) => a.kind).join(', ')}` : ''}`); // lane live-input: origin + path in the journal — never the query (order ids, tokens)
    emitInput({ kind: 'handback', browserKey, profileId: profileId || null, sessionId, state: { ...d.state }, cause: d.cause, url: d.state.url || '', heldMs: d.heldMs, byHolder: d.byHolder, rerun, ...(userActs.length ? { userActs } : {}), interruption: INT.interruptionView(closed), ...(sibling ? { sibling } : {}), sharedWindow: sharedWindowOf(browserKey, profileId) }); // verify r2 ⑦
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
    const k = inputKey(browserKey, profileId);
    const s = inputs.get(k);
    if (!s) return;
    if (s.input === 'user') handback({ browserKey, profileId, cause: 'detach', url: s.url || '' });
    inputs.delete(k);
    cycles.delete(k);
    lastClosed.delete(k);
    pending.delete(k);
  }

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
      cap: { own: ownLive(browserKey), cap: cap.cap, origin: cap.origin, explicit: capOf(browserKey), machine: { used: Object.values(reg.browsers).filter(B.isLiveBrowser).length + othersNow().length, cap: machineCap() } } };
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
      if (paused) { log.log?.(`[browser] ${bk}: refused with browser_paused (the user drives${v.kind === 'attachment' ? ' ' + v.attachment.profileId : ' the ephemeral browser'})`); return paused; }
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
    ensureLoaded();
    if (!B.isBrowserKey(browserKey)) throw namedError('bad-request', 'a child handle needs its parent\'s browser key');
    const n = B.nextChildN(reg.children, browserKey);
    if (n > 999) throw namedError('cap', 'this conversation has minted 999 child handles — detach some');
    const handle = B.childHandleFor(browserKey, n);
    reg.children[handle] = { parent: browserKey, since: now(), sessionId: sessionId || null, carrierLostAt: null };
    commit();
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
  function adoptScratch({ label, scratchDir, owner = null, createdBy = null, use = null, knownKeys = null } = {}) {
    ensureLoaded();
    const v = B.validateProfileInput({ label }, { existing: named() });
    if (!v.ok) throw namedError(v.code, v.error);
    if (use != null) owner = ownerFromUse(use, { knownKeys, label: v.value.label }); // lane browser-admin: judged before the directory moves
    let st = null;
    try { st = fs.statSync(scratchDir); } catch { /* below */ }
    if (!st || !st.isDirectory()) throw namedError('adopt_failed', `this session's browser directory ${scratchDir} does not exist — nothing to adopt (the browser never launched, or it is on the ephemeral rung)`);
    const id = mintId();
    const target = path.join(homeDir, '.agent-browser', B.profileDirName(id));
    try { fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); fs.renameSync(scratchDir, target); }
    catch (e) { throw namedError('adopt_failed', `could not move ${scratchDir} to ${target}: ${e.message}${e.code === 'EXDEV' ? ' (different filesystems — create a new profile and log in again instead)' : ''}`); }
    try { fs.chmodSync(target, 0o700); } catch { /* best effort */ }
    const rec = B.newProfileRecord({ id, ...v.value, dir: target, owner, legacy: false, now: now(), createdBy });
    reg.profiles.push(rec);
    commit();
    log.log?.(`[browser] profile ${id} "${rec.label}" ADOPTED from ${scratchDir} → ${target} (usable by ${whoWords(rec)}${rec.createdBy ? ', created by ' + rec.createdBy : ''})`);
    return B.publicProfileView(rec);
  }

  // ── P4 second half (§7.4): the live backend switch, the agent's `blocked` claim, per-site memory ──
  /** The CloakBrowser BROWSER this machine has: the setting first (an explicit path to a chrome file), else the
   *  MEASURED build this keeper installed — `{ok, path}` or `{ok:false, error}` naming what is missing (never a
   *  download: installing it is the user's act). lane-cloak (measured 2026-09-28): the `cloakbrowser` command a
   *  package puts on PATH is the vendor's MANAGEMENT CLI (install / info / login …), not a browser, so PATH is not
   *  asked; and the installed build counts only once the install's own check passed (its stamp names the Chromium
   *  and the SHA-256 the §7.2.1 record describes). */
  const usableExe = (f) => { try { fs.accessSync(f, fs.constants.X_OK); return fs.statSync(f).isFile(); } catch { return false; } };
  const whichOnPath = (name) => { for (const d of String(env().PATH || process.env.PATH || '').split(':')) { if (!d) continue; const f = path.join(d, name); if (usableExe(f)) return f; } return null; };
  function cloakExecutable() {
    const cfg = String(setting('browser.cloak.executablePath', '') || '').trim();
    if (cfg) return usableExe(cfg) ? { ok: true, path: cfg } : { ok: false, error: `CloakBrowser is not runnable at the configured path ${cfg} (browser.cloak.executablePath) — point it at the browser's chrome file, or clear it to use the one installed from Manage agents` };
    const mine = installedCloakBin();
    if (mine && usableExe(mine) && installedStamp().ok) return { ok: true, path: mine };
    return { ok: false, error: 'CloakBrowser is not installed on this machine (browser.cloak.executablePath is empty and the measured build is not installed under data/browser-tools) — install it from Manage agents; nothing is downloaded by asking' };
  }
  // ── §7.2.1 THE ENFORCED BOUNDARY of a running cloak browser (lane-cloak) ──
  // ONE allowlisting proxy PER CLOAK PROFILE (verify r1 V1 of lane browser-propose: a refusal must reach the agent whose
  // browser was refused — and only it; one shared proxy could not say whose request it refused), started lazily at the
  // profile's first cloak start and kept for the keeper's life (a stable url = one launch view): its allowlist is re-read
  // per request = the record's RUN hosts (measured: none — the browser itself needs no site) + the sites this deployment
  // names (`browser.cloak.egressAllowlist`); the browser gets `--proxy-server` + `<-loopback>` (browser-switch
  // launchEnvFor). Everything else the record names — the download hosts, the vendor's update / licence hosts — is refused.
  const EgressProxy = require('./egress-proxy');
  const cloakProxies = new Map(); // profile id → its egress proxy
  const cloakSites = () => String(setting('browser.cloak.egressAllowlist', '') || '');
  const cloakRunList = () => B.cloakRunAllowlist(proofOf(), cloakSites());
  async function cloakEgressUrl(profileId = null) {
    const k0 = String(profileId || '');
    const have = cloakProxies.get(k0);
    if (have && have.port()) return have.url();
    const px = EgressProxy.create({ allowlist: cloakRunList, log, ...(egressResolve ? { resolve: egressResolve } : {}) });
    try { await px.listen(); } catch (e) { throw namedError('egress_proxy_missing', `the allowlisting egress proxy for CloakBrowser could not listen (${e && e.message}) — CloakBrowser is never started without it`, { provider: 'cloak' }); }
    const raced = cloakProxies.get(k0); // two starts of one profile raced the listen: the first proxy stays the one
    if (raced && raced.port()) { px.close().catch(() => {}); return raced.url(); }
    cloakProxies.set(k0, px);
    log.log?.(`[browser] cloak egress proxy for ${k0 || '?'} on ${px.url()} — admits: ${cloakRunList().join(', ') || 'nothing (no sites named in browser.cloak.egressAllowlist)'}`);
    return px.url();
  }
  /** What a cloak browser may reach right now and what was refused (the dialog / the proof read it; no secrets) — one
   *  profile's proxy when named, else all of them (the url of the most recently started one). */
  function cloakEgress(profileId = null) {
    const pxs = profileId != null ? [cloakProxies.get(String(profileId))].filter(Boolean) : [...cloakProxies.values()];
    const live = pxs.filter((px) => px.port());
    const stats = live.length ? live.reduce((a, px) => ({ allowed: a.allowed + px.stats.allowed, refused: a.refused + px.stats.refused, errors: a.errors + px.stats.errors }), { allowed: 0, refused: 0, errors: 0 }) : null;
    const recent = live.flatMap((px) => px.recent()).sort((a, b) => a.at - b.at).slice(-20);
    return { url: live.length ? live[live.length - 1].url() : null, allowlist: cloakRunList(), sites: B.parseEgressAllowlist(cloakSites()), stats, recent };
  }
  /** verify r1 V1: the hosts THIS profile's CloakBrowser was refused at or after `since` (a verb's start) — by name,
   *  deduplicated, bounded; what the agent's verb answer carries so it can ask for exactly those sites. */
  function cloakRefusals(profileId, since = 0) {
    const px = cloakProxies.get(String(profileId || ''));
    if (!px || !px.port()) return [];
    const out = [];
    for (const r of px.recent()) if ((Number(r.at) || 0) >= (Number(since) || 0) && r.host && !out.includes(r.host)) out.push(r.host);
    return out.slice(0, 8);
  }
  const installDir = path.join(dataDir, 'browser-tools');
  const proofOf = () => (providers && providers.proof) || B.CLOAK_EGRESS_PROOF;
  const hereTag = () => SW.platformTag(process.platform, process.arch);
  // ── §7.4 failure form (1): THE INSTALL SLOT — one install at a time (CloakBrowser's, the browser CLI's, a Chrome build's) ──
  // rv-browser F7 (lane dc-browser-installs): the slot is src/server/browser-installs.js and each installable is a row its
  // own file declares (browser-cloak-install.js, browser-cli-install.js, browser-builds-keeper.js — one INSTALLERS line
  // each); this keeper hands them what they read (its later consts and its reassigned lets at call time) and names no kind.
  const installs = BI.create({ dataDir, installDir, installTimeoutMs, cloakExecutable, egressResolve, env, hereTag, log, namedError, notify, now, proofOf, usableExe, whichOnPath, writeJsonAtomic, bf, bfPath, cliFolderOf, cliPin, installedCliOf, runningClis, browsing, buildsFor, buildsHere, chromeBuildsResolve, commit, ensureLoaded, healing, homeDir, humans, isEph, isLocalRec, isMediated, keptDirFor, keptStore, mediator, named, profile, pview, readDirMajor, reopenLeaseTabs, start, stop, stopping, switching, userTodos,
    get cliPrefix() { return cliPrefix; }, get cliWitnessOf() { return cliWitnessOf; }, get isMusl() { return isMusl; }, get inputsView() { return inputsView; },
    get reg() { return reg; }, get dirty() { return dirty; }, set dirty(v) { dirty = v; }, get inFlightReader() { return inFlightReader; },
    get cliGen() { return cliGen; }, set cliGen(v) { cliGen = v; }, get cliMemo() { return cliMemo; }, set cliMemo(v) { cliMemo = v; } });
  const { installVerdict, installedCloakBin, installedStamp, fallBackFromChange, announceRelaunch } = installs.api; // what this keeper still asks (the switch, rung 3, the heal)
  // ── lane browser-admin 2b: THE BROWSER CLI VERSION VIBESPACE DRIVES (`browser.cli`: path | pinned | x.y.z) ──
  // Installed with THE install slot above (one install at a time, cloak's or this one): `npm install --prefix
  // <data>/browser-tools/agent-browser-<v> --no-save --ignore-scripts agent-browser@<v>` — the registry only (the package's
  // postinstall, which fetches a binary from GitHub when the tarball lacks one, never runs). The npm child is DETACHED and
  // named in a marker file, so a server restart RE-ATTACHES to it (never a second install) and verifies its result. The pin
  // is the keeper's in-memory answer (`cliPin`), mirrored to `cli-pin.json` for the agent's CLI (data/bin/vibespace-browser
  // reads it beside itself — a remote machine has none, so PATH answers there).
  const cliPinFile = () => path.join(dataDir, 'browser-tools', 'cli-pin.json');
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
  /** THE PIN: `{mode: path|pinned|version, version, path|null, installed, why, invalid}` — recomputed when the setting moves or
   *  an install ends (never per command), mirrored to cli-pin.json on a change. */
  function cliPin() {
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
  const cliVersions = new Map(); // path → {id, version} — `--version` of ONE binary file, asked again only when the file changed
  function cliVersionAt(p) {
    const id = cliIdOf(p);
    if (!id) return Promise.resolve(null);
    const m = cliVersions.get(p);
    if (m && m.id === id) return Promise.resolve(m.version);
    return new Promise((resolve) => {
      try {
        require('child_process').execFile(p, ['--version'], { timeout: 8000, encoding: 'utf8', env: F.sanitizeProbeEnv({ ...(env() || {}), PATH: (env() || {}).PATH || process.env.PATH || '' }) }, (er, so, se) => {
          const v = F.versionFromProbe({ err: er, stdout: so, stderr: se }) || null; // verify r1 ⑦ + r2 ⑥: ONE probe table (browser-facts.versionFromProbe) — a crash names no version, a version on stdout counts whatever the exit
          if (v) cliVersions.set(p, { id, version: v });
          resolve(v);
        });
      } catch { resolve(null); }
    });
  }
  /** The version a binary said (no fork) — null when it was never asked or the file changed since. */
  const knownVersionAt = (p) => { const m = p ? cliVersions.get(p) : null; return m && m.id === cliIdOf(p) ? m.version : null; };
  /** THE CLI A LAUNCH RUNS NOW (the pin, else PATH) — stamped on the record before the launch. null = not knowable here (a
   *  fake runtime's bare name, a binary that would not say its version): the browser then follows the current CLI. */
  async function cliNow() {
    const p = typeof bf.binPath === 'function' ? bf.binPath() : null;
    if (!p || !String(p).startsWith('/')) return null;
    const v = await cliVersionAt(p);
    return v ? { version: v, path: p, id: cliIdOf(p), at: now() } : null;
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
  /** The binary ONE call of `rec`'s browser runs → `{path}` | `{gone: words}` | null (no record / no stamp / not local: the
   *  current CLI, as before). Same version only: the launch's own file, the current CLI, VibeSpace's verified install of
   *  that version, PATH's — never a binary of another version. */
  function cliJudge(rec) {
    const c = rec && rec.cli;
    if (!c || !c.version || !isLocalRec(rec)) return null;
    // the launch's own file while its identity holds — the answer on every call but the rare one (a stat or two, no read)
    if (c.path && usableExe(c.path) && (!c.id || cliIdOf(c.path) === c.id)) return { path: c.path };
    const cands = [];
    const cur = typeof bf.binPath === 'function' ? bf.binPath() : null;
    if (cur) cands.push({ path: cur, version: knownVersionAt(cur), how: 'current' });
    try { const i = installedCliOf(c.version); if (i.ok) cands.push({ path: i.path, version: c.version, how: 'installed' }); } catch { /* not a version */ }
    const onPath = typeof bfPath.binPath === 'function' ? bfPath.binPath() : null;
    if (onPath && onPath !== cur) cands.push({ path: onPath, version: knownVersionAt(onPath), how: 'path' });
    const v = VERBS.cliForBrowser({ want: c.version, candidates: cands, current: cur ? knownVersionAt(cur) : null });
    if (v.ok) return v.path ? { path: v.path } : null;
    // verify r3 (Y1): a candidate never asked its version (a keeper fresh from a restart; a binary replaced in place — an
    // `npm i -g` over PATH's, the SAME version put back) is not "gone": the answer is NOT KNOWN YET
    const unknown = cands.filter((x) => x.version == null && x.path).map((x) => x.path);
    return unknown.length ? { unknown, gone: v.error } : { gone: v.error };
  }
  /** The sync answer (the row, a view): an unproven binary is asked now and this reading says "gone" until it has said its
   *  version — every DOOR that runs a command or refuses an agent waits for it instead (`cliOptReady`). */
  function cliOptOf(rec) {
    const j = cliJudge(rec);
    if (j && j.unknown) { for (const x of j.unknown) cliVersionAt(x).catch(() => null); return { gone: j.gone }; }
    return j;
  }
  /** verify r3 (Y1): THE DOORS' answer — a candidate of an unproven version is ASKED (`--version`, once per file identity)
   *  before the browser is judged; asked and silent ⇒ unproven ⇒ refused by name. Reproduced before: the same 0.38.1
   *  re-installed at the same path ⇒ the next command refused "no longer installed here" with a remedy that loses the tabs. */
  async function cliOptReady(rec) {
    const j = cliJudge(rec);
    if (!(j && j.unknown)) return j;
    await Promise.all(j.unknown.map((x) => cliVersionAt(x).catch(() => null)));
    const j2 = cliJudge(rec);
    return j2 && j2.unknown ? { gone: j2.gone } : j2;
  }
  /** The fact of one browser's CLI for an answer that REFUSES on it (the three /resolve forms): the candidates asked first. */
  async function cliFactReady(profileId) {
    ensureLoaded();
    const rec = reg.browsers[profileId];
    if (!rec) return null;
    await cliOptReady(rec);
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
    return { version: rec.cli.version, ...(o && o.gone ? { gone: o.gone } : {}) };
  }
  function runningClis(inUseV) {
    let previous = 0, gone = 0; const versions = new Set();
    for (const rec of Object.values(reg.browsers || {})) {
      if (!rec || !B.isLiveBrowser(rec) || !isLocalRec(rec) || !rec.cli || !rec.cli.version) continue;
      const o = cliOptOf(rec);
      if (o && o.gone) { gone++; versions.add(rec.cli.version); continue; }
      if (inUseV && rec.cli.version !== inUseV) { previous++; versions.add(rec.cli.version); }
    }
    return { previous, gone, versions: [...versions].sort() };
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
    const install = installVerdict({ host: p.host || null });
    const leases = reg.leases.filter((l) => l.profileId === p.id);
    // the rebuilt dialog: the rows carry their STATE — so the gate sees the real leases + who drives (a driven profile
    // is `in-use-by-hand`), the cloak executable re-shaped (null for every row the user installs nothing for) and the install facts
    const binaryOf = (id) => {
      const r = B.providerRow(id);
      if (!r || r.executable !== 'installed' || p.host) return null;
      const exe = cloakExecutable();
      return { needed: r.binary, present: !!exe.ok, configured: String(setting(r.exeSetting, '') || '').trim() !== '' };
    };
    // lane-cloak: `sitesOf` = what a cloak browser may open behind the egress proxy (the ready card says when it is none)
    const rows = SW.switcherRows({ profile: p, providerIds: B.providerIds(), rowOf, controlOf: control, capabilityRefusalOf: B.capabilityRefusal, sources: (id) => keysOf().sourceOf(id), seats: reg.seats, majors: reg.majors, dirMajor, now: now(), runningOf, leases, inputs: inputsView({ withHumans: !forAgent }), binaryOf, install, keyRequiredOf: keyRequired, sitesOf: (id) => ((B.providerRow(id) || {}).egressProxy && !p.host ? cloakRunList() : null), humans: forAgent ? [] : humanRowsOn(p.id) });
    const rec1 = reg.browsers[p.id] || null; // lane browser-admin 2a: the Chrome build line (chromium only) — the choice + the build its browser reports
    return { build: (B.providerRow(p.provider) || {}).buildChoice ? { choice: forAgent ? BB.agentChoiceView(p.browser) : BB.choiceView(p.browser), running: rec1 ? BB.runningBuildOf(rec1.cdpBrowser) : null, missing: p.buildMissing ? (forAgent ? BB.agentMissingView(p.buildMissing) : { ...p.buildMissing }) : null, live: B.isLiveBrowser(rec1) } : null, /* verify r1 (F5): an agent's view names a chrome file by kind only */ profile: B.publicProfileView(p), chip: chipFor(p), rows, seats: seatStates(), siteHints: reg.siteHints.map((h) => ({ ...h })), blocked: blockedFor({ profileId: p.id }), leases: leasesOn(p.id), switching: switching.has(p.id), live: B.isLiveBrowser(reg.browsers[p.id]), versions: { recorded: p.lastChromiumMajor, dir: dirMajor, majors: { ...reg.majors } }, install };
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
      else { const g = Array.isArray(taskIds) ? { ids: taskIds.map(String), unreadable: !!groupsUnreadable } : groupsOfKey(browserKey); admitted = B.mayAttach(p, { browserKey, taskIds: g.ids, groupsUnreadable: !!g.unreadable }).ok === true; }
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
      return { ok: true, mode: 'proposal', from, to, reason: v.reason, affected: v.affected, fingerprint: v.fingerprint, seats: v.seats, text: `switch "${p.label}" from ${from} to ${to}`, detail: `${v.reason}. Sessions affected: ${v.affected.join(', ') || 'none'}.${v.fingerprint ? ' ' + v.fingerprint : ''}` };
    }
    switching.add(p.id);
    const reopened = [];
    try {
      const rec0 = reg.browsers[p.id];
      const wasLive = B.isLiveBrowser(rec0);
      if (wasLive) await stop(p.id, { why: 'switch' });
      p.provider = to;
      if (Number.isInteger(v.seed)) p.fingerprintSeed = v.seed;
      if (makeDefault) p.defaultBackend = to;
      p.lastSwitchAt = now();
      commit();
      let browser;
      try { browser = await start(p.id, { why: `switch ${from} → ${to}` }); }
      catch (e) {
        // THE START-FAILURE ROLLBACK (the rebuilt dialog, 2026-09-27): the provider was committed before start(), so
        // ANY refusal start() throws (not_managed, browser_cap, backend_no_key on a stale view, launch_failed, …)
        // arrived with the profile stranded on a backend that cannot start. Put it back, try the old one ONCE, and
        // answer the original refusal with the facts: restored (did the old backend come back), from, to.
        p.provider = from;
        if (v.seedMinted) p.fingerprintSeed = null;
        commit();
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
      commit();
      log.log?.(`[browser] ${p.id} "${p.label}" switched ${from} → ${to} by ${by.kind}${browserKey ? ' ' + browserKey : ''}: ${reopened.length} lease tab(s) re-opened${v.seedMinted ? ', seed minted' : ''}${v.ladder && v.ladder.disagreement ? ', version stamps disagreed (' + v.ladder.disagreement.recorded + ' vs ' + v.ladder.disagreement.dir + ', took ' + v.ladder.disagreement.taken + ')' : ''}`);
      return { ok: true, mode: 'switch', from, to, seed: p.fingerprintSeed, seedMinted: v.seedMinted, fingerprint: v.fingerprint, ladder: v.ladder, seats: v.seats, reopened, browser, chip: chipFor(p), profile: B.publicProfileView(p) };
    } finally { switching.delete(p.id); commit(); }
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
        // lane-cloak (the first switch on the REAL binaries, 2026-09-28): the lease's session is PINNED to its tab in the
        // browser that was just stopped — 0.38.1's pin is sticky per session, so `--pin-tab open <url>` answered
        // `tab_gone` ("bound tab is gone … Run `tab new <url>`") and every later verb of the lease did too; `tab new` is
        // the binary's own recovery: it opens the tab in the NEW browser and binds the session to it
        // lane browser-windows (U1): …in a WINDOW OF ITS OWN in the new browser (the old one's windows are gone with it)
        const r = await openOwnTab(p, l.browserKey, { url, ns, opts: o, pin: pinTab ? ['--pin-tab'] : [] });
        ok = !!r.ok;
        targetId = r.targetId || null;
        if (ok && r.window === 'own') { l.windowIn = WIN.instanceOf(reg.browsers[p.id]); if (WIN.windowIdOf(r.windowId) != null) l.windowId = WIN.windowIdOf(r.windowId); } // T2 ⑧: the new browser's one window of this holder
        if (!ok) error = String(r.error || '').trim().slice(0, 200) || 'open failed';
      } catch (e) { error = String(e && e.message); }
      // the SAME lease object: only targetId is re-minted (§7.4 step 5)
      l.targetId = targetId ? String(targetId) : null;
      l.reopenedAt = now();
      if (mediator && isMediated(p) && l.targetId) mediator.admitTarget(p.id, l.browserKey, l.targetId); // P6: the re-opened tab is the lease's
      reopened.push({ browserKey: l.browserKey, url, ok, targetId: l.targetId, error });
    }
    return reopened;
  }
  /** `vibespace-browser blocked` — record the agent's CLAIM (who, which URL,
   *  why, what evidence, which tier it suggests). Bounded; one per
   *  (conversation, host). The server never manufactures one. */
  function blocked({ url, why = '', evidence = '', tier = null, browserKey = null, sessionId = null, profileId = null, sessionName = '', remote = false } = {}) {
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
      if (cv === 'rejected') { const st = SW.proposalStep(prior.proposal, { event: 'told' }); if (st.ok) { prior.proposal = st.next; commit(); emitProposal(prior); } }
      log.log?.(`[browser] ${browserKey || '?'} claims blocked on ${v.value.host} again — ${cv === 'same' ? 'the proposal ' + prior.id + ' stands (' + prior.proposal.state + ')' : 'the user rejected ' + prior.id + ' (told now)'}`);
      return { claim: { ...prior }, text: SW.blockedText(prior), hint: SW.siteHintFor(reg.siteHints, prior.host), proposal: { ...prior.proposal }, duplicate: cv === 'same', rejected: cv === 'rejected' };
    }
    let proposal = null;
    if (cv === 'new') {
      // the cloak ROW first (a build whose §7.2.1 record is not a measurement leaves it unwired — nothing to install or switch to)
      const cc = control('cloak', { host: null });
      const install = cc && cc.ok ? SW.proposalInstall({ exeOk: !!cloakExecutable().ok, verdict: installVerdict(), npm: whichOnPath('npm') !== null }) : { install: 'unavailable', installWhy: 'provider_unavailable', installError: String((cc && cc.error) || 'CloakBrowser is not wired on this instance').slice(0, 300) };
      const target = proposalTargetFor(profileId, browserKey);
      // verify r1 V1: a CloakBrowser browser whose list lacks the host (or a host its sign-in page loads from) asks for the site
      const dep = SW.signinDependenciesOf(v.value.host);
      const listNow = cloakRunList().join(',');
      const siteListed = [v.value.host, ...(dep ? dep.also : [])].every((h) => SW.siteAdmitted(listNow, h));
      const siteAdmissible = B.egressVerdict(v.value.host, [v.value.host]).allow === true; // verify r1: never a loopback / link-local site
      const plan = SW.proposalPlan({ remote: !!remote || (browserKey ? isRemoteKey(browserKey) : false), target, install, cloakMajor: SW.chromiumMajorFor('cloak', { tier: reg.seats.cloak ? reg.seats.cloak.tier : null, majors: reg.majors }), sessionName, labelTaken: (l) => { const f = profileByRef(l); return !!f; }, siteListed, siteAdmissible });
      proposal = SW.proposalFor({ claim: v.value, plan, install, at: now() });
    }
    const entry = proposal ? { ...v.value, proposal } : v.value;
    // a claim-only claim (tier 1 / 3) replaces the conversation's previous claim on the host (the pre-lane rule); an entry
    // carrying a proposal is its card's record and stays (bounded by the 50 below)
    // verify r1: the bound drops the entries nobody waits on first (SW.blockedKeep) — never another conversation's open
    // proposal to make room for a claim; one that must still go (50 undecided) is SAID: its listeners hear `dropped`
    const kept = SW.blockedKeep([...reg.blocked.filter((b) => !(mineOn(b) && !b.proposal)), entry]);
    reg.blocked = kept.keep;
    commit();
    for (const d of kept.dropped) if (d.proposal && SW.blockedRank(d) >= 2) { log.warn?.(`[browser] the claim store is full — proposal ${d.id} (${d.proposal.state}, ${d.host}) was dropped to make room`); emitProposal({ ...d, dropped: true }); }
    log.log?.(`[browser] ${browserKey || '?'} claims blocked on ${v.value.host}${why ? ' (' + why + ')' : ''}, suggests tier ${v.value.tier}${proposal ? ` — proposal ${entry.id}: ${proposal.plan.kind}${proposal.plan.why ? ' (' + proposal.plan.why + ')' : ''}, install ${proposal.install}` : ''}`);
    if (proposal) emitProposal(entry);
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
    commit();
    emitProposal(e);
    return { ok: true, entry: { ...e, proposal: { ...e.proposal } } };
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
  function dropLeaseTabs(profileId) {
    const pid = String(profileId || '');
    let n = 0;
    for (const l of reg.leases) if (l && l.profileId === pid && Array.isArray(l.tabs) && l.tabs.length) { delete l.tabs; n++; }
    if (n) commit();
    return n;
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
      if (cv === 'rejected') { const st = SW.proposalStep(prior.proposal, { event: 'told' }); if (st.ok) { prior.proposal = st.next; commit(); emitProposal(prior); } }
      return { ok: true, entry: { ...prior, proposal: { ...prior.proposal } }, duplicate: cv === 'same', rejected: cv === 'rejected' };
    }
    const who = siteResetHolders(p.id);
    const id = 'sr-' + crypto.randomBytes(4).toString('hex');
    const label = String(p.label || '').replace(HC.HIDDEN_RE, ''); // the card's words carry nothing that is not drawn (THE one set)
    const proposal = SW.siteResetProposalFor({ id, host: h, url, profileId: p.id, profileLabel: label, holders: Math.max(1, who.holders), human: who.human, at: now() });
    const entry = { id, at: now(), browserKey: browserKey || null, sessionId: sessionId || null, profileId: p.id, host: h, url: proposal.url, by: 'agent', proposal };
    const kept = SW.blockedKeep([...reg.siteResets, entry]);
    reg.siteResets = kept.keep;
    commit();
    for (const d of kept.dropped) if (d.proposal && SW.blockedRank(d) >= 2) { log.warn?.(`[browser] the site-reset store is full — proposal ${d.id} (${d.proposal.state}, ${d.host}) was dropped to make room`); emitProposal({ ...d, dropped: true }); }
    log.log?.(`[browser] ${browserKey || '?'} proposes clearing ${h}'s stored login in the shared profile ${p.id} ("${label}") — proposal ${id}, ${who.holders} conversation(s)${who.human ? ' + the user\'s own tab' : ''}`);
    emitProposal(entry);
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
    const r = await openOwnTab(p, l.browserKey, { url: String(url || ''), ns: nsOf(p.id), opts: o, pin: pinTab ? ['--pin-tab'] : [] });
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
    if (reg.blocked.length !== n) commit();
    return reg.blocked.length !== n;
  }
  /** Per-site memory (§7.4 / §7.6 rule 2): a claim keyed by EXACT host, with
   *  who made it; `tier` is legal only while `backend` is null. */
  function addSiteHint(h = {}) {
    ensureLoaded();
    const v = SW.siteHintVerdict({ ...h, at: now(), providerIds: B.providerIds() });
    if (!v.ok) throw namedError(v.code, v.error);
    reg.siteHints = [...reg.siteHints.filter((x) => x.host !== v.value.host), v.value];
    commit();
    return { ...v.value };
  }
  function dropSiteHint(host) {
    ensureLoaded();
    const h = SW.normalizeHost(host);
    const n = reg.siteHints.length;
    reg.siteHints = reg.siteHints.filter((x) => x.host !== h);
    if (reg.siteHints.length !== n) commit();
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
    r.retired = Promise.all(orphanEph.map((p) => retireEphemeral(p.id, 'conversation gone').catch(() => ({ removed: false }))));
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
      rec.state = 'ready'; rec.adoptedAt = now();
      log.log?.(`[browser] adopted ${rec.profileId} "${p.label}" on ${rec.hostId} (daemon pid ${rec.pid} there)`);
    } catch (e) { ended(`${rec.hostId || 'this machine'} could not be asked (${e.message})`); }
  }
  async function adoptAll() {
    ensureLoaded();
    for (const rec of Object.values(reg.browsers)) {
      if (!B.isLiveBrowser(rec)) continue;
      const p = profile(rec.profileId);
      if (!isLocalRec(rec)) { await adoptRemote(rec, p); continue; }
      const verdict = pidVerdictOf(rec);
      let active = false;
      // takeover C3: a managed ephemeral browser is asked under the session pairs it was started with
      if (verdict === 'ours') { try { active = (isEph(p) && Array.isArray(rec.envPairs) ? await rt.info(null, { extraEnv: pairsEnv(rec.envPairs) }) : await rt.info(rec.ns, { dir: p ? p.dir : null })).active; } catch { active = false; } }
      const v = B.adoptVerdict(rec, { verdict, active });
      if (!v) continue;
      if (v.state === 'ready') { rec.state = 'ready'; rec.adoptedAt = now(); recaptureBrowser(rec, 'boot'); if (rec.closed && rec.closed.code === 'browser_unstable' && rec.closed.unstable === 'failing') bootRejudge.add(rec.profileId); // lane browser-unstable-rejudge
        log.log?.(`[browser] adopted ${rec.profileId} "${p ? p.label : ''}" (daemon pid ${rec.pid})`); if (isEph(p)) keptNote('start', p); }
      else {
        rec.state = v.state; rec.lastError = v.lastError; rec.endedAt = now(); log.warn?.(`[browser] ${rec.profileId} ${v.state} at boot: ${v.lastError}`);
        if (isEph(p)) keptNote('stop', p, { why: 'restart' }); // lane browser-resume: it died while VibeSpace was down — its last persisted tabs are kept (D2: reopened at its next start)
        else tabsLost(rec.profileId, 'a boot that could not adopt it (a pod roll, a crash while VibeSpace was down)'); // lane profile-lock-roll (L2)
        if (daemonGone(rec)) reapOrphan(rec, 'boot'); // r2 M1: the daemon died while VibeSpace was down — its browser is ended too
      }
    }
  }
  /** The boot path (§3.5), in this order and no other: drop every lease nobody
   *  carries, THEN judge each recorded browser, THEN start the tick. Runs
   *  after restoreSessions so `liveKeys` is final. */
  async function boot() {
    ensureLoaded();
    const r = reconcile({ graceMs: 0 });
    await r.retired;
    await adoptAll();
    await Promise.allSettled([...reaping.values()]); // r2 M1
    // BROWSE YOURSELF verify r1 (H4): a restored holder of the user's whose browser did not survive the restart ends
    // `stopped` (his tab went with it); one on an adopted browser stays away — kept, counted by the idle clock, continued
    for (const h of [...humans.values()]) if (!B.isLiveBrowser(reg.browsers[h.profileId])) await endHuman(h.profileId, 'stopped', { closeTab: false });
    commit();
    if (Object.values(reg.browsers).some(B.isLiveBrowser) || reg.leases.length || humans.size) startTimer();
    return { droppedLeases: r.dropped.length, browsers: Object.values(reg.browsers).filter(B.isLiveBrowser).length, humans: humans.size };
  }

  // ── the tick: carrier grace, idle, the resource REPORT ──
  async function tick() {
    ensureLoaded();
    warmCliVersions(); // verify r3 (Y1): the row's sync readers see a replaced binary's version within a tick
    const t = now();
    const r = reconcile({ graceMs: B.LEASE_DROP_GRACE_MS });
    if (r.dropped.length || r.stamped.length) dirty = true;
    await r.retired;
    const asks = []; // lane browser-unresponsive: each live local browser's `/json/version` ask (parallel, awaited below)
    for (const rec of Object.values(reg.browsers)) {
      if (!B.isLiveBrowser(rec) || stopping.has(rec.profileId) || starting.has(rec.profileId)) continue;
      const p = profile(rec.profileId);
      // takeover C3: an ephemeral daemon's CLI owns its idle clock — a gone
      // pid is an idle-out (stopped, not an error); the next verb restarts it
      // (verify r2 L4: dead OR recycled — a pid that is another process now is not the daemon; M1: its browser is ended)
      if (isEph(p) && daemonGone(rec)) { markEphemeralGone(rec); continue; }
      // P4: a process on a paired machine / an external browser is never
      // pid-judged or sampled here (the pid is not ours, or not local)
      if (isLocalRec(rec) && daemonGone(rec)) { markDaemonGone(rec, 'the tick'); continue; }
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
    if (dirty) commit();
    // P3 (§4.3): a takeover somebody walked away from hands back by itself, a
    // pending confirmation the daemon has already auto-denied is forgotten.
    sweepIdleTakeovers(t);
    await sweepHumans(t); // BROWSE YOURSELF: an away holder past its keep ends `left`; one whose browser stopped ends `stopped`
    sweepPending();
    sweepIdleReleases(t); // MULTIVIEW B-325a
    await sweepIdlePaint(t); // lane browser-swiftshader-cpu
    refreshKeptTabs(t); // lane browser-resume: a running conversation browser nobody mirrors — its tabs read every 30 s (a crash keeps them)
    if (!Object.values(reg.browsers).some(B.isLiveBrowser) && !reg.leases.length && !inputs.size && !pending.size && !humans.size) stopTimer();
  }
  function startTimer() {
    if (timer) return;
    timer = setInterval(() => { tick().catch((e) => log.warn?.(`[browser] tick failed: ${e.message}`)); }, tickMs);
    if (timer.unref) timer.unref();
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  /** Timers only — the browsers SURVIVE a VibeSpace exit by design (adopted next boot). */
  function shutdown() { stopTimer(); if (dirty) save(); installs.shutdown(); /* lane chrome-builds-download: an in-process download ends with its keeper (the marker stays: the next keeper judges it) — lane dc-browser-installs: the running row's own shutdown */ try { keptStore()?.shutdown?.(); } catch { /* lane browser-resume: the kept store's throttled tab list is flushed with its feeder */ } try { mediator?.shutdown?.(); } catch { /* P6: the proxy is this keeper's to end */ } try { const pxs = [...cloakProxies.values()]; cloakProxies.clear(); for (const px of pxs) px.close().catch(() => {}); } catch { /* lane-cloak: the egress proxies are this keeper's to end */ } }
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
      return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: r.code === 'browser_cli_gone' ? r.code : 'stream_unavailable', error: r.error };
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
      if (e && e.state !== 'ready') return { ok: false, port: null, code: 'browser_stopped', state: e.state, error: e.state === 'starting' ? 'this conversation\'s browser is starting — the view connects when it is ready' : 'this conversation\'s browser is not running (it idled out or was stopped) — the agent\'s next browser command starts it again, and this view reconnects then' };
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
      return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: r.code === 'browser_cli_gone' ? r.code : 'stream_unavailable', error: r.error };
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
      const g = await mediator.grantFor({ profileId: p.id, browserKey: bk, upstream: rec.cdpUrl, paused: () => inputStateFor(bk, p.id).input === 'user' });
      const r = await rt.streamPort(M.mediatedNamespace(p.id, bk), { session: target.sessionName, extraEnv: { AGENT_BROWSER_CDP: g.url, AGENT_BROWSER_IDLE_TIMEOUT_MS: String(idleMs()) } });
      return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: r.code === 'browser_cli_gone' ? r.code : 'stream_unavailable', error: r.error };
    }
    // naive study 2: the lease's own session over the keeper browser's CDP url — never the directory (on 0.38.1 a
    // `stream status` under the lease's session with the directory STARTS a second Chrome, which dies on SingletonLock)
    const o = await leaseCliOpts(p.id, String(target.sessionName || '').replace(/^vs-/, ''));
    if (!o) return { ok: false, port: null, code: 'browser_no_cdp', error: noCdpError(p) };
    const r = await rt.streamPort(target.ns, { session: target.sessionName, extraEnv: o.extraEnv });
    return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: r.code === 'browser_cli_gone' ? r.code : 'stream_unavailable', error: r.error };
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
    if (!p) return { ok: false, error: 'no such browser' };
    const rec = reg.browsers[p.id];
    if (!rec || rec.state !== 'ready') return { ok: false, error: 'the browser is not running' };
    if (rec.hostId) return { ok: false, error: 'the browser runs on another machine' };
    if (!isEph(p)) return rec.cdpUrl ? { ok: true, url: rec.cdpUrl } : { ok: false, error: 'the browser answered no CDP url' }; // the record's own (a restart writes the new one)
    if (fresh) vpUrls.delete('child:' + String(p.owner.id)); // a watch that went down re-asks the daemon (a relaunched Chrome has a new port)
    return withCdpUrl({ kind: 'child', handle: p.owner.id }, async (url) => ({ ok: true, url }));
  }
  async function withCdpUrl(target, fn) {
    const S = require('../browser-stream.js');
    const key = target.kind === 'ephemeral' ? 'eph:' + String(target.sessionName || '') : target.kind === 'child' ? 'child:' + String(target.handle || '') : 'p:' + String(target.profileId || '');
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
    return withCdpUrl(target, (url) => VP.visibilityOf(url, String(targetId).toUpperCase()));
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
    list, profile, profileByRef, browserOf, leasesFor, leasesOn, createProfile, adoptDirectory, removeProfile,
    buildsFor, // lane browser-admin 2a: Change build… (buildsView, machineBuilds, setBrowserChoice, onRelaunch: the builds row, in ...installs.api)
    restartProfile, askAnswer: (id, by) => { ensureLoaded(); const rec = reg.browsers[id]; return askAnswer(rec, profile(id), by); }, // lane browser-unresponsive: THE recovery + one ask (the gate's seam)
    cliPin, cliFactReady, _reattached: () => reattached, // cliFacts + installCli: the CLI row, in ...installs.api
    ...installs.api, // rv-browser F7 (lane dc-browser-installs): every install row's own routes (lane chrome-builds-download (design 004): Download another build…) // lane browser-admin 2b: the browser CLI VibeSpace drives (verify r3: cliFactReady = the doors' fact, the candidates asked first)
    machineDisplay, machineDisplayCached, noDisplayMode, headedSetting, // lane headless-fallback (+ H5: the stored window preference, for Settings' fact line): this machine's display now (a fresh probe — Settings' read-only line) + the no-display setting
    reshapeStore: (fn) => { ensureLoaded(); const r = fn(reg); commit(); return r; }, // MIGRATIONS ONLY (2026-09-runaway-parks-void): reshape the in-memory registry, then the ONE atomic save
    usageOf: (id) => { const l = live.get(id); return l ? { ...l } : null; }, // 2026-09-25: the Browser panel's memory cell (memBytes + memMetric, over)
    // takeover C3 (design-browser-takeover §5): the managed ephemeral browser + the ceiling's count seam
    ensureEphemeral, retireEphemeral, ephemerals, ephemeralFor, isEphemeral: (id) => isEph(profile(id)), nsOf,
    restoreRebound: keepRebound, // verify r3 (F4): the route puts a note back when the answer that carried it could not be delivered (the client gone)
    liveHoldingFor, // lane H: the session card / status chip's `browserLive` fact
    factView, factFor, pinnedBy, clearPin, removeVerdict, removeOnMachine, onChange, creditUserInput, // lane S2: THE browser fact, the delete's refuse-or-warn, the re-publish hook, the input receipt's credit
    holdersFor: (browserKey) => { ensureLoaded(); return holders(B.leasesOf(reg.leases, String(browserKey || ''), { children: true })); }, // lane H: THE holder rows of one conversation (the recorder arms only on a holder)
    socketRootOf, // takeover r2: the root every command of a browser this keeper runs must land under
    configFileFor, machineConfigFile, // takeover r3: the config a command on a browser this keeper runs is NAMED with
    setOtherHolders: (fn) => { othersFn = typeof fn === 'function' ? fn : null; },
    streamPortFor, // P2: the live view's port (attachment or ephemeral; MULTIVIEW: a helper's — a view never STARTS any of them: released / stopped / not-started are said)
    noteStreamClosed, // VERIFY r1 H2: the bridge's upstream closed on an ephemeral relay — judge the process now
    leaseCliOpts, // naive study 2: the ONE way a CLI call under a lease's session reaches the keeper's browser (CDP, never the directory)
    agentTabAct, tabOwnersFor, userTabAct, bootstrapTabRoot, // lane browser-resume C (§3.9, ruling 3): the agent's own tab verbs, whose tab it is (the bridge's row), the user's ✕ / switch
    ephemeralPairsFor: (browserKey) => { ensureLoaded(); const p = reg.profiles.find((x) => isEph(x) && x.owner.id === String(browserKey || '')); return p ? (pairsOf(p.id) || null) : null; }, // naive study 2 (finding 4): a sub-agent browser's OWN pairs — the recorder's tap on it
    viewportFor, // lane J: the page's own viewport (the live view's input space)
    tabVisibilityFor, captureTabFor, watchTabFor, // lane browser-windows (U3/U0b): a background tab is said and polled; a watched tab's frames
    setViewportFor, freshFrameFor, // lane S4: size the page to the pane (never starting a browser) + a fresh frame after a navigation
    watchCopiesFor, // lane live-input: the copies the page performs while the user drives (copy out)
    cdpEndpointFor, setStuckSource, holdsDialogsFor, setPaintWatch, sweepIdlePaint, // lane browser-swiftshader-cpu
    // lane browser-stuck: the dialog watch's upstream by profile id; the conversation's stuck fact on factView
    viewportNoteFor, noteViewport, // verify r1: the page-size note on the browser's own record (agent choice / applied / baseline / floor)
    // MULTIVIEW D4 / B-325a: the per-conversation cap, the own count, the release after the turn, the viewers the bridge reports
    capOf, capFor, setCap, stampGroupCap, groupCapOf, ownLive, noteViewers, sweepIdleReleases, idleReleaseAfterMs,
    pairsForKey: (k) => { const e = ephemeralFor(k); return e ? (pairsOf(e.profileId) || null) : null; }, // MULTIVIEW §4: a helper's OWN pairs (the bridge's child relay answers confirmations under them)
    pinFor, setPin, pinForCreate, instanceDefault, taskGroupDefaultFor,
    restorePin, taskGroupCapFor, // B-f7ab verify r2: the spawn's witnessed pick restored under the late key (a PREFERENCE — it never edits "Who can use it"); the group cap READ for the witness
    // owner ruling A: a pin that did not open is said; one driver at a time; Delete… releases everything first; the adopt
    // stops the conversation's own browser first. "Who can use it" is a list (2026-09-27): the ONE re-judge, the pick that
    // writes the list, the keys a write may name, the Task Group seams (the routes' GET …/use reads them)
    rejudgeLeases, rejudgeAll, addConversation, knownKeysOf, keyNamed, taskIdsForKey: (bk) => groupsOfKey(bk), taskInfo: (id) => taskFacts(id),
    copyPin, notePinFailure, pinFailureOf, clearPinFailure, releaseAll, stopEphemeralOf,
    start, stop, attach: attachTimed, detach, statusFor,
    // BROWSE YOURSELF (B-6ae8): the user as one more holder on his own tab — the button, his window's controls, the two ends
    browse, humanOf, humanTargetFor, humanInputState, humanAttach, humanTake, humanPass, humanRelease, noteHumanInput, navigateHuman, closeHuman, quitHuman, endHuman, holdersOn, setViewerAlive, humanKeepOf: (id) => { const h = humans.get(String(id || '')); return h ? humanKeepOf(h) : null; },
    // P3 (§4.3 / §4.3.1): the input side — takeover/handback/idle, the typed paused refusal, the confirmation registry
    takeoverIdleMs, inputStateFor, inputsFor, inputSummaryFor, takeover, handback, handbackWakesFor, passControl, noteUserInput, noteUserUrl, pausedVerdictFor, onInput,
    interruptionFor, interruptionOf, setInFlightReader, awaitInterruptionSettled, // the owner's ruling (2026-09-27): a takeover interrupts, tells, and the handback reminds
    clock: () => now(), // the ONE clock a takeover's instant and a /resolve's instant are compared on (the route stamps with it)
    notePending, resolvePending, pendingFor, pendingAllFor, answerConfirmation, onConfirmation,
    // P1 second half (§3.7/§3.8): the set, handles, the one-time refusal, children, the audit, adopt
    setFor, tell, resolveFor, newChild, dropChild, jobHandleFor, findJobHandle, jobOf, releaseJob, audit, adoptScratch, auditFile: path.join(dataDir, AUDIT_FILE),
    reconcile, adoptAll, boot, tick, startTimer, shutdown,
    // P4 (§7.3): the paired-machine question the routes ask before a create is judged
    hostKnown: knownHost, isLocalRec, probeCdp, desktopConsent,
    // P4 second half (§7.4 / §7.5): the switch, its view, the chip, seats, the agent's claims, per-site memory, the lease's last URL
    switchBackend, switcherView, chipFor, choicesFor: (id) => { const p = profile(id); return p && !isEph(p) ? backendFactFor(p).choices : []; }, seatStates, runningOf, blocked, blockedFor, clearBlocked, addSiteHint, dropSiteHint, siteHints, noteLeaseUrl, cloakExecutable, readDirMajor, keys: () => keysOf(),
    onProposal, proposalEntry, stepProposal, noteProposal, proposalsFor, proposalOthers, openInLease,
    proposeSiteReset, siteResetHolders, holderTabs, noteOwnTab, forgetOwnTab, pruneOwnTabs, // lane site-reset step 3 (verify r3 #2: the persisted witness; r4 #3: pruned at a connect) (+ verify r1: a holder's attributable tabs): one site's login on a shared profile — a proposal // lane browser-propose: the proposal record + what its runner acts through
    // §7.4 failure form (1): the install action (verdict = PURE over the proof record; the act spawns npm ONLY on ok)
    installDir, cloakEgress, cloakRefusals, // installVerdict, installCloak, installedCloakBin, installedStamp, cloakCacheDir: the cloak row, in ...installs.api
    // P5 (§4.5 / D7 / D35): the lease seam the recorder and the screencast hang on, the digest hook, the editable fields
    onLease, addDigest, updateProfile,
    // P6 (§6.2 / §6.5): is `sharing:"instance"` a value here; the proxy (the routes ask it nothing directly)
    mediationOn, isMediated, mediator: () => (mediationOn() ? mediator : null),
    storeFile, STORE_FILE, uid, _reg: () => reg, _facts: bf, _runtime: rt,
    lineageKeyOf, moveDirLineage, // verify r8 (T2 ②): the product's own move of a directory (a Forget) carries its lineage

    // lane browser-resume (§3.9): the relay's tab list of a conversation's own browser, the CDP read at a stop, the store
    profileDirRegistered: (dir) => { ensureLoaded(); return !!dir && named().some((p) => p.dir && !p.host && (B.sameDir(p.dir, dir) || F.sameRealDir(p.dir, dir) !== false)); }, // lane browser-resume: a kept directory a named profile registered in place is never removed by the kept store — verify F1: by REAL identity, unknown ⇒ registered (fail closed)
    noteTabs, captureKeptTabs: (profileId, seenBy) => { const pp = profile(String(profileId || '')); return captureKeptTabs(pp, pp ? reg.browsers[pp.id] : null, seenBy || 'a read'); }, keptStore: () => keptStore(),
    // lane browser-resume B (§3.9, ruling 2): Resume, the reopen, the hand-back's two halves
    factsMoved: () => { for (const fn of changeListeners) { try { fn(); } catch (e) { log.warn?.(`[browser] change listener failed: ${e && e.message}`); } } }, // lane B: the kept store moved a fact (no registry write)
    resumeFor, resumeAttachment, restoreTabs: (profileId, plan, o) => restoreTabs(profile(String(profileId || '')), plan, o), continueState, noteContinue,
  };
  if (install) installed = api;
  return api;
}

module.exports = { create, keeper, STORE_FILE, AUDIT_FILE, TICK_MS, STOP_GRACE_MS, ARM_WAIT_MS, RESOURCE_METRIC, EPHEMERAL_DETACH_NOTE };
