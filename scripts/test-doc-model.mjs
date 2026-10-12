#!/usr/bin/env node
// THE DOC WINDOW'S RULES (lane doc-window, 2.369.215) — fast, PURE + one in-process route leg. Reads src/doc-model.js
// (the fidelity verdict, the comments message, the edit summary, the conflict table), src/lib/doc-markdown.js (the
// round trip over prosemirror-markdown), src/server/doc-engine.js over the real registry (src/server/artifact-registry.js) + src/routes/doc.js
// over stub senders, wiring pins over the window, and a patched copy per rule (scripts/mutant-copy.mjs) turning its
// table red.
//   §1 the fidelity corpus · §2 the save text · §3 the comments message · §4 the edit summary · §5 the conflict table
//   §3b the strip's record (lane doc-comments-synced: commentRows, the one-time mergeComments) · §6 the hub (owner, typing
//   sender, stash, the edit note, the agent bearer refused) · §7 wiring pins · §8 controls
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const M = require('../src/doc-model.js');
const MD = await import(pathToFileURL(path.join(REPO, 'src/lib/doc-markdown.js')).href);

// ── §1 THE FIDELITY RULE ──
console.log('§1 the fidelity verdict over real-shape markdown');
const LOSSLESS = {
  'an agent brief': '# Q3 brief\n\nThe **goal** is *one* thing: ship `doc-window`.\n\n## Scope\n\n- the rendered view\n- comments\n  - quotes ≤ 200\n- the edit note\n\n1. read\n2. edit\n3. save\n\n> A quote that\n> spans two lines.\n\n```js\nconst a = 1;\n```\n\n---\n\nSee [the design](https://example.com/d "Design") and ![chart](img/chart.png).\n',
  'underscore emphasis + star bullets': 'Use __strong__ and _em_ here.\n\n* star list\n* two\n',
  'plus bullets + paren numbers': '+ a\n+ b\n\n1) x\n2) y\n',
  'a wrapped paragraph': 'A paragraph that\nwraps over three\nsource lines.\n',
  'tilde fence + info': '~~~python\nprint(1)\n~~~\n',
  'a loose list': '- a\n\n- b\n',
  'an ordered list from 3': '3. c\n4. d\n',
  'the *** rule': 'a\n\n***\n\nb\n',
  'headings 1–6': '# h1\n\n## h2\n\n### h3\n\n#### h4\n\n##### h5\n\n###### h6\n',
  'CJK prose': '# 简报\n\n这是**重点**，还有*强调*。\n\n- 第一条\n- 第二条\n',
  'no final newline': '# t\n\nend',
  'trailing spaces only differ': '# t   \n\nword\n',
  'snug blocks (the real-Opus FAQ, lane artifacts-e2e)': '# Demo 3 FAQ\n> 草稿\n\n### 改进了什么？\n三点：**[XX] ms**。\n\n### 接入方式？\n- 实时\n- SDK\n\n### 示例\n```js\nx()\n```\n之后一段。\n\n---\n### 尾\n1. 一\n',
  'bracket placeholders (the real-Opus draft, lane artifacts-e2e)': '# Demo 3\n\n首包延迟 **[XX] ms**，快约 **[X] 倍**；见 [文档](https://example.com/docs) 和 [TBD]。\n\n- [ ] not a task list\n- a [[nested]] pair\n',
};
const unedited = (src) => { const ld = MD.loadDoc(src); const r = MD.saveDoc(src, ld, ld.doc); return r.ok && r.text === src; };
for (const [name, src] of Object.entries(LOSSLESS)) {
  const v = MD.docFidelity(src);
  ok(v.ok, `lossless: ${name} ⇒ the rendered editor`, v);
  ok(unedited(src), `lossless: ${name} ⇒ an unedited save writes it byte-identical (block patching)`);
}
// lane doc-editor-wheel: what opened RAW before (a table, HTML, a footnote, front matter, a setext heading, escapes, a
// hard break, a 4-space nest, lazy numbering) opens RICH on the wheel — untouched blocks keep their bytes; raw HTML and
// front matter ride as RAW BLOCKS (carried as written, read-only). Only CRLF and the size cap stay raw reasons.
const RAW = {
  'a GFM table': ['', '# Prices\n\n| item | cost |\n|------|-----:|\n| a    | 1    |\n'],
  'raw HTML': ['rawBlock', 'Some <span title="x">bold</span> words.\n'],
  'paired inline HTML (lane doc-raw-blocks: lossless marks, no raw block)': ['', 'Some <b>bold</b> and <code>x</code> words.\n'],
  'an HTML comment': ['rawBlock', '<!-- note -->\n\ntext\n'],
  'a footnote': ['', 'Claim.[^1]\n\n[^1]: Source.\n'],
  'front matter': ['rawBlock', '---\ntitle: x\n---\n\n# Body\n'],
  'a setext heading': ['', 'Title\n=====\n\ntext\n'],
  'escaped punctuation': ['', 'Price 5 * 3 [x]\n'],
  'a two-space hard break': ['', 'line one  \nline two\n'],
  'four-space nested list': ['', '- a\n    - b\n'],
  'lazy numbering': ['', '1. a\n1. b\n'],
};
for (const [name, [kind, src]] of Object.entries(RAW)) {
  const v = MD.docFidelity(src), ld = MD.loadDoc(src);
  ok(v.ok && unedited(src), `rich now: ${name} ⇒ the rendered editor, an unedited save byte-identical`, v);
  if (kind) ok(ld.nodes.some((n) => n.type.name === 'rawBlock'), `${name} rides as a raw block (carried as written, read-only)`);
}
ok(MD.docFidelity('# t\r\n\r\ntext\r\n').code === 'crlf', 'CRLF line ends ⇒ raw (crlf)');
ok(M.rawReasons('x'.repeat(M.LIMITS.source + 1))[0] === 'too_big', 'a file past 1 MiB opens raw (too_big)');
ok(M.fidelityVerdict('a\nb\n', 'a\nc').line === 2 && M.fidelityVerdict('a', null).code === 'unparsed', 'the whole-document verdict names the first differing line; a parser failure is unparsed (raw)');
{ // an edit in the rendered view changes ONLY its own line on save — the line merge keeps the line's own markup
  const { Transform } = await import('@tiptap/pm/transform');
  const src = LOSSLESS['an agent brief'] + '\n* star [XX] _em_\n* other\n';
  const ld = MD.loadDoc(src);
  let pos = -1, pos2 = -1; ld.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text === 'the edit note') pos = p; if (pos2 < 0 && n.isText && n.text.startsWith('star [XX] ')) pos2 = p; });
  const edited = new Transform(ld.doc).insert(pos + 'the edit note'.length, ld.doc.type.schema.text(' (free)')).insert(pos2 + ' (free)'.length + 'star [XX] '.length, ld.doc.type.schema.text('new ')).doc;
  const after = MD.saveDoc(src, ld, edited).text;
  const a = src.split('\n'), b = String(after).split('\n');
  const diff = a.map((l, i) => (l === b[i] ? null : i)).filter((x) => x !== null);
  ok(a.length === b.length && diff.length === 2 && b[diff[0]] === '- the edit note (free)' && b[diff[1]] === '* star [XX] new _em_', 'two typed edits ⇒ the saved file differs in exactly those two lines, each keeping its bullet, bare brackets and _em_', diff.map((i) => b[i]));
}

// ── §2 the save text ──
console.log('§2 the save text');
ok(M.saveText('a', 'x\n') === 'a\n' && M.saveText('a\n\n', 'x\n') === 'a\n' && M.saveText('a', 'x') === 'a' && M.saveText('a', '') === 'a\n', 'ONE final newline (the source\'s own ending kept when it had none)');

// ── §3 the comments message ──
console.log('§3 the comments message');
const cv = M.commentsBatches('/w/docs/BRIEF.md', [{ quote: 'the  rendered\nview', note: 'say more' }, { quote: '', note: 'add a summary' }, { quote: 'x', note: '   ' }]);
ok(cv.ok && cv.count === 2 && cv.batches.length === 1 && cv.batches[0].text === '[Doc comments] /w/docs/BRIEF.md\n① "the rendered view" — say more\n② add a summary', 'the exact message: header + circled rows, quotes one line, an empty note dropped', cv);
const long = M.commentsBatches('/a.md', [{ quote: 'q'.repeat(500), note: 'n' }]);
ok(long.ok && long.batches[0].text.includes('"' + 'q'.repeat(199) + '…"'), 'a quote is bounded at 200 chars (199 + …)');
const edge = M.commentsBatches('/a.md', Array.from({ length: 20 }, (_, i) => ({ quote: 'q' + i, note: 'n'.repeat(150) })));
ok(edge.ok && edge.batches.length === 1 && M.utf8Len(edge.batches[0].text) <= 4096 && edge.batches[0].text.split('\n').length === 21 && edge.batches[0].text.includes('⑳'), '20 notes under 4 KB ⇒ ONE message ①…⑳, no (k/n)', edge.batches.map((b) => M.utf8Len(b.text)));
ok(M.commentsBatches('/a.txt', [{ note: 'n' }]).code === 'bad_path' && M.commentsBatches('a.md', [{ note: 'n' }]).code === 'bad_path' && M.commentsBatches('/a.md', []).code === 'empty', 'a non-markdown / relative path, no notes ⇒ refused by name');
// HOT FIX 2.369.257 (owner: 18 comments refused "longer than 4 KB — send some of them first"): the bound is per MESSAGE
const C = (n) => String.fromCodePoint(0x245f + n);
const rowsOf = (r) => r.batches.flatMap((b) => b.text.split('\n').slice(1));
const EIGHTEEN = Array.from({ length: 18 }, (_, i) => ({ quote: '引'.repeat(200), note: `第${i + 1}条 ` + '注'.repeat(60) }));
const e18 = M.commentsBatches('/w/docs/设计.md', EIGHTEEN);
const n18 = e18.ok ? e18.batches.length : 0;
ok(e18.ok && n18 >= 3 && e18.count === 18 && e18.clipped === 0, `18 CJK comments with 200-char quotes ⇒ ${n18} messages (≥ 3), none refused`, e18.code);
ok(e18.ok && e18.batches.every((b) => M.utf8Len(b.text) <= 4096 && b.text.split('\n').length - 1 <= 20), 'every message ≤ 4096 bytes UTF-8 and ≤ 20 rows', e18.ok && e18.batches.map((b) => M.utf8Len(b.text)));
ok(e18.ok && e18.batches.every((b, k) => b.text.split('\n')[0] === `[Doc comments] /w/docs/设计.md (${k + 1}/${n18})`), 'each heading names its place: (k/n)');
ok(e18.ok && rowsOf(e18).length === 18 && rowsOf(e18).every((r, i) => r === `${C(i + 1)} "${'引'.repeat(200)}" — 第${i + 1}条 ${'注'.repeat(60)}`), 'the rows across the messages = the input, in order, numbered ①…⑱ continuously');
ok(e18.ok && e18.batches[0].from === 1 && e18.batches.every((b, k) => b.to - b.from + 1 === b.count && (k === 0 || b.from === e18.batches[k - 1].to + 1)) && e18.batches.at(-1).to === 18, 'from/to cover 1…18 with no gap', e18.ok && e18.batches.map((b) => [b.from, b.to]));
const s21 = M.commentsBatches('/a.md', Array.from({ length: 21 }, (_, i) => ({ note: 'n' + i })));
ok(s21.ok && s21.batches.map((b) => b.count).join() === '20,1' && s21.batches[1].text === '[Doc comments] /a.md (2/2)\n(21) n20', '21 short notes ⇒ 2 messages by the row cap; the 21st keeps its number', s21.ok && s21.batches.map((b) => b.text.slice(-30)));
const big = M.commentsBatches('/a.md', Array.from({ length: 5 }, () => ({ quote: 'q'.repeat(200), note: '注'.repeat(1000) })));
ok(big.ok && big.batches.length === 5 && big.clipped === 0 && big.batches.every((b) => M.utf8Len(b.text) <= 4096), '5 notes of 1000 CJK chars ⇒ 5 messages, each whole', big.ok && big.batches.map((b) => M.utf8Len(b.text)));
const giantPath = '/' + '路'.repeat(390) + '.md';
const giant = M.commentsBatches(giantPath, [{ quote: '引'.repeat(200), note: '注'.repeat(1000) }, { note: 'after' }]);
ok(giant.ok && giant.clipped === 1 && giant.batches.every((b) => M.utf8Len(b.text) <= 4096) && /注…/.test(giant.batches[0].text) && M.utf8Len(giant.batches[0].text) > 4000 && rowsOf(giant).at(-1) === '② after', 'one comment bigger than a message ⇒ its note clipped with … to fit (counted), never refused; the next keeps ②', giant.ok && giant.batches.map((b) => M.utf8Len(b.text)));
ok(M.commentsBatches('/a.md', Array.from({ length: 201 }, () => ({ note: 'n' }))).code === 'too_many' && M.commentsBatches('/a.md', Array.from({ length: 200 }, () => ({ note: 'n' }))).batches.length === 10, 'the per-SEND sanity cap is 200 (201 ⇒ too_many; 200 ⇒ 10 messages)');

// ── §3b the strip's record (lane doc-comments-synced — the owner's eighteen comments were in another computer's browser) ──
console.log('§3b the strip\'s record: commentRows bounds it, mergeComments folds a browser\'s old copy in once');
{
  const row = (id, note, extra = {}) => ({ id, quote: '', note, ...extra });
  const ids = (rows) => rows.map((c) => c.id).join(',');
  const s1 = row('s1', 'server one'), s2 = row('s2', 'server two'), l1 = row('l1', 'local one'), l2 = row('l2', 'local two');
  const MERGE = [
    ['empty / empty', [], [], ''],
    ['server only', [s1, s2], [], 's1,s2'],
    ['local only (the upload)', [], [l1, l2], 'l1,l2'],
    ['both: the server\'s order first, local-only rows appended in local order', [s2, s1], [l2, l1], 's2,s1,l2,l1'],
    ['an overlap by id: once, at the server\'s place', [s1, s2], [l1, row('s2', 'stale local text')], 's1,s2,l1'],
    ['a junk server value ⇒ the local rows', 'x', [l1], 'l1'],
  ];
  for (const [name, a, b, want] of MERGE) ok(ids(M.mergeComments(a, b)) === want, `mergeComments ${name} ⇒ [${want}]`, ids(M.mergeComments(a, b)));
  const kept = M.mergeComments([s1, s2], [row('s2', 'stale local text')]);
  ok(kept.length === 2 && kept[1].note === 'server two', 'a shared id keeps the SERVER\'s row (a stale browser copy can only add, never clobber)', kept);
  const big = Array.from({ length: 199 }, (_, i) => row('s' + i, 'n' + i));
  const capped = M.mergeComments(big, [l1, l2]);
  ok(capped.length === M.LIMITS.sendItems && capped.length === 200 && capped[199].id === 'l1', `the cap: ≤ ${M.LIMITS.sendItems} rows (199 + 2 ⇒ 200; the window keeps the left-out row in the browser for room)`, capped.length);
  const junk = M.commentRows([row('a', 'ok', { line: 7, quote: 'q'.repeat(300) }), { id: 'b', note: '   ' }, { note: 'no id' }, row('a', 'dup'), null, row('x'.repeat(65), 'long id'), row('c', 'n'.repeat(1200))]);
  ok(ids(junk) === 'a,c' && junk[0].line === 7 && Array.from(junk[0].quote).length === M.LIMITS.quote && junk[1].note.length === M.LIMITS.note, 'commentRows: each row bounded as commentItem bounds it; no id / an empty note / a repeated id / an id past 64 chars skipped', junk.map((c) => [c.id, c.quote.length, c.note.length]));
  ok(JSON.stringify(M.commentRows([row('a', 'x', { line: 3 })])) === JSON.stringify([{ id: 'a', quote: '', line: 3, note: 'x' }]) && M.commentRows('').length === 0 && M.commentRows(undefined).length === 0, 'a row keeps the strip\'s own shape {id, quote, line?, note}; an absent record (\'\' / undefined) is no rows');
  // int259 seam: a raw-block comment's anchor (lane doc-comment-raw-block) survives the record — else a reload loses its block
  const RAW = [
    ['an HTML block\'s anchor', { pos: 41, line: 9, kind: 'html' }, { pos: 41, line: 9, kind: 'html' }],
    ['a selection inside the source box (offset)', { pos: 41, line: 9, kind: 'html', offset: 13 }, { pos: 41, line: 9, kind: 'html', offset: 13 }],
    ['front matter at the top (pos 0, line 1)', { pos: 0, line: 1, kind: 'front' }, { pos: 0, line: 1, kind: 'front' }],
    ['a stray key dropped, a bad line ⇒ 0, a negative offset dropped', { pos: 5, line: -2, kind: 'markdown', offset: -1, evil: '<img>' }, { pos: 5, line: 0, kind: 'markdown' }],
    ['an unknown kind ⇒ no anchor', { pos: 5, line: 2, kind: 'script' }, null],
    ['a string pos ⇒ no anchor', { pos: '5', line: 2, kind: 'html' }, null],
    ['a negative pos ⇒ no anchor', { pos: -1, line: 2, kind: 'html' }, null],
    ['not an object ⇒ no anchor', 'html', null],
  ];
  for (const [name, raw, want] of RAW) { const got = M.commentRows([row('r', 'x', { line: 9, raw })])[0].raw || null; ok(JSON.stringify(got) === JSON.stringify(want), `commentRows keeps a raw-block comment's anchor: ${name}`, got); }
  ok(JSON.stringify(M.commentRows([row('r', 'x', { line: 9, raw: { pos: 41, line: 9, kind: 'html' } })])[0]) === JSON.stringify({ id: 'r', quote: '', line: 9, raw: { pos: 41, line: 9, kind: 'html' }, note: 'x' }), 'a raw-block row keeps the window\'s own key order {id, quote, line, raw, note}');
  const mig = M.mergeComments([], [row('l', 'from a 2.369.258 browser', { line: 9, raw: { pos: 41, line: 9, kind: 'html' } })]);
  ok(mig.length === 1 && mig[0].raw && mig[0].raw.kind === 'html', 'the one-time migration carries a 2.369.258 browser\'s raw-block comment WITH its anchor', mig);
}

// ── §4 the edit summary ──
console.log('§4 the edit summary');
const B = '# Brief\nintro\n\n## Goals\n- a\n- b\n\n## Risks\n- r\n';
const SUM = [
  [B, B.replace('- b', '- b2'), '+1 −1 lines; sections: Goals'],
  [B, B + '\n## Next\n- n\n', '+3 −0 lines; sections: Next'],
  [B, B.replace('intro', 'intro!').replace('- r', '- r!').replace('- a', '- a!'), '+3 −3 lines; sections: Brief, Goals, Risks'],
  ['top\n# A\nx\n# B\ny\n# C\nz\n# D\nw\n', 'top!\n# A\nx!\n# B\ny!\n# C\nz!\n# D\nw!\n', '+5 −5 lines; sections: (top), A, B (+2 more)'],
  [B, B.replace('## Risks\n- r\n', ''), '+0 −2 lines; sections: Risks'],
  ['no headings\n', 'no headings, edited\n', '+1 −1 lines; sections: (top)'],
  ['```\n# not a heading\n```\n', '```\n# not a heading!\n```\n', '+1 −1 lines; sections: (top)'],
];
for (const [a, b, want] of SUM) { const got = M.editSummary(a, b); ok(got === want, `summary: ${want}`, got); }
ok(M.editSummary(B, B) === '+0 −0 lines', 'no change ⇒ +0 −0 and no sections');
const bigA = Array.from({ length: 3000 }, (_, i) => 'l' + i).join('\n'), bigB = Array.from({ length: 3000 }, (_, i) => (i % 2 ? 'm' : 'l') + i).join('\n');
const t0 = Date.now(); const bs = M.editSummary(bigA, bigB);
ok(bs.startsWith('+1500 −1500 lines') && Date.now() - t0 < 2000, `a 3000-line rewrite past the LCS budget counts by multiset, fast (${Date.now() - t0} ms)`, bs);

// ── §5 the conflict table ──
console.log('§5 the conflict table');
const CT = [
  [{ disk: 10, base: 10, dirty: false }, 'same'], [{ disk: 0, base: 10, dirty: true }, 'same'], [{ disk: 11, base: 10, dirty: false }, 'repaint'],
  [{ disk: 11, base: 10, dirty: true }, 'bar'], [{ disk: 11, base: 10, dirty: true, kept: 11 }, 'kept'], [{ disk: 12, base: 10, dirty: true, kept: 11 }, 'bar'],
];
for (const [i, want] of CT) ok(M.conflictVerdict(i) === want, `conflict ${JSON.stringify(i)} ⇒ ${want}`, M.conflictVerdict(i));
const SV = [[{ disk: 10, base: 10 }, 'write'], [{ disk: 11, base: 10 }, 'ask'], [{ disk: 11, base: 10, confirmed: 11 }, 'write'], [{ disk: 12, base: 10, confirmed: 11 }, 'ask'], [{ disk: 0, base: 10 }, 'write']];
for (const [i, want] of SV) ok(M.saveVerdict(i) === want, `save ${JSON.stringify(i)} ⇒ ${want}`);

// ── §6 the hub over stub senders ──
console.log('§6 the hub: owner, typing sender, stash, the edit note');
const DE = require('../src/server/doc-engine.js');
const AR = require('../src/server/artifact-registry.js');
const quiet = { log() { }, warn() { } };
function world({ sendOk = true, registry = null } = {}) {
  const rec = { sent: [], stashed: [] };
  const activeSessions = new Map([['w1', { mode: 'chat', backend: 'claude', claudeSessionId: 'conv-1' }]]);
  const deliver = { stashFor: (cid, e) => { rec.stashed.push({ cid, ...e }); return { stored: true }; } };
  const sendUserInput = (sid, text, opts) => { rec.sent.push({ sid, text, opts }); const good = typeof sendOk === 'function' ? sendOk(rec.sent.length) : sendOk; return good ? { ok: true, msgId: 'm' + rec.sent.length } : { ok: false, code: typeof sendOk === 'function' ? 'input_rejected' : 'no_session' }; };
  const mine = () => AR.configure({ activeSessions: () => activeSessions, deliver, sessionMeta: null, log: quiet }); // the registry is a module: each world re-points it before a call
  const artifacts = { ownerOf: (a) => (registry ? registry(a) : (mine(), AR.ownerOf(a))), noteEdit: (a) => { rec.note = a; mine(); return AR.noteEdit(a); } };
  return { rec, activeSessions, doc: DE.create({ activeSessions, getDeliver: () => deliver, sendUserInput, artifacts, now: () => 7 }) };
}
const { addressableId } = require('../src/claude-lock-capture.js');
{
  const w = world();
  ok(addressableId(w.activeSessions.get('w1')) === 'conv-1', 'fixture: the chat session addresses conversation conv-1');
  const r = w.doc.comments({ path: '/w/BRIEF.md', from: 'w1', items: [{ quote: 'q', note: 'n' }] });
  ok(r.ok && r.delivered === 'sent' && w.rec.sent.length === 1 && w.rec.sent[0].sid === 'w1' && w.rec.sent[0].opts.origin === 'doc-comment' && w.rec.sent[0].text === '[Doc comments] /w/BRIEF.md\n① "q" — n', 'a live chat: ONE message down THE typing sender as the user\'s own', r);
  ok(w.doc.comments({ path: '/w/BRIEF.md', from: '', items: [{ note: 'n' }] }).code === 'no_owner' && w.doc.comments({ path: '/w/BRIEF.md', from: 'gone', items: [{ note: 'n' }] }).code === 'no_owner', 'no registry row and no live `from` chat ⇒ no_owner by name (never a silent drop)');
  const w2 = world({ sendOk: false });
  const r2 = w2.doc.comments({ path: '/w/BRIEF.md', from: 'w1', items: [{ note: 'later' }] });
  ok(r2.ok && r2.delivered === 'stashed' && w2.rec.stashed[0].cid === 'conv-1' && w2.rec.stashed[0].source === 'doc-comment' && w2.rec.stashed[0].kind === 'peer' && w2.rec.stashed[0].fromName === DE.DOC_COMMENT_FROM && w2.rec.stashed[0].text.endsWith('① later'), 'no live process ⇒ the durable stash under the conversation (source doc-comment)', w2.rec.stashed);
  const w3 = world({ registry: ({ path: p }) => (p === '/w/BRIEF.md' ? { sessionId: 'w1', conversationId: 'conv-1' } : null) });
  ok(w3.doc.ownerOf({ path: '/w/BRIEF.md', from: 'other' }).via === 'registry' && w3.doc.comments({ path: '/w/BRIEF.md', from: '', items: [{ note: 'n' }] }).delivered === 'sent', 'the registry\'s owner wins over the window\'s `from` (and needs none)');
  const e = w.doc.edited({ path: '/w/BRIEF.md', from: 'w1', summary: '+1 −0 lines;\nsections: Goals' });
  ok(e.ok && e.delivered === 'stashed' && w.rec.note.sessionId === 'w1' && w.rec.note.summary === '+1 −0 lines; sections: Goals' && w.rec.sent.length === 1, 'a save ⇒ noteEdit({sessionId, host, path, summary}) — never a typed turn', w.rec.note);
  const st = w.rec.stashed.at(-1);
  ok(st && st.source === 'doc-edit' && st.kind === 'peer' && st.fromName === AR.DOC_EDIT_FROM && st.cid === 'conv-1' && st.text.startsWith('[Doc edit] /w/BRIEF.md: +1 −0 lines; sections: Goals') && w.rec.stashed.length === 1, 'the registry\'s note = ONE stash entry `[Doc edit] <path>: <summary>` (a free next-turn note)', st);
  // a registry-owned row: the save is the registry's user touch (by: user, edits+1) and carries the same ONE note
  const AF = require('../src/artifacts.js');
  const wr = world();
  wr.activeSessions.get('w1')._artifacts = AF.apply({}, { path: '/w/BRIEF.md', op: 'write', by: 'agent', at: 5, id: 't1' }).rows;
  AR.configure({ activeSessions: () => wr.activeSessions, deliver: { stashFor: (cid, e) => { wr.rec.stashed.push({ cid, ...e }); return { stored: true }; } }, sessionMeta: null, log: quiet });
  const real = DE.create({ activeSessions: wr.activeSessions, getDeliver: () => null, sendUserInput: null, artifacts: AR, now: () => 7 });
  const er = real.edited({ path: '/w/BRIEF.md', from: '', summary: '+2 −1 lines; sections: Intro' });
  const row = wr.activeSessions.get('w1')._artifacts[':/w/BRIEF.md'];
  ok(real.ownerOf({ path: '/w/BRIEF.md' }).via === 'registry' && er.ok && er.row === true && row && row.by === 'user' && row.edits === 1 && row.writes === 1 && wr.rec.stashed.length === 1 && wr.rec.stashed[0].text.startsWith('[Doc edit] /w/BRIEF.md: +2 −1 lines; sections: Intro'), 'the registry owns the row ⇒ touch: by user, edits+1, ONE note (no `from` needed)', [er, row, wr.rec.stashed]);
  ok(real.edited({ path: '/w/other.md', from: 'w1', summary: 's' }).ok && wr.rec.stashed.length === 2, 'a `from`-owned file (no row) ⇒ the note alone');
  ok(w.doc.edited({ path: '/w/x.txt', from: 'w1', summary: 's' }).code === 'bad_path' && w.doc.edited({ path: '/w/a.md', from: 'w1', summary: ' ' }).code === 'bad_summary' && w.doc.edited({ path: '/w/a.md', from: '', summary: 's' }).code === 'no_owner', 'the edit note refuses a non-markdown path, an empty summary, no owner — by name');
  // the routes: an agent bearer is refused on every one
  const routes = {}; const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } };
  require('../src/routes/doc.js').registerDocRoutes(app, { doc: w.doc });
  const call = (k, req) => { let out = { status: 200 }; const res = { status(s) { out.status = s; return res; }, json(b) { out.body = b; return res; } }; routes[k]({ headers: {}, query: {}, body: {}, ...req }, res); return out; };
  ok(Object.keys(routes).sort().join() === 'GET /api/doc/owner,POST /api/doc/comments,POST /api/doc/edited', 'three owner routes', Object.keys(routes));
  ok(Object.keys(routes).every((k) => { const o = call(k, { headers: { authorization: 'Bearer vsst_x' } }); return o.status === 403 && o.body.code === 'agent_forbidden'; }), 'an agent\'s vsst_ bearer ⇒ 403 agent_forbidden on every route (a comment / an edit is the user\'s act)');
  const own = call('GET /api/doc/owner', { query: { path: '/w/BRIEF.md', from: 'w1' } });
  const c409 = call('POST /api/doc/comments', { body: { path: '/w/BRIEF.md', items: [{ note: 'n' }] } });
  ok(own.body.owner && own.body.owner.via === 'from' && c409.status === 409 && c409.body.code === 'no_owner', 'owner read; no_owner ⇒ 409 with its code', [own.body, c409]);
}

// ── §7 wiring pins ──
console.log('§7 wiring pins');
const ui = read('src/lib/doc-window-ui.js'), dmd = read('src/lib/doc-markdown.js'), door = read('src/lib/doc-window.js'), eng = read('src/server/doc-engine.js');
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(ui + dmd), 'the window writes no HTML strings — the view is ProseMirror\'s DOM, every word textContent');
ok(/const src = safeImageSrc\(node\.attrs\.src\);\n\s+if \(src\) img\.src = /.test(ui) && /renderHTML\(\{ HTMLAttributes: a \}\) \{ const href = safeHref\(a\.href\);/.test(dmd), 'images are set via .src after safeImageSrc; a link\'s href is re-validated at every render (safeHref)');
const HREF = [['https://a.b/c', true], ['mailto:x@y', true], ['docs/x.md', true], ['#top', true], ['javascript:alert(1)', false], ['JAVASCRIPT:x', false], ['data:text/html,x', false], ['vbscript:x', false], ['java\nscript:x', false]];
ok(HREF.every(([h, w]) => !!MD.safeHref(h) === w), 'safeHref: http(s) / mailto / relative / #fragment only', HREF.filter(([h, w]) => !!MD.safeHref(h) !== w));
const IMG = [['https://a/x.png', true], ['img/x.png', true], ['data:image/png;base64,AA', true], ['data:image/svg+xml,<svg>', false], ['javascript:x', false], ['file:///etc/passwd', false]];
ok(IMG.every(([h, w]) => !!MD.safeImageSrc(h) === w), 'safeImageSrc: http(s), a raster data:image, a relative path (served by /api/file/raw)', IMG.filter(([h, w]) => !!MD.safeImageSrc(h) !== w));
ok(/body: JSON\.stringify\(\{ path, content: text, host: host \|\| undefined \}\)/.test(ui) && (ui.match(/fetch\('\/api\/file\/write'/g) || []).length === 1, 'a save writes THIS window\'s path only, through the existing /api/file/write route (one call site)');
ok(/if \(M\.saveVerdict\(\{ disk, base: S\.base, confirmed: S\.confirmed \}\) === 'ask'\)/.test(ui) && /const v = M\.conflictVerdict\(\{ disk, base: S\.base, dirty: S\.dirty, kept: S\.kept \}\);/.test(ui), 'the window asks the model\'s conflict + save verdicts (never its own copy)');
ok(/const timer = host \? 0 : setInterval\(check, POLL_MS\);/.test(ui) && /const POLL_MS = 2000;/.test(ui) && /window\.addEventListener\('focus', check, \{ signal \}\);/.test(ui) && /onFileChanged\(\(d\) => \{ if \(sameFile\(d, \{ host: host \|\| null, path \}\)\) check\(\); \}, \{ signal \}\);/.test(ui), 'live: a 2 s poll on this machine only, refocus + the file-changed relay everywhere — all on the window\'s signal');
{
  const acorn = require('acorn'); const loose = [];
  (function walk(n) { if (!n || typeof n.type !== 'string') return; if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'addEventListener') { const obj = ui.slice(n.callee.object.start, n.callee.object.end); const third = n.arguments[2] ? ui.slice(n.arguments[2].start, n.arguments[2].end) : ''; if (!/\bsignal\b/.test(third) && !/^(b|x|cancel|add|signal)$/.test(obj)) loose.push(obj + '.addEventListener(' + ui.slice(n.arguments[0].start, n.arguments[0].end)); } for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); } })(acorn.parse(ui, { ecmaVersion: 'latest', sourceType: 'module' }));
  ok(loose.length === 0, 'every window-level listener rides the window\'s AbortController signal (only the transient popover / note / strip-row buttons, which die with their elements, and the abort hook itself go without)', loose);
}
ok(/draftKey = 'doc:' \+ draftId/.test(ui) && /saveDraft\('doc', draftId, comments\.length \? comments\.slice\(\) : ''\)/.test(ui) && /let comments = M\.commentRows\(loadDraft\('doc', draftId\)\);/.test(ui) && /sync\?\.on\('drafts', draftKey, onRecord\);/.test(ui) && /saveDraft, loadDraft, getStateSync, isPhone:/.test(door), 'lane doc-comments-synced: the strip\'s record is the server\'s drafts SyncStore row doc:<host>\\u0001<path> through the composer\'s draft door (handed over by the door), bounded by commentRows, live through the StateSync listener');
ok((ui.match(/localStorage\.(get|set|remove)Item\(oldKey/g) || []).length === 3 && /const merged = M\.mergeComments\(comments, local\);/.test(ui) && /if \(!sync \|\| !\(await sync\.init\('drafts'\)\) \|\| signal\.aborted\) return;/.test(ui), 'the browser\'s old copy is read ONCE after the store\'s snapshot (a loading store is never taken for an empty one), merged by the model, removed (only rows past the cap stay) — never written with the strip');
ok(/drop\(batch\);/.test(ui) && /drop\(batch\.slice\(0, r\.sent\)\);/.test(ui) && /const drop = \(rows\) => \{ const gone = new Set\(rows\.map\(\(c\) => c\.id\)\); comments = comments\.filter\(\(c\) => !gone\.has\(c\.id\)\); saveComments\(true\);/.test(ui), 'Send all removes the rows IT sent (by id — another client\'s row added meanwhile stays) and writes at once; a part-way send removes only what went out');
ok(/const lines = v\.batches\.map\(\(b\) => agentText\(b\.text, \{ kind: 'block', max: M\.LIMITS\.messageBytes \}\)\);/.test(eng), 'each comments message goes through THE belt (peer-text toAgentText) before the sender or the stash');
ok(!/from '(prosemirror|markdown-it|@tiptap)/.test(door) && /import\(new URL\('\/doc-editor\.js', location\.origin\)\.href\)/.test(door), 'the door (main bundle) imports no editor module — the editor is the lazy public/doc-editor.js');
const pkg = JSON.parse(read('package.json'));
const PINS = ['@tiptap/core', '@tiptap/extension-image', '@tiptap/extension-link', '@tiptap/extension-list', '@tiptap/extension-table', '@tiptap/markdown', '@tiptap/pm', '@tiptap/starter-kit']; // lane doc-editor-wheel
ok(PINS.every((p) => /^\d+\.\d+\.\d+$/.test(pkg.dependencies[p] || '')), 'the editor packages are pinned EXACT', PINS.map((p) => p + '@' + pkg.dependencies[p]));
ok(/esbuild src\/doc-editor-entry\.js --bundle --outfile=public\/doc-editor\.js --format=esm/.test(pkg.scripts.build) && /^public\/doc-editor\.js$/m.test(read('.gitignore')), 'npm run build makes public/doc-editor.js (gitignored build output)');

{ // HOT FIX 2.369.257: many messages, in order, through the same door; a failure part-way names what went out
  const want = M.commentsBatches('/w/BRIEF.md', EIGHTEEN).batches.map((b) => b.text);
  const w = world();
  const r = w.doc.comments({ path: '/w/BRIEF.md', from: 'w1', items: EIGHTEEN });
  ok(r.ok && r.delivered === 'sent' && r.messages === want.length && want.length >= 3 && r.sent === 18 && r.count === 18 && w.rec.sent.map((x) => x.text).join('\u0000') === want.join('\u0000') && w.rec.sent.every((x) => x.sid === 'w1' && x.opts.origin === 'doc-comment'), `18 comments ⇒ ${want.length} calls on THE typing sender, in order`, r);
  const w2 = world({ sendOk: false });
  const r2 = w2.doc.comments({ path: '/w/BRIEF.md', from: 'w1', items: EIGHTEEN });
  ok(r2.ok && r2.delivered === 'stashed' && r2.messages === want.length && w2.rec.sent.length === 1 && w2.rec.stashed.map((x) => x.text).join('\u0000') === want.join('\u0000') && w2.rec.stashed.every((x) => x.cid === 'conv-1' && x.source === 'doc-comment'), `no live process ⇒ ${want.length} stash rows, in order`, w2.rec.stashed.length);
  const w3 = world({ sendOk: (n) => n !== 2 });
  const r3 = w3.doc.comments({ path: '/w/BRIEF.md', from: 'w1', items: EIGHTEEN });
  const first = M.commentsBatches('/w/BRIEF.md', EIGHTEEN).batches[0].count;
  ok(!r3.ok && r3.code === 'input_rejected' && r3.sent === first && w3.rec.sent.length === 2 && w3.rec.stashed.length === 0, `the sender refuses message 2 ⇒ fail with sent = ${first} (message 1's count), nothing stashed, message 3 never sent`, r3);
  ok(!('too_long' in DE.STATUS), 'too_long is gone from the engine (a long set is never refused)');
}

// ── §8 patched copies: each rule removed turns its table red ──
console.log('§8 patched-copy controls');
const MUT = mutantCopies('docmodel', REPO);
const msrc = read('src/doc-model.js');
const RULES = [
  ['the round-trip compare removed (every file "lossless")', "for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return { ok: false, code: 'lossy', line: i + 1 };", '', (X) => X.fidelityVerdict('Price 5 * 3\n', 'Price 5 \\* 3').ok === true],
  ['the CRLF rule removed', "  ['crlf', (s) => s.includes('\\r')],", "  ['crlf_off', () => false],", (X) => !X.rawReasons('a\\r\\nb').includes('crlf')],
  ['the packer\'s 4 KB fit removed', ' && utf8Len(commentsText(path, rows, start, of)) <= LIMITS.messageBytes;', ';', (X) => { try { X.commentsBatches('/w/docs/设计.md', EIGHTEEN); return false; } catch (e) { return /past the bound/.test(e.message); } }],
  ['the numbering restarts per message', 'commentsText(path, rows, from, groups.length', 'commentsText(path, rows, 0, groups.length', (X) => X.commentsBatches('/w/docs/设计.md', EIGHTEEN).batches[1].text.split('\n')[1].startsWith('① ')],
  ['the quote bound removed', 'const quote = clip(oneLine(x.quote), LIMITS.quote);', 'const quote = oneLine(x.quote);', (X) => X.commentsBatches('/a.md', [{ quote: 'q'.repeat(500), note: 'n' }]).batches[0].text.includes('q'.repeat(300))],
  ['the dirty check removed (a repaint over unsaved edits)', "  if (!dirty) return 'repaint';", "  return 'repaint';", (X) => X.conflictVerdict({ disk: 11, base: 10, dirty: true }) === 'repaint'],
  ['the merge lets a stale browser copy clobber the server\'s row', 'return commentRows([...s, ...commentRows(local).filter((c) => !have.has(c.id))]);', 'return commentRows([...commentRows(local), ...s]);', (X) => X.mergeComments([{ id: 's', quote: '', note: 'server' }], [{ id: 's', quote: '', note: 'stale' }])[0].note === 'stale'],
  ['the record drops a raw-block comment\'s anchor (the int259 seam undone)', '    const raw = commentRaw(r.raw);\n', '    const raw = null;\n', (X) => !X.commentRows([{ id: 'r', note: 'x', raw: { pos: 1, line: 2, kind: 'html' } }])[0].raw],
  ['the record\'s row cap removed', '    if (out.length >= LIMITS.sendItems) break;\n', '', (X) => X.commentRows(Array.from({ length: 250 }, (_, i) => ({ id: 'r' + i, note: 'n' }))).length === 250],
  ['the save ask removed (a silent overwrite)', "return disk && disk > base && !(confirmed && confirmed >= disk) ? 'ask' : 'write';", "return 'write';", (X) => X.saveVerdict({ disk: 11, base: 10 }) === 'write'],
];
for (const [name, from, to, red] of RULES) {
  ok(msrc.includes(from), `control target present: ${name}`);
  const X = MUT.load('src/doc-model.js', msrc.replace(from, to), name.slice(0, 12));
  ok(red(X), `CONTROL: ${name} ⇒ its table goes red`);
}
for (const c of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: RULES.length })) ok(c.pass, c.name, c.detail);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed)`);
process.exit(fail ? 1 : 0);
