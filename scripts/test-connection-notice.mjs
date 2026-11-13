#!/usr/bin/env node
// test-connection-notice — lane connection-notice-once (the owner on a phone, 2026-11-06: «以后别拿这个刷屏了吧»: a chat's tail
// was nothing but alternating «已与服务器断开» / «已重新连接»). A connection state is ONE live notice, never a log line per event.
// PURE + a stub DOM: the tree's OWN `_stateHandler` (cut out of src/lib/chat-view.js) and its OWN `appendSystem` (out of
// chat-renderers.js) over a stub list, so the same legs judge any tree; the real page is test-connection-notice-chrome.
//   ① one row through 363 cycles — the re-attach still ran every time, the pager's numbers and the card count did not move
//   ② the reconnect patches the drop's row, in place   ③ it keeps its age   ④ a message starts a new stretch (drawn or only counted)
//   ⑤ a swept row comes back with its count   ⑥ the words never claim a reconnect that has not happened
//   ⑦ a trim leaves no row outside the cards   ⑧ no card to any reader: class, search; no toast road
//   ⑨ the reconnect road is untouched   ⑪ the words exist in zh + ja   ⑫ the Resume dialog prints words, not tags
//   ⑬ a cycle nobody could have noticed is not a notice (round 2): the page's lifecycle, the re-attach's answer, the retry window; a row's length is the outage it measured (round 3)
// ⑩ and ⑭ (law 5: a slow client is not a dead one; the keepalive and the heartbeat read one verdict over one mark) are the SLOW-LINK pick's,
// on top of this one: this pick is the page's half and reads no line of src/server/ws-heartbeat.js or src/ws-keepalive.js.
// RED: `REPO=<a git archive of the release (fd4acdc61, 2.369.397) + node_modules> node scripts/test-connection-notice.mjs` — ①–⑧, ⑫ and ⑬ red by name and by behaviour
// (726 rows for 363 cycles). The same on 8b3fdb6ab, where the lane began. CONTROL for ⑬: `REPO=<a git archive of round 1, 08aebf78e>` — every cycle counted, ⑬ alone red.
// RED for round 3's two durations: `REPO=<round 2, cde2d80b8>` — «down 5 h», «down 2 h».
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const REPO = path.resolve(process.env.REPO || new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(REPO, 'package.json'));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// ── a stub DOM: what the handler, appendSystem and the notice touch ──
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.parentNode = null; this.dataset = {}; this.className = ''; this.title = ''; this._text = ''; }
  get classList() { const c = () => this.className.split(/\s+/).filter(Boolean); return { contains: (x) => c().includes(x) }; }
  appendChild(x) { x.remove?.(); x.parentNode = this; this.children.push(x); return x; } // as the DOM does: an element has one place
  remove() { const p = this.parentNode; if (p) { p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; } }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return !!n.isRoot; }
  get nextElementSibling() { const s = this.parentNode?.children; return s ? s[s.indexOf(this) + 1] || null : null; }
  get previousElementSibling() { const s = this.parentNode?.children; return s ? s[s.indexOf(this) - 1] || null : null; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((x) => x.textContent).join(''); }
  set innerHTML(v) { this._text = String(v).replace(/<[^>]*>/g, ''); }
  querySelectorAll(sel) { const m = /^:scope > \.([\w-]+)$/.exec(sel); if (!m) throw new Error('stub: ' + sel); return this.children.filter((x) => x.classList.contains(m[1])); }
}
globalThis.document = { createElement: (t) => new El(t) };
const t = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => v[k]) : s);
const CN = fs.existsSync(path.join(REPO, 'src/lib/connection-notice.js')) ? require(path.join(REPO, 'src/lib/connection-notice.js')) : null;

// the tree's own handler + its own appendSystem over a view of stubs
const cvSrc = read('src/lib/chat-view.js'), crSrc = read('src/lib/chat-renderers.js');
const handlerSrc = /this\._stateHandler = \(connected\) => \{[\s\S]*?\n    \};/.exec(cvSrc)?.[0];
const appendSrc = /\n  appendSystem\(text\) \{([\s\S]*?)\n  \}\n/.exec(crSrc)?.[1];
function makeView({ clock } = {}) {
  const list = new El('div'); list.isRoot = true;
  const v = { _messageList: list, _total: 726, _windowStart: 676, _windowEnd: 726, attaches: 0, toasts: 0, _chatInput: null, _disconnected: false, _hasConnected: true,
    _hideTyping() {}, _reconnectAttach() { v.attaches++; } };
  const R = { _messageList: list, addWrapToggles() {}, addOpenInEditorBtn() {} };
  R.appendSystem = new Function('escHtml', 'document', `return function (text) {${appendSrc}\n}`)((s) => String(s), globalThis.document).bind(R);
  v._renderers = R;
  v.now = 1e12;
  if (CN) v._connNotice = CN.createConnectionNotice({ list: () => v._messageList, t, total: () => v._total, now: () => v.now, clock: clock || ((at) => 'T' + at), onPaint: () => { v.paints = (v.paints || 0) + 1; } });
  const container = { classList: { toggle() {} } };
  new Function('t', 'container', `return function () { ${handlerSrc}\n return this._stateHandler; }`)(t, container).call(v);
  v.down = (ms = 1000) => { v.now += ms; v._stateHandler(false); };
  v.up = (ms = 3000) => { v.now += ms; v._stateHandler(true); };
  v.addCard = () => { const c = new El('div'); c.className = 'chat-msg chat-msg-assistant'; list.appendChild(c); v._total++; v._windowEnd = v._total; return c; };
  return v;
}
// what the old row and the new one both read as: the system rows in the list, a row's own words
const rows = (v) => v._messageList.children.filter((x) => x.classList.contains('chat-msg-system'));
const cards = (v) => v._messageList.children.filter((x) => x.classList.contains('chat-msg') && !x.classList.contains('chat-gap-msg'));
const pager = (v) => `${v._windowStart + 1}–${v._windowEnd} / ${v._total}`;

console.log('① 363 socket cycles ⇒ ONE row');
{
  ok('the tree has the handler and appendSystem this suite drives', !!handlerSrc && !!appendSrc);
  const v = makeView(); const before = pager(v), cardsBefore = cards(v).length;
  for (let i = 0; i < 363; i++) { v.down(); v.up(); }
  ok('363 cycles ⇒ one row in the transcript', rows(v).length === 1, `${rows(v).length} rows`);
  ok('it counts them', /dropped 363 times/.test(rows(v)[0]?.textContent || ''), rows(v)[0]?.textContent);
  ok('the re-attach still ran on every reconnect (363)', v.attaches === 363, v.attaches);
  ok('the pager reads what it read', pager(v) === before, pager(v));
  ok('no reader of the window\'s cards sees a new card (.chat-msg, the trim\'s and the landings\' selector)', cards(v).length === cardsBefore, cards(v).length);
}

console.log('② the reconnect patches the drop\'s row');
{
  const v = makeView();
  v.down(); const el = rows(v)[0];
  ok('a drop shows one row in the words it always had', rows(v).length === 1 && el.textContent === 'Disconnected from server', el?.textContent);
  v.up(12000);
  ok('the reconnect is that same row, with how long it was out', rows(v).length === 1 && rows(v)[0] === el && el.textContent === 'Reconnected · down 12s', rows(v).map((x) => x.textContent));
  v.down(); v.up();
  ok('the second cycle patches it again and counts', rows(v).length === 1 && rows(v)[0] === el && /^Connection unstable: dropped 2 times, last reconnected T\d+$/.test(el.textContent), el.textContent);
  ok('…naming the LAST reconnect\'s time', el.textContent.endsWith('T' + v.now), el.textContent);
  const v2 = makeView();
  for (const [ms, words] of [[59000, '59s'], [120000, '2 min'], [7200000, '2 h']]) { const x = makeView(); x.down(); x.up(ms); ok(`out for ${ms} ms reads «${words}»`, x._messageList.children[0]?.textContent === `Reconnected · down ${words}`, x._messageList.children[0]?.textContent); }
  v2.down(); v2.up(0);
  ok('a zero-length outage still reads a whole second, never «0s»', rows(v2)[0]?.textContent === 'Reconnected · down 1s', rows(v2)[0]?.textContent);
}

console.log('③ it keeps its age');
{
  const v = makeView();
  v.addCard(); v.down(); const el = rows(v)[0], at = el?.dataset.firstAt, title = el?.title;
  for (let i = 0; i < 5; i++) { v.up(); v.down(); }
  v.up();
  ok('the row stays where it was born (no move, no re-append)', rows(v)[0] === el && v._messageList.children.at(-1) === el && v._messageList.children.indexOf(el) === 1, v._messageList.children.indexOf(el));
  ok('its first-drop stamp is the first drop\'s, through every patch', at === String(1e12 + 1000) && el.dataset.firstAt === at, el?.dataset);
  ok('…and so is its tooltip', !!title && el.title === title, title);
}

console.log('④ a real message starts a new stretch');
{
  const v = makeView();
  v.down(); v.up(); const first = rows(v)[0], firstWords = first.textContent;
  v.addCard();
  v.down();
  ok('a message between two cycles ⇒ a second row', rows(v).length === 2 && rows(v)[1] !== first, rows(v).length);
  ok('…which starts over at its first words', rows(v)[1]?.textContent === 'Disconnected from server', rows(v)[1]?.textContent);
  ok('…and the first row keeps its last words', first.textContent === firstWords, first.textContent);
  v.up(); v.down(); v.up();
  ok('the next cycles patch the NEW row', rows(v).length === 2 && /dropped 2 times/.test(rows(v)[1].textContent) && first.textContent === firstWords, rows(v).map((x) => x.textContent));
  const u = makeView();
  u.down(); u.up(); u._total++; // a live message the reader has not scrolled to: `_onCreateMessage` counts it and draws nothing
  u.down();
  ok('a message only counted (reader scrolled back) starts a new stretch too', rows(u).length === 2, rows(u).length);
  const w = makeView();
  w.down(); w._total++; w.up(); w.down();
  ok('what arrived DURING the outage belongs to it — the mark moves at the reconnect', rows(w).length === 1, rows(w).length);
}

console.log('④ the row is seen');
{
  const v = makeView();
  v.down(); v.up(); v.down(); v.up();
  ok('every write to the row tells the view (born, patched, patched again…), so a pinned view follows it', v.paints === 4, v.paints);
  ok('the view follows only when pinned', /onPaint: \(\) => \{ if \(this\._pinned\) this\._scrollToBottom\(\); \}/.test(cvSrc));
}

console.log('⑤ a rebuild\'s sweep');
{
  const v = makeView();
  v.down(); v.up(); v.down(); v.up();
  rows(v)[0].remove(); // `_fullViewReset` / a jump: querySelectorAll('.chat-msg, .chat-msg-system').forEach(remove)
  ok('the sweep takes it (a page reload never shows it again either: it is in no store)', rows(v).length === 0);
  v.down();
  ok('the same stretch comes back as one row, with its count', rows(v).length === 1 && /dropped 3 times/.test(rows(v)[0].textContent), rows(v).map((x) => x.textContent));
}

console.log('⑤ a row paged over');
{
  const v = makeView();
  v.down(); v.up(); const el = rows(v)[0];
  const paged = new El('div'); paged.className = 'chat-msg chat-msg-assistant'; v._messageList.appendChild(paged); // _extendBottom: a page of history, the count unmoved
  v.down();
  ok('the same stretch goes back to the tail, still one row', rows(v).length === 1 && rows(v)[0] === el && v._messageList.children.at(-1) === el, v._messageList.children.indexOf(el));
  ok('…and keeps counting', /dropped 2 times/.test(el.textContent), el.textContent);
}

console.log('⑥ the words say what is true NOW');
{
  const v = makeView();
  v.down(); v.up(); v.down();
  const w = rows(v)[0].textContent;
  ok('a second drop not yet back never reads as reconnected', /dropped 2 times, disconnected since T/.test(w) && !/reconnected/i.test(w), w);
  const e = makeView();
  e.up();
  ok('an up that answers no drop says nothing', rows(e).length === 0, rows(e).length);
  const d = makeView();
  d.down(); const n = d._connNotice?.state?.n; d._stateHandler(false);
  ok('a repeated down is no second drop (ws.js tells one transition; the belt)', d._connNotice?.state?.n === n && n === 1, d._connNotice?.state);
}

console.log('⑦ a trim leaves no row outside the cards');
{
  const build = () => { const v = makeView(); v.addCard(); v.down(); v.up(); v.addCard(); v.down(); v.up(); v.addCard(); return v; }; // card notice card notice card
  const top = build(); cards(top)[0].remove();
  CN?.dropStrandedNotices(top._messageList, 'top');
  ok('after a top trim the row above the first card is gone, the one between cards stays', rows(top).length === 1 && top._messageList.children.indexOf(rows(top)[0]) === 1, rows(top).length);
  const bot = build(); cards(bot).at(-1).remove();
  CN?.dropStrandedNotices(bot._messageList, 'bottom');
  ok('after a bottom trim the row below the last card is gone, the one between cards stays', rows(bot).length === 1 && bot._messageList.children.indexOf(rows(bot)[0]) === 1, rows(bot).length);
  ok('_trimEdge does it, for both sides', /this\._connNotice\?\.dropStranded\(side\);/.test(cvSrc));
}

console.log('⑧ a status row is not a message');
{
  const v = makeView(); v.down(); const el = rows(v)[0];
  ok('no .chat-msg on it (the trim\'s count and bounds, search and jumpToIndex\'s index landings, the timestamp walks all select on it)', !el.classList.contains('chat-msg'), el.className);
  ok('.chat-msg-system on it (every rebuild\'s sweep takes it)', el.classList.contains('chat-msg-system'), el.className);
  ok('the search highlight walks past it', /closest\('\.chat-conn-notice'\)\) continue;/.test(read('src/lib/chat-search.js')));
  ok('nothing stores or sends it: the module speaks to one DOM list only', !!CN && !/\b(fetch|WebSocket|localStorage|sessionStorage|\.send\(|showToast)\b/.test(read('src/lib/connection-notice.js')));
  ok('the state handler announces through the notice alone — no toast, no appendSystem', !/showToast|appendSystem/.test(handlerSrc || ''), handlerSrc?.slice(0, 200));
  ok('the row has its own box: never shrunk in the flex column', /\.chat-conn-notice \{[^}]*flex-shrink: 0/.test(read('public/chat.css')));
}

console.log('⑨ the reconnect road is untouched');
{
  const ws = read('src/lib/ws.js');
  ok('2 s + jitter retry', /setTimeout\(\(\) => this\.connect\(\), 2000 \+ Math\.floor\(Math\.random\(\) \* 1000\)\);/.test(ws));
  ok('the 401 bounce', /fetch\('\/api\/home'\)\.then\(r => \{ if \(r\.status === 401\) location\.href = '\/login'; \}\)/.test(ws));
  ok('one state call per real transition', /if \(wasConnected\) \{ this\._outageStart = Date\.now\(\); this\._notifyState\(false\); \}/.test(ws));
  ok('_reconnectAttach on every reconnect, the queue for a suspended view', /this\._connNotice\.up\(\);\s*\n\s*this\._reconnectAttach\(\);/.test(cvSrc) && /if \(q && this\._suspended && !this\._readOnly && !this\._disposed\) \{/.test(cvSrc));
  ok('the lagged re-attach by seq', /if \(this\._readOnly \|\| this\._disconnected \|\| this\._disposed\) return;\s*\n\s*this\._reattach\(false\);/.test(cvSrc) && /attachFrame\.sinceSeq = this\._lastSeq;/.test(cvSrc));
}

console.log('⑪ the words exist in zh + ja');
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  for (const k of ['Disconnected from server', 'Reconnected · down {duration}', 'Connection unstable: dropped {n} times, last reconnected {time}', 'Connection unstable: dropped {n} times, disconnected since {time}', 'First dropped at {time}']) {
    ok(`«${k}»`, zh.includes(`"${k}":`) && ja.includes(`"${k}":`));
  }
  ok('the retired row word left both dictionaries', !zh.includes('"Reconnected":') && !ja.includes('"Reconnected":'));
}

console.log('⑫ the Resume dialog prints words, not tags (addendum 1)');
{
  const lay = read('src/lib/layout.js'), utils = read('src/lib/utils.js');
  ok('showConfirmDialog prints its message as text — so a tag in it shows, literally', /p\.textContent = message;/.test(utils));
  const expr = /async _offerResumeAll\(stopped\) \{[\s\S]*?message: ([\s\S]*?),\n\s*confirmText:/.exec(lay)?.[1];
  ok('the tree has the offer this leg renders', !!expr);
  const shown = (ended) => { const p = new El('p'); p.textContent = new Function('t', 'stopped', 'ended', `return ${expr}`)(t, [1, 2, 3], ended); return p.textContent; };
  for (const ended of [0, 2]) ok(`no literal tag in what the person reads (${ended} ended)`, !/<\/?\w/.test(shown(ended)), shown(ended));
  ok('…and it still says how many', /^3 sessions were interrupted/.test(shown(0)), shown(0));
  ok('…and the second sentence is its own', /Resume all of them now\? 2 of them stopped/.test(shown(2)), shown(2));
  const entry = (d) => new RegExp('"\\{n\\} sessions were interrupted[^"]*": "([^"]*)"').exec(d)?.[1] || '';
  for (const [name, d] of [['zh', read('src/lib/i18n-zh.js')], ['ja', read('src/lib/i18n-ja.js')]]) ok(`${name}: the sentence exists, tag-free`, !!entry(d) && !/</.test(entry(d)), entry(d));
}

console.log('⑬ a cycle nobody could have noticed is not a notice');
{
  const GRACE = CN?.WAKE_GRACE_MS ?? 5000, WINDOW = CN?.WAKE_RETRY_WINDOW_MS ?? 10000;
  // the same view as above with a page under it: visibility + the two lifecycle events, and a clock its timers obey
  const makePage = () => {
    const lis = {}, doc = { visibilityState: 'visible', createElement: (x) => new El(x), addEventListener: (k, f) => { (lis[k] ||= []).push(f); } };
    const fire = (k) => { for (const f of lis[k] || []) f(); };
    let at = 1e12, timers = [], seq = 0;
    const now = () => at;
    const life = CN?.createPageLife?.({ doc, now });
    const v = makeView();
    const list = v._messageList;
    v._connNotice = CN?.createConnectionNotice({ list: () => list, t, total: () => v._total, now, clock: (x) => 'T' + x, doc, life,
      setTimer: (f, ms) => { const id = ++seq; timers.push({ id, f, due: at + ms }); return id; }, clearTimer: (id) => { timers = timers.filter((x) => x.id !== id); }, onPaint() {} });
    const pass = (ms) => { const end = at + ms; for (;;) { const due = timers.filter((x) => x.due <= end).sort((a, b) => a.due - b.due)[0]; if (!due) break; at = due.due; timers = timers.filter((x) => x !== due); due.f(); } at = end; };
    return { v, doc, fire, pass, now, drop() { v._stateHandler(false); }, back() { v._stateHandler(true); },
      answer(missed) { v._connNotice?.answered?.(missed); }, n: () => v._connNotice?.state?.n ?? 0,
      freeze() { fire('freeze'); }, resume() { fire('resume'); }, hide() { doc.visibilityState = 'hidden'; fire('visibilitychange'); }, show() { doc.visibilityState = 'visible'; fire('visibilitychange'); } };
  };
  const words = (p) => rows(p.v).map((x) => x.textContent);

  { const p = makePage();
    p.freeze(); p.pass(40000); p.resume(); p.drop(); p.pass(2500); p.back(); p.answer(false);
    ok('a frozen page: the close heard just after the resume, back in 2.5 s, resumed by seq ⇒ no row', rows(p.v).length === 0, words(p));
    ok('…and it counts nothing', p.n() === 0, p.n());
    ok('…and the re-attach still ran', p.v.attaches === 1, p.v.attaches);
    p.pass(WINDOW * 3);
    ok('…and the retry window, answered in time, never says it later', rows(p.v).length === 0, words(p)); }
  { const p = makePage();
    p.freeze(); p.pass(70000); p.drop(); p.resume(); p.pass(2500); p.back(); p.answer(false);
    ok('the same with the close delivered BEFORE the resume event ⇒ no row', rows(p.v).length === 0 && p.n() === 0, words(p)); }
  { const p = makePage();
    p.hide(); p.pass(5000); p.drop(); p.pass(3000); p.back(); p.answer(false); p.pass(60000); p.show();
    ok('a hidden page: down and back while hidden ⇒ no row, no count', rows(p.v).length === 0 && p.n() === 0, words(p)); }
  { const p = makePage();
    p.hide(); p.pass(5000); p.drop(); p.pass(1000); p.show(); p.pass(2000); p.back(); p.answer(false);
    ok('…back only after the person returned, within the window ⇒ no row', rows(p.v).length === 0 && p.n() === 0, words(p)); }
  { const p = makePage();
    p.drop();
    ok('an awake page: a drop is the notice at once', words(p).length === 1 && words(p)[0] === 'Disconnected from server', words(p));
    p.pass(4000); p.back(); p.answer(false);
    ok('…counted, whatever the re-attach answers', p.n() === 1 && /^Reconnected · down 4s$/.test(words(p)[0]), words(p)); }
  { const p = makePage();
    p.freeze(); p.pass(1000); p.resume(); p.pass(GRACE + 1); p.drop();
    ok('a drop past the grace after a wake is an awake drop', rows(p.v).length === 1 && p.n() === 1, words(p)); }
  { const p = makePage();
    p.freeze(); p.pass(1000); p.resume(); p.pass(GRACE - 1); p.drop(); p.pass(3000); p.back(); p.answer(false);
    ok('a drop inside the grace still began asleep', rows(p.v).length === 0 && p.n() === 0, words(p)); }
  { const p = makePage();
    p.drop(); p.pass(1000); p.hide(); p.pass(1000); p.back(); p.answer(false); p.show();
    ok('a cycle that began awake stays told when the page then sleeps', rows(p.v).length === 1 && p.n() === 1 && /^Reconnected/.test(words(p)[0]), words(p)); }

  { const p = makePage();
    p.freeze(); p.pass(600000); p.resume(); p.drop(); p.pass(3000); p.back();
    ok('a frozen cycle waiting on its answer has said nothing yet', rows(p.v).length === 0, words(p));
    p.answer(true);
    ok('a frozen cycle that missed frames ⇒ one row, at the answer', rows(p.v).length === 1 && p.n() === 1, words(p));
    ok('…its length is the sleep, not the socket\'s 3 s', words(p)[0] === 'Reconnected · down 10 min', words(p));
    p.answer(true);
    ok('…told once', p.n() === 1, p.n());
    p.pass(GRACE + 1); p.drop(); p.pass(1000); p.back();
    ok('…awake-class: the next awake drop counts on from it', rows(p.v).length === 1 && /dropped 2 times/.test(words(p)[0]), words(p)); }

  { const p = makePage();
    p.drop(); p.pass(1000); p.back();
    for (let i = 0; i < 5; i++) { p.pass(60000); p.freeze(); p.pass(60000); p.resume(); p.drop(); p.pass(3000); p.back(); p.answer(false); }
    p.pass(GRACE + 1); p.drop(); p.pass(1000); p.back();
    ok('«断开 N 次» counts awake outages only: 2 awake + 5 unlocks reads 2', rows(p.v).length === 1 && /dropped 2 times/.test(words(p)[0]), words(p)); }

  { const p = makePage();
    p.freeze(); p.pass(5000); p.resume(); p.drop(); p.pass(WINDOW - 1);
    ok('still down inside the retry window after a wake ⇒ still no row', rows(p.v).length === 0, words(p));
    p.pass(1);
    ok('still down when it ends ⇒ the notice: the person is looking at a chat with no server', words(p)[0] === 'Disconnected from server' && p.n() === 1, words(p));
    p.pass(10000); p.back(); p.answer(false);
    ok('…the reconnect patches it, from when the page slept', rows(p.v).length === 1 && p.n() === 1 && words(p)[0] === 'Reconnected · down 25s', words(p)); }
  { const p = makePage();
    p.hide(); p.drop(); p.pass(WINDOW * 30);
    ok('no retry window runs while hidden: nobody is looking', rows(p.v).length === 0, words(p));
    p.show(); p.pass(WINDOW - 1);
    ok('…it starts at the wake', rows(p.v).length === 0, words(p));
    p.pass(1);
    ok('…and ends there', rows(p.v).length === 1 && p.n() === 1, words(p)); }
  { const p = makePage();
    p.freeze(); p.pass(1000); p.resume(); p.drop(); p.pass(1000); p.back();
    p.freeze(); p.pass(1000); p.resume(); p.drop(); p.pass(1000); p.back(); p.answer(true);
    ok('two quiet cycles, one answer: one row, one count', rows(p.v).length === 1 && p.n() === 1, words(p)); }
  { const p = makePage();
    p.freeze(); p.pass(1000); p.resume(); p.drop(); p.pass(1000); p.back(); p.pass(GRACE + 1); p.drop(); p.pass(1000); p.back(); p.answer(false);
    ok('an awake drop over an unanswered quiet cycle counts itself alone', rows(p.v).length === 1 && p.n() === 1, words(p)); }
  { const p = makePage();
    p.v._total = 726; p.drop(); p.pass(1000); p.back();
    p.pass(60000); p.freeze(); p.pass(5000); p.resume(); p.drop(); p.pass(3000); p.v._total = 731; p.back(); p.answer(false);
    p.pass(GRACE + 1); p.drop();
    ok('frames a silent cycle replayed are real messages: the next awake drop starts a new row', rows(p.v).length === 2, words(p)); }
  { const p = makePage();
    p.hide(); p.drop(); p.show(); p.v._connNotice?.dispose?.(); p.pass(WINDOW * 2);
    ok('a disposed view\'s window says nothing', rows(p.v).length === 0, words(p)); }

  console.log('⑬ a row\'s length is the outage it measured');
  { const p = makePage();
    p.freeze(); p.pass(60000); p.resume(); p.drop(); p.pass(2500); p.back(); // no answer, ever: `_reattach` returns at once on a read-only view (every «Session ended.» window)
    p.pass(5 * 3600000);
    p.freeze(); p.pass(60000); p.resume(); p.drop(); p.pass(WINDOW); p.pass(5000); p.back();
    ok('a start nobody answered does not outlive its cycle: 75 s reads as 75 s, not «5 h»', words(p)[0] === 'Reconnected · down 1 min' && p.v._connNotice?.state?.outMs === 75000, { words: words(p), outMs: p.v._connNotice?.state?.outMs }); }
  { const p = makePage();
    p.drop(); p.pass(1000); p.back(); p.pass(GRACE + 1);
    p.freeze(); p.pass(1000); p.resume(); p.drop(); p.pass(1000); p.back(); // unanswered
    p.pass(5 * 3600000);
    const slept = p.now();
    p.freeze(); p.pass(60000); p.resume(); p.drop(); p.pass(WINDOW);
    ok('…and with a count: «disconnected since» names THIS sleep, not the unanswered one', words(p)[0] === `Connection unstable: dropped 2 times, disconnected since T${slept}`, words(p)); }
  { const p = makePage();
    p.hide(); p.pass(2 * 3600000); p.show(); p.pass(3000); p.drop(); p.pass(WINDOW); p.pass(2000); p.back();
    ok('a hidden tab whose code ran, shown, drops 3 s later for 12 s: «down 12s», not «2 h»', words(p)[0] === 'Reconnected · down 12s' && p.v._connNotice?.state?.outMs === 12000, { words: words(p), outMs: p.v._connNotice?.state?.outMs }); }
  { const p = makePage();
    p.hide(); p.pass(2 * 3600000); p.show(); p.pass(3000); p.drop(); p.pass(4000); p.back(); p.answer(true);
    ok('…the same through a missed answer (a rebuild after a hub restart): the socket\'s own clock', words(p)[0] === 'Reconnected · down 4s', words(p)); }
  { const p = makePage();
    p.hide(); p.pass(1000); p.freeze(); p.pass(600000); p.resume(); p.show(); p.drop(); p.pass(3000); p.back(); p.answer(true);
    ok('a sleep that froze still dates its row: no code ran', /^Reconnected · down 10 min$/.test(words(p)[0] || ''), words(p)); }
  { const p = makePage();
    p.freeze(); p.pass(600000); p.resume(); p.pass(60000);
    p.hide(); p.pass(2 * 3600000); p.show(); p.pass(3000); p.drop(); p.pass(4000); p.back(); p.answer(true);
    ok('a freeze in an EARLIER sleep says nothing about this one', words(p)[0] === 'Reconnected · down 4s', words(p)); }

  { const p = makePage();
    p.hide(); p.pass(1000); p.freeze(); p.pass(5 * 3600000); p.resume(); p.drop(); p.show(); p.pass(2500); p.back(); p.answer(false);
    p.pass(1500); p.drop(); p.pass(WINDOW); p.pass(5000); p.back();
    ok('a freeze dates only the first close: a NEW drop right after a reconnect that succeeded reads 15 s, not «5 h»', words(p)[0] === 'Reconnected · down 15s' && p.v._connNotice?.state?.outMs === 15000, { words: words(p), outMs: p.v._connNotice?.state?.outMs }); }
  { const p = makePage();
    p.hide(); p.pass(1000); p.freeze(); p.pass(60000); p.resume(); p.drop(); p.pass(2500); p.back(); p.answer(false); // resumed still hidden, the CDP `active` shape; a held cycle
    p.pass(2 * 3600000); p.show(); p.pass(2000); p.drop(); p.pass(WINDOW); p.pass(2000); p.back();
    ok('…or later in the same sleep: 2 h hidden and running after it, «down 12s», not «2 h»', words(p)[0] === 'Reconnected · down 12s' && p.v._connNotice?.state?.outMs === 12000, { words: words(p), outMs: p.v._connNotice?.state?.outMs }); }
  { const p = makePage();
    p.hide(); p.pass(1000); p.freeze(); p.pass(60000); p.resume(); // no close at all this time: the socket lived through it
    p.pass(2 * 3600000); p.show(); p.pass(2000); p.drop(); p.pass(WINDOW); p.pass(2000); p.back();
    ok('…a close heard long after the resume is no close of the freeze', words(p)[0] === 'Reconnected · down 12s', words(p)); }
  { const p = makePage();
    p.freeze(); p.pass(600000); p.resume(); p.drop(); p.pass(2000); p.back(); p.answer(true);
    ok('the first close at a freeze\'s end still dates its row from the sleep', words(p)[0] === 'Reconnected · down 10 min', words(p)); }
  { const p = makePage();
    p.hide(); p.pass(1000); p.freeze(); p.pass(60000); p.resume(); p.drop(); p.pass(2500); p.back(); p.answer(false); // resumed still hidden; reconnected, held
    p.pass(3600000); p.freeze(); p.pass(600000); p.resume(); p.drop(); p.pass(2000); p.back(); p.answer(true); // an hour hidden and RUNNING, then a second freeze
    ok('a second freeze dates its row from ITS OWN start: 10 min, not «1 h» from the first hide', words(p)[0] === 'Reconnected · down 10 min' && p.v._connNotice?.state?.outMs === 602000, { words: words(p), outMs: p.v._connNotice?.state?.outMs }); }
  { const p = makePage();
    p.hide(); p.pass(3600000); p.freeze(); p.pass(600000); p.resume(); p.drop(); p.pass(2000); p.back(); p.answer(true);
    ok('…and a first one too: an hour hidden and running, then frozen 10 min, reads 10 min', words(p)[0] === 'Reconnected · down 10 min' && p.v._connNotice?.state?.outMs === 602000, { words: words(p), outMs: p.v._connNotice?.state?.outMs }); }
  { const lis = {}, doc = { visibilityState: 'visible', createElement: (x) => new El(x), addEventListener: (k, f) => { (lis[k] ||= []).push(f); } }, fire = (k) => { for (const f of lis[k] || []) f(); };
    let at = 1e12; const life = CN?.createPageLife?.({ doc, now: () => at });
    const two = [0, 1].map(() => { const list = new El('div'); list.isRoot = true; return { list, n: CN?.createConnectionNotice({ list: () => list, t, total: () => 0, now: () => at, clock: (x) => 'T' + x, doc, life, onPaint() {} }) }; });
    fire('freeze'); at += 600000; fire('resume');
    for (const v of two) v.n?.down(); at += 2000; for (const v of two) v.n?.up(); for (const v of two) v.n?.answered?.(true);
    ok('every view on the page dates the same close from the sleep: one view\'s reconnect spends it for the NEXT drop, not for its neighbours', two.every((v) => v.list.children[0]?.textContent === 'Reconnected · down 10 min'), two.map((v) => v.list.children[0]?.textContent)); }

  console.log('⑬ the page\'s own lifecycle');
  { const lis = {}, doc = { visibilityState: 'visible', addEventListener: (k, f) => { (lis[k] ||= []).push(f); } }, fire = (k) => { for (const f of lis[k] || []) f(); };
    let at = 1000, woke = 0; const L = CN?.createPageLife?.({ doc, now: () => at });
    L?.onWake(() => { woke++; });
    ok('awake at the start', L?.asleep?.() === false);
    doc.visibilityState = 'hidden'; fire('visibilitychange'); at += 1000; fire('freeze'); at += 1000; fire('resume');
    ok('frozen then resumed but still hidden: still asleep, no wake', L?.asleep?.() === true && woke === 0, woke);
    at += 1000; doc.visibilityState = 'visible'; fire('visibilitychange');
    ok('visible: the one wake', L?.asleep?.() === false && woke === 1, woke);
    ok('an outage heard after it dates from the freeze\'s own start (hidden and running before it)', L?.outageFrom?.() === 2000, L?.outageFrom?.());
    doc.visibilityState = 'hidden'; fire('visibilitychange'); at += 7000;
    ok('a hidden page\'s code runs: its close is on time', L?.outageFrom?.() === at, L?.outageFrom?.());
    fire('freeze'); const frozeAt = at; at += 5000;
    ok('a frozen page\'s is not: from the freeze', L?.outageFrom?.() === frozeAt, L?.outageFrom?.());
    at += 1000; fire('resume');
    ok('…nor a resumed one still hidden: the close it hears now is as late', L?.outageFrom?.() === frozeAt, L?.outageFrom?.()); }

  console.log('⑬ the re-attach\'s answer (the tree\'s own lines)');
  const answerSrc = /const missedFrames = [^\n]*\n\s*if \(missedFrames[^\n]*\n\s*else this\._connNotice\?\.answered\(missedFrames\);/.exec(cvSrc)?.[0];
  const owedSrc = /if \(this\._connNoticeOwed\) \{[^\n]*\}/.exec(cvSrc)?.[0];
  ok('the tree has the lines this leg drives', !!answerSrc && !!owedSrc);
  const answerOf = (attachFrame, msg, epochChanged, pending) => {
    const p = makePage(); p.freeze(); p.pass(5000); p.resume(); p.drop(); p.pass(2000); p.back();
    p.v._resetPending = pending ? {} : null;
    if (answerSrc) new Function('attachFrame', 'msg', 'epochChanged', answerSrc).call(p.v, attachFrame, msg, epochChanged);
    return p;
  };
  const asked = { sinceSeq: 40, sinceEpoch: 'e' }, notAsked = {};
  ok('asked by seq, the ring held every frame ⇒ silence', rows(answerOf(asked, { slab: 'held', replay: [] }, false).v).length === 0);
  ok('…with frames to replay ⇒ silence: nothing was missed, they arrive', rows(answerOf(asked, { slab: 'held', replay: [{}] }, false).v).length === 0);
  ok('asked by seq, the ring could not (a slab came back) ⇒ one row', rows(answerOf(asked, { messages: [] }, false).v).length === 1);
  ok('asked nothing (born by create, or poisoned: no position to have fallen behind) ⇒ silence', rows(answerOf(notAsked, { messages: [] }, false).v).length === 0);
  { const p = answerOf(asked, { messages: [] }, true);
    ok('a miss on the rebuild road waits for the rebuild: its sweep would take the row', rows(p.v).length === 0 && p.v._connNoticeOwed === true, p.v._connNoticeOwed);
    if (owedSrc) new Function(owedSrc).call(p.v);
    ok('…and the rebuild pays it, once', rows(p.v).length === 1 && p.v._connNoticeOwed === false && p.n() === 1, p.n()); }
  ok('the rebuild pays AFTER its slab and drain', /this\._drainResetQueue\(held, msg\);\s*\n\s*if \(this\._connNoticeOwed\)/.test(cvSrc));
  ok('the view stands its window down when it dies', /this\._disposed = true;\s*\n\s*this\._connNotice\?\.dispose\(\);/.test(cvSrc));
  ok('the notice reads no socket: the re-attach road tells it, the road itself sends the same frame', !!CN && !/\.send\(|sinceSeq/.test(read('src/lib/connection-notice.js'))); // !!CN: an older tree has no such file, and a RED run reads to its last row
}

console.log(fail ? `\nFAILED: ${fail} failed, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
