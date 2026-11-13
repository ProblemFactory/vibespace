#!/usr/bin/env node
// test-path-linkify — where a file path ENDS in chat prose (src/path-linkify.js,
// the ONE definition the chat renderer uses). Owner screenshot 2026-09-10: a
// Chinese parenthetical after a path (`…/designs/（浏览器`) was swallowed into the
// link. CJK FILENAMES must keep linking; only punctuation terminates a path.
// ④⑤ (B-2dbc, userW inc-murolahg-3rtv): the REAL renderer never wraps text an
// earlier pass already made a link — a `/p/<id>` page link in chat copied its
// bare path and Cmd+click said "Not found" (the path pass re-wrapped its text).
// ⑥⑦ (lane path-link-not-found, userW inc-mv1tlrix-eklc): a link that cannot be
// opened is SAID (a toast: the path, the machine, a way on) and every link open's
// end is an op-ring row — the path itself never.
// ⑩ (lane card-door-in-chat, the owner 2026-11-07: a mail card in his agent's chat, its attachment row's ⤓ pressed ⇒
// «已复制！» and no file — «这个按钮怎么是复制？！»): the chat's link delegation acts on the chat's OWN links only (a
// .chat-link span, a bare markdown anchor); every card kind's door drawn inside the chat (a classed anchor,
// src/lib/card-doors.js) is left to its card — no preventDefault, no copy, no flash, no menu. CONTROLS: the chat's own
// links copy + flash as before. (⑨ is lane mask-value-shape's, the same train.)
// ⑧ (lane agy-links-file-url, the owner 2026-10-21 in an Antigravity conversation: «文件链接怎么都点不了»): a path is a
// path whatever syntax the harness writes it in — a `file:` URL (an anchor's, or bare), `<a href="/home/…">` — and
// whatever script its first letter is (`标书研究/方案.md`); RED CONTROL = the base (the anchor dead, the path plain).
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
// lane mask-value-shape r9: ONE trailing walk — cleanPath IS the backward walk over THE set (isTrailing), linear. PARITY with the regex it
// replaced (`[…]+$`, the base's definition rebuilt here from the same CJK_PUNCT): (1) isTrailing ≡ the old class on every UTF-16 unit;
// (2) the old regex and the new walk give the SAME string on every string literal of the lane's suites (and each blank-split token of one)
// and on a seeded random corpus over the set, letters, slashes, CJK and a surrogate pair. The cost is pinned by the count in test-masked-note-chrome
{
  const PL = require(path.join(ROOT, 'src/path-linkify.js'));
  const OLD_CLASS = new RegExp('[`\'".,;:!?)}\\]' + CJK_PUNCT + ']'), OLD = new RegExp('[`\'".,;:!?)}\\]' + CJK_PUNCT + ']+$');
  const oldClean = (p) => String(p).replace(OLD, '');
  const isT = typeof PL.isTrailing === 'function' ? PL.isTrailing : null;
  let classDiff = isT ? 0 : -1;
  if (isT) for (let c = 0; c < 0x10000; c++) { const ch = String.fromCharCode(c); if (isT(ch) !== OLD_CLASS.test(ch)) classDiff++; }
  ok(classDiff === 0, `r9: isTrailing (path-linkify, exported) is the old trailing class on all 65 536 UTF-16 units${classDiff < 0 ? ' — no isTrailing export (a tree before r9)' : classDiff ? ' — ' + classDiff + ' differ' : ''}`);
  const corpus = new Set();
  for (const f of ['test-path-linkify', 'test-secret-shapes', 'test-user-todos-layout', 'test-foryou-links', 'test-masked-note-chrome', 'test-user-todos-honest', 'test-stash-strip']) {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', f + '.mjs'), 'utf8');
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.){0,2000})'|"((?:[^"\\\n]|\\.){0,2000})"|`((?:[^`\\$]|\\.){0,2000})`/g)) { const s = m[1] ?? m[2] ?? m[3]; corpus.add(s); for (const t of s.split(/\s+/)) corpus.add(t); }
  }
  const lits = corpus.size;
  const AL = ['.', ',', ';', ':', '!', '?', ')', '}', ']', '`', "'", '"', '–', '—', '。', '，', '）', '」', '々', '〜', '…', '“', '”', '～', 'a', 'Z', '0', '/', '人', '_', '-', '(', '[', ' ', '\u{1F600}', '%'];
  let seed = 0x2369388;
  const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };   // 32-bit LCG (Math.imul: no float rounding), its high bits
  for (let i = 0; i < 20000; i++) { let s = ''; const len = rnd(49); for (let j = 0; j < len; j++) s += AL[rnd(AL.length)]; corpus.add(s); }
  const diff = [...corpus].filter((s) => cleanPath(s) !== oldClean(s));
  ok(diff.length === 0, `r9: cleanPath (the backward walk) gives the old regex's verdict on every one of ${corpus.size} strings (${lits} string literals + tokens of the lane's suites, the rest a seeded random corpus)${diff.length ? ' — differ: ' + JSON.stringify(diff.slice(0, 5)) : ''}`);
  ok(!/\.replace\(TRAILING/.test(fs.readFileSync(path.join(ROOT, 'src/path-linkify.js'), 'utf8')) && !/const TRAIL_CH_RE = new RegExp/.test(fs.readFileSync(path.join(ROOT, 'src/lib/foryou-links.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'src/lib/chat-renderers.js'), 'utf8')), 'r9: ONE definition of the trailing set — path-linkify cleanPath walks it (no `[…]+$` replace), For-you and the chat import isTrailing (no copy of their own)');
}
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
ok(/linkifyPathsTagSafe\(this\.linkifyPagePaths\(this\.linkifyFileUrls\(this\.linkifyUrls\(text\)\)\)/.test(cr), 'ORDER pin: URLs, file: URLs and /p/<id> pages are linkified BEFORE paths (the path rule would match their path part)');
ok(/linkifyPagePaths\(text\) \{\n    return this\._linkifyBareText\(text,/.test(cr) && /linkifyFileUrls\(text\) \{\n    return this\._linkifyBareText\(text,/.test(cr) && /return this\._linkifyBareText\(html, \(txt\) => txt\.replace\(pathRe,/.test(cr),
  'SKIP pin (B-2dbc): the page, file: URL and path passes all run through _linkifyBareText, so none touches a tag or a link span an earlier pass made');

console.log('④ THE REAL RENDERER (esbuild → node, DOM shimmed): no linkifier wraps text already inside a .chat-link (B-2dbc)');
// The sanitizer needs a DOM, runs BEFORE linkify, and never makes a link span (it
// strips product classes) — scripts/test-page-link-ui runs the real one in chrome.
// Here it is a stub that keeps an href only where DOMPurify's OWN URI rule does
// (URI_RULE, pinned to node_modules/dompurify below): a `file:` href is dropped
// as in the product, so ⑧'s base control sees the dead anchor the owner clicked.
// `patch` rewrites the renderer source in memory (⑤), `opts.linkify` src/path-linkify.js (⑧).
const require2 = createRequire(path.join(ROOT, 'package.json'));
const esbuild = require2('esbuild');
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tpl-'));
const RENDERER = path.join(ROOT, 'src/lib/chat-renderers.js');
let built = 0;
const URI_RULE = String.raw`^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))`;
const SANITIZE_STUB = `const OK = new RegExp(${JSON.stringify(URI_RULE)}, 'i');
export const sanitizeHtml = (h) => h.replace(/(<a\\b[^>]*?)\\shref="([^"]*)"/gi, (m, pre, v) => (OK.test(v.replace(/[\\u0000-\\u0020]/g, '')) ? m : pre));
export const sanitizeDiagramSvg = () => ''; // lane chat-mermaid: the diagram door's wall (chat-renderers → mermaid-render), never reached here`;
async function renderer(patch, opts = {}) {
  const out = path.join(SCR, `chat-renderers-${built++}.mjs`);
  const plug = { name: 'tpl', setup(b) {
    b.onResolve({ filter: /(build-version|safe-html)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'tpl-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'tpl-stub' }, (a) => ({ contents: a.path === 'safe-html.js' ? SANITIZE_STUB : "export const BUILD_VERSION = 'test';", loader: 'js' }));
    if (patch) b.onLoad({ filter: /chat-renderers\.js$/ }, (a) => ({ contents: patch(fs.readFileSync(a.path, 'utf8')), loader: 'js', resolveDir: path.dirname(a.path) }));
    if (opts.linkify) b.onLoad({ filter: /path-linkify\.js$/ }, (a) => ({ contents: opts.linkify(fs.readFileSync(a.path, 'utf8')), loader: 'js', resolveDir: path.dirname(a.path) }));
  } };
  await esbuild.build({ entryPoints: [RENDERER], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [plug] });
  const { ChatRenderers } = await import(out);
  return new ChatRenderers({ ws: null, sessionId: 's', app: opts.app || {}, backend: 'claude', compact: false, messageList: opts.list || mkEl(), getSessionCtx: opts.ctx || null });
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
  'agy [SKILL.md](file:///home/u/标书研究/SKILL.md)、[a.js](file://localhost/home/u/a.js:12) and the output at file:///home/u/x/out.txt and `标书研究/方案.md`',
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
console.log('⑥ A LINK THAT CANNOT BE OPENED IS SAID — the real renderer over a fake DOM, fetch and op ring (lane path-link-not-found)');
// a small element: children, classes, text, listeners — enough for showToast / showContextMenu / flashLink
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.style = {}; this.dataset = {}; this.attrs = {}; this._c = new Set(); this.textContent = ''; this.parentNode = null; this.ls = {}; this.id = ''; }
  get className() { return [...this._c].join(' '); }
  set className(v) { this._c = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() { const c = this._c; return { add: (...a) => a.forEach((x) => c.add(x)), remove: (...a) => a.forEach((x) => c.delete(x)), contains: (x) => c.has(x), toggle: (x, f) => ((f ?? !c.has(x)) ? c.add(x) : c.delete(x)) }; }
  append(...k) { for (const x of k) this.appendChild(x); }
  appendChild(k) { k.parentNode = this; this.children.push(k); return k; }
  remove() { const p = this.parentNode; if (p) p.children = p.children.filter((x) => x !== this); this.parentNode = null; }
  get firstChild() { return this.children[0] || null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(t, f) { (this.ls[t] ||= []).push(f); }
  removeEventListener() {}
  contains(x) { for (let n = x; n; n = n.parentNode) if (n === this) return true; return false; }
  getBoundingClientRect() { return { left: 10, top: 10, right: 110, bottom: 30, width: 100, height: 20 }; }
  get offsetParent() { return null; }
  closest(sel) { const cls = String(sel).split(',')[0].trim().replace(/^\./, ''); for (let n = this; n; n = n.parentNode) if (n._c && n._c.has(cls)) return n; return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  select() {}
  get text() { return this.textContent + this.children.map((c) => c.text).join(''); }
}
const DOC = { body: new El('body'), createElement: (t) => new El(t), createTextNode: (t) => Object.assign(new El('#text'), { textContent: t }), addEventListener() {}, removeEventListener() {}, execCommand: () => true,
  documentElement: new El('html'), head: new El('head'), querySelector() { return null; }, querySelectorAll() { return []; },
  getElementById(id) { const walk = (n) => { if (n.id === id) return n; for (const k of n.children) { const f = walk(k); if (f) return f; } return null; }; return walk(DOC.body); } };
const saved = { document: globalThis.document, fetch: globalThis.fetch, open: globalThis.open };
globalThis.document = DOC;
const clip = [];
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node', clipboard: { writeText: async (x) => { clip.push(x); } } }, configurable: true, writable: true });
let ROWS = [];
globalThis.__vsOp = (op, data) => ROWS.push({ t: Date.now(), op, ...(data || {}) });
const opened = [];
globalThis.open = (u) => opened.push(['tab', u]);
const APP = { openFile: (p, n, o) => opened.push(['file', p, o && o.line, o && o.host]), openFileExplorer: (p, o) => opened.push(['explorer', p, o && o.host]), sidebar: { _hostsData: { hosts: [{ id: 'h1', name: 'build-box' }] } } };
let FS = {}; let ASKED = []; let THROW = false; let HITS = [];
globalThis.fetch = async (u) => {
  ASKED.push(u);
  if (THROW) throw new TypeError('Failed to fetch');
  const q = new URL(u, 'http://x');
  if (q.pathname === '/api/file/locate') return { ok: true, json: async () => (q.searchParams.get('host') ? { hits: [], unsupported: 'remote' } : { hits: HITS }) };
  const p = q.searchParams.get('path');
  const e = FS[p];
  return { ok: true, json: async () => (e === 'dir' ? { path: p, isDirectory: true } : e === 'file' ? { path: p, size: 3, isDirectory: false } : e && typeof e === 'object' ? e : e ? { error: e } : { error: `ENOENT: no such file or directory, stat '${p}'` }) };
};
const toasts = () => { const st = DOC.getElementById('global-toasts'); return st ? st.children : []; };
const toastOf = (el) => el && ({ cls: el.className, body: el.children.find((c) => c._c.has('global-toast-body'))?.textContent, acts: el.children.filter((c) => c._c.has('global-toast-action')).map((c) => c.textContent) });
const clearToasts = () => { const st = DOC.getElementById('global-toasts'); if (st) st.remove(); };
const reset = () => { clearToasts(); ROWS = []; ASKED = []; opened.length = 0; clip.length = 0; THROW = false; HITS = []; };
const mkLink = (attrs) => { const a = new El('span'); a.className = 'chat-link chat-link-path'; Object.assign(a.dataset, attrs); const li = new El('div'); li.appendChild(a); return a; };
const leaks = (rows, p) => rows.filter((r) => Object.values(r).some((v) => typeof v === 'string' && (v.includes('/') || (p && v.includes(p)))));
const tick = () => new Promise((r) => setTimeout(r, 5));
let CTX = { cwd: '/w/proj', host: null };
const LIST = new El('div');
const R = await renderer(null, { app: APP, list: LIST, ctx: () => CTX });
const ABS = '/home/userW/x/out/report.md';

reset();
await R._openLinkTarget(mkLink({ path: ABS }), null, ABS);
let T = toastOf(toasts()[0]);
ok(toasts().length === 1 && /No such file on this machine: \/home\/userW\/x\/out\/report\.md — the agent may have written it elsewhere or removed it/.test(T?.body || ''), `a path that does not exist ⇒ ONE toast naming the FULL path and the machine (${T?.body})`);
eq(T?.acts, ['Copy path', 'Search by name', 'Open the nearest folder'], '…with its three ways on');
ok(/global-toast-warn/.test(T?.cls) && /global-toast-wide/.test(T?.cls), `…a warning, actions under the words (${T?.cls})`);
eq(ROWS.map(({ op, kind, outcome, host, base, len }) => ({ op, kind, outcome, host, base, len })), [{ op: 'link-open', kind: 'path', outcome: 'not-found', host: null, base: 'report.md', len: ABS.length }], '…and ONE op-ring row: kind, outcome, host, the basename + the length');
ok(typeof ROWS[0]?.t === 'number' && !leaks(ROWS, ABS).length, '…stamped, and no value in it carries the path');
const acts = () => toasts()[0].children.filter((c) => c._c.has('global-toast-action'));
await acts()[0].onclick({ stopPropagation() {} }); await tick();
eq(clip, [ABS], 'Copy path copies the FULL path (and closes the toast)');
ok(!toasts().length, '…the toast is gone after the press');
reset(); await R._openLinkTarget(mkLink({ path: ABS }), null, ABS);
FS = { '/home/userW/x': 'dir' };
await acts()[2].onclick({ stopPropagation() {} }); for (let i = 0; i < 5; i++) await tick();
eq(opened, [['explorer', '/home/userW/x', null]], 'Open the nearest folder walks up (out/ is gone too) and opens the explorer at the first folder that exists');
reset(); FS = {}; await R._openLinkTarget(mkLink({ path: ABS }), null, ABS);
HITS = ['/w/proj/docs/report.md']; await acts()[1].onclick({ stopPropagation() {} }); for (let i = 0; i < 5; i++) await tick();
ok(ASKED.some((u) => /\/api\/file\/locate\?name=report\.md&root=%2Fw%2Fproj&type=f/.test(u)), 'Search by name asks the bounded find for the basename under the session folder');
eq(opened, [['file', '/w/proj/docs/report.md', undefined, undefined]], '…one hit opens it');
reset(); await R._openLinkTarget(mkLink({ path: ABS }), null, ABS);
HITS = []; await acts()[1].onclick({ stopPropagation() {} }); for (let i = 0; i < 5; i++) await tick();
ok(/No file named report\.md under \/w\/proj/.test(toastOf(toasts()[0])?.body || ''), `…none is SAID (${toastOf(toasts()[0])?.body})`);

reset(); FS = { '/w/proj/docs': 'dir', '/w/proj/a.js': 'file' };
await R._openLinkTarget(mkLink({ path: '/w/proj/docs' }), null, '/w/proj/docs');
await R._openLinkTarget(mkLink({ path: '/w/proj/a.js:12' }), null, '/w/proj/a.js:12');
eq(opened, [['explorer', '/w/proj/docs', null], ['file', '/w/proj/a.js', 12, null]], 'a folder ⇒ the explorer, a file:line ⇒ the viewer at its line (unchanged)');
eq(ROWS.map((r) => `${r.kind}:${r.outcome}:${r.base}:${r.len}`), ['path:directory:docs:12', 'path:opened:a.js:12:15'], '…each a row (directory / opened)');
ok(!toasts().length, '…and no toast');

reset(); THROW = true;
await R._openLinkTarget(mkLink({ path: ABS }), null, ABS);
T = toastOf(toasts()[0]);
ok(/Could not ask the server whether \/home\/userW\/x\/out\/report\.md exists on this machine/.test(T?.body || '') && /global-toast-error/.test(T?.cls), `a fetch that throws ⇒ the same toast in "could not ask the server" words (${T?.body})`);
eq(ROWS.map((r) => r.outcome), ['error'], '…row outcome error');
reset(); FS = { [ABS]: 'EACCES: permission denied, open' };
await R._openLinkTarget(mkLink({ path: ABS }), null, ABS);
ok(/Could not open \/home\/userW\/x\/out\/report\.md on this machine: EACCES: permission denied/.test(toastOf(toasts()[0])?.body || ''), "a refusal that is not ENOENT says the server's words, never \"no such file\"");
// lane file-preview-mount (userW inc-mvq4hn9x): the mount guard's refusal arrives as a CODE — the toast says it in the
// reader's words (fsErrorText: the storage by name, the release, the way on), never the `error` the hub keeps for agents
reset(); FS = { [ABS]: { error: 'the hub’s English for agents', code: 'storage_sync_refused', params: { mount: 'NAS', release: '2.369.360' } } };
await R._openLinkTarget(mkLink({ path: ABS }), null, ABS);
T = toastOf(toasts()[0]);
ok((T?.body || '').startsWith('Could not open /home/userW/x/out/report.md on this machine: this file is on the storage «NAS», and this kind of preview cannot be shown for a file on a storage yet — download it, or copy it to a local folder and open it there')
  && !(T?.body || '').includes('the hub’s English') && /global-toast-error/.test(T?.cls), `a storage_sync_refused answer ⇒ the toast in the reader's words, never the raw text (${T?.body})`);

reset(); FS = {}; CTX = { cwd: '/w/proj', host: 'h1' };
await R._openLinkTarget(mkLink({ path: ABS }), null, ABS);
T = toastOf(toasts()[0]);
ok(/No such file on build-box: \/home\/userW\/x\/out\/report\.md/.test(T?.body || ''), `a remote session's link names ITS machine (${T?.body})`);
eq(T?.acts, ['Copy path', 'Open the nearest folder'], '…and offers no search (the remote door has no bounded find)');
eq(ROWS.map((r) => r.host), ['h1'], '…its row carries the host');
ok(ASKED.every((u) => /&host=h1/.test(u)), '…and it was looked for on that host');

reset(); CTX = { cwd: '/w/proj', host: null }; FS = {};
await R._openRelTarget(mkLink({ rel: 'docs/x.md' }), 'docs/x.md');
T = toastOf(toasts()[0]);
ok(/No such file on this machine: \/w\/proj\/docs\/x\.md/.test(T?.body || ''), `a relative path with no candidate ⇒ the same toast, naming the first place it looked (${T?.body})`);
ok(ASKED.some((u) => /\/api\/file\/locate\?name=x\.md&root=%2Fw%2Fproj&type=f/.test(u)), '…AFTER the bounded find under the session folder was asked (it threw on a stale name before)');
eq(ROWS.map((r) => `${r.kind}:${r.outcome}:${r.base}:${r.len}`), ['rel:not-found:x.md:9'], '…row kind rel, outcome not-found');
reset(); HITS = ['/w/proj/sub/docs/x.md'];
await R._openRelTarget(mkLink({ rel: 'docs/x.md' }), 'docs/x.md');
eq(opened, [['file', '/w/proj/sub/docs/x.md', undefined, null]], 'the bounded find works again: its one hit opens');
eq(ROWS.map((r) => r.outcome), ['opened'], '…row opened');
reset(); FS = { '/w/proj/docs/x.md': 'file' };
await R._openRelTarget(mkLink({ rel: 'docs/x.md' }), 'docs/x.md');
eq(ROWS.map((r) => `${r.kind}:${r.outcome}`), ['rel:opened'], 'a candidate that exists opens (row rel:opened)');

reset();
R._openLinkTarget(mkLink({ href: 'https://example.com/a/b?tok=1' }), 'https://example.com/a/b?tok=1', null);
eq(opened, [['tab', 'https://example.com/a/b?tok=1']], 'a URL opens a tab');
eq(ROWS.map((r) => `${r.kind}:${r.outcome}:${r.base}`), ['url:opened:'], '…its row keeps no part of the URL (only its length)');

reset();
const click = (list, link, mod) => list.ls.click[0]({ target: link, preventDefault() {}, stopPropagation() {}, ctrlKey: !!mod, metaKey: false, clientX: 5, clientY: 5 });
click(LIST, mkLink({ path: ABS })); await tick();
eq([clip, ROWS.map((r) => r.outcome)], [[ABS], ['copied']], 'a plain click copies — row copied');
reset(); click(LIST, mkLink({ path: ABS }), true); for (let i = 0; i < 3; i++) await tick();
eq(ROWS.map((r) => r.outcome), ['not-found'], 'Ctrl/Cmd+click opens — the not-found end');
reset(); LIST.ls.contextmenu[0]({ target: mkLink({ path: ABS }), preventDefault() {}, stopPropagation() {}, clientX: 5, clientY: 5 });
eq(ROWS.map((r) => r.outcome), ['menu'], 'a right-click menu — row menu');
const TLIST = new El('div');
await renderer(null, { app: { ...APP, isTouch: true }, list: TLIST, ctx: () => CTX });
reset(); click(TLIST, mkLink({ path: ABS }));
eq(ROWS.map((r) => `${r.kind}:${r.outcome}`), ['path:menu'], 'the phone: a tap is the Open / Copy menu — row menu');
const ROWS_OK = ROWS;

console.log('⑦ CONTROLS (patched copies of the renderer)');
const LEAK_FROM = "base: kind === 'url' ? '' : s.replace(/[\\/]+$/, '').split('/').pop().slice(0, 60)";
let n7 = 0;
const leaky = await renderer((src) => { n7 = src.split(LEAK_FROM).length - 1; return src.split(LEAK_FROM).join('base: s'); }, { app: APP, list: new El('div'), ctx: () => CTX });
ok(n7 === 1, `the leak control's patch applied exactly once (${n7})`);
reset(); await leaky._openLinkTarget(mkLink({ path: ABS }), null, ABS);
ok(leaks(ROWS, ABS).length === 1 && !leaks(ROWS_OK, ABS).length, 'RED CONTROL: a row that stores the full path is caught by the same check');
const NORM = "        const norm = rel.replace(/\\/+$/, '');";
let n7b = 0;
const stale = await renderer((src) => { n7b = src.split(NORM).length - 1; return src.split(NORM).join('        void 0;'); }, { app: APP, list: new El('div'), ctx: () => CTX });
ok(n7b === 1, `the stale-name control's patch applied exactly once (${n7b})`);
reset(); FS = {}; HITS = ['/w/proj/sub/docs/x.md'];
await stale._openRelTarget(mkLink({ rel: 'docs/x.md' }), 'docs/x.md');
ok(!ASKED.some((u) => /\/api\/file\/locate/.test(u)) && !opened.length, 'RED CONTROL: the stale name (the 2.369.247 line) never reaches the bounded find — the leg above is red on it');
clearToasts();
globalThis.document = saved.document; globalThis.fetch = saved.fetch; globalThis.open = saved.open;

console.log('⑧ A PATH IS A PATH WHATEVER SYNTAX THE HARNESS WRITES IT IN — a file: URL, an anchor, a first letter of any script (lane agy-links-file-url)');
const PL = require(path.join(ROOT, 'src/path-linkify.js'));
ok(fs.readFileSync(path.join(ROOT, 'node_modules/dompurify/dist/purify.es.mjs'), 'utf8').includes(`IS_ALLOWED_URI = seal(/${URI_RULE}/i `), "the harness's sanitizer stub keeps an href only where DOMPurify's own URI rule does (the rule read from node_modules/dompurify — a file: href is dropped there)");
const FURL = [
  ['file:///home/u/标书研究/SKILL.md', '/home/u/标书研究/SKILL.md', 'raw UTF-8 (what Antigravity writes)'],
  ['file:///home/u/%E6%A0%87%E4%B9%A6%E7%A0%94%E7%A9%B6/SKILL.md', '/home/u/标书研究/SKILL.md', "percent-encoded CJK (marked's href) — decoded"],
  ['file://localhost/home/u/a.js:12', '/home/u/a.js:12', 'a host part (localhost) dropped, the :line kept'],
  ['file://box/home/u/a.js', '/home/u/a.js', 'any host name dropped'],
  ['file:/home/u/a.md', '/home/u/a.md', 'one slash'],
  ['FILE:///x/y.md', '/x/y.md', 'the scheme in any case'],
  ['file:///a/b.py#L12-L20', '/a/b.py:12-20', 'a #L12-L20 fragment ⇒ the :12-20 a bare path carries'],
  ['file:///a/b.py#L7', '/a/b.py:7', '#L7 ⇒ :7'],
  ['file:///a/b.md#intro', '/a/b.md', 'any other fragment dropped'],
  ['file:///a/b.md?v=1', '/a/b.md', 'a query dropped'],
  ['file:///a/100%.md', '/a/100%.md', 'a % that is no escape stays'],
  ['file:///a/%FF.md', '/a/%FF.md', 'a run that is not UTF-8 stays as written'],
  ['file:///', '/', 'the root'],
  ['file://box', null, 'a host and no path'],
  ['file:////srv/share/a', null, 'a //server/share (never a local path)'],
  ['file:///a/%00b', null, 'a control character'],
  ['file:javascript:alert(1)', null, 'no absolute path'],
  ['conversation://49120000-0000-4000-8000-0000000000b1', null, 'another scheme (lane agy-subagent-cards owns conversation://)'],
  ['https://x.example/a/b', null, 'a web URL'],
];
const badU = FURL.filter(([u, want]) => PL.fileUrlPath(u) !== want).map(([u, want, why]) => ({ u, want, got: PL.fileUrlPath(u), why }));
ok(!badU.length, `fileUrlPath: ${FURL.length} rows — file:///p, file://<host>/p, file:/p, percent-decoded (UTF-8), #L12-L20 ⇒ :12-20, :line kept, null for no local path` + (badU.length ? ' — ' + JSON.stringify(badU) : ''));
const HREF = [
  ['/home/u/%E6%A0%87%E4%B9%A6/a.md', '/home/u/标书/a.md', "an anchor's absolute path, percent-decoded (marked's href encodes it)"],
  ['~/x/y.md', '~/x/y.md', '~/…'],
  ['file:///z/a.md', '/z/a.md', 'a file: URL'],
  ['//host/x', null, 'a //host'],
  ['docs/a.md', null, 'a relative href (a URL, as today)'],
  ['/a/%0Ab', null, 'a control character'],
  ['javascript:alert(1)', null, 'a script'],
];
const badH = HREF.filter(([u, want]) => PL.hrefPath(u) !== want).map(([u, want, why]) => ({ u, want, got: PL.hrefPath(u), why }));
ok(!badH.length, `hrefPath: ${HREF.length} rows — the chat's click rule (/…, ~/…, never //host, never a scheme) plus file:, percent-decoded` + (badH.length ? ' — ' + JSON.stringify(badH) : ''));
const REL = [
  ['标书研究/方案.md', true], ['方案.md', true], ['標準/テスト.txt', true], ['한국어/파일.md', true], ['１２３/a.md', true], ['é/x.md', true], ['docs/方案.md', true], ['_x/y.md', true],
  ['（草稿）/a.md', false], ['「x」/a.md', false], ['标书 研究/a.md', false], ['标书研究', false], ['1.2.3', false], ['10.0.0.0/8', false],
];
const badR = REL.filter(([s, want]) => PL.looksRelPath(s) !== want);
ok(PL.looksRelPath('docs/plan.md', { prose: true }) && !PL.looksRelPath('标书研究/方案.md', { prose: true }) && !PL.looksRelPath('请看docs/plan.md', { prose: true }), 'in PROSE (the For-you words) the first letter stays ASCII: a CJK word glued to a path (请看docs/plan.md) cannot be told from a CJK folder name');
ok(!badR.length, `looksRelPath: ${REL.length} rows — a first letter or digit of ANY script links (CJK, kana, hangul, fullwidth digits, é); punctuation first, a space, no slash + no file tail, versions / CIDR still do not` + (badR.length ? ' — ' + JSON.stringify(badR) : ''));
const GATE = "/^[\\p{L}\\p{N}_@%+=.\\-][^\\s<>\"'`|]*$/u.test(txt)";
const PL_SRC = fs.readFileSync(path.join(ROOT, 'src/path-linkify.js'), 'utf8');
const BASE_GATE = (src) => src.split(GATE).join("/^[\\w@%+=.\\-][^\\s<>\"'`|]*$/.test(txt)");
ok(PL_SRC.split(GATE).length === 2, 'the Unicode-aware gate is the one line the base control patches');
const plBase = path.join(SCR, 'path-linkify-base.cjs'); fs.writeFileSync(plBase, BASE_GATE(PL_SRC));
const PLB = require(plBase);
ok(PLB.looksRelPath('标书研究/方案.md') === false && PLB.looksRelPath('docs/方案.md') === true, "RED CONTROL: the base's ASCII gate (JS \\w) refuses 标书研究/方案.md and passes docs/方案.md — the CJK-first row above is red on it");

const UUID = '49120000-0000-4000-8000-0000000000b1';
const P1 = 'chat-link chat-link-path';
const AGY = '已完成（含[SKILL.md](file:///home/u/标书研究/.agents/skills/x/SKILL.md)、[inspect.py](file:///home/u/%E6%A0%87%E4%B9%A6%E7%A0%94%E7%A9%B6/scripts/inspect.py)）';
const ROWS8 = [
  ['md', AGY, [`${P1}|data-path="/home/u/标书研究/.agents/skills/x/SKILL.md"|SKILL.md`, `${P1}|data-path="/home/u/标书研究/scripts/inspect.py"|inspect.py`], "Antigravity's message: each file: link (raw UTF-8, percent-encoded) ONE path span, the decoded path, the link's text"],
  ['md', '[a.js](file://localhost/home/u/a.js:12)', [`${P1}|data-path="/home/u/a.js:12"|a.js`], 'file://localhost/…:12 ⇒ the path with its :12, like a bare path'],
  ['md', '[b.py](file:///a/b.py#L12-L20)', [`${P1}|data-path="/a/b.py:12-20"|b.py`], '#L12-L20 ⇒ :12-20'],
  ['md', '<a href="file:///home/u/x.md">raw</a>', [`${P1}|data-path="/home/u/x.md"|raw`], 'a raw-HTML file: anchor too'],
  ['md', '[doc](/home/u/标书研究/a.md)', [`${P1}|data-path="/home/u/标书研究/a.md"|doc`], 'the same span for <a href="/home/…"> — decoded (it was /home/u/%E6%A0%87…, never found)'],
  ['md', '[`SKILL.md`](file:///a/SKILL.md) and [a &amp; b](file:///a/b%20c.md)', [`${P1}|data-path="/a/SKILL.md"|SKILL.md`, `${P1}|data-path="/a/b c.md"|a &amp; b`], "the label is the link's TEXT (markup dropped, escaped once)"],
  ['md', 'the full output in a file at file:///home/u/x/out.txt.', [`${P1}|data-path="/home/u/x/out.txt"|file:///home/u/x/out.txt`], 'a bare file: URL in a message ⇒ ONE path span (it was "file:" + a ///… path)'],
  ['text', 'Log: file:///home/u/%E6%A0%87/run.log', [`${P1}|data-path="/home/u/标/run.log"|file:///home/u/%E6%A0%87/run.log`], 'a bare file: URL in tool output ⇒ the same, the URL as written its label'],
  ['md', '`标书研究/方案.md`', [`${P1} chat-link-rel|data-rel="标书研究/方案.md"|标书研究/方案.md`], 'a relative path whose first letter is CJK, in a code span ⇒ .chat-link-rel'],
  ['md', '`報告/テスト.md` and `docs/方案.md`', [`${P1} chat-link-rel|data-rel="報告/テスト.md"|報告/テスト.md`, `${P1} chat-link-rel|data-rel="docs/方案.md"|docs/方案.md`], '…kana too; an ASCII-first one as before'],
];
const ENT8 = { md: (r, s) => r.renderMarkdown(s), text: (r, s) => r.linkifyText(s) };
for (const [k, s, want, why] of ROWS8) eq(spans(ENT8[k](head, s)), want, why);
const agyHtml = head.renderMarkdown(AGY);
ok(!/<a\b/i.test(agyHtml) && !/file:/i.test(agyHtml) && (agyHtml.match(/title="Click to copy, Ctrl\+Click to open"/g) || []).length === 2, `…no anchor and no file: anywhere in its HTML, each span titled «Click to copy, Ctrl+Click to open» (${agyHtml})`);
eq(head.renderMarkdown('[page](/p/pg5vex1gylcn) and [doc](https://x.example/a/b)').trim(), '<p><a href="/p/pg5vex1gylcn">page</a> and <a href="https://x.example/a/b">doc</a></p>', 'a /p/<id> page anchor and a web anchor stay as written');
const CONV = `[\`${UUID}\`](conversation://${UUID})`;
const CONV_TODAY = `<p><span class="chat-link chat-sub-link" data-sub="${UUID}" title="Open this subagent"><code>${UUID}</code></span></p>`;
eq(head.renderMarkdown(CONV).trim(), CONV_TODAY, "PIN (lane agy-subagent-cards owns conversation://): [x](conversation://id) becomes the sub link — known by default (no _subagentKnown set), so no unknown chip");
const XSS = [
  ['[x](file:///tmp/a%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E.md)', 'a file: URL whose decoded path carries markup'],
  ['<a href="file:///x&quot;onmouseover=alert(1)">r</a>', 'a raw file: href that closes its quote'],
  ['[y](javascript:alert(1))', 'a javascript: href'],
  ['[w](file:javascript:alert(1))', 'file: + javascript:'],
  ['[z](file:///a/%0Ab)', 'a control character'],
];
for (const [s, why] of XSS) {
  const h = head.renderMarkdown(s);
  const tags = (h.replace(/"[^"]*"/g, '""').match(/<[a-z]+\b[^>]*>/gi) || []);
  ok(tags.every((tg) => /^<(p|span|a)\b/i.test(tg) && !/\son[a-z]+=|\shref=|\ssrc=/i.test(tg)) && !/<img/i.test(h), `XSS — ${why}: no element but p / span / a, no on*= / href= / src= on any tag (${h.trim()})`);
}
eq(spans(head.renderMarkdown(XSS[0][0])), [`${P1}|data-path="/tmp/a&quot;&gt;&lt;img src=x onerror=alert(1)&gt;.md"|x`], '…the markup-carrying path is ONE span, its path escHtml\'d in data-path');
ok(['[y](javascript:alert(1))', '[w](file:javascript:alert(1))', '[z](file:///a/%0Ab)'].every((s) => !/chat-link/.test(head.renderMarkdown(s))), '…a javascript: href, file:javascript: and a control character never become a link');
eq(head.renderMarkdown('[root](file:///)').trim(), '<p><a>root</a></p>', "…and the bare root file:/// is never carried as href=\"/\" (a click would open the app's root in a tab): it is dropped, as before");

// RED CONTROL = the base: the four changed lines reverted on patched copies (renderer + path-linkify)
const REVERT = [
  ["let html = sanitizeHtml(this._fileHrefs(marked.parse(text || '')));", "let html = sanitizeHtml(marked.parse(text || ''));"],
  ['if (anchor) return this._pathAnchor(match);', 'if (anchor) return match;'],
  ['this.linkifyPagePaths(this.linkifyFileUrls(this.linkifyUrls(text)))', 'this.linkifyPagePaths(this.linkifyUrls(text))'],
];
const hits8 = REVERT.map(([from]) => cr.split(from).length - 1);
eq(hits8, [1, 1, 1], "the base control's three renderer patches each apply exactly once");
// lane mask-value-shape (⑨): the base renderer also has no masked-link branches — its two lines cut in the SAME build (one esbuild pass)
const MVS_CUT = [["      if (mask) return this._maskedToken(raw, mask);\n", ""], ["      if (anchor) { const masked = this._maskedAnchor(match); if (masked) return masked; } // lane mask-value-shape: a link a belt masked inside is words + the note\n", ""], ["    html = this._linkifyBareText(html, (txt) => !MARK_WORD_RE.test(txt) ? txt : txt.replace(MASKED_PATH_RE, (run) => { const mask = pathMask(run); return mask ? this._maskedToken(run, mask) : run; }));\n", ""], ["      const fmask = linkMask(raw); if (fmask) return this._maskedToken(raw, fmask);   // r3 (I): a file: URL a belt masked inside is words + the note\n", ""], ["            if (linkMask(txt)) { const cm = pathMask(txt); return open + (cm ? this._maskedWords(inner, cm) : inner) + close; }   // r3 (I, E): a masked relative path is words + the note; a bare mark is words\n", ""]];   // r3/r4: the five masked roads of the chat
const base = await renderer((src) => [...REVERT, ...MVS_CUT].reduce((s, [from, to]) => s.split(from).join(to), src), { linkify: BASE_GATE });
const baseAgy = base.renderMarkdown(AGY);
ok(!spans(baseAgy).length && /<a>SKILL\.md<\/a>/.test(baseAgy) && /<a>inspect\.py<\/a>/.test(baseAgy), `RED CONTROL (the base): Antigravity's file: links render as a bare <a> with no href (the sanitizer dropped it) — no click handler reads one: «点不了» (${baseAgy.trim()})`);
const baseDoc = base.renderMarkdown('[doc](/home/u/标书研究/a.md)');
const hrefOf = /href="([^"]*)"/.exec(baseDoc)?.[1] || '';
const tgt = base._linkTargets({ dataset: {}, getAttribute: (k) => (k === 'href' ? hrefOf : null) });
ok(!spans(baseDoc).length && tgt.fp === '/home/u/%E6%A0%87%E4%B9%A6%E7%A0%94%E7%A9%B6/a.md', `…<a href="/home/u/标书研究/a.md"> stays an anchor whose click asks for the ENCODED path (${tgt.fp})`);
eq(spans(base.renderMarkdown('the full output in a file at file:///home/u/x/out.txt.')), [`${P1}|data-path="///home/u/x/out.txt"|///home/u/x/out.txt`], '…a bare file: URL links only its ///… tail');
eq(base.renderMarkdown('`标书研究/方案.md`').trim(), '<p><code>标书研究/方案.md</code></p>', '…the CJK-first relative path is plain text');
eq(base.renderMarkdown(CONV).trim(), CONV_TODAY, '…and the base control renders it the same: agy-subagent-cards markConversationLinks / conversationLinksHtml sit outside this suite\'s pick-2 revert');
console.log('⑨ lane mask-value-shape (the owner 2026-11-07): A MASKED LINK NEVER LOOKS WHOLE in the chat — a peer card (a group message, a stashed one) draws a URL a belt masked inside as WORDS + the note; a whole URL stays one link');
{
  const RED = '«redacted»';
  const MASKED = 'sign in at https://app.example.com/login?token=' + RED + '&next=%2Fhome then reply';
  const VAULT = 'call https://api.example.com/v1/q?key=[vault:apikey:example] now';
  const WHOLE = 'https://accounts.google.com/o/oauth2/auth?response_type=code&prompt=consent&token_usage=remote&access_type=offline';
  const NOTE = 'Part of this link was masked, so it will not open — ask the agent to send the link without the secret.';
  const linkOver = (h) => /<a\b[^>]*href="[^"]*(?:%C2%AB|«|%5Bvault|\[vault)[^"]*"/i.test(h) || /data-href="[^"]*(?:«|\[vault)/.test(h);
  for (const [entry, fn] of Object.entries({ 'tool output (linkifyText)': (r, s) => r.linkifyText(s), 'a peer card / assistant markdown (renderMarkdown)': (r, s) => r.renderMarkdown(s) })) {
    const h = fn(head, MASKED), hv = fn(head, VAULT), hw = fn(head, WHOLE);
    ok(!linkOver(h) && /<span class="chat-link-masked">https:\/\/app\.example\.com\/login\?token=«redacted»&amp;next=%2Fhome<\/span> <span class="chat-link-note masked-link-note">/.test(h) && h.includes(NOTE), `${entry}: the masked URL is words + the note, no link to the mangled target`);
    ok(!linkOver(hv) && /it holds the vault entry apikey:example: reveal it in Vault/.test(hv), `${entry}: a vault mark names its road (the entry, revealed in Vault)`);
    ok(!/masked-link-note/.test(hw) && (/data-href="https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?response_type=code&amp;prompt=consent&amp;token_usage=remote&amp;access_type=offline"/.test(hw) || /<a href="https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?response_type=code&(?:amp;)?prompt=consent&(?:amp;)?token_usage=remote&(?:amp;)?access_type=offline"/.test(hw)), `${entry}: a whole URL (the owner's shape) stays ONE link to its whole target`);
  }
  // r2 (m3): a vault mark in an HREF — a titled link (marked leaves the colon raw: %5Bvault:…%5D), the reference-style link, the agent-entry
  // label — is words + the note on the peer card; (m6) the label is words: a whole href stays a link whatever its label says; (m4) a PATH
  // a belt masked inside is words + the note, a plain path stays a path link
  const M3 = { 'a titled link': '[Call](https://api.example.com/v1/q?key=[vault:apikey:example]&x=1)', 'the reference-style link': 'see [d][r] now\n\n[r]: https://api.example.com/v1/q?key=[vault:apikey:example]', 'the agent-entry label': '[q](https://api.example.com/v1/q?key=[vault:agent:conv-1/gh-token])' };
  for (const [n, s] of Object.entries(M3)) { const h = head.renderMarkdown(s); ok(!linkOver(h) && !/<a\b/.test(h) && /class="chat-link-masked"/.test(h) && /it holds the vault entry (apikey:example|agent:conv-1\/gh-token): reveal it in Vault/.test(h), `r2 (m3) ${n} with a vault mark in its HREF: words + the note naming the entry, no anchor`); }
  const m6 = head.renderMarkdown('[how the «redacted» marker works](https://docs.example.com/belt)');
  ok(/<a href="https:\/\/docs\.example\.com\/belt">how the «redacted» marker works<\/a>/.test(m6) && !/masked-link-note/.test(m6), 'r2 (m6): the label is words — a whole href stays ONE link whatever its label mentions');
  for (const [entry, fn] of Object.entries({ 'tool output': (r, x) => r.linkifyText(x), 'a peer card': (r, x) => r.renderMarkdown(x) })) {
    const hp = fn(head, 'The report: /home/u/out/[vault:secret:run]/report.md here'), hq = fn(head, 'plain /home/u/x/report.md');
    ok(/<span class="chat-link-masked">\/home\/u\/out\/\[vault:secret:run\]\/report\.md<\/span> <span class="chat-link-note masked-link-note">/.test(hp) && !/data-path="\/home\/u\/out/.test(hp) && /data-path="\/home\/u\/x\/report\.md"/.test(hq), `r2 (m4) ${entry}: a masked PATH is words + the note; a plain path stays a path link`);
  }
  // r3 (D): a masked token is EXACTLY its path / URL token — in CJK prose the path before a masked KEY=value stays ONE link, no note
  for (const [lg, x] of Object.entries({ en: 'Wrote /home/u/proj/config/app.env, where API_KEY=«redacted», see.', zh: '已写入 /home/u/proj/config/app.env，其中API_KEY=«redacted»，请查看。', ja: '/home/u/proj/config/app.env に書き込み、API_KEY=«redacted»、確認してください。' })) {
    for (const [entry, fn] of Object.entries({ 'tool output': (r, y) => r.linkifyText(y), 'a peer card': (r, y) => r.renderMarkdown(y) })) {
      const h = fn(head, x);
      ok(/data-path="\/home\/u\/proj\/config\/app\.env"/.test(h) && !/masked-link-note|chat-link-masked/.test(h), `r3 (D) ${lg}, ${entry}: the path stays ONE link, the masked KEY=value is words with no note`);
    }
  }
  const dUrl = head.linkifyText('请打开https://app.example.com/login?token=«redacted»，然后看。');
  const dMd = head.renderMarkdown('请打开https://app.example.com/login?token=«redacted»，然后看。');
  ok([dUrl, dMd].every((h) => /<span class="chat-link-masked">https:\/\/app\.example\.com\/login\?token=«redacted»<\/span>/.test(h) && /<\/span>，然后看。/.test(h)), 'r3 (D): a masked URL in CJK prose (text and markdown) — the masked span is the URL token, the prose after it words');
  // r3 (E): a BARE vault mark is words — no masked «link», no note
  for (const x of ['value: [vault:secrets/db/secret] then', 'API_KEY=[vault:secrets/db/secret]', '`[vault:secrets/db/secret]`']) { const h = head.linkifyText(x), m = head.renderMarkdown(x); ok(!/masked-link-note|chat-link/.test(h) && !/masked-link-note|chat-link/.test(m), `r3 (E): a bare mark is words — ${x}`); }
  // r3 (I): every linkifier road asks the mark — a file: URL (text + markdown), a backticked path in tool output; the note itself is never
  // linkified (an entry name holding a path); an entry name with & < is escaped ONCE
  const fu = 'open file:///home/u/proj/«redacted»/x.md now';
  ok(/class="chat-link-masked">file:\/\/\/home\/u\/proj\/«redacted»\/x\.md</.test(head.linkifyText(fu)) && /class="chat-link-masked">file:\/\/\/home\/u\/proj\/«redacted»\/x\.md</.test(head.renderMarkdown(fu)) && !/data-path="\/home\/u\/proj\/«/.test(head.linkifyText(fu)), 'r3 (I): a file: URL a belt masked inside is words + the note (text and markdown)');
  const bt = head.linkifyText('run `/home/u/«redacted»/x.md` and `/home/u/proj/[vault:secret:run]/x.md`');
  ok((bt.match(/class="chat-link-masked">/g) || []).length === 2 && !/data-path="\/home\/u\/«|data-path="\/home\/u\/proj\/\[vault"/.test(bt), 'r3 (I): a backticked masked path in tool output is words + the note, never a (truncated) path link');
  const np = head.renderMarkdown('see /home/u/out/[vault:secret:/home/u/k.pem]/r.md');
  ok(/it holds the vault entry secret:\/home\/u\/k\.pem: reveal it in Vault/.test(np) && !/data-path="\/home\/u\/k\.pem/.test(np), 'r3 (I): the note is never linkified — an entry name holding a path stays words in it');
  const amp = head.renderMarkdown('see /home/u/out/[vault:secret:a&b<c]/r.md');
  ok(/vault entry secret:a&amp;b&lt;c: reveal/.test(amp) && !/&amp;amp;|&amp;lt;/.test(amp), 'r3 (I): an entry name holding & < is escaped ONCE in the note');
  // r3 (F): the masked-path pass is anchored on `/` — LINEAR BY THE COUNT (scripts/work-meter.mjs: every step and every regex backtrack, in a
  // child), never a clock (test-ci-gate's ratchet): the pass's own regex, read from chat-renderers.js as it stands (an identifier resolves to
  // its `new RegExp(…)` line), run over a bracket array with no `/` and one with many — ×4 input reads ×4 (r2's `(?<![^\s>(\[])[^…]*\/…`:
  // 45 ms → 513 ms at 34 → 114 KB, 7.5 s at 450 KB)
  {
    const { judgeInChild } = await import('./work-meter.mjs');
    const pass = /html = this\._linkifyBareText\(html, \(txt\) => (?:!MARK_WORD_RE\.test\(txt\) \? txt : )?txt\.replace\((\/(?:\\.|[^\/\n])+\/[a-z]*|[A-Z_]+), \(run\) =>/.exec(cr);
    let expr = pass ? pass[1] : null;
    if (expr && /^[A-Z_]+$/.test(expr)) { const d = new RegExp('const ' + expr + ' = (new RegExp\\(.+\\));').exec(cr); expr = d ? d[1] : null; }
    ok(!!expr, 'r3 (F): the masked-path pass\'s regex is read from chat-renderers.js', expr);
    if (expr) {
      const MOD = path.join(SCR, 'masked-path-pass.cjs');
      fs.writeFileSync(MOD, `const { CJK_PUNCT, SEG } = require(${JSON.stringify(path.join(ROOT, 'src/path-linkify.js'))});\nconst re = ${expr};\nmodule.exports = { pass: (x) => x.replace(re, (r) => r) };\n`);
      for (const [k, mk] of Object.entries({ 'brackets, no /': '(n) => "[" + Array.from({ length: Math.floor(n / 14) }, (_, i) => "[" + i + ",[" + (i + 1) + "," + (i + 2) + "]]").join(",") + "]"', 'brackets and /': '(n) => "[" + Array.from({ length: Math.floor(n / 9) }, (_, i) => "[\\"/a" + i + "\\"]").join(",") + "]"', 'open parens': '(n) => "(".repeat(n)' })) {
        const v = judgeInChild({ module: MOD, run: '(M, x) => M.pass(x)', mk: `(n) => n === 0 ? '' : (${mk})(n)`, n: 32768, kind: 'linear', backtracks: true, opts: { factor: 4 } });
        ok(v.ok && v.w1 / 32768 <= 64, `r3 (F): the masked-path pass is linear by the count on ${k}: ${v.err ? 'the child failed: ' + v.err.slice(0, 200) : `${v.w1} → ${v.w2} steps, ×${v.r && v.r.toFixed(2)} (bound ×${v.bound}), ${(v.w1 / 32768).toFixed(1)} steps a character (≤ 64)`} at ×4 input`, v);
      }
    }
  }
  // r4 (M3): a clean URL then a masked one in ONE blank-free run — two tokens on the text AND the markdown road (the For-you grammar's)
  for (const [lg, x] of Object.entries({ en: 'first open https://app.example.com/a, then https://x.example/cb?token=«redacted» to sign in', zh: '先打开https://app.example.com/a，再用https://x.example/cb?token=«redacted»登录', ja: 'まずhttps://app.example.com/a、次にhttps://x.example/cb?token=«redacted»でログイン' })) {
    for (const [entry, fn] of Object.entries({ 'tool output': (r, y) => r.linkifyText(y), 'a peer card': (r, y) => r.renderMarkdown(y) })) {
      const h = fn(head, x);
      ok(/(?:data-href|href)="https:\/\/app\.example\.com\/a"/.test(h) && /<span class="chat-link-masked">https:\/\/x\.example\/cb\?token=«redacted»/.test(h) && (h.match(/masked-link-note/g) || []).length === 1 && !linkOver(h) && !/data-path="\/\/x\.example/.test(h), `r4 (M3) ${lg}, ${entry}: the clean URL ONE link, the masked one words + ONE note`);
    }
  }
  // r4 (m5): a vault mark's `]` is INSIDE the URL token on the text road too — the same masked span as markdown and For-you
  for (const x of ['https://x-access-token:[vault:gh/tok]@github.com/o/r.git (fetch)', 'see https://api.example/q?key=[vault:svc/k]&format=json now']) {
    const ht = head.linkifyText(x), hm = head.renderMarkdown(x), span = (h) => (/<span class="chat-link-masked">([^<]*)<\/span>/.exec(h) || [])[1];
    ok(span(ht) && span(ht) === span(hm) && /github\.com\/o\/r\.git|format=json/.test(span(ht)), `r4 (m5): one masked token on both chat roads — ${span(ht)}`);
  }
  // r5 (M1): both chat roads — a BALANCED full-width pair inside a URL token is the token's (`…/wiki/東京（都）` ONE whole link; markdown keeps
  // marked's own anchor, the base's); an unpaired CJK mark ends it (the base ran on: `…/x，然后点` linked the comma and the words — the change, disclosed)
  {
    const hrefs = (h) => [...h.matchAll(/(?:data-href|href)="([^"]*)"/g)].map((m) => { const v = m[1].replace(/&amp;/g, '&'); try { return decodeURIComponent(v); } catch { return v; } }).join('|');
    const M1C = { '…/wiki/東京（都） — a balanced pair: ONE whole link': ['see https://ja.example/wiki/東京（都） ok', 'https://ja.example/wiki/東京（都）'], '…/wiki/「東京」 — a corner-bracket pair': ['见https://ja.example/wiki/「東京」 ok', 'https://ja.example/wiki/「東京」'], '…/x，然后点 — the comma ends it': ['look https://a.example/x，然后点', 'https://a.example/x'], '…/x。 — the stop ends it': ['看https://a.example/x。', 'https://a.example/x'], '…/東京（都），再说 — the pair kept, the comma ends it': ['先看https://ja.example/wiki/東京（都），再说', 'https://ja.example/wiki/東京（都）'], '（…/a）吧 — the prose\'s own pair is not the token\'s': ['（https://x.example/a）吧', 'https://x.example/a'] };
    for (const [n, [x, want]] of Object.entries(M1C)) for (const [entry, fn] of Object.entries({ 'tool output': (r, y) => r.linkifyText(y), 'a peer card': (r, y) => r.renderMarkdown(y) })) { const got = hrefs(fn(head, x)); ok(got === want, `r5 (M1) ${entry}: ${n}`, got); }
    ok(/<a href="https:\/\/ja\.example\/wiki\/%E6%9D%B1%E4%BA%AC%EF%BC%88%E9%83%BD%EF%BC%89">https:\/\/ja\.example\/wiki\/東京（都）<\/a>/.test(head.renderMarkdown('see https://ja.example/wiki/東京（都） ok')), 'r5 (M1) a peer card: the balanced autolink keeps marked\'s own anchor (the base\'s bytes)');
  }
  // r6 (m6): the markdown road cuts an autolink at its first UNPAIRED CJK mark and the URL before it keeps MARKED's anchor (its balanced-paren
  // and apostrophe rules) — the href marked gives the same URL with a blank after it; r5 re-read it with the text road's run (`…/Foo_(bar`)
  {
    const hrefs6 = (h) => [...h.matchAll(/(?:data-href|href)="([^"]*)"/g)].map((m) => { const v = m[1].replace(/&amp;/g, '&'); try { return decodeURIComponent(v); } catch { return v; } }).join('|');
    for (const [n, cjk, blank] of [['…/Foo_(bar)，然后', '参见 https://en.wikipedia.org/wiki/Foo_(bar)，然后', '参见 https://en.wikipedia.org/wiki/Foo_(bar) 然后'], ["…?q=it's，ok", "link https://a.example/x?q=it's，ok", "link https://a.example/x?q=it's ok"], ['…&y=(2)、z', 'see https://a.example/q?x=1&y=(2)、z', 'see https://a.example/q?x=1&y=(2) z']]) {
      const got = hrefs6(head.renderMarkdown(cjk)), want = hrefs6(head.renderMarkdown(blank));
      ok(!!want && got === want, `r6 (m6) a peer card: ${n} links what marked links with a blank there (${want})`, got);
    }
    ok(hrefs6(head.renderMarkdown('先看https://ja.example/wiki/東京（都），再说')) === 'https://ja.example/wiki/東京（都）' && hrefs6(head.renderMarkdown('先打开https://app.example.com/a，再用https://app.example.com/b登录')) === 'https://app.example.com/a|https://app.example.com/b登录', 'r6 (m6) a peer card: the pair shape …/東京（都），再说 unchanged; two URLs in one blank-free run stay two links');
    const mk6 = head.renderMarkdown('参见 https://x.example/cb?token=«redacted»&r=(a)，然后');
    ok(/<span class="chat-link-masked">https:\/\/x\.example\/cb\?token=«redacted»&amp;r=\(a/.test(mk6) && !linkOver(mk6) && (mk6.match(/masked-link-note/g) || []).length === 1 && /，然后/.test(mk6), 'r6 (m6) a peer card: a MASKED autolink holding a paren still takes the mask path — its words to the CJK mark + ONE note, no link', mk6);
  }
  // r7 (M8): both chat roads — a dash / wave dash / ellipsis / curly quote INSIDE a URL stays in it (the stop is foryou-links URL_STOP only:
  // CJK sentence punctuation + an unpaired full-width bracket); one at the END is shed — on markdown too (marked kept a trailing `”`)
  {
    const hrefs7 = (h) => [...h.matchAll(/(?:data-href|href)="([^"]*)"/g)].map((m) => { const v = m[1].replace(/&amp;/g, '&'); try { return decodeURIComponent(v); } catch { return v; } }).join('|');
    const M8 = { '…/wiki/Mexican–American_War (an en dash inside)': ['see https://en.wikipedia.org/wiki/Mexican–American_War', 'https://en.wikipedia.org/wiki/Mexican–American_War'], '…/a〜b/c (a wave dash inside)': ['https://ja.example/a〜b/c ok', 'https://ja.example/a〜b/c'], '…/a…b (an ellipsis inside)': ['https://x.example/a…b ok', 'https://x.example/a…b'], '…/2024—report/index.html (an em dash in the path)': ['see https://x.example/2024—report/index.html ok', 'https://x.example/2024—report/index.html'], '“…/a” 的 (a closing curly quote shed, nothing else)': ['“https://x.example/a” 的', 'https://x.example/a'], '…/it’s-here (a curly apostrophe inside)': ['see https://x.example/it’s-here ok', 'https://x.example/it’s-here'], '…/a～b (a full-width tilde inside)': ['https://x.example/a～b ok', 'https://x.example/a～b'], '…/a–b，然后 (the dash kept, the comma still stops)': ['https://x.example/a–b，然后', 'https://x.example/a–b'] };
    for (const [n, [x, want]] of Object.entries(M8)) for (const [entry, fn] of Object.entries({ 'tool output': (r, y) => r.linkifyText(y), 'a peer card': (r, y) => r.renderMarkdown(y) })) { const got = hrefs7(fn(head, x)); ok(got === want, `r7 (M8) ${entry}: ${n} — ONE link to ${want}`, got); }
  }
  // r8 (a): both chat roads — a letter (々 〆 〇 〻) at a URL's END never leaves it (r7's markdown shed it; the base's text road shed it)
  {
    const hrefs8 = (h) => [...h.matchAll(/(?:data-href|href)="([^"]*)"/g)].map((m) => { const v = m[1].replace(/&amp;/g, '&'); try { return decodeURIComponent(v); } catch { return v; } }).join('|');
    const L8 = { '…/wiki/人々 (々 U+3005 ends it)': ['see https://ja.wikipedia.org/wiki/人々', 'https://ja.wikipedia.org/wiki/人々'], '…/二〇〇〇 (〇 U+3007)': ['see https://ja.example/二〇〇〇', 'https://ja.example/二〇〇〇'], '…/締〆 (〆 U+3006)': ['see https://ja.example/締〆', 'https://ja.example/締〆'], '…/a〻 (〻 U+303B)': ['see https://ja.example/a〻', 'https://ja.example/a〻'], '…/人々，然后 (the letter kept, the comma stops)': ['https://ja.wikipedia.org/wiki/人々，然后', 'https://ja.wikipedia.org/wiki/人々'] };
    for (const [n, [x, want]] of Object.entries(L8)) for (const [entry, fn] of Object.entries({ 'tool output': (r, y) => r.linkifyText(y), 'a peer card': (r, y) => r.renderMarkdown(y) })) { const got = hrefs8(fn(head, x)); ok(got === want, `r8 (a) ${entry}: ${n} — ONE link to ${want}`, got); }
  }
  // r5 (m4), the chat road: a code span holding a mark with no `/` before it is words on both chat roads — never a rel link (For-you's pins:
  // test-secret-shapes segmentText + test-user-todos-layout renderRow)
  for (const x of ['see `a«redacted».txt` now', 'see `x[vault:k].md` now']) { const hm = head.renderMarkdown(x), ht = head.linkifyText(x); ok(!/chat-link|data-rel|masked-link-note/.test(hm) && !/chat-link|data-rel|masked-link-note/.test(ht), `r5 (m4) the chat road: ${x.slice(4, -4)} is words (markdown and text) — no rel link`, [hm, ht]); }
  // r6 (m7): a VERBATIM block reads exactly as written on the chat's roads — a masked run inside a fenced block, an inline code span or a tool's
  // <pre> is its words (chat-link-masked), and THE note FOLLOWS the block; in prose the note stays inline (r5)
  {
    const V = 'curl https://api.example/q?key=[vault:svc/k]&x=1', NOTEV = 'it holds the vault entry svc/k: reveal it in Vault';
    const txt = (h) => h.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');
    const fence = head.renderMarkdown('```\n' + V + '\n```'), fpre = (/<pre>[\s\S]*?<\/pre>/.exec(fence) || [''])[0];
    ok(txt(fpre).trim() === V && !/masked-link-note/.test(fpre) && /<\/pre><div class="chat-link-note masked-link-note">[^<]*it holds the vault entry svc\/k/.test(fence) && /chat-link-masked/.test(fpre), 'r6 (m7) a fenced block: its text is the command exactly, the masked run its words, THE note a block after </pre>', fence);
    const inl = head.renderMarkdown('run `' + V + '` now'), code = (/<code>[\s\S]*?<\/code>/.exec(inl) || [''])[0];
    ok(txt(code) === V && !/masked-link-note/.test(code) && /<\/code> <span class="chat-link-note masked-link-note">[^<]*it holds the vault entry svc\/k/.test(inl), 'r6 (m7) an inline code span: its text is the command exactly, THE note after </code>', inl);
    const el = mkEl(); head.wrapMsg(el, 'tool', '', '<pre class="chat-tool-out">' + head.linkifyText(V) + '</pre>'); const tool = el.innerHTML, tpre = (/<pre[^>]*>[\s\S]*?<\/pre>/.exec(tool) || [''])[0];
    ok(txt(tpre) === V && !/masked-link-note/.test(tpre) && /<\/pre><div class="chat-link-note masked-link-note">[^<]*it holds the vault entry svc\/k/.test(tool), 'r6 (m7) a tool\'s <pre> (wrapMsg): its text is the output exactly, THE note after </pre>', tool);
    const prose = head.renderMarkdown('see ' + V.slice(5) + ' now');
    ok(/<\/span> <span class="chat-link-note masked-link-note">[^<]*it holds the vault entry svc\/k[^<]*<\/span> now<\/p>/.test(prose) && prose.includes(NOTEV), 'r6 (m7) prose: the note stays INLINE after the masked words (r5)', prose);
  }
  // RED CONTROL: the base renderer (the masked branches cut in its one build, MVS_CUT) links the mangled target
  ok(MVS_CUT.every(([from]) => cr.split(from).length - 1 === 1), 'the control\'s five renderer patches each apply exactly once');
  const r0 = base;
  ok(linkOver(r0.linkifyText(MASKED)) && linkOver(r0.renderMarkdown(MASKED)) && !/masked-link-note/.test(r0.renderMarkdown(MASKED)) && /<a\b/.test(r0.renderMarkdown(M3['a titled link'])) && /data-path="\/home\/u\/out\/\[vault"/.test(r0.linkifyText('The report: /home/u/out/[vault:secret:run]/report.md here')), 'RED CONTROL (the base renderer): the masked URL, a titled vault href and a masked path are whole-looking links — the legs above go red');
}

console.log('⑩ A DOOR IN THE CHAT DOES WHAT ITS ICON SAYS — the chat\'s delegation acts on the chat\'s own links only, never a card\'s door (lane card-door-in-chat)');
// The REAL delegation (⑥'s renderer: setupLinkHandler on LIST) over a fake DOM that reads the selectors it asks
// (`.x`, `a[href]`) and a classList with a length, as a browser's. Every card kind that draws an
// anchor inside the chat is one specimen — its classes and attributes as its module draws them.
globalThis.document = DOC;
const okd = (c, m, d) => ok(c, c || d === undefined ? m : `${m} — ${JSON.stringify(d).slice(0, 700)}`);
class D extends El {
  get classList() { const c = this._c; return { add: (...a) => a.forEach((x) => c.add(x)), remove: (...a) => a.forEach((x) => c.delete(x)), contains: (x) => c.has(x), toggle() {}, get length() { return c.size; } }; }
  matches(sel) {
    return String(sel).split(',').some((s) => {
      const m = /^([a-z]*)((?:\.[\w-]+)*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i.exec(s.trim());
      if (!m) throw new Error('fake selector: ' + s);
      const [, tag, cls, attr, val] = m;
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if (cls.split('.').filter(Boolean).some((c) => !this._c.has(c))) return false;
      if (!attr) return true;
      const v = attr.startsWith('data-') ? this.dataset[attr.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] : this.attrs[attr];
      return v !== undefined && v !== null && (val === undefined || v === val);
    });
  }
  closest(sel) { for (let n = this; n && typeof n.matches === 'function'; n = n.parentNode) if (n.matches(sel)) return n; return null; }
}
const node = (tag, cls = '', attrs = {}, data = {}) => { const n = new D(tag); n.className = cls; Object.assign(n.attrs, attrs); Object.assign(n.dataset, data); return n; };
const under = (parent, ...kids) => { let p = parent; for (const k of kids) { p.appendChild(k); p = k; } return p; };   // a chain: each kid inside the one before
// an event BUBBLES from its target up through the chat (each node's own listeners, then its parent's), stopped where a
// listener stops it — as a browser's: a card's own handler runs before the chat's delegation sees anything
const fire = (list, type, target, mods = {}) => { const e = { type, target, clientX: 5, clientY: 5, ctrlKey: false, metaKey: false, ...mods, dp: false, sp: false, preventDefault() { this.dp = true; }, stopPropagation() { this.sp = true; } }; for (let n = target; n && !e.sp; n = n.parentNode) for (const f of (n.ls && n.ls[type]) || []) f(e); return e; };
const cardActs = [];   // what a card's OWN handler did (the open, the conversation) — the card's act, not the chat's
const own = (a, act, { stop = false } = {}) => { a.addEventListener('click', (e) => { e.preventDefault(); if (stop) e.stopPropagation(); cardActs.push(act); }); return a; };
const menus = () => DOC.body.children.filter((c) => c._c && c._c.has('context-menu'));
const clearMenus = () => { for (const m of menus()) m.remove(); };
const flashesOn = (n) => { const out = []; for (let p = n; p; p = p.parentNode) for (const c of p.children || []) if (c._c && c._c.has('chat-link-tooltip')) out.push(c.textContent); return out; };
const chatMsg = (list = LIST) => under(list, node('div', 'chat-msg'));
const API = '/api/channels/outbox/p-cd1/attachment/0';
// THE CENSUS — every card kind that draws an anchor inside the chat's message list, its door as its module draws it
const DOORS = [];
{ // the Outbox card at the call row that filed it (channel-outbox renderProposalCard in chatProposalCards' box) — THE OWNER'S
  const card = under(chatMsg(), node('div', 'chat-chan-props'), node('div', 'chan-prop chan-prop-awaiting-approval'));
  const row = under(card, node('div', 'chan-prop-files'), node('div', 'chan-prop-file'));
  const dl = under(row, node('a', 'chan-prop-file-dl', { href: API, download: '', title: 'Download notes.pdf' }));
  DOORS.push(['the Outbox card: the attachment row\'s ⤓ — its icon pressed (the owner\'s press)', under(dl, node('svg', 'vs-icon'), node('path')), API]);
  DOORS.push(['the Outbox card: the ⤓ anchor itself (Enter on it)', dl, API]);
  DOORS.push(['the Outbox card: the file NAME (opens in the viewer by its own click)', own(under(row, node('a', 'chan-prop-file-name chan-prop-file-open', { href: API, title: 'Open notes.pdf' }, { open: 'viewer' })), 'viewer'), API, 'viewer']);
  DOORS.push(['the Outbox card: a name with no preview (its download)', under(row, node('a', 'chan-prop-file-name', { href: API.replace(/0$/, '1'), download: '' })), API.replace(/0$/, '1')]);
  DOORS.push(['the Outbox card: its conversation link (opens the conversation by its own click)', own(under(card, node('div', 'chan-prop-where'), node('a', 'chan-prop-link', { href: '#' })), 'conversation'), '#', 'conversation']);
}
DOORS.push(['the API card at its call row: the object\'s name (opens its conversation; its own handler stops the event, as before)', own(under(chatMsg(), node('div', 'chat-api-cards'), node('div', 'chan-api-card'), node('div', 'chan-api-head'), node('a', 'chan-api-obj', { href: '#' })), 'conversation', { stop: true }), '#', 'conversation']);
DOORS.push(['the agent\'s file card (user-channel): the file\'s name opens its published page beside', under(chatMsg(), node('div', 'chat-userfile-list'), node('div', 'chat-userfile-row'), node('a', 'chat-userfile-link', { href: 'http://test/p/pgaaaaaaaaaa', target: '_blank', rel: 'noopener' })), 'http://test/p/pgaaaaaaaaaa']);
DOORS.push(['the code-change card: the change\'s address opens beside', under(chatMsg(), node('div', 'chat-code-change-url'), node('a', 'chat-code-change-link', { href: 'https://example.com/acme/app/pull/12', target: '_blank', rel: 'noopener noreferrer' })), 'https://example.com/acme/app/pull/12']);
for (const [what, target, href, act] of DOORS) {
  reset(); clearMenus(); cardActs.length = 0;
  const e = fire(LIST, 'click', target);
  await tick();
  const fl = flashesOn(target);
  const did = act ? cardActs.length === 1 && cardActs[0] === act : !e.dp;   // its own handler ran once — or the browser's default is kept (the download, the tab)
  okd(did && !clip.length && !fl.length && !menus().length && !ROWS.length, `CENSUS — ${what}: a click is the CARD'S (${act ? 'its own act' : 'the browser\'s default kept'}; no copy, no «Copied!», no row)`, { dp: e.dp, sp: e.sp, cardActs, clip, fl, href, rows: ROWS.map((r) => r.outcome) });
}
for (const [what, target] of [['⤓', DOORS[0][1]], ['file name', DOORS[2][1]]]) {
  reset(); clearMenus();
  const e = fire(LIST, 'contextmenu', target);
  okd(!e.dp && !e.sp && !menus().length, `…a right-click on the Outbox card's ${what} keeps the browser's own menu (Save link as…) — never the chat's Open / Copy`, { dp: e.dp, menus: menus().map((m) => m.text) });
}
{ // a touch device: a tap on a link opens the chat's Open / Copy menu — never on a card's door
  const LIST2 = new El('div');
  const R2 = new R.constructor({ ws: null, sessionId: 's2', app: { ...APP, isTouch: true }, backend: 'claude', compact: false, messageList: LIST2, getSessionCtx: () => CTX });
  const dl2 = under(chatMsg(LIST2), node('div', 'chat-chan-props'), node('div', 'chan-prop'), node('div', 'chan-prop-files'), node('div', 'chan-prop-file'), node('a', 'chan-prop-file-dl', { href: API, download: '' }));
  const own2 = under(chatMsg(LIST2), node('span', 'chat-link chat-link-path', {}, { path: '/home/userW/x/notes.md' }));
  reset(); clearMenus();
  const e1 = fire(LIST2, 'click', dl2);
  okd(R2 && !e1.dp && !menus().length && !clip.length, 'a TAP on the ⤓ (a touch device) downloads — never the chat\'s Open / Copy menu', { dp: e1.dp, menus: menus().length });
  reset(); clearMenus();
  const e2 = fire(LIST2, 'click', own2);
  eq(menus().map((m) => m.children.map((c) => c.textContent).filter(Boolean)), [['Open', 'Copy path']], 'CONTROL: a tap on the chat\'s own path link still offers Open + Copy path');
  okd(e2.dp, '…its default taken by the chat (as before)');
  clearMenus();
}
// CONTROLS (law 4): the chat's OWN links are unchanged — a path span, a bare markdown anchor, a linkify span drawn inside a card
{
  const body = under(chatMsg(), node('div', 'chat-md'));
  const span = under(body, node('span', 'chat-link chat-link-path', {}, { path: '/home/userW/x/notes.md' }));
  const bare = under(body, node('a', '', { href: 'https://example.com/a?b=1&c=2', target: '_blank', rel: 'noopener noreferrer' }));
  const inCard = under(chatMsg(), node('div', 'chat-chan-props'), node('div', 'chan-prop'), node('span', 'chat-link', {}, { href: 'https://example.com/b' }));
  const sub = under(chatMsg(), node('span', 'chat-link chat-sub-link', {}, { sub: UUID }));
  for (const [what, target, want] of [['the chat\'s path link', span, '/home/userW/x/notes.md'], ['a bare markdown anchor in the chat\'s text', bare, 'https://example.com/a?b=1&c=2'], ['a .chat-link span the linkify drew inside a card', inCard, 'https://example.com/b']]) {
    reset(); clearMenus();
    const e = fire(LIST, 'click', target);
    await tick();
    okd(e.dp && e.sp && clip.length === 1 && clip[0] === want && flashesOn(target).includes('Copied!') && ROWS.some((r) => r.outcome === 'copied'), `CONTROL — ${what}: a click still COPIES (${want}) and flashes «Copied!» (the chat's own, unchanged)`, { dp: e.dp, clip, fl: flashesOn(target) });
  }
  reset(); clearMenus();
  const e3 = fire(LIST, 'contextmenu', span);
  eq(menus().map((m) => m.children.map((c) => c.textContent).filter(Boolean)), [['Open', 'Copy path']], 'CONTROL — a right-click on the chat\'s path link still offers Open + Copy path');
  okd(e3.dp, '…the browser\'s menu replaced by the chat\'s (as before)');
  clearMenus(); reset();
  const e4 = fire(LIST, 'click', sub);
  okd(!e4.dp && !clip.length, 'CONTROL — a conversation:// link stays ChatView\'s (agy-subagent-cards, unchanged)');
}
// THE STATIC CENSUS: every module that draws a card INTO the chat's message list — each anchor it makes carries a class
// (the mark the boundary reads). A new card that draws a bare anchor into the chat reds here by file:line. (Measured in
// round 2 with the real row renderer: the For-you card's rows draw no anchor at all — escaped text + .fy-link spans.)
const CHAT_CARD_MODULES = ['src/lib/chat-renderers.js', 'src/lib/chat-view.js', 'src/user-channel.js', 'src/collab-row.js', 'src/lib/channel-touch-view.js', 'src/lib/channel-outbox.js', 'src/lib/channel-api-card-view.js', 'src/lib/chat-needs-card.js', 'src/lib/user-todos-row.js', 'src/lib/artifact-card.js', 'src/lib/browser-proposal-card.js', 'src/lib/subagent-card.js', 'src/lib/chat-run-summary.js', 'src/lib/peer-card-model.js'];
const anchorSites = (src, file) => {
  const out = [];
  src.split('\n').forEach((line, i) => {
    const tr = line.trim();
    if (/^(\/\/|\*|\/\*)/.test(tr)) return;   // a comment names an anchor, it draws none
    for (const m of line.matchAll(/createElement\('a'\)|\bel\('a',\s*('[^']*'|`[^`]*`|[\w.]+)|(?<!\/)<a\s[^>]*/g)) {
      let classed;
      if (m[0].startsWith('createElement')) classed = /\.className = '[^']+'/.test(line.slice(m.index) + src.split('\n')[i + 1]);
      else if (m[0].startsWith('el(')) classed = !/^''$/.test(m[1]);
      else classed = /\sclass="[^"]+"/.test(m[0]);
      out.push({ at: `${file}:${i + 1}`, classed });
    }
  });
  return out;
};
const sites = CHAT_CARD_MODULES.flatMap((f) => anchorSites(fs.readFileSync(path.join(ROOT, f), 'utf8'), f));
okd(sites.length >= 8 && sites.every((x) => x.classed), `STATIC CENSUS — ${CHAT_CARD_MODULES.length} modules that draw cards into the chat: each of their ${sites.length} anchor sites carries a class (${[...new Set(sites.map((x) => x.at.split(':')[0].split('/').pop()))].join(', ')})`, sites.filter((x) => !x.classed));
const bareSite = anchorSites("const dl = document.createElement('a');\n  dl.href = url;\nreturn `<a href=\"${u}\">x</a>`;", 'mutant.js');
okd(bareSite.length === 2 && bareSite.every((x) => !x.classed), 'STATIC CENSUS CONTROL: an anchor made with no class (by createElement or in a template) is caught by file:line', bareSite);
globalThis.document = saved.document;
fs.rmSync(SCR, { recursive: true, force: true });

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
