'use strict';
// PURE (imports nothing; CJS) — A LATE RECORD IS NOT A LIVE FACT
// (lane-hot-switch, 2026-09-30).
//
// THE INCIDENT. The production server crashed at 12:03 (EMFILE) and re-attached
// its sessions. One conversation's stdout bridge came back DEAD in both
// directions: for three hours the CLI kept working (task notifications, Fable
// 429s at 12:15, 12:21, 12:24, 13:23, 13:54) and not one of its records reached
// the server. At 15:05:14 the owner typed a message, the broken-stdin detector
// re-attached the pty locally, and the whole three-hour backlog arrived in three
// seconds (4.4 MB + 6.8 MB queued to the two watching tabs). Every stdout
// consumer took every record as NOW: hours-old readings were filed as current
// (one regressed member U's SPENT 5 h window from 100 % to 95 %), and a 12:15
// Fable rejection member Q had answered was charged — through its window-less
// banner — to member S, the member the link pointed at by then. The pool
// demoted S and moved ten conversations onto U, whose 5 h window was spent:
// "session limit · resets 3:50pm" on every message while S had quota.
//
// THE RULE. A record's age is its own statement, not its arrival. claude
// 2.1.281 stamps every `assistant` record — success and API error alike —
// with `timestamp` at EMISSION (measured: a text block streamed for 25 s is
// stamped 2 ms before it arrives, so a live record is never "late" for being
// long). A record whose own stamp is older than the bound is a BACKLOG record.
// Records without a stamp (`rate_limit_event`, `result`) inherit the verdict of
// the stamped record that arrived just before them (a backlog is ordered, and a
// live turn's reading follows its assistant record within milliseconds). An
// unstamped record with NO recent stamped neighbour is `unknown` — the caller
// asks the next stamped record AHEAD of it in the same buffer (`nextStampIn`: a
// rejected turn emits its `rate_limit_event` a few ms BEFORE its stamped error
// record, and a backlog arrives in big chunks), and runs it as live when there
// is none — exactly the pre-rule behaviour, never a timer.
//
// THE BOUND. Local: LATE_MS (2 min) — the CLI runs on this machine's clock, a
// healthy bridge delivers in milliseconds, the device relay in seconds.
// Remote: REMOTE_LATE_MS (30 min) — another machine's clock may be skewed, and a
// skew larger than the bound would silence every wall of that host; 30 min still
// catches the multi-hour backlog this rule exists for.

const LATE_MS = 120e3;
const REMOTE_LATE_MS = 30 * 60e3;
const BURST_MS = 15e3;
// ── A SYSTEMATIC OFFSET IS A CLOCK, NOT A BACKLOG (lane reset-path verify r6, reproduced on the real engine) ──
// A CLI whose machine's clock runs BEHIND this server's stamps EVERY record late by the same amount, and the rule
// above refused every reading and wall of that session for good: an unsettled reset-credit attempt never settled,
// the usage menu's ⟳ was refused by name ("a backlog record, 5m late") on every press, the cache never moved, and
// the journal called it a stalled bridge's backlog once. A backlog and an offset are told apart by SHAPE, never by
// one record: a backlog's delays SHRINK as it drains (the stamps advance faster than the arrivals — the 3-h incident
// arrived in 3 s) and a backlog ENDS; an offset is a run of late records whose delays stay within a jitter of each
// other while the arrivals span real wall time (the stamps advance in step with the arrivals: a live stream, offset).
// The run is kept on the stream clock (`run`), ended by any live stamped record; once declared the offset is
// subtracted from every delay (`skewMs`), so a true backlog on an offset stream is still late (raw − offset), and
// a record arriving EARLIER than the offset allows — a backlog can never arrive before it was emitted — is the clock
// corrected: the offset is re-learned from it (NTP caught up). The first SKEW_SPAN_MS of an offset stream are still
// dropped (counted, said) — bounded, never a timer.
const SKEW_SPAN_MS = 60e3;     // the run must span this much ARRIVAL time (a backlog burst drains in seconds)
const SKEW_JITTER_MS = 10e3;   // …with every delay within this of the others (a draining backlog's delays spread by its whole span)
const SKEW_MIN_RECORDS = 3;    // …over at least this many stamped records (two aligned chunks are a coincidence)
// ── THE RUN IS A BAND, AND ONE RECORD OUTSIDE IT IS A CANDIDATE (lane reset-path verify r7 F1, reproduced on the real
// engine) ── r6's run was ENDED only by a live record and judged by its WHOLE spread, so ONE late record outside the band
// before the declaration — the CLI's clock stepped by NTP, a keeper's replayed downtime burst on a skewed remote stream,
// a single reading the server read 15 s late in a loop stall — kept max − min over the jitter for good: the skewed
// stream never declared (10 min of steady records, every one refused) and r6 F1's outcome returned. Now a late record
// that fits the run's band extends it; one that does not is a CANDIDATE level (`run.cand`), and the NEXT late record
// decides: it fits the run (the candidate was a one-off: dropped, the run goes on), it fits the candidate (the level
// MOVED: the candidate is the run now, two records in), or neither (a backlog's drift: the candidate is replaced). A
// backlog's delays shrink by more than the jitter per record (the 3-h incident: 220 s per record), so its run never
// grows past one; a slow drift within the jitter over the span is a constant-latency pipe by shape — measured boundary
// SKEW_JITTER_MS / SKEW_SPAN_MS (test-record-lateness §T2 ①), unchanged from r6.
// ── THE EDGE OF THE BOUND (lane reset-path verify r8 ⑤, the r7 boundary note made a rule) ── a level that straddles the
// bound (a skew of 2 min ± 1.5 s) had every under-bound record END the run and every over-bound one late, for ever: half
// the readings applied, half refused, never declared. A record just UNDER the bound — within SKEW_JITTER_MS of it — that
// FITS the run's band is the same level seen from the other side of the bound: it extends the run (and may declare it)
// instead of ending it. Hysteresis, not a wider bound: a live record farther under the bound, or one outside the band,
// still ends every run; a draining backlog's band never holds 60 s whatever side of the bound it crosses on.
const skewOf = (clock) => (clock && Number.isFinite(clock.skewMs) && clock.skewMs > 0 ? clock.skewMs : 0);
const fits = (lo, hi, raw) => Math.max(hi, raw) - Math.min(lo, raw) <= SKEW_JITTER_MS;
/** The run after one more LATE record of delay `raw` arriving at `now` (see the band rule above) → {run, inBand}:
 *  `inBand` = this record is IN the run (it extends it, or it promoted the candidate it fits); a record left as the
 *  candidate is not, and must not declare the run it is outside of (the span is the run's OWN records'). */
function extendRun(run, raw, now) {
  if (!run) return { run: { firstArrivedAt: now, n: 1, minDelayMs: raw, maxDelayMs: raw }, inBand: true };
  if (fits(run.minDelayMs, run.maxDelayMs, raw)) return { run: { firstArrivedAt: run.firstArrivedAt, n: run.n + 1, minDelayMs: Math.min(run.minDelayMs, raw), maxDelayMs: Math.max(run.maxDelayMs, raw) }, inBand: true }; // in band (a candidate was a one-off)
  if (run.cand && fits(run.cand.delayMs, run.cand.delayMs, raw)) return { run: { firstArrivedAt: run.cand.arrivedAt, n: 2, minDelayMs: Math.min(run.cand.delayMs, raw), maxDelayMs: Math.max(run.cand.delayMs, raw) }, inBand: true }; // the level moved
  return { run: { firstArrivedAt: run.firstArrivedAt, n: run.n, minDelayMs: run.minDelayMs, maxDelayMs: run.maxDelayMs, cand: { arrivedAt: now, delayMs: raw } }, inBand: false }; // out of band: a candidate, judged by the next
}

/** The record's own emission instant (ms), or null when it states none. */
function stampOf(rec) {
  const s = rec && typeof rec.timestamp === 'string' ? rec.timestamp : null;
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) && t > 0 ? t : null;
}

/** The session's stream clock after `rec` arrived at `now`. A record without a
 *  stamp leaves the clock alone. → {clock, stamped, skew} — `skew` = {skewMs, n, spanMs} the instant an offset is
 *  DECLARED by this record, {skewMs, corrected: true} the instant a record shows the clock corrected, else null. */
function observe(clock, rec, now, { remote = false } = {}) {
  const st = stampOf(rec);
  if (st == null) return { clock: clock || null, stamped: false, skew: null };
  const bound = remote ? REMOTE_LATE_MS : LATE_MS;
  const raw = now - st;
  let skewMs = skewOf(clock), run = clock && clock.run ? clock.run : null, skew = null;
  // the clock was corrected: nothing arrives before it was emitted, so a delay under the offset IS the new offset
  if (skewMs && raw < skewMs - SKEW_JITTER_MS) { skewMs = Math.max(0, raw); run = null; skew = { skewMs, corrected: true }; }
  const grow = () => { // one more record of the run's level: it extends the run, and declares it once the run holds
    const x = extendRun(run, raw, now); run = x.run;
    if (x.inBand && run.n >= SKEW_MIN_RECORDS && now - run.firstArrivedAt >= SKEW_SPAN_MS && run.maxDelayMs - run.minDelayMs <= SKEW_JITTER_MS) { skewMs = run.minDelayMs; skew = { skewMs, n: run.n, spanMs: now - run.firstArrivedAt }; run = null; }
  };
  if (raw - skewMs > bound) grow();
  else if (run && raw - skewMs > bound - SKEW_JITTER_MS && fits(run.minDelayMs, run.maxDelayMs, raw)) grow(); // the edge of the bound (verify r8 ⑤): the same level, seen from under the bound
  else run = null; // a live record ends the run: a stream late only sometimes is a backlog, never a clock
  return { clock: { stampAt: st, arrivedAt: now, delayMs: raw, ...(skewMs ? { skewMs } : {}), ...(run ? { run } : {}) }, stamped: true, skew };
}

/** Is `rec`, arriving at `now`, a live fact? → {verdict:'live'|'late'|'unknown', lateMs, by}
 *  `clock` = the stream clock as it stood BEFORE `rec` (for an unstamped record). */
function judge(clock, rec, now, { remote = false } = {}) {
  const bound = remote ? REMOTE_LATE_MS : LATE_MS;
  const st = stampOf(rec);
  const skewMs = skewOf(clock); // the stream's declared clock offset (observe), subtracted from every delay
  if (st != null) {
    const d = now - st - skewMs;
    return d > bound ? { verdict: 'late', lateMs: d, by: 'own-stamp' } : { verdict: 'live', lateMs: Math.max(0, d), by: 'own-stamp' };
  }
  if (clock && Number.isFinite(clock.arrivedAt) && now - clock.arrivedAt <= BURST_MS) {
    return clock.delayMs - skewMs > bound
      ? { verdict: 'late', lateMs: clock.delayMs - skewMs, by: 'burst' }
      : { verdict: 'live', lateMs: Math.max(0, clock.delayMs - skewMs), by: 'burst' };
  }
  return { verdict: 'unknown', lateMs: null, by: 'no-stamp' };
}

/** The verdict a HELD (unknown) record gets from the stamped record that just
 *  arrived after it: that record's own verdict. */
function verdictOfClock(clock, { remote = false } = {}) {
  if (!clock || !Number.isFinite(clock.delayMs)) return { verdict: 'live', lateMs: null, by: 'no-stamp' };
  const bound = remote ? REMOTE_LATE_MS : LATE_MS;
  const d = clock.delayMs - skewOf(clock);
  return d > bound ? { verdict: 'late', lateMs: d, by: 'next-stamp' } : { verdict: 'live', lateMs: Math.max(0, d), by: 'next-stamp' };
}

/** The stamp of the NEXT stamped top-level record in `text` — the unread rest
 *  of a stream buffer (one record per line). Bounded: at most `maxLines`
 *  records and `maxBytes` of text are looked at; a line that does not parse is
 *  skipped; nothing found ⇒ null. Never throws. */
function nextStampIn(text, { maxLines = 8, maxBytes = 262144 } = {}) {
  const buf = typeof text === 'string' ? text : '';
  let i = 0, seen = 0;
  while (seen < maxLines && i < buf.length && i < maxBytes) {
    const nl = buf.indexOf('\n', i);
    if (nl < 0) return null;                       // an incomplete last line is not a record yet
    const line = buf.slice(i, nl).trim();
    i = nl + 1;
    if (!line) continue;
    seen++;
    if (line[0] !== '{') continue;
    let rec = null;
    try { rec = JSON.parse(line); } catch { continue; }
    const t = stampOf(rec);
    if (t != null) return t;
  }
  return null;
}

/** The journal's words for how late (ms → "3h02m" / "4m" / "35s"). */
function lateWords(ms) {
  const s = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}

module.exports = { LATE_MS, REMOTE_LATE_MS, BURST_MS, SKEW_SPAN_MS, SKEW_JITTER_MS, SKEW_MIN_RECORDS, stampOf, observe, judge, verdictOfClock, nextStampIn, lateWords };
