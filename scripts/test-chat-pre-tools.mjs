#!/usr/bin/env node
// test-chat-pre-tools — lane think-tools-phone (the owner 2026-11-07, from a phone: «这个换行和复制按钮挡住了字，并且隐藏不掉。»):
// WHICH TOOLS EVERY BLOCK THE CHAT DRAWS CARRIES, AND WHERE THEY SIT. The REAL renderer (src/lib/chat-renderers.js bundled
// by esbuild, safe-html stubbed) over a small fake DOM that parses innerHTML; each kind drawn by its own render path, then
// the REAL addWrapToggles:
//   ① THE CENSUS per kind: a markdown fence, a tool's input / output / error, a diff, a file (its language picker; an html
//      file its Preview) carry Copy + Wrap; a Thinking block carries ONE Copy, in its summary (no row, no Wrap); every
//      PROSE block (drawn wrapped by chat.css: a hook's output, VibeSpace's note to the assistant, the CLI's details, a call
//      stopped while it ran, a machine card's command / output, a permission's command) carries Copy and NO Wrap. A kind
//      that gains a Wrap on prose, or loses Copy on code, is RED by its name.
//   ② the row is RESERVED: every toolbar is its wrapper's FIRST child — a row before its block, never laid over it (the
//      layout half is test-mobile-select ⑩ in a real Chrome); the thinking door sits in <summary> beside the label span,
//      and a streaming frame rewrites the label alone (chat-view's _renderStreamingText — the door survives)
//   ③ the behaviour kept (law 4): a diff's Copy keeps its +/- prefixes, a file's strips the gutter, a fence's is the code;
//      Wrap toggles chat-pre-wrapped and its words; the thinking Copy copies the whole thinking and stops the press
//   ④ the CSS: every PROSE_PRE selector is drawn wrapped by chat.css (white-space: pre-wrap); the toolbar / door rules
//      carry theme vars only (no literal colour) and are user-select none; the finger rule (44 px, words ≥ 12 px) lives in
//      the SHARED phone block; a row / the door shows on KEYBOARD focus only (:focus-visible — round 2, T2: a :focus-within
//      kept a mouse-clicked Copy's row shown after the mouse left)
//   ⑤ RED controls on the same bundle text: the base's rule (every block a Copy + Wrap toolbar laid after it) fails ① and ②
//      by name; a table that drops Copy from code fails ①
// Run: node scripts/test-chat-pre-tools.mjs
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m, detail) => { if (typeof m !== 'string') throw new Error(`ok: the condition goes FIRST, the name second (got a ${typeof m} for the name)`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 400) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

// ── A SMALL FAKE DOM (test-card-grammar's): elements, text, innerHTML parsed, a small selector engine ──
const cls = (n) => String(n.className || '').split(/\s+/);
const all = (n, pred, out = []) => { if (n.nodeType !== 3) { if (pred(n)) out.push(n); for (const c of n.childNodes || []) all(c, pred, out); } return out; };
class Txt { constructor(s) { this.nodeType = 3; this.data = String(s); this.parentNode = null; } get textContent() { return this.data; } remove() { if (this.parentNode) this.parentNode.removeChild(this); } }
const VOID = new Set(['IMG', 'BR', 'INPUT', 'HR', 'META', 'LINK', 'SOURCE', 'WBR']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (x) => String(x).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(/x/i.test(e[1]) ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
function parseHtml(html, parent) {
  const stack = [parent];
  for (const m of String(html).matchAll(/<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|[^<]+|</g)) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) { const i = stack.map((e) => e.tagName).lastIndexOf(m[1].toUpperCase()); if (i > 0) stack.length = i; continue; }
    if (!m[2]) { top.appendChild(new Txt(decode(m[0]))); continue; }
    const e = new El(m[2]);
    for (const a of m[3].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const k = a[1], v = decode(a[2] ?? a[3] ?? a[4] ?? '');
      if (k === 'class') e.className = v;
      else if (k.startsWith('data-')) e.dataset[k.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] = v;
      else if (k === 'hidden' || k === 'open' || k === 'disabled') e[k] = true;
      else { e.setAttribute(k, v); if (['title', 'href', 'src', 'alt', 'type', 'id'].includes(k)) e[k] = v; }
    }
    top.appendChild(e);
    if (!m[4] && !VOID.has(e.tagName)) stack.push(e);
  }
}
function compound(e, c, scope) {
  if (c === ':scope') return e === scope;
  const m = /^([a-z][\w-]*)?((?:\.[\w-]+|\[[^\]]+\])*)$/i.exec(c);
  if (!m || (m[1] && e.tagName !== m[1].toUpperCase())) return false;
  for (const part of m[2].match(/\.[\w-]+|\[[^\]]+\]/g) || []) {
    if (part[0] === '.') { if (!cls(e).includes(part.slice(1))) return false; continue; }
    const am = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
    if (!am) return false; // a selector this small engine does not read (the diagram door's [class*=…]) matches nothing
    const k = am[1], v = k.startsWith('data-') ? e.dataset[k.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] : e.getAttribute(k);
    if (v === undefined || v === null || (am[2] !== undefined && String(v) !== am[2])) return false;
  }
  return true;
}
function matchSel(e, sel, scope) {
  const toks = String(sel).replace(/\s*>\s*/g, ' > ').trim().split(/\s+/);
  const rec = (n, i) => {
    if (!compound(n, toks[i], scope)) return false;
    if (i === 0) return true;
    if (toks[i - 1] === '>') return !!n.parentNode && n.parentNode.nodeType === 1 && rec(n.parentNode, i - 2);
    for (let a = n.parentNode; a && a.nodeType === 1; a = a.parentNode) if (rec(a, i - 1)) return true;
    return false;
  };
  return rec(e, toks.length - 1);
}
class El {
  constructor(tag) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = []; this.dataset = {}; this.attrs = {}; this.className = ''; this.parentNode = null; this.listeners = {}; this.hidden = false; this.open = false; this.title = ''; this.id = ''; this.type = ''; this.style = { setProperty(k, v) { this[k] = String(v); }, removeProperty(k) { delete this[k]; } }; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
  get isConnected() { return true; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; if (v !== '' && v != null) this.appendChild(new Txt(v)); }
  get innerHTML() { return ''; }
  set innerHTML(v) { this.textContent = ''; parseHtml(v, this); }
  get classList() { return { contains: (c) => cls(this).includes(c), add: (...cs) => { for (const c of cs) if (!cls(this).includes(c)) this.className = `${this.className} ${c}`.trim(); }, remove: (...cs) => { this.className = cls(this).filter((x) => x && !cs.includes(x)).join(' '); }, toggle: (c, on) => { const has = cls(this).includes(c); const want = on === undefined ? !has : !!on; if (want && !has) this.className = `${this.className} ${c}`.trim(); if (!want && has) this.className = cls(this).filter((x) => x !== c).join(' '); return want; } }; }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new Txt(n) : n); }
  insertBefore(n, ref) { if (!ref) return this.appendChild(n); if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, n); return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  getBoundingClientRect() { return { top: 0, bottom: 20, left: 0, right: 500, width: 500, height: 20 }; }
  matches(sel) { return String(sel).split(',').some((x) => matchSel(this, x.trim(), null)); }
  closest(sel) { for (let e = this; e && e.nodeType === 1; e = e.parentNode) if (e.matches(sel)) return e; return null; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) { return all(this, (n) => n !== this && String(sel).split(',').some((x) => matchSel(n, x.trim(), this))); }
}
const body = new El('body');
const noop = () => {};
let CLIP = null;
class NoObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
const store = new Map();
for (const [k, v] of Object.entries({ window: globalThis, document: { createElement: (tag) => new El(tag), createTextNode: (s) => new Txt(s), getElementById: () => null, body, documentElement: new El('html'), head: new El('head'), addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, navigator: { language: 'en', userAgent: 'node', clipboard: { writeText: async (s) => { CLIP = s; } } },
  addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop }), requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: noop,
  getComputedStyle: () => ({ getPropertyValue: () => '' }), innerWidth: 1280, innerHeight: 800, location: { origin: 'http://test', href: 'http://test/', hostname: 'test', protocol: 'http:', pathname: '/' },
  MutationObserver: NoObserver, ResizeObserver: NoObserver, IntersectionObserver: NoObserver, fetch: async () => ({ ok: true, json: async () => ({}) }) })) {
  try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch {}
}

// ── THE BUNDLE (once); the RED controls are anchored edits of the SAME bundled text ──
const esbuild = require('esbuild');
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pre-tools-'));
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch {} });
const SANITIZE_STUB = `export const sanitizeHtml = (h) => h; export const sanitizeDiagramSvg = () => '';`;
const built = await esbuild.build({
  stdin: { contents: `export * from './src/lib/chat-renderers.js';`, resolveDir: ROOT, loader: 'js' },
  bundle: true, format: 'cjs', platform: 'node', target: 'es2022', write: false, logLevel: 'silent', loader: { '.css': 'text' },
  plugins: [{ name: 'pre-tools-stubs', setup(b) {
    b.onResolve({ filter: /(build-version|safe-html)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: a.path === 'safe-html.js' ? SANITIZE_STUB : "export const BUILD_VERSION = 'test';", loader: 'js' }));
  } }],
});
const TEXT = built.outputFiles[0].text;
const load = (tag, text) => { const f = path.join(SCR, `r-${tag}.cjs`); fs.writeFileSync(f, text); return require(f); };
/** an anchored edit of the bundled text (esbuild renames locals and double-quotes strings — the anchors are regexes) */
// (B-0d3e slice 10: no re.test before the helper — its count names a gone or doubled anchor, and a test() would move a /g anchor's lastIndex)
const mutant = (text, re, to) => editAnchor(text, re, to, "the text handed to mutant()");
const REAL = load('real', TEXT);
// (a) THE BASE'S RULE: every block a Copy + Wrap toolbar (a file's picker too), laid AFTER its block (f5e087bb5's overlay)
const controls = () => ({ BASE_RULE: load('base', mutant(mutant(TEXT, /const \{ kind, tools, at \} = preToolsOf\((\w+)\);/, 'const { kind, tools, at } = { kind: "code", tools: ["copy", "wrap", ...($1.classList.contains("chat-code-block") ? ["lang"] : [])], at: "row" };'),
  /wrapper\.insertBefore\(toolbar, \w+\);/, 'wrapper.appendChild(toolbar);')),   // stale-pins: kept (the base's toolbar-after-the-block, planted by this red control on purpose)
// (b) a table that drops Copy from code
  NO_COPY: load('nocopy', mutant(mutant(TEXT, /return \{ kind: "code", tools: \["copy", "wrap"\], at: "row" \};/, 'return { kind: "code", tools: ["wrap"], at: "row" };'),
  /toolbar\.appendChild\(copyBtn\);/, 'if (tools.includes("copy")) toolbar.appendChild(copyBtn);')) });

const mkRenderer = (M) => new M.ChatRenderers({ ws: null, sessionId: 's', app: {}, backend: 'claude', compact: false, messageList: new El('div'), getSessionCtx: () => ({}) });
const labels = (els) => els.map((b) => b.textContent.trim());
/** every block a message element drew, after addWrapToggles: its tools (in order), where they sit, the row's place */
function toolsOf(el) {
  return el.querySelectorAll('pre, .chat-diff-body, .chat-code-block').filter((b) => !b.closest('.chat-diagram')).map((b) => {
    const wrap = b.parentNode && b.parentNode.classList.contains('chat-pre-wrap') ? b.parentNode : null;
    const bar = wrap ? wrap.children.find((c) => c.classList.contains('chat-code-toolbar')) : null;
    const sum = b.closest('.chat-thinking')?.querySelector('summary');
    return { cls: b.className || b.tagName.toLowerCase(), row: bar ? labels(bar.querySelectorAll('button')) : [], summary: sum ? labels(sum.querySelectorAll('button')) : [], barFirst: !!bar && wrap.firstElementChild === bar && bar.nextSibling === b, wrapped: !!wrap, kind: wrap?.dataset.preKind || null };
  });
}

// ── THE FIXTURES: each kind by its own render path ──
const THINK = 'W46N43 的炮塔能量只剩 150–210，原因大概是 spawn 队列卡了。我接下来查清并疏通。';
const FENCE = '先看队列：\n\n```js\nconst head = Game.rooms.W46N43.memory.spawnQueue[0];\n```';
const tool = (block) => ({ id: 'm-' + Math.random(), role: 'tool', content: [{ type: 'tool_result', status: 'ok', ...block }] });
const KINDS = [
  // [name, the rendered element, the tools wanted on the row / in the summary, the class of the block that must carry them]
  ['thinking', (R) => R.renderAssistantMsg({ id: 't1', content: [{ type: 'thinking', text: THINK }] }), { summary: ['Copy'], row: null }],
  ['markdown fence', (R) => R.renderAssistantMsg({ id: 'a1', content: [{ type: 'text', text: FENCE }] }), { row: ['Copy', 'Wrap'] }],
  ['tool input + output (Bash)', (R) => R.renderToolMsg(tool({ toolName: 'Bash', input: { command: 'node tools/queue.js --room W46N43' }, output: 'spawn-0  W46N43  harvester\nspawn-1  W46N43  hauler' })), { row: ['Copy', 'Wrap'], n: 2 }],
  ['tool error', (R) => R.renderToolMsg(tool({ toolName: 'Bash', status: 'error', input: { command: 'false' }, output: 'exit 1: the queue file is missing' })), { row: ['Copy', 'Wrap'], n: 2 }],
  ['diff (Edit)', (R) => R.renderToolMsg(tool({ toolName: 'Edit', input: { file_path: '/p/queue.js', old_string: 'cap = 600', new_string: 'cap = 1300' }, output: 'ok' })), { row: ['Copy', 'Wrap'], cls: 'chat-diff-body' }],
  ['file (Read .js)', (R) => R.renderToolMsg(tool({ toolName: 'Read', input: { file_path: '/p/queue.js' }, output: 'const a = 1;\nexport const cap = 600;' })), { row: ['javascript', 'Copy', 'Wrap'], cls: 'chat-code-block' }],
  ['file (Read .html)', (R) => R.renderToolMsg(tool({ toolName: 'Read', input: { file_path: '/p/status.html' }, output: '<div>tower energy</div>' })), { row: ['xml', 'Preview', 'Copy', 'Wrap'], cls: 'chat-code-block' }],
  ['call stopped while it ran (prose)', (R) => R.renderToolMsg(tool({ toolName: 'Bash', status: 'error', stoppedWhileRunning: true, input: { command: 'sleep 99' }, output: 'The user stopped the call while it ran; it may have run in part.' })), { row: ['Copy'], cls: 'chat-tool-stopped-text' }],
  ['hook output (prose)', (R) => R.renderSystemMsg({ id: 'h1', content: [{ type: 'text', text: 'PostToolUse hook', hookData: { output: 'formatted 3 files with prettier' } }] }).el, { row: ['Copy'], cls: 'chat-hook-output' }],
  ['VibeSpace note to the assistant (prose)', (R) => R._renderAssistantNote({ id: 'n1', content: [{ type: 'text', text: 'x' }] }, { what: 'reminder', text: 'Update your status with vibespace-status.' }), { row: ['Copy'], cls: 'chat-hook-output' }],
  ['the CLI\'s details (prose)', (R) => R.renderSystemMsg({ id: 's1', noticeKind: 'safety-stop', content: [{ type: 'safety_stop', notice: 'The reply was stopped by a safety check.', nudge: 'Do not repeat it.' }] }).el, { row: ['Copy'], cls: 'chat-pre' }],
];
// kinds whose render path needs a live hub (a machine card's command / output, a permission's command): the renderer's own
// markup for them — the class names are pinned to the renderer's source below, so a renamed class turns this RED too
const SHAPES = [
  ['machine card command (prose)', '<div class="chat-msg chat-system-notification chat-exit-call"><div class="chat-exit-cmd-box"><pre class="chat-exit-cmd chat-pre-wrapped">Get-Process | Select -First 3</pre></div></div>', "pre.className = 'chat-exit-cmd chat-pre-wrapped';"],
  ['machine card output (prose)', '<div class="chat-msg chat-exit-card"><pre class="chat-exit-out chat-pre-wrapped">PID 1 init</pre></div>', "pre.className = 'chat-exit-out chat-pre-wrapped';"],
  ['permission command (prose)', '<div class="chat-msg chat-msg-permission"><pre class="chat-permission-cmd">rm -rf build/</pre></div>', '<pre class="chat-permission-cmd">'],
  ['a helper\'s ask command (prose)', '<div class="chat-msg"><pre class="chat-helper-ask-cmd">npm test</pre></div>', "requestPre(subj.text, 'chat-helper-ask-cmd')"],
];
const SRC = fs.readFileSync(path.join(ROOT, 'src/lib/chat-renderers.js'), 'utf8');
function census(M) {
  const R = mkRenderer(M);
  const out = [];
  for (const [name, draw, want] of KINDS) {
    let el = null, err = null;
    try { el = draw(R); R.addWrapToggles(el); } catch (e) { err = String(e.stack || e).slice(0, 300); }
    out.push({ name, want, rows: el ? toolsOf(el) : [], err });
  }
  for (const [name, html] of SHAPES) {
    const host = new El('div'); host.innerHTML = html; const el = host.firstElementChild; R.addWrapToggles(el);
    out.push({ name, want: { row: ['Copy'] }, rows: toolsOf(el), err: null });
  }
  return out;
}
/** a census row's verdict: the block of the kind carries exactly the wanted tools, at the wanted place */
function verdict(r) {
  if (r.err || !r.rows.length) return { ok: false, why: r.err || 'nothing drawn' };
  const rows = r.want.cls ? r.rows.filter((x) => x.cls.split(' ').includes(r.want.cls)) : r.rows;
  if (!rows.length || (r.want.n && rows.length !== r.want.n)) return { ok: false, why: `blocks ${rows.length}`, rows: r.rows };
  for (const x of rows) {
    if (r.want.summary) { if (JSON.stringify(x.summary) !== JSON.stringify(r.want.summary) || x.row.length || x.wrapped) return { ok: false, why: 'summary door', x }; continue; }
    if (JSON.stringify(x.row) !== JSON.stringify(r.want.row) || x.summary.length) return { ok: false, why: 'row tools', x };
  }
  return { ok: true, rows };
}

console.log('① THE CENSUS — every kind\'s tools (the real renderer, the real addWrapToggles)');
const real = census(REAL);
for (const r of real) {
  const v = verdict(r);
  const got = v.rows ? v.rows.map((x) => (x.summary.length ? `summary[${x.summary}]` : `row[${x.row}]`)).join(' ') : '';
  ok(v.ok, `${r.name}: ${r.want.summary ? `ONE ${r.want.summary} in its summary, no row, no Wrap` : `${r.want.row.join(' · ')}${r.want.row.includes('Wrap') ? '' : ' — no Wrap (drawn wrapped)'}`}${got ? ` — ${got}` : ''}`, v.ok ? undefined : v);
}
for (const [name, , anchor] of SHAPES) ok(SRC.includes(anchor), `${name}: the shape is the renderer's own (its source draws «${anchor.slice(0, 60)}»)`);
const kindsSeen = new Set(real.flatMap((r) => r.rows.map((x) => x.kind || (x.summary.length ? 'thinking' : '?'))));
ok(['thinking', 'code', 'diff', 'file', 'prose'].every((k) => kindsSeen.has(k)), `the census covers every kind of the table (${[...kindsSeen].join(', ')})`);

console.log('② the row is RESERVED — before its block, never after it');
const rowed = real.flatMap((r) => r.rows.filter((x) => x.row.length));
ok(rowed.length >= 12 && rowed.every((x) => x.barFirst), `every toolbar is its wrapper's FIRST child, right before its block (${rowed.length} rows)`, rowed.filter((x) => !x.barFirst));
{
  const R = mkRenderer(REAL);
  const el = R.renderAssistantMsg({ id: 't2', status: 'streaming', content: [{ type: 'thinking', text: 'first' }] });
  R.addWrapToggles(el);
  const sum = el.querySelector('summary');
  ok(sum && sum.children.map((c) => c.className).join('|') === 'chat-thinking-label|chat-wrap-toggle chat-thinking-copy', 'the thinking summary = the label span, then the Copy door', sum && sum.children.map((c) => c.className));
  // chat-view's streaming frame — the line itself, run on the element (a frame rewrites the label, never the summary)
  const CV = fs.readFileSync(path.join(ROOT, 'src/lib/chat-view.js'), 'utf8');
  const line = CV.split('\n').find((l) => l.includes("const summaryEl = oldEl.querySelector("));
  ok(/'\.chat-thinking-label'/.test(line || ''), 'chat-view\'s streaming frame finds the label span first', line);
  const oldEl = el; const summaryEl = eval(`(${/oldEl\.querySelector\([^;]*/.exec(line || '')?.[0] || 'oldEl.querySelector("summary")'})`); // eslint-disable-line no-eval
  if (summaryEl) summaryEl.textContent = 'Thinking';
  ok(!!el.querySelector('.chat-thinking-copy'), 'a streaming frame leaves the Copy door in place');
  ok(!REAL.ChatRenderers.prototype.addWrapToggles.toString().includes('position'), 'addWrapToggles places no tool by coordinates');
}

console.log('③ the behaviour kept (law 4)');
{
  const R = mkRenderer(REAL);
  const press = async (b) => { if (!b) return null; const ev = { prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; } }; CLIP = null; b.onclick(ev); await new Promise((r) => setTimeout(r, 0)); return ev; };
  const diff = R.renderToolMsg(tool({ toolName: 'Edit', input: { file_path: '/p/q.js', old_string: 'cap = 600', new_string: 'cap = 1300' }, output: 'ok' })); R.addWrapToggles(diff);
  const dCopy = diff.querySelectorAll('.chat-code-toolbar button').find((b) => b.textContent === 'Copy');
  await press(dCopy);
  ok(CLIP === '-cap = 600\n+cap = 1300', `a diff's Copy keeps its +/- prefixes (${JSON.stringify(CLIP)})`);
  const file = R.renderToolMsg(tool({ toolName: 'Read', input: { file_path: '/p/q.js' }, output: 'const a = 1;\nexport const cap = 600;' })); R.addWrapToggles(file);
  await press(file.querySelectorAll('.chat-code-toolbar button').find((b) => b.textContent === 'Copy'));
  ok(CLIP === 'const a = 1;\nexport const cap = 600;', `a file's Copy strips the line-number gutter (${JSON.stringify(CLIP)})`);
  const fence = R.renderAssistantMsg({ id: 'a2', content: [{ type: 'text', text: FENCE }] }); R.addWrapToggles(fence);
  const fb = fence.querySelectorAll('.chat-code-toolbar button');
  await press(fb.find((b) => b.textContent === 'Copy'));
  ok(CLIP === 'const head = Game.rooms.W46N43.memory.spawnQueue[0];', `a fence's Copy is its code (${JSON.stringify(CLIP)})`);
  const wrapBtn = fb.find((b) => b.textContent === 'Wrap'); const pre = fence.querySelector('pre');
  await press(wrapBtn);
  const on = pre.classList.contains('chat-pre-wrapped') && wrapBtn.textContent === 'No Wrap';
  await press(wrapBtn);
  ok(on && !pre.classList.contains('chat-pre-wrapped') && wrapBtn.textContent === 'Wrap', 'Wrap toggles chat-pre-wrapped and its words (Wrap ⇄ No Wrap)');
  const th = R.renderAssistantMsg({ id: 't3', content: [{ type: 'thinking', text: THINK }] }); R.addWrapToggles(th);
  const det = th.querySelector('.chat-thinking'); det.open = true;
  const ev = await press(th.querySelector('.chat-thinking-copy'));
  ok(!!ev && CLIP === THINK && ev.prevented >= 1 && ev.stopped >= 1 && det.open, `the thinking Copy copies the whole thinking and stops the press (the block stays open) — ${CLIP && CLIP.length} chars`);
  ok(th.querySelector('.chat-thinking-copy')?.type === 'button', 'the thinking door is a type=button (no form, no submit)');
}

console.log('④ the CSS — prose is drawn wrapped, theme vars only, the shared phone block');
{
  const css = fs.readFileSync(path.join(ROOT, 'public/chat.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = []; // flat [selector, body, media] list (one level of @media)
  const walk = (text, media) => { for (const m of text.matchAll(/([^{}]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)) { const sel = m[1].trim(); if (sel.startsWith('@media')) walk(m[2], sel); else rules.push([sel, m[2], media]); } };
  walk(css, null);
  const wrappedBy = (sel) => rules.filter(([s, b]) => s.split(',').map((x) => x.trim()).some((x) => x === sel || x.endsWith(' ' + sel) || x.replace(/^pre/, '') === sel.replace(/^pre/, '')) && /white-space:\s*pre-wrap/.test(b));
  ok(Array.isArray(REAL.PROSE_PRE) && REAL.PROSE_PRE.length >= 5, `the renderer exports its PROSE table (${(REAL.PROSE_PRE || []).length} selectors)`);
  for (const sel of REAL.PROSE_PRE || []) ok(wrappedBy(sel).length > 0, `PROSE «${sel}» is drawn wrapped by chat.css (${(wrappedBy(sel)[0] || [''])[0].slice(0, 70)})`);
  const mine = rules.filter(([s]) => /chat-code-toolbar|chat-thinking-copy/.test(s));
  ok(mine.length >= 6, `the toolbar / door rules found (${mine.length})`);
  const literal = mine.filter(([, b]) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black|gray|grey)\b/i.test(b));
  ok(literal.length === 0, 'no literal colour in them — theme vars only', literal);
  const PHONE = '@media (max-width: 768px), (pointer: coarse) and (max-width: 1023px)';
  const finger = rules.filter(([s, b]) => /chat-code-toolbar \.chat-wrap-toggle/.test(s) && /min-height:\s*44px/.test(b));
  ok(finger.length === 1 && finger[0][2] === PHONE && /\.chat-thinking-copy/.test(finger[0][0]) && /\.chat-lang-btn/.test(finger[0][0]), 'the finger rule (44 px) is ONE rule in the shared phone block — toolbar buttons, the language picker and the thinking door', finger.map((f) => [f[0], f[2]]));
  const fs13 = finger[0] && /font-size:\s*(\d+)px/.exec(finger[0][1]);
  ok(!!fs13 && Number(fs13[1]) >= 12 && /min-width:\s*44px/.test(finger[0][1]), `…its words ≥ 12 px (${fs13 && fs13[1]} px) and 44 px wide at least`);
  ok(!rules.some(([s, b]) => /chat-code-toolbar/.test(s) && /position:\s*absolute/.test(b)), 'no toolbar rule lays it absolute (over its block)');
  // round 2 (acceptance T2): a MOUSE click focuses the button — a :focus-within rule kept that block's row shown after the
  // mouse left (the base's hover fade changed); keyboard focus shows the row / the door through :focus-visible only
  const shows = rules.filter(([s, b]) => /chat-code-toolbar|chat-thinking-copy/.test(s) && /opacity:\s*1\b/.test(b)).flatMap(([s]) => s.split(',').map((x) => x.trim()));
  ok(!shows.some((x) => /:focus-within|:focus(?![-\w])/.test(x)) && shows.some((x) => /^\.chat-code-toolbar:has\(:focus-visible\)$/.test(x)) && shows.some((x) => /\.chat-thinking-copy:focus-visible$/.test(x)),
    'the row and the door show on KEYBOARD focus only (:focus-visible) — a mouse click\'s focus (:focus-within / :focus) never keeps a row shown', shows.filter((x) => /focus/.test(x)));
  const unsel = (name) => rules.some(([s, b]) => s.split(',').map((x) => x.trim()).includes(name) && /(^|;|\s)user-select:\s*none/.test(b));
  ok(unsel('.chat-code-toolbar') && unsel('.chat-thinking-copy'), 'the row and the door are user-select none (in the flow, a selection across a block never picks up their words)');
}

console.log('⑤ RED controls (the same bundle, anchored edits)');
let C = null;
try { C = controls(); } catch (e) { ok(false, 'the controls build from this tree\'s bundle', String(e.message || e)); }
if (C) {
  const { BASE_RULE, NO_COPY } = C;
  const bad = census(BASE_RULE).filter((r) => !verdict(r).ok).map((r) => r.name);
  const wantRed = ['thinking', 'call stopped while it ran (prose)', 'hook output (prose)', 'VibeSpace note to the assistant (prose)', 'the CLI\'s details (prose)', 'machine card command (prose)', 'machine card output (prose)', 'permission command (prose)', 'a helper\'s ask command (prose)'];
  ok(wantRed.every((n) => bad.includes(n)), `the base's rule (every block Copy + Wrap): ① RED on every prose kind and the thinking (${bad.length} kinds)`, bad);
  const rowedBase = census(BASE_RULE).flatMap((r) => r.rows.filter((x) => x.row.length));
  ok(rowedBase.length && rowedBase.every((x) => !x.barFirst), '…and ② RED: its toolbar comes AFTER the block (the overlay)');
  const badNoCopy = census(NO_COPY).filter((r) => !verdict(r).ok).map((r) => r.name);
  ok(['markdown fence', 'tool input + output (Bash)', 'tool error'].every((n) => badNoCopy.includes(n)), `a table that drops Copy from code: ① RED on ${badNoCopy.join(', ')}`, badNoCopy);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
