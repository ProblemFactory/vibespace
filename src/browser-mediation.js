'use strict';
/**
 * THE CDP MEDIATION RULES — PURE (imports nothing; CJS so the mediator, the
 * keeper, the routes, the CLI AND the bundle share ONE rule set).
 * docs/design-agent-browser-v2.md §6.2 / §6.5 / D6, phase P6 ("hard mediation").
 *
 * The problem (§3.4 / §6.5): a profile's CDP endpoint is unauthenticated and
 * confers authority over EVERY target in that browser, so any session that
 * can reach it can drive any tab — including during a human takeover. Between
 * one owner's own sessions that is the trust level every other surface here
 * runs at (`sharing: "owner"`, cooperative). `sharing: "instance"` widens it
 * past the owner's own work, so it is REFUSED until the mediating proxy
 * exists — and accepted after (D6).
 *
 * The mechanism: each (profile, conversation) lease is handed its OWN CDP url,
 * served by a small proxy (src/server/cdp-mediator.js) that
 *   · SCOPES `Target.*` to the targets that lease owns — the ones it created
 *     through its url, the ones opened BY those (opener / owned context),
 *     and the tab the lease was minted with; every other target is invisible
 *     (filtered out of `Target.getTargets` / the discovery events) and
 *     unreachable (`attachToTarget` / `activateTarget` / `closeTarget` /
 *     `getTargetInfo` refused BY NAME);
 *   · REFUSES, while the USER holds the input side (P3's `lease.input === 'user'`),
 *     every method whose CENSUS CLASS is `input`, `view` or `page-mutation`
 *     (src/cdp-census.js — ONE row per method of the installed Chrome's own
 *     /json/protocol: every `Input.*`, the navigation family, a file upload, a
 *     dialog answer, a focus move, the tab acts, viewport / emulation / a frozen
 *     page, script evaluation, DOM / CSS edits, cookies…) — a typed
 *     `browser_interrupted` CDP error naming the takeover, never a timeout
 *     (verify r4: three rounds each found a hand-written list one method short);
 *     every method WITHOUT a row (a newer Chrome's, or an older one's — the
 *     census names the Chromes it read, CENSUS_CHROMES) is refused
 *     `method_unclassified` WHOEVER drives (lane chrome-157, 2026-11-12: it was
 *     forwarded while the agent drove), NAMED so the census can be extended.
 *     THE OWNER'S RULING (2026-09-27, verbatim):
 *     "关于接管浏览器的时候agent脚本，其实应该直接打断所有脚本和agent操作，告知agent发生了打断，
 *     交还时提醒它重新运行" — D6's open script door and the r4 switch
 *     `browser.fenceScriptsWhileDriven` are gone; only `read`, `session` and
 *     `harmless` answer while the user drives, and `interruptPlan` names the
 *     calls IN FLIGHT at the takeover that the mediator aborts at once (a
 *     running script is also asked to stop — src/browser-interrupt.js);
 *   · REFUSES the census's `refused` class outright (`Browser.close` /
 *     `crash*`, `Target.exposeDevToolsProtocol`, `Target.setRemoteLocations`,
 *     the deprecated `Target.sendMessageToTarget`, the deaf-page arm,
 *     Tethering, an unpacked extension…) — a shared browser is nobody's to
 *     kill through a session url;
 *   · a message on a CDP `sessionId` the proxy did not hand out is refused;
 *   · REFUSES a BROWSER-level `Target.setAutoAttach` that pauses new targets
 *     (`waitForDebuggerOnStart: true` with no `sessionId` — identity verify r4,
 *     2026-09-28, measured on Chrome 153.0.8010.47: one client arms it, ANOTHER
 *     client's new tab answers `Runtime.evaluate` but its `Page.navigate` never
 *     returns until the arming client sends `Runtime.runIfWaitingForDebugger`
 *     on a session it alone was handed). Through the proxy that session's
 *     `attachedToTarget` is DROPPED for a target the lease does not own, so the
 *     lease could never resume the tabs it froze — every other conversation's
 *     and the user's own new tab in that shared browser would hang at its first
 *     navigation for as long as the lease's connection lived. The page-level
 *     form (on a `sessionId`: a page's own frames / workers — what the 0.38.1
 *     daemon sends, tapped) and the browser-level form WITHOUT the pause pass;
 *     `Target.autoAttachRelated` names a target and the scope rule covers it.
 * What it CANNOT do: recall a script already running in the page when it is
 * AWAITING (a timer, a fetch) — its continuation runs later; the CALL is
 * rejected and the agent told (measured on Chrome 153, §6.2).
 *
 * Everything here is a DECISION over one JSON message and a scope; the
 * mediator does the I/O, the suite drives these with literal messages.
 */

// §6.2's `sharing` verdict and `isMediatedProfile` live in src/browser-profiles.js
// (the registry's own validator — this file owns the CDP rules only).

// ── the per-session url ────────────────────────────────────────────────────
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const PATH_RE = /^\/m\/([A-Za-z0-9_-]{32})(\/json\/version|\/json\/list|\/json|\/devtools\/browser|\/devtools\/page\/([A-Za-z0-9_.-]{1,128}))\/?$/;
function isToken(t) { return TOKEN_RE.test(String(t || '')); }
/** `/m/<token>/json/version` · `/json/list` · `/json` · `/devtools/browser` ·
 *  `/devtools/page/<targetId>` → `{token, kind, targetId}`; anything else null
 *  (the mediator answers 404 — an unknown path confirms nothing). */
function parseMediatedPath(pathname) {
  const m = PATH_RE.exec(String(pathname || '').split('?')[0]);
  if (!m) return null;
  const rest = m[2];
  const kind = rest === '/json/version' ? 'version' : (rest === '/json/list' || rest === '/json') ? 'list' : rest === '/devtools/browser' ? 'browser' : 'page';
  return { token: m[1], kind, targetId: kind === 'page' ? m[3] : null };
}
/** The ws url a lease is handed (`AGENT_BROWSER_CDP`): agent-browser connects
 *  a `ws://` url directly (measured 0.32.0: an http url is asked
 *  `/json/version` first, a ws url is the browser endpoint itself). */
function mediatedBrowserUrl({ port, token } = {}) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535 || !isToken(token)) return null;
  return `ws://127.0.0.1:${p}/m/${token}/devtools/browser`;
}
function mediatedHttpBase({ port, token } = {}) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535 || !isToken(token)) return null;
  return `http://127.0.0.1:${p}/m/${token}`;
}
/** `/json/version` through the proxy: the upstream's own answer with the
 *  browser endpoint re-pointed at THIS lease's url (never the raw one). */
function versionAnswer(upstream, { port, token } = {}) {
  const src = upstream && typeof upstream === 'object' ? upstream : {};
  const out = {};
  for (const k of ['Browser', 'Protocol-Version', 'User-Agent', 'V8-Version', 'WebKit-Version']) if (src[k] != null) out[k] = String(src[k]);
  out.webSocketDebuggerUrl = mediatedBrowserUrl({ port, token });
  return out;
}
/** `/json/list` through the proxy: only the targets in scope, each one's
 *  page endpoint re-pointed at the lease's url; the frontend url (which
 *  embeds the raw endpoint) is dropped. */
function listAnswer(upstreamList, scope, { port, token } = {}) {
  const base = mediatedBrowserUrl({ port, token });
  if (!base) return [];
  const root = base.replace(/\/devtools\/browser$/, '');
  return (Array.isArray(upstreamList) ? upstreamList : []).filter((t) => t && typeof t === 'object' && inScope(scope, t.id)).map((t) => {
    const { devtoolsFrontendUrl, webSocketDebuggerUrl, ...rest } = t;
    return { ...rest, webSocketDebuggerUrl: `${root}/devtools/page/${t.id}` };
  });
}

// ── the scope ──────────────────────────────────────────────────────────────
/** What ONE lease may touch: its targets, the CDP sessions the proxy handed
 *  it (sessionId → targetId, null for the browser target) and the browser
 *  contexts it created. Sets — the mediator mutates them per message. */
const RECENT_MAX = 64;
function newScope({ targets = [], contexts = [] } = {}) {
  // `recent` = the last target infos this lease was NOT shown (bounded): Chrome
  // announces `Target.targetCreated` BEFORE it answers `Target.createTarget`,
  // so the tab a lease is creating is out of scope for one message — the
  // reply admits it and REPLAYS that announcement (measured on agent-browser
  // 0.32.0 + Chrome 153: without the replay the daemon's target registry
  // never learns its own tab and `open` hangs forever)
  // lane chrome-157 (the .401 read, W2): `frames` = the frame ids seen under this lease's own sessions (Page.frameAttached /
  // frameNavigated — a download's frameId names where it began); `downloads` = the guids this lease's own tabs began while its
  // download folder was lent (admitted by the mediator) — the only downloads it is told of and may cancel
  return { targets: new Set((targets || []).filter(Boolean).map(String)), sessions: new Map(), contexts: new Set((contexts || []).filter(Boolean).map(String)), recent: new Map(), frames: new Set(), downloads: new Set() };
}
function remember(scope, info) {
  if (!scope || !scope.recent || !info || !info.targetId) return;
  scope.recent.delete(String(info.targetId));
  scope.recent.set(String(info.targetId), info);
  while (scope.recent.size > RECENT_MAX) scope.recent.delete(scope.recent.keys().next().value);
}
function inScope(scope, targetId) { return !!scope && !!targetId && scope.targets.has(String(targetId)); }
/** May this target INFO join the scope? Its own id already in, its opener in
 *  (a tab a scoped page opened — window.open / target=_blank), or its browser
 *  context one this lease created. */
function admissible(scope, info) {
  if (!scope || !info || typeof info !== 'object') return false;
  if (inScope(scope, info.targetId)) return true;
  if (info.openerId && scope.targets.has(String(info.openerId))) return true;
  if (info.browserContextId && scope.contexts.has(String(info.browserContextId))) return true;
  return false;
}
function admitTarget(scope, targetId) { if (scope && targetId) scope.targets.add(String(targetId)); return scope; }

// ── the method tables — DERIVED from the census (verify S2 r4, 2026-09-26) ────
// One source of truth: src/cdp-census.js classes EVERY method of the installed Chrome's protocol. The sets below are
// views of it for the readers that want a set (the suites, the CLI's words); the judge reads the census directly.
const CENSUS = require('./cdp-census.js');
const INT = require('./browser-interrupt.js'); // the owner's ruling (2026-09-27): the ONE spelling of `browser_interrupted`
const WIN = require('./browser-windows.js'); // lane browser-windows (U1): a lease's new tab opens in a window of its own (PURE, imports nothing)
const { INTERRUPTED_CODE } = INT;
/** Whole-browser acts no session url may perform, and the escape hatches out of the mediation (the census's `refused` class). */
const ALWAYS_REFUSED = CENSUS.methodsOf('refused');
/** The words of an always-refused method that carries its own (the default names the whole shared browser). */
const ALWAYS_REFUSED_WHY = Object.freeze(Object.fromEntries([...ALWAYS_REFUSED].map((m) => [m, CENSUS.rowOf(m).why]).filter(([, w]) => w)));
/** Methods that NAME a target (`params.targetId`) — in scope or refused. */
const TARGET_METHODS = new Set(['Target.attachToTarget', 'Target.activateTarget', 'Target.closeTarget', 'Target.getTargetInfo', 'Browser.getWindowForTarget']);
/** identity verify r4: the ONE spelling of the browser-level pause refusal (the suite and the CLI's words read it). */
const AUTO_ATTACH_PAUSE_WORDS = 'Target.setAutoAttach with waitForDebuggerOnStart at the browser level would pause every NEW tab of this shared browser at its first navigation — other conversations\' and the user\'s — and this lease is never shown those tabs, so it could not resume them; attach per tab (Target.attachToTarget on a tab of yours, then setAutoAttach on that session) or pass waitForDebuggerOnStart:false';
/** Methods that NAME a browser context — one this lease created or refused. */
const CONTEXT_METHODS = new Set(['Target.disposeBrowserContext']);
/** The paused classes as sets (readers only — `pausedVerdict` is the rule): every `Input.*` is an `input` row
 *  (the deaf-page arm is `refused`), so the old prefix stays true by construction. Since the owner's ruling of
 *  2026-09-27 the page-mutation rows are in the set too (the census's PAUSED_RULE says 'refuse' for all three). */
const PAUSED_METHODS = new Set(CENSUS.rows().filter((r) => CENSUS.PAUSED_RULE[r.cls] === 'refuse' && r.fence === 'mediator' && r.domain !== 'Input').map((r) => r.domain + '.' + r.method));
/**
 * THE PAUSED FENCE IS A CENSUS, NOT A LIST (verify S2 r4). `{refuse, why, row}`: `why` names the class that refused
 * (`input` / `view` / `page-mutation` — the owner's ruling of 2026-09-27 retired the r4 switch: scripts and page edits
 * are refused like input), `unclassified` for a method the census does not list (a newer Chrome — FAIL CLOSED, and said by name;
 * judge() refuses it in BOTH driving states before it asks this — lane chrome-157), else null. A row whose `fence` is `anchor` (Page.bringToFront) is refused by
 * the live view's takeover anchor, never here (measured r2 + r3). A second argument (the retired `{fenceScripts}`) is
 * IGNORED — nothing can re-open the script door.
 */
function pausedVerdict(method) {
  const row = CENSUS.rowOf(method);
  if (!row) return { refuse: true, why: 'unclassified', row: null };
  if (row.fence === 'anchor') return { refuse: false, why: null, row };
  const rule = CENSUS.PAUSED_RULE[row.cls];
  if (rule === 'refuse') return { refuse: true, why: row.cls, row };
  return { refuse: false, why: null, row };
}
/** The sentence a refusal while the user drives carries — `browser_interrupted: <INT.interruptedText(…)>` (the CLI's
 *  refusal reader keys on the code's prefix; the takeover, the interruption and the way out are named). */
function pausedWords(method, pv) {
  if (pv && pv.why === 'unclassified') return INT.interruptedText(`${method} is not in VibeSpace's CDP census — censused on Chrome ${CENSUS.CENSUS_CHROMES.join(' + ')}, src/cdp-census.js; a row classing it lifts this`);
  return INT.interruptedText(method);
}
function isPausedMethod(method) { return pausedVerdict(method).refuse; }
/**
 * lane chrome-157 (主开发's ruling, 2026-11-12): A METHOD WITH NO CENSUS ROW IS REFUSED BY NAME ON EVERY MEDIATED LEASE, IN BOTH
 * DRIVING STATES. judge() consulted the census only while the person drove, so the census's «never a hole» held only then: a
 * newer Chrome's methods (Chrome 157's three; a whole-browser act among a later Chrome's would be the same) reached the agent
 * while it drove, until somebody wrote their row. The words are the AGENT's (never i18n): the method, the browser's version,
 * that this VibeSpace does not know it yet, and what to do — there is no way round it; an update that classes it lifts it.
 * The scope road (judgeScope — an owner's cooperative lease) is untouched: it forwards every call by design.
 */
/**
 * THE WHOLE-PROFILE LAW (the owner's, 2026-11-13; lane chrome-157, measured with the real driver on Chrome 154 + 157): on a profile a
 * person shares with agents, an agent's lease never performs an act on the WHOLE profile. ONE verdict, the census's own list (rows
 * marked `law`), called by judge (the mediated road) AND judgeScope (the scope road) — never a second list, whatever the wire shape
 * (no session, a browser-target session, the lease's own page session — the verdict reads the method, never the session):
 *   · law 'whole-profile' (class refused): method_refused, the row's words saying what to do instead — the profile's acts AND the
 *     whole browser's (close / crash, a mock camera, the privacy signal, extensions, tethering) AND the two that carry a call past
 *     this verdict (Target.sendMessageToTarget, exposeDevToolsProtocol) — the .401 read: so the scope road keeps the whole law;
 *   · law 'whole-profile-own-context': answered only when the call names a browser context THIS lease created (scope.contexts);
 *   · law 'whole-profile-own-download' (Browser.cancelDownload): only a download this lease's own tab began (scope.downloads);
 *   · law 'whole-profile-window' (Browser.setDownloadBehavior): a context of the lease's own ⇒ forwarded as it is; another's ⇒
 *     refused; 'deny' ⇒ refused (it blocks every download of the person's); otherwise THE WINDOW decides (windowStep, below).
 */
const LAW_OF = new Map(CENSUS.rows().filter((r) => r.law).map((r) => [r.domain + '.' + r.method, r]));
const LAW_HEAD = "on a profile a person shares with agents it would act on the WHOLE profile (lane chrome-157, the owner's law)";
function wholeProfileVerdict(msg, scope, { road = MEDIATED_MODE } = {}) {
  const method = msg && typeof msg.method === 'string' ? msg.method : '';
  const row = LAW_OF.get(method);
  if (!row) return null;
  const sid = msg.sessionId == null ? null : String(msg.sessionId);
  const refuse = (words) => ({ kind: 'refuse', why: 'whole-profile', reply: refusal(msg.id, 'method_refused', `${method} ${words}`, sid) });
  if (row.law === 'whole-profile') return refuse(row.why || 'acts on the whole profile a person shares with agents');
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const c = params.browserContextId == null ? '' : String(params.browserContextId);
  const own = !!(c && scope && scope.contexts && scope.contexts.has(c));
  if (row.law === 'whole-profile-window') {
    if (c) return own ? null : refuse(`names a browser context this lease did not create — ${LAW_HEAD}; set the download folder with no context (VibeSpace lends you the profile's folder while your download is in flight) or for a browser context of your own`);
    if (params.behavior === 'deny') return refuse(`with behavior 'deny' would refuse every download of the person's WHOLE profile — ${LAW_HEAD}; to keep a page from downloading, do not click its download`);
    return null;
  }
  if (row.law === 'whole-profile-own-download') {
    const guid = params.guid == null ? '' : String(params.guid);
    if (guid && scope && scope.downloads && scope.downloads.has(guid)) return null;
    return refuse(`${guid ? 'names a download no tab of this lease began' : 'names no download'} — ${LAW_HEAD}; the person's downloads and another conversation's are theirs: cancel only a download your own tab began`);
  }
  if (own) return null;
  return refuse(`${c ? 'names a browser context this lease did not create' : 'names no browser context'} — on a profile a person shares with agents it would change the WHOLE profile (lane chrome-157, the owner's law); it is answered for a browser context this lease made itself (Target.createBrowserContext) — for the person's own profile, ask the person`);
}

/**
 * THE WINDOW (the .401 read, 主开发 2026-11-13 — W1–W6; measured on Chrome 154 + 157: Browser.setDownloadBehavior, sent with no
 * session OR on a page session — the real driver's `download` sends {behavior:'allowAndName', downloadPath, eventsEnabled:true} on
 * its page session — moves the WHOLE profile's download folder; a {behavior:'default'} from any connection puts it back). The
 * profile's folder is an agent's only while THAT agent's download is in flight. ONE small state per PROFILE and this PURE
 * transition function; src/server/cdp-mediator.js only executes its effects. Pinned by a GENERATED table (test-browser-mediation
 * ⑥d: every state × act, the expected cell from the laws, the culls named).
 *   state: null — no window · {phase:'open', owner, n, began:[guid…], deadline} — lent to `owner` (began empty = armed: its bound runs)
 *          · {phase:'closing', owner, n, ordered, then} — the put-back is on its way (`ordered`: on the owner's own connection, so
 *          the owner's next set follows it) · {phase:'lapsed', owner, n} — the bound passed: a download its tab begins now is cancelled
 *   act:   {kind:'set', by, behavior, now, paused, boundMs} · {kind:'begin', own, guid} (own = a frame of the window's lease) · {kind:'end', guid}
 *          · {kind:'bound', now} · {kind:'takeover'} · {kind:'leaseEnd', key} · {kind:'connGone', key} (the lease's LAST connection)
 *          · {kind:'putBackDone', n} · {kind:'repoint'} · {kind:'hubStop'} · {kind:'adopt'} (a hub start; a new hub holds no window)
 *   →      {state, forward, refuse:{code, words}|null, putBack: why|null, admit: guid|null, cancel: guid|null, forget, told}
 *          (`forget` = the lease learns nothing more of its downloads; `told` = the lease is told its folder was put back)
 */
const WINDOW_BOUND_MS = 15000;
const FRAMES_MAX = 4096;
/** Is `frameId` one of this lease's own (a tab it holds, or a frame seen under one of its sessions)? */
function isLeaseFrame(scope, frameId) { const f = frameId == null ? '' : String(frameId); return !!(f && scope && ((scope.targets && scope.targets.has(f)) || (scope.frames && scope.frames.has(f)))); }
const WINDOW_BUSY_TEXT = "another conversation's download is in progress in this profile — try again in a moment (lane chrome-157: one download window per profile)";
const WINDOW_CLOSING_TEXT = "this profile's download folder is being put back — try again in a moment";
function windowStep(state, act) {
  const st = state || null;
  const out = { state: st, forward: false, refuse: null, putBack: null, admit: null, cancel: null, forget: false, told: false };
  const a = act || {};
  const close = (why, { ordered = false, then = null, told = false } = {}) => ({ ...out, state: { phase: 'closing', owner: st.owner, n: st.n, ordered: !!ordered, then }, putBack: why, forget: true, told });
  switch (a.kind) {
    case 'set': {
      if (a.behavior === 'default') {
        if (!st || st.phase === 'lapsed') return { ...out, state: null, forward: true };
        if (st.owner === a.by) return { ...out, state: null, forward: true, forget: true };
        return { ...out, refuse: { code: 'method_refused', words: WINDOW_BUSY_TEXT } };
      }
      if (a.paused) return { ...out, refuse: { code: 'browser_interrupted', words: 'interrupted' } };
      const n = (st && st.n || 0) + 1;
      const bound = Number(a.boundMs) > 0 ? Number(a.boundMs) : WINDOW_BOUND_MS;
      const open = () => ({ ...out, state: { phase: 'open', owner: a.by, n, began: [], bound, deadline: (Number(a.now) || 0) + bound }, forward: true });
      if (!st || st.phase === 'lapsed') return open();
      if (st.owner !== a.by) return { ...out, refuse: { code: 'method_refused', words: WINDOW_BUSY_TEXT } };
      if (st.phase === 'closing') return st.ordered ? open() : { ...out, refuse: { code: 'method_refused', words: WINDOW_CLOSING_TEXT } };
      if (!st.began.length) return { ...out, state: { ...st, deadline: (Number(a.now) || 0) + (Number(st.bound) || WINDOW_BOUND_MS) }, forward: true };
      return { ...out, forward: true };
    }
    case 'begin': {
      if (!st || !a.own || !a.guid) return out;
      if (st.phase === 'open') return st.began.includes(a.guid) ? out : { ...out, state: { ...st, began: [...st.began, a.guid] }, admit: a.guid };
      if (st.phase === 'lapsed') return { ...out, cancel: a.guid };
      return out;
    }
    case 'end': {
      if (!st || st.phase !== 'open' || !st.began.includes(a.guid)) return out;
      const left = st.began.filter((g) => g !== a.guid);
      if (left.length) return { ...out, state: { ...st, began: left } };
      return close('its download ended', { ordered: !!a.ordered });
    }
    case 'bound':
      if (st && st.phase === 'open' && !st.began.length && Number(a.now) >= Number(st.deadline)) return close(`no download began within ${Math.round((Number(st.bound) || WINDOW_BOUND_MS) / 100) / 10} s of the set`, { ordered: !!a.ordered, then: 'lapsed', told: true });
      return out;
    case 'takeover':
      if (st && st.phase === 'open') return close('the person took over', { ordered: !!a.ordered, told: true });
      if (st && st.phase === 'lapsed') return { ...out, state: null };
      return out;
    case 'leaseEnd':
      if (st && st.owner === a.key && st.phase === 'open') return close('the lease ended');
      if (st && st.owner === a.key && st.phase === 'lapsed') return { ...out, state: null };
      return out;
    case 'connGone':
      if (st && st.owner === a.key && st.phase === 'open') return close('its connection ended');
      return out;
    case 'putBackDone':
      if (st && st.phase === 'closing' && st.n === a.n) return { ...out, state: st.then === 'lapsed' ? { phase: 'lapsed', owner: st.owner, n: st.n } : null };
      return out;
    case 'repoint':
      return { ...out, state: null, forget: !!st };
    case 'hubStop':
      if (st && st.phase === 'open') return { ...out, state: null, putBack: 'the hub stopped', forget: true };
      return { ...out, state: null };
    case 'adopt':
      return st ? out : { ...out, putBack: 'a hub start adopted the profile' };
    default:
      return out;
  }
}
const UNCLASSIFIED_CODE = 'method_unclassified';
/**
 * lane chrome-157 r2 (主开发's round 2, MUST): A METHOD NAME IS JUDGED FOR SHAPE BEFORE ANYTHING OF IT IS REMEMBERED OR SAID.
 * Every census row and every censused Chrome's fixture (153–157: 685 methods) is `Domain.method` in letters — the longest
 * 58 characters (BluetoothEmulation.simulateCharacteristicOperationResponse); a custom kernel's VibeSpace.* the same. A name
 * of any other shape (a newline, a space, 10 MB) is no CDP method: refused `bad_message`, its words echo only a short
 * JSON-escaped head, and the mediator keeps and journals NOTHING of it (a count). Asked only on the no-row branch, so no
 * classified verdict can move. Only a SHAPED name reaches the bounded lists and the journal (src/server/cdp-mediator.js).
 */
const METHOD_NAME_MAX = 100;
const METHOD_NAME_SHAPE = /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/;
function methodShaped(method) { return typeof method === 'string' && method.length <= METHOD_NAME_MAX && METHOD_NAME_SHAPE.test(method); }
/** The browser's own name of itself, made safe to print: printable ASCII only, at most 80 characters (null if none). */
function browserLabel(browser) { const b = browser == null ? '' : String(browser).replace(/[^\x20-\x7e]/g, '?').slice(0, 80).trim(); return b || null; }
function unclassifiedWords(method, browser = null) {
  const b = browserLabel(browser);
  return `${method} is not a method this VibeSpace knows yet — ${b ? `the browser is ${b}` : 'the browser\'s version is not known on this connection yet'} and VibeSpace's CDP census (src/cdp-census.js) has no row for it, so it is refused on this lease whoever drives; there is no way round it: a VibeSpace update that classes the method lifts this (censused on Chrome ${CENSUS.CENSUS_CHROMES.join(' + ')})`;
}
/** The words for a name that is not a CDP method's shape — never the name itself, only a short escaped head of it. */
function malformedWords(method) {
  const m = String(method);
  return `a method name ${JSON.stringify(m.slice(0, 40))}${m.length > 40 ? `… (${m.length} characters)` : ''} is not the shape of a CDP method (Domain.method, letters and digits, at most ${METHOD_NAME_MAX} characters) — refused; nothing of it is kept`;
}
/**
 * THE TAKEOVER INTERRUPTS (the owner's ruling, 2026-09-27): which calls STILL WAITING on the browser at the takeover
 * instant the mediator answers NOW with `browser_interrupted` (`abort`: every pending call whose method is refused
 * while the user drives — the same census rule a new call meets; a read / session / harmless call in flight is left
 * to finish, the live view's own stream rides those), and on which CDP sessions it asks Chrome to stop the script
 * RUNNING there (`terminate`: the sessions of the aborted script calls — Runtime.evaluate / callFunctionOn /
 * runScript; `null` = the page endpoint's own target). Measured on Chrome 153.0.8010.47: a running 5 s busy loop
 * stops within ~2 ms of `Runtime.terminateExecution` (its evaluate answers -32603, the page answers the next probe at
 * once, the loop's last statement never runs); sent with nothing running it changes nothing (the page's own timer
 * 400 ms later still ran); a script AWAITING a timer is not running — its continuation still runs (cannot be recalled).
 * `pending` = [{id, method, sessionId}] (one connection's); `pageConn` = a page endpoint (its messages carry no sessionId).
 */
function interruptPlan(pending, { pageConn = false } = {}) {
  const abort = []; const terminate = [];
  const seen = new Set();
  for (const p of Array.isArray(pending) ? pending : []) {
    if (!p || p.aborted || p.id === undefined || p.id === null) continue;
    const method = String(p.method || '');
    if (!pausedVerdict(method).refuse) continue;
    const sid = p.sessionId == null || p.sessionId === '' ? null : String(p.sessionId);
    abort.push({ id: p.id, method, sessionId: sid });
    if (INT.SCRIPT_METHODS.includes(method) && (sid || pageConn)) { const k = sid || '(page)'; if (!seen.has(k)) { seen.add(k); terminate.push(sid); } }
  }
  return { abort, terminate };
}

/**
 * THE USER'S OWN INPUT PASSES THE PAUSED FENCE — ON A CREDIT (lane S2, naive study 2 T4: a takeover of a MEDIATED
 * browser typed nothing and said nothing). A mediated lease's live view streams from the SESSION's own daemon over
 * its scoped url, so the stream server's `Input.*` calls for the USER'S takeover arrive on the very connection the
 * fence judges — and were refused `browser_paused` because the user drives. Measured on agent-browser 0.38.1: one
 * viewer record = exactly one `Input.*` call (6 of 6 kinds), and the stream server reports nothing back. So the live
 * view's bridge mints ONE credit per record it forwards, BEFORE it forwards; the next `Input.*` on that grant spends
 * the oldest live credit and is admitted (the paused fence stays for every `Input.*` without one — an agent driving
 * the url directly while the user drives is still refused); a credit unspent after `INPUT_CREDIT_MS` expires (the
 * stream server never dispatched it — "not delivered"). Credits are FIFO; nothing else is admitted by one.
 */
const INPUT_CREDIT_MS = 1200;
const isInputMethod = (method) => String(method || '').startsWith('Input.');
/**
 * A CREDIT IS BOUND TO THE RECORD'S OWN CDP CALL (lane S2 verify, 2026-09-26 — the credit was a per-grant COUNT: the
 * agent's own commands ride the same daemon connection as the stream server's dispatches, so a concurrent
 * `agent-browser click` / `Input.insertText` / a second socket of the lease spent the user's credit — the agent's
 * input landed during the takeover, the user's own key was refused browser_paused, and the receipt said "delivered").
 * Measured on 0.38.1 (scripts/measure-input-receipts.mjs): the stream server hands CDP the record's fields VERBATIM
 * (`eventType` → `params.type`; a mouse record's x/y/button/clickCount/modifiers[/deltaX/deltaY]; a key record's
 * key/code/text/windowsVirtualKeyCode/modifiers; a touch record's touchPoints), one call per record, in order, under a
 * 61-record burst too. So `creditExpectation(record)` names the call the record BECOMES and only an `Input.*` that
 * matches it (method + every field the record carried) spends that credit — anything else is judged as if no credit
 * existed (refused while the user drives; it burns nothing). The agent can pass the fence only by issuing the exact
 * event the user just made, which is the user's own act.
 */
const CREDIT_METHODS = Object.freeze({ input_mouse: 'Input.dispatchMouseEvent', input_keyboard: 'Input.dispatchKeyEvent', input_touch: 'Input.dispatchTouchEvent' });
const CREDIT_FIELDS = Object.freeze({ input_mouse: ['x', 'y', 'button', 'clickCount', 'modifiers', 'deltaX', 'deltaY'], input_keyboard: ['key', 'code', 'text', 'windowsVirtualKeyCode', 'modifiers'], input_touch: ['modifiers'] });
/**
 * …AND TO THE TAB THE USER IS LOOKING AT (verify r2, 2026-09-26 — the r1 binding named the call's method + params but
 * not its TARGET: measured on 0.38.1, every dispatch rides a page `sessionId`, so an agent's OWN CDP socket, attached
 * to ITS tab B, could flood the exact Enter the user was about to press on tab A — the first arrival spent the credit,
 * a TRUSTED Enter landed on B, the user's own Enter was refused browser_paused, and the receipt said delivered). The
 * stream server's `tabs` record names the active tab's CDP `targetId` (0.38.1), so the bridge binds the credit to it:
 * `creditExpectation(record, {targetId})`, and `creditSessionOk` admits only an `Input.*` on a PAGE session the lease
 * was HANDED (`scope.sessions`: sessionId → targetId) whose target IS that tab. No session, an unknown session, the
 * browser session, another tab: no credit — judged as if none existed, burning nothing. A credit with no targetId
 * (a stream server whose `tabs` carry none) accepts any handed page session. What remains is the user's own tab and
 * the user's own act: an agent session on tab A mirroring the user's Enter lands ONE Enter on A either way.
 */
/** The CDP call a viewer input record becomes: `{method, params, targetId}` (only the fields the record carries; the
 *  tab the user is looking at, or null when the stream did not name it), or null. */
function creditExpectation(record, { targetId = null } = {}) {
  if (!record || typeof record !== 'object') return null;
  const method = CREDIT_METHODS[record.type]; const eventType = String(record.eventType || '');
  if (!method || !eventType) return null;
  const params = { type: eventType };
  for (const k of CREDIT_FIELDS[record.type]) if (record[k] !== undefined && record[k] !== null) params[k] = typeof record[k] === 'number' ? record[k] : String(record[k]);
  if (record.type === 'input_touch') params.touchPoints = Array.isArray(record.touchPoints) ? record.touchPoints.map((p) => ({ x: Number(p && p.x), y: Number(p && p.y) })) : [];
  return { method, params, targetId: targetId == null || targetId === '' ? null : String(targetId) };
}
/** May a call on CDP session `sid` — which the lease's scope maps to `target` (a targetId; null = the browser session;
 *  undefined = never handed to this lease) — spend a credit with this expectation? A page session of the lease, on
 *  the credit's tab (any handed page session when the credit names none). */
function creditSessionOk(expect, sid, target) {
  if (!expect || !sid || typeof sid !== 'string') return false;
  if (target === undefined || target === null || target === '') return false;
  return expect.targetId == null || String(target) === expect.targetId;
}
const sameValue = (a, b) => ((typeof a === 'number' || typeof b === 'number') ? Number(a) === Number(b) : String(a) === String(b));
/** Does THIS CDP message match the credit's expectation? (method + every expected field; extra params are the stream server's defaults) */
function creditMatches(expect, msg) {
  if (!expect || !msg || typeof msg !== 'object' || String(msg.method || '') !== expect.method) return false;
  const p = msg.params && typeof msg.params === 'object' ? msg.params : {};
  for (const [k, v] of Object.entries(expect.params)) {
    if (k === 'touchPoints') { const tp = Array.isArray(p.touchPoints) ? p.touchPoints : []; if (tp.length !== v.length || v.some((q, i) => !tp[i] || Number(tp[i].x) !== q.x || Number(tp[i].y) !== q.y)) return false; continue; }
    if (p[k] === undefined || p[k] === null || !sameValue(p[k], v)) return false;
  }
  return true;
}
/** Take the credit THIS `Input.*` spends — the first live one whose expectation it matches AND whose tab its session
 *  is on (`sessionTarget(sid)` = the scope's sessionId → targetId read; FAIL CLOSED: no resolver, no session, an
 *  unknown one = no credit); expired ones leave wherever they sit (returned so their waiter is told).
 *  VERIFY r3: `otherTab` = the live credits this call MATCHED but could not spend because its session is on another
 *  tab — returned so the mediator can MARK them (never burn them: a hostile mirror on its own tab must not cost the
 *  user their key); an unspent marked credit expires with an honest `other_tab` receipt instead of `not_dispatched`. */
function takeCredit(credits, now, { ttlMs = INPUT_CREDIT_MS, msg = null, sessionTarget = null } = {}) {
  const expired = [];
  const q = Array.isArray(credits) ? credits : [];
  for (let i = q.length - 1; i >= 0; i--) if (now - (Number(q[i].at) || 0) > ttlMs) expired.unshift(q.splice(i, 1)[0]);
  const sid = msg && msg.sessionId != null ? String(msg.sessionId) : null;
  let target;
  try { target = sid && typeof sessionTarget === 'function' ? sessionTarget(sid) : undefined; } catch { target = undefined; }
  const i = msg ? q.findIndex((c) => c && creditMatches(c.expect, msg) && creditSessionOk(c.expect, sid, target)) : -1;
  const otherTab = msg && i < 0 ? q.filter((c) => c && creditMatches(c.expect, msg) && !creditSessionOk(c.expect, sid, target)) : [];
  return { credit: i >= 0 ? q.splice(i, 1)[0] : null, expired, otherTab };
}
/** The receipt a spent credit answers, from the browser's own reply to the `Input.*` call. */
function creditReceipt(reply) {
  if (!reply || typeof reply !== 'object') return { ok: false, code: 'no_reply', error: 'the browser did not answer' };
  if (reply.error) return { ok: false, code: 'browser_refused', error: String(reply.error.message || 'the browser refused it') };
  return { ok: true, code: null, error: null };
}
/** VERIFY r3: the receipt of a credit that EXPIRED — honest about what was seen: `spent` (the call went to the browser,
 *  which has not answered — measured: a mouse dispatch on a HIDDEN tab never answers), `otherTab` (an `Input.*` matching
 *  the record arrived on another tab of the lease and was refused there), else nothing matching ever came. */
function creditExpiryReceipt(c) {
  if (c && c.spent) return { ok: false, code: 'no_reply', error: 'the browser has not answered it (a hidden tab answers no mouse input)' };
  if (c && c.otherTab) return { ok: false, code: 'other_tab', error: 'it arrived on another tab than the one you are looking at and was refused there' };
  return { ok: false, code: 'not_dispatched', error: 'the browser was never asked to act on it' };
}

/** The CDP error a refusal becomes: JSON-RPC's server-error code, the
 *  message PREFIXED with the typed code (agent-browser prints the message;
 *  the CLI's refusal reader keys on the prefix). */
const CDP_REFUSAL_CODE = -32000;
function refusal(id, code, error, sessionId = null) {
  const out = { id: id == null ? null : id, error: { code: CDP_REFUSAL_CODE, message: `${code}: ${error}` } };
  if (sessionId) out.sessionId = sessionId;
  return out;
}
/** Read the typed code back off a refusal (the CLI / the suite). */
function refusalCodeOf(reply) {
  const m = /^([a-z_]+): /.exec(String(reply && reply.error && reply.error.message || ''));
  return reply && reply.error && reply.error.code === CDP_REFUSAL_CODE && m ? m[1] : null;
}

/**
 * Judge ONE client→browser message. Returns
 *   {kind:'forward', pending:{method, params, sessionId}}  — send upstream, remember by id (`rewrite` = the params to send
 *                                                             instead of the client's: a create into a window of its own)
 *   {kind:'refuse', reply}                                  — answer the client, send nothing
 *   {kind:'drop', why}                                      — not a CDP call (no id): say nothing
 * `paused` is the live input side (true = the user drives). A refusal carries `why`
 * (the census class, or 'unclassified'). The retired `fenceScripts` option is ignored.
 */
function judge(msg, scope, { paused = false, browser = null } = {}) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return { kind: 'drop', why: 'not an object' };
  const id = msg.id;
  const method = typeof msg.method === 'string' ? msg.method : '';
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const sid = msg.sessionId == null ? null : String(msg.sessionId);
  if (!method) return id == null ? { kind: 'drop', why: 'no method' } : { kind: 'refuse', reply: refusal(id, 'bad_message', 'a CDP call names a method', sid) };
  if (id == null) return { kind: 'drop', why: 'no id' };
  if (sid && !scope.sessions.has(sid)) return { kind: 'refuse', reply: refusal(id, 'session_out_of_scope', `CDP session ${sid} was not handed to this lease`, sid) };
  { const wp = wholeProfileVerdict(msg, scope, { road: MEDIATED_MODE }); if (wp) return wp; }   // (lane chrome-157: the one whole-profile verdict)
  if (ALWAYS_REFUSED.has(method)) return { kind: 'refuse', why: 'refused', reply: refusal(id, 'method_refused', `${method} ${ALWAYS_REFUSED_WHY[method] || 'acts on the whole shared browser — not through a session url'}`, sid) };
  if (!CENSUS.hasRow(method)) {   // (lane chrome-157: both driving states; r2: one Set lookup a message, the name's SHAPE judged first)
    if (!methodShaped(method)) return { kind: 'refuse', why: 'malformed', reply: refusal(id, 'bad_message', malformedWords(method), sid) };
    return { kind: 'refuse', why: 'unclassified', reply: refusal(id, UNCLASSIFIED_CODE, unclassifiedWords(method, browser), sid) };
  }
  if (paused) { const pv = pausedVerdict(method); if (pv.refuse) return { kind: 'refuse', why: pv.why, reply: refusal(id, INT.INTERRUPTED_CODE, pausedWords(method, pv), sid) }; }
  if (TARGET_METHODS.has(method)) {
    const t = params.targetId == null ? '' : String(params.targetId);
    if (!inScope(scope, t)) return { kind: 'refuse', reply: refusal(id, 'target_out_of_scope', `target ${t || '(none)'} is not one of this lease's tabs`, sid) };
  }
  // identity verify r4 (2026-09-28): a browser-level auto-attach that PAUSES new targets freezes every other conversation's
  // (and the user's) new tab in this shared browser — and this lease is never shown those tabs, so it could not resume them
  if (method === 'Target.setAutoAttach' && !sid && params.autoAttach && params.waitForDebuggerOnStart === true) return { kind: 'refuse', why: 'auto_attach_pause', reply: refusal(id, 'auto_attach_pause_refused', AUTO_ATTACH_PAUSE_WORDS, sid) };
  if (method === 'Target.autoAttachRelated' && params.waitForDebuggerOnStart === true && !inScope(scope, params.targetId == null ? '' : String(params.targetId))) return { kind: 'refuse', reply: refusal(id, 'target_out_of_scope', `target ${params.targetId == null ? '(none)' : String(params.targetId)} is not one of this lease's tabs`, sid) };
  if (method === 'Target.detachFromTarget') {
    const s2 = params.sessionId == null ? '' : String(params.sessionId);
    const t = params.targetId == null ? '' : String(params.targetId);
    if (!(s2 && scope.sessions.has(s2)) && !inScope(scope, t)) return { kind: 'refuse', reply: refusal(id, 'session_out_of_scope', `nothing of this lease's to detach`, sid) };
  }
  if (CONTEXT_METHODS.has(method) || (method === 'Target.createTarget' && params.browserContextId != null)) {
    const c = params.browserContextId == null ? '' : String(params.browserContextId);
    if (!scope.contexts.has(c)) return { kind: 'refuse', reply: refusal(id, 'context_out_of_scope', `browser context ${c || '(none)'} is not one this lease created`, sid) };
  }
  // lane browser-windows (U1, measured on 0.38.1 + Chrome 154): a create names no window — Chrome puts a plain one in its
  // LAST FOCUSED window, often another conversation's, where the new tab takes the show and hides that conversation's
  // page (0 fps, a click 4.6 s). Every tab a lease creates opens in a NEW unfocused window of its own instead (`rewrite`
  // = the params the proxy sends; a window / hidden / tab-type create is left as written). Its pages' own popups stay in
  // its window (Chrome's rule — measured), so the lease's scope IS its windows' tabs.
  if (method === 'Target.createTarget') {
    const ow = WIN.ownWindowParams(params);
    if (ow.rewritten) return { kind: 'forward', pending: { method, params: ow.params, sessionId: sid }, rewrite: ow.params };
  }
  return { kind: 'forward', pending: { method, params, sessionId: sid } };
}

// ── lane browser-shared-profile-freeze (fb-8727ee62fb / fb-0898d92d0a — userW's jarvis-work «freezes for every session at
// once»): THE SCOPE ROAD. MEASURED on agent-browser 0.38.2 + Chrome 154 (scripts/measure-shared-profile-freeze.mjs, the real
// keeper + routes + CLI, four conversations on one profile): the driver attached over CDP discovers EVERY page target of the
// browser (`Target.setDiscoverTargets`), attaches each NEW one and holds its next command until that target answers
// `runIfWaitingForDebugger` + `Page.enable` — 30 s per try, tried twice. One new tab that cannot answer at birth (a page that
// holds its main thread as it loads: B, D, E's own-tab `eval 1+1` 19.8 s each; a confirm() at load: 59.8 s each) froze every
// conversation on the profile at once, while `/json/list`, the tab list and `session info` answered; the mediated road
// (each lease shown only its own targets) answered the same births in 103–117 ms. A profile its conversations share
// cooperatively (`owner`) therefore hands each AGENT lease a scoped url too — THIS judge: every call passes as written (the
// cooperative trust — no census class but the whole-profile law (lane chrome-157), no takeover fence, no new-window rewrite: the keeper's own windows and /resolve's pause
// stay that road's rules); what the connection DISCOVERS is the lease's own (filterEvent / admitReply, the scope above), and
// an explicit attach by id (the keeper's bind, `tab <targetId>`) admits that target.
const SCOPE_MODE = 'scope', MEDIATED_MODE = 'mediated';
/** The scope road's judge (PURE): `{kind:'forward', pending}` for every CDP call, `drop` for what is not one. */
function judgeScope(msg, scope = null) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return { kind: 'drop', why: 'not an object' };
  const method = typeof msg.method === 'string' ? msg.method : '';
  if (msg.id == null) return { kind: 'drop', why: method ? 'no id' : 'no method' };
  if (!method) return { kind: 'refuse', reply: refusal(msg.id, 'bad_message', 'a CDP call names a method', msg.sessionId == null ? null : String(msg.sessionId)) };
  { const wp = wholeProfileVerdict(msg, scope, { road: SCOPE_MODE }); if (wp) return wp; }   // (lane chrome-157, 主开发 2026-11-13: the law reaches the scope road — the ONE verdict; nothing else of the census here)
  return { kind: 'forward', pending: { method, params: msg.params && typeof msg.params === 'object' ? msg.params : {}, sessionId: msg.sessionId == null ? null : String(msg.sessionId) }, explicit: true };
}
/**
 * WHICH ROAD a lease's CDP url takes (PURE) → `{mode: 'mediated'|'scope'|null, why}`:
 *   · a mediated profile (`instance` sharing)                                  ⇒ 'mediated' (its own judge, unchanged)
 *   · no mediating proxy in this process                                       ⇒ null 'no-proxy' (the raw url, as before)
 *   · an ephemeral browser (the conversation's own — nobody else's tabs in it) ⇒ null 'ephemeral'
 *   · a browser on a paired machine / reached remotely                         ⇒ null 'remote' (the proxy serves THIS machine)
 *   · the user's own session (Browse yourself) or no agent key                 ⇒ null 'human' (a person sees every tab)
 *   · else (an agent's lease on a local named profile shared cooperatively)    ⇒ 'scope'
 */
function leaseRoadVerdict({ mediated = false, proxy = false, ephemeral = false, remote = false, agent = false } = {}) {
  if (mediated) return { mode: MEDIATED_MODE, why: 'mediated' };
  if (!proxy) return { mode: null, why: 'no-proxy' };
  if (ephemeral) return { mode: null, why: 'ephemeral' };
  if (remote) return { mode: null, why: 'remote' };
  if (!agent) return { mode: null, why: 'human' };
  return { mode: SCOPE_MODE, why: 'shared' };
}

/**
 * A browser→client REPLY to a forwarded call: grow the scope from what the
 * browser handed back (a target this lease created, a session it was
 * attached, a context it made) and FILTER the answers that list the whole
 * browser. Returns `{reply, emit}` — the reply to send (rewritten in place is
 * fine — the object is the proxy's own parse) and the events to send BEFORE
 * it (the replayed `targetCreated` of a tab this lease just created).
 */
function admitReply(reply, pending, scope, { explicit = false } = {}) {
  if (!reply || typeof reply !== 'object' || !pending) return { reply, emit: [] };
  const r = reply.result && typeof reply.result === 'object' ? reply.result : null;
  const p = pending.params || {};
  const emit = [];
  switch (pending.method) {
    case 'Target.createTarget':
      if (r && r.targetId) {
        admitTarget(scope, r.targetId);
        const seen = scope.recent && scope.recent.get(String(r.targetId));
        if (seen) { scope.recent.delete(String(r.targetId)); emit.push({ method: 'Target.targetCreated', params: { targetInfo: seen } }); }
      }
      break;
    case 'Target.attachToTarget': if (r && r.sessionId && explicit && p.targetId) admitTarget(scope, p.targetId); if (r && r.sessionId && inScope(scope, p.targetId)) scope.sessions.set(String(r.sessionId), String(p.targetId)); break; // the scope road: an attach BY ID is the lease's own act
    case 'Target.attachToBrowserTarget': if (r && r.sessionId) scope.sessions.set(String(r.sessionId), null); break;
    case 'Target.createBrowserContext': if (r && r.browserContextId) scope.contexts.add(String(r.browserContextId)); break;
    case 'Target.detachFromTarget': if (p.sessionId) scope.sessions.delete(String(p.sessionId)); break;
    case 'Target.disposeBrowserContext': if (p.browserContextId) scope.contexts.delete(String(p.browserContextId)); break;
    case 'Target.closeTarget': if (r && r.success !== false && p.targetId) scope.targets.delete(String(p.targetId)); break;
    case 'Target.getTargets': if (r && Array.isArray(r.targetInfos)) { for (const ti of r.targetInfos) if (!inScope(scope, ti && ti.targetId) && admissible(scope, ti)) admitTarget(scope, ti.targetId); r.targetInfos = r.targetInfos.filter((ti) => inScope(scope, ti && ti.targetId)); } break;
    case 'Target.getBrowserContexts': if (r && Array.isArray(r.browserContextIds)) r.browserContextIds = r.browserContextIds.filter((c) => scope.contexts.has(String(c))); break;
    default: break;
  }
  return { reply, emit };
}

/**
 * A browser→client EVENT: forward only what concerns this lease's scope,
 * admitting what is admissible (a tab a scoped page opened; a sub-target
 * auto-attached under a scoped session; a target in a context it created).
 * Returns the event to forward, or null to drop it.
 */
function filterEvent(ev, scope) {
  if (!ev || typeof ev !== 'object' || typeof ev.method !== 'string') return null;
  const p = ev.params && typeof ev.params === 'object' ? ev.params : {};
  const evSid = ev.sessionId == null ? null : String(ev.sessionId);
  switch (ev.method) {
    case 'Target.targetCreated':
    case 'Target.targetInfoChanged': {
      const info = p.targetInfo;
      if (!admissible(scope, info)) { remember(scope, info); return null; }
      admitTarget(scope, info.targetId);
      return ev;
    }
    case 'Target.targetDestroyed':
    case 'Target.targetCrashed': {
      if (!inScope(scope, p.targetId)) return null;
      if (ev.method === 'Target.targetDestroyed') { scope.targets.delete(String(p.targetId)); for (const [s, t] of [...scope.sessions]) if (t === String(p.targetId)) scope.sessions.delete(s); }
      return ev;
    }
    case 'Target.attachedToTarget': {
      const info = p.targetInfo;
      const viaParent = !!(evSid && scope.sessions.has(evSid));
      if (!viaParent && !admissible(scope, info)) return null;
      if (info && info.targetId) admitTarget(scope, info.targetId);
      if (p.sessionId) scope.sessions.set(String(p.sessionId), info && info.targetId ? String(info.targetId) : null);
      return ev;
    }
    case 'Target.detachedFromTarget': {
      if (!p.sessionId || !scope.sessions.has(String(p.sessionId))) return null;
      scope.sessions.delete(String(p.sessionId));
      return ev;
    }
    case 'Target.receivedMessageFromTarget':
      return p.sessionId && scope.sessions.has(String(p.sessionId)) ? ev : null;
    case 'Browser.downloadWillBegin':
    case 'Browser.downloadProgress':
      // lane chrome-157 (the .401 read, W2 — MEASURED on 154 + 157: with the browser form of Browser.setDownloadBehavior +
      // eventsEnabled, the PERSON's download in another tab reached the agent's connection, its url and its file name): a
      // download event reaches a lease ONLY for a download its own tab began while its folder was lent (scope.downloads —
      // admitted by the mediator, src/server/cdp-mediator.js), whatever session it came on; everything else is dropped
      return p.guid != null && scope.downloads && scope.downloads.has(String(p.guid)) ? ev : null;
    case 'Page.frameAttached':
    case 'Page.frameNavigated': {
      // the frames under this lease's own sessions are its own (a download names the frame it began in); no sessionId = a page
      // connection of the lease's own tab (/devtools/page/<its targetId>) — passed as before
      if (evSid && !scope.sessions.has(evSid)) return null;
      const fid = ev.method === 'Page.frameAttached' ? p.frameId : (p.frame && p.frame.id);
      if (fid != null && scope.frames && scope.frames.size < FRAMES_MAX) scope.frames.add(String(fid));
      return ev;
    }
    default:
      // a session-scoped event (Page.*, Runtime.*, Network.* … on a sessionId)
      // reaches the lease only on a session the proxy handed it; a browser-
      // level event with no sessionId is not a target's and passes
      return evSid ? (scope.sessions.has(evSid) ? ev : null) : ev;
  }
}

// ── the env a MEDIATED lease browses with ─────────────────────────────────
/** A mediated attachment's namespace = the profile's + this conversation's:
 *  the session runs ITS OWN agent-browser daemon over its scoped url (two
 *  sessions in one namespace would share one daemon and one url — the second
 *  would ride the first's scope). */
function mediatedNamespace(profileId, browserKey) { return `vs-${String(profileId || '')}-${String(browserKey || '')}`; }
/** The pairs: session name, the per-session namespace, the SCOPED url (never
 *  a profile directory — the state lives in the profile's browser) and an
 *  EXPLICIT idle timeout for this session's own daemon: it may idle out on
 *  its own (the browser lives on under the keeper; the scope lives in the
 *  mediator; the next command reconnects through the same url). */
function mediatedEnvFor({ browserKey, profileId, url, idleMs = 0 } = {}) {
  const bk = String(browserKey || ''), pid = String(profileId || '');
  if (!bk || !pid || !/^ws:\/\/127\.0\.0\.1:\d{1,5}\/m\/[A-Za-z0-9_-]{32}\/devtools\/browser$/.test(String(url || ''))) return [];
  const idle = Math.max(0, Math.floor(Number(idleMs) || 0));
  return [
    `AGENT_BROWSER_SESSION=vs-${bk}`,
    `AGENT_BROWSER_NAMESPACE=${mediatedNamespace(pid, bk)}`,
    `AGENT_BROWSER_CDP=${url}`,
    `AGENT_BROWSER_IDLE_TIMEOUT_MS=${idle}`,
  ];
}
/** The key a grant is looked up by: one per (profile, conversation) — the
 *  same unit as the lease. */
function grantKey(profileId, browserKey) { return `${String(profileId || '')}|${String(browserKey || '')}`; }
/** What a grant looks like to a route / the digest: never the token, never
 *  the raw upstream. */
function grantView(g) {
  if (!g) return null;
  return { profileId: g.profileId, browserKey: g.browserKey, mode: g.mode === SCOPE_MODE ? SCOPE_MODE : MEDIATED_MODE, targets: g.scope ? g.scope.targets.size : 0, sessions: g.scope ? g.scope.sessions.size : 0, contexts: g.scope ? g.scope.contexts.size : 0, connections: g.conns ? g.conns.size : 0, createdAt: g.createdAt || 0, lastUsedAt: g.lastUsedAt || 0, upstreamKnown: !!g.upstream, unclassified: g.unclassified ? [...g.unclassified] : [], unclassifiedMore: Number(g.unclassifiedMore) || 0, malformed: Number(g.malformed) || 0,   /* lane chrome-157 r2: the list is BOUNDED (the mediator keeps ≤ UNCLASSIFIED_KEEP shaped names; `unclassifiedMore` = refused calls of names not listed, `malformed` = calls whose name was no CDP method's shape — counts, never the names) */ // verify r4: the methods this lease was refused for lacking a census row
    // the owner's ruling (2026-09-27): what the LAST takeover interrupted on this lease (counts + method names + the browser's answers to terminateExecution — never a param)
    lastInterrupt: g.lastInterrupt ? { at: g.lastInterrupt.at, aborted: g.lastInterrupt.aborted, methods: [...(g.lastInterrupt.methods || [])], terminated: g.lastInterrupt.terminated, terminateAnswers: [...(g.lastInterrupt.terminateAnswers || [])], landed: Number(g.lastInterrupt.landed) || 0, landedMethods: [...(g.lastInterrupt.landedMethods || [])] } : null }; // verify r6: `landed` = aborted calls the browser still answered with a success (they took effect)
}
/** The one-line sentence a chip / the CLI prints for a mediated profile. THE SENTENCE NAMES THE FENCE'S REAL SCOPE
 *  (2026-09-21, the verifier's finding; re-worded 2026-09-27 for the owner's ruling): everything but reads is refused
 *  while the user drives, and what was running when they took over is interrupted. The retired `fenceScripts`
 *  option is ignored. */
function mediationSentence({ profileLabel = '', others = 0 } = {}) {
  const n = Number(others) || 0;
  return `"${profileLabel}" is shared instance-wide through a mediated CDP url: you see and drive only your own tabs${n ? ` (${n} other session${n === 1 ? '' : 's'} attached, each confined the same way)` : ''}; while the user drives, everything but reads is refused (browser_interrupted) and what you had running there when they took over is interrupted — wait for the handback, then run it again.`;
}

module.exports = {
  TOKEN_RE, isToken, parseMediatedPath, mediatedBrowserUrl, mediatedHttpBase, versionAnswer, listAnswer,
  newScope, inScope, admissible, admitTarget, remember, RECENT_MAX,
  ALWAYS_REFUSED, TARGET_METHODS, CONTEXT_METHODS, PAUSED_METHODS, isPausedMethod, AUTO_ATTACH_PAUSE_WORDS, // identity verify r4: the browser-level pause refusal's words
  CENSUS, pausedVerdict, pausedWords, wholeProfileVerdict, windowStep, isLeaseFrame, WINDOW_BOUND_MS, WINDOW_BUSY_TEXT, WINDOW_CLOSING_TEXT, UNCLASSIFIED_CODE, unclassifiedWords, METHOD_NAME_MAX, methodShaped, malformedWords, browserLabel, // verify r4: the paused fence is a CENSUS over the vendor's own method list (src/cdp-census.js)
  interruptPlan, INTERRUPTED_CODE, // the owner's ruling (2026-09-27): a takeover interrupts what is in flight
  CDP_REFUSAL_CODE, refusal, refusalCodeOf, judge, admitReply, filterEvent,
  SCOPE_MODE, MEDIATED_MODE, judgeScope, leaseRoadVerdict, // lane browser-shared-profile-freeze: the scope road (a cooperative lease shown only its own targets)
  INPUT_CREDIT_MS, isInputMethod, takeCredit, creditReceipt, creditExpectation, creditMatches, creditSessionOk, CREDIT_METHODS, // lane S2: the user's own input passes the paused fence on a credit BOUND to its record's own CDP call AND to the tab the user is looking at (verify r2)
  creditExpiryReceipt, ALWAYS_REFUSED_WHY, // verify r3: honest expiry words (spent / other_tab / not_dispatched); the deaf-page method's words
  mediatedNamespace, mediatedEnvFor, grantKey, grantView, mediationSentence,
};
