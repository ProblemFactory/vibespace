'use strict';
/**
 * THE DOC WINDOW'S ROUTES (lane doc-window, 2.369.215). Thin over src/server/doc-engine.js; a failure is `{error, code}`
 * with the engine's STATUS. OWNER routes only (an agent's vsst_ / jbt_ bearer is refused by name — a comment and an
 * edit are the USER's acts; the file itself is read and written through the existing /api/file/* routes):
 *   GET  /api/doc/owner?host=&path=&from=        → {owner: {via:'registry'|'from', sessionId} | null}
 *   POST /api/doc/comments {host, path, from, items:[{quote, note}]} → {ok, delivered:'sent'|'stashed', count}
 *   POST /api/doc/edited   {host, path, from, summary}             → {ok, delivered} — the owner's next-turn note
 */
const { STATUS } = require('../server/doc-engine.js');
const { isAgentBearer } = require('./design.js');

const answer = (res, r) => (r && r.ok ? res.json(r) : res.status(STATUS[r && r.code] || 400).json({ error: (r && r.error) || 'refused', code: (r && r.code) || 'refused' }));

function registerDocRoutes(app, { doc }) {
  const ownerOnly = (req, res) => {
    if (!isAgentBearer(req)) return true;
    res.status(403).json({ error: 'the Doc window\'s routes take the user\'s login', code: 'agent_forbidden' });
    return false;
  };
  const args = (o) => ({ host: o.host ? String(o.host) : null, path: String(o.path || ''), from: o.from ? String(o.from) : '' });
  app.get('/api/doc/owner', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const o = doc.ownerOf(args(req.query || {}));
    res.json({ owner: o ? { via: o.via, sessionId: o.sessionId } : null });
  });
  app.post('/api/doc/comments', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = req.body || {};
    answer(res, doc.comments({ ...args(b), items: b.items }));
  });
  app.post('/api/doc/edited', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = req.body || {};
    answer(res, doc.edited({ ...args(b), summary: b.summary }));
  });
}

module.exports = { registerDocRoutes };
