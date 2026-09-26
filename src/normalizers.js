const { HARNESSES } = require('./harnesses');
const { MessageManager } = require('./message-manager');

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
  session._normalizer.processLive(msg);
}

/** Peer cards (Background Work notify, vibespace-msg, auto-resume notices)
 *  are the OTHER writer into a session normalizer — same gate (review-caught:
 *  a card injected mid-rebuild landed in the middle of old history). */
function feedPeerCard(session, card) {
  if (!session?._normalizer?.injectPeerCard) return false;
  if (session._rebuildQueue) { session._rebuildQueue.push({ kind: 'peer', card }); return true; }
  session._normalizer.injectPeerCard(card);
  return true;
}

/**
 * lane J r2 (the browser takeover's STALE sweep): the pending permission cards
 * of a live session, newest first — `{requestId, toolName, input, kind}` of
 * every unanswered card in the last `scan` messages (a CLI only asks inside its
 * current turn, so the pending ones are recent). Harness-neutral: every
 * normalizer keeps `messages` with the same `permission` shape.
 */
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

function drainQueue(session, mm) {
  // Records that arrive DURING the drain queue behind (the queue stays armed
  // until it is empty) — no interleaving window.
  while (session._rebuildQueue?.length) {
    const e = session._rebuildQueue.shift();
    try {
      if (e.kind === 'peer') mm.injectPeerCard?.(e.card);
      else if (e.kind === 'perm-stale') applyPermissionStale(mm, e.requestId, e.staleBy);
      else mm.processLive(e.msg);
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
function rebuildHistory(session, sessionId, records, { budgetMs, onProgress, replay = null } = {}) {
  if (session._rebuildPromise) return session._rebuildPromise;
  const opHandlers = [...(session._normalizer?.listeners || [])];
  const mm = createMessageManager(session.backend || 'claude', sessionId, { threadId: session.backendSessionId || session.claudeSessionId || null }); // the rendered conversation's id = the codex ledger-key DEFAULT (file-tagged records key by their own file; wrapper_meta re-points it; null before a fresh thread is adopted)
  for (const h of opHandlers) mm.onOp(h);
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
      drainQueue(session, mm);
      session._historyLoaded = true;
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

module.exports = { createMessageManager, NORMALIZERS, feedLive, feedPeerCard, rebuildHistory, taskReplayRecords, pendingPermissions, notePermissionStale };
