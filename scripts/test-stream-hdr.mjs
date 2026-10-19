#!/usr/bin/env node
// THE HDR ROAD — PURE (lane stream-hdr-passthrough — design q-041 r3 P4 road B, owner 2026-10-19 「可以 按你推荐来」; the numbers:
// lane stream-hdr-probe's report). What the machine runs is what is proven here:
//   §1 THE VIEWER GATE (src/hdr-viewer.js): the probe's measured browsers → the switch (Linux Chrome: supported, smooth, NOT
//      power-efficient ⇒ no — its WebRTC decoder refuses 10-bit; the owner's Edge / Mac Chrome ⇒ yes on an HDR screen; an SDR
//      screen ⇒ no); the query IS the probe's row; the machine's word (an older agent ⇒ no); the per-machine memory (off by
//      default, ≤ 32 machines)
//   §2 THE FALLBACK RULE (hdrStallStep): bytes without a decoded frame for 2 s ⇒ failed; a decoded frame clears it; a second
//      without bytes is not a refusal; once frames were decoded the bound is 5 s (a lost key frame waits ≤ one GOP)
//   §3 THE PQ MAPPING (src/stream-plan.js buildPqTables + p010FromHalf): scRGB greys 0 / 0.18 / 1 / 2.5 / 10 (× 80 nits) → their
//      10-bit codes by ST 2084 written HERE (a second implementation) and the probe's clip codes (100 / 203 / 1000 nits → 509 /
//      573 / 723 — every decoder read them back exactly); the table equals the formula on every FP16 pattern within 0.1 code;
//      THE COLOUR ROUND TRIP: the owner's calibration patches + a wide-gamut green (a negative scRGB channel) → P010 → a decoder's
//      inverse (BT.2020-NCL, the PQ EOTF, BT.2020 → BT.709) = the source's nits (RED CONTROL: per-channel PQ without BT.2087's
//      3×3 loses the negative channel); 10 bits vs road A's 8 (the probe's banding): ≥ 3.9× the codes over 0–1000 nits; ② step 2
//   §4 THE AV1 PACKETIZER (src/stream-av1.js) over THE fixtures (scripts/fixtures/stream/fake-desk-av1-{10,8}.ivf): byte for
//      byte the P4 probe's MEASURED packetizer (the one Chrome decoded — copied verbatim below) at three MTUs; the receiver's
//      view gets every OBU back; Z / Y per packet, N on a new sequence, the marker on the last, no payload over the bound; the
//      IVF reader in odd chunks = the file's units, keys at the sequence headers, a key without one gets it in front
//   §5 THE PLAN: `hdr` on an HDR display with av1_nvenc ⇒ mode hdr (P010 → av1_nvenc → IVF, the frames tagged, never an output
//      -color_* — RED CONTROL: the probe's trap argv is caught), `sdr` = the mapped plan exactly; an SDR display / no AV1 encoder
//      ⇒ the old plan + why; THE SDR ROADS UNCHANGED: hdr off, the encode / direct / capture argvs are byte for byte the pinned
//      2.369.313 ones; the HDR floor row; the mapper worker's p010 road = the function
//   §6 THE REAL LEG'S TWO FINDINGS: a browser's mDNS candidate is told apart (the agent never hands one to werift — its 10 s multicast
//      wait sat inside the answer); the power-throttling opt-out script (ProcessPowerThrottling, EXECUTION_SPEED off, the pids only)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MessageChannel } from 'node:worker_threads';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const A = require(path.join(REPO, 'src/stream-av1.js'));
const HV = require(path.join(REPO, 'src/hdr-viewer.js'));
const SS = require(path.join(REPO, 'src/agentd/stream-screen.js'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** number → the nearest IEEE half's bits (what DDA's FP16 surface holds) */
function toHalf(x) {
  const f = new Float32Array(1), u = new Uint32Array(f.buffer); f[0] = x;
  const b = u[0], s = (b >>> 16) & 0x8000, e = ((b >>> 23) & 0xff) - 127 + 15, m = b & 0x7fffff;
  if (e >= 31) return s | 0x7c00;
  if (e <= 0) return s | ((m | 0x800000) >>> (14 - e));
  let h = s | (e << 10) | (m >>> 13);
  const rest = m & 0x1fff;
  if (rest > 0x1000 || (rest === 0x1000 && (h & 1))) h++;
  return h;
}
// ST 2084, written here a second time (the suite's own — never the module's)
const PQ_M1 = 2610 / 16384, PQ_M2 = (2523 / 4096) * 128, PQ_C1 = 3424 / 4096, PQ_C2 = (2413 / 4096) * 32, PQ_C3 = (2392 / 4096) * 32;
const pqRef = (nits) => { const y = Math.max(0, Math.min(1, nits / 10000)), v = y ** PQ_M1; return ((PQ_C1 + PQ_C2 * v) / (1 + PQ_C3 * v)) ** PQ_M2; };
const eotfRef = (e) => { const v = Math.max(0, e) ** (1 / PQ_M2); return 10000 * (Math.max(0, v - PQ_C1) / (PQ_C2 - PQ_C3 * v)) ** (1 / PQ_M1); };

console.log('§1 the viewer gate');
{
  const V = HV.hdrViewerVerdict;
  // the probe's mediaCapabilities.decodingInfo answers for `webrtc AV1 pq` (rec2020 4K60 20 Mb/s): supported / smooth / powerEfficient
  const linux = { supported: true, smooth: true, powerEfficient: false }, edge = { supported: true, smooth: true, powerEfficient: true }, mac = { supported: true, smooth: true, powerEfficient: true };
  const rows = [
    ['Linux Chrome 154 on an SDR screen', { dynamicRange: false, decoding: linux }, false, 'sdr_screen'],
    ['Linux Chrome 154 on an HDR screen (software dav1d — its WebRTC decoder refuses 10-bit)', { dynamicRange: true, decoding: linux }, false, 'no_hw_av1'],
    ['the owner\'s Edge 155 on an HDR screen (hardware AV1: 116 frames bt2020/PQ)', { dynamicRange: true, decoding: edge }, true, 'ok'],
    ['the owner\'s Edge 155 on an SDR screen (an SDR viewer tone-maps PQ: the desktop dims)', { dynamicRange: false, decoding: edge }, false, 'sdr_screen'],
    ['Mac Chrome 155 on an HDR screen', { dynamicRange: true, decoding: mac }, true, 'ok'],
    ['a browser without mediaCapabilities', { dynamicRange: true, decoding: null }, false, 'no_api'],
    ['a decoder that says not supported', { dynamicRange: true, decoding: { supported: false, smooth: false, powerEfficient: false } }, false, 'no_hw_av1'],
    ['dynamic-range unknown (no matchMedia answer)', { decoding: edge }, false, 'sdr_screen'],
  ];
  const off = rows.filter(([, input, show, code]) => { const v = V(input); return v.show !== show || v.code !== code; });
  ok(off.length === 0, `the measured browsers → the switch: ${rows.map(([n, , s]) => `${n} ${s ? 'SHOWS' : 'no'}`).join(' · ')}`, off.map(([n, i]) => [n, V(i)]));
  const q = HV.HDR_DECODE_QUERY;
  ok(q.type === 'webrtc' && q.video.contentType === 'video/AV1' && q.video.width === 3840 && q.video.height === 2160 && q.video.framerate === 60 && q.video.bitrate === 20e6 && q.video.colorGamut === 'rec2020' && q.video.transferFunction === 'pq' && q.video.hdrMetadataType === 'smpteSt2086' && HV.DYNAMIC_RANGE_QUERY === '(dynamic-range: high)',
    'the question asked IS the probe\'s measured row (webrtc · video/AV1 · 3840×2160 @ 60 · 20 Mb/s · rec2020 · pq · smpteSt2086) and the screen\'s (dynamic-range: high)', q);
  const M = HV.hdrMachineVerdict;
  ok(same(M(null), { can: false, why: 'agent_too_old' }) && same(M({ kind: 'screen' }), { can: false, why: 'agent_too_old' }) && same(M({ hdr: { can: true, on: false, why: null } }), { can: true, why: null }) && same(M({ hdr: { can: false, why: 'sdr_display' } }), { can: false, why: 'sdr_display' }),
    'the machine\'s word: an offer without `hdr` (an agent older than this lane, a Mac, one window) ⇒ no switch; `can` ⇒ yes; a refusal keeps its why');
  let mem = null;
  ok(!HV.hdrRemembered(mem, 'h1') && !HV.hdrRemembered('{bad json', 'h1') && !HV.hdrRemembered('{"h1":"yes"}', 'h1'), 'OFF by default (no memory, garbage, a non-true value)');
  mem = HV.rememberHdr(mem, 'h1', true); mem = HV.rememberHdr(mem, 'h2', true);
  ok(HV.hdrRemembered(mem, 'h1') && HV.hdrRemembered(mem, 'h2') && !HV.hdrRemembered(mem, 'h3'), 'remembered per machine (h1 and h2 on, h3 not)', mem);
  mem = HV.rememberHdr(mem, 'h1', false);
  ok(!HV.hdrRemembered(mem, 'h1') && HV.hdrRemembered(mem, 'h2') && !('h1' in JSON.parse(mem)), 'turned off = forgotten (off is the default)', mem);
  let big = null; for (let i = 0; i < 40; i++) big = HV.rememberHdr(big, 'm' + i, true);
  ok(Object.keys(JSON.parse(big)).length === 32 && !HV.hdrRemembered(big, 'm0') && HV.hdrRemembered(big, 'm39'), 'at most 32 machines, the newest kept');
}

console.log('§2 the fallback rule');
{
  const run = (readings) => { let st = null; const out = []; for (const r of readings) { const x = HV.hdrStallStep(st, r); st = x.st; out.push(x.failed); } return out; };
  const R = (at, frames, bytes) => ({ at, frames, bytes });
  ok(same(run([R(0, 0, 4000), R(1000, 0, 90000), R(2000, 0, 180000)]), [false, false, true]), 'bytes arrive, no frame decoded for 2 s ⇒ failed at the third reading (Linux Chrome\'s 10-bit refusal)');
  ok(same(run([R(0, 0, 4000), R(1000, 30, 90000), R(2000, 60, 180000), R(3000, 90, 260000)]), [false, false, false, false]), 'a decoder that decodes ⇒ never');
  ok(same(run([R(0, 0, 0), R(1000, 0, 0), R(2000, 0, 0), R(3000, 0, 0)]), [false, false, false, false]), 'no bytes yet (ICE still connecting) ⇒ not a refusal');
  ok(same(run([R(0, 0, 4000), R(1000, 0, 4000), R(2000, 0, 4000), R(3000, 0, 4000)]), [false, false, true, true]) && same(run([R(0, 0, 0), R(1000, 0, 0), R(2000, 0, 5000), R(3000, 0, 9000), R(4000, 0, 12000)]), [false, false, false, false, true]),
    'the watch starts with the first bytes (a quiet second keeps it, never restarts it)');
  ok(same(run([R(0, 10, 1000), R(1000, 40, 9e4), R(2000, 40, 18e4), R(4000, 40, 3e5), R(6000, 40, 4e5), R(7000, 40, 5e5)]), [false, false, false, false, false, true]) && same(run([R(0, 10, 1000), R(1000, 40, 9e4), R(2000, 40, 18e4), R(4000, 40, 3e5), R(5000, 70, 4e5)]), [false, false, false, false, false]),
    'MID-STREAM: once frames were decoded a stall fails at 5 s (a lost key frame waits ≤ one 2 s GOP + its PLI — the next key frame clears it)');
  ok(HV.HDR_STALL.ms === 2000 && HV.HDR_STALL.midMs === 5000, 'the bounds: 2 s (the brief\'s «0 frames in 2 s while sending»), 5 s mid-stream');
}

console.log('§3 the PQ mapping');
const T = SP.buildPqTables();
{
  ok(SP.pqCodeOfNits(100) === 509 && SP.pqCodeOfNits(203) === 573 && SP.pqCodeOfNits(1000) === 723 && SP.pqCodeOfNits(0) === 64 && SP.pqCodeOfNits(10000) === 940, 'the probe\'s clip codes (100 / 203 / 1000 nits → 509 / 573 / 723 — every decoder read them back exactly), black 64, 10 000 nits 940', [100, 203, 1000].map(SP.pqCodeOfNits));
  // the brief's greys: scRGB 0, 0.18, 1, 2.5, 10 (× 80 nits) → a 2×2 frame each → P010 → its luma, against ST 2084 written here
  const greys = [0, 0.18, 1, 2.5, 10];
  const src = new Uint16Array(greys.length * 2 * 2 * 4);
  greys.forEach((v, k) => { for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = (y * greys.length * 2 + k * 2 + x) * 4; src[i] = src[i + 1] = src[i + 2] = toHalf(v); src[i + 3] = 15360; } });
  const out = new Uint16Array(greys.length * 2 * 2 * 3 / 2);
  const bytes = SP.p010FromHalf(src, greys.length * 2, 2, T, out);
  const got = greys.map((v, k) => ({ v, y: out[k * 2] >> 6, cb: out[greys.length * 4 + k * 2] >> 6, cr: out[greys.length * 4 + k * 2 + 1] >> 6, want: Math.round(64 + 876 * pqRef(SP.halfToFloat(toHalf(v)) * 80)) }));
  ok(got.every((g) => g.y === g.want && g.cb === 512 && g.cr === 512) && bytes === greys.length * 2 * 2 * 3, `scRGB greys → 10-bit PQ luma by ST 2084 (written here): ${got.map((g) => `${g.v} → ${g.y}`).join(', ')} (0 / 14.4 / 80 / 200 / 800 nits); chroma 512 (grey stays grey)`, got);
  ok(same(got.map((g) => g.y), [64, 352, 490, 571, 701]), 'the same codes pinned (a change of the curve shows here)', got.map((g) => g.y));
  ok(out.every((s) => (s & 63) === 0), 'P010: every sample\'s 10 bits sit high (value << 6), the low 6 bits zero');
  let worst = 0, at = null;
  for (let h = 0; h < 0x7c00; h++) { const L = SP.halfToFloat(h) * 80; const e = Math.abs(SP.pqOfHalf(h, h, h, T)[0] - pqRef(L)) * 876; if (e > worst) { worst = e; at = h; } }
  ok(worst < 0.1, `the tables equal the formula on every positive FP16 pattern within ${worst.toFixed(3)} of a 10-bit code (< 0.1)`, { worst, at });
  ok(SP.pqOfHalf(0x8000 | 15360, 0, 0, T)[0] === 0 && SP.pqOfHalf(0x7c00, 0x7c00, 0x7c00, T)[0] === 0 && SP.pqOfHalf(0x7e00, 0, 0, T)[0] === 0 && SP.pqOfHalf(0x7bff, 0x7bff, 0x7bff, T)[0] === 1, 'a negative / inf / NaN channel ⇒ 0 (never a wild code), 65 504 × 80 nits ⇒ the top (1)');
}
{
  // THE COLOUR ROUND TRIP: patches → P010 (8×8 each, a flat block) → a decoder's inverse → BT.709 nits
  const M = SP.BT709_TO_BT2020, inv = (() => { const [a, b, c, d, e, f, g, h, i] = M, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g); return [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]; })();
  const W2 = SP.CALIBRATION.white, KR = 0.2627, KB = 0.0593, KG = 1 - KR - KB;
  const patches = [...SP.CALIBRATION.rows.map(([label, , bits]) => ({ label, bits })), { label: 'wide-gamut green (scRGB −0.2, 2.4, −0.1)', bits: [toHalf(-0.2), toHalf(2.4), toHalf(-0.1)] }, { label: 'a 1000-nit HDR white', bits: [toHalf(12.5), toHalf(12.5), toHalf(12.5)] }];
  const S = 8, w = patches.length * S, h = S, src = new Uint16Array(w * h * 4);
  patches.forEach((p, k) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * w + k * S + x) * 4; src[i] = p.bits[0]; src[i + 1] = p.bits[1]; src[i + 2] = p.bits[2]; src[i + 3] = 15360; } });
  const decode = (out, k) => {
    const x = k * S + 2, y = 2, Y = ((out[y * w + x] >> 6) - 64) / 876, c = w * h + (y >> 1) * w + (x & ~1), Cb = ((out[c] >> 6) - 512) / 896, Cr = ((out[c + 1] >> 6) - 512) / 896;
    const R = Y + 2 * (1 - KR) * Cr, B = Y + 2 * (1 - KB) * Cb, G = (Y - KR * R - KB * B) / KG;
    const lin = [R, G, B].map(eotfRef); // BT.2020 nits
    return [inv[0] * lin[0] + inv[1] * lin[1] + inv[2] * lin[2], inv[3] * lin[0] + inv[4] * lin[1] + inv[5] * lin[2], inv[6] * lin[0] + inv[7] * lin[1] + inv[8] * lin[2]];
  };
  const out = new Uint16Array(w * h * 3 / 2); SP.p010FromHalf(src, w, h, T, out);
  // the error of each channel against the patch's own level (its brightest channel): a 0-nit channel of a 200-nit red is judged against 200
  const rows = patches.map((p, k) => { const want = p.bits.map((b) => SP.halfToFloat(b) * 80), got = decode(out, k), level = Math.max(1, ...want.map(Math.abs)); return { label: p.label, want: want.map((v) => +v.toFixed(2)), got: got.map((v) => +v.toFixed(2)), err: Math.max(...want.map((v, i) => Math.abs(got[i] - v) / level)) }; });
  const step200 = eotfRef((Math.round(64 + 876 * pqRef(200)) + 1 - 64) / 876) / 200 - 1; // one 10-bit PQ code at 200 nits, as a fraction
  const bad = rows.filter((r) => r.err > 1.5 * step200);
  ok(bad.length === 0, `THE COLOUR ROUND TRIP: the owner's ${SP.CALIBRATION.rows.length} calibration patches (SDR white ${W2 * 0.08} nits), a wide-gamut green and a 1000-nit white → P010 → BT.2020-NCL⁻¹ → PQ EOTF → BT.2020→709 = their nits within 1.5 PQ codes (one 10-bit code at 200 nits = ${(step200 * 100).toFixed(2)} %); worst ${(Math.max(...rows.map((r) => r.err)) * 100).toFixed(2)} %`, bad);
  const g = rows.find((r) => /wide-gamut/.test(r.label));
  ok(g.got[0] < -10 && g.got[2] < -4, `the wide-gamut green keeps its NEGATIVE BT.709 red / blue (−16 / −8 nits — a colour outside sRGB, inside BT.2020): ${g.got}`, g);
  // RED CONTROL: per-channel PQ (no BT.2087 3×3 — BT.709 primaries as BT.2020's) — the same decoder sees a different colour, the negative channel gone
  const mut = { lin: T.lin, pq: T.pq }, saved = SP.BT709_TO_BT2020.slice();
  const flat = (bits) => bits.map((b) => SP.pqOfHalf(b, b, b, T)[0]);
  const gm = flat(patches.find((p) => /wide-gamut/.test(p.label)).bits);
  ok(gm[0] === 0 && gm[2] === 0 && saved.length === 9 && mut.lin === T.lin, 'RED CONTROL: per channel without the 3×3 the wide-gamut green\'s red and blue clip to 0 (the colour is lost) — the matrix is what keeps it', gm);
  // 10 bits vs road A's 8: the code steps over 0 → 203 and 0 → 1000 nits (PQ is monotonic: every code between is reached)
  const span = (nits, lo, k) => Math.round(lo + k * pqRef(nits)) - lo;
  const s8 = [span(203, 16, 219), span(1000, 16, 219)], s10 = [span(203, 64, 876), span(1000, 64, 876)];
  ok(s8[0] === 127 && s10[0] === 509 && s10[1] === 659 && s8[1] === 165, `NO BANDS: 0–203 nits gets ${s10[0]} 10-bit steps against road A's ${s8[0]} 8-bit (the probe's «127 codes (16–143)» — the bands the owner saw in the H.264 8-bit ramp), 0–1000 nits ${s10[1]} against ${s8[1]}`, { s8, s10 });
  // ② step 2: the half-size picture = every 2nd pixel mapped
  const big = new Uint16Array(16 * 8 * 4); for (let i = 0; i < big.length; i += 4) { big[i] = toHalf((i % 61) / 7); big[i + 1] = toHalf((i % 37) / 9); big[i + 2] = toHalf((i % 23) / 5); big[i + 3] = 15360; }
  const sub = new Uint16Array(8 * 4 * 4); for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) for (let c = 0; c < 4; c++) sub[(y * 8 + x) * 4 + c] = big[((y * 2) * 16 + x * 2) * 4 + c];
  const o2 = new Uint16Array(8 * 4 * 3 / 2), o1 = new Uint16Array(8 * 4 * 3 / 2);
  ok(SP.p010FromHalf(big, 16, 8, T, o2, 2) === 8 * 4 * 3 && (SP.p010FromHalf(sub, 8, 4, T, o1), same([...o2], [...o1])), '② step 2: a 16×8 frame mapped at every 2nd pixel = the 8×4 frame of those pixels');
  ok(SP.p010FromHalf(new Uint16Array(5 * 3 * 4), 5, 3, T, new Uint16Array(4 * 2 * 3 / 2)) === SP.p010Bytes(5, 3) && SP.p010Bytes(5, 3) === 4 * 2 * 3 && SP.p010Bytes(3840, 2160) === 3840 * 2160 * 3, 'odd sizes map their even part (5×3 → 4×2), 3 bytes a pixel (4K: 24.9 MB — twice NV12)');
}

console.log('§4 the AV1 packetizer');
const FIX = path.join(REPO, 'scripts/fixtures/stream');
// THE P4 PROBE'S PACKETIZER, verbatim (scripts/probes/stream-hdr/webrtc-leg.mjs av1Payloads — MEASURED: Chrome decoded it, 34 frames 8-bit)
const leb = (n) => { const o = []; do { let b = n & 127; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); return Buffer.from(o); };
function av1Payloads(tu, mtu = 1100) {
  const obus = [];
  for (let o = 0; o < tu.length;) {
    const h = tu[o], type = (h >> 3) & 15, hl = 1 + ((h >> 2) & 1);
    let size = tu.length - o - hl, sl = 0;
    if ((h >> 1) & 1) { size = 0; let s = 0, b; do { b = tu[o + hl + sl]; size += (b & 127) * 2 ** s; s += 7; sl++; } while (b & 128); }
    const head = Buffer.from(tu.subarray(o, o + hl)); head[0] &= ~2;
    if (type !== 2 && type !== 8 && type !== 15) obus.push({ type, b: Buffer.concat([head, tu.subarray(o + hl + sl, o + hl + sl + size)]) });
    o += hl + sl + size;
  }
  const key = obus.some((x) => x.type === 1), out = [];
  let cur = [], room = mtu - 1, Z = 0;
  const flush = (Y) => { out.push(Buffer.concat([Buffer.from([(Z << 7) | (Y << 6) | ((key && out.length === 0 ? 1 : 0) << 3)]), ...cur])); cur = []; room = mtu - 1; Z = Y; };
  for (const { b } of obus) {
    let rest = b;
    while (rest.length) {
      const take = Math.min(rest.length, room - leb(Math.min(rest.length, room)).length);
      if (take <= 0) { flush(0); continue; }
      cur.push(leb(take), rest.subarray(0, take)); room -= leb(take).length + take; rest = rest.subarray(take);
      if (rest.length) flush(1);
    }
  }
  if (cur.length) flush(0);
  return { key, payloads: out };
}
for (const name of ['fake-desk-av1-10.ivf', 'fake-desk-av1-8.ivf']) {
  const file = fs.readFileSync(path.join(FIX, name));
  const tus = A.ivfReader().push(file).filter((e) => e.type === 'tu');
  let same3 = 0, n = 0, back = 0, bits = 0, sizes = 0, marks = 0;
  for (const t of tus) for (const mtu of [1100, 300, 64]) {
    n++;
    const a = A.rtpPayloads(t.tu, mtu), b = av1Payloads(Buffer.from(t.tu), mtu);
    if (a.payloads.length === b.payloads.length && a.payloads.every((p, i) => Buffer.compare(Buffer.from(p.payload), b.payloads[i]) === 0)) same3++;
    const got = A.depacketize(a.payloads.map((p) => p.payload)), want = A.obusOf(t.tu).filter((o) => o.type !== A.OBU.td);
    if (got && got.length === want.length && got.every((o, i) => o.type === want[i].type && Buffer.compare(Buffer.from(o.body), Buffer.from(want[i].body)) === 0)) back++;
    if (a.payloads.every((p, i) => (i === 0 || ((p.payload[0] >> 7) === ((a.payloads[i - 1].payload[0] >> 6) & 1))) && (((p.payload[0] >> 3) & 1) === (i === 0 && t.key && t.seq ? 1 : 0)) && ((p.payload[0] >> 4) & 3) === 0)) bits++;
    if (a.payloads.every((p) => p.payload.length <= mtu)) sizes++;
    if (a.payloads.every((p, i) => p.marker === (i === a.payloads.length - 1))) marks++;
  }
  ok(tus.length === 60 && same3 === n, `${name}: the ${tus.length} temporal units at MTUs 1100 / 300 / 64 are BYTE FOR BYTE the P4 probe's measured packetizer (${same3}/${n})`);
  ok(back === n && bits === n && sizes === n && marks === n, `${name}: the receiver's view gets every OBU back (the temporal delimiter dropped) · Z = the last packet's Y, N only on a sequence's first packet, W = 0 · no payload over the bound · the marker on the last (${back}/${bits}/${sizes}/${marks} of ${n})`);
}
{
  const file = fs.readFileSync(path.join(FIX, 'fake-desk-av1-10.ivf'));
  const all = A.ivfReader().push(file).filter((e) => e.type === 'tu');
  const r = A.ivfReader(), got = [];
  for (let i = 0; i < file.length; i += 777) got.push(...r.push(file.subarray(i, i + 777)));
  ok(got.length === all.length && got.every((e, i) => Buffer.compare(Buffer.from(e.tu), Buffer.from(all[i].tu)) === 0 && e.key === all[i].key), 'the IVF reader fed in 777-byte chunks = the whole file\'s units, in order');
  ok(same(all.map((e, i) => (e.key ? i : -1)).filter((i) => i >= 0), [0, 30]) && all.filter((e) => e.key).every((e) => e.seq) && same(all.slice(0, 3).map((e) => e.ptsMs), [0, 33, 67]), 'keys at 0 and 30 (a key frame a second), each with its sequence header; IVF pts → ms');
  // a key unit WITHOUT its sequence header (an encoder that writes it once) gets the last one in front
  const units = []; for (let o = 32; o < file.length;) { const n = file.readUInt32LE(o); units.push(file.subarray(o, o + 12 + n)); o += 12 + n; }
  const strip = (u) => { const tu = u.subarray(12), keep = Buffer.concat(A.obusOf(tu).filter((o) => o.type !== A.OBU.seq).map((o) => Buffer.concat([Buffer.from([o.head[0] | 2, ...o.head.subarray(1)]), A.leb128(o.body.length), Buffer.from(o.body)]))); const hd = Buffer.from(u.subarray(0, 12)); hd.writeUInt32LE(keep.length, 0); return Buffer.concat([hd, keep]); };
  const lean = Buffer.concat([file.subarray(0, 32), ...units.map((u, i) => (i === 30 ? strip(u) : u))]);
  const k30 = A.ivfReader().push(lean).filter((e) => e.type === 'tu')[30];
  ok(k30.key && k30.seq && A.obusOf(k30.tu)[0].type === A.OBU.seq && !A.obusOf(units[30].subarray(12)).every((o, i, a) => o.type !== A.OBU.seq) && A.obusOf(strip(units[30]).subarray(12)).every((o) => o.type !== A.OBU.seq), 'a key unit that lacks the sequence header gets the last one in front (a browser that joins at a key frame needs it — flvReader\'s SPS/PPS rule)');
  ok(same(A.ivfReader().push(Buffer.from('FLV\x01\x01\0\0\0\x09\0\0\0\0' + ' '.repeat(40))), [{ type: 'bad', error: 'the encoder did not write IVF' }]), 'not IVF ⇒ `bad` by name (the session ends encoder_exited)');
}

console.log('§5 the plan');
{
  const ff = { path: 'C:\\ff\\ffmpeg.exe', version: '7.1', major: 7, ddagrab: true, encoders: ['h264_nvenc', 'av1_nvenc', 'libx264'] };
  const D1 = { id: 'D1', x: 0, y: 0, w: 3840, h: 2160, primary: true, hdr: true, white: 2500, adapter: 0, output: 0 };
  const D2 = { id: 'D2', x: -1920, y: 100, w: 1920, h: 1080, primary: false, hdr: false, white: 1000, adapter: 0, output: 1 };
  const facts = (o = {}) => ({ platform: 'win32', ffmpeg: ff, displays: [D1, D2], ...o });
  ok(same(SP.parseFfmpegFacts('ffmpeg version 7.1-full_build', '', ' V....D h264_nvenc   NVENC\n V....D av1_nvenc   NVIDIA NVENC av1 encoder (codec av1)\n V....D libsvtav1  SVT\n').encoders, ['h264_nvenc', 'av1_nvenc']), 'the ffmpeg facts keep av1_nvenc (the HDR rung) beside the H.264 ladder');
  const m = SP.planScreen(facts()), hd = SP.planScreen(facts(), { hdr: true });
  ok(m.ok && m.mode === 'mapped' && same(m.hdr, { can: true, on: false, why: null }), 'hdr NOT asked on the HDR display: the mapped road as before, the offer\'s word `can` (the page may show the switch)', m.hdr);
  ok(hd.ok && hd.mode === 'hdr' && hd.encoder.id === 'av1_nvenc' && hd.encoder.codec === 'AV1' && same(hd.hdr, { can: true, on: true, why: null }) && hd.w === 3840 && hd.h === 2160 && hd.fps === 30 && hd.gop === 60 && hd.white === 2500 && hd.tone === null,
    'hdr asked on the HDR display with av1_nvenc ⇒ mode hdr: NVENC AV1, the display\'s size and rate, the same capture', hd);
  ok(same(hd.sdr, m), 'the hdr plan\'s `sdr` IS the mapped plan, field for field (a browser whose answer drops AV1 gets exactly today\'s picture)');
  const dh = SP.planScreen(facts(), { display: 'D2', hdr: true }), noAv1 = SP.planScreen(facts({ ffmpeg: { ...ff, encoders: ['h264_nvenc'] } }), { hdr: true });
  ok(dh.mode === 'direct' && same(dh.hdr, { can: false, on: false, why: 'sdr_display' }) && noAv1.mode === 'mapped' && same(noAv1.hdr, { can: false, on: false, why: 'no_av1_encoder' }), 'hdr asked of an SDR display ⇒ the direct road (why sdr_display); of a machine without av1_nvenc ⇒ the mapped road (why no_av1_encoder)');
  const cap = SP.captureArgv(hd), enc = SP.hdrEncodeArgv(hd), j = enc.join(' ');
  ok(same(cap, SP.captureArgv(m)), 'the HDR road\'s capture IS the mapped road\'s (FP16 DDA, its raw bits)');
  ok(same(enc.slice(enc.indexOf('-f'), enc.indexOf('-i') + 2), ['-f', 'rawvideo', '-pix_fmt', 'p010le', '-video_size', '3840x2160', '-framerate', '30', '-i', 'pipe:0']) && enc[enc.indexOf('-vf') + 1] === 'setparams=range=tv:color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc'
    && j.includes('-c:v av1_nvenc -preset p1 -tune ull -rc cbr -zerolatency 1 -delay 0 -rc-lookahead 0 -bf 0 -g 60 -b:v 8000k -maxrate 8000k -bufsize 533k') && !/-profile/.test(j) && same(enc.slice(-6), ['-fps_mode', 'passthrough', '-f', 'ivf', '-flush_packets', '1', 'pipe:1'].slice(-6)) && same(enc.slice(-7), ['-fps_mode', 'passthrough', '-f', 'ivf', '-flush_packets', '1', 'pipe:1']),
  'the HDR encoder: P010 on stdin, the frames TAGGED bt2020 / PQ / bt2020nc / limited (setparams), av1_nvenc low-latency CBR (zero latency, no output delay — its default is INT_MAX frames — no lookahead, no -profile: the option is not av1_nvenc\'s), no B-frames, a 2 s GOP, IVF out flushed per picture', enc);
  const tagsOnOutput = (argv) => argv.some((a, i) => /^-(color_primaries|color_trc|colorspace|color_range)$/.test(a) && i > argv.indexOf('-i'));
  ok(!tagsOnOutput(enc) && tagsOnOutput([...enc.slice(0, -7), '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc', ...enc.slice(-7)]), 'no output -color_* option (the probe\'s trap: ffmpeg 8 then inserts a CPU conversion — 97–99 fps instead of 231–277) — RED CONTROL: the trap argv is caught by the same check');
  // THE SDR ROADS UNCHANGED: hdr off, the argvs of 2.369.313 (pinned verbatim)
  const pinMapped = ['-hide_banner', '-loglevel', 'error', '-nostats', '-f', 'rawvideo', '-pix_fmt', 'nv12', '-video_size', '3840x2160', '-framerate', '30', '-i', 'pipe:0', '-c:v', 'h264_nvenc', '-preset', 'p1', '-tune', 'ull', '-rc', 'cbr', '-zerolatency', '1', '-delay', '0', '-rc-lookahead', '0', '-profile:v', 'baseline', '-bf', '0', '-g', '60', '-b:v', '8000k', '-maxrate', '8000k', '-bufsize', '533k', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709', '-color_range', 'tv', '-fps_mode', 'passthrough', '-f', 'flv', '-flvflags', 'no_duration_filesize', '-flush_packets', '1', 'pipe:1'];
  const pinDirect = ['-hide_banner', '-loglevel', 'error', '-nostats', '-nostdin', '-f', 'lavfi', '-i', 'ddagrab=output_idx=1:draw_mouse=0:framerate=30', '-vf', 'hwdownload,format=bgra,scale=out_color_matrix=bt709:out_range=tv,format=nv12', '-c:v', 'h264_nvenc', '-preset', 'p1', '-tune', 'ull', '-rc', 'cbr', '-zerolatency', '1', '-delay', '0', '-rc-lookahead', '0', '-profile:v', 'baseline', '-bf', '0', '-g', '60', '-b:v', '8000k', '-maxrate', '8000k', '-bufsize', '533k', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709', '-color_range', 'tv', '-fps_mode', 'passthrough', '-f', 'flv', '-flvflags', 'no_duration_filesize', '-flush_packets', '1', 'pipe:1'];
  const pinCapture = ['-hide_banner', '-loglevel', 'error', '-nostats', '-nostdin', '-f', 'lavfi', '-i', 'ddagrab=output_idx=0:draw_mouse=0:output_fmt=16bit:framerate=30', '-vf', 'hwdownload,format=rgbaf16le', '-f', 'rawvideo', '-pix_fmt', 'rgbaf16le', 'pipe:1'];
  const d2 = SP.planScreen(facts(), { display: 'D2' });
  ok(same(SP.encodeArgv(m), pinMapped) && same(SP.encodeArgv(hd.sdr), pinMapped) && same(SP.directArgv(d2), pinDirect) && same(SP.directArgv(dh), pinDirect) && same(SP.captureArgv(m), pinCapture),
    'THE SDR ROADS UNCHANGED: hdr off (and the hdr plan\'s fallback, and an SDR display asked for HDR) — the mapped encoder, the direct road and the capture argvs are byte for byte 2.369.313\'s', { enc: SP.encodeArgv(m).join(' '), dir: SP.directArgv(d2).join(' ') });
  const f30 = SP.kbpsFloor({ w: 3840, h: 2160, fps: 30 }), h30 = SP.kbpsFloor({ w: 3840, h: 2160, fps: 30, hdr: true });
  ok(hd.floor === SP.kbpsFloor({ w: 3840, h: 2160, fps: 30, cap: 8000, hdr: true }) && h30 === Math.round((f30 * SP.KBPS_FLOOR_HDR.factor) / 100) * 100 && SP.KBPS_FLOOR_HDR.factor === 1 && SP.KBPS_FLOOR_HDR.measured.qp90 < 1.01 && SP.KBPS_FLOOR_HDR.measured.qp150 < 1.01 && h30 === f30 && SP.kbpsFloor({ w: 3840, h: 2160, fps: 30, cap: 5000, hdr: true }) === 5000,
    `THE HDR ROW: measured on the owner's desktop, 10-bit AV1 costs what 8-bit does at the same quantizer (×${SP.KBPS_FLOOR_HDR.measured.qp90} / ×${SP.KBPS_FLOOR_HDR.measured.qp150}) ⇒ the 4K30 HDR floor is the SDR row's ${h30} kbps, never over the session's cap`);
}
{
  // the mapper worker's p010 road (agentd's `stream-map` worker body) = the function
  const { port1, port2 } = new MessageChannel();
  SS.mapperServant(port2);
  const w = 64, h = 32, src = new Uint16Array(w * h * 4); for (let i = 0; i < src.length; i += 4) { src[i] = toHalf((i % 97) / 11); src[i + 1] = toHalf((i % 53) / 7); src[i + 2] = toHalf((i % 31) / 13); src[i + 3] = 15360; }
  const want = new Uint16Array(SP.p010Bytes(w, h) / 2); SP.p010FromHalf(src, w, h, T, want);
  const input = src.slice().buffer, output = new ArrayBuffer(SP.p010Bytes(w, h));
  const got = await new Promise((res) => { port1.on('message', (m) => res(m)); port1.postMessage({ op: 'pq' }); port1.postMessage({ op: 'map', road: 'p010', input, output, w, h, step: 1 }, [input, output]); setTimeout(() => res(null), 5000); });
  port1.close(); port2.close();
  ok(got && got.op === 'mapped' && same([...new Uint16Array(got.output)], [...want]), 'the mapper worker\'s p010 road (agentd\'s stream-map worker — its own tables) = p010FromHalf, sample for sample');
}

console.log('§6 two things the real leg found (the owner\'s box, 2026-10-19)');
{
  const SM = require(path.join(REPO, 'src/stream-model.js'));
  const mdns = 'candidate:2984 1 udp 2122260223 3f6a1c2e-0d51-4c7e-9a3b-6d2f1e0c9b8a.local 54400 typ host generation 0 ufrag Ab12 network-cost 999';
  const host = 'candidate:1467 1 udp 2122260223 192.168.4.116 54400 typ host generation 0', relay = 'a=candidate:9 1 udp 16777215 100.87.42.107 40653 typ relay raddr 0.0.0.0 rport 0';
  ok(SM.isMdnsCandidate(mdns) && SM.isMdnsCandidate('a=' + mdns) && !SM.isMdnsCandidate(host) && !SM.isMdnsCandidate(relay) && !SM.isMdnsCandidate('') && !SM.isMdnsCandidate(null) && !SM.isMdnsCandidate('candidate:1 1 udp 1 printer.local.example.com 9 typ host'),
    'a browser\'s mDNS host candidate (<uuid>.local — Chrome\'s without a STUN server) is told apart from an address, the relay\'s, a name that only CONTAINS .local (werift resolves it by multicast with a 10 s timeout INSIDE setRemoteDescription when it came first: the answer waited 10 s, 2 of 3 HDR switches)');
  const ps = SP.unthrottlePs([12, 'x', -3, 34.5, 56]);
  ok(/SetProcessInformation\(h, 4, ref s/.test(ps) && /ControlMask = 1, StateMask = 0/.test(ps) && /OpenProcess\(0x0200, false, pid\)/.test(ps) && /foreach \(\$id in @\(12,56\)\)/.test(ps) && !/runas|Elevat/i.test(ps),
    'the power-throttling opt-out: ProcessPowerThrottling (4), EXECUTION_SPEED controlled (1) and off (0), PROCESS_SET_INFORMATION only (a process of the same user — no elevation); only whole positive pids reach the script');
  ok(SP.unthrottlePs(Array.from({ length: 20 }, (_, i) => i + 1)).includes('@(1,2,3,4,5,6,7,8)') && SP.unthrottlePs([]).includes('@(0)'), 'at most 8 pids a run; none ⇒ a script that touches nothing');
  ok(same(SP.parseUnthrottle('x\r\n{"t":"unthrottle","rows":{"pid":12,"ok":true,"err":0}}\r\n'), [{ pid: 12, ok: true, err: 0 }]) && same(SP.parseUnthrottle('{"t":"unthrottle","rows":[{"pid":1,"ok":true,"err":0},{"pid":2,"ok":false,"err":5}]}'), [{ pid: 1, ok: true, err: 0 }, { pid: 2, ok: false, err: 5 }]) && SP.parseUnthrottle('ready') === null,
    'its answer: PowerShell 5\'s lone row (an object) and a list read the same; an access-denied row keeps its error; no line ⇒ null');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
