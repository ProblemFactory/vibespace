// THE ARTIFACTS LIST AT SCALE — the PURE half (lane artifacts-list-scale, design 021 E1–E9 + the owner's ⤢ window B;
// owner 2026-10-07 "有大量产物的情况下的排序，检索能力" — 43 deliverables + 174 code rows ran off the viewport in ONE
// order). Imports nothing, DOM-free: the chip's popover (src/lib/artifact-card.js renderArtifactList) and the Artifacts
// WINDOW (src/lib/artifacts-window.js) draw the SAME rows (`GET /api/artifacts` → view(rows): items + code, ≤ 500)
// through these functions — the window is the popover's model at full size, never a second model.
//   filterRows(rows, q, ctx)       → {rows, q, matchedCode, weak}: case-folded substring over name · folder · path (from
//                                    the conversation's cwd) · the helper's label; the kind's word as a WORD (`kindHit`:
//                                    equal, or a word's prefix of ≥ 3 letters — `weak`, it never unfolds a band); q ≤ FILTER_MAX
//   orderRows(rows, {group, sort}) → [{head: {key, group, label, count, code}, rows}]: INTENT (the default — for you ·
//                                    made here · touched, the server's verdict `intentOf` on every block) · kind (VIEW_ORDER,
//                                    code last) · helper (most rows first, the main conversation last) · day (newest first)
//   sortRows(rows, {col, dir, cwd, host}) → the window's column sort (name · kind · helper · edits · changed · path — by
//                                    what the cell SHOWS, `pathWord`; 'intent' = the bands, newest first — the window's
//                                    order before a column is clicked, and again after the rail's All or a band)
//   recentOf(rows, n) / recentShown({total, filtering}) → the 最近 band (any kind, code too; hidden while filtering / < 8)
//   rowWords(row, {t, kindWord, ago, ...ctx}) → the meta line's slots {folder, kind, helper, edits, ago, away};
//                                    metaLine(words, {inFolder}) → the line in its order; countLine(...)
// THE ROW IS FOUND (lane artifacts-by-intent, owner 2026-11-06 「根本找不到想找的东西」 — three «README.md · 文档» rows and
// no folder anywhere): `whereOf` / `folderOf` = the row's folder from the conversation's cwd (the cwd itself by its own
// name); a row from ELSEWHERE (a helper's folder, a home, another machine — `away`) reads WHO and WHERE: the helper, the
// host when not the conversation's, the folder's TAIL («referee · …/out») — never the whole absolute path; a folder is
// KEYED by its directory (host + path) and LABELLED by its tail — two labels that collide grow to the distinguishing
// suffix (`folderNames`: «…/wt-referee/out» · «…/wt-judge/out»), the names' rule; ONE host rule (`hostTag`) for the
// folders and the names: another machine than the conversation's says which, the hub's own machine by `hubWord`;
// `shownNames` = a name that collides wears its shortest DISTINGUISHING path
// suffix («v3-or1/README.md» · «referee3/README.md»), grown until unique; a section over FOLDER_OVER rows sub-groups by
// folder (`foldersOf`, collapsible heads with counts; inside a head a row shows its BARE name and no folder — the head
// names it); the 最近 band never repeats a row an open section draws.
export const GROUPS = Object.freeze(['intent', 'kind', 'helper', 'day']);
export const INTENT_ORDER = Object.freeze(['foryou', 'made', 'touched']); // src/artifacts.js INTENTS — the list's first axis
export const SORTS = Object.freeze(['changed', 'name', 'edits']);
export const COLUMNS = Object.freeze(['name', 'kind', 'helper', 'edits', 'changed', 'path']);
export const KIND_ORDER = Object.freeze(['doc', 'service', 'page', 'design', 'media', 'upload', 'other', 'code']); // src/artifacts.js VIEW_ORDER + code last
export const FILTER_MAX = 80;
export const RECENT_N = 5;
export const RECENT_MIN_ROWS = 8;
export const FOLDER_OVER = 8; // a section with more rows than this sub-groups by folder; ≤ 8 stays flat
export const VIEW_VERSION = 2; // a stored view without it predates the intent default (its `kind` was the default, never a choice)
export const DEFAULT_VIEW = Object.freeze({ group: 'intent', sort: 'changed', collapsed: Object.freeze({ intent: Object.freeze(['i:touched']), kind: Object.freeze(['k:code']), helper: Object.freeze([]), day: Object.freeze([]) }) });

const str = (v) => (v == null ? '' : String(v));
const say = (s, v) => str(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : '')); // the English words when no t() is handed in
const fold = (s) => str(s).toLowerCase();
/** The helper that made the row for this conversation ('' = the main conversation itself). */
export const helperOf = (r) => { const v = r && r.via; if (!v) return ''; if (v.kind === 'subagent') return str(v.name); if (v.kind === 'handover') return str((v.from && (v.from.name || v.from.cid)) || ''); return ''; };
/** The path's last two segments ("…/out/sec10_tail.md" → "out/sec10_tail.md"). */
export const pathTail = (p) => str(p).replace(/\/+$/, '').split('/').filter(Boolean).slice(-2).join('/');
/** The band a row reads in — the server's verdict (src/artifacts.js intentOf, on every block); a block without one
 *  (an older hub) reads code ⇒ touched, the rest ⇒ made here — never «for you» on a guess. */
export const bandOf = (r) => (r && INTENT_ORDER.includes(r.intent) ? r.intent : r && r.kind === 'code' ? 'touched' : 'made');
const HOME = /^\/(?:home|Users)\/[^/]+(?=\/|$)|^\/root(?=\/|$)/;
const cwdOf = (cwd) => str(cwd).replace(/\/+$/, '');
/** The path a person reads: from the conversation's cwd when the row lives under it on its machine, else the whole path. */
export function relPath(r, { cwd = '', host = '' } = {}) {
  const p = str(r && r.path), c = cwdOf(cwd);
  if (c && str(r && r.host) === str(host) && p.startsWith(c + '/')) return p.slice(c.length + 1);
  return p;
}
/** THE ONE HOST RULE (lane artifacts-by-intent r3 — the folders AND the told-apart names): a row on ANOTHER machine than
 *  the conversation's says which, AS THE PERSON READS IT (r4: `hostNames` = id → the name the host pickers and the file
 *  explorer's host row show — «gpu1:», never «host-1a2b3c4d:»; a machine gone from the list by its id; the hub's own —
 *  host '' — by `hubWord`, their «Local»); the conversation's own machine never does. */
export const hostTag = (r, { host = '', hubWord = 'Local', hostNames = null } = {}) => {
  const rh = str(r && r.host);
  if (rh === str(host)) return '';
  return (rh ? str(hostNames && typeof hostNames === 'object' && Object.hasOwn(hostNames, rh) ? hostNames[rh] : '') || rh : str(hubWord) || 'Local') + ':';
};
/** WHERE a row lives, unlabelled: {key, away, segs, base, depth, max, lead, abs, tag} — `key` = THE DIRECTORY (host +
 *  path: two folders that share a tail are two folders); `segs` the segments a label is cut from (under the cwd: the
 *  cwd's own name, then the path from it — `base` 1; elsewhere: the path from the root or from the home), `depth` the
 *  segments the label shows by default, `max` the most it can grow to, `lead` what the whole path starts with ('/' ·
 *  '~'), `tag` the host rule's prefix. «~» is a LABEL, never a key (r4): ANY home reads «~», so a home's folder grows
 *  one step past its segments — to its absolute path (`abs`: «/home/a/x» · «/root/x») — when only that tells it apart. */
const PLACES = new WeakMap(); // row → its place under ONE context: the heads, the meta lines, the filter and the Path cell ask a row's place many times a keystroke (r4)
function placeOf(r, { cwd = '', host = '', hubWord, hostNames } = {}) {
  if (!r || typeof r !== 'object') return null;
  const e = PLACES.get(r);
  if (e && e.cwd === cwd && e.host === host && e.hubWord === hubWord && e.hostNames === hostNames && e.path === r.path && e.rh === r.host && e.pr === r.presented) return e.w;
  const w = placeAt(r, { cwd, host, hubWord, hostNames });
  PLACES.set(r, { cwd, host, hubWord, hostNames, path: r.path, rh: r.host, pr: r.presented, w });
  return w;
}
function placeAt(r, { cwd, host, hubWord, hostNames }) {
  const p = str(r && r.path).replace(/\/+$/, '');
  if (!p || (r && r.presented) || !(p.startsWith('/') || p.startsWith('~'))) return null;
  const dir = p.slice(0, p.lastIndexOf('/')) || '/';
  const c = cwdOf(cwd), rh = str(r && r.host), key = rh + ':' + dir;
  if (rh === str(host) && c && (dir === c || dir.startsWith(c + '/'))) {
    const h = HOME.exec(c), rel = dir === c ? [] : dir.slice(c.length + 1).split('/');
    const segs = [h && h[0] === c ? '~' : c.split('/').pop() || '/', ...rel];
    return { key, away: false, segs, base: 1, depth: rel.length > 4 ? 3 : Math.max(1, rel.length), max: segs.length, lead: '', abs: dir, tag: '' };
  }
  const h = HOME.exec(dir), segs = (h ? dir.slice(h[0].length) : dir).split('/').filter(Boolean);
  return { key, away: true, segs, base: 0, depth: 1, max: Math.max(1, segs.length) + (h ? 1 : 0), lead: h ? '~' : '/', abs: dir, tag: hostTag(r, { host, hubWord, hostNames }) };
}
/** A place's label at `d` segments: cut from the front («…/out», «…/c/d/e»), whole when nothing is cut («traces/v3-or1»,
 *  «/tmp», «~/notes»); the cwd itself by its own name («proj»; «~» for a home); a home's folder past its segments =
 *  its absolute path. */
function labelAt(w, d) {
  const n = w.segs.length, k = Math.max(1, Math.min(d, n));
  if (!w.away) return (k < n - w.base ? '…/' : '') + w.segs.slice(-k).join('/');
  if (w.lead === '~' && d > Math.max(1, n)) return w.tag + w.abs;
  if (!n) return w.tag + (w.lead === '~' ? '~' : '/');
  return w.tag + (k < n ? '…/' : w.lead === '~' ? '~/' : '/') + w.segs.slice(-k).join('/');
}
/** WHERE a row lives (the meta line, the folder heads): {folder, key, away}. Under the conversation's cwd on its machine
 *  ⇒ relative ("traces/v3-or1"; "…/a/b/c" past four levels) and the cwd itself by its OWN name ("proj"; "~" for a home);
 *  ELSEWHERE (`away`: a helper's folder, a home, another machine) ⇒ the folder's TAIL ("…/out"; "~" · "~/notes" at a
 *  home's first level; "/tmp"), the host first only when the row's machine is not the conversation's ("gpu1:…/out");
 *  a service or a page link has none (''). `key` = the directory (host + path). A label that collides with another
 *  folder's is the grown one `ctx.folders` holds (`folderNames`). Never the whole absolute path unless only it tells two
 *  folders apart — the row's title (hover / long-press) carries it. */
export function whereOf(r, ctx = {}) {
  const w = placeOf(r, ctx || {});
  if (!w) return { folder: '', key: '', away: false };
  const grown = ctx && ctx.folders && typeof ctx.folders.get === 'function' ? ctx.folders.get(w.key) : '';
  return { folder: grown || labelAt(w, w.depth), key: w.key, away: w.away };
}
/** THE FOLDERS A PERSON CAN TELL APART (lane artifacts-by-intent r3 — the shownNames rule for folders): directory key →
 *  its label, for the folders whose labels COLLIDE only («…/out» twice ⇒ «…/wt-referee/out» · «…/wt-judge/out»; the
 *  root «proj» and a sub-folder «proj» ⇒ «proj» · «proj/proj»): every label more than one folder wears grows one segment
 *  at a time until NO other folder wears it — a grown label checked against EVERY folder's (r4: «proj/proj» grown into a
 *  sub-sub-folder's grows on) — or its whole path is shown (a home's: its absolute path, r4). Over ALL the list's rows —
 *  the heads, the meta lines and the window's Path cell say the same words. */
export function folderNames(rows, ctx = {}) {
  const places = new Map(), d = new Map(), hit = new Set(), out = new Map();
  for (const r of asRows(rows)) { const w = placeOf(r, ctx || {}); if (w && !places.has(w.key)) { places.set(w.key, w); d.set(w.key, w.depth); } }
  for (let grew = true; grew;) {
    grew = false;
    const at = new Map();
    for (const [k, w] of places) { const l = labelAt(w, d.get(k)); const g = at.get(l); if (g) g.push(k); else at.set(l, [k]); }
    for (const g of at.values()) if (g.length > 1) for (const k of g) { hit.add(k); if (d.get(k) < places.get(k).max) { d.set(k, d.get(k) + 1); grew = true; } }
  }
  for (const k of hit) out.set(k, labelAt(places.get(k), d.get(k)));
  return out;
}
/** THE LIST'S WORDS CONTEXT (the popover's plan and the window — one call): {cwd, host, hubWord, hostNames, folders,
 *  names} over EVERY row of the view (never the filtered ones: a filter hides rows, never renames a folder). */
export function listCtx(v, { hubWord = 'Local' } = {}) {
  const hn = v && v.hostNames && typeof v.hostNames === 'object' ? v.hostNames : null;
  const all = rowsOfView(v), base = { cwd: str(v && v.cwd), host: str(v && v.host), hubWord: str(hubWord) || 'Local', hostNames: hn };
  return { ...base, folders: folderNames(all, base), names: shownNames(all, base) };
}
/** THE FOLDER a row names (whereOf's words). */
export const folderOf = (r, ctx) => whereOf(r, ctx).folder;
/** What the window's Path cell SHOWS (and sorts by): a service its address, any other row its folder. */
export const pathWord = (r, ctx) => (r && r.kind === 'service' ? str(r.url) : folderOf(r, ctx));
/** THE NAMES A PERSON CAN TELL APART: key → the name the row shows. A unique name shows as is; names that collide each
 *  wear the shortest path suffix no other of them shares (from two segments, grown one at a time — "v3/README.md",
 *  "traces/v3-or1/README.md"); a row named otherwise (a design's title) keeps its name and adds that suffix; one path on
 *  two machines adds the host by THE ONE HOST RULE (`hostTag`: the machine that is not the conversation's says which);
 *  a service adds its port. Linear: a Map by name, a Map of suffixes per collision depth. */
export function shownNames(rows, { host = '', hubWord = 'Local', hostNames = null } = {}) {
  const out = new Map(), byName = new Map();
  for (const r of asRows(rows)) { const n = str(r.name); const g = byName.get(n); if (g) g.push(r); else byName.set(n, [r]); }
  for (const [n, rs] of byName) {
    if (rs.length < 2) { out.set(rs[0].key, n); continue; }
    const segs = rs.map((r) => str(r.path).replace(/\/+$/, '').split('/').filter(Boolean));
    const full = segs.map((sg) => sg.join('/')), paths = new Map();
    for (const p of full) paths.set(p, (paths.get(p) || 0) + 1);
    const left = new Set(rs.map((_, i) => i));
    for (let d = 2; left.size; d++) {
      const seen = new Map(); // suffix → the distinct paths wearing it at this depth, every machine together (one person reads them side by side)
      for (let i = 0; i < segs.length; i++) if (segs[i].length) { const k = segs[i].slice(-d).join('/'); const g = seen.get(k); if (g) g.add(full[i]); else seen.set(k, new Set([full[i]])); }
      for (const i of [...left]) {
        const r = rs[i], sg = segs[i], tail = sg.slice(-d).join('/');
        if (sg.length && seen.get(tail).size > 1 && d < sg.length) continue; // another path still shares it: grow
        left.delete(i);
        const where = (paths.get(full[i]) > 1 ? hostTag(r, { host, hubWord, hostNames }) : '') + tail; // one path on two machines: the one not the conversation's says which
        out.set(r.key, !sg.length ? (r.kind === 'service' ? `${n} · :${Number(r.port) || 0}` : n) : sg[sg.length - 1] === n ? where : `${n} · ${where}`);
      }
    }
  }
  return out;
}
/** The changes a row counts (the card's own rule: re-writes + edits). */
export const changesOf = (r) => Math.max(0, ((r && r.writes) || 0) - 1) + ((r && r.edits) || 0);
const touches = (r) => ((r && r.edits) || 0) + ((r && r.writes) || 0);
const lastAt = (r) => Number(r && r.lastAt) || 0;
const byKey = (a, b) => (str(a.key) < str(b.key) ? -1 : str(a.key) > str(b.key) ? 1 : 0);
// ONE collator (lane artifacts-by-intent r4): `localeCompare(x, undefined, opts)` builds its collator on every call — the
// sort's ties by name were most of a keystroke's work (the same order: the default locale, numeric, base sensitivity)
const WORDS = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byName = (a, b) => WORDS.compare(str(a.name), str(b.name));
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
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
/** A query against the KIND'S WORD (lane artifacts-by-intent r2): 'equal' (the whole word — «code», «文档»), 'prefix' (a
 *  word's start, ≥ 3 letters — «docu»; a CJK word only whole) or '' — never a substring inside it («de», «me»). */
export function kindHit(word, q) {
  const w = fold(word), s = fold(q);
  if (!w || !s) return '';
  if (w === s) return 'equal';
  return s.length >= 3 && !CJK.test(w) && w.split(/[\s/·-]+/).some((x) => x.startsWith(s)) ? 'prefix' : '';
}
/** THE FILTER (E2 + lane artifacts-by-intent): instant, local; case-folded substring over name · folder · the path from
 *  the conversation's cwd · helper label; the kind's word (`kindWord(kind)` — the words the person reads) as a WORD
 *  (`kindHit`). A row found only by a kind word's prefix is `weak`: it shows, it never unfolds a folded band. */
export function filterRows(rows, q, { cwd = '', host = '', hubWord = 'Local', hostNames = null, folders = null, kindWord = null } = {}) {
  const all = asRows(rows), s = fold(queryOf(q)), weak = new Set();
  if (!s) return { rows: all, q: '', matchedCode: all.filter((r) => r.kind === 'code').length, weak };
  const ctx = { cwd, host, hubWord, hostNames, folders }, kw = typeof kindWord === 'function' ? kindWord : null;
  const out = all.filter((r) => {
    if (fold(r.name).includes(s) || fold(folderOf(r, ctx)).includes(s) || fold(relPath(r, ctx)).includes(s) || fold(helperOf(r)).includes(s)) return true;
    const k = kw ? kindHit(kw(r.kind || 'other'), s) : '';
    if (k === 'prefix') weak.add(r.key);
    return !!k;
  });
  return { rows: out, q: s, matchedCode: out.filter((r) => r.kind === 'code').length, weak };
}
const two = (n) => (n < 10 ? '0' : '') + n;
/** The local calendar day of an instant, "YYYY-MM-DD" ('' = no instant). */
export const dayOf = (ts) => { const n = Number(ts) || 0; if (!n) return ''; const d = new Date(n); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
/** THE ORDER (E3/E4): groups of the chosen kind, the chosen sort inside each; heads keyed (k: / h: / d:) and counted. */
export function orderRows(rows, { group = 'intent', sort = 'changed' } = {}) {
  const g = GROUPS.includes(group) ? group : 'intent', cmp = CMP[SORTS.includes(sort) ? sort : 'changed'];
  const by = new Map();
  for (const r of asRows(rows)) {
    const label = g === 'intent' ? bandOf(r) : g === 'kind' ? (KIND_ORDER.includes(r.kind) ? r.kind : 'other') : g === 'helper' ? helperOf(r) : dayOf(r.lastAt);
    if (!by.has(label)) by.set(label, []);
    by.get(label).push(r);
  }
  let labels = [...by.keys()];
  if (g === 'intent') labels.sort((a, b) => INTENT_ORDER.indexOf(a) - INTENT_ORDER.indexOf(b));
  else if (g === 'kind') labels.sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
  else if (g === 'helper') labels.sort((a, b) => (a === '') - (b === '') || by.get(b).length - by.get(a).length || a.localeCompare(b));
  else labels.sort((a, b) => (a === '') - (b === '') || (a < b ? 1 : a > b ? -1 : 0));
  const pre = g === 'intent' ? 'i:' : g === 'kind' ? 'k:' : g === 'helper' ? 'h:' : 'd:';
  return labels.map((label) => { const rs = by.get(label); return { head: { key: pre + label, group: g, label, count: rs.length, code: rs.filter((r) => r.kind === 'code').length }, rows: rs.slice().sort(cmp) }; });
}
/** THE FOLDERS of one section (lane artifacts-by-intent: a section over FOLDER_OVER rows): [{head: {key, group:
 *  'folder', label, count}, rows}] — the rows with no folder (a service, a page link) first and BARE (label '' — they
 *  sit at the section's own level, no head), then the folder with the newest change first (by its label when the sort
 *  is the name), each folder's rows in the section's order. ONE head per DIRECTORY (r3: never per tail), labelled by
 *  `folders` (the list's `folderNames`; this section's own when none is handed in). Keys `f:<section key>:<directory>`
 *  (the device-kept fold). */
export function foldersOf(rows, { section = '', sort = 'changed', cwd = '', host = '', hubWord = 'Local', hostNames = null, folders = null } = {}) {
  const base = { cwd, host, hubWord, hostNames }, ctx = { ...base, folders: folders || folderNames(rows, base) }, by = new Map();
  for (const r of asRows(rows)) { const w = whereOf(r, ctx); const g = by.get(w.key); if (g) g.rows.push(r); else by.set(w.key, { label: w.folder, rows: [r] }); }
  const newest = (rs) => rs.reduce((m, r) => Math.max(m, lastAt(r)), 0);
  const heads = [...by.keys()].map((k) => ({ k, label: by.get(k).label, at: newest(by.get(k).rows) }));
  const byWord = (a, b) => WORDS.compare(a.label, b.label) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0);
  heads.sort((a, b) => (a.k !== '') - (b.k !== '') || (sort === 'name' ? byWord(a, b) : b.at - a.at || byWord(a, b)));
  return heads.map(({ k }) => ({ head: { key: `f:${section}:${k}`, group: 'folder', label: by.get(k).label, count: by.get(k).rows.length }, rows: by.get(k).rows }));
}
/** THE WINDOW'S COLUMN SORT (B): the same comparators for name / edits / changed; kind and helper order by their words,
 *  then the newest change; path by what its cell SHOWS (`pathWord` — the folder), then the name. `dir` 'asc' | 'desc'
 *  (the default per column: name / kind / helper / path asc). */
export function sortRows(rows, { col = 'changed', dir = '', cwd = '', host = '', hubWord = 'Local', hostNames = null, folders = null } = {}) {
  if (col === 'intent') return asRows(rows).slice().sort((a, b) => INTENT_ORDER.indexOf(bandOf(a)) - INTENT_ORDER.indexOf(bandOf(b)) || CMP.changed(a, b)); // the window before a column is clicked
  const c = COLUMNS.includes(col) ? col : 'changed';
  const natural = c === 'edits' || c === 'changed' ? 'desc' : 'asc';
  const d = dir === 'asc' || dir === 'desc' ? dir : natural;
  const keyCmp = (f) => (a, b) => WORDS.compare(f(a), f(b)) || CMP.changed(a, b);
  const base = c === 'name' ? CMP.name : c === 'edits' ? CMP.edits : c === 'changed' ? CMP.changed
    : c === 'kind' ? (a, b) => KIND_ORDER.indexOf(KIND_ORDER.includes(a.kind) ? a.kind : 'other') - KIND_ORDER.indexOf(KIND_ORDER.includes(b.kind) ? b.kind : 'other') || CMP.changed(a, b)
      : c === 'helper' ? (a, b) => (helperOf(a) === '') - (helperOf(b) === '') || keyCmp(helperOf)(a, b)
        : (a, b) => WORDS.compare(pathWord(a, { cwd, host, hubWord, hostNames, folders }), pathWord(b, { cwd, host, hubWord, hostNames, folders })) || CMP.name(a, b);
  const out = asRows(rows).slice().sort(base);
  return d === natural ? out : out.reverse();
}
/** The window's rail (B): the three bands (always, with their counts — an empty «for you» says so), then the kinds and
 *  helpers with their counts (kinds in KIND_ORDER; helpers most rows first). */
export function railOf(rows) {
  const all = asRows(rows);
  const n = new Map(INTENT_ORDER.map((b) => [b, 0])); for (const r of all) n.set(bandOf(r), n.get(bandOf(r)) + 1);
  const intents = INTENT_ORDER.map((b) => ({ key: 'i:' + b, label: b, count: n.get(b) }));
  const kinds = orderRows(all, { group: 'kind' }).map((g) => ({ key: g.head.key, label: g.head.label, count: g.head.count }));
  const helpers = orderRows(all, { group: 'helper' }).filter((g) => g.head.label !== '').map((g) => ({ key: g.head.key, label: g.head.label, count: g.head.count }));
  return { total: all.length, intents, kinds, helpers };
}
/** The rail's choice applied ('all' | 'recent' | 'i:<band>' | 'k:<kind>' | 'h:<helper>'). */
export function railRows(rows, sel) {
  const all = asRows(rows), s = str(sel);
  if (s === 'recent') return recentOf(all);
  if (s.startsWith('i:')) return all.filter((r) => bandOf(r) === s.slice(2));
  if (s.startsWith('k:')) return all.filter((r) => (KIND_ORDER.includes(r.kind) ? r.kind : 'other') === s.slice(2));
  if (s.startsWith('h:')) return all.filter((r) => helperOf(r) === s.slice(2));
  return all;
}
/** THE 最近 BAND (E5): the n newest touches of ANY kind (code included). */
export const recentOf = (rows, n = RECENT_N) => asRows(rows).slice().sort(CMP.changed).slice(0, Math.max(0, n));
export const recentShown = ({ total = 0, filtering = false } = {}) => !filtering && total >= RECENT_MIN_ROWS;
/** THE ROW'S WORDS (E6): {folder, kind, helper, edits, ago} — the meta line "文件夹 · 类型 · 帮手 · 已改 N 次" and the
 *  right-hand time. A service says its state in the edits slot, a page its publication (an unpublished page says so —
 *  it left «for you»). `t` = i18n t(), `kindWord(kind)` = src/artifacts.js's words, `ago(ts)` = the house relative
 *  time, `cwd` / `host` = the conversation's (the folder is read from them; `folders` / `hubWord` = the list's — listCtx). */
export function rowWords(r, { t = say, kindWord = (k) => k, ago = () => '', cwd = '', host = '', hubWord = 'Local', hostNames = null, folders = null } = {}) {
  const kind = kindWord((r && r.kind) || 'other');
  const helper = helperOf(r), { folder, away } = whereOf(r, { cwd, host, hubWord, hostNames, folders });
  if (r && r.kind === 'service') {
    const stopped = r.state === 'stopped';
    return { folder, away, kind, helper, edits: stopped ? t('Stopped') : t('Running'), ago: ago((stopped ? r.stoppedAt : r.since) || lastAt(r)) };
  }
  const n = changesOf(r);
  const state = r && (r.state === 'unpublished' || r.gone) ? t('Unpublished') : r && r.state === 'published' ? t('Published') : '';
  return { folder, away, kind, helper, edits: [state, n ? t('Changed {n} times', { n }) : ''].filter(Boolean).join(' · '), ago: lastAt(r) ? ago(lastAt(r)) : '' };
}
/** THE META LINE in its order (lane artifacts-by-intent r2): a row under the cwd leads with its folder («traces/v3-or1 ·
 *  文档 · verify»); a row from ELSEWHERE leads with WHO and WHERE («referee · …/out · 文档»); inside a folder head the
 *  folder is the head's — never said twice. */
export function metaLine(w, { inFolder = false } = {}) {
  const folder = inFolder ? '' : w.folder;
  return (w.away ? [w.helper, folder, w.kind, w.edits] : [folder, w.kind, w.helper, w.edits]).filter(Boolean).join(' · ');
}
/** THE COUNT LINE (E8): "43 项产出 · 174 个代码文件"; while filtering "匹配 7 项 · 其中代码 2". */
export function countLine({ items = 0, code = 0, filtered = null } = {}, t = say) {
  if (filtered) return filtered.matchedCode ? t('{n} matches · {m} code', { n: filtered.rows.length, m: filtered.matchedCode }) : t('{n} matches', { n: filtered.rows.length });
  return code ? t('{items} artifacts · {code} code files', { items, code }) : t('{n} artifacts', { n: items });
}
/** ONE FOLD TAP on a device-kept folds list (lane artifacts-by-intent r4 — ONE rule for every family: i: · k: · h: · d:
 *  · f:): a fold moves its key to the FRONT, an unfold takes it out — the list reads newest first, so the cap
 *  (FOLDS_MAX, viewFrom) drops the OLDEST fold, never the one just made. A NEW list. */
export const FOLDS_MAX = 200;
export const foldToggle = (list, k) => { const c = Array.isArray(list) ? list : [], rest = c.filter((x) => x !== k); return rest.length < c.length ? rest : [k, ...rest]; };
/** THE CAP (r5): it counts the PERSON's folds — the newest FOLDS_MAX of them stay; a SEEDED key (DEFAULT_VIEW's
 *  i:touched / k:code) is never the one evicted, and one the person unfolded is out of the list and stays out (a stored
 *  list is never re-seeded on read). */
export const foldsCap = (list, g) => { const seed = (DEFAULT_VIEW.collapsed[g] || []); let n = 0; return list.filter((k) => seed.includes(k) || n++ < FOLDS_MAX); };
/** The device-kept view {v, group, sort, collapsed: {intent: [...], kind: [...], helper: [...], day: [...]}} from a
 *  stored value (junk ⇒ the defaults). A view stored before VIEW_VERSION 2 whose group is `kind` held the OLD default,
 *  never a choice — it reads as the intent default (a helper / day choice stays); its folds were APPENDED (oldest
 *  first) — read newest first, as foldToggle keeps them. Each list: foldsCap (the person's newest FOLDS_MAX + the seeds). */
export function viewFrom(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const c = v.collapsed && typeof v.collapsed === 'object' ? v.collapsed : {};
  const list = (g) => (Array.isArray(c[g]) ? foldsCap((v.v === VIEW_VERSION ? c[g] : c[g].slice().reverse()).filter((x) => typeof x === 'string'), g) : DEFAULT_VIEW.collapsed[g].slice());
  const group = GROUPS.includes(v.group) && (v.v === VIEW_VERSION || v.group !== 'kind') ? v.group : DEFAULT_VIEW.group;
  return { v: VIEW_VERSION, group, sort: SORTS.includes(v.sort) ? v.sort : DEFAULT_VIEW.sort, collapsed: { intent: list('intent'), kind: list('kind'), helper: list('helper'), day: list('day') } };
}
/** THE LIST'S PLAN (the popover): what to draw, in order — sections [{key, head, rows, open, folders}] (a section over
 *  FOLDER_OVER rows in two folders or more carries `folders` [{key, head, rows, open, bare, ctx}] — every row in exactly
 *  one; never a «show more»; a folder's `ctx` = its rows' words context: `inFolder`, the BARE names), the count words'
 *  inputs, the zero-match flag and the row words' context (listCtx). A collapsed section or folder with a
 *  match in a name / folder / path / helper (or the kind's whole word) opens while filtering (its remembered state
 *  untouched) — a kind word's prefix alone never does; a head the person tapped while filtering is a PEEK (`peek`: key →
 *  open, the popover's own memory — never the stored folds; r3). THE 最近 BAND holds the newest changes
 *  NO OPEN SECTION DRAWS (a row never shows twice on one screen) — gone when every one of them is already shown; by
 *  intent it sits just above «touched» (its rows are the folded ones; the first screen stays the attention list),
 *  otherwise first. */
export function listPlan(v, { q = '', group = 'intent', sort = 'changed', collapsed = [], kindWord = null, peek = null, hubWord = 'Local' } = {}) {
  const items = asRows(v && v.items), code = asRows(v && v.code);
  const all = [...items, ...code];
  const ctx = listCtx(v, { hubWord }), names = ctx.names;
  const f = filterRows(all, q, { ...ctx, kindWord }), filtering = !!f.q;
  const shut = new Set(collapsed);
  const peeked = (key) => filtering && peek && typeof peek.has === 'function' && peek.has(key);
  const unfold = (key, rs) => (peeked(key) ? !!peek.get(key) : !shut.has(key) || (filtering && rs.some((r) => !f.weak.has(r.key)))); // a folded hit opens — never on a kind word's prefix alone; a peek wins while filtering
  const inFolder = (rs) => ({ ...ctx, inFolder: true, names: new Map(rs.map((r) => [r.key, str(r.name)])) }); // the head names the folder — ONE directory (r3), so the BARE name
  const sections = [], drawn = new Set();
  for (const g of orderRows(f.rows, { group, sort })) {
    const open = unfold(g.head.key, g.rows);
    const subs = g.rows.length > FOLDER_OVER ? foldersOf(g.rows, { section: g.head.key, sort, cwd: ctx.cwd, host: ctx.host, hubWord: ctx.hubWord, hostNames: ctx.hostNames, folders: ctx.folders }) : [];
    const folders = subs.length > 1 ? subs.map((x) => ({ key: x.head.key, head: x.head, rows: x.rows, bare: !x.head.label, open: !x.head.label || unfold(x.head.key, x.rows), ctx: x.head.label ? inFolder(x.rows) : null })) : null; // one folder = no sub-head
    if (open) for (const x of folders || [{ rows: g.rows, open: true }]) if (x.open) for (const r of x.rows) drawn.add(r.key);
    sections.push({ key: g.head.key, head: g.head, rows: g.rows, open, folders });
  }
  const recent = recentShown({ total: all.length, filtering }) ? recentOf(all).filter((r) => !drawn.has(r.key)) : [];
  if (recent.length) {
    const ti = sections.findIndex((x) => x.key === 'i:touched');
    const at = group !== 'intent' ? 0 : ti >= 0 ? ti : sections.length; // by intent: beside the folded band its rows come from — never on the attention list's first screen
    sections.splice(at, 0, { key: 'recent', head: { key: 'recent', group: 'recent', label: '', count: recent.length }, rows: recent, open: !shut.has('recent'), folders: null });
  }
  return { sections, filtering, empty: filtering && !f.rows.length, count: { items: items.length, code: code.length, filtered: filtering ? f : null }, q: f.q, ctx };
}
