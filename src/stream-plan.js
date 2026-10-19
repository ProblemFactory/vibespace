'use strict';
/**
 * THE SCREEN SOURCE'S PLAN — PURE (imports only src/stream-window.js — the one window shape, int304; design q-041 r2 §2 采集/映射+编码 + §3 P1, lane stream-p1b-screen; the P0
 * calibration /var/tmp/vibespace-lanes/desktop-design/q034-probe/report.md §2). The daemon's screen source
 * (src/agentd/stream-screen.js) runs what THIS file decides, so the mapping the suites prove is the mapping that runs:
 *
 *   THE COLOUR MAPPING   DDA's FP16 frame is linear sRGB × (SDR white / 80 nits) — scRGB (measured: the owner's 200-nit white
 *                        reads 2.5). Exact SDR = ÷ (white / 80) → the sRGB OETF; a value above SDR white goes through
 *                        toneCurve. One FP16 channel is 16 bits, so the whole mapping is a 65 536-entry table per white
 *                        level (buildLut) — the frame loop (nv12FromHalf) is three lookups per pixel, never float maths, and
 *                        the table IS mapLinear, so the gate over mapLinear is the gate over the frames.
 *   toneCurve            8-bit SDR has no code above SDR white, so an exact SDR desktop and highlight detail exclude each
 *                        other: knee 1 (the default) = exact SDR, a highlight above white clips to white; knee < 1 = a
 *                        Reinhard-extended shoulder from the knee to `peak` (C1 at the knee) — highlights keep detail, the
 *                        SDR values above the knee give up their exactness. Parametric, never automatic.
 *   CALIBRATION          17 patch centres of the owner's real FP16 capture (cal2-half.raw, white 2500 = 200 nits): the
 *                        11 greys + R G B C M Y, their measured half-float bits → the sRGB the window drew. Exact.
 *   ENCODER_LADDER       h264_nvenc → h264_amf → h264_qsv → libx264, chosen from the installed ffmpeg's `-encoders`;
 *                        constrained baseline, no B-frames, CBR, a GOP of two seconds (pickEncoder)
 *   parseFfmpegFacts     `ffmpeg -version` / `-filters` / `-encoders` → { version, major, ddagrab, encoders } and
 *                        ffmpegVerdict (≥ 7 with ddagrab, else `no_ffmpeg` naming where it was looked for — ffmpegCandidates)
 *   STREAM_FACTS_PS      the machine's screen facts script (DisplayConfig: each display's HDR state + SDR white level + the
 *                        monitor's own name; DXGI: which adapter/output ddagrab must open; Screen: bounds) → parseStreamFacts;
 *                        screenDisplayRows(facts) = the offer's display rows (lane desktop-display-modes: the switcher's)
 *   ONE STILL            (lane desktop-handover) stillArgv / stillHalfArgv — one frame of the stream's capture as a PNG (SDR) or as
 *                        its FP16 bits → rgbFromHalf (THE table) → pngOf; pngSize reads a PNG's IHDR
 *   planScreen           facts + the asked display → { mode: 'direct' (an SDR display: DDA's 8-bit picture is the screen
 *                        already) | 'mapped' (an HDR display: FP16 → the agent's mapping → NV12 → the encoder), the two
 *                        argvs, origin, encoder } or a refusal by name (no_ffmpeg, display_gone, display_other_gpu,
 *                        no_white_level, no_encoder); `share` N (lane desktop-display-modes: ② — N displays in one window)
 *                        maps an HDR display at every k-th pixel (mappedStepOf; `step`, `scaled`; scaledInputOf for the pointer)
 *   THE HDR ROAD         (lane stream-hdr-passthrough — q-041 r3 P4 road B, owner 2026-10-19) `hdr: true` on an HDR display with an
 *                        AV1 10-bit hardware encoder (HDR_LADDER: av1_nvenc) ⇒ mode `hdr`: the same FP16 capture → THE PQ MAPPING
 *                        (scRGB is absolute, 1.0 = 80 nits, and so is PQ: the machine's picture passes through at its own nits —
 *                        linear BT.709 → BT.2020 (BT.2087) → the ST 2084 OETF → BT.2020-NCL Y'CbCr, 10-bit limited, P010:
 *                        buildPqTables + p010FromHalf) → av1_nvenc → IVF (hdrEncodeArgv: the frames TAGGED bt2020 / PQ — an
 *                        output tag that differs from the frames' makes ffmpeg insert a CPU conversion, measured); `sdr` = the
 *                        plan the session falls back to when the browser's answer carries no AV1; hdrFactsOf = the offer's word
 *                        on it ({ can, why }) whether asked or not
 *   kbpsDecision         one rate step with hysteresis (ffmpeg's CLI cannot change a bitrate live): at most once per 5 s, only on
 *                        a ≥ 25 % move, never under the source's `floor` (MAC_KBPS_RULE: VideoToolbox's live step — 1 s, 10 %)
 *   THE RATE             EVERY road (lane stream-window-fixes: a Windows window; lane stream-mac-rate: the Mac, a Windows screen): a floor
 *                        sized by the picture (KBPS_FLOOR — its pixels × its rate), werift's estimate judged against what the
 *                        source SENT (rateDecision — an echo changes nothing; a held shortfall steps down; a quiet spell climbs
 *                        back), one session's bookkeeping (rateFollower); the roads differ only in their step and climb
 *                        (RATE_RULE — a restart costs a key frame; MAC_RATE_RULE — VideoToolbox follows `bps` live); THE
 *                        ESTIMATE it judges, made right (twccPackets + sendEstimator — werift 0.25's counts ~one packet a picture)
 *   planWindow           ONE WINDOW (lane stream-p2w-build): the vibespace-wgc helper's build recipe (wgcBuildPlan — csc on the
 *                        machine), its frame head (wgcHead) and lines (wgcLine), the window's road (BGRA exact SDR by default,
 *                        FP16 → THE table on an HDR display when asked), the capture + encoder argvs (wgcCaptureArgv,
 *                        windowEncodeArgv) — or a refusal by name (helper_missing, no_ffmpeg, window_gone, no_encoder);
 *                        its RATE: THE RATE below at the window's size, and an intra-refresh wave instead of a periodic IDR
 *                        (WINDOW_REFRESH)
 *   GONE MEANS GONE      (lane stream-fallback-never-silent) a capture that died is judged by the facts: display_gone only
 *                        when two reads that succeeded lack it, 1 s apart (judgeGone); else the source captures again in
 *                        place, twice a minute at most (captureRestart), then ends capture_interrupted
 *   flvReader            the encoder's output: FLV (length-framed — an Annex-B pipe only shows a picture's end when the NEXT
 *                        one starts, a frame of latency) → access units { nalus, key, tsMs }, SPS/PPS put in front of every
 *                        key frame (a browser that joins at a key frame needs them; FLV carries them once)
 *   THE MAC (lane stream-p3m-build) planScreen's darwin branch = planMacScreen: ONE helper (tools/vibespace-screen —
 *                        ScreenCaptureKit + VideoToolbox + CGEvent) at a FIXED path (macHelperPaths), spawned DISCLAIMED
 *                        (macHelperSpawn), built on the Mac (macBuildPlan) or pushed prebuilt; its facts (parseMacFacts);
 *                        the whole display or ONE window (windowSourceOf — the `source: 'window'` shape) on the size ladder
 *                        (MAC_LADDER: 1440p60 / 4K30 — measured); no mapping road (SCK hands sRGB exact); the input's
 *                        target from where the picture sits (macInputTarget → macPoint, global points)
 */
const SW = require('./stream-window.js');

// ── THE COLOUR MAPPING ───────────────────────────────────────────────────────────────────────────────────────────────
/** IEEE half bits → number (Infinity for ±inf, NaN for NaN; sign kept). */
function halfToFloat(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0x1f) return m ? NaN : s * Infinity;
  return s * (e ? (1 + m / 1024) * 2 ** (e - 15) : m * 2 ** -24);
}
/** The sRGB OETF (IEC 61966-2-1): linear [0, 1] → encoded [0, 1]. */
const srgbOetf = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const TONE_DEFAULT = Object.freeze({ knee: 1, peak: 4 });
/** Linear relative to SDR white (1 = white) → [0, 1]. Below the knee: unchanged. Above: knee 1 ⇒ 1 (clip); knee < 1 ⇒
 *  knee + (1 − knee)·r(t), t = (x − knee)/(1 − knee), r(t) = t(1 + t/T²)/(1 + t), T = (peak − knee)/(1 − knee): r(0) = 0,
 *  r'(0) = 1 (no kink at the knee), r(T) = 1 (`peak` × SDR white lands on white). Negative / NaN (out-of-gamut scRGB) ⇒ 0. */
function toneCurve(x, { knee = TONE_DEFAULT.knee, peak = TONE_DEFAULT.peak } = {}) {
  if (!(x > 0)) return 0;
  if (x <= knee) return x;
  if (knee >= 1) return 1;
  const t = (x - knee) / (1 - knee), T = Math.max(1e-6, (Math.max(peak, 1) - knee) / (1 - knee));
  return Math.min(1, knee + (1 - knee) * (t * (1 + t / (T * T))) / (1 + t));
}
/** scRGB linear (1 = 80 nits) → encoded sRGB [0, 1]. `white` = DisplayConfig's SDRWhiteLevel (1000 = 80 nits; the owner's
 *  slider at 200 nits reads 2500). */
function mapLinear(v, { white = 1000, knee = TONE_DEFAULT.knee, peak = TONE_DEFAULT.peak } = {}) {
  return srgbOetf(toneCurve(v / (white / 1000), { knee, peak }));
}
/** One FP16 channel (its bits) → the 8-bit sRGB code. */
const srgb8OfHalf = (h, o) => Math.round(255 * mapLinear(halfToFloat(h), o));
/** THE TABLE: every FP16 bit pattern → its 8-bit sRGB code, for one white level and curve. */
function buildLut(o = {}) {
  const lut = new Uint8Array(65536);
  for (let h = 0; h < 65536; h++) lut[h] = srgb8OfHalf(h, o);
  return lut;
}

// ── RGB → NV12 (BT.709, limited range — what the encoder's VUI then says) ───────────────────────────────────────────
const KR = 0.2126, KB = 0.0722, KG = 1 - KR - KB;
const FIX = (v) => Math.round(v * 65536);
const YC = Object.freeze([FIX((219 / 255) * KR), FIX((219 / 255) * KG), FIX((219 / 255) * KB)]);
const UC = Object.freeze([FIX((-224 / 255) * KR / (2 * (1 - KB))), FIX((-224 / 255) * KG / (2 * (1 - KB))), FIX((224 / 255) * 0.5)]);
const VC = Object.freeze([FIX((224 / 255) * 0.5), FIX((-224 / 255) * KG / (2 * (1 - KR))), FIX((-224 / 255) * KB / (2 * (1 - KR)))]);
const Y_ADD = (16 << 16) + 32768, C_ADD = (128 << 18) + (1 << 17); // chroma sums 2×2 pixels: four times the weight ⇒ >> 18
/** THE FRAME LOOP: rgbaf16le (a Uint16Array of its bits, `w` pixels a row) → NV12 of the even part (`out` = ⌊w⌋₂·⌊h⌋₂·3/2
 *  bytes), the mapping as three table lookups per pixel, chroma from each 2×2 block's mean. → the bytes written */
function nv12FromHalf(src, w, h, lut, out, step = 1) {
  // lane desktop-display-modes: `step` k > 1 = every k-th pixel of every k-th row (a k-times smaller picture: ② on the HDR road)
  const k = Math.max(1, step | 0), W = Math.floor(w / k) & ~1, H = Math.floor(h / k) & ~1, uv = W * H, [yr, yg, yb] = YC, [ur, ug, ub] = UC, [vr, vg, vb] = VC;
  const px = 4 * k;
  for (let y = 0; y < H; y += 2) {
    let i0 = y * k * w * 4, i1 = (y + 1) * k * w * 4, o0 = y * W, o1 = o0 + W, c = uv + (y >> 1) * W;
    for (let x = 0; x < W; x += 2) {
      const r0 = lut[src[i0]], g0 = lut[src[i0 + 1]], b0 = lut[src[i0 + 2]], r1 = lut[src[i0 + px]], g1 = lut[src[i0 + px + 1]], b1 = lut[src[i0 + px + 2]];
      const r2 = lut[src[i1]], g2 = lut[src[i1 + 1]], b2 = lut[src[i1 + 2]], r3 = lut[src[i1 + px]], g3 = lut[src[i1 + px + 1]], b3 = lut[src[i1 + px + 2]];
      out[o0] = (yr * r0 + yg * g0 + yb * b0 + Y_ADD) >> 16; out[o0 + 1] = (yr * r1 + yg * g1 + yb * b1 + Y_ADD) >> 16;
      out[o1] = (yr * r2 + yg * g2 + yb * b2 + Y_ADD) >> 16; out[o1 + 1] = (yr * r3 + yg * g3 + yb * b3 + Y_ADD) >> 16;
      const R = r0 + r1 + r2 + r3, G = g0 + g1 + g2 + g3, B = b0 + b1 + b2 + b3;
      out[c] = (ur * R + ug * G + ub * B + C_ADD) >> 18; out[c + 1] = (vr * R + vg * G + vb * B + C_ADD) >> 18;
      i0 += 2 * px; i1 += 2 * px; o0 += 2; o1 += 2; c += 2;
    }
  }
  return uv + uv / 2;
}
const nv12Bytes = (w, h) => (w & ~1) * (h & ~1) * 3 / 2;

// ── THE HDR ROAD's MAPPING (lane stream-hdr-passthrough — the P4 probe's recipe, report §Leg 3 «What src/stream-plan.js's mapper
// would need») ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// PASSTHROUGH: scRGB is absolute (1.0 = 80 nits) and so is PQ, so the machine's own picture travels at its own luminance — its
// SDR white at the owner's slider (200 nits reads 2.5), a highlight at its nits — no white level, no tone curve (PQ reaches
// 10 000 nits). BT.2020 primaries (the HDR10 signal the probe's eye test saw bright and band-free in the owner's Edge): the
// linear BT.709 values go through BT.2087's 3×3 BEFORE the OETF, so a wide-gamut scRGB value (a negative channel) keeps its
// colour instead of clipping; the channels then mix, so the table is two: FP16 bits → linear (65 536 floats) and float32 bits
// >>> 13 → the PQ signal (2^19 floats — buckets ≤ 2^-11 apart: < 0.1 of a 10-bit code), three lookups + a 3×3 per pixel.
const PQ = Object.freeze({ m1: 0.1593017578125, m2: 78.84375, c1: 0.8359375, c2: 18.8515625, c3: 18.6875, peakNits: 10000 });
const SCRGB_NITS = 80;
const BT709_TO_BT2020 = Object.freeze([0.627403896, 0.329283039, 0.043313065, 0.069097289, 0.919540395, 0.011362316, 0.016391439, 0.088013308, 0.895595253]);
const BT2020 = Object.freeze({ kr: 0.2627, kg: 0.678, kb: 0.0593 });
/** What the encoder's bitstream says (the frames are tagged with it — hdrEncodeArgv). */
const HDR_VUI = Object.freeze({ primaries: 'bt2020', trc: 'smpte2084', matrix: 'bt2020nc', range: 'tv' });
/** The ST 2084 inverse EOTF: luminance ÷ 10 000 nits → the signal [0, 1] (≤ 0 / NaN ⇒ 0, ≥ 1 ⇒ 1). */
function pqOetf(y) {
  if (!(y > 0)) return 0;
  const v = Math.min(1, y) ** PQ.m1;
  return ((PQ.c1 + PQ.c2 * v) / (1 + PQ.c3 * v)) ** PQ.m2;
}
/** A grey of `nits` → its 10-bit limited-range code (64 + 876·E) — the probe's clips: 100 nits 509, 203 nits 573, 1000 nits 723. */
const pqCodeOfNits = (nits) => Math.round(64 + 876 * pqOetf(nits / PQ.peakNits));
const PQ_SHIFT = 13;
/** THE HDR TABLES (one set — PQ is absolute: no white level): { lin: FP16 bits → linear BT.709 ÷ 10 000 nits (±inf / NaN ⇒ 0),
 *  pq: float32 bits >>> 13 → the signal at the bucket's middle (negative ⇒ 0, above 10 000 nits ⇒ 1) }. */
function buildPqTables() {
  const lin = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) { const v = halfToFloat(h); lin[h] = Number.isFinite(v) ? (v * SCRGB_NITS) / PQ.peakNits : 0; }
  const pq = new Float32Array(1 << (32 - PQ_SHIFT)), f = new Float32Array(1), u = new Uint32Array(f.buffer);
  for (let i = 0; i < pq.length; i++) { u[0] = (i << PQ_SHIFT) | (1 << (PQ_SHIFT - 1)); pq[i] = pqOetf(f[0]); }
  pq[0] = 0; // the bucket of +0 (black, a NaN / inf channel's 0): exactly 0, not its middle's 7e-7
  return { lin, pq };
}
/** One pixel's FP16 bits (r, g, b) → its PQ R'G'B' signals [0, 1] (the frame loop's own steps — the suites' function). */
function pqOfHalf(rh, gh, bh, T) {
  const r = T.lin[rh], g = T.lin[gh], b = T.lin[bh], m = BT709_TO_BT2020, f = new Float32Array(1), u = new Uint32Array(f.buffer);
  const one = (x) => { f[0] = x; return T.pq[u[0] >>> PQ_SHIFT]; };
  return [one(m[0] * r + m[1] * g + m[2] * b), one(m[3] * r + m[4] * g + m[5] * b), one(m[6] * r + m[7] * g + m[8] * b)];
}
/** THE HDR FRAME LOOP: rgbaf16le (a Uint16Array of its bits, `w` pixels a row) → P010 of the even part into `out` (a Uint16Array of
 *  ⌊w⌋₂·⌊h⌋₂·3/2 samples, each 10-bit code << 6): luma per pixel, chroma from each 2×2 block's mean R'G'B' (BT.2020-NCL,
 *  limited range); `step` k > 1 = every k-th pixel of every k-th row (② beside other displays, as nv12FromHalf). Unrolled, the
 *  constants at module level, one scratch float: 66 ms a 4K frame of noise on the lane's box (a closure per pixel: 235; the NV12
 *  loop: 23) — every variant measured gave the same samples. → bytes written */
const M709 = BT709_TO_BT2020, [P0, P1, P2, P3, P4, P5, P6, P7, P8] = M709;
const YR = 876 * BT2020.kr, YG = 876 * BT2020.kg, YB = 876 * BT2020.kb, CB4 = 896 / (2 * (1 - BT2020.kb)) / 4, CR4 = 896 / (2 * (1 - BT2020.kr)) / 4;
const PQF = new Float32Array(3), PQU = new Uint32Array(PQF.buffer);
function p010FromHalf(src, w, h, T, out, step = 1) {
  const k = Math.max(1, step | 0), W = Math.floor(w / k) & ~1, H = Math.floor(h / k) & ~1, uv = W * H, px = 4 * k;
  const lin = T.lin, pq = T.pq, f = PQF, u = PQU, kr = BT2020.kr, kg = BT2020.kg, kb = BT2020.kb;
  for (let y = 0; y < H; y += 2) {
    let i0 = y * k * w * 4, i1 = (y + 1) * k * w * 4, o0 = y * W, o1 = o0 + W, c = uv + (y >> 1) * W;
    for (let x = 0; x < W; x += 2) {
      let r = lin[src[i0]], g = lin[src[i0 + 1]], b = lin[src[i0 + 2]];
      f[0] = P0 * r + P1 * g + P2 * b; f[1] = P3 * r + P4 * g + P5 * b; f[2] = P6 * r + P7 * g + P8 * b;
      let R = pq[u[0] >>> PQ_SHIFT], G = pq[u[1] >>> PQ_SHIFT], B = pq[u[2] >>> PQ_SHIFT], sr = R, sg = G, sb = B;
      out[o0] = ((64.5 + YR * R + YG * G + YB * B) | 0) << 6;
      r = lin[src[i0 + px]]; g = lin[src[i0 + px + 1]]; b = lin[src[i0 + px + 2]];
      f[0] = P0 * r + P1 * g + P2 * b; f[1] = P3 * r + P4 * g + P5 * b; f[2] = P6 * r + P7 * g + P8 * b;
      R = pq[u[0] >>> PQ_SHIFT]; G = pq[u[1] >>> PQ_SHIFT]; B = pq[u[2] >>> PQ_SHIFT]; sr += R; sg += G; sb += B;
      out[o0 + 1] = ((64.5 + YR * R + YG * G + YB * B) | 0) << 6;
      r = lin[src[i1]]; g = lin[src[i1 + 1]]; b = lin[src[i1 + 2]];
      f[0] = P0 * r + P1 * g + P2 * b; f[1] = P3 * r + P4 * g + P5 * b; f[2] = P6 * r + P7 * g + P8 * b;
      R = pq[u[0] >>> PQ_SHIFT]; G = pq[u[1] >>> PQ_SHIFT]; B = pq[u[2] >>> PQ_SHIFT]; sr += R; sg += G; sb += B;
      out[o1] = ((64.5 + YR * R + YG * G + YB * B) | 0) << 6;
      r = lin[src[i1 + px]]; g = lin[src[i1 + px + 1]]; b = lin[src[i1 + px + 2]];
      f[0] = P0 * r + P1 * g + P2 * b; f[1] = P3 * r + P4 * g + P5 * b; f[2] = P6 * r + P7 * g + P8 * b;
      R = pq[u[0] >>> PQ_SHIFT]; G = pq[u[1] >>> PQ_SHIFT]; B = pq[u[2] >>> PQ_SHIFT]; sr += R; sg += G; sb += B;
      out[o1 + 1] = ((64.5 + YR * R + YG * G + YB * B) | 0) << 6;
      const Y = kr * sr + kg * sg + kb * sb;
      out[c] = ((512.5 + CB4 * (sb - Y)) | 0) << 6; out[c + 1] = ((512.5 + CR4 * (sr - Y)) | 0) << 6;
      i0 += 2 * px; i1 += 2 * px; o0 += 2; o1 += 2; c += 2;
    }
  }
  return (uv + uv / 2) * 2;
}
const p010Bytes = (w, h) => (w & ~1) * (h & ~1) * 3;

/** The owner's real capture (2026-10-16, HDR on, SDR white 2500 = 200 nits): [label, the sRGB drawn, the FP16 bits read]. */
const CALIBRATION = Object.freeze({
  white: 2500,
  rows: Object.freeze([
    ['grey0', [0, 0, 0], [0, 0, 0]], ['grey10', [26, 26, 26], [9884, 9884, 9884]], ['grey20', [51, 51, 51], [11595, 11595, 11595]],
    ['grey30', [77, 77, 77], [12783, 12783, 12783]], ['grey40', [102, 102, 102], [13648, 13648, 13648]], ['grey50', [128, 128, 128], [14417, 14417, 14417]],
    ['grey60', [153, 153, 153], [14942, 14942, 14942]], ['grey70', [179, 179, 179], [15490, 15490, 15490]], ['grey80', [204, 204, 204], [15881, 15881, 15881]],
    ['grey90', [230, 230, 230], [16361, 16361, 16361]], ['grey100', [255, 255, 255], [16640, 16640, 16640]],
    ['R', [255, 0, 0], [16640, 0, 0]], ['G', [0, 255, 0], [0, 16640, 0]], ['B', [0, 0, 255], [0, 0, 16640]],
    ['C', [0, 255, 255], [0, 16640, 16640]], ['M', [255, 0, 255], [16640, 0, 16640]], ['Y', [255, 255, 0], [16640, 16640, 0]],
  ].map((r) => Object.freeze(r))),
});

// ── THE ENCODER LADDER ───────────────────────────────────────────────────────────────────────────────────────────────
/** In order of preference. `args` = the encoder's low-latency switches (the common ones — rate, GOP, profile — are added
 *  by encodeTail). Constrained baseline everywhere: the SDP offers 42e01f (src/stream-model.js STREAM_CODEC). */
const ENCODER_LADDER = Object.freeze([
  Object.freeze({ id: 'h264_nvenc', label: 'NVENC', hw: true, profile: 'baseline', args: Object.freeze(['-preset', 'p1', '-tune', 'ull', '-rc', 'cbr', '-zerolatency', '1', '-delay', '0', '-rc-lookahead', '0']) }),
  Object.freeze({ id: 'h264_amf', label: 'AMF', hw: true, profile: 'constrained_baseline', args: Object.freeze(['-usage', 'ultralowlatency', '-quality', 'speed', '-rc', 'cbr']) }),
  Object.freeze({ id: 'h264_qsv', label: 'Quick Sync', hw: true, profile: 'baseline', args: Object.freeze(['-preset', 'veryfast', '-look_ahead', '0', '-low_delay_brc', '1']) }),
  Object.freeze({ id: 'libx264', label: 'x264', hw: false, profile: 'baseline', args: Object.freeze(['-preset', 'ultrafast', '-tune', 'zerolatency']) }),
]);
/** THE HDR ROAD's encoder (lane stream-hdr-passthrough): AV1, 10-bit from P010, in hardware — the one measured (the owner's RTX 5090,
 *  the probe: av1_nvenc 10-bit 4K 231 / 277 fps; it writes BT.2020 / PQ / BT.2020-NCL into the sequence header itself). The
 *  H.264 NVENC rung's low-latency switches — `-delay` defaults to INT_MAX frames here too (`-h encoder=av1_nvenc` on the owner's
 *  ffmpeg N-127564); no `-profile` (AV1 4:2:0 10-bit is Main). AMF's / Quick Sync's AV1 were never measured on a machine of ours:
 *  not offered. */
const HDR_LADDER = Object.freeze([
  Object.freeze({ id: 'av1_nvenc', label: 'NVENC AV1', hw: true, codec: 'AV1', args: Object.freeze(['-preset', 'p1', '-tune', 'ull', '-rc', 'cbr', '-zerolatency', '1', '-delay', '0', '-rc-lookahead', '0']) }),
]);
/** The first ladder rung the installed ffmpeg has. → { ok, encoder, note: 'no_hw_encoder' | null } | { ok: false, code } */
function pickEncoder(encoders, ladder = ENCODER_LADDER) {
  const have = new Set(Array.isArray(encoders) ? encoders : []);
  const e = ladder.find((r) => have.has(r.id));
  if (!e) return { ok: false, code: 'no_encoder', error: 'the machine\'s ffmpeg has no H.264 encoder (NVENC, AMF, Quick Sync or x264)' };
  return { ok: true, encoder: e, note: e.hw ? null : 'no_hw_encoder' };
}

// ── FFMPEG ON THE MACHINE ────────────────────────────────────────────────────────────────────────────────────────────
const FFMPEG_MIN_MAJOR = 7;
/** Where the agent looks, in order: PATH, then %LOCALAPPDATA%\vibespace\ffmpeg\bin, then the P0 probe's folder (`delim` /
 *  `sep` = the running system's, from the caller's path module). */
function ffmpegCandidates({ platform = 'win32', env = {}, delim = platform === 'win32' ? ';' : ':', sep = platform === 'win32' ? '\\' : '/' } = {}) {
  const win = platform === 'win32', exe = win ? 'ffmpeg.exe' : 'ffmpeg';
  const out = [];
  for (const d of String(env.PATH || env.Path || '').split(delim)) if (d.trim()) out.push({ where: 'PATH', path: d.trim().replace(/[\\/]+$/, '') + sep + exe });
  if (win && env.LOCALAPPDATA) out.push({ where: '%LOCALAPPDATA%\\vibespace\\ffmpeg\\bin', path: [env.LOCALAPPDATA, 'vibespace', 'ffmpeg', 'bin', exe].join(sep) });
  if (win && env.USERPROFILE) out.push({ where: 'the probe folder', path: [env.USERPROFILE, 'vs-probe', 'ffmpeg', 'ffmpeg-master-latest-win64-gpl', 'bin', exe].join(sep) });
  return out;
}
const LOOKED = 'PATH, %LOCALAPPDATA%\\vibespace\\ffmpeg\\bin, %USERPROFILE%\\vs-probe\\ffmpeg';
/** `ffmpeg -version`, `-hide_banner -filters`, `-hide_banner -encoders` → the facts. A master build's version is
 *  `N-…` (no number): libavfilter ≥ 10 = FFmpeg ≥ 7. */
function parseFfmpegFacts(versionText, filtersText, encodersText) {
  const v = String(versionText || ''), first = (v.split(/\r?\n/)[0] || '').trim();
  const num = /^ffmpeg version n?(\d+)\.(\d+)/i.exec(first);
  const lavfi = /libavfilter\s+(\d+)\./.exec(v);
  const major = num ? Number(num[1]) : lavfi ? (Number(lavfi[1]) >= 11 ? 8 : Number(lavfi[1]) >= 10 ? 7 : Number(lavfi[1]) >= 9 ? 6 : 5) : null;
  const ddagrab = /^\s*\S+\s+ddagrab\s/m.test(String(filtersText || ''));
  const encoders = [];
  for (const line of String(encodersText || '').split(/\r?\n/)) { const m = /^\s*V[.A-Z]{5}\s+(\S+)/.exec(line); if (m) encoders.push(m[1]); }
  return { version: first.replace(/^ffmpeg version\s*/i, '').split(' ')[0] || null, major, ddagrab, encoders: encoders.filter((e) => ENCODER_LADDER.some((r) => r.id === e) || HDR_LADDER.some((r) => r.id === e)) };
}
/** May this ffmpeg capture? → { ok } | { ok: false, code: 'no_ffmpeg', error } */
function ffmpegVerdict(ff) {
  const need = `this machine needs ffmpeg ${FFMPEG_MIN_MAJOR} or newer with ddagrab and NVENC (looked in ${LOOKED})`;
  if (!ff || !ff.path) return { ok: false, code: 'no_ffmpeg', error: need };
  if (!(ff.major >= FFMPEG_MIN_MAJOR)) return { ok: false, code: 'no_ffmpeg', error: `${need}; ${ff.path} is ${ff.version || 'an unknown version'}` };
  if (!ff.ddagrab) return { ok: false, code: 'no_ffmpeg', error: `${need}; ${ff.path} has no ddagrab` };
  return { ok: true };
}

// ── THE MACHINE'S SCREEN FACTS (Windows PowerShell 5.1) ──────────────────────────────────────────────────────────────
// DisplayConfig per active path (raw DISPLAYCONFIG_PATH_INFO offsets, 72 bytes: source LUID @0 id @8, target LUID @20 id @28):
// type 1 = the source's GDI name (\\.\DISPLAYn = Screen.DeviceName), type 9 = advanced colour (bit 1 enabled, bit 2 the SDR
// wide-colour mode, not HDR), type 11 = SDRWhiteLevel (1000 = 80 nits). DXGI (CreateDXGIFactory1 → EnumAdapters1 →
// EnumOutputs → GetDesc): which adapter + output index ddagrab must open for that GDI name — vtable slots only, the methods
// before the one called are placeholders. Any failure = that part empty (a display with no white level is refused by name
// when it is HDR; no DXGI map = only the primary, which DXGI enumerates first on adapter 0).
const STREAM_FACTS_PS = ["$ErrorActionPreference = 'Stop'",
  "Add-Type -TypeDefinition @'",
  'using System; using System.Text; using System.Runtime.InteropServices;',
  'public static class VsStreamDc {',
  '  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();',
  '  [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint f, out uint np, out uint nm);',
  '  [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint f, ref uint np, IntPtr p, ref uint nm, IntPtr m, IntPtr t);',
  '  [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(IntPtr q);',
  '  static void Head(IntPtr b, int type, int size, IntPtr p, int at) { Marshal.WriteInt32(b, 0, type); Marshal.WriteInt32(b, 4, size); Marshal.WriteInt64(b, 8, Marshal.ReadInt64(p, at)); Marshal.WriteInt32(b, 16, Marshal.ReadInt32(p, at + 8)); }',
  '  public static string Read() {',
  '    uint np, nm; var sb = new StringBuilder();',
  '    if (GetDisplayConfigBufferSizes(2, out np, out nm) != 0) return "";',
  '    IntPtr P = Marshal.AllocHGlobal((int)np * 72), M = Marshal.AllocHGlobal((int)nm * 64), B = Marshal.AllocHGlobal(424);',
  '    try {',
  '      if (QueryDisplayConfig(2, ref np, P, ref nm, M, IntPtr.Zero) != 0) return "";',
  '      for (int i = 0; i < (int)np; i++) {',
  '        IntPtr p = new IntPtr(P.ToInt64() + i * 72);',
  '        Head(B, 1, 84, p, 0); if (DisplayConfigGetDeviceInfo(B) != 0) continue;',
  '        string name = Marshal.PtrToStringUni(new IntPtr(B.ToInt64() + 20));',
  '        int ac = -1, white = -1;',
  '        Head(B, 9, 32, p, 20); if (DisplayConfigGetDeviceInfo(B) == 0) ac = Marshal.ReadInt32(B, 20);',
  '        Head(B, 11, 24, p, 20); if (DisplayConfigGetDeviceInfo(B) == 0) white = Marshal.ReadInt32(B, 20);',
  '        string fn = ""; Head(B, 2, 420, p, 20); if (DisplayConfigGetDeviceInfo(B) == 0) fn = Marshal.PtrToStringUni(new IntPtr(B.ToInt64() + 36));',
  "        fn = (fn ?? \"\").Replace(';', ' ').Replace('=', ' ').Replace(',', ' ').Trim();",
  "        sb.Append(name).Append('=').Append(ac).Append(',').Append(white).Append(',').Append(fn).Append(';');",
  '      }',
  '    } finally { Marshal.FreeHGlobal(P); Marshal.FreeHGlobal(M); Marshal.FreeHGlobal(B); }',
  '    return sb.ToString();',
  '  }',
  '}',
  '[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct VsOutDesc { [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName; public int L, T, R, B; public int Attached; public int Rotation; public IntPtr Monitor; }',
  '[ComImport, Guid("ae02eedb-c735-4690-8d52-5a8dc20213aa"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IVsOutput { void _0(); void _1(); void _2(); void _3(); [PreserveSig] int GetDesc(out VsOutDesc d); }',
  '[ComImport, Guid("2411e7e1-12ac-4ccf-bd14-9798e8534dc0"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IVsAdapter { void _0(); void _1(); void _2(); void _3(); [PreserveSig] int EnumOutputs(uint i, out IVsOutput o); }',
  '[ComImport, Guid("770aae78-f26f-4dba-a829-253c83d1b387"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IVsFactory { void _0(); void _1(); void _2(); void _3(); void _4(); void _5(); void _6(); void _7(); void _8(); [PreserveSig] int EnumAdapters1(uint i, out IVsAdapter a); }',
  'public static class VsDxgi {',
  '  [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IVsFactory f);',
  '  public static string Read() {',
  '    var sb = new StringBuilder(); var g = new Guid("770aae78-f26f-4dba-a829-253c83d1b387"); IVsFactory f;',
  '    if (CreateDXGIFactory1(ref g, out f) != 0) return "";',
  '    for (uint a = 0; a < 16; a++) { IVsAdapter ad; if (f.EnumAdapters1(a, out ad) != 0) break;',
  '      for (uint o = 0; o < 16; o++) { IVsOutput op; if (ad.EnumOutputs(o, out op) != 0) break; VsOutDesc d; if (op.GetDesc(out d) == 0) sb.Append(d.DeviceName).Append(\'=\').Append(a).Append(\',\').Append(o).Append(\';\'); } }',
  '    return sb.ToString();',
  '  }',
  '}',
  "'@",
  '$aware = 0; try { $aware = [int][VsStreamDc]::SetProcessDPIAware() } catch { }',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$dc = @{}; try { foreach ($kv in ([VsStreamDc]::Read()).Split(\';\')) { $p = $kv.Split(\'=\'); if ($p.Length -eq 2) { $dc[$p[0]] = $p[1] } } } catch { }',
  '$dx = @{}; try { foreach ($kv in ([VsDxgi]::Read()).Split(\';\')) { $p = $kv.Split(\'=\'); if ($p.Length -eq 2) { $dx[$p[0]] = $p[1] } } } catch { }',
  '$rows = @()',
  'foreach ($s in [System.Windows.Forms.Screen]::AllScreens) { $b = $s.Bounds; $c = \'\'; if ($dc.ContainsKey($s.DeviceName)) { $c = $dc[$s.DeviceName] }; $o = \'\'; if ($dx.ContainsKey($s.DeviceName)) { $o = $dx[$s.DeviceName] }; $rows += @{ id = $s.DeviceName; x = $b.X; y = $b.Y; w = $b.Width; h = $b.Height; primary = [int]$s.Primary; dc = $c; dxgi = $o } }',
  "[Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ t = 'stream-facts'; aware = $aware; dxgi = $dx.Count; rows = $rows } -Compress -Depth 4))"].join('\n');

// ── WINDOWS POWER THROTTLING (lane stream-hdr-passthrough — measured on the owner's i9-12900K, 2026-10-19) ─────────────────
// Windows slows a BACKGROUND process (EcoQoS: lower clocks, the efficient cores) and the agent and its ffmpegs are hidden: the HDR
// road's mapper took 250–700 ms a 4K frame (65 idle) and its encoder fell behind (1–5 fps); with execution-speed throttling OFF on
// the agent and both ffmpegs (SetProcessInformation ProcessPowerThrottling, ControlMask EXECUTION_SPEED, StateMask 0 — a process
// of the same user, no elevation) 79 ms and 13 fps. The SDR roads measured the same (3–6 → 19–22 fps) — NOT changed by this lane.
/** The script that opts these processes out (one JSON line: { t: 'unthrottle', rows: [{ pid, ok, err }] }). */
function unthrottlePs(pids) {
  const list = (Array.isArray(pids) ? pids : []).map(Number).filter((p) => Number.isInteger(p) && p > 0).slice(0, 8);
  return ["$ErrorActionPreference = 'Stop'",
    "Add-Type -TypeDefinition @'",
    'using System; using System.Runtime.InteropServices;',
    'public static class VsQos {',
    '  [StructLayout(LayoutKind.Sequential)] public struct PPTS { public uint Version; public uint ControlMask; public uint StateMask; }',
    '  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint a, bool i, int pid);',
    '  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetProcessInformation(IntPtr h, int cls, ref PPTS s, int size);',
    '  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);',
    '  public static int Off(int pid) {',
    '    IntPtr h = OpenProcess(0x0200, false, pid); if (h == IntPtr.Zero) return Marshal.GetLastWin32Error();',
    '    var s = new PPTS { Version = 1, ControlMask = 1, StateMask = 0 }; bool ok = SetProcessInformation(h, 4, ref s, Marshal.SizeOf(s)); int e = ok ? 0 : Marshal.GetLastWin32Error(); CloseHandle(h); return e;',
    '  }',
    '}',
    "'@",
    `$rows = @(); foreach ($id in @(${list.join(',') || '0'})) { if ($id -gt 0) { $e = [VsQos]::Off($id); $rows += @{ pid = $id; ok = ($e -eq 0); err = $e } } }`,
    "[Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ t = 'unthrottle'; rows = @($rows) } -Compress -Depth 3))"].join('\n');
}
/** Its one line → [{ pid, ok, err }] (PowerShell 5 writes a lone row as an object) | null. */
function parseUnthrottle(stdout) {
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const l = line.trim(); if (!l.startsWith('{')) continue;
    try { const v = JSON.parse(l); if (v && v.t === 'unthrottle') { const r = Array.isArray(v.rows) ? v.rows : v.rows && typeof v.rows === 'object' ? [v.rows] : []; return r.map((x) => ({ pid: Number(x.pid) || 0, ok: x.ok === true, err: Number(x.err) || 0 })); } } catch { /* not ours */ }
  }
  return null;
}

/** The script's one line → { ok, displays: [{ id, x, y, w, h, primary, hdr, wideColor, white, adapter, output, name }], dxgi }.
 *  hdr: advanced colour on and not the SDR wide-colour mode (true | false | null unknown); white: SDRWhiteLevel | null; name:
 *  the monitor's own (its EDID friendly name — lane desktop-display-modes: the switcher's words) | null. */
function parseStreamFacts(stdout) {
  let o = null;
  for (const line of String(stdout || '').split(/\r?\n/)) { const l = line.trim(); if (!l.startsWith('{')) continue; try { const v = JSON.parse(l); if (v && v.t === 'stream-facts') { o = v; break; } } catch { /* not ours */ } }
  const rows = o && Array.isArray(o.rows) ? o.rows : o && o.rows && typeof o.rows === 'object' ? [o.rows] : null; // PowerShell 5 writes a lone row as an object
  if (!rows || !rows.length) return { ok: false, code: 'bad_output', error: 'the machine did not print its screen facts' };
  const num = (v) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  const displays = [];
  for (const r of rows.slice(0, 16)) {
    const x = num(r && r.x), y = num(r && r.y), w = num(r && r.w), h = num(r && r.h);
    if (x == null || y == null || !(w > 0) || !(h > 0)) continue;
    const dc = String(r.dc || '').split(','), [ac, white] = dc.slice(0, 2).map(num), name = dc.slice(2).join(' ').trim().slice(0, 80) || null;
    const [adapter, output] = String(r.dxgi || '').split(',').map(num);
    displays.push({ id: String(r.id || '').slice(0, 60) || `#${displays.length + 1}`, x, y, w, h, primary: !!Number(r.primary),
      hdr: ac == null || ac < 0 ? null : (ac & 2) !== 0 && (ac & 4) === 0, wideColor: ac != null && ac >= 0 && (ac & 4) !== 0,
      white: white > 0 ? white : null, adapter: adapter == null ? null : adapter, output: output == null ? null : output, name });
  }
  return displays.length ? { ok: true, displays, dxgi: num(o.dxgi) || 0 } : { ok: false, code: 'bad_output', error: 'the machine printed no usable screen' };
}

// ── THE PLAN ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const SCREEN_DEFAULTS = Object.freeze({ fps: 30, gopSeconds: 2, minKbps: 300 });
const QUIET = Object.freeze(['-hide_banner', '-loglevel', 'error', '-nostats']);
/** The rate, GOP, profile and VUI every rung takes (+ a road's `extra` encoder options), then the FLV pipe (flushed per picture). */
function encodeTail(enc, { kbps, fps, gop, extra = [] }) {
  const k = Math.round(kbps);
  return ['-c:v', enc.id, ...enc.args, ...extra, '-profile:v', enc.profile, '-bf', '0', '-g', String(gop), '-b:v', `${k}k`, '-maxrate', `${k}k`, '-bufsize', `${Math.max(1, Math.round((k * 2) / fps))}k`,
    '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709', '-color_range', 'tv',
    '-fps_mode', 'passthrough', '-f', 'flv', '-flvflags', 'no_duration_filesize', '-flush_packets', '1', 'pipe:1'];
}
/** DDA, one output of adapter 0 (ddagrab opens the default adapter's outputs). draw_mouse=0 (lane stream-cursor): ddagrab's
 *  default (true — measured on the owner's ffmpeg N-127564) paints the machine's pointer into every frame, under the viewer's
 *  own arrow; the viewer's pointer IS the pointer, so no source draws the machine's. */
const grab = (output, fps, bits16) => `ddagrab=output_idx=${output}:draw_mouse=0${bits16 ? ':output_fmt=16bit' : ''}:framerate=${fps}`;
/** The capture ffmpeg of the MAPPED road: FP16 frames as their raw bits on stdout — NO `format=` conversion of a float
 *  format (swscale clamps them to [0, 1]: measured, ffmpeg 8.0.1) — hwdownload hands rgbaf16le, `format=` only pins it. */
function captureArgv(plan) { return [...QUIET, '-nostdin', '-f', 'lavfi', '-i', grab(plan.display.output, plan.fps, true), '-vf', 'hwdownload,format=rgbaf16le', '-f', 'rawvideo', '-pix_fmt', 'rgbaf16le', 'pipe:1']; }
/** The encoder ffmpeg of the MAPPED road: the agent's NV12 frames on stdin. */
function encodeArgv(plan, kbps = plan.kbps) {
  return [...QUIET, '-f', 'rawvideo', '-pix_fmt', 'nv12', '-video_size', `${plan.w}x${plan.h}`, '-framerate', String(plan.fps), '-i', 'pipe:0', ...encodeTail(plan.encoder, { kbps, fps: plan.fps, gop: plan.gop })];
}
/** The DIRECT road (an SDR display — DDA's 8-bit picture is exact): one ffmpeg, capture → NV12 (8-bit, BT.709) → the encoder. */
function directArgv(plan, kbps = plan.kbps) {
  return [...QUIET, '-nostdin', '-f', 'lavfi', '-i', grab(plan.display.output, plan.fps, false), '-vf', 'hwdownload,format=bgra,scale=out_color_matrix=bt709:out_range=tv,format=nv12', ...encodeTail(plan.encoder, { kbps, fps: plan.fps, gop: plan.gop })];
}
/** The encoder ffmpeg of the HDR ROAD (lane stream-hdr-passthrough): the agent's P010 (PQ, BT.2020) on stdin, the frames TAGGED with
 *  what they are (setparams — the probe's trap: an output -color_* that differs from the frames' own makes ffmpeg 8 insert a CPU
 *  swscale conversion, 97–99 fps instead of 231–277), av1_nvenc 10-bit (P010 in ⇒ 10-bit out), IVF out — length-framed like the
 *  FLV of the H.264 roads (an Annex-B / OBU stream shows a picture's end only when the next starts). */
function hdrEncodeArgv(plan, kbps = plan.kbps) {
  const k = Math.round(kbps);
  return [...QUIET, '-f', 'rawvideo', '-pix_fmt', 'p010le', '-video_size', `${plan.w}x${plan.h}`, '-framerate', String(plan.fps), '-i', 'pipe:0',
    '-vf', `setparams=range=${HDR_VUI.range}:color_primaries=${HDR_VUI.primaries}:color_trc=${HDR_VUI.trc}:colorspace=${HDR_VUI.matrix}`,
    '-c:v', plan.encoder.id, ...plan.encoder.args, '-bf', '0', '-g', String(plan.gop), '-b:v', `${k}k`, '-maxrate', `${k}k`, '-bufsize', `${Math.max(1, Math.round((k * 2) / plan.fps))}k`,
    '-fps_mode', 'passthrough', '-f', 'ivf', '-flush_packets', '1', 'pipe:1'];
}
// ── ONE STILL (lane desktop-handover: `desktop-grab` — the picture an agent the owner handed the desktop to reads) ──────
/** The DIRECT road's still: ONE frame of the display (8-bit — DDA's picture is the SDR screen), the display's own pixels, as a
 *  PNG on stdout. The same capture as the stream (ddagrab, draw_mouse=0), no encoder. */
function stillArgv(plan) { return [...QUIET, '-nostdin', '-f', 'lavfi', '-i', grab(plan.display.output, STILL_FPS, false), '-vf', 'hwdownload,format=bgra,format=rgb24', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']; }
/** The MAPPED road's still: ONE FP16 frame's raw bits (the stream's capture, one frame) — this agent maps it through THE table
 *  (rgbFromHalf — the same mapping the stream's frames get) and writes the PNG itself (pngOf). */
function stillHalfArgv(plan) { return [...QUIET, '-nostdin', '-f', 'lavfi', '-i', grab(plan.display.output, STILL_FPS, true), '-vf', 'hwdownload,format=rgbaf16le', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgbaf16le', 'pipe:1']; }
const STILL_FPS = 10;
/** rgbaf16le (its bits, `w` pixels a row) → RGB8 through THE table (`lut` = buildLut of the display's white). */
function rgbFromHalf(src, w, h, lut, out = new Uint8Array(w * h * 3)) {
  for (let i = 0, o = 0, n = w * h * 4; i < n; i += 4, o += 3) { out[o] = lut[src[i]]; out[o + 1] = lut[src[i + 1]]; out[o + 2] = lut[src[i + 2]]; }
  return out;
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes, c = 0xffffffff) { for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return c; }
/** RGB8 rows → a PNG (8-bit truecolour, filter 0 on every row). `deflate` = zlib's deflateSync (handed in: this file is PURE).
 *  → Uint8Array */
function pngOf(rgb, w, h, deflate) {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, (crc32(out.subarray(4, 8 + data.length)) ^ 0xffffffff) >>> 0);
    return out;
  };
  const ihdr = new Uint8Array(13), hv = new DataView(ihdr.buffer);
  hv.setUint32(0, w); hv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 2; // 8 bits, truecolour; compression / filter / interlace 0
  const parts = [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflate(raw))), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
/** A PNG's size from its IHDR (the still's answer is checked, never trusted) → { w, h } | null */
function pngSize(b) {
  if (!b || b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = dv.getUint32(16), h = dv.getUint32(20);
  return w > 0 && h > 0 ? { w, h } : null;
}
/**
 * The session's plan. `facts` = { platform, ffmpeg: {path, version, major, ddagrab, encoders}, displays } (the stream-facts
 * op's answer); `display` = a display id (`\\.\DISPLAY2`) or null = the primary. → { ok, mode, display, origin, w, h, fps,
 * kbps, gop, white, tone, encoder, note } | { ok: false, code, error }
 */
function planScreen(facts, opts = {}) {
  const f = facts || {};
  if (f.platform === 'darwin') return planMacScreen(f, opts); // lane stream-p3m-build: the Mac's helper road
  const { display = null, fps = SCREEN_DEFAULTS.fps, kbps = 8000, tone = TONE_DEFAULT, share = 1, hdr: wantHdr = false } = opts || {};
  if (f.platform !== 'win32') return { ok: false, code: 'not_windows', error: `the screen source captures a Windows desktop (this machine runs ${f.platform || 'an unknown system'})` };
  if (f.displaysError) return { ok: false, code: 'facts_failed', error: `the machine's screen facts could not be read (${f.displaysError})` };
  const fv = ffmpegVerdict(f.ffmpeg);
  if (!fv.ok) return fv;
  const list = Array.isArray(f.displays) ? f.displays : [];
  const d = display ? list.find((x) => x.id === display) : list.find((x) => x.primary) || null;
  if (!d) return { ok: false, code: 'display_gone', error: display ? `the display ${display} is not connected to the machine any more` : 'the machine shows no primary display' };
  const mapped = d.adapter == null ? (d.primary ? { adapter: 0, output: 0 } : null) : { adapter: d.adapter, output: d.output };
  if (!mapped) return { ok: false, code: 'display_unmapped', error: `the machine did not say which graphics output shows ${d.id} — only the primary display can be captured` };
  if (mapped.adapter !== 0) return { ok: false, code: 'display_other_gpu', error: `${d.id} is on the machine's graphics adapter ${mapped.adapter}; the capture opens the first adapter's displays` };
  const hdr = d.hdr === true;
  if (hdr && !(d.white > 0)) return { ok: false, code: 'no_white_level', error: `${d.id} is in HDR and its SDR white level could not be read — the colours would be guessed` };
  const pe = pickEncoder(f.ffmpeg.encoders);
  if (!pe.ok) return pe;
  const rate = Math.max(SCREEN_DEFAULTS.minKbps, Math.round(Number(kbps) || 8000));
  const r = Math.max(1, Math.min(120, Math.round(Number(fps) || SCREEN_DEFAULTS.fps)));
  const step = hdr ? mappedStepOf(d.w, share) : 1; // lane desktop-display-modes: ② on the HDR road — a smaller picture per display
  const w = Math.floor(d.w / step) & ~1, h = Math.floor(d.h / step) & ~1;
  const can = hdrFactsOf(d, f.ffmpeg); // lane stream-hdr-passthrough: the offer's word on the HDR road, asked or not
  const plan = { ok: true, mode: hdr ? 'mapped' : 'direct', display: { id: d.id, output: mapped.output }, origin: { x: d.x, y: d.y }, w, h, srcW: d.w, srcH: d.h, step,
    scaled: step > 1 ? { share: Math.round(Number(share)), step, w, h, from: { w: d.w, h: d.h } } : null,
    fps: r, kbps: rate, floor: kbpsFloor({ w, h, fps: r, cap: rate }), gop: r * SCREEN_DEFAULTS.gopSeconds, white: hdr ? d.white : null, tone: { knee: tone.knee, peak: tone.peak }, encoder: pe.encoder, note: pe.note, ffmpeg: f.ffmpeg.path,
    hdr: { can: can.can, on: false, why: can.why } };
  if (wantHdr !== true || !can.can) return plan;
  // THE HDR ROAD: the mapped road's capture and size, THE PQ MAPPING, the AV1 rung — `sdr` = the mapped plan the session falls
  // back to when the browser's answer carries no AV1
  return { ...plan, mode: 'hdr', encoder: HDR_LADDER.find((e) => f.ffmpeg.encoders.includes(e.id)), note: null, floor: kbpsFloor({ w, h, fps: r, cap: rate, hdr: true }), tone: null,
    hdr: { can: true, on: true, why: null }, sdr: plan };
}
/** May this display travel as HDR? → { can, why: null | 'sdr_display' (not in Windows HDR) | 'no_av1_encoder' (the machine's ffmpeg has
 *  no HDR_LADDER encoder) | 'no_white_level' } — the page shows 「HDR 直通」 only when `can` (and its own screen and decoder can). */
function hdrFactsOf(d, ff) {
  if (!d || d.hdr !== true) return { can: false, why: 'sdr_display' };
  if (!(d.white > 0)) return { can: false, why: 'no_white_level' };
  const have = new Set(ff && Array.isArray(ff.encoders) ? ff.encoders : []);
  if (!HDR_LADDER.some((e) => have.has(e.id))) return { can: false, why: 'no_av1_encoder' };
  return { can: true, why: null };
}

/** THE SWITCHER's rows of a Windows machine (lane desktop-display-modes — the Mac's offer carried them since .309): the facts'
 *  displays as the offer names them — { id, x, y, w, h, primary, hdr, name, capturable } (capturable: the capture can open it —
 *  the first graphics adapter's output, or the primary when DXGI said nothing; a pick of another is refused by name). */
function screenDisplayRows(facts) {
  return (Array.isArray(facts && facts.displays) ? facts.displays : []).map((d) => ({ id: d.id, x: d.x, y: d.y, w: d.w, h: d.h, primary: !!d.primary, hdr: d.hdr === true, name: d.name || null,
    capturable: d.adapter == null ? !!d.primary : d.adapter === 0 && d.output != null }));
}

/** lane desktop-display-modes — ② ON THE HDR ROAD (measured on the owner's box: one 4K HDR display 7–12 fps, two 3–5 fps each —
 *  the agent maps every FP16 pixel; ffmpeg alone captures 4K FP16 at ~40 fps): a display streamed beside `share − 1` others in
 *  ONE window is mapped at every k-th pixel, k = the share, never under MAPPED_MIN_W wide (k ≤ 4). The SDR road, ① and ③ never. */
const MAPPED_MIN_W = 1280;
function mappedStepOf(w, share) {
  const n = Math.floor(Number(share) || 1);
  if (!(n >= 2) || !(w > 0)) return 1;
  return Math.max(1, Math.min(n, 4, Math.floor(w / MAPPED_MIN_W)));
}
/** A picture `step` times smaller than its display: the page's point (its picture's pixel + the display's origin) → the display's. */
function scaledInputOf(ev, scale) {
  if (!ev || !scale || !(scale.sx > 0) || typeof ev.x !== 'number' || typeof ev.y !== 'number') return ev;
  return { ...ev, x: Math.round(scale.ox + (ev.x - scale.ox) * scale.sx), y: Math.round(scale.oy + (ev.y - scale.oy) * scale.sy) };
}

// ── THE BITRATE ──────────────────────────────────────────────────────────────────────────────────────────────────────
const KBPS_RULE = Object.freeze({ minGapMs: 5000, band: 0.25, stepKbps: 100 });
/** werift's estimate → restart the encoder at a new rate? Never within minGapMs of the last change (or the start), only on
 *  a move of at least `band`, rounded to stepKbps, never under minKbps or the source's `floor` (a window's: windowKbpsFloor)
 *  or over the session's cap. → { change, kbps } */
function kbpsDecision({ current, target, cap, lastAt, now, floor = 0 }, rule = KBPS_RULE) {
  const t = Math.max(SCREEN_DEFAULTS.minKbps, Math.min(Number(cap) || Infinity, Math.max(Number(floor) || 0, Math.round((Number(target) || 0) / rule.stepKbps) * rule.stepKbps)));
  if (!(current > 0) || !(t > 0)) return { change: false, kbps: current };
  if (now - lastAt < rule.minGapMs) return { change: false, kbps: current };
  if (Math.abs(t - current) / current < rule.band) return { change: false, kbps: current };
  return { change: true, kbps: t };
}
/** VideoToolbox's step (the Mac's helper takes `bps` LIVE — no restart, no key frame): ≥ 1 s apart, a ≥ 10 % move. */
const MAC_KBPS_RULE = Object.freeze({ minGapMs: 1000, band: 0.1, stepKbps: 100 });

// ── THE RATE — EVERY ROAD (lane stream-window-fixes: a Windows window; lane stream-mac-rate: the Mac, a Windows screen) ──
// Measured twice. The owner's first window stream (a 2698×2078 Lightroom window) restarted its encoder at 300 kbps 5 s in and
// stayed there. The owner's Mac screen (2560×1440 @ 60 over the hub's UDP leg — 「mac画面有了但是压缩的厉害」) went 8000 → 300 kbps at
// 2.2 s on werift's first estimate and stayed 30 s. Both were werift 0.25's estimate (THE ESTIMATE below: ~one packet a picture,
// ~300 kbps whatever is sent), obeyed. Even made right, an estimate is min(send, receive) of what WE sent: a still picture sends a
// trickle and no estimate rises above what is sent. So no road goes under a FLOOR sized by its picture (its pixels × its rate; the
// session's cap still wins), and the estimate is judged, never obeyed.
const KBPS_FLOOR = Object.freeze([
  Object.freeze({ maxPixels: 640 * 480, at30: 1000, at60: 1500 }),
  Object.freeze({ maxPixels: 1280 * 800, at30: 2500, at60: 3500 }),
  Object.freeze({ maxPixels: 1920 * 1200, at30: 4000, at60: 6000 }),
  Object.freeze({ maxPixels: 2560 * 1600, at30: 6000, at60: 8000 }),
  Object.freeze({ maxPixels: Infinity, at30: 8000, at60: 12000 }),
]);
/** THE HDR ROW (lane stream-hdr-passthrough): the HDR road's floor = the picture's row × `factor`. MEASURED on the owner's machine
 *  (45 frames of his live 4K HDR desktop through THE PQ mapping into av1_nvenc at the same constant quantizer, 10-bit P010 against
 *  the same PQ signal cut to 8 bits): 10-bit costs NO more — 371 729 vs 374 597 bytes at qp 90 (0.992), 220 196 vs 220 611 at qp 150
 *  (0.998) — and AV1 is the more efficient codec than the H.264 baseline the rows were sized for: the SDR row holds (1.0). The live
 *  HDR stream ran 2.4–4.6 Mbps at its 8 Mbps cap (a still-ish desktop). */
const KBPS_FLOOR_HDR = Object.freeze({ factor: 1, measured: Object.freeze({ frames: 45, qp90: 0.992, qp150: 0.998 }) });
/** A picture's rate floor: the row of its pixel count, 30 → 60 fps interpolated (`hdr`: × the HDR row's factor), rounded to 100,
 *  never over the session's `cap`. */
function kbpsFloor({ w = 0, h = 0, fps = SCREEN_DEFAULTS.fps, cap = Infinity, hdr = false } = {}) {
  const px = Math.max(0, Number(w) || 0) * Math.max(0, Number(h) || 0);
  const row = KBPS_FLOOR.find((r) => px <= r.maxPixels);
  const f = Math.max(0, Math.min(1, ((Number(fps) || SCREEN_DEFAULTS.fps) - 30) / 30));
  const k = Math.round(((row.at30 + (row.at60 - row.at30) * f) * (hdr ? KBPS_FLOOR_HDR.factor : 1)) / 100) * 100;
  return Math.max(SCREEN_DEFAULTS.minKbps, Math.min(Number(cap) > 0 ? Number(cap) : Infinity, k));
}
/** THE RATE RULE — the estimate judged, never obeyed. A correctly fed estimate of a lossless link spreads around what was sent
 *  (a real 30 s window stream replayed — the owner's machine, NVENC ~7.4 Mbps: p10 6.2 / p50 ~10 / p90 14–17 Mbps, one 976 kbps;
 *  THE ESTIMATE below, live through Chrome on loopback, 4.3 Mbps sent: 4.9–6.4 Mbps) — so a rule that obeys one sample walks at
 *  random. Here: the MEDIAN of the last `windowMs` of samples against the kbps the source itself SENT over the same span — at or above `echo` ×
 *  sent it is an echo (no evidence of a limit: nothing changes); under it the link may receive less than is sent (it drops or
 *  queues) — a real bottleneck HOLDS (the estimate sits at its capacity), a sampling dip does not (measured live: NVENC's
 *  intra-refresh cycle swings the sent rate 4 ↔ 14 Mbps a second, and one median dipped) — so only a shortfall that held `holdMs`
 *  acts: one `step` (kbpsDecision) toward the median, never under the floor, never up; with no shortfall for `recoverMs`, one
 *  `recoverStep` back toward the cap (blind — an echo never shows headroom; a cap it cannot carry shows as the next shortfall).
 *  `shortSince` = when the current shortfall began (0 = none), `shortAt` = the last shortfall seen. → { change, kbps, why:
 *  'shortfall' | 'hold' | 'recover' | 'echo' | 'wait', median, shortSince } */
const RATE_RULE = Object.freeze({ windowMs: 2000, minSamples: 5, echo: 0.75, holdMs: 2000, recoverMs: 20000, recoverStep: 1.25, step: KBPS_RULE });
/** The Mac's road (lane stream-mac-rate): the same judgement, VideoToolbox's live step, and the climb back after 10 s without a
 *  shortfall (+25 % toward the cap; the window road waits 20 s — each of its changes restarts the encoder: a key frame). */
const MAC_RATE_RULE = Object.freeze({ ...RATE_RULE, recoverMs: 10000, step: MAC_KBPS_RULE });
function rateDecision({ current, cap, floor = 0, samples = [], sentKbps = 0, lastAt = 0, shortAt = 0, shortSince = 0, now = 0 }, rule = RATE_RULE) {
  const keep = { change: false, kbps: current, shortSince: 0 };
  const s = (Array.isArray(samples) ? samples : []).filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (s.length < rule.minSamples || !(sentKbps > 0) || now - lastAt < rule.windowMs) return { ...keep, why: 'wait' };
  const median = s[s.length >> 1];
  if (median < rule.echo * sentKbps) {
    const since = shortSince || now;
    if (now - since < rule.holdMs) return { change: false, kbps: current, why: 'hold', median, shortSince: since };
    const d = kbpsDecision({ current, target: Math.min(median, current), cap, lastAt, now, floor }, rule.step || KBPS_RULE); // a shortfall only ever lowers
    return { ...d, why: 'shortfall', median, shortSince: since };
  }
  const top = Math.max(SCREEN_DEFAULTS.minKbps, Number(cap) || current);
  if (current < top && now - Math.max(lastAt, shortAt) >= rule.recoverMs) return { change: true, kbps: Math.min(top, Math.round((current * rule.recoverStep) / 100) * 100), why: 'recover', median };
  return { ...keep, why: 'echo', median };
}
/** ONE SESSION's rate — the bookkeeping both roads' sources share: what the source SENT (`sent(bytes, at)` per access unit) and
 *  werift's estimates over the rule's last windowMs, judged by rateDecision with its state carried. `estimate(kbps, at)` → the
 *  decision (`change` ⇒ the source applies `kbps`: the window road restarts its encoder, the Mac's helper takes `bps` live);
 *  `setFloor(f)` (a window's new size) lifts the rate to the new floor at once (→ true when it did); `begin(at)` = the stream
 *  started (no change within windowMs of it). `kbps`, `floor`, `last` ({ why, median } — the source's stats) read the state. */
function rateFollower({ kbps, cap, floor = 0, rule = RATE_RULE } = {}) {
  const sent = [], samples = [];
  const st = { kbps: Math.max(Number(kbps) || 0, floor), floor, lastAt: 0, shortAt: 0, shortSince: 0, last: null };
  const sum = (a) => a.reduce((n, x) => n + x[1], 0);
  return {
    get kbps() { return st.kbps; },
    get floor() { return st.floor; },
    get last() { return st.last; },
    begin(at) { st.lastAt = at; },
    sent(bytes, at) { sent.push([at, bytes]); },
    setFloor(f) { st.floor = f; if (st.kbps < f) { st.kbps = f; return true; } return false; },
    estimate(target, at) {
      samples.push([at, Number(target)]);
      while (samples.length && at - samples[0][0] > rule.windowMs) samples.shift();
      while (sent.length && at - sent[0][0] > rule.windowMs) sent.shift();
      const d = rateDecision({ current: st.kbps, cap, floor: st.floor, samples: samples.map((x) => x[1]), sentKbps: (sum(sent) * 8) / rule.windowMs, lastAt: st.lastAt, shortAt: st.shortAt, shortSince: st.shortSince, now: at }, rule);
      if (d.why !== 'wait') st.shortSince = d.shortSince || 0;
      if (d.why === 'shortfall' || d.why === 'hold') st.shortAt = at;
      st.last = { why: d.why, median: d.median == null ? null : Math.round(d.median) };
      if (d.change) { st.kbps = d.kbps; st.lastAt = at; }
      return d;
    },
  };
}
/** GONE MEANS GONE (lane stream-fallback-never-silent — owner incident inc-mvf7z2a3-9sxi: closing the window of a Mac's display 2
 *  ended display 3's capture with ScreenCaptureKit -3805 «application connection interrupted», which the helper names
 *  display_gone, and the page fell to the VNC picture). A capture that died is judged by THE FACTS, never by its own word:
 *  `displaySeen(facts, want)` → 'present' | 'absent' | 'unknown' (`want` = { display } | { window }) — a read that failed, or
 *  that listed none (a machine always has a display), is 'unknown', never 'absent'.
 *  `judgeGone(read, want, wait)` → 'gone' only when TWO reads that SUCCEEDED lack it, GONE_RULE.gapMs apart; else 'present' |
 *  'unknown' (`read` = a forced facts read, `wait(ms)` the caller's timer — this file keeps none).
 *  `captureRestart(times, now)` → may the source capture again IN PLACE (the same session: the page sees a short freeze, never
 *  an ending) — at most GONE_RULE.restarts within GONE_RULE.windowMs; past that it ends `capture_interrupted`, its own name. */
const GONE_RULE = Object.freeze({ gapMs: 1000, restarts: 2, windowMs: 60000 });
function displaySeen(f, want = {}) {
  if (!f || !f.ok || f.displaysError) return 'unknown';
  const win = want && want.window != null;
  const list = win ? f.windows : f.displays;
  if (!Array.isArray(list) || !list.length) return 'unknown';
  const id = String(win ? want.window : want && want.display);
  return list.some((x) => x && String(x.id) === id) ? 'present' : 'absent';
}
async function judgeGone(read, want, wait) {
  const seen = async () => { try { return displaySeen(await read(), want); } catch { return 'unknown'; } };
  const a = await seen();
  if (a !== 'absent') return a;
  await wait(GONE_RULE.gapMs);
  const b = await seen();
  return b === 'absent' ? 'gone' : b;
}
function captureRestart(times, now) { return (times || []).filter((t) => now - t < GONE_RULE.windowMs).length < GONE_RULE.restarts; }
/** THE ESTIMATE (lane stream-mac-rate, measured with a real Chrome viewer): werift 0.25's send-side estimate counts ~ONE packet a
 *  picture. It notes a sent packet after `await dtlsTransport.sendRtp` under the transport's CURRENT number — by then the number of
 *  the burst's LAST packet — so a picture's packets leave one record (loopback: 14 093 packets sent, 979 records; 974 of the 14 579
 *  the browser reported matched one), and its `packetResults` skips status-vector chunks, counts every run one too long and starts
 *  every chunk at the base again. Its estimate is ~300 kbps at 30–60 fps whatever is sent (the owner's Mac: 2.3 Mbps sent, nothing
 *  lost, the estimate 240–390) — the owner's 300 kbps on both roads; not an echo. So stream-host records each packet under the
 *  number in ITS OWN header and reads each feedback here. twccPackets: one transport-cc feedback (werift's parsed fields, which are
 *  right: baseSequenceNumber, packetStatusCount, referenceTime — 64 ms units, packetChunks — a run { packetStatus, runLength } or
 *  a vector { symbolList }, recvDeltas — µs, one per received packet in order) → the packets it names: [{ seq, recvUs | null }]. */
function twccPackets(fb) {
  const out = [], count = Math.max(0, Number(fb && fb.packetStatusCount) || 0), deltas = (fb && Array.isArray(fb.recvDeltas)) ? fb.recvDeltas : [];
  let seq = (Number(fb && fb.baseSequenceNumber) || 0) & 0xffff, di = 0, at = (Number(fb && fb.referenceTime) || 0) * 64000;
  const one = (status) => { // 0 not received · 1 small delta · 2 large delta (signed)
    let recvUs = null;
    if (status === 1 || status === 2) { const d = deltas[di++]; if (d && Number.isFinite(d.delta)) { at += d.delta; recvUs = at; } }
    out.push({ seq, recvUs });
    seq = (seq + 1) & 0xffff;
  };
  for (const c of (fb && Array.isArray(fb.packetChunks)) ? fb.packetChunks : []) {
    if (c && Array.isArray(c.symbolList)) { for (const v of c.symbolList) { if (out.length >= count) break; one(v); } } else if (c) { for (let i = 0; i < (Number(c.runLength) || 0) && out.length < count; i++) one(c.packetStatus); }
  }
  return out;
}
/** One session's send-side estimate: `sent(seq, bytes, atMs)` per packet (its first send — a retransmit keeps the number),
 *  `feedback(packets)` per report → kbps = min(the send rate, the receive rate) of ≥ minPackets reported packets spanning ≥ minMs
 *  (werift's intent), or null (not yet — a still picture's trickle waits for its 20 packets). Loopback Chrome, 4.3 Mbps sent:
 *  4.9–6.4 Mbps (werift's own: median 41 kbps). The last `keep` numbers are kept. */
function sendEstimator({ minPackets = 20, minMs = 100, keep = 4096 } = {}) {
  const sent = new Map();
  let acc = null;
  return {
    sent(seq, bytes, at) { if (!sent.has(seq)) sent.set(seq, [Number(bytes) || 0, at]); sent.delete((seq - keep) & 0xffff); },
    feedback(packets) {
      for (const p of Array.isArray(packets) ? packets : []) {
        if (!p || p.recvUs == null) continue;
        const x = sent.get(p.seq);
        if (!x) continue;
        const r = p.recvUs / 1000;
        if (!acc) acc = { n: 0, bytes: 0, s0: x[1], s1: x[1], r0: r, r1: r };
        acc.n++; acc.bytes += x[0];
        acc.s0 = Math.min(acc.s0, x[1]); acc.s1 = Math.max(acc.s1, x[1]); acc.r0 = Math.min(acc.r0, r); acc.r1 = Math.max(acc.r1, r);
      }
      if (!acc || acc.n < minPackets || Math.max(acc.s1 - acc.s0, acc.r1 - acc.r0) < minMs) return null;
      const k = Math.round(Math.min((acc.bytes * 8) / Math.max(1, acc.s1 - acc.s0), (acc.bytes * 8) / Math.max(1, acc.r1 - acc.r0)));
      acc = null;
      return k;
    },
  };
}

// ── THE ENCODER'S OUTPUT: FLV → access units ─────────────────────────────────────────────────────────────────────────
/** An incremental FLV reader: push(bytes) → [{ type: 'au', nalus, key, tsMs } | { type: 'bad', error }]. AVC only; the
 *  sequence header's SPS/PPS go in front of every key access unit that lacks them. */
function flvReader() {
  let buf = new Uint8Array(0), head = false, lenSize = 4, sps = [], pps = [], dead = false;
  const u24 = (b, i) => (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
  function push(chunk) {
    if (dead) return [];
    const nb = new Uint8Array(buf.length + chunk.length); nb.set(buf); nb.set(chunk, buf.length); buf = nb;
    const out = [];
    let i = 0;
    if (!head) {
      if (buf.length < 13) return out;
      if (buf[0] !== 0x46 || buf[1] !== 0x4c || buf[2] !== 0x56) { dead = true; return [{ type: 'bad', error: 'the encoder did not write FLV' }]; }
      i = ((buf[5] << 24) | (buf[6] << 16) | (buf[7] << 8) | buf[8]) + 4; head = true;
    }
    while (buf.length - i >= 11) {
      const type = buf[i], size = u24(buf, i + 1), ts = (buf[i + 7] << 24 | u24(buf, i + 4)) >>> 0;
      if (buf.length - i < 11 + size + 4) break;
      const d = buf.subarray(i + 11, i + 11 + size);
      i += 11 + size + 4;
      if (type !== 9 || d.length < 5 || (d[0] & 0x0f) !== 7) continue; // video, AVC
      if (d[1] === 0) { // AVCDecoderConfigurationRecord
        let k = 10; lenSize = (d[9] & 3) + 1; sps = []; pps = []; // d[5..]: version, profile, compat, level, lengthSizeMinusOne
        for (let n = d[k++] & 0x1f; n > 0 && k + 2 <= d.length; n--) { const l = (d[k] << 8) | d[k + 1]; sps.push(d.slice(k + 2, k + 2 + l)); k += 2 + l; }
        for (let n = d[k++]; n > 0 && k + 2 <= d.length; n--) { const l = (d[k] << 8) | d[k + 1]; pps.push(d.slice(k + 2, k + 2 + l)); k += 2 + l; }
        continue;
      }
      if (d[1] !== 1) continue;
      const nalus = [];
      for (let k = 5; k + lenSize <= d.length;) {
        let l = 0; for (let b = 0; b < lenSize; b++) l = l * 256 + d[k + b];
        k += lenSize; if (l <= 0 || k + l > d.length) break;
        nalus.push(d.slice(k, k + l)); k += l;
      }
      if (!nalus.length) continue;
      const key = (d[0] >> 4) === 1 || nalus.some((x) => (x[0] & 0x1f) === 5);
      const hasPs = nalus.some((x) => (x[0] & 0x1f) === 7);
      out.push({ type: 'au', nalus: key && !hasPs ? [...sps, ...pps, ...nalus] : nalus, key, tsMs: ts });
    }
    buf = buf.slice(i);
    return out;
  }
  return { push };
}

// ── THE MAC (lane stream-p3m-build — design q-041 r3 §1/§3 P3m; every number: lane stream-p3m-probe's report) ──────────
// The picture comes from ONE helper, tools/vibespace-screen/vibespace-screen.swift: ScreenCaptureKit hands the SDR picture
// EXACT when asked for sRGB (no tone-map — the Mac has no mapping road), VideoToolbox forces a key on the SAME frame and
// follows a bitrate LIVE (no encoder restart), the pictures ride FLV on stdout (flvReader above — no new parser), and CGEvent
// posts the viewer's input. THE TCC LAW: macOS keys Screen Recording / Accessibility on the RESPONSIBLE process — a plain
// child of the agent is the agent's node BY PATH — so the helper is spawned DISCLAIMED (its own `--disclaim` re-spawn), lives
// at a FIXED path with its own version and is replaced only when the shipped version differs (an ad-hoc grant is keyed to
// path + cdhash: a new binary must be granted again — helper_changed_regrant). It never asks for a grant and never prompts
// (a background agent cannot: tccd "does not allow prompting"); a refusal names the Settings pane (MAC_SETTINGS).
const MAC_HELPER = Object.freeze({ name: 'vibespace-screen', dir: Object.freeze(['.vibespace', 'helpers']), target: 'macos15.0', archs: Object.freeze(['arm64', 'x86_64']) });
const MAC_SETTINGS = Object.freeze({
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
});
// the size ladder (measured on an M4 Pro, low-latency rate control, real frames): 4K60 is out of reach (37 fps real, serial
// 17–29 ms a frame); 1440p (SCK scales on the GPU) holds 57 fps at 11.9 ms, 4K at 30 fps 18.7 ms. A display or window that
// fits 2560×1600 streams native at 60; a larger one is scaled to 2560×1440 at 60, or (`quality: 'full'`) native at 30.
const MAC_LADDER = Object.freeze([
  Object.freeze({ id: '1440p60', maxW: 2560, maxH: 1600, fitW: 2560, fitH: 1440, fps: 60 }),
  Object.freeze({ id: '4k30', maxW: 3840, maxH: 2400, fitW: 3840, fitH: 2400, fps: 30 }),
]);
/** The helper's place on the Mac (home = the agent user's): the binary, its version file, its state, a pushed prebuilt. */
function macHelperPaths(home) {
  const dir = [String(home || '').replace(/\/+$/, ''), ...MAC_HELPER.dir].join('/'), bin = `${dir}/${MAC_HELPER.name}`;
  return { dir, bin, version: `${bin}.version`, state: `${bin}.state.json`, incoming: (v) => `${bin}-${v}` };
}
/** The ONE file swiftc compiles: the version line, then the source (the binary says its own version). */
const macHelperSourceFile = (version, source) => `let HELPER_VERSION = ${JSON.stringify(String(version))}\n${String(source)}`;
/** The on-box build (the Command Line Tools' swiftc): both slices at once, lipo, ONE ad-hoc signature. → { slices, after } */
function macBuildPlan({ swiftc, src, dir, out }) {
  const slice = (a) => `${dir}/vibespace-screen-${a}`;
  return {
    slices: MAC_HELPER.archs.map((a) => ({ file: swiftc, args: ['-O', '-target', `${a}-apple-${MAC_HELPER.target}`, '-o', slice(a), src] })),
    after: [{ file: '/usr/bin/lipo', args: ['-create', '-output', out, ...MAC_HELPER.archs.map(slice)] }, { file: '/usr/bin/codesign', args: ['-s', '-', '-f', out] }],
  };
}
/** How the agent spawns the helper: DISCLAIMED — Node's spawn cannot set the responsibility attribute, so the helper's first
 *  argument makes it re-spawn ITSELF with responsibility_spawnattrs_setdisclaim (the child is its own TCC client). */
function macHelperSpawn(bin, cmd, args = []) { return { file: bin, args: ['--disclaim', cmd, ...args.map(String)], disclaim: true }; }

const GRANT = (v) => (v === 'granted' || v === 'denied' ? v : 'unknown');
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** The helper's `facts` line → { ok, version, disclaimed, tcc: { screen, accessibility }, locked, front, os, arch, displays:
 *  [{ id, x, y, w, h (points), pw, ph (pixels), scale, main, hdr, asleep, name }], windows: [{ id, pid, app, bundle, title,
 *  x, y, w, h, onScreen, minimized (true | false | null — only Accessibility can tell) }] } | { ok: false, code, error } */
function parseMacFacts(stdout) {
  let o = null;
  for (const line of String(stdout || '').split(/\r?\n/)) { const l = line.trim(); if (!l.startsWith('{')) continue; try { const v = JSON.parse(l); if (v && v.t === 'facts') { o = v; break; } } catch { /* not ours */ } }
  if (!o) return { ok: false, code: 'bad_output', error: 'the screen helper did not print its facts' };
  const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : null);
  const displays = (Array.isArray(o.displays) ? o.displays : []).slice(0, 16).filter((d) => d && Number.isInteger(d.id) && fin(d.w) > 0 && fin(d.h) > 0).map((d) => ({
    id: String(d.id), x: fin(d.x) || 0, y: fin(d.y) || 0, w: d.w, h: d.h, pw: fin(d.pw) || d.w, ph: fin(d.ph) || d.h, scale: fin(d.scale) || 1,
    main: !!d.main, hdr: !!d.hdr, asleep: !!d.asleep, name: str(d.name, 80) }));
  const windows = (Array.isArray(o.windows) ? o.windows : []).slice(0, 200).filter((w) => w && Number.isInteger(w.id) && fin(w.w) > 0 && fin(w.h) > 0).map((w) => ({
    id: String(w.id), pid: Number.isInteger(w.pid) ? w.pid : 0, app: str(w.app, 80), bundle: str(w.bundle, 120), title: str(w.title), x: fin(w.x) || 0, y: fin(w.y) || 0, w: w.w, h: w.h,
    onScreen: !!w.onScreen, minimized: typeof w.minimized === 'boolean' ? w.minimized : null }));
  const t = o.tcc && typeof o.tcc === 'object' ? o.tcc : {};
  return { ok: true, version: str(o.version, 40), disclaimed: typeof o.disclaimed === 'boolean' ? o.disclaimed : null, tcc: { screen: GRANT(t.screen), accessibility: GRANT(t.accessibility) },
    locked: !!o.locked, front: Number.isInteger(o.front) ? o.front : null, os: str(o.os, 20), arch: str(o.arch, 10), displays, windows };
}
/** A window of the facts (+ the display it sits on) → THE single-window source shape — src/stream-window.js windowSourceOf
 *  (int304: the one shape of both platforms; this is only the Mac's row for it): bounds = the captured rect on the machine's
 *  desktop in PHYSICAL pixels (a Mac's points × its scale; the frame includes the 32 pt title bar), dpi 96 = 100 % (a 2× Mac =
 *  192), id = the CGWindowID. */
function windowSourceOf(w, display = null) {
  if (!w) return null;
  const s = (display && display.scale) || 1, px = (v) => Math.round(v * s);
  return SW.windowSourceOf({ id: w.id, title: w.title, app: w.app, bounds: { x: px(w.x), y: px(w.y), w: px(w.w), h: px(w.h) }, display: display ? display.id : null, dpi: Math.round(96 * s), minimized: w.minimized === true });
}
/** The display a Mac window sits on: the one under its centre, else the main one. */
function macDisplayOf(w, ds) {
  const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
  return ds.find((x) => cx >= x.x && cx < x.x + x.w && cy >= x.y && cy < x.y + x.h) || ds.find((x) => x.main) || ds[0] || null;
}
/** The Mac's rows of the one-window picker (the agent's `stream-windows` op — int304: ONE picker for both platforms): its
 *  facts' windows in THE shape (+ pid), filtered as Windows' are (src/stream-window.js windowPickRows). */
function macWindowRows(facts) {
  const f = facts || {}, ds = Array.isArray(f.displays) ? f.displays : [];
  return SW.windowPickRows((Array.isArray(f.windows) ? f.windows : []).map((w) => { const r = windowSourceOf(w, macDisplayOf(w, ds)); return r && { ...r, pid: w.pid }; }).filter(Boolean));
}
/** Fit pixels into a box, aspect kept, even sizes. */
function fitEven(pw, ph, maxW, maxH) { const s = Math.min(1, maxW / pw, maxH / ph); return { w: Math.max(2, Math.round(pw * s) & ~1), h: Math.max(2, Math.round(ph * s) & ~1) }; }
/** The size + rate for a picture of pw × ph pixels (the ladder above). */
function macRungOf(pw, ph, { quality = null } = {}) {
  const [hd, full] = MAC_LADDER;
  if (pw <= hd.maxW && ph <= hd.maxH) return { rung: 'native60', ...fitEven(pw, ph, pw, ph), fps: hd.fps };
  if (quality === 'full') return { rung: full.id, ...fitEven(pw, ph, full.fitW, full.fitH), fps: full.fps };
  return { rung: hd.id, ...fitEven(pw, ph, hd.fitW, hd.fitH), fps: hd.fps };
}
const MAC_WHY = Object.freeze({
  no_helper: 'the Mac has no screen helper yet and cannot build one (no Command Line Tools: run `xcode-select --install` on the Mac, or let the hub push its prebuilt helper)',
  screen_permission: 'Screen Recording is off for vibespace-screen — on the Mac: System Settings → Privacy & Security → Screen & System Audio Recording → turn on vibespace-screen',
  helper_changed_regrant: 'the screen helper was updated, so macOS asks for its permission again — on the Mac: System Settings → Privacy & Security → Screen & System Audio Recording → turn vibespace-screen off and on',
  accessibility_permission: 'Accessibility is off for vibespace-screen (macOS drops its keys and clicks) — on the Mac: System Settings → Privacy & Security → Accessibility → turn on vibespace-screen',
});
/**
 * The Mac's plan (planScreen's darwin branch). `facts` = the agent's darwin stream-facts { platform: 'darwin', helper: {
 * state: 'ready' | …, code?, regrant, bin }, tcc, displays, windows }; `display` = a display id (null = the main one) or
 * `window` = a window id (the single-window source). → { ok, mode: 'videotoolbox', kind: 'display' | 'window', display,
 * window, origin, w, h, fps, kbps, rung, encoder, note, white: null, bin, args } | { ok: false, code, error, settings? }
 */
function planMacScreen(facts, { display = null, window = null, fps = null, kbps = 8000, quality = null } = {}) {
  const f = facts || {};
  const h = f.helper || {};
  if (h.state !== 'ready' || !h.bin) return { ok: false, code: h.code || 'no_helper', error: h.error || MAC_WHY.no_helper };
  const tcc = (f.tcc && f.tcc.screen) || 'unknown';
  if (tcc !== 'granted') return { ok: false, code: h.regrant ? 'helper_changed_regrant' : 'screen_permission', error: h.regrant ? MAC_WHY.helper_changed_regrant : MAC_WHY.screen_permission, settings: MAC_SETTINGS.screen };
  const ds = Array.isArray(f.displays) ? f.displays : [], ws = Array.isArray(f.windows) ? f.windows : [];
  let kind = 'display', d = null, w = null, pw, ph;
  if (window != null) {
    kind = 'window';
    w = ws.find((x) => x.id === String(window)) || null;
    if (!w) return { ok: false, code: 'window_gone', error: `the window ${window} is not on the Mac any more` };
    if (w.minimized === true) return { ok: false, code: 'window_minimized', error: 'the window is minimized — restore it to stream (a minimized window sends no picture)' };
    d = macDisplayOf(w, ds);
    const s = d ? d.scale : 2;
    pw = w.w * s; ph = w.h * s;
  } else {
    d = display != null ? ds.find((x) => x.id === String(display)) || null : ds.find((x) => x.main) || ds[0] || null;
    if (!d) return { ok: false, code: 'display_gone', error: display != null ? `the display ${display} is not connected to the Mac any more` : 'the Mac shows no display' };
    pw = d.pw; ph = d.ph;
  }
  const r = macRungOf(pw, ph, { quality });
  const rate = Math.max(SCREEN_DEFAULTS.minKbps, Math.round(Number(kbps) || 8000));
  const fr = fps != null ? Math.max(1, Math.min(r.fps, Math.round(Number(fps) || r.fps))) : r.fps;
  const args = ['capture', kind === 'window' ? '--window' : '--display', kind === 'window' ? w.id : d.id, '--fps', String(fr), '--size', `${r.w}x${r.h}`, '--kbps', String(rate)];
  return { ok: true, mode: 'videotoolbox', kind, display: d ? { id: d.id } : null, window: windowSourceOf(w, d), origin: { x: 0, y: 0 }, w: r.w, h: r.h, fps: fr, kbps: rate, floor: kbpsFloor({ w: r.w, h: r.h, fps: fr, cap: rate }), rung: r.rung,
    encoder: { id: 'videotoolbox', label: 'VideoToolbox', hw: true }, note: null, white: null, bin: h.bin, args };
}
/** Where the picture sits on the Mac (the helper's `started` / `frame` line: its frame in global points, the picture's
 *  pixels, a window's app + id) → the input's target { pid (0 = the frontmost app — a display), wid (the window the keys
 *  must reach: an app's keys land in ITS key window — measured), ox, oy, sx, sy } (points per picture pixel). */
function macInputTarget(info) {
  const fr = info && info.frame, w = Number(info && info.w), h = Number(info && info.h);
  if (!fr || !(w > 0) || !(h > 0) || !(fr.w > 0) || !(fr.h > 0)) return null;
  const pid = Number.isInteger(info.pid) && info.pid > 0 ? info.pid : 0;
  return { pid, wid: pid && Number.isInteger(info.window) && info.window > 0 ? info.window : 0, ox: Number(fr.x) || 0, oy: Number(fr.y) || 0, sx: fr.w / w, sy: fr.h / h };
}
/** A picture pixel → the Mac's global point (2 decimals). No target = the pixel already is a point. */
function macPoint(target, x, y) {
  const r2 = (v) => Math.round(v * 100) / 100;
  if (!target) return { x: r2(x), y: r2(y) };
  return { x: r2(target.ox + x * target.sx), y: r2(target.oy + y * target.sy) };
}

// ── ONE WINDOW (lane stream-p2w-build, design q-041 r3 §3 P2w — the probe: lane stream-p2w-capture-probe) ─────────────
// THE HELPER: tools/vibespace-wgc/vibespace-wgc.cs (Windows.Graphics.Capture by HWND) is BUILT ON THE MACHINE by its agent
// with the in-box C# 5 compiler of .NET Framework 4.8 — no SDK, no binary in the repo (measured 1.1 s): every split
// System32\WinMetadata\*.winmd (a client Windows has no union Windows.winmd) + three facades of the same framework folder.
// The defines step down: MINUPDATE (MinUpdateInterval, Windows 11 24H2+) + BORDER (borderless capture, Windows 10 2004+) →
// BORDER → none. Its frames: a 16-byte head ("VSWF", u32 w, u32 h, u16 flags — 1 = a new picture, u8 bytes per pixel, u8 0)
// + w × h tight rows; its events: one JSON line each on stderr (wgcLine).
const WGC_HELPER = Object.freeze({
  name: 'vibespace-wgc', defines: Object.freeze([Object.freeze(['MINUPDATE', 'BORDER']), Object.freeze(['BORDER']), Object.freeze([])]),
  facades: Object.freeze(['System.Runtime.dll', 'System.Runtime.WindowsRuntime.dll', 'System.Runtime.InteropServices.WindowsRuntime.dll']),
  buildMs: 60000, headBytes: 16, magic: 'VSWF',
});
const WGC_RECIPE = '%WINDIR%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe /target:exe /platform:x64 /optimize+ /out:%LOCALAPPDATA%\\vibespace\\helpers\\vibespace-wgc.exe /r:<every %WINDIR%\\System32\\WinMetadata\\*.winmd> /r:<System.Runtime.dll, System.Runtime.WindowsRuntime.dll, System.Runtime.InteropServices.WindowsRuntime.dll of that framework folder> /define:MINUPDATE;BORDER vibespace-wgc.cs';
/** Where the helper is built and how. `winmd` = the file names in System32\WinMetadata; `hash` = the source's digest (the
 *  stamp: a changed source rebuilds). → { ok, csc, dir, src, exe, stampFile, stamp, tries: [{ define, argv }] } |
 *  { ok: false, code: 'helper_missing', error } (no folder to build into, no metadata to build against) */
function wgcBuildPlan({ windir = '', localAppData = '', winmd = [], hash = '' } = {}) {
  const missing = (why) => ({ ok: false, code: 'helper_missing', error: `the window helper cannot be built on this machine (${why}); the recipe: ${WGC_RECIPE}` });
  if (!windir || !localAppData) return missing('no %WINDIR% / %LOCALAPPDATA%');
  const md = (Array.isArray(winmd) ? winmd : []).filter((f) => /^[\w.-]+\.winmd$/i.test(String(f)));
  if (!md.length) return missing('no Windows metadata in System32\\WinMetadata');
  const union = md.find((f) => /^windows\.winmd$/i.test(f));
  const fw = `${windir}\\Microsoft.NET\\Framework64\\v4.0.30319`, wm = `${windir}\\System32\\WinMetadata`, dir = `${localAppData}\\vibespace\\helpers`;
  const src = `${dir}\\${WGC_HELPER.name}.cs`, exe = `${dir}\\${WGC_HELPER.name}.exe`;
  const refs = [...(union ? [union] : md).map((f) => `/r:${wm}\\${f}`), ...WGC_HELPER.facades.map((f) => `/r:${fw}\\${f}`)];
  const tries = WGC_HELPER.defines.map((d) => ({ define: d.join(';'), argv: ['/nologo', '/target:exe', '/platform:x64', '/optimize+', `/out:${exe}`, ...refs, ...(d.length ? [`/define:${d.join(';')}`] : []), src] }));
  return { ok: true, csc: `${fw}\\csc.exe`, dir, src, exe, stampFile: `${dir}\\${WGC_HELPER.name}.stamp`, stamp: `${WGC_HELPER.name} ${String(hash).slice(0, 16)}`, tries };
}
/** One helper frame head at `off` → { w, h, bpp, fresh, bytes } | { bad } (not ours: the stream is lost). */
function wgcHead(b, off = 0) {
  const m = WGC_HELPER.magic;
  if (b[off] !== m.charCodeAt(0) || b[off + 1] !== m.charCodeAt(1) || b[off + 2] !== m.charCodeAt(2) || b[off + 3] !== m.charCodeAt(3)) return { bad: 'the window helper did not write a frame head' };
  const u32 = (i) => (b[off + i] | (b[off + i + 1] << 8) | (b[off + i + 2] << 16)) + b[off + i + 3] * 16777216;
  const w = u32(4), h = u32(8), bpp = b[off + 14], fresh = (b[off + 12] & 1) === 1;
  if (!(w >= 2 && h >= 2 && w <= 16384 && h <= 16384 && (bpp === 4 || bpp === 8))) return { bad: `a frame head out of bounds (${w}×${h}, ${bpp} bytes a pixel)` };
  return { w, h, bpp, fresh, bytes: w * h * bpp };
}
/** One stderr line of the helper → its event object, or null (not one of its JSON lines). */
function wgcLine(line) {
  const l = String(line || '').trim();
  if (!l.startsWith('{')) return null;
  try { const v = JSON.parse(l); return v && typeof v.ev === 'string' ? v : null; } catch { return null; }
}

const WINDOW_DEFAULTS = Object.freeze({ fps: 30 });
// THE WINDOW ROAD'S RATE (lane stream-window-fixes): THE RATE above at the window's size, and its picture refreshed by an
// intra-refresh wave — a column of intra blocks sweeping the picture once per GOP — instead of a periodic IDR (the whole picture
// re-coded in one frame of a two-frame VBV: the blurry key frame, then P-frames sharpening it, then the next key frame). A key
// frame only when the viewer asks (PLI ⇒ the encoder restarts: its first picture is one).
/** The encoders whose intra-refresh wave was measured (the owner's NVENC; x264 on the lane's box): ONE key frame at the start,
 *  then the GOP is the wave's period. AMF and Quick Sync keep the periodic GOP (not measured on any machine of ours). */
const WINDOW_REFRESH = Object.freeze({ h264_nvenc: Object.freeze(['-intra-refresh', '1']), libx264: Object.freeze(['-intra-refresh', '1']) });
/** MinUpdateInterval for a rate: 30 fps → 33 ms, 60 → 16 (the probe: 33 ms paces the source at ~27–30 and halves the readback). */
const windowIntervalMs = (fps) => Math.max(1, Math.floor(1000 / Math.max(1, fps)));
/**
 * ONE WINDOW's plan. `facts` = { platform, ffmpeg, displays (the stream facts), helper: { ok, exe, error } }; `window` = the
 * window (src/stream-window.js windowSourceOf). THE BGRA ROAD by default — WGC's 8-bit frame of an SDR window is the exact
 * picture on an HDR display too (the probe: 99.974 % identical to the mapped FP16), so no mapper: the helper's BGRA → ffmpeg
 * (BT.709 limited, NV12) → the encoder ladder → FLV. `fp16` (the start route's flag, off by default) = the FP16 road: scRGB like DDA →
 * THE table (white of the window's display) → NV12 → the encoder — only on an HDR display (an SDR display: BGRA, `note`).
 * The source sends WINDOW pixels (origin 0,0, `relative`): the daemon adds the window's live place to every pointer event.
 * THE RATE: `floor` = kbpsFloor at the window's size (the source moves it with each new size), `refresh` = the encoder
 * refreshes by an intra-refresh wave (WINDOW_REFRESH) — no periodic key frame.
 * → { ok, mode: 'window-bgra' | 'window-f16', fmt, window, origin, relative, w, h, fps, interval, kbps, floor, refresh, gop,
 *   white, tone, encoder, note, ffmpeg, helper } | { ok: false, code, error }
 */
function planWindow(facts, { window = null, fps = WINDOW_DEFAULTS.fps, kbps = 8000, fp16 = false, tone = TONE_DEFAULT } = {}) {
  const f = facts || {};
  if (f.platform !== 'win32') return { ok: false, code: 'not_windows', error: `the window source captures a Windows window (this machine runs ${f.platform || 'an unknown system'})` };
  if (!f.helper || !f.helper.ok || !f.helper.exe) return { ok: false, code: 'helper_missing', error: (f.helper && f.helper.error) || `the window helper is not built on this machine; the recipe: ${WGC_RECIPE}` };
  if (!f.ffmpeg || !f.ffmpeg.path) return { ok: false, code: 'no_ffmpeg', error: `this machine needs ffmpeg with an H.264 encoder (looked in ${LOOKED})` };
  const w = window && window.bounds ? window : null;
  if (!w) return { ok: false, code: 'window_gone', error: 'that window is not on the machine any more' };
  const pe = pickEncoder(f.ffmpeg.encoders);
  if (!pe.ok) return pe;
  const d = (Array.isArray(f.displays) ? f.displays : []).find((x) => x.id === w.display) || null;
  const f16 = !!fp16 && !!d && d.hdr === true && d.white > 0;
  const r = Math.max(1, Math.min(120, Math.round(Number(fps) || WINDOW_DEFAULTS.fps)));
  const rate = Math.max(SCREEN_DEFAULTS.minKbps, Math.round(Number(kbps) || 8000));
  return {
    ok: true, mode: f16 ? 'window-f16' : 'window-bgra', fmt: f16 ? 'f16' : 'bgra',
    window: { id: w.id, title: w.title, app: w.app, display: w.display, dpi: w.dpi, bounds: { ...w.bounds }, minimized: !!w.minimized },
    origin: { x: 0, y: 0 }, relative: true, w: w.bounds.w & ~1, h: w.bounds.h & ~1, fps: r, interval: windowIntervalMs(r),
    kbps: rate, floor: kbpsFloor({ w: w.bounds.w, h: w.bounds.h, fps: r, cap: rate }), refresh: Object.hasOwn(WINDOW_REFRESH, pe.encoder.id), gop: r * SCREEN_DEFAULTS.gopSeconds,
    white: f16 ? d.white : null, tone: { knee: tone.knee, peak: tone.peak }, encoder: pe.encoder,
    note: pe.note || (fp16 && !f16 ? 'fp16_sdr_display' : null), ffmpeg: f.ffmpeg.path, helper: f.helper.exe,
  };
}
/** The helper's capture argv for a plan. */
function wgcCaptureArgv(plan) { return ['capture', '--hwnd', String(plan.window.id), '--fmt', plan.fmt, '--fps', String(plan.fps), '--interval', String(plan.interval)]; }
/** The encoder ffmpeg of a window at its CURRENT size (`w` × `h`, even — the helper's frame head): BGRA through the direct
 *  road's own conversion (BT.709 limited → NV12), or the agent's mapped NV12 (the FP16 road); the intra-refresh wave where the
 *  encoder has one (plan.refresh — the GOP is then its period). */
function windowEncodeArgv(plan, { w = plan.w, h = plan.h, kbps = plan.kbps } = {}) {
  const input = plan.fmt === 'f16' ? ['-pix_fmt', 'nv12'] : ['-pix_fmt', 'bgra'];
  const vf = plan.fmt === 'f16' ? [] : ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=nv12'];
  const extra = plan.refresh && Object.hasOwn(WINDOW_REFRESH, plan.encoder.id) ? WINDOW_REFRESH[plan.encoder.id] : [];
  return [...QUIET, '-f', 'rawvideo', ...input, '-video_size', `${w}x${h}`, '-framerate', String(plan.fps), '-i', 'pipe:0', ...vf, ...encodeTail(plan.encoder, { kbps, fps: plan.fps, gop: plan.gop, extra })];
}

module.exports = {
  halfToFloat, srgbOetf, TONE_DEFAULT, toneCurve, mapLinear, srgb8OfHalf, buildLut, nv12FromHalf, nv12Bytes, CALIBRATION,
  PQ, SCRGB_NITS, BT709_TO_BT2020, BT2020, HDR_VUI, pqOetf, pqCodeOfNits, buildPqTables, pqOfHalf, p010FromHalf, p010Bytes, HDR_LADDER, hdrFactsOf, hdrEncodeArgv, KBPS_FLOOR_HDR,
  ENCODER_LADDER, pickEncoder, FFMPEG_MIN_MAJOR, ffmpegCandidates, parseFfmpegFacts, ffmpegVerdict, STREAM_FACTS_PS, parseStreamFacts, unthrottlePs, parseUnthrottle, screenDisplayRows, MAPPED_MIN_W, mappedStepOf, scaledInputOf,
  SCREEN_DEFAULTS, planScreen, captureArgv, encodeArgv, directArgv, stillArgv, stillHalfArgv, rgbFromHalf, pngOf, pngSize, KBPS_RULE, kbpsDecision, MAC_KBPS_RULE, flvReader,
  KBPS_FLOOR, kbpsFloor, RATE_RULE, MAC_RATE_RULE, rateDecision, rateFollower, twccPackets, sendEstimator, GONE_RULE, displaySeen, judgeGone, captureRestart,
  MAC_HELPER, MAC_SETTINGS, MAC_LADDER, MAC_WHY, macHelperPaths, macHelperSourceFile, macBuildPlan, macHelperSpawn, parseMacFacts, windowSourceOf, macDisplayOf, macWindowRows,
  macRungOf, planMacScreen, macInputTarget, macPoint,
  WGC_HELPER, WGC_RECIPE, wgcBuildPlan, wgcHead, wgcLine, WINDOW_DEFAULTS, WINDOW_REFRESH, windowIntervalMs, planWindow, wgcCaptureArgv, windowEncodeArgv,
};
