'use strict';
/**
 * AGENT FEEDBACK — THE ROUTES (lane agent-feedback; the model src/feedback-model.js, the store src/server/feedback-store.js).
 *
 * AGENT (Bearer vsst_ session / jbt_ job token — /api/agent/ is the auth layer's door; WHO is calling is the token's,
 * never the body's: the body carries text / about / kind only):
 *   POST /api/agent/feedback {text, about?, kind?} → {ok, report, duplicate, chars} — one report per 10 s per session
 *                                                     (429 `paced`, refused by name); a repeat of a report seen within
 *                                                     24 h bumps its count (`duplicate: true`)
 *   GET  /api/agent/feedback/mine                  → {reports} — this conversation's own reports (`vibespace-feedback list`);
 *                                                     lane feedback-forward-404: a report still on this instance carries
 *                                                     `forward` paused | waiting | dropped (the forwarder's `forwardOf`)
 * OWNER (the cookie — auth.middleware + the write-origin gate stand before every route; an agent's bearer is refused
 * by name: the sheet is the owner's):
 *   GET   /api/feedback                            → {reports (newest first), open, dropped}
 *   PATCH /api/feedback/:id {status: open|handled} → {ok, report}
 * THE MAINTAINER HUB (lane feedback-forward — the rules src/feedback-forward-model.js; the origin's side
 * src/server/feedback-forward.js). Another INSTANCE calls these, never a browser: the collector's shared Bearer token
 * (src/telemetry.js collectorVerdict — the /api/telemetry/ingest door's own: 404 while VIBESPACE_TELEMETRY_INGEST_TOKEN is
 * unset, 403 on a bad token) and then the caller's origin key (X-VibeSpace-Feedback-Origin; the hub keeps its hash only —
 * the fleet shares ONE token, so the key, not the token, names the instance):
 *   POST /api/feedback/forward {text, about, kind, at, count, session, group, harness, origin {instance, id, version}}
 *                                                  → {ok, id, duplicate} — the body (≤ 64 KB) is read only after the token;
 *                                                     stored through the belt; the same origin's same id again = duplicate
 *   GET  /api/feedback/forward/marks?since=N       → {marks: [{id (the origin's), status, version, note, by, at}], next, more}
 *                                                     — only the reports THIS origin key forwarded
 * The live copy every client draws is the `feedback` StateSync store (the store mirrors each change into it).
 */
const { sameToken } = require('../pairing-token.js'); // B-8dda: a raw secret is compared in constant time
const { addressableId } = require('../claude-lock-capture.js');
const express = require('express');
const FF = require('../feedback-forward-model.js');            // lane feedback-forward: the forward's rules
const { collectorVerdict } = require('../telemetry.js');      // the collector's ONE verdict (the ingest door's)
const { keyIdOf, HEADER } = require('../server/feedback-forward.js');

const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
const STATUS = { origin_key_bad: 400, origin_id_bad: 400, origin_instance_missing: 400, text_not_text: 400, text_missing: 400, text_too_long: 400, about_not_text: 400, about_too_long: 400, kind_unknown: 400, status_unknown: 400, paced: 429, not_found: 404, write_failed: 503 };
const answer = (res, r) => {
  if (r && r.ok) return res.json(r);
  if (r && r.retryAfterS) res.set('Retry-After', String(r.retryAfterS));
  return res.status(STATUS[r && r.code] || 400).json({ error: (r && r.error) || 'refused', code: (r && r.code) || 'refused', ...(r && r.retryAfterS ? { retryAfterS: r.retryAfterS } : {}) });
};

/** deps: store (feedback-store), activeSessions (Map), getJobs, groupOf(session, sessionId) → {id, name} | null,
 *  instance() → {name, version}; collectorToken() → the hub's VIBESPACE_TELEMETRY_INGEST_TOKEN ('' ⇒ the doors are off);
 *  selfKeyId() → this instance's own origin id (a forward from itself is answered `self` and kept once);
 *  forwardOf(id) → the report's forward state on this instance (lane feedback-forward-404) */
function registerFeedbackRoutes(app, { store, activeSessions, getJobs = () => null, groupOf = () => null, instance = () => ({}), collectorToken = () => '', selfKeyId = () => null, forwardOf = () => null }) {
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
      return { ids: [key, sid], facts: { session: { id: key, name: nameOf(s) || `job ${require('../job-model.js').labelVia(jm)(job) || job.id}` }, group: groupFor(s, sid), harness: s ? (s.backend || 'claude') : null, instance: instance() } };
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
    res.json({ reports: store.mine(c.ids).map((r) => { const f = forwardOf(r.id); return f ? { ...r, forward: f } : r; }) });
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
  // ── the maintainer hub: another instance (lane feedback-forward) — the collector's token, then the caller's origin key ──
  const collector = (req, res) => {
    const v = collectorVerdict(req.headers && req.headers.authorization, collectorToken());
    if (v.ok) { const ver = (instance() || {}).version; if (ver) res.set(FF.VERSION_HEADER, String(ver)); return true; }   // lane feedback-forward-404: the release, to a caller holding the token
    res.status(v.status).json({ error: v.error, code: v.status === 404 ? 'collector_disabled' : 'bad_token' });
    return false;
  };
  const originOf = (req, res) => {
    const k = String((req.headers && req.headers[HEADER.toLowerCase()]) || '');
    if (FF.KEY_RE.test(k)) return keyIdOf(k);
    res.status(400).json({ error: `the origin key is missing (${HEADER})`, code: 'origin_key_missing' });
    return null;
  };
  const forwardJson = express.json({ limit: FF.LIMITS.bodyMax });
  const readForward = (req, res, next) => forwardJson(req, res, (e) => (e ? res.status(e.status === 413 ? 413 : 400).json({ error: e.status === 413 ? `the report is over ${FF.LIMITS.bodyMax / 1024} KB` : 'the body is not JSON', code: e.status === 413 ? 'too_large' : 'body_bad' }) : next()));
  app.post('/api/feedback/forward', (req, res, next) => { if (collector(req, res)) readForward(req, res, next); }, (req, res) => {
    const key = originOf(req, res);
    if (!key) return;
    if (key === selfKeyId()) return res.json({ ok: true, self: true });   // a hub whose own target is itself: the report is here already
    const r = store.receive(body(req), { key });
    if (!r.ok) return answer(res, r);
    res.json({ ok: true, id: r.report.id, duplicate: r.duplicate });
  });
  app.get('/api/feedback/forward/marks', (req, res) => {
    if (!collector(req, res)) return;
    const key = originOf(req, res);
    if (!key) return;
    res.json(store.marks(key, Number(req.query && req.query.since) || 0));
  });
}

module.exports = { registerFeedbackRoutes };
