'use strict';
/**
 * THE ONE-PRESS DOOR (lane setting-doors pick 2): the owner's press on an agent's proposed change, «End now» on a held row, and the
 * holds the Settings rows draw. Every write asks THE pick 0 verdict (write-origin ownerPageWhy): only the owner's own page — a bearer
 * (an agent, a job, an automation key) or a request with no mark of the page is refused by name, nothing written.
 *   GET  /api/setting-holds              → { holds: [{ key, value, before, untilAt, at }] }
 *   POST /api/setting-holds/press        { key, value, untilRel?, untilAt?, shown } → the ONE act (src/server/setting-holds.js take)
 *   POST /api/setting-holds/end          { key } → the hold returns now
 */
function registerSettingHoldRoutes(app, { holds }) {
  const why = (req) => require('../write-origin.js').ownerPageWhy(req);
  const refuse = (res, w) => res.status(403).json({ error: `a held setting changes only by the owner's press on the owner's own page; ${w === 'bearer' ? 'a request carrying a bearer token' : 'a request with no mark of the owner\'s page'} cannot press it; nothing was written`, code: 'spend_row_owner_only', why: w });
  app.get('/api/setting-holds', (req, res) => { const unread = typeof holds.unreadWords === 'function' ? holds.unreadWords() : null; res.json({ holds: holds.list(), ...(unread ? { unread } : {}) }); });   // r3004: held — its words, never «no hold» alone
  app.post('/api/setting-holds/press', async (req, res) => {
    const w = why(req); if (w) return refuse(res, w);
    const b = req.body || {};
    try {
      const r = await holds.take({ key: String(b.key || ''), value: Number(b.value), untilRel: b.untilRel == null ? null : Number(b.untilRel), untilAt: b.untilAt == null ? null : Number(b.untilAt), shown: b.shown });
      res.status(r.ok ? 200 : r.status || 400).json(r);
    } catch (e) { res.status(500).json({ ok: false, code: 'press-failed', error: e.message }); }
  });
  app.post('/api/setting-holds/end', async (req, res) => {
    const w = why(req); if (w) return refuse(res, w);
    try { const r = await holds.end(String((req.body || {}).key || '')); res.status(r.ok ? 200 : r.status || 500).json(r); }
    catch (e) { res.status(500).json({ ok: false, code: 'end-failed', error: e.message }); }
  });
}
module.exports = { registerSettingHoldRoutes };
