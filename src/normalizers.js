const { HARNESSES } = require('./harnesses');
const { MessageManager } = require('./message-manager');
const { helperParentOf: helperParentFromTaskRecords } = require('./helper-ask.js'); // PURE (lane S1)

// REGISTRY, not a ternary (P4, design-backend-parity.md §4): the old
// `backend === 'codex' ? Codex : Claude` shape silently handed every FUTURE
// backend the claude normalizer — the gemini-as-claude fallthrough class. An
// unregistered backend fails LOUDLY at session start, where the gap is
// obvious, instead of mis-parsing an entire conversation. Since S1 the rows
// come from the harness descriptors (src/harnesses/<id>.js Normalizer).
const NORMALIZERS = Object.fromEntries(Object.values(HARNESSES).map((h) => [h.id, h.Normalizer
  || MessageManager])); // terminal-only harnesses (shell) get the inert claude shape — they have no chat mode

// opts (optional, harness-neutral): { threadId } — the READER's conversation
// id for the transcript it opened. The codex normalizer keys its per-message
// ledger meta (`cx:<thread>:<cumulative>`) by each record's own FILE (a merged
// read tags records with the rollout they came from — codex-session-store.
// tagRecordThread) and uses this id as the DEFAULT for provenance-less records
// (gap slabs carry no session_meta at all; the live buffer); the wrapper's
// wrapper_meta.threadId re-points that default on a mid-life thread/fork, and
// fork-ancestry / parent-provenance session_metas never do. Normalizers that
// have no use for it ignore the extra argument.
function createMessageManager(backend, sessionId, opts) {
  const Ctor = NORMALIZERS[backend || 'claude'];
  if (!Ctor) throw new Error(`no message normalizer registered for backend "${backend}" — add it to src/normalizers.js NORMALIZERS`);
  return new Ctor(sessionId, opts);
}

/**
 * THE live-feed gate (2.369.16). Every live record reaches the session's
 * normalizer through here — never processLive() directly — so a rebuild in
 * progress can hold records back (session._rebuildQueue) and replay them in
 * order once the history is converted. Without the gate, a record arriving
 * mid-rebuild landed BEFORE the rest of the history.
 */
function feedLive(session, msg) {
  if (!session?._normalizer) return;
  if (session._rebuildQueue) { session._rebuildQueue.push({ kind: 'live', msg }); return; }
  const v0 = session._normalizer.pendingAsksVersion;
  session._normalizer.processLive(msg);
  routeToHelperView(session, msg);
  if (session._normalizer.pendingAsksVersion !== v0) notifyAsks(session);
}

// ── A HELPER'S PERMISSION ASK (lane S1, B-6e95) ────────────────────────────
// The CLI asks for a helper on the PARENT's stdout (no parent_tool_use_id, an
// `agent_id` naming the helper — measured on 2.1.281, src/helper-ask.js). The
// parent's normalizer hangs it on the helper's Agent card; the helper's OWN
// view (the sub-normalizer its View Log window reads) must see the same
// control records, or its tool card sits on "running" with no Allow button.
// Every control record passes through here (the live gate, the drain after a
// rebuild) — so the answer from EITHER window settles BOTH cards.
const isControlRecord = (msg) => !!msg && (msg.type === 'control_request' || msg.type === 'control_response' || msg.type === 'control_cancel_request');
function helperCallFor(session, msg) {
  const mm = session._normalizer;
  if (msg.type === 'control_request') {
    // a record that NAMES its Agent call (a future CLI's parent_tool_use_id — verify r2, M2) is routed by it
    if (typeof msg.parent_tool_use_id === 'string' && msg.parent_tool_use_id) return msg.parent_tool_use_id;
    const agentId = msg.request && msg.request.agent_id;
    if (!agentId) return null;
    return (mm && typeof mm.helperCallOf === 'function' ? mm.helperCallOf(agentId) : null) || helperParentFromTaskRecords(agentId, session._taskRecords);
  }
  const rid = msg.type === 'control_response' ? (msg.response && msg.response.request_id) : msg.request_id;
  const hit = mm && typeof mm.helperAskById === 'function' ? mm.helperAskById(rid) : null;
  return (hit && hit.card && hit.card.toolCallId) || null;
}
function routeToHelperView(session, msg) {
  if (!isControlRecord(msg) || !session || !session._subNormalizers || !session._subNormalizers.size) return false;
  const ptuid = helperCallFor(session, msg);
  const sub = ptuid ? session._subNormalizers.get(ptuid) : null;
  if (!sub) return false;
  try { sub.processLive(msg); return true; } catch (e) { console.warn('[normalizer] helper view skipped a control record:', e.message); return false; }
}
/** A helper's view CREATED after its ask (a restart re-arms the file watcher, a
 *  viewer opens late) is handed the helper's unanswered asks from the parent's
 *  cards. Returns how many. */
function seedHelperView(session, parentToolUseId, sub) {
  const mm = session && session._normalizer;
  if (!mm || typeof mm.helperAskRecordsFor !== 'function' || !sub) return 0;
  let n = 0;
  for (const rec of mm.helperAskRecordsFor(parentToolUseId)) { try { sub.processLive(rec); n++; } catch (e) { console.warn('[normalizer] helper view seed skipped:', e.message); } }
  return n;
}
/** THE HELPER'S OWN RESULT (verify r3 — the table's result-allow / result-deny
 *  rows): a sidechain `user` record carrying tool_result blocks never reaches the
 *  parent normalizer (the stdout consumer routes it to the helper's view alone,
 *  the rebuild's record list skips it), yet it is the ONE witness that the CLI
 *  settled an asked request without a record of ours (a deadline or a decision
 *  of the CLI's own — the brief's "expired") — or that the buffer lost ours. Held
 *  behind the rebuild gate like every live record. Returns how many asks moved. */
function noteHelperResults(session, msg) {
  const mm = session && session._normalizer;
  if (!mm || typeof mm.noteHelperResult !== 'function' || !msg || msg.type !== 'user') return 0;
  const c = msg.message && msg.message.content;
  if (!Array.isArray(c)) return 0;
  if (session._rebuildQueue) { session._rebuildQueue.push({ kind: 'helper-result', msg }); return 0; }
  return applyHelperResults(session, mm, msg);
}
const resultText = (b) => (typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map((x) => (x && typeof x.text === 'string' ? x.text : '')).join('') : '');
/** verify r5: the call a helper's tool_result answers, as its own view knows it — {parentToolUseId, url} for a
 *  WebFetch call (the provenance re-ask's binding, message-manager.noteHelperResult), else null. */
function helperResultBind(session, parentToolUseId, toolUseId) {
  const sub = parentToolUseId && session && session._subNormalizers ? session._subNormalizers.get(parentToolUseId) : null;
  if (!sub) return null;
  const tid = String(toolUseId);
  const p = sub.pendingToolCalls && sub.pendingToolCalls.get(tid);
  const block = p && p.block;
  const m = block ? null : (Array.isArray(sub.messages) ? sub.messages.find((x) => x && x.toolCallId === tid) : null);
  const input = block ? block.input : (m && Array.isArray(m.content) && m.content[0] ? m.content[0].input : null);
  const name = block ? block.name : (m ? m.toolName : null);
  return name === 'WebFetch' && input && typeof input.url === 'string' ? { parentToolUseId, url: input.url } : null;
}
function applyHelperResults(session, mm, msg) {
  const c = msg.message && msg.message.content;
  if (!Array.isArray(c)) return 0;
  const v0 = mm.pendingAsksVersion;
  let n = 0;
  for (const b of c) {
    if (!b || b.type !== 'tool_result' || !b.tool_use_id) continue;
    try { if (mm.noteHelperResult(b.tool_use_id, resultText(b), !!b.is_error, true, helperResultBind(session, msg.parent_tool_use_id, b.tool_use_id))) n++; } catch (e) { console.warn('[normalizer] helper result skipped:', e.message); }
  }
  if (n && mm.pendingAsksVersion !== v0) notifyAsks(session);
  return n;
}
function seedHelperViews(session) {
  if (!session || !session._subNormalizers) return;
  for (const [ptuid, sub] of session._subNormalizers) seedHelperView(session, ptuid, sub);
}
/** The server's pending-asks observer (src/server/helper-asks.js — the For-you
 *  inbox): told whenever a normalizer's pending set changed. ONE slot. */
let asksObserver = null;
function setAsksObserver(fn) { asksObserver = typeof fn === 'function' ? fn : null; }
function notifyAsks(session) {
  if (!asksObserver || !session) return;
  try { asksObserver(session); } catch (e) { console.warn('[normalizer] pending-asks observer failed:', e.message); }
}

/** Peer cards (Background Work notify, vibespace-msg, auto-resume notices)
 *  are the OTHER writer into a session normalizer — same gate (review-caught:
 *  a card injected mid-rebuild landed in the middle of old history). */
function feedPeerCard(session, card) {
  if (!session?._normalizer?.injectPeerCard) return false;
  if (session._rebuildQueue) { session._rebuildQueue.push({ kind: 'peer', card }); return true; }
  // verify r5 (S2): a server-injected card (no msgId — a takeover / auto-resume / jobs notice, a stash drain; never in the
  // transcript) fed BEFORE the first attach lived only in the normalizer the attach rebuild discards — held here, bounded,
  // and replayed after the rebuild (a harness-delivered message carries a msgId and its JSONL record; the transcript renders it)
  if (!session._historyLoaded && card && !card.msgId) {
    const held = session._heldPeerCards || (session._heldPeerCards = []);
    held.push(card);
    if (held.length > HELD_PEER_CARDS_CAP) {
      // verify r6: the bound drops the OLDEST and says so (once at the first drop, then every 32nd — a storm never floods the journal)
      const n = held.length - HELD_PEER_CARDS_CAP; held.splice(0, n);
      held.dropped = (held.dropped || 0) + n;
      if (held.dropped === n || held.dropped % HELD_PEER_CARDS_CAP === 0) console.log(`[normalizer] held peer cards for ${session.name || session.claudeSessionId || session.backendSessionId || '?'}: the bound (${HELD_PEER_CARDS_CAP}) dropped the oldest ${n} (${held.dropped} dropped so far before the first attach)`);
    }
  }
  session._normalizer.injectPeerCard(card);
  return true;
}
const HELD_PEER_CARDS_CAP = 32;
/** verify r6 (S2, MEDIUM — the replay vs the transcript's own record): a card the delivery ladder emitted after a
 *  SUCCESSFUL post carries `recorded` = the exact text the CLI's transcript now holds (a JSONL user record with
 *  origin.kind 'peer' — the CLI wraps it: "Another Claude session sent a message:\n…"); message-manager.injectPeerCard's
 *  contract is that such a card is in-memory only and A REBUILD RENDERS THE RECORD INSTEAD. So a held (or queued) card
 *  is replayed only when no not-yet-consumed peer-message the rebuild rendered CONTAINS its recorded text — each
 *  rendered record answers for ONE card (a same-body repeat, delivered twice and recorded twice, keeps its two cards:
 *  the 2.362.2 lesson). A display-only card (no `recorded`: the takeover card, an auto-resume notice, a stash drain)
 *  is always replayed — the transcript never carries it. */
const peerTextOf = (m) => { const c = m && m.content; return Array.isArray(c) ? c.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n') : String(c || ''); };
function replayContext(mm) {
  const pool = mm && Array.isArray(mm.messages) ? mm.messages.filter((m) => m && m.originKind === 'peer-message') : [];
  return { pool, used: new Set(), skipped: 0 };
}
function replayCard(mm, card, ctx) {
  const rec = card && typeof card.recorded === 'string' ? card.recorded.trim() : '';
  if (rec && ctx) {
    const i = ctx.pool.findIndex((m, idx) => !ctx.used.has(idx) && peerTextOf(m).includes(rec));
    if (i >= 0) { ctx.used.add(i); ctx.skipped++; return false; }
  }
  mm.injectPeerCard(card);
  return true;
}

/**
 * lane J r2 (the browser takeover's STALE sweep): the pending permission cards
 * of a live session, newest first — `{requestId, toolName, input, kind}` of
 * every unanswered card in the last `scan` messages (a CLI only asks inside its
 * current turn, so the pending ones are recent). Harness-neutral: every
 * normalizer keeps `messages` with the same `permission` shape.
 */
/** The HELPERS' pending asks of a session in the same shape as `pendingPermissions` (the takeover's
 *  stale sweep — lane S1 verify r4, L3): `{requestId, toolName, input, kind:null, resolved:null,
 *  helperCall}` where `helperCall` = the parent's Agent call the helper runs under (its card's
 *  toolCallId — the key `session._browserHelpers` binds a child browser handle to). */
function pendingHelperApprovals(session) {
  const mm = session && session._normalizer;
  if (!mm || typeof mm.pendingAsks !== 'function' || typeof mm.helperAskById !== 'function') return [];
  const out = [];
  try {
    for (const a of mm.pendingAsks()) {
      if (a.kind !== 'helper') continue;
      const hit = mm.helperAskById(a.requestId);
      if (hit) out.push({ requestId: a.requestId, toolName: a.toolName || null, input: hit.ask.input || {}, kind: null, resolved: null, helperCall: a.parentToolUseId || null });
    }
  } catch { }
  return out;
}
function pendingPermissions(session, { scan = 600 } = {}) {
  const list = session && session._normalizer && Array.isArray(session._normalizer.messages) ? session._normalizer.messages : [];
  const out = [];
  for (let i = list.length - 1, n = 0; i >= 0 && n < scan; i--, n++) {
    const p = list[i] && list[i].permission;
    if (p && p.requestId !== undefined && p.requestId !== null && !p.resolved) out.push({ requestId: p.requestId, toolName: p.toolName || null, input: p.input || {}, kind: p.kind || null, resolved: p.resolved || null });
  }
  return out;
}
function applyPermissionStale(mm, requestId, staleBy) {
  const list = mm && Array.isArray(mm.messages) ? mm.messages : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!m || !m.permission || m.permission.requestId !== requestId) continue;
    if (m.permission.staleBy && m.permission.staleBy.moment === staleBy.moment) return true; // the harness's own record already said it (claude's deny text)
    m.permission.staleBy = { ...staleBy };
    if (typeof mm._emit === 'function') mm._emit({ op: 'edit', id: m.id, fields: { permission: m.permission } });
    return true;
  }
  return false;
}
/** Mark one card stale (`staleBy` = {code:'browser_paused', moment, at}) — the
 *  same gate as every other writer: a rebuild in progress queues it. For a
 *  harness whose deny carries no message (codex, ACP) this is what makes the
 *  card say why; for claude the deny text already did (and survives a rebuild). */
function notePermissionStale(session, requestId, staleBy) {
  if (!session?._normalizer || requestId === undefined || requestId === null || !staleBy) return false;
  if (session._rebuildQueue) { session._rebuildQueue.push({ kind: 'perm-stale', requestId, staleBy }); return true; }
  return applyPermissionStale(session._normalizer, requestId, staleBy);
}

function drainQueue(session, mm, ctx = null) {
  // Records that arrive DURING the drain queue behind (the queue stays armed
  // until it is empty) — no interleaving window.
  while (session._rebuildQueue?.length) {
    const e = session._rebuildQueue.shift();
    try {
      if (e.kind === 'peer') { if (mm.injectPeerCard) replayCard(mm, e.card, ctx); }
      else if (e.kind === 'perm-stale') applyPermissionStale(mm, e.requestId, e.staleBy);
      else if (e.kind === 'helper-result') applyHelperResults(session, mm, e.msg);
      else { mm.processLive(e.msg); if (session._normalizer === mm) routeToHelperView(session, e.msg); }
    } catch (err) { console.error('[normalizer] queued record skipped after rebuild:', err.message); }
  }
}

// FIFO: rebuilds run ONE AT A TIME. Fair round-robin slicing of N concurrent
// rebuilds makes every session's 'attached' land near the total time (19
// windows × 10-56MB = minutes for ALL of them, past the client's re-attach
// ladder); serialized, the first windows open in seconds while the loop
// stays responsive throughout (acks, kills, other sessions' traffic).
let rebuildChain = Promise.resolve();

/**
 * Single-flight, time-sliced first-attach rebuild. Swaps in a fresh
 * normalizer (carrying every op subscriber), converts `records` in slices
 * that yield to the event loop, then replays the records that arrived
 * meanwhile. Concurrent attaches await the same promise instead of
 * rebuilding twice. `_historyLoaded` is set AFTER success (2.89.2 rule).
 */
/** The persisted task records (session-meta `taskRecords`) in the order the live
 *  stream produced them: started → progress → notification, per task, each as
 *  `{ record, at }` — `at` = the stdout consumer's `cur.at`, the instant the
 *  server saw the task's NEWEST record live (lane Q verify, 2026-09-26: the
 *  replay stamps `taskInfo.aliveAt` with it, never with the rebuild's clock, so a
 *  run that stalled days ago is not proven alive again by every restart). */
function taskReplayRecords(taskRecords) {
  const out = [];
  for (const cur of Object.values(taskRecords || {})) {
    if (!cur || typeof cur !== 'object') continue;
    const at = Number.isFinite(cur.at) ? cur.at : 0;
    for (const record of [cur.started, cur.progress, cur.notification]) if (record) out.push({ record, at });
  }
  return out;
}
function rebuildHistory(session, sessionId, records, { budgetMs, onProgress, replay = null, helperResults = null } = {}) {
  if (session._rebuildPromise) return session._rebuildPromise;
  const opHandlers = [...(session._normalizer?.listeners || [])];
  const mm = createMessageManager(session.backend || 'claude', sessionId, { threadId: session.backendSessionId || session.claudeSessionId || null }); // the rendered conversation's id = the codex ledger-key DEFAULT (file-tagged records key by their own file; wrapper_meta re-points it; null before a fresh thread is adopted)
  for (const h of opHandlers) mm.onOp(h);
  if (typeof mm.setHelperAskedAt === 'function') mm.setHelperAskedAt(session._helperAskedAt || null); // verify r3: a rebuilt ask keeps its real arrival (the 60 s inbox clock survives the restart)
  session._normalizer = mm;
  session._normEpoch = Date.now();
  // …and the op ring dies with the epoch (perf lane chunk D): its frames carry
  // the OLD normalizer's ids; a client resuming by seq names the old epoch and
  // takes the full attach. seq itself stays monotonic (a reset never reuses one).
  if (session._opRing) session._opRing.reset();
  session._rebuildQueue = [];
  session._rebuildProgress = { done: 0, total: records?.length || 0 };
  const run = async () => {
    try {
      await mm.convertHistoryAsync(records, { ...(budgetMs ? { budgetMs } : {}), onSlice: (done) => { session._rebuildProgress = { done, total: records?.length || 0 }; try { onProgress?.(session._rebuildProgress); } catch { } } });
      // the persisted task records (2.369.140) — silent, after the history, before the live queue
      for (const { record, at } of taskReplayRecords(replay || session._taskRecords)) { try { mm.replay(record, { at }); } catch (err) { console.error('[normalizer] task record replay skipped:', err.message); } }
      // verify r3: the helpers' tool_results (session-store helperResults — the record list skips every sidechain
      // record) settle an asked ask by the table's result rows; after the task replay so a record wins over a derived end
      for (const r of (Array.isArray(helperResults) ? helperResults : [])) { try { if (typeof mm.noteHelperResult === 'function') mm.noteHelperResult(r.toolUseId, r.text, r.isError, false, helperResultBind(session, r.parentToolUseId, r.toolUseId)); } catch (err) { console.error('[normalizer] helper result replay skipped:', err.message); } }
      // verify r5 (S2): the cards fed before this first attach (feedPeerCard held them) — after the history, before the live queue;
      // verify r6: a card whose delivery the transcript RECORDED is answered by the rendered record (replayCard), never twice
      const ctx = replayContext(mm);
      for (const card of session._heldPeerCards || []) { try { replayCard(mm, card, ctx); } catch (err) { console.error('[normalizer] held card replay skipped:', err.message); } }
      session._heldPeerCards = null;
      drainQueue(session, mm, ctx);
      if (ctx.skipped) console.log(`[normalizer] ${sessionId}: ${ctx.skipped} delivered card(s) rendered from the transcript's own record, not replayed`);
      session._historyLoaded = true;
      // lane S1: the rebuilt cards carry the helpers' unanswered asks — every
      // helper view that already exists is handed them, and the inbox re-syncs
      // verify r4: the rebuilt pending set is what the attach payload hands the clients — sealed, so
      // the first live edit after the restart emits a pending-asks op only for a CHANGE
      if (typeof mm.sealPendingAsks === 'function') { try { mm.sealPendingAsks(); } catch { } }
      if (session._normalizer === mm) { seedHelperViews(session); notifyAsks(session); }
    } finally {
      // Even a FAILED rebuild must not lose the records held meanwhile
      // (review-caught): drain into whatever normalizer we have.
      try { drainQueue(session, mm); } catch { }
      session._rebuildQueue = null;
      session._rebuildPromise = null;
      session._rebuildProgress = null;
    }
  };
  const turn = rebuildChain.then(run, run);
  rebuildChain = turn.catch(() => {});
  session._rebuildPromise = turn;
  return turn;
}

module.exports = { createMessageManager, NORMALIZERS, feedLive, feedPeerCard, rebuildHistory, taskReplayRecords, pendingPermissions, pendingHelperApprovals, notePermissionStale, routeToHelperView, seedHelperView, setAsksObserver, noteHelperResults, HELD_PEER_CARDS_CAP };
