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
async function renderer(patch, opts = {}) {
  const out = path.join(SCR, `chat-renderers-${built++}.mjs`);
  const plug = { name: 'tpl', setup(b) {
    b.onResolve({ filter: /(build-version|safe-html)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'tpl-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'tpl-stub' }, (a) => ({ contents: a.path === 'safe-html.js' ? 'export const sanitizeHtml = (h) => h;' : "export const BUILD_VERSION = 'test';", loader: 'js' }));
    if (patch) b.onLoad({ filter: /chat-renderers\.js$/ }, (a) => ({ contents: patch(fs.readFileSync(a.path, 'utf8')), loader: 'js', resolveDir: path.dirname(a.path) }));
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
  return { ok: true, json: async () => (e === 'dir' ? { path: p, isDirectory: true } : e === 'file' ? { path: p, size: 3, isDirectory: false } : e ? { error: e } : { error: `ENOENT: no such file or directory, stat '${p}'` }) };
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
fs.rmSync(SCR, { recursive: true, force: true });

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
