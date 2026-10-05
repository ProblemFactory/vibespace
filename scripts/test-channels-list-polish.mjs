#!/usr/bin/env node
// lane channels-list-polish (the owner, 2026-10-04 after .212 — six points on the Channels list): FAST, PURE.
//   ① peerOf: a direct chat's peer is the author that is NOT the account's identity, the identity a resolved fact —
//     the owner's exact shape (authors [owner, Bob], neither `isSelf`) ⇒ Bob with the id, NO peer without it;
//     a patched copy without the stamp (the old "first author without isSelf") shows the owner ⇒ red
//   ② stampSelf heals an old index at read time; mergeAuthors keeps isSelf (a census of the engine source)
//   ③ the list row model: the access/notify line only on a conversation's own grain; the last line bounded, first line
//   ④ the name re-ask ladder: empty ⇒ member list ⇒ sender name ⇒ profile ⇒ id last; Mia's shape (contact refused,
//     the member-list row names her); the re-ask schedule
//   ⑤ the picture memo keys (account, kind, id): a person's key unchanged, chat~ / bot~, the caps row's kinds + why
//   ⑥ the badge is PAINT ON TOP (a CSS pin: z-index, the picture inserted before the badge); the brand marks exist,
//     monochrome, no script
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Av = require(path.join(repo, 'src/channel-avatars.js'));
const F = require(path.join(repo, 'src/channel-focus.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8');

// ① the owner's exact shape (ids masked as in the brief)
const OWNER = [{ id: 'ou_14e6', name: 'Owner' }, { id: 'ou_9247', name: 'Bob' }];
ok(Av.peerOf(OWNER, 'ou_14e6') === 'ou_9247', '① the owner\'s DM with the account\'s id resolved ⇒ the peer is Bob');
ok(Av.peerOf(OWNER, null) === null, '① the identity not known ⇒ NO peer (initials), never the owner\'s face');
ok(Av.peerOf([{ id: 'ou_14e6', name: 'X', isSelf: true }, { id: 'ou_9247', name: 'Bob' }], null) === 'ou_9247', '① an author a record marked isSelf IS a resolved identity');
const oldPeerOf = (authors) => { const p = authors.find((a) => a && a.id && !a.isSelf); return p ? p.id : null; };
ok(oldPeerOf(OWNER) === 'ou_14e6', '① CONTROL: the old peerOf (no stamp) on the owner\'s shape picks the OWNER ⇒ red');
// ② read-time heal + the engine keeps the flags
const healed = Av.stampSelf(OWNER, 'ou_14e6');
ok(healed[0].isSelf === true && !healed[1].isSelf && OWNER[0].isSelf === undefined, '② stampSelf stamps the own id (a copy — the index is not rewritten)');
ok(Av.stampSelf(OWNER, null) === OWNER, '② no identity ⇒ the same array');
const eng = read('src/server/channels-engine.js');
ok(/\.\.\.\(a\.isSelf \? \{ isSelf: true \} : \{\}\)/.test(eng) && /return Av\.stampSelf\(out\.slice\(0, AUTHORS_MAX\), self\)/.test(eng), '② mergeAuthors keeps isSelf and stamps the account\'s id at index time');
ok((eng.match(/en\.authors = Av\.stampSelf\(en\.authors, selfIdOf\(rec\)\)/g) || []).length === 3, '② every index write hands the account\'s id');
ok(/const id = Av\.peerOf\(authors, selfIdOf\(rec\)\);/.test(eng) && !/find\(\(a\) => a && a\.id && !a\.isSelf\); return p && Av\.authorOk/.test(eng), '② the row\'s peer is Av.peerOf over the healed authors (the old first-non-self find is gone)');
// ③ the list row model
const inh = F.listRowModel({ lastText: 'line one\nline two', lastWho: { name: 'Mia (Marketing)' }, assignment: { source: 'account' }, unread: 3, lastAt: 5 });
ok(inh.grainLine === false && inh.last === 'line one' && inh.who.name === 'Mia (Marketing)' && inh.unread === 3, '③ an inherited row: no access line; the last line is the first line, with its author');
ok(F.listRowModel({ lastText: 'x', assignment: { source: 'conversation' } }).grainLine === true, '③ a conversation\'s own grain ⇒ the line (worded as the difference)');
ok(F.listRowModel({ lastText: 'y'.repeat(999) }).last.length === F.LIST_LAST_MAX, '③ the last line is bounded');
ok(F.listRowModel({ lastText: 'hi', lastWho: { self: true } }).who.self === true && F.listRowModel({ lastText: '', lastWho: { name: 'A' } }).who === null, '③ the owner reads "You"; no text ⇒ no author');
// ④ the ladder + Mia's fixture: an external-tenant member whose contact lookup is refused, the member list names her
const MIA = { name: '', member: 'Mia (Marketing)', sender: '', profile: '', id: 'ou_d16d' };
ok(Av.nameLadder(MIA).name === 'Mia (Marketing)' && Av.nameLadder(MIA).from === 'member', '④ Mia: the empty name ⇒ the member list');
ok(Av.nameLadder({ sender: 'Rae', profile: 'R', id: 'ou_x' }).from === 'sender' && Av.nameLadder({ profile: 'Kit', id: 'ou_x' }).from === 'profile', '④ then the sender name, then the profile');
ok(Av.nameLadder({ name: ' ', id: 'ou_8057' }).name === 'ou_8057' && Av.nameLadder({ id: 'ou_8057' }).from === 'id', '④ the id only when nothing is known');
ok(Av.reaskDue(null, 0) && !Av.reaskDue({ at: 1000 }, 2000) && Av.reaskDue({ at: 0 }, Av.REASK_MS) && !Av.reaskDue({ at: 0, until: 9e9, why: 'forbidden' }, Av.REASK_MS * 2), '④ re-asked on a schedule; a refusal kept with its reason until its time');
const lark = read('src/channels/lark.js');
ok(/noteName\(m\.member_id, 'member', m\.name\)/.test(lark) && /noteName\(x\.id, 'sender', x\.name\)/.test(lark) && /async warmPeople\(ids\)/.test(lark) && /async resolveSelf\(\)/.test(lark), '④ Lark keeps member / sender names + profiles in the on-disk memo, warms every author, resolves its own id');
ok(/authen\/v1\/user_info', \{ what: 'lark user info' \}/.test(lark), '① the own id is ONE gated api() read (paced, metered), never a raw fetch');
// ⑤ memo keys + caps
ok(Av.memoKey('person', 'ou_1') === 'ou_1' && Av.memoKey('chat', 'oc_1') === 'chat~oc_1' && Av.memoKey('bot', 'cli_1') === 'bot~cli_1', '⑤ memo keys: a person\'s unchanged, chat~ / bot~');
ok(JSON.stringify(Av.keyOf('chat~oc_1')) === '{"kind":"chat","id":"oc_1"}' && Av.keyOf('ou_1').kind === 'person' && Av.authorOk(Av.memoKey('chat', 'oc_1')), '⑤ the route key round-trips');
const LarkM = require(path.join(repo, 'src/channels/lark.js'));
const row = Av.avatarRow(LarkM.caps);
ok(row.kinds.join() === 'person,chat' && /bot/.test(row.kindsWhy), '⑤ Lark fetches people + group pictures; a bot\'s missing source is said by name');
ok(Av.avatarRow({ avatars: 'fetch' }).kinds.join() === 'person', '⑤ an adapter that says nothing fetches people only');
// the Lark chat answer's shape (im/v1/chats/:chat_id, a member's user token): data.avatar is a URL on Lark's picture host
const CHAT = { code: 0, msg: 'success', data: { avatar: 'https://s1-imfile.feishucdn.com/static-resource/v1/v2_abc~?image_size=72x72&format=png', name: 'Fish B2B', chat_mode: 'group', external: false } };
ok(LarkM.chatAvatarUrlOf(CHAT.data).startsWith('https://s1-imfile.feishucdn.com/') && LarkM.chatAvatarUrlOf({ avatar: 'https://evil.example/x.png' }) === '' && LarkM.chatAvatarUrlOf({}) === '', '⑤ the chat avatar reader: Lark\'s host only, bounded');
// ⑥ the badge is paint on top + the brand marks
const css = read('public/style.css');
const badgeRule = (css.match(/\n\.chan-av-badge \{[^}]*\}/) || [''])[0];
ok(/z-index: 1;/.test(badgeRule), '⑥ the badge rule paints ON TOP (z-index)');
ok(/s\.insertBefore\(img, s\.querySelector\('\.chan-av-badge'\)\)/.test(read('src/lib/channel-chrome.js')), '⑥ the picture is inserted BEFORE the badge, never appended over it');
for (const v of ['lark', 'gmail', 'slack']) {
  const svg = read(`public/brand/${v}.svg`);
  ok(/^<!--[^]*?drawn by hand[^]*?-->\s*<svg [^>]*viewBox="0 0 24 24"/.test(svg) && !/<script|on[a-z]+=|fill="#|href=/i.test(svg), `⑥ public/brand/${v}.svg: our drawing, monochrome, no script`);
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
