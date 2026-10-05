// THE DOC WINDOW'S MARKDOWN (lane doc-window, 2.369.215) — prosemirror-markdown's official schema / parser / serializer,
// extended ONLY so the markup an agent or a person chose survives a round trip (the bullet `-`/`*`/`+`, the ordered
// delimiter `.`/`)`, `*` vs `_` emphasis, `**` vs `__`, the rule's `---`/`***`, the fence's ``` / ~~~ and a soft line
// break kept as a line break). DOM-free: bundled into the LAZY public/doc-editor.js (src/doc-editor-entry.js) and
// node-imported by scripts/test-doc-model.mjs. The verdict itself is src/doc-model.js's (`fidelityVerdict`).
import { schema as base, MarkdownParser, MarkdownSerializer, defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { Schema } from 'prosemirror-model';
import MarkdownIt from 'markdown-it';
import M from '../doc-model.js';

/** A link's href the rendered view may carry: http(s) / mailto / a relative or #fragment target — never javascript:,
 *  data:, vbscript: or any other scheme (re-validated at every render, the viewer's safe-html rule). */
export function safeHref(h) {
  const s = String(h == null ? '' : h).trim();
  if (!s || /[\u0000-\u001f]/.test(s)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!scheme) return s;
  return /^(https?|mailto)$/i.test(scheme[1]) ? s : null;
}
/** An image source the view may load: http(s), a data:image/(png|jpeg|gif|webp) URI, or a path relative to the file. */
export function safeImageSrc(src) {
  const s = String(src == null ? '' : src).trim();
  if (!s || /[\u0000-\u001f]/.test(s)) return null;
  if (/^data:image\/(png|jpe?g|gif|webp);/i.test(s)) return s;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!scheme) return s;
  return /^https?$/i.test(scheme[1]) ? s : null;
}

const N = base.spec.nodes, K = base.spec.marks;
const withAttrs = (spec, extra) => ({ ...spec, attrs: { ...(spec.attrs || {}), ...extra } });
// SNUG (lane artifacts-e2e): a top-level block the source wrote with NO blank line before it ("### Q\nA" — the real-Opus
// FAQ opened raw at its first answer). The parser marks it, the serializer keeps the single newline only where CommonMark
// cannot read the pair back as one block (snugOK); everywhere else — a new block, a pair an edit made — a blank line.
const SNUG = ['paragraph', 'heading', 'blockquote', 'bullet_list', 'ordered_list', 'code_block', 'horizontal_rule'];
const snugAttr = { snug: { default: false } };
const nodesWithSnug = (nodes) => SNUG.reduce((acc, n) => acc.update(n, withAttrs(acc.get(n), snugAttr)), nodes);
export const schema = new Schema({
  nodes: nodesWithSnug(N
    .update('bullet_list', withAttrs(N.get('bullet_list'), { bullet: { default: '-' } }))
    .update('ordered_list', withAttrs(N.get('ordered_list'), { delim: { default: '.' } }))
    .update('horizontal_rule', withAttrs(N.get('horizontal_rule'), { markup: { default: '---' } }))
    .update('code_block', withAttrs(N.get('code_block'), { fence: { default: '```' } }))
    .update('image', { ...N.get('image'), toDOM(node) { const src = safeImageSrc(node.attrs.src); return ['img', { ...(src ? { src } : {}), alt: node.attrs.alt || '', title: node.attrs.title || null }]; } })),
  marks: K
    .update('em', withAttrs(K.get('em'), { markup: { default: '*' } }))
    .update('strong', withAttrs(K.get('strong'), { markup: { default: '**' } }))
    .update('link', { ...K.get('link'), toDOM(mark) { const href = safeHref(mark.attrs.href); return ['a', { ...(href ? { href } : {}), title: mark.attrs.title || null, rel: 'noopener noreferrer nofollow' }]; } }),
});

let srcLines = null; // the source being parsed (parseMd sets it): a list's map swallows its trailing blank line, the text does not
/** The token opens a TOP-LEVEL block (not the first) whose source line above is not blank. */
function snugOf(tokens, i) {
  const tok = tokens[i];
  if (!srcLines || !tok || tok.level !== 0 || !tok.map || tok.map[0] < 1) return false;
  if (!tokens.slice(0, i).some((p) => p.level === 0 && p.map)) return false;
  return String(srcLines[tok.map[0] - 1] || '').trim() !== '';
}
const withSnug = (spec) => ({ ...spec, getAttrs: (tok, tokens, i) => ({ ...(spec.getAttrs ? spec.getAttrs(tok, tokens, i) : {}), snug: snugOf(tokens, i) }) });
function listIsTight(tokens, i) { while (++i < tokens.length) if (tokens[i].type !== 'list_item_open') return tokens[i].hidden; return false; }
const T = defaultMarkdownParser.tokens;
export const parser = new MarkdownParser(schema, MarkdownIt('commonmark', { html: false }), {
  ...T,
  paragraph: withSnug(T.paragraph), heading: withSnug(T.heading), blockquote: withSnug(T.blockquote),
  bullet_list: withSnug({ block: 'bullet_list', getAttrs: (tok, tokens, i) => ({ tight: listIsTight(tokens, i), bullet: tok.markup || '-' }) }),
  ordered_list: withSnug({ block: 'ordered_list', getAttrs: (tok, tokens, i) => ({ order: +tok.attrGet('start') || 1, tight: listIsTight(tokens, i), delim: tok.markup || '.' }) }),
  hr: withSnug({ node: 'horizontal_rule', getAttrs: (tok) => ({ markup: tok.markup || '---' }) }),
  fence: withSnug({ block: 'code_block', getAttrs: (tok) => ({ params: tok.info || '', fence: tok.markup || '```' }), noCloseToken: true }),
  code_block: withSnug({ block: 'code_block', getAttrs: () => ({ fence: '' }), noCloseToken: true }),
  em: { mark: 'em', getAttrs: (tok) => ({ markup: tok.markup || '*' }) },
  strong: { mark: 'strong', getAttrs: (tok) => ({ markup: tok.markup || '**' }) },
});
parser.tokenHandlers.softbreak = (state) => state.addText('\n');   // a source line break stays a line break

/** A bracket the parser read as TEXT stays bare (lane artifacts-e2e): prosemirror-markdown escapes EVERY `[` and `]`, so
 *  an agent draft's placeholders ("**[XX] ms**") came back as "\\[XX\\]" and the whole real-Opus draft opened raw. Bare
 *  is safe where no link can form: a `[` always (its `]` decides), a `]` unless `(`, `[` or `:` follows it (an inline /
 *  full-reference link, a definition). A rich-mode doc holds no definitions (the parser drops them ⇒ such a source
 *  opens raw), so a shortcut `[x]` stays text. Escape PAIRS are walked left to right: an escaped backslash stays one. */
export function bareBrackets(s) {
  return String(s).replace(/\\([\s\S])/g, (m, c, i, all) => (c === '[' || (c === ']' && !/[([:]/.test(all[i + 2] || '')) ? c : m));
}
/** May `cur` follow `prev` with NO blank line and still parse back as the same two blocks? (CommonMark: a paragraph
 *  continues into a paragraph / a list / a quote — lazy lines; an indented code block cannot interrupt a paragraph;
 *  `---` under a paragraph is a setext heading; an ordered list interrupts a paragraph only from 1.) */
export function snugOK(prev, cur) {
  const p = prev.type.name, c = cur.type.name, fenced = (n) => n.type.name === 'code_block' && n.attrs.fence !== '';
  if ((c === 'code_block' && !fenced(cur)) || (p === 'code_block' && !fenced(prev))) return false;
  if (p === 'bullet_list' || p === 'ordered_list' || p === 'blockquote') return c === 'heading';
  if (c === 'paragraph') return p === 'heading' || p === 'code_block' || p === 'horizontal_rule';
  if (p === 'paragraph' && c === 'horizontal_rule') return !String(cur.attrs.markup || '-').startsWith('-');
  if (p === 'paragraph' && c === 'ordered_list') return (cur.attrs.order == null ? 1 : cur.attrs.order) === 1;
  return true;
}
const snugWrap = (fn) => (state, node, parent, index) => {
  if (node.attrs.snug && state.closed && parent && parent.type.name === 'doc' && index > 0 && snugOK(parent.child(index - 1), node)) state.flushClose(1);
  return fn(state, node, parent, index);
};
const S = defaultMarkdownSerializer;
export const serializer = new MarkdownSerializer({
  ...S.nodes,
  text(state, node) {
    state.esc = (str, startOfLine) => bareBrackets(Object.getPrototypeOf(state).esc.call(state, str, startOfLine));
    try { S.nodes.text(state, node); } finally { delete state.esc; }
  },
  bullet_list(state, node) { state.renderList(node, '  ', () => (node.attrs.bullet || '-') + ' '); },
  ordered_list(state, node) {
    const start = node.attrs.order == null ? 1 : node.attrs.order, d = node.attrs.delim === ')' ? ')' : '.';
    const maxW = String(start + node.childCount - 1).length, space = state.repeat(' ', maxW + 2);
    state.renderList(node, space, (i) => { const n = String(start + i); return state.repeat(' ', maxW - n.length) + n + d + ' '; });
  },
  code_block(state, node) {
    const text = node.textContent;
    if (node.attrs.fence === '') { state.wrapBlock('    ', null, node, () => state.text(text, false)); return; }
    const own = node.attrs.fence || '```';
    const runs = (text.match(own[0] === '~' ? /~{3,}/gm : /`{3,}/gm) || []).sort((a, b) => b.length - a.length);
    const fence = runs.length && runs[0].length >= own.length ? runs[0] + own[0] : own;
    state.write(fence + (node.attrs.params || '') + '\n');
    state.text(text, false);
    state.write('\n'); state.write(fence); state.closeBlock(node);
  },
}, {
  ...S.marks,
  em: { open: (_s, m) => m.attrs.markup || '*', close: (_s, m) => m.attrs.markup || '*', mixable: true, expelEnclosingWhitespace: true },
  strong: { open: (_s, m) => m.attrs.markup || '**', close: (_s, m) => m.attrs.markup || '**', mixable: true, expelEnclosingWhitespace: true },
});
for (const n of SNUG) serializer.nodes[n] = snugWrap(serializer.nodes[n]);

export function parseMd(src) { const s = String(src == null ? '' : src); srcLines = s.split('\n'); try { return parser.parse(s); } finally { srcLines = null; } }
export const serializeMd = (doc) => serializer.serialize(doc, { tightLists: true });
/** parse → serialize (null when the parser threw). */
export function roundTrip(src) { try { return serializeMd(parseMd(src)); } catch { return null; } }
/** THE FIDELITY VERDICT for a source: the model's reasons first, then the round trip compared. */
export function docFidelity(src) { const why = M.rawReasons(src); return why.length ? { ok: false, code: why[0], line: 0 } : M.fidelityVerdict(src, roundTrip(src)); }
