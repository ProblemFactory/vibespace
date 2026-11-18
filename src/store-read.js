'use strict';
// THE STORE READ (B-f276, lane bl-jobs 2026-11-17) — PURE: what ONE read of a store answers. No fs, no clock, no log: the
// caller reads (its own fs call, on its own thread) and hands the outcome here.
//
// A read has THREE answers, and only one of them is «no records»:
//   data        the bytes were read and parse to the store's shape        → load them
//   missing     ENOENT — the file is not there                            → start empty
//   unreadable  the READ failed (EIO, EACCES, ETIMEDOUT, ELOOP, EISDIR, …) → NO ANSWER: the caller refuses every write to that
//               store until a read answers, says so once, and reads again (never set aside, never «empty»)
// Only bytes that were READ and do not parse (or parse to the wrong shape) are CORRUPT — the fourth, passing state: the caller
// sets them aside beside the store and hands the outcome to `afterSetAside`: safe beside it ⇒ missing (start empty, the name
// said); not safe (the rename AND the copy failed) ⇒ unreadable (the live file is those bytes' only copy — never written over).
//
// The release's loaders mixed these up: a failed read set the LIVE file aside (jobs.json on a storage hiccup: its records
// became skeletons, then gone) or started empty and let the next save write over a healthy file. scripts/test-store-write-census.mjs
// ⑧ holds the census of every store's read as a ratchet.

const codeOf = (e) => String((e && (e.code || e.name || e.message)) || 'unreadable').slice(0, 60);

/** ONE read's outcome → its answer. `read` = {text} (what the read returned) or {error} (what the read threw).
 *  opts.parse (default JSON.parse) · opts.valid(value) → is it the store's shape (default: anything that parses) */
function storeAnswer(read, { parse = JSON.parse, valid = () => true } = {}) {
  if (!read || typeof read !== 'object' || (!('text' in read) && !('error' in read))) return { state: 'unreadable', code: 'no read', why: 'nothing was read', writable: false };
  if (read.error != null) {
    const code = codeOf(read.error);
    if (read.error.code === 'ENOENT') return { state: 'missing', writable: true };
    return { state: 'unreadable', code, error: read.error, why: 'the read failed', writable: false };
  }
  let value;
  try { value = parse(String(read.text)); } catch (e) { return { state: 'corrupt', code: 'did not parse', error: e, why: 'did not parse', writable: false }; }
  let ok = false;
  try { ok = !!valid(value); } catch { ok = false; }
  if (!ok) return { state: 'corrupt', code: 'not the expected shape', error: null, why: 'not the expected shape', writable: false };
  return { state: 'data', value, writable: true };
}

/** a CORRUPT answer after the caller's set-aside: `name` = where its bytes are now (a basename), or null when they could not
 *  be put anywhere → missing (with `setAside`) or unreadable. Any other answer passes through unchanged. */
function afterSetAside(answer, name) {
  if (!answer || answer.state !== 'corrupt') return answer;
  if (name) return { state: 'missing', setAside: String(name), why: answer.why, writable: true };
  return { state: 'unreadable', code: 'not set aside', error: answer.error, why: `${answer.why} and could not be set aside`, writable: false };
}

/** the wait before read try `n` (1, 2, …) of an unreadable store: `firstMs` doubling, never past `maxMs` */
function retryDelay(n, { firstMs = 30_000, maxMs = 300_000 } = {}) {
  const k = Math.max(1, Math.floor(Number(n) || 1));
  return Math.min(maxMs, firstMs * 2 ** Math.min(k - 1, 20));
}

module.exports = { storeAnswer, afterSetAside, retryDelay, codeOf };
