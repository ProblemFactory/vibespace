'use strict';
/**
 * ONE WINDOW OF A PAIRED MACHINE AS THE STREAM'S PICTURE — the window source's PURE shape (imports nothing; design q-041
 * r3 §1/§3 P2w + P3m — what "share a window" does in a meeting app: one application window of the machine becomes one
 * VibeSpace window). The Windows source (src/agentd/stream-window-source.js — Windows.Graphics.Capture through the
 * vibespace-wgc helper) and the Mac source (ScreenCaptureKit) speak THIS shape, the hub judges with it, the page sizes and
 * maps with it — so the three cannot disagree:
 *
 *   windowSourceOf(row)        one row of a machine's window facts → { kind: 'window', id, title, app, bounds: {x, y, w, h},
 *                              display, dpi, minimized } | null. `bounds` = the captured rectangle on the machine's desktop
 *                              in PHYSICAL pixels (Windows: DWMWA_EXTENDED_FRAME_BOUNDS — the WGC frame, title bar included,
 *                              for a DPI-unaware window too); `dpi` = 96 per 100 % (Windows 175 % = 168, a 2× Mac = 192)
 *   windowSourceVerdict(o)     may THIS agent stream one window: the `stream-window` capability (an older agent is never
 *                              asked: agent_too_old) on a platform with a window source (WINDOW_PLATFORMS) and a window id
 *                              → { take, source: 'window', sourceId, code, why }
 *   windowPickRows(rows)       the picker's rows: an application's own top-level windows only — visible, not cloaked (another
 *                              virtual desktop, a suspended UWP frame), not a tool window, no owner, a frame no smaller than
 *                              WINDOW_MIN_SIDE (a minimized one is kept and says so), capturable (the probe: every refusal
 *                              is the same E_INVALIDARG, so the list decides BEFORE asking) — z-order kept (the newest first)
 *   WINDOW_HELD + windowHeldVerdict   the source keeps running while its window shows nothing new, and says why by name:
 *                              `window_minimized` (frames stop with no error — WGC and SCK alike — no fresh frame for
 *                              WINDOW_GAP_MS while the window is minimized), `window_covered_idle` (a covered Chromium /
 *                              Electron window stops painting — its own occlusion tracking — no fresh frame for WINDOW_IDLE_MS)
 *   WINDOW_ENDS                the source's ends by name (the session's `ended`)
 *   windowInputOf(ev, bounds)  a pointer event in WINDOW pixels (the page maps the <video> to the frame; the window's place is
 *                              the daemon's — it moves while streamed) → the machine's desktop: the window's origin added, the
 *                              point held inside the window (a press never lands beside it); keys pass unchanged
 *   windowViewSize(src, room)  the size a VibeSpace window shows it at: the window's own size on its machine (physical ÷
 *                              dpi/96), shrunk into the room with its aspect kept, never grown
 */

const WINDOW_KIND = 'window';
const WINDOW_CAPABILITY = 'stream-window';
/** The platforms whose agent has a window source (Windows: WGC; a Mac: lane stream-p3m-build's SCK helper — int304). */
const WINDOW_PLATFORMS = Object.freeze(['win32', 'darwin']);
const WINDOW_MIN_SIDE = 64;
const WINDOW_GAP_MS = 1000;
const WINDOW_IDLE_MS = 2000;
const TITLE_MAX = 200;
/** Window classes that stop painting when covered (Chromium's native occlusion tracking: Edge, Chrome, Electron apps). */
const CHROMIUM_CLASSES = Object.freeze(['Chrome_WidgetWin_1']);
const WINDOW_HELD = Object.freeze(['window_minimized', 'window_covered_idle']);
const WINDOW_ENDS = Object.freeze(['window_gone', 'helper_missing', 'helper_exited', 'capture_failed', 'encoder_exited']);
const ID_RE = /^[1-9]\d{0,19}$/;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, TITLE_MAX);
/** `C:\…\msedge.exe` → `msedge` (either separator). */
const appOf = (exe) => clean(String(exe || '').split(/[\\/]/).pop().replace(/\.exe$/i, ''));
/** A row's rectangle: `bounds` {x, y, w, h} or the helper's `frame` [left, top, right, bottom]. */
function boundsOf(row) {
  const b = row && row.bounds;
  if (b && typeof b === 'object' && !Array.isArray(b)) {
    const x = num(b.x), y = num(b.y), w = num(b.w), h = num(b.h);
    return x == null || y == null || !(w > 0) || !(h > 0) ? null : { x, y, w, h };
  }
  const f = row && row.frame;
  if (!Array.isArray(f) || f.length !== 4) return null;
  const [l, t, r, bt] = f.map(num);
  return l == null || t == null || !(r > l) || !(bt > t) ? null : { x: l, y: t, w: r - l, h: bt - t };
}

/** One row of a machine's window facts → the window source's shape, or null (no id, no rectangle). */
function windowSourceOf(row) {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id != null ? row.id : row.hwnd != null ? row.hwnd : '');
  const bounds = boundsOf(row);
  if (!ID_RE.test(id) || !bounds) return null;
  const dpi = num(row.dpi);
  return { kind: WINDOW_KIND, id, title: clean(row.title), app: clean(row.app) || appOf(row.exe), bounds, display: row.display == null ? null : clean(row.display).slice(0, 60), dpi: dpi > 0 ? dpi : 96, minimized: !!(row.minimized || row.min) };
}

/** May this agent stream ONE window? → { take, source, sourceId, code, why } */
function windowSourceVerdict({ capabilities = [], platform = null, window = null, platforms = WINDOW_PLATFORMS } = {}) {
  const id = window == null ? '' : String(window);
  const no = (code, why) => ({ take: false, source: null, sourceId: null, code, why });
  if (!ID_RE.test(id)) return no('bad_window', 'name the machine\'s window by its id (a whole number)');
  if (!(Array.isArray(capabilities) && capabilities.includes(WINDOW_CAPABILITY))) return no('agent_too_old', 'the machine\'s agent cannot stream one window yet — update it');
  if (!platforms.includes(platform)) return no('no_window_source', 'the machine\'s agent cannot capture one window on this system yet');
  return { take: true, source: WINDOW_KIND, sourceId: id, code: null, why: null };
}

/** The picker's rows (see the header) → [{ ...windowSourceOf(row), cls, pid, elevated }] in the order given. */
function windowPickRows(rows, { minSide = WINDOW_MIN_SIDE } = {}) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.visible === false || (num(r.cloaked) || 0) > 0 || r.tool || r.capturable === false) continue;
    if (r.owner != null && String(r.owner) !== '0') continue;
    const s = windowSourceOf(r);
    if (!s || !s.title) continue;
    if (!s.minimized && (s.bounds.w < minSide || s.bounds.h < minSide)) continue;
    out.push({ ...s, cls: clean(r.cls).slice(0, 80) || null, pid: num(r.pid), elevated: r.elevated === true });
  }
  return out;
}

/** Why the window shows nothing new, by name — or null (it is live, or merely static). `freshAgoMs` = since its last NEW
 *  frame; `covered` = no sampled point of the window is its own on the machine's screen; `cls` = its window class. */
function windowHeldVerdict({ minimized = false, covered = false, cls = null, freshAgoMs = 0 } = {}, { gapMs = WINDOW_GAP_MS, idleMs = WINDOW_IDLE_MS } = {}) {
  if (minimized && freshAgoMs >= gapMs) return 'window_minimized';
  if (!minimized && covered && CHROMIUM_CLASSES.includes(cls) && freshAgoMs >= idleMs) return 'window_covered_idle';
  return null;
}

const POINTER = new Set(['mv', 'md', 'mu', 'wh']);
/** A validated input event in window pixels → the machine's desktop (origin added, held inside the window). */
function windowInputOf(ev, bounds) {
  if (!ev || !POINTER.has(ev.t) || !bounds) return ev;
  const w = Math.max(1, Math.floor(bounds.w)), h = Math.max(1, Math.floor(bounds.h));
  const cx = Math.min(w - 1, Math.max(0, Math.trunc(ev.x))), cy = Math.min(h - 1, Math.max(0, Math.trunc(ev.y)));
  return { ...ev, x: Math.trunc(bounds.x) + cx, y: Math.trunc(bounds.y) + cy };
}

/** The VibeSpace window's picture size for a window source: its own size on the machine (physical ÷ dpi/96), shrunk into
 *  `room` {w, h} (CSS px) with its aspect kept, never grown. → { w, h, scale } (scale = CSS px per frame pixel) | null */
function windowViewSize(src, room = {}) {
  const w = num(src && src.w), h = num(src && src.h), dpi = num(src && src.dpi) || 96;
  if (!(w > 0) || !(h > 0)) return null;
  const lw = (w * 96) / dpi, lh = (h * 96) / dpi;
  const fit = Math.min(1, room.w > 0 ? room.w / lw : 1, room.h > 0 ? room.h / lh : 1);
  return { w: Math.max(1, Math.round(lw * fit)), h: Math.max(1, Math.round(lh * fit)), scale: ((96 / dpi) * fit) };
}

module.exports = {
  WINDOW_KIND, WINDOW_CAPABILITY, WINDOW_PLATFORMS, WINDOW_MIN_SIDE, WINDOW_GAP_MS, WINDOW_IDLE_MS, CHROMIUM_CLASSES, WINDOW_HELD, WINDOW_ENDS,
  windowSourceOf, windowSourceVerdict, windowPickRows, windowHeldVerdict, windowInputOf, windowViewSize,
};
