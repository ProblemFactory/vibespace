'use strict';
/**
 * quota-model.js — PURE (imports nothing, CJS so the bundle and the shipped
 * statusline tool can both carry it): THE TYPED LIMIT SET.
 *
 * WHAT WENT WRONG WITHOUT IT (three incidents, one root). Every quota reading
 * this product has ever taken was flattened into a HAND-SHAPED snapshot object
 * — `{fiveHour, sevenDay, scopedWeekly[], overage, spend, …}` — written by nine
 * producers with nine different merge policies and read by loose field access
 * all over the tree. That object cannot express what the vendors actually send:
 *
 *  (a) B-9213 — MORE THAN ONE LIMIT PER ACCOUNT. The codex app-server pushes a
 *      SEPARATE `rate_limits_updated` per limit, interleaved on one session.
 *      Measured on this instance's own buffers (sess-13, 208 pushes in one
 *      conversation): limitId `codex` (the plan, one 10080-min window, 5 %…
 *      100 %) 32×, `codex_bengalfox` / "GPT-5.3-Codex-Spark" (300-min + 10080-
 *      min, 0 %/0 %) 149×, and `premium` (no windows at all) 27×. All three
 *      were collapsed into ONE cache file, last-writer-wins: the file on disk
 *      while this was written held the Spark limit at 0 %/0 % and the plan
 *      limit was simply GONE. A panel flips 5 %→0 % between renders; a pool
 *      reading it sees headroom that does not exist.
 *  (b) B-8b12 — AN EMPTY WINDOW REPORTS A SLIDING RESET. A window that has not
 *      started answers `resetsAt = now + windowDuration` at EVERY read. Same
 *      corpus, 328 empty-window readings: `resetsAt − (measuredAt + window)`
 *      lands in [−489 s, −8 s], median −40 s, and 144 of 149 consecutive reads
 *      carry a DIFFERENT resetsAt. The panel printed it as a precise reset time
 *      (the owner read it as a banked reset being consumed), EDF would rank it
 *      as the soonest deadline forever, and auto-resume would arm on it. The
 *      same corpus's 125 genuinely-running readings sit ≥ 1151 s from the full
 *      window and their reset is PINNED (5 distinct values over 129 reads) —
 *      a 662-second dead band, which is what `EMPTY_WINDOW_JITTER_SEC` sits in.
 *  (c) claude's model-scoped cap exists for ONE family (owner: "除了 fable，没有
 *      模型 specific 的用量限制的") and lives in a `scopedWeekly[]` array beside
 *      the plan buckets; codex has no equivalent shape at all. Every reader
 *      special-cased both, so every reader had its own idea of "the account's
 *      remaining" and of "the account's deadline".
 *
 * THE MODEL. One account key holds a LIMIT SET: a list of LIMITS, each with its
 * own id, scope, provenance and WINDOWS. Nothing collapses; a producer that
 * knows about one limit updates one limit (`mergeLimitSets`); every reader asks
 * the SAME accessor which limit governs the model it is about to spend on
 * (`limitFor`), and `remaining()` / `deadline()` refuse to count a window that
 * has not started.
 *
 *   { identity, fetchedAt, source, limits: [ {
 *       limitId, name, scope:'plan'|'model'|'credits'|'overage',
 *       model, family,
 *       windows: [ { kind:'5h'|'7d'|'monthly'|<other>, minutes, usedPct,
 *                    resetsAt, state:'running'|'empty'|'unknown', measuredAt } ],
 *       flags: { reached, spendControl, overageInUse },
 *       source, fetchedAt } ],
 *     extra }                      // opaque harness fields the legacy view carries
 *
 * WHY IT IS PURE. Three consumers need the identical rules and only one of them
 * has a checkout: the orchestrator (write path, pool, panels), the browser
 * bundle (the three quota panels), and — like `reading-lag.js` before it — the
 * shipped statusline capture tool, which is a SINGLE FILE on hosts with no
 * `src/`. A rule with an import is a rule that cannot be mirrored.
 *
 * WHAT THIS MODULE MAY NOT DO. It never reads a file, never names an account by
 * inference, and never invents a window: a payload that states nothing produces
 * `state:'unknown'`, which every consumer must treat as "no claim" — never as
 * zero, never as full. (`P6`, docs/design-account-hardening.md §3.)
 */

// ── constants ───────────────────────────────────────────────────────────────

/** The window kinds we can put a duration to without being told. Everything
 *  else keeps whatever `minutes` the payload stated (0 = not stated). */
const WINDOW_MINUTES = Object.freeze({ '5h': 300, '7d': 10080 });

/** THE EMPTY-WINDOW TOLERANCE (B-8b12, measured — see the header).
 *  A window is EMPTY when nothing has been spent in it AND its reset is still
 *  a full window away, i.e. it is sliding with the clock rather than naming a
 *  deadline. The number sits inside a 662-second dead band measured on this
 *  instance's own corpus (empty readings ≤ 489 s of elapsed window, running
 *  readings ≥ 1151 s), and it is deliberately placed on the EMPTY side of that
 *  band: calling a running-but-0 % window empty costs only its deadline (it has
 *  full headroom either way), while calling an empty window running re-creates
 *  the incident — a sliding reset becomes an EDF deadline and an auto-resume
 *  arm time, every single read. */
const EMPTY_WINDOW_JITTER_SEC = 600;

/** THE SAME-WINDOW TOLERANCE. Two producers spell ONE window up to a minute
 *  apart (the on-demand panel and the event stream), so `reading-lag.js` has
 *  compared windows at ±120 s since 2.369.73; this is that number, and the two
 *  must stay equal — a wall judged at a different tolerance than a reading is
 *  two answers to one question, the defect class this whole file exists to
 *  end. scripts/test-quota-model.mjs pins them together. */
const WINDOW_JITTER_SEC = 120;

/** A STATED RESET LANDS A MINUTE LATE (2.369.117; B-a4f1 moved it here). The
 *  CLI's /usage panel names MINUTES ("resets 8:59am"), so a stated reset can be
 *  up to ~60 s early and the vendor's clock lags on top. Every reader that turns
 *  "the reset passed" into "the window is full again" waits this long after the
 *  stated instant: `bucketRemaining` (src/account-pool-auto.js) and the
 *  estimator's weekly roll (src/usage-estimator.js). One number, two readers —
 *  the estimator re-based a bucket on the bare instant while the pool's own
 *  reader waited, and the overlay handed the pool the re-based bucket. */
const RESET_GRACE_SEC = 60;
/** ONE CLOCK AND ONE INEQUALITY over that grace (lane pool-silent-members R4, inc-mvsjhna7): a window whose stated reset
 *  is `resetsAt` has LANDED once `resetsAt + RESET_GRACE_SEC <= nowSec` (whole seconds — `nowSec` is floored here, so
 *  a fractional clock and a floored one answer every second alike). Every reader asks THIS — bucketRemaining, quotaVerdict
 *  (src/account-pool-auto.js) and the estimator's weekly roll; `nowSecOf` is the one clock the pool's decisions read. */
function nowSecOf(ms = Date.now()) { return Math.floor(Number(ms) / 1000); }
function resetLanded(resetsAt, nowSec) {
  const r = Number(resetsAt) || 0;
  return r > 0 && r + RESET_GRACE_SEC <= Math.floor(Number(nowSec));
}

const SCOPES = Object.freeze(['plan', 'model', 'credits', 'overage']);
const STATES = Object.freeze(['running', 'empty', 'unknown']);

// ── small helpers (no imports, so they live here) ───────────────────────────

// `Number(null)` is 0 and `Number('')` is 0 — in a quota model those are the
// difference between "the vendor told us this window is untouched" and "the
// vendor said nothing", which is the single most load-bearing distinction here
// (P6: ignorance is never a claim). So absence is spelled out before the cast.
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function posNum(v) { const n = num(v); return n != null && n > 0 ? n : null; }
function str(v) { const s = v == null ? '' : String(v); return s ? s : null; }
function lower(v) { return String(v == null ? '' : v).toLowerCase(); }

/** Minutes for a window: what the payload said, else what the kind implies. */
function minutesOf(kind, stated) {
  const m = num(stated);
  if (m != null && m > 0) return m;
  return WINDOW_MINUTES[kind] || 0;
}

// ── windows ─────────────────────────────────────────────────────────────────

/** IS THIS WINDOW RUNNING, EMPTY, OR UNSTATED? (B-8b12.)
 *
 *  'empty'   — nothing spent AND the reset is (within jitter) exactly one full
 *              window from the moment we measured it. That is not a deadline:
 *              it is the vendor saying "this window starts at your first
 *              request", and it moves every time you ask.
 *  'running' — anything spent, or a reset that has visibly PINNED (it is closer
 *              than a full window away, so the window opened at some earlier
 *              request and the boundary is now a real instant).
 *  'unknown' — no usage figure at all; or a window at 0 % with no reset and no
 *              duration to compare against, so "untouched" and "just started"
 *              are indistinguishable. We were not told; we do not guess. Note
 *              what is NOT here: a window with a stated spend is never unknown,
 *              however little else the payload said (see below).
 *
 *  Note the asymmetry on purpose: `elapsed <= jitter` also catches a NEGATIVE
 *  elapsed (a reset further out than one full window — clock skew between the
 *  vendor and us). Skew cannot make an empty window look running. */
function windowState(win, { jitterSec = EMPTY_WINDOW_JITTER_SEC } = {}) {
  if (!win || typeof win !== 'object') return 'unknown';
  const used = num(win.usedPct);
  if (used == null) return 'unknown';
  // A STATED SPEND IS DECISIVE ON ITS OWN, AND IT IS TESTED FIRST (r3). The
  // deadline is what tells an UNTOUCHED window apart from a running one; it has
  // nothing to say about a window the vendor has just told us is 90 % gone.
  // Asking for it first collapsed "we know the utilization but not the reset"
  // into 'unknown' — and 'unknown' is dropped by `bucketCounts`, so the bucket
  // vanished from `accountRemaining` / `weeklyDeadline` / `bucketRems` / the
  // anchor stream and the pool went on spending against it.
  //
  // REACHABLE, NOT THEORETICAL: the `· resets` clause of a claude panel line is
  // OPTIONAL (claude-quota's `parseCliUsageText`, and scripts/test-cli-usage-
  // parse.mjs pins the reset-less shape), `refreshViaCliPanel` deliberately
  // refuses to project the 5-hour one ("its window starts with the first
  // request; a stale one would be a lie"), and `parseOAuthUsage` maps a missing
  // reset to 0 the same way. Four of the nine live claude cache files on this
  // instance hold exactly that shape. A wall then marks the bucket spent and
  // the pool reads the account as HEALTHY — measured end to end: remaining
  // 80 %, `decidePoolSwitch` 'healthy', on a member the CLI had just rejected.
  if (used > 0) return 'running';
  const resetsAt = posNum(win.resetsAt);
  if (resetsAt == null) return 'unknown';
  const minutes = minutesOf(str(win.kind), win.minutes);
  const measuredAt = posNum(win.measuredAt);
  if (!minutes || measuredAt == null) return 'unknown';
  const elapsed = Math.round(measuredAt / 1000) + minutes * 60 - resetsAt;
  return elapsed <= jitterSec ? 'empty' : 'running';
}

/** Build a window record, stamping its own state. `measuredAt` is WHEN WE WERE
 *  TOLD (ms) — the only clock the empty test may use, because the question is
 *  "how far into this window was the vendor when it answered". */
function makeWindow({ kind, minutes = null, usedPct = null, resetsAt = null, measuredAt = null, status = null }, opts = undefined) {
  const k = str(kind) || 'other';
  const stated = num(minutes) != null && num(minutes) > 0;
  const w = {
    kind: k,
    minutes: minutesOf(k, minutes),
    // DID THE PAYLOAD STATE ITS OWN DURATION? codex does (`window_minutes` /
    // `windowDurationMins`); claude never has — its 5h/7d durations are implied
    // by the bucket NAME. The distinction is not pedantry: `toLegacyView` may
    // only re-emit what a producer stated, or the projection invents a
    // `windowMinutes` on a claude bucket, and the next reader's shape detection
    // reads that file as codex (reproduced — it flipped a limit-banner mark's
    // whole bucket).
    minutesStated: stated,
    usedPct: num(usedPct),
    resetsAt: posNum(resetsAt),
    measuredAt: posNum(measuredAt),
    state: 'unknown',
  };
  if (status) w.status = String(status);
  w.state = windowState(w, opts);
  return w;
}

/** Remaining percent for ONE window, or null when it makes no claim.
 *  A reset that already passed means the window rolled over since we read it —
 *  the stale utilization is meaningless and the window is full again (the
 *  `bucketRemaining` rule this model inherits, verbatim). */
function windowRemaining(win, nowSec) {
  if (!win || typeof win !== 'object') return null;
  const reset = posNum(win.resetsAt);
  const now = num(nowSec) != null ? num(nowSec) : Math.floor(Date.now() / 1000);
  if (reset != null && reset < now) return 100;
  const used = num(win.usedPct);
  if (used == null) return null;
  return Math.max(0, Math.min(100, Math.round((100 - used) * 100) / 100));
}

// ── THE DISPLAY VERDICT (lane reset-unproven, owner rulings 2026-10-30) ────────
// «界面里对于 reset 了但没证实的账号要展示的像是 reset 了的账号而不是 reset 之前的状态，不然我看到会以为没账号可用». A
// bucket whose last reading's reset has PASSED, with nothing newer in hand, is SHOWN as reset — 0 % used, marked
// unconfirmed, with its reset instant — never the stale pre-reset number (the roster showed a member 95 % used whose
// weekly reset had passed days before). ONE verdict, here; every surface that draws a bucket reads it and none decides
// «the reset passed» itself. The stored window is never rewritten for this: the cache keeps the vendor's instant and
// the clock derives the rest. «Lifted» (lane no-5h-window's tombstone) is its own shape: no window, and never «unread».

/** WHAT A SURFACE SHOWS FOR ONE BUCKET. `win` = a typed window ({usedPct, resetsAt s, measuredAt ms, state}) or a
 *  legacy bucket ({utilization 0..1 | usedPercent, resetsAt s — ms tolerated, state?}); `nowMs` = the caller's clock.
 *    'read'              the reading stands — `usedPct` its stated spend (null when it stated none)
 *    'reset-unconfirmed' its stated reset has LANDED (`resetLanded`: the pool's own inequality, the grace included) — the
 *                        window rolled, so it is shown FULL: `usedPct` 0, `resetAt` the instant it reset. Only a window
 *                        that may name a deadline rolls: an 'empty' / 'unknown' window's reset slides (B-8b12)
 *    'lifted'            no window, and the caller hands the tombstone (`absentSince`, ms) — a window present outranks
 *                        it, exactly as in `fiveHourAbsent`
 *    'unread'            no window, or one stating neither a spend nor a reset
 *  → { state, usedPct, resetAt (ms | null), readAt (ms | null — the window's `measuredAt`, else the caller's `readAt`) } */
function windowDisplay(win, nowMs, { absentSince: lifted = null, readAt = null } = {}) {
  if (!win || typeof win !== 'object') {
    const since = posNum(lifted);
    return since != null ? { state: 'lifted', usedPct: null, resetAt: null, readAt: since } : { state: 'unread', usedPct: null, resetAt: null, readAt: null };
  }
  const readMs = posNum(win.measuredAt) ?? posNum(readAt);
  const u = num(win.utilization);
  const used = num(win.usedPct) ?? num(win.usedPercent) ?? (u != null ? Math.round(u * 10000) / 100 : null);
  const r = posNum(win.resetsAt);
  const resetSec = r == null ? null : (r > 1e12 ? Math.floor(r / 1000) : r);
  if (used == null && resetSec == null) return { state: 'unread', usedPct: null, resetAt: null, readAt: readMs };
  const mayRoll = win.state === undefined || win.state === null || win.state === 'running';
  const now = num(nowMs) != null ? num(nowMs) : Date.now();
  if (mayRoll && resetSec != null && resetLanded(resetSec, now / 1000)) return { state: 'reset-unconfirmed', usedPct: 0, resetAt: resetSec * 1000, readAt: readMs };
  return { state: 'read', usedPct: used, resetAt: resetSec != null ? resetSec * 1000 : null, readAt: readMs };
}

/** IS THIS MEMBER'S STANDING A READING OR A GUESS? (the proving spawn's question, account-pool-auto `decidePoolSwitch`.)
 *  `x` = a cache object / its view (legacy buckets `fiveHour`, `sevenDay`, `scopedWeekly`, a projection's `spareScoped`)
 *  or a typed LimitSet (`limits` only). Judge it on the READING, never on an estimator overlay: an overlay re-bases a
 *  rolled weekly bucket onto next week's projected reset, which would read as fresh.
 *    'unread'            nothing stated at all — no cache, or no window making a claim and no tombstone
 *    'reset-unconfirmed' EVERY window that may name a deadline has rolled (`windowDisplay`) with nothing newer in hand
 *    'proven'            anything else. An 'empty' window is no evidence of now (B-8b12) and is not counted; a member
 *                        stating only such windows was READ (a free member is not an unknown one, §9 r4). A lifted 5h
 *                        is not a window: it never leaves a member unread and never counts as reset-unconfirmed. */
function memberProofState(x, nowMs) {
  if (!x || typeof x !== 'object') return 'unread';
  const arr = (v) => (Array.isArray(v) ? v : []);
  const legacy = ['fiveHour', 'sevenDay'].some((k) => x[k] && typeof x[k] === 'object') || arr(x.scopedWeekly).length > 0 || arr(x.spareScoped).length > 0;
  const wins = legacy ? [x.fiveHour, x.sevenDay, ...arr(x.scopedWeekly), ...arr(x.spareScoped)] : limitsOf(x).flatMap((l) => windowsOf(l));
  let stated = 0, counting = 0, rolled = 0;
  for (const w of wins) {
    const d = windowDisplay(w, nowMs);
    if (d.state === 'unread') continue;
    stated++;
    if (w.state !== undefined && w.state !== null && w.state !== 'running') continue;
    counting++;
    if (d.state === 'reset-unconfirmed') rolled++;
  }
  if (counting) return rolled === counting ? 'reset-unconfirmed' : 'proven';
  const lifted = fiveHourAbsent(x) != null || limitsOf(x).some((l) => absentSince(l, '5h') != null);
  return stated || lifted ? 'proven' : 'unread';
}

// ── limits ──────────────────────────────────────────────────────────────────

function makeLimit({ limitId, name = null, scope = 'plan', model = null, family = null, windows = [], flags = null, source = null, fetchedAt = null }, opts = undefined) {
  return {
    limitId: String(limitId),
    name: str(name),
    scope: SCOPES.includes(scope) ? scope : 'plan',
    model: str(model),
    family: str(family),
    windows: (Array.isArray(windows) ? windows : []).map((w) => (w && w.state && ('kind' in w) ? w : makeWindow(w || {}, opts))),
    flags: flags && typeof flags === 'object' ? { ...flags } : {},
    source: str(source),
    fetchedAt: posNum(fetchedAt),
  };
}

function makeLimitSet({ identity = null, fetchedAt = null, source = null, limits = [], extra = null } = {}) {
  return {
    identity: str(identity),
    fetchedAt: posNum(fetchedAt),
    source: str(source),
    limits: (Array.isArray(limits) ? limits : []).filter(Boolean),
    ...(extra && typeof extra === 'object' ? { extra: { ...extra } } : {}),
  };
}

const EMPTY_SET = Object.freeze({ identity: null, fetchedAt: null, source: null, limits: Object.freeze([]) });

function limitsOf(set) { return set && Array.isArray(set.limits) ? set.limits : []; }
function windowsOf(limit) { return limit && Array.isArray(limit.windows) ? limit.windows : []; }
function windowOfKind(limit, kind) { return windowsOf(limit).find((w) => w && w.kind === kind) || null; }

// ── A WINDOW THE VENDOR REMOVED (lane no-5h-window, 2026-10-30) ─────────────
// Anthropic renamed Max 20x → Ultra and is lifting the rolling 5-hour limit from verified Ultra accounts in
// stages (weekly limits unchanged; the $100 Max keeps its 5-hour window; a newer account keeps a temporary one
// until it is verified). So a plan may hold NO '5h' window, and that is a COMPLETE reading — never a default 0 %
// window pretending to exist. Two shapes this model keeps apart, because they mean opposite things:
//   «no 5h limit»            a reading that ENUMERATED the plan's windows listed no '5h' one (the /usage panel
//                            with no «Current session» row; a rate_limit_event whose `unifiedWindows` names only
//                            the week; an OAuth / get_usage reply with `five_hour` null) ⇒ the plan holds NO '5h'
//                            window and a dated TOMBSTONE `flags.absent['5h'] = <ms, first said>`; the projection
//                            says it as `fiveHourAbsent`;
//   «5h window not started»  a '5h' window IS listed, at 0 % with no reset (the panel's «Current session: 0% used»)
//                            ⇒ a window like any other, its `state` fencing the sliding reset (B-8b12).
// A tombstone and a window of one kind never coexist: the NEWER claim wins (`settleAbsence`) — a window measured
// after the removal is the window BACK (a newer account's temporary limit), one measured before it is gone. Only
// a reading that enumerated may lay one (`markWindowEnumeration`: a symbol, so no stored object can forge it —
// the r6 law of `markScopedEnumeration`); a producer that knows one bucket states nothing about the others.
const WINDOWS_ABSENT = Symbol('planWindowsAbsent');

/** When did an enumerating reading first find `kind` missing from this limit? ms, or null (no claim). */
function absentSince(limit, kind) {
  const a = limit && limit.flags && limit.flags.absent;
  return a && typeof a === 'object' ? posNum(a[kind]) : null;
}

/** One limit with its tombstones settled against its windows: the newer claim wins, a tie keeps the window (a
 *  stated window is a constraint; dropping one is the optimistic direction). Returns the limit itself when it
 *  carries no tombstone. */
function settleAbsence(limit) {
  const a = limit && limit.flags && limit.flags.absent;
  if (!a || typeof a !== 'object') return limit;
  const absent = {};
  let windows = windowsOf(limit);
  for (const [kind, v] of Object.entries(a)) {
    const since = posNum(v);
    if (since == null) continue;
    const w = windows.find((x) => x && x.kind === kind);
    if (w && (posNum(w.measuredAt) || 0) >= since) continue; // measured after the removal: the window is BACK
    if (w) windows = windows.filter((x) => x !== w);         // measured before it: the vendor removed it since
    absent[kind] = since;
  }
  const flags = { ...limit.flags };
  if (Object.keys(absent).length) flags.absent = absent; else delete flags.absent;
  return { ...limit, windows, flags };
}

/** A reading that enumerated this limit's windows found `kinds` missing at `at` (ms): those windows go, the
 *  tombstone keeps the EARLIER instant it was first said (the «since» the Usage popup prints). */
function markWindowsAbsent(limit, kinds, at) {
  const t = posNum(at);
  const list = (Array.isArray(kinds) ? kinds : []).map(str).filter(Boolean);
  if (!limit || t == null || !list.length) return limit;
  const absent = { ...(limit.flags && limit.flags.absent && typeof limit.flags.absent === 'object' ? limit.flags.absent : {}) };
  for (const k of list) { const was = posNum(absent[k]); absent[k] = was != null && was <= t ? was : t; }
  return settleAbsence({ ...limit, windows: windowsOf(limit).filter((w) => !(w && list.includes(w.kind))), flags: { ...(limit.flags || {}), absent } });
}

/** Mark a parse result with the plan windows it ENUMERATED and found missing (`kinds`, e.g. ['5h']). A parser
 *  that cannot prove it saw the whole panel passes [] (format drift costs the claim, never the reading). Returns
 *  the same object. Non-enumerable, symbol-keyed: a spread copy or a stored file carries no claim. */
function markWindowEnumeration(parsed, kinds) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const list = (Array.isArray(kinds) ? kinds : []).map(str).filter(Boolean);
  try { Object.defineProperty(parsed, WINDOWS_ABSENT, { value: list, enumerable: false, configurable: true, writable: true }); } catch { /* frozen: no claim */ }
  return parsed;
}

/** The plan window kinds THIS parse enumerated and found missing — [] when it claims nothing. The enumerating
 *  call sites hand it to the write path (`absentWindows`), exactly where they hand `authoritativeScopesOf`. */
function absentWindowsOf(parsed) {
  const v = parsed && typeof parsed === 'object' ? parsed[WINDOWS_ABSENT] : null;
  return Array.isArray(v) ? v.slice() : [];
}

/** «No 5h limit» on a cache object / its view (ms since), or null. The ONE predicate the readers ask, so «the
 *  5h window has not started» (a window at 0 %) and «there is no 5h window» (this) are never one answer. */
function fiveHourAbsent(cache) {
  if (!cache || typeof cache !== 'object') return null;
  if (cache.fiveHour && typeof cache.fiveHour === 'object') return null; // a window present outranks a stale mark
  return posNum(cache.fiveHourAbsent);
}

/** A SIBLING's reading read in place of a member's own file (the identity group's freshest file — the pool's
 *  readCache, the Usage popup's same-account merge) keeps the member's own «no 5h limit»: a sibling's 5h window never
 *  outranks the member's tombstone; only a reading written ON the member's file brings the window back (the write
 *  path's own settle). Returns the reading itself when the member has no tombstone or IS the reading. */
function withOwnAbsence(reading, own) {
  const since = fiveHourAbsent(own);
  if (!since || !reading || typeof reading !== 'object' || reading === own) return reading;
  const out = { ...reading, fiveHourAbsent: since };
  delete out.fiveHour;
  if (Array.isArray(out.limits)) out.limits = out.limits.map((l) => (l && l.scope === 'plan' ? markWindowsAbsent(l, ['5h'], since) : l));
  return out;
}

// >>> 5h-witness mirror (src/quota-model.js) — keep byte-identical
// THE PASSIVE WITNESS, COUNTED PER PRODUCER (lane no-5h-window r4, acceptance r3 BLOCKER). A passive answer — a
// statusline render, a stream `rate_limit_event` — is ONE claude process's own rate-limit state, and the CLI drops a
// window whose reset passed from it (2.1.314), so «the week and no five_hour» is every member's shape after its 5h
// reset. It is evidence only when it carries a NEW API answer: the week moved FORWARD against THAT producer's own
// previous reading (a later week, or the same week at a strictly higher %). The usage file is shared by every
// session on the account, so the file's last writer is no baseline: two sessions holding different stale weeks would
// alternate and read as movement. So each producer keeps its own `{n, lastSig, at}` (dropped after 24 h); a
// producer's first answer only sets its baseline; TWO moved answers from the SAME producer lay the tombstone. A
// stated 5h window ends that producer's count, and every count when it is itself a new answer. On a «no 5h» file a
// stated 5h window RESTORES only when it is newer than the tombstone — it began at or after the instant the tombstone
// was laid, or its producer's week moved (a new answer that has a 5h window); one that began before it is a session
// that never saw the lift (STALE: kept out, nothing said). Spelled once here; the shipped statusline (a single file
// that cannot require src/) carries these bytes between the same sentinels, pinned by test-quota-model §㉑.
const FIVE_HOUR_SEC = 5 * 3600;
const PASSIVE_WITNESSES = 2;
const WITNESS_TTL_MS = 24 * 3600e3;
const WITNESS_PRODUCERS_MAX = 16;
const SAME_WEEK_SEC = 3600; // one weekly window's reset, spelled by one producer, never moves this far
/** The plan week as a passive producer read it, `7d:<integer %>@<reset s>` — or null (no week, no reset). */
function planWeekSigOf(win) {
  return win && typeof win.utilization === 'number' && Number(win.resetsAt) > 0 ? `7d:${Math.round(win.utilization * 100)}@${Number(win.resetsAt)}` : null;
}
function weekSigParts(sig) {
  const m = /^7d:(\d+)@(\d+)$/.exec(typeof sig === 'string' ? sig : '');
  return m ? { pct: Number(m[1]), reset: Number(m[2]) } : null;
}
/** Did the week move FORWARD from `prevSig` to `sig`? A later week, or the same week at a strictly higher %. An
 *  older or lower reading — another session's stale state — never moves it. */
function weekMovedForward(prevSig, sig) {
  const a = weekSigParts(prevSig), b = weekSigParts(sig);
  if (!a || !b) return false;
  if (b.reset - a.reset > SAME_WEEK_SEC) return true;
  return Math.abs(b.reset - a.reset) <= SAME_WEEK_SEC && b.pct > a.pct;
}
/** The file's per-producer witnesses, bounded: none older than 24 h, the newest WITNESS_PRODUCERS_MAX kept. */
function liveWitnesses(witnesses, now) {
  const src = witnesses && typeof witnesses === 'object' && !Array.isArray(witnesses) ? witnesses : {};
  const rows = [];
  for (const p of Object.keys(src)) {
    const e = src[p];
    if (!e || typeof e !== 'object' || typeof e.lastSig !== 'string' || !(Number(e.at) > 0) || now - Number(e.at) > WITNESS_TTL_MS) continue;
    rows.push([p, { n: Number(e.n) > 0 ? Math.floor(Number(e.n)) : 0, lastSig: e.lastSig, at: Number(e.at) }]);
  }
  rows.sort((x, y) => y[1].at - x[1].at);
  const out = {};
  for (const [p, e] of rows.slice(0, WITNESS_PRODUCERS_MAX)) out[p] = e;
  return out;
}
/** ONE PASSIVE ANSWER, COUNTED (pure). `witnesses` = the file's; `producer` = the session that read it (null = not
 *  countable: a replay, a re-drive); `sig` = planWeekSigOf(its week); `fiveHour` = the 5h window it STATED
 *  ({resetsAt} s) or null; `absent5h` = it read the week and no five_hour; `absentAt` = the file's tombstone (ms) or 0.
 *  ⇒ { witnesses (to store), moved, lay (lay the tombstone), restore (the stated 5h window is back), stale (the
 *  stated 5h window is older than the tombstone: keep it out, say nothing) }. */
function countPassiveAnswer({ witnesses, producer, sig, fiveHour, absent5h, absentAt, now }) {
  const w = liveWitnesses(witnesses, now);
  const p = typeof producer === 'string' && producer ? producer.slice(0, 120) : null;
  const prev = p ? w[p] : null;
  const moved = !!(prev && sig && weekMovedForward(prev.lastSig, sig));
  const res = { witnesses: w, moved, lay: false, restore: false, stale: false };
  if (p && sig) w[p] = { n: prev ? prev.n : 0, lastSig: !prev || moved || !weekSigParts(prev.lastSig) ? sig : prev.lastSig, at: now };
  const since = Number(absentAt) > 0 ? Number(absentAt) : 0;
  const endAll = () => { for (const k of Object.keys(w)) w[k].n = 0; };
  if (fiveHour) {
    if (since) {
      if (moved || ((Number(fiveHour.resetsAt) || 0) - FIVE_HOUR_SEC) * 1000 >= since) res.restore = true;
      else res.stale = true;
    }
    if (p && sig) w[p].n = 0;
    if (moved || res.restore) endAll();
  } else if (absent5h && !since && moved) {
    w[p].n += 1;
    if (w[p].n >= PASSIVE_WITNESSES) { res.lay = true; endAll(); }
  }
  return res;
}
// <<< 5h-witness mirror

// ── the validator ───────────────────────────────────────────────────────────

/** REJECT A MALFORMED SET, WITH THE REASONS. Called at the write path, which
 *  refuses loudly rather than persisting a shape the readers cannot read. The
 *  point is not paranoia: nine producers write this store, and the ones that
 *  broke it did so by writing a field NOBODY declared. */
function validateLimitSet(set) {
  const errors = [];
  if (!set || typeof set !== 'object' || Array.isArray(set)) return { ok: false, errors: ['not an object'] };
  if (set.identity != null && typeof set.identity !== 'string') errors.push('identity must be a string or null');
  if (set.fetchedAt != null && !(Number.isFinite(Number(set.fetchedAt)) && Number(set.fetchedAt) > 0)) errors.push('fetchedAt must be a positive number');
  if (set.source != null && typeof set.source !== 'string') errors.push('source must be a string or null');
  if (!Array.isArray(set.limits)) return { ok: false, errors: errors.concat('limits must be an array') };
  const ids = new Set();
  set.limits.forEach((l, i) => {
    const at = `limits[${i}]`;
    if (!l || typeof l !== 'object') { errors.push(`${at} is not an object`); return; }
    if (typeof l.limitId !== 'string' || !l.limitId) errors.push(`${at}.limitId must be a non-empty string`);
    else if (ids.has(l.limitId)) errors.push(`${at}.limitId '${l.limitId}' is a duplicate — a set holds one record per limit`);
    else ids.add(l.limitId);
    if (!SCOPES.includes(l.scope)) errors.push(`${at}.scope must be one of ${SCOPES.join('|')} (got ${JSON.stringify(l.scope)})`);
    if (l.fetchedAt != null && !(Number.isFinite(Number(l.fetchedAt)) && Number(l.fetchedAt) > 0)) errors.push(`${at}.fetchedAt must be a positive number`);
    if (!Array.isArray(l.windows)) { errors.push(`${at}.windows must be an array`); return; }
    // THE TOMBSTONE'S SHAPE (lane no-5h-window): kind → the positive ms it was first said. Coexistence with a
    // window of the same kind is SETTLED by every merge (`settleAbsence`), never refused — a file a direct
    // writer left in that state is healed, not dropped.
    const ab = l.flags && l.flags.absent;
    if (ab !== undefined && (!ab || typeof ab !== 'object' || Array.isArray(ab) || Object.values(ab).some((v) => !(Number.isFinite(Number(v)) && Number(v) > 0))))
      errors.push(`${at}.flags.absent must map a window kind to a positive ms timestamp (got ${JSON.stringify(ab)})`);
    const kinds = new Set();
    l.windows.forEach((w, j) => {
      const wat = `${at}.windows[${j}]`;
      if (!w || typeof w !== 'object') { errors.push(`${wat} is not an object`); return; }
      if (typeof w.kind !== 'string' || !w.kind) errors.push(`${wat}.kind must be a non-empty string`);
      else if (kinds.has(w.kind)) errors.push(`${wat}.kind '${w.kind}' is a duplicate within one limit`);
      else kinds.add(w.kind);
      if (!STATES.includes(w.state)) errors.push(`${wat}.state must be one of ${STATES.join('|')} (got ${JSON.stringify(w.state)})`);
      if (w.usedPct != null && !(Number.isFinite(Number(w.usedPct)) && Number(w.usedPct) >= 0 && Number(w.usedPct) <= 100)) errors.push(`${wat}.usedPct must be 0..100 or null (got ${JSON.stringify(w.usedPct)})`);
      if (w.resetsAt != null && !(Number.isFinite(Number(w.resetsAt)) && Number(w.resetsAt) > 0)) errors.push(`${wat}.resetsAt must be a positive unix-seconds value or null`);
      if (w.minutes != null && !(Number.isFinite(Number(w.minutes)) && Number(w.minutes) >= 0)) errors.push(`${wat}.minutes must be a non-negative number`);
      if (w.minutesStated !== undefined && typeof w.minutesStated !== 'boolean') errors.push(`${wat}.minutesStated must be a boolean`);
      if (w.measuredAt != null && !(Number.isFinite(Number(w.measuredAt)) && Number(w.measuredAt) > 0)) errors.push(`${wat}.measuredAt must be a positive ms timestamp or null`);
    });
  });
  return { ok: !errors.length, errors };
}

// ── THE ONE ACCESSOR ────────────────────────────────────────────────────────

/** Does this limit name the model / family the caller is about to spend on?
 *  Matching is by the limit's own declared `model`/`family` first and only then
 *  by its human NAME, because a name is the vendor's marketing string
 *  ("GPT-5.3-Codex-Spark") while `family` is the coarse vocabulary the scoped
 *  weekly caps actually scope on. */
function limitNamesModel(limit, { model = null, family = null } = {}) {
  if (!limit) return false;
  const fam = lower(family), mdl = lower(model);
  if (fam && lower(limit.family) && lower(limit.family) === fam) return true;
  // CONTAINMENT RUNS ONE WAY ONLY: the limit's model name must be found IN the
  // served model, never the reverse. Measured shape — the served model
  // `gpt-5.3-codex` is a PREFIX of the Spark limit's `GPT-5.3-Codex-Spark`, so
  // a two-way test hands every plain codex turn the Spark limit, which is the
  // one limit that always reads 0 %. A limit governs a model when its own name
  // appears in that model's, not when it happens to start the same way.
  if (mdl && lower(limit.model) && mdl.includes(lower(limit.model))) return true;
  const nm = lower(limit.name);
  if (!nm) return false;
  if (fam && nm.includes(fam)) return true;
  if (mdl && mdl.includes(nm)) return true;
  return false;
}

/** Among plan-scope limits, THE one: prefer a limit that actually reported a
 *  window (this instance's codex `premium` limit reports none — 27 measured
 *  pushes, `primary` and `secondary` both null — and it must never displace the
 *  plan limit that does), then the freshest. */
function planLimit(set) {
  const plans = limitsOf(set).filter((l) => l && l.scope === 'plan');
  if (!plans.length) return null;
  const withWindows = plans.filter((l) => windowsOf(l).length);
  const pool = withWindows.length ? withWindows : plans;
  return pool.slice().sort((a, b) => (b.fetchedAt || 0) - (a.fetchedAt || 0))[0] || null;
}

/** THE ONE ACCESSOR every reader uses: which limit governs a spend on this
 *  model? The model-scoped limit when one names the model or its family,
 *  otherwise the plan limit. It never collapses two limits into a guess and it
 *  never invents one — `null` means this set says nothing. */
function limitFor(set, { model = null, family = null } = {}) {
  if (model || family) {
    const scoped = limitsOf(set).filter((l) => l && l.scope === 'model' && limitNamesModel(l, { model, family }));
    if (scoped.length) return scoped.slice().sort((a, b) => (b.fetchedAt || 0) - (a.fetchedAt || 0))[0];
  }
  return planLimit(set);
}

/** EVERY limit that constrains a spend on this model — the plan limit AND the
 *  model-scoped one, because both apply at once (a model cap is a component of
 *  the plan window, not an alternative to it). This is the list `remaining()`
 *  mins over, and it is why a Spark bucket at 0 % can never grant headroom the
 *  plan bucket does not have (B-9213). Credits/overage limits are NOT here:
 *  they are money, not quota, and they get their own surfaces. */
function applicableLimits(set, { model = null, family = null } = {}) {
  const out = [];
  const plan = planLimit(set);
  if (plan) out.push(plan);
  if (model || family) {
    for (const l of limitsOf(set)) {
      if (l && l.scope === 'model' && limitNamesModel(l, { model, family }) && !out.includes(l)) out.push(l);
    }
  } else {
    // No model stated ⇒ every model cap still binds SOME request on this
    // account, and the pool's account-level gate has always been the min across
    // every known bucket. Keeping that is the conservative direction.
    for (const l of limitsOf(set)) if (l && l.scope === 'model' && !out.includes(l)) out.push(l);
  }
  return out;
}

// ── remaining / deadline: TWO QUESTIONS, TWO PREDICATES ─────────────────────
//
// A WINDOW THAT HAS NOT STARTED ANSWERS THEM DIFFERENTLY, AND r3 GAVE BOTH THE
// SAME ANSWER (the r4 verifier's finding, reproduced end to end).
//
//   "WHEN DOES THIS BUDGET END?"  An empty window has no answer. Its reset is
//       `now + duration` on every read (B-8b12: 144 distinct "reset times"
//       across 149 consecutive reads of one bucket), so ranking on it makes it
//       the earliest deadline forever and arms auto-resume on a number that
//       will have moved by the time it fires. `bucketCounts`/`countingWindows`
//       exist for this question and are UNCHANGED — deadline(), weeklyDeadline,
//       the anchor stream, the window fingerprint and auto-resume's arm all ask
//       it, and all of them are right to drop an empty window.
//
//   "HOW MUCH IS LEFT?"  An empty window has a precise answer: ALL of it. The
//       vendor stated a spend of 0 %. Dropping that turns a definite claim into
//       ignorance — and ignorance is not neutral here, it is `known:false`,
//       which the pool ranks at UNKNOWN_REMAINING_PCT (50) and `quotaVerdict`
//       reports as "no usage data" (`usable:null`).
//
// MEASURED HARM OF COLLAPSING THEM. A brand-new claude account whose panel says
// "0 % used" on both plan buckets — the ordinary shape, because the `· resets`
// clause of a panel line is optional and `refreshViaCliPanel` deliberately
// refuses to project the 5-hour one — read back as "no usage data": remaining
// 100 %/known → null/unknown, `quotaVerdict` usable true → null, `rankPoolMembers`
// eff 100 → 50, and `decidePoolSwitch` off an EXHAUSTED member (4 % left) went
// from `to:'new' reason:'exhausted'` to `to:null reason:'no-settleable'`. That
// is a REGRESSION against the base commit and it is money: the pool keeps
// spending on a spent member while a fully free one sits beside it. Running
// this branch's OWN migration over a copy of this instance's usage-cache
// (12 scanned / 12 stamped / 31 limits / idempotent) flips exactly one of the
// twelve files — `__global_codex__.json`, the one whose every window is fresh,
// i.e. the measured B-8b12 shape — from usable to "no usage data".
//
// AND INCLUDING THEM CANNOT MAKE AN ACCOUNT LOOK BETTER THAN IT IS: `remaining`
// is a MIN over every applicable window, so a window at 100 % free can never
// lift another limit's 5 %. It can only change `known:false` → `known:true`.
// That is what B-9213 was actually about — a Spark push OVERWRITING the plan
// limit — and the per-limit merge is what fixes it, not this filter. §⑫'s own
// negative control has said so since r1: "an empty bucket is 100 % free, so it
// never HID an exhaustion — the harm was always the deadline".
//
// HONEST BOUNDARY. A file holding ONLY an empty limit — which is exactly what
// B-9213 left behind on this instance's `__global_codex__.json`, the plan limit
// overwritten away — therefore reads USABLE. That is the pre-model behaviour
// restored, not a new claim: it is what every release before this branch
// answered, and `known:false` was never protection (the pool ranks an unknown
// member at UNKNOWN_REMAINING_PCT and still offers it, while `quotaVerdictFor`
// reports the whole POOL blocked). The thing that actually repairs that file is
// the per-limit merge plus the backfill: the first real plan push restores the
// plan limit and it binds from then on.

/** DOES THIS BUCKET COUNT — i.e. may it name a DEADLINE? The ONE predicate
 *  every reader outside this module asks about an empty window, in the LEGACY
 *  spelling too (the derived view stamps `state` on the bucket for exactly
 *  this). An 'empty' window is not a deadline; 'unknown' is a bucket the
 *  payload never described. Neither may be ranked on.
 *
 *  THIS IS NOT THE REMAINING QUESTION — see `bucketStatesSpend`. */
function bucketCounts(b) {
  if (!b || typeof b !== 'object') return false;
  return b.state === undefined || b.state === 'running';
}

/** WINDOWS THAT NAME A DEADLINE. An 'empty' window's reset slides with the
 *  clock and an 'unknown' window states no reset at all, so neither may enter
 *  `deadline()` — that is the whole of the B-8b12 fix, and it is a rule about
 *  the DEADLINE only. */
function countingWindows(limit) { return windowsOf(limit).filter((w) => w && w.state === 'running'); }

/** DOES THIS WINDOW STATE A SPEND? The remaining question's predicate, typed
 *  spelling. `num()` and not `Number()`: `Number(null)` is 0, and "the vendor
 *  said nothing" must never read as "the vendor said zero" (P6). */
function windowStatesSpend(w) { return !!w && typeof w === 'object' && num(w.usedPct) != null; }

/** The same question in the LEGACY spelling (`utilization`, 0..1) — the shape
 *  `src/account-pool-auto.js` reads off the derived view. The pair lives here,
 *  side by side, because one rule in two spellings drifts the moment they are
 *  written in two files; scripts/test-quota-model.mjs drives both.
 *
 *  It is STRICTLY MORE CONSERVATIVE than the pre-model `bucketRemaining`, which
 *  used `Number.isFinite(Number(b.utilization))` and therefore called
 *  `utilization: null` a stated 0 %. Measured on this instance: 35 cache
 *  buckets and 14,286 anchor buckets, ZERO of them missing or null — the shape
 *  that behaves differently does not occur, and refusing it is the direction
 *  that cannot invent headroom. */
function bucketStatesSpend(b) { return !!b && typeof b === 'object' && num(b.utilization) != null; }

/** WINDOWS THAT STATE A REMAINING. Every window whose spend the vendor stated,
 *  whatever its deadline is worth. */
function spendingWindows(limit) { return windowsOf(limit).filter(windowStatesSpend); }

/** Remaining percent for a spend on this model = the MIN across every window
 *  that STATES A SPEND, over every applicable limit. `known:false` = this set
 *  cannot say, and callers must treat that as "no claim" (the pool's
 *  UNKNOWN_REMAINING_PCT rung), never as 0 and never as 100. */
function remaining(set, { model = null, family = null, nowSec = null } = {}) {
  const now = num(nowSec) != null ? num(nowSec) : Math.floor(Date.now() / 1000);
  let best = null, by = null, kind = null;
  for (const l of applicableLimits(set, { model, family })) {
    for (const w of spendingWindows(l)) {
      const r = windowRemaining(w, now);
      if (r == null) continue;
      if (best == null || r < best) { best = r; by = l.limitId; kind = w.kind; }
    }
  }
  return { remaining: best, known: best != null, by, kind };
}

/** Per-window remainings, tagged — the reporting shape the pool's honest
 *  "which bucket is actually spent" message is built from. Empty windows are
 *  REPORTED (with their state) so a panel can say "starts on first use".
 *
 *  THE ROW ANSWERS BOTH QUESTIONS SEPARATELY (r4). `remaining` follows the
 *  stated spend, so an untouched window says 100 % rather than nothing;
 *  `counts` and `resetsAt` follow the DEADLINE predicate, so a sliding reset is
 *  never published as an instant and no ranking rule can pick one up. Rows that
 *  state neither are still emitted, all-null, because a limit the vendor
 *  reported must stay visible. */
function bucketReport(set, { model = null, family = null, nowSec = null } = {}) {
  const now = num(nowSec) != null ? num(nowSec) : Math.floor(Date.now() / 1000);
  const out = [];
  for (const l of applicableLimits(set, { model, family })) {
    for (const w of windowsOf(l)) {
      out.push({
        limitId: l.limitId, scope: l.scope, label: l.name || l.limitId,
        kind: w.kind, state: w.state, counts: w.state === 'running',
        remaining: windowStatesSpend(w) ? windowRemaining(w, now) : null,
        resetsAt: w.state === 'running' ? (posNum(w.resetsAt) || 0) : 0,
      });
    }
  }
  return out;
}

/** THE BUDGET DEADLINE: the earliest FUTURE reset among the counting BUDGET
 *  windows (weekly and longer). The 5-hour window is a burst RATE limiter that
 *  refills ~33×/week, not a budget — ranking on it degenerates into noise, and
 *  that exclusion is inherited verbatim from `weeklyDeadline`. */
function isBudgetKind(kind) { return kind !== '5h'; }
function deadline(set, { model = null, family = null, nowSec = null } = {}) {
  const now = num(nowSec) != null ? num(nowSec) : Math.floor(Date.now() / 1000);
  let best = null;
  for (const l of applicableLimits(set, { model, family })) {
    for (const w of countingWindows(l)) {
      if (!isBudgetKind(w.kind)) continue;
      const r = posNum(w.resetsAt);
      if (r != null && r > now && (best == null || r < best)) best = r;
    }
  }
  return best;
}

// ── what a reading CLAIMS (r5, the per-limit-provenance finding) ────────────

/** THE CLAIM a window makes: the numbers a producer measured, and nothing
 *  else. Deliberately EXCLUDED are `measuredAt` and `state` — the PROVENANCE
 *  halves (when somebody looked, and the verdict derived from that clock),
 *  which is exactly what this key exists to keep separate from the numbers.
 *
 *  `usedPct` is rounded to 1e-9 because it round-trips through the legacy view
 *  as a 0..1 `utilization` (`usedPct/100` and back), and float noise below that
 *  is not a reading anybody took. */
function windowClaimKey(w) {
  if (!w) return '-';
  const u = num(w.usedPct);
  return [
    w.kind, w.minutes == null ? '' : w.minutes, w.minutesStated ? 1 : 0,
    u == null ? '' : Math.round(u * 1e9) / 1e9,
    posNum(w.resetsAt) || '', str(w.status) || '', w.resetsAtEstimated ? 1 : 0,
  ].join('\u0000');
}

/** THE CLAIM a limit makes: its identity, its flags and every window's claim,
 *  sorted so two spellings of the same reading compare equal. */
function limitClaimKey(limit) {
  if (!limit) return '-';
  const flags = limit.flags && typeof limit.flags === 'object' ? limit.flags : {};
  const flagKey = Object.keys(flags).sort().map((k) => k + '=' + JSON.stringify(flags[k])).join(',');
  const wins = windowsOf(limit).map(windowClaimKey).sort().join('|');
  return [limit.limitId, str(limit.name) || '', limit.scope, str(limit.model) || '', str(limit.family) || '', flagKey, wins].join('\u0001');
}

/** DID THIS LIMIT'S NUMBERS MOVE? Two limits whose claims are equal are the
 *  SAME READING however many times it has been copied forward — which is the
 *  one question a carried-forward legacy snapshot cannot answer about itself.
 *  (The write path's caller: src/usage-cache-write.js.) */
function sameLimitClaim(a, b) { return limitClaimKey(a) === limitClaimKey(b); }

// ── DID THIS READ SEE THE WHOLE SET? (r6, the cross-producer finding) ───────
//
// THE DEFECT r5 SHIPPED. `authoritativeScopes` gives a producer the right to
// RETIRE a limit the file holds and this read did not name — and r5 gated it on
// `u.scopedWeekly?.length`, i.e. on THE LIST BEING NON-EMPTY. That is a fact
// about the array, not about the parse: it says a model cap was seen, never
// that ALL of them were. Three different parsers feed those seven call sites
// and they do not agree with each other on one vendor state (measured, one
// account: plan 20/20 + Fable 10 % + a `seven_day_opus` at 100 % stated with no
// `resets_at`):
//
//   parseCliUsageText     → plan, model:fable, model:opus   (the ⟳ panel rung)
//   parseOAuthUsage       → plan, model:fable               (the bare-token ⟳ + the four host legs)
//   parseGetUsageResponse → plan, model:fable               (the engine's control-channel probe)
//
// So six of the seven sites RETIRED a real, spent model cap on the strength of
// a parse that could never have seen it: `accountRemaining` went 0 → 80 and the
// pool spent on an account whose Opus was gone — inc-msof8i22 re-opened by the
// very mechanism meant to end its mirror image. Reachability is structural, not
// incidental: the control-channel probe is the FIRST rung of the ⟳ route, ahead
// of the panel, so on any account with a live local claude chat session the
// authoritative list always came from a parser that omits reset-less named caps.
//
// COMPLETENESS IS A PROPERTY THE PARSE STATES, NOT ONE THE ARRAY IMPLIES. Each
// producer counts what it DROPPED — an entry it could not name, a bucket-shaped
// field it could not read a number from, a panel line its own regex did not
// match — and only a parse that dropped nothing may claim the scope.
//
// IT IS A FACT ABOUT ONE READ AND MUST NEVER BE STORED. This store's oldest law
// (the established-window incident): a fact only ONE producer may state does
// not belong in the object all the others rewrite. So the mark is a
// NON-ENUMERABLE, SYMBOL-KEYED own property of the parse result:
//   • `JSON.stringify` drops it, a spread drops it, a preserve-merge of a
//     stored file drops it — and every one of those losses means "no
//     authority", which is the safe direction to fail in;
//   • no JSON a vendor, a device or a file could ever hand us can FORGE it,
//     because a symbol is not expressible in JSON. A string field would have
//     been forgeable by the very stored object this rule exists to distrust.
const SCOPED_ENUMERATED = Symbol('scopedComplete');
// HOW MANY of the parse's scoped entries it NAMED AS A MODEL (B-9f4b, the r6
// verifier's second info finding). r6 kept reset-less buckets, so the control
// parse turns an untouched CODENAME sibling key (`nimbus_quill: {utilization:
// 0, resets_at: null}` — the 2026-08-09 LIVE envelope) into a scopedWeekly
// entry; with "the list is non-empty" as the r5 half, a payload whose ONLY
// scoped entry was that codename claimed to have enumerated the model caps and
// retired a real, spent Fable cap. A codename is a bucket the parse INFERRED
// from a key's shape, not a model cap it can name, so it counts for the list
// and never for the right to retire. Same storage law as the mark above: a
// non-enumerable symbol, a fact about ONE read, lost (safely) on any copy.
const SCOPED_NAMED = Symbol('scopedNamed');

/** Mark a parse result as having enumerated its model-scoped set (or not), and
 *  say how many of its scoped entries it NAMED as a model cap — a `limits[]` /
 *  `model_scoped` entry with a display name, a `seven_day_<model>` key, a
 *  `Current week (<model>)` panel line; never a codename key inferred to be a
 *  bucket. An omitted `named` is 0: a parser that does not say claims nothing.
 *  Returns the same object, so a parser can `return markScopedEnumeration({…}, ok, n)`. */
function markScopedEnumeration(parsed, complete, named = 0) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const n = Number(named);
  try {
    Object.defineProperty(parsed, SCOPED_ENUMERATED, { value: !!complete, enumerable: false, configurable: true, writable: true });
    Object.defineProperty(parsed, SCOPED_NAMED, { value: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0, enumerable: false, configurable: true, writable: true });
  } catch { /* frozen object: no claim, which is the safe answer */ }
  return parsed;
}

/** How many model caps did THIS parse name as a model? Unknown ⇒ 0. */
function scopedNamedCount(parsed) {
  const n = parsed && typeof parsed === 'object' ? parsed[SCOPED_NAMED] : 0;
  return typeof n === 'number' && n > 0 ? n : 0;
}

/** Did THIS parse enumerate the model-scoped set? Unknown ⇒ false. */
function scopedEnumeration(parsed) {
  return !!(parsed && typeof parsed === 'object' && parsed[SCOPED_ENUMERATED] === true);
}

/** THE ONE RULE the enumerating call sites ask (`authoritativeScopes`).
 *
 *  Two conditions, and both are load-bearing:
 *   • the parse enumerated (`scopedEnumeration`) — the r6 half;
 *   • it NAMED at least one model cap (`scopedNamedCount`) — the r5 half, kept
 *     deliberately and tightened by B-9f4b. An empty list is indistinguishable
 *     from "my scoped parsing broke", and acting on it would retire every model
 *     cap at the call sites that hand us their read verbatim. Retiring a spent
 *     cap is the money-losing direction (the pool goes on spending against
 *     it), so an empty read keeps stating nothing about the set — and so does
 *     a read whose only entries are CODENAME buckets the parse inferred from a
 *     key's shape (B-9f4b: `nimbus_quill` alone retired a spent Fable cap).
 *     Counting the entries of the ARRAY is the r5 mistake again one level
 *     down: the array says what was kept, only the parse says what it named. */
function authoritativeScopesOf(parsed) {
  if (!scopedEnumeration(parsed)) return null;
  const list = parsed.scopedWeekly;
  return Array.isArray(list) && list.length && scopedNamedCount(parsed) > 0 ? ['model'] : null;
}

// ── merge ───────────────────────────────────────────────────────────────────

/** Merge one window into an existing one: the NEWER measurement wins whole. A
 *  measurement without a `measuredAt` is treated as older than any that has
 *  one, so a shape-only lift of a legacy record can never displace a real read. */
function mergeWindow(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  const a = posNum(prev.measuredAt) || 0, b = posNum(next.measuredAt) || 0;
  return b >= a ? next : prev;
}

/** Flags merge newer-over-older, except the TOMBSTONES, which UNION (the earliest instant per kind is when it
 *  was first said); `settleAbsence` then weighs each against the merged window of its kind. */
function mergedFlags(prev, next) {
  const out = { ...(prev.flags || {}), ...(next.flags || {}) };
  const a = prev.flags && prev.flags.absent, b = next.flags && next.flags.absent;
  if ((a && typeof a === 'object') || (b && typeof b === 'object')) {
    const absent = { ...(a && typeof a === 'object' ? a : {}) };
    for (const [k, v] of Object.entries(b && typeof b === 'object' ? b : {})) {
      const t = posNum(v), was = posNum(absent[k]);
      if (t != null) absent[k] = was != null && was <= t ? was : t;
    }
    out.absent = absent;
  }
  return out;
}

function mergeLimit(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  const windows = [];
  const byKind = new Map();
  for (const w of windowsOf(prev)) { byKind.set(w.kind, w); windows.push(w.kind); }
  for (const w of windowsOf(next)) {
    if (byKind.has(w.kind)) byKind.set(w.kind, mergeWindow(byKind.get(w.kind), w));
    else { byKind.set(w.kind, w); windows.push(w.kind); }
  }
  const newer = (posNum(next.fetchedAt) || 0) >= (posNum(prev.fetchedAt) || 0);
  return settleAbsence({
    limitId: next.limitId || prev.limitId,
    name: next.name != null ? next.name : prev.name,
    scope: newer ? next.scope : prev.scope,
    model: next.model != null ? next.model : prev.model,
    family: next.family != null ? next.family : prev.family,
    windows: windows.map((k) => byKind.get(k)),
    flags: mergedFlags(prev, next),
    // PER-LIMIT PROVENANCE. The set-level `source`/`fetchedAt` answer "who
    // wrote this file last"; these answer "who produced THIS limit's numbers,
    // and when" — the only question a panel showing three limits side by side
    // can actually act on.
    source: newer ? (next.source || prev.source) : (prev.source || next.source),
    fetchedAt: Math.max(posNum(prev.fetchedAt) || 0, posNum(next.fetchedAt) || 0) || null,
  });
}

/** MERGE PER limitId. A producer that carries ONE limit updates ONE limit; the
 *  others are carried forward untouched. This is the whole of the B-9213 fix:
 *  the Spark push and the plan push are different facts about different limits
 *  and neither is news about the other.
 *
 *  Order is stable: prev's limits keep their positions, new limitIds append. */
function mergeLimitSets(prev, next) {
  const p = prev && Array.isArray(prev.limits) ? prev : EMPTY_SET;
  const n = next && Array.isArray(next.limits) ? next : EMPTY_SET;
  const order = [];
  const byId = new Map();
  for (const l of limitsOf(p)) { if (!byId.has(l.limitId)) order.push(l.limitId); byId.set(l.limitId, l); }
  for (const l of limitsOf(n)) {
    if (byId.has(l.limitId)) byId.set(l.limitId, mergeLimit(byId.get(l.limitId), l));
    else { order.push(l.limitId); byId.set(l.limitId, l); }
  }
  // THE ONE NAMED EXCEPTION to "never collapse": the un-named model cap folds
  // into the named lane it turns out to be (same weekly reset) — see
  // `foldPlaceholderCap`. Two NAMED limits still never collapse.
  const limits = foldPlaceholderCap(order.map((id) => settleAbsence(byId.get(id))));
  const fetchedAt = Math.max(posNum(p.fetchedAt) || 0, posNum(n.fetchedAt) || 0) || null;
  // The set-level source names whoever produced the NEWEST limit — never the
  // last writer to touch the file, which is exactly the collapse this replaces.
  let newest = null;
  for (const l of limits) if (l && (newest == null || (posNum(l.fetchedAt) || 0) > (posNum(newest.fetchedAt) || 0))) newest = l;
  const extra = (p.extra || n.extra) ? { ...(p.extra || {}), ...(n.extra || {}) } : null;
  return makeLimitSet({
    identity: n.identity != null ? n.identity : p.identity,
    fetchedAt,
    source: (newest && newest.source) || n.source || p.source,
    limits, extra,
  });
}

// ── THE MODEL-CAP LANE (inc-mubu23bd-5vxi, 2026-09-21) ──────────────────────
// claude 2.1.274's `rate_limit_event` carries `unifiedWindows` — the 5-hour,
// the weekly and, "for accounts whose responses carry that window", the
// `seven_day_overage_included` window, which the binary itself describes as a
// PER-MODEL bucket. Measured on this instance (12 live buffers, both weekly
// windows sharing one reset): seven_day vs seven_day_overage_included =
// 0.15/0.29, 0.11/0.22, 0.13/0.25, 0.26/0.51, 0.42/0.85, 0.37/0.74, 0.43/0.87,
// 0.29/0.59 — always two different numbers, the bucket about twice the plan —
// and the owner's own account read 0.43/0.87 while its verified /usage panel
// said plan 43 %, scoped weekly Fable 86 %. So that window IS the account's
// model-cap weekly lane (`scope:'model'`), never the plan lane; but the record
// names it by ACCOUNTING, not by model — no `seven_day_fable` exists.
//
// THE LANE IS DECIDED BY WHAT NAMES IT (the B-ccaa invariant, now with a
// producer that names every lane). The rungs, in order, each PURE:
//   ① the account's established-window sidecar (`.window-<key>`, api-phase
//     verified) lists its scoped windows BY FAMILY with their reset — a family
//     whose reset is this window's reset names it (`fable` → `model:fable`);
//   ② an existing `scope:'model'` limit on the account with the same weekly
//     reset IS the same lane;
//   ③ several candidates ⇒ the caller's HINT (the session's request-model
//     family: the bucket is per-model and the response is for that request)
//     breaks the tie; a hint that names none of them decides nothing;
//   ④ NOTHING names it ⇒ the placeholder `model:cap` / "Model cap", family
//     null: a scoped limit like any other (it counts for the account-level
//     min, which is the conservative direction), NEVER written into the plan,
//     and folded into the named lane the moment one shows up with the same
//     reset (a panel, a banner) — `foldPlaceholderCap`, run by every merge.
// A rejection that states no reset can only be named through a hint that
// matches one of the account's KNOWN cap families (the vocabulary is the
// account's own; it is not a guess at a family the account never showed).
const MODEL_CAP_PLACEHOLDER = Object.freeze({ limitId: 'model:cap', name: 'Model cap' });

// A WEEKLY WINDOW IS THE SAME WINDOW BY ITS PHASE, NEVER BY THE INSTANT (r2,
// 2026-09-21): a roll adds exactly WEEK_SEC, and from the roll until the next
// verified panel every `.window-` sidecar and every stored cap still carry
// LAST week's reset (the sidecar is written by the verified panel only). An
// absolute compare made the cap un-nameable for that whole stretch — a
// placeholder was written beside the stale named cap and, being un-named, it
// gated EVERY family (an opus session parked on a Fable bucket). This is
// reading-lag's `weeklyNear` rule, spelled here because this module imports
// nothing; test-quota-model ⑲ pins the two byte-for-byte on a table.
const WEEK_SEC = 604800;
function weeklyPhaseNear(a, b, jitterSec = WINDOW_JITTER_SEC) {
  const p = posNum(a), q = posNum(b);
  if (p == null || q == null) return false;
  const d = Math.abs((p % WEEK_SEC) - (q % WEEK_SEC));
  return Math.min(d, WEEK_SEC - d) <= jitterSec;
}

/** The limitId of a model-scoped bucket, from its display name — ONE spelling
 *  (fromLegacy, the harness event builder, the statusline's drop rule and the
 *  naming rule all ask this). The placeholder's name maps to its own id so the
 *  legacy view round-trips. */
function scopedLimitId(name) {
  const n = lower(name).trim();
  if (n === lower(MODEL_CAP_PLACEHOLDER.name)) return MODEL_CAP_PLACEHOLDER.limitId;
  return 'model:' + n.replace(/\s+/g, '-');
}
function isPlaceholderCap(limit) { return !!limit && limit.limitId === MODEL_CAP_PLACEHOLDER.limitId; }
const capitalize = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());

/** Which lane is a model-cap window? `limits` = the account's typed limits,
 *  `scoped` = the sidecar's `{family: resetsAt}` map, `resetsAt` = the
 *  window's own reset (unix s), `hint` = the requesting session's family or
 *  null. Returns `{limitId, name, family, named, why}` — `named:false` is the
 *  placeholder, and `why` says which rung decided. */
function nameModelCapLane({ limits = [], scoped = null, resetsAt = null, hint = null, jitterSec = WINDOW_JITTER_SEC } = {}) {
  const r = posNum(resetsAt);
  const near = (a) => r != null && weeklyPhaseNear(a, r, jitterSec); // the PHASE: a rolled week is the same lane
  const cands = new Map(); // limitId → {limitId, name, family, via}
  const add = (c) => { if (c && c.limitId && !cands.has(c.limitId)) cands.set(c.limitId, c); };
  const known = new Map(); // every cap family/name the account has ever shown, reset or not
  for (const [fam, at] of Object.entries(scoped && typeof scoped === 'object' ? scoped : {})) {
    const f = lower(fam); if (!f) continue;
    const c = { limitId: 'model:' + f.replace(/\s+/g, '-'), name: capitalize(f), family: f, via: 'sidecar' };
    known.set(f, c);
    if (near(at)) add(c);
  }
  for (const l of Array.isArray(limits) ? limits : []) {
    if (!l || l.scope !== 'model' || isPlaceholderCap(l)) continue;
    const fam = lower(l.family) || lower(l.name) || null;
    const c = { limitId: l.limitId, name: l.name || l.limitId, family: l.family || null, via: 'limit' };
    if (fam && !known.has(fam)) known.set(fam, c);
    const w = windowOfKind(l, '7d') || windowsOf(l).find((x) => x && isBudgetKind(x.kind)) || null;
    if (w && near(w.resetsAt)) add(c);
  }
  const h = lower(hint) || null;
  const pick = (c, why) => ({ limitId: c.limitId, name: c.name, family: c.family, named: true, why });
  if (cands.size === 1) { const c = [...cands.values()][0]; return pick(c, `the ${c.via === 'sidecar' ? 'established window' : 'existing model limit'} ${c.name} shares this window's reset`); }
  if (cands.size > 1) {
    const byHint = h ? [...cands.values()].find((c) => lower(c.family) === h || lower(c.name) === h) : null;
    if (byHint) return pick(byHint, `${cands.size} model caps share this reset; the session requests ${byHint.name}`);
    return { ...MODEL_CAP_PLACEHOLDER, family: null, named: false, why: `${cands.size} model caps share this reset and no request model breaks the tie` };
  }
  if (r == null && h && known.has(h)) { const c = known.get(h); return pick(c, `no reset stated; the session requests ${c.name}, a cap this account has shown`); }
  return { ...MODEL_CAP_PLACEHOLDER, family: null, named: false, why: r == null ? 'no reset stated and nothing names the lane' : 'nothing on this account names a model cap with this reset' };
}

/** Fold the un-named cap into the NAMED model limit that shares its weekly
 *  reset — the only collapse this model permits, because `model:cap` is not a
 *  second limit but the same lane before anybody named it. The window merge is
 *  `mergeWindow` (the newer measurement wins); the placeholder is dropped.
 *  A placeholder that states no reset, or that matches no named lane, is left
 *  exactly where it is (a later panel enumerates and retires it). */
function foldPlaceholderCap(limits, { jitterSec = WINDOW_JITTER_SEC } = {}) {
  const list = Array.isArray(limits) ? limits : [];
  const ph = list.find(isPlaceholderCap);
  if (!ph) return list;
  const phW = windowOfKind(ph, '7d') || windowsOf(ph).find((x) => x && isBudgetKind(x.kind)) || null;
  const r = phW ? posNum(phW.resetsAt) : null;
  if (r == null) return list;
  const named = list.filter((l) => l && l.scope === 'model' && !isPlaceholderCap(l)).filter((l) => {
    const w = windowOfKind(l, '7d') || windowsOf(l).find((x) => x && isBudgetKind(x.kind)) || null;
    return w && weeklyPhaseNear(w.resetsAt, r, jitterSec); // the PHASE, so a placeholder written after a roll folds into last week's named cap
  });
  if (named.length !== 1) return list; // none, or ambiguous: the placeholder stays honest
  const target = named[0];
  const folded = mergeLimit(target, { ...ph, limitId: target.limitId, name: target.name, model: target.model, family: target.family, scope: 'model' });
  return list.filter((l) => l !== ph).map((l) => (l === target ? folded : l));
}

// ── panels: ordering + labels ───────────────────────────────────────────────

/** The order a panel shows limits in: the one governing the served model
 *  first, then the plan, then the rest by id — so the number the user is about
 *  to spend against is the one they read first. */
function orderLimits(set, { model = null, family = null } = {}) {
  const governing = limitFor(set, { model, family });
  const plan = planLimit(set);
  const rest = limitsOf(set).filter((l) => l !== governing && l !== plan);
  // QUOTA rows before MONEY rows: credits and overage are a different question
  // (dollars, not headroom) and a panel that interleaves them makes the user
  // read past them to find the number they came for.
  const moneyish = (l) => (l.scope === 'credits' || l.scope === 'overage') ? 1 : 0;
  rest.sort((a, b) => moneyish(a) - moneyish(b) || String(a.limitId).localeCompare(String(b.limitId)));
  return [governing, plan, ...rest].filter((l, i, arr) => l && arr.indexOf(l) === i);
}

/** A limit's display label WITHOUT i18n (the caller translates): the vendor's
 *  own name when it gave one, else the limit id. Never a fabricated pretty
 *  name — "GPT-5.3-Codex-Spark" is what the vendor calls it and what the user
 *  will see in the vendor's own UI. */
function limitLabel(limit) { return (limit && (limit.name || limit.limitId)) || ''; }

/** A limit's own headline state for a panel row, in ONE word each consumer
 *  translates: 'empty' (no window has started — "starts on first use"),
 *  'unknown' (nothing was stated), or 'running'. */
function limitState(limit) {
  const ws = windowsOf(limit);
  if (!ws.length) return 'unknown';
  if (ws.some((w) => w.state === 'running')) return 'running';
  if (ws.some((w) => w.state === 'empty')) return 'empty';
  return 'unknown';
}

// ── legacy view (both directions) ───────────────────────────────────────────
//
// THE LEGACY SNAPSHOT IS NOW A DERIVED VIEW. It is written BESIDE `limits` so
// every reader that has not migrated keeps working — but it is PROJECTED from
// the merged set, never computed by the producer, which is why a Spark push no
// longer flips a legacy reader's 5 % to 0 %: the projection always picks the
// plan limit's windows.

/** WHICH limit's windows the legacy `fiveHour`/`sevenDay` pair shows.
 *
 *  The plan limit, and normally that is the end of it. But an account can hold
 *  NO plan limit at all, and that is not a hypothetical: measured on this
 *  instance while writing this, `usage-cache/__global_codex__.json` held the
 *  `GPT-5.3-Codex-Spark` model limit and a `credits` limit and NOTHING ELSE —
 *  the plan limit had been overwritten away by B-9213 before the typed model
 *  existed to stop it. Projecting "the plan limit" there yields nothing, and a
 *  view that yields nothing DELETES the only numbers the file had (the write
 *  path clears a legacy bucket the view does not carry, so that a stale bucket
 *  can never outlive the model). The migration measurement caught exactly that:
 *  two real buckets on that file went to `undefined`, which every unmigrated
 *  reader — the pool, the panels, auto-resume — reads as "no reading".
 *
 *  So the fallback is the freshest limit that actually reports a plan-shaped
 *  window. That is not a guess: it is precisely what a legacy reader saw on
 *  that file BEFORE this change, because last-writer-wins is how the buckets
 *  got there. The typed `limits` beside it still say whose they are, so a
 *  migrated reader is never fooled — and the moment a real plan push arrives,
 *  the per-limit merge restores the plan limit and this fallback stops being
 *  used. NEVER invent: with no window-bearing limit at all this answers null
 *  and the view stays empty, which is the honest shape for a file that states
 *  no reading. */
function legacyWindowLimit(set) {
  const plan = planLimit(set);
  if (plan && windowsOf(plan).length) return plan;
  const bearing = limitsOf(set).filter((l) => l && (windowOfKind(l, '5h') || windowOfKind(l, '7d')));
  if (!bearing.length) return plan;
  return bearing.slice().sort((a, b) => (b.fetchedAt || 0) - (a.fetchedAt || 0))[0];
}

/** typed set → the historical `{fiveHour, sevenDay, scopedWeekly, …}` shape. */
function toLegacyView(set, { nowSec = null } = {}) {
  const out = {};
  // The projection has to rank the 5-hour windows, and "which one binds" is a
  // question about NOW (a reset that has passed makes its window full again).
  // Same default as `remaining()`/`deadline()` so the three cannot disagree.
  const now = num(nowSec) != null ? num(nowSec) : Math.floor(Date.now() / 1000);
  const plan = legacyWindowLimit(set);
  const toBucket = (w) => {
    if (!w) return null;
    // A WINDOW WITH NO STATED SPEND PROJECTS NO `utilization` (r4). Writing 0
    // here fabricates the claim "the vendor says nothing has been spent" out of
    // "the vendor said nothing" — the P6 line this module is built on — and the
    // legacy readers cannot tell the two apart, because `utilization` is the
    // only field they have. Reproduced by ⑯e's own positive control: a producer
    // that stated only a reset came back off disk as `{utilization: 0}`, so the
    // pool read 100 % free and KNOWN while the typed accessor beside it
    // correctly answered "no claim" — the view MORE optimistic than the set,
    // which is exactly what ⑯c exists to prevent (and could not see, because
    // its property compared two KNOWN answers). The bucket is still emitted so
    // a limit the vendor reported never disappears from a panel.
    const b = {};
    if (w.usedPct != null) b.utilization = Math.max(0, Math.min(1, w.usedPct / 100));
    // `usedPercent` + `windowMinutes` are the CODEX spelling; a claude bucket
    // has only `utilization`, and adding the other two changes what the file
    // looks like to every shape-detecting reader. Re-emit what was stated.
    if (w.minutesStated) {
      if (w.usedPct != null) b.usedPercent = w.usedPct;
      if (w.minutes) b.windowMinutes = w.minutes;
    }
    if (w.resetsAt) b.resetsAt = w.resetsAt;
    if (w.status) b.status = w.status;
    if (w.resetsAtEstimated) b.resetsAtEstimated = true;
    // THE STATE RIDES THE LEGACY BUCKET (B-8b12). An 'empty' window is not a
    // constraint and not a deadline, and the readers that must not count it
    // (remaining/deadline/the window fingerprint/auto-resume's arm) key on
    // exactly this field. Emitting the bucket ANYWAY is deliberate: the panel
    // must still show the limit and say "starts on first use" — hiding a
    // vendor-reported limit would be a second kind of lie.
    if (w.state && w.state !== 'running') b.state = w.state;
    return b;
  };
  // THE VIEW MAY NEVER BE MORE OPTIMISTIC THAN THE SET IT PROJECTS (r3).
  //
  // `scopedWeekly` gives a model limit's BUDGET window a home, and the plan
  // limit's own windows have theirs — but a model limit's FIVE-HOUR window had
  // none at all, because `isBudgetKind` excludes '5h' from the scoped
  // projection and `fiveHour` was read off the plan limit alone. So a model cap
  // 90 % through its burst window simply vanished from the derived view, and
  // `account-pool-auto` reads the VIEW, not the accessor: measured on the two
  // real codex push shapes from this instance's buffers (plan 7d 33 %,
  // `codex_bengalfox`/"GPT-5.3-Codex-Spark" 5h 90 % + 7d 10 %), the accessor
  // answered 10 % remaining and the pool answered 67 % — a 57-point drift at
  // the exact seam B-9213 is about, and a REGRESSION: the base commit's
  // last-writer-wins collapse happened to keep the Spark 5h and answered 10 %.
  //
  // `fiveHour` therefore means what every reader has always used it for — THE
  // BINDING BURST CONSTRAINT ON THIS ACCOUNT — i.e. the min over every counting
  // 5-hour window in the set. One rule, no backend branch: claude's model caps
  // are weekly-only, so this can only ever pick the plan window there, and the
  // codex case is the one that has more than one. Windows that make no claim
  // are not candidates (an empty or unknown window cannot be "the binding
  // constraint"), and with no counting 5h window anywhere the plan's own bucket
  // is still emitted verbatim — the panel must keep seeing a limit the vendor
  // reported, marked with its state.
  //
  // RANKED BY REMAINING, NOT BY `usedPct` — AND THAT NEEDS THE CLOCK. A window
  // whose reset has PASSED rolled over since we read it, so its stale
  // utilization means nothing and it is FULL: that is `windowRemaining`'s rule
  // and `bucketRemaining` (the pool's) applies it to whatever bucket we emit.
  // Ranking on the raw percentage therefore let a 90 %-spent-but-rolled-over
  // model window DISPLACE a plan window with a real 50 % left, and the view
  // came out MORE optimistic than the set — the exact defect this projection
  // exists to prevent, in the fix for it (found by driving the property with a
  // passed reset; measured accessor 50 % vs pool 90 %). `nowSec` is the same
  // clock `remaining()`/`deadline()` take, so the invariant holds by
  // construction rather than by a second, weaker ordering.
  // THE PLAN WINDOW IS SEEDED FIRST AND WINS EVERY TIE. This field has always
  // meant the plan limit's burst window; another limit takes the slot only when
  // it is STRICTLY more constrained, which is the whole and only claim being
  // made here. (Ranking without the seed made ties fall to iteration order —
  // and every window of a set read long after it was measured ties at 100, so
  // a Spark bucket displaced the plan limit again: §⑭'s invariant, undone by
  // the fix for §⑯c.)
  const planW5 = windowOfKind(plan, '5h');
  const rank = (w) => (w && w.state === 'running' ? windowRemaining(w, now) : null);
  let bind5 = null, bindRem = null;
  const consider = (w) => {
    const r = rank(w);
    if (r == null) return;
    if (bindRem == null || r < bindRem) { bind5 = w; bindRem = r; }
  };
  consider(planW5);
  for (const l of limitsOf(set)) {
    if (!l || l === plan) continue;
    consider(windowOfKind(l, '5h'));
  }
  const f5 = toBucket(bind5 || planW5);
  const f7 = toBucket(windowOfKind(plan, '7d'));
  if (f5) out.fiveHour = f5;
  // «NO 5h LIMIT» RIDES THE VIEW (lane no-5h-window): every legacy reader reads `fiveHour`, and an absent key
  // alone cannot tell «the vendor removed it» from «nobody measured it yet». Only when no 5h window is projected.
  else if (absentSince(plan, '5h')) out.fiveHourAbsent = absentSince(plan, '5h');
  if (f7) out.sevenDay = f7;
  const scoped = [];
  for (const l of limitsOf(set)) {
    if (!l || l.scope !== 'model') continue;
    const w = windowOfKind(l, '7d') || windowsOf(l).find((x) => isBudgetKind(x.kind)) || null;
    if (!w) continue;
    // ONE VENDOR LIMIT IS ONE ROW (B-9f4b, the r6 verifier on this instance's
    // own `__global_codex__.json`: the Spark model limit + credits, NO plan
    // limit). `legacyWindowLimit` promotes the freshest window-bearing limit
    // into the plan slot, so its '7d' window already IS `sevenDay` above —
    // projecting it here too rendered one limit as two panel rows. Skipped only
    // when this row's window is that very `sevenDay` window: a promoted limit
    // whose budget window lives nowhere else keeps its row (the view never
    // drops a window it projects nowhere else), and with a real plan limit the
    // promoted limit IS the plan, which never reaches this loop. The pool loses
    // nothing: the row was a MIN over the identical numbers `sevenDay` carries.
    if (l === plan && w === windowOfKind(plan, '7d')) continue;
    // Same rule as `toBucket`: a scoped window with no stated spend carries no
    // `utilization` rather than a fabricated 0.
    const e = { name: l.name || l.limitId };
    if (w.usedPct != null) e.utilization = Math.max(0, Math.min(1, w.usedPct / 100));
    if (w.resetsAt) e.resetsAt = w.resetsAt;
    if (w.status) e.status = w.status;
    if (w.resetsAtEstimated) e.resetsAtEstimated = true;
    if (w.state && w.state !== 'running') e.state = w.state;
    if (l.flags && l.flags.severity) e.severity = l.flags.severity;
    if (l.flags && l.flags.asOf) e.asOf = l.flags.asOf;
    scoped.push(e);
  }
  if (scoped.length) out.scopedWeekly = scoped;
  const over = limitsOf(set).find((l) => l && l.scope === 'overage');
  if (over && over.flags && Object.keys(over.flags).length) out.overage = { ...over.flags };
  // THE STORED RESET-CREDIT COUNT (design-reset-credits r2, reproduced): it
  // rides ONLY a harness's on-demand read (codex account/rateLimits/read), and
  // the set's `extra` keeps it across the passive pushes that do not state it —
  // but the view dropped it, so the Manage Agents roster's reset chip (and its
  // Use… button, which read the projected map) vanished after the next passive
  // push on every turn. The view carries it WHEN THE SET HOLDS ONE; a set that
  // never read a count projects nothing (no fabricated zero).
  const rc = set && set.extra && set.extra.resetCredits;
  if (rc && typeof rc === 'object' && Number.isFinite(Number(rc.availableCount))) out.resetCredits = { ...rc, availableCount: Number(rc.availableCount) };
  if (set && set.fetchedAt) out.fetchedAt = set.fetchedAt;
  if (set && set.source) out.source = set.source;
  return out;
}

/** the historical shape → a typed set (the migration, and the read side of the
 *  write path: a cache file written before this model existed still has to
 *  merge). `kind` mapping is fixed: `fiveHour`→'5h', `sevenDay`→'7d', each
 *  `scopedWeekly[]` entry → its own model-scoped limit with a '7d' window.
 *
 *  `familyOf` is INJECTED (this module imports nothing): callers that know the
 *  family vocabulary pass `src/model-family.js`'s `familyOfScopedBucket`. */
function fromLegacy(legacy, { identity = null, source = null, fetchedAt = null, limitId = 'plan', familyOf = null, extraKeys = null } = {}) {
  const src = legacy && typeof legacy === 'object' ? legacy : {};
  const at = posNum(fetchedAt) || posNum(src.fetchedAt) || null;
  const srcName = str(source) || str(src.source);
  const limits = [];
  const planWindows = [];
  const bucket = (b, kind) => {
    if (!b || typeof b !== 'object') return null;
    // `utilization` FIRST. Both spellings appear on a codex bucket and they are
    // written together, but a producer that marks a bucket DEAD in place sets
    // only `utilization` (the wall/limit-banner mark does exactly that) — so
    // preferring `usedPercent` reads back the stale number the mark replaced.
    const usedPct = num(b.utilization) != null ? Math.max(0, Math.min(1, num(b.utilization))) * 100
      : num(b.usedPercent);
    const w = makeWindow({ kind, minutes: b.windowMinutes, usedPct, resetsAt: b.resetsAt, measuredAt: at, status: b.status });
    if (b.resetsAtEstimated) w.resetsAtEstimated = true;
    // A STORED STATE OUTRANKS A RE-DERIVED ONE — BUT ONLY WHILE THE READING IT
    // DESCRIBES IS UNCHANGED (r3).
    //
    // Why the stamp is trusted at all: `windowState` needs the instant the
    // vendor answered, and a legacy bucket read back off disk usually has only
    // the FILE's `fetchedAt` — a different (later) clock the moment a
    // preserve-merge carried the bucket forward. Re-deriving 'empty' from that
    // borrowed clock computes `elapsed = fetchedAt − measuredAt > jitter` and
    // silently flips a settled verdict to 'running', which is B-8b12 itself: a
    // sliding reset becomes an EDF deadline and an auto-resume arm time.
    //
    // Why it may not be trusted unconditionally: the stamp is a VERDICT ABOUT A
    // READING, and it lives on the bucket object that every producer spreads
    // forward (`{...(cache[kind] || {})}` in rate-limit-capture, `bump()` in
    // markLimitBanner). So a producer that re-measured the bucket carried the
    // OLD verdict onto the NEW numbers. Measured: a 5h bucket stamped 'unknown'
    // while it had no reset kept that stamp through a fully dated 95 % reading
    // (pool read 80 % free instead of 5 %); a 7d + scoped pair stamped 'empty'
    // at the weekly roll kept it while three real events climbed them to 90 %
    // and 100 % (pool read 90 % free instead of 0, `weeklyDeadline` null, and
    // `bucketRems` listed only the 5h row) — inc-msof8i22 / 2.305.0 re-opened.
    //
    // A STATED SPEND VOIDS THE STAMP, and that needs no clock: 'empty' means
    // NOTHING HAS BEEN SPENT, so `usedPct > 0` refutes it outright and the
    // re-derivation returns 'running' from the spend alone. This is the belt
    // that does not depend on having enumerated the producers; the producers
    // also drop what they may not re-state (see rate-limit-capture's `applyTo`
    // and usage-pool-engine's `bump`), which is the half that also covers a
    // re-measurement DOWN to 0 %.
    if (STATES.includes(b.state) && !(usedPct > 0)) w.state = b.state;
    return w;
  };
  const w5 = bucket(src.fiveHour, '5h'); if (w5) planWindows.push(w5);
  const w7 = bucket(src.sevenDay, '7d'); if (w7) planWindows.push(w7);
  // THE VIEW'S TOMBSTONE COMES BACK DATED (lane no-5h-window): a producer that spreads a file forward (the shipped
  // statusline, the event capture's base) carries `fiveHourAbsent` with the instant it was first said, so it can
  // never outrank a 5h window measured after it — `settleAbsence` weighs the two.
  const ab5 = posNum(src.fiveHourAbsent);
  if (planWindows.length || ab5) limits.push(settleAbsence(makeLimit({ limitId, scope: 'plan', windows: planWindows, flags: ab5 ? { absent: { '5h': ab5 } } : null, source: srcName, fetchedAt: at })));
  for (const s of Array.isArray(src.scopedWeekly) ? src.scopedWeekly : []) {
    if (!s || !s.name) continue;
    const w = bucket(s, '7d');
    if (!w) continue;
    const flags = {};
    if (s.severity) flags.severity = s.severity;
    if (s.asOf) flags.asOf = s.asOf;
    const placeholder = scopedLimitId(s.name) === MODEL_CAP_PLACEHOLDER.limitId;
    limits.push(makeLimit({
      limitId: scopedLimitId(s.name),
      name: String(s.name), scope: 'model', model: placeholder ? null : String(s.name),
      family: placeholder ? null : (familyOf ? familyOf(s.name) : null),
      windows: [w], flags, source: srcName, fetchedAt: posNum(s.asOf) || at,
    }));
  }
  if (src.overage && typeof src.overage === 'object') {
    limits.push(makeLimit({ limitId: 'overage', scope: 'overage', windows: [], flags: { ...src.overage }, source: srcName, fetchedAt: posNum(src.overage.asOf) || at }));
  }
  const extra = {};
  for (const k of Array.isArray(extraKeys) ? extraKeys : []) if (src[k] !== undefined) extra[k] = src[k];
  return makeLimitSet({ identity, fetchedAt: at, source: srcName, limits, extra: Object.keys(extra).length ? extra : null });
}


// ── THE WALL'S OWN ATTRIBUTION (inc-mttbrtc0-6049, 2026-09-08 23:47Z) ────────
// A REJECTION IS A READING, and until now it was the only one nobody asked
// "whose numbers are these". Measured on this instance's anchor streams, the
// incident reads like this (identities anonymised, times UTC):
//
//   ident-604088  23:43  on-demand         5h u=0.91  resets 00:19   ← its own
//                 23:46  rate-limit-event  5h u=1     resets 00:20   ← its own
//                 23:48  WALL              5h u=1     resets 03:30   ← FOREIGN
//                 23:53  on-demand         5h u=1     resets 00:20   ← restored
//   ident-e65fd1  23:42  on-demand         5h u=0.84  resets 03:30   ← ITS own
//                 23:47  rate-limit-event  5h u=0.84  resets 03:30
//
// The pool re-pointed that session's credential link twice inside ONE turn
// (23:44:48, 23:46:00, 23:46:36 — all three rows are in slot-transitions.jsonl,
// per session, with timestamps). The CLI re-read the credentials (2.1.257's
// mtime-gated `rpe()`) and its NEXT request — made with the member we had just
// moved TO — was rejected. `rejectionSlotFor` answers with the TURN PIN, i.e.
// the member the turn STARTED on, so the wall was written onto ident-604088:
// its panel read "resets 8:30pm" until the owner refreshed by hand, and it was
// demoted for three hours on another member's wall (a usable member excluded —
// this is money, not cosmetics).
//
// WHY THE EXISTING GUARD COULD NOT CATCH IT. `guardReadingTarget` (reading-lag
// rule ②) judges by the WEEKLY window only — 2.369.73 r2 measured that a
// five-hour reset names a TIME and not an ACCOUNT (47 distinct 5h resets shared
// across identities because they snap to the clock). That refutation stands and
// this rule does not touch it: the 5h window is still never asked WHO.
//
// WHAT IS SOUND, AND IS ALL THIS RULE CLAIMS. A window that is RUNNING cannot
// change its reset before it ends. So a stated reset that contradicts the
// target's own still-future window REFUTES that target — it does not identify
// anybody. Refutation needs no uniqueness, which is exactly why the r2
// measurement does not bite here.
//
// BUT NOT EVERY WINDOW REFUTES EQUALLY WELL, AND THE DIFFERENCE IS MEASURED
// (r2, the round-1 verifier's second finding — round 1 asserted the residue was
// small and cited a number measured on a DIFFERENT quantity: the drift between
// two CONSECUTIVE readings seconds apart, not the drift between a reading and
// its account's own on-demand stamp, which is what this rule actually compares
// and which can be hours old). Re-measured with the predicate the rule uses,
// over every claude anchor stream on this instance (7798 rows, the empty-window
// fence already applied, each account judged against its OWN last `on-demand`
// stamp — the only producer that writes the `.window-` sidecar):
//
//                       judged   refuted   of the refuted: states ANOTHER
//                                          account's own window at that instant
//   7d   own producer     4109      0        —
//        session prod.    1160      0        —
//   scoped own producer   4029      0        —
//        session prod.     700      0        —
//   5h   own producer     1706     13 0.76%  —
//        session prod.    1055    137 12.99%  101 = 73.72 %
//
// Read that table carefully, because it says two different things:
//
//  · A WEEKLY window (7d and every model-scoped bucket) never once contradicted
//    its own account, in 9998 judged readings across seven identities and a
//    month. It is a DECISIVE refuter, which is the same conclusion 2.369.73 r2
//    reached from the other direction when it made the weekly phase the only
//    identity evidence.
//  · A FIVE-HOUR window is EVIDENCE, not proof. Three quarters of the readings
//    it refutes state another account's own window at that very instant — those
//    are true positives, mis-filings of exactly the kind this rule exists to
//    catch — but a residue remains, and the honest bound on it is the OWN
//    PRODUCER row: 13 readings where an account's own `/usage` panel, which
//    cannot be mis-filed (its key and its credential dir are one decision),
//    stated a 5h reset its own previous stamp contradicts. Inspected, all 13 are
//    one account alternating A-B-A-B between two resets 90 minutes apart at a
//    constant 0.89 utilization — which is not "a window moved" but B-9213 in the
//    plan bucket: more than one limit collapsed into one field. Until that is
//    modelled per limit end to end we do not get to call the residue zero.
//
// THEREFORE, REFUTATION HAS A STRENGTH, AND IT IS THE WINDOW KIND'S (see
// `refutationStrength`). A weekly refutation may REFUSE the write on its own. A
// five-hour refutation may only CORROBORATE an identification the ledger made
// independently; on its own it leaves the pin exactly where it was and SAYS so.
// The asymmetry is the point: refusing a wall is not free either — an
// exhaustion mark that never lands means the pool keeps sending turns to a
// member the CLI has just refused, which is the same money in the other
// direction, and it is what `guardReadingTarget` warned about when it exempted
// walls in the first place. A 13 % false-refusal rate on 5h walls would have
// bought the panel fix with a new leak.
//
// THEREFORE: TWO INDEPENDENT WITNESSES. The identification comes from the
// LEDGER — `slotAt(sessionKeys, signal.at)`, our own first-class record of
// which member held that link at the instant the rejection arrived — and the
// window is only allowed to CORROBORATE it. Both must agree before a byte
// moves; either one silent leaves the turn pin exactly where it is. In the
// incident they agree unambiguously, from two unrelated stores.
//
// A WALL MAY NEVER OVERWRITE A MEMBER'S OWN ESTABLISHED WINDOW: when this rule
// says 'archive' the write does not happen at all, and no path here stamps a
// window sidecar (only the on-demand panel does, and that is deliberate —
// 2.369.73 r2 moved the established window OUT of the object every producer
// rewrites for precisely this reason).

/** Does an account's OWN established window REFUTE a stated reset?
 *
 *  TRUE only when all four hold, and each is load-bearing:
 *   · we have the account's own reset for that kind (no evidence ⇒ no refusal);
 *   · that window had NOT ended when the reading was taken — this is the whole
 *     physical claim ("a running window's reset cannot move"), and it is why
 *     `atSec` is the READING's clock and never `Date.now()`;
 *   · the reading STATES a reset (a guess is not a statement — see above);
 *   · they differ by more than the panel-vs-event wobble.
 *  Anything else is `false` = "this window has nothing to say", never a verdict. */
function windowRefutes(ownResetsAt, statedResetsAt, { atSec = null, jitterSec = WINDOW_JITTER_SEC } = {}) {
  const own = posNum(ownResetsAt);
  const stated = posNum(statedResetsAt);
  const at = posNum(atSec);
  if (own == null || stated == null || at == null) return false;
  if (own <= at) return false;                       // it had already ended: it may legitimately have moved
  return Math.abs(own - stated) > jitterSec;
}

/** HOW MUCH IS A REFUTATION BY THIS WINDOW WORTH? (r2, measured — the table is
 *  in the essay above.) Deliberately a FUNCTION OF THE WINDOW KIND and nothing
 *  else, so the answer cannot vary with the caller's mood:
 *
 *   'decisive'      — a WEEKLY window (7d, and every model-scoped bucket, which
 *                     is weekly by construction). 0 contradictions in 9998
 *                     judged readings on this instance's whole corpus. It may
 *                     REFUSE a write on its own.
 *   'corroborating' — the FIVE-HOUR window. 73.72 % of the readings it refutes
 *                     state another account's own window at that instant (true
 *                     positives), but its own account's own panel contradicted
 *                     itself 13 times in 1706 readings. It may confirm an
 *                     identification the LEDGER made independently; it may
 *                     never, alone, refuse a wall.
 *   'none'          — a kind we have measured nothing about. Unknown is not a
 *                     licence: no evidence, no refusal (P6).
 *
 *  A NEW KIND LANDS IN 'none' BY DEFAULT, on purpose. The next backend's bucket
 *  must earn 'decisive' with its own measurement, not inherit one taken on
 *  claude's weekly window. */
function refutationStrength(kind) {
  const k = lower(kind);
  if (k === 'sevenday' || k === '7d' || k === 'scoped' || k === 'weekly') return 'decisive';
  if (k === 'fivehour' || k === '5h') return 'corroborating';
  return 'none';
}

/** WHERE DOES THIS WALL BELONG? PURE, and deliberately conservative: it can
 *  only ever return the pin, one specific other member, or "write nowhere".
 *
 * @param {string} kind                 the BUCKET this rejection named
 *        ('fiveHour' | 'sevenDay' | 'scoped'). It selects how much the window's
 *        refutation is worth — see `refutationStrength`. An unmeasured kind
 *        refutes nothing at all.
 * @param {number|null} statedResetsAt  the reset the REJECTION stated (seconds).
 *        null/0 = the producer had none (the limit banner states no time —
 *        `parseLimitBanner` returns `{kind}` only) ⇒ no window evidence exists
 *        and the pin stands, which is today's behaviour for that producer.
 * @param {string} pinnedKey            `rejectionSlotFor` — the turn pin.
 * @param {string|null} ledgerKey       `slotAt(keys, signal.at)` — who held the
 *        link when the rejection ARRIVED. null = the ledger cannot say.
 * @param {boolean} ledgerIsSessionScoped  a default-only ledger hit is NOT an
 *        answer about THIS conversation (the r3 `ownLinkUnknown` rule).
 * @param {number|null} pinnedOwnResetsAt  the pin's own established window.
 * @param {number|null} ledgerOwnResetsAt  the candidate's own established window.
 * @param {number} atSec                when the rejection arrived (seconds).
 * @returns {{action:'write'|'refile'|'archive', key:string|null, reason:string}}
 */
function wallAttribution({
  kind = null, statedResetsAt = null, pinnedKey = null, ledgerKey = null, ledgerIsSessionScoped = false,
  pinnedOwnResetsAt = null, ledgerOwnResetsAt = null, atSec = null, jitterSec = WINDOW_JITTER_SEC,
} = {}) {
  const pin = str(pinnedKey) || null;
  if (!pin) return { action: 'archive', key: null, reason: 'no pinned target' };
  const stated = posNum(statedResetsAt);
  if (stated == null) return { action: 'write', key: pin, reason: 'the rejection states no reset — no window evidence' };
  const strength = refutationStrength(kind);
  if (strength === 'none') {
    return { action: 'write', key: pin, reason: `nothing is measured about a '${str(kind) || 'null'}' window's stability, so it refutes nothing (no evidence, no refusal)` };
  }
  if (!windowRefutes(pinnedOwnResetsAt, stated, { atSec, jitterSec })) {
    return { action: 'write', key: pin, reason: 'the pinned member\'s own window does not contradict this reset' };
  }
  // The pin is REFUTED. Identification is the ledger's job, never this window's.
  const led = str(ledgerKey) || null;
  const identified = !!led && ledgerIsSessionScoped && led !== pin;
  if (identified) {
    if (windowRefutes(ledgerOwnResetsAt, stated, { atSec, jitterSec })) {
      return { action: 'archive', key: null, reason: `this reset (${stated}) contradicts BOTH the pinned member's and the ledger's candidate's own windows` };
    }
    return { action: 'refile', key: led, reason: `the link moved to this member at ${atSec}s and its own window does not contradict the stated reset (${stated})` };
  }
  // NOBODY ELSE IS IDENTIFIED. What happens now is the whole point of measuring
  // the window kinds separately (r2): a refusal is not the free, conservative
  // option it looks like — a wall that never lands leaves the pool sending
  // turns to a member the CLI has just refused.
  if (strength === 'decisive') {
    return {
      action: 'archive', key: null,
      reason: led === pin
        // Both witnesses spoke and they contradict each other: one of them is
        // wrong and we cannot tell which. Refuse — the harm this rule exists to
        // stop is writing a foreign window onto a member, and doing nothing
        // never does that.
        ? `this reset (${stated}) contradicts the member's own unexpired window (${posNum(pinnedOwnResetsAt)}) but the ledger names that same member`
        : `this reset (${stated}) contradicts the pinned member's own unexpired window (${posNum(pinnedOwnResetsAt)}), and the slot ledger cannot say who held the link`,
    };
  }
  return {
    action: 'write', key: pin, disagrees: true,
    reason: `this reset (${stated}) contradicts the pinned member's own unexpired window (${posNum(pinnedOwnResetsAt)}), but a five-hour reset is only corroborating evidence (measured: its own account's panel contradicts itself too) and nothing else is identified — the pin stands`,
  };
}

module.exports = {
  // constants
  WINDOW_MINUTES, EMPTY_WINDOW_JITTER_SEC, WINDOW_JITTER_SEC, RESET_GRACE_SEC, nowSecOf, resetLanded, SCOPES, STATES, EMPTY_SET,
  // builders
  makeWindow, makeLimit, makeLimitSet,
  // validator
  validateLimitSet,
  // windows
  windowState, windowRemaining, minutesOf,
  // the display verdict + the proving spawn's question (lane reset-unproven)
  windowDisplay, memberProofState,
  // accessors
  limitsOf, windowsOf, windowOfKind, planLimit, limitFor, applicableLimits, limitNamesModel,
  remaining, deadline, bucketReport, countingWindows, isBudgetKind, bucketCounts,
  windowStatesSpend, bucketStatesSpend, spendingWindows,
  // merge
  mergeLimitSets, mergeLimit, mergeWindow,
  // the model-cap lane: named by what names it, else the placeholder that folds later (inc-mubu23bd-5vxi)
  MODEL_CAP_PLACEHOLDER, scopedLimitId, isPlaceholderCap, nameModelCapLane, foldPlaceholderCap, weeklyPhaseNear, WEEK_SEC,
  // "did these numbers move?" — the write path's carried-forward rule
  windowClaimKey, limitClaimKey, sameLimitClaim,
  // "did this READ see the whole set?" — the retirement's right to speak
  markScopedEnumeration, scopedEnumeration, scopedNamedCount, authoritativeScopesOf, SCOPED_ENUMERATED,
  // a window the vendor removed (lane no-5h-window): «no 5h limit» ≠ «5h window not started»
  absentSince, settleAbsence, markWindowsAbsent, markWindowEnumeration, absentWindowsOf, fiveHourAbsent, WINDOWS_ABSENT,
  withOwnAbsence, PASSIVE_WITNESSES, FIVE_HOUR_SEC, planWeekSigOf, weekMovedForward, liveWitnesses, countPassiveAnswer,
  // panels
  orderLimits, limitLabel, limitState,
  // the wall's own attribution (inc-mttbrtc0-6049)
  windowRefutes, refutationStrength, wallAttribution,
  // legacy bridge
  toLegacyView, fromLegacy, legacyWindowLimit,
};
