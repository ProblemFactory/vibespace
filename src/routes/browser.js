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
 *                                             §7.2.1 egress record, the forwards
 *   POST   /api/browser/profiles              { label, provider?, proxy?, notes?, record?, host?, cdpPort? }
 *                                             P4: `host` = the PAIRED machine the browser runs on (chromium via the
 *                                             browser-serve op, cdp via tcpForward); `cdpPort` = a cdp profile's port
 *   GET    /api/browser/profiles/:id
 *   DELETE /api/browser/profiles/:id[?unpin=1] refused while leased or running; the dir is kept; lane S2: a PINNED profile is
 *                                             refused `pinned` {count, names} unless `unpin` — then every pin is cleared first
 *   POST   /api/browser/profiles/:id/stop     stop its browser (leases stay; it restarts on the next attach)
 *   POST   /api/agent/browser/restart         an agent's restart of ITS profile's browser — only while judged hung (browser_unresponsive)
 *   POST   /api/browser/profiles/:id/browse   BROWSE YOURSELF (B-6ae8): the USER as one more holder — the browser started /
 *                                             joined through the same start() an agent's command runs, HIS OWN pinned tab
 *                                             opened; nothing of any agent is paused → {how, key, syncId, fresh}; the refusals
 *                                             of src/browser-human.js by name (no `host`: local profiles only in v1)
 *   POST   /api/browser/browse/:key/navigate  { url | verb:back|forward|reload | tab }   his address row / Tabs pane — the
 *                                             daemon's own verbs under HIS session only; web addresses only (not_web)
 *   POST   /api/browser/browse/:key/close     Close — his tab closes, the browser stays for the agents (idles out by the rule)
 *   POST   /api/browser/browse/:key/quit      Quit the whole browser — a stop for everyone (the client's confirm names them)
 *   (none of the four has an /api/agent/… twin — an agent never starts, ends, navigates or views the user's own browsing)
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
 *                                             announced through the gated ladder; 409 not_taken when nobody drives it;
 *                                             r6 A-F9: optional `expectWakes` (the count shown) — 409 wake_count_changed {wakes}
 *   POST   /api/browser/confirm               { sessionId, profile?, id, decision: confirm|deny, shown }   P3: answer a pending
 *                                             --confirm-actions confirmation through upstream's own verb; 404 no_confirmation
 *                                             (r6 A-F8: also when the id is not pending for THIS browser — nothing sent); a
 *                                             Confirm carries `shown` = confirmationDigest of its card: 400 shown_required,
 *                                             409 confirmation_changed {digest}
 *   GET    /api/browser/switcher?profile=<id|label>   P4 second half (§7.4): the switcher's view — every backend row enabled
 *                                             or disabled WITH ITS REASON, the SOURCE chip (masked), seats in three states,
 *                                             the fingerprint sentence, the versions the ladder read, blocked claims, site hints
 *   POST   /api/browser/switch                { profile, provider, sessionId?, confirmDowngrade?, makeDefault? }   the USER's
 *                                             switch: stop → same dir + carried seed → re-open one tab per lease → re-pin;
 *                                             typed refusals (backend_unavailable / backend_no_key + action / backend_seat_*
 *                                             / downgrade_* / switch_export_only / browser_restarting); a browser somebody is
 *                                             DRIVING answers mode:'proposal' (filed to the inbox when a session is named)
 *   DELETE /api/browser/blocked/:id           dismiss an agent's blocked claim
 *   GET    /api/browser/proposals/:id         lane browser-propose: a tier-2 claim's PROPOSAL as its card draws it
 *                                             (SW.proposalCardBlock) — the user's; an agent's bearer 403 agent_forbidden
 *   POST   /api/browser/proposals/:id/approve { shown }   THE USER's Approve: runs EXACTLY the frozen proposal (the install,
 *                                             ONLY the claim's host on browser.cloak.egressAllowlist, the in-place switch or
 *                                             a new CloakBrowser profile, the page, the agent told for free); `shown` = the
 *                                             digest of the card pressed — another ⇒ 409 proposal_changed, none ⇒ 400
 *                                             shown_required; 409 proposal_state / proposal_unavailable; agent bearer 403
 *   POST   /api/browser/proposals/:id/reject  the user's Reject (the agent hears it once, at its next navigation to the host)
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
const { sameToken } = require('../pairing-token.js'); // B-8dda
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }
// lane e2a (design-agent-browser-v2 §E2): the window-targets engine — the desktop-app rung's ONE owner of window leases,
// the opener grant and the launch (src/server/window-live-wiring.js hands it once both exist)
let windowEngine = null;
function setWindowEngine(e) { windowEngine = e || null; }
/** lane e2a: a status for the desktop-app door's refusals (the PURE verdict's codes + the launch's). */
const DESKTOP_APP_STATUS = Object.freeze({ desktop_app_cap: 409, bad_mode: 400, desktop_app_lacks: 400, not_yet: 400, backend_conflict: 400, desktop_app_only: 400, provider_unknown: 400, provider_local_only: 400, 'bad-url': 400, 'bad-request': 400, not_live: 409, cap: 409, 'browser-absent': 409, 'no-backend': 409, 'backend-not-wired': 409, no_window_engine: 503 });

const LOCAL = new Set(['', 'local']);
function hostOf(req) { const h = (req.method === 'GET' ? req.query.host : req.body?.host); return h == null ? '' : String(h); }
function refuseHost(req, res) {
  const h = hostOf(req);
  if (LOCAL.has(h)) return false;
  res.status(400).json({ error: `browser profiles are local-only in this release — host ${JSON.stringify(h)} refused`, code: 'unsupported-host' });
  return true;
}
const STATUS = { // lane browser-profile-clone: the copy's refusals by name
  source_not_found: 404, source_same_machine_only: 409, source_leased: 409, source_still_running: 409, source_no_folder: 409, clone_too_big: 413, clone_failed: 500, clone_unsupported_platform: 400, clone_agent_too_old: 400,
  'not-found': 404, no_lease: 404, 'bad-request': 400, label_required: 400, label_taken: 409, provider_unknown: 400, provider_unavailable: 400, 'unsupported-host': 400, sharing_refused: 400, fence_refused: 409, bad_proxy: 400, ambiguous: 409, not_owner: 403, leased: 409, running: 409, cap: 409, launch_failed: 502, dir_unwritable: 500, unavailable: 503,
  // lane chrome-builds-download (design 004): the download's refusals by name
  build_platform_unsupported: 400, disk: 507, build_present: 409, build_version_invalid: 400, build_version_unknown: 404, build_list_invalid: 502, build_list_unreachable: 502, build_url_offhost: 502, build_fetch_failed: 502, build_check_failed: 502, build_zip_shape: 502, build_unpack_failed: 500, build_verify_failed: 502, build_in_use: 409, build_not_downloaded: 409, build_removing: 409, unzip_unavailable: 503, build_stalled: 504,
  // P4 (§7.1–§7.3): the provider rows' typed refusals, the paired-machine rungs, the cdp provider
  provider_needs_local_key: 400, provider_local_only: 400, provider_lacks_capability: 400, cdp_port_required: 400,
  // P10 (§7.6 tier 3, D27 (b)): the consent gate on the local-window row, and "tier 3 is not a profile"
  provider_needs_consent: 403, tier3_is_a_window_target: 409, cdp_unreachable: 502, host_needs_daemon: 409, host_unavailable: 503, op_failed: 502, no_cdp: 502, stop_failed: 502,
  // P6 (§6.2 / §6.5): a mediated profile with no proxy in this process / a browser that answered no CDP url
  // owner ruling A: a pin is an attachment default now — P6's `pin_refused` is gone (lane browser-windows: and `browser_busy`
  // with the retired drive claim — each conversation works in a window of its own)
  mediation_unavailable: 503, mediation_no_cdp: 502, pinned: 409,
  // identity verify r2 (2026-09-28): a conversation on another machine never uses / pins / is listed on a profile
  remote_session: 409,
  // lane jobs-browser (B-dbc1): a Background Work job browses as its owner conversation — its refusals by name
  job_token: 403, job_not_running: 409, job_no_owner: 409, job_no_profile: 409,
  // BROWSE YOURSELF verify r3: a returning conversation whose new tab could not be bound while its old tab is the user's now
  tab_unbound: 503,
  // §3.7 / §3.8 — the handle refusals are typed so the CLI prints the code and the agent can read why
  profile_required: 409, profile_changed: 409, not_attached: 404, profile_path_refused: 400, bad_alias: 400, alias_taken: 409, adopt_failed: 409,
  // P3 (§4.3): the user drives ⇒ the agent's command is refused typed; the control verbs' own refusals
  browser_paused: 409, held: 409, not_taken: 409, no_confirmation: 404, 'no-browser': 409, refused: 409,
  // r6 A-F8 / A-F9: a Confirm must name the card it was pressed on; a card that is not what runs; a Hand back whose count moved
  shown_required: 400, confirmation_changed: 409, wake_count_changed: 409,
  // the owner's ruling (2026-09-27): a command the takeover caught in flight (the audit's answer names it; never a route refusal of its own)
  browser_interrupted: 409,
  // P4 second half (§7.4 / §7.5): the switch's typed refusals — three named backend refusals (D33), the ladder, seats, the gap
  backend_unavailable: 400, backend_no_key: 409, backend_seat_taken: 409, backend_seat_ceiling: 409, downgrade_refused: 409, downgrade_unknown: 409,
  switch_refused: 400, switch_export_only: 400, switch_noop: 409, browser_restarting: 409, hint_tier_with_backend: 400, host_underivable: 400, no_profile: 409,
  // §7.4 failure form (1): the INSTALL action's typed refusals (src/browser-switch.js INSTALL_CODES)
  install_local_only: 400, already_installed: 409, install_running: 409, install_precondition_unmet: 409, install_unmeasured_platform: 409, install_unavailable: 503,
  // takeover C3 (design-browser-takeover §5): the managed ephemeral browser — the shared ceiling (D2), a record that is
  // never attached / edited by id, pairs that name no browser of this conversation, the real CLI missing on this machine
  browser_cap: 409, not_attachable: 409, not_editable: 409, not_managed: 409, binary_absent: 503,
  // BROWSE YOURSELF (B-6ae8): the user's own browsing — a paired machine's profile (v1), a provider that only connects, his
  // holder gone, a view of a stopped browser, the address row's refusals
  remote_profile: 400, not_ours: 409, not_browsing: 409, browser_stopped: 409, not_web: 400, nav_failed: 502,
  // verify r1 (H6): his Tabs pane names a conversation's tab (only his own tab + what it opened are his) / his tabs unreadable
  not_your_tab: 403, tabs_unreadable: 503,
  // verify r1 (H1): an agent's own bearer on the user's browsing (the house rule for a human-only act — an auth-off instance answers every cookie route)
  agent_forbidden: 403,
  // lane H verify r2 M1: a profile directory another browser holds (a lock the keeper cannot prove its own orphan's)
  // r4/r5: a profile's browser closed and not started again (a failed / unidentified relaunch), or its heal budget spent
  profile_locked: 409, browser_closed: 409, browser_unstable: 409,
  // lane browser-unresponsive: a browser judged hung (its DevTools endpoint did not answer for a minute while it lives), and an
  // agent's restart of a browser that is answering (only a hung one is the agent's to restart)
  browser_unresponsive: 503, browser_answering: 409,
  // lane remote-profile-start: a paired machine with no browser to run (no agent-browser / no Chrome — `step` names the one
  // command), an agent too old to remove a profile's folder
  browser_cli_missing: 409, browser_missing: 409, remove_unsupported: 409,
  // MULTIVIEW (design-browser-multiview §2 / D4): a Stop of a browser that has not started (a view's refusal is lane H's browser_stopped); a shared profile is not one of yours to stop
  browser_released: 409, shared: 409,
  // B-f7ab: a live session that could not get its browser key on first use (the reason in `why`), or is not running any more
  // "Who can use it" is a LIST (2026-09-27): the whole-list rule, the write's refusals, the resolver of a picked session,
  // and a Task Group list that could not be read (never `not_owner`)
  'list-changed': 409, empty_list: 400, too_many: 400, unknown_task: 400, unknown_conversation: 400, no_browser_key: 409, 'session-gone': 410, groups_unreadable: 409,
  // lane browser-stuck (2026-09-28): a page dialog holds the page; nothing open to answer; no watch on that browser; the browser did not take the answer
  dialog_open: 409, no_dialog: 409, not_watched: 409, answer_failed: 502,
  // lane browser-admin 2a: which Chrome build a profile runs (src/browser-builds.js BUILD_CODES) + Change build…'s own
  browser_choice_invalid: 400, browser_choice_user_only: 403, browser_choice_provider: 400, builds_unsupported: 409, builds_unreadable: 503,
  browser_build_missing: 409, browser_build_not_executable: 409, browser_path_missing: 409, browser_path_not_executable: 409, build_noop: 409, browsing_yourself: 409,
  browser_driven: 409, // verify r1 (F1): the user drives that browser by hand right now — never restarted under his hands
  // lane browser-propose (2026-09-30): a proposal's Approve / Reject — not in a state to decide, a card that is not the proposal as it stands, nothing to approve here
  proposal_state: 409, proposal_changed: 409, proposal_unavailable: 409,
  // lane site-reset: a tab that is not this conversation's; a stop the tab did not answer; the site-reset refusals
  not_your_tab: 403, stop_failed: 502, close_failed: 502, no_loop: 409, no_picture: 409, host_not_current: 409, 'bad-host': 400, shared_profile: 409, clear_failed: 502,
  // lane browser-resume (§3.9): a Forget of nothing kept / of a browser that runs / that could not remove its directory
  not_kept: 404, kept_live: 409, forget_failed: 500,
  // lane browser-resume B (ruling 2): a Resume's refusals (a helper's browser is never kept; its directory became a named
  // profile; the conversation is not running) and the hand-back's (a browser this conversation does not hold; the stash)
  child_not_kept: 409, resume_adopted: 409, no_live_session: 409, not_yours: 403, stash_refused: 503,
  // verify r2: a hand-back with nothing new while the previous one still waits for the agent's next turn (one carrier, once)
  already_handed_back: 409,
  // lane browser-resume C (§3.9, ruling 3): tabs — nothing ran (the verdict precedes every exec); the act itself failed
  no_such_tab: 404, take_over_first: 409, last_tab: 409, mediated_tabs: 409, tab_failed: 502, window_busy: 409 }; // verify r2 T1: window_busy — the holder's window lives but took no tab right now (retry)
function fail(res, e) {
  const code = e?.code || null;
  // B-f7ab verify r2 (LOW): a key minted by THIS call rides a refused answer too (`res.locals.minted`, set by needKey) — the
  // agent's first command may be refused (not_owner, launch_failed…) and it still needs to know nothing needs restarting
  // lane remote-profile-start: a machine's refusal keeps the user's one command (`step`) — never on an agent's route
  res.status(STATUS[code] || 500).json({ error: String(e?.message || e), code, ...(e?.holders ? { holders: e.holders } : {}), ...(e?.why ? { why: e.why } : {}), ...(e?.remedy ? { remedy: e.remedy } : {}), ...(e?.step && !/^\/api\/agent\//.test(String((res.req && res.req.path) || '')) ? { step: e.step } : {}), ...(res.locals && res.locals.minted ? { minted: res.locals.minted } : {}),
    // P4 (§7.4): a refusal carries its ACTIONABLE way out (`action.openIntegration`), the ways out of a refused downgrade, and whether one human confirmation would do
    // MULTIVIEW D4: WHICH cap refused (this conversation's own, or the machine's) + the counts — never another session's name
    ...(e?.scope ? { scope: e.scope } : {}), ...(Number.isFinite(e?.others) ? { others: e.others } : {}), ...(Number.isFinite(e?.capOwn) ? { own: e.capOwn, cap: e.capOf } : {}),
    ...(e?.action ? { action: e.action } : {}), ...(Array.isArray(e?.waysOut) && e.waysOut.length ? { waysOut: e.waysOut } : {}), ...(e?.needsConfirm ? { needsConfirm: true } : {}), ...(e?.provider ? { provider: e.provider } : {}), ...(e?.integrationId ? { integrationId: e.integrationId } : {}),
    // lane H verify r2: a thrown `browser_paused` (an agent's detach while the user drives) carries when, like a resolve's; `profile_locked` names the holder pid
    ...(Number.isInteger(e?.takenAt) && e.takenAt > 0 ? { takenAt: e.takenAt, lastUserInputAt: e.lastUserInputAt || 0 } : {}), ...(Number.isInteger(e?.holderPid) ? { holderPid: e.holderPid } : {}),
    // the rebuilt switch dialog: a switch whose target did not START carries its rollback facts (whatever the code) —
    // the dialog words the answer by them first: `restored` (the profile is back as it was), `from`, `to`
    ...(typeof e?.restored === 'boolean' ? { restored: e.restored, from: e.from || null, to: e.to || null } : {}),
    // lane browser-profile-clone: a refused copy names its source, the size it measured and the fs code a failed copy hit
    ...(typeof e?.source === 'string' ? { source: e.source } : {}), ...(Number.isFinite(e?.bytes) ? { bytes: e.bytes } : {}), ...(e?.fsCode ? { fsCode: e.fsCode } : {}),
    ...rulingExtras(e), ...(res.locals && res.locals.recipe ? { recipe: res.locals.recipe } : {}) });
}
/** Owner ruling A: the extras a refusal on the sharing paths carries — a holder's NAME where a refusal names one + the
 *  bound to wait; a pin that did not open says `pinned` and which profile (lane browser-windows: `browser_busy`'s `by` went
 *  with the retired drive claim). */
function rulingExtras(v) {
  return { ...(v && v.holder !== undefined && v.holder !== null ? { holder: v.holder } : {}),
    ...(v && Number.isFinite(v.retryAfterMs) ? { retryAfterMs: v.retryAfterMs } : {}), ...(v && v.pinned ? { pinned: true, pinnedProfile: v.pinnedProfile || null } : {}) };
}
/** A typed `{ok:false, code, …}` verdict → the same wire shape a thrown refusal gets, with its extras kept. */
function failVerdict(res, v) { return res.status(STATUS[v.code] || 409).json({ error: String(v.error || v.code), code: v.code, handles: v.handles || [], ...(v.default !== undefined ? { default: v.default } : {}), ...(v.was !== undefined ? { was: v.was } : {}), ...(v.now !== undefined ? { now: v.now } : {}), ...(v.takenAt !== undefined ? { takenAt: v.takenAt, lastUserInputAt: v.lastUserInputAt || 0 } : {}), ...(v.remedy ? { remedy: v.remedy } : {}), ...(Number.isInteger(v.holderPid) ? { holderPid: v.holderPid } : {}), ...(Number.isInteger(v.wakes) ? { wakes: v.wakes } : {}), ...(typeof v.digest === 'string' ? { digest: v.digest } : {}), ...rulingExtras(v), ...(res.locals && res.locals.minted ? { minted: res.locals.minted } : {}), ...(res.locals && res.locals.recipe ? { recipe: res.locals.recipe } : {}) }); } // B-f7ab verify r2: + the key this call minted (LOW)
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
/** verify r3 (F4): is the client that asked still there to read the answer? Its SOCKET closed (the response destroyed) — never
 *  `req.destroyed`: Node auto-destroys an IncomingMessage once its body is consumed, on every request (measured: true for a
 *  live client; a killed client shows res.destroyed + both sockets destroyed). */
const clientGone = (req, res) => !!((res && res.destroyed) || (res && res.socket && res.socket.destroyed) || (req && req.socket && req.socket.destroyed));
function attachAnswer(r, { cdp = false, agent = null } = {}) {
  const { cdpUrl, ...rest } = r;
  const out = cdp ? { ...rest, cdpUrl: cdpUrl || null } : rest;
  if (agent && out.profile) out.profile = require('../browser-profiles.js').agentProfileView(out.profile, agent, { mediated: !!out.profile.mediated });
  if (agent && out.browser) out.browser = agentBrowserOf(out.browser);
  return out;
}
/** verify r1 (F5): a browser record in an AGENT's answer — never its launch view (`launchEnv` carries the executable's
 *  path) and a path choice by kind only (versions cross to an agent, paths never; the keeper's `agentBrowserView` rule). */
function agentBrowserOf(b) {
  if (!b || typeof b !== 'object') return b;
  const { launchEnv, ...rest } = b; // eslint-disable-line no-unused-vars
  // verify r2 (H1): the CLI the browser runs, by VERSION (the agent's CLI finds that version on its own machine) + the words
  // when it left this machine — never the program's path
  const cli = b.cli && typeof b.cli === 'object' && b.cli.version ? { version: String(b.cli.version), ...(typeof b.cli.gone === 'string' ? { gone: b.cli.gone } : {}) } : null;
  return { ...rest, cli, ...(b.browserChoice ? { browserChoice: require('../browser-builds.js').agentChoiceView(b.browserChoice) } : {}) };
}
/** verify r2 (H1): a browser whose CLI version is no longer on this machine runs no command — refused by name BEFORE the
 *  agent's CLI picks a binary (a binary of another version would restart it and lose its tabs). → a verdict | null. */
async function cliGoneVerdict(k, browser) {
  // verify r3 (Y1): the keeper's doors' fact — a binary of an unproven version is ASKED before the browser is refused
  // (a same-version re-install at the same path was refused once, "no longer installed", with a remedy that loses its tabs)
  if (browser && typeof browser === 'object' && browser.profileId && k && typeof k.cliFactReady === 'function') { try { const f = await k.cliFactReady(browser.profileId); if (f || browser.cli) browser.cli = f; } catch { /* the view's own reading stands */ } }
  const g = browser && browser.cli && typeof browser.cli.gone === 'string' ? browser.cli.gone : null;
  return g ? { code: 'browser_cli_gone', error: g, remedy: 'ask the user to restart this browser (Agent browser panel → Stop; the next command starts it on the current CLI)' } : null;
}

// ── UI ──
/** lane headless-fallback: THIS machine's display right now (Settings → Agent browser's read-only line) — a fresh probe
 *  (a readdir + a few local socket connects), asked only when the Settings window draws that row. */
router.get('/api/browser/display', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try { res.json({ display: typeof k.machineDisplay === 'function' ? await k.machineDisplay() : null, mode: typeof k.noDisplayMode === 'function' ? k.noDisplayMode() : 'auto', preference: typeof k.headedSetting === 'function' ? k.headedSetting() : null }); } catch (e) { fail(res, e); } // H5: `preference` = browser.headed as stored (null = unset) — Settings' line says what an UNSET one does here
});
router.get('/api/browser/profiles', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  try { res.json(k.list()); } catch (e) { fail(res, e); }
});
/**
 * lane browser-admin (the New profile… dialog): "Who can use it" CHOSEN AT THE CREATE. The `use` body is the PATCH's
 * (`{mode:'all'}` | `{mode:'only', who:[{kind:'task', id} | {kind:'session', session:<webui id>} | {kind:'session', key}]}`);
 * a picked live session is resolved to its conversation's browser key by THE one resolver (keyForPickedSession — a
 * session on another machine refused by name), so the keeper judges keys only. → `{ok, use, knownKeys}` | the refusal
 * (`{ok:false, status, body}`) — one refusal and nothing is created (a partial list is a list the user never saw).
 * `undefined` ⇒ `{ok:true, use:null}` (every conversation, owner ruling A's default).
 */
async function resolveUseRows(use) {
  if (use === undefined || use === null) return { ok: true, use: null, knownKeys: [] };
  const B = require('../browser-profiles.js');
  const sv = B.useShapeVerdict(use);
  if (!sv.ok) return { ok: false, status: STATUS[sv.code] || 400, body: { error: sv.error, code: sv.code } };
  if (sv.mode === 'all') return { ok: true, use: { mode: 'all' }, knownKeys: [] };
  const rows = [], knownKeys = [];
  for (const r of sv.rows) {
    if (r.kind === 'session' && r.session !== undefined) {
      const kr = await keyForPickedSession(r.session);
      if (!kr || !kr.ok) return { ok: false, status: STATUS[kr && kr.code] || 409, body: { error: (kr && kr.error) || 'that conversation could not be added', code: (kr && kr.code) || 'no_browser_key', session: r.session, name: (kr && kr.name) || null, ...(kr && kr.why ? { why: kr.why } : {}) } };
      rows.push({ kind: 'session', key: kr.key }); knownKeys.push(kr.key);
    } else if (r.kind === 'session') rows.push({ kind: 'session', key: r.key });
    else rows.push({ kind: 'task', id: r.id });
  }
  return { ok: true, use: { mode: 'only', who: rows }, knownKeys };
}
router.post('/api/browser/profiles', async (req, res) => {
  // P4: on a CREATE, `host` is the PAIRED MACHINE the browser runs on (D5
  // (b)) — the PURE row decides whether the provider may run there and the
  // keeper whether the id names a paired machine; both refuse by name, so
  // this route does not pre-refuse it (the registry itself is the hub's)
  const k = keeperOr503(res); if (!k) return;
  const { use, ...input } = req.body || {};
  if (input.cloneFrom != null && refuseAgentBearer(req, res, CLONE_IS_USERS)) return; // lane browser-profile-clone: a user's act — no agent verb copies logins
  // lane browser-admin 2a: which Chrome build it runs is the USER's choice — an agent's own token is refused by name
  if (input.browser != null && refuseAgentBearer(req, res, BUILD_IS_USERS)) return;
  // verify r1 (F6): "Who can use it" is the USER's too — an agent's token never writes the list (its own `new` makes a
  // profile every conversation can use; the PATCH in routes/browser-trace.js and the adopt below refuse the same way)
  if (use !== undefined && refuseAgentBearer(req, res, USE_IS_USERS)) return;
  try {
    const u = await resolveUseRows(use);
    if (!u.ok) return res.status(u.status).json(u.body);
    // a build on a PAIRED machine is judged against THAT machine's list (asked now, through its agent — an agent too old
    // to list builds is refused by name); this machine's is read by the keeper itself
    const B0 = require('../browser-builds.js');
    const ch = B0.normalizeBrowserChoice(input.browser);
    const remoteHost = input.host && input.host !== 'local' ? String(input.host) : null;
    const builds = ch && ch.kind === 'build' && remoteHost && typeof k.buildsFor === 'function' ? await k.buildsFor(remoteHost) : null;
    // owner ruling A: a named profile is usable by ALL of the owner's conversations by default (the dialog / the row's
    // "Who can use it" narrows it); with a list, the record is born with it — ONE write
    const opts = { owner: { kind: 'instance', id: null }, by: 'user', builds, ...(u.use ? { use: u.use, knownKeys: u.knownKeys } : {}) };
    // lane browser-profile-clone (B-9669): "Copy logins from" — the copy of a stopped profile's folder (a running one is stopped first)
    if (input.cloneFrom != null) return res.json({ profile: await k.cloneProfile(input, { ...opts, nameOf: cloneHolderName }) });
    res.json({ profile: k.createProfile(input, opts) });
  } catch (e) { fail(res, e); }
});
/** lane browser-profile-clone: a lease holder's name as the user sees it (the live conversation's), null when not running. */
function cloneHolderName(sessionId) { const s = ctx.activeSessions?.get?.(sessionId); return s ? String(s.name || s.title || '') || null : null; }
/** lane browser-profile-clone: the New profile… dialog's "Copy logins from" rows — every NAMED profile on the machine the new
 *  profile will run on (`?host=`), each with its state (stopped / running / leased by whom / other-machine / no-folder). */
router.get('/api/browser/clone-sources', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const h = LOCAL.has(hostOf(req)) ? null : hostOf(req);
  try { res.json({ host: h, sources: k.cloneSources(h).map((r) => ({ ...r, holders: r.holders.map((x) => ({ ...x, name: (x.sessionId && cloneHolderName(x.sessionId)) || null })) })) }); } catch (e) { fail(res, e); }
});
/** P4 (§7.1): the provider rows with their capability cells, each with the
 *  local verdict and — with `?host=` — the verdict FOR that machine (a
 *  disabled control names its reason), and the §7.2.1 egress record. `host` here names the machine the
 *  answer is ABOUT, not one the route acts on, so it is not refused. */
router.get('/api/browser/providers', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const B = require('../browser-profiles.js');
  const host = hostOf(req);
  const h = LOCAL.has(host) ? null : host;
  try {
    const rows = B.providerRows({ host: h, desktopConsent: typeof k.desktopConsent === 'function' ? k.desktopConsent() : undefined });
    // lane-cloak: `egress` = the allowlists the record IMPLIES (derived — egressHostsOf), `cloakSites` = what a running
    // cloak browser may reach here now (the record's run hosts + the deployment's named sites)
    res.json({ providers: rows, proof: B.CLOAK_EGRESS_PROOF, egress: B.egressHostsOf(B.CLOAK_EGRESS_PROOF), cloakSites: typeof k.cloakEgress === 'function' ? k.cloakEgress().allowlist : [], host: h, hostKnown: h ? k.hostKnown(h) : true, forwards: typeof ctx.forwards === 'function' ? ctx.forwards() : [] });
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
router.delete('/api/browser/profiles/:id', async (req, res) => {
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
    // lane remote-profile-start: a paired machine's profile goes with its folder THERE (or the answer says what was left).
    // verify r1: the record goes FIRST (sync — its verdict judged again), the machine is asked AFTER with the snapshot: a
    // start can no longer land between the folder's removal and a refused record (logins gone, the profile still listed)
    const snap = typeof k.profile === 'function' ? k.profile(req.params.id) : null;
    const r = k.removeProfile(req.params.id, { unpin });
    const m = typeof k.removeOnMachine === 'function' ? await k.removeOnMachine(req.params.id, { profile: snap }) : null;
    res.json({ ...r, unpinned: u.cleared, ...(m ? { machine: m } : {}) });
  } catch (e) { fail(res, e); }
});
router.post('/api/browser/profiles/:id/stop', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  // BROWSE YOURSELF verify r2 (KILL CLASS): while the USER browses it, only HIS Stop (the panel row, his cookie) ends it — an
  // agent's session / job token on this cookie route (an auth-off instance answers it) is refused like on his own routes
  if (typeof k.humanOf === 'function' && k.humanOf(req.params.id) && refuseAgentBearer(req, res)) return;
  try { res.json({ browser: await k.stop(req.params.id, { why: 'user' }) }); } catch (e) { fail(res, e); }
});
// ── BROWSE YOURSELF (B-6ae8, the owner 2026-09-28: "我其实也相当于是一个agent而已") — cookie-only, no agent twin ──
const HUMAN_KEY_RE = /^hu-[0-9a-f]{8}$/;
// verify r1 (H1): the user's browsing is HIS act — an agent's session / job token (`Bearer vsst_` / `jbt_`) is refused
// `agent_forbidden` (the house rule of every human-only surface: desktop-app sharing, channels, reset credits, the inbox);
// with auth on, the cookie middleware already refuses it — this is the auth-off instance's line
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
// THE ONE agent-token guard of this file's human routes (the .197 integration collapsed lane browser-stuck's
// `refuseAgentRestart` onto it): `error` = the route's own sentence, the code is always `agent_forbidden`
const OWN_BROWSING_IS_USERS = 'the user\'s own browsing — an agent token may not start, drive, end or read it';
const INSTALL_IS_USERS = 'installing a program is the user\'s act — an agent token may not start a download; tell the user what to install';
const BUILD_IS_USERS = 'which Chrome build a profile runs is the user\'s choice (Agent browser panel → Change build…) — an agent token may not set it; `vibespace-browser providers` lists the builds';
const CLONE_IS_USERS = 'copying a profile\'s logins into a new profile is the user\'s act (Agent browser panel → New profile… → Copy logins from) — an agent token may not do it';
const USE_IS_USERS = 'who may use a profile is the user\'s choice (Agent browser panel → Who can use it) — an agent token may not set it; an agent\'s own `new` makes a profile every conversation can use'; // verify r1 (F6)
const ADOPT_IS_USERS = 'a persistent profile made from a conversation\'s browser is the user\'s act (the picker\'s "New persistent profile…") — an agent token may not adopt a conversation\'s kept browser, its own or another\'s; an agent\'s `new --adopt` is the door for a folder of its own'; // verify r3 (Y4)
const BUILDS_DOWNLOAD_IS_USERS = 'downloading or removing a Chrome build is the user\'s act (Agent browser panel → Change build… → Download another build…) — an agent token may not do it, nor read Google\'s lists through VibeSpace; `vibespace-browser providers` lists the builds this machine has';
const RESTART_IS_USERS = 'restarting a browser is the user\'s act — an agent token may not do it; tell the user which page is not responding';
function refuseAgentBearer(req, res, error = OWN_BROWSING_IS_USERS) { if (!isAgentBearer(req)) return false; res.status(403).json({ error, code: 'agent_forbidden' }); return true; }
router.post('/api/browser/profiles/:id/browse', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (typeof k.browse !== 'function') return res.status(503).json({ error: 'browsing a profile yourself is not available on this server', code: 'unavailable' });
  try { res.json(await k.browse(req.params.id)); } catch (e) { fail(res, e); }
});
function humanKeyOr400(req, res) { const key = String(req.params.key || ''); if (!HUMAN_KEY_RE.test(key)) { res.status(400).json({ error: 'not a browsing window of yours', code: 'bad-request' }); return null; } return key; }
router.post('/api/browser/browse/:key/navigate', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const key = humanKeyOr400(req, res); if (!key) return;
  const b = req.body || {};
  try { res.json(await k.navigateHuman(key, { url: typeof b.url === 'string' ? b.url : null, verb: typeof b.verb === 'string' ? b.verb : null, tab: typeof b.tab === 'string' ? b.tab : null })); } catch (e) { fail(res, e); }
});
router.post('/api/browser/browse/:key/close', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const key = humanKeyOr400(req, res); if (!key) return;
  try { res.json({ ok: true, ...(await k.closeHuman(key)) }); } catch (e) { fail(res, e); }
});
router.post('/api/browser/browse/:key/quit', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  const key = humanKeyOr400(req, res); if (!key) return;
  try { const r = await k.quitHuman(key); res.json({ ok: true, stopped: !!r.stopped, conversations: r.conversations.length }); } catch (e) { fail(res, e); }
});
/** verify r2 (r1's held #3, lane browser-stuck): a Restart is the USER's act (keepers report, never kill a used session) —
 *  an agent's own session / job token is refused BY NAME on the two human Restart routes through THE guard above
 *  (`refuseAgentBearer(req, res, RESTART_IS_USERS)`; with sign-in on the cookie gate answers 401 first). */
/** lane browser-stuck: the Agent browser panel's RESTART of a profile whose page is not responding (the user's act) —
 *  stop, then start again (leases stay; its tabs open fresh; logins in the profile stay). */
router.post('/api/browser/profiles/:id/restart', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, RESTART_IS_USERS)) return; // verify r2: the user's act
  const k = keeperOr503(res); if (!k) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  // the .197 integration (browse-yourself × browser-stuck): never a stop under HIS page — the user browsing it himself closes first
  if (typeof k.humanOf === 'function' && k.humanOf(req.params.id)) { const p0 = typeof k.profile === 'function' ? k.profile(req.params.id) : null; return res.status(409).json({ error: require('../browser-human.js').humanRefusalText('browsing_yourself', { label: (p0 && p0.label) || req.params.id, act: 'restart' }), code: 'browsing_yourself' }); }
  // lane remote-profile-start (design 014 lane 3b): ONE door that also STARTS from cold — a PAIRED machine's profile never
  // started (no record: the stop's `not-found`) is started, never refused; the owner's way to start it before any agent.
  // verify r1: this computer's profile keeps the old answers byte for byte (never started ⇒ still 404, no `cold`)
  try {
    const p0 = typeof k.profile === 'function' ? k.profile(req.params.id) : null;
    const remote = !!(p0 && p0.host);
    let cold = false;
    // lane browser-unresponsive: this computer's browser restarts through THE recovery (holders told, the For-you item resolved)
    if (!remote && typeof k.restartProfile === 'function') return res.json({ browser: await k.restartProfile(req.params.id, { by: 'user' }) });
    try { await k.stop(req.params.id, { why: 'user' }); } catch (e) { if (!(remote && e && e.code === 'not-found')) throw e; cold = true; }
    const browser = await k.start(req.params.id, { why: cold ? 'started by the user' : 'restarted by the user (the page was not responding)' });
    res.json(remote ? { browser, cold } : { browser });
  } catch (e) { fail(res, e); }
});
/** lane browser-admin 2a: CHANGE BUILD… — GET = what the dialog shows (the profile's machine's builds, its choice, the
 *  build its browser RUNS, how many conversations would be told); POST `{choice, confirmed?}` = the user's act (an
 *  agent's token refused by name): THE verdict, then — a running browser — every holder told (interrupt + card +
 *  zero-spend notice), the browser restarted on the new build, its tabs reopened. */
router.get('/api/browser/builds', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const h = hostOf(req);
  if (typeof k.machineBuilds !== 'function') return res.status(503).json({ error: 'this keeper cannot list Chrome builds', code: 'unavailable' });
  try { res.json(await k.machineBuilds(LOCAL.has(h) ? null : h)); } catch (e) { fail(res, e); }
});
router.get('/api/browser/profiles/:id/builds', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (typeof k.buildsView !== 'function') return res.status(503).json({ error: 'this keeper cannot choose a Chrome build', code: 'unavailable' });
  try { res.json(await k.buildsView(req.params.id)); } catch (e) { fail(res, e); }
});
router.post('/api/browser/profiles/:id/build', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, BUILD_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (typeof k.setBrowserChoice !== 'function') return res.status(503).json({ error: 'this keeper cannot choose a Chrome build', code: 'unavailable' });
  try { res.json(await k.setBrowserChoice({ profileId: req.params.id, choice: req.body?.choice, confirmed: req.body?.confirmed === true, by: 'user' })); }
  catch (e) { if (e && (e.needsConfirm || e.waysOut || e.restored !== undefined)) return res.status(STATUS[e.code] || 409).json({ error: String(e.message || e), code: e.code || 'launch_failed', needsConfirm: !!e.needsConfirm, waysOut: e.waysOut || [], ...(e.restored !== undefined ? { restored: !!e.restored } : {}), ...(e.wrote != null ? { wrote: e.wrote } : {}) }); fail(res, e); }
});
/** lane chrome-builds-download (design 004, B-80c1): DOWNLOAD ANOTHER BUILD — every route cookie-only (a list read is an egress
 *  too: only a PERSON opening the picker reads Google's lists — never an agent, a timer or a boot). GET = the facts, no fetch
 *  (the progress poll) | `?lists=channels` (the 10 KB channel list, fresh) | `?lists=older` (the majors of the known-good list,
 *  kept 24 h) | `?major=N` (its versions) | `?version=X` (ONE HEAD: its size + the disk row); `profile=<id>` adds that profile's
 *  row. POST `{version}` = the download, in THE install slot (the CLI's and CloakBrowser's); DELETE = remove a build VibeSpace
 *  downloaded (its witness, nobody choosing or running it). A refusal carries its facts as `build`. */
const failBuild = (res, e) => res.status(STATUS[e && e.code] || 500).json({ error: String((e && e.message) || e), code: (e && e.code) || null, ...(e && e.build ? { build: e.build } : {}) });
router.get('/api/browser/builds/available', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, BUILDS_DOWNLOAD_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  if (typeof k.chromeBuildsAvailable !== 'function') return res.status(503).json({ error: 'this keeper cannot download Chrome builds', code: 'unavailable' });
  const q = req.query || {};
  const lists = q.lists === 'channels' || q.lists === 'older' ? q.lists : null;
  const major = /^\d{2,4}$/.test(String(q.major || '')) ? Number(q.major) : null;
  try { res.json(await k.chromeBuildsAvailable({ lists, major, version: q.version ? String(q.version).slice(0, 40) : null, profileId: ID_RE.test(String(q.profile || '')) ? String(q.profile) : null })); } catch (e) { failBuild(res, e); }
});
router.post('/api/browser/builds/download', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, BUILDS_DOWNLOAD_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  if (typeof k.installChromeBuild !== 'function') return res.status(503).json({ error: 'this keeper cannot download Chrome builds', code: 'unavailable' });
  try { res.json(await k.installChromeBuild({ version: String((req.body && req.body.version) || '').slice(0, 40) })); } catch (e) { failBuild(res, e); }
});
router.delete('/api/browser/builds/:version', (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, BUILDS_DOWNLOAD_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  if (typeof k.removeChromeBuild !== 'function') return res.status(503).json({ error: 'this keeper cannot remove Chrome builds', code: 'unavailable' });
  try { res.json(k.removeChromeBuild({ version: String(req.params.version || '').slice(0, 40) })); } catch (e) { failBuild(res, e); }
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
/** verify r1 (F7, lane browser-admin): WHAT THE PICKER'S "New persistent profile…" WILL DO for this conversation — ONE
 *  answer for the dialog (GET below) and the POST, never the client's guess off `browserVariant` (rung D keeps its
 *  directory since lane browser-resume, so the dialog's guess "empty" drew a browser / machine / build the keep dropped).
 *  → `{keep:true, variant, keptOwn}` (its own kept directory becomes the profile — Chromium, this computer, the build it
 *  ran) | `{keep:false, variant}` (an EMPTY profile — the dialog's browser, machine and build are the new profile's). */
function adoptPlanOf(f) {
  const B = require('../browser-profiles.js');
  const variant = f.session._browserVariant || null;
  const be = ctx.browserEnv?.() || null;
  if (!be) return { keep: false, variant, keptOwn: null };
  // lane browser-resume (§3.9): rung D KEEPS its directory now (the generated config names `data/browser-profiles/<key>`)
  // — adopted exactly like rung C's; only the conversation's OWN kept directory (named by its key), never a directory a
  // pin-era config still names (a registered profile's: clearPinnedDir's class)
  const keptOwn = variant === B.VARIANTS.D && typeof be.scratchDirFor === 'function' ? (() => { let d = null; try { d = be.resolvedProfileDir(f.browserKey); } catch { d = null; } return d && B.sameDir(d, be.scratchDirFor(f.browserKey)) ? d : null; })() : null;
  return { keep: variant === B.VARIANTS.C || !!keptOwn, variant, keptOwn };
}
/** verify r1 (F7): a kept directory is adopted AS IT IS — another browser / machine / port / build cannot be it (refused by
 *  name, nothing moves; the dialog draws the keep form off the GET — this is the belt for a form drawn before it). */
function adoptKeepRefusal(body) {
  const b = body || {};
  const asks = [];
  if (b.provider != null && String(b.provider) !== require('../browser-profiles.js').DEFAULT_PROVIDER) asks.push('browser');
  if (b.host != null && !LOCAL.has(String(b.host))) asks.push('machine');
  if (b.cdpPort != null) asks.push('port');
  const c = require('../browser-builds.js').normalizeBrowserChoice(b.browser);
  if (b.browser != null && !(c && c.kind === 'default')) asks.push('build');
  if (!asks.length) return null;
  return { code: 'adopt_keeps_browser', asks, error: `this conversation's browser is kept with its logins, so the profile made from it is that browser as it is — Chromium on this computer, the build it ran (asked for another: ${asks.join(', ')}); create it without them and use Change build… afterwards, or make an empty profile from the Agent browser panel` };
}
router.get('/api/browser/adopt', (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, ADOPT_IS_USERS)) return; // verify r3 (Y4): the dialog's door is the user's
  const f = sessionFacts(String(req.query?.sessionId || ''));
  if (!f) return res.status(404).json({ error: 'no such live session', code: 'not-found' });
  const plan = f.browserKey ? adoptPlanOf(f) : { keep: false, variant: f.session._browserVariant || null }; // no key yet ⇒ no directory of its own
  res.json({ keep: !!plan.keep, variant: plan.variant || null });
});
router.post('/api/browser/adopt', async (req, res) => {
  // verify r3 (Y4): the WHOLE route is the user's — verify r1 (F6) refused an agent token only when the body carried a
  // who-list or a build, so a bare {sessionId, label} from an agent's token (an auth-off instance answers every cookie
  // route) moved a conversation's KEPT browser — its own, or by naming another session's id ANOTHER conversation's, with
  // the logins the user completed there — into a profile every conversation may use (reproduced: 200, the directory
  // gone); an agent's own door for a folder of its own is `new --adopt` (/api/agent/browser/new)
  if (refuseAgentBearer(req, res, ADOPT_IS_USERS)) return;
  // verify r1 (F7): the body's `host` is the NEW (empty) profile's machine — judged by the create's own verdict below; the
  // kept directory's adopt refuses it by name (never "browser profiles are local-only" for a machine that is paired)
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.body?.sessionId || ''))); if (!f) return;
  const B = require('../browser-profiles.js');
  try {
    // lane browser-admin: the picker's "New persistent profile…" rows open THE New profile… dialog — its "Who can use it"
    // (and, for an EMPTY profile, its provider / machine) ride this body; resolved before anything moves
    const u = await resolveUseRows(req.body?.use);
    if (!u.ok) return res.status(u.status).json(u.body);
    const useOpts = u.use ? { use: u.use, knownKeys: u.knownKeys } : {};
    const variant = f.session._browserVariant || null;
    const be = ctx.browserEnv?.() || null;
    let profile, adopted = false, note;
    const all = { owner: { kind: 'instance', id: null }, createdBy: f.browserKey };
    const plan = adoptPlanOf(f), keptOwn = plan.keptOwn; // verify r1 (F7): THE plan the dialog's GET answered
    // verify r2 (B4): …and still the plan the dialog DREW — the conversation's rung can change while the dialog is open (a
    // respawn, a pin from before owner ruling A put back): the form it names is re-judged here and a changed one refused by
    // name, nothing moved — never an empty profile for "keeps its logins", never the conversation's kept browser taken (its
    // directory moved, its browser stopped, its logins every conversation's) for "a new, empty profile"
    const form = req.body && (req.body.form === 'keep' || req.body.form === 'empty') ? req.body.form : null;
    if (form && (form === 'keep') !== !!(plan.keep && be)) return res.status(409).json({ code: 'adopt_form_changed', form, now: plan.keep && be ? 'keep' : 'empty', error: `this conversation's browser ${plan.keep && be ? 'now keeps its own directory (its logins would become the profile)' : 'no longer keeps a directory of its own (the profile would be a new, empty one)'} — not what the dialog showed; nothing was created — open "New persistent profile…" again` });
    if (plan.keep && be) {
      const kr = adoptKeepRefusal(req.body); // verify r1 (F7): the dialog's browser / machine / build are never dropped in silence
      if (kr) return res.status(409).json({ error: kr.error, code: kr.code, asks: kr.asks });
      // the symlink's target IS the browserKey-named scratch directory (rung C); rung D's config names the same directory
      const dir = keptOwn || be.resolvedProfileDir(f.browserKey);
      if (!dir) throw Object.assign(new Error('this session\'s browser directory could not be read back off its indirection'), { code: 'adopt_failed' });
      if (typeof k.stopEphemeralOf === 'function') { try { await k.stopEphemeralOf(f.browserKey); } catch (e) { console.warn(`[browser] ${f.browserKey}: its own browser did not stop before the adopt — ${e && e.message}`); } }
      profile = k.adoptScratch({ label: req.body?.label, scratchDir: dir, ...all, ...useOpts });
      adopted = true;
      try { k.keptStore?.()?.adopted?.(f.browserKey); } catch (e) { console.warn(`[browser] ${f.browserKey}: its kept entry was not ended after the adopt — ${e && e.message}`); } // lane browser-resume: its directory is the profile's now
      note = 'the login that exists in this browser right now is kept: its directory was moved under ~/.agent-browser/ and registered — every conversation of yours can use it';
    } else {
      // rung D with keeping off / a fenced one (no directory of its own), N, none, H:
      // the honest form is an EMPTY profile, said plainly (§3.2.5)
      const { sessionId: _s, use: _u, label: _l, form: _f, ...fields } = req.body || {}; // (verify r2: `form` is the dialog's, never a profile field)
      profile = k.createProfile({ ...fields, label: req.body?.label }, { ...all, ...useOpts });
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
  // lane jobs-browser: a job's window is listed as the conversation's helper row, named "Job: <name>" — the NAME read live
  // off the jobs store here (never persisted with the browsing; a cleared or gone job shows its id)
  try {
    const st = k.statusFor(f.browserKey);
    const jobNames = {};
    const jm = typeof ctx.getJobs === 'function' ? ctx.getJobs() : null;
    for (const c of (st.children || [])) if (c && c.job) { const j = jm && jm.jobs && typeof jm.jobs.get === 'function' ? jm.jobs.get(c.job) : null; jobNames[c.handle] = (j && !j.clearedAt && typeof j.name === 'string' && j.name.trim()) ? j.name.trim().slice(0, 40) : String(c.job); }
    res.json({ ...st, helperNames: require('../server/browser-helpers.js').namesOf(f.session), jobNames, backend: f.session.backend || null });
  } catch (e) { fail(res, e); }
});
/** lane browser-resume (§3.9, the owner's ruling 1): THE KEPT BROWSERS — a conversation's own browser's logins directory +
 *  its tabs after the browser stopped. The user's rows (the Agent browser panel's "Kept browsers"): cookie only — an
 *  agent's own session / job token is refused `agent_forbidden` (the rows carry every conversation's tab titles and
 *  urls). Forget = the user's act: the entry and its directory go; a running browser is refused `kept_live`. */
const KEPT_IS_USERS = 'the kept browsers are the user\'s to see and forget — an agent token may not read or remove them';
router.get('/api/browser/kept', (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, KEPT_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  const ks = typeof k.keptStore === 'function' ? k.keptStore() : null;
  if (!ks) return res.status(503).json({ error: 'kept browsers are not available on this server', code: 'unavailable' });
  try { res.json({ kept: ks.list(), limits: ks.limits(), sweep: ks.lastSweep() }); } catch (e) { fail(res, e); }
});
router.delete('/api/browser/kept/:browserKey', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, KEPT_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  const ks = typeof k.keptStore === 'function' ? k.keptStore() : null;
  if (!ks) return res.status(503).json({ error: 'kept browsers are not available on this server', code: 'unavailable' });
  const bk = String(req.params.browserKey || '');
  if (!require('../browser-profiles.js').isBrowserKey(bk)) return res.status(400).json({ error: 'not a browser key', code: 'bad-request' });
  try { res.json(await ks.forget(bk)); } catch (e) { fail(res, e); }
});
/** lane browser-resume B (§3.9, the owner's ruling 2): RESUME and "HAND BACK AND CONTINUE" — the user's acts (cookie only;
 *  an agent's own token is refused `agent_forbidden` — its twin is `POST /api/agent/browser/resume`, for its OWN browser).
 *  The browser is resolved INSIDE the session's own list (`ref`: the conversation's own `~ephemeral`, or an attachment it
 *  holds) — never a bare profile id or key from the client. */
const RESUME_IS_USERS = 'resuming a conversation\'s browser from here is the user\'s act — the agent runs `vibespace-browser resume` for its own';
const HANDBACK_IS_USERS = 'handing the browser back is the user\'s act — an agent token may not do it';
/** One Resume of `ref` in the session `f` → the answer object, or a refusal thrown by name. */
async function resumeRow(k, f, ref) {
  const S = require('../browser-stream.js');
  const B = require('../browser-profiles.js');
  const r0 = String(ref || '').trim() || S.EPHEMERAL_REF;
  if (r0 === S.EPHEMERAL_REF) {
    const pairs = managedPairs(f);
    if (!pairs) throw Object.assign(new Error('this conversation\'s browser is not one VibeSpace runs here (the shared browser, or a session on another machine) — nothing is kept to resume'), { code: 'not_kept' });
    const r = await k.resumeFor({ browserKey: f.browserKey, sessionId: f.sessionId, envPairs: pairs, sessionName: sessionNameOf(f), variant: f.session._browserVariant || null, by: 'user' });
    const kept = r.kept || null;
    return { ok: true, ref: r0, resumed: !r.already, already: !!r.already, restored: kept && kept.kind === 'restored' ? kept.opened : 0, skipped: kept && Array.isArray(kept.skipped) ? kept.skipped : [], current: kept && kept.current ? kept.current : null };
  }
  if (r0.startsWith('~child:') || B.isChildKey(r0)) throw Object.assign(new Error('a helper\'s browser is not kept — only the conversation\'s own browser can be resumed'), { code: 'child_not_kept' });
  const rows = S.browserListFor({ ...k.statusFor(f.browserKey), helperNames: {} });
  const row = rows.find((x) => x.ref === r0 && x.kind === 'attachment');
  if (!row) throw Object.assign(new Error('that browser is not one of this session\'s'), { code: 'not-found' });
  if (typeof k.humanOf === 'function' && k.humanOf(row.profileId)) return { ok: true, ref: r0, resumed: false, already: true, restored: 0, skipped: [], current: null };
  const r = await k.resumeAttachment({ profileId: row.profileId, browserKey: f.browserKey, sessionId: f.sessionId, taskIds: f.taskIds, groupsUnreadable: f.groupsUnreadable });
  return { ok: true, ref: r0, resumed: !r.already, already: !!r.already, restored: r.reopened && r.reopened.ok ? 1 : 0, skipped: r.reopened && !r.reopened.ok ? [{ url: r.reopened.url, why: r.reopened.why }] : [], current: r.reopened && r.reopened.ok ? { url: r.reopened.url, title: '' } : null };
}
router.post('/api/browser/session/:sessionId/resume', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, RESUME_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.params.sessionId || ''))); if (!f) return;
  try { res.json(await resumeRow(k, f, req.body?.ref)); } catch (e) { fail(res, e); }
});
/** The Agent browser panel's kept row: its Resume names the KEY (the row is the kept entry) — resolved here to the ONE live
 *  session that carries it (a stopped conversation: `no_live_session` by name — the row draws words, never a dead button). */
router.post('/api/browser/kept/:browserKey/resume', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, RESUME_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  const B = require('../browser-profiles.js');
  const bk = String(req.params.browserKey || '');
  if (!B.isBrowserKey(bk)) return res.status(400).json({ error: 'not a browser key', code: 'bad-request' });
  let sid = null;
  for (const [id, s] of (ctx?.activeSessions || new Map())) if (s && s._browserKey === bk && !(s.hostId || s.host)) { sid = id; break; }
  if (!sid) return res.status(409).json({ error: 'the conversation is not running — resume the conversation, then its browser', code: 'no_live_session' });
  const f = needKey(res, sessionFacts(sid)); if (!f) return;
  try { res.json({ ...(await resumeRow(k, f, require('../browser-stream.js').EPHEMERAL_REF)), sessionId: sid }); } catch (e) { fail(res, e); }
});
/** "Hand back and continue…": the user's one-line note + the tabs ride the conversation's NEXT turn (the stash; nothing is
 *  delivered, nothing billed); a takeover of that browser ends (cause `continue`); its next command runs in the SAME
 *  browser and is told which tab is current. */
router.post('/api/browser/session/:sessionId/hand-back', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, HANDBACK_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.params.sessionId || ''))); if (!f) return;
  const S = require('../browser-stream.js');
  const ref = String(req.body?.ref || '').trim() || S.EPHEMERAL_REF;
  const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 4000) : '';
  if (typeof ctx?.continueHandBack !== 'function') return res.status(503).json({ error: 'handing the browser back for the next turn is not available on this server', code: 'unavailable' });
  try {
    let profileId = null;
    if (ref !== S.EPHEMERAL_REF) {
      const row = S.browserListFor({ ...k.statusFor(f.browserKey), helperNames: {} }).find((x) => x.ref === ref);
      if (!row || row.kind !== 'attachment') return res.status(403).json({ error: 'hand back a helper\'s browser from its own view — only this conversation\'s own browser or one it holds here', code: 'not_yours' });
      profileId = row.profileId;
    }
    const r = await ctx.continueHandBack({ sessionId: f.sessionId, browserKey: f.browserKey, profileId, note });
    if (!r || !r.ok) return failVerdict(res, r || { code: 'unavailable', error: 'no answer' });
    res.json({ ok: true, id: r.id, stashed: r.stashed, durable: r.durable, carded: r.carded, tabs: r.tabs, tookOver: r.tookOver, ...(r.why ? { why: r.why } : {}) });
  } catch (e) { fail(res, e); }
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
    // BROWSE YOURSELF verify r2 (KILL CLASS): the USER browses this profile himself — a conversation's strip never stops HIS
    // page (reproduced: this route stopped the browser under his window, naming nobody); only Quit in his own window or the
    // panel row's Stop end it, both naming him. Refused by name, like `shared`
    if (row.profileId && typeof k.humanOf === 'function' && k.humanOf(row.profileId)) return res.status(409).json({ error: require('../browser-human.js').humanRefusalText('browsing_yourself', { label: row.label, act: 'stop' }), code: 'browsing_yourself' });
    res.json({ ref, browser: await k.stop(row.profileId, { why: 'user' }) });
  } catch (e) { fail(res, e); }
});
/** lane browser-stuck (the brief's step 4): the user's RESTART of a page that does not respond (the live view's banner, the
 *  chip) — a human act, never automatic (keepers report, never kill a used session). The same row resolution and the
 *  same `shared` refusal as the Stop above; a named profile is started again at once (its leases stay), a conversation's
 *  own browser is stopped and its agent's next command starts it fresh. */
router.post('/api/browser/session/:sessionId/restart', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, RESTART_IS_USERS)) return; // verify r2: the user's act
  const k = keeperOr503(res); if (!k) return;
  const f = needKey(res, sessionFacts(String(req.params.sessionId || ''))); if (!f) return;
  const S = require('../browser-stream.js');
  const ref = String(req.body?.ref || '').trim();
  try {
    const rows = S.browserListFor({ ...k.statusFor(f.browserKey), helperNames: {} });
    const row = rows.find((r) => r.ref === ref);
    if (!row) return res.status(404).json({ error: 'that browser is not one of this session\'s', code: 'not-found' });
    if (!row.profileId) return res.status(409).json({ error: 'that browser has not started', code: 'browser_released' });
    // lane browser-unresponsive: a browser judged HUNG is restarted even when shared — its other conversations are refused
    // anyway, and THE recovery tells each of them by a card (the user's act; the browsing-yourself rule first)
    { const hb = typeof k.browserOf === 'function' ? k.browserOf(row.profileId) : null; if (hb && hb.unresponsive && typeof k.restartProfile === 'function' && !(typeof k.humanOf === 'function' && k.humanOf(row.profileId))) { const browser = await k.restartProfile(row.profileId, { by: 'user' }); return res.json({ ref, restarted: true, browser, note: 'started again — logins in the profile stay; every conversation on it was told' }); } }
    if (row.kind === 'attachment' && row.owners > 0) return res.status(409).json({ error: `this profile's browser is shared with ${row.owners} other conversation${row.owners === 1 ? '' : 's'} — restarting it would close their tabs too; stop it from the Agent browser panel if that is what you want`, code: 'shared' });
    // the .197 integration (browse-yourself × browser-stuck): never a stop under HIS page (the Stop route's own rule)
    if (typeof k.humanOf === 'function' && k.humanOf(row.profileId)) return res.status(409).json({ error: require('../browser-human.js').humanRefusalText('browsing_yourself', { label: row.label, act: 'restart' }), code: 'browsing_yourself' });
    const p = k.profile(row.profileId);
    await k.stop(row.profileId, { why: 'user' });
    let browser = null;
    if (p && !p.ephemeral) browser = await k.start(row.profileId, { why: 'restarted by the user (the page was not responding)' });
    res.json({ ref, restarted: !!browser, browser, note: browser ? 'started again — its tabs open fresh; a login in the profile stays' : 'stopped — the agent\'s next browser command starts it fresh' });
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
    // r6 A-F9: `expectWakes` = the count the pressing surface SHOWED (checked by the keeper; absent = not checked)
    const r = k.handback({ browserKey: f.browserKey, profileId: t.profileId, viewerId: null, cause: 'explicit', url: '', sessionId: f.sessionId, ...(Number.isInteger(req.body?.expectWakes) ? { expectWakes: req.body.expectWakes } : {}) });
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
    // r6 A-F8: `shown` = the digest of the card the answer was pressed on (a Confirm without it, or with another, runs nothing)
    const r = await k.answerConfirmation({ browserKey: f.browserKey, profileId: t.profileId, id: req.body?.id, decision: req.body?.decision, envPairs: Array.isArray(f.session._browserEnv) ? f.session._browserEnv : null, shown: typeof req.body?.shown === 'string' ? req.body.shown.slice(0, 40) : undefined });
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
// ── lane browser-propose step 3: THE PROPOSAL — the USER's Approve / Reject (owner-only: an agent's bearer is refused by
// name here, and the PURE step refuses any actor but the user). Approve runs EXACTLY the proposal's frozen fields: the
// body names the digest of the card that was pressed (`shown`); another one ⇒ 409 proposal_changed, nothing runs ──
const PROPOSAL_ID_RE = /^(?:bl|sr)-[0-9a-f]{8}$/; // lane site-reset: + a site-reset proposal (`sr-…`) — the same routes
const PROPOSAL_IS_USERS = 'approving or rejecting a browser proposal is the user\'s act — an agent token may not do it; tell the user a card waits for their Approve';
function proposalsOr503(res) { const p = ctx?.proposals || null; if (!p) res.status(503).json({ error: 'browser proposals are not available on this server', code: 'unavailable' }); return p; }
router.get('/api/browser/proposals/:id', (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, PROPOSAL_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!PROPOSAL_ID_RE.test(String(req.params.id || ''))) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const e = typeof k.proposalEntry === 'function' ? k.proposalEntry(req.params.id) : null;
  if (!e) return res.status(404).json({ error: `no proposal ${req.params.id}`, code: 'not-found' });
  res.json({ proposal: require('../browser-switch.js').proposalCardBlock(e) });
});
router.post('/api/browser/proposals/:id/approve', (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, PROPOSAL_IS_USERS)) return;
  const pr = proposalsOr503(res); if (!pr) return;
  if (!PROPOSAL_ID_RE.test(String(req.params.id || ''))) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const shown = typeof req.body?.shown === 'string' ? req.body.shown.slice(0, 40) : null;
  if (!shown) return res.status(400).json({ error: 'an Approve names the card it was pressed on (`shown`)', code: 'shown_required' });
  try { const r = pr.approve(req.params.id, { shown, by: 'user' }); if (!r.ok) return failVerdict(res, r); res.json(r); } catch (e) { fail(res, e); }
});
router.post('/api/browser/proposals/:id/reject', (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, PROPOSAL_IS_USERS)) return;
  const pr = proposalsOr503(res); if (!pr) return;
  if (!PROPOSAL_ID_RE.test(String(req.params.id || ''))) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { const r = pr.reject(req.params.id, { by: 'user' }); if (!r.ok) return failVerdict(res, r); res.json(r); } catch (e) { fail(res, e); }
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
  if (refuseAgentBearer(req, res, INSTALL_IS_USERS)) return; // lane browser-admin 2b: a download is the user's act (both installs of the ONE slot)
  const k = keeperOr503(res); if (!k) return;
  try { res.json(await k.installCloak()); } catch (e) { fail(res, e); }
});
/** lane browser-admin 2b: THE BROWSER CLI VIBESPACE DRIVES — GET = the facts the panel row says (the version the flag table
 *  was measured on + its download numbers, the choice `browser.cli`, the pinned install, the one on PATH, the one in use and
 *  its drift, the install slot); POST `{version?}` = install it (the user's act — an agent token refused by name; the ONE
 *  install slot cloak's install uses; `npm install --prefix <data>/browser-tools/agent-browser-<v> --no-save --ignore-scripts
 *  agent-browser@<v>` — the npm registry only). */
router.get('/api/browser/cli', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  if (typeof k.cliFacts !== 'function') return res.status(503).json({ error: 'this keeper cannot pin the browser CLI', code: 'unavailable' });
  try { res.json(await k.cliFacts()); } catch (e) { fail(res, e); }
});
router.post('/api/browser/cli/install', async (req, res) => {
  if (refuseHost(req, res)) return;
  if (refuseAgentBearer(req, res, INSTALL_IS_USERS)) return;
  const k = keeperOr503(res); if (!k) return;
  if (typeof k.installCli !== 'function') return res.status(503).json({ error: 'this keeper cannot install the browser CLI', code: 'unavailable' });
  try { res.json(k.installCli({ version: req.body && req.body.version ? String(req.body.version) : undefined })); } catch (e) { fail(res, e); }
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
function pinAnswer(k, f, ref, { by = 'agent', quiet = false } = {}) { // lane browser-propose: `quiet` = a user pin whose telling rides the caller's own message (the approved proposal) — no second notice
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
  if (quiet) k.tell(f.browserKey); // lane browser-propose: the approved proposal's own message is the telling (no second notice)
  else if (by === 'user') { if (moved) noteChange(f, { kind: 'browser-pin', was: prevPin ? prevPin.label : '', now: p ? p.label : '', handles: after.handles.map((h) => h.handle) }); }
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
  if (token && token.startsWith('vsst_')) for (const [id, s] of (ctx?.activeSessions || new Map())) if (s && sameToken(token, s.agentToken)) { f = sessionFacts(id); break; }
  if (token && token.startsWith('jbt_')) { const jf = jobFactsOf(token, { mint: false }); f = jf && !jf.refusal ? jf : null; }
  req._agentFacts = f;
  return f;
}
/**
 * lane jobs-browser (B-dbc1): A BACKGROUND WORK JOB (`jbt_`) BROWSES AS ITS OWNER CONVERSATION — the facts of the
 * conversation that owns it (msgCaller's rule: its live session lends its Task Groups; a job whose conversation is not
 * running keeps the groups the store still names for it), the job's OWN lease key = a child handle of the owner's
 * browser key (src/browser-job-principal.js; `mint` only on an admitted route — the belt never mints). → facts | {refusal}.
 */
function jobFactsOf(token, { mint = true } = {}) {
  const J = require('../browser-job-principal.js'), B = require('../browser-profiles.js');
  const jm = typeof ctx?.getJobs === 'function' ? ctx.getJobs() : null;
  if (!jm || !jm.ready || typeof jm.jobByToken !== 'function') return { refusal: { status: 503, code: 'unavailable', error: 'the jobs engine is not ready — retry shortly' } };
  const job = jm.jobByToken(token);
  if (!job) return { refusal: { status: 401, code: 'unauthorized', error: 'unknown job token' } };
  const cid = J.ownerConversationOf(job);
  let s = null, id = null;
  // verify r1 (MED, the channel-withdraw r4/r5 class): the owner's LIVE session is the one ADDRESSABLE by the owner's id —
  // a PENDING FORK still carries its parent's id, and it was taken as the owner (the job's handle minted under the fork's
  // key, judged by the fork's pin and reach). ONE predicate, the ladder's own: addressableId (a borrowed id is nobody's)
  const { addressableId } = require('../claude-lock-capture.js');
  if (cid) for (const [tid, t] of (ctx.activeSessions || new Map())) if (t && addressableId(t) === cid) { s = t; id = tid; break; }
  let ownerKey = s && B.isBrowserKey(s._browserKey) ? s._browserKey : '';
  if (!ownerKey && cid && typeof ctx.bindingsLookup === 'function') { try { ownerKey = String(ctx.bindingsLookup(cid) || ''); } catch { ownerKey = ''; } }
  const v = J.jobPrincipalOf({ job, ownerKey });
  if (!v.ok) return { refusal: { status: v.code === 'unauthorized' ? 401 : (STATUS[v.code] || 409), code: v.code, error: v.error } };
  if (s && (s.hostId || s.host || s._browserVariant === B.VARIANTS.H)) return { refusal: { status: 409, code: 'remote_session', error: 'this job\'s conversation runs on another machine — its browser is that machine\'s; VibeSpace cannot act on its pages from here' } };
  let taskIds = [], groupsUnreadable = false;
  try {
    const raw = s ? (ctx.tasksForSession?.(s, id) || []) : (typeof ctx.tasksForConversation === 'function' ? (ctx.tasksForConversation(cid) || []) : []);
    taskIds = raw.map((t) => (typeof t === 'string' ? t : t && t.id)).filter(Boolean);
  } catch (e) { taskIds = []; groupsUnreadable = true; }
  const k = ctx.keeper;
  let handle = null;
  if (mint) { try { handle = k.jobHandleFor({ ownerKey, jobId: job.id }); } catch (e) { return { refusal: { status: STATUS[e && e.code] || 409, code: (e && e.code) || 'error', error: String((e && e.message) || e) } }; } }
  else { try { handle = k && typeof k.findJobHandle === 'function' ? k.findJobHandle({ ownerKey, jobId: job.id }) : null; } catch { handle = null; } }
  const label = J.jobLabelOf(job);
  // a job whose conversation is not running has no live session: the facts carry a stub (a name for the browser's
  // session label; no spawn pairs — a job never starts the conversation's own temporary browser)
  return { session: s || { name: label, webuiName: label }, sessionId: id, browserKey: handle || ownerKey, ownerKey, taskIds, groupsUnreadable, remote: false, job: { id: String(job.id), cid } };
}
/** The /api/agent/browser/<route> a request names (the job's route lists judge it). */
function agentRouteOf(req) {
  const p = String((req && (req.originalUrl || req.url)) || '').split('?')[0];
  const at = p.indexOf(AGENT_PREFIX + '/');
  return at < 0 ? '' : p.slice(at + AGENT_PREFIX.length + 1).split('/')[0];
}
function jobAgentFacts(req, res, token) {
  const J = require('../browser-job-principal.js');
  const rv = J.jobRouteVerdict(agentRouteOf(req));
  if (!rv.ok) { res.status(STATUS[rv.code] || 403).json({ error: rv.error, code: rv.code }); return null; }
  const f = jobFactsOf(token, { mint: true });
  if (!f || f.refusal) { const r = (f && f.refusal) || { status: 401, code: 'unauthorized', error: 'unknown job token' }; res.status(r.status).json({ error: r.error, code: r.code }); return null; }
  req._agentFacts = f; // the belt judges this answer with the job's own key
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
  if (token && token.startsWith('jbt_')) return jobAgentFacts(req, res, token); // lane jobs-browser: as its owner conversation
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
    const t0 = typeof k.clock === 'function' ? k.clock() : Date.now(); // lane headless-fallback: a launch at or after this is THIS use's
    const r = await k.attach({ profile: req.body?.profile, browserKey: f.browserKey, sessionId: f.sessionId, taskIds: f.taskIds, groupsUnreadable: f.groupsUnreadable, alias: req.body?.alias });
    // verify r3 (F4): `use` attaches too (two conversations' `use` at once is how a rebind QUEUES at the route — a page verb's
    // /resolve is refused busy while another drives) — an undelivered answer's note goes back for the next command
    if (r && r.rebound && r.profile && clientGone(req, res) && typeof k.restoreRebound === 'function') k.restoreRebound(r.profile.id, f.browserKey, r.rebound);
    const set = k.setFor(f.browserKey);
    k.tell(f.browserKey);
    stampActive(f, r.profile.id); // `use` execs a subshell on this profile: the agent's next direct commands land here
    const mine = set.attachments.find((a) => a.profileId === r.profile.id) || null;
    res.json({ ...attachAnswer(r, { cdp: req.body?.wrapper === true, agent: agentFactsOf(f) }), alias: mine ? mine.alias : null, attachments: set.attachments, handles: set.handles, defaultId: set.defaultId, ...displayNoteOf(r.browser, t0) });
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
    // lane browser-resource-care: the daemon's scratch (its ephemeral profile, its Xvfb auth file) lands under data/, never
    // the RAM-backed /tmp — the CLI sets it on the child LAST, beside the socket root
    try { const be = ctx.browserEnv?.(); const t = be && typeof be.tmpDir === 'function' ? be.tmpDir() : null; if (t) out.tmpDir = t; } catch { /* the CLI keeps its own TMPDIR */ }
    // takeover r3 (finding 2): THE CONFIG IS NAMED — the file the keeper runs this browser with (the pairs'
    // own generated config, else the keeper's machine file for the kind); the CLI sets it on the child LAST,
    // so the binary never searches ./agent-browser.json in the agent's directory (a remote session gets none:
    // its CLI composes one there by the same rule)
    if (typeof k.configFileFor === 'function') { const c = k.configFileFor({ ephemeral, pairs: Array.isArray(pairs) ? pairs : null }); if (c) out.config = c; }
  }
  return out;
}
/** lane headless-fallback: the AGENT is told when THIS command launched its browser headless instead of the window its
 *  config asks for (or on another display, or headed again) — once per launch: the launch started at or after `since`
 *  (the keeper's clock, read before the start). The sentence is PURE browser-display.js `agentNote` (English). */
function displayNoteOf(browser, since) {
  const d = browser && browser.display;
  if (!d || !(Number(browser.startedAt) >= Number(since))) return {};
  const note = require('../browser-display.js').agentNote(d);
  return note ? { displayNote: note } : {};
}
router.post('/api/agent/browser/resolve', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  if (f.job) return resolveForJob(req, res, k, f); // lane jobs-browser: the owner's profile, the job's own lease + window
  const B = require('../browser-profiles.js');
  // B-f7ab: a key minted by THIS call (the session had none) is said in the answer — the CLI prints one note line
  const send = (o) => res.json(f.minted ? { ...o, minted: f.minted } : o);
  // lane e2a (§E2.1 Driving): a handle naming THIS conversation's desktop-app browser — no CDP is that rung's definition
  { const da = windowEngine && req.body?.handle ? windowEngine.agentBrowserFor(String(req.body.handle), f.browserKey) : null;
    if (da) return res.status(409).json({ error: `${da.handle} is your desktop-app browser: it has no CDP, so browser page verbs do not run there — drive it with \`vibespace-window snapshot ${da.handle}\`, then \`vibespace-window click / type / key / screenshot ${da.handle} …\``, code: 'no_cdp_on_this_backend', handle: da.handle, remedy: `vibespace-window snapshot ${da.handle}` }); }
  // lane browser-recipes: a page verb refused while this conversation has NO browser yet (its first command) names the
  // recipe too — the refusal answer carries it (`recipe`, beside `minted`); the CLI prints it under the refusal
  try { const st0 = k.statusFor(f.browserKey); if (!st0.ephemeral && !(st0.leases || []).length) res.locals.recipe = f.remote ? require('../browser-recipes.js').FIRST_VERB_NEXT_REMOTE : require('../browser-recipes.js').FIRST_VERB_NEXT; } catch { /* no pointer */ } // verify r1 F1: a remote conversation's pointer
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
        { const g = await cliGoneVerdict(k, e.browser); if (g) return failVerdict(res, g); }
        stampActive(f, '');
        ensureBindingOnce(f); // lane H: its actions stay findable after the conversation stops
        return send({ ok: true, kind: 'ephemeral', shared: false, handle: null, env: pairs, ...envBasis(f, { k, pairs }), profile: e.profile, browser: agentBrowserOf(e.browser), lease: e.lease, created: e.created, handles: v.handles, pinTab: false, at: resolvedAt, ...(await dialogAnswerFor(k, f, e.profile && e.profile.id, { verb })), ...displayNoteOf(e.browser, resolvedAt), ...keptAnswerOf(e.kept) });
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
        { const g = await cliGoneVerdict(k, e.browser); if (g) return failVerdict(res, g); }
        // verify r2 (D6): a helper's browser keeps nothing — said ONCE, in its own first answer (the CLI prints the note)
        return send({ ok: true, kind: 'child', handle: v.handle, env: env.pairs, unset: env.unset, ...envBasis(f, { k, pairs: childPairs }), handles: v.handles, pinTab: false, profile: e.profile, browser: agentBrowserOf(e.browser), at: resolvedAt, ...(await dialogAnswerFor(k, f, e.profile && e.profile.id, { verb })), ...displayNoteOf(e.browser, resolvedAt), ...(e.created ? { notKept: { text: require('../browser-kept.js').helperNotKeptText() } } : {}) });
      }
      return send({ ok: true, kind: 'child', handle: v.handle, env: env.pairs, unset: env.unset, ...envBasis(f, { k, pairs: childPairs }), handles: v.handles, pinTab: false, at: resolvedAt });
    }
    const r = await k.attach({ profileId: v.attachment.profileId, browserKey: f.browserKey, sessionId: f.sessionId, taskIds: f.taskIds, groupsUnreadable: f.groupsUnreadable });
    // verify r3 (F4): the rebound note is SAID ONCE — in an answer that is delivered. A client gone before this write (the
    // agent harness's own tool timeout fired while the rebind queued) never reads it: put it back for the next command.
    if (r && r.rebound && clientGone(req, res) && typeof k.restoreRebound === 'function') k.restoreRebound(v.attachment.profileId, f.browserKey, r.rebound);
    { const g = await cliGoneVerdict(k, r.browser); if (g) return failVerdict(res, g); }
    stampActive(f, v.attachment.profileId); // the command RUNS on this attachment: that is what the chip calls "last used"
    // r2: an attachment's daemon lives under the keeper's own root (its pairs never carry SOCKET_DIR), whatever the session's spawn pairs say
    send({ ok: true, kind: 'attachment', handle: v.handle, ...attachAnswer(r, { cdp: req.body?.wrapper === true, agent: agentFactsOf(f) }), ...envBasis(f, { k, pairs: r.env, ephemeral: false }), handles: v.handles, isDefault: !!v.attachment.isDefault, at: resolvedAt, ...(await dialogAnswerFor(k, f, r.profile && r.profile.id, { verb })), ...displayNoteOf(r.browser, resolvedAt) });
  } catch (e) { fail(res, e); }
});
/** lane jobs-browser (B-dbc1): a job's command runs in its OWNER conversation's pinned / default profile (the owner's set,
 *  read — never changed: no pin attach, no `told`, no stamp) under the job's OWN lease (its child handle ⇒ its own
 *  window); a takeover of the job's window pauses the job alone. No profile ⇒ `job_no_profile`. */
async function resolveForJob(req, res, k, f) {
  const B = require('../browser-profiles.js'), J = require('../browser-job-principal.js');
  try {
    const verb = B.auditVerbOf(Array.isArray(req.body?.argv) ? req.body.argv.map(String) : []);
    const jv = J.jobResolveVerdict(B.resolveHandle({ set: k.setFor(f.ownerKey), handle: req.body?.handle || '', subagent: false }));
    if (!jv.ok) return failVerdict(res, { ...jv, handles: [] });
    const r = await k.attach({ profileId: jv.profileId, browserKey: f.browserKey, sessionId: f.sessionId || null, taskIds: f.taskIds, groupsUnreadable: f.groupsUnreadable });
    { const g = await cliGoneVerdict(k, r.browser); if (g) return failVerdict(res, g); }
    k.tell(f.browserKey);
    const v = k.resolveFor({ browserKey: f.browserKey, handle: '', verb });
    if (!v.ok) return failVerdict(res, v);
    const at = typeof k.clock === 'function' ? k.clock() : Date.now();
    res.json({ ok: true, kind: 'attachment', job: true, handle: v.handle, ...attachAnswer(r, { cdp: req.body?.wrapper === true, agent: agentFactsOf(f) }), ...envBasis(f, { k, pairs: r.env, ephemeral: false }), handles: v.handles, isDefault: true, at, ...(await dialogAnswerFor(k, f, r.profile && r.profile.id, { verb })), ...displayNoteOf(r.browser, at) });
  } catch (e) { fail(res, e); }
}
/** lane browser-resume B (§3.9): what a start did with the conversation's KEPT browser, as the agent's answer — ONE field
 *  per kind, each with its sentence (PURE src/browser-kept.js): `restored` (its kept tabs reopened by themselves — D2),
 *  `resumed` (the user resumed it / handed it back: the tab that is current; their note when the stash could not take it),
 *  `kept` (its tabs are kept, not reopened — `vibespace-browser resume` does that). Its own tabs only (its own key). */
function keptAnswerOf(kept) {
  if (!kept || typeof kept !== 'object') return {};
  const KB = require('../browser-kept.js');
  if (kept.kind === 'resumed') return { resumed: { handedBack: !!kept.handedBack, tabs: Array.isArray(kept.tabs) ? kept.tabs.length : 0, current: (Array.isArray(kept.tabs) && kept.tabs[kept.currentIndex]) || null, text: KB.resumedNoteText({ note: kept.note || '', tabs: kept.tabs || [], currentIndex: kept.currentIndex, handedBack: !!kept.handedBack, drove: !!kept.drove }) } };
  if (kept.kind === 'restored') return { restored: { opened: kept.opened || 0, skipped: Array.isArray(kept.skipped) ? kept.skipped : [], current: kept.current || null, text: KB.restoredNoteText({ why: kept.why, opened: kept.opened || 0, skipped: kept.skipped || [], current: kept.current || null }) } };
  if (kept.kind === 'kept') return { kept: { tabs: kept.tabs || 0, why: kept.why || null, text: KB.keptNoteText({ why: kept.why, tabs: kept.tabs || 0 }) } };
  return {};
}
/** lane browser-resume B: `vibespace-browser resume` — THIS conversation's own browser, started (if it is not) with its
 *  kept tabs reopened, or (running) its waiting tabs reopened as new tabs. Never a named profile's (it keeps its own
 *  logins and is opened by any page verb), never a helper's. While the user drives it: `browser_paused` like any verb. */
router.post('/api/agent/browser/resume', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const B = require('../browser-profiles.js');
  const h = String(req.body?.handle || '').trim();
  try {
    if (h && B.isChildKey(h)) return res.status(409).json({ error: 'a helper\'s browser is not kept — `resume` reopens the conversation\'s own browser', code: 'child_not_kept' });
    if (h) return res.status(409).json({ error: `\`resume\` is for this conversation's own browser — "${h.slice(0, 60)}" is a named profile: it keeps its own logins, and any page verb on it opens it`, code: 'not_kept' });
    const pairs = managedPairs(f);
    if (!pairs) return res.status(409).json({ error: 'this session\'s browser is not one VibeSpace keeps (the shared browser, or a session on another machine) — nothing to resume', code: 'not_kept' });
    const paused = typeof k.pausedVerdictFor === 'function' ? k.pausedVerdictFor(f.browserKey, null, { verb: 'resume' }) : null;
    if (paused) return failVerdict(res, paused);
    const r = await k.resumeFor({ browserKey: f.browserKey, sessionId: f.sessionId, envPairs: pairs, sessionName: sessionNameOf(f), variant: f.session._browserVariant || null, by: 'agent' });
    stampActive(f, '');
    ensureBindingOnce(f);
    res.json({ ok: true, already: !!r.already, ...keptAnswerOf(r.kept) });
  } catch (e) { fail(res, e); }
});
/** lane browser-resume C (§3.9, the owner's ruling 3): THE AGENT'S `tab` VERBS on a SHARED profile's browser — its own tabs
 *  only (list / new / switch / close). The CLI routes a `tab` verb here after its /resolve on an attachment; the keeper
 *  judges again from the SESSION's key (resolveFor first: browser_paused while the user drives, profile_changed, the
 *  handles), reads the tabs once and runs at most ONE act under this conversation's own session — another holder's tab is
 *  `not_your_tab` before anything runs. `passthrough` = a browser that holds only this conversation's tabs (its own, a
 *  helper's, a mediated lease): the CLI runs the binary as before. Registered after the belt (every answer walked). */
router.post('/api/agent/browser/tab', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try {
    if (typeof k.agentTabAct !== 'function') return res.json({ ok: true, passthrough: true, why: 'this server has no tab fence' });
    const r = await k.agentTabAct({ browserKey: f.browserKey, handle: String(req.body?.handle || ''), argv: Array.isArray(req.body?.argv) ? req.body.argv.map(String).slice(0, 12) : [] });
    if (!r.ok) return failVerdict(res, r);
    if (!r.passthrough) stampActive(f, r.profileId || '');
    // 2.369.199 integration (lane site-reset verify r4 #1 × lane browser-resume C): a fenced `tab new` NAMES its tab (the
    // binary's ack the keeper read) — the dialog watch binds it to THIS conversation, as the CLI's audit does for an unfenced one
    if (r.opened) {
      const ack = r.opened.ack || r.opened.targetId || null;
      if (ack && ctx.dialogs && typeof ctx.dialogs.bindTab === 'function') { try { const t = dialogTargetFor(k, f, r.profileId); if (t.ok) ctx.dialogs.bindTab(t, ack); } catch (e) { console.warn('[browser] the new tab was not bound to its conversation — ' + (e && e.message)); } }
      const { ack: _ack, ...opened } = r.opened; r.opened = opened;
    }
    res.json(r);
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
    // lane browser-resume C: an attachment's FIRST command bound a tab of its own — its first tab ROOT (once per lease; bounded)
    if (profileId && !ephOk && req.body?.ok !== false && typeof k.bootstrapTabRoot === 'function') { try { await k.bootstrapTabRoot(profileId, f.browserKey); } catch { /* the roots are learned at the next tab act */ } }
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
    // lane browser-stuck: what the verb ran into — a dialog it opened (an alert accepted, a confirm held), the notes it was
    // not told, the verb's outcome for the unresponsive verdict (a timeout, or `dialog` = the CLI cut it at a dialog)
    // verify r4 #1 (site-reset): a `tab new` that succeeded NAMES its tab (the CLI read the binary's own ack) — the watch binds it
    // to THIS conversation before the fact after the verb is read (never "the verb that happened to be in flight")
    const tabAck = req.body?.tab && typeof req.body.tab === 'object' && typeof req.body.tab.targetId === 'string' ? req.body.tab.targetId.slice(0, 64) : null;
    const dlg = profileId ? await dialogAnswerFor(k, f, profileId, { arm: false, outcome: req.body?.dialog ? 'held-by-dialog' : req.body?.loop ? 'loop' : req.body?.timedOut ? 'timeout' : 'ok', ended: true, bind: tabAck }) : (endVerb(f), {}); // lane site-reset: a verb cut at a navigation loop is not a timeout (the loop explains it)
    // lane site-reset: a verb the loop CUT keeps its session's daemon waiting until 0.38.1's own timeout — remembered, said
    if (req.body?.loop === 'cut' && since > 0) { try { ctx.dialogs?.noteCut?.(f.browserKey, since); } catch { /* optional */ } }
    if (dlg.dialog && ctx.dialogs && typeof ctx.dialogs.busyFor === 'function') { const b = ctx.dialogs.busyFor(f.browserKey); if (b > 0) dlg.dialog.busy = require('../browser-stuck.js').busyText(b); }
    // lane browser-propose step 2: a navigation's FINAL url + title (the CLI read them off the browser CLI's own result)
    // against the PURE sign-in refusal table — a HINT the CLI prints like the 403/429 one, never a detection
    const nav = req.body?.nav && typeof req.body.nav === 'object' ? req.body.nav : null;
    const hint = nav ? require('../browser-switch.js').navHint({ url: typeof nav.url === 'string' ? nav.url.slice(0, 4096) : '', title: typeof nav.title === 'string' ? nav.title.slice(0, 4096) : '' }) : null;
    // lane browser-propose step 3: a proposal the user REJECTED is told ONCE — at this conversation's next navigation to
    // that host (the requested url or where it landed)
    let rejected = null;
    if (ctx.proposals && typeof ctx.proposals.rejectionFor === 'function' && (typeof req.body?.url === 'string' || nav)) {
      for (const u of [nav && typeof nav.url === 'string' ? nav.url : null, typeof req.body?.url === 'string' ? req.body.url : null]) {
        if (!u || rejected) continue;
        try { rejected = ctx.proposals.rejectionFor({ browserKey: f.browserKey, host: u }); } catch { rejected = null; }
      }
    }
    // verify r1 V1 (lane browser-propose): what CloakBrowser's site list REFUSED while this verb ran — its own profile's
    // proxy (one per cloak profile), a profile this conversation HOLDS a lease on (never another's refusals), since the
    // verb's /resolve — by name, so the agent asks for exactly that site (one card) instead of reading a blank page
    let egressRefused = null;
    if (profileId && since > 0 && typeof k.cloakRefusals === 'function' && typeof k.leasesFor === 'function' && k.leasesFor(f.browserKey).some((l) => l.profileId === profileId)) {
      try { const hosts = k.cloakRefusals(profileId, since); if (hosts.length) egressRefused = { hosts, text: require('../browser-switch.js').egressRefusedText(hosts) }; } catch { egressRefused = null; }
    }
    res.json({ ok: true, ...(interrupted ? { interrupted } : {}), ...dlg, ...(hint ? { hint } : {}), ...(rejected ? { proposalRejected: { site: rejected.site, text: rejected.text } } : {}), ...(egressRefused ? { egressRefused } : {}) });
  } catch (e) { fail(res, e); }
});
// ── lane browser-stuck (2026-09-28, the owner's ruling "让agent知道这个对话框的存在和交互能力"): A PAGE DIALOG IS A FACT OF THE
// AGENT'S VERB. The dialog watch (src/server/browser-dialogs.js) holds a Page-enabled CDP socket on every tab of a local
// browser BEFORE the verb runs (measured: only such a client can see or answer a dialog); the verb's /resolve and /audit
// answers carry what it sees (`dialog`), the CLI keeps a long-poll on it while the verb runs (the verb returns
// `dialog_open` at the event, never after the 30 s timeout), and the agent's `dialog accept|dismiss` answers through it.
/** The browser a dialog question names — ONE of this conversation's own: its (or a helper's) managed ephemeral record,
 *  or a named profile it holds a lease on. Never another conversation's (a page dialog is that page's content). */
function dialogTargetFor(k, f, profileId) {
  const B = require('../browser-profiles.js');
  let p = null; try { p = profileId ? k.profile(String(profileId)) : null; } catch { p = null; }
  if (!p) return { ok: false, code: 'not-found', error: 'that is not a browser of this conversation' };
  if (B.isEphemeralProfile(p)) {
    if (B.parentKeyOf(p.owner.id) !== f.browserKey) return { ok: false, code: 'not-found', error: 'that is not a browser of this conversation' };
    return { ok: true, profileId: p.id, ephemeral: true, sessionId: f.sessionId, browserKey: p.owner.id };
  }
  let held = false; try { held = k.leasesFor(f.browserKey).some((l) => l.profileId === p.id); } catch { held = false; }
  if (!held) return { ok: false, code: 'not_attached', error: 'this conversation holds no lease on that browser' };
  return { ok: true, profileId: p.id, ephemeral: false, sessionId: f.sessionId, browserKey: f.browserKey };
}
function endVerb(f, profileId = null) { try { ctx.dialogs?.verbEnded?.(f.browserKey, { profileId: profileId || null }); } catch { /* optional */ } }
/** `{dialog: {watched, open, text, notes, stuck}}` for a resolve / audit answer ({} without a watch). A resolve ARMS the
 *  watch first (bounded — it must be on the tab before the verb can open a dialog) and marks the verb running; an
 *  audit ends it and notes its outcome. Notes are told ONCE (consumed here). Never throws. */
async function dialogAnswerFor(k, f, profileId, { arm = true, outcome = null, ended = false, verb = null, bind = null } = {}) {
  const D = ctx.dialogs;
  if (ended) endVerb(f, profileId);
  if (!D || !profileId) return {};
  const t = dialogTargetFor(k, f, profileId);
  if (!t.ok) return {};
  try {
    if (arm) await D.arm(t.profileId);
    // lane browser-swiftshader-cpu: a page frozen for idle paint is shown again BEFORE the verb runs (the CLI's /resolve door)
    if (arm && typeof D.thawPaint === 'function') { try { await D.thawPaint(t.profileId, { holder: t }); } catch { /* the verb runs on the page as it is */ } } // r2: THIS conversation's tabs only
    // verify r4 #1: the tab a `tab new`'s ack named is bound to this conversation FIRST — the fact below reads it as its own
    let bound = null;
    if (bind && typeof D.bindTab === 'function') { try { bound = D.bindTab(t, bind); } catch (e) { bound = { ok: false, code: 'bind_failed', error: String(e && e.message) }; } }
    const fct = D.factFor({ ...t, consume: true });
    // lane site-reset: a page-ACTING verb's instant (its page turn is the agent's, never a loop) — never one the CLI will
    // answer with the standing loop instead of running it (a refused click must not reset the loop it was refused for)
    if (arm) D.verbStarted(f.browserKey, { profileId: t.profileId, verb: fct.loop && !require('../browser-stuck.js').loopPasses(verb) ? null : verb });
    // verify r1 A7: a timeout while the watch saw a navigation start on this conversation's tab and not commit is the
    // NETWORK's (a slow site) — never evidence of a hung page (three of them branded a browser "not responding" whose
    // next `open` answered in 96 ms)
    // verify r2 #5: …for LOADING_GRACE_MS from the run's first start (`over` past it: the timeouts count again), and the
    // agent is TOLD at every such timeout — the time so far and what to do (a page navigating in a loop was silence for ever)
    const loading = outcome === 'timeout' && fct.loading ? fct.loading : null;
    if (outcome) D.noteOutcome(t.profileId, { state: loading && !loading.over ? 'loading' : outcome, browserKey: t.browserKey }); // verify r1: the run is THIS conversation's
    const stuck = outcome && !fct.open ? D.factFor({ ...t, consume: false }).stuck : fct.stuck;
    // lane site-reset: a navigation LOOP standing on this conversation's tab (the block + the sentence) — a page-waiting verb is
    // answered with it at once, the ways out still run; at the audit it says what the verb ran into
    const fresh = outcome ? D.factFor({ ...t, consume: false }) : fct;
    const loop = fresh.loop;
    // verify r1: `loopShared` — some tab of a shared browser loops and this conversation's cannot be told apart (a kind only)
    return { dialog: { watched: fct.watched, profileId: t.profileId, passkey: fct.passkey || null /* lane browser-passkey */, prompt: fct.prompt || null /* lane browser-ui-prompts */, open: fct.open, text: fct.text || '', notes: fct.notes, stuck: stuck ? stuck.text : null, blind: !!fct.blind, unattributed: !!fct.unattributed, loading: loading ? require('../browser-stuck.js').loadingText(loading, { now: loading.at }) : null, loop: loop || null, loopShared: !!fresh.loopShared, ...(bound ? { tabBound: { ok: !!bound.ok, code: bound.code || null } } : {}) } };
  } catch (e) { console.warn(`[browser-dialog] ${f.browserKey}: the dialog fact was not read — ${e && e.message}`); return {}; }
}
/** The CLI's long-poll while its verb runs: answers at the first HELD dialog in this conversation's scope (the event),
 *  or `open: null` at `wait` (≤ 25 s — the CLI asks again while its verb still runs). */
router.get('/api/agent/browser/dialog', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const D = ctx.dialogs;
  if (!D) return res.status(409).json({ error: 'VibeSpace does not watch page dialogs on this server', code: 'not_watched' });
  const t = dialogTargetFor(k, f, req.query.profile);
  if (!t.ok) return failVerdict(res, t);
  const wait = Math.max(0, Math.min(Number(req.query.wait) || 0, 25000));
  // lane site-reset: `loop=1` — the verb also ends at a navigation loop judged in its scope; `after` = the verb's own
  // resolve instant for a NAVIGATION verb (the old page's loop is not its own — the new page's is)
  const loopWanted = String(req.query.loop || '') === '1' ? { after: Math.max(0, Number(req.query.after) || 0) } : null;
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  try {
    const hit = wait ? await D.waitForOpen(t, wait, { signal: ac.signal, loop: loopWanted, passkey: String(req.query.passkey || '') === '1', prompt: String(req.query.prompt || '') === '1' }) : null; // lane browser-passkey: `passkey=1` — an ACTING verb also ends at `passkey_open` (+ r2 of browser-ui-prompts: `prompt=1` — a navigating verb ends at an HTTP sign-in)
    if (ac.signal.aborted && !res.writable) return;
    const fct = D.factFor({ ...t, consume: false });
    const loop = hit && hit.loop ? { ...require('../browser-stuck.js').loopBlock(hit.loop), runStart: hit.loop.runStart, text: require('../browser-stuck.js').loopText(hit.loop) } : null;
    res.json({ watched: fct.watched, open: fct.open, text: fct.text || '', via: hit ? hit.via : null, eventAt: hit ? hit.at : null, answeredAt: Date.now(), ...(loop && !fct.open ? { loop } : {}), ...(hit && hit.passkey && !fct.open ? { passkey: hit.passkey } : {}), ...(hit && hit.prompt && !fct.open ? { prompt: hit.prompt } : {}) });
  } catch (e) { fail(res, e); }
});
/** lane browser-passkey (owner inc-muuvthv9-g69w): the agent's `passkey status | cancel` — a page waiting for a passkey on
 *  THIS conversation's own browser (its lease / its ephemeral record only; the reach is asked again after every await — a
 *  lease that went while the watch armed acts on nothing). `cancel` aborts the page's request through the hook (the page's
 *  promise rejects AbortError, Chrome's own window closes). While the user drives it is the user's page: refused. */
router.post('/api/agent/browser/passkey', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const D = ctx.dialogs;
  const PK = require('../browser-passkey.js');
  if (!D || typeof D.cancelPasskey !== 'function') return res.status(409).json({ error: 'VibeSpace does not watch passkey requests on this server', code: 'not_watched' });
  const action = String(req.body?.action || 'status');
  if (!['status', 'cancel'].includes(action)) return res.status(400).json({ error: 'passkey takes status | cancel', code: 'bad-request' });
  const t0 = dialogTargetFor(k, f, req.body?.profile);
  if (!t0.ok) return failVerdict(res, t0);
  try {
    const armed = await D.arm(t0.profileId);
    if (!armed.ok) return res.status(409).json({ error: armed.error || 'VibeSpace is not watching this browser', code: 'not_watched' });
    const t = dialogTargetFor(k, f, req.body?.profile); // the reach, asked again after the await
    if (!t.ok) return failVerdict(res, t);
    const v = D.passkeyIn(t.profileId, D.scopeFor(t));
    if (action === 'status') return res.json({ ok: true, passkey: PK.passkeyBlock(v), text: v.state === PK.PASSKEY_OPEN_CODE ? v.text : v.state === 'unknown' ? PK.UNKNOWN_TEXT : v.state === 'pending' ? `A passkey request (${PK.rpWord(v.record.rpId) || 'this site'}) started under ${Math.ceil(PK.PENDING_SAID_MS / 1000)} s ago — a present authenticator may still answer it.` : PK.NONE_TEXT });
    let st = null; try { st = k.inputStateFor(t.ephemeral ? t.browserKey : f.browserKey, t.ephemeral ? null : t.profileId); } catch { st = null; }
    if (st && st.input === 'user') return res.status(409).json({ error: require('../browser-interrupt.js').interruptedText('passkey cancel'), code: 'browser_interrupted', takenAt: st.takenAt || 0 });
    const r = await D.cancelPasskey(t, { by: 'agent' });
    const again = dialogTargetFor(k, f, req.body?.profile);
    if (!again.ok) return failVerdict(res, again);
    if (!r.ok) return res.status(409).json({ error: r.error, code: r.code });
    res.json({ ok: true, cancelled: r.n, text: r.text });
  } catch (e) { fail(res, e); }
});
/** lane browser-ui-prompts-r2 (B-ebfc): the agent's `permission <kind> allow|deny [origin] [lat,lon]` — OUR CDP act on THIS
 *  conversation's own browser (every kind is denied ahead by the watch; this flips one kind for one origin, the current tab's
 *  by default). Recorded on the lease, the trace and the live view's line. While the user drives it is the user's page. */
router.post('/api/agent/browser/permission', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const D = ctx.dialogs;
  if (!D || typeof D.setPermission !== 'function') return res.status(409).json({ error: 'VibeSpace does not decide page permissions on this server', code: 'not_watched' });
  const t0 = dialogTargetFor(k, f, req.body?.profile);
  if (!t0.ok) return failVerdict(res, t0);
  try {
    const armed = await D.arm(t0.profileId);
    if (!armed.ok) return res.status(409).json({ error: armed.error || 'VibeSpace is not watching this browser', code: 'not_watched' });
    const t = dialogTargetFor(k, f, req.body?.profile); // the reach, asked again after the await
    if (!t.ok) return failVerdict(res, t);
    let st = null; try { st = k.inputStateFor(t.ephemeral ? t.browserKey : f.browserKey, t.ephemeral ? null : t.profileId); } catch { st = null; }
    if (st && st.input === 'user') return res.status(409).json({ error: require('../browser-interrupt.js').interruptedText('permission'), code: 'browser_interrupted', takenAt: st.takenAt || 0 });
    const r = await D.setPermission(t, { kind: req.body?.kind, setting: req.body?.setting, origin: typeof req.body?.origin === 'string' ? req.body.origin : '', at: req.body?.at ?? null, by: 'agent' });
    if (!r.ok) return res.status(r.code === 'bad-request' || r.code === 'no_origin' ? 400 : 409).json({ error: r.error, code: r.code });
    try { ctx.traceDialogAct?.({ sessionId: f.sessionId, profileId: t.ephemeral ? null : t.profileId, action: 'permission', permission: r.permission }); } catch (e) { console.warn('[browser-permission] the trace row was not written — ' + (e && e.message)); }
    res.json({ ok: true, permission: r.permission, text: r.text });
  } catch (e) { fail(res, e); }
});
/** The agent's `dialog status | accept [text] | dismiss` — answered through the watch (the one client that saw the
 *  dialog open). While the user drives it is the user's page: refused `browser_interrupted` (the mediator's fence says
 *  the same for Page.handleJavaScriptDialog). `not_watched` ⇒ the CLI falls back to the browser CLI's own verb. */
router.post('/api/agent/browser/dialog', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const D = ctx.dialogs;
  const ST = require('../browser-stuck.js');
  if (!D) return res.status(409).json({ error: 'VibeSpace does not watch page dialogs on this server', code: 'not_watched' });
  const t = dialogTargetFor(k, f, req.body?.profile);
  if (!t.ok) return failVerdict(res, t);
  const action = String(req.body?.action || 'status');
  if (!['status', 'accept', 'dismiss'].includes(action)) return res.status(400).json({ error: 'dialog takes status | accept [text] | dismiss', code: 'bad-request' });
  try {
    const armed = await D.arm(t.profileId);
    if (!armed.ok) return res.status(409).json({ error: armed.error || 'VibeSpace is not watching this browser', code: 'not_watched' });
    // verify r1 A5 (reproduced: a confirm held across a VibeSpace restart): the new watch cannot see into that tab (its
    // Page.enable never answers under the open dialog) and said "No page dialog is open" to a `dialog accept` the lease's
    // own daemon — which DID see it — could answer; a shared browser whose conversation's tab is unknown said the same.
    // Nothing is claimed that the watch cannot see: `not_watched` hands the verb to the browser CLI's own `dialog` verb
    // (the daemon answers for its OWN tab — the per-lease witness)
    const blindSay = (fct) => res.status(409).json({ error: fct.blind ? 'VibeSpace\'s watch cannot see into this tab (a dialog may have opened before it attached) — the browser\'s own view answers' : 'VibeSpace does not know which tab of this shared browser is yours — the browser\'s own view answers', code: 'not_watched', why: fct.blind ? 'blind' : 'unattributed' });
    if (action === 'status') { const fct = D.factFor({ ...t, consume: true }); if (!fct.open && (fct.blind || fct.unattributed)) return blindSay(fct); return res.json({ ok: true, watched: fct.watched, open: fct.open, text: fct.open ? fct.text : ST.NO_DIALOG_TEXT, notes: fct.notes }); }
    let st = null; try { st = k.inputStateFor(t.ephemeral ? t.browserKey : f.browserKey, t.ephemeral ? null : t.profileId); } catch { st = null; }
    if (st && st.input === 'user') return res.status(409).json({ error: require('../browser-interrupt.js').interruptedText('dialog ' + action), code: 'browser_interrupted', takenAt: st.takenAt || 0 });
    // lane browser-windows: the verify r1 A1 drive belt is gone with the drive claim — the user driving the window this lease
    // is in (its own, or an older run's shared one) is THIS lease's input state, refused just above
    { const fct = D.factFor({ ...t, consume: false }); if (!fct.open && (fct.blind || fct.unattributed)) return blindSay(fct); }
    const text = action === 'accept' && typeof req.body?.text === 'string' ? req.body.text.slice(0, 2000) : null;
    const r = await D.answer(t, { accept: action === 'accept', text, by: 'agent' });
    if (!r.ok) return res.status(STATUS[r.code] || 409).json({ error: r.error, code: r.code });
    try { ctx.traceDialogAct?.({ sessionId: f.sessionId, profileId: t.ephemeral ? null : t.profileId, action, dialog: r.dialog }); } catch (e) { console.warn('[browser-dialog] the trace row was not written — ' + (e && e.message)); }
    res.json({ ok: true, text: r.text, dialog: r.dialog });
  } catch (e) { fail(res, e); }
});
/** lane site-reset step 1b (the owner, 2026-09-30: "这种问题不应该导致浏览器无法操作啊，agent 应该至少能选择关闭、停止页面"): THE WAYS
 *  OUT, DIRECT — through the watch's own CDP socket, never the browser CLI's queue (measured on 0.38.1: a verb the loop cut
 *  keeps its session's daemon waiting until its own 25 s timeout; everything the agent runs next queues behind it):
 *    stop        Page.stopLoading on the conversation's looping (else loading) tab — ms
 *    close       Target.closeTarget on the LOOPING tab (the CLI sends a bare `tab close` here only while a loop stands)
 *    screenshot  Page.captureScreenshot on the looping tab, bounded — the picture (base64; the CLI writes the file it
 *                judged) or `no_picture` by name (a page that never draws has none)
 *  A tab another conversation's (or the user's own) live view shows is never acted on (`not_your_tab`). */
router.post('/api/agent/browser/direct', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const D = ctx.dialogs;
  const ST = require('../browser-stuck.js');
  const action = String(req.body?.action || '');
  if (!['stop', 'close', 'screenshot'].includes(action)) return res.status(400).json({ error: 'direct takes stop | close | screenshot', code: 'bad-request' });
  if (f.remote) return res.status(409).json({ error: 'this conversation runs on another machine — its browser is that machine\'s; VibeSpace cannot act on its pages from here', code: 'remote_session', remedy: 'vibespace-browser tab close' });
  if (!D || !req.body?.profile) return res.status(409).json({ error: 'VibeSpace does not watch this browser (the machine\'s shared browser, or one it does not manage) — nothing was done', code: 'not_watched', remedy: 'vibespace-browser tab close' });
  const t = dialogTargetFor(k, f, req.body?.profile);
  if (!t.ok) return failVerdict(res, t);
  try {
    const armed = await D.arm(t.profileId);
    if (!armed.ok) return res.status(409).json({ error: armed.error || 'VibeSpace is not watching this browser', code: 'not_watched', remedy: 'vibespace-browser tab close' });
    let st = null; try { st = k.inputStateFor(t.ephemeral ? t.browserKey : f.browserKey, t.ephemeral ? null : t.profileId); } catch { st = null; }
    if (st && st.input === 'user') return res.status(409).json({ error: require('../browser-interrupt.js').interruptedText(action === 'close' ? 'tab close' : action), code: 'browser_interrupted', takenAt: st.takenAt || 0 });
    const busyMs = D.busyFor(f.browserKey);
    if (action === 'stop') {
      const r = await D.stopTab(t);
      if (!r.ok) return res.status(STATUS[r.code] || 409).json({ error: r.error, code: r.code, ...(r.why ? { why: r.why } : {}), ...(r.remedy ? { remedy: r.remedy } : {}) }); // verify r1: an unattributed shared browser is said by name, with the way out
      return res.json({ ok: true, text: ST.stopText({ ...r, busyMs }), url: r.url || '', title: r.title || '', nothing: !!r.nothing, ...(r.was ? { loop: r.was } : {}) });
    }
    if (action === 'close') {
      const r = await D.closeTab(t);
      if (!r.ok) return res.status(STATUS[r.code] || 409).json({ error: r.error, code: r.code });
      return res.json({ ok: true, text: ST.closeText({ ...r, busyMs }), url: r.url, title: r.title, opened: !!r.opened, ...(r.was ? { loop: r.was } : {}) });
    }
    const r = await D.captureTab(t);
    if (!r.ok) return res.status(STATUS[r.code] || 409).json({ error: r.error, code: r.code, ...(r.loop ? { loop: r.loop } : {}) });
    res.json({ ok: true, data: r.data, url: r.url, title: r.title, ...(r.loop ? { loop: r.loop } : {}) });
  } catch (e) { fail(res, e); }
});
/** lane site-reset step 2: the agent's `site-reset <host> | --host <host>` — ONE site's stored login cleared in the
 *  conversation's OWN browser (its ephemeral one, or a named profile only it may use and nobody else holds or browses):
 *  the cookies that reach the host, its origins' storage, the session storage of its open tabs — through the watch's own
 *  socket, never `clearBrowserCookies`. PURE ST.siteResetVerdict orders the refusals (remote, not watched, a bad host, not
 *  the site of one of its own tabs without `--host`); a SHARED profile is never cleared here (`shared_profile` → step 3's
 *  proposal). The CLI writes the audit line like every verb's. */
/** lane browser-unresponsive: `vibespace-browser restart [profile]` — an agent restarts a browser it holds ONLY while the
 *  keeper judges it hung (browser_unresponsive) and no human drives it (take_over_first); a working browser is refused
 *  `browser_answering` by name. No profile named ⇒ the one hung browser among its leases. */
router.post('/api/agent/browser/restart', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  if (typeof k.restartProfile !== 'function') return res.status(503).json({ error: 'this server cannot restart a browser', code: 'unavailable' });
  try {
    const ref = String(req.body?.profile || '').trim().slice(0, 200);
    const held = (k.leasesFor(f.browserKey) || []).map((l) => l.profileId).filter(Boolean);
    let id = null;
    if (ref) { const p = k.profileByRef(ref); id = p && !p.ambiguous && p.id ? p.id : null; if (!id || !held.includes(id)) return res.status(404).json({ error: `"${ref}" is not a browser profile this conversation uses — \`vibespace-browser list\``, code: 'not-found' }); }
    else { const hung = held.filter((pid) => { const b = k.browserOf(pid); return !!(b && b.unresponsive); }); id = hung.length === 1 ? hung[0] : held.length === 1 ? held[0] : null; if (!id) return res.status(400).json({ error: held.length ? 'name the profile to restart: `vibespace-browser restart <profile>`' : 'this conversation uses no browser profile', code: 'bad-request' }); }
    const browser = await k.restartProfile(id, { by: 'agent', browserKey: f.browserKey, sessionName: f.sessionName || null });
    res.json({ ok: true, profileId: id, browser: browser ? { state: browser.state, label: browser.label || null } : null, note: 'restarted — logins kept; your next command opens your tab again; every other conversation on it was told' });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/site-reset', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const D = ctx.dialogs;
  const ST = require('../browser-stuck.js');
  const B = require('../browser-profiles.js');
  const host = typeof req.body?.host === 'string' ? req.body.host.trim().toLowerCase().slice(0, 253) : '';
  const explicit = req.body?.explicit === true;
  const t = D && req.body?.profile ? dialogTargetFor(k, f, req.body.profile) : { ok: false };
  if (!f.remote && D && req.body?.profile && !t.ok) return failVerdict(res, t);
  try {
    if (t.ok) { const armed = await D.arm(t.profileId); if (!armed.ok) t.ok = false; }
    let own = true, p = null;
    if (t.ok && !t.ephemeral) {
      try { p = k.profile(t.profileId); } catch { p = null; }
      // who else holds it (other conversations) and whether the user browses in it — the keeper's ONE holder reader
      let who = { others: 1, human: true }; try { who = k.siteResetHolders(t.profileId, { except: f.browserKey }); } catch { /* unknown ⇒ shared (a proposal) */ }
      own = ST.siteResetOwn({ ephemeral: false, use: B.whoMayUse(p), me: B.parentKeyOf(String(f.browserKey)), others: who.others, human: who.human });
    }
    const tabs = t.ok ? D.ownTabs(t) : [];
    const v = ST.siteResetVerdict({ host, explicit, current: tabs.map((x) => x.url), remote: !!f.remote, watched: !!t.ok, shared: !own });
    if (!v.ok) return res.status(STATUS[v.code] || 409).json({ error: v.error, code: v.code, ...(v.remedy ? { remedy: v.remedy } : {}) });
    let st = null; try { st = k.inputStateFor(t.ephemeral ? t.browserKey : f.browserKey, t.ephemeral ? null : t.profileId); } catch { st = null; }
    if (st && st.input === 'user') return res.status(409).json({ error: require('../browser-interrupt.js').interruptedText('site-reset'), code: 'browser_interrupted', takenAt: st.takenAt || 0 });
    if (v.proposal) {
      const onHost = tabs.find((x) => ST.hostOf(x.url) === v.host);
      const pr = typeof ctx.siteResets?.propose === 'function' ? ctx.siteResets.propose({ f, t, profile: p, host: v.host, url: onHost ? onHost.url : '' }) : null;
      if (!pr) return res.status(409).json({ error: `this profile is shared (other conversations, or the user's own browsing, use it) — ${v.host}'s login is cleared there only by the user's Approve, and no proposal can be filed on this server`, code: 'shared_profile' });
      if (!pr.ok) return failVerdict(res, pr);
      return res.json({ ok: true, proposal: pr.proposal, text: pr.text });
    }
    const r = await D.clearSite(t.profileId, { host: v.host });
    if (!r.ok) return res.status(STATUS[r.code] || 502).json({ error: r.error, code: r.code });
    res.json({ ok: true, cleared: { host: r.host, cookies: r.cookies, cookieDomains: r.cookieDomains, origins: r.origins, storageFailed: r.storageFailed || [], sessionTabs: r.sessionTabs, remaining: r.remaining }, text: ST.siteResetText(r) });
  } catch (e) { fail(res, e); }
});
/** P4: the same provider rows for the CLI (`vibespace-browser providers`),
 *  with the verdict for `?host=` when given — an agent learns WHY a provider
 *  is refused before it asks for one. */
router.get('/api/agent/browser/providers', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const B = require('../browser-profiles.js');
  const host = hostOf(req);
  const h = LOCAL.has(host) ? null : host;
  // lane browser-admin (chunk 3): the Chrome BUILDS of the machine asked about and the browser CLI version VibeSpace
  // drives — FACTS an agent may read (versions only: never a path, never a way to choose — `--executable-path` stays a
  // refused launch flag, `install` not offered, a build is the user's choice in the Agent browser panel)
  const B0 = require('../browser-builds.js');
  let builds = null, cli = null;
  try { builds = typeof k.buildsFor === 'function' ? B0.buildsView(await k.buildsFor(h)) : null; } catch { builds = null; }
  if (builds && builds.ok) builds = { ok: true, missing: builds.missing, cut: builds.cut, builds: builds.builds }; // no root path for an agent
  try { const c = typeof k.cliFacts === 'function' ? await k.cliFacts() : null; cli = c ? { table: c.table, mode: c.choice.mode, chosen: c.choice.version || null, inUse: c.inUse.version || null, inUsePinned: !!c.inUse.pinned, onPath: c.onPath.version || null, pinnedInstalled: c.pinned ? !!c.pinned.installed : null, drift: c.drift || null } : null; } catch { cli = null; }
  res.json({ providers: B.providerRows({ host: h, desktopConsent: typeof k.desktopConsent === 'function' ? k.desktopConsent() : undefined }), proof: B.CLOAK_EGRESS_PROOF, egress: B.egressHostsOf(B.CLOAK_EGRESS_PROOF), cloakSites: typeof k.cloakEgress === 'function' ? k.cloakEgress().allowlist : [], host: h, hostKnown: h ? k.hostKnown(h) : true, builds, cli });
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
    // lane browser-admin 2a: nothing an agent sends chooses a Chrome build (the user's choice — Change build…)
    if (req.body && req.body.browser != null) return res.status(403).json({ error: BUILD_IS_USERS, code: 'browser_choice_user_only' });
    // lane e2a (§E2.1, D1; r3 #4: BEFORE the adopt block — `--adopt` never pre-empts the door): `--backend desktop-app` is the ONE door to a real desktop browser of the agent's own — not a
    // profile: the window-targets engine launches it, grants the opener and leases it as a WINDOW TARGET (no CDP)
    const dv = B.desktopAppNewVerdict(req.body || {});
    if (!dv.ok) return res.status(DESKTOP_APP_STATUS[dv.code] || 400).json({ error: dv.error, code: dv.code });
    if (dv.door === 'desktop-app') return openDesktopAppBrowser(req, res, dv);
    // `--adopt <dir>`: REGISTER a directory that already exists, in place (the
    // remedy the path refusal names — a path becomes a HANDLE here, never on a
    // command); refused with the reason when it is not a directory
    const adoptDir = req.body?.adoptDir ? String(req.body.adoptDir) : '';
    if (adoptDir) {
      // ADOPTABLE ROOTS (2026-09-21): the user's own browser directory is never a
      // session's to register — the PURE verdict names the roots and the remedy
      const B = require('../browser-profiles.js');
      const F = require('../browser-facts.js');
      const roots = ctx.adoptRoots || {};
      // verify F1: the REAL path is judged and registered — a symlink / a `//` spelling is never a way past the fence,
      // and the registry holds ONE identity per directory (the kept store's "never a registered profile's directory")
      const realDir = F.existingRealDir(adoptDir);
      // verify r2 (Y1e): a paired MACHINE's profile (`p.host`) names a directory on THAT machine — the same text here is a
      // different directory; it never answers for a local adopt (it refused one as "already registered … use <remote>")
      let existing = null; try { existing = (k.list().profiles || []).find((p) => p && !p.host && p.dir && (p.dir === adoptDir || (realDir && F.sameRealDir(p.dir, realDir) === true))) || null; } catch { existing = null; }
      const v = B.adoptDirVerdict({ dir: adoptDir, realDir, homeDir: roots.homeDir || null, dataDir: roots.dataDir || null, realHomeDir: F.existingRealDir(roots.homeDir || ''), realDataDir: F.existingRealDir(roots.dataDir || ''), existing, browserKey: f.browserKey });
      if (!v.ok) return res.status(v.code === 'adopt_failed' ? 409 : 403).json({ error: v.error, code: v.code });
      // owner ruling A: usable by ALL of the owner's conversations (`createdBy` = this one); the user's panel switch narrows it
      const a = k.adoptDirectory({ label: req.body?.label, dir: v.dir, owner: { kind: 'instance', id: null }, createdBy: f.browserKey });
      if (!a.profile) return res.status(409).json({ error: a.why || 'cannot adopt that directory', code: 'adopt_failed' });
      return res.json({ profile: view(a.profile), adopted: true, created: a.created });
    }
    // owner ruling A ("A吧"): an agent's `new` makes a profile EVERY conversation of the owner can use — the study's path A
    // (`new work` in one chat, `use work` in the next ⇒ not_owner) is gone; only the user's row switch keeps one to one chat
    res.json({ profile: view(k.createProfile(req.body || {}, { owner: { kind: 'instance', id: null }, createdBy: f.browserKey, by: 'agent' })) });
  } catch (e) { fail(res, e); }
});
/** lane e2a: the desktop-app door's launch — the engine's facts from the SAME session token the belt admitted. */
async function openDesktopAppBrowser(req, res, dv) {
  if (!windowEngine) return res.status(503).json({ error: 'the desktop-app rung is not available in this process (no window-targets engine)', code: 'no_window_engine' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const wf = windowEngine.factsForToken(token);
  if (!wf) return res.status(401).json({ error: 'unknown session token', code: 'unauthorized' });
  try {
    const r = await windowEngine.openAgentBrowser(dv, wf);
    res.json({ desktopApp: { handle: r.handle, label: r.app.label || dv.label, state: r.app.state || null, url: dv.url, keepProfile: dv.keepProfile, origin: r.origin, pin: r.app.pin || null }, lease: r.lease, mode: r.mode || null, modeWhy: r.modeWhy || null, next: r.next });
  } catch (e) { res.status(DESKTOP_APP_STATUS[e && e.code] || 500).json({ error: String((e && e.message) || e), code: (e && e.code) || null, ...(e && e.remedy ? { remedy: e.remedy } : {}) }); }
}
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
router.get('/api/agent/browser/status', async (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  const B = require('../browser-profiles.js');
  // `shared` (D7): the bare verbs of a session on the shared rung reach the machine's browser — status says so
  try {
    const st = k.statusFor(f.browserKey);
    // lane browser-recipes: what an agent reads when it lacks something also names the recipe (manual §0) — and, on a
    // machine with no display, that only vibespace-browser works there (userR's agent launched chromium by hand)
    const R = require('../browser-recipes.js');
    if (f.job) return res.json({ ...st, sessionId: f.sessionId, shared: false, job: jobBindingOf(k, f, st), recipe: R.RECIPE_POINTER, noDisplay: (await statusNoDisplayOf(k, f, st)) || null }); // accept-fixes-jobs F5
    res.json({ ...st, sessionId: f.sessionId, shared: f.job ? false : !B.isolatedVariant(f.session._browserVariant), recipe: f.remote ? R.REMOTE_POINTER : R.RECIPE_POINTER, noDisplay: (await statusNoDisplayOf(k, f, st)) || null }); // verify r1 F1: on another machine the recipe cannot be followed — say so
  } catch (e) { fail(res, e); }
});
/** accept-fixes-jobs F5 (the acceptance of 2.369.202: inside a job `status` said "no profile attached / pin: none" and the
 *  next `open` landed on the conversation's profile): a JOB's status is ITS binding — the profile its next page verb lands
 *  on by the ONE verdict resolveForJob runs (the owner's pin / default attachment; read only — nothing attached, nothing
 *  told), the owner's pin, the job's own lease (its window) once it has one. Its name is read live (never stored). */
function jobBindingOf(k, f, st) {
  const B = require('../browser-profiles.js'), J = require('../browser-job-principal.js');
  const jv = J.jobResolveVerdict(B.resolveHandle({ set: k.setFor(f.ownerKey), handle: '', subagent: false }));
  const p = jv.ok ? k.profile(jv.profileId) : null;
  const l = p ? (st.leases || []).find((x) => x && x.profileId === p.id) : null;
  let job = null;
  try { const jm = typeof ctx.getJobs === 'function' ? ctx.getJobs() : null; job = jm && jm.jobs && typeof jm.jobs.get === 'function' ? jm.jobs.get(f.job.id) : null; } catch { job = null; }
  return { id: f.job.id, label: J.jobLabelOf(job || { id: f.job.id }), lands: p ? { profileId: p.id, label: p.label } : null, refused: jv.ok ? null : { code: jv.code, error: jv.error }, pin: k.pinFor(f.ownerKey) || null, lease: l ? { browser: l.browser || null, input: l.input || null, others: Number(l.others) || 0 } : null };
}
/** lane browser-recipes: the no-display sentence for THIS conversation's `status` — a LIVE browser of its own says what
 *  its launch found (the recorded fact), else this machine is probed now; a conversation on another machine: nothing
 *  (its browser runs there, this machine's display is not its). '' = a display is here (or nothing is known). */
async function statusNoDisplayOf(k, f, st) {
  const s = f.session || {};
  if (s.hostId || s.host || s._browserVariant === 'H') return '';
  const R = require('../browser-recipes.js');
  const live = [st.ephemeral && st.ephemeral.live ? st.ephemeral : null, ...(st.leases || []).map((l) => (l.browser && l.browser.state === 'ready' ? l.browser : null))].find((b) => b && b.display) || null;
  if (live) return R.noDisplayLine({ fact: live.display });
  if (typeof k.machineDisplay !== 'function') return '';
  try { return R.noDisplayLine({ display: await k.machineDisplay() }); } catch { return ''; }
}
router.post('/api/agent/browser/pin', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try { res.json(pinAnswer(k, f, req.body?.profile, { by: 'agent' })); } catch (e) { fail(res, e); }
});
/** lane browser-propose step 3: what the agent is told when its claim filed (or found) a PROPOSAL — the ONE next step
 *  (tell the user in one sentence) and what it must not do (work around the refusal). */
// lane dc-browser-backends (F6): the switch the agent is told about names the ANTI-BOT ROW (src/browser-profiles.js antiBotRow)
const antiName = () => (require('../browser-profiles.js').antiBotRow() || { name: 'the anti-bot browser' }).name;
function proposalNext(r) {
  const p = r.proposal || {};
  const id = r.claim && r.claim.id;
  if (r.rejected) return `the user REJECTED switching your browser to ${antiName()} for ${p.site} — do not work around the refusal (no copied session, no other browser); tell the user which page needs them and carry on with what you can`;
  if (p.state === 'unavailable') {
    const why = p.plan && p.plan.why === 'remote' ? 'this conversation runs on another machine' : p.plan && p.plan.why === 'other-machine' ? 'your browser runs on a paired machine' : p.plan && p.plan.why === 'already-cloak' ? 'your browser already is CloakBrowser' : p.plan && p.plan.why === 'never-admitted' ? `CloakBrowser never opens ${p.site} — a loopback / link-local address` : p.installWhy === 'provider_unavailable' ? 'CloakBrowser is not available in this version' : `CloakBrowser cannot be installed here (${p.installWhy || 'unavailable'})`;
    return `no switch can be offered on this machine (${why}) — the user sees your claim as a card in the chat; tell them in ONE sentence which page refused you: signing in there is theirs (the live view's Take over). Do not work around it`;
  }
  // verify r1: a REJECT is not pushed — it is said at the agent's next navigation to the host (or its next claim on it)
  if (r.duplicate) return `the same card still waits for the user (proposal ${id}, ${p.state}) — no second card was made. Do not ask again and do not work around the refusal; when they approve you are told (with their next message if your turn has ended); if they reject it, your next navigation to ${p.site} says so`;
  const what = p.plan && p.plan.kind === 'switch' ? `switch this browser to ${antiName()} in place` : p.plan && p.plan.kind === 'site' ? `let your ${antiName()} browser open ${p.site}` : `a new ${antiName()} profile for this conversation`;
  const also = Array.isArray(p.alsoSites) && p.alsoSites.length ? `, with the sites ${p.site}'s sign-in page loads from` : '';
  return `a card in the user's chat now waits for their Approve (proposal ${id}: ${what}${also}${p.install === 'needed' ? `, installing ${antiName()} first` : ''}). Tell the user in ONE sentence that the card waits for their Approve — then stop: do NOT work around the refusal (no copied session, no other browser, no switch of your own). When they approve, you are told (with their next message if your turn has ended); re-run the sign-in then`;
}
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
    const v = k.switcherView(p.id, { forAgent: true }); // verify r1 (H1): the rows as if the user were not browsing it (his fact, never an agent's)
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
    const r = k.blocked({ url: req.body?.url, why: req.body?.why, evidence: req.body?.evidence, tier: req.body?.tier, browserKey: f.browserKey, sessionId: f.sessionId, profileId, sessionName: String(f.session?.webuiName || f.session?.name || ''), remote: !!f.remote });
    // lane browser-propose step 3: a tier-2 claim is ONE proposal — its card in the chat + its For-you item (the runner shows them)
    if (r.proposal) { try { ctx.proposals?.filed?.(r); } catch (e) { console.warn('[browser] the proposal card was not shown — ' + (e && e.message)); } }
    let remembered = null;
    if (req.body?.remember === true) { try { remembered = k.addSiteHint({ host: r.claim.host, tier: r.claim.tier, backend: null, why: r.claim.why || 'blocked (agent claim)', by: 'agent' }); } catch (e) { remembered = { error: String(e && e.message), code: e && e.code }; } }
    // the rebuilt dialog: the live view offers the switch ONLY when another browser is available for this profile
    // (SW.switchChoices, the digest's `backends[id].choices`) — the agent is told which world it is in
    let choices = [];
    try { choices = profileId && typeof k.choicesFor === 'function' ? k.choicesFor(profileId) : []; } catch { choices = []; }
    const next = r.proposal ? proposalNext(r)
      : choices.includes((require('../browser-profiles.js').antiBotRow() || {}).id)
        ? `the user sees your claim in the live view with a one-click "Switch to ${antiName()}…" — the switch is THEIR act; \`vibespace-browser backend <name>\` proposes it yourself`
        : 'the user sees your claim in the live view; no other browser is available on this instance, so the switch is not offered there — it is THEIR act to arrange one; `vibespace-browser backend` lists the rows';
    const { proposal, ...rest } = r;
    res.json({ ...rest, ...(proposal ? { proposal: { id: r.claim.id, state: proposal.state, install: proposal.install, plan: { kind: proposal.plan.kind, why: proposal.plan.why || null, label: proposal.plan.label || proposal.plan.profileLabel || null }, site: proposal.site } } : {}), remembered, next });
  } catch (e) { fail(res, e); }
});
router.post('/api/agent/browser/site-hint', (req, res) => {
  const k = keeperOr503(res); if (!k) return;
  const f = agentFacts(req, res); if (!f) return;
  try { res.json({ hint: k.addSiteHint({ host: req.body?.site || req.body?.url, tier: req.body?.tier, backend: req.body?.backend, why: req.body?.why, by: 'agent' }) }); } catch (e) { fail(res, e); }
});

module.exports = { router, setup, setWindowEngine, unpinProfile, pinGuardFor, healDanglingPins, pinHoldersOf, releaseProfile, convertPinnedDirs, keyForPickedSession, sessionFacts, pinAnswer, STATUS }; // + "Who can use it": the ONE resolver of a picked live session (the trace routes' PATCH calls it) // lane S2: the delete's refuse-or-warn + the one unpin (+ the boot heal); owner ruling A: Delete…'s release; the boot conversion of pre-ruling pins
