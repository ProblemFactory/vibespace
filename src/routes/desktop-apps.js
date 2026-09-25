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
 *                                     not-ready / not-xpra 409 (relaunch-browser retired 2.369.176: a browser relaunches with its profile carried), bad-request 400
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
 *   GET  /api/desktop/machines               lane C2 (design-desktop-apps-seamless §3.5): the
 *                                     launch dialog's machine picker — this machine + every
 *                                     paired machine, each with the PURE picker verdict
 *                                     (`selectable`, `code`: ready | connect | offline |
 *                                     host_needs_daemon | no_x11) — greyed, never hidden
 *   GET  /api/desktop/install-plan?host=     the xpra INSTALL RUNG's plan for a machine (its facts +
 *                                     the PURE plan: source apt | xpra.org, the commands, canRun)
 *                                     — SHOWN before anything runs
 *   POST /api/desktop/install-xpra {host}    run it: NDJSON streamed back ({log} lines, then ONE
 *                                     {done} or {error, code, plan}); no passwordless sudo ⇒
 *                                     `no_sudo` by name with the commands to copy; macOS /
 *                                     Windows ⇒ `no_x11`; the install runs DETACHED on the
 *                                     machine (its log + pidfile in the machine's state dir —
 *                                     verify r2 F3/F4): a live one is RE-ATTACHED (a first
 *                                     `{reattached, pid, since}` line, then its log from the
 *                                     start), never a second apt; THIS hub following one ⇒
 *                                     `busy` 409 (held past a timed-out / link-lost run until
 *                                     the machine's facts say it is gone); `install_timeout` /
 *                                     `install_link_lost` / `install_unrecorded` by name
 *
 * `host` (lane C2): GET /api/desktop/apps and the launch take `host` (query /
 * body) and run on THAT machine through src/server/desktop-access.js — this
 * machine in-process, a paired machine through the `desktop-serve` agentd op,
 * an agent that predates the op refused `host_needs_daemon` by name (never a
 * silent local fallback). Every other route names a record by its id, which
 * resolves on whichever machine holds it. EVERY failure answers
 * `{ error, code }`: fetchJson never throws, so a route that returned
 * 200-with-nothing would be a silent failure of a user action.
 */
const express = require('express');
const { streamKindOf } = require('../desktop-apps');
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }

const LOCAL = new Set(['', 'local']);
const HOST_RE = /^[A-Za-z0-9._-]{1,80}$/;
function hostOf(req) { const h = (req.method === 'GET' ? req.query.host : req.body?.host); return h == null ? '' : String(h); }
/** lane C2: the machine a route runs on — '' / 'local' = this machine; anything else must LOOK like a host id (the
 *  access layer then refuses an unknown one by name). A bad shape answers 400 and returns null. */
function hostParam(req, res) {
  const h = hostOf(req);
  if (LOCAL.has(h)) return 'local';
  if (!HOST_RE.test(h)) { res.status(400).json({ error: `bad host ${JSON.stringify(h.slice(0, 40))}`, code: 'bad-request' }); return null; }
  return h;
}
/** The launch body without the routing field (the machine is not part of the app's request). */
function bodyOf(req) { const b = { ...(req.body || {}) }; delete b.host; return b; }
function fail(res, e) {
  const code = e?.code || null;
  const status = code === 'not-found' ? 404 : code === 'bad-request' || code === 'exec-not-found' || code === 'cwd-missing' || code === 'needs-wayland' || code === 'bad-url' || code === 'not-a-browser' || code === 'automation-flag' || code === 'profile-not-owned' || code === 'profile-is-users' || code === 'unsupported-host' ? 400
    : code === 'cap' || code === 'no-backend' || code === 'backend-not-wired' || code === 'held' || code === 'not_taken' || code === 'no_lease' || code === 'not-xpra' || code === 'no_viewer' || code === 'not-ready' || code === 'relaunch-browser' || code === 'browser-absent' || code === 'snap-profile-unreachable'
      || code === 'host_needs_daemon' || code === 'no_x11' || code === 'no_apt' || code === 'no_repo' || code === 'no_sudo' || code === 'no_facts' || code === 'busy' ? 409
      : code === 'no-engine' || code === 'xpra-ui-unavailable' || code === 'host_unavailable' || code === 'install_link_lost' ? 503 : code === 'install_timeout' ? 504 : 500;
  res.status(status).json({ error: String(e?.message || e), code, ...(e && e.plan ? { plan: e.plan } : {}) });
}
const ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

router.get('/api/desktop/apps', async (req, res) => {
  const host = hostParam(req, res); if (!host) return;
  try { res.json(host === 'local' ? await ctx.keeper.list() : await ctx.keeper.list({ host })); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps', async (req, res) => {
  const host = hostParam(req, res); if (!host) return;
  try { res.json(host === 'local' ? await ctx.keeper.launch(bodyOf(req)) : await ctx.keeper.launch(bodyOf(req), { host })); } catch (e) { fail(res, e); }
});
// lane C2: the machine picker, the install rung's plan, and the install itself (streamed)
router.get('/api/desktop/machines', async (req, res) => {
  try { res.json({ machines: ctx.access ? await ctx.access.machines() : [{ hostId: 'local', label: null, transport: 'local', link: 'online', connected: true, selectable: true, code: 'ready' }] }); } catch (e) { fail(res, e); }
});
router.get('/api/desktop/install-plan', async (req, res) => {
  const host = hostParam(req, res); if (!host) return;
  if (!ctx.access) return fail(res, { code: 'host_unavailable', message: 'the desktop access layer is not wired on this instance' });
  try { res.json(await ctx.access.installPlan(host)); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/install-xpra', async (req, res) => {
  const host = hostParam(req, res); if (!host) return;
  if (!ctx.access) return fail(res, { code: 'host_unavailable', message: 'the desktop access layer is not wired on this instance' });
  // ONE install per machine — the access layer owns the slot (it is held past a timed-out run until the child is
  // gone, which a per-request Set here could not see); asked BEFORE the stream starts so a busy machine answers 409
  const busy = typeof ctx.access.installBusy === 'function' ? ctx.access.installBusy(host) : null;
  if (busy) return fail(res, { code: 'busy', message: `an install is already running on this machine (started ${new Date(busy.since).toISOString()}) — wait for it to finish, then check again` });
  res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  const line = (o) => { try { res.write(JSON.stringify(o) + '\n'); } catch { /* the dialog closed */ } };
  let carry = '';
  const onData = (d) => { carry += Buffer.isBuffer(d) ? d.toString('utf8') : String(d); const parts = carry.split(/\r?\n/); carry = parts.pop(); for (const p of parts) line({ log: p.slice(0, 2000) }); if (carry.length > 4000) { line({ log: carry.slice(0, 2000) }); carry = ''; } };
  try {
    // a live install on that machine (a restarted hub, another tab's run) is RE-ATTACHED, never started twice — the
    // dialog says so before its log replays from the start (verify r2 F3 + F4)
    const onReattach = (o) => line({ reattached: true, pid: o && o.pid, since: o && o.since });
    const r = await ctx.access.installXpra(host, { onData, onReattach });
    if (carry) line({ log: carry });
    line({ done: true, installed: r.after && r.after.xpra, source: r.plan.source, hostId: r.hostId, reattached: !!r.reattached });
    try { ctx.keeper.facts?.({ fresh: true })?.catch?.(() => { }); } catch { /* the local ladder is re-read on the next list */ }
  } catch (e) {
    if (carry) line({ log: carry });
    line({ error: String(e?.message || e), code: e?.code || 'install_failed', ...(e && e.plan ? { plan: e.plan } : {}) });
  } finally { try { res.end(); } catch { /* gone */ } }
});
router.get('/api/desktop/apps/:id', (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const r = ctx.keeper.get(req.params.id);
  if (!r) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  res.json(r);
});
router.post('/api/desktop/apps/:id/stop', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json(await ctx.keeper.stop(req.params.id, { why: 'user' })); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps/:id/keep-alive', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json(await ctx.keeper.keepAlive(req.params.id)); } catch (e) { fail(res, e); } // a paired machine's answers through the op (async)
});

router.post('/api/desktop/apps/:id/relaunch', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json(await ctx.keeper.relaunch(req.params.id, req.body || {})); } catch (e) { fail(res, e); }
});

// P8-2: the app's windows on its display — an on-demand snapshot (two spawns),
// never a poll; the LIVE title/icon a window shows ride the picture protocol
router.get('/api/desktop/apps/:id/windows', async (req, res) => {
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
const XPRA_UI_TYPES = Object.freeze({ js: 'application/javascript', mjs: 'application/javascript', html: 'text/html', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', ico: 'image/x-icon', wasm: 'application/wasm', txt: 'text/plain', map: 'application/json', woff: 'font/woff', woff2: 'font/woff2' });
async function xpraUiGate(req, res) {
  const m = XPRA_UI_RE.exec(req.path);
  if (!m) { res.status(404).json({ error: 'not a desktop route', code: 'not-found' }); return null; }
  const id = m[1];
  const rec = ctx.keeper.get(id);
  if (!rec) { res.status(404).json({ error: `no desktop app ${id}`, code: 'not-found' }); return null; }
  if (streamKindOf(rec) !== 'xpra') { fail(res, { code: 'not-xpra', message: `desktop app ${id} runs on ${rec.backend} — the xpra client cannot show it` }); return null; }
  let www = null;
  try { www = ctx.keeper.xpraWwwFor ? await ctx.keeper.xpraWwwFor(id) : { hostId: 'local', dir: await ctx.keeper.xpraWww() }; } catch { www = null; }
  if (!www || !www.dir) { fail(res, { code: 'xpra-ui-unavailable', message: 'the installed xpra ships no html5 client (no www/index.html found)' }); return null; }
  // lane C2: the hub's OWN xpra client when it has one; else the paired machine's tree, read through its agent
  return { id, rec, www: www.dir, wwwHost: www.hostId || 'local', rest: m[2] || '' };
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
  if (g.wwwHost !== 'local') { // a hub without xpra: the device's html5 client, read through its agent (a closed set of kinds)
    const ext = (/\.([a-z0-9]+)$/i.exec(g.rest) || [])[1];
    const type = ext ? XPRA_UI_TYPES[ext.toLowerCase()] : null;
    if (!type || !/^[A-Za-z0-9._/-]{1,200}$/.test(g.rest) || !ctx.access || typeof ctx.access.readFile !== 'function') { res.status(404).json({ error: `no such file in the xpra client: ${g.rest}`, code: 'not-found' }); return; }
    try { const data = await ctx.access.readFile(g.wwwHost, `${g.www.replace(/\/$/, '')}/${g.rest}`); res.type(type).send(data); }
    catch (e) { res.status(e && e.code === 'host_unavailable' ? 503 : 404).json({ error: `${g.rest}: ${e && e.message}`, code: e && e.code === 'host_unavailable' ? 'host_unavailable' : 'not-found' }); }
    return;
  }
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
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const engine = engineOr503(res); if (!engine) return;
  const r = ctx.keeper.get(req.params.id);
  if (!r) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  try { res.json({ id: r.id, origin: engine.ORIGIN, lease: engine.leaseOf(r.id), idleMs: engine.takeoverIdleMs() }); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps/:id/takeover', (req, res) => {
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
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (!ctx.keeper.get(req.params.id)) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  res.json(ctx.keeper.viewersView(req.params.id));
});
router.post('/api/desktop/apps/:id/viewers/takeover', (req, res) => {
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
