'use strict';
// TIMED SYNC (design 011 "Which stores file I/O drags down", step M — lane store-timing, 2026-10-03): how long the
// main thread is held by a NAMED store's synchronous write, and by the big reads, so the next fixes are ranked by
// measurement instead of by guess (the survey's "sync writes on the mount cause the stalls" is unproven — F5).
// PURE: imports nothing, no I/O — a clock (performance.now) and counters in memory. OFF until the server turns it
// on at boot (`enable()`): every other process that loads a store (a suite, a CLI) pays one boolean test per call and
// reads no clock.
//
// THE NAMES ARE A CLOSED LIST (STORES): an unknown name still runs its fn — a typo must never break a write — but is
// never recorded (`unknown` counts it). scripts/test-architecture.mjs §72 pins every `timedSync('<name>'` literal to
// this table and every write inside a row's `sites` to a timedSync of a row. The span is the write call as the store
// makes it today: where its helper serializes inside the call (writeJsonAtomic), the stringify is in the number.
// Per name: a FIXED-BUCKET histogram (BUCKETS_MS = upper bounds, one more bucket for everything slower), n, sum, max,
// a window since the last `takeWindow()` (the 5-min telemetry report), and a 60-slot ring of per-minute maxima — the
// System window's "slowest store writes (last hour)" without keeping a sample.
// ARMED BEFORE THE CALL (lane ledger-dedup-law r8): a sample is recorded only once its call returns, so a call that hangs
// (an NFS data dir that stopped answering) is never one. The name is armed before the call (`armed()`, while on) and the
// sync fs witness (src/server/sync-fs-witness.js) mirrors it into its live slot: its watchdog THREAD names a call still in
// flight past its LIVE_MS — «… in appendFileSync(…) (usage-shards.write) …» — while it holds, never after.

const BUCKETS_MS = Object.freeze([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]);
const HOUR_MS = 3600000;

// name → { kind, store (its data under data/, the extension left off — test-record-clear-census §A lets only a
// store's owner spell its file name), file (the source), sites (the functions that write it) }
const row = (kind, store, file, sites = []) => Object.freeze({ kind, store, file, sites: Object.freeze(sites) });
const STORES = Object.freeze({
  'session-meta.write': row('write', 'session-meta/<sock>', 'src/server/session-stdout.js', ['writeSessionMeta']),
  'session-meta.read': row('read', 'session-meta/<sock>', 'src/server/session-stdout.js'),
  'pool-pin.write': row('write', 'pool-pins/<pool>/<sock>', 'src/pool-pin-record.js', ['write']),   // lane lg-group-parents B-526c unit 2: the person's pin, before its answer
  'pool-pin.read': row('read', 'pool-pins/<pool>', 'src/pool-pin-record.js'),
  'session-status.write': row('write', 'session-status', 'src/session-status.js', ['_save']),   // through the store writer (lane hub-loop-stalls commit 2)
  'reset-claims.write': row('write', 'usage-reset-claims', 'src/usage-reset-claim.js', ['save']),   // through the store writer (lane account-reset-door K2)
  'usage-cache.write': row('write', 'usage-cache.json', 'src/usage-routes.js', ['writeUsageCache']),   // through the store writer (B-360d part 3 U2)
  'door-reads.write': row('write', 'usage-cache/.door-reads-<account>', 'src/door-reads.js', ['bumpDoorRead']),   // through the store writer, awaited before the read (lane usage-predict, law A3)
  'session-status.read': row('read', 'session-status', 'src/session-status.js'),
  'user-todos.write': row('write', 'user-todos', 'src/user-todos.js', ['_handToWriter']),   // through the store writer (B-0248, lane bl-loop-b, r3320)
  'user-todos.read': row('read', 'user-todos', 'src/user-todos.js'),
  'task-groups.write': row('write', 'task-groups', 'src/task-groups.js', ['_save']),
  'task-groups.read': row('read', 'task-groups', 'src/task-groups.js'),
  'task-groups-archive.write': row('write', 'task-groups-archive-months', 'src/task-groups.js', ['_archiveAsk']),   // B-0248 step 3 (c): the Activity log's archive appends, through the store writer (THE archive writer)
  'jobs.write': row('write', 'jobs', 'src/jobs.js', ['_save']),
  'jobs-archive.write': row('write', 'jobs-archive', 'src/jobs.js', ['_writeArchive']),   // through the store writer (lane bl-loop-b, B-0248 step 3: the archive — an act, the records released at its landing)
  'jobs-notifs.write': row('write', 'job-notifications', 'src/jobs.js', ['_save', '_saveNotifs']),
  'jobs.read': row('read', 'jobs', 'src/jobs.js'),
  'jobs-logs-sweep.write': row('write', 'jobs-logs-sweep', 'src/jobs.js', ['_logsSave']),   // through the store writer (lane job-logs-sweep: the job-logs catch-up's record — paced, the hub's bookkeeping)
  'providers.write': row('write', 'providers', 'src/server/provider-store.js', ['save']),   // through the store writer (lane lg-providers U1 cure (C): the third-party provider records, a person's act durable before its answer)
  'login-expiry.write': row('write', 'login-expiry', 'src/server/login-expiry-watch.js', ['save']),   // B-0248 unit 5 (lane bl-loop-b, 主开发 r4147): the login warnings' record, through the store writer (the 5-minute sweep's save off the loop; nothing written while held)
  'sysinfo-history.write': row('write', 'sysinfo-history', 'src/sysinfo.js', ['persistHistory']),   // B-0248 unit 5: the resource history's two rings, through the store writer (every 5 minutes, and once more at the stop)
  'browser-kept.write': row('write', 'browser-kept', 'src/server/browser-kept.js', ['owe']),   // B-0248 unit 2 (lane bl-loop-b, 主开发 r4232): the kept browsers' list, through the store writer (every act and the tabs' 30 s; nothing written while held)
  'channels-index.write': row('write', 'channels/index', 'src/channel-store.js', ['markDirty', 'flush']),   // through the store writer (lane hub-loop-stalls commit 2)
  'channels-index.read': row('read', 'channels/index', 'src/channel-store.js'),
  'channels-acts.write': row('write', 'channels/index-acts', 'src/channel-store.js', ['actOf', 'indexWritten']),   // a person's acts' journal, through the store writer (lane hub-loop-stalls commit 2)
  'channels-acts.read': row('read', 'channels/index-acts', 'src/channel-store.js'),
  'hosts.write': row('write', 'hosts', 'src/hosts.js', ['_save']),   // B-48a4: every save of hosts.json, through the store writer (the coordinator's word (e))
  'accounts.write': row('write', 'accounts', 'src/accounts.js', ['_save']),   // B-574d unit 1 (lane lg-store-writes, 主开发 r3455 / r3486): every save of accounts.json, through the store writer (a person's act answers after its landing)
  'device-audit.write': row('write', 'device-audit', 'src/device-audit.js', ['askDevice']),   // B-48a4: the device-act ring's appends, through the store writer (THE ONE APPENDER)
  'exit-audit.write': row('write', 'exit-audit', 'src/exit-proxy.js', ['_auditJournal']),   // B-48a4: the exit ring's appends, through the store writer (THE ONE APPENDER)
  // channel-store-off-loop (commit 1): the field-named doors through the store writer (it records each write's time here)
  'channels-adapters.write': row('write', 'channels/adapters', 'src/channel-store.js', ['adaptersUpdate']),
  'channels-outbox.write': row('write', 'channels/outbox', 'src/channel-store.js', ['outboxUpdate']),
  'channels-groups.write': row('write', 'channels/groups', 'src/channel-store.js', ['groupsUpdate']),
  'channels-aliases.write': row('write', 'channels/aliases', 'src/channel-store.js', ['aliasesUpdate']),
  'channels-wake-pace.write': row('write', 'channels/wake-pace', 'src/channel-store.js', ['paceSet']),   // lane lg-store-writes (B-0248 U3): the groups' wake-pace ledger — paced
  'channels-dispatch.write': row('write', 'channels/dispatch-ledger', 'src/channel-store.js', ['dispatchSet']),   // lane lg-store-writes (B-0248 U3): the dispatch ledger — an act
  'channels-people.write': row('write', 'channels/<account>/people', 'src/channel-store.js', ['peopleWrite']),
  'channels-purge-pending.write': row('write', 'channels/purge-pending', 'src/channel-store.js', ['pendingWrite']),   // 主开发 r2878: the purges begun and not finished, through the store writer (an act)
  'channels-search-memo.write': row('write', 'channels/<account>/search-memo', 'src/channel-store.js', ['searchMemoWrite']),   // B-360d r1360: the vendor-search memo, through the store writer (its thread makes the account's directory)
  'channels-feed-miss.write': row('write', 'channels/<account>/feed-misses', 'src/channel-store.js', ['feedMissWrite']),   // B-360d r1360: the change feed's miss memo, the same road
  'channels-lru.write': row('write', 'channels/attachments/<account>/lru', 'src/channel-store.js', ['lruSave']),   // B-0248 row 5 (r3322): the attachment ledger, through the store writer (its thread makes the account's folder)
  'channels-stamps.write': row('write', 'channels/poll-stamps', 'src/channel-store.js', ['oweStamps', 'stampsFlush']),
  'decision-memo.write': row('write', 'decision-memo', 'src/server/decision-engine.js', ['saveMemo']),   // through the store writer (lane lg-store-writes, B-0248 U1: the judge's memo — paced, the hub's own cache)
  'decision-usage.write': row('write', 'decision-usage', 'src/server/decision-engine.js', ['saveUsage']),   // through the store writer (lane lg-store-writes, B-0248 U1: the day's counter — money, an act)
  'decision-journal.write': row('write', 'decision-journal', 'src/server/decision-engine.js', ['journal']),   // B-0248's next part (r2417): the decision journal's lines and its trim, through the store writer (money: rank 0, urgent; a call's reservation lands before its ask)
  'desktop-apps.write': row('write', 'desktop-apps', 'src/desktop-serve.js', ['save']),   // through the store writer on the hub (lane lg-store-writes, 主开发 2026-11-20 03:10Z: the desktop app records — an act; the device agent writes at the call)
  'desktop-apps-hosts.write': row('write', 'desktop-apps-hosts', 'src/server/desktop-app-keeper.js', ['saveRemote']),   // B-0248 unit 3 (lane bl-loop-b, r3320 / r3651): the paired machines' file, through the store writer (off the loop; the keeper's stop flushes what is owed)
  'device-alerts.write': row('write', 'device-alerts', 'src/server/device-alerts.js', ['save']),   // through the store writer (lane lg-store-writes, 主开发 2026-11-20 03:10Z: the device alerts' dedup ledger)
  'vault-grant-ends.write': row('write', 'vault-grant-ends', 'src/server/vault-run-door.js', ['endsSave']),   // through the store writer (bl-vault B-a14b, 主开发 r542: the grants that ended — kept across a restart, paced, 0600)
  'user-state.write': row('write', 'user-state', 'src/routes/persistence.js', ['writeUserStateFile']),   // through the store writer (lane bl-loop-b, B-0248 (c): the conversation list — an act, answered after its landing)
  'bookmarks.write': row('write', 'bookmarks', 'src/routes/persistence.js', ['writeBookmarks']),   // through the store writer (lane bl-loop-b, B-0248 (c): an act, answered after its landing)
  'custom-themes.write': row('write', 'custom-themes', 'src/routes/persistence.js', ['writeCustomThemes']),   // through the store writer (lane bl-loop-b, B-0248 (c): an act, answered after its landing)
  'layouts.write': row('write', 'layouts', 'src/routes/persistence.js', ['landLayouts']),   // through the store writer (lane bl-loop-b, B-0248 (a): the desktops — the release's 500 ms debounce, then an act)
  'layout-points.write': row('write', 'layout-points', 'src/routes/persistence.js', ['handPoint']),   // through the store writer (lane bl-loop-b, B-0248 (b): a rollback point and its header, each landed before what follows it)
  'sync-store.write': row('write', 'sync/<drafts | settings-sync | uploads-sync | stage-sync>', 'src/sync-store.js', ['_scheduleSave']),   // through the store writer (lane lg-recovery, 主开发 r3321, B-0248's first row: the synced stores' flush off the loop; a person's typing ranks first)
  'job-secrets-leftover.write': row('write', 'job-secrets.leftover', 'src/server/job-secrets-door.js', ['writeRec']),   // through the store writer (bl-vault B-ef1b, 主开发 r333: the record of the copies a move made or left — an act, 0600, landed before the seal it records)
  'turn-carry-outstanding.write': row('write', 'turn-carry-outstanding', 'src/turn-carry.js', ['save']),   // through the store writer (lane lg-store-writes, B-0248 U2: the outstanding deliveries — a mark an act, the rest paced)
  'browser-profiles.write': row('write', 'browser-profiles', 'src/server/browser-keeper.js', ['save']),   // through the store writer (lane lg-store-writes, B-0248 U5b: the keeper's registry — an act)
  'usage-shards.write': row('write', 'usage-history/events-<month>', 'src/usage-history.js', ['_walkAndAppend', '_appendRemote']), // lane ledger-dedup-law r4: the remote append is `_appendRemote` (the ingest's and a drained hold's)
  'usage-cursors.write': row('write', 'usage-history/_cursors', 'src/usage-history.js', ['_writeCursors']),   // through the store writer (lane hub-loop-stalls commit 2)
  'usage-rates.write': row('write', 'usage-anchors/rates', 'src/usage-estimator.js', ['_persistRates']),   // through the store writer (lane hub-loop-stalls commit 2; was untimed)
  'usage-cursors.read': row('read', 'usage-history/_cursors', 'src/usage-history.js'),
  'setting-holds.write': row('write', 'setting-holds', 'src/server/setting-holds.js', ['save']),   // through the store writer (lane setting-doors pick 2: a one-press change's hold, DURABLE before the value changes)
  'chat-attachments-link.write': row('write', 'chat-attachments/<conversation>/conversation', 'src/server/chat-attachments.js', ['writeLink']),   // through the store writer (lane chat-attachments-persist: which conversation a dropped file's folder belongs to)
  'usage-host-cursors.write': row('write', 'usage-history/_host-cursors/<host>', 'src/usage-hold-road.js', ['_writeHostCursor']), // lane ledger-dedup-law F2: the hub keeps each machine's usage cursor (r11: the hold road's file)
  'remote-jsonl.write': row('write', 'remote-jsonl/<host>/<transcript>', 'src/hosts.js', ['_landCacheWhole']),   // B-0248 unit 4 (lane bl-loop-b, r3320 / r3883): a remote transcript's whole cached copy, through the store writer (byRef, landed before its record)
  'remote-jsonl-meta.write': row('write', 'remote-jsonl/<host>/<transcript>.meta', 'src/hosts.js', ['_landCacheMeta']),   // B-0248 unit 4: its record (the .meta), after the bytes it names
  // lane ledger-dedup-law r8: no `usage-held.write` row — a hold's every write runs on its ASYNC road (src/usage-hold-road.js
  // `_holdIO` says one that waits, at the time); r4–r7 timed its appends here (`_holdWrite`, `_dropCompact`)
  'otel-token.write': row('write', 'usage-history/otel-token', 'src/server/otel-ingest.js', ['create']),   // B-f276 family unit 2: the sign-in value written as the file's when its hold lifts not there or torn — through the store writer, 0600
  'otel-truth.write': row('write', 'usage-history/otel-truth', 'src/server/otel-ingest.js', ['create']),   // row B-360d: the stash's TRIM — a rewrite job on the store writer's thread, in order with its appends (was a renameSync on the loop)
  'otel-truth.append': row('write', 'usage-history/otel-truth', 'src/server/otel-ingest.js', ['create']),   // through the store writer (usage-cpu U4: was an appendFileSync per post)
  'otel-truth-pending.write': row('write', 'usage-history/otel-truth.pending', 'src/server/otel-ingest.js', ['create']),   // the spill: posts waiting behind the boot replay (usage-cpu U4), through the store writer
  'telemetry.read': row('read', 'telemetry/.instance-id', 'src/telemetry.js'),   // B-360d unit 2: the summaries' shard reads left the loop (their worker); the one read of the folder left on it is the instance id (once a life)
});
const NAMES = Object.freeze(Object.keys(STORES));

let on = false;
let unknown = 0;
let current = null; // the name a synchronous call is being made for (armed before it; a nested call restores its caller's)
const stats = new Map(); // name → { n, sum, max, buckets, win: {n, max, buckets}, minutes: [{m, max, n}] × 60 }

function bucketOf(ms) {
  for (let i = 0; i < BUCKETS_MS.length; i++) if (ms <= BUCKETS_MS[i]) return i;
  return BUCKETS_MS.length;
}
const zeros = () => new Array(BUCKETS_MS.length + 1).fill(0);
function statOf(name) {
  let s = stats.get(name);
  if (!s) stats.set(name, (s = { n: 0, sum: 0, max: 0, buckets: zeros(), win: { n: 0, max: 0, buckets: zeros() }, minutes: Array.from({ length: 60 }, () => ({ m: -1, max: 0, n: 0 })) }));
  return s;
}

/** One sample. Answers false (and counts it) for a name outside the closed list. */
function record(name, ms, at = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(STORES, name)) { unknown++; return false; }
  const v = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const s = statOf(name), b = bucketOf(v);
  s.n++; s.sum += v; if (v > s.max) s.max = v; s.buckets[b]++;
  s.win.n++; if (v > s.win.max) s.win.max = v; s.win.buckets[b]++;
  const m = Math.floor(at / 60000), slot = s.minutes[m % 60];
  if (slot.m !== m) { slot.m = m; slot.max = 0; slot.n = 0; }
  slot.n++; if (v > slot.max) slot.max = v;
  return true;
}

/** THE WRAPPER: runs fn synchronously and returns (or throws) what it does; when on, its duration is recorded. Its name
 *  is armed for the call's whole span while on (`armed()` — the witness's live line; the server turns it on at boot). */
function timedSync(name, fn) {
  if (!on) return fn();
  const was = current; current = name;
  const t0 = performance.now();
  try { return fn(); } finally { record(name, performance.now() - t0); current = was; }
}
/** The name armed now (the call in flight is made for it) | null. */
function armed() { return current; }

/** The slowest names of one kind over the last `windowMs` (max of the per-minute maxima), slowest first. */
function slowest({ now = Date.now(), windowMs = HOUR_MS, kind = 'write', limit = 3 } = {}) {
  const lo = Math.floor((now - windowMs) / 60000);
  const out = [];
  for (const [name, s] of stats) {
    if (STORES[name].kind !== kind) continue;
    let ms = 0, n = 0;
    for (const slot of s.minutes) if (slot.m > lo && slot.n) { n += slot.n; if (slot.max > ms) ms = slot.max; }
    if (n) out.push({ name, store: STORES[name].store, ms: Math.round(ms * 10) / 10, n });
  }
  return out.sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Lifetime counters per name (a copy). */
function snapshot() {
  const out = {};
  for (const [name, s] of stats) out[name] = { n: s.n, sum: Math.round(s.sum * 10) / 10, max: Math.round(s.max * 10) / 10, buckets: [...s.buckets] };
  return out;
}

/** The window since the previous take — {name: {n, max, buckets}} for names with samples — and a fresh window. */
function takeWindow() {
  const out = {};
  for (const [name, s] of stats) {
    if (!s.win.n) continue;
    out[name] = { n: s.win.n, max: Math.round(s.win.max * 10) / 10, buckets: s.win.buckets };
    s.win = { n: 0, max: 0, buckets: zeros() };
  }
  return out;
}

function enable(v = true) { on = !!v; }
function enabled() { return on; }
function unknownCount() { return unknown; }
/** Suites only: forget every sample. */
function reset() { stats.clear(); unknown = 0; }

module.exports = { timedSync, armed, record, enable, enabled, slowest, snapshot, takeWindow, unknownCount, reset, bucketOf, STORES, NAMES, BUCKETS_MS };
