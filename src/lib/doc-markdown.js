// THE DOC WINDOW'S MARKDOWN (lane doc-window, 2.369.215; the wheel since lane doc-editor-wheel, 2.369.221) — Tiptap v3
// (ProseMirror underneath; @tiptap/markdown = marked + each extension's own parse/render) behind OUR rules. DOM-free:
// bundled into the LAZY public/doc-editor.js (src/doc-editor-entry.js) and node-imported by scripts/test-doc-model.mjs
// and scripts/test-doc-wheel.mjs. The rules themselves are src/doc-model.js's.
//   · LOAD = BLOCKS: the source is cut into its top-level blocks by the SAME lexer Tiptap parses with (marked: every
//     token's `raw`, concatenated, is the source), each block parsed on its own (the file's link definitions appended)
//     ⇒ every editor node knows its block and the block its lines. A block the core would DROP content from (raw HTML,
//     a construct it cannot carry) becomes a RAW BLOCK — carried as written, shown read-only, edited in Raw.
//   · SAVE = BLOCK PATCHING (doc-model `patchBlocks`): a block whose nodes are untouched keeps its lines byte-identical;
//     an edited block is written by a LINE MERGE (each line the person did not change keeps its source text — the
//     bullet, the `1)`, the `_em_`, the escapes — the changed span spliced in) verified by re-parsing, else by the
//     serializer; a block that would not read back as the editor shows it refuses the save by its line.
import { getSchema, Node as TNode } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { MarkdownManager } from '@tiptap/markdown';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
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

/** A block carried AS WRITTEN (raw HTML, front matter, what the core would drop): read-only in the rich view. */
export const RawBlock = TNode.create({
  name: 'rawBlock', group: 'block', atom: true, selectable: true,
  addAttributes() { return { source: { default: '' } }; },
  parseHTML() { return [{ tag: 'pre[data-raw-block]', getAttrs: (el) => ({ source: el.textContent }) }]; },
  renderHTML({ node }) { return ['pre', { 'data-raw-block': '', class: 'doc-rawblock', contenteditable: 'false' }, node.attrs.source]; },
  renderMarkdown: (node) => (node.attrs && node.attrs.source) || '',
});
const ALIGN = { left: ':---', center: ':---:', right: '---:' };
/** A GFM table without padding (one row = one line, so an edited cell changes its own row only); `|` escaped in a cell. */
function compactTable(node, h) {
  const rows = (node.content || []).map((row) => (row.content || []).map((cell) => (cell.content || []).map((p) => h.renderChildren(p.content || [])).join(' ').replace(/\n+/g, ' ').replace(/(^|[^\\])\|/g, '$1\\|').trim()));
  if (!rows.length) return '';
  const head = (node.content[0].content || []).map((c) => ALIGN[c.attrs && c.attrs.align] || '---');
  const line = (cells) => '| ' + cells.join(' | ') + ' |';
  return [line(rows[0]), line(head), ...rows.slice(1).map(line)].join('\n');
}
const SafeLink = Link.extend({ renderHTML({ HTMLAttributes: a }) { const href = safeHref(a.href); return ['a', { ...(href ? { href } : {}), title: a.title || null, rel: 'noopener noreferrer nofollow' }, 0]; } })
  .configure({ openOnClick: false, autolink: false, linkOnPaste: true, isAllowedUri: (url) => !!safeHref(url) });
/** The document extensions (the window adds its UI-only ones beside them). */
export const extensions = [
  // int223: the browser's spell check underlined code — a code block and inline code opt out; the prose keeps it
  StarterKit.configure({ link: false, codeBlock: { HTMLAttributes: { spellcheck: 'false' } }, code: { HTMLAttributes: { spellcheck: 'false' } } }), SafeLink,
  Table.extend({ renderMarkdown: compactTable }).configure({ resizable: false }), TableRow, TableHeader, TableCell,
  // design 020 T4 (lane doc-editor-ui): Tiptap's task-item NODE VIEW draws `li > label + div` without the `data-type` its
  // renderHTML carries, so `li[data-type=taskItem]` (the row rule) never matched and each checkbox sat on its own line
  TaskList, TaskItem.configure({ nested: true, HTMLAttributes: { 'data-type': 'taskItem' } }),
  Image.extend({ renderHTML({ HTMLAttributes: a }) { const src = safeImageSrc(a.src); return ['img', { ...(src ? { src } : {}), alt: a.alt || '', title: a.title || null }]; } }),
  RawBlock,
];
export const schema = getSchema(extensions);
const mm = new MarkdownManager({ extensions });
export const lexer = (src) => mm.instance.lexer(src);

export const parseMd = (src) => schema.nodeFromJSON(mm.parse(String(src == null ? '' : src)));
export const serializeMd = (doc) => mm.serialize(doc.toJSON ? doc.toJSON() : doc);
/** parse → serialize (null when the parser threw). */
export function roundTrip(src) { try { return serializeMd(parseMd(src)); } catch { return null; } }

const words = (s) => String(s).match(/[\p{L}\p{N}]+/gu) || [];
/** The words of `a` that `b` lacks (a multiset) — a content DROP, not a reformat. */
export function lostWords(a, b) { const m = new Map(); for (const w of words(b)) m.set(w, (m.get(w) || 0) + 1); const out = []; for (const w of words(a)) { const n = m.get(w) || 0; if (n) m.set(w, n - 1); else out.push(w); } return out; }
const hasHtml = (tok) => { if (!tok || typeof tok !== 'object') return false; if (tok.type === 'html') return true; return Object.values(tok).some((v) => Array.isArray(v) ? v.some(hasHtml) : v && typeof v === 'object' && hasHtml(v)); };
const FRONT = /^(---|\+\+\+)[ \t]*\n[\s\S]*?\n\1[ \t]*(\n|$)/;

/** The source's top-level blocks: [{map: [start, end), tok}] (lines, 0-based) + the link-definition lines. */
export function blocksOf(src) {
  const s = String(src), out = [], defs = [];
  const starts = [0]; for (let i = 0; i < s.length; i++) if (s[i] === '\n') starts.push(i + 1);
  const lineAt = (off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo; };
  let off = 0;
  const fm = FRONT.exec(s);
  if (fm) { out.push({ map: [0, lineAt(fm[0].replace(/\n$/, '').length) + 1], tok: { type: 'front_matter' } }); off = fm[0].length; }
  for (const tok of lexer(s.slice(off))) {
    const r = tok.raw || '', lead = r.length - r.replace(/^\n+/, '').length, body = r.slice(lead).replace(/\s+$/, '');
    const a = off + lead; off += r.length;
    if (tok.type === 'space' || !body) continue;
    const map = [lineAt(a), lineAt(a + body.length - 1) + 1];
    if (tok.type === 'def') { for (let i = map[0]; i < map[1]; i++) defs.push(i); continue; }
    out.push({ map, tok });
  }
  return { blocks: out, defs };
}
const raw = (source) => schema.nodes.rawBlock.create({ source });
/** LOAD: → {maps, nodes, owner, doc, refs} — nodes[i] came from block owner[i]; doc = the editor's document. */
export function loadDoc(src) {
  const s = String(src == null ? '' : src), L = s.split('\n');
  const { blocks, defs } = blocksOf(s);
  const refs = defs.length ? '\n\n' + defs.map((i) => L[i]).join('\n') : '';
  const nodes = [], owner = [];
  blocks.forEach(({ map: [a, b], tok }, k) => {
    const text = L.slice(a, b).join('\n').replace(/\s+$/, '');
    let got = [];
    if (tok.type !== 'front_matter' && tok.type !== 'html' && !hasHtml(tok)) {
      try { parseMd(text + refs).forEach((n) => got.push(n)); } catch { got = []; }
      const back = got.length ? serializeMd(schema.topNodeType.create(null, got)) : '';
      if (!got.length || lostWords(text.replace(/\]\[[^\]]*\]/g, ']'), back).length) got = [];
    }
    if (!got.length) got = [raw(text)];
    for (const n of got) { nodes.push(n); owner.push(k); }
  });
  return { maps: blocks.map((b) => b.map), nodes, owner, refs, doc: schema.topNodeType.create(null, nodes.length ? nodes : [schema.nodes.paragraph.create()]) };
}

function lcs(a, b, eq, cap = 4e6) {
  const n = a.length, m = b.length;
  if (n * m > cap) { const pairs = []; for (let i = 0; i < Math.min(n, m) && eq(a[i], b[i]); i++) pairs.push([i, i]); return pairs; }
  const T = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = eq(a[i], b[j]) ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < n && j < m) { if (eq(a[i], b[j])) { pairs.push([i, j]); i++; j++; } else if (T[i + 1][j] >= T[i][j + 1]) i++; else j++; }
  return pairs;
}
/** The editor's top-level nodes against the loaded ones → Map(current index → loaded index) for the untouched. */
export function alignNodes(loaded, doc) { const now = []; doc.forEach((n) => now.push(n)); return { now, match: new Map(lcs(loaded.nodes, now, (x, y) => x.eq(y)).map(([i, j]) => [j, i])) }; }

/** One edited line: the changed span of the serializer's line spliced into the SOURCE line (its markup kept). */
function mergeLine(s, r, n) {
  if (s === r) return n;
  let p = 0; while (p < r.length && p < n.length && r[p] === n[p]) p++;
  let q = 0; while (q < r.length - p && q < n.length - p && r[r.length - 1 - q] === n[n.length - 1 - q]) q++;
  const pairs = lcs([...r], [...s], (x, y) => x === y, 160000), rs = new Map(pairs);
  if (pairs.length < Math.min(r.length, s.length) / 2) return n;
  const e = r.length - q;
  let P = 0; if (p > 0) { if (rs.has(p - 1)) P = rs.get(p - 1) + 1; else { const x = pairs.find(([i]) => i >= p); P = x ? x[1] : s.length; } }
  let E = s.length; if (e < r.length) { if (rs.has(e)) E = rs.get(e); else { const x = [...pairs].reverse().find(([i]) => i < e); E = x ? x[1] + 1 : 0; } }
  return E < P ? n : s.slice(0, P) + n.slice(p, n.length - q) + s.slice(E);
}
/** An edited block: S = its source lines, R = the serializer's text for the block as loaded, N = for it as edited. */
function mergeBlock(S, R, N) {
  const trim = (x) => x.replace(/^\n+|\n+$/g, '').split('\n');
  const r = trim(R), n = trim(N);
  if (r.length !== S.length) return null;
  const pairs = lcs(r, n, (x, y) => x === y), out = [];
  let i = 0, j = 0;
  for (const [pi, pj] of [...pairs, [r.length, n.length]]) {
    const dr = pi - i, dn = pj - j;
    for (let k = 0; k < dn; k++) out.push(dr === dn ? mergeLine(S[i + k], r[i + k], n[j + k]) : n[j + k]);
    if (pi < r.length) out.push(S[pi]);
    i = pi + 1; j = pj + 1;
  }
  return out.join('\n');
}
const sameNodes = (text, refs, want) => { try { const got = []; parseMd(text + refs).forEach((x) => got.push(x)); return got.length === want.length && got.every((x, i) => x.eq(want[i])); } catch { return false; } };
/** SAVE: → {ok, text} | {ok:false, code: 'lossy', line} (a block that would not read back as the editor shows it). */
export function saveDoc(src, loaded, doc) {
  const s = String(src == null ? '' : src), L = s.split('\n');
  const kept = []; doc.forEach((n) => { if (!(n.type.name === 'paragraph' && !n.content.size)) kept.push(n); }); // an empty paragraph writes no markdown (the editor's trailing one)
  doc = doc.type.create(doc.attrs, kept);
  const { now, match } = alignNodes(loaded, doc);
  const intact = new Set();
  loaded.maps.forEach((_, k) => {
    const idx = []; loaded.owner.forEach((o, i) => { if (o === k) idx.push(i); });
    const js = idx.map((i) => { for (const [j, ii] of match) if (ii === i) return j; return null; });
    if (idx.length && js.every((j, q) => j != null && (q === 0 || j === js[q - 1] + 1))) intact.add(k);
  });
  const plan = []; let run = [], gone = [];
  const flush = () => {
    if (!run.length) return;
    const text = serializeMd(schema.topNodeType.create(null, run)).replace(/^\n+|\n+$/g, '');
    let best = text;
    if (gone.length === 1) { // one block edited in place: the line merge first
      const [a, b] = loaded.maps[gone[0]], S = L.slice(a, b).join('\n').replace(/\s+$/, '').split('\n');
      const was = loaded.nodes.filter((_, i) => loaded.owner[i] === gone[0]);
      const merged = was.some((x) => x.type.name === 'rawBlock') ? null : mergeBlock(S, serializeMd(schema.topNodeType.create(null, was)), text);
      if (merged != null && sameNodes(merged, loaded.refs, run)) best = merged;
    }
    if (best === text && !run.every((x) => x.type.name === 'rawBlock') && !sameNodes(text, loaded.refs, run)) { plan.push({ bad: true, at: gone.length ? loaded.maps[gone[0]][0] + 1 : 0 }); run = []; gone = []; return; }
    plan.push({ text: best }); run = []; gone = [];
  };
  let lastKept = -1;
  for (let j = 0; j < now.length; j++) {
    const i = match.get(j), k = i == null ? -1 : loaded.owner[i];
    if (k >= 0 && intact.has(k)) {
      if (loaded.owner.indexOf(k) !== i) continue;
      for (let g = lastKept + 1; g < k; g++) if (!intact.has(g)) gone.push(g);
      flush(); plan.push({ keep: k }); lastKept = k; continue;
    }
    run.push(now[j]);
  }
  for (let g = lastKept + 1; g < loaded.maps.length; g++) if (!intact.has(g)) gone.push(g);
  flush();
  const bad = plan.find((p) => p.bad);
  if (bad) return { ok: false, code: 'lossy', line: bad.at };
  return M.patchBlocks(s, loaded.maps, plan);
}
/** The SOURCE line (1-based) of a position in the editor's document: its block's first line + the lines before the
 *  position inside the block (the block serialized up to the position). */
export function sourceLine(loaded, doc, pos) {
  const { now, match } = alignNodes(loaded, doc);
  let at = 0, j = 0;
  for (; j < now.length; j++) { if (pos <= at + now[j].nodeSize) break; at += now[j].nodeSize; }
  if (j >= now.length) j = now.length - 1;
  let k = -1; for (let x = j; x >= 0 && k < 0; x--) { const i = match.get(x); if (i != null) k = loaded.owner[i]; }
  if (k < 0) return 1;
  const node = now[j], i = match.get(j);
  if (i == null || node.type.name === 'rawBlock') return loaded.maps[k][0] + 1;
  let inner = 0;
  try { const cut = node.cut(0, Math.max(0, pos - at - 1)); inner = Math.max(0, serializeMd(schema.topNodeType.create(null, [cut])).replace(/^\n+|\n+$/g, '').split('\n').length - 1); } catch { inner = 0; }
  const [a, b] = loaded.maps[k];
  return Math.min(a + 1 + inner, Math.max(a + 1, b));
}
/** THE FIDELITY VERDICT for a source: the model's reasons (what the core cannot carry even as blocks), then the load. */
export function docFidelity(src) {
  const why = M.rawReasons(src);
  if (why.length) return { ok: false, code: why[0], line: 0 };
  try { loadDoc(src); return { ok: true }; } catch { return { ok: false, code: 'unparsed', line: 0 }; }
}
