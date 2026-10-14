// THE DOC WINDOW'S WHEEL (lane doc-editor-wheel, 2.369.221) — the measurement harness as a suite, node only (Tiptap's
// MarkdownManager is DOM-free): the 30 fixtures of scripts/fixtures/doc-wheel/ (the shapes agents write) through the
// ADOPTED core with BLOCK PATCHING — an unedited save is byte-identical, one cell / one list item edited keeps every
// untouched line byte-identical (≥ 29/30; the CRLF one is refused by name), nothing is DROPPED (raw HTML and front
// matter ride as raw blocks), the lines an edit reformats are PRINTED; PURE patchBlocks tables; rawReasons + the WHY
// words; the licence census of the wheel's packages PRINTED; 3 patched-copy controls (a whole-document rewrite ⇒ untouched
// lines change; a dropped construct; a reason without a why) each turn the suite's own checks red.
// Lane doc-raw-blocks (2.369.246 — owner "这个会莫名其妙变成源码的问题还没修复"): THE INLINE-HTML MARK TABLE (8 tags ×
// paragraph / list item / table cell ⇒ a mark carrying its tag, byte-identical; <br> spellings; attributes / block tags /
// unmatched / same-tag nested ⇒ raw), fixture 31 (the owner's shape: a table whose cells hold <code>) ⇒ a table, its
// second table (a cell with a BARE <code> placeholder) ⇒ a table since lane doc-table-native (the r2 ruling's raw block retired);
// a 4th control: a mark serialized as backticks ⇒ the table goes red.
// Lane doc-table-native (2.369.267 — owner 2026-10-14 「这下面不是标准的表格吗 为啥显示说是源码？」): A LITERAL TAG IS TEXT —
// a placeholder (`<absent>`, `</sha>`, `<id/>`) or an unpaired open tag (`PR-<code>-nn`) is a text node in a paragraph / an item
// / a cell (doc-window-model literalTag, the reading's own predicate), so fixture 32 (the owner's SHAPE: a 10-column table
// whose cells hold a bare <absent>) and fixture 31's second table are TABLES; the bisection legs (a)–(g) + the minimal
// failing / passing pair; what the schema cannot carry (excess cells, an attributed tag) stays raw; a 5th control: the
// literal rule stubbed ⇒ the trigger leg + fixture 32 go red.
// Run: node scripts/test-doc-wheel.mjs
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath, pathToFileURL } from 'node:url';
const { Transform } = await import('@tiptap/pm/transform');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } return !!c; };
const FX = path.join(ROOT, 'scripts/fixtures/doc-wheel');
const files = fs.readdirSync(FX).filter((f) => f.endsWith('.md')).sort();
const EDIT = ' 编辑';

// ── the licence census (every package the wheel pulls in: MIT / ISC / BSD / Apache only, no copyleft) ──
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const roots = Object.keys(pkg.dependencies || {}).filter((n) => n.startsWith('@tiptap/'));
  const seen = new Map(), q = [...roots];
  while (q.length) { const n = q.shift(); if (seen.has(n)) continue; let p; try { p = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', n, 'package.json'), 'utf8')); } catch { continue; } seen.set(n, p); for (const d of Object.keys({ ...(p.dependencies || {}), ...(p.peerDependencies || {}) })) q.push(d); }
  const by = {}; for (const [n, p] of seen) { const l = typeof p.license === 'string' ? p.license : '?'; (by[l] = by[l] || []).push(n); }
  console.log(`[doc-wheel] licences: ${roots.length} roots → ${seen.size} packages · ${Object.entries(by).map(([l, ns]) => `${l} ${ns.length}`).join(' · ')}`);
  ok(roots.length >= 6 && seen.size >= roots.length, 'package.json names the wheel (@tiptap/*) and node_modules carries it');
  const bad = Object.entries(by).filter(([l]) => !/^(MIT|ISC|BSD-[23]-Clause|Apache-2\.0|0BSD)$/.test(l));
  ok(!bad.length, 'every package of the wheel is MIT / ISC / BSD / Apache: ' + bad.map(([l, ns]) => `${l}: ${ns.join(',')}`).join('; '));
}

/** The first body cell, else the first list item's text, else the first paragraph → the end of that textblock. */
function target(doc) {
  let cell = null, item = null, para = null, rows = 0;
  const endOf = (n, pos) => { let e = null; n.descendants((c, p) => { if (e == null && c.isTextblock) e = pos + 1 + p + 1 + c.content.size; }); return e; };
  doc.descendants((n, pos) => {
    if (n.type.name === 'tableRow') rows++;
    if (n.isTextblock && para == null) para = pos + 1 + n.content.size;
    if (cell == null && rows >= 2 && /^table(Cell|Header)$/.test(n.type.name)) cell = endOf(n, pos);
    if (item == null && /^(listItem|taskItem)$/.test(n.type.name)) item = endOf(n, pos);
  });
  return cell ?? item ?? para;
}
/** The fixtures through a core module pair → the numbers (and the printed lists). */
async function measure(D, M, { print = false } = {}) {
  const R = { refused: 0, same: 0, untouched: 0, oneLine: 0, dropped: [], reformat: [], raw: [], n: 0 };
  for (const f of files) {
    const src = fs.readFileSync(path.join(FX, f), 'utf8');
    R.n++;
    if (src.includes('\r')) { if (D.docFidelity(src).code === 'crlf' && M.patchBlocks(src, [], []).code === 'crlf') R.refused++; continue; }
    const ld = D.loadDoc(src);
    ld.nodes.forEach((n, i) => { if (n.type.name === 'rawBlock') R.raw.push(`${f.slice(0, 2)}:L${ld.maps[ld.owner[i]][0] + 1}`); });
    const plain = D.saveDoc(src, ld, ld.doc);
    if (plain.ok && plain.text === src) R.same++;
    const pos = target(ld.doc), edited = new Transform(ld.doc).insert(pos, ld.doc.type.schema.text(EDIT)).doc;
    const r = D.saveDoc(src, ld, edited);
    const a = src.split('\n'), b = String(r.text || '').split('\n');
    let p = 0; while (p < a.length && a[p] === b[p]) p++;
    let s = 0; while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    const blk = ld.maps.find(([x, y]) => p >= x && p < y) || [p, p + 1];
    const kept = r.ok && b.join('\n').includes(EDIT.trim()) && p >= blk[0] && a.length - s <= blk[1];
    if (kept) R.untouched++;
    const lost = D.lostWords(src, String(r.text || '')).filter((w) => !/^(\d+|g)$/.test(w) || !/\]\[/.test(src));
    if (!r.ok || lost.length) R.dropped.push(`${f}: ${r.ok ? lost.slice(0, 5).join(',') : r.code}`);
    if (kept && a.length - s - p === 1 && b.length - s - p === 1) R.oneLine++;
    else if (kept) R.reformat.push(`${f.slice(0, 2)} ${JSON.stringify(a.slice(p, a.length - s).join('⏎')).slice(0, 70)} → ${JSON.stringify(b.slice(p, b.length - s).join('⏎')).slice(0, 70)}`);
  }
  if (print) {
    console.log(`[doc-wheel] ${R.n} fixtures · unedited save byte-identical ${R.same}/${R.n - R.refused} · one cell / item edited, untouched lines byte-identical ${R.untouched}/${R.n - R.refused} (+${R.refused} CRLF refused by name) · only the edited line changed ${R.oneLine}/${R.n - R.refused}`);
    console.log(`[doc-wheel] carried as written (raw blocks): ${R.raw.join(' ') || 'none'}`);
    console.log(`[doc-wheel] DROPPED: ${R.dropped.length ? R.dropped.join(' | ') : 'none'}`);
    for (const x of R.reformat) console.log(`[doc-wheel] reformatted by an edit: ${x}`);
  }
  return R;
}
const D = await import(pathToFileURL(path.join(ROOT, 'src/lib/doc-markdown.js')).href);
const M = (await import(pathToFileURL(path.join(ROOT, 'src/doc-model.js')).href)).default;
const R = await measure(D, M, { print: true });
const verdicts = (R) => [R.untouched + R.refused >= 29, R.dropped.length === 0, R.same === R.n - R.refused];
ok(R.untouched + R.refused >= 29 && R.refused === 1, `≥ 29/${R.n}: one edit keeps every untouched line byte-identical (${R.untouched} + ${R.refused} refused)`);
ok(R.dropped.length === 0, 'the dropped-construct list is EMPTY');
ok(R.same === R.n - R.refused, 'an unedited save writes the source byte-identical');
ok(R.raw.length >= 2 && R.raw.some((x) => x.startsWith('17')) && R.raw.some((x) => x.startsWith('18')), 'raw HTML (17) and front matter (18) ride as raw blocks (carried as written, read-only)');

// ── THE LOSSLESS INLINE-HTML MARKS (lane doc-raw-blocks, 2.369.246): a paired tag is a mark keeping its spelling ──
const marksOf = (doc) => { const out = []; doc.descendants((n) => { if (n.type.name === 'rawBlock') out.push('RAW'); if (n.type.name === 'table') out.push('TABLE'); if (n.isText) for (const m of n.marks) out.push(m.type.name + ':' + (m.attrs.tag || '')); if (n.type.name === 'htmlBreak') out.push('br:' + n.attrs.tag); }); return out; };
/** The mark table's verdicts over a doc-markdown module (empty = every row holds). */
function markTable(d) {
  const bad = [];
  const TAGS = [['code', 'htmlCode'], ['kbd', 'htmlKbd'], ['sub', 'htmlSub'], ['sup', 'htmlSup'], ['b', 'htmlBold'], ['strong', 'htmlBold'], ['i', 'htmlItalic'], ['em', 'htmlItalic'], ['CODE', 'htmlCode']];
  const CTX = { paragraph: (x) => `Some ${x} here.\n`, 'list item': (x) => `- one ${x} two\n- three\n`, 'table cell': (x) => `| a | b |\n| --- | --- |\n| ${x} | y |\n` };
  for (const [tag, mark] of TAGS) for (const [ctx, wrap] of Object.entries(CTX)) {
    const src = wrap(`<${tag}>x_y 2</${tag}>`.replace('x_y', 'x y')), ld = d.loadDoc(src), got = marksOf(ld.doc), rt = d.roundTrip(src), sv = d.saveDoc(src, ld, ld.doc);
    if (!got.includes(mark + ':' + tag) || got.includes('RAW')) bad.push(`<${tag}> in a ${ctx} ⇒ ${got.join(',')}`);
    if (rt !== src.replace(/\n$/, '')) bad.push(`<${tag}> in a ${ctx}: round trip ${JSON.stringify(rt)}`);
    if (!sv.ok || sv.text !== src) bad.push(`<${tag}> in a ${ctx}: an unedited save`);
  }
  for (const br of ['<br>', '<br/>', '<br />']) for (const [ctx, wrap] of Object.entries(CTX)) {
    const src = wrap(`x${br}y`), got = marksOf(d.loadDoc(src).doc), rt = d.roundTrip(src);
    if (!got.includes('br:' + br) || got.includes('RAW') || rt !== src.replace(/\n$/, '')) bad.push(`${br} in a ${ctx} ⇒ ${got.join(',')} ${JSON.stringify(rt)}`);
  }
  for (const [why, src] of [['attributes', 'a <code class="k">x</code> b\n'], ['a block tag', '<details>\n<summary>s</summary>\n</details>\n'], ['a div', 'a <div>x</div> b\n'], ['a span', 'a <span>x</span>\n'],
    ['an unmatched close', 'a </b> b\n'], ['same-tag nested', '<b>a <b>b</b> c</b>\n'], ['spaced content', 'a <code> x </code>\n'], ['empty', 'a <b></b> b\n'],
    ['emphasis across the close', '*a <b>b* c</b>\n'], ['mixed-case ends', 'a <b>x</B>\n'], ['a cell with an attribute tag', '| a |\n| --- |\n| <sup id="n">1</sup> |\n']])
    if (!marksOf(d.loadDoc(src).doc).includes('RAW')) bad.push(`${why} is not a raw block`);
  // nested tags come back in the schema's mark order (`<b><code>` ⇒ `<code><b>`, as `**_x_**` does) — an unedited save keeps
  // the bytes, and an edit inside keeps the SOURCE order (the line merge splices only the typed span)
  const nest = 'a <b><code>x</code></b> and [<kbd>k</kbd>](https://e.com)\n', nl = d.loadDoc(nest), ng = marksOf(nl.doc);
  let at = -1; nl.doc.descendants((n, p) => { if (at < 0 && n.isText && n.text === 'x') at = p + 1; });
  const ed = d.saveDoc(nest, nl, new Transform(nl.doc).insert(at, nl.doc.type.schema.text('Z', nl.doc.nodeAt(at - 1).marks)).doc);
  if (!ng.includes('htmlBold:b') || !ng.includes('htmlCode:code') || !ng.includes('link:') || !ng.includes('htmlKbd:kbd') || d.saveDoc(nest, nl, nl.doc).text !== nest || !ed.ok || ed.text !== nest.replace('x</code>', 'xZ</code>')) bad.push('nested tags / a tag in a link: ' + ng.join(',') + ' ' + JSON.stringify(ed));
  return bad;
}
const mt = markTable(D);
ok(mt.length === 0, 'THE INLINE-HTML MARKS: 8 tags (+ upper case) × paragraph / list item / table cell ⇒ a mark carrying the tag as written, round trip + unedited save byte-identical; <br> <br/> <br /> kept; attributes / block tags / an unmatched close / same-tag nested / spaced / emphasis across the close ⇒ a raw block: ' + mt.slice(0, 4).join(' | '));
const kindsOf = (doc) => { const out = []; doc.forEach((n) => out.push(n.type.name)); return out.join(','); };
const textsOf = (doc) => { let t = ''; doc.descendants((n) => { if (n.isText) t += n.text + '¦'; }); return t; };
{
  const F31 = fs.readFileSync(path.join(FX, '31-table-inline-html.md'), 'utf8'), l31 = D.loadDoc(F31), g = marksOf(l31.doc);
  ok(!R.raw.some((x) => x.startsWith('31')) && g.filter((x) => x === 'TABLE').length === 2 && !g.includes('RAW') && textsOf(l31.doc).includes('STEP-<code>-nn') && ['htmlCode:code', 'htmlKbd:kbd', 'htmlSup:sup', 'br:<br>', 'htmlBold:b', 'htmlSub:sub', 'htmlItalic:i', 'htmlItalic:em', 'htmlBold:strong', 'code:', 'bold:'].every((m) => g.includes(m)),
    'fixture 31 (the owner\'s shape: a GFM table whose cells hold <code> / <kbd> / <sup> / <br> beside backticks and bold) ⇒ a TABLE in the editor; its second table (a cell with a BARE <code> placeholder) is a TABLE too — the unpaired tag is its text (lane doc-table-native; the r2 raw block retired)', [...new Set(g)]);
}

// ── A LITERAL TAG IS TEXT (lane doc-table-native, 2.369.267 — owner 2026-10-14 「这下面不是标准的表格吗 为啥显示说是源码？」: an
//    agent's 10-column table whose "paper value" cells held a bare <absent> rode as a raw block — a chip and a read-only table) ──
/** The literal-tag table's verdicts over a doc-markdown module (empty = every row holds). */
function literalTable(d) {
  const bad = [];
  const LIT = [['a placeholder', '<absent>'], ['a closing placeholder', '</sha>'], ['a self-closed placeholder', '<id/>'], ['a hyphenated placeholder', '<my-case>'], ['an unpaired element tag', 'PR-<code>-nn'], ['a close inside a code span', '<b>x `</b>` y']];
  const CTX = { paragraph: (x) => `Some ${x} here.\n`, 'list item': (x) => `- one ${x} two\n- three\n`, 'table cell': (x) => `| a | b |\n| --- | --- |\n| ${x} | y |\n`, heading: (x) => `## A ${x} title\n` };
  for (const [why, x] of LIT) for (const [ctx, wrap] of Object.entries(CTX)) {
    const src = wrap(x), ld = d.loadDoc(src), tag = /<\/?[A-Za-z][^>]*>/.exec(x)[0], sv = d.saveDoc(src, ld, ld.doc);
    if (marksOf(ld.doc).includes('RAW')) { bad.push(`${why} in a ${ctx} ⇒ a raw block`); continue; }
    if (!textsOf(ld.doc).includes(tag)) bad.push(`${why} in a ${ctx}: the text lacks ${tag}`);
    if (!sv.ok || sv.text !== src) bad.push(`${why} in a ${ctx}: an unedited save`);
    let at = -1; ld.doc.descendants((n, p) => { if (at < 0 && n.isText && n.text.includes(tag)) at = p + n.text.indexOf(tag) + tag.length; });
    const ed = at < 0 ? null : d.saveDoc(src, ld, new Transform(ld.doc).insert(at, ld.doc.type.schema.text('Z')).doc);
    if (!ed || !ed.ok || ed.text !== src.replace(tag, tag + 'Z')) bad.push(`${why} in a ${ctx}: an edit beside it ⇒ ${JSON.stringify(ed && (ed.text || ed.code))}`);
  }
  return bad;
}
const H10 = '| row | case | field | money | gold | value | readers | agreement | reason | quote |', A10 = '|---|---|---|---|---|---|---|---|---|---|';
const row = (cells) => '| ' + cells.join(' | ') + ' |', T10 = (...rows) => [H10, A10, ...rows].join('\n') + '\n';
const R10 = ['R1', 'harbor-lease', '`terms.deposit_months.count`', 'yes', '3', '2', '3/3', '1.0/0.9', 'the gold copied the draft', '§4 "two (2) months" (source.txt)'];
const cellAt = (i, v) => row(R10.map((c, k) => (k === i ? v : c)));
/** The bisection on the owner's SHAPE: [hypothesis, source, the editor's top-level nodes wanted]. */
const BISECT = [
  ['(a) a bare <case> in a code span in the paragraph before', 'Paths are `api/golden_cases/<case>/source.txt`.\n\n' + T10(row(R10)), 'paragraph,table'],
  ['(a) the same, no blank line before the table', 'Paths are `api/golden_cases/<case>/source.txt`.\n' + T10(row(R10)), 'paragraph,table'],
  ['(b) underscores in a code span in a cell', T10(cellAt(2, '`unsupported.money_bearing.length`')), 'table'],
  ['(c) " § ( … $ in a cell', T10(cellAt(9, '§7.3 "A late fee of US $25.00 applies (after ten days)" … §7.4 "none"')), 'table'],
  ['(d) 10 columns, no trailing pipe', T10(row(R10).replace(/ \|$/, '')), 'table'],
  ['(e) alignment rows :-- :-: --:', [H10, '|:--|:-:|--:|---|:---|---:|:---:|---|---|---|', row(R10)].join('\n') + '\n', 'table'],
  ['(f) a row with fewer cells than the header', T10(row(R10), row(['R2', 'short'])), 'table'],
  ['(g) a bare <absent> in a cell — THE TRIGGER', T10(cellAt(5, '<absent>')), 'table'],
];
const STAYS_RAW = [['excess cells (GFM drops them: the editor would lose words)', T10(row([...R10, 'extra words']))], ['an attributed tag in a cell', T10(cellAt(5, '<span class="k">2</span>'))]];
function bisect(d) {
  const bad = [];
  for (const [why, src, want] of BISECT) { const got = kindsOf(d.loadDoc(src).doc); if (got !== want) bad.push(`${why} ⇒ ${got}`); }
  for (const [why, src] of STAYS_RAW) if (!marksOf(d.loadDoc(src).doc).includes('RAW')) bad.push(`${why} is not a raw block`);
  return bad;
}
const F32 = fs.readFileSync(path.join(FX, '32-table-placeholder-cells.md'), 'utf8');
{
  const lt = literalTable(D);
  ok(lt.length === 0, 'A LITERAL TAG IS TEXT: <absent> / </sha> / <id/> / <my-case> / an unpaired PR-<code>-nn / a <b> whose close sits in a code span × paragraph / list item / table cell / heading ⇒ the tag as text (no raw block), the unedited save byte-identical, a letter typed after it saves as `<tag>Z` (the tag as written): ' + lt.join('; '));
  for (const [why, src] of BISECT) console.log(`[doc-wheel] bisect ${why} ⇒ ${kindsOf(D.loadDoc(src).doc)}`);
  const bs = bisect(D);
  ok(bs.length === 0, 'THE BISECTION on the owner\'s shape: (a) a <case> code span in the paragraph before (blank line or not), (b) underscores in a cell\'s code span, (c) quotes / § / ( / … / $, (d) 10 columns + no trailing pipe, (e) alignment rows, (f) a short row, (g) a bare <absent> in a cell ⇒ each a native table; excess cells / an attributed tag stay raw: ' + bs.join('; '));
  const MIN_FAIL = '| a | b |\n|---|---|\n| 1 | <absent> |\n', MIN_PASS = '| a | b |\n|---|---|\n| 1 | `<absent>` |\n';
  ok(kindsOf(D.loadDoc(MIN_FAIL).doc) === 'table' && kindsOf(D.loadDoc(MIN_PASS).doc) === 'table', 'the minimal pair: | 1 | <absent> | (a raw block before this lane) and | 1 | `<absent>` | ⇒ both a table');
  const l32 = D.loadDoc(F32), k32 = kindsOf(l32.doc);
  ok(k32 === 'heading,paragraph,heading,paragraph,table,paragraph' && !marksOf(l32.doc).includes('RAW') && (textsOf(l32.doc).match(/<absent>/g) || []).length === 2 && !R.raw.some((x) => x.startsWith('32')), 'fixture 32 (the owner\'s SHAPE: 10 columns, two cells holding a bare <absent>, code spans with underscores, a long quoted last column) ⇒ a native TABLE, both <absent> as text, no raw block', k32);
  let at = -1; l32.doc.descendants((n, p) => { if (at < 0 && n.isText && n.text === '<absent>') at = p + n.nodeSize; });
  const ed = D.saveDoc(F32, l32, new Transform(l32.doc).insert(at, l32.doc.type.schema.text('Ⓧ')).doc), a = F32.split('\n'), b = String(ed.text || '').split('\n'), diff = a.map((l, i) => (l === b[i] ? null : i)).filter((x) => x != null);
  ok(ed.ok && a.length === b.length && diff.length === 1 && b[diff[0]] === a[diff[0]].replace('| <absent> |', '| <absent>Ⓧ |') && /^\| R007 \|/.test(a[diff[0]]), 'fixture 32: a letter typed after the first <absent> + save ⇒ exactly that row\'s line changes, the tag kept as written', { diff, line: diff.length ? b[diff[0]].slice(0, 120) : ed.code });
}

// ── patchBlocks tables (PURE) ──
const P = (src, maps, plan) => M.patchBlocks(src, maps, plan).text;
const S1 = '# A\n\npara one\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n[r]: http://x\n\ntail\n', M1 = [[0, 1], [2, 3], [4, 7], [10, 11]];
const all = [{ keep: 0 }, { keep: 1 }, { keep: 2 }, { keep: 3 }];
ok(P(S1, M1, all) === S1, 'every block kept ⇒ the source byte-identical (the definition line between blocks kept)');
ok(P(S1, M1, [{ keep: 0 }, { keep: 1 }, { text: '| a | b |\n| - | - |\n| 1 | 2 编辑 |' }, { keep: 3 }]) === S1.replace('| 1 | 2 |', '| 1 | 2 编辑 |'), 'a table edit touches only its lines');
ok(P(S1, M1, [{ text: 'A2' }, { keep: 1 }, { keep: 2 }, { keep: 3 }]) === S1.replace('# A', 'A2'), 'edit at the start');
ok(P(S1, M1, [{ keep: 0 }, { keep: 1 }, { keep: 2 }, { text: 'tail2' }]) === S1.replace('tail', 'tail2'), 'edit at the end');
ok(P(S1, M1, [{ keep: 0 }, { text: 'P' }, { keep: 2 }, { text: 'T' }]) === S1.replace('para one', 'P').replace('tail', 'T'), 'two blocks edited');
ok(P(S1, M1, [{ keep: 0 }, { keep: 2 }, { keep: 3 }]) === '# A\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n[r]: http://x\n\ntail\n', 'delete in the middle (one blank run goes with it)');
ok(P(S1, M1, [{ keep: 1 }, { keep: 2 }, { keep: 3 }]) === S1.slice(5), 'delete at the start');
ok(P(S1, M1, [{ keep: 0 }, { keep: 1 }, { keep: 2 }]) === '# A\n\npara one\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n[r]: http://x\n', 'delete at the end (the definition stays)');
ok(P(S1, M1, [{ text: 'NEW' }, ...all]) === 'NEW\n\n' + S1, 'insert at the start');
ok(P(S1, M1, [{ keep: 0 }, { keep: 1 }, { text: 'NEW' }, { keep: 2 }, { keep: 3 }]) === S1.replace('para one\n', 'para one\n\nNEW\n'), 'insert in the middle');
ok(P(S1, M1, [...all, { text: 'NEW' }]) === S1.replace(/\n$/, '\n\nNEW\n'), 'insert at the end');
ok(P(S1, M1, [{ keep: 0 }, { text: 'para' }, { text: 'one' }, { keep: 2 }, { keep: 3 }]) === S1.replace('para one', 'para\n\none'), 'a block split in two');
ok(P('a\nb\n\nc\n', [[0, 2], [3, 4]], [{ text: 'a b c' }]) === 'a b c\n', 'two blocks merged into one');
ok(P('### Q\nA\n', [[0, 1], [1, 2]], [{ keep: 0 }, { text: 'B' }]) === '### Q\n\nB\n', 'a snug neighbour gets a blank line before new text');
ok(M.patchBlocks('a\r\nb\r\n', [[0, 1]], [{ keep: 0 }]).code === 'crlf', 'a CRLF source is refused by name');
ok(M.patchBlocks(S1, M1, [{ keep: 2 }, { keep: 1 }]).code === 'order' && M.patchBlocks(S1, [[0, 3], [2, 4]], []).code === 'overlap', 'a plan out of order / overlapping maps refused by name');

// ── rawReasons: the new list + the WHY ──
ok(JSON.stringify(M.rawReasons('a\r\nb')) === '["crlf"]' && M.rawReasons('x'.repeat(M.LIMITS.source + 1))[0] === 'too_big', 'rawReasons = CRLF and the size cap only');
for (const [name, src] of [['a table', '| a | b |\n| - | - |\n| 1 | 2 |\n'], ['raw HTML', '<details>\n<summary>x</summary>\n</details>\n'], ['a footnote', 'x[^1]\n\n[^1]: y\n'], ['front matter', '---\na: 1\n---\n\n# T\n'], ['a setext heading', 'T\n===\n']])
  ok(!M.rawReasons(src).length && D.docFidelity(src).ok, `${name} opens RICH now (carried by the wheel or as a raw block)`);
for (const code of ['crlf', 'too_big', 'unparsed']) ok(typeof M.RAW_WHY[code] === 'string' && M.RAW_WHY[code].length > 20, `the reason ${code} says WHY in plain words`);
const ui = fs.readFileSync(path.join(ROOT, 'src/lib/doc-window-ui.js'), 'utf8');
for (const code of Object.keys(M.RAW_WHY)) ok(ui.includes(`${code}: t('${M.RAW_WHY[code]}')`), `the chip says the WHY of ${code} in the model's words (a literal t() for the dictionaries)`);

// ── 3 patched-copy controls: each mutant turns the suite's own verdicts red ──
const mutant = async (label, file, from, to, want) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-mut-'));
  fs.mkdirSync(path.join(dir, 'src/lib'), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  for (const f of ['src/doc-model.js', 'src/lib/doc-markdown.js', 'src/lib/doc-window-model.js']) { let t = fs.readFileSync(path.join(ROOT, f), 'utf8'); if (f === file) { ok(t.includes(from), `control "${label}": the needle is in ${f}`); t = t.replace(from, to); } fs.writeFileSync(path.join(dir, f), t); }
  try {
    const d = await import(pathToFileURL(path.join(dir, 'src/lib/doc-markdown.js')).href + '?m=' + label.length);
    const m = (await import(pathToFileURL(path.join(dir, 'src/doc-model.js')).href)).default;
    ok(want(d, m), `control "${label}" goes red`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
await mutant('whole-document rewrite', 'src/lib/doc-markdown.js', '  return M.patchBlocks(s, loaded.maps, plan);', '  return { ok: true, text: serializeMd(doc) + "\\n" };', async (d, m) => !verdicts(await measure(d, m))[0]);
await mutant('a dropped construct', 'src/lib/doc-markdown.js', "if (tok.type !== 'front_matter' && tok.type !== 'html' && !hasHtml(tok)) {", "if (tok.type !== 'front_matter') { if (0) hasHtml(tok);", async (d, m) => !verdicts(await measure(d, m))[1]);
await mutant('a mark serialized as backticks', 'src/lib/doc-markdown.js', 'return `<${tag}>${h.renderChildren(node)}</${tag}>`;', "return '`' + h.renderChildren(node) + '`';", async (d) => markTable(d).length > 0);
await mutant('the literal rule stubbed', 'src/lib/doc-markdown.js', '  const lit = literalTag(src);', '  const lit = null;', async (d) => bisect(d).some((x) => x.startsWith('(g)')) && marksOf(d.loadDoc(F32).doc).includes('RAW'));
await mutant('a close inside a code span counted', 'src/lib/doc-window-model.js', ".test(s.slice(m[0].length).replace(CODE_SPANS, ''))", '.test(s.slice(m[0].length))', async (d) => literalTable(d).some((x) => x.startsWith('a close inside a code span')));
await mutant('a reason without a why', 'src/doc-model.js', "  crlf: 'it uses Windows", "  crlf_: 'it uses Windows", async (d, m) => !(typeof m.RAW_WHY.crlf === 'string' && m.RAW_WHY.crlf.length > 20));

console.log(`\ntest-doc-wheel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
