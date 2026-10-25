'use strict';
/**
 * A BROADCAST CARRIES THE CHANGE, NEVER THE STORE (lane task-group-fanout, 2026-10-24) — PURE, imports nothing; the hub
 * (src/server/task-fanout.js, src/session-status.js) and the bundle (src/lib/sidebar-tasks.js and the windows that read
 * its mirror) share it. Measured on the owner's instance: every `vibespace-task progress` sent EVERY Task Group whole —
 * 1.57 MB of JSON to every connected client, 267 times a day — and every open Task Group window repainted for it.
 *
 *   sentOf(view)                   what a client holds of ONE group after a broadcast (the fields' JSON, the Activity log
 *                                  and the Backlog by id, the members) — the hub keeps one per group
 *   groupChange(sent, view, {deep}) → { change, sent } — ONE group's entry of a `tasks-updated` delta: `{ id, updatedAt,
 *                                  contentUpdatedAt, counts, patch }` (patch = only what changed: a field by its value,
 *                                  `progress` the entries added, `progressSet` the ones changed in place (a clear),
 *                                  `progressDropped` the ids that left the live list, `progressAll` when the order itself
 *                                  moved; `backlog` the items added / changed, `backlogRemoved`, `backlogOrder`; `sessions`
 *                                  added, `sessionsRemoved`; `unset` the fields that went) or change null (nothing moved).
 *                                  `deep: false` = the arrays are not compared (a group nobody wrote — its derived fields only)
 *   applyGroupPatch(group, change) → the group with the change applied (a NEW object; null when it cannot apply)
 *   applyTasksDelta(tasks, msg)    → { tasks, ids } | null (null = the mirror cannot take it: re-fetch)
 *   mirrorVerdict(mark, msg)       THE ORDER RULE of a broadcast mirror: 'hold' (not loaded yet — kept until the fetch
 *                                  lands) · 'drop' (already in it) · 'apply' (it follows exactly) · 'refetch' (a gap, another
 *                                  boot, or a delta too big to send)
 *   fetchVerdict(mark, answer)     a GET's answer over the mirror: 'replace' | 'drop' (a broadcast newer than it applied)
 *   frameStep(mark, msg, {replayed}) what the bundle's mirror DOES with a frame: 'apply' · 'drop' · 'hold' (+ a fetch when
 *                                  none is on its way) · 'refetch' (hold it, the mirror unloaded, fetch) · 'refresh' (a frame
 *                                  with no place in the order — a suite's synthetic one: fetch, keep nothing) · 'cover' (a
 *                                  REPLAYED frame that still does not follow: fetch, keep nothing — never held twice, no loop)
 *   touches(msg, id)               does this delta concern group `id` (a window of that group repaints only then)
 *   metaChanged(msg)               did anything but the Activity log / Backlog / clocks move (the board, the rosters)
 *   statusChange(prev, keys, statuses) / applyStatusDelta(map, msg) — `session-status-updated` as the changed keys only
 */

const ARRAYS = ['progress', 'backlog', 'sessions'];
// what an Activity line / a Backlog item / a clock moving leaves untouched: the board, the rosters, the pickers
const LOG_KEYS = new Set(['progress', 'progressSet', 'progressDropped', 'progressAll', 'backlog', 'backlogRemoved', 'backlogOrder', 'updatedAt', 'contentUpdatedAt', 'archiveClearedAt']);
// the patch keys that are list operations, never a field's value
const LIST_OPS = new Set(['progress', 'progressSet', 'progressDropped', 'progressAll', 'backlog', 'backlogRemoved', 'backlogOrder', 'sessions', 'sessionsRemoved', 'unset']);
const J = (v) => (v === undefined ? undefined : JSON.stringify(v));

function countsOf(view) {
  const bl = Array.isArray(view.backlog) ? view.backlog : [];
  return { open: bl.filter((b) => b && (b.status || 'open') === 'open').length, backlog: bl.length, progress: Array.isArray(view.progress) ? view.progress.length : 0, sessions: Array.isArray(view.sessions) ? view.sessions.length : 0 };
}

function byId(list) {
  const map = new Map(), order = [];
  for (const x of Array.isArray(list) ? list : []) { if (!x || typeof x.id !== 'string') continue; map.set(x.id, J(x)); order.push(x.id); }
  return { map, order };
}

function fieldsOf(view) {
  const fields = new Map();
  for (const k of Object.keys(view || {})) if (!ARRAYS.includes(k) && view[k] !== undefined) fields.set(k, J(view[k]));
  return fields;
}
/** What a client holds of one group after a broadcast. */
function sentOf(view) {
  return { fields: fieldsOf(view), progress: byId(view && view.progress), backlog: byId(view && view.backlog), sessions: (view && Array.isArray(view.sessions) ? view.sessions : []).slice() };
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function listPatch(prev, list) {
  const next = byId(list);
  const added = [], set = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || typeof x.id !== 'string') continue;
    const was = prev.map.get(x.id);
    if (was === undefined) added.push(x);
    else if (was !== next.map.get(x.id)) set.push(x);
  }
  const removed = prev.order.filter((id) => !next.map.has(id));
  // the order a client reaches by applying it: the kept ones in their old order, then the added ones in theirs
  const gone = new Set(removed), fresh = new Set(added.map((x) => x.id));
  const reached = prev.order.filter((id) => !gone.has(id)).concat(next.order.filter((id) => fresh.has(id)));
  return { added, set, removed, inOrder: sameList(reached, next.order), next };
}

/** ONE group's entry of a delta against what was sent; `deep: false` compares the fields only (the arrays kept). */
function groupChange(sent, view, { deep = true } = {}) {
  const fields = fieldsOf(view);
  const patch = {};
  const was = sent ? sent.fields : new Map();
  for (const [k, v] of fields) if (was.get(k) !== v) patch[k] = view[k];
  const unset = [...was.keys()].filter((k) => !fields.has(k));
  if (unset.length) patch.unset = unset;
  const out = { fields, progress: sent ? sent.progress : byId([]), backlog: sent ? sent.backlog : byId([]), sessions: sent ? sent.sessions : [] };
  if (deep || !sent) {
    const p = listPatch(out.progress, view.progress);
    if (!p.inOrder) patch.progressAll = (view.progress || []).slice();
    else {
      if (p.added.length) patch.progress = p.added;
      if (p.set.length) patch.progressSet = p.set;
      if (p.removed.length) patch.progressDropped = p.removed;
    }
    out.progress = p.next;
    const b = listPatch(out.backlog, view.backlog);
    if (b.added.length || b.set.length) patch.backlog = b.added.concat(b.set);
    if (b.removed.length) patch.backlogRemoved = b.removed;
    if (!b.inOrder) patch.backlogOrder = b.next.order;
    out.backlog = b.next;
    const had = new Set(out.sessions), has = new Set(Array.isArray(view.sessions) ? view.sessions : []);
    const add = [...has].filter((k) => !had.has(k)), rm = out.sessions.filter((k) => !has.has(k));
    if (add.length) patch.sessions = add;
    if (rm.length) patch.sessionsRemoved = rm;
    out.sessions = [...has];
  }
  if (!Object.keys(patch).length) return { change: null, sent: out };
  return { change: { id: view.id, updatedAt: view.updatedAt || 0, contentUpdatedAt: view.contentUpdatedAt || 0, counts: countsOf(view), patch }, sent: out };
}

function patchList(list, upserts, removed, order) {
  let out = (Array.isArray(list) ? list : []).slice();
  if (removed && removed.length) { const gone = new Set(removed); out = out.filter((x) => !(x && gone.has(x.id))); }
  for (const x of upserts || []) {
    const i = out.findIndex((y) => y && y.id === x.id);
    if (i >= 0) out[i] = x; else out.push(x);
  }
  if (order) { const at = new Map(out.map((x) => [x && x.id, x])); out = order.map((id) => at.get(id)).filter(Boolean); }
  return out;
}

/** The group with one change applied — a NEW object (the old one stays whole for whoever holds it); null when the
 *  change cannot be applied (a group the mirror never had, told only in part). */
function applyGroupPatch(group, change) {
  const p = (change && change.patch) || {};
  if (!group) {
    // a group the mirror does not hold: only a WHOLE one (its first broadcast carries every field) can be taken
    if (typeof p.title !== 'string' || p.createdAt === undefined) return null;
    group = { id: change.id, progress: [], backlog: [], sessions: [] };
  }
  const g = { ...group };
  for (const k of Object.keys(p)) {
    if (k === 'unset') { for (const u of p.unset) delete g[u]; continue; }
    if (!LIST_OPS.has(k)) g[k] = p[k];
  }
  if (p.progressAll) g.progress = p.progressAll.slice();
  else if (p.progress || p.progressSet || p.progressDropped) g.progress = patchList(g.progress, [...(p.progressSet || []), ...(p.progress || [])], p.progressDropped);
  if (p.backlog || p.backlogRemoved || p.backlogOrder) g.backlog = patchList(g.backlog, p.backlog, p.backlogRemoved, p.backlogOrder);
  if (p.sessions || p.sessionsRemoved) {
    const gone = new Set(p.sessionsRemoved || []);
    const list = (Array.isArray(g.sessions) ? g.sessions : []).filter((k) => !gone.has(k));
    for (const k of p.sessions || []) if (!list.includes(k)) list.push(k);
    g.sessions = list;
  }
  g.updatedAt = change.updatedAt; g.contentUpdatedAt = change.contentUpdatedAt;
  return g;
}

/** A `tasks-updated` delta over the mirror's list → { tasks (a new array, untouched groups the same objects), ids } or
 *  null (the mirror cannot take it — re-fetch). The list keeps the store's order (createdAt). */
function applyTasksDelta(tasks, msg) {
  if (!msg || msg.refetch) return null;
  const list = Array.isArray(tasks) ? tasks.slice() : [];
  const gone = new Set(Array.isArray(msg.removed) ? msg.removed : []);
  const ids = new Set(gone);
  let out = gone.size ? list.filter((t) => !gone.has(t.id)) : list;
  for (const ch of Array.isArray(msg.changed) ? msg.changed : []) {
    const i = out.findIndex((t) => t.id === ch.id);
    const g = applyGroupPatch(i >= 0 ? out[i] : null, ch);
    if (!g) return null;
    if (i >= 0) out[i] = g; else out.push(g);
    ids.add(ch.id);
  }
  out = out.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return { tasks: out, ids };
}

/** THE ORDER RULE of a broadcast mirror (the tasks mirror and the status mirror both). `mark` = { loaded, epoch, seq }
 *  of the mirror; a delta carries { epoch (the hub's boot), base (the seq it follows), seq }. */
function mirrorVerdict(mark, msg) {
  if (!mark || !mark.loaded) return 'hold';
  if (!msg || typeof msg.seq !== 'number' || typeof msg.epoch !== 'number') return 'refetch';
  if (msg.epoch < (mark.epoch || 0)) return 'drop';
  if (msg.epoch !== mark.epoch) return 'refetch';
  if (msg.seq <= mark.seq) return 'drop';
  if (msg.refetch) return 'refetch';
  return msg.base === mark.seq ? 'apply' : 'refetch';
}

/** A GET's answer `{ epoch, seq }` over the mirror: replace unless a broadcast NEWER than the answer is already in it
 *  (the `_tasksGen` rule, R4 verify r1, said in the hub's own order: a fetch never takes the mirror backwards). */
function fetchVerdict(mark, answer) {
  if (!answer) return 'drop';
  if (!mark || !mark.loaded) return 'replace';
  const ae = Number(answer.epoch) || 0, me = Number(mark.epoch) || 0;
  if (ae !== me) return ae > me ? 'replace' : 'drop';
  return (Number(answer.seq) || 0) >= (Number(mark.seq) || 0) ? 'replace' : 'drop';
}

function frameStep(mark, msg, { replayed = false } = {}) {
  if (!msg || typeof msg.seq !== 'number' || typeof msg.epoch !== 'number') return 'refresh';
  const v = mirrorVerdict(mark, msg);
  if (v === 'refetch') return replayed ? 'cover' : 'refetch';
  return v;
}

const touches = (msg, id) => !!msg && (!!msg.refetch || !Array.isArray(msg.changed) || (Array.isArray(msg.removed) && msg.removed.includes(id)) || msg.changed.some((c) => c && c.id === id));

function metaChanged(msg) {
  if (!msg || msg.refetch || !Array.isArray(msg.changed)) return true;
  if (Array.isArray(msg.removed) && msg.removed.length) return true;
  return msg.changed.some((c) => !c || !c.patch || Object.keys(c.patch).some((k) => !LOG_KEYS.has(k)));
}

/** `session-status-updated` as the changed keys only: { statuses: { key: record }, removed: [key] } — `keys` the keys a
 *  write touched, `statuses` the store's map after it. */
function statusChange(keys, statuses) {
  const out = { statuses: {}, removed: [] };
  for (const k of new Set(keys || [])) {
    if (statuses && Object.prototype.hasOwnProperty.call(statuses, k)) out.statuses[k] = statuses[k];
    else out.removed.push(k);
  }
  return out;
}
function applyStatusDelta(map, msg) {
  const out = { ...(map || {}) };
  for (const k of (msg && msg.removed) || []) delete out[k];
  for (const [k, v] of Object.entries((msg && msg.statuses) || {})) out[k] = v;
  return out;
}

module.exports = { sentOf, groupChange, applyGroupPatch, applyTasksDelta, mirrorVerdict, fetchVerdict, frameStep, touches, metaChanged, statusChange, applyStatusDelta };
