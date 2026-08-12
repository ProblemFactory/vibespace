#!/usr/bin/env node
// auto-cli refresh DECISION (2.329.0): burn-aware, never-poll-idle. The pure
// function is the whole policy — pin the owner's requirements: fast workflow
// bursts refresh within minutes (drift trigger), idle accounts are NEVER
// polled (the ban-postmortem's signal stays impossible), floors serialize.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { decideCliRefresh } = require('../src/account-pool-auto.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };

const NOW = 1_800_000_000_000;
const MIN = 60e3;

// 1. a fast burst: big est drift on a fresh reading → refresh NOW (the owner's
//    "workflow 快跑 30min 太慢" case — no waiting for any age threshold)
ok(decideCliRefresh([{ key: 'a', fetchedAt: NOW - 6 * MIN, lastAttemptAt: 0, estDriftPct: 12, activeBurn: true }], NOW)[0] === 'a',
  'burst drift (12pt in 6min) refreshes immediately — no fixed cadence wait');
// 2. idle account: old reading, ZERO movement → never polled
ok(decideCliRefresh([{ key: 'idle', fetchedAt: NOW - 300 * MIN, lastAttemptAt: 0, estDriftPct: 0, activeBurn: false }], NOW).length === 0,
  'idle account (no burn) is NEVER polled regardless of staleness');
// 3. active but slow burn: stale reading + some movement → staleness cap fires
ok(decideCliRefresh([{ key: 'slow', fetchedAt: NOW - 50 * MIN, lastAttemptAt: 0, estDriftPct: 1.5, activeBurn: true }], NOW)[0] === 'slow',
  'active-but-slow burn refreshes at the staleness cap');
// 4. per-account floor: recent attempt suppresses even a big drift
ok(decideCliRefresh([{ key: 'a', fetchedAt: NOW - 10 * MIN, lastAttemptAt: NOW - 2 * MIN, estDriftPct: 20, activeBurn: true }], NOW).length === 0,
  '5min per-account floor holds even under drift (spawn hammering impossible)');
// 5. one per tick, biggest drift wins
const picks = decideCliRefresh([
  { key: 'x', fetchedAt: NOW - 10 * MIN, lastAttemptAt: 0, estDriftPct: 6, activeBurn: true },
  { key: 'y', fetchedAt: NOW - 10 * MIN, lastAttemptAt: 0, estDriftPct: 15, activeBurn: true },
], NOW);
ok(picks.length === 1 && picks[0] === 'y', 'one refresh per tick, biggest drift first (serialized spawns)');
// 6. sub-threshold drift on a fresh reading → nothing
ok(decideCliRefresh([{ key: 'a', fetchedAt: NOW - 10 * MIN, lastAttemptAt: 0, estDriftPct: 2, activeBurn: true }], NOW).length === 0,
  'small drift on a fresh reading stays quiet');
// 7. hostile/empty input never throws
ok(decideCliRefresh(null, NOW).length === 0 && decideCliRefresh([{}, null], NOW).length === 0,
  'hostile input returns empty, never throws');

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
