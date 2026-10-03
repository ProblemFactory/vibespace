'use strict';
// PURE (imports nothing; CJS) THE RETRY PARK ENTRY'S LIFECYCLE AS ONE CLOSED TABLE (lane notify-retry, verify r3,
// 2026-10-01). The engine (src/server/conversation-deliver.js, "THE RETRY PARK") is imperative — its rule for what
// happens to ONE parked delivery was spread over parkRetry / attemptRetry / fellRetry / repairClock / the boot block /
// the cap / the redactor / the hand-over's claim and take. This module states that rule once, as a step function over
// an entry's RECORD and an EVENT, so every cell of states × events is pinned (scripts/test-park-step.mjs: the table,
// a seeded walk of every event sequence ≤ 4 from every state under the invariants, and the ENGINE driven through
// every drivable cell and compared). A cell the engine disagrees with is a finding; this file never decides anything
// at runtime — it is the specification the engine is measured against.
//
// STATES (an entry is in exactly one):
//   waiting         parked, not on the wire, not claimed; the timer / a turn end attempt it
//   cleared         waiting, its words replaced by the cleared sentence (Clear content… reached it); attempted alike
//   claimed         a hand-over's `ho` stamp: that hand-over's frame carries it; the park skips it until released
//   inflight        the park's own frame is on the wire (`inflight` stamp on disk = the claim door)
//   maybeDelivered  a boot found it stamped (inflight or ho): its frame MAY have landed — handed to the stash at the
//                   first sweep, never posted by the park again
//   landed          delivered (the park's post or a hand-over's) — terminal
//   stashed         fell to the producer's stash (not-running / spend-cap / may-have-landed) — terminal here
//   evicted         fell at the cap, said — terminal here;   expired   fell at the 60-min / 30-attempt bound, said
// EVENTS: see EVENTS below. `bound-60min` / `max-attempts` / `target-gone` / `spend-refused` are an ATTEMPT (a timer or
// turn end) that finds that fact; `clock-backward` is the step + the repair at the next schedule; `boot-ho` /
// `boot-inflight` are a boot (the entry's own stamp decides). verify r4 (the owner-outcome table found two engine doors
// the table lacked): `handover-claim` = a hand-over claims a WAITING entry for its own frame (claimRetry: the `ho` stamp;
// an entry on the wire or leaving is not listed to it); `prompt-take` = a prompt's injection carried a waiting entry
// inline for free (retryTake via 'prompt': landed, no post, no charge, the hold given back). The hand-over's own landing
// is `post-ok` on a claimed entry; its miss (`post-refused-*` on a claimed one) releases the claim.
const STATES = Object.freeze(['waiting', 'cleared', 'claimed', 'inflight', 'maybeDelivered', 'landed', 'stashed', 'evicted', 'expired']);
const TERMINAL = Object.freeze(new Set(['landed', 'stashed', 'evicted', 'expired']));
const EVENTS = Object.freeze(['post-ok', 'post-refused-transient', 'post-refused-final', 'poster-never-answers', 'server-death-mid-post', 'graceful-stop-mid-post', 'turn-end', 'timer', 'bound-60min', 'max-attempts', 'clock-forward', 'clock-backward', 'clear-single', 'clear-batch', 'cap', 'boot-ho', 'boot-inflight', 'target-gone', 'spend-refused', 'handover-claim', 'prompt-take']);
const STEPS_MS = Object.freeze([30_000, 60_000, 120_000, 300_000, 600_000]);
const MAX_MS = 60 * 60_000;
const TIMER_ATTEMPTS = (() => { let t = 0, n = 1; for (let i = 0; ; i++) { t += STEPS_MS[Math.min(i, STEPS_MS.length - 1)]; if (t > MAX_MS) break; n++; } return n; })();
const MAX_ATTEMPTS = 3 * TIMER_ATTEMPTS;
const FLOOR_MS = 30_000;
const HOLD_TTL_MS = 3 * 60_000;   // the spend authorizer's RESERVE_TTL_MS (a parked hold is released a hair before it)
const CLOCK_STEP_MS = 2 * 60 * 60_000;   // the walk's clock step (the r2 reproduction's two hours)
const stepOf = (attempts) => STEPS_MS[Math.min(Math.max(0, attempts - 1), STEPS_MS.length - 1)];

/** a fresh entry's record at its first miss */
function freshEntry(now, id = 'rt-1') {
  return { id, s: 'waiting', attempts: 1, firstAt: now, nextAt: now + STEPS_MS[0], holds: true, holdAt: now, cleared: false, mid: false, lastPostAt: null, posts: 0, charged: 0 };
}
/** the record's PERSISTED fields (the file after every step = the state) */
const STORED = Object.freeze(['s', 'attempts', 'firstAt', 'nextAt', 'holds', 'holdAt', 'cleared']);
const stored = (e) => STORED.map((k) => String(e[k])).join('|');

const DEFAULT_FACTS = Object.freeze({ pidAlive: true, spend: 'ok', postOutcome: 'ok', oldestWaiting: true });

/** parkStep(entry, event, facts) → {entry, post, say, leave, na, authorize, charge, persist, skipped}
 *  - entry: the next record (a COPY; the input is never mutated)   - post: a frame left for the agent in this step
 *  - say: the sentence the engine logs for this entry (null = nothing about this entry)   - leave: landed|stash|evicted|expired
 *  - na: the event cannot happen to an entry in this state (nothing changes)   - skipped: an attempt-shaped event that
 *    the engine does not judge in this state (claimed / inflight are left alone)   - authorize: hold|fresh|null (ONE per frame)
 *  - charge: the park charged ONE turn (its own post landed)   - persist: the stored fields changed and were written */
function parkStep(entry, event, facts = {}) {
  if (!entry || !STATES.includes(entry.s)) throw new Error('parkStep: unknown state ' + (entry && entry.s));
  if (!EVENTS.includes(event)) throw new Error('parkStep: unknown event ' + event);
  const f = { ...DEFAULT_FACTS, ...facts };
  const now0 = Number(f.now);
  if (!Number.isFinite(now0)) throw new Error('parkStep: facts.now is required');
  const e = { ...entry };
  const out = (patch) => {
    const next = { ...e, ...(patch.entry || {}) };
    const r = { entry: next, post: false, say: null, leave: null, na: false, skipped: false, authorize: null, charge: false, persist: false, now: patch.now ?? now0, ...patch };
    r.entry = next;
    if (r.leave) r.entry.s = r.leave === 'stash' ? 'stashed' : r.leave;
    r.persist = r.persist || stored(entry) !== stored(r.entry);
    return r;
  };
  const na = () => out({ na: true });
  const id = e.id;
  if (TERMINAL.has(e.s)) return na();   // gone from the park: nothing here can happen to it (the stash has its own life)
  const isClear = event === 'clear-single' || event === 'clear-batch';
  const isBoot = event === 'boot-ho' || event === 'boot-inflight';
  const isAttempt = ['turn-end', 'timer', 'bound-60min', 'max-attempts', 'target-gone', 'spend-refused'].includes(event);
  // ── the clock ──
  if (event === 'clock-forward') return out({ now: now0 + CLOCK_STEP_MS });   // nothing moves until the next attempt, which finds the age grown
  if (event === 'clock-backward') {                                             // the step, then the repair at the next schedule (said once)
    const now = now0 - CLOCK_STEP_MS;
    const patch = {}; let said = null;
    if (e.firstAt > now || (e.holds && e.holdAt > now) || e.nextAt > now + STEPS_MS[STEPS_MS.length - 1]) {
      patch.firstAt = Math.min(e.firstAt, now); if (e.holds) patch.holdAt = Math.min(e.holdAt, now);
      if (e.nextAt > now + STEPS_MS[STEPS_MS.length - 1]) patch.nextAt = now + stepOf(e.attempts);
      said = `${id} was stamped in the future — the clock went back; re-based to now`;
    }
    if (e.lastPostAt != null && e.lastPostAt > now) { patch.lastPostAt = null; said = (said ? said + '; ' : '') + 'the last landed post was stamped in the future — the witness is dropped (no floor)'; }
    return out({ now, entry: patch, say: said });
  }
  // ── a clear: the words become the sentence wherever the entry is; on the wire it is marked and said ──
  if (isClear) {
    if (e.s === 'inflight') return out({ entry: { cleared: true, mid: true }, say: `${id} was cleared while its frame was on the wire — the frame carried the words before the clear; the card will draw the cleared sentence` });
    if (e.s === 'waiting') return out({ entry: { s: 'cleared', cleared: true } });
    return out({ entry: { cleared: true } });   // cleared (again) / claimed (the hand-over's landing says it) / maybeDelivered (falls with the sentence)
  }
  // ── a boot: the stamps decide; a hold never crosses a process ──
  if (isBoot) {
    if (e.s === 'inflight') return out({ entry: { s: 'maybeDelivered', holds: false, nextAt: 0 }, say: `${id} was being posted when the previous server stopped — its frame may have landed, so it is handed to the stash at the first sweep and never posted again` });
    if (e.s === 'claimed') return out({ entry: { s: 'maybeDelivered', holds: false, nextAt: 0 }, say: `${id} was claimed by a hand-over when the previous server stopped — its frame may have landed, so it is handed to the stash at the first sweep and never posted again` });
    return out({ entry: { holds: false } });   // waiting / cleared / maybeDelivered: the hold is forgotten, re-judged at the next attempt
  }
  // ── the cap: a thirty-first park evicts the OLDEST WAITING; the wire, a claim and a leaving copy are not counted ──
  if (event === 'cap') {
    if ((e.s === 'waiting' || e.s === 'cleared') && f.oldestWaiting) return out({ leave: 'evicted', entry: { holds: false }, say: `the retry park holds 30 waiting per conversation — ${id} (the oldest waiting) falls to the stash, evicted` });
    return out({});
  }
  // ── the two doors a prompt and a hand-over open (verify r4): only a WAITING entry is listed to them ──
  if (event === 'handover-claim') return (e.s === 'waiting' || e.s === 'cleared') ? out({ entry: { s: 'claimed' } }) : na();   // the claim door refuses one in flight; a leaving copy is listed to nobody
  if (event === 'prompt-take') return (e.s === 'waiting' || e.s === 'cleared') ? out({ leave: 'landed', entry: { holds: false } }) : na();   // rode the prompt inline, free: no post, no charge, the hold given back; the drain's card says it
  // ── the wire: only an entry on it (its own frame, or a hand-over's) hears a post's outcome ──
  const onWire = e.s === 'inflight' || e.s === 'claimed';
  if (['post-ok', 'post-refused-transient', 'post-refused-final', 'poster-never-answers', 'server-death-mid-post', 'graceful-stop-mid-post'].includes(event)) {
    if (!onWire) return na();
    const landedByPark = () => out({ leave: 'landed', charge: true, entry: { holds: false }, say: `${id} delivered on retry${e.mid ? ' — landed after a clear reached it mid-flight (the frame carried the words before the clear; the card draws the cleared sentence)' : ''}` });
    const landedByHandover = () => out({ leave: 'landed', entry: { holds: false }, say: e.cleared ? 'the hand-over was on its way when a clear reached its entries — the frame is remembered by its digest only' : null });   // the hand-over billed its own turn; the park's hold goes back
    const refusedTransient = (now = now0) => {
      if (e.s === 'claimed') return out({ entry: { s: e.cleared ? 'cleared' : 'waiting' } });   // the hand-over's miss releases the claim; nothing said for the entry
      const attempts = e.attempts + 1;
      if (!f.pidAlive) return out({ leave: 'stash', entry: { attempts, mid: false, holds: false }, say: `${id} falls to the stash after ${attempts} attempts — not-running` });
      const st = stepOf(attempts);
      if (now + st - e.firstAt > MAX_MS || attempts >= MAX_ATTEMPTS) return out({ leave: 'expired', entry: { attempts, mid: false, holds: false }, say: `${id} falls to the stash after ${attempts} attempts — not-reachable: the agent did not accept the message (expired)` });
      return out({ entry: { s: e.cleared ? 'cleared' : 'waiting', attempts, nextAt: now + st, mid: false }, say: `${id} retry failed (attempt ${attempts})` });   // the hold stays on the entry until its TTL
    };
    const refusedFinal = () => e.s === 'claimed' ? out({ entry: { s: e.cleared ? 'cleared' : 'waiting' } }) : out({ leave: 'stash', entry: { attempts: e.attempts + 1, mid: false, holds: false }, say: `${id} falls to the stash — not-running: the socket is not served` });
    if (event === 'post-ok') return e.s === 'inflight' ? landedByPark() : landedByHandover();
    if (event === 'post-refused-transient') return refusedTransient();
    if (event === 'post-refused-final') return refusedFinal();
    if (event === 'poster-never-answers') return out({ say: null });   // bounded by the primitive (≤ 6.15 s on any real socket); an injected poster strands it until a boot
    if (event === 'server-death-mid-post') return out({});           // the stamp stays on disk; the next boot says so
    // a graceful stop waits ≤ SETTLE_MS (> the primitive's bound) for the post's own verdict
    if (f.postOutcome === 'ok') return e.s === 'inflight' ? landedByPark() : landedByHandover();
    if (f.postOutcome === 'transient') return refusedTransient();
    if (f.postOutcome === 'final') return refusedFinal();
    return out({ say: 'did not settle before the deadline — stamped, handed to the stash at the next boot' });   // 'late': impossible with the real primitive
  }
  // ── an attempt ──
  if (isAttempt) {
    if (e.s === 'maybeDelivered') return out({ leave: 'stash', entry: { holds: false }, say: `${id} falls to the stash after ${e.attempts} attempt${e.attempts === 1 ? '' : 's'} — not-reachable: it was being posted when the previous server stopped — its frame may have landed, so it is not posted again` });   // FIRST, before any judge: no post, no authorization
    if (onWire) return out({ skipped: true });   // the attempt takes what is waiting; a claimed / in-flight entry is spoken for
    let now = now0, attempts = e.attempts, pidAlive = f.pidAlive, spend = f.spend, hold = e.holds;
    if (event === 'timer') now = Math.max(now, e.nextAt);
    if (event === 'bound-60min') now = Math.max(now, e.firstAt + MAX_MS + 1);
    if (event === 'max-attempts') attempts = Math.max(attempts, MAX_ATTEMPTS);
    if (event === 'target-gone') pidAlive = false;
    if (event === 'spend-refused') { spend = 'refused'; hold = false; }
    const ageMin = Math.round((now - e.firstAt) / 60000);
    if (now - e.firstAt > MAX_MS) return out({ now, leave: 'expired', entry: { attempts, holds: false }, say: `${id} falls to the stash after ${attempts} attempt${attempts === 1 ? '' : 's'} — not-reachable: the retry schedule's 60 min bound passed ${ageMin} min after the first miss (expired)` });
    if (attempts >= MAX_ATTEMPTS) return out({ now, leave: 'expired', entry: { attempts, holds: false }, say: `${id} falls to the stash after ${attempts} attempts — not-reachable: the agent did not accept the message in ${attempts} attempts (the schedule's ${MAX_ATTEMPTS}-attempt bound) (expired)` });
    if (!pidAlive) return out({ now, leave: 'stash', entry: { attempts, holds: false }, say: `${id} falls to the stash after ${attempts} attempt${attempts === 1 ? '' : 's'} — not-running: the conversation is no longer running` });
    if (e.lastPostAt != null && now - e.lastPostAt < FLOOR_MS) return out({ now, entry: { attempts, nextAt: e.lastPostAt + FLOOR_MS } });   // the floor: rescheduled, nothing said
    const holdValid = hold && now - e.holdAt <= HOLD_TTL_MS;
    if (!holdValid) {
      if (spend === 'threw') return out({ now, leave: 'stash', entry: { attempts, holds: false }, say: `${id} falls to the stash — spend-cap: spend authorizer failed` });
      if (spend === 'refused') return out({ now, leave: 'stash', entry: { attempts, holds: false }, say: `${id} falls to the stash — spend-cap: spend budget` });
      return out({ now, post: true, authorize: 'fresh', entry: { s: 'inflight', attempts, holds: true, holdAt: now, posts: e.posts + 1 }, persist: true });   // the inflight stamp is written BEFORE the post
    }
    return out({ now, post: true, authorize: 'hold', entry: { s: 'inflight', attempts, posts: e.posts + 1 }, persist: true });
  }
  throw new Error('parkStep: unhandled ' + e.s + ' × ' + event);
}

/** the whole table: STATES × EVENTS → the canonical cell (a fresh-shaped entry in that state, default facts) */
function canonical(s, now) {
  const e = freshEntry(now);
  e.s = s;
  if (s === 'cleared') e.cleared = true;
  if (s === 'maybeDelivered') { e.holds = false; e.nextAt = 0; }
  if (TERMINAL.has(s)) e.holds = false;
  return e;
}
function parkTable(now = 1_700_000_000_000) {
  const rows = {};
  for (const s of STATES) {
    rows[s] = {};
    for (const ev of EVENTS) {
      const r = parkStep(canonical(s, now), ev, { now });
      rows[s][ev] = r.na ? '—' : r.skipped ? s + ' (skipped)' : `${r.entry.s}${r.post ? ' +post' : ''}${r.say ? ' +say' : ''}`;
    }
  }
  return rows;
}
module.exports = { STATES, TERMINAL, EVENTS, STEPS_MS, MAX_MS, MAX_ATTEMPTS, FLOOR_MS, HOLD_TTL_MS, CLOCK_STEP_MS, DEFAULT_FACTS, STORED, freshEntry, canonical, parkStep, parkTable, stored };
