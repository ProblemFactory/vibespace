#!/usr/bin/env node
// test-path-linkify — where a file path ENDS in chat prose (src/path-linkify.js,
// the ONE definition the chat renderer uses). Owner screenshot 2026-09-10: a
// Chinese parenthetical after a path (`…/designs/（浏览器`) was swallowed into the
// link. CJK FILENAMES must keep linking; only punctuation terminates a path.
// ④⑤ (B-2dbc, userW inc-murolahg-3rtv): the REAL renderer never wraps text an
// earlier pass already made a link — a `/p/<id>` page link in chat copied its
// bare path and Cmd+click said "Not found" (the path pass re-wrapped its text).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { pathRe, cleanPath, CJK_PUNCT } = require(path.join(ROOT, 'src/path-linkify.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (${JSON.stringify(a)})`);
const links = (re, text) => { const out = []; text.replace(re, (raw) => { out.push(cleanPath(raw)); return raw; }); return out; };

console.log('① the shipped rule');
eq(links(pathRe(), '中文版在 /home/u/w/SharedContext/designs/（浏览器 1783 行、通讯 1657 行）'), ['/home/u/w/SharedContext/designs/'],
  'a fullwidth "（" ends the path (the owner screenshot)');
eq(links(pathRe(), '看 /home/u/文档/报告.md，然后 /tmp/x/y.txt。再看 /var/log/app.log：没有'), ['/home/u/文档/报告.md', '/tmp/x/y.txt', '/var/log/app.log'],
  'CJK filenames still link; fullwidth comma / period / colon end the path');
eq(links(pathRe(), '“/etc/hosts”和「/usr/bin/env」以及【/opt/x/y】…'), ['/etc/hosts', '/usr/bin/env', '/opt/x/y'],
  'curly quotes, corner brackets and lenticular brackets end it');
eq(links(pathRe(), 'see /a/b/c.js:12:3) and (/a/b/d.md).'), ['/a/b/c.js:12:3', '/a/b/d.md'],
  'ASCII behaviour unchanged: :line:col kept, trailing ) and . stripped');
// The raw rule DOES match the path part of a URL and a /p/<id> page path; the
// renderer prevents that by ORDER (URLs and page paths are linkified first) AND
// by skipping the link spans they made (_linkifyBareText) — ③ pins the wiring,
// ④ runs the real renderer.
eq(cleanPath('https://x.y/z）。'), 'https://x.y/z', 'cleanPath strips CJK trailing punctuation from URLs too');
eq(cleanPath('/home/u/项目'), '/home/u/项目', 'cleanPath never strips a CJK LETTER');
ok(/\\u3000-\\u303F/.test(CJK_PUNCT) && /\\uFF01-\\uFF0F/.test(CJK_PUNCT), 'the class covers CJK symbols + fullwidth ASCII punctuation, and skips fullwidth digits/letters (FF10-FF19, FF21-FF3A, FF41-FF5A)');
ok(!/\\uFF10|\\uFF21|\\uFF41/.test(CJK_PUNCT), '…the fullwidth digit/letter ranges are NOT in the class (a filename spelled with them stays linkable)');
eq(links(pathRe(), '/home/u/ＡＢＣ１２.txt。'), ['/home/u/ＡＢＣ１２.txt'], 'a fullwidth-letter filename still links');

console.log('② NEGATIVE CONTROL: the pre-fix rule (chat-renderers.js as shipped before 2.369.89)');
const PRE_FIX = /(?<![="'\w/])((?:~|\.\.?)?\/[^\0<>?\s!`&*()'":;\\][^\0<>?\s!`&*()'"\\:;]*(?:\/[^\0<>?\s!`&*()'"\\:;]+)+(?::\d+(?::\d+)?)?)/g;
const preClean = (p) => p.replace(/[`'".,;:!?)}\]]+$/, '');
const pre = []; '中文版在 /home/u/w/SharedContext/designs/（浏览器 1783 行'.replace(PRE_FIX, (raw) => { pre.push(preClean(raw)); return raw; });
eq(pre, ['/home/u/w/SharedContext/designs/（浏览器'], 'the retired rule swallows the "（" and the word after it — the defect reproduces');

console.log('③ WIRING PIN: the renderer uses the shared definition and carries no local copy');
const cr = fs.readFileSync(path.join(ROOT, 'src/lib/chat-renderers.js'), 'utf8');
ok(/from '\.\.\/path-linkify\.js'/.test(cr), 'chat-renderers imports src/path-linkify.js');
ok(/const pathRe = sharedPathRe\(\)/.test(cr) && /cleanPath\(p\) \{ return sharedCleanPath\(p\); \}/.test(cr), 'both the path regex and cleanPath delegate to it');
ok(!/\[\^\\0<>\?\\s!`&\*\(\)'":;\\\\\]/.test(cr), 'no inline copy of the old character class survives in the renderer');
ok(/linkifyPathsTagSafe\(this\.linkifyPagePaths\(this\.linkifyUrls\(text\)\)/.test(cr), 'ORDER pin: URLs and /p/<id> pages are linkified BEFORE paths (the path rule would match their path part)');
ok(/linkifyPagePaths\(text\) \{\n    return this\._linkifyBareText\(text,/.test(cr) && /return this\._linkifyBareText\(html, \(txt\) => txt\.replace\(pathRe,/.test(cr),
  'SKIP pin (B-2dbc): the page pass and the path pass both run through _linkifyBareText, so neither touches a tag or a link span an earlier pass made');

console.log('④ THE REAL RENDERER (esbuild → node, DOM shimmed): no linkifier wraps text already inside a .chat-link (B-2dbc)');
// The sanitizer is identity here: it needs a DOM, runs BEFORE linkify, and never
// makes a link span (it strips product classes) — scripts/test-page-link-ui runs
// the real one in chrome. `patch` rewrites the renderer source in memory (⑤).
const require2 = createRequire(path.join(ROOT, 'package.json'));
const esbuild = require2('esbuild');
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tpl-'));
const RENDERER = path.join(ROOT, 'src/lib/chat-renderers.js');
let built = 0;
async function renderer(patch) {
  const out = path.join(SCR, `chat-renderers-${built++}.mjs`);
  const plug = { name: 'tpl', setup(b) {
    b.onResolve({ filter: /(build-version|safe-html)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'tpl-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'tpl-stub' }, (a) => ({ contents: a.path === 'safe-html.js' ? 'export const sanitizeHtml = (h) => h;' : "export const BUILD_VERSION = 'test';", loader: 'js' }));
    if (patch) b.onLoad({ filter: /chat-renderers\.js$/ }, (a) => ({ contents: patch(fs.readFileSync(a.path, 'utf8')), loader: 'js', resolveDir: path.dirname(a.path) }));
  } };
  await esbuild.build({ entryPoints: [RENDERER], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [plug] });
  const { ChatRenderers } = await import(out);
  return new ChatRenderers({ ws: null, sessionId: 's', app: {}, backend: 'claude', compact: false, messageList: mkEl() });
}
const mkEl = () => ({ className: '', dataset: {}, _html: '', classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }, set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, setAttribute() {}, getAttribute() { return null; } });
{
  const noop = () => {};
  for (const [k, v] of Object.entries({ addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: noop, getComputedStyle: () => ({ getPropertyValue: () => '' }), innerWidth: 1024, innerHeight: 768, location: { origin: 'http://test', href: 'http://test/', hostname: 'test', protocol: 'http:' }, scrollTo: noop })) {
    try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch {}
  }
  class NoopObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  for (const k of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) { try { Object.defineProperty(globalThis, k, { value: NoopObserver, configurable: true, writable: true }); } catch {} }
  globalThis.window = globalThis;
  globalThis.document = { createElement: mkEl, getElementById: () => null, body: mkEl(), documentElement: mkEl(), head: mkEl(), addEventListener: noop, removeEventListener: noop, querySelector() { return null; }, querySelectorAll() { return []; }, createTextNode: (t) => ({ textContent: t }) };
  try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true, writable: true }); } catch {}
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}
const isLinkTag = (name, attrs) => /\bclass="(?:[^"]*\s)?chat-link(?:\s[^"]*)?"/.test(attrs) || (name.toLowerCase() === 'a' && /\bhref=/.test(attrs));
/** Links opened while another link is still open, plus tags with a `<` inside an attribute (a pass that rewrote markup). */
function offenders(h) {
  const re = /<(\/?)(span|a)\b([^>]*)>/gi; const open = []; let m, nested = 0;
  while ((m = re.exec(h))) { if (m[1]) open.pop(); else { const link = isLinkTag(m[2], m[3]); if (link && open.includes(true)) nested++; open.push(link); } }
  const broken = (h.match(/<[a-z]+\b[^>]*>/gi) || []).filter((tag) => /="[^"]*</.test(tag)).length;
  return nested + broken;
}
const spans = (h) => [...h.matchAll(/<span class="(chat-link[^"]*)"( data-(?:href|path|rel)="[^"]*")[^>]*>([^<]*)<\/span>/g)].map((m) => `${m[1]}|${m[2].trim()}|${m[3]}`);
const userW = '原型：VibeSpace 私有页 /p/pg5vex1gylcn（文件 /home/userW/x/D-userWpay-dev/ap-system-prototype.html）';
const CORPUS = [
  userW,
  'raw view /p/pg5vex1gylcn/raw and two /p/pgaaaaaaaaaa, /p/pg0123456789.',
  'repo https://github.com/ProblemFactory/vibespace/pull/12 and https://x.example/p/pg5vex1gylcn?a=1&b=2',
  'a page inside a url https://x.y/a-/p/pg5vex1gylcn end',
  'paths /home/u/w/a.md:12:3 and ~/x/y.js and ../a/b.txt and ./c/d.sh',
  '看 /home/u/文档/报告.md，然后 /tmp/x/y.txt。再看 /var/log/app.log：没有',
  'rel `B2BTasks/x/final/` and `SCRIPTS.md` and `generate.py`',
  'md [page](/p/pg5vex1gylcn) and [doc](https://x.example/a/b) and [file](/home/u/a.md)',
  'no links here, version 1.2.3 and 10.0.0.0/8',
];
// the three ways chat text reaches the linkifier: tool output, an assistant message, a code span in one
const ENTRIES = { 'tool output': (r, s) => r.linkifyText(s), 'assistant message': (r, s) => r.renderMarkdown(s), 'code span': (r, s) => r.renderMarkdown('`' + s.replace(/`/g, '') + '`') };
const table = (r) => CORPUS.flatMap((s) => Object.entries(ENTRIES).map(([entry, fn]) => ({ s, entry, html: fn(r, s) })));
const head = await renderer(null);
const PAGE = 'chat-link|data-href="http://test/p/pg5vex1gylcn"|/p/pg5vex1gylcn';
const FILE = 'chat-link chat-link-path|data-path="/home/userW/x/D-userWpay-dev/ap-system-prototype.html"|/home/userW/x/D-userWpay-dev/ap-system-prototype.html';
for (const entry of ['assistant message', 'tool output']) {
  const h = ENTRIES[entry](head, userW);
  eq(spans(h), [PAGE, FILE], `the userW message as ${entry}: ONE page span holding bare text, the file path its own span`);
}
const GH = 'https://github.com/ProblemFactory/vibespace/pull/12';
for (const entry of ['code span', 'tool output']) eq(spans(ENTRIES[entry](head, GH)), [`chat-link|data-href="${GH}"|${GH}`], `a URL as ${entry}: one span, no path span inside it (it covered "//github.com/…")`);
eq(spans(head.linkifyText('a page inside a url https://x.y/a-/p/pg5vex1gylcn end')), ['chat-link|data-href="https://x.y/a-/p/pg5vex1gylcn"|https://x.y/a-/p/pg5vex1gylcn'], 'the page pass never rewrites a URL span (it put a span INSIDE its data-href)');
const H = table(head);
const bad = H.filter((x) => offenders(x.html));
ok(!bad.length, `CENSUS: ${H.length} cells (${CORPUS.length} texts × ${Object.keys(ENTRIES).length} entries), no link inside a link, no markup inside an attribute` + (bad.length ? ' — ' + bad.map((x) => `${x.entry}: ${x.html}`).join(' ¦ ').slice(0, 900) : ''));
ok(H.filter((x) => /chat-link/.test(x.html)).length >= 18, `…and the census REACHED the linkifier (${H.filter((x) => /chat-link/.test(x.html)).length} cells carry a link span)`);

console.log('⑤ PRE-FIX CONTROL (a patched copy: _linkifyBareText without the link-span skip = the old tag split) + byte identity');
const SKIP = '(<span class="chat-link[^"]*"[^>]*>[^<]*<\\/span>)|';
let patched = 0;
const preFix = await renderer((src) => { patched = src.split(SKIP).length - 1; return src.split(SKIP).join('((?!))|'); });
ok(patched === 1, `the control's patch applied exactly once (${patched})`);
const W = ENTRIES['assistant message'](preFix, userW);
ok(/<span class="chat-link" data-href="http:\/\/test\/p\/pg5vex1gylcn"[^>]*><span class="chat-link chat-link-path" data-path="\/p\/pg5vex1gylcn"/.test(W), 'the defect reproduces: span.chat-link > span.chat-link.chat-link-path data-path="/p/pg5vex1gylcn" (what the click handler found)', W);
const P0 = table(preFix);
const redCells = P0.filter((x) => offenders(x.html));
ok(redCells.length >= 9, `the census goes RED on it (${redCells.length} cells: page links, URLs in code / tool output)`);
const same = P0.map((x, i) => ({ ...x, now: H[i].html })).filter((x) => !offenders(x.html));
const moved = same.filter((x) => x.html !== x.now);
ok(same.length >= 15 && !moved.length, `BYTE IDENTITY: every cell the pre-fix rule rendered without a nested link is unchanged (${same.length} cells: paths, CJK, relative, markdown links, URLs in prose)` + (moved.length ? ' — ' + moved.map((x) => x.entry + ': ' + x.html + ' → ' + x.now).join(' ¦ ').slice(0, 900) : ''));
fs.rmSync(SCR, { recursive: true, force: true });

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
