#!/usr/bin/env node
// THE COMPACT RESET COUNTDOWN — src/lib/usage-eta.js (PURE, DOM-free, the
// clock injected; 2026-09-14, owner: "在每个 pie 下面加一个 15h(剩余 2h–72h)、
// 3d(>72h, 四舍五入)、65m(<2h)"). A TABLE test over every band boundary the
// module states, driven with an INJECTED `now` so nothing here depends on the
// time of day (a fixture that pins a calendar date is a time bomb — test-ci-
// gate §7 censuses the literal), plus the B-8b12 refusal: a bucket whose
// window has not started (`state:'empty'`) reports a reset that slides with
// the clock and may NOT be printed as a countdown. Also the census that the
// module imports nothing (PURE — the taskbar and any later surface may ask it
// without pulling the roster in).
// Run: node scripts/test-usage-eta.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ETA_MIN_MS, compactEta, bucketEta, bucketMayNameDeadline, bucketResetMs } from '../src/lib/usage-eta.js';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    got ' + JSON.stringify(e) : ''}`); } };
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
// an INJECTED clock: any instant works, so pick one the table cannot depend on
const NOW = 1_700_000_000_000 + 12345;

console.log('§1 the three bands, at their boundaries (remaining → token)');
const table = [
  [44 * S, null, 'under 45 s: not a countdown (the roster\'s existing guard)'],
  [44.999 * S, null, '44.999 s: still under the guard'],
  [45 * S, '1m', '45 s = the guard, inclusive: minutes band, rounds to 1m'],
  [89 * S, '1m', '89 s rounds to 1m'],
  [90 * S, '2m', '90 s rounds half up to 2m'],
  [65 * M, '65m', '65 min (the owner\'s example)'],
  [119.5 * M, '120m', '119.5 min is STILL the minutes band (rounds inside it, never across)'],
  [2 * H - 1, '120m', '1 ms under 2 h: minutes'],
  [2 * H, '2h', '2 h exactly: hours band begins'],
  [2 * H + 29 * M, '2h', '2 h 29 min rounds down to 2h'],
  [2 * H + 30 * M, '3h', '2 h 30 min rounds half up to 3h'],
  [15 * H, '15h', '15 h (the owner\'s example)'],
  [71.99 * H, '72h', '71.99 h: still hours, reads 72h'],
  [72 * H - 1, '72h', '1 ms under 72 h: hours'],
  [72 * H, '3d', '72 h exactly: days band, 3d'],
  [84 * H, '4d', '84 h = 3.5 d rounds half up to 4d'],
  [83 * H, '3d', '83 h rounds down to 3d'],
  [3.2 * D, '3d', '3.2 d reads 3d'],
  [30 * D, '30d', '30 d'],
  [30 * D + 11 * H, '30d', '30 d 11 h rounds down'],
  [30 * D + 12 * H, '31d', '30 d 12 h rounds half up'],
];
for (const [rem, want, why] of table) check(`${why} → ${JSON.stringify(want)}`, compactEta(NOW + rem, NOW) === want, compactEta(NOW + rem, NOW));

console.log('§2 nothing to count: missing, unparseable, negative, passed');
check('remaining 0 → null', compactEta(NOW, NOW) === null);
check('remaining negative (reset passed) → null', compactEta(NOW - 5 * M, NOW) === null);
check('reset missing (undefined) → null', compactEta(undefined, NOW) === null);
check('reset null → null', compactEta(null, NOW) === null);
check('reset NaN → null', compactEta(NaN, NOW) === null);
check('reset a non-numeric string → null', compactEta('soon', NOW) === null);
check('now missing → null (no clock, no countdown)', compactEta(NOW + H, undefined) === null);
check('a numeric STRING reset is accepted (Number())', compactEta(String(NOW + 15 * H), NOW) === '15h');
check('ETA_MIN_MS is the 45 s guard', ETA_MIN_MS === 45 * S);

console.log('§3 the bucket rule (legacy view: resetsAt in unix SECONDS, `state` stamped by the derived view)');
const secs = (ms) => Math.floor(ms / 1000);
check('bucketResetMs: seconds → ms', bucketResetMs({ resetsAt: secs(NOW + H) }) === secs(NOW + H) * 1000);
check('bucketResetMs: a millisecond value is tolerated as-is', bucketResetMs({ resetsAt: NOW + H }) === NOW + H);
check('bucketResetMs: 0 = none stated → null', bucketResetMs({ resetsAt: 0 }) === null);
check('bucketResetMs: negative → null', bucketResetMs({ resetsAt: -5 }) === null);
check('bucketResetMs: missing → null', bucketResetMs({}) === null && bucketResetMs(null) === null);
check('a running window may name a deadline', bucketMayNameDeadline({ state: 'running', resetsAt: 1 }) === true);
check('a legacy bucket with NO state may (older files, the derived view never stamped it)', bucketMayNameDeadline({ resetsAt: 1 }) === true);
check('an EMPTY window may not (B-8b12: its reset slides with the clock)', bucketMayNameDeadline({ state: 'empty', resetsAt: 1 }) === false);
check('an UNKNOWN window may not (nothing stated)', bucketMayNameDeadline({ state: 'unknown', resetsAt: 1 }) === false);
check('a non-object is refused', bucketMayNameDeadline(null) === false && bucketMayNameDeadline('x') === false);
check('bucketEta: running + 65 min out → 65m', bucketEta({ state: 'running', utilization: 0.4, resetsAt: secs(NOW + 65 * M) }, NOW) === '65m');
check('bucketEta: state absent + 15 h out → 15h', bucketEta({ utilization: 0.9, resetsAt: secs(NOW + 15 * H) }, NOW) === '15h');
check('bucketEta: 3.2 d out → 3d', bucketEta({ state: 'running', resetsAt: secs(NOW + 3.2 * D) }, NOW) === '3d');
check('bucketEta: EMPTY window with a reset one window out → null (refused, not "5h")', bucketEta({ state: 'empty', utilization: 0, resetsAt: secs(NOW + 5 * H) }, NOW) === null);
check('bucketEta: a passed reset → null', bucketEta({ state: 'running', resetsAt: secs(NOW - M) }, NOW) === null);
check('bucketEta: no reset → null', bucketEta({ state: 'running', utilization: 0.5 }, NOW) === null);
check('bucketEta: the 45 s guard applies through the bucket form too', bucketEta({ resetsAt: secs(NOW + 30 * S) }, NOW) === null);

console.log('§4 PURE: the module imports nothing');
const src = fs.readFileSync(path.join(repo, 'src/lib/usage-eta.js'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
check('no import / require in src/lib/usage-eta.js', !/\bimport\b|\brequire\(/.test(code));
check('no DOM / clock access (document, window, Date.now) — the clock is an argument', !/\bdocument\b|\bwindow\b|Date\.now/.test(code));

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
