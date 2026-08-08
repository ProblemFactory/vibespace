// Parity test for src/lib/usage-pace.js vs claude-swap's pace.py logic (B-87fe).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computePace, projectedExhaustionTs } = require('../src/lib/usage-pace.js');
let pass=0, fail=0;
const ck=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n)} else {fail++;console.log('  ✗ '+n)} };
const NOW = Math.floor(Date.now()/1000);
const P = 7*86400;
// mid-week (3.5 days in), pct 20 vs expected 50 → behind, not ahead
{ const reset = NOW + 3.5*86400; const r = computePace({pct:20, resetsAtSec:reset}, NOW);
  ck('mid-week computes', r && Math.abs(r.expectedPct-50)<0.5);
  ck('20%@50%expected → not ahead', r && r.ahead===false); }
// 30% used at 10% expected (early, but past 24h suppress) → ahead (diff 20 ≥ 15)
{ const elapsed = 0.7*86400 + 24*3600; // ~1.7 days in, past suppress; expected ~24%... pick further
  const reset = NOW + (P - 2*86400); const r = computePace({pct:60, resetsAtSec:reset}, NOW);
  ck('60%@~29%expected → ahead', r && r.ahead===true); }
// inside 24h suppress window → null
{ const reset = NOW + (P - 3600); const r = computePace({pct:50, resetsAtSec:reset}, NOW);
  ck('within 24h of reset → null', r===null); }
// stale snapshot older than a full period → null (our extra guard)
{ const reset = NOW + 3*86400; const r = computePace({pct:80, resetsAtSec:reset}, NOW - P - 3600);
  ck('snapshot older than a period → null', r===null); }
// resets_at already in the past by whole cycles still works (mod folds it)
{ const reset = NOW - 2*P + 3.5*86400; const r = computePace({pct:20, resetsAtSec:reset}, NOW);
  ck('stale-not-rolled reset still folds', r && Math.abs(r.expectedPct-50)<0.5); }
// bad inputs → null
ck('no window → null', computePace(null, NOW)===null);
ck('non-number pct → null', computePace({pct:'x', resetsAtSec:NOW+P}, NOW)===null);
ck('no fetchedAt → null', computePace({pct:20, resetsAtSec:NOW+P}, null)===null);
// projection is finite when climbing, null when flat
{ const reset = NOW + 3.5*86400; const r = computePace({pct:40, resetsAtSec:reset}, NOW);
  ck('projection finite when climbing', typeof projectedExhaustionTs(r, NOW)==='number');
  ck('projection null when pct=0', projectedExhaustionTs(computePace({pct:0,resetsAtSec:reset},NOW), NOW)===null); }
console.log(fail?`${fail} FAILED (${pass} passed)`:`ALL PASS (${pass})`);
process.exit(fail?1:0);
