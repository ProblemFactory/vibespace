#!/usr/bin/env node
// test-brand-marks — lane brand-marks (the owner: "多色转单色 logo 要注意不同颜色的对比度"): the vendor marks'
// SVG contract (public/brand/<vendor>.svg: viewBox 0 0 24 24, ONE fill = currentColor, ≤ 900 bytes, no external ref, no
// <style>/<script>) and the colour-analysis gaps pinned on the PATH DATA — a tiny in-process flattener says every gap centre
// line (GAPS, the table scripts/measure-brand-marks.mjs measures as pixels at 14 / 10 px) is background with ink on both
// sides. The raster proof (edge IoU vs the official colour mark, DPR 1 / 2) stays in measure-brand-marks.mjs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GAPS } from './measure-brand-marks.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m} ${x}`); } };

// path data (absolute M L H V Q C A Z — our drawings' grammar) → polygons
function polys(d) {
  const tk = d.match(/[A-Za-z]|-?(?:\d*\.\d+|\d+)/g), out = [];
  let i = 0, cmd = '', cur = null, x = 0, y = 0, x0 = 0, y0 = 0;
  const n = () => Number(tk[i++]), to = (X, Y) => { cur.push([X, Y]); x = X; y = Y; };
  const bez = (pts) => { for (let k = 1; k <= 16; k++) { const t = k / 16; let p = pts; while (p.length > 1) p = p.slice(1).map((q, j) => [p[j][0] + (q[0] - p[j][0]) * t, p[j][1] + (q[1] - p[j][1]) * t]); cur.push(p[0]); } [x, y] = pts.at(-1); };
  while (i < tk.length) {
    if (/[A-Za-z]/.test(tk[i])) cmd = tk[i++];
    if (cmd === 'M') { cur = []; out.push(cur); x0 = n(); y0 = n(); to(x0, y0); cmd = 'L'; }
    else if (cmd === 'L') to(n(), n());
    else if (cmd === 'H') to(n(), y);
    else if (cmd === 'V') to(x, n());
    else if (cmd === 'Q') bez([[x, y], [n(), n()], [n(), n()]]);
    else if (cmd === 'C') bez([[x, y], [n(), n()], [n(), n()], [n(), n()]]);
    else if (cmd === 'A') {   // circular arcs, no rotation (SVG F.6.5)
      const r0 = n(); n(); n(); const fa = n(), fs = n(), X = n(), Y = n();
      const dx = (x - X) / 2, dy = (y - Y) / 2, d2 = dx * dx + dy * dy, r = Math.max(r0, Math.sqrt(d2));
      const k = (fa !== fs ? 1 : -1) * Math.sqrt(Math.max(0, (r * r - d2) / d2)), cx = k * dy + (x + X) / 2, cy = -k * dx + (y + Y) / 2;
      const a1 = Math.atan2(y - cy, x - cx); let da = Math.atan2(Y - cy, X - cx) - a1;
      if (fs && da < 0) da += 2 * Math.PI; if (!fs && da > 0) da -= 2 * Math.PI;
      for (let s = 1; s <= 16; s++) cur.push([cx + r * Math.cos(a1 + (da * s) / 16), cy + r * Math.sin(a1 + (da * s) / 16)]);
      x = X; y = Y;
    } else if (cmd === 'Z') { x = x0; y = y0; cmd = ''; }
    else throw new Error(`path command ${cmd} outside the grammar`);
  }
  return out;
}
const inside = (ps, X, Y) => ps.reduce((c, p) => { for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > Y) !== (p[j][1] > Y) && X < ((p[j][0] - p[i][0]) * (Y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c; }, false);

for (const v of ['lark', 'gmail', 'slack']) {
  const svg = readFileSync(path.join(ROOT, `public/brand/${v}.svg`), 'utf8');
  ok(Buffer.byteLength(svg) <= 900, `${v}.svg ≤ 900 bytes`, Buffer.byteLength(svg));
  ok(/<svg [^>]*viewBox="0 0 24 24"/.test(svg) && !/<(style|script|image|use|linearGradient|radialGradient|mask|filter)\b|href=|url\(|on[a-z]+=/i.test(svg), `${v}.svg: viewBox 0 0 24 24, no gradient / style / script / external ref`);
  ok((svg.match(/fill="[^"]*"/g) || []).every((f) => f === 'fill="currentColor"'), `${v}.svg: one fill (currentColor or the default) — monochrome`);
}
const SEP = { lark: 1.15, gmail: 1.2 };   // half the gap + half a unit: where the ink beside a gap must be
for (const [v, segs] of Object.entries(GAPS)) {
  const svg = readFileSync(path.join(ROOT, `public/brand/${v}.svg`), 'utf8');
  ok(/<!--[^]*COLOUR ANALYSIS[^]*-->/.test(svg), `${v}.svg names its method (colour analysis) in its comment`);
  const ps = polys([...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(' '));
  segs.forEach(([x0, y0, cx, cy, x1, y1], k) => {
    const bad = [];
    for (const t of [0.35, 0.5, 0.65]) {
      const q = (a, c, b) => (1 - t) ** 2 * a + 2 * t * (1 - t) * c + t * t * b, dq = (a, c, b) => 2 * (1 - t) * (c - a) + 2 * t * (b - c);
      const X = q(x0, cx, x1), Y = q(y0, cy, y1), tx = dq(x0, cx, x1), ty = dq(y0, cy, y1), l = Math.hypot(tx, ty), nx = -ty / l, ny = tx / l, s = SEP[v];
      if (inside(ps, X, Y) || !inside(ps, X + nx * s, Y + ny * s) || !inside(ps, X - nx * s, Y - ny * s)) bad.push(t);
    }
    ok(!bad.length, `${v}.svg gap ${k + 1}: background on the seam, ink on both sides`, `t=${bad}`);
  });
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
