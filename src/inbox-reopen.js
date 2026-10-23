'use strict';
/**
 * A REPLY TO A CONVERSATION THAT ENDED REOPENS IT — the PURE half (lane inbox-reply-dead-session; the ORCH half is
 * src/server/inbox-reopen.js, the route src/routes/user-todos-reply.js). userW inc-mvfuzlom-nwav (2026-10-19,
 * 2.369.318): 「在 inbox 里面回复 session 的时候, 如果那个 session 已经挂了, 就回不了了.」 — the For-you box was
 * DISABLED on a conversation that was not running, its reason only in a hover title.
 *
 * `reopenCreate({key, entry, item, cfg, defaults, name, taskId, reqId})` → {ok:true, data} | {ok:false, why}:
 * the ws `create` message the page's OWN resume road sends for this conversation — the For-you's "open the session"
 * door (src/lib/user-todos-actions.js jump: `app.resumeSession(s.sessionId, s.cwd, name, {backend, hostId})`) through
 * src/lib/session-lifecycle.js resumeSession → createSession, FIELD FOR FIELD, over the facts that page reads:
 *   key      — the item's `<backend>:<conversation id>` (a `webui:<id>` key has no conversation id to resume)
 *   entry    — the conversation's discovery record (the sidebar's row: cwd, host), or `{cwd, located:true}` when
 *              discovery does not list it but the harness's own store locates its transcript (the ORCH asks);
 *              null ⇒ the item's own cwd/hostId (the asker's, filed with the ask) — and a LOCAL conversation
 *              with neither has no transcript to resume (said, never guessed)
 *   cfg      — user-state `sessionConfigs[key]` (the gear popover the page's getSessionConfig reads: model,
 *              permission, effort, outputStyle, worktree, autoResume, account, modelLock, lockModel, poolPin, tools)
 *   defaults — the harness's instance defaults a resume is filled with: {permission, extraArgs}
 * Always mode 'chat' — the reply is a chat turn. A continuation sends model / effort only when the conversation's own
 * config STATES one (resumeSpawnPick with resume:true, hasSource:false — the client's own call; the server's
 * continuity ladder reads the rest from the transcript). Nothing here spends: a resume sends nothing into the
 * conversation — the reply that follows is the PERSON's typed turn (the route says so at its call).
 */
const { resumeSpawnPick } = require('./resume-continuity.js');

/** The fields of a conversation's config a resume carries (session-lifecycle resumeSession's `savedCfg.*` reads). */
const REOPEN_CFG_KEYS = Object.freeze(['model', 'permission', 'effort', 'outputStyle', 'worktree', 'autoResume', 'account', 'modelLock', 'lockModel', 'poolPin', 'tools']);

const str = (v) => (typeof v === 'string' ? v : '');
/** "host: /path" (a merged record's display cwd) → the real path — the client's stripCwdHostLabel (src/lib/utils.js). */
const realCwd = (cwd) => { const c = str(cwd); const m = c.match(/^[^/~]+: (?=[/~])/); return m ? c.slice(m[0].length) : c; };

/** `<backend>:<id>` → {backend, id} | null (no conversation id: a `webui:` key, a server producer's bucket). */
function conversationOfKey(key) {
  const k = str(key);
  const at = k.indexOf(':');
  if (at <= 0 || at === k.length - 1) return null;
  const backend = k.slice(0, at), id = k.slice(at + 1);
  if (backend === 'webui' || !/^[\w.-]+$/.test(backend) || !/^[\w.-]+$/.test(id)) return null;
  return { backend, id };
}

function reopenCreate({ key, entry = null, item = null, cfg = null, defaults = null, name = '', taskId = null, reqId = '' } = {}) {
  const conv = conversationOfKey(key);
  if (!conv) return { ok: false, why: 'this item was filed before its conversation had an id — open the conversation from the sidebar, then reply' };
  const it = item || {};
  const e = entry && typeof entry === 'object' ? entry : null;
  const hostId = (e ? str(e.hostId || e.host) : str(it.hostId)) || '';
  const cwd = realCwd(e ? e.cwd : it.cwd);
  if (!e && !hostId) return { ok: false, why: 'no transcript of this conversation was found on this machine — it cannot be reopened here' };
  if (!cwd) return { ok: false, why: 'the folder this conversation ran in is not known — open it from the sidebar, then reply' };
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const d = defaults && typeof defaults === 'object' ? defaults : {};
  // createSession: a continuation's model / effort = the conversation's own STATED pick, else nothing (the server's ladder)
  const modelPick = resumeSpawnPick({ explicit: c.model, instanceDefault: '', resume: true, hasSource: false });
  const effortPick = resumeSpawnPick({ explicit: c.effort, instanceDefault: '', resume: true, hasSource: false });
  const permission = c.permission !== undefined ? c.permission : d.permission;
  const pin = c.poolPin && typeof c.poolPin === 'object' && typeof c.poolPin.memberId === 'string' ? c.poolPin : null;
  const data = {
    type: 'create', backend: conv.backend, hostId: hostId || undefined, mode: 'chat', cwd, sessionName: str(name) || undefined,
    model: modelPick.value || undefined, permissionMode: str(permission) || undefined, effort: effortPick.value || undefined,
    outputStyle: str(c.outputStyle) || undefined, autoResume: c.autoResume, extraArgs: str(d.extraArgs) || undefined,
    worktree: c.worktree || undefined,
    tools: c.tools && typeof c.tools === 'object' && !Array.isArray(c.tools) ? c.tools : undefined, // lane new-session-form: the 「可用工具」 pick (the spawn re-judges it)
    spawnOriginHint: { model: modelPick.origin, effort: effortPick.origin },
    resume: true, resumeId: conv.id, cols: 120, rows: 30, reqId: str(reqId) || undefined,
    taskId: str(taskId) || undefined,
    accountId: str(c.account) || undefined,
    modelLock: c.modelLock || undefined, lockModel: c.lockModel || undefined,
    poolPin: pin ? { memberId: pin.memberId, at: pin.at || null, ...(pin.poolId ? { poolId: pin.poolId } : {}) } : undefined,
  };
  return { ok: true, data, conversation: { backend: conv.backend, backendSessionId: conv.id, cwd, hostId: hostId || null, name: str(name) || null } };
}

module.exports = { REOPEN_CFG_KEYS, conversationOfKey, reopenCreate };
