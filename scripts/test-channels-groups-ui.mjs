#!/usr/bin/env node
// THE IM-FIRST COMMUNICATION PANEL, fast half (design-communication-panel.zh.md
// §22 + §22.5, chunk g3; the heavy chrome half is test-channels-groups-e2e).
//
//   §1 PURE src/lib/channel-groups-view.js — the first screen's list (every
//      agent group + every TRACKED conversation of a non-built-in source,
//      sorted by last activity; archived apart; untracked / built-in rows
//      stay in their secondary sections), the composer's mode BY CONVERSATION
//      KIND (group ⇒ direct as You; external ⇒ direct when sendAsUser is
//      offered, the proposal path when only the bot is, a named reason
//      otherwise), the @-autocomplete, the member list (the owner first as
//      the observer), the picker (sessions by Task Group, each ONCE, never a
//      group whole), the wake echo and the persisted folds — AND THE WAKE
//      PREVIEW'S PARITY with the engine's own `wakeVerdict` over the whole
//      notify × mention table (the preview under the box and the server
//      cannot disagree about who a message wakes).
//   §2 THE SERVER HALVES g3 added, over the REAL engines + stores: the
//      owner's own message on an external conversation goes out DIRECTLY
//      (`direct:true` — no policy, no guard, `detail.ownMessage`), an agent's
//      `direct` is ignored, a conversation that does not offer send-as-user
//      refuses by name; the digest's `lastText` is the newest record's; the
//      groups engine's OWNER read mark (unread derived, moved only by the
//      owner's act, a no-op mark broadcasts nothing) and the live roster.
//   §3 SOURCE CENSUSES: every agent-controlled string (a group name, a member
//      name, an invite context, a last line, a message body) on the three
//      client files reaches the DOM through textContent — a planted
//      `innerHTML` of a group name is flagged by the same judge (negative
//      control); the composer's direct-send vs propose split is decided ONLY
//      by `composerMode` and posts to the route its mode names; no client
//      file branches on an adapter id; the fold is PATCHed to user state
//      under `channelsPanelFolds`; the i18n census knows the new DATA paths.
//   §4 WIRING PINS: the panel draws from `groupListRows`, the window asks
//      `composerMode` + `wakePreview`, the routes expose /send, /roster and
//      /:id/read, the engine publishes `lastText`.
//
// Per-pid scratch dirs (scripts/scratch.mjs). Zero vendor calls.
// Run: node scripts/test-channels-groups-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const V = await import(path.join(REPO, 'src/lib/channel-groups-view.js'));
const G = require(path.join(REPO, 'src/channel-groups.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));

const ROOT = scratch('chan-groups-ui');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');

// ── §1 PURE ───────────────────────────────────────────────────────────────
console.log('§1 channel-groups-view (PURE)');
{
  ok(V.GROUP_ADAPTER_ID === G.GROUP_ADAPTER_ID && V.NOTIFY_MODES === G.NOTIFY_MODES && V.OWNER === G.OWNER, 'the view re-exports the MODEL\'s spellings (namespace, notify modes, owner) — never its own copy');
  const adapters = [{ id: 'lark', kind: 'lark', label: 'Lark' }, { id: 'gmail', kind: 'gmail', label: 'Gmail' }, { id: 'agents', kind: 'agents', label: 'Agents', builtin: true }];
  const conversations = [
    { key: 'lark/c1', id: 'c1', adapterId: 'lark', adapterLabel: 'Lark', title: 'Ops room', tracked: true, lastAt: 3000, lastText: 'deploy done', unread: 2, kind: 'group' },
    { key: 'lark/c2', id: 'c2', adapterId: 'lark', adapterLabel: 'Lark', title: 'Untracked', tracked: false, lastAt: 9000, unread: 0 },
    { key: 'gmail/t1', id: 't1', adapterId: 'gmail', adapterLabel: 'Gmail', title: 'Invoice', tracked: true, lastAt: 1000, lastText: 'see attached', unread: 0, kind: 'thread' },
    { key: 'agents/s1', id: 's1', adapterId: 'agents', adapterLabel: 'Agents', title: 'worker', tracked: true, lastAt: 8000, unread: 1 },
  ];
  const groups = [
    { id: 'g-00000001', name: 'api lane', lastAt: 5000, lastText: 'hi', unread: 1, members: [{ member: 'a' }, { member: 'b' }, { member: 'c' }], pair: null },
    { id: 'g-00000002', name: 'alpha · beta', lastAt: 2000, pair: ['a', 'b'], members: [{ member: 'a' }, { member: 'b' }] },
    { id: 'g-00000003', name: 'old', lastAt: 7000, archivedAt: 7500, members: [] },
  ];
  const { rows, archived } = V.groupListRows({ groups, conversations, adapters });
  ok(JSON.stringify(rows.map((r) => r.key)) === JSON.stringify(['groups/g-00000001', 'lark/c1', 'groups/g-00000002', 'gmail/t1']), 'THE FIRST SCREEN: groups and TRACKED external conversations in ONE list, newest activity first', JSON.stringify(rows.map((r) => r.key)));
  ok(!rows.some((r) => r.id === 'c2') && !rows.some((r) => r.adapterId === 'agents'), '…an UNTRACKED conversation (no history to show) and the built-in agents SOURCES (the message watcher) are not in it');
  ok(archived.length === 1 && archived[0].id === 'g-00000003' && !rows.some((r) => r.id === 'g-00000003'), 'an archived group is listed apart (NEGATIVE CONTROL: its lastAt 7000 would otherwise lead the list)');
  const pairRow = rows.find((r) => r.id === 'g-00000002');
  const mailRow = rows.find((r) => r.id === 't1');
  ok(pairRow.pair === true && rows[0].memberCount === 3 && rows[0].unread === 1 && mailRow.mail === true && mailRow.sourceLabel === 'Gmail' && rows[1].lastText === 'deploy done', 'each row carries its source facts (pair / member count / unread / mail glyph / source label / last line)');
  const shuffled = V.groupListRows({ groups: groups.slice().reverse(), conversations: conversations.slice().reverse(), adapters });
  ok(JSON.stringify(shuffled.rows.map((r) => r.key)) === JSON.stringify(rows.map((r) => r.key)), 'the order is a property of the DATA, not of the input order');

  // the composer's mode BY CONVERSATION KIND
  const offers = (u, b, why = 'no-scope') => ({ sendAsUser: { offered: u, why: u ? null : why }, sendAsBot: { offered: b, why: b ? null : 'no-bot' } });
  ok(V.composerMode({ group: { id: 'g' } }).mode === 'group' && V.composerMode({ group: { id: 'g', archivedAt: 5 } }).mode === 'archived', 'a GROUP composes as You (group), an archived one not at all');
  ok(V.composerMode({ conv: { tracked: true, offers: offers(true, true) } }).mode === 'direct', 'an external conversation offering sendAsUser ⇒ DIRECT as you (even where a bot is offered too)');
  const pb = V.composerMode({ conv: { tracked: true, offers: offers(false, true, 'send-scope-not-granted') } });
  ok(pb.mode === 'propose' && pb.why === 'send-scope-not-granted', 'only the BOT identity ⇒ the proposal path, WITH the send-as-user reason (a bot is not the owner speaking)', JSON.stringify(pb));
  ok(V.composerMode({ conv: { tracked: false, offers: offers(false, false) } }).mode === 'untracked', 'untracked + nothing offered ⇒ the untracked footer');
  const ro = V.composerMode({ conv: { tracked: true, offers: offers(false, false, 'read-only-mailbox') } });
  ok(ro.mode === 'readonly' && ro.why === 'read-only-mailbox', 'nothing offered ⇒ read-only WITH the capability row\'s reason', JSON.stringify(ro));

  // the @-autocomplete
  ok(JSON.stringify(V.mentionQuery('hi @al', 6)) === '{"start":3,"query":"al"}' && JSON.stringify(V.mentionQuery('@', 1)) === '{"start":0,"query":""}', 'mentionQuery: an @ at the start or after a space opens a query');
  ok(V.mentionQuery('mail x@al', 9) === null && V.mentionQuery('hi @al there', 12) === null, 'NEGATIVE CONTROL: an address (x@al) and a finished word are not queries');
  ok(JSON.stringify(V.mentionQuery('@alp more', 4)) === '{"start":0,"query":"alp"}', 'the query is read up to the CARET, not the end of the text');
  const members = [{ member: 'a', name: 'alpha' }, { member: 'b', name: 'beta' }, { member: 'c', name: 'the alpha twin' }, { member: G.OWNER, name: 'me' }];
  ok(JSON.stringify(V.mentionCandidates(members, 'al').map((m) => m.member)) === '["a","c"]', 'candidates: prefix matches first, then substring; the OWNER is never a candidate');
  const ins = V.insertMention('hi @al', { start: 3, query: 'al' }, 'alpha');
  ok(ins.text === 'hi @alpha ' && ins.caret === 10, 'insertMention replaces the query with "@name " and puts the caret after it', JSON.stringify(ins));

  // the member list + the picker
  const mr = V.memberRows({ createdBy: 'a', members: [{ member: 'a', name: 'alpha', notify: 'always', live: true }, { member: 'b', name: 'beta', notify: 'bogus' }] });
  ok(mr[0].owner === true && mr[0].member === G.OWNER && mr.length === 3 && mr[1].creator === true && mr[2].notify === G.DEFAULT_NOTIFY && mr[2].live === false, 'memberRows: the owner FIRST as the observer, then members in join order; an unknown stored mode reads as the default');
  const secs = V.pickerSections([
    { cid: 'x1', name: 'zeta', groups: ['tg2'] }, { cid: 'x2', name: 'alpha', groups: ['tg1', 'tg2'] }, { cid: 'x3', name: 'loner', groups: [] }, { cid: 'x2', name: 'alpha', groups: ['tg1'] }, { cid: 'x4', name: 'in', groups: ['tg1'] },
  ], [{ id: 'tg1', title: 'Backend' }, { id: 'tg2', title: 'Api' }], { exclude: ['x4'] });
  ok(JSON.stringify(secs.map((s) => s.title)) === '["Api","Backend",null]' && secs.flatMap((s) => s.sessions).length === 4, 'picker: one section per Task Group (by title), sessions in no group LAST, each session ONCE (a duplicate roster row and a two-group member are listed once)', JSON.stringify(secs));
  ok(secs.find((s) => s.title === 'Backend').sessions.find((x) => x.cid === 'x4').disabled === true && secs.every((s) => !('selected' in s) && s.sessions.every((x) => !('checked' in x))), 'an existing member is DISABLED; nothing — no section, no session — arrives pre-selected (D1: a Task Group is never added whole)');

  // wake echo + folds
  ok(JSON.stringify(V.wakeCount({ woke: [1, 2], refused: [3], later: [] })) === '{"woke":2,"refused":1,"later":0}' && JSON.stringify(V.wakeCount(null)) === '{"woke":0,"refused":0,"later":0}', 'wakeCount: the answer\'s woke / refused / later counts, zero when absent');
  ok(JSON.stringify(V.foldsFrom({ channelsPanelFolds: { accounts: true, watcher: 'yes', junk: true } })) === '{"accounts":true,"watcher":false}' && JSON.stringify(V.foldsFrom(null)) === '{"accounts":false,"watcher":false}', 'foldsFrom: only the KNOWN parts, only a literal true folds (user state never grows from this map)');

  // THE PARITY: wakePreview ≡ the engine's wakeVerdict over notify × mention
  const names = { a: 'alpha', b: 'beta', c: 'gamma lane' };
  let rowsChecked = 0, mismatches = [];
  for (const na of G.NOTIFY_MODES) for (const nb of G.NOTIFY_MODES) for (const nc of G.NOTIFY_MODES) {
    const group = { id: 'g-0000000a', createdBy: G.OWNER, members: [{ member: 'a', name: names.a, notify: na, joinedAt: 1 }, { member: 'b', name: names.b, notify: nb, joinedAt: 1 }, { member: 'c', name: names.c, notify: nc, joinedAt: 1 }] };
    for (const text of ['plain words', 'hey @alpha', '@gamma lane and @beta please', 'mail x@alpha.com', '@alphabet is not alpha']) {
      const mentions = G.mentionsIn(text, group.members).map((m) => ({ id: m.id, name: m.name }));
      const rec = { author: { id: G.OWNER }, text, mentions, raw: { kind: 'message' } };
      const server = group.members.filter((m) => G.wakeVerdict(group, m.member, rec).wake).map((m) => m.member).sort().join(',');
      const client = V.wakePreview(group, text).map((x) => x.member).sort().join(',');
      rowsChecked++;
      if (server !== client) mismatches.push(`${na}/${nb}/${nc} "${text}": server=${server} client=${client}`);
    }
  }
  ok(rowsChecked === 64 * 5 && mismatches.length === 0, `WAKE PREVIEW PARITY: over all ${rowsChecked} rows (notify³ × five texts) the preview names exactly who the engine's wakeVerdict wakes`, mismatches.slice(0, 5).join('\n    '));
  // NEGATIVE CONTROL: a preview that forgot `mute` beats an @ disagrees with the engine
  const brokenPreview = (group, text) => { const named = new Set(G.mentionsIn(text, group.members).map((x) => x.id)); return group.members.filter((m) => named.has(m.member) || m.notify === 'always'); };
  const gMute = { members: [{ member: 'a', name: 'alpha', notify: 'mute', joinedAt: 1 }] };
  const recMute = { author: { id: G.OWNER }, text: '@alpha', mentions: [{ id: 'a' }], raw: { kind: 'message' } };
  ok(brokenPreview(gMute, '@alpha').length === 1 && !G.wakeVerdict(gMute, 'a', recMute).wake && V.wakePreview(gMute, '@alpha').length === 0, 'NEGATIVE CONTROL: a preview that lets an @ beat mute is caught by the same comparison (the engine says no, the real preview agrees)');
  ok(V.wakePreview({ archivedAt: 1, members: [{ member: 'a', name: 'alpha', notify: 'always' }] }, 'x').length === 0 && V.wakePreview({ members: [{ member: 'a', name: 'alpha', notify: 'always' }] }, '   ').length === 0, 'an archived group or an empty draft previews nobody');
}

// ── §2 THE SERVER HALVES (real engines, real stores) ─────────────────────
console.log('§2 the owner\'s own send, the digest\'s last line, the owner\'s read mark');
{
  const dataDir = path.join(ROOT, 'eng');
  fs.mkdirSync(dataDir, { recursive: true });
  const events = [];
  const eng = ENG.create({
    dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: (m) => events.push(m), userTodos: null,
    deliver: { async deliverToConversation() { return { ok: false, reason: 'no lane', refused: 'no-wake' }; }, stashFor() {} },
    serverSetting: () => undefined, log: { log() {}, warn() {}, error() {} },
    liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }],
  });
  const A = 'fake-poll', C = 'fake-poll-ops';
  await eng.pass(A, { force: true });
  await eng.setTracked(A, C, true);
  await eng.pass(A, { force: true });
  const newest = eng.store.readTail(A, C, { limit: 1 })[0];
  const row = eng.digest().conversations.find((c) => c.key === `${A}/${C}`);
  ok(newest && row && row.lastText === String(newest.text).replace(/\s+/g, ' ').trim().slice(0, 160) && row.lastText.length > 0, 'the digest\'s `lastText` is the NEWEST logged record\'s text (one line, bounded)', JSON.stringify({ lastText: row && row.lastText, newest: newest && newest.text }));
  const untracked = eng.digest().conversations.find((c) => c.key === `${A}/fake-poll-announce`);
  ok(untracked && untracked.lastText === '', 'CONTROL: an untracked conversation (nothing ingested) has no last line');

  const own = await eng.propose({ kind: 'user' }, A, C, { text: 'from me, see https://example.com/x', direct: true });
  ok(own.ok && own.proposal.state === 'sent' && own.decision.mode === 'direct' && own.decision.reasons.length === 0 && own.decision.detail.ownMessage === true && own.proposal.sendAs === 'user', 'THE OWNER\'S OWN MESSAGE: `direct` from the user is SENT at once as the user — no policy, no guard (the link would force review), `detail.ownMessage`', JSON.stringify([own.proposal && own.proposal.state, own.decision]));
  const viaPolicy = await eng.propose({ kind: 'user' }, A, C, { text: 'from me, see https://example.com/x' });
  ok(viaPolicy.ok && viaPolicy.proposal.state === 'awaiting-approval' && viaPolicy.decision.reasons.includes('links'), 'NEGATIVE CONTROL: the same text WITHOUT `direct` goes through the policy (review, the link guard named)', JSON.stringify(viaPolicy.decision));
  await eng.setReach(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, level: 'visible' });
  const agentDirect = await eng.propose({ kind: 'agent', id: 'agent-1', name: 'Worker', groups: ['g1'], msgLevelFor: () => 'none' }, A, C, { text: 'agent says', direct: true });
  ok(agentDirect.ok && agentDirect.proposal.state === 'awaiting-approval' && !agentDirect.decision.detail.ownMessage, 'an AGENT\'s `direct` is IGNORED — agent drafts are what the policy exists for', JSON.stringify(agentDirect.decision));
  await eng.pass('fake-push', { force: true });
  const noUser = await eng.propose({ kind: 'user' }, 'fake-push', 'fake-push-ops', { text: 'x', direct: true });
  ok(!noUser.ok && noUser.code === 'send-not-available' && typeof noUser.why === 'string', 'a conversation that does not offer send-as-user refuses the direct send BY NAME, creating nothing', JSON.stringify(noUser));
  const audit = fs.readFileSync(path.join(dataDir, 'channels', 'audit.ndjson'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.kind === 'outbox' && x.proposalId === own.proposal.id).map((x) => x.op);
  ok(JSON.stringify(audit) === '["propose","attempt","outcome"]', 'the direct send still rides the outbox machinery: propose → attempt → outcome in the audit (a lost answer stays `unknown`, never re-sent)', JSON.stringify(audit));
  eng.stop && eng.stop();

  // the groups engine: the owner's read mark + the roster
  const store = createChannelStore({ dir: path.join(ROOT, 'groups', 'channels') });
  const roster = [{ cid: 'aaaaaaaa-1111-4000-8000-000000000001', name: 'alpha', groups: ['tg1'] }, { cid: 'bbbbbbbb-2222-4000-8000-000000000002', name: 'beta', groups: [] }];
  const bc = [];
  let tnow = Date.UTC(2026, 8, 22, 10, 0, 0);
  const ge = GE.create({ store, deliver: { async deliverToConversation() { return { ok: false, reason: 'test' }; } }, broadcast: (m) => bc.push(m), now: () => (tnow += 1000), roster: () => roster, log: { info() {}, warn() {}, log() {} } });
  const made = await ge.create({ by: G.OWNER, name: 'lane', members: roster.map((r) => r.cid), quiet: true });
  const gid = made.group.id;
  ok(made.ok && ge.list().find((g) => g.id === gid).unread === 0, 'the owner\'s OWN create leaves nothing unread for the owner (its records are the owner\'s)');
  await ge.post({ group: gid, from: roster[0].cid, text: 'agent speaks' });
  await ge.post({ group: gid, from: roster[1].cid, text: 'another' });
  ok(ge.list().find((g) => g.id === gid).unread === 2, 'two agent messages ⇒ unread 2 for the owner (derived from the log after the mark)');
  await ge.post({ group: gid, from: G.OWNER, text: 'owner answers' });
  ok(ge.list().find((g) => g.id === gid).unread === 0, 'the owner posting moves the owner\'s mark (the owner has seen what it answered)');
  await ge.post({ group: gid, from: roster[0].cid, text: 'again' });
  const before = bc.length;
  const m1 = await ge.markRead({ group: gid });
  ok(m1.ok && m1.moved === true && bc.length === before + 1 && ge.list().find((g) => g.id === gid).unread === 0, 'markRead (the owner opened the window) moves the mark and broadcasts ONCE');
  const m2 = await ge.markRead({ group: gid });
  ok(m2.ok && m2.moved === false && bc.length === before + 1, 'NEGATIVE CONTROL: an unchanged mark broadcasts NOTHING (an unchanged value is not a dirty signal)');
  const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, 'groups', 'channels', 'groups.json'), 'utf-8'));
  ok(onDisk.ownerRead && onDisk.ownerRead[gid] === onDisk.groups[gid].lastAt && G.validateGroup(onDisk.groups[gid]).ok, 'the mark is persisted beside `groups` through the store\'s door, and the group record still validates');
  const lr = ge.liveRoster();
  ok(lr.length === 2 && lr[0].cid === roster[0].cid && lr[0].name === 'alpha' && JSON.stringify(lr[0].groups) === '["tg1"]', 'liveRoster: the live sessions with their Task Groups (structure; the dialog words it)');
  const nf = await ge.markRead({ group: 'g-deadbeef' });
  ok(!nf.ok && nf.code === 'not-found', 'markRead of an unknown group refuses by name');
}

// ── §3 SOURCE CENSUSES ────────────────────────────────────────────────────
console.log('§3 censuses: XSS, the composer split, no adapter id, the fold, the i18n data paths');
const CLIENT = ['src/lib/channels-panel.js', 'src/lib/channel-window.js', 'src/lib/channel-group-dialogs.js', 'src/lib/channel-groups-view.js', 'src/lib/channel-words.js'];
{
  const strip = (s) => s.replace(/^\s*(\*|\/\/).*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  /** the judge: an innerHTML / insertAdjacentHTML / outerHTML write whose right-hand side is not the icon library or an escHtml'd template */
  const judge = (src) => {
    const bad = [];
    for (const m of strip(src).matchAll(/\.(innerHTML|outerHTML)\s*=\s*([^;\n]+)|insertAdjacentHTML\(([^;\n]+)/g)) {
      const rhs = (m[2] || m[3] || '').trim();
      if (/^UI_ICONS\[|^''$|^""$/.test(rhs)) continue;
      bad.push(rhs.slice(0, 80));
    }
    return bad;
  };
  const found = {};
  for (const f of CLIENT) found[f] = judge(read(f));
  ok(Object.values(found).every((b) => b.length === 0), 'XSS: no innerHTML/outerHTML/insertAdjacentHTML write on the five files (every group name, member name, context and last line is textContent)', JSON.stringify(found));
  const planted = read('src/lib/channels-panel.js').replace('title.textContent = r.title;', 'title.innerHTML = r.title;');
  ok(planted !== read('src/lib/channels-panel.js') && judge(planted).length === 1, 'NEGATIVE CONTROL: a planted `title.innerHTML = r.title` (a hostile group name) is FLAGGED by the same judge');
  const P = read('src/lib/channels-panel.js'), W = read('src/lib/channel-window.js'), D = read('src/lib/channel-group-dialogs.js');
  ok(/title\.textContent = r\.title;/.test(P) && /last\.textContent = r\.lastText \|\| '';/.test(P) && /src\.textContent = r\.kind === 'group'/.test(P), 'the group row: name, last line and source chip through textContent');
  ok(/el\('div', 'chanmsg-ctx', raw\.context\)/.test(W) && /el\('div', 'chanmsg-body', rec\.text \|\| ''\)/.test(W) && /titleRow\.appendChild\(el\('b', '', group\.name \|\| groupId\)\)/.test(W), 'the group window: invite context, message body and the group name through el() (textContent)');
  ok(/el\('span', 'chan-gm-name', m\.owner \? t\('You \(observer\)'\) : m\.name\)/.test(D) && /el\('span', 'chan-gpick-name', s\.name\)/.test(D) && /t\('Group — \{name\}', \{ name: group\.name \}\)/.test(D), 'the dialogs: member names, picker names and the title (createModalShell textContent) never innerHTML');
  ok(!/showContextMenu\([^)]*labelHtml/.test(P + W + D) && !/labelHtml/.test(W + D), 'the group menus use plain `label` (textContent) — never `labelHtml`');

  // the composer split
  ok((W.match(/composerMode\(/g) || []).length === 2 && /const cm = composerMode\(\{ conv: c \}\);/.test(W) && /const mode = composerMode\(\{ group \}\);/.test(W), 'the composer\'s kind is decided ONLY by composerMode — once for a channel conversation, once for a group');
  ok(/\$\{direct \? 'send' : 'propose'\}/.test(W) && /fetchJson\(`\/api\/channel-groups\/\$\{encodeURIComponent\(groupId\)\}\/post`/.test(W), 'a direct composer posts to /send, a proposal composer to /propose, a GROUP composer to /api/channel-groups/:id/post (never /propose)');
  const grpBlock = W.slice(W.indexOf('function openGroupWindow'));
  ok(grpBlock.length > 1000 && !/\/propose/.test(grpBlock) && !/channel-outbox/.test(grpBlock), 'the group window has NO proposal path at all (the owner\'s own words; agent drafts keep the outbox)');
  // no adapter-id branch on the client
  const ids = /['"](lark|gmail|fake-poll|fake-push|fake-scan|telegram)['"]/;
  const idHits = CLIENT.filter((f) => ids.test(strip(read(f))));
  ok(idHits.length === 0, 'no client file names an adapter id (gate on the capability row — channel-caps — never an id)', idHits.join(', '));
  ok(!/a\.kind === 'agents'|a\.id === 'agents'/.test(P) && /const builtinAgents = !!a\.builtin;/.test(P), 'the built-in section is found by its `builtin` FACT, not by the id "agents" (the pre-g3 panel spelled both)');
  // the fold
  ok(/body: JSON\.stringify\(\{ channelsPanelFolds: FOLDS \}\)/.test(P) && /method: 'PATCH'/.test(P) && /FOLDS = foldsFrom\(/.test(P) && /msg\.type === 'user-state-updated' && msg\.state && msg\.state\.channelsPanelFolds/.test(P), 'the secondary sections\' fold is PATCHed to user state (`channelsPanelFolds`, merge-only), read through foldsFrom, and followed from other clients');
  // the i18n census knows the new data paths
  const I = await import(path.join(REPO, 'scripts/test-channels-i18n.mjs'));
  const need = ['chan-grow-title', 'chan-grow-last', 'chan-src-chip', 'chan-gm-name', 'chan-gpick-name', 'chanmsg-ctx', 'chanmsg-sys-line', 'chan-mention-item'];
  ok(need.every((c) => I.DATA_PATH_CLASSES.includes(c)), 'the i18n census excuses the NEW data paths (group name / last line / source label / member + picker names / context / system line / mention item) BY PATH', need.filter((c) => !I.DATA_PATH_CLASSES.includes(c)).join(', '));
  const leak = I.census([{ text: 'Members & notifications', paths: ['div.chan-gm-list < div.dialog-body'], surfaces: ['panel-02-tracked'] }]);
  ok(leak.violations.length === 1, 'NEGATIVE CONTROL: a CHROME string on a group surface (not a data path) is still a violation');
}

// ── §4 WIRING PINS ────────────────────────────────────────────────────────
console.log('§4 wiring pins');
{
  const P = read('src/lib/channels-panel.js'), W = read('src/lib/channel-window.js'), R = read('src/routes/channels.js'), E = read('src/server/channels-engine.js'), S = read('src/channel-store.js'), GEsrc = read('src/server/groups-engine.js');
  ok(/const \{ rows, archived \} = groupListRows\(\{ groups: groups \|\| \[\], conversations: convs, adapters \}\);/.test(P), 'PIN: the panel\'s first screen is drawn from groupListRows');
  ok(/if \(msg\.type === 'channel-groups-updated'\) \{[\s\S]{0,200}groups = msg\.groups;\s*\n\s*draw\(\);/.test(P), 'PIN: the panel repaints the group list from the broadcast\'s list (no fetch)');
  ok(/if \(isGroupConv\(adapterId\)\) \{ root\.classList\.add\('chanwin-group'\); return openGroupWindow\(/.test(W) && /const w = wakePreview\(group, ta\.value\);/.test(W), 'PIN: the window routes a group to openGroupWindow and previews the wake under the box');
  ok(/router\.post\('\/api\/channels\/:adapterId\/:convId\/send'[\s\S]{0,300}direct: true/.test(R) && /router\.get\('\/api\/channel-groups\/roster'/.test(R) && /case 'read': r = await ge\.markRead\(\{ group \}\)/.test(R), 'PIN: the routes expose /send (direct), /channel-groups/roster and the owner\'s /read');
  ok(/const own = !!\(input && input\.direct === true\) && \(!ctx \|\| ctx\.kind === 'user'\);/.test(E) && /lastText: en\.lastText \|\| ''/.test(E), 'PIN: the engine\'s own-message rule is the USER\'s only, and the digest carries lastText');
  ok(/return \{ appended: fresh\.length, duplicates, lastAt, lastText,/.test(S), 'PIN: the store\'s append answers the newest record\'s text');
  const RL = read('src/lib/sidebar-rail.js');
  ok(/msg\.type === 'channel-groups-updated' && Array\.isArray\(msg\.groups\)\) this\._railChanBadge\('grp'/.test(RL) && /this\._railChanBadge\('ch', \(msg\.digest\.unreadTotal/.test(RL) && !/_railSetBadge\('channels'/.test(RL.replace(/_railChanBadge\(part, n\) \{[\s\S]*?\n    \},/, '')), 'PIN: the rail\'s Channels badge sums BOTH halves (the digest and the groups\' owner unread) through _railChanBadge — no other writer of that badge');
  ok(/if \(from === G\.OWNER\) ownerSaw\(gr, g\);/.test(GEsrc) && /list = \(\) => Object\.values\(all\(\)\)\.map\(\(g\) => \(\{ \.\.\.view\(g\), unread: ownerUnread\(g\) \}\)\)/.test(GEsrc), 'PIN: the owner\'s post moves the owner mark inside the door, and the owner list carries the derived unread');
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
