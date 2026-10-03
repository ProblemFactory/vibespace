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

const BUCKETS_MS = Object.freeze([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]);
const HOUR_MS = 3600000;

// name → { kind, store (its data under data/, the extension left off — test-record-clear-census §A lets only a
// store's owner spell its file name), file (the source), sites (the functions that write it) }
const row = (kind, store, file, sites = []) => Object.freeze({ kind, store, file, sites: Object.freeze(sites) });
const STORES = Object.freeze({
  'session-meta.write': row('write', 'session-meta/<sock>', 'src/server/session-stdout.js', ['writeSessionMeta']),
  'session-meta.read': row('read', 'session-meta/<sock>', 'src/server/session-stdout.js'),
  'session-status.write': row('write', 'session-status', 'src/session-status.js', ['_flush']),
  'session-status.read': row('read', 'session-status', 'src/session-status.js'),
  'user-todos.write': row('write', 'user-todos', 'src/user-todos.js', ['_flush']),
  'user-todos.read': row('read', 'user-todos', 'src/user-todos.js'),
  'task-groups.write': row('write', 'task-groups', 'src/task-groups.js', ['_save']),
  'task-groups.read': row('read', 'task-groups', 'src/task-groups.js'),
  'jobs.write': row('write', 'jobs', 'src/jobs.js', ['_save']),
  'jobs-notifs.write': row('write', 'job-notifications', 'src/jobs.js', ['_save', '_saveNotifs']),
  'jobs.read': row('read', 'jobs', 'src/jobs.js'),
  'channels-index.write': row('write', 'channels/index', 'src/channel-store.js', ['writeIndex']),
  'channels-index.read': row('read', 'channels/index', 'src/channel-store.js'),
  'usage-shards.write': row('write', 'usage-history/events-<month>', 'src/usage-history.js', ['_walkAndAppend', 'ingestRemoteEvents']),
  'usage-cursors.write': row('write', 'usage-history/_cursors', 'src/usage-history.js', ['_writeCursors']),
  'usage-cursors.read': row('read', 'usage-history/_cursors', 'src/usage-history.js'),
  'otel-truth.write': row('write', 'usage-history/otel-truth', 'src/server/otel-ingest.js', ['create']),
  'otel-truth.append': row('write', 'usage-history/otel-truth', 'src/server/otel-ingest.js', ['create']),
  'otel-truth.read': row('read', 'usage-history/otel-truth', 'src/server/otel-ingest.js'),
  'telemetry.read': row('read', 'telemetry/events-<month>', 'src/telemetry.js'),
});
const NAMES = Object.freeze(Object.keys(STORES));

let on = false;
let unknown = 0;
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

/** THE WRAPPER: runs fn synchronously and returns (or throws) what it does; when on, its duration is recorded. */
function timedSync(name, fn) {
  if (!on) return fn();
  const t0 = performance.now();
  try { return fn(); } finally { record(name, performance.now() - t0); }
}

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

module.exports = { timedSync, record, enable, enabled, slowest, snapshot, takeWindow, unknownCount, reset, bucketOf, STORES, NAMES, BUCKETS_MS };
