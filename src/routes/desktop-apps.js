'use strict';
/**
 * DESKTOP-APP ROUTES (docs/design-desktop-apps.zh.md §2 row 5; P8-1,
 * 2026-09-13). Thin: validation lives in src/desktop-apps.js (PURE), the
 * lifecycle in src/server/desktop-app-keeper.js; a route decides nothing.
 *
 *   GET  /api/desktop/apps            registry (+ availability per row) + live
 *                                     sessions + the backend ladder with its
 *                                     reasons + the cap
 *   POST /api/desktop/apps            { appId } | { exec, args?, cwd?, label? }
 *   GET  /api/desktop/apps/:id
 *   POST /api/desktop/apps/:id/stop
 *   POST /api/desktop/apps/:id/keep-alive   ("keep running" = one explicit action, §5)
 *   GET  /api/vnc/status · POST /api/vnc/start   the singleton desktop's two
 *                                     routes (moved from server.js — same
 *                                     answers, one home for desktop routes)
 *
 * EVERY route takes `host` (query or body) and REFUSES a non-local host by
 * name (v1 has no daemon op yet) — `hostId` is a parameter, never a silent
 * local fallback. EVERY failure answers `{ error, code }`: fetchJson never
 * throws, so a route that returned 200-with-nothing would be a silent failure
 * of a user action.
 */
const express = require('express');
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }

const LOCAL = new Set(['', 'local']);
function hostOf(req) { const h = (req.method === 'GET' ? req.query.host : req.body?.host); return h == null ? '' : String(h); }
function refuseHost(req, res) {
  const h = hostOf(req);
  if (LOCAL.has(h)) return false;
  res.status(400).json({ error: `desktop apps are local-only in v1 — host ${JSON.stringify(h)} refused`, code: 'unsupported-host' });
  return true;
}
function fail(res, e) {
  const code = e?.code || null;
  const status = code === 'not-found' ? 404 : code === 'bad-request' || code === 'exec-not-found' || code === 'cwd-missing' || code === 'needs-wayland' ? 400
    : code === 'cap' || code === 'runaway-parked' || code === 'no-backend' || code === 'backend-not-wired' ? 409 : 500;
  res.status(status).json({ error: String(e?.message || e), code });
}
const ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

router.get('/api/desktop/apps', async (req, res) => {
  if (refuseHost(req, res)) return;
  try { res.json(await ctx.keeper.list()); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps', async (req, res) => {
  if (refuseHost(req, res)) return;
  try { res.json(await ctx.keeper.launch(req.body || {})); } catch (e) { fail(res, e); }
});
router.get('/api/desktop/apps/:id', (req, res) => {
  if (refuseHost(req, res)) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const r = ctx.keeper.get(req.params.id);
  if (!r) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  res.json(r);
});
router.post('/api/desktop/apps/:id/stop', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json(await ctx.keeper.stop(req.params.id, { why: 'user' })); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps/:id/keep-alive', (req, res) => {
  if (refuseHost(req, res)) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json(ctx.keeper.keepAlive(req.params.id)); } catch (e) { fail(res, e); }
});

// the singleton desktop (src/vnc.js) — answers unchanged from server.js
router.get('/api/vnc/status', async (req, res) => {
  try { res.json(await ctx.vnc.status()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/api/vnc/start', async (req, res) => {
  try { res.json(await ctx.vnc.ensureRunning()); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router, setup };
