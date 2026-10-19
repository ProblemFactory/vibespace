'use strict';
/**
 * A MACHINE WITH SEVERAL DISPLAYS (lane desktop-display-modes, owner 2026-10-19): its desktop streams in THREE modes, the
 * mode is the window's and remembered per machine —
 *   switch   ③ ONE window, one display at a time: the strip's switcher restarts the stream on another (a phone's only mode)
 *   windows  ① a window PER display: each its own stream, stats row and stop; its title names the display
 *   all      ② every display in ONE window, laid out as on the machine: one stream per display, a pane per display
 * PURE (no I/O, no DOM): the page (src/lib/machine-desktop.js) and the tests read the same rules.
 *
 *   DISPLAY_MODES / modeOf(raw, {phone})   the mode a window takes (unknown ⇒ switch; a phone ⇒ switch)
 *   displayRows(displays)                  the stream offer's displays (a Windows screen source's or a Mac helper's) →
 *                                          [{ id, n, name, x, y, w, h, px: {w, h}, primary, hdr, capturable }] left to right
 *                                          (x, y, w, h in the machine's own desktop space: pixels on Windows, points on a Mac;
 *                                          px = the display's real pixels — what its size reads)
 *   paneLayout({displays, width, height, collapsed, stub, gap})
 *                                          ② the machine's arrangement scaled to fit the pane: ONE scale for every display (the
 *                                          arrangement is kept — touching displays touch, a display above stays above), the
 *                                          bounding box centred; a COLLAPSED display is a tab-sized stub in a row along the
 *                                          pane's top and the others fill the rest → { scale, box, panes, stubs }
 *   displayAt(layout, x, y)                ② the display whose pane holds the point (null in a gap, on a stub, outside)
 *   sumStats(rows)                         ② the stats row of N streams: fps and kbps summed over the playing ones, the
 *                                          slowest display named (by fps — only when two or more play and it IS slower: a
 *                                          tie names nobody)
 *   rememberedOf(raw)                      the per-machine memory → { mode, display, displays, folded } (bounded, typed)
 */

const DISPLAY_MODES = Object.freeze(['switch', 'windows', 'all']);
const MAX_DISPLAYS = 16;
const STUB = Object.freeze({ w: 132, h: 26 }); // a collapsed display's tab (css px)
const GAP = 6;

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

/** The mode a window takes: one of DISPLAY_MODES (anything else ⇒ switch); a phone shows one display at a time ⇒ switch. */
function modeOf(raw, { phone = false } = {}) {
  if (phone) return 'switch';
  return DISPLAY_MODES.includes(raw) ? raw : 'switch';
}

/** The offer's displays (either platform's row: `primary` or a Mac's `main`, `pw`/`ph` a Mac's real pixels) → the rows, left
 *  to right then top to bottom, numbered from 1; a row without an id or a size is dropped, an id seen twice counts once. */
function displayRows(displays) {
  const seen = new Set(), rows = [];
  for (const d of Array.isArray(displays) ? displays : []) {
    if (!d || d.id == null || rows.length >= MAX_DISPLAYS) continue;
    const id = String(d.id).slice(0, 60), x = fin(d.x), y = fin(d.y), w = fin(d.w), h = fin(d.h);
    if (!id || seen.has(id) || x == null || y == null || !(w > 0) || !(h > 0)) continue;
    seen.add(id);
    const pw = fin(d.pw) > 0 ? d.pw : w, ph = fin(d.ph) > 0 ? d.ph : h;
    rows.push({ id, name: str(d.name, 80), x, y, w, h, px: { w: Math.round(pw), h: Math.round(ph) }, primary: !!(d.primary || d.main), hdr: d.hdr === true, capturable: d.capturable !== false });
  }
  rows.sort((a, b) => a.x - b.x || a.y - b.y);
  return rows.map((r, i) => ({ ...r, n: i + 1 }));
}

/**
 * ② THE LAYOUT. `displays` = displayRows' rows (or raw — they are normalized), `width` × `height` = the pane (css px),
 * `collapsed` = ids shown as stubs. → { scale, box: {x, y, w, h}, panes: [{id, n, x, y, w, h}], stubs: [{id, n, x, y, w, h}] }
 * — integer css px; a pane's edges are rounded from the machine's edges, so displays that touch on the machine share an edge.
 */
function paneLayout({ displays = [], width = 0, height = 0, collapsed = [], stub = STUB, gap = GAP } = {}) {
  const rows = displays.length && displays[0] && displays[0].n && displays[0].px ? displays : displayRows(displays);
  const hidden = new Set((Array.isArray(collapsed) ? collapsed : []).map(String));
  const W = Math.max(0, Math.floor(fin(width) || 0)), H = Math.max(0, Math.floor(fin(height) || 0));
  const stubs = [], panes = [];
  const folded = rows.filter((d) => hidden.has(d.id));
  folded.forEach((d, i) => stubs.push({ id: d.id, n: d.n, x: gap + i * (stub.w + gap), y: gap, w: stub.w, h: stub.h }));
  const top = stubs.length ? stub.h + 2 * gap : 0;
  const shown = rows.filter((d) => !hidden.has(d.id));
  if (!shown.length || !W || H - top <= 0) return { scale: 0, box: { x: 0, y: top, w: 0, h: 0 }, panes, stubs };
  const minX = Math.min(...shown.map((d) => d.x)), minY = Math.min(...shown.map((d) => d.y));
  const bw = Math.max(...shown.map((d) => d.x + d.w)) - minX, bh = Math.max(...shown.map((d) => d.y + d.h)) - minY;
  const scale = Math.min(W / bw, (H - top) / bh);
  const ox = (W - bw * scale) / 2, oy = top + (H - top - bh * scale) / 2;
  const at = (v, o) => Math.round(o + v * scale);
  for (const d of shown) {
    const x = at(d.x - minX, ox), y = at(d.y - minY, oy);
    panes.push({ id: d.id, n: d.n, x, y, w: at(d.x + d.w - minX, ox) - x, h: at(d.y + d.h - minY, oy) - y });
  }
  return { scale, box: { x: Math.round(ox), y: Math.round(oy), w: Math.round(bw * scale), h: Math.round(bh * scale) }, panes, stubs };
}

/** ② The display under a point of the pane (css px, the pane's own origin) → its id, or null (a gap, a stub, outside). */
function displayAt(layout, x, y) {
  for (const p of (layout && layout.panes) || []) if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return p.id;
  return null;
}

/** ② The stats row of N streams: rows = [{ id, n, playing, fps, kbps }] → { playing, fps, kbps, slowest: {id, n, fps} | null }. */
function sumStats(rows) {
  const live = (Array.isArray(rows) ? rows : []).filter((r) => r && r.playing);
  const sum = (k) => live.reduce((a, r) => a + (fin(r[k]) || 0), 0);
  let slowest = null;
  if (live.length >= 2) for (const r of live) if (fin(r.fps) != null && (!slowest || r.fps < slowest.fps)) slowest = { id: r.id, n: r.n, fps: r.fps };
  if (slowest && !live.some((r) => fin(r.fps) != null && r.fps > slowest.fps)) slowest = null; // all as fast: nobody is the slowest
  return { playing: live.length, fps: Math.round(sum('fps')), kbps: Math.round(sum('kbps')), slowest };
}

/** The per-machine memory (this browser's): { mode, display, displays, folded } — `display` = the one shown in ③ (or the
 *  window's in ①), `displays` = the displays ① had a window for, `folded` = ②'s folded panes; at most 8 ids each. */
function rememberedOf(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const id = (v) => (v == null || v === '' ? null : String(v).slice(0, 60));
  const list = (v) => (Array.isArray(v) ? [...new Set(v.map(id).filter(Boolean))].slice(0, 8) : []);
  return { mode: modeOf(o.mode), display: id(o.display), displays: list(o.displays), folded: list(o.folded) };
}

module.exports = { DISPLAY_MODES, MAX_DISPLAYS, STUB, GAP, modeOf, displayRows, paneLayout, displayAt, sumStats, rememberedOf };
