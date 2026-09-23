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
 *   POST /api/accounts/:id/reset-credit   {sessionId?}
 *        → {ok:true, sessionId}  — ONE `codex-reset-credit` verb written on that
 *          session's own wrapper (through the spend ceiling, the 10-min floor)
 *        | {error, code} by NAME: not_supported 400 · no_live_session 409 ·
 *          no_credits 409 · restart_pending 409 · cooldown 429 · spend_refused 429 · agent_forbidden 403
 *
 * `:id` is the USAGE IDENTITY key — an account id, or the machine login's own
 * key (what the roster row and the For-you item's action carry); a pool id
 * resolves to its current member. HUMAN-TRIGGERED ONLY: an agent's session /
 * job token is refused (the /api/usage/repair-identity rule) — a stored credit
 * is spent by a person, or by the auto rung under its own setting, never by an
 * agent calling a route. The OUTCOME arrives asynchronously: the wrapper's
 * `reset_credit_result` → the engine (a server notice either way) and the
 * fresh counts ride the usage poll the roster already repaints from.
 */
const STATUS = Object.freeze({ not_supported: 400, no_live_session: 409, no_credits: 409, restart_pending: 409, cooldown: 429, spend_refused: 429, agent_forbidden: 403 });
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
const sid = (v) => (typeof v === 'string' && /^[\w.:-]{1,120}$/.test(v) ? v : null);

function registerResetCreditRoutes(app, { engine }) {
  app.get('/api/accounts/:id/reset-credit', (req, res) => {
    try {
      if (typeof engine.resetCreditPreview !== 'function') return res.status(503).json({ error: 'reset credits unavailable', code: 'no_engine' });
      res.json(engine.resetCreditPreview(String(req.params.id), { preferSessionId: sid(req.query && req.query.sessionId) }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/accounts/:id/reset-credit', (req, res) => {
    try {
      if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
      if (typeof engine.consumeResetCreditFor !== 'function') return res.status(503).json({ error: 'reset credits unavailable', code: 'no_engine' });
      const r = engine.consumeResetCreditFor(String(req.params.id), { preferSessionId: sid(req.body && req.body.sessionId) });
      if (!r || !r.ok) return res.status(STATUS[r && r.code] || 400).json({ error: (r && r.error) || 'refused', code: (r && r.code) || 'refused', cooldownUntilSec: r && r.preview ? r.preview.cooldownUntilSec : null, restartPending: r && r.preview ? r.preview.restartPending || null : null });
      res.json({ ok: true, sessionId: r.sessionId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { registerResetCreditRoutes, STATUS };
