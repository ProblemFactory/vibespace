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
 *               due: [{ key, dueAt }] (the timer's PENDING rows, fetch order),
 *               fetchedAt: { key: at } (this pass's fetch instants),
 *               inflight: null|{ type, key }, last: null|'request'|'rider'|
 *               'plain' (the class of the previous fetch), streak (request-
 *               class fetches since the last due-row fetch), calls, fetches
 *               (ingests that succeeded), vendorCalls, discovery: { wanted,
 *               done }, hostScan: { wanted, done }, pressKey, failed, cut }
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
 *   { type: 'scanHost' }                                   the scan lane's host facts
 *   { type: 'fetch', key, chargeTo: 'timer'|'owner'|'agent', waiters, due,
 *     rider, pressed }                                     ONE conversation
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

/** A pass begins. `backoff` = the account is inside a vendor back-off and the
 *  pass is not forced; `timerDue` = a tick handed the timer's turn to whoever
 *  runs next; `hostScan` = the account reads through a scan lane. */
function open(snap, { origin = 'timer', force = false, backoff = false, timerDue = false, hostScan = false } = {}) {
  const timerWork = !backoff && (origin !== 'request' || !!timerDue);
  return {
    ...snap,
    pass: {
      origin, force: !!force, backoff: !!backoff, timerWork, turnPending: timerWork,
      due: [], fetchedAt: {}, inflight: null, last: null, streak: 0, calls: 0, fetches: 0, vendorCalls: 0,
      discovery: { wanted: false, done: false }, hostScan: { wanted: !!hostScan, done: false },
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
  const out = p.due.slice();
  const pending = new Set(out.map((d) => d.key));
  if (p.inflight && p.inflight.key) pending.add(p.inflight.key);
  const grouped = new Set();
  for (const r of requests) if (r.taken) grouped.add(r.key);
  for (const d of rows || []) {
    if (!d || typeof d.key !== 'string' || !d.key) continue;
    if (pending.has(d.key) || grouped.has(d.key)) continue;
    const dueAt = Number(d.dueAt) || 0;
    const f = p.fetchedAt[d.key];
    if (f !== undefined && !(dueAt > f)) continue;   // fetched this pass and not due again
    out.push({ key: d.key, dueAt });
    pending.add(d.key);
  }
  return out;
}
/** THE TIMER'S TURN: the due list by the clock NOW (and whether discovery is due). */
function turn(snap, { due = [], discoveryDue = false } = {}) {
  const p = snap.pass;
  if (!p || p.backoff || p.failed || p.cut) return snap;
  const q = { ...p, timerWork: true, turnPending: false };
  q.due = mergeDue(q, due, snap.requests);
  if (!q.discovery.done && (q.force || discoveryDue)) q.discovery = { wanted: true, done: false };
  return { ...snap, pass: q };
}
/** Close a pass without a step (the engine's crash path). */
function close(snap) { return snap.pass ? { ...snap, pass: null } : snap; }

/** RULE 6's grouping: one slot per conversation. */
function slotOf(r) { return r.key; }

/** The pending items: every due row, every key with waiters (one per slot);
 *  `fresh` items are untaken groups with no pending item (rule 5 judges them). */
function itemsOf(s, reqs) {
  const p = s.pass;
  const map = new Map();
  const order = [];
  for (const d of p.due) { const it = { slot: d.key, key: d.key, due: true, reqs: [], fresh: false }; map.set(it.slot, it); order.push(it); }
  for (const r of reqs) {
    const slot = slotOf(r);
    let it = map.get(slot);
    if (!it) { it = { slot, key: r.key, due: false, reqs: [], fresh: !r.taken }; map.set(slot, it); order.push(it); }
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
/** RULE 7's order: humans first, then the filing order of the earliest waiter. */
const byRank = (a, b) => (Number(b.human) - Number(a.human)) || (a.minSeq - b.minSeq);

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
  const plain = live.filter((it) => it.due && !it.reqs.length);
  const queue = waiting.concat(plain);
  const first = refusals[0];
  if (first) return { ...none, type: 'refuse', key: first.g.key, code: first.v.code, rule: first.v.rule, waiters: ids(first.g.reqs) };   // AT SIGHT
  const accept = ids(seen.filter((r) => !r.taken && !refused.has(slotOf(r))));   // a refused group is answered, never accepted
  const press = granted || p.pressKey;
  const base = { at, accept, press: granted };
  if (p.cut) return { ...base, type: 'end', ok: p.vendorCalls > 0, why: p.vendorCalls > 0 ? null : 'budget', cut: true, waiting: queue.length, timerWork: p.timerWork };
  // 12. discovery — once, with the timer's work, never ahead of a waiting human
  const humanWaiting = waiting.some((it) => it.human);
  if (p.discovery.wanted && !p.discovery.done && !humanWaiting && s.budget.remainingUnits > 0) return paced(s, base, { ...base, type: 'discover' });
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
        p.due = p.due.filter((d) => d.key !== act.key);
        break;
      }
      p.inflight = null;
      p.calls++;
      p.vendorCalls++;
      p.fetchedAt = { ...p.fetchedAt, [act.key]: act.at };
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

module.exports = {
  REFRESH_QUEUE_CAP, REFRESH_OWNER_RESERVE, STREAK_MAX, ORIGINS, REFUSAL_CODES, ANSWER_OUTCOMES, PACE_WAIT_MAX_MS,
  empty, admit, withdraw, census, hasRequests, takenRequests, queueAsk,
  open, wantsTurn, turn, close, next, apply,
  paceFresh, paceLevel, paceNeed, paceWaitMs, paceCharge, paceCost,
};
