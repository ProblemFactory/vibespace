'use strict';
/**
 * THE STREAM'S DETAILS — PURE (lane stream-stats-popup; the owner 2026-10-19: 「做成简单展示，只有点击后才会展开更多细节的 popup，
 * popup 可以 pin 在右上角之类的地方观察，同时加入 latency、packet drop、bandwidth 等图表」 + 「全屏模式做成真全屏，不要在顶部固定这个条，
 * 或者做成可移动的 overlay 而不是挤压屏幕空间的固定条」). A stream window's strip says ONE summary; its click opens the details
 * (src/lib/stream-stats.js — the table + three charts drawn by src/lib/stream-charts.js), which can be pinned to a corner of the
 * window; in full screen the strip floats over the picture as a small pill (src/lib/stream-pill.js). What they decide is here —
 * no DOM, no clock, no storage (the callers hand in the facts):
 *
 *   SERIES_SECONDS / createSeries(n)   THE RING: one row a second, the last 120 s, fed by the page's own per-second getStats
 *                                      read + the agent's push it already has (nothing new is asked of the agent); a second
 *                                      with no read is a GAP (null) — a throttled tab, a display switch — drawn as a break
 *   sampleOf(prev, page, agent)        one second's row: RTT, jitter, packet loss % (Δlost ÷ (Δlost + Δreceived) since the read
 *                                      before), the packets lost / received and the frames dropped in that span, fps, decode ms,
 *                                      received kbps, the machine's decided rate + its floor + its estimate. Counters that went
 *                                      BACK (a new connection) ⇒ that second's loss is a gap, never a negative
 *   niceMax(v, least)                  a chart's top: the next 1 / 2 / 2.5 / 5 × 10ⁿ at or above v (never under `least`)
 *   CHART_KINDS / chartModel(rows, kind)   a chart's model: its unit, its top, each line as RUNS of [index, value] (a gap ends a
 *                                      run — never bridged), the band (jitter round the RTT), the bars (loss %) and the marks
 *                                      (frames dropped): latency · loss · rate (received kbps vs the machine's decided rate)
 *   xOf(i, len, width) / indexAt(x, len, width)   THE WINDOW is a fixed 120 s: the newest second on the right edge
 *   readoutAt(rows, i, kind)           a hovered second's values (the chart's readout) — `gap: true` where nothing was read
 *   detailRows({page, agent, via, source})   the details table, in THE order: rtt · jitter · fps · decode · kbps · path · codec ·
 *                                      encoder · display · size · rate · loss — the first five always (— until read), the rest
 *                                      only when someone said them
 *   CORNERS / cornerOf / cornerFrom / cornerMemory / rememberCorner   the pinned panel's and the pill's place: a corner of their
 *                                      frame (the nearest one where a drag ends), remembered per machine (≤ 32 machines)
 *   PILL / pillVerdict(facts) / wakeVerdict(facts)   the full-screen pill: shown while the pointer moved in the last 3 s and
 *                                      while it is hovered, dragged, its menu or a popup is open, or a notice that must not be
 *                                      missed is up; a mouse's move anywhere wakes it, a touch only inside its corner's zone
 *                                      (that tap is the pill's — swallowed while it was hidden, so it never clicks the machine)
 */

const SERIES_SECONDS = 120;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One second's row (see the header). `prev` = the page's read before (null at the first). */
function sampleOf(prev, page, agent = null) {
  if (!page) return null;
  const d = (k) => { const a = num(page[k]), b = prev ? num(prev[k]) : null; return a != null && b != null ? a - b : null; };
  const dLost = d('lost'), dRecv = d('received'), dDrop = d('dropped');
  const back = (dRecv != null && dRecv < 0) || (dDrop != null && dDrop < 0); // a new connection's counters start over
  const lost = back || dLost == null ? null : Math.max(0, dLost); // packetsLost steps back by a late duplicate: never below 0
  const received = back ? null : dRecv;
  const lossPct = lost == null || received == null ? null : lost + received > 0 ? Math.round((lost / (lost + received)) * 10000) / 100 : 0;
  const sc = (agent && agent.screen) || null;
  return {
    rtt: num(page.rttMs), jitter: num(page.jitterMs), lossPct, lost, received, dropped: back || dDrop == null ? null : Math.max(0, dDrop),
    fps: num(page.fps), decode: num(page.decodeMs), kbps: num(page.kbps),
    rate: sc ? num(sc.kbps) : null, floor: sc ? num(sc.floor) : null, bwe: agent ? num(agent.bweKbps) : null,
  };
}

/** THE RING. feed(page, agent) — the page's read (statsOf's: `at` = its performance.now ms) → true when it made a new row (a
 *  read already seen, or an older one, makes none); the seconds between two reads more than a second apart are gaps. */
function createSeries(n = SERIES_SECONDS) {
  const size = Math.max(2, Math.floor(Number(n) || SERIES_SECONDS));
  let rows = [], lastAt = null, prev = null;
  return {
    feed(page, agent = null) {
      const at = page ? num(page.at) : null;
      if (at == null || (lastAt != null && at <= lastAt)) return false;
      const gap = lastAt == null ? 0 : Math.min(size, Math.max(0, Math.round((at - lastAt) / 1000) - 1));
      for (let i = 0; i < gap; i++) rows.push(null);
      rows.push(sampleOf(gap ? null : prev, page, agent)); // across a gap no difference is taken (it would span the hole)
      if (rows.length > size) rows = rows.slice(rows.length - size);
      lastAt = at; prev = page;
      return true;
    },
    rows: () => rows.slice(),
    get size() { return size; },
    clear() { rows = []; lastAt = null; prev = null; },
  };
}

/** A chart's top (see the header). */
function niceMax(v, least = 1) {
  const x = num(v), lo = num(least) || 1;
  if (x == null || x <= lo) return lo;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 2, 2.5, 5]) if (x <= m * e * (1 + 1e-9)) return m * e;
  return 10 * e;
}

/** The runs of `pick(row)` over the rows: [[ [i, v], … ], …] — a null row or value ends a run. */
function runsOf(rows, pick) {
  const runs = [];
  let cur = null;
  rows.forEach((r, i) => {
    const v = r ? num(pick(r)) : null;
    if (v == null) { cur = null; return; }
    if (!cur) { cur = []; runs.push(cur); }
    cur.push([i, v]);
  });
  return runs;
}
const CHART_KINDS = Object.freeze(['latency', 'loss', 'rate']);
const LEAST = Object.freeze({ latency: 10, loss: 1, rate: 1000 }); // the smallest top: 10 ms, 1 %, 1000 kbps (a quiet line stays low)
/** A chart's model (see the header) → { kind, unit, max, lines: [{ key, runs }], band: [[ [i, lo, hi], … ], …], bars: [[i, v]], marks: [[i, n]] } */
function chartModel(rows, kind) {
  const list = Array.isArray(rows) ? rows : [];
  const top = (vals) => niceMax(Math.max(0, ...vals.filter((v) => v != null)), LEAST[kind] || 1);
  if (kind === 'latency') {
    const band = runsOf(list, (r) => (r.rtt != null && r.jitter != null ? r.rtt : null)).map((run) => run.map(([i, v]) => [i, Math.max(0, v - list[i].jitter), v + list[i].jitter]));
    return { kind, unit: 'ms', max: top(list.map((r) => (r && num(r.rtt) != null ? r.rtt + (num(r.jitter) || 0) : null))), lines: [{ key: 'rtt', runs: runsOf(list, (r) => r.rtt) }], band, bars: [], marks: [] };
  }
  if (kind === 'loss') {
    const bars = [], marks = [];
    list.forEach((r, i) => { if (r && num(r.lossPct) != null) bars.push([i, r.lossPct]); if (r && num(r.dropped) > 0) marks.push([i, r.dropped]); });
    return { kind, unit: '%', max: top(bars.map(([, v]) => v)), lines: [], band: [], bars, marks };
  }
  if (kind === 'rate') {
    const lines = [{ key: 'kbps', runs: runsOf(list, (r) => r.kbps) }, { key: 'rate', runs: runsOf(list, (r) => r.rate) }, { key: 'floor', runs: runsOf(list, (r) => r.floor) }];
    return { kind, unit: 'kbps', max: top(list.flatMap((r) => (r ? [num(r.kbps), num(r.rate), num(r.floor)] : []))), lines, band: [], bars: [], marks: [] };
  }
  return null;
}

/** THE WINDOW: row i of `len` at x (the newest at `width`); the step is one second of SERIES_SECONDS across the width. */
function xOf(i, len, width, n = SERIES_SECONDS) {
  return width - (len - 1 - i) * (width / (n - 1));
}
/** The row under x → its index, or null (left of the oldest row, or nothing read yet). */
function indexAt(x, len, width, n = SERIES_SECONDS) {
  if (!(len > 0) || !(width > 0) || num(x) == null) return null;
  const i = len - 1 - Math.round((width - x) / (width / (n - 1)));
  return i >= 0 && i < len ? Math.min(i, len - 1) : null;
}
/** A hovered second's values for the chart's readout: { ago (seconds), gap } + the kind's values. */
function readoutAt(rows, i, kind) {
  const list = Array.isArray(rows) ? rows : [];
  if (!Number.isInteger(i) || i < 0 || i >= list.length) return null;
  const r = list[i], ago = list.length - 1 - i;
  if (!r) return { ago, gap: true };
  if (kind === 'latency') return { ago, gap: r.rtt == null, rtt: r.rtt, jitter: r.jitter };
  if (kind === 'loss') return { ago, gap: r.lossPct == null, lossPct: r.lossPct, lost: r.lost, received: r.received, dropped: r.dropped };
  if (kind === 'rate') return { ago, gap: r.kbps == null && r.rate == null, kbps: r.kbps, rate: r.rate, floor: r.floor };
  return null;
}

/** THE DETAILS TABLE (see the header) → [{ k, …the row's facts }]; the words are the page's. */
function detailRows({ page = null, agent = null, via = null, source = null } = {}) {
  if (!page) return [];
  const sc = (agent && agent.screen) || null;
  const rows = [];
  rows.push({ k: 'rtt', ms: num(page.rttMs) }, { k: 'jitter', ms: num(page.jitterMs) }, { k: 'fps', fps: num(page.fps), sent: agent ? num(agent.fps) : null },
    { k: 'decode', ms: num(page.decodeMs) }, { k: 'kbps', kbps: num(page.kbps), sent: agent ? num(agent.kbps) : null });
  if (['direct', 'udp', 'link', 'relay'].includes(via)) rows.push({ k: 'path', via });
  if (typeof page.codec === 'string' && page.codec) rows.push({ k: 'codec', codec: page.codec.slice(0, 24) });
  if (sc && sc.encoder) rows.push({ k: 'encoder', encoder: String(sc.encoder).slice(0, 40), ms: num(sc.encodeMs) });
  const did = sc && sc.display != null ? String(sc.display) : source && source.display != null ? String(source.display) : null;
  if (did) {
    const row = source && Array.isArray(source.displays) ? source.displays.find((x) => x && String(x.id) === did) : null;
    rows.push({ k: 'display', id: did.slice(0, 80), name: row && row.name ? String(row.name).slice(0, 80) : null });
  }
  if (num(page.width) != null && num(page.height) != null) rows.push({ k: 'size', w: page.width, h: page.height, sw: sc ? num(sc.w) : null, sh: sc ? num(sc.h) : null });
  if (sc && (num(sc.kbps) != null || num(sc.floor) != null)) rows.push({ k: 'rate', kbps: num(sc.kbps), floor: num(sc.floor), bwe: agent ? num(agent.bweKbps) : null });
  if (num(page.lost) != null || num(page.dropped) != null) rows.push({ k: 'loss', lost: num(page.lost), received: num(page.received), dropped: num(page.dropped) });
  return rows;
}

// ── THE CORNERS (the pinned panel's, the pill's) ─────────────────────────────────────────────────────────────────────────
const CORNERS = Object.freeze(['tl', 'tr', 'bl', 'br']);
const MEMORY_HOSTS = 32;
const cornerFrom = (v, fallback = 'tr') => (CORNERS.includes(v) ? v : CORNERS.includes(fallback) ? fallback : 'tr');
/** The corner nearest a point of a box (the dragged thing's centre in its frame) → 'tl' | 'tr' | 'bl' | 'br' | null */
function cornerOf(pt, box) {
  const x = num(pt && pt.x), y = num(pt && pt.y), w = num(box && box.w), h = num(box && box.h);
  if (x == null || y == null || !(w > 0) || !(h > 0)) return null;
  return (y < h / 2 ? 't' : 'b') + (x < w / 2 ? 'l' : 'r');
}
const memoryOf = (raw) => { let o = raw; if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } } return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; };
/** The stored memory (localStorage's string, or its object) → this machine's corner (else `fallback`). */
function cornerMemory(raw, hostId, fallback = 'tr') {
  const o = memoryOf(raw), k = String(hostId || '');
  return cornerFrom(k && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null, fallback);
}
/** The memory with this machine's corner set (moved last; the oldest machines beyond 32 forgotten) → its JSON string. */
function rememberCorner(raw, hostId, corner) {
  const o = memoryOf(raw), k = String(hostId || '').slice(0, 200);
  const keep = Object.entries(o).filter(([h, c]) => h !== k && CORNERS.includes(c));
  if (k && CORNERS.includes(corner)) keep.push([k, corner]);
  return JSON.stringify(Object.fromEntries(keep.slice(-MEMORY_HOSTS)));
}

// ── THE FULL-SCREEN PILL ─────────────────────────────────────────────────────────────────────────────────────────────────
const PILL = Object.freeze({ hideMs: 3000, zone: 1 / 3, corner: 'tl' }); // hidden 3 s after the last move; a touch wakes it inside the third of the screen at its corner
/** → { shown, why, recheckMs } — `recheckMs` = when the verdict may turn (null: only an event turns it). */
function pillVerdict({ now = 0, lastActive = null, hover = false, drag = false, menu = false, notice = false } = {}) {
  if (drag) return { shown: true, why: 'drag', recheckMs: null };
  if (menu) return { shown: true, why: 'menu', recheckMs: null };
  if (hover) return { shown: true, why: 'hover', recheckMs: null };
  if (notice) return { shown: true, why: 'notice', recheckMs: null };
  const idle = num(now) != null && num(lastActive) != null ? now - lastActive : Infinity;
  if (idle < PILL.hideMs) return { shown: true, why: 'moved', recheckMs: Math.max(1, PILL.hideMs - idle) };
  return { shown: false, why: 'idle', recheckMs: null };
}
/** A pointer event over the full-screen picture → { wake, swallow }: a mouse's or a pen's move / press wakes the pill; a TOUCH
 *  press wakes it only inside its corner's zone (a third of the frame each way), and that tap is swallowed while the pill was
 *  hidden (the person reached for the pill — a click on whatever the machine shows in that corner would be a surprise). */
function wakeVerdict({ type = '', pointerType = 'mouse', pt = null, corner = PILL.corner, box = null, shown = false } = {}) {
  if (pointerType !== 'touch') return { wake: type === 'pointermove' || type === 'pointerdown', swallow: false };
  if (type !== 'pointerdown') return { wake: false, swallow: false };
  const x = num(pt && pt.x), y = num(pt && pt.y), w = num(box && box.w), h = num(box && box.h);
  if (x == null || y == null || !(w > 0) || !(h > 0)) return { wake: false, swallow: false };
  const c = cornerFrom(corner, PILL.corner), zw = w * PILL.zone, zh = h * PILL.zone;
  const inX = c[1] === 'l' ? x <= zw : x >= w - zw, inY = c[0] === 't' ? y <= zh : y >= h - zh;
  return inX && inY ? { wake: true, swallow: !shown } : { wake: false, swallow: false };
}

module.exports = {
  SERIES_SECONDS, sampleOf, createSeries, niceMax, CHART_KINDS, chartModel, xOf, indexAt, readoutAt, detailRows,
  CORNERS, cornerOf, cornerFrom, cornerMemory, rememberCorner, PILL, pillVerdict, wakeVerdict,
};
