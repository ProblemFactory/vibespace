'use strict';
// A CONVERSATION'S DELIVERABLES, DERIVED (lane artifacts-model, owner 2026-10-05; docs/design-artifacts.zh.md).
// The product never asks the agent to DECLARE what it made (teaching a tool forks the deliverables): it reads what it
// already WITNESSED — the harness's write record (claude Write / Edit, codex apply_patch, an ACP diff) and the user's
// own saves — and folds it into ONE row per file. PURE (CJS, imports nothing but the ONE extension table): the server's
// stdout consumer, the rebuild's replay, the normalizer's card and the client's chip all read THIS file.
//
// THE ROW: {key: host+':'+path, host, path, name, kind, firstAt, lastAt, by: agent|user, writes, edits, lastOp, bytes,
//           lastId}. `kind` ∈ KINDS (closed; `other` is a kind, never a throw). `lastId` = the op that last moved it
//           (a record seen twice — parse + device feed, an ACP tool_call + its update — moves it once).
// THE REDUCER: `apply(rows, op)` → {rows, row, born, evicted, skipped}; `fold(rows, op)` = its rows. A write births or
//           re-births, an edit bumps (an edit on a path never written here is still a row), the same path twice = one
//           row. Rows are a plain object keyed by `key` (session-meta `artifacts` persists it as is).
// BOUNDS:   ≤ MAX_ROWS per conversation; past it the oldest CODE rows go first, then the oldest of the rest — every
//           eviction is returned (the consumer logs it) and `view()` says the list is `full`.
// THE VIEW: `view(rows)` = the chip's order: doc › page › design › media › upload › other, newest-changed first in each,
//           code folded behind a count.
//
// THE CONTRACT TOWARD doc-window (the Doc window lane — it calls both; spelled here and in kb-file-structure):
//   ownerOf({host, path}) → {sessionId, row} | null   — the newest conversation whose registry holds the path
//   noteEdit({sessionId, host, path, summary})          — ONE next-turn note to that conversation through the stash
//                                                         (free, never a billed wake): "[Doc edit] <path>: <summary>"
// Both live on the server (src/server/artifact-registry.js); this file owns their PURE halves: `ownerOfIn` (the pick
// over every live registry) and `editNoteText` (the one line). Until doc-window lands the raw code editor's save calls
// noteEdit with "+a −b lines" (`lineDelta`).
const { FILE_TYPES } = require('./file-type-table.js');

const KINDS = Object.freeze(['doc', 'page', 'design', 'media', 'upload', 'code', 'other']);
const VIEW_ORDER = Object.freeze(['doc', 'page', 'design', 'media', 'upload', 'other']);
const OPS = Object.freeze(['write', 'edit']);
const BY = Object.freeze(['agent', 'user']);
const MAX_ROWS = 500;
// a category of the extension table → the deliverable kind
const CATEGORY_KIND = Object.freeze({
  text: 'doc', document: 'doc', office: 'doc', data: 'doc',
  image: 'media', audio: 'media', video: 'media',
  web: 'page', code: 'code', archive: 'other', unknown: 'other',
});
// markdown that steers an agent (config, never a deliverable — half of all Writes in the study were these)
const AGENT_CONFIG_NAMES = new Set(['claude.md', 'agents.md', 'gemini.md', 'skill.md', 'memory.md', 'claude.local.md']);
const AGENT_CONFIG_DIR = /(?:^|\/)\.(?:claude|codex|cursor|gemini|opencode)\//;
// a project's own scaffolding (lane artifacts-e2e): a row BORN BY AN EDIT of one is code — the conversation touched a file
// it never wrote ("change line 2 of README.md" drew a document card in the real-Opus run); one the conversation WROTE
// keeps its extension's kind ("write me a README" is the deliverable)
const PROJECT_FILE = /^(?:readme|changelog|changes|contributing|license|licence|code_of_conduct|security|authors|notice)(?:\.[a-z0-9]+)?$/i;
// the closed kind set's words (the client's chip and card say them; en/zh/ja)
const KIND_WORDS = Object.freeze({
  doc: { en: 'Document', zh: '文档', ja: 'ドキュメント' },
  page: { en: 'Page', zh: '页面', ja: 'ページ' },
  design: { en: 'Design', zh: '设计', ja: 'デザイン' },
  media: { en: 'Media', zh: '媒体', ja: 'メディア' },
  upload: { en: 'Upload', zh: '上传', ja: 'アップロード' },
  code: { en: 'Code', zh: '代码', ja: 'コード' },
  other: { en: 'File', zh: '文件', ja: 'ファイル' },
});

const baseName = (p) => String(p || '').replace(/\/+$/, '').split('/').pop() || String(p || '');
function extOf(p) { const b = baseName(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; }
/** The deliverable kind of a path, by extension through the ONE table; agent-steering markdown is code. */
function kindOf(path, op = null) {
  const p = String(path || '');
  if (AGENT_CONFIG_NAMES.has(baseName(p).toLowerCase()) || AGENT_CONFIG_DIR.test(p)) return 'code';
  if (op === 'edit' && PROJECT_FILE.test(baseName(p))) return 'code';
  const e = FILE_TYPES[extOf(p)];
  return (e && CATEGORY_KIND[e.category]) || 'other';
}
const isKind = (k) => KINDS.includes(k);
const normHost = (h) => (h && h !== 'local' ? String(h) : '');
/** A path made absolute against the conversation's cwd when the record carried a relative one. */
function absPath(path, cwd) {
  let p = String(path || '').trim();
  if (!p) return '';
  if (p.startsWith('/') || p.startsWith('~')) return p.replace(/\/{2,}/g, '/');
  if (!cwd) return p;
  p = p.replace(/^(?:\.\/)+/, '');
  return (String(cwd).replace(/\/+$/, '') + '/' + p).replace(/\/{2,}/g, '/');
}
const keyOf = (host, path) => normHost(host) + ':' + path;

/** THE ONE REDUCER. `op` = {host, path, op: 'write'|'edit', by?, at?, bytes?, id?, kind?, cwd?}. Never throws: an op
 *  it cannot read is `skipped` with a reason. Returns a NEW rows object (the input is not mutated). */
function apply(rows, op) {
  const cur = rows && typeof rows === 'object' ? rows : {};
  const o = op || {};
  const path = absPath(o.path, o.cwd);
  if (!path) return { rows: cur, row: null, born: false, evicted: [], skipped: 'no-path' };
  if (!OPS.includes(o.op)) return { rows: cur, row: null, born: false, evicted: [], skipped: 'bad-op' };
  const by = BY.includes(o.by) ? o.by : 'agent';
  const at = Number.isFinite(o.at) && o.at > 0 ? o.at : 0;
  const host = normHost(o.host);
  const key = keyOf(host, path);
  const prev = cur[key] || null;
  if (prev && o.id && prev.lastId === o.id) return { rows: cur, row: prev, born: false, evicted: [], skipped: 'seen' };
  const row = prev ? { ...prev } : { key, host, path, name: baseName(path), kind: isKind(o.kind) ? o.kind : kindOf(path, o.op), firstAt: at, lastAt: at, by, writes: 0, edits: 0, lastOp: o.op, bytes: null, lastId: null };
  if (prev && isKind(o.kind) && o.kind !== 'code' && row.kind !== o.kind) row.kind = o.kind; // a registry's kind (page / design / upload) names it better than an extension
  if (o.op === 'write' && by === 'agent') row.writes += 1; else row.edits += 1;
  row.by = by; row.lastOp = o.op;
  if (at) { row.lastAt = Math.max(row.lastAt || 0, at); if (!row.firstAt) row.firstAt = at; }
  if (Number.isFinite(o.bytes)) row.bytes = o.bytes;
  row.lastId = o.id ? String(o.id) : null;
  const next = { ...cur, [key]: row };
  const evicted = prev ? [] : evictOver(next, key);
  return { rows: next, row, born: !prev, evicted, skipped: null };
}
const fold = (rows, op) => apply(rows, op).rows;
/** Past MAX_ROWS: the oldest code rows, then the oldest of the rest (never the row just born). Mutates `rows`. */
function evictOver(rows, keep) {
  const keys = Object.keys(rows);
  if (keys.length <= MAX_ROWS) return [];
  const victims = keys.filter((k) => k !== keep).map((k) => rows[k])
    .sort((a, b) => ((a.kind === 'code' ? 0 : 1) - (b.kind === 'code' ? 0 : 1)) || ((a.lastAt || 0) - (b.lastAt || 0)))
    .slice(0, keys.length - MAX_ROWS).map((r) => r.key);
  for (const k of victims) delete rows[k];
  return victims;
}
/** Two row sets of ONE conversation (the transcript's re-derivation + the persisted rows that also carry the user's
 *  own saves) → one: per key the larger counts, the later change's `by`/`lastOp`, the earlier birth. */
function merge(a, b) {
  const out = { ...(a || {}) };
  for (const [k, r] of Object.entries(b || {})) {
    if (!r || typeof r !== 'object') continue;
    const p = out[k];
    if (!p) { out[k] = { ...r }; continue; }
    const later = (r.lastAt || 0) > (p.lastAt || 0) ? r : p;
    out[k] = { ...p, writes: Math.max(p.writes || 0, r.writes || 0), edits: Math.max(p.edits || 0, r.edits || 0),
      firstAt: Math.min(p.firstAt || Infinity, r.firstAt || Infinity) === Infinity ? 0 : Math.min(p.firstAt || Infinity, r.firstAt || Infinity),
      lastAt: Math.max(p.lastAt || 0, r.lastAt || 0), by: later.by, lastOp: later.lastOp, bytes: later.bytes ?? p.bytes ?? null, lastId: later.lastId ?? null };
  }
  evictOver(out, null);
  return out;
}
/** THE CHIP'S ORDER: deliverables by kind (VIEW_ORDER), newest change first in each; code behind a count. */
function view(rows) {
  const all = Object.values(rows || {}).filter((r) => r && r.key);
  const byNew = (a, b) => (b.lastAt || 0) - (a.lastAt || 0) || String(a.key).localeCompare(String(b.key));
  const items = all.filter((r) => r.kind !== 'code').sort((a, b) => (VIEW_ORDER.indexOf(a.kind) - VIEW_ORDER.indexOf(b.kind)) || byNew(a, b));
  const code = all.filter((r) => r.kind === 'code').sort(byNew);
  return { items, code, count: items.length, codeCount: code.length, total: all.length, full: all.length >= MAX_ROWS };
}
/** Does a row get a chat CARD? Every deliverable does; code (CLAUDE.md, a .py) stays in the chip's fold only. */
const cardWorthy = (row) => !!(row && row.kind !== 'code');
/** The card's block (structure, never markup): what the normalizer sends and the client draws. */
function cardBlock(row) {
  if (!row || !row.key) return null;
  return { type: 'artifact', key: row.key, host: row.host || '', path: row.path, name: row.name, kind: row.kind,
    by: row.by, writes: row.writes || 0, edits: row.edits || 0, lastOp: row.lastOp, firstAt: row.firstAt || 0, lastAt: row.lastAt || 0 };
}
/** The card's / list row's FACTS (the client words them through t()): `changes` = re-writes + edits. */
function cardFacts(b) {
  const w = (b && b.writes) || 0, e = (b && b.edits) || 0;
  return { name: (b && b.name) || '', kind: (b && b.kind) || 'other', path: (b && b.path) || '', changes: Math.max(0, w - 1) + e, byUser: !!(b && b.by === 'user'), lastAt: (b && b.lastAt) || 0 };
}
/** AUTO-OPEN (setting artifacts.autoOpenDocs): only the BIRTH of a doc by the agent's write — an edit never re-opens. */
const autoOpenVerdict = ({ born, row } = {}) => !!(born && row && row.kind === 'doc' && row.by === 'agent' && row.lastOp === 'write');
/** The newest conversation whose registry holds {host, path}: `registries` = [{sessionId, rows}]. */
function ownerOfIn(registries, { host, path } = {}) {
  const key = keyOf(host, String(path || ''));
  let best = null;
  for (const r of registries || []) {
    const row = r && r.rows && r.rows[key];
    if (row && (!best || (row.lastAt || 0) > (best.row.lastAt || 0))) best = { sessionId: r.sessionId, row };
  }
  return best;
}
/** The ONE next-turn line a user's edit becomes (bounded; the summary is the editor's words, never file content). */
function editNoteText({ path, summary } = {}) {
  const s = String(summary || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return `[Doc edit] ${String(path || '').slice(0, 500)}: ${s || 'edited by the user'}`;
}
/** "+a −b lines" between two texts — a cheap line-multiset diff the raw editor can afford on every save. */
function lineDelta(before, after) {
  const count = (s) => { const m = new Map(); for (const l of String(s ?? '').split('\n')) m.set(l, (m.get(l) || 0) + 1); return m; };
  const a = count(before), b = count(after);
  let add = 0, del = 0;
  for (const [l, n] of b) add += Math.max(0, n - (a.get(l) || 0));
  for (const [l, n] of a) del += Math.max(0, n - (b.get(l) || 0));
  return { add, del, text: `+${add} −${del} lines` };
}
const kindWord = (kind, lang = 'en') => (KIND_WORDS[kind] || KIND_WORDS.other)[lang] || (KIND_WORDS[kind] || KIND_WORDS.other).en;

module.exports = { KINDS, VIEW_ORDER, OPS, BY, MAX_ROWS, CATEGORY_KIND, KIND_WORDS, kindOf, absPath, keyOf, apply, fold, merge, view,
  cardWorthy, cardBlock, cardFacts, autoOpenVerdict, ownerOfIn, editNoteText, lineDelta, kindWord, baseName };
