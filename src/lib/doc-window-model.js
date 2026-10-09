// THE DOC WINDOW'S WIDTH + LEAVING RULES (lane doc-window-width-export, 2.369.239 — owner 2026-10-08 "为啥左右这么多空白，缺少下载和导出功能")
// — PURE (no DOM, no fetch): bundled into the lazy public/doc-editor.js by src/lib/doc-window-ui.js; gated by scripts/test-doc-window-width.mjs.
//   · WIDTH: the column follows the window it is given — `fit` (the window's width minus a 32 px reading gutter each side) is
//     the default; `comfortable` (design 020's centred 76ch measure, for long prose) is a choice; the choice is a DEVICE's
//     preference (localStorage WIDTH_KEY, like the docx viewer's zoom — never user-state). A phone is always fit, 12 px gutter.
//   · TABLES: a table wider than the column scrolls inside its own wrapper (overflow-x auto, the first column sticky) — never clipped.
//   · LEAVING: Download .md = the file itself through /api/download (the existing attachment route); Export HTML / Print = ONE
//     self-contained document built here from the MARKDOWN SOURCE rendered for reading (`readingHtml`: the house renderer —
//     marked, the main bundle's — then the one sanitizer, src/lib/safe-html.js sanitizeHtml, both handed in by the caller),
//     never the editor's DOM (lane doc-print-fidelity, 2.369.241 — owner "你这个存为PDF效果很差": a block the editor
//     carries as a raw block printed as a clipped monospace box); the editor's own rules and the theme's tokens inlined; no
//     script ever. The print sheet wraps everything (pre / code / cells / long words), no scroll container, real pages.
//     No .docx (a reader exists, no writer).
export const WIDTH_KEY = 'vs-doc-width';
export const WIDTHS = Object.freeze(['fit', 'comfortable']);
export const GUTTER = 32;
export const PHONE_GUTTER = 12;
/** Comfortable's measure: the 76ch column the window had before (design 020) — its padding is the gutter. */
export const MEASURE = 'calc(76ch + ' + (2 * GUTTER) + 'px)';
export const widthChoice = (v) => (v === 'comfortable' ? 'comfortable' : 'fit');
export const nextWidth = (v) => (widthChoice(v) === 'fit' ? 'comfortable' : 'fit');
/** The page's rule: { choice, maxWidth (CSS), gutter (px) } — a phone is always fit with its own gutter. */
export function columnRule({ choice, phone = false } = {}) {
  if (phone) return { choice: 'fit', maxWidth: 'none', gutter: PHONE_GUTTER };
  const c = widthChoice(choice);
  return { choice: c, maxWidth: c === 'fit' ? 'none' : MEASURE, gutter: GUTTER };
}
/** THE TABLE RULE (both widths): the wrapper scrolls, the table keeps its natural width up to the column, the first column stays. */
export const TABLE_CSS = [
  '.doc-page .ProseMirror .tableWrapper{overflow-x:auto;overflow-y:hidden;max-width:100%;margin-left:-4px;margin-right:-4px;padding:0 4px 4px}',
  '.doc-page .ProseMirror :is(td,th):first-child{position:sticky;left:0;z-index:1;background:var(--bg-window)}',
  '.doc-page .ProseMirror th:first-child{background:var(--bg-input)}',
].join('\n');

/** The download link of the file itself: the existing attachment route (src/routes/files.js /api/download — local and RemoteFs.downloadTo). */
export function downloadHref(host, path) {
  const u = new URLSearchParams();
  if (host) u.set('host', host);
  u.set('path', path);
  return '/api/download?' + u.toString();
}
/** An exported file's name: the document's own stem + `.html`. */
export function exportName(name) {
  const base = String(name || 'document').replace(/[\\/]/g, '_');
  return (base.replace(/\.(md|markdown)$/i, '') || 'document') + '.html';
}
/** An <img src> the export may inline: a path beside the document (relative or absolute), never a scheme URL. → the
 *  /api/file/raw path it reads from, or '' (kept as written). */
export function localImagePath(src, docPath) {
  const s = String(src || '').trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return '';
  const dir = String(docPath || '/').slice(0, String(docPath || '/').lastIndexOf('/')) || '/';
  const out = [];
  for (const seg of ((s.startsWith('/') ? '' : dir + '/') + s.split(/[?#]/)[0]).split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); }
  return '/' + out.join('/');
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** The element names an author's inline HTML may mean; any other bare `<word>` is a PLACEHOLDER written as text. */
const HTML_TAGS = new Set(('a abbr address area article aside audio b bdi bdo big blockquote br button canvas caption center cite code col colgroup '
  + 'data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure font footer form h1 h2 h3 h4 h5 h6 header hgroup hr i '
  + 'iframe img input ins kbd label legend li link main map mark math menu meta meter nav noscript object ol optgroup option output p param '
  + 'picture pre progress q rp rt ruby s samp script section select slot small source span strike strong style sub summary sup svg table '
  + 'tbody td template textarea tfoot th thead time title tr track tt u ul var video wbr').split(' '));
/** marked's `html` hook for READING: an inline `<id>` / `</sha>` naming no HTML element (a brief's `/p/<id>`) is TEXT —
 *  passed on as a tag, the sanitizer would strip it and the word with it; real tags go on to the sanitizer as written. */
export function placeholderHtml(h) {
  const s = String(h ?? '');
  const m = /^<\/?([A-Za-z][A-Za-z0-9-]*)\s*\/?>$/.exec(s);
  return m && !HTML_TAGS.has(m[1].toLowerCase()) ? esc(s) : s;
}
const FRONT = /^(---|\+\+\+)[ \t]*\n([\s\S]*?)\n\1[ \t]*(?:\n|$)/;
const readers = new WeakMap();
/** THE READING RENDER (Export HTML / Copy as HTML / Print): the markdown SOURCE (unsaved edits included — the caller's
 *  sourceNow) through `Marked` (the house renderer's class, the main bundle's marked) and `sanitize` (THE one sanitizer)
 *  — never the editor's DOM: a construct the editor carries as a raw block (lossy for EDITING) is still a heading / a
 *  list / inline code for READING. Front matter reads as a plain block. No sanitizer ⇒ throws (fail closed). */
export function readingHtml(src, { Marked, sanitize } = {}) {
  if (typeof sanitize !== 'function' || typeof Marked !== 'function') throw new Error('readingHtml needs Marked + the sanitizer');
  let md = readers.get(Marked);
  if (!md) { md = new Marked({ gfm: true, renderer: { html(t) { return placeholderHtml(typeof t === 'string' ? t : t && t.text); } } }); readers.set(Marked, md); }
  const s = String(src ?? '').replace(/^\uFEFF/, ''), fm = FRONT.exec(s);
  return sanitize(md.parse(fm ? '~~~~\n' + fm[2] + '\n~~~~\n\n' + s.slice(fm[0].length) : s));
}
/** A table's PRINT type step by its column count (the wrapper's data-cols): ≤ 4 columns as written, 5–6 = m (90 %),
 *  7–9 = l (80 %), 10+ = xl (70 %) — the cells wrap anyway; the step keeps a wide table's words whole. */
export const colsBand = (n) => (n >= 10 ? 'xl' : n >= 7 ? 'l' : n >= 5 ? 'm' : '');
const TOKEN_RE = /^--[a-z0-9-]{1,40}$/i;
const VALUE_RE = /^[^;{}<>]{0,200}$/;
/** THE PRINT SHEET: 16 mm pages, full width, light ink; the document FLOWS (no fixed height, no scroll container, nothing
 *  hidden); body 11 pt, code 9.5 pt; pre / code / cells / long words WRAP (nothing clipped, no scrollbar painted); a table
 *  fills the width and steps its type down by its column count (colsBand); images bounded; rows, quotes and figures not
 *  split, headings kept with their next — a pre is never `avoid` (one longer than a page breaks across pages). */
export const PRINT_CSS = [
  '@page{margin:16mm}',
  '@media print{:root{--bg-window:#fff;--bg-input:#f3f3f3;--text:#111;--text-secondary:#333;--text-dim:#555;--border:#bbb;--accent:#0b5cad;--accent-dim:#9cc0e6}'
    + 'html,body{height:auto!important;overflow:visible!important;background:#fff}'
    + '.doc-page{max-width:none!important;padding:0!important;margin:0!important;height:auto!important;overflow:visible!important}'
    + '.doc-page .ProseMirror{font-size:11pt;line-height:1.5}.doc-page .ProseMirror *{max-height:none!important;overflow:visible!important}'
    + '.doc-page .ProseMirror :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,dd,dt,a){overflow-wrap:break-word}'
    + '.doc-page .ProseMirror :is(pre,code){white-space:pre-wrap!important;overflow-wrap:anywhere;overflow:visible!important}'
    + '.doc-page .ProseMirror pre{font-size:9.5pt;break-inside:auto}.doc-page .ProseMirror :not(pre)>code{font-size:.86em}'
    + '.doc-page .ProseMirror .tableWrapper{overflow:visible;margin:0;padding:0}'
    + '.doc-page .ProseMirror table{table-layout:auto;width:100%;max-width:100%;word-break:break-word}'
    + '.doc-page .ProseMirror :is(td,th){white-space:normal;overflow-wrap:anywhere;min-width:0}.doc-page .ProseMirror :is(td,th):first-child{position:static}'
    + '.doc-page .ProseMirror .tableWrapper[data-cols="m"]{font-size:90%}.doc-page .ProseMirror .tableWrapper[data-cols="l"]{font-size:80%}.doc-page .ProseMirror .tableWrapper[data-cols="xl"]{font-size:70%}'
    + '.doc-page .ProseMirror :is(img,svg,video){max-width:100%;height:auto}'
    + 'tr,img,blockquote,figure{break-inside:avoid}thead{display:table-header-group}h1,h2,h3,h4,h5,h6{break-after:avoid}'
    + '::-webkit-scrollbar{display:none}*{scrollbar-width:none}'
    + '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
].join('\n');
/** THE ONE EXPORTED DOCUMENT. `body` = the READING fragment (readingHtml: the source rendered, AFTER the one sanitizer);
 *  `css` = the editor's own rules (the article reads with normal white-space — marked's newlines between blocks are not
 *  lines); `tokens` = [[--name, value]] read off the live theme; `wide` = the fit column. → the HTML, or null when the
 *  fragment still carries a script / a handler / a javascript: link (a belt: the sanitizer let it through). */
export function exportDocument({ title = '', body = '', css = '', tokens = [], font = '', wide = true } = {}) {
  const b = String(body || '');
  if (/<script\b|<[^>]*\son[a-z]+\s*=|<[^>]*\b(?:href|src|action|formaction)\s*=\s*["']?\s*(?:javascript|vbscript|data:text\/html)/i.test(b)) return null;
  const vars = (Array.isArray(tokens) ? tokens : []).filter(([k, v]) => TOKEN_RE.test(String(k)) && VALUE_RE.test(String(v).trim()) && String(v).trim()).map(([k, v]) => `${k}:${String(v).trim()}`);
  const base = `html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg-window);color:var(--text);font-family:${VALUE_RE.test(font) && font ? font : 'system-ui,sans-serif'}}`
    + `.doc-page{margin:0 auto;box-sizing:border-box;padding:28px ${GUTTER}px 64px;${wide ? 'max-width:none' : 'max-width:' + MEASURE}}`
    + '.doc-page .ProseMirror.doc-read{white-space:normal}';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<meta name="generator" content="VibeSpace Doc window"><title>${esc(title)}</title>`
    + `<style>:root{${vars.join(';')}}\n${base}\n${String(css || '').replace(/<\/style/gi, '<\\/style')}\n${TABLE_CSS}\n${PRINT_CSS}</style></head>`
    + `<body><main class="doc-page"><article class="ProseMirror doc-read">${b}</article></main></body></html>`;
}
