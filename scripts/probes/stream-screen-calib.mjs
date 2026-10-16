#!/usr/bin/env node
// lane stream-p1b-screen — THE REAL-MACHINE COLOUR CHECK of the screen source (scripts/probes/stream-screen-real-leg.md runs it;
// never a suite). The calibration window is the P0's calib.ps1 (/var/tmp/vibespace-lanes/desktop-design/q034-probe/): 11 greys +
// R G B C M Y + grey50 + white at LOGICAL coordinates (calib.json; the screen's DPI scale turns them into pixels).
//   raw <frame.raw> <w> <h> <calib.json> --white <SDRWhiteLevel>
//        an rgbaf16le frame the capture argv wrote on the machine (pulled here) → every patch centre through THE mapping
//        (src/stream-plan.js srgb8OfHalf) → the table; exit 0 only when every patch is EXACT
//   snippet <calib.json> [--scale <s>]
//        prints a script for the VibeSpace tab's console: it draws the playing stream's <video> into a canvas, reads every
//        patch centre (video pixels = the display's pixels — the stream is the display at its native size) and prints the
//        table; PASS = every channel within ±2 (H.264 4:2:0 + the browser's YUV → RGB)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const [mode, ...rest] = process.argv.slice(2);
const flag = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? Number(rest[i + 1]) : d; };
const calibOf = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); // PowerShell's Set-Content writes a BOM
const centres = (cal, scale) => cal.patches.map((p) => ({ label: p.label, want: p.rgb, x: Math.round((p.x + p.w / 2) * scale), y: Math.round((p.y + p.h / 2) * scale) }));

if (mode === 'raw') {
  const [file, w, h, calib] = rest;
  const W = Number(w), H = Number(h), white = flag('--white', 0);
  if (!(white > 0)) { console.error('give the display\'s SDRWhiteLevel: --white 2500 (stream-facts says it)'); process.exit(2); }
  const cal = calibOf(calib), scale = W / cal.primary.w;
  const u16 = new Uint16Array(fs.readFileSync(file).buffer.slice(0, W * H * 8));
  let bad = 0;
  for (const c of centres(cal, scale)) {
    const i = (c.y * W + c.x) * 4, got = [0, 1, 2].map((k) => SP.srgb8OfHalf(u16[i + k], { white }));
    const exact = got.every((v, k) => v === c.want[k]);
    if (!exact) bad++;
    console.log(`${exact ? '✓' : '✗'} ${c.label.padEnd(8)} want ${c.want.join(',').padEnd(12)} got ${got.join(',').padEnd(12)} fp16 ${[0, 1, 2].map((k) => u16[i + k]).join(',')}`);
  }
  console.log(bad ? `${bad} patch(es) NOT exact` : `ALL ${cal.patches.length} patches EXACT (scale ${scale.toFixed(3)}, white ${white})`);
  process.exit(bad ? 1 : 0);
} else if (mode === 'snippet') {
  const cal = calibOf(rest[0]);
  const scale = flag('--scale', 0);
  console.log(`(() => { const v = document.querySelector('.stream-video'); if (!v || !v.videoWidth) return 'no playing stream';
  const s = ${scale > 0 ? scale : `v.videoWidth / ${cal.primary.w}`}, P = ${JSON.stringify(cal.patches.map((p) => ({ l: p.label, r: p.rgb, x: p.x + p.w / 2, y: p.y + p.h / 2 })))};
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const g = c.getContext('2d'); g.drawImage(v, 0, 0);
  let bad = 0; const rows = P.map((p) => { const d = g.getImageData(Math.round(p.x * s), Math.round(p.y * s), 1, 1).data; const ok = [0, 1, 2].every((k) => Math.abs(d[k] - p.r[k]) <= 2); if (!ok) bad++; return { patch: p.l, want: p.r.join(','), got: [d[0], d[1], d[2]].join(','), ok }; });
  console.table(rows); return bad ? bad + ' patch(es) off by more than 2' : 'PASS: all ' + rows.length + ' patches within ±2 (' + v.videoWidth + '×' + v.videoHeight + ')'; })()`);
} else {
  console.log('usage: stream-screen-calib.mjs raw <frame.raw> <w> <h> <calib.json> --white <SDRWhiteLevel> | snippet <calib.json> [--scale <s>]');
  process.exit(2);
}
