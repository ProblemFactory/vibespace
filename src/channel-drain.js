'use strict';
/**
 * THE DRAIN'S SCHEDULING DECISION — PURE (lane R2 verify r9, 2026-09-26;
 * docs/design-communication-panel.zh.md §6.5, the r9 note).
 *
 * WHY THIS FILE EXISTS. Seven adversarial rounds (r2–r8) each found ONE
 * money-class defect, and every one lived in the refresh / drain SCHEDULING
 * of src/server/channels-engine.js: a foreign pass answered (r2), the owner's
 * back-off exemption reachable by agents (r3), N concurrent refreshes of one
 * key = N vendor calls (r4), an agent storm denying the owner and refusals
 * delivered at the pass's end (r6), forced passes running thrice (r7), LIFO
 * across boundaries + the owner behind 180 agents + re-requests not riding
 * (r8). Each rewrite of an imperative scheduler whose decisions were spread
 * across `await`s grew a new ORDERING bug only a fresh adversary found. Here
 * the decision is a STEP FUNCTION over a snapshot: `next(snap)` names the ONE
 * next action, `apply(snap, action, result)` returns the next snapshot, and
 * every async boundary of the engine (a vendor call) happens BETWEEN two
 * steps, never inside a decision. No Date.now, no timers, no I/O, imports
 * nothing (CJS so the engine, the gate and a suite share it). The gate is
 * scripts/test-channel-drain.mjs: a seeded random walk asserting every rule
 * below at every step, the r2–r8 repros as tables, a mutant per rule.
 *
 * THE SNAPSHOT (frozen shape — the engine keeps the first three fields on the
 * account's live entry as `e.dq` and adds the FACTS before every `next`):
 *   seq       next filing number (monotone per account)
 *   requests  [{ id, key, origin: 'owner'|'open'|'agent', principal, at, seq,
 *               taken }] in FILING order — every waiter not yet answered.
 *               `taken` = a step has judged it and ACCEPTED it (it rides its
 *               key's pending item); a refused one is answered and removed.
 *   pass      null between passes, else (written by open / turn / apply only):
 *             { origin: 'timer'|'kick'|'request', force, backoff (the pass
 *               runs inside a vendor back-off), timerWork, turnPending,
 *               due: the DUE QUEUE of the timer's PENDING rows { key, dueAt }
 *                 in fetch order (persistent — `dueRows(pass)` lists it),
 *               fetched: the FETCH LOG of this pass's fetch instants (an
 *                 append-only log a snapshot sees `n` entries of; `fetchedAt`),
 *               inflight: null|{ type, key }, last: null|'request'|'rider'|
 *               'plain' (the class of the previous fetch), streak (request-
 *               class fetches since the last due-row fetch), calls, fetches
 *               (ingests that succeeded), vendorCalls, discovery: { wanted,
 *               done }, hostScan: { wanted, done }, pressKey, failed, cut,
 *               feed (rule 21), recheck: { armed, pending: [key], done, perPass } (rule 22) }
 *   FACTS (read by `next` only, never written by `apply`):
 *   now       the engine's clock (ms)
 *   stopped   the engine is stopping · dropped  the account was removed /
 *             rebuilt (its live entry replaced) · connected  false = never
 *             authenticated (nothing to pass with)
 *   backoff   { epoch, pressEpoch } — the back-off WINDOW number and the window
 *             whose one owner press is spent
 *   budget    { remainingUnits } — the minute's vendor units left (limit −
 *             spent); a vendor call is affordable while it is > 0 (the
 *             vendor's "may send one more request" rule — a call's own cost is
 *             charged by the meter after it, never predicted)
 *   agentShare { remaining } — agent units left in the minute (Infinity when
 *             the share is 100 %)
 *   floors    { key: lastFetchAt } for the keys of waiting requests · floorMs
 *   feedPages { remaining } — rule 21: the change feed's pages left in its own
 *             sliding minute (absent / 0 = none now)
 *   pace      null (no pacing — the adapter declares no `caps.pace`) | the
 *             account's PER-SECOND bucket (rule 18): { unitsPerSec, burst,
 *             tokens, lastRefillAt, cost: { fetch, discover, scanHost } } —
 *             `tokens` at `lastRefillAt` (it may be NEGATIVE: a call larger
 *             than the bucket leaves a debt), refilled at `unitsPerSec` up to
 *             `burst`; `cost` = what one action of each kind is expected to
 *             charge, in the budget's unit
 * Deviations from the r9 brief, each with its reason: the due rows carry no
 * `tier` (the cadence already folded it into `dueAt` — the scheduler never
 * reads a tier); `budget` has no `unitsPerFetch` (above); `discovery` is a
 * pass field (wanted / done), its pages are the engine's walk; the scan lane's
 * per-pass host-facts round trip is its own action (`scanHost` — a vendor call
 * the budget must judge); `turn(snap, …)` hands the timer's due list in (the
 * list is a store read — an async boundary the model does not own).
 *
 * ACTIONS `next` returns (each carries `at` = the step's now, `accept` = ids of
 * the untaken requests this step ACCEPTED, `press` = the key granted the
 * owner's press this step or null):
 *   { type: 'refuse', key, code, rule, waiters, cut? }   answered NOW, by name
 *   { type: 'answer', waiters, outcome, code? }           a settlement (stop /
 *                                                          drop / failure / not-connected)
 *   { type: 'discover' }                                   the discovery walk
 *   { type: 'feed' }                                       ONE change-feed page (rule 21) — or a cursor feed's CATCH-UP:
 *                                                          ONE action, its result `{due, pages, catchUp:true}` (lane gmail-feed-gap)
 *   { type: 'recheck', key }                               ONE recent-roots page (rule 22)
 *   { type: 'scanHost' }                                   the scan lane's host facts
 *   { type: 'fetch', key, chargeTo: 'timer'|'owner'|'agent', waiters, due,
 *     rider, pressed, recheck }                            ONE conversation (`recheck` = rule 22b:
 *                                                          the round holds the OWNER's press)
 *   { type: 'wait', ms, next, key }                        rule 18: the bucket
 *                                                          is short — sleep
 *                                                          `ms` (≤ 1 s), then ask
 *                                                          again (`next` / `key`
 *                                                          = the action it holds)
 *   { type: 'end', ok, why, cut?, carry?, waiting, timerWork }
 * `apply(snap, act)` with no result BEGINS an async action (fetch / discover /
 * scanHost); `apply(snap, act, result)` completes it. Results: fetch
 * `{ ok, appended, hints }` | `{ refused: 'not-found'|'forbidden' }` |
 * `{ error: code }`; discover `{ due }` | `{ error }`; scanHost `{}` | `{ error }`.
 * The engine delivers a fetch's `ok` / conversation refusal to exactly
 * `act.waiters`; everything else it delivers as an action says.
 *
 * THE RULES (every one is an invariant of the gate's walk):
 *  1. ADMISSION: a request enters the set unless it already holds
 *     REFRESH_QUEUE_CAP untaken waiters — an agent's at CAP − RESERVE, so an
 *     agent's storm never refuses the owner's press or a window's open.
 *  2. STOP / DROP FIRST: an engine stopping or an account removed / rebuilt ⇒
 *     every waiter answered `stopped` / `account-changed` in ONE step, then end
 *     (no vendor call after).
 *  3. A FAILED PASS: every taken waiter hears the account's failure in one
 *     step, then end; a request filed during the failing call stays for the
 *     next pass (it meets the back-off there).
 *  4. NOT CONNECTED: every waiter answered `not-connected`, end.
 *  5. JUDGEMENT AT SIGHT: an untaken request whose key has no pending item is
 *     judged — as its key's group, by the group's highest origin — at the first
 *     step that sees it, and a refusal is answered at that step, in filing
 *     order: THE BACK-OFF (every origin but the owner's; the owner's press
 *     honoured ONCE per back-off window, one key per pass), THE AGENT SHARE
 *     (agent-only groups), THE VENDOR BUDGET, THE PER-CONVERSATION FLOOR
 *     (agent-only groups). An accepted request is `taken` and is never judged
 *     again (rules 9 and 11 still apply at its fetch) — except inside a
 *     back-off, where a vendor call is the owner's press ALONE: an item whose
 *     owner left before its fetch (the waiter's own bound) is refused
 *     `backoff`, the press not spent (found by the r9 walk).
 *  6. THE RIDER RULE: a request whose key has a pending item (a due row of this
 *     pass, or a taken group) rides it — no gate, one fetch answers both; at
 *     most ONE pending item per key, ever.
 *  7. FIFO, HUMANS FIRST: items with waiters are fetched owner / open before
 *     agent, each class in the filing order of its EARLIEST waiter — across
 *     every step of the pass, never re-ordered by a later arrival; the timer's
 *     plain due rows come after them, most overdue first.
 *  8. THE INTERLEAVE: after a request-class fetch (a group of its own), while a
 *     due row is pending the next fetch is a due row (a ridden one first) —
 *     between two request-class fetches at most one plain due row, and (rule 7)
 *     between two plain due rows at most one request-driven fetch: a saturating
 *     stream still serves every due row, a lone request behind 873 due rows
 *     waits for at most ONE due-row fetch.
 *  9. THE BUDGET PER CALL: no fetch, discovery or host scan with the minute
 *     spent; the CUT refuses every accepted waiter by name (`vendor-budget`)
 *     and ends the pass (never over budget, never `0 new`).
 * 10. AN OK AT ITS FETCH: a fetch answers exactly its ROUND — every waiter of
 *     its key present when it began; a request filed during its key's fetch is
 *     a new round (judged anew: the owner's second fetch, the agent's floor).
 * 11. THE SHARE PER FETCH: an agent-only group is not fetched with the agent
 *     share spent — refused by name (r9: r8 judged the share at the boundary
 *     only, so N agent requests judged together could overspend it).
 * 12. DISCOVERY: at most once per pass, only with the timer's work, never
 *     while a human waits (a human's fetch goes first).
 * 13. THE TIMER'S TURN: `turn` merges the due rows by the clock — a key this
 *     pass fetched only when it is due AGAIN (dueAt after that fetch), a key
 *     with a taken group never doubled; hints join the same way.
 * 14. HOST SCAN: once per pass, before the first fetch of a scan-lane pass.
 * 15. THE BOUND: with no due row pending, a pass ends after STREAK_MAX
 *     request-class fetches in a row — a request stream cannot keep one pass
 *     alive forever; the taken rest carries to the next pass, which the engine
 *     starts at once.
 * 16. END: nothing pending ⇒ end; a back-off pass that fetched nothing ends
 *     `backoff` (it changes nothing); a cut before any vendor call ends
 *     `budget`.
 * 17. ONE QUEUED PASS: a timer / forced ask while a pass runs is queued ONCE
 *     per account; later asks JOIN it and `force` is sticky (N presses of
 *     Re-authorize = one forced ingest after the running pass).
 * 18. THE PACE (lane R5, 2026-09-26 — the owner: "gmail一直被限速 你可能要控制
 *     下gmail默认的读取速度"; the vendor refused whole passes that stayed
 *     under the minute's budget but spent it in ~20 s): a vendor call is also
 *     paced PER SECOND. The bucket (the `pace` fact) refills continuously at
 *     `unitsPerSec` up to `burst`; a discovery, a host scan or a fetch whose
 *     cost `c` finds fewer than min(c, burst) tokens is NOT sent — the step is
 *     `wait` for the shortfall, at most PACE_WAIT_MAX_MS, and the next step
 *     judges and picks AGAIN (a human filed during it goes first, rule 7).
 *     A call larger than the bucket waits for a FULL bucket and leaves a debt
 *     the following calls wait out. A wait is never a refusal and never a
 *     skip: every refusal (rules 5, 11, the cut of rule 9), settlement and
 *     end is answered at once, the minute's budget is judged BEFORE the pace
 *     (rule 9 stays the outer cap), and a wait moves no due row, no streak
 *     (rule 15) and no count. THE TOLERANCE, exact: over ANY window of T
 *     seconds the calls charge at most burst + unitsPerSec·T + max(0,
 *     c_max − burst) — with burst = unitsPerSec and a call of one second's
 *     worth, at most one second's worth plus ONE call in any second. The
 *     engine sets unitsPerSec = min(perSecond, budget/60) and burst =
 *     min(perSecond, budget/2): the pace never spends a minute faster than
 *     the minute's budget (any 60 s ≤ the budget + one burst; rule 9's cut
 *     still caps each minute window). Gmail's defaults (40/s, 3000/min):
 *     ≤ 80 units in any second, ≤ 2440 in any 60 s, one thread read a second.
 * 19. HISTORY ON DEMAND (lane channel-render verify r6, 2026-09-27 — the
 *     SERVER BELT under the window's upward page): `POST …/older` is a METERED
 *     vendor call, and five verify rounds each found one more way the window
 *     made it without a person paging up (a rebuild's clear, a maximize, a
 *     wheel down + a clamp, an equal-room clamp, a caret key, then a zoom
 *     wheel and a nested code block's own scrolling). Reproduced on the real
 *     engine: 20 concurrent /older for ONE conversation = 20 vendor calls for
 *     the same page; 20 in 2 s after the vendor said `exhausted` = 16 more
 *     vendor calls answering nothing; the account's whole minute budget was
 *     the only bound (546 calls before the first refusal). Whatever a client
 *     does, per CONVERSATION the vendor's `older` is asked
 *       · ONCE AT A TIME — a second ask JOINS the one in flight and reads the
 *         log it filled (`join`; a joiner never waits twice);
 *       · at most once per OLDER_FLOOR_MS — a second ask inside the floor is
 *         refused `floor` with the wait (the local page it has is still
 *         answered; the window holds and says "paused for a moment");
 *       · never again for what the vendor answered `exhausted` — remembered
 *         per conversation (`exhausted`, no call) until the conversation
 *         CHANGED (a record appended by an ingest, the owner's Refresh, a
 *         re-authorization — the memory lives on the account's live entry
 *         and dies with it) or OLDER_MEMORY_MS passed (a belt: a vendor's
 *         false "nothing older" is never remembered for good).
 *     Rule 9 (the minute budget) and rule 18 (the adapter's own pace) stay
 *     the outer caps: this rule is judged BEFORE the budget, so a joined or
 *     remembered answer costs no unit. The memory is `{askedAt, inflight,
 *     exhaustedAt}` per conversation, moved only by `olderApply`.
 */

const REFRESH_QUEUE_CAP = 200;
const REFRESH_OWNER_RESERVE = 20;
/** Rule 15's K: request-class fetches in a row (no due row pending) before a pass ends. */
const STREAK_MAX = 25;
const ORIGINS = Object.freeze(['owner', 'open', 'agent']);
/** Every refusal `next` / `admit` can name — each is retry-able (the agent route answers 429). */
const REFUSAL_CODES = Object.freeze(['backoff', 'vendor-budget', 'refresh-floor', 'refresh-queue-full']);
/** Every settlement `next` can name (`failed` carries the account's own vendor code). */
const ANSWER_OUTCOMES = Object.freeze(['stopped', 'account-changed', 'not-connected', 'failed']);
/** Rule 18's longest single wait: the model is asked again at least this often. */
const PACE_WAIT_MAX_MS = 1000;
/** Float slack of the bucket arithmetic (tokens are fractional). */
const PACE_EPS = 1e-6;
/** Rule 19: two vendor asks for one conversation's older history are at least this far apart. */
const OLDER_FLOOR_MS = 1500;
/** Rule 19: a remembered `exhausted` answers without a vendor call for this long (a belt against a false one). */
const OLDER_MEMORY_MS = 6 * 3600e3;
/** Rule 21: the change feed's pages per pass when the turn names none (the adapter's `caps.changeFeed.pagesPerPass`). */
const FEED_PAGES_PER_PASS = 5;
/** Rule 19's memory events (`olderApply`). */
const OLDER_EVENTS = Object.freeze(['ask', 'landed', 'failed', 'changed']);

const isHuman = (o) => o === 'owner' || o === 'open';
const ids = (rs) => rs.map((r) => r.id);

/** An account's empty drain state. */
function empty() { return { seq: 0, requests: [], pass: null }; }

/** RULE 1 — `{ ok, snap }` with the request filed, or the typed refusal. */
function admit(snap, req) {
  const origin = ORIGINS.includes(req && req.origin) ? req.origin : 'agent';
  let n = 0;
  for (const r of snap.requests) if (!r.taken) n++;
  const cap = origin === 'agent' ? REFRESH_QUEUE_CAP - REFRESH_OWNER_RESERVE : REFRESH_QUEUE_CAP;
  if (n >= cap) return { ok: false, refused: 'refresh-queue-full', queued: n, cap };
  const r = { id: req.id, key: String(req.key), origin, principal: req.principal || null, at: Number(req.at) || 0, seq: snap.seq, taken: false };
  return { ok: true, snap: { ...snap, seq: snap.seq + 1, requests: snap.requests.concat([r]) } };
}
/** A waiter left the set by itself (its bound's `pending`, a settle): gone from the model. */
function withdraw(snap, id) {
  const requests = snap.requests.filter((r) => r.id !== id);
  return requests.length === snap.requests.length ? snap : { ...snap, requests };
}
/** The set as a suite / a diagnostic reads it: the UNTAKEN waiters (what the cap counts). */
function census(snap) {
  let waiters = 0, agents = 0;
  const keys = [];
  for (const r of snap.requests) {
    if (r.taken) continue;
    waiters++;
    if (r.origin === 'agent') agents++;
    if (!keys.includes(r.key)) keys.push(r.key);
  }
  return { waiters, agents, keys, held: snap.requests.length - waiters };
}
const hasRequests = (snap) => snap.requests.length > 0;
const takenRequests = (snap) => snap.requests.filter((r) => r.taken);

/** RULE 17 — the queued pass behind a running one. `prev` = the queued ask or null. */
function queueAsk(prev, ask) {
  const force = !!(ask && ask.force);
  if (prev) return { queued: { force: prev.force || force, origin: prev.origin }, joined: true };
  return { queued: { force, origin: (ask && ask.origin) || 'timer' }, joined: false };
}

// ── RULE 18: THE PER-SECOND BUCKET (pure arithmetic, shared with the engine) ──
/** A fresh bucket `{unitsPerSec, burst, tokens, lastRefillAt}` (full unless told). */
function paceFresh(unitsPerSec, burst, at, tokens = null) {
  const r = Math.max(0, Number(unitsPerSec) || 0), b = Math.max(0, Number(burst) || 0);
  return { unitsPerSec: r, burst: b, tokens: tokens === null || tokens === undefined ? b : Number(tokens) || 0, lastRefillAt: Number(at) || 0 };
}
/** The bucket's level at `now`: refilled since `lastRefillAt`, capped at `burst`. */
function paceLevel(pace, now) {
  if (!pace) return Infinity;
  const dt = Math.max(0, (Number(now) || 0) - (Number(pace.lastRefillAt) || 0));
  return Math.min(Number(pace.burst) || 0, (Number(pace.tokens) || 0) + (dt * (Number(pace.unitsPerSec) || 0)) / 1000);
}
/** What a call of `cost` must find in the bucket: the cost, or a FULL bucket when it is larger. */
function paceNeed(pace, cost) { return Math.min(Math.max(0, Number(cost) || 0), Number(pace && pace.burst) || 0); }
/** Milliseconds until a call of `cost` may be sent (0 = now), at most PACE_WAIT_MAX_MS
 *  per ask — the caller asks again. A bucket that never refills waits the maximum. */
function paceWaitMs(pace, now, cost) {
  if (!pace) return 0;
  const short = paceNeed(pace, cost) - paceLevel(pace, now);
  if (short <= PACE_EPS) return 0;
  const r = Number(pace.unitsPerSec) || 0;
  if (!(r > 0)) return PACE_WAIT_MAX_MS;
  return Math.max(1, Math.min(PACE_WAIT_MAX_MS, Math.ceil((short * 1000) / r)));
}
/** The bucket after a call of `units` was SENT at `now` (the level may go negative — a debt). */
function paceCharge(pace, now, units) {
  if (!pace) return pace;
  return { ...pace, tokens: paceLevel(pace, now) - Math.max(0, Number(units) || 0), lastRefillAt: Number(now) || 0 };
}
/** The cost the model expects of one action of `type` (1 when undeclared). */
function paceCost(pace, type) {
  const c = pace && pace.cost && Number(pace.cost[type]);
  return Number.isFinite(c) && c >= 0 ? c : 1;
}
/** RULE 18 at a vendor action: the action itself, or the wait for the bucket. */
function paced(s, base, act) {
  const ms = paceWaitMs(s.pace || null, s.now, paceCost(s.pace, act.type));
  if (!(ms > 0)) return act;
  return { ...base, type: 'wait', ms, next: act.type, key: act.key || null };   // THE PACE
}

// ── THE DUE QUEUE + THE FETCH LOG (lane channel-drain-scale, 2026-10-06 — a 89 000-row mailbox blocked the loop 18 s in
// every 20: `itemsOf` rebuilt every due row on every `next`, `apply` copied the due list and `fetchedAt` on every
// fetch — O(due) per step, O(due²) per pass). A pass is O(due + steps · requests): the structures below are
// PERSISTENT — a step never mutates the snapshot it was handed, it returns a new one sharing what did not change.
/** The pending due rows: `rows` (frozen, in queue order) + `at` (key → index, built with them, never written after)
 *  shared by every snapshot until a merge ADDS a key (the one rebuild: O(due + rows) — the timer's turn, discovery, a
 *  feed page, a kick's new hint); `head` = rows before it are consumed; `gone` = keys left out of order at an index ≥
 *  head (a rider, a plain row fetched while a rider stood ahead of it — at most the waiters' keys); `size` = pending. */
function dqOf(list) {
  const rows = [];
  const at = new Map();
  for (const d of list) { if (at.has(d.key)) continue; at.set(d.key, rows.length); rows.push(Object.freeze({ key: d.key, dueAt: d.dueAt })); }
  return Object.freeze({ rows: Object.freeze(rows), at, head: 0, gone: NO_KEYS, size: rows.length });
}
const NO_KEYS = Object.freeze(new Set());
const DQ_EMPTY = dqOf([]);
/** Is `key` a pending due row? O(1). */
function dqHas(q, key) { const i = q.at.get(key); return i !== undefined && i >= q.head && !q.gone.has(key); }
/** The pending rows from the head, in order (a generator: a caller that stops early pays for what it read). */
function* dqIter(q) { for (let i = q.head; i < q.rows.length; i++) { const d = q.rows[i]; if (!q.gone.has(d.key)) yield d; } }
/** Every pending row as a list — O(due): a merge's rebuild, and the gate's oracle. */
function dqRows(q) { return [...dqIter(q)]; }
/** The queue without `key` (its fetch began): the head moves past it, or it is `gone` — O(1 + gone). */
function dqDrop(q, key) {
  if (!dqHas(q, key)) return q;
  const i = q.at.get(key);
  let head = q.head, gone = q.gone;
  if (i === head) {
    head++;
    while (head < q.rows.length && gone.has(q.rows[head].key)) head++;
    if (head > i + 1) gone = new Set([...gone].filter((k) => q.at.get(k) >= head));   // the gone rows the head passed
  } else { gone = new Set(gone); gone.add(key); }
  return Object.freeze({ rows: q.rows, at: q.at, head, gone, size: q.size - 1 });
}
/** The pass's fetches (rule 13's `fetchedAt`): an APPEND-ONLY log shared down a pass, each snapshot seeing its first
 *  `n` entries — what a snapshot sees never changes. A write from a snapshot that is not the log's tip (a fork: the
 *  gate re-applying an older snapshot) copies its own `n` entries first. */
function fetchLog() { return Object.freeze({ log: { keys: [], ats: [], idx: new Map() }, n: 0 }); }
function fetchLogAdd(f, key, at) {
  let log = f.log;
  if (log.keys.length !== f.n) {   // a fork: another snapshot wrote past this one
    log = { keys: log.keys.slice(0, f.n), ats: log.ats.slice(0, f.n), idx: new Map() };
    log.keys.forEach((k, i) => { const xs = log.idx.get(k); if (xs) xs.push(i); else log.idx.set(k, [i]); });
  }
  log.keys.push(key); log.ats.push(at);
  const xs = log.idx.get(key);
  if (xs) xs.push(f.n); else log.idx.set(key, [f.n]);
  return Object.freeze({ log, n: f.n + 1 });
}
/** When this pass last fetched `key` (as this snapshot sees it), or undefined. */
function fetchedAt(p, key) {
  const f = p.fetched;
  const xs = f && f.log.idx.get(key);
  if (!xs) return undefined;
  for (let j = xs.length - 1; j >= 0; j--) if (xs[j] < f.n) return f.log.ats[xs[j]];
  return undefined;
}

/** A pass begins. `backoff` = the account is inside a vendor back-off and the
 *  pass is not forced; `timerDue` = a tick handed the timer's turn to whoever
 *  runs next; `hostScan` = the account reads through a scan lane. */
function open(snap, { origin = 'timer', force = false, backoff = false, timerDue = false, hostScan = false } = {}) {
  const timerWork = !backoff && (origin !== 'request' || !!timerDue);
  return {
    ...snap,
    pass: {
      origin, force: !!force, backoff: !!backoff, timerWork, turnPending: timerWork,
      due: DQ_EMPTY, fetched: fetchLog(), inflight: null, last: null, streak: 0, calls: 0, fetches: 0, vendorCalls: 0,
      discovery: { wanted: false, done: false }, hostScan: { wanted: !!hostScan, done: false },
      feed: { wanted: false, done: false, pages: 0, perPass: FEED_PAGES_PER_PASS },
      recheck: { armed: false, pending: [], done: 0, perPass: RECHECK_PER_PASS },
      pressKey: null, failed: null, cut: false,
    },
  };
}
/** Does the pass take the timer's turn before its next step? (its opening
 *  turn, or a tick that found it busy while due — never inside a back-off) */
function wantsTurn(snap, timerDue) {
  const p = snap.pass;
  return !!(p && !p.backoff && !p.failed && !p.cut && !p.inflight && (p.turnPending || timerDue));
}
/** RULE 13 — merge due rows into the pending list (pending keys keep their
 *  place, new ones join the tail in the list's order). */
function mergeDue(p, rows, requests) {
  const out = [];
  const pending = new Set();
  if (p.inflight && p.inflight.key) pending.add(p.inflight.key);
  const grouped = new Set();
  for (const r of requests) if (r.taken) grouped.add(r.key);
  for (const d of rows || []) {
    if (!d || typeof d.key !== 'string' || !d.key) continue;
    if (dqHas(p.due, d.key) || pending.has(d.key) || grouped.has(d.key)) continue;
    const dueAt = Number(d.dueAt) || 0;
    const f = fetchedAt(p, d.key);
    if (f !== undefined && !(dueAt > f)) continue;   // fetched this pass and not due again
    out.push({ key: d.key, dueAt });
    pending.add(d.key);
  }
  return out.length ? dqOf(dqRows(p.due).concat(out)) : p.due;   // a merge that names nothing new keeps the queue (a hint per fetch costs its own rows)
}
/** RULE 21 — the feed's rows go AHEAD of the plain due rows, in the page's order: a pending key moves up, a key in
 *  flight or with a taken group is left where it is (it is served already), a key this pass fetched only when a hit is
 *  NEWER than that fetch (rule 13). */
function mergeFront(p, rows, requests) {
  const skip = new Set();
  if (p.inflight && p.inflight.key) skip.add(p.inflight.key);
  for (const r of requests) if (r.taken) skip.add(r.key);
  const front = [];
  const moved = new Set();
  for (const d of rows || []) {
    if (!d || typeof d.key !== 'string' || !d.key || moved.has(d.key) || skip.has(d.key)) continue;
    const dueAt = Number(d.dueAt) || 0;
    const f = fetchedAt(p, d.key);
    if (f !== undefined && !(dueAt > f)) continue;   // fetched this pass and no newer hit
    front.push({ key: d.key, dueAt });
    moved.add(d.key);
  }
  return dqOf(front.concat(dqRows(p.due).filter((d) => !moved.has(d.key))));
}
/** THE TIMER'S TURN: the due list by the clock NOW (and whether discovery / the change feed is due). */
function turn(snap, { due = [], discoveryDue = false, feedDue = false, feedPerPass = FEED_PAGES_PER_PASS, recheckDue: rd = [], recheckPerPass = RECHECK_PER_PASS } = {}) {
  const p = snap.pass;
  if (!p || p.backoff || p.failed || p.cut) return snap;
  const q = { ...p, timerWork: true, turnPending: false };
  q.due = mergeDue(q, due, snap.requests);
  if (!q.discovery.done && (q.force || discoveryDue)) q.discovery = { wanted: true, done: false };
  // RULE 21: the timer's turn marks the feed wanted (once per pass — a done feed is not re-armed by a later turn)
  const f0 = q.feed || { wanted: false, done: false, pages: 0, perPass: FEED_PAGES_PER_PASS };
  if (feedDue && !f0.done && !f0.wanted) q.feed = { ...f0, wanted: true, perPass: Math.max(1, Math.floor(Number(feedPerPass) || FEED_PAGES_PER_PASS)) };
  // RULE 22a: the timer's turn arms the recheck ONCE per pass (a later turn never re-arms it)
  const r0 = q.recheck || { armed: false, pending: [], done: 0, perPass: RECHECK_PER_PASS };
  if (!r0.armed) {
    const keys = [];
    for (const d of Array.isArray(rd) ? rd : []) { const k = d && typeof d === 'object' ? d.key : d; if (typeof k === 'string' && k && !keys.includes(k)) keys.push(k); }
    q.recheck = { ...r0, armed: true, pending: keys, perPass: Math.max(0, Math.floor(Number(recheckPerPass) || 0)) };
  }
  return { ...snap, pass: q };
}
/** Close a pass without a step (the engine's crash path). */
function close(snap) { return snap.pass ? { ...snap, pass: null } : snap; }

/** RULE 6's grouping: one slot per conversation. */
function slotOf(r) { return r.key; }

/** The pending items WITH waiters, one per slot — O(requests): the due queue is asked, never walked (lane
 *  channel-drain-scale). A slot on a pending due row is that row's item (`due`, a rider); any other is `fresh` while its
 *  first waiter is untaken (rule 5 judges it). The plain due rows stay in the queue, in its order (`queueOf`). */
function itemsOf(s, reqs) {
  const p = s.pass;
  const map = new Map();
  const order = [];
  for (const r of reqs) {
    const slot = slotOf(r);
    let it = map.get(slot);
    if (!it) { const due = dqHas(p.due, slot); it = { slot, key: r.key, due, reqs: [], fresh: !due && !r.taken }; map.set(slot, it); order.push(it); }
    it.reqs.push(r);
  }
  for (const it of order) {
    it.human = it.reqs.some((r) => isHuman(r.origin));
    it.minSeq = it.reqs.length ? Math.min(...it.reqs.map((r) => r.seq)) : Infinity;
  }
  return order;
}
/** RULE 5 — one untaken group's verdict. */
function verdict(s, g, pressFree) {
  const human = g.reqs.some((r) => isHuman(r.origin));
  const owner = g.reqs.some((r) => r.origin === 'owner');
  let pressed = false;
  if (s.pass.backoff) {
    if (owner && pressFree) pressed = true;
    else return { refuse: true, code: 'backoff', rule: 'backoff' };   // THE BACK-OFF GATE
  }
  if (!human && !(s.agentShare.remaining > 0)) return { refuse: true, code: 'vendor-budget', rule: 'share' };   // THE AGENT SHARE
  if (!(s.budget.remainingUnits > 0)) return { refuse: true, code: 'vendor-budget', rule: 'budget' };   // THE VENDOR BUDGET
  if (!human) { const last = Number(s.floors && s.floors[g.key]) || 0; if (last && s.now - last < s.floorMs) return { refuse: true, code: 'refresh-floor', rule: 'floor' }; }   // THE FLOOR
  return { refuse: false, pressed };
}
/** RULE 21 — may the next step be ONE feed page? */
function feedEligible(s, p, humanWaiting) {
  const f = p.feed;
  if (!f || !f.wanted || f.done || p.backoff || !p.timerWork || humanWaiting) return false;
  if (!(s.budget && s.budget.remainingUnits > 0)) return false;
  if (!(s.feedPages && Number(s.feedPages.remaining) > 0)) return false;
  return f.pages < (Number(f.perPass) || FEED_PAGES_PER_PASS);
}
/** RULE 22a — may the next step be ONE recheck? (only with nothing else pending — the caller asks with an empty queue) */
function recheckEligible(s, p) {
  const r = p.recheck;
  if (!r || !r.pending.length || r.done >= r.perPass || p.backoff || !p.timerWork || p.cut) return false;
  return !!(s.budget && s.budget.remainingUnits > 0);
}
/** RULE 7's order: humans first, then the filing order of the earliest waiter. */
const byRank = (a, b) => (Number(b.human) - Number(a.human)) || (a.minSeq - b.minSeq);
/** RULE 7's queue as a VIEW: the ranked items with waiters, then the plain due rows in the queue's order (a row with
 *  waiters is its item, ranked above) — `length`, `[0]`, `find`, `some` read it from the head, never the whole list. */
function queueOf(waiting, q) {
  const riders = new Set();
  for (const it of waiting) if (it.due) riders.add(it.slot);
  const length = waiting.length + q.size - riders.size;
  function* items() {
    yield* waiting;
    for (const d of dqIter(q)) if (!riders.has(d.key)) yield { slot: d.key, key: d.key, due: true, reqs: [], fresh: false, human: false, minSeq: Infinity };
  }
  const find = (f) => { for (const it of items()) if (f(it)) return it; return undefined; };
  return { length, 0: length ? find(() => true) : undefined, find, some: (f) => find(f) !== undefined };
}

/** THE ONE NEXT ACTION. */
function next(s) {
  const p = s.pass;
  const at = Number(s.now) || 0;
  const none = { at, accept: [], press: null };
  if (!p) return { ...none, type: 'end', ok: false, why: 'closed', waiting: 0, timerWork: false };
  if (p.inflight) throw new Error(`channel-drain: next() while a ${p.inflight.type} is in flight`);
  // 2. stop / drop
  if (s.stopped || s.dropped) {
    const outcome = s.stopped ? 'stopped' : 'account-changed';
    if (s.requests.length) return { ...none, type: 'answer', outcome, waiters: ids(s.requests) };
    return { ...none, type: 'end', ok: false, why: s.stopped ? 'stopped' : 'dropped', waiting: 0, timerWork: p.timerWork };
  }
  // 3. a failed pass
  if (p.failed) {
    const taken = s.requests.filter((r) => r.taken);
    if (taken.length) return { ...none, type: 'answer', outcome: 'failed', code: p.failed, waiters: ids(taken) };
    return { ...none, type: 'end', ok: false, why: p.failed, waiting: 0, timerWork: p.timerWork };
  }
  // 4. not connected
  if (s.connected === false) {
    if (s.requests.length) return { ...none, type: 'answer', outcome: 'not-connected', waiters: ids(s.requests) };
    return { ...none, type: 'end', ok: false, why: 'not-connected', waiting: 0, timerWork: p.timerWork };
  }
  const seen = s.requests;   // every waiter present — judged at the FIRST step that sees it (rule 5)
  const order = itemsOf(s, seen);
  // 5. judgement at sight — every fresh group judged, the first refusal is this step's action
  const pressFree = p.backoff && p.pressKey === null && s.backoff.pressEpoch !== s.backoff.epoch;
  let granted = null;
  const refusals = [];
  for (const g of order) {
    if (!g.fresh) continue;
    const v = verdict(s, g, pressFree && granted === null);
    if (v.refuse) refusals.push({ g, v });
    else if (v.pressed) granted = g.key;
  }
  const refused = new Set(refusals.map((x) => x.g.slot));
  const live = order.filter((it) => !(it.fresh && refused.has(it.slot)));
  const waiting = live.filter((it) => it.reqs.length).sort(byRank);
  const queue = queueOf(waiting, p.due);   // the ranked items with waiters, then the plain due rows — a view of its head
  const first = refusals[0];
  if (first) return { ...none, type: 'refuse', key: first.g.key, code: first.v.code, rule: first.v.rule, waiters: ids(first.g.reqs) };   // AT SIGHT
  const accept = ids(seen.filter((r) => !r.taken && !refused.has(slotOf(r))));   // a refused group is answered, never accepted
  const press = granted || p.pressKey;
  const base = { at, accept, press: granted };
  if (p.cut) return { ...base, type: 'end', ok: p.vendorCalls > 0, why: p.vendorCalls > 0 ? null : 'budget', cut: true, waiting: queue.length, timerWork: p.timerWork };
  // 12. discovery — once, with the timer's work, never ahead of a waiting human
  const humanWaiting = waiting.some((it) => it.human);
  // 21. the change feed — the timer's work, never ahead of a waiting human, its own minute and per-pass bound, BEFORE discovery
  if (feedEligible(s, p, humanWaiting)) return paced(s, base, { ...base, type: 'feed' });
  if (p.discovery.wanted && !p.discovery.done && !humanWaiting && s.budget.remainingUnits > 0) return paced(s, base, { ...base, type: 'discover' });
  // 22a. the recent-roots recheck — nothing else pending (the lowest priority), the timer's work, the minute, paced
  if (!queue.length && recheckEligible(s, p)) return paced(s, base, { ...base, type: 'recheck', key: p.recheck.pending[0] });
  // 16. nothing pending
  if (!queue.length) {
    const idle = p.backoff && p.fetches === 0;
    return { ...base, type: 'end', ok: !idle, why: idle ? 'backoff' : null, waiting: 0, timerWork: p.timerWork };
  }
  // 9. the budget per call — the cut
  if (!(s.budget.remainingUnits > 0)) {
    if (seen.length) return { ...base, type: 'refuse', key: null, code: 'vendor-budget', rule: 'cut', cut: true, waiters: ids(seen) };   // THE CUT: every accepted waiter, by name
    return { ...base, type: 'end', ok: p.vendorCalls > 0, why: p.vendorCalls > 0 ? null : 'budget', cut: true, waiting: queue.length, timerWork: p.timerWork };
  }
  // 15. the bound
  const duePending = queue.some((it) => it.due);
  if (!duePending && p.streak >= STREAK_MAX) return { ...base, type: 'end', ok: true, why: null, carry: true, waiting: 0, timerWork: p.timerWork };   // THE BOUND
  // 14. the host scan, before the first fetch
  if (p.hostScan.wanted && !p.hostScan.done) return paced(s, base, { ...base, type: 'scanHost' });
  // 7 + 8. the pick: the queue's head, or — right after a request-class fetch — the first due row
  let pick = queue[0];
  if (p.last === 'request' && !pick.due) { const t = queue.find((it) => it.due); if (t) pick = t; }   // THE INTERLEAVE
  // 5, at the fetch: inside a back-off a vendor call is the owner's press ALONE — an item whose owner left (its bound's `pending`) is refused, the press not spent
  if (p.backoff && !pick.reqs.some((r) => r.origin === 'owner')) return { ...base, type: 'refuse', key: pick.key, code: 'backoff', rule: 'backoff', waiters: ids(pick.reqs) };
  // 11. the share per fetch
  if (!pick.due && !pick.human && !(s.agentShare.remaining > 0)) return { ...base, type: 'refuse', key: pick.key, code: 'vendor-budget', rule: 'share', waiters: ids(pick.reqs) };
  // 18. the pace — the pick waits for the bucket; the next step picks again
  return paced(s, base, {
    ...base, type: 'fetch', key: pick.key,
    chargeTo: pick.due ? 'timer' : pick.human ? 'owner' : 'agent',
    waiters: ids(pick.reqs),   // THE ROUND
    due: pick.due, rider: pick.due && pick.reqs.length > 0, pressed: press !== null && pick.key === press,
    recheck: pick.reqs.some((r) => r.origin === 'owner'),   // 22b: the owner's press re-lists the conversation at once
  });
}

/** THE NEXT SNAPSHOT. `result` omitted = an async action BEGINS. */
function apply(snap, act, result) {
  let requests = snap.requests;
  const p = snap.pass ? { ...snap.pass } : null;
  if (act.accept && act.accept.length) {
    const A = new Set(act.accept);
    requests = requests.map((r) => (!r.taken && A.has(r.id) ? { ...r, taken: true } : r));
  }
  if (p && act.press) p.pressKey = act.press;
  const drop = (list) => { if (!list || !list.length) return; const D = new Set(list); requests = requests.filter((r) => !D.has(r.id)); };
  switch (act.type) {
    case 'refuse':
      drop(act.waiters);
      if (act.cut && p) p.cut = true;
      break;
    case 'answer':
      drop(act.waiters);
      break;
    case 'end':
      return { ...snap, requests, pass: null };
    case 'wait':   // rule 18: the engine sleeps between two steps — nothing about the pass moves
      break;
    case 'feed':   // RULE 21: one page — its rows ahead of the plain due rows, `more` keeps it wanted, a skip ends it (never the pass)
      if (!p) break;
      if (result === undefined) { p.inflight = { type: 'feed', key: null }; break; }
      p.inflight = null;
      if (result && result.noCall) { p.feed = { ...p.feed, wanted: false, done: true }; break; }
      p.vendorCalls++;
      if (result && result.error) { p.failed = String(result.error); break; }
      p.feed = { ...p.feed, pages: (Number(p.feed && p.feed.pages) || 0) + 1 };
      // lane gmail-feed-gap: a cursor feed's CATCH-UP is ONE action with its pages (the adapter walks them, each paced and
      // metered through the gate) — counted in `walked`, never re-armed in its pass (`more` is not its to say)
      if (result && result.catchUp) { p.feed = { ...p.feed, walked: (Number(p.feed.walked) || 0) + Math.max(1, Math.floor(Number(result.pages) || 1)), catchUp: true }; if (Array.isArray(result.due) && result.due.length) p.due = mergeFront(p, result.due, requests); p.feed = { ...p.feed, wanted: false, done: true }; break; }
      if (result && result.skip) { p.feed = { ...p.feed, wanted: false, done: true, skipped: String(result.skip) }; break; }
      if (result && Array.isArray(result.due) && result.due.length) p.due = mergeFront(p, result.due, requests);
      { const more = !!(result && result.more) && p.feed.pages < (Number(p.feed.perPass) || FEED_PAGES_PER_PASS); p.feed = { ...p.feed, wanted: more, done: !more }; }
      break;
    case 'recheck':   // RULE 22a: one page — the key leaves the pending list when it begins; an error is rule 3
      if (!p) break;
      if (result === undefined) { p.inflight = { type: 'recheck', key: act.key }; p.recheck = { ...p.recheck, pending: p.recheck.pending.filter((k) => k !== act.key) }; break; }
      p.inflight = null;
      p.vendorCalls++;
      p.recheck = { ...p.recheck, done: (Number(p.recheck.done) || 0) + 1 };
      if (result && result.error) { p.failed = String(result.error); break; }
      break;
    case 'discover':
    case 'scanHost':
      if (!p) break;
      if (result === undefined) { p.inflight = { type: act.type, key: null }; break; }
      p.inflight = null;
      p.vendorCalls++;
      if (result && result.error) { p.failed = String(result.error); break; }
      if (act.type === 'discover') {
        p.discovery = { wanted: false, done: true };
        if (result && Array.isArray(result.due)) p.due = mergeDue(p, result.due, requests);
      } else p.hostScan = { wanted: false, done: true };
      break;
    case 'fetch':
      if (!p) break;
      if (result === undefined) {   // the round is fixed; the key leaves the pending list
        p.inflight = { type: 'fetch', key: act.key };
        p.due = dqDrop(p.due, act.key);
        break;
      }
      p.inflight = null;
      p.calls++;
      p.vendorCalls++;
      p.fetched = fetchLogAdd(p.fetched, act.key, act.at);
      p.last = act.due ? (act.waiters.length ? 'rider' : 'plain') : 'request';
      p.streak = act.due ? 0 : p.streak + 1;
      if (result && result.error) { p.failed = String(result.error); break; }   // rule 3 answers the round with the rest
      drop(act.waiters);   // answered by the engine at this fetch (its ok, or the conversation's refusal)
      if (result && result.ok) p.fetches++;
      if (p.timerWork && result && Array.isArray(result.hints) && result.hints.length) p.due = mergeDue(p, result.hints.map((k) => ({ key: String(k), dueAt: -1 })), requests);
      break;
    default:
      throw new Error(`channel-drain: no such action ${act && act.type}`);
  }
  return { ...snap, requests, pass: p };
}


// ── RULE 19: HISTORY ON DEMAND — one conversation's older-history memory ──
/** A conversation's empty memory: never asked, nothing in flight, nothing remembered. */
function olderEmpty() { return { askedAt: 0, inflight: false, exhaustedAt: 0 }; }
/**
 * THE VERDICT on one more `/older` for a conversation whose LOCAL log ran out
 * (the caller answers from the log first and asks here only past its start):
 *   { act: 'join' }                    an ask is in flight — wait for it and read the log it fills
 *   { act: 'exhausted' }               the vendor said "nothing older" and nothing changed since — no call
 *   { act: 'floor', retryAfterMs }     the last vendor ask was under OLDER_FLOOR_MS ago — no call, the wait named
 *   { act: 'vendor' }                  ask the vendor (the budget and the pace are judged after this)
 * Join first (an ask in flight answers everyone), then the memory, then the floor.
 */
function olderVerdict(mem, now) {
  const m = mem || olderEmpty();
  const t = Number(now) || 0;
  if (m.inflight) return { act: 'join' };
  const ex = Number(m.exhaustedAt) || 0;
  if (ex > 0 && t - ex < OLDER_MEMORY_MS) return { act: 'exhausted' };
  const asked = Number(m.askedAt) || 0;
  if (asked > 0 && t - asked < OLDER_FLOOR_MS) return { act: 'floor', retryAfterMs: Math.min(OLDER_FLOOR_MS, Math.max(1, OLDER_FLOOR_MS - (t - asked))) };   // never longer than the floor (a clock that went backwards)
  return { act: 'vendor' };
}
/**
 * THE MEMORY'S ONLY MOVER. `ask` (a vendor ask starts: the floor's clock and the flight), `landed`
 * ({ exhausted }: the flight ended with the vendor's answer — an `exhausted` one is remembered, any
 * other clears the memory), `failed` (the flight ended without an answer — nothing remembered, the
 * floor's clock kept), `changed` (a record appended / a refresh / a re-authorization: the memory is
 * forgotten, the floor's clock kept — a new record never makes a vendor ask cheaper). Returns the next
 * memory; never mutates the one given.
 */
function olderApply(mem, ev, now) {
  const m = { ...(mem || olderEmpty()) };
  const t = Number(now) || 0;
  const type = ev && typeof ev === 'object' ? ev.type : ev;
  switch (type) {
    case 'ask': return { ...m, askedAt: t, inflight: true };
    case 'landed': return { ...m, inflight: false, exhaustedAt: ev && ev.exhausted ? t : 0 };
    case 'failed': return { ...m, inflight: false };
    case 'changed': return { ...m, exhaustedAt: 0 };
    default: throw new Error(`channel-drain: no such older event ${type}`);
  }
}

// ── RULE 20: THE REACTION TRICKLE + THE THREAD WALK (lane channel-threads, 2026-09-28) ──
/**
 * 20. METERED READS A WINDOW CAUSES ABOUT MESSAGES (spec §3.3 / §6.1). Lark has no reactions in any message
 *     answer (L4): one `GET messages/:id/reactions` per message — a 50-row page would be 50 units of a 60/min
 *     budget. And a thread's replies are not in the chat listing (L3): one `container_id_type=thread` walk per
 *     thread. Both are asked ONLY by an open window (a person looking), and both are bounded here:
 *     20b THE REACTION LIST, per MESSAGE: a list in flight is JOINED (one flight per message); a message asked
 *         inside `floorMs` (REACTIONS_FLOOR_MS, 300 s) is refused `reactions-floor` (the local fold answers);
 *         a batch holds at most REACTIONS_BATCH_MAX ids; and per ACCOUNT at most `perMinute` list REQUESTS in any
 *         rolling minute (THE CEILING, a setting — default 20, a third of Lark's 60/min default) — judged
 *         FIRST, before the minute's vendor budget (rule 9), so a scrolling reader can never spend the minute
 *         the timer's message passes need; past it the rest of the batch is refused `vendor-budget` (rule
 *         `ceiling`) with the wait. `perMinute` 0 = never list (events only). The ceiling is RESERVED when a
 *         batch is judged (never predicted to refund). verify r3: a list is PAGED (Lark ≤ 3 requests) — the engine
 *         charges its extra pages as it lands (`rxReserve` per page) and a batch that overshoots gives back EXACTLY the
 *         slots of the rows it then never sends (`rxRelease`) — the ceiling counts requests, never lists.
 *     20a THE THREAD WALK, per THREAD: one flight (a second ask joins), at most once per `floorMs`
 *         (THREAD_FLOOR_MS, 60 s — `thread-floor` with the wait), never from a timer and never from an agent's
 *         `read` (the routes' rule — this model only answers "may a walk start now").
 *     Rules 9 (the minute) and 18 (the pace) stay the OUTER caps: the engine asks them before each call.
 */
const REACTIONS_FLOOR_MS = 300e3;
const REACTIONS_PER_MINUTE = 20;
const REACTIONS_BATCH_MAX = 20;
const THREAD_FLOOR_MS = 60e3;
/** A message's reaction memory: never asked, nothing in flight, never fetched. */
function rxEmpty() { return { askedAt: 0, inflight: false, fetchedAt: 0 }; }
/** The account's ROLLING minute of reaction list calls as of `now`: `{calls: [instants in the last 60 s], n, at}`
 *  (`at` = the oldest one — the next slot frees 60 s after it). A SLIDING window: no 60 s span ever holds more than
 *  the ceiling (a tumbling one would let two halves of adjacent minutes hold twice as many). */
function rxMinuteAt(minute, now) {
  const t = Number(now) || 0;
  const calls = (minute && Array.isArray(minute.calls) ? minute.calls : []).map(Number).filter((x) => Number.isFinite(x) && x <= t && t - x < 60e3).sort((a, b) => a - b);
  return { calls, n: calls.length, at: calls.length ? calls[0] : t };
}
/**
 * RULE 20b's VERDICT on one window's batch. `mem(id)` → a message's memory (rxEmpty when unknown).
 * → `{ ask: [ids to fetch now], join: [ids in flight], refused: [{id, code, rule, retryAfterMs}], minute }` —
 * `minute` is the account's minute AFTER the reservation (the engine stores it). Order: join, floor, ceiling.
 */
function reactionsVerdict({ ids = [], mem = () => null, now = 0, floorMs = REACTIONS_FLOOR_MS, perMinute = REACTIONS_PER_MINUTE, minute = null } = {}) {
  const t = Number(now) || 0;
  let m = rxMinuteAt(minute, t);
  const ask = [], join = [], refused = [];
  const seen = new Set();
  const cap = Math.max(0, Math.floor(Number(perMinute) || 0));
  for (const raw of Array.isArray(ids) ? ids.slice(0, REACTIONS_BATCH_MAX) : []) {
    const id = String(raw || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const x = mem(id) || rxEmpty();
    if (x.inflight) { join.push(id); continue; }                                                          // ONE FLIGHT
    const asked = Number(x.askedAt) || 0;
    if (asked > 0 && t - asked < floorMs && t >= asked) { refused.push({ id, code: 'reactions-floor', rule: 'floor', retryAfterMs: Math.max(1, floorMs - (t - asked)) }); continue; }   // THE FLOOR
    if (m.n >= cap) { refused.push({ id, code: 'vendor-budget', rule: 'ceiling', retryAfterMs: cap ? Math.max(1, m.at + 60e3 - t) : null }); continue; }   // THE CEILING (judged before the budget)
    m = rxReserve(m, t);
    ask.push(id);
  }
  for (const raw of Array.isArray(ids) ? ids.slice(REACTIONS_BATCH_MAX) : []) refused.push({ id: String(raw || ''), code: 'bad-request', rule: 'batch', retryAfterMs: null });
  return { ask, join, refused, minute: m };
}
/** Reserve ONE list call of the minute at `now` (the verdict's reservation; an unreact's list-first call). */
function rxReserve(minute, now) {
  const m = rxMinuteAt(minute, now);
  const calls = m.calls.concat([Number(now) || 0]);
  return { calls, n: calls.length, at: calls[0] };
}
/** Give back `n` of the reservations made at `at` (verify r3): a batch cut part-way returns the slots of the rows it
 *  never sent — EXACT (those calls did not happen), never a prediction; the newest such reservations go first. */
function rxRelease(minute, n, at, now) {
  const m = rxMinuteAt(minute, now);
  let k = Math.max(0, Math.floor(Number(n) || 0));
  const calls = m.calls.slice();
  for (let i = calls.length - 1; i >= 0 && k > 0; i--) if (calls[i] === Number(at)) { calls.splice(i, 1); k--; }
  return { calls, n: calls.length, at: calls.length ? calls[0] : Number(now) || 0 };
}
/** RULE 20b's memory mover: `ask` (a flight starts: the floor's clock), `landed` (the vendor answered —
 *  fetchedAt), `failed` (no answer — nothing remembered but the floor's clock). Never mutates its input. */
function rxApply(mem, ev, now) {
  const m = { ...(mem || rxEmpty()) };
  const t = Number(now) || 0;
  switch (ev) {
    case 'ask': return { ...m, askedAt: t, inflight: true };
    case 'landed': return { ...m, inflight: false, fetchedAt: t };
    case 'failed': return { ...m, inflight: false };
    default: throw new Error(`channel-drain: no such reactions event ${ev}`);
  }
}
/** RULE 20a — may a thread walk start now? `{act:'join'}` | `{act:'floor', retryAfterMs}` | `{act:'vendor'}`. */
function threadVerdict(mem, now, floorMs = THREAD_FLOOR_MS) {
  const m = mem || rxEmpty();
  const t = Number(now) || 0;
  if (m.inflight) return { act: 'join' };
  const asked = Number(m.askedAt) || 0;
  if (asked > 0 && t >= asked && t - asked < floorMs) return { act: 'floor', retryAfterMs: Math.max(1, floorMs - (t - asked)) };
  return { act: 'vendor' };
}
/** RULE 20a's mover (the same three events). */
function threadApply(mem, ev, now) { return rxApply(mem, ev, now); }

// ── RULE 21: THE CHANGE FEED (lane lark-search-poll, 2026-09-28) ──
/**
 * 21. THE CHANGE FEED (lane lark-search-poll, B-5aab, 2026-09-28 — design §27):
 *     an account whose feed is on reads its change feed with the TIMER's work
 *     only — `turn(snap, {feedDue:true})` marks it wanted; never inside a
 *     back-off (rule 5's opening), never on a request-only pass without the
 *     timer's turn. ONE `feed` action = ONE vendor page; at most `perPass`
 *     pages per pass (`turn`'s `feedPerPass`); a page is sent only with the
 *     minute unspent (rule 9) AND `feedPages.remaining > 0` (the feed's own
 *     sliding-minute ceiling — spent ⇒ the feed simply waits: nobody waits on
 *     it) AND no human waiting (a human's fetch goes first, rule 7) — and
 *     paced (rule 18, cost `feed`). It runs BEFORE discovery (rule 12) and
 *     before any plain due-row fetch. Its result `{due:[{key, dueAt}], more}`
 *     places its keys AHEAD of the pass's plain due rows (a pending key moves
 *     up, in the page's order); a key this pass already fetched is due again
 *     only when a hit is NEWER than that fetch (rule 13's `dueAt >
 *     fetchedAt`, with `dueAt` = the hit's instant); `more` keeps the feed
 *     wanted for the next page. A FEED-LOCAL refusal (`{skip: code}` — the
 *     vendor refused the SEARCH: its scope, its own rate tier, its shape)
 *     ends the feed for this pass and NEVER fails the pass: the
 *     per-conversation polling is the fallback and the search's tier is not
 *     the messages API's — a search that does not answer (a 5xx, a timeout;
 *     verify r1) is the FEED's failure too. An ACCOUNT failure (`{error}`: a
 *     dead token) is rule 3. `{noCall:true}` = the engine found nothing to ask
 *     (a clock that went backwards) — no vendor call is counted. The feed is
 *     nobody's request, so the agent route's retry-able table gains no code.
 *     The page token and the window are the engine's (the drain never sees a
 *     cursor — the discovery precedent).
 *     21a (lane gmail-feed-gap, B-5134): a CURSOR feed after a gap answers a
 *     CATCH-UP — `{due, pages, catchUp:true}`: ONE action whose pages the
 *     adapter walked from the cursor (each paced and metered through the
 *     gate); `walked` counts them, its rows go ahead like a page's, and it
 *     ends the feed for the pass (never re-armed by `more`). The tiers stay
 *     parked meanwhile (channel-caps `feedState`), so the pass's plain due
 *     rows are the clock's few — never the whole index.
 *     The step is `next`'s (after the cut, before discovery), the merge `mergeFront`, the move `apply`'s `feed`.
 */

// ── RULE 22: THE RECENT-ROOTS RECHECK (lane lark-threads, 2026-10-01) ──
/**
 * 22. THE RECENT-ROOTS RECHECK (lane lark-threads A2 — the owner: "这个帖子应该是有个thread的，但显然你这里没展示出来"):
 *     where thread replies are listed SEPARATELY, a message stored before anyone answered it in a thread carries no
 *     thread id — the vendor names the topic on its root only once the topic exists, and the conversation's own walk
 *     stops at its stored anchor, so the root is never listed again. The recheck re-lists the conversation's NEWEST
 *     page (no anchor stop) and offers it to the store's place door (a stored root widens to its new thread; the
 *     thread is then owed — rule 20's walk). WHEN, decided here:
 *     22a THE TIMER'S RECHECK: `recheckDue(rows, {now, everyMs, activeMs, max})` names the conversations due — live
 *         (never paused, never unlisted), on a separately-listed adapter, not a topic group (every message there is a
 *         topic already), walked at least once (a first walk reads that page anyway), active within `activeMs`
 *         (RECHECK_ACTIVE_MS — a quiet conversation's newest page grows no new topic) and not rechecked within
 *         `everyMs` (the setting `channels.threadRecheckSec`, default 3600) — the oldest recheck first, at most `max`.
 *         `turn(snap, {recheckDue})` arms them ONCE per pass; `next` sends `{type:'recheck', key}` ONLY when nothing
 *         else is pending (no waiter, no due row — the lowest priority: a recheck never delays a human or a due
 *         row), with the timer's work, never inside a back-off, with the minute unspent (rule 9), paced (rule 18), at
 *         most `recheckPerPass` (RECHECK_PER_PASS) per pass, a key at most once per pass. Its result: `{}` done,
 *         `{skip}` (a conversation-level refusal — the pass goes on), `{error}` = rule 3.
 *     22b THE OWNER'S PRESS: a fetch whose round holds the OWNER's request (origin 'owner' — never a window's open,
 *         never an agent's refresh: a recheck is a metered call the owner pays for) carries `recheck: true` — the
 *         engine re-lists that conversation right after its ingest, unless `recheckOnPress(lastRecheckAt, now)`
 *         says it was rechecked within RECHECK_FLOOR_MS.
 */
const RECHECK_PER_PASS = 3;
const RECHECK_EVERY_MS = 3600e3;
const RECHECK_ACTIVE_MS = 14 * 86400e3;
const RECHECK_FLOOR_MS = 60e3;
const RECHECK_DUE_MAX = 200;
/**
 * RULE 22a's DUE LIST. rows = [{key, live, separate, mode, walked, lastRecheckAt, lastAt}] (the engine's index read).
 * → [{key, dueAt}] — the due ones, oldest recheck first (never rechecked = 0), at most `max`.
 */
function recheckDue(rows, { now = 0, everyMs = RECHECK_EVERY_MS, activeMs = RECHECK_ACTIVE_MS, max = RECHECK_DUE_MAX } = {}) {
  const t = Number(now) || 0;
  const every = Math.max(60e3, Number(everyMs) || RECHECK_EVERY_MS);
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.key !== 'string' || !r.key) continue;
    if (r.live !== true || r.separate !== true || r.mode === 'topic' || r.walked !== true) continue;
    const lastAt = Number(r.lastAt) || 0;
    if (!(lastAt > 0) || t - lastAt > activeMs) continue;
    const last = Number(r.lastRecheckAt) || 0;
    if (last > t) continue;   // a clock that went backwards rechecks nothing
    if (last && t - last < every) continue;
    out.push({ key: r.key, dueAt: last });
  }
  out.sort((a, b) => a.dueAt - b.dueAt || (a.key < b.key ? -1 : 1));
  return out.slice(0, Math.max(0, Math.floor(Number(max) || 0)));
}
/** RULE 22b — may the owner's press re-list this conversation now? (never twice inside RECHECK_FLOOR_MS) */
function recheckOnPress(lastRecheckAt, now, floorMs = RECHECK_FLOOR_MS) {
  const last = Number(lastRecheckAt) || 0, t = Number(now) || 0;
  return !(last > 0 && t >= last && t - last < floorMs);
}

module.exports = {
  RECHECK_PER_PASS, RECHECK_EVERY_MS, RECHECK_ACTIVE_MS, RECHECK_FLOOR_MS, RECHECK_DUE_MAX, recheckDue, recheckOnPress,
  REFRESH_QUEUE_CAP, REFRESH_OWNER_RESERVE, STREAK_MAX, ORIGINS, REFUSAL_CODES, ANSWER_OUTCOMES, PACE_WAIT_MAX_MS, FEED_PAGES_PER_PASS,
  OLDER_FLOOR_MS, OLDER_MEMORY_MS, OLDER_EVENTS,
  empty, admit, withdraw, census, hasRequests, takenRequests, queueAsk,
  open, wantsTurn, turn, close, next, apply, mergeFront,
  // lane channel-drain-scale: the pass's due queue and fetch log (the gate's oracle reads and builds them)
  dueRows: (pass) => (pass ? dqRows(pass.due) : []), dueQueue: dqOf, fetchLog, fetchLogAdd, fetchedAt,
  paceFresh, paceLevel, paceNeed, paceWaitMs, paceCharge, paceCost,
  olderEmpty, olderVerdict, olderApply,
  // lane channel-threads: rule 20
  REACTIONS_FLOOR_MS, REACTIONS_PER_MINUTE, REACTIONS_BATCH_MAX, THREAD_FLOOR_MS,
  rxEmpty, rxMinuteAt, rxReserve, rxRelease, reactionsVerdict, rxApply, threadVerdict, threadApply,
};
