#!/usr/bin/env node
// THE FIRST SCREEN LISTS WHAT MATTERS (R3, 2026-09-26 — the owner on the
// aggregated-IM release, "879 个群 · 0 条未读": "开头不要把所有消息都放进来，很多是
// 没用的，建议只放重要消息/conversation（比如推送给agent了的，或者某个agent刚刚读取
// 了的），并展示一个小tag表示状态。"; design docs/design-communication-panel.zh.md §23;
// gate row `test-channels-focus`, fast).
//
//   ① PURE src/lib/channel-focus.js over a fixture index: every "matters" rule
//     (awaiting · unknown · assigned on its OWN · a pattern / account grain only
//     once a wake was DELIVERED in 24 h or is held (D4, 2026-09-27) · read in
//     24 h · new since the read · held · replied in 24 h), the ONE-tag priority
//     table, the 24 h edge (exclusive), the held window (the wake ledger's 7
//     days; a STASHED wake is not held), agent groups always / archived never,
//     the header's two counts, the filter and "{n} more in All"
//   ② THE SPEC'S FIXTURE through the REAL engine: 50 conversations, 5
//     hand-overs — 3 of ONE conversation each, the whole ACCOUNT and a RULE
//     (11 conversations) — 3 read by an agent through the agent route's
//     readFor, 1 proposal awaiting the owner ⇒ EXACTLY 7 on the first screen
//     (the 47 conversations the account / the rule cover are NOT listed);
//     one DELIVERED wake at each scope grain ⇒ 9, "9 need attention" / "All 50"
//   ③ THE SERVER'S FACTS: the agent read is STAMPED (who / when / up to which
//     record) in the index, said in ONE partial broadcast of that row, never
//     for a hidden read, re-stamped at most once a minute for the same tail,
//     five principals at most; the wake names whom it reached (and a held one
//     says so); the owner's own newest message (a record `isSelf`, a sent
//     proposal of the owner's, the one-shot derivation for rows that predate
//     the field); an untouched row stays slim (`touch: null`)
//   ④ THE WORDS in en / zh / ja (an injected translator, the e2e's `tFor`):
//     the header, every tag — the agent's name a SEPARATE part — and its tone
//   ⑤ NEGATIVE CONTROLS (scripts/mutant-copy.mjs, scratch copies): an
//     inclusive 24 h edge, "read" ranked above "assigned", a focus list that
//     keeps every row, a rule with the GRAIN check removed (every conversation
//     of a handed-over account returns), a delivered wake with no window, an
//     engine that stamps BEFORE the reach check
//   ⑥ WIRING PINS: the panel draws firstScreen + statusTag + statusTagParts,
//     the tag through channel-chrome's el() (no innerHTML), the header switch
//     and the filter; the agent route's readFor is the stamp's only door
//   ⑦ THE R3 × R4 SEAM (2.369.191, backlog B-adb7 (a)): a DIGEST watcher's
//     hits wait on the conversation until its window closes — while the window
//     is open the row is neither "held" nor listed for it; closed with the hits
//     still pending it is held (amber). PURE `heldPending` over the engine's
//     per-principal `touch.pendingFor` + the row's R4 `watchers` (a table: the
//     open / closed / edge window, a wake watcher, a mixed pair, an orphan, a
//     legacy hit, an older server), the REAL engine (setAccess + setWatchers,
//     a digest hit pending ⇒ untagged; 61 min later ⇒ held), two patched
//     copies as controls (the pre-seam total; statusTag without the watchers)
//
// Zero vendor calls; per-pid scratch dirs (scripts/scratch.mjs).
// Run: node scripts/test-channels-focus.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FOCUS_PATH = path.join(REPO, 'src/channel-focus.js');   // design 008: the predicate moved to the shared tier (src/lib/channel-focus.js re-exports it)
const Fo = await import(pathToFileURL(FOCUS_PATH).href);
const V = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-groups-view.js')).href);
const Wd = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-words.js')).href);
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const REC = require(path.join(REPO, 'src/channel-record.js'));
const FOCUS_SRC = fs.readFileSync(FOCUS_PATH, 'utf-8');
const ENGINE_SRC = engineSource(REPO);

const ROOT = scratch('chan-focus');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() {}, warn() {}, error() {} };
const MUT = mutantCopies('chan-focus', REPO);
// design 008: `digest()` is the FIRST READ (bounded); a leg that reads EVERY row asks for every key (the old whole list)
const wholeOf = (e) => e.digest({ keys: Object.keys(e.store.index.live()) });

const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);
const H = 3600e3, D = 24 * H;
const ADAPTERS = [{ id: 'lark', kind: 'lark', label: 'Lark' }, { id: 'gmail', kind: 'gmail', label: 'Gmail' }, { id: 'agents', kind: 'agents', label: 'Agents', builtin: true }];
/** A digest row as rowView sends it (only the fields the first screen reads). */
const row = (id, extra = {}) => ({ key: `lark/${id}`, id, adapterId: 'lark', adapterLabel: 'Lark', title: `Room ${id}`, lastAt: NOW - 5 * 60e3, lastText: 'hi', unread: 0, outbox: { awaiting: 0, unknown: 0 }, assignment: null, touch: null, ...extra });
const principal = (name, source = 'conversation') => ({ principal: { kind: 'agent', id: `cid-${name}`, name }, source });

// ═══ ① PURE ═══════════════════════════════════════════════════════════════
console.log('① channel-focus (PURE): the rules, the ONE tag, the edges');
/** THE FIXTURE INDEX: one row per rule (+ the controls), [row, expected tag code | null]. */
const FIXTURE = [
  [row('awaiting', { outbox: { awaiting: 2, unknown: 0 } }), 'awaiting'],
  [row('unknown', { outbox: { awaiting: 0, unknown: 1 } }), 'unknown'],
  [row('conv-grain', { assignment: principal('Alpha') }), 'assigned'],
  // D4 (2026-09-27): a SCOPE grain lists a conversation only once it acted on it — a wake DELIVERED within 24 h, or a held one
  ...['account', 'pattern'].flatMap((g) => {
    const who = g === 'account' ? 'Ops desk' : 'Beta';
    return [
      [row(`${g}-no-wake`, { assignment: principal(who, g) }), null],
      [row(`${g}-held`, { assignment: principal(who, g), touch: { pending: 2 } }), 'assigned'],
      [row(`${g}-refused`, { assignment: principal(who, g), touch: { wake: { at: NOW - H, ok: false, lane: 'none', n: 1, name: who } } }), 'assigned'],
      [row(`${g}-woke-1h`, { assignment: principal(who, g), touch: { wake: { at: NOW - H, ok: true, lane: 'message', n: 1, name: who } } }), 'assigned'],
      [row(`${g}-woke-25h`, { assignment: principal(who, g), touch: { wake: { at: NOW - 25 * H, ok: true, lane: 'message', n: 1, name: who } } }), null],
      [row(`${g}-woke-edge`, { assignment: principal(who, g), touch: { wake: { at: NOW - D, ok: true, lane: 'message', n: 1, name: who } } }), null],
      [row(`${g}-stashed`, { assignment: principal(who, g), touch: { wake: { at: NOW - H, ok: false, lane: 'stash', n: 1, name: who } } }), null],
      [row(`${g}-read`, { assignment: principal(who, g), touch: { read: { id: 'cid-g', name: 'Gamma', at: NOW - H, upTo: NOW } } }), 'read'],
    ];
  }),
  [row('read-1h', { touch: { read: { id: 'cid-g', name: 'Gamma', at: NOW - H, upTo: NOW - 5 * 60e3 } } }), 'read'],
  [row('new-since', { lastAt: NOW - 60e3, touch: { read: { id: 'cid-g', name: 'Gamma', at: NOW - H, upTo: NOW - 2 * H } } }), 'new-since-read'],
  // lane channel-self-unread: the OWNER's own message as the newest (`touch.selfAt` = lastAt) is never news since a read;
  // a peer's message after it is
  [row('self-newest', { lastAt: NOW - 60e3, touch: { selfAt: NOW - 60e3, read: { id: 'cid-g', name: 'Gamma', at: NOW - H, upTo: NOW - 2 * H } } }), 'read'],
  [row('peer-after-self', { lastAt: NOW - 30e3, touch: { selfAt: NOW - 60e3, read: { id: 'cid-g', name: 'Gamma', at: NOW - H, upTo: NOW - 2 * H } } }), 'new-since-read'],
  [row('read-edge-in', { touch: { read: { name: 'Gamma', at: NOW - D + 1, upTo: NOW } } }), 'read'],
  [row('read-edge-out', { touch: { read: { name: 'Gamma', at: NOW - D, upTo: NOW } } }), null],
  [row('held-pending', { touch: { pending: 3 } }), 'held'],
  [row('held-wake-none', { touch: { wake: { at: NOW - 2 * D, ok: false, lane: 'none', n: 1, name: 'Alpha' } } }), 'held'],
  [row('held-refusal', { touch: { wake: { at: NOW - 3 * D, ok: true, lane: 'message' }, refusalAt: NOW - D } }), 'held'],
  [row('stashed-not-held', { touch: { wake: { at: NOW - H, ok: false, lane: 'stash', n: 1, name: 'Alpha' } } }), null],
  [row('held-too-old', { touch: { refusalAt: NOW - 8 * D } }), null],
  [row('delivered-wake-only', { touch: { wake: { at: NOW - H, ok: true, lane: 'message', n: 2, name: 'Alpha' } } }), null],
  [row('replied', { touch: { selfAt: NOW - 3 * H } }), 'replied'],
  [row('replied-edge-out', { touch: { selfAt: NOW - D } }), null],
  [row('untouched'), null],
  [row('unread-only', { unread: 7 }), null],
  // lane lark-search-poll (owner decision 1): a SINGLE chat with unread messages, its newest inside 24 h — "单聊 · N 条新消息";
  // a catch-up birth (read, unread 0) or an old one stays off the first screen; a GROUP with unread stays off it too
  [row('direct', { kind: 'dm', unread: 2, lastAt: NOW - H }), 'direct'],
  [row('direct-read', { kind: 'dm', unread: 0, lastAt: NOW - H }), null],
  [row('direct-old', { kind: 'dm', unread: 3, lastAt: NOW - D }), null],
  [row('group-unread', { kind: 'group', unread: 3, lastAt: NOW - H }), null],
  [row('direct-but-held', { kind: 'dm', unread: 1, lastAt: NOW - H, touch: { pending: 1 } }), 'held'],
  [row('direct-over-replied', { kind: 'dm', unread: 1, lastAt: NOW - H, touch: { selfAt: NOW - 2 * H } }), 'direct'],
];
{
  for (const [r, want] of FIXTURE) {
    const got = Fo.statusTag({ kind: 'conv', conv: r }, NOW);
    ok((got ? got.code : null) === want, `statusTag ${r.id} → ${want || 'none (not on the first screen)'}`, JSON.stringify(got));
  }
  // lane channel-self-unread (userW inc-muxekkry-clfb): THE PURE RULE every counter asks
  const own = { at: 200, author: { id: 'ou_o', isSelf: true } }, peer = (at) => ({ at, author: { id: 'ou_w', isSelf: false } });
  const unresolved = { at: 300, author: { id: 'ou_o' } };
  ok(Fo.selfRead(own) && !Fo.selfRead(peer(1)) && !Fo.selfRead(unresolved) && Fo.selfRead(unresolved, 'ou_o') && !Fo.selfRead(unresolved, '') && !Fo.selfRead(null), 'selfRead: `isSelf`, or the RESOLVED own id; unknown self-ness is not self (never a guess)');
  const ra = Fo.readAdvance(100, [peer(150), own, peer(250)]);
  ok(ra.readAt === 200 && ra.unread === 1 && ra.moved, 'readAdvance: the owner\'s message moves the read line to its instant; only the peer\'s LATER message counts', JSON.stringify(ra));
  const rb = Fo.readAdvance(100, [peer(150), unresolved]);
  ok(rb.readAt === 100 && rb.unread === 2 && !rb.moved, 'readAdvance: no self record ⇒ the line stays and every record past it counts (as before)', JSON.stringify(rb));
  ok(Fo.readAdvance(500, [own]).moved === false && Fo.readAdvance(500, [own]).unread === 0, 'readAdvance: a self record older than the line moves nothing and adds 0');
  // THE PRIORITY: a row that holds EVERY fact, then each dropped in turn
  const all = { outbox: { awaiting: 1, unknown: 1 }, assignment: principal('Alpha'), lastAt: NOW, touch: { read: { name: 'Gamma', at: NOW - H, upTo: NOW - 2 * H }, pending: 2, selfAt: NOW - H } };
  const steps = [];
  let cur = row('everything', JSON.parse(JSON.stringify(all)));
  const peel = [(x) => { x.outbox.awaiting = 0; }, (x) => { x.outbox.unknown = 0; }, (x) => { x.assignment = null; }, (x) => { x.lastAt = NOW - 3 * H; }, (x) => { x.touch.read = null; }, (x) => { x.touch.pending = 0; }, (x) => { x.touch.selfAt = 0; }];
  steps.push(Fo.statusTag(cur, NOW).code);
  for (const p of peel) { p(cur); const t2 = Fo.statusTag(cur, NOW); steps.push(t2 ? t2.code : null); }
  const WANT = ['awaiting', 'unknown', 'assigned', 'new-since-read', 'read', 'held', 'replied', null];
  ok(JSON.stringify(steps) === JSON.stringify(WANT), `THE ONE TAG, by priority: ${WANT.map(String).join(' › ')}`, JSON.stringify(steps));
  ok(JSON.stringify(Fo.TAG_ORDER) === JSON.stringify(['awaiting', 'unknown', 'assigned', 'read', 'new-since-read', 'held', 'direct', 'replied']), 'TAG_ORDER is the documented table (read / new-since-read are ONE fact split by what arrived after it; `direct` — a single chat with unread messages — after held, before replied)');
  const dTag = Wd.statusTagParts({ code: 'direct', n: 3 }, { now: NOW });
  ok(dTag && dTag.before === 'DM · 3 new' && dTag.tone === 'attn' && /single chat/.test(dTag.title), 'the direct tag\'s words: "DM · 3 new" (zh 单聊 · 3 条新消息, ja 個別 · 新着 3 件 — the tag\'s width budget lives in its words)', JSON.stringify(dTag));
  const heldAssigned = Fo.statusTag(row('x', { assignment: principal('Alpha'), touch: { pending: 1 } }), NOW);
  ok(heldAssigned.code === 'assigned' && heldAssigned.held === true && heldAssigned.name === 'Alpha', 'an ASSIGNED row whose wake is held keeps its "→ Alpha" tag, flagged held (amber) — so the held fact is never hidden by the higher tag');
  const woke = (g) => Fo.statusTag(row('x', { assignment: principal('Ops desk', g), touch: { wake: { at: NOW - H, ok: true, lane: 'message', n: 1 } } }), NOW);
  ok(woke('account').grain === 'account' && woke('pattern').grain === 'pattern' && woke('account').held === false, 'a woken scope-grain row\'s tag knows the grain it came from (the tooltip says "with the whole account" / "by a rule")');
  ok(Fo.statusTag(row('x', { assignment: principal('Ops desk', 'account'), touch: { pending: 1 } }), NOW).held === true, '…and a held one is the amber "→ Ops desk", as for a conversation of its own');
  ok(Fo.statusTag(row('x', { assignment: principal('Ops desk', 'account'), touch: { wake: { at: NOW - H, ok: true, lane: 'message' }, read: { name: 'Gamma', at: NOW - 2 * H, upTo: NOW } } }), NOW).code === 'assigned' && Fo.statusTag(row('x', { assignment: principal('Ops desk', 'account'), touch: { wake: { at: NOW - 25 * H, ok: true, lane: 'message' }, read: { name: 'Gamma', at: NOW - 2 * H, upTo: NOW } } }), NOW).code === 'read', 'an account-grain row an agent read wears "→ Ops desk" while its delivered wake is inside the day, then falls through to the read tag');
  // the list: groups always, archived never; the conversations that wear a tag
  const groups = [{ id: 'g-00000001', name: 'lane', lastAt: NOW - 10 * D, members: [{ member: 'a' }, { member: 'b' }] }, { id: 'g-00000002', name: 'old', lastAt: NOW - 20 * D, archivedAt: NOW - 19 * D, members: [] }];
  const { rows } = V.groupListRows({ groups, conversations: FIXTURE.map(([r]) => r), adapters: ADAPTERS });
  const focus = Fo.focusRows(rows, NOW);
  const want = new Set(['groups/g-00000001', ...FIXTURE.filter(([, w]) => w).map(([r]) => r.key)]);
  ok(focus.length === want.size && focus.every((r) => want.has(r.key)), `focusRows = every non-archived agent group + every conversation wearing a tag (${focus.length} of ${rows.length})`, JSON.stringify(focus.map((r) => r.key)));
  ok(focus.map((r) => r.key).join() === rows.filter((r) => want.has(r.key)).map((r) => r.key).join(), '…in the SAME activity order as the full list (the IM order)');
  const fs1 = Fo.firstScreen(rows, { view: 'focus', now: NOW });
  ok(fs1.focus === want.size && fs1.all === rows.length && fs1.shown.length === want.size && fs1.view === 'focus', 'firstScreen: the default view is the attention list; the header counts are the two WHOLE lists');
  const fs2 = Fo.firstScreen(rows, { view: 'all', now: NOW });
  ok(fs2.shown.length === rows.length && fs2.focus === fs1.focus, 'the All view is the whole list; the counts do not change with the view');
  const fs3 = Fo.firstScreen(rows, { view: 'focus', q: 'room un', now: NOW });
  ok(fs3.shown.map((r) => r.id).join() === 'unknown' && fs3.moreInAll === 2 && fs3.focus === fs1.focus, 'the filter narrows the view (title / source / last line) and the focus view counts the matches OUTSIDE it ("2 more in All": untouched, unread-only)', JSON.stringify({ shown: fs3.shown.map((r) => r.id), more: fs3.moreInAll }));
  const fs4 = Fo.firstScreen(rows, { view: 'all', q: 'LARK', now: NOW });
  ok(fs4.shown.length === FIXTURE.length && fs4.moreInAll === 0, 'the filter matches the source label, case-insensitively; the All view never offers "more in All"');
  ok(Fo.focusRows(rows, NOW).every((r) => !r.archived), 'an archived group never reaches the attention list');
}

// ═══ ② the spec's fixture through the real engine ═════════════════════════
console.log('② 50 conversations, 5 hand-overs (3 of one conversation, the account, a rule), 3 read, 1 awaiting ⇒ 7; one delivered wake per scope grain ⇒ 9');
let clock = NOW;
const now = () => clock;
function worldModule(kind, W) {
  return {
    kind,
    caps: { ...fake.fakePoll.caps, receive: 'poll', attachments: 'fetch', olderHistory: 'page', budget: { unit: 'request', default: 100000, settingKey: null, metered: true } },
    create(record, deps) {
      const meter = deps.meter || (() => {});
      const rec = (id, m) => REC.makeRecord({ adapterId: record.id, convId: id, vendorId: m.vendorId, at: m.at, author: m.author, text: m.text, attachments: [], threadKey: id, raw: {} });
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations() { meter(1); return { conversations: [...W.convs.values()].map((x) => REC.makeConversation({ id: x.id, title: x.title, kind: 'group', lastAt: x.recs.length ? x.recs[x.recs.length - 1].at : null })), cursor: null, complete: true }; },
        async convCaps() { meter(1); return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
        async history(id, { anchor = null, limit = 50 } = {}) {
          meter(1);
          const x = W.convs.get(id);
          const idx = anchor ? x.recs.findIndex((m) => m.vendorId === anchor) + 1 : 0;
          const pending = x.recs.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page.map((m) => rec(id, m)), anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: drained, complete: drained };
        },
        async older() { meter(1); return { records: [], exhausted: true }; },
      };
    },
  };
}
function makeWorld(n) {
  const convs = new Map();
  for (let i = 0; i < n; i++) {
    const id = `c${String(i).padStart(2, '0')}`;
    convs.set(id, { id, title: `Room ${i}`, recs: [0, 1].map((k) => ({ vendorId: `${id}-m${k}`, at: clock - (i + 1) * 60e3 + k * 1000, author: { id: 'u1', name: 'Ada', isSelf: false, isBot: false }, text: `line ${k} of ${i}` })) });
  }
  return { convs };
}
function seed(dataDir, id, kind) {
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id, kind, label: id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: true, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null }] }));
}
async function engine(name, W, { engineMod = ENG, deliver = null, sessions = [] } = {}) {
  const registry = CH.createChannelRegistry();
  registry.register(worldModule('im', W));
  const dataDir = path.join(ROOT, name);
  seed(dataDir, 'im', 'im');
  const events = [];
  const eng = engineMod.create({ dataDir, registry, env: {}, now, broadcast: (m) => events.push(m), serverSetting: () => undefined, liveSessions: () => sessions, deliver, log: quiet });
  await eng.pass('im', { force: true });
  return { eng, events, dataDir };
}
const agent = (id, name) => ({ kind: 'agent', id, name, groups: [], msgLevelFor: () => 'none' });
/** Wait for the stamp's index write (fire-and-forget) — the index's ONE door is a promise chain. */
const drainIndex = async (eng) => { await eng.store.index.update(() => {}); await sleep(5); };
/** ②'s digest rows at ②'s clock — ⑤'s grain control re-reads the SAME rows through its patched copy. */
let SPEC = null;
{
  const W = makeWorld(50);
  const delivered = [];
  const deliver = { async deliverToConversation(cid, text, opts) { delivered.push({ cid, text, opts }); return { ok: true, lane: 'message' }; } };
  const sessions = [{ cid: 'cid-ops', name: 'Ops desk', groups: [] }, { cid: 'cid-beta', name: 'Beta', groups: [] }];
  const { eng } = await engine('fifty', W, { deliver, sessions });
  const ids = [...W.convs.keys()];
  // FIVE HAND-OVERS: three conversations of their own …
  const assigned = [ids[3], ids[11], ids[20]];
  for (const [k, id] of assigned.entries()) {
    const r = await eng.setAssignment('im', id, { principal: { kind: 'agent', id: `cid-a${k}`, name: `Agent ${k}` }, mode: 'all' });
    if (!r.ok) console.log('    setAssignment', JSON.stringify(r));
  }
  // … the whole ACCOUNT, and a RULE (title contains "Room 4": Room 4 + Room 40–49 = 11 conversations)
  const ra = await eng.setScopeAssignment('im', { kind: 'account' }, { principal: { kind: 'agent', id: 'cid-ops', name: 'Ops desk' }, mode: 'all', notify: 'wake' });
  const rp = await eng.setScopeAssignment('im', { kind: 'pattern' }, { principal: { kind: 'agent', id: 'cid-beta', name: 'Beta' }, mode: 'all', notify: 'wake', pattern: { match: 'any', rules: [{ kind: 'title', value: 'Room 4' }] } });
  ok(ra.ok && rp.ok, 'FIXTURE: the account and the rule are handed over (setScopeAssignment)', JSON.stringify({ ra: ra.ok || ra, rp: rp.ok || rp }));
  const readers = [ids[5], ids[15], ids[25]];
  const R = agent('cid-reader', 'Reader');
  for (const id of readers) await eng.setReach('im', id, { principal: { kind: 'agent', id: 'cid-reader', name: 'Reader' }, level: 'visible' });
  for (const id of readers) ok(eng.readFor(R, 'im', id, {}).ok, `FIXTURE: the agent reads ${id} through readFor (the agent route's door)`);
  await drainIndex(eng);
  const awaitingId = ids[40];
  await eng.store.outbox.update((ob) => { ob.proposals = ob.proposals || {}; ob.proposals['p-fixture'] = { id: 'p-fixture', key: `im/${awaitingId}`, adapterId: 'im', convId: awaitingId, state: 'awaiting-approval', text: 'draft', draftedBy: { kind: 'agent', id: 'cid-a9' }, at: clock, updatedAt: clock }; });
  const screen = () => {
    const d = wholeOf(eng);
    const { rows } = V.groupListRows({ groups: [], conversations: d.conversations, adapters: d.adapters });
    return { d, rows, fs: Fo.firstScreen(rows, { now: clock }) };
  };
  const tagsOf = (fs0) => Object.fromEntries(fs0.shown.map((r) => [r.id, Fo.statusTag(r, clock)]));
  const { d, fs: fs1 } = screen();
  {
    const f = eng.digest();   // design 008: the FIRST READ — one pass, a rowView only for a candidate or a head
    const keysOf = (xs) => JSON.stringify(xs.map((x) => x.key).sort());
    ok(f.scope === 'first' && f.attention.total === 7 && keysOf(f.conversations.filter((c) => Fo.statusTag(c, clock))) === keysOf(fs1.shown), `design 008: the FIRST READ carries the same 7 attention rows, key for key (attention ${JSON.stringify(f.attention)}, ${f.conversations.length} rows with the heads)`);
  }
  ok(d.conversations.length === 50, 'the digest lists all 50 conversations');
  const grains = d.conversations.reduce((m, c) => { const g = c.assignment ? c.assignment.source : 'none'; m[g] = (m[g] || 0) + 1; return m; }, {});
  ok(grains.conversation === 3 && grains.pattern === 11 && grains.account === 36 && !grains.none, `every one of the 50 is handed over: 3 on their own, 11 by the rule, 36 by the account (${JSON.stringify(grains)})`);
  const got = tagsOf(fs1);
  const want = { ...Object.fromEntries(assigned.map((id) => [id, 'assigned'])), ...Object.fromEntries(readers.map((id) => [id, 'read'])), [awaitingId]: 'awaiting' };
  ok(fs1.shown.length === 7 && Object.keys(want).every((id) => got[id] && got[id].code === want[id]), `EXACTLY 7 on the first screen — 3 handed over on their own, 3 read, 1 awaiting (${fs1.shown.length}: ${Object.entries(got).map(([k, v]) => `${k}=${v.code}`).join(' ')})`);
  ok(fs1.focus === 7 && fs1.all === 50 && d.conversations.filter((c) => c.assignment && c.assignment.source !== 'conversation' && !got[c.id]).length === 43, 'D4: the 47 conversations the ACCOUNT and the RULE cover are NOT listed for that alone (43 of them nowhere; the 3 read + 1 awaiting are listed for their OWN fact)');
  ok(assigned.every((id, k) => got[id].name === `Agent ${k}`) && readers.every((id) => got[id].name === 'Reader'), '…each tag naming its agent (→ Agent k / Reader read …)');
  // ONE DELIVERED WAKE at each scope grain: a new message in Room 30 (the account's) and Room 44 (the rule's)
  const woken = [ids[30], ids[44]];
  clock += 31e3;
  for (const id of woken) W.convs.get(id).recs.push({ vendorId: `${id}-news`, at: clock - 500, author: { id: 'u2', name: 'Brook', isSelf: false, isBot: false }, text: 'news' });
  for (const id of woken) await eng.refresh('im', id);
  await eng.settleWakes();
  const { d: d2, rows, fs: fs2 } = screen();
  const got2 = tagsOf(fs2);
  const w30 = d2.conversations.find((c) => c.id === ids[30]), w44 = d2.conversations.find((c) => c.id === ids[44]);
  // R4 (2.369.191 merge): another principal's rows never mask A's — Room 44 is the RULE's (Beta) AND still the
  // ACCOUNT's (Ops desk), so its new message wakes BOTH; Room 30 wakes Ops desk alone ⇒ 3 deliveries, never 2
  const byCid = delivered.reduce((m, x) => { m[x.cid] = (m[x.cid] || 0) + 1; return m; }, {});
  ok(delivered.length === 3 && byCid['cid-ops'] === 2 && byCid['cid-beta'] === 1 && w30.touch.wake.ok === true && w30.touch.wake.lane === 'message' && w44.touch.wake.ok === true, `FIXTURE: every wake was DELIVERED by the ladder — Room 30 → Ops desk; Room 44 → Beta (the rule) AND Ops desk (the account, R4: never masked) (${delivered.length}: ${delivered.map((x) => x.cid).join(', ')})`, JSON.stringify([w30.touch, w44.touch]));
  ok(fs2.shown.length === 9 && got2[ids[30]] && got2[ids[30]].code === 'assigned' && got2[ids[30]].grain === 'account' && got2[ids[30]].name === 'Ops desk' && got2[ids[44]] && got2[ids[44]].code === 'assigned' && got2[ids[44]].grain === 'pattern' && got2[ids[44]].name === 'Beta', `a DELIVERED wake lists its conversation: 9 — "→ Ops desk" (account) on Room 30, "→ Beta" (rule) on Room 44 (${Object.entries(got2).map(([k, v]) => `${k}=${v.code}${v.grain && v.grain !== 'conversation' ? `/${v.grain}` : ''}`).join(' ')})`);
  ok(fs2.focus === 9 && fs2.all === 50, `the header: "${Wd.viewSwitchText(fs2, { t: (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => p[k]) }).focus}" / "${Wd.viewSwitchText(fs2, { t: (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => p[k]) }).all}"`);
  ok(Fo.firstScreen(rows, { view: 'all', now: clock }).shown.length === 50, 'the All switch shows all 50');
  // 25 h later the reads AND the delivered wakes have left; the 3 hand-overs of their own and the proposal stay
  const later = Fo.firstScreen(rows, { now: clock + 25 * H });
  ok(later.focus === 4 && [...readers, ...woken].every((id) => !later.shown.some((r) => r.id === id)), 'a day later the three agent reads and the two delivered wakes have left the attention list; the 3 conversations handed over on their own and the awaiting proposal stay (4)', String(later.focus));
  const slim = d2.conversations.filter((c) => ![...readers, ...woken].includes(c.id));
  ok(slim.length === 45 && slim.every((c) => c.touch === null), 'every untouched row carries `touch: null` — the 45 rows nothing touched stay the slim row (a hand-over is not a touch)');
  SPEC = { rows, clock };
  eng.stop();
}

// ═══ ③ the server's facts ═════════════════════════════════════════════════
console.log('③ the stamp, the wake\'s name, the owner\'s own message');
{
  const W = makeWorld(3);
  // the owner's own message in c01 (isSelf) — a record the vendor marks as the authorizing user's
  const SELF_AT = clock - 30e3;
  W.convs.get('c01').recs.push({ vendorId: 'c01-self', at: SELF_AT, author: { id: 'me', name: 'Me', isSelf: true, isBot: false }, text: 'on it' });
  const delivered = [];
  const deliver = { async deliverToConversation(cid, text, opts) { delivered.push({ cid, text, opts }); return W.refuse ? { ok: false, reason: 'the spend guard said no', refused: 'spend' } : { ok: true, lane: 'message' }; } };
  const { eng, events } = await engine('facts', W, { deliver, sessions: [{ cid: 'cid-alpha', name: 'Alpha', groups: [] }] });
  const K = 'im/c00';
  // the stamp
  await eng.setReach('im', 'c00', { principal: { kind: 'agent', id: 'cid-r1', name: 'Reader One' }, level: 'visible' });
  const e0 = events.length;
  const r1 = eng.readFor(agent('cid-r1', 'Reader One'), 'im', 'c00', {});
  await drainIndex(eng);
  const en = eng.store.index.peek(K);
  const newest = eng.store.readTail('im', 'c00', { limit: 1 })[0];
  ok(r1.ok && Array.isArray(en.agentReads) && en.agentReads.length === 1 && en.agentReads[0].id === 'cid-r1' && en.agentReads[0].name === 'Reader One' && en.agentReads[0].at === clock && en.agentReads[0].upTo === newest.at, 'readFor STAMPS the read in the index: who, when, and up to which record (the tail\'s newest)', JSON.stringify(en.agentReads));
  const bc = events.slice(e0).filter((m) => m.type === 'channels-updated');
  ok(bc.length === 1 && bc[0].partial === true && JSON.stringify(bc[0].changedKeys) === JSON.stringify([K]) && bc[0].digest.conversations.length === 1 && bc[0].digest.conversations[0].touch.read.name === 'Reader One', 'ONE partial broadcast of THAT row carries it (the panel repaints with no fetch)', JSON.stringify(bc.map((m) => m.changedKeys)));
  const e1 = events.length;
  eng.readFor(agent('cid-r1', 'Reader One'), 'im', 'c00', { since: newest.at });
  await drainIndex(eng);
  ok(events.length === e1 && eng.store.index.peek(K).agentReads[0].at === clock, 'the SAME tail read again inside a minute is not news: no write, no broadcast (an agent\'s read loop is not a broadcast loop)');
  clock += 61e3;
  eng.readFor(agent('cid-r1', 'Reader One'), 'im', 'c00', {});
  await drainIndex(eng);
  ok(events.length === e1 + 1 && eng.store.index.peek(K).agentReads[0].at === clock, '…past the minute it is re-stamped (a new "read N min ago")');
  const hidden = eng.readFor(agent('cid-stranger', 'Stranger'), 'im', 'c00', {});
  await drainIndex(eng);
  ok(hidden.code === 'not-found' && !eng.store.index.peek(K).agentReads.some((r) => r.id === 'cid-stranger'), 'a HIDDEN read never stamps (the uniform not-found leaves no trace)');
  for (let k = 0; k < 7; k++) { await eng.setReach('im', 'c00', { principal: { kind: 'agent', id: `cid-p${k}`, name: `P${k}` }, level: 'visible' }); clock += 1000; eng.readFor(agent(`cid-p${k}`, `P${k}`), 'im', 'c00', {}); await drainIndex(eng); }
  const five = eng.store.index.peek(K).agentReads;
  ok(five.length === 5 && five[0].id === 'cid-p6' && five.every((r, i) => i === 0 || five[i - 1].at >= r.at), 'at most FIVE principals are kept, newest first', JSON.stringify(five.map((r) => r.id)));
  const onDisk = () => { eng.store.index.flush(); return JSON.parse(fs.readFileSync(path.join(eng.store.dir, 'index.json'), 'utf-8')).conversations[K].agentReads; };
  ok(onDisk().length === 5, 'the stamp is PERSISTED through the index\'s door (it survives a restart)');
  // the wake names whom it reached
  await eng.setAssignment('im', 'c02', { principal: { kind: 'agent', id: 'cid-alpha', name: 'Alpha' }, mode: 'all', notify: 'wake' });
  W.convs.get('c02').recs.push({ vendorId: 'c02-news', at: clock + 500, author: { id: 'u2', name: 'Brook', isSelf: false, isBot: false }, text: 'news' });
  clock += 31e3;
  await eng.refresh('im', 'c02');
  await eng.settleWakes();
  const lw = eng.store.index.peek('im/c02').stats.wakes.slice(-1)[0];
  const rowC2 = wholeOf(eng).conversations.find((c) => c.id === 'c02');
  ok(delivered.length >= 1 && lw && lw.name === 'Alpha' && lw.ok === true && rowC2.touch.wake.name === 'Alpha' && rowC2.touch.wake.ok === true, 'the wake NAMES whom it reached (the ledger entry and the row\'s touch)', JSON.stringify(lw));
  W.refuse = true;
  W.convs.get('c02').recs.push({ vendorId: 'c02-news2', at: clock + 500, author: { id: 'u2', name: 'Brook', isSelf: false, isBot: false }, text: 'more news' });
  clock += 31e3;
  await eng.refresh('im', 'c02');
  await eng.settleWakes();
  const rowHeld = wholeOf(eng).conversations.find((c) => c.id === 'c02');
  const tagHeld = Fo.statusTag(rowHeld, clock) || {};
  ok(rowHeld.touch.wake.ok === false && rowHeld.touch.wake.lane === 'none' && rowHeld.touch.pending >= 1 && tagHeld.code === 'assigned' && tagHeld.held === true, 'a wake the ladder refused (no stash) is HELD: the row says so and its tag turns amber', JSON.stringify(rowHeld.touch));
  W.refuse = false;
  // the owner's own newest message
  const rowC1 = wholeOf(eng).conversations.find((c) => c.id === 'c01');
  ok(rowC1.touch && rowC1.touch.selfAt === SELF_AT, 'a record the vendor marks as the OWNER\'s (`isSelf`) is the row\'s `selfAt`', JSON.stringify(rowC1.touch));
  ok(Fo.statusTag(rowC1, clock).code === 'replied', '…and the row is on the first screen as "You replied …"');
  await eng.store.outbox.update((ob) => { ob.proposals = ob.proposals || {}; ob.proposals['p-own'] = { id: 'p-own', key: 'im/c00', adapterId: 'im', convId: 'c00', state: 'sent', text: 'mine', draftedBy: { kind: 'user' }, at: clock - 10e3, updatedAt: clock - 9e3, result: { at: clock - 9e3 } }; });
  const rowC0 = wholeOf(eng).conversations.find((c) => c.id === 'c00');
  ok(rowC0.touch.selfAt === clock - 9e3, 'the owner\'s OWN send from here (a sent proposal the owner drafted) counts before the vendor echoes it back', JSON.stringify(rowC0.touch.selfAt));
  // the one-shot derivation for rows that predate the field
  await eng.store.index.update(() => { const e2 = eng.store.index.entry('im', 'c01', { create: false }); delete e2.selfAt; });
  const h1 = await eng.healSelfAt();
  const h2 = await eng.healSelfAt();
  ok(h1.found === 1 && eng.store.index.peek('im/c01').selfAt > 0 && h2.planned === 0, `the one-shot derivation reads a pre-field row's tail ONCE (planned ${h1.planned}, found ${h1.found}; then nothing is planned)`);
  eng.stop();
}

// ═══ ④ the words ══════════════════════════════════════════════════════════
console.log('④ the words: en / zh / ja, the agent\'s name a separate part');
const dicts = { en: {} };
for (const l of ['zh', 'ja']) dicts[l] = (await import(pathToFileURL(path.join(REPO, `src/lib/i18n-${l}.js`)).href)).default;
const tFor = (lang) => (str, params) => { let x = (dicts[lang] && dicts[lang][str]) || str; if (params) x = x.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m)); return x; };
{
  const TAGS = [
    [{ code: 'awaiting', n: 2 }, { en: '2 to approve', zh: '2 条待批准', ja: '2 件承認待ち' }, 'attn', ''],
    [{ code: 'unknown', n: 1 }, { en: 'send unknown', zh: '结果未知', ja: '結果不明' }, 'warn', ''],
    [{ code: 'assigned', name: 'Ops desk', held: false }, { en: '→ Ops desk', zh: '→ Ops desk', ja: '→ Ops desk' }, 'neutral', 'Ops desk'],
    [{ code: 'assigned', name: 'Ops desk', held: true }, { en: '→ Ops desk', zh: '→ Ops desk', ja: '→ Ops desk' }, 'warn', 'Ops desk'],
    [{ code: 'read', name: 'Gamma', at: NOW - 5 * 60e3 }, { en: 'Gamma read 5m ago', zh: 'Gamma 5分钟前读过', ja: 'Gamma 5分前に既読' }, 'neutral', 'Gamma'],
    [{ code: 'new-since-read', name: 'Gamma', at: NOW - H }, { en: 'New since Gamma', zh: 'Gamma 读后有新', ja: 'Gamma 既読後に新着' }, 'attn', 'Gamma'],
    [{ code: 'held', n: 3 }, { en: 'last wake held', zh: '上次唤醒被暂存', ja: '前回の起動は保留' }, 'warn', ''],
    [{ code: 'replied', at: NOW - 3 * H }, { en: 'replied 3h ago', zh: '你3小时前回复过', ja: '3時間前に返信済み' }, 'neutral', ''],
  ];
  for (const lang of ['en', 'zh', 'ja']) {
    for (const [tag, words, tone, who] of TAGS) {
      const p = Wd.statusTagParts(tag, { now: NOW, t: tFor(lang) });
      const text = p.before + p.who + p.after;
      ok(text === words[lang] && p.tone === tone && p.who === who && p.title && p.title.length > text.length, `${lang} ${tag.code}${tag.held ? ' (held)' : ''}: "${text}" · ${tone}${who ? ` · name "${who}" its own part` : ''}`, JSON.stringify(p));
    }
    const h = Wd.viewSwitchText({ focus: 9, all: 879 }, { t: tFor(lang) });
    const WANT = { en: ['9 need attention', 'All 879'], zh: ['9 需关注', '全部 879'], ja: ['9 要対応', 'すべて 879'] }[lang];
    ok(h.focus === WANT[0] && h.all === WANT[1], `${lang} header: "${h.focus}" | "${h.all}"`);
  }
  // D4: a scope-grain tag (listed only once woken / held) keeps the SAME visible words "→ X"; its tooltip names the grain
  for (const lang of ['en', 'zh', 'ja']) {
    const G = { account: { en: 'Handed to Ops desk with the whole account', zh: '整个账号已交给 Ops desk', ja: 'アカウントごと Ops desk に任せています' }, pattern: { en: 'Handed to Ops desk by a rule that matches it', zh: '按匹配它的规则交给了 Ops desk', ja: '一致するルールで Ops desk に任せています' } };
    for (const g of ['account', 'pattern']) {
      const tag = Fo.statusTag(row('x', { assignment: principal('Ops desk', g), touch: { wake: { at: NOW - H, ok: true, lane: 'message', n: 1 } } }), NOW);
      const p = Wd.statusTagParts(tag, { now: NOW, t: tFor(lang) });
      ok(p.before + p.who + p.after === '→ Ops desk' && p.title === G[g][lang] && p.tone === 'neutral', `${lang} a woken ${g}-grain row: "→ Ops desk", its tooltip "${p.title}"`, JSON.stringify(p));
    }
  }
  ok(Wd.statusTagParts(null) === null && Wd.statusTagParts({ code: 'nonsense' }) === null, 'no tag ⇒ no words (a code the words do not know is never guessed)');
  // r-verify (2026-09-26): NEVER A RAW ID — a reader / a principal that arrived without a display name is
  // worded by its kind ("an agent" / "a Task Group"); the id is in none of the parts, in every language
  {
    const RAW = 'c0ffee00-1234-4bcd-8ef0-0123456789ab';
    const cases = [
      ['read', Fo.statusTag(row('anon-read', { touch: { read: { id: RAW, name: null, at: NOW - H, upTo: NOW } } }), NOW)],
      ['new-since-read', Fo.statusTag(row('anon-new', { lastAt: NOW, touch: { read: { id: RAW, name: null, at: NOW - H, upTo: NOW - 2 * H } } }), NOW)],
      ['assigned', Fo.statusTag(row('anon-assigned', { assignment: { principal: { kind: 'agent', id: RAW, name: null }, source: 'conversation' } }), NOW)],
      ['assigned', Fo.statusTag(row('anon-group', { assignment: { principal: { kind: 'group', id: 'T-' + RAW, name: '' }, source: 'account' }, touch: { wake: { at: NOW - H, ok: true, lane: 'message', n: 1 } } }), NOW)],   // an account grain lists only once woken (D4)
    ];
    for (const [code, tag] of cases) {
      ok(tag && tag.code === code && tag.name === '', `NEVER A RAW ID: an unnamed ${tag && tag.kind} ${code} tag carries no name, not the id (${JSON.stringify(tag)})`);
      for (const lang of ['en', 'zh', 'ja']) {
        const p = Wd.statusTagParts(tag, { now: NOW, t: tFor(lang) });
        const all = [p.before, p.who, p.after, p.title].join(' ');
        ok(!all.includes('c0ffee00') && p.who && p.who === (tag.kind === 'group' ? tFor(lang)('a Task Group') : tFor(lang)('an agent')), `${lang} ${code} (${tag.kind}): worded by its kind, the id nowhere — "${p.before}${p.who}${p.after}"`);
      }
    }
  }
  ok(Fo.TAG_ORDER.every((c) => Wd.statusTagParts({ code: c, name: 'X', n: 1, at: NOW }, { now: NOW }) !== null), 'CENSUS: every code in TAG_ORDER has its words');
  for (const lang of ['zh', 'ja']) {
    const reasons = ['vendor-budget', 'backoff', 'not-supported', 'disabled', 'no-preview', 'unreachable', 'forbidden', 'not-found', 'too-large'].map((c) => Wd.attachmentReasonText(c, { t: tFor(lang) }));
    ok(reasons.every((w) => w && !/^[\x20-\x7e]+$/.test(w)), `${lang}: every picture-refusal reason word is translated (${reasons.join(' · ')})`);
  }
}

// ═══ ⑤ negative controls ══════════════════════════════════════════════════
console.log('⑤ negative controls (patched copies in this run\'s scratch dir)');
{
  const load = async (tag, a, b) => {
    ok(FOCUS_SRC.includes(a), `CONTROL ${tag}: the edit's anchor is spelled once`);
    return import(pathToFileURL(MUT.write('src/channel-focus.js', FOCUS_SRC.replace(a, b), tag)).href);
  };
  const reds = (F) => FIXTURE.filter(([r, want]) => { const g = F.statusTag({ kind: 'conv', conv: r }, NOW); return (g ? g.code : null) !== want; }).map(([r]) => r.id);
  const inclusive = await load('inclusive-edge', 'return a > 0 && now - a < win;', 'return a > 0 && now - a <= win;');
  ok(reds(inclusive).includes('read-edge-out') && reds(inclusive).includes('replied-edge-out'), `CONTROL: an INCLUSIVE 24 h edge keeps a read exactly a day old — the edge rows redden (${reds(inclusive).join(', ')})`);
  const readFirst = await load('read-first', "  const a = c.assignment;\n  if (a && a.principal && (a.principal.id || a.principal.name)) {", "  const rd0 = touch && touch.read;\n  if (rd0 && within(rd0.at, now, FOCUS_WINDOW_MS)) return { code: 'read', name: rd0.name || '', at: num(rd0.at) };\n  const a = c.assignment;\n  if (a && a.principal && (a.principal.id || a.principal.name)) {");
  const pr = readFirst.statusTag(row('both', { assignment: principal('Alpha'), touch: { read: { name: 'Gamma', at: NOW - H, upTo: NOW } } }), NOW);
  ok(pr.code === 'read', 'CONTROL: "read" ranked above "assigned" answers read for an assigned row — the priority table reddens on it');
  // D4 (2026-09-27): the GRAIN check removed — every conversation of a handed-over account / rule is back on the first screen
  const grainless = await load('grain-dropped', "if (grain === 'conversation' || held || woken) return { code: 'assigned',", "return { code: 'assigned',");
  const gReds = reds(grainless);
  const SCOPE_NULLS = FIXTURE.filter(([r, w]) => w === null && r.assignment && r.assignment.source !== 'conversation').map(([r]) => r.id);
  ok(SCOPE_NULLS.length === 8 && SCOPE_NULLS.every((id) => gReds.includes(id)), `CONTROL: a rule without the grain check lists every scope-grain row — the fixture reddens on all ${SCOPE_NULLS.length} that must stay off, and the 2 read ones lose their read tag (${gReds.join(', ')})`);
  ok(Fo.firstScreen(SPEC.rows, { now: SPEC.clock }).focus === 9 && grainless.firstScreen(SPEC.rows, { now: SPEC.clock }).focus === 50, `CONTROL: …and on ②'s real rows the first screen is the whole account again — 50, not 9 (the owner's 824 threads)`);
  const windowless = await load('wake-window-dropped', "w.lane !== 'none' && within(w.at, now, FOCUS_WINDOW_MS)", "w.lane !== 'none'");
  ok(reds(windowless).includes('account-woke-25h') && reds(windowless).includes('pattern-woke-25h') && windowless.firstScreen(SPEC.rows, { now: SPEC.clock + 25 * H }).focus === 6, 'CONTROL: a delivered wake with NO window keeps a woken scope row for ever — the 25 h rows redden, ②\'s day-later list stays 6, not 4');
  const keepAll = await load('keep-all', "return (rows || []).filter((r) => r && (r.kind === 'group' && r.group ? !r.archived : !!statusTag(r, now)));", 'return (rows || []).slice();');
  const { rows } = V.groupListRows({ groups: [], conversations: FIXTURE.map(([r]) => r), adapters: ADAPTERS });
  ok(keepAll.focusRows(rows, NOW).length === FIXTURE.length && Fo.focusRows(rows, NOW).length < FIXTURE.length, 'CONTROL: a focus list that keeps every row is the old first screen — the membership table reddens on it');
  // an engine that stamps BEFORE the reach check
  const STAMP_AT = "    if (!ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();\n    const n = Math.min(200, Math.max(1, Number(limit) || 50));\n    let records = store.readTail(adapterId, convId, { limit: n });";
  ok(ENGINE_SRC.includes(STAMP_AT), 'CONTROL setup: readFor\'s reach check is spelled once');
  const early = MUT.load('src/server/channels-engine.js', ENGINE_SRC.replace(STAMP_AT, "    stampAgentRead(en.key, ctx, 0);\n" + STAMP_AT), 'stamp-first');
  const W = makeWorld(1);
  const { eng } = await engine('ctl-stamp', W, { engineMod: early });
  eng.readFor(agent('cid-stranger', 'Stranger'), 'im', 'c00', {});
  await drainIndex(eng);
  ok((eng.store.index.peek('im/c00').agentReads || []).some((r) => r.id === 'cid-stranger'), 'CONTROL: an engine that stamps before the reach check leaves a HIDDEN reader\'s trace — the hidden-read leg reddens on it');
  eng.stop();
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 6 })) ok(x.pass, 'tree: ' + x.name + (x.pass ? '' : ' — ' + x.detail));
}

// ═══ ⑥ wiring pins ════════════════════════════════════════════════════════
console.log('⑥ wiring pins');
{
  const P = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf-8');
  const A = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
  ok(/const fs = firstScreen\(rows, \{ view: VIEW, q, now \}\);/.test(P) && /const st = r\.kind === 'conv' \? statusTag\(r, now\) : null;/.test(P) && /const tag = statusTagParts\(st, \{ now \}\);/.test(P), 'PIN: the first screen is firstScreen(view, filter); each row asks statusTag and words it with statusTagParts');
  ok(/chanEl\('span', `chan-grow-tag chan-tag-\$\{tag\.tone\}`\)/.test(P) && /chanEl\('span', 'chan-tag-who', tag\.who\)/.test(P), 'PIN: the tag is built with channel-chrome\'s el() — the name in its own `.chan-tag-who` (a data path), no innerHTML');
  ok(/let VIEW = 'focus';/.test(P) && /segFocus\.dataset\.view = 'focus'/.test(P) && /segAll\.dataset\.view = 'all'/.test(P) && /input\.dataset\.channelFilter = '1';/.test(P) && /const \{ row: find, input: findInput \} = filterBox\(\(\) => \{ draw\(\); queueSearch\(\); \}\);/.test(P), 'PIN: the default view is the attention list; the header is the two-way switch; the filter box (design 008: the attention rows filter at once, the server answers for All 250 ms after the last keystroke)');
  ok((ENGINE_SRC.match(/stampAgentRead\(/g) || []).length === 2 && /stampAgentRead\(en\.key, ctx, upTo\);/.test(ENGINE_SRC) && /eng\.readFor\(channelPrincipal\(s, id\)/.test(A), 'PIN: the stamp has ONE door — readFor, the agent route\'s read — and one definition');
  ok(/touch: touchView\(en, lw, ob\),/.test(ENGINE_SRC) && /name: target\.name \? String\(target\.name\)\.slice\(0, 80\) : null,/.test(ENGINE_SRC), 'PIN: the row carries `touch`; the wake names its target');
  ok(!/\b(lark|gmail|fake-poll)\b/.test(FOCUS_SRC.replace(/^\s*\/\/.*$/gm, '')), 'channel-focus.js names no adapter id (a fact, never a kind)');
}

// ═══ ⑦ the R3 × R4 seam ══════════════════════════════════════════════════
console.log('⑦ the R3 × R4 seam (2.369.191): a DIGEST watcher\'s open window is not "held"');
{
  const OPS = { kind: 'agent', id: 'cid-Ops desk', name: 'Ops desk' };
  const OPK = 'agent:cid-Ops desk';
  const dig = () => ({ principal: OPS, notify: 'digest', mode: 'all', digestMinutes: 60, source: 'account' });
  const wk = (who) => ({ principal: { kind: 'agent', id: `cid-${who}`, name: who }, notify: 'wake', mode: 'all', digestMinutes: 60, source: 'account' });
  const pf = (p, n, oldest) => ({ p, n, oldest });
  const M = 60e3;
  // [name, row, the tag's code (null = not on the first screen), held hits]
  const SEAM = [
    ['digest-open', row('s-open', { assignment: principal('Ops desk', 'account'), watchers: [dig()], touch: { pending: 3, pendingFor: [pf(OPK, 3, NOW - 10 * M)] } }), null, 0],
    ['digest-open-59m', row('s-open59', { watchers: [dig()], touch: { pending: 2, pendingFor: [pf(OPK, 2, NOW - 59 * M)] } }), null, 0],
    ['digest-closed', row('s-closed', { assignment: principal('Ops desk', 'account'), watchers: [dig()], touch: { pending: 3, pendingFor: [pf(OPK, 3, NOW - 61 * M)] } }), 'assigned', 3],
    ['digest-edge', row('s-edge', { watchers: [dig()], touch: { pending: 1, pendingFor: [pf(OPK, 1, NOW - 60 * M)] } }), 'held', 1],
    ['wake-pending', row('s-wake', { watchers: [wk('Beta')], touch: { pending: 2, pendingFor: [pf('agent:cid-Beta', 2, NOW - M)] } }), 'held', 2],
    ['mixed', row('s-mixed', { watchers: [dig(), wk('Beta')], touch: { pending: 5, pendingFor: [pf(OPK, 3, NOW - M), pf('agent:cid-Beta', 2, NOW - M)] } }), 'held', 2],
    ['orphan', row('s-orphan', { watchers: [dig()], touch: { pending: 1, pendingFor: [pf('agent:cid-Gone', 1, NOW - M)] } }), 'held', 1],
    ['legacy-untagged', row('s-legacy', { watchers: [dig()], touch: { pending: 1, pendingFor: [pf(null, 1, NOW - M)] } }), 'held', 1],
    ['older-server', row('s-old', { watchers: [dig()], touch: { pending: 2 } }), 'held', 2],
  ];
  const seamReds = (F) => SEAM.filter(([, r, want, n]) => { const g = F.statusTag({ kind: 'conv', conv: r }, NOW); return (g ? g.code : null) !== want || F.heldPending(r.touch, NOW, r.watchers) !== n; }).map(([name]) => name);
  const bad = seamReds(Fo);
  ok(bad.length === 0, `the seam table: an OPEN digest window is neither held nor listed; closed (the edge exclusive) it is held; a wake watcher's, an orphan's, a legacy and an older server's pending stay held; a mixed pair counts only the wake's (${SEAM.length} rows)`, bad.join(', '));
  ok(Fo.heldOf(SEAM[0][1].touch, NOW, SEAM[0][1].watchers) === false && Fo.heldOf(SEAM[0][1].touch, NOW) === true, 'heldOf reads the WATCHERS: the same open-window touch is held only when nobody says it is a digest');
  ok(V.heldPending === Fo.heldPending, 'channel-groups-view re-exports heldPending (the panel\'s import path)');
  // the REAL engine: an account-grain DIGEST watcher (R4's two operations) — the hit waits, the row is not held
  const W = makeWorld(2);
  const delivered = [];
  const deliver = { async deliverToConversation(cid, text, opts) { delivered.push({ cid, text, opts }); return { ok: true, lane: 'message' }; } };
  const { eng } = await engine('seam', W, { deliver, sessions: [{ cid: 'cid-ops', name: 'Ops desk', groups: [] }] });
  const OPS2 = { kind: 'agent', id: 'cid-ops', name: 'Ops desk' };
  const ra = await eng.setAccess('im', { kind: 'account' }, [{ principal: OPS2, authority: 'draft' }]);
  const rw = await eng.setWatchers('im', { kind: 'account' }, [{ principal: OPS2, notify: 'digest', mode: 'all', digestMinutes: 60 }]);
  ok(ra && ra.ok !== false && rw && rw.ok !== false, 'FIXTURE: access, then a DIGEST notification (60 min) for Ops desk on the whole account', JSON.stringify({ ra, rw }).slice(0, 300));
  clock += 31e3;
  W.convs.get('c00').recs.push({ vendorId: 'c00-news', at: clock - 500, author: { id: 'u2', name: 'Brook', isSelf: false, isBot: false }, text: 'news' });
  await eng.refresh('im', 'c00');
  await eng.settleWakes();
  await drainIndex(eng);
  const r00 = wholeOf(eng).conversations.find((c) => c.id === 'c00');
  const pfor = r00 && r00.touch && r00.touch.pendingFor;
  ok(delivered.length === 0 && r00.touch.pending === 1 && Array.isArray(pfor) && pfor.length === 1 && pfor[0].p === 'agent:cid-ops' && pfor[0].n === 1 && pfor[0].oldest > 0 && r00.watchers.length === 1 && r00.watchers[0].notify === 'digest', 'the engine: the digest\'s hit WAITS on the conversation (nothing delivered), and the row says for whom — touch.pendingFor + the R4 watcher row', JSON.stringify({ delivered: delivered.length, touch: r00 && r00.touch, watchers: r00 && r00.watchers }));
  const conv00 = { kind: 'conv', conv: r00 };
  ok(Fo.statusTag(conv00, clock) === null, 'the window OPEN ⇒ the row wears no tag — not "→ Ops desk · held", not on the first screen (the account grain alone never lists it, D4)');
  const later = Fo.statusTag(conv00, clock + 61 * M);
  ok(later && later.code === 'assigned' && later.held === true && later.name === 'Ops desk', 'the window CLOSED with the hit still pending ⇒ "→ Ops desk", amber (held)', JSON.stringify(later));
  eng.stop();
  // CONTROLS: the pre-seam rule (any pending hit is held) and a statusTag that does not pass the row's watchers
  const loadSeam = async (tag, a, b) => {
    ok(FOCUS_SRC.split(a).length === 2, `CONTROL ${tag}: the edit's anchor is spelled once`);
    return import(pathToFileURL(MUT.write('src/channel-focus.js', FOCUS_SRC.replace(a, b), tag)).href);
  };
  const preSeam = await loadSeam('pre-seam', '  if (heldPending(touch, now, watchers) > 0) return true;', '  if (num(touch.pending) > 0) return true;');
  const pr = seamReds(preSeam);
  ok(pr.includes('digest-open') && pr.includes('digest-open-59m') && preSeam.statusTag(conv00, clock).held === true, `CONTROL: the pre-seam rule ("any pending hit is held") draws the open digest as "→ Ops desk · held" — the table and the real row redden (${pr.join(', ')})`);
  const blind = await loadSeam('no-watchers', '  const held = heldOf(touch, now, c.watchers);', '  const held = heldOf(touch, now);');
  const br = seamReds(blind);
  ok(br.includes('digest-open') && br.includes('digest-open-59m') && !br.includes('wake-pending'), `CONTROL: a statusTag that does not hand heldOf the row's watchers cannot tell a digest from a stuck wake — the open-window rows redden (${br.join(', ')})`);
  ok(/touch: touchView\(en, lw, ob\),/.test(ENGINE_SRC) && /return \{ read, wake, pending, pendingFor, refusalAt, selfAt \};/.test(ENGINE_SRC) && /x = slot\(h\.for \|\| null\)/.test(ENGINE_SRC), 'PIN: touchView groups the pending hits by the watcher they wait for (`for`) and sends pendingFor');
}

// ── design 012 (Slack S1): AN APP'S DM IS NEVER "SOMEBODY WROTE TO YOU" — the row's `app` (the other side is a bot or
// an integration) withholds the Direct tag and the candidate rule; a person's DM keeps both (the control) ──
{
  const F = require(path.join(REPO, 'src/channel-focus.js'));
  const t = Date.now();
  const dm = { key: 'slack/D1', kind: 'dm', unread: 2, lastAt: t - 1000 };
  ok(F.statusTag(dm, t) && F.statusTag(dm, t).code === 'direct', 'design 012 CONTROL: a person\'s DM with unread messages wears the Direct tag');
  ok(!F.statusTag({ ...dm, app: true }, t), 'design 012: an app\'s DM with unread messages does NOT');
  ok(F.candidateOf({ ...dm }, null, t) === true && F.candidateOf({ ...dm, app: true }, null, t) === false, 'design 012: …and is not a first-screen candidate for that reason either');
  const fsrc = fs.readFileSync(path.join(REPO, 'src/channel-focus.js'), 'utf8');
  const RULE = "  if (c.kind === 'dm' && !c.app && num(c.unread) > 0";
  ok(fsrc.includes(RULE), 'design 012: the patch site of the app control is in channel-focus.js');
  const F2 = require(MUT.write('src/channel-focus.js', fsrc.replace(RULE, "  if (c.kind === 'dm' && num(c.unread) > 0"), 'app-dm'));
  ok(F2.statusTag({ ...dm, app: true }, t) && F2.statusTag({ ...dm, app: true }, t).code === 'direct', 'design 012 NEGATIVE CONTROL: a copy without the `app` test tags a GitHub bot\'s DM "Direct"');
}

// ── lane channels-badges: VIBESPACE'S OWN TALK FOLDS — one block under its head at its newest row's place, folded = the
// head alone (with the block's unread / @-you counts); a row that @-mentions the owner or awaits the owner NEVER folds:
// it keeps its own row, on top of the list ──
{
  const F = require(path.join(REPO, 'src/channel-focus.js'));
  const t = NOW;
  const grp = (id, extra = {}) => ({ kind: 'group', key: `groups/${id}`, id, group: { id }, title: id, unread: 0, ...extra });
  const cv = (id, extra = {}, conv = {}) => ({ kind: 'conv', key: `lark/${id}`, id, title: id, unread: 0, ...extra, conv: { kind: 'group', lastAt: extra.lastAt, ...conv } });
  const L = [cv('people-1', { lastAt: t - 10 }), grp('g1', { lastAt: t - 20, unread: 3 }), cv('people-2', { lastAt: t - 30 }), grp('g2', { lastAt: t - 40, unread: 2, atYou: 1 }),
    cv('watch', { lastAt: t - 50, internal: true, unread: 1 }, { outbox: { awaiting: 1 } }), grp('g3', { lastAt: t - 60 }), cv('people-3', { lastAt: t - 70 }, { outbox: { awaiting: 2 } })];
  const keys = (o) => o.rows.map((r) => (r.kind === 'internal-head' ? 'HEAD' : r.id)).join(',');
  const U = F.internalBlock(L, { folded: false, now: t });
  ok(keys(U) === 'people-1,HEAD,g1,g2,watch,g3,people-2,people-3' && JSON.stringify(U.block) === '{"n":4,"unread":6,"atYou":1,"pinned":0,"folded":false}',
    'channels-badges: UNFOLDED, the internal rows (agent groups + a row stamped `internal`) stand as ONE block under its head at the place of the newest; every other row keeps its order', keys(U) + ' ' + JSON.stringify(U.block));
  const Fd = F.internalBlock(L, { folded: true, now: t });
  ok(keys(Fd) === 'g2,watch,people-1,HEAD,people-2,people-3' && Fd.block.pinned === 2 && Fd.block.folded === true && Fd.block.unread === 6 && Fd.block.atYou === 1,
    'channels-badges: FOLDED, the head alone stands for the block (its unread 6 and @-you 1 still said) — the row that @-mentions the owner and the row awaiting the owner keep their OWN rows, on top', keys(Fd));
  ok(keys(F.internalBlock([cv('p', { lastAt: t - 1 }), grp('only', { lastAt: t - 2, atYou: 2 })], { folded: true, now: t })) === 'only,HEAD,p',
    'channels-badges: a block whose every row needs the owner still draws its head (the fold stays reachable) right under the pinned rows');
  const none = [cv('a', { lastAt: t - 1 }), cv('b', { lastAt: t - 2 })];
  const N = F.internalBlock(none, { folded: true, now: t });
  ok(N.block === null && keys(N) === 'a,b' && N.rows !== none, 'channels-badges: a list with no internal row is drawn as it is (no head)');
  ok(F.isInternal({ kind: 'group', key: 'lark/oc_1', conv: { kind: 'group' } }) === false && F.isInternal(grp('g')) && F.isInternal({ kind: 'conv', internal: true }),
    'channels-badges: a vendor GROUP CHAT (a digest row of kind "group") is not internal — an agent group (its `group`) and a stamped row are');
  ok(F.needsOwner(cv('u', { lastAt: t - 1 }, { outbox: { unknown: 1 } }), t) && !F.needsOwner(cv('h', { lastAt: t - 1 }, { touch: { pending: 2 } }), t) && !F.needsOwner(grp('q', { unread: 9 }), t),
    'channels-badges: a send of unknown outcome needs the owner; a held wake, unread agent talk do not');
  const fsrc = fs.readFileSync(path.join(REPO, 'src/channel-focus.js'), 'utf8');
  const PIN = '  if (num(r.atYou) > 0) return true;\n';
  ok(fsrc.split(PIN).length === 2, 'channels-badges CONTROL setup: the @-you clause is spelled once');
  const F0 = require(MUT.write('src/channel-focus.js', fsrc.replace(PIN, ''), 'badges-no-at'));
  ok(!keys(F0.internalBlock(L, { folded: true, now: t })).includes('g2'), 'channels-badges NEGATIVE CONTROL: a copy without the @-you clause folds the group that @-mentions the owner away — the leg above would be red');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
