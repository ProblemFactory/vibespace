#!/usr/bin/env node
// lane stream-p2w-capture-probe — THE COLOUR CHECK of a WGC window frame (never a suite). The frame is wgc-probe's tight
// rows of the calibration window (calib.ps1: 11 greys + R G B C M Y + grey50 + white, LOGICAL coordinates in calib.json —
// the window is DPI-unaware, so the frame's scale is frameW / the window's logical width).
//   greys.mjs <frame.raw> <w> <h> f16|bgra <calib.json> [--white <SDRWhiteLevel>] [--png out.png]
//     f16  every patch centre's FP16 bits → linear → THE mapping (src/stream-plan.js srgb8OfHalf, ÷ white/80 → sRGB OETF)
//          and the same bits WITHOUT ÷ white (the RED control: 1.0 = 80 nits, what an unmapped scRGB reader shows)
//     bgra every patch centre's 8-bit value as it came
//   Each centre is checked flat over a 9×9 box (one value ⇒ the patch, not an edge). Exit 0 only when every patch is EXACT.
//   --png writes the frame as a PNG through ffmpeg (f16: mapped with THE table first; bgra: as it came).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = process.env.REPO || path.resolve(new URL('../../..', import.meta.url).pathname);
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const [file, w, h, fmt, calib, ...rest] = process.argv.slice(2);
const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
if (!file || !['f16', 'bgra'].includes(fmt)) { console.log('usage: greys.mjs <frame.raw> <w> <h> f16|bgra <calib.json> [--white 2500] [--png out.png]'); process.exit(2); }
const W = Number(w), H = Number(h), white = Number(opt('--white', 2500)), png = opt('--png', null);
const cal = JSON.parse(fs.readFileSync(calib, 'utf8').replace(/^﻿/, ''));
const buf = fs.readFileSync(file), bpp = fmt === 'f16' ? 8 : 4;
if (buf.length !== W * H * bpp) { console.error(`size ${buf.length} ≠ ${W}×${H}×${bpp}`); process.exit(2); }
const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2);
const sx = W / cal.window.w, sy = H / cal.window.h;
const px = (x, y) => (fmt === 'f16' ? [0, 1, 2].map((k) => u16[(y * W + x) * 4 + k]) : [2, 1, 0].map((k) => buf[(y * W + x) * 4 + k])); // bgra → r,g,b
console.log(`frame ${W}×${H} ${fmt} · window logical ${cal.window.w}×${cal.window.h} ⇒ scale ${sx.toFixed(4)} × ${sy.toFixed(4)}${fmt === 'f16' ? ` · white ${white} (${white / 12.5} nits)` : ''}`);
let bad = 0;
const rows = [];
for (const p of cal.patches) {
  const cx = Math.round((p.x - cal.window.x + p.w / 2) * sx), cy = Math.round((p.y - cal.window.y + p.h / 2) * sy);
  const c = px(cx, cy);
  let flat = true;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const q = px(cx + dx, cy + dy); if (q.some((v, k) => v !== c[k])) flat = false; }
  let got, extra = '';
  if (fmt === 'f16') {
    got = c.map((b) => SP.srgb8OfHalf(b, { white }));
    const raw = c.map((b) => SP.srgb8OfHalf(b, { white: 1000 }));
    extra = `bits ${c.join(',').padEnd(17)} linear ${c.map((b) => SP.halfToFloat(b).toFixed(4)).join(',').padEnd(22)} unmapped(÷1) ${raw.join(',')}`;
  } else got = c;
  const exact = got.every((v, k) => v === p.rgb[k]);
  if (!exact || !flat) bad++;
  rows.push({ label: p.label, want: p.rgb, got, exact, flat });
  console.log(`${exact && flat ? '✓' : '✗'} ${p.label.padEnd(7)} @${cx},${cy} want ${p.rgb.join(',').padEnd(11)} got ${got.join(',').padEnd(11)} ${flat ? 'flat' : 'NOT FLAT'} ${extra}`);
}
console.log(bad ? `${bad} of ${rows.length} patch(es) NOT exact` : `ALL ${rows.length} patches EXACT`);
if (png) {
  let rgb;
  if (fmt === 'f16') {
    const lut = SP.buildLut({ white });
    rgb = Buffer.alloc(W * H * 3);
    for (let i = 0, j = 0; i < W * H; i++, j += 3) { rgb[j] = lut[u16[i * 4]]; rgb[j + 1] = lut[u16[i * 4 + 1]]; rgb[j + 2] = lut[u16[i * 4 + 2]]; }
  }
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', fmt === 'f16' ? 'rgb24' : 'bgra', '-video_size', `${W}x${H}`, '-i', 'pipe:0', '-frames:v', '1', png], { input: fmt === 'f16' ? rgb : buf });
  console.log(`png ${png}`);
}
process.exit(bad ? 1 : 0);
