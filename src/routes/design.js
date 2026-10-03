'use strict';
/**
 * THE DESIGN WINDOW'S ROUTES (lane design-core — docs/design-design-window.md §3.3). Thin over
 * src/server/design-engine.js; every failure is `{error, code}` with the engine's STATUS.
 *
 * OWNER (cookie — auth.middleware covers every non-/api/agent/* route; an agent's vsst_ / jbt_ bearer is refused by
 * name: a comment is the USER's own message, a publish from the window is the user's act):
 *   GET  /api/design?host=&dir=                → the read: manifest (or its refusals) + every frame laid out with its
 *                                                verdict and its inlined HTML + notes / pages / launch + mtimes
 *   GET  /api/designs?sessionId=&conversationId= → {designs: [row + page]} (a row of either; none given = every one)
 *   POST /api/design/comment {sessionId, host, dir, quote:{file, path, tag, text}, text}
 *                                              → {ok, delivered:'sent'|'stashed'} — THE typing sender, else the stash
 *   POST /api/design/publish {host, dir, title, public} → {ok, page}
 * AGENT (vsst_ session / jbt_ job token; the folder is on the CALLER's machine — its host is the session's):
 *   POST /api/agent/design/register {dir, title}  → registers + pushes `design-open` (the openSpec) to the owning
 *                                                    session's clients: the window opens / comes to the front
 *   POST /api/agent/design/changed  {dir, files}  → the notify rung (`file-changed` per file)
 *   POST /api/agent/design/check    {dir}         → the hub's read, the AGENT's view (verdicts + words, every string
 *                                                    a file wrote through THE belt; never the HTML)
 *   POST /api/agent/design/publish  {dir, public?, page?} → the published-pages store (the CLI's `publish` asks
 *                                                    first — src/agent-tool-rules.js)
 *   GET  /api/agent/designs                       → this conversation's designs + each one's page
 */
const { STATUS } = require('../server/design-engine.js');
const { addressableId } = require('../claude-lock-capture.js');
const { sameToken } = require('../pairing-token.js'); // B-8dda (lane agent-cli-fixes): a raw secret is compared in constant time

const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
const answer = (res, r) => (r && r.ok ? res.json(r) : res.status(STATUS[r && r.code] || 400).json({ error: (r && r.error) || 'refused', code: (r && r.code) || 'refused', ...(r && r.refusals ? { refusals: r.refusals } : {}) }));

function registerDesignRoutes(app, { design, activeSessions, getJobs = () => null }) {
  const ownerOnly = (req, res) => {
    if (!isAgentBearer(req)) return true;
    res.status(403).json({ error: 'the Design window\'s owner routes take the user\'s login — an agent uses /api/agent/design/*', code: 'agent_forbidden' });
    return false;
  };
  /** The agent caller: {sessionId, session, conversationId, host} | null (answered). */
  const agentCaller = (req, res) => {
    const token = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
    if (token.startsWith('jbt_')) {
      const jm = getJobs && getJobs();
      const job = jm && jm.ready !== false && typeof jm.jobByToken === 'function' ? jm.jobByToken(token) : null;
      if (!job) { res.status(401).json({ error: 'unknown job token', code: 'unauthorized' }); return null; }
      const cid = (job.owner && job.owner.conversation && job.owner.conversation.id) || null;
      let sid = null, s = null;
      if (cid) for (const [id, x] of activeSessions) if (x && addressableId(x) === cid) { sid = id; s = x; break; }
      return { sessionId: sid, session: s, conversationId: cid, host: job.hostId || null };
    }
    if (!token.startsWith('vsst_')) { res.status(401).json({ error: 'missing session token', code: 'unauthorized' }); return null; }
    for (const [id, s] of activeSessions) if (s && sameToken(token, s.agentToken)) return { sessionId: id, session: s, conversationId: addressableId(s), host: s.host || null };
    res.status(401).json({ error: 'unknown session token', code: 'unauthorized' });
    return null;
  };
  const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

  // ── owner ──
  app.get('/api/design', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    try { answer(res, await design.readDesign(req.query.host || null, String(req.query.dir || ''))); }
    catch (e) { res.status(500).json({ error: e.message, code: 'read_failed' }); }
  });
  app.get('/api/designs', (req, res) => {
    if (!ownerOnly(req, res)) return;
    // sessionId and / or conversationId (a resume mints a new session id; the chip passes both — /api/pages' rule): either matches
    const sid = req.query.sessionId ? String(req.query.sessionId) : null;
    const cid = req.query.conversationId ? String(req.query.conversationId) : null;
    res.json({ designs: design.list({ sessionId: sid, conversationId: cid }).map((d) => ({ ...d, page: design.pageOf(d.host, d.dir) })) });
  });
  app.post('/api/design/comment', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = body(req);
    try { answer(res, design.comment({ sessionId: b.sessionId, host: b.host || null, dir: b.dir || '', quote: b.quote, text: b.text })); }
    catch (e) { res.status(500).json({ error: e.message, code: 'send_failed' }); }
  });
  app.post('/api/design/publish', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = body(req);
    const row = design.find(b.host || null, b.dir);
    try {
      answer(res, await design.publish({ host: b.host || null, dir: b.dir, title: b.title, makePublic: b.public === undefined ? undefined : !!b.public, sessionId: row ? row.sessionId : null, conversationId: row ? row.conversationId : null, req }));
    } catch (e) { res.status(500).json({ error: e.message, code: 'publish_failed' }); }
  });

  // ── agent ──
  app.post('/api/agent/design/register', (req, res) => {
    const a = agentCaller(req, res); if (!a) return;
    const b = body(req);
    const r = design.register({ host: a.host, dir: b.dir, title: b.title, sessionId: a.sessionId, conversationId: a.conversationId });
    if (!r.ok) return answer(res, r);
    // the window opens (or comes to the front) on the owning session's clients — the openSpec rides the push
    let opened = false;
    if (a.session && a.sessionId) {
      const d = r.design;
      try { design.openOn(a.session, a.sessionId, d); opened = true; } catch { opened = false; }
    }
    res.json({ ...r, opened });
  });
  app.post('/api/agent/design/changed', async (req, res) => {
    const a = agentCaller(req, res); if (!a) return;
    const b = body(req);
    try { answer(res, await design.changed(a.host, b.dir, b.files)); }
    catch (e) { res.status(500).json({ error: e.message, code: 'read_failed' }); }
  });
  app.post('/api/agent/design/check', async (req, res) => {
    const a = agentCaller(req, res); if (!a) return;
    const b = body(req);
    try { answer(res, design.agentView(await design.readDesign(a.host, b.dir))); }
    catch (e) { res.status(500).json({ error: e.message, code: 'read_failed' }); }
  });
  app.post('/api/agent/design/publish', async (req, res) => {
    const a = agentCaller(req, res); if (!a) return;
    const b = body(req);
    // NO req: an agent has no browser — the page answers with its relative /p/<id> path (the 2.366.1 URL law)
    try { answer(res, await design.publish({ host: a.host, dir: b.dir, makePublic: b.public === undefined ? undefined : !!b.public, sessionId: a.sessionId, conversationId: a.conversationId, pageId: b.page ? String(b.page) : null })); }
    catch (e) { res.status(500).json({ error: e.message, code: 'publish_failed' }); }
  });
  app.get('/api/agent/designs', (req, res) => {
    const a = agentCaller(req, res); if (!a) return;
    if (!a.sessionId && !a.conversationId) return res.json({ designs: [] });   // a caller with no scope sees nothing (no all-designs oracle)
    const rows = [...design.list(a.sessionId ? { sessionId: a.sessionId } : {}), ...(a.conversationId ? design.list({ conversationId: a.conversationId }) : [])];
    const seen = new Set();
    res.json({ designs: rows.filter((d) => (seen.has(d.id) ? false : seen.add(d.id))).map((d) => ({ ...design.agentRow(d), page: design.pageOf(d.host, d.dir) })) });
  });
}

module.exports = { registerDesignRoutes, isAgentBearer };
