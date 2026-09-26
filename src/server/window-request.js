'use strict';
/**
 * THE WINDOW-CONTROL REQUEST — ORCH (desktop lane E, D3; docs/design-desktop-apps-seamless §3.6, 2026-09-25).
 * The owner: "…或者直接从一个窗口能发起让某个特定agent控制的request". From a desktop-app window the user picks ONE
 * live agent, optionally types a line, and VibeSpace sends that agent a message naming the window:
 *
 *   · the request first GRANTS the window to that agent (`by:'request'` — nothing changes when it already reaches it),
 *     and when ANOTHER agent holds the window and the user said so (`endHold`) that hold ends (by:user, audited): the
 *     user's intent is "this agent controls it", and a held window would answer the asked agent `window_leased`;
 *   · FREE — the default: the message rides the agent's NEXT turn. It goes on the delivery ladder's stash
 *     (`deliver.stashFor`, source `window-request`), drained into the conversation's next prompt-context injection
 *     with its peer card (src/agent-routes.js renders it as a block, never clipped to a line). Nothing is billed.
 *   · WAKE — "wake it now": a BILLED turn, so it goes through the ladder's gated `deliverToConversation` under the
 *     ONE declared reason `window-share-request` (src/spend-authorizer.js SPEND_REASONS): the spend authorizer is the
 *     money ceiling and fails CLOSED; a refusal — or a delivery that found no live lane — falls to the stash, and the
 *     answer names why. A UX floor beside it: one wake per target conversation per WAKE_FLOOR_MS (in memory); a
 *     second wake inside it rides the next turn (`wake_paced`, said by name).
 *
 * The message is `kind:'peer'` — the user's own words, never a VibeSpace notification (src/notification-senders.js
 * lists only `kind:'notification'` producers). test-spend-paths' census lists this file's ONE ladder call under
 * (file, 'deliver-ladder'); the reason literal below is what its reason table reads.
 */
const R = require('../window-reach.js');

/** Who the message is from, as the agent's card and the stash name it (a stored string — English, never t()). */
const FROM_NAME = 'The user (Desktop apps)';
const WAKE_FLOOR_MS = 30 * 1000;
const namedError = (code, msg, extra = {}) => { const e = new Error(msg); e.code = code; Object.assign(e, extra); return e; };

function create({ engine, deliver = null, activeSessions = null, now = Date.now, log = console } = {}) {
  if (!engine) throw new Error('window-request: engine required');
  const lastWake = new Map(); // conversation id → the last wake's instant
  const sessionsMap = () => (typeof activeSessions === 'function' ? activeSessions() : activeSessions) || new Map();

  /**
   * `{handle, sessionId, note?, wake?, endHold?}` → `{ok, delivered:'woken'|'next-turn', why?, whyCode?, granted, endedHold, text}`
   * or a typed throw: not-found (no such window here), not_live (the session is gone), no_conversation (it has no
   * conversation id yet — nothing to deliver into), bad-request (no delivery ladder on this instance).
   */
  async function request({ handle, sessionId, note = '', wake = false, endHold = false } = {}) {
    const view = engine.reachOf(handle);
    if (!view) throw namedError('not-found', `no desktop-app window ${JSON.stringify(String(handle || ''))} is live on this machine`);
    const s = sessionsMap().get(String(sessionId || ''));
    if (!s || s.backend === 'shell') throw namedError('not_live', 'that agent session is not live any more — pick another one');
    const cid = s.backendSessionId || s.claudeSessionId || null;
    if (!cid) throw namedError('no_conversation', `${s.name || sessionId} has no conversation yet — say something to it first, then ask again`);
    if (!deliver || typeof deliver.stashFor !== 'function') throw namedError('bad-request', 'the delivery ladder is not wired on this instance');
    const name = s.name || s.webuiName || String(sessionId);
    // 1. the grant (the request exposes the window to the asked agent)
    const g = engine.grantReach(view.handle, { kind: 'session', id: String(sessionId), name }, { by: 'request' });
    // 2. another agent's hold ends when the user asked for it
    let endedHold = false;
    const lease = g.lease;
    if (endHold && lease && lease.sessionId && lease.sessionId !== String(sessionId)) endedHold = engine.endHold(view.handle, `the user asked ${name} to take control`);
    // 3. the words (agent-facing English; the user's line quoted as a note)
    const mi = g.modeInfo || {};
    const text = R.requestText({ label: view.label, handle: view.handle, mode: mi.mode, resolved: mi.resolved, note });
    const stash = () => { deliver.stashFor(cid, { source: 'window-request', fromName: FROM_NAME, text }); };
    const out = { ok: true, granted: !!(g.granted && g.granted.changed), endedHold, text, sessionId: String(sessionId), name };
    if (!wake) { stash(); log.log?.(`[window] request: ${view.handle} → ${name} — rides its next turn`); return { ...out, delivered: 'next-turn' }; }
    const last = lastWake.get(cid) || 0;
    if (now() - last < WAKE_FLOOR_MS) {
      stash();
      return { ...out, delivered: 'next-turn', whyCode: 'wake_paced', why: `${name} was woken less than ${Math.round(WAKE_FLOOR_MS / 1000)} s ago — this request rides its next turn` };
    }
    let r = null;
    try {
      // THE ONE BILLED SITE of this feature: through the gated ladder under its declared reason (the literal is what the census reads)
      r = await deliver.deliverToConversation(cid, text, { kind: 'peer', spendReason: 'window-share-request', fromName: FROM_NAME, cardText: text });
    } catch (e) { r = { ok: false, reason: 'delivery threw: ' + (e && e.message) }; }
    if (r && r.ok) {
      lastWake.set(cid, now());
      log.log?.(`[window] request: ${view.handle} → ${name} — woken (${r.lane || 'delivered'})`);
      return { ...out, delivered: 'woken', lane: r.lane || null };
    }
    // a refusal loses nothing: the words ride the next turn, and the answer says why it did not wake
    stash();
    const spend = r && r.refused === 'spend';
    log.log?.(`[window] request: ${view.handle} → ${name} — NOT woken (${(r && r.reason) || 'refused'}); stashed for its next turn`);
    return { ...out, delivered: 'next-turn', whyCode: spend ? 'spend' : 'no_lane', why: spend ? `the unattended-turn budget refused the wake (${(r && r.why) || 'spend'}) — it will see the request on its next turn` : `${(r && r.reason) || 'no live lane'} — it will see the request on its next turn` };
  }
  return { request, FROM_NAME, WAKE_FLOOR_MS };
}

module.exports = { create, FROM_NAME, WAKE_FLOOR_MS };
