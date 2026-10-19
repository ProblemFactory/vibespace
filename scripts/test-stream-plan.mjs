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
//   §11 GONE MEANS GONE (lane stream-fallback-never-silent): displaySeen / judgeGone (two successful reads 1 s apart) / captureRestart
//      (RED CONTROL: the P0's first, clamping chain is caught by the same check); no road paints the machine's pointer
//      (draw_mouse=0 — lane stream-cursor: the viewer's own pointer IS the pointer)
//   §7 THE BITRATE: hysteresis (5 s, 25 %), rounding, floor and cap
//   §8 THE FLV READER: THE fixture as an encoder writes it, fed in odd chunks → its access units, SPS/PPS before each key
//   §9 THE ESTIMATE (lane stream-mac-rate — werift 0.25's send-side estimate counts ~one packet a picture): a transport-cc
//      feedback written by hand (a run, a 2-bit status vector with a lost packet and a large delta, a run) read by werift's own
//      parser → twccPackets names its 20 packets in order with their receive times (RED CONTROL: werift's `packetResults` on the
//      same feedback: the vector's packets missing, a phantom per run, the last run renumbered from the base); sendEstimator: a
//      lossless 9.6 Mbps burst stream ⇒ ~9.6 Mbps, a 4.8 Mbps bottleneck ⇒ ~4.8, a still picture's trickle ⇒ nothing yet (RED
//      CONTROL: werift's estimator fed as its sender feeds it — each packet noted under the burst's LAST number ⇒ ~1/10)
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
  // lane desktop-display-modes: THE SWITCHER's words on Windows — each monitor's own name (DisplayConfig's target name, type 2:
  // monitorFriendlyDeviceName at byte 36 of the 420-byte packet), carried as the dc cell's third field; an older script's two
  // cells still parse (name null)
  ok(/Head\(B, 2, 420, p, 20\)/.test(ps) && /new IntPtr\(B\.ToInt64\(\) \+ 36\)/.test(ps) && /AllocHGlobal\(424\)/.test(ps) && /Replace\(';', ' '\)\.Replace\('=', ' '\)\.Replace\(',', ' '\)/.test(ps), 'the script asks each display\'s target name (type 2, 420 bytes; the friendly name at 36) into a 424-byte buffer, its ; = , made spaces (the cell\'s own separators)');
  const named = SP.parseStreamFacts(factsLine([{ ...two[0], name: 'Desk 27' }, { ...two[1], name: 'Side 32' }, { id: 'D3', x: 7680, y: 0, w: 1920, h: 1080, primary: false, hdr: null, white: null, adapter: 1, output: 0, name: 'Dell U2720Q' }]));
  const legacy = SP.parseStreamFacts(JSON.stringify({ t: 'stream-facts', rows: { id: 'D1', x: 0, y: 0, w: 10, h: 10, primary: 1, dc: '2,2500', dxgi: '0,0' } }));
  const odd = SP.parseStreamFacts(JSON.stringify({ t: 'stream-facts', rows: { id: 'D1', x: 0, y: 0, w: 10, h: 10, primary: 1, dc: '0,-1,Odd,Name', dxgi: '0,0' } }));
  ok(same(named.displays.map((d) => [d.name, d.hdr, d.white]), [['Desk 27', true, 2500], ['Side 32', false, 1000], ['Dell U2720Q', null, null]]) && legacy.displays[0].name === null && legacy.displays[0].white === 2500 && odd.displays[0].name === 'Odd Name', 'each display\'s own name parses (with HDR unknown too); an older script\'s row has none; a stray comma in a name stays in it', named.displays);
  const rowsW = SP.screenDisplayRows({ displays: [...named.displays, { id: 'D4', x: -10, y: 0, w: 10, h: 10, primary: false, hdr: false, adapter: null, output: null, name: null }] });
  ok(same(rowsW.map((d) => [d.id, d.name, d.primary, d.hdr, d.capturable]), [['\\\\.\\DISPLAY1', 'Desk 27', true, true, true], ['\\\\.\\DISPLAY2', 'Side 32', false, false, true], ['D3', 'Dell U2720Q', false, false, false], ['D4', null, false, false, false]]) && same(Object.keys(rowsW[0]), ['id', 'x', 'y', 'w', 'h', 'primary', 'hdr', 'name', 'capturable']), 'the offer\'s rows (screenDisplayRows): id, geometry, primary, HDR, the name — capturable only on the first adapter (an adapter-1 display and an unmapped one are not)', rowsW);
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

console.log('§9 THE ESTIMATE (lane stream-mac-rate): our transport-cc reading vs werift 0.25\'s');
{
  const WR = path.join(REPO, 'node_modules/werift/lib');
  const T = require(path.join(WR, 'rtp/src/rtcp/rtpfb/twcc.js'));
  const { SenderBandwidthEstimator } = require(path.join(WR, 'webrtc/src/media/sender/senderBWE.js'));
  // the feedback's body after the RTCP header: sender ssrc, media ssrc, base 100, 20 packets, reference time 1000 (× 64 ms), count 7;
  // chunks: a run of 10 received (small deltas) · a 2-bit vector [small, lost, LARGE, small, small, small, small] · a run of 3 small;
  // deltas (250 µs units): 1 ms each, the large one 10 ms
  const body = Buffer.from([0, 0, 0, 1, 0, 0, 0, 2, 0, 100, 0, 20, 0x00, 0x03, 0xe8, 7, 0x20, 0x0a, 0xd2, 0x55, 0x20, 0x03,
    ...Array(11).fill(4), 0x00, 0x28, ...Array(7).fill(4)]);
  const fb = T.TransportWideCC.deSerialize(body, null);
  const got = SP.twccPackets(fb), base = 1000 * 64000;
  const want = []; let at = base;
  for (let i = 0; i < 20; i++) { const lost = i === 11; if (!lost) at += i === 12 ? 10000 : 1000; want.push({ seq: 100 + i, recvUs: lost ? null : at }); }
  ok(same(got, want), 'twccPackets: the 20 packets in order (100 … 119), the lost one null, each receive time the running sum of its deltas — the large one 10 ms', got.slice(9, 14));
  const wr = fb.packetResults;
  ok(wr.length !== 20 && !wr.some((r) => r.sequenceNumber === 112) && wr.filter((r) => r.sequenceNumber === 100).length === 2 && wr.some((r) => r.sequenceNumber === 110 && r.received), `RED CONTROL: werift's own packetResults on the same feedback names ${wr.length} packets — the vector's 7 missing (112 never), a phantom after each run (110 "received"), the last run renumbered from the base (100 twice)`, wr.map((r) => r.sequenceNumber));
  const wrap = SP.twccPackets({ baseSequenceNumber: 65534, packetStatusCount: 4, referenceTime: 0, packetChunks: [{ packetStatus: 1, runLength: 4 }], recvDeltas: Array.from({ length: 4 }, () => ({ delta: 250 })) });
  ok(same(wrap.map((p) => p.seq), [65534, 65535, 0, 1]) && wrap[3].recvUs === 1000 && SP.twccPackets(null).length === 0, 'the numbers wrap at 65 536; nothing parsed ⇒ nothing');
  // a sender: 40 pictures of 10 packets × 1200 B, one picture every 10 ms (9.6 Mbps), each picture's packets in one burst; the
  // browser reports every 50 packets, packet i received at i × gap (the link's pace)
  const fbOf = (from, n, gapUs) => ({ baseSequenceNumber: from & 0xffff, packetStatusCount: n, referenceTime: 0, packetChunks: [{ packetStatus: 1, runLength: n }], recvDeltas: Array.from({ length: n }, (_, i) => ({ delta: i ? gapUs : from * gapUs })) });
  const run = (gapUs) => {
    const e = SP.sendEstimator(), out = [];
    for (let p = 0; p < 40; p++) for (let k = 0; k < 10; k++) e.sent(p * 10 + k, 1200, p * 10 + k * 0.05);
    for (let f = 0; f < 8; f++) { const k = e.feedback(SP.twccPackets(fbOf(f * 50, 50, gapUs))); if (k != null) out.push(k); }
    return out;
  };
  const clean = run(1000), neck = run(2000);
  ok(clean.length >= 2 && clean.every((k) => k >= 8000 && k <= 12000), `a lossless link (the packets arrive as sent: 1 ms apart) ⇒ ${clean.join(', ')} kbps ≈ the 9.6 Mbps sent — an echo`, clean);
  ok(neck.length >= 2 && neck.every((k) => k >= 4300 && k <= 5300), `a 4.8 Mbps bottleneck (2 ms apart) ⇒ ${neck.join(', ')} kbps — what the link carries`, neck);
  const still = SP.sendEstimator(); for (let i = 0; i < 6; i++) still.sent(i, 300, i * 500);
  ok(still.feedback(SP.twccPackets(fbOf(0, 6, 500000))) === null, 'a still picture\'s trickle (6 packets) ⇒ no estimate yet (≥ 20 packets over ≥ 100 ms — werift\'s own bound)');
  // werift's estimator fed as werift's RTCRtpSender feeds it: rtpPacketSent after `await sendRtp`, under the transport's CURRENT number
  const bwe = new SenderBandwidthEstimator(); let wk = null; bwe.onAvailableBitrate.subscribe((b) => { wk = Math.round(b / 1000); });
  const U = require(path.join(WR, 'webrtc/src/utils.js')), realNow = U.milliTime, T0 = realNow(); // werift's clock (= Date.now, bound at load)
  const ests = [];
  for (let p = 0; p < 20; p++) {
    for (let k = 0; k < 10; k++) bwe.rtpPacketSent({ wideSeq: p * 10 + 9, size: 1200, sendingAtMs: T0 + p * 10, sentAtMs: T0 + p * 10 }); // the burst's LAST number
  }
  U.milliTime = () => T0 + 200;
  try { for (let f = 0; f < 4; f++) { const raw = new T.TransportWideCC({ baseSequenceNumber: f * 50, packetStatusCount: 50, referenceTime: 0, packetChunks: [new T.RunLengthChunk({ packetStatus: 1, runLength: 49 })], recvDeltas: Array.from({ length: 50 }, (_, i) => new T.RecvDelta({ type: 1, delta: i ? 1000 : 0 })) }); wk = null; bwe.receiveTWCC(raw); if (wk != null) ests.push(wk); } } finally { U.milliTime = realNow; }
  ok(ests.length >= 1 && ests.every((k) => k < 2500), `RED CONTROL: werift's own estimator, fed the way its sender feeds it (each packet noted after the await under the burst's last number), reads ${ests.join(', ')} kbps of the same 9.6 Mbps — ~one packet a picture (the owner's 300 at 30–60 fps)`, ests);
}

console.log('§10 ② ON THE HDR ROAD (lane desktop-display-modes commit 2): N displays in one window ⇒ every k-th pixel mapped');
{
  const lut = SP.buildLut({ white: 2500, knee: 1, peak: 4 });
  const w = 12, h = 8, src = new Uint16Array(w * h * 4);
  for (let i = 0; i < src.length; i++) src[i] = (i * 7919 + 13) % 30000;
  const one = new Uint8Array(SP.nv12Bytes(w, h)), same1 = new Uint8Array(SP.nv12Bytes(w, h));
  SP.nv12FromHalf(src, w, h, lut, one); SP.nv12FromHalf(src, w, h, lut, same1, 1);
  const pick = (k) => { const W2 = Math.floor(w / k), H2 = Math.floor(h / k), d = new Uint16Array(W2 * H2 * 4); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) for (let c = 0; c < 4; c++) d[(y * W2 + x) * 4 + c] = src[((y * k) * w + x * k) * 4 + c]; return { d, W2, H2 }; };
  const eq = (k) => { const { d, W2, H2 } = pick(k); const a = new Uint8Array(SP.nv12Bytes(Math.floor(w / k), Math.floor(h / k))), b = new Uint8Array(a.length); const n = SP.nv12FromHalf(src, w, h, lut, a, k); SP.nv12FromHalf(d, W2, H2, lut, b, 1); return n === a.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0; };
  ok(Buffer.compare(Buffer.from(one), Buffer.from(same1)) === 0 && eq(2) && eq(3), 'step 1 is byte for byte the old mapping; step k = the old mapping of every k-th pixel of every k-th row (k = 2, 3)');
  ok(same([[3840, 1], [3840, 2], [3840, 3], [3840, 4], [3840, 6], [2560, 2], [2560, 3], [1920, 2], [0, 2]].map(([x, n]) => SP.mappedStepOf(x, n)), [1, 2, 3, 3, 3, 2, 2, 1, 1]) && SP.MAPPED_MIN_W === 1280, 'the step = the number of displays sharing the window, never under 1280 px wide, at most 4 (4K: 2 ⇒ 2, 3 ⇒ 3, 4 ⇒ 3; 1080p never)');
  const ff = { path: 'x', major: 7, ddagrab: true, encoders: ['h264_nvenc'] };
  const HDR = { id: 'H', x: -3840, y: 0, w: 3840, h: 2160, primary: true, hdr: true, white: 2500, adapter: 0, output: 0 }, SDR = { ...HDR, id: 'S', hdr: false };
  const p2 = SP.planScreen({ platform: 'win32', ffmpeg: ff, displays: [HDR] }, { share: 2 }), p1 = SP.planScreen({ platform: 'win32', ffmpeg: ff, displays: [HDR] }), ps = SP.planScreen({ platform: 'win32', ffmpeg: ff, displays: [SDR] }, { share: 2 });
  ok(p2.ok && p2.step === 2 && p2.w === 1920 && p2.h === 1080 && p2.srcW === 3840 && same(p2.scaled, { share: 2, step: 2, w: 1920, h: 1080, from: { w: 3840, h: 2160 } }) && SP.encodeArgv(p2).join(' ').includes('-video_size 1920x1080') && same(SP.captureArgv(p2), SP.captureArgv(p1)) && p2.floor < p1.floor, 'an HDR display shared by 2: the capture unchanged (the whole FP16 frame), mapped to 1920×1080, the encoder told so, the floor of the smaller picture; the plan says `scaled`', { step: p2.step, w: p2.w, scaled: p2.scaled, floor: [p1.floor, p2.floor] });
  ok(p1.step === 1 && p1.scaled === null && p1.w === 3840 && ps.step === 1 && ps.scaled === null && ps.w === 3840, 'alone (③ / ①) or on the SDR road: the whole picture');
  const sc = { ox: -3840, oy: 0, sx: 2, sy: 2 };
  ok(same(SP.scaledInputOf({ t: 'md', x: -3840 + 960, y: 540, b: 0 }, sc), { t: 'md', x: -1920, y: 1080, b: 0 }) && same(SP.scaledInputOf({ t: 'kd', c: 'KeyA' }, sc), { t: 'kd', c: 'KeyA' }) && same(SP.scaledInputOf({ t: 'mv', x: 5, y: 5 }, null), { t: 'mv', x: 5, y: 5 }), 'the pointer: the page\'s point (its picture\'s pixel + the origin) → the display\'s (×2 from the origin); keys and an unscaled picture untouched');
}

console.log('§11 GONE MEANS GONE (lane stream-fallback-never-silent — incident inc-mvf7z2a3-9sxi): the facts judge a dead capture');
{
  const F = (ids, extra = {}) => ({ ok: true, displays: ids.map((id) => ({ id })), windows: [{ id: 4242 }], ...extra });
  ok(SP.displaySeen(F(['3', '2']), { display: '3' }) === 'present' && SP.displaySeen(F([2]), { display: '3' }) === 'absent' && SP.displaySeen(F([3]), { display: '3' }) === 'present' && SP.displaySeen(F([]), { display: '3' }) === 'unknown' && SP.displaySeen(F(['3'], { displaysError: 'DisplayConfig failed' }), { display: '3' }) === 'unknown' && SP.displaySeen({ ok: false, code: 'facts_failed' }, { display: '3' }) === 'unknown' && SP.displaySeen(null, { display: '3' }) === 'unknown', 'displaySeen: listed ⇒ present, a list without it ⇒ absent (ids compared as text: the Mac\'s 3 = "3"); a read that failed, or that listed NO display, is unknown — never absent');
  ok(SP.displaySeen(F(['3']), { window: '4242' }) === 'present' && SP.displaySeen(F(['3']), { window: 9 }) === 'absent' && SP.displaySeen({ ok: true, displays: [{ id: 3 }], windows: [] }, { window: 9 }) === 'unknown', 'displaySeen of a window: the facts\' windows the same way');
  const reads = (...answers) => { const log = []; let i = 0; return { log, read: async () => { const a = answers[Math.min(i++, answers.length - 1)]; log.push('read'); if (a instanceof Error) throw a; return a; }, wait: async (ms) => { log.push('wait ' + ms); } }; };
  const r1 = reads(F(['3'])), r2 = reads(F(['2']), F(['2'])), r3 = reads(F(['2']), F(['3'])), r4 = reads(F(['2']), { ok: false }), r5 = reads(new Error('spawn EAGAIN')), r6 = reads(F([]));
  const v = [await SP.judgeGone(r1.read, { display: '3' }, r1.wait), await SP.judgeGone(r2.read, { display: '3' }, r2.wait), await SP.judgeGone(r3.read, { display: '3' }, r3.wait), await SP.judgeGone(r4.read, { display: '3' }, r4.wait), await SP.judgeGone(r5.read, { display: '3' }, r5.wait), await SP.judgeGone(r6.read, { display: '3' }, r6.wait)];
  ok(same(v, ['present', 'gone', 'present', 'unknown', 'unknown', 'unknown']) && same(r1.log, ['read']) && same(r2.log, ['read', 'wait 1000', 'read']) && same(r5.log, ['read']), 'judgeGone: gone ONLY when two reads that succeeded lack it, GONE_RULE.gapMs (1 s) apart — listed ⇒ present after one read; absent then listed ⇒ present; absent then a failed read ⇒ unknown; a read that threw or listed none ⇒ unknown', { v, r2: r2.log });
  const T = 1e6;
  ok(SP.captureRestart([], T) && SP.captureRestart([T - 1000], T) && !SP.captureRestart([T - 1000, T - 500], T) && SP.captureRestart([T - 61000, T - 500], T) && SP.GONE_RULE.restarts === 2 && SP.GONE_RULE.windowMs === 60000, 'captureRestart: in place at most twice within a minute — a third ⇒ the source ends capture_interrupted; a restart older than the minute no longer counts');
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
