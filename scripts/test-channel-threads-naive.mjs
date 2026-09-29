#!/usr/bin/env node
// THE NAIVE-USER PASS OF LANE CHANNEL-THREADS (fast; 2026-09-28). A fresh-eyes user walked the threads / reactions /
// reply-placement work in a real browser (zh first, then en and ja; 1280 px and a 360 px phone) against a throwaway
// server on the FAKE adapters + a stub agent running the shipped `vibespace-channels`, and reported what a person
// would say. Each finding that could be proven is fixed and pinned HERE, one section per finding, each with a
// patched-copy control (scripts/mutant-copy.mjs, scratch only) that turns its rows RED:
//   ① "Lark / 飞书 is disabled" in English on a zh page: the thread pane (and the window's Refresh) on a DISABLED
//      account drew the engine's raw sentence — `routeErrorText` had no words for the code `disabled`. The REAL engine
//      answers `disabled` for the thread walk and the refresh; the words are the device's, in both dictionaries.
//   ② the pane's per-reply ↩ ("reply to this message in the thread") on a thread that cannot be answered: it was drawn
//      (always visible on a touch device) and did NOTHING when pressed — the foot was the read-only line. The REAL
//      pane over a small fake DOM: no-offer ⇒ the pane wears `chanthread-noreply` (CSS: the ↩ is not displayed) and a
//      press changes nothing; offered ⇒ the ↩ shows and a press targets that reply in the composer.
//   ③ WHO REACTED, in names only: the chip's title read "👌 u-me, Ada, Brook and 7 more" — the account OWNER's own id,
//      and the id of every reactor the conversation has no name for ("u-cass"; on Lark an `ou_…`); the long press
//      listed them as "unknown". The fold marks the owner's entry `self`, whoList counts a nameless reactor in "and N
//      more" and never shows an id, the client says "You". The REAL engine over the fake (its listed reactions + the
//      owner's own click), then the client's words; CONTROL the pre-fix whoList + whoText print the ids.
//   ④ A REACTION IS NOT A MESSAGE in what waits for the agent: the owner's 🎉 on the agent's sent reply became "1 notice
//      is waiting …: a channel message" above the composer, and the agent's next prompt appended "a channel message is
//      answered with vibespace-channels reply …" after "🎉 ×1 on your reply" — an invitation to answer an emoji. The
//      digest is its own kind (`channel-reaction`: "a reaction notice"), the reply hint rides only a channel MESSAGE.
//      The REAL engine files the digest (a sent in-thread reply of the fake, the owner's reaction), the real summary +
//      the real injection render it; CONTROLS the pre-fix kindOf and the pre-fix hint.
//   ⑤ THE REFUSAL SAYS HOW TO ASK: `reply --to <msg> --in-thread` on a Gmail-shaped channel answered "a reply in a thread
//      is not offered on this channel — offered here: chat, quote" — placement NAMES the agent cannot type (there is no
//      --quote flag; a quote is what --to alone gives there). The shipped CLI now adds the flags for what IS offered.
//      The shipped CLI against a stub answering the PURE verdict for the SHIPPED Gmail / Lark rows; CONTROL the CLI
//      copy without the hint.
//   ⑥ THE PANE'S COMPOSER LINE IS WHOLE: "このスレッド内に投稿されます · あなたとしてすぐに送信" was cut on a 360 px phone to
//      "…あなたとしてす…" (the "sent at once, as you" half gone — the main composer's nowrap + ellipsis rule). It wraps
//      in the pane. Here: the rule over the pane's REAL composer (the fake DOM of ②) — the layout itself is measured
//      in chrome (test-channel-threads-ui (h), ja + zh at 360 px, with the pre-fix rule injected as its control).
// Zero vendor calls (the fake adapters in-process); per-pid scratch dirs. Run: node scripts/test-channel-threads-naive.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const J = (x) => JSON.stringify(x);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
const dictOf = (f) => { const m = new Map(); for (const ln of read(f).split('\n')) { const x = /^  ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"): ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"),?$/.exec(ln); if (x) { try { m.set(new Function('return ' + x[1])(), new Function('return ' + x[2])()); } catch { } } } return m; };
const ZH = dictOf('src/lib/i18n-zh.js'), JA = dictOf('src/lib/i18n-ja.js');
const LATIN_ONLY = /^[\x00-\x7F’—…⋯]*$/;

const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const lark = require(path.join(REPO, 'src/channels/lark.js'));
const WORDS_PATH = path.join(REPO, 'src/lib/channel-words.js');
const Wd = await import(pathToFileURL(WORDS_PATH).href);

const ROOT = scratch('chanthr-naive');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
const engines = [];
/** The REAL engine over the three fake accounts (the rows the server seeds), `over` patching an account row. */
function fakeEngine(name, over = {}) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  const registry = CH.createChannelRegistry();
  for (const m of [fake.fakePoll, fake.fakePush, fake.fakeScan]) registry.register(m);
  const row = (id) => ({ id, kind: id, label: id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, reactionPolicy: 'propose', push: null, scan: null, ...(over[id] || {}) });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: fake.FAKE_KINDS.map(row) }));
  const eng = ENG.create({ dataDir: dir, env: {}, registry, broadcast: () => { }, log: quiet, serverSetting: () => undefined, liveSessions: () => [], now: () => Date.now() });
  engines.push(eng);
  return eng;
}
const M = mutantCopies('chanthr-naive', REPO);

// ═══ ① the `disabled` code in words ═══════════════════════════════════════════════════════════════
console.log('① a disabled account\'s refusal is worded in the device\'s language (never the engine\'s English)');
const DISABLED_KEY = 'This account is disabled — enable it in the account’s ⋯ menu to load or send here';
{
  // the browser's shape: a DISABLED Lark account whose topic room was ingested (the REAL Lark normalizer over an
  // invented `omt_` topic), the owner opening its thread — the walk is refused before any vendor call
  const dir = path.join(ROOT, 'disabled');
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  const NOW = Date.now(), MIN = 60e3;
  {
    const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
    const st = createChannelStore({ dir: path.join(dir, 'channels'), log: quiet });
    await st.adapters.update((ad) => { ad.adapters.push({ id: 'lark', kind: 'lark', label: 'Lark / 飞书', enabled: false, reactionPolicy: 'propose', auth: { tokenEnc: null, expiresAt: null, scopes: ['im:message'], user: null }, lastPass: null, consecutiveFailures: 0, push: null, scan: null }); });
    await st.index.update(() => { const en = st.index.entry('lark', 'oc_thr'); en.title = 'Topic room'; en.kind = 'group'; en.convCaps = { read: 'yes', sendAs: [], why: 'disabled', at: NOW }; en.lastAt = NOW; en.listedAt = NOW; });
    const item = (id, at, text, sender, extra = {}) => ({ message_id: id, msg_type: 'text', create_time: String(at), chat_id: 'oc_thr', sender: { id: sender, sender_type: 'user' }, body: { content: JSON.stringify({ text }) }, ...extra });
    const names = new Map([['ou_ada', 'Ada'], ['ou_brook', 'Brook']]);
    st.appendRecords('lark', 'oc_thr', [lark.toRecord('lark', 'oc_thr', item('om_t0', NOW - 30 * MIN, '周会改到几点？', 'ou_ada', { thread_id: 'omt_a' }), { names }), lark.toRecord('lark', 'oc_thr', item('om_t1', NOW - 25 * MIN, '三点吧', 'ou_brook', { root_id: 'om_t0', parent_id: 'om_t0', thread_id: 'omt_a' }), { names })]);
    st.index.flush && st.index.flush();
    st.close && st.close();
  }
  const registry = CH.createChannelRegistry();
  registry.register(lark);
  const eng = ENG.create({ dataDir: dir, env: {}, registry, broadcast: () => { }, log: quiet, serverSetting: () => undefined, liveSessions: () => [], now: () => Date.now() });
  engines.push(eng);
  const th = await eng.threadRefresh('lark', 'oc_thr', 'om_t0');
  const rf = await eng.refresh('lark', 'oc_thr');
  ok(th && th.code === 'disabled' && th.error === 'Lark / 飞书 is disabled' && rf && rf.code === 'disabled', 'setup: the REAL engine answers `disabled` — with its English sentence "Lark / 飞书 is disabled" for the agent\'s log — to the thread walk the pane asks on open AND to the window\'s Refresh', J({ th, rf }));
  const w1 = Wd.routeErrorText(th), w2 = Wd.routeErrorText(rf);
  ok(w1 === DISABLED_KEY && w2 === DISABLED_KEY && !w1.includes(th.error), `routeErrorText words the code — "${w1}" — never the raw "${th.error}"`, J({ w1, w2 }));
  ok(ZH.has(DISABLED_KEY) && JA.has(DISABLED_KEY) && !LATIN_ONLY.test(ZH.get(DISABLED_KEY)) && !LATIN_ONLY.test(JA.get(DISABLED_KEY)), `…in both dictionaries, translated: zh "${ZH.get(DISABLED_KEY)}" · ja "${JA.get(DISABLED_KEY)}"`);
  const paneSrc = read('src/lib/channel-thread-pane.js');
  ok(paneSrc.includes("const note = el('div', 'chanthread-note', routeErrorText(r));"), 'WIRING: the pane\'s walk draws its refusal through routeErrorText (the sentence the user saw)');
  // CONTROL: the words module as it was (no case for the code) hands the user the engine's English
  const src = fs.readFileSync(WORDS_PATH, 'utf-8');
  const line = "    case 'disabled': return t('This account is disabled — enable it in the account’s ⋯ menu to load or send here');\n";
  ok(src.includes(line), 'CONTROL setup: the case line is found verbatim');
  const C = await import(pathToFileURL(M.write(WORDS_PATH, src.replace(line, ''), 'no-disabled-case')).href);
  const c1 = C.routeErrorText(th);
  ok(/is disabled$/.test(c1) && c1 === th.error && LATIN_ONLY.test(c1.replace('飞书', '')), `CONTROL: the copy without the case answers the engine's raw sentence "${c1}" — the zh page showed exactly that`, c1);
}

// ═══ ② the ↩ where the thread cannot be answered ═══════════════════════════════════════════════════
console.log('② the pane draws no dead ↩ on a thread that cannot be answered');
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this._text = ''; this.className = ''; this.hidden = false; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; this.value = ''; this.scrollTop = 0; this.scrollHeight = 0; this.clientHeight = 0; this.clientWidth = 0; this.title = ''; this.type = ''; this.disabled = false; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  get isConnected() { return true; }
  append(...ns) { for (const n of ns) this.appendChild(n); }
  appendChild(n) { if (n.isFrag) { for (const c of [...n.children]) this.appendChild(c); return n; } if (n.parentNode) n.parentNode.children.splice(n.parentNode.children.indexOf(n), 1); n.parentNode = this; this.children.push(n); return n; }
  insertBefore(n, ref) { if (n.isFrag) { for (const c of [...n.children]) this.insertBefore(c, ref); return n; } if (n.parentNode) n.parentNode.children.splice(n.parentNode.children.indexOf(n), 1); n.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; }
  prepend(n) { this.insertBefore(n, this.children[0] || null); }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  set innerHTML(h) { this._html = h; this.children = []; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() { const p = this.parentNode; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
  addEventListener(t, fn) { (this.listeners[t] || (this.listeners[t] = [])).push(fn); }
  focus() { El.focused = this; }
  click() { if (this.onclick) this.onclick({ stopPropagation() { }, preventDefault() { } }); }
  closest() { return null; }
  get classList() { const self = this; const list = () => self.className.split(/\s+/).filter(Boolean); return { contains: (c) => list().includes(c), add: (c) => { if (!list().includes(c)) self.className = [...list(), c].join(' '); }, remove: (c) => { self.className = list().filter((x) => x !== c).join(' '); }, toggle: (c, on) => { const has = list().includes(c); const want = on === undefined ? !has : !!on; if (want && !has) self.className = [...list(), c].join(' '); if (!want && has) self.className = list().filter((x) => x !== c).join(' '); return want; } }; }
  _all() { return this.children.flatMap((c) => [c, ...c._all()]); }
  _is(sel) { if (sel.startsWith('.')) return this.classList.contains(sel.slice(1)); const a = /^\[data-([\w-]+)\]$/.exec(sel); if (a) return Object.keys(this.dataset).some((k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) === a[1]); return this.tagName === sel.toUpperCase(); }
  querySelectorAll(sel) { return this._all().filter((e) => e._is(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
const PANE_PATH = path.join(REPO, 'src/lib/channel-thread-pane.js');
const Pane = await import(pathToFileURL(PANE_PATH).href);   // BEFORE the fake document (utils.js wires page listeners only where one exists)
const realFetch = globalThis.fetch;
globalThis.document = { createElement: (t) => new El(t), createDocumentFragment: () => Object.assign(new El('#frag'), { isFrag: true }) };
const tick = () => new Promise((r) => setTimeout(r, 0));
const REC = (vendorId, text, extra = {}) => ({ vendorId, at: 1000 + vendorId.length, author: { id: 'u-' + vendorId, name: 'N' + vendorId }, text, ...extra });
globalThis.fetch = async () => ({ json: async () => ({ ok: true, records: [REC('m0', 'the root'), REC('m1', 'first reply', { replyTo: 'm0' }), REC('m2', 'second reply', { replyTo: 'm0' })], thread: { key: 'm0', root: 'm0', count: 2, separate: false, walked: true } }) });
/** The REAL pane with a conversation view whose thread-reply offer is `offered` (the window's getConv). */
async function paneWith(mod, offered, why = 'read-only-adapter') {
  const host = new El('div'); host.clientWidth = 1000;
  let conv = { offers: { threadReply: { offered, why: offered ? null : why } }, policy: { mode: 'direct' }, authority: 'send' };
  const p = mod.createThreadPane(host, { base: '/api/channels/a/c', renderRecord: (rec) => { const r = new El('div'); r.className = 'chanmsg'; r.dataset.vid = rec.vendorId; r.textContent = rec.text; return r; }, getConv: () => conv, observe: () => { } });
  p.open({ key: 'm0', root: 'm0', count: 2 });
  for (let i = 0; i < 20 && !p.el.querySelector('.chanthread-pick'); i++) await tick();
  await tick(); await tick();
  return { p, host, setOffered: (v) => { conv = { ...conv, offers: { threadReply: { offered: v, why: v ? null : why } } }; p.redrawFoot(); } };
}
/** What a person sees and gets: the ↩ is DISPLAYED (not under `.chanthread-noreply`, per the CSS rule) and a press
 *  targets the reply in the composer ("Replying to …"). */
const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf-8');
const hidesPick = CSS.includes('.chanthread-noreply .chanthread-pick { display: none; }');
const judge = (x) => {
  const picks = x.p.el.querySelectorAll('.chanthread-pick');
  const shown = picks.length > 0 && !(hidesPick && x.p.el.classList.contains('chanthread-noreply'));
  const foot = () => x.p.el.querySelector('.chanthread-foot');
  const before = foot().textContent;
  if (picks[1]) picks[1].click();
  const after = foot().textContent;
  return { picks: picks.length, shown, readOnly: !!foot().querySelector('.chanwin-readonly'), pressDid: before !== after, targeted: /Replying to/.test(after) };
}
{
  const ro = judge(await paneWith(Pane, false));
  ok(ro.picks === 2 && ro.readOnly, 'setup: the REAL pane over a fake DOM drew the thread (the root + two replies with a ↩ each) and the foot is the read-only line', J(ro));
  ok(hidesPick && !ro.shown && !ro.pressDid && !ro.targeted, 'a thread that cannot be answered shows NO ↩ (the pane wears `chanthread-noreply`; the CSS does not display it) and a press changes nothing', J(ro));
  const on = judge(await paneWith(Pane, true));
  ok(on.shown && on.pressDid && on.targeted && !on.readOnly, 'where the thread CAN be answered the ↩ shows and a press targets that reply ("Replying to …")', J(on));
  const x = await paneWith(Pane, true);
  x.setOffered(false);
  ok(x.p.el.classList.contains('chanthread-noreply') && judge(x).shown === false, 'the offer withdrawn while the pane is open (a broadcast redraws the foot) hides the ↩ with it', J(judge(x)));
  x.setOffered(true);
  ok(!x.p.el.classList.contains('chanthread-noreply'), '…and it comes back when the offer does');
  // CONTROL: the pane as it was (no class toggled) — the ↩ is displayed on the read-only thread and its press is a no-op
  const src = fs.readFileSync(PANE_PATH, 'utf-8');
  const toggle = "    pane.classList.toggle('chanthread-noreply', !(offer && offer.offered));\n";
  ok(src.includes(toggle), 'CONTROL setup: the toggle line is found verbatim');
  const Old = await import(pathToFileURL(M.write(PANE_PATH, src.replace(toggle, ''), 'no-noreply')).href);
  const c = judge(await paneWith(Old, false));
  ok(c.shown && !c.pressDid && c.readOnly, 'CONTROL: the copy without the toggle SHOWS the ↩ on the read-only thread and its press does nothing — the dead control the user pressed', J(c));
}
// ═══ ⑥ the pane's composer line wraps instead of cutting (the chrome leg measures it) ═══════════════════
console.log('⑥ the pane\'s composer line — where and how a reply goes — is never cut');
{
  const x = await paneWith(Pane, true);
  const note = x.p.el.querySelector('.chanwin-note-text');
  const inComposer = (n) => { for (let e = n; e; e = e.parentNode) if (e.classList && e.classList.contains('chanthread-composer')) return true; return false; };
  ok(note && /Lands inside this thread · /.test(note.textContent) && inComposer(note), `setup: the REAL pane's composer draws its line inside .chanthread-composer ("${note && note.textContent}")`);
  const RULE = /\.chanthread-composer \.chanwin-note-text \{[^}]*white-space: normal;[^}]*overflow: visible;/;
  const css = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf-8');
  const judge = (c) => RULE.test(c) && /\.chanwin-note-text \{[^}]*white-space: nowrap;/.test(c);
  ok(judge(css), 'the stylesheet lets THAT line wrap (white-space normal, nothing hidden) while the main composer keeps its one-line rule');
  const pre = css.replace(RULE, '.chanthread-composer .x-removed {');
  ok(pre !== css && !judge(pre), 'CONTROL: the stylesheet without the rule is judged red (the chrome leg shows the same copy cutting "…あなたとしてす…")');
  ok(read('scripts/test-channel-threads-ui.mjs').includes("whole(pane.querySelector('.chanthread-foot .chanwin-note-text'), 'pane composer line')"), 'WIRING: the chrome leg (h) measures the pane composer line whole in zh and ja at 360 px');
}
globalThis.fetch = realFetch;
delete globalThis.document;

// ═══ ③ who reacted, in names only ════════════════════════════════════════════════════════════════
console.log('③ who reacted: names only — "You" for the owner, a nameless reactor counted, never an id');
{
  const eng = fakeEngine('who');
  await eng.pass('fake-poll', { force: true });
  const ids = ['fake-poll-ops-m3', 'fake-poll-ops-m4', 'fake-poll-ops-m5'];
  await eng.reactionsRefresh('fake-poll', 'fake-poll-ops', ids);
  await new Promise((res) => setTimeout(res, 20));   // a person's click comes after the list, never inside its millisecond
  const r = await eng.react('fake-poll', 'fake-poll-ops', 'fake-poll-ops-m4', 'fire');   // the owner's own click on a chip others hold
  const list = r && r.ok ? r.reactions : [];
  const fire = list.find((x) => x.key === 'fire');
  const ids4 = fire ? fire.by.map((b) => b.id) : [];
  ok(fire && fire.mine && ids4.includes('u-me') && fire.by.some((b) => !b.name && !b.self), 'setup: the REAL engine\'s fold for the owner\'s 🔥 on m4 — `mine`, the owner\'s id in `by`, and a reactor the room has no name for (the fake\'s "u-cass": Cass never wrote in Ops room)', J(fire && fire.by));
  ok(fire.by.filter((b) => b.self === true).map((b) => b.id).join() === 'u-me', 'the fold marks the OWNER\'s entry `self` (the token\'s id) and no other', J(fire.by));
  const Pick = await import(pathToFileURL(path.join(REPO, 'src/lib/reaction-picker.js')).href);
  const words = Pick.whoText(fire);
  const idsShown = ids4.filter((id) => words.includes(id));
  ok(/^You, /.test(words) && idsShown.length === 0 && /and \d+ more$/.test(words), `the chip's who-words: "${words}" — the owner is "You", no id appears (${ids4.length} ids in \`by\`)`, J({ words, idsShown }));
  const n = Number((/and (\d+) more$/.exec(words) || [])[1]);
  const drawn = words.split(' and ')[0].split(', ').length;
  ok(drawn + n === fire.count, `…and it still COUNTS everyone: ${drawn} drawn + ${n} more = ${fire.count}`);
  const other = [...eng.reactionsFor('fake-poll', 'fake-poll-ops', ids).values()].flat().find((x) => !x.mine && x.by.some((b) => !b.name));
  ok(other && !other.by.map((b) => b.id).some((id) => Pick.whoText(other).includes(id)), `a chip that is not the owner's, with a nameless reactor: "${other && Pick.whoText(other)}" — no id`, J(other && other.by));
  const PICK_SRC = read('src/lib/reaction-picker.js');
  ok(PICK_SRC.includes("if (x.mine === true) { pop.appendChild(el('div', 'rx-who-row', t('You'))); rows++; }") && PICK_SRC.includes("if (b && b.self !== true && b.name) { pop.appendChild(el('div', 'rx-who-row', b.name)); rows++; }") && !PICK_SRC.includes("b.name || t('unknown')"), 'WIRING: the long-press list says "You" for the owner and draws a row only for a NAME (no "unknown" rows — counted in "and N more")');
  ok(ZH.get('You') === '你' && JA.get('You') === 'あなた', 'the word "You" is in both dictionaries (你 / あなた)');
  // CONTROL: the pre-fix pair — whoList mapping `name || id`, whoText without the owner — prints the ids
  const RX_PATH = path.join(REPO, 'src/channel-reactions.js');
  const rxSrc = fs.readFileSync(RX_PATH, 'utf-8');
  const a = rxSrc.indexOf('function whoList(x, max = 3) {'), b = rxSrc.indexOf('\n}\n', a) + 3;
  ok(a > 0 && b > a, 'CONTROL setup: whoList is found');
  const oldWhoList = "function whoList(x, max = 3) {\n  const names = (x && Array.isArray(x.by) ? x.by : []).map((b) => b && (b.name || b.id)).filter(Boolean);\n  const shown = names.slice(0, Math.max(1, max));\n  const more = Math.max(0, (Number(x && x.count) || 0) - shown.length);\n  return { names: shown, more };\n}\n";
  const rxOld = M.write('src/channel-reactions.js', rxSrc.slice(0, a) + oldWhoList + rxSrc.slice(b), 'old-wholist');
  const pSrc = fs.readFileSync(path.join(REPO, 'src/lib/reaction-picker.js'), 'utf-8');
  const newWho = "  const parts = [...(w.self ? [t('You')] : []), ...w.names];\n  if (!parts.length) return x && x.count ? t('{n} reactions', { n: x.count }) : '';\n  const names = parts.join(', ');";
  const oldWho = "  if (!w.names.length) return x && x.count ? t('{n} reactions', { n: x.count }) : '';\n  const names = w.names.join(', ');";
  ok(pSrc.includes(newWho) && pSrc.includes("import * as Rx from '../channel-reactions.js';"), 'CONTROL setup: whoText\'s body and its import are found');
  const pOld = pSrc.replace(newWho, oldWho).replace("import * as Rx from '../channel-reactions.js';", `import * as Rx from ${JSON.stringify(pathToFileURL(rxOld).href)};`);
  const PickOld = await import(pathToFileURL(M.write(path.join(REPO, 'src/lib/reaction-picker.js'), pOld, 'old-whotext')).href);
  const cw = PickOld.whoText(fire);
  ok(/u-me/.test(cw) && !/^You/.test(cw), `CONTROL: the pre-fix pair words the same fold "${cw}" — the owner's own id, the words the user read`, cw);
}

// ═══ ④ a reaction digest is not a channel message ════════════════════════════════════════════════
console.log('④ a reaction on the agent\'s message waits as "a reaction notice" — never "a channel message", never a reply hint');
{
  const S = require(path.join(REPO, 'src/stash-summary.js'));
  const { renderMsgStash } = require(path.join(REPO, 'src/agent-routes.js'));
  const dir = path.join(ROOT, 'digest');
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  const registry = CH.createChannelRegistry();
  for (const m of [fake.fakePoll, fake.fakePush, fake.fakeScan]) registry.register(m);
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'fake-poll', kind: 'fake-poll', label: 'fake-poll', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, reactionPolicy: 'propose', push: null, scan: null }] }));
  const ladder = { calls: [], stash: [], async deliverToConversation(cid, text, opts) { ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; }, stashFor(cid, env) { ladder.stash.push({ cid, ts: Date.now(), ...env }); return { stored: true, why: null }; }, stashPeek(cid) { return ladder.stash.filter((x) => x.cid === cid); } };
  const eng = ENG.create({ dataDir: dir, env: {}, registry, broadcast: () => { }, log: quiet, deliver: ladder, serverSetting: () => undefined, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }], now: () => Date.now() });
  engines.push(eng);
  const AGP = { kind: 'agent', id: 'agent-1', name: 'Worker' };
  await eng.pass('fake-poll', { force: true });
  await eng.setAccess('fake-poll', { kind: 'conversation', convId: 'fake-poll-ops' }, [{ principal: AGP, authority: 'draft' }]);
  const pr = await eng.propose({ ...AGP, groups: [], msgLevelFor: () => 'none' }, 'fake-poll', 'fake-poll-ops', { text: 'on it', replyTo: 'fake-poll-ops-m7', placement: 'thread' });
  const ap = pr.ok ? await eng.approve(pr.proposal.id) : null;
  await eng.settleWakes();
  const sentId = ap && ap.proposal && ap.proposal.result && ap.proposal.result.vendorMessageId;
  await eng.pass('fake-poll', { force: true });   // the fake files an in-thread reply into its world: the next pass ingests it
  ladder.stash.length = 0; ladder.calls.length = 0;
  const rx = sentId && eng.store.findRecord('fake-poll', 'fake-poll-ops', sentId) ? await eng.react('fake-poll', 'fake-poll-ops', sentId, 'tada') : null;
  for (let i = 0; i < 50 && !ladder.stash.length; i++) await new Promise((r) => setTimeout(r, 10));
  const dg = ladder.stash.filter((x) => x.cid === 'agent-1');
  ok(sentId && rx && rx.ok && dg.length === 1 && /🎉 ×1 on your reply in Ops room/.test(dg[0].text) && dg[0].source === 'channel' && dg[0].fromName === S.REACTION_DIGEST_FROM, 'setup: the REAL engine — the agent\'s in-thread reply sent (approved), the owner\'s 🎉 on it ⇒ ONE digest line in the agent\'s next-turn stash, filed under the one sender name', J({ sentId, rx: rx && rx.ok, dg }));
  const words = S.stashSummaryWords(S.summarize({ msg: dg }), (x, v) => (v ? x.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : x));
  ok(S.kindOf(dg[0]) === 'channel-reaction' && words.parts.join() === 'a reaction notice' && !/channel message/.test(words.parts.join()), `the strip above the composer: "${words.head}: ${words.parts.join(', ')}" — a reaction, never "a channel message"`, J(words));
  const inj = renderMsgStash(dg).text;
  ok(/🎉 ×1 on your reply in Ops room/.test(inj) && !/a channel message is answered with vibespace-channels reply/.test(inj), 'the agent\'s next prompt carries the digest line WITHOUT the "answer it with vibespace-channels reply" hint', inj);
  const withMsg = renderMsgStash([...dg, { source: 'channel', kind: 'notification', fromName: 'Channels · fake-poll', text: 'Ada: can someone look?', ts: Date.now() }]).text;
  ok(/a channel message is answered with vibespace-channels reply/.test(withMsg), '…the hint still rides a stash that holds a channel MESSAGE (the digest beside it changes nothing)');
  ok(read('src/server/channels-engine.js').includes("const RX_DIGEST_FROM = require('../stash-summary.js').REACTION_DIGEST_FROM;"), 'WIRING: the engine files the digest under the ONE spelling the summary and the injection read');
  const k2 = ['a reaction notice', '{n} reaction notices'];
  ok(k2.every((k) => ZH.has(k) && JA.has(k) && !LATIN_ONLY.test(ZH.get(k)) && !LATIN_ONLY.test(JA.get(k))), `the words in both dictionaries: zh "${ZH.get(k2[0])}" / "${ZH.get(k2[1])}" · ja "${JA.get(k2[0])}"`);
  ok(S.KIND_ORDER.every((k) => S.partWords({ kind: k, n: 1, label: 'X' }, (x) => x) !== 'a notice'), 'every kind in KIND_ORDER has its own words (the new one included — never the generic "a notice")');
  // CONTROLS: the pre-fix kindOf (a digest is a "channel message") and the pre-fix hint (it rides any channel source)
  const SS_PATH = path.join(REPO, 'src/stash-summary.js');
  const ssSrc = fs.readFileSync(SS_PATH, 'utf-8');
  const k1 = "  if (src === 'channel') return from === REACTION_DIGEST_FROM ? 'channel-reaction' : 'channel';";
  ok(ssSrc.includes(k1), 'CONTROL setup: the kind line is found');
  const SOld = M.load('src/stash-summary.js', ssSrc.replace(k1, "  if (src === 'channel') return 'channel';"), 'old-kind');
  const wOld = SOld.stashSummaryWords(SOld.summarize({ msg: dg }), (x, v) => (v ? x.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : x));
  ok(wOld.parts.join() === 'a channel message', `CONTROL: the pre-fix kind words the owner's 🎉 as "${wOld.parts.join()}" — the strip the user read`, J(wOld.parts));
  const AR_PATH = path.join(REPO, 'src/agent-routes.js');
  const arSrc = fs.readFileSync(AR_PATH, 'utf-8');
  const h1 = "  if (shown.some((e) => e.source === 'channel' && stashSummary.kindOf(e) !== 'channel-reaction')) hints.push(";
  ok(arSrc.includes(h1), 'CONTROL setup: the hint line is found');
  const AOld = M.load('src/agent-routes.js', arSrc.replace(h1, "  if (shown.some((e) => e.source === 'channel')) hints.push("), 'old-hint');
  ok(/a channel message is answered with vibespace-channels reply/.test(AOld.renderMsgStash(dg).text), 'CONTROL: the pre-fix injection tells the agent to answer the 🎉 with `vibespace-channels reply`');
}

// ═══ ⑤ the placement refusal says which flags ask for what is offered ════════════════════════════════
console.log('⑤ a placement refusal tells the agent which FLAGS ask for what the channel offers');
{
  const http = await import('node:http');
  const { execFile } = await import('node:child_process');
  const P = require(path.join(REPO, 'src/channel-policy.js'));
  const gmail = require(path.join(REPO, 'src/channels/gmail.js'));
  let answer = null;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { res.writeHead(answer.ok ? 200 : 409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(answer.ok ? answer : { ...answer, error: answer.error || 'refused', code: answer.code })); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const API = `http://127.0.0.1:${server.address().port}`;
  const CLI = path.join(REPO, 'data/bin/vibespace-channels');
  const run = (cli, argv) => new Promise((res) => execFile(process.execPath, [cli, ...argv], { env: { PATH: process.env.PATH, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_test' }, timeout: 15000 }, (e, so, se) => res({ code: e ? e.code : 0, out: String(so || ''), err: String(se || '') })));
  // the refusals the engine hands back — the PURE verdict for the SHIPPED rows (the engine returns it as is)
  const gThread = P.placementVerdict({ requested: 'thread', replyTo: 'm-1', caps: gmail.caps, parent: { inThread: false } });
  const gBoth = P.placementVerdict({ requested: 'thread+chat', replyTo: 'm-1', caps: gmail.caps, parent: { inThread: false } });
  const lBoth = P.placementVerdict({ requested: 'thread+chat', replyTo: 'm-1', caps: lark.caps, parent: { inThread: false } });
  ok(!gThread.ok && gThread.code === 'placement-not-offered' && J(gThread.offered) === J(['chat', 'quote']) && !lBoth.ok && J(lBoth.offered) === J(['chat', 'quote', 'thread']), 'setup: the verdicts — Gmail offers chat + quote, Lark chat + quote + thread', J([gThread, lBoth]));
  answer = gThread;
  const a = await run(CLI, ['reply', 'gmail-1/t-1', 'x', '--to', 'm-1', '--in-thread']);
  ok(a.code === 1 && /offered here: chat, quote \[placement-not-offered\]/.test(a.err) && a.err.includes('ask for what is offered with: chat: leave out --to · quote: --to <msg id>'), `Gmail-shaped, --in-thread: the refusal + "${(a.err.split('\n')[1] || '').trim()}"`, a.err);
  answer = gBoth;
  const b = await run(CLI, ['reply', 'gmail-1/t-1', 'x', '--to', 'm-1', '--also-in-chat']);
  ok(b.code === 1 && b.err.includes('ask for what is offered with: chat: leave out --to · quote: --to <msg id>'), 'Gmail-shaped, --also-in-chat: the same flags', b.err);
  answer = lBoth;
  const c = await run(CLI, ['reply', 'lark-1/oc_x', 'x', '--to', 'm-1', '--also-in-chat']);
  ok(c.code === 1 && c.err.includes('ask for what is offered with: chat: leave out --to · quote: --to <msg id> · thread: --to <msg id> --in-thread'), 'Lark-shaped, --also-in-chat: the flags for chat, quote AND thread', c.err);
  answer = P.placementVerdict({ requested: 'quote', replyTo: 'm-1', caps: lark.caps, parent: { inThread: true } });
  const d = await run(CLI, ['reply', 'lark-1/oc_x', 'x', '--to', 'm-1']);
  ok(d.code === 1 && /--in-thread/.test(d.err) && !d.err.includes('ask for what is offered with'), 'a parent-in-thread refusal already names its flags (--in-thread) — no second line', d.err);
  // CONTROL: the CLI copy without the hint leaves the agent with the placement names only
  const cliSrc = fs.readFileSync(CLI, 'utf-8');
  const hook = " placementHint(j); process.exit(1); }";
  ok(cliSrc.includes(hook), 'CONTROL setup: the hint call is found');
  answer = gThread;
  const o = await run(M.write('data/bin/vibespace-channels', cliSrc.replace(hook, ' process.exit(1); }'), 'no-hint', { esm: false }), ['reply', 'gmail-1/t-1', 'x', '--to', 'm-1', '--in-thread']);
  ok(o.code === 1 && /offered here: chat, quote/.test(o.err) && !/--to <msg id>/.test(o.err), 'CONTROL: the copy without it answers "offered here: chat, quote" and nothing the agent can type', o.err);
  server.close();
}

for (const e of engines) try { e.stop(); } catch { }
for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 7, label: 'chanthr-naive: ' })) ok(row.pass, row.name, row.detail);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
