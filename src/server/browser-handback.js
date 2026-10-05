'use strict';
/**
 * THE HANDBACK ANNOUNCER — ORCH (docs/design-agent-browser-v2.md §4.3.1, P3).
 *
 * "Announced into the conversation" is A TURN NOBODY TYPED, so this module is
 * the ONE producer of that turn and it goes through the ONE delivery ladder
 * (`deliverToConversation`, src/server/conversation-deliver.js) under the ONE
 * declared reason `browser-handback` (src/spend-authorizer.js SPEND_REASONS).
 * The ladder authorizes the spend before its rungs and settles it at its
 * single `finally`; this file never re-implements a rung, a stash, a card or
 * a settlement — a browser module that did would be a twin by construction.
 * scripts/test-spend-paths.mjs's per-site census lists this file's ONE call
 * under (file, 'deliver-ladder') with the reason it forwards to the gate.
 *
 * THE THREE MOMENTS (the design's table), decided by PURE
 * `browser-takeover.announceVerdict`:
 *   · take over        — nothing is DELIVERED (no turn is billed). THE OWNER'S
 *                        RULING (2026-09-27, verbatim: "关于接管浏览器的时候agent脚本，
 *                        其实应该直接打断所有脚本和agent操作，告知agent发生了打断，
 *                        交还时提醒它重新运行"): the keeper has already interrupted
 *                        what was in flight (the mediator's `browser_interrupted`),
 *                        and this module TELLS: ONE conversation card per takeover
 *                        → handback cycle ("…; N operations were interrupted: …" —
 *                        the ladder's card path, `emitPeerCard`, display only) and
 *                        the zero-spend `browser-takeover` notice the agent reads at
 *                        its next turn; a command it was running ends with
 *                        `browser_interrupted` (the CLI's audit), the next ones are
 *                        refused `browser_paused` — free;
 *   · explicit handback — DELIVERED through the ladder, `kind:'notification'`
 *                        (verify r7: a handback MIRRORED to a sibling conversation
 *                        — taken WITH the primary, the user never on its view — is
 *                        delivered only when ITS cycle has something to re-run;
 *                        else the zero-spend notice rides its next turn)
 *                        (VibeSpace is speaking, nobody waits for a reply — on
 *                        a codex turn in flight that is the steer lane), with
 *                        the CURRENT URL so the agent re-orients and — the
 *                        owner's ruling — "Re-run what was interrupted: …" when
 *                        the cycle interrupted or refused anything (ONE reminder
 *                        per cycle; none when nothing was);
 *   · idle / viewer-left — NOTHING by default (zero-spend): the lease flips,
 *                        the live view and the card update, ONE "For you" item
 *                        says the takeover lapsed (idle only), the zero-spend
 *                        `browser-handback` notice rides the user's own next
 *                        message; setting `browser.announceIdleHandback`
 *                        (default OFF) routes it through the same reason and
 *                        the same ceiling.
 * A REFUSAL LOSES NOTHING: a refused or failed delivery is stashed on the
 * ladder's own stash (the words ride the next injection); only when the stash
 * cannot take it is the zero-spend notice queued instead — ONE carrier per
 * takeover → handback cycle (the owner's ruling, 2026-09-27: the re-run
 * reminder is said once; stash + notice both rode the same next prompt and the
 * agent read the handback twice). The lease flip already happened regardless.
 * Every outcome is journalled with its cause.
 *
 * WINDOW TARGETS (P9b, design §4.9 / §6.6): a window's handback is the same
 * moment under the same reason — `installWindow(engine)` hangs on the
 * window-targets engine's `onInput` seam and `announce` takes the event's
 * `target:'window'` + `label` + `handle` into the SAME text/notice/inbox
 * functions (the PURE noun switch in browser-takeover.js). ONE announcer,
 * ONE billed site, ONE reason — a second module for windows would be a twin
 * of this one and a second row in the spend census.
 *
 * STALE APPROVALS (lane J r2, the 2026-09-25 naive-user study's S8-36): the
 * take-over moment and the handback moment each sweep the conversation's
 * PENDING approval cards — a card for a browser page command aimed at the
 * browser the user took (PURE `browserApprovalVerdict`, the CLI's own verb
 * table) is answered through THE one permission answer
 * (src/server/permission-answer.js, the `approvals` seam) with a deny that
 * names browser_paused (`staleDenyText`), and the card is marked
 * `staleBy:{code, moment, at}` so it says why. At the takeover: the cards
 * queued before it (planned on a page the user is about to change); at the
 * handback: the cards queued while the user drove (the agent was told to
 * wait; one it queued anyway was planned blind). A deny opens no turn — it
 * answers a question asked inside a turn somebody started — so this adds no
 * spend site. A window target (P9b) is not swept: its commands are
 * `vibespace-window`, and nothing queued there acts on a page.
 */
const T = require('../browser-takeover.js');
const INT = require('../browser-interrupt.js'); // lane browser-admin 2a: the relaunch's words (Change build…)
const { addressableId } = require('../claude-lock-capture.js');   // verify r6 (lane channel-withdraw): the ONE own-id predicate
const VERBS = require('../browser-verbs.js'); // the CLI's own verb table: a pending `vibespace-browser status` is never stale, `click` is
const WIN = require('../browser-windows.js'); // lane browser-windows verify r5 ②: the drive-ended notice's record + words

const FROM_NAME = 'VibeSpace browser';

function create({ keeper = null, deliver = null, serverSetting = () => undefined, userTodos = null, activeSessions = null,
  sessionKeyFor = null, notice = null, onLiveFactsChanged = null, log = console,
  // the owner's ruling (2026-09-27): the takeover's card goes to the LIVE session's chat (normalizers.feedPeerCard — the
  // auto-resume notice's own path: display only, no rung); absent ⇒ the ladder's card path by conversation id
  emitCard = null,
  // lane J r2: the stale sweep's seam — {pending(session) → [{requestId, toolName, input, kind}], answer(sessionId, session, data) → {ok}, note(session, requestId, staleBy)}
  approvals = null } = {}) {
  const setting = (k, d) => { try { const v = serverSetting(k); return v === undefined || v === null || v === '' ? d : v; } catch { return d; } };
  const announceIdle = () => { const v = setting('browser.announceIdleHandback', false); return v === true || v === 'true' || v === 'yes'; };

  /** The live session carrying this browser key (its id + record). */
  function sessionFor(sessionId, browserKey) {
    if (sessionId && activeSessions?.get) { const s = activeSessions.get(sessionId); if (s) return { id: sessionId, s }; }
    if (activeSessions) for (const [id, s] of activeSessions) if (s && s._browserKey === browserKey) return { id, s };
    return null;
  }
  const labelOf = (profileId) => { if (!profileId || !keeper) return null; try { return keeper.profile(profileId)?.label || profileId; } catch { return profileId; } };
  const isWindow = (ev) => !!ev && ev.target === 'window';
  // verify r6 (lane channel-withdraw): the session's OWN conversation id — a pending fork carries its parent's, and a
  // handback delivered by that id would open a billed turn on the PARENT (the notice rides the fork's next message instead)
  const conversationIdOf = (s) => addressableId(s);

  /** THE ONE BILLED SITE of this module — through the gated ladder, under the declared reason (§4.3.1). `noWake` (lane
   *  browser-propose: an approved switch is TOLD, never a wake) = deliver only where it costs nothing — a notification
   *  steered into a turn already running — else the ladder refuses `no-wake` and the caller stashes for the next turn. */
  function viaLadder(cid, text, { noWake = false } = {}) {
    return deliver.deliverToConversation(cid, text, { kind: 'notification', spendReason: 'browser-handback', fromName: FROM_NAME, cardText: text, ...(noWake ? { noWake: true } : {}) }); // the LITERAL is what the census reads; it equals T.SPEND_REASON (pinned by the suite)
  }
  function queueNotice(sess, n) {
    if (!notice || !sess) return false;
    try { notice(sess.id, sess.s, n); return true; } catch (e) { log.warn?.(`[browser] handback notice not queued — ${e && e.message}`); return false; }
  }
  function fileInbox(sess, item) {
    if (!userTodos || !sessionKeyFor || !sess) return false;
    try {
      const key = sessionKeyFor(sess.s, sess.id);
      if (!key) return false;
      userTodos.add(key, { ...item, by: 'agent', origin: 'browser', sessionName: sess.s.name || sess.s.webuiName || null });
      return true;
    } catch (e) { log.warn?.(`[browser] handback inbox item not filed — ${e && e.message}`); return false; }
  }

  /**
   * One handback → at most one delivery. `ev` is the keeper's `onInput` event
   * (`kind:'handback'`, cause, url, heldMs, profileId, browserKey, sessionId).
   * Returns what happened, for the journal and the suite.
   */
  async function announce(ev) {
    const cause = ev.cause || 'explicit';
    const win = isWindow(ev);
    const sess = sessionFor(ev.sessionId, ev.browserKey);
    const label = win ? (ev.label || ev.handle || null) : labelOf(ev.profileId);
    const idleMs = keeper && typeof keeper.takeoverIdleMs === 'function' ? keeper.takeoverIdleMs() : T.DEFAULT_TAKEOVER_IDLE_MS;
    // the owner's ruling (2026-09-27): the cycle's re-run list (the keeper closed it at this handback) rides every word below
    const rerun = !win && Array.isArray(ev.rerun) ? ev.rerun.map(String).filter(Boolean) : [];
    const userActs = !win && Array.isArray(ev.userActs) ? ev.userActs : []; // lane browser-resume C: the user's tab acts while he drove — said in the same words, never a delivery of their own
    const args = { cause, label, url: ev.url || '', heldMs: ev.heldMs || 0, idleMs, ...(win ? { target: 'window', handle: ev.handle || null } : {}), ...(rerun.length ? { rerun } : {}), ...(userActs.length ? { userActs } : {}), ...(!win && ev.sharedWindow === true ? { shared: true } : {}) }; // verify r2 ⑦: the keeper says whether it was the shared window
    const verdict = T.announceVerdict({ cause, announceIdle: announceIdle(), sibling: !win && !!ev.sibling, rerun }); // verify r7: a sibling's handback with nothing to re-run is zero-spend
    const out = { cause, target: win ? 'window' : 'browser', sessionId: sess ? sess.id : null, verdict, delivered: false, stashed: false, noticed: false, inbox: false, why: null };
    if (!sess) { out.why = win ? 'no live session holds this window' : 'no live session carries this browser key'; log.log?.(`[browser] handback (${cause}) for ${win ? ev.handle : ev.browserKey}: ${out.why}`); return out; }
    out.rerun = rerun;
    if (cause === 'idle') out.inbox = fileInbox(sess, T.idleInboxItem({ label, idleMs, url: ev.url || '', sessionName: sess.s.name || '', ...(win ? { target: 'window' } : { rerun }) }));
    if (!verdict.deliver) {
      out.noticed = queueNotice(sess, T.handbackNotice({ ...args, at: Date.now() }));
      out.why = verdict.why;
      log.log?.(`[browser] handback (${cause}) for ${sess.id}: not delivered — ${verdict.why}${out.noticed ? '; the notice rides the next message' : ''}${out.inbox ? '; one inbox item filed' : ''}`);
      return out;
    }
    const text = T.handbackText(args);
    const cid = conversationIdOf(sess.s);
    if (!cid || !deliver || typeof deliver.deliverToConversation !== 'function') {
      out.noticed = queueNotice(sess, T.handbackNotice({ ...args, at: Date.now() }));
      out.why = !cid ? 'the conversation has no id yet (nothing to deliver into)' : 'the delivery ladder is not wired';
      log.log?.(`[browser] handback (${cause}) for ${sess.id}: ${out.why} — the notice rides the next message`);
      return out;
    }
    let r = null;
    try { r = await viaLadder(cid, text); } catch (e) { r = { ok: false, reason: 'delivery threw: ' + (e && e.message) }; }
    if (r && r.ok) {
      out.delivered = true;
      log.log?.(`[browser] handback (${cause}) for ${sess.id}: announced into the conversation (${r.via || r.mode || 'delivered'})`);
      return out;
    }
    // A refusal loses nothing: the ladder's own stash carries the words to the
    // next injection, and the zero-spend notice rides the next message too.
    out.why = (r && r.reason) || 'delivery refused';
    try { if (typeof deliver.stashFor === 'function') { const st = deliver.stashFor(cid, { source: 'agent', kind: 'notification', fromName: FROM_NAME, text }); out.stashed = true; if (st && st.stored === false) { out.durable = false; out.durableWhy = st.why; log.warn?.(`[browser] handback for ${cid} — ${st.why}`); } } } catch (e) { log.warn?.(`[browser] handback stash failed — ${e && e.message}`); }
    // ONE carrier (the owner's ruling, 2026-09-27): the stash rides the same next prompt the notice would — the notice only when the stash could not take the words
    if (!out.stashed) out.noticed = queueNotice(sess, T.handbackNotice({ ...args, at: Date.now() }));
    log.log?.(`[browser] handback (${cause}) for ${sess.id}: NOT delivered (${out.why})${out.stashed ? ' — stashed for the next injection' : ''}${out.noticed ? '; the notice rides the next message' : ''}`);
    return out;
  }

  /**
   * LANE BROWSER-PROPOSE step 3 (d): THE APPROVED SWITCH IS TOLD — the proposal runner hands the words here, and they
   * take this module's ONE ladder site with `noWake` (a switch is not a wake): joined into a turn that is RUNNING where
   * that costs nothing (the harness's notification steer), else the ladder's own stash — the conversation's next turn,
   * free; only when the stash cannot take them, the zero-spend notice. ONE carrier. `{told: steered | stashed | noticed |
   * failed}`. The chat's card of those words is drawn where the agent receives them (the steer's own record, the stash's
   * drain) — the proposal card already says "the agent hears it with your next message".
   */
  async function tellProposal({ sessionId = null, browserKey = null, text = '' } = {}) {
    const sess = sessionFor(sessionId, browserKey);
    if (!sess || !text) return { told: 'failed', why: !sess ? 'no live session carries this browser key' : 'nothing to tell' };
    const cid = conversationIdOf(sess.s);
    const noticeOnly = () => (queueNotice(sess, { kind: 'browser-proposal', text, at: Date.now() }) ? { told: 'noticed' } : { told: 'failed', why: 'the notice queue is not wired' });
    if (!cid || !deliver || typeof deliver.deliverToConversation !== 'function') return noticeOnly();
    let r = null;
    try { r = await viaLadder(cid, text, { noWake: true }); } catch (e) { r = { ok: false, reason: 'delivery threw: ' + (e && e.message) }; }
    if (r && r.ok) { log.log?.(`[browser] proposal told to ${sess.id} in its running turn (${r.lane || 'delivered'})`); return { told: 'steered' }; }
    try {
      if (typeof deliver.stashFor === 'function') {
        const st = deliver.stashFor(cid, { source: 'agent', kind: 'notification', fromName: FROM_NAME, text });
        log.log?.(`[browser] proposal told to ${sess.id} with its next message (stashed${st && st.stored === false ? ' in memory only: ' + st.why : ''})`);
        return { told: 'stashed' };
      }
    } catch (e) { log.warn?.(`[browser] proposal stash failed — ${e && e.message}`); }
    return noticeOnly();
  }

  /**
   * THE TAKEOVER TELLS (the owner's ruling, 2026-09-27 — "告知agent发生了打断"). `ev` = the keeper's `takeover` event
   * with its `interruption` view (the PURE cycle: what was in flight at the instant, what the mediator aborted). ONE
   * card per cycle (`fresh` — a second viewer's takeover before the handback merges and says nothing), shown in the
   * conversation through the ladder's CARD path (`emitPeerCard`: display only — no rung, no turn, no spend) with the
   * sender VibeSpace speaks as (`FROM_NAME`, src/notification-senders.js) and `kind:'notification'`; and ONE
   * zero-spend `browser-takeover` notice the agent reads at its next turn. A window target is not a browser: nothing.
   */
  function announceTakeover(ev) {
    const out = { sessionId: null, carded: false, noticed: false, why: null, text: null };
    if (!ev || isWindow(ev) || ev.cause === 'pass') { out.why = 'not a browser takeover'; return out; }
    const iv = ev.interruption || null;
    if (!iv || iv.fresh === false) { out.why = iv ? 'the same takeover goes on (a second viewer before the handback) — said once' : 'no interruption view'; return out; }
    const sess = sessionFor(ev.sessionId, ev.browserKey);
    if (!sess) { out.why = 'no live session carries this browser key'; return out; }
    out.sessionId = sess.id;
    const label = labelOf(ev.profileId);
    const shared = ev.sharedWindow === true; // verify r2 ⑦ (r1 LOW 6): a mate taken WITH a legacy shared window is told so, never "your window"
    const text = T.takeoverText({ label, n: iv.n || 0, verbs: iv.verbs || [], shared });
    out.text = text;
    // the card is display only — to the live session we hold (a conversation with no id yet still sees it), else by conversation id
    const card = { fromName: FROM_NAME, text, kind: 'notification' };
    const cid = conversationIdOf(sess.s);
    try {
      if (typeof emitCard === 'function') out.carded = emitCard(sess.s, card) !== false;
      else if (cid && deliver && typeof deliver.emitPeerCard === 'function') { deliver.emitPeerCard(cid, card); out.carded = true; }
    } catch (e) { log.warn?.(`[browser] takeover card not shown — ${e && e.message}`); }
    out.noticed = queueNotice(sess, T.takeoverNotice({ label, n: iv.n || 0, verbs: iv.verbs || [], at: Date.now(), shared }));
    log.log?.(`[browser] takeover on ${ev.browserKey}${ev.profileId ? ' ' + ev.profileId : ' (ephemeral)'} for ${sess.id}: ${iv.n ? `${iv.n} operation(s) interrupted (${(iv.verbs || []).join(', ')})` : 'nothing in flight'}${out.carded ? '; card shown' : ''}${out.noticed ? '; the notice rides the next turn' : ''} (free — nothing delivered)`);
    return out;
  }

  /**
   * lane browser-windows verify r5 ② — THE USER'S DRIVE ENDED (the keeper's `drive-ended` event: no window of the browser is
   * driven any more; `refused` = the holders whose `tab new` was refused window_busy while he drove). Each is told ONCE by
   * the zero-spend `browser-window-free` notice (src/browser-windows.js's words) at its next turn — no card, no delivery, no
   * turn: nobody typed it; a holder with no live session is skipped (its lease is gone with it). → {told, skipped}.
   */
  function announceDriveEnded(ev) {
    const out = { told: [], skipped: [], why: null };
    if (!ev || ev.kind !== 'drive-ended' || !Array.isArray(ev.refused)) { out.why = 'not a drive-ended event'; return out; }
    const label = labelOf(ev.profileId); const at = Date.now();
    for (const r of ev.refused) {
      const sess = r && sessionFor(r.sessionId, r.browserKey);
      if (!sess) { out.skipped.push(String(r && r.browserKey)); continue; }
      if (queueNotice(sess, WIN.driveEndedNotice({ label, n: r.n, at }))) out.told.push(sess.id); else out.skipped.push(String(r.browserKey));
    }
    log.log?.(`[browser] drive ended on ${ev.profileId}: ${out.told.length} refused holder(s) told by a free notice${out.skipped.length ? `, ${out.skipped.length} without a live session` : ''}`);
    return out;
  }
  /**
   * LANE BROWSER-ADMIN 2a — CHANGE BUILD… TELLS (the keeper's `onRelaunch`, one event per conversation leased on the
   * browser it restarts): the takeover's shape — ONE conversation card through the ladder's CARD path (display only:
   * no rung, no turn, no spend) and ONE zero-spend `browser-relaunch` notice the agent reads at its next turn, in
   * `browser-interrupt.relaunchText`'s words (what was interrupted, its tab reopened). Never a delivery: nobody typed it.
   */
  function announceRelaunch(ev) {
    const out = { sessionId: null, carded: false, noticed: false, why: null, text: null };
    if (!ev || ev.kind !== 'relaunch') { out.why = 'not a relaunch'; return out; }
    const sess = sessionFor(ev.sessionId, ev.browserKey);
    if (!sess) { out.why = 'no live session carries this browser key'; return out; }
    out.sessionId = sess.id;
    // lane browser-unresponsive: a RESTART of a hung shared browser — the keeper's words (who, since when), a card only
    const restarted = ev.outcome === 'restarted' && typeof ev.text === 'string' && ev.text;
    const text = restarted ? ev.text : INT.relaunchText({ label: ev.label || labelOf(ev.profileId), from: ev.from, to: ev.to, n: ev.n || 0, verbs: ev.verbs || [], outcome: ev.outcome || 'changed' }); // verify r1 (F9): what happened
    out.text = text;
    const card = { fromName: FROM_NAME, text, kind: 'notification' };
    const cid = conversationIdOf(sess.s);
    try {
      if (typeof emitCard === 'function') out.carded = emitCard(sess.s, card) !== false;
      else if (cid && deliver && typeof deliver.emitPeerCard === 'function') { deliver.emitPeerCard(cid, card); out.carded = true; }
    } catch (e) { log.warn?.(`[browser] relaunch card not shown — ${e && e.message}`); }
    if (restarted) { log.log?.(`[browser] restart of ${ev.profileId} told to ${sess.id}${out.carded ? ': card shown' : ': NO card (no live chat)'}`); return out; }
    out.noticed = queueNotice(sess, { kind: 'browser-relaunch', label: ev.label || null, from: ev.from || '', to: ev.to || '', outcome: ev.outcome || 'changed', n: Math.max(0, Number(ev.n) || 0), verbs: (Array.isArray(ev.verbs) ? ev.verbs : []).map(String).slice(0, 20), at: Date.now() });
    log.log?.(`[browser] build change on ${ev.profileId} told to ${sess.id}: ${ev.n ? `${ev.n} operation(s) interrupted (${(ev.verbs || []).join(', ')})` : 'nothing in flight'}${out.carded ? '; card shown' : ''}${out.noticed ? '; the notice rides the next turn' : ''} (free — nothing delivered)`);
    return out;
  }

  /** Which browser the user took, as the verdict reads it: the handles a
   *  command may name it by, and whether a command that names NONE lands on
   *  it (the default attachment / the only one / the ephemeral browser when
   *  the conversation has no attachment — resolveHandle's ladder). */
  function takenFor(ev) {
    let atts = [];
    try { atts = (keeper && typeof keeper.setFor === 'function' ? (keeper.setFor(ev.browserKey) || {}).attachments : []) || []; } catch { atts = []; }
    if (!ev.profileId) return { handles: [], isDefault: atts.length === 0 };
    const a = atts.find((x) => x && x.profileId === ev.profileId) || null;
    return { handles: [String(ev.profileId), ...(a && a.alias ? [String(a.alias)] : [])], isDefault: !!(a && (a.isDefault || atts.length === 1)) };
  }
  /**
   * lane J r2: answer every pending approval for a browser page command on the
   * browser this event names with the stale deny, and mark its card. `moment`
   * ∈ browser-takeover.STALE_MOMENTS. Returns what it did (journal + suite).
   */
  function sweepStale(ev, moment) {
    const out = { moment, sessionId: null, stale: [], kept: 0, why: null };
    if (!ev || isWindow(ev)) { out.why = 'a window target has no browser approvals'; return out; }
    // 2.369.183: a lane P `pass` (a fold-back moving the SAME takeover to another view) arrives as kind 'takeover' with
    // cause 'pass' — no takeover began, so it is not a stale-approval moment
    if (ev.cause === 'pass') { out.why = 'a pass moves the same takeover to another view — no new moment'; return out; }
    if (!approvals || typeof approvals.pending !== 'function' || typeof approvals.answer !== 'function') { out.why = 'the approvals seam is not wired'; return out; }
    const sess = sessionFor(ev.sessionId, ev.browserKey);
    if (!sess) { out.why = 'no live session carries this browser key'; return out; }
    out.sessionId = sess.id;
    let pend = [];
    try { pend = approvals.pending(sess.s) || []; } catch (e) { out.why = 'pending cards unreadable: ' + (e && e.message); return out; }
    // lane S1 verify r4 (r2's L3, the owner's 2026-09-27 ruling: a takeover interrupts ALL of the
    // agent's operations on that browser): a HELPER's pending browser approval is swept too. Its
    // bare command lands on the browser its commands run under — the child handle a witness bound
    // to its Agent call (session._browserHelpers, in memory) when it minted one, else the parent's
    // — so for a helper ask `isDefault` is "the taken browser IS that one" (a handle-naming command
    // is judged by the handles as before). Answered through the same table lookup (one frame).
    let helpers = [];
    try { helpers = typeof approvals.pendingHelpers === 'function' ? (approvals.pendingHelpers(sess.s) || []) : []; } catch { helpers = []; }
    if (!pend.length && !helpers.length) return out;
    const taken = takenFor(ev);
    const label = labelOf(ev.profileId);
    const st = sess.s._browserHelpers || null;
    const childKeyOf = (call) => { if (!call || !st) return null; const w = (st.witnesses || []).find((x) => x && x.parent === call && x.handle); const c = w ? (st.children || []).find((x) => x && x.witness === w.id) : null; return c ? c.handle : (w && w.handle) || null; };
    const takenFor1 = (p) => { if (!p.helperCall) return taken; const ck = childKeyOf(p.helperCall); return ck ? { ...taken, isDefault: ck === ev.browserKey } : taken; };
    for (const p of [...pend, ...helpers]) {
      const v = T.browserApprovalVerdict({ permission: p, classify: VERBS.classify, taken: takenFor1(p) });
      if (!v.stale) { out.kept++; continue; }
      const staleBy = { code: 'browser_paused', moment, at: Date.now() };
      let r = null;
      try { r = approvals.answer(sess.id, sess.s, { requestId: p.requestId, approved: false, toolInput: p.input, denyMessage: T.staleDenyText({ moment, label }) }); } catch (e) { r = { ok: false, why: e && e.message }; }
      if (r && r.ok) {
        try { approvals.note?.(sess.s, p.requestId, staleBy); } catch { /* the deny was written; the card's words are cosmetic */ }
        out.stale.push({ requestId: p.requestId, verb: v.verb || null });
      } else out.why = (r && r.why) || 'the answer was not written';
    }
    if (out.stale.length || out.why) log.log?.(`[browser] ${moment} on ${ev.browserKey}${ev.profileId ? ' ' + ev.profileId : ' (ephemeral)'} for ${sess.id}: ${out.stale.length} pending browser approval(s) answered stale (browser_paused${out.stale.length ? ': ' + out.stale.map((x) => x.verb || '?').join(', ') : ''}), ${out.kept} left alone${out.why ? ' — ' + out.why : ''}`);
    return out;
  }

  /** A pending `--confirm-actions` confirmation reaches the conversation's
   *  side as ONE "For you" item (zero-spend; the daemon auto-denies in 60 s). */
  function noteConfirmation(ev) {
    if (!ev || ev.kind !== 'pending') return false;
    const sess = sessionFor(ev.sessionId, ev.browserKey);
    if (!sess) return false;
    const label = labelOf(ev.profileId);
    const c = ev.confirmation || {};
    // r6 A-F8: the item names what the action acts ON (the card's own target line — the keeper's first write, never a
    // later record's) so the owner judges the upload / the url / the script, not just a verb
    const tgt = c.target ? String(c.target) : '';
    return fileInbox(sess, {
      text: `The agent's browser${label ? ` (${label})` : ''} is waiting for you to confirm "${c.action || 'an action'}"${tgt ? ` on ${tgt.length > 120 ? tgt.slice(0, 119) + '…' : tgt}` : ''}${c.category ? ` [${c.category}]` : ''}`,
      detail: `${tgt ? `What it acts on: ${tgt}. ` : ''}Open the live view (Browser (live)) and press Confirm or Deny. The browser auto-denies after ${Math.round(T.CONFIRM_TTL_MS / 1000)} s; the agent sees the outcome as the command's result. Confirmation id ${c.id}.`,
      urgency: 'normal',
    });
  }

  /**
   * lane browser-resume B (§3.9, the owner's ruling 2): "HAND BACK AND CONTINUE" — the between-turns twin of the explicit
   * handback. The user's one-line note + the tab list ride the conversation's NEXT turn: ONE entry on the ladder's own
   * stash (kind `notification`, `ref` = the restore id — a failed disk write is SAID, never "stashed") and ONE display-only
   * card in the user's chat (the takeover card's path). NOTHING IS DELIVERED: no rung, no authorizer, no spend reason — the
   * only billed path stays the user's own "Hand over now" (stash-handover). Refusals BEFORE any act: no live session, a
   * conversation with no id yet (nothing to stash under). The keeper ends a takeover (cause `continue`) and reads the tabs;
   * its restore tells the agent's next command which tab is current. → `{ok, id, stashed, durable, carded, tabs, …}` | refusal.
   */
  async function continueFor({ sessionId = null, browserKey = null, profileId = null, note = '' } = {}) {
    const KB = require('../browser-kept.js');
    const sess = sessionFor(sessionId, browserKey);
    if (!sess) return { ok: false, code: 'no_live_session', error: 'the conversation is not running — nothing to hand the browser back to' };
    const cid = conversationIdOf(sess.s);
    if (!cid || !deliver || typeof deliver.stashFor !== 'function') return { ok: false, code: 'stash_refused', error: !cid ? 'this conversation has no id yet (its first reply has not come back) — hand it back after the agent has answered once' : 'the delivery stash is not wired on this server' };
    if (!keeper || typeof keeper.continueState !== 'function') return { ok: false, code: 'unavailable', error: 'the browser keeper is not available' };
    const st = await keeper.continueState({ browserKey, profileId, sessionId: sess.id });
    if (!st || !st.ok) return st || { ok: false, code: 'unavailable', error: 'no answer' };
    // verify r2 (Y5): ONE hand-back per turn. A press with NOTHING NEW — no takeover ended here, and this conversation's
    // previous hand-back still WAITING in the stash for its next turn — is refused by name: a double press, a second owner
    // tab inside the broadcast window or a retried POST filed a SECOND frame + card and the agent read the same hand-back
    // twice (reproduced: four frames for one next turn). A takeover that ended here is new (the user drove again: its
    // acts and re-run list are this press's own) and always files. The stash is asked, never remembered here (a drain,
    // a restart, an eviction all move the truth); a stash that cannot be peeked leaves the press alone (a dedupe, not a gate).
    if (!st.tookOver) {
      let waiting = null;
      try { waiting = typeof deliver.stashPeek === 'function' ? ((deliver.stashPeek(cid) || []).find((e) => e && e.ref && /^bres-[0-9a-f]{8,16}$/.test(String(e.ref)) && e.fromName === FROM_NAME) || null) : null; } catch { waiting = null; }
      if (waiting) {
        log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''} for ${sess.id}: hand-back refused already_handed_back — ${waiting.ref} still waits for the agent's next turn (nothing new: no takeover ended here)`);
        return { ok: false, code: 'already_handed_back', error: 'already handed back — the agent reads it with its next turn; take the browser over again to hand it back anew', id: String(waiting.ref) };
      }
    }
    const id = 'bres-' + require('crypto').randomBytes(4).toString('hex');
    const text = KB.continueFrame({ note, tabs: st.tabs, currentIndex: st.currentIndex, rerun: st.rerun, rerunSentence: T.rerunSentence, userActs: st.userActs || [], actsSentence: require('../browser-tabs.js').userActsSentence, drove: !!st.tookOver }); // verify r2: the head says drove / resumed
    const cardText = KB.continueCardText({ note, tabs: st.tabs, currentIndex: st.currentIndex });
    const out = { ok: true, id, stashed: false, durable: false, carded: false, tabs: st.tabs.length, tookOver: !!st.tookOver, own: !!st.own };
    try {
      const r = deliver.stashFor(cid, { source: 'agent', kind: 'notification', fromName: FROM_NAME, ref: id, text });
      out.stashed = true; out.durable = !(r && r.stored === false);
      if (!out.durable) out.why = r.why;
    } catch (e) { out.stashed = false; out.why = String(e && e.message); }
    // the conversation's own browser: its next command is told which tab is current (the note too when the stash could not take it)
    if (st.own) { try { keeper.noteContinue?.({ browserKey, tabs: st.tabs, note, stashed: out.stashed, drove: !!st.tookOver }); } catch (e) { log.warn?.(`[browser] hand-back restore not noted — ${e && e.message}`); } }
    const card = { fromName: FROM_NAME, text: cardText, kind: 'notification' };
    try {
      if (typeof emitCard === 'function') out.carded = emitCard(sess.s, card) !== false;
      else if (typeof deliver.emitPeerCard === 'function') { deliver.emitPeerCard(cid, card); out.carded = true; }
    } catch (e) { log.warn?.(`[browser] hand-back card not shown — ${e && e.message}`); }
    try { onLiveFactsChanged?.({ kind: 'continue', browserKey }); } catch { /* optional */ }
    log.log?.(`[browser] ${browserKey}${profileId ? ' on ' + profileId : ''} for ${sess.id}: handed back for the next turn — ${out.stashed ? `stashed (${out.durable ? 'on disk' : 'in memory: ' + out.why})` : `NOT stashed (${out.why})${st.own ? '; the note rides its next browser command instead' : ''}`}${out.carded ? '; card shown' : ''} (free — nothing delivered)`);
    if (!out.stashed) return { ...out, ok: false, code: 'stash_refused', error: `the note could not be queued for the agent's next turn: ${out.why}${st.own ? ' — its next browser command is told instead' : ''}` };
    return out;
  }

  let unsubInput = null, unsubConfirm = null, unsubWindow = null, unsubRelaunch = null;
  /** P9b: hang on the window-targets engine's input seam — the same announce, target 'window'. Idempotent. */
  function installWindow(engine) {
    if (!engine || typeof engine.onInput !== 'function' || unsubWindow) return false;
    unsubWindow = engine.onInput((ev) => {
      try { onLiveFactsChanged?.(ev); } catch { /* optional */ }
      if (ev.kind !== 'handback') return;
      announce({ ...ev, target: 'window' }).catch((e) => log.warn?.(`[window] handback announce failed — ${e && e.message}`));
    });
    return true;
  }
  /** Hang on the keeper's seams. Idempotent. */
  function install() {
    if (!keeper) return false;
    if (!unsubInput && typeof keeper.onInput === 'function') unsubInput = keeper.onInput((ev) => {
      // BROWSE YOURSELF (B-6ae8, the owner 2026-09-28): the user's OWN browsing window taking / letting go of HIS tab is
      // nobody's takeover — no card, no notice, no delivery, no stale sweep, no inbox item (it is no conversation's)
      if (ev && ev.human) return;
      try { onLiveFactsChanged?.(ev); } catch { /* optional */ }
      // lane J r2: both moments sweep the conversation's pending browser approvals (answered stale, browser_paused)
      if (ev.kind === 'takeover' || ev.kind === 'handback') { try { sweepStale(ev, ev.kind); } catch (e) { log.warn?.(`[browser] stale-approval sweep failed — ${e && e.message}`); } }
      // the owner's ruling (2026-09-27): the takeover TELLS — one card + one zero-spend notice per cycle, nothing billed
      if (ev.kind === 'takeover') { try { announceTakeover(ev); } catch (e) { log.warn?.(`[browser] takeover announce failed — ${e && e.message}`); } return; }
      // lane browser-windows verify r5 ②: the user's drive of a browser ENDED — every holder refused window_busy while he
      // drove is told ONCE by a zero-spend notice (free, its next turn); nothing delivered, nobody typed it
      if (ev.kind === 'drive-ended') { try { announceDriveEnded(ev); } catch (e) { log.warn?.(`[browser] drive-ended notice failed — ${e && e.message}`); } return; }
      if (ev.kind !== 'handback') return;
      // lane browser-resume B: "Hand back and continue" — the stash entry `continueFor` files IS the one carrier (no turn,
      // no zero-spend notice beside it: the same hand-back read twice); the stale sweep above still ran
      if (ev.cause === 'continue') return;
      announce(ev).catch((e) => log.warn?.(`[browser] handback announce failed — ${e && e.message}`));
    });
    if (!unsubRelaunch && typeof keeper.onRelaunch === 'function') unsubRelaunch = keeper.onRelaunch((ev) => { try { announceRelaunch(ev); } catch (e) { log.warn?.(`[browser] relaunch announce failed — ${e && e.message}`); } }); // lane browser-admin 2a
    if (!unsubConfirm && typeof keeper.onConfirmation === 'function') unsubConfirm = keeper.onConfirmation((ev) => { try { noteConfirmation(ev); } catch (e) { log.warn?.(`[browser] confirmation inbox failed — ${e && e.message}`); } });
    return true;
  }
  function shutdown() { try { unsubInput?.(); unsubConfirm?.(); unsubWindow?.(); unsubRelaunch?.(); } catch { /* */ } unsubInput = null; unsubConfirm = null; unsubWindow = null; unsubRelaunch = null; }

  return { announce, announceTakeover, announceDriveEnded, announceRelaunch, tellProposal, noteConfirmation, install, installWindow, shutdown, announceIdle, sweepStale, takenFor, continueFor, FROM_NAME };
}

module.exports = { create, FROM_NAME };
