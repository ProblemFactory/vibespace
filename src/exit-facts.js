'use strict';
// PURE (imports nothing) — WHAT A SESSION'S EXIT RECORD SAYS (B-3052).
//
// The 2026-09-24 incident: three chat sessions died in one 40 ms window and
// the journal held only `[session] exited <id> "<name>" mode=chat
// backend=claude` — no code, no signal, nothing that said who ended what. The
// wrappers (data/bin/chat-wrapper.js, data/bin/pty-wrapper.js) now record the
// child's exit SIGNAL beside its code and, when THEY are signalled, which
// signal (`wrapperSignal`). This module reads that record — the wrapper meta
// (data/session-buffers/<id>.json) — plus the dtach socket's fate at teardown
// into the facts the server's "[session] exited" line, the `session-exited`
// telemetry event and the exit tomb carry. ONE reader, so the line, the event
// and the tomb can never disagree.
//
//   wrapperFate  'signal:<SIG>'  the wrapper was killed by a catchable signal and said so
//                'finalized'     the wrapper saw its child exit and wrote the code/signal
//                'running'       no record, and the wrapper the meta names was STILL ALIVE when
//                                the teardown's bounded wait ran out (r4) — not a SIGKILL
//                'unfinalized'   the wrapper left no record: SIGKILL, a crash before the
//                                write, or a meta that is gone/unreadable
//
// THE READ WAITS FOR THE WRAPPER (r4). In the incident's order the dtach
// MASTER dies first: its death EOFs the server's attach client AND SIGHUPs the
// wrapper — one event, two consequences, racing. node-pty delivers onExit 2–4
// ms after the EOF, the wrapper's record lands ~1–4 ms after the kill (more on
// a FUSE workspace), so a single read at onExit usually saw no record. The
// teardown therefore waits, BOUNDED (`WRAPPER_SETTLE_MS`, polled every
// `WRAPPER_SETTLE_STEP_MS`), while `awaitsWrapper(meta)` holds and the process
// the meta names is still that wrapper; a finalized record (the wrapper saw
// its child exit — it wrote before it exited, and the master exits after it)
// never waits, nor does an absent meta (Terminate unlinked it).
//   socketFate   'present' | 'gone' | 'none' (the session has no dtach socket)
//
// Meta values are written by a process, not trusted: a signal name that is not
// a plain SIGNAME and a code that is not an integer are dropped, so a torn or
// hostile meta can never inject text into a journal line.

const SIG_RE = /^SIG[A-Z0-9]{1,12}$/;

function cleanSignal(v) {
  return typeof v === 'string' && SIG_RE.test(v) ? v : null;
}
function cleanCode(v) {
  return Number.isInteger(v) ? v : null;
}

/** exitFacts({meta, socketPath, socketExists, wrapperRunning, asked, now}) →
 *  {code, signal, wrapperSignal, wrapperFate, socketFate, askedBy, suffix, eventSuffix}.
 *  `suffix` is appended to the "[session] exited" line AFTER its existing
 *  fields (` signal=<sig>` only when present, ` wrapper=…` and ` socket=…`
 *  always, ` asked=<by>` only when VibeSpace asked for the exit — B-f698);
 *  `eventSuffix` is the same facts in the telemetry event's slash-separated
 *  spelling. */
function exitFacts({ meta = null, socketPath = null, socketExists = false, wrapperRunning = false, asked = null, now = Date.now() } = {}) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const code = cleanCode(m.childExitCode);
  const signal = cleanSignal(m.childExitSignal);
  const wrapperSignal = cleanSignal(m.wrapperSignal);
  const wrapperFate = wrapperSignal ? 'signal:' + wrapperSignal
    : (code != null || signal ? 'finalized' : (wrapperRunning ? 'running' : 'unfinalized'));
  const socketFate = socketPath ? (socketExists ? 'present' : 'gone') : 'none';
  const askedBy = askedActor(asked, now);
  const suffix = `${signal ? ' signal=' + signal : ''} wrapper=${wrapperFate} socket=${socketFate}${askedBy ? ' asked=' + askedBy : ''}`;
  const eventSuffix = `${signal ? '/signal=' + signal : ''}/wrapper=${wrapperFate}/socket=${socketFate}${askedBy ? '/asked=' + askedBy : ''}`;
  return { code, signal, wrapperSignal, wrapperFate, socketFate, askedBy, suffix, eventSuffix };
}

// ── WHO ASKED FOR THE EXIT (B-f698) ──────────────────────────────────────────
// A session that VibeSpace itself signals carries `_exitAsked = {by, at}` from
// the moment it asks: 'interrupt' = the composer's Stop, whose last resort is a
// SIGINT 2 s later (src/adapters/claude-code.js postInterrupt — recent CLIs
// EXIT on it); 'terminate' = the Terminate kill case (src/ws-handler.js — it
// deletes the session before the pty's onExit, so the mark is the belt). The
// mark is fresh for EXIT_ASK_FRESH_MS: a Stop the CLI survived must not turn a
// crash an hour later into "asked". The exit line says ` asked=<by>`.
const EXIT_ASK_FRESH_MS = 30 * 1000;
const ASKED_RE = /^[a-z][a-z-]{0,23}$/;
function askedActor(asked, now = Date.now()) {
  if (!asked || typeof asked !== 'object' || typeof asked.by !== 'string' || !ASKED_RE.test(asked.by)) return null;
  if (!Number.isFinite(asked.at) || now - asked.at > EXIT_ASK_FRESH_MS || asked.at - now > EXIT_ASK_FRESH_MS) return null;
  return asked.by;
}

// ── AN UNEXPECTED EXIT, AND WHAT VIBESPACE DOES ABOUT IT (B-f698) ────────────
// 2026-09-24 08:11Z three conversations with work in flight died and nobody
// knew for six hours. Owner 2026-10-02: a CHAT conversation that exits while
// it is working, without a kill the user or VibeSpace asked for, is resumed
// ONCE by itself — nothing is sent into it, so no turn is billed — and the
// owner gets one For-you item; a second unexpected exit only notifies.
//   working  = a turn running (`_isStreaming`) or background tasks the CLI
//              still listed as live (the incident's three were idle between
//              turns with Workflows in flight)
//   died     = the record PROVES the CLI is gone: a non-zero code, a child
//              signal, a signalled wrapper; or no record at all (SIGKILL class)
//              on a LOCAL session — the teardown only runs once the dtach
//              socket is gone. A remote session with no record, or a wrapper
//              still running ('running'), proves nothing: resuming beside a
//              CLI that may still run is two writers on one transcript.
// → {unexpected, action: 'respawn'|'notify'|null, why}
// verify r1: only a Claude conversation on THIS machine is respawned (the owner's YES) — a codex / OpenCode
// conversation or a remote one keeps the base behaviour (its exit bar). The crash loop: a conversation VibeSpace
// respawned that dies again while STARTING (idle, within RESPAWN_STARTUP_MS of the respawn) only notifies.
const RESPAWN_ONCE_MS = 24 * 3600 * 1000;
const RESPAWN_STARTUP_MS = 5 * 60 * 1000;
function unexpectedExitVerdict({ mode = null, backend = 'claude', midTurn = false, facts = null, remote = false, conversationId = null, respawnedAt = null, askedBy = null, now = Date.now() } = {}) {
  const no = (why) => ({ unexpected: false, action: null, why });
  if (mode !== 'chat') return no('not-chat');
  if ((backend || 'claude') !== 'claude') return no('backend:' + backend);
  if (remote) return no('remote');
  if (askedBy) return no('asked:' + askedBy);
  const restarting = Number.isFinite(respawnedAt) && now - respawnedAt >= 0 && now - respawnedAt < RESPAWN_STARTUP_MS;
  if (!midTurn && !restarting) return no('idle');
  const f = facts && typeof facts === 'object' ? facts : {};
  const died = (Number.isInteger(f.code) && f.code !== 0) || !!f.signal || !!f.wrapperSignal
    || (f.wrapperFate === 'unfinalized' && !remote);
  if (!died) return no(f.code === 0 ? 'clean' : f.wrapperFate === 'running' ? 'wrapper-running' : 'unproven');
  if (!conversationId) return { unexpected: true, action: 'notify', why: 'no-conversation' };
  if (Number.isFinite(respawnedAt) && now - respawnedAt < RESPAWN_ONCE_MS) return { unexpected: true, action: 'notify', why: 'again' };
  return { unexpected: true, action: 'respawn', why: 'first' };
}

/** awaitsWrapper(meta) → true when the teardown should wait for the wrapper
 *  the meta names before its one read: the meta names a pid and carries no
 *  FINALIZED record (a `wrapperSignal` record still waits — the dying
 *  wrapper may be flushing its buffer, and the .tail is read next). Whether
 *  that pid is still the wrapper is the ORCH half's question (/proc). */
const WRAPPER_SETTLE_MS = 300;
const WRAPPER_SETTLE_STEP_MS = 20;
function awaitsWrapper(meta) {
  if (!meta || typeof meta !== 'object' || !Number.isInteger(meta.pid) || meta.pid <= 1) return false;
  const finalized = Object.prototype.hasOwnProperty.call(meta, 'childExitCode') && !cleanSignal(meta.wrapperSignal);
  return !finalized;
}

/** The exit tomb's sweep rule: a tomb file (<id>.tail / <id>.meta.json) older
 *  than `maxAgeMs` (7 days) goes. PURE over (mtimeMs, now) so the suite can
 *  judge it without a clock. */
const EXIT_TOMB_MAX_AGE_MS = 7 * 86400e3;
function tombExpired(mtimeMs, now, maxAgeMs = EXIT_TOMB_MAX_AGE_MS) {
  return now - mtimeMs > maxAgeMs;
}

module.exports = { exitFacts, tombExpired, EXIT_TOMB_MAX_AGE_MS, awaitsWrapper, WRAPPER_SETTLE_MS, WRAPPER_SETTLE_STEP_MS,
  askedActor, EXIT_ASK_FRESH_MS, unexpectedExitVerdict, RESPAWN_ONCE_MS, RESPAWN_STARTUP_MS };
