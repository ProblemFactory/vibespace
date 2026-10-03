#!/usr/bin/env node
// THE DRAIN GATE (fast; lane R2 verify r9 — docs/design-communication-panel.zh.md §6.5, the r9 note).
// Seven adversarial rounds (r2–r8) each found ONE money-class defect in the refresh / drain SCHEDULING
// of src/server/channels-engine.js, every rewrite of an imperative, async-interleaved scheduler
// growing a new ORDERING bug. r9 moved the decision into PURE src/channel-drain.js (a step function
// over a snapshot — `next` names the one next action, `apply` returns the next snapshot) and this
// suite pins it with no engine, no store, no clock of its own:
//   ① THE WALK — a simulated driver that drives the model EXACTLY as the engine does (facts before
//      every step, the vendor call between two steps, arrivals only while a call is in flight,
//      engine-like stop / drop settlement), ≥ 48 seeds × 3000 steps over four profiles (mixed —
//      half its seeds also run lane lark-search-poll's change feed, rule 21 — storms, tight budget +
//      back-offs, PACED — lane R5's per-second bucket, rule 18),
//      asserting every one of the model's 18 rules at EVERY step
//      against an independent oracle (the judgement, the pick, the round, the merge), plus
//      exactly-once answers, honest `ok`s and liveness once the arrivals stop — and that each rule
//      was actually EXERCISED (a walk that never met a back-off proves nothing about it);
//   ② THE TABLES — the r2–r8 repros as deterministic scenarios in the model's own terms: the
//      70-cell concurrency table (7 states × 2 origins × {1, 5×2, 20×2} callers), the foreign-pass
//      lie (r2), the back-off door (r3), N concurrent refreshes of one key (r4), the owner's one
//      press per window (r4 ruling), the drain at every step (r5), the budget cut (r5/r6), the
//      storm that denied the owner (r6), the refusal at the pass's end (r6), the ok at its fetch
//      (r7), the forced passes run thrice (r7), the interleave (r7), LIFO / owner-last / no-ride
//      (r8), the stop that kept fetching (r8 low), discovery ahead of a human (r8 low), the share
//      per fetch and the bound (r9);
//   ②b THE PACE (rule 18, lane R5 — the owner: "gmail一直被限速 你可能要控制下gmail默认的读取速度") —
//      the first ingest of 873 conversations at 40 units each under the Gmail defaults (40 units/s,
//      a 3000/min budget): every row fetched once, no second holds more than 80 units (one second's
//      worth + one fetch), no 60 s more than 2440, ≈ 872 s of wall clock — and the SAME walk with the
//      pace off is the burst the vendor refused — the minute's 3000 units in 1.5 s, 2040 of them inside one
//      second (the control); a human filed
//      during a wait is the next fetch, a refusal is never held behind a wait, a wait never counts
//      toward the bound, a call larger than the bucket waits for a full one, the minute stays the
//      outer cap;
//   ③ FAIRNESS — under a saturating request stream the i-th due row is fetched after at most i
//      request-class fetches; a lone request behind 873 due rows waits for at most ONE due fetch;
//      with the due rows exhausted a pass ends after exactly STREAK_MAX request fetches;
//   ④ MUTANTS — a patched COPY of the model per rule (scripts/mutant-copy.mjs, scratch only), each
//      turning its own leg red: the walk's named invariant AND the table / repro it protects;
//   ④d RULE 22 (lane lark-threads) — the recent-roots recheck: the PURE due list + the press floor, the order (the lowest
//      priority), the per-pass bound, no recheck in a back-off / request-only / spent minute, skip vs rule 3, the OWNER's
//      press only; four mutants (ahead of the queue, unbounded, a key twice, any press) each red in its row AND the walk;
//   ④c RULE 21 (lane lark-search-poll) — the change feed as a table (the order: a human first, the
//      feed's pages, discovery, the feed's rows, the plain rows; its own minute; the budget; a skip
//      never fails the pass; rule 3; no page on a request-only or back-off pass; the per-pass bound;
//      rule 13's newer-hit re-add) + a mutant per clause (the walk names it AND the row goes red);
//   ⑤ THE CENSUS — the model imports nothing and reads no clock; every code it can name is in the
//      agent route's retry-able status table and the CLI's refused set; the engine spells no
//      scheduling of its own (one `Drain.next`, one `Drain.admit`, none of r7/r8's machinery).
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODEL = 'src/channel-drain.js';
const SRC = fs.readFileSync(path.join(REPO, MODEL), 'utf8');
const D0 = require(path.join(REPO, MODEL));

let passN = 0, failN = 0;
const ok = (c, n, extra) => { if (c) { passN++; console.log('  ✓ ' + n); } else { failN++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 900) : '')); } return !!c; };
const J = (x) => JSON.stringify(x);

// ── the rule numbers the spec states (the constants are asserted equal below, never trusted) ──
const CAP = 200, RESERVE = 20, K = 25;
const T0 = Date.UTC(2026, 8, 26, 12, 0, 0);
const BACKOFF = [0, 30e3, 120e3, 300e3, 900e3];
/** Rule 18's owner-facing numbers (lane R5): the Gmail adapter's default pace — 40 quota units a second, a one-second bucket. */
const GMAIL_PACE = Object.freeze({ unitsPerSec: 40, burst: 40 });
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const isHuman = (o) => o === 'owner' || o === 'open';
const idsOf = (rs) => rs.map((r) => r.id);
const sameSet = (a, b) => { const A = new Set(a || []), B = new Set(b || []); if (A.size !== B.size) return false; for (const x of A) if (!B.has(x)) return false; return true; };
const keyOf = (i) => `acct/c${String(i).padStart(4, '0')}`;

// ═══ THE SIM: one account driven through the model exactly as the engine drives it ═══════════
function createSim(D, o = {}) {
  const rnd = o.rnd || mulberry32(o.seed || 1);
  const ri = (n) => Math.floor(rnd() * n);
  const W = {
    now: o.now ?? T0, keys: new Map(), limit: o.limit ?? 1e6, minuteAt: o.now ?? T0, spent: 0, agent: 0,
    sharePct: o.sharePct ?? 25, floorMs: o.floorMs ?? 20e3,
    backoff: { until: o.backoffUntil ?? 0, epoch: o.epoch ?? 0, pressEpoch: -1, failures: o.failures ?? 0 },
    stopped: false, dropped: false, connected: true, discoveryDue: false, timerDue: false,
    fail: o.fail || null, refuse: o.refuse || null, hints: o.hints || null,
    latency: o.latency ?? 20, units: o.units ?? 1, hostScan: !!o.hostScan,
    // rule 18 (lane R5): the per-second bucket — the SIM's own arithmetic (never the model's helpers), `sends` = every vendor call's instant + units
    pace: o.pace ? { unitsPerSec: o.pace.unitsPerSec, burst: o.pace.burst } : null, discoverUnits: o.discoverUnits ?? 1, sends: [], waits: [],
    // rule 21 (lane lark-search-poll): the change feed — its own sliding minute (`calls`), its per-pass bound, and the
    // SIM's vendor answer (`answer(api)` → {due, more} | {skip} | {error}); `feedDue` = the tick says a page is due
    feed: o.feed ? { perPass: o.feed.perPass ?? 5, perMin: o.feed.perMin ?? 10, calls: [], answer: o.feed.answer || null } : null, feedDue: !!o.feed,
    // rule 22 (lane lark-threads): the recent-roots recheck — the keys the engine's PURE due list names at a turn
    // (`due(api)` → [{key, dueAt}]), its per-pass bound, the SIM's vendor answer (`answer(api, key)` → {} | {skip} | {error})
    recheck: o.recheck ? { perPass: o.recheck.perPass ?? 3, due: o.recheck.due || (() => []), answer: o.recheck.answer || null } : null,
  };
  if (W.pace) W.bucket = { tokens: W.pace.burst, at: W.now };
  const lvl = (t) => Math.min(W.pace.burst, W.bucket.tokens + ((t - W.bucket.at) * W.pace.unitsPerSec) / 1000);
  const costOf = (type) => (type === 'fetch' ? W.units : type === 'discover' ? W.discoverUnits : 1);
  /** rule 21: the feed pages left in its sliding minute (the SIM's own count, never the model's helper) */
  const feedLeft = () => (W.feed ? W.feed.perMin - W.feed.calls.filter((x) => x <= W.now && W.now - x < 60e3).length : 0);
  const needOf = (type) => Math.min(costOf(type), W.pace.burst);
  const nKeys = o.keys ?? 45;
  for (let i = 0; i < nKeys; i++) W.keys.set(keyOf(i), { key: keyOf(i), cadence: o.cadenceOf ? o.cadenceOf(i) : 30e3, last: o.lastOf ? o.lastOf(i) : W.now - 31e3, named: false });
  let snap = D.empty();
  const waiters = new Map();
  const fetches = [];          // every vendor fetch: { key, chargeTo, due, rider, waiters, pass, beginTick, idx }
  const vendorLog = [];        // every vendor call of any kind, in order
  const violations = [];
  const cover = {};
  const bump = (r, n = 1) => { cover[r] = (cover[r] || 0) + n; };
  const V = (rule, msg) => { bump('violation:' + rule); if (violations.length < 40) violations.push(`${rule}: ${msg}`); };
  let nextId = 1, steps = 0, passNo = 0, evt = 0, queued = null;
  const queuedList = [];       // rule 17: the passes queued behind the running one (never more than one)
  let maxCost = 1;
  let charged = 0;   // the units THIS sim's calls charged in the current window (a table may pre-spend W.spent by hand)
  const minute = () => { if (W.now - W.minuteAt >= 60e3) { if (charged >= W.limit + maxCost) V('9-window', `a minute window's calls charged ${charged} of ${W.limit} (a call may start while units remain, so < limit + one call)`); W.minuteAt = W.now; W.spent = 0; W.agent = 0; charged = 0; } };
  const shareLimit = () => (W.sharePct >= 100 ? Infinity : Math.max(1, Math.floor((W.limit * W.sharePct) / 100)));
  const facts = () => {
    minute();
    const floors = {};
    for (const r of snap.requests) floors[r.key] = (W.keys.get(r.key) || {}).last || 0;
    const pace = W.pace ? { unitsPerSec: W.pace.unitsPerSec, burst: W.pace.burst, tokens: W.bucket.tokens, lastRefillAt: W.bucket.at, cost: { fetch: W.units, discover: W.discoverUnits, scanHost: 1 } } : null;
    return { now: W.now, stopped: W.stopped, dropped: W.dropped, connected: W.connected, backoff: { epoch: W.backoff.epoch, pressEpoch: W.backoff.pressEpoch }, budget: { remainingUnits: W.limit - W.spent }, agentShare: { remaining: shareLimit() - W.agent }, floors, floorMs: W.floorMs, pace, ...(W.feed ? { feedPages: { remaining: feedLeft() } } : {}) };
  };
  const charge = (by, units) => { minute(); W.spent += units; charged += units; if (by === 'agent') W.agent += units; };
  const dueList = (all) => {
    const out = [];
    for (const k of W.keys.values()) {
      if (all || k.named) { out.push({ key: k.key, dueAt: k.named ? -1 : 0 }); continue; }
      const dueAt = k.last + k.cadence;
      if (dueAt <= W.now) out.push({ key: k.key, dueAt });
    }
    out.sort((a, b) => a.dueAt - b.dueAt || (a.key < b.key ? -1 : 1));
    return out;
  };
  const answer = (w, outcome, how) => {
    if (w.answer) { V('20-once', `waiter ${w.id} answered twice (${J(w.answer)} then ${J(outcome)})`); return; }
    w.answer = outcome; w.answeredAt = W.now; w.answeredTick = ++evt; w.answeredStep = steps; w.answeredFetch = fetches.length; w.how = how;
  };
  /** RULE 1 — file one request (the engine's requestRefresh). */
  const file = (origin, key) => {
    const id = nextId++;
    const untaken = snap.requests.filter((r) => !r.taken).length;
    const cap = origin === 'agent' ? CAP - RESERVE : CAP;
    const a = D.admit(snap, { id, key, origin, at: W.now });
    const w = { id, key, origin, filedAt: W.now, filedTick: ++evt, filedStep: steps, filedFetch: fetches.length, answer: null };
    waiters.set(id, w);
    if (!a.ok) {
      if (untaken < cap) V('1-admission', `${origin} refused with ${untaken} untaken (cap ${cap})`);
      if (a.refused !== 'refresh-queue-full' || a.queued !== untaken) V('1-admission', `the refusal says ${J(a)}, ${untaken} untaken`);
      bump(isHuman(origin) ? '1-human-refused-at-cap' : '1-agent-refused');
      answer(w, { code: 'refresh-queue-full' }, 'admission');
      return w;
    }
    if (untaken >= cap) V('1-admission', `${origin} admitted with ${untaken} untaken (cap ${cap})`);
    if (isHuman(origin) && untaken >= CAP - RESERVE) bump('1-human-in-reserve');
    snap = a.snap;
    return w;
  };
  const withdraw = (id, outcome = { pending: true }) => { const w = waiters.get(id); snap = D.withdraw(snap, id); if (w && !w.answer) answer(w, outcome, 'withdraw'); };
  const lostCheck = (beforeIds, where) => {
    const now = new Set(snap.requests.map((r) => r.id));
    for (const id of beforeIds) if (!now.has(id)) { const w = waiters.get(id); if (!w || !w.answer) V('22-lost', `waiter ${id} left the model with no answer (${where})`); }
  };
  /** THE ORACLE — the rules written again from the spec, never from the model. */
  const oracle = (s, pv) => {
    const dueKeys = new Set(s.pass.due.map((d) => d.key));
    const takenKeys = new Set(s.requests.filter((r) => r.taken).map((r) => r.key));
    const groups = new Map();   // fresh groups: untaken requests on a key with no pending item, filing order of the key's first request
    for (const r of s.requests) {
      if (r.taken || dueKeys.has(r.key) || takenKeys.has(r.key)) continue;
      if (!groups.has(r.key)) groups.set(r.key, []);
      groups.get(r.key).push(r);
    }
    let pressLeft = s.pass.backoff && pv.pressKey === null && s.backoff.pressEpoch !== s.backoff.epoch;
    const refusals = [];
    let pressed = null;
    for (const [key, rs] of groups) {
      const human = rs.some((r) => isHuman(r.origin)), owner = rs.some((r) => r.origin === 'owner');
      let code = null, rule = null, isPress = false;
      if (s.pass.backoff) { if (owner && pressLeft) isPress = true; else { code = 'backoff'; rule = 'backoff'; } }
      if (!code && !human && !(s.agentShare.remaining > 0)) { code = 'vendor-budget'; rule = 'share'; }
      if (!code && !(s.budget.remainingUnits > 0)) { code = 'vendor-budget'; rule = 'budget'; }
      if (!code && !human) { const last = Number(s.floors[key]) || 0; if (last && s.now - last < s.floorMs) { code = 'refresh-floor'; rule = 'floor'; } }
      if (code) refusals.push({ key, code, rule, ids: idsOf(rs) });
      else if (isPress) { pressLeft = false; pressed = key; }
    }
    // the queue, every request accepted: items by key
    const items = new Map();
    for (const d of s.pass.due) items.set(d.key, { key: d.key, due: true, dueAt: d.dueAt, reqs: [] });
    for (const r of s.requests) { if (!items.has(r.key)) items.set(r.key, { key: r.key, due: false, reqs: [] }); items.get(r.key).reqs.push(r); }
    const all = [...items.values()];
    for (const it of all) { it.human = it.reqs.some((r) => isHuman(r.origin)); it.minSeq = it.reqs.length ? Math.min(...it.reqs.map((r) => r.seq)) : Infinity; }
    const waitingItems = all.filter((it) => it.reqs.length).sort((a, b) => (Number(b.human) - Number(a.human)) || (a.minSeq - b.minSeq));
    const plain = s.pass.due.filter((d) => !items.get(d.key).reqs.length).map((d) => items.get(d.key));
    const queue = waitingItems.concat(plain);
    const head = queue[0] || null;
    let pick = head, redirect = false;
    if (head && pv.last === 'request' && !head.due) { const t = queue.find((it) => it.due); if (t) { pick = t; redirect = t !== head; } }
    return { refusals, pressed, waitingItems, plain, queue, head, pick, redirect, duePending: queue.some((it) => it.due) };
  };
  /** Every rule, checked on the step's decision. */
  const check = (s, act, pv) => {
    const present = new Set(s.requests.map((r) => r.id));
    for (const id of act.waiters || []) if (!present.has(id)) V('20-once', `the ${act.type} names ${id}, not a waiting request`);
    if (s.stopped || s.dropped) {
      bump('2-stop-drop');
      if (s.requests.length) { if (!(act.type === 'answer' && sameSet(act.waiters, idsOf(s.requests)) && act.outcome === (s.stopped ? 'stopped' : 'account-changed'))) V('2-stop', `stopped/dropped with ${s.requests.length} waiting, the step was ${J(act).slice(0, 160)}`); else bump('2-answered-all'); }
      else if (act.type !== 'end' || act.why !== (s.stopped ? 'stopped' : 'dropped')) V('2-stop', `stopped/dropped with nothing waiting, the step was ${act.type}`);
      return;
    }
    if (pv.failed) {
      bump('3-failed');
      const taken = s.requests.filter((r) => r.taken);
      if (taken.length) { if (!(act.type === 'answer' && act.outcome === 'failed' && sameSet(act.waiters, idsOf(taken)))) V('3-failed', `a failed pass's step was ${J(act).slice(0, 160)}`); }
      else if (act.type !== 'end' || act.ok) V('3-failed', `a failed pass with no taken waiter did ${act.type}`);
      return;
    }
    if (s.connected === false) {
      bump('4-not-connected');
      if (s.requests.length ? !(act.type === 'answer' && act.outcome === 'not-connected' && sameSet(act.waiters, idsOf(s.requests))) : act.type !== 'end') V('4-not-connected', act.type);
      return;
    }
    const O = oracle(s, pv);
    if (O.refusals.length) {
      const f = O.refusals[0];
      bump('5-refused'); bump('5-refused-' + f.rule);
      if (!(act.type === 'refuse' && act.code === f.code && act.rule === f.rule && sameSet(act.waiters, f.ids))) V('5-at-sight', `the oracle refuses ${f.key} (${f.rule}) at this step, the model did ${J(act).slice(0, 200)}`);
      return;
    }
    // rule 5 at the fetch: inside a back-off an item whose owner left is refused, never fetched for whoever rode it
    const ownerLeft = act.type === 'refuse' && act.rule === 'backoff' && s.pass.backoff && !s.requests.some((r) => r.key === act.key && r.origin === 'owner') && s.requests.filter((r) => r.key === act.key).every((r) => r.taken);
    if (ownerLeft) { bump('5-owner-left'); if (!sameSet(act.waiters, idsOf(s.requests.filter((r) => r.key === act.key)))) V('5-owner-left', 'the refusal misses a waiter of the key'); return; }
    if (act.type === 'refuse' && ['backoff', 'budget', 'floor'].includes(act.rule)) V('5-at-sight', `a judgement refusal (${act.rule} on ${act.key}) the oracle does not make`);
    if (!sameSet(act.accept, idsOf(s.requests.filter((r) => !r.taken)))) V('5-accept', `a step accepted ${J(act.accept)} of untaken ${J(idsOf(s.requests.filter((r) => !r.taken)))}`);
    if (act.press !== (O.pressed || null) && !(act.press === null && O.pressed === null)) V('5-press', `the press granted to ${act.press}, the oracle's ${O.pressed}`);
    if (O.pressed) bump('5-press-granted');
    if (pv.cutPending) { if (act.type !== 'end' || !act.cut) V('9-cut', `the step after a cut was ${act.type}`); return; }
    const vendorCall = act.type === 'fetch' || act.type === 'discover' || act.type === 'scanHost' || act.type === 'feed' || act.type === 'recheck';
    // RULE 22 — the recent-roots recheck, from the SIM's own facts: only with NOTHING pending (no waiter, no due row), the
    // timer's work, never in a back-off, the minute unspent, ≤ perPass a pass, a key the turn armed, never twice a pass
    const recheckOk = !!W.recheck && pv.recheckArmed.length > 0 && !O.queue.length && !s.pass.backoff && pv.timerWork && s.budget.remainingUnits > 0 && pv.rechecks < W.recheck.perPass && !pv.cutPending;
    if (act.type === 'recheck' || (act.type === 'wait' && act.next === 'recheck')) {
      if (act.type === 'recheck') bump('r22-recheck');
      if (!W.recheck) V('r22-undeclared', 'a recheck on an account with no recheck');
      if (O.queue.length) V('r22-order', `a recheck with ${O.queue.length} item(s) pending (a waiter or a due row goes first)`);
      if (s.pass.backoff || !pv.timerWork) V('r22-timer', 'a recheck without the timer\'s work (or inside a back-off)');
      if (!(s.budget.remainingUnits > 0)) V('r22-budget', 'a recheck with the minute spent');
      if (W.recheck && pv.rechecks >= W.recheck.perPass) V('r22-per-pass', `recheck ${pv.rechecks + 1} of a pass bounded at ${W.recheck.perPass}`);
      if (!pv.recheckArmed.includes(act.key)) V('r22-unarmed', `a recheck of ${act.key}, never armed by this pass's turn`);
      if (pv.rechecked.includes(act.key)) V('r22-twice', `${act.key} rechecked twice in one pass`);
      if (act.type === 'recheck' && pv.recheckArmed[0] !== act.key) V('r22-order', `rechecked ${act.key}, the oldest armed is ${pv.recheckArmed[0]}`);
    } else if (recheckOk && act.type === 'end' && !act.cut) V('r22-skipped', `the pass ended with ${pv.recheckArmed.length} armed recheck(s) and nothing else pending`);
    if (act.type === 'fetch') {
      const owner = s.requests.some((r) => r.key === act.key && r.origin === 'owner');
      if (!!act.recheck !== owner) V('r22-press', `the fetch of ${act.key} says recheck ${!!act.recheck}, its round holds the owner ${owner}`);
      else if (owner) bump('r22-press');
    }
    // RULE 21 — the change feed, from the SIM's own facts (never the model's helper)
    const f21 = s.pass.feed || {};
    const feedWanted = !!(f21.wanted && !f21.done);
    const humanW = O.waitingItems.some((it) => it.human);
    const feedOk = feedWanted && !s.pass.backoff && pv.timerWork && !humanW && s.budget.remainingUnits > 0 && feedLeft() > 0 && pv.feedPages < (W.feed ? W.feed.perPass : 5);
    if (act.type === 'feed' || (act.type === 'wait' && act.next === 'feed')) {
      if (act.type === 'feed') bump('f21-feed');
      if (!W.feed) V('f21-undeclared', 'a feed page on an account with no feed');
      if (humanW) V('f21-human', 'a feed page while a human waits');
      if (!(s.budget.remainingUnits > 0)) V('f21-budget', 'a feed page with the minute spent');
      if (!(feedLeft() > 0)) V('f21-minute', `a feed page with its own minute spent (${W.feed ? W.feed.calls.length : 0} calls)`);
      if (W.feed && pv.feedPages >= W.feed.perPass) V('f21-per-pass', `page ${pv.feedPages + 1} of a pass bounded at ${W.feed.perPass}`);
      if (!pv.timerWork || s.pass.backoff) V('f21-timer', 'a feed page without the timer\'s work (or inside a back-off)');
      if (!feedWanted) V('f21-unwanted', 'a feed page nobody asked for');
    } else if (feedOk && !pv.cutPending && (['fetch', 'discover', 'scanHost', 'end'].includes(act.type) || act.type === 'wait') && !(act.type === 'end' && act.cut)) {
      V('f21-order', `the feed was due (page ${pv.feedPages + 1}) and the step was ${act.type}${act.key ? ' ' + act.key : ''}`);
    }
    if (feedWanted && !feedOk) { if (humanW) bump('f21-human-first'); if (feedLeft() <= 0 && W.feed) bump('f21-minute-spent'); }
    if (vendorCall && !(s.budget.remainingUnits > 0)) V('9-budget', `a ${act.type} with ${s.budget.remainingUnits} units left`);
    if (!(s.budget.remainingUnits > 0) && O.queue.length) {
      if (s.requests.length) { if (!(act.type === 'refuse' && act.rule === 'cut' && sameSet(act.waiters, idsOf(s.requests)))) V('9-cut', `the minute spent with ${s.requests.length} accepted waiters, the step was ${J(act).slice(0, 160)}`); else bump('9-cut'); }
      else if (act.type !== 'end' || !act.cut) V('9-cut', `the minute spent, nothing to refuse, the step was ${act.type}`);
    }
    // RULE 18 — THE PACE, from the sim's own bucket
    if (s.pace) {
      const level = lvl(s.now);
      if (vendorCall) {
        if (level + 1e-6 < needOf(act.type)) V('18-pace', `a ${act.type} sent with ${level.toFixed(3)} tokens, it needs ${needOf(act.type)} (cost ${costOf(act.type)}, burst ${W.pace.burst})`);
        else bump('18-sent-paced');
        if (costOf(act.type) > W.pace.burst) bump('18-over-burst');
        if (pv.lastWait && (pv.lastWait.next !== act.type || (pv.lastWait.key || null) !== (act.key || null))) bump('18-repick');
        pv.lastWait = null;
      }
      if (act.type === 'wait') {
        bump('18-wait');
        const short = needOf(act.next) - level;
        if (!(short > 1e-6)) V('18-needless-wait', `a wait for a ${act.next} with ${level.toFixed(3)} tokens ≥ the ${needOf(act.next)} it needs`);
        const exact = W.pace.unitsPerSec > 0 ? Math.ceil((short * 1000) / W.pace.unitsPerSec) : 1000;
        if (!(act.ms >= 1 && act.ms <= 1000) || act.ms > Math.min(1000, exact) + 1) V('18-wait-ms', `waited ${act.ms} ms for a shortfall of ${short.toFixed(3)} at ${W.pace.unitsPerSec}/s (≤ min(1000, ${exact}))`);
        if (act.next === 'fetch') {
          const pk = O.pick;
          if (!pk || act.key !== pk.key) V('18-wait-pick', `the wait holds ${act.key}, the rules pick ${pk && pk.key}`);
          else if ((s.pass.backoff && !pk.reqs.some((r) => r.origin === 'owner')) || (!pk.due && !pk.human && !(s.agentShare.remaining > 0))) V('18-wait-before-refusal', `a wait before ${pk.key}'s refusal at the fetch`);
          else bump('18-wait-fetch');
        } else if (act.next === 'discover') {
          if (pv.discovered || !pv.timerWork || O.waitingItems.some((it) => it.human)) V('18-wait-pick', 'a wait for a discovery the rules do not run');
          else bump('18-wait-discover');
        } else if (act.next === 'feed') {
          bump('18-wait-feed');
        } else if (act.next === 'recheck') {
          bump('18-wait-recheck');
        } else if (act.next === 'scanHost') {
          if (pv.scanned || pv.calls || !W.hostScan) V('18-wait-pick', 'a wait for a host scan the rules do not run');
        } else V('18-wait-pick', `a wait for ${act.next}`);
        pv.lastWait = { next: act.next, key: act.key || null };
      }
    } else if (act.type === 'wait') V('18-pace', 'a wait with no pace declared');
    if (act.type === 'discover') {
      bump('12-discover');
      if (pv.discovered) V('12-once', 'a second discovery in one pass');
      if (!pv.timerWork) V('12-timer', 'discovery without the timer\'s work');
      if (O.waitingItems.some((it) => it.human)) V('12-human', 'discovery while a human waits');
    }
    if (act.type === 'scanHost') { bump('14-scan'); if (pv.scanned) V('14-once', 'a second host scan'); if (pv.calls) V('14-first', 'a host scan after a fetch'); }
    if (act.type === 'fetch' && W.hostScan && !pv.scanned) V('14-first', 'a fetch before the host scan');
    if (act.type === 'end') {
      if (act.carry) { bump('15-carry'); if (!(pv.streak >= K && !O.duePending)) V('15-bound', `carried with streak ${pv.streak}, due pending ${O.duePending}`); }
      else if (!act.cut) {
        if (s.requests.length || s.pass.due.length) V('16-end', `ended with ${s.requests.length} waiting and ${s.pass.due.length} due`);
        const idle = s.pass.backoff && pv.okFetches === 0;
        if (act.ok === idle || (idle && act.why !== 'backoff')) V('16-end', `a ${idle ? 'fetchless back-off' : 'working'} pass ended ${J(act)}`);
        if (idle) bump('16-backoff-end');
      }
    }
    if (act.type === 'fetch' && O.duePending === false && pv.streak >= K) V('15-bound', `a request-class fetch past the bound (streak ${pv.streak})`);
    if (act.type === 'fetch') {
      bump('fetch');
      const item = O.queue.find((it) => it.key === act.key);
      if (!item) { V('7-pick', `fetched ${act.key}, not a pending item`); return; }
      if (!sameSet(act.waiters, idsOf(s.requests.filter((r) => r.key === act.key)))) V('10-round', `the fetch of ${act.key} answers ${J(act.waiters)}, its key's waiters are ${J(idsOf(s.requests.filter((r) => r.key === act.key)))}`);
      if (act.key !== O.pick.key) V('7-pick', `fetched ${act.key}, the rules pick ${O.pick.key} (head ${O.head.key}, last ${pv.last})`);
      if (O.redirect) bump('8-interleave');
      if (O.waitingItems.some((it) => it.human) && O.waitingItems.some((it) => !it.human)) bump('7-humans-and-agents');
      if (O.waitingItems.filter((it) => it.human === O.waitingItems[0]?.human).length > 1) bump('7-fifo-choice');
      const expCharge = item.due ? 'timer' : item.human ? 'owner' : 'agent';
      if (act.chargeTo !== expCharge) V('11-charge', `charged ${act.chargeTo}, expected ${expCharge}`);
      if (act.chargeTo === 'agent' && !(s.agentShare.remaining > 0)) V('11-share', 'an agent fetch with the share spent');
      if (item.due && item.reqs.length) bump('6-ride');
      if (pv.last === 'request' && O.duePending && !act.due) V('8-I1', 'two request-class fetches in a row with a due row pending');
      if (pv.last === 'plain' && O.waitingItems.length && !item.reqs.length) V('8-I2', 'two plain due rows in a row with a requested item pending');
      if (s.pass.backoff) { bump('5-press-fetch'); if (!act.pressed || act.chargeTo !== 'owner') V('5-backoff-fetch', `a back-off fetch ${J(act).slice(0, 120)}`); if (pv.pressFetched && pv.pressFetched !== act.key) V('5-one-press', `a second key pressed in one pass (${pv.pressFetched}, ${act.key})`); }
      const f = pv.fetchedAt[act.key];
      if (f !== undefined) {
        const newRound = act.waiters.length > 0 && act.waiters.every((id) => waiters.get(id).filedTick > pv.fetchTick[act.key]);
        const dueRow = s.pass.due.find((d) => d.key === act.key);
        const dueAgain = !!dueRow && dueRow.dueAt > f;
        if (!newRound && !dueAgain) V('13-refetch', `${act.key} fetched twice in one pass for no new round and no due-again row`);
        else bump(newRound ? '10-new-round' : '13-due-again');
      }
    }
  };
  const checkMerge = (rule, before, rows, after, pv, takenKeys) => {
    if (new Set(after.map((d) => d.key)).size !== after.length) V(rule, 'a key twice in the due list');
    if (J(after.slice(0, before.length).map((d) => d.key)) !== J(before.map((d) => d.key))) V(rule, 'a pending due row moved or vanished');
    const pending = new Set(before.map((d) => d.key));
    const added = new Set(after.slice(before.length).map((d) => d.key));
    for (const d of rows) {
      const f = pv.fetchedAt[d.key];
      const want = !pending.has(d.key) && !takenKeys.has(d.key) && !(f !== undefined && !(d.dueAt > f));
      if (want && !added.has(d.key) && !after.some((x) => x.key === d.key)) V(rule, `${d.key} lost by the merge`);
      if (!want && added.has(d.key) && !rows.some((x) => x.key === d.key && x !== d && !pending.has(x.key))) V(rule, `${d.key} merged against the rule (pending ${pending.has(d.key)}, grouped ${takenKeys.has(d.key)}, fetched ${f})`);
      if (want && f !== undefined) bump('13-merged-due-again');
    }
    bump(rule);
  };
  /** The engine's failure bookkeeping (failPass). */
  const failPass = (pv, code) => { W.backoff.failures++; W.backoff.until = W.now + BACKOFF[Math.min(W.backoff.failures, BACKOFF.length - 1)]; if (!pv.wasInBackoff) W.backoff.epoch++; if (W.pace && code === 'rate-limited') W.bucket = { tokens: 0, at: W.now }; };
  const settleAll = (code) => { for (const r of [...snap.requests]) withdraw(r.id, { code }); };
  const hooks = { during: null, afterFetch: null, onStep: null };
  /** One vendor call (between two steps: the world moves while it is in flight). */
  const perform = (act, pv, beginTick) => {
    // rule 18: the call is SENT now — the bucket is charged its cost at this instant (the engine's `pace` → `meter`)
    const units = costOf(act.type);
    maxCost = Math.max(maxCost, units);
    if (W.pace) { const l = lvl(W.now); W.bucket = { tokens: l - units, at: W.now }; }
    W.sends.push({ at: W.now, units });
    if (hooks.during) hooks.during(act, pv); else if (o.during) o.during(act, pv, api);
    W.now += W.latency;
    pv.vendorCalls++;
    vendorLog.push({ type: act.type, key: act.key || null, pass: passNo });
    if (act.type === 'fetch') charge(act.chargeTo, W.units); else charge('timer', units);
    const code = W.fail ? W.fail(act, api) : null;
    if (code) { failPass(pv, code); pv.failed = code; return { error: code }; }
    if (act.type === 'discover') { pv.discovered = true; W.discoveryDue = false; return { due: dueList(snap.pass && snap.pass.force) }; }
    if (act.type === 'feed') {
      W.feed.calls.push(W.sends[W.sends.length - 1].at);   // the page's instant = when it was SENT
      pv.feedPages++;
      const a = W.feed.answer ? W.feed.answer(api, pv) : { due: [], more: false };
      if (a && a.error) { failPass(pv, a.error); pv.failed = a.error; bump('f21-error'); return { error: a.error }; }
      if (a && a.skip) { bump('f21-skip'); pv.feedSkipped = true; return { skip: a.skip }; }
      pv.feedRows = (a && a.due) || [];
      return a;
    }
    if (act.type === 'scanHost') { pv.scanned = true; return {}; }
    if (act.type === 'recheck') {
      pv.rechecks++; pv.rechecked.push(act.key); pv.recheckArmed = pv.recheckArmed.filter((k) => k !== act.key);
      const a = W.recheck.answer ? W.recheck.answer(api, act.key) : {};
      if (a && a.error) { failPass(pv, a.error); pv.failed = a.error; bump('r22-error'); return { error: a.error }; }
      if (a && a.skip) bump('r22-skip');
      return a || {};
    }
    const refused = W.refuse ? W.refuse(act, api) : null;
    const k = W.keys.get(act.key);
    if (refused) { for (const id of act.waiters) { const w = waiters.get(id); if (w && !w.answer) answer(w, { code: refused }, 'conv-refused'); } return { refused, hints: [] }; }
    if (k) k.last = W.now;
    pv.okFetches++;
    for (const id of act.waiters) {
      const w = waiters.get(id);
      if (!w) { V('20-once', `ok to an unknown waiter ${id}`); continue; }
      if (w.answer) continue;   // it left during the fetch (its bound's `pending`): the engine has nobody to tell
      if (w.key !== act.key) V('10-honest', `waiter ${id} of ${w.key} answered by the fetch of ${act.key}`);
      if (w.filedTick >= beginTick) V('10-honest', `waiter ${id} filed during its key's fetch answered by it`);
      answer(w, { ok: true, fetch: fetches.length - 1 }, 'fetch');
    }
    const hints = W.hints ? W.hints(act, api) : [];
    for (const h of hints) { const hk = W.keys.get(h); if (hk) hk.named = true; }
    return { ok: true, appended: 1, hints };
  };
  /** ONE pass, driven like the engine's `pass()`. */
  const runPass = ({ origin = 'timer', force = false } = {}) => {
    passNo++;
    const wasInBackoff = W.backoff.until > W.now;
    const backoff = !force && wasInBackoff;
    if (backoff && !D.hasRequests(snap)) { bump('16-backoff-skip'); return { type: 'end', ok: false, why: 'backoff' }; }
    if (!W.connected && o.walk) bump('4-pass');
    snap = D.open(snap, { origin, force, backoff, timerDue: W.timerDue, hostScan: W.hostScan });
    if (snap.pass.timerWork) W.timerDue = false;
    const pv = { last: null, streak: 0, fetchedAt: {}, fetchTick: {}, discovered: false, scanned: false, pressKey: null, pressFetched: null, cutPending: false, failed: null, okFetches: 0, vendorCalls: 0, calls: 0, backoff, wasInBackoff, timerWork: snap.pass.timerWork, pass: passNo, feedPages: 0, feedSkipped: false, feedRows: null, recheckArmed: [], rechecks: 0, rechecked: [] };
    for (let guard = 0; guard < 20000; guard++) {
      if (D.wantsTurn(snap, W.timerDue)) {
        const before = snap.pass.due;
        W.timerDue = false;
        const rows = dueList(snap.pass.force);
        const takenKeys = new Set(snap.requests.filter((r) => r.taken).map((r) => r.key));
        const rd = W.recheck ? W.recheck.due(api) : [];
        snap = D.turn(snap, { due: rows, discoveryDue: W.discoveryDue, feedDue: !!(W.feed && W.feedDue), feedPerPass: W.feed ? W.feed.perPass : undefined, ...(W.recheck ? { recheckDue: rd, recheckPerPass: W.recheck.perPass } : {}) });
        pv.timerWork = true;
        if (W.recheck && !pv.recheckTurned) { pv.recheckTurned = true; pv.recheckArmed = [...new Set(rd.map((d) => d.key))]; if (pv.recheckArmed.length) bump('r22-armed'); }
        else if (W.recheck && rd.length && pv.recheckTurned) bump('r22-not-rearmed');
        checkMerge('13-turn', before, rows, snap.pass.due, pv, takenKeys);
      }
      const s = { ...snap, ...facts() };
      if (hooks.onStep) hooks.onStep(s, api);
      const act = D.next(s);
      steps++;
      check(s, act, pv);
      if (act.press) pv.pressKey = act.press;
      if (act.type === 'fetch' && act.pressed) pv.pressFetched = pv.pressFetched || act.key;
      let beforeIds = new Set(snap.requests.map((r) => r.id));
      snap = D.apply(snap, act);
      if (act.type === 'end') {
        lostCheck(beforeIds, 'end');
        if (act.ok) { W.backoff.failures = 0; W.backoff.until = 0; }
        if (W.stopped || W.dropped) { snap = D.empty(); W.stopped = false; W.dropped = false; queued = null; queuedList.length = 0; }
        pv.ended = act;
        lastPass = pv;
        return act;
      }
      if (act.type === 'refuse' || act.type === 'answer') {
        for (const id of act.waiters) { const w = waiters.get(id); if (w && !w.answer) answer(w, { code: act.code || act.outcome, rule: act.rule }, act.type); }
        if (act.cut) pv.cutPending = true;
        lostCheck(beforeIds, act.type);
        continue;
      }
      if (act.type === 'wait') {   // rule 18: the engine sleeps — the clock moves, the world may move with it (a request, a stop), nothing is sent
        lostCheck(beforeIds, 'wait');
        W.waits.push(act.ms);
        W.now += act.ms;
        if (hooks.during) hooks.during(act, pv); else if (o.during) o.during(act, pv, api);
        continue;
      }
      const beginTick = ++evt;
      if (act.type === 'fetch') {
        const k = W.keys.get(act.key); if (k) k.named = false;
        if (act.pressed) W.backoff.pressEpoch = W.backoff.epoch;
        fetches.push({ key: act.key, chargeTo: act.chargeTo, due: act.due, rider: act.rider, waiters: act.waiters.slice(), pass: passNo, beginTick, idx: fetches.length });
      }
      const result = perform(act, pv, beginTick);
      beforeIds = new Set(snap.requests.map((r) => r.id));
      const dueBefore = act.type === 'feed' && snap.pass ? snap.pass.due.slice() : null;
      const takenBefore = act.type === 'feed' ? new Set(snap.requests.filter((r) => r.taken).map((r) => r.key)) : null;
      snap = D.apply(snap, act, result);
      if (act.type === 'feed' && snap.pass) {
        if (result && result.skip && snap.pass.failed) V('f21-skip-fails', 'a feed-local refusal failed the pass');
        if (result && Array.isArray(result.due)) {
          // THE FRONT: the eligible rows first, in the page's order; every other pending row after them, in its order
          const want = [];
          for (const d of result.due) { if (want.includes(d.key) || takenBefore.has(d.key)) continue; const f = pv.fetchedAt[d.key]; if (f !== undefined && !(Number(d.dueAt) > f)) { bump('f21-fetched-not-again'); continue; } want.push(d.key); }
          const got = snap.pass.due.map((d) => d.key);
          const rest = dueBefore.map((d) => d.key).filter((k) => !want.includes(k));
          if (J(got) !== J(want.concat(rest))) V('f21-front', `the feed's rows ${J(want)} are not at the front of ${J(got.slice(0, 12))}`);
          else if (want.length && rest.length) bump('f21-front');
          if (want.some((k) => dueBefore.some((d) => d.key === k))) bump('f21-moved-up');
        }
        if (result && result.more && snap.pass.feed.wanted) bump('f21-more');
        if (W.feed && pv.feedPages >= W.feed.perPass && result && result.more) bump('f21-bound-hit');
      }
      lostCheck(beforeIds, act.type + ' completion');
      if (act.type === 'fetch') {
        pv.calls++;
        pv.fetchedAt[act.key] = act.at; pv.fetchTick[act.key] = beginTick;
        pv.last = act.due ? (act.waiters.length ? 'rider' : 'plain') : 'request';
        pv.streak = act.due ? 0 : pv.streak + 1;
        const left = snap.requests.filter((r) => r.key === act.key);
        for (const r of left) if (act.waiters.includes(r.id) && !result.error) V('10-round', `waiter ${r.id} of the round still waiting after its fetch`);
        if (result.hints && result.hints.length && snap.pass && pv.timerWork) bump('13-hints');
        if (hooks.afterFetch) hooks.afterFetch(act, api);
      }
    }
    V('16-end', 'a pass never ended (20 000 steps)');
    return { type: 'end', ok: false, why: 'guard' };
  };
  let lastPass = null;
  /** RULE 17 — a timer / forced ask while a pass runs. */
  const ask = (a) => {
    const q = D.queueAsk(queued, a);
    if (queued) {
      if (!q.joined) V('17-one-queued', 'a second pass queued behind the running one');
      if (q.queued.force !== (queued.force || !!a.force)) V('17-force', `force ${q.queued.force} after asks ${queued.force} + ${!!a.force}`);
      if (q.queued.origin !== queued.origin) V('17-origin', 'the queued origin changed');
      bump('17-joined');
    } else if (q.joined) V('17-one-queued', 'joined nothing');
    if (!q.joined) queuedList.push(q.queued);
    if (queuedList.length > 1) V('17-one-queued', `${queuedList.length} passes queued`);
    queued = q.queued;
  };
  /** Run the queued pass, if any (the engine's `.then(after)`). */
  const runQueued = () => { if (!queued) return null; const q = queued; queued = null; queuedList.length = 0; if (q.force) bump('17-forced-ran'); return runPass({ origin: q.origin, force: q.force }); };
  /** RULE 18's windows over every call SENT: the most units any window of `T` ms held. */
  const maxIn = (T) => { let best = 0, sum = 0, i = 0; const L = W.sends; for (let j = 0; j < L.length; j++) { sum += L[j].units; while (L[j].at - L[i].at > T) { sum -= L[i].units; i++; } if (sum > best) best = sum; } return best; };
  /** …checked against the exact tolerance: burst + rate·T + max(0, the largest call − burst). */
  const windowCheck = () => {
    if (!W.pace) return;
    for (const T of [1000, 10e3, 60e3]) {
      const bound = W.pace.burst + (W.pace.unitsPerSec * T) / 1000 + Math.max(0, maxCost - W.pace.burst) + 1e-6;
      const got = maxIn(T);
      if (got > bound) V('18-window', `${got} units inside ${T / 1000} s — the bound is ${bound.toFixed(2)} (burst ${W.pace.burst}, ${W.pace.unitsPerSec}/s, largest call ${maxCost})`);
      else bump('18-window-' + T / 1000 + 's');
    }
  };
  const api = {
    W, file, withdraw, runPass, runQueued, ask, settleAll, dueList, facts, waiters, fetches, vendorLog, violations, cover, bump, V, rnd, ri, maxIn, windowCheck,
    get snap() { return snap; }, set snap(x) { snap = x; }, get steps() { return steps; }, get passNo() { return passNo; }, get lastPass() { return lastPass; }, hooks,
    /** run request / timer passes until nothing waits (bounded) */
    settle(max = 200) { for (let i = 0; i < max && (D.hasRequests(snap) || queued); i++) { if (queued) { runQueued(); continue; } runPass({ origin: 'request' }); if (D.hasRequests(snap) && W.backoff.until > W.now) W.now = W.backoff.until + 1; if (D.hasRequests(snap) && !(W.limit - W.spent > 0)) W.now += 61e3; } return !D.hasRequests(snap); },
  };
  return api;
}

// ═══ ① THE WALK ═══════════════════════════════════════════════════════════════════════════════
const PROFILES = {
  // lane lark-search-poll: HALF the mixed seeds also run rule 21 — the change feed pages (a bound per pass, its own sliding
  // minute), answering rows (some already pending, some fetched this pass), `more`, feed-local refusals and account
  // failures (folded into this profile, not a fifth one: the gate's tier budget)
  // lane lark-threads: half the mixed seeds (and a third of the paced) also run rule 22 — the recent-roots recheck armed at
  // the timer's turn (0–6 keys, some due again), its per-pass bound, conversation-level skips and account failures
  mixed: { storm: 0.02, arrivals: 0.45, rerequest: 0.12, p429: 0.008, sticky: 0.01, limit: [40, 120, 600, 1e6], share: [5, 25, 100], feedShare: 0.5, feed: { perPass: [1, 2, 5], perMin: [2, 4, 10, 30], pMore: 0.5, pSkip: 0.05, pError: 0.01 }, recheckShare: 0.5, recheck: { perPass: [1, 3], pSkip: 0.05, pError: 0.01 } },
  storms: { storm: 0.08, arrivals: 0.6, rerequest: 0.2, p429: 0.004, sticky: 0.005, limit: [600, 1e6], share: [25, 100] },
  tight: { storm: 0.02, arrivals: 0.5, rerequest: 0.12, p429: 0.03, sticky: 0.04, limit: [12, 25, 40], share: [5, 25] },
  // lane R5: rule 18 on — [unitsPerSec, burst] (a burst of 1 with 2-unit calls = a call larger than the bucket)
  // (lane lark-search-poll: a third of the paced seeds run the change feed too — rule 18 holds a feed page like any call)
  paced: { storm: 0.02, arrivals: 0.45, rerequest: 0.12, p429: 0.01, sticky: 0.01, limit: [40, 120, 600, 1e6], share: [5, 25, 100], pace: [[1, 1], [2, 4], [5, 5], [3, 10], [20, 20]], feedShare: 0.34, feed: { perPass: [2, 5], perMin: [4, 10], pMore: 0.5, pSkip: 0.03, pError: 0.005 }, recheckShare: 0.34, recheck: { perPass: [1, 3], pSkip: 0.03, pError: 0.005 } },
};
function walk(D, seed, profileName, steps = 3000, { forceFeed = false, noFeed = false, forceRecheck = false } = {}) {
  const P = PROFILES[profileName];
  const rnd = mulberry32(seed);
  const ri = (n) => Math.floor(rnd() * n);
  const nKeys = 4 + ri(37);
  let sticky = false;
  const during = (act, pv, sim) => {
    const r = rnd();
    const pickKey = () => keyOf(ri(nKeys));
    const pickOrigin = () => { const x = rnd(); return x < 0.3 ? 'owner' : x < 0.5 ? 'open' : 'agent'; };
    if (r < P.arrivals) for (let i = 1 + ri(3); i > 0; i--) sim.file(pickOrigin(), pickKey());
    if (rnd() < P.rerequest) {   // a re-request: the in-flight key, or a pending one
      const pend = sim.snap.requests.map((q) => q.key).concat(sim.snap.pass ? sim.snap.pass.due.map((d) => d.key) : []);
      const key = rnd() < 0.5 && act.key ? act.key : pend.length ? pend[ri(pend.length)] : pickKey();
      sim.file(pickOrigin(), key);
    }
    if (rnd() < P.storm) { for (let i = 0; i < 200; i++) sim.file('agent', pickKey()); sim.file('owner', pickKey()); sim.file('open', pickKey()); sim.bump('storm'); }
    if (rnd() < 0.04 && sim.snap.requests.length) sim.withdraw(sim.snap.requests[ri(sim.snap.requests.length)].id);
    if (rnd() < 0.18) sim.W.timerDue = true;
    if (rnd() < 0.08) sim.W.discoveryDue = true;
    if (rnd() < 0.06) sim.ask({ force: rnd() < 0.5, origin: rnd() < 0.5 ? 'timer' : 'kick' });
    if (rnd() < 0.004) {
      const which = rnd() < 0.5 ? 'stopped' : 'dropped';
      sim.W[which] = true; sim.bump('2-' + which);
      if (rnd() < 0.5) { sim.settleAll(which === 'stopped' ? 'stopped' : 'account-changed'); sim.bump('2-engine-settled'); }
    }
    sim.W.now += ri(3) === 0 ? ri(40) : 0;
    if (rnd() < 0.03) sim.W.now += 31e3;   // a slow vendor call: rows this pass fetched come due AGAIN (rule 13)
  };
  const pc = P.pace ? P.pace[ri(P.pace.length)] : null;
  // `noFeed` draws NO random number: the rules 1–18 mutants walk exactly the sequences they always walked
  const FP = P.feed && !noFeed && (forceFeed || rnd() < (P.feedShare ?? 1)) ? P.feed : null;
  const feed = FP ? {
    perPass: FP.perPass[ri(FP.perPass.length)], perMin: FP.perMin[ri(FP.perMin.length)],
    answer: (sim2) => {
      const x = rnd();
      if (x < FP.pError) return { error: rnd() < 0.5 ? 'transport' : 'auth-expired' };
      if (x < FP.pError + FP.pSkip) return { skip: rnd() < 0.5 ? 'rate-limited' : 'forbidden' };
      const due = [];
      for (let i = ri(5); i > 0; i--) due.push({ key: keyOf(ri(nKeys)), dueAt: sim2.W.now - ri(90e3) + (rnd() < 0.3 ? 40e3 : 0) });
      return { due, more: rnd() < FP.pMore };
    },
  } : null;
  // rule 22 (lane lark-threads): `noFeed` draws NO random number here either (the rules 1–18 mutants' sequences)
  const RP = P.recheck && !noFeed && (forceRecheck || rnd() < (P.recheckShare ?? 1)) ? P.recheck : null;
  const recheck = RP ? {
    perPass: RP.perPass[ri(RP.perPass.length)],
    due: () => { const out = []; for (let i = ri(7); i > 0; i--) { const k = keyOf(ri(nKeys)); if (!out.some((d) => d.key === k)) out.push({ key: k, dueAt: 0 }); } return out; },
    answer: () => { const x = rnd(); if (x < RP.pError) return { error: rnd() < 0.5 ? 'transport' : 'auth-expired' }; if (x < RP.pError + RP.pSkip) return { skip: 'not-found' }; return {}; },
  } : null;
  const sim = createSim(D, {
    rnd, walk: true, keys: nKeys, recheck, limit: P.limit[ri(P.limit.length)], sharePct: P.share[ri(P.share.length)],
    pace: pc ? { unitsPerSec: pc[0], burst: pc[1] } : null, discoverUnits: pc ? 1 + ri(8) : 1,
    floorMs: [5e3, 20e3, 60e3][ri(3)], hostScan: rnd() < 0.2, latency: 5 + ri(40), units: 1 + ri(2),
    cadenceOf: (i) => (i % 3 === 0 ? 300e3 : 30e3), lastOf: () => T0 - ri(400e3), during, feed,
    fail: () => (sticky ? 'rate-limited' : rnd() < P.p429 ? (rnd() < 0.5 ? 'rate-limited' : 'transport') : null),
    refuse: () => (rnd() < 0.02 ? 'not-found' : null),
    hints: () => (rnd() < 0.08 ? [keyOf(ri(nKeys))] : []),
  });
  let guard = 0;
  while (sim.steps < steps && guard++ < 100000) {
    // between passes: the world moves, arrivals come in, the tick decides
    const r = rnd();
    sim.W.now += r < 0.3 ? ri(70e3) : ri(4000);
    if (rnd() < P.sticky) sticky = !sticky;
    sim.W.connected = rnd() > 0.01;
    if (sim.W.feed) sim.W.feedDue = rnd() < 0.8;
    if (rnd() < 0.5) for (let i = ri(4); i > 0; i--) sim.file(rnd() < 0.5 ? 'agent' : rnd() < 0.5 ? 'owner' : 'open', keyOf(ri(nKeys)));
    if (sim.runQueued()) continue;
    const due = sim.dueList(false).length > 0;
    if (D.hasRequests(sim.snap)) sim.runPass({ origin: 'request' });
    else if (rnd() < 0.04) sim.runPass({ origin: 'timer', force: true });
    else if (due) sim.runPass({ origin: rnd() < 0.2 ? 'kick' : 'timer' });
    sim.W.connected = true;
  }
  // LIVENESS: the arrivals stop, the vendor behaves — every waiter is answered within bounded passes
  sticky = false;
  const settled = createSettle(sim);
  sim.windowCheck();
  const unanswered = [...sim.waiters.values()].filter((w) => !w.answer).length;
  return { sim, settled, unanswered, nKeys };
}
function createSettle(sim) {
  sim.W.fail = null; sim.W.refuse = null;
  sim.hooks.during = () => {};
  return sim.settle(400);
}
const RULE_COVER = [
  ['1-agent-refused', 'rule 1: agents refused at CAP − RESERVE'], ['1-human-in-reserve', 'rule 1: a human admitted into the reserve'],
  ['2-stop-drop', 'rule 2: stop / drop settled in one step'], ['3-failed', 'rule 3: a failed pass answered its taken waiters'], ['4-not-connected', 'rule 4: not connected'],
  ['5-refused-backoff', 'rule 5: the back-off gate'], ['5-refused-share', 'rule 5: the agent share'], ['5-refused-budget', 'rule 5: the vendor budget'], ['5-refused-floor', 'rule 5: the floor'],
  ['5-press-granted', 'rule 5: the owner\'s one press granted'], ['6-ride', 'rule 6: a request rode a due row'], ['7-humans-and-agents', 'rule 7: humans and agents waiting together'],
  ['7-fifo-choice', 'rule 7: a FIFO choice among one class'], ['8-interleave', 'rule 8: the interleave redirected the pick'], ['9-cut', 'rule 9: the cut'],
  ['10-new-round', 'rule 10: a new round of a fetched key'], ['12-discover', 'rule 12: discovery'], ['13-turn', 'rule 13: the timer\'s turn merged'],
  ['13-merged-due-again', 'rule 13: a due-again row merged'], ['13-hints', 'rule 13: hints merged'], ['14-scan', 'rule 14: the host scan'], ['15-carry', 'rule 15: the bound carried a pass'],
  ['16-backoff-end', 'rule 16: a fetchless back-off pass'], ['17-joined', 'rule 17: an ask joined the queued pass'], ['17-forced-ran', 'rule 17: a forced queued pass ran'],
  ['18-wait', 'rule 18: a wait for the bucket'], ['18-wait-fetch', 'rule 18: a wait holding the pick'], ['18-wait-discover', 'rule 18: a wait holding a discovery'], ['18-over-burst', 'rule 18: a call larger than the bucket sent on a full one'],
  ['18-repick', 'rule 18: the step after a wait picked something else (a new arrival, a refusal, a stop)'], ['18-window-1s', 'rule 18: every 1 s window within the tolerance'], ['18-window-60s', 'rule 18: every 60 s window within the tolerance'],
  // rule 21 (lane lark-search-poll)
  ['f21-feed', 'rule 21: a feed page'], ['f21-more', 'rule 21: a page with `more` kept the feed wanted'], ['f21-bound-hit', 'rule 21: the per-pass bound stopped a feed that had more'],
  ['f21-skip', 'rule 21: a feed-local refusal ended the feed, never the pass'], ['f21-error', 'rule 21: an account failure on a feed page (rule 3)'],
  ['f21-front', 'rule 21: the feed\'s rows went AHEAD of pending plain rows'], ['f21-moved-up', 'rule 21: a pending key moved up'], ['f21-fetched-not-again', 'rule 21: a key fetched this pass with no newer hit was not due again'],
  ['f21-human-first', 'rule 21: a waiting human went before a wanted feed'], ['f21-minute-spent', 'rule 21: the feed\'s own minute held it back'], ['18-wait-feed', 'rule 18: a wait holding a feed page'],
  // rule 22 (lane lark-threads)
  ['r22-armed', 'rule 22a: the timer\'s turn armed rechecks'], ['r22-recheck', 'rule 22a: a recheck page (nothing else pending)'], ['r22-skip', 'rule 22a: a conversation-level refusal of a recheck, the pass went on'],
  ['r22-error', 'rule 22a: an account failure on a recheck (rule 3)'], ['r22-press', 'rule 22b: an owner\'s round carried the recheck'], ['18-wait-recheck', 'rule 18: a wait holding a recheck'],
];
console.log('① THE WALK: 48 seeds × 3000 steps over four profiles (half the mixed seeds also run rule 21, the change feed), every rule at every step against the oracle');
const WALK_STEPS = 3000;
const totals = {};
let totalSteps = 0, totalPasses = 0, totalFetches = 0;
{
  const t0 = Date.now();
  const byProfile = {};
  let seedNo = 0;
  for (const prof of Object.keys(PROFILES)) {
    byProfile[prof] = {};
    for (let i = 0; i < 12; i++) {
      const seed = 20260926 + 7919 * (seedNo++);
      const { sim, settled, unanswered } = walk(D0, seed, prof, WALK_STEPS);
      totalSteps += sim.steps; totalPasses += sim.passNo; totalFetches += sim.fetches.length;
      for (const [k, v] of Object.entries(sim.cover)) { totals[k] = (totals[k] || 0) + v; byProfile[prof][k] = (byProfile[prof][k] || 0) + v; }
      ok(sim.violations.length === 0 && sim.steps >= WALK_STEPS, `${prof} seed ${seed}: ${sim.steps} steps, ${sim.passNo} passes, ${sim.fetches.length} fetches, ${sim.waiters.size} requests — every rule held at every step`, sim.violations.slice(0, 5).join(' | '));
      ok(settled && unanswered === 0, `${prof} seed ${seed}: LIVENESS — once the arrivals stop every one of ${sim.waiters.size} requests is answered exactly once (ok, a refusal by name, a settlement or its own bound)`, `settled ${settled}, ${unanswered} unanswered`);
    }
  }
  for (const [key, label] of RULE_COVER) ok((totals[key] || 0) > 0 && !totals['violation:' + key.split('-')[0]], `${label} — exercised ${totals[key] || 0}× across the walk, never violated`);
  const vio = Object.entries(totals).filter(([k]) => k.startsWith('violation:'));
  ok(vio.length === 0 && totalSteps >= 48 * WALK_STEPS, `the walk: ${totalSteps} steps, ${totalPasses} passes, ${totalFetches} vendor fetches, ${Date.now() - t0} ms — zero violations of the 18 rules + exactly-once + honest ok + no lost answer`, J(vio));
  for (const prof of Object.keys(PROFILES)) {
    const c = byProfile[prof];
    ok((c['5-refused'] || 0) > 0 && (c.fetch || 0) > 1000 && (c['13-turn'] || 0) > 0 && (prof !== 'paced' || (c['18-wait'] || 0) > 1000), `profile ${prof}: ${c.fetch || 0} fetches, ${c['5-refused'] || 0} refusals at sight, ${c['13-turn'] || 0} turns, ${c['9-cut'] || 0} cuts, ${c['5-refused-backoff'] || 0} back-off refusals, ${c['15-carry'] || 0} bound ends, ${c.storm || 0} storms, ${c['18-wait'] || 0} pace waits`);
  }
}

// ═══ ② THE TABLES — the r2–r8 repros in the model's own terms ══════════════════════════════════
/** A scripted account: 45 conversations, every one due at +31 s unless `dueOnly`. */
function account(D, o = {}) {
  return createSim(D, { keys: o.keys ?? 45, now: T0 + 31e3, lastOf: o.lastOf || (() => T0), cadenceOf: o.cadenceOf || ((i) => (o.dueOnly === undefined || o.dueOnly.includes(i) ? 30e3 : 900e3)), limit: o.limit ?? 1e6, sharePct: o.sharePct ?? 25, floorMs: o.floorMs ?? 20e3, latency: o.latency ?? 20, units: o.units ?? 1, fail: o.fail, refuse: o.refuse, hostScan: o.hostScan, backoffUntil: o.backoffUntil, epoch: o.epoch, failures: o.failures, pace: o.pace || null, discoverUnits: o.discoverUnits, feed: o.feed || null, recheck: o.recheck || null });
}
/** callsPerKey over a list of fetches. */
const callsOn = (sim, key) => sim.fetches.filter((f) => f.key === key).length;
/** THE 70-CELL CONCURRENCY TABLE (⑥f in the model's terms). */
const TABLE_STATES = ['idle', 'timer-fetching-key', 'timer-not-fetching-key', 'backoff', 'budget', 'share', 'floor'];
function cell(D, { state, origin, N, distinct }) {
  const first = state === 'timer-fetching-key' ? 0 : 1;
  const keys = Array.from({ length: distinct ? N : 1 }, (_, i) => keyOf(first + i));
  const agentUnits0 = { v: 0 };
  const sim = account(D, {
    dueOnly: state === 'timer-not-fetching-key' ? [0] : undefined,
    limit: state === 'budget' ? 1 : state === 'share' ? 200 : 1e6,
    sharePct: state === 'share' ? 5 : 25,
    fail: state === 'backoff' ? () => 'rate-limited' : null,
    backoffUntil: state === 'backoff' ? T0 + 31e3 + 30e3 : 0, epoch: state === 'backoff' ? 1 : 0, failures: state === 'backoff' ? 1 : 0,
    lastOf: state === 'floor' ? () => T0 + 31e3 : undefined,
  });
  if (state === 'budget') sim.W.spent = 46;
  if (state === 'share') sim.W.agent = 10;
  const reqs = [];
  const call = () => { for (let i = 0; i < N; i++) reqs.push(sim.file(origin === 'agent' ? 'agent' : 'owner', keys[distinct ? i : 0])); };
  if (state === 'timer-fetching-key' || state === 'timer-not-fetching-key') {
    let done = false;
    sim.hooks.during = (act) => { if (!done && act.type === 'fetch' && act.key === keyOf(0)) { done = true; call(); } };
    sim.runPass({ origin: 'timer' });
    sim.hooks.during = null;
  } else call();
  agentUnits0.v = sim.W.agent;
  sim.settle();
  let second = null;
  if (state === 'backoff' && origin === 'owner') { const f0 = sim.fetches.length; const ws = keys.map((k) => sim.file('owner', k)); sim.runPass({ origin: 'request' }); second = { calls: sim.fetches.length - f0, codes: ws.map((w) => w.answer && w.answer.code) }; }
  return { sim, keys, reqs, second };
}
function expectCell({ state, origin, key }) {
  const agent = origin === 'agent';
  const ok1 = { calls: 1, ok: true };
  switch (state) {
    case 'idle': case 'timer-not-fetching-key': return ok1;
    case 'timer-fetching-key': return key === keyOf(0) ? (agent ? { calls: 1, code: 'refresh-floor' } : { calls: 2, ok: true }) : ok1;
    case 'backoff': return agent ? { calls: 0, code: 'backoff' } : { calls: 'one-key', pressed: 'rate-limited' };
    case 'budget': return { calls: 0, code: 'vendor-budget' };
    case 'share': return agent ? { calls: 0, code: 'vendor-budget' } : ok1;
    case 'floor': return agent ? { calls: 0, code: 'refresh-floor' } : ok1;
    default: throw new Error(state);
  }
}
function judgeCell(c, r) {
  const problems = [];
  let oneKey = 0;
  for (const key of r.keys) {
    const ex = expectCell({ ...c, key });
    const calls = callsOn(r.sim, key);
    if (ex.calls === 'one-key') oneKey += calls; else if (calls !== ex.calls) problems.push(`${key}: ${calls} calls, expected ${ex.calls}`);
    for (const w of r.reqs.filter((q) => q.key === key)) {
      const a = w.answer || {};
      if (ex.calls === 'one-key') { if (calls === 1 ? a.code !== 'rate-limited' : a.code !== 'backoff') problems.push(`${key}: a press hears ${J(a)}`); continue; }
      if (ex.ok) {
        if (!a.ok) { problems.push(`${key}: expected ok, got ${J(a)}`); continue; }
        const f = r.sim.fetches[a.fetch];
        if (!f || f.key !== key || f.beginTick <= w.filedTick) problems.push(`${key}: ok not from a fetch of it begun after the call`);
      } else if (a.code !== ex.code) problems.push(`${key}: expected ${ex.code}, got ${J(a)}`);
    }
  }
  if (expectCell({ ...c, key: r.keys[0] }).calls === 'one-key' && oneKey !== 1) problems.push(`${oneKey} calls across ${r.keys.length} keys — the owner's press is honoured exactly once per window`);
  if (r.second && (r.second.calls !== 0 || !r.second.codes.every((x) => x === 'backoff'))) problems.push(`a second round in the window: ${r.second.calls} calls, ${J(r.second.codes)}`);
  const agentFetches = r.sim.fetches.filter((f) => f.chargeTo === 'agent').length;
  const want = c.origin === 'agent' && (c.state === 'idle' || c.state === 'timer-not-fetching-key') ? r.keys.length : 0;
  if (agentFetches !== want) problems.push(`${agentFetches} agent-charged fetches, expected ${want}`);
  if (r.sim.violations.length) problems.push('walk-invariant: ' + r.sim.violations[0]);
  if ([...r.sim.waiters.values()].some((w) => !w.answer)) problems.push('a waiter left unanswered');
  return problems;
}
const CELLS = [];
for (const state of TABLE_STATES) for (const origin of ['agent', 'owner']) for (const N of [1, 5, 20]) for (const distinct of (N === 1 ? [false] : [false, true])) CELLS.push({ state, origin, N, distinct });
function table(D) { return CELLS.map((c) => ({ c, problems: judgeCell(c, cell(D, c)) })); }
console.log('② THE TABLES: the 70-cell concurrency table and the r2–r8 repros, in the model\'s own terms');
{
  const res = table(D0);
  for (const { c, problems } of res) ok(problems.length === 0, `table · ${c.state} · ${c.origin} · ${c.N} caller(s) on ${c.distinct ? c.N + ' keys' : '1 key'}: ${J(expectCell({ ...c, key: keyOf(c.state === 'timer-fetching-key' ? 0 : 1) }))}`, problems.slice(0, 3).join('; '));
  ok(res.length === 70 && res.every((x) => !x.problems.length), `the table holds: ${res.length} cells, ${res.filter((x) => x.problems.length).length} red`);
}

// The repro shapes, each a function of the model so a mutant can be run through the SAME shape.
const REPROS = {
  /** r2: twenty concurrent agent refreshes of twenty conversations — every ok is a fetch of ITS conversation */
  foreignPass(D) { const sim = account(D, { dueOnly: [] }); const ws = Array.from({ length: 20 }, (_, i) => sim.file('agent', keyOf(10 + i))); sim.settle(); const lies = ws.filter((w) => !w.answer || !w.answer.ok || sim.fetches[w.answer.fetch].key !== w.key).length; return { lies, calls: sim.fetches.length }; },
  /** r3: inside a back-off forty agent refreshes make NO call; the owner's press makes one */
  // (one after another, like r3's forty `vibespace-channels refresh`)
  backoffDoor(D) { const sim = account(D, { fail: () => 'rate-limited', backoffUntil: T0 + 61e3, epoch: 1, failures: 1 }); const ws = []; for (let i = 0; i < 40; i++) { ws.push(sim.file('agent', keyOf(i))); sim.runPass({ origin: 'request' }); } const agentCalls = sim.fetches.length; const press = sim.file('owner', keyOf(2)); sim.runPass({ origin: 'request' }); return { agentCalls, codes: [...new Set(ws.map((w) => w.answer && w.answer.code))], ownerCalls: sim.fetches.length - agentCalls, press: press.answer }; },
  /** r4: N concurrent refreshes of ONE conversation are ONE vendor call — agents, windows, a queued timer pass */
  oneKey(D) {
    const sim = account(D, { dueOnly: [6] });
    for (let i = 0; i < 20; i++) sim.file('agent', keyOf(1)); sim.settle();
    const a = callsOn(sim, keyOf(1));
    for (let i = 0; i < 5; i++) sim.file('open', keyOf(2)); sim.settle();
    const b = callsOn(sim, keyOf(2));
    let done = false;
    sim.hooks.during = (act) => { if (!done && act.type === 'fetch') { done = true; for (let i = 0; i < 3; i++) sim.file('agent', keyOf(6)); } };
    sim.file('owner', keyOf(9)); sim.runPass({ origin: 'timer' }); sim.hooks.during = null; sim.settle();
    return { agents: a, windows: b, queued: callsOn(sim, keyOf(6)) };
  },
  /** r4 ruling: the owner's press honoured ONCE per back-off window, one key per pass */
  ownerOnce(D) { const sim = account(D, { fail: () => 'rate-limited', backoffUntil: T0 + 61e3, epoch: 1, failures: 1 }); for (let i = 1; i <= 5; i++) sim.file('owner', keyOf(i)); sim.runPass({ origin: 'request' }); const first = sim.fetches.length; for (let i = 1; i <= 5; i++) sim.file('owner', keyOf(i)); sim.runPass({ origin: 'request' }); return { first, second: sim.fetches.length - first }; },
  /** r5: a request filed behind a 40-row timer pass is fetched at the NEXT step — a not-due row and a due row it rides */
  everyStep(D) {
    const sim = account(D, { dueOnly: Array.from({ length: 40 }, (_, i) => i) });
    let done = false;
    sim.hooks.during = (act) => { if (!done && act.type === 'fetch') { done = true; sim.file('owner', keyOf(39)); sim.file('owner', keyOf(40)); } };
    sim.runPass({ origin: 'timer' }); sim.hooks.during = null;
    const keys = sim.fetches.map((f) => f.key);
    return { posDue: keys.indexOf(keyOf(39)), posNotDue: keys.indexOf(keyOf(40)), calls: keys.length, dueTwice: keys.filter((k) => k === keyOf(39)).length };
  },
  /** r5/r6: fifteen requests on a 10/min budget — ten calls, five refused by the cut, three late ones by the judgement */
  budgetCut(D) {
    const sim = account(D, { dueOnly: [], limit: 10 });
    const ws = []; let n = 0;
    sim.hooks.during = (act) => { if (act.type !== 'fetch') return; n++; if (n === 1) for (let i = 1; i < 15; i++) ws.push(sim.file('owner', keyOf(20 + i))); if (n === 10) for (const i of [35, 36, 37]) ws.push(sim.file('owner', keyOf(i + 5))); };
    ws.unshift(sim.file('owner', keyOf(20)));
    sim.runPass({ origin: 'request' }); sim.hooks.during = null;
    const early = ws.slice(0, 15), late = ws.slice(15);
    return { calls: sim.fetches.length, ok: early.filter((w) => w.answer && w.answer.ok).length, cut: early.filter((w) => w.answer && w.answer.code === 'vendor-budget' && w.answer.rule === 'cut').length, late: late.map((w) => w.answer && (w.answer.rule || (w.answer.ok ? 'ok' : '?'))) };
  },
  /** r6: one agent's storm (200 while a fetch holds the pass) never refuses the owner's press or a window's open */
  storm(D) {
    const sim = account(D, { dueOnly: [] });
    let owner = null, open = null, agents = [];
    sim.hooks.during = (act) => { if (act.type === 'fetch' && !agents.length) { agents = Array.from({ length: 200 }, (_, i) => sim.file('agent', keyOf(2 + (i % 5)))); owner = sim.file('owner', keyOf(8)); open = sim.file('open', keyOf(9)); } };
    sim.file('owner', keyOf(1)); sim.runPass({ origin: 'request' }); sim.hooks.during = null; sim.settle();
    return { refusedAgents: agents.filter((w) => w.answer && w.answer.code === 'refresh-queue-full').length, owner: owner.answer, open: open.answer };
  },
  /** r6: an agent's floor-refused request behind a 45-row pass is answered at the NEXT step, before any further vendor call */
  refusalAtSight(D) {
    const sim = account(D, { keys: 50, dueOnly: Array.from({ length: 45 }, (_, i) => i), floorMs: 900e3, lastOf: (i) => (i >= 45 ? T0 + 31e3 - 31e3 + 1 : T0) });
    let w = null;
    sim.hooks.during = (act) => { if (!w && act.type === 'fetch') w = sim.file('agent', keyOf(47)); };
    sim.runPass({ origin: 'timer' });
    return { code: w.answer && w.answer.code, fetchesBefore: w.answer ? w.answeredFetch - w.filedFetch : null, passFetches: sim.fetches.length };
  },
  /** r7: the owner's request for a not-due row behind a 45-row pass is answered AT ITS FETCH (position 1) */
  okAtFetch(D) {
    const sim = account(D, { keys: 50, dueOnly: Array.from({ length: 45 }, (_, i) => i) });
    let w = null;
    sim.hooks.during = (act) => { if (!w && act.type === 'fetch') w = sim.file('owner', keyOf(47)); };
    sim.runPass({ origin: 'timer' });
    const pos = sim.fetches.findIndex((f) => f.key === keyOf(47));
    return { pos, answeredAt: w.answer && w.answer.ok ? w.answer.fetch : null, passFetches: sim.fetches.length };
  },
  /** r7: three forced asks and a timer ask behind a running pass — ONE queued pass, forced */
  forcedThrice(D) {
    const sim = account(D, { keys: 20 });
    let asked = false;
    sim.hooks.during = (act) => { if (!asked && act.type === 'fetch') { asked = true; sim.ask({ force: true, origin: 'timer' }); sim.ask({ force: true, origin: 'timer' }); sim.ask({ force: true, origin: 'timer' }); sim.ask({ force: false, origin: 'timer' }); } };
    sim.runPass({ origin: 'timer' }); sim.hooks.during = null;
    const queuedPasses = sim.violations.filter((v) => v.startsWith('17-one-queued')).length;
    const f0 = sim.fetches.length; sim.runQueued();
    return { queuedViolations: queuedPasses, forcedFetches: sim.fetches.length - f0 };
  },
  /** r7: a saturating owner stream on ten not-due keys beside 35 due rows — every due row served DURING the stream */
  interleave(D) {
    const sim = account(D, { dueOnly: Array.from({ length: 35 }, (_, i) => 10 + i) });
    let k = 0, lastFiled = -1;
    sim.hooks.during = () => { if (k < 200) { sim.file('owner', keyOf(k++ % 10)); lastFiled = sim.fetches.length; } };
    sim.file('owner', keyOf(0));
    sim.runPass({ origin: 'timer' });
    sim.hooks.during = null; sim.settle();
    const duringStream = new Set(sim.fetches.slice(0, lastFiled).filter((f) => f.due && !f.waiters.length).map((f) => f.key)).size;   // due rows served while the stream still filed
    let lastDue = -1; sim.fetches.forEach((f, i) => { if (f.due) lastDue = i; });
    let maxRun = 0, run = 0; for (const f of sim.fetches.slice(0, lastDue + 1)) { if (!f.due) { run++; maxRun = Math.max(maxRun, run); } else run = 0; }   // while a due row waited
    return { duringStream, maxRequestRun: maxRun };
  },
  /** r8 (a): a request on ONE key filed during every fetch — each heard within a round, the calls coalesced */
  oneKeyStream(D) {
    const sim = account(D, { keys: 200 });   // the due list outlasts the stream (the suite's ⑥g(11a) re-dues its rows by the clock)
    const ws = [];
    sim.hooks.during = () => { if (ws.length < 100) ws.push(sim.file('owner', keyOf(44))); };
    sim.runPass({ origin: 'timer' }); sim.hooks.during = null; sim.settle();
    const waits = ws.map((w) => w.answeredFetch - w.filedFetch);
    return { requests: ws.length, calls: callsOn(sim, keyOf(44)), maxWait: Math.max(...waits), allOk: ws.every((w) => w.answer && w.answer.ok) };
  },
  /** r8 (b): the owner's ONE press under four lanes re-filing the instant each answers */
  pressUnderLanes(D) {
    const sim = account(D, { keys: 50, dueOnly: [] });
    const lanes = [[40, 41], [42, 43], [44, 45], [46, 47]].map((ks) => ({ ks, i: 0, w: null }));
    let press = null, n = 0, stop = false;
    for (const l of lanes) l.w = sim.file('owner', keyOf(l.ks[l.i++ % 2]));
    sim.hooks.afterFetch = () => { n++; if (stop) return; if (n === 3) press = sim.file('owner', keyOf(49)); for (const l of lanes) if (l.w.answer) l.w = sim.file('owner', keyOf(l.ks[l.i++ % 2])); if (n >= 200) stop = true; };   // the lanes re-file the instant each answers — AFTER the press
    sim.settle(50); sim.hooks.afterFetch = null;
    return { wait: press && press.answer ? press.answer.fetch - press.filedFetch : null, ok: !!(press && press.answer && press.answer.ok) };
  },
  /** r8 (c): the owner's press on a due row behind 40 agent riders — fetched FIRST */
  ownerFirst(D) {
    const sim = account(D, { keys: 60 });
    let press = null, done = false;
    sim.hooks.during = (act) => { if (!done && act.type === 'fetch') { done = true; for (let i = 1; i <= 40; i++) sim.file('agent', keyOf(i)); press = sim.file('owner', keyOf(59)); } };
    sim.runPass({ origin: 'timer' }); sim.hooks.during = null;
    return { pos: sim.fetches.findIndex((f) => f.key === keyOf(59)), calls: sim.fetches.length, agentsOk: sim.fetches.length === 60 };
  },
  /** r8 low (c): stop between fetches — every waiter answered in one step, NO vendor call after */
  stopMidPass(D) {
    const sim = account(D);
    let n = 0, afterStop = 0, stopped = false;
    sim.hooks.during = (act) => { if (stopped) afterStop++; if (act.type === 'fetch' && ++n === 3) { sim.file('owner', keyOf(44)); sim.file('agent', keyOf(43)); sim.W.stopped = true; stopped = true; } };
    sim.runPass({ origin: 'timer' }); sim.hooks.during = null;
    return { callsAfterStop: afterStop, unanswered: [...sim.waiters.values()].filter((w) => !w.answer).length, codes: [...sim.waiters.values()].map((w) => w.answer && w.answer.code) };
  },
  /** r8 low: a human's request filed during a fetch while a turn brings discovery — the human's fetch goes FIRST */
  humanBeforeDiscovery(D) {
    const sim = account(D, { dueOnly: [0, 1, 2] });
    let done = false;
    sim.hooks.during = (act) => { if (!done && act.type === 'fetch') { done = true; sim.W.timerDue = true; sim.W.discoveryDue = true; sim.file('owner', keyOf(30)); } };
    sim.runPass({ origin: 'timer' }); sim.hooks.during = null;
    const log = sim.vendorLog.map((v) => (v.type === 'fetch' ? v.key : v.type));
    return { humanAt: log.indexOf(keyOf(30)), discoverAt: log.indexOf('discover'), discoveries: log.filter((x) => x === 'discover').length };
  },
  /** r9: twenty agent requests judged together with a share of 5 — exactly five agent fetches, fifteen refused BY NAME */
  sharePerFetch(D) { const sim = account(D, { dueOnly: [], limit: 100, sharePct: 5 }); const ws = Array.from({ length: 20 }, (_, i) => sim.file('agent', keyOf(1 + i))); sim.runPass({ origin: 'request' }); return { agentFetches: sim.fetches.filter((f) => f.chargeTo === 'agent').length, refused: ws.filter((w) => w.answer && w.answer.code === 'vendor-budget').length }; },
  /** r9: a pure request stream (no due row) — the pass ends after exactly K request fetches, the rest carried and answered */
  bound(D) {
    const sim = account(D, { keys: 60, dueOnly: [] });
    let k = 0;
    sim.hooks.during = () => { if (k < 120) sim.file('owner', keyOf(k++ % 60)); };
    sim.file('owner', keyOf(59));
    const first = sim.runPass({ origin: 'request' });
    const firstFetches = sim.fetches.length;
    sim.hooks.during = null; sim.settle();
    return { carry: !!first.carry, firstFetches, all: [...sim.waiters.values()].every((w) => w.answer && w.answer.ok) };
  },
  /** rule 13: a forced pass whose human request was fetched before discovery — the forced list never fetches it twice */
  dueAgain(D) {
    const sim = account(D, { keys: 10 });
    sim.file('owner', keyOf(3));
    sim.runPass({ origin: 'timer', force: true });
    return { twice: callsOn(sim, keyOf(3)), total: sim.fetches.length };
  },
  // ── rule 18 (lane R5): the PACE — the Gmail defaults: 40 units/s (burst 40), a thread read = 40 units, a 3000/min budget ──
  /** the owner's case: the first ingest of 873 conversations, one timer pass */
  firstIngest(D, { pace = GMAIL_PACE } = {}) {
    const sim = account(D, { keys: 873, limit: 3000, units: 40, pace, latency: 20 });
    const first = sim.runPass({ origin: 'timer' });
    const keys = sim.fetches.map((f) => f.key);
    const sends = sim.W.sends;
    return { calls: sim.fetches.length, distinct: new Set(keys).size, inOrder: keys.every((k, i) => k === keyOf(i)), max1s: sim.maxIn(1000), max10s: sim.maxIn(10e3), max60s: sim.maxIn(60e3), wallSec: sends.length ? (sends[sends.length - 1].at - sends[0].at) / 1000 : 0, cut: !!first.cut, ok: !!first.ok, waits: sim.W.waits.length, maxWait: sim.W.waits.length ? Math.max(...sim.W.waits) : 0, violations: sim.violations.slice(0, 3) };
  },
  /** the owner's press filed during a pace wait (a not-due conversation) — the NEXT call is its fetch */
  humanDuringWait(D) {
    const sim = account(D, { keys: 874, limit: 3000, units: 40, pace: GMAIL_PACE, cadenceOf: (i) => (i < 873 ? 30e3 : 900e3) });
    let w = null, at = null;
    sim.hooks.during = (act) => { if (!w && act.type === 'wait' && sim.fetches.length >= 100) { w = sim.file('owner', keyOf(873)); at = sim.fetches.length; } };
    sim.runPass({ origin: 'timer' });
    const pos = sim.fetches.findIndex((f) => f.key === keyOf(873));
    return { filedAfter: at, pos, ok: !!(w && w.answer && w.answer.ok), calls: sim.fetches.length };
  },
  /** an agent's floor-refused request filed during a fetch that drained the bucket — refused at the next step, never held behind a wait */
  refusalDuringWait(D) {
    const sim = account(D, { keys: 60, limit: 3000, units: 40, pace: GMAIL_PACE, floorMs: 900e3 });
    let w = null;
    sim.hooks.during = (act) => { if (!w && act.type === 'fetch' && sim.fetches.length >= 5) w = sim.file('agent', keyOf(1)); };
    sim.runPass({ origin: 'timer' });
    return { code: w && w.answer && w.answer.code, heldMs: w && w.answer ? w.answeredAt - w.filedAt : null, fetchesBetween: w && w.answer ? w.answeredFetch - w.filedFetch : null };
  },
  /** a paced request stream with no due row: the pass still ends after exactly K request FETCHES — a wait never counts */
  pacedBound(D) {
    const sim = account(D, { keys: 60, dueOnly: [], units: 40, pace: GMAIL_PACE });
    let k = 0;
    sim.hooks.during = (act) => { if (act.type === 'fetch' && k < 120) sim.file('owner', keyOf(k++ % 60)); };
    sim.file('owner', keyOf(59));
    const first = sim.runPass({ origin: 'request' });
    return { carry: !!first.carry, firstFetches: sim.fetches.length, waits: sim.W.waits.length };
  },
  /** a discovery larger than the bucket (a 410-unit page on a 40-unit bucket): it waits for a FULL bucket, the next fetch waits out the debt one ≤ 1 s step at a time */
  overBurst(D) {
    const sim = account(D, { keys: 5, limit: 1e6, units: 40, pace: GMAIL_PACE, discoverUnits: 410 });
    sim.W.discoveryDue = true;
    sim.runPass({ origin: 'timer' });
    const log = sim.W.sends.map((x) => x.units);
    const gap = sim.W.sends.length > 1 ? sim.W.sends[1].at - sim.W.sends[0].at : null;
    return { first: log[0], gapMs: gap, maxWait: sim.W.waits.length ? Math.max(...sim.W.waits) : 0, waits: sim.W.waits.length, calls: sim.fetches.length };
  },
  /** the minute stays the OUTER cap: a pace faster than the budget (100/s against 600/min) is still cut at the minute */
  minuteOuterCap(D) {
    const sim = account(D, { keys: 45, limit: 600, units: 40, pace: { unitsPerSec: 100, burst: 100 } });
    const first = sim.runPass({ origin: 'timer' });
    return { calls: sim.fetches.length, cut: !!first.cut, why: first.why };
  },
  /** fairness under the pace: a saturating owner stream beside 35 due rows — the i-th due row after at most i request fetches */
  pacedFairness(D) {
    const sim = account(D, { dueOnly: Array.from({ length: 35 }, (_, i) => 10 + i), units: 40, pace: GMAIL_PACE });
    let k = 0, reqFetches = 0;
    const firstDueAt = new Map();
    sim.hooks.during = (act) => { if (reqFetches < 400) sim.file('owner', keyOf(k++ % 10)); };
    sim.hooks.afterFetch = (act) => { if (!act.due) reqFetches++; else if (!firstDueAt.has(act.key)) firstDueAt.set(act.key, reqFetches); };
    sim.file('owner', keyOf(0));
    sim.runPass({ origin: 'timer' });
    const order = Array.from({ length: 35 }, (_, i) => keyOf(10 + i));
    return { all: order.every((key) => firstDueAt.has(key)), worst: Math.max(...order.map((key, i) => (firstDueAt.get(key) ?? Infinity) - (i + 1))), waits: sim.W.waits.length };
  },
};
const R = {};
for (const [name, fn] of Object.entries(REPROS)) R[name] = fn(D0);
ok(R.foreignPass.lies === 0 && R.foreignPass.calls === 20, `r2 · twenty concurrent agent refreshes of twenty conversations: every ok is a fetch of ITS conversation (${R.foreignPass.lies} liars, ${R.foreignPass.calls} calls)`, J(R.foreignPass));
ok(R.backoffDoor.agentCalls === 0 && J(R.backoffDoor.codes) === '["backoff"]' && R.backoffDoor.ownerCalls === 1 && R.backoffDoor.press.code === 'rate-limited', `r3 · inside a back-off forty agent refreshes make NO call (${R.backoffDoor.agentCalls}), every one refused backoff; the owner's press makes one (${R.backoffDoor.ownerCalls}) and hears the vendor's refusal`, J(R.backoffDoor));
ok(R.oneKey.agents === 1 && R.oneKey.windows === 1 && R.oneKey.queued === 1, `r4 · twenty agents on one key = ${R.oneKey.agents} call, five windows = ${R.oneKey.windows}, three agents behind a timer pass fetching their key = ${R.oneKey.queued} (they ride it)`, J(R.oneKey));
ok(R.ownerOnce.first === 1 && R.ownerOnce.second === 0, `r4 ruling · five owner presses on five keys inside a back-off: ${R.ownerOnce.first} call (one key per window), a second round ${R.ownerOnce.second}`, J(R.ownerOnce));
ok(R.everyStep.posDue >= 1 && R.everyStep.posDue <= 2 && R.everyStep.posNotDue >= 1 && R.everyStep.posNotDue <= 2 && R.everyStep.calls === 41 && R.everyStep.dueTwice === 1, `r5 · requests filed behind a 40-row timer pass are fetched at the NEXT step — the ridden due row at ${R.everyStep.posDue}, the not-due row at ${R.everyStep.posNotDue}, ${R.everyStep.calls} calls`, J(R.everyStep));
ok(R.budgetCut.calls === 10 && R.budgetCut.ok === 10 && R.budgetCut.cut === 5 && J(R.budgetCut.late) === '["budget","budget","budget"]', `r5/r6 · fifteen requests on a 10/min budget: exactly ${R.budgetCut.calls} calls, ${R.budgetCut.ok} ok, ${R.budgetCut.cut} refused by the cut by name, three late ones by the judgement (${J(R.budgetCut.late)})`, J(R.budgetCut));
ok(R.storm.refusedAgents === 20 && R.storm.owner && R.storm.owner.ok && R.storm.open && R.storm.open.ok, `r6 · one agent's storm of 200 behind a held fetch: ${R.storm.refusedAgents} agents refused at CAP − RESERVE, the owner's press and a window's open accepted and answered ok`, J(R.storm));
ok(R.refusalAtSight.code === 'refresh-floor' && R.refusalAtSight.fetchesBefore === 0 && R.refusalAtSight.passFetches >= 45, `r6 · an agent's floor-refused request behind a ${R.refusalAtSight.passFetches}-fetch pass is answered at the NEXT step — ${R.refusalAtSight.fetchesBefore} vendor calls begun between its filing and its answer (only the one in flight)`, J(R.refusalAtSight));
ok(R.okAtFetch.pos === 1 && R.okAtFetch.answeredAt === 1, `r7 · the owner's not-due request behind a ${R.okAtFetch.passFetches}-fetch pass is fetched at position ${R.okAtFetch.pos} and answered ok AT that fetch, never at the pass's end`, J(R.okAtFetch));
ok(R.forcedThrice.queuedViolations === 0 && R.forcedThrice.forcedFetches === 20, `r7 · three forced asks and a timer ask behind a running pass: ONE queued pass, forced (${R.forcedThrice.forcedFetches} fetches = every row once)`, J(R.forcedThrice));
ok(R.interleave.duringStream === 35 && R.interleave.maxRequestRun <= 1, `r7 · a saturating owner stream beside 35 due rows: ${R.interleave.duringStream}/35 due rows served DURING the stream, never two request fetches in a row while one waits (max ${R.interleave.maxRequestRun})`, J(R.interleave));
ok(R.oneKeyStream.allOk && R.oneKeyStream.maxWait <= 3 && R.oneKeyStream.calls <= R.oneKeyStream.requests * 0.6, `r8 (a) · ${R.oneKeyStream.requests} requests on ONE key, one filed during every fetch: every one heard within ${R.oneKeyStream.maxWait} fetches, ${R.oneKeyStream.calls} calls (coalesced)`, J(R.oneKeyStream));
ok(R.pressUnderLanes.ok && R.pressUnderLanes.wait !== null && R.pressUnderLanes.wait <= 5, `r8 (b) · the owner's one press under four lanes re-filing the instant each answers is heard after ${R.pressUnderLanes.wait} fetches — within a round`, J(R.pressUnderLanes));
ok(R.ownerFirst.pos === 1 && R.ownerFirst.calls === 60, `r8 (c) · the owner's press on a due row behind 40 agent riders is fetched at position ${R.ownerFirst.pos} (humans first; ${R.ownerFirst.calls} calls = every row once)`, J(R.ownerFirst));
ok(R.stopMidPass.callsAfterStop === 0 && R.stopMidPass.unanswered === 0 && R.stopMidPass.codes.filter((c) => c === 'stopped').length === 2, `r8 low · a stop between fetches: both waiters hear stopped in one step, ${R.stopMidPass.callsAfterStop} vendor calls after it (r8 measured 43)`, J(R.stopMidPass));
ok(R.humanBeforeDiscovery.humanAt >= 0 && R.humanBeforeDiscovery.discoverAt > R.humanBeforeDiscovery.humanAt && R.humanBeforeDiscovery.discoveries === 1, `r8 low · a human's request filed while a turn brings discovery: the human's fetch at call ${R.humanBeforeDiscovery.humanAt}, discovery after it at ${R.humanBeforeDiscovery.discoverAt}, once`, J(R.humanBeforeDiscovery));
ok(R.sharePerFetch.agentFetches === 5 && R.sharePerFetch.refused === 15, `r9 · twenty agent requests judged together under a share of 5: exactly ${R.sharePerFetch.agentFetches} agent fetches, ${R.sharePerFetch.refused} refused by name (r8 judged the share at the boundary only)`, J(R.sharePerFetch));
ok(R.bound.carry && R.bound.firstFetches === K && R.bound.all, `r9 · a request stream with no due row: the first pass ends after exactly ${R.bound.firstFetches} (K = ${K}) request fetches, carrying the rest — every request answered ok`, J(R.bound));
ok(R.dueAgain.twice === 1 && R.dueAgain.total === 10, `rule 13 · a forced pass whose human request was fetched before discovery never fetches it twice (${R.dueAgain.twice} call, ${R.dueAgain.total} in all)`, J(R.dueAgain));

// ═══ ②b THE PACE (rule 18, lane R5) ═══════════════════════════════════════════════════════════
console.log('②b THE PACE (rule 18): the owner\'s 873-conversation first ingest under the Gmail defaults, and what a wait may never do');
{
  const I = R.firstIngest;
  ok(I.calls === 873 && I.distinct === 873 && I.inOrder && I.ok && !I.cut && I.violations.length === 0, `the first ingest of 873 conversations at 40 units each is ONE timer pass: every row fetched once, most overdue first, never cut by the minute (${I.calls} calls, cut ${I.cut})`, J(I));
  ok(I.max1s <= 80, `no second holds more than 80 units — one second's worth + one thread read (the rule's exact tolerance: burst 40 + 40·1 s + 0) — measured ${I.max1s}`, J(I));
  ok(I.max10s <= 440 && I.max60s <= 2440 && I.max60s <= 3000, `no 10 s holds more than 440, no 60 s more than 2440 — inside the 3000/min budget and far inside Google's 6000/min per user (measured ${I.max10s} / ${I.max60s})`, J(I));
  ok(I.wallSec >= 871 && I.wallSec <= 874, `…so the first read takes ≈ 873 × 40 / 40 = 873 s of wall clock (${I.wallSec.toFixed(1)} s from the first call to the last) — one thread a second, as the setting says`, J(I));
  ok(I.maxWait <= 1000 && I.waits >= 872, `every wait is one step of ≤ 1 s (${I.waits} waits, longest ${I.maxWait} ms) — the drain is asked again at least once a second`, J(I));
  const C = REPROS.firstIngest(D0, { pace: null });
  ok(C.calls < 873 && C.cut && C.max1s >= 2000, `CONTROL · the SAME pass with the pace off is the shape the vendor refused: ${C.max1s} units inside one second before the minute's cut (${C.calls} calls, then nothing for the rest of the minute) — the legs above would go red`, J({ calls: C.calls, max1s: C.max1s, cut: C.cut }));
  ok(R.humanDuringWait.ok && R.humanDuringWait.pos === R.humanDuringWait.filedAfter, `the owner's press filed during a pace wait (after ${R.humanDuringWait.filedAfter} fetches) is the NEXT call (position ${R.humanDuringWait.pos}) — a wait re-picks, humans first`, J(R.humanDuringWait));
  ok(R.refusalDuringWait.code === 'refresh-floor' && R.refusalDuringWait.fetchesBetween === 0 && R.refusalDuringWait.heldMs <= 20, `an agent's floor-refused request filed while the bucket is empty is refused at the next step: ${R.refusalDuringWait.fetchesBetween} calls, ${R.refusalDuringWait.heldMs} ms (the fetch in flight) — never held behind a wait`, J(R.refusalDuringWait));
  ok(R.pacedBound.carry && R.pacedBound.firstFetches === K && R.pacedBound.waits > 0, `a paced request stream still ends after exactly K = ${K} request FETCHES (${R.pacedBound.firstFetches}, with ${R.pacedBound.waits} waits between them) — a wait never counts toward the bound`, J(R.pacedBound));
  ok(R.overBurst.first === 410 && R.overBurst.gapMs >= 10250 && R.overBurst.gapMs <= 10300 && R.overBurst.maxWait <= 1000, `a 410-unit discovery on a 40-unit bucket goes on a FULL bucket; the next fetch waits out the debt (${R.overBurst.gapMs} ms ≈ (410 − 40 + 40) / 40 s) in ${R.overBurst.waits} steps of ≤ 1 s`, J(R.overBurst));
  ok(R.minuteOuterCap.cut && R.minuteOuterCap.calls === 15, `the minute stays the OUTER cap: a 100/s pace against a 600/min budget is still cut at the minute (${R.minuteOuterCap.calls} × 40 units, cut ${R.minuteOuterCap.cut})`, J(R.minuteOuterCap));
  ok(R.pacedFairness.all && R.pacedFairness.worst <= 0 && R.pacedFairness.waits > 0, `under the pace a saturating owner stream still serves the i-th of 35 due rows after at most i request fetches (worst slack ${R.pacedFairness.worst}, ${R.pacedFairness.waits} waits)`, J(R.pacedFairness));
  const D = D0;
  const P = D.paceFresh(40, 40, 0);
  ok(D.paceWaitMs(P, 0, 40) === 0 && D.paceWaitMs(D.paceCharge(P, 0, 40), 0, 40) === 1000 && D.paceWaitMs(D.paceCharge(P, 0, 40), 500, 40) === 500 && D.paceWaitMs(D.paceCharge(P, 0, 410), 0, 410) === 1000 && D.paceLevel(D.paceCharge(P, 0, 410), 10250) === 40 && D.paceWaitMs(null, 0, 1e9) === 0, 'the bucket arithmetic: a full bucket sends at once, an empty one waits the shortfall (≤ 1 s per ask), a debt is waited out, a full bucket is capped, no pace never waits');
}

// ═══ ②c design 011 lane 2: A RESTART after the poll stamps left the row ════════════════════════
// The stamps live in a side file written at most every 120 s (src/channel-store.js STAMPS_FLUSH_MS) and at close, and
// every set in between is appended to its journal (poll-stamps.log, replayed at the start). A row is due at
// `lastPollAt + cadence`, so a restart re-polls exactly what was lost: nothing after a clean stop or a kill -9 (the
// journal), the rows whose due time fell inside the lost interval when the journal could not be written (said), every
// row when the file is gone — and that last one is the first ingest's shape, paced (rule 18) and inside the minute (rule 9).
console.log('②c design 011 lane 2: a restart re-polls only what the side file lost — paced, inside the budget');
{
  const { STAMPS_FLUSH_MS } = require(path.join(REPO, 'src/channel-store.js'));
  const NOWc = T0 + 31e3, CAD = 900e3;   // 873 cold rows (15 min) — userW's shape
  const restart = (lastOf) => { const sim = account(D0, { keys: 873, limit: 3000, units: 40, pace: GMAIL_PACE, latency: 20, cadenceOf: () => CAD, lastOf }); const p = sim.runPass({ origin: 'timer' }); return { calls: sim.fetches.length, max1s: sim.maxIn(1000), max60s: sim.maxIn(60e3), cut: !!p.cut }; };
  const spread = (i) => NOWc - (i * 1031) % CAD;   // each row polled within its cadence, spread over it
  const kept = restart(spread), stale = restart((i) => spread(i) - STAMPS_FLUSH_MS), lost = restart(() => 0);
  const share = Math.ceil(873 * STAMPS_FLUSH_MS / CAD) + 1;
  ok(kept.calls === 0, `a clean stop or a kill -9 (the side file written at close, or the journal replayed over it): the restart's timer pass fetches ${kept.calls} of 873 rows`, J(kept));
  ok(stale.calls > 0 && stale.calls <= share, `a kill -9 while the journal could not be written (the side file ${STAMPS_FLUSH_MS / 1000} s behind): ${stale.calls} rows re-polled early — at most the ${share} whose due time fell in the lost interval, never a storm`, J(stale));
  ok(lost.calls === 873 && !lost.cut && lost.max1s <= 80 && lost.max60s <= 2440, `the side file deleted: all 873 due at once, and the pace + the minute bound the re-poll (≤ ${lost.max1s} units in any second, ${lost.max60s} in any minute of the 3000 budget, never cut)`, J(lost));
}

// ═══ ③ FAIRNESS ═══════════════════════════════════════════════════════════════════════════════
console.log('③ FAIRNESS: the due list under a saturating stream, a lone request behind 873 due rows, the bound');
{
  const sim = account(D0, { dueOnly: Array.from({ length: 35 }, (_, i) => 10 + i) });
  let k = 0, reqFetches = 0;
  const firstDueAt = new Map();
  sim.hooks.during = () => { if (reqFetches < 400) sim.file('owner', keyOf(k++ % 10)); };
  sim.hooks.afterFetch = (act) => { if (!act.due) reqFetches++; else if (!firstDueAt.has(act.key)) firstDueAt.set(act.key, reqFetches); };
  sim.file('owner', keyOf(0));
  sim.runPass({ origin: 'timer' });
  const dueOrder = Array.from({ length: 35 }, (_, i) => keyOf(10 + i));
  const worst = Math.max(...dueOrder.map((key, i) => (firstDueAt.get(key) ?? Infinity) - (i + 1)));
  ok(dueOrder.every((key) => firstDueAt.has(key)) && worst <= 0, `under a saturating request stream the i-th of 35 due rows is fetched after at most i request fetches (worst slack ${worst}; the stream never paused) — K_fair = the row's position ≤ 35`, J([...firstDueAt].slice(0, 6)));
  const big = createSim(D0, { keys: 874, now: T0 + 31e3, lastOf: () => T0, cadenceOf: (i) => (i < 873 ? 30e3 : 900e3) });
  let w = null;
  big.hooks.during = (act) => { if (!w && act.type === 'fetch') w = big.file('agent', keyOf(873)); };
  big.runPass({ origin: 'timer' });
  const dueBetween = big.fetches.slice(w.filedFetch - 1, w.answer.fetch).filter((f) => f.due).length;   // from the fetch in flight when it was filed to its own
  ok(w.answer && w.answer.ok && dueBetween === 1 && big.fetches.length === 874, `a lone agent request filed behind 873 due rows waits for ONE due fetch (the one in flight: ${dueBetween}), then is fetched — ${big.fetches.length} calls in all`, J({ dueBetween, pos: w.answer.fetch }));
  ok(D0.STREAK_MAX === K && D0.REFRESH_QUEUE_CAP === CAP && D0.REFRESH_OWNER_RESERVE === RESERVE, `the model's numbers are the spec's: STREAK_MAX ${D0.STREAK_MAX} (K), CAP ${D0.REFRESH_QUEUE_CAP}, RESERVE ${D0.REFRESH_OWNER_RESERVE}`);
}

// ═══ ④ MUTANTS — a patched copy per rule, each turning its own leg red ═════════════════════════
console.log('④ MUTANTS: one patched copy of the model per rule — the walk\'s named invariant and the repro it protects go red');
const M = mutantCopies('channel-drain', REPO);
function mutant(tag, edits) {
  let src = SRC;
  for (const [from, to] of edits) { if (!src.includes(from)) return { setup: false, why: `anchor missing: ${from.slice(0, 80)}` }; src = src.replace(from, to); }
  return { setup: src !== SRC, D: M.load(MODEL, src, tag) };
}
/** Run short walks on a mutant until one of the invariants it should break is named; the violated rule families. */
function walkMutant(D, want, seeds = 6, steps = 1500) {
  const hit = {};
  outer: for (let i = 0; i < seeds; i++) for (const prof of Object.keys(PROFILES)) {
    let r;
    try { r = walk(D, 777 + i * 131, prof, steps, { noFeed: true }); } catch (e) { const k = 'threw:' + String(e.message).slice(0, 40); hit[k] = (hit[k] || 0) + 1; continue; }
    for (const v of r.sim.violations) { const k = v.split(':')[0]; hit[k] = (hit[k] || 0) + 1; }
    if (!r.settled || r.unanswered) hit['21-liveness'] = (hit['21-liveness'] || 0) + 1;
    if (want.some((k) => hit[k])) break outer;
  }
  return hit;
}
const MUTANTS = [
  { tag: 'no-ride', rule: 6, why: 'r4: N concurrent refreshes of one key = N calls', edits: [['function slotOf(r) { return r.key; }', 'function slotOf(r) { return r.id; }']], walk: ['10-round'], repro: () => { const r = REPROS.oneKey(DM); return { red: r.agents >= 10 && r.windows >= 2 && r.queued >= 2, said: J(r) }; } },
  { tag: 'lifo', rule: 7, why: 'r8: LIFO across boundaries', edits: [['const byRank = (a, b) => (Number(b.human) - Number(a.human)) || (a.minSeq - b.minSeq);', 'const byRank = (a, b) => (Number(b.human) - Number(a.human)) || (b.minSeq - a.minSeq);']], walk: ['7-pick'], repro: () => { const r = REPROS.pressUnderLanes(DM); return { red: !r.ok || r.wait === null || r.wait > 20, said: J(r) }; } },
  { tag: 'owner-last', rule: 7, why: 'r8: the owner behind 180 agents', edits: [['const byRank = (a, b) => (Number(b.human) - Number(a.human)) || (a.minSeq - b.minSeq);', 'const byRank = (a, b) => (a.minSeq - b.minSeq);']], walk: ['7-pick'], repro: () => { const r = REPROS.ownerFirst(DM); return { red: r.pos >= 30, said: J(r) }; } },
  { tag: 'foreign-pass', rule: 10, why: 'r2: an answer from a fetch of another key', edits: [['    waiters: ids(pick.reqs),   // THE ROUND', '    waiters: ids(s.requests),']], walk: ['10-round', '10-honest'], repro: () => { const r = REPROS.foreignPass(DM); return { red: r.lies >= 10, said: J(r) }; } },
  { tag: 'backoff-door', rule: 5, why: 'r3: the back-off door open to agents — BOTH layers stripped (the judgement gate and the fetch-time owner-left check)', edits: [["    else return { refuse: true, code: 'backoff', rule: 'backoff' };   // THE BACK-OFF GATE", ''], ["  if (p.backoff && !pick.reqs.some((r) => r.origin === 'owner')) return { ...base, type: 'refuse', key: pick.key, code: 'backoff', rule: 'backoff', waiters: ids(pick.reqs) };", '']], walk: ['5-at-sight', '5-backoff-fetch'], repro: () => { const r = REPROS.backoffDoor(DM); return { red: r.agentCalls >= 10, said: J(r) }; } },
  { tag: 'every-press', rule: 5, why: 'r4 ruling: every press honoured', edits: [['  const pressFree = p.backoff && p.pressKey === null && s.backoff.pressEpoch !== s.backoff.epoch;', '  const pressFree = p.backoff;'], ['    const v = verdict(s, g, pressFree && granted === null);', '    const v = verdict(s, g, pressFree);']], walk: ['5-at-sight', '5-press', '5-one-press'], repro: () => { const r = REPROS.ownerOnce(DM); return { red: r.first > 1 || r.second > 0, said: J(r) }; } },
  { tag: 'refusal-at-end', rule: 5, why: 'r6: refusals delivered at the pass\'s end', edits: [['  if (first) return { ...none,', '  if (first && !queue.length) return { ...none,']], walk: ['5-at-sight'], repro: () => { const r = REPROS.refusalAtSight(DM); return { red: r.fetchesBefore === null || r.fetchesBefore > 10, said: J(r) }; } },
  { tag: 'ok-at-end', rule: 10, why: 'r6/r7: the ok held for the end', edits: [['    waiters: ids(pick.reqs),   // THE ROUND', '    waiters: [],']], walk: ['10-round'], repro: () => { const r = REPROS.okAtFetch(DM); return { red: r.answeredAt !== 1, said: J(r) }; } },
  { tag: 'no-interleave', rule: 8, why: 'r7: a stream starved the due list', edits: [['  if (p.last === \'request\' && !pick.due) { const t = queue.find((it) => it.due); if (t) pick = t; }   // THE INTERLEAVE', '']], walk: ['8-I1', '7-pick'], repro: () => { const r = REPROS.interleave(DM); return { red: r.duringStream < 35 || r.maxRequestRun > 1, said: J(r) }; } },
  { tag: 'no-reserve', rule: 1, why: 'r6: an agent storm refused the owner', edits: [["  const cap = origin === 'agent' ? REFRESH_QUEUE_CAP - REFRESH_OWNER_RESERVE : REFRESH_QUEUE_CAP;", '  const cap = REFRESH_QUEUE_CAP;']], walk: ['1-admission'], repro: () => { const r = REPROS.storm(DM); return { red: !(r.owner && r.owner.ok) || r.refusedAgents !== 20, said: J(r) }; } },
  { tag: 'never-join', rule: 17, why: 'r7: forced passes run thrice', edits: [['  if (prev) return { queued: { force: prev.force || force, origin: prev.origin }, joined: true };', '']], walk: ['17-one-queued'], repro: () => { const r = REPROS.forcedThrice(DM); return { red: r.queuedViolations > 0, said: J(r) }; } },
  { tag: 'force-not-sticky', rule: 17, why: 'r7: a forced ask coalesced away', edits: [['  if (prev) return { queued: { force: prev.force || force, origin: prev.origin }, joined: true };', '  if (prev) return { queued: { force, origin: prev.origin }, joined: true };']], walk: ['17-force'], repro: () => { const r = REPROS.forcedThrice(DM); return { red: r.forcedFetches !== 20 || r.queuedViolations > 0, said: J(r) }; } },
  { tag: 'judge-once', rule: 5, why: 'r5 Part 1: drained once, before the loop', edits: [['  const seen = s.requests;   // every waiter present', '  const seen = p.calls === 0 ? s.requests : s.requests.filter((r) => r.taken);   // every waiter present']], walk: ['5-at-sight', '5-accept', '16-end'], repro: () => { const r = REPROS.everyStep(DM); return { red: !(r.posNotDue >= 1 && r.posNotDue <= 2), said: J(r) }; } },
  { tag: 'round-widened', rule: 10, why: 'r4/r5: a request filed mid-fetch answered by it', edits: [['      drop(act.waiters);   // answered by the engine at this fetch', '      drop(requests.filter((r) => r.key === act.key).map((r) => r.id));   // answered by the engine at this fetch']], walk: ['22-lost'], repro: () => { const r = REPROS.oneKeyStream(DM); return { red: !r.allOk, said: J(r) }; } },
  { tag: 'budget-one-over', rule: 9, why: 'r7 B4: one over the budget', edits: [['  if (!(s.budget.remainingUnits > 0)) {\n    if (seen.length)', '  if (!(s.budget.remainingUnits > -1)) {\n    if (seen.length)']], walk: ['9-budget', '9-cut'], repro: () => { const r = REPROS.budgetCut(DM); return { red: r.calls > 10, said: J(r) }; } },
  { tag: 'cut-refuses-nothing', rule: 9, why: 'r6: the cut answered `0 new`', edits: [["    if (seen.length) return { ...base, type: 'refuse', key: null, code: 'vendor-budget', rule: 'cut', cut: true, waiters: ids(seen) };", "    if (seen.length) return { ...base, type: 'refuse', key: null, code: 'vendor-budget', rule: 'cut', cut: true, waiters: [] };"]], walk: ['9-cut'], repro: () => { const r = REPROS.budgetCut(DM); return { red: r.cut !== 5, said: J(r) }; } },
  { tag: 'no-share-at-fetch', rule: 11, why: 'r9: the share judged at the boundary only', edits: [["  if (!pick.due && !pick.human && !(s.agentShare.remaining > 0)) return { ...base, type: 'refuse', key: pick.key, code: 'vendor-budget', rule: 'share', waiters: ids(pick.reqs) };", '']], walk: ['11-share'], repro: () => { const r = REPROS.sharePerFetch(DM); return { red: r.agentFetches > 5, said: J(r) }; } },
  { tag: 'no-floor', rule: 5, why: 'the agent\'s floor', edits: [['  if (!human) { const last = Number(s.floors && s.floors[g.key]) || 0; if (last && s.now - last < s.floorMs) return { refuse: true, code: \'refresh-floor\', rule: \'floor\' }; }   // THE FLOOR', '']], walk: ['5-at-sight'], repro: () => { const r = REPROS.refusalAtSight(DM); return { red: r.code !== 'refresh-floor', said: J(r) }; } },
  { tag: 'discovery-first', rule: 12, why: 'r8 low: discovery ahead of a waiting human', edits: [['  if (p.discovery.wanted && !p.discovery.done && !humanWaiting && s.budget.remainingUnits > 0)', '  if (p.discovery.wanted && !p.discovery.done && s.budget.remainingUnits > 0)']], walk: ['12-human'], repro: () => { const r = REPROS.humanBeforeDiscovery(DM); return { red: r.discoverAt >= 0 && r.discoverAt < r.humanAt, said: J(r) }; } },
  { tag: 'no-bound', rule: 15, why: 'r8: a stream kept one pass alive forever', edits: [["  if (!duePending && p.streak >= STREAK_MAX) return { ...base, type: 'end', ok: true, why: null, carry: true, waiting: 0, timerWork: p.timerWork };   // THE BOUND", '']], walk: ['15-bound'], repro: () => { const r = REPROS.bound(DM); return { red: !r.carry, said: J(r) }; } },
  { tag: 'stop-ignored', rule: 2, why: 'r8 low: a stopped pass kept fetching', edits: [['  if (s.stopped || s.dropped) {', '  if (false) {']], walk: ['2-stop'], repro: () => { const r = REPROS.stopMidPass(DM); return { red: r.callsAfterStop > 0, said: J(r) }; } },
  { tag: 'due-again-lost', rule: 13, why: 'a key fetched twice for one epoch', edits: [['    if (f !== undefined && !(dueAt > f)) continue;   // fetched this pass and not due again', '']], walk: ['13-refetch', '13-turn'], repro: () => { const r = REPROS.dueAgain(DM); return { red: r.twice > 1, said: J(r) }; } },
  // rule 18 (lane R5) — the pace's own mutants
  { tag: 'pace-no-refill', rule: 18, why: 'a bucket that never refills', edits: [['  return Math.min(Number(pace.burst) || 0, (Number(pace.tokens) || 0) + (dt * (Number(pace.unitsPerSec) || 0)) / 1000);', '  return Math.min(Number(pace.burst) || 0, (Number(pace.tokens) || 0) + dt * 0);']], walk: ['18-needless-wait', '16-end'], repro: () => { const r = REPROS.firstIngest(DM); return { red: r.calls < 873, said: J({ calls: r.calls, waits: r.waits }) }; } },
  { tag: 'pace-ignored', rule: 18, why: 'a fetch that ignores the wait — the burst the vendor refused', edits: [['  if (!(ms > 0)) return act;', '  return act;']], walk: ['18-pace', '18-window'], repro: () => { const r = REPROS.firstIngest(DM); return { red: r.max1s > 80, said: J({ max1s: r.max1s, calls: r.calls }) }; } },
  { tag: 'wait-counts', rule: 18, why: 'a wait that counts against the request cap (rule 15\'s bound)', edits: [['    case \'wait\':   // rule 18: the engine sleeps between two steps — nothing about the pass moves\n      break;', '    case \'wait\':\n      if (p) p.streak++;\n      break;']], walk: ['15-bound'], repro: () => { const r = REPROS.pacedBound(DM); return { red: r.firstFetches < K, said: J(r) }; } },
  { tag: 'wait-before-refusal', rule: 18, why: 'a refusal held behind the pace (rule 5 answers at sight)', edits: [["  if (first) return { ...none, type: 'refuse',", "  if (first && s.pace && paceWaitMs(s.pace, s.now, paceCost(s.pace, 'fetch')) > 0) return { ...none, type: 'wait', ms: paceWaitMs(s.pace, s.now, paceCost(s.pace, 'fetch')), next: 'fetch', key: null };\n  if (first) return { ...none, type: 'refuse',"]], walk: ['5-at-sight'], repro: () => { const r = REPROS.refusalDuringWait(DM); return { red: r.heldMs === null || r.heldMs > 500, said: J(r) }; } },
  { tag: 'wait-unbounded', rule: 18, why: 'one wait for the whole shortfall (the drain not asked again for 10 s)', edits: [['  return Math.max(1, Math.min(PACE_WAIT_MAX_MS, Math.ceil((short * 1000) / r)));', '  return Math.max(1, Math.ceil((short * 1000) / r));']], walk: ['18-wait-ms'], repro: () => { const r = REPROS.overBurst(DM); return { red: r.maxWait > 1000, said: J(r) }; } },
];
let DM = null;
for (const m of MUTANTS) {
  const mm = mutant(m.tag, m.edits);
  if (!ok(mm.setup, `MUTANT setup · ${m.tag} (rule ${m.rule}, ${m.why}) is reconstructed from the shipped bytes`, mm.why)) continue;
  DM = mm.D;
  let rep;
  try { rep = m.repro(); } catch (e) { rep = { red: true, said: 'threw: ' + e.message }; }
  const hit = walkMutant(DM, m.walk);
  const named = m.walk.filter((k) => hit[k]);
  ok(rep.red && named.length > 0, `MUTANT ${m.tag}: its repro goes red (${rep.said.slice(0, 160)}) AND the walk names rule ${m.rule}'s invariant (${named.map((k) => `${k} ×${hit[k]}`).join(', ')})`, `repro red ${rep.red}; walk hit ${J(hit)}`);
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: MUTANTS.length })) ok(r.pass, r.name, r.detail);
// the 70-cell table under the three mutants whose rule it pins most directly
{
  const redCells = (tag, edits) => { const mm = mutant(tag + '-table', edits); return mm.setup ? table(mm.D).filter((x) => x.problems.length).map((x) => `${x.c.state}/${x.c.origin}/${x.c.N}${x.c.distinct ? 'd' : ''}`) : ['setup']; };
  const a = redCells('every-press', MUTANTS.find((m) => m.tag === 'every-press').edits);
  ok(a.length >= 2 && a.every((x) => x.startsWith('backoff/owner')), `MUTANT every-press turns the table's back-off owner cells red (${a.join(', ')})`);
  const b = redCells('no-ride', MUTANTS.find((m) => m.tag === 'no-ride').edits);
  ok(b.some((x) => /\/5$|\/20$/.test(x)), `MUTANT no-ride turns the table's many-callers-one-key cells red (${b.slice(0, 8).join(', ')})`);
  const c = redCells('backoff-door', MUTANTS.find((m) => m.tag === 'backoff-door').edits);
  ok(c.some((x) => x.startsWith('backoff/agent')), `MUTANT backoff-door turns the table's back-off agent cells red (${c.slice(0, 8).join(', ')})`);
}

// ═══ ④b RULE 20 (lane channel-threads) — the reaction trickle + the thread walk, as a seeded walk ════════
// A driver in the engine's shape: three windows on ONE conversation (200 rows) scroll end to end in 10 s and keep
// asking for their visible rows (≤ 12, debounced 800 ms) for three minutes; a list call takes 150–600 ms; the
// minute's vendor budget (rule 9, 60 units, a background timer spending its part) is asked before each call and CUTS
// by name; a clicker opens the thread pane on 50 roots in a row (attack 8). Invariants at EVERY step: ≤ perMinute
// list calls in ANY 60 s (a sliding window), one flight per message, no message asked twice inside the floor,
// every refusal named from the closed set, the budget never over-spent, ≤ 1 walk per thread per floor — and each
// clause EXERCISED (a walk that never met the ceiling proves nothing about it). Then a mutant per clause.
console.log('④b RULE 20: the reaction trickle (one flight, the floor, the sliding per-minute ceiling, the cut) + the thread walk floor');
// verify r2 — the r1 SHAPES as options: `hidden` (window 1 is hidden 20 s → 140 s: the client's observer reports no
// visible row, so it asks NOTHING; its return asks ONE batch of its current viewport, never what it missed), `reconnect`
// (every 30 s every window re-asks its viewport in the SAME instant — a ws reconnect storm), `convs: 2` (windows on TWO
// conversations of one account: the memory is per conversation, the ceiling per ACCOUNT, and the rows share vendor ids
// — a Slack `ts` repeats across channels — so one conversation's floor never refuses the other's row).
function rx20Walk(D, seed, { perMinute = 20, floorMs = D.REACTIONS_FLOOR_MS, budget = 60, steps = 1800, slow = false, hidden = false, reconnect = false, convs = 1 } = {}) {
  const rnd = mulberry32(seed);
  const W = { t: T0, mem: new Map(), minute: null, flights: new Map(), calls: [], asks: new Map(), budgetAt: T0, spent: 0, refusals: 0, violations: [], seen: { join: 0, floor: 0, ceiling: 0, cut: 0, calls: 0, hiddenQuiet: 0, returns: 0, reconnects: 0, conv1: 0 }, th: new Map(), thFlight: new Map(), walks: [], thSeen: { join: 0, floor: 0, walk: 0 } };
  const rows = Array.from({ length: 200 }, (_, i) => 'om_' + String(i).padStart(3, '0'));
  const wins = [0, 1, 2].map((k) => ({ pos: k * 60, next: T0 + k * 97, conv: convs === 2 && k === 2 ? 1 : 0, wasHidden: false }));
  const isHidden = (k) => hidden && k === 1 && W.t - T0 >= 20e3 && W.t - T0 < 140e3;
  // the memory is PER CONVERSATION (the engine's rxMapOf(e, `${adapterId}/${convId}`)); the key below is that pair
  const mk = (w, id) => `${w.conv}|${id}`;
  const CODES = new Set(['reactions-floor', 'vendor-budget', 'bad-request']);
  for (let step = 0; step < steps; step++) {
    W.t += 100;
    if (W.t - W.budgetAt >= 60e3) { W.budgetAt = W.t; W.spent = 0; }
    if (step % 10 === 0 && W.spent < budget) W.spent += 1;   // the timer's own passes take a share of the minute
    for (const [id, end] of [...W.flights]) if (end <= W.t) { W.flights.delete(id); W.mem.set(id, D.rxApply(W.mem.get(id), 'landed', W.t)); }
    for (const [k, end] of [...W.thFlight]) if (end <= W.t) { W.thFlight.delete(k); W.th.set(k, D.threadApply(W.th.get(k), 'landed', W.t)); }
    // the windows: a storm for 10 s, then an occasional scroll (a reconnect storm: every window re-asks at once)
    const storm = reconnect && step > 0 && (W.t - T0) % 30e3 === 0;
    if (storm) W.seen.reconnects++;
    for (const [k, w] of wins.entries()) {
      if (W.t < w.next && !storm) continue;
      if (!storm) w.pos = W.t - T0 < 10e3 ? (w.pos + 7) % 188 : (rnd() < 0.3 ? Math.floor(rnd() * 188) : w.pos);
      w.next = W.t + 800;
      if (isHidden(k)) { w.wasHidden = true; W.seen.hiddenQuiet++; continue; }   // a hidden window's observer reports no row: NOTHING asked
      const returning = w.wasHidden; w.wasHidden = false;
      const ids = rows.slice(w.pos, w.pos + 12);
      if (returning) { W.seen.returns++; if (ids.length > D.REACTIONS_BATCH_MAX) W.violations.push('20-return-batch'); }
      const v = D.reactionsVerdict({ ids, mem: (id) => W.mem.get(mk(w, id)), now: W.t, floorMs, perMinute, minute: W.minute });
      W.minute = v.minute;
      W.seen.join += v.join.length;
      for (const r of v.refused) { if (!CODES.has(r.code)) W.violations.push(`20-named:${r.code}`); if (r.rule === 'floor') W.seen.floor++; if (r.rule === 'ceiling') W.seen.ceiling++; W.refusals++; }
      for (const id of v.ask) {
        const key = mk(w, id);
        if (W.flights.has(key)) W.violations.push(`20-one-flight:${key}`);
        const last = W.asks.get(key);
        if (last !== undefined && W.t - last < floorMs) W.violations.push(`20-floor:${key}`);
        W.asks.set(key, W.t);
        W.mem.set(key, D.rxApply(W.mem.get(key), 'ask', W.t));
      }
      // the engine asks the OUTER caps before each call — the minute's budget cuts the rest by name
      for (let i = 0; i < v.ask.length; i++) {
        const key = mk(w, v.ask[i]);
        if (W.spent >= budget) { for (const rest of v.ask.slice(i)) { W.mem.set(mk(w, rest), D.rxApply(W.mem.get(mk(w, rest)), 'failed', W.t)); W.seen.cut++; } break; }
        W.spent += 1;
        W.calls.push(W.t);
        W.seen.calls++;
        if (w.conv === 1) W.seen.conv1++;
        W.flights.set(key, W.t + (slow ? 1500 + Math.floor(rnd() * 2500) : 150 + Math.floor(rnd() * 450)));   // `slow` = a vendor slower than the window's re-ask
      }
      if (W.spent > budget) W.violations.push('9-budget');
      const inWindow = W.calls.filter((x) => W.t - x < 60e3).length;
      if (inWindow > perMinute) W.violations.push(`20-ceiling:${inWindow}`);
    }
    // the clicker: the pane opened on 50 roots in a row, again and again (attack 8)
    if (step % 3 === 0) {
      const k = 'omt_' + Math.floor(rnd() * 50);
      const v = D.threadVerdict(W.th.get(k), W.t, D.THREAD_FLOOR_MS);
      if (v.act === 'join') W.thSeen.join++;
      else if (v.act === 'floor') W.thSeen.floor++;
      else {
        const prev = W.walks.filter((x) => x.k === k).pop();
        if (prev && W.t - prev.t < D.THREAD_FLOOR_MS) W.violations.push(`20a-floor:${k}`);
        if (W.thFlight.has(k)) W.violations.push(`20a-one-flight:${k}`);
        W.walks.push({ k, t: W.t }); W.thSeen.walk++;
        W.th.set(k, D.threadApply(W.th.get(k), 'ask', W.t));
        W.thFlight.set(k, W.t + 300 + Math.floor(rnd() * 900));
      }
    }
  }
  return W;
}
{
  let agg = { join: 0, floor: 0, ceiling: 0, cut: 0, calls: 0 }, thAgg = { join: 0, floor: 0, walk: 0 }, bad = [];
  for (let i = 0; i < 24; i++) {
    const W = rx20Walk(D0, 9001 + i * 17, i % 3 === 2 ? { budget: 18 } : {});
    for (const k of Object.keys(agg)) agg[k] += W.seen[k];
    for (const k of Object.keys(thAgg)) thAgg[k] += W.thSeen[k];
    bad.push(...W.violations.slice(0, 3));
  }
  ok(!bad.length, `RULE 20 walk: 24 seeds × 1 800 steps — ≤ 20 list calls in ANY 60 s, one flight per message, the 300 s floor, every refusal named, the budget never over-spent, one walk per thread per 60 s (${agg.calls} calls, ${thAgg.walk} walks)`, bad.slice(0, 6).join(' | '));
  const short = [0, 1, 2, 3].flatMap((i) => rx20Walk(D0, 7001 + i * 13, { floorMs: 100, slow: true, perMinute: 600, budget: 600 }).violations.filter((x) => x.startsWith('20-one-flight')));
  ok(!short.length, 'with a floor SHORTER than a flight (100 ms) the real verdict still holds ONE flight per message (the join is the belt)', short.slice(0, 4).join(' | '));
  ok(agg.join > 0 && agg.floor > 0 && agg.ceiling > 0 && agg.cut > 0 && thAgg.join > 0 && thAgg.floor > 0, `…and every clause was EXERCISED (joins ${agg.join}, floors ${agg.floor}, ceilings ${agg.ceiling}, budget cuts ${agg.cut}; thread joins ${thAgg.join}, floors ${thAgg.floor})`);
  // verify r2: the r1 SHAPES — a hidden window, a reconnect storm, two conversations on one account — every invariant
  // above still holds on each, and each shape is EXERCISED
  {
    const shapes = { hidden: { hidden: true }, reconnect: { reconnect: true }, 'two conversations': { convs: 2 }, 'all three': { hidden: true, reconnect: true, convs: 2 } };
    const bad2 = [], seen2 = {};
    for (const [name, o] of Object.entries(shapes)) {
      const s2 = { calls: 0, hiddenQuiet: 0, returns: 0, reconnects: 0, conv1: 0 };
      for (let i = 0; i < 8; i++) { const W = rx20Walk(D0, 5101 + i * 29, o); bad2.push(...W.violations.slice(0, 2).map((x) => `${name}:${x}`)); for (const k of Object.keys(s2)) s2[k] += W.seen[k]; }
      seen2[name] = s2;
    }
    ok(!bad2.length, `RULE 20 walk, the r1 shapes (a hidden window, a reconnect storm, two conversations on one account, all three at once — 8 seeds each): ≤ 20 list calls in ANY 60 s, one flight per message per conversation, the floor, every refusal named, the budget, a returning window asks ONE batch`, bad2.slice(0, 6).join(' | '));
    ok(seen2.hidden.hiddenQuiet > 0 && seen2.hidden.returns > 0 && seen2.reconnect.reconnects > 0 && seen2['two conversations'].conv1 > 0 && seen2['all three'].returns > 0 && seen2['all three'].conv1 > 0, `…and each shape was EXERCISED (hidden beats that asked nothing ${seen2.hidden.hiddenQuiet}, returns ${seen2.hidden.returns}; reconnect storms ${seen2.reconnect.reconnects}; the second conversation's calls ${seen2['two conversations'].conv1})`, JSON.stringify(seen2));
    const Wr = rx20Walk(D0, 4242, { reconnect: true, steps: 600 });
    const firstR = Wr.calls.filter((x) => x - T0 < 60e3).length;
    ok(firstR <= 20, `a reconnect storm (every window re-asking at once, every 30 s) on top of the 3-window scroll storm still spends ≤ 20 list calls in its first minute (${firstR})`);
  }
  // the owner's scroll-storm number (spec §7.3 f): 3 windows × 200 rows in 10 s ⇒ ≤ 20 list calls in the first minute
  const W1 = rx20Walk(D0, 4242, { steps: 600 });
  const first = W1.calls.filter((x) => x - T0 < 60e3).length;
  ok(first <= 20 && first >= 12, `a 3-window scroll storm over a 200-row room spends ${first} reaction list calls in its first minute (≤ 20 — the rest drawn from the stored fold)`);
  // the tables
  const mem = new Map([['a', { askedAt: T0, inflight: true, fetchedAt: 0 }], ['b', { askedAt: T0 - 10e3, inflight: false, fetchedAt: T0 - 9e3 }]]);
  const v = D0.reactionsVerdict({ ids: ['a', 'b', 'c', 'c', 'd'], mem: (id) => mem.get(id), now: T0, perMinute: 1 });
  ok(J(v.join) === J(['a']) && J(v.ask) === J(['c']) && v.refused.map((r) => `${r.id}:${r.code}:${r.rule}`).join(',') === 'b:reactions-floor:floor,d:vendor-budget:ceiling' && v.refused[0].retryAfterMs === D0.REACTIONS_FLOOR_MS - 10e3, 'the verdict table: in flight ⇒ join; asked 10 s ago ⇒ reactions-floor with the wait; a duplicate id counted once; past the ceiling ⇒ vendor-budget (ceiling) — in that ORDER', J(v));
  const z = D0.reactionsVerdict({ ids: ['x'], mem: () => null, now: T0, perMinute: 0 });
  ok(z.ask.length === 0 && z.refused[0].code === 'vendor-budget' && z.refused[0].retryAfterMs === null, 'perMinute 0 = never list (events only): every id refused, no wait promised');
  const big = D0.reactionsVerdict({ ids: Array.from({ length: 25 }, (_, i) => 'x' + i), mem: () => null, now: T0, perMinute: 100 });
  ok(big.ask.length === 20 && big.refused.filter((r) => r.rule === 'batch').length === 5, 'a batch holds at most 20 ids — the rest refused bad-request by name');
  const sl = D0.rxMinuteAt({ calls: [T0 - 61e3, T0 - 30e3, T0 - 1] }, T0);
  ok(sl.n === 2 && sl.at === T0 - 30e3, 'the minute SLIDES: a call 61 s ago is gone, the next slot frees 60 s after the oldest kept');
  // verify r3: rxRelease — a batch cut part-way gives back EXACTLY the slots of the rows it never sent (the newest
  // reservations at the verdict's instant), never another instant's, never below none
  const rsv = D0.rxReserve(D0.rxReserve(D0.rxReserve({ calls: [T0 - 30e3] }, T0), T0), T0);
  const rel = D0.rxRelease(rsv, 2, T0, T0 + 1);
  const rel9 = D0.rxRelease(rsv, 9, T0, T0 + 1);
  const relOther = D0.rxRelease(rsv, 2, T0 - 5, T0 + 1);
  ok(rsv.n === 4 && rel.n === 2 && J(rel.calls) === J([T0 - 30e3, T0]) && rel9.n === 1 && J(rel9.calls) === J([T0 - 30e3]) && relOther.n === 4 && D0.rxRelease(null, 3, T0, T0).n === 0, 'rxRelease: two of three reservations made at the verdict\'s instant given back (the older call kept); asking more than there are releases only those; another instant\'s release takes nothing; an empty minute stays empty', J([rel, rel9, relOther]));
  ok(D0.threadVerdict({ askedAt: T0, inflight: true }, T0).act === 'join' && D0.threadVerdict({ askedAt: T0 - 5e3 }, T0).act === 'floor' && D0.threadVerdict({ askedAt: T0 - 61e3 }, T0).act === 'vendor' && D0.threadVerdict(null, T0).act === 'vendor', 'the thread walk table: in flight ⇒ join, inside 60 s ⇒ floor, else the vendor');
  // a mutant per clause, each turning its own invariant red
  const R20 = [
    // the floor alone would hide it (a flight shorter than 300 s is floored anyway) — the join is the belt for a flight
    // that outlasts the floor, so its walk runs a 100 ms floor (the real module holds one flight there too — below)
    { tag: 'rx-no-join', edits: [["    if (x.inflight) { join.push(id); continue; }", '']], want: '20-one-flight', opts: { floorMs: 100, slow: true, perMinute: 600, budget: 600 } },
    { tag: 'rx-no-floor', edits: [["    if (asked > 0 && t - asked < floorMs && t >= asked) { refused.push({ id, code: 'reactions-floor', rule: 'floor', retryAfterMs: Math.max(1, floorMs - (t - asked)) }); continue; }", '']], want: '20-floor' },
    { tag: 'rx-no-ceiling', edits: [["    if (m.n >= cap) { refused.push({ id, code: 'vendor-budget', rule: 'ceiling', retryAfterMs: cap ? Math.max(1, m.at + 60e3 - t) : null }); continue; }", '']], want: '20-ceiling' },
    { tag: 'rx-tumbling', edits: [["  const calls = (minute && Array.isArray(minute.calls) ? minute.calls : []).map(Number).filter((x) => Number.isFinite(x) && x <= t && t - x < 60e3).sort((a, b) => a - b);", "  const m0 = (minute && Array.isArray(minute.calls) ? minute.calls : []).map(Number).sort((a, b) => a - b);\n  const calls = m0.length && t - m0[0] < 60e3 ? m0 : [];"]], want: '20-ceiling' },
    { tag: 'th-no-floor', edits: [["  if (asked > 0 && t >= asked && t - asked < floorMs) return { act: 'floor', retryAfterMs: Math.max(1, floorMs - (t - asked)) };", '']], want: '20a-floor' },
  ];
  for (const m of R20) {
    const mu = mutant(m.tag, m.edits);
    if (!mu.setup) { ok(false, `MUTANT ${m.tag}: setup`, mu.why); continue; }
    let hit = 0;
    for (let i = 0; i < 6 && !hit; i++) hit += rx20Walk(mu.D, 9001 + i * 17, m.opts || {}).violations.filter((x) => x.startsWith(m.want)).length;
    ok(hit > 0, `MUTANT ${m.tag} turns the walk's ${m.want} invariant red (${hit} violations)`);
  }
}

// ═══ ④c RULE 21 (lane lark-search-poll) — the change feed: a table in the model's own terms + a mutant per clause ═══
console.log('④c RULE 21: the change feed — its order (a human first, before discovery, before plain rows), its two bounds, a skip, rule 3');
/** One scripted feed: `pages` = the answers, in order (`more` on all but the last unless told). */
const feedOf = (pages, o = {}) => ({ perPass: o.perPass ?? 5, perMin: o.perMin ?? 10, answer: () => (pages.length ? pages.shift() : { due: [], more: false }) });
const R21 = {
  /** THE ORDER: a human's request, the feed (two pages), discovery, the feed's rows, then the plain due rows. */
  order(D) {
    const sim = account(D, { keys: 12, feed: feedOf([{ due: [{ key: keyOf(9), dueAt: T0 }], more: true }, { due: [{ key: keyOf(10), dueAt: T0 }, { key: keyOf(9), dueAt: T0 }], more: false }]) });
    sim.W.discoveryDue = true;
    sim.file('owner', keyOf(3));
    const end = sim.runPass({ origin: 'timer' });
    return { log: sim.vendorLog.map((v) => (v.type === 'fetch' ? v.key.slice(5) : v.type)), end, v: sim.violations };
  },
  /** THE FEED'S OWN MINUTE spent: no page; the pass runs as a feed-less one. */
  minute(D) {
    const sim = account(D, { keys: 4, feed: feedOf([{ due: [], more: false }], { perMin: 2 }) });
    sim.W.feed.calls.push(T0 + 31e3 - 30e3, T0 + 31e3 - 10e3);
    const end = sim.runPass({ origin: 'timer' });
    return { feeds: sim.vendorLog.filter((v) => v.type === 'feed').length, fetches: sim.vendorLog.filter((v) => v.type === 'fetch').length, end };
  },
  /** THE MINUTE'S BUDGET spent: no page (rule 9 is the outer cap). */
  budget(D) {
    const sim = account(D, { keys: 4, limit: 3, feed: feedOf([{ due: [], more: false }]) });
    sim.W.spent = 3;
    const end = sim.runPass({ origin: 'timer' });
    return { feeds: sim.vendorLog.filter((v) => v.type === 'feed').length, end };
  },
  /** A FEED-LOCAL REFUSAL: the feed ends, the pass goes on and ends ok. */
  skip(D) {
    const sim = account(D, { keys: 4, feed: feedOf([{ skip: 'rate-limited' }]) });
    const end = sim.runPass({ origin: 'timer' });
    return { feeds: sim.vendorLog.filter((v) => v.type === 'feed').length, fetches: sim.vendorLog.filter((v) => v.type === 'fetch').length, ok: end.ok, failed: sim.lastPass.failed };
  },
  /** AN ACCOUNT FAILURE on a page: rule 3 — the pass fails, nothing more is fetched. */
  error(D) {
    const sim = account(D, { keys: 4, feed: feedOf([{ error: 'auth-expired' }]) });
    const end = sim.runPass({ origin: 'timer' });
    return { feeds: sim.vendorLog.filter((v) => v.type === 'feed').length, fetches: sim.vendorLog.filter((v) => v.type === 'fetch').length, ok: end.ok, why: end.why };
  },
  /** A request-only pass (no timer's turn) and a back-off pass: no page. */
  noTimer(D) {
    const a = account(D, { keys: 4, feed: feedOf([{ due: [], more: false }]) });
    a.file('agent', keyOf(1));
    a.runPass({ origin: 'request' });
    const b = account(D, { keys: 4, feed: feedOf([{ due: [], more: false }]), backoffUntil: T0 + 120e3, epoch: 1, failures: 1 });
    b.file('owner', keyOf(1));
    b.runPass({ origin: 'timer' });
    return { request: a.vendorLog.filter((v) => v.type === 'feed').length, backoff: b.vendorLog.filter((v) => v.type === 'feed').length };
  },
  /** THE PER-PASS BOUND: a vendor that always says `more` gets perPass pages a pass, never more. */
  bound(D) {
    const sim = account(D, { keys: 2, feed: { perPass: 3, perMin: 100, answer: () => ({ due: [], more: true }) } });
    sim.runPass({ origin: 'timer' });
    return { feeds: sim.vendorLog.filter((v) => v.type === 'feed').length };
  },
  /** A key this pass fetched is due again only for a NEWER hit (rule 13). */
  again(D) {
    const sim = account(D, { keys: 3, dueOnly: [0], feed: feedOf([]) });
    let n = 0;
    sim.hooks.afterFetch = (act) => { if (act.key === keyOf(0) && n++ === 0) { sim.W.feed.answer = (() => { const q = [{ due: [{ key: keyOf(0), dueAt: T0 }], more: true }, { due: [{ key: keyOf(0), dueAt: T0 + 10 * 60e3 }], more: false }]; return () => (q.length ? q.shift() : { due: [], more: false }); })(); } };
    // the feed runs FIRST in a pass — so the scenario: page 1 answers nothing, the key is fetched, then the next pass …
    sim.W.feed.answer = (() => { const q = [{ due: [], more: false }]; return () => (q.length ? q.shift() : { due: [], more: false }); })();
    sim.runPass({ origin: 'timer' });
    const snap0 = sim.snap;
    // the model's own merge: a stale hit on a fetched key is dropped, a newer one re-added
    const p = { ...D.open(D.empty(), { origin: 'timer' }).pass, fetchedAt: { [keyOf(0)]: T0 + 31e3 }, due: [{ key: keyOf(1), dueAt: 0 }] };
    const stale = D.mergeFront(p, [{ key: keyOf(0), dueAt: T0 }], []).map((d) => d.key);
    const newer = D.mergeFront(p, [{ key: keyOf(0), dueAt: T0 + 60e3 }], []).map((d) => d.key);
    return { stale, newer, snap0: !!snap0 };
  },
};
{
  const o = R21.order(D0);
  ok(J(o.log) === J(['c0003', 'feed', 'feed', 'discover', 'c0010', 'c0009', 'c0000', 'c0001', 'c0002', 'c0004', 'c0005', 'c0006', 'c0007', 'c0008', 'c0011']) && o.v.length === 0, 'rule 21 ORDER: the owner\'s request first, then the feed\'s two pages, then discovery, then the feed\'s rows (the NEWEST page\'s order first — page 2 named c0010 then c0009, moving the pending c0009 up again), then the plain due rows', J(o.log));
  const m = R21.minute(D0);
  ok(m.feeds === 0 && m.fetches === 4 && m.end.ok, 'rule 21: the feed\'s own minute spent ⇒ no page (silently — nobody waits on it); the pass is a plain one', J(m));
  const b = R21.budget(D0);
  ok(b.feeds === 0, 'rule 21: the minute\'s budget spent ⇒ no page (rule 9 stays the outer cap)', J(b));
  const k = R21.skip(D0);
  ok(k.feeds === 1 && k.fetches === 4 && k.ok && !k.failed, 'rule 21: a FEED-LOCAL refusal (its own rate tier / scope) ends the feed and never the pass — every due row still fetched, the pass ok', J(k));
  const e = R21.error(D0);
  ok(e.feeds === 1 && e.fetches === 0 && !e.ok && e.why === 'auth-expired', 'rule 21: an ACCOUNT failure on a page is rule 3 — the pass fails by the account\'s code, nothing more is sent', J(e));
  const n = R21.noTimer(D0);
  ok(n.request === 0 && n.backoff === 0, 'rule 21: a request-only pass and a back-off pass (the owner\'s one press) send no feed page', J(n));
  const bd = R21.bound(D0);
  ok(bd.feeds === 3, 'rule 21: a vendor that always says `more` gets perPass (3) pages a pass, never more', J(bd));
  const ag = R21.again(D0);
  ok(J(ag.stale) === J([keyOf(1)]) && J(ag.newer) === J([keyOf(0), keyOf(1)]), 'rule 21 × 13: a key this pass fetched is due again only for a hit NEWER than the fetch — a stale hit is dropped, a newer one goes to the front', J(ag));
}
{
  const MUT21 = [
    { tag: 'feed-ahead-of-human', clause: 'never ahead of a waiting human', edits: [['  if (!f || !f.wanted || f.done || p.backoff || !p.timerWork || humanWaiting) return false;', '  if (!f || !f.wanted || f.done || p.backoff || !p.timerWork) return false;']], walk: ['f21-human'], repro: (D) => { const r = R21.order(D); return { red: r.log[0] !== 'c0003', said: J(r.log.slice(0, 4)) }; } },
    { tag: 'feed-minute-ignored', clause: 'its own sliding minute', edits: [['  if (!(s.feedPages && Number(s.feedPages.remaining) > 0)) return false;', '']], walk: ['f21-minute'], repro: (D) => { const r = R21.minute(D); return { red: r.feeds > 0, said: J(r) }; } },
    { tag: 'feed-rows-tail', clause: 'its rows ahead of the plain due rows', edits: [['  return front.concat(p.due.filter((d) => !moved.has(d.key)));', '  return p.due.filter((d) => !moved.has(d.key)).concat(front);']], walk: ['f21-front'], repro: (D) => { const r = R21.order(D); return { red: r.log.indexOf('c0009') > r.log.indexOf('c0000'), said: J(r.log.slice(3, 8)) }; } },
    { tag: 'feed-skip-fails', clause: 'a feed-local refusal never fails the pass', edits: [["      if (result && result.skip) { p.feed = { ...p.feed, wanted: false, done: true, skipped: String(result.skip) }; break; }", "      if (result && result.skip) { p.failed = String(result.skip); break; }"]], walk: ['f21-skip-fails'], repro: (D) => { const r = R21.skip(D); return { red: !r.ok || r.fetches < 4, said: J(r) }; } },
    { tag: 'feed-unbounded', clause: 'at most perPass pages a pass (both layers stripped)', edits: [['  return f.pages < (Number(f.perPass) || FEED_PAGES_PER_PASS);\n}', '  return true;\n}'], ['      { const more = !!(result && result.more) && p.feed.pages < (Number(p.feed.perPass) || FEED_PAGES_PER_PASS);', '      { const more = !!(result && result.more);']], walk: ['f21-per-pass'], repro: (D) => { const r = R21.bound(D); return { red: r.feeds > 3, said: J(r) }; } },
  ];
  for (const m of MUT21) {
    const mm = mutant(m.tag, m.edits);
    if (!ok(mm.setup, `MUTANT setup · ${m.tag} (rule 21: ${m.clause}) is reconstructed from the shipped bytes`, mm.why)) continue;
    let rep;
    try { rep = m.repro(mm.D); } catch (e) { rep = { red: true, said: 'threw: ' + e.message }; }
    const hit = {};
    for (let i = 0; i < 8 && !m.walk.some((k) => hit[k]); i++) {
      let r;
      try { r = walk(mm.D, 4242 + i * 97, 'mixed', 900, { forceFeed: true }); } catch (e) { hit['threw'] = (hit['threw'] || 0) + 1; continue; }
      for (const v of r.sim.violations) { const kk = v.split(':')[0]; hit[kk] = (hit[kk] || 0) + 1; }
    }
    const named = m.walk.filter((k) => hit[k]);
    ok(rep.red && named.length > 0, `MUTANT ${m.tag}: its table row goes red (${String(rep.said).slice(0, 140)}) AND the walk names rule 21's invariant (${named.map((k) => `${k} ×${hit[k]}`).join(', ')})`, `repro red ${rep.red}; walk hit ${J(hit)}`);
  }
}

// ═══ ④d RULE 22 (lane lark-threads) — the recent-roots recheck: the due list, the order, the bounds, the press ═══
console.log('④d RULE 22: the recent-roots recheck — the PURE due list, the lowest priority, its bounds, the owner\'s press');
const recheckOf = (keys, o = {}) => ({ perPass: o.perPass ?? 3, due: () => keys.map((k) => ({ key: k, dueAt: 0 })), answer: o.answer || (() => ({})) });
const R22 = {
  /** THE ORDER: a human's request, the due rows, then — nothing else pending — the armed rechecks (oldest first). */
  order(D) {
    const sim = account(D, { keys: 4, dueOnly: [0, 1], recheck: recheckOf([keyOf(2), keyOf(3), keyOf(0)]) });
    sim.file('owner', keyOf(3));
    const end = sim.runPass({ origin: 'timer' });
    return { log: sim.vendorLog.map((v) => `${v.type === 'fetch' ? 'f' : v.type}:${v.key ? v.key.slice(5) : ''}`), end, v: sim.violations };
  },
  /** THE PER-PASS BOUND: five armed, perPass 2 ⇒ two rechecks; a second turn in the pass re-arms nothing. */
  bound(D) {
    const sim = account(D, { keys: 6, dueOnly: [], recheck: recheckOf([keyOf(0), keyOf(1), keyOf(2), keyOf(3), keyOf(4)], { perPass: 2 }) });
    sim.W.timerDue = true;
    sim.runPass({ origin: 'timer' });
    return { rechecks: sim.vendorLog.filter((v) => v.type === 'recheck').map((v) => v.key.slice(5)), v: sim.violations };
  },
  /** A back-off pass (the owner's one press), a request-only pass, the minute spent: no recheck. */
  never(D) {
    const a = account(D, { keys: 4, dueOnly: [], recheck: recheckOf([keyOf(1)]), backoffUntil: T0 + 120e3, epoch: 1, failures: 1 });
    a.file('owner', keyOf(1)); a.runPass({ origin: 'timer' });
    const b = account(D, { keys: 4, dueOnly: [], recheck: recheckOf([keyOf(1)]) });
    b.file('agent', keyOf(2)); b.runPass({ origin: 'request' });
    const c = account(D, { keys: 4, dueOnly: [], limit: 3, recheck: recheckOf([keyOf(1)]) });
    c.W.spent = 3; c.runPass({ origin: 'timer' });
    const n = (x) => x.vendorLog.filter((v) => v.type === 'recheck').length;
    return { backoff: n(a), request: n(b), budget: n(c) };
  },
  /** A conversation-level refusal ends that recheck, never the pass; an account failure is rule 3. */
  refusals(D) {
    const a = account(D, { keys: 4, dueOnly: [], recheck: recheckOf([keyOf(1), keyOf(2)], { answer: (api, k) => (k === keyOf(1) ? { skip: 'not-found' } : {}) }) });
    const ea = a.runPass({ origin: 'timer' });
    const b = account(D, { keys: 4, dueOnly: [], recheck: recheckOf([keyOf(1), keyOf(2)], { answer: () => ({ error: 'auth-expired' }) }) });
    const eb = b.runPass({ origin: 'timer' });
    return { skipOk: ea.ok, skipN: a.vendorLog.filter((v) => v.type === 'recheck').length, errOk: eb.ok, errWhy: eb.why, errN: b.vendorLog.filter((v) => v.type === 'recheck').length };
  },
  /** 22b: the owner's press carries `recheck`; a window's open and an agent's refresh never do. */
  press(D) {
    const out = {};
    for (const origin of ['owner', 'open', 'agent']) {
      const sim = account(D, { keys: 3, dueOnly: [] });
      sim.file(origin, keyOf(1));
      let flag = null;
      sim.hooks.onStep = (s) => { const act = D.next(s); if (act.type === 'fetch' && flag === null) flag = !!act.recheck; };
      sim.runPass({ origin: 'request' });
      out[origin] = flag;
    }
    return out;
  },
};
{
  const NOW = T0 + 10 * 86400e3;
  const row = (key, o = {}) => ({ key, live: true, separate: true, mode: 'chat', walked: true, lastRecheckAt: 0, lastAt: NOW - 3600e3, ...o });
  const due = D0.recheckDue([
    row('acct/a'), row('acct/b', { lastRecheckAt: NOW - 2 * 3600e3 }), row('acct/c', { lastRecheckAt: NOW - 600e3 }),
    row('acct/paused', { live: false }), row('acct/inline', { separate: false }), row('acct/topic', { mode: 'topic' }),
    row('acct/fresh', { walked: false }), row('acct/quiet', { lastAt: NOW - 15 * 86400e3 }), row('acct/never', { lastAt: null }),
    row('acct/future', { lastRecheckAt: NOW + 60e3 }), null, { key: '' },
  ], { now: NOW, everyMs: 3600e3 });
  ok(J(due.map((d) => d.key)) === J(['acct/a', 'acct/b']), 'rule 22a recheckDue: due = live + separately listed + not a topic group + walked once + active within 14 d + not rechecked within the hour — never rechecked first, then the oldest; a paused / inline / topic / never-walked / quiet / silent row, a clock gone backwards and junk are not due', J(due));
  ok(D0.recheckDue(Array.from({ length: 500 }, (_, i) => row('acct/k' + i)), { now: NOW, max: 7 }).length === 7 && D0.recheckDue([row('acct/a', { lastRecheckAt: NOW - 61e3 })], { now: NOW, everyMs: 1 }).length === 1 && D0.recheckDue([row('acct/a', { lastRecheckAt: NOW - 59e3 })], { now: NOW, everyMs: 1 }).length === 0, 'rule 22a recheckDue: at most `max`; the cadence is never under a minute (a setting of 1 ms reads as 60 s)');
  ok(D0.recheckOnPress(0, NOW) && D0.recheckOnPress(NOW - 61e3, NOW) && !D0.recheckOnPress(NOW - 30e3, NOW) && D0.recheckOnPress(NOW + 5e3, NOW) && D0.RECHECK_FLOOR_MS === 60e3, 'rule 22b recheckOnPress: the owner\'s press re-lists unless the conversation was rechecked within 60 s (a clock gone backwards never blocks it)');
  const o = R22.order(D0);
  ok(J(o.log) === J(['f:c0003', 'f:c0000', 'f:c0001', 'recheck:c0002', 'recheck:c0003', 'recheck:c0000']) && o.end.ok && o.v.length === 0, 'rule 22 ORDER: the owner\'s request, then the due rows, then — nothing else pending — the armed rechecks in their order (the lowest priority: a recheck never delays a human or a due row)', J(o.log));
  const bd = R22.bound(D0);
  ok(J(bd.rechecks) === J(['c0000', 'c0001']) && bd.v.length === 0, 'rule 22: perPass (2) rechecks a pass, the rest wait for the next pass; a second turn in the pass re-arms nothing', J(bd));
  const nv = R22.never(D0);
  ok(nv.backoff === 0 && nv.request === 0 && nv.budget === 0, 'rule 22: no recheck inside a back-off (the owner\'s one press only), on a request-only pass, or with the minute spent', J(nv));
  const rf = R22.refusals(D0);
  ok(rf.skipOk && rf.skipN === 2 && !rf.errOk && rf.errWhy === 'auth-expired' && rf.errN === 1, 'rule 22: a conversation-level refusal ends that recheck and the pass goes on; an account failure is rule 3 (nothing more sent)', J(rf));
  const pr = R22.press(D0);
  ok(pr.owner === true && pr.open === false && pr.agent === false, 'rule 22b: the OWNER\'s press carries `recheck`; a window\'s open and an agent\'s refresh never do (a metered call the owner pays for)', J(pr));
}
{
  const MUT22 = [
    { tag: 'recheck-ahead', clause: 'the lowest priority (nothing else pending)', edits: [["  if (!queue.length && recheckEligible(s, p)) return paced(s, base, { ...base, type: 'recheck', key: p.recheck.pending[0] });", "  if (recheckEligible(s, p) && !humanWaiting) return paced(s, base, { ...base, type: 'recheck', key: p.recheck.pending[0] });"]], walk: ['r22-order'], repro: (D) => { const r = R22.order(D); return { red: r.log.indexOf('recheck:c0002') < r.log.indexOf('f:c0001'), said: J(r.log) }; } },
    { tag: 'recheck-unbounded', clause: 'at most perPass a pass', edits: [['  if (!r || !r.pending.length || r.done >= r.perPass || p.backoff || !p.timerWork || p.cut) return false;', '  if (!r || !r.pending.length || p.backoff || !p.timerWork || p.cut) return false;']], walk: ['r22-per-pass'], repro: (D) => { const r = R22.bound(D); return { red: r.rechecks.length > 2, said: J(r) }; } },
    // (a back-off pass never arms a recheck — `turn` does not run inside a back-off — so the in-back-off clause is the turn's;
    // the table's `never` row holds it. The fourth clause is the key's once-per-pass:)
    { tag: 'recheck-twice', clause: 'a key at most once a pass', edits: [["      if (result === undefined) { p.inflight = { type: 'recheck', key: act.key }; p.recheck = { ...p.recheck, pending: p.recheck.pending.filter((k) => k !== act.key) }; break; }", "      if (result === undefined) { p.inflight = { type: 'recheck', key: act.key }; break; }"]], walk: ['r22-twice'], repro: (D) => { const r = R22.bound(D); return { red: r.rechecks[0] === r.rechecks[1], said: J(r.rechecks) }; } },
    { tag: 'recheck-any-press', clause: 'the owner\'s press only', edits: [["    recheck: pick.reqs.some((r) => r.origin === 'owner'),", '    recheck: pick.reqs.length > 0,']], walk: ['r22-press'], repro: (D) => { const r = R22.press(D); return { red: r.open || r.agent, said: J(r) }; } },
  ];
  for (const m of MUT22) {
    const mm = mutant(m.tag, m.edits);
    if (!ok(mm.setup, `MUTANT setup · ${m.tag} (rule 22: ${m.clause}) is reconstructed from the shipped bytes`, mm.why)) continue;
    let rep;
    try { rep = m.repro(mm.D); } catch (e) { rep = { red: true, said: 'threw: ' + e.message }; }
    const hit = {};
    for (let i = 0; i < 8 && !m.walk.some((k) => hit[k]); i++) {
      let r;
      try { r = walk(mm.D, 5151 + i * 97, 'mixed', 900, { forceRecheck: true }); } catch (e) { hit['threw'] = (hit['threw'] || 0) + 1; continue; }
      for (const v of r.sim.violations) { const kk = v.split(':')[0]; hit[kk] = (hit[kk] || 0) + 1; }
    }
    const named = m.walk.filter((k) => hit[k]);
    ok(rep.red && named.length > 0, `MUTANT ${m.tag}: its table row goes red (${String(rep.said).slice(0, 140)}) AND the walk names rule 22's invariant (${named.map((k) => `${k} ×${hit[k]}`).join(', ')})`, `repro red ${rep.red}; walk hit ${J(hit)}`);
  }
}

// ═══ ⑤ THE CENSUS ═════════════════════════════════════════════════════════════════════════════
console.log('⑤ THE CENSUS: a pure model, codes the routes and the CLI know, an engine with no scheduling of its own');
{
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/[^\n'`]*$/gm, '');
  ok(!/\brequire\s*\(/.test(code) && !/\bimport\b/.test(code), 'the model imports NOTHING (PURE — test-architecture lists it)');
  ok(!/Date\.now|new Date|setTimeout|setImmediate|setInterval|Math\.random|process\./.test(code), 'the model reads no clock, sets no timer, draws no randomness and touches no process — `now` is a fact the driver hands in');
  ok(/^'use strict';/.test(SRC) && /module\.exports = \{/.test(SRC), 'the model is CJS (the engine requires it, this suite and a patched copy load it the same way)');
  const rules = [...SRC.matchAll(/^ \* {1,2}(\d{1,2})\. [A-Z]/gm)].map((m) => Number(m[1]));
  ok(J(rules) === J(Array.from({ length: 22 }, (_, i) => i + 1)), `the doc comment states the rules as ONE numbered list 1–22 (${rules.join(',')}) — rule 20 (lane channel-threads) is the reaction trickle + the thread walk, rule 21 (lane lark-search-poll) the change feed, rule 22 (lane lark-threads) the recent-roots recheck`);
  ok(J(D0.REFUSAL_CODES) === J(['backoff', 'vendor-budget', 'refresh-floor', 'refresh-queue-full']) && !D0.ANSWER_OUTCOMES.includes('wait') && D0.PACE_WAIT_MAX_MS === 1000, 'rule 18 adds NO refusal code and no settlement — a wait is neither (REFUSAL_CODES unchanged; PACE_WAIT_MAX_MS 1000)');
  const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const line = asrc.split('\n').find((l) => l.includes('const status = code === \'not-found\' ? 404') && l.includes('refresh-queue-full')) || '';
  const segs = line.slice(line.indexOf('const status = ') + 15, line.indexOf(';')).split(' : ');
  const statusOf = (c) => { for (const seg of segs) { const q = seg.indexOf(' ? '); if (q > 0 && seg.slice(0, q).includes(`'${c}'`)) return Number(seg.slice(q + 3).trim()); } return null; };
  const retry = [...D0.REFUSAL_CODES, 'stopped', 'account-changed'];
  const st = Object.fromEntries(retry.map((c) => [c, statusOf(c)]));
  ok(retry.every((c) => [429, 409, 503].includes(st[c])), `every code the drain can name that means "try again" is in the agent route's retry-able table: ${J(st)}`);
  ok(!line.includes("'not-connected'"), 'not-connected is TERMINAL by name (the agent route answers it 500 — nothing to retry until the owner connects)');
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf8');
  const cliSet = (/const REFRESH_REFUSED = \[([^\]]*)\]/.exec(cli) || [])[1] || '';
  ok(retry.every((c) => cliSet.includes(`'${c}'`)), `the CLI's REFRESH_REFUSED names every one of them (exit 4, "not refreshed: …")`, cliSet);
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const ecode = esrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const region = ecode.slice(ecode.indexOf('async function pass(adapterId'), ecode.indexOf('function lastPollOf(key)'))
    + ecode.slice(ecode.indexOf('const DRAIN_ORIGIN'), ecode.indexOf('async function agentRefresh('));
  ok(/const Drain = require\('\.\.\/channel-drain\.js'\);/.test(esrc), 'the engine requires the PURE drain');
  ok((region.match(/Drain\.next\(/g) || []).length === 1 && (ecode.match(/Drain\.admit\(/g) || []).length === 1 && (ecode.match(/Drain\.apply\(/g) || []).length === 2, 'the engine asks the drain for EVERY step through ONE `Drain.next` and admits through ONE `Drain.admit`; it applies each step (begin + completion) through `Drain.apply`');
  const forbidden = ['takeTimerTurn', 'interleave(', 'lastBy', 'queue.splice', 'queue.find(', 'front run', 'pressGranted', 'riders.push', 'done.has('];
  const found = forbidden.filter((f) => region.includes(f));
  ok(found.length === 0, `the engine's pass / request-set region spells NONE of the imperative scheduler (r5–r8's takeTimerTurn, interleave, the front run, the rider lookups, the boundary splices)`, found.join(', '));
  ok(!/\.sort\(/.test(region), 'the engine\'s pass region orders nothing itself (no `.sort(`)');
  const ci = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8');
  ok(/\{ name: 'test-channel-drain', tier: 'fast'(?:,| \})/.test(ci), 'the gate is registered in the FAST tier (scripts/ci.mjs)');
  const arch = fs.readFileSync(path.join(REPO, 'scripts/test-architecture.mjs'), 'utf8');
  ok(arch.includes("'src/channel-drain.js'"), 'test-architecture classifies it PURE');
}

// ═══ ⑥ RULE 19 — HISTORY ON DEMAND (lane channel-render verify r6, 2026-09-27): the server belt under /older ═══
// Reproduced on the real engine before it: 20 concurrent /older for one conversation = 20 vendor calls for the same
// page; 20 in 2 s after the vendor said `exhausted` = 16 more vendor calls answering nothing; the minute budget the
// only bound. The PURE memory: `olderVerdict` (join › exhausted › floor › vendor), `olderApply` (ask / landed /
// failed / changed). The engine leg (20 concurrent → 1 call, the floor, the memory, the forget) is test-channels-engine ⑭.
console.log('⑥ RULE 19: one conversation\'s older history — join, the remembered end, the floor; a mutant per clause');
{
  const F = D0.OLDER_FLOOR_MS, T = D0.OLDER_MEMORY_MS;
  const e0 = D0.olderEmpty();
  ok(J(e0) === J({ askedAt: 0, inflight: false, exhaustedAt: 0 }) && F === 1500 && T === 6 * 3600e3 && J(D0.OLDER_EVENTS) === J(['ask', 'landed', 'failed', 'changed']), `the empty memory, the floor (${F} ms), the memory's TTL (${T / 3600e3} h), the four events`);
  const at = (m, ev, t) => D0.olderApply(m, ev, t);
  const asked = at(e0, 'ask', 10_000);
  const landedMore = at(asked, { type: 'landed', exhausted: false }, 10_100);
  const landedEnd = at(asked, { type: 'landed', exhausted: true }, 10_100);
  const failed = at(asked, 'failed', 10_100);
  const changed = at(landedEnd, 'changed', 10_200);
  const TABLE = [
    // [memory, now, want]                                          — the row's meaning
    [e0, 10_000, { act: 'vendor' }],                                 // never asked: the vendor
    [asked, 10_050, { act: 'join' }],                                // an ask in flight: join it (whatever the clock)
    [asked, 99_999, { act: 'join' }],
    [landedMore, 10_150, { act: 'floor', retryAfterMs: F - 150 }],   // landed rows 150 ms after the ask: inside the floor, the wait named
    [landedMore, 10_000 + F - 1, { act: 'floor', retryAfterMs: 1 }], // the floor's edge, inside
    [landedMore, 10_000 + F, { act: 'vendor' }],                     // the floor's edge, over
    [landedEnd, 10_150, { act: 'exhausted' }],                       // the vendor said "nothing older": remembered — no call, no floor wait
    [landedEnd, 10_000 + F + 5, { act: 'exhausted' }],               // …past the floor too
    [landedEnd, 10_100 + T - 1, { act: 'exhausted' }],               // …until the memory's TTL
    [landedEnd, 10_100 + T, { act: 'vendor' }],                      // the TTL over: asked again (a belt against a false end)
    [failed, 10_150, { act: 'floor', retryAfterMs: F - 150 }],       // a failed flight: nothing remembered, the floor's clock kept
    [failed, 10_000 + F, { act: 'vendor' }],
    [changed, 10_250, { act: 'floor', retryAfterMs: F - 250 }],      // a record arrived: the end forgotten, the floor's clock kept (a new record never makes an ask cheaper)
    [changed, 10_000 + F, { act: 'vendor' }],
    [at(changed, 'ask', 12_000), 12_010, { act: 'join' }],           // asked again after the change: a flight
    [at(at(changed, 'ask', 12_000), { type: 'landed', exhausted: true }, 12_050), 20_000, { act: 'exhausted' }],   // …and its end remembered anew
    [null, 10_000, { act: 'vendor' }], [undefined, 5, { act: 'vendor' }],   // no memory = empty
    [{ askedAt: 10_000, inflight: false, exhaustedAt: 0 }, NaN, { act: 'floor', retryAfterMs: F }],   // a bad clock reads as 0: the floor, never a wait longer than it
    [{ askedAt: 10_000, inflight: false, exhaustedAt: 0 }, 9_000, { act: 'floor', retryAfterMs: F }],  // a clock that went backwards: the same
  ];
  const bad = TABLE.filter(([m, t, want]) => J(D0.olderVerdict(m, t)) !== J(want)).map(([m, t, want]) => [m, t, want, D0.olderVerdict(m, t)]);
  ok(!bad.length, `olderVerdict: ${TABLE.length} rows — join › exhausted › floor › vendor, each with the wait it names`, J(bad));
  ok(J(asked) === J({ askedAt: 10_000, inflight: true, exhaustedAt: 0 }) && J(landedEnd) === J({ askedAt: 10_000, inflight: false, exhaustedAt: 10_100 }) && J(landedMore) === J({ askedAt: 10_000, inflight: false, exhaustedAt: 0 }) && J(failed) === J({ askedAt: 10_000, inflight: false, exhaustedAt: 0 }) && J(changed) === J({ askedAt: 10_000, inflight: false, exhaustedAt: 0 }), 'olderApply: ask stamps the clock + the flight; landed ends the flight and remembers only an `exhausted` end; failed ends it remembering nothing; changed forgets the end and keeps the clock');
  ok(J(e0) === J(D0.olderEmpty()) && J(asked) === J({ askedAt: 10_000, inflight: true, exhaustedAt: 0 }), 'olderApply never mutates the memory it was given');
  let threw = null; try { D0.olderApply(e0, 'bogus', 1); } catch (e) { threw = e.message; }
  ok(/no such older event bogus/.test(threw || ''), 'an unknown event throws by name');
  // A MUTANT PER CLAUSE — each a patched copy whose own rows go red (and whose repro on the engine is test-channels-engine ⑭'s control)
  const OLD_MUTANTS = [
    { tag: 'older-no-join', why: '20 concurrent /older = 20 vendor calls for one page', edits: [["  if (m.inflight) return { act: 'join' };\n", '']], red: (D) => D.olderVerdict(asked, 10_050).act !== 'join' },
    { tag: 'older-no-memory', why: 'an exhausted conversation costs a vendor call per /older', edits: [["  if (ex > 0 && t - ex < OLDER_MEMORY_MS) return { act: 'exhausted' };\n", '']], red: (D) => D.olderVerdict(landedEnd, 10_000 + F + 5).act !== 'exhausted' },
    { tag: 'older-no-floor', why: 'a held wheel = a vendor call per round trip', edits: [["  if (asked > 0 && t - asked < OLDER_FLOOR_MS) return { act: 'floor', retryAfterMs: Math.min(OLDER_FLOOR_MS, Math.max(1, OLDER_FLOOR_MS - (t - asked))) };   // never longer than the floor (a clock that went backwards)\n", '']], red: (D) => D.olderVerdict(landedMore, 10_150).act !== 'floor' },
    { tag: 'older-forget-nothing', why: 'a new record never lets the vendor be asked again', edits: [["    case 'changed': return { ...m, exhaustedAt: 0 };", "    case 'changed': return { ...m };"]], red: (D) => D.olderVerdict(D.olderApply(landedEnd, 'changed', 10_200), 10_000 + F).act !== 'vendor' },
  ];
  for (const m of OLD_MUTANTS) {
    const mm = mutant(m.tag, m.edits);
    if (!ok(mm.setup, `MUTANT setup · ${m.tag} (rule 19, ${m.why}) is reconstructed from the shipped bytes`, mm.why)) continue;
    ok(m.red(mm.D) && !m.red(D0), `MUTANT ${m.tag}: its own row goes red on the copy and stays green on the shipped model`);
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: MUTANTS.length + OLD_MUTANTS.length })) ok(r.pass, 'rule 19 ' + r.name, r.detail);
}

// ── lane lark-threads verify r3 (T2 ②): THE SLIDING MINUTE — the minute's meter is a fixed window (60), the per-second bucket
//    (1/s, burst 5) is what bounds a SLIDING minute; the burst and the first refill share instant 0, so any half-open 60 s
//    window holds at most 60·r + burst − 1 = 64 — exactly what r2's day walk measured ("max in any sliding minute: 64"). Pinned
//    PURE on paceFresh/paceLevel with a greedy sender; the card's words name the burst beside the minute and the per-second figure.
console.log('\nverify r3 (T2 ②): the sliding minute = 60·r + burst − 1, said on the card');
{
  const D = require(path.join(REPO, 'src/channel-drain.js'));
  const greedy = (r, burst, seconds) => { const sends = []; let b = D.paceFresh(r, burst, 0); let t = 0; while (t <= seconds * 1000) { const lvl = D.paceLevel(b, t); if (lvl >= 1) { b = D.paceFresh(r, burst, t, lvl - 1); sends.push(t); } else t += Math.ceil(((1 - lvl) / r) * 1000); } return sends; };
  const maxWindow = (sends, w) => { let best = 0; for (let i = 0; i < sends.length; i++) { let j = i; while (j < sends.length && sends[j] < sends[i] + w) j++; best = Math.max(best, j - i); } return best; };
  const s15 = greedy(1, 5, 600), s11 = greedy(1, 1, 600), s2040 = greedy(40, 40, 120);
  ok(maxWindow(s15, 60e3) === 64 && s15.filter((t) => t === 0).length === 5, `pace 1/s burst 5: a greedy sender puts 5 at instant 0 and 1 per second after ⇒ at most 64 in any sliding minute (measured ${maxWindow(s15, 60e3)}; r2's walk: 64)`);
  ok(maxWindow(s11, 60e3) === 60 && maxWindow(s2040, 60e3) === 40 * 60 + 40 - 1, `the formula 60·r + burst − 1: burst 1 ⇒ 60; Gmail's 40/s burst 40 ⇒ ${40 * 60 + 40 - 1}`);
  const C = require(path.join(REPO, 'src/channel-caps.js'));
  const words = (b) => C.budgetText({ unit: 'request', limit: 60, exhausted: true, waiting: 2, resetInSeconds: 12, perSec: 1, spentBy: { agent: 0 }, ...b });
  ok(/60 requests\/min \(at most 1\/s, 5 at once\)/.test(words({ burst: 5 })) && /60 requests\/min \(at most 1\/s\)/.test(words({ burst: 1 })) && !/at once/.test(words({ burst: null })), 'the card\'s budget sentence names the burst beside the minute and the per-second figure ("5 at once"); a bucket of one says nothing more');
  ok(/\(at most 1\/s, 5 at once\) for this account, 3 of them by agent refreshes/.test(words({ burst: 5, spentBy: { agent: 3 } })), '…and the agent-share variant carries the same burst');
  const eng = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  ok(/burst: pd \? Math\.round\(pd\.burst \* 100\) \/ 100 : null \};/.test(eng), 'WIRING: budgetView serves `burst` from the pace declaration (the card reads it; nothing else computes a ceiling)');
}

console.log(`\n${failN ? 'FAILED' : 'ALL PASS'} (${passN} passed${failN ? `, ${failN} failed` : ''})`);
process.exit(failN ? 1 : 0);
