// THE PRINCIPAL PICKER'S ARITHMETIC (2026-09-27, lane channel-polish — the
// owner: "如果 session 特别多的话，你现在的那个选择 session/group 的 dropdown
// 交互会很不友好"). Every place a person picks an agent session or a Task
// Group — Grant access…, Notify…, Reach & policy's "Grant reach to…", a
// group's New group / Invite…, a desktop-app window's Share with agents /
// Ask an agent — draws ONE picker (src/lib/principal-picker.js) over this
// PURE module (imports only the PURE avatar rule — ONE initials
// implementation, re-exported as `initialsOf` for a chip):
//
//  · A ROW = `{key, kind: 'agent'|'group', id, name, folder, backend, live,
//    groupIds: [], groupNames: [], hint, disabled}` — the caller's roster
//    mapped once; `key` is the caller's own value (the wire never changes).
//  · FILTER: every whitespace-separated token of the query must match the
//    row — a substring of its name, folder, Task Group name(s) or backend, or
//    a PREFIX of its id — case- and accent-insensitive (NFKD, marks
//    dropped), CJK by substring. RANK: name prefix < a word of the name
//    starting with it < name substring < a Task Group's name < the folder <
//    the backend < an id prefix; ties keep the roster's order.
//  · GROUP: "Task Groups" first (the group principals), then "Sessions" —
//    each session under its (first) Task Group, sorted by title, then
//    "Other" (no Task Group).
//  · RECENT: the keys this device picked last (newest first, ≤ 8) pinned on
//    top as their own section when they match.
//  · KEYBOARD: `moveActive` walks the visible, enabled keys (↑/↓, clamped).
//  · ALL AGENTS (lane everyone-principal, 2026-10-02 — the owner: "所有配置权限的地方都加入"所有"这个选项"): a row of
//    kind `everyone` (`everyoneRow`) is THE principal "every conversation, now and later". It is the FIRST row of the
//    list (its own section, above Recent), a query never hides it, it is never a recent pick, its chip comes first,
//    and Enter's first-row fallback never lands on it (`armableFirst`) — it is picked by a click, or highlighted with
//    ↑ / ↓ and then Enter. The caller maps it to its own model's spelling (a list model stores `{kind:'everyone',
//    id:'*'}`; exit reach's `everyone` mode and a browser profile's `all` are the same row — never a second spelling).

export { initialsOf } from './channel-avatar.js';

export const RECENT_MAX = 8;
/** The principal kinds a row may be (`everyone` = every conversation, now and later). */
export const PRINCIPAL_KINDS = Object.freeze(['everyone', 'group', 'agent']);
export const EVERYONE_KIND = 'everyone';
/** The ONE id of the everyone principal in every list model (`{kind:'everyone', id:'*'}`). */
export const EVERYONE_ID = '*';
export const isEveryone = (row) => !!row && row.kind === EVERYONE_KIND;

/** THE ALL-AGENTS ROW — `key` = the caller's wire value for it; `name` / `hint` the caller's words (the device's
 *  language: "All agents" / "every conversation, now and later"). Never disabled (a greyed All row is the hint the
 *  owner's rule forbids — a surface that cannot grant everyone does not offer the row at all). */
export function everyoneRow({ key = 'everyone:*', name = 'All agents', hint = '' } = {}) {
  return { key: String(key), kind: EVERYONE_KIND, id: EVERYONE_ID, name: String(name || 'All agents'), hint: String(hint || ''), groupIds: [], groupNames: [] };
}

/** A row's IDENTITY — `agent:<id>` / `group:<id>` / `everyone:*` — what the recent list remembers across every dialog
 *  (each caller's `key` is its own wire value). */
export function identityOf(row) {
  if (isEveryone(row)) return `${EVERYONE_KIND}:${EVERYONE_ID}`;
  return `${row && row.kind === 'group' ? 'group' : 'agent'}:${row && row.id != null ? row.id : ''}`;
}

/** Case- and accent-insensitive form of a string (NFKD, combining marks dropped, lowercased). */
export function foldText(s) {
  return String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const tokensOf = (q) => foldText(q).trim().split(/\s+/).filter(Boolean).slice(0, 8);

/** The rank of ONE token against ONE row (lower = better), or -1 when it does not match. */
function tokenRank(row, tok) {
  const name = foldText(row.name);
  if (name.startsWith(tok)) return 0;
  if (name.split(/[\s\-_.·/:]+/).some((w) => w && w.startsWith(tok))) return 1;
  if (name.includes(tok)) return 2;
  if ((row.groupNames || []).some((g) => foldText(g).includes(tok))) return 3;
  if (foldText(row.folder).includes(tok)) return 4;
  if (foldText(row.backend).includes(tok)) return 5;
  if (foldText(row.id).startsWith(tok)) return 6;
  return -1;
}

/** The rows the query keeps, best first (ties keep the roster's order). An empty query keeps every row, in order.
 *  The ALL-AGENTS row is never filtered out and always comes first — a search narrows the named rows only. */
export function filterPrincipals(roster, query) {
  const all = Array.isArray(roster) ? roster.filter((r) => r && r.key != null) : [];
  const head = all.filter(isEveryone);
  const rows = all.filter((r) => !isEveryone(r));
  const toks = tokensOf(query);
  if (!toks.length) return [...head, ...rows];
  const scored = [];
  rows.forEach((row, i) => {
    let score = 0;
    for (const tok of toks) { const r = tokenRank(row, tok); if (r < 0) return; score += r; }
    scored.push({ row, score, i });
  });
  scored.sort((a, b) => a.score - b.score || a.i - b.i);
  return [...head, ...scored.map((x) => x.row)];
}

/** THE SECTIONS: `[{key, kind: 'everyone'|'groups'|'sessions-group'|'sessions-other', title?, rows}]`, empty ones
 *  dropped — the All-agents row first, in its own section. The order of `rows` inside a section is the order it
 *  arrived in (a filter's rank). */
export function groupPrincipals(rows) {
  const everyone = [], groups = [], byTg = new Map(), other = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue;
    if (isEveryone(r)) { everyone.push(r); continue; }
    if (r.kind === 'group') { groups.push(r); continue; }
    const gid = Array.isArray(r.groupIds) && r.groupIds.length ? String(r.groupIds[0]) : null;
    if (gid === null) { other.push(r); continue; }
    if (!byTg.has(gid)) byTg.set(gid, { key: `tg:${gid}`, kind: 'sessions-group', id: gid, title: (Array.isArray(r.groupNames) && r.groupNames[0]) || gid, rows: [] });
    byTg.get(gid).rows.push(r);
  }
  const out = [];
  if (everyone.length) out.push({ key: 'everyone', kind: 'everyone', rows: everyone });
  if (groups.length) out.push({ key: 'groups', kind: 'groups', rows: groups });
  const tgs = [...byTg.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));
  out.push(...tgs);
  if (other.length) out.push({ key: 'other', kind: 'sessions-other', rows: other });
  return out;
}

/** Split rows into the RECENT ones (in recency order) and the rest (in their own order). The All-agents row is never
 *  a recent pick (it is always first already). */
export function rankRecent(rows, recentKeys) {
  const list = Array.isArray(rows) ? rows : [];
  const byKey = new Map(list.map((r) => [String(r.key), r]));
  const recent = [];
  for (const k of Array.isArray(recentKeys) ? recentKeys : []) { const r = byKey.get(String(k)); if (r && !isEveryone(r) && !recent.includes(r)) recent.push(r); }
  const set = new Set(recent);
  return { recent, rest: list.filter((r) => !set.has(r)) };
}

/** The recent list after picking `key`: it moves to the front, the list stays ≤ RECENT_MAX. */
export function pushRecent(recentKeys, key, max = RECENT_MAX) {
  const k = String(key);
  return [k, ...(Array.isArray(recentKeys) ? recentKeys.map(String) : []).filter((x) => x !== k)].slice(0, max);
}

/**
 * WHAT ENTER PICKS (verify round 3, 2026-09-27). Enter picked "the highlighted row, else the first visible row" — and
 * the first visible row is whatever the LAST redraw put there: the person typed "pag" and saw pager-01 first, pager-01's
 * session died, the roster broadcast patched the list in place, and Enter granted ACCESS to pager-02, a principal they
 * never saw. So the first-row fallback is ARMED by the person's own act only (typing, ↑ ↓, a pick — `armedFirst` = the
 * first row they were shown), and Enter takes it only while that row is still first; a roster patch that moved another
 * row to the top disarms it — Enter picks nothing until the person acts again. A highlighted row (↑ ↓) is taken as
 * itself wherever the patch left it (kept by KEY; gone ⇒ nothing). The keyboard arithmetic is unchanged: nothing is
 * highlighted until ↓ / ↑, so "↓ ↓ Enter" is still the second row.
 */
export function enterTarget({ active = null, visibleKeys = [], armedFirst = null, skip = [] } = {}) {
  const keys = Array.isArray(visibleKeys) ? visibleKeys.map(String) : [];
  if (active != null && keys.includes(String(active))) return String(active);
  // "still first" = still the first ARMABLE row: the All-agents row (`skip`) sits above every list and is never armed
  // (lane everyone-principal — without `skip` the armed row could never be first again and Enter picked nothing)
  const first = armableFirst(keys, skip);
  if (armedFirst != null && first != null && first === String(armedFirst)) return first;
  return null;
}

/** The row Enter's fallback ARMS after the person's own redraw: the first visible key that is not the All-agents row
 *  (`everyoneKeys` — the keys of the `everyone` rows). Typing "pag" and pressing Enter picks the first MATCH, never
 *  "every conversation"; All is picked by a click, or by ↑ / ↓ then Enter (the highlighted-row rule). */
export function armableFirst(visibleKeys, everyoneKeys = []) {
  const skip = new Set((Array.isArray(everyoneKeys) ? everyoneKeys : []).map(String));
  for (const k of Array.isArray(visibleKeys) ? visibleKeys : []) if (!skip.has(String(k))) return String(k);
  return null;
}

/** The chips in the order they are drawn: the All-agents chip first, then the picks in the order they were made. */
export function chipOrder(selected, everyoneKeys = []) {
  const skip = new Set((Array.isArray(everyoneKeys) ? everyoneKeys : []).map(String));
  const sel = (Array.isArray(selected) ? selected : []).map(String);
  return [...sel.filter((k) => skip.has(k)), ...sel.filter((k) => !skip.has(k))];
}

/** The next active key for ↑ (delta −1) / ↓ (+1) over the visible keys; clamped; none active ⇒ the first / last.
 *  `skip` (the All-agents keys): the FIRST ↓ lands on the first row that is not All — typing "pag" then ↓ highlights a
 *  match; All is one ↑ above it (the walk itself never skips it). */
export function moveActive(keys, active, delta, { skip = [] } = {}) {
  const list = Array.isArray(keys) ? keys : [];
  if (!list.length) return null;
  const i = list.indexOf(active);
  if (i < 0) { if (delta < 0) return list[list.length - 1]; const f = armableFirst(list, skip); return f != null ? f : list[0]; }
  return list[Math.max(0, Math.min(list.length - 1, i + (delta < 0 ? -1 : 1)))];
}

/** The last segment of a folder path ("…/work/api" → "api"); a host label "box: /a/b" keeps its host. */
export function folderTail(cwd) {
  const s = String(cwd == null ? '' : cwd).trim();
  if (!s) return '';
  const m = s.match(/^([^/:]+):\s*(\/.*)$/);
  const host = m ? m[1] : '';
  const p = (m ? m[2] : s).replace(/\/+$/, '');
  const tail = p.split('/').filter(Boolean).pop() || p || '/';
  return host ? `${host}: ${tail}` : tail;
}
