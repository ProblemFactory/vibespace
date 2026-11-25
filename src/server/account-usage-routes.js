'use strict';
// ACCOUNT + USAGE ROUTES (decomposition #9): the central telemetry collector
// ingest, the usage-stats ledger routes (aggregate/pivots/pricing/rid-info),
// and the full accounts route family — Claude multi-subscription, pooled
// pseudo-accounts, long-lived tokens (oat01), Codex multi-subscription.
// Extracted VERBATIM. ORCH tier: decisions stay in src/accounts.js /
// account-pool-auto.js; this is HTTP wiring.
const fs = require('fs');
const os = require('os');
const { oauthUsageAccount } = require('../backend-caps.js'); // PURE: caps.oauthUsage — the OAuth usage-poll accounts
const { firstSigninDefault } = require('../signin-model.js'); // PURE (lane signin-card-real-screen): the card's first sign-in becomes the default only where nothing else could serve
const path = require('path');
const { spawn } = require('child_process');

const { mk } = require('./lazy.js');
const AT = require('../routes/account-tails.js');   // B-ee0a: the no-vault credential door's person check; a paired machine's CLI-key tail kept

// The only=pivots answer (B-f95d ②): the asked crosses + the words that qualify them (as of / partial).
const pivotsOnly = (a) => ({ pivots: a.pivots || {}, ...(a.asOf ? { asOf: a.asOf } : {}), ...(a.partial ? { partial: a.partial } : {}) });

// B-574d unit 1 (主开发 r3455 hold 1): accounts.json is written by the store writer, so A PERSON's ACCOUNT ACT (a key, a sign-in, a
// long-lived token, a pool, a name) answers only once its save is ON DISK, as the release's synchronous write was before its reply.
// ONE place for every /api/accounts write route (registered above them all, here and in the routes this module and usage-routes.js
// register later): a reply made after the act saved waits for the landing; not on disk ⇒ 503 by name (the change is kept and written
// again), never a silent «saved». A reply whose act saved nothing is not held. Agents' and machines' saves do not pass here.
function answerAfterLanding(accounts, res, ctx = null) {
  if (typeof accounts.persisted !== 'function') return;
  const seq0 = typeof accounts.saveSeq === 'function' ? accounts.saveSeq() : 0, json = res.json.bind(res);
  // r3763 (the should): THIS request's saves (the door's context counts the saves made in its async chain); without a context (a caller
  // outside the door) the manager's own count since the request began
  const savedHere = () => (ctx ? ctx.saves > 0 : typeof accounts.saveSeq === 'function' && accounts.saveSeq() !== seq0);
  res.json = (body) => {
    if (!savedHere() || res.statusCode >= 400) return json(body);   // r3977: an error reply (a failed act) is never held for a landing
    // r3763 REQUIRED 3: THE WRITER's OWN ANSWER ROAD (persisted(answer) → durable(file, {answer})): a reply made there goes out even
    // inside the hub's exit flush — a reply made from a promise's then is never sent at a stop, and a retry after the restart would add
    // the same sign-in twice
    accounts.persisted((ok) => {
      try { require('../store-writer.js').identityAtExit(res); } catch { }   // an answer on the landing's road may be made inside the exit's flush
      if (ok || res.statusCode >= 400) return json(body);
      const w = (typeof accounts.whyNotDurable === 'function' && accounts.whyNotDurable()) || {};
      // r3763 (the should): the act's own answer kept beside it (a mint's id, a sign-in's start) — never replaced by the words alone
      res.status(503); return json({ ...(body && typeof body === 'object' && !Array.isArray(body) ? body : {}), error: `saved here, but accounts.json is not on disk yet${w.why ? ` (${w.why})` : ''} — VibeSpace keeps the change and writes it again`, code: 'not-durable', notOnDisk: true });
    });
    return res;
  };
}

// 主开发 r3977 (1): A FAILED LANDING IS SAID AS WHAT IT IS — 503 not-durable by its code (the page's own «not on disk» words), never a plain refusal
const notDurable = (res, e, extra = {}) => res.status(503).json({ error: e.message, code: 'not-durable', notOnDisk: true, ...(e.landingOwed ? { kept: true } : { notKept: true }), ...extra });
const failAcct = (res, e) => (e && (e.code === 'accounts_unread' || e.code === 'providers_unread' || e.code === 'providers_damaged') ? res.status(503).json({ error: e.message, code: e.code }) : e && e.code === 'pool_changed_elsewhere' ? res.status(409).json({ error: e.message, code: e.code }) : e && e.code === 'not-durable' ? notDurable(res, e) : res.status(400).json({ error: e.message }));   // (r3886 (B), r3908) a list change while the provider store cannot be read, and a stale dialog's edit, answer their codes

function create({ app, rootDir, HOST, CLAUDE_CMD, cliCmds = null, NODE_CMD,
  CLAUDE_SUBSCRIPTION_LOGIN_HELPER, activeSessions, auth, engine,
  serverSetting, recordUsageAttribution, liveAccountIdSet, broadcastActiveSessions = () => { }, broadcastAll = () => { },
  buildClaudeSubscriptionLoginCommand, getAccounts, getHosts, getMounts, getModels = () => ({}), refreshModels = () => { }, getIntegrations = () => null,
  getTelemetry, getUsageHistory, getLoginExpiryWatch, getCliCmds = () => null, harnessSetting = null }) {
  const { clearSealedOrders } = engine;
  // r4: a conversation whose cold restart is already in flight is never handed to
  // a client again (a second request resumes it twice) — the engine's ONE rule
  const claimRestarts = (affected) => (typeof engine.claimColdRestarts === 'function' ? engine.claimColdRestarts(affected) : affected);
  const accounts = mk(getAccounts);
  // the B-f276 family (lane bl-windows, 主开发 r3104 (a)) — registered FIRST, before every /api/accounts route of this module: while the accounts are HELD every road that looks an account up — by id, a
  // pool, a sign-in, a key, a tail — answers the hold's words (503 accounts_unread), never «unknown account» / «not found» from the
  // EMPTY list; the list itself (GET /api/accounts) answers with `held`
  if (typeof app.use === 'function') app.use('/api/accounts', (req, res, next) => {
    let h = null; try { h = typeof accounts.held === 'function' ? accounts.held() : null; } catch { h = null; }
    if (h && !(req.method === 'GET' && (req.path === '/' || req.path === ''))) return res.status(503).json({ error: h.why, code: 'accounts_unread' });
    if (req.method !== 'GET') { const ctx = { saves: 0 }; answerAfterLanding(accounts, res, ctx); return require('../accounts.js').countingSaves(ctx, next); }   // the request's saves counted in its own context (r3763)
    return next();
  });
  const hosts = mk(getHosts);
  const mounts = mk(getMounts);
  const telemetry = mk(getTelemetry);
  const usageHistory = mk(getUsageHistory);
  // THE SHADOW USAGE INDEX IS RETIRED (row B-360d unit 1, the design read w0r2kz4cb law 1): the Usage window answers from the
  // ledger's own cells (usage-history aggregateCells); one derived store, no second copy of every row on disk.
  setTimeout(() => { require('./usage-index-retire.js').removeRetiredUsageIndex({ dataDir: path.join(rootDir, 'data') }).catch(() => { }); }, 30000).unref?.();   // its files leave the hub's disk at every start, off the loop (law 1)
  // THE MANUAL RESET-CREDIT USE (design-reset-credits p2): the preview + the
  // POST, thin over the engine (src/routes/reset-credit.js)
  require('../routes/reset-credit.js').registerResetCreditRoutes(app, { engine });
  // THE ACCOUNT'S MODELS (design q-053 r1 §3, lane provider-record): data/providers.json + the account dialog's model
  // section's two routes (src/routes/account-models.js); a built-in provider's rows are its harness's catalog NOW
  const providers = require('./provider-store.js').create({ dataDir: path.join(rootDir, 'data'), catalogOf: (h) => { const m = getModels(); return m && Array.isArray(m[h]) ? m[h] : null; }, onLift: () => { try { broadcastAll({ type: 'providers-changed', what: 'read', id: null }); } catch { } try { if (typeof accounts.providersChanged === 'function') accounts.providersChanged(); } catch { } } });   // (B-f276 family) a held providers.json read again: every list re-reads
  if (typeof accounts.setProviderLookup === 'function') accounts.setProviderLookup((acct) => providers.forAccount(acct), { clean: typeof providers.readClean === 'function' ? () => providers.readClean() && !(typeof providers.damaged === 'function' && providers.damaged()) : true, unread: () => (typeof providers.unread === 'function' ? providers.unread() : null), damaged: () => (typeof providers.damaged === 'function' ? providers.damaged() : null) }); /* (the move onto 2.369.418) the store-read hold's LIVE answer, read at each prune: held, or lifted EMPTY over torn bytes kept aside (as the Vault's remover refuses a key a kept copy names), is the cure's «unreadable» — nothing pruned; a value read once at the start refused every prune after a held start lifted */ // SEAM (int329): wire P0a's provider store into P0b/latents' pool decisions when the account manager supports it (a usage-only route stub passes getAccounts:()=>({})) — accounts.memberProviderOf then reads each account's provider record (q-053 P0b / q-055 M1-M2)
  // lane lg-providers U2: a `pv-<id>` account spawns through the provider's own road (its key from the vault, its own empty home)
  if (typeof accounts.setFallbackStatusLookup === 'function' && typeof engine.fallbackStatus === 'function') accounts.setFallbackStatusLookup((id) => engine.fallbackStatus(id));   // (B-d578 F3b) the pool row's fallback counts
  if (typeof accounts.setProviderRows === 'function') accounts.setProviderRows(() => { const open = (() => { try { const v = require('../secret-box.js').vaultForDir(path.join(rootDir, 'data')); return !!v && v.state() === 'unlocked'; } catch { return false; } })(); return require('../model-providers.js').rosterRowsOf(providers.thirdParty(), { usable: (p) => open && providers.hasKey(p.id), whyNot: (p) => (!open ? 'vault-locked' : !providers.hasKey(p.id) ? 'no-key' : null) }); });   // lane lg-providers U5: the rows every page lists (U1 cure: usable = the vault open AND the record's entry in it, read off its names)
  if (typeof accounts.setProviderSpawn === 'function') accounts.setProviderSpawn(require('./provider-spawn.js').create({ providers, dataDir: path.join(rootDir, 'data') }), (id, be, model) => require('./provider-spawn.js').modelFor(providers, id, model, be));
  require('../routes/account-models.js').registerAccountModelRoutes(app, { accounts, providers });
  // THE THIRD-PARTY PROVIDERS (lane lg-providers, B-d578 U1): the wizard's doors — add from a shipped preset (the key sealed
  // in the vault first), a new key, rename / address / default, remove; each write re-announces the account lists
  // THE PROVIDER TEST (lane lg-providers U4): the harness's own CLI, once, at a person's press — empty homes, a third party only
  const tester = require('./provider-test.js').create({ providers, cliFor: async (be) => { const c = getCliCmds(); if (c && typeof c.check === 'function') return c.check(be, { force: true }); return c && typeof c.current === 'function' ? c.current(be) : null; }, agentEnv: () => require('../ws-handler').agentEnv() });   // cliFor: the CLI the login shell finds now (as the usage door)
  require('../routes/providers.js').registerProviderRoutes(app, { providers, tester, onChange: ({ what, id }) => { try { broadcastAll({ type: 'providers-changed', what, id }); } catch { } try { if (typeof accounts.providersChanged === 'function') accounts.providersChanged(); } catch { } } });
  // MODELS AT A SESSION (q-053 §3, lane models-at-session): a new / running conversation's menu = its account's provider's rows
  // (GET /api/available-models?session= | ?backend=&account=), and the listed-provider refresh — a person's press, the vault
  // open, once a minute, cached on the record (src/server/provider-models.js: THE one new vendor request)
  const refresher = require('./provider-models.js').create({ providers, vaultState: () => { const v = require('../secret-box.js').vaultForDir(path.join(rootDir, 'data')); return v ? v.state() : 'not_set_up'; }, keyOf: require('./provider-models.js').vaultKeyOf({ getIntegrations, providers }) });
  // THE CLI'S OWN MODEL LIST (lane agy-models-report): `agy models` for ONE account on a person's act — a model menu OPENED or
  // «Refresh from Antigravity» — never a timer, never at boot, never per spawn (src/server/cli-models-door.js); its completion
  // re-reads every open menu once (available-models-dirty — that re-read carries no `list`, so it cannot list again)
  // the maker returns the door AND its mint, once: the mint goes to the ONE route registrar below, never anywhere else
  const { door: modelsDoor, mint: modelsMint } = require('./cli-models-door.js').createCliModelsDoor({
    accounts, harnessOf: (id) => { try { return require('../harnesses').get(id); } catch { return null; } },
    cliCmds: { check: (...a) => (getCliCmds() ? getCliCmds().check(...a) : Promise.resolve(null)), current: (be) => (getCliCmds() ? getCliCmds().current(be) : null) },
    dataDir: path.join(rootDir, 'data'), agentEnv: () => require('../ws-handler').agentEnv(),
    onListed: ({ backend, account }) => { try { broadcastAll({ type: 'available-models-dirty', backend, account }); } catch { } },
  });
  require('../routes/provider-models.js').registerProviderModelRoutes(app, { accounts, providers, activeSessions, catalogOf: (h) => { const m = getModels(); return m && Array.isArray(m[h]) ? m[h] : null; }, refreshModels, refresher, modelsDoor, modelsMint });
// A SUCCESSFUL LOGIN is the one moment the login-expiry watch's picture is
// stale by construction: the deadline it warned about no longer exists. Its
// poll is 5 min, which is a long time to keep staring at a red chip and an
// inbox item about the thing you JUST fixed — so every finalize route sweeps
// it right here. The sweep is the SINGLE reader: it asks accounts.loginStateOf
// (exactly what the roster row's `loginState` — the chip — is built from), so
// the chip and the inbox can never disagree about what it found, and there is
// no second credential reader to drift. Failure is logged, never thrown: a
// login must not fail because a follow-up sweep did.
const sweepLoginExpiry = (why) => {
  try {
    const w = getLoginExpiryWatch ? getLoginExpiryWatch() : null;
    if (!w?.sweep) return null;
    const r = w.sweep();
    const cleared = (r?.resolved || []).reduce((n, x) => n + (x.n || 0), 0);
    if (cleared) console.log(`[login-expiry] immediate sweep after ${why}: ${cleared} warning(s) cleared`);
    return r;
  } catch (e) { console.log('[login-expiry] immediate sweep failed:', e.message); return null; }
};
// ONCE PER LOGIN, NOT ONCE PER POLL (round-2 verifier). `/relogin-finalize` is
// a WATCHER endpoint: manage-agents polls it every 3 s for up to 5 minutes,
// and for a record whose login is already on disk the answer is the SAME
// `outcome:'same'` every time. A side effect hung on that answer runs ~100×
// per re-login — a polled route may not carry an unbounded per-call side
// effect.
//
// It also cannot be a plain "already swept this account" latch. Re-logging an
// account that is STILL logged in answers 'same' from the very first poll,
// minutes before the user finishes the browser flow, so a boolean latch would
// skip exactly the sweep that matters. The gate is therefore the answer's own
// CREDENTIAL FINGERPRINT — the fields that can only change when the file the
// login writes changes: which outcome, which record, which identity, which
// access token. Same fingerprint ⇒ the credentials did not move ⇒ there is
// nothing new for the watch to find. This reads the ANSWER the route already
// has; it is NOT a second credential reader (the sweep stays the single one).
const lastLoginFingerprint = new Map(); // accountId → fingerprint of the last answer we swept on
const FINGERPRINT_CAP = 500;            // bounded by the roster in practice; a hard ceiling anyway
const loginFingerprint = (r) => {
  const a = r?.account || r; // reloginResolve WRAPS the finalize result; finalizeSubscription IS it
  return [r?.outcome || '', a?.id || r?.movedTo?.id || '', String(a?.email || r?.freshEmail || '').trim().toLowerCase(), a?.expiresAt ?? ''].join('|');
};
/** Sweep only on the TRANSITION — the first finalize answer that differs from
 *  the last one we swept for this record. Returns whether it swept. */
const sweepOnLoginTransition = (id, r, why) => {
  const fp = loginFingerprint(r);
  if (lastLoginFingerprint.get(id) === fp) return false;
  if (lastLoginFingerprint.size >= FINGERPRINT_CAP) lastLoginFingerprint.clear();
  lastLoginFingerprint.set(id, fp);
  sweepLoginExpiry(why);
  return true;
};
// A LOGIN SUCCEEDING IS ALSO A QUOTA EVENT (2026-09-08, the new-member
// incident). The member that just logged in has NO usage reading, and "no
// usage data" is precisely what the pool and auto-resume saw for the fresh
// subscription the owner added in the middle of a full-pool exhaustion: the
// pool parked eight conversations on it, auto-resume re-armed them for a reset
// EIGHT HOURS out, the auto-cli panel read failed and backed off, and nothing
// ever looked again — the owner released them by typing. So the ONE read of
// that member's usage and the pool re-evaluation that follows it hang HERE,
// on the login edges the finalize routes already detect.
//
// SAME TRANSITION DETECTION, ITS OWN LATCH. The predicate is the existing
// `loginFingerprint` — the fields that can only change when the file the login
// writes changes, read off THE ANSWER THE ROUTE ALREADY HOLDS (never a second
// credential reader). `/relogin-finalize` is polled every 3 s for up to 5 min,
// and the Add-subscription and codex device-auth finalizes are polled the same
// way, so a side effect hung on the raw answer would run ~100× per login and
// spawn ~100 CLI panels. The latch is separate from the expiry sweep's on
// purpose: those two routes call `sweepLoginExpiry` UNCONDITIONALLY (there is a
// documented reason — the pre-merge sweep is the only one on every non-merge
// exit), so sharing one map would silently couple "we already swept" to "we
// already read the usage" and disabling either would disable the other.
//
// WAKE THE RECORD THE LOGIN LANDED IN, not the record that was asked about:
// 'moved' relocated the credentials into ANOTHER record, and the auto-merge
// exit keeps the SURVIVOR. Waking the throwaway would spawn a panel read for a
// record about to stop existing and leave the one the pool actually holds
// unread.
//
// FIRE-AND-FORGET: a login must never wait on, or fail because of, a quota
// read. The promise is returned only so a test can await the edge.
const lastWakeFingerprint = new Map(); // accountId → fingerprint of the last answer we woke on
const wakeOnLoginSuccess = (id, r, why, memberId = null) => {
  try {
    const target = memberId || id;
    if (!target) return null;
    const fp = loginFingerprint(r);
    if (lastWakeFingerprint.get(id) === fp) return null;
    if (lastWakeFingerprint.size >= FINGERPRINT_CAP) lastWakeFingerprint.clear();
    lastWakeFingerprint.set(id, fp);
    const p = Promise.resolve(engine.onMemberLoginSuccess?.(target, why))
      .catch((e) => { console.log('[pool] login wake failed:', e.message); return null; });
    // OBSERVABILITY SEAM, not a control path: nothing in production reads this.
    // A fire-and-forget side effect is exactly the shape a regression can pass
    // vacuously against ("it did not fire" is indistinguishable from "we looked
    // too early"), so the promise is parked where the suite — and a human in a
    // REPL — can await the edge before asserting about it.
    app.locals._lastLoginWake = p;
    return p;
  } catch (e) { console.log('[pool] login wake failed:', e.message); return null; }
};
// ── Central collector (team deployments): other instances POST their batches
// here (telemetry.forwardUrl → https://<collector>/api/telemetry/ingest).
// Enabled ONLY when VIBESPACE_TELEMETRY_INGEST_TOKEN is set — the shared
// Bearer token is both the on-switch and the whole gate (cookie-auth exempt
// in auth.js: remote instances have no cookie). Same privacy model as local
// events: names/stacks/metrics only, never content. ──
const TELEMETRY_INGEST_TOKEN = (process.env.VIBESPACE_TELEMETRY_INGEST_TOKEN || '').trim();
app.post('/api/telemetry/ingest', (req, res) => {
  // THE COLLECTOR'S VERDICT (src/telemetry.js) — one gate for this door and the maintainer hub's feedback doors
  const gate = require('../telemetry').collectorVerdict(req.headers.authorization, TELEMETRY_INGEST_TOKEN);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
  res.set(require('../feedback-forward-model.js').VERSION_HEADER, require('../../package.json').version);   // lane feedback-forward-404: a paused feedback forward asks again when its hub's release moves
  try {
    const n = telemetry.ingestRemote(req.body?.instance, req.body?.events);
    res.json({ success: true, n });
  } catch { res.json({ success: true, n: 0 }); }
});
app.get('/api/telemetry/central-summary', async (req, res) => {   // B-360d unit 2: the fleet's read and summing in the telemetry-summary worker
  try {
    res.json({ collector: !!TELEMETRY_INGEST_TOKEN, ...(await telemetry.centralSummary({ days: Math.min(parseInt(req.query.days) || 14, 90) })) });
  } catch (e) { res.status(e && e.status === 503 ? 503 : 500).json({ collector: !!TELEMETRY_INGEST_TOKEN, error: e && e.status === 503 ? `the fleet's telemetry files did not answer in time (${e.message})` : e.message }); }   // r887: `collector` rides the refusal (the page says a fleet's failure only where there is a fleet)
});

app.get('/api/usage-stats', async (req, res) => {
  try {
    // pick up anything new before answering — and answer only from the
    // SETTLED walk: the scan yields every MiB (perf ⑥), so a reader that did
    // not await would total a ledger the walk has not committed yet (or one a
    // scan already in flight is about to extend)
    // ledger-boot-load follow-up: a PERSON'S Retry (retry=1, the Usage window's button) is attended — the first load is tried now
    if (req.query.retry === '1') { try { usageHistory.retryBootLoad?.(); } catch { } }
    usageHistory.scan();
    await usageHistory.scanSettled();
    const from = req.query.from ? parseInt(req.query.from, 10) : null;
    const to = req.query.to ? parseInt(req.query.to, 10) : null;
    const backend = req.query.backend || null;
    // account = comma list of ledger bucket keys (account ids / '__global__')
    const accounts = req.query.account ? new Set(String(req.query.account).split(',').filter(Boolean)) : null;
    // pivot = comma list of 'dimA:dimB' 2-D crosses (dashboard split-series
    // panels, e.g. pivot=day:account) — validated + capped in aggregate/here
    const pivots = req.query.pivot
      // Cap 8 since 2026-09-10 (the window then asked for its two origin
      // crosses on TOP of the dashboard's; since B-f95d ② it asks only for what
      // a panel draws, but a custom dashboard can still draw several) — a cap
      // of 6 would silently drop a panel's pivot and leave it rendering a hole.
      ? String(req.query.pivot).split(',').map((s) => s.split(':')).filter((p) => p.length === 2).slice(0, 8)
      : null;
    // host = the DEVICE filter ('local' | a host id) — top-level over the view
    const hostFilter = req.query.host ? String(req.query.host) : null;
    // only=pivots (B-f95d ②, 2.369.274): a panel that came on screen asks for
    // ITS pivot — the answer is { pivots, asOf?, partial? }, never the totals and
    // groups the window already holds (All time here: 5.1 MB it would re-send)
    const onlyPivots = req.query.only === 'pivots';
    const ac = new AbortController(); // B-9428 r3: a request that went away leaves the fold queue
    req.on?.('close', () => { if (!res.writableEnded) ac.abort(); });
    let answer;
    const rows = req.query.road === 'rows';   // B-360d unit 1: ?road=rows folds the ROWS (the release's road — the same answer, read from the ledger: a check, and the suites that drive the cold worker)
    try { answer = await usageHistory.aggregateAsync({ from, to, backend, accounts, hostFilter, pivots, ...(rows ? { rows: true } : {}) }, { signal: ac.signal }); } catch (e) {
      // ledger-boot-load follow-up: LOADING is a STATE — its words and the time to ask again (the window does, by itself)
      if (e && e.code === 'LOADING') return res.status(503).json({ error: String(e.message || e), code: 'LOADING', nextTryAt: Number.isFinite(e.nextTryAt) ? e.nextTryAt : null, running: !!e.running });
      return res.status(e && e.code === 'BUSY' ? 429 : 503).json({ error: 'usage summary failed — ' + ((e && e.message) || e) + (e && /ABORTED|FOLD_TOO_BIG|STUCK/.test(e.code || '') ? '' : '; retry'), code: (e && e.code) || null });
    }
    // lane ledger-dedup-law F4: a machine whose usage is NOT being recorded (its shard out of shape) is said in the window —
    // a state the answer carries, never only a console line
    const paused = usageHistory.ingestPaused?.() || [];
    if (paused.length) answer = { ...answer, ingestPaused: paused };
    // r3145 unit 2: the prices' state rides the answer — held: every cost reads «prices not known» on the page (they were priced at the
    // defaults for the estimate, never shown as the person's); torn / lifted: said once in place
    { const pf = usageHistory.pricesFacts ? usageHistory.pricesFacts() : null; if (pf) answer = { ...answer, prices: pf }; }
    res.json(onlyPivots ? pivotsOnly(answer) : answer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Per-message account attribution for the msg-meta popup (2.266.1, user
// request): which account served this requestId, per the ledger's baked
// attribution (aname frozen at scan time; pool = billed THROUGH it).
app.get('/api/usage-stats/rid-info', async (req, res) => {
  try {
    let ev = req.query.rid ? await usageHistory.eventForRid(String(req.query.rid)) : null;
    // live stdout records carry NO requestId — message.id is the join field
    // both transports share (the 2.267.3 rule), so the popup can attribute
    // EVERY reply, not just history-rebuilt ones.
    if (!ev && req.query.mid) ev = await usageHistory.eventForMid(String(req.query.mid));
    if (!ev) return res.json({ found: false });
    let poolName = null;
    try { poolName = ev.pool ? (accounts.get(ev.pool)?.name || null) : null; } catch { }
    let hostName = null;
    try { hostName = ev.host ? (hosts.get(ev.host)?.name || null) : null; } catch { }
    // be/model/effort (additive): the popup names the RIGHT machine login for a
    // global-bucket event (codex = the ChatGPT login, not "CLI login") and can
    // show the ledger's served model / codex effort when the record has none.
    res.json({ found: true, acct: ev.acct || null, aname: ev.aname ? require('../accounts').maskDefaultKeyName(ev.aname) : null,   /* B-ba7d: an event under the old default name never answers the tail */ atype: ev.atype || 'global', pool: ev.pool || null, poolName, host: ev.host || null, hostName, be: ev.be || 'claude', model: ev.model || null, effort: ev.effort || null });
  } catch (e) { if (e && e.code === 'LOADING') return res.json({ found: false, loading: true }); res.status(500).json({ error: e.message }); } // lane ledger-boot-load: a first load that failed is «still loading», never «not in the ledger yet»
});
// B-f276's family (主开发 r3145 unit 2, lane bl-ci): the person's prices HELD (pricing.json could not be read) — the editor's read and its
// save are refused BY NAME (503 prices_unread, the hold's words): never the defaults shown as theirs, never a save written over the file
const pricesHeldRefused = (res) => { const h = usageHistory.pricesHeld ? usageHistory.pricesHeld() : null; if (!h) return false; res.set('Cache-Control', 'no-store'); res.status(503).json({ error: usageHistory.pricesWords(), code: 'prices_unread', held: h }); return true; };
app.get('/api/usage-stats/pricing', (req, res) => { if (pricesHeldRefused(res)) return; res.json({ pricing: usageHistory.pricingView ? usageHistory.pricingView() : usageHistory.pricingTable(), ...(usageHistory.pricesTorn && usageHistory.pricesTorn() ? { torn: usageHistory.pricesTorn() } : {}) }); }); // the editor: the effective table + its sources (lane cli-update-needs-nothing)
app.post('/api/usage-stats/pricing', (req, res) => {
  if (pricesHeldRefused(res)) return;
  try { usageHistory.setPricing(req.body || {}); res.json({ success: true, pricing: usageHistory.pricingView ? usageHistory.pricingView() : usageHistory.pricingTable() }); }
  catch (e) { res.status(400).json({ error: e.message, ...(e && e.code ? { code: e.code } : {}) }); }   // B-d578 P1-b follow: a refused rate says which (code rate-invalid)
});
// B-ba7d: the accounts list carries NO key tail (the owner's decision 2026-11-18); the person's read of the tails is POST
// /api/accounts/tails (src/routes/account-tails.js — behind the person verdict)
require('../routes/account-tails.js').registerAccountTailRoutes(app, { accounts, providers });
app.get('/api/accounts', (req, res) => res.json(require('../routes/account-tails.js').accountsAnswer({ accounts, hosts })));
// the B-f276 family (lane bl-windows, 主开发 r2947 (2)): a change over accounts that could not be read is refused BY NAME — 503 with its
// code and words (the dialog says nothing was changed and that it reads again by itself); every other refusal as before (400)
app.post('/api/accounts', (req, res) => {
  try { res.json({ success: true, account: accounts.add(req.body || {}) }); }
  catch (e) { failAcct(res, e); }
});
app.post('/api/accounts/import-cli', (req, res) => {
  try { res.json({ success: true, account: accounts.importFromCli() }); }
  catch (e) { failAcct(res, e); }
});
// Anthropic login state ON a remote host (subscription OAuth? console key?) —
// powers the Manage Agents accounts section when a host is selected.
app.get('/api/hosts/:id/accounts-status', async (req, res) => {
  try {
    const r = AT.keepHostCliTail(req.params.id, await hosts.accountsStatus(req.params.id));   // B-ee0a: its CLI-key tail is the person's read only
    // Same-account auto-recognition on the HOST side (2.205.0): a host dir
    // whose identity email matches a DIFFERENT existing subscription means
    // duplicate records of one real account — rename the host dir to the
    // survivor and fold the records (the local finalize path does the same
    // for local logins). Learned dir emails also backfill records that
    // never declared one (enables the =host-login link).
    // On macOS the Keychain service name is hashed from the dir path. Renaming
    // a host dir cannot migrate that item from this non-interactive server
    // context, so keep duplicate records rather than silently selecting stale
    // credentials or orphaning the fresh service.
    if (accounts && r.hostSubEmails && r.platform && r.platform !== 'darwin') {
      // THE BACKFILL AND THE FOLD DECIDE on the rows' emails (B-360d, 主开发 r1221 — a person's act): the sign-ins read NOW off the
      // loop and awaited; a row whose sign-in could not be read is neither backfilled nor folded into
      const compared = (accounts.list().accounts || []).filter((x) => oauthUsageAccount(x) || Object.prototype.hasOwnProperty.call(r.hostSubEmails, x.id)).map((x) => x.id);
      const { since } = await accounts.signinFactsNow(compared);   // the rows it compares, read now, bounded
      const readNow = (x) => !x.facts || x.facts.state === 'read';
      const unjudged = (accounts.decisionList({ since }).accounts || []).filter((x) => compared.includes(x.id) && !readNow(x));
      if (unjudged.length) r.foldUnjudged = unjudged.map((x) => ({ id: x.id, name: x.name }));   // said: these rows were not compared
      for (const [dirId, email] of Object.entries(r.hostSubEmails)) {
        try {
          const em = String(email).trim().toLowerCase();
          const all = accounts.decisionList({ since }).accounts || [];
          const rec = all.find((x) => x.id === dirId);
          if (!rec) continue;
          if (!rec.email && readNow(rec)) { try { accounts.setEmail(dirId, email); } catch { } }
          const dup = all.find((x) => x.id !== dirId && oauthUsageAccount(x) && readNow(x)
            && String(x.email || (String(x.name || '').includes('@') ? x.name : '')).trim().toLowerCase() === em);
          if (dup) {
            // A Darwin VibeSpace marks these records local-only even when this
            // particular copy lives on a Linux host. Be conservative: check
            // before renaming so mergeSubscription cannot reject after the
            // host path has already changed.
            if (rec.localOnly || dup.localOnly) continue;
            // survivor = the OLDER record; rename the newer's host dir first
            const survivor = (dup.createdAt || 0) <= (rec.createdAt || 0) ? dup : rec;
            const gone = survivor === dup ? rec : dup;
            if ((r.hostSubs || []).includes(gone.id) && await hosts.renameHostSubDir(req.params.id, gone.id, survivor.id)) {
              const i = r.hostSubs.indexOf(gone.id);
              if (i >= 0) r.hostSubs.splice(i, 1, survivor.id);
            }
            try { accounts.mergeSubscription(gone.id, survivor.id, { preferFromCreds: false, liveAccountIds: liveAccountIdSet() }); }
            catch (me) { if (me && me.code === 'not-durable' && me.landingOwed) { console.warn(`[accounts] ${me.message}`); } else if (me.code !== 'merge-account-live') throw me; /* live session — leave both records, merge on a later probe; a fold whose landing failed happened and is written again (r3977) */ }
          }
        } catch { /* best-effort per-dir; a failed merge keeps both records */ }
      }
    }
    // remember which accounts hold a login ON this host — every view (incl.
    // local, which probes no host) can then show "logged in on X" (2.204.0)
    try { accounts?.noteHostLogins?.(req.params.id, r.hostSubs || []); } catch { }
    // Per-account VERDICTS (B-f531, 2.244.0): the single evaluateOnHost
    // authority, computed against these LIVE facts — client surfaces render
    // these verbatim and never compute their own from page caches.
    try {
      const facts = { ...r, hostId: req.params.id, transport: hosts.get(req.params.id)?.transport === 'dial' ? 'dial' : 'ssh' };
      let allowShip = false;
      try { allowShip = !!serverSetting('accounts.shipSubscriptionToRemote'); } catch { }
      r.verdicts = {};
      for (const a of (accounts.list().accounts || [])) {
        try { r.verdicts[a.id] = accounts.evaluateOnHost(a, facts, { allowShip }); } catch { }
      }
    } catch { }
    res.json(r);
  }
  catch (e) { failAcct(res, e); }
});
// Import the console-login key minted on a REMOTE host into the central store
// (the store is host-agnostic — keys are pushed per-session wherever needed).
app.post('/api/accounts/import-cli-host', async (req, res) => {
  try {
    const { key, org } = await hosts.cliPrimaryKey(req.body?.hostId);
    if (!key) return res.status(400).json({ error: 'no primaryApiKey on that host — log in to a Console account there first' });
    const hostName = (() => { try { return hosts.get(req.body?.hostId)?.name; } catch { return null; } })();
    res.json({ success: true, account: accounts.add({ name: (org || 'Console') + ' (API' + (hostName ? ', ' + hostName : '') + ')', key, source: 'cli-import', originHost: hostName }) });
  } catch (e) { failAcct(res, e); }
});
app.post('/api/accounts/default', (req, res) => {
  // backend needed only when CLEARING (id null) — otherwise it's derived from
  // the account. Each backend (claude/codex) keeps its own default.
  try { accounts.setDefault(req.body?.id || null, req.body?.backend || 'claude'); res.json({ success: true }); }
  catch (e) { failAcct(res, e); }
});
// reveal the decrypted key on request (the door: src/routes/account-tails.js revealKeyDoorOf — a set-up vault's window, else B-ee0a's
// person verdict)
const revealKeyDoor = AT.revealKeyDoorOf({ accounts });
app.get('/api/accounts/:id/key', revealKeyDoor);   // KEPT for pages loaded before this build (they reveal by GET); the same door, the same verdicts — on https or localhost (on plain http such a page's GET carries no Origin: refused until the page reloads)
app.post('/api/accounts/:id/key', revealKeyDoor);   // the page's road (B-ee0a): a plain-http page sends no Origin on a GET
app.patch('/api/accounts/:id', (req, res) => {
  try {
    let account = null;
    if (req.body?.name !== undefined) account = accounts.rename(req.params.id, req.body.name);
    if (req.body?.email !== undefined) account = accounts.setEmail(req.params.id, req.body.email);
    if (req.body?.note !== undefined) account = accounts.setNote(req.params.id, req.body.note);
    res.json({ success: true, account });
  } catch (e) { failAcct(res, e); }
});
app.delete('/api/accounts/:id', (req, res) => {
  try {
    const _wasPool = accounts.get(req.params.id)?.type === 'pooled';
    // a deleted MEMBER leaves every pool that listed it: the default and each conversation's link go where the ENGINE
    // decides (verify r2 — the store alone re-points to the first live member / the default)
    let unlanded = null;   // r3977 (2): the removal FINISHED in memory and on the hub; its follow-ups on the machines run too, then the landing is said
    try { accounts.remove(req.params.id, {
      chooseDefault: (poolId, from) => (typeof engine.decideDefaultTarget === 'function' ? engine.decideDefaultTarget(poolId, from) : null) || (typeof engine.fallbackDefaultTarget === 'function' ? engine.fallbackDefaultTarget(poolId, from) : null),
      chooseLink: (poolId, from, sid) => (typeof engine.removalTargetFor === 'function' ? engine.removalTargetFor(poolId, from, sid) : null),
    }); } catch (e) { if (e && e.code === 'not-durable' && e.landingOwed) unlanded = e; else throw e; } // throws for unknown ids → only real (shape-safe) ids continue
    try { modelsDoor.forget(req.params.id); } catch { } // the models its CLI reported go with it (lane agy-models-report, E2)
    // (lane pool-provider-latents, q-055 M2) a conversation the deletion left UNPLACED (nobody of its provider left) is decided
    // NOW — onto its own provider when one can serve, else the owner's card — not at the pool's next tick
    if (typeof engine.maybePoolAutoSwitchForPool === 'function') for (const pid of accounts.unplacedPools()) { try { engine.maybePoolAutoSwitchForPool(pid, { force: true }); } catch { } }
    // DISARM the device reflex for a deleted pool — a stale snapshot could
    // otherwise recreate the deleted pool's symlink in a server-down window
    if (_wasPool) clearSealedOrders(req.params.id);
    // Best-effort: clear whatever this account left on each host — a 0600 key
    // file (API), a securestorage creds dir (Claude sub), or a CODEX_HOME copy
    // (Codex sub). Fire-and-forget; unreachable hosts are fine (the leftovers
    // are useless without the account, but tidy up when we can).
    const rid = req.params.id;
    if (/^(acct|sub|cxs)-[a-f0-9]+$/.test(rid) && hosts) {
      const { execFile } = require('child_process');
      // every harness with credential mechanics owns a remote dir family (S2: descriptor subsDirName)
      const dirs = require('../harnesses').list().filter((h) => h.creds?.subsDirName).map((h) => `"$HOME/.vibespace/${h.creds.subsDirName}/${rid}"`).join(' ');
      const rm = `rm -f "$HOME/.vibespace/${rid}.key"; rm -rf ${dirs}`;
      // r3688 (line 814's walk): a list row is a VIEW (its host keys by fingerprint only) — the ssh dial is built from the record itself
      const sweep = () => { for (const h of hosts.list() || []) { try { execFile('ssh', [...hosts.sshArgs(hosts.get(h.id)), '--', rm], { env: hosts.sshEnv(), timeout: 15000 }, () => {}); } catch { } } };
      if (hosts.whenRead) hosts.whenRead(sweep, `the token-copy sweep of account ${rid} on every machine`, `token-sweep:${rid}`); else sweep();   // the B-f276 remainder (its read r1, S5): a held hosts.json sweeps once it reads; the moved chain's read (S4): named + keyed
    }
    if (unlanded) return notDurable(res, unlanded);
    res.json({ success: true });
  }
  catch (e) { failAcct(res, e); }
});

// ── Multi-subscription: hold several Claude Max/Pro logins at once, each in
// its own securestorage creds dir (CLAUDE_SECURESTORAGE_CONFIG_DIR). Create
// allocates the dir + returns the login command the client runs in a terminal;
// finalize reads back the identity once the OAuth login has written creds. ──
// ── Pooled pseudo-account (B-6217) ────────────────────────────────────────
// The pool's creds dir is a DIRECTORY SYMLINK at data/subs/<poolId>; switching
// = re-pointing it (accounts.setPoolTarget). See the accounts.js section header
// for why a directory symlink is the only shape that keeps ONE credential copy
// (and therefore one refresh-token holder) while still swapping per-spawn.
app.post('/api/accounts/pool', (req, res) => {
  // any REGISTERED harness whose caps row pools (rv-harnesses H3, lane dc-pool-quota): an unknown or non-pooling
  // backend is refused here — it used to be coerced, silently, into a claude pool
  const b = req.body?.backend || 'claude';
  if (!require('../harnesses').has(b) || !require('../backend-caps.js').capsOf(b).pool) return res.status(400).json({ error: 'pooling is not supported for backend ' + String(b).slice(0, 40) });
  try { res.json({ success: true, ...accounts.createPool({ name: req.body?.name, members: req.body?.members, backend: b }) }); }
  catch (e) { failAcct(res, e); }
});
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || '')); // the pool's placement is the owner's to set — an agent's session/job token is refused
app.patch('/api/accounts/pool/:id', (req, res) => {
  try {
    const id = req.params.id;
    if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
    // (r3886 (D)) THE TWO SPEND FIELDS ARE A PERSON's: a request that carries the switch or the fallback list asks the tree's ONE verdict,
    // as the press does (no bearer of any kind, this instance's own page); a request with neither is judged as before
    if (req.body && (req.body.crossProvider !== undefined || req.body.fallbackProviders !== undefined)) { const who = require('../routes/vault.js').personVerdict(req); if (!who.ok) return res.status(403).json({ ok: false, code: who.code || 'human_only', error: 'the pool\'s fallback switch and list are set by a person on this page only' }); }
    // Narrowing the member list away from the CURRENT target makes updatePool
    // re-point IMMEDIATELY (symlink swap) — a running claude re-reads the
    // credential file mid-session, so this must mirror /target's contract
    // (review B1): re-record attribution for live pooled sessions + return
    // `affected` so the dialog can cold-restart them. Silently it mis-billed
    // the OLD target for everything after the swap.
    const before = accounts.poolCurrent(id);
    // A MEMBER REMOVED FROM THE POOL STOPS SERVING AT ONCE (2026-09-28): the
    // membership BEFORE the write, so the members this save took out are known —
    // the Members… dialog and the member's own "Exclude from pool" both land here
    let membersBefore = [];
    try { membersBefore = accounts.poolMembership(id) || []; } catch { }
    // (the chooser's answer is kept: `null` = the engine found NOBODY who can take the default over)
    let decided;
    // …and when it answers nobody, the store still places the default on a member the pool LISTS — the
    // engine's fallback (usable soonest), never the store's list[0] (verify r2)
    const decide = typeof engine.decideDefaultTarget === 'function' ? (from) => { decided = engine.decideDefaultTarget(id, from); return decided || (typeof engine.fallbackDefaultTarget === 'function' ? engine.fallbackDefaultTarget(id, from) : null); } : null;
    // MANUAL PRIORITY (2026-09-28): `priority` = the owner's order ([] = automatic),
    // validated by the store (members only, deduped, ≤ 40); `auto:false` is ignored —
    // the whole-pool manual switch is retired, so the device reflex stays armed
    // (B-d578) `fallbackProviders` = the third-party providers the pool uses only when every member is out — judged by the store, by name
    accounts.updatePool(id, { members: req.body?.members, auto: req.body?.auto, hot: req.body?.hot, priority: req.body?.priority, crossProvider: req.body?.crossProvider, fallbackProviders: req.body?.fallbackProviders, crossProviderOpened: req.body?.crossProviderOpened, fallbackProvidersOpened: req.body?.fallbackProvidersOpened }, { chooseMember: decide });   // (r3908 (1)) the values the dialog OPENED with: a stale edit is refused by name
    // (B-d578 F2 cure, r2939 MUST) a change of the pool's setting empties its POOL-MADE fallback moves at once (a person's press stays)
    if (req.body?.crossProvider !== undefined && typeof engine.purgePoolMadeMoves === 'function') { try { engine.purgePoolMadeMoves(id); } catch { } }
    let membersAfter = [];
    try { membersAfter = accounts.poolMembership(id) || []; } catch { }
    const removedIds = membersBefore.filter((m) => !membersAfter.includes(m));
    // the engine's ONE entry point moves every conversation the removed members
    // still serve (and requests the cold restarts itself — claimRestarts below
    // then leaves those out, so nothing is restarted twice)
    const evicted = removedIds.length && typeof engine.memberRemoved === 'function' ? engine.memberRemoved(id, removedIds, { why: 'removed-from-pool' }) : null;
    // a new ORDER takes effect now: the default returns to the top usable member at
    // once, each linked conversation at its next stop (the engine's pass, forced)
    if (req.body?.priority !== undefined && typeof engine.maybePoolAutoSwitchForPool === 'function') { try { engine.maybePoolAutoSwitchForPool(id, { force: true }); } catch { } }
    const after = accounts.poolCurrent(id);
    const affected = [];
    // WHO THIS ANSWER HANDS TO THE CLIENT FOR A RESTART (verify r1, money): the FOLLOWERS of the
    // default it moved — never a conversation the ENGINE decided. A conversation with its own
    // link is placed per conversation (memberRemoved moved + restarted it, or left it where it
    // is: "no member can take over"); the list used to be every conversation of the pool, so on a
    // pool that restarts to move the client restarted the ones the engine had just left in place
    // (onto a default nobody could serve from) and the ones on an untouched member of their own.
    // …and when the engine found NOBODY to take the default over (it fell to the store's first
    // member), nothing is restarted onto it: what runs keeps running, the hourly notice says why.
    const engineDecided = new Set(evicted ? [...evicted.moved, ...evicted.stayed, ...(evicted.held || [])].map((x) => x.sid) : []);
    const ownLink = (sid) => { try { fs.lstatSync(accounts.sessionPoolLinkPath(id, sid)); return true; } catch { return false; } };
    const nobody = decided === null;
    if (before !== after && !nobody) {
      for (const [sid, sess] of activeSessions) {
        if (sess._accountId !== id) continue;
        if (engineDecided.has(sid) || ownLink(sid)) continue;
        // a HELD process (a non-hot pool — r3) keeps billing its member until the restart lands
        let held = false; try { held = !!accounts.poolMemberOfSession(id, sess, sid).held; } catch { }
        if (!held) { try { recordUsageAttribution({ claudeSessionId: sess.claudeSessionId || sess.backendSessionId, accountId: id }); } catch {} }
        affected.push({ serverId: sid, backend: sess.backend || 'claude', backendSessionId: sess.claudeSessionId || sess.backendSessionId || null, cwd: sess.cwd || null, name: sess.name || null, host: sess.host || null });
      }
    }
    res.json({ success: true, retargeted: before !== after ? { from: before, to: after, name: after ? (accounts.get(after)?.name || after) : null } : null, evicted: evicted ? { removed: evicted.removed, moved: evicted.moved.length, restarted: evicted.restarted.length, stayed: evicted.stayed.length, held: (evicted.held || []).length } : null, affected: claimRestarts(affected) });
  }
  catch (e) { failAcct(res, e); }
});
// Re-point. Returns the live sessions billed to this pool so the CLIENT can
// restart them (v1 = cold swap; the client owns kill+resume, same machinery as
// the billing switcher). `hot` pools skip the restart — the running CLI
// re-reads the credential file on its next request.
// THE WHOLE-POOL MANUAL SWITCH IS RETIRED (2026-09-28, owner: "手动切换整个池其实比较
// confusing，我建议移除这个功能，或者做成'手动优先级'这样的概念"). A pool is placed
// automatically or by its manual priority (PATCH {priority}); the engine keeps
// `setPoolTarget` as its own writer. An old client's pick is answered by name.
app.post('/api/accounts/pool/:id/target', (req, res) => {
  res.status(410).json({ code: 'retired', error: 'Switching a whole pool by hand is retired — set the members\' order instead (Members… → Manual priority): the top usable member takes the pool, and "Move every conversation here now" on #1 moves them at once.' });
});
// "MOVE EVERY CONVERSATION HERE NOW" (addendum 4, 2026-09-28): the ONE act that
// puts every live conversation of the pool on `memberId` at once — never greyed,
// available even when it already is the default (the owner could not reach it
// while six conversations sat on a removed member). Hot ⇒ the default AND every
// live link re-pointed now (a running CLI re-reads it); cold ⇒ the default moves
// and the CALLER restarts the conversations it is handed (after its confirm).
// It starts no turn. Answers {moved, skipped:{pinned, cannotServe:[{sid,name,why}]}, defaultMoved};
// a member that can serve nothing here ⇒ 409 target_cannot_serve {why, until} (nothing moved).
app.post('/api/accounts/pool/:id/gather', (req, res) => {
  try {
    const id = req.params.id;
    if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
    const a = accounts.get(id);
    if (!a || a.type !== 'pooled') return res.status(400).json({ error: 'not a pooled account', code: 'not_pooled' });
    const memberId = String(req.body?.memberId || '');
    if (!(accounts.poolMembers(id) || []).some((m) => m.id === memberId)) {
      // THE REFUSAL NAMES THE WALL (lane pool-silent-members acceptance r2, claim 1 (f)): a member the pool LISTS but cannot
      // place is told with the roster's own reason and remedy (a CLI unmeasured, the vault locked, a wiped login…) —
      // «not a signed-in member» was false for a signed-in member whose token file the CLI cannot be handed
      let row = null;
      try { row = typeof accounts.poolRoster === 'function' ? (accounts.poolRoster(id) || []).find((r) => r && r.id === memberId) || null : null; } catch { row = null; }
      if (row && row.why) {
        const words = require('../account-pool-auto.js').unplaceableText(row.why);
        return res.status(409).json({ code: 'not_placeable', why: row.why.code, wall: row.why, member: row.name || memberId, error: `${row.name || memberId}: ${words} — nothing was moved.` }); // `wall`: the cause as a code — the client says it in the person's words, with its door (lane account-reset-door)
      }
      return res.status(400).json({ error: 'not a signed-in member of this pool', code: 'not_member' });
    }
    const hot = !!a.hot && require('../backend-caps.js').capsOf(a.backend || 'claude').hotSwitch === 'verified';
    const before = accounts.poolCurrent(id);
    const memberName = accounts.get(memberId)?.name || memberId;
    // a PINNED conversation stays on its pin (pin > pool priority order > automatic): skipped by the sweep and the restarts
    const pinned = new Set([...activeSessions].filter(([, s]) => s._accountId === id && s._poolPin && s._poolPin.memberId).map(([sid]) => sid));
    // JUDGED BEFORE IT MOVES ANYTHING (verify r1, money): the row is never greyed, so the act is
    // reachable on a member that is out of quota — it moved every conversation onto it (mid-turn
    // included) and the next pool pass moved them all back. The engine judges the member for the
    // pool as a whole (`ok`: the default may move there) and per conversation under its own family
    // view; a member that can serve NOTHING here is refused by name, nothing moved; a conversation
    // it cannot serve stays where it is and the answer names it.
    // FAIL CLOSED (verify r2): an engine that offers no plan used to fall through to the UNJUDGED
    // move (`plan` null ⇒ `wholeOk` true) — a server.js literal without `gatherPlan` re-created the
    // r1 money bug with every gate green (they build the route over the whole engine). No judge,
    // no move; test-pool-auto's routes-engine census fails such a literal.
    if (typeof engine.gatherPlan !== 'function') {
      console.warn(`[pool] gather ${id}: refused — the pool engine is not wired to judge it (nothing moved)`);
      return res.status(503).json({ code: 'engine_unwired', error: 'The pool cannot judge this move right now — nothing was moved.' });
    }
    const plan = engine.gatherPlan(id, memberId);
    const skipped = plan ? plan.skip : [...pinned].map((sid) => ({ sid, name: activeSessions.get(sid)?.name || sid, why: 'pinned' }));
    const skip = new Set(skipped.map((x) => x.sid));
    const wholeOk = plan ? plan.ok : true;
    // (a pool that restarts to move lands its conversations on the DEFAULT — so it needs the default to move)
    if (plan && !wholeOk && (!hot || !plan.move.length)) {
      const whyWords = { 'pin-exhausted': 'is out of quota', 'pin-login-dead': 'cannot sign in', 'pin-lapsed': 'has an inactive subscription', 'pin-member-excluded': 'just refused these conversations' }[plan.why] || 'is not usable in the pool right now';
      console.log(`[pool] gather ${id}: → ${memberId} refused — ${plan.why} (nothing moved)`);
      // THE BUCKET'S WORDS (acceptance r3 F3): a member the vendor refused within 10 min is told as the roster tells it
      if (plan.why === 'auth-failed') return res.status(409).json({ code: 'target_cannot_serve', why: 'auth-failed', until: plan.until || null, member: memberName, error: `${memberName}: ${require('../account-pool-auto.js').unplaceableText({ code: 'auth-failed', agoMin: plan.authFailedAt ? Math.max(0, Math.floor((Date.now() - plan.authFailedAt) / 60000)) : undefined })} — nothing was moved.` });
      return res.status(409).json({ code: 'target_cannot_serve', why: plan.why, until: plan.until || null, member: memberName, error: `${memberName} ${whyWords} — nothing was moved. The pool brings its conversations back to it when it can serve again.` });
    }
    let r;
    if (wholeOk) r = accounts.setPoolTarget(id, memberId, { sweepSessionLinks: hot, skipSessKeys: skip, why: 'gather' });
    else {
      // hot, and the member cannot take the pool as a WHOLE (a cap some conversations never use is
      // spent): the conversations it can serve move through the ONE link writer, the default stays
      let swept = 0;
      for (const sid of plan.move) { try { accounts.ensureSessionPoolLink(id, sid, memberId, { why: 'gather' }); swept++; } catch (e) { console.warn(`[pool] gather ${id}/${sid} failed:`, e.message); } }
      r = { id, current: before, name: before ? (accounts.get(before)?.name || before) : null, swept };
    }
    const affected = [];
    for (const [sid, s] of activeSessions) {
      if (s._accountId !== id || s.host || skip.has(sid)) continue;
      if (hot) { try { recordUsageAttribution({ claudeSessionId: s.claudeSessionId || s.backendSessionId, accountId: id }); } catch { } } // a cold process keeps billing what it holds until its restart (the spawn records it)
      affected.push({ serverId: sid, backend: s.backend || 'claude', backendSessionId: s.claudeSessionId || s.backendSessionId || null, cwd: s.cwd || null, name: s.name || null, host: s.host || null });
    }
    const cannotServe = skipped.filter((x) => x.why !== 'pinned');
    console.log(`[pool] gather ${id}: every conversation → ${memberId} (${hot ? `hot — ${r.swept} link(s) re-pointed` : `cold — ${affected.length} to restart`}${skipped.length ? `; left alone: ${skipped.length - cannotServe.length} pinned, ${cannotServe.length} it cannot serve` : ''}${wholeOk ? '' : '; the default stays'})`);
    res.json({ success: true, ...r, previous: before, hot, member: memberName, defaultMoved: wholeOk && before !== memberId, moved: affected.length,
      skipped: { pinned: skipped.length - cannotServe.length, cannotServe: cannotServe.map((x) => ({ sid: x.sid, name: x.name, why: x.why })) },
      affected: hot ? [] : claimRestarts(affected) });
  } catch (e) { failAcct(res, e); }
});

// THE CONVERSATION'S PIN (2026-09-28): POST /api/accounts/:poolId/pin {sessionId, memberId|null} —
// pin one live conversation of this pool to a member (null = automatic: "自动", or the pool row
// itself). Human-only. Thin over the engine's ONE writer (setConversationPin); answers the
// placement it made {pinned, placed, reason, code, current} and broadcasts the session facts
// (active-sessions carries `poolPin` + auth.pinned). Codes: not_pooled · not_member ·
// remote_session · no_session · not_on_pool · agent_forbidden; a pool that cannot re-point a
// running conversation answers 200 with code codex_cold / cold_pool (applies at the next restart).
// (q-053 P0b, decision ①) THE OWNER'S ANSWER to a pool's cross-provider card — once (this conversation, now) / always
// (the pool's crossProvider = 'allow') / deny. A person's act only: an agent's bearer is refused; the engine re-judges
// before anything moves and answers what it found ({ok, state, moved, why}) or a named refusal (ask_unknown, bad_args).
// (B-d578 F3b, r3316 (3)) THE POOL ROW's ONE PRESS «Move them back»: every conversation of the pool on a fallback that a member can take
// again is queued at the head (a person's press: never counted, each still re-judged; its slot held to the landing). A PERSON's act:
// the tree's ONE verdict for a sign-in that is not the person's own page (personVerdict); the same-origin verdict is the auth layer's.
// → {ok, queued: n} — QUEUED, as F2's press says it (each move is said when it is made)
app.post('/api/accounts/:poolId/fallback/move-back', (req, res) => {
  try {
    const who = require('../routes/vault.js').personVerdict(req);
    if (!who.ok) return res.status(who.status || 403).json({ ok: false, code: who.code || 'human_only', error: who.error || 'a person\'s press only' });
    if (typeof engine.fallbackMoveBack !== 'function') return res.status(503).json({ ok: false, code: 'no_engine', error: 'pool engine unavailable' });
    const poolId = String(req.params.poolId || '');
    const pa = accounts.get(poolId);
    if (!pa || pa.type !== 'pooled') return res.status(400).json({ ok: false, code: 'not_pooled', error: 'not a pooled account' });
    const r = engine.fallbackMoveBack(poolId);
    res.json({ ok: true, queued: (r && r.queued) || 0, already: (r && r.already) || 0, noModel: (r && r.noModel) || 0, lapsed: (r && r.lapsed) || 0, familyUnknown: (r && r.familyUnknown) || 0, otherRecord: (r && r.otherRecord) || 0 });   // (r3319 (5), r3338 (2) (4)) each reason a conversation could not move, counted   // (r3319 (5)) those whose first model is unknown: not queued, said why
  } catch (e) { res.status(500).json({ ok: false, code: 'failed', error: e.message }); }
});
app.post('/api/accounts/pool-cross/asks/:askId', (req, res) => {
  try {
    if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
    if (typeof engine.answerCrossProviderAsk !== 'function') return res.status(503).json({ error: 'pool engine unavailable', code: 'no_engine' });
    const r = engine.answerCrossProviderAsk(String(req.params.askId || ''), { answer: req.body && req.body.answer });
    if (!r || !r.ok) return res.status((r && r.status) || 400).json({ ok: false, code: (r && r.code) || 'failed', error: (r && r.error) || 'nothing changed' });
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, code: 'failed', error: e.message }); }
});
app.post('/api/accounts/:poolId/pin', (req, res) => {
  try {
    if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
    if (typeof engine.setConversationPin !== 'function') return res.status(503).json({ error: 'pool engine unavailable', code: 'no_engine' });
    const poolId = String(req.params.poolId || '');
    const pa = accounts.get(poolId);
    if (!pa || pa.type !== 'pooled') return res.status(400).json({ error: 'not a pooled account', code: 'not_pooled' });
    const sid = typeof req.body?.sessionId === 'string' && /^[\w.:-]{1,120}$/.test(req.body.sessionId) ? req.body.sessionId : null;
    const s = sid ? activeSessions.get(sid) : null;
    if (!s) return res.status(404).json({ error: 'no live session with that id', code: 'no_session' });
    if (s._accountId !== poolId) return res.status(400).json({ error: 'this conversation does not bill this pool', code: 'not_on_pool' });
    const memberId = req.body?.memberId == null || req.body.memberId === '' ? null : String(req.body.memberId);
    const r = engine.setConversationPin(sid, memberId, { by: 'user' });
    if (!r || !r.ok) return res.status((r && r.status) || 400).json({ error: (r && r.error) || 'refused', code: (r && r.code) || 'refused' });
    try { broadcastActiveSessions(); } catch { }
    res.json({ success: true, pinned: r.pinned, placed: r.placed, reason: r.reason, code: r.code || null, current: r.current || null });
  } catch (e) { failAcct(res, e); }
});

// ── Long-lived token (oat01, B-211a) ──────────────────────────────────────
// Minting one (claude setup-token, 1-year, no refresh) is the per-account
// consent to run this subscription on remote machines — it ships as
// CLAUDE_CODE_OAUTH_TOKEN over the same 0600-file channel API keys use.
app.post('/api/accounts/:id/oat', async (req, res) => {
  let r;
  try { r = accounts.setOat(req.params.id, req.body?.token); }
  catch (e) { return e && e.code === 'not-durable' ? notDurable(res, e) : res.status(400).json({ error: e.message }); }
  // the token's file act runs on the store's queue, off the loop's back — the answer names its verdict
  let f = null;
  try { f = await accounts.oatFileSettled(r.id); } catch { }
  res.json({ success: true, ...r, ...(f ? { oatFile: f.verdict } : {}) });
});
// The spawn channel left 0600 working copies (~/.vibespace/<id>.key) on
// hosts — sweep them best-effort like account delete does (the still-valid
// 1-year token must not outlive its removal — or its move — where we can reach).
const sweepHostTokenCopies = (rid) => {
  if (/^sub-[a-f0-9]+$/.test(rid) && hosts) {
    const { execFile } = require('child_process');
    // r3688 (line 814's walk): a list row is a VIEW (its host keys by fingerprint only) — the ssh dial is built from the record itself
    const sweep = () => { for (const h of hosts.list() || []) { try { execFile('ssh', [...hosts.sshArgs(hosts.get(h.id)), '--', `rm -f "$HOME/.vibespace/${rid}.key"`], { env: hosts.sshEnv(), timeout: 15000 }, () => {}); } catch { } } };
    if (hosts.whenRead) hosts.whenRead(sweep, `the token-copy sweep of account ${rid} on every machine`, `token-sweep:${rid}`); else sweep();   // the B-f276 remainder (its read r1, S5): a held hosts.json sweeps once it reads; the moved chain's read (S4): named + keyed
  }
};
app.delete('/api/accounts/:id/oat', (req, res) => {
  try {
    let unlanded = null; try { accounts.clearOat(req.params.id); } catch (e) { if (e && e.code === 'not-durable' && e.landingOwed) unlanded = e; else throw e; }
    sweepHostTokenCopies(req.params.id);   // r3977 (2): the act finishes on the machines too, then says its landing
    if (unlanded) return notDurable(res, unlanded);
    res.json({ success: true });
  }
  catch (e) { failAcct(res, e); }
});
// THE GUIDED DOOR'S WAY ② (lane oat-add-door, 2.369.399): GET/POST /api/accounts/:id/oat-shape — src/server/oat-shape-routes.js
require('./oat-shape-routes.js').registerOatShapeRoutes(app, { accounts, isAgentBearer });
// 改绑 — RE-BIND (lane oat-identity-postcheck, B-3102 (b)): the identity post-check found a row's long-lived token to
// be ANOTHER account's; the owner moves it to the row it belongs to. Human-only (an agent's session / job token is
// refused by name); the sealed token moves as it is, its mint time kept, and is checked again on its new row.
app.post('/api/accounts/:id/oat/rebind', async (req, res) => {
  if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
  const to = typeof req.body?.to === 'string' ? req.body.to : '';
  let r;
  try { r = typeof engine.oatRebind === 'function' ? engine.oatRebind(req.params.id, to) : accounts.moveOat(req.params.id, to); }
  catch (e) { if (e && e.code === 'not-durable') return notDurable(res, e); return res.status(e.code === 'target_has_token' ? 409 : 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) }); }
  sweepHostTokenCopies(req.params.id);
  let f = null;
  try { f = await accounts.oatFileSettled(to); } catch { }
  res.json({ success: true, ...r, ...(f ? { oatFile: f.verdict } : {}) });
});
// THE OWNER'S ANSWER (lane oat-identity-fix, verify r1 F4/F6): the identity check ASKED (a token whose window is another
// row's while this row has none of its own; an anchor the token's own readings moved) or MARKED it. 'mine' ⇒ the window
// the token's readings stated becomes this row's owner-confirmed anchor (confirmed); 'not-mine' ⇒ the mark (the pool
// places nothing new where it would spend the token). Human-only, like the re-bind door.
app.post('/api/accounts/:id/oat/identity', (req, res) => {
  if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
  if (typeof engine.oatAnswer !== 'function') return res.status(503).json({ error: 'the token identity check is not running', code: 'unavailable' });
  const answer = typeof req.body?.answer === 'string' ? req.body.answer : '';
  try { res.json({ success: true, ...engine.oatAnswer(req.params.id, answer) }); }
  catch (e) { res.status(e.code === 'no_check' ? 404 : (e.code === 'already_marked' || e.code === 'nothing_to_confirm') ? 409 : 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) }); }
});

// THE MINT (lane oat-mint-flow, owner 2026-10-13): the dialog drives
// `claude setup-token` in a PTY the hub owns (src/server/oat-mint.js) and the
// token goes from the PTY straight into accounts.setOat — the save path above,
// its checks kept. Phases ride the WS `oat-mint` broadcast so every client's
// dialog follows; the routes are human-only. A token is saved only under the
// row it PROVES (oat-verify F1): one /usage read with the new token through the
// auto-cli spawn, its window against the anchors; else the person picks.
// Outcomes journal into the probe log; stopAll rides the exit (F3).
const usageRoutesMod = require('../usage-routes.js');
// ONE CLI, ONE BINARY (lane cli-shell-truth r2): the login helpers, the token mint and the panel probe run the binary the
// sessions spawn — THE accessor, the boot constant only before the registry exists
const claudeBin = () => (cliCmds && typeof cliCmds.current === 'function' && cliCmds.current('claude')) || CLAUDE_CMD;
const oatMint = require('./oat-mint.js').create({ accounts, claudeCmd: claudeBin, broadcastAll, exitHook: true,
  probePanel: require('./oat-mint.js').panelProbeVia((o, done) => usageRoutesMod.spawnPanelProbe(claudeBin(), o, done), usageRoutesMod.parseCliUsageText),
  windows: () => (typeof engine.establishedWindows === 'function' ? engine.establishedWindows() : {}),
  journal: (rec) => { try { require('./usage-probe-log.js').appendProbeLog(accounts.dataDir, { rung: 'oat-mint', ...rec }); } catch { } } });
require('./oat-mint.js').registerMintRoutes(app, { mint: oatMint, isAgentBearer });
// THE HUMANE CLAUDE SIGN-IN (lane door-signin-card): the hub drives `claude auth login
// --claudeai` (through the same subscription-login helper the Add flow types into a terminal)
// in a PTY IT OWNS, so the person signs in on a CARD (chat / tour / Manage agents) — no
// terminal, theme picker, method menu or trust prompt. This ORCH only drives the login screen;
// the client card calls the EXISTING /subscription/:id/finalize | /:id/relogin-finalize routes
// (above) once the sign-in lands, so the identity merge / login-expiry sweep / pool wake are unchanged.
const claudeSignin = require('./claude-signin.js').create({ accounts, claudeCmd: claudeBin, nodeCmd: NODE_CMD,
  helperPath: CLAUDE_SUBSCRIPTION_LOGIN_HELPER, broadcastAll, exitHook: true, hub: true }); // hub: the WS layer's page holds (lane door-signin-fixes)
require('./claude-signin.js').registerSigninRoutes(app, { signin: claudeSignin, isAgentBearer });
// the token's identity post-check (lane oat-identity-postcheck) is told when a save / a removal / a move replaces a
// check — it resolves the For-you notice the old one filed (the account store exists by now)
if (typeof engine.oatIdentityAttach === 'function') engine.oatIdentityAttach();

app.post('/api/accounts/subscription', (req, res) => {
  try {
    // the sign-in card's row (lane door-signin-fixes): `{signin: true}` reuses an idle never-signed-in row the card made
    // before (marked signinPending), so «Try again» never adds a row; the terminal Add flow keeps a fresh one per press
    const { id, dir } = req.body && req.body.signin === true
      ? accounts.pendingSignin({ busy: (aid) => claudeSignin.isLive(aid) })
      : accounts.createSubscription({ name: req.body && req.body.name });
    // The client opens a shell terminal with this exact command. The helper
    // runs the official `claude auth login --claudeai` with BOTH config envs
    // scoped to the pre-seeded account dir, isolating credentials + identity
    // without touching the global login. On macOS it then copies the new
    // per-dir Keychain value to Claude's normal fallback file while it is still
    // in the interactive terminal's Keychain security session; launchd-started
    // VibeSpace processes cannot reliably read that item later.
    const loginCmd = buildClaudeSubscriptionLoginCommand({
      nodeCmd: NODE_CMD,
      helperPath: CLAUDE_SUBSCRIPTION_LOGIN_HELPER,
      claudeCmd: claudeBin(),
      configDir: dir,
    });
    res.json({ success: true, id, dir, loginCmd });
  } catch (e) { failAcct(res, e); }
});

// Re-login an EXISTING Claude subscription on THIS machine (2.332.0, real ask
// after two token-death incidents made "remove + re-add" the only path): the
// SAME env-scoped helper the Add flow uses, pointed at the account's existing
// creds dir — identity, pool membership, ledger history all stay intact; only
// the login is refreshed. Returns the CURRENT helper attempt id as a baseline
// so the client can tell the NEW login from a pre-existing one (a re-login of
// a still-logged-in account would otherwise report success instantly).
app.post('/api/accounts/:id/relogin', (req, res) => {
  try {
    const a = accounts.get(req.params.id);
    if (!oauthUsageAccount(a)) {
      return res.status(400).json({ error: 'not a Claude subscription account' });
    }
    const dir = accounts.subDir(a.id);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // THE BEFORE (row B-87fd identity unit 3): what this row's folder names at the press, kept in memory for the resolve, with the
    // press's ATTEMPT id the login command carries — a row that is ASKING refuses the press by name (r2734 MUST 2)
    let begun = null;
    try { begun = accounts.reloginBegin(a.id); } catch { begun = null; }
    if (begun === 'ask-open') return res.status(409).json({ error: 'answer the question on this row first — its two presses are right there', code: 'relogin_ask_open' });
    const loginCmd = buildClaudeSubscriptionLoginCommand({
      nodeCmd: NODE_CMD,
      helperPath: CLAUDE_SUBSCRIPTION_LOGIN_HELPER,
      claudeCmd: claudeBin(),
      configDir: dir,
      attempt: begun && begun.attempt,
    });
    let baselineAttempt = null;
    try { baselineAttempt = accounts._subscriptionLoginStatus?.(a.id)?.attempt || null; } catch { }
    res.json({ success: true, id: a.id, loginCmd, baselineAttempt });
  } catch (e) { failAcct(res, e); }
});


// Re-login watcher endpoint (2.333.0): finalize WITH the identity guard —
// a fresh login that belongs to a different account than this record MOVES
// OUT (into the matching record, or a brand-new one) instead of rebranding
// the record and splicing two accounts' history together. Regular Add-flow
// finalize keeps its own merge semantics (there the record IS a throwaway).
app.post('/api/accounts/:id/relogin-finalize', (req, res) => {
  try {
    const r = accounts.reloginResolve(req.params.id);
    // GATE ON reloginResolve's REAL ANSWER (round-2 verifier — the round-1 gate
    // read `r.loggedIn`, a property this method has never returned on ANY of
    // its four outcomes, so the sweep was dead on the exact route the inbox
    // item and the login chip send the user to). Its shapes are:
    //   'pending'                  — nothing on disk yet: stay silent
    //   'same'  { account }        — the ordinary in-place re-login
    //   'split' { account }        — a stranger's login, minted as a new record
    //   'ask'   { keptName, lost? } — the facts could not prove whose sign-in it
    //                                is: HELD in the row's folder, not adopted —
    //                                the person answers on the row (relogin-answer)
    //   'moved' { movedTo }        — the login belonged to ANOTHER record and
    //                                was relocated into it; that record's
    //                                ledger row is the one to retract, and
    //                                there is no `account` here at all
    const captured = !!r?.account?.loggedIn || r?.outcome === 'moved';
    if (captured) {
      sweepOnLoginTransition(req.params.id, r, 're-login');
      // the record the login LANDED in: 'moved' relocated it into another one
      wakeOnLoginSuccess(req.params.id, r, 're-login', r?.movedTo?.id || r?.account?.id || req.params.id);
    }
    try {
      // SAME-SPELLING WARNING (2026-09-07): this `loginState` is a STRING
      // ('error') describing how the login TERMINAL run went. The account ROW
      // in accounts.list() also carries `loginState` — an OBJECT describing
      // the login SESSION's lifetime (src/login-expiry.js). Different objects,
      // different types; never join or compare them.
      const ls = accounts._subscriptionLoginStatus?.(req.params.id);
      if (ls) { r.loginAttempt = ls.attempt || null; r.loginState = ls.state || null; }
    } catch { }
    res.json({ success: true, ...r });
  } catch (e) { failAcct(res, e); }
});

// THE PERSON's ANSWER to a held sign-in (row B-87fd identity unit 3, 主开发 r2533): the row asked whether its new sign-in is the same
// account — {answer: 'same'} returns it into the row (in place), {answer: 'another'} makes a new row around it; an answered or gone
// question says so by name ('none' / 'gone'). A captured sign-in sweeps and wakes as the finalize's does.
app.post('/api/accounts/:id/relogin-answer', (req, res) => {
  try {
    if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });   // the person's question: never an agent's or a job's sign-in (r2734)
    const r = accounts.reloginAnswer(req.params.id, req.body && req.body.answer);
    if (r?.account?.loggedIn) {
      sweepOnLoginTransition(req.params.id, r, 're-login');
      wakeOnLoginSuccess(req.params.id, r, 're-login', r.account.id || req.params.id);
    }
    if (r && r.outcome === 'refused') return res.status(409).json({ success: false, ...r });   // 主开发 r4200 (3): a move that moved nothing — the row still asks, said by name (the page shows `error`; a refusal carries no account, so the sweep above never runs for it)
    res.json({ success: true, ...r });
  } catch (e) { failAcct(res, e); }   // 主开发 r4168 (a): a failed landing answers 503 not-durable, as on every door
});

// THE FIRST SIGN-IN BECOMES THE DEFAULT (lane signin-card-real-screen): a card's row (signinPending, read before
// finalize clears it) that logs in on a VibeSpace with no Claude default and a signed-out machine login becomes the
// default through the ONE default road (accounts.setDefault) — said on the card, shown in Manage agents; a default
// that exists is never swapped (PURE verdict: src/signin-model.js firstSigninDefault).
const adoptFirstSignin = (cardRow, fin, id) => {
  try {
    const l = accounts.list();
    if (!firstSigninDefault({ cardRow, loggedIn: !!(fin && fin.loggedIn), hasDefault: !!l.defaultAccountId, globalLoggedIn: !!accounts.subscriptionStatus().loggedIn, platform: process.platform, envKey: !!process.env.ANTHROPIC_API_KEY })) return {};
    accounts.setDefault(id, 'claude');
    console.log(`[accounts] ${id}: the first Claude sign-in here is now the default account (no default, no machine login)`);
    return { madeDefault: true };
  } catch { return {}; }
};
app.post('/api/accounts/subscription/:id/finalize', async (req, res) => {
  try {
    const cardRow = !!(accounts.get(req.params.id) || {}).signinPending;
    const fin = accounts.finalizeSubscription(req.params.id);
    if (fin?.loggedIn) sweepLoginExpiry('subscription login'); // ONCE, above BOTH res.json paths (the merge branch returns early)
    // attempt identity for the re-login watcher (2.332.0): which helper RUN
    // produced the current state — lets the client ignore a pre-existing login
    try {
      const ls = accounts._subscriptionLoginStatus?.(req.params.id);
      if (fin && ls) { fin.loginAttempt = ls.attempt || null; fin.loginState = ls.state || null; }
    } catch { }
    // Same-account auto-recognition (2.205.0, real ask "这个不能自动识别吗"):
    // a fresh login whose identity email matches an EXISTING subscription is
    // the SAME account — fold the new record into the existing one (fresh
    // creds win) instead of keeping a duplicate.
    // A macOS Keychain service is tied to this fresh config-dir path. Folding
    // its file fallback into an older id would leave Claude preferring the
    // older id's stale Keychain item, so Darwin logins deliberately keep their
    // fresh record instead of using the path-changing auto-merge.
    //
    // THE LOOKUP IS HOISTED ABOVE THE WAKE (r3, reproduced): it is a pure read
    // of the roster, and it is the ONLY thing that knows whether this record
    // will still exist in a moment.
    // THE FOLD DECIDES ON THE OTHER ROWS' EMAILS (B-360d, 主开发 r1221 — a person's act): their sign-ins read NOW off the loop
    // and awaited (each ask bounded by the file door's deadline); a candidate whose sign-in could not be read is never folded
    // into (both records kept, as a failed merge keeps them). After the wait the record is asked again: a concurrent poll that
    // folded it already answered for it (mergeSubscription is synchronous — nothing runs between this check and that fold).
    let dupOf = null, foldUnjudged = null;
    if (fin?.loggedIn && fin?.email && !fin.localOnly && accounts) {
      const em = String(fin.email).trim().toLowerCase();
      const compared = (accounts.list().accounts || []).filter((x) => x.id !== req.params.id && oauthUsageAccount(x)).map((x) => x.id);
      const { since } = await accounts.signinFactsNow(compared);   // the folders it compares, read now, bounded
      if (!accounts.get(req.params.id)) return res.json({ success: true, ...fin, merged: true, account: null, foldedElsewhere: true });
      const rowsNow = (accounts.decisionList({ since }).accounts || []).filter((x) => compared.includes(x.id));
      dupOf = rowsNow.find((x) => (!x.facts || x.facts.state === 'read')
        && String(x.email || (String(x.name || '').includes('@') ? x.name : '')).trim().toLowerCase() === em) || null;
      // WHAT COULD NOT BE COMPARED IS SAID: a fold that could not be judged leaves two rows of one account
      if (!dupOf) foldUnjudged = rowsNow.filter((x) => x.facts && x.facts.state !== 'read').map((x) => ({ id: x.id, name: x.name, why: x.facts.state === 'unreadable' ? (x.facts.reason || 'unreadable') : 'not-read' }));
    }
    // The wake is FINGERPRINT-GATED where the sweep is not: this route is
    // polled every 3 s for 5 minutes and the sweep is local file reads while
    // the wake spawns a CLI panel.
    //
    // AND IT IS GATED ON THE MERGE (r3, reproduced): the wake spawns
    // `claude -p /usage` for `req.params.id`, and on the auto-merge exit that
    // record is DELETED milliseconds later — the panel then answers for a
    // phantom and `refreshViaCliPanel` writes `usage-cache/<deleted-id>.json`
    // plus its window sidecar, which nothing ever removes and
    // `establishedWindows()` reads back with no roster filter. MEASURED before
    // the fix: 2 panel spawns on that exit, one of them for the throwaway. The
    // source already said so three lines from here ("the throwaway above is
    // about to stop existing") — it was a comment where a gate was needed.
    // The merge branch below wakes the SURVIVOR, and every exit where the fold
    // does NOT happen wakes this record from the catch, so the login edge is
    // still taken exactly once, on whichever record ends up holding the login.
    if (fin?.loggedIn && !dupOf) wakeOnLoginSuccess(req.params.id, fin, 'subscription login');
    if (dupOf) {
      const dup = dupOf;
      try {
        const mf = {};   // r2928 (4): the merge's own facts — a guard that STOOD is told in the reply, never a journal line alone
        const merged = accounts.mergeSubscription(req.params.id, dup.id, { preferFromCreds: true, liveAccountIds: liveAccountIdSet(), facts: mf });
        // AGAIN, AFTER THE MERGE (round-2 verifier). The sweep above ran
        // while the fresh credentials were still in the THROWAWAY record's
        // dir — the survivor, which is the record carrying the open warning,
        // still had its dead file, so the sweep read a stale deadline and
        // retracted nothing. `mergeSubscription` is the moment the
        // survivor's credential file actually changes, so the sweep that
        // can see it has to come after. The sweep is idempotent (test-login-
        // expiry §5c(g) pins a repeat resolving nothing a second time), so
        // the pre-merge one stays: it is the only sweep on every non-merge
        // exit.
        sweepLoginExpiry('subscription login merge');
        // THE SURVIVOR is the record the pool holds and the one the fresh
        // credentials now live in; the throwaway above is about to stop
        // existing.
        wakeOnLoginSuccess(dup.id, merged, 'subscription login merge', merged?.id || dup.id);
        return res.json({ success: true, ...fin, merged: true, account: merged, ...(mf.stood ? { mergeStood: mf.stood } : {}), ...(mf.foldKept ? { mergeFoldKept: mf.foldKept } : {}), ...adoptFirstSignin(cardRow, fin, (merged && merged.id) || dup.id) });
      } catch (me) {
        // r3977 (2): a merge whose synchronous landing failed DID fold (the act finished; the writer writes it again): the SURVIVOR holds
        // the login — it gets the edge, and the person is told the landing by name
        if (me && me.code === 'not-durable' && me.landingOwed) { if (fin?.loggedIn) wakeOnLoginSuccess(dup.id, me.merged || null, 'subscription login merge', (me.merged && me.merged.id) || dup.id); return notDurable(res, me, { ...fin, merged: true, account: me.merged || null }); }
        // THE FOLD DID NOT HAPPEN, SO THIS RECORD IS STILL THE ONE HOLDING
        // THE LOGIN (r3) — it gets the edge the gate above deferred. Above
        // the rethrow as well as above the blocked answer: a merge that
        // failed for any other reason leaves the same record in place, and
        // the fingerprint latch makes the later polls idempotent.
        if (fin?.loggedIn) wakeOnLoginSuccess(req.params.id, fin, 'subscription login');
        if (me.code !== 'merge-account-live') throw me;
        // logged in, but a running session blocks the auto-fold — keep both, tell the user
        return res.json({ success: true, ...fin, merged: false, mergeBlocked: 'a session using one of these accounts is running — stop it to auto-merge the duplicate' });
      }
    }
    res.json({ success: true, ...fin, ...(foldUnjudged && foldUnjudged.length ? { foldUnjudged } : {}), ...adoptFirstSignin(cardRow, fin, req.params.id) });
  }
  catch (e) { failAcct(res, e); }
});
// Add a Console account safely: the /login runs in an isolated dir so it can't
// wipe the global subscription; we capture the minted key from that dir.
app.post('/api/accounts/console-login', (req, res) => {
  try {
    const { id, dir } = accounts.beginConsoleLogin();
    // BOTH env vars → dir (pre-seeded, no onboarding): the console login's
    // .credentials.json wipe AND the minted primaryApiKey land in the isolated
    // dir; ~/.claude and ~/.claude.json are untouched. capture reads the dir.
    const q = JSON.stringify(dir);
    const loginCmd = `CLAUDE_CONFIG_DIR=${q} CLAUDE_SECURESTORAGE_CONFIG_DIR=${q} claude auth login --console`;
    res.json({ success: true, id, loginCmd });
  } catch (e) { failAcct(res, e); }
});
app.post('/api/accounts/console-login/:id/capture', (req, res) => {
  try { res.json({ success: true, ...accounts.captureConsoleLogin(req.params.id, req.body || {}) }); }
  catch (e) { failAcct(res, e); }
});

// ── Codex multi-subscription: same idea via CODEX_HOME. Codex has no auth-only
// relocation env, so each account is an isolated CODEX_HOME whose sessions/ +
// config.toml SYMLINK the shared ~/.codex — auth.json is real per-account,
// threads land in the shared sessions dir (unified discovery). `codex login`
// prints an OAuth URL to a hosted callback (headless-friendly). ──
app.post('/api/accounts/codex-subscription', (req, res) => {
  try {
    const { id, dir } = accounts.createCodexSubscription(req.body || {});
    // --device-auth: prints a URL + one-time code (no localhost:1455 callback
    // server), so it works when the browser is on a DIFFERENT machine than this
    // server (team/remote deploys) — same headless philosophy as claude's
    // paste-code login. CODEX_HOME points at the isolated per-account dir.
    const loginCmd = `CODEX_HOME=${JSON.stringify(dir)} codex login --device-auth`;
    res.json({ success: true, id, dir, loginCmd });
  } catch (e) { failAcct(res, e); }
});
app.post('/api/accounts/codex-subscription/:id/finalize', (req, res) => {
  try {
    const fin = accounts.finalizeCodexSubscription(req.params.id);
    // The device-auth completion sweeps too. Codex declares no creds.loginState,
    // so this member itself contributes nothing — but the sweep is per-INSTANCE
    // (it walks every subscription), and "a login just finished" is the one
    // event we have that says the roster's login facts moved.
    if (fin?.loggedIn) sweepLoginExpiry('codex device-auth');
    if (fin?.loggedIn) wakeOnLoginSuccess(req.params.id, fin, 'codex device-auth');
    res.json({ success: true, ...fin });
  } catch (e) { failAcct(res, e); }
});

// ── Isolated-home logins of ANY harness whose descriptor declares one (lane antigravity-harness: «Add Google
// account (Antigravity)»). The descriptor names the dir form, the id prefix and the login command
// (creds.loginCommand — antigravity: HOME=<the account root> DBUS_SESSION_BUS_ADDRESS=disabled: agy, the CLI's own
// sign-in in its TUI with a link + a pasted code); the client opens it in a terminal and polls finalize.
app.post('/api/accounts/home-subscription', (req, res) => {
  try {
    const b = req.body || {};
    const { id, dir, loginCmd } = accounts.createHomeSubscription(String(b.backend || ''), { name: b.name });
    res.json({ success: true, id, dir, loginCmd });
  } catch (e) { failAcct(res, e); }
});
// "Sign in again" on an existing one (a lapsed or unfinished login): the same terminal + finalize loop
app.post('/api/accounts/home-subscription/:id/login', (req, res) => {
  try { res.json({ success: true, ...accounts.homeLoginCommand(req.params.id) }); }
  catch (e) { failAcct(res, e); }
});
app.post('/api/accounts/home-subscription/:id/finalize', (req, res) => {
  try {
    // no login-expiry sweep / pool wake here: the login declares no deadline (creds.loginState absent) and there
    // is no pool — the usage reading below is its own press
    res.json({ success: true, ...accounts.finalizeHomeSubscription(req.params.id) });
  } catch (e) { failAcct(res, e); }
});
// THE ON-DEMAND USAGE READING of a named account whose harness declares one (quota.onDemand — antigravity's
// `agy -p /usage`; lane antigravity-card-fixes): Manage agents' ⋯ Re-check, a PERSON'S press only (an agent bearer is
// refused), once a minute per account, in the account's own HOME root — never a timer (src/server/cli-usage-door.js)
const usageDoor = require('./cli-usage-door.js').createCliUsageDoor({
  accounts, harnessOf: (id) => { try { return require('../harnesses').get(id); } catch { return null; } },
  cliCmds: { check: (...a) => (getCliCmds() ? getCliCmds().check(...a) : Promise.resolve(null)) },
  cacheDir: path.join(rootDir, 'data', 'usage-cache'), agentEnv: () => require('../ws-handler').agentEnv(),
  setting: (k) => serverSetting(k), harnessSetting,   // the vendor's own row (antigravity.autoUsageReads) — the typed per-harness read
});
// …and its SECOND caller (lane agy-wall-signal, the owner's ruling «A» 2026-11-02): a usage wall an account's conversation
// names is written as a reading and fires ONE read of that account through this same door (src/server/stream-wall.js —
// once per account per wall, judge-gated, never a timer; only where the descriptor declares `onDemand.onWallSignal`)
require('./stream-wall.js').configure({ harnessOf: (id) => { try { return require('../harnesses').get(id); } catch { return null; } },
  cacheDir: path.join(rootDir, 'data', 'usage-cache'), door: usageDoor,
  // the wrapper's own sidecar (server.js BUFFERS_DIR/<webui id>.json): its agy `init.model` — the wall's model for a wrapper
  // that does not stamp one, across a hub restart (r3)
  wrapperMetaOf: (s) => require('./stream-wall.js').readWrapperSidecar(path.join(rootDir, 'data', 'session-buffers'), s) }); // bounded + local-only (r4)
// …and its THIRD caller (lane usage-predict, the owner's ruling «A» 2026-11-14): the end of a stretch of work — a turn of a
// named account's conversation ended and 5 minutes passed with no new turn of it ⇒ ONE read through this same door, at most
// once per account per 30 minutes counted from its last read on disk; only where the descriptor declares `onDemand.afterTurn`
require('./after-turn-read.js').configure({ harnessOf: (id) => { try { return require('../harnesses').get(id); } catch { return null; } },
  cacheDir: path.join(rootDir, 'data', 'usage-cache'), door: usageDoor,
  // «a turn of the account runs» is read from the conversations themselves at the moment of the read — every one the hub
  // holds, restored ones too (law A1)
  conversationsOf: (key) => [...activeSessions.values()].filter((s) => s && String(s._accountId || '') === key) });
app.post('/api/accounts/home-subscription/:id/usage', async (req, res) => {
  let r;
  try { r = await usageDoor.read(req.params.id, { person: !isAgentBearer(req) }); } catch (e) { r = { ok: false, status: 500, error: e.message }; }
  res.status(r.status || (r.ok ? 200 : 500)).json(r);
});

}
module.exports = { create, answerAfterLanding, failAcct, notDurable };
