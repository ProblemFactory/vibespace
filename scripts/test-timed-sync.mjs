#!/usr/bin/env node
// test-timed-sync — design 011 lane 1 (store-timing, 2026-10-03): src/timed-sync.js, the clock around every named
// store's synchronous write and big read (the census that every write in the table is wrapped is
// scripts/test-architecture.mjs §72; the canary's half is scripts/test-fs-canary.mjs).
//   §1 the fixed buckets: every boundary lands in its bucket, slower than the last bound = the overflow bucket
//   §2 the CLOSED names: a frozen table of `<store>.write|read|append` rows; an unknown name runs its fn, never recorded
//   §3 ZERO OVERHEAD WHEN OFF: no clock is read, the value and the throw pass through, nothing is recorded
//   §4 on: one sample per call (a throw too); slowest() = the last hour's writes, slowest first; takeWindow()
//   §5 the real stores record under their names in a scratch data dir (session-status, user-todos, task-groups,
//      channel-store, usage-history)
// Run: node scripts/test-timed-sync.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
const T = require(path.join(REPO, 'src/timed-sync.js'));

console.log('§1 the fixed buckets');
{
  const B = T.BUCKETS_MS;
  ok(Object.isFrozen(B) && B.length === 12 && B.every((v, i) => i === 0 || v > B[i - 1]), `12 ascending frozen bounds (${B.join(',')})`);
  const cases = [[0, 0], [0.4, 0], [1, 0], [1.01, 1], [2, 1], [4.9, 2], [10, 3], [50, 5], [999, 9], [1000, 9], [1001, 10], [5000, 11], [5001, 12], [1e9, 12]];
  const bad = cases.filter(([ms, b]) => T.bucketOf(ms) !== b);
  ok(bad.length === 0, `each bound is inclusive; past 5000 ms = the overflow bucket ${B.length}${bad.length ? ' — wrong: ' + JSON.stringify(bad) : ''}`);
  T.reset(); T.enable(true);
  T.record('jobs.write', 3, 0); T.record('jobs.write', 7000, 0); T.record('jobs.write', -5, 0); T.record('jobs.write', NaN, 0);
  const s = T.snapshot()['jobs.write'];
  ok(s && s.n === 4 && s.buckets.length === 13 && s.buckets[2] === 1 && s.buckets[12] === 1 && s.buckets[0] === 2 && s.max === 7000,
    `a negative / NaN duration counts as 0, never a bucket below 0 (${JSON.stringify(s)})`);
}

console.log('§2 the closed names');
{
  const S = T.STORES;
  ok(Object.isFrozen(S) && Object.values(S).every(Object.isFrozen) && Object.isFrozen(T.NAMES) && T.NAMES.length === Object.keys(S).length, 'the table, every row and NAMES are frozen');
  const shape = Object.entries(S).filter(([n, r]) => !(/^[a-z-]+\.(write|read|append)$/.test(n) && (r.kind === 'read') === n.endsWith('.read')
    && typeof r.store === 'string' && r.store && fs.existsSync(path.join(REPO, r.file)) && (r.kind === 'read' || r.sites.length > 0)));
  ok(shape.length === 0, `every row is <store>.write|read|append, its kind matches, its source file exists, a write names its sites${shape.length ? ' — bad: ' + shape.map((x) => x[0]).join(' ') : ''}`);
  const want = ['session-meta', 'session-status', 'user-todos', 'task-groups', 'jobs', 'channels-index', 'usage-cursors', 'otel-truth', 'telemetry'];
  const missing = want.filter((st) => !T.NAMES.some((n) => n.startsWith(st + '.')));
  ok(missing.length === 0, `the design's named stores and boot reads are all in the list (${want.join(', ')})${missing.length ? ' — missing: ' + missing.join(' ') : ''}`);
  T.reset(); T.enable(true);
  let ran = 0;
  const v = T.timedSync('nope.write', () => { ran++; return 42; });
  ok(v === 42 && ran === 1 && T.unknownCount() === 1 && !('nope.write' in T.snapshot()) && T.record('__proto__', 5) === false && T.record('constructor', 5) === false,
    'an unknown name (or a prototype key) still runs its fn once and returns its value — and is counted as unknown, never recorded');
  try { S['jobs.write'] = null; } catch { }
  ok(S['jobs.write'] && S['jobs.write'].kind === 'write', 'a row cannot be replaced at run time');
}

console.log('§3 zero overhead when off');
{
  T.reset(); T.enable(false);
  const realNow = performance.now, realDate = Date.now;
  let clocks = 0;
  performance.now = () => { clocks++; return realNow.call(performance); };
  Date.now = () => { clocks++; return realDate(); };
  let ran = 0, threw = null, val;
  try {
    val = T.timedSync('jobs.write', () => { ran++; return 'v'; });
    try { T.timedSync('jobs.write', () => { ran++; throw new Error('boom'); }); } catch (e) { threw = e.message; }
  } finally { performance.now = realNow; Date.now = realDate; }
  ok(!T.enabled() && val === 'v' && threw === 'boom' && ran === 2, 'off: the value and the throw pass through, the fn runs once per call');
  ok(clocks === 0, `off: NO clock is read (performance.now / Date.now calls: ${clocks})`);
  ok(Object.keys(T.snapshot()).length === 0 && Object.keys(T.takeWindow()).length === 0 && T.slowest({ now: realDate() }).length === 0, 'off: nothing is recorded');
  const src = fs.readFileSync(path.join(REPO, 'src/timed-sync.js'), 'utf8');
  ok(/function timedSync\(name, fn\) \{\n  if \(!on\) return fn\(\);\n/.test(src), 'the off path is the first statement: `if (!on) return fn();`');
  ok(!/\brequire\s*\(|\bimport\b|\bprocess\.|\bconsole\./.test(src.replace(/^\s*\/\/.*$/gm, '')), 'PURE: no require, no process, no console — a clock and counters only');
  // the on path's cost stays a pair of clock reads: one sample per call
  T.enable(true);
  clocks = 0;
  performance.now = () => { clocks++; return realNow.call(performance); };
  try { T.timedSync('jobs.write', () => 1); } finally { performance.now = realNow; }
  ok(clocks === 2 && T.snapshot()['jobs.write'].n === 1, `on: two performance.now reads per call (${clocks})`);
}

console.log('§4 on: samples, the last hour, the window');
{
  T.reset(); T.enable(true);
  let threw = false;
  try { T.timedSync('task-groups.write', () => { const t = performance.now(); while (performance.now() - t < 3); throw new Error('x'); }); } catch { threw = true; }
  const s = T.snapshot()['task-groups.write'];
  ok(threw && s && s.n === 1 && s.max >= 3, `a write that throws is still timed, and rethrown (${s && s.max} ms)`);
  T.reset();
  const H = 3600000, now = 100 * H;
  T.record('jobs.write', 40, now - 59 * 60000);      // inside the hour
  T.record('jobs.write', 900, now - 61 * 60000);     // older than the hour
  T.record('channels-index.write', 120, now - 5000);
  T.record('session-meta.write', 2, now - 1000);
  T.record('usage-shards.write', 80, now - 30 * 60000);
  T.record('jobs.read', 5000, now - 1000);           // a read: not on the writes line
  const sl = T.slowest({ now });
  ok(JSON.stringify(sl.map((x) => [x.name, x.ms, x.n])) === JSON.stringify([['channels-index.write', 120, 1], ['usage-shards.write', 80, 1], ['jobs.write', 40, 1]]),
    `slowest(): the last hour's writes, slowest first, three of them, a sample 61 min old gone (${JSON.stringify(sl)})`);
  ok(sl[0].store === 'channels/index' && T.slowest({ now, kind: 'read' })[0].name === 'jobs.read', 'each row carries its data file; kind:"read" answers the reads');
  // the per-minute ring reuses a slot an hour later — the old minute's max never leaks in
  T.record('session-meta.write', 2, now + 60 * 60000);
  const later = T.slowest({ now: now + 60 * 60000, limit: 10 });
  ok(later.length === 1 && later[0].name === 'session-meta.write' && later[0].ms === 2, `an hour later only the new minute counts (${JSON.stringify(later)})`);
  const w1 = T.takeWindow(), w2 = T.takeWindow();
  ok(w1['jobs.write'] && w1['jobs.write'].n === 2 && w1['jobs.write'].max === 900 && Object.keys(w2).length === 0 && T.snapshot()['jobs.write'].n === 2,
    'takeWindow(): the samples since the last take, then a fresh window — the lifetime counters stay');
}

console.log('§5 the real stores record under their names');
{
  const dir = scratch('timed-sync');
  fs.mkdirSync(dir, { recursive: true });
  try {
    T.reset(); T.enable(true);
    fs.writeFileSync(path.join(dir, 'session-status.json'), JSON.stringify({ statuses: {} }));
    const { SessionStatusManager } = require(path.join(REPO, 'src/session-status.js'));
    const ss = new SessionStatusManager({ dataDir: dir });
    ss._state.statuses.k = { state: 'working', at: 1 }; ss._save(); ss.flush();
    const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
    const ut = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
    ut._state.items.push({ id: 'x', text: 't', status: 'open', at: 1 }); ut._dirty = true; ut.flush();
    clearInterval(ut._expiryTimer); clearInterval(ut._sweepTimer);
    const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
    const tg = new TaskGroupManager({ dataDir: dir });
    tg._save();
    const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
    const cs = createChannelStore({ dir: path.join(dir, 'channels'), log: { log() {}, warn() {}, error() {} } });
    try { cs.close?.(); } catch { }
    const snap = T.snapshot();
    const want = ['session-status.read', 'session-status.write', 'user-todos.write', 'task-groups.write', 'channels-index.read'];
    const got = want.filter((n) => snap[n] && snap[n].n >= 1);
    ok(got.length === want.length, `a scratch data dir's real stores land under their names (${got.join(', ')})${got.length < want.length ? ' — missing: ' + want.filter((n) => !got.includes(n)).join(' ') : ''}`);
    T.enable(false); T.reset();
    ss._state.statuses.k2 = { state: 'done', at: 2 }; ss._save(); ss.flush();
    ok(Object.keys(T.snapshot()).length === 0 && JSON.parse(fs.readFileSync(path.join(dir, 'session-status.json'), 'utf8')).statuses.k2, 'off: the store still writes, and nothing is timed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
