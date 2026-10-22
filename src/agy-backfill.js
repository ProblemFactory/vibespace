'use strict';
// A SUBAGENT THAT ALREADY RAN (lane agy-subagent-cards, its addendum 2026-10-22 — the owner asked when the trace showed
// it): a sub that ran under a wrapper OLDER than the cards left only its invoke_subagent row in the journal — no
// `subagent` record, no `sub` steps — and a conversation's running wrapper stays that old code until the conversation
// restarts (dtach survives the update's server restart). MEASURED on the fixture: re-attach / the restored history drew
// a plain row, no card, no sub-<id> timeline. The hub now draws them from the account's store anyway: the SAME card and
// sub steps the wrapper's tail journals (agy-store snapshotOf, read through the ONE gate agy-store-fs), placed
//   · on the history it rebuilds (AgySessionMessages — the first attach after a restart, the update's own included):
//     the card right after its row, the sub's steps as its virtual session's buffer (sub-<id>);
//   · at each turn end of a conversation an OLD wrapper still serves (the descriptor's store.afterTurn → acp-events):
//     a row ≥ 60 s old with no card (a new wrapper's look ends by then — never two writers of one card).
// Never written to the wrapper's journal (the wrapper owns it): kept on the session (`_agyCards`); a finished sub is
// never read again, a working one at most every 5 s; a sub this store does not know stays a row (no error).
// node builtins + the PURE agy-store + the SHARED gate and ACP reader (a descriptor reads it — never ORCH).
const fs = require('fs');
const os = require('os');
const path = require('path');
const AS = require('./agy-store');
const { storeReader } = require('./agy-store-fs');
const { AcpSessionMessages, parseAcpBufferRecords } = require('./acp-message-manager');

const REREAD_MS = 5000;        // a working sub's store, at most this often
const LIVE_AFTER_MS = 60000;   // a live row's grace: the new wrapper's own look (AGY_WEBUI_SUB_LOOK_MS) ends first
const MAX_SPAWNS = 64;         // per session (acp-subagents MAX_SUBS)

/** The store's HOME for a session: its named Google account's root (<data>/agy-subs/<id>) or this machine's login;
 *  null = none here (another machine's conversation, an account whose root is gone — never another login's store). */
function homeOf(session, { dataDir = null } = {}) {
  if (!session || (session.host && session.host !== 'local')) return null;
  const id = session._accountId;
  if (id == null || id === '') return os.homedir();
  if (typeof id !== 'string' || !/^agy-[0-9a-f]{6,32}$/.test(id)) return null;
  const dir = path.join(dataDir || path.join(__dirname, '..', 'data'), 'agy-subs', id);
  try { return fs.statSync(dir).isDirectory() ? dir : null; } catch { return null; }
}

/** The cards of `spawns` (agy-store unlinkedSpawns) from the store — the session's memo entries [{toolCallId, subId,
 *  card, subs, final, fed}] for the rows whose sub was found; `fresh` marks those THIS call changed. */
function refresh(session, spawns, { dataDir = null, now = Date.now(), log } = {}) {
  if (!session || !Array.isArray(spawns) || !spawns.length) return [];
  const memo = session._agyCards || (session._agyCards = new Map());
  if (dataDir && !memo.dataDir) memo.dataDir = dataDir;
  let reader;
  const out = [];
  for (const sp of spawns.slice(-MAX_SPAWNS)) {
    const was = memo.get(sp.toolCallId);
    if (was && (was.final || now - was.readAt < REREAD_MS)) { if (was.card) out.push({ ...was, fresh: false }); continue; }
    if (reader === undefined) { const home = homeOf(session, { dataDir: dataDir || memo.dataDir }); reader = home ? storeReader(home, { log }) : null; }
    if (!reader) return out;
    const snap = AS.snapshotOf(reader, { parentId: sp.parentId, toolCallId: sp.toolCallId, step: sp.step, now });
    if (!snap) { memo.set(sp.toolCallId, { toolCallId: sp.toolCallId, subId: null, card: null, subs: [], final: false, readAt: now, fed: 0 }); continue; }
    const card = { type: 'acp', kind: 'subagent', ...snap.card, home: reader.home, ts: sp.ts || null };
    const fresh = !was || !was.card || JSON.stringify({ ...was.card, elapsedMs: null, endedAt: null }) !== JSON.stringify({ ...card, elapsedMs: null, endedAt: null }) || was.subs.length !== snap.subs.length;
    const e = { toolCallId: sp.toolCallId, subId: snap.subId, card, subs: snap.subs.map((x) => ({ type: 'acp', kind: 'sub', ...x, ts: sp.ts || null })), final: snap.final, readAt: now, fed: was ? was.fed : 0 };
    memo.set(sp.toolCallId, e);
    out.push({ ...e, fresh });
  }
  return out;
}

/** The sub's steps as its virtual session's buffer (what acp-subagents feed / seed keep), unless a longer one is there. */
function seedSubs(session, e) {
  if (!e.subId || !e.subs.length) return;
  if (!session.subagentBuffers) session.subagentBuffers = new Map();
  const have = session.subagentBuffers.get(e.subId);
  if (!have || have.length < e.subs.length) session.subagentBuffers.set(e.subId, e.subs.map((r) => ({ ...r.rec, ts: r.ts || null })));
  e.fed = Math.max(e.fed || 0, e.subs.length);
  const m = session._agyCards && session._agyCards.get(e.toolCallId);
  if (m) m.fed = e.fed;
}

/** THE HISTORY: the journal's records with each card-less invoke_subagent row's card placed right after it. */
function withCards(session, records, opts = {}) {
  const spawns = AS.unlinkedSpawns(records);
  if (!spawns.length) return records;
  const got = new Map(refresh(session, spawns, opts).map((e) => [e.toolCallId, e]));
  if (!got.size) return records;
  const out = [];
  for (const r of records) {
    out.push(r);
    const u = r && r.kind === 'update' && r.update;
    const e = u && u.sessionUpdate === 'tool_call' && got.get(u.toolCallId);
    if (e) { out.push({ ...e.card, ts: r.ts || e.card.ts }); seedSubs(session, e); got.delete(u.toolCallId); }
  }
  return out;
}

/** THE TURN END of a conversation an old wrapper still serves: the records to route as if journaled — a card that
 *  changed + the sub's steps not yet fed (`sub` records). Only rows ≥ 60 s old with no card of their own. */
function afterTurn(session, { dataDir = null, now = Date.now(), log } = {}) {
  const buf = String((session && session.buffer) || '');
  if (!buf.includes('invoke_subagent')) return [];
  const recs = parseAcpBufferRecords(buf.split('\n').filter((l) => l.includes('invoke_subagent') || l.includes('"kind":"subagent"')).join('\n'));
  const spawns = AS.unlinkedSpawns(recs).filter((sp) => { const t = Date.parse(sp.ts || ''); return !Number.isFinite(t) || now - t >= LIVE_AFTER_MS; });
  const late = [];
  for (const e of refresh(session, spawns, { dataDir, now, log })) {
    if (e.fresh) late.push({ ...e.card });
    const fed = e.fed || 0;
    for (const r of e.subs.slice(fed)) late.push(r);
    const m = session._agyCards.get(e.toolCallId);
    if (m) m.fed = e.subs.length;
  }
  return late;
}

/** The antigravity conversation's reader (the descriptor's store.SessionMessages): the ACP journal reader whose records
 *  carry the cards of subs that already ran. */
class AgySessionMessages extends AcpSessionMessages {
  _ensureParsed() {
    if (this._all) return;
    super._ensureParsed();
    try { this._all = withCards(this._session, this._all, { dataDir: this._buffersDir ? path.dirname(this._buffersDir) : null }); } catch { /* the plain journal */ }
  }
}

module.exports = { homeOf, refresh, withCards, afterTurn, AgySessionMessages, REREAD_MS, LIVE_AFTER_MS, MAX_SPAWNS };
