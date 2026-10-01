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

/** The record's own emission instant (ms), or null when it states none. */
function stampOf(rec) {
  const s = rec && typeof rec.timestamp === 'string' ? rec.timestamp : null;
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) && t > 0 ? t : null;
}

/** The session's stream clock after `rec` arrived at `now`. A record without a
 *  stamp leaves the clock alone. → {clock, stamped} */
function observe(clock, rec, now) {
  const st = stampOf(rec);
  if (st == null) return { clock: clock || null, stamped: false };
  return { clock: { stampAt: st, arrivedAt: now, delayMs: now - st }, stamped: true };
}

/** Is `rec`, arriving at `now`, a live fact? → {verdict:'live'|'late'|'unknown', lateMs, by}
 *  `clock` = the stream clock as it stood BEFORE `rec` (for an unstamped record). */
function judge(clock, rec, now, { remote = false } = {}) {
  const bound = remote ? REMOTE_LATE_MS : LATE_MS;
  const st = stampOf(rec);
  if (st != null) {
    const d = now - st;
    return d > bound ? { verdict: 'late', lateMs: d, by: 'own-stamp' } : { verdict: 'live', lateMs: Math.max(0, d), by: 'own-stamp' };
  }
  if (clock && Number.isFinite(clock.arrivedAt) && now - clock.arrivedAt <= BURST_MS) {
    return clock.delayMs > bound
      ? { verdict: 'late', lateMs: clock.delayMs, by: 'burst' }
      : { verdict: 'live', lateMs: Math.max(0, clock.delayMs), by: 'burst' };
  }
  return { verdict: 'unknown', lateMs: null, by: 'no-stamp' };
}

/** The verdict a HELD (unknown) record gets from the stamped record that just
 *  arrived after it: that record's own verdict. */
function verdictOfClock(clock, { remote = false } = {}) {
  if (!clock || !Number.isFinite(clock.delayMs)) return { verdict: 'live', lateMs: null, by: 'no-stamp' };
  const bound = remote ? REMOTE_LATE_MS : LATE_MS;
  return clock.delayMs > bound ? { verdict: 'late', lateMs: clock.delayMs, by: 'next-stamp' } : { verdict: 'live', lateMs: Math.max(0, clock.delayMs), by: 'next-stamp' };
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

module.exports = { LATE_MS, REMOTE_LATE_MS, BURST_MS, stampOf, observe, judge, verdictOfClock, nextStampIn, lateWords };
