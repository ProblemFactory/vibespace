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
const SW = require('../browser-switch.js');
const F = require('../browser-facts.js');
const T = require('../browser-takeover.js');
const M = require('../browser-mediation.js'); // P6: the per-session url + env of a MEDIATED lease
const VERBS = require('../browser-verbs.js'); // takeover r3: the ONE config rule (sanctionedConfig)
const LIMITS = require('../keeper-limits.js');
const RG = require('../runaway-guard.js'); // the ONE resource verdict + per-provider numbers + report level (2026-09-25: report only)

const STORE_FILE = 'browser-profiles.json';
const AUDIT_FILE = 'browser-audit.jsonl';
const TICK_MS = 5000;
const STOP_GRACE_MS = 3000;
/** Lane H: the longest a verb waits for the lease seam's listeners (the action-trace recorder arming its tap). */
const ARM_WAIT_MS = 3000;
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
 *   facts / runtime / limits / log / now / tickMs / guardSampleMs — injectable for the gate
 */
function create({ dataDir, homeDir = os.homedir(), env = () => ({}), broadcast = null, serverSetting = () => undefined,
  serverNotice = null, getTelemetry = () => null, liveKeys = () => new Set(), userTodos = null,
  facts = null, runtime = null, limits = LIMITS, log = console, now = Date.now, tickMs = TICK_MS, guardSampleMs = null, install = true,
  // lane H: how long a verb waits for the lease seam's listeners (the recorder ARMING its tap) before it runs
  armWaitMs = ARM_WAIT_MS,
  taskGroupDefault = null, access = null, hostKnown = null,
  // P4 second half (§7.4 / §7.5): the integration store (a handle or a
  // getter) the key consumer resolves through; `keys` = src/server/browser-
  // backend.js's `{keyFor, sourceOf}` (built here over `integrations` when
  // not injected); `providers` = `{row, control}` overriding the PURE table
  // (the gate drives a world where cloak is wired over the fake binary)
  integrations = null, keys = null, providers = null,
  // P6 (§6.2 / §6.5 / D6): the CDP-mediating proxy (src/server/cdp-mediator.js)
  // — its presence is what makes `sharing:"instance"` a value; a MEDIATED
  // lease is handed its own scoped url instead of the profile's directory
  mediator = null,
  // takeover C3 (D2): the COUNT SEAM — the holders another keeper reports
  // against the shared CONCURRENT_CAP (the desktop-app keeper's live apps,
  // `[{label, kind}]`); wired late by server.js through `setOtherHolders`
  otherHolders = null } = {}) {
  if (!dataDir) throw new Error('browser-keeper: dataDir is required');
  const storeFile = path.join(dataDir, STORE_FILE);
  // ONE base environment for the probe, the runtime and the socket-root answer
  // (r2): the root a command lands under is computed from exactly what the
  // runtime launches and probes with
  const rtEnv = env() || {};
  const bf = facts || F.createBrowserFacts({ env: rtEnv });
  const rt = configured(runtime || F.createBrowserRuntime({ env: rtEnv, log }));
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
    const add = (ns, o) => {
      const opts = o && typeof o === 'object' ? o : {};
      const ex = opts.extraEnv && typeof opts.extraEnv === 'object' ? opts.extraEnv : {};
      if (Object.prototype.hasOwnProperty.call(ex, VERBS.CONFIG_KEY)) return opts;
      const file = configForCall(ns, opts.session || null, ex);
      return file ? { ...opts, extraEnv: { ...ex, [VERBS.CONFIG_KEY]: file } } : opts;
    };
    const out = { ...r };
    for (const m of ['info', 'launch', 'cdpUrl', 'closeAll', 'streamStatus', 'streamEnable', 'streamPort']) {
      if (typeof r[m] === 'function') out[m] = (ns, o) => r[m](ns, add(ns, o));
    }
    if (typeof r.exec === 'function') out.exec = (ns, argv, o) => r.exec(ns, argv, add(ns, o));
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
  const isMediated = (p) => B.isMediatedProfile(p);
  const pview = (p) => (p ? { ...B.publicProfileView(p), mediated: isMediated(p) } : null);
  const sampleEvery = guardSampleMs || limits.GUARD_SAMPLE_MS;
  const rowOf = (id) => (providers && typeof providers.row === 'function' ? providers.row(id) : B.providerRow(id));
  // P10 (§7.6 tier 3, D27 (b)): the consent SETTING rides every control read —
  // the tier-3 row is usable only while it is true (a user act; agents cannot write settings)
  const desktopConsent = () => setting(require('../window-desktop').SETTING_KEY, false) === true;
  const control = (id, opts) => (providers && typeof providers.control === 'function' ? providers.control(id, opts) : B.providerControl(id, { desktopConsent: desktopConsent(), ...(opts || {}) }));
  let keysMemo = keys || null;
  const keysOf = () => { if (!keysMemo) keysMemo = require('./browser-backend.js').create({ integrations, log }); return keysMemo; };
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
  let othersFn = typeof otherHolders === 'function' ? otherHolders : null;
  const othersNow = () => { if (!othersFn) return []; try { const v = othersFn(); return Array.isArray(v) ? v : []; } catch (e) { log.warn?.(`[browser] the ceiling's count seam failed — ${e && e.message}`); return []; } };
  // P3 (§4.3): WHO DRIVES each (conversation, browser) pair — IN MEMORY ONLY.
  // A server restart is a handback by construction (the viewer that held the
  // controls is gone and a reload never re-seizes them), so nothing here is
  // persisted; `inputs` keys are browser-takeover.inputKeyFor(browserKey,
  // profileId) with profileId null for the ephemeral browser (no lease).
  const inputs = new Map();     // key → input state (browser-takeover.newInputState)
  const pending = new Map();    // key → Map(confirmationId → {id, action, category, at, expiresAt})
  const inputListeners = new Set();
  const confirmListeners = new Set();
  // P5 (§4.5): the LEASE SEAM — attach / detach / lease-dropped / browser-ready
  // / browser-stopped, one event each, so the action-trace recorder and the
  // per-profile screencast hang on the keeper without the keeper knowing them;
  // `digestExtras` lets them add their facts (recording state) to `list()`.
  const leaseListeners = new Set();
  const digestExtras = new Set();
  function emitLease(ev) {
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

  function load() {
    try { reg = B.normalizeRegistry(JSON.parse(fs.readFileSync(storeFile, 'utf8'))); }
    catch (e) { if (e.code !== 'ENOENT') log.warn?.(`[browser] ${STORE_FILE} unreadable (${e.message}) — starting from an empty registry; the old file is left in place`); reg = B.normalizeRegistry(null); }
    loaded = true;
  }
  function ensureLoaded() { if (!loaded) load(); }
  function save() {
    try { fs.mkdirSync(dataDir, { recursive: true }); writeJsonAtomic(storeFile, reg); dirty = false; }
    catch (e) { log.warn?.(`[browser] could not write ${STORE_FILE}: ${e.message}`); }
  }
  function notify() { try { broadcast?.({ type: 'browser-profiles-updated', ...list() }); } catch (e) { log.warn?.(`[browser] broadcast failed: ${e.message}`); } }
  function commit() { save(); notify(); }

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
    return { ...rec, cdpUrl: undefined, remoteCdpUrl: undefined, envPairs: undefined, live: l ? { ...l } : null };
  }
  function leaseView(l) {
    const p = l ? profile(l.profileId) : null;
    const v = { ...l, mediated: !!(l && isMediated(p)) };
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
        adopted: !!(b && b.adoptedAt), usage: live.get(p.id) ? { ...live.get(p.id) } : null, createdAt: p.createdAt || 0 };
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
      profiles: named().map(pview), leases: holders(reg.leases), browsers, ephemerals: ephemerals(),
      // P6 (§6.2 / §6.5): is `sharing:"instance"` a value HERE, and the grants
      // (counts only — never a token, never a raw url)
      mediation: { available: mediationOn(), port: mediator && mediationOn() ? mediator.port() : null, grants: mediator && mediationOn() ? mediator.list() : [] },
      pins: { ...reg.pins }, cap: { used: running, cap: Number(limits.CONCURRENT_CAP) || LIMITS.CONCURRENT_CAP },
      floor: lv === undefined ? null : B.floorVerdict(lv, B.FLOOR_VERSION),
      // P4 (§7.1): the provider rows with their capability cells + the local
      // verdict — a control the digest's consumers disable WITH its reason
      providers: B.providerRows({ desktopConsent: desktopConsent() }),
      // P4 second half (§7.4): the backend CHIP per profile, the seat reading
      // per key row in its three states, the agent's blocked CLAIMS and the
      // per-site memory (claims with who made them) — the switcher's inputs
      chips: Object.fromEntries(named().map((p) => [p.id, chipFor(p)])),
      seats: seatStates(), majors: { ...reg.majors }, blocked: reg.blocked.map((b) => ({ ...b, text: SW.blockedText(b) })), siteHints: reg.siteHints.map((h) => ({ ...h })),
      switching: [...switching],
      // P5: what the recorder adds (recording state per profile, trace on/off)
      ...digestExtra(),
    };
  }
  /** `chromium 146` / `cloak 146 (free)`: the profile's backend + the major it
   *  is known to write (its own record first, else the backend's last launch). */
  function chipFor(p) {
    const intId = SW.integrationIdFor(p.provider);
    const seat = intId && reg.seats[intId] ? reg.seats[intId] : null;
    const major = Number.isInteger(p.lastChromiumMajor) ? p.lastChromiumMajor : SW.chromiumMajorFor(p.provider, { tier: seat ? seat.tier : null, majors: reg.majors });
    return SW.backendChip({ provider: p.provider, major, tier: seat ? seat.tier : null });
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
  /** An ephemeral browser's keeper file, found by the SESSION its pairs name (`vs-<browserKey>`). */
  function ephemeralConfigFor(pairEnv) {
    const sess = pairEnv && typeof pairEnv.AGENT_BROWSER_SESSION === 'string' ? pairEnv.AGENT_BROWSER_SESSION : '';
    let rec = null;
    try { const p = sess ? reg.profiles.find((x) => isEph(x) && B.sessionNameFor(x.owner.id) === sess) : null; rec = p ? reg.browsers[p.id] || null : null; } catch { rec = null; }
    return machineConfigFile('ephemeral', rec && rec.mark ? rec.mark : null);
  }
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
    let cfg;
    if (kind === 'ephemeral') cfg = B.generatedConfig({ userConfig: user || {}, projectConfig: null, pinnedDir: null, headed: h, mark: markOk });
    else { cfg = VERBS.sanctionedConfig({ user }).config; if (h !== null) cfg.headed = h; if (markOk) cfg.args = B.withKeeperMark(cfg.args, markOk); }
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
    if (typeof own === 'string' && own.startsWith('/')) return own;
    // r4: an ephemeral's command runs with the file its browser was LAUNCHED with (marked when the keeper launched it) —
    // a different one would relaunch its Chrome (measured); a lease's session with machine.json (it never launches)
    return ephemeral ? ephemeralConfigFor(pe) : machineConfigFile('machine');
  }
  /**
   * Create a profile. `owner` = { kind, id }: a session-created profile is
   * owned by its CONVERSATION (kind 'session', id = browserKey — the identity
   * that survives resume), a UI-created one by the instance. The directory is
   * made 0700 under ~/.agent-browser/ (the CLI's own root, so `agent-browser
   * profiles` lists it too); an adopted directory keeps its path.
   */
  function createProfile(input = {}, { owner = null, dir = null, legacy = false } = {}) {
    ensureLoaded();
    const v = B.validateProfileInput(input, { existing: named(), control, mediation: mediationOn() });
    if (!v.ok) throw namedError(v.code, v.error, v.why ? { why: v.why } : {});
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
    const rec = B.newProfileRecord({ id, ...fields, dir: d, owner, legacy, now: now() });
    reg.profiles.push(rec);
    commit();
    log.log?.(`[browser] profile ${id} "${rec.label}" created (${rec.provider}${rec.host ? ' on ' + rec.host : ''}${rec.cdpPort ? ', cdp port ' + rec.cdpPort : ''}${isMediated(rec) ? ', shared instance-wide (mediated)' : ''}, ${legacy ? 'legacy shared' : 'owner ' + rec.owner.kind}${rec.owner.id ? ' ' + rec.owner.id : ''})${d ? ' at ' + d : ''}`);
    return pview(rec);
  }
  /** Adopt a directory that already exists (the migration's legacy record).
   *  Idempotent on `dir`. */
  function adoptDirectory({ label, dir, legacy = false, owner = null }) {
    ensureLoaded();
    const have = reg.profiles.find((p) => p.dir === String(dir));
    if (have) return { profile: pview(have), created: false };
    try { if (!fs.statSync(dir).isDirectory()) return { profile: null, created: false, why: `${dir} is not a directory` }; } catch { return { profile: null, created: false, why: `${dir} does not exist` }; }
    const p = createProfile({ label }, { owner, dir, legacy });
    return { profile: p, created: true };
  }
  /** Removal is refused while anything holds or runs it — a cookie jar is
   *  somebody's login; the directory itself is NEVER deleted by this (D8). */
  function removeProfile(id) {
    ensureLoaded();
    const p = profile(id);
    if (!p) throw namedError('not-found', `no profile ${id}`);
    const held = reg.leases.filter((l) => l.profileId === id);
    if (held.length) throw namedError('leased', `profile "${p.label}" is attached by ${held.length} session(s) (${held.map((l) => l.browserKey).join(', ')}) — detach them first`);
    if (B.isLiveBrowser(reg.browsers[id])) throw namedError('running', `profile "${p.label}" has a running browser — stop it first`);
    reg.profiles = reg.profiles.filter((x) => x.id !== id);
    delete reg.browsers[id];
    for (const [k, v] of Object.entries(reg.pins)) if (v && v.profileId === id) delete reg.pins[k];
    ephPairs.delete(id); ephSessions.delete(id);
    // r4: the keeper's own marked config for this record goes with it (nothing runs on it — removal needs a stopped browser)
    { const mk = markOf(p); if (mk && MARK_RE.test(String(mk))) { try { fs.rmSync(path.join(CONFIG_DIR, markFileName(isEph(p) ? 'ephemeral' : 'machine', mk)), { force: true }); } catch { /* best effort */ } configMemo.delete((isEph(p) ? 'ephemeral' : 'machine') + '|' + mk); } }
    commit();
    if (isEph(p)) log.log?.(`[browser] ephemeral browser record ${id} "${p.label}" removed with its conversation ${p.owner.id}${p.dir ? ' (its scratch directory ' + p.dir + ' is browser-env\'s sweep to reclaim)' : ''}`);
    else log.log?.(`[browser] profile ${id} "${p.label}" removed from the registry (its directory ${p.dir} is kept — deletion is a human act)`);
    return { removed: id, dir: p.dir };
  }
  /** P5: the editable fields of a record — `record` (the per-profile screencast
   *  opt-in, D7), `label` (validated like a create: free text, unique, never a
   *  path) and `notes`. Anything else is refused by name. */
  function updateProfile(id, patch = {}) {
    ensureLoaded();
    const p = profile(id);
    if (!p) throw namedError('not-found', `no profile ${id}`);
    if (isEph(p)) throw namedError('not_editable', `"${p.label}" is a conversation's managed ephemeral browser — it has no editable fields (it goes with its conversation); a login that should survive belongs in a named profile`);
    const allowed = new Set(['record', 'label', 'notes', 'sharing']);
    const keys = Object.keys(patch || {}).filter((k) => patch[k] !== undefined);
    const bad = keys.filter((k) => !allowed.has(k));
    if (bad.length) throw namedError('bad-request', `these fields cannot be changed here: ${bad.join(', ')} (only record / label / notes / sharing)`);
    if (!keys.length) throw namedError('bad-request', 'nothing to change');
    const changed = {};
    if (keys.includes('label')) {
      const v = B.validateProfileInput({ label: patch.label }, { existing: named().filter((x) => x.id !== id), control });
      if (!v.ok) throw namedError(v.code, v.error);
      if (v.value.label !== p.label) { changed.label = { was: p.label, now: v.value.label }; p.label = v.value.label; }
    }
    if (keys.includes('record')) { const v = patch.record === true || patch.record === 'true' || patch.record === 1; if (v !== !!p.record) { changed.record = { was: !!p.record, now: v }; p.record = v; } }
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
        const pinnedBy = Object.entries(reg.pins).filter(([, x]) => x && x.profileId === id).map(([k]) => k);
        if (sv.value === 'instance' && pinnedBy.length) throw namedError('pinned', `"${p.label}" is the pin of ${pinnedBy.length} conversation(s) (${pinnedBy.join(', ')}) — a shared browser cannot be a spawn-time pin; unpin them first`);
        changed.sharing = { was: p.sharing, now: sv.value }; p.sharing = sv.value;
      }
    }
    if (Object.keys(changed).length) { commit(); log.log?.(`[browser] profile ${id} "${p.label}" updated: ${Object.keys(changed).join(', ')}`); emitLease({ kind: 'profile-updated', profileId: id, changed }); }
    return { profile: pview(p), changed };
  }

  // ── the pin (§3.2.5): browserKey → profile ──
  function pinFor(browserKey) {
    ensureLoaded();
    const v = reg.pins[String(browserKey || '')];
    if (!v || !v.profileId) return null;
    const p = profile(v.profileId);
    if (!p || isEph(p)) return null;
    return { profileId: p.id, label: p.label, dir: p.dir, origin: v.origin || 'chosen', at: v.at || 0 };
  }
  function setPin(browserKey, profileId, { origin = 'chosen' } = {}) {
    ensureLoaded();
    if (!B.isBrowserKey(browserKey)) throw namedError('bad-request', 'a pin needs a browser key');
    if (!profileId) { const had = !!reg.pins[browserKey]; delete reg.pins[browserKey]; if (had) commit(); return null; }
    const p = profile(profileId);
    if (!p || isEph(p)) throw namedError('not-found', `no profile ${profileId}`);
    // P6: a pin hands the NEXT launch the profile's DIRECTORY (P0's env), and
    // a shared browser has one owner — the keeper. A mediated profile is
    // attached through its scoped url (`use`), never pinned; refused by name.
    if (isMediated(p)) throw namedError('pin_refused', `"${p.label}" is shared instance-wide: attach it with \`vibespace-browser use ${p.id}\` — a pin would hand this conversation the profile's directory and launch a second browser on it`);
    reg.pins[browserKey] = { profileId: p.id, origin, at: now() };
    commit();
    return pinFor(browserKey);
  }
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
    // P6: a Task-Group / instance default (or a stale pin) naming a MEDIATED
    // profile is skipped with its reason — the spawn env may never carry a
    // shared browser's directory; the conversation attaches with `use`
    if (p && isMediated(p)) return { profileId: '', dir: null, origin: 'harness', refused: `${pick.origin} default "${p.label}" (${p.id}) is shared instance-wide and cannot be a spawn-time pin — attach it with vibespace-browser use` };
    return { profileId: p ? p.id : '', dir: p ? p.dir : null, origin: p ? pick.origin : 'harness', label: p ? p.label : null };
  }

  // ── the browser: reuse-or-spawn ──
  function idleMs() { return B.idleTimeoutMs(setting('browser.idleTimeoutMs', B.DEFAULT_IDLE_TIMEOUT_MS)); }
  /** r4 LOW 5: the idle timeout an ephemeral's spawn pairs carry (frozen at spawn), else the setting. */
  function pairsIdleMs(pairs) {
    const v = pairsEnv(pairs || []).AGENT_BROWSER_IDLE_TIMEOUT_MS;
    return typeof v === 'string' && /^\d+$/.test(v.trim()) ? B.idleTimeoutMs(Number(v)) : idleMs();
  }
  /** The ceiling over EVERY live browser record (named + managed ephemeral)
   *  plus the holders the count seam reports (desktop apps, D2). */
  function ceilingNow({ ephemeral = false } = {}) {
    return B.ceilingVerdict(Object.values(reg.browsers).map((r) => { const q = profile(r.profileId); return { ...r, label: q?.label, ephemeral: isEph(q) }; }), reg.leases, limits, { others: othersNow(), ephemeral, idleMs: idleMs() });
  }
  /** An ephemeral daemon whose pid is gone idled out (the CLI's own timeout):
   *  recorded `stopped` — not an error; the next verb starts it again. */
  function markEphemeralGone(rec, seenBy = 'the tick') {
    rec.state = 'stopped'; rec.endedAt = now(); rec.stoppedBy = 'idle'; rec.lastError = null;
    rec.note = `the browser idled out (${Math.round(pairsIdleMs(pairsOf(rec.profileId)) / 60000)} min without a command) — the next command starts it again`;
    guard.delete(rec.profileId); live.delete(rec.profileId);
    dirty = true;
    log.log?.(`[browser] ephemeral ${rec.profileId} (${rec.ns}) daemon gone (pid ${rec.pid}${livenessOf(rec) === 'recycled' ? ', now another process' : ''}, seen by ${seenBy}) — recorded stopped (idle), the next verb restarts it`);
    emitLease({ kind: 'browser-stopped', profileId: rec.profileId, why: 'idle', local: true, ...ephEventFields(rec.profileId) }); // lane H: its holder row leaves the digest
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
    return reapOrphan(rec, seenBy);
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
    rec.browser = next; dirty = true;
    // r4 MAJOR 1: the EVIDENCE a heal needs — a browser this record had identified is gone and nothing replaced it (a daemon
    // whose browser was never identifiable — a provider launched some other way — is never "closed", never healed)
    rec.browserLost = next ? null : { pid: b.pid, at: now() };
    log.log?.(`[browser] ${rec.profileId}: its daemon ${rec.pid} ${next ? `relaunched its browser in place — re-captured pid ${next.pid} (${next.dir}${next.devtoolsPort ? ', DevToolsActivePort ' + next.devtoolsPort : ''})` : 'has no browser right now'}${b ? `; the recorded pid ${b.pid} is gone` : ''} (seen by ${seenBy})`);
    return next;
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
  // = 'failing'`). LOW 2 is a KNOWN BOUND, not fixed: the window slides, so a browser closing less often than 3 in 10 min
  // (one every ~4 min) is restarted on every closure for as long as a lease holds it — bounded, never the 5-s storm.
  const HEAL_RETRY_MS = B.HEAL_RETRY_MS;
  const healing = new Map();
  const closedText = (p, why) => `"${p.label}"'s browser was closed (its window or process ended) and could not be started again${why ? ' — ' + why : ''}; stop it from the Browser panel, then run the command again`;
  const leasedNow = (profileId) => reg.leases.some((l) => l.profileId === profileId);
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
  /** r5: the budget is spent — `browser_unstable` (no more relaunches until a stop ends the record) + the ONE notice. r6
   *  MINOR 1: `kind` 'closing' (HEAL_BUDGET relaunches that each produced a browser that closed) or 'failing' (the failed-ask
   *  cap: every ask to start it again failed, `spanMs` the time they spanned) — two verdicts, two sets of words, one code. */
  function markUnstable(rec, p, count, seenBy, { kind = 'closing', spanMs = null } = {}) {
    const failing = kind === 'failing';
    const first = setClosed(rec, { code: 'browser_unstable', error: B.unstableText({ label: p.label, count, windowMs: B.HEAL_WINDOW_MS, kind, spanMs }), ...(failing ? { unstable: 'failing' } : {}) });
    noteHeal(rec, { lastOutcome: 'unstable', unstableCount: count, unstableKind: failing ? 'failing' : null, unstableSpanMs: failing ? spanMs : null });
    if (first) {
      if (failing) log.warn?.(`[browser] ${p.id} "${p.label}": its browser could not be started — ${count} relaunch asks in ${Math.round((spanMs || 0) / 1000)} s all failed (daemon ${rec.pid} alive, seen by ${seenBy}; no browser started) — NOT asked again (browser_unstable) until it is stopped from the Browser panel`);
      else log.warn?.(`[browser] ${p.id} "${p.label}": its browser closed again (daemon ${rec.pid} alive, seen by ${seenBy}) after ${count} restarts in ${Math.round(B.HEAL_WINDOW_MS / 60000)} min — NOT started again (browser_unstable) until it is stopped from the Browser panel`);
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
    const n = B.unstableNotice({ label: p.label, count: L.unstableCount || B.HEAL_BUDGET, windowMs: B.HEAL_WINDOW_MS, kind: L.unstableKind === 'failing' ? 'failing' : 'closing', spanMs: L.unstableSpanMs }); // r6: its own words
    try { userTodos.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', text: n.text, detail: n.detail, sessionName: 'Agent browser' }); }
    catch (e) { return unfiled(`the For-you notice was not filed (${e && e.message}) — tried again on the next pass`); }
    noteHeal(rec, { noticedAt: now() });
    return true;
  }
  function healBrowser(rec, p, seenBy, { force = false } = {}) {
    if (!rec || !p || rec.state !== 'ready' || !isLocalRec(rec) || starting.has(p.id) || stopping.has(p.id) || switching.has(p.id)) return Promise.resolve(null);
    if (livenessOf(rec) !== 'ours') return Promise.resolve(null); // never under a daemon we cannot prove ours (the tick marks it gone)
    if (healing.has(p.id)) return healing.get(p.id);
    // r5 MAJOR 1: an UNSTABLE browser is never started again by itself — not by a verb's force either; only a stop ends it
    if (rec.closed && rec.closed.code === 'browser_unstable') { if (noticeUnstable(rec, p)) commit(); return Promise.resolve(null); }
    if (!force && healGated(rec)) return Promise.resolve(null);
    const pr = (async () => {
      // a browser launched with the provider's own flags (cloak's executable + fingerprint) is never relaunched by a bare
      // `get cdp-url` (a launch view without them would relaunch it as plain chromium on that directory): said, not guessed
      if (rec.launchFlags === true || (rec.launchFlags == null && String(p.provider) === 'cloak')) { // (a record from before r4 carries no flag: its provider says)
        if (setClosed(rec, { code: 'browser_closed', error: closedText(p, `a ${p.provider} browser is started again only by a start (its own launch flags)`) })) { log.warn?.(`[browser] ${p.id} "${p.label}": its browser closed (daemon ${rec.pid} alive, seen by ${seenBy}) — ${rec.closed.error}`); commit(); }
        return null;
      }
      const f = F.lockHolderFacts(p.dir);
      const v = B.profileLockVerdict({ lock: f.lock, holder: f.holder, hostname: os.hostname(), dir: p.dir, minted: mintedDirOf(p, p.dir, null), recorded: null, mark: markOf(p), preMarkAllowed: !rec.mark });
      if (v.kind === 'own-orphan') {
        const e = await endProcess(v.pid, f.holder.starttime);
        log.warn?.(`[browser] ${p.id} "${p.label}": ended its own orphaned browser pid ${v.pid} before healing (${v.why}): ${e}`);
        if (e === 'survived' || e === 'unproven') { setClosed(rec, B.profileLockedRefusal({ label: p.label, dir: p.dir, verdict: { ...v, kind: e === 'survived' ? 'survived' : 'foreign' } })); commit(); return null; }
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
      if (!bud.ok) { markUnstable(rec, p, bud.count, seenBy); commit(); return null; }
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
        if (!fv.ok) { markUnstable(rec, p, fv.count, seenBy, { kind: 'failing', spanMs: fv.spanMs }); commit(); return null; }
        setClosed(rec, { code: 'browser_closed', error: closedText(p, 'its daemon answered no CDP url (the relaunch failed)') }, { retry: true });
        log.warn?.(`[browser] ${p.id} "${p.label}": its browser closed (daemon ${rec.pid} alive, seen by ${seenBy}) and the relaunch failed — ${rec.closed.error} (failed ask ${failed.count}; the tick tries again in ${HEAL_RETRY_MS / 1000} s, a command at once; ${B.HEAL_FAIL_BUDGET} failed asks over ${B.HEAL_FAIL_SPAN_MS / 60000} min ⇒ browser_unstable)`);
        commit();
        return null;
      }
      // r6 MINOR 1: the url answered — THIS is a relaunch (the budget's attempt), and the failed streak ends
      noteHeal(rec, { attempts: [...B.healBudgetVerdict({ attempts: B.healLedger(rec.heals).attempts, now: tAsk }).recent, tAsk], failed: null });
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
      log.log?.(`[browser] ${p.id} "${p.label}": its browser had closed (${lost && lost.pid ? 'pid ' + lost.pid + ' gone, ' : ''}daemon ${rec.pid} alive, seen by ${seenBy}) — started again in that daemon in ${Date.now() - t0} ms: ${b ? 'pid ' + b.pid + (b.devtoolsPort ? ', DevToolsActivePort ' + b.devtoolsPort : '') : 'its CDP url answers (the process is not identified)'} (restart ${B.healLedger(rec.heals).attempts.length} of ${B.HEAL_BUDGET} in ${Math.round(B.HEAL_WINDOW_MS / 60000)} min); the leases follow (mediated: repointed; others: their next command)`);
      commit();
      return b;
    })();
    healing.set(p.id, pr);
    return pr.finally(() => { if (healing.get(p.id) === pr) healing.delete(p.id); });
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
        const v = B.profileLockVerdict({ lock: f.lock, holder: f.holder, hostname: os.hostname(), dir: d, minted: true, recorded: null, mark: markOf(p), preMarkAllowed: !rec.mark });
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
    const v = B.profileLockVerdict({ lock: facts.lock, holder: facts.holder, hostname: os.hostname(), dir: p.dir, minted: mintedDirOf(p, p.dir, recorded), recorded, mark: markOf(p), preMarkAllowed: !(prev && prev.mark) });
    if (v.kind === 'free') return { ok: true, verdict: v };
    if (v.kind === 'own-orphan') {
      const r = await endProcess(v.pid, facts.holder.starttime);
      log.warn?.(`[browser] ${p.id} "${p.label}": ended its own orphaned browser pid ${v.pid} before launching on ${p.dir} (${v.why}${facts.devtoolsPort ? ', DevToolsActivePort ' + facts.devtoolsPort : ''}): ${r}`);
      if (r === 'ended' || r === 'gone') return { ok: true, ended: v.pid };
      return { ok: false, ...B.profileLockedRefusal({ label: p.label, dir: p.dir, verdict: { ...v, kind: r === 'survived' ? 'survived' : 'foreign', why: r === 'unproven' ? 'it changed while being judged' : v.why } }) };
    }
    const rf = B.profileLockedRefusal({ label: p.label, dir: p.dir, verdict: v });
    log.warn?.(`[browser] ${p.id} "${p.label}": NOT launched — ${rf.error}`);
    return { ok: false, ...rf };
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
    const cap = ceilingNow({ ephemeral: true });
    if (cap) throw namedError(cap.code, cap.error, { holders: cap.holders, remedy: cap.remedy });
    const p0 = (async () => {
      const ns = nsOf(profileId);
      const env0 = pairsEnv(pairs);
      const prev = reg.browsers[profileId] || null;
      const rec = { profileId, ns, pid: null, starttime: null, socketDir: null, cdpUrl: null, state: 'starting', startedAt: now(), endedAt: null, lastError: null, stoppedBy: null, lastLeaseDroppedAt: null, startedBy: why,
        hostId: null, external: false, forward: null, remoteCdpUrl: null, dir: p.dir || null, ephemeral: true, envPairs: pairs.slice(), starts: ((prev && prev.starts) || 0) + 1, note: null };
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
        // r4 (MAJOR 2 / LOW 3): the launch carries this conversation's MARK (the keeper's file for it, unless its pairs name
        // their own config — rung D's, marked by browser-env); every later call of this record uses the same file
        rec.mark = p.owner.id;
        // r4 LOW 5: the idle the session's spawn pairs froze (what every command of it carries) — never the setting NOW: a
        // different value makes the binary restart the daemon and its Chrome on the agent's next verb (measured)
        const r = await rt.launch(null, { idleMs: pairsIdleMs(pairs), headed: null, extraEnv: env0 });
        if (!r.ok) {
          const text = (r.stderr || r.error || r.stdout || '').trim().slice(0, 300);
          rec.state = 'failed'; rec.endedAt = now(); rec.lastError = `the browser did not start: ${text}`;
          commit();
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
      captureBrowser(rec, p.dir || null); // r2 M1: the browser it launched (the binary's temp dir on rung N) — ended if its daemon dies
      rec.state = 'ready';
      if (adopted) rec.adoptedAt = now();
      p.lastUsedAt = now(); p.lastBackend = 'chromium';
      commit();
      log.log?.(`[browser] ephemeral ${profileId} "${p.label}" ${adopted ? 'ADOPTED (a daemon was already running under its pairs)' : 'started'} (${why}, ${ns}): daemon pid ${rec.pid ?? '?'}${rec.starttime != null ? '' : ' (starttime unreadable — never signalled by pid)'}`);
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
  async function ensureEphemeral({ browserKey, sessionId = null, envPairs = null, sessionName = '', variant = null } = {}) {
    ensureLoaded();
    const bk = String(browserKey || '');
    if (!B.isBrowserKey(bk) && !B.isChildKey(bk)) throw namedError('bad-request', 'a managed ephemeral browser needs a browser key');
    const v = B.ephemeralPairsVerdict(envPairs, bk);
    if (!v.ok) throw namedError('not_managed', v.why);
    const find = () => reg.profiles.find((x) => isEph(x) && x.owner.id === bk) || null;
    let p = find();
    if (p && retiring.has(p.id)) { try { await retiring.get(p.id); } catch { /* its own log */ } p = find(); }
    let created = false;
    if (!p) {
      p = B.newProfileRecord({ id: mintId(), label: B.ephemeralLabel(sessionName), dir: B.ephemeralDirOf(v.pairs), ephemeral: true, owner: { kind: 'conversation', id: bk }, now: now() });
      reg.profiles.push(p);
      created = true;
    }
    let l = B.findLease(reg.leases, p.id, bk);
    if (!l) { l = { profileId: p.id, browserKey: bk, sessionId: sessionId || null, targetId: null, since: now(), input: 'agent', viewers: 0, carrierLostAt: null, alias: 'ephemeral' }; reg.leases.push(l); }
    else { if (sessionId && l.sessionId !== sessionId) l.sessionId = sessionId; l.carrierLostAt = null; }
    if (l.sessionId) ephSessions.set(p.id, l.sessionId); // VERIFY r1 L2
    ephPairs.set(p.id, v.pairs);
    commit();
    if (created) log.log?.(`[browser] ${bk}${sessionId ? ' (' + sessionId + ')' : ''}: managed ephemeral browser ${p.id} "${p.label}" recorded (rung ${variant || '?'}, ns ${B.sessionNameFor(bk)})`);
    const rec0 = reg.browsers[p.id] || null;
    const wasReady = !!(rec0 && rec0.state === 'ready');
    const browser = await start(p.id, { why: created ? 'first verb' : 'verb' });
    // lane H: a verb on a browser that was ALREADY live (no browser-ready this
    // time — a server restart adopted it, or its tap ended) still asks the
    // seam's listeners to hold a tap on it before the command runs
    if (wasReady && reg.browsers[p.id] === rec0 && rec0.state === 'ready') await settleArming(emitLease({ kind: 'verb', profileId: p.id, local: true, ...ephEventFields(p.id) }));
    ensureTimer();
    return { profile: pview(p), browser, lease: leaseView(l), created };
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
  function headedSetting() { const v = setting('browser.headed', ''); return v === true || v === 'yes' ? true : (v === false || v === 'no' ? false : null); }
  async function start(profileId, { why = 'attach' } = {}) {
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
    if (B.isLiveBrowser(cur)) {
      // verify r3 M1 (a): a live record returned to a verb is re-captured first (the daemon may have relaunched its Chrome)
      // r4 MAJOR 1: …and a daemon with NO browser (the user closed it) is healed here — a verb is asking for it
      if (cur.state === 'ready' && isLocalRec(cur) && !starting.has(profileId) && !stopping.has(profileId)) await followRelaunch(cur, 'a start', { force: true });
      return browserView(cur);
    }
    if (starting.has(profileId)) return starting.get(profileId);
    if (isEph(p)) return startEphemeral(p, { why });
    const cap = ceilingNow({ ephemeral: false });
    if (cap) throw namedError(cap.code, cap.error, { holders: cap.holders });
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
      if (!key || key.source === 'none') throw namedError('backend_no_key', `${p.provider} needs a key and none is configured for ${intId}${key && key.why ? ' (' + key.why + ')' : ''} — open ⚙ → Integrations → ${intId} and paste yours, or use the cluster default there`, { provider: p.provider, integrationId: intId, action: { openIntegration: intId, label: 'open Integrations' } });
      vendorEnv = SW.vendorEnvFor(p.provider, key.values);
    }
    let argvPrefix = [];
    if (!p.host && p.provider === 'cloak') {
      const exe = cloakExecutable();
      if (!exe.ok) throw namedError('backend_unavailable', exe.error, { provider: 'cloak', missing: 'cloakbrowser' });
      argvPrefix = SW.launchArgsFor('cloak', { seed: p.fingerprintSeed, executablePath: exe.path });
    } else if (!p.host) argvPrefix = SW.launchArgsFor(p.provider, {});
    const p0 = (async () => {
      const ns = nsOf(profileId);
      const prevRec = reg.browsers[profileId] || null; // r2 M1: the browser the last launch recorded (its lock holder, if orphaned)
      const rec = { profileId, ns, pid: null, starttime: null, socketDir: null, cdpUrl: null, state: 'starting', startedAt: now(), endedAt: null, lastError: null, stoppedBy: null, lastLeaseDroppedAt: null, startedBy: why,
        // P4: WHERE the process is (a paired machine) / that there is no
        // process of ours at all (an external browser over CDP), the hub-side
        // forward of its loopback port, and the machine's own url + dir
        hostId: p.host || null, external: !(B.providerRow(p.provider) || {}).starts, forward: null, remoteCdpUrl: null, dir: null };
      // r5 LOW 3: the LAUNCH-MARK lineage rides every new record (a refused start too) — a profile once launched with the
      // mark never falls back to the pre-mark rule, whatever record comes next (set again at the launch below)
      if (prevRec && prevRec.mark) rec.mark = prevRec.mark;
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
        try { r = await acc().call(p.host, 'start', { profileId, idleMs: 0, headed: headedSetting() }); } catch (e) { throw failed(e.code || 'launch_failed', `${p.host}: ${e.message}`); }
        if (!r.cdpPort) throw failed('launch_failed', `${p.host} started the browser but reported no CDP url — the hub cannot reach it`);
        let fwd;
        try { fwd = await acc().forwardCdp(p.host, r.cdpPort, { remoteUrl: r.cdpUrl }); } catch (e) { throw failed(e.code || 'host_unavailable', `${p.host}: ${e.message}`); }
        rec.pid = r.pid; rec.starttime = r.starttime; rec.socketDir = r.socketDir; rec.dir = r.dir || null; rec.remoteCdpUrl = r.cdpUrl; rec.cdpUrl = fwd.url; rec.forward = { remotePort: r.cdpPort, localPort: fwd.localPort };
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
      const headed0 = headedSetting();
      const launchEnv = { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0', ...(headed0 === true ? { AGENT_BROWSER_HEADED: '1' } : headed0 === false ? { AGENT_BROWSER_HEADED: '0' } : {}) };
      rec.launchEnv = launchEnv;
      // VERIFY r2 M1: BEFORE EVERY LAUNCH ON THE DIRECTORY — a dead daemon's browser is ended first (in flight: waited),
      // then the lock's holder judged: the keeper's own orphan ended, anything else refused `profile_locked` by name
      if (reaping.has(profileId)) { try { await reaping.get(profileId); } catch { /* its own log */ } }
      const lk = await clearProfileLock(p, ns, prevRec);
      if (!lk.ok) { const e = failed(lk.code, lk.error); e.holderPid = lk.holderPid; throw e; }
      rec.mark = p.id; // r4 (MAJOR 2): the launch carries this profile's MARK (machine-<id>.json); every later keeper call keeps that file
      rec.launchFlags = argvPrefix.length > 0; // r4: a provider's own launch flags (cloak) — a heal's bare re-ask would not repeat them
      const stamp0 = F.dirLaunchStamp(p.dir); // r5 MAJOR 1 (iii): the directory before this launch
      const r = await rt.launch(ns, { dir: p.dir, idleMs: 0, headed: headed0, extraEnv: vendorEnv, argvPrefix });
      if (!r.ok) {
        const text = (r.stderr || r.error || r.stdout || '').trim().slice(0, 300);
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
        rec.browserLost = { pid: null, at: now() };
        setClosed(rec, { code: 'browser_closed', error: closedText(p, 'it died right after it started (a crash at startup?)') }, { retry: true });
        noteHeal(rec, { lastOutcome: 'unidentified' });
        log.warn?.(`[browser] ${profileId} "${p.label}": started (daemon pid ${rec.pid}) but no browser process holds ${p.dir} — it died at birth: browser_closed (a command retries at once, the tick in ${HEAL_RETRY_MS / 1000} s)`);
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
      log.log?.(`[browser] ${profileId} "${p.label}" started (${why}, ${p.provider}${vendorEnv && Object.keys(vendorEnv).length ? ', key from ' + (key ? key.source : '?') : ''}): daemon pid ${rec.pid ?? '?'}${rec.starttime != null ? '' : ' (starttime unreadable — never signalled by pid)'}${rec.cdpUrl ? ', cdp known' : ', no cdp url'}${p.lastChromiumMajor ? ', chromium ' + p.lastChromiumMajor : ''}`);
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
        commit();
        return browserView(rec);
      }
      // verify r3 M1 (a): BEFORE the first signal the record follows the daemon's in-place relaunch — the browser the
      // SIGKILL below might orphan is the one running NOW, not the one launched
      recaptureBrowser(rec, 'the stop');
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
      else if (why !== 'user') rec.lastError = why;
      if (left) rec.lastError = `${rec.lastError ? rec.lastError + '; ' : ''}${left}`;
      guard.delete(profileId); live.delete(profileId);
      if (mediator) mediator.repoint(profileId, null); // P6
      log.log?.(`[browser] ${profileId} "${p ? p.label : profileId}" stopped (${why})${left ? ' — NOT clean: ' + left : ''}`);
      handBackOnStop(profileId, p, why); // r6 LOW 3
      commit();
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
  async function attach({ profile: ref, profileId, browserKey, sessionId = null, taskIds = [], alias = '' } = {}) {
    ensureLoaded();
    const p = profileId ? profile(profileId) : profileByRef(ref);
    if (!p) throw namedError('not-found', `no profile ${profileId || ref}`);
    if (p.ambiguous) throw namedError('ambiguous', `"${ref}" names ${p.ambiguous.length} profiles (${p.ambiguous.join(', ')}) — use the id`);
    if (isEph(p)) throw namedError('not_attachable', `"${p.label}" is a conversation's managed ephemeral browser — a bare \`vibespace-browser <verb>\` of that conversation lands on it; it is never attached by id`);
    if (switching.has(p.id)) { const rr = SW.restartingRefusal(p); throw namedError(rr.code, rr.error); }
    const d = B.decideAttach({ profile: p, leases: reg.leases, browserKey, sessionId, now: now(), taskIds });
    if (!d.ok) throw namedError(d.code, d.error);
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
    const browser = await start(p.id, { why: `attach ${browserKey}` });
    // r4 MAJOR 1: a browser that was closed and could not be started again is refused BY NAME (the user's own browser
    // holds the directory: profile_locked naming its pid; else browser_closed) — never a dead port handed to the agent
    { const cr = closedRefusalOf(p.id); if (cr) throw namedError(cr.code, cr.error, cr.holderPid ? { holderPid: cr.holderPid } : {}); }
    // naive study 2: a non-mediated lease reaches the keeper's browser over its CDP url — resolved BEFORE the
    // lease is taken; none ⇒ refused by name (never the directory: a second Chrome on it dies on SingletonLock)
    const leaseCdp = isMediated(p) ? null : await leaseCdpUrl(p.id);
    if (!isMediated(p) && !leaseCdp) throw namedError('browser_no_cdp', noCdpError(p));
    if (d.created) reg.leases.push(d.lease);
    else reg.leases = reg.leases.map((l) => (l.profileId === p.id && l.browserKey === browserKey ? d.lease : l));
    p.lastUsedAt = now();
    commit();
    log.log?.(`[browser] ${browserKey}${sessionId ? ' (' + sessionId + ')' : ''} ${d.created ? 'attached to' : (d.resumed ? 're-carries its lease on' : 'already holds')} ${p.id} "${p.label}" (${d.others} other session(s) on it)`);
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
      const g = await mediator.grantFor({ profileId: p.id, browserKey, upstream: rec.cdpUrl, targetIds: d.lease.targetId ? [d.lease.targetId] : [], paused: () => inputStateFor(browserKey, p.id).input === 'user' });
      return { lease: leaseView(d.lease), created: d.created, resumed: d.resumed, others: d.others, profile: pview(p), browser, mediated: true, env: M.mediatedEnvFor({ browserKey, profileId: p.id, url: g.url, idleMs: idleMs() }), cdpUrl: g.url, pinTab, note: M.mediationSentence({ profileLabel: p.label, others: d.others }) };
    }
    // P4: a browser REACHED (external / on a paired machine) is named by the
    // hub-side CDP url, never by a directory — the pair rides the env only
    // (the subshell and the `--` form), `use --print` withholds it (§5.1)
    return { lease: leaseView(d.lease), created: d.created, resumed: d.resumed, others: d.others, profile: pview(p), browser, mediated: false, env: B.attachedEnvFor({ browserKey, profileId: p.id, cdpUrl: leaseCdp }), cdpUrl: rec ? rec.cdpUrl : null, pinTab };
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
    const rec = reg.browsers[id];
    if (rec && !d.others) rec.lastLeaseDroppedAt = now();
    commit();
    const eph = !!evFields.ephemeral;
    log.log?.(`[browser] ${browserKey} detached from ${id} (${d.others} lease(s) remain${eph ? '; it is this conversation\'s managed ephemeral browser — stopped and removed now, the next verb starts it again' : (!d.others && rec && B.isLiveBrowser(rec) ? `; the browser idles out in ${Math.round(idleMs() / 60000)} min unless re-attached` : '')})`);
    emitLease({ kind: 'detach', browserKey, profileId: id, sessionId: d.lease ? d.lease.sessionId || null : null, ...evFields });
    // VERIFY r1 L2: an ephemeral browser has no life without its lease (the next reconcile retired it silently) —
    // the detach retires it itself, now, and SAYS so (why 'user' — an explicit act, on §54b's closed list); a verb meanwhile waits on the retire and starts a fresh one
    if (eph) {
      retireEphemeral(id, 'user').catch((e) => log.warn?.(`[browser] ephemeral ${id}: retire after detach failed — ${e && e.message}`));
      return { lease: leaseView(d.lease), others: d.others, ephemeral: true, retiring: true, note: EPHEMERAL_DETACH_NOTE };
    }
    return { lease: leaseView(d.lease), others: d.others };
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
  function takeover({ browserKey, profileId = null, viewerId, sessionId = null, holderAlive = true } = {}) {
    ensureLoaded();
    const k = inputKey(browserKey, profileId);
    const d = T.decideTakeover({ state: inputs.get(k) || null, viewerId, now: now(), holderAlive });
    if (!d.ok) return d;
    inputs.set(k, d.state);
    mirrorLeaseInput(browserKey, profileId, 'user');
    ensureTimer();
    if (!d.already) {
      log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ' (ephemeral)'}: the user took over (viewer ${viewerId}) — agent commands are refused with browser_paused until the handback`);
      emitInput({ kind: 'takeover', browserKey, profileId: profileId || null, sessionId, state: { ...d.state }, cause: null, url: d.state.url || '' });
    }
    return { ok: true, already: !!d.already, state: inputStateFor(browserKey, profileId) };
  }
  /**
   * Control goes back to the agent. `cause` ∈ browser-takeover.HANDBACK_CAUSES;
   * `url` is the page the human left it on. The lease flip is a STATE CHANGE
   * and happens regardless of what the announcer later decides to deliver.
   */
  function handback({ browserKey, profileId = null, viewerId = null, cause = 'explicit', url = '', sessionId = null } = {}) {
    ensureLoaded();
    const k = inputKey(browserKey, profileId);
    const d = T.decideHandback({ state: inputs.get(k) || null, viewerId, cause, now: now(), url });
    if (!d.ok) return d;
    inputs.set(k, d.state);
    mirrorLeaseInput(browserKey, profileId, 'agent');
    log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ' (ephemeral)'}: handed back to the agent (${d.cause}${d.byHolder ? '' : ', not by the holder'}) after ${Math.round(d.heldMs / 1000)} s${d.state.url ? ' at ' + d.state.url : ''}`);
    emitInput({ kind: 'handback', browserKey, profileId: profileId || null, sessionId, state: { ...d.state }, cause: d.cause, url: d.state.url || '', heldMs: d.heldMs, byHolder: d.byHolder });
    return { ok: true, cause: d.cause, heldMs: d.heldMs, byHolder: d.byHolder, state: inputStateFor(browserKey, profileId) };
  }
  /** The bridge forwarded an input from the holder — the idle clock restarts. Cheap, in memory. */
  function noteUserInput(browserKey, profileId = null, at = null) {
    const k = inputKey(browserKey, profileId);
    const s = inputs.get(k);
    if (!s || s.input !== 'user') return false;
    s.lastUserInputAt = Number(at) || now();
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
  /** The typed refusal an agent command gets while the user drives, or null. */
  function pausedVerdictFor(browserKey, profileId = null, { handles = [] } = {}) {
    const k = inputKey(browserKey, profileId);
    const s = inputs.get(k);
    if (!s || s.input !== 'user') return null;
    const p = profileId ? profile(profileId) : null;
    return T.browserPausedRefusal({ state: s, label: p ? p.label : null, handles, now: now(), idleMs: takeoverIdleMs() });
  }
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
    const had = m.has(confirmation.id);
    m.set(confirmation.id, { ...confirmation });
    pending.set(k, m);
    ensureTimer();
    if (!had) {
      log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''}: action ${JSON.stringify(confirmation.action)} is waiting for a confirmation (${confirmation.id}; the daemon auto-denies after ${Math.round(T.CONFIRM_TTL_MS / 1000)} s)`);
      emitConfirmation({ kind: 'pending', browserKey, profileId: profileId || null, sessionId, confirmation: { ...confirmation } });
    }
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
  async function answerConfirmation({ browserKey, profileId = null, id, decision, envPairs = null } = {}) {
    ensureLoaded();
    const a = T.decisionArgv(id, decision);
    if (!a.ok) return a;
    let r;
    if (profileId) {
      const p = profile(profileId);
      if (!p) return { ok: false, code: 'not-found', error: `no profile ${profileId}` };
      if (isMediated(p)) {
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
      return { ...l, label: l.label || (p ? p.label : l.profileId), browser: browserView(reg.browsers[l.profileId]), others: reg.leases.filter((x) => x.profileId === l.profileId && x.browserKey !== l.browserKey).length };
    });
    const set = setFor(browserKey);
    return { browserKey, leases, pin: pinFor(browserKey), defaultProfile: set.defaultId, attachments: set.attachments, handles: set.handles, children: set.children, fingerprint: set.fingerprint, told: reg.told[String(browserKey || '')]?.fingerprint || null,
      // P3 (§4.3): who drives each of this conversation's browsers, and what is waiting on a confirmation
      inputs: inputsFor(browserKey), input: inputSummaryFor(browserKey), pending: pendingAllFor(browserKey),
      // takeover C3: this conversation's managed ephemeral browser (null until its first page verb)
      ephemeral: ephemeralFor(browserKey) };
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

  // ── §3.7 the attachment set + handles; §3.8 layer ① the one-time refusal ──
  function childrenOf(browserKey) {
    return Object.entries(reg.children).filter(([k, c]) => c && B.parentKeyOf(k) === browserKey && k !== browserKey).map(([k, c]) => ({ handle: k, since: c.since || 0, sessionId: c.sessionId || null }));
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
  /**
   * WHICH browser a command issued through the CLI acts on (§3.7), after
   * §3.8 layer ①'s check: if the set's fingerprint moved since this session
   * was last told, the command is refused ONCE with `profile_changed` (was →
   * now) and the session is told; every other outcome is `resolveHandle`'s.
   * Never throws: the answer is a typed verdict the route maps to a status.
   */
  function resolveFor({ browserKey, handle = '', subagent = false } = {}) {
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
      const paused = pausedVerdictFor(bk, v.kind === 'attachment' ? v.attachment.profileId : null, { handles: v.handles || [] });
      if (paused) { log.log?.(`[browser] ${bk}: refused with browser_paused (the user drives${v.kind === 'attachment' ? ' ' + v.attachment.profileId : ' the ephemeral browser'})`); return paused; }
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
    reg.leases = reg.leases.filter((l) => l.browserKey !== handle);
    commit();
    for (const p of reg.profiles.filter((x) => isEph(x) && x.owner.id === handle)) retireEphemeral(p.id, 'child handle dropped').catch(() => { });
    return true;
  }
  /** §3.7's audit: `{at, sessionId, browserKey, profileId, verb, ok}` and
   *  nothing else — never a `fill`'s content. Append-only, best-effort. */
  function audit({ sessionId = null, browserKey = null, profileId = null, verb = null, ok = true } = {}) {
    const line = B.auditLine({ at: now(), sessionId, browserKey, profileId, verb: B.auditVerbOf(Array.isArray(verb) ? verb : [verb]), ok });
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
  function adoptScratch({ label, scratchDir, owner = null } = {}) {
    ensureLoaded();
    const v = B.validateProfileInput({ label }, { existing: named() });
    if (!v.ok) throw namedError(v.code, v.error);
    let st = null;
    try { st = fs.statSync(scratchDir); } catch { /* below */ }
    if (!st || !st.isDirectory()) throw namedError('adopt_failed', `this session's browser directory ${scratchDir} does not exist — nothing to adopt (the browser never launched, or it is on the ephemeral rung)`);
    const id = mintId();
    const target = path.join(homeDir, '.agent-browser', B.profileDirName(id));
    try { fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); fs.renameSync(scratchDir, target); }
    catch (e) { throw namedError('adopt_failed', `could not move ${scratchDir} to ${target}: ${e.message}${e.code === 'EXDEV' ? ' (different filesystems — create a new profile and log in again instead)' : ''}`); }
    try { fs.chmodSync(target, 0o700); } catch { /* best effort */ }
    const rec = B.newProfileRecord({ id, ...v.value, dir: target, owner, legacy: false, now: now() });
    reg.profiles.push(rec);
    commit();
    log.log?.(`[browser] profile ${id} "${rec.label}" ADOPTED from ${scratchDir} → ${target} (owner ${rec.owner.kind}${rec.owner.id ? ' ' + rec.owner.id : ''})`);
    return B.publicProfileView(rec);
  }

  // ── P4 second half (§7.4): the live backend switch, the agent's `blocked` claim, per-site memory ──
  /** The `cloakbrowser` binary this machine has: the setting first (an
   *  explicit path), else PATH — `{ok, path}` or `{ok:false, error}` naming
   *  what is missing (never a download: installing it is a user act that
   *  comes AFTER §7.2.1's measurement). */
  const usableExe = (f) => { try { fs.accessSync(f, fs.constants.X_OK); return fs.statSync(f).isFile(); } catch { return false; } };
  const whichOnPath = (name) => { for (const d of String(env().PATH || process.env.PATH || '').split(':')) { if (!d) continue; const f = path.join(d, name); if (usableExe(f)) return f; } return null; };
  function cloakExecutable() {
    const cfg = String(setting('browser.cloak.executablePath', '') || '').trim();
    if (cfg) return usableExe(cfg) ? { ok: true, path: cfg } : { ok: false, error: `cloakbrowser is not runnable at the configured path ${cfg} (browser.cloak.executablePath) — install the pinned package first, after the §7.2.1 measurement` };
    const onPath = whichOnPath('cloakbrowser');
    if (onPath) return { ok: true, path: onPath };
    // rung 3: the package THIS keeper installed under its own prefix (§7.4 failure form (1)) — its bin read off the package's own package.json, never a guessed name
    const mine = installedCloakBin();
    if (mine && usableExe(mine)) return { ok: true, path: mine };
    return { ok: false, error: 'cloakbrowser is not installed on this machine (not on PATH, browser.cloak.executablePath is empty, and nothing under data/browser-tools) — installing it is a user act that comes AFTER the §7.2.1 egress measurement; nothing is downloaded by asking' };
  }
  // ── §7.4 failure form (1): the INSTALL action — "measure first, then install" ──
  // The verdict is PURE (src/browser-switch.js installVerdict) over the §7.2.1
  // proof record, the executable rung and the single flight; this half only
  // ACTS on an ok verdict: ONE `npm install --prefix <data>/browser-tools
  // cloakbrowser@<the measured version>` with its output in a log file, its
  // exit reported through the profiles broadcast, and the resulting executable
  // found by rung 3 above. Nothing is downloaded on a refusal (the design's
  // "never fetch the 200 MB when the user did not ask"), and the version is
  // the one the measurement describes — an unpinned download would silently
  // invalidate the record the install is gated on.
  const installDir = path.join(dataDir, 'browser-tools');
  const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;
  const installState = { running: false, startedAt: null, finishedAt: null, exitCode: null, spec: null, pid: null, log: path.join(installDir, 'install.log'), error: null };
  const proofOf = () => (providers && providers.proof) || B.CLOAK_EGRESS_PROOF;
  /** The executable the installed package exposes, read from ITS OWN package.json `bin`. */
  function installedCloakBin() {
    const pkgDir = path.join(installDir, 'node_modules', SW.CLOAK_PACKAGE);
    let pkg = null;
    try { pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')); } catch { return null; }
    const rel = SW.binFromPackageJson(pkg);
    return rel ? path.join(pkgDir, rel) : null;
  }
  function installVerdict({ host = null } = {}) {
    const proof = proofOf();
    const v = SW.installVerdict({ proof, proofOk: B.proofVerdict(proof), exe: host ? null : cloakExecutable(), host, running: installState.running });
    return { ...v, prefix: installDir, state: { ...installState } };
  }
  async function installCloak() {
    const v = installVerdict();
    if (!v.ok) throw namedError(v.code, v.error, { proof: v.proof || null, path: v.path || null });
    const npm = whichOnPath('npm');
    if (!npm) throw namedError('install_unavailable', `npm is not on PATH — install ${v.spec} by hand and point browser.cloak.executablePath at its executable`);
    fs.mkdirSync(installDir, { recursive: true, mode: 0o700 });
    const argv = SW.installArgv({ spec: v.spec, prefix: installDir });
    const logFd = fs.openSync(installState.log, 'a', 0o600);
    let child;
    try {
      const e = {}; for (const [k2, v2] of Object.entries(env() || {})) if (v2 != null) e[k2] = String(v2);
      if (!e.PATH) e.PATH = process.env.PATH || '';
      child = spawn(npm, argv, { cwd: installDir, env: e, stdio: ['ignore', logFd, logFd] });
    } catch (e) { try { fs.closeSync(logFd); } catch {} throw namedError('install_unavailable', `npm could not be started: ${e.message}`); }
    try { fs.closeSync(logFd); } catch {}
    Object.assign(installState, { running: true, startedAt: now(), finishedAt: null, exitCode: null, spec: v.spec, pid: child.pid || null, error: null });
    log.log?.(`[browser] installing ${v.spec} into ${installDir} (npm ${npm}, pid ${child.pid ?? '?'}, log ${installState.log}) — a user act, after the §7.2.1 measurement (${v.proof && v.proof.date ? 'record dated ' + v.proof.date : 'measured'})`);
    const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, INSTALL_TIMEOUT_MS);
    if (typeof timer.unref === 'function') timer.unref();
    child.on('error', (e) => { clearTimeout(timer); Object.assign(installState, { running: false, finishedAt: now(), exitCode: null, error: e.message }); log.warn?.(`[browser] install ${v.spec} failed to start: ${e.message}`); notify(); });
    child.on('exit', (code, sig) => {
      clearTimeout(timer);
      Object.assign(installState, { running: false, finishedAt: now(), exitCode: code, error: code === 0 ? null : `npm exited ${code ?? sig} — see ${installState.log}` });
      const bin = installedCloakBin();
      log.log?.(`[browser] install ${v.spec} ${code === 0 ? 'finished' : 'failed (' + (code ?? sig) + ')'}; executable: ${bin && usableExe(bin) ? bin : 'not found under ' + installDir}`);
      notify();
    });
    return { ok: true, started: true, spec: v.spec, version: v.version, prefix: installDir, log: installState.log, pid: child.pid || null };
  }
  /** The directory's own `Last Version` stamp (read-only): the major that
   *  actually wrote it, the primary evidence beside the registry's copy. */
  function readDirMajor(dir) {
    if (!dir) return null;
    try { return SW.parseLastVersion(fs.readFileSync(path.join(String(dir), 'Last Version'), 'utf8')); } catch { return null; }
  }
  const inputsView = () => { const o = {}; for (const [k, v] of inputs) o[k] = { input: v.input }; return o; };
  /** THE SWITCHER'S VIEW of one profile: every backend row enabled or
   *  disabled WITH ITS REASON, the SOURCE chip from the masked view, the seat
   *  reading in its three states, the fingerprint sentence, the versions the
   *  ladder read, the blocked claims and the site hints. */
  function switcherView(profileId) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p) throw namedError('not-found', `no profile ${profileId}`);
    const dirMajor = readDirMajor(p.dir);
    const rows = SW.switcherRows({ profile: p, providerIds: B.providerIds(), rowOf, controlOf: control, capabilityRefusalOf: B.capabilityRefusal, sources: (id) => keysOf().sourceOf(id), seats: reg.seats, majors: reg.majors, dirMajor, now: now(), runningOf });
    return { profile: B.publicProfileView(p), chip: chipFor(p), rows, seats: seatStates(), siteHints: reg.siteHints.map((h) => ({ ...h })), blocked: blockedFor({ profileId: p.id }), leases: leasesOn(p.id), switching: switching.has(p.id), versions: { recorded: p.lastChromiumMajor, dir: dirMajor, majors: { ...reg.majors } }, install: installVerdict({ host: p.host || null }) };
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
  async function switchBackend({ profileId, target, by = { kind: 'user' }, browserKey = null, sessionId = null, confirmDowngrade = false, makeDefault = false } = {}) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p || isEph(p)) throw namedError('not-found', `no profile ${profileId}`);
    if (switching.has(p.id)) { const rr = SW.restartingRefusal(p); throw namedError(rr.code, rr.error); }
    const leases = reg.leases.filter((l) => l.profileId === p.id);
    const v = SW.switchVerdict({
      profile: p, target, rowOf, controlOf: control, capabilityRefusalOf: B.capabilityRefusal,
      resolveKey: (id) => keysOf().keyFor(id), // the ONE resolve of the gate — a masked source is all it keeps
      seats: reg.seats, majors: reg.majors, dirMajor: readDirMajor(p.dir), confirmed: !!confirmDowngrade,
      leases, inputs: inputsView(), by, byKey: browserKey, now: now(), hex: crypto.randomBytes(4).toString('hex'), runningOf,
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
      const browser = await start(p.id, { why: `switch ${from} → ${to}` });
      const ns = nsOf(p.id);
      const pinTab = !!(bf.lastVersion() !== undefined && B.floorVerdict(bf.lastVersion()).sharedProfiles);
      for (const l of leases) {
        const url = l.lastUrl || 'about:blank';
        let targetId = null, ok = false, error = null;
        try {
          // naive study 2: the keeper's own re-open reaches the NEW browser over its CDP url under the lease's session —
          // never the directory (a second Chrome on it dies on SingletonLock); a mediated lease's tab is admitted below
          const o = await leaseCliOpts(p.id, l.browserKey);
          if (!o) throw new Error(noCdpError(p));
          const r = await rt.exec(ns, [...(pinTab ? ['--pin-tab'] : []), 'open', url], o);
          ok = !!r.ok;
          const d = r.json && r.json.data && typeof r.json.data === 'object' ? r.json.data : null;
          targetId = d ? (d.targetId || d.tabId || d.id || null) : null;
          if (!ok) error = (r.stderr || r.error || '').trim().slice(0, 200) || 'open failed';
        } catch (e) { error = String(e && e.message); }
        // the SAME lease object: only targetId is re-minted (§7.4 step 5)
        l.targetId = targetId ? String(targetId) : null;
        l.reopenedAt = now();
        if (mediator && isMediated(p) && l.targetId) mediator.admitTarget(p.id, l.browserKey, l.targetId); // P6: the re-opened tab is the lease's
        reopened.push({ browserKey: l.browserKey, url, ok, targetId: l.targetId, error });
      }
      if (v.ladder && Number.isInteger(v.ladder.recordMajor)) p.lastChromiumMajor = Math.max(Number(p.lastChromiumMajor) || 0, v.ladder.recordMajor);
      commit();
      log.log?.(`[browser] ${p.id} "${p.label}" switched ${from} → ${to} by ${by.kind}${browserKey ? ' ' + browserKey : ''}: ${reopened.length} lease tab(s) re-opened${v.seedMinted ? ', seed minted' : ''}${v.ladder && v.ladder.disagreement ? ', version stamps disagreed (' + v.ladder.disagreement.recorded + ' vs ' + v.ladder.disagreement.dir + ', took ' + v.ladder.disagreement.taken + ')' : ''}`);
      return { ok: true, mode: 'switch', from, to, seed: p.fingerprintSeed, seedMinted: v.seedMinted, fingerprint: v.fingerprint, ladder: v.ladder, seats: v.seats, reopened, browser, chip: chipFor(p), profile: B.publicProfileView(p) };
    } finally { switching.delete(p.id); commit(); }
  }
  /** `vibespace-browser blocked` — record the agent's CLAIM (who, which URL,
   *  why, what evidence, which tier it suggests). Bounded; one per
   *  (conversation, host). The server never manufactures one. */
  function blocked({ url, why = '', evidence = '', tier = null, browserKey = null, sessionId = null, profileId = null } = {}) {
    ensureLoaded();
    const v = SW.blockedClaim({ url, why, evidence, tier, browserKey, sessionId, profileId, at: now(), id: 'bl-' + crypto.randomBytes(4).toString('hex') });
    if (!v.ok) throw namedError(v.code, v.error);
    reg.blocked = [...reg.blocked.filter((b) => !(b.browserKey === v.value.browserKey && b.host === v.value.host)), v.value].slice(-50);
    commit();
    log.log?.(`[browser] ${browserKey || '?'} claims blocked on ${v.value.host}${why ? ' (' + why + ')' : ''}, suggests tier ${v.value.tier}`);
    return { claim: v.value, text: SW.blockedText(v.value), hint: SW.siteHintFor(reg.siteHints, v.value.host) };
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
    const live = liveKeys();
    const r = B.reconcileLeases({ leases: reg.leases, liveKeys: live, now: now(), graceMs });
    for (const d of r.dropped) {
      const rec = reg.browsers[d.lease.profileId];
      if (rec && !r.kept.some((l) => l.profileId === d.lease.profileId)) rec.lastLeaseDroppedAt = now();
      if (d.lease.profileId) dropInputsFor(d.lease.browserKey, d.lease.profileId); // P3
      if (mediator && d.lease.profileId) mediator.revoke({ profileId: d.lease.profileId, browserKey: d.lease.browserKey }); // P6
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
      if (v.state === 'ready') { rec.state = 'ready'; rec.adoptedAt = now(); recaptureBrowser(rec, 'boot'); log.log?.(`[browser] adopted ${rec.profileId} "${p ? p.label : ''}" (daemon pid ${rec.pid})`); }
      else {
        rec.state = v.state; rec.lastError = v.lastError; rec.endedAt = now(); log.warn?.(`[browser] ${rec.profileId} ${v.state} at boot: ${v.lastError}`);
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
    commit();
    if (Object.values(reg.browsers).some(B.isLiveBrowser) || reg.leases.length) startTimer();
    return { droppedLeases: r.dropped.length, browsers: Object.values(reg.browsers).filter(B.isLiveBrowser).length };
  }

  // ── the tick: carrier grace, idle, the resource REPORT ──
  async function tick() {
    ensureLoaded();
    const t = now();
    const r = reconcile({ graceMs: B.LEASE_DROP_GRACE_MS });
    if (r.dropped.length || r.stamped.length) dirty = true;
    await r.retired;
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
      if (isLocalRec(rec) && rec.state === 'ready') { await followRelaunch(rec, 'the tick', { heal: reg.leases.some((l) => l.profileId === rec.profileId) }); if (stopping.has(rec.profileId) || reg.browsers[rec.profileId] !== rec) continue; }
      const idle = B.browserIdle(rec, reg.leases, t, idleMs());
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
        g.prev = s ? { at: t, cpuTicks: s.cpuTicks } : null; g.hotSince = v.hotSince;
        const lvl = RG.reportTransition(g.report, v, { now: t, limits: lim }); g.report = lvl.state;
        guard.set(rec.profileId, g);
        if (s) { const was = live.get(rec.profileId); live.set(rec.profileId, { cpuPct: v.cpuPct, memBytes: s.memBytes, memMetric: s.memMetric, rssBytes: s.rssBytes /* deprecated: ΣVmRSS, never judged — one release */, pids: s.pids.length, over: v.over, since: v.over ? ((was && was.over && was.since) || t) : null, sampledAt: t }); dirty = true; }
        if (v.memGuard === 'unavailable' && !g.memOffSaid) { g.memOffSaid = true; log.warn?.(`[browser] ${RG.memGuardOffLine(rec.profileId, s)}`); }
        const label = p ? p.label : rec.profileId;
        if (lvl.fire) {
          log.warn?.(`[browser] ${rec.profileId} "${label}" (${s.pids.length} process(es)) is over the reporting threshold: ${v.over} — reported, left running`);
          try { getTelemetry()?.record?.({ kind: 'event', name: RESOURCE_METRIC, detail: `${label}: ${v.over}`, value: Math.round((s.memBytes || 0) / 1048576) }); } catch { /* optional */ }
        }
        if (lvl.notify) {
          const who = isEph(p) ? `The agent browser of "${label}"` : `The agent browser of profile "${label}"`;
          let delivered;
          try { delivered = serverNotice?.(`browser-resource:${rec.profileId}:${lvl.state.crossings}`, RG.resourceNoticeText({ who, where: 'Browser panel', verdict: v, sample: s }), { level: 'warn' }); } catch (e) { log.warn?.(`[browser] ${rec.profileId}: the resource notice failed: ${e && e.message}`); }
          g.report = RG.reportDelivery(g.report, delivered);
        }
      }
    }
    await Promise.allSettled([...reaping.values()]); // r2 M1: every orphan this tick found is ended before it returns
    if (dirty) commit();
    // P3 (§4.3): a takeover somebody walked away from hands back by itself, a
    // pending confirmation the daemon has already auto-denied is forgotten.
    sweepIdleTakeovers(t);
    sweepPending();
    if (!Object.values(reg.browsers).some(B.isLiveBrowser) && !reg.leases.length && !inputs.size && !pending.size) stopTimer();
  }
  function startTimer() {
    if (timer) return;
    timer = setInterval(() => { tick().catch((e) => log.warn?.(`[browser] tick failed: ${e.message}`)); }, tickMs);
    if (timer.unref) timer.unref();
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  /** Timers only — the browsers SURVIVE a VibeSpace exit by design (adopted next boot). */
  function shutdown() { stopTimer(); if (dirty) save(); try { mediator?.shutdown?.(); } catch { /* P6: the proxy is this keeper's to end */ } }
  const ensureTimer = () => { if (Object.values(reg.browsers).some(B.isLiveBrowser) || reg.leases.length || inputs.size || pending.size) startTimer(); };
  const attachTimed = async (a) => { const r = await attach(a); ensureTimer(); return r; };

  // ── P2 (§4.2): the stream port of ONE live-view target ──────────────────
  /**
   * The port the live view bridges to, for a target `browser-stream.streamTargetFor`
   * decided: an ATTACHMENT (the profile's daemon, started if it is not live —
   * a view of a stopped browser is a start, like an attach — asked under the
   * lease's own session name `vs-<browserKey>`) or the session's EPHEMERAL
   * browser (asked with the very pairs it was spawned with; no namespace of
   * ours, nothing started by us). Never throws: `{ok, port, error, code}`.
   */
  async function streamPortFor(target) {
    ensureLoaded();
    if (!target || !target.ok) return { ok: false, port: null, code: (target && target.code) || 'bad-request', error: (target && target.error) || 'no target' };
    const S = require('../browser-stream.js');
    if (target.kind === 'ephemeral') {
      // lane H (measured on 0.32.0: `stream status` with no daemon STARTS one under the pairs): a conversation's
      // MANAGED ephemeral browser that is not running is refused BY NAME — a view of it (the auto-opened one
      // reconnecting after an idle-out, the recorder's tap) must never launch a daemon the keeper does not hold;
      // its next verb starts it, its holder row returns and the view reconnects
      const bk = String(target.ns || '').replace(/^vs-/, '');
      if (bk) judgeEphemeral(bk, 'a view asked for its port'); // VERIFY r1 H2: the PROCESS, not the record (a ready record lies until the tick)
      const e = bk ? ephemeralFor(bk) : null;
      { const eRec = e && e.state === 'ready' ? reg.browsers[e.profileId] : null; if (eRec && isLocalRec(eRec) && !starting.has(e.profileId) && !stopping.has(e.profileId)) recaptureBrowser(eRec, 'a view asked for its port'); } // verify r3 M1 (a)
      if (e && e.state !== 'ready') return { ok: false, port: null, code: 'browser_stopped', error: e.state === 'starting' ? 'this conversation\'s browser is starting — the view connects when it is ready' : 'this conversation\'s browser is not running (it idled out or was stopped) — the agent\'s next browser command starts it again, and this view reconnects then' };
      const r = await rt.streamPort(null, { extraEnv: S.pairsToEnv(target.envPairs) });
      return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: 'stream_unavailable', error: r.error };
    }
    const p = profile(target.profileId);
    if (!p) return { ok: false, port: null, code: 'not-found', error: `no profile ${target.profileId}` };
    // P4: the stream server is the LOCAL daemon's; a browser reached over CDP
    // or running on a paired machine has none the hub can bridge yet
    if (p.host || !(B.providerRow(p.provider) || {}).starts) return { ok: false, port: null, code: 'stream_unavailable', error: `"${p.label}" is ${p.host ? 'on ' + p.host : 'an external browser over CDP'} — its live view is not bridged in this release` };
    // NAIVE STUDY 2 (finding 3): A VIEW NEVER STARTS A BROWSER — not an ephemeral one (lane H), not a profile's
    // (P2's "a view of a stopped browser is a start" made a reconnect after the user's Stop relaunch it, the view
    // showing about:blank "Agent is driving" as if a new browser had started). The PROCESS is judged first (the
    // tick's verdict, now); a start somebody else is making is waited for; a stopped browser is refused by name
    // and the view resumes when the digest says it runs again.
    { const rec0 = reg.browsers[p.id]; if (rec0 && rec0.state === 'ready' && isLocalRec(rec0) && !starting.has(p.id) && !stopping.has(p.id) && daemonGone(rec0)) { markDaemonGone(rec0, 'a view asking for its port'); commit(); } } // r2: dead OR recycled; its browser ended (M1)
    if (starting.has(p.id)) { try { await starting.get(p.id); } catch { /* its own verdict */ } }
    if (!reg.browsers[p.id] || reg.browsers[p.id].state !== 'ready') return { ok: false, port: null, code: 'browser_stopped', error: `"${p.label}"'s browser is not running — the agent's next browser command starts it again, and this view reconnects then` };
    { const recV = reg.browsers[p.id]; if (recV && recV.state === 'ready' && isLocalRec(recV) && !stopping.has(p.id)) await followRelaunch(recV, 'a view asking for its port', { heal: leasedNow(p.id), force: true }); } // verify r3 M1 (a): the cdp url follows too; r4 MAJOR 1: a closed browser is healed — r5 MINOR 2: only while a lease holds it (a view never starts a browser nobody uses: `browser_closed` below, the next command starts it)
    { const cr = closedRefusalOf(p.id); if (cr) return { ok: false, port: null, code: cr.code, error: cr.error, ...(cr.unstable ? { unstable: cr.unstable } : {}) }; } // r4: never a dead port; r6: the unstable kind (the view's words)
    // P6: a mediated lease's stream server is ITS OWN daemon's (the session's
    // namespace over its scoped url) — the profile daemon holds no session of it
    if (isMediated(p)) {
      const bk = String(target.sessionName || '').replace(/^vs-/, '');
      const rec = reg.browsers[p.id];
      if (!mediationOn() || !rec || !rec.cdpUrl) return { ok: false, port: null, code: 'stream_unavailable', error: `"${p.label}" is shared instance-wide and ${mediationOn() ? 'its browser answered no CDP url' : 'this instance has no mediating proxy'}` };
      const g = await mediator.grantFor({ profileId: p.id, browserKey: bk, upstream: rec.cdpUrl, paused: () => inputStateFor(bk, p.id).input === 'user' });
      const r = await rt.streamPort(M.mediatedNamespace(p.id, bk), { session: target.sessionName, extraEnv: { AGENT_BROWSER_CDP: g.url, AGENT_BROWSER_IDLE_TIMEOUT_MS: String(idleMs()) } });
      return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: 'stream_unavailable', error: r.error };
    }
    // naive study 2: the lease's own session over the keeper browser's CDP url — never the directory (on 0.38.1 a
    // `stream status` under the lease's session with the directory STARTS a second Chrome, which dies on SingletonLock)
    const o = await leaseCliOpts(p.id, String(target.sessionName || '').replace(/^vs-/, ''));
    if (!o) return { ok: false, port: null, code: 'browser_no_cdp', error: noCdpError(p) };
    const r = await rt.streamPort(target.ns, { session: target.sessionName, extraEnv: o.extraEnv });
    return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: 'stream_unavailable', error: r.error };
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
  async function viewportFor(target, { activeUrl = '' } = {}) {
    ensureLoaded();
    if (!target || !target.ok) return { ok: false, error: 'no target' };
    const S = require('../browser-stream.js');
    const VP = require('./browser-viewport.js');
    const key = target.kind === 'ephemeral' ? 'eph:' + String(target.sessionName || '') : 'p:' + String(target.profileId || '');
    const resolveUrl = async () => {
      if (target.kind === 'ephemeral') {
        const r = await rt.cdpUrl(null, { extraEnv: S.pairsToEnv(target.envPairs) });
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
      const v = await VP.readViewport(url, { activeUrl });
      if (v.ok) { vpUrls.set(key, url); return v; }
      vpUrls.delete(key);
      if (!cached) return v;
    }
    return { ok: false, error: 'unreachable' };
  }

  const api = {
    list, profile, profileByRef, browserOf, leasesFor, leasesOn, createProfile, adoptDirectory, removeProfile,
    reshapeStore: (fn) => { ensureLoaded(); const r = fn(reg); commit(); return r; }, // MIGRATIONS ONLY (2026-09-runaway-parks-void): reshape the in-memory registry, then the ONE atomic save
    usageOf: (id) => { const l = live.get(id); return l ? { ...l } : null; }, // 2026-09-25: the Browser panel's memory cell (memBytes + memMetric, over)
    // takeover C3 (design-browser-takeover §5): the managed ephemeral browser + the ceiling's count seam
    ensureEphemeral, retireEphemeral, ephemerals, ephemeralFor, isEphemeral: (id) => isEph(profile(id)), nsOf,
    liveHoldingFor, // lane H: the session card / status chip's `browserLive` fact
    holdersFor: (browserKey) => { ensureLoaded(); return holders(B.leasesOf(reg.leases, String(browserKey || ''), { children: true })); }, // lane H: THE holder rows of one conversation (the recorder arms only on a holder)
    socketRootOf, // takeover r2: the root every command of a browser this keeper runs must land under
    configFileFor, machineConfigFile, // takeover r3: the config a command on a browser this keeper runs is NAMED with
    setOtherHolders: (fn) => { othersFn = typeof fn === 'function' ? fn : null; },
    streamPortFor, // P2: the live view's port (attachment or ephemeral)
    noteStreamClosed, // VERIFY r1 H2: the bridge's upstream closed on an ephemeral relay — judge the process now
    leaseCliOpts, // naive study 2: the ONE way a CLI call under a lease's session reaches the keeper's browser (CDP, never the directory)
    ephemeralPairsFor: (browserKey) => { ensureLoaded(); const p = reg.profiles.find((x) => isEph(x) && x.owner.id === String(browserKey || '')); return p ? (pairsOf(p.id) || null) : null; }, // naive study 2 (finding 4): a sub-agent browser's OWN pairs — the recorder's tap on it
    viewportFor, // lane J: the page's own viewport (the live view's input space)
    pinFor, setPin, pinForCreate, instanceDefault, taskGroupDefaultFor,
    start, stop, attach: attachTimed, detach, statusFor,
    // P3 (§4.3 / §4.3.1): the input side — takeover/handback/idle, the typed paused refusal, the confirmation registry
    takeoverIdleMs, inputStateFor, inputsFor, inputSummaryFor, takeover, handback, noteUserInput, noteUserUrl, pausedVerdictFor, onInput,
    notePending, resolvePending, pendingFor, pendingAllFor, answerConfirmation, onConfirmation,
    // P1 second half (§3.7/§3.8): the set, handles, the one-time refusal, children, the audit, adopt
    setFor, tell, resolveFor, newChild, dropChild, audit, adoptScratch, auditFile: path.join(dataDir, AUDIT_FILE),
    reconcile, adoptAll, boot, tick, startTimer, shutdown,
    // P4 (§7.3): the paired-machine question the routes ask before a create is judged
    hostKnown: knownHost, isLocalRec, probeCdp, desktopConsent,
    // P4 second half (§7.4 / §7.5): the switch, its view, the chip, seats, the agent's claims, per-site memory, the lease's last URL
    switchBackend, switcherView, chipFor, seatStates, runningOf, blocked, blockedFor, clearBlocked, addSiteHint, dropSiteHint, siteHints, noteLeaseUrl, cloakExecutable, readDirMajor, keys: () => keysOf(),
    // §7.4 failure form (1): the install action (verdict = PURE over the proof record; the act spawns npm ONLY on ok)
    installVerdict, installCloak, installDir, installedCloakBin,
    // P5 (§4.5 / D7 / D35): the lease seam the recorder and the screencast hang on, the digest hook, the editable fields
    onLease, addDigest, updateProfile,
    // P6 (§6.2 / §6.5): is `sharing:"instance"` a value here; the proxy (the routes ask it nothing directly)
    mediationOn, isMediated, mediator: () => (mediationOn() ? mediator : null),
    storeFile, STORE_FILE, uid, _reg: () => reg, _facts: bf, _runtime: rt,
  };
  if (install) installed = api;
  return api;
}

module.exports = { create, keeper, STORE_FILE, AUDIT_FILE, TICK_MS, STOP_GRACE_MS, ARM_WAIT_MS, RESOURCE_METRIC, EPHEMERAL_DETACH_NOTE };
