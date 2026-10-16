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
 *                                     + (both shapes) `dpr`, `uiScale`, and (lane D) `scaleChoice`:
 *                                     the app's default scale the person chose in the launch
 *                                     dialog (auto | 1 | 1.5 | 2 | 2.5 | 3 — the record's origin
 *                                     'app'); anything else 400 bad-request HERE, before a paired
 *                                     machine is asked (an older device drops an unknown field)
 *                                     + (lane launch-picture-size) `pin`: 'WxH' | null — the dialog's
 *                                     Picture size (src/desktop-pin.js SIZE_CHOICES); a bad size 400
 *                                     bad-size / size_out_of_bounds HERE, a rung that cannot hold it
 *                                     400 pin_unsupported (the machine's verdict, by name)
 *   GET  /api/desktop/apps/:id
 *   POST /api/desktop/apps/:id/stop        `{ force? }` — B-04da ④: a LibreOffice session is ASKED to quit first (its own
 *                                     save prompt); still asking ⇒ 409 `app-asked`, `force: true` = the person confirmed the loss
 *   POST /api/desktop/apps/:id/keep-alive   ("keep running" = one explicit action, §5)
 *   POST /api/desktop/apps/:id/relaunch     round 3 A3: `{ scale: 'auto'|1|1.5|2|2.5|3, dpr?, uiScale?, force? }` — the
 *                                     same app started again at that scale (auto = derived from
 *                                     THIS client's dpr × uiScale), the old session stopped with
 *                                     `replacedBy` naming the new one → `{ app, replaced }`;
 *                                     not-ready / not-xpra 409 (relaunch-browser retired 2.369.176: a browser relaunches with its profile carried), bad-request 400
 *   GET  /api/vnc/status · POST /api/vnc/start   the singleton desktop's two
 *                                     routes (moved from server.js — same
 *                                     answers, one home for desktop routes)
 *   GET  /api/desktop/apps/:id/windows       P8-2: the app's windows on its display — no client calls it: a TEST SEAM the heavy desktop suites read
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
 *   GET  /api/desktop/machine-desktop/apps?host=[&fresh=1]   lane machine-desktop-apps: a Windows / macOS machine's
 *                                     INSTALLED apps, listed on it by witness (people only) — {rows:[{name, launch,
 *                                     source, seenAt}], listedAt, total, truncated, code?}
 *   GET  /api/desktop/machine-desktop/remoteapp/setup?host=   lane remoteapp-r1b: the machine's RemoteApp settings card (people only) —
 *   POST /api/desktop/machine-desktop/remoteapp/setup {host, user, domain?, password?}   {setup: the sealed row's view: user, domain,
 *   POST /api/desktop/machine-desktop/remoteapp/trust {host}    which fields are SET, the pinned certFp — never a password}; `trust` =
 *   GET  /api/desktop/machine-desktop/remoteapp/facts?host=   the first connection (pins the certificate); `facts` = the machine's
 *                                     Remote Desktop facts ({ok, facts, rows, ready} | agent_too_old {have, need})
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
 *   LANE E (2026-09-25, docs/design-desktop-apps-seamless §3.6 — the owner's D1–D7; model src/window-reach.js,
 *   decided by the window-targets engine) — WHO MAY ADDRESS A WINDOW, and HOW. Cookie-authed like every route here,
 *   and HUMAN-ONLY: an agent's session / job token (`Bearer vsst_` / `jbt_`) is refused 403 `agent_forbidden` — a
 *   share is the user's act, never an agent's. A window on a PAIRED machine is not an agent target (lane C: the
 *   engine's world is this machine) ⇒ 400 `share_local_only`.
 *   GET    /api/desktop/apps/:id/reach            {handle, mode, rows:[{principal, by, grantedAt, live:[…]}], resolved,
 *                                                  summary, modeInfo, lease, browser, stream}
 *   POST   /api/desktop/apps/:id/reach  {principal:{kind:'session'|'group', id, name?}}   grant (a session by its live
 *                                                  id or its conversation key) — one row per principal
 *   DELETE /api/desktop/apps/:id/reach  {principal}   revoke that principal's row; a holder that no longer reaches the
 *                                                  window loses its lease at once (its next verb: not_exposed)
 *   PUT    /api/desktop/apps/:id/reach/mode {mode: auto|tree|pixels}   D7 — takes effect at the holder's next verb
 *   POST   /api/desktop/apps/:id/reach/request {sessionId, note?, wake?, endHold?}   D3 "Ask <agent> to take control":
 *                                                  grants the window to that agent, then the message rides its NEXT turn
 *                                                  (free) or — `wake` — a billed turn through the gated ladder
 *                                                  (spendReason window-share-request; refused ⇒ next turn, said why)
 *                                                  → {delivered:'woken'|'next-turn', why?, whyCode?, granted, endedHold}
 *   POST   /api/desktop/apps  {…, share:{principals, mode}}   D2 "before launch": applied to the new window
 *
 *   §7.9 OPEN WITH LIBREOFFICE (the owner's ruling 2026-09-27 ②; PURE src/office-open.js — the ONE verdict):
 *   POST /api/desktop/apps  {…, file, fileHost?}   a DOCUMENT opened in LibreOffice: `file` = its absolute path on
 *                                                  `fileHost` (default `host`); THE MACHINE RULE here, before any machine
 *                                                  is asked — the app runs where the file is (`machine-mismatch` 409),
 *                                                  `relative-path` / `not-office-file` / `not-office-app` 400; with no
 *                                                  `appId` the file's own module row is filled in; the machine runs the
 *                                                  verdict again with ITS catalog (`app-absent` 409 + `remedy`,
 *                                                  `file-missing` 404)
 *   GET  /api/desktop/open-with?host=&path=&app=[&peek=1]   the verdict for one file WITHOUT launching (the explorer's menu row;
 *                                                  `peek=1`: a paired machine not connected right now answers `unchecked` — a menu never connects):
 *                                                  `{ok, catalogId, module, label}` | `{ok:false, code, error, remedy?}`
 *                                                  — answered 200 either way (it is a question), the machine's catalog
 *                                                  read through the keeper (`host-unreachable` when it does not answer)
 *   GET  /api/desktop/install-plan?host=&what=     `what` = xpra (default) | a LibreOffice install (its catalog id)
 *   POST /api/desktop/install {host, what}         the SAME streamed install as install-xpra for any `what` (one install
 *                                                  slot per machine); a LibreOffice install ends `{done, what, available}`
 *                                                  only when the machine's catalog now serves the row, else ONE
 *                                                  `still-absent` error line by name
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
const RG = require('../app-kinds/registered.js'); // PURE — lane app-register-model: the owner's Adopt prefill
const express = require('express');
const { capsOf, scaleChoiceVerdict, relaunchLeaseVerdict, TIGHTVNC, machineDesktopId } = require('../desktop-apps');
const { INSTALL_WHATS, DEFAULT_INSTALL, installRow } = require('../installs'); // THE INSTALLABLES — the routes ask the row (lane dc-apps-rows)
/** design 014 D1: the whole-desktop refusals' statuses (by name, like every code below). */
const D014_STATUS = Object.freeze({ human_only: 403, no_vnc: 409, not_desktop_machine: 409, not_windows: 409, no_admin: 409, run_failed: 409, empty: 400, too_long: 400, multi_line: 400, hidden_chars: 400 });
const { pinVerdict, parsePin } = require('../desktop-pin'); // lane e2b (§E2.2): the window menu's Pin size… (the user pins any window); lane launch-picture-size: the launch's pin
const { openWithVerdict, installSpecFor, FONTS_ID } = require('../office-open'); // §7.9: the ONE open-with verdict
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }
/** Layer 0 apps: the hub's apps engine words an installed app's greyed row (restoring… after a rebuild) — set by
 *  src/server/apps-wiring.js; absent ⇒ the machine's own words. */
let appsEngine = null;
function setApps(engine) { appsEngine = engine || null; }

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
/** The launch body without the routing field (the machine is not part of the app's request) — nor the share (lane E:
 *  the user's exposure choice is applied by the window-targets engine once the window exists, never by the keeper). */
function bodyOf(req) { const b = { ...(req.body || {}) }; delete b.host; delete b.share; delete b.fileHost; return b; }
/** Lane E: a share is the USER's act — an agent's session / job token is refused (the reset-credit / inbox-reply rule). */
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
/** lane app-launch-singleton: WHO a launch request comes from — an agent's session token names its session (the window
 *  engine's token table), a job token an unnamed agent; anything else is the person's own door. */
function launchedByOfReq(req) {
  if (!isAgentBearer(req)) return { kind: 'person' };
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  let f = null;
  try { f = ctx && ctx.windowEngine && typeof ctx.windowEngine.factsForToken === 'function' ? ctx.windowEngine.factsForToken(token) : null; } catch { f = null; }
  return f ? { kind: 'agent', sessionId: f.sessionId, name: f.name || null } : { kind: 'agent' };
}
function fail(res, e) {
  const code = e?.code || null;
  const status = code === 'not-found' || code === 'file-missing' ? 404 : code === 'bad-request' || code === 'exec-not-found' || code === 'cwd-missing' || code === 'needs-wayland' || code === 'bad-url' || code === 'not-a-browser' || code === 'automation-flag' || code === 'profile-not-owned' || code === 'profile-is-users' || code === 'unsupported-host'
      || code === 'relative-path' || code === 'not-office-file' || code === 'not-office-app' || code === 'bad-size' || code === 'size_out_of_bounds' || code === 'pin_unsupported' || ['bad_label', 'bad_exec', 'bad_args', 'too_many_variants', 'needs_root', 'bad_icon', 'shadow'].includes(code) ? 400
    : code === 'cap' || code === 'no-backend' || code === 'backend-not-wired' || code === 'held' || code === 'not_taken' || code === 'no_lease' || code === 'not-xpra' || code === 'no_viewer' || code === 'not-ready' || code === 'relaunch-browser' || code === 'browser-absent' || code === 'snap-profile-unreachable'
      || code === 'host_needs_daemon' || code === 'no_x11' || code === 'no_apt' || code === 'no_repo' || code === 'no_sudo' || code === 'no_facts' || code === 'busy' || code === 'no_conversation' || code === 'fork_pending' || code === 'wake_paced'
      || code === 'machine-mismatch' || code === 'app-absent' || code === 'still-absent' || code === 'app-asked' || code === 'changed_outside' || code === 'lease' ? 409
      : code === 'agent_forbidden' || code === 'not_your_window' || code === 'remoteapp_door' ? 403 : code === 'not_live' ? 404 : code === 'bad_principal' || code === 'bad_mode' || code === 'share_local_only' ? 400
      : code === 'no-engine' || code === 'xpra-ui-unavailable' || code === 'host_unavailable' || code === 'install_link_lost' || code === 'host-unreachable' ? 503 : code === 'install_timeout' ? 504 : 500;
  res.status(D014_STATUS[code] || status).json({ error: String(e?.message || e), code, ...(e && e.plan ? { plan: e.plan } : {}), ...(e && e.remedy ? { remedy: e.remedy } : {}), ...(e && e.vnc ? { vnc: e.vnc, platform: e.platform || null } : {}) });
}
const ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

router.get('/api/desktop/apps', async (req, res) => {
  // lane app-launch-singleton: `?records=1` = the records alone (every machine's), no catalog read — the Desktop list's
  // "Running apps" (an agent-started app included) asks it each time it opens
  if (req.query.records === '1') { try { res.json({ apps: ctx.keeper.listApps() }); } catch (e) { fail(res, e); } return; }
  const host = hostParam(req, res); if (!host) return;
  const witness = req.query.witness === 'recheck' ? { witness: 'recheck' } : null; // lane apps-launcher-witness: the "Installed outside VibeSpace" group's Check again
  try { const r = host === 'local' ? await (witness ? ctx.keeper.list(witness) : ctx.keeper.list()) : await ctx.keeper.list({ host, ...witness }); res.json(appsEngine ? appsEngine.decorate(host, r) : r); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps', async (req, res) => {
  const host = hostParam(req, res); if (!host) return;
  // lane D: the app's default scale is checked HERE too (the PURE verdict the machine runs) — a paired machine whose agent
  // predates the field would drop it silently; a bad value is the person's request refused by name, on every machine
  const sv = scaleChoiceVerdict(req.body);
  if (!sv.ok) return fail(res, { code: sv.code, message: sv.error });
  // lane launch-picture-size: the dialog's Picture size — judged HERE by parsePin's own words too (before a paired machine is asked)
  const pv = parsePin(req.body && req.body.pin !== undefined && req.body.pin !== '' ? req.body.pin : null);
  if (!pv.ok) return fail(res, { code: pv.code, message: pv.error });
  // §7.9: a DOCUMENT — THE MACHINE RULE before any machine is asked (the app runs where the file is); the file's own
  // module row is filled in when the request names none (the machine runs the verdict again with its catalog)
  let fill = null;
  if (req.body && req.body.file != null) {
    const fh = req.body.fileHost == null || req.body.fileHost === '' ? host : String(req.body.fileHost);
    if (!LOCAL.has(fh) && !HOST_RE.test(fh)) return fail(res, { code: 'bad-request', message: `bad fileHost ${JSON.stringify(fh.slice(0, 40))}` });
    const asked = req.body.appId != null ? String(req.body.appId) : req.body.exec != null ? { id: null, label: String(req.body.exec).slice(0, 80) } : null;
    const v = openWithVerdict({ row: asked, file: req.body.file, machine: { hostId: host, fileHost: LOCAL.has(fh) ? 'local' : fh, registry: null } });
    if (!v.ok) return fail(res, { code: v.code, message: v.error, remedy: v.remedy });
    if (asked == null) fill = v.catalogId;
  }
  // lane E (D2 "before launch"): the dialog's share rides the launch — validated BEFORE anything starts, human-only,
  // this machine only (a paired machine's window is no agent target), applied once the window exists
  const share = req.body && req.body.share != null ? req.body.share : null;
  if (share != null) {
    if (isAgentBearer(req)) return fail(res, { code: 'agent_forbidden', message: 'sharing a window is the user\'s act — an agent token cannot' });
    const RE = require('../window-reach');
    const v = RE.normShare(share);
    if (!v.ok) return fail(res, { code: v.code, message: v.why });
    if (host !== 'local' && v.share && v.share.principals.length) return fail(res, { code: 'share_local_only', message: 'a window on another machine cannot be shared with an agent — agents address this machine\'s windows only' });
  }
  try {
    const lb = fill ? { ...bodyOf(req), appId: fill } : bodyOf(req);
    const launchedBy = launchedByOfReq(req); // lane app-launch-singleton: the record says who started it
    const r = host === 'local' ? await ctx.keeper.launch(lb, { launchedBy }) : await ctx.keeper.launch(lb, { host, launchedBy });
    let reach = null;
    if (share != null && host === 'local' && ctx.windowEngine && typeof ctx.windowEngine.shareAtLaunch === 'function' && r && r.id && !r.attached) { // lane app-launch-singleton: an ATTACHED answer started nothing — the running window's exposure is not the launch row's to change
      try { reach = ctx.windowEngine.shareAtLaunch(r.id, share); } catch (e) { return res.json({ ...r, reach: null, reachError: { error: String(e.message || e), code: e.code || null } }); } // the app runs; the share's failure is said, never silent
    }
    res.json(reach ? { ...r, reach } : r);
  } catch (e) { fail(res, e); }
});
// lane app-register-model: the OWNER's Adopt — a row of "Installed outside VibeSpace" becomes a registered app (the prefill
// of src/app-kinds/registered.js adoptPrefill, the dialog's edits on top). A person's click: an agent token is refused.
const SEEN_RE = /^seen\.[A-Za-z0-9._-]{1,72}$/;
/** The witnessed row a seenId names on that machine (null = not listed there any more). */
async function seenRow(host, seenId) {
  const list = host === 'local' ? await ctx.keeper.list() : await ctx.keeper.list({ host });
  return ((list && list.registry) || []).find((r) => r && r.id === seenId && r.witnessed === true) || null;
}
/** rel254 verify F1: the three OWNER routes the launcher calls — registered BEFORE `GET /api/desktop/apps/:id` (an
 *  `adopt-prefill` must never fall into `:id`); a person's click only (an agent's vsst_ / jbt_ bearer is refused). */
function ownerGate(req, res, what) {
  const host = hostParam(req, res); if (!host) return null;
  if (isAgentBearer(req)) { fail(res, { code: 'agent_forbidden', message: `${what} is the owner's click — an agent token cannot` }); return null; }
  if (!appsEngine) { fail(res, { code: 'host_unavailable', message: 'apps are not available in this process' }); return null; }
  return host;
}
router.get('/api/desktop/apps/adopt-prefill', async (req, res) => {
  const host = ownerGate(req, res, 'adopting an app'); if (!host) return;
  const seenId = String(req.query.seenId || '');
  if (!SEEN_RE.test(seenId)) return fail(res, { code: 'bad-request', message: 'name the row of Installed outside VibeSpace (seenId)' });
  try {
    const seen = await seenRow(host, seenId);
    if (!seen) return fail(res, { code: 'not-found', message: `${seenId} is not listed outside VibeSpace on that machine (any more)` });
    const pre = RG.adoptPrefill(seen);
    res.json({ ok: true, seenId, label: pre.label, launch: pre.launch, remove: pre.remove || null, reinstall: pre.reinstall || null, witness: pre.witness });
  } catch (e) { fail(res, e); }
});
const ENTRY_ROW_RE = /^app\.([a-z0-9][a-z0-9-]{0,39})$/; // = app-manifest ENTRY_ID_RE behind `app.`
/** POST …/:id/remove | …/:id/forget — `:id` = a home app's row id (`app.<entry>`); an unknown one ⇒ 404 by name. */
function ownerEntryRoute(verb) {
  return async (req, res) => {
    const host = ownerGate(req, res, verb === 'remove' ? 'removing an app' : 'forgetting an app'); if (!host) return;
    const m = ENTRY_ROW_RE.exec(String(req.params.id || ''));
    if (!m) return fail(res, { code: 'bad-request', message: `${JSON.stringify(String(req.params.id).slice(0, 40))} is not an app's row id (app.<name>)` });
    try {
      const r = verb === 'remove' ? await appsEngine.ownerRemove(host, m[1]) : await appsEngine.ownerForget(host, m[1]);
      if (r.ok) return res.json(r);
      res.status(r.code === 'failed' ? 500 : r.code === 'no_recipe' ? 409 : 400).json(r);
    } catch (e) {
      if (e && (e.code === 'not_found' || e.code === 'not-found')) return res.status(404).json({ ok: false, code: 'not-found', error: `no app ${m[1]} in your home on that machine — nothing to ${verb}` });
      fail(res, e);
    }
  };
}
router.post('/api/desktop/apps/:id/remove', ownerEntryRoute('remove'));
router.post('/api/desktop/apps/:id/forget', ownerEntryRoute('forget'));
router.post('/api/desktop/apps/adopt', async (req, res) => {
  const host = hostParam(req, res); if (!host) return;
  if (isAgentBearer(req)) return fail(res, { code: 'agent_forbidden', message: 'adopting an app is the owner\'s click — an agent registers with vibespace-app register' });
  if (!appsEngine || typeof appsEngine.adopt !== 'function') return fail(res, { code: 'host_unavailable', message: 'apps are not available in this process' });
  const b = req.body || {};
  const seenId = String(b.seenId || '');
  if (!SEEN_RE.test(seenId)) return fail(res, { code: 'bad-request', message: 'name the row of Installed outside VibeSpace (seenId)' });
  try {
    const seen = await seenRow(host, seenId);
    if (!seen) return fail(res, { code: 'not-found', message: `${seenId} is not listed outside VibeSpace on that machine (any more)` });
    const pre = RG.adoptPrefill(seen);
    const entry = { ...pre, ...(b.label != null ? { label: b.label } : {}), ...(Array.isArray(b.launch) ? { launch: b.launch } : {}), ...(b.remove !== undefined ? { remove: b.remove } : {}), ...(b.reinstall !== undefined ? { reinstall: b.reinstall } : {}), ...(b.icon != null ? { icon: b.icon } : {}) };
    for (const k of ['remove', 'reinstall', 'icon']) if (entry[k] == null) delete entry[k];
    const rec = await appsEngine.adopt(host, entry);
    const row = ((rec && rec.rows) || [])[0] || null;
    res.json({ ok: true, id: row ? row.id : `app.${rec.entry.id}`, entryId: rec.entry.id, row, prefill: pre });
  } catch (e) { fail(res, e); }
});
// lane C2: the machine picker, the install rung's plan, and the install itself (streamed)
router.get('/api/desktop/machines', async (req, res) => {
  try { res.json({ machines: ctx.access ? await ctx.access.machines() : [{ hostId: 'local', label: null, transport: 'local', link: 'online', connected: true, selectable: true, code: 'ready' }] }); } catch (e) { fail(res, e); }
});
router.get('/api/desktop/install-plan', async (req, res) => {
  const host = hostParam(req, res); if (!host) return;
  if (!ctx.access) return fail(res, { code: 'host_unavailable', message: 'the desktop access layer is not wired on this instance' });
  // §7.9: `what` = which install (absent = xpra, the call exactly as before); a closed set — anything else 400 by name
  const what = req.query.what == null || req.query.what === '' ? null : String(req.query.what);
  const row = what === null ? null : installRow(what);
  if (row && row.humanOnly && humanOnly(req, res)) return; // design 014 D1: the Windows one-time setup is people's
  if (what !== null && !row) return fail(res, { code: 'bad-request', message: `unknown install ${JSON.stringify(what.slice(0, 40))} — one of ${INSTALL_WHATS.join(', ')}` });
  try { res.json(what === null ? await ctx.access.installPlan(host) : await ctx.access.installPlan(host, what)); } catch (e) { fail(res, e); }
});
/** THE STREAMED INSTALL (lane C2; §7.9 shares it for every `what`): the machine's slot asked BEFORE the stream starts
 *  (a busy machine answers 409), then NDJSON — `{reattached, pid, since}` first when a live install there was
 *  re-attached (verify r2 F3 + F4), `{log}` lines, then ONE `{done, …}` (from `doneOf(r)`, which may throw a coded
 *  refusal) or ONE `{error, code, plan?}`. */
async function streamInstall(req, res, host, run, doneOf) {
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
    const r = await run({ onData, onReattach });
    if (carry) { line({ log: carry }); carry = ''; }
    line(await doneOf(r));
  } catch (e) {
    if (carry) line({ log: carry });
    line({ error: String(e?.message || e), code: e?.code || 'install_failed', ...(e && e.plan ? { plan: e.plan } : {}), ...(e && e.digest ? { digest: e.digest } : {}) });
  } finally { try { res.end(); } catch { /* gone */ } }
}
const xpraDone = (r) => {
  const out = { done: true, installed: r.after && r.after.xpra, source: r.plan.source, hostId: r.hostId, reattached: !!r.reattached };
  try { ctx.keeper.facts?.({ fresh: true })?.catch?.(() => { }); } catch { /* the local ladder is re-read on the next list */ }
  return out;
};
/** What the route re-checks after an install, by the row's declared `done` (src/installs.js) — never by its name. */
const DONE = { display: () => xpraDone, catalog: (host, what) => officeDone(host, what), vnc: () => tightvncDone };
// verify-r6 I1: the press names the plan it was SHOWN (`planDigest` from GET install-plan) — a plan that changed since
// is refused plan_changed with the new one, nothing run
const shownDigest = (req) => (req.body && typeof req.body.planDigest === 'string' && req.body.planDigest ? req.body.planDigest.slice(0, 64) : null);
router.post('/api/desktop/install-xpra', async (req, res) => {
  const host = hostParam(req, res); if (!host) return;
  return streamInstall(req, res, host, (o) => ctx.access.installXpra(host, { ...o, expectDigest: shownDigest(req) }), xpraDone);
});
/** §7.9: after a LibreOffice install the MACHINE's catalog is asked again (its LibreOffice facts re-read at once —
 *  `facts {fresh}`) and the install counts as done only when it now serves the row; otherwise `still-absent` by name
 *  (a re-attached install was another package's, or apt put LibreOffice somewhere the machine cannot see). */
const officeDone = (host, what) => async (r) => {
  const spec = installSpecFor(what);
  try { if (host === 'local') await ctx.keeper.facts?.({ fresh: true }); else await ctx.access.call(host, 'facts', { fresh: true }); } catch { /* the list below answers or throws */ }
  const l = host === 'local' ? await ctx.keeper.list() : await ctx.keeper.list({ host });
  // B-04da ②: the faces alone are done when a served LibreOffice row no longer names any as missing
  const row = what === FONTS_ID ? ((l && l.registry) || []).find((x) => x && x.office && x.available && !(x.fontsMissing && x.fontsMissing.length)) : ((l && l.registry) || []).find((x) => x && x.id === what);
  if (!row || !row.available) { const e = new Error(`the install finished${r.reattached ? ' (it was an install already running there)' : ''}, but ${spec ? spec.label : what} is still not available on ${host === 'local' ? 'this machine' : host}${row && row.reason ? `: ${row.reason}` : ''} — check again`); e.code = 'still-absent'; e.plan = r.plan; throw e; }
  return { done: true, what, available: true, label: spec ? spec.label : what, source: r.plan.source, hostId: r.hostId, reattached: !!r.reattached };
};
router.post('/api/desktop/install', async (req, res) => {
  const host = hostParam(req, res); if (!host) return;
  const what = req.body && req.body.what != null && req.body.what !== '' ? String(req.body.what) : DEFAULT_INSTALL;
  const row = installRow(what);
  if (row && row.humanOnly && humanOnly(req, res)) return; // design 014 D1: the Windows one-time setup is people's
  if (!row) return fail(res, { code: 'bad-request', message: `unknown install ${JSON.stringify(what.slice(0, 40))} — one of ${INSTALL_WHATS.join(', ')}` });
  return streamInstall(req, res, host, (o) => ctx.access.installPackage(host, { ...o, what, expectDigest: shownDigest(req) }), DONE[row.done](host, what));
});
// ── design 014 D1 (lane desktop-vnc-native): a Windows / macOS machine's WHOLE DESKTOP — people only ──
/** An agent's token (a Bearer header, a token in the body or the url) is refused by name on every whole-desktop door:
 *  the picture shows everything on that machine's screen, and a command started there runs as its logged-in user. */
const isAnyBearer = (req) => /^Bearer\s+\S/i.test(String((req.headers && req.headers.authorization) || '')) || typeof (req.body && req.body.token) === 'string' || (req.query && (req.query.token != null || req.query.vsst != null)); // verify r2 L1: ?vsst= too — the stream guard (desktop-stream bearerOf) names it; the routes must match (an agent token in the query is refused, not only in the header / body / ?token=)
function humanOnly(req, res) {
  if (!isAnyBearer(req)) return false;
  res.status(403).json({ error: 'a machine\'s whole desktop is the owner\'s — an agent token may not view it, run a command on it or set it up', code: 'human_only' });
  return true;
}
const noAccess = (res) => fail(res, { code: 'host_unavailable', message: 'the desktop access layer is not wired on this instance' });
/** The window's connect gate: the machine reached, Windows / macOS, its VNC server answering (else no_vnc by name). */
router.post('/api/desktop/machine-desktop/connect', async (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  if (!ctx.access) return noAccess(res);
  try { const r = await ctx.access.openMachineDesktop(host); res.json({ ...r, streamPath: `/api/desktop/${r.id}/stream` }); } catch (e) { fail(res, e); }
});
/** "Run on its desktop…": the owner's line, started detached on that machine's desktop (refusals by name). */
router.post('/api/desktop/machine-desktop/run', async (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  if (!ctx.access) return noAccess(res);
  try { res.json(await ctx.access.runOnDesktop(host, req.body ? req.body.cmd : undefined, { report: !!(req.body && req.body.window === true) })); } catch (e) { fail(res, e); }
});
// lane remoteapp-r1a (design q-024 §1.2): ONE app of a paired WINDOWS machine as a real window through RemoteApp — people only
// (§1.6 fence 4: an agent never starts one). The machine's setup is asked first, so the launcher hears what is missing
// (`remoteapp_needs_setup` — its door is the machine's RemoteApp settings card, r1b); the launch's own refusals by name (409 / 400).
const RA_409 = new Set(['remoteapp_needs_setup', 'remoteapp_not_windows', 'not_desktop_machine', 'rdp_session_busy', 'rdp_client_too_old', 'rdp_client_unknown', 'remoteapp_unwired']);
const RA_400 = new Set(['remoteapp_bad_program', 'rdp_arg_forbidden', 'rdp_cert_bad']);
router.post('/api/desktop/machine-desktop/remoteapp', async (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  if (!ctx.access || typeof ctx.access.launchRemoteApp !== 'function') return noAccess(res);
  const b = req.body || {};
  try { res.json(await ctx.access.launchRemoteApp(host, { program: b.program, name: b.name, args: b.args, kbdUnicode: b.kbdUnicode })); }
  catch (e) { const c = e && e.code; if (RA_409.has(c) || RA_400.has(c)) res.status(RA_409.has(c) ? 409 : 400).json({ error: String(e.message), code: c, ...(Array.isArray(e.missing) ? { missing: e.missing } : {}) }); else fail(res, e); }
});
// lane remoteapp-r1b (design q-024 r1 §1.3–§1.4): THE REMOTEAPP SETTINGS CARD — people only, like the launch. Its sign-in is the
// machine's SEALED integration row (`remoteapp/<hostId>`: the page sends user / domain / password, gets back the view —
// "password: set", never its bytes); the certificate is pinned by the first connection, never typed; the facts are the
// machine's own (the `remoteapp-facts` device op, read-only). No body is ever logged.
const RA_SET_409 = new Set([...RA_409, 'rdp_trust_busy', 'rdp_trust_timeout', 'rdp_trust_failed', 'rdp_trust_no_cert', 'rdp_auth_failed', 'rdp_unreachable', 'rdp_tls_failed', 'rdp_client_refused', 'rdp_bad_argv', 'rdp_cert_changed', 'rdp_link_lost', 'no-backend']);
const RA_SET_400 = new Set([...RA_400, 'invalid-values', 'bad-request']);
const raFail = (res, e) => {
  const c = e && e.code;
  const status = RA_SET_409.has(c) ? 409 : RA_SET_400.has(c) ? 400 : c === 'unsupported-host' || c === 'binds-per-machine' ? 404 : null;
  if (status) return res.status(status).json({ error: String(e.message), code: c, ...(Array.isArray(e.missing) ? { missing: e.missing } : {}), ...(e.detail && c === 'invalid-values' ? { fields: e.detail } : {}) });
  return fail(res, e);
};
const raAccess = (res, fn) => { if (!ctx.access || typeof ctx.access[fn] !== 'function') { noAccess(res); return null; } return ctx.access; };
router.get('/api/desktop/machine-desktop/remoteapp/setup', (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  const acc = raAccess(res, 'remoteappSetupView'); if (!acc) return;
  try { res.json({ setup: acc.remoteappSetupView(host) }); } catch (e) { raFail(res, e); }
});
router.get('/api/desktop/machine-desktop/remoteapp/facts', async (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  const acc = raAccess(res, 'remoteappFacts'); if (!acc) return;
  try { res.json(await acc.remoteappFacts(host)); } catch (e) { raFail(res, e); }
});
router.post('/api/desktop/machine-desktop/remoteapp/setup', (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  const acc = raAccess(res, 'saveRemoteappSetup'); if (!acc) return;
  const b = req.body || {};
  try { res.json({ setup: acc.saveRemoteappSetup(host, { user: b.user, domain: b.domain, password: b.password }) }); } catch (e) { raFail(res, e); }
});
router.post('/api/desktop/machine-desktop/remoteapp/trust', async (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  const acc = raAccess(res, 'trustRemoteApp'); if (!acc) return;
  try { res.json({ setup: await acc.trustRemoteApp(host) }); } catch (e) { raFail(res, e); }
});
// lane machine-app-crop: ONE app of the machine as its own window — the device follows the app's window, the page crops the
// whole picture to it (src/server/machine-app.js; people only, like the whole desktop). `not_tracked` = its watch ended.
let machineApps = null;
const appsOf = (res) => { if (!ctx.access || typeof ctx.access.deviceOf !== 'function') { noAccess(res); return null; } return machineApps || (machineApps = require('../server/machine-app.js').create({ access: ctx.access, log: console })); };
const appFail = (res, e) => (e && e.code === 'not_tracked' ? res.status(404).json({ error: String(e.message), code: e.code }) : fail(res, e));
router.post('/api/desktop/machine-app/track', async (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  const ma = appsOf(res); if (!ma) return;
  const b = req.body || {};
  try { res.json(await ma.track(host, { pid: b.pid ?? null, since: b.since ?? null, target: b.target ?? null })); } catch (e) { appFail(res, e); }
});
router.get('/api/desktop/machine-app/watch', async (req, res) => {
  if (humanOnly(req, res)) return;
  const ma = appsOf(res); if (!ma) return;
  res.json(await ma.poll(String(req.query.key || ''), Number(req.query.seq ?? -1), Number(req.query.waitMs) || undefined));
});
router.post('/api/desktop/machine-app/on-top', async (req, res) => {
  if (humanOnly(req, res)) return;
  const ma = appsOf(res); if (!ma) return;
  try { res.json(await ma.pin(String((req.body && req.body.key) || ''), !!(req.body && req.body.on))); } catch (e) { appFail(res, e); }
});
router.post('/api/desktop/machine-app/untrack', (req, res) => {
  if (humanOnly(req, res)) return;
  const ma = appsOf(res); if (!ma) return;
  res.json(ma.untrack(String((req.body && req.body.key) || '')));
});
/** lane machine-desktop-apps: the machine's INSTALLED apps — listed ON it by witness (src/installed-apps.js), kept by the
 *  hub; `fresh=1` = Check again (listed now). Answered 200 with the list as it is when the machine cannot list right
 *  now (`code`: host_needs_daemon = its agent predates the op, offline, list_failed) — the dialog words each. */
router.get('/api/desktop/machine-desktop/apps', async (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  if (!ctx.access || typeof ctx.access.installedApps !== 'function') return noAccess(res);
  try { res.json(await ctx.access.installedApps(host, { why: req.query.fresh === '1' ? 'recheck' : 'open' })); } catch (e) { fail(res, e); }
});
/** lane desktop-v2-entry: the machine's own screen table (the display picker; 200 with `code` when it cannot say — an old agent,
 *  offline, a failed look — the window then offers the whole screen only). People only, like the picture. */
router.get('/api/desktop/machine-desktop/displays', async (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  if (!ctx.access || typeof ctx.access.displayFacts !== 'function') return noAccess(res);
  try { res.json(await ctx.access.displayFacts(host)); } catch (e) { if (e && (e.code === 'host_needs_daemon' || e.code === 'host_unavailable')) return res.json({ ok: false, code: e.code, error: String(e.message) }); fail(res, e); }
});
/** The stats strip's link numbers: the hub ⇄ machine round trip now (the page times this request itself for browser ⇄ hub). */
router.get('/api/desktop/machine-desktop/link', async (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  if (!ctx.access || typeof ctx.access.linkPing !== 'function') return noAccess(res);
  const t0 = Date.now();
  try { const r = await ctx.access.linkPing(host); res.json({ device: r.ms, took: Date.now() - t0 }); } catch (e) { fail(res, e); }
});
/** The bridge's own record of a machine desktop's last close (the window words it — "<machine> went offline"). */
router.get('/api/desktop/machine-desktop/last-close', (req, res) => {
  if (humanOnly(req, res)) return;
  const host = hostParam(req, res); if (!host) return;
  const id = machineDesktopId(host);
  res.json({ close: id && ctx.stream && typeof ctx.stream.lastCloseOf === 'function' ? ctx.stream.lastCloseOf(id) : null });
});
/** After the TightVNC install: done only once the machine's 5900 answers as a VNC server (else still-absent by name). */
const tightvncDone = (r) => {
  if (!r.after || !r.after.ok) { const e = new Error(`the install finished, but port 5900 on ${r.hostId} does not answer as a VNC server (${(r.after && (r.after.why || r.after.code)) || 'no answer'}) — check again`); e.code = 'still-absent'; e.plan = r.plan; throw e; }
  return { done: true, what: TIGHTVNC.id, label: r.plan.label, hostId: r.hostId, vnc: r.after };
};
/** §7.9: the open-with verdict for ONE file without launching — the explorer's menu row asks it (answered 200 either way:
 *  it is a question). The file rule first (no machine is asked about a refused path), then the machine's catalog. */
router.get('/api/desktop/open-with', async (req, res) => {
  const host = hostParam(req, res); if (!host) return;
  const file = req.query.path == null ? '' : String(req.query.path);
  const app = req.query.app == null || req.query.app === '' ? null : String(req.query.app);
  const pre = openWithVerdict({ row: app, file, machine: { hostId: host, fileHost: host, registry: null } });
  if (!pre.ok) return res.json({ ...pre, host });
  // `peek=1` (the explorer's menu): a paired machine that is not connected right now is NOT connected for a menu — the
  // answer says the machine was not asked (`unchecked`), the click on the row connects
  if (req.query.peek === '1' && host !== 'local' && ctx.access && typeof ctx.access.connectedNow === 'function' && !ctx.access.connectedNow(host)) return res.json({ ...pre, host, unchecked: true });
  let registry = null, reachable = true, why = null;
  try { const l = host === 'local' ? await ctx.keeper.list() : await ctx.keeper.list({ host }); registry = (l && l.registry) || []; }
  catch (e) {
    if (e && e.code === 'host_needs_daemon') return res.json({ ok: false, code: 'host_needs_daemon', error: String(e.message || e), host });
    reachable = false; why = String((e && e.message) || e);
  }
  res.json({ ...openWithVerdict({ row: app, file, machine: { hostId: host, fileHost: host, registry, reachable, why } }), host });
});
router.get('/api/desktop/apps/:id', (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const r = ctx.keeper.get(req.params.id);
  if (!r) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  res.json(r);
});
router.post('/api/desktop/apps/:id/stop', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  // B-04da ④: `{force: true}` = the person confirmed "stop anyway" after an `app-asked` (LibreOffice's save prompt is up)
  try { res.json(await ctx.keeper.stop(req.params.id, { why: 'user', force: !!(req.body && req.body.force === true) })); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps/:id/close-asked', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  // int267 seam: the window's outer ✕ stamps the person's ask BEFORE it sends close-window — a person's close is never a failed launch
  try { res.json(await ctx.keeper.closeAsked(req.params.id)); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps/:id/keep-alive', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json(await ctx.keeper.keepAlive(req.params.id)); } catch (e) { fail(res, e); } // a paired machine's answers through the op (async)
});
// lane e2b (design-agent-browser-v2 §E2.2): the window menu's "Pin size… 1920×1080 / 1280×720 / Auto" — {size: 'WxH' | 'auto'};
// the USER pins any window (the agent's door is POST /api/agent/window/size, the opener only); saved + broadcast by the keeper
router.post('/api/desktop/apps/:id/pin', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const v = pinVerdict({ record: ctx.keeper.get(req.params.id), who: 'user', size: req.body ? req.body.size : undefined });
  if (!v.ok) return fail(res, { code: v.code, message: v.error });
  try { res.json(await ctx.keeper.setPin(req.params.id, v.pin)); } catch (e) { fail(res, e); }
});

router.post('/api/desktop/apps/:id/relaunch', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  // B-5ee0 ②: an agent holding the window's lease ⇒ refused HERE too (the menu's 'lease' is only the window's word)
  let lease = null;
  try { lease = ctx.windowEngine ? ctx.windowEngine.leaseOf(req.params.id) : null; } catch { lease = null; }
  const lv = relaunchLeaseVerdict(ctx.keeper.get(req.params.id), lease);
  if (lv) return fail(res, { code: lv.code, message: lv.error });
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
  if (!capsOf(rec).hostedClient) { fail(res, { code: 'not-xpra', message: `desktop app ${id} runs on ${rec.backend} — the xpra client cannot show it` }); return null; }
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
// lane app-display-secrets: the logins the app's Secret Service keeps (the window's ⋯ ▸ Stored logins) and its one door
router.get('/api/desktop/apps/:id/secrets', (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (!ctx.keeper.get(req.params.id)) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  res.json(ctx.keeper.appSecrets ? ctx.keeper.appSecrets(req.params.id) : { secrets: 'off', count: 0 });
});
router.post('/api/desktop/apps/:id/secrets/forget', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (!ctx.keeper.get(req.params.id)) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  if (!ctx.keeper.forgetAppSecrets) return res.json({ ok: true, forgot: 0 });
  const r = await ctx.keeper.forgetAppSecrets(req.params.id);
  res.status(r.ok ? 200 : 500).json(r.ok ? r : { error: r.why, code: 'forget-failed' });
});
router.get('/api/desktop/apps/:id/viewers', (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (!ctx.keeper.get(req.params.id)) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  res.json(ctx.keeper.viewersView(req.params.id));
});
// lane app-display-notify-sink: the app's last notifications (the window's ⋯ ▸ Notifications) and "the person raised it"
router.get('/api/desktop/apps/:id/notifications', (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (!ctx.keeper.get(req.params.id)) return res.status(404).json({ error: `no desktop app ${req.params.id}`, code: 'not-found' });
  res.json(ctx.keeper.notifications ? ctx.keeper.notifications(req.params.id) : { notify: 'off', notes: [] });
});
router.post('/api/desktop/apps/:id/notifications/seen', (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  res.json({ ok: true, resolved: ctx.keeper.notifySeen ? ctx.keeper.notifySeen(req.params.id) : false });
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

// ── lane E: reach + the share mode + the window request (human-only; the engine decides) ──
/** The engine for a window THIS machine addresses: 503 no-engine, 404 not-found, 400 share_local_only (a paired
 *  machine's app), 403 agent_forbidden (an agent token) — each answered here; returns null after answering. */
function reachGate(req, res) {
  const id = req.params.id;
  if (!ID_RE.test(id)) { res.status(400).json({ error: 'bad id', code: 'bad-request' }); return null; }
  if (isAgentBearer(req)) { fail(res, { code: 'agent_forbidden', message: 'sharing a window is the user\'s act — an agent token cannot' }); return null; }
  const engine = engineOr503(res); if (!engine) return null;
  const rec = ctx.keeper.get(id);
  if (!rec) { res.status(404).json({ error: `no desktop app ${id}`, code: 'not-found' }); return null; }
  if (typeof engine.addressable === 'function' && !engine.addressable(id)) {
    if (rec.hostId && rec.hostId !== 'local') { fail(res, { code: 'share_local_only', message: `${rec.label || id} runs on ${rec.hostLabel || rec.hostId} — agents address this machine's windows only` }); return null; }
    res.status(404).json({ error: `${rec.label || id} is not running`, code: 'not-found' }); return null;
  }
  return engine;
}
router.get('/api/desktop/apps/:id/reach', (req, res) => {
  const engine = reachGate(req, res); if (!engine) return;
  try { res.json(engine.reachOf(req.params.id)); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps/:id/reach', (req, res) => {
  const engine = reachGate(req, res); if (!engine) return;
  try { res.json(engine.grantReach(req.params.id, req.body && req.body.principal, { by: 'user' })); } catch (e) { fail(res, e); }
});
router.delete('/api/desktop/apps/:id/reach', (req, res) => {
  const engine = reachGate(req, res); if (!engine) return;
  try { res.json(engine.revokeReach(req.params.id, req.body && req.body.principal)); } catch (e) { fail(res, e); }
});
router.put('/api/desktop/apps/:id/reach/mode', (req, res) => {
  const engine = reachGate(req, res); if (!engine) return;
  try { res.json(engine.setShareMode(req.params.id, req.body && req.body.mode)); } catch (e) { fail(res, e); }
});
router.post('/api/desktop/apps/:id/reach/request', async (req, res) => {
  const engine = reachGate(req, res); if (!engine) return;
  if (!ctx.windowRequest) return fail(res, { code: 'no-engine', message: 'window requests are not wired in this process' });
  const b = req.body || {};
  if (typeof b.sessionId !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(b.sessionId)) return fail(res, { code: 'bad-request', message: 'a request names the agent session it asks (sessionId)' });
  if (b.note != null && typeof b.note !== 'string') return fail(res, { code: 'bad-request', message: 'note is text' });
  try { res.json(await ctx.windowRequest.request({ handle: req.params.id, sessionId: b.sessionId, note: b.note || '', wake: b.wake === true, endHold: b.endHold === true })); } catch (e) { fail(res, e); }
});

// the singleton desktop (src/vnc.js) — answers unchanged from server.js
router.get('/api/vnc/status', async (req, res) => {
  // lane desktop-v2-entry (D4): `seat` = 'wayland' when the hub runs in a Wayland session — the Desktop picker's local row says why
  // this host's own screen is not offered (only the VibeSpace virtual desktop is)
  try { res.json({ ...(await ctx.vnc.status()), seat: process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland' ? 'wayland' : null }); } catch (e) { res.status(500).json({ error: e.message }); }
});
// lane desktop-keepalive K3: the singleton stream's LAST close as the bridge named it ({why, code, at, afterS} | null) — the
// Desktop window words `code` in its status chip ("Connection lost — the desktop server closed the stream")
router.get('/api/vnc/last-close', (req, res) => {
  try { res.json({ close: ctx.stream && typeof ctx.stream.lastCloseOf === 'function' ? ctx.stream.lastCloseOf('desktop-singleton') : null }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/api/vnc/start', async (req, res) => {
  try { res.json(await ctx.vnc.ensureRunning()); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router, setup, setApps };
