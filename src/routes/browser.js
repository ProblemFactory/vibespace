'use strict';
/**
 * BROWSER PROFILE ROUTES (docs/design-agent-browser-v2.zh.md §3.3–§3.5, §5.1;
 * phase P1). Thin: validation lives in src/browser-profiles.js (PURE), the
 * lifecycle in src/server/browser-keeper.js (ORCH); a route decides nothing.
 *
 *   UI (cookie-authed)
 *   GET    /api/browser/profiles              registry + leases + browsers + cap + floor + providers (P4: the rows)
 *   GET    /api/browser/providers[?host=]     P4 (§7.1): every provider row with its capability cells, the local verdict
 *                                             and the verdict FOR `host` (a disabled control names its reason), the
 *                                             §7.2.1 egress record, the cloakserve plan or its typed refusal, the forwards
 *   POST   /api/browser/profiles              { label, provider?, proxy?, notes?, record?, host?, cdpPort? }
 *                                             P4: `host` = the PAIRED machine the browser runs on (chromium via the
 *                                             browser-serve op, cdp via tcpForward); `cdpPort` = a cdp profile's port
 *   GET    /api/browser/profiles/:id
 *   DELETE /api/browser/profiles/:id          refused while leased or running; the dir is kept
 *   POST   /api/browser/profiles/:id/stop     stop its browser (leases stay; it restarts on the next attach)
 *   POST   /api/browser/attach                { sessionId, profile }   a live session's conversation → profile
 *   POST   /api/browser/detach                { sessionId, profile? }
 *   GET    /api/browser/session/:sessionId    that session's leases / pin / origin / attachment set (§3.7)
 *   POST   /api/browser/pin                   { sessionId, profile|null }   the conversation's pin (§3.2.5) — a USER act:
 *                                             queues the zero-billed `browser-pin` notice (§3.8 layer ②), persists to session meta
 *   POST   /api/browser/adopt                 { sessionId, label }  "new persistent profile from this session's browser":
 *                                             rung C = the scratch dir is MOVED and registered (login kept); rung D = an empty
 *                                             profile is created and the answer SAYS the login was not saved (§3.2.5)
 *   POST   /api/browser/handback              { sessionId, profile? }   P3 (§4.3): hand a taken-over browser back to the agent
 *                                             from OUTSIDE the live view (the card / Session Properties) — an EXPLICIT handback,
 *                                             announced through the gated ladder; 409 not_taken when nobody drives it
 *   POST   /api/browser/confirm               { sessionId, profile?, id, decision: confirm|deny }   P3: answer a pending
 *                                             --confirm-actions confirmation through upstream's own verb; 404 no_confirmation
 *   GET    /api/browser/switcher?profile=<id|label>   P4 second half (§7.4): the switcher's view — every backend row enabled
 *                                             or disabled WITH ITS REASON, the SOURCE chip (masked), seats in three states,
 *                                             the fingerprint sentence, the versions the ladder read, blocked claims, site hints
 *   POST   /api/browser/switch                { profile, provider, sessionId?, confirmDowngrade?, makeDefault? }   the USER's
 *                                             switch: stop → same dir + carried seed → re-open one tab per lease → re-pin;
 *                                             typed refusals (backend_unavailable / backend_no_key + action / backend_seat_*
 *                                             / downgrade_* / switch_export_only / browser_restarting); a browser somebody is
 *                                             DRIVING answers mode:'proposal' (filed to the inbox when a session is named)
 *   DELETE /api/browser/blocked/:id           dismiss an agent's blocked claim
 *   GET/POST /api/browser/site-hints          per-site memory (a claim: {site|url, backend|tier, why} by 'user' — `site`, because `host` is the MACHINE parameter)
 *   DELETE /api/browser/site-hints/:host
 *
 *   AGENT (vsst_ token — the CLI, exempt from cookie auth under /api/agent/)
 *   GET    /api/agent/browser/profiles
 *   POST   /api/agent/browser/use             { profile, alias? }  → lease + env pairs + pinTab (+ cdpUrl for the wrapper)
 *   POST   /api/agent/browser/new             { label, … } → creates, owned by THIS conversation
 *   POST   /api/agent/browser/detach          { profile? }   a profile id, label or HANDLE
 *   GET    /api/agent/browser/status          leases + pin + the attachment SET (aliases, default, children)
 *   POST   /api/agent/browser/pin             { profile|null }
 *   POST   /api/agent/browser/resolve         { handle?, argv?, wrapper? }  WHICH browser a CLI page verb acts on (§3.7) —
 *                                             every page verb of `vibespace-browser` makes this ONE call (takeover C2);
 *                                             no attachment on a local isolated rung ⇒ `keeper.ensureEphemeral` and
 *                                             `kind:'ephemeral'` with the session's OWN spawn pairs + the record view
 *                                             (takeover C3: started / adopted / counted — `browser_cap` names the
 *                                             holders); a child handle gets its own record the same way; the shared
 *                                             rung and a remote session stay `kind:'none'` (unmanaged, D7/D8);
 *                                             `kind:'none'` carries `shared` (the rung), and `close --all` there is
 *                                             refused `shared_browser` (D7):
 *                                             layer ①'s one-time `profile_changed` first, then `profile_required` /
 *                                             `not_attached` / `ambiguous` / `profile_path_refused`, else the env (+ cdpUrl
 *                                             for the wrapper); the "sub-agent" ASIDE rides only when this session has a
 *                                             sidechain open right now (`_subNormalizers`) — never the reason
 *   POST   /api/agent/browser/new-child       → a child handle `bk-<parent>.<n>` + its own env (D23)
 *   POST   /api/agent/browser/audit           { profile, verb, ok }  one §3.7 audit line (the verb only, never content)
 *   GET    /api/agent/browser/backend[?profile=]   P4 (§7.4): which backend I am on, what else exists, what each can do
 *   POST   /api/agent/browser/backend         { provider, profile?, confirmDowngrade? }   PROPOSE a switch: direct only when
 *                                             this conversation is the only lease-holder and nobody drives; else a "For you"
 *                                             item to the owner (mode:'proposal') — a switch stops everybody's browser
 *   POST   /api/agent/browser/blocked         { url, why?, evidence?, tier?, profile?, remember? }   a CLAIM, not a
 *                                             detection: recorded with who made it; the UI's one-click button is the user's act
 *   POST   /api/agent/browser/site-hint       { site|url, tier|backend, why }   per-site memory, by 'agent'
 *
 * Every agent-route MUTATION ends in `keeper.tell(browserKey)`: the answer
 * itself names the set, so the agent's own `use`/`detach`/`pin` never earns
 * it a `profile_changed` on its next command — only a change by SOMEBODY
 * ELSE (the user's UI pin/attach/detach) leaves the told fingerprint stale.
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
  res.status(400).json({ error: `browser profiles are local-only in this release — host ${JSON.stringify(h)} refused`, code: 'unsupported-host' });
  return true;
}
const STATUS = { 'not-found': 404, no_lease: 404, 'bad-request': 400, label_required: 400, label_taken: 409, provider_unknown: 400, provider_unavailable: 400, 'unsupported-host': 400, sharing_refused: 400, fence_refused: 409, bad_proxy: 400, ambiguous: 409, not_owner: 403, leased: 409, running: 409, cap: 409, launch_failed: 502, dir_unwritable: 500, unavailable: 503,
  // P4 (§7.1–§7.3): the provider rows' typed refusals, the paired-machine rungs, the cdp provider
  provider_needs_local_key: 400, provider_local_only: 400, provider_lacks_capability: 400, cdp_port_required: 400,
  // P10 (§7.6 tier 3, D27 (b)): the consent gate on the local-window row, and "tier 3 is not a profile"
  provider_needs_consent: 403, tier3_is_a_window_target: 409, cdp_unreachable: 502, host_needs_daemon: 409, host_unavailable: 503, op_failed: 502, no_cdp: 502, stop_failed: 502,
  // P6 (§6.2 / §6.5): a mediated profile with no proxy in this process / a browser that answered no CDP url
  mediation_unavailable: 503, mediation_no_cdp: 502, pin_refused: 409, pinned: 409,
  // §3.7 / §3.8 — the handle refusals are typed so the CLI prints the code and the agent can read why
  profile_required: 409, profile_changed: 409, not_attached: 404, profile_path_refused: 400, bad_alias: 400, alias_taken: 409, adopt_failed: 409,
  // P3 (§4.3): the user drives ⇒ the agent's command is refused typed; the control verbs' own refusals
  browser_paused: 409, held: 409, not_taken: 409, no_confirmation: 404, 'no-browser': 409, refused: 409,
  // P4 second half (§7.4 / §7.5): the switch's typed refusals — three named backend refusals (D33), the ladder, seats, the gap
  backend_unavailable: 400, backend_no_key: 409, backend_seat_taken: 409, backend_seat_ceiling: 409, downgrade_refused: 409, downgrade_unknown: 409,
  switch_refused: 400, switch_export_only: 400, switch_noop: 409, browser_restarting: 409, hint_tier_with_backend: 400, host_underivable: 400, no_profile: 409,
  // §7.4 failure form (1): the INSTALL action's typed refusals (src/browser-switch.js INSTALL_CODES)
  install_local_only: 400, already_installed: 409, install_running: 409, install_precondition_unmet: 409, install_unavailable: 503,
  // takeover C3 (design-browser-takeover §5): the managed ephemeral browser — the shared ceiling (D2), a record that is
  // never attached / edited by id, pairs that name no browser of this conversation, the real CLI missing on this machine
  browser_cap: 409, not_attachable: 409, not_editable: 409, not_managed: 409, binary_absent: 503 };
function fail(res, e) {
  const code = e?.code || null;
  res.status(STATUS[code] || 500).json({ error: String(e?.message || e), code, ...(e?.holders ? { holders: e.holders } : {}), ...(e?.why ? { why: e.why } : {}), ...(e?.remedy ? { remedy: e.remedy } : {}),
    // P4 (§7.4): a refusal carries its ACTIONABLE way out (`action.openIntegration`), the ways out of a refused downgrade, and whether one human confirmation would do
    ...(e?.action ? { action: e.action } : {}), ...(Array.isArray(e?.waysOut) && e.waysOut.length ? { waysOut: e.waysOut } : {}), ...(e?.needsConfirm ? { needsConfirm: true } : {}), ...(e?.provider ? { provider: e.provider } : {}), ...(e?.integrationId ? { integrationId: e.integrationId } : {}) });
}
/** A typed `{ok:false, code, …}` verdict → the same wire shape a thrown refusal gets, with its extras kept. */
function failVerdict(res, v) { return res.status(STATUS[v.code] || 409).json({ error: String(v.error || v.code), code: v.code, handles: v.handles || [], ...(v.default !== undefined ? { default: v.default } : {}), ...(v.was !== undefined ? { was: v.was } : {}), ...(v.now !== undefined ? { now: v.now } : {}), ...(v.takenAt !== undefined ? { takenAt: v.takenAt, lastUserInputAt: v.lastUserInputAt || 0 } : {}) }); }
/** P3 (§4.3): resolve the browser a takeover/handback/confirm names — a handle,
 *  a profile id, or (nothing) the set's default / only member / the ephemeral one. */
function inputTargetFor(k, f, ref) {
  const set = k.setFor(f.browserKey);
  const r = String(ref || '').trim();
  if (r) {
    const a = set.attachments.find((x) => x.alias === r || x.profileId === r) || null;
    if (!a) { const p = k.profileByRef(r); const b = p && !p.ambiguous ? set.attachments.find((x) => x.profileId === p.id) : null; if (!b) return { ok: false, code: 'not_attached', error: `this session is not attached to ${JSON.stringify(r)}` }; return { ok: true, profileId: b.profileId }; }
    return { ok: true, profileId: a.profileId };
  }
  const def = set.attachments.find((x) => x.isDefault) || (set.attachments.length === 1 ? set.attachments[0] : null);
  if (def) return { ok: true, profileId: def.profileId };
  if (set.attachments.length > 1) return { ok: false, code: 'profile_required', error: 'this session has several browsers — name the handle', handles: set.handles.map((h) => h.handle) };
  return { ok: true, profileId: null }; // the ephemeral browser
}
/** Is a sub-agent running in this session RIGHT NOW (§3.7's aside)? Only
 *  the server can tell — `_subNormalizers` is the per-sidechain map the stdout
 *  parser keeps while a claude Task tool is open; codex carries no signal. */
function sidechainOpen(s) { try { return !!(s && s._subNormalizers && s._subNormalizers.size > 0); } catch { return false; } }
/** A user-side change of the set: queue the free notice (layer ②) so the
 *  agent hears it on the user's next message. Optional wiring, never throws. */
function noteChange(f, { kind, was, now, handles }) {
  const B = require('../browser-profiles.js');
  try { ctx.notice?.(f.sessionId, f.session, { ...B.profileChangeNotice({ was, now, by: 'user', handles }), kind }); } catch (e) { console.warn('[browser] notice not queued — ' + (e && e.message)); }
}
const spellSet = (set) => (set && set.attachments.length ? set.attachments.map((a) => a.alias + (a.isDefault ? ' [default]' : '')).join(', ') : '');
/** §3.8 layer ③: the profile the agent LAST ACTUALLY USED — stamped on every
 *  successful CLI resolve / `use` ('' = the ephemeral browser), persisted to
 *  the session's meta and re-published so the status-bar chip can compare it
 *  with the PIN. Optional wiring, never throws. */
function stampActive(f, profileId) {
  const v = profileId == null ? '' : String(profileId);
  if (!f.session) return;
  if (f.session._browserProfileActive === v) return;
  f.session._browserProfileActive = v;
  try { ctx.persistActive?.(f.session, v); } catch (e) { console.warn('[browser] last-used profile not persisted — ' + (e && e.message)); }
  try { ctx.onLiveFactsChanged?.(f.sessionId, f.session); } catch { /* optional */ }
}
const ID_RE = /^bp-[0-9a-f]{8}$/;
function keeperOr503(res) {
  const k = ctx?.keeper || null;
  if (!k) res.status(503).json({ error: 'browser profiles are not available on this server', code: 'unavailable' });
  return k;
}
/** A live session's conversation identity + Task Groups. */
function sessionFacts(id) {
  const s = ctx?.activeSessions?.get?.(id) || null;
  if (!s) return null;
  let taskIds = [];
  try { taskIds = (ctx.tasksForSession?.(s, id) || []).map((t) => (typeof t === 'string' ? t : t && t.id)).filter(Boolean); } catch { taskIds = []; }
  return { session: s, sessionId: id, browserKey: s._browserKey || null, taskIds };
}
function needKey(res, f) {
  if (!f) { res.status(404).json({ error: 'no such live session', code: 'not-found' }); return null; }
  if (!f.browserKey) { res.status(409).json({ error: 'this session has no browser key (browser isolation is off, or it predates the feature) — it cannot hold a profile', code: 'bad-request' }); return null; }
  return f;
}
/** The wrapper's answer WITHOUT the CDP url (§5.1) — only the wrapper form asks for it, and it asks explicitly. */
function attachAnswer(r, { cdp = false } = {}) {
  const { cdpUrl, ...rest } = r;
  return cdp ? { ...rest, cdpUrl: cdpUrl || null } : rest;
}

// ── UI ──
router.get('/api/browser/profiles', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try { res.json(k.list()); } catch (e) { fail(res, e); }
});
router.post('/api/browser/profiles', (req, res) => {
  // P4: on a CREATE, `host` is the PAIRED MACHINE the browser runs on (D5
  // (b)) — the PURE row decides whether the provider may run there and the
  // keeper whether the id names a paired machine; both refuse by name, so
  // this route does not pre-refuse it (the registry itself is the hub's)
  const k = keeperOr503(res); if (!k) return;
  try { res.json({ profile: k.createProfile(req.body || {}, { owner: { kind: 'instance', id: null } }) }); } catch (e) { fail(res, e); }
});
/** P4 (§7.1): the provider rows with their capability cells, each with the
 *  local verdict and — with `?host=` — the verdict FOR that machine (a
 *  disabled control names its reason), the §7.2.1 egress record, and the
 *  cloakserve plan or its typed refusal. `host` here names the machine the
 *  answer is ABOUT, not one the route acts on, so it is not refused. */
router.get('/api/browser/providers', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const B = require('../browser-profiles.js');
  const host = hostOf(req);
  const h = LOCAL.has(host) ? null : host;
  try {
    const rows = B.providerRows({ host: h, desktopConsent: typeof k.desktopConsent === 'function' ? k.desktopConsent() : undefined });
    const cloak = typeof ctx.cloakPlan === 'function' ? ctx.cloakPlan() : { ok: false, code: 'cloak_opt_in_off', error: 'CloakBrowser is not wired on this instance' };
    res.json({ providers: rows, proof: B.CLOAK_EGRESS_PROOF, host: h, hostKnown: h ? k.hostKnown(h) : true, cloak: cloak.ok ? { ok: true, image: cloak.image, egress: cloak.egress, cdpUrl: cloak.cdpUrl } : cloak, forwards: typeof ctx.forwards === 'function' ? ctx.forwards() : [] });
  } catch (e) { fail(res, e); }
});
router.get('/api/browser/profiles/:id', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const p = k.profile(req.params.id);
  if (!p) return res.status(404).json({ error: `no profile ${req.params.id}`, code: 'not-found' });
  res.json({ profile: require('../browser-profiles.js').publicProfileView(p), leases: k.leasesOn(p.id), browser: k.browserOf(p.id) ? { ...k.browserOf(p.id), cdpUrl: undefined } : null });
});
router.delete('/api/browser/profiles/:id', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json(k.removeProfile(req.params.id)); } catch (e) { fail(res, e); }
});
router.post('/api/browser/profiles/:id/stop', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json({ browser: await k.stop(req.params.id, { why: 'user' }) }); } catch (e) { fail(res, e); }
});
router.post('/api/browser/attach', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.body?.sessionId || ''))); if (!f) return;
  try {
    const was = spellSet(k.setFor(f.browserKey));
    const r = await k.attach({ profile: req.body?.profile, browserKey: f.browserKey, sessionId: f.sessionId, taskIds: f.taskIds, alias: req.body?.alias });
    const set = k.setFor(f.browserKey);
    if (r.created) noteChange(f, { kind: 'browser-profile', was, now: spellSet(set), handles: set.handles.map((h) => h.handle) });
    res.json({ ...attachAnswer(r), attachments: set.attachments, handles: set.handles, defaultId: set.defaultId });
  } catch (e) { fail(res, e); }
});
router.post('/api/browser/detach', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.body?.sessionId || ''))); if (!f) return;
  try {
    const was = spellSet(k.setFor(f.browserKey));
    const r = k.detach({ profile: req.body?.profile, browserKey: f.browserKey });
    const set = k.setFor(f.browserKey);
    noteChange(f, { kind: 'browser-profile', was, now: spellSet(set), handles: set.handles.map((h) => h.handle) });
    res.json({ ...r, attachments: set.attachments, handles: set.handles, defaultId: set.defaultId });
  } catch (e) { fail(res, e); }
});
/** §3.2.5 "New persistent profile from this session's current browser" = ADOPT. */
router.post('/api/browser/adopt', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.body?.sessionId || ''))); if (!f) return;
  const B = require('../browser-profiles.js');
  try {
    const variant = f.session._browserVariant || null;
    const be = ctx.browserEnv?.() || null;
    let profile, adopted = false, note;
    if (variant === B.VARIANTS.C && be) {
      // the symlink's target IS the browserKey-named scratch directory
      const dir = be.resolvedProfileDir(f.browserKey);
      if (!dir) throw Object.assign(new Error('this session\'s browser directory could not be read back off its indirection'), { code: 'adopt_failed' });
      profile = k.adoptScratch({ label: req.body?.label, scratchDir: dir, owner: { kind: 'session', id: f.browserKey } });
      adopted = true;
      note = 'the login that exists in this browser right now is kept: its directory was moved under ~/.agent-browser/ and registered';
    } else {
      // rung D (no directory to adopt — that is the point of D), N, none, H:
      // the honest form is an EMPTY profile, said plainly (§3.2.5)
      profile = k.createProfile({ label: req.body?.label }, { owner: { kind: 'session', id: f.browserKey } });
      note = 'this session\'s browser had no directory of its own to adopt (rung ' + (variant || 'none') + '), so an EMPTY persistent profile was created — the login you just completed was NOT saved; the browser reopens on the new profile and you log in once more';
    }
    const pin = pinAnswer(k, f, profile.id, { by: 'user' });
    res.json({ profile, adopted, note, ...pin });
  } catch (e) { fail(res, e); }
});
/** §3.8 layer ③'s one-click nudge: the USER asks that the agent be reminded
 *  of its pinned profile. ZERO-SPEND by construction — it queues the same
 *  typed `browser-profile` notice a pin/attach does, which rides the user's
 *  own next message (the billed 'wake it now' path is a later, OFF-by-default
 *  producer under its own declared reason). Refused when there is nothing to
 *  remind about, so a click never queues an empty sentence. */
router.post('/api/browser/nudge', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.body?.sessionId || ''))); if (!f) return;
  try {
    const active = f.session._browserProfileActive === undefined ? null : f.session._browserProfileActive;
    const pinned = f.session._browserProfileId || '';
    if (active === null) return res.status(409).json({ error: 'the agent has not used its browser yet — there is nothing to remind it of', code: 'nothing-to-remind' });
    if ((active || '') === pinned) return res.status(409).json({ error: 'the agent is already on the pinned profile', code: 'nothing-to-remind' });
    const label = (id) => (id ? (k.profile(id)?.label || id) : '');
    const set = k.setFor(f.browserKey);
    noteChange(f, { kind: 'browser-profile', was: label(active), now: label(pinned), handles: set.handles.map((h) => h.handle) });
    res.json({ queued: true, was: label(active) || 'ephemeral (no profile)', now: label(pinned) || 'ephemeral (no profile)', rides: 'your next message (no billed turn)' });
  } catch (e) { fail(res, e); }
});
router.get('/api/browser/session/:sessionId', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.params.sessionId || ''))); if (!f) return;
  try { res.json(k.statusFor(f.browserKey)); } catch (e) { fail(res, e); }
});
/** P3 (§4.3): hand a taken-over browser back from OUTSIDE the live view — the
 *  card's "Hand back" / Session Properties. An EXPLICIT handback: the keeper
 *  flips the lease and the announcer delivers through the gated ladder. */
router.post('/api/browser/handback', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.body?.sessionId || ''))); if (!f) return;
  try {
    let t = inputTargetFor(k, f, req.body?.profile);
    if (!t.ok) return failVerdict(res, t);
    // no named target and nothing taken on the default: hand back whichever of this conversation's browsers IS taken
    if (!req.body?.profile && !(k.inputStateFor(f.browserKey, t.profileId).input === 'user')) { const held = k.inputsFor(f.browserKey).find((s) => s.input === 'user'); if (held) t = { ok: true, profileId: held.profileId }; }
    const r = k.handback({ browserKey: f.browserKey, profileId: t.profileId, viewerId: null, cause: 'explicit', url: '', sessionId: f.sessionId });
    if (!r.ok) return failVerdict(res, r);
    res.json({ ok: true, cause: r.cause, heldMs: r.heldMs, profileId: t.profileId, input: k.inputSummaryFor(f.browserKey) });
  } catch (e) { fail(res, e); }
});
/** P3 (§4.3): answer a pending --confirm-actions confirmation from the
 *  conversation's side (the inbox item / Session Properties); the live view's
 *  card uses the stream's `confirm` verb — both end in the keeper. */
router.post('/api/browser/confirm', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.body?.sessionId || ''))); if (!f) return;
  try {
    const t = inputTargetFor(k, f, req.body?.profile);
    if (!t.ok) return failVerdict(res, t);
    const r = await k.answerConfirmation({ browserKey: f.browserKey, profileId: t.profileId, id: req.body?.id, decision: req.body?.decision, envPairs: Array.isArray(f.session._browserEnv) ? f.session._browserEnv : null });
    if (!r.ok) return failVerdict(res, r);
    res.json({ ok: true, id: r.id, decision: r.decision, pending: k.pendingAllFor(f.browserKey) });
  } catch (e) { fail(res, e); }
});
router.post('/api/browser/pin', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.body?.sessionId || ''))); if (!f) return;
  try { res.json(pinAnswer(k, f, req.body?.profile, { by: 'user' })); } catch (e) { fail(res, e); }
});
// ── P4 second half (§7.4): the live backend switch, blocked claims, per-site memory ──
/** The profile a switch names: an id, a label, or (with a session) one of its handles. */
function profileRefFor(k, ref, f = null) {
  const r = String(ref || '').trim();
  if (!r) return null;
  let p = k.profileByRef(r);
  if ((!p || p.ambiguous) && f && f.browserKey) { const a = k.setFor(f.browserKey).attachments.find((x) => x.alias === r); if (a) p = k.profile(a.profileId); }
  if (p && p.ambiguous) throw Object.assign(new Error(`"${r}" names ${p.ambiguous.length} profiles — use the id`), { code: 'ambiguous' });
  return p || null;
}
/** A proposal goes to the "For you" inbox when a session is known to file it under (never a billed turn). */
function fileProposal(f, r, { by }) {
  if (!f || !f.session) return false;
  try { ctx.propose?.(f.sessionId, f.session, { text: `Browser backend: ${r.text}`, detail: `${by === 'agent' ? 'The agent proposes to ' : 'Proposed: '}${r.text}. ${r.detail}`, by }); return true; }
  catch (e) { console.warn('[browser] proposal not filed — ' + (e && e.message)); return false; }
}
router.get('/api/browser/switcher', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try {
    const p = profileRefFor(k, req.query.profile);
    if (!p) return res.status(404).json({ error: `no profile ${req.query.profile || ''}`, code: 'not-found' });
    res.json(k.switcherView(p.id));
  } catch (e) { fail(res, e); }
});
router.post('/api/browser/switch', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try {
    const f = req.body?.sessionId ? sessionFacts(String(req.body.sessionId)) : null;
    const p = profileRefFor(k, req.body?.profile, f);
    if (!p) return res.status(404).json({ error: `no profile ${req.body?.profile || ''}`, code: 'not-found' });
    const r = await k.switchBackend({ profileId: p.id, target: req.body?.provider, by: { kind: 'user' }, browserKey: f ? f.browserKey : null, sessionId: f ? f.sessionId : null, confirmDowngrade: req.body?.confirmDowngrade === true, makeDefault: req.body?.makeDefault === true });
    if (r.mode === 'proposal') return res.json({ ...r, filed: fileProposal(f, r, { by: 'user' }) });
    res.json(r);
  } catch (e) { fail(res, e); }
});
router.delete('/api/browser/blocked/:id', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try { res.json({ removed: k.clearBlocked(String(req.params.id || '')) }); } catch (e) { fail(res, e); }
});
router.get('/api/browser/site-hints', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try { res.json({ siteHints: k.siteHints() }); } catch (e) { fail(res, e); }
});
router.post('/api/browser/site-hints', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try { res.json({ hint: k.addSiteHint({ host: req.body?.site || req.body?.url, tier: req.body?.tier, backend: req.body?.backend, why: req.body?.why, by: 'user' }), siteHints: k.siteHints() }); } catch (e) { fail(res, e); }
});
router.delete('/api/browser/site-hints/:host', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try { res.json({ removed: k.dropSiteHint(String(req.params.host || '')), siteHints: k.siteHints() }); } catch (e) { fail(res, e); }
});
/** §7.4 failure form (1): the INSTALL action — GET = the verdict (no side
 *  effect; a refusal is a 200 carrying `{ok:false, code, error}` so a card
 *  can render the disabled control WITH its reason), POST = the act (a
 *  refusal is the typed 4xx). Local only: a paired machine's binary is its
 *  own to install. "Measure first, then install" — the keeper spawns nothing
 *  on a refusal. */
router.get('/api/browser/install', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try { res.json(k.installVerdict()); } catch (e) { fail(res, e); }
});
router.post('/api/browser/install', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try { res.json(await k.installCloak()); } catch (e) { fail(res, e); }
});
/** ONE pin implementation for both surfaces: resolve the profile (id, label
 *  or this session's HANDLE), record the pin on the CONVERSATION, re-point
 *  the running session's indirection (browser-env.repointPin), persist it to
 *  the session's meta (a restart keeps it), say honestly when it applies —
 *  and, for a USER's pin, queue the zero-billed `browser-pin` notice (§3.8
 *  layer ②; the agent's own pin needs no notice: its answer IS the telling). */
function pinAnswer(k, f, ref, { by = 'agent' } = {}) {
  const B = require('../browser-profiles.js');
  let p = null;
  if (ref !== null && ref !== undefined && ref !== '' && ref !== false) {
    p = k.profileByRef(ref);
    if (!p) { const a = k.setFor(f.browserKey).attachments.find((x) => x.alias === String(ref).trim()); if (a) p = k.profile(a.profileId); }
    if (!p) throw Object.assign(new Error(`no profile ${ref}`), { code: 'not-found' });
    if (p.ambiguous) throw Object.assign(new Error(`"${ref}" names ${p.ambiguous.length} profiles — use the id`), { code: 'ambiguous' });
  }
  const before = k.setFor(f.browserKey);
  const prevPin = k.pinFor(f.browserKey);
  const pin = k.setPin(f.browserKey, p ? p.id : null, { origin: 'chosen' });
  if (f.session) { f.session._browserProfileId = p ? p.id : null; f.session._browserPinOrigin = p ? 'chosen' : 'harness'; }
  try { ctx.persistPin?.(f.session, p ? p.id : null, p ? 'chosen' : 'harness'); } catch (e) { console.warn('[browser] pin not persisted to session meta — ' + (e && e.message)); }
  let repoint = null;
  try { repoint = ctx.browserEnv?.()?.repointPin?.(f.browserKey, p ? p.dir : null) || null; } catch (e) { repoint = { ok: false, why: String(e && e.message) }; }
  const liveBrowser = k.leasesFor(f.browserKey).length > 0;
  const after = k.setFor(f.browserKey);
  if (by === 'user') noteChange(f, { kind: 'browser-pin', was: prevPin ? prevPin.label : '', now: p ? p.label : '', handles: after.handles.map((h) => h.handle) });
  else k.tell(f.browserKey);
  try { ctx.onPinChanged?.(f.sessionId, f.session, pin); } catch { /* optional */ }
  return { pin, repoint, appliesFrom: B.pinApplyNotice({ liveBrowser }), attachments: after.attachments, handles: after.handles, defaultId: after.defaultId, changedSet: before.fingerprint !== after.fingerprint };
}

// ── AGENT (the CLI) ──
function agentFacts(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
  if (!token || !token.startsWith('vsst_')) { res.status(401).json({ error: 'missing session token', code: 'unauthorized' }); return null; }
  for (const [id, s] of (ctx?.activeSessions || new Map())) if (s && s.agentToken === token) return needKey(res, sessionFacts(id));
  res.status(401).json({ error: 'unknown session token', code: 'unauthorized' });
  return null;
}
router.get('/api/agent/browser/profiles', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try { res.json({ ...k.list(), me: k.statusFor(f.browserKey) }); } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/use', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    const r = await k.attach({ profile: req.body?.profile, browserKey: f.browserKey, sessionId: f.sessionId, taskIds: f.taskIds, alias: req.body?.alias });
    const set = k.setFor(f.browserKey);
    k.tell(f.browserKey);
    stampActive(f, r.profile.id); // `use` execs a subshell on this profile: the agent's next direct commands land here
    const mine = set.attachments.find((a) => a.profileId === r.profile.id) || null;
    res.json({ ...attachAnswer(r, { cdp: req.body?.wrapper === true }), alias: mine ? mine.alias : null, attachments: set.attachments, handles: set.handles, defaultId: set.defaultId });
  } catch (e) { fail(res, e); }
});
/** §3.7: WHICH browser does this CLI command act on. ONE call for the
 *  wrapper form: the refusals are typed, the env is the attachment's, and only
 *  `wrapper:true` receives the CDP url. */
/** The env a CHILD handle browses with (§3.7 / D23): on rung D the child gets its
 *  OWN generated config through browser-env (the parent's with `profile` deleted),
 *  so a pinned parent never hands its directory to a second namespace. */
function childEnvOf(f, childKey) {
  const B = require('../browser-profiles.js');
  const variant = f.session._browserVariant || null;
  let cc = null;
  if (String(variant || '') === B.VARIANTS.D) {
    try { cc = ctx.browserEnv?.()?.childConfigFor?.(childKey) || null; } catch (e) { cc = { path: null, namesProfile: null, why: String(e && e.message) }; }
    if (cc && !cc.path) console.warn(`[browser] child ${childKey}: no config of its own (${cc.why}) — ${cc.namesProfile ? 'the parent\'s config is unset for it' : 'the parent\'s profile-less config is shared'}`);
  }
  return B.childEnvFor({ childKey, parentVariant: variant, childConfigPath: cc ? cc.path : null, parentNamesProfile: cc ? cc.namesProfile : null });
}
/** takeover C3 (design-browser-takeover §5, D7/D8): is this session's OWN
 *  browser one the keeper manages? A local session on an isolated rung whose
 *  spawn pairs name its conversation's browser. The shared rung (isolation
 *  off) and a remote session (rung H, ssh / paired device) stay unmanaged. */
function managedPairs(f) {
  const B = require('../browser-profiles.js');
  const s = f.session || {};
  if (!B.isolatedVariant(s._browserVariant) || s._browserVariant === B.VARIANTS.H) return null;
  if (s.hostId || s.host) return null;
  const v = B.ephemeralPairsVerdict(s._browserEnv, f.browserKey);
  return v.ok ? v.pairs : null;
}
const sessionNameOf = (f) => String((f.session && (f.session.name || f.session.webuiName)) || f.sessionId || '');
/** r1 (takeover finding 2): what the CLI builds its child env on. The CLI
 *  drops EVERY `AGENT_BROWSER_*` key of its shell (each refused flag has an env
 *  twin the browser CLI honours), so the server hands back the session's OWN
 *  spawn pairs as recorded at spawn (`_browserEnv`; agentEnv() stripped every
 *  other one) — `spawnEnv` — and, on rung H, the session name whose host-side
 *  scratch dir the prelude may have exported (`hostProfile`). No record of the
 *  pairs on an isolated rung (a session that predates it) ⇒ `spawnEnv` is
 *  omitted and the CLI keeps the identity pairs as its shell has them.
 *  r2 (the socket root is identity): a LOCAL session's answer names the root
 *  the keeper's runtime uses for the browser `pairs` name (`socketDir`) and the
 *  runtime dir it runs with (`runtimeDir`, null = none) — the CLI sets both on
 *  the child last, so the shell's AGENT_BROWSER_SOCKET_DIR / XDG_RUNTIME_DIR
 *  never pick the daemon. Rung H (unmanaged, D8) names only the BASE of the
 *  short directory its prelude may export (`hostSocketBase`): the CLI keeps a
 *  shell value only when it is exactly `<base>/vs-ab-<its uid>`. */
function hostSocketBase() {
  const B = require('../browser-profiles.js');
  let base = null;
  try { base = ctx.browserEnv?.()?.socketDirBase || null; } catch { base = null; }
  return B.socketDirBaseOf(typeof base === 'string' ? base : B.SOCKET_DIR_BASE);
}
function envBasis(f, { k = null, pairs = null, ephemeral = true } = {}) {
  const B = require('../browser-profiles.js');
  const s = f.session || {};
  const out = {};
  if (Array.isArray(s._browserEnv)) out.spawnEnv = s._browserEnv.filter((kv) => typeof kv === 'string' && /^AGENT_BROWSER_[A-Z_]+=/.test(kv));
  else if (!B.isolatedVariant(s._browserVariant)) out.spawnEnv = [];
  if (s._browserVariant === B.VARIANTS.H && B.isBrowserKey(f.browserKey)) out.hostProfile = B.sessionNameFor(f.browserKey);
  const remote = s._browserVariant === B.VARIANTS.H || !!(s.hostId || s.host);
  if (s._browserVariant === B.VARIANTS.H) out.hostSocketBase = hostSocketBase();
  else if (!remote && k && typeof k.socketRootOf === 'function') {
    const sr = k.socketRootOf(Array.isArray(pairs) ? pairs : null);
    out.socketDir = sr.socketDir;
    out.runtimeDir = sr.runtimeDir;
    // takeover r3 (finding 2): THE CONFIG IS NAMED — the file the keeper runs this browser with (the pairs'
    // own generated config, else the keeper's machine file for the kind); the CLI sets it on the child LAST,
    // so the binary never searches ./agent-browser.json in the agent's directory (a remote session gets none:
    // its CLI composes one there by the same rule)
    if (typeof k.configFileFor === 'function') { const c = k.configFileFor({ ephemeral, pairs: Array.isArray(pairs) ? pairs : null }); if (c) out.config = c; }
  }
  return out;
}
router.post('/api/agent/browser/resolve', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const B = require('../browser-profiles.js');
  try {
    const v = k.resolveFor({ browserKey: f.browserKey, handle: req.body?.handle || '', subagent: sidechainOpen(f.session) });
    if (!v.ok) return failVerdict(res, v);
    if (v.kind === 'none') {
      // D7 (design-browser-takeover §5.3): a session on the SHARED rung (isolation
      // off, or the one local corner that gave it nothing) drives the machine's
      // browser — `close --all` there would close every agent's browser, so it
      // is refused BY NAME here, and the answer says the browser is shared
      const shared = !B.isolatedVariant(f.session._browserVariant);
      const argv = Array.isArray(req.body?.argv) ? req.body.argv.map(String) : [];
      if (shared && argv[0] === 'close' && argv.includes('--all')) {
        return res.status(409).json({ error: 'this session drives the machine\'s SHARED browser (per-session browsers are off here) — `close --all` would close every agent\'s browser', code: 'shared_browser', remedy: '`vibespace-browser close` closes your tab only; `tab close` closes the current tab', handles: v.handles || [] });
      }
      // takeover C3 (§5.1): no attachment on a local isolated rung ⇒ THIS
      // conversation's managed ephemeral browser — recorded, counted, started
      // (or adopted) under the session's OWN spawn pairs (never a re-run of
      // the ladder); a refusal (browser_cap / launch_failed)
      // is typed like any other
      const pairs = shared ? null : managedPairs(f);
      if (pairs && typeof k.ensureEphemeral === 'function') {
        const e = await k.ensureEphemeral({ browserKey: f.browserKey, sessionId: f.sessionId, envPairs: pairs, sessionName: sessionNameOf(f), variant: f.session._browserVariant || null });
        stampActive(f, '');
        return res.json({ ok: true, kind: 'ephemeral', shared: false, handle: null, env: pairs, ...envBasis(f, { k, pairs }), profile: e.profile, browser: e.browser, lease: e.lease, created: e.created, handles: v.handles, pinTab: false });
      }
      stampActive(f, '');
      return res.json({ ok: true, kind: 'none', shared, handle: null, env: [], ...envBasis(f, { k, pairs: f.session._browserEnv, ephemeral: !shared }), handles: v.handles, pinTab: false });
    }
    if (v.kind === 'child') {
      const env = childEnvOf(f, v.handle);
      // takeover C3: a managed conversation's child handle gets its OWN
      // ephemeral record (reaped with the parent), under the pairs a child
      // command runs with (the parent's, minus the unset, plus the child's)
      const parentPairs = managedPairs(f);
      const childPairs = B.childPairsOver(parentPairs || (Array.isArray(f.session._browserEnv) ? f.session._browserEnv : []), env);
      if (parentPairs && typeof k.ensureEphemeral === 'function') {
        const e = await k.ensureEphemeral({ browserKey: v.handle, sessionId: f.sessionId, envPairs: childPairs, sessionName: `${sessionNameOf(f)} · child ${v.handle.slice(v.handle.indexOf('.') + 1)}`, variant: f.session._browserVariant || null });
        return res.json({ ok: true, kind: 'child', handle: v.handle, env: env.pairs, unset: env.unset, ...envBasis(f, { k, pairs: childPairs }), handles: v.handles, pinTab: false, profile: e.profile, browser: e.browser });
      }
      return res.json({ ok: true, kind: 'child', handle: v.handle, env: env.pairs, unset: env.unset, ...envBasis(f, { k, pairs: childPairs }), handles: v.handles, pinTab: false });
    }
    const r = await k.attach({ profileId: v.attachment.profileId, browserKey: f.browserKey, sessionId: f.sessionId, taskIds: f.taskIds });
    stampActive(f, v.attachment.profileId); // the command RUNS on this attachment: that is what the chip calls "last used"
    // r2: an attachment's daemon lives under the keeper's own root (its pairs never carry SOCKET_DIR), whatever the session's spawn pairs say
    res.json({ ok: true, kind: 'attachment', handle: v.handle, ...attachAnswer(r, { cdp: req.body?.wrapper === true }), ...envBasis(f, { k, pairs: r.env, ephemeral: false }), handles: v.handles, isDefault: !!v.attachment.isDefault });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/new-child', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const B = require('../browser-profiles.js');
  try {
    const c = k.newChild({ browserKey: f.browserKey, sessionId: f.sessionId });
    const env = childEnvOf(f, c.handle);
    k.tell(f.browserKey);
    res.json({ ...c, env: env.pairs, unset: env.unset, handles: k.setFor(f.browserKey).handles });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/audit', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    const ref = req.body?.profile;
    const p = ref ? (k.profileByRef(ref) || null) : null;
    const a = !p || p.ambiguous ? k.setFor(f.browserKey).attachments.find((x) => x.alias === String(ref || '').trim()) : null;
    // takeover C3: this conversation's (or its child's) managed ephemeral record names the line too — never another's
    const eph = !a && (!p || p.ambiguous) && ref && typeof k.profile === 'function' ? k.profile(String(ref)) : null;
    const ephOk = !!(eph && eph.ephemeral && eph.owner && require('../browser-profiles.js').parentKeyOf(eph.owner.id) === f.browserKey);
    const profileId = a ? a.profileId : (p && !p.ambiguous ? p.id : (ephOk ? eph.id : null));
    // P4 (§7.4 step 1): a navigation stamps the lease's lastUrl — the URL a switch re-opens; the audit LINE stays verb-only
    if (profileId && typeof req.body?.url === 'string') k.noteLeaseUrl(f.browserKey, profileId, req.body.url);
    k.audit({ sessionId: f.sessionId, browserKey: f.browserKey, profileId, verb: req.body?.verb, ok: req.body?.ok !== false });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});
/** P4: the same provider rows for the CLI (`vibespace-browser providers`),
 *  with the verdict for `?host=` when given — an agent learns WHY a provider
 *  is refused before it asks for one. */
router.get('/api/agent/browser/providers', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const B = require('../browser-profiles.js');
  const host = hostOf(req);
  const h = LOCAL.has(host) ? null : host;
  const cloak = typeof ctx.cloakPlan === 'function' ? ctx.cloakPlan() : { ok: false, code: 'cloak_opt_in_off', error: 'CloakBrowser is not wired on this instance' };
  res.json({ providers: B.providerRows({ host: h, desktopConsent: typeof k.desktopConsent === 'function' ? k.desktopConsent() : undefined }), proof: B.CLOAK_EGRESS_PROOF, host: h, hostKnown: h ? k.hostKnown(h) : true, cloak: cloak.ok ? { ok: true, image: cloak.image, egress: cloak.egress } : cloak });
});
router.post('/api/agent/browser/new', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    // `--adopt <dir>`: REGISTER a directory that already exists, in place (the
    // remedy the path refusal names — a path becomes a HANDLE here, never on a
    // command); refused with the reason when it is not a directory
    const adoptDir = req.body?.adoptDir ? String(req.body.adoptDir) : '';
    if (adoptDir) {
      // ADOPTABLE ROOTS (2026-09-21): the user's own browser directory is never a
      // session's to register — the PURE verdict names the roots and the remedy
      const B = require('../browser-profiles.js');
      const roots = ctx.adoptRoots || {};
      let existing = null; try { existing = (k.list().profiles || []).find((p) => p && p.dir === adoptDir) || null; } catch { existing = null; }
      const v = B.adoptDirVerdict({ dir: adoptDir, homeDir: roots.homeDir || null, dataDir: roots.dataDir || null, existing, browserKey: f.browserKey });
      if (!v.ok) return res.status(v.code === 'adopt_failed' ? 409 : 403).json({ error: v.error, code: v.code });
      const a = k.adoptDirectory({ label: req.body?.label, dir: adoptDir, owner: { kind: 'session', id: f.browserKey } });
      if (!a.profile) return res.status(409).json({ error: a.why || 'cannot adopt that directory', code: 'adopt_failed' });
      return res.json({ profile: a.profile, adopted: true, created: a.created });
    }
    res.json({ profile: k.createProfile(req.body || {}, { owner: { kind: 'session', id: f.browserKey } }) });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/detach', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    const r = k.detach({ profile: req.body?.profile, browserKey: f.browserKey });
    const set = k.setFor(f.browserKey);
    k.tell(f.browserKey);
    res.json({ ...r, attachments: set.attachments, handles: set.handles, defaultId: set.defaultId });
  } catch (e) { fail(res, e); }
});
router.get('/api/agent/browser/status', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const B = require('../browser-profiles.js');
  // `shared` (D7): the bare verbs of a session on the shared rung reach the machine's browser — status says so
  try { res.json({ ...k.statusFor(f.browserKey), sessionId: f.sessionId, shared: !B.isolatedVariant(f.session._browserVariant) }); } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/pin', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try { res.json(pinAnswer(k, f, req.body?.profile, { by: 'agent' })); } catch (e) { fail(res, e); }
});
/** P4 (§7.4): the profile an agent's backend verb acts on — a named handle/id, else the set's default / only member; the
 *  ephemeral browser has no registry record, so it is refused with the remedy (a switch is a property of a PROFILE). */
function agentProfileFor(k, f, ref) {
  const named = profileRefFor(k, ref, f);
  if (named) return named;
  if (ref) throw Object.assign(new Error(`this session is not attached to ${JSON.stringify(String(ref))}`), { code: 'not_attached' });
  const t = inputTargetFor(k, f, '');
  if (!t.ok) throw Object.assign(new Error(t.error), { code: t.code, handles: t.handles });
  if (!t.profileId) throw Object.assign(new Error('your browser is the ephemeral one (no profile) — a backend is a property of a PROFILE: `vibespace-browser new <label>` then `use` it, and switch that'), { code: 'no_profile' });
  return k.profile(t.profileId);
}
router.get('/api/agent/browser/backend', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    const p = agentProfileFor(k, f, req.query.profile);
    const v = k.switcherView(p.id);
    const set = k.setFor(f.browserKey);
    res.json({ ...v, attachments: set.attachments.map((a) => ({ ...a, chip: k.chipFor(k.profile(a.profileId) || { provider: 'chromium' }) })), me: f.browserKey });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/backend', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    const p = agentProfileFor(k, f, req.body?.profile);
    const r = await k.switchBackend({ profileId: p.id, target: req.body?.provider, by: { kind: 'agent' }, browserKey: f.browserKey, sessionId: f.sessionId, confirmDowngrade: req.body?.confirmDowngrade === true });
    if (r.mode === 'proposal') return res.json({ ...r, filed: fileProposal(f, r, { by: 'agent' }) });
    k.tell(f.browserKey);
    res.json(r);
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/blocked', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    let profileId = null;
    try { const p = profileRefFor(k, req.body?.profile, f); if (p) profileId = p.id; else { const t = inputTargetFor(k, f, ''); if (t.ok) profileId = t.profileId; } } catch { profileId = null; }
    const r = k.blocked({ url: req.body?.url, why: req.body?.why, evidence: req.body?.evidence, tier: req.body?.tier, browserKey: f.browserKey, sessionId: f.sessionId, profileId });
    let remembered = null;
    if (req.body?.remember === true) { try { remembered = k.addSiteHint({ host: r.claim.host, tier: r.claim.tier, backend: null, why: r.claim.why || 'blocked (agent claim)', by: 'agent' }); } catch (e) { remembered = { error: String(e && e.message), code: e && e.code }; } }
    res.json({ ...r, remembered, next: 'the user sees your claim in the live view with a one-click "Open with CloakBrowser" — the switch is THEIR act; `vibespace-browser backend <name>` proposes it yourself' });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/site-hint', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try { res.json({ hint: k.addSiteHint({ host: req.body?.site || req.body?.url, tier: req.body?.tier, backend: req.body?.backend, why: req.body?.why, by: 'agent' }) }); } catch (e) { fail(res, e); }
});

module.exports = { router, setup };
