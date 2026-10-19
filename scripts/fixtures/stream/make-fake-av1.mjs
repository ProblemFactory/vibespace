#!/usr/bin/env node
// THE HDR ROAD'S FIXTURES (lane stream-hdr-passthrough): THE fake desk (fake-desk-720p.h264 — the moving bar, the frame number,
// the 16-cell binary band a suite reads off the <video>) re-encoded as AV1 in IVF, the way the HDR road's encoder writes it
// (src/stream-plan.js hdrEncodeArgv: IVF, a key frame every second, no B-frames):
//   fake-desk-av1-10.ivf   10-bit, the frames TAGGED BT.2020 / PQ / BT.2020-NCL / limited (setparams — no pixel is converted):
//                          what av1_nvenc sends from the agent's P010; Linux Chrome's WebRTC decoder (dav1d) refuses it —
//                          "unhandled bit depth: 10" (the P4 probe) — THE FALLBACK's real refusal
//   fake-desk-av1-8.ivf    the same, 8-bit: the CONTROL — Chrome decodes it, so a refusal of the 10-bit one is the bit depth,
//                          never the packetizer (src/stream-av1.js)
//   node scripts/fixtures/stream/make-fake-av1.mjs scripts/fixtures/stream [frames=60]
// Needs ffmpeg with libsvtav1 on PATH (only to REGENERATE — the suites read the committed files).
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dir = process.argv[2];
const N = Number(process.argv[3] || 60);
if (!dir) { console.error('usage: make-fake-av1.mjs <dir> [frames]'); process.exit(2); }
const src = path.join(path.dirname(new URL(import.meta.url).pathname), 'fake-desk-720p.h264');
const TAGS = 'setparams=range=tv:color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc';
for (const [bits, fmt] of [[10, 'yuv420p10le'], [8, 'yuv420p']]) {
  const out = path.join(dir, `fake-desk-av1-${bits}.ivf`);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src, '-frames:v', String(N), '-vf', `format=${fmt},${TAGS}`,
    '-c:v', 'libsvtav1', '-preset', '8', '-crf', '50', '-g', '30', '-bf', '0', '-svtav1-params', 'irefresh-type=2', '-f', 'ivf', '-y', out], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
  console.log(`→ ${out}`);
}
