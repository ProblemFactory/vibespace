/**
 * user-todos-layout.js — PURE (imports nothing, DOM-free): the "For you"
 * popup's row ORDER while it is open.
 *
 * inc-mtw02kbq-kj96 (owner, 2026-09-10): "inbox里点击对勾后改变了这个对话的
 * 消息数量会导致位置变化，当我想连续点击时造成误点". Every ✓ triggers a
 * `user-todos-updated` broadcast, the popup re-rendered from scratch, the
 * resolved row LEFT its group, and the rows below slid up under the pointer —
 * four rapid clicks at one screen position resolved four different items.
 *
 * Rule: while the popup is open its layout is APPEND-ONLY. A row keeps its
 * slot until the popup closes: resolved in place (dimmed, with ↺), never
 * removed; a group whose rows are all resolved keeps its slot too; new rows
 * append at the END of their group and a new group at the END of the list.
 * The ordinary sorted layout is rebuilt on the next open.
 *
 *   openLayout(sortedGroups)      — from the panel's own sorted [[key, items]]
 *   nextLayout(layout, todos)     — after a broadcast: keep, append, purge
 *   entriesFor(layout, todos)     — [{key, entries:[{item, resolved}], openCount}]
 */

/** @param {Array<[string, Array<{id:string}>]>} sortedGroups */
export function openLayout(sortedGroups) {
  return { groups: sortedGroups.map(([key, items]) => ({ key, ids: items.map((i) => i.id) })) };
}

/**
 * Keep every id still known to the store (open OR resolved) in its slot;
 * append open ids the layout has not seen; drop ids the store no longer has.
 * @param {{groups:Array<{key:string, ids:string[]}>}} layout
 * @param {{open:Array<{id:string, sessionKey:string}>, resolved:Array<{id:string}>}} todos
 */
export function nextLayout(layout, todos) {
  const open = new Map((todos.open || []).map((i) => [i.id, i]));
  const known = new Set([...open.keys(), ...(todos.resolved || []).map((i) => i.id)]);
  const seen = new Set();
  const groups = layout.groups.map((g) => ({ key: g.key, ids: g.ids.filter((id) => { const keep = known.has(id); if (keep) seen.add(id); return keep; }) }));
  for (const i of todos.open || []) {
    if (seen.has(i.id)) continue;
    let g = groups.find((x) => x.key === i.sessionKey);
    if (!g) { g = { key: i.sessionKey, ids: [] }; groups.push(g); }
    g.ids.push(i.id); seen.add(i.id);
  }
  return { groups };
}

/** Rows to render, in layout order, each marked resolved when it left `open`. */
export function entriesFor(layout, todos) {
  const open = new Map((todos.open || []).map((i) => [i.id, i]));
  const resolved = new Map((todos.resolved || []).map((i) => [i.id, i]));
  return layout.groups.map((g) => {
    const entries = g.ids.map((id) => open.has(id) ? { item: open.get(id), resolved: false } : { item: resolved.get(id), resolved: true }).filter((e) => e.item);
    return { key: g.key, entries, openCount: entries.filter((e) => !e.resolved).length };
  });
}
