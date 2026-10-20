'use strict';
/**
 * PURE (imports nothing) — WHAT ANOTHER PROGRAM MAY ASK OF A CONVERSATION (lane automation-verbs, design q-046 §2
 * 「动词实现」 / §4 L2; the owner's directive 2026-10-19: VibeSpace's own API for what the coordinator does — open, name,
 * bind, end a worker conversation, invite it to a group). src/server/conversation-ops.js asks these verdicts BEFORE it
 * runs a verb for anyone but the owner's own window: the owner's ws frames (the New-session dialog, the sidebar's rename,
 * Terminate) are never judged here — their behaviour is byte-identical — while an automation's open spec is CLOSED: only
 * these fields cross to the create path, each refusal NAMED. A resume, a fork, a remote host or extra CLI arguments are
 * not an automation's to ask for (none is in FIELDS).
 *   openSpecVerdict(spec, tables) → {ok: true, spec} | {ok: false, code, field, why}
 *       tables = {backends: [ids], chatBackends: [ids], byBackend: {<id>: {models, modelFree, efforts, effortFree,
 *       permissionModes}}} — the harness registry + its spawn rows (src/harness-settings.js), handed in by the ORCH caller
 *   nameVerdict(name) · taskIdVerdict(id) · groupVerdict(ref) · targetVerdict(target) · membersVerdict(list)
 *   byVerdict(by) → {ok: true, by} | refusal — WHO asks: {kind: 'human', actBy} (a browser sign-in, ws._actBy) ·
 *       {kind: 'agent', cid} (a conversation's own route) · {kind: 'automation', key, keyName?, subject, cid?, sessionKey?}
 *   actByOf(by) — the device-audit subject (src/device-acts.js: human: / agent: / system:) a verb's device acts carry
 *   spendIdentityOf(by) — the identity an automation's billed verb is charged to (the KEY — design §1 summary 7)
 *   wireOf(spec) — the create frame's fields for a judged spec (spawnOriginHint says a model / effort was CHOSEN)
 */

const NAME_MAX = 60;
const CWD_MAX = 4096;
const MODES = Object.freeze(['chat', 'terminal']);
const FIELDS = Object.freeze(['backend', 'mode', 'cwd', 'name', 'model', 'effort', 'permissionMode', 'taskId', 'accountId']);
const BY_KINDS = Object.freeze(['human', 'agent', 'automation']);
const SUBJECT_RE = /^(?:session:[A-Za-z0-9][A-Za-z0-9._-]{0,127}|group:T-[A-Za-z0-9][A-Za-z0-9-]{0,95}|external)$/;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:\-[\]]{0,79}$/;
const EFFORT_RE = /^[a-z][a-z0-9-]{0,23}$/;
const TASK_RE = /^T-[A-Za-z0-9][A-Za-z0-9-]{0,95}$/;
const ACCOUNT_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const WEBUI_RE = /^sess-[A-Za-z0-9_-]{1,80}$/;
const KEY_RE = /^[a-z][a-z0-9-]{0,23}:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const HIDDEN_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/;
const MEMBERS_MAX = 20;
const GROUP_MAX = 80;

const no = (code, field, why) => ({ ok: false, code, field, why });
const isStr = (v) => typeof v === 'string';
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const list = (v) => (Array.isArray(v) ? v.filter(isStr) : []);

/** A conversation's name: trimmed, 1..NAME_MAX characters, no control / bidi / zero-width characters. */
function nameVerdict(name) {
  if (!isStr(name)) return no('bad_name', 'name', 'a name is a string');
  const n = name.trim();
  if (!n) return no('bad_name', 'name', 'the name is empty');
  if ([...n].length > NAME_MAX) return no('bad_name', 'name', `a name is at most ${NAME_MAX} characters`);
  if (HIDDEN_RE.test(n)) return no('bad_name', 'name', 'a name holds no control, bidi or zero-width characters');
  return { ok: true, name: n };
}
/** A Task Group id (`T-<yymmdd>-<slug>`, src/task-groups.js _genId). */
function taskIdVerdict(id) {
  return isStr(id) && TASK_RE.test(id) ? { ok: true, taskId: id } : no('bad_task', 'taskId', 'a Task Group id looks like T-261002-vibespace');
}
/** An agent group: its id (g-…) or its name, as `vibespace-msg` takes it. */
function groupVerdict(ref) {
  if (!isStr(ref) || !ref.trim()) return no('bad_group', 'group', 'name the group by its id (g-…) or its name');
  const g = ref.trim();
  if ([...g].length > GROUP_MAX || HIDDEN_RE.test(g)) return no('bad_group', 'group', `a group reference is at most ${GROUP_MAX} plain characters`);
  return { ok: true, group: g };
}
/** WHICH conversation a verb acts on: exactly one of {webuiId} (the live session's id, sess-…) or {sessionKey}
 *  (`<backend>:<conversation id>`, the key the sidebar, the Task Groups and For you use). */
function targetVerdict(t) {
  const o = t && typeof t === 'object' ? t : {};
  const w = isStr(o.webuiId) && o.webuiId ? o.webuiId : null;
  const k = isStr(o.sessionKey) && o.sessionKey ? o.sessionKey : null;
  if (!w === !k) return no('bad_target', 'target', 'name the conversation by exactly one of webuiId (sess-…) or sessionKey (<backend>:<id>)');
  if (w && !WEBUI_RE.test(w)) return no('bad_target', 'webuiId', 'a webuiId looks like sess-<n>-<ms>');
  if (k && !KEY_RE.test(k)) return no('bad_target', 'sessionKey', 'a sessionKey looks like claude:<conversation id>');
  return { ok: true, target: w ? { webuiId: w } : { sessionKey: k } };
}
/** Whom an invite names: 1..MEMBERS_MAX sessions, each a session name, a conversation id or a sessionKey (its id is
 *  what the groups engine resolves). */
function membersVerdict(members) {
  const raw = Array.isArray(members) ? members : [members];
  const out = [];
  for (const m of raw) {
    if (!isStr(m) || !m.trim() || [...m].length > 160 || HIDDEN_RE.test(m)) return no('bad_member', 'members', 'each member is a session name, a conversation id or a sessionKey');
    const s = m.trim();
    const k = KEY_RE.test(s) && !s.startsWith('webui:') ? s.slice(s.indexOf(':') + 1) : s;
    if (!out.includes(k)) out.push(k);
  }
  if (!out.length) return no('bad_member', 'members', 'name at least one session to invite');
  if (out.length > MEMBERS_MAX) return no('bad_member', 'members', `at most ${MEMBERS_MAX} members per invite`);
  return { ok: true, members: out };
}

/** The OPEN SPEC (closed): backend ∈ the harness registry (default claude), mode chat | terminal (default chat — a chat
 *  needs a chat harness), cwd an absolute path, name per nameVerdict, model / effort / permissionMode from the backend's
 *  spawn rows (a combobox row takes any well-formed value, an enum row only its options; a backend without the row takes
 *  none — except a model, which the adapter passes as given), taskId per taskIdVerdict, accountId an account / pool id. */
function openSpecVerdict(spec, tables) {
  const s = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : null;
  if (!s) return no('bad_spec', null, 'the open spec is an object');
  for (const k of Object.keys(s)) if (!FIELDS.includes(k)) return no('unknown_field', k, `"${k}" is not a field of an open (${FIELDS.join(', ')})`);
  const T = tables && typeof tables === 'object' ? tables : {};
  const backends = list(T.backends);
  const backend = has(s, 'backend') && s.backend !== undefined ? s.backend : 'claude';
  if (!isStr(backend) || !backends.includes(backend)) return no('bad_backend', 'backend', `the backend is one of ${backends.join(', ') || '(none registered)'}`);
  const mode = has(s, 'mode') && s.mode !== undefined ? s.mode : 'chat';
  if (!MODES.includes(mode)) return no('bad_mode', 'mode', 'the mode is chat or terminal');
  if (mode === 'chat' && Array.isArray(T.chatBackends) && !T.chatBackends.includes(backend)) return no('bad_mode', 'mode', `${backend} has no chat mode`);
  const cwd = s.cwd;
  if (!isStr(cwd) || !cwd.startsWith('/') || cwd.length > CWD_MAX || /\0/.test(cwd) || HIDDEN_RE.test(cwd)) return no('bad_cwd', 'cwd', 'the cwd is an absolute path');
  const out = { backend, mode, cwd };
  if (has(s, 'name') && s.name !== undefined) { const n = nameVerdict(s.name); if (!n.ok) return n; out.name = n.name; }
  const row = (T.byBackend && T.byBackend[backend]) || {};
  if (has(s, 'model') && s.model !== undefined) {
    const known = list(row.models);
    if (!isStr(s.model) || !(known.includes(s.model) || (row.modelFree !== false && MODEL_RE.test(s.model)))) return no('bad_model', 'model', known.length ? `the model is one of ${known.join(', ')}${row.modelFree !== false ? ' or a model id' : ''}` : 'the model is a model id');
    out.model = s.model;
  }
  if (has(s, 'effort') && s.effort !== undefined) {
    const known = list(row.efforts);
    if (!isStr(s.effort) || !(known.includes(s.effort) || (row.effortFree === true && EFFORT_RE.test(s.effort)))) return no('bad_effort', 'effort', known.length || row.effortFree ? `the effort is one of ${known.join(', ')}${row.effortFree ? ' or a level word (xhigh)' : ''}` : `${backend} takes no effort`);
    out.effort = s.effort;
  }
  if (has(s, 'permissionMode') && s.permissionMode !== undefined) {
    const known = list(row.permissionModes);
    if (!isStr(s.permissionMode) || !known.includes(s.permissionMode)) return no('bad_permission_mode', 'permissionMode', known.length ? `the permission mode is one of ${known.join(', ')}` : `${backend} takes no permission mode`);
    out.permissionMode = s.permissionMode;
  }
  if (has(s, 'taskId') && s.taskId !== undefined) { const t = taskIdVerdict(s.taskId); if (!t.ok) return t; out.taskId = t.taskId; }
  if (has(s, 'accountId') && s.accountId !== undefined) {
    if (!isStr(s.accountId) || !ACCOUNT_RE.test(s.accountId)) return no('bad_account', 'accountId', 'the account is an account or pool id (pool-…, subscription)');
    out.accountId = s.accountId;
  }
  return { ok: true, spec: out };
}

/** WHO asks. A verb's every journal / audit line names this caller (actByOf). */
function byVerdict(by) {
  const b = by && typeof by === 'object' && !Array.isArray(by) ? by : null;
  if (!b || !BY_KINDS.includes(b.kind)) return no('bad_by', 'by', `the caller is one of ${BY_KINDS.join(', ')}`);
  if (b.kind === 'human') return { ok: true, by: { kind: 'human', actBy: isStr(b.actBy) && /^human:/.test(b.actBy) ? b.actBy : null } };
  if (b.kind === 'agent') return isStr(b.cid) && CID_RE.test(b.cid) ? { ok: true, by: { kind: 'agent', cid: b.cid } } : no('bad_by', 'cid', "an agent caller names its conversation id");
  if (!isStr(b.key) || !ID_RE.test(b.key)) return no('bad_by', 'key', 'an automation caller names the key it uses');
  if (!isStr(b.subject) || !SUBJECT_RE.test(b.subject)) return no('bad_by', 'subject', 'an automation subject is session:<id>, group:<taskId> or external');
  const out = { kind: 'automation', key: b.key, keyName: isStr(b.keyName) && b.keyName && !HIDDEN_RE.test(b.keyName) ? b.keyName.slice(0, 80) : null, subject: b.subject };
  if (b.cid !== undefined && b.cid !== null) { if (!isStr(b.cid) || !CID_RE.test(b.cid)) return no('bad_by', 'cid', 'the calling conversation id is malformed'); out.cid = b.cid; }
  if (b.sessionKey !== undefined && b.sessionKey !== null) { if (!isStr(b.sessionKey) || !KEY_RE.test(b.sessionKey)) return no('bad_by', 'sessionKey', 'the calling sessionKey is malformed'); out.sessionKey = b.sessionKey; }
  return { ok: true, by: out };
}
/** The device-audit subject of a caller: the sign-in's `human:<handle>`, the conversation's `agent:<sessionKey>` (an
 *  automation call names the conversation that made it — its KEY is the automation audit's column), or for a caller
 *  with no conversation (an external key, later) `system:automation-<keyId>`; null = the path's own default. */
function actByOf(by) {
  if (!by || typeof by !== 'object') return null;
  if (by.kind === 'human') return isStr(by.actBy) ? by.actBy : null;
  if (by.kind === 'agent') return isStr(by.cid) && by.cid ? `agent:claude:${by.cid}` : null;
  if (by.kind === 'automation') return isStr(by.sessionKey) && by.sessionKey ? `agent:${by.sessionKey}` : (isStr(by.key) ? `system:automation-${by.key}` : null);
  return null;
}
/** The identity a billed automation verb is charged to — the KEY (design §1 summary 7: 身份 = 持有授权的 key). */
function spendIdentityOf(by) {
  if (!by || by.kind !== 'automation' || !isStr(by.key) || !by.key) return null;
  return { key: `automation:${by.key}`, name: by.keyName ? `automation key «${by.keyName}»` : `automation key ${by.key}` };
}
/** The create frame's fields for a JUDGED spec (the frame the owner's dialog would send for the same choices). The name
 *  rides `sessionName` — the field src/ws-create.js reads and the New session dialog sends (B-dbba, lane
 *  automation-open-permission-resolve: as `name` it was ignored, and the worker opened as «Session N» until a separate
 *  rename); the conversation then carries it from its create (session.name, nameExplicit, the `created` answer). */
function wireOf(spec) {
  const s = spec || {};
  const w = { backend: s.backend, mode: s.mode, cwd: s.cwd };
  if (s.name !== undefined) w.sessionName = s.name;
  for (const k of ['model', 'effort', 'permissionMode', 'taskId', 'accountId']) if (s[k] !== undefined) w[k] = s[k];
  const hint = {};
  if (s.model !== undefined) hint.model = 'chosen';
  if (s.effort !== undefined) hint.effort = 'chosen';
  if (Object.keys(hint).length) w.spawnOriginHint = hint;
  return w;
}

module.exports = {
  NAME_MAX, MODES, FIELDS, BY_KINDS, MEMBERS_MAX,
  openSpecVerdict, nameVerdict, taskIdVerdict, groupVerdict, targetVerdict, membersVerdict, byVerdict, actByOf, spendIdentityOf, wireOf,
};
