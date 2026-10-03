'use strict';
/**
 * RESET-CREDIT ROUTES (docs/design-reset-credits.zh.md §5, p2 — the manual use).
 * Thin: the engine (src/server/usage-pool-engine.js) decides, the PURE verdict
 * module (src/reset-credit.js) words; a route decides nothing.
 *
 *   GET  /api/accounts/:id/reset-credit[?sessionId=]
 *        → the PREVIEW the confirm dialog shows: {key, name, backend, vendor,
 *          creditsLeft, resetsAtSec, periodSec, remainingPct, sessionId,
 *          cooldownUntilSec, code?, error?} — `code` names the refusal the POST
 *          would answer (always 200: a refusal is a fact the dialog shows)
 *   POST /api/accounts/:id/reset-credit   {sessionId?, expect?: {resetsAtSec}} (verify-r6 R1: the window the dialog showed —
 *          one that reset or moved since ⇒ 409 preview_changed, nothing spent)
 *        → {ok:true, sessionId, via}  — ONE `codex-reset-credit` verb written on that
 *          session's own wrapper (through the spend ceiling, the 10-min floor), or — lane
 *          reset-path, `via:'helper'` — ONE bounded `codex app-server` child on the account's own
 *          login when no conversation's wrapper can carry it (src/codex-reset-helper.js; the one
 *          vendor act a person's click starts, allowlisted in test-vendor-whitelist §8)
 *        | {error, code} by NAME: not_supported 400 · no_live_session 409 ·
 *          no_credits 409 · in_flight 409 (lane reset-path: a request handed to codex, not yet
 *          sent) · restart_pending 409 · cooldown 429 (only a consume that WENT OUT arms it) ·
 *          spend_refused 429 · agent_forbidden 403
 *
 * `:id` is the USAGE IDENTITY key — an account id, or the machine login's own
 * key (what the roster row and the For-you item's action carry); a pool id
 * resolves to its current member. HUMAN-TRIGGERED ONLY: an agent's session /
 * job token is refused (the /api/usage/repair-identity rule) — a stored credit
 * is spent by a person, or by the auto rung under its own setting, never by an
 * agent calling a route. The OUTCOME arrives asynchronously: the wrapper's
 * `reset_credit_result` (or the helper's answer) → the engine (a server notice
 * either way) and the fresh counts ride the usage poll the roster already
 * repaints from. The GET preview names `via` ('session' | 'helper') and, for the
 * helper, `helperWhy` ('no-session' | 'wrapper-predates') — the dialog says it.
 */
const STATUS = Object.freeze({ not_supported: 400, no_live_session: 409, no_credits: 409, in_flight: 409, unsettled: 409, restart_pending: 409, preview_changed: 409, cooldown: 429, spend_refused: 429, agent_forbidden: 403 });
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
const sid = (v) => (typeof v === 'string' && /^[\w.:-]{1,120}$/.test(v) ? v : null);

function registerResetCreditRoutes(app, { engine }) {
  app.get('/api/accounts/:id/reset-credit', (req, res) => {
    try {
      if (typeof engine.resetCreditPreview !== 'function') return res.status(503).json({ error: 'reset credits unavailable', code: 'no_engine' });
      res.json(engine.resetCreditPreview(String(req.params.id), { preferSessionId: sid(req.query && req.query.sessionId) }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/accounts/:id/reset-credit', async (req, res) => {
    try {
      if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
      if (typeof engine.consumeResetCreditFor !== 'function') return res.status(503).json({ error: 'reset credits unavailable', code: 'no_engine' });
      // verify-r6 R1: the window the dialog SHOWED (its reset instant) — a window that reset or moved since ⇒ preview_changed
      const ex = req.body && req.body.expect && typeof req.body.expect === 'object' && req.body.expect.resetsAtSec != null && Number.isFinite(Number(req.body.expect.resetsAtSec)) ? { resetsAtSec: Number(req.body.expect.resetsAtSec) } : null;
      let r = engine.consumeResetCreditFor(String(req.params.id), { preferSessionId: sid(req.body && req.body.sessionId), expect: ex });
      // verify r1 (the unknown consume): an earlier request on this account got no answer — the conversation reads
      // the account FIRST (one read, the existing rung), then the press is asked again; still unsettled ⇒ refused
      if (r && !r.ok && r.code === 'unsettled' && r.needsRead && typeof engine.settleResetCreditByRead === 'function') {
        let s = null;
        try { s = await engine.settleResetCreditByRead(String(req.params.id), { preferSessionId: sid(req.body && req.body.sessionId) }); } catch { s = null; }
        // the read's OWN verdict decides (never the cache): landed ⇒ the credit was used then and the wall this dialog
        // showed is gone; expired ⇒ it reset by itself — nothing spent either way, said by name
        // (verify r5: an untold has several reasons now — the settle's own words ride, never one assumed)
        if (s && s.how && s.how !== 'not-landed') return res.status(409).json({ error: s.how === 'landed' ? 'the earlier reset-credit request on this account had landed — the limit was reset then and the window this dialog showed is gone; nothing was spent. Open it again to see the account now' : s.how === 'untold' ? `the earlier reset-credit request on this account cannot be judged (${s.why || 'no credit count was known when it was sent'}); nothing was spent this time. Open it again: the count shown is the account's now, and a new press spends one` : 'the limit window this dialog showed has reset by itself since the earlier request — nothing was spent; open it again to see the account now', code: 'preview_changed', settled: s.how, why: s.why || null });
        // verify r5 (reproduced, money): a client that named no window (an older one) re-asked with none — and the read just
        // taken may have MOVED the window (the earlier request landed under a grant that hid it from the count): the window the
        // first preview showed is what the person approved, so it rides the re-ask whether or not the client spelled it
        const shown = ex || (r.preview && Number(r.preview.resetsAtSec) > 0 ? { resetsAtSec: Number(r.preview.resetsAtSec) } : null);
        // verify r8 T0: the route just read the account — the re-ask's verb carries no read-first of its own (one read per press)
        r = engine.consumeResetCreditFor(String(req.params.id), { preferSessionId: sid(req.body && req.body.sessionId), expect: shown, afterRead: true });
      }
      if (!r || !r.ok) return res.status(STATUS[r && r.code] || 400).json({ error: (r && r.error) || 'refused', code: (r && r.code) || 'refused', cooldownUntilSec: r && r.preview ? r.preview.cooldownUntilSec : null, unsettled: r && r.preview ? r.preview.unsettled || null : null, restartPending: r && r.preview ? r.preview.restartPending || null : null });
      res.json({ ok: true, sessionId: r.sessionId, via: r.via || 'session' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // lane reset-path R4: THE USAGE MENU'S CODEX ⟳, ANSWERED — POST /api/usage/codex-refresh {key?, sessionId?}
  // → 200 {ok, key, name, reading: {fiveHour, sevenDay, fetchedAt, source}, resetCredits} once the session's own
  // app-server answered (the reading already written through the one cache writer), or {ok:false, code, error}:
  // no_live_session 409 · refused 502 · archived 502 · timeout 504. A person's press (agent tokens refused).
  app.post('/api/usage/codex-refresh', async (req, res) => {
    try {
      if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
      if (typeof engine.refreshCodexForPerson !== 'function') return res.status(503).json({ error: 'codex refresh unavailable', code: 'no_engine' });
      const key = req.body && typeof req.body.key === 'string' && /^[\w.:@-]{1,120}$/.test(req.body.key) ? req.body.key : null;
      const r = await engine.refreshCodexForPerson({ key, sessionId: sid(req.body && req.body.sessionId) });
      if (!r || !r.ok) return res.status({ no_live_session: 409, refused: 502, archived: 502, timeout: 504 }[r && r.code] || 400).json(r || { ok: false, code: 'refused', error: 'no answer' });
      res.json(r);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}

module.exports = { registerResetCreditRoutes, STATUS };
