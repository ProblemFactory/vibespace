#!/usr/bin/env node
// test-card-grammar — THE CARD GRAMMAR as a census (lane api-call-card-words; docs/kb-patterns.md «Card grammar»):
// a proposal / approval card says WHO does WHAT to WHICH named thing; every raw string (URL, sha, byte count, an id of
// 16+ chars) lives under ONE element marked data-fold="tech"; the policy is a chip, never a "—— " sentence; the title
// is ≤ 90 chars and said once; no BUTTON label carries a URL or a method + path (the always-allow button says
// the plain phrase; the shape it grants is a 「以后放行：…」 line in the fold).
//   ① the renderers: every src/lib file that draws a decision card (an Approve / Reject / Allow / Deny label + a card /
//      proposal / permission class) is RENDERED here, or carries no tell; THE EXCEPTION LIST IS EMPTY (lane
//      card-grammar-exceptions rendered its last three) — a new renderer with a tell is RED until it is rendered here
//   ② the raw-API card (src/lib/channel-api-card-view.js, bundled with esbuild over a small fake DOM), three fixtures
//      (a known docx delete, an unknown call, a known non-delete send with the agent's why) × en / zh: the chat card,
//      the Outbox row + its expanded card (no second title), the fold, the chips, Reject's reason popover
//   ③ RED controls: the .263 API card's own words (a raw URL title, the URL, the header, "Body · 38 B · sha256 …",
//      the "—— always asks" sentence) fail the grammar; the real card with its fold mark stripped fails it too; the r1
//      always-allow label 「执行，并始终允许 POST open.feishu.cn/open-apis/im/*/messages」 fails the button leg
//   ④ the three cards that were the exception list (lane card-grammar-exceptions), REAL modules bundled over this fake DOM,
//      en + zh: the Outbox proposal's ATTACHMENT rows (src/lib/channel-outbox.js — name + 「图片 · 2 KB」, the mime / the
//      bytes / the sha256 under ONE 技术细节 fold), the chat's image card (src/lib/chat-renderers.js — 「PNG · 12 KB」), the
//      For-you row of a raw-API proposal (src/lib/user-todos-row.js over the real store + the real wordsOf: the card's own
//      title, the policy a chip, the method + URL + sha256 in the fold above Approve)
//   ⑤ RED controls: a raw sha / mime / id PLANTED outside the fold of each of the three is RED by name; each fold's mark
//      stripped is RED; the .270 words (the old attachment meta, the old image meta, the old For-you item) are RED
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', JSON.stringify(info).slice(0, 900)); } };

// ── THE GRAMMAR (over any element tree with tagName / className / dataset / childNodes / textContent) ──
const TITLE_MAX = 90;
const TELLS = {
  url: /https?:\/\/|\/open-apis\/|\/api\/[\w.]+|\/gmail\/v1\//,
  sha: /\bsha256\b|\b[0-9a-f]{16,}\b/i,
  bytes: /\b\d+(?:\.\d+)? ?(?:B|KB|MB)\b/,
  rawId: /[A-Za-z0-9_-]{16,}/g,
  mime: /\b(?:application|image|text|audio|video|font|multipart)\/[a-z0-9][\w.+-]*/i,
  sentence: /—— /,
  button: /https?:\/\/|\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+\S*\/|\/[\w.*-]+\/[\w.*-]+/,   // a URL, a method + path, a path
};
const cls = (n) => String(n.className || '').split(/\s+/);
/** The visible text pieces OUTSIDE the tech fold (`chips: false` = without the size chips' text too). */
function outsideText(n, out = [], { chips = true } = {}) {
  if (n.nodeType === 3) { if (n.data.trim()) out.push(n.data); return out; }
  if (n.dataset && n.dataset.fold === 'tech') return out;
  if (n.hidden) return out;
  if (!chips && n.dataset && n.dataset.chip === 'size') return out;
  for (const c of n.childNodes || []) outsideText(c, out, { chips });
  if (n.tagName === 'INPUT' && n.placeholder) out.push(n.placeholder);
  return out;
}
/** A SIZE CHIP (data-chip="size", lane card-grammar-exceptions) may say a size in the reader's words — 「图片 · 2.3 MB」:
 *  every · part a word (no digit) or ONE human size; a raw byte count (「14336 B」) in it is still the bytes tell. */
const HUMAN_SIZE = /^(?:\d{1,4} (?:B|KB)|\d+(?:\.\d)? (?:MB|GB))$/;
const sizeChipOk = (s) => { const parts = String(s).trim().split(' · '); return parts.filter((x) => HUMAN_SIZE.test(x)).length <= 1 && parts.every((x) => HUMAN_SIZE.test(x) || !/\d/.test(x)); };
const all = (n, pred, out = []) => { if (n.nodeType !== 3) { if (pred(n)) out.push(n); for (const c of n.childNodes || []) all(c, pred, out); } return out; };
function violations(root, { titleSel = 'chan-api-head' } = {}) {
  const v = [];
  const text = outsideText(root).join(' ');
  const inFold = (n) => { for (let x = n; x; x = x.parentNode) if (x.dataset && x.dataset.fold === 'tech') return true; return false; };
  if (TELLS.url.test(text)) v.push('url');
  if (TELLS.sha.test(text)) v.push('sha');
  if (TELLS.bytes.test(outsideText(root, [], { chips: false }).join(' ')) || all(root, (n) => n.dataset && n.dataset.chip === 'size' && !n.hidden && !inFold(n)).some((c) => !sizeChipOk(c.textContent))) v.push('bytes');
  if (TELLS.mime.test(text)) v.push('mime');
  if ((text.match(TELLS.rawId) || []).some((tok) => /\d/.test(tok))) v.push('raw-id');
  if (TELLS.sentence.test(text)) v.push('sentence');
  if (all(root, (n) => cls(n).includes('chan-api-chip') || cls(n).includes('ut-api-chip')).some((c) => /—/.test(c.textContent))) v.push('chip-sentence');
  if (all(root, (n) => n.tagName === 'BUTTON' && !inFold(n)).some((b) => TELLS.button.test(b.textContent))) v.push('button-raw');
  const heads = all(root, (n) => cls(n).includes(titleSel));
  if (heads.some((h) => h.textContent.length > TITLE_MAX)) v.push('title-long');
  return v;
}

// ── ① THE RENDERERS (grep-derived) ──
console.log('① the decision-card renderers in src/lib');
const RENDERED = {
  'src/lib/channel-api-card-view.js': 'the raw-API proposal card — rendered in ② (chat, Outbox row + card, API access dialog)',
  'src/lib/channel-outbox.js': 'the reply / compose proposal card\'s ATTACHMENT rows — rendered in ④ (name + kind · size; the mime / bytes / sha256 in the fold)',
  'src/lib/chat-renderers.js': 'the chat\'s image card — rendered in ④ (the format word + a human size)',
  'src/lib/user-todos-row.js': 'the For-you row of a raw-API proposal — rendered in ④ (the card\'s title, the policy chip, the call in the fold)',
};
// THE EXCEPTION LIST — cards that still lead with raw strings. EMPTY since lane card-grammar-exceptions (B-17e5): a card
// that cannot be rendered here yet is listed with its reason, and the list is the backlog
const EXCEPTIONS = {};
const STATIC = [['sha', /sha256|bodySha/], ['bytes', /sizeText\(|fmtBytes\(|formatBytes\(/], ['raw-path', /\$\{[\w.]*method\} \$\{[\w.]*(?:path|host)/], ['url', /`https?:\/\/\$\{/]];
const libFiles = fs.readdirSync(path.join(ROOT, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => `src/lib/${f}`);
const derived = libFiles.filter((f) => { const s = fs.readFileSync(path.join(ROOT, f), 'utf8'); return /t\('(?:Approve|Reject|Allow|Deny|Always Allow|Allow once)'\)/.test(s) && /-card|proposal|-prop\b|permission/.test(s); });
const C = require(path.join(ROOT, 'src/channel-api-card.js'));
const tellsOf = (f) => { const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n'); const out = []; lines.forEach((l, i) => { for (const [k, re] of STATIC) if (re.test(l)) out.push(`${k}@${i + 1}`); }); return out; };
console.log(`    derived (${derived.length}): ${derived.map((f) => path.basename(f)).join(', ')}`);
ok(Object.keys(RENDERED).every((f) => derived.includes(f)) && derived.length >= 4, 'the derivation finds the rendered cards and the other decision cards', derived);
const unlisted = derived.filter((f) => !RENDERED[f] && !EXCEPTIONS[f] && tellsOf(f).length);
ok(!unlisted.length, 'every decision-card renderer with a raw-string tell is rendered here or listed as an exception', unlisted.map((f) => `${f}: ${tellsOf(f).join(' ')}`));
const stale = Object.keys(EXCEPTIONS).filter((f) => !derived.includes(f) || !tellsOf(f).length);
ok(!stale.length, 'every listed exception still has a tell (a fixed card leaves the list)', stale);
ok(!Object.keys(EXCEPTIONS).length, 'THE EXCEPTION LIST IS EMPTY — every decision-card renderer with a tell is rendered here', Object.keys(EXCEPTIONS));
console.log(`    EXCEPTION LIST: ${Object.keys(EXCEPTIONS).length ? '' : '(empty)'}`);
for (const [f, why] of Object.entries(EXCEPTIONS)) console.log(`      - ${f} — ${why} [${tellsOf(f).join(' ')}]`);
for (const f of Object.keys(RENDERED)) console.log(`      ✓ ${f} — ${RENDERED[f]}${tellsOf(f).length ? ` [static: ${tellsOf(f).join(' ')}]` : ''}`);
for (const f of derived.filter((x) => !RENDERED[x] && !EXCEPTIONS[x])) console.log(`      · ${f} — no static tell (not rendered here)`);

// ── A SMALL FAKE DOM (what the card views touch): elements, text, innerHTML parsed, a small selector engine ──
class Txt { constructor(s) { this.nodeType = 3; this.data = String(s); this.parentNode = null; } get textContent() { return this.data; } remove() { if (this.parentNode) this.parentNode.removeChild(this); } }
const VOID = new Set(['IMG', 'BR', 'INPUT', 'HR', 'META', 'LINK', 'SOURCE', 'WBR']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (x) => String(x).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(/x/i.test(e[1]) ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
/** innerHTML → nodes (the markup our renderers build: tags, quoted attributes, entities, void and self-closed tags). */
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
/** One compound selector (tag . [attr] [attr="v"] :scope) / a chain with descendant and > — what the renderers query. */
function compound(e, c, scope) {
  if (c === ':scope') return e === scope;
  const m = /^([a-z][\w-]*)?((?:\.[\w-]+|\[[^\]]+\])*)$/i.exec(c);
  if (!m || (m[1] && e.tagName !== m[1].toUpperCase())) return false;
  for (const part of m[2].match(/\.[\w-]+|\[[^\]]+\]/g) || []) {
    if (part[0] === '.') { if (!cls(e).includes(part.slice(1))) return false; continue; }
    const am = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
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
  constructor(tag) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = []; this.dataset = {}; this.attrs = {}; this.className = ''; this.parentNode = null; this.listeners = {}; this.hidden = false; this.open = false; this.placeholder = ''; this.value = ''; this.type = ''; this.href = ''; this.title = ''; this.id = ''; this.style = { setProperty(k, v) { this[k] = String(v); }, removeProperty(k) { delete this[k]; } }; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get isConnected() { return true; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; if (v !== '' && v != null) this.appendChild(new Txt(v)); }
  set innerHTML(v) { this.textContent = ''; parseHtml(v, this); }
  get classList() { return { contains: (c) => cls(this).includes(c), add: (...cs) => { for (const c of cs) if (!cls(this).includes(c)) this.className = `${this.className} ${c}`.trim(); }, remove: (...cs) => { this.className = cls(this).filter((x) => x && !cs.includes(x)).join(' '); }, toggle: (c, on) => { const has = cls(this).includes(c); const want = on === undefined ? !has : !!on; if (want && !has) this.className = `${this.className} ${c}`.trim(); if (!want && has) this.className = cls(this).filter((x) => x !== c).join(' '); return want; } }; }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new Txt(n) : n); }
  prepend(...ns) { for (const n of ns.reverse()) this.insertBefore(typeof n === 'string' ? new Txt(n) : n, this.childNodes[0] || null); }
  replaceChildren(...ns) { this.textContent = ''; this.append(...ns); }
  insertBefore(n, ref) { if (!ref) return this.appendChild(n); if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, n); return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceWith(n) { const p = this.parentNode; if (!p) return; p.insertBefore(n, this); p.removeChild(this); }
  after(n) { const p = this.parentNode; const i = p.childNodes.indexOf(this); p.insertBefore(n, p.childNodes[i + 1] || null); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  dispatch(type, ev = {}) { const e = { type, target: this, preventDefault() {}, stopPropagation() {}, ...ev }; for (const fn of this.listeners[type] || []) fn(e); }
  click() { this.dispatch('click'); if (typeof this.onclick === 'function') this.onclick({ preventDefault() {}, stopPropagation() {} }); }
  focus() { globalThis.__focused = this; }
  getBoundingClientRect() { return { top: 0, bottom: 20, left: 0, right: 500, width: 500, height: 20 }; }
  matches(sel) { return String(sel).split(',').some((x) => matchSel(this, x.trim(), null)); }
  closest(sel) { for (let e = this; e && e.nodeType === 1; e = e.parentNode) if (e.matches(sel)) return e; return null; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) { return all(this, (n) => n !== this && String(sel).split(',').some((x) => matchSel(n, x.trim(), this))); }
}
const body = new El('body');
globalThis.document = { createElement: (tag) => new El(tag), createTextNode: (s) => new Txt(s), getElementById: (id) => all(body, (n) => n.id === id)[0] || null, body, documentElement: new El('html'), head: new El('head'), addEventListener() {}, removeEventListener() {}, querySelector: (q) => body.querySelector(q), querySelectorAll: (q) => body.querySelectorAll(q) };

// ── THE BUNDLE: the REAL card view; utils.js (fetch / toast) and i18n.js (the dictionaries, a switchable language) stubbed ──
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-card-grammar-'));
const stubs = {
  'utils.js': 'export const fetchJson = (...a) => globalThis.__fetchJson(...a); export const showToast = (...a) => { (globalThis.__toasts ||= []).push(a); };',
  'i18n.js': `import zh from ${JSON.stringify(path.join(ROOT, 'src/lib/i18n-zh.js'))}; import ja from ${JSON.stringify(path.join(ROOT, 'src/lib/i18n-ja.js'))};
    const D = { zh, ja };
    export function resolveLang() { return globalThis.__LANG || 'en'; }
    export function t(str, params) { const d = D[globalThis.__LANG]; let s = (d && d[str]) || str; if (params) s = s.replace(/\\{(\\w+)\\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m)); return s; }`,
};
const out = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/lib/channel-api-card-view.js')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\/(utils|i18n)\.js$/ }, (a) => (a.importer.endsWith('channel-api-card-view.js') ? { path: path.basename(a.path), namespace: 'stub' } : null));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js', resolveDir: ROOT }));
  } }],
});
const bundle = path.join(tmp, 'card-view.cjs');
fs.writeFileSync(bundle, out.outputFiles[0].text);
const V = require(bundle);
const calls = [];
let cards = [];
globalThis.__fetchJson = async (url, opts = {}) => { calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null }); return url === '/api/channels/api' ? { cards } : { ok: true }; };

// ── ② THE RAW-API CARD — three fixtures ──
const DOC = 'DocFixtureAAAAAAAAAA1', BLK = 'BlkFixtureBBBBBBBBBB2', T0 = Date.now();
const base = (o) => ({ status: 'pending', cred: 'lark-1', credLabel: 'Lark · ops', at: T0 - 3600e3, conv: 'agent-1', principal: { kind: 'agent', id: 'agent-1', name: 'Odd jobs' }, host: 'open.feishu.cn', query: [], headers: { 'content-type': 'application/json' }, bodySha: 'ab'.repeat(32), tier: 'write-ask', digest: 'd-1', ...o });
const FX = {
  docxDelete: base({ id: 'api-docx', method: 'DELETE', path: `/open-apis/docx/v1/documents/${DOC}/blocks/${BLK}/children/batch_delete`, body: '{"start_index":0,"end_index":3}', bodyBytes: 31, sensitive: 'delete' }),
  unknown: base({ id: 'api-unknown', method: 'POST', path: '/open-apis/contact/v3/users/ou_fixture1234567890abcdef/x1', body: '{"a":1}', bodyBytes: 7, sensitive: null, offersAlways: true, shape: 'POST open.feishu.cn/open-apis/contact/*/users/*/x1' }),
  gen: base({ id: 'api-gen', method: 'DELETE', path: `/open-apis/docx/v1/documents/${DOC}/blocks/${BLK}/children/batch_delete`, body: '{}', bodyBytes: 2, sensitive: 'delete' }),   // no count in the body ⇒ the GENERATED words
  send: base({ id: 'api-send', method: 'POST', path: '/open-apis/im/v1/messages', query: [['receive_id_type', 'chat_id']], body: '{"receive_id":"oc_fixture","msg_type":"text"}', bodyBytes: 46, sensitive: null, offersAlways: true, shape: 'POST open.feishu.cn/open-apis/im/*/messages', objectName: 'Product room', objectConv: { adapterId: 'lark-1', convId: 'oc_fixture' }, note: 'post the weekly summary' }),
};
const opened = [];
const app = { openChannel: (a, c) => opened.push([a, c]), ws: { onGlobal() {} } };
const WANT = {
  en: { gen: 'Odd jobs wants to batch-delete document block children “DocFixtu…”', docxDelete: 'Odd jobs wants to delete 3 blocks (1–3) from the document “DocFixtu…”', unknown: 'Odd jobs wants to call the Lark API (POST users)', send: 'Odd jobs wants to send a message in Product room', chip: 'Delete · always asks', fold: 'Technical details',
    alwaysSend: 'Run and never ask again (send a message in Product room)', alwaysUnknown: 'Run and never ask again (call the Lark API)', allowLine: 'Allowed from then on: POST open.feishu.cn/open-apis/im/*/messages' },
  zh: { gen: 'Odd jobs 想批量删除 文档块的子块（DocFixtu…）', docxDelete: 'Odd jobs 想删除文档《DocFixtu…》里的 3 个块（第 1–3 个）', unknown: 'Odd jobs 想调用 Lark API（POST users）', send: 'Odd jobs 想在 Product room 发消息', chip: '删除 · 总是询问', fold: '技术细节',
    alwaysSend: '执行，并以后不再问（在 Product room 发消息）', alwaysUnknown: '执行，并以后不再问（调用 Lark API）', allowLine: '以后放行：POST open.feishu.cn/open-apis/im/*/messages' },
};
for (const lang of ['en', 'zh']) {
  globalThis.__LANG = lang === 'en' ? null : lang;
  console.log(`② the raw-API card (${lang})`);
  for (const [k, rec] of Object.entries(FX)) {
    const c = V.renderApiCard(rec, null, { app });
    const head = c.querySelector('.chan-api-head'), tech = c.querySelectorAll('.chan-api-tech');
    ok(head && head.textContent === WANT[lang][k], `${k}: the title = actor + verb + named object — "${head && head.textContent}"`, head && head.textContent);
    ok(!violations(c).length, `${k}: no raw string outside the fold, policy as a chip, title ≤ ${TITLE_MAX}`, { v: violations(c), text: outsideText(c) });
    const fold = tech[0];
    ok(tech.length === 1 && fold.dataset.fold === 'tech' && fold.open === false && fold.childNodes[0].tagName === 'SUMMARY' && /https:\/\/open\.feishu\.cn\/open-apis\//.test(fold.textContent) && /sha256 abab/.test(fold.textContent) && /\d+ B/.test(fold.textContent) && fold.textContent.includes('content-type: application/json') && fold.childNodes[0].textContent === WANT[lang].fold,
      `${k}: ONE collapsed 技术细节 fold holds the method + full URL, the header, the size + sha256, the body`, fold && fold.textContent.slice(0, 300));
  }
  const d = V.renderApiCard(FX.docxDelete, null, { app });
  const chips = d.querySelectorAll('.chan-api-chip').map((x) => x.textContent);
  ok(chips[0] === WANT[lang].chip && !d.querySelector('.chan-api-always'), `the delete's policy is ONE chip "${chips[0]}" (and no always-allow)`, chips);
  ok(V.renderApiCard(FX.docxDelete, null, { app }).querySelector('.chan-api-body').textContent === '{\n  "start_index": 0,\n  "end_index": 3\n}', 'the body is pretty-printed in the fold');
  const s = V.renderApiCard(FX.send, null, { app });
  const link = s.querySelector('.chan-api-obj');
  link.dispatch('click');
  ok(link.tagName === 'A' && opened.length && opened[opened.length - 1][1] === 'oc_fixture', 'a named chat is a link that opens its conversation', opened);
  ok(s.querySelector('.chan-api-note').textContent === '“post the weekly summary”', 'the agent\'s own --why is a quoted line under the title');
  // the always-allow button: the plain phrase; the shape it grants is the fold's line
  const u = V.renderApiCard(FX.unknown, null, { app });
  ok(s.querySelector('.chan-api-always').textContent === WANT[lang].alwaysSend && u.querySelector('.chan-api-always').textContent === WANT[lang].alwaysUnknown, `the always-allow button says the plain phrase — "${s.querySelector('.chan-api-always').textContent}" / "${u.querySelector('.chan-api-always').textContent}"`);
  ok(s.querySelector('.chan-api-allowline').textContent === WANT[lang].allowLine && s.querySelector('.chan-api-allowline').parentNode.dataset.fold === 'tech' && !d.querySelector('.chan-api-allowline'), 'the shape it will allow is a line inside the 技术细节 fold (none on a card that offers no always-allow)');
  const btns = [d, s, u].flatMap((c) => c.querySelectorAll('.mounts-btn'));
  ok(btns.length >= 7 && btns.every((b) => !TELLS.button.test(b.textContent)), `no button label carries a URL / method + path (${btns.length} buttons)`, btns.map((b) => b.textContent));
  ok(V.renderApiCard(FX.docxDelete, null, { app }).querySelector('.chan-api-objid').textContent === 'DocFixtu…', 'an unnamed document is its id in an 8-char chip');
  // actions: Approve needs no reason; Reject asks in a popover
  calls.length = 0;
  const a = V.renderApiCard(FX.send, null, { app });
  ok(!a.querySelector('.chan-api-why') && !a.querySelector('.chan-api-reject-pop'), 'no reason box until Reject is pressed');
  a.querySelector('.chan-api-approve').click();
  await new Promise((r) => setTimeout(r, 0));
  ok(calls.some((x) => x.url === '/api/channels/api/proposals/api-send/approve' && x.body.shown === 'd-1' && !('reason' in x.body)), 'Approve: the frozen digest, no reason', calls);
  a.querySelector('.chan-api-reject').click();
  const pop = a.querySelector('.chan-api-reject-pop');
  ok(!!pop && !!pop.querySelector('.chan-api-why') && globalThis.__focused === pop.querySelector('.chan-api-why') && !calls.some((x) => /reject$/.test(x.url)), 'Reject opens the reason popover (focused) and sends nothing yet');
  pop.querySelector('.chan-api-why').value = 'wrong room';
  pop.querySelector('.chan-api-reject-go').click();
  await new Promise((r) => setTimeout(r, 0));
  ok(calls.some((x) => x.url === '/api/channels/api/proposals/api-send/reject' && x.body.reason === 'wrong room') && !a.querySelector('.chan-api-reject-pop'), 'the popover\'s Reject sends the reason and closes', calls);
  // the Outbox: row = short title + chip + outcome; the expanded card never repeats the title
  cards = [FX.docxDelete, FX.unknown, FX.send];
  const sec = V.apiOutboxSection(app);
  await new Promise((r) => setTimeout(r, 0));
  const rows = sec.el.querySelectorAll('.chan-api-orow');
  const r0 = rows[0];
  ok(rows.length === 3 && r0.querySelector('.chan-api-orow-head').textContent === WANT[lang].docxDelete && r0.querySelector('.chan-api-orow-chip').textContent === WANT[lang].chip && !r0.querySelector('.chan-api-orow-chip').hidden && /23/.test(r0.querySelector('.chan-api-orow-out').textContent), 'the Outbox row: the short title + the policy chip + 等你决定 · 23 h', rows.map((r) => r.textContent));
  ok(rows[2].querySelector('.chan-api-orow-chip').hidden, 'a non-sensitive row draws no chip');
  const open = sec.el.querySelectorAll('.chan-api-card');
  ok(open.length === 3 && open.every((c) => !c.querySelector('.chan-api-head') && !c.querySelector('.chan-api-outcome') && !c.querySelector('.chan-api-chip-warn')) && rows.every((r) => r.classList.contains('chan-orow-open')) && open.every((c) => !violations(c).length) && rows.every((r) => !violations(r, { titleSel: 'chan-api-orow-head' }).length), 'the expanded cards repeat neither the title nor the row\'s chip / outcome, and rows + cards pass the grammar', open.map((c) => violations(c)));
  sec.stop();
}

// ── ③ RED CONTROLS ──
console.log('③ RED controls');
const mk = (tag, cl, kids = [], extra = {}) => { const e = new El(tag); e.className = cl; for (const k of kids) e.append(k); Object.assign(e, extra); return e; };
// the .263 card, word for word as its renderer drew it (title / outcome / request + header / open body fold / sensitive sentence / reason box)
const OLD = mk('div', 'chan-api-card', [
  mk('div', 'chan-api-head', [`Odd jobs 想调用 Lark · ops · DELETE /open-apis/docx/v1/documents/${DOC}/blocks/${BLK}/children/batch_delete`]),
  mk('div', 'chan-api-outcome', ['等你决定 · 23 小时后过期']),
  mk('div', 'chan-api-req', [mk('code', '', [`DELETE open.feishu.cn/open-apis/docx/v1/documents/${DOC}/blocks/${BLK}/children/batch_delete`]), mk('div', 'chan-api-hdr', ['content-type: application/json'])]),
  mk('details', 'chan-api-body', [mk('summary', '', ['请求体 · 38 B · sha256 5144aa00bb11cc22']), mk('pre', '', ['{"start_index":0,"end_index":3}'])], { open: true }),
  mk('div', 'chan-api-sensitive', ['敏感操作 —— 总是会问你（delete）']),
  mk('div', 'chan-api-actions', [mk('input', 'chan-api-why', [], { placeholder: '原因（agent 会看到）' })]),
]);
const vOld = violations(OLD);
ok(['url', 'sha', 'bytes', 'raw-id', 'sentence', 'title-long'].every((k) => vOld.includes(k)), `CONTROL: the .263 API card fails the grammar (${vOld.join(', ')})`, vOld);
const stripped = V.renderApiCard(FX.docxDelete, null, { app });
delete stripped.querySelector('.chan-api-tech').dataset.fold;
const r1 = mk('div', 'chan-api-card', [mk('div', 'chan-api-actions', [mk('button', 'mounts-btn chan-api-always', ['执行，并始终允许 POST open.feishu.cn/open-apis/im/*/messages'])])]);
ok(violations(r1).includes('button-raw') && TELLS.button.test('Run and always allow POST slack.com/api/chat.postMessage'), 'CONTROL: the r1 always-allow label (the raw shape on the button) fails the button leg', violations(r1));
const vS = violations(stripped);
ok(vS.includes('url') && vS.includes('sha') && vS.includes('bytes'), `CONTROL: the real card with its fold mark stripped fails it (${vS.join(', ')})`, vS);

// ── ④ THE THREE CARDS THAT WERE THE EXCEPTION LIST — the REAL modules in one bundle (the real i18n, a language per copy) ──
console.log('④ the attachment rows, the chat image card, the For-you API row (real modules)');
const saved = {};
const def = (k, v) => { saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); };
const noop = () => {};
const store = new Map();
class NoObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
for (const [k, v] of Object.entries({ window: globalThis, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, navigator: { language: 'en', userAgent: 'node' },
  addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop }), requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: noop,
  getComputedStyle: () => ({ getPropertyValue: () => '' }), innerWidth: 1280, innerHeight: 800, location: { origin: 'http://test', href: 'http://test/', hostname: 'test', protocol: 'http:', pathname: '/' },
  MutationObserver: NoObserver, ResizeObserver: NoObserver, IntersectionObserver: NoObserver, fetch: async () => ({ ok: true, json: async () => ({}) }) })) def(k, v);
const CARD_FILES = { outbox: 'src/lib/channel-outbox.js', chat: 'src/lib/chat-renderers.js', row: 'src/lib/user-todos-row.js', actions: 'src/lib/user-todos-actions.js' };
/** One bundle of the three renderers + the For-you words; `patch` = {file: [from, to]} (a mutant copy for ⑤). */
async function cardBundle(tag, patch = {}) {
  const r = await esbuild.build({
    stdin: { contents: `export { renderProposalCard } from './${CARD_FILES.outbox}'; export { imageMediaHtml } from './${CARD_FILES.chat}'; export { renderRow } from './${CARD_FILES.row}'; export { inboxModel } from './${CARD_FILES.actions}';`, resolveDir: ROOT, loader: 'js' },
    bundle: true, format: 'cjs', platform: 'node', target: 'es2022', write: false, logLevel: 'silent', loader: { '.css': 'text' },
    plugins: [{ name: 'card-stubs', setup(b) {
      b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' }));
      for (const [file, [from, to]] of Object.entries(patch)) b.onLoad({ filter: new RegExp(`${file.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(from)) throw new Error(`mutant anchor gone in ${file}`); return { contents: src.replace(from, to), loader: 'js' }; });
    } }],
  });
  const out = {};
  for (const lang of ['en', 'zh']) {   // the real i18n reads the device's language once, at load: one module copy per language
    const file = path.join(tmp, `cards-${tag}-${lang}.cjs`);
    fs.writeFileSync(file, r.outputFiles[0].text);
    store.set('vibespace.lang', lang);
    out[lang] = require(file);
  }
  return out;
}
let B = null, bundleErr = null;
try { B = await cardBundle('real'); } catch (e) { bundleErr = e; }
ok(!!B && typeof B.en.renderProposalCard === 'function' && typeof B.zh.renderRow === 'function', 'the real Outbox card, chat renderer and For-you row bundle and load over the fake DOM (en + zh)', bundleErr && String(bundleErr.stack || bundleErr).slice(0, 600));
const { UserTodoManager } = require(path.join(ROOT, 'src/user-todos.js'));
const todos = new UserTodoManager({ dataDir: tmp, expirySweepMs: 0 });
const outboxApp = { openChannel() {}, openChannelOutbox() {} };
const FILES = [
  { n: 0, name: 'shot.png', bytes: 2048, mime: 'image/png', sha256: 'b'.repeat(64), kind: 'image' },
  { n: 1, name: 'q3.pdf', bytes: 14336, mime: 'application/pdf', sha256: 'c'.repeat(64), kind: 'file' },
  { n: 2, name: 'plan.docx', bytes: 1258291, mime: 'application/zip', sha256: 'd'.repeat(64), kind: 'file' },
  { n: 3, name: 'evil.png', bytes: 120, mime: 'text/html', sha256: 'e'.repeat(64), kind: 'file' },
];
const PROP = { id: 'p-cg1', adapterId: 'lark-1', adapterLabel: 'Lark', convId: 'oc_1', key: 'lark-1/oc_1', state: 'awaiting-approval', text: 'the quarter, attached', draftedBy: { kind: 'agent', id: 'agent-1', name: 'Worker' }, attachments: FILES, canDecide: true, sendAs: 'user' };
const ROWWANT = {
  en: { meta: ['Image · 2 KB', 'PDF · 14 KB', 'Document · 1.2 MB', 'Web page · 120 B'], mismatch: 'named .png, but its bytes are HTML', unknownImage: 'Image · 2.9 MB', plan: 'Delete · always asks Lark · ops · expires 24 h after it was asked' },
  zh: { meta: ['图片 · 2 KB', 'PDF · 14 KB', '文档 · 1.2 MB', '网页 · 120 B'], mismatch: '名为 .png，但它的内容是 HTML', unknownImage: '图片 · 2.9 MB', plan: '删除 · 总是询问 Lark · ops · 提出 24 小时后过期' },
};
const outboxBox = (M) => M.renderProposalCard(outboxApp, PROP).querySelector('.chan-prop-files');
const mediaCard = (M, o) => { const d = new El('div'); d.innerHTML = M.imageMediaHtml(o); return d; };
const MEDIA = { path: '/home/u/shots/a b.png', mediaType: 'image/png', bytes: 12345 };
const fyItem = (rec) => todos.add(`channels-${rec.id}`, { ...C.forYouOf(rec), origin: 'channels' });
const fyRow = (M, item, resolved = false) => M.renderRow({ item, resolved }, M.inboxModel({ ws: { onGlobal() {}, on() {} } }).rowCtx);
const docOrder = (root, a, b) => { const list = all(root, () => true); return list.indexOf(a) >= 0 && list.indexOf(a) < list.indexOf(b); };
if (B) for (const lang of ['en', 'zh']) {
  const M = B[lang], W8 = ROWWANT[lang], TW = WANT[lang];
  console.log(`  (${lang})`);
  // (1) the Outbox proposal's attachment rows
  const box = outboxBox(M);
  const metas = box.querySelectorAll('.chan-prop-file-meta');
  ok(metas.map((x) => x.textContent).join('|') === W8.meta.join('|') && metas.every((x) => x.dataset.chip === 'size'), `outbox: each attachment row names its kind + a human size in a size chip — ${metas.map((x) => `「${x.textContent}」`).join(' ')}`, metas.map((x) => x.textContent));
  ok(!violations(box).length, 'outbox: no sha256 / mime / raw byte count / URL outside the fold (the rows, the chips, the note)', { v: violations(box), text: outsideText(box) });
  const chips = box.querySelectorAll('.chan-prop-file-chip').map((x) => x.textContent);
  ok(chips.length === 1 && chips[0] === W8.mismatch, `outbox: the name / type mismatch chip names the FORMAT, never the mime literal — "${chips[0]}"`, chips);
  const bf = box.querySelectorAll('[data-fold="tech"]');
  const want = FILES.every((a) => bf[0] && bf[0].textContent.includes(`${a.name} · ${a.mime} · ${a.bytes} B · sha256 ${a.sha256}`));
  ok(bf.length === 1 && bf[0].tagName === 'DETAILS' && !bf[0].open && bf[0].firstChild.tagName === 'SUMMARY' && bf[0].firstChild.textContent === TW.fold && want, 'outbox: ONE collapsed 技术细节 fold holds every file\'s type, exact bytes and whole sha256', bf[0] && bf[0].textContent.slice(0, 300));
  const gone = M.renderProposalCard(outboxApp, { ...PROP, id: 'p-cg2', state: 'sent', attachmentsGoneAt: 1 }).querySelector('.chan-prop-files');
  ok(!violations(gone).length && gone.querySelectorAll('[data-fold="tech"]').length === 1, 'outbox: a card whose files are gone keeps the names + kinds, the checksums in the fold', violations(gone));
  // (2) the chat's image card
  const mc = mediaCard(M, MEDIA), meta = mc.querySelector('.chat-media-meta');
  ok(meta && meta.textContent === 'PNG · 12 KB' && meta.dataset.chip === 'size' && !violations(mc).length, `chat: the image card says its format + a human size — "${meta && meta.textContent}", no mime literal`, { meta: meta && meta.textContent, v: violations(mc) });
  const odd = mediaCard(M, { path: '/x/p.ppm', mediaType: 'image/x-portable-pixmap', bytes: 3e6 }).querySelector('.chat-media-meta');
  const bare = mediaCard(M, { mediaType: 'image/gif', bytes: 2048 }), pasted = mediaCard(M, { dataUrl: 'data:image/png;base64,AAAA', mediaType: 'image/png', name: 'Image' });
  ok(odd.textContent === W8.unknownImage && bare.textContent === 'GIF · 2 KB' && bare.querySelector('.chat-tool-image-chip').dataset.chip === 'size' && pasted.querySelector('.chat-media-meta').textContent === 'PNG' && [bare, pasted].every((x) => !violations(x).length),
    `chat: a format with no common name is "${odd.textContent}"; the chip with no picture "${bare.textContent}"; a pasted picture "PNG"`, [odd.textContent, bare.textContent]);
  // (3) the For-you row of a raw-API proposal — filed through the REAL store, worded by the REAL wordsOf
  for (const k of ['docxDelete', 'unknown', 'send']) {
    const item = fyItem(FX[k]), row = fyRow(M, item);
    const text = row.querySelector('.ut-text'), fold = row.querySelectorAll('[data-fold="tech"]'), approve = row.querySelector('.ut-proposal-approve');
    ok(text && text.textContent === TW[k], `For you · ${k}: the row says the CARD's title — "${text && text.textContent}"`, text && text.textContent);
    ok(!violations(row, { titleSel: 'ut-text' }).length, `For you · ${k}: no URL / sha / raw id / byte count outside the fold (title ≤ ${TITLE_MAX})`, { v: violations(row, { titleSel: 'ut-text' }), text: outsideText(row) });
    ok(fold.length === 1 && fold[0].tagName === 'DETAILS' && !fold[0].open && fold[0].firstChild.textContent === TW.fold && fold[0].textContent.includes(`https://${FX[k].host}${FX[k].path}`) && fold[0].textContent.includes(`sha256 ${'ab'.repeat(32)}`) && /\d+ B/.test(fold[0].textContent) && approve && docOrder(row, fold[0], approve),
      `For you · ${k}: ONE collapsed 技术细节 fold ABOVE Approve holds the method + full URL, the body size + sha256`, fold[0] && fold[0].textContent.slice(0, 240));
    if (k === 'docxDelete') ok(row.querySelector('.ut-api-chip') && row.querySelector('.ut-api-chip').textContent === TW.chip && row.querySelector('.ut-proposal-plan').textContent === W8.plan, `For you · the policy is a chip on the plan line — "${row.querySelector('.ut-proposal-plan').textContent}"`, row.querySelector('.ut-proposal-plan') && row.querySelector('.ut-proposal-plan').textContent);
    if (k === 'send') ok(!row.querySelector('.ut-api-chip') && !TELLS.url.test(item.text) && item.text === WANT.en.send, `For you · a non-sensitive call draws no chip; the agent's own English item text is the title too ("${item.text}")`, item.text);
  }
  const done = fyItem({ ...FX.send, id: 'api-send-done' });
  const doneRow = fyRow(M, { ...done, status: 'done', resolvedBy: 'channel-api', resolvedFact: C.resolvedFactOf({ ...FX.send, status: 'rejected', decidedBy: 'user' }), resolvedAt: T0 }, true);
  ok(!violations(doneRow, { titleSel: 'ut-text' }).length && doneRow.querySelector('.ut-text').textContent === TW.send, 'For you · a resolved row keeps the title and nothing raw', { v: violations(doneRow, { titleSel: 'ut-text' }), text: outsideText(doneRow) });
}

// ── ⑤ RED CONTROLS for the three ──
console.log('⑤ RED controls (planted raw strings, the folds unmarked, the .270 words)');
if (B) {
  const M = B.en;
  const SUBJECTS = { outbox: () => outboxBox(M), chat: () => mediaCard(M, MEDIA), 'For you': () => fyRow(M, fyItem(FX.docxDelete)) };
  const PLANTS = [['sha', 'e3b0c44298fc1c149afbf4c8996fb924'], ['mime', 'application/pdf'], ['raw-id', 'ou_fixture1234567890abcdef'], ['bytes', '14336 B']];
  for (const [name, mk] of Object.entries(SUBJECTS)) {
    const caught = PLANTS.filter(([tell, raw]) => { const root = mk(); const host = all(root, (n) => n !== root && !n.hidden && !(n.dataset && n.dataset.fold) && n.tagName !== 'BUTTON' && n.tagName !== 'SUMMARY')[0] || root; host.appendChild(new Txt(` ${raw}`)); return violations(root, { titleSel: 'ut-text' }).includes(tell); }).map(([tell]) => tell);
    ok(caught.length === PLANTS.length, `CONTROL ${name}: a raw sha / mime / id / byte count PLANTED outside the fold is RED by name (${caught.join(', ')})`, caught);
    const chipRoot = mk(), chip = all(chipRoot, (n) => n.dataset && n.dataset.chip === 'size')[0];
    if (chip) { chip.textContent = `${chip.textContent} · 14336 B`; ok(violations(chipRoot).includes('bytes'), `CONTROL ${name}: a raw byte count INSIDE a size chip is still RED`, violations(chipRoot)); }
  }
  for (const [name, mk, tells] of [['outbox', () => outboxBox(M), ['sha', 'mime', 'bytes']], ['For you', () => fyRow(M, fyItem(FX.docxDelete)), ['url', 'sha']]]) {
    const root = mk(); for (const fd of root.querySelectorAll('[data-fold="tech"]')) delete fd.dataset.fold;
    const v = violations(root, { titleSel: 'ut-text' });
    ok(tells.every((x) => v.includes(x)), `CONTROL ${name}: the fold with its mark stripped is RED (${v.join(', ')})`, v);
  }
  // the .270 words: the old attachment meta + the old image meta (a mutant bundle of the real modules), the old For-you item
  const OLD_META = "const meta = el('span', 'chan-prop-file-meta', `${kindWord(a)} · ${P.attachmentSize(a.bytes)}`);";
  const OLD_MEDIA = "const meta = [imageFormatWord(mediaType), bytes > 0 ? fmtBytes(bytes) : ''].filter(Boolean).join(' · ');";
  let MB = null, mErr = null;
  try { MB = await cardBundle('m270', { [CARD_FILES.outbox]: [OLD_META, "const meta = el('span', 'chan-prop-file-meta', `${P.attachmentSize(a.bytes)} · ${a.mime} · sha256 ${String(a.sha256).slice(0, 12)}…`);"], [CARD_FILES.chat]: [OLD_MEDIA, "const meta = [mediaType, bytes > 0 ? fmtBytes(bytes) : ''].filter(Boolean).join(' · ');"] }); } catch (e) { mErr = e; }
  const vb = MB ? violations(outboxBox(MB.en)) : [], vm = MB ? violations(mediaCard(MB.en, MEDIA)) : [];
  ok(!!MB && vb.includes('sha') && vb.includes('mime'), `CONTROL outbox: the .270 attachment row 「2 KB · image/png · sha256 bbbbbbbbbbbb…」 is RED (${vb.join(', ')})`, mErr ? String(mErr) : vb);
  ok(!!MB && vm.includes('mime'), `CONTROL chat: the .270 image card 「image/png · 12 KB」 is RED (${vm.join(', ')})`, mErr ? String(mErr) : vm);
  const p = FX.docxDelete, call = `${p.method} ${p.host}${p.path}`;
  const old = todos.add('channels-old', { origin: 'channels', urgency: 'normal', by: 'agent', sessionName: 'Channels', text: `Odd jobs wants to call ${p.credLabel}'s API: ${p.method} ${p.path}`, detail: `${call} — expires 24 h after it was asked`,
    i18n: { text: { key: "{name} wants to call {cred}'s API: {call}", params: { name: 'Odd jobs', cred: p.credLabel, call: `${p.method} ${p.path}` } }, detail: [{ key: '{call} — expires 24 h after it was asked', params: { call } }], source: { key: 'Channels' } }, action: { type: 'channel-api-proposal', id: 'api-old', shown: 'd-1' } });
  const vo = violations(fyRow(M, old), { titleSel: 'ut-text' });
  ok(vo.includes('url') && vo.includes('raw-id'), `CONTROL For you: the .270 item 「Odd jobs wants to call Lark · ops's API: DELETE /open-apis/docx/…」 is RED (${vo.join(', ')})`, vo);
}
for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(fail ? `FAILED: ${fail} of ${pass + fail}` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
