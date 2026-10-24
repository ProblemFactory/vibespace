// THE ONE DOOR THAT DRAWS A DIAGRAM (lane chat-mermaid, 2.369.351 — the owner: 「能不能展示 flowchart？」). A fenced
// ```mermaid block somebody else wrote — an agent's reply, a peer's message, a For-you item, a job panel, a markdown
// file in the editor's preview or the file viewer — becomes a `.chat-diagram` card: the picture, a 「图 | 源码」 toggle
// (the source one click away, and shown BY ITSELF with the failing line marked when the diagram cannot be drawn),
// 「复制」 (the source) and 「放大」 (the picture at full size in a viewer window with zoom and pan).
//   · ONE LIBRARY, THIS ORIGIN: mermaid is its own lazy bundle (src/mermaid-entry.js → public/mermaid.js, built by
//     `npm run build`), imported on the first diagram from the address index.html names — `<link rel="vs-lazy-bundle"
//     href="/mermaid.js">`, which the index route stamps `?v=<mtime>` like bundle.js, so a stale tab never runs an old
//     copy. Every script the app runs is served by this origin; the page's CSP (src/app-csp.js, script-src 'self') is
//     the proof. (Before: the editor's preview loaded mermaid from a CDN — kb-design-lessons §8.)
//   · ONE SANITIZER: the SVG mermaid draws is THEIR text drawn by a library; it reaches the page only through
//     safe-html.js `sanitizeDiagramSvg` (SVG only, ids / classes / CSS under the render's random scope — see there);
//     the library itself runs securityLevel strict with every directive door `secure` (mermaid-model.js mermaidConfig);
//     a diagram that names a picture off itself is never handed to mermaid at all (pictureRefs — it would fetch it).
//   · RENDERS ARE SERIAL (mermaid's config is global: initialize + render run as one queued task) and CACHED by
//     (theme, font, source) — a streaming reply re-renders its markdown every frame, and a closed fence then paints
//     from the cache; each mount re-scopes the cached picture to a fresh id (two cards never share an id).
//   · THE THEME follows the live page (mermaidThemeFor over --bg-window); on `theme-colors-changed` every drawn card
//     in the document is re-drawn (cheap: a cache miss per diagram once).
//   · THE FAILURE is the source: the card switches to 源码 itself, says 「渲染失败 · 第 N 行」 + mermaid's words, and
//     marks line N — never a blank, never mermaid's bomb picture (suppressErrorRendering).
import { sanitizeDiagramSvg } from './safe-html.js';
import { isMermaidLang, mermaidConfig, mermaidThemeFor, pictureRefs, diagramVerdict, MAX_TEXT } from './mermaid-model.js';
import { t, tc } from './i18n.js';
import { copyText } from './utils.js';

let loading = null;
/** The lazy bundle's address: index.html's stamped link (cache-busted by the index route), else the bare path. */
export function mermaidHref() {
  const link = typeof document !== 'undefined' ? document.querySelector('link[rel="vs-lazy-bundle"][href^="/mermaid.js"]') : null;
  return new URL((link && link.getAttribute('href')) || '/mermaid.js', location.origin).href;
}
/** The library, imported once from THIS origin (a failed import is retried on the next diagram). */
export function ensureMermaid() {
  return loading || (loading = import(mermaidHref()).then((mod) => {
    const m = mod && (mod.default || mod);
    if (!m || typeof m.render !== 'function' || typeof m.initialize !== 'function') throw new Error('public/mermaid.js did not export mermaid');
    return m;
  }).catch((e) => { loading = null; throw e; }));
}

const rand = () => {
  const a = new Uint32Array(2); crypto.getRandomValues(a);
  return a[0].toString(36) + a[1].toString(36);
};
const newScope = () => 'vsd' + rand();
/** The live page's theme + font, read when a diagram is drawn. */
export function liveLook(el) {
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue('--bg-window').trim() || getComputedStyle(document.body).backgroundColor;
  const fontFamily = getComputedStyle(el && el.isConnected ? el : document.body).fontFamily || '';
  return { theme: mermaidThemeFor(bg), fontFamily };
}

const CACHE_MAX = 60;
const cache = new Map(); // `${theme}\n${font}\n${code}` → Promise<{ ok, svg, scope, ms } | verdict>
let queue = Promise.resolve();
const remember = (key, p) => { cache.set(key, p); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); return p; };
/** Draw `code` → Promise<{ ok:true, svg, scope, ms } | { ok:false, kind, line, message }> — the svg already sanitized. */
export function renderDiagram(code, { theme = 'dark', fontFamily = '' } = {}) {
  const src = String(code ?? '');
  const key = `${theme}\n${fontFamily}\n${src}`;
  if (cache.has(key)) { const p = cache.get(key); cache.delete(key); cache.set(key, p); return p; }
  const pics = pictureRefs(src);
  if (pics.length) return remember(key, Promise.resolve({ ...diagramVerdict(t('This diagram shows a picture from {where} — VibeSpace draws nothing from outside', { where: pics[0].slice(0, 80) }), { kind: 'picture' }) }));
  if (src.length > MAX_TEXT) return remember(key, Promise.resolve(diagramVerdict('Maximum text size in diagram exceeded', { kind: 'size' })));
  const task = async () => {
    let mermaid;
    try { mermaid = await ensureMermaid(); } catch (e) { cache.delete(key); return diagramVerdict(e, { kind: 'load' }); }
    const scope = newScope(), t0 = performance.now();
    try {
      mermaid.initialize(mermaidConfig({ theme, fontFamily }));
      const out = await mermaid.render(scope, src);
      return { ok: true, svg: sanitizeDiagramSvg(out && out.svg, scope), scope, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      document.getElementById(scope)?.remove(); document.getElementById('d' + scope)?.remove(); // mermaid's scratch nodes, if a failure left one
      return diagramVerdict(e);
    }
  };
  const p = queue.then(task, task);
  queue = p.then(() => {}, () => {});
  return remember(key, p);
}
/** A cached picture under a fresh scope (every id / reference / CSS selector carries the scope string). */
export function rescope(svg, from, to) { return from && to && from !== to ? String(svg).split(from).join(to) : String(svg); }

// ── THE CARD ──
const sources = new WeakMap(); // card → its source text (never an attribute: a diagram can be long)
const VIEW_MAX = 200;
const views = new Map(); // source → 'source' when the person chose the source (survives a re-render of the same message)
const mkBtn = (cls, text, title) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; if (title) b.title = title; return b; };

function setView(card, view, { chosen = false } = {}) {
  card.dataset.view = view;
  for (const b of card.querySelectorAll(':scope > .chat-diagram-bar .chat-diagram-seg button')) b.setAttribute('aria-pressed', String(b.dataset.v === view));
  if (chosen) {
    const src = sources.get(card);
    if (view === 'source') { views.set(src, 'source'); if (views.size > VIEW_MAX) views.delete(views.keys().next().value); } else views.delete(src);
  }
}
function sourceLines(pre, code, bad) {
  const c = pre.querySelector('code') || pre;
  c.textContent = '';
  String(code).replace(/\n$/, '').split('\n').forEach((line, i) => {
    const s = document.createElement('span');
    s.className = 'chat-diagram-line' + (bad === i + 1 ? ' chat-diagram-line-bad' : '');
    s.textContent = line; // a block per line (copying a selection still yields the lines)
    c.appendChild(s);
  });
}
async function draw(card) {
  const code = sources.get(card);
  const fig = card.querySelector(':scope > .chat-diagram-figure');
  const err = card.querySelector(':scope > .chat-diagram-error');
  const pre = card.querySelector(':scope > pre');
  const look = liveLook(card);
  const gen = (card._diagramGen = (card._diagramGen || 0) + 1);
  card.dataset.diagram = 'loading';
  const r = await renderDiagram(code, look);
  if (gen !== card._diagramGen) return r;
  if (r.ok) {
    fig.innerHTML = rescope(r.svg, r.scope, newScope()); // sanitized by safe-html.js sanitizeDiagramSvg (THE diagram wall)
    err.hidden = true; err.textContent = '';
    card.dataset.diagram = 'ok'; card.dataset.theme = look.theme;
    sourceLines(pre, code, 0);
    setView(card, views.get(code) === 'source' ? 'source' : 'diagram');
  } else {
    fig.textContent = '';
    card.dataset.diagram = 'failed';
    err.hidden = false;
    err.textContent = (r.line ? t('Rendering failed · line {n}', { n: r.line }) : t('Rendering failed')) + (r.message ? ' — ' + r.message : '');
    sourceLines(pre, code, r.line);
    setView(card, 'source');
  }
  card.dispatchEvent(new CustomEvent('diagram-drawn', { bubbles: true, detail: { ok: !!r.ok, ms: r.ms } }));
  return r;
}

/** Turn every ```mermaid code block under `root` into a diagram card (a <pre data-fence-open> — a fence still being
 *  streamed — stays code). `opts.app` = the app (放大 opens its viewer window; default window.app). → cards made. */
export function mountDiagrams(root, opts = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  let made = 0;
  for (const code of root.querySelectorAll('pre > code[class*="language-"]')) {
    const lang = [...code.classList].map((c) => /^language-(.+)$/.exec(c)).find(Boolean);
    if (!lang || !isMermaidLang(lang[1])) continue;
    const pre = code.parentElement;
    if (!pre || pre.hasAttribute('data-fence-open') || pre.closest('.chat-diagram')) continue;
    mountCard(pre, code.textContent.replace(/\n$/, ''), opts); // marked ends a fence's code with its newline; the source is the diagram as written
    made++;
  }
  if (made) watchTheme();
  return made;
}
function mountCard(pre, code, { app } = {}) {
  const card = document.createElement('div');
  card.className = 'chat-diagram';
  sources.set(card, code);
  const bar = document.createElement('div'); bar.className = 'chat-diagram-bar';
  const seg = document.createElement('div'); seg.className = 'chat-diagram-seg'; seg.setAttribute('role', 'group');
  const bDiagram = mkBtn('chat-diagram-v', t('Diagram'), t('Show the diagram')); bDiagram.dataset.v = 'diagram';
  const bSource = mkBtn('chat-diagram-v', tc('diagram', 'Source'), t('Show the diagram’s source')); bSource.dataset.v = 'source';
  seg.append(bDiagram, bSource);
  const bCopy = mkBtn('chat-diagram-copy chat-wrap-toggle', t('Copy'), t('Copy the diagram’s source'));
  const bZoom = mkBtn('chat-diagram-zoom chat-wrap-toggle', t('Enlarge'), t('Open the diagram at full size'));
  bar.append(seg, bCopy, bZoom);
  const fig = document.createElement('div'); fig.className = 'chat-diagram-figure';
  fig.textContent = t('Drawing the diagram…');
  const err = document.createElement('div'); err.className = 'chat-diagram-error'; err.hidden = true; err.setAttribute('role', 'status');
  pre.replaceWith(card);
  pre.classList.add('chat-diagram-source');
  card.append(bar, fig, err, pre);
  // the picture is OURS to click: nothing inside it reaches a delegated handler of the view it sits in
  for (const ev of ['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'pointerdown']) fig.addEventListener(ev, (e) => e.stopPropagation());
  const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
  bDiagram.onclick = (e) => { stop(e); if (card.dataset.diagram === 'ok') setView(card, 'diagram', { chosen: true }); };
  bSource.onclick = (e) => { stop(e); setView(card, 'source', { chosen: true }); };
  bCopy.onclick = (e) => {
    stop(e);
    copyText(code).then(() => { bCopy.textContent = t('Copied'); setTimeout(() => { bCopy.textContent = t('Copy'); }, 1200); }).catch(() => {});
  };
  bZoom.onclick = (e) => {
    stop(e);
    const a = app || globalThis.app;
    if (card.dataset.diagram === 'ok' && a && typeof a.openDiagram === 'function') a.openDiagram(code);
  };
  setView(card, 'diagram');
  draw(card);
  return card;
}

let themeWatched = false;
function watchTheme() {
  if (themeWatched || typeof window === 'undefined') return;
  themeWatched = true;
  window.addEventListener('theme-colors-changed', () => {
    // after the new theme's styles apply (themes.js dispatches inside apply())
    requestAnimationFrame(() => { for (const card of document.querySelectorAll('.chat-diagram')) if (sources.has(card) && card.dataset.diagram !== 'loading') draw(card); });
  });
}
/** THE ZOOM PICTURE: the sanitized SVG at its natural size as an image (an <img> of an SVG runs nothing and fetches
 *  nothing) → { ok, url (blob:, the caller revokes), width, height } | a failure verdict. */
export async function diagramPicture(code, el) {
  const look = liveLook(el);
  const r = await renderDiagram(code, look);
  if (!r.ok) return r;
  const svg = new DOMParser().parseFromString(r.svg, 'text/html').body.firstElementChild; // an inert document (no script runs)
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return diagramVerdict('not an svg');
  const vb = String(svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const w = Math.max(16, Math.ceil(vb[2] || 800)), h = Math.max(16, Math.ceil(vb[3] || 600));
  svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h)); svg.removeAttribute('style');
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-window').trim();
  const text = new XMLSerializer().serializeToString(svg);
  return { ok: true, url: URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })), width: w, height: h, bg, theme: look.theme };
}
