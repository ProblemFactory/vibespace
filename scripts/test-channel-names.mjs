#!/usr/bin/env node
// test-channel-names — B-c127 (the owner, 2026-10-02: a chat card read "VibeSpace · Channels · Lark / 飞书 —
// oc_e53d5350615a2d77bbfdf83d6075decb: 1 message — matched: keyword "inc-""): EVERY HUMAN-VISIBLE CHANNEL REFERENCE
// SAYS THE CONVERSATION'S NAME AND OPENS IT WITH ONE CLICK. THE NAME LADDER (the owner's ruling 2026-10-03): ① the
// conversation's own name (a chat's title, a mail's subject — beside its account) → ② any other description the
// server holds (a single chat's other party, the participants / description the vendor listed, the authors seen) →
// ③ the internal id ONLY when nothing else is known. The census judges by it: a name or a description known and the
// id shown = RED; the id with nothing else known = allowed.
//
//   §1 THE CENSUS (grep-derived over src/): every `<x>.title || <x>.convId|id` fallback is either fed by the ladder
//      upstream or agent-facing, BY NAME (a new site = red until judged); the shapes the fix removed stay gone
//      (`Receipt: proposal ${p.id}`, `Proposal ${p.id} (…)`, the group card's `vibespace-msg read {group}` with g.id);
//      every channel wake / receipt delivery carries its `channel` ref; every For-you filing about ONE conversation
//      carries the `open-channel` action, and the For-you jump opens it
//   §2 THE PURE LADDER (src/channel-ref.js) over the REAL block writers: nameOf ①②③, describeOf, refOf, splitLead,
//      wakeFacts reading back renderWakeBlock / renderDigestBlock / renderScopeDigestBlock / renderReceiptBlock
//   §3 THE REAL ENGINE (a mutable poll adapter, a ladder stub, the real For-you store): a titled room's wake card
//      opens with its title and carries the ref; an untitled single chat is named by its other party (②); an untitled
//      group by its authors (②); a room the server knows nothing about → null (the caller's ③); the approval pointer
//      names the room and opens it; the receipt card names the room, never `p-…`; the touches store names a touch by
//      the ladder over the agent answer's raw id
//   §4 PRE-FIX CONTROLS: patched copies restoring each pre-fix line go RED on the leg that pins it
//   §5 VERIFY R1: the id-as-title is no name (F1), one For-you item per conversation (F2), the ladder by key reads the
//      live index (F3), the card's lead is the ref's capped name (F4), an invisible name is no name (F5) — each with its control
// Fast tier (in-process). The rendered half (a real click on a card's name) is scripts/test-channel-names-ui.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + String(e).slice(0, 600) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CR = require(path.join(REPO, 'src/channel-ref.js'));
const F = require(path.join(REPO, 'src/channel-filter.js'));
const P = require(path.join(REPO, 'src/channel-policy.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const NS = require(path.join(REPO, 'src/notification-senders.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const Touches = require(path.join(REPO, 'src/server/channel-touches.js'));

// ── §1 THE CENSUS ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§1 the census: every human-visible conversation reference takes the ladder');
function srcFiles(dir) {
  const out = [];
  for (const d of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = path.join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== 'agentd') out.push(...srcFiles(rel)); } else if (d.name.endsWith('.js')) out.push(rel);
  }
  return out;
}
const FALLBACK_RE = /\b[\w.]*title \|\| [\w.]*?\b(?:convId|id)\b/g;
// Each judged site: [file, a phrase of its line, why it may keep the id]
const JUDGED = [
  ['src/channel-filter.js', '`### Channel message —', 'AGENT-FACING wake block head (the engine hands it the ladder name; ③ only when nothing is known)'],
  ['src/channel-filter.js', '#### ${safeInline(g.title || g.convId', 'AGENT-FACING scope digest section (the CLI addresses a conversation by its id)'],
  ['src/channel-filter.js', '`### Channel digest —', 'AGENT-FACING digest block head (the engine hands it the ladder name)'],
  ['src/channel-policy.js', 'Channel receipt —', 'AGENT-FACING receipt block head (the engine hands it the ladder name)'],
  ['src/lib/channel-rows.js', 'textMatches([r.title || r.id, r.adapterLabel, r.lastText]', '③ — the store matches a held row the way the server\'s `q` does (the ladder name, else the id); r.title is the ladder name (rowView humanNameOf)'],
  ['src/channel-touch.js', 'const title = (row && (row.title || row.convId))', '③ — the touch title is the ladder name, set at record time (src/server/channel-touches.js nameOf)'],
  ['src/channel-touch.js', 'return `${t(\'Channels\')} ·', '③ — the touch title is the ladder name, set at record time'],
  ['src/channel-touch.js', "open: 'search', adapterId: row.adapterId, convId: row.convId, title: row.title || row.convId", '③ — the touch title is the ladder name, set at record time; the search verdict hands it to the scoped search dialog\'s title (lane channel-search-view)'],
  ['src/lib/channel-account-dialogs.js', 'access: {conv} → {who}', '③ — the engine names the ref by the ladder (referencesOf → conversationName)'],
  ['src/lib/channel-filter-editor.js', 'name: conv.title || conv.id', '③ — conv.title is the digest row\'s ladder name (rowView → humanNameOf)'],
  ['src/lib/channel-reach-editor.js', 'Reach & policy — {title}', '③ — conv.title is the ladder name (rowView)'],
  ['src/lib/channels-panel.js', 'title.title = `${conv.title || conv.id}', '③ — conv.title is the ladder name (rowView)'],
  ['src/lib/channel-outbox.js', '`${p.adapterLabel || p.adapterId} · ${p.title || p.convId}`', '③ — proposalView names a proposal by the ladder NOW'],
  ['src/lib/channel-outbox.js', 'const convNameOf = (p) => p.title || p.convId', '③ — the Outbox row\'s WHERE (B-f467): proposalView names a proposal by the ladder NOW'],
  ['src/server/channels-engine.js', 'agentText(en.title || convId', 'AGENT-FACING reaction digest line'],
  ['src/server/channels-outbound.js', 'conversationName(p.adapterId, p.convId) || p.title || p.convId', '③ after the ladder (an unknown outcome)'],
  ['src/server/channels-outbound.js', 'const rTitle = conversationName(p.adapterId, p.convId) || p.title || p.convId', '③ after the ladder (a receipt)'],
  ['src/task-groups.js', 'raw.title || raw.id', 'not a channel (a task group)'],
  ['src/task-groups.js', 'existing?.title || id', 'not a channel (a task group)'],
  ['src/lib/tab-group.js', 'this.windows.get(id)?.title || id', 'not a channel (a window\'s own title)'],
];
function censusOf(readFn) {
  const hits = [];
  for (const rel of srcFiles('src')) {
    const lines = readFn(rel).split('\n');
    lines.forEach((l, i) => { if (FALLBACK_RE.test(l)) hits.push({ rel, line: i + 1, text: l.trim() }); FALLBACK_RE.lastIndex = 0; });
  }
  const unjudged = hits.filter((h) => !JUDGED.some(([f, phrase]) => f === h.rel && h.text.includes(phrase)));
  return { hits, unjudged };
}
const census = censusOf(read);
ok(census.hits.length >= JUDGED.length && census.unjudged.length === 0, `every title-or-id fallback in src/ is judged (${census.hits.length} sites: fed by the ladder upstream, or agent-facing) — none unjudged`, JSON.stringify(census.unjudged));
const stale = JUDGED.filter(([f, phrase]) => !read(f).includes(phrase));
ok(stale.length === 0, 'every judged site still exists (a census row whose line moved is re-judged, never silently dropped)', JSON.stringify(stale));
const eng = engineSource(REPO);   // lane dc-channels-seams: the engine + its three family files as one text
const rend = read('src/lib/chat-renderers.js');
ok(!/Receipt: proposal \$\{p\.id\}/.test(eng) && !/detail: `Proposal \$\{p\.id\}/.test(eng) && !/en\.title \|\| en\.id/.test(eng), 'the engine prints no `proposal p-…` / `Proposal p-… (adapter)` / `en.title || en.id` toward the human any more');
ok(!/\{ group: g\.id \}/.test(rend), 'the group card\'s notes name the group by its name, never `vibespace-msg read g-…`');
const calls = engineSource(REPO).split('\n').filter((l) => /deliver\.deliverToConversation\(/.test(l) && /spendReason: 'channel-(?:message|receipt)'/.test(l));
const perConv = calls.filter((l) => !/groups, windowMinutes|conversation\(s\)/.test(l));
ok(calls.length === 3 && calls.filter((l) => /\bchannel\b(?: \}|,| \?)/.test(l.replace(/'channel-(?:message|receipt)'/g, ''))).length === 2, `the per-conversation wake and the receipt hand the ladder their \`channel\` ref (2 of the ${calls.length} channel deliveries; the third is a multi-conversation scope digest)`, calls.map((l) => l.trim().slice(0, 160)).join('\n'));
const filings = [...eng.matchAll(/userTodos\.add\(INBOX_KEY/g)].map((m) => eng.slice(Math.max(0, m.index - 2000), m.index + 1400));
const aboutOne = filings.filter((x) => /awaiting approval in|requests access to|has an UNKNOWN outcome/.test(x));
ok(aboutOne.length === 3 && aboutOne.every((x) => /type: 'open-channel'/.test(x)), `every For-you filing about ONE conversation carries the open-channel action (${aboutOne.length})`);
const acts = read('src/lib/user-todos-actions.js');
ok(/item\?\.action\?\.type === 'open-channel'[^\n]*app\.openChannel\?\.\(item\.action\.adapterId, item\.action\.convId\)/.test(acts), 'the For-you jump opens the conversation an open-channel item names (its "channels" group is no session)');
ok(/channelRefOf\(msg\.peerChannel\) \|\| view\.ref/.test(rend) && /this\.app\?\.openChannel\?\.\(ref\.adapterId, ref\.convId\)/.test(rend), 'the notice renderer draws the ref\'s name as the link through the ONE door');

// ── §2 THE PURE LADDER ────────────────────────────────────────────────────────────────────────────────────────────
console.log('§2 the pure ladder (src/channel-ref.js) over the real block writers');
ok(CR.nameOf(['Ops room', 'Ada'], 'oc_1') === 'Ops room' && CR.nameOf(['', 'Ada, Bob'], 'oc_1') === 'Ada, Bob' && CR.nameOf([null, ''], 'oc_1') === 'oc_1', 'nameOf: ① the name, else ② the description, else ③ the id');
ok(CR.describeOf({ participants: '  Ada,\nBob ' }) === 'Ada, Bob' && CR.describeOf({ authors: [{ id: 'me', name: 'Me' }, { id: 'a', name: 'Ada' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cy' }, { id: 'd', name: 'Di' }] }, { selfId: 'me' }) === 'Ada, Bob, Cy +1' && CR.describeOf({}) === '', 'describeOf: the participants, else the authors (self left out, three + "+N"), else nothing');
const r0 = CR.refOf({ adapterId: 'lark-1', convId: 'oc_9', name: '  Ops\nroom ', account: 'Lark', vendor: 'lark' });
ok(r0 && r0.name === 'Ops room' && r0.adapterId === 'lark-1' && CR.refOf({ convId: 'a\nb' }) === null && CR.refOf({ convId: 'oc_9' }).name === 'oc_9', 'refOf: sanitized, one line; no id ⇒ null; no name ⇒ the id (③)');
ok(JSON.stringify(CR.splitLead('Ops room: 1 message from Ada — matched: all messages', 'Ops room')) === JSON.stringify({ lead: 'Ops room', rest: ': 1 message from Ada — matched: all messages' }) && CR.splitLead('Ops roomy: x', 'Ops room') === null, 'splitLead: the card text\'s leading name, never a prefix of a longer word');
const hit = { record: { author: { name: 'Ada' }, at: Date.UTC(2026, 9, 2), text: 'inc-42 is down' }, why: ['keyword "inc-"'] };
const wb = F.renderWakeBlock({ adapterLabel: 'Lark / 飞书', title: 'Incident room', convId: 'oc_e53d', hits: [hit] });
const wf = CR.wakeFacts(wb);
ok(wf && wf.title.text === 'Channels · Lark / 飞书' && wf.ref && wf.ref.name === 'Incident room' && wf.ref.convId === 'oc_e53d' && wf.ref.adapterId === null && wf.ref.account === 'Lark / 飞书', 'wakeFacts reads the REAL wake block back: the account, the name, the id from the reply hint', JSON.stringify(wf && wf.ref));
const wi = CR.wakeFacts(F.renderWakeBlock({ adapterLabel: 'Lark', title: 'Ops', convId: 'oc_1', hits: [hit], inherited: { kind: 'account' } }));
const db = CR.wakeFacts(F.renderDigestBlock({ adapterLabel: 'Lark', title: 'Ops', convId: 'oc_1', hits: [hit, hit], windowMinutes: 15 }));
const sd = CR.wakeFacts(F.renderScopeDigestBlock({ adapterLabel: 'Lark', scopeLabel: 'the whole account', groups: [{ title: 'A', convId: 'oc_a', hits: [hit] }, { title: 'B', convId: 'oc_b', hits: [hit] }], windowMinutes: 15 }));
const rb = CR.wakeFacts(P.renderReceiptBlock(P.receiptFor({ id: 'p-1', convId: 'oc_1', adapterId: 'lark-1', state: 'sent', sendAs: 'user', identity: { marking: 'none' }, result: { vendorMessageId: 'v', at: 5, sentAs: 'user' } }), { adapterLabel: 'Lark', title: 'Ops' }));
ok(wi && wi.ref && wi.ref.name === 'Ops' && db && db.ref && db.ref.name === 'Ops' && sd && !sd.ref && rb && rb.title.text === 'Channels · Lark — Ops' && !rb.ref, 'an inherited wake / a digest name their ONE conversation; a scope digest (many) and a receipt (no id) name none — their words fold under the card', JSON.stringify({ wi: wi && wi.ref, db: db && db.ref, sd: sd && sd.ref, rb: rb && rb.title }));
const body = NS.noticeBody(NS.vibespaceNoticeText(wb));
const view = NS.noticeCardView(null, NS.vibespaceNoticeText(wb), { facts: (b) => CR.wakeFacts(b) });
ok(view.folded && view.ref && view.ref.name === 'Incident room' && view.title.text === 'Channels · Lark / 飞书' && body.startsWith('### Channel message'), 'a REBUILT card (the transcript\'s server post, name-less): the title says the account, the block folds, the ref names the room');
ok(CR.wakeFacts('Lark / 飞书 · hello') === null && CR.wakeFacts('') === null, 'a body that is no channel block has no facts');

// ── §3 THE REAL ENGINE ────────────────────────────────────────────────────────────────────────────────────────────
console.log('§3 the real engine: wake cards, the approval pointer, the receipt, the touches');
const { makeRecord, makeConversation } = require(path.join(REPO, 'src/channel-record.js'));
const ROOT = scratch('chan-names');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });
async function engineRun(EM, tag) {
  const A = 'names-' + tag;
  const CONVS = [
    { id: 'oc_room', title: 'Ops room', kind: 'group', participants: '' },
    { id: 'oc_dm', title: '', kind: 'dm', participants: '' },
    { id: 'oc_grp', title: '', kind: 'group', participants: '' },
    { id: 'oc_bare', title: '', kind: 'group', participants: '' },
  ];
  const world = new Map(CONVS.map((c) => [c.id, []]));
  let seqNo = 0;
  const mint = (convId, text, author = { id: 'u-ada', name: 'Ada' }) => makeRecord({ adapterId: A, convId, vendorId: `${convId}-${++seqNo}`, at: Date.now() - 600e3 + seqNo * 1000, author: { ...author, isSelf: false, isBot: false }, text, mentions: [], attachments: [], replyTo: null, threadKey: convId, raw: {} });
  const mod = {
    kind: A,
    caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'unknown', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false },
    create() {
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null }; } },
        selfId() { return 'u-owner'; },
        async listConversations() { return { conversations: CONVS.map((c) => makeConversation({ id: c.id, vendorId: c.id, title: c.title, kind: c.kind, participants: c.participants, lastAt: null })), cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: ['user'], why: null, at: Date.now() }; },
        async history(convId, { anchor = null, limit = 50 } = {}) {
          const all = world.get(convId) || [];
          let idx = 0;
          if (anchor) { const at = all.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; }
          const anchorFound = !anchor || idx > 0;
          const pending = all.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: anchorFound && drained, complete: anchorFound && drained };
        },
        async send() { return { ok: true, vendorMessageId: 'sent-1', at: Date.now(), sentAs: 'user' }; },
        async reconcile() { return { unknown: true }; },
      };
    },
  };
  const ladder = { calls: [], stash: [], async deliverToConversation(cid, text, opts) { ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; }, stashFor(cid, env) { ladder.stash.push({ cid, ...env }); return { stored: true, why: null }; }, stashPeek() { return []; } };
  const dir = path.join(ROOT, tag);
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: A, kind: A, label: 'Lark / 飞书', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: null }] }));
  const registry = CH.createChannelRegistry(); registry.register(mod);
  const userTodos = new UserTodoManager({ dataDir: dir });
  const base = Date.now(); let offset = 0;
  const e = EM.create({ dataDir: dir, env: {}, registry, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, deliver: ladder, userTodos, serverSetting: () => undefined, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }], now: () => base + offset });
  try {
    await e.pass(A, { force: true });
    const agent = { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' } };
    for (const c of ['oc_room', 'oc_dm', 'oc_grp']) await e.setAssignment(A, c, { ...agent, mode: 'all', notify: 'wake', dailyWakeCap: 100 });
    const bareName = e.conversationName(A, 'oc_bare');
    offset += 61e3;
    world.get('oc_room').push(mint('oc_room', 'inc-42 is down'));
    world.get('oc_dm').push(mint('oc_dm', 'ping', { id: 'u-bob', name: 'Bob' }));
    world.get('oc_grp').push(mint('oc_grp', 'hello', { id: 'u-cy', name: 'Cy' }));
    await e.pass(A, { force: true }); await e.settleWakes();
    const wake = (cid) => ladder.calls.find((c) => c.opts && c.opts.spendReason === 'channel-message' && c.opts.channel && c.opts.channel.convId === cid) || ladder.calls.find((c) => c.opts && c.opts.spendReason === 'channel-message' && String(c.text).includes(cid));
    const out = { bareName, wakes: {}, rows: {} };
    for (const c of ['oc_room', 'oc_dm', 'oc_grp']) { const w = wake(c); out.wakes[c] = w ? { cardText: w.opts.cardText, channel: w.opts.channel || null, head: String(w.text).split('\n')[0] } : null; }
    for (const r of e.digest().conversations.filter((x) => x.adapterId === A)) out.rows[r.id] = r.title;
    // the approval pointer + the receipt (a review channel: a draft waits for the owner)
    await e.setReach(A, 'oc_dm', { principal: agent.principal, level: 'visible' });
    const AG = { ...agent.principal, groups: [], msgLevelFor: () => 'none' };
    const pr = await e.propose(AG, A, 'oc_dm', { text: 'on it' });
    out.proposalState = pr && pr.proposal && pr.proposal.state;
    out.pointer = userTodos.list ? null : null;
    const items = (userTodos._state && userTodos._state.items) || [];
    const ptr = items.find((i) => i.status === 'open' && /awaiting approval/.test(i.text));
    out.pointer = ptr ? { text: ptr.text, action: ptr.action, detail: ptr.detail } : null;
    out.view = e.outboxView({ key: `${A}/oc_dm` }).proposals.map((p) => p.title);
    if (pr && pr.proposal) await e.approve(pr.proposal.id);
    await sleep(50);
    const rc = ladder.calls.find((c) => c.opts && c.opts.spendReason === 'channel-receipt');
    const rs = ladder.stash.find((x) => x.source === 'channel-receipt');
    out.receipt = rc ? { cardText: rc.opts.cardText, channel: rc.opts.channel || null } : rs ? { stashed: true, text: String(rs.text).split('\n')[0] } : null;
    return out;
  } finally { e.stop(); }
}
const real = await engineRun(ENG, 'real');
const room = real.wakes.oc_room, dm = real.wakes.oc_dm, grp = real.wakes.oc_grp;
ok(room && room.cardText.startsWith('Ops room: 1 message from Ada — ') && room.channel && room.channel.name === 'Ops room' && room.channel.adapterId === 'names-real' && room.channel.convId === 'oc_room' && room.channel.account === 'Lark / 飞书', '① a titled room\'s wake card opens with its TITLE, says who wrote, and carries the ref its name opens', JSON.stringify(room));
ok(dm && dm.cardText.startsWith('Bob: 1 message') && dm.channel && dm.channel.name === 'Bob' && !/oc_dm/.test(dm.cardText) && /^### Channel message — Lark \/ 飞书 · Bob$/.test(dm.head), '② an untitled single chat is named by its other party — on the card AND the agent block\'s head (the reply hint keeps the id)', JSON.stringify(dm));
ok(grp && grp.cardText.startsWith('Cy: 1 message') && grp.channel && grp.channel.name === 'Cy' && !/oc_grp/.test(grp.cardText), '② an untitled group with no listed participants is named by the authors seen in it', JSON.stringify(grp));
ok(real.bareName === null && real.rows.oc_bare === null && real.rows.oc_room === 'Ops room' && real.rows.oc_dm === 'Bob', '③ a room the server knows nothing about has no name (null — the client draws the id, the one case it may); the panel rows take the same ladder', JSON.stringify({ bare: real.bareName, rows: real.rows }));
ok(real.proposalState === 'awaiting-approval' && real.pointer && real.pointer.text === 'Proposals awaiting approval in Bob' && real.pointer.action && real.pointer.action.type === 'open-channel' && real.pointer.action.convId === 'oc_dm' && !/oc_dm/.test(real.pointer.text + real.pointer.detail), 'the For-you approval pointer names the conversation by the ladder and OPENS it (the open-channel action)', JSON.stringify(real.pointer));
ok(real.view.length === 1 && real.view[0] === 'Bob', 'the Outbox card\'s title is the conversation\'s name NOW (the proposal froze the raw id when it was drafted)', JSON.stringify(real.view));
ok(real.receipt && !real.receipt.stashed && /^Bob: receipt — sent/.test(real.receipt.cardText) && !/\bp-/.test(real.receipt.cardText) && real.receipt.channel && real.receipt.channel.convId === 'oc_dm', 'the receipt card names the conversation (never `proposal p-…`) and carries the ref', JSON.stringify(real.receipt));
{
  const sessions = new Map([['w1', { sockName: null, _channelTouches: [] }]]);
  const T = Touches.create({ sessions: () => sessions, broadcast: () => {}, metaStore: () => null, accountOf: () => ({ label: 'Lark', kind: 'lark' }), nameOf: (a, c) => (c === 'oc_dm' ? 'Bob' : null), persistDelayMs: 1e6, broadcastMs: 1e6 });
  const got = T.recordMany('w1', [{ op: 'read', adapterId: 'lark-1', convId: 'oc_dm', title: 'oc_dm', count: 3 }, { op: 'read', adapterId: 'lark-1', convId: 'oc_x', title: 'oc_x', count: 1 }]);
  ok(got[0] && got[0].title === 'Bob' && got[1] && got[1].title === 'oc_x', 'the touches store names a touch by the ladder over the agent answer\'s raw id (③ only when the engine knows nothing)', JSON.stringify(got.map((x) => x && x.title)));
  try { T.flush && T.flush(); } catch {}
}

// ── §4 PRE-FIX CONTROLS ───────────────────────────────────────────────────────────────────────────────────────────
console.log('§4 pre-fix controls: each restored line goes red');
const MUT = mutantCopies('chan-names', REPO);
const swap = (src, from, to) => { if (!src.includes(from)) throw new Error('control anchor missing: ' + from.slice(0, 80)); return src.replace(from, to); };
{
  let s = eng;
  // the wake's own line (its comment makes the anchor unique: lane channel-agent-watch's next-turn wake spells the same ladder)
  s = swap(s, "    const title = humanNameOf(rec, en) || convId;   // B-c127 THE NAME LADDER: the id only", "    const title = en.title || convId;   // B-c127 THE NAME LADDER: the id only");
  s = swap(s, "spendReason: 'channel-message', fromName, cardText, channel }); }", "spendReason: 'channel-message', fromName, cardText }); }");
  s = swap(s, "adapterLabel: rec.label || rec.id, title: humanNameOf(rec, en), kind: en.kind,", "adapterLabel: rec.label || rec.id, title: titleOf(c, en.title) || dmTitleOf(rec, en), kind: en.kind,");
  s = swap(s, "      const title = String((rec && humanNameOf(rec, en)) || en.id).slice(0, 120);", "      const title = String(en.title || en.id).slice(0, 120);");
  s = swap(s, ", action: { type: 'open-channel', adapterId: en.adapterId, convId: en.id, key: en.key } });   // B-c127: a click opens the conversation; verify r1 F2: `key` = the item's identity", " });");
  s = swap(s, "      ...p, ...(p.convId && conversationName(p.adapterId, p.convId) ? { title: conversationName(p.adapterId, p.convId) } : {}),", "      ...p,");
  s = swap(s, "`${CR.nameOf([rTitle], p.convId || p.id)}: receipt — ${rc.status}", "`Receipt: proposal ${p.id} ${rc.status}");
  const pre = await engineRun(MUT.load('src/server/channels-engine.js', s, 'pre-fix'), 'pre');
  ok(pre.wakes.oc_dm && /^oc_dm: 1 message/.test(pre.wakes.oc_dm.cardText) && !pre.wakes.oc_dm.channel, 'CONTROL the pre-fix wake: an untitled single chat\'s card opens with the raw id and carries no ref (the owner\'s screenshot) — §3 ② goes red', JSON.stringify(pre.wakes.oc_dm));
  ok(pre.rows.oc_grp === null && pre.pointer && pre.pointer.text === 'Proposals awaiting approval in oc_dm' && !pre.pointer.action, 'CONTROL the pre-fix pointer: "awaiting approval in oc_dm" and no way to open it (the click ended in "Session not found")', JSON.stringify(pre.pointer));
  ok(pre.view[0] === 'oc_dm' && pre.receipt && /^Receipt: proposal p-/.test(pre.receipt.cardText), 'CONTROL the pre-fix Outbox title and receipt card: the frozen raw id, `proposal p-…`', JSON.stringify({ view: pre.view, receipt: pre.receipt }));
}
{
  const pre = read('src/server/channel-touches.js').replace('title: inert(named || x.title, T.TITLE_MAX),', 'title: inert(x.title, T.TITLE_MAX),');
  const TP = MUT.load('src/server/channel-touches.js', pre, 'touch-pre');
  const sessions = new Map([['w1', { sockName: null, _channelTouches: [] }]]);
  const T = TP.create({ sessions: () => sessions, broadcast: () => {}, metaStore: () => null, accountOf: () => null, nameOf: () => 'Bob', persistDelayMs: 1e6, broadcastMs: 1e6 });
  ok(T.recordMany('w1', [{ op: 'read', adapterId: 'lark-1', convId: 'oc_dm', title: 'oc_dm', count: 1 }])[0].title === 'oc_dm', 'CONTROL the pre-fix touches store keeps the agent answer\'s raw id as the row\'s name');
}
{
  const view = NS.noticeCardView(null, NS.vibespaceNoticeText(wb), { facts: () => null });
  ok(!view.ref && /oc_e53d|Incident room/.test(view.title.text + view.body), 'CONTROL without the channel facts a rebuilt card has no ref (nothing to click) and draws the agent block as the body');
  const preCensus = censusOf((rel) => (rel === 'src/server/channels-auth.js' ? read(rel).replace("title: conversationName(en.adapterId, en.id) || en.id, scope:", "title: en.title || en.id, scope:") : read(rel)));
  ok(preCensus.unjudged.length === 1 && /en\.title \|\| en\.id/.test(preCensus.unjudged[0].text), 'CONTROL the census flags a restored `en.title || en.id` (the account dialog\'s refs) as an unjudged site', JSON.stringify(preCensus.unjudged));
}

// ── §5 VERIFY R1 ──────────────────────────────────────────────────────────────────────────────────────────────────
// F1 a title that IS the conversation's id (an adapter's own fallback: lark `c.name || c.chat_id`, gmail `… || id`) names
//    nothing — the ladder goes on to ② (production held one such row); F2 a For-you item about ONE conversation is THAT
//    conversation's (two rooms of one name merged into one item: the click opened the last filer's room, deciding one
//    retracted the other's pointer); F3 the ladder by key reads the LIVE index (a whole-index clone per call — twice per
//    proposal on every Outbox broadcast — was ~15 ms each at production size); F4 a wake card's words open with the SAME
//    capped name its ref carries (a 201–300-char title lost its lead and the card fell back to markdown); F5 a name made
//    only of characters that are not drawn (invisible operators, tag characters — the name door keeps them) names nothing
console.log('§5 verify r1: the id as a title, one item per conversation, the live index, the capped lead, the invisible name');
async function verifyRun(EM, UT, tag) {
  const A = 'vr1-' + tag;
  const LONG = 'Quarterly planning ' + 'x'.repeat(231);
  const CONVS = [
    { id: 'oc_byid', title: 'oc_byid', kind: 'dm' },
    { id: 'oc_teamA', title: 'Team', kind: 'group' },
    { id: 'oc_teamB', title: 'Team', kind: 'group' },
    { id: 'oc_long', title: LONG, kind: 'group' },
    { id: 'oc_ghost', title: '⁢⁣\u{E0041}\u{E0042}', kind: 'group' },
  ];
  const world = new Map(CONVS.map((c) => [c.id, []]));
  let seqNo = 0;
  const mint = (convId, text, author) => makeRecord({ adapterId: A, convId, vendorId: `${convId}-${++seqNo}`, at: Date.now() - 600e3 + seqNo * 1000, author: { ...author, isSelf: false, isBot: false }, text, mentions: [], attachments: [], replyTo: null, threadKey: convId, raw: {} });
  const mod = {
    kind: A,
    caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'unknown', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false },
    create() {
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null }; } },
        selfId() { return 'u-owner'; },
        async listConversations() { return { conversations: CONVS.map((c) => makeConversation({ id: c.id, vendorId: c.id, title: c.title, kind: c.kind, participants: '', lastAt: null })), cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: ['user'], why: null, at: Date.now() }; },
        async history(convId, { anchor = null, limit = 50 } = {}) {
          const all = world.get(convId) || [];
          let idx = 0;
          if (anchor) { const at = all.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; }
          const anchorFound = !anchor || idx > 0;
          const pending = all.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: anchorFound && drained, complete: anchorFound && drained };
        },
        async send() { return { ok: true, vendorMessageId: 'sent-1', at: Date.now(), sentAs: 'user' }; },
        async reconcile() { return { unknown: true }; },
      };
    },
  };
  const ladder = { calls: [], async deliverToConversation(cid, text, opts) { ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; }, stashFor() { return { stored: true, why: null }; }, stashPeek() { return []; } };
  const dir = path.join(ROOT, tag);
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: A, kind: A, label: 'Lark / 飞书', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: null }] }));
  const registry = CH.createChannelRegistry(); registry.register(mod);
  const userTodos = new UT({ dataDir: dir });
  const base = Date.now(); let offset = 0;
  const e = EM.create({ dataDir: dir, env: {}, registry, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, deliver: ladder, userTodos, serverSetting: () => undefined, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }], now: () => base + offset });
  try {
    await e.pass(A, { force: true });
    const agent = { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' } };
    for (const c of ['oc_byid', 'oc_long', 'oc_ghost']) await e.setAssignment(A, c, { ...agent, mode: 'all', notify: 'wake', dailyWakeCap: 100 });
    offset += 61e3;
    world.get('oc_byid').push(mint('oc_byid', 'ping', { id: 'u-bob', name: 'Bob' }));
    world.get('oc_long').push(mint('oc_long', 'hello', { id: 'u-ada', name: 'Ada' }));
    world.get('oc_ghost').push(mint('oc_ghost', 'boo', { id: 'u-cy', name: 'Cy' }));
    await e.pass(A, { force: true }); await e.settleWakes();
    const out = { wakes: {}, names: {} };
    for (const c of ['oc_byid', 'oc_long', 'oc_ghost']) {
      const w = ladder.calls.find((x) => x.opts && x.opts.spendReason === 'channel-message' && String(x.text).includes(`vibespace-channels reply ${c} `));
      out.wakes[c] = w ? { cardText: w.opts.cardText, channel: w.opts.channel || null } : null;
      out.names[c] = e.conversationName(A, c);
    }
    const AG = { ...agent.principal, groups: [], msgLevelFor: () => 'none' };
    for (const c of ['oc_teamA', 'oc_teamB']) await e.setReach(A, c, { principal: agent.principal, level: 'visible' });
    const pa = await e.propose(AG, A, 'oc_teamA', { text: 'for A' });
    const pb = await e.propose(AG, A, 'oc_teamB', { text: 'for B' });
    const ptrs = () => userTodos._state.items.filter((i) => i.status === 'open' && i.text === 'Proposals awaiting approval in Team').map((i) => (i.action && i.action.convId) || null).sort();
    out.states = [pa && pa.proposal && pa.proposal.state, pb && pb.proposal && pb.proposal.state];
    out.ptrsBoth = ptrs();
    // F3: whole-index clones while the Outbox view is drawn (every Outbox broadcast draws it)
    const orig = JSON.stringify; let clones = 0;
    JSON.stringify = function (v, ...rest) { if (v && typeof v === 'object' && v.conversations && typeof v.conversations === 'object' && !Array.isArray(v.conversations)) clones++; return orig.call(this, v, ...rest); };
    try { out.outboxN = e.outboxView().proposals.length; } finally { JSON.stringify = orig; }
    out.clones = clones;
    if (pa && pa.proposal) await e.reject(pa.proposal.id);
    await sleep(50);
    out.ptrsAfter = ptrs();
    return out;
  } finally { e.stop(); }
}
{
  const v = await verifyRun(ENG, UserTodoManager, 'vr1');
  const w1 = v.wakes.oc_byid, w4 = v.wakes.oc_long, w5 = v.wakes.oc_ghost;
  ok(v.names.oc_byid === 'Bob' && w1 && w1.channel && w1.channel.name === 'Bob' && w1.cardText.startsWith('Bob: 1 message') && !/oc_byid/.test(w1.cardText), 'F1 a listed single chat whose title IS its id (lark `name || chat_id`) is named by its other party — the card never says the id while ② is known', JSON.stringify({ name: v.names.oc_byid, w1 }));
  ok(v.states.join() === 'awaiting-approval,awaiting-approval' && JSON.stringify(v.ptrsBoth) === JSON.stringify(['oc_teamA', 'oc_teamB']), 'F2 two rooms of ONE name keep a For-you pointer EACH, each opening its own room (one merged item opened the last filer\'s)', JSON.stringify({ states: v.states, ptrs: v.ptrsBoth }));
  ok(JSON.stringify(v.ptrsAfter) === JSON.stringify(['oc_teamB']), 'F2 deciding one room\'s proposal retracts ITS pointer only — the other room still awaiting keeps its own', JSON.stringify(v.ptrsAfter));
  ok(v.outboxN === 2 && v.clones === 0, `F3 drawing the Outbox (${v.outboxN} proposals) clones the whole index 0 times (the ladder by key reads the live map)`, JSON.stringify({ n: v.outboxN, clones: v.clones }));
  ok(w4 && w4.channel && CR.splitLead(w4.cardText, w4.channel.name) !== null && w4.channel.name.length <= CR.NAME_MAX, 'F4 a 250-char title: the card\'s words open with the SAME capped name its ref carries (the lead splits — never the markdown fallback)', JSON.stringify(w4 && { name: w4.channel && w4.channel.name.length, text: w4.cardText.slice(0, 40) }));
  ok(v.names.oc_ghost === 'Cy' && w5 && w5.channel && w5.channel.name === 'Cy' && w5.cardText.startsWith('Cy: 1 message'), 'F5 a title of invisible characters only names nothing — the room is named by who wrote in it', JSON.stringify({ name: v.names.oc_ghost && [...v.names.oc_ghost].map((c) => c.codePointAt(0).toString(16)), w5 }));
  ok(CR.nameOf(['⁢\u{E0041}'], 'oc_x') === 'oc_x' && CR.nameOf(['Ada⁣'], 'oc_x') === 'Ada' && CR.nameOf(['\u{1F469}‍\u{1F4BB} dev'], 'x') === '\u{1F469}‍\u{1F4BB} dev', 'F5 the pure ladder drops what is not drawn (src/hidden-chars.js) and keeps the joiners an emoji needs');
  // the pre-fix CONTROLS: the lane head's lines restored — each leg above goes red
  let s = eng;
  s = swap(s, "    return said(titleOf(registry.capsOf(rec.kind), en.title)) || said(dmTitleOf(rec, en)) || CR.describeOf(en, { selfId: self }) || null;", "    return titleOf(registry.capsOf(rec.kind), en.title) || dmTitleOf(rec, en) || CR.describeOf(en, { selfId: self }) || null;");
  s = swap(s, "    const en = store.index.live()[`${adapterId}/${convId}`];", "    const en = store.index.snapshot().conversations[`${adapterId}/${convId}`];");
  s = swap(s, "    const cardText = `${CR.nameOf([title], convId)}: ${n} message", "    const cardText = `${title}: ${n} message");
  const todoPre = swap(read('src/user-todos.js'), ", 'open-channel': 'key', 'channel-api-proposal': 'id' });", ", 'channel-api-proposal': 'id' });");   // int212: B-2198's row after it
  const p = await verifyRun(MUT.load('src/server/channels-engine.js', s, 'vr1-pre'), MUT.load('src/user-todos.js', todoPre, 'vr1-todos-pre').UserTodoManager, 'vr1pre');
  ok(p.names.oc_byid === 'oc_byid' && p.wakes.oc_byid && p.wakes.oc_byid.cardText.startsWith('oc_byid: 1 message'), 'CONTROL F1: the lane head\'s ladder took the id-as-title for a name — "oc_byid: 1 message" with Bob known', JSON.stringify(p.wakes.oc_byid));
  ok(JSON.stringify(p.ptrsBoth) === JSON.stringify(['oc_teamB']) && JSON.stringify(p.ptrsAfter) === '[]', 'CONTROL F2: ONE merged item (it opened oc_teamB for both); rejecting oc_teamA\'s proposal retracted it — oc_teamB still awaiting, no pointer', JSON.stringify({ both: p.ptrsBoth, after: p.ptrsAfter }));
  ok(p.clones >= 4, `CONTROL F3: the lane head cloned the whole index ${p.clones} times for a 2-proposal Outbox view`);
  ok(p.wakes.oc_long && CR.splitLead(p.wakes.oc_long.cardText, p.wakes.oc_long.channel.name) === null, 'CONTROL F4: the lane head\'s 250-char card text does not open with its ref\'s capped name — the renderer fell back to markdown');
  ok(p.names.oc_ghost !== 'Cy' && p.wakes.oc_ghost && p.wakes.oc_ghost.channel.name !== 'Cy', 'CONTROL F5: the lane head named the room by its invisible title (nothing drawn, Cy known)', JSON.stringify(p.wakes.oc_ghost && p.wakes.oc_ghost.channel));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
