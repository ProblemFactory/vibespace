#!/usr/bin/env node
// measure-brand-marks.mjs — lane brand-marks (the owner: "多色转单色 logo 要注意不同颜色的对比度"): the COLOUR ANALYSIS
// behind a monochrome vendor mark (public/brand/<vendor>.svg), and its proof by measurement. Inputs by PATH, never
// committed: each vendor's official colour mark — an SVG (its filled paths are the regions; a gradient is sampled where
// it paints) or a raster (its regions = its palette clusters). Prints per vendor: every ADJACENT region pair with ΔE76 /
// ΔL* / hue jump and its class (contrast-high = ΔL* ≥ 20 or a hue jump ≥ 60° on ≥ 25 % of the boundary ⇒ must survive in
// mono as a gap or an outline; low ⇒ may merge); then the mono's proof: IoU of the dilated high boundary vs the mono's
// dilated luminance-Sobel edges at 48 px (≥ 0.6), and the gap pixels at 14 px and the badge's 10 px, DPR 1 / 2
// (background in ≥ 1 of the 2). Renders with inkscape + ImageMagick (on the box).
// usage: node scripts/measure-brand-marks.mjs --lark <svg|png> --gmail <svg|png> [--old <dir>] [--sheet <out.png>]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : ''; };
let TMP = '', seq = 0;   // made on first use — importing GAPS (test-brand-marks) writes nothing
const tmp = (ext) => path.join((TMP ||= mkdtempSync(path.join(tmpdir(), 'brand-marks-'))), `${seq++}.${ext}`);
// the gap centre lines of OUR marks (quadratics x0 y0 cx cy x1 y1, viewBox units) — what the 14 px / 10 px check samples:
// Lark's wing|head and head|body seams, Gmail's flap|right-leg seam moved half its gap under the flap's outer edge
export const GAPS = {
  lark: [[17.65, 8.45, 15, 9.3, 12.5, 12.3], [9.6, 14.5, 15.05, 18.4, 19.9, 14.3]],
  gmail: [[18.6, 11.34, 20.6, 9.66, 22.6, 7.98]],
};

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { maxBuffer: 1 << 28, ...opts });
function hires(file) {           // → a PNG path (≥ 768 px) of the file
  if (!/\.svg$/i.test(file)) return file;
  const out = tmp('png');
  sh('inkscape', [file, '--export-type=png', `--export-filename=${out}`, '-w', '768', '-h', '768', '--export-background-opacity=0'], { stdio: 'ignore' });
  return out;
}
function raw(png, extra = []) {  // → { w, h, d: Uint8Array RGBA }
  const geo = String(sh('convert', [png, ...extra, '-format', '%w %h', 'info:'])).trim().split(' ').map(Number);
  const d = new Uint8Array(sh('convert', [png, ...extra, '-depth', '8', 'rgba:-']));
  return { w: geo[0], h: geo[1], d };
}
function bboxOf(png) {
  const { w, h, d } = raw(png);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return `${x1 - x0 + 1}x${y1 - y0 + 1}+${x0}+${y0}`;
}
// the mark cropped to its ink and fitted (90 %) into px × px — both marks of a comparison share this frame
const norm = (png, crop, px) => raw(png, ['-crop', crop, '+repage', '-filter', 'Box', '-resize', `${Math.round(px * 0.9)}x${Math.round(px * 0.9)}`, '-background', 'none', '-gravity', 'center', '-extent', `${px}x${px}`]);
function direct(svg, px) {       // the mark as a browser paints it: the viewBox straight onto px × px
  const out = tmp('png');
  sh('inkscape', [svg, '--export-type=png', `--export-filename=${out}`, '-w', String(px), '-h', String(px), '--export-background-opacity=0'], { stdio: 'ignore' });
  return raw(out);
}

export function lab([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = h((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), fy = h(0.2126 * R + 0.7152 * G + 0.0722 * B), fz = h((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const hueOf = ([, a, b]) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

// regions: per pixel the id of the region painting it (-1 = background), plus the colour image
function regions(file, px) {
  const hi = hires(file), crop = bboxOf(hi), img = norm(hi, crop, px), n = px * px;
  const id = new Int16Array(n).fill(-1);
  const names = [];
  if (/\.svg$/i.test(file)) {    // SVG: one layer per filled path, the later path on top
    const src = readFileSync(file, 'utf8');
    const tags = src.match(/<path\b[^>]*>/g) || [];
    tags.forEach((tag, i) => {
      let k = -1;
      const layer = src.replace(/<path\b[^>]*>/g, (t) => (++k === i ? t.replace(/\sfill="[^"]*"/, '').replace('<path', '<path fill="#000"') : t.replace(/\sfill="[^"]*"/, '').replace('<path', '<path fill="none"')));
      const lf = tmp('svg'); writeFileSync(lf, layer);
      const m = norm(hires(lf), crop, px);
      for (let p = 0; p < n; p++) if (m.d[p * 4 + 3] > 127) id[p] = i;
      names.push(`path${i + 1}`);
    });
  } else {                       // raster: the palette = the colours covering ≥ 2 % of the ink, merged within ΔE 12
    const hb = raw(hi), cnt = new Map();
    let ink = 0;
    for (let p = 0; p < hb.w * hb.h; p++) {
      if (hb.d[p * 4 + 3] < 250) continue; ink++;
      const k = ((hb.d[p * 4] >> 4) << 8) | ((hb.d[p * 4 + 1] >> 4) << 4) | (hb.d[p * 4 + 2] >> 4);
      const e = cnt.get(k) || { n: 0, s: [0, 0, 0] }; e.n++; for (let c = 0; c < 3; c++) e.s[c] += hb.d[p * 4 + c]; cnt.set(k, e);
    }
    const pal = [];
    for (const e of [...cnt.values()].sort((a, b) => b.n - a.n)) {
      if (e.n < ink * 0.02) break;
      const c = e.s.map((v) => v / e.n), L = lab(c);
      if (!pal.some((q) => Math.hypot(...q.L.map((v, j) => v - L[j])) < 12)) pal.push({ c, L });
    }
    for (let p = 0; p < n; p++) {
      if (img.d[p * 4 + 3] <= 127) continue;
      const L = lab([img.d[p * 4], img.d[p * 4 + 1], img.d[p * 4 + 2]]);
      let best = 0, bd = Infinity;
      pal.forEach((q, i) => { const dd = Math.hypot(...q.L.map((v, j) => v - L[j])); if (dd < bd) { bd = dd; best = i; } });
      id[p] = best;
    }
    pal.forEach((q, i) => names.push(`cluster${i + 1}`));
  }
  const col = (p) => [img.d[p * 4], img.d[p * 4 + 1], img.d[p * 4 + 2]];
  names.forEach((nm, i) => { const cs = []; for (let p = 0; p < n; p++) if (id[p] === i) cs.push(col(p)); names[i] = `${nm} ${cs.length ? hex([0, 1, 2].map((c) => median(cs.map((v) => v[c])))) : '(hidden)'}`; });
  return { px, id, img, names, col };
}

// interior = a pixel whose 3×3 neighbourhood is all one region (antialias seams never count as a region)
function interior({ px, id }) {
  const out = new Int16Array(px * px).fill(-1);
  for (let y = 1; y < px - 1; y++) for (let x = 1; x < px - 1; x++) {
    const v = id[y * px + x]; if (v < 0) continue;
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (id[(y + dy) * px + x + dx] !== v) { ok = false; break; }
    if (ok) out[y * px + x] = v;
  }
  return out;
}
// adjacent pairs: interior pixels of A with an interior pixel of B within r — each such pixel is one boundary sample
function boundaries(R, r) {
  const { px, col } = R, I = interior(R), pairs = new Map();
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const a = I[y * px + x]; if (a < 0) continue;
    const near = new Map();
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= px || Y >= px) continue;
      const b = I[Y * px + X]; if (b < 0 || b === a) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy)); if (!near.has(b) || near.get(b).d > d) near.set(b, { d, q: Y * px + X });
    }
    for (const [b, { q }] of near) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!pairs.has(key)) pairs.set(key, { a: Math.min(a, b), b: Math.max(a, b), s: [], band: new Set() });
      const e = pairs.get(key), La = lab(col(y * px + x)), Lb = lab(col(q));
      const dh = Math.abs(hueOf(La) - hueOf(Lb)), dL = Math.abs(La[0] - Lb[0]);
      e.s.push({ dE: Math.hypot(La[0] - Lb[0], La[1] - Lb[1], La[2] - Lb[2]), dL, dh: Math.min(dh, 360 - dh) });
      e.band.add(y * px + x); e.band.add(q);
    }
  }
  return [...pairs.values()].map((e) => {
    const high = e.s.filter((s) => s.dL >= 20 || s.dh >= 60).length / e.s.length;
    return { ...e, dE: median(e.s.map((s) => s.dE)), dL: median(e.s.map((s) => s.dL)), dh: median(e.s.map((s) => s.dh)), high, cls: high >= 0.25 ? 'HIGH' : 'low' };
  });
}

function sobelEdges(lum, px, t = 0.25) {
  const e = new Uint8Array(px * px);
  for (let y = 1; y < px - 1; y++) for (let x = 1; x < px - 1; x++) {
    const L = (dx, dy) => lum[(y + dy) * px + x + dx];
    const gx = L(1, -1) + 2 * L(1, 0) + L(1, 1) - L(-1, -1) - 2 * L(-1, 0) - L(-1, 1);
    const gy = L(-1, 1) + 2 * L(0, 1) + L(1, 1) - L(-1, -1) - 2 * L(0, -1) - L(1, -1);
    if (Math.hypot(gx, gy) / 4 >= t) e[y * px + x] = 1;
  }
  return e;
}
const lumOf = (img, px) => Float32Array.from({ length: px * px }, (_, p) => { const a = img.d[p * 4 + 3] / 255; const [r, g, b] = [0, 1, 2].map((c) => img.d[p * 4 + c] / 255); return 1 - a + a * (0.2126 * r + 0.7152 * g + 0.0722 * b); });
function dilate(set, px, r) {
  const out = new Uint8Array(px * px);
  for (let p = 0; p < px * px; p++) if (set[p]) { const x = p % px, y = (p / px) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < px && Y < px) out[Y * px + X] = 1; } }
  return out;
}
// the seam of a boundary: pixels with region a AND region b within 2 px (an antialias pixel between them never splits it)
function seam({ px, id }, a, b) {
  const s = new Uint8Array(px * px);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    let ha = false, hb = false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= px || Y >= px) continue; const v = id[Y * px + X]; ha ||= v === a; hb ||= v === b; }
    if (ha && hb) s[y * px + x] = 1;
  }
  return s;
}
// IoU of the seam (dilated 1) vs the edges found within 2 px of it (dilated 1)
function iou(B, edges, px) {
  const D = dilate(B, px, 1), near = dilate(B, px, 2), E = dilate(edges, px, 1);
  let i = 0, u = 0;
  for (let p = 0; p < px * px; p++) { const m = E[p] && near[p]; if (D[p] && m) i++; if (D[p] || m) u++; }
  return u ? i / u : 0;
}
// a gap holds at px when ≥ 7 of the 9 samples along its middle 80 % are background (alpha ≤ 0.5)
function gapHolds(svg, segs, px) {
  const img = direct(svg, px);
  return segs.map(([x0, y0, cx, cy, x1, y1]) => {
    let bg = 0;
    for (let k = 0; k < 9; k++) {
      const t = 0.1 + (0.8 * k) / 8, q = (a, c, b) => (1 - t) ** 2 * a + 2 * t * (1 - t) * c + t * t * b;
      const x = (q(x0, cx, x1) * px) / 24, y = (q(y0, cy, y1) * px) / 24;
      if (img.d[((y | 0) * px + (x | 0)) * 4 + 3] <= 127) bg++;
    }
    return bg;
  });
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
function vendor(name, ref, mono, old) {
  console.log(`\n## ${name} — reference ${ref}`);
  const T = regions(ref, 192), table = boundaries(T, 3);
  console.log('| regions | ΔE76 | ΔL* | hue jump | high share | class |\n|---|---|---|---|---|---|');
  for (const b of table) console.log(`| ${T.names[b.a]} ↔ ${T.names[b.b]} | ${fmt(b.dE)} | ${fmt(b.dL)} | ${fmt(b.dh)}° | ${fmt(b.high * 100, 0)} % | ${b.cls} |`);
  const R = regions(ref, 48), hi48 = table.filter((t) => t.cls === 'HIGH').map((t) => ({ ...t, band: seam(R, t.a, t.b) }));
  const crop = (f) => { const h = hires(f); return norm(h, bboxOf(h), 48); };
  const offEdges = sobelEdges(lumOf(R.img, 48), 48);
  const res = { name, table, hi: [] };
  for (const b of hi48) {
    const row = { pair: `${R.names[b.a]} ↔ ${R.names[b.b]}`, official: iou(b.band, offEdges, 48) };
    for (const [k, f] of [['mono', mono], ['old', old]]) if (f) row[k] = iou(b.band, sobelEdges(lumOf(crop(f), 48), 48), 48);
    res.hi.push(row);
    console.log(`48 px edge IoU, ${row.pair}: official ${fmt(row.official, 2)} · new mono ${fmt(row.mono, 2)}${old ? ` · old mark ${fmt(row.old, 2)}` : ''} (≥ 0.60)`);
  }
  if (mono && GAPS[name]) for (const px of [14, 10]) {
    const g1 = gapHolds(mono, GAPS[name], px), g2 = gapHolds(mono, GAPS[name], px * 2);
    const ok = g1.map((v, i) => v >= 7 || g2[i] >= 7);
    console.log(`${px} px gaps (background samples /9, DPR 1 | DPR 2): ${g1.map((v, i) => `${v} | ${g2[i]}`).join(' · ')} → ${ok.every(Boolean) ? 'holds' : 'LOST'}`);
    res[`gap${px}`] = { g1, g2, ok: ok.every(Boolean) };
  }
  return res;
}

const out = [];
for (const v of ['lark', 'gmail']) if (arg(v)) out.push(vendor(v, arg(v), path.join(ROOT, `public/brand/${v}.svg`), arg('old') ? path.join(arg('old'), `${v}.svg`) : ''));
if (arg('json')) writeFileSync(arg('json'), JSON.stringify(out.map(({ table, ...r }) => ({ ...r, table: table.map(({ s, band, ...t }) => t) })), null, 1));
