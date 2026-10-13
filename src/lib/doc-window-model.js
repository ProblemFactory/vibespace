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
const VOID_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
/** An UNPAIRED open tag is TEXT (lane doc-raw-blocks r2 — the owner's `PR-<code>-nn` placeholder): an inline open tag of an
 *  element that needs a close, whose `</name>` is not in the rest of its own inline run (the paragraph, the table cell, the
 *  item) → the tag as written (to be shown escaped); else null. Void elements and self-closed tags are markup; a name that
 *  is no element is placeholderHtml's. Marked would open the element there and the rest of the cell read in its type. */
export function unpairedOpenTag(src) {
  const s = String(src ?? ''), m = /^<([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?>/.exec(s);
  if (!m || /\/>$/.test(m[0])) return null;
  const name = m[1].toLowerCase();
  if (VOID_TAGS.has(name) || !HTML_TAGS.has(name)) return null;
  return new RegExp('</' + name + '\\s*>', 'i').test(s.slice(m[0].length)) ? null : m[0];
}
/** The reader's inline rule beside the html hook: it takes an unpaired open tag BEFORE marked's tag rule (which would also
 *  switch marked's raw-text state on for the rest of the run) and writes it as escaped text. */
const LITERAL_TAG = { name: 'vsLiteralTag', level: 'inline', start: (src) => src.indexOf('<'), tokenizer(src) { const t = unpairedOpenTag(src); return t ? { type: 'vsLiteralTag', raw: t, text: t } : undefined; }, renderer: (tok) => esc(tok.text) };
const FRONT = /^(---|\+\+\+)[ \t]*\n([\s\S]*?)\n\1[ \t]*(?:\n|$)/;
const readers = new WeakMap();
/** THE READING RENDER (Export HTML / Copy as HTML / Print): the markdown SOURCE (unsaved edits included — the caller's
 *  sourceNow) through `Marked` (the house renderer's class, the main bundle's marked) and `sanitize` (THE one sanitizer)
 *  — never the editor's DOM: a construct the editor carries as a raw block (lossy for EDITING) is still a heading / a
 *  list / inline code for READING. Front matter reads as a plain block; an unpaired inline open tag reads as its text
 *  (LITERAL_TAG, r2). No sanitizer ⇒ throws (fail closed). */
export function readingHtml(src, { Marked, sanitize } = {}) {
  if (typeof sanitize !== 'function' || typeof Marked !== 'function') throw new Error('readingHtml needs Marked + the sanitizer');
  let md = readers.get(Marked);
  if (!md) { md = new Marked({ gfm: true, extensions: [LITERAL_TAG], renderer: { html(t) { return placeholderHtml(typeof t === 'string' ? t : t && t.text); } } }); readers.set(Marked, md); }
  const s = String(src ?? '').replace(/^\uFEFF/, ''), fm = FRONT.exec(s);
  return sanitize(md.parse(fm ? '~~~~\n' + fm[2] + '\n~~~~\n\n' + s.slice(fm[0].length) : s));
}
/** THE RAW BLOCK READ AS A DOCUMENT (lane doc-raw-blocks, 2.369.246 — owner 2026-10-09 "这个会莫名其妙变成源码的问题还没修复":
 *  a table the wheel carried as a raw block showed its SOURCE in the reading view). The window's rawBlock node view draws
 *  THIS: the block's source through readingHtml (the house renderer + THE one sanitizer — the Print render), read-only,
 *  its chip the one way into the source. → { kind: 'html' | 'front' | 'markdown' (the chip's word), html, rendered } —
 *  rendered = false when the block reads as NOTHING (an HTML comment, a lone closing tag) or the renderer threw ⇒ the
 *  window shows the source, as before, and its chip says so. No sanitizer / no renderer ⇒ throws (fail closed). */
export function rawReading(src, { Marked, sanitize } = {}) {
  if (typeof sanitize !== 'function' || typeof Marked !== 'function') throw new Error('rawReading needs Marked + the sanitizer');
  const s = String(src ?? ''), kind = rawKind(s);
  let html = '';
  try { html = String(readingHtml(s, { Marked, sanitize }) || ''); } catch { return { kind, html: '', rendered: false }; }
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim();
  return { kind, html, rendered: !!text || /<(?:img|hr|table|input|video|audio)\b/i.test(html) };
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

/** THE RAW-BLOCK COMMENT ANCHOR (lane doc-comment-raw-block, 2.369.258 — owner 2026-10-12 "这个html部分无法批注": the comment
 *  popover keyed only to the editor's TEXT selection, so a raw block — an atom — was never commentable). The rule: every
 *  block of a document is commentable; what the person selected is the quote. The window reads the selection, this
 *  decides. A block = { pos, line (its first SOURCE line), source, editing (its source box is open) }.
 *    { node: block }  — a NodeSelection on the block (a click on it): the quote = its kind + its source (≤ 200 chars)
 *    { dom: { a, b, text, offset } } — a non-collapsed DOM selection; a / b = the block each end sits in (null = outside
 *      any raw block); offset = where `text` starts in the block's source when the box SHOWS the source (else -1):
 *      the quote = the selected text, the line = the block's line + the source lines before `offset`
 *  → { quote, line, raw: { pos, line, kind, offset? } } — the comment's anchor: the existing { quote, line } + ONE field
 *  `raw` (the strip re-finds the block by it) | { refused: 'text' } — an end outside the block, or the two ends in two
 *  blocks: THE TEXT RULE WINS (the editor's own selection: a selection spanning a paragraph and a raw block quotes the
 *  paragraph's text, the block — an atom — adds none) | { refused: 'editing' } — the block's source box is open: not
 *  commentable until Finish | { refused: 'empty' } — only whitespace selected. */
export const RAW_QUOTE = 200;
export const RAW_KIND_WORD = Object.freeze({ html: 'HTML block', front: 'Front matter', markdown: 'Markdown block' });
const rawKind = (s) => (/^\s*</.test(s) ? 'html' : /^(---|\+\+\+)/.test(s) ? 'front' : 'markdown');
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const clipCp = (s, n) => { const a = Array.from(s); return a.length > n ? a.slice(0, n - 1).join('') + '…' : s; };
const isBlock = (b) => !!b && Number.isInteger(b.pos) && b.pos >= 0 && typeof b.source === 'string';
export function rawCommentAnchor(sel) {
  const anchor = (b, quote, line, offset) => ({ quote, line, raw: { pos: b.pos, line: b.line > 0 ? b.line : 0, kind: rawKind(b.source), ...(offset >= 0 ? { offset } : {}) } });
  if (sel && sel.node) {
    const b = sel.node; if (!isBlock(b)) return { refused: 'text' };
    if (b.editing) return { refused: 'editing' };
    const src = oneLine(b.source); if (!src) return { refused: 'empty' };
    return anchor(b, clipCp(RAW_KIND_WORD[rawKind(b.source)] + ': ' + src, RAW_QUOTE), b.line > 0 ? b.line : 0, -1);
  }
  const d = sel && sel.dom; if (!d) return { refused: 'text' };
  const { a, b } = d;
  if (!isBlock(a) || !isBlock(b) || a.pos !== b.pos) return { refused: 'text' };
  if (a.editing) return { refused: 'editing' };
  const text = String(d.text ?? ''); if (!oneLine(text)) return { refused: 'empty' };
  const off = Number.isInteger(d.offset) && d.offset >= 0 && a.source.slice(d.offset, d.offset + text.length) === text ? d.offset : -1;
  const line = a.line > 0 ? a.line + (off > 0 ? a.source.slice(0, off).split('\n').length - 1 : 0) : 0;
  return anchor(a, clipCp(oneLine(text), RAW_QUOTE), line, off);
}
/** The strip's way back to a raw-block comment's block (a reload, an edit above it): the block whose one-line source
 *  holds the quote (its kind prefix and the clip's … dropped), nearest the saved line; else the block at the saved
 *  position or line; else null (the block is gone). blocks = the document's raw blocks now, [{ pos, line, source }]. */
export function rawCommentTarget(blocks, c) {
  const r = c && c.raw, list = Array.isArray(blocks) ? blocks.filter(isBlock) : [];
  if (!r || !list.length) return null;
  let q = oneLine(c.quote); const word = RAW_KIND_WORD[r.kind];
  if (word && q.startsWith(word + ': ')) q = q.slice(word.length + 2);
  q = q.replace(/…$/, '');
  const near = (xs) => xs.reduce((m, x) => (!m || Math.abs(x.line - r.line) < Math.abs(m.line - r.line) ? x : m), null);
  return (q && near(list.filter((x) => oneLine(x.source).includes(q)))) || list.find((x) => x.pos === r.pos) || list.find((x) => x.line === r.line) || null;
}

// ── THE SEND'S WORDS (lane doc-comments-ui, B-8199 — owner 2026-10-12 with eighteen comments on the strip: "请问我现在该干啥")
//    — `t` is handed in (this file imports nothing); src/lib/doc-window-ui.js paints them, scripts/test-doc-comment-send.mjs gates them.
/** Send all's label: the send's shape BEFORE the press — `plan` = M.commentsBatches(path, rows) run in the page (the server
 *  packs the same way): more than one message ⇒ "Send all (18 → 3 messages)", else "Send all (3)"; while the ONE POST is out
 *  ⇒ "Sending 18 comments…" (the server sends the batches — no per-batch progress is claimed). */
export function sendAllLabel(t, { n = 0, plan = null, sending = false } = {}) {
  if (sending) return n === 1 ? t('Sending 1 comment…') : t('Sending {n} comments…', { n });
  const m = plan && plan.ok && Array.isArray(plan.batches) ? plan.batches.length : 1;
  return m > 1 ? t('Send all ({n} → {m} messages)', { n, m }) : t('Send all ({n})', { n });
}
/** An answer of POST /api/doc/comments said by what happened (`n` = the rows this press sent): 'sent' ⇒ "Sent …" (in m
 *  messages); 'stashed' ⇒ "Stashed …" with when they arrive — never "Sent"; a part-way failure ⇒ the rest are still here;
 *  clipped notes said. → { words, kind: 'sent'|'stashed'|'partial'|'failed' } | null (no_owner: the strip's owner line says it) */
export function sendWords(t, r, n) {
  if (r && r.ok) {
    const c = Number.isInteger(r.count) && r.count > 0 ? r.count : n;
    const stashed = r.delivered === 'stashed';
    let words = stashed
      ? (c === 1 ? t('Stashed 1 comment — the conversation is not running; it is delivered when its next turn starts') : t('Stashed {n} comments — the conversation is not running; they are delivered when its next turn starts', { n: c }))
      : r.messages > 1 ? t('Sent {n} comments in {m} messages', { n: c, m: r.messages }) : c === 1 ? t('Sent 1 comment') : t('Sent {n} comments', { n: c });
    if (r.clipped > 0) words += ' ' + (r.clipped === 1 ? t('+ 1 note was shortened to fit') : t('+ {k} notes were shortened to fit', { k: r.clipped }));
    return { words, kind: stashed ? 'stashed' : 'sent' };
  }
  if (r && r.code === 'no_owner') return null;
  if (r && Number.isInteger(r.sent) && r.sent > 0) return { words: t('Sent {sent} of {n} — the rest are still here', { sent: r.sent, n }), kind: 'partial' };
  return { words: t('Could not send the comments: {why}', { why: (r && r.error) || t('the server did not answer') }), kind: 'failed' };
}

// ── A LINK OPENS AND EDITS (lane doc-link-bubble, 2.369.261 — owner 2026-10-12 "markdown富文本编辑器里url无法点击和编辑": a plain
//    click on a link was swallowed, the toolbar's Link REMOVED an existing link). The window reads the link under the caret
//    (its range, address, text, attrs) and hands in the editable flag + THE judge (doc-markdown's safeHref); this decides.
export const LINK_SHOWN = 48;
/** An address as the bar shows it: ≤ `max` code points, the middle elided so the host and the tail both stay (the full one is the title). */
export function clipHref(href, max = LINK_SHOWN) {
  const a = Array.from(String(href ?? ''));
  if (a.length <= max) return a.join('');
  const tail = Math.min(16, Math.floor((max - 1) / 3));
  return a.slice(0, max - 1 - tail).join('') + '…' + a.slice(a.length - tail).join('');
}
/** The bar for a link: null (no link) | { href, text, shown, canEdit, canOpen, acts } — acts in the bar's order. A link the view
 *  may not carry (the judge refuses its address) is shown and reachable by Edit / Copy / Remove, never opened; a read-only view
 *  (nothing to edit) offers Open + Copy. */
export function linkBarModel(link, { editable = true, judge = (h) => h } = {}) {
  if (!link || typeof link.href !== 'string' || !link.href.trim()) return null;
  const canOpen = !!judge(link.href), canEdit = !!editable;
  const acts = [...(canOpen ? ['open'] : []), ...(canEdit ? ['edit'] : []), 'copy', ...(canEdit ? ['remove'] : [])];
  return { href: link.href, text: String(link.text ?? ''), shown: clipHref(link.href), canEdit, canOpen, acts };
}
/** The Link dialog's answer → the editor's commands AS DATA ({ steps: [[command, ...args]] } the window chains), { refused: href }
 *  (the judge said no — the window says so) or null (nothing to do: no address, nothing changed). `cur` = what the dialog opened
 *  on: { link: { from, to, href, text, attrs } } (the caret on a link ⇒ EDIT it: its address, its text if changed) | { from, to,
 *  text } (a selection ⇒ link it; a changed text replaces it) | { from, to } with from === to (a bare caret ⇒ the text, else the
 *  address, inserted as its own linked text). An action on an existing link EDITS it — never removes it (Remove is the bar's).
 *  The caret ends after the link (no selection left behind for the comment popover to offer). */
export function linkPlan(cur, ans, judge = (h) => h) {
  const href = String(ans?.href ?? '').trim(), text = String(ans?.text ?? '').trim();
  if (!href || !cur) return null;
  if (!judge(href)) return { refused: href };
  const textNode = (attrs) => ({ type: 'text', text: text || href, marks: [{ type: 'link', attrs }] });
  const link = cur.link;
  if (link) {
    const at = { from: link.from, to: link.to };
    if (text && text !== String(link.text ?? '').trim()) return { steps: [['insertContentAt', at, textNode({ ...(link.attrs || {}), href })]] };
    if (href === link.href) return null;
    return { steps: [['setTextSelection', at], ['setLink', { href }], ['setTextSelection', at.to]] };
  }
  const at = { from: cur.from, to: cur.to };
  if (at.from === at.to) return { steps: [['insertContentAt', at.from, textNode({ href })]] };
  if (text && text !== String(cur.text ?? '').trim()) return { steps: [['insertContentAt', at, textNode({ href })]] };
  return { steps: [['setTextSelection', at], ['setLink', { href }], ['setTextSelection', at.to]] };
}
