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
 *      it rides the worker's next turn, free.
 * One journal line per dispatch (ids, never the brief's words).
 */
const crypto = require('crypto');
const M = require('../dispatch-model.js');
const { awaitCompactionEnd } = require('./compaction-watch.js');
const { addressableId } = require('../claude-lock-capture.js');
const { capsOf } = require('../backend-caps.js');
const { cleanName } = require('../channel-groups.js');

// verify r2 ②: the ledger key is the brief's identity for REPLAY (a lost-answer retry / a restart). The optional
// `attempt` nonce lets a coordinator send the SAME text again ON PURPOSE (`--again`): a fresh nonce ⇒ a distinct key ⇒
// not swallowed as "already delivered"; reusing the nonce ⇒ the same key ⇒ a retry of THAT attempt still replays.
const dispatchKey = (from, to, text, attempt = '') => crypto.createHash('sha256').update(`${from}|${to}|${text}|${attempt}`).digest('hex').slice(0, 32);

function create({ activeSessions, getGroups = () => null, getSendUserInput = () => null, authorizeSpend = null, noteSpend = null, releaseSpend = null, log = () => { }, waitMs = M.COMPACT_WAIT_MS, awaitEnd = awaitCompactionEnd, now = Date.now } = {}) {
  const inFlight = new Set();   // target conversation ids with a dispatch's compaction running (two dispatches never compact twice)
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
      if (v && v.ok === false) spend = { why: v.why || 'refused', detail: v.detail || v.why || 'refused' };
      else charge = { counted: false, identity: (v && v.identity) || null, hold: (v && v.hold) || null, session: s };
    }
    const verdict = M.dispatchVerdict({ ...base, pacer: pace, spend });
    if (pace === true && verdict.steps[0] === 'stash' && typeof mayWake === 'function' && typeof mayWake.refund === 'function') {
      try { mayWake.refund(cid, { attempted: false }); } catch { }   // the reservation never reached the ladder
    }
    // ── compact + wait ──
    let compaction = null;
    if (verdict.steps.includes('compact')) {
      const sendUserInput = getSendUserInput();
      inFlight.add(cid);
      try {
        if (ledger) { try { ledger.set(key, { from, to: cid, compactAt: now() }); } catch { } }   // persisted BEFORE the frame: a restart mid-wait remembers the ask
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
    const wakeNow = verdict.steps.includes('wake');
    const reserved = (m) => (m === cid ? pace : (typeof mayWake === 'function' ? mayWake(m) : true));
    reserved.refund = (m, o) => { if (typeof mayWake === 'function' && typeof mayWake.refund === 'function') mayWake.refund(m, o); };
    const noWake = () => ({ reason: verdict.why });
    let post = null;
    try { post = await ge.sendToAgent({ from, to: cid, text, wake: wakeNow, create: true, mayWake: wakeNow ? reserved : noWake, consent }); }
    catch (e) { post = { ok: false, code: 'error', error: 'dispatch send failed: ' + (e && e.message) }; }
    if (!post || !post.ok) {
      log(`[dispatch] ${String(from).slice(0, 8)} → ${cid.slice(0, 8)}: the brief was NOT posted (${(post && post.error) || 'refused'})${compaction ? ' — after a compaction attempt' : ''}`);
      return { ok: false, code: (post && post.code) || 'error', error: (post && post.error) || 'not posted', candidates: post && post.candidates, compaction };
    }
    if (ledger) { try { ledger.set(key, { from, to: cid, deliveredAt: now() }); } catch { } }   // the brief is in the worker's group: a retry is a replay
    const woke = (post.woke || []).some((w) => w.member === cid);
    const ref = (post.refused || []).find((w) => w.member === cid) || null;
    const reply = post.group && post.group.id ? await armReplyWake(ge, from, post.group.id) : null;   // verify r2 T2 FIRST: the worker's reply wakes the coordinator
    const record = M.dispatchRecord({
      target: { cid, name }, verdict, compaction, charge, waitMs, reply,
      identity: charge && charge.identity ? charge.identity : null,   // the slot the compaction's authorization resolved for this worker — the ladder's wake lands on the same identityOf(session); unknown when nothing was compacted
      wake: { woke, reason: woke ? null : (ref ? ref.reason : (wakeNow ? 'the worker gets it on its next turn' : verdict.why)) },
    });
    log(M.journalLine({ from, record, charge }));
    return { ok: true, record, post, attempt: nonce || null };
  }
  return { dispatch, dispatchKey, _inFlight: inFlight };
}

module.exports = { create, dispatchKey };
