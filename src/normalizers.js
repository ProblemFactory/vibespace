const harnessReg = require('./harnesses');
const { HARNESSES } = harnessReg;
const { MessageManager, PEER_RECORDED } = require('./message-manager');
const { helperParentOf: helperParentFromTaskRecords } = require('./helper-ask.js'); // PURE (lane S1)
const { cardBlock: browserCardBlock } = require('./browser-sessions.js'); // PURE (2026-09-27): the browser-session card's block
const AF = require('./artifacts.js'); // PURE (lane artifacts-model): the deliverable rows — the card's block, the reducer the rebuild re-derives with
const GC = require('./group-card.js'); // PURE (lane group-report-card): a group message's card — its key, its ring, its place in a rebuild

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
// a register()ed chat harness brings its own Normalizer on the descriptor (lane dc-ws-create)
const registeredNormalizer = (backend) => (harnessReg.has(backend) ? harnessReg.get(backend).Normalizer : null);
function createMessageManager(backend, sessionId, opts) {
  const Ctor = NORMALIZERS[backend || 'claude'] || registeredNormalizer(backend);
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
 *  a card injected mid-rebuild landed in the middle of old history).
 *  A card that carries a GROUP message (`card.group`, lane group-report-card) passes the group door first. */
function feedPeerCard(session, card) {
  if (GC.isGroupCard(card)) return feedGroupCard(session, card);
  return feedPeerCardNow(session, card);
}
function feedPeerCardNow(session, card) {
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

// ── THE GROUP-CARD DOOR (lane group-report-card; the owner, 2026-09-28: "怎么在那个对话里看不到你发了消息？") ──────
// Every card that carries a group message passes here — a next-turn report's (groups-engine commitReports, emitted
// at the injection through the ladder's `emitPeerCard`) and a wake's (the ladder's own cardOk after a successful
// post, `group` in its opts). ONE rule each:
//   THE KEY    (group id, record instant) — a message carded once in this conversation is never carded again: a
//              re-report after a restart whose marker write was lost, a wake over a range a report already showed.
//   THE RING   `session._groupCards` (src/group-card.js), persisted in the session meta through the hook the wiring
//              sets (`setGroupCardPersist` — channels-wiring owns the meta store): a report card — the first attach's
//              rebuild places it BY TIME between the transcript's records (`convertWithCards`, the browser cards'
//              seam), under the message whose turn carried it; a wake's card keeps `recordedHead` — the CLI RECORDED
//              that post, so the rebuild draws the transcript's own record AS the group card (`upgradeWakeCards`:
//              in place, its id and position kept), never a second card beside it.
//   THE PLACE  live: a report card is written at once with a STABLE id (`GC.cardId` — the live op and every rebuild
//              name the same card); during a rebuild it rides the queue; before the first attach nothing is written
//              (that attach's rebuild places it from the ring). A wake's card takes the ordinary peer path (held /
//              queued / injected), `group` riding into `peerGroup`.
let groupCardPersist = null;
function setGroupCardPersist(fn) { groupCardPersist = typeof fn === 'function' ? fn : null; }
function feedGroupCard(session, card) {
  if (!session) return false;
  const c = GC.normalizeCard(card, { now: Date.now() });
  if (!c) return false;
  const key = GC.cardKey(c.group);
  const ring = Array.isArray(session._groupCards) ? session._groupCards : (session._groupCards = []);
  if (GC.ringHas(ring, key)) return false;   // carded before in this conversation — never twice
  const ladder = typeof c.recorded === 'string';
  const stored = { fromName: c.fromName, text: c.text, group: c.group, shownAt: c.shownAt, ...(ladder ? { recordedHead: GC.recordedHeadOf(c.recorded) } : {}) };
  GC.ringAdd(ring, { k: key, at: c.shownAt, card: stored });
  if (groupCardPersist) { try { groupCardPersist(session); } catch (e) { console.warn('[normalizer] group card ring not persisted:', e && e.message); } }
  if (ladder) return feedPeerCardNow(session, { ...card, fromName: c.fromName, group: c.group });
  const mm = session._normalizer;
  if (!mm) return true;
  if (session._rebuildQueue) { session._rebuildQueue.push({ kind: 'gcard', card: stored }); return true; }
  if (!session._historyLoaded) return true;   // the first attach's rebuild places it from the ring
  return !!placeGroupCard(mm, stored, { emit: true });
}
/** THE ONE writer of a report card into a normalizer (any harness: every normalizer keeps `messages`, `messageIndex`,
 *  `turnIndex`, `_emit` — the browser card's shape). The same user-role peer card `injectPeerCard` makes, with the
 *  card's stable id and `peerGroup`; idempotent by that id. `emit` = a live op; a history conversion emits nothing. */
function placeGroupCard(mm, card, { emit = false } = {}) {
  if (!mm || !Array.isArray(mm.messages) || !mm.messageIndex) return null;
  const c = GC.normalizeCard(card);
  if (!c) return null;
  const id = GC.cardId(mm.sessionId, c.group);
  if (!id || mm.messageIndex.has(id)) return null;
  mm.turnIndex = (Number(mm.turnIndex) || 0) + 1;   // a peer card is its own turn marker (injectPeerCard's rule)
  const msg = { id, role: 'user', status: 'complete', content: [{ type: 'text', text: c.text }], ts: c.shownAt || Date.now(), srcLine: null, uuid: null, turnIndex: mm.turnIndex,
    toolCallId: null, toolName: null, toolStatus: null, permission: null, usage: null, taskInfo: null, meta: null, noticeKind: null,
    originKind: 'peer-message', peerFrom: c.fromName || null, peerVia: 'peer', peerGroup: c.group, ...(c.cleared ? { peerCleared: true } : {}) };   // a PEER's words — never a VibeSpace notice; a CLEARED one is worded by the renderer
  mm.messages.push(msg);
  mm.messageIndex.set(id, msg);
  if (emit && typeof mm._emit === 'function') mm._emit({ op: 'create', message: msg });
  return msg;
}

/** "CLEAR CONTENT…" REACHES A GROUP CARD (the .197 integration): the groups door's clear hands the keys of the records
 *  it cleared; the session's ring loses their words (PURE GC.redactRing), the ring is persisted through the same hook,
 *  and a report card already drawn is re-worded IN PLACE (an `edit` op: the renderer draws `peerCleared` in the
 *  device's words). Returns how many entries changed. */
function redactGroupCards(session, keys, text) {
  if (!session || !Array.isArray(session._groupCards)) return 0;
  const changed = GC.redactRing(session._groupCards, keys, text);
  if (!changed.length) return 0;
  if (groupCardPersist) { try { groupCardPersist(session); } catch (e) { console.warn('[normalizer] group card ring not persisted:', e && e.message); } }
  const mm = session._normalizer;
  if (mm && mm.messageIndex) {
    for (const e of changed) {
      const c = GC.normalizeCard(e.card);
      const id = c ? GC.cardId(mm.sessionId, c.group) : null;
      const msg = id ? mm.messageIndex.get(id) : null;
      if (!msg) continue;   // a wake's card is the transcript's own record (declared) — or not drawn yet (the ring places it)
      msg.content = [{ type: 'text', text: c.text }]; msg.peerCleared = true;
      if (typeof mm._emit === 'function') mm._emit({ op: 'edit', id, fields: { content: msg.content, peerCleared: true, status: 'complete' } });
    }
  }
  return changed.length;
}

// ── BROWSER SESSION CARDS (2026-09-27, the owner: "在聊天界面…看到 session 的开始和结束") ──
// A VibeSpace card per session start and end, DERIVED FROM THE TRACE MARKERS (src/server/browser-trace.js — the one
// record): live, the recorder's `onSession` hook feeds the card into the running conversation's normalizer
// (`feedBrowserCard`, gated like every live writer); a REBUILD (first attach after a restart) and a view-only history
// ask the markers again (`setBrowserCardSource`, the wiring's reader) and place each card BY TIME between the records
// (`convertWithCards` → the normalizer's `beforeRecord` hook). Never agent text, never a turn: a system message
// (`noticeKind: 'browser-session'`) whose id is the session's own (`{view id}:bs:{session id}:start|end`) — the live op and
// every rebuild name the SAME card, so a card fed while the rebuild ran is never drawn twice.
let browserCardSource = null;
function setBrowserCardSource(fn) { browserCardSource = typeof fn === 'function' ? fn : null; }
// lane browser-propose step 3: the conversation's PROPOSAL cards (the keeper's claim records carrying a proposal, as
// SW.proposalCardBlock blocks) — the SAME seam: a rebuild and a view-only history place them by time with the session cards
let proposalCardSource = null;
function setProposalCardSource(fn) { proposalCardSource = typeof fn === 'function' ? fn : null; }
/** The cards of a conversation (`{session}` live, `{conversationId}` for a view-only history) — never throws. */
function browserCardsFor(q) {
  const out = [];
  if (browserCardSource) { try { const r = browserCardSource(q || {}); if (Array.isArray(r)) out.push(...r); } catch (e) { console.warn('[normalizer] browser session cards not read:', e && e.message); } }
  if (proposalCardSource) { try { const r = proposalCardSource(q || {}); if (Array.isArray(r)) out.push(...r.filter(isProposalBlock)); } catch (e) { console.warn('[normalizer] browser proposal cards not read:', e && e.message); } }
  return out;
}
// ── BROWSER PROPOSAL CARDS (lane browser-propose step 3, the owner 2026-09-30: the agent proposes, the user approves
// with one click) — ONE VibeSpace card per proposal at the claim's position, keyed by the claim id
// (`{view id}:bp:{claim id}`: the live op and every rebuild name the SAME card), PATCHED IN PLACE on every change (an
// `edit` op carrying the new block — never a status, so the client patches the element it has instead of swapping it;
// feedback: a card re-created per update blinks). The block is SW.proposalCardBlock's (structure, never markup).
const isProposalBlock = (c) => !!(c && c.type === 'browser_proposal' && /^(?:bl|sr)-[0-9a-f]{8}$/.test(String(c.id || ''))); // lane site-reset: + `sr-…` (a site-reset proposal, the same card)
function placeProposalCard(mm, block, { emit = false } = {}) {
  if (!mm || !Array.isArray(mm.messages) || !mm.messageIndex || !isProposalBlock(block)) return null;
  const id = `${mm.sessionId || 'view'}:bp:${block.id}`;
  if (mm.messageIndex.has(id)) return null;
  const msg = { id, role: 'system', status: 'complete', content: [{ ...block }], ts: Number(block.at) || Date.now(), srcLine: null, uuid: null, turnIndex: mm.turnIndex || 0,
    toolCallId: null, toolName: null, toolStatus: null, permission: null, usage: null, taskInfo: null, meta: null, noticeKind: 'browser-proposal' };
  mm.messages.push(msg);
  mm.messageIndex.set(id, msg);
  if (emit && typeof mm._emit === 'function') mm._emit({ op: 'create', message: msg });
  return msg;
}
/** The card already drawn gets the new block IN PLACE (an `edit` op with `content` only); false = not drawn (or unchanged). */
function patchProposalCard(mm, block) {
  if (!mm || !mm.messageIndex || !isProposalBlock(block)) return false;
  const msg = mm.messageIndex.get(`${mm.sessionId || 'view'}:bp:${block.id}`);
  if (!msg) return false;
  if (JSON.stringify(msg.content && msg.content[0]) === JSON.stringify(block)) return false;
  msg.content = [{ ...block }];
  if (typeof mm._emit === 'function') mm._emit({ op: 'edit', id: msg.id, fields: { content: msg.content } });
  return true;
}
/** The live card (the runner's every change): through the same gate as every live writer — held in the rebuild's queue
 *  while one runs; before the first attach nothing is written (that attach's rebuild places it from the source). */
function feedProposalCard(session, block) {
  const mm = session && session._normalizer;
  if (!mm || !isProposalBlock(block)) return false;
  if (session._rebuildQueue) { session._rebuildQueue.push({ kind: 'pcard', card: block }); return true; }
  if (!session._historyLoaded) return false;
  return patchProposalCard(mm, block) || !!placeProposalCard(mm, block, { emit: true });
}
// ── DELIVERABLE CARDS (lane artifacts-model) — ONE card per deliverable row (src/artifacts.js cardBlock), born at the
// first write's position, keyed by the row key (`{view id}:af:{hash of the key}`: the live op and every rebuild name the
// SAME card), PATCHED IN PLACE on every later write / edit (an `edit` op with `content` only — the live-card rule).
const isArtifactBlock = (c) => !!(c && c.type === 'artifact' && typeof c.key === 'string' && c.key);
function artifactKeyHash(s) { let h = 5381; for (const ch of String(s)) h = (Math.imul(h, 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36) + '-' + String(s).length.toString(36); }
const artifactCardId = (mm, key) => `${mm.sessionId || 'view'}:af:${artifactKeyHash(key)}`;
function placeArtifactCard(mm, block, { emit = false } = {}) {
  if (!mm || !Array.isArray(mm.messages) || !mm.messageIndex || !isArtifactBlock(block)) return null;
  const id = artifactCardId(mm, block.key);
  if (mm.messageIndex.has(id)) return null;
  const msg = { id, role: 'system', status: 'complete', content: [{ ...block }], ts: Number(block.firstAt) || Date.now(), srcLine: null, uuid: null, turnIndex: mm.turnIndex || 0,
    toolCallId: null, toolName: null, toolStatus: null, permission: null, usage: null, taskInfo: null, meta: null, noticeKind: 'artifact' };
  mm.messages.push(msg);
  mm.messageIndex.set(id, msg);
  if (emit && typeof mm._emit === 'function') mm._emit({ op: 'create', message: msg });
  return msg;
}
/** The card already drawn gets the row's new block IN PLACE; false = not drawn (or unchanged). `emit` false = a history pass. */
function patchArtifactCard(mm, block, { emit = true } = {}) {
  if (!mm || !mm.messageIndex || !isArtifactBlock(block)) return false;
  const msg = mm.messageIndex.get(artifactCardId(mm, block.key));
  if (!msg) return false;
  const { autoOpen, ...next } = block; // the open is a birth's — a patch never re-opens
  if (JSON.stringify(msg.content && msg.content[0]) === JSON.stringify(next)) return false;
  msg.content = [next];
  if (emit && typeof mm._emit === 'function') mm._emit({ op: 'edit', id: msg.id, fields: { content: msg.content } });
  return true;
}
/** The live card (src/server/artifact-registry.js): held in the rebuild's queue while one runs, else placed / patched
 *  in the live normalizer like every live record (feedLive has no history gate). NO `_historyLoaded` gate (lane
 *  artifacts-e2e): a chat created in the UI is never attached by its creator (2.368.4), so the flag stays false until
 *  another attach — the real-Opus e2e lost the first deliverable's card, the chip and the auto-open on exactly that
 *  path; a later first attach rebuilds and derives the same card id from the transcript. */
function feedArtifactCard(session, block) {
  const mm = session && session._normalizer;
  if (!mm || !isArtifactBlock(block)) return false;
  if (session._rebuildQueue) { session._rebuildQueue.push({ kind: 'acard', card: block }); return true; }
  return patchArtifactCard(mm, block) || !!placeArtifactCard(mm, block, { emit: true });
}
/** The rebuild's / history read's derivation: the harness hook over every record, folded AFTER the record (the hook
 *  has no afterRecord — the PREVIOUS record folds before the next one), its cards placed/patched silently. */
function artifactDeriver(mm, { artifactsOf, cwd = '', host = '' }) {
  let rows = {};
  let prev = null;
  const fold = (raw) => {
    let ops = [];
    try { ops = artifactsOf(raw) || []; } catch { ops = []; }
    for (const o of ops) {
      const r = AF.apply(rows, { ...o, host, cwd, at: recordAt(raw), by: 'agent' });
      if (r.skipped || !r.row) continue;
      rows = r.rows;
      if (AF.cardWorthy(r.row)) { const b = AF.cardBlock(r.row); if (!patchArtifactCard(mm, b, { emit: false })) placeArtifactCard(mm, b); }
    }
  };
  return { before: (raw) => { if (prev) fold(prev); prev = raw; }, end: () => { if (prev) fold(prev); prev = null; return rows; } };
}
// lane artifacts-registries: the pages / designs rows a rebuild reads from THEIR stores (src/server/artifact-registry.js
// storeRowsOf, set by its configure) — the third merge input beside the transcript's derivation and the persisted rows
let artifactStoreSource = null;
function setArtifactStoreSource(fn) { artifactStoreSource = typeof fn === 'function' ? fn : null; }
function artifactStoreRows(session, sessionId) {
  if (!artifactStoreSource) return {};
  try { return artifactStoreSource(session, sessionId) || {}; } catch (e) { console.warn('[normalizer] registry rows not read:', e && e.message); return {}; }
}
/** After the derivation merged with the persisted rows: every deliverable's card says the merged counts (a user's save
 *  lives only in the persisted rows) — patched, or placed at the end when the transcript no longer holds its write. */
function settleArtifactCards(mm, rows) {
  for (const row of Object.values(rows || {})) {
    if (!AF.cardWorthy(row)) continue;
    const b = AF.cardBlock(row);
    if (!patchArtifactCard(mm, b, { emit: false })) placeArtifactCard(mm, b);
  }
}
/** THE ONE writer of a browser-session card into a normalizer (any harness: every normalizer keeps `messages`,
 *  `messageIndex`, `turnIndex`, `_emit`). Idempotent by id. `emit` = a live op; a history conversion emits nothing. */
function placeBrowserCard(mm, card, { emit = false } = {}) {
  if (!mm || !Array.isArray(mm.messages) || !mm.messageIndex) return null;
  const block = browserCardBlock(card);
  if (!block) return null;
  const id = `${mm.sessionId || 'view'}:bs:${block.session}:${block.phase}`;
  if (mm.messageIndex.has(id)) return null;
  const msg = { id, role: 'system', status: 'complete', content: [block], ts: block.at || Date.now(), srcLine: null, uuid: null, turnIndex: mm.turnIndex || 0,
    toolCallId: null, toolName: null, toolStatus: null, permission: null, usage: null, taskInfo: null, meta: null, noticeKind: 'browser-session' };
  mm.messages.push(msg);
  mm.messageIndex.set(id, msg);
  if (emit && typeof mm._emit === 'function') mm._emit({ op: 'create', message: msg });
  return msg;
}
/** A record's own instant (the transcripts' ISO `timestamp`; a stdout-ring record has none — it never moves a card). */
function recordAt(raw) { const t = raw && typeof raw.timestamp === 'string' ? Date.parse(raw.timestamp) : NaN; return Number.isFinite(t) ? t : 0; }
/** convertHistoryAsync with the browser cards placed BY TIME: a card goes before the first record stamped after it;
 *  the rest (after every stamped record) at the end. */
// lane group-report-card: the list may also hold GROUP cards (the ring's report cards) — each placed at its own
// instant (`GC.placeAt`: the injection + the slack, so the turn's user record comes first) through its own writer.
const cardPlaceAt = (c) => (GC.isGroupCard(c) ? GC.placeAt(c) : (Number(c && c.at) || 0));
const placeAnyCard = (mm, c) => (GC.isGroupCard(c) ? placeGroupCard(mm, c) : isProposalBlock(c) ? placeProposalCard(mm, c) : placeBrowserCard(mm, c));
// lane artifacts-model: `opts.artifacts` = {artifactsOf, cwd, host} (src/server/artifact-registry.js deriveOpts) derives
// the conversation's deliverable rows from the SAME records and places their cards; the rows land on `mm.derivedArtifacts`.
async function convertWithCards(mm, records, cards, opts = {}) {
  const { artifacts = null, ...rest } = opts || {};
  const derive = artifacts && typeof artifacts.artifactsOf === 'function' ? artifactDeriver(mm, artifacts) : null;
  const due = (cards || []).filter((c) => GC.isGroupCard(c) || isProposalBlock(c) || browserCardBlock(c)).slice().sort((a, b) => cardPlaceAt(a) - cardPlaceAt(b));
  if (!due.length && !derive) return mm.convertHistoryAsync(records, rest);
  let i = 0;
  const beforeRecord = (raw) => { if (derive) derive.before(raw); const at = recordAt(raw); if (!at) return; while (i < due.length && cardPlaceAt(due[i]) <= at) placeAnyCard(mm, due[i++]); };
  await mm.convertHistoryAsync(records, { ...rest, beforeRecord });
  if (derive) mm.derivedArtifacts = derive.end();
  while (i < due.length) placeAnyCard(mm, due[i++]);
  return mm.messages;
}
/** The live card (the recorder's `onSession`): through the same gate as every live writer — held in the rebuild's
 *  queue while one runs; before the first attach nothing is written (that attach's rebuild derives it from the marker). */
function feedBrowserCard(session, card) {
  const mm = session && session._normalizer;
  if (!mm || !browserCardBlock(card)) return false;
  if (session._rebuildQueue) { session._rebuildQueue.push({ kind: 'bcard', card }); return true; }
  if (!session._historyLoaded) return false;
  return !!placeBrowserCard(mm, card, { emit: true });
}
/** verify r6 (S2, MEDIUM — the replay vs the transcript's own record): a card the delivery ladder emitted after a
 *  SUCCESSFUL post carries `recorded` = the exact text the CLI's transcript now holds (a JSONL user record with
 *  origin.kind 'peer' — the CLI wraps it: "Another Claude session sent a message:\n…"); message-manager.injectPeerCard's
 *  contract is that such a card is in-memory only and A REBUILD RENDERS THE RECORD INSTEAD. So a held (or queued) card
 *  is replayed only when no not-yet-consumed peer-message the rebuild rendered CONTAINS its recorded text — each
 *  rendered record answers for ONE card (a same-body repeat, delivered twice and recorded twice, keeps its two cards:
 *  the 2.362.2 lesson). A display-only card (no `recorded`: the takeover card, an auto-resume notice, a stash drain)
 *  is always replayed — the transcript never carries it. */
// lane peer-card-sender (B-9fd6): a record whose card was re-drawn from a framed group report is matched by the words the
// CLI RECORDED (message-manager PEER_RECORDED), never by its card text
const peerTextOf = (m) => { if (m && typeof m[PEER_RECORDED] === 'string') return m[PEER_RECORDED]; const c = m && m.content; return Array.isArray(c) ? c.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n') : String(c || ''); };
/** lane group-report-card: a WAKE's card after a restart. The CLI recorded the ladder's post (a peer user record the
 *  rebuild just rendered as a name-less "Message from another session" card holding the whole agent-facing report);
 *  the ring kept the card's facts and `recordedHead`. The record that holds that text is UPGRADED IN PLACE into the
 *  group card it was live — the sender → the group, the message that woke it — keeping its id and its position; each
 *  record answers ONE card; a card whose record is not in the transcript draws nothing (never a second card). */
function upgradeWakeCards(mm, ring) {
  const wakes = GC.ringWakeCards(ring);
  if (!wakes.length || !mm || !Array.isArray(mm.messages)) return 0;
  // a record already drawn from its OWN framed report (B-9fd6, the fallback) is upgraded too: the ring's card is the one it was live
  const pool = mm.messages.filter((m) => m && m.originKind === 'peer-message' && (!m.peerGroup || typeof m[PEER_RECORDED] === 'string'));
  let n = 0;
  for (const c of wakes) {
    const i = pool.findIndex((m) => m && peerTextOf(m).includes(c.recordedHead));
    if (i < 0) continue;
    const m = pool[i];
    pool[i] = null;
    m.peerGroup = c.group; m.peerFrom = c.fromName || null; m.peerVia = 'peer'; m.content = [{ type: 'text', text: c.text }];
    n++;
  }
  return n;
}
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
      else if (e.kind === 'bcard') placeBrowserCard(mm, e.card, { emit: true }); // a card the rebuild's markers already held is the same id — never twice
      else if (e.kind === 'gcard') placeGroupCard(mm, e.card, { emit: true }); // lane group-report-card: the ring's card is the same id — never twice
      else if (e.kind === 'acard') { if (!patchArtifactCard(mm, e.card)) placeArtifactCard(mm, e.card, { emit: true }); } // lane artifacts-model: the rebuild's card is the same id — patched, never twice
      else if (e.kind === 'pcard') { if (!patchProposalCard(mm, e.card)) placeProposalCard(mm, e.card, { emit: true }); } // lane browser-propose: the rebuild's card is the same id — patched, never twice
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
/** A conversation's derivation options: its DESCRIPTOR's hook (lane artifacts-model; null = the harness never produces). */
function artifactDeriveOpts({ backend, cwd, host } = {}) {
  let of = null;
  try { of = harnessReg.harnessOf(backend || 'claude').artifactsOf; } catch { of = null; }
  return typeof of === 'function' ? { artifactsOf: of, cwd: cwd || '', host: host || '' } : null;
}
const artifactsOptsOf = (session) => artifactDeriveOpts({ backend: session.backend, cwd: session.cwd, host: session.host });
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
      // 2026-09-27: the browser-session cards, read from the trace markers NOW and placed by time between the records
      // lane group-report-card: + the group messages this conversation was handed with a turn (the ring's report cards)
      await convertWithCards(mm, records, [...browserCardsFor({ session }), ...GC.ringCards(session._groupCards)], { artifacts: artifactsOptsOf(session), ...(budgetMs ? { budgetMs } : {}), onSlice: (done) => { session._rebuildProgress = { done, total: records?.length || 0 }; try { onProgress?.(session._rebuildProgress); } catch { } } });
      // lane artifacts-model: the re-derived deliverable rows ∪ the persisted ones (the user's saves) — every card says the merge
      // lane artifacts-registries: ∪ the pages / designs rows from their own stores (a page published twice = one row)
      try { session._artifacts = AF.merge(AF.merge(mm.derivedArtifacts || {}, session._artifacts || {}), artifactStoreRows(session, sessionId)); settleArtifactCards(mm, session._artifacts); } catch (err) { console.error('[normalizer] deliverable rows not merged:', err.message); }
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
      // lane group-report-card: a group WAKE's transcript record is drawn as the group card it was live (after the held
      // cards' replay, which matched the record by its original text)
      try { upgradeWakeCards(mm, session._groupCards); } catch (err) { console.error('[normalizer] group wake cards skipped:', err.message); }
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

module.exports = { createMessageManager, NORMALIZERS, feedLive, feedPeerCard, rebuildHistory, taskReplayRecords, pendingPermissions, pendingHelperApprovals, notePermissionStale, routeToHelperView, seedHelperView, setAsksObserver, noteHelperResults, HELD_PEER_CARDS_CAP,
  setBrowserCardSource, browserCardsFor, placeBrowserCard, convertWithCards, feedBrowserCard,
  setProposalCardSource, placeProposalCard, patchProposalCard, feedProposalCard,
  placeArtifactCard, patchArtifactCard, feedArtifactCard, artifactCardId, artifactDeriveOpts, setArtifactStoreSource, artifactStoreRows, // lane artifacts-model: the deliverable card // lane browser-propose: the proposal card
  setGroupCardPersist, feedGroupCard, placeGroupCard, upgradeWakeCards, redactGroupCards };
