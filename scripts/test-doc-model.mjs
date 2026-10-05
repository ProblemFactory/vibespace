#!/usr/bin/env node
// THE DOC WINDOW'S RULES (lane doc-window, 2.369.215) — fast, PURE + one in-process route leg. Reads src/doc-model.js
// (the fidelity verdict, the comments message, the edit summary, the conflict table), src/lib/doc-markdown.js (the
// round trip over prosemirror-markdown), src/server/doc-engine.js over the real registry (src/server/artifact-registry.js) + src/routes/doc.js
// over stub senders, wiring pins over the window, and a patched copy per rule (scripts/mutant-copy.mjs) turning its
// table red.
//   §1 the fidelity corpus · §2 the save text · §3 the comments message · §4 the edit summary · §5 the conflict table
//   §6 the hub (owner, typing sender, stash, the edit note, the agent bearer refused) · §7 wiring pins · §8 controls
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
for (const [name, src] of Object.entries(LOSSLESS)) {
  const v = MD.docFidelity(src);
  ok(v.ok, `lossless: ${name} ⇒ the rendered editor`, v);
}
ok(MD.roundTrip(LOSSLESS['an agent brief']) + '\n' === LOSSLESS['an agent brief'], 'the supported subset round-trips BYTE-EQUAL (headings, emphasis, code, links, nested lists, quotes, fences, rules, images)');
const RAW = {
  'a GFM table': ['table', '# Prices\n\n| item | cost |\n|------|-----:|\n| a    | 1    |\n'],
  'raw HTML': ['html', 'Some <b>bold</b> words.\n'],
  'an HTML comment': ['html', '<!-- note -->\n\ntext\n'],
  'a footnote': ['footnote', 'Claim.[^1]\n\n[^1]: Source.\n'],
  'front matter': ['front_matter', '---\ntitle: x\n---\n\n# Body\n'],
  'CRLF line ends': ['crlf', '# t\r\n\r\ntext\r\n'],
  'a setext heading': ['setext', 'Title\n=====\n\ntext\n'],
  'escaped punctuation': ['lossy', 'Price 5 * 3 [x]\n'],
  'a two-space hard break': ['lossy', 'line one  \nline two\n'],
  'four-space nested list': ['lossy', '- a\n    - b\n'],
  'lazy numbering': ['lossy', '1. a\n1. b\n'],
};
{ // bare brackets never MAKE a link, a reference or a definition the text did not have (parse → serialize → parse = the same doc)
  const same = (src) => { const d = MD.parseMd(src); const again = MD.parseMd(MD.serializeMd(d)); return d.eq(again); };
  for (const src of ['\\[a\\](b) stays text\n', '\\[a\\]: http://x stays text\n', '\\[a\\]\\[b\\] stays text\n', 'a \\\\[b] backslash\n', '[l](http://x) then \\[t\\](u)\n', '![i](p.png) \\[x\\]\n'])
    ok(same(src), `brackets: ${JSON.stringify(src)} ⇒ the same doc after a save (no link born)`, MD.serializeMd(MD.parseMd(src)));
  ok(MD.bareBrackets('\\[XX\\] ms') === '[XX] ms' && MD.bareBrackets('\\[a\\](b)') === '[a\\](b)' && MD.bareBrackets('\\[a\\]: x') === '[a\\]: x' && MD.bareBrackets('\\\\\\[') === '\\\\[', 'bareBrackets: bare unless (, [ or : follows the ]; an escaped backslash stays one', [MD.bareBrackets('\\\\\\[')]);
  { // an edit that makes an UNSAFE snug pair (a paragraph under a paragraph) writes a blank line: never one merged block
    const { EditorState } = await import('prosemirror-state');
    const d = MD.parseMd('# H\nP1\n\n## H2\nP2\n');
    ok(d.child(1).attrs.snug === true && d.child(2).attrs.snug === false && d.child(3).attrs.snug === true, 'the parser marks a block with no blank line above it (snug) — and only those', d.toJSON().content.map((n) => n.attrs.snug));
    let from = -1, to = -1; d.forEach((n, off) => { if (n.type.name === 'heading' && n.attrs.level === 2) { from = off; to = off + n.nodeSize; } });
    const st = EditorState.create({ doc: d });
    const out = MD.serializeMd(st.apply(st.tr.delete(from, to)).doc);
    ok(out === '# H\nP1\n\nP2' && MD.parseMd(out).childCount === 3, 'H2 deleted ⇒ P2 (snug) follows P1: a blank line is written, the two paragraphs stay two', out);
    const pair = (a, b) => MD.snugOK(MD.parseMd(a).child(0), MD.parseMd(b).child(0));
    ok(pair('# h', 'p') && pair('p', '# h') && pair('p', '- x') && pair('p', '> q') && pair('p', '***') && pair('```\nx\n```', 'p') && !pair('p', 'p') && !pair('p', '---') && !pair('p', '3. x') && !pair('- x', 'p') && !pair('> q', 'p') && !pair('- x', '- y') && !pair('p', '    code'), 'snugOK: only the pairs CommonMark reads back as two blocks');
  }
  ok(MD.docFidelity('a \\[b\\] c\n').code === 'lossy', 'a source that ESCAPES its brackets now opens raw (its save would drop the backslashes) — the trade for agent placeholders');
}
for (const [name, [code, src]] of Object.entries(RAW)) {
  const v = MD.docFidelity(src);
  ok(!v.ok && v.code === code, `raw: ${name} ⇒ ${code}`, v);
}
ok(M.rawReasons('```\n| a | b |\n|---|---|\n<b>x</b>\n```\n').length === 0, 'a table / a tag INSIDE a fenced block is code, not formatting (no raw reason)');
ok(M.rawReasons('x'.repeat(M.LIMITS.source + 1))[0] === 'too_big', 'a file past 1 MiB opens raw (too_big)');
ok(M.fidelityVerdict('a\nb\n', 'a\nc').line === 2 && M.fidelityVerdict('a', null).code === 'unparsed', 'the verdict names the first differing line; a parser failure is unparsed (raw)');
{ // an edit in the rendered view changes ONLY its own line on save
  const src = LOSSLESS['an agent brief'];
  const doc = MD.parseMd(src);
  let pos = -1; doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text === 'the edit note') pos = p; });
  const { EditorState } = await import('prosemirror-state');
  const st = EditorState.create({ doc });
  const after = M.saveText(MD.serializeMd(st.apply(st.tr.insertText(' (free)', pos + 'the edit note'.length)).doc), src);
  const a = src.split('\n'), b = after.split('\n');
  const diff = a.map((l, i) => (l === b[i] ? null : i)).filter((x) => x !== null);
  ok(a.length === b.length && diff.length === 1 && b[diff[0]] === '- the edit note (free)', 'a typed edit ⇒ the saved file differs in exactly that line', diff);
}

// ── §2 the save text ──
console.log('§2 the save text');
ok(M.saveText('a', 'x\n') === 'a\n' && M.saveText('a\n\n', 'x\n') === 'a\n' && M.saveText('a', 'x') === 'a' && M.saveText('a', '') === 'a\n', 'ONE final newline (the source\'s own ending kept when it had none)');

// ── §3 the comments message ──
console.log('§3 the comments message');
const cv = M.commentsVerdict('/w/docs/BRIEF.md', [{ quote: 'the  rendered\nview', note: 'say more' }, { quote: '', note: 'add a summary' }, { quote: 'x', note: '   ' }]);
ok(cv.ok && cv.count === 2 && cv.text === '[Doc comments] /w/docs/BRIEF.md\n① "the rendered view" — say more\n② add a summary', 'the exact message: header + circled rows, quotes one line, an empty note dropped', cv.text);
const long = M.commentsVerdict('/a.md', [{ quote: 'q'.repeat(500), note: 'n' }]);
ok(long.ok && long.text.includes('"' + 'q'.repeat(199) + '…"'), 'a quote is bounded at 200 chars (199 + …)');
ok(M.commentsVerdict('/a.md', Array.from({ length: 21 }, () => ({ note: 'n' }))).code === 'too_many', '21 notes ⇒ too_many');
const big = M.commentsVerdict('/a.md', Array.from({ length: 5 }, () => ({ quote: 'q'.repeat(200), note: '注'.repeat(1000) })));
ok(big.code === 'too_long', 'past 4 KB (UTF-8) ⇒ too_long — never a cut message', big.code);
const edge = M.commentsVerdict('/a.md', Array.from({ length: 20 }, (_, i) => ({ quote: 'q' + i, note: 'n'.repeat(150) })));
ok(edge.ok && M.utf8Len(edge.text) <= 4096 && edge.text.split('\n').length === 21 && edge.text.includes('⑳'), '20 notes under 4 KB ⇒ ①…⑳', M.utf8Len(edge.text));
ok(M.commentsVerdict('/a.txt', [{ note: 'n' }]).code === 'bad_path' && M.commentsVerdict('a.md', [{ note: 'n' }]).code === 'bad_path' && M.commentsVerdict('/a.md', []).code === 'empty', 'a non-markdown / relative path, no notes ⇒ refused by name');

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
  const sendUserInput = (sid, text, opts) => { rec.sent.push({ sid, text, opts }); return sendOk ? { ok: true, msgId: 'm1' } : { ok: false, code: 'no_session' }; };
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
ok(/const src = safeImageSrc\(node\.attrs\.src\);\n\s+if \(src\) img\.src = /.test(ui) && /toDOM\(mark\) \{ const href = safeHref\(mark\.attrs\.href\);/.test(dmd), 'images are set via .src after safeImageSrc; a link\'s href is re-validated at every render (safeHref)');
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
ok(/const STORE_PREFIX = 'vs-doc-comments:';/.test(ui) && /slice\(0, M\.LIMITS\.items\)/.test(ui), 'the strip is device-kept per (host, path) under vs-doc-comments:, bounded');
ok(/const line = agentText\(v\.text, \{ kind: 'block', max: M\.LIMITS\.messageBytes \}\);/.test(eng), 'the comments block goes through THE belt (peer-text toAgentText) before the sender or the stash');
ok(!/from 'prosemirror|from 'markdown-it/.test(door) && /import\(new URL\('\/doc-editor\.js', location\.origin\)\.href\)/.test(door), 'the door (main bundle) imports no editor module — the editor is the lazy public/doc-editor.js');
const pkg = JSON.parse(read('package.json'));
const PINS = ['prosemirror-commands', 'prosemirror-history', 'prosemirror-keymap', 'prosemirror-markdown', 'prosemirror-model', 'prosemirror-schema-list', 'prosemirror-state', 'prosemirror-transform', 'prosemirror-view'];
ok(PINS.every((p) => /^\d+\.\d+\.\d+$/.test(pkg.dependencies[p] || '')), 'the editor packages are pinned EXACT', PINS.map((p) => p + '@' + pkg.dependencies[p]));
ok(/esbuild src\/doc-editor-entry\.js --bundle --outfile=public\/doc-editor\.js --format=esm/.test(pkg.scripts.build) && /^public\/doc-editor\.js$/m.test(read('.gitignore')), 'npm run build makes public/doc-editor.js (gitignored build output)');

// ── §8 patched copies: each rule removed turns its table red ──
console.log('§8 patched-copy controls');
const MUT = mutantCopies('docmodel', REPO);
const msrc = read('src/doc-model.js');
const RULES = [
  ['the round-trip compare removed (every file "lossless")', "for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return { ok: false, code: 'lossy', line: i + 1 };", '', (X) => X.fidelityVerdict('Price 5 * 3\n', 'Price 5 \\* 3').ok === true],
  ['the table rule removed', "  ['table',", "  ['table_off', () => false, ", (X) => !X.rawReasons(RAW['a GFM table'][1]).includes('table')],
  ['the 4 KB bound removed', 'if (utf8Len(text) > LIMITS.messageBytes)', 'if (false)', (X) => X.commentsVerdict('/a.md', Array.from({ length: 5 }, () => ({ quote: 'q'.repeat(200), note: '注'.repeat(1000) }))).ok === true],
  ['the quote bound removed', 'const quote = clip(oneLine(x.quote), LIMITS.quote);', 'const quote = oneLine(x.quote);', (X) => X.commentsVerdict('/a.md', [{ quote: 'q'.repeat(500), note: 'n' }]).text.includes('q'.repeat(300))],
  ['the dirty check removed (a repaint over unsaved edits)', "  if (!dirty) return 'repaint';", "  return 'repaint';", (X) => X.conflictVerdict({ disk: 11, base: 10, dirty: true }) === 'repaint'],
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
