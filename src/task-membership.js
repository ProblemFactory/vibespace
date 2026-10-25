'use strict';
/**
 * TASK GROUP MEMBERSHIP RULES (lane open-task-binds, the owner 2026-10-23 05:4x: «你最近建立的车道都不在 VibeSpace 车道
 * 这个组里») — PURE, imports nothing; the server (src/task-groups.js, src/server/conversation-ops.js) and the bundle
 * (src/lib/sidebar-tasks.js, src/lib/app.js) share it, so the owner's panel and the agent's `groupsForSession` read ONE rule.
 *
 *   folderOf(raw)              an auto-include folder record {path, recursive} | null. A legacy bare string is recursive. A
 *                              GLOB TAIL is the recursive switch written as text, never a folder name: `/x/**` (what the
 *                              agent context prints for a recursive folder, and what an agent then wrote back into the
 *                              store) ⇒ {path: '/x', recursive: true}. Trailing slashes go; '/' alone is no folder (as before).
 *   insideFolder(cwd, folder)  THE folder rule: a folder INCLUDES ITSELF (cwd === path); a recursive one also every path under
 *                              it — on a whole segment (`/x-old` is not inside `/x`). Every Task Group folder match calls it
 *                              (scripts/test-task-groups.mjs's census refuses a hand-rolled `startsWith(<folder>.path + '/')`).
 *   birthBindVerdict(s)        a conversation opened INTO a group (`_birthBind`, set by ws-create from the create's `taskId`):
 *                              {none} · {wait, why} until it has its OWN id (a fork's row carries its source's until adopted)
 *                              · {bind, groupId, groupIds} — the birth group is a MEMBERSHIP, written through the one bind
 *                              writer; `groupIds` = every group the create named (`taskIds`, the order picked; int346).
 *   membersWithout(list, keys, {exact})  THE unbind rule (lane task-group-fanout): a group's members (sessions[]) without
 *                              `keys` → { keep, gone }. A key `<backend>:<id>` matches itself; a BARE id (an older archive
 *                              list's spelling) matches any member with that id unless `exact`. The store's ONE unbind
 *                              writer and the archived-members migration's file road ask it.
 */

const GLOB_TAIL = /(?:\/\*{1,2})+\/*$/;

function folderOf(raw) {
  let p;
  let recursive = true;
  if (typeof raw === 'string') p = raw;
  else if (raw && typeof raw === 'object' && typeof raw.path === 'string') { p = raw.path; recursive = raw.recursive !== false; }
  else return null;
  p = p.trim();
  if (GLOB_TAIL.test(p)) { p = p.replace(GLOB_TAIL, ''); recursive = true; }
  p = p.replace(/\/+$/, '');
  return p ? { path: p, recursive: !!recursive } : null;
}

function insideFolder(cwd, folder) {
  const f = folderOf(folder);
  if (!f || typeof cwd !== 'string') return false;
  const c = cwd.length > 1 ? cwd.replace(/\/+$/, '') : cwd;
  if (!c) return false;
  if (c === f.path) return true;
  return f.recursive && c.startsWith(f.path + '/');
}

function birthBindVerdict(s) {
  const want = s && s._birthBind;
  if (!want || typeof want.groupId !== 'string' || !want.groupId) return { none: true };
  if (s._forkRequested) return { wait: true, why: 'fork-source-id' };
  if (!(s.backendSessionId || s.claudeSessionId)) return { wait: true, why: 'no-id-yet' };
  // int346: a create that named SEVERAL groups (new-session-form's `taskIds`) binds each, in the order picked
  const groupIds = [want.groupId];
  for (const g of Array.isArray(want.groupIds) ? want.groupIds : []) if (typeof g === 'string' && g && !groupIds.includes(g)) groupIds.push(g);
  return { bind: true, groupId: want.groupId, groupIds };
}

function membersWithout(list, keys, { exact = false } = {}) {
  const full = new Set(), bare = new Set();
  for (const k of Array.isArray(keys) ? keys : []) { const v = String(k == null ? '' : k); if (!v) continue; full.add(v); if (!exact && !v.includes(':')) bare.add(v); }
  const keep = [], gone = [];
  for (const k of Array.isArray(list) ? list : []) {
    const v = String(k);
    if (full.has(v) || (bare.size && bare.has(v.slice(v.indexOf(':') + 1)))) gone.push(k); else keep.push(k);
  }
  return { keep, gone };
}

module.exports = { folderOf, insideFolder, birthBindVerdict, membersWithout };
