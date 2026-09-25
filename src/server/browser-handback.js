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
 *   · take over        — nothing is delivered (the agent is told by the typed
 *                        `browser_paused` refusal on its next command: free);
 *   · explicit handback — DELIVERED through the ladder, `kind:'notification'`
 *                        (VibeSpace is speaking, nobody waits for a reply — on
 *                        a codex turn in flight that is the steer lane), with
 *                        the CURRENT URL so the agent re-orients;
 *   · idle / viewer-left — NOTHING by default (zero-spend): the lease flips,
 *                        the live view and the card update, ONE "For you" item
 *                        says the takeover lapsed (idle only), the zero-spend
 *                        `browser-handback` notice rides the user's own next
 *                        message; setting `browser.announceIdleHandback`
 *                        (default OFF) routes it through the same reason and
 *                        the same ceiling.
 * A REFUSAL LOSES NOTHING: a refused or failed delivery is stashed on the
 * ladder's own stash (the words ride the next injection) AND the zero-spend
 * notice is queued; the lease flip already happened regardless. Every
 * outcome is journalled with its cause.
 *
 * WINDOW TARGETS (P9b, design §4.9 / §6.6): a window's handback is the same
 * moment under the same reason — `installWindow(engine)` hangs on the
 * window-targets engine's `onInput` seam and `announce` takes the event's
 * `target:'window'` + `label` + `handle` into the SAME text/notice/inbox
 * functions (the PURE noun switch in browser-takeover.js). ONE announcer,
 * ONE billed site, ONE reason — a second module for windows would be a twin
 * of this one and a second row in the spend census.
 */
const T = require('../browser-takeover.js');

const FROM_NAME = 'VibeSpace browser';

function create({ keeper = null, deliver = null, serverSetting = () => undefined, userTodos = null, activeSessions = null,
  sessionKeyFor = null, notice = null, onLiveFactsChanged = null, log = console } = {}) {
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
  const conversationIdOf = (s) => (s && (s.backendSessionId || s.claudeSessionId)) || null;

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
    const args = { cause, label, url: ev.url || '', heldMs: ev.heldMs || 0, idleMs, ...(win ? { target: 'window', handle: ev.handle || null } : {}) };
    const verdict = T.announceVerdict({ cause, announceIdle: announceIdle() });
    const out = { cause, target: win ? 'window' : 'browser', sessionId: sess ? sess.id : null, verdict, delivered: false, stashed: false, noticed: false, inbox: false, why: null };
    if (!sess) { out.why = win ? 'no live session holds this window' : 'no live session carries this browser key'; log.log?.(`[browser] handback (${cause}) for ${win ? ev.handle : ev.browserKey}: ${out.why}`); return out; }
    if (cause === 'idle') out.inbox = fileInbox(sess, T.idleInboxItem({ label, idleMs, url: ev.url || '', sessionName: sess.s.name || '', ...(win ? { target: 'window' } : {}) }));
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
    try {
      // THE ONE BILLED SITE of this feature: through the gated ladder, under the declared reason (§4.3.1)
      r = await deliver.deliverToConversation(cid, text, { kind: 'notification', spendReason: 'browser-handback', fromName: FROM_NAME, cardText: text }); // the LITERAL is what the census reads; it equals T.SPEND_REASON (pinned by the suite)
    } catch (e) { r = { ok: false, reason: 'delivery threw: ' + (e && e.message) }; }
    if (r && r.ok) {
      out.delivered = true;
      log.log?.(`[browser] handback (${cause}) for ${sess.id}: announced into the conversation (${r.via || r.mode || 'delivered'})`);
      return out;
    }
    // A refusal loses nothing: the ladder's own stash carries the words to the
    // next injection, and the zero-spend notice rides the next message too.
    out.why = (r && r.reason) || 'delivery refused';
    try { if (typeof deliver.stashFor === 'function') { deliver.stashFor(cid, { source: 'agent', fromName: FROM_NAME, text }); out.stashed = true; } } catch (e) { log.warn?.(`[browser] handback stash failed — ${e && e.message}`); }
    out.noticed = queueNotice(sess, T.handbackNotice({ ...args, at: Date.now() }));
    log.log?.(`[browser] handback (${cause}) for ${sess.id}: NOT delivered (${out.why})${out.stashed ? ' — stashed for the next injection' : ''}${out.noticed ? '; the notice rides the next message' : ''}`);
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
    return fileInbox(sess, {
      text: `The agent's browser${label ? ` (${label})` : ''} is waiting for you to confirm "${c.action || 'an action'}"${c.category ? ` [${c.category}]` : ''}`,
      detail: `Open the live view (Browser (live)) and press Confirm or Deny. The browser auto-denies after ${Math.round(T.CONFIRM_TTL_MS / 1000)} s; the agent sees the outcome as the command's result. Confirmation id ${c.id}.`,
      urgency: 'normal',
    });
  }

  let unsubInput = null, unsubConfirm = null, unsubWindow = null;
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
      try { onLiveFactsChanged?.(ev); } catch { /* optional */ }
      if (ev.kind !== 'handback') return;
      announce(ev).catch((e) => log.warn?.(`[browser] handback announce failed — ${e && e.message}`));
    });
    if (!unsubConfirm && typeof keeper.onConfirmation === 'function') unsubConfirm = keeper.onConfirmation((ev) => { try { noteConfirmation(ev); } catch (e) { log.warn?.(`[browser] confirmation inbox failed — ${e && e.message}`); } });
    return true;
  }
  function shutdown() { try { unsubInput?.(); unsubConfirm?.(); unsubWindow?.(); } catch { /* */ } unsubInput = null; unsubConfirm = null; unsubWindow = null; }

  return { announce, noteConfirmation, install, installWindow, shutdown, announceIdle, FROM_NAME };
}

module.exports = { create, FROM_NAME };
