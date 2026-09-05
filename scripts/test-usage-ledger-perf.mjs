#!/usr/bin/env node
// inc-mtox23xw (2.369.36): Debugger.pause caught the server's main thread inside
// usageHistory._events ← costBetweenMulti ← learnRates ← ratesFor three times —
// a FULL ledger scan (plus a readdir+stat per shard) for EVERY anchor pair on
// EVERY recompute, recomputed on every new anchor. Loop gaps of 10-59s, every
// request slow, heartbeat terminations, reconnect storms. This suite pins the
// fix: a sorted view with binary-searched intervals, a 1s readdir throttle,
// and an interval memo — with brute-force parity so the numbers never drift.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 300) : '')); } };
const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));
const { costBetweenMulti } = require(path.join(REPO, 'src/usage-anchors.js'));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ledger-perf-'));
fs.mkdirSync(path.join(dataDir, 'usage-history'), { recursive: true });
// 60k events over 30 days, deliberately NOT in time order (remote harvests interleave)
const N = 60000, T0 = Date.UTC(2026, 7, 6), SPAN = 30 * 86400000;
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const lines = [];
for (let i = 0; i < N; i++) {
  const ts = T0 + Math.floor(rnd() * SPAN);
  const acct = ['sub-a', 'sub-b', '__global__', 'sub-c'][i % 4];
  lines.push(JSON.stringify({ rid: 'r' + i, ts, sid: 's' + (i % 50), acct, model: i % 3 ? 'claude-fable-5-1' : 'claude-opus-5', cwd: '/w', i: 100 + (i % 500), cw5: i % 7 ? 0 : 2000, cw1: 0, cr: 3000 + (i % 900), o: 40 + (i % 60), tier: 'default' }));
}
fs.writeFileSync(path.join(dataDir, 'usage-history', 'events-2026-08.ndjson'), lines.slice(0, 30000).join('\n') + '\n');
fs.writeFileSync(path.join(dataDir, 'usage-history', 'events-2026-09.ndjson'), lines.slice(30000).join('\n') + '\n');
const uh = new UsageHistory({ dataDir, homeDir: dataDir });
const all = uh._loadEvents();
ok(all.length === N, `ledger loads ${all.length} events across two shards`);

// brute-force reference (the pre-2.369.36 semantics, insertion order, full scan)
const brute = (ids, from, to) => {
  const want = new Set(ids);
  const out = { total: 0, requests: 0 };
  for (const ev of all) { if (ev.ts < from || ev.ts > to) continue; const a = ev.acct || '__global__'; if (!want.has(a)) continue; out.total += uh._cost(ev); out.requests++; }
  out.total = Math.round(out.total * 10000) / 10000; return out;
};
let mismatches = 0; const intervals = [];
for (let k = 0; k < 40; k++) { const a = T0 + Math.floor(rnd() * SPAN), b = a + Math.floor(rnd() * 3 * 86400000); intervals.push([a, b]); }
for (const [a, b] of intervals) {
  const r = costBetweenMulti(uh, ['sub-a', '__global__'], a, b), ref = brute(['sub-a', '__global__'], a, b);
  if (Math.abs(r.total - ref.total) > 1e-6 || r.requests !== ref.requests) mismatches++;
}
ok(mismatches === 0, 'costBetweenMulti (sorted + binary search) matches the brute-force full scan on 40 random intervals over an UNSORTED ledger');
ok(uh._evCountUpTo(T0 - 1) === 0 && uh._evCountUpTo(T0 + SPAN + 1) === N && uh._evCountUpTo(T0 + SPAN / 2) > 0.4 * N && uh._evCountUpTo(T0 + SPAN / 2) < 0.6 * N, '_evCountUpTo is a correct upper-bound count on the sorted view');
const gen = [...uh._events(T0 + 86400000, T0 + 2 * 86400000)];
ok(gen.every((e, i) => i === 0 || e.ts >= gen[i - 1].ts) && gen.every((e) => e.ts >= T0 + 86400000 && e.ts <= T0 + 2 * 86400000) && gen.length === all.filter((e) => e.ts >= T0 + 86400000 && e.ts <= T0 + 2 * 86400000).length, '_events yields exactly the interval, in time order');

// timing: 2000 pair-costs (a realistic learn) must be far below one loop-blocking second
const pairs = []; for (let k = 0; k < 2000; k++) { const a = T0 + Math.floor(rnd() * SPAN), b = a + 5 * 3600000; pairs.push([a, b]); }
let t = Date.now(); for (const [a, b] of pairs) costBetweenMulti(uh, ['sub-a', '__global__'], a, b); const cold = Date.now() - t;
t = Date.now(); for (const [a, b] of pairs) costBetweenMulti(uh, ['sub-a', '__global__'], a, b); const warm = Date.now() - t;
ok(cold < 1500, `2000 interval costs over 60k events, cold: ${cold}ms (was a full 60k scan per pair)`);
ok(warm < 60, `…and memoized on the second learn: ${warm}ms`);
// memo invalidation: a late event INSIDE an interval changes its cost
const [a0, b0] = pairs[0]; const before = costBetweenMulti(uh, ['sub-a'], a0, b0).total;
fs.appendFileSync(path.join(dataDir, 'usage-history', 'events-2026-09.ndjson'), JSON.stringify({ rid: 'late-1', ts: a0 + 1000, sid: 'sx', acct: 'sub-a', model: 'claude-fable-5-1', cwd: '/w', i: 100000, cw5: 0, cw1: 0, cr: 0, o: 1000, tier: 'default' }) + '\n');
uh._evCache = null; // what scan() does when a shard grew
const after = costBetweenMulti(uh, ['sub-a'], a0, b0).total;
ok(after > before, 'a backfilled event INSIDE a memoized interval invalidates that memo (count-at-or-before-`to` key)');
// readdir throttle: repeated _loadEvents calls within 1s must not re-stat the shards
const realReaddir = fs.readdirSync; let calls = 0; fs.readdirSync = (...a) => { if (String(a[0]).includes('usage-history')) calls++; return realReaddir(...a); };
for (let k = 0; k < 200; k++) uh._loadEvents();
fs.readdirSync = realReaddir;
ok(calls <= 2, `_loadEvents re-checks the shard dir at most once per second (${calls} readdir calls for 200 lookups)`);
// wiring: the estimator + the pool sweep still reach the same function
const ua = fs.readFileSync(path.join(REPO, 'src/usage-anchors.js'), 'utf8');
ok(/const _costMemo = new Map\(\);/.test(ua) && /usageHistory\._evCountUpTo\(toMs \|\| Infinity\)/.test(ua) && /_costMemo\.set\(memoKey/.test(ua), 'costBetweenMulti memo is keyed by ids|from|to|count-up-to');
const uhs = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
ok(/_sortedEvents\(\) \{/.test(uhs) && /if \(Date\.now\(\) - \(c\.checkedAt \|\| 0\) < 1000\) return c\.events;/.test(uhs) && /if \(to && ev\.ts > to\) break;/.test(uhs), 'usage-history has the sorted view, the 1s throttle and the early break');
// the client half of inc-mtox23xw: the post-attach auto-fill page-up is settle-gated
const cv = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
ok(/if \(this\._windowStart > 0 && rendered < 30 && list\.scrollHeight <= list\.clientHeight\) \{/.test(cv) && /\}, 700\);/.test(cv) && /autoFill/.test(cv), 'chat-view: the auto-fill page-up after attach waits for heights to settle and only fires for a genuinely short view (never a pinned tall window)');
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
