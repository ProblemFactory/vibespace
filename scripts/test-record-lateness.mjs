#!/usr/bin/env node
// THE LATE-RECORD RULE'S SHAPE TABLE (lane reset-path verify r7 T1; PURE, fast).
//
// src/record-lateness.js tells a CLOCK OFFSET (a CLI whose machine clock runs behind this server's — every record
// stamped late by the same amount) from a BACKLOG (a dead bridge releasing hours of records in seconds) by SHAPE
// alone. This suite is the rule's INPUT SPACE as a table — arrival pattern × delay pattern × magnitude × what
// follows — every cell judged by the real module against a HAND-WRITTEN truth (`truth()`: the design statement
// spelled as a brute-force search, not the incremental band machine the module runs), the invariants the owner
// cares about pinned by name, and a patched copy of the module per rule as the control (a rule removed ⇒ the cells
// that see it go red, counted).
//
// THE DESIGN STATEMENT (r6, r7): a stamped record is LATE when its own delay minus the stream's declared offset is
// over the bound (2 min local / 30 min remote). An offset is DECLARED at the first late record R such that, since the
// last live record, at least SKEW_MIN_RECORDS late records at R's level (within SKEW_JITTER_MS of each other) span at
// least SKEW_SPAN_MS of ARRIVALS — a backlog's delays drift by more than the jitter per record and it ends in
// seconds; a one-off record outside the level does not break it (r7: a loop stall); two consecutive ones MOVE the
// level (r7: an NTP step, a replayed burst). Once declared the offset is subtracted from every delay; a record earlier
// than the offset allows corrects it at once (fail-closed: one record can only LOWER the offset; raising it needs the
// run again). THE EDGE OF THE BOUND (r8 ⑤): a record just UNDER the bound (within SKEW_JITTER_MS of it) at the level of
// the records since the last run-ending record is the same level seen from under the bound — it does not end the run
// (and may complete it); a live record farther under the bound, or outside the level, ends it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const L = require(path.join(REPO, 'src/record-lateness.js'));
const MUT = mutantCopies('rlate', REPO);
function mutate(rel, tag, replacements) {
  const src = read(rel); let out = src;
  for (const [from, to] of replacements) { if (!out.includes(from)) return { hit: false, why: 'anchor not found: ' + from.slice(0, 80) }; out = out.replace(from, to); }
  const fp = MUT.write(rel, out, tag, { esm: false });
  return { hit: out !== src, mod: require(fp), file: fp };
}

const M = 60e3, H = 3600e3;
const T0 = Date.parse('2026-10-01T12:00:00Z');
const stamped = (ms) => ({ type: 'assistant', timestamp: new Date(ms).toISOString() });
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ── THE TABLE'S AXES ────────────────────────────────────────────────────────
// arrivals: offsets (ms) over a span of `n` base units (the base span = 61 s; "more of the same" = 2×)
const ARRIVALS = {
  'steady 1/s':        (more) => range(0, more ? 121 : 61).map((s) => s * 1000),
  'bursty (5 per 20 s)': (more) => (more ? [0, 20, 40, 61, 80, 100, 121] : [0, 20, 40, 61]).flatMap((b) => [0, 1, 2, 3, 4].map((i) => b * 1000 + i * 100)),
  'a single record':   (more) => (more ? [0, 61e3] : [0]),
  '3 records then silence': (more) => (more ? [0, 30e3, 61e3, 91e3, 121e3, 152e3] : [0, 30e3, 61e3]),
};
// delay (ms) of the record arriving at offset t (ms), index i, for the magnitude D
const DELAYS = {
  'constant (a skew)':                      (t, D) => D,
  'shrinking (a backlog draining, 2 s/s)':  (t, D) => D + 2 * (61e3 - t),
  'growing (drip-fed, 2 s/s)':              (t, D) => D + 2 * t,
  'alternating (±3 s jitter)':              (t, D, i) => D + (i % 2 ? -3e3 : 3e3),
  'a step (NTP forward 90 s at 30 s)':      (t, D) => (t < 30e3 ? D : D - 90e3),
  'two constants (a VM resumed: +20 min at 30 s)': (t, D) => (t < 30e3 ? D : D + 20 * M),
};
const MAGS = { '90 s': 90e3, '2 min 1 s': 121e3, '5 min': 5 * M, '3 h': 3 * H };
const FOLLOWS = ['a live record', 'more of the same', 'nothing'];
function rowsOf(arr, del, D, fol) {
  const more = fol === 'more of the same';
  const rows = ARRIVALS[arr](more).map((t, i) => ({ t, delay: DELAYS[del](t, D, i) }));
  if (fol === 'a live record') rows.push({ t: rows[rows.length - 1].t + 9e3, delay: 0 });
  return rows;
}

// ── THE MODULE'S ANSWER for a row list ─────────────────────────────────────
function run(rows, L2 = L, opts = {}) {
  let clock = null, declared = null; const verdicts = [], events = [];
  rows.forEach((r, i) => {
    const rec = stamped(T0 + r.t - r.delay), at = T0 + r.t;
    const o = L2.observe(clock, rec, at, opts); clock = o.clock;
    if (o.skew) events.push({ i, t: r.t, ...o.skew });
    if (o.skew && !o.skew.corrected && declared == null) declared = { i, t: r.t, skewMs: o.skew.skewMs };
    verdicts.push(L2.judge(clock, rec, at, opts).verdict);
  });
  return { declared, verdicts, events, clock, outcome: outcomeOf(verdicts, declared) };
}
function outcomeOf(verdicts, declared) {
  if (declared) return 'declared';
  if (!verdicts.includes('late')) return 'live';
  const firstLate = verdicts.indexOf('late');
  return verdicts.slice(firstLate).includes('live') ? 'backlog' : 'undecided';
}

// ── THE HAND-WRITTEN TRUTH (the design statement as a brute-force search) ───
function truth(rows, { remote = false } = {}) {
  const bound = remote ? 30 * M : 2 * M, JIT = 10e3, SPAN = 60e3, MIN = 3;
  let skew = 0, lastLive = -1, declared = null; const verdicts = [], events = [];
  rows.forEach((r, i) => {
    if (skew && r.delay < skew - JIT) { skew = Math.max(0, r.delay); events.push({ i, corrected: true, skewMs: skew }); lastLive = i; }
    const d = r.delay - skew, late = d > bound;
    // the level of R: every record since the last run-ending one within the jitter of R's delay
    const S = rows.slice(lastLive + 1, i + 1).filter((q) => Math.abs(q.delay - r.delay) <= JIT);
    // r8 ⑤ THE EDGE OF THE BOUND: a record just under the bound at a level some LATE record of the run holds is the same
    // level seen from under the bound — it does not end the run
    const near = !late && d > bound - JIT && S.some((q) => q !== r && q.delay - skew > bound);
    if (late || near) {
      if (S.length >= MIN && r.t - S[0].t >= SPAN) { skew = Math.min(...S.map((q) => q.delay)); events.push({ i, skewMs: skew, n: S.length }); if (!declared) declared = { i, t: r.t, skewMs: skew }; lastLive = i; verdicts.push('live'); }
      else verdicts.push(late ? 'late' : 'live');
    } else { verdicts.push('live'); lastLive = i; }
  });
  return { declared, verdicts, events, outcome: outcomeOf(verdicts, declared) };
}

// ═══ §1 THE SHAPE TABLE — every cell against the truth ═══════════════════════
console.log('— §1 the shape table (arrival × delay × magnitude × follow), each cell: the module vs the hand-written truth');
const cells = []; let agree = 0; const disagree = [];
const byOutcome = { declared: 0, backlog: 0, undecided: 0, live: 0 };
for (const arr of Object.keys(ARRIVALS)) for (const del of Object.keys(DELAYS)) for (const [mag, D] of Object.entries(MAGS)) for (const fol of FOLLOWS) {
  const rows = rowsOf(arr, del, D, fol);
  const got = run(rows), want = truth(rows);
  const same = got.outcome === want.outcome && (got.declared ? got.declared.i : -1) === (want.declared ? want.declared.i : -1) && (got.declared ? got.declared.skewMs : 0) === (want.declared ? want.declared.skewMs : 0) && got.verdicts.join() === want.verdicts.join();
  cells.push({ arr, del, mag, fol, outcome: got.outcome, declaredAt: got.declared ? got.declared.t / 1000 : null, skew: got.declared ? got.declared.skewMs / 1000 : null, late: got.verdicts.filter((v) => v === 'late').length, n: rows.length });
  byOutcome[got.outcome]++;
  if (same) agree++; else disagree.push({ arr, del, mag, fol, got: { o: got.outcome, d: got.declared, v: got.verdicts.join('') }, want: { o: want.outcome, d: want.declared, v: want.verdicts.join('') } });
}
ok(`§1 the table has ${cells.length} cells (${Object.keys(ARRIVALS).length} arrivals × ${Object.keys(DELAYS).length} delays × ${Object.keys(MAGS).length} magnitudes × ${FOLLOWS.length} follows) — outcomes ${JSON.stringify(byOutcome)}`, cells.length === 4 * 6 * 4 * 3);
ok(`§1 every cell's outcome, declaration instant, offset and per-record verdicts agree with the truth (${agree}/${cells.length})`, disagree.length === 0, JSON.stringify(disagree.slice(0, 4)).slice(0, 1200));
if (process.env.PRINT_TABLE) for (const c of cells) console.log(`    ${c.arr.padEnd(24)} | ${c.del.padEnd(46)} | ${c.mag.padEnd(9)} | ${c.fol.padEnd(16)} ⇒ ${c.outcome.padEnd(9)} ${c.declaredAt != null ? '@' + c.declaredAt + 's skew ' + c.skew + 's' : ''} late ${c.late}/${c.n}`);
const cell = (arr, del, mag, fol) => cells.find((c) => c.arr === arr && c.del === del && c.mag === mag && c.fol === fol);
// the named cells the owner's question is about
ok('§1 a true skew (constant, steady 1/s, 5 min) is declared at 60 s with skew = 5 min, and "more of the same" never un-declares it (every later record live)',
  cell('steady 1/s', 'constant (a skew)', '5 min', 'more of the same').outcome === 'declared' && cell('steady 1/s', 'constant (a skew)', '5 min', 'more of the same').declaredAt === 60 && cell('steady 1/s', 'constant (a skew)', '5 min', 'more of the same').late === 60);
ok('§1 the same skew at 2 min 1 s (one second over the bound) and at 3 h declares the same way; at 90 s (under the bound) nothing is ever late',
  ['2 min 1 s', '3 h'].every((m) => cell('steady 1/s', 'constant (a skew)', m, 'nothing').outcome === 'declared') && cell('steady 1/s', 'constant (a skew)', '90 s', 'more of the same').outcome === 'live');
ok('§1 a constant delay on bursty arrivals (5 per 20 s) declares at the burst that crosses 60 s; three records then silence declare at the third; a single record never (undecided — nothing follows; backlog — a live one follows)',
  cell('bursty (5 per 20 s)', 'constant (a skew)', '5 min', 'nothing').outcome === 'declared' && cell('bursty (5 per 20 s)', 'constant (a skew)', '5 min', 'nothing').declaredAt === 61 && cell('3 records then silence', 'constant (a skew)', '5 min', 'nothing').declaredAt === 61 && cell('a single record', 'constant (a skew)', '5 min', 'nothing').outcome === 'undecided' && cell('a single record', 'constant (a skew)', '5 min', 'a live record').outcome === 'backlog' && cell('a single record', 'constant (a skew)', '5 min', 'more of the same').outcome === 'undecided');
ok('§1 a backlog draining (2 s/s) is NEVER declared on any arrival pattern at any magnitude: it ends as a backlog when a live record follows, undecided while it drains',
  Object.keys(ARRIVALS).every((a) => Object.keys(MAGS).every((m) => FOLLOWS.every((f) => cell(a, 'shrinking (a backlog draining, 2 s/s)', m, f).outcome !== 'declared'))));
ok('§1 a drip-fed burst (growing 2 s/s) is NEVER declared either', Object.keys(ARRIVALS).every((a) => Object.keys(MAGS).every((m) => FOLLOWS.every((f) => cell(a, 'growing (drip-fed, 2 s/s)', m, f).outcome !== 'declared'))));
ok('§1 a step (the CLI\'s clock corrected forward by 90 s at 30 s) on a 5-min stream: the new level declares 60 s after the step ("more of the same"), is undecided when the stream stops first, a backlog when a live record ends it; at 2 min 1 s the stepped records are under the bound (live ⇒ backlog)',
  cell('steady 1/s', 'a step (NTP forward 90 s at 30 s)', '5 min', 'more of the same').outcome === 'declared' && cell('steady 1/s', 'a step (NTP forward 90 s at 30 s)', '5 min', 'more of the same').declaredAt === 90 && cell('steady 1/s', 'a step (NTP forward 90 s at 30 s)', '5 min', 'nothing').outcome === 'undecided' && cell('steady 1/s', 'a step (NTP forward 90 s at 30 s)', '5 min', 'a live record').outcome === 'backlog' && cell('steady 1/s', 'a step (NTP forward 90 s at 30 s)', '2 min 1 s', 'nothing').outcome === 'backlog');
ok('§1 two constants (a VM resumed 20 min further behind at 30 s): the second level declares 60 s after the resume on a continuing stream — at 90 s (live before) as at 5 min (late before: the level MOVED)',
  ['90 s', '2 min 1 s', '5 min', '3 h'].every((m) => cell('steady 1/s', 'two constants (a VM resumed: +20 min at 30 s)', m, 'more of the same').outcome === 'declared' && cell('steady 1/s', 'two constants (a VM resumed: +20 min at 30 s)', m, 'more of the same').declaredAt === 90));
ok('§1 alternating ±3 s (a skew with jitter) declares like a constant (skew = the smaller delay); at 2 min 1 s ± 3 s the level STRADDLES the bound — r8 ⑤: the under-bound records extend the run instead of ending it, declared at 60 s (skew 118 s), the over-bound half late until then, everything live after',
  cell('steady 1/s', 'alternating (±3 s jitter)', '5 min', 'more of the same').outcome === 'declared' && cell('steady 1/s', 'alternating (±3 s jitter)', '5 min', 'more of the same').skew === 297 && cell('steady 1/s', 'alternating (±3 s jitter)', '5 min', 'more of the same').late === 60 && cell('steady 1/s', 'alternating (±3 s jitter)', '2 min 1 s', 'more of the same').outcome === 'declared' && cell('steady 1/s', 'alternating (±3 s jitter)', '2 min 1 s', 'more of the same').skew === 118 && cell('steady 1/s', 'alternating (±3 s jitter)', '2 min 1 s', 'more of the same').late === 30 && cell('steady 1/s', 'alternating (±3 s jitter)', '90 s', 'nothing').outcome === 'live');

// ═══ §2 THE INVARIANTS (named) ═══════════════════════════════════════════════
console.log('— §2 the real dead-bridge shapes never declare; a true skew declares within the bound and is never un-declared by its own records');
{
  // the lane-dead-bridge incident as the kb describes it: three hours of records released in three seconds (the stamps advance 3 h while the arrivals advance 3 s)
  const incident = (n, tailWithin = 0) => Array.from({ length: n }, (_, i) => ({ t: i * (3000 / (n - 1)), delay: i < n - 1 - tailWithin ? 3 * H - i * (3 * H / (n - 1)) : 3 * H - (n - 1 - tailWithin) * (3 * H / (n - 1)) - (i - (n - 1 - tailWithin)) * 500 }));
  const a = run(incident(50)), b = run(incident(1000)), c = run([...incident(1000, 10), { t: 5000, delay: 0 }]);
  ok('§2 the incident\'s backlog (50 records, 3 h → 0 in 3 s) declares NO offset, every record of the first 2h58m late', a.declared === null && a.verdicts.filter((v) => v === 'late').length >= 48, JSON.stringify({ d: a.declared, late: a.verdicts.filter((v) => v === 'late').length }));
  ok('§2 …nor 1000 records of it (the 4.4 MB shape), nor one whose last ten records were stamped within 10 s of each other (the span is 3 s): a live record then ends the burst', b.declared === null && c.declared === null && c.outcome === 'backlog', JSON.stringify({ b: b.declared, c: c.declared, o: c.outcome }));
  const keeper = run([...Array.from({ length: 30 }, (_, i) => ({ t: i * 33, delay: 35 * M + 30e3 - i * 1000 })), ...range(1, 600).map((s) => ({ t: s * 1000, delay: 35 * M }))], L, { remote: true });
  ok('§2 r7 F1 (b): a keeper\'s replayed 30-s downtime burst on a REMOTE stream 35 min behind, then 10 min steady — declared 61 s after the burst (pre-fix: never — the burst\'s spread poisoned the run for good)', !!keeper.declared && keeper.declared.t === 61e3 && keeper.declared.skewMs === 35 * M && keeper.verdicts.slice(91).every((v) => v === 'live'), JSON.stringify(keeper.declared));
  const ntp = run(range(0, 620).map((s) => ({ t: s * 1000, delay: s < 20 ? 5 * M : 5 * M + 90e3 })));
  ok('§2 r7 F1 (a): the CLI\'s clock stepped BACK 90 s at 20 s (before any declaration) — the new level declares 60 s later (pre-fix: never)', !!ntp.declared && ntp.declared.t === 80e3 && ntp.declared.skewMs === 5 * M + 90e3, JSON.stringify(ntp.declared));
  const stall = run(range(0, 620).map((s) => ({ t: s * 1000, delay: s === 10 ? 5 * M + 15e3 : 5 * M })));
  ok('§2 r7 F1 (c): ONE record read 15 s late (a loop stall) inside the first minute costs nothing — declared at 60 s (pre-fix: never)', !!stall.declared && stall.declared.t === 60e3 && stall.declared.skewMs === 5 * M, JSON.stringify(stall.declared));
  const two = run(range(0, 620).map((s) => ({ t: s * 1000, delay: s === 10 || s === 11 ? 5 * M + 15e3 : 5 * M })));
  ok('§2 the documented cost: TWO consecutive out-of-band records move the level — the stream re-declares 60 s after returning (declared at 72 s, never lost)', !!two.declared && two.declared.t === 72e3 && two.declared.skewMs === 5 * M && two.verdicts.slice(73).every((v) => v === 'live'), JSON.stringify(two.declared));
  const steady = run(range(0, 1200).map((s) => ({ t: s * 1000, delay: 5 * M + (s % 3 - 1) * 1500 })));
  ok('§2 a true skew with ±1.5 s jitter, 20 min of 1/s records: declared once at 60 s, never corrected, never re-declared, every record after it live', steady.events.length === 1 && steady.declared.t === 60e3 && steady.verdicts.slice(61).every((v) => v === 'live') && steady.clock.skewMs === 5 * M - 1500, JSON.stringify({ ev: steady.events, skew: steady.clock.skewMs }));
  const fwd = run([...range(0, 100).map((s) => ({ t: s * 1000, delay: 5 * M })), ...range(101, 200).map((s) => ({ t: s * 1000, delay: 2 * M }))]);
  ok('§2 the clock corrected FORWARD on a declared stream (5 min → 2 min): re-learned from the first such record, said once, everything live', fwd.events.length === 2 && fwd.events[1].corrected && fwd.events[1].skewMs === 2 * M && fwd.verdicts.slice(61).every((v) => v === 'live'), JSON.stringify(fwd.events));
}

// ═══ §3 T2's attacks, pinned ════════════════════════════════════════════════
console.log('— §3 verify r7 T2: the attacks on the rule, each pinned with its outcome');
{
  const drift = (rate) => run(range(0, 200).map((s) => ({ t: s * 1000, delay: 5 * M + rate * s * 1000 })));
  ok('§3 ① (literal) a backlog draining 1 s per record at 1 record/s is NEVER declared — the level is a BAND over the run, not three consecutive records', drift(-1).declared === null && drift(-2).declared === null && drift(1).declared === null);
  ok('§3 ① the measured boundary: a drift within SKEW_JITTER_MS / SKEW_SPAN_MS (±0.16 s/s) over the run IS declared (a constant-latency pipe by shape — the documented limit), ±0.17 s/s is not',
    !!drift(-0.16).declared && !!drift(0.16).declared && drift(-0.17).declared === null && drift(0.17).declared === null && Math.abs(L.SKEW_JITTER_MS / L.SKEW_SPAN_MS - 1 / 6) < 1e-9);
  const base = [{ t: 0, delay: 5 * M }, { t: 30e3, delay: 5 * M }, { t: 61e3, delay: 5 * M }];
  const stallOn = run([...base, { t: 70e3, delay: 5 * M + 90e3 }, { t: 71e3, delay: 5 * M + 4 * M }]);
  ok('§3 ② the bound is relative to the declared offset: a 90-s stall on the offset stream is live (as on any stream), a 4-min one late', stallOn.verdicts.join() === 'late,late,live,live,late');
  const fut = run([...base, { t: 70e3, delay: -60e3 }, ...range(71, 140).map((s) => ({ t: s * 1000, delay: 5 * M }))]);
  ok('§3 ③ ONE odd stamp only LOWERS the offset (a future stamp ⇒ 0, "corrected"): the next records are late again until a 60-s run re-declares — fail-closed, bounded', fut.events.length === 3 && fut.events[1].corrected && fut.events[1].skewMs === 0 && fut.events[2].t === 131e3 && fut.verdicts.slice(4, 64).every((v) => v === 'late'), JSON.stringify(fut.events));
  const stale = run([...base, { t: 70e3, delay: 25 * M }, { t: 71e3, delay: 5 * M }]);
  ok('§3 ③ …and never RAISES it: one stale record stays late, the stream unchanged', stale.events.length === 1 && stale.verdicts.join() === 'late,late,live,late,live');
  const back = run([...base, ...range(70, 134).map((s) => ({ t: s * 1000, delay: 25 * M }))]);
  ok('§3 ③ a clock stepped BACK 20 min on a declared stream is re-learned by a run (60 s, 3 records), never by one record', back.events.length === 2 && !back.events[1].corrected && back.events[1].t === 130e3 && back.events[1].skewMs === 25 * M, JSON.stringify(back.events));
  const first = run([{ t: 0, delay: 5 * M }]);
  ok('§3 ④ (PURE half) the first record of a skewed stream is late and undecided — the engine HOLDS such a fact and replays it at the declaration (test-hot-switch-incident §A8 / S60 pin the engine)', first.outcome === 'undecided' && first.clock.run.n === 1);
  ok('§3 ⑤ the module never produces a time: a reading\'s `fetchedAt` is the engine\'s Date.now() (test-hot-switch-incident §A7 wiring; r7-04 measured 0 ms)', !/fetchedAt|Date\.now/.test(read('src/record-lateness.js')));
  ok('§3 ⑥ the clock is per-session memory (`_recordClock` persisted: null) — a restart re-learns within 60 s of arrivals and says so again', /_recordClock:\s*\{ owner: 'engine', persisted: null/.test(read('src/session-schema.js')));
  const flap = run(range(0, 200).map((s) => ({ t: s * 1000, delay: 121e3 + (s % 2 ? -1500 : 1500) })));
  ok('§3 ⑤ (r8, the r7 boundary note made a rule): a skew of 2 min ± 1.5 s straddles the bound — the under-bound records extend the run (the same level, seen from under the bound), declared at 60 s with skew 119.5 s, 30 late before it, every record live after (pre-r8: flapped for ever, 101 late of 201)', !!flap.declared && flap.declared.t === 60e3 && flap.declared.skewMs === 119500 && flap.verdicts.filter((v) => v === 'late').length === 30 && flap.verdicts.slice(61).every((v) => v === 'live'), JSON.stringify({ d: flap.declared, late: flap.verdicts.filter((v) => v === 'late').length }));
  const edgeFar = run(range(0, 200).map((s) => ({ t: s * 1000, delay: s % 2 ? 100e3 : 125e3 })));
  ok('§3 ⑤ …hysteresis, not a wider bound: a live record 20 s under the bound (outside the jitter of it) still ends the run every other record — never declared', edgeFar.declared === null && edgeFar.outcome === 'backlog');
  const edgeOut = run(range(0, 200).map((s) => ({ t: s * 1000, delay: s % 2 ? 112e3 : 125e3 })));
  ok('§3 ⑤ …and an edge record OUTSIDE the run\'s band (13 s under its level) ends it too', edgeOut.declared === null && edgeOut.outcome === 'backlog');
  // verify r9 ⑨: a dead-bridge backlog that drains fast (220 s per record), then STALLS inside the band (the bridge delivering at
  // real-time speed with a constant ~130-s lag for 70 s), then catches up — by SHAPE the stall is a constant-latency pipe: declared
  // (the design's stated boundary, §3 ①), then CORRECTED the moment the pipe catches up (a record earlier than the offset allows);
  // what it replayed as live was 8 s past the bound (inside the jitter). A stall shorter than the span, a straight drain: never
  const drainTo = (lo) => { const d = []; for (let x = 10800e3; x > lo; x -= 220e3) d.push(x); return d; };
  const stallFor = (n) => range(0, n - 1).map((i) => 130e3 + ((i % 3) - 1) * 2e3);
  const catchUp = () => { const d = []; for (let x = 128e3; x > 0; x -= 40e3) d.push(x); return [...d, 0, 0, 0]; };
  const seq = (delays) => run(delays.map((delay, i) => ({ t: i * 1000, delay })));
  const stalled = seq([...drainTo(130e3), ...stallFor(70), ...catchUp()]);
  ok('§3 ⑨ (r9) a backlog that stalls inside the band for 70 s IS declared (skew 128 s — a constant-latency pipe by shape, the documented boundary) and CORRECTED when the pipe catches up; what it replayed as live was 8 s past the bound (inside the jitter)', !!stalled.declared && stalled.declared.skewMs === 128e3 && stalled.events.some((e) => e.corrected) && stalled.declared.skewMs - L.LATE_MS <= L.SKEW_JITTER_MS, JSON.stringify(stalled.events));
  ok('§3 ⑨ …the two negatives beside it: a stall shorter than the span (50 s) never declares; a backlog draining straight through the band never does', seq([...drainTo(130e3), ...stallFor(50), ...catchUp()]).declared === null && seq([...drainTo(130e3), ...catchUp()]).declared === null);
  // T2 ① (r8): a stream whose level moves TWICE within a minute — the second out-of-band record replaces the candidate, the level that HOLDS 60 s declares
  const twoSteps = run(range(0, 200).map((s) => ({ t: s * 1000, delay: s < 10 ? 5 * M : s < 40 ? 25 * M : 25 * M - 90e3 })));
  const threeSteps = run(range(0, 200).map((s) => ({ t: s * 1000, delay: s < 10 ? 5 * M : s < 40 ? 25 * M : s < 70 ? 25 * M - 30e3 : 24 * M })));
  ok('§3 T2 ① (r8, refuted): two level moves within a minute (a VM resumed +20 min at 10 s, NTP back 90 s at 40 s) — each out-of-band record replaces the candidate, the level that HOLDS 60 s declares (at 100 s, by the last level); a third move before 60 s only delays it (130 s); only a level that never holds is a drift', !!twoSteps.declared && twoSteps.declared.t === 100e3 && twoSteps.declared.skewMs === 25 * M - 90e3 && twoSteps.verdicts.slice(101).every((v) => v === 'live') && !!threeSteps.declared && threeSteps.declared.t === 130e3 && threeSteps.declared.skewMs === 24 * M, JSON.stringify([twoSteps.declared, threeSteps.declared]));
  const remote = run(range(0, 61).map((s) => ({ t: s * 1000, delay: 35 * M })), L, { remote: true }), remoteUnder = run(range(0, 61).map((s) => ({ t: s * 1000, delay: 25 * M })), L, { remote: true });
  ok('§3 a REMOTE stream (bound 30 min): 35 min behind declares, 25 min behind is live', remote.declared && remote.declared.skewMs === 35 * M && remoteUnder.outcome === 'live');
  const flap30 = run(range(0, 200).map((s) => ({ t: s * 1000, delay: 5 * M + (s % 2 ? -30e3 : 30e3) })));
  ok('§3 a clock FLAPPING between two levels 60 s apart (±30 s by record — pathological): the level the stream started on is declared when ITS OWN records span 60 s (a candidate record never declares the run it is outside of), the first lower record corrects to the lower level, everything after is live',
    !!flap30.declared && flap30.declared.t === 60e3 && flap30.declared.skewMs === 5 * M + 30e3 && flap30.events.length === 2 && flap30.events[1].corrected && flap30.events[1].skewMs === 5 * M - 30e3 && flap30.verdicts.slice(60).every((v) => v === 'live'), JSON.stringify(flap30.events));
  const bflap = run([0, 20, 40, 61].flatMap((b) => [0, 1, 2, 3, 4].map((i) => b * 1000 + i * 100)).map((t, i) => ({ t, delay: 5 * M + (i % 2 ? -30e3 : 30e3) })));
  ok('§3 …and on bursty arrivals the declaration waits for the run\'s own next record (the first record of the crossing burst is the other level): declared at 61.1 s, by the run\'s level', !!bflap.declared && bflap.declared.i === 16 && bflap.declared.skewMs === 5 * M + 30e3, JSON.stringify(bflap.declared));
  const shape = run([{ t: 0, delay: 5 * M }, { t: 1000, delay: 5 * M + 20e3 }]);
  ok('§3 the clock object: a run is four numbers; a candidate two more (arrivedAt, delayMs); both dropped at the declaration', Object.keys(shape.clock.run).sort().join() === 'cand,firstArrivedAt,maxDelayMs,minDelayMs,n' && Object.keys(shape.clock.run.cand).sort().join() === 'arrivedAt,delayMs' && !run(base).clock.run, JSON.stringify(shape.clock.run));
}

// ═══ §3b THE STEP TABLE (verify r8 T1) ═══════════════════════════════════════
// The band/candidate machine IS one pure step — observe(clock, rec, now): the clock is the whole state (a run = four
// numbers, a candidate two, the declared offset one), a restart is a null clock, both feeds call the same function on the
// session's one clock. Walked EXHAUSTIVELY: every sequence of ≤ 5 events from every state of the brief, the invariants
// checked on every step, every branch of the machine proven reached.
console.log('— §3b the step table: every sequence of ≤ 5 events from every state, the invariants on every step');
{
  const BOUND = 2 * M, JIT = L.SKEW_JITTER_MS, SPAN = L.SKEW_SPAN_MS, MINR = L.SKEW_MIN_RECORDS, L0 = 5 * M;
  const fitsBand = (lo, hi, raw) => Math.max(hi, raw) - Math.min(lo, raw) <= JIT;
  const mkRun = (n, spanMs, lo, hi, cand = null) => ({ firstArrivedAt: T0 - spanMs, n, minDelayMs: lo, maxDelayMs: hi, ...(cand !== null ? { cand: { arrivedAt: T0 - 1000, delayMs: cand } } : {}) });
  const clk = (extra) => ({ stampAt: T0 - L0, arrivedAt: T0, delayMs: L0, ...extra });
  const STATES = {
    'no run': null,
    'run (n=1)': clk({ run: mkRun(1, 0, L0, L0) }),
    'run (n=2, 30 s)': clk({ run: mkRun(2, 30e3, L0, L0 + 4e3) }),
    'run (n=3, 59 s — one second short)': clk({ run: mkRun(3, 59e3, L0, L0 + 4e3) }),
    'run + candidate': clk({ run: mkRun(2, 30e3, L0, L0 + 4e3, L0 + 50e3) }),
    'run at the edge of the bound (n=2, 30 s, level 119–124 s)': { stampAt: T0 - 121e3, arrivedAt: T0, delayMs: 121e3, run: mkRun(2, 30e3, 119e3, 124e3) },
    'declared (O = 5 min)': clk({ skewMs: L0 }),
    'declared + run': clk({ skewMs: L0, run: mkRun(2, 30e3, L0 + 3 * M, L0 + 3 * M + 2e3) }),
    'declared + run + candidate': clk({ skewMs: L0, run: mkRun(2, 30e3, L0 + 3 * M, L0 + 3 * M + 2e3, L0 + 3 * M + 50e3) }),
  };
  const skewOf = (c) => (c && c.skewMs) || 0, band = (c) => (c && c.run ? [c.run.minDelayMs, c.run.maxDelayMs] : null);
  const level = (c) => (band(c) ? band(c)[1] : skewOf(c) + L0);
  // EVENTS — a record's delay relative to the state (its band / candidate / offset) + the arrival time it takes (1 s, or 61 s
  // = "60 s of arrivals reached"); a restart = the clock forgotten. A feed switch is no event of the step: the function takes
  // no feed (pinned below) and the engine keeps ONE clock per session for both feeds
  const EVENTS = {
    'late, in band (+1 s)': (c) => ({ dt: 1e3, delay: level(c) }),
    'late, in band (+61 s)': (c) => ({ dt: 61e3, delay: level(c) }),
    'late, near the candidate (+1 s)': (c) => ({ dt: 1e3, delay: c && c.run && c.run.cand ? c.run.cand.delayMs + 2e3 : level(c) + 50e3 }),
    'late, near the candidate (+61 s)': (c) => ({ dt: 61e3, delay: c && c.run && c.run.cand ? c.run.cand.delayMs + 2e3 : level(c) + 50e3 }),
    'late, elsewhere (+1 s)': (c) => ({ dt: 1e3, delay: level(c) + 25e3 + (c && c.run && c.run.cand ? 60e3 : 0) }),
    'late, elsewhere (+61 s)': (c) => ({ dt: 61e3, delay: level(c) + 25e3 + (c && c.run && c.run.cand ? 60e3 : 0) }),
    'a live record': (c) => ({ dt: 1e3, delay: skewOf(c) + 1e3 }),
    'a live record at the edge of the bound': (c) => ({ dt: 1e3, delay: skewOf(c) + BOUND - 2e3 }),
    'a future-stamped record': () => ({ dt: 1e3, delay: -5e3 }),
    'a restart': () => ({ restart: true }),
  };
  const names = Object.keys(EVENTS);
  const seen = { declared: 0, promoted: 0, replaced: 0, extended: 0, ended: 0, corrected: 0, started: 0, edgeExtended: 0, restarted: 0 };
  const viol = []; let steps = 0, seqs = 0;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const step = (clock, now, ev, trail) => {
    const e = EVENTS[ev](clock);
    if (e.restart) { seen.restarted++; return { clock: null, now }; }
    const at = now + e.dt, rec = stamped(at - e.delay);
    const o = L.observe(clock, rec, at), o2 = L.observe(clock, rec, at);
    const pre = clock, post = o.clock, raw = e.delay, skew0 = skewOf(pre), run0 = pre && pre.run ? pre.run : null;
    const corrected = !!(skew0 && raw < skew0 - JIT), skewAfterFix = corrected ? Math.max(0, raw) : skew0;
    const late = raw - skewAfterFix > BOUND, edge = !late && raw - skewAfterFix > BOUND - JIT;
    const inBand = !!(run0 && !corrected && fitsBand(run0.minDelayMs, run0.maxDelayMs, raw)), nearCand = !!(run0 && !corrected && run0.cand && !inBand && fitsBand(run0.cand.delayMs, run0.cand.delayMs, raw));
    const declared = !!(o.skew && !o.skew.corrected);
    const bad = (why) => { if (viol.length < 8) viol.push({ why, trail: trail.join(' → '), pre, ev: e, post, skew: o.skew }); };
    // I-H determinism
    if (!same(o, o2)) bad('not deterministic');
    // I-G well-formed
    if (post && post.run) { const r = post.run; if (!(r.n >= 1 && r.minDelayMs <= r.maxDelayMs && r.maxDelayMs - r.minDelayMs <= JIT && r.firstArrivedAt <= at)) bad('malformed run'); if (r.cand && fitsBand(r.minDelayMs, r.maxDelayMs, r.cand.delayMs)) bad('a candidate inside the band'); }
    if (post && !post.stamped && post.arrivedAt !== at) bad('the clock does not stand at the record');
    // I-A a declaration needs an IN-BAND record completing ≥ MINR records over ≥ SPAN — and happens exactly then
    if (declared) {
      seen.declared++;
      const okDecl = run0 && inBand && run0.n + 1 >= MINR && at - run0.firstArrivedAt >= SPAN && (late || edge) && o.skew.n === run0.n + 1 && o.skew.skewMs === Math.min(run0.minDelayMs, raw) && !(post && post.run) && post.skewMs === o.skew.skewMs;
      if (!okDecl) bad('a declaration without its run (in band, ≥ 3 records, ≥ 60 s)');
    } else if (run0 && inBand && (late || edge) && run0.n + 1 >= MINR && at - run0.firstArrivedAt >= SPAN) bad('a run that holds ≥ 3 records over ≥ 60 s did not declare on its in-band record');
    // I-B a candidate never declares by itself; I-C neither does a promotion (two records in)
    if (late && !inBand && !nearCand) { if (declared) bad('an out-of-band record declared'); if (!run0) { seen.started++; if (!(post.run && post.run.n === 1 && post.run.minDelayMs === raw)) bad('the first late record did not start a run'); } else { seen.replaced++; if (!(post.run && post.run.cand && post.run.cand.delayMs === raw && post.run.n === run0.n)) bad('an out-of-band record did not become the candidate'); } }
    if (late && nearCand) { seen.promoted++; if (declared || !(post.run && post.run.n === 2 && !post.run.cand && fitsBand(post.run.minDelayMs, post.run.maxDelayMs, raw))) bad('a record fitting the candidate did not move the level (n=2, no declaration)'); }
    if (late && inBand && !declared) { seen.extended++; if (!(post.run && post.run.n === run0.n + 1 && !post.run.cand)) bad('an in-band record did not extend the run'); }
    // I-D a live record ends every run — unless it is at the edge of the bound AND in the run's band (r8 ⑤)
    if (!late && !corrected) {
      if (edge && inBand) { seen.edgeExtended++; if (!declared && !(post.run && post.run.n === run0.n + 1)) bad('an in-band edge record did not extend the run'); }
      else { seen.ended++; if (post && post.run) bad('a live record left a run standing'); if (declared) bad('a live record declared'); }
    }
    // I-E a future-stamped record on a declared stream corrects the offset to 0 and ends the run; I-F the offset never rises by one record
    if (corrected) { seen.corrected++; if (!(o.skew && o.skew.corrected && o.skew.skewMs === Math.max(0, raw) && !(post && post.run))) bad('a record under the offset did not correct it'); }
    if ((post && post.skewMs || 0) > skew0 && !declared) bad('the offset rose without a declaration');
    steps++;
    return { clock: post, now: at };
  };
  const walk = (clock, now, depth, trail) => { for (const ev of names) { const r = step(clock, now, ev, [...trail, ev]); seqs++; if (depth < 5) walk(r.clock, r.now, depth + 1, [...trail, ev]); } };
  const t0 = Date.now();
  for (const [name, c0] of Object.entries(STATES)) walk(c0 ? JSON.parse(JSON.stringify(c0)) : null, T0, 1, [name]);
  ok(`§3b the walk: ${Object.keys(STATES).length} states × every sequence of ≤ 5 of ${names.length} events = ${seqs} sequences, ${steps} steps, ${Date.now() - t0} ms — 0 violations`, viol.length === 0, JSON.stringify(viol.slice(0, 3)).slice(0, 1500));
  ok(`§3b every branch of the machine was reached: ${JSON.stringify(seen)}`, Object.values(seen).every((v) => v > 0));
  ok('§3b the step takes no feed and keeps no memory beyond the clock (observe(clock, rec, now, {remote}) — a restart is a null clock; the engine keeps ONE clock per session for both feeds)', /^function observe\(clock, rec, now, \{ remote = false \} = \{\}\)/m.test(read('src/record-lateness.js')) && !/function observe\([^)]*feed/.test(read('src/record-lateness.js')) && (read('src/server/usage-pool-engine.js').match(/session\._recordClock = o\.clock/g) || []).length === 2 && /_recordClock:\s*\{ owner: 'engine', persisted: null/.test(read('src/session-schema.js')));
  // the brief's own invariant list, restated as the walk proved them
  ok('§3b INVARIANTS (as walked): a declaration needs ≥ 3 in-band records over ≥ 60 s · a backlog shape (every record outside the level) never declares · a candidate never declares by itself · a live record ends every run unless it is the run\'s level seen from under the bound · the offset never rises by one record · a restart forgets the run', viol.length === 0 && seen.replaced > 0 && seen.promoted > 0 && seen.ended > 0 && seen.edgeExtended > 0 && seen.restarted > 0);
}

// ═══ §4 THE CONTROLS — one patched copy of the module per rule ═══════════════
console.log('— §4 controls: a rule removed ⇒ the cells that see it go red (counted)');
{
  const tableUnder = (L2) => { let flipped = 0; const which = {}; for (const c of cells) { const got = run(rowsOf(c.arr, c.del, MAGS[c.mag], c.fol), L2); if (got.outcome !== c.outcome) { flipped++; which[c.outcome + '→' + got.outcome] = (which[c.outcome + '→' + got.outcome] || 0) + 1; } } return { flipped, which }; };
  const noDecl = mutate('src/record-lateness.js', 'nodecl', [['if (x.inBand && run.n >= SKEW_MIN_RECORDS && now - run.firstArrivedAt >= SKEW_SPAN_MS', 'if (false && x.inBand && run.n >= SKEW_MIN_RECORDS && now - run.firstArrivedAt >= SKEW_SPAN_MS']]);
  const r1 = noDecl.hit ? tableUnder(noDecl.mod) : null;
  ok(`§4 C1 the declaration removed ⇒ every "declared" cell flips (${r1 && r1.flipped} of ${byOutcome.declared}: ${JSON.stringify(r1 && r1.which)})`, !!noDecl.hit && r1.flipped === byOutcome.declared && Object.keys(r1.which).every((k) => k.startsWith('declared→')));
  const noSpan = mutate('src/record-lateness.js', 'nospan', [['const SKEW_SPAN_MS = 60e3;', 'const SKEW_SPAN_MS = 0;']]);
  // the dead bridge's backlog whose NEWEST records are five minutes old (the CLI idle for the last five minutes before the re-attach): 990 records draining 3 h → 5 min in 3 s, then ten stamped within 0.5 s of each other — the band accepts that tail, ONLY the span rule refuses it
  const inc10 = Array.from({ length: 1000 }, (_, i) => ({ t: i * 3, delay: i < 990 ? 3 * H - i * ((3 * H - 5 * M) / 989) : 5 * M - (i - 989) * 500 }));
  ok('§4 C2 the span rule removed ⇒ the dead bridge\'s backlog with a 5-min-old tail stamped within 10 s DECLARES (the real module: never — its arrivals span 3 s)', !!noSpan.hit && run(inc10, noSpan.mod).declared !== null && run(inc10).declared === null && run(inc10).verdicts.every((v) => v === 'late'), JSON.stringify({ mut: run(inc10, noSpan.mod).declared, real: run(inc10).declared }));
  const noJit = mutate('src/record-lateness.js', 'nojit', [['const SKEW_JITTER_MS = 10e3;', 'const SKEW_JITTER_MS = 1e15;']]);
  const r3 = noJit.hit ? tableUnder(noJit.mod) : null;
  ok(`§4 C3 the jitter band removed ⇒ draining and drip-fed backlogs declare (${r3 && r3.flipped} cells flip, every one to "declared")`, !!noJit.hit && r3.flipped > 20 && Object.keys(r3.which).every((k) => k.endsWith('→declared')), JSON.stringify(r3 && r3.which));
  const one = mutate('src/record-lateness.js', 'onerec', [['const SKEW_MIN_RECORDS = 3;', 'const SKEW_MIN_RECORDS = 1;']]);
  ok('§4 C4 one record enough ⇒ two single records 61 s apart declare (the real module: undecided)', !!one.hit && run(rowsOf('a single record', 'constant (a skew)', MAGS['5 min'], 'more of the same'), one.mod).outcome === 'declared' && cell('a single record', 'constant (a skew)', '5 min', 'more of the same').outcome === 'undecided');
  const noCand = mutate('src/record-lateness.js', 'nocand', [[
    "  if (run.cand && fits(run.cand.delayMs, run.cand.delayMs, raw)) return { run: { firstArrivedAt: run.cand.arrivedAt, n: 2, minDelayMs: Math.min(run.cand.delayMs, raw), maxDelayMs: Math.max(run.cand.delayMs, raw) }, inBand: true }; // the level moved\n  return { run: { firstArrivedAt: run.firstArrivedAt, n: run.n, minDelayMs: run.minDelayMs, maxDelayMs: run.maxDelayMs, cand: { arrivedAt: now, delayMs: raw } }, inBand: false }; // out of band: a candidate, judged by the next",
    '  return { run: { firstArrivedAt: run.firstArrivedAt, n: run.n + 1, minDelayMs: Math.min(run.minDelayMs, raw), maxDelayMs: Math.max(run.maxDelayMs, raw) }, inBand: true }; // PRE-FIX (r6): the whole run, one band for good',
  ]]);
  const f1 = noCand.hit ? [range(0, 620).map((s) => ({ t: s * 1000, delay: s < 20 ? 5 * M : 5 * M + 90e3 })), range(0, 620).map((s) => ({ t: s * 1000, delay: s === 10 ? 5 * M + 15e3 : 5 * M }))].map((rows) => run(rows, noCand.mod).declared) : null;
  const r5 = noCand.hit ? tableUnder(noCand.mod) : null;
  ok(`§4 C5 the candidate removed (r6's whole-run band) ⇒ the NTP step and the stall outlier never declare again, and ${r5 && r5.flipped} table cells flip (${JSON.stringify(r5 && r5.which)})`, !!noCand.hit && f1.every((d) => d === null) && r5.flipped > 0);
  const noFix = mutate('src/record-lateness.js', 'nofix', [['if (skewMs && raw < skewMs - SKEW_JITTER_MS)', 'if (false && skewMs && raw < skewMs - SKEW_JITTER_MS)']]);
  ok('§4 C6 the correction removed ⇒ a clock corrected forward on a declared stream is never re-learned', !!noFix.hit && run([...range(0, 100).map((s) => ({ t: s * 1000, delay: 5 * M })), { t: 101e3, delay: 2 * M }], noFix.mod).events.length === 1);
  const noEdge = mutate('src/record-lateness.js', 'noedge', [['  else if (run && raw - skewMs > bound - SKEW_JITTER_MS && fits(run.minDelayMs, run.maxDelayMs, raw)) grow();', '  else if (false) grow();']]);
  const r8 = noEdge.hit ? tableUnder(noEdge.mod) : null;
  const flap8 = noEdge.hit ? run(range(0, 200).map((s) => ({ t: s * 1000, delay: 121e3 + (s % 2 ? -1500 : 1500) })), noEdge.mod) : null;
  ok(`§4 C8 the edge rule removed (r8 ⑤) ⇒ a level straddling the bound flaps for ever (never declared, 101 late of 201) and the ${r8 && r8.flipped} cells that straddle it flip back to "backlog"`, !!noEdge.hit && flap8.declared === null && flap8.verdicts.filter((v) => v === 'late').length === 101 && r8.flipped === 9 && Object.keys(r8.which).every((k) => /declared→backlog/.test(k)), JSON.stringify(r8 && r8.which));
  const noSub = mutate('src/record-lateness.js', 'nosub', [['    const d = now - st - skewMs;', '    const d = now - st;']]);
  ok('§4 C7 the subtraction removed ⇒ the records after the declaration stay late', !!noSub.hit && run(range(0, 120).map((s) => ({ t: s * 1000, delay: 5 * M })), noSub.mod).verdicts.slice(61).every((v) => v === 'late'));
}

// ═══ §5 THE ENGINE'S WIRING of r7 ④ (grep-derived pins) ═════════════════════
console.log('— §5 wiring: the first minute of an offset stream is HELD, replayed at the declaration (at its own instant, never over a newer reading), discarded when a live record ends the burst; the ring keeps walls');
{
  const eng = read('src/server/usage-pool-engine.js');
  ok('§5 gateLiveFact holds a late fact with its own replay', /noteLateFact\(session, what, v, \(\) => gateLiveFact\(session, msg, what, run\)\)/.test(eng));
  ok('§5 the codex consumer holds a late reading / wall with its own replay — stamped at the fact\'s own instant when replayed (r8 ②: asOf)', /noteLateFact\(session, payload\.type === 'task_failed' \? 'codex wall' : 'codex reading', v, \(at\) => recordCodexQuotaSignal\(session, payload, rec, \{ asOf: at \}\)\)/.test(eng) && /function recordCodexQuotaSignal\(session, payload, rec = null, \{ asOf = null \} = \{\}\)/.test(eng) && /const now = Number\(asOf\) > 0 \? Number\(asOf\) : Date\.now\(\);/.test(eng) && /signalFromStream\(\{ type: 'event_msg', payload \}, now\)/.test(eng) && /fiveHour: null, rateLimitReachedType: 'unknown', fetchedAt: now,/.test(eng));
  ok('§5 held only while NO offset is declared, newest HELD_LATE_MAX — the ring keeps WALLS (r8 ④: the oldest reading goes first), every drop counted on the burst and said at its close', /if \(typeof replay === 'function' && !\(\(session\._recordClock && session\._recordClock\.skewMs\) \|\| 0\)\)/.test(eng) && /const HELD_LATE_MAX = 32;/.test(eng) && /let i = h\.findIndex\(\(x\) => !HELD_WALL_KINDS\.includes\(x\.what\)\); if \(i < 0\) i = 0;/.test(eng) && /b\.dropped = \(b\.dropped \|\| 0\) \+ 1;/.test(eng) && /dropped from the held ring of \$\{HELD_LATE_MAX\}/.test(eng));
  ok('§5 replayed at the declaration (after the journal line), the declaring record\'s clock restored; a fact older than the account\'s newest reading is NOT replayed (r8 ②: the newest read ONCE before any replay); discarded when a live record ENDS THE RUN (r8 ⑤: an edge record that extends it keeps the hold)', /global\.__vsEvent\?\.\('stream-clock-skew'[^\n]*\n\s*replayHeldLate\(session\);[^\n]*\n\s*session\._recordClock = o\.clock;/.test(eng) && /if \(e\.key && newestAt\[e\.key\] > Number\(e\.at\)\) \{ superseded\+\+;/.test(eng) && /for \(const e of held\) \{ if \(e\.key && newestAt\[e\.key\] === undefined\)/.test(eng) && /verdict === 'live' && !\(o\.clock && o\.clock\.run\) && !REPLAYING_HELD\.has\(session\)\) endLateBurst\(session/.test(eng) && /session\._heldLate = null; \/\/ a live record ended the burst/.test(eng));
  ok('§5 the late-wall notice (r8 ⑥): ONE For-you item per burst at its first late wall (origin pool), resolved when the burst ends or the wall is replayed and taken; the journal stays English-only', /if \(HELD_WALL_KINDS\.includes\(what\)\) fileLateWallItem\(session, b, what, v\);/.test(eng) && /origin: 'pool', kind: 'notice'/.test(eng) && /resolveLateWallItem\(b, how === 'live' \? 'stream-alive' : 'offset-declared'\)/.test(eng) && /resolveLateWallItem\(session\._lateBurst, 'wall-replayed'\)/.test(eng) && /&& !REPLAYING_HELD\.has\(session\)\) endLateBurst\(session/.test(eng) && /REPLAYING_HELD\.add\(session\);/.test(eng) && /if \(b\.todoId !== undefined\) return;/.test(eng));
  ok('§5 the fields are declared in the session schema', /_heldLate:\s*\{ owner: 'engine', persisted: null/.test(read('src/session-schema.js')) && /_lateBurst:\s*\{ owner: 'engine'/.test(read('src/session-schema.js')));
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass}${fail ? ' passed, ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0);
