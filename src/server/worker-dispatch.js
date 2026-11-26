'use strict';
/**
 * ORCH — DISPATCH A BRIEF TO A WORKER CONVERSATION, COMPACTING IT FIRST
 * (lane worker-dispatch, 2026-10-02; the PURE rules are src/dispatch-model.js).
 *
 *   dispatch({from, fromKind, target:{cid,name}, text, compactFirst, mayWake, consent})
 *     → {ok:true, record, post} | {ok:true, replay:true, record} | {ok:false, code, error}
 *
 * The order, and why each step is where it is:
 *   0. THE LEDGER (verify r1 ②): the brief's key = sha256(sender | worker | text); the groups store's
 *      persisted dispatch ledger says what an earlier attempt of THIS brief did — delivered ⇒ answered
 *      "already delivered" with nothing sent, nothing reserved (a retry after a lost answer or a restart
 *      mid-wait is the coordinator's reflex — it must never cost a second compaction or a second wake);
 *      compacted but never posted ⇒ the compaction is skipped, the brief goes;
 *   1. the verdict WITHOUT the pace / spend facts — a refusal (a job token,
 *      reach, a terminal asked to compact) reserves nothing;
 *   2. THE PACE (`mayWake`, the groups engine's persisted pacer — the SAME one
 *      `send --wake` spends from) and, when the verdict would compact, THE
 *      COMPACTION'S OWN AUTHORIZATION (verify r1 ⑤): `peer-compact`, WITH a
 *      hold, against the same unattended ceiling — a compaction is a model
 *      call nobody typed, so it is counted (noted once the CLI took the
 *      frame; released when the typing path refused it). A refused ceiling
 *      compacts nothing and wakes nobody (the brief rides free);
 *   3. `compact` — THE typing sender writes `/compact` (origin 'dispatch': a
 *      machine turn, src/server/user-input.js, the label naming the dispatcher)
 *      and the hub waits on THE ONE observer (src/server/compaction-watch.js,
 *      notified by the claude stdout consumer's `endCompaction`), bounded by
 *      COMPACT_WAIT_MS — past it the brief goes anyway and the record says
 *      the end was not observed;
 *   4. `wake` — the brief is an ordinary `send --wake` through the groups
 *      engine (`sendToAgent`): the pair group's log, reach re-asked by the
 *      engine, the wake through THE delivery ladder (spendReason
 *      `peer-message`, the ONE billed turn). `stash` posts it without a wake:
 *      it rides the worker's next turn, free. `park` (lane paced-wake-retry —
 *      the PACE said no and named the wait) posts it and leaves the wake to
 *      the retry park: sent when the window ends.
 * One journal line per dispatch (ids, never the brief's words).
 */
const crypto = require('crypto');
const M = require('../dispatch-model.js');
const { awaitCompactionEnd } = require('./compaction-watch.js');
const { addressableId } = require('../claude-lock-capture.js');
const { capsOf } = require('../backend-caps.js');
const { cleanName } = require('../channel-groups.js');
const SA = require('../spend-authorizer.js');   // B-ef83 unit 1: the family «the gate could not judge»
const OWED_COMPACT_MAX_MS = 60 * 60 * 1000;   // r4410 (d): an owed compaction's age — the park's own bound (conversation-deliver RETRY_MAX_MS)

// verify r2 ②: the ledger key is the brief's identity for REPLAY (a lost-answer retry / a restart). The optional
// `attempt` nonce lets a coordinator send the SAME text again ON PURPOSE (`--again`): a fresh nonce ⇒ a distinct key ⇒
// not swallowed as "already delivered"; reusing the nonce ⇒ the same key ⇒ a retry of THAT attempt still replays.
const dispatchKey = (from, to, text, attempt = '') => crypto.createHash('sha256').update(`${from}|${to}|${text}|${attempt}`).digest('hex').slice(0, 32);

function create({ activeSessions, getGroups = () => null, getSendUserInput = () => null, authorizeSpend = null, noteSpend = null, releaseSpend = null, log = () => { }, waitMs = M.COMPACT_WAIT_MS, awaitEnd = awaitCompactionEnd, now = Date.now } = {}) {
  const inFlight = new Set();   // target conversation ids with a dispatch's compaction running (two dispatches never compact twice)
  const owedCompactions = new Map();   // B-ef83 unit 1 (i): ledger key → { from, to, name, why, since, gid, rec } — a compaction the gate could not judge
  // 主开发 r4557: THE OWED SET HAS A BOUND OF ITS OWN (a hold that never lifts in this process kept every held brief's record until
  // the stop). At most ONE record waits a worker — at the lift only one compaction a worker is made (the pace's per-worker floor and
  // `inFlight` end the rest), so a newer brief's record REPLACES an older one for the same worker (the older brief, posted, rides
  // the same woken turn's report) — and a record past its sixty minutes (OWED_COMPACT_MAX_MS) is dropped when another is added.
  // → the set never holds more than one record per worker dispatched to in the last hour
  function owe(key, rec) {
    const at = now();
    for (const [k, o] of [...owedCompactions]) {
      if (k === key) continue;
      if (o.to === rec.to) { owedCompactions.delete(k); log(`[dispatch] ${String(o.from).slice(0, 8)} → ${String(o.to).slice(0, 8)}: an owed compaction is REPLACED by a newer brief's for the same worker (one waits a worker; the older brief rides the same turn)`); }
      else if (at - Number(o.since || 0) > OWED_COMPACT_MAX_MS) { owedCompactions.delete(k); log(`[dispatch] ${String(o.from).slice(0, 8)} → ${String(o.to).slice(0, 8)}: the owed compaction ends — past its bound (${OWED_COMPACT_MAX_MS / 60000} min since the brief), dropped at a later brief's add`); }
    }
    owedCompactions.set(key, rec);
  }
  function liveOf(cid) {
    try { for (const [wid, s] of activeSessions) if (s && addressableId(s) === cid) return { wid, s }; } catch { }
    return { wid: null, s: null };
  }
  /** verify r2 T2 FIRST (owner's rule, a report must not wait for the owner's keystroke): after a successful dispatch set
   *  the DISPATCHER's own notify on the pair group to `always` so the worker's reply WAKES the coordinator. Best-effort
   *  (a failure never fails the dispatch); returns the mode now in effect for `from` (read back — a mutant that skips the
   *  set reads the default `next-turn`, the control). */
  async function armReplyWake(ge, from, groupId) {
    if (!ge || !groupId || typeof ge.setNotify !== 'function') return null;
    try { const r = await ge.setNotify({ by: from, group: groupId, notify: M.DISPATCH_REPLY_NOTIFY }); if (r && r.ok) return M.DISPATCH_REPLY_NOTIFY; }
    catch (e) { log('[dispatch] arming the reply wake failed: ' + (e && e.message)); }
    try { const g = typeof ge.get === 'function' ? ge.get(groupId) : null; const m = g && Array.isArray(g.members) ? g.members.find((x) => x.member === from) : null; return (m && m.notify) || null; } catch { return null; }
  }
  async function dispatch({ from, fromKind = 'session', target = null, text = '', compactFirst = true, mayWake = null, consent = null, again = false, attempt = '' } = {}) {
    const ge = getGroups();
    if (fromKind !== 'session') {
      const v = M.dispatchVerdict({ callerKind: fromKind });
      return { ok: false, code: v.code, error: v.why };
    }
    if (!ge || typeof ge.sendToAgent !== 'function') return { ok: false, code: 'unavailable', error: 'agent groups are not available on this instance' };
    if (!target || !target.cid) return { ok: false, code: 'unreachable', error: M.dispatchVerdict({ callerKind: 'session' }).why };
    const cid = target.cid;
    const t0 = now();
    const ledger = ge.dispatchLedger || null;
    // verify r2 ②: `--again` sends the SAME text on purpose — a fresh nonce (minted here when the caller gave none) makes
    // a distinct ledger key so it is not answered "already delivered"; the nonce rides back so a retry of THIS attempt
    // (its answer lost) can reuse it and still replay. A plain dispatch keeps attempt '' (the r1 ② replay unchanged).
    const nonce = again === true ? (String(attempt || '') || crypto.randomBytes(6).toString('hex')) : '';
    const key = dispatchKey(from, cid, text, nonce);
    const entry = ledger ? ledger.get(key) : null;
    const replay = M.replayVerdict(entry, { now: t0 });
    const { wid, s } = liveOf(cid);
    const facts = M.targetFacts({ live: !!s, mode: s && s.mode, hasPty: !!(s && s.pty), streaming: !!(s && s._isStreaming), streamingKind: s && s._streamingKind, turnState: s && s._turnState, dispatching: inFlight.has(cid), userInputAt: s && s._userInputAt, draftEditAt: s && s._draftEditAt, now: t0 });
    const base = {
      callerKind: 'session',
      senderReach: typeof ge.reach === 'function' ? ge.reach(from, cid) : 'none',
      targetKind: facts.targetKind, targetState: facts.targetState,
      compactFirst: compactFirst === true,
      compactObserved: !!(s && capsOf(s.backend).compactEnd === 'observed'),
      sharedGroup: typeof ge.sharesGroup === 'function' ? ge.sharesGroup(from, cid) === true : false,
      replay,
    };
    const pre = M.dispatchVerdict(base);
    if (!pre.ok) return { ok: false, code: pre.code, error: pre.why };
    const name = target.name || (s && s.name) || null;
    if (pre.steps[0] === 'replay') {
      const ago = Math.max(0, Math.round((t0 - Number(entry.deliveredAt)) / 1000));
      const pair = typeof ge.findPair === 'function' ? ge.findPair(from, cid) : null;
      const reply = await armReplyWake(ge, from, pair && pair.id);   // the earlier attempt armed it; re-arm (idempotent) so an old delivery predating this feature is corrected and the record is accurate
      const record = M.dispatchRecord({ target: { cid, name }, verdict: pre, wake: { woke: false, reason: `delivered ${ago} s ago by the earlier attempt` }, waitMs, reply });
      log(M.journalLine({ from, record }));
      return { ok: true, replay: true, record, attempt: nonce || null };
    }
    // THE PACE — a grant RESERVES the slot; the wake below spends exactly that reservation
    const pace = typeof mayWake === 'function' ? mayWake(cid) : true;
    // THE COMPACTION'S OWN AUTHORIZATION (verify r1 ⑤) — only when the verdict would compact: WITH a hold, reason
    // peer-compact (the same unattended ceiling the wake is charged on). FAIL CLOSED: a throwing authorizer is a refusal.
    let spend = true, charge = null;
    const wouldCompact = pace === true && M.dispatchVerdict({ ...base, pacer: true, spend: true }).steps.includes('compact');
    if (wouldCompact && authorizeSpend) {
      let v = null;
      try { v = authorizeSpend({ reason: 'peer-compact', session: s, cid }); }
      catch (e) { v = { ok: false, why: 'authorizer-failed', detail: 'spend authorizer failed: ' + (e && e.message) }; }
      if (v && v.ok === false) spend = { why: v.why || 'refused', detail: v.detail || v.why || 'refused', ...(SA.isHeldWhy(v.why) ? { held: v.why } : {}) };   // B-ef83 unit 1 (i): the gate could not judge
      else charge = { counted: false, identity: (v && v.identity) || null, hold: (v && v.hold) || null, session: s };
    }
    const verdict = M.dispatchVerdict({ ...base, pacer: pace, spend });
    // r4410 (c): an owed compaction's RECORD stands BEFORE the awaited send — in MEMORY ONLY (主开发 r4473: no owed mark goes to
    // disk) — so a lift during the send finds it (marked lifted, asked once the brief is posted)
    const owedHere = spend !== true && spend && spend.held && compactFirst === true;
    if (owedHere) owe(key, { from, to: cid, name, why: spend.held, since: now(), mayWake: typeof mayWake === 'function' ? mayWake : null, pending: true });
    if (pace === true && verdict.steps[0] === 'stash' && typeof mayWake === 'function' && typeof mayWake.refund === 'function') {
      try { mayWake.refund(cid, { attempted: false }); } catch { }   // the reservation never reached the ladder
    }
    // ── compact + wait ──
    let compaction = null;
    if (verdict.steps.includes('compact')) {
      const sendUserInput = getSendUserInput();
      inFlight.add(cid);
      try {
        if (ledger) { try { ledger.set(key, { from, to: cid, compactAt: now() }); } catch { } }   // handed to the store writer BEFORE the frame (urgent, not awaited — lane lg-store-writes U3): a restart mid-wait remembers the ask once it lands
        const byS = liveOf(from).s;
        const by = { cid: from, name: cleanName((byS && byS.name) || '') || String(from).slice(0, 8) };
        // the facts above were read in THIS tick (no await since): the target is idle, and the typing sender marks
        // it 'compacting' synchronously, so a second dispatch arriving now reads `compacting` and never sends twice
        const sent = typeof sendUserInput === 'function' ? sendUserInput(wid, '/compact', { origin: 'dispatch', by }) : { ok: false, error: 'the typing path is not wired' };
        if (!sent || !sent.ok) {
          compaction = { sent: false, error: (sent && (sent.error || sent.code)) || 'refused' };
          if (charge && charge.hold && releaseSpend) { try { releaseSpend({ hold: charge.hold }); } catch { } }   // no frame left us: the hold goes back
        } else {
          // the CLI took the frame: a model call was made (success or canceled) — COUNTED now, not after the wait
          if (charge) { charge.counted = true; if (noteSpend) { try { noteSpend({ reason: 'peer-compact', identity: charge.identity, session: s, hold: charge.hold }); } catch (e) { log('[dispatch] spend accounting for the compaction failed: ' + (e && e.message)); } } }
          compaction = await awaitEnd(wid, { timeoutMs: waitMs });
        }
      } finally { inFlight.delete(cid); }
    } else if (charge && charge.hold && releaseSpend) { try { releaseSpend({ hold: charge.hold }); } catch { } charge = null; }
    // ── wake (or stash) — the brief, as `send --wake` ──
    // lane paced-wake-retry: `park` posts like a wake — `reserved` answers the same refusal (its wait), and wakeAll parks the wake for the window's end
    const wakeNow = verdict.steps.includes('wake') || verdict.steps.includes('park');
    const reserved = (m) => (m === cid ? pace : (typeof mayWake === 'function' ? mayWake(m) : true));
    reserved.refund = (m, o) => { if (typeof mayWake === 'function' && typeof mayWake.refund === 'function') mayWake.refund(m, o); };
    const noWake = () => ({ reason: verdict.why });
    let post = null;
    try { post = await ge.sendToAgent({ from, to: cid, text, wake: wakeNow, create: true, mayWake: wakeNow ? reserved : noWake, consent }); }
    catch (e) { post = { ok: false, code: 'error', error: 'dispatch send failed: ' + (e && e.message) }; }
    if (!post || !post.ok) {
      if (owedHere) owedCompactions.delete(key);   // nothing posted: nothing owed
      log(`[dispatch] ${String(from).slice(0, 8)} → ${cid.slice(0, 8)}: the brief was NOT posted (${(post && post.error) || 'refused'})${compaction ? ' — after a compaction attempt' : ''}`);
      return { ok: false, code: (post && post.code) || 'error', error: (post && post.error) || 'not posted', candidates: post && post.candidates, compaction };
    }
    if (ledger) { try { ledger.set(key, { from, to: cid, deliveredAt: now() }); } catch { } }   // the brief is in the worker's group: a retry is a replay
    // B-ef83 unit 1 (i), 主开发 r4473: a compaction the gate could not judge is OWED IN MEMORY ONLY — its brief posted (the free ride)
    // and the ledger says «delivered» exactly as the release writes it (a resend is a replay on every road: nothing posted again);
    // the lift of that hold asks the compaction ONCE. A stop during the hold loses it: the brief rides the worker's next turn
    // uncompacted, as at the release
    if (owedHere && owedCompactions.has(key)) {
      const o = owedCompactions.get(key);
      o.gid = post.group && post.group.id ? post.group.id : null; o.rec = post.message || null; o.pending = false;
      if (o.lifted) { owedCompactions.delete(key); askOwedCompaction(key, o).catch((e) => log('[dispatch] the owed compaction failed: ' + (e && e.message))); }   // its hold lifted during the send
    }
    const woke = (post.woke || []).some((w) => w.member === cid);
    const queuedW = (post.queued || []).find((w) => w.member === cid) || null;   // lane queued-is-not-woke: behind its running turn (reserved, billed by that unit)
    const ref = (post.refused || []).find((w) => w.member === cid) || null;
    const reply = post.group && post.group.id ? await armReplyWake(ge, from, post.group.id) : null;   // verify r2 T2 FIRST: the worker's reply wakes the coordinator
    const record = M.dispatchRecord({
      target: { cid, name }, verdict, compaction, charge, waitMs, reply,
      identity: charge && charge.identity ? charge.identity : null,   // the slot the compaction's authorization resolved for this worker — the ladder's wake lands on the same identityOf(session); unknown when nothing was compacted
      wake: { woke, queued: queuedW ? { since: Number.isFinite(queuedW.since) ? queuedW.since : null } : null, paced: ref && ref.parked ? { retryInMs: ref.retryInMs, retryAt: ref.retryAt } : null, reason: woke ? null : queuedW ? 'the worker is in a turn — the brief waits in its queue behind it' : (ref ? ref.reason : (wakeNow ? 'the worker gets it on its next turn' : verdict.why)) },
    });
    log(M.journalLine({ from, record, charge }));
    return { ok: true, record, post, attempt: nonce || null };
  }
  // ── B-ef83 unit 1 (i) (主开发 r4320 / r4323): THE OWED COMPACTION, asked ONCE at the lift of the hold that refused it ──
  // (g) never a wake for words that rode a turn: the worker's report marker passed the brief ⇒ it ends; a worker not live or mid-turn
  // ⇒ it ends (its turn carries the brief). Else the SAME authorization (peer-compact, a hold) — held again ⇒ owed to that hold's lift,
  // a cap ⇒ it ends, said — then the compaction as a dispatch makes it, and the wake by the groups engine's own road (the pace, the
  // caps). Its record is in MEMORY ONLY (主开发 r4473): the ledger said «delivered» at the post, as the release writes it, and the owed
  // road writes nothing to it. A stop during the hold loses the compaction: the brief rides the worker's next turn uncompacted.
  async function askOwedCompaction(key, o) {
    const ge = getGroups();
    let pacer = null, paced = false;
    const giveBack = (how) => { if (paced && pacer && typeof pacer.refund === 'function') { try { pacer.refund(o.to, how); } catch { } } paced = false; };
    const end = (why, how = { attempted: false }) => { giveBack(how); log(`[dispatch] ${String(o.from).slice(0, 8)} → ${String(o.to).slice(0, 8)}: the owed compaction ends — ${why}`); };
    // r4410 (d): AN OWED COMPACTION HAS AN AGE — the park's own bound, counted from the brief (the hold counts): a worker is never
    // compacted and woken days later for a brief of days ago
    if (now() - Number(o.since || 0) > OWED_COMPACT_MAX_MS) return end(`past its bound (${OWED_COMPACT_MAX_MS / 60000} min since the brief) — the brief rides the worker's next turn`);
    const { wid, s } = liveOf(o.to);
    if (!s) return end('the worker is not live (its brief waits in the group)');
    const pair = ge && typeof ge.findPair === 'function' ? ge.findPair(o.from, o.to) : null;
    const m = pair && Array.isArray(pair.members) ? pair.members.find((x) => x && x.member === o.to) : null;
    if (m && o.rec && Number(m.reportedUpTo) >= Number(o.rec.at)) return end('its brief rode a turn already (no wake is made for words that rode one)');
    // r4410 MUST 1, LAW (b) «THE SAME PACE»: asked of the sender's OWN pace exactly as a dispatch asks it — before the target's state and the spend gate (dispatchVerdict's order). A pace
    // that refuses ENDS it (the brief rides the worker's next turn, free — the release's paced refusal), never a retry of ours; a pace
    // that grants is the reservation the wake spends (its stamps written by the grant), given back if nothing is sent
    pacer = typeof o.mayWake === 'function' ? o.mayWake : null;
    const pace = pacer ? pacer(o.to) : true;
    if (pace !== true) return end(`the wake pace said no (${(pace && (pace.rule || pace.reason)) || 'its floor'}) — the brief rides the worker's next turn (free)`);
    paced = !!pacer;
    const facts = M.targetFacts({ live: true, mode: s.mode, hasPty: !!s.pty, streaming: !!s._isStreaming, streamingKind: s._streamingKind, turnState: s._turnState, dispatching: inFlight.has(o.to), userInputAt: s._userInputAt, draftEditAt: s._draftEditAt, now: now() });   // the dispatch's own facts: a worker a person uses is never compacted
    if (facts.targetState !== 'idle') return end(`the worker is ${facts.targetState} — not compacted (its brief rides its next turn, free)`);
    let v = null;
    try { v = authorizeSpend ? authorizeSpend({ reason: 'peer-compact', session: s, cid: o.to }) : { ok: true }; }
    catch (e) { v = { ok: false, why: 'authorizer-failed', detail: 'spend authorizer failed: ' + (e && e.message) }; }
    if (v && v.ok === false) {
      if (SA.isHeldWhy(v.why)) { giveBack({ attempted: false }); owe(key, { ...o, why: v.why }); log(`[dispatch] ${String(o.to).slice(0, 8)}: the owed compaction is held again (${v.why}) — asked once more when that hold lifts`); return; }
      return end(`the spend ceiling refused the compaction (${v.detail || v.why})`);
    }
    const sendUserInput = getSendUserInput();
    inFlight.add(o.to);
    let compaction = null;
    try {
      const byS = liveOf(o.from).s;
      // THE DISPATCH's OWN DOOR (test-reply-door §3, 主开发 r4711): this types the `/compact` frame a dispatch types — the owed
      // compaction of the dispatching sender's brief, on THAT sender's behalf (`by`) — and only after the sender's pace and the spend
      // gate (peer-compact, a hold) answered yes just above; it names its door exactly as the dispatch's own call does
      const by = { cid: o.from, name: cleanName((byS && byS.name) || '') || String(o.from).slice(0, 8) };
      let sent;
      try { sent = typeof sendUserInput === 'function' ? sendUserInput(wid, '/compact', { origin: 'dispatch', by }) : { ok: false, error: 'the typing path is not wired' }; }
      catch (e) { sent = { ok: false, error: 'the typing path threw: ' + ((e && e.message) || e) }; }   // the round's should: its hold and its pace grant go back like any frame that did not leave
      if (!sent || !sent.ok) { compaction = { sent: false }; if (v && v.hold && releaseSpend) { try { releaseSpend({ hold: v.hold }); } catch { } } giveBack({ attempted: false }); }
      else {
        if (noteSpend) { try { noteSpend({ reason: 'peer-compact', identity: v && v.identity, session: s, hold: v && v.hold }); } catch (e) { log('[dispatch] spend accounting for the owed compaction failed: ' + e.message); } }
        compaction = await awaitEnd(wid, { timeoutMs: waitMs });
      }
    } finally { inFlight.delete(o.to); }
    let woke = null;
    if (compaction && compaction.sent !== false && ge && typeof ge.wake === 'function' && o.gid && o.rec) { try { woke = await ge.wake(o.gid, o.to, o.rec, 'dispatch'); } catch (e) { woke = { ok: false, reason: e && e.message }; } }
    if (!(woke && woke.ok)) giveBack({ attempted: true }); else paced = false;   // the grant spent by the wake, or given back
    end(`asked at the lift: ${compaction && compaction.sent === false ? 'the compaction was not sent' : 'compacted'}; ${woke && woke.ok ? 'the worker woken for its brief' : `not woken (${(woke && woke.reason) || 'no wake road'}) — the brief rides its next turn`}`);
  }
  const offGateFree = require('./spend-guard.js').onGateFree(({ whys = [] } = {}) => {   // r4410 (g): its off handle kept for close()
    for (const [key, o] of [...owedCompactions]) {
      if (!whys.includes(o.why)) continue;
      if (o.pending) { o.lifted = true; continue; }   // its brief still on its way: asked once it is posted (r4410 (c))
      owedCompactions.delete(key); askOwedCompaction(key, o).catch((e) => log('[dispatch] the owed compaction failed: ' + (e && e.message)));
    }
  });
  return { dispatch, dispatchKey, close: () => { try { offGateFree(); } catch { } }, _inFlight: inFlight, _owedCompactions: owedCompactions };
}

module.exports = { create, dispatchKey };
