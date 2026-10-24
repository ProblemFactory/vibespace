'use strict';
// THE CONTEXT TABLE (lane task-group-context, POC v2.2 + the owner's fourth level, 2026-10-23). PURE — imports nothing;
// the store (src/task-groups.js), the routes, the migration and the Task Group window share it.
//
// A Task Group's `ctx` is ONE ordered list of rows. It replaces `folders[]` (auto-include) + `contextDir` (the shared
// notes folder) + the export file as the place that says what a member conversation is told:
//   { path, note, tell, tags, share, keys? }   a folder or a file, as TYPED (relative = see resolveRows)
//   { ref, note }                               引用任务组「X」的 Context 表 — X's rows marked shareable, told here
// `tell` — how much the agent is told (告诉 agent, four levels, the owner's change on POC v2.2):
//   'note'      只说明: the path + the note
//   'names'     文件名: + the file listing
//   'index'     文件名 + 关键文件内容: + the CONTENTS of the row's key files (`keys`, default KEY_FILES)
//   'contents'  内容: every file, within the budget
//   absent = the kind's default (a folder 'index', a file 'contents'); a row over the budget steps DOWN and says so.
// `tags` — plain verbs: 'discover' (自动发现会话: conversations started here join — the old folders[], recursive),
//   'notes' (agent 在这里记笔记: the old contextDir — ONE row, the .vibespace/TASK.md mirror lives there), 'readonly'
//   (不许 agent 改; excludes 'notes'). `share` — 其他任务组可引用: null | 'ro' | 'rw' (a readonly row only 'ro').
// Derived, never stored twice: discoverFolders() = the old folders[], notesDir() = the old contextDir.

const TELL = ['note', 'names', 'index', 'contents'];
const TAGS = ['discover', 'notes', 'readonly'];
const SHARES = ['ro', 'rw'];
const KEY_FILES = ['CLAUDE.md', 'README.md', 'HANDOFF.md', 'handbook.md', 'TASK.md'];
const DEFAULT_BUDGET = 10240;      // the table's injection budget (setting tasks.contextBudgetBytes; POC open question 5)
const MAX_ROWS = 100;
const LIMITS = { path: 1024, note: 500, keys: 12, key: 120 };
const GROUP_ID_RE = /^T-[\w.-]{1,100}$/;
const HOST_RE = /^([^:/\s]+)::(\/.*)$/;   // host::/path — a folder on another machine (the old folders[] form)

const oneLine = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s*\n\s*/g, ' ').trim().slice(0, max);
const trimSlash = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/** One row as the store keeps it, or null (unusable). `selfId` = the group's own id (a row never references itself). */
function sanitizeRow(raw, { selfId = null } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const note = oneLine(raw.note, LIMITS.note);
  if (typeof raw.ref === 'string') {
    const ref = raw.ref.trim();
    if (!GROUP_ID_RE.test(ref) || ref === selfId) return null;
    return { ref, note };
  }
  if (typeof raw.path !== 'string') return null;
  const p = trimSlash(oneLine(raw.path, LIMITS.path));
  if (!p) return null;
  const tags = [];
  for (const t of Array.isArray(raw.tags) ? raw.tags : []) if (TAGS.includes(t) && !tags.includes(t)) tags.push(t);
  if (tags.includes('notes') && tags.includes('readonly')) tags.splice(tags.indexOf('readonly'), 1);   // 记笔记 and 不许改 exclude each other — the writable one wins
  let share = SHARES.includes(raw.share) ? raw.share : null;
  if (share === 'rw' && tags.includes('readonly')) share = 'ro';   // a 不许改 row can only be shared read-only
  const row = { path: p, note, tell: TELL.includes(raw.tell) ? raw.tell : null, tags, share };
  if (Array.isArray(raw.keys)) {
    const keys = [];
    for (const k of raw.keys) {
      const v = oneLine(k, LIMITS.key);
      if (v && !v.includes('/') && v !== '.' && v !== '..' && !keys.includes(v)) keys.push(v);
      if (keys.length >= LIMITS.keys) break;
    }
    if (keys.join('\n') !== KEY_FILES.join('\n')) row.keys = keys;   // the default set is not stored
  }
  return row;
}

/** The whole table: ≤ 100 rows, ONE 'notes' row (the first keeps it), no duplicate row. */
function sanitizeRows(rows, { selfId = null } = {}) {
  const out = [];
  const seen = new Set();
  let notes = false;
  for (const raw of Array.isArray(rows) ? rows : []) {
    const r = sanitizeRow(raw, { selfId });
    if (!r) continue;
    const k = r.ref ? 'ref:' + r.ref : 'path:' + r.path;
    if (seen.has(k)) continue;
    seen.add(k);
    if (r.tags && r.tags.includes('notes')) { if (notes) r.tags = r.tags.filter((t) => t !== 'notes'); notes = true; }
    out.push(r);
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

const isRemote = (p) => HOST_RE.test(p);
const isRooted = (p) => p.startsWith('/') || p === '~' || p.startsWith('~/') || isRemote(p);
const joinPath = (base, rel) => (base === '/' ? '/' + rel : base + '/' + rel).replace(/\/+/g, '/').replace(/\/\.(?=\/|$)/g, '');
const parentOf = (p) => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
function normAbs(p) {
  const parts = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return '/' + parts.join('/');
}

/**
 * Where each row points. `kindOf(abs)` → 'dir' | 'file' | 'missing' | 'blocked' (the caller's stat, behind its mount
 * door) | 'reading' (lane hub-fuse-sync-guard: on a storage mount, read off the main thread — its first answer has not
 * landed). Returns one entry per row: { abs, kind, via } — via 'abs' | 'home' (a ~ path) | 'prev' (the previous row's
 * folder) | 'first' (the group's first folder) | 'homerel' (a relative path found under home) | 'host' | null.
 * A RELATIVE path resolves against the previous path row's folder, then the group's first folder (the first rooted row
 * that is a folder), then home — the first candidate that exists; none ⇒ { abs: null, kind: 'missing', tried }.
 * A ref row → { ref: true }.
 */
function resolveRows(rows, { home = '/', kindOf = () => 'missing' } = {}) {
  const H = trimSlash(home || '/');
  const out = [];
  const rooted = (p) => (p === '~' ? H : p.startsWith('~/') ? normAbs(joinPath(H, p.slice(2))) : normAbs(p));
  let first = null;
  for (const r of rows || []) {
    if (r && r.path && isRooted(r.path) && !isRemote(r.path)) { const a = rooted(r.path); if (kindOf(a) === 'dir') { first = a; break; } }
  }
  let prev = null;   // the previous path row's folder
  for (const r of rows || []) {
    if (!r || r.ref) { out.push({ ref: true }); continue; }
    let res;
    const hm = HOST_RE.exec(r.path);
    if (hm) res = { abs: r.path, kind: 'remote', via: 'host', host: hm[1] };
    else if (isRooted(r.path)) { const a = rooted(r.path); res = { abs: a, kind: kindOf(a), via: r.path.startsWith('~') ? 'home' : 'abs' }; }
    else {
      const tried = [];
      for (const [base, via] of [[prev, 'prev'], [first, 'first'], [H, 'homerel']]) {
        if (!base || tried.some((t) => t.base === base)) continue;
        const a = normAbs(joinPath(base, r.path));
        const k = kindOf(a);
        tried.push({ base, via });
        if (k === 'dir' || k === 'file' || k === 'blocked' || k === 'reading') { res = { abs: a, kind: k, via }; break; }
      }
      if (!res) res = { abs: null, kind: 'missing', via: null, tried: tried.map((t) => t.via) };
    }
    out.push(res);
    if (res.abs && !hm) prev = res.kind === 'file' ? parentOf(res.abs) : res.kind === 'dir' ? res.abs : prev;
  }
  return out;
}

/** The old folders[]: every 'discover' row with a path (a rooted folder matches by its string even while it is not
 *  there — the old behaviour; a relative one only once it resolves; a file never). [{ path, recursive: true }] */
function discoverFolders(rows, res) {
  const out = [];
  (rows || []).forEach((r, i) => {
    const x = res && res[i];
    if (!r || r.ref || !r.tags || !r.tags.includes('discover') || !x || !x.abs || x.kind === 'file') return;
    if (!out.some((f) => f.path === x.abs)) out.push({ path: x.abs, recursive: true });
  });
  return out;
}

/** The old contextDir: the 'notes' row's absolute folder (never a file, never another machine's), or null. */
function notesDir(rows, res) {
  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i], x = res && res[i];
    if (r && !r.ref && r.tags && r.tags.includes('notes')) return x && x.abs && x.kind !== 'file' && x.kind !== 'remote' ? x.abs : null;
  }
  return null;
}

/** The level a row asks for: its own, else the kind's default (a folder 文件名 + 关键文件内容, a file 内容). A file has no
 *  separate key-file level — 'index' on a file reads as 'contents'. */
function chosenTell(row, kind) {
  const t = row && TELL.includes(row.tell) ? row.tell : (kind === 'file' ? 'contents' : 'index');
  return kind === 'file' && t === 'index' ? 'contents' : t;
}

/** One step down: 内容 → 文件名 + 关键文件内容 → 文件名 → 只说明 (a file skips the key-file level). */
function stepDown(level, kind) {
  if (level === 'contents') return kind === 'file' ? 'names' : 'index';
  if (level === 'index') return 'names';
  return 'note';
}

/**
 * THE BUDGET, in table order. items = [{ kind, chosen, cost }] — `cost` = { note, names, index, contents } (bytes of each
 * level's rendering; absent = the row cannot have it) or a function (level, left) → bytes, asked lazily (a level above
 * the one told is never rendered; past `left` it may answer an estimate, Infinity = it cannot be told whole). Each row
 * takes its chosen level when it fits the bytes left, else steps down until it fits; the note line is always told (one
 * line per row). → [{ level, from, need, left }] (from = the chosen level when it stepped down; need = what the chosen
 * level needed — null when it cannot be told whole; left = what was left for the row).
 */
function planRows(items, budget) {
  let left = Math.max(0, Number(budget) || 0);
  return (items || []).map((it) => {
    const was = left;
    const costOf = (lvl) => { const c = typeof it.cost === 'function' ? it.cost(lvl, was) : it.cost ? it.cost[lvl] : undefined; return Number.isFinite(c) ? c : Infinity; };
    let level = it.chosen || 'note';
    const need = costOf(level);
    let cost = need;
    while (level !== 'note' && !(cost <= left)) { level = stepDown(level, it.kind); cost = costOf(level); }
    left = Math.max(0, left - (Number.isFinite(cost) ? cost : 0));
    return { level, from: level !== it.chosen ? it.chosen : null, need: Number.isFinite(need) ? need : null, left: was };
  });
}

/** The rows another group may reference: those it marked 其他任务组可引用, read-only unless 'rw'. Each keeps its own
 *  tell / keys; its discover / notes verbs are its own group's business and do not travel. */
function sharedRows(rows) {
  return (rows || []).filter((r) => r && !r.ref && SHARES.includes(r.share))
    .map((r) => ({ path: r.path, note: r.note, tell: r.tell, tags: r.share === 'rw' ? [] : ['readonly'], share: null, ...(r.keys ? { keys: r.keys } : {}) }));
}

/** ONE migration's rows from the old fields (2026-10-task-group-context-rows): every folders[] entry → {tell: 'names',
 *  tags: ['discover']}, contextDir → {tell: 'names', tags: ['notes']} (merged into the folder's row when it IS one of
 *  them). → { rows, folders, nonRecursive, notes, merged } */
function rowsFromLegacy({ folders, contextDir } = {}) {
  const rows = [];
  let nonRecursive = 0;
  for (const f of Array.isArray(folders) ? folders : []) {
    const p = typeof f === 'string' ? f : f && typeof f.path === 'string' ? f.path : null;
    if (!p || !p.trim()) continue;
    if (f && typeof f === 'object' && f.recursive === false) nonRecursive++;
    rows.push({ path: p.trim(), note: '', tell: 'names', tags: ['discover'], share: null });
  }
  let notes = 0, merged = 0;
  if (typeof contextDir === 'string' && contextDir.trim()) {
    const p = trimSlash(contextDir.trim());
    const same = rows.find((r) => trimSlash(r.path) === p);
    if (same) { same.tags.push('notes'); merged = 1; } else rows.push({ path: p, note: '', tell: 'names', tags: ['notes'], share: null });
    notes = 1;
  }
  return { rows: sanitizeRows(rows), folders: rows.filter((r) => r.tags.includes('discover')).length, nonRecursive, notes, merged };
}

/** The OLD write doors keep working (the CLI's --folder / --context-dir ship to other hosts; an agent manager's verb;
 *  an old client bundle): `folders` = exactly these auto-include folders, `contextDir` = this notes folder (null = none).
 *  A row that existed only for the verb being taken away (no other tag, no note) goes with it. `res` = resolveRows of
 *  `rows` (a row matches by its typed path or its resolution). */
function applyLegacyPatch(rows, res, { folders, contextDir } = {}) {
  let out = (rows || []).map((r) => (r.ref ? { ...r } : { ...r, tags: [...(r.tags || [])] }));
  const absOf = (i) => (res && res[i] && res[i].abs) || null;
  const idxOf = (p) => out.findIndex((r, i) => !r.ref && (trimSlash(r.path) === p || absOf(i) === p));
  const keep = (r) => r.ref || r.tags.length || r.note;
  if (folders !== undefined) {
    const want = [];
    for (const f of Array.isArray(folders) ? folders : []) {
      const p = typeof f === 'string' ? f : f && typeof f.path === 'string' ? f.path : '';
      if (p && p.trim() && !want.includes(trimSlash(p.trim()))) want.push(trimSlash(p.trim()));
    }
    const hits = new Set(want.map(idxOf).filter((i) => i >= 0));
    out.forEach((r, i) => { if (!r.ref && r.tags.includes('discover') && !hits.has(i)) r.tags = r.tags.filter((t) => t !== 'discover'); });
    for (const p of want) {
      const i = idxOf(p);
      if (i >= 0) { if (!out[i].tags.includes('discover')) out[i].tags.push('discover'); }
      else out.push({ path: p, note: '', tell: 'names', tags: ['discover'], share: null });
    }
  }
  if (contextDir !== undefined) {
    out.forEach((r) => { if (!r.ref) r.tags = r.tags.filter((t) => t !== 'notes'); });
    const p = typeof contextDir === 'string' && contextDir.trim() ? trimSlash(contextDir.trim()) : null;
    if (p) {
      const i = idxOf(p);
      if (i >= 0) { out[i].tags = out[i].tags.filter((t) => t !== 'readonly'); out[i].tags.push('notes'); }
      else out.push({ path: p, note: '', tell: 'names', tags: ['notes'], share: null });
    }
  }
  out = out.filter(keep);
  return sanitizeRows(out);
}

module.exports = {
  TELL, TAGS, SHARES, KEY_FILES, DEFAULT_BUDGET, MAX_ROWS, LIMITS, GROUP_ID_RE,
  sanitizeRow, sanitizeRows, resolveRows, discoverFolders, notesDir, chosenTell, stepDown, planRows, sharedRows,
  rowsFromLegacy, applyLegacyPatch, isRemote, parentOf,
};
