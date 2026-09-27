// PURE (imports nothing) — the Word document viewer's decisions (lane
// docx-viewer, 2026-09-27). The DOM half is src/lib/docx-viewer.js; every rule
// it applies is a function here so scripts/test-docx-viewer-model.mjs can table
// it and a patched copy of any one rule turns the suite red.
//
// Units: a SCALE is a plain factor over the page's own CSS px at 96 dpi (a US
// Letter page = 816 px at scale 1 = "100%"). It lives in the app's coordinate
// space, i.e. under the body's UI-scale zoom like every other surface.

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
/** The −/+ ladder (what a document viewer's buttons step through). */
export const ZOOM_STEPS = Object.freeze([0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]);
/** The pane's padding either side of the page at "fit width" (px). */
export const FIT_PAD = 24;
/** Per-device memory of the zoom ('fit' or a scale), like the other viewer prefs. */
export const ZOOM_PREF_KEY = 'vibespace.docx-zoom';
/** One mouse-wheel notch (deltaY 100) ≈ one ladder step. */
export const WHEEL_DIVISOR = 500;

const EPS = 1e-6;

export function clampScale(s) {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

/** The scale at which the page (`pageW` px at scale 1) fills the pane
 *  (`paneW` px) minus `pad` on each side. A pane or page that has no size yet
 *  (hidden window, nothing rendered) answers 1 — never 0, never NaN. */
export function fitWidthScale(paneW, pageW, { pad = FIT_PAD } = {}) {
  const p = Number(paneW), w = Number(pageW);
  if (!(p > 0) || !(w > 0)) return 1;
  return clampScale((p - 2 * Math.max(0, Number(pad) || 0)) / w);
}

/** The next rung of ZOOM_STEPS from `scale` in `dir` (+1 in, −1 out). A scale
 *  between two rungs (fit width, a wheel zoom) goes to the NEXT rung in that
 *  direction, never the one it is already past. */
export function zoomStep(scale, dir) {
  const s = clampScale(scale);
  if (dir > 0) return ZOOM_STEPS.find((z) => z > s + EPS) ?? ZOOM_MAX;
  if (dir < 0) return [...ZOOM_STEPS].reverse().find((z) => z < s - EPS) ?? ZOOM_MIN;
  return s;
}

/** Ctrl/Cmd + wheel: continuous (a trackpad pinch arrives as many small
 *  deltas, a mouse notch as one ±100) — exponential so in and out are symmetric. */
export function wheelScale(scale, deltaY) {
  const d = Number(deltaY);
  if (!Number.isFinite(d) || d === 0) return clampScale(scale);
  return clampScale(clampScale(scale) * Math.exp(-d / WHEEL_DIVISOR));
}

/** "125%" — the label the toolbar shows for a scale. */
export function zoomLabel(scale) {
  return Math.round(clampScale(scale) * 100) + '%';
}

/** Which page the reader is on: the last page whose top is at or above the
 *  probe line (`scrollTop` + a third of the viewport), and the LAST page once
 *  the pane is scrolled to its end (a short last page never reaches the probe
 *  line). `pageTops` = each page's top in the scroller's content px, ascending.
 *  Returns a 0-based index; -1 when there are no pages. */
export function pageIndexAt(scrollTop, pageTops, { viewportH = 0, scrollH = 0 } = {}) {
  const tops = Array.isArray(pageTops) ? pageTops : [];
  if (!tops.length) return -1;
  const st = Math.max(0, Number(scrollTop) || 0);
  const vh = Math.max(0, Number(viewportH) || 0);
  if (scrollH > 0 && vh > 0 && st + vh >= scrollH - 1) return tops.length - 1;
  const probe = st + vh / 3;
  let lo = 0, hi = tops.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid] <= probe) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** What the viewer does with a file extension, BEFORE any fetch. docx-preview
 *  reads Office Open XML (a zip); a legacy binary .doc is refused by name. */
export function viewerVerdict(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (e === 'docx' || e === 'docm' || e === 'dotx' || e === 'dotm') return { kind: 'render' };
  if (e === 'doc' || e === 'dot') return { kind: 'refuse', code: 'binary-word' };
  return { kind: 'none' };
}

/** What the file's first bytes are, whatever its name says: 'zip' (Office Open
 *  XML), 'ole' (a binary .doc, OR a password-protected .docx — Office stores
 *  those in an OLE container), 'empty', else 'other'. */
export function sniffVerdict(bytes) {
  const b = bytes || [];
  if (!b.length) return 'empty';
  if (b[0] === 0x50 && b[1] === 0x4b) return 'zip';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole';
  return 'other';
}

/** The refusal sentence for a file the viewer will not render — `t` injected
 *  (English-string-as-key). `code` from viewerVerdict / sniffVerdict. */
export function refusalText(code, t = (s) => s) {
  if (code === 'binary-word') return t('Legacy Word files (.doc) cannot be shown here. Open it in Word or LibreOffice and save it as .docx.');
  if (code === 'ole') return t('This Word file is password-protected or in the old binary format, so it cannot be shown here. Save an unprotected .docx copy and open that.');
  if (code === 'empty') return t('This file is empty.');
  return t('This is not a Word document that can be shown here.');
}

/** A document hyperlink's fate. Only web and mail links open (in a new tab,
 *  never navigating VibeSpace away); `#bookmark` links scroll the document;
 *  every other scheme (javascript:, data:, vbscript:, file:, a relative path)
 *  is BLOCKED — the text stays, the link goes. */
export function linkVerdict(href) {
  const h = String(href ?? '').trim();
  if (!h) return { kind: 'none' };
  if (h.startsWith('#')) {
    const name = h.slice(1);
    return name ? { kind: 'anchor', name } : { kind: 'none' };
  }
  // strip what a browser strips before reading the scheme (ASCII whitespace and
  // controls anywhere — `java\tscript:` IS javascript: to a browser)
  const bare = h.replace(/[\u0000- \u007f]/g, '');
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(bare);
  const scheme = m ? m[1].toLowerCase() : '';
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto') return { kind: 'external', href: bare };
  return { kind: 'blocked', scheme: scheme || 'relative' };
}

/** Word's header/footer inheritance: a section that names no header (or
 *  footer) of a type — default / first / even — uses the PREVIOUS section's of
 *  that type ("Link to Previous", the default for every new section). The
 *  renderer only reads a section's own references, so a paper whose body
 *  section follows a title-page section showed no running head at all.
 *  `sections` = each section's properties in document order; returns
 *  [{headerRefs, footerRefs}] with inheritance applied (inputs untouched). */
export function inheritHeaderFooterRefs(sections) {
  const merge = (prev, own) => {
    const byType = new Map(prev.map((r) => [r.type, r]));
    for (const r of Array.isArray(own) ? own : []) if (r && r.type) byType.set(r.type, r);
    return [...byType.values()];
  };
  let h = [], f = [];
  return (Array.isArray(sections) ? sections : []).map((s) => {
    h = merge(h, s && s.headerRefs);
    f = merge(f, s && s.footerRefs);
    return { headerRefs: h, footerRefs: f };
  });
}

/** A paragraph's tab stops come from its own w:tabs, else from its paragraph
 *  STYLE, following basedOn (Word's inheritance). docx-preview reads a
 *  paragraph's stops while rendering its tabs, one line BEFORE it copies the
 *  style's stops onto the paragraph — so every style-defined stop (the Header
 *  style's centre + right-aligned stops an APA running head relies on) was
 *  ignored and the page number sat one default stop after the title.
 *  `styles` = parsed styles [{id, basedOn, paragraphProps: {tabs}}]; returns a
 *  memoised (styleId) → tabs | null. A basedOn cycle ends the walk. */
export function styleTabsResolver(styles) {
  const byId = new Map();
  for (const s of Array.isArray(styles) ? styles : []) if (s && s.id) byId.set(s.id, s);
  const memo = new Map();
  return (styleId) => {
    if (!styleId) return null;
    if (memo.has(styleId)) return memo.get(styleId);
    let found = null;
    const seen = new Set();
    for (let id = styleId; id && !seen.has(id);) {
      seen.add(id);
      const s = byId.get(id);
      if (!s) break;
      const tabs = s.paragraphProps && s.paragraphProps.tabs;
      if (Array.isArray(tabs) && tabs.length) { found = tabs; break; }
      id = s.basedOn;
    }
    memo.set(styleId, found);
    return found;
  };
}

/** Word writes its bullets as PRIVATE-USE code points of the Symbol and
 *  Wingdings fonts (the default bullet is U+F0B7 in Symbol). A browser without
 *  those fonts draws nothing there — measured: every "List Bullet" item of the
 *  fixture had an empty marker. Each is mapped to the Unicode glyph the font
 *  draws; the font decides (U+F0A7 is a club in Symbol, a square in Wingdings).
 *  An unknown font maps only Word's default bullet. */
export const SYMBOL_BULLETS = Object.freeze({
  symbol: Object.freeze({ '\uf0b7': '\u2022' }),
  wingdings: Object.freeze({ '\uf0a7': '\u25aa', '\uf0d8': '\u27a2', '\uf0fc': '\u2713', '\uf076': '\u2756', '\uf06e': '\u25a0', '\uf071': '\u2751', '\uf0b7': '\u2022' }),
});
export function symbolBullet(levelText, font) {
  const text = String(levelText ?? '');
  if (!/[\uf000-\uf0ff]/.test(text)) return text;
  const f = String(font || '').replace(/["']/g, '').trim().toLowerCase();
  const table = f.startsWith('wingdings') ? SYMBOL_BULLETS.wingdings : f === 'symbol' ? SYMBOL_BULLETS.symbol : { '\uf0b7': '\u2022' };
  return text.replace(/[\uf000-\uf0ff]/g, (ch) => table[ch] ?? ch);
}

/** The remembered zoom: 'fit' | a scale. Anything unreadable = fit (the default). */
export function parseZoomPref(raw) {
  const v = String(raw ?? '').trim();
  if (!v || v === 'fit') return { mode: 'fit', scale: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return { mode: 'fit', scale: null };
  return { mode: 'scale', scale: clampScale(n) };
}
export function serializeZoomPref(mode, scale) {
  return mode === 'fit' ? 'fit' : String(Math.round(clampScale(scale) * 1000) / 1000);
}

/** The toolbar as STRUCTURE (the DOM half only draws it). `t` injected.
 *  `icon` names a UI_ICONS entry; an icon-only item carries `title` (its name). */
export function toolbarModel({ mode = 'fit', scale = 1, page = 0, pages = 0, rendering = false } = {}, t = (s) => s) {
  const s = clampScale(scale);
  return [
    { id: 'fit', kind: 'button', label: t('Fit width'), title: t('Fit the page to the window width'), pressed: mode === 'fit' },
    { id: 'actual', kind: 'button', label: '100%', title: t('Actual size (100%)'), pressed: mode !== 'fit' && Math.abs(s - 1) < EPS },
    { id: 'out', kind: 'button', icon: 'zoomOut', title: t('Zoom out'), disabled: s <= ZOOM_MIN + EPS },
    { id: 'zoom', kind: 'label', text: zoomLabel(s) },
    { id: 'in', kind: 'button', icon: 'zoomIn', title: t('Zoom in'), disabled: s >= ZOOM_MAX - EPS },
    { id: 'spacer', kind: 'spacer' },
    // while rendering the pane itself says "Rendering…"; the count appears when done
    { id: 'pages', kind: 'label', text: !rendering && pages > 0 ? `${Math.max(1, page)} / ${pages}` : '', title: !rendering && pages > 0 ? t('Page {n} of {total}', { n: Math.max(1, page), total: pages }) : '' },
  ];
}
