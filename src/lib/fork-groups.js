// A FORK LANDS IN ITS SOURCE'S TASK GROUPS — PURE (imports nothing, DOM-free).
//
// 2026-09-25, owner: "fork的会话不会自动分配到和fork之前的会话相同的group里".
// `_doForkSession` called createSession with no `taskId`, so the branch of a
// conversation that sat in a Task Group (岗位) was spawned into NO group: no
// server-side `_initialGroupId` (so `groupsForSession` — the task context the
// agent reads over its VIBESPACE_SESSION_TOKEN — named no group until a bind
// landed), and no explicit tag once its id appeared —
// the fork showed up untagged and the owner re-bound it by hand. A membership
// that came only from an auto-include FOLDER already carried over (same cwd);
// every EXPLICIT tag was lost.
//
// Two decisions live here so the three fork entry points (the card's Fork…,
// the chat's fork-at-message, the terminal-mode fork) share ONE spelling:
//
// ① forkGroupPlan(sourceGroups) — which groups the fork is spawned into.
//    `sourceGroups` are the sidebar store's Task Group rows the SOURCE is
//    explicitly tagged with (`_getSessionTasks`, the raw store — never the
//    DOM). The first live group rides the spawn as `taskId` (ws-create's
//    `_initialGroupId` + the session-meta `taskId`, so the task context is
//    right from the first turn; no spawn ENV carries it — VIBESPACE_TASK_ID
//    has had no producer since the Task refactor P2);
//    the rest are PENDING binds, written once the fork's own id appears.
//    Archived groups are skipped (a fork is a NEW conversation; an archived
//    group is closed, and the server's groupsForSession ignores it anyway).
//    Duplicates and ids outside the server's `T-…` shape are dropped (the
//    server refuses such a `taskId` silently — ws-create's validation).
//
// ② pendingBindVerdict(entry, live) — when a pending bind may be written.
//    A claude fork resumes the PARENT's id (`--fork-session`) and a codex
//    fork its parent's thread id: until the harness announces the fork's own
//    id (chat: the stream parser; a TERMINAL fork: the lock capture,
//    src/claude-lock-capture.js), the live row's backendSessionId IS THE
//    SOURCE'S. Binding then would
//    tag the parent (a no-op — it is already a member) and consume the entry,
//    so the fork itself would never be tagged. An entry therefore carries the
//    id it must NOT bind (`notId`, the fork source) and waits past it. A plain
//    new-session-in-group entry has `notId: null` and binds on the first id,
//    exactly as before. An entry whose session was LISTED and then left the
//    live list (the fork died before its own id appeared) is dropped at once
//    — `seen` — instead of waiting for the >20 cap sweep.

export const TASK_ID_RE = /^T-[\w-]{1,60}$/;
export const PENDING_BIND_CAP = 20; // the sweep threshold _processPendingTaskBinds always had

/** @param {Array<object|string>} sourceGroups  Task Group rows (or bare ids)
 *  the fork's SOURCE is explicitly tagged with, in store order.
 *  @returns {{taskId: string|null, pendingBinds: string[]}} */
export function forkGroupPlan(sourceGroups) {
  const ids = [];
  for (const g of Array.isArray(sourceGroups) ? sourceGroups : []) {
    if (!g) continue;
    if (typeof g === 'object' && g.archived) continue;
    const id = typeof g === 'string' ? g : g.id;
    if (typeof id !== 'string' || !TASK_ID_RE.test(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  return { taskId: ids[0] || null, pendingBinds: ids.slice(1) };
}

/** Merge new task ids into a pending entry (a second registration for the
 *  same webuiId ADDS, never replaces — the old one-slot Map replaced).
 *  @returns {{taskIds: string[], notId: string|null}|null} */
export function mergePendingBind(prev, taskIds, notId = null) {
  const add = (Array.isArray(taskIds) ? taskIds : [taskIds]).filter((id) => typeof id === 'string' && id);
  const merged = [...(prev?.taskIds || [])];
  for (const id of add) if (!merged.includes(id)) merged.push(id);
  if (!merged.length) return prev || null;
  return { taskIds: merged, notId: (notId ? String(notId) : null) || prev?.notId || null, ...(prev?.seen ? { seen: true } : {}) };
}

/** @param {{taskIds: string[], notId: string|null}} entry
 *  @param {object|undefined} live  the active-sessions row for the entry's webuiId
 *  @returns {{wait: true, why: string} | {wait: false, drop: true, why: 'gone'} | {wait: false, sessionKey: string, taskIds: string[]}} */
export function pendingBindVerdict(entry, live) {
  if (!live) return entry?.seen ? { wait: false, drop: true, why: 'gone' } : { wait: true, why: 'not-listed' };
  const bsid = live.backendSessionId || live.claudeSessionId || '';
  if (!bsid) return { wait: true, why: 'no-id' };
  if (entry?.notId && bsid === entry.notId) return { wait: true, why: 'fork-source-id' };
  return { wait: false, sessionKey: `${live.backend || 'claude'}:${bsid}`, taskIds: [...(entry?.taskIds || [])] };
}

/** Which pending entries to drop: only past the cap, and only those whose
 *  session is gone from the live list (a live fork waiting for its first
 *  input keeps its entry however long that takes). */
export function sweepPendingBinds(webuiIds, liveIds, cap = PENDING_BIND_CAP) {
  const ids = [...(webuiIds || [])];
  if (ids.length <= cap) return [];
  const live = new Set(liveIds || []);
  return ids.filter((id) => !live.has(id));
}
