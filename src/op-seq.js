'use strict';
// THE PER-SESSION OP SEQUENCE (chat pipeline perf lane, chunk D — the one wire
// change). PURE — imports nothing, CJS: server.js's broadcast choke point and
// ws-handler's attach read the same ring; the suites drive it directly.
//
// Why: a same-epoch reconnect used to cost a whole attach slab per window (the
// 19-window storm = 19 × ~600 KB on §1c) and then an HTTP catch-up that
// fetched missed CREATES only — an edit that landed while the socket was down
// (a tool finishing, a streamed answer completing) stayed stale in the view.
// The server already had every frame it sent: the ring keeps the last few
// thousand of them (the serialized text, byte for byte), numbered, so a client
// that knows the last number it RECEIVED asks for the rest and the server
// replays exactly those frames instead of a slab.
//
// A second use of the same number: a client whose socket stops draining (a
// wedged tab, a slow link — inc-msp3klen's 14.5-minute late reply) used to
// accumulate an UNBOUNDED send queue on the server. A client that advertised
// the capability now gets ONE `lagged` frame naming where it fell off, nothing
// more for that session, and resumes by seq when it re-attaches.
//
// Bounds (memory stays per-session bounded — invariant 6): `cap` frames, and
// `maxBytes` of serialized text (streamed edits carry the whole content each
// time, so a count alone does not bound bytes). The ring never holds anything
// that was not already sent.

const OP_RING = Object.freeze({
  cap: 2000,
  maxBytes: 4 * 1024 * 1024,
});

// The send-queue limit past which a capable client is cut and told `lagged`.
// 4 MiB ≈ two full attach slabs (text-window.js bounds one at 2 MiB): a
// healthy tab on a slow link drains that; a wedged one never does.
const LAGGED_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * createOpRing({cap, maxBytes}) → {
 *   push(msg) → {seq, frame}   stamps the NEXT seq on a shallow copy of msg,
 *                              serializes it ONCE, keeps the text, returns both
 *   since(seq) → {ops: string[], seq}          every frame after `seq`, in order
 *              | {ops: null, lagged: true, oldest, seq}   `seq` fell off the ring
 *                                                          (or is not one of ours)
 *   reset()                     forget every frame (the normalizer was rebuilt:
 *                              its ids renumbered, the old frames mean nothing)
 *   seq                         the last number handed out (monotonic for the
 *                              ring's life — a reset never reuses one)
 *   oldest                      the first seq still held (seq + 1 when empty)
 *   size, bytes                 what it holds
 * }
 */
function createOpRing({ cap = OP_RING.cap, maxBytes = OP_RING.maxBytes } = {}) {
  const c = Math.max(1, Math.floor(Number(cap) || OP_RING.cap));
  const mb = Math.max(1, Math.floor(Number(maxBytes) || OP_RING.maxBytes));
  let seq = 0;
  let frames = [];   // [{seq, frame}] in seq order
  let head = 0;      // index of the oldest live entry (amortized shift)
  let bytes = 0;
  const live = () => frames.length - head;
  const compact = () => { if (head > 1024 && head * 2 > frames.length) { frames = frames.slice(head); head = 0; } };
  const evict = () => { const e = frames[head]; frames[head] = undefined; head++; bytes -= e.frame.length; };
  const ring = {
    push(msg) {
      const s = ++seq;
      const frame = JSON.stringify({ ...msg, seq: s });
      frames.push({ seq: s, frame });
      bytes += frame.length;
      // keep at least the newest frame whatever its size: a replay that cannot
      // hold ONE frame would turn every reconnect after a big card into a slab
      while (live() > c || (bytes > mb && live() > 1)) evict();
      compact();
      return { seq: s, frame };
    },
    since(after) {
      const a = Number(after);
      const oldest = live() ? frames[head].seq : seq + 1;
      // a number we never handed out (a future seq, a negative, not a number)
      // is not covered — the caller falls back to the full attach
      if (!Number.isInteger(a) || a < 0 || a > seq) return { ops: null, lagged: true, oldest, seq };
      if (a === seq) return { ops: [], seq };
      if (a + 1 < oldest) return { ops: null, lagged: true, oldest, seq };
      const out = [];
      for (let i = head + (a + 1 - oldest); i < frames.length; i++) out.push(frames[i].frame);
      return { ops: out, seq };
    },
    reset() { frames = []; head = 0; bytes = 0; },
    get seq() { return seq; },
    get oldest() { return live() ? frames[head].seq : seq + 1; },
    get size() { return live(); },
    get bytes() { return bytes; },
  };
  return ring;
}

/**
 * laggedVerdict({bufferedAmount, limitBytes}) → {lagged, bufferedAmount, limitBytes}
 * A client is lagged when its socket's unsent queue is strictly above the
 * limit. A missing / non-numeric reading is NOT a verdict (a fake or foreign
 * socket without bufferedAmount keeps today's delivery).
 */
function laggedVerdict({ bufferedAmount, limitBytes = LAGGED_LIMIT_BYTES } = {}) {
  const b = Number(bufferedAmount);
  const lim = Number(limitBytes) > 0 ? Number(limitBytes) : LAGGED_LIMIT_BYTES;
  if (!Number.isFinite(b) || b < 0) return { lagged: false, bufferedAmount: null, limitBytes: lim };
  return { lagged: b > lim, bufferedAmount: b, limitBytes: lim };
}

/**
 * resumeVerdict({ring, normEpoch, sinceSeq, sinceEpoch}) → the attach's rung:
 *   {held: true, replay: string[], opSeq}          same epoch, the ring covers it
 *   {held: false, why, opSeq}                       the full attach (today's payload)
 * `why` ∈ 'no-since' | 'epoch' | 'no-ring' | 'outside-ring'.
 */
function resumeVerdict({ ring, normEpoch, sinceSeq, sinceEpoch } = {}) {
  const opSeq = ring ? ring.seq : 0;
  if (sinceSeq === undefined || sinceSeq === null || sinceEpoch === undefined || sinceEpoch === null) return { held: false, why: 'no-since', opSeq };
  if (!normEpoch || sinceEpoch !== normEpoch) return { held: false, why: 'epoch', opSeq };
  if (!ring) return { held: false, why: 'no-ring', opSeq };
  const r = ring.since(sinceSeq);
  if (!r.ops) return { held: false, why: 'outside-ring', opSeq, oldest: r.oldest };
  return { held: true, replay: r.ops, opSeq: r.seq };
}

/**
 * attachedWithReplay(payload, replay) → the `attached` frame TEXT carrying the
 * ring's frames VERBATIM: `payload` serialized once, the replay spliced in as
 * the raw JSON it already is (no parse, no re-serialization — the bytes a
 * resumed client applies are the bytes a connected client got).
 */
function attachedWithReplay(payload, replay) {
  const head = JSON.stringify(payload);
  const body = Array.isArray(replay) ? replay.join(',') : '';
  return head === '{}' ? `{"replay":[${body}]}` : `${head.slice(0, -1)},"replay":[${body}]}`;
}

const OP_SEQ_CAP = 'op-seq';

module.exports = { OP_RING, LAGGED_LIMIT_BYTES, OP_SEQ_CAP, createOpRing, laggedVerdict, resumeVerdict, attachedWithReplay };
