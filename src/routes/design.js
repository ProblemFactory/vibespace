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
 *   POST /api/design/changes {sessionId, host, dir, items:[≤ 30 chips]} → {ok, delivered, count} — the changes strip's
 *                                              ONE `[Design changes]` message down the comment's own sender
 *   POST /api/design/publish {host, dir, title, public} → {ok, page}
 *   GET  /api/design/bundle?host=&dir=         → the publish bundle as a DOWNLOAD (lane design-present: Download HTML —
 *                                                one self-contained page, nothing hosted): attachment `<folder>.html`
 *                                                (file-disposition.js — both forms, a CJK folder name kept),
 *                                                the published pages' sandbox CSP + nosniff (it never renders here);
 *                                                refused exactly as publish refuses (not_publishable / too_big)
 *   GET  /api/design/ask?host=&dir=            → {ask: {id, at, questions} | null} — the questions waiting on the design
 *                                                (lane design-ask; live as the `design-ask` push)
 *   POST /api/design/answers {host, dir, askId, skip?, answers?} → {ok, delivered:'sent'|'stashed'} — ONE `[Design
 *                                                answers]` line through the comment's own sender, to the asker
 *   GET  /api/design/tweaks?host=&dir=         → {tweaks: [declared], values, set} — the Tweaks panel's read (lane
 *                                                design-tweaks: design.json's knobs + THE USER'S LAYER, user.json)
 *   POST /api/design/tweaks {host, dir, values?: {<id>: value | null}, reset?} → {ok, set, values} — the hub writes
 *                                                user.json (atomic, a plain file in the registered folder) and says
 *                                                `file-changed`: every window restyles its frames
 *   POST /api/design/tweaks/request {sessionId, host, dir, text?} → {ok, delivered} — "+ Tweaks": ONE `[Design tweaks]`
 *                                                line through the comment's own sender
 *   GET  /api/design/systems                   → {systems: [{id, name, host, dir}], defaultSystem} — the chip's
 *                                                "Design system" select (lane design-systems-home)
 *   POST /api/design/rename {host, dir, title}  → {ok, design} — the home's Rename (the registry row only)
 *   POST /api/design/unlist {host, dir}         → {ok} — the home's "Remove from the list" (the folder stays)
 * AGENT (vsst_ session / jbt_ job token; the folder is on the CALLER's machine — its host is the session's):
 *   POST /api/agent/design/register {dir, title, kind?} → registers + pushes `design-open` (the openSpec) to the
 *                                                    owning session's clients: the window opens / comes to the front;
 *                                                    kind 'system' = a design system (the CLI saw system.md + tokens.css)
 *   GET  /api/agent/design/systems                → {systems: [{name, host, dir}], defaultSystem} (names belted)
 *   GET  /api/agent/design/system?name=           → {system: {name, host, dir}, tokens, viaDefault} — ONE registered
 *                                                    system's tokens.css for `new --system` (name '' = the default);
 *                                                    the CLI writes the copy, the hub writes nothing
 *   POST /api/agent/design/changed  {dir, files}  → the notify rung (`file-changed` per file)
 *   POST /api/agent/design/check    {dir}         → the hub's read, the AGENT's view (verdicts + words, every string
 *                                                    a file wrote through THE belt; never the HTML)
 *   POST /api/agent/design/publish  {dir, public?, page?} → the published-pages store (the CLI's `publish` asks
 *                                                    first — src/agent-tool-rules.js)
 *   GET  /api/agent/designs                       → this conversation's designs + each one's page
 *   POST /api/agent/design/ask      {dir, questions} → the questions wait on the caller's OWN design (`not_yours`
 *                                                    otherwise) + `design-open`: the window comes forward with the sheet
 *   POST /api/agent/design/preview  {dir, file}   → {path, w, h, expiresAt}: a 15-minute address for the agent's browser
 *   GET  /api/agent/design/preview?dir=&file=     → one artboard (images inlined) under the published pages' sandbox
 *                                                    CSP — with the bearer, or `?t=<ticket>` from the POST (a browser
 *                                                    carries no bearer); a folder that is not registered serves nothing
 */
const { STATUS } = require('../server/design-engine.js');
const { addressableId } = require('../claude-lock-capture.js');
const { sameToken } = require('../pairing-token.js'); // B-8dda (lane agent-cli-fixes): a raw secret is compared in constant time
const { CSP: PAGE_CSP, injectShim } = require('../server/published-pages.js'); // lane design-ask: the preview is sandboxed exactly like a published page
const { contentDisposition } = require('../file-disposition.js'); // lane design-present: the download's name, both forms

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
  app.post('/api/design/changes', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = body(req);
    try { answer(res, design.changes({ sessionId: b.sessionId, host: b.host || null, dir: b.dir || '', items: b.items })); }
    catch (e) { res.status(500).json({ error: e.message, code: 'send_failed' }); }
  });
  // ── lane design-systems-home: the systems select + the home's acts (the registry only — never a file) ──
  app.get('/api/design/systems', (req, res) => {
    if (!ownerOnly(req, res)) return;
    res.json({ systems: design.systems(), defaultSystem: design.defaultSystem() });
  });
  app.post('/api/design/rename', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = body(req);
    answer(res, design.rename({ host: b.host || null, dir: b.dir || '', title: b.title }));
  });
  app.post('/api/design/unlist', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = body(req);
    answer(res, design.unlist({ host: b.host || null, dir: b.dir || '' }));
  });
  app.post('/api/design/publish', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = body(req);
    const row = design.find(b.host || null, b.dir);
    try {
      answer(res, await design.publish({ host: b.host || null, dir: b.dir, title: b.title, makePublic: b.public === undefined ? undefined : !!b.public, sessionId: row ? row.sessionId : null, conversationId: row ? row.conversationId : null, req }));
    } catch (e) { res.status(500).json({ error: e.message, code: 'publish_failed' }); }
  });

  app.get('/api/design/bundle', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    try {
      const r = await design.bundle(req.query.host || null, String(req.query.dir || ''));
      if (!r || !r.ok) return answer(res, r);
      const stem = String(r.read.dir || '').replace(/\/+$/, '').split('/').pop() || 'design';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', contentDisposition(stem + '.html', 'attachment'));
      res.setHeader('Content-Security-Policy', PAGE_CSP); // opened in place by mistake it is still a sandboxed page, never the app's origin
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      res.send(r.html);
    } catch (e) { res.status(500).json({ error: e.message, code: 'read_failed' }); }
  });

  // ── agent ──
  app.post('/api/agent/design/register', (req, res) => {
    const a = agentCaller(req, res); if (!a) return;
    const b = body(req);
    const r = design.register({ host: a.host, dir: b.dir, title: b.title, sessionId: a.sessionId, conversationId: a.conversationId, kind: b.kind === 'system' || b.kind === 'design' ? b.kind : null });
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
  // ── lane design-ask: ask first + the visual check ──
  app.get('/api/design/ask', (req, res) => {
    if (!ownerOnly(req, res)) return;
    answer(res, design.pendingAsk(req.query.host || null, String(req.query.dir || '')));
  });
  app.post('/api/design/answers', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = body(req);
    try { answer(res, design.answer({ host: b.host || null, dir: b.dir || '', askId: b.askId, skip: b.skip === true, answers: b.answers })); }
    catch (e) { res.status(500).json({ error: e.message, code: 'send_failed' }); }
  });
  // ── lane design-tweaks: the free knobs (the user's layer is written by the hub, on the owner's act only) ──
  app.get('/api/design/tweaks', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    try { answer(res, await design.tweaks(req.query.host || null, String(req.query.dir || ''))); }
    catch (e) { res.status(500).json({ error: e.message, code: 'read_failed' }); }
  });
  app.post('/api/design/tweaks', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = body(req);
    try { answer(res, await design.setTweaks({ host: b.host || null, dir: b.dir || '', values: b.values === undefined ? {} : b.values, reset: b.reset === true })); }
    catch (e) { res.status(500).json({ error: e.message, code: 'write_failed' }); }
  });
  app.post('/api/design/tweaks/request', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const b = body(req);
    try { answer(res, design.requestTweaks({ sessionId: b.sessionId, host: b.host || null, dir: b.dir || '', text: b.text === undefined ? '' : b.text })); }
    catch (e) { res.status(500).json({ error: e.message, code: 'send_failed' }); }
  });
  app.post('/api/agent/design/ask', (req, res) => {
    const a = agentCaller(req, res); if (!a) return;
    const b = body(req);
    const r = design.ask({ host: a.host, dir: b.dir, sessionId: a.sessionId, conversationId: a.conversationId, questions: b.questions });
    if (!r.ok) return answer(res, r);
    let opened = false;
    if (a.session && a.sessionId) { try { design.openOn(a.session, a.sessionId, r.design); opened = true; } catch { opened = false; } }
    res.json({ ok: true, ask: r.ask, opened });
  });
  app.post('/api/agent/design/preview', async (req, res) => {
    const a = agentCaller(req, res); if (!a) return;
    const b = body(req);
    try {
      const r = await design.previewLink(a.host, b.dir, b.file);
      if (!r.ok) return answer(res, r);
      res.json({ ok: true, path: '/api/agent/design/preview?t=' + r.ticket, file: r.file, w: r.w, h: r.h, expiresAt: r.expiresAt });
    } catch (e) { res.status(500).json({ error: e.message, code: 'read_failed' }); }
  });
  app.get('/api/agent/design/preview', async (req, res) => {
    let r;
    try {
      if (req.query.t !== undefined && !(req.headers && req.headers.authorization)) r = await design.previewByTicket(String(req.query.t));
      else { const a = agentCaller(req, res); if (!a) return; r = await design.preview(a.host, String(req.query.dir || ''), String(req.query.file || '')); }
    } catch (e) { return res.status(500).json({ error: e.message, code: 'read_failed' }); }
    if (!r.ok) return answer(res, r);
    // the artboard is agent-written HTML on the APP origin: the published pages' sandbox CSP (an opaque origin — no
    // cookie, no /api reach) and their storage shim, never cached, never a referrer
    res.setHeader('Content-Security-Policy', PAGE_CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.type('html');
    res.send(injectShim(Buffer.from(r.html, 'utf8')));
  });
  app.get('/api/agent/design/systems', (req, res) => {
    const a = agentCaller(req, res); if (!a) return;
    res.json(design.agentSystems());
  });
  app.get('/api/agent/design/system', async (req, res) => {
    const a = agentCaller(req, res); if (!a) return;
    try { answer(res, await design.agentSystemTokens(String(req.query.name || ''))); }
    catch (e) { res.status(500).json({ error: e.message, code: 'read_failed' }); }
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
