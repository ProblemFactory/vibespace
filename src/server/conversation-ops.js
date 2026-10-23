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
    });
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
  const permissionModes = [], models = [];
  for (const id of ids) {
    const table = HS && HS.HARNESS_SETTINGS ? HS.HARNESS_SETTINGS[id] : null;
    const rows = table && HS ? HS.rowsOfKind(table, 'spawn') : [];
    const via = (v) => rows.find((r) => r && r.apply && r.apply.via === v) || null;
    for (const [row, out] of [[via('permissionMode'), permissionModes], [via('model'), models]]) {
      for (const o of (row && Array.isArray(row.options) ? row.options : [])) if (o && typeof o.value === 'string') out.push({ backend: id, value: o.value || 'default', label: String(o.label || o.value || 'default') });
    }
  }
  let list = [];
  try { const l = accounts && typeof accounts.list === 'function' ? accounts.list() : null; list = ((l && l.accounts) || []).map((a) => ({ id: a.id, name: a.name || a.id, backend: a.backend || 'claude', type: a.type || null })); } catch { list = []; }
  return { accounts: list, permissionModes, models };
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
    if (!g || !g.ok) return refusal('spend_refused', (g && g.detail) || 'the spend guard refused', { bucket: (g && g.why) || 'unknown', retryAfter: (g && g.retryAfter) || 0 });
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
    const active = D().activeSessions;
    if (!active || typeof active.entries !== 'function' || !D().tasks) return 0;
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
  async function endConversation(target, by, { reply = null } = {}) {
    if (typeof D().endSession !== 'function') return refusal('not_ready', 'the end path is not wired yet');
    if (by && by.kind === 'automation') {
      const t = SPEC.targetVerdict(target); if (!t.ok) return t;
      const hit = liveOf(t.target);
      if (!hit) return refusal('not_found', 'no live conversation by that id');
      const answers = [];
      await D().endSession({ sessionId: hit.id }, { reply: (m) => answers.push(m), actBy: SPEC.actByOf(by) });
      const a = answers[answers.length - 1] || null;
      return a && a.ok ? { ok: true, sessionId: hit.id } : refusal('not_found', 'no live conversation by that id');
    }
    return D().endSession(target, { reply: reply || (() => { }), actBy: SPEC.actByOf(by) });
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

  return { conversationStatus, openConversation, renameConversation, bindConversation, settleBirthGroups, endConversation, inviteToGroup };
}
const sharedOps = opsOver(() => shared);
/** ws-handler's own instance: its parts first, the provided ones (the task store, the spend guard…) behind them. */
function forDeps(own) { return opsOver(() => ({ ...shared, ...(own || {}) })); }

/**
 * THE WIRED AUTOMATION VERBS (src/server/automation-engine.js `verbs`). Each resolves its TARGET conversation and asks the
 * engine's `reach` — ONE PURE rule (src/automation-keys.js reachVerdict, lane conversations-archive-verb): the key OPENED
 * it, a grant of the key names it (the conversation or one of its Task Groups), or it is the caller itself — before it
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
const OPEN_ID_WAIT_MS = 20 * 1000;     // a claude CLI reports its conversation id within seconds of the spawn
const BUSY_TURNS = ['running', 'waiting'];   // turn-facts' non-idle states: mid-turn, or paused on the user (requires_action)
function automationVerbs({ activeSessions, groupsOf = () => [], ops = null, waitMs = OPEN_ID_WAIT_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  archive = null, asksOf = () => [], resolveAsks = () => ({ changed: [], unknown: [] }), turnOf = () => 'idle', deadOf = () => null } = {}) {
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
  const byOf = (caller, keyId) => ({ kind: 'automation', key: keyId, subject: `session:${caller.conversationId}`, cid: caller.conversationId, sessionKey: caller.sessionKey || `claude:${caller.conversationId}` });
  const groupsOfLive = (s, id) => { try { return groupsOf(s, id) || []; } catch { return []; } };
  /** The target, if the key reaches it → [s, id] | a named refusal (carrying the target's name for the owner's notice). */
  function reached(target, { caller, reach }) {
    const hit = findSession(target || caller.conversationId);
    if (!hit) return { ok: false, code: 'not_found', why: 'no live conversation by that id', target: target || null };
    const [s, id] = hit;
    const v = reach({ conversationId: idOf(s), webuiId: id, groups: groupsOfLive(s, id) });   // ONE rule: opener / grant / self
    if (!v || !v.ok) return { ok: false, code: (v && v.code) || 'not_granted', why: (v && v.why) || 'the key does not reach that conversation', target: s.name || target || null, ...(v && v.reach ? { reach: v.reach } : {}) };   // lane key-instance-scope: the refusal names the grant's reach
    return { ok: true, s, id };
  }
  return {
    'conversations.open': async (args, { caller, keyId }) => {
      const spec = { cwd: args.cwd };
      for (const [from, to] of [['backend', 'backend'], ['mode', 'mode'], ['name', 'name'], ['model', 'model'], ['effort', 'effort'], ['permission', 'permissionMode'], ['task', 'taskId'], ['pool', 'accountId']]) if (args[from] != null) spec[to] = args[from];
      // --task: the Task Group is one the CALLER belongs to — conversations.bind's own rule (lane open-task-binds: the open now
      // writes the same membership a bind does, so it asks what a bind asks)
      if (spec.taskId && !(caller.groups || []).includes(spec.taskId)) return { ok: false, code: 'not_granted', why: 'the calling conversation is not in that Task Group' };
      const birthBy = spec.taskId ? { name: caller.name || caller.sessionKey || caller.conversationId, key: keyId, session: caller.sessionKey || null } : null;
      const r = await O().openConversation(spec, byOf(caller, keyId), { birthBy });
      if (!r || !r.ok) return r;
      let st = O().conversationStatus({ webuiId: r.sessionId });
      for (let t = 0; st.ok && st.pending && t < waitMs; t += 250) { await sleep(250); st = O().conversationStatus({ webuiId: r.sessionId }); }
      if (spec.taskId && typeof O().settleBirthGroups === 'function') O().settleBirthGroups();   // its id is here: the membership lands now (the notify point would, at its next broadcast)
      return { ...r, ...(st.ok ? { claudeSessionId: st.claudeSessionId, sessionKey: st.sessionKey, pending: st.pending } : {}) };
    },
    'conversations.status': (args, ctx) => {
      const t = reached(args.target, ctx);
      return t.ok ? O().conversationStatus({ webuiId: t.id }) : t;
    },
    'conversations.rename': (args, ctx) => {
      const t = reached(args.target, ctx);
      if (!t.ok) return t;
      const r = callOp('rename', { webuiId: t.id, name: args.name });
      return r && r.ok ? { ok: true, target: idOf(t.s) || t.id, name: r.name } : r;
    },
    'conversations.bind': (args, ctx) => {
      const t = reached(args.target, ctx);
      if (!t.ok) return t;
      const { caller, keyId } = ctx;
      // the Task Group is one the CALLER belongs to (a key granted to a group is used by that group's own conversations)
      if (!(caller.groups || []).includes(args.task)) return { ok: false, code: 'not_granted', why: 'the calling conversation is not in that Task Group' };
      try {
        O().bindConversation({ webuiId: t.id }, args.task, byOf(caller, keyId), { note: boundNote(idOf(t.s) || t.id, { name: caller.name || caller.sessionKey || caller.conversationId, key: keyId }), noteSession: caller.sessionKey || null });
        return { ok: true, target: idOf(t.s) || t.id, task: args.task };
      } catch (e) {
        return { ok: false, code: e.code || (e.message === 'task not found' ? 'not_found' : 'bad_args'), why: e.message };
      }
    },
    'conversations.end': async (args, ctx) => {
      const t = reached(args.target, ctx);
      if (!t.ok) return t;
      const r = await O().endConversation({ webuiId: t.id }, byOf(ctx.caller, ctx.keyId));
      return r && r.ok ? { ok: true, target: idOf(t.s) || t.id } : r;
    },
    // lane conversations-archive-verb: the opener's lifecycle ends with the sidebar's 归档
    'conversations.archive': async (args, ctx) => {
      const { caller, keyId, reach } = ctx;
      if (typeof archive !== 'function') return { ok: false, code: 'not_ready', why: 'the archive path is not wired yet' };
      const hit = findSession(args.target);
      let f;   // the target's facts: { s?, id?, conversationId, sessionKey, name, groups }
      if (hit) { const [s, id] = hit; f = { s, id, conversationId: idOf(s), sessionKey: keyOf(s), name: s.name || null, groups: groupsOfLive(s, id) }; }
      else {
        let d = null; try { d = deadOf(args.target); } catch { d = null; }
        if (!d || !d.conversationId) return { ok: false, code: 'not_found', why: 'no conversation by that id — live, or ended on this machine', target: args.target };
        f = { s: null, id: null, conversationId: d.conversationId, sessionKey: d.sessionKey || `claude:${d.conversationId}`, name: d.name || null, groups: Array.isArray(d.groups) ? d.groups : [] };
      }
      const label = f.name || args.target;
      if (!f.sessionKey) return { ok: false, code: 'pending', why: 'the conversation has not reported its id yet — poll conversations.status, then archive', target: label };
      const v = reach({ conversationId: f.conversationId, webuiId: f.id, groups: f.groups });
      if (!v || !v.ok) return { ok: false, code: (v && v.code) || 'not_granted', why: (v && v.why) || 'the key does not reach that conversation', target: label, ...(v.reach ? { reach: v.reach } : {}) };
      const asks = (asksOf(f.sessionKey) || []).map((i) => i && i.id).filter(Boolean);
      if (asks.length && !args.resolveAsks) return { ok: false, code: 'asks_open', why: `${asks.length} open For-you ask${asks.length === 1 ? '' : 's'} of that conversation (${asks.join(', ')}) — the owner answers them, or pass resolveAsks`, asks, target: label };
      if (f.s && !args.force) { const turn = turnOf(f.s); if (BUSY_TURNS.includes(turn)) return { ok: false, code: 'subject_busy', why: `that conversation has a turn ${turn} — wait for it, or pass force`, turn, target: label }; }
      let resolved = [];
      if (asks.length) { try { resolved = (resolveAsks(asks, `automation:${keyId}`) || {}).changed || []; } catch { resolved = []; } }
      let ended = false;
      if (f.s) {
        const r = await O().endConversation({ webuiId: f.id }, byOf(caller, keyId));
        if (!r || !r.ok) return { ok: false, code: (r && r.code) || 'failed', why: (r && r.why) || 'the conversation could not be ended', target: label };
        ended = true;
      }
      const a = archive(f.sessionKey);   // the sidebar's own store write (persistence router archiveSession)
      if (!a || !a.ok) return { ok: false, code: (a && a.code) || 'failed', why: (a && a.why) || 'the archived list could not be written', target: label };
      if (a.already && !ended) return { ok: false, code: 'already_archived', why: 'that conversation is already in the archived list', target: label };
      return { ok: true, target: f.conversationId, sessionKey: f.sessionKey, ended, archived: true, already: !!a.already, resolvedAsks: resolved };
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
