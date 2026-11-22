'use strict';
/**
 * B-23e5 line 311's musts — 主开发 r2221 / r2222 / r2299 LAW A (final): ONE WRITE OF ONE FILE AT A TIME, AT THE HUB.
 *
 * A1. A write ends in ONE of three: LANDED (the storage said so for THIS write); FAILED (the storage's own error for THIS write —
 *     nothing written — or a write that NEVER STARTED); UNKNOWN (everything else: its own deadline, a sibling's deadline, a restarted
 *     worker, the hub's timer on a device request, a link that broke).
 * A2. One queue a file (the path AS ASKED, with its machine — A6: two names of one file are two queues, a limit said in the kb):
 *     a write starts only after the one before it ENDED in any of the three; UNKNOWN never holds the file. The release had no order
 *     at all between two saves of one file; this gives it for every write the storage ANSWERS.
 * A3. UNKNOWN is said as unknown («it may have been saved»), never «not saved» — the page then keeps one standing line.
 * The reply of a write that LANDED names the text it saved — its length and digest (`digestOf`, the same function as the page's
 * src/lib/file-explorer-ops.js `textDigest`) — so a page compares it with its box (law 2). PURE of the routes.
 */

const BOUND_MS = 30000;   // the hub's bound on the telling's ANSWER (src/routes/editor.js) — shorter than the page's 45 s
const files = new Map();   // key → the tail of that file's writes

/** The digest of a text, identical on the hub and the page (cyrb53 over UTF-16 code units — a plain-http page has no Web Crypto). */
function digestOf(text) {
  const s = String(text);
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const savedOf = (text) => ({ length: String(text).length, digest: digestOf(text) });

/** A1: where a refused write ended — 'never' (it never started: FAILED), 'unknown' (it may have run), or 'failed' (the storage's own
 *  error for THIS write). The pool marks its rejections (src/safe-fs.js `neverStarted` / `mayHaveRun` / `deadline`); a paired
 *  machine's road marks its own (src/remote-fs.js `writeUnknown`). */
function outcomeOf(e) {
  if (!e) return 'failed';
  if (e.neverStarted) return 'never';
  if (e.writeUnknown || e.mayHaveRun || e.deadline || e.safeFsTimeout) return 'unknown';
  return 'failed';
}
const answerOf = (e, machine) => {
  const k = outcomeOf(e);
  if (k === 'never') return { status: 503, body: { error: 'not saved: it never started', code: 'write_never_started' } };
  if (k === 'unknown') return { status: 503, body: { error: `the write to ${machine} did not answer — it may have been saved`, code: 'write_unknown', params: { machine } } };
  return null;   // FAILED by the storage's own error: the road's own words
};

/** One write of one file, in that file's queue: `run()` starts after the write before it ENDED (landed, failed or unknown). */
function orderedWrite(key, run) {
  const prev = files.get(key) || Promise.resolve();
  const answer = prev.then(() => run());
  const tail = answer.then(() => {}, () => {});
  files.set(key, tail);
  tail.then(() => { if (files.get(key) === tail) files.delete(key); });
  return answer;
}

module.exports = { BOUND_MS, digestOf, savedOf, outcomeOf, answerOf, orderedWrite };
