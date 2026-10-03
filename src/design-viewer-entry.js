// THE PUBLISHED DESIGN'S RUNTIME (lane design-window L2, 2026-10-02; SharedContext/vibespace-design-window-design.md
// §3.5) — the second esbuild entry: `src/design-viewer-entry.js` → `public/design-viewer.js` (built by `npm run build`,
// gitignored like public/novnc.js). The hub inlines it into every published design page (design-model.js
// `bundleCanvas`), so `/p/<id>` is ONE self-contained file — offline, no request to anything.
//
//   · It reads the page's state block `<script type="application/json" id="vibespace-design-doc">` ({v:1, title,
//     manifest, files}) through the PURE `normalizeDoc`, and draws it with THE SAME canvas core as the Design window
//     (src/lib/design-canvas.js): pan / zoom / fit / pages / notes, one `sandbox="allow-scripts"` srcdoc frame per
//     artboard, a double-click (a tap) = one artboard at fit-width and live, Esc = back. No picker, no comment, no ws:
//     a published page is for looking at.
//   · It is NOT the app: no VibeSpace stylesheet and no i18n runtime (the dictionaries are 1.5 MB — forty times this
//     file). Its few words come in en / zh / ja from the reader's own browser language (`WORDS`), its colours are
//     the canvas's theme tokens defined here on the root (light / dark by the reader's system), its chrome is built with
//     textContent only (the title and every name are the agent's).
//   · PRESENT (lane design-present, design 003 §2.6): the bar's ▶ — or the address ending in `#present` — shows the
//     page's artboards one at a time, fitted to the screen, through the canvas core's own present mode (← → Space, a
//     click, a swipe; Esc ends). Fullscreen only on the reader's press; the bar steps aside while presenting.
//   · A page that is not a v1 design says so in words (never a blank page).
import { createDesignCanvas } from './lib/design-canvas.js';
import { normalizeDoc, zoomPercent } from './lib/design-canvas-model.js';

const DOC_ID = 'vibespace-design-doc';
const ROOT_ID = 'vibespace-design-root';

/** The viewer's words — the published page has no i18n runtime; the reader's browser language picks a column. */
export const WORDS = {
  en: { fit: 'Fit', zoomIn: 'Zoom in', zoomOut: 'Zoom out', page: 'Page', back: 'Back to canvas', refused: 'artboard refused: {why}', missing: 'artboard refused: listed in design.json but not in the folder', empty: 'This design has no artboards.', bad: 'This page carries no VibeSpace design.', hint: 'Double-click an artboard to open it', hintTouch: 'Tap an artboard to open it', by: 'Made with VibeSpace', present: 'Present', prev: 'Previous artboard', next: 'Next artboard', exit: 'End the presentation', presenting: 'Presentation' },
  zh: { fit: '适应', zoomIn: '放大', zoomOut: '缩小', page: '页面', back: '回到画布', refused: '画板被拒绝：{why}', missing: '画板被拒绝：design.json 中列出了它，但文件夹里没有', empty: '这个设计没有画板。', bad: '这个页面不包含 VibeSpace 设计。', hint: '双击画板打开它', hintTouch: '点一下画板打开它', by: '由 VibeSpace 制作', present: '演示', prev: '上一个画板', next: '下一个画板', exit: '结束演示', presenting: '演示' },
  ja: { fit: 'フィット', zoomIn: '拡大', zoomOut: '縮小', page: 'ページ', back: 'キャンバスに戻る', refused: 'アートボードは拒否されました：{why}', missing: 'アートボードは拒否されました：design.json にはあるがフォルダーにありません', empty: 'このデザインにはアートボードがありません。', bad: 'このページには VibeSpace のデザインが含まれていません。', hint: 'アートボードをダブルクリックして開きます', hintTouch: 'アートボードをタップして開きます', by: 'VibeSpace で作成', present: 'プレゼン', prev: '前のアートボード', next: '次のアートボード', exit: 'プレゼンを終了', presenting: 'プレゼン' },
};
export function wordsFor(lang) {
  const l = String(lang || '').toLowerCase();
  return l.startsWith('zh') ? WORDS.zh : l.startsWith('ja') ? WORDS.ja : WORDS.en;
}

/** The page's own stylesheet: the theme tokens the canvas reads + the page chrome. No literal outside these tokens. */
export const VIEWER_CSS = `
:root{color-scheme:dark;--bg-workspace:#111122;--bg-dialog:#1a1a30;--bg-input:#12122a;--bg-titlebar:#14142a;--paper:#ffffff;--text:#e2e8f0;--text-secondary:#94a3b8;--text-dim:#8890a8;--border:rgba(255,255,255,0.08);--accent:#2dd4bf;--red:#ef4444;--green:#22c55e;--yellow:#f59e0b;--blue:#3b82f6;--magenta:#c678dd;--cyan:#56b6c2;--radius:8px;--radius-sm:4px;--shadow-window:0 8px 32px rgba(0,0,0,0.4)}
@media (prefers-color-scheme: light){:root{color-scheme:light;--bg-workspace:#eef0f4;--bg-dialog:#ffffff;--bg-input:#f6f7f9;--bg-titlebar:#ffffff;--text:#1f2937;--text-secondary:#4b5563;--text-dim:#6b7280;--border:rgba(0,0,0,0.1);--accent:#0f766e;--red:#dc2626;--green:#16a34a;--yellow:#b45309;--blue:#2563eb;--magenta:#9333ea;--cyan:#0e7490;--shadow-window:0 6px 24px rgba(0,0,0,0.15)}}
html,body{margin:0;height:100%;background:var(--bg-workspace);color:var(--text);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
#${ROOT_ID}{position:fixed;inset:0;display:flex;flex-direction:column}
.dv-bar{display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--bg-titlebar);border-bottom:1px solid var(--border);white-space:nowrap;overflow:hidden;flex:none}
.dv-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:600;font-size:13px}
.dv-btn,.dv-pages{flex:none;height:28px;min-width:28px;padding:0 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input);color:var(--text-secondary);font:inherit;font-size:12px;cursor:pointer}
.dv-btn:hover{border-color:var(--accent);color:var(--accent)}
.dv-zoom{font-variant-numeric:tabular-nums;min-width:52px}
.dv-by{flex:none;font-size:11px;color:var(--text-dim)}
.dv-stage{position:relative;flex:1 1 auto;min-height:0}
.dv-note{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);padding:14px 16px;border-radius:var(--radius);background:var(--bg-dialog);border:1px solid var(--border);color:var(--text-secondary)}
.dv-present{display:inline-flex;align-items:center;gap:5px}
.dv-present svg{width:10px;height:10px;fill:currentColor}
.dv-presenting .dv-bar,.dv-presenting .dv-hint{display:none}
.dv-hint{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);padding:4px 12px;border-radius:999px;background:var(--bg-dialog);border:1px solid var(--border);color:var(--text-dim);font-size:11px;pointer-events:none}
@media (max-width:768px){.dv-btn,.dv-pages{height:44px;min-width:44px}.dv-by{display:none}}
`;

const mk = (doc, tag, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; return e; };

/** Mount the viewer into `doc` (the published page). → the canvas API, or null when the page carries no design. */
export function mountDesignViewer(doc = document, { lang = (typeof navigator !== 'undefined' && navigator.language) || 'en' } = {}) {
  const W = wordsFor(lang);
  const style = mk(doc, 'style');
  style.textContent = VIEWER_CSS;
  (doc.head || doc.documentElement).appendChild(style);
  let root = doc.getElementById(ROOT_ID);
  if (!root) { root = mk(doc, 'div'); root.id = ROOT_ID; doc.body.appendChild(root); }
  root.replaceChildren();
  const block = doc.getElementById(DOC_ID);
  let raw = null;
  try { raw = block ? JSON.parse(block.textContent) : null; } catch { raw = null; }
  const read = normalizeDoc(raw);
  const stage = mk(doc, 'div', 'dv-stage');
  if (read.error) {
    const n = mk(doc, 'div', 'dv-note');
    n.textContent = W.bad;
    stage.appendChild(n);
    root.appendChild(stage);
    return null;
  }
  const bar = mk(doc, 'div', 'dv-bar');
  const title = mk(doc, 'div', 'dv-title');
  title.textContent = read.title || '';
  if (read.title) doc.title = read.title;
  const button = (cls, text, label) => { const b = mk(doc, 'button', 'dv-btn ' + cls); b.type = 'button'; b.textContent = text; b.title = label; b.setAttribute('aria-label', label); return b; };
  const back = button('dv-back', '‹ ' + W.back, W.back);
  back.style.display = 'none';
  const fit = button('dv-fit', W.fit, W.fit);
  const out = button('dv-out', '−', W.zoomOut);
  const zoom = button('dv-zoom', '100%', '100%');
  const zin = button('dv-in', '+', W.zoomIn);
  // ▶ Present: an SVG mark + the word (never an emoji glyph)
  const play = button('dv-present', W.present, W.present);
  const mark = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mark.setAttribute('viewBox', '0 0 10 10');
  mark.setAttribute('aria-hidden', 'true');
  const tri = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  tri.setAttribute('d', 'M1 0.5l8 4.5-8 4.5z');
  mark.appendChild(tri);
  play.prepend(mark);
  const pages = mk(doc, 'select', 'dv-pages');
  pages.setAttribute('aria-label', W.page);
  const by = mk(doc, 'span', 'dv-by');
  by.textContent = W.by;
  bar.append(back, title, fit, out, zoom, zin, play, pages, by);
  root.append(bar, stage);
  const touch = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
  const hint = mk(doc, 'div', 'dv-hint');
  hint.textContent = touch ? W.hintTouch : W.hint;
  const canvas = createDesignCanvas(stage, {
    words: { refused: (code, why) => W.refused.replace('{why}', why || code), missing: W.missing },
    onActivate: (file) => { canvas.focus(file); hint.remove(); },
    onKey: (m, frame) => { if (canvas.focused() && frame && frame.file === canvas.focused()) canvas.focus(null); }, // its own frame only: another artboard's script cannot kick the reader out
    onChange: (s) => {
      zoom.textContent = zoomPercent(s.view.z);
      back.style.display = s.focused ? '' : 'none';
      root.classList.toggle('dv-presenting', !!s.present);
      if (pages.value !== s.page) pages.value = s.page;
    },
  });
  canvas.setFrames(read);
  const ps = canvas.pages();
  pages.replaceChildren(...ps.map((p) => { const o = mk(doc, 'option'); o.value = p.id; o.textContent = p.name || W.page; return o; }));
  pages.value = canvas.page();
  pages.style.display = ps.length > 1 ? '' : 'none';
  if (!read.frames.length) { const n = mk(doc, 'div', 'dv-note'); n.textContent = W.empty; stage.appendChild(n); }
  else stage.appendChild(hint);
  back.onclick = () => canvas.focus(null);
  fit.onclick = () => canvas.fit();
  out.onclick = () => canvas.zoomBy(-1);
  zin.onclick = () => canvas.zoomBy(+1);
  zoom.onclick = () => canvas.zoomTo(1);
  pages.onchange = () => canvas.setPage(pages.value);
  const PW = { prev: W.prev, next: W.next, exit: W.exit, bar: W.presenting };
  play.style.display = read.frames.length ? '' : 'none';
  play.onclick = () => { hint.remove(); canvas.present(true, { words: PW }); };
  // `#present` on the address: presenting from the first look (no fullscreen — only the reader's press may ask for it)
  const win = doc.defaultView;
  const wantPresent = () => { try { return win.location.hash === '#present'; } catch { return false; } };
  const presentFromHash = () => { if (wantPresent() && read.frames.length && !canvas.presenting()) { hint.remove(); canvas.present(true, { words: PW, fullscreen: false }); } };
  presentFromHash();
  if (win) win.addEventListener('hashchange', presentFromHash);
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && canvas.focused()) canvas.focus(null); });
  return canvas;
}

if (typeof document !== 'undefined' && document.getElementById) {
  const go = () => { try { mountDesignViewer(document); } catch (e) { try { const r = document.getElementById(ROOT_ID) || document.body; const n = document.createElement('p'); n.textContent = 'This design could not be shown: ' + (e && e.message); r.appendChild(n); } catch { /* nothing left to say it with */ } } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
  else go();
}
