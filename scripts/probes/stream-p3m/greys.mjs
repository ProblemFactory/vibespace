#!/usr/bin/env node
// lane stream-p3m-probe (P3m-0) — the greys table of a frame sck-probe dumped (base.raw + base.txt, pulled here). Finds the
// p3m-aux calibration window by its magenta ground, maps the 19 patch centres (calib.ps1's layout, in POINTS) through the
// measured scale, and prints want vs got. Formats: BGRA, 420v/420f (8-bit 4:2:0), x420/xf20 (10-bit 4:2:0, 16-bit words).
// YCbCr is decoded with BT.709 (the attachment sck-probe printed says which matrix) and stays gamma-encoded — the question is
// whether SCK hands the SDR picture already correct (no tone-map / colour-space shift), not what light it makes.
//   node greys.mjs <base> [--at x,y,scale]   (reads <base>.txt for the size + format, <base>.raw for the planes)
import fs from 'node:fs';
const base = process.argv[2];
if (!base) { console.error('usage: greys.mjs <base>   (base.raw + base.txt from sck-probe --dump)'); process.exit(2); }
const txt = fs.readFileSync(base + '.txt', 'utf8');
const m = /pixelbuffer (\d+)x(\d+) fmt=(\S+)/.exec(txt);
if (!m) { console.error('no "pixelbuffer WxH fmt=" line in ' + base + '.txt'); process.exit(2); }
const W = +m[1], H = +m[2], fmt = m[3], raw = fs.readFileSync(base + '.raw');
const ten = fmt.startsWith('x'), full = fmt === '420f' || fmt === 'xf20';
const u16 = ten ? new Uint16Array(raw.buffer, raw.byteOffset, raw.length >> 1) : null;
const yOff = 0, cOff = W * H; // in samples (bytes for 8-bit, words for 10-bit)
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
function px(x, y) {
  if (fmt === 'BGRA') { const i = (y * W + x) * 4; return [raw[i + 2], raw[i + 1], raw[i]]; }
  const s = (i) => (ten ? u16[i] >> 6 : raw[i]), max = ten ? 1023 : 255, k = ten ? 4 : 1;
  const Y = s(yOff + y * W + x), ci = cOff + (y >> 1) * W + (x & ~1), Cb = s(ci), Cr = s(ci + 1);
  const yn = full ? Y / max : (Y - 16 * k) / (219 * k), cb = full ? (Cb - 128 * k) / max : (Cb - 128 * k) / (224 * k), cr = full ? (Cr - 128 * k) / max : (Cr - 128 * k) / (224 * k);
  return [clamp(255 * (yn + 1.5748 * cr)), clamp(255 * (yn - 0.1873 * cb - 0.4681 * cr)), clamp(255 * (yn + 1.8556 * cb))];
}
// the magenta ground's bounding box = the content view (a window capture also holds the title bar above it)
// --at x,y,scale: the content box's top-left in frame pixels + px per point, when the ground is not magenta any more (a
// display-profile or YCbCr frame moves it) — the window sits where p3m-aux calib put it, so the caller knows
const CW = 1184, CH = 248, at = process.argv.indexOf('--at');
let x0 = W, y0 = H, x1 = -1, y1 = -1, scale;
if (at > 0) { const [ax, ay, as] = process.argv[at + 1].split(',').map(Number); x0 = ax; y0 = ay; scale = as; x1 = Math.round(ax + CW * as) - 2; y1 = Math.round(ay + CH * as) - 2; }
else {
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const [r, g, b] = px(x, y); if (r > 200 && g < 60 && b > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < 0) { console.log('no magenta ground in the frame — give --at x,y,scale'); process.exit(1); }
  scale = (x1 - x0 + 2) / CW; // content size in points (24 + 11·96 + 10·8 + 24 wide)
}
console.log(`ground (magenta 255,0,255) reads ${px(Math.round(x0 + 12 * scale), Math.round(y0 + 12 * scale)).join(',')}`);
const greys = [0, 26, 51, 77, 102, 128, 153, 179, 204, 230, 255];
const cols = [['R', [255, 0, 0]], ['G', [0, 255, 0]], ['B', [0, 0, 255]], ['C', [0, 255, 255]], ['M', [255, 0, 255]], ['Y', [255, 255, 0]], ['grey50', [128, 128, 128]], ['white', [255, 255, 255]]];
const P = [...greys.map((g, i) => ({ l: 'grey' + i * 10, want: [g, g, g], x: 24 + i * 104 + 48, y: 72 })), ...cols.map(([l, c], i) => ({ l, want: c, x: 24 + i * 104 + 48, y: 24 + 104 + 48 }))];
console.log(`${base}: ${W}x${H} ${fmt}; content box ${x0},${y0}–${x1},${y1} (${x1 - x0 + 2}x${y1 - y0 + 2} px) ⇒ scale ${scale.toFixed(3)} px/pt${y0 > 0 ? `, ${y0} px above the content (title bar / shadow)` : ''}`);
let exact = 0, near = 0;
console.log('| patch | want | got | Δmax |\n|---|---|---|---|');
for (const p of P) {
  const got = px(Math.round(x0 + p.x * scale), Math.round(y0 + p.y * scale)), d = Math.max(...got.map((v, k) => Math.abs(v - p.want[k])));
  if (d === 0) exact++; if (d <= 2) near++;
  console.log(`| ${p.l} | ${p.want.join(',')} | ${got.join(',')} | ${d} |`);
}
console.log(`${exact}/${P.length} exact, ${near}/${P.length} within ±2`);
process.exit(near === P.length ? 0 : 1);
