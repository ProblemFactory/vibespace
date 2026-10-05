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
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
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
    { key: 'lark/c2', id: 'c2', adapterId: 'lark', adapterLabel: 'Lark', title: 'Never tracked', lastAt: 9000, unread: 0 },
    { key: 'lark/c3', id: 'c3', adapterId: 'lark', adapterLabel: 'Lark', title: 'Left the chat', unlisted: true, lastAt: 9500, unread: 0 },
    { key: 'gmail/t1', id: 't1', adapterId: 'gmail', adapterLabel: 'Gmail', title: 'Invoice', tracked: true, lastAt: 1000, lastText: 'see attached', unread: 0, kind: 'thread' },
    { key: 'agents/s1', id: 's1', adapterId: 'agents', adapterLabel: 'Agents', title: 'worker', tracked: true, lastAt: 8000, unread: 1 },
  ];
  const groups = [
    { id: 'g-00000001', name: 'api lane', lastAt: 5000, lastText: 'hi', unread: 1, members: [{ member: 'a' }, { member: 'b' }, { member: 'c' }], pair: null },
    { id: 'g-00000002', name: 'alpha · beta', lastAt: 2000, pair: ['a', 'b'], members: [{ member: 'a' }, { member: 'b' }] },
    { id: 'g-00000003', name: 'old', lastAt: 7000, archivedAt: 7500, members: [] },
  ];
  const { rows, archived } = V.groupListRows({ groups, conversations, adapters });
  ok(JSON.stringify(rows.map((r) => r.key)) === JSON.stringify(['lark/c2', 'groups/g-00000001', 'lark/c1', 'groups/g-00000002', 'gmail/t1']), 'THE FIRST SCREEN: groups and EVERY conversation of a linked account in ONE list (2026-09-26: an aggregated IM, no track step), newest activity first', JSON.stringify(rows.map((r) => r.key)));
  ok(!rows.some((r) => r.id === 'c3') && !rows.some((r) => r.adapterId === 'agents'), '…a conversation the vendor no longer lists (unlisted) and the built-in agents SOURCES (the message watcher) are not in it');
  ok(archived.length === 1 && archived[0].id === 'g-00000003' && !rows.some((r) => r.id === 'g-00000003'), 'an archived group is listed apart (NEGATIVE CONTROL: its lastAt 7000 would otherwise lead the list)');
  const pairRow = rows.find((r) => r.id === 'g-00000002');
  const mailRow = rows.find((r) => r.id === 't1');
  const g1 = rows.find((r) => r.id === 'g-00000001'), c1 = rows.find((r) => r.id === 'c1');
  ok(pairRow.pair === true && g1.memberCount === 3 && g1.unread === 1 && mailRow.mail === true && mailRow.sourceLabel === 'Gmail' && c1.lastText === 'deploy done', 'each row carries its source facts (pair / member count / unread / mail glyph / source label / last line)');
  const shuffled = V.groupListRows({ groups: groups.slice().reverse(), conversations: conversations.slice().reverse(), adapters });
  ok(JSON.stringify(shuffled.rows.map((r) => r.key)) === JSON.stringify(rows.map((r) => r.key)), 'the order is a property of the DATA, not of the input order');

  // B-5fe1 (the owner, 2026-10-01 asks 4: "头像上展示来源角标…多色的，因为可能有多个账号属于同一个供应商，或者展示一个小字"):
  // THE ACCOUNT BADGE — a hue per ACCOUNT (two of one vendor never share one), the vendor glyph by the account's KIND,
  // the account's title in small text at ≥ 2 accounts of a kind
  {
    const AV = await import(path.join(REPO, 'src/lib/channel-avatar.js'));
    // two Lark account ids whose own hash lands on the SAME hue — the case a hash alone would draw alike
    const ids = Array.from({ length: 64 }, (_, i) => `lark:${(0x1000 + i).toString(16)}`);
    let pairIds = null;
    for (let i = 0; i < ids.length && !pairIds; i++) for (let j = i + 1; j < ids.length && !pairIds; j++) if (AV.hueOf('account/' + ids[i]) === AV.hueOf('account/' + ids[j])) pairIds = [ids[i], ids[j]];
    const accts = [{ id: pairIds[1], kind: 'lark', label: 'Work' }, { id: pairIds[0], kind: 'lark', label: 'Home' }, { id: 'gmail:1', kind: 'gmail', label: 'Fish' }, { id: 'agents', kind: 'agents', label: 'Agents', builtin: true }];
    const B = AV.accountBadges(accts), B2 = AV.accountBadges(accts.slice().reverse());
    const a0 = B.get(pairIds[0]), a1 = B.get(pairIds[1]), gm = B.get('gmail:1');
    ok(!!pairIds && a0 && a1 && a0.hue !== a1.hue && Number.isInteger(a0.hue) && Number.isInteger(a1.hue) && a0.glyph === 'vendor-lark' && a1.glyph === 'vendor-lark' && a0.multi && a1.multi && a0.label === 'Home' && a1.label === 'Work',
      `B-5fe1: two Lark accounts whose ids HASH to the same hue (${pairIds && pairIds.join(' / ')}) still wear DIFFERENT hues (${a0 && a0.hue} / ${a1 && a1.hue}), the vendor glyph by kind, \`multi\` (2 accounts of one kind), each its own title`, JSON.stringify([...B]));
    ok(gm && gm.glyph === 'vendor-gmail' && gm.multi === false && B.get('agents') && B.get('agents').internal === true && JSON.stringify([...B].sort()) === JSON.stringify([...B2].sort()),
      'B-5fe1: a single Gmail account is not `multi` (no small title); the built-in watcher wears the VibeSpace badge (lane channels-badges); the table is a function of the account LIST, not its order (every client draws the same hues)', JSON.stringify([...B2]));
    const own = AV.accountBadges([{ id: pairIds[0], kind: 'lark' }]).get(pairIds[0]);
    ok(own.hue === AV.hueOf('account/' + pairIds[0]), 'B-5fe1: an account no sibling crowds keeps its OWN hash hue (adding an unrelated vendor\'s account never repaints it)', JSON.stringify(own));
    const many = AV.accountBadges(Array.from({ length: AV.AVATAR_HUES }, (_, i) => ({ id: `lark:${i}`, kind: 'lark' })));
    ok(new Set([...many.values()].map((x) => x.hue)).size === AV.AVATAR_HUES, `B-5fe1: ${AV.AVATAR_HUES} accounts of one vendor wear ${AV.AVATAR_HUES} different hues`);
    const R2 = V.groupListRows({ groups: [], conversations: [{ key: `${pairIds[0]}/c`, id: 'c', adapterId: pairIds[0], title: 'Ops', lastAt: 2 }, { key: `${pairIds[1]}/d`, id: 'd', adapterId: pairIds[1], title: 'Ops', lastAt: 1 }], adapters: accts }).rows;
    ok(R2.length === 2 && R2[0].account && R2[1].account && R2[0].account.hue !== R2[1].account.hue && R2[0].account.label === 'Home' && R2[0].account.multi === true,
      'B-5fe1: the first screen\'s rows carry their ACCOUNT badge — the same "Ops" in two Lark accounts is two colours and two titles', JSON.stringify(R2.map((r) => r.account)));
    // PRE-FIX CONTROLS (patched ESM copies): the base row model (no account) and a hue by hash alone
    const MC = mutantCopies('chan-b5fe1', REPO);
    const VS = read('src/lib/channel-groups-view.js'), AS = read('src/lib/channel-avatar.js');
    const CARRY = ', account: badges.get(c.adapterId) || null,';
    const PROBE = '    for (let i = 0; i < AVATAR_HUES && used.has(hue); i++) hue = (hue + 1) % AVATAR_HUES;\n';
    ok(VS.split(CARRY).length === 2 && AS.split(PROBE).length === 2, 'CONTROL setup: the row\'s account carry and the hue probe are each spelled once');
    const V0 = await import(MC.write('src/lib/channel-groups-view.js', VS.replace(CARRY, ','), 'b5fe1-no-account', { esm: true }));
    const R0 = V0.groupListRows({ groups: [], conversations: [{ key: `${pairIds[0]}/c`, id: 'c', adapterId: pairIds[0], title: 'Ops', lastAt: 2 }], adapters: accts }).rows;
    ok(R0.length === 1 && !R0[0].account, 'CONTROL: the base row model carries no account — the avatar has no badge to draw and the leg above would be red', JSON.stringify(R0[0] && R0[0].account));
    const AV0 = await import(MC.write('src/lib/channel-avatar.js', AS.replace(PROBE, ''), 'b5fe1-hash-only', { esm: true }));
    const B0 = AV0.accountBadges(accts);
    ok(B0.get(pairIds[0]).hue === B0.get(pairIds[1]).hue, 'CONTROL: a hue by the account\'s hash alone paints the two Lark accounts ALIKE — the hue leg would be red', JSON.stringify([...B0]));
    for (const c of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 2, label: 'chan-b5fe1: ' })) ok(c.pass, c.name, c.pass ? undefined : c.detail);
    // the wiring: the panel row and the window bar pass the badge; line 1 says the account at ≥ 2; the route names the accounts
    const PS = read('src/lib/channels-panel.js'), WS = read('src/lib/channel-window.js'), RS = read('src/routes/channels.js'), CS = read('src/lib/channel-chrome.js');
    ok(/convAvatar\(\{ key: r\.key, [^\n]*badge: r\.account(?: \}|, pic: )/.test(PS) && /const acct = r\.account && r\.account\.multi \? r\.account\.label : '';/.test(PS) && /chanEl\('span', 'chan-grow-acct', acct\)/.test(PS) && /\} else if \(!acct\) \{/.test(PS),
      'B-5fe1 PIN: the first-screen row draws its account badge, says the account in small text at ≥ 2 accounts of a kind (one account name per row: the source chip stays away)');
    ok(/const badge = accountBadges\(r\.accounts \|\| /.test(WS) && /convAvatar\(\{ key: `\$\{adapterId\}\/\$\{convId\}`, title: shownTitle, kind: c\.kind, badge \}/.test(WS) && /accounts: eng\.accountsBrief\(\)/.test(RS) && /b\.className = 'chan-av-badge';/.test(CS) && /UI_ICONS\[badge\.glyph\] \? badge\.glyph : 'chat'/.test(CS),
      'B-5fe1 PIN: the window bar wears the same badge (its hue from the WHOLE account list the conversation route names); the badge is a library glyph inside the avatar (paint)');
  }

  // the composer's mode BY CONVERSATION KIND
  const offers = (u, b, why = 'no-scope') => ({ sendAsUser: { offered: u, why: u ? null : why }, sendAsBot: { offered: b, why: b ? null : 'no-bot' } });
  ok(V.composerMode({ group: { id: 'g' } }).mode === 'group' && V.composerMode({ group: { id: 'g', archivedAt: 5 } }).mode === 'archived', 'a GROUP composes as You (group), an archived one not at all');
  ok(V.composerMode({ conv: { offers: offers(true, true) } }).mode === 'direct', 'an external conversation offering sendAsUser ⇒ DIRECT as you (even where a bot is offered too)');
  const pb = V.composerMode({ conv: { offers: offers(false, true, 'send-scope-not-granted') } });
  ok(pb.mode === 'propose' && pb.why === 'send-scope-not-granted', 'only the BOT identity ⇒ the proposal path, WITH the send-as-user reason (a bot is not the owner speaking)', JSON.stringify(pb));
  ok(V.composerMode({ conv: { tracked: false, offers: offers(false, false, 'read-only-mailbox') } }).mode === 'readonly', 'a stale `tracked:false` changes nothing — there is no untracked footer any more (2026-09-26)');
  const ro = V.composerMode({ conv: { offers: offers(false, false, 'read-only-mailbox') } });
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

  // lane channels-badges: ONE badge per account — the account card's icon IS its rows' badge (one record, one element),
  // titled by the account's name; VibeSpace's own talk wears the VibeSpace badge; the internal fold is a persisted part
  {
    const AV = await import(path.join(REPO, 'src/lib/channel-avatar.js'));
    const IC = await import(path.join(REPO, 'src/lib/icons.js'));
    const accts = [{ id: 'gmail:a', kind: 'gmail', label: 'Office', auth: { user: 'ada@example.com' } }, { id: 'gmail:b', kind: 'gmail', label: 'Gmail', auth: { user: 'Gmail' } },
      { id: 'lark:1', kind: 'lark', label: 'Lark', auth: { self: true, user: 'me' } }, { id: 'agents', kind: 'agents', label: 'Agents', builtin: true }];
    const B = AV.accountBadges(accts);
    ok(B.get('gmail:a').title === 'Office · ada@example.com' && B.get('gmail:b').title === 'Gmail' && B.get('lark:1').title === 'Lark',
      'channels-badges: a badge\'s title NAMES its account as its card does (label · the signed-in user; a self token or a user equal to the label adds nothing)', JSON.stringify([...B]));
    ok(B.get('agents') === AV.INTERNAL_BADGE && AV.INTERNAL_BADGE.internal === true && AV.INTERNAL_BADGE.glyph === 'vibespace' && AV.INTERNAL_BADGE.hue === null && Object.isFrozen(AV.INTERNAL_BADGE),
      'channels-badges: the built-in agents source wears the VibeSpace badge (the product mark, no account hue)');
    const svg = IC.UI_ICONS.vibespace || '';
    ok(/^<svg /.test(svg) && (svg.match(/<rect /g) || []).length === 3 && !/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(svg) && /fill="currentColor"/.test(svg),
      'channels-badges: the VibeSpace mark is a library SVG (the favicon\'s three stacked windows) in currentColor — never a literal colour');
    const R = V.groupListRows({ groups: [{ id: 'g1', name: 'lane', members: [], lastAt: 5 }, { id: 'p1', name: 'a · b', pair: ['x', 'y'], members: [], lastAt: 4 }],
      conversations: [{ key: 'gmail:a/c', id: 'c', adapterId: 'gmail:a', title: 'Ticket', lastAt: 3 }], adapters: accts }).rows;
    const byId = Object.fromEntries(R.map((r) => [r.id, r]));
    ok(byId.g1.account === AV.INTERNAL_BADGE && byId.p1.account === AV.INTERNAL_BADGE && byId.g1.internal === true && byId.p1.internal === true && !byId.c.internal
      && JSON.stringify(byId.c.account) === JSON.stringify(B.get('gmail:a')),
      'channels-badges: an agent group and an agent private chat (a pair) are VibeSpace\'s own talk — the VibeSpace badge, `internal`; a mail thread wears its ACCOUNT\'s badge, the very record its card draws', JSON.stringify(R.map((r) => [r.id, r.account, r.internal])));
    const MC = mutantCopies('chan-badges', REPO);
    const VS = read('src/lib/channel-groups-view.js');
    const STAMP = '      internal: true, account: INTERNAL_BADGE, atYou: num(g.atYou),\n';
    ok(VS.split(STAMP).length === 2, 'channels-badges CONTROL setup: the group row\'s internal stamp is spelled once');
    const V0 = await import(MC.write('src/lib/channel-groups-view.js', VS.replace(STAMP, ''), 'badges-no-internal', { esm: true }));
    const R0 = V0.groupListRows({ groups: [{ id: 'g1', name: 'lane', members: [], lastAt: 5 }], conversations: [], adapters: accts }).rows;
    ok(R0.length === 1 && !R0[0].account && !R0[0].internal, 'channels-badges CONTROL: the base group row carries no badge and is not internal — the leg above would be red');
    for (const c of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 1, label: 'chan-badges: ' })) ok(c.pass, c.name, c.pass ? undefined : c.detail);
    const PS = read('src/lib/channels-panel.js'), CS = read('src/lib/channel-chrome.js'), DS = read('src/lib/channel-account-dialogs.js');
    ok(/const badges = accountBadges\(adapters\);/.test(PS) && PS.split('siblings, ordinal, badges.get(a.id)));').length === 3 && /const tile = accountBadge\(badge, 'chan-sec-kind', name\);/.test(PS) && /h\.appendChild\(accountBadge\(badge, 'chan-sec-kind', /.test(PS) && !/kindGlyph\(/.test(PS)
      && /s\.appendChild\(accountBadge\(badge\)\);/.test(CS) && /if \(badge\.internal\) b\.dataset\.vs = '1';/.test(CS) && /if \(user\) return accountTitle\(a\);/.test(DS),
      'channels-badges PIN: both account card heads draw the SAME badge element their rows wear (accountBadge over ONE accountBadges map — no kind tile left); the card\'s name and the badge\'s title are one spelling');
    ok(/const ib = internalBlock\(fs\.shown, \{ folded: \(FOLDS \|\| foldsFrom\(null\)\)\.internal && !q\.trim\(\), now \}\);/.test(PS) && /r\.kind === 'internal-head' \? internalHead\(r\.block\) : groupRow\(r, now\)/.test(PS)
      && /const toggle = \(\) => \{ setFold\('internal', !b\.folded\); draw\(\); \};/.test(PS) && V.PANEL_PARTS.includes('internal'),
      'channels-badges PIN: the first screen draws through internalBlock; its head folds through setFold (user state `channelsPanelFolds.internal`, broadcast to every client); lane channels-fold: before the folds load it is the default (folded)');
  }
  // lane channels-fold (the owner, 2026-10-03 — channels-badges gap 2: Slack had no glyph, so two glyph-less vendors
  // looked alike): THE GLYPH CENSUS — every adapter kind that can be CONNECTED (the engine's REAL_ADAPTERS, each
  // module's own `kind`) has its `vendor-<kind>` silhouette in the library, the one the account badge and the account
  // card both draw (the chat fallback is the dev fakes' only); a kind without one is RED (control: a library copy
  // without Slack's)
  {
    const AV = await import(path.join(REPO, 'src/lib/channel-avatar.js'));
    const IC = await import(path.join(REPO, 'src/lib/icons.js'));
    const ES = read('src/server/channels-engine.js');
    const arr = ES.match(/^const REAL_ADAPTERS = Object\.freeze\(\[([^\]]*)\]\);$/m);
    const kinds = (arr ? arr[1].split(',').map((s) => s.trim()).filter(Boolean) : []).map((id) => {
      const r = ES.match(new RegExp(`^const ${id} = require\\('\\.\\./channels/([a-z0-9-]+)\\.js'\\);`, 'm'));
      return r ? require(path.join(REPO, 'src/channels', `${r[1]}.js`)).kind : null;
    });
    const missing = (lib) => kinds.filter((k) => { const g = AV.accountBadges([{ id: k, kind: k, label: k }]).get(k).glyph; return !(typeof lib[g] === 'string' && /^<svg /.test(lib[g])); });
    ok(kinds.length >= 3 && kinds.every((k) => typeof k === 'string' && k) && kinds.includes('slack') && missing(IC.UI_ICONS).length === 0,
      `channels-fold GLYPH CENSUS: every connectable kind (${kinds.join(', ')}) wears its OWN vendor glyph — none falls back to the chat glyph`, JSON.stringify({ kinds, missing: missing(IC.UI_ICONS) }));
    const sl = IC.UI_ICONS['vendor-slack'] || '', lk = IC.UI_ICONS['vendor-lark'] || '', gm = IC.UI_ICONS['vendor-gmail'] || '';
    const box = (s) => `${(s.match(/viewBox="[^"]*"/) || [''])[0]} ${(s.match(/stroke-width="[^"]*"/) || [''])[0]}`;
    ok(/stroke="currentColor"/.test(sl) && !/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(sl) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(sl) && box(sl) === box(lk) && box(sl) === box(gm) && sl !== lk && sl !== gm,
      'channels-fold: the Slack glyph is a library SVG in the house style — currentColor, the Lark / Gmail box and stroke, no brand colour, no emoji, a shape of its own', box(sl));
    const MC = mutantCopies('chan-fold', REPO);
    const IS = read('src/lib/icons.js');
    const SLACK = IS.split('\n').find((l) => l.startsWith("  'vendor-slack': ")) || null;
    ok(!!SLACK && IS.split(`${SLACK}\n`).length === 2, 'channels-fold CONTROL setup: the Slack glyph is spelled once');
    const IC0 = await import(MC.write('src/lib/icons.js', IS.replace(`${SLACK}\n`, ''), 'fold-no-slack', { esm: true }));
    ok(JSON.stringify(missing(IC0.UI_ICONS)) === '["slack"]', 'channels-fold CONTROL: a library copy without the Slack glyph is RED — the census names slack (its badge would draw the chat fallback)', JSON.stringify(missing(IC0.UI_ICONS)));
    for (const c of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 1, label: 'chan-fold: ' })) ok(c.pass, c.name, c.pass ? undefined : c.detail);
  }
  // wake echo + folds
  ok(JSON.stringify(V.wakeCount({ woke: [1, 2], refused: [3], later: [] })) === '{"woke":2,"refused":1,"later":0}' && JSON.stringify(V.wakeCount(null)) === '{"woke":0,"refused":0,"later":0}', 'wakeCount: the answer\'s woke / refused / later counts, zero when absent');
  ok(JSON.stringify(V.foldsFrom({ channelsPanelFolds: { accounts: true, watcher: 'yes', junk: true } })) === '{"accounts":true,"watcher":false,"internal":true}' && JSON.stringify(V.foldsFrom(null)) === '{"accounts":false,"watcher":false,"internal":true}', 'foldsFrom: only the KNOWN parts, only a literal true folds Accounts / the watcher (user state never grows from this map)');
  // lane channels-fold (the owner, 2026-10-03: VibeSpace internal is FOLDED by default; an explicit choice still wins)
  ok(V.foldsFrom({}).internal === true && V.foldsFrom({ channelsPanelFolds: { internal: 'no' } }).internal === true && V.foldsFrom({ channelsPanelFolds: { internal: 0 } }).internal === true
    && V.foldsFrom({ channelsPanelFolds: { internal: false } }).internal === false && V.foldsFrom({ channelsPanelFolds: { internal: true } }).internal === true && JSON.stringify(V.FOLDED_BY_DEFAULT) === '["internal"]',
    'channels-fold: VibeSpace internal is FOLDED unless the user unfolded it — absent / junk = folded, only a literal false (the user\'s unfold) opens it; Accounts and the watcher keep their open default');

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
  await eng.refresh(A, C);
  await eng.pass(A, { force: true });
  const newest = eng.store.readTail(A, C, { limit: 1 })[0];
  const row = eng.digest().conversations.find((c) => c.key === `${A}/${C}`);
  ok(newest && row && row.lastText === String(newest.text).replace(/\s+/g, ' ').trim().slice(0, 160) && row.lastText.length > 0, 'the digest\'s `lastText` is the NEWEST logged record\'s text (one line, bounded)', JSON.stringify({ lastText: row && row.lastText, newest: newest && newest.text }));
  const other = eng.digest().conversations.find((c) => c.key === `${A}/fake-poll-announce`);
  const otherNewest = eng.store.readTail(A, 'fake-poll-announce', { limit: 1 })[0];
  ok(other && otherNewest && other.lastText === String(otherNewest.text).replace(/\s+/g, ' ').trim().slice(0, 160), 'every conversation of a linked account is INGESTED (2026-09-26, no track step) — the other room has its own last line too');

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

// ── §2b WHERE A MESSAGE STANDS, in words (lane group-pending, the owner 2026-10-01) ──
// The state is the model's ONE rule (deliveryOf, gated in test-channel-groups §1f); here: the words under the
// message in en / zh / ja from one process (the dictionaries' own entries), the tone the dot reads, the title that
// names every recipient, the width budget IN THE WORDS, and the re-export (never a second rule).
console.log('§2b the line under a message: the words in three languages, the tone, the budget');
{
  const Wd = await import(path.join(REPO, 'src/lib/channel-words.js'));
  ok(V.deliveryOf === G.deliveryOf && V.DELIVERY_STATES === G.DELIVERY_STATES, 'the view re-exports the MODEL\'s deliveryOf + DELIVERY_STATES (the window judges by the one rule, never a copy)');
  const dictOf = (f) => { const m = new Map(); for (const ln of read(f).split('\n')) { const x = /^  ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"): ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"),?$/.exec(ln); if (x) { try { m.set(new Function('return ' + x[1])(), new Function('return ' + x[2])()); } catch { } } } return m; };
  const dicts = { en: null, zh: dictOf('src/lib/i18n-zh.js'), ja: dictOf('src/lib/i18n-ja.js') };
  const missing = [];
  const tr = (d, lang) => ({
    t: (s, v) => { const w = d ? d.get(s) : s; if (d && w === undefined) missing.push(lang + ':' + s); const x = w === undefined ? s : w; return v ? x.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : x; },
    tc: (c, s, v) => { const key = c + '::' + s; const w = d ? d.get(key) : s; if (d && w === undefined) missing.push(lang + ':' + key); const x = w === undefined ? s : w; return v ? x.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : x; },
  });
  const row = (name, state, at = null) => ({ member: 'c-' + name, name, state, at });
  const en = tr(null, 'en');
  const one = (state) => Wd.deliveryLineText([row('beta', state)], en);
  ok(one('waiting').text === "Waiting for beta's next turn" && one('waiting').tone === 'waiting' && one('waiting').title === one('waiting').text, 'ONE recipient waiting: "Waiting for beta\'s next turn", tone waiting (a hollow dot), the title the same sentence');
  ok(one('handed').text === 'Read by beta' && one('handed').tone === 'handed', 'handed, a LEGACY row (no hand-over clock): "Read by beta", tone handed (a filled dot), no time');
  // the hand-over CLOCK (the coordinator's follow-up): a handed row's `at` = the engine's `reportedAt` ⇒ the sentence says WHEN,
  // drawn as the message head draws its time (the device's local HH:MM); the suite injects the formatter
  const clocked = Wd.deliveryLineText([row('beta', 'handed', 1_700_000_000_000)], { ...en, time: () => '12:41' });
  ok(clocked.text === 'Read by beta · 12:41' && clocked.tone === 'handed' && clocked.title === clocked.text, 'handed WITH the clock: "Read by beta · 12:41"');
  const clockedLocal = Wd.deliveryLineText([row('beta', 'handed', Date.UTC(2026, 9, 1, 12, 41))], en).text;
  ok(/^Read by beta · \d{2}:\d{2}$/.test(clockedLocal), 'the default formatter is the device\'s local 24 h HH:MM (the message head\'s own look)', clockedLocal);
  ok(Wd.deliveryLineText([row('alpha', 'handed', 5), row('beta', 'waiting')], { ...en, time: () => '12:41' }).title.split('\n').includes('Read by alpha · 12:41'), 'a group line\'s title carries each handed row\'s clock');
  ok(one('muted').text === 'beta is muted and will not read it' && one('muted').tone === 'none', 'muted: said, tone none');
  ok(one('left').text === 'beta left' && one('left').tone === 'none', 'left: said, tone none');
  const many = Wd.deliveryLineText([row('alpha', 'handed'), row('beta', 'waiting'), row('gamma', 'muted'), row('delta', 'left')], en);
  const sorted = (s) => String(s).split('\n').sort().join('\n');
  ok(many.text === '1 waiting · 1 read · 1 muted · 1 left' && many.tone === 'waiting' && sorted(many.title) === sorted("Waiting for beta's next turn\nRead by alpha\ngamma is muted and will not read it\ndelta left"), 'a GROUP line counts by state in a fixed order and its title names every recipient\'s sentence', JSON.stringify(many));
  ok(Wd.deliveryLineText([row('a', 'handed'), row('b', 'handed')], en).tone === 'handed' && Wd.deliveryLineText([row('a', 'handed'), row('b', 'left')], en).tone === 'handed' && Wd.deliveryLineText([row('a', 'muted'), row('b', 'left')], en).tone === 'none', 'the tone: waiting beats handed beats none (anyone waiting ⇒ hollow; everyone it could reach ⇒ filled)');
  ok(Wd.deliveryLineText([], en) === null && Wd.deliveryLineText(null, en) === null && Wd.deliveryLineText([{ member: 'x', state: 'bogus' }], en) === null, 'no recipient (or no known state) ⇒ no line');
  // every language from the dictionaries, each key present; the width budget lives in the words (the pill lesson)
  const BUDGET = { en: 44, zh: 24, ja: 30 };          // a pair line's words beside the name
  const GROUP_BUDGET = { en: 44, zh: 36, ja: 40 };    // the widest group line: all four states at once (no name)
  const len = (s) => Array.from(s).length;
  for (const lang of ['zh', 'ja']) {
    const L = tr(dicts[lang], lang);
    const lines = ['waiting', 'handed', 'muted', 'left'].map((s) => Wd.deliveryLineText([row('生活方式助手', s)], L).text);
    lines.push(Wd.deliveryLineText([row('生活方式助手', 'handed', 5)], { ...L, time: () => '12:41' }).text);   // the clocked sentence
    const group = Wd.deliveryLineText([row('a', 'handed'), row('b', 'waiting'), row('c', 'muted'), row('d', 'left')], L).text;
    ok(lines.every((x) => x.includes('生活方式助手') && !/Waiting|Read by|muted|left/.test(x)) && !/waiting|read|muted|left/.test(group) && lines[4].includes('12:41'), `${lang}: every line is in the device's language and names the recipient (the clocked one its time)`, JSON.stringify([...lines, group]));
    ok(lines.every((x) => len(x.replace('生活方式助手', '').replace('12:41', '')) <= BUDGET[lang]) && len(group) <= GROUP_BUDGET[lang], `${lang}: every line is within its width budget (≤ ${BUDGET[lang]} characters beside the name and the time; the four-state group line ≤ ${GROUP_BUDGET[lang]})`, JSON.stringify([...lines, group].map(len)));
  }
  ok(['waiting', 'handed', 'muted', 'left'].every((s) => len(one(s).text.replace('beta', '')) <= BUDGET.en) && len(many.text) <= GROUP_BUDGET.en, 'en: within its width budget too');
  ok(missing.length === 0, 'every new key has a zh AND a ja entry (incl. the `delivery::` contextual counts — "{n} waiting" is also the stash strip\'s, another meaning)', missing.join(', '));
  ok(/tc\('delivery', '\{n\} waiting'/.test(read('src/lib/channel-words.js')) && dicts.zh.get('delivery::{n} waiting') === '{n} 人待读' && dicts.zh.get('{n} waiting') !== '{n} 人待读', 'the count is a CONTEXTUAL key (tc) — the stash strip\'s "{n} waiting" keeps its own translation');
}

// ── §3 SOURCE CENSUSES ────────────────────────────────────────────────────
console.log('§3 censuses: XSS, the composer split, no adapter id, the fold, the i18n data paths');
const CLIENT = ['src/lib/channels-panel.js', 'src/lib/channel-window.js', 'src/lib/channel-group-dialogs.js', 'src/lib/channel-groups-view.js', 'src/lib/channel-words.js', 'src/lib/channel-focus.js', 'src/lib/principal-picker.js'];
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
  ok(Object.values(found).every((b) => b.length === 0), 'XSS: no innerHTML/outerHTML/insertAdjacentHTML write on the six files (every group name, member name, context, last line and — R3 — the tag\'s agent name is textContent)', JSON.stringify(found));
  const planted = read('src/lib/channels-panel.js').replace('title.textContent = r.title;', 'title.innerHTML = r.title;');
  ok(planted !== read('src/lib/channels-panel.js') && judge(planted).length === 1, 'NEGATIVE CONTROL: a planted `title.innerHTML = r.title` (a hostile group name) is FLAGGED by the same judge');
  const P = read('src/lib/channels-panel.js'), W = read('src/lib/channel-window.js'), D = read('src/lib/channel-group-dialogs.js');
  ok(/title\.textContent = r\.title;/.test(P) && /last\.textContent = r\.lastText \|\| '';/.test(P) && /src\.textContent = r\.kind === 'group'/.test(P), 'the group row: name, last line and source chip through textContent');
  ok(/el\('div', 'chanmsg-ctx', raw\.context\)/.test(W) && /body\.appendChild\(document\.createTextNode\(r\.text\)\)/.test(W) && /el\('span', 'chanblk-at chan-at', '@' \+ nameOf\(r\.id, r\.text\.slice\(1\)\)\)/.test(W) && /titleRow\.appendChild\(el\('b', '', group\.name \|\| groupId\)\)/.test(W), 'the group window: invite context, message body and the group name through el() (textContent)');
  // channel-polish (2026-09-27): the member picker is the ONE principal picker — its names through el() (textContent)
  const PP = read('src/lib/principal-picker.js');
  ok(/el\('span', 'chan-gm-name', m\.owner \? t\('You \(observer\)'\) : m\.name\)/.test(D) && /n\.appendChild\(el\('span', 'pp-name', r\.name\)\)/.test(PP) && /c\.appendChild\(el\('span', 'pp-chip-name', r\.name\)\)/.test(PP) && /principalPicker\(\{ items, multi: true,/.test(D) && /t\('Group — \{name\}', \{ name: group\.name \}\)/.test(D), 'the dialogs: member names, the picker\'s row and chip names and the title (createModalShell textContent) never innerHTML');
  ok(!/showContextMenu\([^)]*labelHtml/.test(P + W + D) && !/labelHtml/.test(W + D), 'the group menus use plain `label` (textContent) — never `labelHtml`');

  // the composer split
  // lane reaction-hover (2026-10-01): the message bar's Quote asks the SAME verdict (a quote needs a composer that can send)
  ok((W.match(/composerMode\(/g) || []).length === 3 && /const cm = composerMode\(\{ conv: c \}\);/.test(W) && /const mode = composerMode\(\{ group \}\);/.test(W) && /const composerNow = \(\) => composerMode\(\{ conv: lastConv \}\)\.mode;/.test(W), 'the composer\'s kind is decided ONLY by composerMode — once for a channel conversation, once for a group, and the message bar\'s Quote asks the same verdict');
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
  const need = ['chan-grow-title', 'chan-grow-last', 'chan-src-chip', 'chan-gm-name', 'pp-name', 'pp-chip-name', 'chanmsg-ctx', 'chanmsg-sys-line', 'chan-mention-item', 'chan-tag-who', 'chanmsg-dlv'];
  ok(need.every((c) => I.DATA_PATH_CLASSES.includes(c)), 'the i18n census excuses the NEW data paths (group name / last line / source label / member + picker names / context / system line / mention item) BY PATH', need.filter((c) => !I.DATA_PATH_CLASSES.includes(c)).join(', '));
  const leak = I.census([{ text: 'Members & notifications', paths: ['div.chan-gm-list < div.dialog-body'], surfaces: ['panel-02-tracked'] }]);
  ok(leak.violations.length === 1, 'NEGATIVE CONTROL: a CHROME string on a group surface (not a data path) is still a violation');

  // ── verify round 5 (2026-09-27): THE MEMO SIGNATURE NAMES EVERY FACT THE ROW PRINTS ──
  // Round 4 memoised the panel's rows by key + signature, and the signature missed `access` / `watchers` — line 3
  // (assignmentSummary: the WHOLE access and watcher lists) stayed "Access: Alpha" after "[Alpha, Beta]" was saved
  // (reproduced in chrome). The census below reads every `conv.<field>` the builder and the helpers it hands `conv`
  // to touch, and every `r.<field>` the group-row builder touches, against the two signature lists — grep-derived, so
  // a field the builder gains tomorrow without its signature entry is red here, not stale in the panel.
  const sigCensus = (src, fe) => {
    const blockAfter = (text, from) => { let d = 0, j = text.indexOf('{', from); for (let k = j; k < text.length; k++) { if (text[k] === '{') d++; else if (text[k] === '}' && --d === 0) return text.slice(j, k + 1); } return ''; };
    const body = (name) => { const i = src.indexOf(`function ${name}(`); if (i < 0) return ''; let d = 0, k = i + name.length + 9; for (; k < src.length; k++) { if (src[k] === '(') d++; else if (src[k] === ')' && --d === 0) break; } return blockAfter(src, k); };   // the block after the PARAMETER list (a destructured parameter has braces of its own)
    const sigOf = (name) => { const b = body(name); const m = /const sig = JSON\.stringify\(\[([\s\S]*?)\]\);/.exec(b); return m ? m[1] : null; };
    const reads = (text, v) => [...new Set([...strip(text).matchAll(new RegExp(`\\b${v}\\.(\\w+)`, 'g'))].map((m) => m[1]))];
    // the conversation row: rowBuild reads `conv.*`; assignmentSummary(conv) (channel-filter-editor) reads more
    const helperReads = reads(blockAfter(fe, fe.indexOf('export function assignmentSummary(conv)')), 'conv');
    const rowReads = [...new Set([...reads(body('rowBuild'), 'conv'), ...helperReads])];
    const rowSig = sigOf('row');
    const groupReads = reads(body('groupRowBuild'), 'r').filter((f) => f !== 'key');   // `r.key` IS the memo key
    const groupSig = sigOf('groupRow');
    const missing = (fields, sig, v) => fields.filter((f) => !new RegExp(`\\b${v}\\.${f}\\b`).test(sig || ''));
    return { rowReads, rowSig, rowMissing: missing(rowReads, rowSig, 'conv'), groupReads, groupSig, groupMissing: missing(groupReads, groupSig, 'r') };
  };
  const FE = read('src/lib/channel-filter-editor.js');
  const J = (x) => JSON.stringify(x), eq = (a, b) => J(a) === J(b);
  const SC = sigCensus(P, FE);
  ok(SC.rowSig && SC.rowReads.length >= 9 && SC.rowMissing.length === 0, `SIGNATURE CENSUS: every field the conversation row prints (${SC.rowReads.join(', ')}) is in its memo signature — incl. the WHOLE access + watchers lists line 3 says (round 5)`, J(SC.rowMissing));
  ok(SC.groupSig && SC.groupReads.length >= 8 && SC.groupMissing.length === 0, `SIGNATURE CENSUS: every field the first-screen row prints (${SC.groupReads.join(', ')}) is in its memo signature`, J(SC.groupMissing));
  const plantedSig = P.replace('conv.assignment, conv.access, conv.watchers, conv.held]);', 'conv.assignment, conv.watchers, conv.held]);');
  ok(plantedSig !== P && eq(sigCensus(plantedSig, FE).rowMissing, ['access']), 'NEGATIVE CONTROL: the round-4 signature (no `conv.access`) is flagged by the census, naming the field');
  // the handler census: reconcile KEEPS a node rebuilt the same and refreshes its handler PROPERTIES — so every handler
  // the panel's draw region wires must be one of those properties, never addEventListener (a kept node would keep a
  // stale closure)
  const drawRegion = P.slice(P.indexOf('  function draw() {'), P.indexOf('  async function refresh() {'));
  // lane channel-avatars (int212): a handler on a DETACHED probe (`const probe = new Image()` — the picture warm-up) is never on a
  // drawn node, so reconcile never adopts it; every other receiver counts
  const handlerProps = (src) => { const probes = new Set([...src.matchAll(/\b(\w+) = new Image\(\)/g)].map((m) => m[1])); return [...new Set([...src.matchAll(/\b(\w+)\.(on[a-z]+) = /g)].filter((m) => !probes.has(m[1])).map((m) => m[2]))]; };
  const CH = read('src/lib/channel-chrome.js');
  const propsUsed = handlerProps(drawRegion + CH);
  const plantedOn = CH.replace("img.className = 'chan-av-img';", "img.onerror = () => img.remove(); img.className = 'chan-av-img';");
  ok(plantedOn !== CH && handlerProps(drawRegion + plantedOn).includes('onerror'), 'CONTROL (int212): an `onerror` on the DRAWN avatar\'s picture (not the detached probe) is counted by the handler census');
  const hp = /const HANDLER_PROPS = Object\.freeze\(\[([^\]]*)\]\);/.exec(P);
  const declared = hp ? [...hp[1].matchAll(/'(\w+)'/g)].map((m) => m[1]) : [];
  ok(drawRegion.length > 5000 && !/addEventListener\(/.test(strip(drawRegion)) && propsUsed.length >= 2 && propsUsed.every((k) => declared.includes(k)), `HANDLER CENSUS: the draw region wires handlers only as properties (${propsUsed.join(', ')}) and every one is in reconcile's HANDLER_PROPS (${declared.join(', ')}) — never addEventListener`, J({ propsUsed, declared }));
  ok(/if \(old\.isEqualNode\(fresh\)\) \{ adoptHandlers\(old, fresh\); out\[i\] = old; want\.add\(old\); want\.delete\(fresh\); \}/.test(P) && /for \(const k of \[\.\.\.kids\]\) if \(!want\.has\(k\)\) k\.remove\(\);/.test(P), 'PIN (round 5): reconcile keeps a fresh node structurally EQUAL to the one at its place (isEqualNode) with its handlers refreshed — the account head / grain lines / "Show all" survive a broadcast like the rows');
  // an adopted handler runs on the KEPT node: it may anchor nothing on the variable of the fresh one (detached ⇒ a 0×0 rect at the corner)
  ok(!/const r = more\.getBoundingClientRect\(\)/.test(P) && (P.match(/ev\.currentTarget\.getBoundingClientRect\(\)/g) || []).length === 2 && !/\bon(?:click|contextmenu) = \([^)]*\) => \{[^\n]*\b(?:more|edit|h|tog|b|l|cb)\.getBoundingClientRect/.test(drawRegion), 'PIN (round 5): the ⋯ menus anchor on `ev.currentTarget` — a handler the reconcile adopts onto the kept button never reads the fresh (detached) button\'s rect');
}

// ── §4 WIRING PINS ────────────────────────────────────────────────────────
console.log('§4 wiring pins');
{
  const P = read('src/lib/channels-panel.js'), W = read('src/lib/channel-window.js'), R = read('src/routes/channels.js'), E = read('src/server/channels-engine.js'), S = read('src/channel-store.js'), GEsrc = read('src/server/groups-engine.js');
  ok(/const \{ rows, archived \} = groupListRows\(\{ groups: groups \|\| \[\], conversations: convs, adapters, untitled: \(kind\) => chanCaps\.untitledText\(kind, \{ t \}\) \}\);/.test(P), 'PIN: the panel\'s first screen is drawn from groupListRows (lane lark-search-poll: an untitled row worded — never its raw id)');
  ok(/const fs = firstScreen\(rows, \{ view: VIEW, q, now \}\);/.test(P) && /export \{ focusRows, statusTag, filterRows, firstScreen,/.test(read('src/lib/channel-groups-view.js')), 'PIN (R3): …and narrowed to the ATTENTION list by firstScreen / focusRows (re-exported from the PURE channel-focus.js) — the full list one switch away');
  // lane-redact verify r6: the broadcast's list is kept (groupsGen) even before the first paint, which stays refresh()'s
  ok(/if \(msg\.type === 'channel-groups-updated'\) \{[\s\S]{0,200}groups = msg\.groups; groupsGen\+\+;[^\n]*\n\s*if \(digest === null\) return;[^\n]*\n\s*draw\(\);/.test(P), 'PIN: the panel repaints the group list from the broadcast\'s list (no fetch)');
  ok(/if \(isGroupConv\(adapterId\)\) \{ root\.classList\.add\('chanwin-group'\); return openGroupWindow\(/.test(W) && /const w = wakePreview\(group, ta\.value, \{ picked: spansOf\(ta\.value\) \}\);/.test(W), 'PIN: the window routes a group to openGroupWindow and previews the wake under the box');
  ok(/router\.post\('\/api\/channels\/:adapterId\/:convId\/send'[\s\S]{0,300}direct: true/.test(R) && /router\.get\('\/api\/channel-groups\/roster'/.test(R) && /case 'read': r = await ge\.markRead\(\{ group \}\)/.test(R), 'PIN: the routes expose /send (direct), /channel-groups/roster and the owner\'s /read');
  ok(/const own = !!\(input && input\.direct === true\) && \(!ctx \|\| ctx\.kind === 'user'\);/.test(E) && /lastText: en\.lastText \|\| ''/.test(E), 'PIN: the engine\'s own-message rule is the USER\'s only, and the digest carries lastText');
  ok(/return \{ appended: fresh\.length, duplicates, lastAt, lastText,/.test(S), 'PIN: the store\'s append answers the newest record\'s text');
  const RL = read('src/lib/sidebar-rail.js');
  ok(/msg\.type === 'channel-groups-updated' && Array\.isArray\(msg\.groups\)\) this\._railChanBadge\('grp'/.test(RL) && /this\._railChanBadge\('ch', \(msg\.digest\.unreadTotal/.test(RL) && !/_railSetBadge\('channels'/.test(RL.replace(/_railChanBadge\(part, n\) \{[\s\S]*?\n    \},/, '')), 'PIN: the rail\'s Channels badge sums BOTH halves (the digest and the groups\' owner unread) through _railChanBadge — no other writer of that badge');
  ok(/if \(from === G\.OWNER\) ownerSaw\(gr, g\);/.test(GEsrc) && /list = \(\) => Object\.values\(all\(\)\)\.map\(\(g\) => \(\{ \.\.\.view\(g\), unread: ownerUnread\(g\) \}\)\)/.test(GEsrc), 'PIN: the owner\'s post moves the owner mark inside the door, and the owner list carries the derived unread');
  // lane group-pending (2026-10-01): the line under every message — the ONE rule, keyed, patched in place, from the broadcast
  const grp = W.slice(W.indexOf('function openGroupWindow'));
  ok(/const rows = group \? deliveryOf\(group, rec, \{ log: log \|\| \[\.\.\.drawn\.values\(\)\] \}\) : \[\];/.test(grp) && /const words = deliveryLineText\(rows\);/.test(grp) && !/reportedUpTo/.test(grp), 'PIN: the window judges a message\'s line by the model\'s deliveryOf (over the drawn log) worded by deliveryLineText — it reads no marker itself');
  ok(/const dlv = el\('div', 'chanmsg-dlv'\);/.test(grp) && /drawDelivery\(row, rec\);/.test(grp) && /if \(line\.dataset\.sig === sig\) return;/.test(grp) && /line\.querySelector\('\.chanmsg-dlv-text'\)\.textContent = words\.text;/.test(grp), 'PIN: every message row carries its line (textContent), keyed by the row and patched only when its signature moved');
  ok(/if \(g \|\| landed\) redrawDelivery\(\);/.test(grp) && /for \(const row of list\.querySelectorAll\('\.chanmsg\[data-vid\]:not\(\.chanmsg-sys\)'\)\)/.test(grp), 'PIN: the broadcast (a marker, a mode, a landed departure) re-judges every drawn line in place — never a list rebuild');
  ok(/reportedUpTo: Number\.isFinite\(m\.reportedUpTo\) \? m\.reportedUpTo : null, reportedAt: Number\.isFinite\(m\.reportedAt\) \? m\.reportedAt : null \}\)\)/.test(GEsrc) && /if \(moved\) announce\(\[gid\]\);/.test(GEsrc) && /m\.reportedUpTo = upTo; m\.reportedAt = now\(\); moved = true;/.test(GEsrc), 'PIN: the engine\'s view carries each member\'s marker AND its hand-over clock, the clock is stamped beside a marker that moves, and a moved marker is announced (the sender\'s window flips without a reload)');
  ok(/\.chanmsg-dlv\[data-tone="handed"\] \.chanmsg-dlv-dot \{ background: currentColor; \}/.test(read('public/style.css')) && /\.chanmsg-dlv-dot \{[^}]*border-radius: 50%;[^}]*border: 1px solid currentColor/.test(read('public/style.css')), 'PIN: the dot is CSS (hollow by default, filled when handed) — never an emoji');
}

// ── B-ff04 (the owner's 2026-10-02 screenshot + the 2026-10-03 ruling): the window draws an @ as a CHIP by id, the body
// as selectable text, a member who left by its last known name — and the composer's picks travel as places by id ──
console.log('§B-ff04 the group window — mention chips by id, names not ids, picks by id');
{
  const Bm = 'bbbbbbbb-2222-4000-8000-000000000002', Cm = 'cccccccc-3333-4000-8000-000000000003';
  const grp = { id: 'g-ff04ff04', members: [{ member: Bm, name: 'beta' }, { member: Cm, name: 'gamma' }] };
  const runs = (rec) => V.groupBodyRuns(rec).map((r) => (r.k === 'at' ? `[${r.id.slice(0, 1)}:${r.text}]` : r.text)).join('');
  const placed = { text: '@beta and @gamma, see @beta again', mentions: [{ id: Bm, name: 'beta', pos: [[0, 5], [22, 27]] }, { id: Cm, name: 'gamma', pos: [[10, 16]] }] };
  ok(runs(placed) === '[b:@beta] and [c:@gamma], see [b:@beta] again', '③ a structured record: a chip at EVERY stored place, by id; the rest is text', runs(placed));
  const forged = { text: '@beta <at user_id="x">Mallory</at> @_user_1 @gamma', mentions: [{ id: Bm, name: 'beta', pos: [[0, 5]] }] };
  ok(runs(forged) === '[b:@beta] <at user_id="x">Mallory</at> @_user_1 @gamma', '③ only the record\'s OWN mentions become chips: a typed "@gamma" the server did not resolve, a Lark <at> tag and an @_user_N stay TEXT (no chip forged for anyone)', runs(forged));
  const shifted = { text: 'xbeta hi', mentions: [{ id: Bm, name: 'beta', pos: [[0, 5]] }] };
  ok(runs(shifted) === 'xbeta hi', '…a stored place that does not sit on an @ is dropped (text, never a chip over the wrong words)', runs(shifted));
  const legacy = { text: 'hi @Beta, and `@beta` in code, and @betax', mentions: [{ id: Bm, name: 'beta' }] };
  ok(runs(legacy) === 'hi [b:@Beta], and `@beta` in code, and @betax', '③ an OLDER record (mentions without places): its own mentions by name, best effort — at a word, outside code; what does not resolve stays text', runs(legacy));
  ok(runs({ text: '@gamma hello', mentions: [] }) === '@gamma hello', '…an older record that mentions nobody is plain text even when the words look like a member\'s @');
  const live = new Map([[Cm, 'gamma-live']]);
  const known = V.learnNames(new Map(), { author: { id: 'dddddddd-0000-4000-8000-000000000004', name: 'delta' }, mentions: [{ id: 'eeeeeeee-0000-4000-8000-000000000005', name: 'eps' }], raw: { kind: 'kick', member: 'ffffffff-0000-4000-8000-000000000006', name: 'phi' } });
  const renamed = { ...grp, members: [{ member: Bm, name: 'beta-renamed' }, { member: Cm, name: 'gamma' }] };
  ok(V.memberName(Bm, { group: renamed, live, known, snapshot: 'beta' }) === 'beta-renamed', '③ the chip\'s name is looked up BY ID: a renamed member shows its NEW name (not the words the message was sent with)');
  ok(V.memberName('3eeda0d9-0000-4000-8000-000000000009', { group: grp, live, known, snapshot: 'channel-names 建设' }) === 'channel-names 建设' && V.memberName('ffffffff-0000-4000-8000-000000000006', { group: grp, live, known }) === 'phi' && V.memberName('dddddddd-0000-4000-8000-000000000004', { group: grp, known }) === 'delta', '③ a member who LEFT keeps a name: the record\'s own snapshot, else the last name the log knew (author / mention / kick)');
  ok(V.memberName('99999999-0000-4000-8000-000000000009', { group: grp, live, known }) === '99999999', '…the short id only when no name was ever seen');
  const t1 = '@beta and @beta-x hi';
  ok(JSON.stringify(V.pickedSpans(t1, [{ id: Cm, name: 'beta' }])) === JSON.stringify([{ id: Cm, start: 0, end: 5 }]), '① the @-picker\'s choice travels as a place BY ID — the id picked, not the name re-read');
  const t2 = 'edited: @betaz then @beta';
  ok(JSON.stringify(V.pickedSpans(t2, [{ id: Bm, name: 'beta' }])) === JSON.stringify([{ id: Bm, start: 20, end: 25 }]) && V.pickedSpans('all gone', [{ id: Bm, name: 'beta' }]).length === 0, '…a pick claims the @name that still ends at a word ("@betaz" is not it); a deleted pick claims nothing');
  const bad = V.atProblem(grp, '@delta look');
  ok(bad && bad.code === 'unknown-mention' && bad.token === 'delta' && V.atProblem(grp, '@beta look') === null, '① the composer says the refusal FIRST — the server\'s own scanAts + atRefusal ("@delta" is not a member)', JSON.stringify(bad));
  ok(V.wakePreview(grp, '@beta hi', { picked: [{ id: Cm, start: 0, end: 5 }] }).map((x) => x.member).join() === Cm, '…and the wake preview counts the PICKED id');
  // CENSUS — the window draws a group body ONLY through groupBodyRuns; no forgeable rung (textToBlocks / blocksOfRecord),
  // no resolver on the words; a chip's name is asked by id
  const Wsrc = read('src/lib/channel-window.js');
  const i0 = Wsrc.indexOf('function openGroupWindow('), i1 = Wsrc.indexOf('\nregisterWindowType(', i0);
  const grpSrc = Wsrc.slice(i0, i1);
  ok(i0 > 0 && /for \(const r of groupBodyRuns\(rec\)\)/.test(grpSrc) && /row\.appendChild\(isCleared\(rec\) \? el\('div', 'chanmsg-body rc-cleared', clearedText\(\)\) : groupBody\(rec\)\);/.test(grpSrc) && !/\b(?:textToBlocks|blocksOfRecord|renderBlocks|mentionsIn|scanAts)\(/.test(grpSrc), 'CENSUS: the group window draws a body ONLY through groupBodyRuns — never the forgeable generic rung (textToBlocks / blocksOfRecord / renderBlocks), never a resolver over the words');
  ok(/el\('span', 'chanblk-at chan-at', '@' \+ nameOf\(r\.id, r\.text\.slice\(1\)\)\)/.test(grpSrc) && /const member = raw\.member \? nameOf\(raw\.member, raw\.name\) : '';/.test(Wsrc), '…a chip is named by ID through the ladder; a system line names a member by its record\'s own snapshot first');
  const plantedRung = grpSrc.replace('groupBody(rec));', 'renderBlocks(blocksOfRecord(rec), {}));');
  ok(plantedRung !== grpSrc && /\b(?:textToBlocks|blocksOfRecord|renderBlocks|mentionsIn|scanAts)\(/.test(plantedRung), 'NEGATIVE CONTROL: a planted generic-rung body (which parses <at> tags into chips) is FLAGGED');
  const css = read('public/style.css');
  ok(/\.chanmsg-body \{[^}]*user-select: text;[^}]*\}/.test(css) && /html, body \{[^}]*user-select: none;/.test(css), 'B-ff04: a message body is SELECTABLE (user-select: text) under the app root\'s user-select: none');
  ok(/items\.push\(\{ label: t\('Copy text'\), action: \(\) => \{ copyText\(String\(words\)\); showToast\(t\('Copied'\)\); \} \}\);/.test(Wsrc), '…and the message menu (right-click; a long-press on touch) offers Copy text before Clear content…');
  ok(/mentions: Array\.isArray\(b\.mentions\) \? b\.mentions\.slice\(0, 64\) : \[\]/.test(read('src/routes/channels.js')) && /body: JSON\.stringify\(\{ text, mentions, expectWakes: wakePreview\(group, text, \{ picked: mentions \}\)\.length \}\)/.test(Wsrc), 'PIN: the owner\'s post carries the picked places to the engine (the route passes `mentions`)');
}

// ── verify r1 (lane group-chat-ui) F10: an OLDER record's chip (no places stored — found by its own mentions' names)
// sits on the "@" of the words even after a letter whose lower case is longer ("İ" → two code units): the lane head
// matched in the lower-cased string and cut the words one place late ──
console.log('§verify r1 — a legacy chip after "İ" covers its @');
{
  const Bm = 'bbbbbbbb-2222-4000-8000-000000000002';
  const runs = (VV, rec) => VV.groupBodyRuns(rec).map((r) => (r.k === 'at' ? `[${r.text}]` : r.text)).join('');
  const rec = { text: 'İ @beta hi', mentions: [{ id: Bm, name: 'beta' }] };
  ok(runs(V, rec) === 'İ [@beta] hi', 'F10: the legacy chip covers "@beta" exactly', runs(V, rec));
  const { pathToFileURL } = await import('node:url');
  const src = fs.readFileSync(path.join(REPO, 'src/lib/channel-groups-view.js'), 'utf-8');
  const old = src.replace('const lower = foldCase(text);', 'const lower = text.toLowerCase();').replace("const needle = '@' + foldCase(m.name);", "const needle = '@' + String(m.name).toLowerCase();")
    .replace("from '../channel-groups.js'", 'from ' + JSON.stringify(pathToFileURL(path.join(REPO, 'src/channel-groups.js')).href)).replace("from './channel-focus.js'", 'from ' + JSON.stringify(pathToFileURL(path.join(REPO, 'src/lib/channel-focus.js')).href))
    .replace("from '../channel-ref.js'", 'from ' + JSON.stringify(pathToFileURL(path.join(REPO, 'src/channel-ref.js')).href))
    .replace("from './channel-avatar.js'", 'from ' + JSON.stringify(pathToFileURL(path.join(REPO, 'src/lib/channel-avatar.js')).href));   // + channels-polish's account badges   // memberName climbs channel-names' ladder (the 2.369.202 integration)
  const oldFile = path.join(ROOT, 'channel-groups-view-v1-old.mjs');
  fs.writeFileSync(oldFile, old);
  const OLDV = await import(pathToFileURL(oldFile).href);
  ok(src.includes('const lower = foldCase(text);') && !old.includes('foldCase(text)') && runs(OLDV, rec) !== 'İ [@beta] hi', 'CONTROL: the lane head\'s toLowerCase in a patched copy draws a shifted chip — the leg above would be red', runs(OLDV, rec));
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
