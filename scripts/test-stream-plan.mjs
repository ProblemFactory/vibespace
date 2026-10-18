#!/usr/bin/env node
// THE SCREEN SOURCE'S PLAN — PURE (src/stream-plan.js; design q-041 r2 §2 采集/映射+编码, lane stream-p1b-screen). The colour
// mapping is a GATE: the daemon's frames go through buildLut(mapLinear), so what is proven here is what the machine runs.
//   §1 THE MAPPING GATE: the owner's 17 calibration patches (their measured FP16 bits, SDR white 200 nits) → the sRGB the
//      window drew, EXACTLY; every 8-bit code at five white levels round-trips exactly; RED CONTROL: the same bits without
//      ÷ white = the report's measured 8-bit DDA column (26 → 45 … 179 → 255, the «过曝»); the tone curve's shape
//   §2 THE FRAME LOOP: a synthetic FP16 frame (the patches + a 10× white HDR patch) → NV12 → a decoder's BT.709 inverse:
//      every patch within ±1; the table equals the function on all 65 536 bit patterns; odd sizes stay inside
//   §3 THE ENCODER LADDER: the table's order decides (RED CONTROL: a reversed ladder takes x264 over NVENC); software = said
//   §4 FFMPEG FACTS: version / filters / encoders texts → the verdict; no_ffmpeg names where it looked
//   §5 THE FACTS SCRIPT + PARSER: the three DisplayConfig types + the DXGI walk; the line → displays (PS 5's lone row too)
//   §6 THE PLAN: the road by HDR state, the refusals by name, the argvs — the capture never converts a float format
//      (RED CONTROL: the P0's first, clamping chain is caught by the same check); no road paints the machine's pointer
//      (draw_mouse=0 — lane stream-cursor: the viewer's own pointer IS the pointer)
//   §7 THE BITRATE: hysteresis (5 s, 25 %), rounding, floor and cap
//   §8 THE FLV READER: THE fixture as an encoder writes it, fed in odd chunks → its access units, SPS/PPS before each key
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { calibrationFrame, rgbAt, factsLine, flvBytes } from './fixtures/stream/screen-fakes.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const H = require(path.join(REPO, 'src/stream-h264.js'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** number → the nearest IEEE half's bits (round to nearest even) — what DDA's FP16 surface holds */
function toHalf(x) {
  const f = new Float32Array(1), u = new Uint32Array(f.buffer); f[0] = x;
  const b = u[0], s = (b >>> 16) & 0x8000, e = ((b >>> 23) & 0xff) - 127 + 15, m = b & 0x7fffff;
  if (e >= 31) return s | 0x7c00;
  if (e <= 0) { const mm = (m | 0x800000) >>> (1 - e); return s | ((mm >>> 13) + (((mm >>> 12) & 1) && ((mm & 0x1fff) !== 0x1000 || ((mm >>> 13) & 1)) ? 1 : 0)); }
  let h = s | (e << 10) | (m >>> 13);
  const rest = m & 0x1fff;
  if (rest > 0x1000 || (rest === 0x1000 && (h & 1))) h++;
  return h;
}
const eotf = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

console.log('§1 the mapping gate');
{
  const W = SP.CALIBRATION.white;
  const rows = SP.CALIBRATION.rows.map(([label, srgb, bits]) => ({ label, srgb, got: bits.map((b) => SP.srgb8OfHalf(b, { white: W })) }));
  const off = rows.filter((r) => !same(r.srgb, r.got));
  ok(rows.length === 17 && rows.filter((r) => /^grey/.test(r.label)).length === 11 && off.length === 0, `the owner's 17 calibration patches (11 greys + R G B C M Y, their measured FP16 bits, SDR white ${W} = ${W * 0.08} nits) map to EXACTLY the sRGB the window drew`, off);
  ok(same(SP.CALIBRATION.rows.find((r) => r[0] === 'grey100')[2], [16640, 16640, 16640]) && SP.halfToFloat(16640) === 2.5, 'SDR white reads 2.5 in the capture (linear sRGB × 200/80 — scRGB), the report\'s finding');
  const sweep = [];
  for (const white of [1000, 1500, 2500, 4000, 6000]) for (let s = 0; s < 256; s++) { const bits = toHalf(eotf(s / 255) * (white / 1000)); const got = SP.srgb8OfHalf(bits, { white }); if (got !== s) sweep.push({ white, s, got }); }
  ok(sweep.length === 0, 'every 8-bit sRGB code, made linear × white/80 and stored as FP16, comes back EXACTLY at SDR white 80 / 120 / 200 / 320 / 480 nits (the slider\'s range)', sweep.slice(0, 5));
  const measured8 = { grey10: 45, grey20: 81, grey30: 119, grey40: 156, grey50: 194, grey60: 231, grey70: 255, grey80: 255, grey90: 255, grey100: 255 };
  const noDiv = Object.fromEntries(Object.keys(measured8).map((k) => [k, SP.srgb8OfHalf(SP.CALIBRATION.rows.find((r) => r[0] === k)[2][0], { white: 1000 })]));
  ok(same(noDiv, measured8), 'RED CONTROL: the same bits WITHOUT ÷ white are the report\'s measured 8-bit DDA column (26 → 45, 128 → 194, ≥ 179 → 255: the overexposed picture) — the gate tells the two apart', noDiv);
  const T = SP.toneCurve;
  ok(T(1.5) === 1 && T(1) === 1 && T(0.4) === 0.4 && T(-0.2) === 0 && T(NaN) === 0 && T(Infinity) === 1, 'knee 1 (the default): exact below SDR white, white above it; negative (out-of-gamut scRGB) and NaN → black, +inf → white');
  const o = { knee: 0.8, peak: 4 }, e = 1e-6;
  const mono = Array.from({ length: 400 }, (_, i) => T(0.8 + i * 0.01, o)).every((v, i, a) => i === 0 || v >= a[i - 1]);
  ok(T(0.79, o) === 0.79 && Math.abs(T(0.8 + e, o) - (0.8 + e)) < 1e-6 && Math.abs((T(0.8 + e, o) - T(0.8, o)) / e - 1) < 1e-3 && Math.abs(T(4, o) - 1) < 1e-9 && T(9, o) === 1 && mono, 'knee 0.8 / peak 4: unchanged below the knee, no kink at it (slope 1), monotone, 4 × SDR white lands on white');
  ok(Math.round(255 * SP.srgbOetf(T(1, o))) < 255 && Math.round(255 * SP.srgbOetf(T(1, { knee: 1 }))) === 255, 'a knee below 1 gives up SDR white\'s exactness (8-bit SDR has no code above white) — why the default is knee 1');
}

console.log('§2 the frame loop');
{
  const W = 1280, Hh = 720;
  const cal = calibrationFrame(W, Hh, SP.CALIBRATION.rows);
  const lut = SP.buildLut({ white: SP.CALIBRATION.white });
  const out = new Uint8Array(SP.nv12Bytes(W, Hh));
  const n = SP.nv12FromHalf(new Uint16Array(cal.buf.buffer, cal.buf.byteOffset, W * Hh * 4), W, Hh, lut, out);
  const bad = cal.patches.map((p) => ({ label: p.label, want: p.srgb, got: rgbAt(out, W, Hh, p.x, p.y) })).filter((r) => r.got.some((v, i) => Math.abs(v - r.want[i]) > 1));
  ok(n === W * Hh * 1.5 && cal.patches.length === 18 && bad.length === 0, 'a synthetic FP16 frame (the 17 patches + one at 10 × SDR white) → NV12 (BT.709, limited) → a decoder\'s inverse: every patch centre within ±1, the HDR patch white', bad);
  let diff = 0; for (let h = 0; h < 65536; h += 1) if (lut[h] !== SP.srgb8OfHalf(h, { white: SP.CALIBRATION.white })) diff++;
  ok(diff === 0, 'the 64 K table equals the mapping function on every FP16 bit pattern (the frame loop never maps anything else)');
  const w = 7, h = 5, src = new Uint16Array(w * h * 4).fill(16640), small = new Uint8Array(SP.nv12Bytes(w, h) + 8).fill(7);
  const m = SP.nv12FromHalf(src, w, h, lut, small);
  ok(SP.nv12Bytes(w, h) === 6 * 4 * 1.5 && m === 36 && small.slice(0, 24).every((v) => v === 235) && small.slice(36).every((v) => v === 7), 'an odd 7×5 frame maps its even 6×4 part (white = Y 235) and writes not one byte past it');
}

console.log('§3 the encoder ladder');
{
  const L = SP.ENCODER_LADDER;
  ok(same(L.map((r) => r.id), ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264']) && same(L.map((r) => r.label), ['NVENC', 'AMF', 'Quick Sync', 'x264']) && L.filter((r) => r.hw).length === 3, 'the ladder: NVENC → AMF → Quick Sync → x264 (the one software rung last)');
  ok(same(L[0].args.slice(0, 6), ['-preset', 'p1', '-tune', 'ull', '-rc', 'cbr']) && L.every((r) => /baseline/.test(r.profile)), 'NVENC takes the measured P0 switches (p1 / ull / cbr); every rung is constrained baseline (the SDP\'s 42e01f profile)');
  const p = (e) => SP.pickEncoder(e);
  ok(p(['libx264', 'h264_nvenc']).encoder.id === 'h264_nvenc' && p(['libx264', 'h264_qsv', 'h264_amf']).encoder.id === 'h264_amf' && p(['h264_qsv', 'libx264']).encoder.id === 'h264_qsv', 'the installed list\'s order never matters — the ladder\'s does');
  const sw = p(['libx264']);
  ok(sw.encoder.id === 'libx264' && sw.note === 'no_hw_encoder' && p(['h264_nvenc']).note === null && p([]).code === 'no_encoder' && p(['libx265']).code === 'no_encoder', 'only x264 ⇒ taken and SAID (no_hw_encoder); no H.264 encoder at all ⇒ no_encoder');
  const rev = [...L].reverse();
  ok(SP.pickEncoder(['h264_nvenc', 'libx264'], rev).encoder.id === 'libx264', 'RED CONTROL: a ladder copy with x264 first takes x264 over NVENC — the table, nothing else, decides');
}

console.log('§4 ffmpeg facts');
{
  const encs = ' V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)\n V....D h264_amf             AMD AMF H.264 Encoder (codec h264)\n V....D libx265              libx265 H.265 / HEVC (codec hevc)\n A....D aac                  AAC\n';
  const filt = ' ... ddagrab           |->V       Grab Windows Desktop images using Desktop Duplication API.\n';
  const a = SP.parseFfmpegFacts('ffmpeg version 7.1-full_build-www.gyan.dev Copyright (c) 2000-2024\nlibavfilter    10.  4.100 / 10.  4.100', filt, encs);
  ok(a.major === 7 && a.ddagrab && same(a.encoders, ['h264_nvenc', 'h264_amf']) && a.version === '7.1-full_build-www.gyan.dev', 'a release build: major 7, ddagrab, the H.264 ladder encoders only (not HEVC, not audio)', a);
  const b = SP.parseFfmpegFacts('ffmpeg version N-127564-g3c92f003c7-20261015 Copyright (c) 2000-2026\nlibavfilter    11.  9.100 / 11.  9.100', filt, encs);
  ok(b.major === 8, 'the P0\'s BtbN master build (N-127564, no number) → libavfilter 11 = FFmpeg 8', b);
  const c = SP.parseFfmpegFacts('ffmpeg version 6.1.1-3ubuntu5', filt, encs);
  const v6 = SP.ffmpegVerdict({ path: 'C:\\f\\ffmpeg.exe', ...c }), vNoDda = SP.ffmpegVerdict({ path: 'C:\\f\\ffmpeg.exe', ...a, ddagrab: false }), vNone = SP.ffmpegVerdict(null);
  ok(v6.code === 'no_ffmpeg' && /6\.1\.1/.test(v6.error) && vNoDda.code === 'no_ffmpeg' && /no ddagrab/.test(vNoDda.error) && vNone.code === 'no_ffmpeg' && /PATH, %LOCALAPPDATA%\\vibespace\\ffmpeg\\bin, %USERPROFILE%\\vs-probe\\ffmpeg/.test(vNone.error) && SP.ffmpegVerdict({ path: 'x', ...a }).ok, 'no_ffmpeg by name: none found (naming PATH, %LOCALAPPDATA%\\vibespace\\ffmpeg\\bin and the probe folder), a 6.x, one without ddagrab', [v6.error, vNone.error]);
  const cands = SP.ffmpegCandidates({ platform: 'win32', env: { PATH: 'C:\\a;C:\\b\\', LOCALAPPDATA: 'C:\\Users\\o\\AppData\\Local', USERPROFILE: 'C:\\Users\\o' } });
  ok(same(cands.map((x) => x.path), ['C:\\a\\ffmpeg.exe', 'C:\\b\\ffmpeg.exe', 'C:\\Users\\o\\AppData\\Local\\vibespace\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\Users\\o\\vs-probe\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe']), 'where the agent looks, in order: PATH, %LOCALAPPDATA%\\vibespace\\ffmpeg\\bin, the P0 probe\'s folder', cands);
  const real = spawnSync('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8' });
  if (real.status === 0) {
    const r = SP.parseFfmpegFacts(real.stdout, spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout, spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout);
    ok(r.major >= 4 && r.ddagrab === false && Array.isArray(r.encoders), `this box's real ffmpeg parses (${r.version}, major ${r.major}; no ddagrab off Windows — refused there by name)`, r);
  } else console.log('  · no ffmpeg on this box: the real-text leg is skipped');
}

console.log('§5 the facts script and its parser');
{
  const ps = SP.STREAM_FACTS_PS;
  ok(/Head\(B, 1, 84, p, 0\)/.test(ps) && /Head\(B, 9, 32, p, 20\)/.test(ps) && /Head\(B, 11, 24, p, 20\)/.test(ps) && /CreateDXGIFactory1/.test(ps) && /EnumAdapters1/.test(ps) && /EnumOutputs/.test(ps) && /t = 'stream-facts'/.test(ps) && /SetProcessDPIAware/.test(ps), 'the script asks DisplayConfig for the GDI name (1), advanced colour (9) and SDR white (11), walks DXGI adapters → outputs, and prints ONE stream-facts line');
  const two = [{ id: '\\\\.\\DISPLAY1', x: 0, y: 0, w: 3840, h: 2160, primary: true, hdr: true, white: 2500, adapter: 0, output: 0 }, { id: '\\\\.\\DISPLAY2', x: 3840, y: 0, w: 3840, h: 2160, primary: false, hdr: false, white: 1000, adapter: 0, output: 1 }];
  const f = SP.parseStreamFacts('noise\r\n' + factsLine(two) + '\r\n');
  ok(f.ok && f.dxgi === 2 && same(f.displays.map((d) => [d.id, d.x, d.w, d.primary, d.hdr, d.white, d.adapter, d.output]), [['\\\\.\\DISPLAY1', 0, 3840, true, true, 2500, 0, 0], ['\\\\.\\DISPLAY2', 3840, 3840, false, false, 1000, 0, 1]]), 'two displays: bounds, primary, HDR, SDR white, DXGI adapter/output', f);
  const lone = SP.parseStreamFacts(factsLine([{ id: 'D1', x: 0, y: 0, w: 1920, h: 1080, primary: true, hdr: null, white: null, adapter: null }]));
  const acm = SP.parseStreamFacts(JSON.stringify({ t: 'stream-facts', rows: { id: 'D1', x: 0, y: 0, w: 10, h: 10, primary: 1, dc: '6,1000', dxgi: '' } }));
  ok(lone.ok && lone.displays.length === 1 && lone.displays[0].hdr === null && lone.displays[0].white === null && lone.displays[0].adapter === null && acm.displays[0].hdr === false && acm.displays[0].wideColor === true, 'PowerShell 5\'s lone row (an object) parses; an unreadable DisplayConfig = unknown (null); advanced colour in the SDR wide-colour mode is NOT HDR');
  ok(SP.parseStreamFacts('nothing').code === 'bad_output' && SP.parseStreamFacts('{"t":"stream-facts","rows":[]}').code === 'bad_output', 'no line / no row ⇒ bad_output');
}

console.log('§6 the plan');
{
  const ff = { path: 'C:\\ff\\ffmpeg.exe', version: '7.1', major: 7, ddagrab: true, encoders: ['h264_nvenc', 'libx264'] };
  const D1 = { id: 'D1', x: 0, y: 0, w: 3840, h: 2160, primary: true, hdr: true, white: 2500, adapter: 0, output: 0 };
  const D2 = { id: 'D2', x: -1920, y: 100, w: 1921, h: 1081, primary: false, hdr: false, white: 1000, adapter: 0, output: 1 };
  const facts = (o = {}) => ({ platform: 'win32', ffmpeg: ff, displays: [D1, D2], ...o });
  const m = SP.planScreen(facts());
  ok(m.ok && m.mode === 'mapped' && m.white === 2500 && m.encoder.label === 'NVENC' && same(m.origin, { x: 0, y: 0 }) && m.w === 3840 && m.fps === 30 && m.gop === 60 && m.kbps === 8000, 'the HDR primary: the MAPPED road, white 2500, NVENC, 30 fps, a 2 s GOP (60), 8 Mbps', m);
  const d = SP.planScreen(facts(), { display: 'D2', kbps: 5000 });
  ok(d.ok && d.mode === 'direct' && d.white === null && same(d.origin, { x: -1920, y: 100 }) && d.display.output === 1 && d.w === 1920 && d.h === 1080 && d.kbps === 5000, 'an SDR display by id: the DIRECT road, its origin (left of the primary), DXGI output 1, its odd size made even', d);
  const R = (f, o) => SP.planScreen(f, o).code;
  ok(R(facts(), { display: 'D9' }) === 'display_gone' && R(facts({ displays: [] })) === 'display_gone', 'a display that is not connected (or none) ⇒ display_gone');
  ok(R(facts({ displays: [D1, { ...D2, adapter: null, output: null }] }), { display: 'D2' }) === 'display_unmapped' && SP.planScreen(facts({ displays: [{ ...D1, adapter: null, output: null }] })).display.output === 0, 'no DXGI map: the primary is output 0 of adapter 0 (DXGI enumerates it first); any other display ⇒ display_unmapped');
  ok(R(facts({ displays: [{ ...D1, adapter: 1 }] })) === 'display_other_gpu' && R(facts({ displays: [{ ...D1, white: null }] })) === 'no_white_level' && R(facts({ platform: 'linux' })) === 'not_windows' && R(facts({ platform: 'darwin' })) === 'no_helper' && R(facts({ ffmpeg: null })) === 'no_ffmpeg' && R(facts({ ffmpeg: { ...ff, encoders: [] } })) === 'no_encoder', 'refused by name: another GPU\'s display, an HDR display whose white is unknown (never guessed), not Windows (Linux — a Mac takes its own road: lane stream-p3m-build, no helper ⇒ no_helper), no ffmpeg, no encoder');
  const cap = SP.captureArgv(m), enc = SP.encodeArgv(m), dir = SP.directArgv(d);
  const floatSafe = (argv) => { const vf = argv[argv.indexOf('-vf') + 1] || ''; return !/gbrpf32|grayf32|zscale|tonemap|libplacebo|rgba64/.test(argv.join(' ')) && (vf.match(/format=/g) || []).length === 1 && /^hwdownload,format=rgbaf16le$/.test(vf) && argv[argv.indexOf('-pix_fmt') + 1] === 'rgbaf16le'; };
  ok(cap.includes('ddagrab=output_idx=0:draw_mouse=0:output_fmt=16bit:framerate=30') && floatSafe(cap) && same(cap.slice(-5), ['-f', 'rawvideo', '-pix_fmt', 'rgbaf16le', 'pipe:1']), 'the mapped capture: FP16 DDA, hwdownload, its raw bits on stdout — no float format is ever converted (swscale clamps them to [0, 1])', cap.join(' '));
  const wrong = cap.map((a) => (a === 'hwdownload,format=rgbaf16le' ? 'hwdownload,format=gbrpf32le' : a));
  ok(!floatSafe(wrong), 'RED CONTROL: the P0\'s first chain (`format=gbrpf32le` — it clamped every value above SDR white) fails the same check');
  const tail = ['-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709', '-color_range', 'tv', '-fps_mode', 'passthrough', '-f', 'flv', '-flvflags', 'no_duration_filesize', '-flush_packets', '1', 'pipe:1'];
  ok(same(enc.slice(enc.indexOf('-f'), enc.indexOf('-i') + 2), ['-f', 'rawvideo', '-pix_fmt', 'nv12', '-video_size', '3840x2160', '-framerate', '30', '-i', 'pipe:0']) && enc.join(' ').includes('-c:v h264_nvenc -preset p1 -tune ull -rc cbr') && enc.join(' ').includes('-profile:v baseline -bf 0 -g 60 -b:v 8000k -maxrate 8000k') && same(enc.slice(-tail.length), tail), 'the encoder: the agent\'s NV12 on stdin, NVENC p1/ull/cbr, baseline, no B-frames, GOP 60, the rate; the VUI says BT.709 + the sRGB curve (what the mapping made); FLV flushed per picture', enc.join(' '));
  ok(dir.includes('ddagrab=output_idx=1:draw_mouse=0:framerate=30') && dir.includes('hwdownload,format=bgra,scale=out_color_matrix=bt709:out_range=tv,format=nv12') && same(dir.slice(-tail.length), tail) && !/16bit/.test(dir.join(' ')), 'the direct road: 8-bit DDA → NV12 with the same BT.709 matrix → the encoder, one ffmpeg', dir.join(' '));
  // lane stream-cursor: ddagrab's draw_mouse defaults to TRUE (measured: `-h filter=ddagrab` on the owner's ffmpeg N-127564) —
  // the machine's arrow in every frame, under the viewer's own; both roads say 0
  const grabOf = (argv) => argv.find((a) => /^ddagrab=/.test(a)) || '';
  ok([cap, dir].every((a) => /(^|:)draw_mouse=0(:|$)/.test(grabOf(a).slice('ddagrab='.length))) && !/draw_mouse=1/.test(cap.join(' ') + dir.join(' ')), 'no pointer in the frames: both DDA roads ask draw_mouse=0 (the viewer\'s own pointer IS the pointer)', [grabOf(cap), grabOf(dir)]);
  ok(SP.encodeArgv(m, 3000).join(' ').includes('-b:v 3000k -maxrate 3000k -bufsize 200k'), 'a new rate = the encoder\'s argv at that rate (a VBV of two frames)');
}

console.log('§7 the bitrate');
{
  const K = (o) => SP.kbpsDecision({ current: 8000, cap: 8000, lastAt: 0, now: 6000, ...o });
  ok(!K({ now: 4000, target: 2000 }).change && !K({ target: 6500 }).change && same(K({ target: 2049 }), { change: true, kbps: 2000 }) && same(K({ target: 100 }), { change: true, kbps: 300 }), 'no change within 5 s or under a 25 % move; a change rounds to 100 kbps, never under 300');
  ok(!K({ target: 20000 }).change && same(K({ current: 2000, target: 20000 }), { change: true, kbps: 8000 }), 'never over the session\'s cap (the page\'s maxKbps)');
}

console.log('§8 the FLV reader');
{
  const AUS = H.accessUnits(H.splitNalus(fs.readFileSync(path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264'))));
  const flv = flvBytes(AUS.slice(0, 64));
  for (const step of [1, 7, 997, flv.length]) {
    const r = SP.flvReader(); const got = [];
    for (let i = 0; i < flv.length; i += step) got.push(...r.push(flv.subarray(i, i + step)));
    const okAll = got.length === 64 && got.every((a, i) => a.type === 'au' && a.key === AUS[i].key && a.nalus.length === AUS[i].nalus.length && a.nalus.every((n, k) => Buffer.compare(Buffer.from(n), AUS[i].nalus[k]) === 0)) && got[31].tsMs === 1033;
    ok(okAll, `fed ${step === flv.length ? 'whole' : `in ${step}-byte chunks`}: THE fixture's 64 access units, byte for byte (SPS/PPS put back in front of each key frame), each at its timestamp`, { n: got.length });
  }
  const tagOf2 = flv.indexOf(Buffer.from([0x17, 1, 0, 0, 0]));
  ok(tagOf2 > 0 && (flv[tagOf2 + 9] & 31) !== 7, 'CONTROL: in the FLV a key frame carries no SPS (they ride once, in the sequence header) — the reader is what lets a browser join at any key frame');
  const bad = SP.flvReader();
  ok(same(bad.push(Buffer.from('not an flv at all')).map((e) => e.type), ['bad']) && bad.push(Buffer.from('more')).length === 0, 'not FLV ⇒ ONE `bad` (the source ends by name), then silence');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
