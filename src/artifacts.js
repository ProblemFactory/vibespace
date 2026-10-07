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
// THE VIEW: `view(rows)` = the chip's order: doc › service › page › design › media › upload › other, newest-changed first in each,
//           code folded behind a count.
//
// THE CONTRACT TOWARD doc-window (the Doc window lane — it calls both; spelled here and in kb-file-structure):
//   ownerOf({host, path}) → {sessionId, row} | null   — the newest conversation whose registry holds the path
//   noteEdit({sessionId, host, path, summary})          — ONE next-turn note to that conversation through the stash
//                                                         (free, never a billed wake): "[Doc edit] <path>: <summary>"
// Both live on the server (src/server/artifact-registry.js); this file owns their PURE halves: `ownerOfIn` (the pick
// over every live registry) and `editNoteText` (the one line). Until doc-window lands the raw code editor's save calls
// noteEdit with "+a −b lines" (`lineDelta`).
//
// THE REGISTRIES (lane artifacts-registries, the owner's "统一产物"): the three stores that already list a conversation's
// things feed THIS reducer — never a second list. A published page (src/server/published-pages.js `onPublished`) is a
// `page` row on its SOURCE file carrying the /p/ link (`url`) and `state` published | unpublished (an unpublish never
// deletes the row); a design (src/server/design-engine.js designs.json, at registration / open) is a `design` row on its
// folder; a file attached in the composer (POST /api/upload with the chat's sessionId) is an `upload` row by: user.
// Their ops (REG_OPS) never count as a write or an edit; their kind outranks an extension's (KIND_RANK: a published
// design stays a design, an uploaded .md the agent then edits stays an upload). `pageOp` / `designOp` / `uploadOp` turn
// a store's record into the op; `storeRows` folds a conversation's pages + designs at every rebuild (the uploads live in
// the persisted rows — the composer's record IS this registry).
const { FILE_TYPES } = require('./file-type-table.js');

const KINDS = Object.freeze(['doc', 'service', 'page', 'design', 'media', 'upload', 'code', 'other']);
const VIEW_ORDER = Object.freeze(['doc', 'service', 'page', 'design', 'media', 'upload', 'other']); // lane artifacts-services: what a conversation RUNS reads first after its docs
const OPS = Object.freeze(['write', 'edit']);
const REG_OPS = Object.freeze(['publish', 'unpublish', 'open', 'upload', 'handover']); // a store's fact: births / names a row, never counts (lane artifacts-handover: + a helper conversation's hand-over)
const KIND_RANK = Object.freeze({ design: 3, page: 2, upload: 1 }); // a registry's kind over an extension's (and design › page › upload)
const outranks = (a, b) => (KIND_RANK[a] || 0) > (KIND_RANK[b] || 0);
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
  service: { en: 'Service', zh: '服务', ja: 'サービス' },
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
  if (!OPS.includes(o.op) && !REG_OPS.includes(o.op)) return { rows: cur, row: null, born: false, evicted: [], skipped: 'bad-op' };
  const by = BY.includes(o.by) ? o.by : 'agent';
  const at = Number.isFinite(o.at) && o.at > 0 ? o.at : 0;
  const host = normHost(o.host);
  const key = keyOf(host, path);
  const prev = cur[key] || null;
  if (prev && o.id && prev.lastId === o.id) return { rows: cur, row: prev, born: false, evicted: [], skipped: 'seen' };
  const row = prev ? { ...prev } : { key, host, path, name: baseName(path), kind: isKind(o.kind) ? o.kind : kindOf(path, o.op), firstAt: at, lastAt: at, by, writes: 0, edits: 0, lastOp: o.op, bytes: null, lastId: null };
  if (prev && isKind(o.kind) && o.kind !== 'code' && row.kind !== o.kind && !outranks(row.kind, o.kind)) row.kind = o.kind; // a registry's kind (page / design / upload) names it better than an extension
  if (REG_OPS.includes(o.op)) { if (o.url !== undefined) row.url = o.url ? String(o.url) : null; if (o.state) row.state = String(o.state); if (o.name) row.name = String(o.name).slice(0, 200); }
  else if (o.op === 'write' && by === 'agent') row.writes += 1; else row.edits += 1;
  const via = viaOf(o.via);
  if (via && (!prev || !row.via)) row.via = via; // lane artifacts-handover: WHO made it for this conversation (a subagent / a helper conversation) — the birth's
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
    const reg = {}; // the registries' facts: the later side's, else whichever side has them; the higher-ranked kind
    for (const f of ['url', 'state']) { const v = later[f] !== undefined ? later[f] : (p[f] !== undefined ? p[f] : r[f]); if (v !== undefined) reg[f] = v; }
    if (!p.via && r.via) reg.via = r.via; // lane artifacts-handover: the birth's helper; the hand-overs of both sides
    if (r.handedTo || p.handedTo) reg.handedTo = handedUnion(p.handedTo, r.handedTo);
    if (outranks(r.kind, p.kind)) reg.kind = r.kind;
    if (r.name && (outranks(r.kind, p.kind) || (r.kind === p.kind && later === r))) reg.name = r.name; // a design's newer title
    out[k] = { ...p, ...reg, writes: Math.max(p.writes || 0, r.writes || 0), edits: Math.max(p.edits || 0, r.edits || 0),
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
    by: row.by, writes: row.writes || 0, edits: row.edits || 0, lastOp: row.lastOp, firstAt: row.firstAt || 0, lastAt: row.lastAt || 0,
    ...(row.url ? { url: row.url } : {}), ...(row.state ? { state: row.state } : {}),
    ...(row.via ? { via: row.via } : {}), ...(row.handedTo && row.handedTo.length ? { handedTo: row.handedTo } : {}),
    ...(row.kind === 'service' ? { jobId: row.jobId, port: row.port, since: row.since || 0, stoppedAt: row.stoppedAt || 0,
      via: row.via, localUrl: row.localUrl, forwardId: row.forwardId || null, ...(row.target ? { target: row.target } : {}), ...(row.publishedBy ? { publishedBy: row.publishedBy } : {}) } : {}) };
}
// THE PLACEMENT (lane artifacts-settle-position, owner 2026-10-07: every refresh grew stale cards at the bottom of a long
// conversation). `cardPlacement(row, {slabFirstAt, slabLastAt, live})` → 'tail' | 'at' | 'none': a LIVE birth appends
// ('tail'); a card a REBUILD places (the merged / store / service rows, a card queued behind it) lands at its OWN
// instant (`firstAt`) inside the loaded slab ('at'), after the slab's last record ('tail'), and NOWHERE when it is older
// than the slab's first record or has no instant ('none' — the chip is its home). A slab with no stamped record (a
// clockless harness) cannot say "older" ⇒ 'tail'. `timeSlot(list, at)` = the index of the first message stamped LATER
// than `at` (list.length when none): the splice point — never a sort of the list.
function cardPlacement(row, { slabFirstAt = 0, slabLastAt = 0, live = false } = {}) {
  if (live) return 'tail';
  const at = Number(row && row.firstAt) || 0;
  if (!at) return 'none';
  if (!slabFirstAt) return 'tail';
  if (at < slabFirstAt) return 'none';
  return at > (slabLastAt || slabFirstAt) ? 'tail' : 'at';
}
function timeSlot(list, at) {
  const n = Array.isArray(list) ? list.length : 0;
  for (let i = 0; i < n; i++) if ((Number(list[i] && list[i].ts) || 0) > at) return i;
  return n;
}
/** The card's / list row's FACTS (the client words them through t()): `changes` = re-writes + edits. */
function cardFacts(b) {
  const w = (b && b.writes) || 0, e = (b && b.edits) || 0;
  return { name: (b && b.name) || '', kind: (b && b.kind) || 'other', path: (b && b.path) || '', changes: Math.max(0, w - 1) + e, byUser: !!(b && b.by === 'user'), lastAt: (b && b.lastAt) || 0, state: (b && b.state) || '', url: (b && b.url) || '',
    via: viaOf(b && b.via), handedTo: (b && Array.isArray(b.handedTo) ? b.handedTo.map((x) => x && x.name).filter(Boolean) : []),
    ...(b && b.kind === 'service' ? { port: b.port || 0, since: b.since || 0, stoppedAt: b.stoppedAt || 0 } : {}) };
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
// ── THE REGISTRIES' OPS (a store's record → the reducer's op; null = nothing to say) ──
/** A published page (the pages store's public record; `removed` = the unpublish notification): a `page` row on its
 *  source file. The host is the srcKey's prefix only when the key IS `<host>:<srcPath>` (a namespaced key — the
 *  SendUserFile channel's — names no machine). Same page ⇒ same key ⇒ one row, however often it is re-published. */
function pageOp(page, { removed = false } = {}) {
  if (!page || !page.id) return null;
  const gone = !!(removed || page.removed);
  const k = String(page.srcKey || ''), i = k.indexOf(':'), src = String(page.srcPath || '');
  const host = i > 0 && k.slice(i + 1) === src && k.slice(0, i) !== 'local' ? k.slice(0, i) : '';
  return { op: gone ? 'unpublish' : 'publish', kind: 'page', host, path: src, url: String(page.path || '/p/' + page.id), state: gone ? 'unpublished' : 'published',
    at: gone ? 0 : Number(page.updatedAt) || 0, id: `page:${page.id}:${gone ? 'gone' : Number(page.updatedAt) || 0}` };
}
/** A design (designs.json's public row, at registration / open / rename): a `design` row on its folder, named by its title. */
function designOp(d) {
  if (!d || !d.dir) return null;
  return { op: 'open', kind: 'design', host: d.host || '', path: String(d.dir), name: String(d.title || ''), at: Number(d.openedAt) || 0, id: `design:${d.id || d.dir}:${Number(d.openedAt) || 0}:${String(d.title || '')}` }; // a rename moves the row (same openedAt)
}
/** A file the user attached in the composer (the upload route's result row): an `upload` row by: user. */
function uploadOp(f, { host = '', at = 0 } = {}) {
  if (!f || typeof f.path !== 'string' || !f.path) return null;
  return { op: 'upload', kind: 'upload', by: 'user', host, path: f.path, bytes: Number.isFinite(f.size) ? f.size : undefined, at };
}
/** A conversation's rows from the STORES (not the transcript) — the rebuild's third merge input. */
function storeRows({ pages = [], designs = [] } = {}) {
  let rows = {};
  for (const op of [...(pages || []).map((p) => pageOp(p)), ...(designs || []).map(designOp)]) if (op) rows = fold(rows, op);
  return rows;
}
// ── THE SERVICES (lane artifacts-services, owner 2026-10-06 "这个对话发布的最新页面也没有出现在下面") — a site or
// service a conversation RUNS: a Background Work job its conversation OWNS (the jobs engine's lineage: the owner
// conversation id, the same rule as job-model's ownedJobsView) that LISTENS on a TCP port (src/jobs.js `job.listen`,
// read off the job's pid tree on the engine's own tick). DERIVED, never stored here: the registry asks the jobs engine
// at every read (`serviceRows`), so a "Clear content…" has nothing of it to clear. A stopped job's row stays
// SERVICE_KEEP_MS greyed ("stopped at …"), then goes.
// THE LINK (lane artifacts-services-url, owner 2026-10-06 "你识别的这些服务怎么都是 raw tcp 链接，而不是用的转发后的地址") —
// a link the user clicks is an address the user can REACH (`serviceLink`, one ladder over server-side facts; the client
// only prints): ① the port's forward record (src/port-forward.js list()) is PUBLISHED ⇒ its publicUrl (frp — from
// anywhere) ▸ ② else this instance's own proxy, `<instance url>/proxy/<target>` (server.js mounts the unblocker at
// /proxy/ behind auth — reachable wherever the instance is, with the user's own session); the target = the job's port on
// this box, or a paired machine's forward listener `http://127.0.0.1:<localPort>/` ▸ ③ the raw `http://127.0.0.1:<port>/`
// is only the copyable "on the machine" line (`localUrl`) — never the link (a paired machine's port with no forward has
// no other address: via 'local'). NEVER the instance URL's HOST with the job's RAW port (an frp name forwards only the
// VibeSpace port — the .223 card linked a dead `http://<frp host>:8766/`).
const SERVICE_KEEP_MS = 24 * 60 * 60 * 1000;
const SERVICE_RUNNING = Object.freeze(['up', 'starting', 'awaiting-user']);
const jobOwnerCid = (j) => (j && ((j.ownerSession && j.ownerSession.conversationId) || (j.owner && j.owner.conversation && j.owner.conversation.id))) || null;
const LOCAL_HOST_ID = '__local__'; // src/port-forward.js LOCAL_ID — this box (the jobs engine's pid trees are local)
/** The forward record of (hostId, port) in PortForwardManager.list() — a published one first, then a live one. A record
 *  with a targetHost forwards a LAN machine behind that host — another address, never this port. */
function forwardFor(forwards, hostId, port) {
  const p = Number(port) || 0, h = hostId || LOCAL_HOST_ID;
  const mine = (Array.isArray(forwards) ? forwards : []).filter((f) => f && (f.hostId || LOCAL_HOST_ID) === h && Number(f.remotePort) === p && !f.targetHost);
  return mine.find((f) => f.publicUrl) || mine.find((f) => Number(f.localPort) > 0) || mine[0] || null;
}
/** THE LINK LADDER → {url, via: 'published'|'proxy'|'local', target?, localUrl, forwardId, publishedBy?} (header above). */
function serviceLink({ port, host = '', forward = null, instanceUrl = '' } = {}) {
  const p = Number(port) || 0, f = forward || null;
  const localUrl = `http://127.0.0.1:${p}/`, forwardId = (f && f.id) || null;
  if (f && f.publicUrl) return { url: String(f.publicUrl), via: 'published', localUrl, forwardId, publishedBy: String(f.label || f.publicSub || f.id || '') }; // the forward's name on the Ports panel
  const onBox = !host || host === LOCAL_HOST_ID;
  const lp = f && Number(f.localPort) > 0 ? Number(f.localPort) : 0;
  const target = onBox ? localUrl : lp ? `http://127.0.0.1:${lp}/` : '';
  if (!target) return { url: localUrl, via: 'local', localUrl, forwardId };
  const base = /^https?:\/\//i.test(String(instanceUrl || '')) ? String(instanceUrl).replace(/\/+$/, '') : ''; // absent ⇒ relative (the client's absUrl)
  return { url: `${base}/proxy/${target}`, via: 'proxy', target, localUrl, forwardId };
}
/** ONE job → its service row, or null (never listened; or stopped longer than SERVICE_KEEP_MS ago). */
function serviceRow(job, { now = Date.now(), base = '', forwards = [] } = {}) {
  const l = job && job.listen;
  if (!job || !job.id || !l || !(Number(l.port) > 0)) return null;
  const running = SERVICE_RUNNING.includes(job.state);
  const run = (Array.isArray(job.runs) && job.runs[job.runs.length - 1]) || job.run || null;
  const stoppedAt = running ? 0 : Number((run && run.endedAt) || job.updatedAt || l.at) || 0;
  if (!running && now - stoppedAt > SERVICE_KEEP_MS) return null;
  const firstAt = Number(l.firstAt) || Number(l.at) || 0;
  return { key: 'job:' + job.id, host: '', path: '', name: String(job.name || job.id), kind: 'service', jobId: String(job.id), port: Number(l.port),
    ...serviceLink({ port: l.port, host: LOCAL_HOST_ID, forward: forwardFor(forwards, LOCAL_HOST_ID, l.port), instanceUrl: base }),
    since: Number(run && run.startedAt) || firstAt, state: running ? 'running' : 'stopped', stoppedAt,
    firstAt, lastAt: Math.max(Number(l.at) || 0, stoppedAt, firstAt), by: 'agent', writes: 0, edits: 0, lastOp: 'listen', bytes: null, lastId: null };
}
/** THE LINEAGE RULE: the rows of the jobs whose OWNER conversation is `cid` (another conversation's job ⇒ no row). */
function serviceRows(jobs, { cid = null, now = Date.now(), base = '', forwards = [] } = {}) {
  const rows = {};
  if (!cid) return rows;
  for (const j of jobs || []) {
    if (jobOwnerCid(j) !== cid) continue;
    const r = serviceRow(j, { now, base, forwards });
    if (r) rows[r.key] = r;
  }
  return rows;
}
// ── WHO MADE IT FOR US (lane artifacts-handover, owner 2026-10-06 "一个 helper agent 做的 design 或者 artifact，能不能转移给上游主
// agent 展示给用户") — a row a HELPER made carries `via`: {kind: 'subagent', name, wf?} = a Task / workflow agent inside THIS
// conversation (its sidechain transcript's writes, read at the Task's end — the registry's helper door); {kind: 'handover',
// from: {cid, name}, at} = another conversation handed it over (`vibespace-msg send <agent> "…" --artifact <path>`). The
// helper's own row keeps `handedTo` [{cid, name, at}]. A hand-over is a REG_OP: it births / names the receiver's row and
// never counts as a write; files are never copied (the path + host ARE the row).
const VIA_KINDS = Object.freeze(['subagent', 'handover']);
const MAX_HANDOVER = 20; // items per hand-over
const HANDED_MAX = 8; // receivers remembered on the helper's row
const cut = (v, n) => String(v == null ? '' : v).slice(0, n);
/** A row's `via`, normalized (bounded strings; an unknown kind ⇒ null). */
function viaOf(v) {
  if (!v || typeof v !== 'object' || !VIA_KINDS.includes(v.kind)) return null;
  if (v.kind === 'subagent') return { kind: 'subagent', name: cut(v.name, 120) || 'subagent', ...(v.wf ? { wf: cut(v.wf, 64) } : {}) };
  const f = v.from && typeof v.from === 'object' ? v.from : {};
  return { kind: 'handover', from: { cid: cut(f.cid, 64), name: cut(f.name, 120) }, at: Number(v.at) || 0 };
}
function handedUnion(a, b) {
  const by = new Map();
  for (const x of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) if (x && x.cid && (!by.has(x.cid) || (by.get(x.cid).at || 0) < (x.at || 0))) by.set(x.cid, { cid: cut(x.cid, 64), name: cut(x.name, 120), at: Number(x.at) || 0 });
  return [...by.values()].sort((p, q) => (q.at || 0) - (p.at || 0)).slice(0, HANDED_MAX);
}
/** The helper's row → the RECEIVER's op: same host + path + kind + name (+ a page's url / state), `via` = the hand-over. */
function handoverOp(row, { from, at = Date.now() } = {}) {
  if (!row || !row.path || row.kind === 'service') return null;
  return { op: 'handover', kind: row.kind, host: row.host || '', path: row.path, name: row.name || '', ...(row.url ? { url: row.url } : {}), ...(row.state ? { state: row.state } : {}),
    via: { kind: 'handover', from, at }, at, id: `handover:${(from && from.cid) || ''}:${at}` };
}
/** The helper's rows with `key` marked handed to `to` ({cid, name, at}); a NEW rows object (null = no such row). */
function markHanded(rows, key, to) {
  const r = rows && rows[key];
  if (!r || !to || !to.cid) return null;
  return { ...rows, [key]: { ...r, handedTo: handedUnion(r.handedTo, [to]) } };
}
/** The helper's row an argument names: an absolute path (its key on `host`) or a page link (/p/<id>, its row's url). */
function rowFor(rows, arg, host = '') {
  const a = String(arg || '').trim();
  if (!a) return null;
  if (/^\/p\/[\w-]+\/?$/.test(a)) return Object.values(rows || {}).find((r) => r && r.url && r.url.replace(/\/+$/, '') === a.replace(/\/+$/, '')) || null;
  return (rows || {})[keyOf(host, a.replace(/\/+$/, '') || a)] || null;
}
const kindWord = (kind, lang = 'en') => (KIND_WORDS[kind] || KIND_WORDS.other)[lang] || (KIND_WORDS[kind] || KIND_WORDS.other).en;

module.exports = { KINDS, VIEW_ORDER, OPS, REG_OPS, KIND_RANK, BY, MAX_ROWS, CATEGORY_KIND, KIND_WORDS, kindOf, absPath, keyOf, apply, fold, merge, view,
  cardWorthy, cardBlock, cardPlacement, timeSlot, cardFacts, autoOpenVerdict, ownerOfIn, editNoteText, lineDelta, kindWord, baseName,
  pageOp, designOp, uploadOp, storeRows,
  SERVICE_KEEP_MS, jobOwnerCid, forwardFor, serviceLink, serviceRow, serviceRows,
  VIA_KINDS, MAX_HANDOVER, viaOf, handoverOp, markHanded, rowFor };
