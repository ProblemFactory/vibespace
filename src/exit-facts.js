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

/** exitFacts({meta, socketPath, socketExists}) →
 *  {code, signal, wrapperSignal, wrapperFate, socketFate, suffix, eventSuffix}.
 *  `suffix` is appended to the "[session] exited" line AFTER its existing
 *  fields (` signal=<sig>` only when present, ` wrapper=…` and ` socket=…`
 *  always); `eventSuffix` is the same three facts in the telemetry event's
 *  slash-separated spelling. */
function exitFacts({ meta = null, socketPath = null, socketExists = false, wrapperRunning = false } = {}) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const code = cleanCode(m.childExitCode);
  const signal = cleanSignal(m.childExitSignal);
  const wrapperSignal = cleanSignal(m.wrapperSignal);
  const wrapperFate = wrapperSignal ? 'signal:' + wrapperSignal
    : (code != null || signal ? 'finalized' : (wrapperRunning ? 'running' : 'unfinalized'));
  const socketFate = socketPath ? (socketExists ? 'present' : 'gone') : 'none';
  const suffix = `${signal ? ' signal=' + signal : ''} wrapper=${wrapperFate} socket=${socketFate}`;
  const eventSuffix = `${signal ? '/signal=' + signal : ''}/wrapper=${wrapperFate}/socket=${socketFate}`;
  return { code, signal, wrapperSignal, wrapperFate, socketFate, suffix, eventSuffix };
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

module.exports = { exitFacts, tombExpired, EXIT_TOMB_MAX_AGE_MS, awaitsWrapper, WRAPPER_SETTLE_MS, WRAPPER_SETTLE_STEP_MS };
