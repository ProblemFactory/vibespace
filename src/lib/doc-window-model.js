// THE DOC WINDOW'S WIDTH + LEAVING RULES (lane doc-window-width-export, 2.369.239 — owner 2026-10-08 "为啥左右这么多空白，缺少下载和导出功能")
// — PURE (no DOM, no fetch): bundled into the lazy public/doc-editor.js by src/lib/doc-window-ui.js; gated by scripts/test-doc-window-width.mjs.
//   · WIDTH: the column follows the window it is given — `fit` (the window's width minus a 32 px reading gutter each side) is
//     the default; `comfortable` (design 020's centred 76ch measure, for long prose) is a choice; the choice is a DEVICE's
//     preference (localStorage WIDTH_KEY, like the docx viewer's zoom — never user-state). A phone is always fit, 12 px gutter.
//   · TABLES: a table wider than the column scrolls inside its own wrapper (overflow-x auto, the first column sticky) — never clipped.
//   · LEAVING: Download .md = the file itself through /api/download (the existing attachment route); Export HTML / Print = ONE
//     self-contained document built here from the editor's SANITIZED fragment (src/lib/safe-html.js sanitizeHtml, by the
//     caller), the editor's own rules and the theme's tokens inlined; no script ever. No .docx (a reader exists, no writer).
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
const TOKEN_RE = /^--[a-z0-9-]{1,40}$/i;
const VALUE_RE = /^[^;{}<>]{0,200}$/;
/** The page's base + the print sheet: full width, 16 mm margins, light ink, rows and headings never split from their next. */
export const PRINT_CSS = [
  '@page{margin:16mm}',
  '@media print{:root{--bg-window:#fff;--bg-input:#f3f3f3;--text:#111;--text-secondary:#333;--text-dim:#555;--border:#bbb;--accent:#0b5cad;--accent-dim:#9cc0e6}'
    + 'body{background:#fff}.doc-page{max-width:none!important;padding:0!important;margin:0!important}'
    + '.doc-page .ProseMirror .tableWrapper{overflow:visible}.doc-page .ProseMirror :is(td,th):first-child{position:static}'
    + 'tr,img,pre,blockquote,figure{break-inside:avoid}thead{display:table-header-group}h1,h2,h3,h4,h5,h6{break-after:avoid}'
    + '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
].join('\n');
/** THE ONE EXPORTED DOCUMENT. `body` = the editor's fragment AFTER the one sanitizer (the caller's sanitizeHtml); `css` =
 *  the editor's own rules; `tokens` = [[--name, value]] read off the live theme; `wide` = the fit column. → the HTML, or
 *  null when the fragment still carries a script / a handler / a javascript: link (a belt: the sanitizer let it through). */
export function exportDocument({ title = '', body = '', css = '', tokens = [], font = '', wide = true } = {}) {
  const b = String(body || '');
  if (/<script\b|<[^>]*\son[a-z]+\s*=|<[^>]*\b(?:href|src|action|formaction)\s*=\s*["']?\s*(?:javascript|vbscript|data:text\/html)/i.test(b)) return null;
  const vars = (Array.isArray(tokens) ? tokens : []).filter(([k, v]) => TOKEN_RE.test(String(k)) && VALUE_RE.test(String(v).trim()) && String(v).trim()).map(([k, v]) => `${k}:${String(v).trim()}`);
  const base = `html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg-window);color:var(--text);font-family:${VALUE_RE.test(font) && font ? font : 'system-ui,sans-serif'}}`
    + `.doc-page{margin:0 auto;box-sizing:border-box;padding:28px ${GUTTER}px 64px;${wide ? 'max-width:none' : 'max-width:' + MEASURE}}`;
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<meta name="generator" content="VibeSpace Doc window"><title>${esc(title)}</title>`
    + `<style>:root{${vars.join(';')}}\n${base}\n${String(css || '').replace(/<\/style/gi, '<\\/style')}\n${TABLE_CSS}\n${PRINT_CSS}</style></head>`
    + `<body><main class="doc-page"><article class="ProseMirror">${b}</article></main></body></html>`;
}
