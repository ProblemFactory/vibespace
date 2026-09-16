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
// without pulling the roster in). §5/§6 (2026-09-15, owner: 写成 2d21h38m 的形式,
// 一眼扫过去就能知道哪个账号马上要可用了): the FULL form and the ACCOUNT-level pick —
// blocked ⇒ the LAST spent bucket's reset, free ⇒ the EARLIEST, the same
// B-8b12 refusal, and a spent bucket whose reset passed blocks nothing.
// Run: node scripts/test-usage-eta.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ETA_MIN_MS, accountResetEta, compactEta, bucketEta, bucketMayNameDeadline, bucketResetMs, fullEta } from '../src/lib/usage-eta.js';

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

console.log('§5 the full form (2d21h38m): whole minutes, leading zero units dropped, inner zeros kept');
const full = [
  [44 * S, null, 'under 45 s: not a countdown (the same guard as the compact form)'],
  [45 * S, '1m', '45 s = the guard, inclusive: 1m'],
  [89 * S, '1m', '89 s rounds to 1m'],
  [90 * S, '2m', '90 s rounds half up to 2m'],
  [38 * M, '38m', '38 min (the owner\'s example) — minutes only below 1 h'],
  [59 * M + 29 * S, '59m', '59 min 29 s rounds down'],
  [59 * M + 30 * S, '1h0m', '59 min 30 s rounds up to 1h0m: the hour unit appears, the minutes stay'],
  [21 * H + 38 * M, '21h38m', '21 h 38 min (the owner\'s example) — no day unit'],
  [2 * D + 21 * H + 38 * M, '2d21h38m', '2 d 21 h 38 min (the owner\'s example)'],
  [2 * D + 21 * H + 38 * M + 30 * S, '2d21h39m', '…+30 s rounds the minute up (never seconds)'],
  [2 * D + 5 * M, '2d0h5m', 'INNER zero units are kept (2d0h5m) so the column stays tabular'],
  [3 * H, '3h0m', '3 h exactly reads 3h0m'],
  [30 * D, '30d0h0m', '30 d'],
];
for (const [rem, want, why] of full) check(`${why} → ${JSON.stringify(want)}`, fullEta(NOW + rem, NOW) === want, fullEta(NOW + rem, NOW));
check('fullEta: reset passed → null', fullEta(NOW - 5 * M, NOW) === null);
check('fullEta: reset missing / NaN / non-numeric → null', fullEta(undefined, NOW) === null && fullEta(NaN, NOW) === null && fullEta('soon', NOW) === null);
check('fullEta: now missing → null (no clock, no countdown)', fullEta(NOW + H, undefined) === null);
check('fullEta agrees with compactEta on what is NOT a countdown (the same 45 s guard)', [0, 30 * S, 44.999 * S, -M].every((rem) => (fullEta(NOW + rem, NOW) === null) === (compactEta(NOW + rem, NOW) === null)));

console.log('§6 the account-level pick: blocked ⇒ the LAST spent bucket\'s reset; free ⇒ the EARLIEST; only a bucket that may name a deadline');
const at = (rem) => secs(NOW + rem);
const run = (rem, extra = {}) => ({ state: 'running', resetsAt: at(rem), ...extra });
let r = accountResetEta([{ bucket: run(15 * H), pct: 40, label: '7d' }, { bucket: run(65 * M), pct: 20, label: '5h' }, { bucket: run(3 * D), pct: 60, label: 'Fa' }], NOW);
check('free: the EARLIEST reset (5h, 65 min) is the answer, in full form', r && r.text === '1h5m' && r.label === '5h' && r.blocked === false && r.ms === at(65 * M) * 1000, r);
r = accountResetEta([{ bucket: run(15 * H), pct: 100, label: '7d' }, { bucket: run(65 * M), pct: 20, label: '5h' }, { bucket: run(3 * D), pct: 98, label: 'Fa', spentPct: 97 }], NOW);
check('blocked: two spent buckets (7d 100 %, Fa 98 % ≥ its 97 bar) ⇒ the LATER reset (Fa, 3 d) — usable only when the last one resets', r && r.text === '3d0h0m' && r.label === 'Fa' && r.blocked === true, r);
r = accountResetEta([{ bucket: run(15 * H), pct: 100, label: '7d' }, { bucket: run(65 * M), pct: 20, label: '5h' }], NOW);
check('blocked: one spent bucket (7d) outranks a SOONER free one (5h) — the 5h reset does not make the account usable', r && r.label === '7d' && r.text === '15h0m' && r.blocked === true, r);
r = accountResetEta([{ bucket: run(15 * H), pct: 96, label: '7d', spentPct: 97 }, { bucket: run(65 * M), pct: 20, label: '5h' }], NOW);
check('the bar is per entry: 96 % under a 97 bar is NOT spent ⇒ free, earliest (5h)', r && r.blocked === false && r.label === '5h', r);
r = accountResetEta([{ bucket: run(15 * H), pct: 96, label: '7d', spentPct: 95 }, { bucket: run(65 * M), pct: 20, label: '5h' }], NOW);
check('…and 96 % over a 95 bar IS spent ⇒ blocked on 7d', r && r.blocked === true && r.label === '7d' && r.text === '15h0m', r);
r = accountResetEta([{ bucket: run(15 * H), pct: 100, label: '7d' }], NOW);
check('default bar 100: a bucket reading fully used is spent', r && r.blocked === true, r);
r = accountResetEta([{ bucket: run(15 * H), pct: 99.5, label: '7d' }], NOW);
check('default bar 100: 99.5 % is not', r && r.blocked === false, r);
r = accountResetEta([{ bucket: run(15 * H, { utilization: 1 }), label: '7d' }], NOW);
check('no pct given ⇒ the bucket\'s own utilization (1.0 = 100 %) decides: blocked, pct 100', r && r.blocked === true && r.pct === 100, r);
r = accountResetEta([{ bucket: run(15 * H, { usedPercent: 12 }), label: '7d' }], NOW);
check('no pct given ⇒ usedPercent is read (12 %): free', r && r.blocked === false && r.pct === 12, r);
r = accountResetEta([{ bucket: run(15 * H), label: '7d' }], NOW);
check('no pct anywhere ⇒ unknown is never "spent": free', r && r.blocked === false && r.pct === null, r);
r = accountResetEta([{ bucket: { state: 'empty', resetsAt: at(5 * H) }, pct: 0, label: '5h' }, { bucket: run(15 * H), pct: 40, label: '7d' }], NOW);
check('an EMPTY window is not a candidate even though its reset is sooner (B-8b12: it slides) ⇒ 7d', r && r.label === '7d' && r.text === '15h0m', r);
r = accountResetEta([{ bucket: run(-60 * S), pct: 100, label: '7d' }, { bucket: run(65 * M), pct: 20, label: '5h' }], NOW);
check('a spent bucket whose reset PASSED rolled over and blocks nothing ⇒ free, 5h', r && r.blocked === false && r.label === '5h', r);
r = accountResetEta([{ bucket: run(30 * S), pct: 100, label: '5h' }], NOW);
check('a reset under the 45 s guard is not a countdown ⇒ null', r === null, r);
check('no candidates ⇒ null (never "0m")', accountResetEta([{ bucket: { state: 'empty', resetsAt: at(5 * H) }, pct: 0 }, { bucket: { state: 'running' }, pct: 50 }], NOW) === null);
check('empty / non-array / junk entries ⇒ null', accountResetEta([], NOW) === null && accountResetEta(null, NOW) === null && accountResetEta([null, 'x', { bucket: null }, { bucket: 7 }], NOW) === null);
check('no clock ⇒ null', accountResetEta([{ bucket: run(15 * H), pct: 1 }], undefined) === null);
check('the answer carries the instant in ms, so a reader can re-spell it later on its own clock', (() => { const x = accountResetEta([{ bucket: run(2 * H), pct: 1, label: '5h' }], NOW); return x && fullEta(x.ms, NOW + 30 * M) === '1h30m' && fullEta(x.ms, NOW + 2 * H) === null; })());

console.log('§4 PURE: the module imports nothing');
const src = fs.readFileSync(path.join(repo, 'src/lib/usage-eta.js'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
check('no import / require in src/lib/usage-eta.js', !/\bimport\b|\brequire\(/.test(code));
check('no DOM / clock access (document, window, Date.now) — the clock is an argument', !/\bdocument\b|\bwindow\b|Date\.now/.test(code));

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
