#!/usr/bin/env node
// THE TYPED QUOTA MODEL (src/quota-model.js) + THE ONE WRITE PATH
// (src/usage-cache-write.js) + the per-harness typed producers.
//
// The three incidents this suite exists for, each with the measurement that
// produced its fixture (all taken from this instance's own session buffers and
// usage-cache, anonymised — no ids, no emails, no tokens):
//
//  B-9213  the codex app-server pushes ONE rate_limits_updated PER LIMIT and we
//          collapsed them into one cache file. Measured on sess-13 (one
//          conversation, 208 pushes): `codex` 32× (plan, 10080min, 5 %…100 %),
//          `codex_bengalfox`/"GPT-5.3-Codex-Spark" 149× (300+10080min, 0 %/0 %),
//          `premium` 27× (no windows at all). The file on disk held the SPARK
//          limit and the plan limit was gone.
//  B-8b12  an EMPTY window reports resetsAt = now + windowDuration at every
//          read. Measured over 328 empty readings: elapsed-into-window ∈
//          [8 s, 489 s]; over 125 running readings: ≥ 1151 s. A 662-second dead
//          band, and `EMPTY_WINDOW_JITTER_SEC` sits inside it.
//  (c)     claude's model-scoped cap exists for one family and lives in a
//          `scopedWeekly[]` array; codex has no such shape. Every reader
//          special-cased both.
//
// Run: node scripts/test-quota-model.mjs
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Every patched copy ⑯–⑱ load is written OUTSIDE the tree
// (scripts/mutant-copy.mjs: this process's scratch dir, `require` re-bound on
// line 1 to the real module's path); ⑲' measures that while they exist.
const MUTC = mutantCopies('qm', ROOT);
// what a pre-fix run stranded (dead PIDs only): vs-qmr{3,4,6}-mut-<pid>-*
sweepLegacy(ROOT, ['src', 'src/harnesses', 'src/adapters'], /^vs-qmr[346]-mut-(\d+)-/);
const QM = require(path.join(ROOT, 'src/quota-model.js'));
const W = require(path.join(ROOT, 'src/usage-cache-write.js'));
const CODEXQ = require(path.join(ROOT, 'src/harnesses/codex-quota.js'));
const CLAUDEQ = require(path.join(ROOT, 'src/harnesses/claude-quota.js'));
const NULLQ = require(path.join(ROOT, 'src/harnesses/null-quota.js'));
const { familyOfScopedBucket } = require(path.join(ROOT, 'src/model-family.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
// scratch dirs this suite makes (mkdtemp, never a fixed /tmp name — the fast tier
// forbids a suite claiming a machine-global path); swept on exit so a run that
// drives the shipped tool repeatedly does not leave a directory per assert.
const tmpDirs = [];
process.on('exit', () => { for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}`);

// ── the CORPUS: real payload shapes, anonymised ─────────────────────────────
// Captured verbatim from data/session-buffers/sess-13-*.buf and sess-4-*.buf
// (the owner's own codex conversations) with nothing but the timestamps
// re-based. These are the three limits, in the order they arrive.
const T0 = 1788900000000; // the arrival instant the windows below were measured at
const CODEX_PREMIUM = { limitId: 'premium', limitName: null, primary: null, secondary: null, credits: { hasCredits: false, unlimited: false, balance: '0' }, individualLimit: null, spendControlReached: null, planType: 'pro', rateLimitReachedType: null };
const CODEX_PLAN = { limitId: 'codex', limitName: null, primary: { usedPercent: 5, windowDurationMins: 10080, resetsAt: 1789509325 }, secondary: null, credits: { hasCredits: false, unlimited: false, balance: '0' }, individualLimit: null, spendControlReached: null, planType: 'pro', rateLimitReachedType: null };
const CODEX_PLAN_FULL = { ...CODEX_PLAN, primary: { usedPercent: 100, windowDurationMins: 10080, resetsAt: 1789356983 } };
// The Spark limit's sliding reset: resetsAt === measuredAt + window − 40 s
// (the measured median offset over 328 real readings).
const sparkAt = (ms) => ({
  limitId: 'codex_bengalfox', limitName: 'GPT-5.3-Codex-Spark',
  primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: Math.round(ms / 1000) + 300 * 60 - 40 },
  secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: Math.round(ms / 1000) + 10080 * 60 - 40 },
  credits: { hasCredits: false, unlimited: false, balance: '0' }, individualLimit: null,
  spendControlReached: null, planType: 'pro', rateLimitReachedType: null,
});

console.log('\n① the VALIDATOR refuses what the readers cannot read');
{
  const good = QM.makeLimitSet({ identity: 'sub-x', fetchedAt: T0, source: 'test', limits: [QM.makeLimit({ limitId: 'plan', scope: 'plan', windows: [QM.makeWindow({ kind: '7d', usedPct: 40, resetsAt: 1789509325, measuredAt: T0 })] })] });
  ok(QM.validateLimitSet(good).ok, 'a well-formed set validates');
  ok(!QM.validateLimitSet(null).ok, 'null is not a set');
  ok(!QM.validateLimitSet({ limits: 'nope' }).ok, 'limits must be an array');
  const dup = { ...good, limits: [good.limits[0], good.limits[0]] };
  const vd = QM.validateLimitSet(dup);
  ok(!vd.ok && /duplicate/.test(vd.errors.join(' ')), 'two records for one limitId is a duplicate, named');
  const badScope = { ...good, limits: [{ ...good.limits[0], scope: 'whatever' }] };
  ok(!QM.validateLimitSet(badScope).ok, 'an unknown scope is refused (the closed set is the contract)');
  const badPct = { ...good, limits: [{ ...good.limits[0], windows: [{ ...good.limits[0].windows[0], usedPct: 140 }] }] };
  ok(!QM.validateLimitSet(badPct).ok, 'usedPct outside 0..100 is refused');
  const badState = { ...good, limits: [{ ...good.limits[0], windows: [{ ...good.limits[0].windows[0], state: 'maybe' }] }] };
  ok(!QM.validateLimitSet(badState).ok, 'an unknown window state is refused');
  const dupKind = { ...good, limits: [{ ...good.limits[0], windows: [good.limits[0].windows[0], good.limits[0].windows[0]] }] };
  ok(!QM.validateLimitSet(dupKind).ok, 'two windows of one kind inside one limit is refused');
  ok(QM.validateLimitSet(QM.makeLimitSet({})).ok, 'an EMPTY set is valid — "this harness has no limits" is a statement');
}

console.log('\n② windowState: an empty window is a sliding reset, not a deadline (B-8b12)');
{
  // the measured shape, at the median offset and at both measured extremes
  for (const off of [8, 40, 489]) {
    const w = QM.makeWindow({ kind: '5h', minutes: 300, usedPct: 0, resetsAt: Math.round(T0 / 1000) + 300 * 60 - off, measuredAt: T0 });
    ok(w.state === 'empty', `usedPct 0 with the reset ${off}s inside a full window ⇒ empty (measured range was 8–489 s)`);
  }
  // the +3 s drift fixture: two reads three seconds apart, both empty, and the
  // reset MOVED — which is the whole reason it may not be a deadline
  const a = QM.makeWindow({ kind: '5h', minutes: 300, usedPct: 0, resetsAt: Math.round(T0 / 1000) + 18000 - 40, measuredAt: T0 });
  const b = QM.makeWindow({ kind: '5h', minutes: 300, usedPct: 0, resetsAt: Math.round((T0 + 3000) / 1000) + 18000 - 40, measuredAt: T0 + 3000 });
  ok(a.state === 'empty' && b.state === 'empty', '+3 s apart, both reads are empty');
  ok(b.resetsAt - a.resetsAt === 3, '…and the "reset time" moved by exactly the 3 s between the reads');
  // the running side of the measured dead band
  for (const off of [1017, 1146, 11611, 35037]) {
    const w = QM.makeWindow({ kind: '7d', minutes: 10080, usedPct: 0, resetsAt: Math.round(T0 / 1000) + 10080 * 60 - off, measuredAt: T0 });
    ok(w.state === 'running', `a reset PINNED ${off}s into the window ⇒ running, even at 0 % used (measured min was 1151 s)`);
  }
  ok(QM.makeWindow({ kind: '7d', usedPct: 42, resetsAt: 1789509325, measuredAt: T0 }).state === 'running', 'anything spent is running');
  ok(QM.makeWindow({ kind: '7d', usedPct: 0, resetsAt: null, measuredAt: T0 }).state === 'unknown', 'no reset stated ⇒ unknown, never "empty" and never a deadline');
  ok(QM.makeWindow({ kind: '7d', usedPct: null, resetsAt: 1789509325, measuredAt: T0 }).state === 'unknown', 'no usage stated ⇒ unknown');
  ok(QM.makeWindow({ kind: 'monthly', minutes: 0, usedPct: 0, resetsAt: 1789509325, measuredAt: T0 }).state === 'unknown', 'no duration to compare against ⇒ unknown, we do not guess');
  ok(QM.EMPTY_WINDOW_JITTER_SEC > 489 && QM.EMPTY_WINDOW_JITTER_SEC < 1017, 'the jitter constant sits inside the measured dead band (489 s empty max … 1017 s running min)');
}

console.log('\n③ limitFor: the ONE accessor, never a collapsed guess');
{
  const set = QM.mergeLimitSets(
    CODEXQ.toLimitSet(CODEX_PLAN, { identity: 'cx', source: 'codex-rate-limits', fetchedAt: T0 }),
    CODEXQ.toLimitSet(sparkAt(T0 + 1000), { identity: 'cx', source: 'codex-rate-limits', fetchedAt: T0 + 1000 }));
  ok(QM.limitFor(set, {}).limitId === 'codex', 'no model named ⇒ the PLAN limit');
  ok(QM.limitFor(set, { model: 'GPT-5.3-Codex-Spark' }).limitId === 'codex_bengalfox', 'the served model names its own limit');
  ok(QM.limitFor(set, { model: 'gpt-5.3-codex' }).limitId === 'codex', 'a model no limit names falls back to the plan limit, never to "some model limit"');
  ok(QM.limitFor(QM.makeLimitSet({}), {}) === null, 'an empty set says NOTHING — null, not a fabricated limit');
  // claude: family matching through the injected vocabulary
  const cl = CLAUDEQ.toLimitSet({ fiveHour: { utilization: 0.5, resetsAt: 1788924600 }, sevenDay: { utilization: 0.78, resetsAt: 1789318800 }, scopedWeekly: [{ name: 'Fable', utilization: 0.89, resetsAt: 1789318800 }], fetchedAt: T0 }, { identity: 'sub-a', source: 'on-demand', nowMs: T0, familyOf: familyOfScopedBucket });
  ok(QM.limitFor(cl, { family: 'fable' }).name === 'Fable', 'a claude scoped weekly is found by FAMILY');
  ok(QM.limitFor(cl, { family: 'opus' }).limitId === 'plan', 'a family with no scoped cap gets the plan limit');
  eq(QM.applicableLimits(cl, { family: 'fable' }).map((l) => l.limitId), ['plan', 'model:fable'], 'both limits constrain a fable spend (a model cap is a COMPONENT of the plan window)');
}

console.log('\n④ mergeLimitSets merges PER limitId — the B-9213 fixture');
{
  // the real arrival order on sess-13: premium, then Spark, then the plan limit
  let set = QM.makeLimitSet({ identity: '__global_codex__' });
  const seq = [
    ['premium', CODEX_PREMIUM, T0],
    ['spark', sparkAt(T0 + 1000), T0 + 1000],
    ['plan', CODEX_PLAN, T0 + 2000],
    ['spark again (3 s later, the reset has slid)', sparkAt(T0 + 4000), T0 + 4000],
  ];
  for (const [, raw, at] of seq) {
    set = QM.mergeLimitSets(set, CODEXQ.toLimitSet(raw, { identity: '__global_codex__', source: 'codex-rate-limits', fetchedAt: at }));
  }
  eq(set.limits.filter((l) => l.scope === 'plan' || l.scope === 'model').map((l) => l.limitId), ['premium', 'codex_bengalfox', 'codex'], 'THREE quota limits survive the sequence, in arrival order');
  ok(set.limits.some((l) => l.limitId === 'credits' && l.scope === 'credits'), '…plus the credits limit every push carries (money, not quota — its own scope)');
  ok(QM.limitFor(set, {}).limitId === 'codex', 'the plan limit is still the plan limit after 2 Spark pushes');
  eq(QM.windowOfKind(QM.limitFor(set, {}), '7d').usedPct, 5, 'the plan limit still reads 5 % — the Spark push was not news about it');
  ok(QM.limitState(set.limits[0]) === 'unknown', '`premium` reports no windows at all (27/27 measured pushes) and is kept as such');
  ok(QM.planLimit(set).limitId === 'codex', 'a window-less plan limit never displaces the one that reports windows');
  // NEGATIVE CONTROL: the old single-object merge
  const collapsed = [CODEX_PREMIUM, sparkAt(T0 + 1000), CODEX_PLAN, sparkAt(T0 + 4000)]
    .map((r) => CODEXQ.normalizeCodexRateLimit(r, T0))
    .filter(Boolean)
    .reduce((acc, s) => ({ ...acc, ...s })); // last-writer-wins, verbatim
  ok(collapsed.limitId === 'codex_bengalfox' && collapsed.sevenDay.usedPercent === 0,
    'NEGATIVE CONTROL: last-writer-wins ends on the Spark limit at 0 % — the plan limit at 5 % is GONE (the incident)');
  // panel view names all three
  const ordered = QM.orderLimits(set, { model: 'GPT-5.3-Codex-Spark' });
  eq(ordered.slice(0, 3).map((l) => QM.limitLabel(l)), ['GPT-5.3-Codex-Spark', 'codex', 'premium'], 'the panel view names all three, served model first');
  ok(ordered.length === set.limits.length, '…and nothing is dropped from the view');
}

console.log('\n⑤ remaining/deadline IGNORE empty windows');
{
  let set = QM.mergeLimitSets(
    CODEXQ.toLimitSet(CODEX_PLAN, { identity: 'cx', source: 'codex-rate-limits', fetchedAt: T0 }),
    CODEXQ.toLimitSet(sparkAt(T0 + 1000), { identity: 'cx', source: 'codex-rate-limits', fetchedAt: T0 + 1000 }));
  const nowSec = Math.round(T0 / 1000);
  const r = QM.remaining(set, { nowSec });
  ok(r.known && r.remaining === 95 && r.by === 'codex', 'remaining = the PLAN limit (95 %), never the empty Spark bucket');
  const d = QM.deadline(set, { nowSec });
  ok(d === 1789509325, 'the deadline is the plan window\'s pinned reset, NOT the Spark bucket\'s sliding one');
  const sparkLimit = set.limits.find((l) => l.limitId === 'codex_bengalfox');
  ok(d !== QM.windowOfKind(sparkLimit, '7d').resetsAt, '…and the Spark bucket\'s "reset" is a different (nearer) number, which is exactly the trap');
  // a Spark 0 % bucket never grants headroom the plan bucket lacks
  let dead = QM.mergeLimitSets(
    CODEXQ.toLimitSet(CODEX_PLAN_FULL, { identity: 'cx', source: 'codex-rate-limits', fetchedAt: T0 }),
    CODEXQ.toLimitSet(sparkAt(T0 + 1000), { identity: 'cx', source: 'codex-rate-limits', fetchedAt: T0 + 1000 }));
  const rd = QM.remaining(dead, { nowSec });
  ok(rd.known && rd.remaining === 0, 'plan limit at 100 % + Spark at 0 % ⇒ 0 % remaining (a Spark bucket never grants headroom the plan lacks)');
  ok(rd.by === 'codex', '…and it names WHICH limit is spent');
  const rep = QM.bucketReport(dead, { nowSec });
  const spark7 = rep.find((x) => x.limitId === 'codex_bengalfox' && x.kind === '7d');
  ok(spark7 && spark7.state === 'empty' && spark7.counts === false && spark7.resetsAt === 0,
    'the report SHOWS the empty bucket (the panel must) but marks it counts:false with no reset to print');
  // the 5h window is a burst rate limiter, never a budget deadline
  const withBurst = QM.mergeLimitSets(set, CLAUDEQ.limitSetFromEvent({ kind: 'fiveHour', utilization: 0.9, resetsAt: nowSec + 600, status: 'allowed' }, { identity: 'cx', nowMs: T0 }));
  ok(QM.deadline(withBurst, { nowSec }) === 1789509325, 'a 5h window never becomes the budget deadline (it refills ~33×/week)');
}

console.log('\n⑥ the claude producers: three shapes, one typed set');
{
  const panel = CLAUDEQ.toLimitSet({
    fiveHour: { utilization: 0.11, resetsAt: 1788924000, status: 'allowed' },
    sevenDay: { utilization: 0.95, resetsAt: 1789142400, status: 'allowed_warning' },
    scopedWeekly: [{ name: 'Fable', utilization: 0.94, resetsAt: 1789142400, severity: 'normal' }],
    spend: { used: 12.5, limit: 100, pct: 12.5, currency: 'USD', resetsAt: 1790000000 },
    fetchedAt: T0, orgUuid: 'REDACTED',
  }, { identity: 'sub-a', source: 'on-demand', nowMs: T0, familyOf: familyOfScopedBucket });
  eq(panel.limits.map((l) => l.limitId), ['plan', 'model:fable', 'overage'], 'the /usage panel becomes plan + one model limit + an overage limit');
  ok(panel.limits[1].family === 'fable', 'the scoped bucket carries its FAMILY (injected vocabulary, never guessed in the pure model)');
  ok(panel.limits[2].scope === 'overage' && panel.limits[2].flags.used === 12.5, 'extra usage is its OWN limit with real dollars on it (design §1.4: zero readers today)');
  ok(panel.extra && panel.extra.orgUuid === 'REDACTED', 'the identity fields ride `extra` and are never lost');
  // ONE rate_limit_event = ONE limit, ONE window
  const ev = CLAUDEQ.limitSetFromEvent({ kind: 'sevenDay', utilization: 0.5, resetsAt: 1789142400, status: 'allowed', overage: { inUse: false } }, { identity: 'sub-a', nowMs: T0 + 1000 });
  eq(ev.limits.map((l) => [l.limitId, l.windows.map((w) => w.kind)]), [['plan', ['7d']], ['overage', []]], 'a rate_limit_event carries exactly one bucket (plus its overage state)');
  const after = QM.mergeLimitSets(panel, ev);
  eq(QM.windowOfKind(QM.limitFor(after, {}), '5h').usedPct, 11, 'merging a 7d-only event does NOT erase the 5h window (the per-bucket apply this replaces had to hand-preserve it)');
  eq(QM.windowOfKind(QM.limitFor(after, {}), '7d').usedPct, 50, '…and the 7d window took the newer reading');
  eq(QM.limitFor(after, { family: 'fable' }).windows[0].usedPct, 94, '…and the Fable cap is untouched (this is the field that has been lost five times)');
  const rej = CLAUDEQ.limitSetFromEvent({ kind: 'sevenDay', status: 'rejected', resetsAt: 1789142400 }, { identity: 'sub-a', nowMs: T0 });
  eq(rej.limits[0].windows[0].usedPct, 100, 'a REJECTION is a reading of 100 %');
  ok(rej.limits[0].windows[0].status === 'limited', '…and states the limited status');
  const scoped = CLAUDEQ.limitSetFromEvent({ kind: 'scoped', scopedName: 'fable', utilization: 0.7, resetsAt: 1789142400 }, { identity: 'sub-a', nowMs: T0, familyOf: familyOfScopedBucket });
  ok(scoped.limits[0].scope === 'model' && scoped.limits[0].family === 'fable', 'a seven_day_<model> event becomes a MODEL limit');
  ok(CLAUDEQ.toLimitSet('not a usage panel', { nowMs: T0 }) === null, 'a payload that is not a claude reading returns null — never a fabricated set');
}

console.log('\n⑦ the null harness answers the same questions');
{
  const set = NULLQ.NULL_QUOTA.toLimitSet({ identity: 'shell-1', source: 'none', fetchedAt: T0 });
  ok(QM.validateLimitSet(set).ok, 'the null harness produces a VALID empty set (not null — every reader asks the same questions)');
  ok(QM.limitFor(set, {}) === null && QM.remaining(set, {}).known === false && QM.deadline(set, {}) === null, 'and every accessor answers "no claim"');
}

console.log('\n⑧ the ONE write path: per-limit merge on disk, derived legacy view');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsq-write-'));
  const key = '__global_codex__';
  const seq = [[CODEX_PREMIUM, T0], [sparkAt(T0 + 1000), T0 + 1000], [CODEX_PLAN, T0 + 2000], [sparkAt(T0 + 4000), T0 + 4000]];
  for (const [raw, at] of seq) {
    const set = CODEXQ.toLimitSet(raw, { identity: key, source: 'codex-rate-limits', fetchedAt: at });
    const r = W.writeReading({ cacheDir: dir, key, set, source: 'codex-rate-limits', backend: 'codex' });
    ok(r.ok, `wrote ${raw.limitId} @${at - T0}ms`);
  }
  const obj = W.readCacheObject(dir, key);
  eq(obj.limits.filter((l) => l.scope !== 'credits').map((l) => l.limitId), ['premium', 'codex_bengalfox', 'codex'], 'the FILE holds all three quota limits');
  eq(obj.sevenDay.usedPercent, 5, 'the DERIVED legacy view shows the PLAN limit — a legacy reader no longer flips to 0 %');
  ok(obj.scopedWeekly && obj.scopedWeekly[0].name === 'GPT-5.3-Codex-Spark' && obj.scopedWeekly[0].state === 'empty',
    'the Spark limit is projected as a model cap AND carries state:"empty" so no reader counts its sliding reset');
  ok(obj.source === 'codex-rate-limits', 'a producer WE SHIP names itself at the write');
  ok(obj.limits.every((l) => l.source === 'codex-rate-limits' && l.fetchedAt), 'provenance is stamped PER LIMIT');
  // a re-read is a stable round trip
  const lifted = W.limitsOfCache(obj);
  eq(lifted.limits.filter((l) => l.scope !== 'credits').map((l) => l.limitId), ['premium', 'codex_bengalfox', 'codex'], 'lifting the file back gives the same three limits');
  ok(QM.limitFor(lifted, {}).limitId === 'codex', '…and the accessor still answers with the plan limit');
  ok(QM.deadline(lifted, { nowSec: Math.round(T0 / 1000) }) === 1789509325, '…and the deadline is still the plan window (empty windows survive the round trip as empty)');

  // a malformed producer set is REFUSED, and the file is untouched
  const before = fs.readFileSync(W.cacheFileFor(dir, key), 'utf8');
  let refused = null;
  const bad = QM.makeLimitSet({ identity: key, fetchedAt: T0, source: 'x', limits: [{ limitId: 'plan', scope: 'nonsense', windows: [] }] });
  const rb = W.writeReading({ cacheDir: dir, key, set: bad, source: 'x', onRefuse: (why) => { refused = why; } });
  ok(!rb.ok && refused, 'a malformed set is REFUSED loudly (our own producer being wrong is a bug we do not persist)');
  ok(fs.readFileSync(W.cacheFileFor(dir, key), 'utf8') === before, '…and the stored file is byte-identical');

  // a CORRUPT file on disk must not block a new reading
  fs.writeFileSync(W.cacheFileFor(dir, 'corrupt'), JSON.stringify({ fetchedAt: T0, limits: [{ limitId: 'p', scope: 'bogus', windows: [] }] }));
  const rc = W.writeReading({ cacheDir: dir, key: 'corrupt', set: CODEXQ.toLimitSet(CODEX_PLAN, { identity: 'corrupt', source: 'codex-rate-limits', fetchedAt: T0 }), source: 'codex-rate-limits', backend: 'codex' });
  ok(rc.ok, 'a corrupt file already on disk does not block a new reading (one bad write must never be permanent)');
  eq(W.readCacheObject(dir, 'corrupt').limits.map((l) => l.limitId), ['codex', 'credits'], '…and the canonical half is rebuilt from the reading');

  // legacy file (no `limits`) merges correctly
  fs.writeFileSync(W.cacheFileFor(dir, 'sub-legacy'), JSON.stringify({
    fiveHour: { utilization: 0.58, resetsAt: 1788924600 },
    sevenDay: { utilization: 0.78, resetsAt: 1789318800, status: 'allowed_warning' },
    scopedWeekly: [{ name: 'Fable', utilization: 0.89, resetsAt: 1789318800 }],
    fetchedAt: T0, source: 'rate-limit-event', orgUuid: 'REDACTED',
  }));
  const evSet = CLAUDEQ.limitSetFromEvent({ kind: 'fiveHour', utilization: 0.6, resetsAt: 1788925000, status: 'allowed' }, { identity: 'sub-legacy', nowMs: T0 + 5000 });
  const rl = W.writeReading({ cacheDir: dir, key: 'sub-legacy', set: evSet, extras: { orgUuid: 'REDACTED' }, source: 'rate-limit-event', backend: 'claude', familyOf: familyOfScopedBucket });
  ok(rl.ok, 'a 5h-only event writes onto a pre-model legacy file');
  const lo = W.readCacheObject(dir, 'sub-legacy');
  eq([lo.fiveHour.utilization, lo.sevenDay.utilization, lo.scopedWeekly[0].name], [0.6, 0.78, 'Fable'],
    'the 5h moved, the 7d and the Fable cap were carried forward — the lift + per-limit merge does what nine hand-written preserve lists were doing');
  ok(lo.orgUuid === 'REDACTED', 'the org identity survives');

  // the sidecar rule
  ok(W.writeSidecar(dir, '.window-sub-legacy', { sevenDay: 1789318800 }), 'a sidecar writes beside the cache');
  let threw = null; try { W.writeSidecar(dir, 'thing.json', {}); } catch (e) { threw = e.message; }
  ok(threw && /\.json/.test(threw), 'a sidecar may never end in .json (every usage-cache scanner would pick it up)');
  ok(!W.isCacheFileName('.window-sub-legacy') && W.isCacheFileName('sub-legacy.json'), 'isCacheFileName tells snapshots from sidecars');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n⑨ backend shape detection is by FIELDS, never by key name');
{
  ok(W.backendOfCacheObject({ limitId: 'codex', fiveHour: { usedPercent: 5, windowMinutes: 300 } }) === 'codex', 'limitId ⇒ codex');
  ok(W.backendOfCacheObject({ fiveHour: { utilization: 0.5 }, scopedWeekly: [] }) === 'claude', 'scopedWeekly ⇒ claude');
  ok(W.backendOfCacheObject({ fiveHour: { utilization: 0.5, resetsAt: 1 } }) === 'claude', 'a bare pair of buckets is the historical claude default');
  ok(W.backendOfCacheObject({ spendControlReached: null, fiveHour: { utilization: 0 } }) === 'codex', 'a codex-only field ⇒ codex, whatever the key is called');
}


// ── ⑩ THE WRITE-PATH CENSUS (P4) ────────────────────────────────────────────
// GREP-DERIVED and deliberately OVER-INCLUSIVE: a false positive only widens
// enforcement, a false negative is the defect itself. The file set comes from
// `git ls-files` (the product installs 64 MB binaries into data/bin — a
// worktree walk is not a source listing), and the walked set is PRINTED.
{
  const { execFileSync } = await import('child_process');
  let tracked = null, skipWhy = null;
  try {
    // TRACKED **plus** untracked-but-not-ignored: the set a commit of this tree
    // would contain. Plain `ls-files` alone makes a brand-new module invisible
    // to its own census (this file was the first one), while `--others` without
    // `--exclude-standard` would drag in the 64 MB rclone the product installs
    // into data/bin — the exact reason this listing is not a worktree walk.
    const ls = (args) => execFileSync('git', ['-C', ROOT, 'ls-files', '-z', ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
      .toString('utf8').split('\0').filter(Boolean);
    tracked = [...new Set([...ls([]), ...ls(['--others', '--exclude-standard'])])];
  } catch (e) { skipWhy = `git -C <root> ls-files: ${String(e.message).slice(0, 120)}`; }
  if (!tracked) {
    console.log('  ⚠ SKIP the write-path census —', skipWhy, '(no source listing; a worktree walk would read runtime products)');
  } else {
    const scope = tracked.filter((f) => (/^src\//.test(f) || /^data\/bin\//.test(f) || f === 'server.js') && !/^scripts\/test-/.test(f));
    ok(scope.includes('src/usage-cache-write.js') && scope.includes('data/bin/vibespace-usage') && scope.includes('src/usage-routes.js') && scope.includes('server.js'),
      `⑩ the census scope is non-vacuous (${scope.length} tracked files: src/ + data/bin/ + server.js)`);
    const WRITE = /writeFileSync|renameSync|writeJsonAtomic|appendFileSync/;
    const CACHEY = /USAGE_CACHE_DIR|USAGE_CACHE_FILE|usage-cache|cacheDir/;
    // FILE-LEVEL, not line-level. A proximity window (`a write within N lines
    // of a cache token`) misses the two files that matter most: the write path
    // itself, whose one `atomicWrite` helper sits far from the word "cache",
    // and the shipped statusline, whose writes name a local `f`. A file that
    // both knows about this store AND holds a raw write primitive is a
    // candidate — over-inclusive on purpose, because a false positive costs one
    // allowlist row with a reason while a false negative is the defect.
    const hits = new Map();
    for (const f of scope) {
      let txt; try { txt = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
      if (!CACHEY.test(txt)) continue;
      const lines = txt.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!WRITE.test(lines[i])) continue;
        if (!hits.has(f)) hits.set(f, []);
        hits.get(f).push(i + 1);
      }
    }
    // EVERY entry states WHY it may write there. A dead entry fails too — an
    // allowlist nobody prunes is how a retired exception becomes a licence.
    const ALLOW = new Map([
      ['src/usage-cache-write.js', 'THE write path itself'],
      ['src/reading-repair.js', 'its generic _writeAtomic serves the ANCHOR and ATTRIBUTION stores; its three usage-cache writes go through _writeCacheAtomic → writeCacheObject({replace:true})'],
      ['src/quota-model-migrate.js', 'the backfill migration: its usage-cache writes go through writeCacheObject({replace:true}); its own appendFileSync is the archive-never-destroy ndjson'],
      ['src/weekly-lanes-unfold.js', 'the weekly-lanes repair (inc-mubu23bd-5vxi): its usage-cache writes go through captureRateLimitEvent → the write path (the plan week, the model cap and the fold rule all apply); its own writeFileSync calls are the archive-never-destroy copy under data/archive/'],
      ['src/server/cli-env.js', 'writes __models__.json — the served-model list, not a reading; every cache scanner excludes it by name (isCacheFileName)'],
      ['src/usage-routes.js', "writeUsageCache() writes data/usage-cache.json — the machine login's SECOND snapshot and the boot seed of _rateLimitCache, a different file outside the directory (the r6 repair essay names it)"],
      ['src/server/usage-pool-engine.js', "writes data/archive/readings-window-mismatch.ndjson — the window guard's ARCHIVE of readings it refused, a different store; its own cache writes go through the write path"],
      // The rest are candidates because the rule is FILE-LEVEL: they mention this
      // store (a constant, a comment, an env name) and hold a write primitive
      // for a DIFFERENT one. Each says which.
      ["server.js", "declares USAGE_CACHE_DIR/USAGE_CACHE_FILE and hands them to the engine + usage routes; its own writes are layouts/session-meta/etc."],
      ["src/agentd/agentd.js", "the DEVICE's own ~/.vibespace/usage-cache, read for the usage-scan op — a machine's own store, and it reaches us only as usage-cache/host-*.json"],
      ["src/mounts.js", "matched on the identifier cacheDir — the rclone download cache under ~/.cache/vibespace, nothing to do with quota"],
      ["src/server/browser-cloak-install.js", "matched on the identifier cacheDir — CloakBrowser's CLOAKBROWSER_CACHE_DIR (data/browser-tools/cloak-cache, the downloaded browser, lane-cloak), nothing to do with quota; its writes are data/browser-profiles.json, the browser configs and the install stamp"],
      ["src/server/agent-tool-generators.js", "ensureDir(USAGE_CACHE_DIR) at boot + it GENERATES data/bin/vibespace-status; the statusline tool it ships is the tracked file above"],
      ["src/server/migrations.js", "names this store in the two repair migrations' notes; the writing is reading-repair's"],
      ["src/server/otel-ingest.js", "names it in one warning string (\"no usage-cache orgUuid match\"); it writes the OTel stash"],
      ["src/server/spend-guard.js", "the P4 spend ceiling (2.369.81): it READS a usage-cache object through an injected dep (deps.readCacheFor, for the overage verdict) and its own writeJsonAtomic writes data/spend-budget.json — the persisted per-identity budget, a different store"],
      ["src/usage-anchors.js", "writes the ANCHOR streams (data/usage-anchors/*.ndjson) — a different store, fed BY cache writes"],
      ["src/server/auto-cli-loop.js", "READS usage-cache/<id>.json to pace the auto-cli rung; its own write is data/auto-cli-state.json — the loop's persisted pacing state (quota r2), a different store"],
      ['data/bin/vibespace-usage', 'the SHIPPED statusline tool: a single file on hosts with no checkout, so it cannot require src/ — the same documented exception as vibespace-usage-scan. WHAT IT MIRRORS IS THE READING-LAG RULE, byte-for-byte between sentinels and pinned by test-readings-attribution §13 (r2: round 1 said "the RULES it needs", which was true of `windowOf` and false of the MERGE — and the merge is where it deleted `limits`). It does NOT mirror the write path: it spreads the stored object, states only the buckets it measured, and DROPS the one limit it can measure so the lift reconstructs it. §⑮ drives the real file.'],
    ]);
    console.log('  … writers found:', [...hits.keys()].map((f) => `${f}(${hits.get(f).length})`).join(' ') || '(none)');
    const stray = [...hits.keys()].filter((f) => !ALLOW.has(f));
    ok(!stray.length, `⑩ no module outside the write path writes a usage-cache file (stray: ${JSON.stringify(stray)})`);
    const dead = [...ALLOW.keys()].filter((f) => !hits.has(f));
    ok(!dead.length, `⑩ no DEAD allowlist entry (an exception nobody prunes becomes a licence; dead: ${JSON.stringify(dead)})`);
    // the repair's named exception is structural, not a promise
    const rr = fs.readFileSync(path.join(ROOT, 'src/reading-repair.js'), 'utf8');
    ok(/function _writeCacheAtomic\([\s\S]{0,400}writeCacheObject\(\{ cacheDir, key, obj, replace: true/.test(rr),
      "⑩ …and the repair's exception is REPLACE mode through the write path, not a second writer");
    ok((rr.match(/_writeCacheAtomic\(/g) || []).length >= 4, '⑩ …used at every one of its cache write sites (definition + 3 calls)');
    // NEGATIVE CONTROL: a synthetic offender is caught by this exact rule
    const offender = "const f = require('path').join(USAGE_CACHE_DIR, 'x.json');\nrequire('fs').writeFileSync(f, '{}');\n";
    const innocent = "// nothing to do with quota\nrequire('fs').writeFileSync(outPath, '{}');\n";
    const detects = (txt) => CACHEY.test(txt) && txt.split('\n').some((L) => WRITE.test(L));
    ok(detects(offender), '⑩ NEGATIVE CONTROL: a module writing USAGE_CACHE_DIR directly IS detected by this rule');
    ok(!detects(innocent), '⑩ …and a module that writes somewhere else entirely is not (the rule is over-inclusive, not vacuous)');
  }
}

// ── ⑪ THE READER CENSUS ─────────────────────────────────────────────────────
// Who still touches the RAW legacy buckets? Same shape as ⑩: derived, printed,
// every entry stating what it is. The point is that "readers migrated" is a
// METRIC to re-measure (the standing-sweep rule), not a state somebody once
// asserted in a comment.
{
  const { execFileSync } = await import('child_process');
  let tracked = null;
  try {
    const ls = (args) => execFileSync('git', ['-C', ROOT, 'ls-files', '-z', ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
      .toString('utf8').split('\0').filter(Boolean);
    tracked = [...new Set([...ls([]), ...ls(['--others', '--exclude-standard'])])];
  } catch { }
  if (!tracked) {
    console.log('  ⚠ SKIP the reader census — no readable git index');
  } else {
    const scope = tracked.filter((f) => (/^src\//.test(f) || /^data\/bin\//.test(f) || f === 'server.js') && !/^scripts\/test-/.test(f));
    const RAW = /\bsevenDay\b|\bfiveHour\b|\bscopedWeekly\b/;
    const found = scope.filter((f) => { try { return RAW.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return false; } });
    const CLASSES = {
      model: 'the model itself, or the ONE write path: this IS where the shape is defined',
      parser: 'a PARSER/PRODUCER: it turns a vendor payload into the legacy shape by definition',
      migrated: 'MIGRATED: asks quota-model whether a bucket counts before acting on it',
      // A class earned by MEASUREMENT, not by courtesy: the module reads the raw
      // shape but the only question it asks of a bucket is "is it SPENT", and an
      // empty window answers `usedPct 0` — so the B-8b12 harm (a sliding reset
      // becoming a deadline) is unreachable from here. §⑬ DRIVES that property
      // rather than asserting it in prose, because a claim in a comment can
      // never go red.
      'spent-only': 'reads the raw shape, but only ever asks "is this bucket spent" — an empty window can never answer yes',
      // A class earned by MEASUREMENT too (⑯c): the module asks quota-model's
      // predicate but reads the PROJECTED view, so its answer is exactly as
      // good as `toLegacyView`. That is a real dependency and it is named, not
      // filed under 'migrated' — a projection that loses a window makes this
      // module wrong while every predicate it calls stays right.
      'view-only': 'reads the DERIVED view (with quota-model`s predicate), never the accessor — so the projection`s own invariant is what protects it, and ⑯c drives it',
      mention: 'names a bucket field in prose only; it holds no bucket read',
      pending: 'NOT MIGRATED YET — named, with what it still does raw',
    };
    const TABLE = new Map([
      ['src/quota-model.js', ['model', '']],
      ['src/usage-cache-write.js', ['model', '']],
      ['src/harnesses/claude-quota.js', ['parser', 'the three claude reading shapes']],
      ['src/harnesses/codex-quota.js', ['parser', 'the codex rate_limits shapes']],
      ['src/adapters/claude-code.js', ['parser', 'parseGetUsageResponse — the get_usage control payload']],
      ['src/model-family.js', ['parser', 'the family projection over scopedWeekly names']],
      // NOT 'migrated' (r3): it calls `bucketCounts`, which is why the
      // empty-window harm cannot reach it — but it reads the DERIVED VIEW and
      // never the accessor, so it can only ever be as right as the projection
      // is. That gap is what hid a model limit's 5-hour window from the pool
      // (⑯c). The honest class is 'view-only', and the invariant that keeps it
      // safe is DRIVEN in ⑯c ("the view is never more optimistic than the
      // accessor") rather than assumed here.
      ['src/account-pool-auto.js', ['view-only', 'bucketRemaining/weeklyDeadline call bucketCounts, so no empty window can become a constraint or a deadline — but they read the projected view, so ⑯c drives the projection`s own invariant']],
      ['src/usage-anchors.js', ['migrated', 'an empty bucket anchors as no-bucket, like the fabricated status:unknown one']],
      ['src/usage-estimator.js', ['migrated', 'overlayCache never replaces a bucket the raw reading marks empty']],
      ['src/reading-lag.js', ['migrated', 'windowOf skips empty windows — a sliding reset is not identity evidence']],
      ['src/oat-identity-model.js', ['migrated', 'the long-lived token\'s identity post-check (lane oat-identity-postcheck) compares windows only through reading-lag windowOf / compareWindows, which skip empty windows; it reads no usage bucket']],
      ['src/accounts.js', ['migrated', 'stores the long-lived token\'s identity anchor (lane oat-identity-postcheck): a weekly reset instant oat-identity-model anchorFromProbe took through reading-lag windowOf (empty windows skipped) — it reads no usage bucket']],
      ['src/server/oat-identity.js', ['migrated', 'the identity post-check\'s orchestrator (lane oat-identity-fix) carries WEEKLY windows the PURE oat-identity-model took through reading-lag windowOf (empty windows skipped) into the check record / the anchor — it reads no usage bucket']],
      ['src/server/oat-mint.js', ['migrated', 'the token mint\'s second look (oat-verify F1) reads the /usage panel only through reading-lag windowOf / compareWindows, which skip empty windows']],
      ['src/lib/usage-meter.js', ['migrated', 'renders every limit, and an empty window says "starts on first use" instead of a reset']],
      ['src/rate-limit-capture.js', ['migrated', 'produces the bucket, writes through the one path']],
      ['src/usage-routes.js', ['migrated', 'every writer goes through the write path; the codex summariser accumulates PER limitId']],
      ['src/server/usage-pool-engine.js', ['migrated', 'its verdicts read bucketRems → bucketRemaining, so an empty window cannot set blockedUntil or an auto-resume arm time']],
      ['src/reading-repair.js', ['migrated', 'writes through the path in replace mode; its window judgements use windowOf, which now skips empty windows']],
      ['src/weekly-lanes-unfold.js', ['migrated', 'the weekly-lanes repair reads the plan week through limitsOfCache → planLimit → windowOfKind and writes through captureRateLimitEvent; its raw spellings are a parsed event\'s `windows.sevenDay` (a producer field, not a cache bucket) and the report\'s scopedWeekly summary']],
      ['data/bin/vibespace-usage', ['migrated', 'the shipped statusline: carries the byte-identical reading-lag mirror, which skips empty windows']],
      ['src/auto-resume-signal.js', ['spent-only', 'statedBuckets/bucketSpent/windowOpened decide only whether a window is SPENT (utilization >= 1 or status limited); an empty window is 0 % used, so it is never spent and its sliding reset can never become an arm time — driven in §⑬']],
      // lane reset-path R4: the usage menu's codex ⟳ answer — the engine builds its two windows through
      // quotaModel.bucketCounts (a window that has not started names no reset); the toast only words that answer
      ['src/lib/usage-source.js', ['view-only', 'codexRefreshToast reads the ⟳ answer\'s two windows, which the engine built through quotaModel.bucketCounts — an empty window carries no reset and is said "starts on first use"']],
      ['src/routes/reset-credit.js', ['mention', 'the codex-refresh route\'s doc comment names the answer\'s fields; the route reads no bucket']],
      ['src/server/auto-resume.js', ['mention', 'one comment cites a sevenDay reset while explaining why the loop breaker keys on the WALL and not on a reset instant; it reads no bucket']],
      ['src/lib/manage-agents.js', ['pending', 'the Agents roster donuts read u.fiveHour/u.sevenDay/u.scopedWeekly directly — they show the DERIVED view (now the plan limit, deterministically) but do not yet render the other limits or the not-started note']],
      ['src/lib/session-lifecycle.js', ['pending', "the billing switcher's per-account chips read the legacy pair for a one-line summary"]],
      ['src/lib/usage-pace.js', ['pending', "the pace/burn helper is a parity port of claude-swap's pace.py and reads the legacy pair verbatim"]],
      // server.js left the table in batch 8 (B-a5c0): its only bucket reads — the
      // calibration compare — moved into usage-estimator.js (sweepAnchorGroup); the
      // auto-cli loop (src/server/auto-cli-loop.js since quota r2) reads its drift
      // through usage-estimator.js's cliRefreshDrift, so it touches no raw bucket either.
    ]);
    console.log('  … readers found:', found.length);
    const unlisted = found.filter((f) => !TABLE.has(f));
    ok(!unlisted.length, `⑪ every module touching the raw buckets is CLASSIFIED (unlisted: ${JSON.stringify(unlisted)})`);
    const deadRows = [...TABLE.keys()].filter((f) => !found.includes(f));
    ok(!deadRows.length, `⑪ no dead row (a class that no longer describes anything: ${JSON.stringify(deadRows)})`);
    ok([...TABLE.values()].every(([c]) => CLASSES[c]), `⑪ every row names one of the ${Object.keys(CLASSES).length} classes`);
    const pending = [...TABLE.entries()].filter(([, [c]]) => c === 'pending').map(([f]) => f);
    // A METRIC, not a state: printed every run so the next change can see
    // whether it moved (the standing-sweep rule).
    console.log(`  … readers NOT migrated: ${pending.length}/${found.length} — ${pending.join(', ')}`);
    ok(pending.length <= 4, `⑪ the not-migrated set is bounded and named (${pending.length})`);

    // ── ⑬ 'spent-only' IS A PROPERTY, SO IT IS DRIVEN ────────────────────────
    // The classification above says an empty window can never reach the arm
    // path. That is a claim about the REAL module, so the real module answers
    // it — with the empty shape B-8b12 measured (usedPct 0 and a reset a full
    // window out, sliding a few seconds on every read).
    const AR = require(path.join(ROOT, 'src/auto-resume-signal.js'));
    const nowSec = Math.round(T0 / 1000);
    const emptySnap = { limitId: 'codex', fiveHour: { utilization: 0, resetsAt: nowSec + 300 * 60 - 40 } };
    const spentSnap = { limitId: 'codex', fiveHour: { utilization: 1, resetsAt: nowSec + 1200 } };
    ok(!AR.spentBuckets(emptySnap, nowSec).length,
      '⑬ an EMPTY window is never a spent bucket — its sliding reset can never become an arm time',
      JSON.stringify(AR.spentBuckets(emptySnap, nowSec)));
    ok(AR.spentBuckets(spentSnap, nowSec).length === 1,
      '⑬ POSITIVE CONTROL: a genuinely spent window still is one (the rule is not vacuous)');
    ok(AR.statedBuckets(emptySnap).length === 1,
      '⑬ …and the panel-facing reader still SEES that window (this is a ranking rule, never a hiding rule)');
  }
}


// ── ⑫ THE POOL, DRIVEN THROUGH ITS REAL DECISION FUNCTIONS ──────────────────
// ⑤ proved the model's answer; this proves the PRODUCT's, on caches the one
// write path actually produced.
{
  const POOL = require(path.join(ROOT, 'src/account-pool-auto.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsq-pool-'));
  const nowSec = Math.round(T0 / 1000);
  // A: the plan limit is SPENT, and a Spark model cap sits at 0 % beside it.
  for (const [raw, at] of [[CODEX_PLAN_FULL, T0], [sparkAt(T0 + 1000), T0 + 1000]]) {
    W.writeReading({ cacheDir: dir, key: 'cxs-A', set: CODEXQ.toLimitSet(raw, { identity: 'cxs-A', source: 'codex-rate-limits', fetchedAt: at }), source: 'codex-rate-limits', backend: 'codex' });
  }
  // B: a healthy plan limit, same shape.
  W.writeReading({ cacheDir: dir, key: 'cxs-B', set: CODEXQ.toLimitSet(CODEX_PLAN, { identity: 'cxs-B', source: 'codex-rate-limits', fetchedAt: T0 }), source: 'codex-rate-limits', backend: 'codex' });
  W.writeReading({ cacheDir: dir, key: 'cxs-B', set: CODEXQ.toLimitSet(sparkAt(T0 + 1000), { identity: 'cxs-B', source: 'codex-rate-limits', fetchedAt: T0 + 1000 }), source: 'codex-rate-limits', backend: 'codex' });
  const A = W.readCacheObject(dir, 'cxs-A'), B = W.readCacheObject(dir, 'cxs-B');

  const remA = POOL.accountRemaining(A, nowSec);
  ok(remA.known && remA.remaining === 0, `⑫ the SPENT account reads 0 % remaining — a Spark bucket at 0 % never grants headroom the plan bucket lacks (${JSON.stringify(remA)})`);
  const remB = POOL.accountRemaining(B, nowSec);
  ok(remB.known && remB.remaining === 95, `⑫ the healthy account reads its PLAN limit, not whichever limit pushed last (${JSON.stringify(remB)})`);

  // the empty bucket is never the earliest deadline
  const dlA = POOL.weeklyDeadline(A, nowSec);
  ok(dlA === 1789356983, `⑫ the deadline is the plan window's PINNED reset (${dlA}), not the Spark bucket's sliding one`);
  ok(A.scopedWeekly.every((s) => s.state === 'empty'), '⑫ …the panel still SEES that bucket (it is rendered, marked not-started) — this is a ranking rule, not a hiding rule');
  // THE TRAP, on the account whose plan window is HEALTHY — which is where EDF
  // actually rank members. Both windows are ~7 days out, so the sliding one
  // wins the min() by the 40 seconds it slid: 1789504761 vs 1789509325. That
  // is the whole defect in two numbers, and it re-decides on every read.
  const dlB = POOL.weeklyDeadline(B, nowSec);
  const sparkResetB = B.scopedWeekly.find((s) => /Spark/i.test(s.name)).resetsAt;
  ok(dlB === 1789509325, `⑫ the healthy member's deadline is its PLAN window (${dlB})`);
  ok(sparkResetB && sparkResetB < dlB, `⑫ …while the Spark bucket's sliding "reset" (${sparkResetB}) is NEARER, so EDF would have picked it every single evaluation`);

  // bucketRems: every bucket that states a spend is REPORTED with what it has
  // left — including the untouched one, which is 100 % free (r4) — but only a
  // bucket that may name a DEADLINE publishes its reset. That split is the
  // whole r4 fix on one row.
  const rems = POOL.bucketRems(A, nowSec);
  const spentRow = rems.find((r) => r.label === '7d');
  const emptyRow = rems.find((r) => /Spark/i.test(r.label));
  ok(rems.length === 2 && spentRow && spentRow.remaining === 0 && spentRow.resetsAt === 1789356983,
    `⑫ bucketRems reports the SPENT weekly bucket at 0 % with its pinned reset (${JSON.stringify(rems)})`);
  ok(emptyRow && emptyRow.remaining === 100 && emptyRow.resetsAt === 0,
    `⑫ …and the untouched one at 100 % free with NO reset — it is headroom, never a deadline (${JSON.stringify(emptyRow)})`);

  // the VERDICT the wall machine arms auto-resume from
  const vA = POOL.quotaVerdict(A, nowSec);
  ok(vA.usable === false && vA.blockedUntil === (1789356983 + 60) * 1000 && vA.until && vA.until.resetsAt === 1789356983,
    `⑫ the verdict blocks until the PLAN window resets (+ the one-minute landing grace, 2.369.117; \`until\` names the stated instant) — auto-resume can never arm on a sliding reset (${JSON.stringify({ u: vA.usable, b: vA.blockedUntil, until: vA.until })})`);

  // NEGATIVE CONTROL: strip the state stamps (the pre-fix world) and the same
  // caches hand the pool a nearer, fabricated deadline.
  const strip = (c) => JSON.parse(JSON.stringify(c, (k, v) => (k === 'state' ? undefined : v)));
  const dlPre = POOL.weeklyDeadline(strip(B), nowSec);
  ok(dlPre === sparkResetB, `⑫ NEGATIVE CONTROL: without the empty-window stamp the SAME cache ranks the Spark bucket's sliding reset as the deadline (${dlPre} vs ${dlB})`);
  const remPre = POOL.accountRemaining(strip(A), nowSec);
  ok(remPre.remaining === 0, '⑫ NEGATIVE CONTROL: …the remaining is unchanged (an empty bucket is 100 % free, so it never HID an exhaustion) — the harm was always the deadline');
  const bucketsPre = POOL.bucketRems(strip(B), nowSec);
  ok(bucketsPre.some((b) => b.resetsAt === sparkResetB), '⑫ NEGATIVE CONTROL: …and the honest "which bucket is spent" report counted it as a real bucket');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── ⑭ AN ACCOUNT WITH NO PLAN LIMIT KEEPS ITS NUMBERS ───────────────────────
// Found by RUNNING the migration on a copy of this instance, not by reading the
// code: `usage-cache/__global_codex__.json` holds the GPT-5.3-Codex-Spark model
// limit and a `credits` limit and NO plan limit — B-9213 had already overwritten
// it away before the typed model existed. Projecting "the plan limit" onto that
// file yields nothing, and a view that yields nothing DELETES the buckets (the
// write path clears a legacy bucket the view does not carry, so a stale bucket
// can never outlive the model). Measured before the fix: two real buckets went
// to `undefined`, which every unmigrated reader — the pool, the panels,
// auto-resume — reads as "no reading at all".
{
  const at = T0;
  const noPlan = QM.makeLimitSet({
    identity: '__global_codex__', fetchedAt: at, source: 'codex-rate-limits',
    limits: [
      QM.makeLimit({
        limitId: 'codex_bengalfox', name: 'GPT-5.3-Codex-Spark', scope: 'model', fetchedAt: at,
        windows: [
          QM.makeWindow({ kind: '5h', minutes: 300, usedPct: 7, resetsAt: Math.round(at / 1000) + 1200, measuredAt: at }),
          QM.makeWindow({ kind: '7d', minutes: 10080, usedPct: 3, resetsAt: Math.round(at / 1000) + 300000, measuredAt: at }),
        ],
      }),
      QM.makeLimit({ limitId: 'credits', scope: 'credits', fetchedAt: at, windows: [], flags: { hasCredits: false } }),
    ],
  });
  const view = QM.toLegacyView(noPlan);
  ok(!!view.fiveHour && !!view.sevenDay && view.fiveHour.resetsAt === Math.round(at / 1000) + 1200,
    '⑭ a set with NO plan limit still projects the legacy pair — from its only window-bearing limit: ' + JSON.stringify({ fiveHour: view.fiveHour, sevenDay: view.sevenDay }));
  ok(QM.legacyWindowLimit(noPlan).limitId === 'codex_bengalfox',
    '⑭ …and `legacyWindowLimit` NAMES which limit that was (a fallback that cannot be inspected is a guess)');

  // NEGATIVE CONTROL: the plan limit still WINS whenever there is one — the
  // fallback must not become a second way to pick the displayed bucket, which
  // is the last-writer-wins behaviour this whole file exists to end.
  const withPlan = QM.mergeLimitSets(noPlan, QM.makeLimitSet({
    identity: '__global_codex__', fetchedAt: at + 1000, source: 'codex-rate-limits',
    limits: [QM.makeLimit({
      limitId: 'codex', scope: 'plan', fetchedAt: at + 1000,
      windows: [QM.makeWindow({ kind: '5h', minutes: 300, usedPct: 55, resetsAt: Math.round(at / 1000) + 9999, measuredAt: at + 1000 })],
    })],
  }));
  ok(QM.legacyWindowLimit(withPlan).limitId === 'codex' && QM.toLegacyView(withPlan).fiveHour.utilization === 0.55,
    '⑭ NEGATIVE CONTROL: once a plan limit exists it wins — the Spark bucket never displaces it again: ' + JSON.stringify(QM.toLegacyView(withPlan).fiveHour));
  ok(QM.limitsOf(withPlan).length === 3 && QM.limitsOf(withPlan).some((l) => l.limitId === 'codex_bengalfox'),
    '⑭ …and the Spark limit is still THERE, as its own limit (nothing was collapsed to make room): ' + QM.limitsOf(withPlan).map((l) => l.limitId).join(','));

  // NEVER INVENT: a set whose limits carry no plan-shaped window at all must
  // project an EMPTY view, not a fabricated bucket.
  const noWindows = QM.makeLimitSet({
    identity: 'x', fetchedAt: at,
    limits: [QM.makeLimit({ limitId: 'credits', scope: 'credits', fetchedAt: at, windows: [], flags: { hasCredits: false } })],
  });
  ok(!QM.toLegacyView(noWindows).fiveHour && !QM.toLegacyView(noWindows).sevenDay,
    '⑭ a set with no window-bearing limit projects NO bucket (never invent one)');
}


// ── ⑮ THE SHIPPED STATUSLINE MAY NOT DELETE THE CANONICAL HALF ──────────────
// (r2, the round-1 verifier's third finding, reproduced against the REAL tool.)
//
// `data/bin/vibespace-usage` is the highest-frequency writer on the instance —
// up to once per 8 s per account — and an ALLOWLISTED exception to the one
// write path, because it ships as a single file to hosts with no checkout. It
// rebuilt the cache object from a hand-written list of fields to PRESERVE, and
// that list did not name `limits`. Measured, over a migrated copy of a real
// cache file: three limits in, ZERO out, the `overage` object gone with them,
// and the next reader re-deriving the limits under THIS producer's name and
// clock — so the model claimed a model-scoped Fable cap had been measured by
// the statusline at a time the very same file's `scopedFetchedAt` contradicts.
//
// A list of what to KEEP is a promise every future edit has to remember, and it
// has now been forgotten six times on this one file (`scopedWeekly`, the org
// identity, `spend`, `corroborated`, the established window — which is why THAT
// moved to a sidecar — and `limits`). So the tool no longer enumerates: it
// spreads what was there, states only what it measured, and DROPS the single
// limit it is able to measure (the plan one), whose reading it has just written
// into the legacy buckets where `liftCacheObject` reconstructs it with this
// object's own provenance. A producer that cannot express a window state or
// another limit's age can never forge one.
//
// This leg drives the REAL FILE. Its negative control is a patched copy with
// the spread reverted to round 1's enumerated literal.
{
  const { execFileSync } = await import('child_process');
  const TOOL = path.join(ROOT, 'data/bin/vibespace-usage');
  const nowSec = Math.floor(Date.now() / 1000);
  const KEY = 'sub-quotamodel15';

  // A migrated snapshot in the shape the write path produces: three limits,
  // each with its OWN source and its OWN age, and only one of them (the plan)
  // is something the statusline can measure.
  const mkDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-qm15-'));
    tmpDirs.push(dir);
    const legacy = {
      fiveHour: { utilization: 0.71, resetsAt: nowSec + 2 * 3600 },
      sevenDay: { utilization: 0.44, resetsAt: nowSec + 3 * 86400 },
      scopedWeekly: [{ name: 'Fable', utilization: 0.93, resetsAt: nowSec + 3 * 86400 }],
      scopedFetchedAt: Date.now() - 3600e3,
      overage: { status: 'allowed', inUse: false },
      orgUuid: 'org-anon', orgName: 'Anon', overallStatus: 'allowed',
      fetchedAt: Date.now() - 3600e3, source: 'on-demand',
    };
    W.writeCacheObject({ cacheDir: dir, key: KEY, obj: legacy, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude' });
    // …and give the model cap a DIFFERENT, older provenance than the plan one,
    // the way three real readings on one account differ.
    const f = W.cacheFileFor(dir, KEY);
    const o = JSON.parse(fs.readFileSync(f, 'utf8'));
    o.limits = o.limits.map((l) => (l.limitId === 'plan' ? l : { ...l, source: 'on-demand', fetchedAt: Date.now() - 7200e3 }));
    fs.writeFileSync(f, JSON.stringify(o));
    const old = Date.now() - 60000;                       // past the tool's own 8 s throttle
    fs.utimesSync(f, old / 1000, old / 1000);
    return { dir, f };
  };
  const render = (tool, dir) => {
    const payload = JSON.stringify({
      session_id: 'sess-qm15', model: { id: 'claude-fable-5', display_name: 'Fable 5' },
      rate_limits: {
        five_hour: { used_percentage: 12, resets_at: nowSec + 3600, status: 'allowed' },
        seven_day: { used_percentage: 46, resets_at: nowSec + 200000, status: 'allowed' },
      },
    });
    execFileSync(tool, [], { input: payload, encoding: 'utf8', env: { ...process.env, VIBESPACE_USAGE_CACHE: dir, VIBESPACE_ACCOUNT_KEY: KEY, HOME: dir } });
  };
  const limitsOf = (o) => W.limitsOfCache(o, { identity: KEY, backend: 'claude', familyOf: familyOfScopedBucket }).limits;
  const byId = (ls, id) => ls.find((l) => l.limitId === id) || null;

  const A = mkDir();
  const before = JSON.parse(fs.readFileSync(A.f, 'utf8'));
  const beforeModel = byId(before.limits, 'model:fable');
  render(TOOL, A.dir);
  const after = JSON.parse(fs.readFileSync(A.f, 'utf8'));

  ok(Array.isArray(after.limits), '⑮ one render of the SHIPPED tool leaves the canonical half in place');
  const afterLimits = limitsOf(after);
  ok(afterLimits.length === before.limits.length && ['plan', 'model:fable', 'overage'].every((id) => byId(afterLimits, id)),
    `⑮ …with every limit the account holds (${afterLimits.map((l) => l.limitId).join(',')})`);
  const am = byId(after.limits, 'model:fable');
  ok(am && beforeModel && am.source === beforeModel.source && am.fetchedAt === beforeModel.fetchedAt,
    '⑮ …and a limit this producer cannot measure keeps ITS OWN source and ITS OWN age (never re-stamped)');
  ok(byId(after.limits, 'overage'), '⑮ …including the overage limit, which the pre-fix literal dropped entirely');
  const ap = byId(afterLimits, 'plan');
  ok(ap && ap.source === 'passive' && ap.fetchedAt >= before.fetchedAt,
    `⑮ …while the PLAN limit — the one it did measure — carries this producer's own name and clock (${ap && ap.source})`);
  ok(ap && QM.windowOfKind(ap, '5h')?.usedPct === 12 && QM.windowOfKind(ap, '7d')?.usedPct === 46,
    '⑮ …and its numbers are the ones this render actually read');
  ok(after.scopedFetchedAt === before.scopedFetchedAt && !!after.overage && after.orgUuid === 'org-anon',
    '⑮ …every other field survives by construction, not by being remembered (spread, not a preserve list)');

  ok(!('corroborated' in after),
    '⑮ …and the ONE field it refuses to inherit is `corroborated` — a verdict about a different reading, which this producer has no observation to re-earn');

  // THE RECONSTRUCTION RUNG IS CLAUDE-ONLY. codex names its own limits
  // ('codex', 'codex_bengalfox', 'premium'…) and none of them is called
  // 'plan', so a backend-blind rung would invent a plan limit on every codex
  // file out of buckets that already belong to a named limit.
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-qm15c-')); tmpDirs.push(dir);
    const cxKey = '__global_codex__';
    const set = CODEXQ.toLimitSet(sparkAt(T0), { identity: cxKey, source: 'codex-rate-limits', fetchedAt: T0 });
    W.writeReading({ cacheDir: dir, key: cxKey, set, source: 'codex-rate-limits', backend: 'codex' });
    const o = JSON.parse(fs.readFileSync(W.cacheFileFor(dir, cxKey), 'utf8'));
    const ids = (hint) => W.limitsOfCache(o, { identity: cxKey, backend: hint, familyOf: familyOfScopedBucket }).limits.map((l) => l.limitId);
    ok(!ids('codex').includes('plan') && !ids(null).includes('plan'),
      `⑮ a CODEX snapshot never gains an invented plan limit, told or inferred (${ids(null).join(',')})`);
  }

  // THE TOOL NEVER AUTHORS THE CANONICAL HALF. A file that has not been
  // migrated has no `limits`, and a one-element array claiming to be all of
  // them would DELETE that file's scoped cap and its overage the moment
  // anything lifted it (liftCacheObject prefers `limits` over the legacy view).
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-qm15b-')); tmpDirs.push(dir);
    const f = W.cacheFileFor(dir, KEY);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(f, JSON.stringify({
      fiveHour: { utilization: 0.5, resetsAt: nowSec + 3600 }, sevenDay: { utilization: 0.2, resetsAt: nowSec + 86400 },
      scopedWeekly: [{ name: 'Fable', utilization: 0.9, resetsAt: nowSec + 86400 }], fetchedAt: Date.now() - 3600e3, source: 'cli-usage',
    }));
    const old = Date.now() - 60000; fs.utimesSync(f, old / 1000, old / 1000);
    render(TOOL, dir);
    const o = JSON.parse(fs.readFileSync(f, 'utf8'));
    ok(!('limits' in o), '⑮ on a NOT-YET-MIGRATED file the tool writes no `limits` at all (a producer that knows one limit may not author the list of all of them)');
    ok(limitsOf(o).some((l) => l.limitId === 'model:fable'), '⑮ …so the scoped cap on that file is still reachable');
  }

  // ── NEGATIVE CONTROL: round 1's enumerated literal, in a patched copy of the
  // real tool. The patch is asserted to hit, so this can never silently become
  // a second green arm.
  {
    const shipped = fs.readFileSync(TOOL, 'utf8');
    const SPREAD = "    ...(prev && typeof prev === 'object' ? prev : {}),\n";
    ok(shipped.split(SPREAD).length === 2, '⑮ NEGATIVE CONTROL setup: the rewrite decision is a single line in the shipped tool');
    const B = mkDir();
    const preFix = path.join(B.dir, 'vibespace-usage.prefix');
    fs.writeFileSync(preFix, shipped.replace(SPREAD, ''), { mode: 0o755 });
    render(preFix, B.dir);
    const o = JSON.parse(fs.readFileSync(B.f, 'utf8'));
    ok(!Array.isArray(o.limits) && !o.overage,
      `⑮ NEGATIVE CONTROL: with the preserve list back, ONE render deletes the canonical half and the overage (keys: ${Object.keys(o).join(',')})`);
    const relifted = limitsOf(o);
    ok(!relifted.some((l) => l.limitId === 'overage') && relifted.every((l) => l.source === 'passive'),
      `⑮ NEGATIVE CONTROL: …and the re-lift stamps THIS producer's name on limits it never measured (${relifted.map((l) => l.limitId + '=' + l.source).join(',')})`);
  }
}


// ── ⑯ THE ROUND-3 DEFECTS: THREE WAYS A BUCKET STOPPED COUNTING ─────────────
// All three were found by an adversarial verifier ON THIS BRANCH, all three
// were reproduced end to end before being fixed, and all three cost money in
// the same way: a bucket that makes a real claim is dropped from
// `accountRemaining` / `weeklyDeadline` / `bucketRems` / the anchor stream, so
// the pool goes on spending against a member that is actually walled.
//
// Each leg drives the REAL modules. Each negative control is a PATCHED COPY of
// a real module written beside it (siblings, or the relative requires do not
// resolve — the same idiom as test-auto-resume §12a and test-readings-attribution
// §18), and every patch is ASSERTED TO HIT so a control can never quietly turn
// into a second green arm.
console.log('\n⑯ the round-3 defects: three ways a counting bucket stopped counting');
{
  /** Patched copies of `names` (paths under src/), written OUTSIDE the tree
   *  (MUTC), each with its `require` re-bound to the real module's path so
   *  every other relative require resolves as a sibling's. `patches` is
   *  {file: [[from, to], …]}; every entry must hit exactly once. Cross-requires
   *  between the copies are re-pointed at the other COPIES (absolute paths) so
   *  the mutant world is closed — a control that half-loads the real module is
   *  not a control. */
  const mutantWorld = (tag, names, patches) => {
    const out = {}, hits = [];
    const nameOf = (n) => `q16-${tag}-${path.basename(n, '.js')}`;
    for (const n of names) {
      let src = fs.readFileSync(path.join(ROOT, n), 'utf8');
      for (const other of names) {
        const rel = './' + path.basename(other);
        if (src.includes(`require('${rel}')`)) src = src.split(`require('${rel}')`).join(`require(${JSON.stringify(MUTC.pathFor(nameOf(other)))})`);
      }
      for (const [from, to] of (patches[n] || [])) {
        hits.push([n, src.split(from).length - 1]);
        src = src.split(from).join(to);
      }
      out[n] = MUTC.write(n, src, null, { esm: false, name: nameOf(n) });
    }
    return { out, hits };
  };
  const load = (w, n) => require(w.out[n]);
  const patchHit = (w, label) => ok(w.hits.length > 0 && w.hits.every(([, c]) => c === 1),
    `⑯ NEGATIVE CONTROL setup: ${label} — every patch anchor hit exactly once (${JSON.stringify(w.hits)})`);

  const POOL = require(path.join(ROOT, 'src/account-pool-auto.js'));
  const CAP = require(path.join(ROOT, 'src/rate-limit-capture.js'));
  const { UsageAnchors } = require(path.join(ROOT, 'src/usage-anchors.js'));
  const QMFILE = 'src/quota-model.js', WFILE = 'src/usage-cache-write.js', CFILE = 'src/rate-limit-capture.js', PFILE = 'src/account-pool-auto.js';

  /** What the REAL anchor stream records for a cache object. This is the third
   *  reader of `bucketCounts` (the pool's two are remaining and deadline) and
   *  the one whose harm nothing else can stand in for: an anchor is the
   *  estimator's entire training input AND the corpus the by-window repair
   *  fingerprints identities from. Driven through `UsageAnchors` itself — the
   *  predicate is not re-spelled here. */
  const anchorBuckets = (cache) => {
    const d = scratch();
    const A = new UsageAnchors({ dataDir: d });
    A.maybeRecord({ identityKey: 'acct:probe', accountId: 'probe', cache, costSince: null });
    return (A.lastAnchor('acct:probe') || {}).buckets || { fiveHour: null, sevenDay: null, scopedWeekly: [] };
  };
  const NOW = 1788970000000, nowSec = Math.floor(NOW / 1000);
  const scratch = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-qm16-')); tmpDirs.push(d); return d; };
  // ⑯c builds the view-vs-accessor shape matrix; ⑯d re-drives it against its
  // own mutant to show the matrix now covers the defect that walked past it.
  let propShapes = null, propNow = 0, propOpt = () => false;
  // ⑯e migrates a real-shape file and then re-reads it under its own mutant.
  let migAfter = null;
  const rd = (d, k) => JSON.parse(fs.readFileSync(path.join(d, k + '.json'), 'utf8'));

  // ── ⑯a A STATED SPEND WITH NO RESET ───────────────────────────────────────
  // `windowState` asked for the deadline BEFORE it asked whether anything had
  // been spent, so "we know the utilization but not the reset" collapsed into
  // 'unknown' — which `bucketCounts` drops.
  console.log('\n  ⑯a a stated spend is decisive even when the reset is unknown');
  {
    // PURE: the rule itself.
    ok(QM.windowState({ kind: '5h', usedPct: 100, resetsAt: null, measuredAt: NOW }) === 'running',
      '⑯a a window the vendor says is 100 % gone is RUNNING, reset or no reset');
    ok(QM.windowState({ kind: '5h', usedPct: 0.4, resetsAt: null, measuredAt: NOW }) === 'running',
      '⑯a …any stated spend does it (the test is "> 0", not "looks big")');
    // POSITIVE CONTROL: the rule did not swallow the honest-unknown case.
    ok(QM.windowState({ kind: '5h', usedPct: 0, resetsAt: null, measuredAt: NOW }) === 'unknown',
      '⑯a POSITIVE CONTROL: 0 % with no reset is still UNKNOWN — untouched and just-started stay indistinguishable');
    ok(QM.windowState({ kind: '5h', usedPct: null, resetsAt: nowSec + 3000, measuredAt: NOW }) === 'unknown',
      '⑯a POSITIVE CONTROL: …and no usage figure at all is still UNKNOWN (ignorance is never a claim)');

    // REACHABILITY, from the product's own parser. THIS IS THE WHOLE PATH: the
    // `· resets` clause is optional on a real claude panel line,
    // `refreshViaCliPanel` deliberately refuses to project the 5-hour reset,
    // and the panel is the on-demand ⟳ every member gets. So a member can be
    // 95 % through its burst window with no reset anywhere in the product.
    const panel = CLAUDEQ.parseCliUsageText('Current session: 95% used\nCurrent week (all models): 20% used · resets Jan 2, 3am (America/Los_Angeles)', NOW);
    ok(panel && panel.fiveHour && panel.fiveHour.utilization === 0.95 && panel.fiveHour.resetsAt === undefined,
      `⑯a REACHABILITY: a real panel line without "· resets" parses to a SPENT bucket with NO reset (${JSON.stringify(panel.fiveHour)})`);

    // PRODUCT, end to end, through the one write path. Deliberately NO wall
    // here: a wall supplies its own bounded-guess reset, which would let ⑯b's
    // defect stand in for this one. This leg must fail for exactly one reason.
    const world = (Q) => {
      const dir = scratch();
      const P = Q.POOL || POOL;
      Q.W.writeCacheObject({ cacheDir: dir, key: 'A', obj: { ...panel, fetchedAt: NOW }, measuredAt: NOW, source: 'cli-usage' });
      Q.W.writeCacheObject({ cacheDir: dir, key: 'B', obj: { fiveHour: { utilization: 0.2, resetsAt: nowSec + 3000 }, sevenDay: { utilization: 0.1, resetsAt: nowSec + 300000 }, fetchedAt: NOW }, measuredAt: NOW, source: 'cli-usage' });
      const caches = { A: rd(dir, 'A'), B: rd(dir, 'B') };
      return {
        caches,
        rem: P.accountRemaining(caches.A, nowSec),
        anchors: anchorBuckets(caches.A),
        dec: P.decidePoolSwitch({ currentId: 'A', members: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], readCache: (id) => caches[id] ?? null, nowSec, hot: true, explain: true }),
      };
    };
    const real = world({ W, CAP });
    ok(real.rem.known && real.rem.remaining === 5,
      `⑯a the member 95 % through its burst window reads 5 % remaining (${JSON.stringify(real.rem)})`);
    ok(real.dec && real.dec.to === 'B',
      `⑯a …and the pool LEAVES it (${JSON.stringify({ to: real.dec && real.dec.to, why: real.dec && real.dec.reason })})`);
    ok(real.caches.A.fiveHour.state === undefined,
      `⑯a …because the reset-less bucket counts on the strength of its spend alone (${JSON.stringify(real.caches.A.fiveHour)})`);
    ok(real.anchors.fiveHour && real.anchors.fiveHour.u === 0.95,
      `⑯a …and the reading reaches the ANCHOR stream, which is what the estimator learns from (${JSON.stringify(real.anchors.fiveHour)})`);

    // NEGATIVE CONTROL: put the deadline test back in front of the spend test.
    const w = mutantWorld('a', [QMFILE, WFILE, CFILE], {
      [QMFILE]: [
        ["  if (used == null) return 'unknown';", "  const resetsAt0 = posNum(win.resetsAt);\n  if (used == null || resetsAt0 == null) return 'unknown';"],
        ["  const resetsAt = posNum(win.resetsAt);\n  if (resetsAt == null) return 'unknown';", '  const resetsAt = resetsAt0;'],
      ],
    });
    patchHit(w, '⑯a restores the pre-fix ordering in windowState');
    const pre = world({ W: load(w, WFILE), CAP: load(w, CFILE) });
    ok(pre.caches.A.fiveHour.state === 'unknown' && pre.caches.A.fiveHour.utilization === 0.95,
      `⑯a NEGATIVE CONTROL: with the old ordering the bucket is 95 % spent AND stamped unknown (${JSON.stringify(pre.caches.A.fiveHour)})`);
    // WHAT THE `windowState` ORDERING UNIQUELY PROTECTS, AFTER r4. The r4 split
    // gave the REMAINING its own predicate (`bucketStatesSpend`), so a stated
    // 95 % is worth 5 % free whatever the stamp says — the two fixes are two
    // independent belts against one money harm, and each needs its own control
    // (⑯a-x below removes the OTHER belt and shows this shape go dark again).
    // What only THIS fix protects is everything keyed on `bucketCounts`: the
    // ANCHOR STREAM, which is the estimator's entire input and the corpus the
    // window fingerprint identifies accounts from.
    ok(pre.anchors.fiveHour === null,
      `⑯a NEGATIVE CONTROL: …so the 95 % reading never becomes an ANCHOR — the estimator and the window guard never see it (${JSON.stringify(pre.anchors)})`);
    ok(pre.rem.remaining === 5 && pre.dec && pre.dec.to === 'B',
      `⑯a NEGATIVE CONTROL: …while the pool is held by the OTHER belt, which is why this control may not claim the remaining (${JSON.stringify({ rem: pre.rem.remaining, to: pre.dec && pre.dec.to })})`);

    // ⑯a-x THE SECOND BELT, ALONE. Remove the r4 split and keep the r3 stamp
    // ordering broken: this is the branch as the r3 verifier found it, and it
    // reproduces the number that commit measured (80 % free on the 7d window
    // alone, the pool staying on a member 95 % through its burst window).
    const wax = mutantWorld('ax', [QMFILE, WFILE, CFILE, PFILE], {
      [QMFILE]: [
        ["  if (used == null) return 'unknown';", "  const resetsAt0 = posNum(win.resetsAt);\n  if (used == null || resetsAt0 == null) return 'unknown';"],
        ["  const resetsAt = posNum(win.resetsAt);\n  if (resetsAt == null) return 'unknown';", '  const resetsAt = resetsAt0;'],
        ['    for (const w of spendingWindows(l)) {', '    for (const w of countingWindows(l)) {'],
      ],
      [PFILE]: [['  if (!bucketStatesSpend(b)) return null;', '  if (!bucketCounts(b)) return null;']],
    });
    patchHit(wax, '⑯a-x removes BOTH belts (the r3 defect with the r4 split undone)');
    const preX = world({ W: load(wax, WFILE), CAP: load(wax, CFILE), POOL: load(wax, PFILE) });
    ok(preX.rem.remaining === 80,
      `⑯a-x NEGATIVE CONTROL (both belts): the member reads ${preX.rem.remaining} % free on its 7d window alone — the burst window it is nearly through is invisible`);
    ok(preX.dec === null || (preX.dec && preX.dec.to === null),
      `⑯a-x NEGATIVE CONTROL (both belts): …and the pool stays on it (${JSON.stringify(preX.dec && preX.dec.reason)})`);
  }

  // ── ⑯b A STORED VERDICT MAY NOT OUTLIVE THE READING IT DESCRIBES ──────────
  // `state` is a verdict computed by the projection from a
  // (usedPct, resetsAt, measuredAt) triple, but it lives on the bucket object
  // every producer spreads forward — so it rode onto numbers it no longer
  // described. Two halves, two mechanisms, two negative controls.
  console.log('\n  ⑯b a stored window verdict may not outlive the reading it describes');
  {
    const WEEK = 7 * 24 * 3600;
    // B1 — THE BELT'S OWN CASE: a stale stamp that arrives from a FILE, not
    // from a producer this build can patch. An older build stamped the bucket
    // 'unknown' while it had no reset; the account has since been read properly
    // and the bucket is 95 % spent and fully dated, but the stamp is still on
    // disk. Nothing in this leg re-states the 5h bucket, so the producer half
    // can never fire — only `fromLegacy`'s belt heals it, on the next write.
    //
    // NOT HYPOTHETICAL: four of the nine live claude cache files on this
    // instance hold a reset-less `fiveHour`, which is precisely how this stamp
    // gets written.
    const b1 = (Q) => {
      const dir = scratch();
      const stale = {
        fiveHour: { utilization: 0.95, resetsAt: nowSec + 4000, state: 'unknown' },
        sevenDay: { utilization: 0.2, resetsAt: nowSec + 300000 },
        fetchedAt: NOW, source: 'cli-usage',
      };
      fs.writeFileSync(path.join(dir, 'C.json'), JSON.stringify(stale));
      // any later write that does NOT touch the 5h bucket
      Q.CAP.captureRateLimitEvent({ cacheDir: dir, key: 'C', identityIds: ['C'], ev: { kind: 'sevenDay', status: 'allowed', utilization: 0.2, resetsAt: nowSec + 300000 }, now: NOW + 1000 });
      const c = rd(dir, 'C');
      return { c, rem: (Q.POOL || POOL).accountRemaining(c, nowSec), anchors: anchorBuckets(c) };
    };
    const r1 = b1({ W, CAP });
    ok(r1.c.fiveHour.state === undefined,
      `⑯b a stale stamp left on disk by an older build HEALS on the next write (${JSON.stringify(r1.c.fiveHour)})`);
    ok(r1.rem.remaining === 5, `⑯b …and the 95 % bucket is worth 5 % remaining again (${JSON.stringify(r1.rem)})`);

    // B2: an EMPTY stamp survives a real spend — the routine post-weekly-roll
    // shape, and inc-msof8i22 / 2.305.0 re-opened (a spent model cap the pool
    // cannot see).
    const b2 = (Q) => {
      const dir = scratch();
      const weekOut = nowSec + WEEK - 30;
      Q.W.writeCacheObject({
        cacheDir: dir, key: 'D', measuredAt: NOW, source: 'cli-usage',
        obj: { fiveHour: { utilization: 0.1, resetsAt: nowSec + 3000 }, sevenDay: { utilization: 0, resetsAt: weekOut }, scopedWeekly: [{ name: 'Fable', utilization: 0, resetsAt: weekOut }], fetchedAt: NOW },
      });
      const seeded = rd(dir, 'D');
      Q.CAP.captureRateLimitEvent({ cacheDir: dir, key: 'D', identityIds: ['D'], ev: { kind: 'sevenDay', status: 'allowed', utilization: 0.9, resetsAt: weekOut }, now: NOW + 2000 });
      Q.CAP.captureRateLimitEvent({ cacheDir: dir, key: 'D', identityIds: ['D'], ev: { kind: 'scoped', scopedName: 'fable', status: 'allowed', utilization: 1, resetsAt: weekOut }, now: NOW + 3000 });
      const c = rd(dir, 'D');
      const P = Q.POOL || POOL;
      return { seeded, c, weekOut, rem: P.accountRemaining(c, nowSec), dl: P.weeklyDeadline(c, nowSec), rems: P.bucketRems(c, nowSec), anchors: anchorBuckets(c) };
    };
    const r2 = b2({ W, CAP });
    ok(r2.seeded.sevenDay.state === 'empty' && r2.seeded.scopedWeekly[0].state === 'empty',
      '⑯b SETUP: at the weekly roll both budget windows are correctly stamped EMPTY (this stamp is right when it is written)');
    ok(r2.rem.known && r2.rem.remaining === 0,
      `⑯b …after three real readings climb them, the spent model cap is worth 0 % (${JSON.stringify(r2.rem)})`);
    ok(r2.dl === r2.weekOut, `⑯b …the account has its weekly deadline back (${r2.dl})`);
    ok(r2.rems.length === 3, `⑯b …and all three buckets are reported again (${JSON.stringify(r2.rems.map((x) => (x.label || x.kind) + ' ' + Math.round(x.remaining)))})`);
    ok(r2.anchors.sevenDay && r2.anchors.sevenDay.u === 0.9 && r2.anchors.scopedWeekly.length === 1,
      `⑯b …and both climbed readings reach the ANCHOR stream (${JSON.stringify(r2.anchors)})`);

    // B3 — THE PRODUCER HALF'S OWN CASE, which the belt structurally cannot
    // catch: a window correctly stamped EMPTY, then re-stated by a real event
    // that still reads 0 % but now carries a PINNED reset an hour out — the
    // window did open, the member just barely used it. `usedPct` is 0, so "a
    // stated spend voids the verdict" says nothing; only the producer, which
    // knows it just replaced the numbers, can drop the verdict that described
    // the old ones. The cost of keeping it is the member's real weekly
    // deadline: EDF cannot rank an account whose deadline reads null.
    const b3 = (Q) => {
      const dir = scratch();
      Q.W.writeCacheObject({ cacheDir: dir, key: 'E', measuredAt: NOW, source: 'cli-usage', obj: { sevenDay: { utilization: 0, resetsAt: nowSec + WEEK - 40 }, fetchedAt: NOW } });
      const seeded = rd(dir, 'E');
      const pinned = nowSec + 3600;
      Q.CAP.captureRateLimitEvent({ cacheDir: dir, key: 'E', identityIds: ['E'], ev: { kind: 'sevenDay', status: 'allowed', utilization: 0, resetsAt: pinned }, now: NOW + 60000 });
      const c = rd(dir, 'E');
      return { seeded, c, pinned, dl: POOL.weeklyDeadline(c, nowSec) };
    };
    const r3 = b3({ W, CAP });
    ok(r3.seeded.sevenDay.state === 'empty', '⑯b SETUP: the window starts out correctly stamped EMPTY (0 %, sliding reset)');
    ok(r3.c.sevenDay.state === undefined,
      `⑯b a window re-stated at 0 % with a now-PINNED reset becomes RUNNING — the EMPTY verdict described the old numbers (${JSON.stringify(r3.c.sevenDay)})`);
    ok(r3.dl === r3.pinned, `⑯b …so the member gets its real weekly deadline back (${r3.dl})`);

    // POSITIVE CONTROL: a status-only event changes no number, so the reading
    // is unchanged and the verdict MUST survive — dropping it there would hand
    // `fromLegacy` the file's clock and flip a genuinely empty window.
    {
      const dir = scratch();
      const weekOut = nowSec + WEEK - 40;
      W.writeCacheObject({ cacheDir: dir, key: 'F', measuredAt: NOW, source: 'cli-usage', obj: { sevenDay: { utilization: 0, resetsAt: weekOut }, fetchedAt: NOW } });
      ok(rd(dir, 'F').sevenDay.state === 'empty', '⑯b POSITIVE CONTROL setup: a genuinely empty weekly window');
      CAP.captureRateLimitEvent({ cacheDir: dir, key: 'F', identityIds: ['F'], ev: { kind: 'sevenDay', status: 'allowed' }, now: NOW + 30 * 60000 });
      const c = rd(dir, 'F');
      ok(c.sevenDay.state === 'empty',
        `⑯b POSITIVE CONTROL: a status-only event 30 min later restates no number, so the EMPTY verdict survives (${JSON.stringify(c.sevenDay)})`);
      ok(POOL.weeklyDeadline(c, nowSec) === null,
        '⑯b POSITIVE CONTROL: …and the sliding reset still never becomes a deadline (this is the reason the stamp is trusted at all)');
    }

    // NEGATIVE CONTROL 1 — the belt: `fromLegacy` trusts a stamp unconditionally.
    const wBelt = mutantWorld('b1', [QMFILE, WFILE, CFILE], {
      [QMFILE]: [["if (STATES.includes(b.state) && !(usedPct > 0)) w.state = b.state;", 'if (STATES.includes(b.state)) w.state = b.state;']],
    });
    patchHit(wBelt, '⑯b restores the unconditional stored-state preserve');
    const preBelt = { W: load(wBelt, WFILE), CAP: load(wBelt, CFILE) };
    const p1 = b1(preBelt);
    ok(p1.c.fiveHour.state === 'unknown' && p1.anchors.fiveHour === null,
      `⑯b NEGATIVE CONTROL (belt): the stale on-disk stamp NEVER heals, so the 95 % reading never becomes an ANCHOR (${JSON.stringify({ state: p1.c.fiveHour.state, anchor: p1.anchors.fiveHour })})`);
    ok(p1.rem.remaining === 5,
      `⑯b NEGATIVE CONTROL (belt): …while the r4 split holds the pool's remaining at ${p1.rem.remaining} % — a second belt, measured by ⑯b-x below`);
    // …and the belt is what makes ⑯b's headline case survive an unpatched
    // producer too, so it is measured on that shape as well.
    const wBoth = mutantWorld('b1x', [QMFILE, WFILE, CFILE], {
      [QMFILE]: [['if (STATES.includes(b.state) && !(usedPct > 0)) w.state = b.state;', 'if (STATES.includes(b.state)) w.state = b.state;']],
      [CFILE]: [['const restated = (b) => { const c = { ...b }; delete c.state; return c; };', 'const restated = (b) => ({ ...b });']],
    });
    patchHit(wBoth, '⑯b removes BOTH halves (the branch as the verifier found it)');
    const p2 = b2({ W: load(wBoth, WFILE), CAP: load(wBoth, CFILE) });
    ok(p2.dl === null && p2.anchors.sevenDay === null && p2.anchors.scopedWeekly.length === 0,
      `⑯b NEGATIVE CONTROL (both halves): the stale EMPTY verdict rides onto the climbed numbers, so the member has NO weekly deadline (${p2.dl}) and neither reading anchors (${JSON.stringify(p2.anchors)}) — EDF cannot rank it and the estimator never learns`);

    // ⑯b-x THE SECOND BELT, ALONE — the same shapes with the r4 split undone,
    // which is what makes ⑯b's own controls measure only what ⑯b's fix
    // protects. These are the numbers the r3 commit measured; they are
    // reproduced here so the claim "the remaining is held by the OTHER belt"
    // is a MEASUREMENT and not a reading of the diff.
    const wbx = mutantWorld('b2x', [QMFILE, WFILE, CFILE, PFILE], {
      [QMFILE]: [
        ['if (STATES.includes(b.state) && !(usedPct > 0)) w.state = b.state;', 'if (STATES.includes(b.state)) w.state = b.state;'],
        ['    for (const w of spendingWindows(l)) {', '    for (const w of countingWindows(l)) {'],
      ],
      [CFILE]: [['const restated = (b) => { const c = { ...b }; delete c.state; return c; };', 'const restated = (b) => ({ ...b });']],
      [PFILE]: [['  if (!bucketStatesSpend(b)) return null;', '  if (!bucketCounts(b)) return null;']],
    });
    patchHit(wbx, '⑯b-x removes BOTH belts (the r3 defect with the r4 split undone)');
    const pbx1 = b1({ W: load(wbx, WFILE), CAP: load(wbx, CFILE), POOL: load(wbx, PFILE) });
    ok(pbx1.rem.remaining === 80,
      `⑯b-x NEGATIVE CONTROL (both belts): the stale stamp makes the 95 % bucket invisible and the member reads ${pbx1.rem.remaining} % free`);
    const pbx2 = b2({ W: load(wbx, WFILE), CAP: load(wbx, CFILE), POOL: load(wbx, PFILE) });
    ok(pbx2.rem.remaining === 90 && pbx2.dl === null && pbx2.rems.length === 1,
      `⑯b-x NEGATIVE CONTROL (both belts): the spent Fable cap is INVISIBLE (${pbx2.rem.remaining} % free, deadline ${pbx2.dl}, ${pbx2.rems.length} bucket row) — inc-msof8i22 re-opened`);

    // NEGATIVE CONTROL 2 — the producer half: the writer keeps a verdict it
    // just invalidated. Only this half catches the re-statement DOWN to 0 %,
    // which is why there are two controls and not one.
    const wProd = mutantWorld('b2', [CFILE], {
      [CFILE]: [['const restated = (b) => { const c = { ...b }; delete c.state; return c; };', 'const restated = (b) => ({ ...b });']],
    });
    patchHit(wProd, '⑯b restores the producer that carries a stale verdict forward');
    const p3 = b3({ W, CAP: load(wProd, CFILE) });
    ok(p3.c.sevenDay.state === 'empty' && p3.dl === null,
      `⑯b NEGATIVE CONTROL (producer): the stale EMPTY verdict rides onto the re-stated window, so the member's real 1-hour deadline reads ${p3.dl} — and the belt cannot help, because 0 % refutes nothing`);
  }

  // ── ⑯c THE VIEW MAY NEVER BE MORE OPTIMISTIC THAN THE SET ─────────────────
  // A model limit's FIVE-HOUR window had no home in the legacy view: the scoped
  // projection takes only BUDGET windows and `fiveHour` was read off the plan
  // limit alone. `account-pool-auto` reads the VIEW.
  console.log('\n  ⑯c the derived view may never be more optimistic than the set it projects');
  {
    // The two REAL codex push shapes (§⑫'s fixtures, with the Spark limit
    // SPENT on its burst window — §⑫ only ever tested the 0 % direction).
    const sparkSpent = {
      ...sparkAt(T0), primary: { usedPercent: 90, windowDurationMins: 300, resetsAt: Math.round(T0 / 1000) + 1200 },
      secondary: { usedPercent: 10, windowDurationMins: 10080, resetsAt: 1789509325 },
    };
    const nowC = Math.round(T0 / 1000);
    const set = QM.mergeLimitSets(
      CODEXQ.toLimitSet(CODEX_PLAN, { identity: 'cx', source: 'codex-rate-limits', fetchedAt: T0 }),
      CODEXQ.toLimitSet(sparkSpent, { identity: 'cx', source: 'codex-rate-limits', fetchedAt: T0 + 3000 }),
    );
    const view = QM.toLegacyView(set);
    const acc = QM.remaining(set, { nowSec: nowC });
    const viaPool = POOL.accountRemaining(view, nowC);
    ok(acc.known && acc.remaining === 10 && acc.kind === '5h',
      `⑯c the ACCESSOR binds on the Spark burst window (${JSON.stringify(acc)})`);
    ok(viaPool.known && viaPool.remaining === 10,
      `⑯c …and the pool, which reads the VIEW, now agrees (${JSON.stringify(viaPool)})`);
    ok(view.fiveHour && view.fiveHour.utilization === 0.9,
      `⑯c …because fiveHour means THE BINDING BURST CONSTRAINT, not "the plan limit's" (${JSON.stringify(view.fiveHour)})`);
    ok(view.scopedWeekly && view.scopedWeekly.length === 1 && view.scopedWeekly[0].utilization === 0.1,
      '⑯c …and nothing was collapsed: the Spark WEEKLY window is still its own scoped row');

    // POSITIVE CONTROL: the plan limit still wins when it is the binding one —
    // this is a min, not "the model limit always".
    const setPlanBinds = QM.mergeLimitSets(
      CODEXQ.toLimitSet(CODEX_PLAN_FULL, { identity: 'cx2', source: 'codex-rate-limits', fetchedAt: T0 }),
      CODEXQ.toLimitSet(sparkSpent, { identity: 'cx2', source: 'codex-rate-limits', fetchedAt: T0 + 3000 }),
    );
    ok(POOL.accountRemaining(QM.toLegacyView(setPlanBinds), nowC).remaining === 0,
      '⑯c POSITIVE CONTROL: a SPENT plan limit still decides — the projection is a min, not a preference for model caps');
    // POSITIVE CONTROL: an EMPTY model burst window is not a candidate (it makes
    // no claim), so the plan's own bucket is what the view shows.
    const setEmptySpark = QM.mergeLimitSets(
      CODEXQ.toLimitSet(CODEX_PLAN, { identity: 'cx3', source: 'codex-rate-limits', fetchedAt: T0 }),
      CODEXQ.toLimitSet(sparkAt(T0), { identity: 'cx3', source: 'codex-rate-limits', fetchedAt: T0 }),
    );
    const vEmpty = QM.toLegacyView(setEmptySpark);
    ok(POOL.accountRemaining(vEmpty, nowC).remaining === 95,
      '⑯c POSITIVE CONTROL: an EMPTY Spark burst window never displaces the plan bucket (§⑫’s 0 % direction still holds)');

    // THE PROPERTY, DERIVED RATHER THAN ENUMERATED. The hole existed because
    // one window KIND had nowhere to go in the projection; the guard against
    // the next one is not a list of kinds but the invariant itself, driven over
    // every shape this suite knows how to build.
    const shapes = [];
    for (const planW of [null, CODEX_PLAN, CODEX_PLAN_FULL]) {
      for (const modelW of [null, sparkAt(T0), sparkSpent]) {
        if (!planW && !modelW) continue;
        let s = QM.makeLimitSet({ identity: 'p', fetchedAt: T0 });
        if (planW) s = QM.mergeLimitSets(s, CODEXQ.toLimitSet(planW, { identity: 'p', source: 'codex-rate-limits', fetchedAt: T0 }));
        if (modelW) s = QM.mergeLimitSets(s, CODEXQ.toLimitSet(modelW, { identity: 'p', source: 'codex-rate-limits', fetchedAt: T0 + 3000 }));
        shapes.push(s);
      }
    }
    // …plus a claude-shaped set (model caps are weekly-only there — the rule
    // must be one rule, with no backend branch, and must not disturb claude).
    shapes.push(QM.fromLegacy({
      fiveHour: { utilization: 0.71, resetsAt: nowC + 2 * 3600 },
      sevenDay: { utilization: 0.44, resetsAt: nowC + 3 * 86400 },
      scopedWeekly: [{ name: 'Fable', utilization: 0.93, resetsAt: nowC + 3 * 86400 }],
    }, { identity: 'cl', fetchedAt: T0, limitId: 'plan', familyOf: familyOfScopedBucket }));
    // …and a set whose model burst window has ROLLED OVER while the plan's
    // still binds. The first version of this matrix had only future resets, so
    // the property could not see ⑯d — the defect this very fix introduced.
    shapes.push(QM.makeLimitSet({
      identity: 'rolled', fetchedAt: T0, source: 'codex-rate-limits',
      limits: [
        QM.makeLimit({ limitId: 'codex', scope: 'plan', fetchedAt: T0, windows: [{ kind: '5h', minutes: 300, usedPct: 50, resetsAt: nowC + 3000, measuredAt: T0 }] }),
        QM.makeLimit({ limitId: 'codex_spark', name: 'Spark', scope: 'model', model: 'Spark', fetchedAt: T0, windows: [{ kind: '5h', minutes: 300, usedPct: 90, resetsAt: nowC - 120, measuredAt: T0 - 7200000 }] }),
      ],
    }));
    // The view is asked with the SAME clock as the accessor: "which window
    // binds" is a question about now, so comparing a real-clock projection with
    // a `nowC` accessor would measure the leg's own inconsistency, not the
    // product's.
    // …and a set whose window states a RESET but no number. r4's own positive
    // control caught the projection writing `utilization: 0` for it — "the
    // vendor said nothing" rendered as "the vendor said zero" — which is a
    // violation the ORIGINAL property could not see, because it compared two
    // KNOWN answers and here the accessor is the one that says nothing. So the
    // property grew a second clause (`moreOptimistic`), and the shape that
    // exposed the blind spot is in the matrix beside it.
    shapes.push(QM.makeLimitSet({
      identity: 'mute', fetchedAt: T0, source: 'cli-usage',
      limits: [QM.makeLimit({ limitId: 'plan', scope: 'plan', fetchedAt: T0, windows: [{ kind: '5h', usedPct: null, resetsAt: nowC + 3600, measuredAt: T0 }] })],
    }));
    // CLAIMING TO KNOW IS ITSELF AN OPTIMISM. `known:false` costs a member
    // UNKNOWN_REMAINING_PCT; `known:true` at a number the set cannot support is
    // a headroom the model never stated.
    //
    // WHAT THIS PROPERTY STRUCTURALLY CANNOT SEE, stated so the next round does
    // not over-trust it: it compares two PROJECTIONS of one set, so an error
    // both of them make is invisible here — and that is precisely the r4 defect
    // (§⑯e), where the view and the accessor agreed that a free member had no
    // reading. A property that bounds A against B guards the SEAM, never the
    // shared rule underneath it; the rule itself needs a leg that names an
    // answer, which ⑯e is.
    const moreOptimistic = (a, v) => (v.known && !a.known) || (a.known && v.known && v.remaining > a.remaining + 1e-9);
    const optimistic = shapes.filter((s) => moreOptimistic(QM.remaining(s, { nowSec: nowC }), POOL.accountRemaining(QM.toLegacyView(s, { nowSec: nowC }), nowC)));
    propShapes = shapes; propNow = nowC; propOpt = moreOptimistic;
    ok(shapes.length === 11, `⑯c PROPERTY scope is non-vacuous (${shapes.length} shapes, codex plan × model × claude × a rolled-over burst window × a numberless one)`);
    ok(!optimistic.length,
      `⑯c PROPERTY: over every shape, the derived view is NEVER more optimistic than the accessor — including by CLAIMING TO KNOW (${optimistic.length} violations)`);

    // NEGATIVE CONTROL: read fiveHour off the plan limit alone again.
    const wC = mutantWorld('c', [QMFILE], { [QMFILE]: [['const f5 = toBucket(bind5 || planW5);', 'const f5 = toBucket(planW5);']] });
    patchHit(wC, '⑯c restores the plan-only fiveHour projection');
    const QMpre = load(wC, QMFILE);
    const vPre = QMpre.toLegacyView(set);
    const poolPre = POOL.accountRemaining(vPre, nowC);
    ok(vPre.fiveHour === undefined && poolPre.remaining === 90,
      `⑯c NEGATIVE CONTROL: the Spark burst window vanishes and the pool reads ${poolPre.remaining} % where the accessor says ${acc.remaining} % (${JSON.stringify(vPre.fiveHour)})`);
    // …and that this was a REGRESSION, not merely a gap: the pre-model commit's
    // last-writer-wins collapse kept the Spark 5h and answered 10 %.
    const collapsed = { ...CODEXQ.normalizeCodexRateLimit(CODEX_PLAN, T0), ...CODEXQ.normalizeCodexRateLimit(sparkSpent, T0 + 3000) };
    ok(POOL.accountRemaining(collapsed, nowC).remaining === 10,
      '⑯c NEGATIVE CONTROL: …while the collapse this model REPLACED answered 10 % — the projection had made the answer worse');
    const violPre = shapes.filter((s) => moreOptimistic(QM.remaining(s, { nowSec: nowC }), POOL.accountRemaining(QMpre.toLegacyView(s, { nowSec: nowC }), nowC)));
    ok(violPre.length > 0, `⑯c NEGATIVE CONTROL: …and the PROPERTY itself goes red on the same matrix (${violPre.length} violations)`);
  }

  // ── ⑯d "MORE CONSTRAINED" IS A QUESTION ABOUT NOW ─────────────────────────
  // Found by driving ⑯c's own property with a PASSED reset, i.e. by this
  // branch mutation-testing its own new leg. ⑯c's first spelling ranked the
  // 5-hour windows by raw `usedPct`, which is not what "binding" means: a
  // window whose reset has passed rolled over since we read it, so its stale
  // utilization means nothing and it is FULL (`windowRemaining`'s rule, and
  // `bucketRemaining` — the pool's — applies it to whatever bucket we emit).
  // A 90 %-spent-but-rolled-over model window therefore DISPLACED a plan
  // window with a real 50 % left, and the view came out MORE optimistic than
  // the set: the exact defect ⑯c exists to prevent, inside the fix for it.
  console.log('\n  ⑯d the binding burst window is decided on remaining, not on raw percentage');
  {
    const nowD = 1788970000, T = nowD * 1000;
    const mk = (planPct, plan5Reset, modelPct, model5Reset) => QM.makeLimitSet({
      identity: 'cx', fetchedAt: T, source: 'codex-rate-limits',
      limits: [
        QM.makeLimit({
          limitId: 'codex', scope: 'plan', fetchedAt: T, windows: [
            { kind: '5h', minutes: 300, usedPct: planPct, resetsAt: plan5Reset, measuredAt: T },
            { kind: '7d', minutes: 10080, usedPct: 10, resetsAt: nowD + 300000, measuredAt: T },
          ],
        }),
        QM.makeLimit({
          limitId: 'codex_spark', name: 'Spark', scope: 'model', model: 'Spark', fetchedAt: T,
          windows: [{ kind: '5h', minutes: 300, usedPct: modelPct, resetsAt: model5Reset, measuredAt: T - 7200000 }],
        }),
      ],
    });
    // The model window reads 90 % spent, but its reset PASSED ⇒ it is full.
    const rolled = mk(50, nowD + 3000, 90, nowD - 120);   // passed two minutes ago: LANDED (a stated reset counts only a minute after it, 2.369.117)
    const accD = QM.remaining(rolled, { nowSec: nowD });
    const poolD = POOL.accountRemaining(QM.toLegacyView(rolled, { nowSec: nowD }), nowD);
    ok(accD.remaining === 50 && poolD.remaining === 50,
      `⑯d a rolled-over model window never displaces a plan window that really binds (accessor ${accD.remaining} %, pool ${poolD.remaining} %)`);
    // POSITIVE CONTROL: while it is genuinely running, it still takes the slot.
    const live = mk(50, nowD + 3000, 90, nowD + 1200);
    ok(POOL.accountRemaining(QM.toLegacyView(live, { nowSec: nowD }), nowD).remaining === 10,
      '⑯d POSITIVE CONTROL: …while a RUNNING model window at 90 % still binds (the rule is not "prefer the plan")');
    // THE PLAN WINS EVERY TIE — this is ⑭'s invariant, and after ⑯c it depends
    // on the plan window being SEEDED rather than on iteration order. Every
    // window of a set read long after it was measured ties at 100.
    const stale = mk(50, nowD - 600, 90, nowD - 120);
    const vStale = QM.toLegacyView(stale, { nowSec: nowD });
    ok(vStale.fiveHour && vStale.fiveHour.utilization === 0.5,
      `⑯d when every 5h window has rolled over they TIE at 100 %, and the plan's is the one emitted (${JSON.stringify(vStale.fiveHour)})`);

    // NEGATIVE CONTROL: rank by raw percentage again (⑯c's first spelling).
    const wD = mutantWorld('d', [QMFILE], {
      [QMFILE]: [["const rank = (w) => (w && w.state === 'running' ? windowRemaining(w, now) : null);",
        "const rank = (w) => (w && w.state === 'running' && w.usedPct != null ? 100 - w.usedPct : null);"]],
    });
    patchHit(wD, '⑯d ranks the 5h windows by raw usedPct again');
    const QMd = load(wD, QMFILE);
    const poolPreD = POOL.accountRemaining(QMd.toLegacyView(rolled, { nowSec: nowD }), nowD);
    ok(poolPreD.remaining === 90,
      `⑯d NEGATIVE CONTROL: ranking on the raw percentage reads ${poolPreD.remaining} % where the accessor says ${accD.remaining} % — the view is more optimistic than the set`);
    ok(POOL.accountRemaining(QMd.toLegacyView(live, { nowSec: nowD }), nowD).remaining === 10,
      '⑯d NEGATIVE CONTROL: …and it is right about the RUNNING case, which is why only the passed reset exposes it');
    // THE PROPERTY NOW COVERS IT. ⑯c's matrix had only future resets, so this
    // defect walked straight through the guard written to prevent its whole
    // class. A property is worth exactly the shapes it is driven over, so the
    // matrix earning its keep is itself an assertion.
    const violD = (propShapes || []).filter((s) => propOpt(QM.remaining(s, { nowSec: propNow }), POOL.accountRemaining(QMd.toLegacyView(s, { nowSec: propNow }), propNow)));
    ok(propShapes && propShapes.length === 11 && violD.length > 0,
      `⑯d …and ⑯c's PROPERTY, once its matrix carries a rolled-over window, goes red on this mutant too (${violD.length} violations over ${propShapes ? propShapes.length : 0} shapes) — it could not before`);
  }

  // ── ⑯e A FREE MEMBER IS NOT AN UNKNOWN ONE ────────────────────────────────
  // The r4 verifier's finding, reproduced end to end before it was fixed. r3
  // asked ONE predicate — "may this bucket name a deadline" — of BOTH questions
  // a bucket answers, so a window the vendor reported at 0 % used was dropped
  // from the REMAINING as well. A fully free member then read back to the pool
  // as "no usage data", which is not neutral: it ranks at UNKNOWN_REMAINING_PCT
  // (50), it is never `usable === true`, and it is not settleable — so a pool
  // sitting on an EXHAUSTED member would not move onto it.
  //
  // The fix splits the two questions (`bucketStatesSpend` / `windowStatesSpend`
  // beside `bucketCounts` / `countingWindows`). B-8b12 is untouched: an empty
  // window still names no deadline, still never anchors, and still publishes no
  // reset. The POSITIVE CONTROLS below are what make that a measurement.
  console.log('\n  ⑯e a window the vendor reported at 0 % is 100 % free, not "no usage data"');
  {
    // PURE: the two predicates, and the P6 line between "said zero" and "said
    // nothing" (`Number(null)` is 0 — which is why `num()` and not `Number()`).
    ok(QM.windowStatesSpend({ usedPct: 0 }) === true && QM.bucketStatesSpend({ utilization: 0 }) === true,
      '⑯e a stated 0 % IS a claim, in both spellings');
    ok(QM.windowStatesSpend({ usedPct: null }) === false && QM.bucketStatesSpend({ utilization: null }) === false
      && QM.bucketStatesSpend({}) === false && QM.bucketStatesSpend({ utilization: '' }) === false,
      '⑯e POSITIVE CONTROL: …and a bucket with no number is not — `Number(null)` is 0, `num(null)` is null (P6)');
    ok(QM.bucketCounts({ utilization: 0, state: 'empty' }) === false && QM.bucketCounts({ utilization: 0, state: 'unknown' }) === false,
      '⑯e POSITIVE CONTROL: the DEADLINE predicate is unchanged — an empty window still names no deadline (B-8b12)');

    // REACHABILITY, from the product's own parser. This is the ordinary shape,
    // not a corner: the `· resets` clause of a claude panel line is optional
    // and `refreshViaCliPanel` refuses to project the 5-hour one, so a
    // brand-new account — which has no prior reset to carry forward either —
    // comes back with BOTH plan buckets at 0 % and no reset anywhere.
    const fresh = CLAUDEQ.parseCliUsageText('Current session:  0% used\nCurrent week (all models):  0% used', NOW);
    ok(fresh && fresh.fiveHour.utilization === 0 && fresh.fiveHour.resetsAt === undefined
      && fresh.sevenDay.utilization === 0 && fresh.sevenDay.resetsAt === undefined,
      `⑯e REACHABILITY: a real panel for an untouched account parses to two reset-less 0 % buckets (${JSON.stringify(fresh)})`);

    // PRODUCT, end to end, through the one write path: an EXHAUSTED current
    // member and a brand-new one beside it.
    const eWorld = (Q) => {
      const dir = scratch();
      const P = Q.POOL || POOL;
      Q.W.writeCacheObject({ cacheDir: dir, key: 'NEW', obj: { ...fresh, fetchedAt: NOW }, measuredAt: NOW, source: 'cli-usage', backend: 'claude' });
      Q.W.writeCacheObject({ cacheDir: dir, key: 'CUR', obj: { fiveHour: { utilization: 0.2, resetsAt: nowSec + 3600 }, sevenDay: { utilization: 0.96, resetsAt: nowSec + 86400 }, fetchedAt: NOW }, measuredAt: NOW, source: 'cli-usage', backend: 'claude' });
      const caches = { NEW: rd(dir, 'NEW'), CUR: rd(dir, 'CUR') };
      const verdicts = ['CUR', 'NEW'].map((id) => ({ id, v: P.quotaVerdict(caches[id], nowSec) }));
      return {
        caches, verdicts,
        rem: P.accountRemaining(caches.NEW, nowSec),
        dl: P.weeklyDeadline(caches.NEW, nowSec),
        rems: P.bucketRems(caches.NEW, nowSec),
        anchors: anchorBuckets(caches.NEW),
        ranked: P.rankPoolMembers({ members: [{ id: 'CUR', name: 'Current' }, { id: 'NEW', name: 'BrandNew' }], readCache: (id) => caches[id] ?? null, nowSec }),
        dec: P.decidePoolSwitch({ currentId: 'CUR', members: [{ id: 'CUR', name: 'Current' }, { id: 'NEW', name: 'BrandNew' }], readCache: (id) => caches[id] ?? null, nowSec, hot: true, explain: true }),
        // THE ENGINE'S OWN GATE, applied verbatim (pinned below): a pool is
        // usable only if some member's verdict is exactly `true`.
        poolUsable: verdicts.find((x) => x.v.usable === true) || null,
      };
    };
    const e = eWorld({ W, CAP });
    ok(e.caches.NEW.fiveHour.state === 'unknown' && e.caches.NEW.sevenDay.state === 'unknown',
      `⑯e SETUP: both buckets land stamped 'unknown' — untouched and just-started are genuinely indistinguishable without a reset (${JSON.stringify(e.caches.NEW.fiveHour)})`);
    ok(e.rem.known && e.rem.remaining === 100,
      `⑯e the free member reads 100 % remaining, KNOWN (${JSON.stringify(e.rem)})`);
    ok(e.verdicts.find((x) => x.id === 'NEW').v.usable === true,
      `⑯e …its verdict is usable (${JSON.stringify(e.verdicts.find((x) => x.id === 'NEW').v.reason)})`);
    ok(e.poolUsable && e.poolUsable.id === 'NEW',
      `⑯e …so the POOL has a usable member (${JSON.stringify(e.poolUsable && e.poolUsable.id)})`);
    ok((e.ranked.find((r) => r.id === 'NEW') || {}).eff === 100,
      `⑯e …it ranks on its real headroom, not on UNKNOWN_REMAINING_PCT (${JSON.stringify(e.ranked)})`);
    ok(e.dec && e.dec.to === 'NEW' && e.dec.reason === 'exhausted',
      `⑯e …and the pool LEAVES the exhausted member for it (${JSON.stringify({ to: e.dec && e.dec.to, why: e.dec && e.dec.reason })})`);

    // POSITIVE CONTROLS — B-8b12 is not re-opened by any of that.
    ok(e.dl === null,
      `⑯e POSITIVE CONTROL: the free member still has NO weekly deadline — a reset-less/sliding window may not be ranked on (${e.dl})`);
    ok(e.anchors.fiveHour === null && e.anchors.sevenDay === null,
      `⑯e POSITIVE CONTROL: …and neither bucket ANCHORS: the estimator learns from windows that ran, not from ones that never opened (${JSON.stringify(e.anchors)})`);
    ok(e.rems.length === 2 && e.rems.every((r) => r.remaining === 100 && r.resetsAt === 0),
      `⑯e POSITIVE CONTROL: …the report states the headroom and publishes NO reset, so nothing downstream can turn one into a blockedUntil (${JSON.stringify(e.rems)})`);
    // A bucket with NO number at all is still ignorance, not 100 %.
    {
      const dir = scratch();
      W.writeCacheObject({ cacheDir: dir, key: 'MUTE', obj: { fiveHour: { resetsAt: nowSec + 3600 }, fetchedAt: NOW }, measuredAt: NOW, source: 'cli-usage', backend: 'claude' });
      const mute = rd(dir, 'MUTE');
      ok(POOL.accountRemaining(mute, nowSec).known === false,
        `⑯e POSITIVE CONTROL: a bucket the vendor gave no number for is still UNKNOWN — the fix follows the STATED spend, it does not assume zero (${JSON.stringify(POOL.accountRemaining(mute, nowSec))})`);
    }
    // …and a genuinely SPENT account is still refused (the fix is a min, so a
    // 100 %-free bucket can never lift another bucket's exhaustion).
    ok(e.verdicts.find((x) => x.id === 'CUR').v.usable === false,
      `⑯e POSITIVE CONTROL: the exhausted member is still refused (${JSON.stringify(e.verdicts.find((x) => x.id === 'CUR').v.reason)})`);

    // WIRING PIN: the gate this leg models is the engine's, verbatim. If the
    // engine stops asking `usable === true`, the sentence above stops being
    // about the product.
    const engSrc = fs.readFileSync(path.join(ROOT, 'src/server/usage-pool-engine.js'), 'utf8');
    ok(engSrc.includes('const ok = verdicts.find((x) => x.v.usable === true);'),
      '⑯e WIRING PIN: the pool gate really is `verdicts.find((x) => x.v.usable === true)` — a member reading `usable:null` can never satisfy it');

    // THE MIGRATION, on the shape this instance actually holds. `usage-cache/
    // __global_codex__.json` is the measured B-8b12 file — the Spark limit
    // alone, both windows fresh — and running this branch's own backfill over a
    // copy of the real directory flipped exactly that one file (12 scanned /
    // 12 stamped / 31 limits / idempotent) from usable to "no usage data".
    // Driven here on the corpus's anonymised twin.
    {
      const dir = scratch();
      const legacy = { ...CODEXQ.normalizeCodexRateLimit(sparkAt(NOW), NOW), fetchedAt: NOW, source: 'codex-rate-limits' };
      fs.writeFileSync(path.join(dir, '__global_codex__.json'), JSON.stringify(legacy));
      const { backfillLimits } = require(path.join(ROOT, 'src/quota-model-migrate.js'));
      const res = backfillLimits({ cacheDir: dir, archiveDir: path.join(dir, 'archive'), id: 'test', log: () => { } });
      const after = rd(dir, '__global_codex__');
      ok(res.stamped === 1 && Array.isArray(after.limits),
        `⑯e MIGRATION: the backfill stamps the file (${JSON.stringify({ scanned: res.scanned, stamped: res.stamped, limits: res.limits })})`);
      ok(POOL.quotaVerdict(after, nowSec).usable === true && POOL.weeklyDeadline(after, nowSec) === null,
        `⑯e MIGRATION: …and the account it describes stays USABLE with no fabricated deadline (${JSON.stringify(POOL.quotaVerdict(after, nowSec).reason)})`);
      migAfter = after;
    }

    // NEGATIVE CONTROL: ask the DEADLINE predicate about the REMAINING again —
    // r3, with everything else on this branch intact.
    const wE = mutantWorld('e', [QMFILE, WFILE, CFILE, PFILE], {
      [QMFILE]: [['    for (const w of spendingWindows(l)) {', '    for (const w of countingWindows(l)) {']],
      [PFILE]: [['  if (!bucketStatesSpend(b)) return null;', '  if (!bucketCounts(b)) return null;']],
    });
    patchHit(wE, '⑯e restores the single predicate (the deadline rule asked about the remaining)');
    const POOLpre = load(wE, PFILE), QMpreE = load(wE, QMFILE);
    const preE = eWorld({ W: load(wE, WFILE), CAP: load(wE, CFILE), POOL: POOLpre });
    ok(preE.rem.known === false,
      `⑯e NEGATIVE CONTROL: the free member reads "no usage data" (${JSON.stringify(preE.rem)})`);
    ok(preE.verdicts.find((x) => x.id === 'NEW').v.usable === null && preE.poolUsable === null,
      `⑯e NEGATIVE CONTROL: …its verdict is ${JSON.stringify(preE.verdicts.find((x) => x.id === 'NEW').v.reason)}, so the POOL has no usable member at all`);
    ok((preE.ranked.find((r) => r.id === 'NEW') || {}).eff === POOLpre.UNKNOWN_REMAINING_PCT,
      `⑯e NEGATIVE CONTROL: …it ranks at UNKNOWN_REMAINING_PCT instead of 100 (${JSON.stringify(preE.ranked)})`);
    ok(preE.dec && preE.dec.to === null && preE.dec.reason === 'no-settleable',
      `⑯e NEGATIVE CONTROL: …and the pool STAYS on the exhausted member (${JSON.stringify({ to: preE.dec && preE.dec.to, why: preE.dec && preE.dec.reason, from: preE.dec && preE.dec.fromRemaining })})`);
    ok(POOLpre.quotaVerdict(migAfter, nowSec).usable === null,
      `⑯e NEGATIVE CONTROL: …and the migrated real-shape file goes dark too (${JSON.stringify(POOLpre.quotaVerdict(migAfter, nowSec).reason)})`);
    // The ACCESSOR half needs its own control: the pool reads the view today,
    // but `remaining()` is the path every migrated reader will take.
    const setE = W.limitsOfCache(e.caches.NEW, { identity: 'NEW' });
    ok(QM.remaining(setE, { nowSec }).remaining === 100 && QMpreE.remaining(setE, { nowSec }).known === false,
      `⑯e NEGATIVE CONTROL: …and the typed accessor moves with it (${JSON.stringify(QM.remaining(setE, { nowSec }))} vs ${JSON.stringify(QMpreE.remaining(setE, { nowSec }))})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑰ THE ROUND-4 DEFECTS: who MEASURED this limit, and who may RETIRE one.
//
// Both were found by an adversarial verifier against the round-3 branch and
// both were reproduced against a copy of this instance's own post-migration
// cache file before anything was changed. They share a root: `writeCacheObject`
// lifts a LEGACY object, and a legacy object is ONE reading spread over a
// carry-forward of everything else — the lift could not tell the halves apart,
// so it stamped the whole file with this producer's name and clock (⑰a) while
// `mergeLimitSets` let nobody ever say a limit was gone (⑰b).
//
// These legs drive the REAL producers through the REAL write path — the §17
// panel leg in test-readings-attribution feeds a HAND-BUILT `limits` array and
// never goes through the write path, which is exactly why 659 green asserts
// said nothing about either defect.
console.log('\n⑰ per-limit provenance and the right to retire a limit');
{
  // Same outside-the-tree copies as ⑯ (MUTC); `pathOf17` is how one world's
  // producer is re-pointed at ANOTHER world's patched write path.
  const nameOf17 = (tag, n) => `q17-${tag}-${path.basename(n, '.js')}`;
  const pathOf17 = (tag, n) => MUTC.pathFor(nameOf17(tag, n));
  const mutantWorld17 = (tag, names, patches) => {
    const out = {}, hits = [];
    for (const n of names) {
      let src = fs.readFileSync(path.join(ROOT, n), 'utf8');
      for (const other of names) {
        const rel = './' + path.basename(other);
        if (src.includes(`require('${rel}')`)) src = src.split(`require('${rel}')`).join(`require(${JSON.stringify(pathOf17(tag, other))})`);
      }
      for (const [from, to] of (patches[n] || [])) {
        hits.push([n, src.split(from).length - 1]);
        src = src.split(from).join(to);
      }
      out[n] = MUTC.write(n, src, null, { esm: false, name: nameOf17(tag, n) });
    }
    return { out, hits };
  };
  const load17 = (w, n) => require(w.out[n]);
  const hit17 = (w, label) => ok(w.hits.length > 0 && w.hits.every(([, c]) => c === 1),
    `⑰ NEGATIVE CONTROL setup: ${label} — every patch anchor hit exactly once (${JSON.stringify(w.hits)})`);

  const WF = 'src/usage-cache-write.js', QF = 'src/quota-model.js', CF = 'src/rate-limit-capture.js';
  const CAP17 = require(path.join(ROOT, 'src/rate-limit-capture.js'));
  const SRC = require(path.join(ROOT, 'src/lib/usage-source.js'));

  const T17 = 1788974610137;                 // the real file's own fetchedAt
  const OVER_AT = 1788911228197;             // …and its overage limit's own asOf
  const NOW17 = T17 + 607363;                // the event, ~10 min later

  // THE REAL SHAPE, verbatim from this instance's `usage-cache/sub-*.json`
  // (anonymised: the org/email fields are dropped, no ids, no tokens). Three
  // limits after the backfill — plan, the Fable model cap, and overage — each
  // with its own producer and its own age.
  const realShape = () => ({
    fiveHour: { utilization: 0 },
    sevenDay: { utilization: 0.83, resetsAt: 1789318800 },
    scopedWeekly: [{ name: 'Fable', utilization: 1, resetsAt: 1789318800 }],
    overallStatus: 'allowed',
    fetchedAt: T17, source: 'on-demand', scopedFetchedAt: T17 + 2,
    overage: { inUse: false, asOf: OVER_AT, status: 'rejected', disabledReason: 'org_level_disabled' },
  });

  /** Migrate the real-shape file into a dir, then fire ONE five-hour
   *  rate_limit_event through the REAL producer. `Wm`/`Cm` let a control swap
   *  in a patched copy of the write path / the producer. */
  const runEvent = (Wm, Cm) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm17-${process.pid}-`));
    const key = 'sub-anon';
    // the migration's own stamping rung, driven through the write path under test
    const set0 = Wm.liftCacheObject(realShape(), { identity: key, familyOf: familyOfScopedBucket });
    Wm.writeCacheObject({ cacheDir: dir, key, obj: realShape(), set: set0, replace: true, familyOf: familyOfScopedBucket, source: 'on-demand' });
    const before = Wm.readCacheObject(dir, key);
    Cm.captureRateLimitEvent({
      cacheDir: dir, key, identityIds: [key], now: NOW17, familyOf: familyOfScopedBucket,
      ev: { kind: 'fiveHour', rawType: 'five_hour', status: 'allowed', utilization: 0.88, resetsAt: 0, overage: {} },
    });
    return { dir, key, before, after: Wm.readCacheObject(dir, key) };
  };
  const limOf = (obj, id) => (obj.limits || []).find((l) => l && l.limitId === id) || null;

  // ── ⑰a a limit this write only CARRIED FORWARD keeps its own producer ──────
  {
    const r = runEvent(W, CAP17);
    const b = { plan: limOf(r.before, 'plan'), fable: limOf(r.before, 'model:fable'), over: limOf(r.before, 'overage') };
    ok(b.plan && b.fable && b.over && b.fable.source === 'on-demand' && b.fable.fetchedAt === T17,
      `⑰a the migrated real-shape file holds three limits, each with its own producer (${(r.before.limits || []).map((l) => `${l.limitId}:${l.source}@${l.fetchedAt}`).join(' | ')})`);

    const a = { plan: limOf(r.after, 'plan'), fable: limOf(r.after, 'model:fable'), over: limOf(r.after, 'overage') };
    ok(a.plan.source === 'rate-limit-event' && a.plan.fetchedAt === NOW17,
      `⑰a the PLAN limit — the one this event measured — is re-stamped with the producer and its clock (${a.plan.source}@${a.plan.fetchedAt})`);
    const w5 = QM.windowOfKind(a.plan, '5h');
    ok(w5 && w5.usedPct === 88 && w5.measuredAt === NOW17,
      `⑰a …and the reading LANDED (5h ${w5 && w5.usedPct}% measured at ${w5 && w5.measuredAt})`);
    ok(a.fable.source === 'on-demand' && a.fable.fetchedAt === T17,
      `⑰a the model-scoped cap — which this record says NOTHING about — keeps the producer that measured it (${a.fable.source}@${a.fable.fetchedAt})`);
    const wf = QM.windowOfKind(a.fable, '7d');
    ok(wf && wf.measuredAt === T17 && wf.usedPct === 100,
      `⑰a …down to the instant its window was measured (${wf && wf.measuredAt}, still ${wf && wf.usedPct}%)`);
    ok(a.over.source === 'on-demand' && a.over.fetchedAt === OVER_AT,
      `⑰a the overage limit likewise (${a.over.source}@${a.over.fetchedAt})`);
    // The 7d window of the plan limit was carried forward INSIDE a limit this
    // event did measure: the limit is the producer's, the untouched window is
    // still the panel-read's.
    const w7 = QM.windowOfKind(a.plan, '7d');
    ok(w7 && w7.usedPct === 83 && w7.measuredAt === T17,
      `⑰a a window carried forward inside a MEASURED limit keeps its own measuredAt too (7d ${w7 && w7.usedPct}% @${w7 && w7.measuredAt})`);

    // THE USER-VISIBLE HALF: the panel rows this feature added.
    const rows = SRC.limitRows(QM, W.limitsOfCache(r.after, { identity: r.key }), { t: (s) => s });
    const rowF = rows.find((x) => x.limitId === 'model:fable');
    ok(rowF && rowF.source === 'on-demand' && rowF.fetchedAt === T17,
      `⑰a …so the panel row says "via ${rowF && rowF.sourceLabel}" and dates it ${rowF && rowF.fetchedAt}, not "just now"`);

    // NEGATIVE CONTROL: the round-3 write path, which lifted the whole object.
    const wA = mutantWorld17('a', [WF, QF], {
      [WF]: [['    next = carryUnmeasuredLimits(prevSet, next);\n', '']],
    });
    hit17(wA, '⑰a removes the carried-forward rule');
    const CAPa = mutantWorld17('ac', [CF], { [CF]: [["require('./usage-cache-write.js')", `require(${JSON.stringify(pathOf17('a', WF))})`]] });
    hit17(CAPa, '⑰a re-points the real producer at the patched write path');
    const pre = runEvent(load17(wA, WF), load17(CAPa, CF));
    const pf = limOf(pre.after, 'model:fable'), po = limOf(pre.after, 'overage');
    ok(pf.source === 'rate-limit-event' && pf.fetchedAt === NOW17,
      `⑰a NEGATIVE CONTROL: the pre-fix path stamps the Fable cap as this producer's, just now (${pf.source}@${pf.fetchedAt})`);
    ok(QM.windowOfKind(pf, '7d').measuredAt === NOW17,
      `⑰a NEGATIVE CONTROL: …and moves the window's measuredAt onto a number nobody re-measured (${QM.windowOfKind(pf, '7d').measuredAt})`);
    ok(po.source === 'rate-limit-event',
      `⑰a NEGATIVE CONTROL: …and the overage limit too (${po.source})`);
    const preRows = SRC.limitRows(QM, load17(wA, WF).limitsOfCache(pre.after, { identity: pre.key }), { t: (s) => s });
    ok((preRows.find((x) => x.limitId === 'model:fable') || {}).fetchedAt === NOW17,
      '⑰a NEGATIVE CONTROL: …which is the sentence the panel row printed');

    // SECOND NEGATIVE CONTROL, ONE MECHANISM: keep the rule but resolve it per
    // LIMIT instead of per WINDOW (this fix's own round-1 shape). Everything
    // above stays green — only the carried-forward 7-day window inside the
    // MEASURED plan limit moves, which is why it needs its own control.
    const wW = mutantWorld17('w', [WF, QF], {
      [WF]: [['    for (const w of quotaModel.windowsOf(prev)) if (w) prevByKind.set(w.kind, w);\n', '']],
    });
    hit17(wW, '⑰a resolves the rule per LIMIT instead of per WINDOW');
    const CAPw = mutantWorld17('wc', [CF], { [CF]: [["require('./usage-cache-write.js')", `require(${JSON.stringify(pathOf17('w', WF))})`]] });
    hit17(CAPw, '⑰a re-points the real producer at the per-limit copy');
    const preW = runEvent(load17(wW, WF), load17(CAPw, CF));
    const pwPlan = limOf(preW.after, 'plan'), pwFable = limOf(preW.after, 'model:fable');
    ok(QM.windowOfKind(pwPlan, '7d').measuredAt === NOW17 && QM.windowOfKind(pwPlan, '7d').usedPct === 83,
      `⑰a NEGATIVE CONTROL: per-LIMIT granularity re-clocks the 7-day number this event never mentioned (@${QM.windowOfKind(pwPlan, '7d').measuredAt})`);
    ok(pwFable.source === 'on-demand' && pwFable.fetchedAt === T17,
      '⑰a NEGATIVE CONTROL: …while the wholly-untouched limits are unaffected, so only the window leg can catch it');
  }

  // ── ⑰b only a producer that ENUMERATED may retire a limit ─────────────────
  {
    const POOL17 = require(path.join(ROOT, 'src/account-pool-auto.js'));
    const nowSec = Math.floor(Date.now() / 1000);
    const now = nowSec * 1000;
    const panel = (scoped, at) => ({
      fiveHour: { utilization: 0.2, resetsAt: nowSec + 3600 },
      sevenDay: { utilization: 0.2, resetsAt: nowSec + 500000 },
      scopedWeekly: scoped, fetchedAt: at, source: 'on-demand',
    });
    const TWO = [{ name: 'OldModel', utilization: 1, resetsAt: nowSec + 300 }, { name: 'Fable', utilization: 0.1, resetsAt: nowSec + 500000 }];
    const ONE = [{ name: 'Fable', utilization: 0.1, resetsAt: nowSec + 500000 }];

    /** Two panel reads: the first lists two model caps, the second lists only
     *  one — the shape a cap retirement/rename produces. */
    const runPanel = (Wm, { authoritative = true } = {}) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm17b-${process.pid}-`));
      const key = 'acct';
      const one = (scoped, at) => Wm.writeCacheObject({
        cacheDir: dir, key, obj: panel(scoped, at), measuredAt: at, source: 'on-demand',
        familyOf: familyOfScopedBucket, backend: 'claude',
        authoritativeScopes: authoritative && scoped.length ? ['model'] : null,
      });
      one(TWO, now);
      const mid = Wm.readCacheObject(dir, key);
      one(ONE, now + 1000);
      return { dir, key, mid, after: Wm.readCacheObject(dir, key) };
    };

    const r = runPanel(W);
    ok(POOL17.accountRemaining(r.mid, nowSec).remaining === 0,
      `⑰b with BOTH caps reported, the exhausted one governs the account (${JSON.stringify(POOL17.accountRemaining(r.mid, nowSec))})`);
    ok(!limOf(r.after, 'model:oldmodel') && !!limOf(r.after, 'model:fable'),
      `⑰b the next panel read names only one cap, and the one it dropped is RETIRED (${(r.after.limits || []).map((l) => l.limitId).join(',')})`);
    ok((r.after.scopedWeekly || []).length === 1 && r.after.scopedWeekly[0].name === 'Fable',
      `⑰b …the derived view follows (${JSON.stringify(r.after.scopedWeekly)})`);
    const rem = POOL17.accountRemaining(r.after, nowSec);
    ok(rem.remaining === 80 && rem.known === true,
      `⑰b …and the pool follows the LIVE reading (${JSON.stringify(rem)}) — which is what the base commit answered`);

    // NEGATIVE CONTROL 1: the round-3 merge, which kept every prev limitId.
    const wB = mutantWorld17('b', [WF, QF], {
      [WF]: [['  const base = replace ? prevSet : retireUnnamedScopes(prevSet, next, authoritativeScopes, { key, source: source || (obj && obj.source) || null });',
        '  const base = prevSet;']],
    });
    hit17(wB, '⑰b removes the retirement');
    const preB = runPanel(load17(wB, WF));
    ok(!!limOf(preB.after, 'model:oldmodel'),
      `⑰b NEGATIVE CONTROL: the pre-fix merge resurrects the retired cap (${(preB.after.limits || []).map((l) => l.limitId).join(',')})`);
    ok(POOL17.accountRemaining(preB.after, nowSec).remaining === 0,
      `⑰b NEGATIVE CONTROL: …at 0 %, so the pool excludes a member whose live reading says 80 (${JSON.stringify(POOL17.accountRemaining(preB.after, nowSec))})`);

    // POSITIVE CONTROL: a producer that did NOT enumerate must never retire.
    // (The statusline writes `scopedWeekly: prev.scopedWeekly` and the
    // rate_limit_event knows about one bucket — both carry the set forward.)
    const rNo = runPanel(W, { authoritative: false });
    ok(!!limOf(rNo.after, 'model:oldmodel'),
      `⑰b POSITIVE CONTROL: without the producer's own claim, the cap is carried forward as before (${(rNo.after.limits || []).map((l) => l.limitId).join(',')})`);
    // …and the same holds for a REAL non-enumerating producer on a live file.
    const dirS = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm17s-${process.pid}-`));
    W.writeCacheObject({ cacheDir: dirS, key: 'acct', obj: panel(TWO, now), measuredAt: now, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude', authoritativeScopes: ['model'] });
    CAP17.captureRateLimitEvent({
      cacheDir: dirS, key: 'acct', identityIds: ['acct'], now: now + 1000, familyOf: familyOfScopedBucket,
      ev: { kind: 'fiveHour', rawType: 'five_hour', status: 'allowed', utilization: 0.5, resetsAt: 0, overage: {} },
    });
    const afterEv = W.readCacheObject(dirS, 'acct');
    ok(!!limOf(afterEv, 'model:oldmodel') && !!limOf(afterEv, 'model:fable'),
      `⑰b POSITIVE CONTROL: a real rate_limit_event retires nothing (${(afterEv.limits || []).map((l) => l.limitId).join(',')})`);

    // WIRING PIN: a pure rule with no call site is the 2.355.0 class. Only the
    // producers whose OWN parse enumerates may pass it, and each must gate on
    // that parse — never on the preserve-merged object.
    const routes = fs.readFileSync(path.join(ROOT, 'src/usage-routes.js'), 'utf8');
    const engine = fs.readFileSync(path.join(ROOT, 'src/server/usage-pool-engine.js'), 'utf8');
    const sites = (routes.match(/authoritativeScopes:/g) || []).length + (engine.match(/authoritativeScopes:/g) || []).length;
    // The count is a PIN, not trivia: five ⟳ legs in usage-routes (the local
    // panel, the two host-per-account legs, the two host-global legs) plus the
    // bare-token ⟳ and the engine's control-channel probe. A seventh site is a
    // new claim of authority and must be looked at.
    ok(sites === 7, `⑰b WIRING PIN: exactly seven enumerating producers pass it (found ${sites})`);
    ok(!/authoritativeScopes:\s*\[/.test(routes) && !/authoritativeScopes:\s*\[/.test(engine),
      '⑰b WIRING PIN: …every one of them GATES on its own parse, never unconditionally');
    // r6: the gate is the ONE pure rule, asked of the PARSE. A hand-spelled
    // `scopedWeekly?.length` is a fact about the array — it says a model cap was
    // seen, never that all of them were — and that is the whole of §⑱.
    const gateRe = /authoritativeScopes: (?:quotaModel\.)?authoritativeScopesOf\((cliPanel|u|parsed)\)/g;
    const gates = [...routes.matchAll(gateRe), ...engine.matchAll(gateRe)].map((m) => m[1]);
    ok(gates.length === sites,
      `⑰b WIRING PIN: …through the ONE rule, asked of THIS read's own parse (${gates.length}/${sites}: ${[...new Set(gates)].join(', ')})`);
    ok(!/scopedWeekly\?\.length \? \['model'\]/.test(routes) && !/scopedWeekly\?\.length \? \['model'\]/.test(engine),
      '⑰b WIRING PIN: …and no site re-spells the rule as "the array is non-empty" (the r5 shape §⑱ reproduces)');
    const capture = fs.readFileSync(path.join(ROOT, 'src/rate-limit-capture.js'), 'utf8');
    const statusline = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-usage'), 'utf8');
    ok(!capture.includes('authoritativeScopes') && !statusline.includes('authoritativeScopes')
      && !/authoritativeScopes/.test(fs.readFileSync(path.join(ROOT, 'src/quota-model-migrate.js'), 'utf8')),
      '⑰b WIRING PIN: …and the single-bucket producers, the statusline and the migration never claim it');
  }

  // ── ⑰c the claim key is about NUMBERS, never about clocks ─────────────────
  {
    const w = { kind: '7d', minutes: 10080, usedPct: 83, resetsAt: 1789318800, measuredAt: 1, state: 'running' };
    ok(QM.windowClaimKey(w) === QM.windowClaimKey({ ...w, measuredAt: 999, state: 'empty' }),
      '⑰c the same numbers under a different clock and a different derived verdict are ONE claim');
    ok(QM.windowClaimKey(w) !== QM.windowClaimKey({ ...w, usedPct: 84 })
      && QM.windowClaimKey(w) !== QM.windowClaimKey({ ...w, resetsAt: 1789318801 })
      && QM.windowClaimKey(w) !== QM.windowClaimKey({ ...w, status: 'limited' }),
      '⑰c …and any number the vendor stated moving makes it a different one');
    const L = (over) => QM.makeLimit({ limitId: 'overage', scope: 'overage', flags: { inUse: false, asOf: over }, windows: [] });
    ok(QM.sameLimitClaim(L(1), L(1)) && !QM.sameLimitClaim(L(1), L(2)),
      '⑰c a windowless limit is compared on its FLAGS (the overage limit states nothing else)');
    ok(QM.sameLimitClaim(QM.makeLimit({ limitId: 'p', windows: [w, { ...w, kind: '5h' }] }),
      QM.makeLimit({ limitId: 'p', windows: [{ ...w, kind: '5h' }, w] })),
      '⑰c window order is not a claim');
  }
}

// ── ⑱ THE RIGHT TO RETIRE BELONGS TO A PARSE THAT SAW THE WHOLE SET (r6) ────
//
// r5 gave a producer the right to RETIRE a model cap the file holds and this
// read did not name, gated on `u.scopedWeekly?.length` — a fact about the
// ARRAY. Seven call sites, three different parsers, and they do not agree on
// one vendor state: six of the seven ran a parser that silently drops a named
// cap stated without a `resets_at`, so an enumerating write retired a REAL,
// SPENT cap and `accountRemaining` went 0 → 80. That is inc-msof8i22 re-opened
// by the mechanism built to end its mirror image.
console.log('\n⑱ only a parse that ENUMERATED may retire a limit (r6)');
{
  /** A patched copy, written OUTSIDE the tree (MUTC) with its `require`
   *  re-bound to the real module's path — its `../` requires resolve exactly as
   *  a sibling's did. Returns {path, hits} so the patch can be asserted to hit.
   *  Every copy gets its OWN file name: `require` caches by path, so two
   *  mutants of the same source under one name would make the second `require`
   *  return the FIRST mutant (⑱g's pre-fix control once read ⑱f's that way). */
  const mutantBeside = (rel, patches) => {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const hits = [];
    for (const [from, to] of patches) { hits.push(src.split(from).length - 1); src = src.split(from).join(to); }
    return { path: MUTC.write(rel, src, 'q18', { esm: false }), hits };
  };
  const hit18 = (m, label) => ok(m.hits.length > 0 && m.hits.every((c) => c === 1),
    `⑱ NEGATIVE CONTROL setup: ${label} — every patch anchor hit exactly once (${JSON.stringify(m.hits)})`);

  // ⑱0 (r6) used to ask git whether every in-tree mutant path was IGNORED. A
  // gitignored copy is still a file in src/ that a scanning suite reads as
  // source, so the copies moved out of the tree instead (batch r1); ⑲' at the
  // end of the suite measures that while they exist.

  const CQ = require(path.join(ROOT, 'src/harnesses/claude-quota.js'));
  const { ClaudeCodeAdapter: ADP } = require(path.join(ROOT, 'src/adapters/claude-code.js'));
  const POOL18 = require(path.join(ROOT, 'src/account-pool-auto.js'));

  // ONE VENDOR STATE, three wire formats. Plan 20 %/20 %, a Fable cap at 10 %
  // with a reset, and an OPUS CAP AT 100 % STATED WITHOUT A RESET — the shape
  // 2.305.0 found in a real payload, in the form this instance's own anchors
  // say is routine: 704 of 5631 scoped readings and 615 of 7978 seven-day
  // readings carry no reset at all (692 of the scoped ones produced by the ⟳
  // panel, 3 by the control channel's own array branch). Honest boundary: every
  // reset-less bucket ever recorded HERE sits at u=0, so the exact combination
  // is latent on this instance, not live.
  const nowSec18 = Math.floor(Date.now() / 1000);
  const R5x = nowSec18 + 3600, R7x = nowSec18 + 400000;
  const ISO = (s) => new Date(s * 1000).toISOString();
  const PANEL_TEXT = [
    'Current session: 20% used · resets Aug 12, 12:20am (America/Los_Angeles)',
    'Current week (all models): 20% used · resets Aug 15, 12:20am (America/Los_Angeles)',
    'Current week (Fable): 10% used · resets Aug 15, 12:20am (America/Los_Angeles)',
    'Current week (Opus): 100% used',
  ].join('\n');
  const OAUTH = () => ({
    five_hour: { utilization: 20, resets_at: ISO(R5x) }, seven_day: { utilization: 20, resets_at: ISO(R7x) },
    limits: [{ kind: 'weekly_scoped', scope: { model: { display_name: 'Fable' } }, percent: 10, resets_at: ISO(R7x) }],
    seven_day_opus: { utilization: 100 },
  });
  const CTRL = () => ({ rate_limits: {
    five_hour: { utilization: 20, resets_at: R5x }, seven_day: { utilization: 20, resets_at: R7x },
    model_scoped: [{ display_name: 'Fable', utilization: 10, resets_at: R7x }],
    seven_day_opus: { utilization: 100 },
  } });
  const idsOf = (u) => u ? QM.limitsOf(QM.fromLegacy({ ...u, fetchedAt: Date.now() }, {
    identity: 'k', limitId: 'plan', familyOf: familyOfScopedBucket, extraKeys: CLAUDEQ.CLAUDE_EXTRA_KEYS, source: 'x', fetchedAt: Date.now(),
  })).map((l) => l.limitId).sort() : null;

  // ── ⑱a the three enumerating parsers agree on ONE vendor state ────────────
  {
    const a = idsOf(CQ.parseCliUsageText(PANEL_TEXT, Date.now()));
    const b = idsOf(CQ.parseOAuthUsage(OAUTH()));
    const c = idsOf(ADP.parseGetUsageResponse(CTRL()));
    eq(a, ['model:fable', 'model:opus', 'plan'], '⑱a the ⟳ panel parse sees plan + both model caps');
    ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c),
      `⑱a …and so do the OAuth and control parses (${JSON.stringify(b)} / ${JSON.stringify(c)})`);
    ok(CQ.parseOAuthUsage(OAUTH()).scopedWeekly.find((x) => x.name === 'Opus')?.utilization === 1,
      '⑱a …with the SPENT number intact (a bucket with no reset is still a bucket)');

    // NEGATIVE CONTROL: today's `!resets_at` skips, restored one at a time.
    const mq = mutantBeside('src/harnesses/claude-quota.js',
      [['if (pctRaw == null) { dropped++; continue; } // shaped like a weekly bucket, states no number we can read',
        'if (pctRaw == null || !v.resets_at) continue;']]);
    hit18(mq, '⑱a restores the OAuth parser\'s reset requirement');
    const ma = mutantBeside('src/adapters/claude-code.js',
      [['        if (typeof v.utilization !== \'number\' && typeof v.used_percentage !== \'number\') {\n          if (WINDOWISH.some((f) => f in v)) dropped++;\n          continue;\n        }',
        '        if (typeof v.utilization !== \'number\' && typeof v.used_percentage !== \'number\') continue;\n        if (!v.resets_at) continue;']]);
    hit18(ma, '⑱a restores the control parser\'s reset requirement');
    const preB = idsOf(require(mq.path).parseOAuthUsage(OAUTH()));
    const preC = idsOf(require(ma.path).ClaudeCodeAdapter.parseGetUsageResponse(CTRL()));
    eq(preB, ['model:fable', 'plan'], '⑱a NEGATIVE CONTROL: the pre-fix OAuth parse loses the spent cap');
    eq(preC, ['model:fable', 'plan'], '⑱a NEGATIVE CONTROL: …and so does the pre-fix control parse');
    ok(JSON.stringify(a) !== JSON.stringify(preB),
      '⑱a NEGATIVE CONTROL: …i.e. two parsers disagreed with the third about the SAME account');
  }

  // ── ⑱b end-to-end: a producer that could not see the cap must not retire it ─
  {
    /** The ⟳ ladder as it really runs: the CLI-panel rung writes first (it is
     *  the only parser that saw the cap), then a later rung re-reads the same
     *  vendor state through the OAuth parse and writes the SAME key. `gate` is
     *  the call-site expression, which the ⑰b WIRING PIN keeps honest. */
    const runLadder = (Wm, parseOAuth, gate) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm18-${process.pid}-`));
      tmpDirs.push(dir);
      const key = 'acct';
      const panel = CQ.parseCliUsageText(PANEL_TEXT, Date.now());
      const u1 = { ...panel, source: 'on-demand', scopedFetchedAt: Date.now() };
      Wm.writeCacheObject({ cacheDir: dir, key, obj: u1, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude',
        authoritativeScopes: gate(panel) });
      const mid = Wm.readCacheObject(dir, key);
      const u2 = parseOAuth(OAUTH());
      u2.source = 'on-demand';
      Wm.writeCacheObject({ cacheDir: dir, key, obj: u2, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude',
        authoritativeScopes: gate(u2) });
      return { dir, key, mid, after: Wm.readCacheObject(dir, key) };
    };
    const idsIn = (o) => (o.limits || []).map((l) => l.limitId).sort();

    const r = runLadder(W, CQ.parseOAuthUsage, QM.authoritativeScopesOf);
    eq(idsIn(r.mid), ['model:fable', 'model:opus', 'plan'], '⑱b the panel read establishes both model caps');
    ok(POOL18.accountRemaining(r.mid, nowSec18).remaining === 0,
      `⑱b …and the spent one governs the account (${JSON.stringify(POOL18.accountRemaining(r.mid, nowSec18))})`);
    eq(idsIn(r.after), ['model:fable', 'model:opus', 'plan'], '⑱b a later rung re-reads the same state and the cap SURVIVES');
    const rem = POOL18.accountRemaining(r.after, nowSec18);
    ok(rem.remaining === 0 && rem.known === true,
      `⑱b …so the pool still sees a spent account (${JSON.stringify(rem)})`);

    // NEGATIVE CONTROL: the pre-fix world — the parser that drops the cap, and
    // r5's gate ("the array is non-empty"). This is the verifier's reproduction,
    // driven through the real write path and the real pool accessor.
    const mq2 = mutantBeside('src/harnesses/claude-quota.js',
      [['if (pctRaw == null) { dropped++; continue; } // shaped like a weekly bucket, states no number we can read',
        'if (pctRaw == null || !v.resets_at) continue;']]);
    hit18(mq2, '⑱b restores the pre-fix OAuth parser');
    const r5gate = (u) => (u.scopedWeekly?.length ? ['model'] : null); // the r5 call-site expression, verbatim
    const pre = runLadder(W, require(mq2.path).parseOAuthUsage, r5gate);
    eq(idsIn(pre.mid), ['model:fable', 'model:opus', 'plan'], '⑱b NEGATIVE CONTROL: the panel read still establishes both caps');
    eq(idsIn(pre.after), ['model:fable', 'plan'],
      '⑱b NEGATIVE CONTROL: …and the read that could never have SEEN the spent cap retires it');
    const preRem = POOL18.accountRemaining(pre.after, nowSec18);
    ok(preRem.remaining === 80 && preRem.known === true,
      `⑱b NEGATIVE CONTROL: …so the pool reads 80 % free on an account whose Opus is gone (${JSON.stringify(preRem)}) — inc-msof8i22`);

    // …and ONE mechanism at a time: the r5 GATE alone, with the FIXED parser,
    // retires nothing (the parser half is what made the gate lethal).
    const half = runLadder(W, CQ.parseOAuthUsage, r5gate);
    eq(idsIn(half.after), ['model:fable', 'model:opus', 'plan'],
      '⑱b CONTROL: with the parser fixed, even the r5 gate has nothing to retire');
  }

  // ── ⑱c the claim is FALSIFIABLE: a parse that dropped something claims none ─
  {
    const scoped = QM.authoritativeScopesOf;
    ok(JSON.stringify(scoped(CQ.parseOAuthUsage(OAUTH()))) === '["model"]', '⑱c a clean OAuth parse claims the model scope');
    const noName = OAUTH(); noName.limits.push({ kind: 'weekly_scoped', scope: {}, percent: 50, resets_at: ISO(R7x) });
    ok(scoped(CQ.parseOAuthUsage(noName)) === null,
      '⑱c a weekly_scoped entry it could not NAME costs the claim (the cap is real, we just cannot key it)');
    const noNum = OAUTH(); noNum.seven_day_zebra = { resets_at: ISO(R7x) };
    ok(scoped(CQ.parseOAuthUsage(noNum)) === null,
      '⑱c …as does a bucket-shaped field it could not read a number from');
    const nulls = OAUTH(); nulls.seven_day_sonnet = null; nulls.seven_day_oauth_apps = null;
    ok(JSON.stringify(scoped(CQ.parseOAuthUsage(nulls))) === '["model"]',
      '⑱c …but a NULL field is the vendor saying "no such limit", not a drop');

    ok(JSON.stringify(scoped(ADP.parseGetUsageResponse(CTRL()))) === '["model"]', '⑱c a clean control parse claims it');
    const cNoName = CTRL(); cNoName.rate_limits.model_scoped.push({ utilization: 50, resets_at: R7x });
    ok(scoped(ADP.parseGetUsageResponse(cNoName)) === null, '⑱c …and an unnameable model_scoped entry costs it');
    const cNoNum = CTRL(); cNoNum.rate_limits.nimbus_quill = { resets_at: null, percent: null };
    ok(scoped(ADP.parseGetUsageResponse(cNoNum)) === null, '⑱c …as does a window-shaped field with no readable number');
    const cOther = CTRL(); cOther.rate_limits.some_flag = { enabled: true };
    ok(JSON.stringify(scoped(ADP.parseGetUsageResponse(cOther))) === '["model"]',
      '⑱c …while an object that is not window-shaped at all is not a bucket and not a drop');

    ok(JSON.stringify(scoped(CQ.parseCliUsageText(PANEL_TEXT, Date.now()))) === '["model"]', '⑱c a clean panel parse claims it');
    const drift = PANEL_TEXT + '\nCurrent week (Zebra): unavailable';
    ok(scoped(CQ.parseCliUsageText(drift, Date.now())) === null,
      '⑱c …and a `Current week (…)` line its own regex could not read costs the claim (format drift ⇒ no retirement)');

    // The r5 half, kept on purpose: an EMPTY list still states nothing.
    const noScoped = CQ.parseCliUsageText('Current session: 20% used\nCurrent week (all models): 20% used', Date.now());
    ok(QM.scopedEnumeration(noScoped) === true && scoped(noScoped) === null,
      '⑱c an enumerated but EMPTY list claims nothing — indistinguishable from a broken parse, and retiring a spent cap is the money-losing direction');
  }

  // ── ⑱d the claim is a fact about ONE READ: never stored, never forgeable ───
  {
    const parse = CQ.parseOAuthUsage(OAUTH());
    ok(QM.scopedEnumeration(parse) === true, '⑱d the parse itself carries the claim');
    ok(QM.authoritativeScopesOf(JSON.parse(JSON.stringify(parse))) === null,
      '⑱d a JSON round trip loses it (a device wire, a cache file — every one of them fails SAFE)');
    ok(QM.authoritativeScopesOf({ ...parse }) === null,
      '⑱d a spread loses it (which is why the panel call site asks `cliPanel`, not the `{...cliPanel}` it writes)');
    ok(QM.authoritativeScopesOf({ ...parse, scopedComplete: true }) === null,
      '⑱d and a STORED object cannot forge it — the mark is symbol-keyed, so no JSON can express it');
    ok(Object.keys(parse).indexOf('scopedComplete') === -1 && !JSON.stringify(parse).includes('scopedComplete'),
      '⑱d …nor does it ever reach a payload we serialize');
    // The POSITIVE twin, and four of the seven call sites depend on it: the
    // host/token legs mutate the parse in place (`u.source = …`,
    // `Object.assign(u, org)` in `_fetchOAuthRoles`/`_consumeDeviceQuota`) and
    // then gate on `u`. Mutation keeps the object, so it keeps the claim.
    const mutated = CQ.parseOAuthUsage(OAUTH());
    mutated.source = 'on-demand'; Object.assign(mutated, { orgUuid: 'o', scopedFetchedAt: Date.now() });
    ok(JSON.stringify(QM.authoritativeScopesOf(mutated)) === '["model"]',
      '⑱d …while mutating the parse in place (what the token and host legs do) keeps it — the object is the same object');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm18d-${process.pid}-`));
    tmpDirs.push(dir);
    W.writeCacheObject({ cacheDir: dir, key: 'acct', obj: parse, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude',
      authoritativeScopes: QM.authoritativeScopesOf(parse) });
    ok(!fs.readFileSync(W.cacheFileFor(dir, 'acct'), 'utf8').includes('scopedComplete'),
      '⑱d …and the file this write persists carries no trace of it');
  }

  // ── ⑱f THE PANEL PRODUCER'S AUTHORITY, DRIVEN END TO END ──────────────────
  //
  // WHY A FUNCTIONAL LEG AND NOT ANOTHER PIN. The r5 WIRING PIN asserts that
  // each of the seven sites gates on a variable — and the panel site is the one
  // whose parse result and whose WRITE PAYLOAD are different objects
  // (`u = {...cliPanel, …}`). Since the enumeration mark is deliberately
  // non-enumerable, asking `u` instead of `cliPanel` silently answers "no
  // authority" for ever: the retirement dies at the one producer that most
  // deserves it, no test goes red, and the r5 feature becomes a guard that
  // cannot fire. Mutation-tested: swapping the argument reddens NOTHING else in
  // this suite. So this leg runs the REAL `refreshViaCliPanel` through the REAL
  // setupUsage factory with a FAKE `claude` on CLAUDE_CMD (zero vendor cost,
  // real execFile, real parse, real write path) and reads the CONSEQUENCE.
  {
    const { AccountManager } = require(path.join(ROOT, 'src/accounts.js'));
    const usageMod = require(path.join(ROOT, 'src/usage-routes.js'));
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const at = (ms) => { const d = new Date(Date.now() + ms); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCHours() % 12 || 12}${d.getUTCHours() < 12 ? 'am' : 'pm'} (UTC)`; };
    const panelText = (caps) => `Current session: 20% used · resets ${at(3 * 3600e3)}\n`
      + `Current week (all models): 20% used · resets ${at(3 * 86400e3)}\n`
      + caps.map((c) => `Current week (${c.name}): ${c.pct}% used · resets ${at(3 * 86400e3)}\n`).join('');

    const mkPanelWorld = (usageModule) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm18f-${process.pid}-`));
      tmpDirs.push(root);
      const dataDir = path.join(root, 'data');
      const am = new AccountManager({ dataDir });
      const id = am.createSubscription({ name: 'Panel Acct' }).id;
      fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: {
        accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 29 * 86400e3, subscriptionType: 'max',
      } }), { mode: 0o600 });
      const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
      const bin = path.join(root, 'fake-claude');
      const say = (caps) => fs.writeFileSync(bin, `#!/bin/sh\ncat <<'EOF'\n${panelText(caps)}EOF\n`, { mode: 0o755 });
      say([]);
      const u = usageModule.setupUsage({
        app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} },
        accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(),
        serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
        USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir,
        CODEX_SESSIONS_DIR: path.join(root, 'codex-sessions'), META_DIR: path.join(dataDir, 'session-meta'),
        AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'session-buffers'),
        probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: bin,
      });
      const readBack = () => W.readCacheObject(cacheDir, id);
      return { root, am, id, cacheDir, u, say, readBack };
    };

    const TWO_CAPS = [{ name: 'OldModel', pct: 100 }, { name: 'Fable', pct: 10 }];
    const ONE_CAP = [{ name: 'Fable', pct: 10 }];
    const runPanels = async (w) => {
      w.say(TWO_CAPS); const ok1 = await w.u.refreshViaCliPanel(w.id);
      const mid = w.readBack();
      w.say(ONE_CAP); const ok2 = await w.u.refreshViaCliPanel(w.id);
      return { ok1, ok2, mid, after: w.readBack() };
    };
    const idsIn = (o) => (o && o.limits || []).map((l) => l.limitId).sort();

    const w = mkPanelWorld(usageMod);
    const r = await runPanels(w);
    ok(r.ok1 === true && r.ok2 === true, `⑱f both panel reads landed through the real refresher (${r.ok1}/${r.ok2})`);
    eq(idsIn(r.mid), ['model:fable', 'model:oldmodel', 'plan'], '⑱f the first panel establishes both model caps');
    eq(idsIn(r.after), ['model:fable', 'plan'],
      '⑱f the second panel enumerates one and the cap it no longer reports is RETIRED — the r5 feature, proven at its call site');

    // NEGATIVE CONTROL: ask the SPREAD instead of the parse. It is one argument,
    // it type-checks, it satisfies the wiring pin's shape — and it silently
    // disables the panel's authority for ever.
    const mSpread = mutantBeside('src/usage-routes.js',
      [['authoritativeScopes: authoritativeScopesOf(cliPanel) });', 'authoritativeScopes: authoritativeScopesOf(u) });']]);
    hit18(mSpread, '⑱f asks the spread `u` instead of the parse `cliPanel`');
    const w2 = mkPanelWorld(require(mSpread.path));
    const r2 = await runPanels(w2);
    eq(idsIn(r2.after), ['model:fable', 'model:oldmodel', 'plan'],
      '⑱f NEGATIVE CONTROL: asking the spread retires nothing — the mark does not survive `{...cliPanel}`, and no other assert in this file can see it');
  }

  // ── ⑱e the retirement says WHAT CLAIM it is dropping ──────────────────────
  // A legitimate retirement is a vendor change; the line that records it is the
  // only artefact that answers "did a constraint just disappear?" when the pool
  // starts spending on an account it now thinks is free.
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm18e-${process.pid}-`));
    tmpDirs.push(dir);
    const base = {
      fiveHour: { utilization: 0.2, resetsAt: nowSec18 + 3600 }, sevenDay: { utilization: 0.2, resetsAt: nowSec18 + 500000 },
      scopedWeekly: [{ name: 'OldModel', utilization: 1, resetsAt: nowSec18 + 300 }, { name: 'Fable', utilization: 0.1, resetsAt: nowSec18 + 500000 }],
      fetchedAt: Date.now(), source: 'on-demand',
    };
    W.writeCacheObject({ cacheDir: dir, key: 'acct', obj: base, measuredAt: Date.now(), source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude', authoritativeScopes: ['model'] });
    const said = [];
    const realLog = console.log;
    console.log = (...a) => { said.push(a.join(' ')); };
    try {
      W.writeCacheObject({ cacheDir: dir, key: 'acct', obj: { ...base, scopedWeekly: [base.scopedWeekly[1]], fetchedAt: Date.now() + 1000 },
        measuredAt: Date.now() + 1000, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude', authoritativeScopes: ['model'] });
    } finally { console.log = realLog; }
    const line = said.find((s) => s.includes('retiring')) || '';
    ok(/model:oldmodel \(100% 7d, running\)/.test(line),
      `⑱e the retirement names the claim it drops, not just the id (${JSON.stringify(line)})`);
  }

  // ── ⑱g THE CODEX SAME-ACCOUNT MERGE CARRIES THE SET WITH THE WINNER ───────
  //
  // Composition verifier of the quota-model-v2 merge (2026-09-09): the codex
  // global↔named same-account merge re-pointed `byAccount` at the newest
  // snapshot but left `setOf` PER KEY — and the write-through right below it
  // persists `setOf[key]`. So the LOSER's file received the loser's stale
  // limits beneath the WINNER's fetchedAt, and the freshness guard
  // (`cur.fetchedAt >= snap.fetchedAt`) then refused every later correction,
  // for good: the pool read the account at 50 % used while the truth was 92 %.
  // Latent on this instance today (no cxs-* file), live the moment a ChatGPT
  // account matching the machine login is added. Driven through the REAL
  // setupUsage + summarizeCodexRateLimits with a real AccountManager; the link
  // is made the way the product makes it (one email on both sides).
  {
    const { AccountManager } = require(path.join(ROOT, 'src/accounts.js'));
    const usageMod = require(path.join(ROOT, 'src/usage-routes.js'));
    const EMAIL = 'same-login@example.test';
    const OLDER = T0, NEWER = T0 + 60000;
    const planAt = (pct) => ({ ...CODEX_PLAN, primary: { usedPercent: pct, windowDurationMins: 10080, resetsAt: 1789509325 } });
    const mkLinkedWorld = (usageModule) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm18g-${process.pid}-`));
      tmpDirs.push(root);
      const dataDir = path.join(root, 'data');
      const am = new AccountManager({ dataDir });
      const cx = am.createCodexSubscription({ name: 'Linked ChatGPT' }).id;
      const realList = am.list.bind(am);
      am.list = () => { const r = realList(); for (const a of r.accounts || []) if (a.id === cx) a.email = EMAIL; return r; };
      am.codexGlobalStatus = () => ({ loggedIn: true, email: EMAIL });
      const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
      // The named account's file is the OLDER reading (50 % used); the machine
      // login's file is the NEWER one (92 % used) — one quota, two files.
      W.writeReading({ cacheDir, key: cx, set: CODEXQ.toLimitSet(planAt(50), { identity: cx, source: 'codex-rate-limits', fetchedAt: OLDER }), source: 'codex-rate-limits', backend: 'codex' });
      W.writeReading({ cacheDir, key: '__global_codex__', set: CODEXQ.toLimitSet(planAt(92), { identity: '__global_codex__', source: 'codex-rate-limits', fetchedAt: NEWER }), source: 'codex-rate-limits', backend: 'codex' });
      const u = usageModule.setupUsage({
        app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} },
        accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(),
        serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
        USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir,
        CODEX_SESSIONS_DIR: path.join(root, 'codex-sessions'), META_DIR: path.join(dataDir, 'session-meta'),
        AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'session-buffers'),
        probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: '/bin/false',
      });
      return { cx, cacheDir, u };
    };
    const planPct = (o) => {
      const l = ((o && o.limits) || []).find((x) => x.limitId === 'codex');
      const w = l && (l.windows || []).find((x) => x.kind === '7d');
      return w ? w.usedPct : null;
    };

    const w = mkLinkedWorld(usageMod);
    const s = w.u.summarizeCodexRateLimits();
    ok(s.byAccount[w.cx] === s.byAccount.__global_codex__ && planPct(s.byAccount[w.cx]) === 92,
      `⑱g the linked pair projects ONE snapshot — the newer 92 % (${planPct(s.byAccount[w.cx])})`);
    const file = W.readCacheObject(w.cacheDir, w.cx);
    ok(planPct(file) === 92 && file.fetchedAt === NEWER,
      `⑱g the named account's FILE now holds the winner's numbers under the winner's fetchedAt (${planPct(file)} @ ${file && file.fetchedAt})`);
    const file2 = W.readCacheObject(w.cacheDir, '__global_codex__');
    ok(planPct(file2) === 92 && file2.fetchedAt === NEWER, "⑱g the machine login's own file is untouched by the merge");

    // NEGATIVE CONTROL: the pre-fix merge — byAccount re-pointed, setOf left
    // per key. The named account's file then carries 50 % under the newer
    // fetchedAt, and no later write at or before that instant can correct it.
    const mPre = mutantBeside('src/usage-routes.js',
      [["      setOf[gid] = setOf['__global_codex__'] = setOf[winKey];\n", '']]);
    hit18(mPre, '⑱g pre-fix merge (set not carried with the winner)');
    const w2 = mkLinkedWorld(require(mPre.path));
    w2.u.summarizeCodexRateLimits();
    const f2 = W.readCacheObject(w2.cacheDir, w2.cx);
    ok(planPct(f2) === 50 && f2.fetchedAt === NEWER,
      `⑱g NEGATIVE CONTROL: without carrying the set, the file holds the LOSER's 50 % beneath the WINNER's fetchedAt — the shape the freshness guard then protects for good (${planPct(f2)} @ ${f2 && f2.fetchedAt})`);
    const again = CODEXQ.toLimitSet(planAt(92), { identity: w2.cx, source: 'codex-rate-limits', fetchedAt: NEWER });
    const guardBlocks = (Number(f2.fetchedAt) || 0) >= (Number(again.fetchedAt) || 0);
    ok(guardBlocks, '⑱g NEGATIVE CONTROL: a correct reading at that same instant is exactly what the write-through freshness guard refuses');
  }
}


console.log('\n⑲ THE MODEL-CAP LANE: named by what names it, else a placeholder that folds (inc-mubu23bd-5vxi)');
{
  const R = 1790535600;
  const fable = (at, pct = 80) => QM.makeLimit({ limitId: 'model:fable', name: 'Fable', scope: 'model', model: 'Fable', family: 'fable', windows: [QM.makeWindow({ kind: '7d', usedPct: pct, resetsAt: R, measuredAt: at })], source: 'on-demand', fetchedAt: at });
  const opus = (at, pct = 20) => QM.makeLimit({ limitId: 'model:opus', name: 'Opus', scope: 'model', model: 'Opus', family: 'opus', windows: [QM.makeWindow({ kind: '7d', usedPct: pct, resetsAt: R, measuredAt: at })], source: 'on-demand', fetchedAt: at });
  const ph = (at, pct = 87, resetsAt = R) => QM.makeLimit({ limitId: QM.MODEL_CAP_PLACEHOLDER.limitId, name: QM.MODEL_CAP_PLACEHOLDER.name, scope: 'model', windows: [QM.makeWindow({ kind: '7d', usedPct: pct, resetsAt, measuredAt: at })], source: 'rate-limit-event', fetchedAt: at });
  // the rungs
  let v = QM.nameModelCapLane({ scoped: { fable: R }, resetsAt: R });
  ok(v.named && v.limitId === 'model:fable' && v.name === 'Fable' && v.family === 'fable' && /established window/.test(v.why), '⑲ ① the sidecar\'s scoped window with this reset names the lane (fable → model:fable, name Fable)');
  v = QM.nameModelCapLane({ limits: [fable(1)], resetsAt: R + 60 });
  ok(v.named && v.limitId === 'model:fable' && /existing model limit/.test(v.why), '⑲ ② an existing scope:model limit with the same reset (±' + QM.WINDOW_JITTER_SEC + ' s) IS the lane');
  v = QM.nameModelCapLane({ limits: [fable(1)], resetsAt: R + QM.WINDOW_JITTER_SEC + 1 });
  ok(!v.named && v.limitId === 'model:cap', '⑲ ② …a reset one second past the jitter is NOT the same lane (the tolerance is the model\'s own WINDOW_JITTER_SEC, shared with reading-lag)');
  v = QM.nameModelCapLane({ scoped: { fable: R, opus: R }, resetsAt: R, hint: 'opus' });
  ok(v.named && v.limitId === 'model:opus' && /session requests Opus/.test(v.why), '⑲ ③ two caps on one reset: the requesting session\'s family breaks the tie');
  v = QM.nameModelCapLane({ scoped: { fable: R, opus: R }, resetsAt: R });
  ok(!v.named && v.limitId === 'model:cap' && v.family === null && /no request model/.test(v.why), '⑲ ③ …with no hint an ambiguous reset decides NOTHING — the placeholder, never a guess');
  v = QM.nameModelCapLane({ scoped: { fable: R, opus: R }, resetsAt: R, hint: 'sonnet' });
  ok(!v.named, '⑲ ③ …a hint that names none of the candidates decides nothing either');
  v = QM.nameModelCapLane({ scoped: { fable: R }, resetsAt: null, hint: 'fable' });
  ok(v.named && v.limitId === 'model:fable' && /no reset stated/.test(v.why), '⑲ ④ a rejection with NO reset is named only through a hint matching a cap the account has SHOWN');
  v = QM.nameModelCapLane({ scoped: { fable: R }, resetsAt: null, hint: 'opus' });
  ok(!v.named, '⑲ ④ …a hint for a family the account never showed names nothing (the vocabulary is the account\'s own)');
  v = QM.nameModelCapLane({ resetsAt: R });
  ok(!v.named && v.limitId === 'model:cap' && v.name === 'Model cap' && v.family === null, '⑲ ⑤ nothing names it ⇒ model:cap / "Model cap" / family null');
  v = QM.nameModelCapLane({ limits: [ph(1)], resetsAt: R });
  ok(!v.named, '⑲ ⑤ …an existing PLACEHOLDER never names a lane (it is the absence of a name)');
  // THE ROLL (r2): from a weekly reset until the next verified panel the sidecar and the stored cap
  // carry LAST week's reset — a rolled window is the SAME lane by PHASE, never by the instant
  const WEEK = QM.WEEK_SEC;
  v = QM.nameModelCapLane({ scoped: { fable: R }, resetsAt: R + WEEK });
  ok(v.named && v.limitId === 'model:fable' && WEEK === 604800, '⑲ ROLL: the sidecar rung names a window ONE WEEK after the established reset (the shape after every weekly reset until the panel restamps)');
  v = QM.nameModelCapLane({ limits: [fable(1)], resetsAt: R + WEEK + 60 });
  ok(v.named && v.limitId === 'model:fable', '⑲ ROLL: …and the existing-limit rung, a week and a minute later');
  v = QM.nameModelCapLane({ limits: [fable(1)], resetsAt: R + WEEK + QM.WINDOW_JITTER_SEC + 1 });
  ok(!v.named, '⑲ ROLL: …a week plus one second past the jitter is still NOT the lane (the phase, not "any later week")');
  v = QM.nameModelCapLane({ limits: [fable(1)], resetsAt: R + 86400 });
  ok(!v.named, '⑲ ROLL CONTROL: one DAY later is another window');
  {
    const readingLag = require(path.join(ROOT, 'src/reading-lag.js'));
    const table = [[R, R], [R, R + 60], [R, R + 120], [R, R + 121], [R, R + WEEK], [R, R + WEEK - 60], [R, R - WEEK + 120], [R, R + 3 * WEEK + 1], [R, R + 86400], [R, R + WEEK / 2], [R, R - 121], [0, R], [R, null]];
    ok(table.every(([a, b]) => (QM.weeklyPhaseNear(a, b) === true) === (readingLag.weeklyNear(a, b) === true)), '⑲ ROLL: weeklyPhaseNear agrees with reading-lag.weeklyNear on every row of the table (the rule is spelled twice because quota-model imports nothing)');
  }
  // the fold — the ONE permitted collapse, and only that one
  let m = QM.mergeLimitSets(QM.makeLimitSet({ identity: 'k', limits: [ph(200)] }), QM.makeLimitSet({ identity: 'k', limits: [fable(100, 86)] }));
  ok(m.limits.length === 1 && m.limits[0].limitId === 'model:fable' && m.limits[0].name === 'Fable' && m.limits[0].family === 'fable' && QM.windowOfKind(m.limits[0], '7d').usedPct === 87,
    '⑲ FOLD: a placeholder on disk + a panel naming Fable on the same reset ⇒ ONE model:fable, the NEWER measurement (the event\'s 87 @200 over the panel\'s 86 @100)');
  m = QM.mergeLimitSets(QM.makeLimitSet({ identity: 'k', limits: [fable(100, 86)] }), QM.makeLimitSet({ identity: 'k', limits: [ph(50)] }));
  ok(m.limits.length === 1 && m.limits[0].limitId === 'model:fable' && QM.windowOfKind(m.limits[0], '7d').usedPct === 86, '⑲ FOLD: …in either order (an OLDER placeholder folds and loses to the panel\'s newer number)');
  m = QM.mergeLimitSets(QM.makeLimitSet({ identity: 'k', limits: [fable(100)] }), QM.makeLimitSet({ identity: 'k', limits: [ph(200, 87, R + 86400)] }));
  ok(m.limits.length === 2 && m.limits.some((l) => l.limitId === 'model:cap'), '⑲ FOLD: a placeholder on a DIFFERENT reset stays its own limit (never dropped)');
  m = QM.mergeLimitSets(QM.makeLimitSet({ identity: 'k', limits: [fable(100, 86)] }), QM.makeLimitSet({ identity: 'k', limits: [ph(200, 30, R + WEEK)] }));
  ok(m.limits.length === 1 && m.limits[0].limitId === 'model:fable' && QM.windowOfKind(m.limits[0], '7d').usedPct === 30 && QM.windowOfKind(m.limits[0], '7d').resetsAt === R + WEEK,
    '⑲ FOLD ROLL (r2): a placeholder written after the week rolled folds into LAST week\'s named cap and carries the new week (30 @ R+week) — it no longer sits beside the stale Fable gating every family');
  m = QM.mergeLimitSets(QM.makeLimitSet({ identity: 'k', limits: [fable(100)] }), QM.makeLimitSet({ identity: 'k', limits: [ph(200, 87, null)] }));
  ok(m.limits.length === 2, '⑲ FOLD: a placeholder that states NO reset stays (a later panel enumerates and retires it)');
  m = QM.mergeLimitSets(QM.makeLimitSet({ identity: 'k', limits: [fable(100), opus(100)] }), QM.makeLimitSet({ identity: 'k', limits: [ph(200)] }));
  ok(m.limits.length === 3 && m.limits.some((l) => l.limitId === 'model:cap'), '⑲ FOLD: two named caps on the same reset ⇒ ambiguous ⇒ the placeholder stays honest');
  m = QM.mergeLimitSets(QM.makeLimitSet({ identity: 'k', limits: [fable(100)] }), QM.makeLimitSet({ identity: 'k', limits: [opus(200)] }));
  ok(m.limits.length === 2 && m.limits.map((l) => l.limitId).join() === 'model:fable,model:opus', '⑲ FOLD CONTROL: two NAMED limits on one reset NEVER collapse (the 2026-09-09 law is untouched)');
  // the legacy round trip and the accessors
  const lg = QM.fromLegacy({ scopedWeekly: [{ name: 'Model cap', utilization: 0.87, resetsAt: R }, { name: 'Fable', utilization: 0.5, resetsAt: R + 604800 }] }, { fetchedAt: 5, familyOf: familyOfScopedBucket });
  ok(lg.limits.map((l) => l.limitId).join() === 'model:cap,model:fable' && lg.limits[0].family === null && lg.limits[0].model === null && lg.limits[1].family === 'fable', '⑲ fromLegacy: "Model cap" lifts to model:cap with family/model null even with familyOf injected');
  // (B-9f4b: the round trip is asked of a set that HAS a plan limit — with none, `legacyWindowLimit`
  // promotes the first model limit into the plan slot and ⑳a's one-limit-one-row rule projects it there only)
  const lgPlan = QM.fromLegacy({ sevenDay: { utilization: 0.4, resetsAt: R }, scopedWeekly: [{ name: 'Model cap', utilization: 0.87, resetsAt: R }, { name: 'Fable', utilization: 0.5, resetsAt: R + 604800 }] }, { fetchedAt: 5, familyOf: familyOfScopedBucket });
  ok(QM.toLegacyView(lgPlan).scopedWeekly[0].name === 'Model cap' && QM.scopedLimitId('Model cap') === 'model:cap' && QM.scopedLimitId('Fable') === 'model:fable', '⑲ toLegacyView: …and projects back under the placeholder name — the id round-trips (scopedLimitId is the ONE spelling)');
  const both = QM.makeLimitSet({ identity: 'k', limits: [QM.makeLimit({ limitId: 'plan', scope: 'plan', windows: [QM.makeWindow({ kind: '7d', usedPct: 43, resetsAt: R, measuredAt: 1 })], fetchedAt: 1 }), fable(1), ph(2, 87, R + 604800)] });
  ok(QM.limitFor(both, { family: 'fable' }).limitId === 'model:fable' && QM.limitFor(both, { family: 'opus' }).limitId === 'plan', '⑲ limitFor: a family still finds ITS named lane; the placeholder governs no named request');
  ok(QM.applicableLimits(both, {}).some((l) => l.limitId === 'model:cap') && !QM.applicableLimits(both, { family: 'opus' }).some((l) => l.limitId === 'model:cap'), '⑲ applicableLimits: the placeholder counts for the ACCOUNT-level min (conservative) and never for a named family');
  // the lift rung: a model cap the statusline measured (2.1.274 model_scoped) is restored from the legacy entry
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-qm19-')); tmpDirs.push(dir);
    const KEY = 'sub-qm19';
    W.writeCacheObject({ cacheDir: dir, key: KEY, obj: { fetchedAt: 1000, source: 'on-demand', fiveHour: { utilization: 0.1 }, sevenDay: { utilization: 0.4, resetsAt: R }, scopedWeekly: [{ name: 'Fable', utilization: 0.5, resetsAt: R }, { name: 'Opus', utilization: 0.2, resetsAt: R }] }, measuredAt: 1000, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude' });
    const o = JSON.parse(fs.readFileSync(W.cacheFileFor(dir, KEY), 'utf8'));
    // what the tool does: drops the model:fable limit it measured, writes the new Fable entry, keeps Opus and its limit
    o.limits = o.limits.filter((l) => l.limitId !== 'model:fable');
    o.scopedWeekly = [o.scopedWeekly.find((s) => s.name === 'Opus'), { name: 'Fable', utilization: 0.86, resetsAt: R, status: 'allowed', asOf: 2000 }];
    o.fetchedAt = 2000; o.source = 'passive';
    const set = W.limitsOfCache(o, { identity: KEY, backend: 'claude', familyOf: familyOfScopedBucket });
    const f = set.limits.find((l) => l.limitId === 'model:fable'), op = set.limits.find((l) => l.limitId === 'model:opus');
    ok(f && QM.windowOfKind(f, '7d').usedPct === 86 && f.source === 'passive' && f.family === 'fable', '⑲ LIFT: a legacy scoped entry whose limit is ABSENT from `limits` is restored with the object\'s own provenance (the statusline\'s drop rule, for a model cap)');
    ok(op && op.source === 'on-demand' && QM.windowOfKind(op, '7d').usedPct === 20 && set.limits.filter((l) => l.limitId === 'model:opus').length === 1, '⑲ LIFT: …a scoped entry whose limit IS present is neither duplicated nor re-stamped');
  }
  // THE REAL STATUSLINE TOOL with a 2.1.274 payload (the parity pin of the twin)
  {
    const { execFileSync } = await import('child_process');
    const TOOL = path.join(ROOT, 'data/bin/vibespace-usage');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-qm19t-')); tmpDirs.push(dir);
    const KEY = 'sub-qm19t';
    const nowSec = Math.floor(Date.now() / 1000), RR = nowSec + 3 * 86400;
    W.writeCacheObject({ cacheDir: dir, key: KEY, obj: { fetchedAt: Date.now() - 3600e3, source: 'on-demand', fiveHour: { utilization: 0.71, resetsAt: nowSec + 7200 }, sevenDay: { utilization: 0.44, resetsAt: RR }, scopedWeekly: [{ name: 'Fable', utilization: 0.93, resetsAt: RR }, { name: 'Opus', utilization: 0.2, resetsAt: RR }] }, measuredAt: Date.now() - 3600e3, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude' });
    const f = W.cacheFileFor(dir, KEY);
    const before = JSON.parse(fs.readFileSync(f, 'utf8'));
    const old = Date.now() - 60000; fs.utimesSync(f, old / 1000, old / 1000);
    const render = (rl) => execFileSync(TOOL, [], { input: JSON.stringify({ session_id: 'sess-qm19', model: { id: 'claude-fable-5', display_name: 'Fable 5' }, rate_limits: rl }), encoding: 'utf8', env: { ...process.env, VIBESPACE_USAGE_CACHE: dir, VIBESPACE_ACCOUNT_KEY: KEY, HOME: dir } });
    // the measured 2.1.274 schema: model_scoped[].utilization is the server's PERCENT, resets_at an ISO string
    render({ five_hour: { used_percentage: 12, resets_at: nowSec + 3600 }, seven_day: { used_percentage: 46, resets_at: RR }, model_scoped: [{ display_name: 'Fable', utilization: 86, resets_at: new Date(RR * 1000).toISOString() }] });
    const after = JSON.parse(fs.readFileSync(f, 'utf8'));
    const lifted = W.limitsOfCache(after, { identity: KEY, backend: 'claude', familyOf: familyOfScopedBucket }).limits;
    const fl = lifted.find((l) => l.limitId === 'model:fable'), ol = lifted.find((l) => l.limitId === 'model:opus'), pl = lifted.find((l) => l.limitId === 'plan');
    ok(Math.abs(after.sevenDay.utilization - 0.46) < 1e-9 && pl && QM.windowOfKind(pl, '7d').usedPct === 46, '⑲ TOOL: the plan week reads the plan week (46) — never the bucket');
    ok((after.scopedWeekly || []).find((s) => s.name === 'Fable')?.utilization === 0.86 && fl && QM.windowOfKind(fl, '7d').usedPct === 86 && fl.source === 'passive' && QM.windowOfKind(fl, '7d').resetsAt === RR,
      '⑲ TOOL: model_scoped Fable 86 (percent ÷ 100, ISO reset → unix) lands as the NAMED scoped bucket with this producer\'s provenance');
    const beforeOpus = before.limits.find((l) => l.limitId === 'model:opus');
    ok(ol && ol.source === beforeOpus.source && ol.fetchedAt === beforeOpus.fetchedAt && QM.windowOfKind(ol, '7d').usedPct === 20, '⑲ TOOL: a cap the payload did NOT name (Opus) keeps its own source and age');
    // an EMPTY list states nothing (the r5 rule)
    fs.utimesSync(f, old / 1000, old / 1000);
    render({ five_hour: { used_percentage: 13, resets_at: nowSec + 3600 }, seven_day: { used_percentage: 47, resets_at: RR }, model_scoped: [] });
    const after2 = JSON.parse(fs.readFileSync(f, 'utf8'));
    ok((after2.scopedWeekly || []).length === 2 && (after2.scopedWeekly || []).find((s) => s.name === 'Fable')?.utilization === 0.86 && Math.abs(after2.sevenDay.utilization - 0.47) < 1e-9, '⑲ TOOL: an empty model_scoped list leaves every scoped bucket exactly as it was (an empty read is not a retirement)');
    // the older top-level seven_day_opus shape is the same rule (the lane is its name)
    fs.utimesSync(f, old / 1000, old / 1000);
    render({ five_hour: { used_percentage: 13, resets_at: nowSec + 3600 }, seven_day: { used_percentage: 47, resets_at: RR }, seven_day_opus: { used_percentage: 33, resets_at: RR } });
    const after3 = JSON.parse(fs.readFileSync(f, 'utf8'));
    ok((after3.scopedWeekly || []).find((s) => s.name === 'Opus')?.utilization === 0.33 && (after3.scopedWeekly || []).find((s) => s.name === 'Fable')?.utilization === 0.86, '⑲ TOOL: a top-level seven_day_opus field names its lane the same way (Opus 33, Fable untouched)');
  }
}

// ── ㉑ A PLAN WITHOUT A 5-HOUR WINDOW (lane no-5h-window, 2026-10-30) ────────
// Anthropic renamed Max 20x → Ultra and is lifting the rolling 5-hour limit from verified Ultra accounts in stages
// (weekly limits unchanged; the $100 Max keeps its 5-hour window; a newer account keeps a temporary one until it is
// verified). The shapes here are the ones the main developer quoted from this instance's readings (read-only,
// 2026-10-30 17:1x PDT): the /usage panel's «Current session» row DISAPPEARS, the stream's `unifiedWindows` names only
// `seven_day`, an OAuth / get_usage reply carries `five_hour` null. Four rules, each RED on 43d0f8d2d by name:
//   1 THE SHAPE FLOWS — a reading without a 5h window is complete; nothing fabricates one, no reader dereferences one;
//   2 THE CHANGE IS SAID — a member that LOSES (or regains) its 5h window is reported once per change, never per probe;
//   3 THE WORDS — no 5h figure or sentence for a member that has none (the popup row says it was lifted);
//   4 HONEST ABOUT THE PANEL — a panel without the row is a verified reading; only a VERIFIED panel may say «no 5h».
console.log('\n㉑ a plan WITHOUT a 5-hour window (lane no-5h-window)');
{
  const CQ = require(path.join(ROOT, 'src/harnesses/claude-quota.js'));
  const { ClaudeCodeAdapter: ADP } = require(path.join(ROOT, 'src/adapters/claude-code.js'));
  const CAP = require(path.join(ROOT, 'src/rate-limit-capture.js'));
  const POOL = require(path.join(ROOT, 'src/account-pool-auto.js'));
  const fnOf = (o, n) => (o && typeof o[n] === 'function' ? o[n].bind(o) : null);
  const AW = (p) => { const f = fnOf(QM, 'absentWindowsOf'); return f ? f(p) : null; };            // null on a base without the rule
  const SINCE = (l, k) => { const f = fnOf(QM, 'absentSince'); return f ? f(l, k) : null; };
  const nowSec = Math.floor(Date.now() / 1000);
  const WEEK = 'Current week (all models): 40% used\n';
  const PANEL_5H = 'Current session: 84% used\n' + WEEK;
  const PANEL_NO5H = WEEK;                                   // the vendor lifted it: the row is GONE
  const PANEL_WORD = 'Current session: Unlimited\n' + WEEK;  // …or printed with a word from the closed list
  const PANEL_DRIFT = 'Current session: (a shape nobody has seen)\n' + WEEK;
  const PANEL_IDLE = 'Current session: 0% used\n' + WEEK;    // a 5h window that has NOT STARTED — not the same thing
  const lift = (o, key) => W.limitsOfCache(o, { identity: key, backend: 'claude', familyOf: familyOfScopedBucket });
  const planOf = (o, key) => QM.planLimit(lift(o, key));
  const mkd = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-qm21-' + tag + '-')); tmpDirs.push(d); return d; };
  const readJ = (dir, key) => JSON.parse(fs.readFileSync(W.cacheFileFor(dir, key), 'utf8'));
  const seed5h = (dir, key, { u5 = 0.84, at = Date.now() - 120000 } = {}) => W.writeCacheObject({ cacheDir: dir, key, backend: 'claude', familyOf: familyOfScopedBucket, source: 'on-demand', measuredAt: at,
    obj: { fiveHour: { utilization: u5, resetsAt: nowSec + 3600 }, sevenDay: { utilization: 0.4, resetsAt: nowSec + 3 * 86400 }, scopedWeekly: [], fetchedAt: at, source: 'on-demand' } });
  // the panel write exactly as refreshViaCliPanel spells it: the file spread under the parse, `limits` dropped, the
  // parse's own claims handed over — `absentWindows` only for a VERIFIED panel (rule 4)
  const panelWrite = (dir, key, parsed, { verified = true, wcm = W } = {}) => {
    const prev = readJ(dir, key);
    const obj = { ...prev, ...parsed, source: 'on-demand', scopedFetchedAt: Date.now() };
    delete obj.limits;
    return wcm.writeCacheObject({ cacheDir: dir, key, obj, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude',
      absentWindows: verified ? AW(parsed) : null, authoritativeScopes: QM.authoritativeScopesOf(parsed) });
  };
  const said = [];
  const listen = fnOf(W, 'onWindowChange');
  if (listen) listen((c) => said.push(c));
  // a file's passive witnesses (r4: per PRODUCER, `{<producer>: {n, lastSig, at}}`; r3's flat `{n}` read as one count, so
  // a leg run against the r3 tree names its reds instead of crashing)
  const WMAP = (f) => { const w = f && f.fiveHourAbsentWitnesses; return !w || typeof w !== 'object' ? {} : typeof w.n === 'number' ? { '(file)': w } : w; };
  const WN = (f, producer) => { const m = WMAP(f); return Number((m[producer] || m['(file)'] || {}).n) || 0; };
  const maxN = (f) => Math.max(0, ...Object.values(WMAP(f)).map((e) => Number(e && e.n) || 0));

  // ── rule 1 + 4: the PARSE ────────────────────────────────────────────────
  const pNo = CQ.parseCliUsageText(PANEL_NO5H, Date.now());
  ok(pNo && pNo.sevenDay && pNo.fiveHour == null, '㉑1a a panel with the week and NO «Current session» row is a complete reading — the week, no 5h bucket');
  eq(AW(pNo), ['5h'], '㉑1a …and its parse SAYS it enumerated the plan and found no 5h window (absentWindowsOf)');
  eq(AW(CQ.parseCliUsageText(PANEL_WORD, Date.now())), ['5h'], '㉑1b a «Current session» row that prints a word of the closed list (Unlimited) says «no 5h limit» too');
  eq(AW(CQ.parseCliUsageText(PANEL_DRIFT, Date.now())), [], '㉑1b …any OTHER word in that row is format drift: the reading lands, the claim does not');
  eq(AW(CQ.parseCliUsageText(PANEL_5H, Date.now())), [], '㉑1b …and a panel that prints the 5h row claims nothing about it');
  // MEASURED by the owner (2026-10-30 17:4x PDT, claude 2.1.314): a long-lived-token credential in the member's isolated
  // folder makes the panel print ONLY its header sentence — no quota line at all. That is NO READING (the probe's
  // no-buckets path writes nothing), never an enumerating parse with the 5h window absent and never a fabricated 0.
  const pHeader = CQ.parseCliUsageText('Your subscription powers your Claude Code usage.\n', Date.now());
  ok(pHeader === null && JSON.stringify(AW(pHeader)) === '[]', `㉑1a a HEADER-ONLY panel (a long-lived-token login, 2.1.314) is no reading at all — null, no «no 5h» claim — got ${JSON.stringify(pHeader)}`);
  const pIdle = CQ.parseCliUsageText(PANEL_IDLE, Date.now());
  ok(pIdle && pIdle.fiveHour && pIdle.fiveHour.utilization === 0 && Array.isArray(AW(pIdle)) && AW(pIdle).length === 0, '㉑1c «Current session: 0% used» IS a 5h window (not started) — never «no 5h limit»');
  const sIdle = CQ.toLimitSet(pIdle, { nowMs: Date.now() }), sNo = CQ.toLimitSet(pNo, { nowMs: Date.now() });
  const w5Idle = QM.windowOfKind(QM.planLimit(sIdle), '5h');
  ok(w5Idle && w5Idle.state !== 'running' && SINCE(QM.planLimit(sIdle), '5h') == null && QM.toLegacyView(sIdle).fiveHourAbsent == null,
    '㉑1c the typed set keeps the two apart: not-started = a 5h window whose state fences its sliding reset, no tombstone');
  ok(!QM.windowOfKind(QM.planLimit(sNo), '5h') && SINCE(QM.planLimit(sNo), '5h') > 0 && QM.toLegacyView(sNo).fiveHourAbsent > 0 && !QM.toLegacyView(sNo).fiveHour,
    '㉑1c …«no 5h limit» = NO 5h window + a dated tombstone the view says as `fiveHourAbsent` (no 0 % window pretending to exist)');
  const oNo = CQ.parseOAuthUsage({ seven_day: { utilization: 40, resets_at: new Date((nowSec + 3 * 86400) * 1000).toISOString() }, five_hour: null });
  ok(oNo && oNo.fiveHour == null && Math.abs(oNo.sevenDay.utilization - 0.4) < 1e-9, `㉑1d an OAuth usage reply with five_hour null fabricates NO 5h window (base: {utilization 0, status unknown}) — got ${JSON.stringify(oNo && oNo.fiveHour)}`);
  eq(AW(oNo), ['5h'], '㉑1d …and claims «no 5h limit» (the reply enumerates the plan windows)');
  const o5 = CQ.parseOAuthUsage({ seven_day: { utilization: 40 }, five_hour: { utilization: 10 } });
  ok(o5 && o5.fiveHour && Math.abs(o5.fiveHour.utilization - 0.1) < 1e-9 && JSON.stringify(AW(o5)) === '[]', '㉑1d …a reply WITH five_hour keeps it, claims nothing');
  const gNo = ADP.parseGetUsageResponse({ rate_limits: { seven_day: { used_percentage: 40, resets_at: nowSec + 3 * 86400 } } });
  ok(gNo && gNo.fiveHour == null && Math.abs(gNo.sevenDay.utilization - 0.4) < 1e-9 && JSON.stringify(AW(gNo)) === '[]',
    `㉑1e the get_usage control payload without five_hour fabricates NO 0 % 'allowed' window — and claims nothing (r3: it is the CLI's own merged state, which drops a passed window) — got ${JSON.stringify(gNo && gNo.fiveHour)}`);
  const evNo = CAP.parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.4, resetsAt: nowSec + 3 * 86400, unifiedWindows: { seven_day: { utilization: 0.4, resets_at: nowSec + 3 * 86400 } } } });
  eq(evNo && evNo.absentWindows, ['5h'], '㉑1f a rate_limit_event whose unifiedWindows names the week and NO five_hour enumerated the plan: «no 5h limit»');
  const evLegacy = CAP.parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.4, resetsAt: nowSec + 3 * 86400 } });
  const evBoth = CAP.parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.4, unifiedWindows: { seven_day: { utilization: 0.4 }, five_hour: { utilization: 0.2 } } } });
  ok(evLegacy && Array.isArray(evLegacy.absentWindows) && !evLegacy.absentWindows.length && evBoth && Array.isArray(evBoth.absentWindows) && !evBoth.absentWindows.length,
    '㉑1f …a record without unifiedWindows (it names ONE bucket) or with five_hour in it claims nothing');
  const setEv = CQ.limitSetFromEvent(evNo, { nowMs: Date.now() });
  ok(setEv && !QM.windowOfKind(QM.planLimit(setEv), '5h') && SINCE(QM.planLimit(setEv), '5h') == null,
    '㉑1f …and its typed set is the week alone with NO tombstone — one passive answer is a witness, never proof (r3)');

  // ── rule 1: the MODEL — the newer claim wins, the view round-trips, the validator names the shape ─────────────
  {
    const T1 = Date.now() - 60000;
    const w7 = QM.makeWindow({ kind: '7d', usedPct: 40, resetsAt: nowSec + 86400, measuredAt: Date.now() });
    const mk = fnOf(QM, 'markWindowsAbsent');
    const plan = mk ? mk(QM.makeLimit({ limitId: 'plan', scope: 'plan', windows: [w7] }), ['5h'], T1) : QM.makeLimit({ limitId: 'plan', scope: 'plan', windows: [w7] });
    const set = QM.makeLimitSet({ limits: [plan] });
    ok(QM.validateLimitSet(set).ok && QM.toLegacyView(set).fiveHourAbsent === T1, '㉑1g the view projects `fiveHourAbsent` = the instant it was first said');
    ok(SINCE(QM.planLimit(QM.fromLegacy(QM.toLegacyView(set))), '5h') === T1, '㉑1g …and a spread copy of the view lifts back to the SAME dated tombstone (it can never outrank a newer window)');
    const back = QM.makeLimitSet({ limits: [QM.makeLimit({ limitId: 'plan', scope: 'plan', windows: [QM.makeWindow({ kind: '5h', usedPct: 10, resetsAt: nowSec + 3600, measuredAt: T1 + 1000 })] })] });
    const stale = QM.makeLimitSet({ limits: [QM.makeLimit({ limitId: 'plan', scope: 'plan', windows: [QM.makeWindow({ kind: '5h', usedPct: 90, resetsAt: nowSec + 3600, measuredAt: T1 - 1000 })] })] });
    const mBack = QM.planLimit(QM.mergeLimitSets(set, back)), mStale = QM.planLimit(QM.mergeLimitSets(stale, set));
    ok(QM.windowOfKind(mBack, '5h') && SINCE(mBack, '5h') == null, '㉑1h a 5h window measured AFTER the removal is the window BACK (a newer account\'s temporary limit) — the tombstone goes');
    ok(!QM.windowOfKind(mStale, '5h') && SINCE(mStale, '5h') === T1, '㉑1h …one measured BEFORE it is gone — a stale window never survives the merge (base: mergeLimit kept it for ever)');
    const bad = QM.validateLimitSet(QM.makeLimitSet({ limits: [{ ...plan, flags: { absent: { '5h': -1 } } }] }));
    ok(!bad.ok && bad.errors.some((e) => /flags\.absent/.test(e)), '㉑1g the validator names a malformed tombstone');
  }

  // ── rule 1 + 2 + 4: the WRITE PATH — the removal, said once; the return, said once ──────────────────────────
  const dir = mkd('w'), K = 'sub-n5h-a';
  seed5h(dir, K);
  const r1 = panelWrite(dir, K, CQ.parseCliUsageText(PANEL_NO5H, Date.now()));
  const f1 = readJ(dir, K);
  ok(r1.ok && f1.fiveHour === undefined && f1.fiveHourAbsent > 0 && !QM.windowOfKind(planOf(f1, K), '5h'),
    `㉑2a a VERIFIED panel without the row retires the 5h window the file held (84 %) and lays the tombstone — base kept the stale window — file ${JSON.stringify({ fiveHour: f1.fiveHour, fiveHourAbsent: f1.fiveHourAbsent })}`);
  ok(r1.windowChange && r1.windowChange.change === 'removed' && said.length === 1 && said[0].key === K && said[0].change === 'removed',
    `㉑2b …and the change is REPORTED: removed, once, for that key — said ${JSON.stringify(said)}`);
  const r2 = panelWrite(dir, K, CQ.parseCliUsageText(PANEL_NO5H, Date.now()));
  ok(r2.ok && !r2.windowChange && said.length === 1, '㉑2b …never per probe: the next identical panel reports nothing (the file already says it)');
  const rem = POOL.accountRemaining(f1, nowSec), brs = POOL.bucketRems(f1, nowSec);
  ok(rem.known && rem.remaining === 60 && !brs.some((b) => b.kind === 'fiveHour') && POOL.weeklyDeadline(f1, nowSec) === (f1.sevenDay.resetsAt || null),
    `㉑1i the pool reads the week alone: remaining ${JSON.stringify(rem)}, rows ${JSON.stringify(brs.map((b) => b.label))}`);
  {
    const d4 = mkd('u'), K4 = 'sub-n5h-unverified';
    seed5h(d4, K4);
    const r4 = panelWrite(d4, K4, CQ.parseCliUsageText(PANEL_NO5H, Date.now()), { verified: false });
    const f4 = readJ(d4, K4);
    ok(r4.ok && f4.fiveHour && f4.fiveHour.utilization === 0.84 && !f4.fiveHourAbsent && !r4.windowChange,
      '㉑4a an UNVERIFIED panel writes its numbers and keeps every window the file holds — «no 5h» needs a panel that proved whose it is (B-855a c1)');
    const UR = fs.readFileSync(path.join(ROOT, 'src/usage-routes.js'), 'utf8');
    ok(/absentWindows: idv && idv\.verified \? quotaModel\.absentWindowsOf\(cliPanel\) : null,\n\s+authoritativeScopes: authoritativeScopesOf\(cliPanel\) \}\);/.test(UR),
      '㉑4a …and refreshViaCliPanel hands the claim over only when `idv.verified`, from the PARSE (`cliPanel`, never the spread)');
    ok((UR.match(/absentWindows: quotaModel\.absentWindowsOf\(u\)/g) || []).length === 5,
      '㉑4b the token-ladder / device rungs (one OAuth reply each, the account\'s own token) hand over their parse\'s claim — 5 sites');
  }
  // the RETURN is a 5h window NEWER than the removal — it began after the tombstone was laid (r4: one that began before
  // it is a session that never saw the lift, ㉑7b)
  const evBack = CAP.parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.1, resetsAt: Math.floor(Date.now() / 1000) + 5 * 3600 + 60 } });
  const rb = CAP.captureRateLimitEvent({ cacheDir: dir, key: K, identityIds: [K], ev: evBack, now: Date.now() + 1000 });
  const fb = readJ(dir, K);
  ok(rb.ok && fb.fiveHour && Math.abs(fb.fiveHour.utilization - 0.1) < 1e-9 && !fb.fiveHourAbsent && said.length === 2 && said[1].change === 'restored',
    `㉑2c a 5h window that BEGAN after the removal brings the window BACK and is said the same way (restored) — said ${JSON.stringify(said.map((x) => x.change))}`);
  // THE STREAM IS A PASSIVE ANSWER (r3, acceptance r2 BLOCKER): the CLI drops a passed window from `unifiedWindows`
  // (2.1.314 `xd`), so a week-only record counts as ONE witness, and only when the week MOVED since the previous reading.
  const evWeek = (pct, extra = {}) => CAP.parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: pct / 100, resetsAt: nowSec + 3 * 86400, unifiedWindows: { seven_day: { utilization: pct / 100, resets_at: nowSec + 3 * 86400 } }, ...extra } });
  const ev5 = (pct5) => CAP.parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: pct5 / 100, resetsAt: nowSec + 4 * 3600, unifiedWindows: { five_hour: { utilization: pct5 / 100, resets_at: nowSec + 4 * 3600 }, seven_day: { utilization: 0.44, resets_at: nowSec + 3 * 86400 } } } });
  const capture = (d, key, ev, ids = [key], cap = CAP, producer = 'ev:qm21') => cap.captureRateLimitEvent({ cacheDir: d, key, identityIds: ids, ev, now: Date.now(), producer });
  {
    const d3 = mkd('e'), K3 = 'sub-n5h-ev';
    seed5h(d3, K3);
    const n0 = said.length;
    capture(d3, K3, evWeek(40));                       // the first passive reading of the week: nothing to compare with
    capture(d3, K3, evWeek(40));                       // the SAME answer again (a replay, the reset-time state): no witness
    const f1 = readJ(d3, K3);
    capture(d3, K3, evWeek(41));                       // the week MOVED, no five_hour: witness 1
    const f2 = readJ(d3, K3);
    ok(f1.fiveHour && f1.fiveHour.utilization === 0.84 && !f1.fiveHourAbsent && maxN(f1) === 0 && f2.fiveHour && !f2.fiveHourAbsent && WN(f2, 'ev:qm21') === 1 && said.length === n0,
      `㉑2d a week-only stream record is NOT proof: the stored 5h window stays (unconfirmed), one MOVED answer is witness 1 — ${JSON.stringify({ f1: !!f1.fiveHour, w2: f2.fiveHourAbsentWitnesses })}`);
    capture(d3, K3, evWeek(42));                       // witness 2 — a second, distinct API answer
    const f3 = readJ(d3, K3);
    ok(f3.fiveHour === undefined && f3.fiveHourAbsent > 0 && maxN(f3) === 0 && said.slice(n0).filter((x) => x.key === K3 && x.change === 'removed').length === 1,
      '㉑2d …the SECOND moved answer lays the tombstone and the removal is said ONCE');
    const d3b = mkd('e2'), K3b = 'sub-n5h-ev2';
    seed5h(d3b, K3b);
    capture(d3b, K3b, evWeek(40)); capture(d3b, K3b, evWeek(41)); capture(d3b, K3b, ev5(3)); capture(d3b, K3b, evWeek(45)); // ev5 reads the week at 44
    const fb3 = readJ(d3b, K3b);
    ok(fb3.fiveHour && !fb3.fiveHourAbsent && WN(fb3, 'ev:qm21') === 1,
      '㉑2d …a five_hour answer between two moved ones ENDS the count (witness 1 again, never 2 — no flap)');
    // THE SIBLING BASE: the capture spreads the identity group's FRESHEST file — a sibling may still hold the 5h window
    const SIB = 'sub-n5h-sib', n1 = said.length;
    W.writeCacheObject({ cacheDir: d3, key: SIB, backend: 'claude', familyOf: familyOfScopedBucket, source: 'on-demand', measuredAt: Date.now() + 5000,
      obj: { fiveHour: { utilization: 0.5, resetsAt: nowSec + 3600 }, sevenDay: { utilization: 0.4, resetsAt: nowSec + 3 * 86400 }, scopedWeekly: [], fetchedAt: Date.now() + 5000, source: 'on-demand' } });
    CAP.captureRateLimitEvent({ cacheDir: d3, key: K3, identityIds: [K3, SIB], ev: evLegacy, now: Date.now() + 6000 });
    const f3s = readJ(d3, K3);
    ok(f3s.fiveHour === undefined && f3s.fiveHourAbsent > 0 && !said.slice(n1).some((x) => x.key === K3),
      `㉑1j a record that states no 5h lane never carries a SIBLING's 5h bucket onto a file whose plan has none (no false «back») — ${JSON.stringify({ fiveHour: f3s.fiveHour })}`);
  }

  // ── rule 1 + 2: the SHIPPED statusline — END TO END for a running session (the main developer's ruling,
  // 2026-10-31 00:51Z: a long-lived-token member's panel prints a header only, so ITS removal arrives through the
  // statusline input of a session running on it) — UNDER THE r3 EVIDENCE RULE (acceptance r2 BLOCKER: the CLI drops a
  // passed window from `rate_limits` and re-renders AT that reset, so a render without five_hour is the reset-time
  // shape of EVERY member). Only TWO renders whose week MOVED, without five_hour, lay the tombstone; the hub's 30-s
  // passive ingest settles the unsaid marker through the write path: said once, cleared.
  const { execFileSync } = await import('child_process');
  const renderSL = (toolArgs, d, key, rl, sid = 'sess-qm21') => {
    const payload = JSON.stringify({ session_id: sid, model: { id: 'claude-fable-5', display_name: 'Fable 5' }, rate_limits: rl });
    const f = W.cacheFileFor(d, key); try { const old = (Date.now() - 60000) / 1000; fs.utimesSync(f, old, old); } catch { }
    execFileSync(toolArgs[0], toolArgs.slice(1), { input: payload, encoding: 'utf8', env: { ...process.env, VIBESPACE_USAGE_CACHE: d, VIBESPACE_ACCOUNT_KEY: key, HOME: d } });
    try { return readJ(d, key); } catch { return null; }
  };
  const RLW = (pct) => ({ seven_day: { used_percentage: pct, resets_at: nowSec + 200000, status: 'allowed' } });
  const RL5 = (pct) => ({ five_hour: { used_percentage: 12, resets_at: nowSec + 3600, status: 'allowed' }, ...RLW(pct) });
  // a 5h window that BEGINS now — after any tombstone this suite lays (the RETURN; r4: an older one is stale, ㉑7b)
  const RL5new = (pct) => ({ five_hour: { used_percentage: 3, resets_at: Math.floor(Date.now() / 1000) + 5 * 3600 + 60, status: 'allowed' }, ...RLW(pct) });
  // the passive ingest's settle, spelled as src/usage-routes.js ingestPassiveUsage spells it
  const settle = (d, key, wcm = W) => wcm.writeCacheObject({ cacheDir: d, key, obj: readJ(d, key), familyOf: familyOfScopedBucket, backend: 'claude' });
  const TOOL21 = path.join(ROOT, 'data/bin/vibespace-usage');
  const e2e = (toolArgs, wcm = W) => {
    const d = mkd('s'), key = 'sub-n5h-sl';
    seed5h(d, key, { u5: 0.71 });
    const got = [];
    const st = () => { const w = settle(d, key, wcm); if (w.windowChange) got.push(w.windowChange.change); return readJ(d, key); };
    const r0 = renderSL(toolArgs, d, key, RLW(46)); st();   // the first passive reading: nothing to compare with
    const r1 = renderSL(toolArgs, d, key, RLW(47)); st();   // the week MOVED, no five_hour: witness 1
    const r2 = renderSL(toolArgs, d, key, RLW(48));         // witness 2: the tombstone + ONE unsaid marker
    const settled = st();
    const again = renderSL(toolArgs, d, key, RLW(48)); st();
    const back = renderSL(toolArgs, d, key, RL5new(48));
    const backSettled = st();
    return { key, r0, r1, r2, settled, again, back, backSettled, got };
  };
  const E2E = e2e([TOOL21]);
  ok(E2E.r0.fiveHour && E2E.r0.fiveHour.utilization === 0.71 && !E2E.r0.fiveHourAbsent && E2E.r1.fiveHour && WN(E2E.r1, 'sl:sess-qm21') === 1 && !E2E.r1.fiveHourAbsent,
    `㉑1k the statusline keeps the file's last stated 5h window (never a fabricated 0 % 'unknown' one) through a render without five_hour; one MOVED render is witness 1, no tombstone — ${JSON.stringify({ r0: E2E.r0.fiveHour, w1: E2E.r1.fiveHourAbsentWitnesses })}`);
  ok(E2E.r2.fiveHour === undefined && E2E.r2.fiveHourAbsent > 0 && E2E.r2.windowChangeUnsaid && E2E.r2.windowChangeUnsaid.change === 'removed' && SINCE(planOf(E2E.r2, E2E.key), '5h') > 0,
    '㉑1k …the SECOND moved render drops the 5h bucket, writes the dated tombstone the lift reads back, and leaves ONE unsaid marker');
  ok(E2E.got.filter((c) => c === 'removed').length === 1 && !E2E.settled.windowChangeUnsaid,
    `㉑2f the 30-s passive ingest's settle write says it ONCE and clears the marker — said ${JSON.stringify(E2E.got)}`);
  ok(!E2E.again.windowChangeUnsaid && E2E.again.fiveHourAbsent === E2E.r2.fiveHourAbsent,
    '㉑2f …never per render: the next render keeps the tombstone at the instant it was FIRST said, and leaves nothing to say');
  ok(E2E.back.fiveHour && E2E.back.windowChangeUnsaid && E2E.back.windowChangeUnsaid.change === 'restored' && E2E.got[E2E.got.length - 1] === 'restored' && !E2E.backSettled.fiveHourAbsent && !E2E.backSettled.windowChangeUnsaid,
    '㉑2f a render that states a 5h window NEWER than the removal brings the window BACK, said the same way (restored) once the ingest settles it');
  const UR21 = fs.readFileSync(path.join(ROOT, 'src/usage-routes.js'), 'utf8');
  ok(/if \(u\.windowChangeUnsaid\) \{\n\s+try \{ const w = usageWrite\.writeCacheObject\(\{ cacheDir: USAGE_CACHE_DIR, key, obj: u, familyOf: familyOfScopedBucket, backend: 'claude' \}\);/.test(UR21) && /setInterval\(ingestPassiveUsage, 30000\)/.test(UR21),
    '㉑2f the hub\'s passive ingest (every 30 s) settles a file carrying the marker through the ONE write path');
  // ㉑3a–㉑3d: THE ACCEPTANCE r2 BLOCKER'S OWN SHAPES (the reviewer's names)
  const shapes = (toolArgs, wcm = W) => {
    const out = {};
    { // ㉑3a the reset-time render: the week did NOT move since the previous reading, five_hour is gone (its reset passed)
      const d = mkd('ra'), key = 'sub-n5h-reset';
      W.writeCacheObject({ cacheDir: d, key, backend: 'claude', familyOf: familyOfScopedBucket, source: 'passive', measuredAt: Date.now() - 300000,
        obj: { fiveHour: { utilization: 0.37, resetsAt: nowSec - 30 }, sevenDay: { utilization: 0.46, resetsAt: nowSec + 200000 }, scopedWeekly: [], fetchedAt: Date.now() - 300000, source: 'passive' } });
      // the session's own render BEFORE the reset (the week + its 5h window): its baseline
      renderSL(toolArgs, d, key, { five_hour: { used_percentage: 37, resets_at: nowSec - 30, status: 'allowed' }, ...RLW(46) });
      const n0 = said.length, got = [];
      const r = renderSL(toolArgs, d, key, RLW(46)); const w = settle(d, key, wcm); if (w.windowChange) got.push(w.windowChange.change);
      const r2 = renderSL(toolArgs, d, key, RLW(46)); const w2 = settle(d, key, wcm); if (w2.windowChange) got.push(w2.windowChange.change);
      out.a = { r, r2, got, saidHere: said.length - n0 };
    }
    { // ㉑3b two API-answered renders (the week moved twice) without five_hour: the tombstone + ONE notice
      const d = mkd('rb'), key = 'sub-n5h-two'; seed5h(d, key, { u5: 0.2 });
      const got = [];
      for (const pct of [50, 51, 52, 52]) { renderSL(toolArgs, d, key, RLW(pct)); const w = settle(d, key, wcm); if (w.windowChange) got.push(w.windowChange.change); }
      out.b = { f: readJ(d, key), got };
    }
    { // ㉑3c one moved render, then a five_hour render, then one more moved render: nothing said, no tombstone
      const d = mkd('rc'), key = 'sub-n5h-flap'; seed5h(d, key, { u5: 0.2 });
      const got = [];
      for (const rl of [RLW(60), RLW(61), RL5(61), RLW(62)]) { renderSL(toolArgs, d, key, rl); const w = settle(d, key, wcm); if (w.windowChange) got.push(w.windowChange.change); }
      out.c = { f: readJ(d, key), got };
    }
    { // ㉑3d a render with NEITHER window states nothing (no file write, never a 5h)
      const d = mkd('rd'), key = 'sub-n5h-none'; seed5h(d, key, { u5: 0.3 });
      const before = fs.readFileSync(W.cacheFileFor(d, key), 'utf8');
      renderSL(toolArgs, d, key, {});
      out.d = { same: fs.readFileSync(W.cacheFileFor(d, key), 'utf8') === before };
    }
    return out;
  };
  const SH = shapes([TOOL21]);
  ok(SH.a.r.fiveHour && SH.a.r.fiveHour.utilization === 0.37 && !SH.a.r.fiveHourAbsent && maxN(SH.a.r) === 0 && !SH.a.r2.fiveHourAbsent && !SH.a.got.length && SH.a.saidHere === 0,
    `㉑3a the RESET-TIME render (the week unchanged since the previous reading, no five_hour) lays NO tombstone, counts no witness and says nothing — the passed 5h window stays (unconfirmed) — ${JSON.stringify({ f: SH.a.r.fiveHour, abs: SH.a.r.fiveHourAbsent, w: SH.a.r.fiveHourAbsentWitnesses, got: SH.a.got })}`);
  ok(SH.b.f.fiveHour === undefined && SH.b.f.fiveHourAbsent > 0 && JSON.stringify(SH.b.got) === '["removed"]',
    `㉑3b TWO API-answered renders (the week moved twice) without five_hour ⇒ the tombstone + ONE notice — said ${JSON.stringify(SH.b.got)}`);
  ok(SH.c.f.fiveHour && !SH.c.f.fiveHourAbsent && WN(SH.c.f, 'sl:sess-qm21') === 1 && !SH.c.got.length,
    `㉑3c one moved render then a five_hour render ⇒ nothing said, the count ENDS (one more moved render is witness 1 again — no flap) — said ${JSON.stringify(SH.c.got)}`);
  const oNone = CQ.parseOAuthUsage({ limits: [{ kind: 'weekly_scoped', percent: 30, scope: { model: { display_name: 'Fable' } } }] });
  const gNone = ADP.parseGetUsageResponse({ rate_limits: { model_scoped: [{ display_name: 'Fable', utilization: 30 }] } });
  ok(SH.d.same && oNone && oNone.fiveHour == null && oNone.sevenDay == null && JSON.stringify(AW(oNone)) === '[]' && gNone && gNone.fiveHour == null && gNone.sevenDay == null,
    `㉑3d a payload with NEITHER five_hour nor seven_day states NO window: the statusline writes nothing, the OAuth (limits[]-only) and get_usage (model_scoped-only) parses invent neither — got ${JSON.stringify({ o: oNone && oNone.fiveHour, g: gNone && gNone.fiveHour })}`);
  {
    const d = mkd('rd2'), key = 'sub-n5h-undo'; seed5h(d, key);
    const pw = panelWrite(d, key, CQ.parseCliUsageText(PANEL_NO5H, Date.now()));
    const n0 = said.length;
    // parsed AFTER the removal is laid, a millisecond later on any tree (acceptance r3 F2: parsed before it, a tree that
    // invents a 0 % window read the leg green or red by whether two steps shared a millisecond)
    const t0 = Date.now(); while (Date.now() <= t0) { /* the next millisecond */ }
    const oAfter = CQ.parseOAuthUsage({ limits: [{ kind: 'weekly_scoped', percent: 30, scope: { model: { display_name: 'Fable' } } }] });
    const r = W.writeCacheObject({ cacheDir: d, key, obj: { ...oAfter, source: 'on-demand' }, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude', absentWindows: AW(oAfter) });
    const f = readJ(d, key);
    ok(pw.windowChange && pw.windowChange.change === 'removed' && f.fiveHour === undefined && f.fiveHourAbsent > 0 && !r.windowChange && said.length === n0,
      '㉑3d …and that reply, written after a removal, no longer UNDOES it (no fake window, no false «back»)');
  }

  // THE STANDING REPAIR (acceptance r2 MAJOR 2; r4: acceptance r3 MAJOR 2 — the guard read the CALLER's `prev`, and
  // repairSidecarsByApiPhase, the boot + hourly repair, builds its prev without the tombstone). Driven through the REAL
  // repair: a member whose snapshot's week is in a FOREIGN phase is rebuilt from its newest own anchor.
  const RR = require(path.join(ROOT, 'src/reading-repair.js'));
  const apiPhaseRepair = (RRm, { anchorAfter = false, selfTomb = false } = {}) => {
    const d = mkd('ap'), dataDir = path.join(d, 'data');
    const anchors = path.join(dataDir, 'usage-anchors'), cache = path.join(dataDir, 'usage-cache');
    for (const q of [anchors, cache, path.join(dataDir, 'archive')]) fs.mkdirSync(q, { recursive: true });
    const M = 'sub-n5h-api', H = 3600, nowMs = Date.now();
    const WA = nowSec + 3 * 86400, WF = nowSec + 6 * 86400 + 16 * H; // its own API phase / another member's
    const at = (h) => nowMs - Math.round(h * H * 1000);
    const T = at(6); // «no 5h limit» since six hours ago
    const rec = (ts, u, u5, source) => ({ ts, fetchedAt: ts, source, accountId: M, identityKey: 'org_n5h', buckets: { fiveHour: { u: u5, resetsAt: Math.floor(ts / 1000) + 2 * H }, sevenDay: { u, resetsAt: WA }, scopedWeekly: [] }, prevFetchedAt: null, elapsedSec: null, costSince: null });
    const rows = [rec(at(40), 0.10, 0.3, 'on-demand'), rec(at(36), 0.12, 0.3, 'rate-limit-event'), rec(at(30), 0.14, 0.3, 'rate-limit-event'), rec(at(24), 0.16, 0.3, 'rate-limit-event'), rec(at(18), 0.18, 0.3, 'rate-limit-event')];
    if (anchorAfter) rows.push(rec(at(2), 0.20, 0.12, 'rate-limit-event')); // a reading AFTER the removal that states a 5h window
    fs.writeFileSync(path.join(anchors, 'anchors-org_n5h.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    // (r5: `selfTomb` = the tombstone came WITH the foreign snapshot — laid at the instant it was read)
    fs.writeFileSync(path.join(cache, M + '.json'), JSON.stringify({ fetchedAt: at(1), source: 'on-demand', fiveHourAbsent: selfTomb ? at(1) : T, sevenDay: { utilization: 0.5, resetsAt: WF }, scopedWeekly: [] }));
    const rep = RRm.repairSidecarsByApiPhase({ dataDir, accounts: [{ id: M, name: 'Member M', type: 'subscription', backend: 'claude' }], id: 'T21' });
    const row = (rep && rep.identities || []).find((r) => r.key === M) || {};
    return { f: JSON.parse(fs.readFileSync(path.join(cache, M + '.json'), 'utf8')), row, T };
  };
  {
    const A = apiPhaseRepair(RR), B = apiPhaseRepair(RR, { anchorAfter: true });
    ok(A.row.cache === 'replaced' && A.f.fiveHour === undefined && A.f.fiveHourAbsent === A.T && A.f.sevenDay && A.f.sevenDay.utilization === 0.18,
      `㉑7h the STANDING repair (repairSidecarsByApiPhase, boot + hourly) rebuilds a «no 5h» member from its own anchors read BEFORE the removal and keeps «no 5h limit» — the tombstone read from the TARGET file, never re-creating the 30 % window — ${JSON.stringify({ cache: A.row.cache, f5: A.f.fiveHour, abs: A.f.fiveHourAbsent === A.T })}`);
    ok(B.row.cache === 'replaced' && B.f.fiveHour && Math.abs(B.f.fiveHour.utilization - 0.12) < 1e-9,
      `㉑3f' …an anchor read AFTER the removal that states a 5h window is the window BACK — ${JSON.stringify({ cache: B.row.cache, f5: B.f.fiveHour })}`);
  }

  // ── r4 (acceptance r3 BLOCKER): THE WITNESS IS PER PRODUCER — every session on an account writes ONE file ─────
  // A and B are two claude sessions on one member. Each CLI holds its OWN last API answer; after the 5h reset both drop
  // five_hour, each re-renders its own stale week. The file's last writer is no baseline.
  const rlW = (pct, reset = nowSec + 200000) => ({ seven_day: { used_percentage: pct, resets_at: reset, status: 'allowed' } });
  const rl5 = (pct, r5 = nowSec + 3600) => ({ five_hour: { used_percentage: 20, resets_at: r5, status: 'allowed' }, ...rlW(pct) });
  const play = (toolArgs, steps, wcm = W) => {
    const d = mkd('pp'), key = 'sub-n5h-pp'; seed5h(d, key);
    const got = [], files = [];
    for (const [sid, rl, noSettle] of steps) {
      renderSL(toolArgs, d, key, typeof rl === 'function' ? rl() : rl, sid);
      if (!noSettle) { const w = settle(d, key, wcm); if (w.windowChange) got.push(w.windowChange.change); }
      files.push(readJ(d, key));
    }
    return { f: readJ(d, key), got, files, d, key };
  };
  const FLAP = [['B', rl5(42)], ['A', rl5(40)], ['A', rlW(40)], ['B', rlW(42)], ['A', rlW(40)], ['B', rlW(42)], ['A', rlW(40)], ['B', rlW(42)]];
  const STALE = [['A', rlW(50)], ['A', rlW(51)], ['A', rlW(52)], ['C', rl5(52)], ['C', rl5(52)]];
  const r4shapes = (toolArgs, wcm = W) => {
    const o = {};
    o.a = play(toolArgs, [...FLAP, ['B', () => RL5new(43)]], wcm);
    o.b = play(toolArgs, [...STALE, ['A', () => RL5new(53)]], wcm);
    o.b.atStale = o.b.files[4];
    o.c = play(toolArgs, [['A', rl5(40)], ['A', rlW(41)], ['B', rlW(41)], ['B', rlW(42)], ['A', rlW(43)]], wcm);
    o.d = play(toolArgs, [['A', rl5(40)], ['C', rlW(41)], ['C', rlW(41)]], wcm);
    o.e = play(toolArgs, [['A', rl5(42)], ['A', rlW(40)], ['A', rlW(42)], ['A', rlW(43)]], wcm);
    o.e2 = play(toolArgs, [['A', rl5(90)], ['A', rlW(5, nowSec + 200000 + 7 * 86400)]], wcm);
    o.l = play(toolArgs, [['A', rlW(50), 1], ['A', rlW(51), 1], ['A', rlW(52), 1], ['A', () => RL5new(52), 1]], wcm);
    o.l.marker = o.l.files[2].windowChangeUnsaid || null;
    { const w = settle(o.l.d, o.l.key, wcm); if (w.windowChange) o.l.got.push(w.windowChange.change); o.l.f = readJ(o.l.d, o.l.key); }
    return o;
  };
  const R4 = r4shapes([TOOL21]);
  ok(R4.a.files.every((f) => !f.fiveHourAbsent) && maxN(R4.a.f) === 0 && !R4.a.got.length && R4.a.f.fiveHour,
    `㉑7a THE TWO-SESSION FLAP: sessions A (week 40) and B (week 42) re-render their own stale states after the 5h reset, alternating — NO witness, NO tombstone, nothing said, and B's next answer with a 5h window says no «back» — said ${JSON.stringify(R4.a.got)}`);
  ok(R4.b.got[0] === 'removed' && R4.b.atStale && R4.b.atStale.fiveHour === undefined && R4.b.atStale.fiveHourAbsent === R4.b.files[2].fiveHourAbsent && R4.b.got.length === 2 && R4.b.got[1] === 'restored',
    `㉑7b A STALE 5h WINDOW IS NO RETURN: after a real lift (A's two moved answers), an idle session C still holding a 5h window that BEGAN BEFORE the tombstone renders it twice — kept out, the tombstone stands at its instant, nothing said; a 5h window that began after it restores ONCE — said ${JSON.stringify(R4.b.got)}`);
  ok(R4.c.files[3].fiveHourAbsent === undefined && WN(R4.c.files[3], 'sl:A') === 1 && WN(R4.c.files[3], 'sl:B') === 1 && R4.c.f.fiveHourAbsent > 0 && JSON.stringify(R4.c.got) === '["removed"]',
    `㉑7c PER PRODUCER: one moved answer from A and one from B are two producers' FIRST witnesses — no tombstone; A's SECOND lays it and says «removed» once — ${JSON.stringify({ w: R4.c.files[3].fiveHourAbsentWitnesses, got: R4.c.got })}`);
  ok(R4.d.files.every((f) => !f.fiveHourAbsent) && maxN(R4.d.f) === 0 && !R4.d.got.length,
    `㉑7d a NEW session's first render (its week differs from the file's last writer's) is never a witness — it only sets its own baseline — ${JSON.stringify(R4.d.f.fiveHourAbsentWitnesses)}`);
  ok(maxN(R4.e.files[2]) === 0 && WN(R4.e.f, 'sl:A') === 1 && !R4.e.f.fiveHourAbsent && WN(R4.e2.f, 'sl:A') === 1,
    `㉑7e MOVEMENT IS FORWARD ONLY: an older (40 after 42) or equal reading is never movement; a higher % of the same week is, and so is a NEW week at a lower % — ${JSON.stringify({ e: R4.e.files[2].fiveHourAbsentWitnesses, e2: R4.e2.f.fiveHourAbsentWitnesses })}`);
  ok(R4.l.marker && R4.l.marker.change === 'removed' && !R4.l.got.length && R4.l.f.fiveHour && !R4.l.f.fiveHourAbsent && !R4.l.f.windowChangeUnsaid,
    `㉑7l A CHANGE UNDONE BEFORE IT WAS SAID (removed, then a newer 5h window, between two 30-s ingests) cancels its marker: the settle says nothing — said ${JSON.stringify(R4.l.got)}`);
  // the stream's twin: the capture counts for the session whose stream it is (`producer`)
  {
    const d = mkd('pf'), k = 'sub-n5h-pf'; seed5h(d, k);
    const evWk5 = (pct7) => CAP.parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.2, resetsAt: nowSec + 3600, unifiedWindows: { five_hour: { utilization: 0.2, resets_at: nowSec + 3600 }, seven_day: { utilization: pct7 / 100, resets_at: nowSec + 3 * 86400 } } } });
    const n0 = said.length;
    capture(d, k, evWk5(42), [k], CAP, 'ev:B'); capture(d, k, evWk5(40), [k], CAP, 'ev:A');
    for (let i = 0; i < 3; i++) { capture(d, k, evWeek(40), [k], CAP, 'ev:A'); capture(d, k, evWeek(42), [k], CAP, 'ev:B'); }
    const f = readJ(d, k);
    ok(f.fiveHour && !f.fiveHourAbsent && maxN(f) === 0 && !said.slice(n0).some((x) => x.key === k),
      `㉑7f the STREAM twin: two sessions' records alternating stale weeks (40 / 42) lay no tombstone and say nothing — ${JSON.stringify({ w: f.fiveHourAbsentWitnesses, abs: f.fiveHourAbsent })}`);
    capture(d, k, evWeek(41), [k], CAP, null); capture(d, k, evWeek(43), [k], CAP, null); capture(d, k, evWeek(44), [k], CAP, null);
    ok(!readJ(d, k).fiveHourAbsent, '㉑7f …and a record that names no producer (a replay, a re-drive) is never a witness');
  }
  // ── r4 (acceptance r3 MAJOR 1): a sibling's bookkeeping never rides the freshest-sibling spread ───────────────
  const sibMarker = (CAPm = CAP, wcm = W) => {
    const d = mkd('sm'), X = 'sub-n5h-x', G = 'sub-n5h-g';
    seed5h(d, X, { at: Date.now() - 300000 }); seed5h(d, G, { at: Date.now() - 300000 });
    for (const pct of [46, 47, 48]) { renderSL([TOOL21], d, G, rlW(pct), 'sess-g'); settle(d, G, wcm); } // G: removed, said
    renderSL([TOOL21], d, G, RL5new(48), 'sess-g');                                                      // G: back — UNSAID yet
    const gm = readJ(d, G).windowChangeUnsaid || null;
    const saidX = [];
    const lis = fnOf(wcm, 'onWindowChange'); if (lis) lis((c) => { said.push(c); if (c.key === X) saidX.push(c.change); });
    CAPm.captureRateLimitEvent({ cacheDir: d, key: X, identityIds: [X, G], ev: ev5(5), now: Date.now(), producer: 'ev:x' });
    if (lis) lis((c) => said.push(c));
    return { gm, saidX, fx: readJ(d, X) };
  };
  {
    const S = sibMarker();
    ok(S.gm && S.gm.change === 'restored' && !S.saidX.length && S.fx.fiveHour && !S.fx.windowChangeUnsaid,
      `㉑7g a SIBLING's unsaid «back» (its own statusline's, on the fresher file) riding the capture's freshest-sibling spread is never said on a member that never changed — said on it ${JSON.stringify(S.saidX)}`);
    const d = mkd('st'), X = 'sub-n5h-x2', G2 = 'sub-n5h-g2', n0 = said.length;
    seed5h(d, X, { at: Date.now() - 300000 }); seed5h(d, G2, { at: Date.now() - 300000 });
    panelWrite(d, G2, CQ.parseCliUsageText(PANEL_NO5H, Date.now()));       // the sibling's own «no 5h limit», laid now
    CAP.captureRateLimitEvent({ cacheDir: d, key: X, identityIds: [X, G2], ev: evWeek(41), now: Date.now() + 1000, producer: 'ev:x2' });
    const fx = readJ(d, X);
    ok(fx.fiveHour && fx.fiveHour.utilization === 0.84 && !fx.fiveHourAbsent && !said.slice(n0).some((x) => x.key === X),
      `㉑7g …nor does a SIBLING's tombstone: a record on a member with its own 5h window keeps it (no false «lifted») — ${JSON.stringify({ f5: fx.fiveHour, abs: fx.fiveHourAbsent })}`);
  }
  // ── r4: the READ side — the identity group's freshest-file substitution keeps a member's own «no 5h limit» ──────
  {
    const wo = fnOf(QM, 'withOwnAbsence');
    const T5 = Date.now() - 3600e3;
    const own = { fiveHourAbsent: T5, sevenDay: { utilization: 0.4, resetsAt: nowSec + 86400 }, fetchedAt: Date.now() - 60000 };
    const sib = { fiveHour: { utilization: 0.2, resetsAt: nowSec + 3600 }, sevenDay: { utilization: 0.41, resetsAt: nowSec + 86400 }, fetchedAt: Date.now(),
      limits: [QM.makeLimit({ limitId: 'plan', scope: 'plan', windows: [QM.makeWindow({ kind: '5h', usedPct: 20, resetsAt: nowSec + 3600, measuredAt: Date.now() }), QM.makeWindow({ kind: '7d', usedPct: 41, resetsAt: nowSec + 86400, measuredAt: Date.now() })] })] };
    const r = wo ? wo(sib, own) : sib;
    const ENG7 = fs.readFileSync(path.join(ROOT, 'src/server/usage-pool-engine.js'), 'utf8'), UR7 = fs.readFileSync(path.join(ROOT, 'src/usage-routes.js'), 'utf8');
    ok(!!wo && r.fiveHour === undefined && r.fiveHourAbsent === T5 && r.sevenDay.utilization === 0.41 && !QM.windowOfKind(QM.planLimit({ limits: r.limits }), '5h') && SINCE(QM.planLimit({ limits: r.limits }), '5h') === T5 && wo(sib, null) === sib,
      `㉑7i a fresher SIBLING read in place of a «no 5h» member keeps the member's tombstone — its 5h window (legacy + typed) never outranks it — ${JSON.stringify({ f5: r.fiveHour, abs: r.fiveHourAbsent })}`);
    ok((ENG7.match(/raw = quotaModel\.withOwnAbsence\(g\.cache, raw\); break;/g) || []).length === 2 && /_accountUsage\[gid\] = \{ \.\.\.quotaModel\.withOwnAbsence\(newest, a\),/.test(UR7) && /_rateLimitCache = quotaModel\.withOwnAbsence\(usage, g\);/.test(UR7),
      '㉑7i …and every substitution reads through it: the pool\'s two readCache (the chooser + the engine) and the Usage popup\'s same-account merge');
  }
  // ── r4 (acceptance r3 minors): ONE item per member; the unknown window in words ─────────────────────────────────
  {
    const { UserTodoManager } = require(path.join(ROOT, 'src/user-todos.js'));
    const m = new UserTodoManager({ dataDir: mkd('ut'), onChange() { }, expirySweepMs: 0 });
    const ENGs = fs.readFileSync(path.join(ROOT, 'src/server/usage-pool-engine.js'), 'utf8');
    const s0 = ENGs.indexOf('const WINDOW_REMOVED_TEXT'), s1 = ENGs.indexOf('usageWrite.onWindowChange(noteWindowChange);');
    let fn = null;
    try { fn = new Function('accounts', 'OF', 'getUserTodos', 'i18nKey', 'global', ENGs.slice(s0, s1) + '\nreturn noteWindowChange;')({ get: (id) => (id === 'sub-y' ? { id, type: 'subscription', name: 'Pool 3' } : null) }, { when: () => 'Oct 30 17:40' }, () => m, (s) => s, {}); } catch { fn = null; }
    const mine = () => m._state.items.filter((i) => i.sessionKey === 'webui:usage-window' && !i.clearedAt);
    if (fn) { fn({ key: 'sub-y', kind: '5h', change: 'removed', at: Date.now() }); fn({ key: 'sub-y', kind: '5h', change: 'restored', at: Date.now() }); }
    const one = mine();
    ok(one.length === 1 && one[0].status === 'open' && /5-hour limit is back/.test(one[0].text),
      `㉑7j ONE For-you item per member: «back» filed after «lifted» REPLACES its words — never two open contradictions — ${JSON.stringify(one.map((i) => [i.itemKey, i.status, i.text.slice(0, 40)]))}`);
    if (one[0]) m.setStatus(one[0].id, 'done');
    if (fn) fn({ key: 'sub-y', kind: '5h', change: 'removed', at: Date.now() });
    const two = mine();
    ok(two.length === 1 && two[0].status === 'open' && /was lifted by Anthropic/.test(two[0].text),
      `㉑7j …and a later change re-opens that SAME item with the current state — ${JSON.stringify(two.map((i) => [i.itemKey, i.status]))}`);
    try { m.stop(); } catch { }
  }
  {
    const AR = require(path.join(ROOT, 'src/server/auto-resume.js'));
    const soon = Date.now() + 3600e3;
    const cause = { scope: 'pool', soonest: { id: 'sub-y', name: 'Pool 3', bucket: { label: '7d', resetsAt: soon } }, rejector: { id: 'sub-y', name: 'Pool 3', ownWall: { label: null, unknownWindow: true, resetsAt: 0 }, floor: [] } };
    const s = AR.armNoticeFor('usage limit', soon, Date.now(), cause);
    const ENGk = fs.readFileSync(path.join(ROOT, 'src/server/usage-pool-engine.js'), 'utf8'), CSB = fs.readFileSync(path.join(ROOT, 'src/lib/chat-status-bar.js'), 'utf8');
    const zhK = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), jaK = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
    const KEY = '"{m}: its limit window is unknown (it has no 5-hour limit).": ';
    ok(/限额窗口未知/.test(s) && !/window unknown/.test(s) && !/的 7d /.test(s),
      `㉑7k a guessed wall on a «no 5h» member says in the card's words that its limit window is UNKNOWN — never the raw token, never a window it cannot know — ${JSON.stringify(s)}`);
    ok(!/\? 'window unknown' :/.test(ENGk) && /done\.push\(\{ label, until, \.\.\.\(unknownWindow \? \{ unknownWindow: true \} : \{\}\) \}\);/.test(ENGk) && /unknownWindow \? null : BUCKET_LABEL\[b\.kind\]/.test(ENGk) && /own && own\.unknownWindow \? \{ label: null, unknownWindow: true,/.test(ENGk)
      && CSB.includes("t('{m}: its limit window is unknown (it has no 5-hour limit).', { m: r.name })") && zhK.includes(KEY) && jaK.includes(KEY),
      '㉑7k …the wall names no label (`unknownWindow`), the cause carries it, and the status bar says it through t() — zh + ja');
  }
  // ── r4: ONE RULE, TWO SPELLINGS — the shipped statusline mirrors quota-model's witness block byte for byte ──────
  {
    const cut = (txt) => { const open = txt.split('// >>> 5h-witness mirror'); const shut = open.length === 2 ? open[1].split('// <<< 5h-witness mirror') : []; return shut.length === 2 ? '// >>> 5h-witness mirror' + shut[0] : null; };
    const bSrc = cut(fs.readFileSync(path.join(ROOT, 'src/quota-model.js'), 'utf8')), bTool = cut(fs.readFileSync(TOOL21, 'utf8'));
    ok(!!bSrc && bSrc.length > 2000 && bSrc === bTool, `㉑7m the statusline carries a BYTE-IDENTICAL copy of the witness rule (it ships to checkout-less hosts and cannot require src/) — src=${bSrc && bSrc.length} tool=${bTool && bTool.length}`);
    let fT = null; try { fT = new Function(bTool + '\nreturn { countPassiveAnswer, weekMovedForward, planWeekSigOf };')(); } catch { fT = null; }
    const now7 = Date.now(), TAB = [
      { witnesses: null, producer: 'p', sig: '7d:40@100000', fiveHour: null, absent5h: true, absentAt: 0, now: now7 },
      { witnesses: { p: { n: 1, lastSig: '7d:40@100000', at: now7 - 1000 } }, producer: 'p', sig: '7d:41@100000', fiveHour: null, absent5h: true, absentAt: 0, now: now7 },
      { witnesses: { p: { n: 0, lastSig: '7d:42@100000', at: now7 - 1000 } }, producer: 'p', sig: '7d:40@100000', fiveHour: null, absent5h: true, absentAt: 0, now: now7 },
      { witnesses: { p: { n: 0, lastSig: '7d:42@100000', at: now7 - 1000 } }, producer: 'q', sig: '7d:42@100000', fiveHour: { resetsAt: Math.floor(now7 / 1000) + 3600 }, absent5h: false, absentAt: now7 - 60000, now: now7 },
      { witnesses: { p: { n: 0, lastSig: '7d:42@100000', at: now7 - 1000 } }, producer: 'p', sig: '7d:42@100000', fiveHour: { resetsAt: Math.floor(now7 / 1000) + 5 * 3600 }, absent5h: false, absentAt: now7 - 60000, now: now7 },
      { witnesses: { old: { n: 1, lastSig: '7d:1@1', at: now7 - 25 * 3600e3 } }, producer: null, sig: null, fiveHour: null, absent5h: false, absentAt: 0, now: now7 },
    ];
    const same = !!fT && TAB.every((row) => JSON.stringify(fT.countPassiveAnswer(row)) === JSON.stringify(QM.countPassiveAnswer(row)));
    const out = fT ? TAB.map((row) => fT.countPassiveAnswer(row)) : [];
    ok(same && out[1].lay && !out[2].moved && out[3].stale && out[4].restore && !Object.keys(out[5].witnesses).length,
      `㉑7m …and the SHIPPED bytes decide like the model over one table (lay on a producer's second moved answer, backward is no movement, stale vs back, 24-h bound) — ${JSON.stringify(out.map((o) => [o.lay, o.moved, o.stale, o.restore]))}`);
  }

  // ── r5 (acceptance r4): EVERY READER of a member's buckets keeps its own «no 5h limit» ─────────────────────────
  // #1 THE ESTIMATED VIEW. An anchor is the IDENTITY's: the 60-s sweep records the group's freshest file — here a
  // sibling still holding a 90.5 % 5h window — so the estimate, the overlay and the sweep itself read through
  // withOwnAbsence (the real modules; the engine-level replay is test-fable-cap-pool-storm ㉑3i)
  const EST = require(path.join(ROOT, 'src/usage-estimator.js'));
  const { UsageAnchors } = require(path.join(ROOT, 'src/usage-anchors.js'));
  const T8 = Date.now() - 3600e3;
  const own8 = { fetchedAt: Date.now() - 120000, source: 'on-demand', orgUuid: 'org-n5h-r5', fiveHourAbsent: T8, sevenDay: { utilization: 0.4, resetsAt: nowSec + 86400 }, scopedWeekly: [] };
  const sib8 = { fetchedAt: Date.now() - 1000, source: 'passive', orgUuid: 'org-n5h-r5', fiveHour: { utilization: 0.905, resetsAt: nowSec + 3 * 3600 }, sevenDay: { utilization: 0.41, resetsAt: nowSec + 86400 }, scopedWeekly: [] };
  const view8 = QM.withOwnAbsence(sib8, own8); // the engine's readCache substitution (r4)
  const est8 = { estimated: true, anchorAt: sib8.fetchedAt, asOf: Date.now(), fiveHour: { utilization: 0.905, resetsAt: nowSec + 3 * 3600, estimated: true }, sevenDay: { utilization: 0.41, resetsAt: nowSec + 86400, estimated: true }, scopedWeekly: [] };
  const overlay8 = (E = EST) => E.overlayCache(view8, est8);
  const estimateFor8 = (E = EST) => {
    const dir = mkd('est');
    fs.writeFileSync(path.join(dir, 'anchors-org_org-n5h-r5.ndjson'), JSON.stringify({ ts: sib8.fetchedAt, fetchedAt: sib8.fetchedAt, source: 'passive', accountId: null, identityKey: 'org:org-n5h-r5',
      buckets: { fiveHour: { u: 0.905, resetsAt: sib8.fiveHour.resetsAt }, sevenDay: { u: 0.41, resetsAt: sib8.sevenDay.resetsAt }, scopedWeekly: [] }, prevFetchedAt: null, elapsedSec: null, costSince: null }) + '\n');
    const ue = new E.UsageEstimator({ lagS: 0, anchorsDir: dir, usageHistory: { *_events() { }, _cost: () => 0 }, resolveIdentity: () => ({ identityKey: 'org:org-n5h-r5' }), priorsFor: () => E.CLAUDE_MAX_PRIOR_FULL_USD });
    return ue.estimateFor('sub-n5h-r5', view8, Date.now());
  };
  const sweep8 = (E = EST) => {
    const anchors = new UsageAnchors({ dataDir: mkd('swp') });
    const r = E.sweepAnchorGroup({ identityKey: 'org:org-n5h-r5', group: { cache: sib8, accountIds: ['sub-n5h-r5', '__global__'], accountId: null, tomb5h: own8 }, anchors,
      estimator: { accountIdsFor: (k, ids) => ids, ratesFor: () => null, invalidate() { } }, costBetween: () => null, darkHosts: () => [], metric() { } });
    return { r, a: anchors.lastAnchor('org:org-n5h-r5') };
  };
  {
    const v = overlay8();
    ok(v.fiveHour === undefined && QM.fiveHourAbsent(v) === T8 && !!v.sevenDay && v.sevenDay.utilization === 0.41 && v.estimated === true,
      `㉑8a the ESTIMATED view of a «no 5h» member (the overlay over its guarded reading) never puts a 5h bucket back — the week is still estimated — ${JSON.stringify({ f5: v.fiveHour, abs: v.fiveHourAbsent === T8 })}`);
    const e = estimateFor8();
    ok(!!e && e.fiveHour == null && !!e.sevenDay && Math.abs(e.sevenDay.utilization - 0.41) < 1e-6,
      `㉑8b the estimate itself, built from the IDENTITY's newest anchor (a sibling's file still holding a 90.5 % 5h window), states no 5h bucket for the member whose own reading tombstoned it — ${JSON.stringify(e && { f5: e.fiveHour, s7: e.sevenDay && e.sevenDay.utilization })}`);
    const s = sweep8();
    ok(!!s.r.recorded && !!s.a && s.a.buckets.fiveHour === null && !!s.a.buckets.sevenDay && s.a.buckets.sevenDay.u === 0.41,
      `㉑8c the anchor sweep records no 5h bucket over an identity file that stands «no 5h limit» (the week is recorded) — ${JSON.stringify(s.a && s.a.buckets)}`);
  }
  // #2 the auto-cli scheduler's freshest-file substitution: the estimate and the drift it asks for, driven by one real tick
  const ACL = require(path.join(ROOT, 'src/server/auto-cli-loop.js'));
  const autoCli8 = async (L = ACL) => {
    const d = mkd('acl'), cacheDir = path.join(d, 'usage-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'sub-n5h-r5.json'), JSON.stringify(own8));
    const seen = [];
    const loop = L.createAutoCliLoop({ serverSetting: (k) => (k === 'accounts.onDemandQuotaRefresh' ? 'auto-cli' : undefined),
      accounts: { list: () => ({ accounts: [{ id: 'sub-n5h-r5', type: 'subscription', backend: 'claude', name: 'Member R5', loggedIn: true }] }), get: () => null },
      autoCliReady: () => true, USAGE_CACHE_DIR: cacheDir,
      usageIdentityGroupsCached: () => new Map([['org:org-n5h-r5', { accountIds: ['sub-n5h-r5', '__global__'], cache: sib8, accountId: null, tomb5h: own8 }]]),
      usageEstimator: { estimateFor: (id, raw) => { seen.push(raw); return null; } },
      projectionRereadFor: () => null, lastMemberReadAt: () => 0, usage: { refreshViaCliPanel: async () => false, panelVerdictFor: () => null },
      onMemberReadingFresh() { }, dataDir: d, now: () => Date.now(), rand: () => 0.5, log() { }, warn() { } });
    await loop.tick();
    return seen;
  };
  {
    const seen = await autoCli8();
    ok(seen.length === 1 && !!seen[0] && seen[0].fiveHour === undefined && QM.fiveHourAbsent(seen[0]) === T8 && seen[0].fetchedAt === sib8.fetchedAt,
      `㉑8d the auto-cli scheduler reads a «no 5h» account's fresher SIBLING through the account's own tombstone (the estimate and the drift it asks never see the sibling's 5h window) — ${JSON.stringify(seen.map((r) => r && { f5: r.fiveHour, abs: r.fiveHourAbsent === T8 }))}`);
  }
  // #3 THE REPAIR KEEPS THE ACCOUNT's OWN TOMBSTONE: a rebuild replaces a snapshot it has just judged FOREIGN, and a
  // tombstone the foreign readings laid is theirs (the by-slot repair: laid after the login died; the by-window
  // repairs: laid when the foreign snapshot was read)
  const slotRepair8 = (RRm, { tombAt }) => {
    const d = mkd('slot'), cacheDir = path.join(d, 'usage-cache'), archiveDir = path.join(d, 'archive');
    fs.mkdirSync(cacheDir, { recursive: true });
    const M = 'sub-n5h-slot', H = 3600e3, death = Date.now() - 6 * H;
    fs.writeFileSync(path.join(cacheDir, M + '.json'), JSON.stringify({ fetchedAt: death + 2 * H, source: 'rate-limit-event', fiveHourAbsent: tombAt(death), sevenDay: { utilization: 0.7, resetsAt: nowSec + 2 * 86400 }, scopedWeekly: [] }));
    const anchor = { ts: death - 3 * H, fetchedAt: death - 3 * H, source: 'on-demand', accountId: M, identityKey: 'org:n5hslot',
      buckets: { fiveHour: { u: 0.33, resetsAt: nowSec + 3600 }, sevenDay: { u: 0.2, resetsAt: nowSec + 3 * 86400 }, scopedWeekly: [] } };
    const res = RRm.repairUsageCaches({ cacheDir, archiveDir, markers: new Map([[M, { state: 'expired', since: death }]]), anchorFiles: [{ name: 'anchors-org_n5hslot.ndjson', rows: [anchor] }], id: 'T21s' });
    return { res, f: JSON.parse(fs.readFileSync(path.join(cacheDir, M + '.json'), 'utf8')), death };
  };
  const windowRepair8 = (RRm, { selfTomb = false } = {}) => {
    const d = mkd('win'), anchors = path.join(d, 'usage-anchors'), cacheDir = path.join(d, 'usage-cache');
    for (const q of [anchors, cacheDir, path.join(d, 'archive')]) fs.mkdirSync(q, { recursive: true });
    const M = 'sub-n5h-win', H = 3600, nowMs = Date.now();
    const WA = nowSec + 3 * 86400, WF = nowSec + 6 * 86400 + 16 * H; // its own panel phase / another member's
    const at = (h) => nowMs - Math.round(h * H * 1000);
    const rec = (ts, u, u5) => ({ ts, fetchedAt: ts, source: 'on-demand', accountId: M, identityKey: 'org:n5hwin', buckets: { fiveHour: { u: u5, resetsAt: nowSec + 2 * H }, sevenDay: { u, resetsAt: WA }, scopedWeekly: [] }, prevFetchedAt: null, elapsedSec: null, costSince: null });
    const rows = [rec(at(40), 0.10, 0.3), rec(at(36), 0.12, 0.3), rec(at(30), 0.14, 0.3), rec(at(24), 0.16, 0.3), rec(at(18), 0.18, 0.25)];
    fs.writeFileSync(path.join(anchors, 'anchors-org_n5hwin.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const readAt = at(1), T = at(6);
    fs.writeFileSync(path.join(cacheDir, M + '.json'), JSON.stringify({ fetchedAt: readAt, source: 'on-demand', orgUuid: 'n5hwin', fiveHourAbsent: selfTomb ? readAt : T, sevenDay: { utilization: 0.5, resetsAt: WF }, scopedWeekly: [] }));
    const rep = RRm.repairByWindow({ dataDir: d, roster: [M], accounts: [{ id: M, name: 'Member W', type: 'subscription', backend: 'claude' }], id: 'T21w', now: nowMs });
    return { rep, f: JSON.parse(fs.readFileSync(path.join(cacheDir, M + '.json'), 'utf8')), T };
  };
  {
    const A = slotRepair8(RR, { tombAt: (death) => death + 3600e3 }); // laid AFTER the login died: the foreign readings'
    ok(A.res.restored === 1 && !!A.f.fiveHour && Math.abs(A.f.fiveHour.utilization - 0.33) < 1e-9 && !QM.fiveHourAbsent(A.f),
      `㉑8e the by-slot repair (repairUsageCaches) restores the account's own anchor WITH its 5h window when the snapshot it judged foreign carries a tombstone laid after the login died — a foreign snapshot's tombstone is never copied onto the account — ${JSON.stringify({ f5: A.f.fiveHour, abs: A.f.fiveHourAbsent })}`);
    const B = slotRepair8(RR, { tombAt: (death) => death - 3600e3 }); // laid while the login was alive: the account's own
    ok(B.res.restored === 1 && B.f.fiveHour === undefined && B.f.fiveHourAbsent === B.death - 3600e3,
      `㉑8e …and the account's OWN tombstone (laid while its login was alive, after the anchor was read) still outlives the rebuild — ${JSON.stringify({ f5: B.f.fiveHour, abs: B.f.fiveHourAbsent })}`);
    const Wn = windowRepair8(RR, { selfTomb: true }), Wo = windowRepair8(RR);
    const Ap = apiPhaseRepair(RR, { selfTomb: true });
    ok(!!Wn.f.fiveHour && Math.abs(Wn.f.fiveHour.utilization - 0.25) < 1e-9 && !QM.fiveHourAbsent(Wn.f) && !!Ap.f.fiveHour && Math.abs(Ap.f.fiveHour.utilization - 0.3) < 1e-9 && !QM.fiveHourAbsent(Ap.f),
      `㉑8f the two by-window repairs (repairCachesByWindow, repairSidecarsByApiPhase) keep the account's own 5h window when the tombstone came WITH the foreign snapshot (laid when it was read) — ${JSON.stringify({ win: Wn.f.fiveHour, api: Ap.f.fiveHour, abs: [Wn.f.fiveHourAbsent, Ap.f.fiveHourAbsent] })}`);
    ok(Wo.f.fiveHour === undefined && Wo.f.fiveHourAbsent === Wo.T,
      `㉑8f …while a tombstone the file held BEFORE the foreign snapshot was read is the account's own and stays (㉑7h's shape, by window too) — ${JSON.stringify({ f5: Wo.f.fiveHour, abs: Wo.f.fiveHourAbsent === Wo.T })}`);
  }

  // ── rule 3: the WORDS (the banner guess; the popup / roster draw what the reading has) ───────────────────────
  const bGuess = ADP.parseLimitBanner("You've reached your usage limit · resets Nov 3");
  ok(bGuess && bGuess.kind === 'fiveHour' && bGuess.guessed === true && !ADP.parseLimitBanner("You've hit your session limit · resets 3am").guessed,
    '㉑6a an unknown-wording limit banner is a GUESSED 5h wall — a named one is not');
  const ENG = fs.readFileSync(path.join(ROOT, 'src/server/usage-pool-engine.js'), 'utf8');
  ok(!/hit = \{ kind: 'sevenDay', guessed: true \}/.test(ENG) && /const hit = ClaudeCodeAdapter\.parseLimitBanner\(text\);/.test(ENG) && /if \(hit\.kind === 'fiveHour'\) \{ if \(!\(hit\.guessed && tomb5h\(own\)\)\) cache\.fiveHour = bump\(cache\.fiveHour, 5 \* 3600\); \}/.test(ENG),
    '㉑6a …the engine keeps the base wall KIND for a guessed banner (never rewritten to the week — r3), and on a «no 5h» member it has no 5h window to mark (driven in test-fable-cap-pool-storm ㉑3e/㉑3f)');
  const UM = fs.readFileSync(path.join(ROOT, 'src/lib/usage-meter.js'), 'utf8');
  ok(/rows\.push\(renderRow\('claude', has5h \|\| noData \? '5h' : null,/.test(UM) && /\$\{primaryLabel == null \? '' : renderPie\(/.test(UM),
    '㉑6b the taskbar donut pair draws no 5h donut for a reading without one (base: a 0 % «5h» donut)');
  ok(/\$\{has5h \? `<div class="usage-session">\n\s+<div class="usage-session-name">\$\{t\('5-hour limit'\)\}/.test(UM) && /t\('5-hour limit lifted \(\{when\}\)', \{ when: stampText\(no5hSince\) \}\)/.test(UM) && /const no5hSince = quotaModel\.fiveHourAbsent\(rl\);/.test(UM)
    && /t\('No 5-hour limit on this account since \{when\} — weekly limits only\.', \{ when: stampText\(no5hSince\) \}\)/.test(UM) && !/Ultra|Max 20x|\$100/.test(UM),
    '㉑6b the popup shows the 5h row only when the reading has one; a lifted one says «5-hour limit lifted (<time>)» + what was MEASURED («No 5-hour limit on this account since <time> — weekly limits only.»), never a tier, a name or a price');
  const MA = fs.readFileSync(path.join(ROOT, 'src/lib/manage-agents.js'), 'utf8');
  ok(/\[\.\.\.\(has5h \? \[donut\('5h', u\.fiveHour, null, est\?\.fiveHour\)\] : \[\]\), donut\('7d'/.test(MA) && /\[\.\.\.\(has5h \? \[\['5h', u\.fiveHour, est\?\.fiveHour, 'fiveHour'\]\] : \[\]\), \['7d',/.test(MA) && (MA.match(/hostOwnReading\(/g) || []).length === 6,
    '㉑6c the roster draws the week alone (no 0 % 5h donut, no 5h pill) and a weekly-only machine login is a reading (5 gates + the helper)');
  ok(/creditsSlotHtml\(hostOwnReading\(this\._hostOwnUsage\?\.\[selectedHost\]\)\)/.test(MA) && !/_hostOwnUsage\?\.\[[^\]]+\]\?\.fiveHour \?/.test(MA),
    '㉑3g the FIFTH machine-login gate (the credits-slot chip on the same row) reads hostOwnReading too — no gate asks `fiveHour` alone');
  const zh = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
  ok(zh.includes('"5-hour limit lifted ({when})": "5 小时限额已取消（{when}）"') && ja.includes('"5-hour limit lifted ({when})": "5 時間制限は解除されました（{when}）"'),
    '㉑6d «5 小时限额已取消（<time>）» — zh + ja');

  // ── rule 2: the NOTICE — one per member and change, by its label, never an email ────────────────────────────
  const a0 = ENG.indexOf('const WINDOW_REMOVED_TEXT'), a1 = ENG.indexOf('usageWrite.onWindowChange(noteWindowChange);');
  const NSLICE = a0 > 0 && a1 > a0 ? ENG.slice(a0, a1) : '';
  const buildNote = (src) => {
    const filed = [];
    const accounts = { get: (id) => (id === 'sub-x' ? { id, type: 'subscription', name: 'owner@example.com' } : id === 'sub-y' ? { id, type: 'subscription', name: 'Pool 3' } : null) };
    const todos = { add: (k, it) => { filed.push({ k, ...it }); return { id: 't' + filed.length }; } };
    let fn = null;
    try { fn = new Function('accounts', 'OF', 'getUserTodos', 'i18nKey', 'global', src + '\nreturn noteWindowChange;')(accounts, { when: () => 'Oct 30 17:40' }, () => todos, (s) => s, {}); } catch { fn = null; }
    return { fn, filed };
  };
  const N = buildNote(NSLICE);
  ok(!!N.fn, '㉑2e the engine declares the notice (noteWindowChange) beside its wiring to the write path');
  if (N.fn) {
    N.fn({ key: 'sub-y', kind: '5h', change: 'removed', at: Date.now() });
    N.fn({ key: 'sub-x', kind: '5h', change: 'restored', at: Date.now() });
    N.fn({ key: 'host-1', kind: '5h', change: 'removed', at: Date.now() });
  }
  const [n1, n2] = N.filed;
  ok(N.filed.length === 2 && n1.itemKey === '5h-window:sub-y' && n1.origin === 'pool' && n1.kind === 'notice' && /Pool 3's 5-hour limit was lifted by Anthropic/.test(n1.text) && n1.i18n.text.params.account === 'Pool 3',
    `㉑2e ONE For-you notice per member, naming its label (the itemKey is the MEMBER, its words the current state) — filed ${JSON.stringify(N.filed.map((x) => x.itemKey))}`);
  ok(n2 && !/@/.test(n2.text) && n2.i18n.text.params.account === 'sub-x' && /5-hour limit is back/.test(n2.text), '㉑2e …a label that is an email is never printed (the id instead); a host-* file is not a member and files nothing');

  // ── the CENSUS: every reader of '5h' / fiveHour / five_hour, and how it handles ABSENCE (by name) ────────────
  {
    let tracked = null;
    try {
      const ls = (args) => execFileSync('git', ['-C', ROOT, 'ls-files', '-z', ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean);
      tracked = [...new Set([...ls([]), ...ls(['--others', '--exclude-standard'])])];
    } catch { }
    if (!tracked) console.log('  ⚠ SKIP the 5h-reader census — no readable git index');
    else {
      const RX5 = /'5h'|"5h"|\bfiveHour\b|\bfive_hour\b/;
      const scope = tracked.filter((f) => (/^src\//.test(f) || /^data\/bin\//.test(f) || f === 'server.js') && !/^scripts\//.test(f));
      const found = scope.filter((f) => { try { return RX5.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return false; } });
      const ABSENCE = new Map([
        ['src/quota-model.js', 'THE model: a plan may hold no 5h window; `flags.absent` + settleAbsence; the view says `fiveHourAbsent`; WINDOW_MINUTES names the kind'],
        ['src/usage-cache-write.js', 'markPlanAbsent / windowChangeOf; DERIVED_KEYS owns `fiveHourAbsent`; the codex shape test asks `obj.fiveHour &&`'],
        ['src/harnesses/claude-quota.js', 'the panel / OAuth parsers OMIT a 5h bucket the payload lacks and mark the enumeration; toLimitSet / limitSetFromEvent lay the tombstone'],
        ['src/adapters/claude-code.js', 'parseGetUsageResponse omits a missing five_hour (no 0 % allowed window); parseLimitBanner marks its 5h default `guessed`'],
        ['src/rate-limit-capture.js', 'parse: `absentWindows` from unifiedWindows; capture: a 5h lane only when stated, never a sibling\'s bucket onto a tombstoned file; the dead-mark 5h guess only for a fiveHour lane'],
        ['data/bin/vibespace-usage', 'writes `fiveHour` only when the payload states five_hour (the spread keeps the file\'s own, or its tombstone); reading-lag mirror: counts(b5)'],
        ['src/account-pool-auto.js', 'bucketRemaining(undefined) = null (no claim): accountRemaining / bucketRems / projection rows skip it; weeklyDeadline never reads it; fingerprint prints "-"'],
        ['src/server/usage-pool-engine.js', 'a guessed 5h banner on a «no 5h» member walls its week; wall labels come from the buckets present; trippedWindowFacts/spentWindowOf filter missing buckets; the bucket-less `|| \'fiveHour\'` fold default is unreachable (every noteWallSignal caller names one)'],
        ['src/usage-estimator.js', 'estBucket/overlay/anchors guard `b.fiveHour ?` — a missing bucket is estimated as none'],
        ['src/usage-anchors.js', '`cache.fiveHour && …` — no bucket anchors as no-bucket'],
        ['src/reading-lag.js', 'windowOf: counts(b5) — an absent 5h is fiveHour:null, never identity evidence'],
        ['src/reading-repair.js', 'every 5h read is `if (b.fiveHour)` / `?? null`; its windows carry fiveHour:null'],
        ['src/oat-identity-model.js', 'winOf: fiveHour null when not a positive number'],
        ['src/usage-routes.js', 'the panel gate takes a week-only panel (`fiveHour || sevenDay`); the sidecar stamp asks `w.fiveHour ||`; enumerating sites hand `absentWindows`'],
        ['src/weekly-lanes-unfold.js', 'weeklyOnly re-drives an event WITHOUT its 5h lane on purpose; its `absentWindows` is the original record\'s verdict'],
        ['src/record-shape.js', 'the vendor vocabulary census (rateLimitType / unifiedWindows key lists) — names, not reads'],
        ['src/harnesses/codex-quota.js', 'codex: `if (!fiveHour && !sevenDay) return null`; trippedWindow falls back to the other window'],
        ['src/harnesses/antigravity-usage.js', 'antigravity: its own window kinds; a group without a 5h window yields none'],
        ['src/auto-resume-signal.js', 'statedBuckets skips a missing bucket; an arm on a bucket the snapshot does not state waits its own timer'],
        ['src/lib/usage-meter.js', 'has5h / fiveHourAbsent: no 5h donut or row without a 5h window; «5-hour limit lifted (<time>)» for a tombstoned one; codex keeps its own pair'],
        ['src/lib/manage-agents.js', 'has5h: no 5h donut/pill without one; hostOwnReading for the 4 machine-login gates; onDemandUsageView maps a stated 5h only'],
        ['src/lib/session-lifecycle.js', 'the picker chip: pctOf(undefined) = null ⇒ seg() renders nothing'],
        ['src/lib/usage-source.js', 'codexRefreshToast skips a window with no usedPercent'],
        ['src/routes/reset-credit.js', 'a doc comment names the answer\'s fields; no read'],
      ]);
      console.log('  … 5h readers found:', found.length);
      const unl = found.filter((f) => !ABSENCE.has(f));
      ok(!unl.length, `㉑ every reader of '5h' / fiveHour / five_hour names how it handles an ABSENT 5h window (unlisted: ${JSON.stringify(unl)})`);
      const dead = [...ABSENCE.keys()].filter((f) => !found.includes(f));
      ok(!dead.length, `㉑ …no dead census row (${JSON.stringify(dead)})`);
      ok(found.length >= 20 && ABSENCE.has('src/server/usage-pool-engine.js'), `㉑ …the census is non-vacuous (${found.length} files)`);
    }
  }

  // ── NEGATIVE CONTROLS: one patched copy per rule, each turns its own leg red ─────────────────────────────────
  const mut21 = (rel, patches, tag) => {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const hits = [];
    for (const [from, to] of patches) { hits.push(src.split(from).length - 1); src = src.split(from).join(to); }
    return { path: MUTC.write(rel, src, 'q21' + tag, { esm: false, name: `q21-${tag}-${path.basename(rel, '.js')}` }), hits };
  };
  const hit21 = (m, label) => ok(m.hits.length > 0 && m.hits.every((c) => c === 1), `㉑ NEGATIVE CONTROL setup: ${label} — every patch anchor hit exactly once (${JSON.stringify(m.hits)})`);
  try { // (on a tree without the rules the anchors miss and a control can throw — said by name, never a crash)
  {
    const m = mut21('src/harnesses/claude-quota.js', [["printed === scopedWeekly.length, scopedWeekly.length), absent5h ? ['5h'] : []);", 'printed === scopedWeekly.length, scopedWeekly.length), []);']], 'p');
    hit21(m, 'the panel parse claims nothing');
    eq(require(m.path).parseCliUsageText(PANEL_NO5H, Date.now()) && AW(require(m.path).parseCliUsageText(PANEL_NO5H, Date.now())), [], '㉑ CONTROL rule 4: a panel parse that drops the claim — ㉑1a\'s «no 5h» is RED there');
  }
  {
    const m = mut21('src/harnesses/claude-quota.js', [['const fiveHour = stated(u.five_hour) ? toWin(u.five_hour) : undefined;', 'const fiveHour = toWin(u.five_hour);']], 'o');
    hit21(m, 'the OAuth parse fabricates again');
    const r = require(m.path).parseOAuthUsage({ seven_day: { utilization: 40 }, five_hour: null });
    ok(r.fiveHour && r.fiveHour.utilization === 0 && r.fiveHour.status === 'unknown', '㉑ CONTROL rule 1: the base\'s toWin(undefined) fabricates the 0 % unknown window ㉑1d refuses');
  }
  {
    const m = mut21('src/adapters/claude-code.js', [["const fiveHour = rl.five_hour && typeof rl.five_hour === 'object' ? toWin(rl.five_hour) : null;", 'const fiveHour = toWin(rl.five_hour);']], 'g');
    hit21(m, 'the get_usage parse fabricates again');
    const r = require(m.path).ClaudeCodeAdapter.parseGetUsageResponse({ rate_limits: { seven_day: { used_percentage: 40 } } });
    ok(r.fiveHour && r.fiveHour.utilization === 0 && r.fiveHour.status === 'allowed', '㉑ CONTROL rule 1: …and get_usage\'s toWin(null) the 0 % ALLOWED one ㉑1e refuses');
  }
  {
    const m = mut21('src/rate-limit-capture.js', [["const absentWindows = (windows && windows.sevenDay && !windows.fiveHour && kind !== 'fiveHour') ? ['5h'] : [];", 'const absentWindows = [];']], 'e');
    hit21(m, 'the event parse claims nothing');
    eq(require(m.path).parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.4, unifiedWindows: { seven_day: { utilization: 0.4 } } } }).absentWindows, [], '㉑ CONTROL rule 1: a week-only record that claims nothing — ㉑1f RED there');
  }
  {
    const m = mut21('src/usage-cache-write.js', [['  if (Array.isArray(absentWindows) && absentWindows.length) next = markPlanAbsent(next, absentWindows, at);\n', '']], 'w');
    hit21(m, 'the write path ignores the claim');
    const d = mkd('mw'), k = 'sub-n5h-mw'; seed5h(d, k);
    panelWrite(d, k, CQ.parseCliUsageText(PANEL_NO5H, Date.now()), { wcm: require(m.path) });
    const f = readJ(d, k);
    ok(f.fiveHour && f.fiveHour.utilization === 0.84 && !f.fiveHourAbsent, '㉑ CONTROL rule 1: a write path that ignores `absentWindows` keeps the stale 84 % window ㉑2a retires');
  }
  {
    const m = mut21('src/usage-cache-write.js', [["  if (nowAbsent && had5 && !wasAbsent) return { kind: '5h', change: 'removed', at: nowAbsent };", "  if (nowAbsent) return { kind: '5h', change: 'removed', at: nowAbsent };"]], 'c');
    hit21(m, 'the change is judged per write');
    const WM = require(m.path); const got = [];
    WM.onWindowChange((c) => got.push(c.change));
    const d = mkd('mc'), k = 'sub-n5h-mc'; seed5h(d, k, {});
    panelWrite(d, k, CQ.parseCliUsageText(PANEL_NO5H, Date.now()), { wcm: WM });
    panelWrite(d, k, CQ.parseCliUsageText(PANEL_NO5H, Date.now()), { wcm: WM });
    ok(got.length === 2, `㉑ CONTROL rule 2: a change judged by the new shape alone is said PER PROBE (${got.length}×) — ㉑2b's «once» is RED there`);
  }
  {
    const m = mut21('src/quota-model.js', [['    if (w && (posNum(w.measuredAt) || 0) >= since) continue; // measured after the removal: the window is BACK\n', '']], 'q');
    hit21(m, 'a window never displaces a tombstone');
    const QMm = require(m.path);
    const T1 = Date.now() - 60000;
    const set = QMm.makeLimitSet({ limits: [QMm.markWindowsAbsent(QMm.makeLimit({ limitId: 'plan', scope: 'plan', windows: [] }), ['5h'], T1)] });
    const back = QMm.makeLimitSet({ limits: [QMm.makeLimit({ limitId: 'plan', scope: 'plan', windows: [QMm.makeWindow({ kind: '5h', usedPct: 10, resetsAt: nowSec + 3600, measuredAt: T1 + 1000 })] })] });
    ok(!QMm.windowOfKind(QMm.planLimit(QMm.mergeLimitSets(set, back)), '5h'), '㉑ CONTROL rule 2: a tombstone that outranks every window swallows the RETURN ㉑1h / ㉑2c say');
  }
  {
    const m = mut21('src/rate-limit-capture.js', [["    if (tomb && !stated5h) delete cache.fiveHour;\n", '']], 's');
    hit21(m, 'the capture carries a sibling\'s 5h bucket');
    const CAPm = require(m.path);
    const d = mkd('ms'), k = 'sub-n5h-ms', sib = 'sub-n5h-ms2';
    seed5h(d, k); panelWrite(d, k, CQ.parseCliUsageText(PANEL_NO5H, Date.now()));
    W.writeCacheObject({ cacheDir: d, key: sib, backend: 'claude', familyOf: familyOfScopedBucket, source: 'on-demand', measuredAt: Date.now() + 5000,
      obj: { fiveHour: { utilization: 0.5, resetsAt: nowSec + 3600 }, sevenDay: { utilization: 0.4, resetsAt: nowSec + 3 * 86400 }, scopedWeekly: [], fetchedAt: Date.now() + 5000, source: 'on-demand' } });
    CAPm.captureRateLimitEvent({ cacheDir: d, key: k, identityIds: [k, sib], ev: evLegacy, now: Date.now() + 6000 });
    ok(readJ(d, k).fiveHour && readJ(d, k).fiveHour.utilization === 0.5, '㉑ CONTROL rule 1: without the guard the sibling\'s 5h bucket lands on the «no 5h» file — ㉑1j RED there');
  }
  {
    const m = mut21('src/adapters/claude-code.js', [["return { kind: 'fiveHour', guessed: true };", "return { kind: 'fiveHour' };"]], 'b');
    hit21(m, 'the banner default is no longer marked');
    ok(!require(m.path).ClaudeCodeAdapter.parseLimitBanner("You've reached your usage limit").guessed, '㉑ CONTROL rule 3: an unmarked default cannot be told from a named 5h wall — ㉑3a RED there');
  }
  {
    const NM = buildNote(NSLICE.split("const label = name && !name.includes('@') ? name : key;").join('const label = name || key;'));
    if (NM.fn) NM.fn({ key: 'sub-x', kind: '5h', change: 'removed', at: Date.now() });
    ok(NSLICE.includes("const label = name && !name.includes('@') ? name : key;") && NM.filed.length === 1 && /@/.test(NM.filed[0].text), '㉑ CONTROL rule 2: a notice that prints the account name verbatim leaks an email — ㉑2e RED there');
  }
  {
    const m = mut21('data/bin/vibespace-usage', [['  const fiveHour = win(rl.five_hour);\n', "  const fiveHour = win(rl.five_hour) || { utilization: 0, status: 'unknown', resetsAt: 0 };\n"]], 't');
    hit21(m, 'the statusline fabricates again');
    const X = e2e([process.execPath, m.path]);
    ok(X.r0.fiveHour && X.r0.fiveHour.utilization === 0 && X.r0.fiveHour.status === 'unknown' && !X.got.length, '㉑ CONTROL rule 1: the base statusline writes the 0 % unknown window ㉑1k refuses (the ("5h", 0, None) of an idle member, source passive) — and nothing is ever said');
  }
  {
    const m = mut21('data/bin/vibespace-usage', [["    if (had) mark('removed', now);\n", '']], 'u');
    hit21(m, 'the statusline leaves no marker');
    const X = e2e([process.execPath, m.path]);
    ok(X.r2.fiveHourAbsent > 0 && !X.got.includes('removed'), '㉑ CONTROL rule 2: a statusline that lays the tombstone and leaves no marker makes the removal UNSAYABLE — ㉑2f RED there');
  }
  {
    const m = mut21('src/usage-cache-write.js', [[" || (unsaidHolds ? { kind: '5h', change: unsaid.change, at: Number(unsaid.at) || Date.now() } : null));", ');']], 'h');
    hit21(m, 'the write path ignores the marker');
    const X = e2e([TOOL21], require(m.path));
    ok(!X.got.includes('removed'), '㉑ CONTROL rule 2: a write path that never reads the unsaid marker says nothing at the settle — ㉑2f RED there');
  }
  {
    // r2's rule, restored: ANY render with the week and no five_hour lays the tombstone at once
    const m = mut21('data/bin/vibespace-usage', [['  } else if (absent5h && !since && moved) {\n', '  } else if (absent5h && !since && p && sig) {\n'], ['    if (w[p].n >= PASSIVE_WITNESSES) { res.lay = true; endAll(); }\n', '    if (w[p].n >= 1) { res.lay = true; endAll(); }\n']], 'r2');
    hit21(m, 'the statusline believes one render');
    const X = shapes([process.execPath, m.path]);
    ok(X.a.r.fiveHourAbsent > 0 && X.a.r.windowChangeUnsaid && X.a.got.includes('removed'), '㉑ CONTROL BLOCKER: r2\'s rule (one render without five_hour is proof) tombstones the RESET-TIME render and says «removed» — ㉑3a RED there');
  }
  {
    const m = mut21('data/bin/vibespace-usage', [['    if (p && sig) w[p].n = 0;\n    if (moved || res.restore) endAll();\n', '']], 'c5');
    hit21(m, 'a stated 5h window does not end the count');
    const X = shapes([process.execPath, m.path]);
    ok(X.c.f.fiveHourAbsent > 0 && X.c.got.includes('removed'), '㉑ CONTROL rule 2: a count a five_hour answer does not end adds two witnesses across it and FLAPS — ㉑3c RED there');
  }
  {
    const mq = mut21('src/quota-model.js', [['const PASSIVE_WITNESSES = 2;', 'const PASSIVE_WITNESSES = 1;']], 'p1');
    hit21(mq, 'the write path believes one passive answer');
    const m = mut21('src/usage-cache-write.js', [["const quotaModel = require('./quota-model.js');", `const quotaModel = require(${JSON.stringify(mq.path)});`]], 'p1w');
    const d = mkd('mp'), k = 'sub-n5h-mp'; seed5h(d, k);
    // drive the stream through a capture copy that writes with the patched write path
    const cm = mut21('src/rate-limit-capture.js', [["const usageWriteMod = () => require('./usage-cache-write.js');", `const usageWriteMod = () => require(${JSON.stringify(m.path)});`]], 'p1c');
    const CAPm = require(cm.path);
    capture(d, k, evWeek(40), [k], CAPm); capture(d, k, evWeek(41), [k], CAPm);
    ok(readJ(d, k).fiveHourAbsent > 0, '㉑ CONTROL BLOCKER (stream): one moved answer as proof tombstones a member the CLI merely dropped a passed window for — ㉑2d RED there');
  }
  {
    // r3's rule, restored: the FILE's last writer is the baseline and any difference is movement
    const m = mut21('data/bin/vibespace-usage', [['  const prev = p ? w[p] : null;\n', '  const prev = p ? Object.values(w).sort((x, y) => y.at - x.at)[0] || null : null;\n'],
      ['  if (b.reset - a.reset > SAME_WEEK_SEC) return true;\n  return Math.abs(b.reset - a.reset) <= SAME_WEEK_SEC && b.pct > a.pct;\n', '  return a.pct !== b.pct || a.reset !== b.reset;\n']], 'r3');
    hit21(m, 'the witness compares against the last writer');
    const X = play([process.execPath, m.path], FLAP);
    ok(X.files.some((f) => !!f.fiveHourAbsent) && X.got.includes('removed'), `㉑ CONTROL BLOCKER r3: two sessions alternating stale weeks against the file's last writer lay the tombstone and say «removed» — ㉑7a RED there (${JSON.stringify(X.got)})`);
  }
  {
    const m = mut21('data/bin/vibespace-usage', [['      else res.stale = true;\n', '      else res.restore = true;\n']], 'st');
    hit21(m, 'a stale 5h window restores');
    const X = play([process.execPath, m.path], STALE);
    ok(X.got.includes('restored') && X.f.fiveHour, `㉑ CONTROL r4: a 5h window older than the tombstone read as a return files a false «back» — ㉑7b RED there (${JSON.stringify(X.got)})`);
  }
  {
    const m = mut21('data/bin/vibespace-usage', [["    if (unsaid && unsaid.change !== change) delete out.windowChangeUnsaid;\n    else out.windowChangeUnsaid = { kind: '5h', change, at, key };\n", "    out.windowChangeUnsaid = { kind: '5h', change, at, key };\n"]], 'cx');
    hit21(m, 'an undone change keeps its marker');
    const X = play([process.execPath, m.path], [['A', rlW(50), 1], ['A', rlW(51), 1], ['A', rlW(52), 1], ['A', () => RL5new(52), 1]]);
    const w = settle(X.d, X.key); 
    ok(!!w.windowChange && w.windowChange.change === 'restored', '㉑ CONTROL r4: a return that only overwrites the unsaid «removed» says «back» for a removal nobody heard — ㉑7l RED there');
  }
  {
    const mw = mut21('src/usage-cache-write.js', [["  const unsaid = pm && typeof pm === 'object' && pm.key === key ? pm : null;\n", "  const unsaid = (pm && typeof pm === 'object' && pm.key === key ? pm : null) || (obj && obj.windowChangeUnsaid) || null;\n"]], 'mk');
    hit21(mw, 'the write path says a marker riding the producer\'s object');
    const mc = mut21('src/rate-limit-capture.js', [['    delete cache.windowChangeUnsaid; delete cache.fiveHourAbsentWitnesses;\n', ''], ["const usageWriteMod = () => require('./usage-cache-write.js');", `const usageWriteMod = () => require(${JSON.stringify(mw.path)});`]], 'mkc');
    hit21(mc, 'the capture spreads a sibling\'s marker');
    const S = sibMarker(require(mc.path), require(mw.path));
    ok(S.saidX.includes('restored'), `㉑ CONTROL MAJOR 1: a marker taken from the spread base files «back» on a member that never changed — ㉑7g RED there (${JSON.stringify(S.saidX)})`);
  }
  {
    const m = mut21('src/reading-repair.js', [['  _keepOwnAbsence(cacheDir, key, obj, ownTomb);\n', '']], 'rr');
    hit21(m, 'the repair write keeps no tombstone');
    const A = apiPhaseRepair(require(m.path));
    ok(A.f.fiveHour && A.f.fiveHour.utilization === 0.3, '㉑ CONTROL MAJOR 2: a rebuild that ignores the target file\'s tombstone re-creates the removed 5h window — ㉑7h RED there');
  }
  {
    const m = mut21('src/harnesses/claude-quota.js', [['const sevenDay = stated(u.seven_day) ? toWin(u.seven_day) : undefined;', 'const sevenDay = toWin(u.seven_day);'], ['const fiveHour = stated(u.five_hour) ? toWin(u.five_hour) : undefined;', 'const fiveHour = toWin(u.five_hour);']], 'n');
    hit21(m, 'the OAuth parse invents windows for a reply that states none');
    const r = require(m.path).parseOAuthUsage({ limits: [{ kind: 'weekly_scoped', percent: 30, scope: { model: { display_name: 'Fable' } } }] });
    ok(r.fiveHour && r.fiveHour.utilization === 0 && r.sevenDay, '㉑ CONTROL claim 2: the r2 parse invents a 0 % 5h window for a limits[]-only reply (the fake that undid a removal) — ㉑3d RED there');
  }
  {
    const m = mut21('src/usage-estimator.js', [['  return withOwnAbsence(out, rawCache);\n}', '  return out;\n}']], 'ov');
    hit21(m, 'the overlay puts an estimated 5h bucket back');
    ok(!!overlay8(require(m.path)).fiveHour, '㉑ CONTROL r5 #1: an overlay that ignores the member\'s tombstone puts the 90.5 % 5h estimate back — ㉑8a RED there');
  }
  {
    const m = mut21('src/usage-estimator.js', [['  const out = withOwnAbsence(est, rawCache);\n  return out !== est', '  const out = est;\n  return out !== est']], 'oe');
    hit21(m, 'the estimate ignores the member\'s tombstone');
    const e = estimateFor8(require(m.path));
    ok(!!e && !!e.fiveHour, '㉑ CONTROL r5 #1: an estimate built from the identity\'s anchor states the sibling\'s 5h bucket — ㉑8b RED there');
  }
  {
    const m = mut21('src/usage-estimator.js', [['  const cache = withOwnAbsence(group?.cache, group?.tomb5h);\n', '  const cache = group?.cache;\n']], 'sw');
    hit21(m, 'the sweep records the freshest file whole');
    const s = sweep8(require(m.path));
    ok(!!(s.a && s.a.buckets && s.a.buckets.fiveHour), '㉑ CONTROL r5 #1: a sweep that records the sibling whole anchors its 5h bucket — ㉑8c RED there');
  }
  {
    const m = mut21('src/server/auto-cli-loop.js', [['raw = withOwnAbsence(g.cache, raw); // (no-5h-window r5)', 'raw = g.cache;']], 'ac');
    hit21(m, 'the auto-cli scheduler substitutes the sibling whole');
    const seen = await autoCli8(require(m.path));
    ok(seen.length === 1 && !!seen[0] && !!seen[0].fiveHour, '㉑ CONTROL r5 #2: the base\'s `raw = g.cache` hands the scheduler the sibling\'s 5h window — ㉑8d RED there');
  }
  {
    const m = mut21('src/reading-repair.js', [['  if (!since || (ownTomb && !ownTomb(since)) || !(Number(obj.fetchedAt) > 0)) return obj;', '  if (!since || !(Number(obj.fetchedAt) > 0)) return obj;']], 'rf');
    hit21(m, 'the repair keeps whatever tombstone the target holds');
    const RRf = require(m.path);
    const A = slotRepair8(RRf, { tombAt: (death) => death + 3600e3 }), Wn = windowRepair8(RRf, { selfTomb: true }), Ap = apiPhaseRepair(RRf, { selfTomb: true });
    ok(!A.f.fiveHour && !Wn.f.fiveHour && !Ap.f.fiveHour, `㉑ CONTROL r5 #3: a rebuild that keeps a FOREIGN snapshot's tombstone deletes the account's own 5h window — ㉑8e/㉑8f RED there (${JSON.stringify([A.f.fiveHour, Wn.f.fiveHour, Ap.f.fiveHour])})`);
  }
  } catch (e) { ok(false, `㉑ NEGATIVE CONTROLS threw: ${e && e.message}`); }
  if (listen) listen(null);
}

// ── ⑲' THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ─────────────
// Measured HERE, while every patched copy ⑯–⑱ made still exists (the exit
// handlers remove them — a census after exit passes on the pre-fix placement
// too). The copies used to be SIBLINGS in src/, src/harnesses/, src/adapters/
// (vs-qmr{3,4,6}-mut-*, gitignored — so git never saw them, and ⑱0 only asked
// whether they WERE ignored); any suite scanning src/ beside this one counted
// them as product code.
console.log("\n⑲' the patched copies never touch the tree");
for (const r of copiesCensus(MUTC.files, MUTC.dir, ROOT, { minCopies: 20 })) ok(r.pass, "⑲' " + r.name + (r.pass ? '' : ' — ' + r.detail));

// ── ⑳ B-9f4b: THE r6 VERIFIER'S TWO INFO FINDINGS, ON ITS OWN FIXTURES ──────
//
// (1) ONE VENDOR LIMIT, TWO PANEL ROWS. `__global_codex__.json` on this
//     instance holds `codex_bengalfox`/"GPT-5.3-Codex-Spark" (model) + a
//     `credits` limit and NO plan limit (B-9213 overwrote it before the model
//     existed). `legacyWindowLimit` rightly promotes the Spark limit into the
//     plan slot (⑭) — and the scoped projection forty lines below emitted the
//     SAME limit again: `scopedWeekly: undefined → [{GPT-5.3-Codex-Spark, 0,
//     state:'empty'}]`, measured by the verifier running the migration on a
//     copy of that file. Harmless to the MIN (identical numbers), but a panel
//     rendered one vendor limit as two rows. The rule: the limit promoted into
//     the plan slot is not projected a second time AS WELL — only when the
//     window it would project is the very `sevenDay` it already fills.
// (2) AN INFERRED CODENAME MAY NOT CARRY THE RIGHT TO RETIRE. r6 admitted
//     reset-less buckets, so the control parse turns an untouched codename
//     field (`nimbus_quill: {utilization: 0, resets_at: null}`, the 2026-08-09
//     LIVE envelope in scripts/test-get-usage-parse.mjs) into a scopedWeekly
//     entry — and `authoritativeScopesOf` asked only that the list be
//     NON-EMPTY. So a payload whose ONLY model-scoped entry is a codename the
//     parse could not name as a model claimed to have enumerated the model caps
//     and RETIRED a real, spent Fable cap. The authority now needs a cap the
//     parse can NAME as a model: a `limits[]`/`model_scoped` entry with a
//     display name, a `seven_day_<model>` key, a `Current week (<model>)` panel
//     line — never a sibling key inferred to be one.
console.log('\n⑳ B-9f4b: one limit is one row; only a NAMED model cap carries the right to retire');
{
  const POOL20 = require(path.join(ROOT, 'src/account-pool-auto.js'));
  const CQ20 = require(path.join(ROOT, 'src/harnesses/claude-quota.js'));
  const { ClaudeCodeAdapter: ADP20 } = require(path.join(ROOT, 'src/adapters/claude-code.js'));

  // ── ⑳a the verifier's __global_codex__ shape (the real Spark push, no plan limit) ─
  {
    const at = T0;
    const noPlan = QM.mergeLimitSets(
      CODEXQ.toLimitSet(sparkAt(at), { identity: '__global_codex__', source: 'codex-rate-limits', fetchedAt: at }),
      QM.makeLimitSet({ identity: '__global_codex__', fetchedAt: at, limits: [QM.makeLimit({ limitId: 'credits', scope: 'credits', fetchedAt: at, windows: [], flags: { hasCredits: false } })] }));
    eq(QM.limitsOf(noPlan).map((l) => `${l.limitId}:${l.scope}`), ['codex_bengalfox:model', 'credits:credits'], '⑳a fixture: the verifier\'s file — the Spark model limit + credits, NO plan limit');
    ok(QM.legacyWindowLimit(noPlan).limitId === 'codex_bengalfox', '⑳a …and the Spark limit is the one promoted into the plan slot (⑭)');
    const v = QM.toLegacyView(noPlan, { nowSec: Math.round(at / 1000) + 60 });
    ok(!!v.fiveHour && !!v.sevenDay && v.sevenDay.state === 'empty', '⑳a the promoted limit still fills fiveHour/sevenDay (a panel keeps the vendor\'s limit, marked empty)');
    ok(v.scopedWeekly === undefined,
      `⑳a …and is NOT projected a second time as a scopedWeekly row — one vendor limit, one row (got ${JSON.stringify(v.scopedWeekly)})`);
    // through the ONE write path, as the migration and every codex push write it
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm20a-${process.pid}-`)); tmpDirs.push(dir);
    const wr = W.writeCacheObject({ cacheDir: dir, key: '__global_codex__', obj: { fetchedAt: at, source: 'codex-rate-limits' }, set: noPlan, measuredAt: at, source: 'codex-rate-limits', backend: 'codex' });
    const onDisk = W.readCacheObject(dir, '__global_codex__');
    ok(wr.ok && onDisk && onDisk.scopedWeekly === undefined && onDisk.sevenDay && (onDisk.limits || []).some((l) => l.limitId === 'codex_bengalfox'),
      `⑳a …the file the write path persists carries it once too, and the typed limit is untouched (scopedWeekly ${JSON.stringify(onDisk && onDisk.scopedWeekly)})`);
    // THE MONEY SIDE: dropping the duplicate row changes no pool answer — it was a MIN over identical numbers.
    const spent = QM.mergeLimitSets(noPlan, CODEXQ.toLimitSet({ ...sparkAt(at + 1000), primary: { usedPercent: 90, windowDurationMins: 300, resetsAt: Math.round(at / 1000) + 3600 }, secondary: { usedPercent: 97, windowDurationMins: 10080, resetsAt: Math.round(at / 1000) + 200000 } }, { identity: '__global_codex__', source: 'codex-rate-limits', fetchedAt: at + 1000 }));
    const nowA = Math.round(at / 1000) + 120;
    const vs = QM.toLegacyView(spent, { nowSec: nowA });
    const withRow = { ...vs, scopedWeekly: [{ name: 'GPT-5.3-Codex-Spark', utilization: 0.97, resetsAt: Math.round(at / 1000) + 200000 }] };
    eq(POOL20.accountRemaining(vs, nowA), POOL20.accountRemaining(withRow, nowA),
      '⑳a the pool reads the SAME answer with or without the duplicate row (no constraint was lost with it)');
    ok(POOL20.accountRemaining(vs, nowA).remaining <= 10 && POOL20.accountRemaining(vs, nowA).known === true,
      `⑳a …and that answer still sees the spent Spark limit (${JSON.stringify(POOL20.accountRemaining(vs, nowA))})`);

    // CONTROLS: the skip is exactly the promoted limit, never "any model limit".
    const withPlan = QM.mergeLimitSets(noPlan, CODEXQ.toLimitSet(CODEX_PLAN, { identity: '__global_codex__', source: 'codex-rate-limits', fetchedAt: at + 2000 }));
    const vp = QM.toLegacyView(withPlan, { nowSec: Math.round(at / 1000) + 60 });
    ok(QM.legacyWindowLimit(withPlan).limitId === 'codex' && (vp.scopedWeekly || []).some((e) => e.name === 'GPT-5.3-Codex-Spark'),
      '⑳a CONTROL: once a plan limit exists the Spark limit is a model limit again and keeps its scopedWeekly row');
    const R = Math.round(at / 1000) + 400000;
    const twoModels = QM.makeLimitSet({ identity: 'k', fetchedAt: at, limits: [
      QM.makeLimit({ limitId: 'model:fable', name: 'Fable', scope: 'model', family: 'fable', fetchedAt: at + 5, windows: [QM.makeWindow({ kind: '7d', usedPct: 40, resetsAt: R, measuredAt: at })] }),
      QM.makeLimit({ limitId: 'model:opus', name: 'Opus', scope: 'model', family: 'opus', fetchedAt: at, windows: [QM.makeWindow({ kind: '7d', usedPct: 70, resetsAt: R, measuredAt: at })] }),
    ] });
    const v2 = QM.toLegacyView(twoModels, { nowSec: Math.round(at / 1000) + 60 });
    ok(QM.legacyWindowLimit(twoModels).limitId === 'model:fable' && v2.sevenDay.utilization === 0.4
      && JSON.stringify((v2.scopedWeekly || []).map((e) => e.name)) === '["Opus"]',
      `⑳a CONTROL: with two model limits and no plan, only the PROMOTED one loses its row — the other keeps it (${JSON.stringify(v2.scopedWeekly)})`);
    const monthlyOnly = QM.makeLimitSet({ identity: 'k', fetchedAt: at, limits: [
      QM.makeLimit({ limitId: 'model:x', name: 'X', scope: 'model', fetchedAt: at, windows: [
        QM.makeWindow({ kind: '5h', minutes: 300, usedPct: 10, resetsAt: Math.round(at / 1000) + 3600, measuredAt: at }),
        QM.makeWindow({ kind: 'monthly', usedPct: 80, resetsAt: R, measuredAt: at }),
      ] }),
    ] });
    const vm = QM.toLegacyView(monthlyOnly, { nowSec: Math.round(at / 1000) + 60 });
    ok(vm.sevenDay === undefined && (vm.scopedWeekly || []).length === 1 && vm.scopedWeekly[0].utilization === 0.8,
      `⑳a CONTROL: a promoted limit whose budget window is NOT the sevenDay it fills keeps its row — the view never drops a window it projects nowhere else (${JSON.stringify(vm.scopedWeekly)})`);

    // NEGATIVE CONTROL: the pre-fix projection, from a patched copy in a SCRATCH dir
    // (quota-model imports nothing, so the copy runs anywhere — never in the tree).
    const skip = "    if (l === plan && w === windowOfKind(plan, '7d')) continue;\n";
    const src20 = fs.readFileSync(path.join(ROOT, 'src/quota-model.js'), 'utf8');
    ok(src20.split(skip).length === 2, '⑳a NEGATIVE CONTROL setup: the skip line is in the module exactly once');
    const mdir = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm20mut-${process.pid}-`)); tmpDirs.push(mdir);
    fs.writeFileSync(path.join(mdir, 'quota-model.js'), src20.split(skip).join(''));
    const QMpre20 = require(path.join(mdir, 'quota-model.js'));
    const vPre20 = QMpre20.toLegacyView(noPlan, { nowSec: Math.round(at / 1000) + 60 });
    ok((vPre20.scopedWeekly || []).length === 1 && vPre20.scopedWeekly[0].name === 'GPT-5.3-Codex-Spark' && vPre20.sevenDay && vPre20.sevenDay.resetsAt === vPre20.scopedWeekly[0].resetsAt,
      `⑳a NEGATIVE CONTROL: without the skip the verifier's measurement comes back — the Spark limit is BOTH the sevenDay and a scopedWeekly row (${JSON.stringify(vPre20.scopedWeekly)})`);
  }

  // ── ⑳b the right to retire needs a model cap the parse can NAME ──────────
  {
    // the 2026-08-09 LIVE control envelope, verbatim (scripts/test-get-usage-parse.mjs) …
    const LIVE = () => ({ session: { total_cost_usd: 0 }, subscription_type: 'max', rate_limits_available: true, rate_limits: {
      five_hour: { utilization: 34, resets_at: '2026-08-09T09:59:59.753015+00:00', limit_dollars: null },
      seven_day: { utilization: 39, resets_at: '2026-08-11T16:59:59.753043+00:00' },
      seven_day_oauth_apps: null, seven_day_opus: null,
      seven_day_sonnet: { utilization: 12, resets_at: '2026-08-11T16:59:59.753043+00:00' },
      nimbus_quill: { utilization: 0, resets_at: null },
      extra_usage: { is_enabled: false } } });
    // … and the shape the verifier named: the same envelope whose ONLY model-scoped entry is the codename bucket.
    const CODENAME_ONLY = () => { const p = LIVE(); delete p.rate_limits.seven_day_sonnet; return p; };
    const gate = QM.authoritativeScopesOf;
    const cOnly = ADP20.parseGetUsageResponse(CODENAME_ONLY());
    ok(QM.scopedEnumeration(cOnly) === true && cOnly.scopedWeekly.length === 1 && /nimbus/i.test(cOnly.scopedWeekly[0].name),
      '⑳b fixture: the codename-only envelope enumerates (it dropped nothing) and its one scoped entry is the codename bucket (r6 kept it: a stated spend counts)');
    ok(gate(cOnly) === null,
      `⑳b …and it claims NO right to retire: the parse named no model cap, it inferred one from a sibling key (got ${JSON.stringify(gate(cOnly))})`);
    ok(JSON.stringify(gate(ADP20.parseGetUsageResponse(LIVE()))) === '["model"]',
      '⑳b the verbatim LIVE envelope still claims it — `seven_day_sonnet` is a seven_day_<model> key, a cap the parse NAMES');
    const arr = CODENAME_ONLY(); arr.rate_limits.model_scoped = [{ display_name: 'Fable', utilization: 10, resets_at: '2026-08-11T16:59:59.753043+00:00' }];
    ok(JSON.stringify(gate(ADP20.parseGetUsageResponse(arr))) === '["model"]',
      '⑳b …as does a model_scoped entry with a display name beside the codename bucket');
    const oauthNamed = { five_hour: { utilization: 20, resets_at: '2026-08-09T09:59:59Z' }, seven_day: { utilization: 20, resets_at: '2026-08-11T16:59:59Z' },
      limits: [{ kind: 'weekly_scoped', scope: { model: { display_name: 'Fable' } }, percent: 10, resets_at: '2026-08-11T16:59:59Z' }] };
    ok(JSON.stringify(gate(CQ20.parseOAuthUsage(oauthNamed))) === '["model"]', '⑳b …the OAuth parse\'s limits[] entry names one');
    ok(JSON.stringify(gate(CQ20.parseOAuthUsage({ five_hour: { utilization: 20 }, seven_day: { utilization: 20 }, seven_day_opus: { utilization: 100 } }))) === '["model"]',
      '⑳b …and so does its seven_day_<model> key');
    ok(JSON.stringify(gate(CQ20.parseCliUsageText('Current session: 20% used\nCurrent week (all models): 20% used\nCurrent week (Fable): 10% used', Date.now()))) === '["model"]',
      '⑳b …and so does a `Current week (<model>)` panel line');
    const stripped = ADP20.parseGetUsageResponse(arr);
    ok(gate(JSON.parse(JSON.stringify(stripped))) === null, '⑳b the NAMED count is a fact about one read too — a JSON round trip loses it (fails safe, like ⑱d)');

    // END TO END, the verifier's scenario: a spent Fable cap on file, then the codename-only control probe.
    const nowB = Math.floor(Date.now() / 1000);
    const at = (s) => { const d = new Date(Date.now() + s * 1000); const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCHours() % 12 || 12}${d.getUTCHours() < 12 ? 'am' : 'pm'} (UTC)`; };
    const PANEL = `Current session: 20% used · resets ${at(3 * 3600)}\nCurrent week (all models): 20% used · resets ${at(3 * 86400)}\nCurrent week (Fable): 100% used · resets ${at(3 * 86400)}\n`;
    const run = (gateFn) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vs-qm20b-${process.pid}-`)); tmpDirs.push(dir);
      const panel = CQ20.parseCliUsageText(PANEL, Date.now());
      W.writeCacheObject({ cacheDir: dir, key: 'acct', obj: { ...panel, source: 'on-demand', scopedFetchedAt: Date.now() }, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude',
        authoritativeScopes: gateFn(panel) });
      const mid = W.readCacheObject(dir, 'acct');
      const probe = ADP20.parseGetUsageResponse(CODENAME_ONLY());
      W.writeCacheObject({ cacheDir: dir, key: 'acct', obj: probe, source: 'control', familyOf: familyOfScopedBucket, backend: 'claude',
        authoritativeScopes: gateFn(probe) });
      return { mid, after: W.readCacheObject(dir, 'acct') };
    };
    const ids = (o) => (o && o.limits || []).map((l) => l.limitId).sort();
    const r = run(gate);
    ok(ids(r.mid).includes('model:fable') && POOL20.accountRemaining(r.mid, nowB).remaining === 0,
      `⑳b the panel establishes a SPENT Fable cap (${JSON.stringify(ids(r.mid))}, ${JSON.stringify(POOL20.accountRemaining(r.mid, nowB))})`);
    ok(ids(r.after).includes('model:fable'),
      `⑳b the codename-only probe does NOT retire it (${JSON.stringify(ids(r.after))})`);
    const rem = POOL20.accountRemaining(r.after, nowB);
    ok(rem.remaining === 0 && rem.known === true, `⑳b …so the pool still reads a spent account (${JSON.stringify(rem)})`);
    // NEGATIVE CONTROL: the r6 rule verbatim ("enumerated AND the list is non-empty").
    const r6gate = (u) => (QM.scopedEnumeration(u) && Array.isArray(u.scopedWeekly) && u.scopedWeekly.length ? ['model'] : null);
    ok(JSON.stringify(r6gate(cOnly)) === '["model"]', '⑳b NEGATIVE CONTROL: the r6 rule DID grant the codename-only parse the right to retire');
    const pre = run(r6gate);
    ok(!ids(pre.after).includes('model:fable'),
      `⑳b NEGATIVE CONTROL: …and under it the spent Fable cap is RETIRED (${JSON.stringify(ids(pre.after))})`);
    const preRem = POOL20.accountRemaining(pre.after, nowB);
    ok(preRem.remaining > 0,
      `⑳b NEGATIVE CONTROL: …so the pool reads ${preRem.remaining} % free on an account whose Fable is gone — the money leak the tightening closes`);
  }
}

// ── ㉒ THE DISPLAY VERDICT + THE PROVING SPAWN'S QUESTION (lane reset-unproven, owner rulings 2026-10-30) ──────
// «reset 了但没证实的账号要展示的像是 reset 了的账号而不是 reset 之前的状态»: `windowDisplay` is the ONE verdict every
// surface reads (read / reset-unconfirmed / lifted / unread); `memberProofState` asks whether a member stands on a
// reading or a guess. Both on the pool's ONE clock (`resetLanded`, the grace included), each rule RED on its patched copy.
console.log('\n㉒ a reset that LANDED is shown reset (unconfirmed); a member on a guess is unproven (lane reset-unproven)');
{
  const POOL22 = require(path.join(ROOT, 'src/account-pool-auto.js'));
  const EST22 = require(path.join(ROOT, 'src/usage-estimator.js'));
  const S = 1800000000, NOW = S * 1000, G = QM.RESET_GRACE_SEC;
  // (absent accessors answer a shape no leg accepts, so on a tree without this lane every leg goes RED BY NAME)
  const WD = (w, now = NOW, o) => (typeof QM.windowDisplay === 'function' ? QM.windowDisplay(w, now, o) : { state: 'no windowDisplay' });
  const MPS = (x, now) => (typeof QM.memberProofState === 'function' ? QM.memberProofState(x, now) : 'no memberProofState');
  // ㉒a every state
  const rd = WD({ utilization: 0.4, resetsAt: S + 3600 });
  ok(rd.state === 'read' && rd.usedPct === 40 && rd.resetAt === (S + 3600) * 1000, `㉒a a reading inside its window stands: ${JSON.stringify(rd)}`);
  const un = WD({ utilization: 0.95, resetsAt: S - 3 * 86400 }, NOW, { readAt: NOW - 5 * 86400e3 });
  ok(un.state === 'reset-unconfirmed' && un.usedPct === 0 && un.resetAt === (S - 3 * 86400) * 1000 && un.readAt === NOW - 5 * 86400e3,
    `㉒a a 95 % reading whose weekly reset passed 3 days ago is shown RESET — 0 % used, its reset instant, its reading time — never 95: ${JSON.stringify(un)}`);
  const typed = QM.makeWindow({ kind: '7d', usedPct: 95, resetsAt: S - 86400, measuredAt: NOW - 3 * 86400e3 });
  const tun = WD(typed);
  ok(tun.state === 'reset-unconfirmed' && tun.usedPct === 0 && tun.readAt === NOW - 3 * 86400e3, `㉒a …a TYPED window too (its own measuredAt is the reading time): ${JSON.stringify(tun)}`);
  ok(WD({ usedPercent: 88, resetsAt: S - 7200 }).state === 'reset-unconfirmed' && WD({ usedPercent: 88, resetsAt: (S + 7200) * 1000 }).usedPct === 88,
    '㉒a …the codex spelling (usedPercent) and a millisecond resetsAt are read alike');
  ok(WD(null).state === 'unread' && WD(undefined).state === 'unread' && WD({}).state === 'unread' && WD({ status: 'allowed' }).state === 'unread',
    '㉒a no window, or one stating neither a spend nor a reset ⇒ unread (never 0 %, never 50 %)');
  ok(WD({ utilization: 0.3 }).state === 'read' && WD({ utilization: 0.3 }).usedPct === 30, '㉒a a reset-less stated spend is a reading (r3: a stated spend is decisive) — it can never roll');
  // (r3, 主开发's acceptance) a reading is judged ONLY by the reset it STATES against the clock: one taken AFTER its reset
  // that still states that reset is shown unconfirmed — measuredAt / the file's time are ignored BY DESIGN; a reading
  // proves the reset by stating the NEXT one (the CLI's statusline and the usage panel do, from the first turn on)
  const late = WD({ utilization: 0.4, resetsAt: S - 3600, measuredAt: NOW - 1800e3 }, NOW, { readAt: NOW - 1800e3 });
  const next = WD({ utilization: 0.03, resetsAt: S + 16200, measuredAt: NOW - 1800e3 }, NOW, { readAt: NOW - 1800e3 });
  ok(late.state === 'reset-unconfirmed' && late.usedPct === 0 && next.state === 'read' && next.usedPct === 3,
    `㉒a THE STATED RESET DECIDES: a reading measured 30 min AFTER its reset that still states it is unconfirmed (measuredAt ignored by design); one stating the NEXT reset is a reading (3 %): ${JSON.stringify({ late, next })}`);
  // ㉒b the clock at the exact reset instant (the jitter the minute-precise panel adds — RESET_GRACE_SEC)
  const R = S - 1000, at = (sec) => WD({ utilization: 0.9, resetsAt: R }, sec * 1000).state;
  ok(at(R - 1) === 'read' && at(R) === 'read' && at(R + G - 1) === 'read' && at(R + G) === 'reset-unconfirmed',
    `㉒b at the stated instant the reading still stands; it is shown reset once the grace (${G} s) has passed — ${[at(R - 1), at(R), at(R + G - 1), at(R + G)].join(' / ')}`);
  ok(WD({ utilization: 0.9, resetsAt: R }, (R + G) * 1000 - 1).state === 'read' && WD({ utilization: 0.9, resetsAt: R }, (R + G) * 1000 + 0.5).state === 'reset-unconfirmed',
    '㉒b …a fractional millisecond clock answers every second alike (the one floored inequality)');
  let agree = true, firstOff = null;
  for (let d = -180; d <= 180; d += 7) {
    const now = R + d, b = { utilization: 0.9, resetsAt: R };
    const shownReset = WD(b, now * 1000).state === 'reset-unconfirmed', poolFull = POOL22.bucketRemaining(b, now) === 100;
    if (shownReset !== poolFull) { agree = false; firstOff = firstOff ?? d; }
  }
  ok(agree, `㉒b ONE CLOCK: over ±3 min of a reset the display says «reset» exactly when the pool's bucketRemaining calls the bucket full again (first disagreement ${firstOff})`);
  // ㉒c a window that has not started never rolls (B-8b12): its reset slides with the clock
  const empty = QM.makeWindow({ kind: '5h', usedPct: 0, resetsAt: S - 9000 + 5 * 3600, measuredAt: (S - 9000) * 1000 });
  ok(empty.state === 'empty' && WD(empty, (S + 5 * 3600) * 1000).state === 'read' && WD({ utilization: 0, resetsAt: S - 60, state: 'empty' }).state === 'read',
    '㉒c an EMPTY window (nothing spent, its reset sliding) is never «reset» — it says «starts on first use» as before');
  // ㉒d THE LIFTED SHAPE, UNTOUCHED (lane no-5h-window): no window + the tombstone ⇒ lifted, never unread
  const lifted = { fetchedAt: NOW - 3600e3, fiveHourAbsent: NOW - 86400e3, sevenDay: { utilization: 0.5, resetsAt: S + 86400 } };
  const ld = WD(lifted.fiveHour, NOW, { absentSince: QM.fiveHourAbsent(lifted) });
  ok(ld.state === 'lifted' && ld.readAt === NOW - 86400e3 && ld.usedPct === null, `㉒d a lifted 5h is LIFTED (its since), never «unread» and never «reset»: ${JSON.stringify(ld)}`);
  ok(WD({ utilization: 0.2, resetsAt: S + 60 }, NOW, { absentSince: NOW - 1 }).state === 'read', '㉒d …a window present outranks a stale tombstone (as fiveHourAbsent)');
  ok(MPS(lifted, NOW) === 'proven' && MPS({ ...lifted, sevenDay: { utilization: 0.95, resetsAt: S - 86400 } }, NOW) === 'reset-unconfirmed'
    && MPS({ fiveHourAbsent: NOW - 86400e3 }, NOW) === 'proven',
    '㉒d memberProofState: lifted + 7d read = proven; lifted + 7d reset = reset-unconfirmed; a tombstone alone was a READING (never unread)');
  // ㉒e memberProofState
  const MP = (x) => MPS(x, NOW);
  const owner = { fetchedAt: NOW - 4 * 86400e3, fiveHour: { utilization: 0, resetsAt: S - 4 * 86400 + 5 * 3600, state: 'empty' }, sevenDay: { utilization: 0.95, resetsAt: S - 2 * 86400 } };
  ok(MP(owner) === 'reset-unconfirmed', '㉒e the owner\'s member — 7d 95 % reset 2 days ago, its 5h idle (empty) at the reading — stands on a GUESS: reset-unconfirmed (an empty window is no evidence of now)');
  ok(MP(null) === 'unread' && MP({}) === 'unread' && MP({ fetchedAt: NOW }) === 'unread', '㉒e no cache / no window making a claim ⇒ unread');
  ok(MP({ fiveHour: { utilization: 0.2, resetsAt: S - 100 }, sevenDay: { utilization: 0.95, resetsAt: S + 86400 } }) === 'proven',
    '㉒e PER BUCKET: a member whose 5h reset but whose 7d is inside its window stands on a reading — proven');
  ok(MP({ sevenDay: { utilization: 0.95, resetsAt: S - 86400 }, spareScoped: [{ name: 'Fable', utilization: 0.4, resetsAt: S + 3 * 86400 }] }) === 'proven',
    '㉒e a projection\'s spare cap is a window too — a fresh Fable reading proves the member under an Opus view');
  ok(MP({ fiveHour: { utilization: 0, resetsAt: S + 3600, state: 'empty' }, sevenDay: { utilization: 0, resetsAt: S + 7 * 86400, state: 'empty' } }) === 'proven',
    '㉒e a member read at 0 % / 0 % (nothing running) was READ — proven (a free member is not an unknown one, §9 r4)');
  const tset = QM.makeLimitSet({ limits: [QM.makeLimit({ limitId: 'plan', scope: 'plan', windows: [QM.makeWindow({ kind: '7d', usedPct: 80, resetsAt: S - 500, measuredAt: NOW - 86400e3 })] })] });
  ok(MP(tset) === 'reset-unconfirmed' && MP(QM.makeLimitSet({ limits: [QM.makeLimit({ limitId: 'plan', scope: 'plan', windows: [QM.makeWindow({ kind: '7d', usedPct: 80, resetsAt: S + 500, measuredAt: NOW })] })] })) === 'proven',
    '㉒e a TYPED set is judged by its windows alike');
  const overlaid = EST22.overlayCache(owner, { sevenDay: { utilization: 0.01, resetsAt: S - 2 * 86400 + 604800, estimated: true } });
  ok(MP(overlaid) === 'proven' && MP(owner) === 'reset-unconfirmed',
    '㉒e WHY THE ENGINE HANDS THE READING: the estimator overlay re-bases a rolled week onto next week\'s reset and reads as proven — judged on the reading it is a guess (usage-pool-engine poolReadReading)');
  // ㉒f RED controls — each rule on a patched copy of the real module
  const SRC = fs.readFileSync(path.join(ROOT, 'src/quota-model.js'), 'utf8');
  const patched = (tag, from, to) => { const hit = SRC.split(from).length === 2; return { hit, mod: hit ? require(MUTC.write('src/quota-model.js', SRC.replace(from, to), tag, { esm: false })) : null }; };
  const noGrace = patched('q22grace', 'if (mayRoll && resetSec != null && resetLanded(resetSec, now / 1000))', 'if (mayRoll && resetSec != null && resetSec * 1000 <= now /* PATCHED: the bare instant */)');
  ok(noGrace.hit && noGrace.mod.windowDisplay({ utilization: 0.9, resetsAt: R }, (R + 1) * 1000).state === 'reset-unconfirmed',
    '㉒f RED: without the grace the display calls a bucket reset 1 s after a minute-precise instant — while the pool still counts it spent (the ㉒b leg goes red)');
  const allRoll = patched('q22roll', "const mayRoll = win.state === undefined || win.state === null || win.state === 'running';", 'const mayRoll = true; // PATCHED');
  ok(allRoll.hit && allRoll.mod.windowDisplay({ utilization: 0, resetsAt: S - 60, state: 'empty' }, NOW).state === 'reset-unconfirmed',
    '㉒f RED: letting an empty window roll prints a sliding «reset» as an instant (the ㉒c leg goes red)');
  const emptyCounts = patched('q22empty', "    if (w.state !== undefined && w.state !== null && w.state !== 'running') continue;\n", '');
  ok(emptyCounts.hit && emptyCounts.mod.memberProofState(owner, NOW) === 'proven',
    '㉒f RED: counting the idle 5h as evidence leaves the owner\'s 95 % member «proven» — no spawn would ever confirm it (the ㉒e leg goes red)');
  const base = patched('q22base', 'if (mayRoll && resetSec != null && resetLanded(resetSec, now / 1000)) return { state: \'reset-unconfirmed\'', 'if (false) return { state: \'reset-unconfirmed\'');
  ok(base.hit && base.mod.windowDisplay({ utilization: 0.95, resetsAt: S - 3 * 86400 }, NOW).usedPct === 95,
    '㉒f RED (the base): without the verdict the display hands back the stale 95 % — the owner\'s «no account available»');
  // ㉒g THE DISPLAY CENSUS over src/lib (r3, 主开发's acceptance: «THE CENSUS PIN DOES NOT EXIST»). Every client line that
  // names a bucket or draws a percentage either puts it through the display verdict ON THAT LINE (bucketView /
  // windowDisplay), reads a VIEW's own `.reading`, or is ALLOWLISTED below with why; a new raw reader outside the list
  // reds BY file:line. The renderers' bucketView calls are counted too (a bypass that names no bucket on its line — the
  // billing switcher's `eff`, the host pill — drops the count). test-roster-live-usage DRIVES each renderer; this is
  // the text half. i18n-*.js are dictionaries (words only) and are not scanned; usage-window / usage-dashboard draw token
  // and cost stats and name no bucket, so they need no row. The scan is src/lib's TOP LEVEL (readdirSync, not recursive):
  // src/lib has no subdirectory today — a renderer placed in one needs this scan widened first.
  const RAW22 = /\b(?:utilization|usedPercent|usedPct|remainingPct|fiveHour|sevenDay|scopedWeekly)\b|conic-gradient\(|% used|% left/;
  const VIA22 = /\bbucketView\(|\bwindowDisplay\(|\b(?:v|v5|v7|vSc|cv5|cv7)\.reading\b/;
  const ALLOW22 = {
    'chat-status-bar.js': [['chat-status-ctx-pie', 'the CONTEXT-window pie (a conversation\'s context use, not a quota bucket)'],
      ['has {rem}% left (under the {line}% floor', 'the wall line words the SERVER\'s pool verdict (bucketRemaining — the same 60-s inequality), never a stored bucket']],
    'manage-agents.js': [
      ['const w = h.sevenDay;', 'hostOwnReading: is there a reading at all (a presence gate, draws nothing)'],
      ['return h.fiveHour || (w && typeof w', 'hostOwnReading (presence)'],
      ['const pctOf = (x) => Math.min(100', 'the host pill\'s percent OF A VIEW (applied to bucketView\'s reading)'],
      ["const bs = hu ? [['5h', hu.fiveHour]", 'the host pill picks the buckets it hands to bucketView on the next line'],
      ['Number.isFinite(Number(w.usedPct))', 'a CLI\'s own typed windows → donut buckets (donut() puts each through bucketView)'],
      ['const used = Math.max(0, Math.min(100, Number(w.usedPct)));', '…the same conversion'],
      ["kind: w.kind === '5h' ? 'fiveHour' : 'weekly'", '…the same conversion'],
      ['utilization: used / 100,', '…the same conversion'],
      ['const pct = (x) => Math.min(100', 'the donut\'s percent OF A VIEW (donut() calls bucketView first)'],
      ['conic-gradient(${c} ${Math.round(p * 3.6)}deg', 'the donut draws p, the view\'s percent'],
      ['const has5h = !!(u.fiveHour && typeof u.fiveHour', 'presence of a 5h window (lane no-5h-window)'],
      ["donut('5h', u.fiveHour", 'hands each bucket to donut() (bucketView inside)'],
      ['donut(String(sc.name', 'hands each scoped bucket to donut()'],
      ['const scEst = (name) => (est?.scopedWeekly', 'an estimate lookup (bucketView decides whether it survives)'],
      ['const buckets = (wins ? wins.map((w) => [w.label, w, null, w.kind])', 'the narrow pill\'s bucket list, bucketView\'d on the next line'],
    ],
    'session-lifecycle.js': [
      ['const pctOf = (x) => (x == null ? null', 'the billing switcher\'s percent OF A VIEW (eff() calls bucketView first)'],
      ['const f = eff(u.fiveHour', 'hands each bucket to eff()'],
      ['const scoped = (u.scopedWeekly', 'hands each scoped bucket to eff()'],
      ['const e = (est?.scopedWeekly', 'an estimate lookup'],
    ],
    'settings-schema.js': [['its utilization stays under 100%', 'words in a setting\'s description']],
    'usage-eta.js': [['num(b.usedPercent) ?? (num(b.utilization)', 'the countdown asks «spent?» only; bucketEta refuses a reset that passed (no percentage drawn)']],
    'usage-meter.js': [
      ['const pct = un ? 0 : w.usedPct', 'limitRows rows: the row\'s `display` (windowDisplay in limitRows) decides `un`'],
      ['fmtReset(w.resetsAt, (w.usedPct || 0) / 100)', '…the same row\'s reset words'],
      ["escHtml(t('{pct}% used', { pct }))", '…the same row\'s percent'],
      ['conic-gradient(${color} ${darkDeg}deg', 'renderPie draws the percent it is handed (a view\'s)'],
      ['const has5h = !!(rl && rl.fiveHour', 'presence of a 5h window (lane no-5h-window)'],
      ['for (const sc of rl?.scopedWeekly', 'iterates the scoped buckets (vSc below)'],
      ['const scEst = (estSel?.scopedWeekly', 'an estimate lookup'],
      ["t('{pct}% used', { pct: ", 'prints pct5h / pct7d / pctSc — each a view\'s'],
      ['resetStat(', 'the reset formatter\'s «not started» test; resetStat prints the unconfirmed words for a view that says so'],
      ['if (codex?.fiveHour || codex?.sevenDay ||', 'presence of a codex reading'],
      ['const cNoData = !(codex?.fiveHour', 'presence of a codex reading'],
      ['conic-gradient(${usageColor(chipWorst)}', 'the phone chip draws chipWorst, the max of the views\' percents'],
    ],
    'usage-pace.js': [['remainingPct', 'a pace projection nobody imports (not wired)']],
    'usage-source.js': [
      ['const rolled = !!est &&', 'bucketView itself'],
      ['const zero = { ...reading, utilization: 0', 'bucketView itself'],
      ['kind: w.kind, usedPct: w.usedPct', 'limitRows: the row carries `display: model.windowDisplay(w, nowMs)` beside it'],
      ["for (const [label, w] of [['5h', a.reading && a.reading.fiveHour]", 'codexRefreshToast: the reading the ⟳ just fetched (fresh by definition)'],
      ['if (!w || w.usedPercent == null) continue;', '…the same toast'],
      ['const pct = Math.round(Number(w.usedPercent));', '…the same toast'],
    ],
    'utils.js': [
      ['const rdRaw = readingBucket ?', 'estDisplayPair: its callers hand it a VIEW\'s reading'],
      ['const eRaw = estBucket ?', 'estDisplayPair (the estimate)'],
    ],
  };
  const VIEWS22 = { 'usage-meter.js': 5, 'manage-agents.js': 3, 'session-lifecycle.js': 1 }; // v5 v7 vSc cv5 cv7 · donut, narrow pill, host pill · eff
  const strip22 = (l) => (/^\s*(\*|\/\*)/.test(l) ? '' : l.replace(/(^|\s)\/\/.*$/, ''));
  const census22 = (texts) => {
    const offenders = [], used = new Set(), counts = {};
    for (const [f, src] of Object.entries(texts)) {
      counts[f] = (src.match(/\bbucketView\(quotaModel,/g) || []).length;
      src.split('\n').forEach((l, i) => {
        const c = strip22(l);
        if (!RAW22.test(c) || VIA22.test(c)) return;
        const hit = (ALLOW22[f] || []).find(([needle]) => c.includes(needle));
        if (hit) used.add(f + '\0' + hit[0]); else offenders.push(`${f}:${i + 1}: ${c.trim().slice(0, 110)}`);
      });
    }
    const dead = Object.entries(ALLOW22).flatMap(([f, rows]) => rows.filter(([n]) => !used.has(f + '\0' + n)).map(([n]) => f + ': ' + n));
    const short = Object.entries(VIEWS22).filter(([f, n]) => counts[f] !== n).map(([f, n]) => `${f}: ${counts[f]} bucketView calls, the census names ${n}`);
    return { offenders, dead, short };
  };
  const LIB22 = path.join(ROOT, 'src/lib');
  const TEXTS22 = Object.fromEntries(fs.readdirSync(LIB22).filter((f) => f.endsWith('.js') && !/^i18n-/.test(f)).map((f) => [f, fs.readFileSync(path.join(LIB22, f), 'utf8')]));
  const c22 = census22(TEXTS22);
  ok(!c22.offenders.length, `㉒g every client line that names a bucket goes through the display verdict or is allowlisted with why (outside: ${JSON.stringify(c22.offenders)})`);
  ok(!c22.dead.length, `㉒g …no dead allowlist row (${JSON.stringify(c22.dead)})`);
  ok(!c22.short.length, `㉒g …the renderers call bucketView where the census names them (usage-meter 5, manage-agents 3, session-lifecycle 1): ${JSON.stringify(c22.short)}`);
  // RED: the acceptance's bypass shape at each of its three sites (+ the codex pair) ⇒ the census names it
  const swap22 = (f, a, b) => ({ ...TEXTS22, [f]: TEXTS22[f].split(a).length === 2 ? TEXTS22[f].replace(a, b) : '/* the patched line is gone */' });
  const r1 = census22(swap22('usage-meter.js', 'const v5 = bucketView(quotaModel, rl?.fiveHour, estSel?.fiveHour, Date.now(), { readAt: rl?.fetchedAt });', 'const v5 = { reading: rl?.fiveHour, est: estSel?.fiveHour };'));
  ok(r1.offenders.some((o) => /^usage-meter\.js:\d+: const v5 = \{ reading: rl\?\.fiveHour/.test(o)) && r1.short.length === 1, `㉒g RED: the usage popup's 5h read raw (the taskbar pie + the phone chip ride it) is NAMED: ${JSON.stringify(r1.offenders)}`);
  const r2 = census22(swap22('usage-meter.js', 'const vSc = bucketView(quotaModel, sc, scEst, Date.now(), { readAt: rl.scopedFetchedAt || rl.fetchedAt });', 'const vSc = { reading: sc, est: scEst };'));
  ok(r2.short.some((x) => x.startsWith('usage-meter.js: 4 ')), `㉒g RED: the scoped (Fable) bar read raw drops usage-meter's count: ${JSON.stringify(r2.short)}`);
  const r3 = census22(swap22('session-lifecycle.js', 'const v = bucketView(quotaModel, raw0, e0, Date.now(), { readAt: u.fetchedAt });', 'const v = { reading: raw0, est: e0 };'));
  ok(r3.short.some((x) => x.startsWith('session-lifecycle.js: 0 ')), `㉒g RED: the billing switcher's eff read raw is NAMED: ${JSON.stringify(r3.short)}`);
  const r4 = census22(swap22('manage-agents.js', 'const v = bucketView(quotaModel, x, null, nowMs, { readAt: hu.fetchedAt });', 'const v = { reading: x };'));
  ok(r4.short.some((x) => x.startsWith('manage-agents.js: 2 ')), `㉒g RED: the host pill read raw is NAMED: ${JSON.stringify(r4.short)}`);
  const r5 = census22({ ...TEXTS22, 'usage-meter.js': TEXTS22['usage-meter.js'] + '\nconst late = `${Math.round(rl.sevenDay.utilization * 100)}% used`;\n' });
  ok(r5.offenders.length === 1 && /usage-meter\.js:\d+: const late/.test(r5.offenders[0]), `㉒g RED: a NEW raw reader outside the allowlist is named by file:line: ${JSON.stringify(r5.offenders)}`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
