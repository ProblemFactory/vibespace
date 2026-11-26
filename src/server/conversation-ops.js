'use strict';
/**
 * THE CONVERSATION VERBS AS SERVER-SIDE SEAMS (lane automation-verbs, design q-046 §2 「动词实现」 / §4 L2) — ORCH.
 * The owner's directive (2026-10-19 22:1xZ): VibeSpace's own API for what the coordinator does — open a worker
 * conversation, name it, bind it to a Task Group, end it, invite it to a group — so a granted automation key (L1,
 * src/server/automation-engine.js) reaches the SAME code the owner's own window does. Every caller goes through here:
 *   · the owner's ws frames (src/ws-handler.js `create` / `rename-session` / `kill`) — byte-identical behaviour: a ws
 *     caller hands its socket and the very handler / body runs as before;
 *   · the routes — server.js POST /api/tasks/:id/bind, src/agent-routes.js group-admin bind and POST
 *     /api/agent/msg/group `invite`;
 *   · L1's automation engine (the second half of this lane) — no socket: the verdicts below run first.
 *
 *   openConversation(spec, by, {ws, attachedSessions})
 *       with a ws: ws-create's handler, untouched. Without one (an AUTOMATION — the only caller with no window): the spec
 *       is judged (PURE src/conversation-spec.js, closed fields), the spend guard is asked FIRST (reason
 *       `automation-open`, the KEY its identity — design §1 summary 7; a refusal answers `spend_refused` naming the
 *       bucket and nothing spawns), then the same handler runs against a HEADLESS sink socket that is detached from the
 *       new session the moment the handler answers → {ok, sessionId, claudeSessionId, sessionKey, pending, …}
 *   renameConversation(target, name, by)    the rename-session body (renameSession below — the explicit name → customNames)
 *   bindConversation(target, taskId, by, {note, noteSession})   the task store's bind (+ the caller's activity line)
 *   settleBirthGroups()                     lane open-task-binds: every live conversation opened INTO a Task Group (ws-create's
 *                                           `_birthBind` — the New Session window's Task, an automation's --task, a fork's
 *                                           first group) is bound through bindConversation once it has its own id (PURE
 *                                           src/task-membership.js birthBindVerdict); server.js asks it at the session list's
 *                                           ONE notify point (broadcastActiveSessions — every id adoption broadcasts)
 *   endConversation(target, by, {reply})    ws-handler's kill body; `by` → the subject its device teardown audits
 *   inviteToGroup(group, members, by, opts) the agent-groups engine's invite (`by.cid` = the inviter)
 *   conversationStatus(target)              the ids a caller polls after an open (read-only, nothing spends)
 * `by` (src/conversation-spec.js byVerdict): {kind: 'human', actBy} · {kind: 'agent', cid} · {kind: 'automation', key,
 * keyName, subject, cid, sessionKey}; actByOf(by) is what every device act and audit line of the verb names.
 * THE DEPENDENCIES ARE PROVIDED by their owners (`provide`): ws-handler the create handler, the rename / end bodies,
 * activeSessions and getSessionKey; server.js the task store and the spend guard; agent-routes the groups engine. This
 * module requires none of them — no require cycle, and a gate's minimal ctx constructs nothing here. The verbs are built
 * over a deps getter (`opsOver`): the module's own exports read the PROVIDED parts (the routes, the automation engine);
 * ws-handler binds its OWN instance (`forDeps`) so a second in-process server's sockets never reach another's handler.
 * L1 (lane automation-keys-core) brought RENAME here first: `renameSession(deps, data)` is the ws `rename-session` case's
 * body, moved WHOLE (its text pins — test-discovery-facts, test-harness-contract, test-msg-cli-groups — read it here), the
 * ws handler hands it over bound to its ctx as `rename`, `callOp(op, …)` calls a provided op, and `automationVerbs()` are
 * the engine's wired verbs (src/server/automation-engine.js `verbs`).
 * Gates: scripts/test-conversation-ops.mjs (the seams over fake deps, the headless sink, the gate's order, the wiring
 * pins), scripts/test-spend-paths.mjs (the `headless-open` primitive must sit under the authorizer — a MUTANT without it
 * is UNWIRED), the ws suites unchanged (test-ws-contract, test-session-schema, test-agentd-session, test-restore-liveness).
 */
const { agentSpendWords } = require('../spend-words.js');   // B-ef83 unit 2 (r4696): THE ONE DOOR for a verdict's words to a key holder
const crypto = require('crypto');
const { capsOf } = require('../backend-caps');
const SPEC = require('../conversation-spec.js');
const { birthBindVerdict } = require('../task-membership.js'); // PURE (lane open-task-binds): a birth group is a membership

const OPEN_REASON = 'automation-open';
const OPEN_TIMEOUT_MS = 90 * 1000;       // the coordinator's old road waited 90 s for `created` (mkworker.mjs)

let shared = {};
/** An owner module hands over the parts it owns (merged; a later call replaces a key); `provide(null)` takes every part back
 *  (a gate's reset — L1's `not_ready` leg). */
function provide(part) { if (part === null) shared = {}; else if (part && typeof part === 'object') shared = { ...shared, ...part }; return shared; }
/** Call a provided op (`rename`). → its answer | {ok: false, code: 'not_ready'} before the ws handler registered. */
function callOp(op, ...args) {
  const fn = shared[op];
  return typeof fn === 'function' ? fn(...args) : { ok: false, code: 'not_ready', why: 'the server is still starting — try again in a moment' };
}
const refusal = (code, why, extra = {}) => ({ ok: false, code, why, ...extra });
/** The group's activity line of an automation's bind — conversations.bind's and an --task open's (lane open-task-binds) ONE spelling. */
const boundNote = (session, by) => `[automation] session ${session} bound by ${by.name} (key ${by.key})`;

/** RENAME — the ws `rename-session` case's body, unchanged (it moved here so the automation door renames through it too). */
function renameSession(deps, data) {
  const { activeSessions, setCustomName, writeSessionMeta, readSessionMeta, broadcastActiveSessions, getSessionKey } = deps;
  const trimmedName = typeof data.name === 'string' ? data.name.trim() : '';
  let targetId = data.webuiId && activeSessions.has(data.webuiId) ? data.webuiId : null;
  if (!targetId) {
    for (const [sessionId, session] of activeSessions) {
      if (data.sessionKey && getSessionKey(session) === data.sessionKey) {
        targetId = sessionId;
        break;
      }
      if (data.backendSessionId && (session.backendSessionId || session.claudeSessionId) === data.backendSessionId) {
        targetId = sessionId;
        break;
      }
    }
  }
  if (!targetId) return { ok: false, code: 'not_found' };

  const session = activeSessions.get(targetId);
  if (!session) return { ok: false, code: 'not_found' };

  if (trimmedName) session.name = trimmedName;
  // lane peer-card-sender (③): an outside rename (an agent, a script) lands where the sidebar's own rename does —
  // user-state `customNames[<backend>:<id>]`, broadcast to every client — and the name is explicit (②)
  if (trimmedName) { session._nameExplicit = true; const key = getSessionKey(session); if (key && typeof setCustomName === 'function') { try { setCustomName(key, trimmedName); } catch (e) { console.warn('[rename] custom name not stored:', e && e.message); } } }
  // Write the new name back into the AGENT's own store when the
  // harness has somewhere to write it (caps.renameWriteback — codex's
  // thread name; claude's JSONL has no title field). Never a backend id.
  if (capsOf(session.backend).renameWriteback && session.mode === 'chat' && session.pty && trimmedName) {
    session.pty.write(JSON.stringify({ type: 'set-thread-name', name: trimmedName }) + '\n');
  }
  if (session.sockName) {
    writeSessionMeta(session.sockName, {
      ...(readSessionMeta(session.sockName) || {}), // preserve keys not re-listed (agentToken/taskId/accountId)
      name: session.name,
      nameExplicit: session._nameExplicit || undefined,
      cwd: session.cwd,
      backend: session.backend,
      backendSessionId: session.backendSessionId,
      claudeSessionId: session.claudeSessionId || null,
      sourceKind: session.sourceKind || null,
      agentKind: session.agentKind || 'primary',
      agentRole: session.agentRole || '',
      agentNickname: session.agentNickname || '',
      parentThreadId: session.parentThreadId || null,
      permissionMode: session._permissionMode || null,
      effort: session._effort || null,
      createdAt: session.createdAt,
      webuiSessionId: targetId,
      mode: session.mode || 'terminal',
    }, { durable: true, whole: true });   // r3141: a whole record from the live conversation (restates a torn one)
  }
  broadcastActiveSessions();
  return { ok: true, targetId, name: session.name };
}


/** The harness registry + its spawn rows, as the open spec's tables (src/conversation-spec.js openSpecVerdict). */
function specTables() {
  let ids = [], chat = null, HS = null;
  try { const H = require('../harnesses'); ids = H.ids(); chat = typeof H.chatHarnessIds === 'function' ? H.chatHarnessIds() : null; } catch { ids = []; }
  try { HS = require('../harness-settings'); } catch { HS = null; }
  const byBackend = {};
  for (const id of ids) {
    const table = HS && HS.HARNESS_SETTINGS ? HS.HARNESS_SETTINGS[id] : null;
    const rows = table && HS ? HS.rowsOfKind(table, 'spawn') : [];
    const via = (v) => rows.find((r) => r && r.apply && r.apply.via === v) || null;
    const vals = (r) => (r && Array.isArray(r.options) ? r.options.map((o) => o && o.value).filter((x) => typeof x === 'string' && x) : []);
    const m = via('model'), e = via('effort'), p = via('permissionMode');
    byBackend[id] = { models: vals(m), modelFree: !m || !!m.combobox, efforts: vals(e), effortFree: !!(e && e.combobox), permissionModes: vals(p) };
  }
  return { backends: ids, chatBackends: Array.isArray(chat) ? chat : null, byBackend };
}

/** LANE AUTOMATION-OPEN-LIMITS (the q-048 verify's M2) — what an open that names NONE would use, so a key's limits judge
 *  the EFFECTIVE open (src/server/automation-engine.js `openFacts.defaults`): the default account THIS backend bills (the
 *  store's `creds.defaultIdField`, as src/ws-create.js resolves an open with no account) and the instance's default model
 *  (`<prefix>.defaultModel` — the new-session rung of ws-create's ladder). null = none (the CLI's own login / model). */
function openDefaults(backend, { accounts = null, harnessSetting = null, harnessDeclares = null } = {}) {
  let h = null;
  try { h = require('../harnesses').harnessOf(backend); } catch { h = null; }
  const field = h && h.creds ? h.creds.defaultIdField : null;
  const st = accounts && accounts._state ? accounts._state : {};
  let model = null;
  try { model = typeof harnessDeclares === 'function' && harnessDeclares(backend, 'defaultModel') ? String(harnessSetting(backend, 'defaultModel') ?? '') || null : null; } catch { model = null; }
  return { accountId: (field && typeof st[field] === 'string' && st[field]) || null, model };
}
/** The Vault window's limit pickers (lane automation-open-limits): every registered harness's permission modes and models
 *  from its spawn rows (`default` = the row's empty option: the harness's own — the open names none), and the accounts
 *  (ids + names + backend + type — accounts.list() is the sanitized roster, never key material). */
function limitChoices({ accounts = null } = {}) {
  let ids = [], HS = null;
  try { ids = require('../harnesses').ids(); } catch { ids = []; }
  try { HS = require('../harness-settings'); } catch { HS = null; }
  let joinWords = (tbl) => tbl;   // B-82b8: the option labels are a person's words — joined from the words module (the hub's; never the device's)
  try { joinWords = require('../harness-settings-words').withWords; } catch (e) { console.warn(`[settings] the settings words module could not be loaded — the limit choices show their values: ${e && e.message}`); }
  const permissionModes = [], models = [];
  for (const id of ids) {
    const table = HS && HS.HARNESS_SETTINGS ? joinWords(HS.HARNESS_SETTINGS[id]) : null;
    const rows = table && HS ? HS.rowsOfKind(table, 'spawn') : [];
    const via = (v) => rows.find((r) => r && r.apply && r.apply.via === v) || null;
    for (const [row, out] of [[via('permissionMode'), permissionModes], [via('model'), models]]) {
      for (const o of (row && Array.isArray(row.options) ? row.options : [])) if (o && typeof o.value === 'string') out.push({ backend: id, value: o.value || 'default', label: String(o.label || o.value || 'default') });
    }
  }
  let list = [];
  try { const l = accounts && typeof accounts.list === 'function' ? accounts.list() : null; list = ((l && l.accounts) || []).map((a) => ({ id: a.id, name: a.name || a.id, backend: a.backend || 'claude', type: a.type || null })); } catch { list = []; }
  // 主开发 r3132 (d): the accounts list UNREAD — the roster says so (the list's words), never an empty list read as «no accounts»
  const accountsHeld = (() => { try { const h = accounts && typeof accounts.held === 'function' ? accounts.held() : null; return h ? { code: h.code || 'unread', at: Number(h.at) || null } : null; } catch { return { code: 'held-unknown', at: null }; } })();
  return { accounts: list, permissionModes, models, ...(accountsHeld ? { accountsHeld } : {}) };
}

/** The five verbs (+ the status read) over a deps getter — `D()` below is that getter's answer at each call. */
function opsOver(getDeps) {
  const D = () => getDeps() || {};

  /** The live session a target names (null = none live). */
  function liveOf(target) {
    const act = D().activeSessions;
    if (!act || !target) return null;
    if (target.webuiId) { const s = act.get(target.webuiId); return s ? { id: target.webuiId, session: s } : null; }
    if (target.sessionKey && typeof D().getSessionKey === 'function') {
      for (const [id, s] of act) { try { if (D().getSessionKey(s) === target.sessionKey) return { id, session: s }; } catch { } }
    }
    return null;
  }
  /** What a caller polls for after an open: the webui id, the conversation's own id once its CLI reported it. */
  function conversationStatus(target) {
    const t = SPEC.targetVerdict(target);
    if (!t.ok) return t;
    const hit = liveOf(t.target);
    if (!hit) return refusal('not_found', 'no live conversation by that id');
    const s = hit.session;
    let key = null;
    try { key = typeof D().getSessionKey === 'function' ? D().getSessionKey(s) || null : null; } catch { key = null; }
    const conv = s.claudeSessionId || s.backendSessionId || null;
    return { ok: true, sessionId: hit.id, name: s.name || null, cwd: s.cwd || null, mode: s.mode || null, backend: s.backend || 'claude', claudeSessionId: s.claudeSessionId || null, backendSessionId: s.backendSessionId || null, sessionKey: conv ? key : null, pending: !conv };
  }

  /** THE HEADLESS CREATE: ws-create's handler against a sink socket. The FIRST `created` / `error` frame is the answer (the
   *  handler's very first refusal carries no reqId); the sink leaves the new session's clients the moment it answers, so
   *  nothing the session prints is ever queued for it. Defined as an arrow (`= async (`) so the spend census counts its
   *  ONE call site (below, under the authorizer), never its definition. */
  const createHeadless = async (spec, by, birthBy = null) => {
    const reqId = 'auto-' + crypto.randomBytes(6).toString('hex');
    let answer = null, settle = null;
    const answered = new Promise((res) => { settle = res; });
    const sink = {
      readyState: D().WS_OPEN === undefined ? 1 : D().WS_OPEN,
      _actBy: SPEC.actByOf(by), _headless: true,
      send(frame) {
        if (answer) return;
        let m = null;
        try { m = JSON.parse(String(frame)); } catch { return; }
        if (!m || (m.type !== 'created' && m.type !== 'error') || (m.reqId && m.reqId !== reqId)) return;
        answer = m;
        if (m.type === 'created' && m.sessionId) {   // detach NOW: the creator socket is the session's first client
          const s = D().activeSessions && D().activeSessions.get(m.sessionId);
          try { if (s && s.clients && typeof s.clients.delete === 'function') s.clients.delete(sink); } catch { }
          if (s && s._birthBind && birthBy) s._birthBind.by = birthBy;   // lane open-task-binds: who bound it, for the group's activity line
        }
        settle(m);
      },
      on() { }, once() { }, off() { }, removeListener() { }, close() { }, terminate() { }, ping() { },
    };
    const frame = { type: 'create', ...SPEC.wireOf(spec), cols: 120, rows: 30, reqId };
    let timer = null;
    const ran = Promise.resolve()
      .then(() => D().handleCreate(sink, frame, new Set()))
      .then(() => answer || { type: 'error', code: 'no_answer', message: 'the create path ended without an answer' },
        (e) => answer || { type: 'error', code: 'create_threw', message: e && e.message ? e.message : String(e) });
    const late = new Promise((res) => { timer = setTimeout(() => res(answer || { type: 'error', code: 'open_timeout', message: `no answer from the create path in ${OPEN_TIMEOUT_MS / 1000} s` }), OPEN_TIMEOUT_MS); });
    const m = await Promise.race([answered, ran, late]);
    clearTimeout(timer);
    if (m.type !== 'created') return refusal(m.code || 'create_failed', String(m.message || 'the conversation could not be opened'));
    const st = conversationStatus({ webuiId: m.sessionId });
    return { ok: true, sessionId: m.sessionId, name: m.name || null, cwd: m.cwd || null, mode: m.mode || null, billing: m.billing || null, claudeSessionId: st.ok ? st.claudeSessionId : null, sessionKey: st.ok ? st.sessionKey : null, pending: st.ok ? st.pending : true };
  };

  /** OPEN A CONVERSATION. A ws caller: its own create, byte-identical. No ws: only an automation (a person opens from a
   *  window), its spec judged, the spend guard asked before anything spawns. */
  async function openConversation(spec, by, { ws = null, attachedSessions = null, birthBy = null } = {}) {
    if (ws) return D().handleCreate(ws, spec, attachedSessions);
    const b = SPEC.byVerdict(by);
    if (!b.ok) return b;
    if (b.by.kind !== 'automation') return refusal('needs_a_window', 'a person or an agent opens a conversation from a window (the New session dialog); this door is an automation key\'s');
    const v = SPEC.openSpecVerdict(spec, typeof D().specTables === 'function' ? D().specTables() : specTables()); // a provider may hand its own tables (the gate's fakes)
    if (!v.ok) return v;
    if (typeof D().handleCreate !== 'function') return refusal('not_ready', 'the server has not wired its create path yet');
    const identity = SPEC.spendIdentityOf(b.by);
    const spendGuard = D().spendGuard;
    if (!spendGuard || typeof spendGuard.authorize !== 'function') return refusal('spend_refused', 'the spend guard is not wired — an automation spends nothing unguarded', { bucket: 'no-guard' });
    // A CONVERSATION NOBODY TYPED INTO (CLAUDE.md "A turn nobody typed"): the gate decides BEFORE the spawn
    const g = spendGuard.authorize({ reason: 'automation-open', identity, sessionName: v.spec.name || null });
    if (!g || !g.ok) return refusal('spend_refused', agentSpendWords(g) || 'the spend guard refused', { bucket: (g && g.why) || 'unknown', retryAfter: (g && g.retryAfter) || 0 });
    let r;
    try { r = await createHeadless(v.spec, b.by, birthBy); }
    catch (e) { try { spendGuard.release({ hold: g.hold }); } catch { } throw e; }
    try {
      if (r.ok) spendGuard.note({ reason: OPEN_REASON, identity, hold: g.hold });
      else spendGuard.release({ hold: g.hold });
    } catch { }
    if (r.ok) console.log(`[automation] opened ${r.sessionId} "${v.spec.name || ''}" ${v.spec.mode}/${v.spec.backend} for ${b.by.subject} (key ${b.by.key})`);
    return r;
  }

  /** RENAME. The ws case hands its frame (byte-identical: the body reads webuiId / sessionKey / backendSessionId / name);
   *  an automation's target and name are judged first and a target that is not live is named. */
  function renameConversation(target, name, by) {
    if (typeof D().rename !== 'function') return refusal('not_ready', 'the rename path is not wired yet');
    if (by && by.kind === 'automation') {
      const t = SPEC.targetVerdict(target); if (!t.ok) return t;
      const n = SPEC.nameVerdict(name); if (!n.ok) return n;
      if (!liveOf(t.target)) return refusal('not_found', 'no live conversation by that id');
      const r = D().rename({ ...t.target, name: n.name });
      return r && r.ok ? { ok: true, sessionId: r.targetId, name: r.name } : refusal('not_found', 'no live conversation by that id');
    }
    const r = D().rename(target && target.name === name ? target : { ...(target || {}), name });
    return r && r.ok ? { ok: true, sessionId: r.targetId, name: r.name } : refusal('not_found', 'no live conversation by that id');
  }

  /** The key a bind writes: a sessionKey as given (the owner's route passes the request's own, even an empty one — the
   *  store's refusal is the answer), a webui id resolved to its live conversation's key. */
  function bindKeyOf(target) {
    if (target && Object.prototype.hasOwnProperty.call(target, 'sessionKey')) return target.sessionKey;
    const hit = target && target.webuiId ? liveOf({ webuiId: target.webuiId }) : null;
    if (!hit) { const e = new Error('session not found'); e.code = 'not_found'; throw e; }
    let k = null;
    try { k = D().getSessionKey(hit.session) || null; } catch { k = null; }
    if (!k || !(hit.session.claudeSessionId || hit.session.backendSessionId)) { const e = new Error('the conversation has not reported its id yet — poll its status, then bind'); e.code = 'pending'; throw e; }
    return k;
  }
  /** BIND TO A TASK GROUP — the task store's own bind, which throws its own refusals ('task not found', a bad key): the
   *  routes keep their mapping. `note` = the caller's activity line (the manager agent's, an automation's). */
  function bindConversation(target, taskId, by, { note = null, noteSession = null } = {}) {
    const tasks = D().tasks;
    if (!tasks || typeof tasks.bind !== 'function') { const e = new Error('the task store is not wired yet'); e.code = 'not_ready'; throw e; }
    const key = bindKeyOf(target);
    const task = tasks.bind(taskId, key);
    if (note) { try { tasks.addProgress(taskId, { note, session: noteSession }); } catch { } }
    return task;
  }

  /** THE BIRTH GROUP IS A MEMBERSHIP (lane open-task-binds — the owner 2026-10-23: the lanes an automation opened with --task
   *  were in no group's panel, while the agent's own groupsForSession counted the group: two truths). Every live conversation
   *  carrying `_birthBind` is bound through bindConversation the moment it has its OWN id (a fork waits past its source's), then
   *  the mark goes — bound or refused (a deleted group), never asked twice. An automation's open names who bound it (the same
   *  activity line conversations.bind writes); a window's open writes none (the owner's own bind route writes none). → the
   *  number bound. */
  function settleBirthGroups() {
    // THE session list's other listeners ride this call (server.js broadcastActiveSessions — its ONE notify point): the proposal
    // card's sweep (lane login-request-card, provide({ onSessionList }) from mounts-plugins-wiring — no line of its own in server.js)
    try { if (typeof D().onSessionList === 'function') D().onSessionList(); } catch { }
    const active = D().activeSessions;
    if (!active || typeof active.entries !== 'function' || !D().tasks) return 0;
    if (D().tasks.unreadState?.()) return 0;   // THE STORE HELD UNREAD (lane bl-windows): the birth binds WAIT (kept on the sessions) for the lift — never consumed and lost
    let n = 0;
    for (const [id, s] of active.entries()) {
      const v = birthBindVerdict(s);
      if (!v.bind) continue;
      const by = s._birthBind.by;
      s._birthBind = null;
      for (const groupId of v.groupIds) {   // int346: every group the create named (new-session-form's taskIds), the same writer each
        try {
          bindConversation({ webuiId: id }, groupId, by ? { kind: 'automation', key: by.key } : { kind: 'human', actBy: null },
            by ? { note: boundNote(s.backendSessionId || s.claudeSessionId, by), noteSession: by.session || null } : {});
          n++;
        } catch (e) { console.warn(`[tasks] ${id}: its group ${groupId} was not bound — ${e.message}`); }
      }
    }
    return n;
  }

  /** END. The ws case hands its frame and its reply (`killed`); without a reply the answer is returned. */
  // lane end-obeys-verdict (majordomo piece 3) — TERMINATE SAYS WHO: the session's facts are taken BEFORE the kill (the kill
  // body deletes its meta) and its kept record is written AFTER it, once the session has left the live map (boot-restore
  // keepEnded) — around the kill body, never inside it. A person's Terminate: kind person; an agent's admitted end: kind agent, its
  // KEY's id and name (the one end record's contract, 主开发 14:51Z). The facts a resume needs come from ONE bounded read of the
  // wrapper's sidecar before the kill (boot-restore endFactsBefore, at most a second — a Terminate never waits longer).
  const keptMetaOf = (s, id) => ({ webuiSessionId: id, backend: s.backend || 'claude', backendSessionId: s.backendSessionId || s.claudeSessionId || null,
    claudeSessionId: s.claudeSessionId || null, name: s.name || '', cwd: s.cwd || '', mode: s.mode || 'terminal', accountId: s._accountId || null,
    createdAt: s.createdAt || null, host: s.host || null, ...(s._nameExplicit === true ? { nameExplicit: true } : {}) });   // THE NAME LADDER: the record says whether its name was GIVEN (a creation's / a rename's) — a default never outranks a discovered first message
  const endedByOf = (by) => {
    if (!(by && by.kind === 'automation')) return { kind: 'person', actorId: null, name: null, ...(by && by.proposedBy && by.proposedBy.key ? { proposedBy: { key: String(by.proposedBy.key).slice(0, 200), name: by.proposedBy.name ? String(by.proposedBy.name).slice(0, 120) : null } } : {}) };   // a person's sign-in handle is never stored as the actor's id (must 5); lane login-request-card (the cure's law 12): the proposal card's press names its proposer beside the person
    let name = null; try { name = typeof D().keyNameOf === 'function' ? D().keyNameOf(by.key) || null : null; } catch { name = null; }
    return { kind: 'agent', actorId: by.key || null, name, ...(by.forced === true ? { forced: true } : {}) };   // forced: «ended mid-task by …»
  };
  async function keepEndedAfter(before, by) {
    if (!before || typeof D().keepEnded !== 'function') return null;
    const live = D().activeSessions;
    if (live && typeof live.has === 'function' && live.has(before.id)) return null;   // the kill did not take it: nothing ended
    try { return await D().keepEnded(before.sock, before.meta, endedByOf(by), before.facts || null); } catch { return null; }
  }
  const beforeOf = async (id) => {
    const live = D().activeSessions; const s = live && typeof live.get === 'function' ? live.get(id) : null;
    if (!s || !s.sockName) return null;
    let facts = null; try { facts = typeof D().endFactsBefore === 'function' ? await D().endFactsBefore(s, id) : null; } catch { facts = null; }
    return { id, sock: s.sockName, meta: keptMetaOf(s, id), facts };
  };
  // B-c134 cure: `endTree` — the end also ends what the conversation left running in the background (a person's Terminate, an
  // archive); an automation key's own kill frame never asks it (the verb decides: the archive verb does, the end verb does not)
  async function endConversation(target, by, { reply = null, endTree = false } = {}) {
    if (typeof D().endSession !== 'function') return refusal('not_ready', 'the end path is not wired yet');
    if (by && by.kind === 'automation') {
      const t = SPEC.targetVerdict(target); if (!t.ok) return t;
      const hit = liveOf(t.target);
      if (!hit) return refusal('not_found', 'no live conversation by that id');
      const before = await beforeOf(hit.id);
      const answers = [];
      await D().endSession({ sessionId: hit.id }, { reply: (m) => answers.push(m), actBy: SPEC.actByOf(by), endTree: endTree === true });
      const a = answers[answers.length - 1] || null;
      if (a && a.ok) await keepEndedAfter(before, by);
      return a && a.ok ? { ok: true, sessionId: hit.id } : refusal('not_found', 'no live conversation by that id');
    }
    // the session the kill body will end: the id as sent, else (a stale page id) the live session that ADDRESSES the conversation
    const live = D().activeSessions;
    let eid = target && target.sessionId && live && typeof live.has === 'function' && live.has(String(target.sessionId)) ? String(target.sessionId) : null;
    if (!eid && target && target.backendSessionId && live && typeof live.entries === 'function') for (const [k, es] of live.entries()) if (require('../claude-lock-capture.js').addressableId(es) === target.backendSessionId) { eid = k; break; }
    const before = eid ? await beforeOf(eid) : null;
    const r = await D().endSession(target, { reply: reply || (() => { }), actBy: SPEC.actByOf(by), endTree: endTree === true });
    await keepEndedAfter(before, by);
    return r;
  }

  /** INVITE INTO AN AGENT GROUP — the groups engine's invite, the inviter `by.cid` (a member of the group, as for its own
   *  `vibespace-msg group invite`). The route hands its own engine and options (byte-identical). */
  async function inviteToGroup(group, members, by, { ge = null, context = '', quiet = false, mayWake = null, consent = null } = {}) {
    const eng = ge || (typeof D().groupsEngine === 'function' ? D().groupsEngine() : null);
    if (!eng || typeof eng.invite !== 'function') return refusal('groups_off', 'agent groups are not available on this instance');
    if (by && by.kind === 'automation') {
      const g = SPEC.groupVerdict(group); if (!g.ok) return g;
      const m = SPEC.membersVerdict(members); if (!m.ok) return m;
      if (!by.cid) return refusal('bad_by', 'an invite is made by a conversation of the group — this key\'s subject has none');
      return eng.invite({ by: by.cid, group: g.group, members: m.members, context, quiet, mayWake, consent });
    }
    return eng.invite({ by: by && by.cid, group, members, context, quiet, mayWake, consent });
  }

  /** THE STORE HELD UNREAD (lane bl-windows): the task store's refusal words while it is held (else null) — the verbs ask it first */
  const tasksUnread = (act) => { const t = D().tasks; return t && typeof t.unreadRefusal === 'function' ? t.unreadRefusal(act) : null; };
  /** the deferred-save census (lane lg-store-writes): a bind's store AS IT IS NOW on disk — the task store's own bounded wait; a store
   *  without one (a suite's stand-in) answers true. → Promise<boolean> */
  function bindLanded() { const tasks = D().tasks; return tasks && typeof tasks.persisted === 'function' ? Promise.resolve(tasks.persisted()).then((v) => v !== false, () => false) : Promise.resolve(true); }
  /** B-2083 unit A: THE POOL PIN — the person's pin road as its owner hands it over (src/server/account-usage-routes.js `pin`: the ONE
   *  writer, engine.setConversationPin, then the session list's broadcast — the route's own two calls); `guard(memberId)` is asked
   *  for a member of the conversation's own pool before anything is written. Not handed over yet ⇒ not_ready by name. */
  function pinConversation(webuiId, memberId, { by, guard = null } = {}) {
    const fn = D().pin;
    return typeof fn === 'function' ? fn(webuiId, memberId, { by, guard }) : refusal('not_ready', 'the pool engine has not handed over its pin writer yet — try again in a moment');
  }
  /** conversations.pin's money fact: THE spend guard's ONE reader of a member's paid usage (overageFor) — null when none is wired. */
  function memberOverage(memberId) {
    const g = D().spendGuard;
    try { return g && typeof g.overageFor === 'function' ? g.overageFor(memberId) : null; } catch { return null; }
  }
  return { conversationStatus, openConversation, renameConversation, bindConversation, bindLanded, settleBirthGroups, endConversation, inviteToGroup, tasksUnread, pinConversation, memberOverage };
}
const sharedOps = opsOver(() => shared);
/** ws-handler's own instance: its parts first, the provided ones (the task store, the spend guard…) behind them. */
function forDeps(own) { return opsOver(() => ({ ...shared, ...(own || {}) })); }

/**
 * THE WIRED AUTOMATION VERBS (src/server/automation-engine.js `verbs`). Each resolves its TARGET conversation and asks the
 * engine's `reach` — ONE PURE rule (src/automation-keys.js reachVerdict, lane conversations-archive-verb): the key OPENED
 * it, or it is the caller itself, or the grant's reach names it (B-3190: a grant naming it is no reach) — before it
 * acts. `groupsOf(session, id)` = the Task Group ids a live session belongs to. L1 wired conversations.rename; lane
 * automation-verbs (L2) wires the rest through THE seams above, the caller named as `by` = {kind: 'automation', key,
 * subject: session:<caller>, cid, sessionKey}:
 *   conversations.open    the judged spec → openConversation (the spend guard first, charged to the key), then the ids:
 *                         it waits up to OPEN_ID_WAIT_MS for the conversation's own id, else answers `pending`
 *   conversations.status  the ids of a conversation the key reaches (`pending` until its CLI reported one)
 *   conversations.bind    bindConversation into a Task Group the CALLER belongs to
 *   conversations.end     endConversation (its device teardown names the calling conversation)
 *   groups.invite         inviteToGroup — the caller invites, quietly (no wake: a wake is a billed turn of its own)
 *   conversations.archive (lane conversations-archive-verb — the owner 2026-10-20 「这些不用 archive 吗」): ends the target if it
 *                         is still live, then archives it exactly as the sidebar's 归档 does (`archive(sessionKey)` = the
 *                         persistence router's ONE archived-list write, broadcast to every client); a target whose turn is
 *                         running ⇒ subject_busy unless `force`; a target with OPEN For-you asks (`asksOf`) ⇒ asks_open naming
 *                         them unless `resolveAsks` dismisses them first (the memory law: never archive a worker with open
 *                         asks); already in the archived list and nothing live to end ⇒ already_archived. A target that is
 *                         not live is resolved by `deadOf(target)` (its session key, name and Task Groups from the stores).
 * The opener's reach is the ENGINE's fact (the store's `opened` rows — persisted, so it survives a hub restart; the Map this
 * module kept in memory lost it at .331: the owner's hub refused `end` on workers its key had opened).
 */
/** lane conversation-facts (主开发's must 5): ANOTHER conversation's agent-written words toward the calling agent pass the ONE
 *  belt (src/peer-text.js) at this door — its name, its folder, its background tasks' descriptions; the caller's own row is its
 *  own words. The person's panel (piece 5) reads the builder whole, unbelted. */
function beltRow(r) {
  const PT = require('../peer-text.js');
  const piece = (v, max) => (v == null || v === '' ? v : PT.toAgentText(String(v), { kind: 'line', max }));
  return { ...r, name: piece(r.name, 200), cwd: piece(r.cwd, 400),
    ...(Array.isArray(r.background) ? { background: r.background.map((t) => ({ ...t, description: piece(t && t.description, 200) })) } : {}) };
}
const OPEN_ID_WAIT_MS = 20 * 1000;     // a claude CLI reports its conversation id within seconds of the spawn
/** B-2083 unit A (主开发 r5180): how long a key's pin holds, said in conversations.pin's own reply (and the kb's API page). */
const PIN_HOLDS = 'while the conversation lives and across a hub restart; a person\'s resume after it ends follows the pin saved by that person\'s own page';
const BUSY_TURNS = ['running', 'waiting'];   // turn-facts' non-idle states: mid-turn, or paused on the user (requires_action)
function automationVerbs({ activeSessions, groupsOf = () => [], lineageOf = null, ops = null, waitMs = OPEN_ID_WAIT_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  archive = null, nameLanded = null, asksOf = () => [], resolveAsks = () => ({ changed: [], unknown: [] }), turnOf = () => 'idle', deadOf = () => null, listFacts = null,
  // the manager design's piece 4 (conversations.resume): the hub's one line of resumes nobody pressed (src/server/resume-line.js), an
  // ended conversation's kept facts ({goal, timerMark, mode, cwd, hostId}), the archived list, its harness's row (src/resume-line.js
  // harnessRowOf: {resumeContinues, headless}), and the desktop of the row that shows it (or null — the hub never picks one)
  resumeLine = null, resumeFactsOf = () => null, isArchived = () => false, resumeRowOf = () => ({ resumeContinues: 'unread', headless: false }), rowDesktopOf = () => null, proposals = null, browsers = null } = {}) {
  const O = () => ops || sharedOps;
  const idOf = (s) => (s && (s.backendSessionId || s.claudeSessionId)) || null;
  const keyOf = (s) => { const cid = idOf(s); return cid ? `${(s && s.backend) || 'claude'}:${cid}` : null; };
  /** A target as the caller names it: a conversation id, a session key (`<backend>:<id>`) or a webui id. */
  function findSession(target) {
    const t = String(target || '');
    if (!t) return null;
    if (activeSessions.has(t)) return [activeSessions.get(t), t];
    for (const [id, s] of activeSessions) { const cid = idOf(s); if (cid && (cid === t || `${s.backend || 'claude'}:${cid}` === t)) return [s, id]; }
    return null;
  }
  const byOf = (caller, keyId) => ({ kind: 'automation', key: keyId, subject: `session:${caller.conversationId}`, cid: caller.conversationId, sessionKey: caller.sessionKey || `claude:${caller.conversationId}`, name: caller.name || null });
  // ONE GATE for every verb that ends a LIVE conversation — conversations.end and conversations.archive (lane end-obeys-verdict,
  // majordomo piece 3; 主开发's must 1): force only for a conversation the key OPENED, or the caller itself (a conversation is its own);
  // then a conversation the hub cannot judge is a person's to end; then THE verdict over the list builder's own row. The two
  // refusals a key's OWN conversation can get teach the force word (must 2); no other reach is ever told of it. → null (it may end)
  // or the refusal.
  const ENDED_DOOR = 'A person can terminate it from its card in the sidebar (Terminate in its menu).';
  // + the propose door, only for a key that holds conversations.propose (lane login-request-card piece 3b, the cure's law 9 — the same
  // words as conversation-facts refusalOf; a scratch copy of this file carries no sibling, so they are spelled here too)
  const doorOf = (propose) => ENDED_DOOR + (propose === true ? ' Or propose it to the person: vibespace-api conversations propose <target> --why "…" (one card; you read the answer at your next turn).' : propose === false ? ' The owner can add the verb conversations.propose to this key — then you can propose it to the person.' : '');
  const REACH_WORDS = { grant: 'through a grant of this key', instance: 'through the instance grant (every conversation here)', groups: 'through a Task Group grant' };
  const RECIPE = { opener: ' This key opened it: pass force (--force) to end it anyway.', self: ' It is this conversation itself: pass force (--force) to end it anyway.' };
  function endGate(t, args, label, { discountAsks = false, propose = null } = {}) {
    const own = t.by === 'opener' || t.by === 'self';
    if (args.force) return own ? null : { ok: false, code: 'force_not_yours', why: `force is honoured only for a conversation this key opened (or the calling conversation itself); this one is reached ${REACH_WORDS[t.by] || 'by another rule'} — nothing was stopped. ${doorOf(propose)}`, noticeName: label };
    const teach = own ? RECIPE[t.by] : '';
    // only a chat conversation whose harness row keeps every sidecar fact can ever be judged idle by the hub — the SAME caps the
    // list builder reads (listFacts.capsOf): anything else is the person's to end, said, so a manager does not retry
    const caps = listFacts && typeof listFacts.capsOf === 'function' ? listFacts.capsOf(t.s.backend || 'claude') : (() => { try { return require('../backend-caps.js').capsOf(t.s.backend || 'claude'); } catch { return null; } })();   // a list that hands none: the builder's own default source (sourcesFrom capsOf)
    const keeps = (caps && caps.sidecarFacts) || {};
    if (t.s.mode !== 'chat' || !(keeps.background && keeps.timers && keeps.lastRecordAt)) return { ok: false, code: 'person_only', why: `not ended — only a person can end it: ${t.s.mode !== 'chat' ? 'a terminal conversation' : 'its harness'} reports too little of what an agent's end must know. Nothing was stopped. ${doorOf(propose)}${teach}`, noticeName: label };
    const row = listFacts && typeof listFacts.rowOf === 'function' ? listFacts.rowOf(t.id) : null;
    if (!row) return { ok: false, code: 'not_ready', why: 'the conversation facts are not wired yet — nothing was stopped', noticeName: label };
    const CF = require('../conversation-facts.js');   // THE end verdict (PURE) — required here: a suite's scratch copy of this file carries no sibling
    // the archive's own recipe (主开发 15:31Z): a call that RESOLVES the conversation's asks is judged with them discounted
    const v = CF.endVerdict(discountAsks ? { ...row, asks: 0, asksWhy: undefined } : row);
    if (!v.endable) { const ref = CF.refusalOf(v, { propose }); return { ...ref, why: ref.why + teach, noticeName: label }; }
    return null;
  }
  // WHO ENDED IT, toward an agent (must 5): the kind only — the ending key's id and its belted name only when it is the CALLING key
  const endedByFor = (r, keyId) => {
    const by = r && r.ended && r.ended.by;
    if (!by || typeof by !== 'object') return r;
    const mine = by.kind === 'agent' && by.actorId && keyId && by.actorId === keyId;
    return { ...r, ended: { ...r.ended, by: mine ? { kind: 'agent', actorId: by.actorId, name: by.name ? beltRow({ name: by.name }).name : null, ...(by.forced ? { forced: true } : {}) } : { kind: by.kind === 'agent' ? 'agent' : 'person' } } };
  };
  const groupsOfLive = (s, id) => { try { return groupsOf(s, id) || []; } catch { return null; } };   // the chain's cure (the U3d should): null = could not be read (unreadable, never «no groups»)
  // lane lg-group-parents U3d: the ONE reader's ancestors; a read that throws (or answers no list) is null = UNREADABLE (its read, 2);
  // restack 416 (r311 (b)): the ancestors of no group are none — groups with NO reader wired are unknown (a forgotten wiring fails closed)
  const lineageOfIds = (ids) => { if (Array.isArray(ids) && !ids.length) return []; if (typeof lineageOf !== 'function') return null; try { const l = lineageOf(ids); return Array.isArray(l) ? l : null; } catch { return null; } };
  const targetOf = (base, inh) => ({ ...base, inherited: Array.isArray(inh) ? inh : [], ...(Array.isArray(inh) ? {} : { groupsUnreadable: true }) });
  /** The target, if the key reaches it → [s, id] | a named refusal. Its `noticeName` is the target's name for the owner's notice
   *  ONLY (B-119d): src/server/automation-engine.js reads it for that notice and never answers it, audits it or broadcasts it. */
  function reached(target, { caller, reach }) {
    const hit = findSession(target || caller.conversationId);
    if (!hit) return { ok: false, code: 'not_found', why: 'no live conversation by that id', noticeName: target || null };
    const [s, id] = hit;
    const glr = groupsOfLive(s, id), gl = glr || [];
    const v = reach(targetOf({ conversationId: idOf(s), webuiId: id, groups: gl, ...require('./groups-hold.js').fact() }, glr === null ? null : lineageOfIds(gl)));   // + the hub's hold (lane bl-windows): a reach «… except G» never admits a target whose groups are unknown   // lane lg-group-parents U3d: + the lineage   // ONE rule: opener / self / the grant's reach (B-3190)
    if (!v || !v.ok) return { ok: false, code: (v && v.code) || 'not_granted', why: (v && v.why) || 'the key does not reach that conversation', noticeName: s.name || target || null, ...(v && v.reach ? { reach: v.reach } : {}) };   // lane key-instance-scope: the refusal names the grant's reach
    return { ok: true, s, id, by: (v && v.by) || null };   // lane end-obeys-verdict: how the key reached it (`opener` = it opened it)
  }
  return {
    'conversations.open': async (args, { caller, keyId }) => {
      const spec = { cwd: args.cwd };
      for (const [from, to] of [['backend', 'backend'], ['mode', 'mode'], ['name', 'name'], ['model', 'model'], ['effort', 'effort'], ['permission', 'permissionMode'], ['task', 'taskId'], ['pool', 'accountId']]) if (args[from] != null) spec[to] = args[from];
      // --task: the Task Group is one the CALLER belongs to — conversations.bind's own rule (lane open-task-binds: the open now
      // writes the same membership a bind does, so it asks what a bind asks)
      if (spec.taskId) { const held = O().tasksUnread ? O().tasksUnread('opening a conversation in a Task Group') : null; if (held) return { ok: false, code: 'TASK_GROUPS_UNREAD', why: held }; }   // THE STORE HELD UNREAD (lane bl-windows): by its name, never «not in that Task Group»
      if (spec.taskId && !(caller.groups || []).includes(spec.taskId)) return { ok: false, code: 'not_granted', reach: 'member', callerMistake: true, why: 'the calling conversation is not in that Task Group' };   // B-3190 follow-up r2: its own cause on the For-you card (no grant cures it)
      const birthBy = spec.taskId ? { name: caller.name || caller.sessionKey || caller.conversationId, key: keyId, session: caller.sessionKey || null } : null;
      const r = await O().openConversation(spec, byOf(caller, keyId), { birthBy });
      if (!r || !r.ok) return r;
      let st = O().conversationStatus({ webuiId: r.sessionId });
      for (let t = 0; st.ok && st.pending && t < waitMs; t += 250) { await sleep(250); st = O().conversationStatus({ webuiId: r.sessionId }); }
      if (spec.taskId && typeof O().settleBirthGroups === 'function') O().settleBirthGroups();   // its id is here: the membership lands now (the notify point would, at its next broadcast)
      // A REPLY AFTER ITS LANDING (the census cure's hunt, finding 4 — 主开发 19:44Z): an open into a Task Group is answered once
      // task-groups.json holds the bind (bounded, as conversations.bind's); not yet ⇒ said (`notOnDisk`) — the bind stays applied in
      // memory and the writer lands it (the birth mark is gone with this process: never «bound» over a bind the disk does not hold)
      const saved = spec.taskId && typeof O().bindLanded === 'function' ? await O().bindLanded() : true;
      return { ...r, ...(st.ok ? { claudeSessionId: st.claudeSessionId, sessionKey: st.sessionKey, pending: st.pending } : {}), ...(saved ? {} : { notOnDisk: true }) };
    },
    'conversations.status': (args, ctx) => {
      const t = reached(args.target, ctx);
      return t.ok ? O().conversationStatus({ webuiId: t.id }) : t;
    },
    'conversations.rename': (args, ctx) => {
      const t = reached(args.target, ctx);
      if (!t.ok) return t;
      const r = callOp('rename', { webuiId: t.id, name: args.name });
      if (!(r && r.ok)) return r;
      const done = { ok: true, target: idOf(t.s) || t.id, name: r.name };
      // B-0248 (c), r1054 (7): «renamed» is told once the conversation list holding the name is ON DISK (as the archive verb's «archived»):
      // the name lives in the session and its meta already; not on disk ⇒ not-durable, by name (a hub wires the seam; without it the
      // answer is the rename's own, at once)
      const key = keyOf(t.s);
      if (typeof nameLanded !== 'function' || !key) return done;
      return Promise.resolve(nameLanded(key, r.name)).then((landed) => (landed ? done : { ok: false, code: 'not-durable', why: 'the conversation is renamed, but the conversation list could not be written to disk yet — it is kept and written again; ask again to know when it is on disk', noticeName: idOf(t.s) || t.id }));
    },
    'conversations.bind': async (args, ctx) => {   // async (the deferred-save census, lane lg-store-writes): its answer waits for the store
      const t = reached(args.target, ctx);
      if (!t.ok) return t;
      const { caller, keyId } = ctx;
      { const held = O().tasksUnread ? O().tasksUnread('adding a conversation to a Task Group') : null; if (held) return { ok: false, code: 'TASK_GROUPS_UNREAD', why: held }; }   // THE STORE HELD UNREAD: by its name, never «not granted»
      // the Task Group is one the CALLER belongs to (a key granted to a group is used by that group's own conversations)
      if (!(caller.groups || []).includes(args.task)) return { ok: false, code: 'not_granted', reach: 'member', callerMistake: true, why: 'the calling conversation is not in that Task Group' };
      try {
        O().bindConversation({ webuiId: t.id }, args.task, byOf(caller, keyId), { note: boundNote(idOf(t.s) || t.id, { name: caller.name || caller.sessionKey || caller.conversationId, key: keyId }), noteSession: caller.sessionKey || null });
        // the deferred-save census: «bound» is said once task-groups.json holds it (bounded, as every Task Group act's answer); not yet ⇒
        // said (`notOnDisk`) — the bind stays applied in memory and the writer lands it
        const saved = typeof O().bindLanded === 'function' ? await O().bindLanded() : true;   // an ops stand-in without it: nothing deferred to wait for
        return { ok: true, target: idOf(t.s) || t.id, task: args.task, ...(saved ? {} : { notOnDisk: true }) };
      } catch (e) {
        return { ok: false, code: e.code || (e.message === 'task not found' ? 'not_found' : 'bad_args'), why: e.message };
      }
    },
    // lane end-obeys-verdict (majordomo piece 3): AN AGENT'S END OBEYS THE VERDICT (src/conversation-facts.js endVerdict over the
    // list's own row) — busy or unknown ⇒ subject_busy with its reasons, nothing stopped, the doors named. `force` passes the
    // verdict ONLY for a conversation THIS key opened (the owner's decision); one reached through a grant ⇒ force_not_yours.
    'conversations.end': async (args, ctx) => {
      const t = reached(args.target, ctx);
      if (!t.ok) return t;
      const label = t.s.name || args.target || null;
      const propose = Array.isArray(ctx.scopes) ? ctx.scopes.includes('conversations.propose') : null;   // the cure's law 9: teach the propose door only to a key that holds it
      const gate = endGate(t, args, label, { propose });
      if (gate) return gate;
      // «forced» only when the gate WOULD have refused it — an idle own worker ended with the force word is no «ended mid-task»
      const cut = !!args.force && !!endGate(t, { ...args, force: false }, label);
      const r = await O().endConversation({ webuiId: t.id }, { ...byOf(ctx.caller, ctx.keyId), ...(cut ? { forced: true } : {}) });
      const key = keyOf(t.s);
      return r && r.ok ? { ok: true, target: idOf(t.s) || t.id, ...(key ? { link: 'vibespace://conversation/' + key } : {}) } : r;
    },
    // lane conversations-archive-verb: the opener's lifecycle ends with the sidebar's 归档
    'conversations.archive': async (args, ctx) => {
      const { caller, keyId, reach } = ctx;
      if (typeof archive !== 'function') return { ok: false, code: 'not_ready', why: 'the archive path is not wired yet' };
      const hit = findSession(args.target);
      let f;   // the target's facts: { s?, id?, conversationId, sessionKey, name, groups }
      if (hit) { const [s, id] = hit; const glr = groupsOfLive(s, id), gl = glr || []; f = { s, id, conversationId: idOf(s), sessionKey: keyOf(s), name: s.name || null, groups: gl, inherited: glr === null ? null : lineageOfIds(gl) }; }   /* lane lg-group-parents U3d */
      else {
        let d = null; try { d = deadOf(args.target); } catch { d = null; }
        if (!d || !d.conversationId) return { ok: false, code: 'not_found', why: 'no conversation by that id — live, or ended on this machine', noticeName: args.target };
        f = { s: null, id: null, conversationId: d.conversationId, sessionKey: d.sessionKey || `claude:${d.conversationId}`, name: d.name || null, groups: Array.isArray(d.groups) ? d.groups : [], ...(d.inherited !== undefined ? { inherited: d.inherited } : {}) };   // lane lg-group-parents U3d (its read, 7): the lineage the stopped target was read with
      }
      const label = f.name || args.target;
      if (!f.sessionKey) return { ok: false, code: 'pending', why: 'the conversation has not reported its id yet — poll conversations.status, then archive', noticeName: label };
      const v = reach(targetOf({ conversationId: f.conversationId, webuiId: f.id, groups: f.groups, ...require('./groups-hold.js').fact() }, f.inherited !== undefined ? f.inherited : lineageOfIds(f.groups || [])));   // lane lg-group-parents U3d
      if (!v || !v.ok) return { ok: false, code: (v && v.code) || 'not_granted', why: (v && v.why) || 'the key does not reach that conversation', noticeName: label, ...(v.reach ? { reach: v.reach } : {}) };
      // B-225b R3: the archived list HELD — refused by name BEFORE anything is ended (an archive that ended the conversation and then
      // could not write the list would leave it ended and listed); AFTER the reach verdict (主开发 r565): its label is the target's
      // name, so a held list never tells a caller about a conversation it may not see
      if (isArchived(f.sessionKey) === null) return { ok: false, code: 'store_unread', why: 'the conversation list could not be read — nothing was ended or archived; ask again once it is read', noticeName: label };
      let asks; try { asks = (asksOf(f.sessionKey) || []).map((i) => i && i.id).filter(Boolean); } catch (e) { if (e && e.code === 'todos-unread') return { ok: false, code: 'todos-unread', why: e.message, noticeName: label }; throw e; }   // B-44f3: For you held unread — its asks are unknown, never «none»
      if (asks.length && !args.resolveAsks) return { ok: false, code: 'asks_open', why: `${asks.length} open For-you ask${asks.length === 1 ? '' : 's'} of that conversation (${asks.join(', ')}) — the owner answers them, or pass resolveAsks`, asks, noticeName: label };
      const discountAsks = !!args.resolveAsks;   // the archive's recipe: the asks it resolves are no reason to refuse
      if (f.s) { const gate = endGate({ s: f.s, id: f.id, by: v.by }, args, label, { discountAsks, propose: Array.isArray(ctx.scopes) ? ctx.scopes.includes('conversations.propose') : null }); if (gate) return gate; }   // the ONE end gate (lane end-obeys-verdict: must 1)
      const cutA = !!(f.s && args.force && endGate({ s: f.s, id: f.id, by: v.by }, { ...args, force: false }, label, { discountAsks }));
      let resolved = [];
      if (asks.length) { try { resolved = (resolveAsks(asks, `automation:${keyId}`) || {}).changed || []; } catch { resolved = []; } }
      let ended = false;
      if (f.s) {
        const r = await O().endConversation({ webuiId: f.id }, { ...byOf(caller, keyId), ...(cutA ? { forced: true } : {}) }, { endTree: true });   // B-c134 cure: an archive ends the background tree
        if (!r || !r.ok) return { ok: false, code: (r && r.code) || 'failed', why: (r && r.why) || 'the conversation could not be ended', noticeName: label };
        ended = true;
      }
      const a = archive(f.sessionKey);   // the sidebar's own store write (persistence router archiveSession)
      if (!a || !a.ok) return { ok: false, code: (a && a.code) || 'failed', why: (a && a.why) || 'the archived list could not be written', noticeName: label };
      // B-0248 (c): the archived list is the store writer's — «archived» (or «already archived») is told once it is ON DISK: a caller
      // told so never asks again; one told not-durable asks again and hears already_archived once the list landed
      if (a.landed && !(await a.landed)) return { ok: false, code: 'not-durable', why: 'the archived list could not be written to disk yet — it is kept and written again; ask again: it answers once the list is on disk', noticeName: label };
      if (a.already && !ended) return { ok: false, code: 'already_archived', why: 'that conversation is already in the archived list', noticeName: label };
      return { ok: true, target: f.conversationId, sessionKey: f.sessionKey, ended, archived: true, already: !!a.already, resolvedAsks: resolved };
    },
    // lane conversation-facts (majordomo piece 2): ONE snapshot of what the key reaches. The builder (src/server/conversation-facts.js)
    // knows nothing of reach; each row is judged HERE by the one rule every verb asks (opener / grant / self), the caller marked
    // `self`, the rest only counted (beyondReach). A browser is listed when a reached conversation holds it, or nobody does.
    'conversations.list': async (args, ctx) => {
      if (!listFacts || typeof listFacts.list !== 'function') return { ok: false, code: 'not_ready', why: 'the conversation list is not wired yet' };
      const { caller, reach } = ctx;
      const snap = await listFacts.list();
      const selfKey = caller.sessionKey || `claude:${caller.conversationId}`;
      const rows = [];
      let beyond = 0, heldOut = 0;
      for (const r of snap.conversations || []) {
        const self = !!r.key && r.key === selfKey;
        const cid = r.key ? r.key.slice(r.key.indexOf(':') + 1) : null;
        let v = null;
        if (!self) { try { v = reach(targetOf({ conversationId: cid, webuiId: r.id || null, groups: Array.isArray(r.groups) ? r.groups : [], ...require('./groups-hold.js').fact() }, r.groupsUnreadable === true ? null : lineageOfIds(Array.isArray(r.groups) ? r.groups : []))); } catch { v = null; } }   // the hold's fact: while the store is held a row's groups are UNKNOWN (a grant «… except G» never lists it)   // lane lg-group-parents (restack 415): + the row's ancestors — a grant naming a parent group lists its child's conversation, «… except P» never does; a lineage that cannot be read is unreadable (said in beyondWhy)
        if (self || (v && v.ok)) rows.push(self ? { ...r, self: true } : beltRow(r)); else beyond++;
        if (!self && v && v.code === 'groups_unreadable') heldOut++;   // a held refusal is SAID in the answer (beyondWhy), never a silent «beyond reach»
      }
      for (let i = 0; i < rows.length; i++) rows[i] = endedByFor(rows[i], ctx.keyId);   // who ended it, toward an agent (lane end-obeys-verdict: must 5)
      const keys = new Set(rows.map((r) => r.key).filter(Boolean));
      // a browser's name passes the same belt (a profile's label may be another conversation's words — lane browsers-stop)
      const browsers = Array.isArray(snap.browsers) ? snap.browsers.filter((b) => !Array.isArray(b.holders) || !b.holders.length || b.holders.some((k) => keys.has(k))).map((b) => (b && b.name ? { ...b, name: beltRow({ name: b.name }).name } : b)) : null;
      return { ok: true, at: snap.at, machine: snap.machine, desktops: snap.desktops, ...(snap.desktopsWhy ? { desktopsWhy: snap.desktopsWhy } : {}), conversations: rows, browsers, ...(browsers ? {} : { browsersWhy: snap.browsersWhy || 'not collected' }), beyondReach: beyond, pass: snap.pass, ...(heldOut ? { groupsUnreadable: true, beyondWhy: `the Task Groups could not be read just now — ${heldOut} conversation(s) could not be judged against this key's reach and are not listed until they can be` } : {}) };
    },
    // THE MANAGER DESIGN'S PIECE 4: resume an ENDED conversation the way a person's Resume press does — the page's own resume road
    // run headless (src/server/inbox-reopen.js reopen, through the one line), NOTHING sent into it and nothing billed (a person's
    // create: no spend row). A resume nobody pressed must not start a turn nobody pressed (主开发 02:23Z): from the conversation's
    // KEPT RECORD it refuses by name an active goal, a CLI timer mark, and — on a harness whose resume continues a goal by itself
    // (its declared row) — a goal the record cannot speak for (src/resume-line.js resumeVerdict). Not conversations.open: the
    // open spec stays closed.
    'conversations.resume': async (args, ctx) => {
      const { reach } = ctx;
      const note = 'background tasks it had started ended with its process, and the resume does not restart them; nothing was sent to it';
      const hit = findSession(args.target);
      if (hit) {   // NOT ENDED: refused by name (a resume that RACED a person's press answers `already` below — inbox-reopen's road)
        const [s, id] = hit;
        const glr = groupsOfLive(s, id), v = reach(targetOf({ conversationId: idOf(s), webuiId: id, groups: glr || [], ...require('./groups-hold.js').fact() }, glr === null ? null : lineageOfIds(glr)));   // the hold's fact (as the end verb's)   // lane lg-group-parents (restack 415): + the lineage, and own groups that could not be read are unreadable (groupsOfLive's null — as the end verb's)
        if (!v || !v.ok) return { ok: false, code: (v && v.code) || 'not_granted', why: (v && v.why) || 'the key does not reach that conversation', noticeName: s.name || args.target || null, ...(v && v.reach ? { reach: v.reach } : {}) };   // ONE shape for a live and an ended conversation
        const key = keyOf(s);
        return { ok: false, code: 'not_ended', why: 'there is nothing to resume — message it instead (its link is in this answer)', noticeName: idOf(s) || id, sessionKey: key, sessionId: id, link: key ? `vibespace://conversation/${key}` : null };
      }
      let d = null; try { d = deadOf(args.target); } catch { d = null; }
      if (!d || !d.conversationId) return { ok: false, code: 'not_found', why: 'no conversation by that id — live, or ended on this machine', noticeName: args.target || null };
      const label = d.name || args.target;
      const v = reach(targetOf({ conversationId: d.conversationId, webuiId: null, groups: Array.isArray(d.groups) ? d.groups : [], ...require('./groups-hold.js').fact() }, d.inherited !== undefined ? d.inherited : lineageOfIds(Array.isArray(d.groups) ? d.groups : [])));   // the hold's fact: an ended record's groups are read from the held store too   // lane lg-group-parents (restack 415): + the lineage the wiring read with the record (endedKeyOf — as the archive's)
      if (!v || !v.ok) return { ok: false, code: (v && v.code) || 'not_granted', why: (v && v.why) || 'the key does not reach that conversation', noticeName: label, ...(v && v.reach ? { reach: v.reach } : {}) };
      const backend = d.sessionKey.slice(0, d.sessionKey.indexOf(':')) || 'claude';
      let facts = null; try { facts = (await resumeFactsOf(d.sessionKey)) || null; } catch { facts = null; }
      let archived = null; try { archived = isArchived(d.sessionKey); } catch { archived = null; }
      if (archived === null) return { ok: false, code: 'store_unread', why: 'the conversation list could not be read — whether that conversation is archived is not known; ask again once it is read', noticeName: label };   // B-225b R3
      archived = !!archived;
      let row = null; try { row = resumeRowOf(backend) || null; } catch { row = null; }
      const verdict = require('../resume-line.js').resumeVerdict({ ...(facts || { goal: 'unknown', timerMark: null, mode: null }), archived }, row || { resumeContinues: 'unread', headless: false });
      if (!verdict.ok) return { ok: false, code: verdict.code, why: verdict.why, noticeName: label };
      if (!resumeLine) return { ok: false, code: 'not_ready', why: 'the resume line is not wired yet' };
      const q = resumeLine.submit({ target: d.sessionKey, by: ctx.keyId, payload: { cwd: (facts && facts.cwd) || '', hostId: (facts && facts.hostId) || null, actBy: `automation:${ctx.keyId}` } });
      if (!q.ok) return { ok: false, code: q.code, why: `${q.count} of this key's resumes wait their turn — ask again once one of them has started (conversations status names it live)`, count: q.count, noticeName: label };
      const base = { target: d.conversationId, sessionKey: d.sessionKey, link: `vibespace://conversation/${d.sessionKey}`, desktop: (() => { try { return rowDesktopOf(d.sessionKey) || null; } catch { return null; } })(), note };
      if (q.position > 0) return { ok: true, queued: true, position: q.position, next: `conversations status ${d.sessionKey} answers once it runs; asking again keeps its place`, ...base };
      const r = await q.result;
      if (!r || !r.ok) return { ok: false, code: 'resume_failed', why: `${(r && r.why) || 'the create gave no reason'} — a person can resume it from its window`, noticeName: label };
      return { ok: true, sessionId: r.sessionId, ...(r.already ? { already: true } : {}), ...base };
    },
    // B-2083 unit A (主开发 r5167 / r5180): set or clear the target's POOL PIN through the person's pin road's ONE writer (the `pin` its
    // owner hands over — pinConversation). A member of the target's own pool is judged first by the MONEY LAW (PURE pinMoneyVerdict
    // over THE spend guard's reader): paid overage, usage credits, a paying state unknown or unread ⇒ paid_member, nothing written; any
    // other refusal is the writer's own, by its name (not_pooled · remote_session · not_member · no_session · pin_not_saved).
    // «automatic» clears the pin (no member: the pool's own placement decides again, no money judged here). Nothing starts a turn.
    // The reply says how long the pin holds (PIN_HOLDS): the page's own resume carrier is the page's to write.
    'conversations.pin': (args, ctx) => {
      const t = reached(args.target, ctx);
      if (!t.ok) return t;
      const label = t.s.name || args.target || null;
      const member = args.automatic ? null : args.member;
      const guard = (id) => require('../automation-keys.js').pinMoneyVerdict(O().memberOverage(id), id);
      const r = O().pinConversation(t.id, member, { by: `automation:${ctx.keyId}`, guard });
      if (!r || !r.ok) return { ok: false, code: (r && r.code) || 'failed', why: (r && (r.why || r.error)) || 'the pin was not changed', noticeName: label };
      return { ok: true, target: idOf(t.s) || t.id, member: (r.pinned && r.pinned.memberId) || null, placed: !!r.placed, reason: r.reason || null, ...(r.code ? { note: r.code } : {}), current: r.current || null, holds: PIN_HOLDS };
    },
    // lane login-request-card (majordomo piece 3b): an agent PROPOSES ending conversations it can see — ONE For-you card per proposer
    // (src/server/end-proposals.js); a target outside the key's reach is refused by name, nothing filed; nothing ends here
    'conversations.propose': async (args, ctx) => {
      if (!proposals || typeof proposals.propose !== 'function') return { ok: false, code: 'not_ready', why: 'the proposal card is not wired yet' };
      // B-44f3 (its second read's should): For you held unread refuses the card BY NAME — its code reaches the agent (never «failed»)
      try { return await proposals.propose({ targets: args.targets, why: args.why }, ctx); } catch (e) { if (e && e.code === 'todos-unread') return { ok: false, code: 'todos-unread', why: e.message }; throw e; }
    },
    // lane browsers-stop (majordomo piece 6): stop ONE running browser by its id, through the keeper's own stop (reason
    // `manager`: automatic for the kept tabs, never deliberate). ONE PURE verdict decides (src/browser-profiles.js stopVerdict):
    // refused while a person drives, watches or browses in it, while a holder's turn runs or is unknown, while a holder is
    // outside the key's reach — every unknown refuses. The rows come from the keeper (stopRows: a read, no file).
    'browsers.stop': async (args, ctx) => {
      if (!browsers || typeof browsers.rows !== 'function' || typeof browsers.stop !== 'function') return { ok: false, code: 'not_ready', why: 'the browser keeper is not wired yet' };
      // piece 6 meets the hold laws: while the browser registry is unread the keeper refuses BY NAME — never «no running browser»
      let rows = null; try { rows = browsers.rows(); } catch (e) { if (e && e.code === 'store_unread') return { ok: false, code: 'store_unread', why: `${e.message} — nothing was stopped`, noticeName: args.id }; rows = null; }
      if (!Array.isArray(rows)) return { ok: false, code: 'not_ready', why: 'the browser keeper did not answer — nothing was stopped' };
      const row = rows.find((r) => r && r.id === args.id) || null;
      if (!row) return { ok: false, code: 'already_stopped', why: 'no running browser by that id — nothing was stopped', noticeName: args.id };
      // each holder: its conversation (the live session by its webui id) and the key's reach over it; a holder that is not
      // running here is UNKNOWN (its own reason), never «outside your reach»
      const holders = (Array.isArray(row.holders) ? row.holders : []).map((h) => {
        const s = h && h.sessionId ? activeSessions.get(h.sessionId) || null : null;
        if (!s) return { turn: null, granted: false, unknown: true };
        // piece 6 meets the hold laws and the lineage law: the ONE target every reach door hands (targetOf) — the groups hold's fact
        // and the ancestors of the holder's groups; a group read that fails (groupsOfLive null) is refused unreadable BY NAME
        const glr = groupsOfLive(s, h.sessionId), gl = glr || [];
        let v = null; try { v = ctx.reach(targetOf({ conversationId: idOf(s), webuiId: h.sessionId, groups: gl, ...require('./groups-hold.js').fact() }, glr === null ? null : lineageOfIds(gl))); } catch { v = null; }   // the stop's reach (as the end verb's)
        return { turn: h && h.turn !== undefined ? h.turn : null, granted: !!(v && v.ok), ...(v && v.code === 'groups_unreadable' ? { unreadable: true } : {}),
          ...(v && v.code === 'excepted' ? { excepted: { why: String(v.why || 'the owner left that conversation out of this grant\'s reach'), ...(v.reach ? { reach: v.reach } : {}) } } : {}) };   // round wztkervx5 (a): the exception's own words
      });
      const v = require('../browser-profiles.js').stopVerdict({ live: true, holders, kind: row.kind || null, takenOver: typeof row.takenOver === 'boolean' ? row.takenOver : null,
        watched: Number.isInteger(row.viewers) ? row.viewers > 0 : null, personBrowsing: typeof row.personBrowsing === 'boolean' ? row.personBrowsing : null,
        inFlight: row.inFlight || null, tabsKept: row.tabsKept === true, closeTabs: args.closeTabs === true });
      if (!v.stop) return { ok: false, code: v.code, why: v.why, noticeName: row.name || row.id, ...(v.reach ? { reach: v.reach } : {}) };   // an exception's refusal names the grant's reach, as reached() does
      let r = null;
      try { r = await browsers.stop(row.id); } catch (e) { if (e && (e.code === 'store_unread' || e.code === 'stop_facts_unsupported' || e.code === 'host_unavailable')) return { ok: false, code: e.code, why: `${e.message} — ${e.code === 'host_unavailable' ? 'whether it stopped there is not known (the request may have reached the machine)' : 'nothing was stopped'}`, noticeName: row.name || row.id }; /* B-e799: a paired machine that cannot be asked (unreachable, or its agent predates the structured answer) refuses by name */ return { ok: false, code: 'not_freed', why: `the keeper could not stop it — ${(e && e.message) || 'no reason given'}; nothing was freed`, noticeName: row.name || row.id }; }
      // THE ANSWER TELLS THE TRUTH ABOUT WHAT WAS FREED: «not freed» is not ok
      if (!r || r.freed !== true) return { ok: false, code: 'not_freed', why: `not freed — ${(r && r.why) || 'the keeper did not say it stopped'}`, noticeName: row.name || row.id };
      const tabs = row.kind === 'own' ? 'Its tabs reopen at the next browser command.' : row.kind === 'helper' ? 'A helper\'s browser keeps nothing: its tabs are closed.' : `Its tabs closed; its sign-ins stay${row.machine ? ` in its folder on ${row.machine}` : ''}.`;
      return { ok: true, id: row.id, kind: row.kind, ...(row.machine ? { machine: row.machine } : {}), freed: true, tabs };
    },
    'groups.invite': async (args, ctx) => {
      const t = reached(args.target, ctx);
      if (!t.ok) return t;
      const cid = idOf(t.s);
      if (!cid) return { ok: false, code: 'pending', why: 'the conversation has not reported its id yet — poll conversations.status, then invite' };
      const r = await O().inviteToGroup(args.group, [cid], byOf(ctx.caller, ctx.keyId), { quiet: true });
      return r && r.ok ? { ok: true, target: cid, group: args.group } : { ok: false, code: (r && r.code) || 'failed', why: (r && (r.error || r.why)) || null }; // ids only — the engine's added / already lists are members' display names (a peer's words)
    },
  };
}

module.exports = {
  OPEN_REASON, OPEN_TIMEOUT_MS,
  OPEN_ID_WAIT_MS, provide, callOp, renameSession, automationVerbs, forDeps, opsOver, specTables, openDefaults, limitChoices, ...sharedOps,
};
