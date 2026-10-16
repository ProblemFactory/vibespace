#!/usr/bin/env node
// THE FAKE STREAM SOURCE'S FIXTURE (lane stream-p1a-transport, design q-041 r2 §3 P1 part A): a pre-encoded H.264 Annex-B
// picture the daemon's fake source loops (src/agentd/stream-host.js fakeSource) — a stand-in for part B's screen capture.
// Each frame: a dark desk, an orange bar that moves 12 px a frame, the frame number in big 7-segment digits (a person reads
// it in a PNG) and a 16-cell BINARY BAND along the bottom (white = 1, the most significant bit left, 80 px a cell at
// y 640–700) that a suite reads off the <video> to prove the picture ADVANCES. Encoded by ffmpeg's libx264 the way every
// browser decodes: constrained baseline 3.1 (profile-level-id 42e01f, the SDP's), 30 fps, a key frame every second with its
// SPS/PPS repeated (a viewer that joins or asks for a key frame mid-loop starts clean), no B-frames, access unit delimiters.
//   node scripts/fixtures/stream/make-fake-h264.mjs scripts/fixtures/stream/fake-desk-720p.h264 [frames=300]
// Needs ffmpeg with libx264 on PATH (only to REGENERATE — the suites read the committed file).
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const out = process.argv[2];
const N = Number(process.argv[3] || 300);
if (!out) { console.error('usage: make-fake-h264.mjs <out.h264> [frames]'); process.exit(2); }
const W = 1280, H = 720, FPS = 30;
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-preset', 'medium', '-tune', 'zerolatency', '-crf', '30', '-g', String(FPS), '-bf', '0',
  '-x264-params', 'repeat-headers=1:aud=1', '-f', 'h264', '-y', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const Y = Buffer.alloc(W * H), U = Buffer.alloc((W * H) / 4), V = Buffer.alloc((W * H) / 4);
// a rectangle in all three planes (BT.601 limited range), clipped to the frame
function rect(x0, y0, w, h, [y, u, v]) {
  const xa = Math.max(0, x0), xb = Math.min(W, x0 + w), ya = Math.max(0, y0), yb = Math.min(H, y0 + h);
  if (xa >= xb || ya >= yb) return;
  for (let r = ya; r < yb; r++) Y.fill(y, r * W + xa, r * W + xb);
  for (let r = ya >> 1; r < (yb + 1) >> 1; r++) { U.fill(u, r * (W >> 1) + (xa >> 1), r * (W >> 1) + ((xb + 1) >> 1)); V.fill(v, r * (W >> 1) + (xa >> 1), r * (W >> 1) + ((xb + 1) >> 1)); }
}
const DESK = [60, 150, 110], BAR = [170, 90, 200], INK = [235, 128, 128], ZERO = [16, 128, 128];
function digit(d, x, y, s) {
  const on = SEG[d], t = s / 5;
  const seg = { a: [x, y, s, t], g: [x, y + s - t / 2, s, t], d: [x, y + 2 * s - t, s, t], f: [x, y, t, s], b: [x + s - t, y, t, s], e: [x, y + s, t, s], c: [x + s - t, y + s, t, s] };
  for (const k of on) rect(...seg[k].map(Math.round), INK);
}
const write = (b) => (ff.stdin.write(b) ? null : new Promise((r) => ff.stdin.once('drain', r)));
for (let n = 0; n < N; n++) {
  rect(0, 0, W, H, DESK);
  rect(Math.round((n * 12) % (W + 200)) - 200, 120, 200, 360, BAR);
  const s = String(n).padStart(4, '0');
  for (let i = 0; i < 4; i++) digit(Number(s[i]), 760 + i * 110, 160, 80);
  for (let b = 0; b < 16; b++) rect(b * 80, 640, 80, 60, (n >> (15 - b)) & 1 ? INK : ZERO);
  for (const p of [Y, U, V]) { const w = write(p); if (w) await w; }
}
ff.stdin.end();
ff.on('exit', (code) => { if (code) { console.error(`ffmpeg exited ${code}`); process.exit(1); } console.log(`${out}: ${N} frames, ${fs.statSync(out).size} bytes`); });
