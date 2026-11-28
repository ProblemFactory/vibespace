#!/usr/bin/env node
// test-foryou-links — lane foryou-attachments (owner 2026-10-09 "经常 agent 会让我 review 一个产物/文件/网页，我却没法轻易从
// inbox 里打开"): a For-you item SHOWS what the agent wants the owner to look at and opens it in one press.
//   §1 THE SEGMENTER (src/lib/foryou-links.js, PURE): abs / ~ / relative / bare filename / url / /p/ / mailto / a mail
//      address / a path in a code span; an XSS string stays text; the words join back exactly; prose is not over-linked
//   §2 RESOLUTION against the asker's cwd + home + host; the chip's artifact row + its open-time probe
//   §3 THE ROUTE (POST /api/agent/user-todo, src/agent-routes/status.js) over REAL files: --artifact judged by the hand-over's
//      argument shape (handoverItems) + OPENABILITY at submit — too-many / a missing file / an unreadable file / a dangling
//      symlink / a folder without design.json / an unpublished page / an unknown page ⇒ the WHOLE ask refused with the
//      named lines and NOTHING filed; a remote-host path probed on that host, never locally; the registry's `present` ops
//      (the one writer). CONTROL: the old file-without-them behaviour (a patched route) ⇒ RED
//   §4 THE CLI (data/bin/vibespace-ask) against that route: the parse, one line per bad attachment, exit 2, the last line
//   §5 CENSUSES with RED controls: ONE path grammar · no innerHTML of raw text · a chip opens through THE ONE artifact door
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const F = await import(path.join(REPO, 'src/lib/foryou-links.js'));
const fileImports = (src, dir = 'src/lib') => src.replace(/(\b(?:from|import)\s+')(\.\.?\/[^']+)(')/g, (x, a, p, z) => a + 'file://' + path.join(REPO, dir, p) + z); // r10 (F2): every relative import → the file it names
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const links = (s) => F.segmentText(s).filter((g) => g.t === 'link').map((g) => g.kind + ':' + g.ref);
const J = JSON.stringify;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-fyl-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });

console.log('§1 THE SEGMENTER — one grammar with the chat, the words exactly as written');
{
  ok(J(links('see docs/plan.md and ~/notes/a.md and https://example.test/x.')) === J(['rel:docs/plan.md', 'path:~/notes/a.md', 'url:https://example.test/x']), 'the brief\'s own sentence: a relative path, a ~ path and a URL (the sentence\'s full stop stays text)');
  ok(J(links('the dump is /home/u/workspace/39AI/platform-dev/docs/skrypt-import-2026-10-09/DRY-DUMP.md, read it')) === J(['path:/home/u/workspace/39AI/platform-dev/docs/skrypt-import-2026-10-09/DRY-DUMP.md']), 'an absolute path (the owner\'s screenshot) — the comma after it is not part of it');
  ok(J(links('设计稿：/var/tmp/vibespace-lanes/webhook-design/design-webhook.zh.md（中文）')) === J(['path:/var/tmp/vibespace-lanes/webhook-design/design-webhook.zh.md']), 'CJK punctuation ends a path (path-linkify\'s rule, shared)');
  ok(J(links('open `report.md` then `out/`')) === J(['rel:report.md', 'rel:out/']), 'a bare filename / a folder IN A CODE SPAN links (the chat\'s rule)');
  ok(J(links('见 `标书研究/方案.md`')) === J(['rel:标书研究/方案.md']), 'lane agy-links-file-url: a code span whose path starts with a CJK folder name links (the chat\'s rule, shared)');
  ok(links('请看docs/plan.md · 报告：docs/x.md · 方案在 标书研究/方案.md 里').length === 0, '…in PROSE a relative path still starts with an ASCII letter: a word glued to it (请看docs/plan.md) is never part of a link');
  ok(J(links('`cat /etc/hosts` and `~/x/y.md`')) === J(['path:/etc/hosts', 'path:~/x/y.md']), 'a path inside a code span links on its own words');
  ok(J(links('page /p/pgabcdefghij and https://vs.test/p/pgabcdefghij')) === J(['page:/p/pgabcdefghij', 'url:https://vs.test/p/pgabcdefghij']), 'a /p/<id> page; inside a URL it is the URL');
  ok(J(links('mail ops@foo.com or mailto:team@bar.org')) === J(['mail:mailto:ops@foo.com', 'mail:mailto:team@bar.org']), 'a mail address and a mailto: link');
  ok(links('report.md Node.js e.g. and/or en/zh/ja 10.0.0.0/8 v2.369.245 TCP/IP').length === 0, 'prose is not over-linked: a bare filename outside a code span, Node.js, e.g., and/or, en/zh/ja, a CIDR, a version, TCP/IP stay words');
  const x = '<img src=x onerror=alert(1)> "/tmp/a/<b>.md" `<script>`';
  const h = F.linkedHtml(x);
  ok(!/<img|<script|<b>/.test(h) && verdictOf(h.includes('&lt;img src=x onerror=alert(1)&gt;')), 'XSS: an <img onerror> / <script> / a tag inside a path stays TEXT (every segment escaped)', h);
  const s = 'a `docs/x.md` b /p/pgabcdefghij https://q.test/a?b=1&c=2), c ~/n.md: d (docs/y.md) ops@x.io';
  ok(F.segmentText(s).map((g) => g.s).join('') === s, 'the segments join back to the words EXACTLY (nothing added, nothing dropped)');
  ok(verdictOf(/data-ref="https:\/\/q\.test\/a\?b=1&amp;c=2"/.test(F.linkedHtml(s))), 'a link\'s ref rides its attribute escaped');
}

// lane artifacts-by-intent r7 (T6): A CUT TOKEN IS NO LINK IN THE TRAY EITHER — the store keeps an ask's words to 500 / 8 000
// through ONE cut whose kept words end in «…» (src/inbox-reply-text.js clip); the segmenter reads the runs the cut went through
// (cutRuns — the rule every reader of a cut text reads) and draws a link over one as its words
{
  const RT = require(path.join(REPO, 'src/inbox-reply-text.js'));
  const clipT = typeof RT.clip === 'function' ? RT.clip : (x, cap) => x.slice(0, cap); // an older tree: the store's plain slice
  const P10 = 'pg' + '7'.repeat(10), keptQ = clipT('x'.repeat(483) + ' /p/' + P10 + '7 more', 500), keptD = clipT('y'.repeat(7983) + ' /p/' + P10 + '7 more', 8000), keptU = clipT('z'.repeat(460) + ' https://vs.example.com/p/' + P10 + '7 more', 500), whole = 'x'.repeat(484) + ' /p/pg' + '8'.repeat(10);
  const seen = { q: links(keptQ), d: links(keptD), u: links(keptU), whole: links(whole), words: F.segmentText(keptQ).map((g) => g.s).join('') === keptQ };
  ok(gateOf(keptQ.endsWith('/p/' + P10 + '…')) && !seen.q.length && !seen.d.length && !seen.u.length && J(seen.whole) === J(['page:/p/pg8888888888']) && verdictOf(seen.words),
    'a page token the store\'s cut went through (pg + 10 kept, the mark after it — the question at 500, the detail at 8 000, a URL form) ⇒ no link, drawn as its words; a whole link ending at the cap ⇒ a link', seen);
  const FY1 = read('src/lib/foryou-links.js'), ONE = '  return uncutLinks(src, segmentWords(src, has), whole ? FIELD_CAPS : null, has);';   // B-3f50: the whole-field road passes the caps; lane setting-doors pick 1 (on .402): the schema test rides both passes
  // r10 (F2): A CONTROL COPY RESOLVES EVERY RELATIVE IMPORT OF THE MODULE IT COPIES — a data: URL copy resolves no relative
  // specifier, and a sibling lane adds imports (mask-value-shape r4: a second '../path-linkify.js' import + '../secret-shapes.js'):
  // every static `from '<./ or ../>…'` / `import '<…>'` is rewritten to the file it names, never only the ones this suite knew
  const planted = "import { pathRe as pathRe2 } from '../path-linkify.js';\nimport * as shapes from '../secret-shapes.js';\n" + FY1, asData = (src) => import('data:text/javascript,' + encodeURIComponent(src));
  const gen = { left: (fileImports(planted).match(/\b(?:from|import)\s+'\.\.?\//g) || []).length };
  const r9imp = await asData(planted.replace("from '../path-linkify.js';", `from 'file://${path.join(REPO, 'src/path-linkify.js')}';`).replace("from '../inbox-reply-text.js';", `from 'file://${path.join(REPO, 'src/inbox-reply-text.js')}';`)).then(() => 'loaded', (e) => e.code || e.message);
  ok(r9imp !== 'loaded', 'CONTROL r9\'s rewrite (the first path-linkify import and inbox-reply-text only) of the same copy ⇒ the import fails at the sibling\'s specifier — RED', r9imp);
  const r6seg = FY1.includes(ONE) ? (await import('data:text/javascript,' + encodeURIComponent(fileImports(planted).replace(ONE, '  return segmentWords(src, has);')))).segmentText : null;
  ok(gen.left === 0 && typeof r6seg === 'function', 'r10 (F2) the control copies resolve EVERY relative import of the copied module — a copy that gains a sibling\'s imports (a second path-linkify import, secret-shapes) loads, no relative specifier left', { ...gen, loaded: typeof r6seg });
  ok(typeof r6seg === 'function', 'CONTROL needle present: the segmenter reads the cut runs (r7) — a tree without it has nothing to patch');
  if (r6seg) ok(J(r6seg(keptQ).filter((g) => g.t === 'link').map((g) => g.kind + ':' + g.ref)) === J(['page:/p/' + P10]), 'CONTROL r6\'s segmenter (the cut runs unread) ⇒ the tray links «page:/p/' + P10 + '» before the «…» — RED');
  // r8 (X1): THE WHOLE LINK TOKEN, NEVER ITS WORD FRAGMENT — a URL or a path runs on across '.', '/', '?', '=', ':' where a
  // page id stops: the store's cut at EVERY position through a URL, an absolute path, a relative path, a home path, a mail
  // address ⇒ the token drawn as words, never a link to a truncated target or another host; the uncut link earlier in the
  // same words stays a link; a whole link a CJK mark or a space ends before the cut stays a link
  const TOKS = ['https://docs.example.com/guide/install.html?lang=en', '/home/u/proj/src/app/main.py', 'docs/guide/plan.md', '~/notes/today.md', 'mailto:a.b@example.com', 'a.b@example.com', '/home/u/proj/src/app/main.py:120:4']; // r9 (Y2): a path's :line:col suffix
  const sweep = (seg, toks = TOKS) => { const out = { through: [], first: 0, n: 0 }; for (const tok of toks) for (let k = 1; k <= tok.length; k++) { const raw = 'ok https://ok.example.org/a first. ' + 'x'.repeat(10) + ' ' + tok + ' tail words', at = raw.indexOf(tok); const kept = clipT(raw, at + k + 1), L = seg(kept).filter((g) => g.t === 'link'); out.n++; if (L.length && L[0].ref === 'https://ok.example.org/a') out.first++; if (L.length > 1) out.through.push(kept.slice(at) + ' ⇒ ' + L.slice(1).map((g) => g.ref).join()); } return out; };
  const sw8 = sweep(F.segmentText), cjk = [links('请审阅 /p/pgaaaaaaaaaa，以及更多说明文字…'), links('请看/p/pgaaaaaaaaaa以及说明…'), links('see /home/u/a.md and then more…')];
  ok(sw8.n === 184 && sw8.through.length === 0 && sw8.first === sw8.n && J(cjk) === J([['page:/p/pgaaaaaaaaaa'], ['page:/p/pgaaaaaaaaaa'], ['path:/home/u/a.md']]),
    'r8 (X1) + r9 (Y2) the store\'s cut at every one of 184 positions through a URL (query and all), an absolute path, a relative path, a home path, a mailto:, a mail address and a path with its :line:col suffix (a cut right after either \':\' too) ⇒ never a link over the cut token (no other host, no truncated target); the uncut link before it a link at every position; a whole link a CJK mark, CJK words or a space ends before the cut stays a link', { through: sw8.through.slice(0, 6), first: sw8.first, n: sw8.n, cjk });
  const R7CUT = FY1.slice(FY1.indexOf('function uncutLinks(src, segs, caps = null, has = null) {'), FY1.indexOf('\n}\n', FY1.indexOf('function uncutLinks(src, segs, caps = null, has = null) {')) + 2);
  const r7seg = FY1.includes(ONE) && R7CUT.length > 40 ? (await import('data:text/javascript,' + encodeURIComponent(fileImports(FY1).replace(R7CUT, "function uncutLinks(src, segs) {\n  const runs = cutRuns(src).filter(([b, e]) => e > b);\n  if (!runs.length) return segs;\n  let at = 0;\n  return segs.map((g) => { const a = at; at += g.s.length; return g.t === 'link' && runs.some(([b, e]) => b < at && e > a) ? { t: 'text', s: g.s } : g; });\n}")))).segmentText : null;
  ok(typeof r7seg === 'function', 'CONTROL needle present: the segmenter\'s cut-token rule (r8) — a tree without it has nothing to patch');
  const PROBE = "return '0' + open.reverse().join('');"; // r9's digit — since the .399 follow-up, the continuation's head (the closers follow it)
  const r8seg = FY1.includes(PROBE) ? (await import('data:text/javascript,' + encodeURIComponent(fileImports(FY1).replace(PROBE, "return 'x' + open.reverse().join('');")))).segmentText : null;
  ok(typeof r8seg === 'function', 'CONTROL needle present: the segmenter\'s digit probe (r9) — a tree without it has nothing to patch');
  if (r8seg) { const s8 = sweep(r8seg, TOKS.slice(6)); ok(s8.through.length === 2 && verdictOf(s8.through.every((x) => /main\.py:(120:)?… ⇒ /.test(x))), 'CONTROL r8\'s probe (a letter) ⇒ the two cuts right after a \':\' of main.py:120:4 still a link to the file, its line or its column dropped — RED', s8.through); }
  // r10 (n5): a RELATIVE path's `:line` — the relative grammar never takes it (path-linkify: an uncut «plan.md:42» is no link),
  // so a cut right after its ':' still read the file: the digit probe's text reads no link there at all. A link only the cut made
  // (the continued words read none at its place, no space before the mark) is the cut token too
  const RELT = ['docs/guide/plan.md:42', 'src/app/main.py:120:4'], s10 = sweep(F.segmentText, RELT);
  ok(s10.n === 42 && !s10.through.length && s10.first === s10.n && !links('see docs/guide/plan.md:42 now').length && J(links('see docs/guide/plan.md and more…')) === J(['rel:docs/guide/plan.md']),
    'r10 (n5) the store\'s cut at every one of 42 positions through a RELATIVE path with its :line / :line:col (a cut right after a \':\' too) ⇒ never a link; the uncut link before it a link at every position; a whole relative path a space ends before the cut stays a link (an uncut «plan.md:42» is no link — the relative grammar\'s own rule, unchanged)', s10);
  const CUTMADE = ' || cutMade(a, at)';
  const r9seg = FY1.includes(CUTMADE) ? (await import('data:text/javascript,' + encodeURIComponent(fileImports(FY1).replace(CUTMADE, '')))).segmentText : null;
  ok(typeof r9seg === 'function', 'CONTROL needle present: a link only the cut made (r10) — a tree without it has nothing to patch');
  if (r9seg) { const s9 = sweep(r9seg, RELT); ok(s9.through.length === 2 && verdictOf(s9.through.every((x) => /(plan\.md|main\.py):… ⇒ (docs\/guide\/plan\.md|src\/app\/main\.py)$/.test(x))), 'CONTROL r9\'s rule (the probe\'s links only) ⇒ «docs/guide/plan.md:…» and «src/app/main.py:…» still link the file, the line dropped — RED', s9.through); }
  // .399 follow-up (the acceptance of 93c6e9132): THE MERGED GRAMMAR'S OWN TOKENS — a URL through each full-width pair
  // (FW_PAIRS: a balanced pair rides inside a URL) and a path through a [vault:…] mark (a whole mark rides inside a path):
  // the store's cut at every position from the pair's / the mark's opening on ⇒ every link the cut text draws is one the
  // WHOLE text reads at the same offset with the same kind and ref; the uncut link before it a link at every position
  const GTOKS = [...(F.FW_PAIRS || []).map((pr) => [`https://ja.wikipedia.org/wiki/${pr[0]}東京${pr[1]}`, 30]), ['/srv/app/[vault:secrets/db/pw]/conf.yml', 9]];
  const linkAt = (segs) => { const m = new Map(); let p = 0; for (const g of segs) { if (g.t === 'link') m.set(p, g.kind + ':' + g.ref); p += g.s.length; } return m; };
  const sweep11 = (seg, pres = ['ok https://ok.example.org/a first. ']) => { const out = { created: [], n: 0, first: 0 }; for (const [tok, from] of GTOKS) for (const pre of pres) { const whole = pre + tok + ' tail words', at = pre.length, wl = linkAt(F.segmentText(whole)); for (let k = from; k <= tok.length; k++) { const kept = clipT(whole, at + k + 1); out.n++; const got = linkAt(seg(kept)); if ([...got.values()][0] === 'url:https://ok.example.org/a') out.first++; for (const [p, l] of got) if (wl.get(p) !== l) out.created.push(kept.slice(at) + ' ⇒ ' + l); } } return out; };
  const s11 = sweep11(F.segmentText), s11cjk = sweep11(F.segmentText, ['请先看 https://ok.example.org/a 。然后是 ']);
  ok((F.FW_PAIRS || []).length === 6 && s11.n === 61 && !s11.created.length && s11.first === s11.n && !s11cjk.created.length && s11cjk.first === s11cjk.n,
    '.399 follow-up: the store\'s cut at every one of 61 positions through a URL inside each of the six full-width pairs and a path through a [vault:…] mark (ASCII and CJK words around) ⇒ every link the cut text draws is one the whole text reads at the same offset with the same kind and ref; the uncut link before it a link at every position', { n: s11.n, created: [...s11.created, ...s11cjk.created].slice(0, 6) });
  const CONT = 'const c = continuation(src, e);', MASKED = "if (g.t !== 'link' && g.t !== 'masked') continue;";
  const r10cont = FY1.includes(CONT) && FY1.includes(MASKED) ? (await import('data:text/javascript,' + encodeURIComponent(fileImports(FY1).replace(CONT, "const c = '0';").replace(MASKED, "if (g.t !== 'link') continue;")))).segmentText : null;
  ok(typeof r10cont === 'function', 'CONTROL needle present: the continuation closes what the cut left open (.399 follow-up) — a tree without it has nothing to patch');
  if (r10cont) { const c11 = sweep11(r10cont); ok(gateOf(c11.created.some((x) => /⇒ url:https:\/\/ja\.wikipedia\.org\/wiki\/$/.test(x))) && verdictOf(c11.created.some((x) => /⇒ path:\/srv\/app\/\[vault$/.test(x))), 'CONTROL r10\'s probe (a digit only, a masked segment not counted) ⇒ the cut makes a link to the parent page «…/wiki/» and to «/srv/app/[vault» — RED', c11.created.slice(0, 4)); }
  const R7N = 18; // r7's word run over the first six tokens' 150 positions
  if (r7seg) { const sw7 = sweep(r7seg, TOKS.slice(0, 6)); ok(sw7.through.length === R7N && verdictOf(sw7.through.some((x) => /⇒ https:\/\/docs\.example$/.test(x))), 'CONTROL r7\'s rule (the page id\'s word run before the mark) ⇒ ' + R7N + ' of 150 cut positions still a link — «https://docs.example.…» a link to ANOTHER host, «…/guide/» a parent — RED', { n: sw7.through.length, first: sw7.through.slice(0, 4) }); }
}

console.log('§2 RESOLUTION — against the ASKING conversation\'s cwd + home on ITS host');
{
  const at = { cwd: '/tmp/x/repo', host: 'h1' };
  ok(J(F.linkTarget('rel', 'docs/plan.md', at)) === J({ open: 'file', cands: ['/tmp/x/repo/docs/plan.md', '/tmp/x/docs/plan.md'], host: 'h1' }), 'a relative path → the chat\'s candidates under the asker\'s cwd, on the asker\'s host');
  ok(J(F.linkTarget('path', '~/notes/a.md', at)) === J({ open: 'file', cands: ['~/notes/a.md'], host: 'h1' }), '~ is the asker\'s home — expanded by ITS host at open, never here');
  ok(F.linkTarget('path', '/srv/a.js:42', at).line === 42 && F.linkTarget('path', '/srv/a.js:42', at).cands[0] === '/srv/a.js', 'a :line suffix opens at the line');
  ok(J(F.linkTarget('rel', 'repo/docs/z.md', { cwd: '/tmp/x/repo/sub' }).cands) === J(['/tmp/x/repo/sub/repo/docs/z.md', '/tmp/x/repo/docs/z.md', '/tmp/x/repo/repo/docs/z.md']), 'the cwd\'s own segment overlap (the chat\'s relCandidates — shared, src/path-linkify.js)');
  ok(F.linkTarget('url', 'https://e.test/x', at).open === 'url' && F.linkTarget('url', 'javascript:alert(1)', at) === null && F.linkTarget('mail', 'mailto:a@b.c', at).href === 'mailto:a@b.c' && F.linkTarget('page', '/p/pgabcdefghij', at).path === '/p/pgabcdefghij', 'a URL / a mail / a page; a javascript: ref opens nothing');
  const P = require(path.join(REPO, 'src/path-linkify.js'));
  ok(J(F.linkTarget('rel', 'a/b.md', { cwd: '/w/r' }).cands) === J(P.relCandidates('a/b.md', '/w/r')), 'the For-you candidates ARE the chat\'s (one function)');
  const fr = F.askArtifactRow({ kind: 'file', host: 'h1', path: '/tmp/x/repo/report.md', name: 'report.md' });
  ok(J(fr) === J({ kind: 'doc', host: 'h1', path: '/tmp/x/repo/report.md', name: 'report.md' }), 'a file chip → a doc row on its host (the door opens its viewer there)');
  ok(F.askArtifactRow({ kind: 'design', host: '', path: '/d/x' }).kind === 'design' && F.askArtifactRow({ kind: 'page', page: 'pgabcdefghij', name: 'P' }).url === '/p/pgabcdefghij' && F.askArtifactRow({ kind: 'page', page: 'pgabcdefghij' }).presented === true, 'a design chip → its folder; a page chip → its /p/ link (presented: the door opens the page)');
  ok(F.askArtifactRow({ kind: 'exe', path: '/x' }) === null && F.askArtifactRow(null) === null, 'a malformed attachment is no row');
  ok(F.askArtifactProbe({ kind: 'design', host: 'h1', path: '/d/x/' }).url === '/api/file/info?path=%2Fd%2Fx%2Fdesign.json&host=h1' && F.askArtifactProbe({ kind: 'page', page: 'pgabcdefghij' }).method === 'HEAD', 'the open-time re-check: a design\'s manifest on its host, a page\'s own URL');
}

console.log('§3 THE ROUTE — --artifact judged at submit; ANY attachment that would not open ⇒ nothing filed');
const express = require(path.join(REPO, 'node_modules/express'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const REG = require(path.join(REPO, 'src/server/artifact-registry.js'));
const { runOp } = require(path.join(REPO, 'src/safe-fs-worker.js'));
const AR = read('src/agent-routes.js');
const hm = /const handoverItems = (\(b\) => [^\n]+);/.exec(AR);
const handoverItems = hm ? (0, eval)(hm[1]) : null; // THE hand-over's argument shape, extracted verbatim (never a copy of its own)
ok(typeof handoverItems === 'function' && verdictOf(/handoverItems: \(b\) => handoverItems\(b\)/.test(AR)), 'the route reads vibespace-msg\'s hand-over argument shape (handoverItems, handed in by setupAgentRoutes)');
const REPOX = path.join(TMP, 'repo');
fs.mkdirSync(path.join(REPOX, 'docs'), { recursive: true });
fs.writeFileSync(path.join(REPOX, 'report.md'), '# report\n');
fs.writeFileSync(path.join(REPOX, 'secret.md'), 'x'); fs.chmodSync(path.join(REPOX, 'secret.md'), 0o000);
fs.symlinkSync(path.join(REPOX, 'nowhere.md'), path.join(REPOX, 'dangle.md'));
fs.mkdirSync(path.join(REPOX, 'plain-dir')); fs.writeFileSync(path.join(REPOX, 'plain-dir', 'a.txt'), 'a');
fs.mkdirSync(path.join(REPOX, 'design-dir')); fs.writeFileSync(path.join(REPOX, 'design-dir', 'design.json'), '{}');
for (let i = 0; i < 9; i++) fs.writeFileSync(path.join(REPOX, `f${i}.md`), String(i));
const rootRead = (() => { try { fs.readFileSync(path.join(REPOX, 'secret.md')); return true; } catch { return false; } })();
const PAGES = { byId: (id) => (id === 'pgaaaaaaaaaa' ? { page: { name: 'Live page', path: '/p/pgaaaaaaaaaa' } } : id === 'pgbbbbbbbbbb' ? { gone: true } : null) };
const sessL = { name: 'asker', cwd: REPOX, host: 'local', _artifacts: {} };
const sessR = { name: 'remote-asker', cwd: '/remote', host: 'h1', _artifacts: {} };
REG.configure({ activeSessions: () => new Map([['s1', sessL], ['s2', sessR]]), pages: () => PAGES, log: { log() { }, warn() { } } });
const localCalls = [], remoteCalls = [];
async function serve(statusModule) {
  const todos = new UserTodoManager({ dataDir: fs.mkdtempSync(path.join(TMP, 'todos-')), onChange: () => { }, expirySweepMs: 0 });
  const app = express();
  app.use(express.json());
  app.locals.safeFs = { call: async (op, p) => { localCalls.push(p.path); return runOp(op, p).result; } };
  app.locals.getRemoteFs = () => ({ info: async (host, p) => { remoteCalls.push(host + ':' + p); if (p === '/remote/ok.md') return { path: p, isDirectory: false }; throw Object.assign(new Error('No such file or directory'), { code: 'ENOENT' }); } });
  const who = (req) => (req.headers.authorization === 'Bearer R' ? [sessR, 's2'] : [sessL, 's1']);
  require(statusModule).register(app, { activeSessions: new Map(), sessionStatus: {}, userTodos: todos, sessionStatusKey: (s, id) => 'claude:' + id, clearAsAgent: () => { }, agentSession: (req) => who(req), toolOn: () => true, toolDisabled: () => { }, bookkept: () => { }, handoverItems });
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const ask = async (add, tok = 'L') => { const res = await fetch(base + '/api/agent/user-todo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: J({ add }) }); return { status: res.status, j: await res.json() }; };
  return { todos, srv, base, ask, count: () => todos.snapshot().open.length };
}
const S = await serve(path.join(REPO, 'src/agent-routes/status.js'));
{
  const r = await S.ask({ text: 'Review the dry run?', artifacts: [path.join(REPOX, 'report.md'), path.join(REPOX, 'design-dir'), '/p/pgaaaaaaaaaa'] });
  const it = r.j.item || {};
  ok(r.status === 200 && J((it.artifacts || []).map((a) => a.kind)) === J(['file', 'design', 'page']), 'a readable file, a design folder (design.json), a published page ⇒ filed with three attachments', r.j);
  ok(gateOf(it.artifacts) && it.artifacts[0].path === path.join(REPOX, 'report.md') && it.artifacts[0].name === 'report.md' && it.artifacts[0].host === '' && it.artifacts[2].name === 'Live page' && it.artifacts[2].url === '/p/pgaaaaaaaaaa', 'each row: kind, host, path | page, name (a page\'s own name), url');
  ok(it.cwd === REPOX && !it.hostId, 'the store stamps the asker\'s cwd (and no host: this box)');
  const rows = sessL._artifacts;
  ok(gateOf(rows[':' + path.join(REPOX, 'report.md')]) && rows[':' + path.join(REPOX, 'report.md')].lastOp === 'present' && rows[':' + path.join(REPOX, 'design-dir')].kind === 'design' && gateOf(rows[':/p/pgaaaaaaaaaa']) && verdictOf(rows[':/p/pgaaaaaaaaaa'].presented), 'THE ONE WRITER: the registry folded a `present` op per attachment — the conversation\'s Artifacts list shows them', Object.keys(rows));
  ok(!/_artifacts/.test(read('src/agent-routes/status.js')) && verdictOf(/presentAsk\(s, item\.artifacts, \{ id: item\.id, said: \[item\.text, item\.detail\] \}\)/.test(read('src/agent-routes/status.js'))), 'the route never writes the rows itself — presentAsk (artifact-registry.js) does');
  const n0 = S.count();
  const cases = [
    ['a missing file', [path.join(REPOX, 'missing.md')], 'missing', /no such file on this machine — check the path/],
    ...(rootRead ? [] : [['an unreadable file', [path.join(REPOX, 'secret.md')], 'unreadable', /not readable on this machine \(permission denied\) — make it readable/]]),
    ['a dangling symlink', [path.join(REPOX, 'dangle.md')], 'missing', /a link whose target is gone counts as missing/],
    ['a folder without design.json', [path.join(REPOX, 'plain-dir')], 'folder', /a folder without design\.json — attach a file in it, or a design folder/],
    ['an unpublished page', ['/p/pgbbbbbbbbbb'], 'unpublished', /not published \(it was taken down\) — publish it again first/],
    ['a page never published here', ['/p/pgcccccccccc'], 'no-page', /no such page on this server — publish the file first/],
    ['nine attachments', Array.from({ length: 9 }, (_, i) => path.join(REPOX, `f${i}.md`)), 'too-many', /9 attachments — at most 8 per item/],
    ['one bad among good ones', [path.join(REPOX, 'report.md'), path.join(REPOX, 'missing.md'), '/p/pgaaaaaaaaaa'], 'missing', /missing\.md: no such file/],
  ];
  for (const [what, arts, why, re] of cases) {
    const b = await S.ask({ text: 'Q ' + what, artifacts: arts });
    const lines = b.j.refused || [];
    ok(b.status === 422 && b.j.code === 'bad-artifact' && lines.length === 1 && lines[0].why === why && gateOf(re.test(lines[0].error)) && gateOf(/^nothing was filed/.test(b.j.error)) && S.count() === n0, `${what} ⇒ the WHOLE ask refused (422), the line names it and the fix, NOTHING filed`, b.j);
  }
  if (rootRead) ok(true, 'an unreadable file: SKIPPED — this account reads a 000 file (root)');
  const two = await S.ask({ text: 'Q two bad', artifacts: [path.join(REPOX, 'missing.md'), '/p/pgbbbbbbbbbb'] });
  ok(two.status === 422 && (two.j.refused || []).length === 2, 'ONE LINE PER bad attachment');
  const rem = await S.ask({ text: 'Q remote', artifacts: ['/remote/ok.md'] }, 'R');
  ok(rem.status === 200 && gateOf(remoteCalls.includes('h1:/remote/ok.md')) && !localCalls.includes('/remote/ok.md') && rem.j.item.artifacts[0].host === 'h1' && rem.j.item.hostId === 'h1' && rem.j.item.cwd === '/remote', 'a REMOTE asker\'s path is probed on ITS host (RemoteFs info), never by a local stat; the chip carries the host', { remoteCalls, localCalls });
  const remBad = await S.ask({ text: 'Q remote gone', artifacts: ['/remote/gone.md'] }, 'R');
  ok(remBad.status === 422 && gateOf(/no such file on h1/.test(remBad.j.refused[0].error)) && !localCalls.includes('/remote/gone.md'), 'a remote file that is not there is refused naming THAT host');
  const plain = await S.ask({ text: 'Q no attachments' });
  ok(plain.status === 200 && !plain.j.item.artifacts && plain.j.item.cwd === REPOX, 'an ask without --artifact files as before (+ the cwd its words resolve against)');
  // CONTROL: the old file-without-them behaviour — a patched route that files the item WITHOUT the refused ones
  const mutDir = fs.mkdtempSync(path.join(TMP, 'mut-'));
  const orig = read('src/agent-routes/status.js');
  const mut = editAnchor(orig, /        if \(j\.bad\.length\) return res\.status\(422\)[^\n]*\n/, '', "src/agent-routes/status.js").replace(/require\('\.\.\//g, `require('${REPO}/src/`);
  fs.writeFileSync(path.join(mutDir, 'status.js'), mut);
  const M = await serve(path.join(mutDir, 'status.js'));
  const m0 = M.count();
  const mb = await M.ask({ text: 'Q mutant', artifacts: [path.join(REPOX, 'report.md'), path.join(REPOX, 'missing.md')] });
  ok(mut !== orig && mb.status === 200 && M.count() === m0 + 1, 'CONTROL: the old file-without-them route FILES the item (status 200) — the "nothing filed" legs above are RED on it', mb.j);
  M.srv.close();
}

console.log('§4 THE CLI — vibespace-ask --artifact against that route');
{
  // ASYNC (the route answers from THIS process — a spawnSync would hold the loop the answer needs)
  const cli = (args, cwd = REPOX) => new Promise((res) => { const p = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-ask'), ...args], { cwd, env: { PATH: process.env.PATH, VIBESPACE_API: S.base, VIBESPACE_SESSION_TOKEN: 'L' } }); let stdout = '', stderr = ''; p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; }); p.on('close', (status) => res({ status, stdout, stderr })); });
  const n0 = S.count();
  const bad = await cli(['Please review', '--artifact', 'report.md', 'missing.md', 'plain-dir']);
  const errs = bad.stderr.trim().split('\n');
  ok(bad.status === 2 && errs.length === 3 && gateOf(/missing\.md: no such file/.test(errs[0])) && gateOf(/plain-dir: a folder without design\.json/.test(errs[1])) && errs[2] === 'nothing was filed — fix the attachment and run vibespace-ask again' && S.count() === n0, 'two bad attachments ⇒ exit 2, one line each (absolute against the shell\'s cwd), the last line says nothing was filed', { status: bad.status, errs });
  const good = await cli(['Please review', '--artifact', 'report.md', 'design-dir', '/p/pgaaaaaaaaaa', '--urgency', 'high']);
  ok(good.status === 0 && gateOf(/attached: .*\/report\.md \(file\)/.test(good.stdout)) && gateOf(/attached: \/p\/pgaaaaaaaaaa \(page\)/.test(good.stdout)) && S.count() === n0 + 1, 'fixed ⇒ filed ONCE: every path after the flag until the next flag, each attachment echoed', good.stdout);
  const first = await cli(['--artifact', 'report.md', 'Is this right?']);
  const it = S.todos.snapshot().open.find((i) => i.text === 'Is this right?');
  ok(first.status === 0 && gateOf(it) && gateOf(it.artifacts) && it.artifacts.length === 1 && it.artifacts[0].path === path.join(REPOX, 'report.md'), 'the flag BEFORE the question takes one path (vibespace-msg\'s rule) — the rest is the question', first.stderr || first.stdout);
  // lane cli-one-text-arg (the owner 2026-10-14): the question is ONE argument — the same words loose are REFUSED by name
  // (they used to be joined, which hid a quote that closed early), nothing filed
  const nLoose = S.count();
  const loose = await cli(['--artifact', 'report.md', 'Is', 'this', 'right?']);
  ok(loose.status === 2 && gateOf(/the question is ONE argument — 2 more words followed it \("this", …\)/.test(loose.stderr)) && gateOf(/nothing was filed/.test(loose.stderr)) && S.count() === nLoose, 'lane cli-one-text-arg: the question in loose words is refused by name (exit 2), nothing filed', loose.stderr || loose.stdout);
  ok(verdictOf(/--artifact <path\|\/p\/id>…/.test((await cli(['--help'])).stdout)), 'the usage names --artifact');
}
S.srv.close();

console.log('§5 CENSUSES — one grammar · escaped words · the one artifact door (each with a RED control)');
{
  const FY = read('src/lib/foryou-links.js'), CR = read('src/lib/chat-renderers.js'), PL = read('src/path-linkify.js');
  const SAMPLES = ['/tmp/x/a.md', '~/notes/a.md', 'docs/plan.md', 'report.md', 'B2BTasks/x/final/'];
  const acorn = require(path.join(REPO, 'node_modules/acorn'));
  const pathRegexes = (src) => { const out = []; for (const tk of acorn.tokenizer(src, { ecmaVersion: 'latest', sourceType: 'module' })) if (tk.type.label === 'regexp') { const re = new RegExp(tk.value.pattern, tk.value.flags.replace('g', '')); if (SAMPLES.some((s) => { const m = re.exec(s); return m && m[0] === s; })) out.push('/' + tk.value.pattern + '/'); } return out; };
  const oneGrammar = (fy) => /import \{ pathRe, cleanPath, looksRelPath, relCandidates \} from '\.\.\/path-linkify\.js';/.test(fy) && pathRegexes(fy).length === 0;
  ok(verdictOf(oneGrammar(FY)), 'ONE GRAMMAR: foryou-links.js reads where a path ends / a relative rule / the candidates from src/path-linkify.js, and holds no regex of its own that matches a whole path', pathRegexes(FY));
  ok(gateOf(/looksRelPath, relCandidates \} from '\.\.\/path-linkify\.js'/.test(CR)) && gateOf(/if \(looksRelPath\(txt\)\)/.test(CR)) && verdictOf(/const cands = relCandidates\(rel, cwd\);/.test(CR)), 'the chat reads the SAME relative rule and candidates (moved, not copied)');
  const SIG = String.raw`[\p{L}\p{N}_@%+=.\-][^\s<>"'` + '`' + String.raw`|]*$`; // a first letter of any script (lane agy-links-file-url)
  const holders = []; const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.posix.join(d, e.name); if (e.isDirectory()) walk(rel); else if (/\.(m?js)$/.test(e.name) && read(rel).includes(SIG)) holders.push(rel); } };
  walk('src');
  ok(J(holders) === J(['src/path-linkify.js']) && verdictOf(PL.includes(SIG)), 'the relative rule\'s own pattern lives in ONE file under src/', holders);
  const mutFy = FY.replace('const CODE_RE', 'const MY_PATH = /(?:~|\\.\\.?)?\\/[^\\s]+/g;\nconst CODE_RE');
  ok(mutFy !== FY && !oneGrammar(mutFy), 'CONTROL: a patched copy with its own path regex ⇒ the one-grammar census is RED', pathRegexes(mutFy));
  // escaped words: the tray draws its words / detail through linkedHtml (every segment escaped); the window links TEXT nodes
  const ROW = read('src/lib/user-todos-row.js'), IW = read('src/lib/inbox-window.js');
  // lane foryou-honest (P1-2): ONE renderer — the row's words and detail AND the window's pane draw wordsHtml (= linkedHtml, escaped)
  const wordsEscaped = (row) => /export const wordsHtml = \(text, \{ whole = false \} = \{\}\) => linkedHtml\(String\(text \|\| ''\), \{ escape: escHtml, note: \(g\) => maskedLinkNote\(g, tr\), whole, has: isSettingKey, draw: fyDraw \}\);/.test(row) && /<div class="ut-text">\$\{card \? escHtml\(words\) : wordsHtml\(words, \{ whole: wordsWhole \}\)\}<\/div>/.test(row) && /<div class="ut-detail">\$\{wordsHtml\(detail, \{ whole: detailWhole \}\)\}<\/div>/.test(row) && /a\.textContent = g\.s;/.test(row) && !/\.innerHTML = g\./.test(row);
  ok(verdictOf(wordsEscaped(ROW)), 'NO innerHTML OF RAW TEXT: the tray\'s words and detail go through linkedHtml (escaped); the window\'s links are nodes with textContent');
  ok(gateOf(/function wordsInto\(el, src, whole = false\) \{\s*el\.innerHTML = wordsHtml\(src, \{ whole \}\);\s*\}/.test(IW)) && gateOf(/wordsInto\(c\.title, v\.title, fieldWhole\(it, 'text', v\.title\)\);/.test(IW)) && gateOf(/else wordsInto\(c\.detail, v\.detail, fieldWhole\(it, 'detail', v\.detail\)\);/.test(IW)) && gateOf(/if \(plain\) linkifyInto\(c\.detail\);/.test(IW)) && gateOf(/c\.arts\.replaceChildren\(\.\.\.askChipEls\(it, t\)\)/.test(IW)) && !/\bmdInto\(|from 'marked'/.test(IW),
    'the For-you window: its words drawn by THE tray\'s renderer (wordsHtml — one renderer over both doors, never markdown: lane foryou-honest), a command\'s verbatim <pre> linked as text nodes, its chips as nodes');
  ok(!wordsEscaped(ROW.replace("linkedHtml(String(text || ''), { escape: escHtml, note: (g) => maskedLinkNote(g, tr), whole, has: isSettingKey, draw: fyDraw })", 'String(text)')), 'CONTROL: the words written raw into the row HTML ⇒ the census is RED');
  const rawHtml = (await import('data:text/javascript,' + encodeURIComponent(fileImports(FY).replace('export function linkedHtml(text, { escape = esc, note = (g) => maskedLinkNote(g), whole = false, has = null, draw = null } = {})', 'export function linkedHtml(text, { escape = (s) => s, note = (g) => maskedLinkNote(g), whole = false, has = null, draw = null } = {})')))).linkedHtml('<img src=x onerror=alert(1)>');
  ok(verdictOf(/<img/.test(rawHtml)), 'CONTROL: a linkedHtml without its escape lets <img onerror> through — the §1 XSS leg is RED on it');
  // the one artifact door: a chip opens through openArtifactRow (artifacts-window.js) — never its own opener
  const ACT = read('src/lib/user-todos-actions.js');
  const body = (src) => { const i = src.indexOf('const openArtifact = async (item, k) => {'); const j = src.indexOf('\n  };', i); return i < 0 ? '' : src.slice(i, j); };
  const oneDoor = (src) => { const b = body(src); return /openArtifactRow\(app, /.test(b) && /await import\('\.\/artifacts-window\.js'\)/.test(b) && !/app\.(openFile|openDesign|openBrowser|openFileExplorer)\b|window\.open\(/.test(b); };
  ok(verdictOf(oneDoor(ACT)), 'THE ONE DOOR: a chip opens through openArtifactRow (the chat view\'s _openArtifact when this client shows the conversation, else the row\'s own facts)');
  ok(gateOf(/export function openArtifactRow\(app, sessionId, b(?:, \{ pressed = false \} = \{\})?\)/.test(read('src/lib/artifacts-window.js'))) && gateOf(/model\.openArtifact\(it, Number\(fy\.dataset\.ai\)\)/.test(read('src/lib/user-todos-panel.js'))) && verdictOf(/model\.openArtifact\(it, Number\(fy\.dataset\.ai\)\)/.test(IW)), 'the tray AND the window press a chip into model.openArtifact');
  ok(!oneDoor(ACT.replace("openArtifactRow(app, (s && s.webuiId) || '', row);", 'app.openFile(row.path, row.name, { host: row.host });')), 'CONTROL: a chip that opens its file by itself ⇒ the one-door census is RED');
  ok(gateOf(/'\{name\} is gone — nothing at \{path\} any more'/.test(body(ACT))) && verdictOf(/'\{name\} is no longer published'/.test(body(ACT))), 'the open-time re-check speaks: a gone file / an unpublished page is a toast that says so, never silent');
}

// B-3f50 (the artifacts-by-intent lane's «Known in 2.369.400» pick): (a) A «…» THE WRITER PUT AT A LINE'S END IS ITS OWN WORDS — the
// store cuts a field at its END only (clip), so the tray reads a field-end mark as a cut, never a line-end one inside the field, and
// where it draws a WHOLE stored field (wordsHtml) only at the store's caps (cutRuns { lineEnds: false, caps: FIELD_CAPS }).
// (b) the .400 follow-up's MASKED clause gets a leg of its own: cutMade shadows it on the tree (a fuzz over every cut position of
// masked / vault / URL texts: 0 of 1 173 differ with the clause removed), so its leg runs over a copy without cutMade.
console.log('\nB-3f50 a line-end «…» of the writer\'s own keeps its link; a field\'s end mark is the store\'s only at its caps; the masked clause\'s own leg');
{
  const RT = require(path.join(REPO, 'src/inbox-reply-text.js'));
  const UT = require(path.join(REPO, 'src/user-todos.js'));
  ok(J(RT.FIELD_CAPS) === J([UT.TEXT_MAX, UT.DETAIL_MAX]), 'B-3f50: FIELD_CAPS spells the store\'s two caps (src/user-todos.js TEXT_MAX / DETAIL_MAX)', { caps: RT.FIELD_CAPS, store: [UT.TEXT_MAX, UT.DETAIL_MAX] });
  const own = 'the guide: https://docs.example.com/wiki/Setup…\nand then run it';
  const ownEnd = 'see https://docs.example.com/wiki/Setup…';
  const cutQ = RT.clip('q'.repeat(470) + ' https://docs.example.com/wiki/Setup-and-more-pages', 500);
  const lk = (x, o) => F.segmentText(x, o).filter((g) => g.t === 'link').map((g) => g.s);
  ok(J(lk(own, { whole: true })) === J(['https://docs.example.com/wiki/Setup']) && lk(own).length === 0,
    'B-3f50 (a): on the agent\'s own WHOLE stored field a link it ends with «…» at a LINE\'s end stays a link (the store never cuts inside a field); any other text keeps the conservative reading (a producer may cut a line — the memory note\'s command at 120)', { whole: lk(own, { whole: true }), other: lk(own) });
  ok(J(lk(ownEnd, { whole: true })) === J(['https://docs.example.com/wiki/Setup']) && lk(ownEnd).length === 0,
    'B-3f50 (a): the same «…» at the END of a short whole field (41 chars, no cap) stays a link; a text node that is not a whole field keeps the conservative reading (words)', { whole: lk(ownEnd, { whole: true }), node: lk(ownEnd) });
  ok(cutQ.length === 500 && lk(cutQ, { whole: true }).length === 0 && lk(cutQ).length === 0 && gateOf(/href|data-fy/.test(F.linkedHtml(own, { whole: true }))) && !/data-fy/.test(F.linkedHtml(cutQ, { whole: true })),
    'B-3f50 (a): a field the store cut at its cap (500) through the URL: no link on either road — the cut token is its words', { len: cutQ.length });
  ok(J(RT.cutRuns(own)) !== J([]) && RT.uncut(own) !== own, 'B-3f50 (a): a COMPOSED text\'s reader (presentAsk\'s words, a reply\'s quote — cutRuns\' defaults) still reads every line-end mark as a cut (conservative there)');
  let base = ''; try { base = (await import('node:child_process')).execFileSync('git', ['show', 'b06f36e90:src/lib/foryou-links.js'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch { base = ''; }
  if (base) {
    const B = await import('data:text/javascript,' + encodeURIComponent(fileImports(base)));
    ok(B.segmentText(own).filter((g) => g.t === 'link').length === 0 && lk(own, { whole: true }).length === 1, 'B-3f50 RED control: the release b06f36e90\'s tray drew the writer\'s own line-end «…» link as words (the row\'s complaint) — the whole-field road now keeps it');
  } else console.log('  · SKIP: the release b06f36e90 is not in this clone');
  const ROWB = read('src/lib/user-todos-row.js');
  ok(gateOf(/const wordsWhole = !card && !run && fieldWhole\(i, 'text', words\);/.test(ROWB)) && gateOf(/const detailWhole = fieldWhole\(i, 'detail', detail\);/.test(ROWB))
    && verdictOf(/^import \{ fieldWhole \} from '\.\.\/inbox-origin\.js';/m.test(ROWB)),   // B-76dc: the rule moved into PURE inbox-origin fieldWhole (its own table below)
    'B-3f50 (a): the row reads a field WHOLE only when it draws the agent\'s own stored text / detail — never a template the page filled (a takeover request\'s «{words}» cut at 300), a card, a run headline or a line list; and (batch 47\'s cure) only an AGENT\'S OWN ASK (isAsk: via \'ask\') — a producer\'s item keeps the conservative reading');
  const FY = read('src/lib/foryou-links.js');
  const CM = "const cutMade = (a, z) => !still.has(a) && ends.some((e) => e >= z && !/\\s/.test(src.slice(z, e)));";
  const MASKED = "if (g.t !== 'link' && g.t !== 'masked') continue;";
  ok(gateOf(FY.includes(CM)) && verdictOf(FY.includes(MASKED)), 'B-3f50 (b) needles exist (cutMade, the masked clause)');
  const noCM = FY.replace(CM, 'const cutMade = () => false;');
  const A = await import('data:text/javascript,' + encodeURIComponent(fileImports(noCM)));
  const M = await import('data:text/javascript,' + encodeURIComponent(fileImports(noCM.replace(MASKED, MASKED + " if (g.t === 'masked') continue;"))));
  const vcut = 'open https://h.example/x?k=[vault:…';
  ok(A.segmentText(vcut).filter((g) => g.t === 'link').length === 0, 'B-3f50 (b): the MASKED clause on its own (a copy without cutMade): a cut inside a [vault: mark — the probe\'s closed mark is a MASKED segment over the cut ⇒ the URL before it is drawn as words', A.segmentText(vcut));
  ok(J(M.segmentText(vcut).filter((g) => g.t === 'link').map((g) => g.s)) === J(['https://h.example/x?k=[vault']), 'B-3f50 (b) RED control: the same copy with the masked clause skipped (the verifier\'s M3d) links «https://h.example/x?k=[vault» — the leg above can go red', M.segmentText(vcut));
}

// B-76dc (B-3f50's follow-up): EVERY SURFACE THAT DRAWS AN ITEM'S STORED FIELD ASKS THE ONE ANSWER — PURE src/inbox-origin.js
// fieldWhole (the agent's own ask, the field as stored, no i18n template). The For-you window's pane and the vault paste box drew
// the same field WITHOUT it: a «…» the writer put at a line's end read as a cut there and its link was words, while the tray kept it.
// + THE ASK FILER CUTS NOTHING ITSELF: the whole reading trusts that an ask's field ends in «…» only where the store's clip put it
// (at its caps) — so the ask route (ASK_FILER) builds no «…» of its own (a fixed-string census over its code, comments stripped).
console.log('\nB-76dc every surface asks fieldWhole; the ask filer cuts nothing itself');
{
  const OR = require(path.join(REPO, 'src/inbox-origin.js'));
  const ask = { id: 'a1', via: 'ask', origin: 'agent', text: 'the guide: https://docs.example.com/wiki/Setup…\nthen run it', detail: 'see https://x.example/a…' };
  const table = (fw0) => { const fw = (...a) => { try { return fw0(...a); } catch (e) { return `threw: ${e && e.message}`; } };   // a planted copy that THROWS is a wrong answer (red), never a crash
    return [
    ['an ask\'s stored text, drawn as stored', fw(ask, 'text', ask.text), true],
    ['an ask\'s stored detail, drawn as stored', fw(ask, 'detail', ask.detail), true],
    ['another string drawn in its place (a card\'s words)', fw(ask, 'text', 'Approve the plan'), false],
    ['a page-filled template (i18n.text)', fw({ ...ask, i18n: { text: { key: 'x' } } }, 'text', ask.text), false],
    ['a page-filled detail (i18n.detail lines)', fw({ ...ask, i18n: { detail: [{ key: 'y' }] } }, 'detail', ask.detail), false],
    ['a producer\'s item (no via ask) — it may cut a field itself', fw({ ...ask, via: undefined, origin: 'browser' }, 'text', ask.text), false],
    ['no item', fw(null, 'text', 'x'), false],
    ['a field that is no field', fw(ask, 'id', 'a1'), false],
  ]; };
  const bad = (fw) => table(fw).filter(([, g, w]) => g !== w).map(([n]) => n);
  ok(typeof OR.fieldWhole === 'function' && bad(OR.fieldWhole).length === 0, 'B-76dc: fieldWhole — only the agent\'s own ask, only the field as it stored it (no i18n template, nothing drawn in its place)', bad(OR.fieldWhole || (() => null)));
  const ORS = read('src/inbox-origin.js');
  const loadOr = (src) => { const m = { exports: {} }; new Function('module', 'exports', 'require', src)(m, m.exports, require); return m.exports; };
  const red1 = loadOr(ORS.replace("  if (!isAsk(i) || (field !== 'text' && field !== 'detail')) return false;", "  if (field !== 'text' && field !== 'detail') return false;"));
  const red2 = loadOr(ORS.replace('  return !filled && typeof shown === \'string\' && shown === i[field];', '  return typeof shown === \'string\' && shown === i[field];'));
  ok(bad(red1.fieldWhole).length > 0 && bad(red2.fieldWhole).length > 0, `B-76dc RED controls: a fieldWhole that reads a producer's item as whole (${bad(red1.fieldWhole).join(' | ')}) or a page-filled template as whole (${bad(red2.fieldWhole).join(' | ')})`);
  // THE SURFACES: the tray's row (words, detail, the vault paste row), the For-you window's pane (title, detail), the paste dialog
  const ROWS = read('src/lib/user-todos-row.js'), IWS = read('src/lib/inbox-window.js'), VPB = read('src/lib/vault-paste-box.js');
  const surfaces = (row, iw, vpb) => ({
    row: /wordsHtml\(words, \{ whole: wordsWhole \}\)/.test(row) && /wordsHtml\(detail, \{ whole: detailWhole \}\)/.test(row) && /const wordsWhole = !card && !run && fieldWhole\(i, 'text', words\);/.test(row),
    secretRow: /wordsHtml\(detail \|\| '', \{ whole: fieldWhole\(i, 'detail', detail\) \}\)/.test(row),
    pane: /wordsInto\(c\.title, v\.title, fieldWhole\(it, 'text', v\.title\)\)/.test(iw) && /wordsInto\(c\.detail, v\.detail, fieldWhole\(it, 'detail', v\.detail\)\)/.test(iw) && /el\.innerHTML = wordsHtml\(src, \{ whole \}\);/.test(iw),
    dialog: /linkedHtml\(String\(detail \|\| ''\), \{ escape: escHtml, note: \(g\) => maskedLinkNote\(g, t\), whole: fieldWhole\(item, 'detail', detail\) \}\)/.test(vpb),
    // every wordsHtml call that draws an item's text / detail carries `whole` (the census over the client's callers)
    every: [row, iw].every((src) => [...src.matchAll(/wordsHtml\(([^)]*)\)/g)].filter((m) => /\b(words|detail|src)\b/.test(m[1])).every((m) => /whole/.test(m[1]))),
  });
  const sv = surfaces(ROWS, IWS, VPB);
  ok(verdictOf(Object.values(sv).every(Boolean)), 'B-76dc: the tray row, the vault paste row, the For-you window\'s pane and the paste dialog each draw an item\'s stored field with fieldWhole\'s answer — no wordsHtml of an item\'s words without `whole`', sv);
  ok(!Object.values(surfaces(ROWS, IWS.replace("wordsInto(c.detail, v.detail, fieldWhole(it, 'detail', v.detail))", 'wordsInto(c.detail, v.detail)').replace('el.innerHTML = wordsHtml(src, { whole });', 'el.innerHTML = wordsHtml(src);'), VPB)).every(Boolean)   // stale-pins: kept (the train tip's shape, planted)
    && !Object.values(surfaces(ROWS.replace("wordsHtml(detail || '', { whole: fieldWhole(i, 'detail', detail) })", "wordsHtml(detail || '')"), IWS, VPB)).every(Boolean)   // stale-pins: kept (the train tip's shape, planted)
    && !Object.values(surfaces(ROWS, IWS, VPB.replace(", whole: fieldWhole(item, 'detail', detail) })", ' })'))).every(Boolean), 'B-76dc RED controls: the train tip\'s pane, its vault paste row, its paste dialog (no whole) are each refused');   // stale-pins: kept (the train tip's shapes, planted)
  // THE ASK FILER CUTS NOTHING ITSELF (its code, comments stripped): no «…» literal and no … escape — the store's clip at its caps
  // (src/user-todos.js TEXT_MAX / DETAIL_MAX) is the only cut an ask's field can carry, which is what the whole reading trusts
  const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const filer = read(OR.ASK_FILER);
  const cuts = (src) => { const c = codeOnly(src); return ['…', '\\u2026'].filter((x) => c.includes(x)); };
  ok(OR.ASK_FILER === 'src/agent-routes/status.js' && cuts(filer).length === 0, `B-76dc: the ask filer (${OR.ASK_FILER}) builds no «…» of its own — the store's clip at its caps is an ask's only cut`, cuts(filer));
  ok(cuts(filer + "\nconst short = (s) => (s.length > 80 ? s.slice(0, 79) + '…' : s);\n").length === 1, 'B-76dc RED control: an ask filer that cuts a field itself (a planted `slice(0, 79) + \'…\'`) is caught by the census');
  // …AND NO PRODUCER CUTS A FIELD AT THE STORE'S CAPS WITHOUT THE MARK (kb «Left (named, backlog B-76dc)»: a desktop app's notice was
  // pre-sliced to exactly TEXT_MAX / DETAIL_MAX, so the store saw no overflow and never marked the cut — a link cut there read whole).
  // Every store add call (`…todos.add(`, its own text, a balanced scan) is read: a `text:` / `detail:` that slices at a cap is a silent cut.
  const UTS = require(path.join(REPO, 'src/user-todos.js'));
  const capSlice = new RegExp(`\\b(text|detail)\\s*:[^\\n]*\\.slice\\(0,\\s*(${UTS.TEXT_MAX}|${UTS.DETAIL_MAX})\\)`);
  // each `userTodos.add(` CALL's own text (a balanced scan to its closing paren — never a neighbouring record that slices a `text:`)
  const ADD = /\b\w*[Tt]odos\.add\(/g;   // the store's add, by every name a filer holds it under (userTodos, todos, deps.userTodos…)
  const addCalls = (t) => [...t.matchAll(ADD)].map((m) => { let d = 0, j = m.index + m[0].length - 1; for (; j < t.length; j++) { const ch = t[j]; if (ch === '(') d++; else if (ch === ')' && --d === 0) break; } return t.slice(m.index, j + 1); });
  const filers = (src) => Object.entries(src).flatMap(([f, t]) => addCalls(codeOnly(t)).filter((c) => capSlice.test(c)).map((c) => `${f}: ${c.replace(/\s+/g, ' ').slice(0, 120)}`));
  const ALL = Object.fromEntries((function walk(d) { return fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []); })('src').map((f) => [f, read(f)]));
  const silent = filers(ALL);
  ok(Object.values(ALL).filter((t) => addCalls(t).length).length >= 10 && silent.length === 0, `B-76dc: no For-you producer cuts a text / detail at the store's caps (${UTS.TEXT_MAX} / ${UTS.DETAIL_MAX}) itself — the store cuts past them and marks the cut`, silent);
  const tipDAK = ALL['src/server/desktop-app-keeper.js'].replace("text: `${label}: ${note.summary || note.body}`, detail: note.summary ? note.body || null : null,", "text: `${label}: ${note.summary || note.body}`.slice(0, 500), detail: note.summary ? note.body.slice(0, 2000) || null : null,");   // stale-pins: kept (the train tip's line, planted)
  ok(tipDAK !== ALL['src/server/desktop-app-keeper.js'] && filers({ ...ALL, 'src/server/desktop-app-keeper.js': tipDAK }).length === 1, 'B-76dc RED control: the train tip\'s desktop-app notice (sliced to exactly 500 / 2000) is caught — the plant stands (the copy differs)');
}

// batch 47's cure (主开发 09:09Z, «as if a must»): A FIELD A PRODUCER CUT ITSELF IS NOT THE AGENT'S WHOLE WORDS. The browser hand-back
// filed a confirmation's target cut at 119 with its own «…» — and the card's target line it starts from is cut at 300 by
// src/browser-takeover.js confirmationTarget (a script at 200) — so B-3f50's whole-field rule drew a truncated address as a link that
// opens a wrong page. THE CURE: only the AGENT's own ask (isAsk — via 'ask') is read as whole words; a producer's item keeps the
// conservative reading (a «…» ending a line or the text is a cut); the hand-back no longer cuts again, its category rides before the
// target and the detail's target ends its line. Driven through the REAL chain: the upstream record → the card's target → the item.
console.log('\nbatch 47 cure: a producer\'s cut is a cut — only an agent\'s own ask is whole words');
{
  const RT = require(path.join(REPO, 'src/inbox-reply-text.js')), UT = require(path.join(REPO, 'src/user-todos.js')), OR = require(path.join(REPO, 'src/inbox-origin.js'));
  const BT = require(path.join(REPO, 'src/browser-takeover.js')), HB = require(path.join(REPO, 'src/server/browser-handback.js'));
  const lk = (x, o) => F.segmentText(x, o).filter((g) => g.t === 'link').map((g) => g.s);
  const URL400 = 'https://shop.example.com/checkout/confirm?order=' + 'a1b2c3d4'.repeat(42) + '&step=final';   // 395 chars
  const URL158 = 'https://shop.example.com/checkout/confirm?order=' + 'a1b2c3d4'.repeat(12) + '&step=final';
  /** the card the bridge reads off the stream (the REAL confirmationFromUpstream: its target line is cut at TARGET_MAX) */
  const cardOf = (params, category = null) => BT.confirmationFromUpstream({ type: 'result', id: 'cmd-9', confirmation_required: true, confirmation_id: 'c_9', action: 'navigate', ...(category ? { data: { category } } : {}), params }, 1000);
  /** the item the REAL hand-back files for that card (its fileInbox → a store stand-in keeping what it was handed) */
  const fileFrom = (mod, card) => {
    const got = [];
    const a = mod.create({ userTodos: { add: (key, item) => { got.push(item); return { id: 'ut-0000000c09', ...item }; } }, activeSessions: new Map([['sess-1', { name: 'Shop run' }]]), sessionKeyFor: (s, id) => 'key:' + id, log: { log() { }, warn() { } } });
    a.noteConfirmation({ kind: 'pending', sessionId: 'sess-1', browserKey: 'bk-1', confirmation: card });
    return got[0] || null;
  };
  const kept = (item) => RT.clip(String(item.text).trim(), UT.TEXT_MAX);   // the store's own cut (src/user-todos.js add)
  /** THE ROW's reading (src/lib/user-todos-row.js partsOf): whole only for the agent's own ask */
  const tray = (item, field) => lk(field === 'detail' ? item.detail : kept(item), { whole: OR.isAsk(item) });
  ok(gateOf(/text = clip\(rawText, TEXT_MAX\);/.test(read('src/user-todos.js'))) && BT.confirmationTarget({ params: { url: URL400 } }).length === 300, 'setup: the store keeps a field to TEXT_MAX through clip; the card\'s target line is cut at 300 with its mark (the producer chain this leg drives)');
  // (1) THE MUST'S SCENE through the real chain: a confirmed navigate to a 395-char URL
  const c400 = cardOf({ url: URL400 }), long = c400 && fileFrom(HB, c400), cutTok = URL400.slice(0, 299);
  ok(!!long && OR.isAsk(long) === false && gateOf(kept(long).endsWith(cutTok + '…')) && kept(long).length < UT.TEXT_MAX && tray(long, 'text').length === 0 && tray(long, 'detail').length === 0,
    'MUST: a confirmed navigate to a 395-char URL: the card cut it at 300 — the item\'s words and its detail draw the cut address as PLAIN WORDS (a producer\'s item: a «…» ending the text / a line is a cut), never a link to a wrong page', { text: long && kept(long), links: long && [tray(long, 'text'), tray(long, 'detail')] });
  const c158 = cardOf({ url: URL158 }, 'payment'), whole = c158 && fileFrom(HB, c158);
  ok(!!whole && whole.text === `The agent's browser is waiting for you to confirm "navigate" [payment] on ${URL158}` && J(tray(whole, 'text')) === J([URL158]) && J(tray(whole, 'detail')) === J([URL158]),
    '…a 158-char URL the card kept whole: the item carries it whole (the hand-back no longer cuts at 119), its category before it — the WHOLE address is the link, in the words and the detail', whole && whole.text);
  const cScript = cardOf({ script: 'fetch("' + URL400 + '")' }), scr = cScript && fileFrom(HB, cScript);
  ok(!!scr && gateOf(kept(scr).endsWith('…')) && verdictOf(tray(scr, 'text').every((l) => URL400.startsWith(l) === false || l === URL400)), '…a script cut at 200 through a URL: no truncated address is a link', scr && tray(scr, 'text'));
  // (2) THE AGENT'S OWN ASK keeps B-3f50: its whole field's line-end «…» of its own stays its link
  const ask = { origin: 'agent', via: 'ask', text: 'see https://docs.example.com/wiki/Setup…', detail: null };
  ok(gateOf(OR.isAsk(ask)) && J(tray(ask, 'text')) === J(['https://docs.example.com/wiki/Setup']), 'an AGENT\'S OWN ASK (via \'ask\'): its whole stored field is still read as its words — a «…» it wrote at the end keeps its link (B-3f50)');
  // RED CONTROLS: the tip before the cure (2f241bf12) — the producer's own 119 cut AND the row reading any plain-words item whole
  const { mutantCopies, copiesCensus } = await import(path.join(REPO, 'scripts/mutant-copy.mjs'));
  const SRC_HB = read('src/server/browser-handback.js');
  const NOW_T = "${c.category ? ` [${c.category}]` : ''}${tgt ? ` on ${tgt}` : ''}", OLD_T = "${tgt ? ` on ${tgt.length > 120 ? tgt.slice(0, 119) + '…' : tgt}` : ''}${c.category ? ` [${c.category}]` : ''}";   // stale-pins: kept — the RED control re-plants the producer's old 119 cut on purpose
  const NOW_D = "${tgt ? `What it acts on: ${tgt}\\n` : ''}", OLD_D = "${tgt ? `What it acts on: ${tgt}. ` : ''}";   // stale-pins: kept — the RED control re-plants the old detail on purpose
  ok(SRC_HB.split(NOW_T).length === 2 && SRC_HB.split(NOW_D).length === 2, 'setup: the producer\'s words and detail are ONE template each (the controls edit one place)');
  const MH = mutantCopies('foryou-links-handback', REPO);
  const old = fileFrom(MH.load('src/server/browser-handback.js', editAnchor(editAnchor(SRC_HB, NOW_T, OLD_T, "src/server/browser-handback.js"), NOW_D, OLD_D, "src/server/browser-handback.js"), 'own-cut'), cardOf({ url: URL158 })), oldWords = old && kept(old);   // no category: the must's scene
  const oldLinks = oldWords ? lk(oldWords, { whole: true }) : [];
  ok(!!oldWords && gateOf(oldWords.endsWith(URL158.slice(0, 119) + '…')) && J(oldLinks) === J([URL158.slice(0, 119)]),
    'RED CONTROL (the must\'s exact text): the producer\'s own cut at 119 read by the B-3f50 row (whole) — «…on https://shop.example.com/checkout/confirm?order=a1b2…» draws the TRUNCATED address as a link', { text: oldWords, links: oldLinks });
  ok(J(lk(kept(long), { whole: true })) === J([cutTok]), 'RED CONTROL: the cure\'s own producer read by the B-3f50 row (whole for every plain-words item) — the 300-cut address IS a link: the row\'s isAsk gate is what the MUST leg needs', lk(kept(long), { whole: true }));
  const oldDetail = fileFrom(MH.load('src/server/browser-handback.js', editAnchor(SRC_HB, NOW_D, OLD_D, "src/server/browser-handback.js"), 'old-detail'), c400);
  ok(!!oldDetail && J(lk(oldDetail.detail, { whole: false })) === J([cutTok]), 'RED CONTROL: the old detail («What it acts on: <target>. Open…») — the cut mark sits before «.», no reading counts it, the cut address is linked on every road', oldDetail && lk(oldDetail.detail, { whole: false }));
  for (const row of copiesCensus(MH.files, MH.dir, REPO, { label: 'batch 47 cure ' })) ok(verdictOf(row.pass), row.name, row.detail);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
