#!/usr/bin/env node
// A QUOTE IS A QUOTE, A TOPIC IS A TOPIC (fast; lane channel-threads, the owner's two rulings of 2026-09-28 21:55 PDT,
// both "是"). The naive-user pass saw it (shots 03 / 12 / 35): Lark has two things — a TOPIC (话题: a topic group's
// message, a reply made with reply_in_thread — the vendor's `thread_id`) and a QUOTE REPLY (引用回复: a plain group
// message that points at another one — `parent_id` + `root_id`, no thread id). The window tagged BOTH "在线程中" and
// opened a "线程" pane for both, so an approved "引用回复 (stays in the chat)" came back from the vendor tagged "in
// thread": the placement rules judged "inside a thread" by the index's `vendor` kind while the render drew a thread
// fact for every index entry, the reply chain included — two rules for one question.
//   ① THE ONE CLASSIFIER — `placeKindOf` (src/channel-thread.js, PURE) — as a TABLE over the naive pass's real-shape
//      fixtures through the REAL Lark normalizer: the topic room of the naive harness (a topic root, a topic reply, a
//      quote whose parent was never stored) + a loaded quote, a quote of a quote, a quote INSIDE a topic, a quote later
//      answered with reply_in_thread (it heads a topic now), a plain message. Each row: kind / topic / quotes, the
//      read-shape `place` the window gets (a thread fact ONLY for a topic), the agent's words ("quotes …" — never
//      "in thread" for a quote).
//   ② THE RENDER READS IT: the REAL channel-thread-pane.js (quoteLine / threadChip / inThreadTag) over a small fake DOM
//      with each row's place — a quote: the quoted-original strip (click = jump to the parent), NO topic tag, NO chip;
//      a topic root: the chip; a topic reply: the tag. The fake-poll room of shot 03 through the REAL engine: every
//      reply-chain record is a quote (no chip on the message the chain answers), every fthr_ topic is a topic.
//   ③ THE ENGINE READS IT: the REAL engine over a Lark-shaped scripted adapter holding the same rows — `--to` alone on a
//      quote ⇒ the stored `quote` (the vendor's norm), on a topic message ⇒ `thread`; `quote` of a topic message ⇒
//      parent-in-thread; the thread read of a quote ⇒ `not-a-thread` (the agent's note says so); the thread WALK of a
//      quote ⇒ `not-a-thread` with ZERO vendor calls (a Lark thread listing asked with a message id is a wasted call).
//   ④ 话题, NEVER 线程 — every zh string the channels surfaces draw (every t / tc / i18nKey literal of the channel
//      client files, the PURE channel modules, the adapters, the Channels settings) is free of 线程, and the whole zh
//      dictionary's 线程 values are a NAMED list of non-channel meanings (a CPU thread, a Codex thread); ja keeps ONE word
//      (スレッド — never トピック for a thread); the build's i18n check passes.
//   ⑤ CONTROLS (scripts/mutant-copy.mjs, scratch only): a classifier that calls a reply chain a topic; the pre-fix
//      render pair (placeOf attaching the chain's thread + the pane without the classifier's check) reproduces the
//      shot — the quote tagged "in thread" — while each layer alone still holds; the engine's parent fact on its own
//      rule (a quote defaulted INTO a thread); the walk without its refusal (the vendor called); a planted 线程 in a
//      channel string and in an unlisted key; a planted トピック in ja.
// Zero vendor calls (scripted adapters in-process), per-pid scratch. Run: node scripts/test-channel-quote-topic.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } return !!c; };
const J = (x) => JSON.stringify(x);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');

const MODEL = 'src/channel-thread.js';
const MODEL_SRC = read(MODEL);
const T = require(path.join(REPO, MODEL));
const REC = require(path.join(REPO, 'src/channel-record.js'));
const lark = require(path.join(REPO, 'src/channels/lark.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const ENG_PATH = path.join(REPO, 'src/server/channels-engine.js');
const ENG = require(ENG_PATH);

const ROOT = scratch('chanquote');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
const M = mutantCopies('chanquote', REPO);

// ═══ THE FIXTURES: the naive pass's topic room (naive/harness.mjs, shots 12 / 35) through the REAL Lark normalizer ══
const NOW = Date.now(), MIN = 60e3;
const CONV = 'oc_thr';
const item = (id, at, text, sender, extra = {}) => ({ message_id: id, msg_type: 'text', create_time: String(at), chat_id: CONV, sender: { id: sender, sender_type: 'user' }, body: { content: JSON.stringify({ text }) }, ...extra });
const NAMES = new Map([['ou_ada', 'Ada'], ['ou_brook', 'Brook'], ['ou_cass', 'Cass'], ['ou_dan', 'Dan']]);
const ITEMS = [
  // the naive harness's three, verbatim shape: a topic head (thread_id), its reply, a quote whose parent was never stored
  item('om_t0', NOW - 30 * MIN, '周会改到几点？', 'ou_ada', { thread_id: 'omt_a' }),
  item('om_t1', NOW - 25 * MIN, '三点吧', 'ou_brook', { root_id: 'om_t0', parent_id: 'om_t0', thread_id: 'omt_a' }),
  item('om_t2', NOW - 20 * MIN, '同意之前的方案', 'ou_cass', { root_id: 'om_gone', parent_id: 'om_gone' }),
  // a QUOTE INSIDE the topic: a reply in omt_a that answers the reply, not the head
  item('om_t3', NOW - 19 * MIN, '三点可以', 'ou_cass', { root_id: 'om_t0', parent_id: 'om_t1', thread_id: 'omt_a' }),
  // a plain message, a loaded quote of it, a quote of that quote (the chain shot 03 drew as "3 条回复" + "在线程中")
  item('om_p', NOW - 15 * MIN, '明天发版', 'ou_ada'),
  item('om_q', NOW - 14 * MIN, '好的', 'ou_brook', { root_id: 'om_p', parent_id: 'om_p' }),
  item('om_q2', NOW - 13 * MIN, '收到', 'ou_cass', { root_id: 'om_p', parent_id: 'om_q' }),
  // a quote later answered WITH reply_in_thread: the vendor mints a topic ON it (its own line has no thread id)
  item('om_z', NOW - 12 * MIN, '我来跟进', 'ou_dan', { root_id: 'om_p', parent_id: 'om_p' }),
  item('om_z1', NOW - 11 * MIN, '进展？', 'ou_ada', { root_id: 'om_z', parent_id: 'om_z', thread_id: 'omt_b' }),
];
const toRecs = (adapterId) => ITEMS.map((m) => lark.toRecord(adapterId, CONV, m, { names: NAMES }));
const RECS = toRecs('lark');
const BY = new Map(RECS.map((r) => [r.vendorId, r]));
/** THE TABLE — what each message IS, and what the window and the agent must say about it. */
const TABLE = [
  // id       kind           topic    quotes     chip   tag    strip (the words / the author)            the agent's line
  ['om_t0', 'topic-root', 'omt_a', null, true, false, null, { tag: /^\[thread omt_a · 2 replies · last /, line: null }],
  ['om_t1', 'topic-reply', 'omt_a', 'om_t0', false, true, 'Ada', { tag: null, line: /^↳ replying to Ada: "周会改到几点？" \(id om_t0\) · in thread omt_a$/ }],
  ['om_t2', 'quote', null, 'om_gone', false, false, 'quoting a message not loaded', { tag: null, line: /^↳ quotes a message not loaded \(id om_gone\)$/ }],
  ['om_t3', 'topic-quote', 'omt_a', 'om_t1', false, true, 'Brook', { tag: null, line: /^↳ quotes Brook: "三点吧" \(id om_t1\) · in thread omt_a$/ }],
  ['om_p', 'plain', null, null, false, false, null, { tag: null, line: null }],
  ['om_q', 'quote', null, 'om_p', false, false, 'Ada', { tag: null, line: /^↳ quotes Ada: "明天发版" \(id om_p\)$/ }],
  ['om_q2', 'quote', null, 'om_q', false, false, 'Brook', { tag: null, line: /^↳ quotes Brook: "好的" \(id om_q\)$/ }],
  ['om_z', 'topic-root', 'omt_b', 'om_p', true, false, 'Ada', { tag: /^\[thread omt_b · 1 reply/, line: /^↳ quotes Ada: "明天发版" \(id om_p\)$/ }],
  ['om_z1', 'topic-reply', 'omt_b', 'om_z', false, true, 'Dan', { tag: null, line: /^↳ replying to Dan: "我来跟进" \(id om_z\) · in thread omt_b$/ }],
];
const QUOTE_ROWS = TABLE.filter((r) => r[1] === 'quote').map((r) => r[0]);
const TOPIC_ROWS = TABLE.filter((r) => r[1].startsWith('topic-')).map((r) => r[0]);

// ═══ ① THE ONE CLASSIFIER ═════════════════════════════════════════════════════════════════════════
console.log('① THE ONE CLASSIFIER — placeKindOf over the naive pass\'s real-shape fixtures (the REAL Lark normalizer)');
/** The classifier's table + the read shape + the agent's words, judged for one module (the real one or a copy). */
function judgeModel(Tm) {
  const ix = Tm.threadIndex(RECS, { convId: CONV });
  const rows = [];
  for (const [id, kind, topic, quotes, chip, tag, strip, agent] of TABLE) {
    const c = Tm.placeKindOf(BY.get(id), ix);
    const p = Tm.placeOf(BY.get(id), ix);
    const w = Tm.agentPlaceLine(p, { now: NOW });
    const okKind = c.kind === kind && c.topic === topic && c.quotes === quotes;
    // the read shape: the SAME kind; a thread fact only for a topic (the chip / tag / pane read it), a quote for a reply
    const okPlace = p.kind === kind && (topic ? !!(p.thread && p.thread.key === topic && p.thread.isRoot === (kind === 'topic-root')) : p.thread === null) && (quotes ? !!(p.quote && p.quote.of === quotes) : p.quote === null);
    const okAgent = (agent.tag ? agent.tag.test(w.tag || '') : w.tag === null) && (agent.line ? agent.line.test(w.line || '') : w.line === null) && !(kind === 'quote' && /in thread/.test(`${w.tag || ''} ${w.line || ''}`));
    rows.push({ id, want: kind, got: c.kind, topic: c.topic, quotes: c.quotes, okKind, okPlace, okAgent, place: { kind: p.kind, thread: p.thread && p.thread.key }, words: w });
  }
  return rows;
}
const MODEL_ROWS = judgeModel(T);
for (const r of MODEL_ROWS) ok(r.okKind && r.okPlace && r.okAgent, `${r.id}: ${r.want}${r.topic ? ` (topic ${r.topic})` : ''}${r.quotes ? `, quotes ${r.quotes}` : ''} — the place ${r.place.thread ? `carries the topic ${r.place.thread}` : 'carries NO thread fact'}; the agent reads ${J(r.words.line || r.words.tag || '(nothing)')}`, r);
ok(J(T.PLACE_KINDS) === J(['plain', 'quote', 'topic-root', 'topic-reply', 'topic-quote']), `the kinds are a CLOSED set of five (${T.PLACE_KINDS.join(' / ')})`);
{
  // by ID (the engine asks about the message a reply answers — loaded or not): the same answer as by record
  const ix = T.threadIndex(RECS, { convId: CONV });
  const byId = TABLE.every(([id]) => J(T.placeKindOf(id, ix)) === J(T.placeKindOf(BY.get(id), ix)));
  const gone = T.placeKindOf('om_gone', ix);
  ok(byId && gone.kind === 'plain' && gone.topic === null, 'the classifier by vendor id answers the same as by record; a message the log never held (om_gone) is in no topic', J(gone));
  // a Gmail thread (threadKey === convId) is the conversation itself — never a topic, never a quote
  const gm = [REC.makeRecord({ adapterId: 'g', convId: 'th-1', vendorId: 'g1', at: 1, text: 'mail', threadKey: 'th-1' }), REC.makeRecord({ adapterId: 'g', convId: 'th-1', vendorId: 'g2', at: 2, text: 'mail 2', threadKey: 'th-1' })];
  const gix = T.threadIndex(gm, { convId: 'th-1' });
  ok(gm.every((r) => T.placeKindOf(r, gix).kind === 'plain' && T.placeOf(r, gix).thread === null), 'a mail thread (kind conversation) is plain — the window draws nothing new');
}

// ═══ ② THE RENDER READS IT (the REAL pane module over a small fake DOM) ═════════════════════════════
console.log('② the render reads the classifier — the strip, the chip, the tag');
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this._text = ''; this.className = ''; this.dataset = {}; this.attrs = {}; this.style = {}; this.title = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  append(...ns) { for (const n of ns) this.appendChild(n); }
  appendChild(n) { n.parentNode = this; this.children.push(n); return n; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  click() { if (this.onclick) this.onclick({ stopPropagation() { }, preventDefault() { } }); }
  get classList() { const self = this; const list = () => self.className.split(/\s+/).filter(Boolean); return { contains: (c) => list().includes(c), add: (c) => { if (!list().includes(c)) self.className = [...list(), c].join(' '); } }; }
}
const PANE_PATH = path.join(REPO, 'src/lib/channel-thread-pane.js');
const PANE_SRC = fs.readFileSync(PANE_PATH, 'utf-8');
const Pane = await import(pathToFileURL(PANE_PATH).href);
globalThis.document = { createElement: (t) => new El(t), createElementNS: (ns, t) => new El(t), createDocumentFragment: () => new El('#frag') };
/** What a person sees on ONE row: the strip (its words, where a click jumps), the chip, the tag. */
function drawRow(P, place) {
  const jumps = [], opens = [];
  const strip = P.quoteLine(place, { onJump: (v) => jumps.push(v) });
  const chip = P.threadChip(place, { onOpen: (th) => opens.push(th.key), now: NOW });
  const tag = P.inThreadTag(place, { onOpen: (th) => opens.push(th.key) });
  if (strip) strip.click();
  if (chip) chip.click();
  if (tag) tag.click();
  return { strip: strip ? strip.textContent : null, stripKind: strip ? strip.dataset.placeKind : null, jumps, chip: !!chip, tag: !!tag, opens };
}
function judgeRender(P, Tm) {
  const ix = Tm.threadIndex(RECS, { convId: CONV });
  const out = [];
  for (const [id, kind, topic, quotes, chip, tag, strip] of TABLE) {
    const place = Tm.placeOf(BY.get(id), ix);
    const d = drawRow(P, place);
    const okStrip = strip === null ? d.strip === null : (d.strip !== null && d.strip.includes(strip) && (quotes && quotes !== 'om_gone' ? d.jumps.join() === quotes : true));
    const okOpen = (chip || tag) ? d.opens.join() === topic : d.opens.length === 0;
    out.push({ id, kind, ok: d.chip === chip && d.tag === tag && okStrip && okOpen, d });
  }
  return out;
}
const RENDER_ROWS = judgeRender(Pane, T);
for (const r of RENDER_ROWS) ok(r.ok, `${r.id} (${r.kind}) draws ${r.d.strip !== null ? `the strip "${r.d.strip}"${r.d.jumps.length ? ` (a click jumps to ${r.d.jumps.join()})` : ''}` : 'no strip'}${r.d.chip ? ' + the topic chip' : ''}${r.d.tag ? ' + the topic tag' : ''}${!r.d.chip && !r.d.tag ? ' — no chip, no tag, no pane' : ` (opens ${r.d.opens.join()})`}`, r.d);
ok(RENDER_ROWS.filter((r) => QUOTE_ROWS.includes(r.id)).every((r) => r.d.stripKind === 'quote'), 'every quote\'s strip carries the classifier\'s kind (data-place-kind="quote") — the render read the same word the placement rules read');
{
  // shot 03's account — the FAKE poll adapter's seeded rooms (the big room included) through the REAL engine's read
  // shape: their reply chains are QUOTES (no chip on the message a chain answers, no tag), their fthr_ threads TOPICS
  const dir = path.join(ROOT, 'fake');
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  const registry = CH.createChannelRegistry();
  for (const m of [fake.fakePoll, fake.fakePush, fake.fakeScan]) registry.register(m);
  const row = (id) => ({ id, kind: id, label: id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, reactionPolicy: 'propose', push: null, scan: null });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: fake.FAKE_KINDS.map(row) }));
  process.env.VIBESPACE_CHANNELS_FAKE_BIG = '120';   // the NAMED seam (fake.js reads it at create) — the chrome suite's 120-row room
  const eng = ENG.create({ dataDir: dir, env: {}, registry, broadcast: () => { }, log: quiet, serverSetting: () => undefined, liveSessions: () => [], now: () => Date.now() });
  await eng.pass('fake-poll', { force: true });
  delete process.env.VIBESPACE_CHANNELS_FAKE_BIG;
  const rooms = ['fake-poll-ops', 'fake-poll-announce', 'fake-poll-big'];
  const page = rooms.flatMap((c) => eng.messages('fake-poll', c, { limit: 200 }).map((r) => ({ ...r, room: c })));
  const chainRecs = page.filter((r) => r.threadKey && !String(r.threadKey).startsWith('fthr_'));
  const topicRecs = page.filter((r) => r.threadKey && String(r.threadKey).startsWith('fthr_'));
  const drawn = page.map((r) => ({ vid: r.vendorId, room: r.room, kind: r.place ? r.place.kind : 'plain', ...drawRow(Pane, r.place || null) }));
  const d = (vid) => drawn.find((x) => x.vid === vid);
  const chainRoots = [...new Set(chainRecs.map((r) => String(r.threadKey)))].filter((v) => d(v));
  ok(chainRecs.length >= 5 && topicRecs.length >= 5 && chainRoots.length >= 2 && rooms.every((c) => page.some((r) => r.room === c)), `setup: shot 03's account (fake-poll, ${rooms.length} rooms, ${page.length} records) holds BOTH shapes — ${chainRecs.length} reply-chain records (Lark quotes, under ${chainRoots.length} drawn messages) and ${topicRecs.length} topic records (fthr_)`);
  ok(chainRecs.every((r) => d(r.vendorId).kind === 'quote' && !d(r.vendorId).tag && !d(r.vendorId).chip && d(r.vendorId).strip !== null), 'every reply-chain record is a QUOTE: its strip, no "in thread" tag, no chip (shot 03 drew "在线程中" on each)', J(chainRecs.map((r) => d(r.vendorId)).filter((x) => x.kind !== 'quote' || x.tag || x.chip).slice(0, 3)));
  ok(chainRoots.every((vid) => !d(vid).chip && !d(vid).kind.startsWith('topic-')), `the ${chainRoots.length} messages quote chains answer grow NO topic chip (shot 03's "3 条回复 · 最近 0s" on Brook's line)`, J(chainRoots.map((v) => d(v)).filter((x) => x.chip)));
  ok(topicRecs.every((r) => d(r.vendorId).kind.startsWith('topic-')) && drawn.some((x) => x.kind === 'topic-root' && x.chip) && topicRecs.filter((r) => r.replyTo).every((r) => d(r.vendorId).tag), 'every fthr_ record is a TOPIC (a root with its chip, the replies with their tag)');
  try { eng.stop(); } catch { }
}

// ═══ ③ THE ENGINE READS IT (the REAL engine over a Lark-shaped scripted adapter) ═══════════════════════
console.log('③ the engine reads the classifier — the placement default, the thread read, the walk');
/** The REAL engine (or a copy) over a Lark-shaped scripted module holding the table's records; counts thread walks. */
async function engineLeg(EngMod, name) {
  const A = 'ql-' + name, C = CONV;
  const recs = toRecs(A);
  const calls = { threadHistory: 0 };
  const mod = {
    kind: A,
    caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'none', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false, readReceipts: false, attachments: 'none', olderHistory: 'none', budget: { unit: 'request', default: 600, settingKey: null, metered: true },
      threads: { read: 'vendor', replyInto: true, listing: 'separate', placements: ['chat', 'quote', 'thread'], rootReply: 'quote' } },
    create() {
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations() { return { conversations: [REC.makeConversation({ id: C, vendorId: C, title: 'Topic room', kind: 'group', participants: 'Ada', lastAt: null })], cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: ['user'], why: null, at: Date.now(), threads: { replyInto: true, mode: 'thread', why: null } }; },
        async history(convId, { anchor = null, limit = 50 } = {}) { let idx = 0; if (anchor) { const at = recs.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; } const page = recs.slice(idx, idx + limit); return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: idx + page.length >= recs.length, complete: true }; },
        async threadHistory() { calls.threadHistory++; return { records: [], anchor: null, reachedAnchor: true, complete: true }; },
        async send() { return { ok: true, vendorMessageId: 'om-sent', at: Date.now(), sentAs: 'user', observed: {} }; },
        async reconcile() { return { unknown: true }; },
      };
    },
  };
  const dir = path.join(ROOT, 'eng-' + name);
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: A, kind: A, label: A, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: null, scan: null }] }));
  const registry = CH.createChannelRegistry();
  registry.register(mod);
  const eng = EngMod.create({ dataDir: dir, env: {}, registry, broadcast: () => { }, log: quiet, serverSetting: () => undefined, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }], now: () => Date.now() });
  const AGP = { kind: 'agent', id: 'agent-1', name: 'Worker' };
  const AG = { ...AGP, groups: [], msgLevelFor: () => 'none' };
  await eng.pass(A, { force: true }); await eng.pass(A, { force: true });
  await eng.setAccess(A, { kind: 'conversation', convId: C }, [{ principal: AGP, authority: 'draft' }]);
  const R = { A, C, calls, logged: recs.every((r) => !!eng.store.findRecord(A, C, r.vendorId)) };
  R.defaults = {};
  for (const [id] of TABLE) { const p = await eng.propose(AG, A, C, { text: 'r ' + id, replyTo: id }); R.defaults[id] = p.ok ? `${p.proposal.placement}:${p.proposal.placementDefaulted}` : `refused:${p.code}:${p.why || ''}`; }
  const qt = await eng.propose(AG, A, C, { text: 'quote a topic reply', replyTo: 'om_t1', placement: 'quote' });
  R.quoteOfTopic = qt.ok ? 'ok' : `${qt.code}:${qt.why}`;
  const tq = await eng.propose(AG, A, C, { text: 'a topic ON a quote', replyTo: 'om_q', placement: 'thread' });
  R.threadOnQuote = tq.ok ? { placement: tq.proposal.placement, threadKey: tq.proposal.threadKey || null } : `${tq.code}`;
  R.read = {};
  for (const id of ['om_q', 'om_p', 'om_t1', 'om_nowhere']) { const r = eng.threadRead(A, C, id); R.read[id] = `${r.ok ? 'ok' : 'refused'}:${r.code || ''}:${(r.thread && r.thread.key) || ''}:${(r.records || []).length}`; }
  const ar = eng.readThreadFor(AG, A, C, 'om_q');
  R.agentNote = ar && ar.note;
  const walks0 = calls.threadHistory;
  const wq = await eng.threadRefresh(A, C, 'om_q');
  const wq2 = await eng.agentThreadRefresh(AG, A, C, 'om_q2');
  R.walkQuote = { code: wq.code, agent: wq2.code, calls: calls.threadHistory - walks0 };
  const wt = await eng.threadRefresh(A, C, 'om_t1');
  R.walkTopic = { ok: wt.ok, calls: calls.threadHistory - walks0 };
  try { eng.stop(); } catch { }
  return R;
}
const WANT_DEFAULTS = { om_t0: 'thread:parent-in-thread', om_t1: 'thread:parent-in-thread', om_t2: 'quote:root', om_t3: 'thread:parent-in-thread', om_p: 'quote:root', om_q: 'quote:root', om_q2: 'quote:root', om_z: 'thread:parent-in-thread', om_z1: 'thread:parent-in-thread' };
const E = await engineLeg(ENG, 'real');
ok(E.logged, 'setup: the REAL engine ingested the nine rows (the REAL Lark normalizer\'s records)');
ok(J(E.defaults) === J(WANT_DEFAULTS), `--to alone follows THE classifier: a quote (or what quotes answer) ⇒ quote, the vendor's norm; a topic message ⇒ thread — ${Object.entries(E.defaults).map(([k, v]) => `${k} ${v.split(':')[0]}`).join(', ')}`, J(E.defaults));
ok(E.quoteOfTopic === 'placement-not-offered:parent-in-thread', 'quoting a TOPIC reply is refused parent-in-thread (the vendor would file it in the topic — the card would lie)', E.quoteOfTopic);
ok(E.threadOnQuote && E.threadOnQuote.placement === 'thread' && E.threadOnQuote.threadKey === null, 'a reply INTO a thread on a quote is allowed and records NO thread key — the vendor mints the topic on it (never the quote chain\'s key)', J(E.threadOnQuote));
ok(E.read.om_q.startsWith('ok:not-a-thread::0') && E.read.om_p.startsWith('ok:not-a-thread::0') && E.read.om_t1 === 'ok::omt_a:3' && E.read.om_nowhere.startsWith('ok:thread-not-loaded'), `the thread read: a quote (and the message it quotes) answers not-a-thread with no records; a topic reply its topic; an unknown id thread-not-loaded — ${J(E.read)}`);
ok(/not in a thread — a quoted reply and the message it quotes are both shown in the conversation itself/.test(E.agentNote || ''), `the agent's thread read of a quote says so: "${E.agentNote}"`);
ok(E.walkQuote.code === 'not-a-thread' && E.walkQuote.agent === 'not-a-thread' && E.walkQuote.calls === 0 && E.walkTopic.ok && E.walkTopic.calls === 1, `the WALK of a quote is refused not-a-thread (the owner's and the agent's door) with ZERO vendor calls; a topic's walk is one call (${J({ quote: E.walkQuote, topic: E.walkTopic })})`);
{
  const eng = read('src/server/channels-engine.js');
  const words = read('src/lib/channel-words.js');
  const rx = read('src/routes/channels.js'), ag = read('src/agent-routes.js');
  ok(eng.includes("parentKey = Thr.placeKindOf(String(v.proposal.replyTo), ix).topic;") && eng.includes('const tk = topicKeyOf(ix, id);') && /function topicKeyOf\(ix, id\) \{\n    const c = Thr\.placeKindOf\(id, ix\);/.test(eng), 'WIRING: the engine\'s placement parent fact, its thread read and its walk all ask Thr.placeKindOf (one classifier)');
  ok(/'not-a-thread': 409/.test(rx) && /'not-a-thread': 409/.test(ag) && words.includes("case 'not-a-thread': return t("), 'WIRING: not-a-thread is a named 409 on both routes and worded for the window');
  const win = read('src/lib/channel-window.js');
  ok(win.includes('quoteLine(rec.place,') && win.includes('inThreadTag(rec.place,') && win.includes('threadChip(rec.place,'), 'WIRING: the window\'s rows draw the strip / tag / chip from the server\'s place (the classifier\'s kind)');
}

// ═══ ④ 话题, NEVER 线程 ═══════════════════════════════════════════════════════════════════════════
console.log('④ 话题, never 线程 — the zh census over the channels surfaces; ja keeps ONE word');
const dictOf = (src) => { const m = new Map(); for (const ln of src.split('\n')) { const x = /^  ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"): ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"),?$/.exec(ln); if (x) { try { m.set(new Function('return ' + x[1])(), new Function('return ' + x[2])()); } catch { } } } return m; };
const ZH_SRC = read('src/lib/i18n-zh.js'), JA_SRC = read('src/lib/i18n-ja.js');
/** THE CHANNELS SURFACES — every file whose words a channels window, panel, card, dialog, refusal or setting draws. */
function channelFiles() {
  const out = [];
  for (const f of fs.readdirSync(path.join(REPO, 'src/lib'))) if (/^(channel-|channels-)/.test(f) || f === 'reaction-picker.js' || f === 'stash-strip.js') out.push('src/lib/' + f);
  for (const f of fs.readdirSync(path.join(REPO, 'src'))) if (/^channel-.*\.js$/.test(f) || f === 'stash-summary.js') out.push('src/' + f);
  for (const d of ['src/channels', 'src/channels/live']) for (const f of fs.readdirSync(path.join(REPO, d))) if (f.endsWith('.js')) out.push(d + '/' + f);
  return out;
}
const unesc = (lit) => { try { return new Function('return ' + lit)(); } catch { return null; } };
/** The keys a channels surface draws: t / tr / i18nKey literals + tc('ctx', '…') as ctx::…, + the Channels settings' words. */
function channelKeys() {
  const keys = new Map();   // key → the first file that draws it
  const add = (k, f) => { if (k && !keys.has(k)) keys.set(k, f); };
  const LIT = `('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*")`;
  for (const f of channelFiles()) {
    const s = read(f);
    for (const m of s.matchAll(new RegExp(`\\b(?:t|tr|i18nKey)\\(\\s*${LIT}`, 'g'))) add(unesc(m[1]), f);
    for (const m of s.matchAll(new RegExp(`\\btc\\(\\s*${LIT}\\s*,\\s*${LIT}`, 'g'))) add(`${unesc(m[1])}::${unesc(m[2])}`, f);
  }
  const schema = read('src/lib/settings-schema.js');
  for (const b of schema.matchAll(/^ {2}'channels\.[^']+': \{[\s\S]*?^ {2}\},?$/gm)) for (const m of b[0].matchAll(new RegExp(`\\bt\\(\\s*${LIT}`, 'g'))) add(unesc(m[1]), 'src/lib/settings-schema.js (channels.*)');
  return keys;
}
/** The whole zh dictionary's 线程 values that are NOT a channels word — each a different meaning, named. */
const NOT_CHANNELS = Object.freeze({
  'Showing only {kind} threads.': 'Codex sub-agent / review threads (the chat\'s thread filter)',
  'Sub-agent and review threads are listed too.': 'Codex sub-agent / review threads',
  'Each Codex session can pick its ChatGPT login (New Session dialog / card ⚙). Held in isolated logins, switchable per session; threads stay shared.': 'Codex threads',
  'The server is degraded — its main thread is saturated ({lag}ms median lag). Everything will feel slow; sessions are NOT dead.': 'a CPU thread (the event loop)',
  'Thread': 'collab-row.js: a Codex thread id (the channels meaning is tc(\'channel\', \'Thread\') = 话题)',
});
const AX_KEY_PREFIX = 'On: assistive tools see the messages near where you are reading';   // "浏览器 UI 线程" — a CPU thread
function zhCensus(zh, ja, keys) {
  const bad = [], badJa = [], unlisted = [];
  for (const [k, f] of keys) {
    const v = zh.get(k);
    if (typeof v === 'string' && v.includes('线程')) bad.push(`${k.slice(0, 60)} → ${v.slice(0, 40)} (${f})`);
    const j = ja.get(k);
    if (/thread/i.test(k) && !/Pub\/Sub/.test(k) && typeof j === 'string' && j.includes('トピック')) badJa.push(`${k.slice(0, 60)} → ${j.slice(0, 40)} (${f})`);
  }
  for (const [k, v] of zh) if (v.includes('线程') && !(k in NOT_CHANNELS) && !k.startsWith(AX_KEY_PREFIX)) unlisted.push(`${k.slice(0, 60)} → ${v.slice(0, 40)}`);
  return { bad, badJa, unlisted };
}
const ZH = dictOf(ZH_SRC), JA = dictOf(JA_SRC);
const KEYS = channelKeys();
const Z = zhCensus(ZH, JA, KEYS);
ok(KEYS.size >= 300 && KEYS.has('channel::Thread') && KEYS.has('in thread') && KEYS.has('Reply in thread') && KEYS.has('drafted a reply in a thread') && KEYS.has('Threads: seconds between two loads of one thread'), `the census reads the channels surfaces: ${KEYS.size} keys from ${channelFiles().length} files + the Channels settings (the pane title, the tag, the placement words, the touch row, the setting among them)`);
ok(Z.bad.length === 0, `no zh string a channels surface draws says 线程 — it says 话题${Z.bad.length ? ': ' + Z.bad.slice(0, 6).join(' | ') : ''}`, Z.bad);
ok(Z.unlisted.length === 0, `every other 线程 in the zh dictionary is a NAMED non-channel meaning (${Object.keys(NOT_CHANNELS).length} + the accessibility setting's browser UI thread)${Z.unlisted.length ? ': ' + Z.unlisted.slice(0, 6).join(' | ') : ''}`, Z.unlisted);
ok(Object.keys(NOT_CHANNELS).every((k) => ZH.has(k) && !KEYS.has(k)), 'NOT_CHANNELS names only real zh keys no channels surface draws (a retired or channel key is red)');
ok(Z.badJa.length === 0, `ja keeps ONE word for a thread — スレッド (Lark's own ja word); never トピック${Z.badJa.length ? ': ' + Z.badJa.slice(0, 4).join(' | ') : ''}`, Z.badJa);
{
  const zhT = ZH.get('channel::Thread'), jaT = JA.get('channel::Thread');
  const want = [['in thread', '话题'], ['Open the thread', '话题'], ['Reply in thread…', '话题'], ['Lands inside this thread', '话题'], ['Reply in thread', '话题'], ['drafted a reply in a thread', '话题'], ['This group does not allow replies in threads', '话题'], ['That message is inside a thread — a reply to it goes in the thread', '话题'], ['is in a thread I am in, or quotes a message of mine', '话题'], ['Quoted reply — to {author}: "{quote}"', '引用回复'], ['drafted a quoted reply', '引用回复']];
  const got = want.map(([k, w]) => [k, ZH.get(k) || null, (ZH.get(k) || '').includes(w)]);
  ok(zhT === '话题' && jaT === 'スレッド' && got.every((x) => x[2]), `the words: the pane title 话题 / スレッド; ${got.map((x) => `"${x[0]}" → ${x[1]}`).join(' · ')}`, J(got.filter((x) => !x[2])));
  const cli = read('data/bin/vibespace-channels'), man = read('docs/agent/channels-manual.md');
  ok(!/线程/.test(cli) && !/线程/.test(man), 'the agent CLI and its manual carry no 线程 (English; a zh word never rides them)');
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/i18n-check.mjs')], { encoding: 'utf8', cwd: REPO });
  const newKeys = ['channel::Thread', 'That message is not in a thread — a quoted reply is shown in the conversation itself', 'quoting a message not loaded', 'quoting a message in another chat', 'Show the quoted message'];
  const warnNew = newKeys.filter((k) => String(r.stderr).includes(k.slice(0, 40)));
  ok(r.status === 0 && /i18n check ok/.test(r.stdout) && warnNew.length === 0 && newKeys.every((k) => ZH.has(k) && JA.has(k)), `the build's i18n check passes (${String(r.stdout).trim()}) and the round's new keys are in both dictionaries with no parity warning`, r.stderr.slice(0, 400));
}

// ═══ ⑤ CONTROLS ═══════════════════════════════════════════════════════════════════════════════════
console.log('⑤ patched-copy controls');
{
  // (a) a classifier that calls a reply CHAIN a topic (the pre-ruling index read): the table goes red on every quote
  const A_LINE = "  return e && e.kind === 'vendor' ? e : null;";
  ok(MODEL_SRC.split(A_LINE).length === 2, 'CONTROL (a) setup: the topic test is one line');
  const Ta = M.load(MODEL, MODEL_SRC.replace(A_LINE, "  return e && e.kind !== 'conversation' ? e : null;"), 'chain-is-topic');
  const ra = judgeModel(Ta);
  const redA = ra.filter((r) => !(r.okKind && r.okPlace && r.okAgent)).map((r) => r.id);
  ok(QUOTE_ROWS.every((id) => redA.includes(id)), `CONTROL (a): a classifier that calls a reply chain a topic turns every quote row RED (${redA.join(', ')}) — the quote reads "topic-*" and its agent line "in thread"`, J(ra.filter((r) => QUOTE_ROWS.includes(r.id)).map((r) => ({ id: r.id, got: r.got, words: r.words.line }))));
  // (b) THE SHOT, reproduced: the pre-fix render PAIR — placeOf attaching the index entry's thread to every record
  //     (a chain included) + the pane's tag / chip without the classifier's check
  const B_LINE = '  const e = c.topic ? idx.threads.get(c.topic) : null;';
  const B_ISROOT = "  if (e) thread = { key: e.key, count: e.count, lastAt: e.lastAt, isRoot: c.kind === 'topic-root', kind: e.kind, root: e.root };";
  ok(MODEL_SRC.split(B_LINE).length === 2 && MODEL_SRC.split(B_ISROOT).length === 2, 'CONTROL (b) setup: placeOf\'s thread lookup is one line each');
  const Tb = M.load(MODEL, MODEL_SRC.replace(B_LINE, "  const k0 = idx.byRecord.get(vid(rec)); const e0 = k0 ? idx.threads.get(k0) : null; const e = e0 && e0.kind !== 'conversation' ? e0 : null;").replace(B_ISROOT, '  if (e) thread = { key: e.key, count: e.count, lastAt: e.lastAt, isRoot: e.root === vid(rec), kind: e.kind, root: e.root };'), 'prefix-placeof');
  const P_CHIP = '  if (!th || !th.isRoot || !isTopicPlace(place)) return null;';
  const P_TAG = "  if (!th || th.isRoot || th.kind === 'conversation' || !isTopicPlace(place) || place.kind === 'topic-root') return null;";
  ok(PANE_SRC.split(P_CHIP).length === 2 && PANE_SRC.split(P_TAG).length === 2, 'CONTROL (b) setup: the pane\'s chip and tag checks are one line each');
  const Pb = await import(pathToFileURL(M.write(PANE_PATH, PANE_SRC.replace(P_CHIP, '  if (!th || !th.isRoot) return null;').replace(P_TAG, "  if (!th || th.isRoot || th.kind === 'conversation') return null;"), 'prefix-pane')).href);
  const pair = judgeRender(Pb, Tb);
  const q2 = pair.find((r) => r.id === 'om_q2'), pr = pair.find((r) => r.id === 'om_p');
  ok(q2 && !q2.ok && q2.d.tag && pr && !pr.ok && pr.d.chip, `CONTROL (b): the pre-fix pair reproduces the shot — the quote om_q2 wears the "in thread" tag (opens ${q2 && q2.d.opens.join()}) and the plain message it quotes grows a topic chip — the rows above would be red`, J({ q2: q2 && q2.d, p: pr && pr.d }));
  // …and each layer ALONE still holds (the render's own check under a lying model; the model under a check-less pane)
  const layerPane = judgeRender(Pane, Tb).filter((r) => QUOTE_ROWS.includes(r.id) || r.id === 'om_p');
  const layerModel = judgeRender(Pb, T).filter((r) => QUOTE_ROWS.includes(r.id) || r.id === 'om_p');
  ok(layerPane.every((r) => !r.d.tag && !r.d.chip) && layerModel.every((r) => !r.d.tag && !r.d.chip), 'each layer alone holds: the REAL pane under the lying placeOf draws no tag / chip on a quote (it reads the kind), and the pre-fix pane under the REAL placeOf draws none either (no thread fact)');
  // (c) the ENGINE's parent fact on its own rule (the index entry, a chain counted): --to on a quote defaults INTO a thread
  const engSrc = fs.readFileSync(ENG_PATH, 'utf-8');
  const C_LINE = '        parentKey = Thr.placeKindOf(String(v.proposal.replyTo), ix).topic;';
  ok(engSrc.split(C_LINE).length === 2, 'CONTROL (c) setup: the engine\'s parent fact is one line');
  const Ec = M.load('src/server/channels-engine.js', engSrc.replace(C_LINE, "        parentKey = ix.byRecord.get(String(v.proposal.replyTo)) || null; if (parentKey && ix.threads.get(parentKey).kind === 'conversation') parentKey = null;"), 'own-parent-rule');
  const Rc = await engineLeg(Ec, 'ctl-c');
  ok(['om_q', 'om_q2', 'om_p'].every((id) => /^thread:parent-in-thread/.test(Rc.defaults[id])), `CONTROL (c): an engine judging the parent by its own rule files --to on a QUOTE into a thread (${['om_q', 'om_q2', 'om_p'].map((id) => `${id} ${Rc.defaults[id]}`).join(', ')}) — the card would say "in thread" for Lark's plain reply`, J(Rc.defaults));
  // (d) the walk without its refusal: a quote's "thread" is handed to the vendor (Lark would answer a message id with an error — a wasted metered call)
  const D_LINE = "    if (!tk.key && tk.quote && vendorNamed !== true) return { ok: false, code: 'not-a-thread', error: NOT_A_THREAD, walked: false };";
  const D_KEY = '    const key = tk.key || (vendorNamed === true ? id : null);';
  ok(engSrc.split(D_LINE).length === 2 && engSrc.split(D_KEY).length === 2, 'CONTROL (d) setup: the walk\'s refusal and key are one line each');
  const Ed = M.load('src/server/channels-engine.js', engSrc.replace(D_LINE, '').replace(D_KEY, '    const key = tk.key || (tk.quote ? (ix.byRecord.get(id) || id) : null) || (vendorNamed === true ? id : null);'), 'walk-a-quote');
  const Rd = await engineLeg(Ed, 'ctl-d');
  ok(Rd.walkQuote.calls >= 1 && Rd.walkQuote.code !== 'not-a-thread', `CONTROL (d): without the refusal the walk of a quote reaches the vendor (${Rd.walkQuote.calls} threadHistory call(s)) — the zero-call row above would be red`, J(Rd.walkQuote));
  // (e) the census: one planted 线程 in a channel string, one in an unlisted key, one トピック in ja
  const plantZh = new Map(ZH); plantZh.set('in thread', '在线程中');
  const plantUn = new Map(ZH); plantUn.set('No replies yet.', '这个线程还没有回复。');
  const plantJa = new Map(JA); plantJa.set('Open the thread', 'トピックを開く');
  const e1 = zhCensus(plantZh, JA, KEYS), e2 = zhCensus(plantUn, JA, KEYS), e3 = zhCensus(ZH, plantJa, KEYS);
  ok(e1.bad.length === 1 && /^in thread → 在线程中/.test(e1.bad[0]) && e3.badJa.length === 1 && /^Open the thread → トピック/.test(e3.badJa[0]), `CONTROL (e): one planted 线程 in a channel string is RED ("${e1.bad[0]}"), one planted トピック in ja is RED ("${e3.badJa[0]}")`, J({ e1, e3 }));
  ok(e2.bad.length === 1 && e2.unlisted.some((x) => /^No replies yet\./.test(x)), 'CONTROL (e\'): a planted 线程 in a key no allowlist names is RED twice (a channel string AND an unlisted 线程)', J(e2));
  for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 5, label: 'chanquote: ' })) ok(row.pass, row.name, row.detail);
}

delete globalThis.document;
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
