// The Word document viewer — the DOM half (lane docx-viewer, 2026-09-27).
// Every decision is a PURE rule in ./docx-viewer-model.js (gate:
// scripts/test-docx-viewer-model.mjs); the chrome gate is
// scripts/test-docx-viewer.mjs over scripts/fixtures/docx/.
//
// What this module owns, and why each piece exists (all measured, see the kb):
//  • THE DOCUMENT LIVES IN A SHADOW ROOT. docx-preview writes the document's
//    own styles as CSS text (style ids, font names, numbering text unescaped):
//    in the light DOM a crafted .docx restyled the whole workspace, and the
//    app's own reset (`* { padding: 0 }`, `.file-viewer img { display: block }`)
//    distorted the document. The shadow root isolates both directions.
//  • PAPER. The library's grey wrapper (`background: gray; padding: 30px`,
//    centred with UNSAFE flex centring) painted a band narrower than the page
//    and clipped the page's left edge out of reach whenever the pane was
//    narrower than the page (the owner's report). Pages now sit on the theme's
//    workspace colour, white paper, a theme shadow, centred by a sizer whose
//    width is the scaled page — horizontal scroll only when it is wider.
//  • ZOOM is a transform of the page stack (text stays selectable, no relayout
//    of 80 pages per step) with a sizer carrying the scaled size for scrolling.
//  • LINKS: web/mail open in a new tab; #bookmarks scroll; every other scheme
//    (javascript:, data:, …) is removed. altChunk HTML parts — the library puts
//    them in a SAME-ORIGIN iframe with scripts on — are re-hosted in a
//    `sandbox=""` iframe with a no-network CSP.
//  • EMBEDDED FONTS are registered on document.fonts (Chrome ignores
//    @font-face inside a shadow root — measured on 153) and removed on close.
//  • HEADER/FOOTER INHERITANCE (Word's "Link to Previous") and STYLE TAB
//    STOPS applied before render — the library reads only a section's own
//    references, and a paragraph's stops before it copies its style's.
//  • WORD'S BULLETS are Symbol/Wingdings private-use code points (U+F0B7):
//    mapped to their Unicode glyphs, or a browser without those fonts draws none.
//  • TAB STOPS (`experimental`) are measured by the library 500 ms after
//    render from getBoundingClientRect, which includes the body's UI-scale zoom
//    and our transform: the stack is held at NET scale 1 (hidden) until that
//    pass has run, then shown at the chosen zoom.
import { parseAsync, renderDocument } from 'docx-preview';
import { t } from './i18n.js';
import { uiScale } from './utils.js';
import { UI_ICONS } from './icons.js';
import {
  fitWidthScale, zoomStep, wheelScale, pageIndexAt, sniffVerdict, refusalText,
  linkVerdict, inheritHeaderFooterRefs, styleTabsResolver, symbolBullet, parseZoomPref, serializeZoomPref, toolbarModel,
  ZOOM_PREF_KEY, FIT_PAD,
} from './docx-viewer-model.js';

/** The docx-preview options, chosen on the fixtures (kb-features §DOCX):
 *  breakPages + ignoreLastRenderedPageBreak:true keep a new-page section break
 *  a new page (false merged the title page into page 2); experimental = real
 *  tab stops (a running head's page number at the right margin, not one em
 *  space after the title); ignoreFonts = the library's @font-face would be
 *  ignored in the shadow root — this module registers embedded fonts itself. */
export const DOCX_RENDER_OPTIONS = Object.freeze({
  className: 'docx', inWrapper: true, hideWrapperOnPrint: false,
  ignoreWidth: false, ignoreHeight: false, ignoreFonts: true,
  breakPages: true, ignoreLastRenderedPageBreak: true, experimental: true,
  trimXmlDeclaration: true, useBase64URL: false, renderChanges: false,
  renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
  renderComments: false, renderAltChunks: true, debug: false,
});

/** Inside the shadow root, AFTER the library's styles (a tie goes to us).
 *  Theme vars inherit through the host: --paper (white in every theme — a
 *  page is paper), --shadow-window. The document's own colours (`.docx {
 *  color: black }` = Word's automatic colour, run colours, a page colour set
 *  inline from w:background) are never overridden. */
const PAPER_CSS = `
:host { display: block; }
.docx-wrapper { background: transparent; padding: 0; position: relative; display: flex; flex-flow: column; align-items: center; }
.docx-wrapper > section.docx { background: var(--paper); box-shadow: var(--shadow-window); margin: 0 0 16px; flex: none; }
.docx-wrapper > section.docx:last-child { margin-bottom: 0; }
.docx-wrapper, .docx-wrapper * { -webkit-user-select: text; user-select: text; }
.docx-wrapper a[href] { cursor: pointer; }
.docx-wrapper a.docx-link-blocked { cursor: not-allowed; }
.docx-altchunk { display: block; width: 100%; min-height: 160px; border: 1px dashed var(--border); background: var(--paper); }
`;

const ALTCHUNK_CSP = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:">';

const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Resolve once the browser has painted what is on screen now (the
 *  "Rendering…" line before the parse holds the thread); a hidden tab has no
 *  frames, so a timer bounds the wait. */
const nextPaint = () => Promise.race([
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  sleep(120),
]);
/** Resolve once `node` has a width (a window born in a background tab /
 *  a hidden desktop renders when it is shown — the tab-stop pass and fit
 *  width both measure the pane). */
function laidOut(node, signal) {
  if (node.clientWidth > 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const ro = new ResizeObserver(() => { if (node.clientWidth > 0) { ro.disconnect(); resolve(true); } });
    ro.observe(node);
    signal?.addEventListener('abort', () => { ro.disconnect(); resolve(false); }, { once: true });
  });
}
function readPref() {
  try { return parseZoomPref(localStorage.getItem(ZOOM_PREF_KEY)); } catch { return parseZoomPref(null); }
}
function writePref(mode, scale) {
  try { localStorage.setItem(ZOOM_PREF_KEY, serializeZoomPref(mode, scale)); } catch { }
}

/** Show a named refusal / reason in the pane (the viewer's `.empty-hint` path). */
export function showDocxRefusal(container, text) {
  const hint = el('div', 'empty-hint docx-refusal');
  hint.textContent = text;
  container.appendChild(hint);
  return hint;
}

/** Word's "Link to Previous" before render (the PURE rule decides). */
export function applyHeaderInheritance(doc) {
  const body = doc?.documentPart?.body;
  if (!body) return 0;
  const secs = (body.children || []).filter((c) => c && c.type === 'paragraph' && c.sectionProps).map((c) => c.sectionProps);
  if (body.props) secs.push(body.props);
  const inherited = inheritHeaderFooterRefs(secs);
  let added = 0;
  secs.forEach((s, i) => {
    added += inherited[i].headerRefs.length - (s.headerRefs?.length || 0);
    s.headerRefs = inherited[i].headerRefs;
    s.footerRefs = inherited[i].footerRefs;
  });
  return added;
}

/** Style-defined tab stops onto every paragraph that has none of its own —
 *  body, headers, footers, notes (the PURE resolver decides). Returns how many
 *  paragraphs got their style's stops. */
export function applyStyleTabs(doc) {
  const resolve = styleTabsResolver(doc?.stylesPart?.styles);
  let n = 0;
  const stack = [];
  for (const part of doc?.parts || []) {
    if (part?.body) stack.push(part.body);
    if (part?.rootElement) stack.push(part.rootElement);
    for (const note of part?.notes || []) stack.push(note);
  }
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'paragraph' && !(Array.isArray(node.tabs) && node.tabs.length) && node.styleName) {
      const tabs = resolve(node.styleName);
      if (tabs) { node.tabs = tabs; n++; }
    }
    if (Array.isArray(node.children)) for (const c of node.children) stack.push(c);
  }
  return n;
}

/** Symbol / Wingdings private-use bullets → their Unicode glyphs (PURE rule). */
export function applySymbolBullets(doc) {
  let n = 0;
  for (const num of doc?.numberingPart?.domNumberings || []) {
    if (!num || typeof num.levelText !== 'string') continue;
    const mapped = symbolBullet(num.levelText, num.rStyle?.['font-family']);
    if (mapped !== num.levelText) { num.levelText = mapped; n++; }
  }
  return n;
}

/** The library renders an altChunk (an embedded HTML part) as a same-origin
 *  iframe with scripts ON. Intercept the load: the library gets '' and the
 *  real HTML is re-hosted in a sandboxed iframe after render. */
function interceptAltChunks(doc) {
  const stash = [];
  if (typeof doc?.loadAltChunk === 'function') {
    const orig = doc.loadAltChunk.bind(doc);
    doc.loadAltChunk = (id, part) => { stash.push(Promise.resolve().then(() => orig(id, part)).catch(() => '')); return Promise.resolve(''); };
  }
  return stash;
}
async function rehostAltChunks(root, stash) {
  const frames = [...root.querySelectorAll('iframe')];
  for (let i = 0; i < frames.length; i++) {
    const html = i < stash.length ? String(await stash[i] || '') : '';
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', ''); // no scripts, an opaque origin, no navigation
    f.className = 'docx-altchunk';
    f.title = t('Embedded HTML content');
    f.srcdoc = ALTCHUNK_CSP + html;
    frames[i].replaceWith(f);
  }
  return frames.length;
}

/** Every <a> the document rendered, judged by the PURE linkVerdict. */
export function neutraliseLinks(root) {
  let blocked = 0;
  for (const a of root.querySelectorAll('a')) {
    const v = linkVerdict(a.getAttribute('href'));
    if (v.kind === 'external') {
      a.setAttribute('href', v.href);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = v.href;
    } else if (v.kind === 'anchor') {
      a.dataset.docxAnchor = v.name;
    } else if (v.kind === 'blocked') {
      a.removeAttribute('href');
      a.classList.add('docx-link-blocked');
      a.title = t('Link not opened: {scheme} links are blocked in documents', { scheme: v.scheme });
      blocked++;
    } else a.removeAttribute('href');
  }
  return blocked;
}

async function registerEmbeddedFonts(doc, signal) {
  const faces = [];
  for (const f of doc?.fontTablePart?.fonts || []) {
    for (const ref of f.embedFontRefs || []) {
      if (signal?.aborted) break;
      try {
        const url = await doc.loadFont(ref.id, ref.key);
        if (!url) continue;
        const face = new FontFace(String(f.name), `url(${url})`, {
          weight: /bold/i.test(ref.type) ? 'bold' : 'normal',
          style: /italic/i.test(ref.type) ? 'italic' : 'normal',
        });
        await face.load();
        document.fonts.add(face);
        faces.push({ face, url });
      } catch { /* a font that will not load falls back to the family's next name */ }
    }
  }
  signal?.addEventListener('abort', () => {
    for (const { face, url } of faces) { try { document.fonts.delete(face); } catch { } try { URL.revokeObjectURL(url); } catch { } }
  }, { once: true });
  return faces.length;
}

/**
 * Render a Word document with its toolbar into `container`.
 * Throws on a fetch/parse failure (renderInto shows the reason in the pane);
 * a file that is not a renderable Word document gets a NAMED refusal instead.
 */
export async function renderDocxViewer(container, rawUrl, { signal } = {}) {
  try {
    return await renderDocxViewerInner(container, rawUrl, signal);
  } catch (e) {
    if (signal?.aborted) return null; // a closed window / a newer preview — never paint over it
    throw e;
  }
}

async function renderDocxViewerInner(container, rawUrl, signal) {
  const root = el('div', 'docx-viewer');
  const bar = el('div', 'media-toolbar docx-toolbar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('Document'));
  const scroll = el('div', 'docx-scroll');
  const status = el('div', 'empty-hint docx-status');
  status.textContent = t('Rendering…');
  const sizer = el('div', 'docx-sizer');
  const host = el('div', 'docx-host docx-pending');
  sizer.appendChild(host);
  scroll.append(status, sizer);
  root.append(bar, scroll);
  container.appendChild(root);
  const shadow = host.attachShadow({ mode: 'open' });
  const styleBox = el('div'), bodyBox = el('div');
  const paper = document.createElement('style');
  paper.textContent = PAPER_CSS;
  shadow.append(styleBox, bodyBox, paper);

  const pref = readPref();
  const state = { mode: pref.mode, scale: pref.scale ?? 1, page: 0, pages: 0, rendering: true, W: 0, H: 0, tops: [] };

  // ── toolbar: built once, patched in place ──
  const items = new Map();
  const act = (id) => {
    if (state.rendering) return;
    if (id === 'fit') setMode('fit');
    else if (id === 'actual') setScale(1);
    else if (id === 'out') setScale(zoomStep(state.scale, -1));
    else if (id === 'in') setScale(zoomStep(state.scale, +1));
  };
  const drawBar = () => {
    for (const it of toolbarModel(state, t)) {
      let node = items.get(it.id);
      if (!node) {
        if (it.kind === 'button') {
          node = el('button', 'file-tool-btn media-btn docx-tool-' + it.id);
          node.type = 'button';
          if (it.icon) node.innerHTML = UI_ICONS[it.icon] || '';
          node.addEventListener('click', () => act(it.id), signal ? { signal } : undefined);
        } else if (it.kind === 'spacer') node = el('span', 'docx-spacer');
        else node = el('span', it.id === 'zoom' ? 'media-zoom-label docx-zoom' : 'docx-pages');
        items.set(it.id, node);
        bar.appendChild(node);
      }
      if (it.kind === 'button') {
        if (!it.icon && node.textContent !== it.label) node.textContent = it.label;
        node.title = it.title;
        node.setAttribute('aria-label', it.title);
        node.disabled = !!it.disabled || state.rendering;
        node.classList.toggle('active', !!it.pressed);
        node.setAttribute('aria-pressed', it.pressed ? 'true' : 'false');
      } else if (it.kind === 'label') {
        if (node.textContent !== it.text) node.textContent = it.text;
        if (it.title !== undefined) node.title = it.title;
      }
    }
  };
  drawBar();

  // ── geometry ──
  const measure = () => {
    state.W = host.offsetWidth;
    state.H = host.offsetHeight;
    const pages = [...shadow.querySelectorAll('.docx-wrapper > section.docx')];
    state.pages = pages.length;
    state.tops = pages.map((p) => sizer.offsetTop + p.offsetTop * state.scale);
  };
  const applyScale = (scale, anchor = null) => {
    const old = state.scale;
    const ax = anchor ? anchor.x : 0, ay = anchor ? anchor.y : 0;
    const cx = (scroll.scrollLeft + ax - sizer.offsetLeft) / old;
    const cy = (scroll.scrollTop + ay - sizer.offsetTop) / old;
    state.scale = scale;
    host.style.transform = `scale(${scale})`;
    sizer.style.width = Math.ceil(state.W * scale) + 'px';
    sizer.style.height = Math.ceil(state.H * scale) + 'px';
    if (!state.rendering && old !== scale) {
      scroll.scrollLeft = Math.max(0, cx * scale + sizer.offsetLeft - ax);
      scroll.scrollTop = Math.max(0, cy * scale + sizer.offsetTop - ay);
    }
    measure();
    updatePage();
    drawBar();
  };
  const fitScale = () => fitWidthScale(scroll.clientWidth, state.W, { pad: FIT_PAD });
  const setMode = (mode) => {
    state.mode = mode;
    writePref(mode, state.scale);
    if (mode === 'fit') applyScale(fitScale());
    else drawBar();
  };
  const setScale = (scale, anchor = null) => {
    state.mode = 'scale';
    applyScale(scale, anchor || { x: scroll.clientWidth / 2, y: 0 });
    writePref('scale', state.scale);
  };
  const updatePage = () => {
    const idx = pageIndexAt(scroll.scrollTop, state.tops, { viewportH: scroll.clientHeight, scrollH: scroll.scrollHeight });
    const page = idx + 1;
    if (page !== state.page) { state.page = page; drawBar(); }
  };

  // ── load ──
  await nextPaint();
  if (signal?.aborted) return null;
  const res = await fetch(rawUrl, signal ? { signal } : undefined);
  if (!res.ok) {
    let msg = res.statusText || String(res.status);
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { }
    throw new Error(msg);
  }
  const buf = await res.arrayBuffer();
  if (signal?.aborted) return null;
  const kind = sniffVerdict(new Uint8Array(buf, 0, Math.min(8, buf.byteLength)));
  if (kind !== 'zip') {
    root.remove();
    showDocxRefusal(container, refusalText(kind, t));
    return { refused: kind };
  }
  await laidOut(scroll, signal);
  if (signal?.aborted) return null;

  performance.mark('docx-parse-start');
  const doc = await parseAsync(buf, DOCX_RENDER_OPTIONS);
  performance.mark('docx-parse-end');
  if (signal?.aborted) return null;
  applyHeaderInheritance(doc);
  applyStyleTabs(doc);
  applySymbolBullets(doc);
  const stash = interceptAltChunks(doc);
  await registerEmbeddedFonts(doc, signal);
  if (signal?.aborted) return null;

  // hold the stack at NET scale 1 (under the body's UI zoom) for the
  // library's tab-stop pass, which measures with getBoundingClientRect
  const z = uiScale() || 1;
  host.style.transform = `scale(${1 / z})`;
  performance.mark('docx-render-start');
  await renderDocument(doc, bodyBox, styleBox, DOCX_RENDER_OPTIONS);
  performance.mark('docx-render-end');
  const hasTabs = !!shadow.querySelector('.docx-tab-stop');
  // the library's pass is a setTimeout(…, 500) queued at the end of render;
  // a timer queued after it with the same delay runs after it
  const tabsDone = hasTabs ? sleep(500) : Promise.resolve();
  try {
    // the LATEST open's numbers only (user timing entries are never evicted)
    performance.clearMeasures('docx-parse'); performance.clearMeasures('docx-render');
    performance.measure('docx-parse', 'docx-parse-start', 'docx-parse-end');
    performance.measure('docx-render', 'docx-render-start', 'docx-render-end');
    for (const n of ['docx-parse-start', 'docx-parse-end', 'docx-render-start', 'docx-render-end']) performance.clearMarks(n);
  } catch { }
  if (signal?.aborted) return null;
  neutraliseLinks(shadow);
  await rehostAltChunks(shadow, stash);
  await tabsDone;
  if (signal?.aborted) return null;

  // ── show ──
  state.rendering = false;
  status.remove();
  state.scale = 1; // measure unscaled
  host.style.transform = '';
  state.W = host.offsetWidth;
  state.H = host.offsetHeight;
  host.classList.remove('docx-pending');
  applyScale(state.mode === 'fit' ? fitScale() : (pref.scale ?? 1));
  scroll.scrollTop = 0;
  // pages are centred in the widest page's width: a remembered zoom wider than
  // the pane opens centred on them, never on the empty left of a narrow page
  scroll.scrollLeft = Math.max(0, (scroll.scrollWidth - scroll.clientWidth) / 2);
  updatePage();

  // ── live behaviour (all bound to the render's signal) ──
  const opt = signal ? { signal } : undefined;
  let raf = 0;
  scroll.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; updatePage(); });
  }, opt);
  scroll.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = scroll.getBoundingClientRect();
    const zz = uiScale() || 1;
    setScale(wheelScale(state.scale, e.deltaY), { x: (e.clientX - r.left) / zz, y: (e.clientY - r.top) / zz });
  }, signal ? { signal, passive: false } : { passive: false });
  shadow.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a');
    if (!a) return;
    const name = a.dataset.docxAnchor;
    if (name) {
      e.preventDefault();
      const dest = shadow.getElementById(name) || shadow.querySelector(`[name="${CSS.escape(name)}"]`);
      if (dest) {
        const top = sizer.offsetTop + (dest.getBoundingClientRect().top - host.getBoundingClientRect().top) / (uiScale() || 1);
        scroll.scrollTop = Math.max(0, top - 16);
      }
    } else if (!a.hasAttribute('href')) e.preventDefault();
  }, opt);
  const roPane = new ResizeObserver(() => { if (state.mode === 'fit') applyScale(fitScale()); });
  roPane.observe(scroll);
  const roHost = new ResizeObserver(() => {
    const w = host.offsetWidth, h = host.offsetHeight;
    if (w === state.W && h === state.H) return;
    state.W = w; state.H = h;
    applyScale(state.mode === 'fit' ? fitScale() : state.scale);
  });
  roHost.observe(host);
  signal?.addEventListener('abort', () => {
    roPane.disconnect(); roHost.disconnect();
    for (const img of shadow.querySelectorAll('img[src^="blob:"]')) { try { URL.revokeObjectURL(img.src); } catch { } }
    for (const m of (styleBox.textContent || '').matchAll(/url\((blob:[^)\s]+)\)/g)) { try { URL.revokeObjectURL(m[1]); } catch { } } // picture bullets
  }, { once: true });

  const m = performance.getEntriesByName('docx-render').pop();
  return { pages: state.pages, renderMs: m ? Math.round(m.duration) : null };
}

