// lane stream-p1b-screen: THE FAKES of the screen source's suites (test-stream-op §8, test-desktop-webrtc-chrome ⑩) — a
// Windows machine's ffmpeg and PowerShell facts on a Linux box, from shapes:
//   writeFakeFfmpeg(dir, cfg)   `ffmpeg.exe` (a Node script — `#!<this node>`, never `env node`): `-version` / `-filters` /
//                               `-encoders` answer cfg's version, ddagrab and encoders; `ddagrab=…:output_fmt=16bit` (the
//                               HDR road's capture) writes cfg.raw (an rgbaf16le frame) every 1/fps; `-i pipe:0` (the
//                               encoder) reads NV12 (or a window's BGRA) frames, keeps the FIRST in cfg.nv12, and answers each with THE fixture's
//                               next access unit as FLV; plain `ddagrab=…` (the SDR road) writes the fixture as FLV at fps.
//                               Every argv → cfg.log (one JSON line). A die file (cfg.dieCapture / cfg.dieEncoder) ends that
//                               process with a DDA-shaped error. cfg is re-read at every start (a leg edits it).
//                               lane stream-hdr-passthrough: an encoder asked for P010 into IVF (the HDR road: `-pix_fmt p010le … -f ivf`)
//                               reads P010 frames (3 bytes a pixel), keeps the FIRST in cfg.p010, and answers each with cfg.av1's
//                               (an IVF fixture) next temporal unit — the IVF head first
//                               cfg.failCapture = a file holding N: the next N captures die at START (before a picture) with
//                               ddagrab's «Failed to create Direct3D device (8007000e)» — the owner box's second display (lane
//                               desktop-display-modes); each such start counts N down
//   factsLine(cfg)              the one JSON line STREAM_FACTS_PS prints (displays with their DisplayConfig + DXGI cells)
//   calibrationFrame(w, h)      rgbaf16le bits: THE owner's 17 calibration patches (src/stream-plan.js CALIBRATION) + one
//                               HDR patch (10 × SDR white) on a grey50 ground → { buf, patches: [{label, srgb, x, y}] }
//   rgbAt(nv12, w, h, x, y)     NV12 (BT.709 limited) → the sRGB a decoder shows at (x, y)
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('../../..', import.meta.url).pathname);

export function writeFakeFfmpeg(dir, cfg) {
  fs.mkdirSync(dir, { recursive: true });
  const cfgFile = path.join(dir, 'fake-ffmpeg.json');
  fs.writeFileSync(cfgFile, JSON.stringify(cfg));
  const exe = path.join(dir, 'ffmpeg.exe');
  fs.writeFileSync(exe, `#!${process.execPath}
'use strict';
const fs = require('fs');
const H = require(${JSON.stringify(path.join(REPO, 'src/stream-h264.js'))});
const cfg = JSON.parse(fs.readFileSync(${JSON.stringify(cfgFile)}, 'utf8'));
const argv = process.argv.slice(2);
if (cfg.log) fs.appendFileSync(cfg.log, JSON.stringify(argv) + '\\n');
const out = (s) => process.stdout.write(s);
if (argv.includes('-version')) { out('ffmpeg version ' + (cfg.version || '7.1') + '-full_build-www.gyan.dev Copyright (c) 2000-2025 the FFmpeg developers\\nlibavfilter    10.  4.100 / 10.  4.100\\n'); process.exit(0); }
if (argv.includes('-filters')) { out('Filters:\\n T.. = Timeline support\\n ... ddagrab_not          |->V       not it\\n' + (cfg.ddagrab === false ? '' : ' ... ddagrab           |->V       Grab Windows Desktop images using Desktop Duplication API.\\n') + ' ... hwdownload        V->V       Download a hardware frame to a normal frame\\n'); process.exit(0); }
if (argv.includes('-encoders')) { out('Encoders:\\n V..... = Video\\n ------\\n' + (cfg.encoders || []).map((e) => ' V....D ' + e + '           ' + e + ' encoder (codec h264)\\n').join('') + ' V....D libx265              libx265 H.265 / HEVC (codec hevc)\\n'); process.exit(0); }
const AUS = H.accessUnits(H.splitNalus(fs.readFileSync(cfg.fixture)));
const first = AUS.findIndex((a) => a.key);
const fps = Number((/framerate=(\\d+)/.exec(argv.join(' ')) || [])[1] || cfg.fps || 30);
const u32 = (n) => Buffer.from([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function tag(data, ms) { const h = Buffer.from([9, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255, (ms >> 16) & 255, (ms >> 8) & 255, ms & 255, (ms >>> 24) & 255, 0, 0, 0]); return Buffer.concat([h, data, u32(11 + data.length)]); }
function flvHead() {
  const k = AUS[first].nalus, sps = k.find((n) => (n[0] & 31) === 7), pps = k.find((n) => (n[0] & 31) === 8);
  const rec = Buffer.concat([Buffer.from([1, sps[1], sps[2], sps[3], 0xff, 0xe1]), Buffer.from([sps.length >> 8, sps.length & 255]), sps, Buffer.from([1, pps.length >> 8, pps.length & 255]), pps]);
  return Buffer.concat([Buffer.from('FLV'), Buffer.from([1, 1]), u32(9), u32(0), tag(Buffer.concat([Buffer.from([0x17, 0, 0, 0, 0]), rec]), 0)]);
}
let n = 0;
function auTag() {
  const au = AUS[(first + n) % AUS.length], body = au.nalus.filter((x) => { const t = x[0] & 31; return t !== 7 && t !== 8 && t !== 9; });
  const data = Buffer.concat([Buffer.from([au.key ? 0x17 : 0x27, 1, 0, 0, 0]), ...body.flatMap((x) => [u32(x.length), x])]);
  return tag(data, Math.round((n++ * 1000) / fps));
}
const die = (f, msg) => { if (f && fs.existsSync(f)) { process.stderr.write(msg + '\\n'); process.exit(1); } };
process.stdout.on('error', () => process.exit(0));
const grab = argv.find((a) => /^ddagrab=/.test(a));
if (grab && cfg.failCapture && fs.existsSync(cfg.failCapture)) { const left = Number(fs.readFileSync(cfg.failCapture, 'utf8')) || 0; if (left > 0) { fs.writeFileSync(cfg.failCapture, String(left - 1)); process.stderr.write('[D3D11VA @ 0000020000000000] Failed to create Direct3D device (8007000e)\\nError opening input files: Unknown error occurred\\n'); process.exit(2981409195 | 0); } }
if (grab && /output_fmt=16bit/.test(grab)) {
  const frame = fs.readFileSync(cfg.raw);
  setInterval(() => { die(cfg.dieCapture, '[Parsed_ddagrab_0] AcquireNextFrame failed: DXGI_ERROR_ACCESS_LOST'); if (!process.stdout.writableNeedDrain) out(frame); }, 1000 / fps); // a full pipe = no frame this tick (ddagrab blocks, never queues)
} else if (grab) {
  out(flvHead());
  setInterval(() => { die(cfg.dieCapture, '[Parsed_ddagrab_0] DuplicateOutput failed: DXGI_ERROR_UNSUPPORTED'); out(auTag()); }, 1000 / fps);
} else if (argv.includes('pipe:0') && argv[argv.indexOf('-pix_fmt') + 1] === 'p010le' && argv[argv.length - 4] === 'ivf') { // lane stream-hdr-passthrough: THE HDR ROAD's encoder
  const [w, h] = argv[argv.indexOf('-video_size') + 1].split('x').map(Number), size = w * h * 3;
  const ivf = fs.readFileSync(cfg.av1), units = [];
  for (let o = ivf.readUInt16LE(6); o + 12 <= ivf.length;) { const n = ivf.readUInt32LE(o); units.push(ivf.subarray(o, o + 12 + n)); o += 12 + n; }
  out(ivf.subarray(0, ivf.readUInt16LE(6)));
  let have = [], len = 0, kept = false, k = 0;
  process.stdin.on('data', (d) => {
    have.push(d); len += d.length;
    while (len >= size) {
      const all = Buffer.concat(have), fr = all.subarray(0, size);
      have = [all.subarray(size)]; len -= size;
      if (!kept && cfg.p010) { fs.writeFileSync(cfg.p010, fr); kept = true; }
      die(cfg.dieEncoder, '[av1_nvenc] EncodePicture failed: an NVENC error');
      out(units[k++ % units.length]);
    }
  });
  process.stdin.on('end', () => process.exit(0));
} else if (argv.includes('pipe:0')) {
  const [w, h] = argv[argv.indexOf('-video_size') + 1].split('x').map(Number), size = argv[argv.indexOf('-pix_fmt') + 1] === 'bgra' ? w * h * 4 : (w * h * 3) / 2; // lane stream-p2w-build: a window's BGRA frames
  out(flvHead());
  let have = [], len = 0, kept = false;
  process.stdin.on('data', (d) => {
    have.push(d); len += d.length;
    while (len >= size) {
      const all = Buffer.concat(have), fr = all.subarray(0, size);
      have = [all.subarray(size)]; len -= size;
      if (!kept && cfg.nv12) { fs.writeFileSync(cfg.nv12, fr); kept = true; }
      die(cfg.dieEncoder, '[h264_nvenc] EncodePicture failed: an NVENC error');
      out(auTag());
    }
  });
  process.stdin.on('end', () => process.exit(0));
} else { process.stderr.write('fake ffmpeg: no role in ' + argv.join(' ') + '\\n'); process.exit(2); }
`, { mode: 0o755 });
  return { exe, cfgFile, set: (patch) => fs.writeFileSync(cfgFile, JSON.stringify(Object.assign(JSON.parse(fs.readFileSync(cfgFile, 'utf8')), patch))) };
}

/** The line STREAM_FACTS_PS prints: displays = [{ id, x, y, w, h, primary, hdr, white, adapter, output, name? }] (name = the
 *  monitor's own — lane desktop-display-modes: the dc cell's third field). */
export function factsLine(displays) {
  const rows = displays.map((d) => ({ id: d.id, x: d.x, y: d.y, w: d.w, h: d.h, primary: d.primary ? 1 : 0, dc: d.hdr == null && !d.name ? '' : `${d.hdr == null ? -1 : d.hdr ? 2 : 0},${d.white == null ? -1 : d.white}${d.name ? ',' + d.name : ''}`, dxgi: d.adapter == null ? '' : `${d.adapter},${d.output}` }));
  return JSON.stringify({ t: 'stream-facts', aware: 1, dxgi: rows.filter((r) => r.dxgi).length, rows: rows.length === 1 ? rows[0] : rows });
}

export function calibrationFrame(w, h, rows) {
  const buf = Buffer.alloc(w * h * 8), u16 = new Uint16Array(buf.buffer, buf.byteOffset, w * h * 4);
  const ground = rows.find((r) => r[0] === 'grey50')[2];
  for (let p = 0; p < w * h; p++) { u16[p * 4] = ground[0]; u16[p * 4 + 1] = ground[1]; u16[p * 4 + 2] = ground[2]; u16[p * 4 + 3] = 15360; }
  const all = [...rows, ['hdr10x', [255, 255, 255], [20032, 20032, 20032]]]; // 25.0 = 10 × a 200-nit white: above SDR white ⇒ white (knee 1)
  const size = 48, gap = 16, per = Math.floor((w - gap) / (size + gap));
  const patches = all.map(([label, srgb, bits], k) => {
    const x0 = gap + (k % per) * (size + gap), y0 = gap + Math.floor(k / per) * (size + gap);
    for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) { const i = (y * w + x) * 4; u16[i] = bits[0]; u16[i + 1] = bits[1]; u16[i + 2] = bits[2]; }
    return { label, srgb, x: x0 + size / 2, y: y0 + size / 2 };
  });
  return { buf, patches };
}

export function rgbAt(nv12, w, h, x, y) {
  const Y = nv12[y * w + x], c = w * h + (y >> 1) * w + (x & ~1), U = nv12[c] - 128, V = nv12[c + 1] - 128;
  const yy = (255 / 219) * (Y - 16), KR = 0.2126, KB = 0.0722, KG = 1 - KR - KB, s = 255 / 224;
  const r = yy + s * 2 * (1 - KR) * V, b = yy + s * 2 * (1 - KB) * U, g = (yy - KR * r - KB * b) / KG;
  return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))));
}

/** FLV bytes of access units ({ nalus, key }) as an encoder writes them: the SPS/PPS once (the sequence header), then each
 *  picture's other NAL units length-prefixed — what src/stream-plan.js flvReader reads. */
export function flvBytes(aus, fps = 30) {
  const u32 = (n) => Buffer.from([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const tag = (data, ms) => Buffer.concat([Buffer.from([9, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255, (ms >> 16) & 255, (ms >> 8) & 255, ms & 255, (ms >>> 24) & 255, 0, 0, 0]), data, u32(11 + data.length)]);
  const k = aus.find((a) => a.key).nalus, sps = k.find((n) => (n[0] & 31) === 7), pps = k.find((n) => (n[0] & 31) === 8);
  const rec = Buffer.concat([Buffer.from([1, sps[1], sps[2], sps[3], 0xff, 0xe1]), Buffer.from([sps.length >> 8, sps.length & 255]), sps, Buffer.from([1, pps.length >> 8, pps.length & 255]), pps]);
  const parts = [Buffer.from('FLV'), Buffer.from([1, 1]), u32(9), u32(0), tag(Buffer.concat([Buffer.from([0x17, 0, 0, 0, 0]), rec]), 0)];
  aus.forEach((au, n) => {
    const body = au.nalus.filter((x) => { const t = x[0] & 31; return t !== 7 && t !== 8 && t !== 9; });
    parts.push(tag(Buffer.concat([Buffer.from([au.key ? 0x17 : 0x27, 1, 0, 0, 0]), ...body.flatMap((x) => [u32(x.length), x])]), Math.round((n * 1000) / fps)));
  });
  return Buffer.concat(parts);
}
