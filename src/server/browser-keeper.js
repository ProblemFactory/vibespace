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
 * runaway guard from src/keeper-limits.js (the ONE constants home every keeper
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
 *   · RUNAWAY: one /proc sample per GUARD_SAMPLE_MS over the daemon's tree,
 *     provider-scaled thresholds; stop + park + telemetry + a server notice.
 *   · STOP = the CLI's own `close --all` under that namespace, then the
 *     recorded pid signalled ONLY when pid+starttime prove it is ours.
 *   · SPAWN HYGIENE: the sanitised base env, secrets never on argv (the proxy
 *     rides the profile's own config, P1 passes none).
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
const LIMITS = require('../keeper-limits.js');

const STORE_FILE = 'browser-profiles.json';
const AUDIT_FILE = 'browser-audit.jsonl';
const TICK_MS = 5000;
const STOP_GRACE_MS = 3000;
const FILE_MODE = 0o600;
const RUNAWAY_METRIC = 'browser-runaway';

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
 *   serverNotice   — (key, text, opts) => void  (runaway / ceiling notices)
 *   getTelemetry   — () => telemetry | null
 *   liveKeys       — () => Set of the browser keys live sessions carry (activeSessions)
 *   facts / runtime / limits / log / now / tickMs / guardSampleMs — injectable for the gate
 */
function create({ dataDir, homeDir = os.homedir(), env = () => ({}), broadcast = null, serverSetting = () => undefined,
  serverNotice = null, getTelemetry = () => null, liveKeys = () => new Set(),
  facts = null, runtime = null, limits = LIMITS, log = console, now = Date.now, tickMs = TICK_MS, guardSampleMs = null, install = true,
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
  mediator = null } = {}) {
  if (!dataDir) throw new Error('browser-keeper: dataDir is required');
  const storeFile = path.join(dataDir, STORE_FILE);
  const bf = facts || F.createBrowserFacts({ env: env() });
  const rt = runtime || F.createBrowserRuntime({ env: env(), log });
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
  const guard = new Map();      // profileId → { prev, hotSince, lastSampleAt }
  const live = new Map();       // profileId → { cpuPct, rssBytes, pids, sampledAt }
  const starting = new Map();   // profileId → in-flight start promise (single flight)
  const stopping = new Set();
  const switching = new Set();  // P4 (§7.4): profiles mid-switch — attach/resolve answer `browser_restarting`, never a timeout
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
  function emitLease(ev) { for (const fn of leaseListeners) { try { fn(ev); } catch (e) { log.warn?.(`[browser] lease listener failed: ${e && e.message}`); } } }
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
  const nsOf = (profileId) => B.sessionNameFor(profileId);
  function browserView(rec) {
    if (!rec) return null;
    const l = live.get(rec.profileId) || null;
    return { ...rec, cdpUrl: undefined, remoteCdpUrl: undefined, live: l ? { ...l } : null };
  }
  function leaseView(l) { return { ...l, mediated: !!(l && isMediated(profile(l.profileId))) }; }
  function list() {
    ensureLoaded();
    const browsers = {};
    for (const [id, r] of Object.entries(reg.browsers)) browsers[id] = browserView(r);
    const running = Object.values(reg.browsers).filter(B.isLiveBrowser).length;
    const lv = bf.lastVersion();
    return {
      profiles: reg.profiles.map(pview), leases: reg.leases.map(leaseView), browsers,
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
      chips: Object.fromEntries(reg.profiles.map((p) => [p.id, chipFor(p)])),
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
  function profileByRef(ref) { ensureLoaded(); return B.findProfile(reg.profiles, ref); }
  function browserOf(profileId) { ensureLoaded(); return reg.browsers[profileId] || null; }
  function leasesFor(browserKey, opts) { ensureLoaded(); return B.leasesOf(reg.leases, browserKey, opts).map(leaseView); }
  function leasesOn(profileId) { ensureLoaded(); return reg.leases.filter((l) => l.profileId === profileId).map(leaseView); }

  // ── profiles ──
  function mintId() { for (;;) { const id = B.mintProfileId(crypto.randomBytes(4).toString('hex')); if (!reg.profiles.some((p) => p.id === id)) return id; } }
  function userConfig() { try { return JSON.parse(fs.readFileSync(path.join(homeDir, B.USER_CONFIG_REL), 'utf8')) || {}; } catch { return {}; } }
  /**
   * Create a profile. `owner` = { kind, id }: a session-created profile is
   * owned by its CONVERSATION (kind 'session', id = browserKey — the identity
   * that survives resume), a UI-created one by the instance. The directory is
   * made 0700 under ~/.agent-browser/ (the CLI's own root, so `agent-browser
   * profiles` lists it too); an adopted directory keeps its path.
   */
  function createProfile(input = {}, { owner = null, dir = null, legacy = false } = {}) {
    ensureLoaded();
    const v = B.validateProfileInput(input, { existing: reg.profiles, control, mediation: mediationOn() });
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
    commit();
    log.log?.(`[browser] profile ${id} "${p.label}" removed from the registry (its directory ${p.dir} is kept — deletion is a human act)`);
    return { removed: id, dir: p.dir };
  }
  /** P5: the editable fields of a record — `record` (the per-profile screencast
   *  opt-in, D7), `label` (validated like a create: free text, unique, never a
   *  path) and `notes`. Anything else is refused by name. */
  function updateProfile(id, patch = {}) {
    ensureLoaded();
    const p = profile(id);
    if (!p) throw namedError('not-found', `no profile ${id}`);
    const allowed = new Set(['record', 'label', 'notes', 'sharing']);
    const keys = Object.keys(patch || {}).filter((k) => patch[k] !== undefined);
    const bad = keys.filter((k) => !allowed.has(k));
    if (bad.length) throw namedError('bad-request', `these fields cannot be changed here: ${bad.join(', ')} (only record / label / notes / sharing)`);
    if (!keys.length) throw namedError('bad-request', 'nothing to change');
    const changed = {};
    if (keys.includes('label')) {
      const v = B.validateProfileInput({ label: patch.label }, { existing: reg.profiles.filter((x) => x.id !== id), control });
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
    if (!p) return null;
    return { profileId: p.id, label: p.label, dir: p.dir, origin: v.origin || 'chosen', at: v.at || 0 };
  }
  function setPin(browserKey, profileId, { origin = 'chosen' } = {}) {
    ensureLoaded();
    if (!B.isBrowserKey(browserKey)) throw namedError('bad-request', 'a pin needs a browser key');
    if (!profileId) { const had = !!reg.pins[browserKey]; delete reg.pins[browserKey]; if (had) commit(); return null; }
    const p = profile(profileId);
    if (!p) throw namedError('not-found', `no profile ${profileId}`);
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
  function headedSetting() { const v = setting('browser.headed', ''); return v === true || v === 'yes' ? true : (v === false || v === 'no' ? false : null); }
  async function start(profileId, { why = 'attach' } = {}) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p) throw namedError('not-found', `no profile ${profileId}`);
    const cur = reg.browsers[profileId];
    if (B.isLiveBrowser(cur)) return browserView(cur);
    if (starting.has(profileId)) return starting.get(profileId);
    const park = B.runawayParkVerdict(profileId, reg.runawayParkedUntil, now());
    if (park) throw namedError(park.code, park.error);
    const cap = B.ceilingVerdict(Object.values(reg.browsers).map((r) => ({ ...r, label: profile(r.profileId)?.label })), reg.leases, limits);
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
      const rec = { profileId, ns, pid: null, starttime: null, socketDir: null, cdpUrl: null, state: 'starting', startedAt: now(), endedAt: null, lastError: null, stoppedBy: null, lastLeaseDroppedAt: null, startedBy: why,
        // P4: WHERE the process is (a paired machine) / that there is no
        // process of ours at all (an external browser over CDP), the hub-side
        // forward of its loopback port, and the machine's own url + dir
        hostId: p.host || null, external: !(B.providerRow(p.provider) || {}).starts, forward: null, remoteCdpUrl: null, dir: null };
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
      const r = await rt.launch(ns, { dir: p.dir, idleMs: 0, headed: headedSetting(), extraEnv: vendorEnv, argvPrefix });
      if (!r.ok) {
        const text = (r.stderr || r.error || r.stdout || '').trim().slice(0, 300);
        // a key-bearing launch that fails on licence/concurrency is the THIRD
        // named refusal (§7.4, round 8 #3) — under a cluster default it says
        // the seats are shared fleet-wide and offers the one click out
        const cls = intId ? SW.classifyLaunchFailure({ provider: p.provider, text, source: key ? key.source : 'none', integrationId: intId }) : { code: 'launch_failed', error: `agent-browser open failed: ${text}`, action: null };
        rec.state = 'failed'; rec.endedAt = now(); rec.lastError = cls.error;
        commit();
        throw namedError(cls.code, cls.error, { provider: p.provider, action: cls.action || null });
      }
      const info = await rt.info(ns, { dir: p.dir });
      rec.pid = info.pid; rec.starttime = info.pid ? F.procStart(info.pid) : null; rec.socketDir = info.socketDir;
      const cdp = await rt.cdpUrl(ns, { dir: p.dir });
      rec.cdpUrl = cdp.ok ? cdp.url : null;
      if (!info.active) {
        rec.state = 'failed'; rec.endedAt = now(); rec.lastError = 'the daemon did not report itself active after open';
        commit();
        throw namedError('launch_failed', rec.lastError);
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
        rec.state = why === 'runaway' || why === 'failed' ? 'failed' : 'stopped';
        rec.endedAt = now(); rec.stoppedBy = why;
        if (why === 'idle') rec.lastError = `stopped after ${Math.round(idleMs() / 60000)} min with no lease (idle timeout)`;
        else if (why !== 'user' && why !== 'runaway') rec.lastError = why;
        if (left) rec.lastError = `${rec.lastError ? rec.lastError + '; ' : ''}${left}`;
        guard.delete(profileId); live.delete(profileId);
        if (mediator) mediator.repoint(profileId, null); // P6: a mediated url answers browser_stopped until the next start
        log.log?.(`[browser] ${profileId} "${p ? p.label : profileId}" ${rec.external ? 'released (external browser left running)' : 'stopped on ' + rec.hostId} (${why})${left ? ' — NOT clean: ' + left : ''}`);
        commit();
        return browserView(rec);
      }
      // The CLI's own stop first — it owns the daemon and chromium.
      await rt.closeAll(rec.ns, { dir: p ? p.dir : null });
      let left = null;
      const until = now() + STOP_GRACE_MS;
      while (now() < until && rec.pid && F.pidAlive(rec.pid)) await sleep(100);
      if (rec.pid && F.pidAlive(rec.pid)) {
        const v = pidVerdictOf(rec);
        if (v === 'ours') {
          try { process.kill(rec.pid, 'SIGTERM'); } catch { /* gone */ }
          const t2 = now() + 1500;
          while (now() < t2 && F.pidAlive(rec.pid)) await sleep(100);
          if (F.pidAlive(rec.pid)) { try { process.kill(rec.pid, 'SIGKILL'); } catch { /* gone */ } await sleep(200); }
          if (F.pidAlive(rec.pid)) left = `daemon pid ${rec.pid} survived SIGKILL`;
        } else left = `daemon pid ${rec.pid} is still alive but not provably ours (${v}) — left alone, never signalled`;
      }
      rec.state = why === 'runaway' || why === 'failed' ? 'failed' : 'stopped';
      rec.endedAt = now(); rec.stoppedBy = why;
      if (why === 'idle') rec.lastError = `stopped after ${Math.round(idleMs() / 60000)} min with no lease (idle timeout)`;
      else if (why === 'switch') rec.lastError = 'stopped to switch backend (§7.4) — restarted on the new one';
      else if (why !== 'user' && why !== 'runaway') rec.lastError = why;
      if (left) rec.lastError = `${rec.lastError ? rec.lastError + '; ' : ''}${left}`;
      guard.delete(profileId); live.delete(profileId);
      if (mediator) mediator.repoint(profileId, null); // P6
      log.log?.(`[browser] ${profileId} "${p ? p.label : profileId}" stopped (${why})${left ? ' — NOT clean: ' + left : ''}`);
      commit();
      emitLease({ kind: 'browser-stopped', profileId, why, local: true });
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
    if (d.created) reg.leases.push(d.lease);
    else reg.leases = reg.leases.map((l) => (l.profileId === p.id && l.browserKey === browserKey ? d.lease : l));
    p.lastUsedAt = now();
    commit();
    log.log?.(`[browser] ${browserKey}${sessionId ? ' (' + sessionId + ')' : ''} ${d.created ? 'attached to' : (d.resumed ? 're-carries its lease on' : 'already holds')} ${p.id} "${p.label}" (${d.others} other session(s) on it)`);
    emitLease({ kind: 'attach', browserKey, profileId: p.id, sessionId: sessionId || d.lease.sessionId || null, created: !!d.created, resumed: !!d.resumed });
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
    return { lease: leaseView(d.lease), created: d.created, resumed: d.resumed, others: d.others, profile: pview(p), browser, mediated: false, env: B.attachedEnvFor({ browserKey, profileId: p.id, profileDir: p.dir, cdpUrl: rec && !isLocalRec(rec) ? rec.cdpUrl : null }), cdpUrl: rec ? rec.cdpUrl : null, pinTab };
  }
  function detach({ profileId, profile: ref, browserKey } = {}) {
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
    dropInputsFor(browserKey, id); // P3: a lease that goes away takes its input side with it
    if (mediator) mediator.revoke({ profileId: id, browserKey }); // P6: its url goes, and its own tabs are closed in the browser
    reg.leases = d.remaining;
    const rec = reg.browsers[id];
    if (rec && !d.others) rec.lastLeaseDroppedAt = now();
    commit();
    log.log?.(`[browser] ${browserKey} detached from ${id} (${d.others} lease(s) remain${!d.others && rec && B.isLiveBrowser(rec) ? `; the browser idles out in ${Math.round(idleMs() / 60000)} min unless re-attached` : ''})`);
    emitLease({ kind: 'detach', browserKey, profileId: id, sessionId: d.lease ? d.lease.sessionId || null : null });
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
      } else r = await rt.exec(nsOf(profileId), a.argv, { dir: p.dir, session: 'vs-' + String(browserKey || '') });
    } else {
      const S = require('../browser-stream.js');
      const pairs = Array.isArray(envPairs) ? envPairs : [];
      if (!pairs.length) return { ok: false, code: 'no-browser', error: 'this session has no browser of its own to answer on' };
      r = await rt.exec(null, a.argv, { extraEnv: S.pairsToEnv(pairs) });
    }
    const v = T.decisionVerdict(r.json || (r.ok ? { success: true } : { success: false, error: (r.stderr || r.error || 'agent-browser failed').trim() }));
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
    const leases = B.leasesOf(reg.leases, browserKey, { children: true }).map((l) => {
      const p = profile(l.profileId);
      return { ...leaseView(l), label: p ? p.label : l.profileId, browser: browserView(reg.browsers[l.profileId]), others: reg.leases.filter((x) => x.profileId === l.profileId && x.browserKey !== l.browserKey).length };
    });
    const set = setFor(browserKey);
    return { browserKey, leases, pin: pinFor(browserKey), defaultProfile: set.defaultId, attachments: set.attachments, handles: set.handles, children: set.children, fingerprint: set.fingerprint, told: reg.told[String(browserKey || '')]?.fingerprint || null,
      // P3 (§4.3): who drives each of this conversation's browsers, and what is waiting on a confirmation
      inputs: inputsFor(browserKey), input: inputSummaryFor(browserKey), pending: pendingAllFor(browserKey) };
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
    const v = B.validateProfileInput({ label }, { existing: reg.profiles });
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
    if (!p) throw namedError('not-found', `no profile ${profileId}`);
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
          const r = await rt.exec(ns, [...(pinTab ? ['--pin-tab'] : []), 'open', url], { dir: p.dir, session: B.sessionNameFor(l.browserKey) });
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
      emitLease({ kind: 'lease-dropped', browserKey: d.lease.browserKey, profileId: d.lease.profileId, sessionId: d.lease.sessionId || null, why: d.why });
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
      if (verdict === 'ours') { try { active = (await rt.info(rec.ns, { dir: p ? p.dir : null })).active; } catch { active = false; } }
      const v = B.adoptVerdict(rec, { verdict, active });
      if (!v) continue;
      if (v.state === 'ready') { rec.state = 'ready'; rec.adoptedAt = now(); log.log?.(`[browser] adopted ${rec.profileId} "${p ? p.label : ''}" (daemon pid ${rec.pid})`); }
      else { rec.state = v.state; rec.lastError = v.lastError; rec.endedAt = now(); log.warn?.(`[browser] ${rec.profileId} ${v.state} at boot: ${v.lastError}`); }
    }
  }
  /** The boot path (§3.5), in this order and no other: drop every lease nobody
   *  carries, THEN judge each recorded browser, THEN start the tick. Runs
   *  after restoreSessions so `liveKeys` is final. */
  async function boot() {
    ensureLoaded();
    const r = reconcile({ graceMs: 0 });
    await adoptAll();
    commit();
    if (Object.values(reg.browsers).some(B.isLiveBrowser) || reg.leases.length) startTimer();
    return { droppedLeases: r.dropped.length, browsers: Object.values(reg.browsers).filter(B.isLiveBrowser).length };
  }

  // ── the tick: carrier grace, idle, runaway ──
  async function tick() {
    ensureLoaded();
    const t = now();
    const r = reconcile({ graceMs: B.LEASE_DROP_GRACE_MS });
    if (r.dropped.length || r.stamped.length) dirty = true;
    for (const rec of Object.values(reg.browsers)) {
      if (!B.isLiveBrowser(rec) || stopping.has(rec.profileId) || starting.has(rec.profileId)) continue;
      const p = profile(rec.profileId);
      // P4: a process on a paired machine / an external browser is never
      // pid-judged or sampled here (the pid is not ours, or not local)
      if (isLocalRec(rec) && pidVerdictOf(rec) === 'gone') { rec.state = 'stopped'; rec.endedAt = t; rec.lastError = 'the browser daemon exited'; dirty = true; log.log?.(`[browser] ${rec.profileId} daemon gone (pid ${rec.pid}) — recorded stopped`); continue; }
      const idle = B.browserIdle(rec, reg.leases, t, idleMs());
      if (idle.expired) { stop(rec.profileId, { why: 'idle' }).catch(() => { }); continue; }
      const g = guard.get(rec.profileId) || { prev: null, hotSince: 0, lastSampleAt: 0 };
      if (isLocalRec(rec) && t - g.lastSampleAt >= sampleEvery) {
        const s = rec.pid ? F.treeUsage(rec.pid) : null;
        const v = B.runawayVerdict(s, g.prev, g.hotSince, t, { limits: B.providerGuard(p ? p.provider : 'chromium', limits) });
        g.prev = s ? { at: t, cpuTicks: s.cpuTicks } : null; g.hotSince = v.hotSince; g.lastSampleAt = t;
        guard.set(rec.profileId, g);
        if (s) { live.set(rec.profileId, { cpuPct: v.cpuPct, rssBytes: s.rssBytes, pids: s.pids.length, sampledAt: t }); dirty = true; }
        if (v.why) {
          log.error?.(`[browser] RUNAWAY — ${rec.profileId} "${p ? p.label : ''}" (${s.pids.length} process(es)) stopped: ${v.why}; not starting it again for ${Math.round(limits.RUNAWAY_COOLDOWN_MS / 60000)} min`);
          reg.runawayParkedUntil[rec.profileId] = t + limits.RUNAWAY_COOLDOWN_MS;
          try { getTelemetry()?.record?.({ kind: 'event', name: RUNAWAY_METRIC, detail: `${p ? p.label : rec.profileId}: ${v.why}`, value: Math.round((s.rssBytes || 0) / 1048576) }); } catch { /* optional */ }
          try { serverNotice?.('browser-runaway:' + rec.profileId, `The browser of profile "${p ? p.label : rec.profileId}" was stopped as a runaway (${v.why}). It will not be started again for ${Math.round(limits.RUNAWAY_COOLDOWN_MS / 60000)} min.`, { level: 'warn' }); } catch { /* optional */ }
          rec.lastError = `stopped as a runaway: ${v.why}`;
          stop(rec.profileId, { why: 'runaway' }).catch(() => { });
          continue;
        }
      }
    }
    for (const [id, until] of Object.entries(reg.runawayParkedUntil)) if (Number(until) <= t) { delete reg.runawayParkedUntil[id]; dirty = true; }
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
      const r = await rt.streamPort(null, { extraEnv: S.pairsToEnv(target.envPairs) });
      return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: 'stream_unavailable', error: r.error };
    }
    const p = profile(target.profileId);
    if (!p) return { ok: false, port: null, code: 'not-found', error: `no profile ${target.profileId}` };
    // P4: the stream server is the LOCAL daemon's; a browser reached over CDP
    // or running on a paired machine has none the hub can bridge yet
    if (p.host || !(B.providerRow(p.provider) || {}).starts) return { ok: false, port: null, code: 'stream_unavailable', error: `"${p.label}" is ${p.host ? 'on ' + p.host : 'an external browser over CDP'} — its live view is not bridged in this release` };
    try { await start(p.id, { why: 'live view' }); } catch (e) { return { ok: false, port: null, code: e.code || 'launch_failed', error: String(e.message || e) }; }
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
    const r = await rt.streamPort(target.ns, { dir: p.dir, session: target.sessionName });
    return r.ok ? { ok: true, port: r.port, error: null, code: null } : { ok: false, port: null, code: 'stream_unavailable', error: r.error };
  }

  const api = {
    list, profile, profileByRef, browserOf, leasesFor, leasesOn, createProfile, adoptDirectory, removeProfile,
    streamPortFor, // P2: the live view's port (attachment or ephemeral)
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

module.exports = { create, keeper, STORE_FILE, AUDIT_FILE, TICK_MS, STOP_GRACE_MS, RUNAWAY_METRIC };
