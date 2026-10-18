'use strict';
/**
 * AGENT FEEDBACK — THE ROUTES (lane agent-feedback; the model src/feedback-model.js, the store src/server/feedback-store.js).
 *
 * AGENT (Bearer vsst_ session / jbt_ job token — /api/agent/ is the auth layer's door; WHO is calling is the token's,
 * never the body's: the body carries text / about / kind only):
 *   POST /api/agent/feedback {text, about?, kind?} → {ok, report, duplicate, chars} — one report per 10 s per session
 *                                                     (429 `paced`, refused by name); a repeat of a report seen within
 *                                                     24 h bumps its count (`duplicate: true`)
 *   GET  /api/agent/feedback/mine                  → {reports} — this conversation's own reports (`vibespace-feedback list`)
 * OWNER (the cookie — auth.middleware + the write-origin gate stand before every route; an agent's bearer is refused
 * by name: the sheet is the owner's):
 *   GET   /api/feedback                            → {reports (newest first), open, dropped}
 *   PATCH /api/feedback/:id {status: open|handled} → {ok, report}
 * The live copy every client draws is the `feedback` StateSync store (the store mirrors each change into it).
 */
const { sameToken } = require('../pairing-token.js'); // B-8dda: a raw secret is compared in constant time
const { addressableId } = require('../claude-lock-capture.js');

const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
const STATUS = { text_not_text: 400, text_missing: 400, text_too_long: 400, about_not_text: 400, about_too_long: 400, kind_unknown: 400, status_unknown: 400, paced: 429, not_found: 404, write_failed: 503 };
const answer = (res, r) => {
  if (r && r.ok) return res.json(r);
  if (r && r.retryAfterS) res.set('Retry-After', String(r.retryAfterS));
  return res.status(STATUS[r && r.code] || 400).json({ error: (r && r.error) || 'refused', code: (r && r.code) || 'refused', ...(r && r.retryAfterS ? { retryAfterS: r.retryAfterS } : {}) });
};

/** deps: store (feedback-store), activeSessions (Map), getJobs, groupOf(session, sessionId) → {id, name} | null,
 *  instance() → {name, version} */
function registerFeedbackRoutes(app, { store, activeSessions, getJobs = () => null, groupOf = () => null, instance = () => ({}) }) {
  // the name the user's sidebar shows for a live session (src/session-name.js's ladder, the user's own rename aside): a
  // name GIVEN at creation / by a rename, else the harness's own title, else the live name ('Session N')
  const nameOf = (s) => (s && ((s._nameExplicit && s.name) || s._cliTitle || s.name || s.webuiName)) || null;
  const groupFor = (s, id) => { try { return s ? groupOf(s, id) : null; } catch { return null; } };
  /** THE CALLER, from its token: { facts (the record's), ids (whose reports are "mine") } | null (answered) */
  const agentCaller = (req, res) => {
    const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
    if (token.startsWith('jbt_')) {
      const jm = getJobs && getJobs();
      const job = jm && jm.ready !== false && typeof jm.jobByToken === 'function' ? jm.jobByToken(token) : null;
      if (!job) { res.status(401).json({ error: 'unknown job token', code: 'unauthorized' }); return null; }
      const cid = (job.owner && job.owner.conversation && job.owner.conversation.id) || null;
      let sid = null, s = null;
      if (cid) for (const [id, x] of activeSessions) if (x && addressableId(x) === cid) { sid = id; s = x; break; }
      const key = cid || `job:${job.id}`;
      return { ids: [key, sid], facts: { session: { id: key, name: nameOf(s) || `job ${job.name || job.id}` }, group: groupFor(s, sid), harness: s ? (s.backend || 'claude') : null, instance: instance() } };
    }
    if (!token.startsWith('vsst_')) { res.status(401).json({ error: 'missing session token — vibespace-feedback runs inside a VibeSpace session', code: 'unauthorized' }); return null; }
    for (const [id, s] of activeSessions) {
      if (!s || !sameToken(token, s.agentToken)) continue;
      const cid = addressableId(s);
      return { ids: [cid || id, id], facts: { session: { id: cid || id, name: nameOf(s) }, group: groupFor(s, id), harness: s.backend || 'claude', instance: instance() } };
    }
    res.status(401).json({ error: 'unknown session token', code: 'unauthorized' });
    return null;
  };
  const ownerOnly = (req, res) => {
    if (!isAgentBearer(req)) return true;
    res.status(403).json({ error: 'the feedback list is the user\'s — an agent files with vibespace-feedback and reads its own with vibespace-feedback list', code: 'agent_forbidden' });
    return false;
  };
  const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

  // ── agent ──
  app.post('/api/agent/feedback', (req, res) => {
    const c = agentCaller(req, res);
    if (!c) return;
    const b = body(req);
    answer(res, store.report({ text: b.text, about: b.about, kind: b.kind }, c.facts));
  });
  app.get('/api/agent/feedback/mine', (req, res) => {
    const c = agentCaller(req, res);
    if (!c) return;
    res.json({ reports: store.mine(c.ids) });
  });
  // ── owner ──
  app.get('/api/feedback', (req, res) => {
    if (!ownerOnly(req, res)) return;
    res.json(store.list());
  });
  app.patch('/api/feedback/:id', (req, res) => {
    if (!ownerOnly(req, res)) return;
    answer(res, store.setStatus(String(req.params.id || ''), String(body(req).status || '')));
  });
}

module.exports = { registerFeedbackRoutes };
