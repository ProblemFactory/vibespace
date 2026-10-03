'use strict';
/**
 * PURE (imports nothing; CJS so the server and a suite share it) — DISPATCH A
 * BRIEF TO A WORKER CONVERSATION, COMPACTING IT FIRST (lane worker-dispatch,
 * owner 2026-10-02: "你得及时让他们compact，不然容易积累太多历史context浪费token").
 *
 * A coordinator agent hands a long-lived WORKER conversation its next brief
 * with ONE verb: `vibespace-msg dispatch <agent>` (= `send --wake
 * --compact-first`). The worker is compacted first — an agent cannot run
 * another session's /compact, so without this every brief pays for the whole
 * history of the briefs before it — and the brief is the wake that follows
 * the compaction's end (or a bounded wait).
 *
 *   dispatchVerdict(facts) → {ok, steps, compact, code?, skip?, why}
 *     steps  ['compact','wait','wake'] — compact, wait for its end, wake with the brief
 *            ['wake']                  — the brief alone, as `send --wake` (no compaction, and `why` says so)
 *            ['stash']                 — no wake: the brief rides the worker's NEXT turn (the pacer or
 *                                        the spend ceiling said no — a compaction is never paid for then)
 *            ['replay']                — NOTHING: this very brief already reached this worker (a retry
 *                                        after a lost answer / a restart) — never a second compaction, never a second wake
 *     The compact step needs ALL of: a SESSION caller (never a jbt_ job), reach
 *     `messageable`, a live CHAT target (a terminal is refused by name when a
 *     compaction was asked for), a harness whose stream SAYS when a compaction
 *     ends (caps `compactEnd`), a TASK GROUP the dispatcher and the worker BOTH
 *     belong to (verify r1 ④: an owner-opened reach lets an agent message, not
 *     wipe, another conversation's context), an IDLE target (never mid-turn,
 *     never already compacting, never an unknown state), a worker whose OWNER
 *     has neither sent input NOR edited its draft for USER_QUIET_MS (verify r1 ①
 *     + r2 ①: a conversation a person is using — or is composing an unsent reply
 *     in — is never compacted by an agent; `max(_userInputAt, _draftEditAt)` is
 *     the fence, so a draft in flight counts though no send has happened), no earlier
 *     attempt of this same brief that already asked for the compaction (verify
 *     r1 ②), and a granted pace + spend.
 *   dispatchRecord(…) → what the sender is told: {target, compacted:
 *     true|false|'unknown'|'skipped', compactionCounted, why, wake:{billed, identity, delivered, reason?}}.
 *   targetFacts(session-ish) → {targetKind, targetState} from plain fields.
 *   replayVerdict(ledgerEntry, {now}) → null | 'delivered' | 'compacted' — what an earlier attempt of the
 *     SAME brief (the same sender, worker and text) already did, read off the persisted dispatch ledger.
 *
 * MONEY (verify r1 ⑤): a compaction is a model call nobody typed, so it is
 * COUNTED — the hub authorizes it WITH a hold (reason `peer-compact`, the same
 * unattended ceiling) BEFORE typing `/compact`, and notes it once the CLI took
 * the frame (success or canceled: the call was made). The brief's wake is the
 * ladder's own billed turn (reason `peer-message`), exactly as `send --wake`.
 * So a dispatch that compacts is TWO counted acts; a refused ceiling before
 * the compaction compacts nothing and wakes nobody (the brief rides free).
 */

/** A compaction of a large conversation takes 1–2 minutes (the 2.365.0
 *  measurement: 174 751 ms on a 997 587-token auto-compaction). Past this the
 *  brief is delivered anyway — it queues behind the compaction — and the
 *  record says its end was NOT OBSERVED (verify r1 ③: "unknown", never "did
 *  not finish" — an old CLI / a wrapper restarted mid-compaction emits no end
 *  record while the compaction may well have finished). */
const COMPACT_WAIT_MS = 180 * 1000;
/** The owner's last input into the worker must be older than this before an
 *  agent may compact it (verify r1 ①). */
const USER_QUIET_MS = 10 * 60 * 1000;
/** A retry of the SAME brief inside this window after it was delivered is answered "already delivered" (the
 *  identical-text floor's window); inside REPLAY_COMPACT_MS after an attempt that typed `/compact` but never
 *  posted (the server restarted mid-wait) the retry skips the compaction and posts the brief. */
const REPLAY_DELIVERED_MS = 10 * 60 * 1000;
const REPLAY_COMPACT_MS = 2 * COMPACT_WAIT_MS;

const CALLER_KINDS = Object.freeze(['session', 'job']);
const REACH_LEVELS = Object.freeze(['messageable', 'visible', 'none']);
const TARGET_KINDS = Object.freeze(['chat', 'terminal', 'gone']);
const TARGET_STATES = Object.freeze(['idle', 'busy', 'compacting', 'user-active', 'unknown']);
const REPLAYS = Object.freeze([null, 'delivered', 'compacted']);
const NOTIFY_SET = new Set(['next-turn', 'mention', 'always', 'mute']);
const STEPS = Object.freeze({
  compactFirst: Object.freeze(['compact', 'wait', 'wake']),
  wake: Object.freeze(['wake']),
  stash: Object.freeze(['stash']),
  replay: Object.freeze(['replay']),
});
/** Why a compaction was skipped — a closed set, each with its sentence. */
const SKIPS = Object.freeze({
  'not-asked': 'no compaction was asked for (--compact-first not given)',
  harness: "this agent's harness does not say when a compaction ends — the brief was sent without one",
  'not-shared': "the worker is reachable through a reach the owner opened, not through a Task Group you both belong to — an agent compacts only a worker its own Task Group lists; the brief was sent without a compaction",
  'mid-turn': 'the worker is in the middle of a turn — the brief is queued behind it WITHOUT a compaction (compacting a running turn would cancel or race it)',
  compacting: 'the worker is already compacting — the brief is queued behind that compaction',
  'user-active': `the worker's owner sent input OR edited its draft within the last ${USER_QUIET_MS / 60000} min — a conversation a person is using (or composing a reply in) is never compacted by an agent; the brief was sent without a compaction`,
  'unknown-state': "the worker's turn state is not known — never compacted on a guess; the brief was sent without one",
  'retry-compacted': 'an earlier attempt of this same brief already asked the worker to compact (its answer was lost) — not compacted again; the brief was delivered',
  replay: 'this same brief already reached this worker (an earlier attempt whose answer was lost) — nothing re-sent, nothing re-compacted, nobody woken',
  paced: 'the wake pace said no',
  spend: 'the spend ceiling said no',
});

const reasonOf = (v, dflt) => (v && typeof v === 'object' && (v.reason || v.why || v.detail)) ? String(v.reason || v.detail || v.why) : dflt;

/** THE REPLY MODE a dispatch leaves on the pair group for the DISPATCHER (verify r2 T2 FIRST / r1 ⑦, owner's rule: a
 *  report that waits for the owner's keystroke is the daily failure this lane ends): after a successful dispatch the hub
 *  sets the dispatcher's own notify on the pair group to `always`, so the worker's reply WAKES the coordinator instead of
 *  waiting to be read. The record says it in these words; a mutant that forgets the setNotify leaves the default and the
 *  record reads `next-turn` (the control). */
const DISPATCH_REPLY_NOTIFY = 'always';
function replyWords(notify) {
  if (notify === 'always') return 'wakes you (always)';
  if (notify === 'mention') return 'reaches you when it @mentions you';
  if (notify === 'mute') return 'is muted — you set it so; you will not be woken';
  return 'reaches you on your next turn (not woken)';
}

/** The target's two facts from plain session fields (never the session object itself — PURE).
 *  `live` false ⇒ gone; a non-chat mode ⇒ terminal; a chat with no pty is not live. `userInputAt` = the owner's last
 *  input into the worker (ws keystrokes / chat-input): within USER_QUIET_MS of `now` an idle worker is `user-active`. */
function targetFacts({ live = false, mode = null, hasPty = false, streaming = false, streamingKind = null, turnState = null, dispatching = false, userInputAt = null, draftEditAt = null, now = null } = {}) {
  if (!live) return { targetKind: 'gone', targetState: 'unknown' };
  if (mode !== 'chat') return { targetKind: 'terminal', targetState: 'unknown' };
  if (!hasPty) return { targetKind: 'gone', targetState: 'unknown' };
  if (streamingKind === 'compacting' || dispatching) return { targetKind: 'chat', targetState: 'compacting' };
  if (streaming) return { targetKind: 'chat', targetState: 'busy' };
  if (turnState === 'running' || turnState === 'requires_action') return { targetKind: 'chat', targetState: 'busy' };
  if (turnState != null && turnState !== 'idle') return { targetKind: 'chat', targetState: 'unknown' };
  // verify r2 ①: a person is "using" the worker if they SENT input OR are COMPOSING a draft within the quiet window —
  // a draft in flight is not a send, so _userInputAt alone misses the owner typing a reply right now.
  const a = Number(userInputAt), d = Number(draftEditAt), n = Number(now);
  const last = Math.max(Number.isFinite(a) && a > 0 ? a : 0, Number.isFinite(d) && d > 0 ? d : 0);
  if (last > 0 && Number.isFinite(n) && n - last < USER_QUIET_MS) return { targetKind: 'chat', targetState: 'user-active' };
  return { targetKind: 'chat', targetState: 'idle' };
}

/** What an earlier attempt of the SAME brief did (the persisted ledger's entry for its key), at `now`. */
function replayVerdict(entry, { now = 0 } = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const d = Number(entry.deliveredAt), c = Number(entry.compactAt);
  if (Number.isFinite(d) && d > 0 && now - d < REPLAY_DELIVERED_MS) return 'delivered';
  if (Number.isFinite(c) && c > 0 && now - c < REPLAY_COMPACT_MS) return 'compacted';
  return null;
}

/**
 * THE VERDICT. Inputs are facts the hub read (never a session object):
 *   callerKind       'session' | 'job'
 *   senderReach      msg-acl's level of the target as seen from the sender
 *   targetKind       'chat' | 'terminal' | 'gone'
 *   targetState      'idle' | 'busy' | 'compacting' | 'user-active' | 'unknown'
 *   compactFirst     the sender asked for the compaction
 *   compactObserved  the target harness's stream says when a compaction ends (caps row `compactEnd`)
 *   sharedGroup      the dispatcher and the worker belong to one Task Group (verify r1 ④; default false — fail closed)
 *   replay           null | 'delivered' | 'compacted' — what an earlier attempt of this same brief did (verify r1 ②)
 *   pacer            true | {reason} — the wake pace (asked AFTER a refusal is ruled out: a grant reserves)
 *   spend            true | {why, detail} — the compaction's own authorization (reason peer-compact, held)
 */
function dispatchVerdict({ callerKind = null, senderReach = 'none', targetKind = 'gone', targetState = 'unknown', compactFirst = false, compactObserved = false, sharedGroup = false, replay = null, pacer = true, spend = true } = {}) {
  if (callerKind !== 'session') {
    return { ok: false, code: 'job-token', steps: [], compact: 'skipped', why: 'a dispatch is a conversation\'s verb — a Background Work job never dispatches (it cannot judge a worker idle, and a job never compacts a conversation); run it from the conversation that owns the job' };
  }
  if (senderReach !== 'messageable' || targetKind === 'gone') {
    return { ok: false, code: 'unreachable', steps: [], compact: 'skipped', why: 'no agent session by that name or id you can message (not found, not live, or outside your reach — vibespace-msg list shows it)' };
  }
  if (compactFirst === true && targetKind === 'terminal') {
    return { ok: false, code: 'not-chat', steps: [], compact: 'skipped', why: 'that agent runs in a terminal session — an agent cannot compact it (only a chat session\'s compaction can be sent and observed); nothing was sent. Send the brief without the compaction: vibespace-msg send <agent> --wake "…"' };
  }
  const skip = (code, steps, extra) => ({ ok: true, steps, compact: 'skipped', skip: code, why: extra ? `${SKIPS[code]}: ${extra}` : SKIPS[code] });
  // verify r1 ②: the same brief already reached this worker — before the pace (nothing is reserved, nothing is sent)
  if (replay === 'delivered') return skip('replay', STEPS.replay);
  // a refused wake never pays for a compaction: the brief rides the worker's next turn, free
  if (pacer !== true) return skip('paced', STEPS.stash, `${reasonOf(pacer, 'rate floor')} — the brief rides the worker's next turn (free), not compacted`);
  if (spend !== true) return skip('spend', STEPS.stash, `${reasonOf(spend, 'refused')} — the brief rides the worker's next turn (free), not compacted`);
  if (compactFirst !== true) return skip('not-asked', STEPS.wake);
  if (targetKind !== 'chat') return skip('harness', STEPS.wake);
  if (compactObserved !== true) return skip('harness', STEPS.wake);
  if (replay === 'compacted') return skip('retry-compacted', STEPS.wake);
  if (sharedGroup !== true) return skip('not-shared', STEPS.wake);
  if (targetState === 'busy') return skip('mid-turn', STEPS.wake);
  if (targetState === 'compacting') return skip('compacting', STEPS.wake);
  if (targetState === 'user-active') return skip('user-active', STEPS.wake);
  if (targetState !== 'idle') return skip('unknown-state', STEPS.wake);
  return { ok: true, steps: STEPS.compactFirst, compact: 'first', why: 'the worker is idle — compacted first, then woken with the brief' };
}

/**
 * What the sender is told.
 *   verdict     dispatchVerdict's answer (ok)
 *   compaction  null (not attempted) | {sent:false, error} | {ended:true, result, error?, waitedMs}
 *               | {ended:false, timedOut:true, waitedMs}
 *   charge      null | {counted:boolean, identity} — the compaction's own count against the unattended ceiling
 *   wake        {woke:boolean, nextTurn?:boolean, reason?:string, refused?:string|null}
 *   identity    the slot the wake was authorized on ({key, name}) — named only when the wake billed
 */
function dispatchRecord({ target = null, verdict = null, compaction = null, charge = null, wake = null, identity = null, waitMs = COMPACT_WAIT_MS, reply = null } = {}) {
  const t = target ? { cid: target.cid || null, name: target.name || null } : null;
  let compacted = 'skipped';
  let why = (verdict && verdict.why) || '';
  const steps = (verdict && verdict.steps) || [];
  if (steps.includes('compact')) {
    if (!compaction || compaction.sent === false) {
      compacted = false;
      why = `the compaction was not started (${(compaction && compaction.error) || 'no answer'}) — the brief was delivered anyway`;
    } else if (compaction.ended !== true) {
      compacted = 'unknown';
      why = `no end of the compaction was observed within ${(waitMs / 1000).toFixed(waitMs < 10000 ? 1 : 0)} s — it may have finished, or still be running (an old CLI or a restarted wrapper emits no end record); the brief was delivered anyway (it waits behind the compaction)`;
    } else if (compaction.result === 'success') {
      compacted = true;
      why = 'compacted, then the brief was delivered';
    } else if (compaction.error) {
      compacted = false;
      why = `compaction failed (${String(compaction.error).slice(0, 200)}) — the brief was delivered anyway`;
    } else {
      compacted = false;
      why = 'the compaction ended without the CLI reporting success (canceled, or blocked by a hook) — the brief was delivered anyway';
    }
  }
  const replay = steps.includes('replay');
  const woke = !!(wake && wake.woke);
  const delivered = replay ? 'already' : woke ? 'woken' : 'next-turn';
  const w = { billed: woke, identity: woke && identity && identity.key ? { key: String(identity.key), name: String(identity.name || identity.key) } : null, delivered };
  if (!woke && wake && wake.reason) w.reason = String(wake.reason);
  const replyMode = NOTIFY_SET.has(reply) ? reply : null;
  const out = { target: t, compacted, compactionCounted: !!(charge && charge.counted), why, wake: w };
  if (replyMode) out.reply = { notify: replyMode, words: replyWords(replyMode) };   // verify r2: how the worker's reply reaches the dispatcher
  return out;
}

/** The ONE journal line per dispatch (ids cut to 8, never the brief's words). */
function journalLine({ from = '', record = null, charge = null } = {}) {
  const r = record || {};
  const to = (r.target && r.target.cid) || '';
  const w = r.wake || {};
  const counted = r.compactionCounted ? ` (compaction counted${charge && charge.identity && charge.identity.name ? ' on ' + charge.identity.name : ''})` : '';
  return `[dispatch] ${String(from).slice(0, 8)} → ${String(to).slice(0, 8)}: compacted=${r.compacted}${counted} wake=${w.delivered || '?'}${w.billed ? ' (billed' + (w.identity ? ' on ' + w.identity.name : '') + ')' : ''} — ${r.why || ''}`;
}

module.exports = {
  COMPACT_WAIT_MS, USER_QUIET_MS, REPLAY_DELIVERED_MS, REPLAY_COMPACT_MS, CALLER_KINDS, REACH_LEVELS, TARGET_KINDS, TARGET_STATES, REPLAYS, STEPS, SKIPS,
  DISPATCH_REPLY_NOTIFY, replyWords,
  targetFacts, replayVerdict, dispatchVerdict, dispatchRecord, journalLine,
};
