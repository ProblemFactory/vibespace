// THE ARTIFACTS LIST AT SCALE — the PURE half (lane artifacts-list-scale, design 021 E1–E9 + the owner's ⤢ window B;
// owner 2026-10-07 "有大量产物的情况下的排序，检索能力" — 43 deliverables + 174 code rows ran off the viewport in ONE
// order). Imports nothing, DOM-free: the chip's popover (src/lib/artifact-card.js renderArtifactList) and the Artifacts
// WINDOW (src/lib/artifacts-window.js) draw the SAME rows (`GET /api/artifacts` → view(rows): items + code, ≤ 500)
// through these functions — the window is the popover's model at full size, never a second model.
//   filterRows(rows, q)            → {rows, q, matchedCode}: case-folded substring over name · the path's last two
//                                    segments · the helper's label (CJK as typed); q bounded to FILTER_MAX chars
//   orderRows(rows, {group, sort}) → [{head: {key, group, label, count}, rows}]: kind (VIEW_ORDER, code last) · helper
//                                    (most rows first, the main conversation last) · day (newest first); in a group the sort
//   sortRows(rows, {col, dir})     → the window's column sort (name · kind · helper · edits · changed · path)
//   recentOf(rows, n) / recentShown({total, filtering}) → the 最近 band (any kind, code too; hidden while filtering / < 8)
//   rowWords(row, {t, kindWord, ago}) → the meta line's slots {kind, helper, edits, ago}; countLine(...) → the head's words
export const GROUPS = Object.freeze(['kind', 'helper', 'day']);
export const SORTS = Object.freeze(['changed', 'name', 'edits']);
export const COLUMNS = Object.freeze(['name', 'kind', 'helper', 'edits', 'changed', 'path']);
export const KIND_ORDER = Object.freeze(['doc', 'service', 'page', 'design', 'media', 'upload', 'other', 'code']); // src/artifacts.js VIEW_ORDER + code last
export const FILTER_MAX = 80;
export const RECENT_N = 5;
export const RECENT_MIN_ROWS = 8;
export const DEFAULT_VIEW = Object.freeze({ group: 'kind', sort: 'changed', collapsed: Object.freeze({ kind: Object.freeze(['k:code']), helper: Object.freeze([]), day: Object.freeze([]) }) });

const str = (v) => (v == null ? '' : String(v));
const say = (s, v) => str(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : '')); // the English words when no t() is handed in
const fold = (s) => str(s).toLowerCase();
/** The helper that made the row for this conversation ('' = the main conversation itself). */
export const helperOf = (r) => { const v = r && r.via; if (!v) return ''; if (v.kind === 'subagent') return str(v.name); if (v.kind === 'handover') return str((v.from && (v.from.name || v.from.cid)) || ''); return ''; };
/** The path's last two segments ("…/out/sec10_tail.md" → "out/sec10_tail.md"). */
export const pathTail = (p) => str(p).replace(/\/+$/, '').split('/').filter(Boolean).slice(-2).join('/');
/** The changes a row counts (the card's own rule: re-writes + edits). */
export const changesOf = (r) => Math.max(0, ((r && r.writes) || 0) - 1) + ((r && r.edits) || 0);
const touches = (r) => ((r && r.edits) || 0) + ((r && r.writes) || 0);
const lastAt = (r) => Number(r && r.lastAt) || 0;
const byKey = (a, b) => (str(a.key) < str(b.key) ? -1 : str(a.key) > str(b.key) ? 1 : 0);
const byName = (a, b) => str(a.name).localeCompare(str(b.name), undefined, { numeric: true, sensitivity: 'base' });
const CMP = {
  changed: (a, b) => lastAt(b) - lastAt(a) || byName(a, b) || byKey(a, b),
  name: (a, b) => byName(a, b) || lastAt(b) - lastAt(a) || byKey(a, b),
  edits: (a, b) => touches(b) - touches(a) || lastAt(b) - lastAt(a) || byKey(a, b),
};
const asRows = (rows) => (Array.isArray(rows) ? rows.filter((r) => r && r.key) : []);
/** The view's rows as ONE list (items then code). */
export const rowsOfView = (v) => [...asRows(v && v.items), ...asRows(v && v.code)];
/** The filter's query, bounded and trimmed. */
export const queryOf = (q) => str(q).slice(0, FILTER_MAX).trim();

/** Where the query sits in the name ([start, end) in the name's own characters) — the row's <mark>; null = no mark. */
export function markOf(name, q) {
  const s = fold(queryOf(q)); const n = str(name);
  if (!s) return null;
  const f = fold(n);
  if (f.length !== n.length) return null; // a fold that changed the length cannot index the name
  const i = f.indexOf(s);
  return i < 0 ? null : [i, i + s.length];
}
/** THE FILTER (E2): instant, local; case-folded substring over name · path tail · helper label. */
export function filterRows(rows, q) {
  const all = asRows(rows), s = fold(queryOf(q));
  if (!s) return { rows: all, q: '', matchedCode: all.filter((r) => r.kind === 'code').length };
  const out = all.filter((r) => fold(r.name).includes(s) || fold(pathTail(r.path)).includes(s) || fold(helperOf(r)).includes(s));
  return { rows: out, q: s, matchedCode: out.filter((r) => r.kind === 'code').length };
}
const two = (n) => (n < 10 ? '0' : '') + n;
/** The local calendar day of an instant, "YYYY-MM-DD" ('' = no instant). */
export const dayOf = (ts) => { const n = Number(ts) || 0; if (!n) return ''; const d = new Date(n); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
/** THE ORDER (E3/E4): groups of the chosen kind, the chosen sort inside each; heads keyed (k: / h: / d:) and counted. */
export function orderRows(rows, { group = 'kind', sort = 'changed' } = {}) {
  const g = GROUPS.includes(group) ? group : 'kind', cmp = CMP[SORTS.includes(sort) ? sort : 'changed'];
  const by = new Map();
  for (const r of asRows(rows)) {
    const label = g === 'kind' ? (KIND_ORDER.includes(r.kind) ? r.kind : 'other') : g === 'helper' ? helperOf(r) : dayOf(r.lastAt);
    if (!by.has(label)) by.set(label, []);
    by.get(label).push(r);
  }
  let labels = [...by.keys()];
  if (g === 'kind') labels.sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
  else if (g === 'helper') labels.sort((a, b) => (a === '') - (b === '') || by.get(b).length - by.get(a).length || a.localeCompare(b));
  else labels.sort((a, b) => (a === '') - (b === '') || (a < b ? 1 : a > b ? -1 : 0));
  const pre = g === 'kind' ? 'k:' : g === 'helper' ? 'h:' : 'd:';
  return labels.map((label) => ({ head: { key: pre + label, group: g, label, count: by.get(label).length }, rows: by.get(label).slice().sort(cmp) }));
}
/** THE WINDOW'S COLUMN SORT (B): the same comparators for name / edits / changed; kind, helper and path order by their
 *  words, then the newest change. `dir` 'asc' | 'desc' (the default per column: name / kind / helper / path asc). */
export function sortRows(rows, { col = 'changed', dir = '' } = {}) {
  const c = COLUMNS.includes(col) ? col : 'changed';
  const natural = c === 'edits' || c === 'changed' ? 'desc' : 'asc';
  const d = dir === 'asc' || dir === 'desc' ? dir : natural;
  const keyCmp = (f) => (a, b) => f(a).localeCompare(f(b), undefined, { numeric: true, sensitivity: 'base' }) || CMP.changed(a, b);
  const base = c === 'name' ? CMP.name : c === 'edits' ? CMP.edits : c === 'changed' ? CMP.changed
    : c === 'kind' ? (a, b) => KIND_ORDER.indexOf(KIND_ORDER.includes(a.kind) ? a.kind : 'other') - KIND_ORDER.indexOf(KIND_ORDER.includes(b.kind) ? b.kind : 'other') || CMP.changed(a, b)
      : c === 'helper' ? (a, b) => (helperOf(a) === '') - (helperOf(b) === '') || keyCmp(helperOf)(a, b)
        : keyCmp((r) => pathTail(r.path));
  const out = asRows(rows).slice().sort(base);
  return d === natural ? out : out.reverse();
}
/** The window's rail (B): the kinds and helpers with their counts (kinds in KIND_ORDER; helpers most rows first). */
export function railOf(rows) {
  const all = asRows(rows);
  const kinds = orderRows(all, { group: 'kind' }).map((g) => ({ key: g.head.key, label: g.head.label, count: g.head.count }));
  const helpers = orderRows(all, { group: 'helper' }).filter((g) => g.head.label !== '').map((g) => ({ key: g.head.key, label: g.head.label, count: g.head.count }));
  return { total: all.length, kinds, helpers };
}
/** The rail's choice applied ('all' | 'recent' | 'k:<kind>' | 'h:<helper>'). */
export function railRows(rows, sel) {
  const all = asRows(rows), s = str(sel);
  if (s === 'recent') return recentOf(all);
  if (s.startsWith('k:')) return all.filter((r) => (KIND_ORDER.includes(r.kind) ? r.kind : 'other') === s.slice(2));
  if (s.startsWith('h:')) return all.filter((r) => helperOf(r) === s.slice(2));
  return all;
}
/** THE 最近 BAND (E5): the n newest touches of ANY kind (code included). */
export const recentOf = (rows, n = RECENT_N) => asRows(rows).slice().sort(CMP.changed).slice(0, Math.max(0, n));
export const recentShown = ({ total = 0, filtering = false } = {}) => !filtering && total >= RECENT_MIN_ROWS;
/** THE ROW'S WORDS (E6): {kind, helper, edits, ago} — the meta line "类型 · 帮手 · 已改 N 次" and the right-hand time.
 *  A service says its state in the edits slot. `t` = i18n t(), `kindWord(kind)` = src/artifacts.js's words,
 *  `ago(ts)` = the house relative time. */
export function rowWords(r, { t = say, kindWord = (k) => k, ago = () => '' } = {}) {
  const kind = kindWord((r && r.kind) || 'other');
  const helper = helperOf(r);
  if (r && r.kind === 'service') {
    const stopped = r.state === 'stopped';
    return { kind, helper, edits: stopped ? t('Stopped') : t('Running'), ago: ago((stopped ? r.stoppedAt : r.since) || lastAt(r)) };
  }
  const n = changesOf(r);
  return { kind, helper, edits: n ? t('Changed {n} times', { n }) : '', ago: lastAt(r) ? ago(lastAt(r)) : '' };
}
/** THE COUNT LINE (E8): "43 项产出 · 174 个代码文件"; while filtering "匹配 7 项 · 其中代码 2". */
export function countLine({ items = 0, code = 0, filtered = null } = {}, t = say) {
  if (filtered) return filtered.matchedCode ? t('{n} matches · {m} code', { n: filtered.rows.length, m: filtered.matchedCode }) : t('{n} matches', { n: filtered.rows.length });
  return code ? t('{items} artifacts · {code} code files', { items, code }) : t('{n} artifacts', { n: items });
}
/** The device-kept view {group, sort, collapsed: {kind: [...], helper: [...], day: [...]}} from a stored value (junk ⇒ the defaults). */
export function viewFrom(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const c = v.collapsed && typeof v.collapsed === 'object' ? v.collapsed : {};
  const list = (g) => (Array.isArray(c[g]) ? c[g].filter((x) => typeof x === 'string').slice(0, 200) : DEFAULT_VIEW.collapsed[g].slice());
  return { group: GROUPS.includes(v.group) ? v.group : DEFAULT_VIEW.group, sort: SORTS.includes(v.sort) ? v.sort : DEFAULT_VIEW.sort, collapsed: { kind: list('kind'), helper: list('helper'), day: list('day') } };
}
/** THE LIST'S PLAN (the popover): what to draw, in order — sections [{key, head, rows, open}] (the band first when
 *  shown), the count words' inputs, and the zero-match flag. A collapsed group with matches opens while filtering (its
 *  remembered state untouched). */
export function listPlan(v, { q = '', group = 'kind', sort = 'changed', collapsed = [] } = {}) {
  const items = asRows(v && v.items), code = asRows(v && v.code);
  const all = [...items, ...code];
  const f = filterRows(all, q), filtering = !!f.q;
  const shut = new Set(collapsed);
  const sections = [];
  if (recentShown({ total: all.length, filtering })) sections.push({ key: 'recent', head: { key: 'recent', group: 'recent', label: '', count: Math.min(RECENT_N, all.length) }, rows: recentOf(all), open: !shut.has('recent') });
  for (const g of orderRows(f.rows, { group, sort })) sections.push({ key: g.head.key, head: g.head, rows: g.rows, open: filtering || !shut.has(g.head.key) });
  return { sections, filtering, empty: filtering && !f.rows.length, count: { items: items.length, code: code.length, filtered: filtering ? f : null }, q: f.q };
}
