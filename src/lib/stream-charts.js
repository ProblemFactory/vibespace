// THE STREAM'S CHARTS (lane stream-stats-popup — the owner 2026-10-19: 「加入 latency、packet drop、bandwidth 等图表」): the details'
// three sparklines over the last 120 s on a <canvas>, no library. The model is PURE (src/stream-series.js chartModel — the unit,
// the top, the runs; a second nobody read is a GAP and the line breaks there, never bridged); this file only draws it in the
// theme's tokens (read off the canvas at each draw — a theme switch shows at the next second) and finds the hovered second.
//   latency  the RTT line, the jitter as a band round it (RTT ± jitter)
//   loss     the packets lost each second as % bars; a frame the browser dropped is a mark along the top
//   rate     the received kbps (the line), the machine's decided rate (dashed) and its floor (dotted)
import { chartModel, xOf, indexAt, SERIES_SECONDS } from '../stream-series.js';

const TOKEN = { // a role → its theme token (and the kb-design-lessons §17 fallback)
  line: ['--accent', '#3b82f6'], loss: ['--red', '#e55'], drop: ['--yellow', '#e5c07b'], rate: ['--green', '#3fb950'],
  floor: ['--text-secondary', '#888'], grid: ['--border', '#888'], cursor: ['--text', '#888'],
};
const colourOf = (cs, [name, fb]) => (cs.getPropertyValue(name) || '').trim() || fb;
const LINE_STYLE = { rtt: ['line', []], kbps: ['line', []], rate: ['rate', [4, 3]], floor: ['floor', [1, 3]] };

/** Draw `kind` over `rows` into the canvas at its CSS size (× devicePixelRatio); `hover` = the row index under the pointer (a
 *  hairline there). → the chart's model (its max + unit — the caller's axis words), null when there is nothing to draw on. */
export function drawChart(canvas, rows, kind, { hover = null } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const m = chartModel(list, kind);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!m || !(w > 0) || !(h > 0)) return m;
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const g = canvas.getContext('2d');
  if (!g) return m;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const cs = getComputedStyle(canvas);
  const len = list.length, top = 2, bottom = h - 1.5, step = (w - 1) / (SERIES_SECONDS - 1);
  const x = (i) => xOf(i, len, w - 1) + 0.5;
  const y = (v) => bottom - (Math.min(Math.max(v, 0), m.max) / m.max) * (bottom - top);
  // the grid: hairlines at the chart's top (its max — the axis word) and its floor
  g.lineWidth = 1; g.setLineDash([]); g.globalAlpha = 0.5; g.strokeStyle = colourOf(cs, TOKEN.grid);
  g.beginPath(); g.moveTo(0, top + 0.5); g.lineTo(w, top + 0.5); g.moveTo(0, Math.round(bottom) + 0.5); g.lineTo(w, Math.round(bottom) + 0.5); g.stroke();
  g.globalAlpha = 1;
  // the band (latency: RTT ± jitter)
  if (m.band.length) {
    g.fillStyle = colourOf(cs, TOKEN.line); g.globalAlpha = 0.22;
    for (const run of m.band) {
      if (run.length === 1) { const [i, lo, hi] = run[0]; g.fillRect(x(i) - 1, y(hi), 2, Math.max(1, y(lo) - y(hi))); continue; }
      g.beginPath();
      run.forEach(([i, , hi], k) => (k ? g.lineTo(x(i), y(hi)) : g.moveTo(x(i), y(hi))));
      for (let k = run.length - 1; k >= 0; k--) g.lineTo(x(run[k][0]), y(run[k][1]));
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  }
  // the bars (loss %) and the marks (frames dropped)
  if (m.bars.length) {
    g.fillStyle = colourOf(cs, TOKEN.loss);
    const bw = Math.max(1.5, step - 0.5);
    for (const [i, v] of m.bars) if (v > 0) { const t = Math.min(y(v), bottom - 1); g.fillRect(x(i) - bw / 2, t, bw, bottom - t); }
  }
  if (m.marks.length) {
    g.fillStyle = colourOf(cs, TOKEN.drop);
    for (const [i] of m.marks) { const cx = x(i); g.beginPath(); g.moveTo(cx - 2.5, top); g.lineTo(cx + 2.5, top); g.lineTo(cx, top + 4); g.closePath(); g.fill(); }
  }
  // the lines (a run each — a gap ends one; a lone second is a dot)
  for (const line of m.lines) {
    const [role, dash] = LINE_STYLE[line.key] || ['line', []];
    g.strokeStyle = g.fillStyle = colourOf(cs, TOKEN[role]);
    g.lineWidth = line.key === 'floor' ? 1 : 1.5; g.setLineDash(dash);
    for (const run of line.runs) {
      if (run.length === 1) { g.beginPath(); g.arc(x(run[0][0]), y(run[0][1]), 1.5, 0, Math.PI * 2); g.fill(); continue; }
      g.beginPath();
      run.forEach(([i, v], k) => (k ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
      g.stroke();
    }
  }
  g.setLineDash([]);
  // the hovered second
  if (Number.isInteger(hover) && hover >= 0 && hover < len) {
    g.strokeStyle = colourOf(cs, TOKEN.cursor); g.globalAlpha = 0.6; g.lineWidth = 1;
    g.beginPath(); g.moveTo(Math.round(x(hover)) + 0.5, 0); g.lineTo(Math.round(x(hover)) + 0.5, h); g.stroke();
    g.globalAlpha = 1;
  }
  return m;
}

/** The row under a pointer at `clientX` over the canvas → its index, or null. */
export function chartIndexAt(canvas, clientX, len) {
  const r = canvas.getBoundingClientRect();
  return indexAt(clientX - r.left, len, r.width);
}
