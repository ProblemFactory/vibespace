'use strict';
// A SUBAGENT'S VIRTUAL SESSION OVER AN ACP JOURNAL (lane agy-subagent-cards, 2026-10-21). A wrapper that can see its
// agent's subagents (data/bin/agy-wrapper.js reads the agy store) journals each sub's own steps as `sub` records
// {subId, toolCallId, rec: <an ACP record>} beside the parent's — this module keeps them OFF the parent's cards and on
// the claude road's two maps, keyed by the sub's conversation id, so ws-handler's `attach sub-<id>` serves them like a
// claude sidechain: session.subagentBuffers (subId → its records) + session._subNormalizers (subId → an
// AcpMessageManager('sub-<subId>'), made when a viewer attaches — the parent's clients get its msg frames from then on).
// Every record also goes out as `subagent-message` {sessionId: parent, parentToolUseId: the card's row, subId, message}
// (the card's live count). A restart / a viewer after the memory is gone: the records are re-read from the parent's own
// journal (seed) — the journal IS the history (the ACP rule).
const { AcpMessageManager, parseAcpBufferRecords } = require('../acp-message-manager');
const { capsOf } = require('../backend-caps');

const SUB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RECORDS = 4000;   // per sub (a sub's 23 measured steps were 32 records)
const MAX_SUBS = 64;        // per session — the oldest leaves memory first (its records stay in the journal)
const acpSession = (sess) => !!sess && capsOf(sess.backend).streamProtocol === 'acp-events';

/** One `sub` journal record of the session `parentId` → its sub's buffer, the card's live count, an open viewer. */
function feed(session, parentId, rec, broadcastToSession) {
  const subId = typeof rec?.subId === 'string' ? rec.subId : '';
  if (!SUB_ID.test(subId) || !rec.rec || typeof rec.rec !== 'object') return false;
  if (!session.subagentBuffers) session.subagentBuffers = new Map();
  let buf = session.subagentBuffers.get(subId);
  if (!buf) {
    buf = [];
    session.subagentBuffers.set(subId, buf);
    while (session.subagentBuffers.size > MAX_SUBS) { const old = session.subagentBuffers.keys().next().value; session.subagentBuffers.delete(old); session._subNormalizers?.delete(old); }
  }
  const inner = { ...rec.rec, ts: rec.ts || null };
  buf.push(inner);
  if (buf.length > MAX_RECORDS) buf.splice(0, buf.length - MAX_RECORDS);
  broadcastToSession(session, parentId, { type: 'subagent-message', sessionId: parentId, parentToolUseId: typeof rec.toolCallId === 'string' ? rec.toolCallId : null, subId, message: inner });
  const mm = session._subNormalizers?.get(subId);
  if (mm) { try { mm.processLive(inner); } catch (e) { console.warn(`[acp-sub] ${subId}: ${e.message}`); } }
  return true;
}
/** A sub's records out of a journal text (every `sub` record naming it, in order). */
function recordsOf(buffer, subId) {
  return parseAcpBufferRecords(String(buffer || '')).filter((r) => r && r.kind === 'sub' && r.subId === subId && r.rec && typeof r.rec === 'object').map((r) => ({ ...r.rec, ts: r.ts || null }));
}
/** Make `attach sub-<subId>` findable: when no live session holds the sub's records, read them back from the ACP
 *  journals — the viewer's parent first. Answers the session that holds them (or null). */
function seed(activeSessions, subId, preferParentId = null) {
  if (!SUB_ID.test(String(subId || ''))) return null;
  for (const [, sess] of activeSessions) if (sess.subagentBuffers?.has(subId)) return sess;
  const order = [];
  if (preferParentId && activeSessions.get(preferParentId)) order.push(activeSessions.get(preferParentId));
  for (const [, sess] of activeSessions) if (!order.includes(sess)) order.push(sess);
  for (const sess of order) {
    if (!acpSession(sess) || !String(sess.buffer || '').includes(subId)) continue;
    const recs = recordsOf(sess.buffer, subId);
    if (!recs.length) continue;
    if (!sess.subagentBuffers) sess.subagentBuffers = new Map();
    sess.subagentBuffers.set(subId, recs);
    return sess;
  }
  return null;
}
/** The viewer's normalizer for a sub of an ACP session (null for any other protocol — the caller's own). */
function normalizerFor(sess, virtualId) {
  return acpSession(sess) ? new AcpMessageManager(virtualId) : null;
}

module.exports = { feed, recordsOf, seed, normalizerFor, acpSession, MAX_RECORDS, MAX_SUBS };
