'use strict';
// SESSION-BRAIN CORE (decomposition #8): the dark parity comparator (step 2)
// and the device/server dual-feed side-effect gate (step 3) — sbSeenFirst's
// first-writer-wins record gate + claudeSideEffects (the ONE implementation of
// the six live-stdout consumer families). The hosts.onSessionEvents /
// onUsageEvents WIRING stays in server.js (orchestration); this module is the
// mechanism. Extracted VERBATIM. ORCH tier.
const path = require('path');

const { mk } = require('./lazy.js');

function create({ engine, applyTaskToolUpdate, updateSessionTodos, getUsageHistory,
  // design-unknown-records (2026-09-21) — the chrome-signal consumers' deps, ALL lazy/optional so the
  // dark-parity harness (which passes none of them) and older callers keep working:
  getServerNotice = () => null, broadcastAll = null, broadcastActiveSessions = null,
  getSessionMetaStore = () => null, getSessionStatus = () => null, sessionStatusKey = null }) {
  const { kickPoolEval, markLimitBanner, maybeStopOnFallback,
    recordRateLimitEvent, resolveUsageKey, usageEstimator,
    noteServedModel, noteModelFallback, rerouteAnnouncedBy, notePoolAuthFailure } = engine;
  const usageHistory = mk(getUsageHistory);
  const metaStore = mk(getSessionMetaStore);
  const sessionStatus = mk(getSessionStatus);
  const persistMeta = (session, patch) => {
    try { if (session.sockName && metaStore?.writeSessionMeta) metaStore.writeSessionMeta(session.sockName, { ...(metaStore.readSessionMeta?.(session.sockName) || {}), ...patch }); } catch { }
  };
// ── design-unknown-records (2026-09-21): the four record→side-effect consumers ──
// ONE implementation each, called from the parse (claude-stream-json.js) AND from
// claudeSideEffects (the device feed) — the CLAUDE.md "live session stdout
// consumers" row. Every one is idempotent per record (the seen-gate is belt).
//
// THE REPL'S NOTIFICATION QUEUE → a toast. The normalizer draws the card; a
// priority of `immediate`/`high` ALSO reaches the user wherever they are,
// through the existing server-notice channel (serverNotice is key-deduped per
// boot, so the key carries the session, the notification key and the turn —
// the same key later in the same turn is the queue re-asserting, not news).
function noteHarnessNotification(session, sid, msg) {
  if (!(msg.priority === 'immediate' || msg.priority === 'high') || typeof msg.text !== 'string' || !msg.text.trim()) return;
  // stop-hook-error is the CLI's word for ANY Stop-hook block: when VibeSpace's own bookkeeping nudge just
  // blocked this stop (the nudge stamps _lastStopNudge), the notice is ours and expected — no toast. A stop-hook
  // error with no nudge behind it (another hook failing) still toasts.
  if (msg.key === 'stop-hook-error' && Date.now() - (Number(session._lastStopNudge) || 0) < 120000) return;
  const sn = getServerNotice();
  if (typeof sn !== 'function') return;
  const key = `hn:${sid || session.sockName || '?'}:${String(msg.key || msg.text).slice(0, 60)}:${session._normalizer?.turnIndex ?? 0}`;
  sn(key, `${session.name ? session.name + ': ' : ''}${msg.text.slice(0, 300)}`, { level: msg.priority === 'immediate' ? 2 : 1 });
}
// `system`/`api_error` with 401/403 on the LIVE feed → the same pool auth-failure
// side effect as the api_retry twin. HONESTY (r3 2026-09-21): the binary declares
// api_error on its stream union, but the 2026-09-20 census of 35 live buffers saw
// it ONLY in transcripts (the stream carries api_retry) — so on every instance
// where that holds this consumer is FORWARD-COMPAT and never fires. The transcript
// rows are deliberately NOT fed here: a resume/attach preflight replaying a
// days-old 401 would evict TODAY's member (the mark keys on the session's current
// slot, not the one that failed), and the live twin fires on the first request
// of any resume if the login is still dead — stale evidence buys nothing. The
// engine's own classifier still gates what is forwarded (a lone 401 needs
// attempt ≥ 2 — a refresh race is not a dead login; 403 always counts): test-
// stdout-registry drives the REAL classifier over what this forwards.
function noteApiErrorAuth(session, sid, msg) {
  const st = Number(msg.error?.status ?? msg.error_status);
  if (st !== 401 && st !== 403) return;
  try { notePoolAuthFailure?.(session, sid, { status: st, message: String(msg.error?.message || msg.error?.formatted || ''), attempt: msg.retry_attempt ?? msg.retryAttempt }); } catch { }
}
// VCS STATE (`system`/`vcs_state_changed` {kind, cwd, branch?}; the binary:
// "new kinds may be added — treat unknown like known") → a session FACT: the
// card's git chip, the explorer refresh for that cwd, the Session Properties
// timeline row. Card-less. Persisted so a restart keeps the chip.
function noteVcsState(session, sid, msg) {
  if (typeof msg.kind !== 'string' || !msg.kind) return;
  const fact = { kind: msg.kind.slice(0, 24), branch: typeof msg.branch === 'string' ? msg.branch.slice(0, 200) : null, cwd: typeof msg.cwd === 'string' ? msg.cwd.slice(0, 1000) : null, at: Date.now() };
  session._vcs = fact;
  persistMeta(session, { vcs: fact });
  // EVERY client, not the session's attached ones: the explorer that must re-list may be the only window a client has open
  try { broadcastAll?.({ type: 'session-vcs', sessionId: sid, host: session.host || null, ...fact }); } catch { }
  try { broadcastActiveSessions?.(); } catch { }
  try { if (typeof sessionStatusKey === 'function' && sessionStatus?.noteEvent) sessionStatus.noteEvent(sessionStatusKey(session, sid), { event: 'vcs', kind: fact.kind, branch: fact.branch, at: fact.at }); } catch { }
}
// A PUBLISHED CHANGE (`system`/`code_change_published` {provider, url, repo,
// identifier, action, branch?}) → session meta `prLinks[]` (the card chip). The
// normalizer draws the one small card. The url is UNVERIFIED by the binary's
// own words — it is stored and shown, never fetched.
function notePublishedChange(session, sid, msg) {
  const url = typeof msg.url === 'string' && /^https?:\/\//i.test(msg.url) ? msg.url.slice(0, 500) : null;
  if (!url) return;
  const list = Array.isArray(session._prLinks) ? session._prLinks.slice() : [];
  const row = { url, identifier: msg.identifier != null ? String(msg.identifier).slice(0, 40) : null, repo: typeof msg.repo === 'string' ? msg.repo.slice(0, 200) : null, action: typeof msg.action === 'string' ? msg.action.slice(0, 32) : null, provider: typeof msg.provider === 'string' ? msg.provider.slice(0, 32) : null, at: Date.now() };
  const i = list.findIndex((r) => r.url === url);
  if (i >= 0) list[i] = { ...list[i], ...row }; else list.push(row);
  session._prLinks = list.slice(-20);
  persistMeta(session, { prLinks: session._prLinks });
  try { broadcastActiveSessions?.(); } catch { }
}
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
      // THE FACT BEFORE ITS READERS, at BOTH feeds (2026-09-13 r4): the reroute
      // this record announces is stamped before the served model is read, so
      // `noteServedModel`'s retirement rule never sees a reroute the SAME record
      // carries as "something else answered". The parse has the identical two
      // lines; a one-sided edit is the twin the CS rules ban — and a COMMENT is
      // not a gate, so test-fable-cap-pool-storm §14f is the DERIVED grep census
      // over every file that CALLS `noteServedModel(`: deleting these two lines
      // changes nothing observable in §14e's own leg and only that census sees it.
      const announced = rerouteAnnouncedBy(msg);
      if (announced) noteModelFallback(session, announced.from, announced.to);
      noteServedModel(session, msg.message.model); // the engine's granular consumer — same fallback rule as the parse (2026-09-13)
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
          if (!msg.parent_tool_use_id && !msg.isSidechain) {
            noteModelFallback(session, b.from?.model, b.to?.model); // the FACT, then the belt (2026-09-13)
            maybeStopOnFallback(session, sid, b.from?.model, b.to?.model);
          }
        }
      }
    }
    if (msg.type === 'system' && msg.subtype === 'model_refusal_fallback') {
      if (!msg.parent_tool_use_id && !msg.isSidechain) noteModelFallback(session, msg.originalModel || msg.original_model, msg.fallbackModel || msg.fallback_model);
      maybeStopOnFallback(session, sid, msg.originalModel || msg.original_model, msg.fallbackModel || msg.fallback_model);
    }
    // design-unknown-records (2026-09-21): the four chrome/attention consumers — the
    // parse calls the SAME four functions (test-stdout-registry pins both feeds)
    if (msg.type === 'system' && msg.subtype === 'notification') noteHarnessNotification(session, sid, msg);
    if (msg.type === 'system' && msg.subtype === 'api_error') noteApiErrorAuth(session, sid, msg);
    if (msg.type === 'system' && msg.subtype === 'vcs_state_changed') noteVcsState(session, sid, msg);
    if (msg.type === 'system' && msg.subtype === 'code_change_published') notePublishedChange(session, sid, msg);
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
  return { sbNoteServerOp, sbCompare, sbSeenFirst, claudeSideEffects, _sbRing, _sbMidCore, SB_RING_MAX, noteHarnessNotification, noteApiErrorAuth, noteVcsState, notePublishedChange };
}
module.exports = { create };
