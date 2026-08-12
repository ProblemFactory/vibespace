'use strict';
// SESSION-BRAIN CORE (decomposition #8): the dark parity comparator (step 2)
// and the device/server dual-feed side-effect gate (step 3) — sbSeenFirst's
// first-writer-wins record gate + claudeSideEffects (the ONE implementation of
// the six live-stdout consumer families). The hosts.onSessionEvents /
// onUsageEvents WIRING stays in server.js (orchestration); this module is the
// mechanism. Extracted VERBATIM. ORCH tier.
const path = require('path');

function create({ engine, applyTaskToolUpdate, updateSessionTodos, getUsageHistory }) {
  const { kickPoolEval, markLimitBanner, maybeStopOnFallback,
    recordRateLimitEvent, resolveUsageKey, usageEstimator } = engine;
  const mk = (get) => new Proxy({}, { get: (_, k) => { const o = get(); if (!o) return undefined; const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; } });
  const usageHistory = mk(getUsageHistory);
// ── Session-brain step 2: the DARK comparator ───────────────────────────────
// The daemon streams its own normalizer's ops for its pipe sessions; the
// server compares mids against ITS parse of the same relayed stdout and does
// NOTHING else with them. Content-derived mids (R0) make equality meaningful.
// Metrics tell us when parity has earned step 3: sb-parity-hit / sb-parity-
// miss per batch, plus a throttled divergence log naming the first differing
// mid. Rings are bounded and per-sid; a session's ring dies with it.
const _sbRings = new Map(); // key `<hostId>:<sid>` → { device:[], server:[], lastWarnAt }
const SB_RING_MAX = 400;
function _sbRing(key) {
  let r = _sbRings.get(key);
  if (!r) { r = { device: [], server: [], lastWarnAt: 0 }; _sbRings.set(key, r); if (_sbRings.size > 512) _sbRings.delete(_sbRings.keys().next().value); }
  return r;
}
// mids are PREFIXED with the emitting normalizer's session id (`<id>:m:…`) —
// device uses ITS sid (keeperSid), the server uses the webui id, so parity
// compares the SUFFIX after the first ':' (the content-derived half).
const _sbMidCore = (id) => { const s2 = String(id); const i = s2.indexOf(':'); return i >= 0 ? s2.slice(i + 1) : s2; };
function sbNoteServerOp(hostId, sid, op) {
  try {
    if (!hostId || !op || op.op !== 'create' || !op.msg?.id) return;
    const r = _sbRing(hostId + ':' + sid);
    r.server.push(_sbMidCore(op.msg.id));
    if (r.server.length > SB_RING_MAX) r.server.splice(0, r.server.length - SB_RING_MAX);
    sbCompare(hostId, sid, r);
  } catch { }
}
function sbCompare(hostId, sid, r) {
  // parity = every device-seen create mid eventually appears in the server
  // ring (and vice versa within the window). Order-insensitive set compare
  // over the overlap — the two taps run at different cadences by design.
  const dev = new Set(r.device), srv = new Set(r.server);
  let hit = 0, miss = 0, firstMiss = null;
  for (const m of dev) { if (srv.has(m)) hit++; else if (r.server.length >= 5) { miss++; if (!firstMiss) firstMiss = m; } }
  if (hit) global.__vsMetric?.('sb-parity-hit', hit);
  if (miss) {
    global.__vsMetric?.('sb-parity-miss', miss);
    const now = Date.now();
    if (now - r.lastWarnAt > 300000) {
      r.lastWarnAt = now;
      console.warn(`[session-brain] parity divergence ${hostId}:${sid} — ${miss} device mid(s) unseen by the server parse (first: ${String(firstMiss).slice(0, 60)}) — step 3 stays gated until this is zero`);
      global.__vsEvent?.('sb-parity-diverged', { detail: `${hostId}:${sid} miss=${miss}` });
    }
  }
}
// ── Session-brain STEP 3 (2.317.0): consumers go DEVICE-FIRST ──────────────
// The six side-effect families (served model, usage odometer, rate-limit
// events, limit banners, fallback belts, task/todo state) now run from the
// DEVICE's raw-record stream when the daemon owns the session's stdout, with
// the server's own parse as the automatic backstop. Single-owner per RECORD,
// not per session: a bounded first-writer-wins gate keyed by record identity
// means the transition needs no offset surgery — whichever feed sees a record
// first performs its side effects, the other finds the key taken and skips.
// A dead device stream degrades to exactly the pre-step-3 world with zero
// coordination. The NORMALIZER/msg-broadcast path deliberately stays
// server-owned until R6 (the client protocol is untouched by this step).
const SB_SEEN_MAX = 600;
function sbSeenFirst(session, rec) {
  const key = rec.uuid || ((rec.requestId || rec.message?.id || '') + ':' + (rec.type || '') + ':' + (rec.subtype || ''));
  if (!key || key === '::') return true; // unidentifiable records: let both run (idempotent families only)
  const seen = session._sbSeen || (session._sbSeen = new Set());
  if (seen.has(key)) return false;
  seen.add(key);
  if (seen.size > SB_SEEN_MAX) { const it = seen.values(); for (let i = 0; i < 100; i++) seen.delete(it.next().value); }
  return true;
}
// The side-effect families, ONE implementation fed by either stream. Kept
// deliberately to the granular consumer functions — inline duplication of the
// parse block is the drift the CS rules ban.
function claudeSideEffects(session, sid, msg) {
  try {
    if (msg.type === 'assistant' && msg.message?.model && msg.message.model !== '<synthetic>' && !msg.parent_tool_use_id && !msg.isSidechain) {
      session._servedModel = msg.message.model; session._servedModelAt = Date.now();
    }
    if (msg.type === 'assistant' && msg.message?.usage && (msg.requestId || msg.message?.id) && !(session.host && !session._accountId)) {
      try {
        const u = msg.message.usage; const cc = u.cache_creation || {};
        const acctKey = resolveUsageKey(session);
        const mkCost = (i, o, cw5, cw1, cr) => usageHistory._cost({ acct: acctKey === '__global__' ? null : acctKey, model: msg.message.model, i, o, cw5, cw1, cr });
        usageEstimator.noteLive({ rid: msg.requestId || msg.message.id, accountId: acctKey, model: msg.message.model,
          usd: mkCost(u.input_tokens || 0, u.output_tokens || 0, cc.ephemeral_5m_input_tokens || 0, cc.ephemeral_1h_input_tokens || 0, u.cache_read_input_tokens || 0),
          cwUsd: mkCost(0, 0, cc.ephemeral_5m_input_tokens || 0, cc.ephemeral_1h_input_tokens || 0, 0),
          crUsd: mkCost(0, 0, 0, 0, u.cache_read_input_tokens || 0) });
        kickPoolEval();
      } catch { }
    }
    if (msg.type === 'rate_limit_event') recordRateLimitEvent(session, msg);
    if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
      for (const b of msg.message.content) {
        if (b?.type === 'text' && typeof b.text === 'string' && /You've (?:reached|hit) your .{0,40} limit/.test(b.text)) {
          global.__vsEvent?.('cli-usage-limit');
          markLimitBanner(session, b.text);
        } else if (b?.type === 'fallback') {
          global.__vsEvent?.('cli-model-fallback', `${b.from?.model || '?'}->${b.to?.model || '?'}`);
          if (!msg.parent_tool_use_id && !msg.isSidechain) maybeStopOnFallback(session, sid, b.from?.model, b.to?.model);
        }
      }
    }
    if (msg.type === 'system' && msg.subtype === 'model_refusal_fallback') {
      maybeStopOnFallback(session, sid, msg.originalModel || msg.original_model, msg.fallbackModel || msg.fallback_model);
    }
    // todo/task families mirror the parse's exact consumption (lines above):
    // TodoWrite carries the whole list; TaskUpdate patches by id; TaskCreate's
    // id only exists in the tool RESULT, which the parse stashes — the device
    // feed leaves creates to the parse (the seen-gate does not cover them, so
    // nothing is lost; the parse path still sees every record).
    if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
      for (const b of msg.message.content) {
        if (b?.type !== 'tool_use') continue;
        try {
          if (b.name === 'TodoWrite' && Array.isArray(b.input?.todos)) updateSessionTodos(session, b.input.todos);
          else if (b.name === 'TaskUpdate' && b.input?.taskId) applyTaskToolUpdate(session, b.input);
        } catch { }
      }
    }
  } catch (e) { console.warn('[session-brain] device side-effects failed:', e.message); }
}
  return { sbNoteServerOp, sbCompare, sbSeenFirst, claudeSideEffects, _sbRing, _sbMidCore, SB_RING_MAX };
}
module.exports = { create };
