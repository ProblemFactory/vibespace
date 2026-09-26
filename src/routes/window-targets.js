'use strict';
/**
 * WINDOW-TARGET ROUTES — the agent face of `vibespace-window` (design §5.1.1,
 * P9 first half, 2026-09-21). Thin: every decision is the engine's
 * (src/server/window-targets-engine.js); a route maps a code to a status.
 * AGENT only (Bearer `vsst_`, auth-exempt under /api/agent/ like the browser
 * family) — the user-facing half (the panel, the live pane) is P9's second
 * half. Every route takes `host` and REFUSES a non-local one by name (400
 * `unsupported-host`): windows are local-only in this version, and
 * `hostId` is a parameter, never a silent local fallback.
 *
 *   GET  /api/agent/window/targets                 the rows I may address + the verb verdicts + the probe
 *   POST /api/agent/window/open      {appId, label?}   start a REGISTRY app on a private display, attach (`exec`/`args`/`cwd` ⇒ 403 exec_is_human: an exec is the user's, §5;
 *                                                     a BROWSER row, or `url`/`keepProfile` ⇒ 403 browser_is_human: the desktop-app browser is the user's, B-bfe6)
 *   POST /api/agent/window/attach    {handle}      lane E (D1): a window NOT SHARED with this session ⇒ 403 not_exposed (snapshot / act /
 *                                                  screenshot / watch / detach refuse it the same; `targets` lists only shared windows);
 *                                                  a shared desktop-app BROWSER attaches like any app (D4; T6's attach refusal retired) —
 *                                                  the answer names the share's MODE (D7: auto resolves here — tree | pixels + why)
 *   POST /api/agent/window/detach    {handle}
 *   POST /api/agent/window/snapshot  {handle, budget?, text?}
 *   POST /api/agent/window/act       {handle, verb: click|type|key|scroll, ref?, at?, text?, replace?, chord?, action?, button?, direction?, by?}
 *                                                  (lane E verify r2: an injection the user's takeover / a revoke cut short answers
 *                                                  409 window_paused / 403 not_exposed WITH `did: {partial: true}`; a Task Group
 *                                                  store that cannot be read ⇒ 503 reach_unreadable, the lease kept)
 *                                                  (lane E: a tree verb under a pixel share ⇒ 409 mode_pixels; a pixel verb on an xpra
 *                                                  window nobody has open ⇒ 409 window_not_visible; --at outside the image ⇒ 400 outside_window)
 *   GET  /api/agent/window/screenshot?handle=   image/png (the temp file is removed once sent); `X-Window-Shot` = {handle, w, h,
 *                                                  originX, originY, coords: 'window'|'display', scale, windows, blank} — lane E: the
 *                                                  image is the app's OWN windows and `--at x,y` is a pixel of it
 *   POST /api/agent/window/watch     {handle}
 *
 * P10 (design §7.6 tier 3 / §6.6, D27 (b)) — the USER'S side of the other
 * class, cookie-authed (NOT under /api/agent/): the switch's state and the
 * agent leases on their real desktop, and their pause / resume — the SAME
 * takeover verdicts a window-live pane uses (`window_paused` for the agent):
 *   GET  /api/window/desktop                       {enabled, setting, leases:[…], note}
 *   POST /api/window/desktop/:handle/pause  {viewerId?}   → engine.takeover
 *   POST /api/window/desktop/:handle/resume {viewerId?}   → engine.handback (explicit)
 */
const express = require('express');
const fs = require('fs');
const DESK = require('../window-desktop');
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }

const LOCAL = new Set(['', 'local']);
function hostOf(req) { const h = (req.method === 'GET' ? req.query.host : req.body?.host); return h == null ? '' : String(h); }
function refuseHost(req, res) {
  const h = hostOf(req);
  if (LOCAL.has(h)) return false;
  res.status(400).json({ error: `window targets are local-only in this version — host ${JSON.stringify(h)} refused`, code: 'unsupported-host' });
  return true;
}
const STATUS = {
  'not-found': 404, not_attached: 404, ref_unknown: 404, app_gone: 404,
  'bad-request': 400, bad_chord: 400, action_unknown: 400, 'unsupported-host': 400, 'exec-not-found': 400, 'cwd-missing': 400, 'needs-wayland': 400,
  window_leased: 409, window_paused: 409, node_has_no_action: 409, node_not_editable: 409, no_focused_node: 409, ref_stale: 409, no_injection_backend: 409, action_refused: 409, cap: 409, 'no-backend': 409, 'backend-not-wired': 409, 'no-display': 409,
  a11y_unavailable: 503, helper_missing: 503, python3_missing: 503, screenshot_unavailable: 503,
  no_utf8_locale: 503, // lane E verify r3 (F3): a non-ASCII text typed as keys, and no UTF-8 locale loads here — nothing was typed
  helper_timeout: 504, helper_error: 502, action_failed: 502, ref_unreadable: 502, inject_failed: 502, screenshot_failed: 502,
  // P10 — the desktop class (src/window-desktop.js REFUSALS) + the user's pause/resume verdicts
  desktop_consent_off: 403, provider_needs_consent: 403, escalation_needs_user: 403, exec_is_human: 403,
  // takeover C3 (T6) → lane E (D4): `open` of a desktop-app BROWSER row (or url / keepProfile) stays the user's act;
  // a browser the USER shares is a target like any app
  browser_is_human: 403,
  // lane E (src/window-reach.js REFUSALS): reach, the share mode, the pixel road, the user's share routes
  not_exposed: 403, agent_forbidden: 403, mode_pixels: 409, window_not_visible: 409, wake_paced: 409, no_conversation: 409, not_live: 404,
  reach_unreadable: 503, // lane E verify r2 (L4): the Task Group store could not be read — try again (the lease is kept)
  outside_window: 400, bad_principal: 400, bad_mode: 400, share_local_only: 400,
  desktop_injection_refused: 409, no_live_view: 409, tier3_is_a_window_target: 409, no_lease: 409, held: 409, not_taken: 409,
  desktop_window_gone: 404,
  capture_needs_portal: 503, capture_unavailable: 503,
};
function fail(res, e) {
  const code = e?.code || null;
  const body = { error: String(e?.message || e), code };
  for (const k of ['node', 'backends', 'holder', 'since', 'takenAt', 'setting', 'verb', 'class', 'origin', 'yourDesktop', 'lease', 'handle', 'mode', 'resolvedMode', 'plan', 'nodes', 'did', 'reason']) if (e && e[k] !== undefined) body[k] = e[k]; // `did` (r2, L5): {partial:true} — a cancelled act that may have partly landed; `reason` (mirror red on 2.369.181): {code, why} — what an auto snapshot saw when it folded an unreachable tree into mode_pixels
  res.status(STATUS[code] || 500).json(body);
}
function engineOr503(res) {
  if (ctx?.engine) return ctx.engine;
  res.status(503).json({ error: 'window targets are not available in this process', code: 'no-engine' });
  return null;
}
function agentFacts(req, res, engine) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
  if (!token || !String(token).startsWith('vsst_')) { res.status(401).json({ error: 'missing session token', code: 'unauthorized' }); return null; }
  const f = engine.factsForToken(token);
  if (!f) { res.status(401).json({ error: 'unknown session token', code: 'unauthorized' }); return null; }
  return f;
}
const HANDLE_RE = /^[A-Za-z0-9._-]{1,80}$/;
function handleOf(req, res) {
  const h = String((req.method === 'GET' ? req.query.handle : req.body?.handle) || '');
  if (!HANDLE_RE.test(h)) { res.status(400).json({ error: 'handle required (`vibespace-window list`)', code: 'bad-request' }); return null; }
  return h;
}

router.get('/api/agent/window/targets', async (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  const f = agentFacts(req, res, engine); if (!f) return;
  try { res.json(await engine.list(f)); } catch (e) { fail(res, e); }
});
router.post('/api/agent/window/open', async (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  const f = agentFacts(req, res, engine); if (!f) return;
  try { res.json(await engine.open(req.body || {}, f)); } catch (e) { fail(res, e); }
});
router.post('/api/agent/window/attach', async (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  const f = agentFacts(req, res, engine); if (!f) return;
  const h = handleOf(req, res); if (!h) return;
  // lane E (D7): the attach answers the share's mode — auto is resolved here (a probe of the app's tree)
  try { res.json(typeof engine.attachWithMode === 'function' ? await engine.attachWithMode(h, f) : engine.attach(h, f)); } catch (e) { fail(res, e); }
});
router.post('/api/agent/window/detach', (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  const f = agentFacts(req, res, engine); if (!f) return;
  const h = handleOf(req, res); if (!h) return;
  try { res.json(engine.detach(h, f)); } catch (e) { fail(res, e); }
});
router.post('/api/agent/window/snapshot', async (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  const f = agentFacts(req, res, engine); if (!f) return;
  const h = handleOf(req, res); if (!h) return;
  try { res.json(await engine.snapshot(h, f, { budget: req.body?.budget, text: req.body?.text !== false })); } catch (e) { fail(res, e); }
});
router.post('/api/agent/window/act', async (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  const f = agentFacts(req, res, engine); if (!f) return;
  const h = handleOf(req, res); if (!h) return;
  try { res.json(await engine.act(h, f, req.body || {})); } catch (e) { fail(res, e); }
});
router.get('/api/agent/window/screenshot', async (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  const f = agentFacts(req, res, engine); if (!f) return;
  const h = handleOf(req, res); if (!h) return;
  try {
    const r = await engine.screenshot(h, f);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Window-Shot', JSON.stringify({ handle: r.handle, w: r.w, h: r.h, x: r.x, y: r.y, originX: r.originX ?? r.x, originY: r.originY ?? r.y, coords: r.coords || 'display', scale: r.scale || 1, windows: r.windows ?? null, blank: !!r.blank, cropped: r.cropped }));
    const s = fs.createReadStream(r.file);
    const done = () => { try { fs.unlinkSync(r.file); } catch { /* gone */ } };
    s.on('close', done); s.on('error', (e) => { done(); if (!res.headersSent) fail(res, e); else res.end(); });
    s.pipe(res);
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/window/watch', (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  const f = agentFacts(req, res, engine); if (!f) return;
  const h = handleOf(req, res); if (!h) return;
  try { res.json(engine.watch(h, f)); } catch (e) { fail(res, e); }
});

// ── P10: the user's side of the desktop class (cookie auth by mount position — not an agent route) ──
const VIEWER_RE = /^[A-Za-z0-9._:-]{1,64}$/;
function desktopHandleOf(req, res) {
  const h = String(req.params.handle || '');
  if (!DESK.isDesktopHandle(h)) { res.status(400).json({ error: `${JSON.stringify(h)} is not a desktop window handle (dw-<pid>)`, code: 'bad-request' }); return null; }
  return h;
}
router.get('/api/window/desktop', (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  try {
    engine.enforceConsent();
    const enabled = engine.desktopEnabled();
    res.json({ enabled, setting: DESK.SETTING_KEY, leases: engine.desktopLeases(), idleMs: engine.takeoverIdleMs(), note: enabled ? 'agents may address applications on your real desktop (marked rows); pausing one refuses its verbs with window_paused until you resume; turning the switch off drops every such lease at once' : DESK.consentVerdict({ enabled: false }).why });
  } catch (e) { fail(res, e); }
});
router.post('/api/window/desktop/:handle/pause', (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  const h = desktopHandleOf(req, res); if (!h) return;
  const viewerId = req.body?.viewerId != null && VIEWER_RE.test(String(req.body.viewerId)) ? String(req.body.viewerId) : 'user';
  try { const r = engine.takeover({ handle: h, viewerId, holderAlive: true }); if (!r.ok) return fail(res, { code: r.code, message: r.error }); res.json({ ok: true, already: !!r.already, lease: r.lease }); } catch (e) { fail(res, e); }
});
router.post('/api/window/desktop/:handle/resume', (req, res) => {
  if (refuseHost(req, res)) return;
  const engine = engineOr503(res); if (!engine) return;
  const h = desktopHandleOf(req, res); if (!h) return;
  const viewerId = req.body?.viewerId != null && VIEWER_RE.test(String(req.body.viewerId)) ? String(req.body.viewerId) : null;
  try { const r = engine.handback({ handle: h, viewerId, cause: 'explicit' }); if (!r.ok) return fail(res, { code: r.code, message: r.error }); res.json({ ok: true, cause: r.cause, heldMs: r.heldMs, byHolder: r.byHolder, lease: r.lease }); } catch (e) { fail(res, e); }
});

module.exports = { router, setup, STATUS };
