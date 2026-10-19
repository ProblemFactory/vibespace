'use strict';
/**
 * AV1 FOR THE WEBRTC STREAM RUNG — PURE (imports nothing; lane stream-hdr-passthrough — design q-041 r3 P4 road B, owner
 * 2026-10-19 「可以 按你推荐来」). The HDR road's encoder (av1_nvenc, 10-bit PQ) writes IVF on its stdout; the browser's RTP
 * depacketizer wants the AV1 RTP payload format (aomediacodec av1-rtp-spec). This file is that step, and nothing else — the
 * twin of src/stream-h264.js:
 *
 *   obusOf(tu)                 one temporal unit (low-overhead bitstream: OBUs with their obu_size) → [{ type, head, body }]
 *                              (`head` = the OBU header with obu_has_size_field cleared, the extension byte kept)
 *   tuFacts(obus)              → { key, seq }: a KEY_FRAME frame header is in it (show_existing_frame 0, frame_type 0) /
 *                              a sequence header is
 *   rtpPayloads(tu, max)       one temporal unit → { key, payloads: [{ payload, marker }] } — THE PACKETIZER the P4 probe
 *                              wrote and MEASURED (scripts/probes/stream-hdr/webrtc-leg.mjs av1Payloads): temporal delimiters,
 *                              tile lists and padding dropped, every OBU without its size field, the WHOLE temporal unit
 *                              aggregated (W = 0: each element length-prefixed) and cut across packets with Z / Y set PER
 *                              PACKET (Z: its first element continues the last packet's; Y: its last element goes on), N on
 *                              the first packet of a new coded video sequence (a key frame with its sequence header);
 *                              `marker` on the unit's last packet. werift 0.25's own AV1 packetizer sends one OBU a packet
 *                              with no Dependency Descriptor — Chrome then cuts every OBU into its own same-timestamp frame
 *                              ("Failed to combine frames - invalid spatial index order") and decodes nothing (measured)
 *   depacketize(payloads)      the inverse, for the suites (a receiver's view): one unit's payloads → its OBUs
 *   ivfReader()                the encoder's output: IVF (a 32-byte file head, then each frame = u32 size + u64 pts + its
 *                              temporal unit — length-framed, so a picture is whole the moment its bytes are) →
 *                              push(bytes) → [{ type: 'tu', tu, key, seq, ptsMs } | { type: 'bad', error }]; a key unit that
 *                              lacks the sequence header gets the last one seen in front (a browser that joins at a key
 *                              frame needs it — flvReader's SPS/PPS rule)
 *
 * The source hands the stream host `{ tu: Buffer, key, ts90k }` per picture (its H.264 twin: `{ nalus, key, ts90k }`).
 */

const OBU = Object.freeze({ seq: 1, td: 2, frameHeader: 3, tileGroup: 4, metadata: 5, frame: 6, redundant: 7, tileList: 8, padding: 15 });
const MAX_PAYLOAD = 1200; // bytes of RTP payload: src/stream-h264.js's bound (under a 1280-byte path MTU after SRTP + UDP + IP)
const DROPPED = new Set([OBU.td, OBU.tileList, OBU.padding]); // the RTP spec: SHOULD be removed when sent

/** leb128 → its bytes. */
function leb128(n) { const o = []; let v = n; do { let b = v & 127; v = Math.floor(v / 128); if (v) b |= 128; o.push(b); } while (v); return Uint8Array.from(o); }
/** A leb128 at `at` → { value, size } | null (runs off the end or past 8 bytes). */
function readLeb128(b, at) {
  let value = 0;
  for (let i = 0; i < 8; i++) {
    if (at + i >= b.length) return null;
    const x = b[at + i];
    value += (x & 127) * 2 ** (7 * i);
    if (!(x & 128)) return { value, size: i + 1 };
  }
  return null;
}
const cat = (parts) => { const n = parts.reduce((s, p) => s + p.length, 0), out = Buffer.alloc(n); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };

/** One temporal unit → its OBUs (a malformed tail ends the walk: what came before is kept). */
function obusOf(tu) {
  const out = [];
  const b = tu || new Uint8Array(0);
  for (let o = 0; o < b.length;) {
    const h = b[o], type = (h >> 3) & 15, hl = 1 + ((h >> 2) & 1);
    if (o + hl > b.length) break;
    let size = b.length - o - hl, sl = 0;
    if ((h >> 1) & 1) { const l = readLeb128(b, o + hl); if (!l) break; size = l.value; sl = l.size; }
    if (o + hl + sl + size > b.length) break;
    const head = Uint8Array.from(b.subarray(o, o + hl)); head[0] &= ~2;
    out.push({ type, head, body: b.subarray(o + hl + sl, o + hl + sl + size) });
    o += hl + sl + size;
  }
  return out;
}
/** → { key: a KEY_FRAME frame header (shown, not a repeat) is in it, seq: a sequence header is } */
function tuFacts(obus) {
  let key = false, seq = false;
  for (const x of obus || []) {
    if (x.type === OBU.seq) seq = true;
    if ((x.type === OBU.frame || x.type === OBU.frameHeader) && x.body.length) {
      const f = x.body[0]; // uncompressed_header: show_existing_frame f(1), then frame_type f(2) (0 = KEY_FRAME)
      if (!(f & 0x80) && ((f >> 5) & 3) === 0) key = true;
    }
  }
  return { key, seq };
}

/** One temporal unit → { key, payloads: [{ payload, marker }] } (see the header). */
function rtpPayloads(tu, max = MAX_PAYLOAD) {
  const obus = obusOf(tu), { key, seq } = tuFacts(obus), out = [];
  let cur = [], room = max - 1, Z = 0;
  const flush = (Y) => { out.push(cat([Uint8Array.of((Z << 7) | (Y << 6) | ((key && seq && out.length === 0 ? 1 : 0) << 3)), ...cur])); cur = []; room = max - 1; Z = Y; };
  for (const x of obus) {
    if (DROPPED.has(x.type)) continue;
    let rest = cat([x.head, x.body]);
    while (rest.length) {
      const take = Math.min(rest.length, room - leb128(Math.min(rest.length, room)).length);
      if (take <= 0) { flush(0); continue; }
      cur.push(leb128(take), rest.subarray(0, take)); room -= leb128(take).length + take; rest = rest.subarray(take);
      if (rest.length) flush(1);
    }
  }
  if (cur.length) flush(0);
  return { key, payloads: out.map((payload, i) => ({ payload, marker: i === out.length - 1 })) };
}

/** The inverse (a receiver's view): one temporal unit's RTP payloads → its OBUs ({ type, head, body }), or null (malformed). */
function depacketize(payloads) {
  const out = [];
  let part = null; // the element still going on from the last packet
  for (const p of payloads || []) {
    const agg = p[0], Z = agg >> 7, Y = (agg >> 6) & 1, W = (agg >> 4) & 3;
    if (W !== 0) return null; // this packetizer writes W = 0 only
    if (!Z && part) return null;
    const els = [];
    for (let o = 1; o < p.length;) { const l = readLeb128(p, o); if (!l || o + l.size + l.value > p.length) return null; els.push(p.subarray(o + l.size, o + l.size + l.value)); o += l.size + l.value; }
    els.forEach((e, i) => {
      const whole = i === 0 && Z && part ? cat([part, e]) : e;
      if (i === 0 && Z) part = null;
      if (i === els.length - 1 && Y) { part = whole; return; }
      const hl = 1 + ((whole[0] >> 2) & 1);
      out.push({ type: (whole[0] >> 3) & 15, head: Uint8Array.from(whole.subarray(0, hl)), body: whole.subarray(hl) });
    });
  }
  return part ? null : out;
}

/** An incremental IVF reader (see the header). */
function ivfReader() {
  let buf = new Uint8Array(0), head = false, dead = false, lastSeq = null, num = 1, den = 1000;
  const u32 = (b, i) => b[i] + b[i + 1] * 256 + b[i + 2] * 65536 + b[i + 3] * 16777216;
  function push(chunk) {
    if (dead) return [];
    const nb = new Uint8Array(buf.length + chunk.length); nb.set(buf); nb.set(chunk, buf.length); buf = nb;
    const out = [];
    let i = 0;
    if (!head) {
      if (buf.length < 32) return out;
      if (buf[0] !== 0x44 || buf[1] !== 0x4b || buf[2] !== 0x49 || buf[3] !== 0x46) { dead = true; return [{ type: 'bad', error: 'the encoder did not write IVF' }]; }
      i = buf[6] + buf[7] * 256 || 32;
      den = u32(buf, 16) || 1000; num = u32(buf, 20) || 1;
      head = true;
    }
    while (buf.length - i >= 12) {
      const size = u32(buf, i);
      if (buf.length - i < 12 + size) break;
      const pts = u32(buf, i + 4) + u32(buf, i + 8) * 4294967296;
      const tu = buf.slice(i + 12, i + 12 + size);
      i += 12 + size;
      const obus = obusOf(tu), f = tuFacts(obus);
      if (f.seq) { const s = obus.find((x) => x.type === OBU.seq); lastSeq = cat([Uint8Array.of(s.head[0] | 2, ...s.head.subarray(1)), leb128(s.body.length), s.body]); } // with its obu_size again (a low-overhead stream)
      const whole = f.key && !f.seq && lastSeq ? cat([lastSeq, tu]) : tu;
      out.push({ type: 'tu', tu: whole, key: f.key, seq: f.seq || (f.key && !!lastSeq), ptsMs: Math.round((pts * num * 1000) / den) });
    }
    buf = buf.slice(i);
    return out;
  }
  return { push };
}

module.exports = { OBU, MAX_PAYLOAD, leb128, readLeb128, obusOf, tuFacts, rtpPayloads, depacketize, ivfReader };
