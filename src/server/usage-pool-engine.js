'use strict';
// USAGE + POOL ENGINE (decomposition #5 — the largest single extraction).
// Everything that DECIDES about quota and pooled billing on this instance:
// the model-fallback belt, pool auto-switch (pool-level + plan-C per-session),
// get_usage probe plumbing, the anchors sweep, offline-bias defenses, sealed
// orders push, rate-limit capture wiring, usage identity groups and the
// estimator instance. Extracted VERBATIM; late-created deps (accounts, hosts,
// usageHistory, recordUsageAttribution) arrive as lazy getters/lambdas —
// every use is at RUNTIME, after boot completes. ORCH tier.
const os = require('os');
const fs = require('fs');
const path = require('path');

const { mk } = require('./lazy.js');

function create({ app, rootDir, USAGE_CACHE_DIR, activeSessions, wss, WS_OPEN, getAutoResume = () => null, getOtelIngest = () => null,
  broadcastToSession, serverNotice, serverSetting, getAccounts, getHosts,
  getUsageHistory, recordUsageAttribution, adapterRegistry}) {
  // late-bound singletons: created after this module in boot order, used only
  // at runtime — the Proxy re-resolves per property access, never caches
  const accounts = mk(getAccounts);
  const hosts = mk(getHosts);
  const usageHistory = mk(getUsageHistory);
// ── Stop-on-model-fallback belt (2.228.0, claude.disableModelFallback) ──
// The PRIMARY mechanism is the CLI's native switchModelsOnFlag=false
// (spawn --settings + mid-session apply_flag_settings) — with it armed no
// fallback ever happens and this never fires. The belt covers sessions whose
// CLI predates the toggle (spawned before it was enabled, or restored from
// before a server restart): the moment a fallback signal appears on the
// stream, interrupt the turn (same recipe as the ws 'interrupt' case) and
// tell the user why. Once per turn (_fallbackStopFired, cleared on result).
// ── Pooled pseudo-account auto-switch (B-6217 v2) ───────────────────────────
// Runs at each claude turn end for sessions billed to a pool with auto=on.
// Decisions read ONLY the passive usage cache (§ban-safety — never an API
// call); see src/account-pool-auto.js for the semantics. hot=on → just
// re-point (the running CLI re-reads the credential file on its next request);
// hot=off → also ask ONE connected client to cold-restart the affected
// conversations (headless instances degrade to hot behavior until a client
// appears — the switch itself never waits on a browser).
const { decidePoolSwitch, rankPoolMembers, classifyAuthFailure, SWITCH_THRESHOLD_PCT: POOL_HARD_PCT } = require('../account-pool-auto.js');
const { parseRateLimitEvent, captureRateLimitEvent } = require('../rate-limit-capture.js'); // was a FREE IDENTIFIER since extraction #5 — passive rate_limit_event capture silently dead for 3 days (5th lost binding; the try/catch swallowed the ReferenceError into a log line)
const _poolAutoLast = new Map(); // poolId → ts of last DECISION (eval gate)
const _poolSwitchAt = new Map(); // poolId → ts of last actual SWITCH (dwell belt)
// ── member auth-health (2.335.0, owner report: a banned/expired/out-of-credit
// account never triggered a switch — quota was the engine's ONLY signal, and a
// dead-auth account often still SHOWS rich quota). memberId → {at, reason}.
// Self-healing exit: TTL 10min, and a creds file NEWER than the mark (=
// somebody re-logged-in) clears immediately.
const _memberAuthFail = new Map();
const _authNoteAt = new Map(); // member:sid → last evict attempt (throttle)
const _authNoticeAt = new Map(); // memberId → last user notice (anti-spam)
const AUTH_FAIL_TTL_MS = 10 * 60e3;
// ── get_usage control channel + chat-mode limit banner (B-7edc/B-292b) ──────
// The get_usage control request makes the CLI (first-party client) fetch usage
// itself — strictly better ToS posture than our bare /api/oauth/usage call.
// HUMAN-TRIGGERED ONLY (the ⟳ button): auto-firing was REJECTED (2026-08-09,
// user decision) — a machine-initiated quota check is the automated-access
// pattern that got a real account banned. The passive chat-mode signal is the
// LIMIT BANNER instead (markLimitBanner below): zero calls.
const { ClaudeCodeAdapter } = require('../adapters/claude-code.js');
// ── usage ANCHOR recorder (dead-reckoning data foundation, 2.261.0) ─────────
// Sweeps local usage-cache snapshots for NEW ground-truth readings (any
// source: statusline / ⟳ / get_usage / limit banner) and appends them, with
// the ledger cost consumed since the previous anchor, to
// data/usage-anchors/anchors-<identity>.ndjson. Identity key = orgUuid >
// email > account id, so a sub's history SURVIVES remove + re-add (user
// requirement — a re-add mints a fresh sub-<hex> id). Zero API calls.
const { UsageAnchors, identityKeyFor, costBetweenMulti } = require('../usage-anchors.js');
const { UsageEstimator, overlayCache: estOverlayCache, predictCalib } = require('../usage-estimator.js');
const usageAnchors = new UsageAnchors({ dataDir: path.join(rootDir, 'data') });
// Which caches map to which identity (org-merge aware) — shared by the sweep
// and the estimator's per-account resolution. Reads roster + cache files only.
function usageIdentityGroups() {
  const groups = new Map(); // identityKey → {accountIds:[], cache, accountId}
  let files = [];
  try { files = fs.readdirSync(USAGE_CACHE_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('__models__') && !f.startsWith('host-') && f !== 'rates.json'); } catch { return groups; }
  const roster = accounts.list().accounts || [];
  for (const fn of files) {
    try {
      const accountId = fn === '__global__.json' ? null : fn.slice(0, -5);
      const cache = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, fn), 'utf-8'));
      if (!cache?.fetchedAt) continue;
      const acctRec = accountId ? roster.find((x) => x.id === accountId) : null;
      if (accountId && acctRec && (acctRec.type === 'pooled' || acctRec.backend === 'codex')) continue; // pools have no quota; codex economics are separate
      const key = identityKeyFor({ accountId, cache, email: acctRec?.email });
      const g = groups.get(key) || { accountIds: [], cache: null, accountId: null };
      g.accountIds.push(accountId || '__global__');
      // freshest cache is the identity's anchor source (the same real login can
      // surface as BOTH __global__ and a named sub — one quota, two files)
      if (!g.cache || cache.fetchedAt > g.cache.fetchedAt) { g.cache = cache; g.accountId = accountId; }
      groups.set(key, g);
    } catch { }
  }
  return groups;
}
// Dead-reckoning estimator (B-fcff v2): learned per-identity per-bucket rates
// over the anchor pairs, seeded with the measured Max-20x priors. Feeds the
// pool auto-switch an ESTIMATED bucket view and /api/usage an `estimates`
// field. Zero API calls; ledger + anchor files only.
const _identGroupsMemo = { at: 0, groups: null };
function usageIdentityGroupsCached() {
  if (!_identGroupsMemo.groups || Date.now() - _identGroupsMemo.at > 30000) {
    _identGroupsMemo.groups = usageIdentityGroups(); _identGroupsMemo.at = Date.now();
  }
  return _identGroupsMemo.groups;
}
const usageEstimator = new UsageEstimator({
  anchorsDir: path.join(rootDir, 'data', 'usage-anchors'),
  usageHistory: () => usageHistory, // declared far below — lazy ref (TDZ)
  resolveIdentity: (accountId) => {
    const want = accountId || '__global__';
    for (const [identityKey, g] of usageIdentityGroupsCached()) {
      if (g.accountIds.includes(want)) return { identityKey };
    }
    return null;
  },
});
app.locals.usageEstimator = usageEstimator;
// ── OFFLINE-BIAS defense (2.297.0, design §Cross-device aggregation) ──
// A source is ACTIVE-DARK when the ledger holds RECENT events from it but its
// link is down: its spend keeps accruing invisibly, which biases estimates in
// the DANGEROUS direction (under → late pool switches). 30s memo — this runs
// inside pool decisions and the anchor sweep.
let _darkMemo = { at: 0, list: [] };
function darkSources() {
  if (Date.now() - _darkMemo.at < 30000) return _darkMemo.list;
  const list = [];
  try {
    const wm = usageHistory.sourceWatermarks();
    const now = Date.now();
    for (const [src, ts] of Object.entries(wm)) {
      if (src === 'local') continue;
      if (now - ts > 48 * 3600 * 1000) continue; // idle for 2 days — not dangerous
      if (hosts.linkState(src) === 'offline') list.push({ host: src, lastEventTs: ts });
    }
  } catch { }
  _darkMemo = { at: Date.now(), list };
  return list;
}
// Which accounts a dark source taints: those with ledger events from that
// host in the last 7 days (per-account precision so an all-local pool never
// pays the pessimism tax for an unrelated machine's outage).
function darkTaintedAccounts() {
  const dark = darkSources();
  if (!dark.length) return {};
  const taint = {};
  try {
    const since = Date.now() - 7 * 24 * 3600 * 1000;
    const darkSet = new Set(dark.map((d) => d.host));
    for (const ev of usageHistory._events(since, Date.now())) {
      if (ev.host && darkSet.has(ev.host) && ev.acct && ev.atype !== 'host') taint[ev.acct] = DARK_PESSIMISM_PCT;
    }
  } catch { }
  return taint;
}
const DARK_PESSIMISM_PCT = 8; // dock: ~1 long turn of 5h headroom / real weekly $

// Disarm a pool's device-side reflex (pool deleted / auto turned off) —
// without this the daemon kept executing a stale snapshot forever, and could
// even recreate a deleted pool's symlink during a server-down window.
async function clearSealedOrders(poolId) {
  try {
    _sealedOrdersSent.delete(poolId);
    const dm = await hosts.device(null);
    await dm.poolOrders({ clearPool: poolId });
  } catch { }
}
const _sealedOrdersSent = new Map(); // poolId → last pushed JSON (skip no-ops)
let _poolOrdersWarned = false; // warn once per boot, never per tick
async function pushSealedOrders(poolId) {
  const a = accounts.get(poolId);
  if (!a || a.type !== 'pooled') return;
  const members = accounts.poolMembers(poolId);
  const ranked = rankPoolMembers({
    members,
    readCache: (id) => { try { return JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, id + '.json'), 'utf-8')); } catch { return null; } },
    nowSec: Date.now() / 1000,
  }).map((m) => ({ id: m.id, dir: accounts.subDir(m.id), creds: accounts.subCredsPath(m.id) }));
  const orders = { poolId, linkPath: accounts.subDir(poolId), ranked, currentId: accounts.poolCurrent(poolId) || null,
    // Plan C: per-session links are additional MATCH+ACT targets — the daemon
    // re-points exactly the link the banner session spawned against. Old
    // daemons ignore this field and keep matching only the default link:
    // reduced coverage on skew, never a wrong re-point.
    linkPaths: (() => { try { return accounts.sessionPoolLinks(poolId).map((l) => l.path); } catch { return []; } })() };
  const j = JSON.stringify(orders);
  if (_sealedOrdersSent.get(poolId) === j) return;
  const dm = await hosts.device(null); // device #0 — pools are local-only
  // (the memo below is per-pool AND the daemon now stores per-pool slots, so a
  // second pool's push can no longer evict the first — review finding)
  await dm.poolOrders(orders, (events) => {
    // fallback switches executed while this server was down: surface + let
    // the by-time ledger attribution reconcile billing (it already keys on
    // the symlink target's real account at scan time)
    for (const ev of events) {
      serverNotice('sealed-orders-' + ev.ts, `账号池 ${accounts.get(ev.poolId)?.name || ev.poolId} 在服务器离线期间因触限自动切换到 ${accounts.get(ev.to)?.name || ev.to}（sealed-orders 应急反射）`, { level: 'warn' });
      try { console.log('[sealed-orders] device-executed fallback switch:', JSON.stringify(ev)); } catch { }
    }
    try { dm.ackPoolOrdersLog(); } catch { }
  });
  _sealedOrdersSent.set(poolId, j);
}

function sweepUsageAnchors() {
  // GROUPED BY IDENTITY (2.263.0): recording per cache-file double-anchored
  // org-merged logins (__global__ + named sub interleaved in one identity
  // file, each record's costSince missing the sibling account's spend — real
  // data bug caught in the ProblemFactory analysis). One identity = one
  // anchor stream; cost sums across ALL its account ids.
  for (const [identityKey, g] of usageIdentityGroups()) {
    try {
      const prev = usageAnchors.lastAnchor(identityKey);
      const allIds = usageEstimator.accountIdsFor(identityKey, g.accountIds);
      const costSince = prev ? costBetweenMulti(usageHistory, allIds, prev.fetchedAt, g.cache.fetchedAt) : null;
      // calibration: what the CURRENT rates would have predicted for this new
      // reading — recorded into the anchor for offline analysis + Diagnostics
      let calib = null;
      // Same-source only (B-b3cd metric hygiene): a cross-source pair carries
      // the unknown inter-source offset, not prediction error — the exact rule
      // extractPairs already enforces for LEARNING (2.340.0); without it here
      // the calib stream's worst rows were all source flips, drowning the real
      // error signal (48↔95 "errors" that were attribution, not estimation).
      if (prev && costSince && (prev.source || 'unknown') === (g.cache.source || 'unknown')) {
        try {
          const newBuckets = {
            fiveHour: g.cache.fiveHour ? { u: g.cache.fiveHour.utilization, resetsAt: g.cache.fiveHour.resetsAt } : null,
            sevenDay: g.cache.sevenDay ? { u: g.cache.sevenDay.utilization, resetsAt: g.cache.sevenDay.resetsAt } : null,
            scopedWeekly: (g.cache.scopedWeekly || []).map((s) => ({ name: s.name, u: s.utilization, resetsAt: s.resetsAt })),
          };
          calib = predictCalib(prev, newBuckets, usageEstimator.ratesFor(identityKey), costSince, (g.cache.fetchedAt - prev.fetchedAt) / 1000);
          if (calib) for (const c of Object.values(calib)) global.__vsMetric?.('usage-est-err-pct', Math.abs(c.err) * 100);
        } catch { }
      }
      // pairs recorded while ANY tainted source was dark must not teach rates
      // (Δu real, cost missing ⇒ a falsely HOT rate) — mark the record so
      // extractPairs voids pairs touching it (both sides of the gap).
      const darkHosts = (() => { try { const t = darkTaintedAccounts(); return allIds.some((a) => t[a]) ? darkSources().map((d) => d.host) : []; } catch { return []; } })();
      if (usageAnchors.maybeRecord({ identityKey, accountId: g.accountId, cache: g.cache, costSince, calib, accountIds: allIds, dark: darkHosts })) {
        usageEstimator.invalidate(identityKey); // rates re-derive from the grown pair set
      }
    } catch { }
  }
}
// boot-time sealed-orders push: a restarted server re-arms every pool's
// device-side fallback snapshot AND collects executions from its own down
// window (the report rides the pool-orders reply)
setTimeout(() => {
  // Only AUTO pools (review finding): the runtime refresh is gated on a.auto,
  // so arming a manual pool at boot let the device switch a pool the user
  // explicitly set to manual — with a snapshot frozen at boot forever.
  try {
    for (const a of (accounts.list().accounts || [])) {
      const full = accounts.get(a.id);
      if (full?.type === 'pooled' && full.auto) pushSealedOrders(a.id).catch(() => { });
    }
  } catch { }
}, 15000);
setInterval(() => { try { sweepUsageAnchors(); } catch {} }, 60000);
setTimeout(() => { try { sweepUsageAnchors(); } catch {} }, 20000);

// ── Plan C (B-a612, 2.315.0): per-session pool placement ────────────────────
// One pool, many links: each session bills the member its OWN symlink points
// at. The chooser and the per-session switch pass both read quota through the
// SAME estimator-overlaid readCache the pool engine uses, PROJECTED to the
// session's model family (src/model-family.js): scoped caps of models this
// session is not running stop vetoing its placement; 5h/7d always count
// (nested buckets); an unknown family means NO projection — today's
// conservative semantics, never a relaxation on ignorance.
const { familyOfModel, projectCacheForFamily } = require('../model-family.js');
function poolReadCache(poolId) {
  // the engine's readCache, extracted for reuse (identity-group freshest file
  // + estimator overlay); kept here so chooser/switch/engine cannot drift
  const now = Date.now();
  return (id) => {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, id + '.json'), 'utf-8')); } catch { }
    try {
      for (const [, g] of usageIdentityGroupsCached()) {
        if (g.accountIds.includes(id) && g.cache && (g.cache.fetchedAt || 0) > (raw?.fetchedAt || 0)) { raw = g.cache; break; }
      }
    } catch { }
    try { return estOverlayCache(raw, usageEstimator.estimateFor(id, raw, now)); } catch { return raw; }
  };
}
function poolChooserForModel(poolId, { model } = {}) {
  try {
    const a = accounts.get(poolId);
    if (!a || a.type !== 'pooled') return null;
    const fam = familyOfModel(model);
    const cur = accounts.poolCurrent(poolId);
    if (!fam) return cur; // no identity → the pool's default target
    const base = poolReadCache(poolId);
    const readCache = (id) => projectCacheForFamily(base(id), fam);
    // decidePoolSwitch FROM the default target under the projected view: if
    // the default serves this family, stay (fewest distinct billing dirs);
    // if it doesn't, the switch verdict IS the placement.
    const { decidePoolSwitch } = require('../account-pool-auto.js');
    const d = decidePoolSwitch({ currentId: cur, members: healthyPoolMembers(poolId), readCache, nowSec: Date.now() / 1000, hot: true });
    return (d && d.to) || cur;
  } catch (e) { console.warn('[pool] chooser failed (falling back to default target):', e.message); return null; }
}
// The session's model identity, per the user's spec: the LAST assistant
// message's served model vs the last set-model pick — newest wins — else the
// spawn model. Any unknown → null (no projection).
function sessionModelFor(s) {
  const served = s._servedModel ? { m: s._servedModel, at: s._servedModelAt || 0 } : null;
  const picked = s._pickedModel ? { m: s._pickedModel, at: s._pickedModelAt || 0 } : null;
  const newest = served && picked ? (picked.at >= served.at ? picked : served) : (picked || served);
  return (newest && newest.m) || s._spawnModel || null;
}

const _vsuPending = new Map(); // request_id → {resolve, timer}
function resolveUsageKey(session) {
  let acct = session._accountId || null;
  try { if (acct && accounts.get(acct)?.type === 'pooled') acct = accounts.poolCurrentFor(acct, session._webuiId || null) || acct; } catch {}
  return acct || '__global__';
}
function writeUsageCacheForKey(key, parsed) {
  try {
    const f = path.join(USAGE_CACHE_DIR, key.replace(/[^\w.-]/g, '_') + '.json');
    let prev = {}; try { prev = JSON.parse(fs.readFileSync(f, 'utf-8')) || {}; } catch {}
    const merged = { ...prev, ...parsed };
    // preserve-merge like the statusline hook: never clobber known scoped/org
    // data with an empty answer
    if ((!parsed.scopedWeekly || !parsed.scopedWeekly.length) && Array.isArray(prev.scopedWeekly) && prev.scopedWeekly.length) {
      merged.scopedWeekly = prev.scopedWeekly; merged.scopedFetchedAt = prev.scopedFetchedAt;
    }
    for (const k of ['orgUuid', 'orgName', 'orgEmail', 'email', 'name']) if (prev[k] !== undefined && merged[k] === undefined) merged[k] = prev[k];
    fs.mkdirSync(USAGE_CACHE_DIR, { recursive: true });
    fs.writeFileSync(f + '.tmp', JSON.stringify(merged)); fs.renameSync(f + '.tmp', f);
    return true;
  } catch { return false; }
}
// Ask a LIVE LOCAL claude chat session's CLI for usage over its control
// channel. Returns parsed cache shape or null. Caller is the human-gated ⟳.
function probeUsageViaSession(session, timeoutMs = 8000) {
  return new Promise((resolve) => {
    try {
      if (!session?.pty || session.backend !== 'claude' || session.mode !== 'chat' || session.host) return resolve(null);
      const req = ClaudeCodeAdapter.buildGetUsage();
      const timer = setTimeout(() => { _vsuPending.delete(req.request_id); resolve(null); }, timeoutMs);
      _vsuPending.set(req.request_id, { resolve, timer });
      session.pty.write(JSON.stringify(req) + '\n');
    } catch { resolve(null); }
  });
}
// Every account key in `key`'s IDENTITY group (org-merged logins span
// '__global__' + named subs — one real account, several keys). Falls back to
// just [key] when the identity is unknown.
function usageIdentityAccountIds(key) {
  try {
    for (const [, g] of usageIdentityGroupsCached()) {
      if (g.accountIds.includes(key)) return g.accountIds;
    }
  } catch { }
  return [key];
}
// ⟳-route hook: find any live local claude chat session billed to `key` — or
// to ANY key in its identity group (2.266.1, real report: ⟳ on the pool's
// ACTIVE target said "no valid token" while the asking session itself was
// billing that very account — the popup had remapped the linked account to
// '__global__', which no session matches when pool sessions bill the DIR key;
// the shared quota makes any same-identity session's answer authoritative).
function probeUsageForAccountKey(key) {
  const ids = new Set(usageIdentityAccountIds(key));
  for (const [, s] of activeSessions) {
    if (s.backend !== 'claude' || s.mode !== 'chat' || s.host || !s.pty) continue;
    if (!ids.has(resolveUsageKey(s))) continue;
    return probeUsageViaSession(s).then((parsed) => {
      if (parsed) writeUsageCacheForKey(key, parsed);
      return parsed;
    });
  }
  return Promise.resolve(null);
}
app.locals.usageIdentityAccountIds = usageIdentityAccountIds;
// Chat-mode PASSIVE exhaustion signal (zero API calls): the CLI's own
// "You've reached your … limit" banner marks the bucket dead in the cache and
// immediately re-evaluates the pool — this is what makes auto-switch work for
// chat-only accounts (the statusline never runs there).
// Which usage-cache identity does a session's quota belong to? Account-billed
// sessions (local, host-held, linked, pool→target) → the account key (quota
// is a per-account GLOBAL fact — readings merge across machines by identity,
// three-tier design). A REMOTE session on the host's own CLI login has no
// account id → the host bucket (usage-cache/host-<id>.json, the popup's
// machine rows) — resolveUsageKey alone mapped those to '__global__' and
// misattributed the HOST's quota to the LOCAL machine login.
function usageCacheKeyFor(session) {
  if (session?.host && !session._accountId) return 'host-' + session.host;
  return resolveUsageKey(session);
}
// Passive quota capture from the CLI's own rate_limit_event records (B-e5c9,
// 2.289.0) — ONE shared implementation (src/rate-limit-capture.js) for local
// AND remote chat sessions; the caller resolves key/identity as parameters.
// ORG VERIFICATION (B-b3cd, the odometer-flap fix): a hot-switched pool
// session keeps its old token for ≥25min, so its quota signals (rate_limit_
// event readings, limit banners) describe the OLD org's buckets — written
// under the newly-linked account they flapped a half-empty account's 7d
// odometer 48↔95 (34% of this source's anchors jumped >10pt vs a <1h-old
// panel reading; magnitude alone can't gate this — parallel workflows really
// can move >10pt/h, owner-confirmed). The OTel truth stream names the org
// each session's requests actually bill: when it names a DIFFERENT identity
// than the link, the reading/mark belongs to the observed org's account —
// re-attribute the cache key. No observation (OTel absent/remote) or an
// observed-but-unmapped org ⇒ attribute by link, exactly the old behavior.
function orgVerifiedKey(session, key, what) {
  try {
    const obs = getOtelIngest()?.observedOrgFor?.(session.claudeSessionId);
    if (obs && obs.acct && Date.now() - (obs.ts || 0) < 30 * 60e3) {
      const members = usageIdentityAccountIds(key) || [];
      if (!members.includes(obs.acct)) {
        global.__vsEvent?.('usage-reading-reattributed', `${what}:${key}→${obs.acct}`);
        return obs.acct;
      }
    }
  } catch { }
  return key;
}
function recordRateLimitEvent(session, msg) {
  try {
    const ev = parseRateLimitEvent(msg);
    if (!ev) return;
    // Session-scoped actions below (pool switch, auto-resume) stay on THIS
    // session regardless of re-attribution: it is genuinely blocked no
    // matter whose bucket filled.
    const key = orgVerifiedKey(session, usageCacheKeyFor(session), 'rate-limit-event:' + ev.kind);
    const r = captureRateLimitEvent({ cacheDir: USAGE_CACHE_DIR, key, identityIds: usageIdentityAccountIds(key), ev });
    if (r.unknownType) { global.__vsEvent?.('rate-limit-event-unknown-type', r.unknownType); return; }
    global.__vsEvent?.('rate-limit-event', `${key}:${ev.kind}:${ev.status}${r.wroteReading ? ':reading' : ''}`);
    // a reading busts the estimator memo via fetchedAt and becomes an anchor
    // at the next sweep; exhaustion acts NOW (banner parity)
    if (r.dead) {
      maybePoolAutoSwitch(session);                    // another account = seconds, not hours: always preferred
      // …and if there is nowhere to switch to, wait out the reset (2.368.0).
      // Arming is cheap and idempotent; the module disarms itself the moment
      // the session produces work again (a switch that took over, the user's
      // own prompt), so this never races the pool.
      try { getAutoResume()?.armIfEnabled?.(session._webuiId, session, (Number(ev.resetsAt) || 0) * 1000, ev.kind + ' limit'); } catch { }
    } else if (r.wroteReading) {
      try { if (ev.status && ev.status !== 'rejected') getAutoResume()?.noteRecovered?.(session._webuiId, 'fresh non-rejected reading'); } catch { }
      kickPoolEval();
    }
  } catch (e) { console.warn('[usage] rate_limit_event capture failed:', e.message); }
}
function markLimitBanner(session, text) {
  try {
    const hit = ClaudeCodeAdapter.parseLimitBanner(text);
    if (!hit) return;
    // host-aware (2.289.0) — a remote host-login banner belongs to the host
    // bucket, not __global__; org-verified (B-b3cd) — a stale-token session's
    // banner marks the org it is actually ON, not the linked account.
    const key = orgVerifiedKey(session, usageCacheKeyFor(session), 'limit-banner');
    const nowSec = Math.floor(Date.now() / 1000);
    const bump = (b, fallbackResetSec) => ({
      ...(b || {}),
      utilization: 1, status: 'limited',
      // keep a known FUTURE reset; else a bounded guess so the marker self-
      // expires (reset-passed ⇒ full) instead of pinning the account dead
      resetsAt: (Number(b?.resetsAt) || 0) > nowSec ? b.resetsAt : nowSec + fallbackResetSec,
    });
    const applyHit = (cache) => {
      if (hit.kind === 'fiveHour') cache.fiveHour = bump(cache.fiveHour, 5 * 3600);
      else if (hit.kind === 'sevenDay') cache.sevenDay = bump(cache.sevenDay, 24 * 3600);
      else if (hit.kind === 'scoped') {
        const list = Array.isArray(cache.scopedWeekly) ? cache.scopedWeekly : [];
        const i = list.findIndex((x) => String(x?.name || '').toLowerCase() === hit.name.toLowerCase());
        if (i >= 0) list[i] = bump(list[i], 24 * 3600);
        else list.push({ name: hit.name, ...bump(null, 24 * 3600) });
        cache.scopedWeekly = list;
      }
      return cache;
    };
    const fileFor = (id) => path.join(USAGE_CACHE_DIR, String(id).replace(/[^\w.-]/g, '_') + '.json');
    // IDENTITY-GROUP write (2.267.0, anchor-poison root cause): an org-merged
    // login keeps several cache files, and stamping fetchedAt=now onto ONE of
    // them used to PROMOTE that file — week-stale sibling buckets and all —
    // to "freshest" for the anchor sweep (real incident: banner on the idle
    // __global__ file flapped the identity's anchors 51→19→51 and the bounce
    // pair taught a poison rate). Base the promoted write on the identity's
    // FRESHEST file, and mark the same bucket dead in every sibling WITHOUT
    // touching its fetchedAt (a stale file must never gain freshness here).
    const ids = usageIdentityAccountIds(key);
    let base = null, baseAt = -1;
    for (const id of ids) {
      try { const c = JSON.parse(fs.readFileSync(fileFor(id), 'utf-8')) || {}; if ((Number(c.fetchedAt) || 0) > baseAt) { baseAt = Number(c.fetchedAt) || 0; base = c; } } catch {}
    }
    const cache = applyHit(base ? { ...base } : {});
    cache.fetchedAt = Date.now(); cache.source = 'limit-banner';
    fs.mkdirSync(USAGE_CACHE_DIR, { recursive: true });
    const f = fileFor(key);
    fs.writeFileSync(f + '.tmp', JSON.stringify(cache)); fs.renameSync(f + '.tmp', f);
    for (const id of ids) {
      if (id === key) continue;
      try {
        const f2 = fileFor(id);
        let c2; try { c2 = JSON.parse(fs.readFileSync(f2, 'utf-8')) || null; } catch { c2 = null; }
        if (!c2) continue; // never CREATE a sibling file here
        applyHit(c2); // fetchedAt deliberately untouched
        fs.writeFileSync(f2 + '.tmp', JSON.stringify(c2)); fs.renameSync(f2 + '.tmp', f2);
      } catch {}
    }
    global.__vsEvent?.('usage-limit-banner-marked', `${key}:${hit.kind}`);
    maybePoolAutoSwitch(session); // freshest possible exhaustion signal — act now
  } catch (e) { console.warn('[usage] banner mark failed:', e.message); }
}

function maybePoolAutoSwitch(session) {
  try { if (session._accountId) maybePoolAutoSwitchForPool(session._accountId); } catch { }
}
// EVENT-DRIVEN pool evaluation (user-designed after exhaustion #2, 2026-08-09):
// every streamed usage record kicks a (5s-throttled) re-evaluation instead of
// waiting for the timer — combined with the estimator's live odometer, burst
// burns are seen the moment the CLI streams them, not when the ledger scan
// catches up. Zero network; decision reads memory + local files only.
let _poolEvalKickAt = 0;
function kickPoolEval() {
  const now = Date.now();
  if (now - _poolEvalKickAt < 5000) return;
  _poolEvalKickAt = now;
  setImmediate(() => {
    try {
      for (const a of accounts.list().accounts || []) {
        if (a.type === 'pooled' && a.auto) { try { maybePoolAutoSwitchForPool(a.id); } catch { } }
      }
    } catch { }
  });
}
// WORKFLOW usage tailer (2.266.0, user question "不能拦截workflow agents吗"):
// workflow agents are IN-PROCESS API calls writing FILE-ONLY transcripts —
// there is no process to wrap — but tailing the run dir is the same thing at
// the file level: every agent-*.jsonl growth streams its usage records into
// the live odometer within ~1-2s (vs the 30s timer+scan). Armed when the
// launch ack ("Run ID: wf_…") crosses the session's stdout; belt-polled 5s
// (fs.watch can coalesce/miss); torn down after 30min without growth or when
// the session dies. rid-dedup in noteLive makes offset loss/re-reads harmless.
const _wfWatchers = new Map(); // runId → tailer handle
function armWorkflowUsageWatcher(session, sessionId, runId) {
  try {
    if (_wfWatchers.has(runId) || _wfWatchers.size >= 6) return;
    if (session.host) return; // remote runs have no local files; timer+harvest cover them
    const sid = session.claudeSessionId || session.backendSessionId;
    if (!sid || !session.cwd) return;
    const { cwdToProjectDir } = require('../session-store.js');
    const dir = path.join(os.homedir(), '.claude', 'projects', cwdToProjectDir(session.cwd), sid, 'subagents', 'workflows', runId);
    // The tailer RETRIES until the dir exists — the ack beats the harness's
    // mkdir by ~17ms, so the old one-shot existsSync never armed (2.270.0,
    // see src/workflow-usage-tailer.js for the forensics).
    const { createWorkflowTailer } = require('../workflow-usage-tailer.js');
    const tailer = createWorkflowTailer({
      dir,
      isAlive: () => activeSessions.has(sessionId),
      onRecord: (r) => {
        const u = r.message?.usage;
        const rid = r.requestId || r.message?.id; if (!rid) return;
        const cc = u.cache_creation || {};
        const acctKey = resolveUsageKey(session);
        const acct = acctKey === '__global__' ? null : acctKey;
        const model = r.message?.model;
        const cost = (o) => usageHistory._cost({ acct, model, i: 0, o: 0, cw5: 0, cw1: 0, cr: 0, ...o });
        const usd = cost({ i: u.input_tokens || 0, o: u.output_tokens || 0, cw5: cc.ephemeral_5m_input_tokens || 0, cw1: cc.ephemeral_1h_input_tokens || 0, cr: u.cache_read_input_tokens || 0 });
        const cwUsd = cost({ cw5: cc.ephemeral_5m_input_tokens || 0, cw1: cc.ephemeral_1h_input_tokens || 0 });
        const crUsd = cost({ cr: u.cache_read_input_tokens || 0 });
        usageEstimator.noteLive({ rid, accountId: acctKey, model, usd, cwUsd, crUsd });
      },
      onDrain: (n) => {
        // Observability: this feature died silently for four releases because
        // nothing ever reported it running. Both signals are cheap + local.
        global.__vsMetric?.('wf-usage-noted', n);
        if (!_wfWatchers.get(runId)?._announced) {
          const h = _wfWatchers.get(runId); if (h) h._announced = true;
          global.__vsEvent?.('wf-usage-tailer-armed', runId);
        }
        kickPoolEval();
      },
    });
    _wfWatchers.set(runId, tailer);
    // Reap the handle when the tailer gives up (dead session / idle / no dir).
    const reap = setInterval(() => {
      if (_wfWatchers.get(runId) !== tailer) { clearInterval(reap); return; }
      if (tailer._state.stopped) { _wfWatchers.delete(runId); clearInterval(reap); }
    }, 30000);
    if (reap.unref) reap.unref();
  } catch { }
}
// TIMER-driven evaluation (2.263.0, real incident): the event triggers (turn
// `result` records + limit banner) both sit at TURN EDGES — an 8-minute
// review workflow burned an entire 5h window mid-turn with ZERO evaluation
// points and the pool only switched after exhaustion had failed 9 agents.
// Every auto pool now re-evaluates on a 60s timer (per-pool 60s throttle
// unchanged). §ban-safety: local reads only — the ledger scan mines the CLI's
// own transcripts (self-throttled), the decision reads cache files; no
// network anywhere.
setInterval(() => {
  try {
    const pools = (accounts.list().accounts || []).filter((a) => a.type === 'pooled' && a.auto);
    if (!pools.length) return;
    try { usageHistory.scan(); } catch { } // freshen the odometer first (incremental, 15s-throttled)
    for (const a of pools) { try { maybePoolAutoSwitchForPool(a.id); } catch { } }
  } catch { }
  // 30s (was 60s): the 2026-08-09 #2 exhaustion burned HALF the Fable bucket
  // between two ticks (12 concurrent maxed-context agents ≈ $100+/min) — a
  // tighter cadence can't fully close that gap (ledger visibility lags the
  // burn) but halves the blind window; anti-flap now lives in MIN_GAIN_PCT +
  // the proactive margin, not the cadence.
}, 30000);
function credsTokenSig(id) {
  // TOKEN MATERIAL signature, not mtime (review finding: repointPoolSymlink
  // utimes-bumps the target's creds on EVERY re-point, so an mtime-based
  // "somebody re-logged in" check is cleared by the pool's own plumbing).
  try { return String(JSON.parse(fs.readFileSync(accounts.subCredsPath(id), 'utf-8'))?.claudeAiOauth?.accessToken || ''); } catch { return ''; }
}
function memberAuthFailed(id) {
  const m = _memberAuthFail.get(id);
  if (!m) return false;
  if (Date.now() - m.at > AUTH_FAIL_TTL_MS) { _memberAuthFail.delete(id); return false; }
  if (credsTokenSig(id) !== m.tok) { _memberAuthFail.delete(id); return false; } // token CHANGED = re-login/refresh — give it another chance
  return true;
}
function healthyPoolMembers(poolId) {
  const all = accounts.poolMembers(poolId);
  const ok = all.filter((m) => !memberAuthFailed(m.id));
  return ok.length ? ok : all; // every member marked = marks are wrong or the pool is truly dead; let quota logic speak
}

// A running session's CLI reported an AUTH-class API failure (401×2+/403/ban/
// credit message). Quota decisions can't see this — the failed account often
// still shows plenty of remaining — so route around it NOW: mark the member,
// re-point this session's link (and the pool default if it sits on the failed
// member), and say what happened. Runs regardless of `auto`: this is routing
// around a dead account (the 2.330.2 heal's live-session sibling), not quota
// optimization.
function notePoolAuthFailure(session, sid, info = {}) {
  try {
    const poolId = session?._accountId;
    const a = poolId && accounts.get(poolId);
    if (!a || a.type !== 'pooled' || session.host) return;
    if (!classifyAuthFailure(info)) return;
    const memberId = accounts.poolCurrentFor(poolId, sid);
    if (!memberId) return;
    const now = Date.now();
    // throttle PER (member, session) — the member-keyed version left every
    // OTHER conversation pinned to the banned account for 60s each (review
    // finding: 3 sessions on A, A banned, only the first escaped)
    const tkey = memberId + ':' + sid;
    if (now - (_authNoteAt.get(tkey) || 0) < 60000) return;
    _authNoteAt.set(tkey, now);
    const why = info.message ? String(info.message).slice(0, 120) : `HTTP ${info.status}`;
    if (!memberAuthFailed(memberId)) {
      _memberAuthFail.set(memberId, { at: now, reason: why, tok: credsTokenSig(memberId) });
      try { global.__vsEvent?.('pool-member-auth-failed', { detail: `${memberId}: ${why}` }); } catch { }
    }
    const memberName = accounts.get(memberId)?.name || memberId;
    const alive = accounts.poolMembers(poolId).filter((m) => m.id !== memberId && !memberAuthFailed(m.id));
    if (!alive.length) {
      serverNotice(`pool-authfail-stuck-${memberId}-${Math.floor(now / 3600000)}`,
        `Pool "${a.name}": account ${memberName} is failing authentication (${why}) and no other member can take over — re-login or replace it in Manage Agents.`, { level: 'warn' });
      return;
    }
    const ranked = rankPoolMembers({ members: alive, readCache: poolReadCache(poolId), nowSec: now / 1000 });
    const to = (ranked[0] && ranked[0].id) || alive[0].id;
    const toName = accounts.get(to)?.name || to;
    const hasOwnLink = (() => { try { fs.lstatSync(accounts.sessionPoolLinkPath(poolId, sid)); return true; } catch { return false; } })();
    if (hasOwnLink) accounts.ensureSessionPoolLink(poolId, sid, to);
    const defaultMoved = accounts.poolCurrent(poolId) === memberId;
    if (defaultMoved) accounts.setPoolTarget(poolId, to);
    _poolSwitchAt.set(poolId + ':' + sid, now); // keep the quota pass's dwell belt consistent with this move
    try { recordUsageAttribution({ claudeSessionId: session.claudeSessionId || session.backendSessionId, accountId: poolId }); } catch { }
    if (now - (_authNoticeAt.get(memberId) || 0) > 60000) {
      _authNoticeAt.set(memberId, now);
      serverNotice(`pool-authfail-${memberId}-${now}`,
        `Pool "${a.name}": account ${memberName} is failing authentication (${why}) — switched to ${toName}.${a.hot ? '' : ' Restarting the conversation to apply it.'}`, { level: 'warn' });
    }
    console.log(`[pool] auth-failure evict ${poolId}/${sid}: ${memberId} → ${to} (${why})`);
    if (!a.hot) {
      // a DEFAULT-link move affects every session billing through the default
      // (no own link), not just the reporter — collect them all (review)
      const affected = [];
      const pack = (theSid, s3) => ({ serverId: theSid, backend: s3.backend || 'claude', backendSessionId: s3.claudeSessionId || s3.backendSessionId || null, cwd: s3.cwd || null, name: s3.name || null, host: s3.host || null });
      affected.push(pack(sid, session));
      if (defaultMoved) {
        for (const [sid2, s2] of activeSessions) {
          if (sid2 === sid || s2._accountId !== poolId || s2.host) continue;
          const own = (() => { try { fs.lstatSync(accounts.sessionPoolLinkPath(poolId, sid2)); return true; } catch { return false; } })();
          if (!own) affected.push(pack(sid2, s2));
        }
      }
      const payload = JSON.stringify({ type: 'pool-auto-switched', poolId, affected });
      for (const c of wss.clients) { if (c.readyState === WS_OPEN) { try { c.send(payload); } catch { } break; } }
    }
  } catch (e) { console.warn('[pool] auth-failure evict failed:', e.message); }
}

function maybePoolAutoSwitchForPool(poolId) {
  try {
    if (!poolId) return;
    const a = accounts.get(poolId);
    if (!a || a.type !== 'pooled' || !a.auto) return;
    const now = Date.now();
    if ((now - (_poolAutoLast.get(poolId) || 0)) < 10000) return; // event-driven kicks need a tight gate; anti-flap = MIN_GAIN, not cadence
    const currentId = accounts.poolCurrent(poolId);
    if (!currentId) return;
    // ESTIMATED bucket view (B-fcff v2): the raw cache goes stale the moment
    // its session pauses — overlay dead-reckoned utilizations (anchor + rate ×
    // ledger cost since) so the decision sees NOW, not the last reading. The
    // estimator abstains per bucket when it has nothing better; those keep raw.
    const readCache = (id) => {
      let raw = null;
      try { raw = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, id + '.json'), 'utf-8')); } catch { }
      // ORG-MERGED identities keep TWO cache files (__global__ + the named
      // sub) and ground truth lands in whichever one the refresh targeted —
      // during the 2026-08-09 #2 exhaustion the ⟳ readings (Fable 34%→51%)
      // went to __global__.json while this decision read the sub's file
      // frozen at 01:23. Read through the IDENTITY GROUP: freshest file wins.
      try {
        for (const [, g] of usageIdentityGroupsCached()) {
          if (g.accountIds.includes(id) && g.cache && (g.cache.fetchedAt || 0) > (raw?.fetchedAt || 0)) { raw = g.cache; break; }
        }
      } catch { }
      try { return estOverlayCache(raw, usageEstimator.estimateFor(id, raw, now)); } catch { return raw; }
    };
    // proactive EDF tier only for HOT pools (re-point is free — no restart);
    // cold pools switch on exhaustion only (each switch restarts conversations).
    // Hot pools also treat est<10% as exhaustion (提前切 — switch BEFORE the
    // limit interrupts a long-running workflow; cold keeps 5%).
    // SEALED ORDERS push (design §Pool management, 2.300.0): after every
    // evaluation the holding device (device #0 — pools are local-only) gets
    // the pool's ranked member snapshot. It executes a LOCAL fallback switch
    // ONLY when it both sees a hard limit banner AND cannot reach this
    // server; executions are reported on reconnect and re-attributed below.
    // OBSERVE the rejection: hosts.device(null) throws while the local daemon
    // is down/upgrading, and an unobserved rejection is a process-level
    // unhandledRejection on every eval tick (the deviceBounded ② rule)
    pushSealedOrders(poolId).catch((e) => { if (!_poolOrdersWarned) { _poolOrdersWarned = true; console.warn('[pool] sealed-orders push unavailable:', e.message); } });
    // ── Per-SESSION pass (plan C): sessions with their OWN link decide on a
    // FAMILY-PROJECTED view and re-point only their link — an opus session's
    // spent cap never evicts a fable session, and vice versa. Sessions whose
    // family is unknown project nothing (full view = legacy semantics).
    const members = healthyPoolMembers(poolId); // auth-failed members are not candidates (2.335.0)
    for (const [sid, s2] of activeSessions) {
      if (s2._accountId !== poolId || s2.host) continue;
      let curFor = null;
      try { curFor = accounts.poolCurrentFor(poolId, sid); } catch { }
      const hasOwnLink = (() => { try { fs.lstatSync(accounts.sessionPoolLinkPath(poolId, sid)); return true; } catch { return false; } })();
      if (!hasOwnLink || !curFor) continue;
      const fam = familyOfModel(sessionModelFor(s2));
      const projected = (id) => projectCacheForFamily(readCache(id), fam);
      const ds = decidePoolSwitch({ currentId: curFor, members, readCache: projected, nowSec: now / 1000, proactive: !!a.hot, hot: !!a.hot, pessimism: darkTaintedAccounts() });
      if (!ds || !ds.to) continue;
      const dwellKey = poolId + ':' + sid;
      const lastS = _poolSwitchAt.get(dwellKey) || 0;
      if (now - lastS < 180000 && !(ds.fromRemaining != null && ds.fromRemaining < POOL_HARD_PCT)) continue;
      _poolSwitchAt.set(dwellKey, now);
      try {
        accounts.ensureSessionPoolLink(poolId, sid, ds.to);
        try { recordUsageAttribution({ claudeSessionId: s2.claudeSessionId || s2.backendSessionId, accountId: poolId }); } catch { }
        const toName = accounts.get(ds.to)?.name || ds.to;
        serverNotice(`pool-sess-${sid}-${now}`, `Pool "${a.name}": conversation "${s2.name || sid}" moved to ${toName}${fam ? ` (its ${fam} quota${ds.fromRemaining != null ? ` was at ${Math.round(ds.fromRemaining)}%` : ''})` : ''}${a.hot ? '' : ' — restarting it'}`);
        console.log(`[pool] per-session switch ${poolId}/${sid}: ${curFor} → ${ds.to} (fam=${fam || '?'}, from ${ds.fromRemaining}%)`);
        if (!a.hot) {
          const payload = JSON.stringify({ type: 'pool-auto-switched', poolId, affected: [{ serverId: sid, backend: s2.backend || 'claude', backendSessionId: s2.claudeSessionId || s2.backendSessionId || null, cwd: s2.cwd || null, name: s2.name || null, host: s2.host || null }] });
          for (const c of wss.clients) { if (c.readyState === WS_OPEN) { try { c.send(payload); } catch {} break; } }
        }
      } catch (e) { console.warn('[pool] per-session re-point failed:', e.message); }
    }
    const d = decidePoolSwitch({ currentId, members, readCache, nowSec: now / 1000, proactive: !!a.hot, hot: !!a.hot, pessimism: darkTaintedAccounts(), explain: true });
    if (!d) return;
    if (!d.to) {
      // A pool sitting on a DEAD account with nowhere to go used to be
      // completely silent — the user found out by hitting a limit mid-turn
      // (real incident 2026-08-11). Say it, once per hour per pool: this is
      // the state where only the user can act (add a member, wait for a
      // reset, switch that conversation off the pool).
      // EVERY non-actionable outcome must speak, not just 'stuck' (2.313.0):
      // when the candidate gate drops every member the code returns through
      // 'no-members' instead, which was silent — the same "pool sits on a dead
      // account while the user finds out by hitting a limit" incident down a
      // different branch. `_sentNotices` is a per-BOOT permanent Set, so the
      // key must carry an hour bucket or a recurrence is never reported again.
      if (d.reason === 'stuck' || d.reason === 'no-members' || d.reason === 'no-settleable') {
        // Say WHICH buckets are dead. "Every member is out of quota" is wrong
        // under the nested model and points at the wrong action (pay/wait a
        // week) when the truth is usually "one model's weekly cap is spent
        // while the 7-day budget still has 40% left".
        const dead = (d.deadBuckets || []).join(', ');
        const live = (d.liveBuckets || []).join(', ');
        const what = dead ? `spent: ${dead}` : 'out of quota';
        const rest = live ? ` (still available: ${live})` : '';
        const alt = d.bestRemaining != null ? ` The best other member is at ${Math.round(d.bestRemaining)}%.` : '';
        const why = d.reason === 'no-members'
          ? `no member can serve it — ${what}${rest}`
          : `nowhere better to go — ${what}${rest}`;
        serverNotice(`pool-blocked-${poolId}-${d.reason}-${Math.floor(now / 3600000)}`,
          `Pool "${a.name}": ${why}.${alt} Conversations on it will hit a limit until a window resets, you add a member, or you move them off the pool.`, { level: 'warn' });
      }
      return;
    }
    // DWELL belt (2.266.1, real oscillation report): every switch cold-starts
    // the running sessions' prompt caches on BOTH accounts — expensive. After
    // any switch, further switches wait 3min unless the current target is
    // HARD-dead (<5%, genuinely unusable — escaping immediately is cheaper
    // than idling on a dead account). The settle-bar in decidePoolSwitch is
    // the primary anti-oscillation; this is the belt.
    const lastSwitch = _poolSwitchAt.get(poolId) || 0;
    if (now - lastSwitch < 180000 && !(d.fromRemaining != null && d.fromRemaining < POOL_HARD_PCT)) return;
    _poolSwitchAt.set(poolId, now);
    _poolAutoLast.set(poolId, now);
    accounts.setPoolTarget(poolId, d.to);
    // Re-attribute every live session on this pool from this moment — the
    // ledger's by-time attribution resolves pool → current target at record
    // time, so a fresh record moves subsequent requests to the new account.
    const affected = [];
    for (const [sid, s] of activeSessions) {
      if (s._accountId !== poolId) continue;
      // plan C: a session with its own link didn't move with the default —
      // restarting it for the pool-level switch would be the old collateral
      try { fs.lstatSync(accounts.sessionPoolLinkPath(poolId, sid)); continue; } catch { }
      try { recordUsageAttribution({ claudeSessionId: s.claudeSessionId || s.backendSessionId, accountId: poolId }); } catch {}
      affected.push({ serverId: sid, backend: s.backend || 'claude', backendSessionId: s.claudeSessionId || s.backendSessionId || null, cwd: s.cwd || null, name: s.name || null, host: s.host || null });
    }
    const fromPct = d.fromRemaining != null ? Math.round(d.fromRemaining) : null;
    serverNotice(`pool-auto-${poolId}-${now}`, d.reason === 'edf'
      ? `Pool "${a.name}" switched to ${d.toName} — draining the member whose weekly quota resets soonest (use-it-or-lose-it)`
      : `Pool "${a.name}" auto-switched to ${d.toName} (previous account down to ${fromPct}% remaining)${a.hot ? '' : ' — restarting its conversations'}`);
    console.log(`[pool] auto-switch ${poolId}: ${currentId} → ${d.to} (${d.reason}, from ${fromPct}% left, hot=${!!a.hot}, affected=${affected.length})`);
    if (!a.hot && affected.length) {
      // ONE client only — every client acting would race duplicate restarts.
      const payload = JSON.stringify({ type: 'pool-auto-switched', poolId, affected });
      for (const c of wss.clients) { if (c.readyState === WS_OPEN) { try { c.send(payload); } catch {} break; } }
    }
  } catch (e) { console.warn('[pool] auto-switch check failed:', e.message); }
}
// Alias-tolerant model compare (server twin of the client's _modelMismatch):
// 'fable' vs 'claude-fable-5' is NOT a mismatch; [1m] suffixes ignored.
function modelsMatch(a, b) {
  if (!a || !b) return true;
  const core = (m) => String(m).toLowerCase().replace(/^claude-/, '').replace(/\s*\[1m\]$/, '').trim();
  const x = core(a), y = core(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
}
// Per-conversation MODEL LOCK v2 (#6, semantics per the user's correction):
// fallback stays ALLOWED (the flagged turn completes on the fallback model),
// but at each turn end a locked session whose SERVED model drifted away is
// re-pinned via set_model — so every subsequent turn re-attempts the original
// model instead of staying degraded forever (switchModelsOnFlag switches the
// session's model persistently on a safety reroute; this undoes it per turn).
// The set_model echo ("Set model to …") lands in the chat as the visible trace.
function maybeRepinLockedModel(session) {
  try {
    if (!session._modelLocked || !session._lockedModel || !session.pty || session.mode !== 'chat') return;
    if (modelsMatch(session._servedModel, session._lockedModel)) return;
    const adapter = adapterRegistry.get(session.backend);
    if (!adapter?.formatSetModel) return;
    session.pty.write(adapter.formatSetModel(session._lockedModel) + '\n');
    global.__vsEvent?.('model-lock-repin', `${session._servedModel || '?'}->${session._lockedModel}`);
  } catch (e) { console.warn('[model-lock] repin failed:', e.message); }
}

function maybeStopOnFallback(session, id, from, to) {
  try {
    if (serverSetting('claude.disableModelFallback') !== true) return;
    if (session._fallbackStopFired || session.mode !== 'chat' || !session.pty) return;
    const adapter = adapterRegistry.get(session.backend);
    if (!adapter?.formatInterrupt) return;
    session._fallbackStopFired = true;
    session.pty.write(adapter.formatInterrupt() + '\n');
    adapter.postInterrupt(session, id);
    // Belt-and-braces: also disarm fallback in this CLI for the rest of the
    // session, so the next turn stops at the refusal instead of re-routing.
    try { if (adapter.formatSetFallbackPolicy) session.pty.write(adapter.formatSetFallbackPolicy(true) + '\n'); } catch {}
    global.__vsEvent?.('fallback-auto-stop', `${from || '?'}->${to || '?'}`);
    broadcastToSession(session, id, {
      type: 'server-notice', key: `fallback-stop:${id}:${Date.now()}`, level: 2,
      text: `Model fallback detected (${from || '?'} → ${to || '?'}) — turn stopped because "Disable model fallback" is on. Send a new message to continue on your model.`,
    });
  } catch (e) { console.warn('[fallback-stop] failed:', e.message); }
}

// SyncStore imported from ./src/sync-store.js

  return {
    _vsuPending, usageAnchors, usageEstimator,
    armWorkflowUsageWatcher, darkSources, darkTaintedAccounts, kickPoolEval,
    markLimitBanner, maybePoolAutoSwitch, maybePoolAutoSwitchForPool, notePoolAuthFailure,
    maybeRepinLockedModel, maybeStopOnFallback, modelsMatch,
    poolChooserForModel, poolReadCache, probeUsageForAccountKey,
    probeUsageViaSession, recordRateLimitEvent, resolveUsageKey,
    sessionModelFor, sweepUsageAnchors, usageCacheKeyFor,
    usageIdentityAccountIds, usageIdentityGroups, usageIdentityGroupsCached,
    writeUsageCacheForKey, clearSealedOrders, pushSealedOrders,
    estOverlayCache, predictCalib,
  };
}
module.exports = { create };
