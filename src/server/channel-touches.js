'use strict';
/**
 * THE CHANNEL WITNESS (ORCH; docs/design-communication-panel.zh.md §26,
 * backlog B-099e). Every agent read / search / reply / compose / refresh /
 * request / status of a channel conversation goes through OUR agent routes
 * (src/agent-routes.js `/api/agent/channels/*`) — so the server SEES it, and
 * the agent never has to say where it was: nothing is injected, no tool is
 * added, the agent's manual gains one sentence.
 *
 * `record(webuiId, touch)` / `recordMany(webuiId, touches)` — called by those
 * routes AFTER an answer the agent was allowed to see (a hidden conversation is
 * the uniform not-found and leaves no touch: no oracle) — keeps a per-session
 * RING (PURE src/channel-touch.js appendTouch: the newest RING_MAX, a repeat
 * inside MERGE_MS folds) on `session._channelTouches`, persists it in the
 * session meta (`channelTouches`, debounced, flushed at shutdown; boot-restore
 * reads it back — the taskRecords rule: a live-only record a card depends on
 * is persisted as it passes and replayed on every rebuild) and broadcasts ONE
 * `{type:'channel-touch', sessionId, touches, turnAt}` per call to every client.
 *
 * The strings a touch carries (a conversation title, an account label, a
 * composed subject) are the record's own — vendor- or agent-controlled — so
 * they are made frame-inert here (src/channel-record.js inertFrames) and every
 * client draws them through textContent.
 *
 * `list(webuiId)` (the chat view's one fetch) and `forConversation(adapterId,
 * convId)` (the conversation window's "Drafted by …") are the two reads; the
 * routes are cookie-only (src/routes/channels.js — an agent's bearer is 403).
 */
const T = require('../channel-touch.js');
const { inertFrames } = require('../channel-record.js');

/** A MERGED touch (a read loop's repeat) is re-broadcast at most once per this window per session — 200 reads in
 *  2 s were 200 broadcasts to every client for ONE ring entry (channel-jump verify r2). A NEW touch goes at once. */
const BROADCAST_MS = 250;

function create({ sessions = () => null, broadcast = () => {}, metaStore = () => null, accountOf = () => null, nameOf = () => null, now = () => Date.now(), log = console, persistDelayMs = 1500, broadcastMs = BROADCAST_MS } = {}) {
  const timers = new Map();   // webuiId → the debounced meta write
  const pendingBc = new Map(); // webuiId → {touches: Map<id, touch>, timer}: merged touches awaiting ONE broadcast
  let seq = 0;
  const mint = () => `ct-${now().toString(36)}-${(++seq).toString(36)}`;
  const sessionOf = (id) => { try { const m = sessions(); return m && typeof m.get === 'function' ? m.get(String(id)) || null : null; } catch { return null; } };
  const inert = (v, max) => inertFrames(String(v === null || v === undefined ? '' : v).slice(0, max));

  /** The instant the session's CURRENT turn started: the newest user message the normalizer holds (a rebuild after a
   *  restart re-derives it from the transcript), or the last keystroke into it — whichever is newer. */
  function turnAtOf(s) {
    let at = Number(s && s._userInputAt) || 0;
    const msgs = s && s._normalizer && Array.isArray(s._normalizer.messages) ? s._normalizer.messages : null;
    if (msgs) {
      for (let i = msgs.length - 1, k = 0; i >= 0 && k < 5000; i--, k++) {
        const m = msgs[i];
        if (m && m.role === 'user' && !m.imageAttachment) { at = Math.max(at, Number(m.ts) || 0); break; }
      }
    }
    return at;
  }

  function persist(id) {
    timers.delete(id);
    const s = sessionOf(id);
    const ms = metaStore();
    if (!s || !s.sockName || !ms) return;
    try { ms.writeSessionMeta(s.sockName, { ...(ms.readSessionMeta(s.sockName) || {}), channelTouches: Array.isArray(s._channelTouches) ? s._channelTouches : [] }); }
    catch (e) { log.warn(`[channel-touches] ${id}: the touches were not persisted: ${(e && e.message) || e}`); }
  }
  function schedule(id) {
    if (timers.has(id)) return;
    const tm = setTimeout(() => persist(id), persistDelayMs);
    if (tm.unref) tm.unref();
    timers.set(id, tm);
  }

  /** Record what one agent call touched. Returns the touches as stored (merged ones under their kept id). */
  function recordMany(webuiId, inputs) {
    const id = String(webuiId || '');
    const s = sessionOf(id);
    if (!s || !Array.isArray(inputs) || !inputs.length) return [];
    const ring = Array.isArray(s._channelTouches) ? s._channelTouches : (s._channelTouches = []);
    const at = now();
    const out = [], merged = new Set();
    for (const x of inputs) {
      if (!x) continue;
      let acc = null;
      try { acc = accountOf(x.adapterId) || null; } catch { acc = null; }
      // B-c127 THE NAME LADDER: the conversation's name as the engine knows it NOW (① its title → ② a description) wins
      // over the agent answer's `title`, which says the raw id when the conversation had no title (agentTitle's fallback)
      let named = null;
      try { named = x.convId ? nameOf(x.adapterId, x.convId) || null : null; } catch { named = null; }
      const t = T.normalizeTouch({
        ...x, id: mint(), at,
        title: inert(named || x.title, T.TITLE_MAX),
        account: inert(x.account || (acc && acc.label) || '', T.LABEL_MAX),
        kind: x.kind || (acc && acc.kind) || null,
        ...(x.glyph ? { glyph: inert(x.glyph, 70) } : {}),
      });
      if (!t) continue;
      const { touch, merged: m } = T.appendTouch(ring, t);
      if (m) merged.add(touch); else merged.delete(touch);
      if (!out.includes(touch)) out.push(touch);
    }
    if (!out.length) return [];
    schedule(id);
    // a NEW touch is said at once (the card wants its row); a MERGED one (the same row, a bigger count) joins the
    // session's next coalesced broadcast — the client upserts by id either way
    const fresh = out.filter((x) => !merged.has(x)), folded = out.filter((x) => merged.has(x));
    if (fresh.length) say(id, s, fresh);
    if (folded.length) {
      const pb = pendingBc.get(id) || { touches: new Map(), timer: null };
      for (const x of folded) pb.touches.set(x.id, x);
      if (!pb.timer) { pb.timer = setTimeout(() => { pendingBc.delete(id); const cur = sessionOf(id); if (cur) say(id, cur, [...pb.touches.values()]); }, broadcastMs); if (pb.timer.unref) pb.timer.unref(); }
      pendingBc.set(id, pb);
    }
    return out;
  }
  function say(id, s, touches) {
    try { broadcast({ type: 'channel-touch', sessionId: id, touches: touches.map((x) => ({ ...x })), turnAt: turnAtOf(s) }); }
    catch (e) { log.warn(`[channel-touches] broadcast failed: ${(e && e.message) || e}`); }
  }
  const record = (webuiId, touch) => recordMany(webuiId, [touch]);

  /** The chat view's read: this session's ring + its current turn's start. */
  function list(webuiId) {
    const s = sessionOf(webuiId);
    if (!s) return { ok: true, sessionId: String(webuiId || ''), live: false, touches: [], turnAt: 0 };
    return { ok: true, sessionId: String(webuiId), live: true, touches: (Array.isArray(s._channelTouches) ? s._channelTouches : []).slice(-T.RING_MAX).map((x) => ({ ...x })), turnAt: turnAtOf(s) };   // a restored meta longer than the ring (hand-edited) is read as the newest RING_MAX, like the ring itself
  }

  /** The conversation window's read: every live session that touched this conversation — its name, the strongest op,
   *  the newest instant — newest first. */
  function forConversation(adapterId, convId) {
    const key = `${adapterId}/${convId}`;
    const out = [];
    let all = null;
    try { all = sessions(); } catch { all = null; }
    for (const [sid, s] of all && typeof all.entries === 'function' ? all.entries() : []) {
      const sum = T.sessionSummary(s && s._channelTouches, key);
      if (!sum) continue;
      out.push({ sessionId: String(sid), name: s.name || null, op: sum.op, at: sum.at, n: sum.n });
    }
    out.sort((a, b) => b.at - a.at);
    return { ok: true, key, touches: out };
  }

  /** Shutdown: every pending meta write lands now (the atomic-persistence law's flush). */
  function flush() {
    for (const [id, pb] of [...pendingBc]) { clearTimeout(pb.timer); pendingBc.delete(id); const s = sessionOf(id); if (s) say(id, s, [...pb.touches.values()]); }
    for (const [id, tm] of [...timers]) { clearTimeout(tm); persist(id); }
  }

  return { record, recordMany, list, forConversation, flush, turnAtOf };
}

module.exports = { create, BROADCAST_MS };
