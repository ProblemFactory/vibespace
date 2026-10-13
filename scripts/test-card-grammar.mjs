#!/usr/bin/env node
// test-card-grammar — THE CARD GRAMMAR as a census (lane api-call-card-words; docs/kb-patterns.md «Card grammar»):
// a proposal / approval card says WHO does WHAT to WHICH named thing; every raw string (URL, sha, byte count, an id of
// 16+ chars) lives under ONE element marked data-fold="tech"; the policy is a chip, never a "—— " sentence; the title
// is ≤ 90 chars and said once; no BUTTON label carries a URL or a method + path (the always-allow button says
// the plain phrase; the shape it grants is a 「以后放行：…」 line in the fold).
//   ① the renderers: every src/lib file that draws a decision card (an Approve / Reject / Allow / Deny label + a card /
//      proposal / permission class) is RENDERED here, or LISTED as an exception with its static tells (printed — the
//      backlog), or carries no tell; a new renderer with a tell is RED until it is rendered here or listed
//   ② the raw-API card (src/lib/channel-api-card-view.js, bundled with esbuild over a small fake DOM), three fixtures
//      (a known docx delete, an unknown call, a known non-delete send with the agent's why) × en / zh: the chat card,
//      the Outbox row + its expanded card (no second title), the fold, the chips, Reject's reason popover
//   ③ RED controls: the .263 API card's own words (a raw URL title, the URL, the header, "Body · 38 B · sha256 …",
//      the "—— always asks" sentence) fail the grammar; the real card with its fold mark stripped fails it too; the r1
//      always-allow label 「执行，并始终允许 POST open.feishu.cn/open-apis/im/*/messages」 fails the button leg
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
  sentence: /—— /,
  button: /https?:\/\/|\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+\S*\/|\/[\w.*-]+\/[\w.*-]+/,   // a URL, a method + path, a path
};
const cls = (n) => String(n.className || '').split(/\s+/);
/** The visible text pieces OUTSIDE the tech fold. */
function outsideText(n, out = []) {
  if (n.nodeType === 3) { if (n.data.trim()) out.push(n.data); return out; }
  if (n.dataset && n.dataset.fold === 'tech') return out;
  if (n.hidden) return out;
  for (const c of n.childNodes || []) outsideText(c, out);
  if (n.tagName === 'INPUT' && n.placeholder) out.push(n.placeholder);
  return out;
}
const all = (n, pred, out = []) => { if (n.nodeType !== 3) { if (pred(n)) out.push(n); for (const c of n.childNodes || []) all(c, pred, out); } return out; };
function violations(root, { titleSel = 'chan-api-head' } = {}) {
  const v = [];
  const text = outsideText(root).join(' ');
  if (TELLS.url.test(text)) v.push('url');
  if (TELLS.sha.test(text)) v.push('sha');
  if (TELLS.bytes.test(text)) v.push('bytes');
  if ((text.match(TELLS.rawId) || []).some((tok) => /\d/.test(tok))) v.push('raw-id');
  if (TELLS.sentence.test(text)) v.push('sentence');
  if (all(root, (n) => cls(n).includes('chan-api-chip')).some((c) => /—/.test(c.textContent))) v.push('chip-sentence');
  const inFold = (n) => { for (let x = n; x; x = x.parentNode) if (x.dataset && x.dataset.fold === 'tech') return true; return false; };
  if (all(root, (n) => n.tagName === 'BUTTON' && !inFold(n)).some((b) => TELLS.button.test(b.textContent))) v.push('button-raw');
  const heads = all(root, (n) => cls(n).includes(titleSel));
  if (heads.some((h) => h.textContent.length > TITLE_MAX)) v.push('title-long');
  return v;
}

// ── ① THE RENDERERS (grep-derived) ──
console.log('① the decision-card renderers in src/lib');
const RENDERED = { 'src/lib/channel-api-card-view.js': 'the raw-API proposal card — rendered in ② (chat, Outbox row + card, API access dialog)' };
// THE EXCEPTION LIST — cards that still lead with raw strings (one backlog item; this lane fixed only the API card)
const EXCEPTIONS = {
  'src/lib/channel-outbox.js': 'reply / compose proposal cards: each attachment row says "<size> · <mime> · sha256 <12 hex>…" outside any fold',
  'src/lib/chat-renderers.js': 'the chat\'s file / media cards: "<type> · <bytes>" meta beside the permission card renderers',
  'src/lib/user-todos-row.js': 'For-you rows: a channels API item reads "… wants to call <cred>\'s API: METHOD /path" (src/channel-api-card.js forYouOf)',
};
const STATIC = [['sha', /sha256|bodySha/], ['bytes', /sizeText\(|fmtBytes\(|formatBytes\(/], ['raw-path', /\$\{[\w.]*method\} \$\{[\w.]*(?:path|host)/], ['url', /`https?:\/\/\$\{/]];
const libFiles = fs.readdirSync(path.join(ROOT, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => `src/lib/${f}`);
const derived = libFiles.filter((f) => { const s = fs.readFileSync(path.join(ROOT, f), 'utf8'); return /t\('(?:Approve|Reject|Allow|Deny|Always Allow|Allow once)'\)/.test(s) && /-card|proposal|-prop\b|permission/.test(s); });
// a tell the renderer draws from a PURE producer elsewhere (the For-you row renders the channels API item's own text)
const C = require(path.join(ROOT, 'src/channel-api-card.js'));
const PRODUCED = { 'src/lib/user-todos-row.js': () => { const x = C.forYouOf({ id: 'api-x', method: 'DELETE', host: 'open.feishu.cn', path: '/open-apis/docx/v1/documents/DocFixtureAAAAAAAAAA1', credLabel: 'Lark · ops', principal: { name: 'Odd jobs' } }); return TELLS.url.test(x.text) ? ['url@forYouOf'] : []; } };
const tellsOf = (f) => { const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n'); const out = []; lines.forEach((l, i) => { for (const [k, re] of STATIC) if (re.test(l)) out.push(`${k}@${i + 1}`); }); return [...out, ...(PRODUCED[f] ? PRODUCED[f]() : [])]; };
console.log(`    derived (${derived.length}): ${derived.map((f) => path.basename(f)).join(', ')}`);
ok(Object.keys(RENDERED).every((f) => derived.includes(f)) && derived.length >= 4, 'the derivation finds the rendered card and the other decision cards', derived);
const unlisted = derived.filter((f) => !RENDERED[f] && !EXCEPTIONS[f] && tellsOf(f).length);
ok(!unlisted.length, 'every decision-card renderer with a raw-string tell is rendered here or listed as an exception', unlisted.map((f) => `${f}: ${tellsOf(f).join(' ')}`));
const stale = Object.keys(EXCEPTIONS).filter((f) => !derived.includes(f) || !tellsOf(f).length);
ok(!stale.length, 'every listed exception still has a tell (a fixed card leaves the list)', stale);
console.log('    EXCEPTION LIST (backlog — not fixed in this lane):');
for (const [f, why] of Object.entries(EXCEPTIONS)) console.log(`      - ${f} — ${why} [${tellsOf(f).join(' ')}]`);
for (const f of derived.filter((x) => !RENDERED[x] && !EXCEPTIONS[x])) console.log(`      · ${f} — no static tell (not rendered here)`);

// ── A SMALL FAKE DOM (what the card view touches) ──
class Txt { constructor(s) { this.nodeType = 3; this.data = String(s); this.parentNode = null; } get textContent() { return this.data; } remove() { if (this.parentNode) this.parentNode.removeChild(this); } }
class El {
  constructor(tag) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = []; this.dataset = {}; this.attrs = {}; this.className = ''; this.parentNode = null; this.listeners = {}; this.hidden = false; this.open = false; this.placeholder = ''; this.value = ''; this.type = ''; this.href = ''; this.title = ''; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get isConnected() { return true; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; if (v !== '' && v != null) this.appendChild(new Txt(v)); }
  get classList() { return { contains: (c) => cls(this).includes(c), add: (c) => { if (!cls(this).includes(c)) this.className = `${this.className} ${c}`.trim(); }, toggle: (c, on) => { const has = cls(this).includes(c); const want = on === undefined ? !has : !!on; if (want && !has) this.className = `${this.className} ${c}`.trim(); if (!want && has) this.className = cls(this).filter((x) => x !== c).join(' '); return want; } }; }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new Txt(n) : n); }
  insertBefore(n, ref) { if (!ref) return this.appendChild(n); if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, n); return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceWith(n) { const p = this.parentNode; if (!p) return; p.insertBefore(n, this); p.removeChild(this); }
  after(n) { const p = this.parentNode; const i = p.childNodes.indexOf(this); p.insertBefore(n, p.childNodes[i + 1] || null); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, ev = {}) { const e = { type, target: this, preventDefault() {}, stopPropagation() {}, ...ev }; for (const fn of this.listeners[type] || []) fn(e); }
  click() { this.dispatch('click'); }
  focus() { globalThis.__focused = this; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) { const c = sel.replace(/^:scope\s+/, '').replace(/^\./, ''); return all(this, (n) => n !== this && cls(n).includes(c)); }
}
globalThis.document = { createElement: (tag) => new El(tag), createTextNode: (s) => new Txt(s), getElementById: () => null };

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
  const btns = [d, s, u].flatMap((c) => c.querySelectorAll('mounts-btn'));
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

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(fail ? `FAILED: ${fail} of ${pass + fail}` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
