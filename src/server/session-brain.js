'use strict';
// SESSION-BRAIN CORE (decomposition #8): the device/server dual-feed side-effect gate (step 3; the step-2 parity
// soak was removed in 2.369.407) — sbSeenFirst's
// first-writer-wins record gate + claudeSideEffects (the ONE implementation of
// the six live-stdout consumer families). The hosts.onSessionEvents /
// onUsageEvents WIRING stays in server.js (orchestration); this module is the
// mechanism. Extracted VERBATIM. ORCH tier.
const path = require('path');

const { mk } = require('./lazy.js');
const { titleFromRecord } = require('../discovery-facts.js'); // lane session-title-record: ONE title rule (discovery too)
const { noteRequestSent, sendsRequest, noteSubRequestSent, sendsSubRequest } = require('../turn-state.js'); // PURE: a request's send instant (lane cache-warmth-tiles r4)

// ── B-d868 WHO STARTED THE TURN — ONE implementation for BOTH feeds (主开发's as-if-must (2), 11:37Z) ──
// `session._turnBy` {by, name?, at, source} is decided ONCE per turn at the turn's own `system/init`, from the CLI's records:
// (1) the init's user_message_uuids names a frame the wrapper stamped as the person's (frame_stamp) ⇒ the person; (2) else the
// command the CLI started BETWEEN turns (after a result this machine saw) ⇒ the CLI's own record of it, handed in by the
// parse's one transcript lookup (noteTurnCmdRecord); (3) else the turn's first record ⇒ PURE message-manager turnOpenerOf.
// Nothing proves it ⇒ 'unrecorded', NEVER «the person»; the result ends the fact. Each live background task keeps the opener
// KEY of the turn its own task_started came in (`_turnByBackground`, read by turnByForAsk).
// It is an ORDERED state machine, not a per-record idempotent family, so each record is taken ONCE, at its first arrival,
// from whichever feed brings it — the parse (claude-stream-json: every record it sees) or the device stream
// (claudeSideEffects: the records the parse has not seen). Both feeds carry the same ordered stream, so taking each record at
// its first appearance keeps the order. The state lives on the SESSION (`_turnOpen`); an attach makes the opener UNKNOWN
// until a turn starts in its sight (as-if-must (1)): a gap can never leave the previous turn's «you» standing.
// B-f276 (主开发 r5188 (1)): THE TURN's START, told to the pool engine ONCE a turn (its init, from whichever feed brings it first —
// never a backlog's, never one already taken): the engine ends the turn before's held mark there (a turn the wrapper's death ended
// reached no result). Set by create from its engine; none (a harness without it) tells nothing.
let turnStartHook = null;
const TURN_SEEN_MAX = 600;   // the reader's should: the same bound as sbSeenFirst's SB_SEEN_MAX (a feed lagging past it is caught by the order rule below)
function turnStateOf(session) {
  return session._turnOpen || (session._turnOpen = { live: null, cmd: null, first: null, waitCmd: null, persons: new Set(), launched: new Map(), bgLive: [], cmdRecs: new Map(), seen: new Set(), feedAt: {}, resultAt: 0, opened: new Set(), firstFromDevice: false, belt: null, belted: new Map() });
}
/** A record's identity for the once-per-record rule: the CLI's own uuid, or the wrapper's stamp of a frame (it has none). */
function turnKeyOf(msg) {
  if (typeof msg.uuid === 'string' && msg.uuid) return msg.uuid;
  if (msg.type === 'frame_stamp' && typeof msg.cli_uuid === 'string' && msg.cli_uuid) return 'fs:' + msg.cli_uuid;
  return null;
}
const openerKeyOf = (tb) => (tb && typeof tb.by === 'string' && tb.source !== 'pending' ? tb.by + (tb.name ? '|' + tb.name : '') : 'unrecorded');
// the WALL-CLOCK STEP at the turn's opening (主开发 r274/r541): the hub's wall clock minus its monotonic one, against its time origin —
// src/server/left-behind-door.js takes the difference at the Stop out of the turn's age (a clock set DURING the turn moves nothing)
const wallStep = () => Math.round(Date.now() - (performance.timeOrigin + performance.now()));
function setTurnBy(session, v) { const f = { ...v, at: Date.now(), step: wallStep() }; session._turnBy = f; return f; }
function byVerdict(session, fact, v, source) {
  if (session._turnBy !== fact) return;   // a newer turn owns the fact (by identity — never by the clock)
  session._turnBy = { ...(v || { by: 'unrecorded' }), at: fact.at, ...(Number.isFinite(fact.step) ? { step: fact.step } : {}), source };
}
function byRecord(session, fact, rec, stamped) {
  byVerdict(session, fact, require('../message-manager.js').turnOpenerOf(rec, { stamped }), stamped ? 'frame-stamp' : (rec ? 'cli-record' : 'no-record'));
}
function sayBackground(session, st) { session._turnByBackground = [...new Set(st.bgLive.map((k) => st.launched.get(k) || 'unknown'))]; }
/** The parse's ONE transcript lookup hands the CLI's record of a started command here (null: it gave up) — a verdict is kept, never the record. */
function noteTurnCmdRecord(session, cmdUuid, rec) {
  const st = turnStateOf(session);
  const v = rec ? require('../message-manager.js').turnOpenerOf(rec) : null;
  st.cmdRecs.set(cmdUuid, v);
  if (st.cmdRecs.size > 32) st.cmdRecs.delete(st.cmdRecs.keys().next().value);
  if (st.waitCmd && st.waitCmd.cmd === cmdUuid) { const w = st.waitCmd; st.waitCmd = null; byVerdict(session, w.fact, v, v ? 'cli-record' : 'no-record'); }
}
/** An attach (a boot, a re-attach after a dead bridge): the opener is UNKNOWN until a turn starts in this attach's sight. The
 *  background tasks still running (the normalizer's own level set) are unknown too: nobody here saw them start. */
function noteTurnAttach(session) {
  const prev = session._turnOpen;
  session._turnOpen = null;
  const st = turnStateOf(session);
  // the STREAM's facts outlive an attach (where each feed has reached, the last result, the inits that opened a turn): a
  // backlog arriving right after a re-attach is still a backlog
  if (prev) { st.feedAt = { ...(prev.feedAt || {}) }; st.resultAt = prev.resultAt || 0; if (prev.opened) st.opened = prev.opened; }
  setTurnBy(session, { by: 'unrecorded', source: 'attach' });
  let live = []; try { live = (session._normalizer?.backgroundTasks?.() || []).map((t) => String(t && t.id).slice(0, 64)).filter(Boolean); } catch { live = []; }
  st.bgLive = live.slice(0, 100);
  sayBackground(session, st);
}
/** THE STREAM'S OWN ORDER (主开发's as-if-musts 12:09Z and 12:32Z): a feed's position is the newest stamp it has DELIVERED — noted
 *  where the feed delivers, before ANY gate that may drop the record: noteTurnOpener notes it before its once-gate, and server.js's
 *  device path calls this ahead of sbSeenFirst (a device record the parse took first never reaches the opener; noted there
 *  only, the device feed's position stayed at zero on an ordinary conversation, and the result + init it alone supplied after a
 *  parse gap were dropped as «behind» — the previous turn's «you» standing over a turn it did not start). The CLI stamps its
 *  user / assistant records; init and result carry none. When NEITHER feed ever carries a stamp the order rule is silent (both
 *  positions stay 0, nothing is behind): the two memories alone hold — the once-memory (600 keys) and the opened inits (2000). */
function noteTurnFeed(session, msg, feed) {
  if (!session || !msg || typeof msg !== 'object') return;
  const ts = typeof msg.timestamp === 'string' ? Date.parse(msg.timestamp) : NaN;
  if (!Number.isFinite(ts)) return;
  const st = turnStateOf(session);
  if (ts > (st.feedAt[feed] || 0)) st.feedAt[feed] = ts;
}
/** Feed ONE record (`feed`: 'parse' | 'device'). A record without an identity is taken from the parse only. A throw inside the
 *  opener is SAID (once per session, then counted in `session._turnOpenerFaults`) — never left to its callers' empty catches. */
function noteTurnOpener(session, msg, feed = 'parse') {
  try { takeTurnRecord(session, msg, feed); } catch (e) {
    if (!session || typeof session !== 'object') return;
    session._turnOpenerFaults = (session._turnOpenerFaults || 0) + 1;
    if (session._turnOpenerFaults === 1) console.warn(`[session-brain] the turn opener failed on a ${(msg && msg.type) || '?'} record (${feed}): ${(e && e.message) || e} — said once per session, counted in _turnOpenerFaults`);
  }
}
// B-3336 (主开发 r847): the parse's own copy of an init a DEVICE-first take opened (its belt record `b`). While that turn still
// stands, the turn is decided exactly as the parse alone decides it: the stamp the init names (or its command's), else the first
// record's stamp. Whether it stands or has ended, the background tasks launched under the belt's «unrecorded» are keyed as the parse
// alone keys them (they outlive their turn). A turn whose init the parse never brings keeps the belt (unrecorded, device-init).
function parseCopyOfOpening(session, st, msg, b) {
  // the stamps are judged when the COPY arrives: that equals the parse alone only because the wrapper writes a frame_stamp as the
  // frame reaches the CLI, before the CLI's init; with neither stamp held the parse alone keys this turn and its helpers as already done
  st.belted.delete(b.key);
  const standing = st.belt === b && st.live === true;
  if (standing) { st.firstFromDevice = false; st.belt = null; }
  const held = (u) => typeof u === 'string' && st.persons.has(u);
  const names = Array.isArray(msg.user_message_uuids) ? msg.user_message_uuids.map(String) : [];
  const byInit = names.some(held) || held(b.cmd);
  if (!byInit && !(b.firstRec && b.firstRec.type === 'user' && held(b.firstRec.uuid))) return;
  if (standing) { if (byInit) { st.first = null; st.waitCmd = null; } byVerdict(session, session._turnBy, { by: 'person' }, 'frame-stamp'); }
  for (const t of b.tasks) if ((byInit || t.afterFirst) && st.launched.has(t.k)) st.launched.set(t.k, 'person');
  sayBackground(session, st);
}
function takeTurnRecord(session, msg, feed) {
  if (!session || !msg || typeof msg !== 'object') return;
  const st = turnStateOf(session);
  noteTurnFeed(session, msg, feed);   // where this feed has reached — before the once-gate (the device path notes it before ITS gate too)
  const key = turnKeyOf(msg);
  if (key && feed === 'parse' && msg.type === 'system' && msg.subtype === 'init' && st.belted.has(key)) { parseCopyOfOpening(session, st, msg, st.belted.get(key)); return; }   // before the once-gate drops it
  if (key) { if (st.seen.has(key)) return; st.seen.add(key); if (st.seen.size > TURN_SEEN_MAX) st.seen.delete(st.seen.values().next().value); }
  else if (feed !== 'parse') return;
  if (msg.type === 'frame_stamp' && typeof msg.cli_uuid === 'string' && msg.cli_uuid) { st.persons.add(msg.cli_uuid); if (st.persons.size > 64) st.persons.delete(st.persons.values().next().value); return; }
  // a command started BETWEEN turns — after a result THIS machine saw (after an attach `live` is unknown: a steer inside a turn already running never counts)
  if (msg.type === 'command_lifecycle' && msg.state === 'started' && typeof msg.command_uuid === 'string' && msg.command_uuid) { if (st.live === false) st.cmd = msg.command_uuid; return; }
  if (msg.type === 'system' && msg.subtype === 'task_started' && msg.task_id != null) {
    const k = String(msg.task_id).slice(0, 64);
    if (!st.launched.has(k)) {
      st.launched.set(k, st.live === true ? openerKeyOf(session._turnBy) : 'unrecorded'); if (st.launched.size > 200) st.launched.delete(st.launched.keys().next().value);
      if (st.live === true && st.belt) { st.belt.tasks.push({ k, afterFirst: !st.first }); if (st.belt.tasks.length > 200) st.belt.tasks.shift(); }   // keyed under the belt: the parse's copy of the init re-keys it (the newest 200, as `launched` keeps)
    }
    if (st.bgLive.includes(k)) sayBackground(session, st);
    return;
  }
  if (msg.type === 'system' && msg.subtype === 'background_tasks_changed' && Array.isArray(msg.tasks)) {
    st.bgLive = msg.tasks.filter((t) => t && typeof t === 'object' && t.task_id != null).map((t) => String(t.task_id).slice(0, 64)).slice(0, 100);
    sayBackground(session, st);
    return;
  }
  // an init or a result from a feed that is BEHIND the last result this session saw is a backlog's: it opens and ends nothing
  if ((msg.type === 'result' || (msg.type === 'system' && msg.subtype === 'init')) && (st.feedAt[feed] || 0) < st.resultAt) return;
  // …and an init that already opened a turn never opens one again, however long ago (a stream with no stamps; the once-memory's 600)
  if (msg.type === 'system' && msg.subtype === 'init' && key) { if (st.opened.has(key)) return; st.opened.add(key); if (st.opened.size > 2000) st.opened.delete(st.opened.values().next().value); }
  if (msg.type === 'system' && msg.subtype === 'init') {
    st.live = true; session._turnLive = true;   // B-02a3: the turn the CLI is running, by its own records (either feed)
    if (!msg.parent_tool_use_id && !msg.isSidechain) { try { turnStartHook?.(session); } catch { } }   // B-f276 r5188 (1): the main thread's turn starts here
    const cmd = st.cmd;
    st.cmd = null; st.first = null; st.waitCmd = null;
    const names = Array.isArray(msg.user_message_uuids) ? msg.user_message_uuids.map(String) : [];
    // B-3336 THE BELT (主开发 r794, restated r847): an init the PARSE NEVER BRINGS never reads as the person's — the device copy is the
    // one a parse gap leaves, and its turn may not be the one the person's stamp named («not recorded», its source said). A device-first
    // init holds the belt only UNTIL the parse's own copy of it arrives (parseCopyOfOpening); the parse-taken path is unchanged
    st.firstFromDevice = feed === 'device';
    st.belt = st.firstFromDevice && key ? { key, cmd, firstRec: null, tasks: [] } : null;   // what the parse's copy needs to decide it
    if (st.belt) { st.belted.set(key, st.belt); if (st.belted.size > 16) st.belted.delete(st.belted.keys().next().value); }
    if (names.some((u) => st.persons.has(u)) || (cmd && st.persons.has(cmd))) { setTurnBy(session, st.firstFromDevice ? { by: 'unrecorded', source: 'device-init' } : { by: 'person', source: 'frame-stamp' }); return; }
    const fact = setTurnBy(session, { by: 'unrecorded', source: 'pending' });
    if (cmd && !session.host) { if (st.cmdRecs.has(cmd)) byVerdict(session, fact, st.cmdRecs.get(cmd), st.cmdRecs.get(cmd) ? 'cli-record' : 'no-record'); else st.waitCmd = { cmd, fact }; return; }
    st.first = fact;
    return;
  }
  if ((msg.type === 'user' || msg.type === 'assistant') && st.first) {
    const c = msg.message && msg.message.content;
    if (msg.type === 'user' && Array.isArray(c) && c.some((b) => b && b.type === 'tool_result')) return;
    const fact = st.first; st.first = null; if (st.belt) st.belt.firstRec = { type: msg.type, uuid: typeof msg.uuid === 'string' ? msg.uuid : null };
    const stamped = msg.type === 'user' && typeof msg.uuid === 'string' && st.persons.has(msg.uuid);
    if (stamped && st.firstFromDevice) { byVerdict(session, fact, { by: 'unrecorded' }, 'device-init'); return; }   // the belt: after a device-taken init no stamp makes it the person's until the parse brings that init — and the fact says so
    if (msg.type === 'user') byRecord(session, fact, msg, stamped);
    else byRecord(session, fact, null, false);   // the model spoke first: nothing in the turn said who opened it
    return;
  }
  if (msg.type === 'result') {
    st.resultAt = Math.max(st.resultAt, st.feedAt[feed] || 0);   // where the stream stood when this turn ended
    st.live = false; session._turnLive = false; st.cmd = null; st.first = null; st.waitCmd = null;
    st.firstFromDevice = false; st.belt = null;   // the turn is over: a later parse copy of its init re-keys only its helpers (st.belted)
    setTurnBy(session, { by: 'unrecorded', source: 'turn-ended' });
  }
}
function create({ engine, applyTaskToolUpdate, updateSessionTodos, getUsageHistory,
  // design-unknown-records (2026-09-21) — the chrome-signal consumers' deps, ALL lazy/optional so the
  // dark-parity harness (which passes none of them) and older callers keep working:
  getServerNotice = () => null, broadcastAll = null, broadcastActiveSessions = null,
  getSessionMetaStore = () => null, getSessionStatus = () => null, sessionStatusKey = null }) {
  const { kickPoolEval, markLimitBanner, maybeStopOnFallback,
    recordRateLimitEvent, resolveUsageKey, usageEstimator,
    noteServedModel, noteModelFallback, rerouteAnnouncedBy, notePoolAuthFailure,
    noteStreamRecord, recordIsLate, noteModelRequest, noteCompacted, noteTurnStart } = engine; // + the late-record rule (lane-hot-switch) — called through `?.`: the dark-parity harness passes neither
  turnStartHook = typeof noteTurnStart === 'function' ? noteTurnStart : null;   // B-f276 r5188 (1): the turn's start (takeTurnRecord's init)
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
// `system`/`session_writes_lost` (2.1.319, lane cli-2-1-319-records r2) → the record kept past this process: the pty-exit path deletes the meta and the
// buffer, and the transcript cannot carry its own loss (src/server/writes-lost.js). Before feedLive, so a rebuild never misses it.
function noteWritesLost(session, sid, msg) {
  const store = require('./writes-lost.js').installed();
  if (store) store.note(msg, session.claudeSessionId || session.backendSessionId || null);
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
// THE CLI'S OWN TITLE (`system`/`session_title_changed` {title}, claude 2.1.288 — lane session-title-record) → a
// session FACT `cliTitle`: the name ladder's middle rung (src/session-name.js — the user's rename › a given name ›
// THIS › the first message). Card-less (known-ignored); the newest title wins; persisted so a restart keeps the name.
function noteSessionTitle(session, sid, msg) {
  const title = titleFromRecord(msg);
  if (!title || title === session._cliTitle) return;
  session._cliTitle = title;
  persistMeta(session, { cliTitle: title });
  try { broadcastActiveSessions?.(); } catch { }
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
// ── Session-brain step 2 — THE PARITY SOAK IS REMOVED (2.369.407, lane session-events-ends U2) ─────────────
// The dark comparator (two rings, sb-parity-hit / sb-parity-miss, sb-parity-diverged) could not fail from the day it was
// written: both taps read `op.msg`, while every create carries `message`. It gated three activation switches for three
// months. A live comparison of two feeds measures the transport between two copies of ONE bundled normalizer, not the
// normalizer — parity is a deterministic leg now (test-session-brain-dark: the same lines through the daemon's normalizer
// and the server's, by id and content) plus a fast pin of the create's field. The device feed itself (step 3 below) is
// untouched.
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
  const key = rec.uuid || (rec.type === 'frame_stamp' && rec.cli_uuid ? 'fs:' + rec.cli_uuid : ((rec.requestId || rec.message?.id || '') + ':' + (rec.type || '') + ':' + (rec.subtype || '')));   // B-d868 (its reader): every frame_stamp collapsed onto «:frame_stamp:», so the device feed took only the first
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
// lane conversation-facts (majordomo piece 2): the conversation's OBSERVATIONS — src/conversation-facts.js factsStep, the step the
// wrapper also runs — fed by the parse AND the device stream (claudeSideEffects below). The wrapper's own synthesized records
// (`_stdin_ack`, `_remote_exit`, …: a type starting with «_») are not the CLI's and move nothing.
const CONV_FACTS = require('../conversation-facts.js');
function noteConvFacts(session, msg) {
  if (!session || !session._convFacts || !msg || typeof msg.type !== 'string' || msg.type.startsWith('_')) return;
  try { CONV_FACTS.factsStep(session._convFacts, msg, Date.now()); } catch { }
}
function claudeSideEffects(session, sid, msg) {
  let openerFed = false;   // B-3336 (the parse's twin): a consumer that throws before the opener's call never costs the opener its record
  try {
    noteConvFacts(session, msg); // lane conversation-facts: the device stream's records count too (first writer wins)
    // the stream clock sees every record of THIS feed too (lane-hot-switch):
    // the device stream fills the parse's gaps, and a gap is exactly where a
    // stalled bridge's backlog comes from
    try { noteStreamRecord?.(session, msg); } catch { }
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
      noteServedModel(session, msg.message.model, msg, 'device'); // the engine's granular consumer — same fallback rule as the parse (2026-09-13); the record rides along: one verdict per record (r7)
    }
    try { noteModelRequest?.(session, msg); } catch { } // the conversation's LAST MODEL REQUEST (lane cache-warmth-tiles) — the parse's twin call
    try { noteCompacted?.(session, msg); } catch { } // a compaction's END resets the cache fact (lane cache-warmth-compact) — the parse's twin call
    if (sendsSubRequest(msg) && !recordIsLate?.(session, msg)) noteSubRequestSent(session, Date.now()); // a SUB-AGENT's request-out: its instant only (lane readings-attribution-2) — the parse's twin
    if (sendsRequest(msg) && !recordIsLate?.(session, msg)) noteRequestSent(session, Date.now()); // a prompt's echo or a TOOL RESULT sends a request; a backlog's proves nothing about now — the parse's twin (lane cache-warmth-tiles r4)
    if (msg.type === 'assistant' && msg.message?.usage && (msg.requestId || msg.message?.id) && !(session.host && !session._accountId) && !recordIsLate?.(session, msg)) {
      try {
        const u = msg.message.usage; const cc = u.cache_creation || {};
        const acctKey = resolveUsageKey(session);
        const whole = (u.input_tokens || 0) + (cc.ephemeral_5m_input_tokens || 0) + (cc.ephemeral_1h_input_tokens || 0) + (u.cache_read_input_tokens || 0); // parts of ONE request: the long-context rule is the request's
        const mkCost = (i, o, cw5, cw1, cr) => usageHistory._cost({ acct: acctKey === '__global__' ? null : acctKey, model: msg.message.model, i, o, cw5, cw1, cr }, whole);
        if (acctKey != null) usageEstimator.noteLive({ rid: msg.requestId || msg.message.id, accountId: acctKey, model: msg.message.model,
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
          markLimitBanner(session, b.text, msg);
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
    if (msg.type === 'system' && msg.subtype === 'session_title_changed') noteSessionTitle(session, sid, msg); // lane session-title-record
    if (msg.type === 'system' && msg.subtype === 'session_writes_lost') noteWritesLost(session, sid, msg); // lane cli-2-1-319-records r2
    openerFed = true; try { noteTurnOpener(session, msg, 'device'); } catch { }   // B-d868: who started the turn — the ONE opener, fed the records the parse has not seen
    // lane artifacts-model: the deliverable rows — the parse makes the SAME call (the row moves once per call id)
    if (msg.type === 'assistant' || msg.type === 'user') { try { require('./artifact-registry.js').observe(session, msg); } catch { } } // lane artifacts-handover: + a helper's end
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
  } catch (e) {
    if (!openerFed) { try { noteTurnOpener(session, msg, 'device'); } catch { } }   // B-3336: handed once, past the consumer that threw
    console.warn('[session-brain] device side-effects failed:', e.message);
  }
}
  return { sbSeenFirst, claudeSideEffects, noteTurnFeed, noteHarnessNotification, noteApiErrorAuth, noteVcsState, notePublishedChange, noteSessionTitle, noteWritesLost, noteConvFacts };
}
module.exports = { create, noteTurnOpener, noteTurnCmdRecord, noteTurnAttach, noteTurnFeed };
