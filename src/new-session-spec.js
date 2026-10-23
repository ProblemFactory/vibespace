'use strict';
/**
 * PURE (imports nothing) — THE NEW SESSION FORM'S CREATE FACTS (lane new-session-form; the POC v2.2 report §«Product
 * changes this implies», items 1 and 4). What the two-column form sends beyond the old frame, judged ONCE for the page
 * (src/lib/new-session-form.js) and the hub (src/ws-create.js, src/server/boot-restore.js):
 *   spawnGroupIds(data) → [taskId…] — the Task Groups a new session joins, IN SELECTION ORDER: the form's `taskIds`
 *       list, else the old single `taskId` (an older page). Each id is checked against the id shape, duplicates are
 *       dropped, and at most SPAWN_GROUPS_MAX are kept. The first id stays the session-meta `taskId` that old pages read;
 *       the whole list rides beside it as `taskIds`.
 *   createAccessRow(cid) → the ONE access row a tick in 「账号 · 以你的身份」 writes for the new conversation:
 *       {principal:{kind:'agent', id:cid}, authority:'draft'} — the row the Channels window's Grant access… writes for
 *       one conversation (src/channel-filter.js validateAccessRow judges it; channel-acl's effective() reads it).
 *   withCreateAccess(access, cid) → the grain's whole access list with that row appended, in the shape the access route
 *       takes ({principal:{kind, id, name}, authority} — the stored authority, never a clamped one), or null when the
 *       conversation already holds a row there: never a duplicate principal, never a narrowing of a row the person wrote.
 */
const TASK_ID_RE = /^T-[\w-]{1,60}$/;
const SPAWN_GROUPS_MAX = 16;
const isStr = (v) => typeof v === 'string';

function spawnGroupIds(data) {
  const d = data && typeof data === 'object' ? data : {};
  const raw = Array.isArray(d.taskIds) ? d.taskIds : (isStr(d.taskId) ? [d.taskId] : []);
  const out = [];
  for (const id of raw) {
    if (!isStr(id) || !TASK_ID_RE.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= SPAWN_GROUPS_MAX) break;
  }
  return out;
}

function createAccessRow(cid) {
  const id = isStr(cid) ? cid.trim() : '';
  return id ? { principal: { kind: 'agent', id }, authority: 'draft' } : null;
}

function withCreateAccess(access, cid) {
  const row = createAccessRow(cid);
  if (!row) return null;
  const rows = (Array.isArray(access) ? access : []).filter((x) => x && x.principal && isStr(x.principal.kind));
  if (rows.some((x) => x.principal.kind === 'agent' && String(x.principal.id) === row.principal.id)) return null;
  return [
    ...rows.map((x) => ({ principal: { kind: x.principal.kind, id: x.principal.id, ...(x.principal.name ? { name: x.principal.name } : {}) }, authority: x.authorityStored || x.authority || 'draft' })),
    row,
  ];
}

module.exports = { TASK_ID_RE, SPAWN_GROUPS_MAX, spawnGroupIds, createAccessRow, withCreateAccess };
