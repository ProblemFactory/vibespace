'use strict';
/**
 * THE HDR VIEWER GATE — PURE (imports nothing; lane stream-hdr-passthrough — design q-041 r3 P4 road B, owner 2026-10-19
 * 「可以 按你推荐来」; the numbers: lane stream-hdr-probe's report, SharedContext vibespace-machine-desktop-facts.md «True HDR to
 * the viewer»). The machine desktop's 「HDR 直通」 switch (src/lib/machine-desktop.js) shows only where it can work — decided
 * HERE, so the page, the suites and the record cannot disagree:
 *
 *   HDR_DECODE_QUERY       the mediaCapabilities.decodingInfo question the page asks: WebRTC AV1, 4K60 at 20 Mb/s, BT.2020 + PQ
 *                          (+ SMPTE ST 2086) — the probe's row. MEASURED: Linux Chrome 154 (software dav1d, whose WebRTC decoder
 *                          refuses 10-bit — "unhandled bit depth: 10", 0 frames) answers supported, smooth, NOT power-efficient;
 *                          the owner's Edge 155 (RTX 5090: 116 frames hardware-decoded, bt2020/PQ) and Mac Chrome 155 answer
 *                          all three
 *   hdrViewerVerdict({ dynamicRange, decoding })   → { show, code }: this screen matches (dynamic-range: high) AND the answer
 *                          to HDR_DECODE_QUERY is supported AND power-efficient (= a hardware decoder — every 10-bit WebRTC
 *                          decode measured was one); code ok | sdr_screen | no_hw_av1 | no_api
 *   hdrMachineVerdict(source)   the offer's `hdr` facts ({ can, why } — src/stream-plan.js hdrFactsOf) → may this machine send
 *                          it (its display in Windows HDR, an AV1 10-bit hardware encoder); an agent that says nothing (older
 *                          than this lane) ⇒ no
 *   HDR_KEY / hdrRemembered / rememberHdr   per machine, in this browser: on = true; OFF until the person turns it on (≤ 32
 *                          machines, the newest kept)
 *   HDR_STALL / hdrStallStep(st, page)   THE FALLBACK: while HDR is asked, a picture's bytes keep arriving and no frame is
 *                          decoded for HDR_STALL.ms (2 s) ⇒ `failed` — the page restarts the stream in SDR and says why
 *                          (「HDR 直通已回退：浏览器无法解码」), never a silent black picture. After frames WERE decoded the bound
 *                          is HDR_STALL.midMs (5 s): a lost key frame is waited for up to one GOP (2 s — ffmpeg's CLI cannot
 *                          force one) + its PLI, and that wait is not a decoder that refuses
 */

const HDR_DECODE_QUERY = Object.freeze({
  type: 'webrtc',
  video: Object.freeze({ contentType: 'video/AV1', width: 3840, height: 2160, bitrate: 20e6, framerate: 60, colorGamut: 'rec2020', transferFunction: 'pq', hdrMetadataType: 'smpteSt2086' }),
});
const DYNAMIC_RANGE_QUERY = '(dynamic-range: high)';

/** → { show, code } (see the header). `decoding` = the decodingInfo answer, or null when the browser has no such API. */
function hdrViewerVerdict({ dynamicRange = false, decoding = null } = {}) {
  if (dynamicRange !== true) return { show: false, code: 'sdr_screen' };
  if (!decoding || typeof decoding !== 'object') return { show: false, code: 'no_api' };
  if (decoding.supported !== true || decoding.powerEfficient !== true) return { show: false, code: 'no_hw_av1' };
  return { show: true, code: 'ok' };
}
/** The offer's source → { can, why }: the machine's own word on its HDR road (src/stream-plan.js hdrFactsOf). */
function hdrMachineVerdict(source) {
  const h = source && source.hdr;
  if (!h || typeof h !== 'object') return { can: false, why: 'agent_too_old' };
  return { can: h.can === true, why: h.can === true ? null : typeof h.why === 'string' ? h.why.slice(0, 40) : 'unknown' };
}

// ── THE MEMORY (this browser, per machine) ─────────────────────────────────────────────────────────────────────────────
const HDR_KEY = 'vibespace.streamHdr';
const MEMORY_HOSTS = 32;
const memoryOf = (raw) => { let o = raw; if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } } return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; };
/** The stored memory (localStorage's string, or its object) → is HDR on for this machine (default false). */
function hdrRemembered(raw, hostId) {
  const o = memoryOf(raw), k = String(hostId || '');
  return !!k && Object.prototype.hasOwnProperty.call(o, k) && o[k] === true;
}
/** The memory with this machine on (moved last) or off (forgotten — off is the default) → its JSON string. */
function rememberHdr(raw, hostId, on) {
  const o = memoryOf(raw), k = String(hostId || '').slice(0, 200);
  const keep = Object.entries(o).filter(([h, v]) => h !== k && v === true);
  if (k && on === true) keep.push([k, true]);
  return JSON.stringify(Object.fromEntries(keep.slice(-MEMORY_HOSTS)));
}

// ── THE FALLBACK ───────────────────────────────────────────────────────────────────────────────────────────────────────
const HDR_STALL = Object.freeze({ ms: 2000, midMs: 5000 });
/** One getStats reading (src/stream-model.js statsOf: `frames` = framesDecoded, `bytes` = bytesReceived, `at`) against the
 *  last → { st, failed }. A decoded frame clears the watch; bytes that arrive while no frame is decoded start it (a second
 *  with no bytes changes nothing — a quiet link is not a decoder's refusal); HDR_STALL.ms of it with no frame ever decoded,
 *  HDR_STALL.midMs once some were ⇒ failed. */
function hdrStallStep(st, page) {
  const s = st && typeof st === 'object' ? st : { frames: null, bytes: null, since: null };
  const frames = page && Number.isFinite(page.frames) ? page.frames : null, bytes = page && Number.isFinite(page.bytes) ? page.bytes : null;
  const at = page && Number.isFinite(page.at) ? page.at : null;
  if (frames == null || bytes == null || at == null) return { st: s, failed: false };
  let since = s.since;
  if (s.frames != null && frames > s.frames) since = null;
  else if (bytes > (s.bytes == null ? 0 : s.bytes) && (s.frames == null ? frames === 0 : frames === s.frames) && since == null) since = at;
  const next = { frames, bytes, since };
  return { st: next, failed: since != null && at - since >= (frames > 0 ? HDR_STALL.midMs : HDR_STALL.ms) };
}

module.exports = { HDR_DECODE_QUERY, DYNAMIC_RANGE_QUERY, hdrViewerVerdict, hdrMachineVerdict, HDR_KEY, hdrRemembered, rememberHdr, HDR_STALL, hdrStallStep };
