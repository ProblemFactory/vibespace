'use strict';
// THE STUCK TURN'S DOORS (lane turn-never-silent, law L2): the For-you item's own buttons (src/foryou-actions.js row
// 'turn-stuck') press here — a PERSON's click only (THE person verdict, src/routes/vault.js: any bearer ⇒ human_only, not this
// page ⇒ cross_site). «Keep waiting» ends the item and restarts the bound; «Stop the turn» is the composer's own Stop.
const { personVerdict } = require('./vault.js');

const ANSWERS = Object.freeze(['keep-waiting', 'stop-turn']);

function registerTurnStuckRoutes(app, { turnWatch }) {
  app.post('/api/turns/:sessionId/stuck', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const v = personVerdict(req);
    if (!v.ok) return res.status(403).json(v);
    const answer = String((req.body && req.body.answer) || '');
    const id = String(req.params.sessionId || '');
    if (!ANSWERS.includes(answer)) return res.status(400).json({ ok: false, code: 'unknown-answer' });
    const r = answer === 'keep-waiting' ? turnWatch.keepWaiting(id) : turnWatch.stopTurn(id);
    res.status(r && r.ok ? 200 : 409).json(r || { ok: false, code: 'failed' });
  });
}

module.exports = { registerTurnStuckRoutes, ANSWERS };
