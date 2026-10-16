'use strict';
/**
 * H.264 FOR THE WEBRTC STREAM RUNG — PURE (imports nothing; design q-041 r2 §2 传输, lane stream-p1a-transport). The
 * encoded picture reaches the daemon as Annex-B (start codes — what NVENC / AMF / QSV / x264 write, and the fake source's
 * fixture); the browser's RTP depacketizer wants RFC 6184 payloads. This file is that one step, and nothing else:
 *
 *   splitNalus(buf)            Annex-B bytes → the NAL units (start codes dropped, empty units skipped)
 *   accessUnits(nalus)         NAL units → access units (one picture each: SPS/PPS/SEI ride with the slice they precede;
 *                              an access unit delimiter starts one and is NOT sent) — `{ nalus, key }`, key = holds an IDR
 *   rtpPayloads(nalus, max)    one access unit → RTP payloads in PACKETIZATION MODE 1 (the only mode the SDP offers):
 *                              a NAL unit that fits is sent as itself (single NAL unit packet); a larger one is cut into
 *                              FU-A fragments (RFC 6184 §5.8). `marker` is set on the access unit's LAST packet — the
 *                              receiver's frame boundary. STAP-A is never written (it saves ~2 packets per key frame; the
 *                              decoders take parameter sets as single NAL units the same)
 *   keyIndexAfter(aus, i)      the next access unit at or after `i` that is a key frame — what a keyframe request (PLI /
 *                              FIR from the browser) jumps a pre-encoded source to
 *
 * The SOURCE INTERFACE part B fills (src/agentd/stream-host.js `sourceKind: 'screen'`) hands the daemon access units the
 * same shape: `{ nalus: Buffer[], key: boolean, ts90k: number }`.
 */

const NAL = Object.freeze({ slice: 1, idr: 5, sei: 6, sps: 7, pps: 8, aud: 9 });
const MAX_PAYLOAD = 1200; // bytes of RTP payload: under a 1280-byte path MTU after SRTP + UDP + IP (werift's own default)

const typeOf = (nal) => nal[0] & 0x1f;
const isVcl = (t) => t >= 1 && t <= 5;

/** Annex-B bytes → NAL units (views into `buf`, never copies). 3- and 4-byte start codes both count. */
function splitNalus(buf) {
  const out = [];
  const n = buf ? buf.length : 0;
  let i = 0, start = -1;
  while (i + 2 < n) {
    if (buf[i] === 0 && buf[i + 1] === 0 && (buf[i + 2] === 1 || (buf[i + 2] === 0 && i + 3 < n && buf[i + 3] === 1))) {
      if (start >= 0) out.push(buf.subarray(start, i));
      i += buf[i + 2] === 1 ? 3 : 4;
      start = i;
      continue;
    }
    i++;
  }
  if (start >= 0 && start < n) out.push(buf.subarray(start));
  // a trailing zero byte belongs to the next start code (00 00 00 01): trim it from the unit before
  return out.map((u) => { let e = u.length; while (e > 1 && u[e - 1] === 0) e--; return e === u.length ? u : u.subarray(0, e); }).filter((u) => u.length > 0);
}

/** NAL units → access units. A new picture starts at an AUD / SPS / PPS / SEI after a slice, or at a slice whose
 *  first_mb_in_slice is 0 (its first coded bit is 1 — ue(v) 0) after a slice. */
function accessUnits(nalus) {
  const aus = [];
  let cur = [], hasVcl = false;
  const flush = () => { if (cur.length) aus.push({ nalus: cur, key: cur.some((x) => typeOf(x) === NAL.idr) }); cur = []; hasVcl = false; };
  for (const nal of nalus || []) {
    const t = typeOf(nal);
    const firstMb0 = isVcl(t) && nal.length > 1 && (nal[1] & 0x80) !== 0;
    if (hasVcl && (t === NAL.aud || t === NAL.sps || t === NAL.pps || t === NAL.sei || firstMb0)) flush();
    if (t === NAL.aud) continue;
    cur.push(nal);
    if (isVcl(t)) hasVcl = true;
  }
  flush();
  return aus;
}

/** One access unit's NAL units → RTP payloads `{ payload, marker }` (packetization-mode 1: single NAL unit / FU-A). */
function rtpPayloads(nalus, max = MAX_PAYLOAD) {
  const out = [];
  const list = nalus || [];
  list.forEach((nal, idx) => {
    const last = idx === list.length - 1;
    if (nal.length <= max) { out.push({ payload: nal, marker: last }); return; }
    const head = nal[0], indicator = (head & 0xe0) | 28, t = head & 0x1f, body = nal.subarray(1), size = max - 2;
    for (let off = 0; off < body.length; off += size) {
      const end = Math.min(body.length, off + size);
      const fuHeader = (off === 0 ? 0x80 : 0) | (end >= body.length ? 0x40 : 0) | t;
      out.push({ payload: Buffer.concat([Buffer.from([indicator, fuHeader]), body.subarray(off, end)]), marker: last && end >= body.length });
    }
  });
  return out;
}

/** The inverse, for the suites (a receiver's view): RTP payloads of one access unit → its NAL units. */
function depacketize(payloads) {
  const out = [];
  let fu = null;
  for (const p of payloads || []) {
    const t = p[0] & 0x1f;
    if (t !== 28) { out.push(p); continue; }
    const h = p[1];
    if (h & 0x80) fu = [Buffer.from([(p[0] & 0xe0) | (h & 0x1f)])];
    if (fu) fu.push(p.subarray(2));
    if (fu && (h & 0x40)) { out.push(Buffer.concat(fu)); fu = null; }
  }
  return out;
}

/** The next key access unit at or after index `i` (wrapping once), or -1 when the source holds none. */
function keyIndexAfter(aus, i) {
  const n = aus ? aus.length : 0;
  for (let k = 0; k < n; k++) { const j = (i + k) % n; if (aus[j].key) return j; }
  return -1;
}

module.exports = { NAL, MAX_PAYLOAD, typeOf, splitNalus, accessUnits, rtpPayloads, depacketize, keyIndexAfter };
