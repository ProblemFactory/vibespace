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
 *   · REFUSES `Input.*` and the navigation family (`Page.navigate` /
 *     `reload` / `navigateToHistoryEntry` / `close` / `stopLoading` /
 *     `setDocumentContent` / `handleJavaScriptDialog`, `DOM.setFileInputFiles`
 *     and the target acts that change what the user is looking at) while the
 *     USER holds the input side (P3's `lease.input === 'user'`) — a typed
 *     `browser_paused` CDP error, never a timeout;
 *   · REFUSES the whole-browser acts outright (`Browser.close` / `crash*`,
 *     `Target.exposeDevToolsProtocol`, `Target.setRemoteLocations`, the
 *     deprecated `Target.sendMessageToTarget`) — a shared browser is nobody's
 *     to kill through a session url;
 *   · a message on a CDP `sessionId` the proxy did not hand out is refused.
 * What it is NOT: `Runtime.evaluate` is not refused while paused (an agent
 * reading page state during a takeover is the honest use; the CLI's typed
 * `browser_paused` refusal (P3) already stops the cooperative path before any
 * CDP message exists) — say so rather than promising a DOM-level fence.
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
  return { targets: new Set((targets || []).filter(Boolean).map(String)), sessions: new Map(), contexts: new Set((contexts || []).filter(Boolean).map(String)), recent: new Map() };
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

// ── the method tables ──────────────────────────────────────────────────────
/** Whole-browser acts no session url may perform (a shared browser is not
 *  one lease's to kill), and the two escape hatches out of the mediation. */
const ALWAYS_REFUSED = new Set(['Browser.close', 'Browser.crash', 'Browser.crashGpuProcess', 'Target.exposeDevToolsProtocol', 'Target.setRemoteLocations', 'Target.sendMessageToTarget']);
/** Methods that NAME a target (`params.targetId`) — in scope or refused. */
const TARGET_METHODS = new Set(['Target.attachToTarget', 'Target.activateTarget', 'Target.closeTarget', 'Target.getTargetInfo', 'Browser.getWindowForTarget']);
/** Methods that NAME a browser context — one this lease created or refused. */
const CONTEXT_METHODS = new Set(['Target.disposeBrowserContext']);
/** Refused while the USER holds the input side (§4.3): every `Input.*`, the
 *  navigation family, a file upload, a dialog answer, and the target acts
 *  that change what the user is looking at. */
const PAUSED_PREFIXES = ['Input.'];
const PAUSED_METHODS = new Set(['Page.navigate', 'Page.reload', 'Page.navigateToHistoryEntry', 'Page.close', 'Page.stopLoading', 'Page.setDocumentContent', 'Page.handleJavaScriptDialog', 'DOM.setFileInputFiles', 'Target.createTarget', 'Target.closeTarget', 'Target.activateTarget']);
function isPausedMethod(method) { const m = String(method || ''); return PAUSED_METHODS.has(m) || PAUSED_PREFIXES.some((p) => m.startsWith(p)); }

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
 *   {kind:'forward', pending:{method, params, sessionId}}  — send upstream, remember by id
 *   {kind:'refuse', reply}                                  — answer the client, send nothing
 *   {kind:'drop', why}                                      — not a CDP call (no id): say nothing
 * `paused` is the live input side (true = the user drives).
 */
function judge(msg, scope, { paused = false } = {}) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return { kind: 'drop', why: 'not an object' };
  const id = msg.id;
  const method = typeof msg.method === 'string' ? msg.method : '';
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const sid = msg.sessionId == null ? null : String(msg.sessionId);
  if (!method) return id == null ? { kind: 'drop', why: 'no method' } : { kind: 'refuse', reply: refusal(id, 'bad_message', 'a CDP call names a method', sid) };
  if (id == null) return { kind: 'drop', why: 'no id' };
  if (sid && !scope.sessions.has(sid)) return { kind: 'refuse', reply: refusal(id, 'session_out_of_scope', `CDP session ${sid} was not handed to this lease`, sid) };
  if (ALWAYS_REFUSED.has(method)) return { kind: 'refuse', reply: refusal(id, 'method_refused', `${method} acts on the whole shared browser — not through a session url`, sid) };
  if (paused && isPausedMethod(method)) return { kind: 'refuse', reply: refusal(id, 'browser_paused', `${method} is refused while the user holds this browser's input — wait for the handback (P3)`, sid) };
  if (TARGET_METHODS.has(method)) {
    const t = params.targetId == null ? '' : String(params.targetId);
    if (!inScope(scope, t)) return { kind: 'refuse', reply: refusal(id, 'target_out_of_scope', `target ${t || '(none)'} is not one of this lease's tabs`, sid) };
  }
  if (method === 'Target.detachFromTarget') {
    const s2 = params.sessionId == null ? '' : String(params.sessionId);
    const t = params.targetId == null ? '' : String(params.targetId);
    if (!(s2 && scope.sessions.has(s2)) && !inScope(scope, t)) return { kind: 'refuse', reply: refusal(id, 'session_out_of_scope', `nothing of this lease's to detach`, sid) };
  }
  if (CONTEXT_METHODS.has(method) || (method === 'Target.createTarget' && params.browserContextId != null)) {
    const c = params.browserContextId == null ? '' : String(params.browserContextId);
    if (!scope.contexts.has(c)) return { kind: 'refuse', reply: refusal(id, 'context_out_of_scope', `browser context ${c || '(none)'} is not one this lease created`, sid) };
  }
  return { kind: 'forward', pending: { method, params, sessionId: sid } };
}

/**
 * A browser→client REPLY to a forwarded call: grow the scope from what the
 * browser handed back (a target this lease created, a session it was
 * attached, a context it made) and FILTER the answers that list the whole
 * browser. Returns `{reply, emit}` — the reply to send (rewritten in place is
 * fine — the object is the proxy's own parse) and the events to send BEFORE
 * it (the replayed `targetCreated` of a tab this lease just created).
 */
function admitReply(reply, pending, scope) {
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
    case 'Target.attachToTarget': if (r && r.sessionId && inScope(scope, p.targetId)) scope.sessions.set(String(r.sessionId), String(p.targetId)); break;
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
    default:
      // a session-scoped event (Page.*, Runtime.*, Network.* … on a sessionId)
      // reaches the lease only on a session the proxy handed it; a browser-
      // level event with no sessionId (Browser.downloadProgress …) is not a
      // target's and passes
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
  return { profileId: g.profileId, browserKey: g.browserKey, targets: g.scope ? g.scope.targets.size : 0, sessions: g.scope ? g.scope.sessions.size : 0, contexts: g.scope ? g.scope.contexts.size : 0, connections: g.conns ? g.conns.size : 0, createdAt: g.createdAt || 0, lastUsedAt: g.lastUsedAt || 0, upstreamKnown: !!g.upstream };
}
/** The one-line sentence a chip / the CLI prints for a mediated profile. */
function mediationSentence({ profileLabel = '', others = 0 } = {}) {
  const n = Number(others) || 0;
  // THE SENTENCE NAMES THE FENCE'S REAL SCOPE (2026-09-21, the verifier's finding):
  // Input.* and the page-navigation COMMANDS are refused while the user drives;
  // script evaluation (Runtime.evaluate — `get title`, a snapshot) is NOT, by
  // design (reads stay open, pinned by both mediation suites), and a script can
  // navigate — so the promise is worded to the fence, never past it.
  return `"${profileLabel}" is shared instance-wide through a mediated CDP url: you see and drive only your own tabs${n ? ` (${n} other session${n === 1 ? '' : 's'} attached, each confined the same way)` : ''}; while the user drives, input and page-navigation commands are refused (browser_paused) — script evaluation and reads are not, so do not navigate by script while they drive.`;
}

module.exports = {
  TOKEN_RE, isToken, parseMediatedPath, mediatedBrowserUrl, mediatedHttpBase, versionAnswer, listAnswer,
  newScope, inScope, admissible, admitTarget, remember, RECENT_MAX,
  ALWAYS_REFUSED, TARGET_METHODS, CONTEXT_METHODS, PAUSED_METHODS, PAUSED_PREFIXES, isPausedMethod,
  CDP_REFUSAL_CODE, refusal, refusalCodeOf, judge, admitReply, filterEvent,
  mediatedNamespace, mediatedEnvFor, grantKey, grantView, mediationSentence,
};
