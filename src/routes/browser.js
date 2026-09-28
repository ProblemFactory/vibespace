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
 *   DELETE /api/browser/profiles/:id[?unpin=1] refused while leased or running; the dir is kept; lane S2: a PINNED profile is
 *                                             refused `pinned` {count, names} unless `unpin` — then every pin is cleared first
 *   POST   /api/browser/profiles/:id/stop     stop its browser (leases stay; it restarts on the next attach)
 *   POST   /api/browser/attach                { sessionId, profile }   a live session's conversation → profile
 *   POST   /api/browser/detach                { sessionId, profile? }
 *   GET    /api/browser/session/:sessionId    that session's leases / pin / origin / attachment set (§3.7) + MULTIVIEW: its
 *                                             helpers' browsers (`children[].browser`), their inputs, `cap` {own, cap, origin,
 *                                             explicit, machine:{used, cap}} and the helpers' witnessed `helperNames`
 *   POST   /api/browser/cap                   { sessionId, cap: 1..6 | null }   MULTIVIEW D4: the conversation's own browser cap
 *   POST   /api/browser/session/:sessionId/stop   { ref }   MULTIVIEW: stop ONE of this session's own browsers (a shared
 *                                             profile is refused `shared`); the ref is resolved inside the session's list
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
  // owner ruling A: a pin is an attachment default now — P6's `pin_refused` is gone; one driver at a time on a shared browser
  mediation_unavailable: 503, mediation_no_cdp: 502, pinned: 409, browser_busy: 409,
  // identity verify r2 (2026-09-28): a conversation on another machine never uses / pins / is listed on a profile
  remote_session: 409,
  // §3.7 / §3.8 — the handle refusals are typed so the CLI prints the code and the agent can read why
  profile_required: 409, profile_changed: 409, not_attached: 404, profile_path_refused: 400, bad_alias: 400, alias_taken: 409, adopt_failed: 409,
  // P3 (§4.3): the user drives ⇒ the agent's command is refused typed; the control verbs' own refusals
  browser_paused: 409, held: 409, not_taken: 409, no_confirmation: 404, 'no-browser': 409, refused: 409,
  // the owner's ruling (2026-09-27): a command the takeover caught in flight (the audit's answer names it; never a route refusal of its own)
  browser_interrupted: 409,
  // P4 second half (§7.4 / §7.5): the switch's typed refusals — three named backend refusals (D33), the ladder, seats, the gap
  backend_unavailable: 400, backend_no_key: 409, backend_seat_taken: 409, backend_seat_ceiling: 409, downgrade_refused: 409, downgrade_unknown: 409,
  switch_refused: 400, switch_export_only: 400, switch_noop: 409, browser_restarting: 409, hint_tier_with_backend: 400, host_underivable: 400, no_profile: 409,
  // §7.4 failure form (1): the INSTALL action's typed refusals (src/browser-switch.js INSTALL_CODES)
  install_local_only: 400, already_installed: 409, install_running: 409, install_precondition_unmet: 409, install_unavailable: 503,
  // takeover C3 (design-browser-takeover §5): the managed ephemeral browser — the shared ceiling (D2), a record that is
  // never attached / edited by id, pairs that name no browser of this conversation, the real CLI missing on this machine
  browser_cap: 409, not_attachable: 409, not_editable: 409, not_managed: 409, binary_absent: 503,
  // lane H verify r2 M1: a profile directory another browser holds (a lock the keeper cannot prove its own orphan's)
  // r4/r5: a profile's browser closed and not started again (a failed / unidentified relaunch), or its heal budget spent
  profile_locked: 409, browser_closed: 409, browser_unstable: 409,
  // MULTIVIEW (design-browser-multiview §2 / D4): a Stop of a browser that has not started (a view's refusal is lane H's browser_stopped); a shared profile is not one of yours to stop
  browser_released: 409, shared: 409,
  // B-f7ab: a live session that could not get its browser key on first use (the reason in `why`), or is not running any more
  // "Who can use it" is a LIST (2026-09-27): the whole-list rule, the write's refusals, the resolver of a picked session,
  // and a Task Group list that could not be read (never `not_owner`)
  'list-changed': 409, empty_list: 400, too_many: 400, unknown_task: 400, unknown_conversation: 400, no_browser_key: 409, 'session-gone': 410, groups_unreadable: 409 };
function fail(res, e) {
  const code = e?.code || null;
  // B-f7ab verify r2 (LOW): a key minted by THIS call rides a refused answer too (`res.locals.minted`, set by needKey) — the
  // agent's first command may be refused (not_owner, launch_failed…) and it still needs to know nothing needs restarting
  res.status(STATUS[code] || 500).json({ error: String(e?.message || e), code, ...(e?.holders ? { holders: e.holders } : {}), ...(e?.why ? { why: e.why } : {}), ...(e?.remedy ? { remedy: e.remedy } : {}), ...(res.locals && res.locals.minted ? { minted: res.locals.minted } : {}),
    // P4 (§7.4): a refusal carries its ACTIONABLE way out (`action.openIntegration`), the ways out of a refused downgrade, and whether one human confirmation would do
    // MULTIVIEW D4: WHICH cap refused (this conversation's own, or the machine's) + the counts — never another session's name
    ...(e?.scope ? { scope: e.scope } : {}), ...(Number.isFinite(e?.others) ? { others: e.others } : {}), ...(Number.isFinite(e?.capOwn) ? { own: e.capOwn, cap: e.capOf } : {}),
    ...(e?.action ? { action: e.action } : {}), ...(Array.isArray(e?.waysOut) && e.waysOut.length ? { waysOut: e.waysOut } : {}), ...(e?.needsConfirm ? { needsConfirm: true } : {}), ...(e?.provider ? { provider: e.provider } : {}), ...(e?.integrationId ? { integrationId: e.integrationId } : {}),
    // lane H verify r2: a thrown `browser_paused` (an agent's detach while the user drives) carries when, like a resolve's; `profile_locked` names the holder pid
    ...(Number.isInteger(e?.takenAt) && e.takenAt > 0 ? { takenAt: e.takenAt, lastUserInputAt: e.lastUserInputAt || 0 } : {}), ...(Number.isInteger(e?.holderPid) ? { holderPid: e.holderPid } : {}),
    // the rebuilt switch dialog: a switch whose target did not START carries its rollback facts (whatever the code) —
    // the dialog words the answer by them first: `restored` (the profile is back as it was), `from`, `to`
    ...(typeof e?.restored === 'boolean' ? { restored: e.restored, from: e.from || null, to: e.to || null } : {}),
    ...rulingExtras(e) });
}
/** Owner ruling A: the extras a refusal on the sharing paths carries — `browser_busy`'s holder (a NAME: the ruling's "told
 *  so by name") + who drives + the bound to wait; a pin that did not open says `pinned` and which profile. */
function rulingExtras(v) {
  return { ...(v && v.holder !== undefined && v.holder !== null ? { holder: v.holder } : {}), ...(v && (v.by === 'user' || v.by === 'agent') && v.code === 'browser_busy' ? { by: v.by } : {}),
    ...(v && Number.isFinite(v.retryAfterMs) ? { retryAfterMs: v.retryAfterMs } : {}), ...(v && v.pinned ? { pinned: true, pinnedProfile: v.pinnedProfile || null } : {}) };
}
/** A typed `{ok:false, code, …}` verdict → the same wire shape a thrown refusal gets, with its extras kept. */
function failVerdict(res, v) { return res.status(STATUS[v.code] || 409).json({ error: String(v.error || v.code), code: v.code, handles: v.handles || [], ...(v.default !== undefined ? { default: v.default } : {}), ...(v.was !== undefined ? { was: v.was } : {}), ...(v.now !== undefined ? { now: v.now } : {}), ...(v.takenAt !== undefined ? { takenAt: v.takenAt, lastUserInputAt: v.lastUserInputAt || 0 } : {}), ...(v.remedy ? { remedy: v.remedy } : {}), ...(Number.isInteger(v.holderPid) ? { holderPid: v.holderPid } : {}), ...rulingExtras(v), ...(res.locals && res.locals.minted ? { minted: res.locals.minted } : {}) }); } // B-f7ab verify r2: + the key this call minted (LOW)
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
 *  agent hears it on the user's next message. Optional wiring, never throws.
 *  A "change" whose two sides are the same words is no change and says
 *  nothing (lane J, 2026-09-25: re-choosing the ticked "Unpinned" row in the
 *  live view's title menu told the agent "ephemeral (no profile) → ephemeral
 *  (no profile) (by user)" — a notice the agent can only misread). */
function noteChange(f, { kind, was, now, handles }) {
  const B = require('../browser-profiles.js');
  if (String(was || '') === String(now || '')) return false;
  try { ctx.notice?.(f.sessionId, f.session, { ...B.profileChangeNotice({ was, now, by: 'user', handles }), kind }); } catch (e) { console.warn('[browser] notice not queued — ' + (e && e.message)); }
}
/** Lane H (2026-09-25): the conversation → browser-key BINDING (P0 r5's store, written at the meta choke
 *  point) is re-asked ONCE per live session when its managed ephemeral browser starts or is first used —
 *  the wiring re-runs that same choke point (`writeSessionMeta`'s rule: bindable id, the move/share
 *  belts), never a second writer with its own rule; a stopped conversation's trace is found through it. */
const bindingAsked = new WeakSet();
function ensureBindingOnce(f) {
  if (!f || !f.session || bindingAsked.has(f.session)) return;
  bindingAsked.add(f.session);
  try { ctx.ensureBinding?.(f.session); } catch (e) { console.warn('[browser] binding not re-asked — ' + (e && e.message)); }
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
/** A live session's conversation identity + Task Groups (asked NOW — membership is judged at every command). A store
 *  read that THREW is `groupsUnreadable` beside `taskIds: []` — never "no groups" (with Task Group rows in a profile's
 *  list that would be a silent revoke). */
function sessionFacts(id) {
  const s = ctx?.activeSessions?.get?.(id) || null;
  if (!s) return null;
  let taskIds = [], groupsUnreadable = false;
  try { taskIds = (ctx.tasksForSession?.(s, id) || []).map((t) => (typeof t === 'string' ? t : t && t.id)).filter(Boolean); } catch (e) { taskIds = []; groupsUnreadable = true; console.warn(`[browser] ${id}: the Task Group list could not be read — ${e && e.message}`); }
  // identity verify r2 (2026-09-28): a session on ANOTHER machine (an ssh host / a paired device — rung H) is named so
  const remote = !!(s.hostId || s.host || s._browserVariant === require('../browser-profiles.js').VARIANTS.H);
  return { session: s, sessionId: id, browserKey: s._browserKey || null, taskIds, groupsUnreadable, remote };
}
/**
 * THE ONE RESOLVER OF A PICKED LIVE SESSION (§6.3): the "Who can use it" dialog picks live sessions by their webui id;
 * the list stores the conversation's BROWSER KEY. → `{ok, key, name}` | `{ok:false, code, error}`:
 *   gone ⇒ session-gone · on another machine ⇒ no_browser_key (the Agent browser runs on this machine only)
 *   carries a key ⇒ it · else `ctx.ensureBrowserKey` when the wiring provides it (mints + binds, idempotent) · else
 *   no_browser_key: "{name}" has no browser of its own yet — restart it (Terminate → Resume), then add it
 * A PIN IS NEVER CONSULTED HERE; a remote session is never offered.
 */
async function keyForPickedSession(webuiId) {
  const B = require('../browser-profiles.js');
  const f = sessionFacts(String(webuiId || ''));
  if (!f) return { ok: false, code: 'session-gone', error: 'that conversation is not running any more — pick it again from the list' };
  const name = String(f.session.webuiName || f.session.name || f.sessionId);
  if (f.session.hostId || f.session.host) return { ok: false, code: 'no_browser_key', why: 'remote', name, error: `"${name}" runs on another machine — the Agent browser runs on this machine only` };
  if (B.isBrowserKey(f.browserKey)) return { ok: true, key: f.browserKey, name };
  if (typeof ctx?.ensureBrowserKey === 'function') {
    try {
      const r = await ctx.ensureBrowserKey(f.session, { sessionId: f.sessionId }); // the engine's signature (src/server/browser-key.js) — liveness asked by this id
      const key = r && typeof r === 'object' ? r.key : r;
      if (B.isBrowserKey(key)) return { ok: true, key, name };
      return { ok: false, code: (r && r.code) || 'no_browser_key', why: r && r.why, name, error: (r && r.error) || `"${name}" has no browser of its own yet — restart it (Terminate → Resume), then add it` };
    } catch (e) { return { ok: false, code: 'no_browser_key', name, error: `"${name}" has no browser of its own yet — ${e && e.message}` }; }
  }
  return { ok: false, code: 'no_browser_key', name, error: `"${name}" has no browser of its own yet — restart it (Terminate → Resume), then add it` };
}
/** B-f7ab: a live session with no browser key YET (it started before per-session browsers, or while they were off)
 *  gets one here, on its first browser use — THE engine function (src/server/browser-key.js `ensureBrowserKey`: the
 *  spawn's own mint, env composition and pin ladder; the binding rides the ONE meta choke point). Idempotent and
 *  synchronous; what it cannot mint is refused BY NAME (`no_browser_key` + `why` + the words a person can act on, or
 *  `session-gone`), never the old "it predates the feature" dead end. `f.minted` rides to the resolve answer. */
function needKey(res, f) {
  if (!f) { res.status(404).json({ error: 'no such live session', code: 'not-found' }); return null; }
  if (!f.browserKey) {
    const B = require('../browser-profiles.js');
    let r = null;
    try { r = typeof ctx?.ensureBrowserKey === 'function' ? ctx.ensureBrowserKey(f.session, { sessionId: f.sessionId }) : B.lateKeyRefusal('unavailable'); }
    catch (e) { console.warn(`[browser] ${f.sessionId}: the late browser key threw — ${e && e.message}`); r = B.lateKeyRefusal('unavailable'); }
    if (!r || !r.ok || !B.isBrowserKey(r.key)) {
      const v = r && !r.ok ? r : B.lateKeyRefusal('unavailable');
      res.status(STATUS[v.code] || 409).json({ error: v.error, code: v.code, why: v.why, remedy: v.remedy });
      return null;
    }
    f.browserKey = r.key;
    if (r.minted) { f.minted = { key: r.key, origin: r.origin || 'new', variant: r.variant || null }; if (res && res.locals) res.locals.minted = f.minted; }
  }
  return f;
}
/** The wrapper's answer WITHOUT the CDP url (§5.1) — only the wrapper form asks for it, and it asks explicitly.
 *  `agent` = the asking conversation's facts: the record rides as the AGENT's view (identity verify r2, 2026-09-28 — the
 *  `use` / `resolve` answers carried the raw record: the list, every other conversation's key, `createdBy`). */
function attachAnswer(r, { cdp = false, agent = null } = {}) {
  const { cdpUrl, ...rest } = r;
  const out = cdp ? { ...rest, cdpUrl: cdpUrl || null } : rest;
  if (agent && out.profile) out.profile = require('../browser-profiles.js').agentProfileView(out.profile, agent, { mediated: !!out.profile.mediated });
  return out;
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
  // owner ruling A: a named profile is usable by ALL of the owner's conversations by default (the row's switch narrows it)
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
  // lane S2 (naive study 2, T7): refuse-or-warn — a pinned profile is removed only with `unpin` (every pin cleared first)
  const unpin = req.query.unpin === '1' || req.query.unpin === 'true' || req.body?.unpin === true;
  try {
    const rv = typeof k.removeVerdict === 'function' ? k.removeVerdict(req.params.id) : { ok: true };
    if (!rv.ok) return res.status(STATUS[rv.code] || 409).json({ error: rv.error, code: rv.code }); // leased / running first: never an unpin for a removal that cannot happen
    const g = pinGuardFor(req.params.id, unpin); if (g) return res.status(409).json(g);
    const u = unpin ? unpinProfile(req.params.id) : { cleared: 0, sessions: [] };
    res.json({ ...k.removeProfile(req.params.id, { unpin }), unpinned: u.cleared });
  } catch (e) { fail(res, e); }
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
    // the USER's attach WRITES the list (§3.3): a profile kept to other conversations gets this one added, then attached
    const r = await k.attach({ profile: req.body?.profile, browserKey: f.browserKey, sessionId: f.sessionId, taskIds: f.taskIds, groupsUnreadable: f.groupsUnreadable, alias: req.body?.alias, by: 'user' });
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
    const r = k.detach({ profile: req.body?.profile, browserKey: f.browserKey, by: 'user' }); // lane H verify r2 L8: the UI's detach is the USER's (it may end their own takeover)
    const set = k.setFor(f.browserKey);
    noteChange(f, { kind: 'browser-profile', was, now: spellSet(set), handles: set.handles.map((h) => h.handle) });
    res.json({ ...r, attachments: set.attachments, handles: set.handles, defaultId: set.defaultId });
  } catch (e) { fail(res, e); }
});
/** §3.2.5 "New persistent profile from this session's current browser" = ADOPT. Owner ruling A: the new profile is
 *  usable by ALL of the owner's conversations (`createdBy` = this one), and on rung C the conversation's own browser is
 *  STOPPED before its directory moves — its Chrome holds the lock under a mark that names the conversation, and the
 *  keeper's launch on the adopted directory would be refused `profile_locked` (never a raw kill of a used browser). */
router.post('/api/browser/adopt', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.body?.sessionId || ''))); if (!f) return;
  const B = require('../browser-profiles.js');
  try {
    const variant = f.session._browserVariant || null;
    const be = ctx.browserEnv?.() || null;
    let profile, adopted = false, note;
    const all = { owner: { kind: 'instance', id: null }, createdBy: f.browserKey };
    if (variant === B.VARIANTS.C && be) {
      // the symlink's target IS the browserKey-named scratch directory
      const dir = be.resolvedProfileDir(f.browserKey);
      if (!dir) throw Object.assign(new Error('this session\'s browser directory could not be read back off its indirection'), { code: 'adopt_failed' });
      if (typeof k.stopEphemeralOf === 'function') { try { await k.stopEphemeralOf(f.browserKey); } catch (e) { console.warn(`[browser] ${f.browserKey}: its own browser did not stop before the adopt — ${e && e.message}`); } }
      profile = k.adoptScratch({ label: req.body?.label, scratchDir: dir, ...all });
      adopted = true;
      note = 'the login that exists in this browser right now is kept: its directory was moved under ~/.agent-browser/ and registered — every conversation of yours can use it';
    } else {
      // rung D (no directory to adopt — that is the point of D), N, none, H:
      // the honest form is an EMPTY profile, said plainly (§3.2.5)
      profile = k.createProfile({ label: req.body?.label }, all);
      note = 'this session\'s browser had no directory of its own to adopt (rung ' + (variant || 'none') + '), so an EMPTY persistent profile was created — the login you just completed was NOT saved; the next browser command opens the new profile and you log in once more';
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
  // MULTIVIEW §4: + the helpers' WITNESSED names (handle → its Task's description) — the strip's list is browser-stream.browserListFor over this one answer
  try { res.json({ ...k.statusFor(f.browserKey), helperNames: require('../server/browser-helpers.js').namesOf(f.session), backend: f.session.backend || null }); } catch (e) { fail(res, e); }
});
/** MULTIVIEW D4: THIS conversation's per-conversation browser cap — a USER act
 *  (the strip's `own/cap` chip, Session Properties). `cap` 1..6, or null = back
 *  to the default (Task Group > instance setting > 3). Kept per conversation
 *  (a resume keeps it), copied to the session meta, re-published live. */
router.post('/api/browser/cap', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.body?.sessionId || ''))); if (!f) return;
  try {
    const r = k.setCap(f.browserKey, req.body?.cap === undefined ? null : req.body.cap);
    f.session._browserCap = r.explicit;
    try { ctx.persistCap?.(f.session, r.explicit); } catch (e) { console.warn('[browser] cap not persisted — ' + (e && e.message)); }
    try { ctx.onLiveFactsChanged?.(f.sessionId, f.session); } catch { /* optional */ }
    res.json(r);
  } catch (e) { fail(res, e); }
});
/** MULTIVIEW D4 / B-325a: stop ONE of this session's own browsers from the chip's
 *  list — its ephemeral browser, a helper's, or an attachment NO other
 *  conversation holds (a shared profile is refused `shared`: detach instead).
 *  The ref is resolved inside THIS session's list, never a bare profile id. */
router.post('/api/browser/session/:sessionId/stop', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.params.sessionId || ''))); if (!f) return;
  const S = require('../browser-stream.js');
  const ref = String(req.body?.ref || '').trim();
  try {
    const rows = S.browserListFor({ ...k.statusFor(f.browserKey), helperNames: {} });
    const row = rows.find((r) => r.ref === ref);
    if (!row) return res.status(404).json({ error: 'that browser is not one of this session\'s', code: 'not-found' });
    if (!row.profileId) return res.status(409).json({ error: 'that browser has not started', code: 'browser_released' });
    if (row.kind === 'attachment' && row.owners > 0) return res.status(409).json({ error: `this profile's browser is shared with ${row.owners} other conversation${row.owners === 1 ? '' : 's'} — detach it instead`, code: 'shared' });
    res.json({ ref, browser: await k.stop(row.profileId, { why: 'user' }) });
  } catch (e) { fail(res, e); }
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
/** OWNER RULING A: a pin never hands a directory. A session pinned BEFORE the ruling may still have its indirection (rung
 *  D's generated config / rung C's symlink) naming a registered profile's directory — the next launch of its OWN
 *  browser would open a second Chrome there (exit 21, the study's path B). That indirection is put back on the
 *  conversation's own (repointPin(key, null)) — only when it names a profile's directory; never otherwise. */
function clearPinnedDir(k, f) {
  let be = null; try { be = ctx.browserEnv?.() || null; } catch { be = null; }
  if (!be || typeof be.resolvedProfileDir !== 'function' || typeof be.repointPin !== 'function') return null;
  let dir = null; try { dir = be.resolvedProfileDir(f.browserKey); } catch { dir = null; }
  if (!dir) return null;
  const B = require('../browser-profiles.js');
  let profiles = []; try { profiles = k.list().profiles || []; } catch { profiles = []; }
  const hit = profiles.find((x) => x && x.dir && B.sameDir(x.dir, dir));
  if (!hit) return null;
  let r = null; try { r = be.repointPin(f.browserKey, null); } catch (e) { r = { ok: false, why: String(e && e.message) }; }
  console.log(`[browser] ${f.browserKey}: its indirection named profile ${hit.id}'s directory (a pin from before owner ruling A) — ${r && r.ok ? 'put back on its own browser' : 'NOT put back: ' + (r && r.why)}`);
  return r;
}
/** ONE pin implementation for both surfaces: resolve the profile (id, label
 *  or this session's HANDLE), record the pin on the CONVERSATION (who pinned it:
 *  a USER pin is an authorization, owner ruling A (4)), persist it to the
 *  session's meta (a restart keeps it), say honestly when it applies — and,
 *  for a USER's pin, queue the zero-billed `browser-pin` notice (§3.8 layer
 *  ②; the agent's own pin needs no notice: its answer IS the telling).
 *  OWNER RULING A: the pin is the conversation's DEFAULT ATTACHMENT — its next
 *  bare command opens the profile through the keeper (joined when running);
 *  NOTHING is re-pointed at the profile's directory any more. A pin that MOVES
 *  (or an unpin) detaches exactly the lease the previous pin MADE (`via:'pin'`),
 *  never an attachment the agent made itself. */
function pinAnswer(k, f, ref, { by = 'agent' } = {}) {
  const B = require('../browser-profiles.js');
  let p = null;
  if (ref !== null && ref !== undefined && ref !== '' && ref !== false) {
    // identity verify r2 (2026-09-28): a conversation on another machine never pins a profile (the pin could never open —
    // attachPin answers `none` on rung H — and the user's pick used to write its key into "Who can use it"); an UNPIN stays
    if (f.remote) { const rr = B.remoteSessionRefusal({ label: String(ref) }); throw Object.assign(new Error(rr.error), { code: rr.code, remedy: rr.remedy }); }
    p = k.profileByRef(ref);
    if (!p) { const a = k.setFor(f.browserKey).attachments.find((x) => x.alias === String(ref).trim()); if (a) p = k.profile(a.profileId); }
    if (!p) throw Object.assign(new Error(`no profile ${ref}`), { code: 'not-found' });
    if (p.ambiguous) throw Object.assign(new Error(`"${ref}" names ${p.ambiguous.length} profiles — use the id`), { code: 'ambiguous' });
  }
  const before = k.setFor(f.browserKey);
  const prevPin = k.pinFor(f.browserKey);
  const pin0 = k.setPin(f.browserKey, p ? p.id : null, { origin: 'chosen', by: by === 'user' ? 'user' : 'agent', taskIds: Array.isArray(f.taskIds) ? f.taskIds : null, groupsUnreadable: !!f.groupsUnreadable });
  // THE PICK WRITES THE LIST (§3.3): the answer says when this conversation was added to the ones that may use it
  const { added = null, ...pinRest } = pin0 || {};
  const pin = pin0 ? pinRest : null;
  if (f.session) { f.session._browserProfileId = p ? p.id : null; f.session._browserPinOrigin = p ? 'chosen' : 'harness'; }
  try { ctx.persistPin?.(f.session, p ? p.id : null, p ? 'chosen' : 'harness'); } catch (e) { console.warn('[browser] pin not persisted to session meta — ' + (e && e.message)); }
  // the pin moved off a profile whose lease the PIN made ⇒ that lease goes (never one the agent attached itself)
  let detached = null;
  if (prevPin && (!p || prevPin.profileId !== p.id)) {
    const l = k.leasesFor(f.browserKey).find((x) => x.profileId === prevPin.profileId && x.via === 'pin');
    if (l) { try { k.detach({ profileId: prevPin.profileId, browserKey: f.browserKey, by: by === 'user' ? 'user' : 'agent' }); detached = prevPin.profileId; } catch (e) { console.warn(`[browser] ${f.browserKey}: the lease the previous pin made on ${prevPin.profileId} stays — ${e && e.message}`); } }
  }
  const repoint = clearPinnedDir(k, f);
  const liveBrowser = k.leasesFor(f.browserKey).length > 0 || !!(typeof k.ephemeralFor === 'function' && k.ephemeralFor(f.browserKey) && k.ephemeralFor(f.browserKey).live);
  const after = k.setFor(f.browserKey);
  // a USER pin that moved the pin says so, once; one that re-chose the current pin (the ticked row) moved nothing and says nothing
  const moved = (prevPin ? prevPin.profileId : null) !== (p ? p.id : null);
  if (by === 'user') { if (moved) noteChange(f, { kind: 'browser-pin', was: prevPin ? prevPin.label : '', now: p ? p.label : '', handles: after.handles.map((h) => h.handle) }); }
  else k.tell(f.browserKey);
  try { ctx.onPinChanged?.(f.sessionId, f.session, pin); } catch { /* optional */ }
  return { pin, repoint, detached, appliesFrom: B.pinApplyNotice({ liveBrowser, label: p ? p.label : '' }), attachments: after.attachments, handles: after.handles, defaultId: after.defaultId, changedSet: before.fingerprint !== after.fingerprint, moved, ...(added ? { added } : {}) };
}
/** OWNER RULING A: a pinned conversation's first bare command with NO attachment opens its pin THROUGH THE KEEPER (the
 *  profile's one browser, joined when another conversation runs it) — then it resolves again as that attachment (every
 *  check an attachment gets: paused, busy). A pin that does not open is a TYPED refusal naming the pin (`pinned:true`),
 *  recorded for the conversation's facts — NEVER a silent fall-back to a temporary browser (the study's path B). A
 *  remote session (rung H) never had a pin applied here: it keeps its own browser, as before. */
async function attachPin(k, f, v, verb = null) {
  const B = require('../browser-profiles.js');
  const s = f.session || {};
  if (s._browserVariant === B.VARIANTS.H || s.hostId || s.host) return { ...v, kind: 'none' };
  const p = k.profile(v.profileId);
  const label = p ? p.label : v.profileId;
  try {
    await k.attach({ profileId: v.profileId, browserKey: f.browserKey, sessionId: f.sessionId, taskIds: f.taskIds, groupsUnreadable: f.groupsUnreadable, by: 'pin' });
  } catch (e) {
    try { k.notePinFailure?.(f.browserKey, { profileId: v.profileId, code: e && e.code, error: e && e.message }); } catch { /* optional */ }
    console.warn(`[browser] ${f.browserKey}: its pinned profile ${v.profileId} "${label}" did not open — ${e && (e.code || '')} ${e && e.message}`);
    return { ok: false, code: (e && e.code) || 'launch_failed', pinned: true, pinnedProfile: { id: v.profileId, label },
      error: `your pinned profile "${label}" did not open: ${String((e && e.message) || e)} — tell the user; nothing else was opened instead`,
      ...(e && e.remedy ? { remedy: e.remedy } : {}), ...(e && Number.isInteger(e.holderPid) ? { holderPid: e.holderPid } : {}), handles: v.handles || [] };
  }
  try { k.clearPinFailure?.(f.browserKey); } catch { /* optional */ }
  k.tell(f.browserKey); // the verb's own set change never earns it a one-time profile_changed
  return k.resolveFor({ browserKey: f.browserKey, handle: '', subagent: sidechainOpen(f.session), verb }); // the verb rides the re-resolve (a paused refusal still names it for the handback's re-run list)
}
/** Owner ruling A (6): Delete… releases the profile first — every conversation's lease detached BY THE USER (each live
 *  one hears it on its next message: layer ②'s zero-billed notice) and its browser stopped. */
async function releaseProfile(profileId) {
  const k = ctx && ctx.keeper;
  if (!k || typeof k.releaseAll !== 'function') return { detached: [], stopped: false };
  const p = k.profile(profileId);
  const r = await k.releaseAll(profileId);
  for (const d of r.detached) {
    const s = d.sessionId ? ctx.activeSessions?.get?.(d.sessionId) : null;
    if (!s) continue;
    const set = k.setFor(d.browserKey);
    noteChange({ session: s, sessionId: d.sessionId, browserKey: d.browserKey }, { kind: 'browser-profile', was: p ? p.label : profileId, now: spellSet(set), handles: set.handles.map((h) => h.handle) });
  }
  return r;
}
/** Owner ruling A — the boot conversion: every live session whose indirection still names a profile's directory (a pin
 *  from before the ruling) is put back on its own browser; the pin itself stays (it is the default attachment now). */
function convertPinnedDirs() {
  const k = ctx && ctx.keeper;
  if (!k) return 0;
  let n = 0;
  for (const [id, s] of (ctx.activeSessions || new Map())) {
    if (!s || !s._browserKey) continue;
    const r = clearPinnedDir(k, { session: s, sessionId: id, browserKey: s._browserKey });
    if (r) n++;
  }
  return n;
}

// ── lane S2 (naive study 2, T7): a deleted profile leaves NO dangling pin ──
/** The conversations whose pin names `profileId` — the keeper's pins AND a live session's own record (a pin the
 *  keeper never mirrored) — with the live ones' names (the UI's "3 conversations use this profile — unpin them?"). */
function pinHoldersOf(profileId) {
  const k = ctx && ctx.keeper;
  const out = new Map();
  if (k && typeof k.pinnedBy === 'function') for (const x of k.pinnedBy(profileId)) out.set(x.browserKey, { browserKey: x.browserKey, name: '', sessionId: null });
  for (const [id, s] of (ctx?.activeSessions || new Map())) {
    if (!s || !s._browserKey) continue;
    const hit = out.get(s._browserKey) || (s._browserProfileId === profileId ? { browserKey: s._browserKey, name: '', sessionId: null } : null);
    if (!hit) continue;
    hit.sessionId = id; hit.name = String(s.webuiName || s.name || '');
    out.set(s._browserKey, hit);
  }
  return [...out.values()];
}
/** null = may proceed; else the 409 body (`code:'pinned'`, the count, the names, the sentence). */
function pinGuardFor(profileId, unpin = false) {
  const k = ctx && ctx.keeper;
  const p = k ? k.profile(profileId) : null;
  const v = require('../browser-fact.js').deletePinnedVerdict({ label: p ? p.label : '', pinnedBy: pinHoldersOf(profileId), unpin });
  return v.ok ? null : { error: v.error, code: v.code, count: v.count, names: v.names };
}
/**
 * Clear every pin naming `profileId` BEFORE its record goes: a live conversation through THE pin implementation
 * (`pinAnswer(…, null, {by:'user'})` — its session record + meta, its browser-env indirection moved OFF the
 * directory (else the next launch would recreate an empty profile at the old path), the agent's zero-billed notice),
 * a stopped one in the keeper + its env; each entry keeps the cleared MARK the browser fact reads. Never throws.
 */
function unpinProfile(profileId) {
  const k = ctx && ctx.keeper;
  if (!k) return { cleared: 0, sessions: [] };
  const p = k.profile(profileId);
  const label = p ? p.label : '';
  let cleared = 0; const sessions = [];
  for (const h of pinHoldersOf(profileId)) {
    try {
      const s = h.sessionId ? ctx.activeSessions.get(h.sessionId) : null;
      if (s) { pinAnswer(k, { session: s, sessionId: h.sessionId, browserKey: h.browserKey, taskIds: [] }, null, { by: 'user' }); sessions.push(h.sessionId); }
      else { try { ctx.browserEnv?.()?.repointPin?.(h.browserKey, null); } catch (e) { console.warn(`[browser] ${h.browserKey}: pin re-point off a deleted profile failed — ${e && e.message}`); } }
      k.clearPin(h.browserKey, { cleared: { id: profileId, label } });
      cleared++;
    } catch (e) { console.warn(`[browser] ${h.browserKey}: pin not cleared before deleting ${profileId} — ${e && e.message}`); }
  }
  if (cleared) console.log(`[browser] profile ${profileId}${label ? ' "' + label + '"' : ''}: ${cleared} conversation pin(s) cleared before its removal (${sessions.length} live)`);
  return { cleared, sessions };
}
/** A live session whose pin names a profile the registry no longer has (a delete before this fix, a hand-edited
 *  store): cleared at boot the same way, the MARK without a label ("a deleted profile"). */
function healDanglingPins() {
  const k = ctx && ctx.keeper;
  if (!k) return 0;
  let n = 0;
  for (const [id, s] of (ctx.activeSessions || new Map())) {
    if (!s || !s._browserKey || !s._browserProfileId || k.profile(s._browserProfileId)) continue;
    const gone = s._browserProfileId;
    try {
      pinAnswer(k, { session: s, sessionId: id, browserKey: s._browserKey, taskIds: [] }, null, { by: 'user' });
      k.clearPin(s._browserKey, { cleared: { id: gone, label: '' } });
      n++;
      console.log(`[browser] ${id}: its pin named ${gone}, a profile that no longer exists — cleared (the chip says so)`);
    } catch (e) { console.warn(`[browser] ${id}: dangling pin ${gone} not cleared — ${e && e.message}`); }
  }
  return n;
}

// ── AGENT (the CLI) ──
/** The asking session's facts by its vsst_ token — null when the token names no live session (the belt and
 *  `agentFacts` share this ONE resolution; the facts are stashed on the request for the belt). */
function askerOf(req) {
  if (req._agentFacts !== undefined) return req._agentFacts;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
  let f = null;
  if (token && token.startsWith('vsst_')) for (const [id, s] of (ctx?.activeSessions || new Map())) if (s && s.agentToken === token) { f = sessionFacts(id); break; }
  req._agentFacts = f;
  return f;
}
/**
 * THE SERVER BELT on `/api/agent/browser/*` (identity verify r3, 2026-09-28): ONE wrapper, registered BEFORE every agent
 * route, so the body of every `res.json` on this prefix — a success, a refusal, a route written raw tomorrow — passes the
 * PURE `agentAnswerView` last: another conversation's browser key in any string is masked, its webui / conversation id
 * masked, its browser pid nulled; what the asker itself sent is left as it wrote it; `$.drivers` is the one exception
 * (browser-profiles.BELT_EXCEPTIONS). The per-route views (`agentDigestView` / `agentProfileView`) still decide the
 * SHAPE an agent is told (no `owner` list, no `createdBy`, other rows reduced) — the belt is the last line for the
 * identifier class, not a substitute. scripts/test-browser-identity-census.mjs proves the belt precedes every route
 * and walks every answer of a fixture at runtime.
 */
const AGENT_PREFIX = '/api/agent/browser';
function foreignOf(f) {
  const B = require('../browser-profiles.js');
  const me = f ? B.parentKeyOf(String(f.browserKey || '')) : '';
  const ids = new Set(), pids = new Set();
  for (const [id, s] of (ctx?.activeSessions || new Map())) {
    if (!s || (f && id === f.sessionId)) continue;
    for (const v of [id, s.claudeSessionId, s.backendSessionId]) if (typeof v === 'string' && v) ids.add(v);
  }
  const k = ctx?.keeper || null;
  if (k && typeof k.ephemerals === 'function') { try { for (const e of k.ephemerals()) if (Number.isInteger(e.pid) && (!me || B.parentKeyOf(String(e.browserKey || '')) !== me)) pids.add(e.pid); } catch { /* the belt masks what it can read */ } }
  return { ids, pids };
}
function agentBelt(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    let out = body;
    try {
      const B = require('../browser-profiles.js');
      const f = askerOf(req);
      out = B.agentAnswerView(body, { me: f ? f.browserKey : null, foreign: foreignOf(f), echoes: B.echoesOf(req.body, req.query, req.params) });
    } catch (e) { console.warn(`[browser] the agent belt could not judge an answer — ${e && e.message}`); out = { error: 'the answer could not be judged for another conversation\'s identifiers', code: 'belt_failed' }; }
    return json(out);
  };
  next();
}
router.use(AGENT_PREFIX, agentBelt);
function agentFacts(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
  if (!token || !token.startsWith('vsst_')) { res.status(401).json({ error: 'missing session token', code: 'unauthorized' }); return null; }
  const f = askerOf(req);
  if (f) return needKey(res, f);
  res.status(401).json({ error: 'unknown session token', code: 'unauthorized' });
  return null;
}
/** The digest as an AGENT may see it (§4.1; the owner's default 3): every profile stays LISTED (an agent may ask the user
 *  for one it cannot use) but each row says only whether THIS conversation may use it and through what (`use.you` /
 *  `use.via`) — never the list, never `owner` / `createdBy` (another conversation's key), and the pins narrowed to its own. */
function agentDigest(k, f) {
  const B = require('../browser-profiles.js');
  // identity verify r2 (2026-09-28): the WHOLE digest through the ONE agent view — every profile row through
  // agentProfileView, other conversations' lease / grant / ephemeral / claim rows without their keys and session ids
  return B.agentDigestView(k.list(), agentFactsOf(f), (id) => k.profile(id));
}
/** The asking conversation's admission facts (the ONE shape every agent view takes). */
const agentFactsOf = (f) => ({ browserKey: f.browserKey, taskIds: f.taskIds, groupsUnreadable: f.groupsUnreadable });
router.get('/api/agent/browser/profiles', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try { res.json({ ...agentDigest(k, f), me: k.statusFor(f.browserKey) }); } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/use', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    const r = await k.attach({ profile: req.body?.profile, browserKey: f.browserKey, sessionId: f.sessionId, taskIds: f.taskIds, groupsUnreadable: f.groupsUnreadable, alias: req.body?.alias });
    const set = k.setFor(f.browserKey);
    k.tell(f.browserKey);
    stampActive(f, r.profile.id); // `use` execs a subshell on this profile: the agent's next direct commands land here
    const mine = set.attachments.find((a) => a.profileId === r.profile.id) || null;
    res.json({ ...attachAnswer(r, { cdp: req.body?.wrapper === true, agent: agentFactsOf(f) }), alias: mine ? mine.alias : null, attachments: set.attachments, handles: set.handles, defaultId: set.defaultId });
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
  // B-f7ab: a key minted by THIS call (the session had none) is said in the answer — the CLI prints one note line
  const send = (o) => res.json(f.minted ? { ...o, minted: f.minted } : o);
  try {
    // the owner's ruling (2026-09-27): a verb refused while the user drives goes on the handback's re-run list (its NAME only)
    const verb = require('../browser-profiles.js').auditVerbOf(Array.isArray(req.body?.argv) ? req.body.argv.map(String) : []);
    let v = k.resolveFor({ browserKey: f.browserKey, handle: req.body?.handle || '', subagent: sidechainOpen(f.session), verb });
    // owner ruling A: a pin is this conversation's DEFAULT ATTACHMENT, opened through the keeper — never a directory
    if (v.ok && v.kind === 'pin') v = await attachPin(k, f, v, verb);
    if (!v.ok) return failVerdict(res, v);
    // …and the SERVER's instant this command was allowed to run: the CLI hands it back with its audit, and a takeover that
    // began at or after it caught the command in flight (`interrupted` — one clock, the server's, for every machine)
    const resolvedAt = typeof k.clock === 'function' ? k.clock() : Date.now(); // the keeper's clock — the one its takeovers are stamped on
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
        ensureBindingOnce(f); // lane H: its actions stay findable after the conversation stops
        return send({ ok: true, kind: 'ephemeral', shared: false, handle: null, env: pairs, ...envBasis(f, { k, pairs }), profile: e.profile, browser: e.browser, lease: e.lease, created: e.created, handles: v.handles, pinTab: false, at: resolvedAt });
      }
      stampActive(f, '');
      return send({ ok: true, kind: 'none', shared, handle: null, env: [], ...envBasis(f, { k, pairs: f.session._browserEnv, ephemeral: !shared }), handles: v.handles, pinTab: false, at: resolvedAt });
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
        return send({ ok: true, kind: 'child', handle: v.handle, env: env.pairs, unset: env.unset, ...envBasis(f, { k, pairs: childPairs }), handles: v.handles, pinTab: false, profile: e.profile, browser: e.browser, at: resolvedAt });
      }
      return send({ ok: true, kind: 'child', handle: v.handle, env: env.pairs, unset: env.unset, ...envBasis(f, { k, pairs: childPairs }), handles: v.handles, pinTab: false, at: resolvedAt });
    }
    const r = await k.attach({ profileId: v.attachment.profileId, browserKey: f.browserKey, sessionId: f.sessionId, taskIds: f.taskIds, groupsUnreadable: f.groupsUnreadable });
    stampActive(f, v.attachment.profileId); // the command RUNS on this attachment: that is what the chip calls "last used"
    // r2: an attachment's daemon lives under the keeper's own root (its pairs never carry SOCKET_DIR), whatever the session's spawn pairs say
    send({ ok: true, kind: 'attachment', handle: v.handle, ...attachAnswer(r, { cdp: req.body?.wrapper === true, agent: agentFactsOf(f) }), ...envBasis(f, { k, pairs: r.env, ephemeral: false }), handles: v.handles, isDefault: !!v.attachment.isDefault, at: resolvedAt });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/new-child', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const B = require('../browser-profiles.js');
  try {
    const c = k.newChild({ browserKey: f.browserKey, sessionId: f.sessionId });
    require('../server/browser-helpers.js').noteChild(f.session, c.handle); // MULTIVIEW §4: the mint half of the witness pairing
    const env = childEnvOf(f, c.handle);
    k.tell(f.browserKey);
    res.json({ ...c, env: env.pairs, unset: env.unset, handles: k.setFor(f.browserKey).handles });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/audit', async (req, res) => {
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
    // THE AGENT IS TOLD (the owner's ruling, 2026-09-27 — "告知agent发生了打断"): a takeover that began at or after this
    // command's /resolve caught it in flight — the CLI prints it by name and exits as a refusal. A child handle's pair is
    // its own key (a helper's browser); an unmanaged / ephemeral command asks the conversation's own pair.
    const since = Number(req.body?.since) || 0;
    let interrupted = null;
    if (since > 0 && typeof k.interruptionFor === 'function') {
      const child = typeof req.body?.handle === 'string' && require('../browser-profiles.js').isChildKey(req.body.handle) && require('../browser-profiles.js').parentKeyOf(req.body.handle) === f.browserKey ? req.body.handle : null;
      // verify r6: a mediated lease's aborted calls may still be answered by the browser (a fill's text LANDED) — wait, bounded, so the words are true
      if (!child && profileId && typeof k.awaitInterruptionSettled === 'function') { try { await k.awaitInterruptionSettled({ browserKey: f.browserKey, profileId }); } catch { /* the answer below stands */ } }
      interrupted = k.interruptionFor({ browserKey: child || f.browserKey, profileId: child ? null : profileId, since, verb: req.body?.verb }); // verify r5: the interrupted verb joins the handback's re-run list
    }
    res.json({ ok: true, ...(interrupted ? { interrupted } : {}) });
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
  const B = require('../browser-profiles.js');
  // identity verify r3 (2026-09-28): the record an agent's `new` / `--adopt` answers rides as the AGENT's view (never
  // `owner` / `createdBy` raw — the adopt of a directory another conversation registered is refused by name before this)
  const view = (p) => B.agentProfileView(p, agentFactsOf(f), { mediated: typeof k.isMediated === 'function' ? !!k.isMediated(p) : !!(p && p.sharing === 'instance') });
  try {
    // a conversation on ANOTHER machine never makes a profile here: it could never use it (r2's fence at every admission),
    // so a `new` from an ssh host / a paired device is refused by the same name — it keeps its own browser on its machine
    if (f.remote) { const rr = B.remoteSessionRefusal({ label: String(req.body?.label || '') }); return res.status(STATUS[rr.code] || 409).json({ error: rr.error, code: rr.code, remedy: rr.remedy }); }
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
      // owner ruling A: usable by ALL of the owner's conversations (`createdBy` = this one); the user's panel switch narrows it
      const a = k.adoptDirectory({ label: req.body?.label, dir: adoptDir, owner: { kind: 'instance', id: null }, createdBy: f.browserKey });
      if (!a.profile) return res.status(409).json({ error: a.why || 'cannot adopt that directory', code: 'adopt_failed' });
      return res.json({ profile: view(a.profile), adopted: true, created: a.created });
    }
    // owner ruling A ("A吧"): an agent's `new` makes a profile EVERY conversation of the owner can use — the study's path A
    // (`new work` in one chat, `use work` in the next ⇒ not_owner) is gone; only the user's row switch keeps one to one chat
    res.json({ profile: view(k.createProfile(req.body || {}, { owner: { kind: 'instance', id: null }, createdBy: f.browserKey })) });
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
    // the record as an AGENT may see it (§4.1, the owner's default 3): never `owner` (the list — other conversations'
    // keys) / `createdBy` / `scopeAt`; `use` says only whether THIS conversation may use it (verify 2026-09-28: the raw
    // record rode this answer for ANY profile named by ref, admitted or not)
    const B = require('../browser-profiles.js');
    // …and the view's lease / claim rows likewise (identity verify r2, 2026-09-28: they rode whole — another
    // conversation's key + webui session id — for ANY profile named by ref, admitted or not)
    const agent = B.agentDigestView({ leases: v.leases, blocked: v.blocked }, agentFactsOf(f));
    res.json({ ...v, leases: agent.leases, blocked: agent.blocked, profile: B.agentProfileView(p, agentFactsOf(f), { mediated: !!(v.profile && v.profile.mediated) }), attachments: set.attachments.map((a) => ({ ...a, chip: k.chipFor(k.profile(a.profileId) || { provider: 'chromium' }) })), me: f.browserKey });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/backend', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    const p = agentProfileFor(k, f, req.body?.profile);
    const r = await k.switchBackend({ profileId: p.id, target: req.body?.provider, by: { kind: 'agent' }, browserKey: f.browserKey, sessionId: f.sessionId, confirmDowngrade: req.body?.confirmDowngrade === true, taskIds: f.taskIds, groupsUnreadable: f.groupsUnreadable });
    if (r.mode === 'proposal') return res.json({ ...r, filed: fileProposal(f, r, { by: 'agent' }) });
    k.tell(f.browserKey);
    res.json(r);
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/blocked', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    let profileId = null, named = null;
    try { named = profileRefFor(k, req.body?.profile, f); if (named) profileId = named.id; else { const t = inputTargetFor(k, f, ''); if (t.ok) profileId = t.profileId; } } catch { profileId = null; }
    // identity verify r3 (2026-09-28): a claim names a block the agent HIT in this profile's browser — a profile the list keeps
    // from this conversation is not one it could have hit a block in; refused by the admission's own name (the user's live
    // view of a kept profile never shows a stranger's claim with a one-click switch beside it)
    if (named && !named.ambiguous) { const B = require('../browser-profiles.js'); const may = B.mayAttach(named, agentFactsOf(f)); if (!may.ok) return res.status(STATUS[may.code] || 409).json({ error: may.error, code: may.code, ...(may.remedy ? { remedy: may.remedy } : {}) }); }
    const r = k.blocked({ url: req.body?.url, why: req.body?.why, evidence: req.body?.evidence, tier: req.body?.tier, browserKey: f.browserKey, sessionId: f.sessionId, profileId });
    let remembered = null;
    if (req.body?.remember === true) { try { remembered = k.addSiteHint({ host: r.claim.host, tier: r.claim.tier, backend: null, why: r.claim.why || 'blocked (agent claim)', by: 'agent' }); } catch (e) { remembered = { error: String(e && e.message), code: e && e.code }; } }
    // the rebuilt dialog: the live view offers the switch ONLY when another browser is available for this profile
    // (SW.switchChoices, the digest's `backends[id].choices`) — the agent is told which world it is in
    let choices = [];
    try { choices = profileId && typeof k.choicesFor === 'function' ? k.choicesFor(profileId) : []; } catch { choices = []; }
    const next = choices.includes('cloak')
      ? 'the user sees your claim in the live view with a one-click "Switch to CloakBrowser…" — the switch is THEIR act; `vibespace-browser backend <name>` proposes it yourself'
      : 'the user sees your claim in the live view; no other browser is available on this instance, so the switch is not offered there — it is THEIR act to arrange one; `vibespace-browser backend` lists the rows';
    res.json({ ...r, remembered, next });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/site-hint', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try { res.json({ hint: k.addSiteHint({ host: req.body?.site || req.body?.url, tier: req.body?.tier, backend: req.body?.backend, why: req.body?.why, by: 'agent' }) }); } catch (e) { fail(res, e); }
});

module.exports = { router, setup, unpinProfile, pinGuardFor, healDanglingPins, pinHoldersOf, releaseProfile, convertPinnedDirs, keyForPickedSession, sessionFacts, STATUS }; // + "Who can use it": the ONE resolver of a picked live session (the trace routes' PATCH calls it) // lane S2: the delete's refuse-or-warn + the one unpin (+ the boot heal); owner ruling A: Delete…'s release; the boot conversion of pre-ruling pins
