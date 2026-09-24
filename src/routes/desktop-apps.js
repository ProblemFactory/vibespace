'use strict';
/**
 * DESKTOP-APP ROUTES (docs/design-desktop-apps.zh.md §2 row 5; P8-1,
 * 2026-09-13). Thin: validation lives in src/desktop-apps.js (PURE), the
 * lifecycle in src/server/desktop-app-keeper.js; a route decides nothing.
 *
 *   GET  /api/desktop/apps            registry (+ availability per row) + live
 *                                     sessions + the backend ladder with its
 *                                     reasons + the cap
 *   POST /api/desktop/apps            { appId, url?, keepProfile? } | { exec, args?, cwd?, label? }
 *                                     (B-bfe6: `url` / `keepProfile` for a BROWSER row only —
 *                                     bad-url / not-a-browser 400, browser-absent /
 *                                     snap-profile-unreachable 409, each by name)
 *   GET  /api/desktop/apps/:id
 *   POST /api/desktop/apps/:id/stop
 *   POST /api/desktop/apps/:id/keep-alive   ("keep running" = one explicit action, §5)
 *   POST /api/desktop/apps/:id/relaunch     round 3 A3: `{ scale: 'auto'|1|1.5|2, dpr?, uiScale? }` — the
 *                                     same app started again at that scale (auto = derived from
 *                                     THIS client's dpr × uiScale), the old session stopped with
 *                                     `replacedBy` naming the new one → `{ app, replaced }`;
 *                                     not-ready / not-xpra / relaunch-browser 409, bad-request 400
 *   GET  /api/vnc/status · POST /api/vnc/start   the singleton desktop's two
 *                                     routes (moved from server.js — same
 *                                     answers, one home for desktop routes)
 *   GET  /api/desktop/apps/:id/windows       P8-2: the app's windows on its display
 *                                     (title / class / geometry — the on-demand
 *                                     snapshot; the live title rides the picture)
 *   GET  /api/desktop/:id/xpra-ui/           P8-2, D21 (c) (a) THE VALIDATION SLICE:
 *   GET  /api/desktop/:id/xpra-ui/*          the UPSTREAM xpra html5 client, served
 *                                     from the installed xpra's www tree behind
 *                                     VibeSpace's cookie auth (nosniff, no listing,
 *                                     no dotfiles), the bare dir REDIRECTING to
 *                                     index.html with the client's `path` set to
 *                                     OUR relay (/api/desktop/<id>/stream) — the
 *                                     raw xpra port never reaches a browser;
 *                                     `?netem=rtt:200,kbps:1000` is remembered
 *                                     for the id ONLY under VIBESPACE_DESKTOP_NETEM=1;
 *                                     its socket names no viewer (the page strips
 *                                     `?`/`=`/`&` from `path`), so since 2.369.156
 *                                     it is a read-only WATCH seat — never elected
 *   GET  /api/desktop/apps/:id/lease         P9b (design-agent-browser-v2 §4.3 /
 *   POST /api/desktop/apps/:id/takeover      §6.6): the agent lease on this
 *   POST /api/desktop/apps/:id/handback      window and the user's two moves
 *                                     on it — `{viewerId}` is the live view's
 *                                     own id (the one it put on its stream
 *                                     upgrade); decided by the window-targets
 *                                     engine, the ONE owner of lease.input
 *                                     (a takeover also makes that viewer the
 *                                     ACTIVE one — x5)
 *   GET  /api/desktop/apps/:id/viewers        P8-2 x5 (design §7 P8-2 "x5 多客户端 =
 *   POST /api/desktop/apps/:id/viewers/takeover  单活跃 viewer"): who watches the
 *                                     window and which pane is ACTIVE (the
 *                                     `desktop-app-viewers` payload — panes by
 *                                     their public key, never a socket's id);
 *                                     "Resume here" = `{viewerId}` (the pane's
 *                                     live socket id) becomes the active viewer
 *                                     — through the engine's human takeover when
 *                                     an agent holds the window (a takeover held
 *                                     by another human moves WITHOUT a handback:
 *                                     nothing is announced, nothing billed),
 *                                     else a plain swap; `no_viewer` 409 when
 *                                     that socket is not open
 *
 * EVERY route takes `host` (query or body) and REFUSES a non-local host by
 * name (v1 has no daemon op yet) — `hostId` is a parameter, never a silent
 * local fallback. EVERY failure answers `{ error, code }`: fetchJson never
 * throws, so a route that returned 200-with-nothing would be a silent failure
 * of a user action.
 */
const express = require('express');
const { streamKindOf } = require('../desktop-apps');
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
  const status = code === 'not-found' ? 404 : code === 'bad-request' || code === 'exec-not-found' || code === 'cwd-missing' || code === 'needs-wayland' || code === 'bad-url' || code === 'not-a-browser' || code === 'automation-flag' || code === 'profile-not-owned' || code === 'profile-is-users' ? 400
    : code === 'cap' || code === 'runaway-parked' || code === 'no-backend' || code === 'backend-not-wired' || code === 'held' || code === 'not_taken' || code === 'no_lease' || code === 'not-xpra' || code === 'no_viewer' || code === 'not-ready' || code === 'relaunch-browser' || code === 'browser-absent' || code === 'snap-profile-unreachable' ? 409
      : code === 'no-engine' || code === 'xpra-ui-unavailable' ? 503 : 500;
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

router.post('/api/desktop/apps/:id/relaunch', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json(await ctx.keeper.relaunch(req.params.id, req.body || {})); } catch (e) { fail(res, e); }
});

// P8-2: the app's windows on its display — an on-demand snapshot (two spawns),
// never a poll; the LIVE title/icon a window shows ride the picture protocol
router.get('/api/desktop/apps/:id/windows', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json(await ctx.keeper.windows(req.params.id)); } catch (e) { fail(res, e); }
});

// P8-2, D21 (c) (a) — THE HOSTED UPSTREAM CLIENT. Auth is the app-level cookie
// middleware every /api route sits behind (server.js mounts auth.middleware()
// before any router); the tree is the installed package's own files, served
// with express.static's listing/redirect/dotfiles all OFF and nosniff on every
// answer. The bare dir composes the client's parameters server-side: `path`
// = OUR relay for THIS id (the client concatenates ws://host + path, and its
// getstrparam FILTERS the value to [0-9A-Za-z _+-:/] — an id is [a-z0-9-] by
// construction), sound/printing/file transfer/remote logging off by name.
const XPRA_UI_RE = /^\/api\/desktop\/([A-Za-z0-9._-]{1,80})\/xpra-ui(?:\/(.*))?$/;
const xpraStatics = new Map(); // www dir → express.static handler
async function xpraUiGate(req, res) {
  const m = XPRA_UI_RE.exec(req.path);
  if (!m) { res.status(404).json({ error: 'not a desktop route', code: 'not-found' }); return null; }
  const id = m[1];
  const rec = ctx.keeper.get(id);
  if (!rec) { res.status(404).json({ error: `no desktop app ${id}`, code: 'not-found' }); return null; }
  if (streamKindOf(rec) !== 'xpra') { fail(res, { code: 'not-xpra', message: `desktop app ${id} runs on ${rec.backend} — the xpra client cannot show it` }); return null; }
  let www = null;
  try { www = await ctx.keeper.xpraWww(); } catch { www = null; }
  if (!www) { fail(res, { code: 'xpra-ui-unavailable', message: 'the installed xpra ships no html5 client (no www/index.html found)' }); return null; }
  return { id, rec, www, rest: m[2] || '' };
}
router.get(XPRA_UI_RE, async (req, res) => {
  const g = await xpraUiGate(req, res);
  if (!g) return;
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store');
  if (g.rest === '' || g.rest === undefined) {
    // dev-only: remember a netem spec for this id (the page cannot carry a query on the client's `path`)
    if (req.query.netem != null && ctx.stream) { const n = ctx.stream.setNetem(g.id, String(req.query.netem)); res.set('X-VibeSpace-Netem', ctx.stream.netemEnabled ? (n ? `rtt:${n.rttMs},kbps:${n.kbps}` : 'off') : 'disabled'); }
    const q = new URLSearchParams({ path: `/api/desktop/${g.id}/stream`, sound: 'false', printing: 'false', file_transfer: 'false', remote_logging: 'false', autohide: 'true', reconnect: 'true' });
    res.redirect(302, `/api/desktop/${g.id}/xpra-ui/index.html?${q.toString()}`);
    return;
  }
  if (/(^|\/)\.|\.\.|\0/.test(g.rest)) { res.status(404).json({ error: 'not found', code: 'not-found' }); return; }
  let handler = xpraStatics.get(g.www);
  if (!handler) { handler = express.static(g.www, { index: false, redirect: false, dotfiles: 'deny', etag: false, lastModified: false, maxAge: 0, fallthrough: true }); xpraStatics.set(g.www, handler); }
  req.url = '/' + g.rest; // the static handler sees the path under the www root
  handler(req, res, () => res.status(404).json({ error: `no such file in the xpra client: ${g.rest}`, code: 'not-found' }));
});

// P9b: the agent lease on a window + the user's takeover / handback (the
// engine decides; a refusal is typed — `held` when another viewer drives,
// `not_taken` when nobody does, `no_lease` when no agent holds the window)
const VIEWER_RE = /^[A-Za-z0-9._-]{1,64}$/;
function engineOr503(res) { if (ctx?.windowEngine) return ctx.windowEngine; res.status(503).json({ error: 'window leases are not available in this process', code: 'no-engine' }); return null; }
router.get('/api/desktop/apps/:id/lease', (req, res) => {
  if (refuseHost(req, res)) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const engine = engineOr503(res); if (!engine) return;
  const r = ctx.keeper.get(req.params.id);
  if (!r) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  try { res.json({ id: r.id, origin: engine.ORIGIN, lease: engine.leaseOf(r.id), idleMs: engine.takeoverIdleMs() }); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps/:id/takeover', (req, res) => {
  if (refuseHost(req, res)) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const engine = engineOr503(res); if (!engine) return;
  const viewerId = String(req.body?.viewerId || '');
  if (!VIEWER_RE.test(viewerId)) return res.status(400).json({ error: 'a takeover needs the viewer taking it (viewerId)', code: 'bad-request' });
  if (!ctx.keeper.get(req.params.id)) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  try {
    const r = engine.takeover({ handle: req.params.id, viewerId }); if (!r.ok) return fail(res, { code: r.code, message: r.error });
    const v = ctx.keeper.takeoverViewer ? ctx.keeper.takeoverViewer(req.params.id, viewerId) : null; // x5: the human who took over an agent's window is the ACTIVE viewer
    res.json({ ok: true, already: !!r.already, lease: r.lease, viewers: v && v.viewers ? v.viewers : (ctx.keeper.viewersView ? ctx.keeper.viewersView(req.params.id) : null) });
  } catch (e) { fail(res, e); }
});
// P8-2 x5: ONE active viewer per app window — who watches, and "Resume here"
router.get('/api/desktop/apps/:id/viewers', (req, res) => {
  if (refuseHost(req, res)) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (!ctx.keeper.get(req.params.id)) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  res.json(ctx.keeper.viewersView(req.params.id));
});
router.post('/api/desktop/apps/:id/viewers/takeover', (req, res) => {
  if (refuseHost(req, res)) return;
  const id = req.params.id;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const viewerId = String(req.body?.viewerId || '');
  if (!VIEWER_RE.test(viewerId)) return res.status(400).json({ error: 'Resume here needs the pane\'s viewer id (viewerId)', code: 'bad-request' });
  if (!ctx.keeper.get(id)) return res.status(404).json({ error: `no desktop app ${id}`, code: 'not-found' });
  if (ctx.stream && !ctx.stream.viewerAlive(id, viewerId)) return fail(res, { code: 'no_viewer', message: 'this pane is not connected to the app yet — wait for it to reconnect, then Resume here' });
  try {
    const engine = ctx.windowEngine || null;
    const lease = engine && typeof engine.leaseInput === 'function' ? engine.leaseInput(id) : null;
    let leaseView = null;
    if (lease) { // an agent holds the window: the engine's human takeover makes this viewer the holder (another human's hold moves, never handed back)
      const other = lease.input === 'user' && lease.holder && lease.holder !== viewerId;
      const r = engine.takeover({ handle: id, viewerId, ...(other ? { holderAlive: false } : {}) });
      if (!r.ok) return fail(res, { code: r.code, message: r.error });
      leaseView = r.lease;
    }
    const v = ctx.keeper.takeoverViewer(id, viewerId);
    if (!v.ok) return fail(res, { code: v.code, message: v.error });
    res.json({ ok: true, already: !!v.already, viewers: v.viewers, lease: leaseView || (engine ? engine.leaseOf(id) : null) });
  } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps/:id/handback', (req, res) => {
  if (refuseHost(req, res)) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const engine = engineOr503(res); if (!engine) return;
  const viewerId = req.body?.viewerId != null && VIEWER_RE.test(String(req.body.viewerId)) ? String(req.body.viewerId) : null;
  if (!ctx.keeper.get(req.params.id)) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  try { const r = engine.handback({ handle: req.params.id, viewerId, cause: 'explicit' }); if (!r.ok) return fail(res, { code: r.code, message: r.error }); res.json({ ok: true, cause: r.cause, heldMs: r.heldMs, byHolder: r.byHolder, lease: r.lease }); } catch (e) { fail(res, e); }
});

// the singleton desktop (src/vnc.js) — answers unchanged from server.js
router.get('/api/vnc/status', async (req, res) => {
  try { res.json(await ctx.vnc.status()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/api/vnc/start', async (req, res) => {
  try { res.json(await ctx.vnc.ensureRunning()); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router, setup };
