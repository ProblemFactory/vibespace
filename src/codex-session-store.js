const fs = require('fs');
const path = require('path');
const {
  CODEX_SESSIONS_DIR,
  extractCodexThreadMeta,
  findCodexSessionJsonlPath,
  parseCodexSessionJsonl,
  transcriptWorkerCall,
} = require('./adapters/codex');
const { CODEX_ROLLOUT_RE } = require('./discovery-facts');   // B-f64b: the open-rollout walk runs in the transcript worker only (codexOpenThreads)

function getCodexHistorySessionId(session) {
  return session?.backendSessionId || session?.claudeSessionId || null;
}

function getSessionKey(session = {}) {
  const backend = session.backend || 'claude';
  const backendSessionId = session.backendSessionId || session.sessionId || session.claudeSessionId || null;
  return backendSessionId ? `${backend}:${backendSessionId}` : '';
}

function parseBufferRecords(buffer) {
  const records = [];
  for (const line of String(buffer || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { records.push(JSON.parse(trimmed)); } catch {}
  }
  return records;
}

// Codex LIVENESS = a rollout held open by a codex process (no lock files).
// The fd/lsof scan is ONE implementation in discovery-facts
// (listOpenCodexRolloutPaths — shared with the daemon snapshot's CO lines and
// mirrored by the ssh script); the transcript worker runs it (codexOpenThreads)
// and this file only keeps its answer.
// B-f64b: the walk NEVER runs on the main thread — not on the sync listing, not as the async road's fallback. The witness
// (test-boot-loop-hold, 33 s held at the hotfix's gate on a packed machine) was this walk on the loop with a ps per exited
// pid: the worker missed its 15 s deadline and the inline fallback walked it here. A worker that cannot answer (the pool
// down, a deadline missed, the op inline on the main thread) answers null: the kept answer stands KEPT_MAX_MS, then the
// rows say their liveness is not known (liveness: 'unknown'); a null is never kept.
let _openThreadsCache = null; // {ids, at} — external-codex detection tolerates 10s staleness easily (audit round-2)
let _openThreadsInflight = null;   // ONE walk in flight, for both roads
const KEPT_MAX_MS = 120000;   // a worker that cannot answer: the kept answer stands this long, then «not known»
const keptIds = () => (_openThreadsCache && Date.now() - _openThreadsCache.at <= KEPT_MAX_MS ? _openThreadsCache.ids : null);
/** The sync road's answer: the KEPT ids (of any age; a stale one starts the worker's walk) or null = not known yet. */
function keptOpenThreadIds() {
  const c = _openThreadsCache;
  if (!c || Date.now() - c.at >= 10000) listOpenCodexThreadIdsAsync().catch(() => null);
  return keptIds();
}
/** The worker's walk (`codexOpenThreads`), one in flight; same 10s cache → a Set of thread ids, or null = not known
 *  (the worker could not answer). */
function listOpenCodexThreadIdsAsync() {
  if (_openThreadsCache && Date.now() - _openThreadsCache.at < 10000) return Promise.resolve(_openThreadsCache.ids);
  if (_openThreadsInflight) return _openThreadsInflight;
  _openThreadsInflight = transcriptWorkerCall('codexOpenThreads', {}, () => null).then((arr) => {
    if (!Array.isArray(arr)) return keptIds();   // the worker could not answer: the kept answer (≤ KEPT_MAX_MS), else null = not known — nothing new kept
    const ids = new Set(arr);
    _openThreadsCache = { ids, at: Date.now() };
    return ids;
  }, () => null).finally(() => { _openThreadsInflight = null; });
  return _openThreadsInflight;
}

// ── The rollout walk (S3 hot path) ──
// Every 5s /api/sessions poll used to readdir the whole ~/.codex/sessions
// tree + head-read every rollout ON THE LOOP (an NFS home stalled the whole
// instance per poll). Now: (1) the walk keeps a PER-DIRECTORY mtime cache —
// a directory whose mtime is unchanged (and older than 2s: coarse NFS
// timestamps) reuses its cached listing, no readdir; (2) extractCodexThreadMeta
// keeps its per-file mtime cache; (3) the whole thing runs in the transcript
// worker for the poll (listCodexThreadsAsync) so the main thread only pays
// for the structured-clone of the small meta array. The sync listCodexThreads
// (user-action consumers: capture, migration map, spawn baseline) is
// unchanged in behaviour and shares the same functions.
const _dirCache = new Map(); // dir -> { mtimeMs, dirs: [names], files: [names] }
const DIR_CACHE_MAX = 4096;
const DIR_CACHE_SETTLE_MS = 2000;
const _dirStats = { hits: 0, misses: 0 };
function _listDirCached(dir) {
  let st;
  try { st = fs.statSync(dir); } catch { return null; }
  const hit = _dirCache.get(dir);
  // SETTLEDNESS IS A PROPERTY OF THE CAPTURE, NOT OF THE LOOKUP. The guard
  // exists because directory mtimes are coarse (1s on many filesystems, NFS
  // included): a listing taken while the current mtime tick was still open
  // may miss a sibling created in that same second — and that sibling never
  // bumps the mtime again. Evaluating `now - mtime > 2s` at LOOKUP time (the
  // 2.369 shape) trusted such a capture FOREVER once the clock passed
  // mtime+2s: a rollout created in the same second as its neighbour never
  // appeared in the session list (the poll is 5s, so the window is always
  // over by the next lookup). Record it at FILL time instead — an unsettled
  // capture is re-read on the next lookup until it is taken settled.
  if (hit && hit.mtimeMs === st.mtimeMs && hit.settled) { _dirStats.hits++; return hit; }
  _dirStats.misses++;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  const dirs = [], files = [];
  for (const e of entries) {
    if (e.isDirectory()) dirs.push(e.name);
    else if (e.isFile() && CODEX_ROLLOUT_RE.test(e.name)) files.push(e.name);
  }
  // plain before compressed so a thread with both lists its .jsonl (2.369 zst)
  files.sort((a, b) => (a.endsWith('.zst') ? 1 : 0) - (b.endsWith('.zst') ? 1 : 0));
  const rec = { mtimeMs: st.mtimeMs, dirs, files, settled: Date.now() - st.mtimeMs > DIR_CACHE_SETTLE_MS };
  _dirCache.set(dir, rec);
  if (_dirCache.size > DIR_CACHE_MAX) _dirCache.delete(_dirCache.keys().next().value);
  return rec;
}
function dirCacheStats() { return { ..._dirStats, size: _dirCache.size }; }

/** Pass 1: walk the sessions tree, extract every thread's meta (first wins
 *  per threadId), collect the forkedFrom chains. Pure facts — no session
 *  state — so the worker can run it and the main thread assembles. */
function collectCodexThreadMetas() {
  const seen = new Set();
  const metas = [];
  const mergedThreadIds = new Set();
  const stack = [CODEX_SESSIONS_DIR];
  while (stack.length) {
    const current = stack.pop();
    const rec = _listDirCached(current);
    if (!rec) continue;
    for (const d of rec.dirs) stack.push(path.join(current, d));
    for (const f of rec.files) {
      const meta = extractCodexThreadMeta(path.join(current, f));
      if (!meta.threadId || seen.has(meta.threadId)) continue;
      seen.add(meta.threadId);
      // Collect forkedFrom from JSONL metadata (persisted across session lifecycle)
      for (const forkId of meta.forkedFrom || []) mergedThreadIds.add(forkId);
      metas.push(meta);
    }
  }
  return { metas, mergedThreadIds: [...mergedThreadIds] };
}

/** Pass 2: metas + live sessions + open rollouts → the session-list entries
 *  (merged fork sources hidden; live/external/stopped status). */
function assembleCodexThreads({ metas, mergedThreadIds }, { activeSessions, openThreadIds, livenessUnknown = false }) {
  const sessions = [];
  const activeByThreadId = new Map();
  const merged = new Set(mergedThreadIds || []);
  for (const [id, session] of activeSessions || []) {
    if (session.backend !== 'codex') continue;
    const threadId = session.backendSessionId || session.claudeSessionId;
    if (!threadId) continue;
    activeByThreadId.set(threadId, { id, session });
    for (const forkId of session.forkedFrom || []) merged.add(forkId);
  }
  for (const meta of metas) {
    if (merged.has(meta.threadId)) continue;
    const active = activeByThreadId.get(meta.threadId);
    const isExternal = !active && openThreadIds.has(meta.threadId);
    sessions.push({
      backend: 'codex',
      backendSessionId: meta.threadId,
      sessionId: meta.threadId,
      sessionKey: getSessionKey({ backend: 'codex', backendSessionId: meta.threadId }),
      cwd: meta.cwd || '',
      startedAt: meta.updatedAt || Date.now(),
      status: active ? 'live' : (isExternal ? 'external' : 'stopped'),
      ...(livenessUnknown && !active ? { liveness: 'unknown' } : {}),   // B-f64b: the liveness walk has not answered — SAID (the card: «still checking»), its row's actions as a stopped one
      name: meta.name || meta.agentNickname || meta.agentRole || '',
      source: meta.source || null,
      sourceKind: meta.sourceKind || null,
      agentKind: meta.agentKind || 'primary',
      agentRole: meta.agentRole || '',
      agentNickname: meta.agentNickname || '',
      parentThreadId: meta.parentThreadId || null,
      forkedFromId: meta.forkedFromId || null,                 // codex's own fork parent (0.153 thread/fork, sub-agent spawn) — NOT hidden: it is its own conversation
      forkedFromOrdinal: Number.isInteger(meta.forkedFromOrdinal) ? meta.forkedFromOrdinal : null,
      historyMode: meta.historyMode || null,
      webuiId: active?.id || null,
      webuiName: active?.session?.name || null,
      webuiMode: active?.session?.mode || null,
    });
  }
  sessions.sort((a, b) => b.startedAt - a.startedAt);
  return sessions;
}

/** The fork ancestry a thread's read-only view prepends, oldest → newest
 *  (codex 0.153 paginated forks). Two sources, ONE list:
 *   · the wrapper's `forked_from` chain (superseded ids of THIS conversation
 *     — merged whole, exactly as before; the fingerprint dedup absorbs the
 *     twin records a copied history carries)
 *   · codex's OWN `forked_from_id` parents whose boundary is KNOWN — a
 *     'Referenced' fork's rollout holds none of the parent's records, only
 *     `history_base.end_ordinal_exclusive` / `forked_from_ordinal_exclusive`
 *     (parent-numbered): the parent's records below it ARE the fork's
 *     history, its later turns belong to the parent alone.
 *  Entry = { id, untilOrdinal|null } (null = whole file). A sub-agent's
 *  `subagent_history_start_ordinal` is child-numbered and its rollout already
 *  copies the inherited context, so it never adds an ancestor here. Depth-
 *  capped (8), cycle-safe, a missing rollout ends the walk. */
function resolveCodexForkAncestry(threadId, wrapperChain = []) {
  const entries = [];
  const seen = new Set(threadId ? [threadId] : []);
  for (const id of Array.isArray(wrapperChain) ? wrapperChain : []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, untilOrdinal: null });
  }
  const native = [];
  let cur = threadId, depth = 0;
  while (cur && depth++ < 8) {
    const fp = findCodexSessionJsonlPath(cur);
    if (!fp) break;
    const m = extractCodexThreadMeta(fp);
    const until = Number.isInteger(m.forkedFromOrdinal) ? m.forkedFromOrdinal : null;
    if (!m.forkedFromId || until === null) break;
    const parent = m.forkedFromId;
    const existing = entries.find((e) => e.id === parent);
    if (existing) existing.untilOrdinal = existing.untilOrdinal === null ? until : Math.min(existing.untilOrdinal, until);
    else if (!seen.has(parent)) { seen.add(parent); native.unshift({ id: parent, untilOrdinal: until }); }
    else break;
    cur = parent;
  }
  return [...native, ...entries];
}

/** Keep only the records below a parent-numbered boundary. Records without a
 *  top-level `ordinal` (pre-0.153 rollouts, wrapper buffer copies) are kept —
 *  the boundary can only speak about records that carry one. */
function cutRecordsAtOrdinal(records, untilOrdinal) {
  if (!Number.isInteger(untilOrdinal)) return records;
  return (records || []).filter((r) => !Number.isInteger(r?.ordinal) || r.ordinal < untilOrdinal);
}

/** Per-record FILE provenance for a merged read. CodexSessionMessages
 *  concatenates several rollouts (fork ancestry + the thread's own file), so a
 *  record's ledger thread id is a fact about the FILE it came from — never
 *  about the reader's session: the usage walker keys `cx:<file uuid>:<cum>`
 *  per FILE, and a reader-wide id keyed every parent-half token_count of a
 *  merged fork read `cx:<child>:…` (0/30 parent messages matched the parent's
 *  ledger; two collided with real child events — round-3 verifier, real
 *  rollouts). The tag is NON-ENUMERABLE: it never reaches JSON.stringify
 *  (fingerprints, wire payloads, caches) and survives the sort copy below.
 *  Buffer (live) records are deliberately left untagged — they follow the
 *  normalizer's in-stream default (wrapper_meta.threadId = the file the
 *  wrapper writes), see codex-message-manager._adoptThreadId. */
const RECORD_THREAD_KEY = '__threadId';
function tagOne(record, tid) {   // B-f3f9: one record's tag, as tagRecordThread sets it
  if (record && typeof record === 'object') Object.defineProperty(record, RECORD_THREAD_KEY, { value: tid, enumerable: false, configurable: true, writable: true });
}
function tagRecordThread(records, threadId) {
  if (!threadId) return records;
  const tid = String(threadId);
  for (const r of records || []) {
    if (r && typeof r === 'object') Object.defineProperty(r, RECORD_THREAD_KEY, { value: tid, enumerable: false, configurable: true, writable: true });
  }
  return records;
}
function recordThreadOf(record) {
  return record && typeof record === 'object' && typeof record[RECORD_THREAD_KEY] === 'string' && record[RECORD_THREAD_KEY] ? record[RECORD_THREAD_KEY] : null;
}

/** sortRecords' two steps, apart (lane resume-all-paced, L2: the merge's generator decorates in steps — the copy and the
 *  Date.parse of 68 000 records were 66–133 ms of ONE loop turn — and only the numeric sort runs whole) */
function decorateForSort(record, idx) {
  const copy = { ...record, __idx: idx, __ts: Date.parse(record.timestamp || '') || 0 };
  const tid = recordThreadOf(record);
  if (tid) Object.defineProperty(copy, RECORD_THREAD_KEY, { value: tid, enumerable: false, configurable: true, writable: true }); // the spread drops non-enumerables
  return copy;
}
const sortCompare = (a, b) => (a.__ts - b.__ts) || (a.__idx - b.__idx);
function sortRecords(records) {
  return records.map(decorateForSort).sort(sortCompare);
}

/** The webui id a user record is FINGERPRINTED by, in every spelling a producer
 *  uses. ONE spelling, so the fingerprint and the twin rule can never disagree
 *  about which copies are id-keyed.
 *  `webui_queue_id` IS one of them (round 2, 2026-09-07): it is the app-server's
 *  clientUserMessageId for the submission whose bubble we wrote — for an
 *  INHERITED queue item that value is literally the webui msgId the wrapper we
 *  replaced minted, so the two spellings name the same submission and belong in
 *  the same namespace. Keying it on CONTENT instead (round 1) silently deleted a
 *  steered message: two inherited items with the SAME text in one turn hashed
 *  identically and the second was dropped on rebuild — two bubbles live, one
 *  after a reload, in the exact scenario this code exists to fix. */
function userRecordIdentity(payload) {
  return payload.webui_msg_id || payload.webuiMsgId || payload.client_msg_id || payload.clientMsgId
    || payload.webui_queue_id || payload.webuiQueueId || '';
}

/** Codex's OWN id for a user message — `msg_…`, minted per SUBMISSION.
 *  A user record that carries none of our markers is codex's copy, and its
 *  identity is this id, never its text: MEASURED on the local rollout corpus
 *  (89 files), the turn-scoped CONTENT key deleted 133 real user messages on
 *  reload — every collision a different `id` AND a different `create_time`,
 *  i.e. 133 distinct submissions, zero genuine duplicates. Cross-file dedup
 *  (a native fork replays its parent's records) survives because a fork REUSES
 *  the parent's ids (measured: 4/4 and 9/9 shared on real fork chains).
 *  Pre-0.15x rollouts wrote no id (144/572 records, all in files ≤2026-05, none
 *  mixed) — those fall back to the content key, i.e. their behaviour is
 *  byte-identical to before. */
function codexRecordIdentity(payload) {
  return typeof payload.id === 'string' && payload.id ? payload.id : '';
}

function recordFingerprint(record, turnId) {
  if (!record || typeof record !== 'object') return null;
  if (record.type === 'session_meta') return `session_meta:${record.payload?.id || ''}`;
  if (record.type === 'turn_context') return `turn_context:${record.payload?.turn_id || record.payload?.turnId || ''}`;
  if (record.type === 'wrapper_meta') return `wrapper_meta:${record.payload?.threadId || ''}:${record.payload?.activeTurnId || ''}`;
  if (record.type === 'server_request') return `server_request:${record.payload?.id}`;
  if (record.type === 'server_request_resolved') return `server_request_resolved:${record.payload?.id}:${record.payload?.decision || ''}`;
  const payload = record.payload || {};
  if (record.type === 'response_item') {
    if (payload.type === 'message' && payload.role === 'user') {
      const webuiMsgId = userRecordIdentity(payload);
      if (webuiMsgId) return `${turnId}:response_item:user:${webuiMsgId}`;
      // Codex's own copy: keyed by the id IT minted for this submission (see
      // codexRecordIdentity). Separate namespace — a `msg_…` and a webui id
      // are different id spaces, and the ours↔codex twin is retired by the
      // CLAIM below, never by a shared key.
      const codexId = codexRecordIdentity(payload);
      if (codexId) return `${turnId}:response_item:user#codex:${codexId}`;
      // NEITHER side has an id: a pre-0.15x rollout record, or a copy of OURS
      // whose webui id arrived empty (the wrapper writes `webui_msg_id:
      // msg.msgId || ''`). Content is the only fact left — but the two
      // PRODUCERS stay in separate namespaces, so `seen` can only ever collapse
      // copies of ONE producer's record. That is what makes "a record dropped
      // as a duplicate has already had its twin effect applied" true, and with
      // it the round-2 claim leak (a claim short-circuited by `seen` and never
      // retired, which later deleted an unrelated message) structurally
      // impossible. The ours↔codex pair is retired by the CLAIM, as everywhere.
      return `${turnId}:response_item:user#${userRecordIsOurs(payload) ? 'ours' : 'codex'}:${userContentKey(payload) || ''}`;
    }
    const key = payload.call_id || payload.callId || payload.role || payload.type || 'item';
    // Strip volatile fields — the SAME item serializes differently on each
    // side: the wrapper's buffer copy carries item_id, the rollout JSONL copy
    // carries id + internal_chat_message_metadata_passthrough instead. Any of
    // them surviving into the fingerprint made buffer/JSONL twins never dedup
    // (assistant text rendered twice in a row on every attach). webui_peer is
    // the wrapper's peer-message marker (buffer copy only; codex's rollout
    // copy of the same user message has just the text) — same twin rule, or
    // every delivered peer message rendered twice after a restart.
    // thread_id/turn_id ride ONLY the wrapper's copy (B-7473 item context) —
    // stripped for exactly the same reason. The webui user markers are listed
    // here for a record that carries one WITHOUT being a `message`/user pair
    // (the branch above owns every user message and always returns): a marker
    // must never be the difference between our copy and codex's, wherever it
    // rides.
    const { item_id, itemId, id, internal_chat_message_metadata_passthrough, webui_peer, webui_queue_id, webuiQueueId, webui_queue_via, webui_after_commit, webuiAfterCommit,
      webui_no_commit, webuiNoCommit, webui_msg_id, webuiMsgId, client_msg_id, clientMsgId, thread_id, turn_id, ...stablePayload } = payload;
    return `${turnId}:response_item:${payload.type}:${key}:${JSON.stringify(stablePayload)}`;
  }
  if (record.type === 'event_msg') {
    const key = payload.turn_id || payload.turnId || payload.call_id || payload.callId || payload.item_id || payload.itemId || payload.type || 'event';
    const { item_id, itemId, id, internal_chat_message_metadata_passthrough, thread_id, turn_id, ...stablePayload } = payload;
    return `${turnId}:event_msg:${payload.type}:${key}:${JSON.stringify(stablePayload)}`;
  }
  return null;
}

/** A turn_context the WRAPPER synthesized, as opposed to codex's own rollout
 *  copy: ours has always carried `modelPinned` (2.369.32) and now says so
 *  outright. The distinction decides which copy wins the fold below. */
function isWrapperTurnContext(record) {
  const p = record?.payload || {};
  return p.wrapper === true || p.modelPinned !== undefined;
}

/** The wrapper's own copy of a settings record (r2 review). codex's rollout
 *  copy of `thread_settings_applied` carries NINE thread_settings keys
 *  (model_provider_id, approvals_reviewer, collaboration_mode,
 *  permission_profile…) where ours carries five, so the two can never share a
 *  fingerprint — without the marker a rebuilt history holds an unattributable
 *  twin of codex's own record. */
function isWrapperSettingsRecord(record) {
  return record?.payload?.wrapper === true;
}

/** The VALUES a settings record states, as one string — the twin key for the
 *  fold below. Deliberately only the fields both spellings carry. */
function settingsSignature(record) {
  const s = record?.payload?.thread_settings || record?.payload?.threadSettings || {};
  return [s.model || '', s.approval_policy || s.approvalPolicy || '', s.reasoning_effort || s.reasoningEffort || '', s.personality || ''].join('|');
}

// ── THE ID-KEYED USER TWIN (2026-09-07, measured on the owner's own session) ──
// One typed message reaches a rebuild TWICE: the wrapper's buffer copy (written
// as the text passed through it, carrying `webui_msg_id`) and codex's rollout
// copy (written when the app-server COMMITS the message into a turn, carrying
// its own `msg_…` id and nothing of ours). The fingerprint keys the first on
// that webui id and the second on its content, so nothing dedups them — all
// three typed messages in the owner's session rendered TWICE after a reload,
// and the queued path can put the two copies in DIFFERENT turns (ours at send
// time, codex's in the turn that drained it), where even a content key would
// not have collided.
// They cannot simply be keyed on content: two DIFFERENT sends of the same text
// are two messages. So an id-keyed copy of OURS CLAIMS its content, and the
// next codex-side copy of that content CONSUMES the claim and is dropped —
// n copies in, n bubbles out, in order.
// FORWARD ONLY for a claim of OURS: it covers copies that come AFTER it. Ours
// is written first on every path that TYPES or STEERS the text (send/steer time
// < commit time). Letting a late claim swallow an EARLIER codex record would
// DELETE an old message from history whenever the same text was typed again
// after the buffer had rotated away — so a twin that ties on the millisecond
// renders twice instead. A duplicate is a nuisance; a deletion is data loss.
// THE ONE COPY OF OURS THAT IS WRITTEN LAST (round 2) is the bubble for an
// inherited queue item the app-server DRAINED itself: its only trigger is the
// `item/completed` twin, which the app-server emits AFTER it has persisted its
// own record, so no forward claim of ours can ever retire that pair. The
// wrapper marks that record `webui_queue_via:'drained'` — a FACT about how it
// was produced, not a guess about timing — and such a record yields to an
// unconsumed codex copy of the same content IN THE SAME TURN (a submission's
// two copies are always in the turn that committed it) by dropping ITSELF.
// Nothing earlier is ever deleted, and a steered/typed record never yields.
// `webui_no_commit` has NO producer since round 4 (see userTwinKeys) but stays
// on this list: wrappers are long-lived (dtach survives an update — the
// 2.361.1 skew class), and a marker only one producer ever wrote must never
// be the difference between two copies of one message. Retire it when no
// buffer written by a round-3 wrapper can still be replayed.
const WEBUI_USER_MARKERS = ['webui_msg_id', 'webuiMsgId', 'client_msg_id', 'clientMsgId', 'webui_queue_id', 'webuiQueueId', 'webui_queue_via', 'webui_after_commit', 'webuiAfterCommit', 'webui_no_commit', 'webuiNoCommit', 'webui_origin', 'webui_peer'];
const TWIN_VOLATILE_FIELDS = ['id', 'item_id', 'itemId', 'internal_chat_message_metadata_passthrough', 'thread_id', 'turn_id'];
// The event the wrapper writes when it learns that a user record it ALREADY
// wrote will never reach the app-server — see USER_RETRACTION_EVENT below.
const USER_RETRACTION_EVENT = 'webui_user_retracted';

/** Does this user payload come from US? Any webui marker at all — so only a
 *  record with none can be codex's own. */
function userRecordIsOurs(payload) {
  return WEBUI_USER_MARKERS.some((k) => payload[k] !== undefined);
}

/** A content block as the TWIN compares it. An `input_image` is compared on
 *  {type, image_url} ONLY: codex stamps its own `detail` onto the block it
 *  persists (34 of the 40 image blocks in the local rollout corpus carry it,
 *  including 2026-08 files; every `input_text` block is exactly {type,text}),
 *  and a field only ONE producer writes must never be the difference between
 *  two copies of one message — the record-level rule of TWIN_VOLATILE_FIELDS,
 *  applied inside the content array. */
function normalizeUserContentBlock(block) {
  if (!block || typeof block !== 'object') return block;
  if (block.type === 'input_image') return { type: 'input_image', image_url: block.image_url };
  return block;
}

/** The content of a user message, with every marker and volatile field of both
 *  producers removed — ONE definition, shared by the fingerprint's id-less
 *  fallback and the twin claim, so the two can never disagree about what "the
 *  same text" is. Null when the payload cannot be serialized. */
function userContentKey(payload) {
  const bare = { ...payload };
  for (const k of [...WEBUI_USER_MARKERS, ...TWIN_VOLATILE_FIELDS]) delete bare[k];
  if (Array.isArray(bare.content)) bare.content = bare.content.map(normalizeUserContentBlock);
  try { return 'user:' + JSON.stringify(bare); } catch { return null; }
}

/** {ours, late, contentKey} for a user message response_item, else null.
 *  `ours` = the record carries ANY webui marker, so only a record with none can
 *  be codex's own — keying "codex's copy" on the presence of ITS fields
 *  (`internal_chat_…passthrough`, a `msg_` id) instead would be a guess: 147 of
 *  629 user records in the local rollout corpus carry neither.
 *  EVERY copy of ours claims (round 2). Round 1 claimed only the id-keyed ones
 *  because a content-keyed copy of ours collided with codex's copy on the
 *  fingerprint itself; now that codex's copy is keyed by ITS id, the claim is
 *  the ONLY thing that retires the pair, for a peer copy and a falsy-webui-id
 *  copy exactly as much as for a typed one. */
function userTwinKeys(record) {
  if (!record || record.type !== 'response_item') return null;
  const payload = record.payload || {};
  if (payload.type !== 'message' || payload.role !== 'user') return null;
  const contentKey = userContentKey(payload);
  if (contentKey === null) return null;
  const ours = userRecordIsOurs(payload);
  // A copy of ours that was written AFTER the app-server persisted its own is
  // the one a forward claim can never retire — it says so with
  // `webui_after_commit`. COMPAT RUNG: a PEER copy is late-capable whether or
  // not it says so, because every wrapper shipped before that marker wrote the
  // idle-path record (post-`turn/start`, i.e. after the commit) unmarked, and
  // those buffers live on inside running sessions. Yielding costs such a record
  // nothing when it really was first: it only ever yields to a codex copy
  // ALREADY emitted in the same turn, which cannot exist yet. Retire the rung
  // when no pre-marker buffers survive.
  const marked = payload.webui_after_commit === true || payload.webuiAfterCommit === true;
  // A SUBMISSION THAT NEVER REACHED THE APP-SERVER has no twin to retire the
  // pair against, so its claim must be withdrawn (round 3): our copy is written
  // BEFORE the submission is accepted, and a wrapper-served slash command
  // (/compact, /review, /model, /effort) is answered by the wrapper itself —
  // the text never becomes a user message. A leaked claim would delete an
  // unrelated codex-only record of the same text later, which is round-2
  // finding ④ through a second back door.
  // THERE IS NO WRITE-TIME DECLARATION FOR THIS (round 4). Round 3 had one — a
  // `webui_no_commit` marker on the record — and it was INERT: a typed message
  // has TWO copies of ours, the wrapper's and the SERVER's preview
  // (CodexAdapter._buildUserPreview, written first and therefore the copy this
  // function is asked about), and only the wrapper can know that a text is one
  // of its own slash commands. Every case now speaks through the retraction
  // event below, which names the submission by ID — a fact both copies carry.
  return {
    ours,
    claims: ours,
    late: ours && (marked || payload.webui_peer !== undefined),
    contentKey,
  };
}

/** The submission id a `webui_user_retracted` event names, or ''. The wrapper
 *  emits it when a user record it already wrote will never be committed by the
 *  app-server AS WRITTEN — learned after the fact (the RPC threw, the queued
 *  item was removed by Stop / by the user before it ran, or its text was
 *  REWRITTEN by the `edit` verb while it waited: that submission does run, but
 *  the words codex commits are no longer the words the record claims, so the
 *  claim can never be retired) or known at once (a
 *  wrapper-served slash command). It names the
 *  record by IDENTITY, never by content: the text can be megabytes of data URL,
 *  and re-deriving a content key inside the wrapper would be a second copy of
 *  userContentKey's algorithm, free to drift from this one. */
function retractionIdOf(record) {
  if (!record || record.type !== 'event_msg') return '';
  const payload = record.payload || {};
  if (payload.type !== USER_RETRACTION_EVENT) return '';
  return String(payload.msg_id || payload.msgId || '');
}

/** THE MERGE, STEPPED (lane resume-all-paced, L2 — measured on a 120 MB rollout: one merge of a 32 MB tail is 163–343 ms of the
 *  hub's loop, and an attach ran two): mergeCodexRecords' ONE body as a generator that yields every 1 024 records — the sync
 *  mergeCodexRecords drives it to the end at once, mergeCodexRecordsAsync in slices with the loop free between them. The same
 *  records either way (it is the same code). */
// B-f3f9: how many merges ran on the MAIN thread (the attach's proof counts them; a worker's copy of this module counts its own,
// never read from here)
const ON_MAIN_THREAD = (() => { try { return require('worker_threads').isMainThread; } catch { return true; } })();
const _mergeCounts = { main: 0 };
function mergeCounts() { return { ..._mergeCounts }; }
function mergeCodexRecords(historyRecords, liveRecords) {
  if (ON_MAIN_THREAD) _mergeCounts.main++;
  const g = mergeCodexRecordsSteps(historyRecords, liveRecords);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
async function mergeCodexRecordsAsync(historyRecords, liveRecords, { sliceMs = 20 } = {}) {
  if (ON_MAIN_THREAD) _mergeCounts.main++;
  const g = mergeCodexRecordsSteps(historyRecords, liveRecords);
  let t0 = performance.now(), r = g.next();
  while (!r.done) {
    if (performance.now() - t0 >= sliceMs) { await new Promise((res) => setImmediate(res)); t0 = performance.now(); }
    r = g.next();
  }
  return r.value;
}
function* mergeCodexRecordsSteps(historyRecords, liveRecords) {
  const merged = [];
  const seen = new Set();
  const keptTurnContexts = new Map(); // fingerprint → the copy that made it into `merged`
  // The most recent thread_settings_applied that made it into `merged`, and the
  // values it stated. ADJACENCY is the whole point: a conversation that goes
  // high → ultra → high states the same signature twice on purpose, and folding
  // the third record into the FIRST would make the rebuilt status report
  // 'ultra' at the end. Only a repeat with nothing of its own kind in between
  // is a twin of the same event.
  let lastSettings = null; // { record, sig, turnId }
  const userClaims = new Map();   // content key → copies of OURS no codex twin has consumed yet (forward, turn-independent)
  const codexUserOut = new Map(); // `<turn>\u0000<content key>` → codex copies emitted in THIS turn no late twin of ours has consumed
  const oursByIdentity = new Map(); // submission id → the content key the copy of OURS carrying that id claimed under (what a retraction names)
  let currentTurnId = 'prelude', step = 0;
  // sortRecords, stepped: the decoration yields every 1 024 records, the numeric sort runs whole (the same order)
  const all = [...(historyRecords || []), ...(liveRecords || [])], sorted = new Array(all.length);
  for (let idx = 0; idx < all.length; idx++) { sorted[idx] = decorateForSort(all[idx], idx); if ((idx & 1023) === 1023) yield; }
  sorted.sort(sortCompare);
  yield;
  for (const record of sorted) {
    if ((++step & 1023) === 0) yield;
    if (record.type === 'turn_context') {
      currentTurnId = record.payload?.turn_id || record.payload?.turnId || currentTurnId;
    }
    const settingsSig = record.type === 'event_msg' && record.payload?.type === 'thread_settings_applied'
      ? settingsSignature(record) : null;
    if (settingsSig !== null) {
      const twin = lastSettings && lastSettings.sig === settingsSig && lastSettings.turnId === currentTurnId ? lastSettings.record : null;
      if (twin) {
        // Same event, two authors. codex's own copy is the record; ours only
        // ever stood in for it (the live buffer has no rollout). Keep the
        // FIRST copy's position (it is the same moment either way) and take
        // codex's payload when it is the one that arrived second — never
        // mutate in place, `twin` is sortRecords' own shallow copy.
        if (isWrapperSettingsRecord(twin) && !isWrapperSettingsRecord(record)) twin.payload = { ...record.payload };
        continue;
      }
    }
    const fp = recordFingerprint(record, currentTurnId);
    // The SAME record from two sources — already decided (emitted, or dropped
    // as a twin, which also marks the fingerprint). It must not touch the claim
    // ledgers a second time… UNLESS its identity was INFERRED FROM CONTENT: a
    // pre-0.15x record carries no id of its own, so "duplicate" is a guess and
    // this may be a second submission of the same text whose twin claim would
    // otherwise leak — and a leaked claim DELETES an unrelated message later,
    // while retiring one duplicate too many only ever renders one extra bubble.
    // A deletion is data loss; a duplicate is a nuisance (round-2 finding).
    if (fp && seen.has(fp)) {
      // TURN_CONTEXT TWINS (2.369.62, the effort incident): the wrapper
      // synthesizes one the moment `turn/started` arrives (live visibility) and
      // codex writes its own when the turn really begins — same turn id, same
      // fingerprint, and OURS is always the earlier of the two, so first-wins
      // silently suppressed codex's authoritative copy for the whole life of
      // the conversation (a turn codex recorded as 'ultra' stayed 'xhigh'
      // forever). A repeat is a REFRESH of one turn, never a second turn:
      // position from the first copy, per-turn VALUES from the better one —
      // codex's own always wins, a later wrapper copy only overrides an earlier
      // wrapper copy (that is the wrapper's own late correction).
      const kept = record.type === 'turn_context' ? keptTurnContexts.get(fp) : null;
      if (kept && kept.payload && record.payload && isWrapperTurnContext(kept)) {
        // never mutate the parsed record in place — a cached rollout parse is
        // shared between reads; `kept` is sortRecords' own shallow copy
        const folded = { ...kept.payload };
        if (record.payload.effort) folded.effort = record.payload.effort;
        if (record.payload.model) folded.model = record.payload.model;
        if (!isWrapperTurnContext(record)) delete folded.effort_next; // codex's copy settles it: nothing pending in a rebuilt history
        kept.payload = folded;
      }
      const dup = userTwinKeys(record);
      if (dup && !dup.ours && !codexRecordIdentity(record.payload || {})) {
        const claimed = userClaims.get(dup.contentKey) || 0;
        if (claimed > 0) userClaims.set(dup.contentKey, claimed - 1);
      }
      continue;
    }
    // A RETRACTION (round 3): the wrapper writes our copy BEFORE the submission
    // is accepted, so it can only learn afterwards that the app-server will
    // never commit it AS WRITTEN — an RPC that threw, an item Stop or the user
    // removed from the queue before it ran, an item whose text the `edit` verb
    // replaced while it waited. The claim standing for that record is
    // withdrawn here, in stream order (the retraction is always written after
    // the record it names, so the mapping exists by now unless the buffer has
    // rotated the record away, where there is no claim to withdraw either).
    // The RECORD stays: the user typed it, and the bubble is the truth. Only
    // the claim goes — a claim no twin will ever consume is the thing that
    // deletes an unrelated message later.
    const retractedId = retractionIdOf(record);
    if (retractedId) {
      const key = oursByIdentity.get(retractedId);
      const claimed = key ? (userClaims.get(key) || 0) : 0;
      if (claimed > 0) userClaims.set(key, claimed - 1);
    }
    const twin = userTwinKeys(record);
    if (twin) {
      const turnKey = `${currentTurnId}\u0000${twin.contentKey}`;
      if (twin.ours) {
        const emitted = twin.late ? (codexUserOut.get(turnKey) || 0) : 0;
        if (emitted > 0) {   // we are the LATE copy and codex's is already on screen — yield, never delete
          codexUserOut.set(turnKey, emitted - 1);
          if (fp) seen.add(fp);
          continue;
        }
        if (twin.claims) {
          userClaims.set(twin.contentKey, (userClaims.get(twin.contentKey) || 0) + 1);
          const identity = userRecordIdentity(record.payload || {});
          if (identity) oursByIdentity.set(identity, twin.contentKey);
        }
      } else {
        const claimed = userClaims.get(twin.contentKey) || 0;
        if (claimed > 0) {   // codex's copy of a bubble we already have
          userClaims.set(twin.contentKey, claimed - 1);
          if (fp) seen.add(fp);
          continue;
        }
        codexUserOut.set(turnKey, (codexUserOut.get(turnKey) || 0) + 1);
      }
    }
    if (fp) seen.add(fp);
    if (fp && record.type === 'turn_context') keptTurnContexts.set(fp, record);
    // remembered only once the record really made it into `merged` — a pointer
    // at a record the fingerprint dedup dropped would fold codex's copy into
    // something no reader ever sees
    if (settingsSig !== null) lastSettings = { record, sig: settingsSig, turnId: currentTurnId };
    delete record.__idx;
    delete record.__ts;
    merged.push(record);
  }
  return merged;
}

/** parseCodexSessionJsonl OFF THE LOOP (lane resume-all-paced, L2): a present rollout parsed in the transcript worker (its
 *  boundedParsed parse — the same tail-only read and line parse), handed back in pages; a missing one, or a pool that is down, the
 *  sync parse — and a parse that goes back on the loop SAYS WHY (L3 cure, 主开发 23:16Z: the paged read's own reason — gone twice,
 *  the lane busy, the worker died, its heap bound, no pool — counted and logged by parseCodexSessionJsonl). */
const NOT_LOADED = 'transcript_reader_restarting';
const _notLoadedSaid = new Set();
function noteNotLoadedOnce(threadId, why) {
  if (_notLoadedSaid.has(threadId)) return;
  if (_notLoadedSaid.size > 256) _notLoadedSaid.clear();
  _notLoadedSaid.add(threadId);
  console.warn(`[codex] ${threadId}: its history is not loaded yet — the transcript reader could not read it (${why}); nothing is read on the main loop (row B-422c)`);
}
async function parseCodexSessionJsonlAsync(threadId, { fp: known } = {}) {
  let fp = null;
  if (known !== undefined) fp = known || null;   // B-f3f9: a path this read already looked up (null = not on disk) — never a second walk
  else { try { fp = findCodexSessionJsonlPath(threadId); } catch { fp = null; } }
  let why = 'its rollout was not found (the thread/read copy is read)';
  if (fp) {
    try {
      const { readJsonlBoundedParsedPagedAsync } = require('./adapters/codex');
      const r = await readJsonlBoundedParsedPagedAsync(fp, { tailOnly: true, onFail: (w) => { why = w; } });   // in pages: the loop free between them
      if (Array.isArray(r)) return r;
    } catch (e) { why = 'the off-loop read threw: ' + ((e && e.message) || e); }
    // ROW B-422c (主开发 r1006 — A for every road): the off-loop read FAILED (the pool closed, no worker, a deadline, a lane busy or
    // bounded): NOTHING is parsed on the loop — «not loaded yet» (an empty list tagged; the reader says it, the page shows it)
    noteNotLoadedOnce(threadId, why);
    return Object.assign([], { notLoaded: NOT_LOADED, why });
  }
  return parseCodexSessionJsonl(threadId, { why, fp });   // no rollout on disk: the thread/read copy (no file read), never a second walk
}

/** B-f3f9: the files a conversation's merged read names — its fork ancestry's rollouts in order, its own last — `files` null when
 *  one is not on disk (the old road reads its thread/read copy) or there is none (nothing to merge but the live buffer). `fps` =
 *  every path looked up (id → path | null): the old road reads them from here, never walking the store a second time */
function codexHistoryFiles(threadId, ancestry) {
  const files = [], fps = new Map();
  const pathOf = (id) => { let fp = null; try { fp = findCodexSessionJsonlPath(id) || null; } catch { fp = null; } fps.set(id, fp); return fp; };
  for (const { id, untilOrdinal } of ancestry || []) {
    if (!pathOf(id)) return { files: null, fps };
    files.push({ fp: fps.get(id), threadId: String(id), untilOrdinal: Number.isInteger(untilOrdinal) ? untilOrdinal : null });
  }
  if (threadId) {
    if (!pathOf(threadId)) return { files: null, fps };
    files.push({ fp: fps.get(threadId), threadId: String(threadId), untilOrdinal: null });
  }
  return { files: files.length ? files : null, fps };
}
/** B-f3f9: a merged read that gave up is SAID (its reason; the first ten, then every hundredth) — the old road still reads off the loop */
let _mergedFallbacks = 0;
function noteMergedFallback(why) {
  _mergedFallbacks++;
  if (_mergedFallbacks <= 10 || _mergedFallbacks % 100 === 0) console.warn(`[codex] a conversation's merged history read fell back to the paged parse (${_mergedFallbacks}): ${String(why || 'no reason').slice(0, 200)}`);
}
/** THE HUB READS ONE CONVERSATION'S RECORDS AT A TIME (lane resume-all-paced, L3 — measured: a storm of 8 resumed conversations
 *  over 100 MB on a ballasted scratch hub). Off the loop, the attaches no longer wait on each other as the sync read made them
 *  do: all eight parsed and merged AT ONCE — the main heap reached 4.1 GB (eight conversations' records alive together) and the
 *  hub's RSS stayed at 7.0 GB against master's 3.6. A read waits for the one before it to END (records merged, or failed) — never
 *  on a clock; each still runs off the loop.
 *  A PERSON'S OWN WINDOW GOES FIRST (L3 cure, 主开发 23:16Z): two lines — a read a person's window asked for (an attach, a view, a
 *  page) goes before every read a bulk resume queued (`bulk`: the first attach of a conversation a paced «Resume all» created);
 *  in each line, first come first served. One turn = one conversation's read: its fork ancestry whole (≤ 8 native parents —
 *  resolveCodexForkAncestry's depth — plus the forks VibeSpace made of it, the session's forkedFrom), each file one ≤ 32 MiB tail
 *  read in pages. → fn's promise */
const _readLine = { person: [], bulk: [] };
let _reading = false;
function oneReadAtATime(fn, { bulk = false } = {}) {
  return new Promise((resolve, reject) => {
    _readLine[bulk ? 'bulk' : 'person'].push({ fn, resolve, reject });
    _nextRead();
  });
}
function _nextRead() {
  if (_reading) return;
  const job = _readLine.person.shift() || _readLine.bulk.shift();
  if (!job) return;
  _reading = true;
  Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => { _reading = false; _nextRead(); });
}
/** the reads waiting their turn now (the attach's acks say it; tests read it) */
function readsWaiting() { return { person: _readLine.person.length, bulk: _readLine.bulk.length, reading: _reading }; }

// the reason a SYNC read of a reader gives when it parses (lane resume-all-paced L3 cure): no door of the hub reads a codex reader
// before its off-loop read (src/attach-read.js readOffLoop) — a caller that does is named by this line in the hub's log
const SYNC_ROAD = 'a reader was read before its off-loop read (raw / chatStatus / slice on a fresh reader)';

class CodexSessionMessages {
  constructor(session, sessionId, { buffersDir } = {}) {
    this._session = session;
    this._sessionId = sessionId;
    this._buffersDir = buffersDir;
    this._all = null;
    this._wrapperMeta = undefined;
  }

  _ensureParsed() {
    if (this._all) return;
    const threadId = getCodexHistorySessionId(this._session);
    // Fork ancestry first (oldest → newest; the wrapper chain whole, codex's
    // own 0.153 fork parents cut at their boundary ordinal), then the current
    // thread. NOTE: parseCodexSessionJsonl is tail-bounded (32MB) — a
    // Referenced fork off a parent larger than that reads the parent's TAIL,
    // which the boundary then (correctly) rejects: bounded, never wrong records.
    const ancestry = resolveCodexForkAncestry(threadId, this._session?.forkedFrom || []);
    let history = [];
    // Every file's records are tagged with THAT file's thread id (tagRecordThread)
    // — the normalizer keys each response's ledger meta by the record's own
    // file, exactly as the walker does; the reader's id is only the default
    // for provenance-less records (the live buffer below).
    for (const { id: forkId, untilOrdinal } of ancestry) {
      const forkHistory = tagRecordThread(cutRecordsAtOrdinal(parseCodexSessionJsonl(forkId, { why: SYNC_ROAD }), untilOrdinal), forkId);
      if (forkHistory.length) history = mergeCodexRecords(history, forkHistory);
    }
    const currentHistory = threadId ? tagRecordThread(parseCodexSessionJsonl(threadId, { why: SYNC_ROAD }), threadId) : [];
    if (currentHistory.length) history = mergeCodexRecords(history, currentHistory);
    const live = parseBufferRecords(this._session?.buffer || '');
    this._all = mergeCodexRecords(history, live);
  }

  /** The attach's records off the loop — kb-file-structure «src/codex-session-store.js» (lane resume-all-paced L2). */
  rawAsync({ bulk = false, wanted = null } = {}) {
    // THE ATTACH'S RECORDS OFF THE LOOP (lane resume-all-paced, L2 — measured on a 120 MB rollout: the sync _ensureParsed held the
    // hub's loop 380–880 ms per attach — the parse 73–123 ms, mergeCodexRecords TWICE at 163–343 ms each): _ensureParsed's SAME
    // steps, the parse in the transcript worker (readJsonlBoundedParsedAsync — the same parse; the sync one when the pool is down or
    // the rollout is missing) and every merge in slices. ws-handler's live attach and its read-only view, and the transcript service's
    // view and status, await it before they read raw(). NOT named prepare(): a reader with prepare() is «serve-backed» to the search
    // index (src/search-index-worker.js), which then skips it — codex conversations must stay searchable.
    if (this._all) return Promise.resolve(this._all);
    if (this._rawAsync) return this._rawAsync;
    const job = oneReadAtATime(async () => {
      if (this._all) return this._all;   // the sync road filled it while this one waited its turn
      // A READ NOBODY WILL USE IS DROPPED BEFORE IT STARTS (主开发 02:22Z, the restack's follow-up): `wanted` is asked when this read's
      // turn comes — a socket closed while it waited (a reload storm queues reads nobody will use) frees the line at once, unread
      if (typeof wanted === 'function' && !wanted()) return null;
      const threadId = getCodexHistorySessionId(this._session);
      const ancestry = resolveCodexForkAncestry(threadId, this._session?.forkedFrom || []);
      // B-f3f9: THE WHOLE READ IN THE WORKER — every file of the ancestry and the thread's own read, parsed, cut, tagged and merged,
      // then the live buffer merged, in the transcript worker's history lane; only the FINAL records cross (in pages), each re-tagged
      // here with its file's thread. A file it cannot name (a missing rollout: the thread/read copy), a pool that is down, or a refusal
      // (the heap bound, a snapshot gone twice, the lane busy) ⇒ the steps below, as before (each file paged, the merges in slices).
      const { files, fps } = codexHistoryFiles(threadId, ancestry);
      if (files) {
        const got = await require('./adapters/codex').codexHistoryMergedPagedAsync({ files, liveBuffer: () => this._session?.buffer || '' }, { onFail: noteMergedFallback });
        if (got && Array.isArray(got.records)) {
          if (this._all) return this._all;   // the sync road filled it meanwhile
          for (let i = 0; i < got.records.length; i++) if (got.threads[i]) tagOne(got.records[i], got.threads[i]);
          this._all = got.records;
          return this._all;
        }
        for (const [id, fp] of fps) if (fp) fps.delete(id);   // a file the worker failed on may have moved (compressed to .zst): looked up again (its kept path)
      }
      let history = [], notLoaded = null;
      for (const { id: forkId, untilOrdinal } of ancestry) {
        const forkRead = await parseCodexSessionJsonlAsync(forkId, { fp: fps.get(forkId) });
        if (forkRead.notLoaded) notLoaded = forkRead.notLoaded;
        const forkHistory = tagRecordThread(cutRecordsAtOrdinal(forkRead, untilOrdinal), forkId);
        if (forkHistory.length) history = await mergeCodexRecordsAsync(history, forkHistory);
      }
      const currentRead = threadId ? await parseCodexSessionJsonlAsync(threadId, { fp: fps.get(threadId) }) : [];
      if (currentRead.notLoaded) notLoaded = currentRead.notLoaded;
      if (notLoaded) this.notLoaded = notLoaded;   // row B-422c: the page says the history waits on the reader (the live buffer still shown)
      const currentHistory = threadId ? tagRecordThread(currentRead, threadId) : [];
      if (currentHistory.length) history = await mergeCodexRecordsAsync(history, currentHistory);
      const live = parseBufferRecords(this._session?.buffer || '');
      const all = await mergeCodexRecordsAsync(history, live);
      if (!this._all) this._all = all;
      return this._all;
    }, { bulk });
    // A READ THAT MAY BE DROPPED IS NEVER THE READER'S SHARED MEMO (主开发 03:16Z, the follow-up's third item): a job carrying `wanted` can
    // end as nothing — a second caller joining it would get that nothing though it wanted the records. Such a job is its caller's
    // alone; a later caller starts its own (queued behind it, and answered at once from `_all` if the first one read)
    if (typeof wanted === 'function') return job;
    this._rawAsync = job.finally(() => { this._rawAsync = null; });
    return this._rawAsync;
  }

  get total() { this._ensureParsed(); return this._all.length; }
  raw() { this._ensureParsed(); return this._all; }
  tail(n = 50) { this._ensureParsed(); return this._all.slice(-n); }
  slice(offset, limit) { this._ensureParsed(); return this._all.slice(offset, offset + limit); }

  get isStreaming() {
    const meta = this.wrapperMeta();
    return !!meta?.streaming;
  }

  /** B-952b (its smalls, 主开发 03:40Z): the side file read OFF the loop — a route's refetch (Properties, at every broadcast) on a
   *  data folder that may sit on a slow mount; wrapperMeta() then answers from what this read. → the meta | null */
  async loadWrapperMeta() {
    if (this._wrapperMeta !== undefined) return this._wrapperMeta;
    if (!this._buffersDir || !this._sessionId) { this._wrapperMeta = null; return null; }
    try { this._wrapperMeta = JSON.parse(await fs.promises.readFile(path.join(this._buffersDir, `${this._sessionId}.json`), 'utf-8')); } catch { this._wrapperMeta = null; }
    return this._wrapperMeta;
  }

  wrapperMeta() {
    if (this._wrapperMeta !== undefined) return this._wrapperMeta;
    if (!this._buffersDir || !this._sessionId) {
      this._wrapperMeta = null;
      return this._wrapperMeta;
    }
    try {
      this._wrapperMeta = JSON.parse(fs.readFileSync(path.join(this._buffersDir, `${this._sessionId}.json`), 'utf-8'));
    } catch {
      this._wrapperMeta = null;
    }
    return this._wrapperMeta;
  }

  chatStatus() {
    this._ensureParsed();
    const status = {
      model: '',
      lastUsage: null,
      contextWindow: 0,
      total_cost_usd: 0,
      permissionMode: '',
      permissionModes: ['default', 'read-only', 'safe-yolo', 'yolo'],
      subagentMetas: [],
      // effort = what the LAST turn ran at; effortNext = the pick that applies
      // from the next one (2.369.62 — one field could not say both, and the
      // popup baked the wrong one onto every message of a turn)
      effort: null,
      effortNext: null,
      sandbox: null,
      totalUsage: null,
    };
    const meta = this.wrapperMeta();
    if (meta?.model) status.model = meta.model;
    if (meta?.permissionMode) status.permissionMode = meta.permissionMode;
    if (meta?.contextWindow) status.contextWindow = meta.contextWindow;
    if (meta?.subagentMetas) status.subagentMetas = meta.subagentMetas;
    if (meta?.sandbox) status.sandbox = meta.sandbox;
    // the wrapper's live pair (2.369.62) — records below still override the
    // live-turn value, but a session attached before its first turn_context
    // (or one whose pick has not started a turn yet) is honest right away
    if (meta?.effort) status.effort = meta.effort;
    if (meta?.effortNext || meta?.effortOverride) status.effortNext = meta.effortNext || meta.effortOverride;
    if (meta?.totalTokenUsage) {
      const t = meta.totalTokenUsage;
      status.totalUsage = {
        total_tokens: t.total_tokens ?? t.totalTokens ?? 0,
        input_tokens: t.input_tokens ?? t.inputTokens ?? 0,
        cached_input_tokens: t.cached_input_tokens ?? t.cachedInputTokens ?? 0,
        output_tokens: t.output_tokens ?? t.outputTokens ?? 0,
        reasoning_output_tokens: t.reasoning_output_tokens ?? t.reasoningOutputTokens ?? 0,
      };
    }

    for (const record of this._all) {
      if (record.type === 'session_meta' && !status.model) {
        status.model = record.payload?.model || '';
      } else if (record.type === 'turn_context') {
        if (record.payload?.model) status.model = record.payload.model;
        if (record.payload?.permissionMode) status.permissionMode = record.payload.permissionMode;
        if (record.payload?.approval_policy && !status.permissionMode) status.permissionMode = record.payload.approval_policy;
        if (record.payload?.model_context_window) status.contextWindow = record.payload.model_context_window;
        if (record.payload?.effort) {
          status.effort = record.payload.effort;
          // a turn_context that names an effort also settles the pending
          // question: effort_next present = a re-pick waiting for the next turn
          status.effortNext = record.payload.effort_next || record.payload.effortNext || null;
        }
        if (record.payload?.sandbox_policy && !status.sandbox) status.sandbox = record.payload.sandbox_policy;
      } else if (record.type === 'wrapper_meta') {
        // the wrapper restates its pair on every change (set-effort included)
        if (record.payload?.effort) status.effort = record.payload.effort;
        if (record.payload?.effortNext !== undefined) status.effortNext = record.payload.effortNext || null;
      } else if (record.type === 'event_msg' && record.payload?.type === 'thread_settings_applied') {
        // codex's own settings record = the THREAD's effort = the NEXT turn's
        const level = record.payload.thread_settings?.reasoning_effort;
        if (level) { status.effortNext = level; if (!status.effort) status.effort = level; }
      } else if (record.type === 'event_msg' && record.payload?.type === 'token_count') {
        const info = record.payload.info || {};
        const last = info.last_token_usage || info.lastTokenUsage || info.total_token_usage || null;
        if (last) {
          status.lastUsage = {
            input_tokens: last.input_tokens || last.inputTokens || 0,
            cache_read_input_tokens: last.cached_input_tokens || last.cache_read_input_tokens || last.cachedInputTokens || 0,
            cache_creation_input_tokens: last.cache_creation_input_tokens || last.cacheCreationInputTokens || 0,
          };
        }
        if (info.model_context_window || info.modelContextWindow) {
          status.contextWindow = info.model_context_window || info.modelContextWindow;
        }
      }
    }

    return status.model || status.lastUsage || status.permissionMode ? status : null;
  }

  taskState() {
    const meta = this.wrapperMeta();
    const tasks = {};
    for (const [taskId, taskInfo] of Object.entries(meta?.tasks || {})) {
      if ((taskInfo?.type || '') !== 'agent') continue;
      if ((taskInfo?.status || '') !== 'running') continue;
      tasks[taskId] = taskInfo;
    }
    // Codex's plan tool (update_plan) — persisted by the wrapper, mapped to
    // the same TODO shape Claude's TodoWrite uses so attach restores the
    // TODO display
    const todos = (Array.isArray(meta?.plan) ? meta.plan : []).map((p) => ({
      content: p.step || '',
      status: p.status === 'inProgress' || p.status === 'in_progress' ? 'in_progress'
        : p.status === 'completed' ? 'completed' : 'pending',
    })).filter((t) => t.content);
    return {
      tasks,
      todos,
    };
  }
}

/** Sync listing (user-action consumers: the create's thread baseline and capture, the persistence key map — none reads a
 *  row's status). B-f64b: liveness from the KEPT walk answer (keptOpenThreadIds), never a /proc walk on the main loop;
 *  before an answer a row that is not ours carries liveness: 'unknown'. */
function listCodexThreads({ activeSessions } = {}) {
  const kept = keptOpenThreadIds();
  return assembleCodexThreads(collectCodexThreadMetas(), { activeSessions, openThreadIds: kept || new Set(), livenessUnknown: !kept });
}

/** The walk alone, OFF the event loop (the worker twin of
 *  collectCodexThreadMetas; the pool refusing ⇒ its kept listing, never the walk inline — row B-422c).
 *  Used by any request-path consumer that needs the metas but must not block
 *  the loop — /api/subagents measured 193 ms of sync walk on a modest tree. */
async function collectCodexThreadMetasAsync() {
  return threadMetasOffLoop();
}
/** ROW B-422c: the metas walk OFF the loop, or its KEPT listing — the last one the worker answered — when the pool refuses (null:
 *  not known yet); never the walk on the main loop (the release walked ~/.codex/sessions inline on the 5 s poll while the pool
 *  was down). The refusal said once until the walk answers again. */
let _keptThreadMetas = null, _metasRefusedSaid = false;
async function threadMetasOffLoop() {
  let refused = null;
  const facts = await transcriptWorkerCall('codexThreadMetas', {}, (e) => { refused = e || { why: 'no answer' }; return null; });
  if (!refused && facts) { _keptThreadMetas = facts; _metasRefusedSaid = false; return facts; }
  if (!_metasRefusedSaid) { _metasRefusedSaid = true; console.warn(`[codex] the thread listing's walk was refused by the transcript pool (${(refused && (refused.why || refused.message)) || 'no answer'}) — its kept listing is answered${_keptThreadMetas ? '' : ' (none yet: codex threads are not known until it answers)'}; nothing is walked on the main loop`); }
  return _keptThreadMetas;
}

/** The 5s-poll listing (S3): walk + head reads + the /proc scan run in the
 *  transcript worker; only the assembly touches the main thread. Worker
 *  down ⇒ the metas walk runs inline (identical result, no isolation); the LIVENESS walk never does (B-f64b: the
 *  kept answer, else liveness: 'unknown' on the rows). */
async function listCodexThreadsAsync({ activeSessions } = {}) {
  const [facts, openThreadIds] = await Promise.all([
    threadMetasOffLoop(),   // row B-422c: the kept listing on a refusal, never the walk inline
    listOpenCodexThreadIdsAsync(),
  ]);
  return assembleCodexThreads(facts || { metas: [], mergedThreadIds: [] }, { activeSessions, openThreadIds: openThreadIds || new Set(), livenessUnknown: !openThreadIds });   // B-f64b: a walk that could not answer is said (liveness: 'unknown'), never a bare «stopped»
}

// oneReadAtATime: the hub's one-history-read-at-a-time gate, a person's line before a bulk resume's (lane resume-all-paced L3) — test-codex-attach-off-loop ⑤ ⑥
module.exports = {
  CODEX_SESSIONS_DIR,
  CodexSessionMessages,
  findCodexSessionJsonlPath,
  getCodexHistorySessionId,
  listCodexThreads,
  listCodexThreadsAsync,
  collectCodexThreadMetas,
  collectCodexThreadMetasAsync,
  assembleCodexThreads,
  listOpenCodexThreadIdsAsync,
  dirCacheStats,
  mergeCodexRecords,
  mergeCodexRecordsAsync,
  parseCodexSessionJsonlAsync,
  oneReadAtATime,
  readsWaiting,
  recordFingerprint,
  userTwinKeys,
  userRecordIdentity,
  codexRecordIdentity,
  userContentKey,
  retractionIdOf,
  USER_RETRACTION_EVENT,
  parseCodexSessionJsonl,
  resolveCodexForkAncestry,
  cutRecordsAtOrdinal,
  tagRecordThread,
  recordThreadOf,
  RECORD_THREAD_KEY,
  parseBufferRecords,
  mergeCounts,   // B-f3f9
};
