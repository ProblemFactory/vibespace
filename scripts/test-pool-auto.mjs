// B-6217 v2 — auto-switch decision logic (pure; the server engine feeds it the
// passive usage cache). Covers the user's spec: trigger = current target <5%
// remaining taking the MIN across 5h/7d/scoped-weekly; choice = member with
// the MOST remaining by the same measure; reset-passed buckets read as full.
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { bucketRemaining, accountRemaining, decidePoolSwitch } = require(path.resolve('src/account-pool-auto.js'));

let pass = 0, fail = 0;
const ck = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const NOW = 1800000000; // unix seconds
const fut = NOW + 3600, past = NOW - 3600;

ck('bucket: 90% used → 10 remaining', bucketRemaining({ utilization: 0.9, resetsAt: fut }, NOW) === 10);
ck('bucket: reset PASSED → full again (stale reading is meaningless)', bucketRemaining({ utilization: 0.98, resetsAt: past }, NOW) === 100);
ck('bucket: garbage → null', bucketRemaining({ utilization: 'x' }, NOW) === null);
ck('account: min across 5h/7d/scoped', accountRemaining({ fiveHour: { utilization: 0.5, resetsAt: fut }, sevenDay: { utilization: 0.2, resetsAt: fut }, scopedWeekly: [{ name: 'Fable', utilization: 0.97, resetsAt: fut }] }, NOW).remaining === 3);
ck('account: no data → unknown', accountRemaining({}, NOW).known === false);

const mk = (u) => ({ fiveHour: { utilization: u, resetsAt: fut }, sevenDay: { utilization: 0, resetsAt: fut } });
const members = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const run = (caches, currentId = 'a') => decidePoolSwitch({ currentId, members, readCache: (id) => caches[id] ?? null, nowSec: NOW });

ck('current at 50% → stay', run({ a: mk(0.5), b: mk(0) }) === null);
ck('current at 3% → switch to the most-remaining member', run({ a: mk(0.97), b: mk(0.5), c: mk(0.1) })?.to === 'c');
ck('scoped bucket alone can trigger (min-across rule)', run({ a: { ...mk(0), scopedWeekly: [{ name: 'Fable', utilization: 0.99, resetsAt: fut }] }, b: mk(0.2) })?.to === 'b');
ck('current data UNKNOWN → stay (never flap on ignorance)', run({ b: mk(0) }) === null);
ck('unknown member ranks 50: loses to a known 80%', run({ a: mk(0.97), b: mk(0.2) })?.to === 'b');
ck('unknown member ranks 50: beats a known 10%', run({ a: mk(0.97), b: mk(0.9) })?.to === 'c');
ck('every member equally exhausted → stay (nowhere better)', run({ a: mk(0.97), b: mk(0.98), c: mk(0.99) }) === null);
ck('reset-passed member reads full and wins', run({ a: mk(0.97), b: mk(0.5), c: { fiveHour: { utilization: 0.99, resetsAt: past }, sevenDay: { utilization: 0.99, resetsAt: past } } })?.to === 'c');
ck('verdict carries fromRemaining', Math.round(run({ a: mk(0.97), b: mk(0) })?.fromRemaining) === 3);

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
