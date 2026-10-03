// THE DESIGN CANVAS — the PURE arithmetic half (lane design-window L2, 2026-10-02; the design:
// docs/design-design-window.md §3.5). Imports ONE module — the hub's PURE src/design-model.js (itself imports nothing;
// the layout and the quote line are ITS rules, never a twin) — and touches no DOM: node-imported by
// scripts/test-design-canvas.mjs, bundled into the client (src/lib/design-canvas.js, src/lib/design-window.js) AND
// into the published page's standalone runtime (src/design-viewer-entry.js → public/design-viewer.js).
//
//   · THE VIEW is `{x, y, z}`: a world point (wx, wy) is drawn at screen (x + wx·z, y + wy·z) inside the canvas
//     viewport (local px — the viewport sits at NET zoom 1, so local px = viewport px). `zoomAt` keeps the world
//     point under an anchor fixed; `fitView` frames a bounds box; `focusView` = one artboard at fit-width.
//   · FRAMES are the artboards placed on the world: `framesOf(manifest, names)` IS the hub's design-model.js
//     `validateManifest` + `layoutOf` (int201: L2's reader-side twin became the import) — a manifest the hub would
//     refuse is laid out WITHOUT it, as the hub's read does — for a reader that has only the manifest (the published
//     page's state block). The window's read already carries the hub's own placement (`frames`), which wins.
//   · THE PICK FENCE: a message from an artboard frame is believed only when its `source` IS one of THIS canvas's
//     frames (`routeMessage`, identity — never an origin string: every frame is an opaque origin), its `kind` is in
//     the CLOSED set `PICK_KINDS`, and every field is bounded (`pickFence`); anything else is dropped. An artboard is
//     agent-written HTML — its own scripts can post too, so the fence bounds what a forged pick can carry, and the
//     quote line the user approves is the hub's own `pickQuote` drawn as text (the hub belts the whole comment line
//     through peer-text).
//   · THE FRAME DOCUMENT: `frameSrcdoc` puts the picker FIRST in the artboard's head (before any of its scripts);
//     `printSrcdoc` adds the print stylesheet (@page from the row's `print`: fixed = one page the artboard's size,
//     flow = paginated) and the print call. Both find their insertion point by `indexOf` in a bounded head window —
//     never a regex over the raw artboard (bound before parse).
import { LIMITS as DM_LIMITS, ENTRY_FILE as DM_ENTRY_FILE, NOTE_COLORS as DM_NOTE_COLORS, isArtboardName as dmIsArtboardName, stemOf as dmStemOf, validateManifest, layoutOf, pickQuote } from '../design-model.js';

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;
export const ZOOM_STEPS = Object.freeze([0.05, 0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4]);
/** Pane margin around a fitted world (room for the artboard name strips above the frames). */
export const FIT_PAD = 40;
/** The focused view's margin. */
export const FOCUS_PAD = 16;
/** The hub's layout constants — read off design-model.js LIMITS (one home for the numbers). */
export const LAYOUT = Object.freeze(Object.fromEntries(['defaultW', 'defaultH', 'gapRow', 'gapRows', 'rowMaxW', 'minSize', 'maxSize', 'coord', 'noteMinW', 'noteMaxW', 'noteText', 'artboards', 'notes', 'pages'].map((k) => [k, DM_LIMITS[k]])));
export const ENTRY_FILE = DM_ENTRY_FILE;
export const NOTE_COLORS = DM_NOTE_COLORS;
/** The eight named note colours as theme tokens (style.css themes; tints by color-mix — never a literal). */
export const NOTE_COLOR_VARS = Object.freeze({
  gray: 'var(--text-dim)', red: 'var(--red, #e55)', orange: 'color-mix(in srgb, var(--red, #e55) 45%, var(--yellow, #e5c07b))',
  green: 'var(--green, #3fb950)', teal: 'var(--cyan)', blue: 'var(--blue, #61afef)', purple: 'var(--magenta)',
  pink: 'color-mix(in srgb, var(--magenta) 55%, var(--red, #e55))',
});
/** THE CLOSED SET of what an artboard frame may say to its canvas. */
export const PICK_KINDS = Object.freeze(['design-pick', 'design-key']);
/** …and of what the canvas says to a frame. */
export const FRAME_KINDS = Object.freeze(['design-mode']);
export const PICK_LIMITS = Object.freeze({ path: 200, text: 120, tag: 32, raw: 4000 });
const TAG_RE = /^[a-z][a-z0-9-]{0,31}$/;
/** Characters that reorder a line or are not drawn (controls, bidi, zero-width, BOM) — a quote line the user reads
 *  before sending must read as it is (the hub's src/peer-text.js belt is the authority on the agent's side). */
const HIDDEN_RE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb]/g;

/** …of those, a control or a line / paragraph separator becomes ONE SPACE and a format character (zero-width, bidi, soft
 *  hyphen, BOM) is REMOVED — src/peer-text.js's rule, so the word a soft hyphen was hidden in stays one word and the quote
 *  the user approves is the line the agent reads (L4 B②: a soft hyphen read as a space, "Ge t sta rted"). */
const SPACE_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** One line of untrusted text: bounded BEFORE any work, hidden characters folded, whitespace collapsed, cut with `…`. */
export function cleanLine(v, max) {
  const s = String(v == null ? '' : v).slice(0, PICK_LIMITS.raw).replace(HIDDEN_RE, (c) => (SPACE_RE.test(c) ? ' ' : '')).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, Math.max(0, max - 1));
  if (/[\ud800-\udbff]$/.test(cut)) cut = cut.slice(0, -1); // never half a surrogate pair
  return cut + '…';
}
export const isArtboardName = dmIsArtboardName;
export const stemOf = dmStemOf;

// ── the view ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export function clampZoom(z) { return isNum(z) && z > 0 ? clamp(z, ZOOM_MIN, ZOOM_MAX) : 1; }

/** The next step of the zoom ladder in `dir` (+1 in, −1 out) from `z` (a z between steps goes to the neighbour). */
export function zoomStep(z, dir) {
  const cur = clampZoom(z);
  if (dir > 0) { for (const s of ZOOM_STEPS) if (s > cur * 1.001) return s; return ZOOM_MAX; }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < cur * 0.999) return ZOOM_STEPS[i];
  return ZOOM_MIN;
}

/** The view at zoom `z` that keeps the world point under `anchor` (viewport px) where it is. */
export function zoomAt(view, z, anchor) {
  const v = normView(view);
  const nz = clampZoom(z);
  const ax = isNum(anchor && anchor.x) ? anchor.x : 0, ay = isNum(anchor && anchor.y) ? anchor.y : 0;
  const wx = (ax - v.x) / v.z, wy = (ay - v.y) / v.z;
  return { x: ax - wx * nz, y: ay - wy * nz, z: nz };
}
export function panBy(view, dx, dy) { const v = normView(view); return { x: v.x + (isNum(dx) ? dx : 0), y: v.y + (isNum(dy) ? dy : 0), z: v.z }; }
export function normView(v) { return { x: isNum(v && v.x) ? v.x : 0, y: isNum(v && v.y) ? v.y : 0, z: clampZoom(v && v.z) }; }
/** Two touches → the next view: zoom by the distance ratio around the midpoint, pan by the midpoint's travel. */
export function pinchView(start, a0, b0, a1, b1) {
  const v = normView(start);
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const ratio = d0 > 1 && d1 > 1 ? d1 / d0 : 1;
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const z = zoomAt(v, v.z * ratio, m0);
  return { x: z.x + (m1.x - m0.x), y: z.y + (m1.y - m0.y), z: z.z };
}
/** A world point → viewport px, and back. */
export const toScreen = (view, p) => { const v = normView(view); return { x: v.x + p.x * v.z, y: v.y + p.y * v.z }; };
export const toWorld = (view, p) => { const v = normView(view); return { x: (p.x - v.x) / v.z, y: (p.y - v.y) / v.z }; };

/** The box around rects ([{x, y, w, h}]) — null when there is none. */
export function boundsOf(rects) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of Array.isArray(rects) ? rects : []) {
    if (!r || !isNum(r.x) || !isNum(r.y) || !isNum(r.w) || !isNum(r.h)) continue;
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The view that shows `bounds` whole and centred in `pane` ({w, h}), never past `maxZ` (a lone small artboard is
 *  shown at its own size, not blown up). An empty world / a pane with no size ⇒ the identity at the pad. */
export function fitView(bounds, pane, { pad = FIT_PAD, maxZ = 1 } = {}) {
  const pw = pane && isNum(pane.w) ? pane.w : 0, ph = pane && isNum(pane.h) ? pane.h : 0;
  if (!bounds || !(bounds.w > 0) || !(bounds.h > 0) || pw <= 0 || ph <= 0) return { x: pad, y: pad, z: 1 };
  const z = clampZoom(Math.min((pw - 2 * pad) / bounds.w, (ph - 2 * pad) / bounds.h, maxZ));
  return { x: (pw - bounds.w * z) / 2 - bounds.x * z, y: (ph - bounds.h * z) / 2 - bounds.y * z, z };
}

/** THE FOCUSED VIEW: one artboard at fit-width (never past 2×), its top at the pad; `frameH` = the height its frame
 *  takes — the artboard's own, or the pane's when the artboard is taller (its document then scrolls inside). */
export function focusView(rect, pane, { pad = FOCUS_PAD, maxZ = 2 } = {}) {
  const pw = pane && isNum(pane.w) ? pane.w : 0, ph = pane && isNum(pane.h) ? pane.h : 0;
  if (!rect || !(rect.w > 0) || !(rect.h > 0) || pw <= 0 || ph <= 0) return { view: { x: pad, y: pad, z: 1 }, frameH: rect && rect.h > 0 ? rect.h : LAYOUT.defaultH };
  const z = clampZoom(Math.min((pw - 2 * pad) / rect.w, maxZ));
  const frameH = Math.max(Math.min(LAYOUT.minSize, rect.h), Math.min(rect.h, Math.floor((ph - 2 * pad) / z)));
  return { view: { x: (pw - rect.w * z) / 2 - rect.x * z, y: pad - rect.y * z, z }, frameH };
}

export const zoomPercent = (z) => `${Math.round(clampZoom(z) * 100)}%`;

// ── pages, frames, notes ─────────────────────────────────────────────────────────────────────────────────────────────

/** The manifest's pages ([{id, name}]), or ONE unnamed page when it lists none. */
export function pagesOf(manifest) {
  const list = isObj(manifest) && Array.isArray(manifest.pages) ? manifest.pages : [];
  const out = [];
  const seen = new Set();
  for (const p of list.slice(0, LAYOUT.pages)) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, name: typeof p.name === 'string' && p.name ? p.name : p.id });
  }
  return out.length ? out : [{ id: '', name: '' }];
}
/** The page a frame / note is drawn on: its own when the manifest lists it, else the first page. */
export function pageOf(item, pages) {
  const ps = Array.isArray(pages) && pages.length ? pages : [{ id: '' }];
  const p = item && item.page;
  return typeof p === 'string' && ps.some((x) => x.id === p) ? p : ps[0].id;
}

const sizeOf = (v, dflt) => (isNum(v) ? clamp(Math.round(v), LAYOUT.minSize, LAYOUT.maxSize) : dflt);
/** Every frame placed — the hub's own rule, imported (design-model.js): the manifest validated exactly as the hub's read
 *  validates it (a refused one is laid out WITHOUT it — never half-applied), then `layoutOf`. `names` = the artboards
 *  the reader holds (null = unknown: nothing is `missing`). → [{file, x, y, w, h, title, page, print, placed, missing,
 *  dup}] in manifest order, then the unlisted ones (Main.html first, then by name); `page` read through pageOf. */
export function framesOf(manifest, names = null) {
  const v = validateManifest(isObj(manifest) ? manifest : {});
  const m = v.ok ? v.manifest : null;
  const pages = pagesOf(m);
  return layoutOf(m, Array.isArray(names) ? names.filter(isArtboardName) : null).frames.map((f) => ({ ...f, page: pageOf(f, pages) }));
}

/** The manifest's notes on `pageId`, bounded (the colour a named one, else gray). */
export function notesOn(manifest, pageId, pages) {
  const list = isObj(manifest) && Array.isArray(manifest.notes) ? manifest.notes.slice(0, LAYOUT.notes) : [];
  const ps = Array.isArray(pages) && pages.length ? pages : pagesOf(manifest);
  const out = [];
  for (const n of list) {
    if (!isObj(n) || !isNum(n.x) || !isNum(n.y) || typeof n.text !== 'string') continue;
    if (pageOf(n, ps) !== pageId) continue;
    out.push({
      id: typeof n.id === 'string' ? n.id.slice(0, 40) : '',
      x: clamp(n.x, -LAYOUT.coord, LAYOUT.coord), y: clamp(n.y, -LAYOUT.coord, LAYOUT.coord),
      w: isNum(n.w) ? clamp(n.w, LAYOUT.noteMinW, LAYOUT.noteMaxW) : 240,
      text: n.text.slice(0, LAYOUT.noteText),
      color: NOTE_COLORS.includes(n.color) ? n.color : 'gray',
    });
  }
  return out;
}

/** The launch the manifest asks for, resolved against what is there: {view:'canvas', page} | {view:'focused', file}. */
export function launchOf(manifest, frames, pages) {
  const l = isObj(manifest) && isObj(manifest.launch) ? manifest.launch : null;
  const ps = Array.isArray(pages) && pages.length ? pages : pagesOf(manifest);
  if (l && l.view === 'focused' && Array.isArray(frames) && frames.some((f) => f.file === l.file)) return { view: 'focused', file: l.file };
  const page = l && l.view === 'canvas' && ps.some((p) => p.id === l.page) ? l.page : ps[0].id;
  return { view: 'canvas', page };
}

// ── what the hub's read says, and what a published page carries ─────────────────────────────────────────────────────

/** A refusal record from a read: {code, why}. */
const refusalOf = (v) => (isObj(v) ? { code: typeof v.code === 'string' ? v.code.slice(0, 40) : 'refused', why: cleanLine(v.why || v.error || '', 300) } : null);

/**
 * GET /api/design?host&dir → the canvas input. The read is the hub's (design-engine `read`): the manifest, the
 * artboards inlined, a verdict per frame, the hub's placement. Tolerant of the contract's spellings — `frames` (the
 * hub's layoutOf) else placed here (`framesOf`); artboards as a list `[{file, html, ok, code, why}]` (or a `verdict`)
 * or a map `files: {name: html}` — and LOUD about a failure: `{error: {code, why, refusals}}` (null / non-JSON = the
 * server never answered: code 'unreachable').
 *   → {title, manifest, frames: [{…frame, html, refused}], warnings, readAt} | {error}
 */
export function normalizeRead(r) {
  if (!isObj(r)) return { error: { code: 'unreachable', why: '', refusals: [] } };
  if (r.error || r.ok === false) {
    const refusals = Array.isArray(r.refusals) ? r.refusals.slice(0, 50).map(refusalOf).filter(Boolean) : [];
    return { error: { code: typeof r.code === 'string' ? r.code.slice(0, 40) : (refusals[0] && refusals[0].code) || 'refused', why: cleanLine(r.error || r.why || (refusals[0] && refusals[0].why) || '', 400), refusals } };
  }
  const manifest = isObj(r.manifest) ? r.manifest : {};
  const html = new Map(), refused = new Map();
  if (Array.isArray(r.artboards)) {
    for (const a of r.artboards) {
      if (!isObj(a) || !isArtboardName(a.file)) continue;
      const v = isObj(a.verdict) ? a.verdict : a;
      if (v.ok === false || typeof a.html !== 'string') refused.set(a.file, refusalOf(v.ok === false ? v : { code: 'empty', why: '' }));
      else html.set(a.file, a.html);
    }
  } else if (isObj(r.files)) {
    for (const [k, v] of Object.entries(r.files)) if (isArtboardName(k) && typeof v === 'string') html.set(k, v);
  }
  if (isObj(r.verdicts)) for (const [k, v] of Object.entries(r.verdicts)) if (isArtboardName(k) && isObj(v) && v.ok === false) { refused.set(k, refusalOf(v)); html.delete(k); }
  const names = [...new Set([...html.keys(), ...refused.keys()])];
  const frames = (Array.isArray(r.frames) && r.frames.length ? hubFrames(r.frames, manifest) : framesOf(manifest, names)).map((f) => ({
    ...f,
    html: html.has(f.file) ? html.get(f.file) : null,
    refused: refused.get(f.file) || (html.has(f.file) ? null : { code: f.missing ? 'missing' : 'empty', why: '' }),
  }));
  return {
    title: cleanLine(r.title || manifest.title || '', 120), manifest, frames,
    warnings: Array.isArray(r.warnings) ? r.warnings.slice(0, 50).map(refusalOf).filter(Boolean) : [],
    readAt: isNum(r.readAt) ? r.readAt : null,
  };
}
/** The hub's own placement, bounded like everything else read off the wire. */
function hubFrames(list, manifest) {
  const pages = pagesOf(manifest);
  return list.filter((f) => isObj(f) && isArtboardName(f.file) && isNum(f.x) && isNum(f.y)).slice(0, LAYOUT.artboards).map((f) => ({
    file: f.file, x: clamp(f.x, -LAYOUT.coord, LAYOUT.coord), y: clamp(f.y, -LAYOUT.coord, LAYOUT.coord),
    w: sizeOf(f.w, LAYOUT.defaultW), h: sizeOf(f.h, LAYOUT.defaultH),
    title: typeof f.title === 'string' && f.title ? f.title.slice(0, 120) : stemOf(f.file),
    page: pageOf(f, pages), print: f.print === 'flow' ? 'flow' : 'fixed',
    placed: f.placed === 'auto' ? 'auto' : 'manifest', missing: !!f.missing, dup: !!f.dup,
  }));
}

/** A published page's state block (`{v:1, title, manifest, files}`, design-model.js bundleCanvas) → the canvas input,
 *  or {error} for a block that is not one. */
export function normalizeDoc(doc) {
  if (!isObj(doc) || doc.v !== 1 || !isObj(doc.files)) return { error: { code: 'bad_doc', why: 'this page carries no VibeSpace design', refusals: [] } };
  return normalizeRead({ title: doc.title, manifest: isObj(doc.manifest) ? doc.manifest : {}, files: doc.files });
}

// ── the pick channel ─────────────────────────────────────────────────────────────────────────────────────────────────

/** A message from a frame → the bounded record, or null (a kind outside the closed set, a malformed field). The frame
 *  record (`{file, w, h}`) names the artboard — never the message (a frame cannot claim to be another). */
export function pickFence(data, frame) {
  if (!isObj(data) || !PICK_KINDS.includes(data.kind) || !frame || !isArtboardName(frame.file)) return null;
  if (data.kind === 'design-key') return data.key === 'Escape' ? { kind: 'design-key', file: frame.file, key: 'Escape' } : null;
  const tag = typeof data.tag === 'string' ? data.tag.slice(0, 64).toLowerCase() : '';
  if (!TAG_RE.test(tag)) return null;
  const fw = isNum(frame.w) && frame.w > 0 ? frame.w : LAYOUT.maxSize, fh = isNum(frame.h) && frame.h > 0 ? frame.h : LAYOUT.maxSize;
  const r = isObj(data.rect) ? data.rect : {};
  const rx = isNum(r.x) ? clamp(r.x, 0, fw) : 0, ry = isNum(r.y) ? clamp(r.y, 0, fh) : 0;
  const rect = { x: rx, y: ry, w: isNum(r.w) ? clamp(r.w, 0, fw - rx) : 0, h: isNum(r.h) ? clamp(r.h, 0, fh - ry) : 0 };
  return { kind: 'design-pick', file: frame.file, path: cleanLine(data.path, PICK_LIMITS.path), tag, text: cleanLine(data.text, PICK_LIMITS.text), rect };
}

/** THE FRAME-KEY GATE: an artboard frame may say `design-key` at most KEY_RATE.max times in KEY_RATE.windowMs; past that
 *  it is MUTED for KEY_RATE.muteMs. An artboard's own script can post the closed set too, and a flood of Escapes would
 *  end Comment mode the instant the user starts it (L4 B①: 200 Escapes from a hostile artboard). `gate` = the frame's
 *  record {times, mutedUntil} (null at first); → {allow, muted, gate}. PURE: the clock is a parameter. */
export const KEY_RATE = Object.freeze({ max: 3, windowMs: 2000, muteMs: 10000 });
export function frameKeyGate(gate, now) {
  const g = isObj(gate) ? gate : { times: [], mutedUntil: 0 };
  const t = isNum(now) ? now : 0;
  if (t < (isNum(g.mutedUntil) ? g.mutedUntil : 0)) return { allow: false, muted: true, gate: g };
  const times = (Array.isArray(g.times) ? g.times : []).filter((x) => isNum(x) && x <= t && t - x < KEY_RATE.windowMs);
  times.push(t);
  if (times.length > KEY_RATE.max) return { allow: false, muted: true, gate: { times: [], mutedUntil: t + KEY_RATE.muteMs } };
  return { allow: true, muted: false, gate: { times, mutedUntil: 0 } };
}

/** THE SOURCE CHECK: a `message` event is a canvas message only when its source IS the window of one of `frames`
 *  ([{win, file, w, h}]) — by identity. → {frame, msg} | null. */
export function routeMessage(ev, frames) {
  const src = ev && ev.source;
  if (!src) return null;
  const frame = (Array.isArray(frames) ? frames : []).find((f) => f && f.win && f.win === src);
  if (!frame) return null;
  const msg = pickFence(ev.data, frame);
  return msg ? { frame, msg } : null;
}

/** The quote line the composer shows (read-only) = the hub's design-model.js `pickQuote` over the same facts — the line
 *  the agent receives is spelled by the same function (`Main.html › header > nav > a.cta ("Get started")`). The text is
 *  folded first (hidden characters, one line, bounded): what the user reads before sending reads as it is. */
export function quoteLine(pick) {
  const p = isObj(pick) ? pick : {};
  return pickQuote({ file: p.file, path: p.path, tag: p.tag, text: cleanLine(p.text, PICK_LIMITS.text) });
}

// ── the frame documents ──────────────────────────────────────────────────────────────────────────────────────────────

const HEAD_WINDOW = 64 * 1024;
/** Index just past the first `<tag …>` open tag (case-insensitive, a tag-name boundary), searched only in the
 *  document's head window — linear, never a regex over the whole artboard. -1 when absent. */
function afterOpenTag(lower, tag) {
  const needle = '<' + tag;
  let i = lower.indexOf(needle);
  while (i >= 0) {
    const c = lower.charCodeAt(i + needle.length);
    if (c === 62 || c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 47) { // > space tab lf cr ff /
      const end = lower.indexOf('>', i + needle.length);
      return end < 0 ? -1 : end + 1;
    }
    i = lower.indexOf(needle, i + needle.length);
  }
  return -1;
}
/** Where an injected head element goes: after `<head>`, else after `<html>`, else after the doctype, else 0. */
export function headInsertAt(html) {
  const s = String(html == null ? '' : html);
  const lower = s.slice(0, HEAD_WINDOW).toLowerCase();
  for (const tag of ['head', 'html', '!doctype']) { const at = afterOpenTag(lower, tag); if (at >= 0) return at; }
  return 0;
}
/** Where an injected head-END element goes (after the artboard's own styles, so its @page rule loses): before
 *  `</head>` when the head window holds it, else after the head's open tag. */
function headEndAt(html) {
  const s = String(html == null ? '' : html);
  const lower = s.slice(0, HEAD_WINDOW).toLowerCase();
  const i = lower.indexOf('</head');
  return i >= 0 ? i : headInsertAt(s);
}
/** A script element's text: `</script` and `<!--` can never end or comment it out. */
const scriptText = (src) => String(src || '').replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** An artboard's frame document: the picker FIRST in its head (before any of the artboard's own scripts). */
export function frameSrcdoc(html, pickerSrc = '') {
  const s = String(html == null ? '' : html);
  if (!pickerSrc) return s;
  const at = headInsertAt(s);
  return s.slice(0, at) + `<script>${scriptText(pickerSrc)}</script>` + s.slice(at);
}

/** The print stylesheet of an artboard row: fixed = ONE page the artboard's size; flow = the document paginated. */
export function printCss(frame) {
  const w = sizeOf(frame && frame.w, LAYOUT.defaultW), h = sizeOf(frame && frame.h, LAYOUT.defaultH);
  const keep = '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}';
  return frame && frame.print === 'flow'
    ? `@page{margin:12mm}${keep}`
    : `@page{size:${w}px ${h}px;margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden}${keep}`;
}
/** The print document: the artboard + its print stylesheet (at the head's END) + the call that opens the print dialog
 *  once it has loaded. Rendered in a frame sandboxed `allow-scripts allow-modals` (print() needs allow-modals). */
export function printSrcdoc(html, frame) {
  const s = String(html == null ? '' : html);
  const at = headEndAt(s);
  return s.slice(0, at) + `<style media="print">${printCss(frame).replace(/</g, '')}</style><script>addEventListener('load',function(){setTimeout(function(){print()},60)})</script>` + s.slice(at);
}
