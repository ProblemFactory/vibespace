'use strict';
// A CONVERSATION'S DELIVERABLES, DERIVED (lane artifacts-model, owner 2026-10-05; docs/design-artifacts.zh.md).
// The product never asks the agent to DECLARE what it made (teaching a tool forks the deliverables): it reads what it
// already WITNESSED — the harness's write record (claude Write / Edit, codex apply_patch, an ACP diff) and the user's
// own saves — and folds it into ONE row per file. PURE (CJS, imports nothing but the ONE extension table and the For-you
// reply's grammar — its cut mark, r6): the server's
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
// THE VIEW: `view(rows)` = the chip's order: the INTENT bands first (`intentOf` — for you › made here › touched, lane
//           artifacts-by-intent), newest-changed first in each; code folded behind a count. The kinds (VIEW_ORDER) stay
//           the list's SECONDARY grouping (src/lib/artifacts-list-model.js).
// THE INTENT (lane artifacts-by-intent, owner 2026-11-06 「分一下哪些可能是用户最需要看的，比如 publish 这种行为显然就是 agent
//           想要让用户看的，自动检测修改过的文件这种优先级就更低」): `intentOf(row)` → 'foryou' | 'made' | 'touched', PURE over
//           the row's own facts — ① FOR YOU: what an agent put in front of the person (a published page, a presented
//           page, a hand-over, a running service with its link, a row a publish / present / hand-over / Design-window
//           open named — `shown`, sticky FORWARD: a later op by the person never clears it, and a row kept before the
//           field reads its showing only from a fact that tells the person from the agent, `wasShown` (r5: never its
//           `by` — the old reducer wrote every op the agent's); a page link the PERSON pasted into their own message
//           is theirs, never «for you» — `opAuthor`: a present op carries its message's author, and the author is the
//           message's PROVENANCE, never the record's type — a peer's send, a notice, a helper's records are an agent's,
//           src/harnesses/artifacts-of.js); ② MADE HERE: what the agent WROTE (a write born it — `writes`), the person's
//           own uploads (theirs, never «for you»), a page unpublished (it says so), a stopped service; ③ TOUCHED: code
//           and the rows born by an edit (a file that existed before — the auto-detected changes, lowest). The server
//           sends the verdict on every block (`cardBlock` `intent`) — the chip, the popover and the window group by it.
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
// the persisted rows — the composer's record IS this registry) and (lane artifacts-by-intent r6) every ask it filed that
// the For-you store keeps: `askOps` is THE ONE READER OF AN ASK — live (presentAsk) and at the rebuild — so a row an ask
// put in front of the person reads «for you» whatever op came after, the tree before this field included.
const { FILE_TYPES } = require('./file-type-table.js');
const { uncut } = require('./inbox-reply-text.js'); // PURE: the cut mark's reader (r6) — a token a cap cut through is no link

const KINDS = Object.freeze(['doc', 'service', 'page', 'design', 'media', 'upload', 'code', 'other']);
const VIEW_ORDER = Object.freeze(['doc', 'service', 'page', 'design', 'media', 'upload', 'other']); // lane artifacts-services: what a conversation RUNS reads first after its docs
const OPS = Object.freeze(['write', 'edit']);
const REG_OPS = Object.freeze(['publish', 'unpublish', 'open', 'upload', 'handover', 'present']); // a store's fact: births / names a row, never counts (lane artifacts-handover: + a helper conversation's hand-over; lane pages-chip-groups: + a page link witnessed in the text)
const KIND_RANK = Object.freeze({ design: 3, page: 2, upload: 1 }); // a registry's kind over an extension's (and design › page › upload)
const outranks = (a, b) => (KIND_RANK[a] || 0) > (KIND_RANK[b] || 0);
const BY = Object.freeze(['agent', 'user']);
const INTENTS = Object.freeze(['foryou', 'made', 'touched']); // lane artifacts-by-intent: the list's first axis, in its order
const SHOWN_OPS = Object.freeze(['publish', 'present', 'handover', 'open']); // a store's fact that put the row in front of the person
const MAX_ROWS = 500;
// a category of the extension table → the deliverable kind
const CATEGORY_KIND = Object.freeze({
  text: 'doc', document: 'doc', office: 'doc', data: 'doc',
  image: 'media', audio: 'media', video: 'media',
  web: 'page', code: 'code', archive: 'other', unknown: 'other',
});
// markdown that steers an agent (config, never a deliverable — half of all Writes in the study were these)
const AGENT_CONFIG_NAMES = new Set(['claude.md', 'agents.md', 'gemini.md', 'skill.md', 'memory.md', 'claude.local.md']);
// …except agy's per-conversation BRAIN dir (lane agy-status-bar-facts): ~/.gemini/antigravity-cli/brain/<conversation>/ is where
// agy writes the reports it makes for the person (agy's own «artifacts», each with a .metadata.json beside it) — a
// deliverable by its extension, never steering config (the owner's report there showed no card)
const AGENT_CONFIG_DIR = /(?:^|\/)\.(?:claude|codex|cursor|gemini|opencode)\/(?!antigravity-cli\/brain\/)/;
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
  if (prev && wasShown(prev)) row.shown = true; // sticky FORWARD: a showing (a row kept before the field: its own facts) survives any later op — the person's quote too
  if (REG_OPS.includes(o.op)) { if (o.url !== undefined) row.url = o.url ? String(o.url) : null; if (o.state) row.state = String(o.state); if (o.name) row.name = String(o.name).slice(0, 200); if (o.op === 'present' && !prev && o.page) { row.presented = true; row.page = String(o.page || ''); row.origin = String(o.origin || ''); } if (SHOWN_OPS.includes(o.op) && !(o.op === 'present' && by === 'user')) row.shown = true; } // the person's own paste shows nothing to them
  else if (o.op === 'write' && by === 'agent') row.writes += 1; else row.edits += 1;
  const via = viaOf(o.via);
  if (via && (!prev || !row.via)) row.via = via; // lane artifacts-handover: WHO made it for this conversation (a subagent / a helper conversation) — the birth's
  row.by = by; row.lastOp = o.op;
  if (at) { row.lastAt = Math.max(row.lastAt || 0, at); if (!row.firstAt) row.firstAt = at; }
  if (Number.isFinite(o.bytes)) row.bytes = o.bytes;
  row.lastId = o.id ? String(o.id) : null;
  const next = { ...cur, [key]: row };
  const evicted = prev ? [] : evictOver(next, key).concat(row.presented ? evictPresented(next, key) : []);
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
/** Past MAX_PRESENTED presented page rows: the oldest-mentioned go (never the row just born). Mutates `rows`. */
function evictPresented(rows, keep) {
  const all = Object.values(rows).filter((r) => r && r.presented);
  if (all.length <= MAX_PRESENTED) return [];
  const victims = all.filter((r) => r.key !== keep).sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0)).slice(0, all.length - MAX_PRESENTED).map((r) => r.key);
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
    if (wasShown(p) || wasShown(r)) reg.shown = true; // lane artifacts-by-intent: once put in front of the person, on either side (`by` = the later writer — never the showing)
    if (r.handedTo || p.handedTo) reg.handedTo = handedUnion(p.handedTo, r.handedTo);
    if (outranks(r.kind, p.kind)) reg.kind = r.kind;
    if (r.name && (outranks(r.kind, p.kind) || (r.kind === p.kind && later === r))) reg.name = r.name; // a design's newer title
    out[k] = { ...p, ...reg, writes: Math.max(p.writes || 0, r.writes || 0), edits: Math.max(p.edits || 0, r.edits || 0),
      firstAt: Math.min(p.firstAt || Infinity, r.firstAt || Infinity) === Infinity ? 0 : Math.min(p.firstAt || Infinity, r.firstAt || Infinity),
      lastAt: Math.max(p.lastAt || 0, r.lastAt || 0), by: later.by, lastOp: later.lastOp, bytes: later.bytes ?? p.bytes ?? null, lastId: later.lastId ?? null };
  }
  evictOver(out, null);
  evictPresented(out, null);
  return out;
}
/** WAS THE ROW PUT IN FRONT OF THE PERSON (lane artifacts-by-intent — sticky forward): its `shown` — the reducer writes
 *  it at every showing. A row WITHOUT it (kept by a tree before the field) is read only from a fact that tells the
 *  person from the agent (r5): that tree wrote every op `by: 'agent'`, the person's paste included, so its `by` and
 *  `presented` witness nothing — a page link counts only when its last op was an ASK (an `ask:` id: presentAsk alone
 *  writes it), any other row when its last op is a showing (publish · present · hand-over · open: a person's message
 *  never named anything but a page link). On every row this reducer writes it agrees with `shown`; a link kept so with
 *  no such fact is «made» until the rebuild's own derivation finds an agent's showing in the transcript (merge). */
const wasShown = (r) => !!(r && (r.shown || (r.presented ? String(r.lastId || '').startsWith('ask:') : SHOWN_OPS.includes(r.lastOp))));
/** THE ONE VERDICT (lane artifacts-by-intent; the header's THE INTENT): the band a row reads in — 'foryou' | 'made' |
 *  'touched' — over its own facts only (a row or its card block; junk ⇒ 'touched'). */
function intentOf(r) {
  if (!r || typeof r !== 'object') return 'touched';
  if (r.kind === 'service') return r.state === 'stopped' || !r.url ? 'made' : 'foryou'; // running, with the link the person clicks
  if (r.state === 'unpublished' || r.gone) return 'made'; // a page taken down leaves the band (its row says so)
  if (r.presented) return wasShown(r) ? 'foryou' : 'made'; // a page link an agent put in front of the person (the person's own paste is theirs)
  if (r.kind === 'page' && r.state === 'published') return 'foryou';
  if (r.via && r.via.kind === 'handover') return 'foryou';
  if (r.kind === 'upload') return 'made'; // the person's own file: shown, never «for you»
  if (wasShown(r)) return 'foryou'; // an ask's --artifact, a Design window opened on it — even a code file
  if (r.kind === 'design') return 'made'; // a design no Design window opened yet
  if (r.kind === 'code') return 'touched';
  return (Number(r.writes) || 0) > 0 ? 'made' : 'touched'; // born by an edit (a file that was there before) ⇒ touched
}
/** WHO an observed op is by (the live consumer and the rebuild's derivation — one rule): the agent's, except a page link
 *  in a message the PERSON typed (`artifactsOf` tags its present op `by: 'user'` by the message's provenance — a peer's
 *  send, a notice, a helper's records never) — never «for you». */
const opAuthor = (o) => (o && o.op === 'present' && o.by === 'user' ? 'user' : 'agent');
/** A TRAY ANSWER'S QUOTE (r10 — a quote carries the ORIGIN of what it quotes): the quote above the person's answer is the
 *  words of the ITEM it quotes, and the tray answers a producer's item too (the browser's lapsed takeover names the page
 *  it left open). artifacts-of names that item on each quote op (`quote` = its id); the op is the agent's showing only
 *  when `isAsk(id)` — the item is one of this conversation's ASKS (the registry asks the ask route's own answer, asksOf:
 *  src/inbox-origin.js isAsk under the route's key) —, else nobody's: dropped, no row (a producer's record is never a
 *  witness; nor is an item the store no longer keeps). Every other op passes untouched. One rule, live and at the rebuild. */
function quotedOps(ops, isAsk = () => false) {
  const ours = (id) => { try { return !!isAsk(String(id)); } catch { return false; } };
  return (Array.isArray(ops) ? ops : []).filter((o) => !(o && o.quote) || ours(o.quote));
}
/** THE CHIP'S ORDER: the intent bands (INTENTS), newest change first in each; code behind a count. */
function view(rows) {
  const all = Object.values(rows || {}).filter((r) => r && r.key);
  const byNew = (a, b) => (b.lastAt || 0) - (a.lastAt || 0) || String(a.key).localeCompare(String(b.key));
  const items = all.filter((r) => r.kind !== 'code').sort((a, b) => (INTENTS.indexOf(intentOf(a)) - INTENTS.indexOf(intentOf(b))) || byNew(a, b));
  const code = all.filter((r) => r.kind === 'code').sort(byNew);
  return { items, code, count: items.length, codeCount: code.length, total: all.length, full: all.length >= MAX_ROWS };
}
/** Does a row get a chat CARD? Every deliverable does; code (CLAUDE.md, a .py) stays in the chip's fold only. */
const cardWorthy = (row) => !!(row && row.kind !== 'code' && !row.presented); // lane pages-chip-groups: a page link shown here is the message's own — no second card
/** The card's block (structure, never markup): what the normalizer sends and the client draws. */
function cardBlock(row) {
  if (!row || !row.key) return null;
  return { type: 'artifact', key: row.key, host: row.host || '', path: row.path, name: row.name, kind: row.kind,
    by: row.by, writes: row.writes || 0, edits: row.edits || 0, lastOp: row.lastOp, firstAt: row.firstAt || 0, lastAt: row.lastAt || 0,
    intent: intentOf(row), ...(row.shown ? { shown: true } : {}), // lane artifacts-by-intent: the band the list reads it in
    ...(row.url ? { url: row.url } : {}), ...(row.state ? { state: row.state } : {}),
    ...(row.via ? { via: row.via } : {}), ...(row.handedTo && row.handedTo.length ? { handedTo: row.handedTo } : {}),
    ...(row.presented ? { presented: true, page: row.page, public: !!row.public, publisher: row.publisher || '', ...(row.gone ? { gone: true } : {}) } : {}),
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
/** A conversation's rows from the STORES (not the transcript) — the rebuild's third merge input: its pages + designs, and
 *  (r6) the asks it filed (`asks` = the For-you store's items, open or answered — the store keeps their words and
 *  attachments): the ops each one folded live (askOps), so the merge stamps every row an ask named `shown`. */
function storeRows({ pages = [], designs = [], asks = [] } = {}) {
  let rows = {};
  for (const op of [...(pages || []).map((p) => pageOp(p)), ...(designs || []).map(designOp)]) if (op) rows = fold(rows, op);
  for (const it of asks || []) if (it && it.id) for (const op of askOps({ artifacts: it.artifacts, id: it.id, at: Number(it.createdAt) || 0, said: [it.text, it.detail] })) rows = fold(rows, op);
  return rows;
}
/** THE REBUILD'S STAMP (r6): a row the merge put in front of the person that the rows before it did not stamp — the
 *  rebuild persists then (normalizers' persist seam → the registry's persistSoon), so a restart before the next op keeps it. */
const stampsGained = (before, after) => Object.values(after || {}).some((r) => r && r.shown && !((before || {})[r.key] || {}).shown);
// ── THE PRESENTED PAGES (lane pages-chip-groups, owner 2026-10-08 "可以，不过要分组"; B-aa28) — a page ANOTHER conversation
// published whose /p/<id> link appears in THIS conversation's text (an assistant reply, the user's message, a peer's):
// OBSERVED, never declared — the link in the text is the witness (the harness hook reads text blocks only, never a tool
// result). A `present` op births a `page` row keyed by the page id (`:/p/<id>`, no machine) with `presented: true`; the
// registry resolves it against the pages store at EVERY read (`resolvePresented`: name / public / the publisher's live
// name; unpublished or unknown ⇒ `gone`) — the stored row never carries the resolution. A page this conversation
// published itself is never a presented row (the Pages chip's own group has it); another instance's URL is no witness.
// Bounded: the store's id shape (published-pages.js mintId: 'pg' + 10 of [a-z0-9]) over text only, ≤ MAX_PRESENTED rows
// per conversation (the newest-mentioned kept). Never a chat card (`cardWorthy`), never handed over (`rowFor`).
const MAX_PRESENTED = 50;
const PAGE_LINK = /(?<![\w.\/-])(https?:\/\/(?:\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(?::\d{1,5})?)?\/p\/(pg[a-z0-9]{10})(?![A-Za-z0-9_-])/g;
/** The page links in one text: [{id, origin}] — `origin` '' for a relative /p/<id>, else the URL's scheme://host[:port]. */
function pageLinksIn(text) {
  const s = typeof text === 'string' ? text : '';
  if (!s.includes('/p/pg')) return [];
  const out = [], seen = new Set();
  for (const m of s.matchAll(PAGE_LINK)) {
    const origin = (m[1] || '').toLowerCase(), k = origin + ' ' + m[2];
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: m[2], origin });
    if (out.length >= MAX_PRESENTED) break;
  }
  return out;
}
/** One witnessed link → the reducer's op: a `page` row on the page id (no machine — a /p/ link names this server). */
function presentOp(link) {
  if (!link || !link.id) return null;
  return { op: 'present', kind: 'page', host: '', path: '/p/' + link.id, page: link.id, origin: String(link.origin || ''), url: String(link.origin || '') + '/p/' + link.id };
}
/** An ask's attachment (lane foryou-attachments: `vibespace-ask … --artifact <path|/p/id>…`) → the reducer's op: a page =
 *  presentOp (a presented row, resolved at every read); a file / a design = a `present` birth of its row — NAMED, never
 *  counted (REG_OPS) — so the asking conversation's Artifacts list shows what it asked the owner to look at. */
function askOp(a, { at = Date.now(), id = '' } = {}) {
  if (!a) return null;
  const tag = { at, ...(id ? { id: String(id) } : {}) };
  if (a.kind === 'page') { const op = presentOp({ id: a.page, origin: '' }); return op && { ...op, ...tag }; }
  if (!a.path || (a.kind !== 'file' && a.kind !== 'design')) return null;
  return { op: 'present', ...(a.kind === 'design' ? { kind: 'design' } : {}), host: a.host || '', path: a.path, name: a.name || '', ...tag };
}
/** AN ASK'S OPS — THE ONE READER OF AN ASK (lane artifacts-by-intent r6), live (the registry's presentAsk, at the filing)
 *  and at every rebuild (storeRows over the For-you store's asks): each attachment (askOp) and every /p/ link in its KEPT
 *  words (`said` = the store's text + detail; a token the store's cut went through is no link — the grammar's `uncut`),
 *  each the agent's, tagged `ask:<id>:<k>` (the id wasShown reads on a row kept before `shown`). */
function askOps({ artifacts = null, id = '', at = 0, said = [] } = {}) {
  const tag = (k) => (id ? `ask:${id}:${k}` : '');
  const ops = (Array.isArray(artifacts) ? artifacts : []).map((a, k) => askOp(a, { at, id: tag(k) }));
  for (const l of pageLinksIn((Array.isArray(said) ? said : []).filter((x) => typeof x === 'string').map((x) => uncut(x)).join('\n'))) { const o = presentOp(l); if (o) ops.push({ ...o, at, ...(id ? { id: tag('p:' + l.id) } : {}) }); }
  return ops.filter(Boolean).map((o) => ({ ...o, by: 'agent' }));
}
/** THE READ (the registry's list, every time): each presented row against the pages store. `pageOf(id)` → {page} (live) |
 *  {gone: true} (unpublished — B-f694's 410) | null (never published here); `own(page)` = this conversation published it;
 *  `base` = this instance's origin; `nameOf(page)` = the publisher conversation's live name. Own page ⇒ dropped (the own
 *  group has it); another origin's link to an id unknown here ⇒ dropped (not this server's page). A NEW rows object. */
function resolvePresented(rows, { pageOf = () => null, own = () => false, base = '', nameOf = () => '' } = {}) {
  const out = {};
  const b = String(base || '').replace(/\/+$/, '').toLowerCase();
  for (const [k, r] of Object.entries(rows || {})) {
    if (!r || !r.presented) { out[k] = r; continue; }
    let hit = null;
    try { hit = pageOf(r.page) || null; } catch { hit = null; }
    const page = hit && hit.page;
    if (page && own(page)) continue;
    if (!hit && r.origin && r.origin !== b) continue;
    let by = '';
    if (page) { try { by = String(nameOf(page) || ''); } catch { by = ''; } }
    out[k] = page ? { ...r, name: String(page.name || r.page).slice(0, 200), state: 'published', url: String(page.path || '/p/' + r.page), public: !!page.public, publisher: by.slice(0, 120), gone: false }
      : { ...r, name: r.page, state: 'unpublished', url: '/p/' + r.page, public: false, publisher: '', gone: true };
  }
  return out;
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
/** ONE job → its service row, or null (never listened; or stopped longer than SERVICE_KEEP_MS ago). `labelOf` = the engine's
 *  ONE name accessor (M.labelVia(jm) — lane job-notify-user r5, accept-r4 refuted 0: the row and the chat card a person reads
 *  carried the record's raw name); absent ⇒ the job's id, never the record's words. */
function serviceRow(job, { now = Date.now(), base = '', forwards = [], labelOf = null } = {}) {
  const l = job && job.listen;
  if (!job || !job.id || !l || !(Number(l.port) > 0)) return null;
  const running = SERVICE_RUNNING.includes(job.state);
  const run = (Array.isArray(job.runs) && job.runs[job.runs.length - 1]) || job.run || null;
  const stoppedAt = running ? 0 : Number((run && run.endedAt) || job.updatedAt || l.at) || 0;
  if (!running && now - stoppedAt > SERVICE_KEEP_MS) return null;
  const firstAt = Number(l.firstAt) || Number(l.at) || 0;
  return { key: 'job:' + job.id, host: '', path: '', name: String((typeof labelOf === 'function' && labelOf(job)) || job.id), kind: 'service', jobId: String(job.id), port: Number(l.port),
    ...serviceLink({ port: l.port, host: LOCAL_HOST_ID, forward: forwardFor(forwards, LOCAL_HOST_ID, l.port), instanceUrl: base }),
    since: Number(run && run.startedAt) || firstAt, state: running ? 'running' : 'stopped', stoppedAt,
    firstAt, lastAt: Math.max(Number(l.at) || 0, stoppedAt, firstAt), by: 'agent', writes: 0, edits: 0, lastOp: 'listen', bytes: null, lastId: null };
}
/** THE LINEAGE RULE: the rows of the jobs whose OWNER conversation is `cid` (another conversation's job ⇒ no row). */
function serviceRows(jobs, { cid = null, now = Date.now(), base = '', forwards = [], labelOf = null } = {}) {
  const rows = {};
  if (!cid) return rows;
  for (const j of jobs || []) {
    if (jobOwnerCid(j) !== cid) continue;
    const r = serviceRow(j, { now, base, forwards, labelOf });
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
  if (/^\/p\/[\w-]+\/?$/.test(a)) return Object.values(rows || {}).find((r) => r && !r.presented && r.url && r.url.replace(/\/+$/, '') === a.replace(/\/+$/, '')) || null; // a page only SHOWN here is not this conversation's to hand over
  return (rows || {})[keyOf(host, a.replace(/\/+$/, '') || a)] || null;
}
const kindWord = (kind, lang = 'en') => (KIND_WORDS[kind] || KIND_WORDS.other)[lang] || (KIND_WORDS[kind] || KIND_WORDS.other).en;
// the bands' words (lane artifacts-by-intent — the closed set's words, like KIND_WORDS; «For you» alone is the tray's 待你处理 in t())
const INTENT_WORDS = Object.freeze({
  foryou: { en: 'For you', zh: '给你看的', ja: 'あなたに見せるもの' },
  made: { en: 'Made here', zh: '做出来的', ja: 'ここで作ったもの' },
  touched: { en: 'Touched', zh: '顺带改的', ja: 'ついでに変えたもの' },
});
const intentWord = (band, lang = 'en') => (INTENT_WORDS[band] || INTENT_WORDS.touched)[lang] || (INTENT_WORDS[band] || INTENT_WORDS.touched).en;

module.exports = { KINDS, VIEW_ORDER, OPS, REG_OPS, KIND_RANK, BY, MAX_ROWS, CATEGORY_KIND, KIND_WORDS, kindOf, absPath, keyOf, apply, fold, merge, view,
  INTENTS, SHOWN_OPS, INTENT_WORDS, intentOf, intentWord, opAuthor, quotedOps, wasShown,
  cardWorthy, cardBlock, cardPlacement, timeSlot, cardFacts, autoOpenVerdict, ownerOfIn, editNoteText, lineDelta, kindWord, baseName,
  pageOp, designOp, uploadOp, storeRows, stampsGained,
  MAX_PRESENTED, PAGE_LINK, pageLinksIn, presentOp, askOp, askOps, resolvePresented,
  SERVICE_KEEP_MS, jobOwnerCid, forwardFor, serviceLink, serviceRow, serviceRows,
  VIA_KINDS, MAX_HANDOVER, viaOf, handoverOp, markHanded, rowFor };
