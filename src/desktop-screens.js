'use strict';
/**
 * DESKTOP v2 P0 (lane desktop-v2-entry, design q-030 §2 D1/D2, §3, §4 — owner 2026-10-12 "应该允许选择显示器…桌面不再直接打开一个
 * 本地桌面，而是选择本地或者remote"): which part of a paired machine's framebuffer is which DISPLAY, the Desktop picker's rows,
 * and how the picture is doing. PURE (no I/O, no DOM): the page, the hub and the tests read the same rules.
 *
 *   rfbScreens(bytes)                    an ExtendedDesktopSize (-308) rect's payload → [{id, x, y, w, h, flags}] (fb pixels) | null
 *   screenMap({fb, screens, rfb, dpr})   the machine's OWN screen table (the `display-facts` device op — points on a Mac,
 *                                        pixels on Windows, any origin) + the RFB table → { state, why, source, displays } in fb
 *                                        pixels. The union's bbox ≠ the fb size ⇒ `unknown` (the whole screen — never a guess);
 *                                        an RFB table of ≥ 2 screens that contradicts the OS table ⇒ the framebuffer's own wins
 *   pickerRows({local, machines, recent}) the Desktop popover's rows: 最近 (the last choice, host + display) · 本地 · 远程
 *   clientMessages(bytes)                the page → server RFB bytes of one send, cut into message types (the stats' outgoing side);
 *   clientCuts(bytes)                    the same cut as [{type, at}] (lane desktop-v2-latency: the request's incremental flag, the
 *                                        PointerEvent's button mask)
 *   updateTimer()                        the update round trip (a FramebufferUpdateRequest out → the next one, which noVNC sends the
 *                                        moment the update it asked for is drawn) and the dynamic fps (updates in the last second);
 *                                        lane desktop-v2-latency: `received(at, n)` adds the link rate (kbps over updates of ≥ 32 KB,
 *                                        timed from their first byte) and the picture's changes (answers to incremental requests)
 *   cursorPlan(image, scale)             lane win-desktop-cursor-hdr (owner 2026-10-13 "鼠标如此巨大"): the machine's pointer image
 *                                        at the picture's scale → 'native' | 'scaled' (16–64 css px, the hotspot scaled too) |
 *                                        'server' (wider than 128 px: the machine paints it into the picture); scaleRgba draws it
 *   pointerShown(image)                  lane stream-cursor: the machine's pointer image has a pixel to see (none sent yet, or
 *                                        a fully transparent one ⇒ false: the viewer's own arrow is the pointer, never none)
 *   hdrShown({screens, map, key})        the shown display (or, showing all, any display) is in Windows HDR — TightVNC captures
 *                                        it without tone mapping, so the bar says so (true only on a measured `hdr: true`)
 *   carryPick(prev, next, key)           lane heavy3-flake-races: the display a pick named, across a remap — the RFB rects and
 *                                        the machine's own table land in EITHER order and key a display differently (an RFB
 *                                        screen id vs the OS id); a key the new map lacks moves to its display at the same place
 */

/** Slack (fb px) when a union's bbox is compared with the framebuffer (a 1.5 scale rounds by a pixel). */
const FIT_TOL = 2;
/** More screens than this is not a desk. */
const MAX_SCREENS = 16;
/** A round trip longer than this is an idle screen (the server holds an incremental request until something changes), not latency. */
const IDLE_TRIP_MS = 2000;
const STATES = Object.freeze(['map', 'single', 'unknown']);
const ROW_STATES = Object.freeze(['ready', 'setup', 'offline']);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
const text = (s, n = 80) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

/** The -308 payload: number-of-screens (u8), 3 padding, then per screen id u32, x u16, y u16, w u16, h u16, flags u32. */
function rfbScreens(bytes) {
  const b = bytes && typeof bytes.length === 'number' ? bytes : null;
  if (!b || b.length < 4) return null;
  const n = b[0];
  if (!n || n > MAX_SCREENS || b.length < 4 + 16 * n) return null;
  const u16 = (i) => (b[i] << 8) | b[i + 1];
  const u32 = (i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const out = [];
  for (let k = 0; k < n; k++) {
    const o = 4 + 16 * k;
    const r = { id: u32(o), x: u16(o + 4), y: u16(o + 6), w: u16(o + 8), h: u16(o + 10), flags: u32(o + 12) };
    if (r.w > 0 && r.h > 0) out.push(r);
  }
  return out.length ? out : null;
}

const bboxOf = (rs) => rs.reduce((b, r) => ({ x0: Math.min(b.x0, r.x), y0: Math.min(b.y0, r.y), x1: Math.max(b.x1, r.x + r.w), y1: Math.max(b.y1, r.y + r.h) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
const fitsFb = (b, fb) => Math.abs((b.x1 - b.x0) - fb.w) <= FIT_TOL && Math.abs((b.y1 - b.y0) - fb.h) <= FIT_TOL;
const byPlace = (a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y;
const clampRect = (r, fb) => { const x = Math.max(0, Math.min(fb.w - 1, Math.round(r.x))), y = Math.max(0, Math.min(fb.h - 1, Math.round(r.y))); return { x, y, w: Math.max(1, Math.min(fb.w - x, Math.round(r.w))), h: Math.max(1, Math.min(fb.h - y, Math.round(r.h))) }; };
const sameRect = (a, b) => Math.abs(a.x - b.x) <= FIT_TOL && Math.abs(a.y - b.y) <= FIT_TOL && Math.abs(a.w - b.w) <= FIT_TOL && Math.abs(a.h - b.h) <= FIT_TOL;

/** The OS table, judged: finite rects with a size, ≤ MAX_SCREENS. */
function osScreens(screens) {
  if (!Array.isArray(screens)) return [];
  const out = [];
  for (const s of screens.slice(0, MAX_SCREENS)) {
    if (!s || typeof s !== 'object') continue;
    const x = num(s.x), y = num(s.y), w = num(s.w), h = num(s.h);
    if (x == null || y == null || !(w > 0) || !(h > 0)) continue;
    const scale = num(s.scale);
    out.push({ id: s.id == null ? null : text(s.id, 60), name: text(s.name), primary: !!s.primary, x, y, w, h, scale: scale > 0 ? scale : 1, hdr: s.hdr === true ? true : s.hdr === false ? false : null });
  }
  return out;
}

/** The OS table in fb pixels at one factor (its own origin moved to 0,0 — a Windows secondary left of the primary is negative). */
function osAt(os, f) {
  const b = bboxOf(os);
  return os.map((s) => ({ ...s, rect: { x: (s.x - b.x0) * f, y: (s.y - b.y0) * f, w: s.w * f, h: s.h * f } }));
}

/**
 * THE SCREEN MAP. fb = {w, h} (the framebuffer noVNC draws), screens = the OS table, rfb = rfbScreens(...) (or null),
 * dpr = a known points→pixels factor (optional). → { state: 'map'|'single'|'unknown', why, source, displays: [{key, n, id,
 * name, primary, rect:{x,y,w,h}}] } — `displays` empty on unknown (the whole screen is the only honest picture).
 */
function screenMap({ fb, screens = null, rfb = null, dpr = null } = {}) {
  const F = fb && num(fb.w) > 0 && num(fb.h) > 0 ? { w: num(fb.w), h: num(fb.h) } : null;
  if (!F) return { state: 'unknown', why: 'no_framebuffer', source: null, displays: [] };
  const os = osScreens(screens);
  // the OS table at the first factor whose union is the framebuffer: as given (Windows pixels, a Mac sending points), the
  // screens' one shared backing scale (a Retina Mac sending pixels), a factor the caller knows — mixed scales never fit
  let osFit = null;
  if (os.length) {
    const scales = [...new Set(os.map((s) => s.scale))];
    for (const f of [1, scales.length === 1 ? scales[0] : null, num(dpr)].filter((v) => v > 0)) {
      const at = osAt(os, f);
      if (fitsFb(bboxOf(at.map((s) => s.rect)), F)) { osFit = at; break; }
    }
  }
  const rt = Array.isArray(rfb) ? rfb.filter((r) => r && r.w > 0 && r.h > 0).slice(0, MAX_SCREENS) : [];
  const rfbFit = rt.length >= 2 && fitsFb(bboxOf(rt), F) && bboxOf(rt).x0 === 0 && bboxOf(rt).y0 === 0 ? rt : null;
  const shape = (rows, source, why) => {
    const ds = rows.map((s) => ({ id: s.id == null ? null : String(s.id), name: s.name || '', primary: !!s.primary, hdr: s.hdr === true ? true : s.hdr === false ? false : null, rect: clampRect(s.rect, F) })).sort(byPlace);
    ds.forEach((d, i) => { d.n = i + 1; d.key = d.id || String(i + 1); });
    return { state: ds.length > 1 ? 'map' : 'single', why, source, displays: ds };
  };
  if (rfbFit) {
    const rows = rfbFit.map((r) => ({ id: String(r.id), name: '', primary: false, rect: { x: r.x, y: r.y, w: r.w, h: r.h } }));
    if (osFit && osFit.length === rows.length) {
      const a = [...osFit].sort((p, q) => p.rect.x - q.rect.x || p.rect.y - q.rect.y), b = [...rows].sort(byPlace);
      if (a.every((s, i) => sameRect(s.rect, b[i].rect))) return shape(a, 'both', null); // they agree: the OS names on the RFB places
    }
    return shape(rows, 'rfb', os.length ? 'os_disagrees' : null); // the framebuffer's own table wins over an OS table that contradicts it
  }
  if (osFit) return shape(osFit, 'os', null);
  return { state: 'unknown', why: os.length ? 'bbox_mismatch' : 'no_table', source: null, displays: [] };
}

/** A machine row's state for the picker (the PURE row of GET /api/desktop/machines). */
function rowState(m) {
  if (!m || m.code === 'offline') return 'offline';
  return m.code === 'desktop_ready' ? 'ready' : 'setup';
}

/**
 * THE PICKER'S ROWS (D1). local = { available, seat } (GET /api/vnc/status; seat 'wayland' = the D4 words), machines = GET
 * /api/desktop/machines rows (only the whole-desktop ones are remote rows), recent = { hostId, display } (this browser's last
 * choice). → [{ group: 'recent'|'local'|'remote', kind: 'local'|'machine', hostId, display, state, enabled, machine }]
 * The recent row is FIRST when what it names still exists (its state is today's); the same target keeps its own row below.
 */
function pickerRows({ local = null, machines = [], recent = null } = {}) {
  const rows = [];
  const loc = { group: 'local', kind: 'local', hostId: 'local', display: null, state: local && local.available === false ? 'offline' : 'ready', enabled: !(local && local.available === false), seat: local && local.seat === 'wayland' ? 'wayland' : null, machine: null };
  const remote = (Array.isArray(machines) ? machines : []).filter((m) => m && m.hostId && m.hostId !== 'local' && m.desktop === 'vnc-native')
    .map((m) => ({ group: 'remote', kind: 'machine', hostId: String(m.hostId), display: null, state: rowState(m), enabled: rowState(m) !== 'offline', machine: m }));
  const r = recent && typeof recent === 'object' && recent.hostId ? recent : null;
  const hit = r ? (r.hostId === 'local' ? loc : remote.find((x) => x.hostId === String(r.hostId))) : null;
  if (hit) rows.push({ ...hit, group: 'recent', display: hit.kind === 'machine' && r.display != null ? text(r.display, 60) : null });
  rows.push(loc, ...remote);
  return rows;
}

/** What the picker remembers (per browser): the host and the display. → the stored shape | null */
function recentChoice(hostId, display = null) {
  const h = text(hostId, 120);
  return h ? { hostId: h, display: display == null || display === '' ? null : text(display, 60), at: 0 } : null;
}

/** Client → server RFB message sizes by type (null = needs the bytes). Unknown types stop the cut. */
function clientMessages(bytes) { return clientCuts(bytes).map((m) => m.type); }

/** The same cut, each message with its offset in the send. */
function clientCuts(bytes) {
  const b = bytes && typeof bytes.length === 'number' ? bytes : null;
  const out = [];
  if (!b) return out;
  let i = 0;
  while (i < b.length) {
    const t = b[i];
    let n = 0;
    if (t === 0) n = 20;
    else if (t === 2) n = i + 4 <= b.length ? 4 + 4 * ((b[i + 2] << 8) | b[i + 3]) : 0;
    else if (t === 3) n = 10;
    else if (t === 4) n = 8;
    else if (t === 5) n = 6;
    else if (t === 6) { if (i + 8 <= b.length) { const len = ((b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7]); n = 8 + Math.abs(len); } }
    else if (t === 150) n = 10;
    else if (t === 251) n = i + 8 <= b.length ? 8 + 16 * b[i + 6] : 0;
    else if (t === 255) n = 12; // QEMU's extended key event (lane desktop-v2-latency)
    if (!n || i + n > b.length) break;
    out.push({ type: t, at: i });
    i += n;
  }
  return out;
}

/** An update this big is timed for the link rate (smaller ones are mostly the round trip, not the transfer). */
const RATE_MIN_BYTES = 32 * 1024;
/** THE TIMING TABLE: `request(at, incremental)` at every FramebufferUpdateRequest sent, `received(at, n)` for every message in;
 *  `stats(now)` → { roundTripMs, fps, samples, kbps, changes, changeBytes }. kbps = the median rate of the last 5 updates of
 *  ≥ RATE_MIN_BYTES, each timed from its FIRST byte to the next request (the server's hold and the round trip left out; a
 *  median, so one big fast refresh cannot hide a link that turned slow);
 *  changes / changeBytes = answers to INCREMENTAL requests in the last second (a full refresh asked for is not a change);
 *  `request` answers whether it closed such a change. */
function updateTimer({ keep = 30, idleMs = IDLE_TRIP_MS, rateKeep = 5 } = {}) {
  let last = null, cur = null;
  const trips = [], stamps = [], rates = [], changes = [];
  const trim = (now) => {
    while (stamps.length && now - stamps[0] > 1000) stamps.shift();
    while (changes.length && now - changes[0].at > 1000) changes.shift();
  };
  return {
    request(at, incremental = true) {
      const t = num(at); if (t == null) return;
      if (last != null) { const d = t - last; if (d >= 0 && d < idleMs) { trips.push(d); if (trips.length > keep) trips.shift(); } }
      let changed = false;
      if (cur && cur.bytes > 0) {
        if (cur.incremental) { changes.push({ at: t, bytes: cur.bytes }); changed = true; }
        if (cur.bytes >= RATE_MIN_BYTES && cur.first != null) { rates.push((cur.bytes * 8) / Math.max(1, t - cur.first)); if (rates.length > rateKeep) rates.shift(); }
      }
      cur = { incremental: incremental !== false, first: null, bytes: 0 };
      last = t; stamps.push(t); trim(t);
      return changed; // this request closed a change (the picture moved since the last one)
    },
    received(at, n) {
      const t = num(at), k = num(n);
      if (t == null || k == null || k <= 0 || !cur) return;
      if (cur.first == null) cur.first = t;
      cur.bytes += k;
    },
    stats(now) {
      trim(num(now) == null ? (last || 0) : num(now));
      const s = [...trips].sort((a, b) => a - b);
      const rs = [...rates].sort((a, b) => a - b);
      return { roundTripMs: s.length ? Math.round(s[(s.length - 1) >> 1]) : null, fps: stamps.length, samples: s.length,
        kbps: rs.length ? Math.round(rs[(rs.length - 1) >> 1]) : null, changes: changes.length, changeBytes: changes.reduce((a, c) => a + c.bytes, 0) };
    },
  };
}

// ── lane win-desktop-cursor-hdr: THE MACHINE'S POINTER AT THE PICTURE'S SCALE ───────────────────────────────────────
// noVNC draws the Cursor pseudo-encoding's image as a CSS cursor at its own pixel size; the framebuffer under it is scaled to
// fit. So (at any scale but 1) the image is scaled by the same factor (css px = fb px × scale — the browser already draws a CSS cursor at the
// device-pixel ratio), floored at 16 px (never smaller than a usable pointer) and capped at 64 css px; an image wider than
// 128 px (Chrome refuses a custom cursor past 128 px) is left to the machine, which paints it into the picture.
const CURSOR_MIN = 16, CURSOR_MAX = 64, CURSOR_SERVER_OVER = 128;
/** image = {w, h, hotx, hoty} (fb px), scale = the view's → { path: 'native'|'scaled'|'server', w, h, hotx, hoty, factor }. */
function cursorPlan(image, scale) {
  const w = num(image && image.w) || 0, h = num(image && image.h) || 0;
  const hx = num(image && image.hotx) || 0, hy = num(image && image.hoty) || 0;
  const side = Math.max(w, h);
  const keep = (path) => ({ path, w, h, hotx: hx, hoty: hy, factor: 1 });
  if (!(w > 0 && h > 0)) return keep('native');
  if (side > CURSOR_SERVER_OVER) return keep('server');
  const s = num(scale) > 0 ? num(scale) : 1;
  if (Math.abs(s - 1) < 0.01) return keep('native'); // a picture at its own size: the pointer as the machine drew it
  const target = Math.min(CURSOR_MAX, Math.max(Math.min(CURSOR_MIN, side), side * s));
  const factor = target / side;
  const W = Math.max(1, Math.round(w * factor)), H = Math.max(1, Math.round(h * factor));
  if (W === w && H === h) return keep('native');
  return { path: 'scaled', w: W, h: H, hotx: Math.min(W - 1, Math.round(hx * factor)), hoty: Math.min(H - 1, Math.round(hy * factor)), factor };
}
/** image = {w, h, rgbaPixels} → true when one pixel of it is not fully transparent (no image ⇒ false). */
function pointerShown(image) {
  const px = image && image.rgbaPixels;
  if (!(num(image && image.w) > 0 && num(image && image.h) > 0) || !px || !px.length) return false;
  for (let i = 3; i < px.length; i += 4) if (px[i]) return true;
  return false;
}
/** RGBA w×h → RGBA W×H: each target pixel averages the source pixels whose centres fall in its box (alpha-weighted, so a
 *  transparent edge never darkens the outline); upscaling takes the nearest. → Uint8ClampedArray(W·H·4). */
function scaleRgba(src, w, h, W, H) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor((y * h) / H), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / H));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor((x * w) / W), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / W));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) { const i = (sy * w + sx) * 4, al = src[i + 3]; r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al; n++; }
      const o = (y * W + x) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = a / n;
    }
  }
  return out;
}

/**
 * lane heavy3-flake-races (the desktop-v2-chrome ②③④ / ⑫ flake of rel276, now named): a window maps its displays TWICE —
 * the -308 rects arrive with the first frame (keys = the RFB screen ids), the machine's own table (display-facts, an HTTP
 * read through the agent that starts at `connected`) later or earlier; when both agree the OS ids key the displays. A pick
 * made on the first map (the person pressed 2 while the names were still on their way) named a key the second map does not
 * have — the picture fell back to the whole framebuffer. → the key in `next` of the display `key` named in `prev` (the same
 * rect), else `key` as it was (a key `next` has, a key `prev` never had, no map to carry onto).
 */
function carryPick(prev, next, key) {
  if (key == null || !next || next.state !== 'map' || !Array.isArray(next.displays)) return key;
  if (next.displays.some((d) => d.key === key)) return key;
  const was = prev && Array.isArray(prev.displays) ? prev.displays.find((d) => d.key === key) : null;
  if (!was) return key;
  const at = next.displays.find((d) => sameRect(d.rect, was.rect));
  return at ? at.key : key;
}

/** lane win-desktop-cursor-hdr: the shown display (key) is in Windows HDR — or, with no display picked (全部 / one screen), any
 *  of the machine's screens is. Only a measured `hdr: true` says yes (false / unknown say nothing). */
function hdrShown({ screens = null, map = null, key = null } = {}) {
  const d = key != null && map && Array.isArray(map.displays) ? map.displays.find((x) => x.key === key) : null;
  if (d) return d.hdr === true;
  return osScreens(screens).some((s) => s.hdr === true);
}

module.exports = { FIT_TOL, MAX_SCREENS, IDLE_TRIP_MS, RATE_MIN_BYTES, STATES, ROW_STATES, CURSOR_MIN, CURSOR_MAX, CURSOR_SERVER_OVER, rfbScreens, osScreens, screenMap, rowState, pickerRows, recentChoice, clientMessages, clientCuts, updateTimer, cursorPlan, pointerShown, scaleRgba, hdrShown, carryPick };
