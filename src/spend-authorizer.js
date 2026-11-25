'use strict';
// THE ONE CEILING ON EVERY TURN NOBODY TYPED (docs/design-account-hardening.md
// §4.4c / P9 / owner decisions D3 + D6). PURE — imports nothing, so the rule is
// unit-provable and the ORCH adapter (src/server/spend-guard.js) is the only
// thing that touches disk, telemetry or the inbox.
//
// WHY THIS EXISTS. Seven producers in this tree can start a BILLED turn with
// no per-occurrence owner action, and until now each carried its own local
// floor — auto-resume's loop breaker (3/hour/session), the Stop nudge's
// `s._lastStopNudge` (in-memory, and 0 on this instance because the owner set
// the cooldown to 0), the jobs engine's 30s-per-conversation flood floor. Every
// one of them is a floor on ONE producer's PACING; not one of them is a bound
// on MONEY, and none of them knows what the others spent. Measured on this
// instance's own transcripts (ALL of them, 2026-07-10 → 2026-09-09): 603
// Stop-nudge mini-turns across 72 conversations, forcing 999 assistant records
// that read 536,353,861 cached tokens — with 21 of those nudges landing on ONE
// conversation inside ONE hour, and 93 on the busiest day.
//
// THE UNIT IS THE IDENTITY, NOT THE SESSION. The money is spent by a
// credential slot, and nine conversations can be parked on one subscription —
// so a per-session floor bounds nothing that has a bill attached. The identity
// here is the credential slot the turn will bill, resolved by the engine's
// EXISTING answer (wallSlotFor / fireIdentityFor); this module never derives
// it — a fifth derivation of session→account is the very thing §2 of the design
// says produced five incidents in three days.
//
// FAIL CLOSED (P8). Every unanswerable question refuses: an identity we cannot
// name, a credential state that says it cannot serve, an overage the owner has
// not opted into. Ignorance about a QUOTA is different from ignorance about the
// BUDGET — an unreadable credential file answers 'unknown' and is NOT a
// refusal (P6: ignorance is never a claim), but an unnameable identity is,
// because a ceiling that cannot be attributed is not a ceiling.

// ── The closed set of unattended-spend reasons ───────────────────────────────
// A producer that can put a user turn into a session nobody typed into must
// appear here AND call the authorizer; scripts/test-spend-paths.mjs derives the
// producer census from the source tree and fails on a site that is not wired.
// `turn: true`  — this reason opens a BILLED turn.
// `turn: false` — it spends something else that costs money (a stored reset
//                 credit), so it takes the same ceiling and says so.
// The set is CLOSED and it holds only reasons a producer passes TODAY: a
// declared-but-unused reason is a slot the next producer slides into without
// anyone deciding anything (test-spend-paths asserts both directions).
// `attended: true` (lane owner-press-attended, userW measured 2026-10-28 00:33–00:48 PT — five presses of the strip's
// «Hand over now · starts a turn» refused `hour-cap`, the sixth CHARGED): A PER-OCCURRENCE PRESS ON A COOKIE-ONLY DOOR
// IS AN ATTENDED TURN. The reason's only door is a person's press whose own button carries the money word, and that
// door refuses every bearer (vsst_ / jbt_ / vsak_) by name — so the ceiling neither refuses nor counts it:
// `authorizeUnattendedSpend` answers {ok, attended} BEFORE the caps and the guard takes no hold; `noteUnattendedSpend`
// writes no stamp, only the `attended` tally (the census and the snapshot still see every press). The credential,
// spend-control and paid-overage refusals still bind — a press is not an opt-in to paying overage. Each attended
// reason's AUTOMATIC twin keeps its own gated reason (stash-handover ↔ stash-retry, browser-handback ↔
// browser-handback-idle, outbox-wake-now ↔ channel-receipt, owner-group-wake / owner-channel-send ↔ peer-message,
// bulk-resume ↔ auto-resume).
// On an instance nobody signs in to the press still passes the write-origin verdict and the owner routes' wake PACER
// (the groups engine's `mayWake`) — only the BUDGET is exempt. scripts/test-spend-paths.mjs §2b: every attended
// reason's site is a cookie-only door.
const SPEND_REASONS = Object.freeze({
  'auto-resume': { turn: true, what: 'the continue after a usage limit' },
  'stop-nudge': { turn: true, what: 'the Stop bookkeeping mini-turn' },
  'job-notification': { turn: true, what: 'a Background Work notification' },
  'peer-message': { turn: true, what: 'a message from another session' },
  // lane worker-dispatch verify r1 ⑤ (2026-10-02): a WORKER's compaction another session asked for (`vibespace-msg
  // dispatch`, src/server/worker-dispatch.js) — a model call nobody typed, counted against the same ceiling as the
  // wake that follows it (the lane's r0 probe was hold-free: the compaction spent tokens the census never saw)
  'peer-compact': { turn: true, what: "a worker's compaction asked for by another session" },
  'codex-reset-credit': { turn: false, what: 'a stored Codex rate-limit reset credit' },
  // lane automation-verbs (design q-046 L2, decision 5): a conversation an AUTOMATION KEY opened (`conversations.open` —
  // the coordinator's worker dispatch, through src/server/conversation-ops.js's headless create). A conversation nobody
  // typed into, charged to the key (the identity `automation:<keyId>`); a refusal answers `spend_refused` and nothing spawns.
  'automation-open': { turn: true, what: 'a conversation an automation key opened' },
  // Channels P2 (design-communication-panel §7.4): an assigned conversation's
  // matched message waking an agent through the delivery ladder. Declared in
  // the SAME commit as its producer (src/server/channels-engine.js) — the set
  // is closed, and a declared-but-unused reason is the slot the next producer
  // slides into without a decision.
  'channel-message': { turn: true, what: 'a message from a connected channel' },
  // Channels P3 (design §9.3, decision 8): the RECEIPT for a proposal an
  // agent drafted. Delivered `noWake` by default — only into a turn already
  // running, else stashed — so it opens a turn only when the DECIDER chose
  // "wake the agent now" on that Approve / Reject (2026-09-27; ONE per
  // proposal — the per-watcher `receiptWake` opt-in is retired) or the
  // free-lane prediction failed and the wrapper's own verdict charged it.
  // Producer: src/server/channels-engine.js.
  'channel-receipt': { turn: true, what: 'an outbox receipt handed back to the drafting agent' },
  // lane owner-press-attended: the receipt the DECIDER chose to deliver now — «Approve / Reject and wake the agent now»
  // on the outbox card (POST /api/channels/outbox/:id/approve|reject, cookie only): its own reason, because
  // `channel-receipt` also covers the free-lane prediction that may fail (that one stays gated). ONE per proposal.
  'outbox-wake-now': { turn: true, attended: true, what: 'an outbox receipt the user chose to deliver now' },
  // lane owner-press-attended: the user's OWN message to an agent from the Channels panel — composed and sent by the
  // user, or an agent's draft the user approved (src/channels/agents.js). A draft sent by POLICY for an agent stays
  // `peer-message` (nobody pressed anything).
  'owner-channel-send': { turn: true, attended: true, what: "the user's own message to an agent from the Channels panel" },
  // lane owner-press-attended: a group message the USER posted (the group window's Send, «Wake now» in the create /
  // invite dialog — routes/channels.js, cookie only, the wake count echoed back first) waking its members now; an
  // agent's post stays `peer-message`.
  'owner-group-wake': { turn: true, attended: true, what: 'a group message the user posted, waking its members now' },
  // agent browser P3 (design-agent-browser-v2 §4.3.1): the browser control
  // handback — an explicit handback (the click) and, only when
  // browser.announceIdleHandback is ON, an idle/viewer-left one. The producer
  // is src/server/browser-handback.js, through the delivery ladder.
  // lane owner-press-attended: the CLICK («Hand back (wakes N)», the person's Done) is attended; the idle / viewer-left
  // announcement — nobody's action, only with browser.announceIdleHandback ON — is its gated twin
  'browser-handback': { turn: true, attended: true, what: 'the browser control handback the user pressed, or the browser proposal the user approved' },   // r3: + the person's Approve (tellProposal)
  'browser-handback-idle': { turn: true, what: 'a browser handback nobody pressed (idle, the viewer left)' },   // r2: + an explicit one with no door's press
  // desktop lane E (D3, 2026-09-25): the user's "Ask <agent> to take control" from a desktop-app window, when they
  // tick "wake it now" — the default rides the agent's next turn for free (the stash). The producer is
  // src/server/window-request.js, through the delivery ladder.
  'window-share-request': { turn: true, attended: true, what: 'a window control request the user sent from a desktop-app window (wake now)' },
  // 2026-09-27 (the owner: "我在界面里完全看不到'有消息在 queue'这件事情"): the chat's strip above the composer shows
  // what waits for the agent's next turn, and its "Hand over now" delivers the whole stash at once — ONE ladder call,
  // ONE turn. The producer is src/server/stash-handover.js (POST /api/sessions/:id/stash/hand-over, cookie only).
  'stash-handover': { turn: true, attended: true, what: 'the user handed a conversation its waiting notices now' },
  // B-02a3 (主开发's ruling (1), 2026-11-18): the same strip's press for the GROUP messages waiting for a conversation that is
  // mid-turn — handed to the RUNNING turn by the road an Enter takes (src/server/user-input.js origin 'group-handover'); a turn
  // only in the one edge where that turn was already finishing (the CLI then runs it right after, as it runs an Enter). The
  // producer is src/server/stash-handover.js handOverGroups (POST /api/sessions/:id/stash/hand-over-groups, a person's press)
  'group-handover': { turn: true, attended: true, what: 'the user handed the group messages waiting for a conversation to its running turn' },
  // lane notify-retry (R3, 2026-10-01): the waiting notices that did not fit a prompt's inline context are posted as
  // their own message the moment that turn ends — the hand-over's own machinery, run by the turn end instead of a click;
  // declared beside its producer (src/server/stash-handover.js, the auto path)
  'stash-retry': { turn: true, what: 'the waiting notices that did not fit a prompt, posted when its turn ended' },
  // B-6721: the notices that waited while their conversation was not running, posted once it runs again (the stash view's wake
  // chain — the hand-over's own machinery, run because the conversation came back; declared beside its producer
  // src/server/stash-handover.js, the auto path)
  'stash-reachable': { turn: true, what: 'the waiting notices posted once the conversation could take them' },
  // lane owner-press-attended r2 (the acceptance's seam with wake-approve-card): a person's «Deliver» on a HELD channel
  // digest (the decide door — already a person door there, personVerdict) is attended; the boot and timer flushes stay
  // `channel-message`. Declared HERE first; its ONE site is wired by wake-approve-card — test-spend-paths §2b's DEFERRED
  // census row names that lane, and goes red the day the site exists without the row being retired.
  'held-deliver': { turn: true, attended: true, what: 'a held channel digest the user chose to deliver now' },
  // lane auto-resume-bulk (.349, a fleet power user): «恢复所有因用量/过载停止的会话» — ONE press for N continues. THE
  // OWNER'S RULING 2026-11-18 (B): that press IS THE PERSON'S OWN ACT — ATTENDED: none of the N is counted against the
  // unattended caps and none is stamped (the attended tally sees them); the account's hourly room stays for its own
  // automatic continues. Still binding, slot by slot, before the attended answer: paid overage in use (refused BY NAME),
  // a credential that cannot serve, the spend control. Producer: src/server/auto-resume.js resumeBatch, selected on the
  // press (POST /api/sessions/resume-stopped mints it — the owner's cookie door, every bearer refused first); its gated
  // twin there is 'auto-resume' (a batch no door pressed is N automatic continues, each counted).
  'bulk-resume': { turn: true, attended: true, what: 'the resume of every conversation a usage limit or an overloaded model stopped' },
});
/** Is this reason ATTENDED (see the header of SPEND_REASONS)? Read off the table — never a second list. */
const isAttended = (reason) => !!(reason && Object.prototype.hasOwnProperty.call(SPEND_REASONS, reason) && SPEND_REASONS[reason].attended === true);
// the attended tally keeps a day of presses (the census's window), at most this many
const ATTENDED_KEEP = 500;

// D6's proposal, as shipped defaults. They are SETTINGS (see
// src/lib/settings-schema.js `spend.*`); these are the values a caller that
// passes nothing gets, and the numbers the suite pins.
// 2026-09-15 (owner, 2.369.98): 12/h · 60/day · 200/instance-day was too
// tight — the per-SLOT hour cap is shared by EVERY conversation on that
// pool target, so one watcher-heavy session plus a sibling's auto-resumes
// filled it twice in a day and every Background Work notification was
// stashed until the owner's next prompt (read as "notifications stopped").
// Raised to 30/h · 200/day · 800/instance-day; the day caps move with the
// hour cap on purpose (60/day at 30/h is two hours of headroom).
const BUDGET_DEFAULTS = Object.freeze({
  perIdentityHour: 30,
  perIdentityDay: 200,
  perInstanceDay: 800,
  noticePct: 80,
});
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
// THE OFFERED RANGE AND THE ENFORCEABLE RANGE ARE ONE SET (r2, reproduced).
// These are the `max` of the three `spend.*` rows in src/lib/settings-schema.js,
// and they are the clamp in budgetLimits — because a setting the UI accepts and
// the ledger cannot count is a money bound that is not one. The round-1 shape
// clamped at 100000/1000000 while retaining a flat 800 stamps, so every value
// above 800 (the schema offers 2000 and 10000) silently never fired: 1500
// charged spends against a 1000/day cap still counted 800 and authorized the
// 1501st. test-spend-paths §1 re-derives these three numbers FROM the schema,
// so widening one row without widening the clamp goes red.
const CAP_MAX = Object.freeze({ perIdentityHour: 200, perIdentityDay: 2000, perInstanceDay: 10000 });
// Retention is a FUNCTION OF THE LIMITS, never a constant: the list only has to
// out-count the biggest cap that reads it, plus head-room so the cap itself is
// reachable rather than exactly met. Bounded by construction — budgetLimits
// clamps at CAP_MAX, so this is at most 10064 numbers (~140 KB of JSON).
const STAMP_HEADROOM = 64;
/** PURE. How many timestamps one list must keep for `limits` to be enforceable. */
function stampCap(limits) {
  const L = limits || BUDGET_DEFAULTS;
  const n = Math.max(
    Number(L.perIdentityDay) || 0, Number(L.perInstanceDay) || 0,
    BUDGET_DEFAULTS.perIdentityDay, BUDGET_DEFAULTS.perInstanceDay,
  );
  return Math.min(CAP_MAX.perInstanceDay, n) + STAMP_HEADROOM;
}
// Kept as the DEFAULT retention (what a caller that passes no limits gets) and
// as the number the suite names; it is no longer a ceiling on what can be
// counted.
const MAX_STAMPS = stampCap(null);
// THE RETENTION A READER THAT CANNOT YET KNOW THE LIMITS MUST USE (r5,
// reproduced). Pruning is IRREVERSIBLE and it FORGIVES MONEY, so it may only be
// done with limits somebody can actually answer — and at BOOT nobody can:
// server.js builds the guard ~318 lines before `setupPersistence()` assigns
// `persistenceRouter.readSettings`, so `serverSetting` answers `undefined` for
// every key and `budgetLimits()` hands back the DEFAULTS. Measured: an owner
// day cap of 500 with 400 same-day stamps on disk was cut to the default
// retention (264) on every boot, so the guard then authorized 236 more
// unattended turns today instead of 100 — and this instance restarts several
// times a day. The two costs are not symmetric: over-retention is bounded
// memory (this is the widest any offerable cap can count — CAP_MAX +
// STAMP_HEADROOM stamps), under-retention is money. Since lane queued-is-not-woke round 4 EVERY prune keeps this
// retention (note(), a give-back, the snapshot) — the live limits are never a prune's bound: only time ages a stamp out.
const LOAD_RETENTION = Object.freeze({
  perIdentityDay: CAP_MAX.perIdentityDay, perInstanceDay: CAP_MAX.perInstanceDay,
});

/** PURE. Normalise the four numbers, whatever the settings store holds.
 *  0 is an EXPLICIT choice ("no unattended turns on this axis at all"), which
 *  is why it is not replaced by the default — the same clamp0 convention the
 *  Stop nudge's own thresholds use. A cap that holds no number (blank, null, a
 *  text, a negative number, a boolean) is NO cap: 0 and `unset` — refused and
 *  said (the coordinator's ruling, 2026-11-18); only an absent setting is the
 *  default. noticePct keeps its fallback. */
function budgetLimits(get = () => undefined) {
  const unset = [];   // B-0a33 (3): the caps whose setting is there and is NO NUMBER — 0, said as «no limit is set»
  const num = (key, dflt, hi, field = null) => {
    let v;
    try { v = get(key); } catch { v = undefined; }
    // B-0a33 (3) (the owner's word via 主开发 2026-11-17; the follow-up ruling 2026-11-18, «by the recommendation»): A CAP
    // THAT IS NOT A NUMBER IS NOT A CAP — null, blank, a text, a negative number, a boolean: 0 here (every turn nobody typed
    // refused) and named in `unset`, so the refusal says «no limit is set — set a number»; never a default number. Only an
    // ABSENT setting (undefined — nobody set one) is the default. A number written as text («30») is that number.
    if (field) {
      if (v === undefined) return dflt;
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (!Number.isFinite(n) || n < 0) { unset.push(field); return 0; }
      return Math.min(hi, Math.round(n));
    }
    // A BOOLEAN IS NEVER A CAP. `Number(true)` is 1, so a settings reader that
    // answers `true` to everything (a harness stub, a corrupted store) would
    // silently set every ceiling to ONE unattended turn — a value nobody chose,
    // arrived at by coercion. Only a number is a number.
    if (typeof v === 'boolean') return dflt;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return dflt;
    return Math.min(hi, Math.round(n));
  };
  const out = {
    // clamped at the schema's OWN max (CAP_MAX) — see its comment: a ceiling the
    // settings UI offers and the ledger cannot count is not a ceiling
    perIdentityHour: num('spend.unattendedPerIdentityHour', BUDGET_DEFAULTS.perIdentityHour, CAP_MAX.perIdentityHour, 'perIdentityHour'),
    perIdentityDay: num('spend.unattendedPerIdentityDay', BUDGET_DEFAULTS.perIdentityDay, CAP_MAX.perIdentityDay, 'perIdentityDay'),
    perInstanceDay: num('spend.unattendedPerInstanceDay', BUDGET_DEFAULTS.perInstanceDay, CAP_MAX.perInstanceDay, 'perInstanceDay'),
    noticePct: (() => { const n = num('spend.budgetNoticePct', BUDGET_DEFAULTS.noticePct, 100); return n > 0 ? n : 0; })(),
  };
  return unset.length ? { ...out, unset } : out;
}
/** B-0a33 (3): the three settings that are caps — the ones a write may set to nothing (null is kept: «no limit is set»). */
const CAP_SETTING_KEYS = Object.freeze(['spend.unattendedPerIdentityHour', 'spend.unattendedPerIdentityDay', 'spend.unattendedPerInstanceDay']);
/** PURE (B-0a33 (3)). Is this cap field set to NO NUMBER (null, blank, a text, a negative number, a boolean) in these limits? */
const capUnset = (limits, field) => !!(limits && Array.isArray(limits.unset) && limits.unset.includes(field));

/** PURE. An empty ledger. */
function emptyBudget() { return { v: 1, identities: {}, instance: [], notices: {}, attended: [] }; }

// A LEDGER STAMP CARRIES ITS REASON (2026-09-15, owner: after the spend cap
// stashed every Background Work notification nobody could say WHICH producer
// had spent the slot). A stamp is `{at, reason}` — `reason` a SPEND_REASONS
// member — and the migration is implicit: a bare number written by an older
// build reads as `{at, reason: null}` everywhere (prune, counts, producers).
const stampAt = (t) => (typeof t === 'number' ? t : Number(t && t.at) || 0);
// A RESERVATION IS COUNTED WHERE ITS TURN RUNS (B-0a33, 2026-11-13; round 1: the DAY says what the HOUR says): a frame still
// waiting behind a running turn may run at any moment — its stamp is in EVERY window of every authorize (`now`: the hour, the
// day, the instance's day) until it ends; carried, it is counted where it ran (`ran`); given up by the hub without knowing
// whether it ran (`end`), where the hub stopped waiting. No window — no hour, no day — then holds more billed unattended turns
// than its cap, whenever a queued frame runs.
const waitingStamp = (t) => !!(t && typeof t === 'object' && t.rid && !t.conv && !t.end);
const countAt = (t, now) => (waitingStamp(t) ? now : (t && typeof t === 'object' && (Number(t.ran) || Number(t.end))) || stampAt(t));
const lastStampAt = (t) => Math.max(stampAt(t), (t && typeof t === 'object' && Math.max(Number(t.ran) || 0, Number(t.end) || 0)) || 0);
// how long a WAITING reservation may hold a window: as long as queued-wakes may keep its live entry (LIVE_MAX_AGE_MS, 7 days;
// pinned equal in test-spend-paths §5f) — read INSIDE the count (spendCounts), so it is true with no prune running; queued-wakes
// ends a waiting stamp no live entry holds at once (its reconcile, at load and at each sweep)
const RESERVATION_WAIT_MAX_MS = 7 * DAY_MS;
const stampReason = (t) => (t && typeof t === 'object' && t.reason ? String(t.reason) : null);
/** PURE. How many stamps in `list` each producer wrote ({reason → n}; a
 *  reason-less legacy stamp counts under 'unknown'). */
function producerCounts(list) {
  const out = {};
  for (const t of Array.isArray(list) ? list : []) {
    if (isPressRow(t)) continue;   // a PRESS row (notePressRow) is the record of the press, not one more turn
    const r = stampReason(t) || 'unknown'; out[r] = (out[r] || 0) + (t && Number(t.count) > 1 ? Number(t.count) : 1);   // a press's folded row counts its continues
  }
  return out;
}
/** PURE (the cure, 主开发 20:16Z): THE RECORD OF A PRESS — one row in the attended tally: when, how many it PLANNED (`planned`),
 *  the batch id (`press`) — kept beside its folded per-continue rows; `delivered` / `ended` are written when the batch ends
 *  (notePressEnd). What the owner reads afterwards as what a press cost (pressesOf). */
const isPressRow = (t) => !!(t && t.press && Number(t.planned) >= 0);
function notePressRow(state, { at = Date.now(), reason = null, press = null, n = 0 } = {}) {
  const s = pruneBudget(state, at, LOAD_RETENTION);
  if (!isAttended(reason) || !press) return s;
  s.attended = [...s.attended, { at, reason, press: String(press).slice(0, 80), planned: Math.max(0, Math.floor(Number(n)) || 0) }].slice(-ATTENDED_KEEP);
  return s;
}
/** PURE (主开发 21:04Z (b)): the press ended — how many it DELIVERED, and when. Its row only; a press never seen is left alone. */
function notePressEnd(state, { at = Date.now(), press = null, delivered = 0 } = {}) {
  const s = pruneBudget(state, at, LOAD_RETENTION);
  const pid = press ? String(press).slice(0, 80) : null;
  const i = pid ? s.attended.findIndex((t) => isPressRow(t) && t.press === pid) : -1;
  if (i < 0) return s;
  s.attended = [...s.attended.slice(0, i), { ...s.attended[i], delivered: Math.max(0, Math.floor(Number(delivered)) || 0), ended: at }, ...s.attended.slice(i + 1)];
  return s;
}
/** PURE (主开发 21:04Z (a)): THE PRESSES OF THE DAY, as the owner reads them — [{at, press, reason, planned, delivered|null, ended|null,
 *  byAccount:[{key, name, n}]}], newest first; `byAccount` = the press's folded per-continue rows (what was delivered where). */
function pressesOf(state, { now = Date.now() } = {}) {
  const rows = pruneBudget(state, now, LOAD_RETENTION).attended;
  return rows.filter(isPressRow).map((p) => ({
    at: stampAt(p), press: p.press, reason: p.reason, planned: Number(p.planned) || 0,
    delivered: Number.isFinite(Number(p.delivered)) && p.delivered !== undefined ? Number(p.delivered) : null, ended: Number(p.ended) || null,
    byAccount: rows.filter((t) => !isPressRow(t) && t.press === p.press).map((t) => ({ key: t.key || null, name: t.name || t.key || null, n: Number(t.count) || 1 })),
  })).sort((a, b) => b.at - a.at);
}
/** PURE (B-0a33 (2), the readers' round). A frame waiting in an agent too old to give a queued message back: it cannot be held,
 *  and may run past a cap lowered below it (or while the ledger cannot be read). ONE For-you line per frame, said here. */
const UNHELD_WORDS = Object.freeze({
  cap: Object.freeze(['A message waiting behind «{conversation}» could not be held: its agent is too old to give a queued message back, so it may run past the limit for turns nobody typed.', 'A waiting message could not be held: its agent is too old to give a queued message back, so it may run past the limit for turns nobody typed.']),
  ledger: Object.freeze(['A message waiting behind «{conversation}» could not be held: its agent is too old to give a queued message back, so it may run while the record of turns nobody typed cannot be read.', 'A waiting message could not be held: its agent is too old to give a queued message back, so it may run while the record of turns nobody typed cannot be read.']),
  door: 'Restart that conversation so it runs on this VibeSpace’s agent — then a waiting message can be held.',
});
function unheldI18n(why, { conversation = '' } = {}) {
  const row = UNHELD_WORDS[why === 'ledger' ? 'ledger' : 'cap'];
  const c = conversation ? String(conversation).slice(0, 120) : '';
  return { text: { key: row[c ? 0 : 1], params: c ? { conversation: c } : {} }, detail: [{ key: UNHELD_WORDS.door }] };
}

/** PURE. "job-notification ×9, auto-resume ×3" — the top producers, most first. */
function producersText(counts, { top = 3 } = {}) {
  const rows = Object.entries(counts || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, top);
  return rows.map(([r, n]) => `${SPEND_REASONS[r] ? r : r === 'unknown' ? 'older builds (no reason recorded)' : r} ×${n}`).join(', ');
}

/** PURE. Drop everything older than a day; the hour window is a filter over the
 *  same list. Returns a NEW object (never mutates the caller's state) so a
 *  refused authorization cannot leave a half-pruned ledger behind. */
function pruneBudget(state, now = Date.now(), limits = null) {
  const s = state && typeof state === 'object' ? state : emptyBudget();
  const cut = now - DAY_MS;
  const cap = stampCap(limits);
  // B-0a33: a stamp is kept a day past its LAST instant (its run, its end — the windows count it there), and a WAITING
  // reservation for as long as its frame may still run (RESERVATION_WAIT_MAX_MS)
  const keep = (list) => (Array.isArray(list) ? list.filter((t) => lastStampAt(t) > cut || (waitingStamp(t) && stampAt(t) > now - RESERVATION_WAIT_MAX_MS)).slice(-cap) : []);
  const identities = {};
  for (const [k, v] of Object.entries(s.identities || {})) {
    const l = keep(v);
    if (l.length) identities[k] = l;
  }
  const notices = {};
  for (const [k, v] of Object.entries(s.notices || {})) if (Number(v) > cut) notices[k] = Number(v);
  // the ATTENDED tally (lane owner-press-attended): `{at, reason, key}` per press, a day, never a stamp any cap reads
  // (f) a paced press longer than a day keeps its rows: a folded row is pruned by its LAST continue, a press row by its end
  const attended = Array.isArray(s.attended) ? s.attended.filter((t) => Math.max(stampAt(t), Number(t && t.last) || 0, Number(t && t.ended) || 0) > cut).slice(-ATTENDED_KEEP) : [];
  return { v: 1, identities, instance: keep(s.instance), notices, attended };
}

/** PURE (B-ef83, 主开发's law 2026-11-19 19:20Z: A RESET NOTICE ONLY FOR A REAL LOSS). What a ledger COUNTS that a lost copy would
 *  take with it: its newest stamp (`newestAt`) and the instant its last counting stamp stops counting in every window (`until`:
 *  a day past a stamp's last instant; a waiting reservation's own bound) — null when it holds no stamp. The marker beside the
 *  ledger keeps it at every write; a ledger met at load is a LOSS only when it lacks a stamp that still counts. */
function countedOf(state, now = Date.now()) {
  const s = state && typeof state === 'object' ? state : emptyBudget();
  let newestAt = 0, until = 0;
  const lists = [Array.isArray(s.instance) ? s.instance : [], ...Object.values(s.identities || {}).filter(Array.isArray)];
  for (const list of lists) for (const t of list) {
    newestAt = Math.max(newestAt, stampAt(t));
    until = Math.max(until, waitingStamp(t) ? stampAt(t) + RESERVATION_WAIT_MAX_MS : lastStampAt(t) + DAY_MS);
  }
  return newestAt > 0 && until > now ? { newestAt, until } : null;
}
/** PURE (B-ef83). Did a ledger LOSE turns that still count? `counted` = the marker's record of the last write (countedOf), `budget`
 *  = the ledger as met (null: gone). A loss = a stamp the marker knew, still counting `now`, that the ledger does not hold — its
 *  newest stamp is older than the marker's. No record (an older marker, a hand-written one) proves nothing: no loss is said. */
function countLost(counted, budget, now = Date.now()) {
  if (!counted || !(Number(counted.newestAt) > 0) || !(Number(counted.until) > now) || Number(counted.newestAt) > now + 60 * 1000) return false;
  const have = budget ? countedOf(budget, -Infinity) : null;   // the ledger's own newest stamp, whatever its age
  return !have || have.newestAt < Number(counted.newestAt);
}

/** PURE (B-3b0f). Two ledgers as one — the file's, read again, and the stamps made while it could not be read: every
 *  stamp of both is kept (the file's first, then the newer ones; never deduplicated — counting one twice is the safe side). */
function mergeBudget(a, b) {
  const x = a && typeof a === 'object' ? a : emptyBudget(), y = b && typeof b === 'object' ? b : emptyBudget();
  const list = (l) => (Array.isArray(l) ? l : []);
  const identities = {};
  for (const k of new Set([...Object.keys(x.identities || {}), ...Object.keys(y.identities || {})])) identities[k] = [...list((x.identities || {})[k]), ...list((y.identities || {})[k])];
  const notices = { ...(x.notices || {}) };
  for (const [k, v] of Object.entries(y.notices || {})) notices[k] = Math.max(Number(notices[k]) || 0, Number(v) || 0);
  return { v: 1, identities, instance: [...list(x.instance), ...list(y.instance)], notices, attended: [...list(x.attended), ...list(y.attended)] };
}

/** PURE. What this identity (and the instance) has spent inside each window. */
function spendCounts(state, identityKey, now = Date.now()) {
  const s = state && typeof state === 'object' ? state : emptyBudget();
  const mine = Array.isArray(s.identities?.[identityKey]) ? s.identities[identityKey] : [];
  const inst = Array.isArray(s.instance) ? s.instance : [];
  // B-0a33: every window counts a stamp at its COUNT INSTANT (a waiting one: now — in every window it may run in; a carried
  // one: where it ran; a given-up one: where the hub stopped waiting); a waiting stamp past RESERVATION_WAIT_MAX_MS holds none
  const live = (t) => !(waitingStamp(t) && stampAt(t) <= now - RESERVATION_WAIT_MAX_MS);
  const since = (list, ms) => list.filter((t) => live(t) && countAt(t, now) > now - ms);
  const hour = since(mine, HOUR_MS);
  const day = since(mine, DAY_MS);
  const instanceDay = since(inst, DAY_MS);
  const settledOldest = (list) => { const at = list.filter((t) => !waitingStamp(t)).map((t) => countAt(t, now)); return at.length ? Math.min(...at) : 0; };
  const promised = (list) => list.filter(waitingStamp).length;   // lane queued-is-not-woke: reserved, waiting behind running turns (B-0a33: one the hub gave up is not waiting)
  return {
    hour: hour.length, day: day.length, instanceDay: instanceDay.length,
    promisedHour: promised(hour), promisedDay: promised(day), promisedInstanceDay: promised(instanceDay),
    // when the window frees a slot again — the honest retryAfter, not a guess
    // B-0a33: a WAITING reservation frees its slot when its frame runs or is given back, never at a window's edge — no promise
    hourOldest: settledOldest(hour),
    dayOldest: settledOldest(day),
    instanceOldest: settledOldest(instanceDay),
    // WHO spent each window (5b ③): the refusal and the 80 % notice name them
    producers: { hour: producerCounts(hour), day: producerCounts(day), instanceDay: producerCounts(instanceDay) },
  };
}

// ── RESERVATIONS: AUTHORIZE AND CHARGE ARE NOT ONE INSTANT (r5, reproduced) ──
// The two-phase contract (authorize answers, note charges) is what keeps an
// authorization that never became a turn from eating budget. It also opens a
// window: everything a producer does between the two is invisible to the
// ledger, so N deliveries dispatched in one pass all read the same pre-charge
// counts and every one of them is authorized. MEASURED with the real guard and
// the real delivery ladder, cap 2/hour, five conversations on ONE credential
// slot dispatched synchronously (src/jobs.js fires `deliverToConversation`
// fire-and-forget from a loop over `this.jobs`, and `_notifyRate`'s 30 s floor
// is keyed PER CONVERSATION so it does not serialise across them): 5 delivered,
// 0 refused, 5 turns charged against a cap of 2. Sequentially: 1.
//
// So an authorization HOLDS what it authorized. A hold counts against the caps
// exactly like a charge until it is converted (`note`), given back (`release`)
// or times out. It is deliberately NOT a stamp: a stamp is a turn that
// happened, and the stash rung — the ladder's normal fallback for an
// unreachable conversation — opens no turn at all.
//
// TTL: a hold must outlive the longest legitimate gap between authorize and
// charge, which is the ladder's own SETTLE_TTL_MS (120 s — a frame written on
// the rpc rung waits for the wrapper's `peer_message_result` before it is known
// to have opened a turn). 3 minutes is that plus margin, and it is far below
// HOUR_MS, which is why the counts below need no windowing: a live hold is
// inside every window this module counts. Both relations are asserted in
// scripts/test-spend-paths.mjs §1 — a hold that expires before the ladder can
// settle it re-opens this defect, and one that outlived an hour would be a
// second, unwindowed accounting.
const RESERVE_TTL_MS = 3 * 60 * 1000;
const RESERVE_CAP = 2000;   // bounded: a producer that never settles must not grow this without limit

/** PURE. How much this identity (and the instance) has AUTHORIZED but not yet
 *  charged. One number per scope, not a window: see RESERVE_TTL_MS. */
function pendingCounts(pending, identityKey, now = Date.now(), ttlMs = RESERVE_TTL_MS) {
  let identity = 0, instance = 0;
  for (const p of (Array.isArray(pending) ? pending : [])) {
    if (!p || !(now - (Number(p.at) || 0) < ttlMs)) continue;
    instance++;
    if (identityKey && p.key === identityKey) identity++;
  }
  return { identity, instance };
}

/** PURE. Add one hold. Returns a NEW list (never mutates the caller's). */
function reservePending(pending, { id, key, at = Date.now() } = {}, { cap = RESERVE_CAP } = {}) {
  const list = Array.isArray(pending) ? pending.slice() : [];
  if (!id || !key) return list;
  list.push({ id: String(id), key: String(key), at: Number(at) || 0 });
  return list.length > cap ? list.slice(-cap) : list;
}

/** PURE. Drop one hold by id — the same call for "it became a turn" and for
 *  "it did not", because the ledger's stamp is what records the difference. */
function releasePending(pending, id) {
  const list = Array.isArray(pending) ? pending : [];
  if (!id) return list.slice();
  const want = String(id);
  return list.filter((p) => p && p.id !== want);
}

/** PURE. Renew holds by id (lane auto-resume-bulk, U2 cure): a batch opens all its holds at once and delivers them paced,
 *  each behind a pre-fire gate (bounded at 90 s) — so the holds it has not reached yet are re-stamped `at = now` on every
 *  pass, or a batch longer than RESERVE_TTL_MS would drop them and let another producer into budget the batch then
 *  charges. Returns a NEW list; an id not held is ignored. */
function renewPending(pending, ids, now = Date.now()) {
  const want = new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String));
  return (Array.isArray(pending) ? pending : []).map((p) => (p && want.has(p.id) ? { ...p, at: Number(now) || 0 } : p));
}

/** PURE. Split holds into the live ones and the ones that timed out. The
 *  expired half is a CENSUS, not garbage: a hold nobody converted or released
 *  is a producer that authorized a spend and never said what happened, which is
 *  exactly the shape a grep over the call sites cannot see. */
function expirePending(pending, now = Date.now(), ttlMs = RESERVE_TTL_MS) {
  const live = [], expired = [];
  for (const p of (Array.isArray(pending) ? pending : [])) {
    if (!p) continue;
    (now - (Number(p.at) || 0) < ttlMs ? live : expired).push(p);
  }
  return { live, expired };
}

// HOW OLD AN OVERAGE RECORD MAY BE AND STILL REFUSE A TURN (r2, reproduced).
// `cache.overage` rides only SOME `rate_limit_event`s — rate-limit-capture.js
// merges it when at least one overage field is defined — so its `asOf` goes
// stale for long stretches on an account that is being read constantly.
// MEASURED on this instance's seven live records: ages 0h, 2h, 5h, 5h, 5h, 21h
// and **33h**, the 33h one on a cache file refreshed 4 MINUTES ago; and 0 of 7
// carry a `resetsAt` at all. So a window of hours would flip live accounts to
// 'unknown' (which ALLOWS) and let real money through, while NO window at all
// means a record that stops being refreshed refuses every unattended turn for
// ever — including the auto-resume continue for a session that is BY
// DEFINITION idle and therefore producing no events to refresh it with.
// 7 days is >5× the longest refresh gap measured here.
const OVERAGE_STALE_MS = 7 * 24 * 3600 * 1000;

/** PURE. Does this account's usage cache say REAL MONEY is being spent right
 *  now? `cache.overage` is written by src/rate-limit-capture.js from the CLI's
 *  own `rate_limit_event` (isUsingOverage / overageStatus / overageResetsAt /
 *  overageDisabledReason) and — until this change — was read by NOBODY.
 *
 *  THE RANKING BUG IT CAUSES: with overage on, `utilization` stays under 1
 *  while every token is billed pay-per-use, so `accountRemaining()` sees an
 *  account with the MOST headroom exactly when it is the most expensive one.
 *  Returns a three-state verdict, never a boolean: 'yes' | 'no' | 'unknown'
 *  (no overage record at all — P6, ignorance is not a claim).
 *
 *  THE CLAIM THAT BLOCKS IS THE ONE THAT NEEDS A DATE (r2). `inUse:'yes'` is
 *  what refuses spend AND what paints the panel chip whose tip says "Automatic
 *  turns are refused on this account", so it expires two ways:
 *    · the record's own `resetsAt` is in the PAST — it describes a billing
 *      period that has ENDED, so it is not a statement about now (and it was
 *      also what produced a `retryAfter` printing an instant in the past);
 *    · its `asOf` is older than OVERAGE_STALE_MS.
 *  An expired claim answers 'unknown', which neither blocks nor claims (P6) —
 *  and `stated` keeps what the record literally says, with `evidence` naming
 *  which rung decided, so a refusal is never mistaken for a stale file and a
 *  diagnostic can tell the two apart. `inUse:'no'` is NOT bounded: it blocks
 *  nothing, and downgrading it to 'unknown' would change no decision anywhere.
 *  An UNDATED record (`asOf` absent — a hand edit or a foreign writer; our own
 *  producer stamps it on the same line it merges) cannot claim the present. */
function overageState(cache, { now = Date.now(), staleMs = OVERAGE_STALE_MS } = {}) {
  const o = cache && typeof cache === 'object' ? cache.overage : null;
  if (!o || typeof o !== 'object') {
    return { inUse: 'unknown', stated: 'unknown', evidence: 'none', ageMs: null, mode: 'unknown', status: null, resetsAt: null, disabledReason: null, asOf: 0, spend: null };
  }
  const raw = o.inUse;
  const stated = raw === true ? 'yes' : raw === false ? 'no' : 'unknown';
  const spend = cache.spend && typeof cache.spend === 'object' && Number.isFinite(Number(cache.spend.used))
    ? { used: Number(cache.spend.used), limit: Number(cache.spend.limit) || null, pct: Number(cache.spend.pct) || null }
    : null;
  const asOf = Number(o.asOf) || 0;
  const resetsAt = Number(o.resetsAt) || null;
  const ageMs = asOf > 0 ? Math.max(0, now - asOf) : null;
  let evidence = 'fresh';
  if (stated === 'yes') {
    if (!asOf) evidence = 'undated';
    else if (resetsAt && resetsAt * 1000 <= now) evidence = 'period-ended';
    else if (ageMs > staleMs) evidence = 'stale';
  } else evidence = stated === 'no' ? 'stated-off' : 'none';
  const inUse = stated === 'yes' && evidence !== 'fresh' ? 'unknown' : stated;
  // THE THIRD STATE (B-ad05, 2026-09-17): an org whose extra usage is ENABLED
  // but not (yet) in use. Measured on this instance: one member's record was
  // `{inUse:false}` with no status while every other member carried
  // `status:'rejected', disabledReason:'org_level_disabled…'` — and the pool
  // idled every conversation on that one member for 14 h while its 5h/Fable
  // read 100 %, served by credits and billed pay-per-use, with the chip hidden
  // because `inUse` never turned true. `mode` names what the record says
  // about the ORG, beside `inUse` (what it says about the present spend):
  //   'inUse'    — the dated, fresh claim that money is being spent now
  //   'disabled' — the vendor says overage is rejected / disabled for this org
  //   'allowed'  — overage is present and NOT disabled: past 100 % this org
  //                bills pay-per-use instead of stopping
  //   'unknown'  — no record, or a record that states nothing either way
  // An org-level configuration is not a claim about the present, so 'allowed'
  // is NOT date-bounded (like `inUse:'no'`): it changes no spend verdict —
  // only the pool's ranking and a dim chip read it.
  const disabled = o.status === 'rejected' || !!o.disabledReason;
  // 'allowed' NEEDS POSITIVE EVIDENCE (final verifier, 2026-09-17): the vendor
  // omits `overageStatus` on a large share of events (39 of 125 in 72 h on
  // this instance) and the pre-fix merge wiped stored statuses, so "inUse:false
  // with no status" is ALSO the shape of an overage-DISABLED org whose record
  // was rewritten by a status-less event — ranking it last and announcing
  // "billing pay-per-use" would be a false sentence. Evidence = a status the
  // vendor stated that is not a rejection, or money seen flowing recently
  // (`inUse:true` whose period has ended, still inside the staleness bound).
  // No status at all is 'unknown' — ignorance is not a claim (P6).
  // …or a DATED claim that money once flowed (`inUse:true` whose period has
  // ended or whose record went stale — an org that billed overage is an org
  // that allows it; only an UNDATED claim proves nothing).
  const statusAllows = o.status != null && String(o.status) !== '' && o.status !== 'rejected';
  const usedBefore = stated === 'yes' && evidence !== 'undated';
  const mode = inUse === 'yes' ? 'inUse' : disabled ? 'disabled' : (statusAllows || usedBefore) ? 'allowed' : 'unknown';
  return {
    inUse, stated, evidence, ageMs, mode,
    status: o.status ?? null, resetsAt,
    disabledReason: o.disabledReason ?? null, asOf, spend,
  };
}

/** PURE. Does this org have usage credits ENABLED and not in use — i.e. will
 *  it keep serving past 100 % on pay-per-use billing instead of stopping?
 *  The pool's ranking asks this (a credits-allowed member ranks below every
 *  member with quota left and is a last-resort target only); the spend guard
 *  does NOT (an unattended turn on it is refused only once overage is IN USE,
 *  which is `inUse:'yes'`, unchanged). */
function overageAllowed(cache, opts = undefined) {
  return overageState(cache, opts).mode === 'allowed';
}

/** PURE. The one sentence every surface says about an overage-billing account
 *  (usage popup, Manage Agents, the refusal notice). null = nothing to say.
 *  Takes the SAME evidence options as `overageState` and hands them straight
 *  through: a sentence built on a different clock than the gate is exactly the
 *  "two faces of one record disagree" shape ⑤ exists to close — it would say
 *  "paid overage in use" about a record the authorizer has already expired. */
function overageText(cache, opts = undefined) {
  const o = overageState(cache, opts);
  if (o.inUse !== 'yes') return null;
  const money = o.spend
    ? ` — $${o.spend.used.toFixed(2)}${o.spend.limit ? ` of $${o.spend.limit.toFixed(2)}` : ''} this period`
    : '';
  return `paid overage in use${money}`;
}

/** PURE. THE ONE READER of `cache.spendControlReached` — the THIRD field the
 *  design's §1.4 row named and the one r3 marked CLOSED without wiring
 *  (measured 2026-09-09: `grep -rn spendControlReached src/` returned exactly
 *  two hits, both the WRITER in src/harnesses/codex-quota.js).
 *
 *  WHAT IT MEANS, and what it is NOT. Codex reports it beside the rate-limit
 *  windows; it says this account has reached its configured SPEND CONTROL, so
 *  further requests are REJECTED. That is not the overage class — no dollars
 *  are being spent — it is the `identity-cannot-serve` class: an unattended
 *  turn on it buys a failed request and a junk card, and the account can rank
 *  as the member with the most headroom while it does (`accountRemaining()`
 *  reads `utilization`, and only a `rate_limit_reached_type` marks a window
 *  spent — nothing marks THIS).
 *
 *  THREE-STATE, and DATED like its sibling (P6 + r2's "only the claim that
 *  BLOCKS needs a date"): the snapshot is rebuilt wholesale by every codex
 *  reading producer and stamps its own `fetchedAt`, so that is the date, and a
 *  record older than OVERAGE_STALE_MS — the SAME constant, imported not
 *  re-declared, because a second window for one physical fact is how twins are
 *  born — answers 'unknown', which neither blocks nor claims. `reached:'no'`
 *  is deliberately NOT bounded: it blocks nothing. */
function spendControlState(cache, { now = Date.now(), staleMs = OVERAGE_STALE_MS } = {}) {
  const raw = cache && typeof cache === 'object' ? cache.spendControlReached : undefined;
  const stated = raw === true ? 'yes' : raw === false ? 'no' : 'unknown';
  const asOf = Number(cache && cache.fetchedAt) || 0;
  const ageMs = asOf > 0 ? Math.max(0, now - asOf) : null;
  let evidence = 'none';
  if (stated === 'yes') evidence = !asOf ? 'undated' : ageMs > staleMs ? 'stale' : 'fresh';
  else if (stated === 'no') evidence = 'stated-off';
  const reached = stated === 'yes' && evidence !== 'fresh' ? 'unknown' : stated;
  return { reached, stated, evidence, ageMs, asOf };
}

/** PURE. The one sentence every surface says about it. null = nothing to say. */

/** PURE. THE DECISION. Everything it needs is an argument; nothing is read.
 *  @param reason      one of SPEND_REASONS
 *  @param identity    {key, name} — the credential slot this turn will BILL
 *  @param state       the persisted ledger (see pruneBudget)
 *  @param limits      budgetLimits()
 *  @param overage     overageState(cache) for that identity, or null (unknown)
 *  @param overagePolicy 'refuse' (default, D3b) | 'allow'
 *  @param credential  {serves: 'yes'|'no'|'unknown'} — login/credential state
 *  @param spendControl spendControlState(cache), or null (unknown)
 *  @param pending     the live HOLDS (see RESERVE_TTL_MS): authorizations that
 *        have not yet become a charge. They bind exactly like charges — that is
 *        what makes the ceiling hold across producers running concurrently.
 *  @returns {ok, why, detail, retryAfter, counts, inFlight, limits, reason, identity}
 */
function authorizeUnattendedSpend({
  reason, identity = null, state = null, limits = BUDGET_DEFAULTS,
  overage = null, overagePolicy = 'refuse', credential = null,
  spendControl = null, pending = null, ledger = null, now = Date.now(),
  // HOW MANY TURNS this one answer is for (lane auto-resume-bulk): 1 for every producer but the batch, whose share on
  // this slot is `need` and whose whole size is `instanceNeed` — so a cap is checked against what the batch WILL spend,
  // never against its first turn. need = 1 is the old rule exactly (`used + 1 > cap` ⇔ `used >= cap`).
  need = 1, instanceNeed = need,
} = {}) {
  const L = { ...BUDGET_DEFAULTS, ...(limits || {}) };
  const key = identity && identity.key ? String(identity.key) : null;
  const name = (identity && (identity.name || identity.key)) || null;
  const counts = spendCounts(state, key || '__no-identity__', now);
  // COUNTS ARE WHAT WAS SPENT; inFlight IS WHAT WAS AUTHORIZED AND NOT YET
  // SETTLED. Kept apart on purpose: every surface that reports "N of M turns
  // today" must keep reporting turns that HAPPENED, while the ceiling has to
  // bind on both or a concurrent pass walks straight through it.
  const inFlight = pendingCounts(pending, key, now);
  const flight = (n) => (n > 0 ? ` (+${n} in flight)` : '');
  const no = (why, detail, retryAfter = 0, producers = null, extra = null) => ({ ok: false, why, detail, retryAfter, counts, inFlight, limits: L, reason, identity: identity || null, producers, ...(extra || {}) });
  if (!reason || !(reason in SPEND_REASONS)) {
    // An unnamed producer is the one shape the census exists to prevent; if it
    // reaches here at runtime it must not spend.
    return no('unknown-reason', `"${String(reason)}" is not a declared unattended-spend reason`);
  }
  // FAIL CLOSED on an unnameable identity: a ceiling nobody can be charged
  // against is not a ceiling. (Structurally rare — wallSlotFor answers
  // `__global__` for a session with no pool — so this is the wiring being
  // broken, which is exactly when spending must stop.)
  if (!key) return no('identity-unknown', 'the credential slot this turn would bill could not be resolved');
  // A credential that CANNOT serve (expired/wiped login, no long-lived token)
  // spends nothing but a failed turn and a junk card. 'unknown' passes: P6.
  if (credential && credential.serves === 'no') {
    return no('identity-cannot-serve', `${name} cannot authorize a request right now (${credential.state || 'signed out'})`, 0, null, { credentialState: String(credential.state || 'signed out') });   // r2: the notice names the login
  }
  // THE SAME CLASS, stated by the harness instead of by the credential file
  // (design §1.4's third named field): codex says this account has reached its
  // spend control, so its requests are REJECTED. No dollars are at stake — the
  // turn simply buys a failed request and a junk card — and it is NOT gated by
  // `spend.allowOverageTurns`, which is an opt-in to SPENDING money, not an
  // opt-in to being refused by the vendor. Only a FRESH, dated claim blocks
  // (spendControlState); 'unknown'/'no' never do.
  if (spendControl && spendControl.reached === 'yes') {
    return no('spend-control-reached', `${name} has reached its spend control — its requests are rejected, so an unattended turn on it buys nothing`);
  }
  // REAL MONEY (D3b). While overage is in use the account is billing
  // pay-per-use, so an unattended turn is a dollar decision, not a quota one.
  if (overage && overage.inUse === 'yes' && overagePolicy !== 'allow') {
    // SAY HOW OLD THE EVIDENCE IS (r2): a refusal that never expires and never
    // dates itself is indistinguishable from a stale file, and `retryAfter`
    // used to print an instant in the PAST (a resetsAt that has already come
    // round — now an expiry rung inside overageState, so it cannot reach here).
    const seen = Number(overage.ageMs) > 0 ? ` (last reported ${Math.round(overage.ageMs / 60000)} min ago)` : '';
    return no('overage-in-use', `${name} is billing paid overage${seen} — unattended turns are refused while real money is being spent`, overage.resetsAt ? overage.resetsAt * 1000 : 0, null, Number(overage.ageMs) > 0 ? { overageSeenAt: now - Number(overage.ageMs) } : null);   // r3: the notice says WHEN it was last reported (an instant, said in the viewer's zone)
  }
  // ATTENDED (lane owner-press-attended): a person's per-occurrence press — the BUDGET neither refuses nor counts it.
  // Answered BEFORE the caps (a full hour of stamps does not refuse it) and with no hold (spend-guard reads `attended`).
  if (isAttended(reason)) return { ok: true, attended: true, why: null, detail: null, retryAfter: 0, counts, inFlight, limits: L, reason, identity: identity || null };
  // r3136 (主开发 r3146 (3)) — THE ACCOUNT's USAGE READING CANNOT BE TOLD: its file could not be read, or after torn bytes its overage
  // (claude) or its spend control (codex) is not stated again — whether this turn would bill paid overage is unknown, so an
  // UNATTENDED turn waits (a tightening). A person's attended press is answered above; a person's typed turn is no spend reason.
  if ((overage && overage.unread) || (spendControl && spendControl.unread)) {
    return no('reading-unread', `${name}'s usage reading cannot be told right now — whether this turn would bill paid overage is unknown, so unattended turns wait until it reads again`);
  }
  // B-3b0f: THE LEDGER COULD NOT BE READ — a count that restarted from nothing is not a count, so no cap below can be
  // judged; every unattended turn is refused BY NAME until the file reads again or is removed (spend-guard `ledger`)
  // B-ef83: ANOTHER HUB PROCESS HOLDS THE LEDGER (its lock, data/spend-budget.lock): this process's count is not the count — two
  // processes each counting their own would allow a cap twice — so it starts none, by name, until the lock is its own
  // B-ef83 r1648: NO process keeps the record's lock and this one CANNOT WRITE it (the folder refuses it): the release's direction —
  // none run — by the TRUE reason (never «another process»); the guard's retry takes the lock the moment the folder writes again
  if (ledger && ledger.lockUnwritable) return no('ledger-lock-unwritable', `the lock of the record of unattended turns (data/spend-budget.lock) cannot be written (${String(ledger.error || 'unwritable').slice(0, 60)}) and no other process keeps the record — none run until it can (asked again by itself)`);
  // r1801 (1): the lock is THERE and cannot be read, and the folder refuses a new one — it may be a live keeper's: held, by THAT reason
  if (ledger && ledger.lockUnreadable) return no('ledger-lock-unreadable', `the lock of the record of unattended turns (data/spend-budget.lock) is there and cannot be read (${String(ledger.error || 'unreadable').slice(0, 60)}) — it may be a live keeper's, so none run until it reads or can be made (asked again by itself)`);
  if (ledger && ledger.held) return no('ledger-held-elsewhere', `another VibeSpace process on this data folder (pid ${String(ledger.pid || '?').slice(0, 12)}${ledger.host ? ' on ' + String(ledger.host).slice(0, 60) : ''}) keeps the record of unattended turns (data/spend-budget.json) — this one counts none, so none run`);
  if (ledger && ledger.unreadable) return no('ledger-unreadable', `the record of unattended turns (data/spend-budget.json) could not be read (${String(ledger.error || 'unreadable').slice(0, 120)}) — none can be counted, so none run`);
  // B-225b R11 (the persistence holds): the SETTINGS could not be read at the start (data/settings.json held — every row on its
  // default) — the limits are not known: NOT NOW, a refusal that uses nothing up, judged again against the real limits at the lift
  if (ledger && ledger.settingsUnread) return no('settings-unread', `the settings (data/settings.json) could not be read (${String(ledger.code || ledger.kind || 'unreadable').slice(0, 60)}) — the spending limits are not known, so none run until they read; nothing is used up`);
  // THE HOLD IS PART OF THE SUM. `retryAfter` still speaks only of STAMPS: a
  // hold settles when its producer answers, not on a window boundary, so
  // promising an instant for it would be a guess (0 = "no promise about when",
  // which refusalText prints as nothing at all). A window full of HOLDS alone has
  // no oldest stamp — its retryAfter is 0, never `0 + HOUR_MS` (a 1970 instant the
  // client would say as «free now», lane owner-press-attended r2).
  const unsetSaid = (what, field) => `no cap is set for ${what} (the setting holds no number) — every unattended turn is refused until a number is set in its row of Settings → Spending: ${SL.settingLink(SPEND_ROW_KEYS[field])}`;   // B-0a33 (3); lane login-request-card (the links unit's owed row link): the row, as its link
  // `need` / `instanceNeed` (lane auto-resume-bulk, the signature above): a cap holds what a batch WILL spend
  const n = Math.max(1, Math.floor(Number(need)) || 1);
  const nAll = Math.max(n, Math.floor(Number(instanceNeed)) || n);
  const asks = (k) => (k > 1 ? ` — this batch needs ${k} more` : '');
  if (L.perIdentityHour === 0) return no('hour-cap', capUnset(L, 'perIdentityHour') ? unsetSaid('unattended turns per identity per hour', 'perIdentityHour') : `unattended turns per identity per hour are set to 0`, 0, null, capUnset(L, 'perIdentityHour') ? { capUnset: true } : null);
  if (counts.hour + inFlight.identity + n > L.perIdentityHour) return no('hour-cap', `${name} has ${spentWord(counts.promisedHour)} ${counts.hour}${flight(inFlight.identity)} unattended turns this hour${promisedTail(counts.promisedHour)} (cap ${L.perIdentityHour})${asks(n)}`, counts.hourOldest ? counts.hourOldest + HOUR_MS : 0, counts.producers.hour);
  if (L.perIdentityDay === 0) return no('day-cap', capUnset(L, 'perIdentityDay') ? unsetSaid('unattended turns per identity per day', 'perIdentityDay') : `unattended turns per identity per day are set to 0`, 0, null, capUnset(L, 'perIdentityDay') ? { capUnset: true } : null);
  if (counts.day + inFlight.identity + n > L.perIdentityDay) return no('day-cap', `${name} has ${spentWord(counts.promisedDay)} ${counts.day}${flight(inFlight.identity)} unattended turns today${promisedTail(counts.promisedDay)} (cap ${L.perIdentityDay})${asks(n)}`, counts.dayOldest ? counts.dayOldest + DAY_MS : 0, counts.producers.day);
  if (L.perInstanceDay === 0) return no('instance-cap', capUnset(L, 'perInstanceDay') ? unsetSaid('unattended turns for this instance', 'perInstanceDay') : `unattended turns for this instance are set to 0`, 0, null, capUnset(L, 'perInstanceDay') ? { capUnset: true } : null);
  if (counts.instanceDay + inFlight.instance + nAll > L.perInstanceDay) return no('instance-cap', `this instance has ${spentWord(counts.promisedInstanceDay)} ${counts.instanceDay}${flight(inFlight.instance)} unattended turns today${promisedTail(counts.promisedInstanceDay)} (cap ${L.perInstanceDay})${asks(nAll)}`, counts.instanceOldest ? counts.instanceOldest + DAY_MS : 0, counts.producers.instanceDay);
  return { ok: true, why: null, detail: null, retryAfter: 0, counts, inFlight, limits: L, reason, identity: identity || null };
}

/** PURE. ONE AUTHORIZATION FOR A BATCH (lane auto-resume-bulk): one owner action that opens N billed turns — the resume of
 *  every conversation a wall stopped — is decided ONCE, over the whole batch. `groups` = [{identity, n}] (the batch split
 *  by the slot each turn bills — the engine's fireIdentityFor, exactly as every auto-resume); `ofKey(key)` hands the
 *  per-slot facts ({overage, credential, spendControl}). Each slot must hold ALL of its share (`need: n`) and the
 *  instance all N (`instanceNeed`), against charges AND live holds; the FIRST refusal refuses the WHOLE batch and names
 *  its bucket and slot — a partial batch is a decision nobody made. FAIL CLOSED: an empty or malformed group refuses.
 *  @returns {ok, why, detail, retryAfter, identity, reason, n, groups:[verdict…]} */
function authorizeUnattendedBatch({
  reason, groups = [], state = null, limits = BUDGET_DEFAULTS, ofKey = () => ({}), overagePolicy = 'refuse', pending = null, ledger = null, now = Date.now(),
} = {}) {   // `ledger` (the cure, 主开发 20:16Z): every layer of the money gate fails closed — an unreadable budget refuses a gated batch by name
  const list = Array.isArray(groups) ? groups.filter((g) => g && Number(g.n) > 0) : [];
  const total = list.reduce((a, g) => a + Math.floor(Number(g.n)), 0);
  const no = (why, detail, extra = {}) => ({ ok: false, why, detail, retryAfter: 0, identity: null, reason, n: total, groups: [], ...extra });
  if (!list.length || !total) return no('empty-batch', 'the batch names no turn to authorize');
  const out = [], refusedSlots = [];
  const attended = isAttended(reason);
  for (const g of list) {
    const key = g.identity && g.identity.key ? String(g.identity.key) : null;
    let facts = {};
    try { facts = (key && ofKey(key)) || {}; } catch { facts = {}; }
    const v = authorizeUnattendedSpend({
      reason, identity: g.identity || null, state, limits, overagePolicy, pending, ledger, now,
      overage: facts.overage || null, credential: facts.credential || null, spendControl: facts.spendControl || null,
      need: Math.floor(Number(g.n)), instanceNeed: total,
    });
    // THE ACCOUNT, NOT THE PRESS (主开发 2026-11-18 16:20Z, the owner's ruling's own words — «an ACCOUNT already in paid
    // overage is still refused»): an ATTENDED batch skips each refusing slot's conversations BY NAME and the rest go on — the
    // per-continue re-ask's rule, at the start too. A gated batch (the twin) is all or nothing, as ever
    if (!v.ok && attended) { refusedSlots.push({ identity: v.identity || g.identity || null, why: v.why, detail: v.detail, n: Math.floor(Number(g.n)) }); continue; }
    if (!v.ok) {
      // the bucket's headroom, for the person's words (U2 cure: the batch's own numbers)
      const c = v.counts || {}, f = v.inFlight || {}, L = v.limits || {};
      const left = v.why === 'hour-cap' ? L.perIdentityHour - (c.hour || 0) - (f.identity || 0) : v.why === 'day-cap' ? L.perIdentityDay - (c.day || 0) - (f.identity || 0)
        : v.why === 'instance-cap' ? L.perInstanceDay - (c.instanceDay || 0) - (f.instance || 0) : null;
      return { ...v, n: total, need: v.why === 'instance-cap' ? total : Math.floor(Number(g.n)), left: left === null ? null : Math.max(0, Math.floor(left)), groups: [v] };
    }
    out.push(v);
  }
  // …and when EVERY slot refuses, the press starts nothing and says each one
  if (attended && refusedSlots.length && !out.length) {
    const r0 = refusedSlots[0];
    return { ok: false, why: r0.why, detail: r0.detail, retryAfter: 0, identity: r0.identity, reason, n: total, need: null, left: null, groups: [], refusedSlots };
  }
  // AN ATTENDED BATCH (the owner's ruling 2026-11-18 — the bulk press): every slot was still asked what binds a press
  // (overage, a credential, the spend control — above), and none of the caps; the guard takes no hold for it
  return { ok: true, ...(attended ? { attended: true } : {}), why: null, detail: null, retryAfter: 0, identity: null, reason, n: total, groups: out, ...(refusedSlots.length ? { refusedSlots } : {}) };
}

/** PURE. Record a spend that ACTUALLY happened (two-phase, like the loop
 *  breaker's canFire/noteFired: an authorization that never became a turn must
 *  not consume budget). Returns the new state plus, when this spend crossed the
 *  notice threshold on some axis, ONE warn object — the 80% line the owner
 *  asked for, emitted at the crossing and never again inside that window. */
function noteUnattendedSpend(state, { identity, at = Date.now(), limits = BUDGET_DEFAULTS, reason = null, rid = null, carried = false, drain = false, ended = false, behind = null, press = null } = {}) {
  const L = { ...BUDGET_DEFAULTS, ...(limits || {}) };
  const key = identity && identity.key ? String(identity.key) : null;
  // A PRUNE NEVER FORGIVES (lane queued-is-not-woke round 4): it keeps what the LARGEST caps the settings accept could count —
  // the owner may lower the caps and raise them again the same day; only TIME ages a stamp out (the live limits were the hole)
  const s = pruneBudget(state, at, LOAD_RETENTION);
  // A RESERVATION (lane queued-is-not-woke, law 1 round 2 — 主开发's ruling 2026-11-12): a frame queued behind a running
  // turn takes its unit NOW, as a stamp named by the frame's id (`rid`) — counted by every authorize in the hour and the
  // day exactly like a spent turn; the turn that later carries it is that SAME unit (a stamp for an id already stamped is
  // not a second one — idempotent across a crash); a hand-back returns it (returnReservation)
  const ridKey = rid ? String(rid) : null;
  // round 3: a CARRIED reservation is CONVERTED — its stamp marked (`conv`), never a second unit, never returnable after
  // a carry with no identity still finds its reservation (round 4, small): the stamp is looked for under every identity
  const ridKeyOwner = ridKey ? (key && (s.identities[key] || []).some((t) => t && t.rid === ridKey) ? key : Object.keys(s.identities).find((k) => (s.identities[k] || []).some((t) => t && t.rid === ridKey)) || null) : null;
  if (ridKey && ridKeyOwner) {
    // B-0a33: the carry is counted where it RAN (`ran`) — in the hour and the day (a stash drain too: the turn it rode ran then)
    // B-0a33 (1): a frame the hub had GIVEN UP on (`end`) that is then seen running in its wrapper is counted where it ran —
    // its instant moves to the run (later: never out of a window still ahead); a stash drain rides another turn, and keeps it
    if (carried) { for (const list of [s.identities[ridKeyOwner], s.instance || []]) for (const t of list) if (t && t.rid === ridKey) { if (waitingStamp(t) || (!drain && t.end && !t.ran)) t.ran = at; t.conv = true; } return { state: s, warn: null, converted: true }; }
    // B-0a33: ENDED — the hub stopped waiting for the frame and cannot tell whether it ran: the unit stays counted (never
    // returned by this), in the hour the hub stopped; it no longer holds the hour of every later authorize
    if (ended) { for (const list of [s.identities[ridKeyOwner], s.instance || []]) for (const t of list) if (t && t.rid === ridKey && waitingStamp(t)) t.end = at; return { state: s, warn: null, ended: true }; }
    return { state: s, warn: null };
  }
  if (ridKey && ended) return { state: s, warn: null };   // B-0a33: nothing waiting under that id (aged out, returned, never stamped): nothing to settle
  // A STASH DRAIN NEVER STAMPS (round 4): it rides somebody else's turn — it converts a stamp still there, adds nothing if gone
  if (ridKey && drain) return { state: s, warn: null };
  // ATTENDED: no stamp — the press joins the tally only (it never fills a window, never crosses the 80 % line)
  if (isAttended(reason)) {
    // A PRESS'S CONTINUES ARE ONE ROW PER ACCOUNT (the cure, 主开发 20:16Z): a press of any size never pushes its own first rows
    // or the day's earlier ones out of the tally — its per-continue rows are folded by (press, account), `count` = how many
    const pid = press ? String(press).slice(0, 80) : null;
    const i = pid ? s.attended.findIndex((t) => t && t.press === pid && t.key === key && t.reason === reason && !isPressRow(t)) : -1;
    if (i >= 0) { const row = s.attended[i]; s.attended = [...s.attended.slice(0, i), { ...row, count: (Number(row.count) || 1) + 1, last: at }, ...s.attended.slice(i + 1)]; }
    else s.attended = [...s.attended, { at, reason, key, ...(pid ? { press: pid, count: 1, ...(identity && identity.name ? { name: String(identity.name).slice(0, 80) } : {}) } : {}) }].slice(-ATTENDED_KEEP);
    // (f) a press still running is as fresh as its LAST continue: its press row is stamped with it, so a paced press longer than a
    // day is never pruned under its own continues (主开发 21:04Z)
    const pi = pid ? s.attended.findIndex((t) => isPressRow(t) && t.press === pid) : -1;
    if (pi >= 0) s.attended = [...s.attended.slice(0, pi), { ...s.attended[pi], last: at }, ...s.attended.slice(pi + 1)];
    return { state: s, warn: null };
  }
  if (!key) return { state: s, warn: null };
  const cap = stampCap(LOAD_RETENTION);   // round 4: the retention, never the live caps (a lowered cap must not cut a stamp a raise needs)
  // the stamp names its producer (5b ②) — a SPEND_REASONS member or null
  const wb = ridKey && !carried && behind && behind.key ? { key: String(behind.key).slice(0, 200), name: String(behind.name || '').slice(0, 120) } : null;   // B-0a33 round 1: the conversation a reservation waits behind (the refusal names it)
  const stamp = { at, reason: reason && reason in SPEND_REASONS ? reason : null, ...(ridKey ? { rid: ridKey } : {}), ...(ridKey && carried ? { conv: true } : {}), ...(wb ? { wb } : {}) };   // a carry whose reservation was never stamped: its ONE unit now, converted
  s.identities[key] = [...(s.identities[key] || []), stamp].slice(-cap);
  s.instance = [...(s.instance || []), stamp].slice(-cap);
  const c = spendCounts(s, key, at);
  let warn = null;
  if (L.noticePct > 0) {
    const axes = [
      { scope: 'hour', used: c.hour, limit: L.perIdentityHour, noticeKey: `${key}|hour` },
      { scope: 'day', used: c.day, limit: L.perIdentityDay, noticeKey: `${key}|day` },
      { scope: 'instance', used: c.instanceDay, limit: L.perInstanceDay, noticeKey: '__instance__|day' },
    ];
    for (const a of axes) {
      if (!a.limit) continue;
      const pct = Math.round((a.used / a.limit) * 100);
      if (pct < L.noticePct) continue;
      // one notice per axis per window: the ledger remembers when it spoke
      const spokeAt = Number(s.notices[a.noticeKey]) || 0;
      const windowMs = a.scope === 'hour' ? HOUR_MS : DAY_MS;
      if (spokeAt && at - spokeAt < windowMs) continue;
      s.notices[a.noticeKey] = at;
      warn = { scope: a.scope, pct, used: a.used, limit: a.limit, identity: identity || null, producers: c.producers[a.scope === 'hour' ? 'hour' : a.scope === 'day' ? 'day' : 'instanceDay'] };
      break; // the tightest axis that crossed is the one worth saying
    }
  }
  return { state: s, warn };
}

/** PURE. GIVE A RESERVATION BACK (lane queued-is-not-woke): the frame it was taken for was handed back or refused before
 *  any turn carried it — its stamp (named by `rid`) leaves every identity and the instance list. → {state, returned} */
function returnReservation(state, { rid = null, now = Date.now(), limits = null } = {}) {
  // A GIVE-BACK NEVER FORGIVES (round 3 MUST 1, round 4 MUST 2): a prune with no limits cut the WHOLE ledger to the default
  // retention (one give-back forgave 637 turns), and one with the LIVE limits cut it to a lowered cap's retention (the caps
  // raised the same day: 638 turns forgiven). Every pruneBudget call keeps LOAD_RETENTION (test-spend-paths' census reads
  // every file that can call it)
  const s = pruneBudget(state, now, LOAD_RETENTION);   // round 4: the largest offerable caps, never the live ones (`limits` is not read)
  if (!rid) return { state: s, returned: 0 };
  const r = String(rid);
  let returned = 0;
  const drop = (list) => list.filter((t) => { if (t && t.rid === r && !t.conv) { returned++; return false; } return true; });   // a CONVERTED stamp is a turn that ran: never returned
  for (const k of Object.keys(s.identities)) { s.identities[k] = drop(s.identities[k]); if (!s.identities[k].length) delete s.identities[k]; }
  const before = returned; s.instance = drop(s.instance || []); returned = before;   // the instance list mirrors the same stamp: one unit given back
  return { state: s, returned };
}

/** The refusal's verb: a window holding reservations (frames waiting behind running turns) is «spent or promised», and says how many wait. */
const spentWord = (promised) => (promised > 0 ? 'spent or promised' : 'spent');
const promisedTail = (promised) => (promised > 0 ? `, ${promised} of them waiting behind running turns` : '');

/** PURE (B-0a33 (2), the owner's word via 主开发 2026-11-17). THE WAITING FRAMES A CAP NO LONGER HOLDS — a cap lowered below
 *  what already waits (or set to 0, or left empty): per identity, the excess of its hour and its day over their caps; for the
 *  instance, the excess of its day over the instance cap beyond those already named — each time the NEWEST waiting
 *  reservations, at most as many as wait. queued-wakes takes these out of their wrapper's queue (held, said, never dropped):
 *  the ones left then run inside every cap. [] when every window holds what waits. */
function waitingOverCap(state, limits, now = Date.now()) {
  const s = state && typeof state === 'object' ? state : emptyBudget();
  const L = { ...BUDGET_DEFAULTS, ...(limits || {}) };
  const fresh = (t) => waitingStamp(t) && stampAt(t) > now - RESERVATION_WAIT_MAX_MS;
  const newest = (list) => (Array.isArray(list) ? list : []).filter(fresh).reverse().sort((a, b) => stampAt(b) - stampAt(a));   // the list is in write order: a tie is newest last
  const out = [];
  const taken = new Set();
  for (const k of Object.keys(s.identities || {})) {
    const c = spendCounts(s, k, now);
    const over = Math.max(c.hour - (Number(L.perIdentityHour) || 0), c.day - (Number(L.perIdentityDay) || 0), 0);
    for (const t of newest(s.identities[k]).slice(0, over)) if (!taken.has(t.rid)) { taken.add(t.rid); out.push(t.rid); }
  }
  const ci = spendCounts(s, '__instance__', now);
  const overI = ci.instanceDay - (Number(L.perInstanceDay) || 0) - newest(s.instance).filter((t) => taken.has(t.rid)).length;
  if (overI > 0) for (const t of newest(s.instance).filter((x) => !taken.has(x.rid)).slice(0, overI)) { taken.add(t.rid); out.push(t.rid); }
  return out;
}

/** PURE (B-0a33 round 1). Every WAITING reservation id in the ledger — queued-wakes ends the ones no live entry holds. */
function waitingRids(state) {
  const out = new Set();
  for (const list of Object.values((state && state.identities) || {})) for (const t of list || []) if (waitingStamp(t)) out.add(String(t.rid));
  return [...out];
}
/** PURE (B-0a33 round 1). The conversations an identity's WAITING reservations wait behind, the oldest wait first:
 *  [{key, name, n, since, rid}] (`rid` = its oldest frame — the wait's identity). */
function waitingBehind(state, identityKey, now = Date.now()) {
  const mine = (state && state.identities && state.identities[identityKey]) || [];
  const by = new Map();
  for (const t of mine) {
    if (!waitingStamp(t) || stampAt(t) <= now - RESERVATION_WAIT_MAX_MS) continue;
    const k = (t.wb && t.wb.key) || '?';
    const g = by.get(k) || { key: t.wb && t.wb.key ? t.wb.key : null, name: (t.wb && t.wb.name) || '', n: 0, since: Infinity, rid: null };
    g.n++; if (stampAt(t) < g.since) { g.since = stampAt(t); g.rid = String(t.rid); }
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => a.since - b.since);
}
/** PURE. Where a reservation stands: 'converted' (a turn carried it), 'reserved' (waiting), null (never stamped / aged out). */
function reservationState(state, rid) {
  if (!rid) return null;
  const r = String(rid);
  for (const list of Object.values((state && state.identities) || {})) for (const t of list || []) if (t && t.rid === r) return t.conv ? 'converted' : 'reserved';
  return null;
}

/** PURE. The sentence a refusal says — journal, telemetry detail and the "For
 *  you" inbox item share it, so the user reads the same words the log has. */
function refusalText(v, { sessionName = null, behind = null } = {}) {
  if (!v || v.ok) return null;
  const who = v.identity && (v.identity.name || v.identity.key) ? (v.identity.name || v.identity.key) : 'this account';
  const what = SPEND_REASONS[v.reason]?.what || v.reason;
  const where = sessionName ? ` in "${sessionName}"` : '';
  // THE INSTANT IS NAMED IN UTC, ZONE SAID (lane owner-press-attended): `toLocaleString()` printed the HUB's zone with no
  // zone word — userW's pod (Etc/UTC) said «8:21:33 AM», read in PT as 7.5 h away. A viewer reads the For-you item in
  // their own zone through `refusalI18n` (the client renders the epoch); this English line is the journal's and the key's.
  const when = v.retryAfter > 0 ? ` Next allowed after ${new Date(v.retryAfter).toISOString().replace(/\.\d{3}Z$/, 'Z')}.` : '';
  const spentBy = producersText(v.producers);
  const promisedHere = v.counts ? (v.why === 'hour-cap' ? v.counts.promisedHour : v.why === 'day-cap' ? v.counts.promisedDay : v.why === 'instance-cap' ? v.counts.promisedInstanceDay : 0) : 0;   // lane queued-is-not-woke: reserved stamps are promised
  const spent = spentBy ? ` ${promisedHere > 0 ? 'Spent or promised' : 'Spent'} by: ${spentBy}.` : '';
  // B-0a33 round 1: when waiting frames hold the cap, the line names the conversations they wait behind (at most three)
  const wb = promisedHere > 0 && Array.isArray(behind) && behind.length ? ` They wait behind ${behind.slice(0, 3).map((b) => `«${b.name || '?'}»`).join(', ')}${behind.length > 3 ? ` and ${behind.length - 3} more conversations` : ''}.` : '';
  const row = spendRowOf(v), door = row && !String(v.detail || '').includes(SL.settingLink(row)) ? ` The limit: ${SL.settingLink(row)} — the owner changes it there.` : '';   // lane setting-doors pick 1 (an empty cap's detail carries its link already: never said twice)
  return `VibeSpace refused ${what}${where}: ${v.detail}.${when}${spent}${wb}${door}`;
}

/** PURE. THE REFUSAL AS STRUCTURE (lane owner-press-attended; r2: «a notice never loses a fact it carried» — r1 filed one
 *  generic sentence that every client rendered IN PLACE OF `refusalText`, so the For-you notice lost the producer, the
 *  conversation, «Spent by» and the counts, and told a signed-out account to raise a limit). ONE row per `why`
 *  (REFUSAL_WORDS), each in two forms — with the conversation and without — whose params carry every fact `refusalText`
 *  says: the producer (`{key}` words: SPEND_REASONS[r].what), the conversation, the account, the cap and its scope, and
 *  the next free slot as an INSTANT CLAUSE (`{at, key, gone}`: the client says «the next frees at 08:57» in the
 *  viewer's zone while the instant is ahead and «the next is free now» once it has passed — at RENDER, the stored epoch
 *  never changes). The detail is LINES with params: the reason, the account, the counts per window, ONE «Spent by» row
 *  per producer, and the door that can help (a cap → Settings → Spending; a signed-out account → the Usage window; a
 *  vendor's spend control → not a VibeSpace setting). null for an allowed verdict. Keys are English sentences the
 *  dictionaries carry; scripts/test-spend-paths.mjs §10 reads them RENDERED through the client's own saidLine. */
const REFUSAL_WORDS = Object.freeze({
  'hour-cap': Object.freeze(['VibeSpace held {producer} in «{conversation}»: {account} has used its {cap} turns nobody typed this hour. {next}', 'VibeSpace held {producer}: {account} has used its {cap} turns nobody typed this hour. {next}']),
  'day-cap': Object.freeze(['VibeSpace held {producer} in «{conversation}»: {account} has used its {cap} turns nobody typed in 24 hours. {next}', 'VibeSpace held {producer}: {account} has used its {cap} turns nobody typed in 24 hours. {next}']),
  'instance-cap': Object.freeze(['VibeSpace held {producer} in «{conversation}»: this instance has used its {cap} turns nobody typed in 24 hours. {next}', 'VibeSpace held {producer}: this instance has used its {cap} turns nobody typed in 24 hours. {next}']),
  'switched-off': Object.freeze(['VibeSpace held {producer} in «{conversation}»: turns nobody typed are switched off for {account} — its limit is 0.', 'VibeSpace held {producer}: turns nobody typed are switched off for {account} — its limit is 0.']),
  'switched-off-instance': Object.freeze(['VibeSpace held {producer} in «{conversation}»: turns nobody typed are switched off for this instance — its limit is 0.', 'VibeSpace held {producer}: turns nobody typed are switched off for this instance — its limit is 0.']),
  'cap-unset': Object.freeze(['VibeSpace held {producer} in «{conversation}»: no limit is set for turns nobody typed on {account} — set a number.', 'VibeSpace held {producer}: no limit is set for turns nobody typed on {account} — set a number.']),   // B-0a33 (3)
  'cap-unset-instance': Object.freeze(['VibeSpace held {producer} in «{conversation}»: no limit is set for turns nobody typed on this instance — set a number.', 'VibeSpace held {producer}: no limit is set for turns nobody typed on this instance — set a number.']),
  'identity-cannot-serve': Object.freeze(['VibeSpace held {producer} in «{conversation}»: {account} cannot answer a request right now ({state}) — sign it in again from the Usage window.', 'VibeSpace held {producer}: {account} cannot answer a request right now ({state}) — sign it in again from the Usage window.']),
  'spend-control-reached': Object.freeze(['VibeSpace held {producer} in «{conversation}»: {account} has reached its spend control, so its requests are refused — a turn on it would buy nothing.', 'VibeSpace held {producer}: {account} has reached its spend control, so its requests are refused — a turn on it would buy nothing.']),
  'identity-unknown': Object.freeze(['VibeSpace held {producer} in «{conversation}»: it could not tell which account the turn would bill.', 'VibeSpace held {producer}: it could not tell which account the turn would bill.']),
  'overage-in-use': Object.freeze(['VibeSpace held {producer} in «{conversation}»: {account} is billing paid overage, and turns nobody typed are refused while real money is spent. {next}', 'VibeSpace held {producer}: {account} is billing paid overage, and turns nobody typed are refused while real money is spent. {next}']),
  'ledger-held-elsewhere': Object.freeze(['VibeSpace held {producer} in «{conversation}»: another VibeSpace process on this data folder keeps its record of turns nobody typed, so this one counts none and starts none.', 'VibeSpace held {producer}: another VibeSpace process on this data folder keeps its record of turns nobody typed, so this one counts none and starts none.']),   // B-ef83
  'ledger-lock-unwritable': Object.freeze(['VibeSpace held {producer} in «{conversation}»: it cannot write the lock of its record of turns nobody typed, so it starts none until it can — it asks again by itself.', 'VibeSpace held {producer}: it cannot write the lock of its record of turns nobody typed, so it starts none until it can — it asks again by itself.']),   // B-ef83 r1648
  'ledger-lock-unreadable': Object.freeze(['VibeSpace held {producer} in «{conversation}»: the lock of its record of turns nobody typed is there and cannot be read, so it starts none until it reads — it asks again by itself.', 'VibeSpace held {producer}: the lock of its record of turns nobody typed is there and cannot be read, so it starts none until it reads — it asks again by itself.']),   // r1801 (1)
  'ledger-unreadable': Object.freeze(['VibeSpace held {producer} in «{conversation}»: its record of turns nobody typed could not be read, so it counts none and starts none.', 'VibeSpace held {producer}: its record of turns nobody typed could not be read, so it counts none and starts none.']),   // B-3b0f
  'reading-unread': Object.freeze(["VibeSpace held {producer} in «{conversation}»: {account}'s usage reading cannot be told right now, so whether this turn would bill paid overage is unknown; it goes on by itself once the reading tells.", "VibeSpace held {producer}: {account}'s usage reading cannot be told right now, so whether this turn would bill paid overage is unknown; it goes on by itself once the reading tells."]),   // r3136 / r3285: the account's usage reading cannot be told (its For-you item carries the way out)
  'settings-unread': Object.freeze(['VibeSpace held {producer} in «{conversation}»: its settings could not be read, so the spending limits are not known and it starts none until they read again.', 'VibeSpace held {producer}: its settings could not be read, so the spending limits are not known and it starts none until they read again.']),   // B-225b
  'unknown-reason': Object.freeze(['VibeSpace refused a turn nobody typed in «{conversation}»: «{producer}» is not a declared reason.', 'VibeSpace refused a turn nobody typed: «{producer}» is not a declared reason.']),
  other: Object.freeze(['VibeSpace held {producer} in «{conversation}»: the spend ceiling refused it ({why}).', 'VibeSpace held {producer}: the spend ceiling refused it ({why}).']),
});
/** the instant clause: `key` while the instant is ahead (`{time}` = the viewer's clock), `gone` once it has passed */
const NEXT_WORDS = Object.freeze({
  cap: Object.freeze({ key: 'The next frees at {time}.', gone: 'The next is free now.' }),
  overage: Object.freeze({ key: 'Its overage resets at {time}.', gone: 'Its overage window has reset since.' }),
});
/** the detail's lines (ONE «Spent by» row per producer, at most SPENT_ROWS then «And N more») and the doors */
const LINE_WORDS = Object.freeze({
  held: 'Held: {producer} ({reason})',
  account: 'Account: {account}',
  accountUnknown: 'Account: not known',
  counts: 'Turns nobody typed: {hour} of {hourCap} this hour, {day} of {dayCap} in 24 hours; this instance {instance} of {instanceCap} in 24 hours.',
  countsInstance: 'Turns nobody typed on this instance: {instance} of {instanceCap} in 24 hours.',   // r3: the account unknown — the instance's count still said
  inFlight: 'Also in flight: {n} started and not yet answered — they count against the cap until they settle.',   // r3: «(+N in flight)»
  promised: 'Of these, {n} are messages waiting behind running turns — counted while they wait, given back only if they are known not to have run.',   // lane queued-is-not-woke round 4 (B-0a33: said truly — a frame given up unknown stays counted)
  behind: 'They wait behind {names}.',   // B-0a33 round 1: the conversations they wait behind (at most three)
  behindMore: 'They wait behind {names} and {n} more conversations.',
  overageSeen: 'Paid overage was last reported at {time}.',   // r3: «(last reported N min ago)», as the instant
  spentBy: 'Spent by {producer}: {n}',
  more: 'And {n} more producers.',
  legacy: 'older builds (no reason recorded)',
});
const DOOR_WORDS = Object.freeze({
  spending: 'Turns you type, and the buttons you press that say «starts a turn», are never counted. Change the limits in Settings → Spending.',
  overage: 'Paid overage refuses even the turns you press. Whether turns nobody typed may spend it is Settings → Spending → «Allow unattended turns while an account bills paid overage».',
  usage: 'Sign {account} in again from the Usage window — the limits in Settings → Spending cannot help here.',
  vendor: 'The spend control is set with the account’s vendor — the limits in Settings → Spending cannot help here.',
  waiting: 'Open the conversation they wait behind: they run when its turn ends, or when you stop that turn there. Raising the limits in Settings → Spending would let more turns run meanwhile.',   // B-0a33 round 1
  unset: 'A limit left empty refuses every turn nobody typed until it is set: set a number in Settings → Spending. Turns you type, and the buttons you press that say «starts a turn», are never counted.',   // B-0a33 (3)
  ledger: 'This is VibeSpace failing closed, not a limit: the hub could not read data/spend-budget.json. Turns nobody typed start again within a minute of the file reading again — repair it, or remove it to start the count over. The limits in Settings → Spending cannot help here.',   // B-3b0f
  held: 'This is VibeSpace failing closed, not a limit: another VibeSpace process on this data folder holds data/spend-budget.lock. Turns nobody typed start again once that process ends — stop it, or remove the lock file if no other VibeSpace runs on this folder. The limits in Settings → Spending cannot help here.',   // B-ef83
  lock: 'This is VibeSpace failing closed, not a limit: the hub cannot write data/spend-budget.lock (the data folder refuses it), and no other process keeps the record. Turns nobody typed start again by themselves once the folder takes the lock — free space on it, or give it back its write permission. Turns you type are not affected.',   // B-ef83 r1648
  lockread: 'This is VibeSpace failing closed, not a limit: data/spend-budget.lock is there and the hub cannot read it, and the data folder refuses a new one — it may be another VibeSpace\'s. Turns nobody typed start again by themselves once it reads, or once it is removed and the folder takes a new one. Turns you type are not affected.',   // r1801 (1)
  reading: "This is VibeSpace failing closed, not a limit: the account's usage reading cannot be told. Its own item in For you says the way out (refresh the account's usage, or set its unreadable file aside); your own messages are never held.",   // r3136 / r3285
  settings: 'This is VibeSpace failing closed, not a limit: the hub could not read data/settings.json, so your limits are not known. Nothing was used up: turns nobody typed are judged again against your limits the moment the file reads again. The limits in Settings → Spending cannot help here.',   // B-225b
  wiring: 'This is VibeSpace failing closed, not a limit: the Usage window lists the accounts and the hub log’s [spend] lines name the conversation — the limits in Settings → Spending cannot help here.',
});
// lane setting-doors pick 1 (2026-11-14): a refusal that names a value names where to change it — THE ROW, as its link
// (src/internal-link.js `vibespace://settings/<key>`; the owner's page draws it as a door to that one row)
// PURE, imports nothing: the link's spelling is src/internal-link.js SCHEME (test-setting-links pins the two equal)
const SL = Object.freeze({ settingLink: (key) => `vibespace://settings/${key}` });
const SPEND_ROW_KEYS = Object.freeze({ perIdentityHour: 'spend.unattendedPerIdentityHour', perIdentityDay: 'spend.unattendedPerIdentityDay', perInstanceDay: 'spend.unattendedPerInstanceDay', noticePct: 'spend.budgetNoticePct', allowOverage: 'spend.allowOverageTurns' });
const DOOR_LINK_WORDS = Object.freeze({
  spending: 'Turns you type, and the buttons you press that say «starts a turn», are never counted. Change this limit in Settings → Spending: {link}',
  overage: 'Paid overage refuses even the turns you press. Whether turns nobody typed may spend it is Settings → Spending → «Allow unattended turns while an account bills paid overage»: {link}',
  unset: 'A limit left empty refuses every turn nobody typed until it is set: set a number in this row of Settings → Spending: {link}. Turns you type, and the buttons you press that say «starts a turn», are never counted.',   // lane login-request-card (the links unit's owed row link): the empty row, linked
});
/** PURE. The spending row a verdict names (a ceiling by its cap, overage by its switch), or null. */
function spendRowOf(v) {
  const cap = v && CAP_OF[v.why];
  if (cap) return SPEND_ROW_KEYS[cap[0]];
  return v && v.why === 'overage-in-use' ? SPEND_ROW_KEYS.allowOverage : null;
}
/** PURE. The row a verdict names, as its link (`vibespace://settings/<key>`), or '' — the hand-over toast's words (src/stash-summary.js). */
function spendRowLink(v) { const row = spendRowOf(v); return row ? SL.settingLink(row) : ''; }
/** PURE. The ceiling an 80 % warning is about. */
function warnRowOf(warn) { return warn ? SPEND_ROW_KEYS[warn.scope === 'hour' ? 'perIdentityHour' : warn.scope === 'instance' ? 'perInstanceDay' : 'perIdentityDay'] : null; }
const ROW_DOOR = Object.freeze({ 'hour-cap': 'spending', 'day-cap': 'spending', 'instance-cap': 'spending', 'switched-off': 'spending', 'switched-off-instance': 'spending', 'cap-unset': 'unset', 'cap-unset-instance': 'unset', 'overage-in-use': 'overage', 'identity-cannot-serve': 'usage', 'spend-control-reached': 'vendor', 'identity-unknown': 'wiring', 'ledger-unreadable': 'ledger', 'ledger-held-elsewhere': 'held', 'ledger-lock-unwritable': 'lock', 'ledger-lock-unreadable': 'lockread', 'settings-unread': 'settings', 'reading-unread': 'reading', 'unknown-reason': 'wiring', other: 'wiring' });
const SPENT_ROWS = 6;
const CAP_OF = Object.freeze({ 'hour-cap': ['perIdentityHour', 'hour'], 'day-cap': ['perIdentityDay', 'day'], 'instance-cap': ['perInstanceDay', 'instance'] });
/** a producer as words: a declared reason says its `what` in the viewer's language; a legacy stamp says so */
const producerWords = (r) => (SPEND_REASONS[r] ? { key: SPEND_REASONS[r].what } : r === 'unknown' ? { key: LINE_WORDS.legacy } : String(r || '?'));
/** PURE. Which REFUSAL_WORDS row a refused verdict reads (a cap set to 0 is «switched off», never «used its 0 turns»). */
function refusalRow(v) {
  const capOf = CAP_OF[v && v.why];
  if (capOf && Number((v.limits || {})[capOf[0]]) === 0 && capUnset(v.limits, capOf[0])) return v.why === 'instance-cap' ? 'cap-unset-instance' : 'cap-unset';   // B-0a33 (3): said as itself
  if (capOf) return Number((v.limits || {})[capOf[0]]) === 0 ? (v.why === 'instance-cap' ? 'switched-off-instance' : 'switched-off') : v.why;
  return v && REFUSAL_WORDS[v.why] ? v.why : 'other';
}
function refusalI18n(v, { sessionName = null, behind = null } = {}) {
  if (!v || v.ok) return null;
  const account = (v.identity && (v.identity.name || v.identity.key)) || '';
  const L = v.limits || {};
  const row = refusalRow(v);
  const capOf = CAP_OF[v.why];
  const conversation = sessionName ? String(sessionName).slice(0, 120) : '';
  const producer = row === 'unknown-reason' ? String(v.reason == null ? '?' : v.reason).slice(0, 80) : producerWords(v.reason);
  const at = Number(v.retryAfter) > 0 ? Number(v.retryAfter) : 0;
  const next = at ? { at, ...(row === 'overage-in-use' ? NEXT_WORDS.overage : NEXT_WORDS.cap) } : '';
  const params = {
    producer, account, ...(conversation ? { conversation } : {}), next, why: String(v.why || ''),
    ...(capOf ? { cap: Number(L[capOf[0]]) || 0, scope: capOf[1] } : {}),
    ...(row === 'identity-cannot-serve' ? { state: String(v.credentialState || 'signed out') } : {}),
  };
  const text = { key: REFUSAL_WORDS[row][conversation ? 0 : 1], params };
  const c = v.counts || {};
  const detail = [{ key: LINE_WORDS.held, params: { producer, reason: String(v.reason == null ? '?' : v.reason).slice(0, 80) } }];
  detail.push(account ? { key: LINE_WORDS.account, params: { account } } : { key: LINE_WORDS.accountUnknown });
  if (row === 'settings-unread') { /* B-225b: no count is said against limits that are not known */ }
  else if (row === 'ledger-unreadable' || row === 'ledger-held-elsewhere' || row === 'ledger-lock-unwritable' || row === 'ledger-lock-unreadable') { /* B-3b0f / B-ef83: no count can be said — the ledger they live in could not be read, or another process keeps it */ }
  else if (account && v.counts) detail.push({ key: LINE_WORDS.counts, params: { hour: c.hour || 0, hourCap: Number(L.perIdentityHour) || 0, day: c.day || 0, dayCap: Number(L.perIdentityDay) || 0, instance: c.instanceDay || 0, instanceCap: Number(L.perInstanceDay) || 0 } });
  else if (v.counts) detail.push({ key: LINE_WORDS.countsInstance, params: { instance: c.instanceDay || 0, instanceCap: Number(L.perInstanceDay) || 0 } });   // r3: identity-unknown kept «(instance 7/800)» only in English
  // r3: what the English line says as «(+N in flight)» — the holds a cap sums with the stamps (a cap reached by holds alone
  // read «used its 3 turns» beside «0 of 3»)
  const flying = capOf ? Number((v.inFlight || {})[v.why === 'instance-cap' ? 'instance' : 'identity']) || 0 : 0;
  if (flying > 0) detail.push({ key: LINE_WORDS.inFlight, params: { n: flying } });
  const promisedHere = capOf ? Number(v.why === 'hour-cap' ? c.promisedHour : v.why === 'day-cap' ? c.promisedDay : c.promisedInstanceDay) || 0 : 0;
  if (promisedHere > 0) detail.push({ key: LINE_WORDS.promised, params: { n: promisedHere } });   // round 4: «Spent by» rows count promised turns too — said
  // B-0a33 round 1: WHERE they wait — the conversations (at most three, then «and N more»), and the door that opens the first
  const waits = promisedHere > 0 && Array.isArray(behind) && behind.length ? behind : null;
  if (waits) { const names = waits.slice(0, 3).map((b) => `«${String(b.name || '?').slice(0, 80)}»`).join(', '); detail.push(waits.length > 3 ? { key: LINE_WORDS.behindMore, params: { names, n: waits.length - 3 } } : { key: LINE_WORDS.behind, params: { names } }); }
  if (row === 'overage-in-use' && Number(v.overageSeenAt) > 0) detail.push({ key: LINE_WORDS.overageSeen, params: { time: { at: Number(v.overageSeenAt) } } });
  const by = Object.entries(v.producers || (c.producers && c.producers.hour) || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const spentRow = ([r, n]) => ({ key: LINE_WORDS.spentBy, params: { producer: producerWords(r), n } });
  for (const x of by.slice(0, SPENT_ROWS)) detail.push(spentRow(x));
  // r3: the fold is for the EYE, not the record — «And N more» carries the folded rows (`more`); Copy says every producer
  if (by.length > SPENT_ROWS) detail.push({ key: LINE_WORDS.more, params: { n: by.length - SPENT_ROWS }, more: by.slice(SPENT_ROWS).map(spentRow) });
  const door = waits ? 'waiting' : ROW_DOOR[row];
  const rowKey = spendRowOf(v);   // lane setting-doors pick 1: the row this refusal names, as its link
  detail.push(door === 'usage' ? { key: DOOR_WORDS.usage, params: { account } } : rowKey && DOOR_LINK_WORDS[door] ? { key: DOOR_LINK_WORDS[door], params: { link: SL.settingLink(rowKey) } } : { key: DOOR_WORDS[door] });
  return { text, detail, door };
}

/** PURE. The 80% line. */
function noticeText(warn) {
  if (!warn) return null;
  const who = warn.identity && (warn.identity.name || warn.identity.key) ? (warn.identity.name || warn.identity.key) : 'this account';
  const scope = warn.scope === 'instance' ? 'this instance' : who;
  const window = warn.scope === 'hour' ? 'this hour' : 'today';
  const spentBy = producersText(warn.producers);
  const spent = spentBy ? ` Top producers ${window}: ${spentBy}.` : '';
  // lane setting-doors pick 1: the warning names its row — l2: BEFORE the producers list (the For-you question is stored under a
  // 300-character bound: a long account name and four producers cut a link said last, and it drew as words)
  return `${scope} has used ${warn.used} of its ${warn.limit} unattended turns ${window} (${warn.pct}%) — the limit: ${SL.settingLink(warnRowOf(warn))}.${spent} VibeSpace will refuse further automatic turns on it when the budget is spent.`;
}

/** B-ef83 unit 1 (主开发 r4320 / r4323): THE GATE COULD NOT JUDGE — the refusals that say nothing of a cap, a budget or a wall: the
 *  ledger's lock held by another process (or unwritable / unreadable), the ledger unread, the settings unread. Each hold lifts by its
 *  OWN event (spend-guard onGateFree); a turn refused ONLY for one of these is owed to that lift — asked ONCE when it comes. A cap,
 *  a switch, an overage or an identity refusal is never in this family. */
const HELD_WHYS = Object.freeze(['ledger-lock-unwritable', 'ledger-lock-unreadable', 'ledger-held-elsewhere', 'ledger-unreadable', 'settings-unread']);
const isHeldWhy = (why) => HELD_WHYS.includes(String(why || ''));

module.exports = {
  HELD_WHYS, isHeldWhy,
  SPEND_ROW_KEYS, DOOR_LINK_WORDS, spendRowOf, spendRowLink, warnRowOf,
  authorizeUnattendedBatch, // lane auto-resume-bulk: ONE authorization for N turns (the resume of every wall-stopped session)
  SPEND_REASONS, BUDGET_DEFAULTS, HOUR_MS, DAY_MS, MAX_STAMPS, CAP_MAX, stampCap, OVERAGE_STALE_MS,
  LOAD_RETENTION, RESERVE_TTL_MS, RESERVE_CAP, RESERVATION_WAIT_MAX_MS,
  budgetLimits, capUnset, CAP_SETTING_KEYS, UNHELD_WORDS, unheldI18n, waitingOverCap, emptyBudget, pruneBudget, mergeBudget, countedOf, countLost, spendCounts, stampAt, countAt, waitingStamp, waitingRids, waitingBehind, stampReason, producerCounts, producersText, notePressRow, notePressEnd, pressesOf,
  pendingCounts, reservePending, releasePending, renewPending, expirePending,
  overageState, overageAllowed, overageText, spendControlState,
  authorizeUnattendedSpend, noteUnattendedSpend, returnReservation, reservationState, refusalText, refusalI18n, refusalRow, noticeText,
  REFUSAL_WORDS, NEXT_WORDS, LINE_WORDS, DOOR_WORDS,
};
