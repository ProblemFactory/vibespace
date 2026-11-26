#!/usr/bin/env node
// test-may-use.mjs — unit «what it may use» (the owner, 2026-11-17: «话说现在似乎没办法根据对话看到它到底有什么channel之类的
// 权限？»): Session Properties shows, for one existing conversation, everything it may use NOW — door by door, BY WHAT, the
// 「除了」 that takes it out said too — through each door's OWN verdict. PURE src/may-use-model.js + ORCH src/server/may-use.js
// + the channel door's lister (src/server/channels-access.js mayUseFor) over a REAL grants store and the REAL channel reader.
// No hub, no browser, no CLI.
//   ① the model: the owner's order (sessions, channels first, browser, vault, keys, exits, windows, built-ins last); the two
//      target doors not shown; the doors' words for «by what» in one spelling; a 「除了」 and «unknown» listed, other refusals
//      not; a long list = NAMED_MAX names + the count; a Terminal with no agent lists no resource
//   ② EVERY ROW A DOOR ADMITS IS IN THE VIEW — RED CONTROL: a patched model that drops one door's rows (a mutant copy) is caught
//   ③ the facts: LIVE (its id, its webui key, its browser key, its Task Groups) · NOT LIVE (the sessions list's row, the durable
//      browser binding, no webui key) · the Task Group store unreadable ⇒ «unknown», every door told · no such conversation
//      ⇒ not_found · a Terminal ⇒ no door asked
//   ④ a door that throws answers its part as unknown, by name; the other parts stand
//   ⑤ the channel door, real: an account granted through a Task Group (its 「除了」 drawn), an account it ticked itself, a rule,
//      a single conversation (access + the owner's row ADD: one answer), a conversation a 「除了」 takes it out of, a
//      notification that wakes it, a raw-API tier — each under its account
//   ⑥ THE COST (主开发's law): 200 000 channel conversation rows and a few hundred grants — the whole answer under BUDGET_MS of
//      the loop, the time PRINTED; the channel part never walks the conversations (a counting index proves it)
//   ⑦ the route: an agent's / a job's bearer is refused human_only (THE person verdict), the page's own request answered
//   ⑨–⑬ CURE r1 (主开发 22:28Z): MUST 1 the door's per-entry rule (an everyone-except-its-group account it ticked is its OWN
//      tick — RED: the whole-row rule), MUST 2 «may request» is its own answer (RED: a lister that drops the level), MUST 3 exits
//      and windows never cut, SHOULD e a 「除了」 said behind three granted rows + sums of the granted only, SHOULD a a stopped
//      conversation from the KEPT rows inside the budget (a sweep only when none; paused said), SHOULD b an untick says why
//   ⑮–⑰ THE MOVE ONTO int411 8cef0006a (the meetings of logic): ⑮ the Task Groups are asked with the conversation's machine, as
//      every door asks since B-df5f (RED: the copy without it); ⑯ the exit lister answers as the door does after B-48a4 (RED: a lister
//      that drops the groups); ⑰ Session Properties holds B-460d's CPU priority row and the «What it may use» section, each once
//   ⑱–⑲ THE HOSTED CURE (主开发 00:53Z): ⑱ the section's ref is made ONCE at the window's scope (a ref made inside render kept the
//      first render's DOM alive — test-record-clear-client's heap leg); ⑲ the asked scroll lands on the section on the page at
//      the frame, the flag cleared only after it (RED: each release form planted back)
//   ⑳–㉑ THE BOX PROOF'S CURE (主开发 04:23Z): ⑳ a group is named from the hub's answer first (a just-made group drew by its id);
//      ㉑ the asked scroll lands after the answer is drawn — the flag held until then, the section's paint asks again (RED each)
//   ⑭ THE RESTACK ONTO 2.369.410: the key lister reads the door's LIVE grants (a once-grant from before a restart is not
//      listed; RED: a lister over the raw store) — the release's B-3190 follow-up made the key door read them
//   ⑧ THE FORM'S ROWS BYTE FOR BYTE: src/lib/may-use-rows.js renders what the released form's closures rendered (a frozen copy of
//      2.369.407's, scripts/fixtures/may-use/) over the same rows — the lift changed no byte
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratch, anchored } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof n} — the arguments are swapped`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 1500) : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const M = require(path.join(REPO, 'src/may-use-model.js'));
const MU = require(path.join(REPO, 'src/server/may-use.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const ChannelsGrants = require(path.join(REPO, 'src/server/channels-grants.js'));
const ChannelsAccess = require(path.join(REPO, 'src/server/channels-access.js'));

const A = (door, resource, extra) => ({ door, resource, name: resource, ...extra });
console.log('— ① THE MODEL: the owner\'s order, by what, the two target doors not shown, a long list bounded');
{
  const v = M.viewOf({ facts: { live: true, groups: [{ id: 'g1', name: 'Lane' }] }, answers: [
    A('exit', 'h1:use', { ok: true, via: 'session' }), A('window', 'w1', { ok: true, via: 'self-open' }), A('browser-profile', 'p1', { ok: true, via: 'task', groupId: 'g1' }),
    A('browser-profile', 'p2', { ok: true, via: 'all' }), A('automation-key-use', 'k1', { ok: false, code: 'excepted', except: { kind: 'group', id: 'g1' } }),
    A('automation-key-use', 'k2', { ok: false, code: 'not_granted' }), A('automation-key-reach', 'r1', { ok: true, via: 'everyone' }), A('group-visibility', 'g1', { ok: true, via: 'everyone' }),
    A('vault-use', 'v:a#value', { ok: false, code: 'groups_unreadable' }), A('window', 'w2', { ok: true, via: 'a-word-nobody-knows' }),
  ] });
  ok(JSON.stringify(v.kinds.map((k) => k.kind)) === JSON.stringify(['sessions', 'channels', 'browser', 'vault', 'keys', 'exits', 'windows', 'builtins']), '① the kinds in THE OWNER\'S ORDER: sessions, channels first among the resources, browser, vault, keys, exits, windows, the built-ins last', v.kinds.map((k) => k.kind));
  const all = JSON.stringify(v);
  ok(!all.includes('"r1"') && !all.includes('group-visibility') && M.NOT_SHOWN['automation-key-reach'] && M.NOT_SHOWN['group-visibility'], '① the two TARGET doors (a key acting ON it, its group shown to outsiders) are not shown — named in NOT_SHOWN');
  const br = v.kinds.find((k) => k.kind === 'browser');
  ok(br.profiles[0].via === 'group' && br.profiles[0].groupId === 'g1' && br.profiles[1].via === 'everyone', '① «by what» in one spelling: browser-profiles\' task / all ⇒ group (its id) / everyone; its own before a group\'s before everyone\'s', br.profiles);
  const ex = v.kinds.find((k) => k.kind === 'exits').rows[0], wi = v.kinds.find((k) => k.kind === 'windows').rows;
  ok(ex.via === 'self' && wi[0].via === 'self' && wi[1].state === 'unknown', '① exit-reach\'s session and window-reach\'s self-open ⇒ itself; a door word this release does not know is UNKNOWN, never guessed', { ex, wi });
  const keys = v.kinds.find((k) => k.kind === 'keys').rows;
  ok(keys.length === 1 && keys[0].state === 'excepted' && keys[0].except.kind === 'group', '① a 「除了」 is listed (and names the exception); a plain «not granted» is not', keys);
  ok(v.kinds.find((k) => k.kind === 'vault').use[0].state === 'unknown', '① its Task Groups unreadable ⇒ the row says UNKNOWN, never «none»');
  const many = M.viewOf({ answers: Array.from({ length: 40 }, (_, i) => A('automation-key-use', 'k' + String(i).padStart(2, '0'), { ok: true, via: 'everyone' })) }).kinds.find((k) => k.kind === 'keys');   // (windows and exits are never cut — ⑪)
  ok(many.rows.length === M.NAMED_MAX && many.more === 40 - M.NAMED_MAX, `① a list that can run to hundreds: ${M.NAMED_MAX} by name and the COUNT of the rest (no «show more»)`, { n: many.rows.length, more: many.more });
  const sh = M.viewOf({ facts: { noAgent: true }, answers: [A('exit', 'h1:use', { ok: true, via: 'everyone' })] });
  ok(JSON.stringify(sh.kinds.map((k) => k.kind)) === '["sessions","builtins"]' && sh.facts.noAgent, '① a Terminal with no agent: no resource lists (the form\'s one sentence is the page\'s)', sh.kinds.map((k) => k.kind));
}

console.log('— ② EVERY ROW A DOOR ADMITS IS IN THE VIEW — RED CONTROL: a model that drops one door\'s rows');
const BATTERY = [
  A('exit', 'h1:use', { ok: true, via: 'session' }), A('exit', 'h2:run', { ok: true, via: 'group', groupId: 'g1' }), A('window', 'w1', { ok: true, via: 'everyone' }),
  A('browser-profile', 'p1', { ok: true, via: 'conversation' }), A('browser-login', 'l1', { ok: true, via: 'own' }), A('vault-use', 'v1', { ok: true, via: 'group', groupId: 'g1' }),
  A('vault-job', 'j1', { ok: true, via: 'conversation' }), A('automation-key-use', 'k1', { ok: true, via: 'everyone' }),
  A('channel-reach', 'conversation:a1/c1', { ok: true, via: 'conversation', parent: 'account:a1' }), A('channel-watch', 'account:a1', { ok: true, via: 'group', groupId: 'g1', parent: 'account:a1' }),
  A('channel-api', 'a1', { ok: true, via: 'everyone', parent: 'account:a1' }),
];
function omitted(model) {
  const v = model.viewOf({ answers: BATTERY, accounts: [{ id: 'a1', label: 'Inbox', state: 'none' }] });
  const seen = new Set();
  const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x.door && x.resource && x.state === 'ok') seen.add(`${x.door}|${x.resource}`); Object.values(x).forEach(walk); } };
  walk(v.kinds);
  return BATTERY.filter((a) => !seen.has(`${a.door}|${a.resource}`)).map((a) => `${a.door}|${a.resource}`);
}
{
  const miss = omitted(M);
  ok(miss.length === 0, '② every admitted answer of the eleven-row battery (all ten shown doors) is in the view', miss);
  const MC = mutantCopies('may-use', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/may-use-model.js'), 'utf8');
  const patched = editAnchor(src, "if (!a || typeof a !== 'object' || !DOOR_KIND[a.door]) return null;", "if (!a || typeof a !== 'object' || !DOOR_KIND[a.door] || a.door === 'exit') return null;", "src/may-use-model.js");
  ok(patched !== src, '② (the drop patch applied)');
  const copy = require(MC.write('src/may-use-model.js', patched, 'drop-exit'));
  const red = omitted(copy);
  ok(red.length === 2 && red.every((k) => k.startsWith('exit|')), '② RED CONTROL: the patched model that drops the exit door\'s rows is CAUGHT (both exit rows named as omitted)', red);
  for (const r of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 1, label: '② ' })) ok(r.pass, r.name, r.detail);
}

function rig({ sessions = [], stored = [], groupsThrow = false, doors = {}, noAgent = () => false, onGroups = null, mod = MU } = {}) {
  const activeSessions = new Map(sessions.map((s) => [s.id, s]));
  const seen = [];
  const mk = (name) => ({ [name === 'browser' ? 'admitsFor' : 'mayUseFor']: (f) => { seen.push({ name, f }); return []; } });
  const D = { channels: { mayUseFor: (f) => { seen.push({ name: 'channels', f }); return { accounts: [], answers: [] }; } }, browser: mk('browser'), logins: mk('logins'), vaultUse: mk('vaultUse'), automation: mk('automation'), exits: mk('exits'), windows: mk('windows'), ...doors };
  const mu = mod.create({
    activeSessions, sessionKeyOf: (s, id) => (s.backendSessionId ? `${s.backend}:${s.backendSessionId}` : `webui:${id}`), addressableId: (s) => s.backendSessionId || null,
    storedRow: async (key) => stored.find((r) => r.sessionKey === key) || null,
    groupsOf: (q) => { if (onGroups) onGroups(q); if (groupsThrow) throw new Error('tasks.json unreadable'); return q.sessionKey === 'codex:c1' || q.cwd === '/w/lane' ? [{ id: 'g1', title: 'Lane' }] : []; },
    noAgentOf: noAgent, browserKeyOf: (cid) => (cid === 'c9' ? 'bk-0000beef' : ''), grants: null, doors: D, log: () => { },
  });
  return { mu, seen };
}
console.log('— ③ THE FACTS: live, not live (its stored facts), unknown groups, no such conversation, a Terminal');
{
  const R = rig({ sessions: [{ id: 'sess-1', backend: 'codex', backendSessionId: 'c1', cwd: '/x', _browserKey: 'bk-00001111' }] });
  const f = (await R.mu.factsOf('codex:c1')).facts;
  ok(f.live && JSON.stringify(f.conversationKeys) === JSON.stringify(['c1', 'webui:sess-1', 'bk-00001111']) && JSON.stringify(f.groupIds) === '["g1"]' && f.groups[0].name === 'Lane',
    '③ LIVE: its conversation id, its webui key, its browser key; its Task Groups by groupsForSession (named)', f);
  const S = rig({ stored: [{ sessionKey: 'claude:c9', backend: 'claude', backendSessionId: 'c9', cwd: '/w/lane', status: 'stopped' }] });
  const g = (await S.mu.factsOf('claude:c9')).facts;
  ok(!g.live && JSON.stringify(g.conversationKeys) === JSON.stringify(['c9', 'bk-0000beef']) && !g.conversationKeys.some((k) => k.startsWith('webui:')) && JSON.stringify(g.groupIds) === '["g1"]',
    '③ NOT LIVE: the sessions list\'s row (its id, its folder ⇒ its group), the durable browser binding, NO webui key', g);
  const U = rig({ sessions: [{ id: 'sess-2', backend: 'claude', backendSessionId: 'c2', cwd: '/x' }], groupsThrow: true });
  const r = await U.mu.viewFor('claude:c2');
  ok(r.ok && r.view.facts.groupsUnknown && U.seen.length === 7 && U.seen.every((x) => (x.f.groupsUnreadable === true)), '③ the Task Group store unreadable ⇒ the facts say UNKNOWN and every one of the seven door listers is told (groupsUnreadable)', U.seen.map((x) => x.name));
  ok((await U.mu.viewFor('claude:nobody')).code === 'not_found', '③ no conversation with that key live or listed ⇒ not_found');
  const T = rig({ sessions: [{ id: 'sess-3', backend: 'shell', cwd: '/x' }], noAgent: (b) => b === 'shell' });
  const t = await T.mu.viewFor('webui:sess-3');
  ok(t.ok && t.view.facts.noAgent && T.seen.length === 0, '③ a Terminal with no agent: no door is asked at all', T.seen.map((x) => x.name));
}

console.log('— ④ A DOOR THAT THROWS answers its part as unknown, by name; the others stand');
{
  const R = rig({ sessions: [{ id: 'sess-1', backend: 'codex', backendSessionId: 'c1', cwd: '/x' }], doors: {
    exits: { mayUseFor: () => { throw new Error('hosts.json gone'); } }, windows: { mayUseFor: () => [{ door: 'window', resource: 'w1', name: 'Editor', ok: true, via: 'everyone' }] } } });
  const r = await R.mu.viewFor('codex:c1');
  const ex = r.view.kinds.find((k) => k.kind === 'exits'), wi = r.view.kinds.find((k) => k.kind === 'windows');
  ok(r.ok && ex.rows.length === 1 && ex.rows[0].state === 'unknown' && wi.rows[0].name === 'Editor' && r.ms.parts.exits !== undefined, '④ the exits part failed ⇒ ONE unknown row there; the windows part answered as usual; each part timed', { ex, wi, ms: r.ms });
}

/** A REAL channel door over a memory grants store: channels-access with the smallest engine context it reads. */
function channelRig({ conversations = 0, extraConvRows = 0 } = {}) {
  const store = GS.create({ memory: true });
  const set = (door, res, to, except = []) => { const w = store.set(door, res, { to, except }, 'user'); if (!w.ok) throw new Error(`${door} ${res}: ${w.code} ${w.error || ''}`); };
  set('channel-reach', 'account:a1', [{ kind: 'group', id: 'g1', authority: 'send' }], [{ kind: 'conversation', key: 'c-left' }]);
  set('channel-reach', 'account:a2', [{ kind: 'conversation', key: 'c1', authority: 'draft' }]);
  set('channel-reach', 'rule:p1', [{ kind: 'everyone' }]);
  set('channel-reach', 'conversation:a2/x1', [{ kind: 'conversation', key: 'c1', authority: 'send' }]);
  set('channel-reach', 'conversation:a2/x1#user', [{ kind: 'group', id: 'g1', level: 'visible' }]);
  set('channel-reach', 'conversation:a1/x2', [{ kind: 'group', id: 'g1' }], [{ kind: 'conversation', key: 'c1' }]);
  set('channel-watch', 'account:a2', [{ kind: 'conversation', key: 'c1' }]);
  set('channel-api', 'a1', [{ kind: 'group', id: 'g1', tier: 'read' }]);
  for (let i = 0; i < extraConvRows; i++) set('channel-reach', `conversation:a1/n${i}`, [{ kind: 'conversation', key: `other-${i % 50}` }, { kind: 'group', id: `gx${i % 7}` }]);
  const live = {};
  for (let i = 0; i < conversations; i++) live[`a1/n${i}`] = { adapterId: 'a1', convId: `n${i}`, title: `Thread ${i}` };
  live['a2/x1'] = { adapterId: 'a2', convId: 'x1', title: 'Billing thread' }; live['a1/x2'] = { adapterId: 'a1', convId: 'x2', title: 'Ops thread' };
  let walked = 0;
  const liveProxy = new Proxy(live, { ownKeys(t) { walked++; return Reflect.ownKeys(t); } });
  const tables = { patternAssignments: { p1: { id: 'p1', adapterId: 'a1', name: 'Invoices rule', access: [], watchers: [] } }, accountAssignments: {} };
  const CG = ChannelsGrants.create({ grants: store });
  const adapters = [{ id: 'a1', kind: 'gmail', label: 'Work mail', enabled: true }, { id: 'a2', kind: 'lark', label: 'Team chat', enabled: true }, { id: 'dlg', kind: 'agents', label: 'Agents' }];
  const registry = { get: (kind) => (kind === 'agents' ? require(path.join(REPO, 'src/channels/agents.js')) : { reach: 'grants' }) };   // the agents module's OWN declaration (listed: false, reach: msg-acl)
  const ctx = { store: { index: { live: () => liveProxy, table: (n) => tables[n] || {}, peek: (k) => live[k] } }, adapterRecords: () => ({ adapters }), registry, humanNameOf: (rec, en) => en.title, CG, log: () => { } };
  const access = ChannelsAccess.create(ctx);
  return { store, access, walkedCount: () => walked };
}
console.log('— ⑤ THE CHANNEL DOOR, REAL: accounts in the form\'s rows, rules, single conversations, notifications, raw API');
{
  const { access } = channelRig();
  const r = access.mayUseFor({ cid: 'c1', conversationKeys: ['c1', 'webui:sess-1'], groupIds: ['g1'], groupsUnreadable: false });
  const a1 = r.accounts.find((a) => a.id === 'a1'), a2 = r.accounts.find((a) => a.id === 'a2');
  ok(r.accounts.length === 2 && !r.accounts.some((a) => a.id === 'dlg'), '⑤ the form\'s own account list: the agents module declares itself unlisted with its own reach — not a tick row (its declaration, never a builtin branch)', r.accounts.map((a) => a.id));
  ok(a1.state === 'granted' && a1.granted && JSON.stringify(a1.groups) === '["g1"]' && a1.authority === 'send' && a1.except.length === 1 && a1.except[0].key === 'c-left',
    '⑤ Work mail: granted THROUGH Task Group g1 (can send) — ticked and locked, its 「除了」 drawn (accountRows\' fields)', a1);
  ok(a2.state === 'own' && a2.own && !a2.granted && a2.authority === 'draft', '⑤ Team chat: its OWN tick (draft only) — the row the form\'s tick writes', a2);
  const byRes = (res) => r.answers.filter((x) => x.resource === res);
  ok(byRes('rule:p1').length === 1 && byRes('rule:p1')[0].ok && byRes('rule:p1')[0].via === 'everyone' && byRes('rule:p1')[0].name === 'Invoices rule' && byRes('rule:p1')[0].parent === 'account:a1',
    '⑤ a rule that admits it (every agent), by its name, under its account', byRes('rule:p1'));
  const x1 = byRes('conversation:a2/x1');
  ok(x1.length === 1 && x1[0].ok && x1[0].via === 'conversation' && x1[0].name === 'Billing thread' && x1[0].detail.authority === 'send', '⑤ a single conversation: its access row and the owner\'s row ADD — ONE answer, its best (its own, can send), named by the conversation', x1);
  const x2 = byRes('conversation:a1/x2');
  ok(x2.length === 1 && !x2[0].ok && x2[0].code === 'excepted' && x2[0].except.key === 'c1', '⑤ a conversation a 「除了」 takes it out of is listed, the exception named', x2);
  const w = r.answers.find((x) => x.door === 'channel-watch'), api = r.answers.find((x) => x.door === 'channel-api');
  ok(w && w.ok && w.parent === 'account:a2' && api && api.ok && api.detail.tier === 'read' && api.via === 'group' && api.parent === 'account:a1', '⑤ the notification that wakes it (Team chat) and its raw-API tier (read, through its Task Group)', { w, api });
  const v = M.viewOf({ answers: r.answers, accounts: r.accounts });
  const ch = v.kinds.find((k) => k.kind === 'channels');
  ok(ch.accounts.length === 2 && ch.accounts[0].account.id === 'a1' && ch.accounts[0].rules.length === 1 && ch.accounts[1].chats.length === 1, '⑤ the view puts each grain under its account', ch.accounts.map((a) => ({ id: a.account.id, rules: a.rules.length, chats: a.chats.length })));
}

console.log('— ⑥ THE COST at the owner\'s size: 200 000 channel conversation rows, a few hundred grants — under BUDGET_MS, PRINTED');
{
  const C = channelRig({ conversations: 200000, extraConvRows: 300 });
  const grantsRows = C.store.health().rows;
  const R = rig({ sessions: [{ id: 'sess-1', backend: 'codex', backendSessionId: 'c1', cwd: '/x' }], doors: { channels: C.access } });
  await R.mu.viewFor('codex:c1');   // warm (the channel door's index is built once per store change)
  const times = [];
  for (let i = 0; i < 7; i++) { const r = await R.mu.viewFor('codex:c1'); times.push(r.ms.total); }
  times.sort((a, b) => a - b);
  const median = times[3];
  console.log(`    the answer for one conversation: median ${median.toFixed(2)} ms of the loop (max ${times[6].toFixed(2)}), ${grantsRows} grant rows, 200 000 channel conversation rows`);
  ok(grantsRows >= 300 && grantsRows <= 400, `⑥ (the store holds a few hundred grants: ${grantsRows})`);
  ok(median < MU.BUDGET_MS, `⑥ the whole answer holds the loop under ${MU.BUDGET_MS} ms (median ${median.toFixed(2)} ms)`, times);
  ok(C.walkedCount() === 0, '⑥ the channel part NEVER walks the conversations (the index\'s key list was asked 0 times — names are looked up per listed row)', { walked: C.walkedCount() });
}

console.log('— ⑦ THE ROUTE: an agent\'s bearer refused human_only (THE person verdict); the page\'s own request answered');
{
  const { personVerdict } = require(path.join(REPO, 'src/routes/vault.js'));
  const R = rig({ sessions: [{ id: 'sess-1', backend: 'codex', backendSessionId: 'c1', cwd: '/x' }] });
  let handler = null;
  R.mu.mount({ get: (p, h) => { if (p === '/api/may-use') handler = h; } }, { personVerdict });
  const call = async (headers, query) => { let out = null; const res = { status(c) { this.c = c; return this; }, json(b) { out = { code: this.c || 200, body: b }; return this; } }; await handler({ headers, query, socket: {} }, res); return out; };
  const agent = await call({ authorization: 'Bearer vsst_' + 'x'.repeat(20), host: 'h:1' }, { key: 'codex:c1' });
  const job = await call({ authorization: 'Bearer jbt_' + 'y'.repeat(20), host: 'h:1' }, { key: 'codex:c1' });
  ok(agent.code === 403 && agent.body.code === 'human_only' && job.code === 403 && job.body.code === 'human_only' && !JSON.stringify(agent.body).includes('vsst_'), '⑦ an agent\'s session token and a job\'s token: 403 human_only, the bearer never echoed', { agent, job });
  const page = await call({ host: 'h:1', 'sec-fetch-site': 'same-origin' }, { key: 'codex:c1' });
  ok(page.code === 200 && page.body.ok && Array.isArray(page.body.view.kinds), '⑦ the page\'s own request: the view', page && { code: page.code, keys: Object.keys(page.body || {}) });
  const nf = await call({ host: 'h:1', 'sec-fetch-site': 'same-origin' }, { key: 'codex:none' });
  ok(nf.code === 404 && nf.body.code === 'not_found', '⑦ an unknown conversation: 404 not_found');
}

console.log('— ⑧ THE FORM\'S ROWS, BYTE FOR BYTE: the shared renderers draw exactly what the released form\'s closures drew');
{
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const tt = (k, o = {}) => String(k).replace(/\{(\w+)\}/g, (_, n) => (o[n] !== undefined ? String(o[n]) : `{${n}}`));
  const quoted = (names) => names.map((n) => tt('“{name}”', { name: n })).join(', ');
  const base = require(path.join(REPO, 'scripts/fixtures/may-use/form-rows-2.369.407.cjs'))(esc, tt, quoted);
  const src = fs.readFileSync(path.join(REPO, 'src/lib/may-use-rows.js'), 'utf8');
  const body = editAnchor(editAnchor(src, /^import [^\n]*\n/gm, '', "src/lib/may-use-rows.js"), /^export (const|function) /gm, '$1 ', "src/lib/may-use-rows.js");
  ok(!/^import |^export /m.test(body), '⑧ (the module read as plain functions)');
  const now = new Function('escHtml', 't', body + '\nreturn { doorBtn, provRow, accLine, grantedAccountHtml, tickAccountHtml };')(esc, tt);
  const RES = [
    { key: 'chan', data: 'data-row="chan"', icon: '<svg/>', name: 'Channels <b>&</b>', what: 'Inbox: read, search, draft', end: base.doorBtn('chan', 'Channels window'), sub: '<i>x</i>', sum: '2 · 1', badge: '<span class="ns-badge todo">1</span>', body: '<p>b</p>' },
    { key: 'vault', cls: 'fact', data: 'data-fact="vault"', icon: '', name: 'Vault "quoted"', what: '', end: '', sum: '' },
    { key: 'builtin', cls: 'locked', icon: '<i/>', name: '3 built-ins', sum: 'always', body: null, sub: '<u>s</u>' },
  ];
  let same = 0, diffs = [];
  for (const r of RES) {
    if (base.prov(r) === now.provRow(r)) same++; else diffs.push(['prov', r.key]);
    for (const open of [true, false]) { if (base.accOf(() => open)(r) === now.accLine(r, open)) same++; else diffs.push(['acc', r.key, open]); }
    if (base.doorBtn(r.key, r.name, 'data-x="1"') === now.doorBtn(r.key, r.name, 'data-x="1"')) same++; else diffs.push(['door', r.key]);
  }
  const ACC = [
    { id: 'gm', kind: 'gmail', vendor: 'gmail', label: 'IR <mail>', granted: true, authority: 'send', everyone: false, groups: ['T-ir', 'T-2'], except: [{ kind: 'conversation', key: 'c-1' }, { kind: 'group', id: 'T-x' }] },
    { id: 'lk', kind: 'lark', vendor: '', label: 'Co "Lark"', granted: true, authority: 'draft', everyone: true, groups: [], except: [] },
    { id: 'sl', kind: 'slack', vendor: 'slack', label: 'Vendor & co', granted: false, authority: null, everyone: false, groups: [], except: [] },
  ];
  const groupNameOf = (id) => 'Group ' + id, exceptName = (p) => 'name of ' + (p.key || p.id);
  const WORDS = ['Written into the channel assignment at create: this conversation · draft only', 'Not assigned to the picked Task Groups — tick to give this conversation (draft only)'];
  for (const r of ACC) {
    if (r.granted) { if (base.granted(r, groupNameOf, exceptName) === now.grantedAccountHtml(r, { groupNameOf, exceptName, quoted })) same++; else diffs.push(['granted', r.id]); }
    else for (const ticked of [true, false]) { if (base.tick(r, ticked) === now.tickAccountHtml(r, { ticked, words: WORDS })) same++; else diffs.push(['tick', r.id, ticked]); }
  }
  ok(diffs.length === 0 && same === 16, `⑧ ${same} renders compared — card rows, accordion lines (open and shut), doors, an account granted through two Task Groups with its 「除了」, one granted to every agent, a tick row on and off: every one byte for byte`, diffs);
  const form = fs.readFileSync(path.join(REPO, 'src/lib/new-session-form.js'), 'utf8');
  ok(/const prov = provRow;/.test(form) && /const acc = \(r\) => accLine\(r, !!this\._ns\.open\[r\.key\]\);/.test(form) && /grantedAccountHtml\(r, \{/.test(form) && /tickAccountHtml\(r, \{ ticked, words: \[t\('Written into the channel assignment at create/.test(form) && !/const doorBtn = \(door, label/.test(form),   // stale-pins: kept — a deliberate absence check: the form no longer holds the renderer that moved
    '⑧ the form draws through the shared module (no twin left in new-session-form.js)');
}

console.log('— ⑨ CURE r1 MUST 1 — THE DOOR\'S RULE, entry by entry: an account shared with every agent EXCEPT a Task Group, the conversation in that group, ticked for it by the owner');
const ACL9 = require(path.join(REPO, 'src/channel-acl.js'));
function sceneRig(accessMod = null) {
  const store = GS.create({ memory: true });
  const set = (door, res, to, except = []) => { const w = store.set(door, res, { to, except }, 'user'); if (!w.ok) throw new Error(`${door} ${res}: ${w.code} ${w.error || ''}`); };
  set('channel-reach', 'account:a1', [{ kind: 'everyone', authority: 'draft' }, { kind: 'conversation', key: 'c1', authority: 'draft' }], [{ kind: 'group', id: 'gL' }]);
  set('channel-reach', 'conversation:a1/r9#user', [{ kind: 'group', id: 'gL', level: 'requestable' }]);
  const CG = ChannelsGrants.create({ grants: store });
  const adapters = [{ id: 'a1', kind: 'gmail', label: 'Shared mail', enabled: true }];
  const live = { 'a1/r9': { adapterId: 'a1', convId: 'r9', title: 'Board thread' } };
  const ctx = { store: { index: { live: () => live, table: () => ({}), peek: (k) => live[k] } }, adapterRecords: () => ({ adapters }), registry: { get: () => ({ reach: 'grants' }) }, humanNameOf: (rec, en) => en.title, CG, log: () => { } };
  return { CG, access: (accessMod || ChannelsAccess).create(ctx) };
}
const FACTS9 = { cid: 'c1', conversationKeys: ['c1'], groupIds: ['gL'], groupsUnreadable: false };
{
  const { CG, access } = sceneRig();
  const r = access.mayUseFor(FACTS9);
  const a1 = r.accounts.find((a) => a.id === 'a1');
  const door = CG.accountGrants('a1').some((g) => ACL9.principalApplies({ kind: 'agent', id: 'c1', groups: ['gL'] }, g) && ACL9.canSee(g.level));
  ok(door === true, '⑨ (the door itself — channel-acl over the account\'s grants, each entry its own 「除了」 — admits the conversation: its OWN entry carries no exception)');
  ok(a1 && a1.state === 'own' && a1.own && !a1.granted, '⑨ the section agrees with the door: the account is its OWN tick (ticked — the everyone grant leaves its group out, its own entry does not)', a1);
  const MC = mutantCopies('may-use-r1', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf8');
  const cut = "const accessNamed = (res) => (cid ? CG.accessOf(res).filter((r) => F.rowNames(r, ctx)) : []);";
  ok(src.split(cut).length === 2, '⑨ (the door\'s per-entry check is there once)');
  const whole = editAnchor(src, cut, "const accessNamed = (res) => { const r = CG.rowOf(CG.DOORS.reach, res); const v = require('../grant-model.js').admits([{ door: 'channel-reach', resource: res, to: r.to, except: r.except }], RF); return v.ok ? CG.accessOf(res) : []; };", "src/server/channels-access.js");
  const mod = require(MC.write('src/server/channels-access.js', whole, 'whole-row'));
  const red = sceneRig(mod).access.mayUseFor(FACTS9).accounts.find((a) => a.id === 'a1');
  ok(red && red.state === 'excepted', '⑨ RED CONTROL: the whole-row rule (the row\'s 「除了」 applied to the conversation\'s own entry — r0\'s) says «left out», against the door', red);
  console.log('— ⑩ CURE r1 MUST 2 — «MAY REQUEST» IS NOT «MAY SEE»');
  const r9 = r.answers.find((x) => x.resource === 'conversation:a1/r9');
  const g9 = CG.conversationGrants('a1/r9').find((g) => ACL9.principalApplies({ kind: 'agent', id: 'c1', groups: ['gL'] }, g));
  ok(g9 && !ACL9.canSee(g9.level) && ACL9.canRequest(g9.level), '⑩ (the door: its Task Group may only REQUEST «Board thread» — canSee false, canRequest true)');
  ok(r9 && r9.ok && r9.request === true && r9.name === 'Board thread', '⑩ the lister answers it as a REQUEST (its own answer), never as a conversation it may see', r9);
  const v9 = M.viewOf({ answers: r.answers, accounts: r.accounts }).kinds.find((k) => k.kind === 'channels').accounts[0].chats[0];
  ok(v9 && v9.state === 'request', '⑩ the view keeps it apart: state «request» (the page words it «may ask for it»), never «ok»', v9);
  const cutL = "const sees = hits.filter((x) => ACL.canSee(x.level)), asks = hits.filter((x) => ACL.canRequest(x.level));";
  ok(src.split(cutL).length === 2, '⑩ (the level split is there once)');
  const nolevel = require(MC.write('src/server/channels-access.js', editAnchor(src, cutL, 'const sees = hits, asks = [];', "src/server/channels-access.js"), 'no-level'));
  const red9 = sceneRig(nolevel).access.mayUseFor(FACTS9).answers.find((x) => x.resource === 'conversation:a1/r9');
  ok(red9 && red9.ok && !red9.request, '⑩ RED CONTROL: a lister that drops the level lists it as one it may SEE (r0\'s false answer)', red9);
  for (const c of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 2, label: '⑨⑩ ' })) ok(c.pass, c.name, c.detail);
}

console.log('— ⑪ CURE r1 MUST 3 + SHOULD e — no count without a door; a 「除了」 is said even behind three granted rows');
{
  const wins = Array.from({ length: 40 }, (_, i) => A('window', 'w' + String(i).padStart(2, '0'), { ok: true, via: 'everyone' }));
  const exits = Array.from({ length: 12 }, (_, i) => A('exit', `h${i}:use`, { ok: true, via: 'everyone' }));
  const v = M.viewOf({ answers: [...wins, ...exits] });
  const W = v.kinds.find((k) => k.kind === 'windows'), X = v.kinds.find((k) => k.kind === 'exits');
  ok(W.rows.length === 40 && W.more === 0 && W.uncut && X.rows.length === 12 && X.more === 0 && JSON.stringify(M.UNCUT) === '["exits","windows"]',
    '⑪ exits and windows have no window that lists them whole: they are NEVER cut (every row drawn, no «N more» that opens nothing)', { w: W.rows.length, x: X.rows.length });
  const keys = [...Array.from({ length: 5 }, (_, i) => A('automation-key-use', 'k' + i, { ok: true, via: 'everyone' })), A('automation-key-use', 'kx1', { ok: false, code: 'excepted', except: { kind: 'group', id: 'g1' } }), A('automation-key-use', 'kx2', { ok: false, code: 'groups_unreadable' })];
  const K = M.viewOf({ answers: keys }).kinds.find((k) => k.kind === 'keys');
  ok(K.rows.length === 5 && K.rows.filter((r) => r.state === 'ok').length === 3 && K.rows.some((r) => r.resource === 'kx1' && r.state === 'excepted') && K.rows.some((r) => r.resource === 'kx2') && K.more === 2 && K.moreOut === 0,
    '⑪ five granted keys and two left out: three granted by name + BOTH left-out rows said (each standing bounded on its own), the rest of the granted counted', K);
  const sec = fs.readFileSync(path.join(REPO, 'src/lib/may-use-section.js'), 'utf8');
  ok(/granted\(br\.profiles\) \+ br\.profilesMore/.test(sec) && /granted\(va\.use\) \+ va\.useMore/.test(sec) && /n: granted\(k\.rows\) \+ \(k\.more \|\| 0\)/.test(sec) && /k\.uncut \? '' : moreOf\(k, door\)/.test(sec),
    '⑪ the sums count the GRANTED rows only (the browser, the vault, the keys — never a left-out or unknown one); an uncut kind draws no count');
  // a deleted account's rows (its grains left): five left out ⇒ three named + «2 more left out or unknown» — the same three-way count
  const orph = M.viewOf({ answers: Array.from({ length: 5 }, (_, i) => A('channel-reach', `conversation:gone/c${i}`, { ok: false, code: 'excepted', parent: 'account:gone' })), accounts: [] }).kinds.find((k) => k.kind === 'channels').orphans;
  ok(orph.rows.length === 3 && orph.moreOut === 2 && orph.more === 0 && /ch\.orphans\.rows\.map\(\(r\) => line\(r\)\)\.join\(''\) \+ moreOf\(ch\.orphans, /.test(sec),
    '⑪ (cure r1 follow-up) an account removed with five left-out rows: three named and the other two COUNTED — the orphans use the same three-way count (moreOf), never the granted-only one', orph);
  ok(!/if \(!g\) return;|if \(!access\) return;/.test(sec) && /its access list could not be read/.test(sec) && /has no tick of this conversation’s own to take back/.test(sec), '⑬ SHOULD b: an untick that does nothing SAYS why (the access list unreadable; no tick of its own there) — no silent return');
}

console.log('— ⑫ CURE r1 SHOULD a — a STOPPED conversation: the rows the sessions route kept, inside the budget; a sweep only when none; paused said');
{
  const kept = Array.from({ length: 20000 }, (_, i) => ({ sessionKey: `claude:k${i}`, backend: 'claude', backendSessionId: `k${i}`, cwd: `/w/${i % 40}`, status: 'stopped' }));
  let sweeps = 0;
  const mk = (mode) => MU.create({ activeSessions: new Map(), sessionKeyOf: () => '', addressableId: () => null,
    storedRow: (key) => (mode === 'kept' ? kept.find((r) => r.sessionKey === key) || null : mode === 'paused' ? { paused: true } : (sweeps++, Promise.resolve(kept.find((r) => r.sessionKey === key) || null))),
    groupsOf: () => [], noAgentOf: () => false, doors: {}, log: () => { } });
  const times = [];
  for (let i = 0; i < 7; i++) { const r = await mk('kept').viewFor('claude:k19999'); times.push(r.ms.total); if (i === 0) ok(r.ok && !r.view.facts.live && r.ms.facts !== null && r.ms.swept === false, '⑫ a stopped conversation found in the KEPT rows (no sweep): its facts\' own lookup is timed into the answer', r.ms); }
  times.sort((a, b) => a - b);
  console.log(`    a stopped conversation, the last of 20 000 kept rows: median ${times[3].toFixed(2)} ms of the loop (the facts' lookup included)`);
  ok(times[3] < MU.BUDGET_MS, `⑫ inside the budget (median ${times[3].toFixed(2)} ms < ${MU.BUDGET_MS})`, times);
  const sw = await mk('none').viewFor('claude:k5');
  ok(sw.ok && sweeps === 1 && sw.ms.swept === true, '⑫ a sweep runs ONLY when the route kept no rows (once, its wait not counted as the loop\'s)', { sweeps, ms: sw.ms });
  const pa = await mk('paused').viewFor('claude:k5');
  ok(!pa.ok && pa.code === 'list_paused' && /paused/.test(pa.error), '⑫ discovery paused and nothing kept ⇒ said by name (list_paused), never a sweep', pa);
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/const k = S\.keptSessions\(\);/.test(wiring) && /if \(k\.rows\) return find\(k\.rows\); if \(k\.paused\) return \{ paused: true \};/.test(wiring), '⑫ the wiring reads the sessions route\'s keptSessions() first (routes/sessions)');
}

// ── ⑭ THE RESTACK ONTO 2.369.410 (主开发 20:03Z): the release's B-3190 follow-up made the key door judge its LIVE grants
// (pickKey, useVerdict and keysFor read liveGrants(): a once-grant from before a vault lock or a restart is spent). The
// unit's key lister follows the door's own reading — a once-grant from before a restart is not listed as granted.
console.log('— ⑭ THE KEY DOOR, LIVE (restack onto 2.369.410): a once-grant from before a restart is not listed, as the door reads it');
{
  const AENG = require(path.join(REPO, 'src/server/automation-engine.js'));
  const dir14 = scratch('may-use-keys'); fs.mkdirSync(dir14, { recursive: true });
  const secrets = new Map();
  const vault14 = { state: () => 'unlocked', onLock() {}, secretPut: (n, v) => { secrets.set(n, String(v)); return { ok: true }; }, secretGet: (n) => (secrets.has(n) ? { ok: true, value: Buffer.from(secrets.get(n)) } : { ok: false, code: 'not_found' }), secretDrop: (n) => { secrets.delete(n); return { ok: true }; } };
  const LIM = { cwdRoots: ['/tmp'], accounts: 'any', permissionModes: ['default'], models: 'any', modes: ['chat'] };
  const boot = (Mod) => Mod.create({ dataDir: dir14, vault: vault14, now: () => 1795000000000, verbs: {} });
  const F14 = { conversationKeys: ['c14'], groupIds: [], groupsUnreadable: false };
  const listed = (eng) => eng.mayUseFor(F14).filter((r) => r.ok).map((r) => r.name).sort();
  const e1 = boot(AENG);
  const kA = e1.mint({ name: 'always14', scopes: ['conversations.status'], limits: LIM, by: 'user' }), kO = e1.mint({ name: 'once14', scopes: ['conversations.status'], limits: LIM, by: 'user' });
  const gA = kA.ok ? e1.grant(kA.key.id, ['session:c14'], { by: 'user' }) : null, gO = kO.ok ? e1.grant(kO.key.id, ['session:c14'], { by: 'user', mode: 'once' }) : null;
  const before = listed(e1);   // this run's once-grant is live: listed
  const e2 = boot(AENG);   // a restart — boot is a lock: the door counts the unspent once-grant as spent
  const after = listed(e2), door = e2.keysFor({ conversationId: 'c14', groups: [] }).map((k) => k.name).sort();
  ok(!!(gA && gA.ok && gO && gO.ok) && JSON.stringify(before) === '["always14","once14"]' && JSON.stringify(after) === '["always14"]' && JSON.stringify(door) === JSON.stringify(after),
    '⑭ the key lister reads the door\'s LIVE grants: a once-grant from before a restart is not listed as granted — the same keys the door\'s own keysFor lists', { before, after, door });
  // RED CONTROL — it proves its plant first: the walk over liveGrants() is in the lister once, and the copy walks the raw store
  const ENGS = fs.readFileSync(path.join(REPO, 'src/server/automation-engine.js'), 'utf8');
  const LIVE = "      for (const g of liveGrants()) {\n        if (g.keyId !== k.id || g.subject === 'external' || (g.mode === 'once' && g.spentAt)) continue;";
  const STORE = LIVE.replace('for (const g of liveGrants()) {', 'for (const g of db.grants) {');   // stale-pins: kept — the RED control plants the walk the release's key door left
  const planted = ENGS.split(LIVE).length === 2 ? editAnchor(ENGS, LIVE, STORE, "src/server/automation-engine.js") : null;
  ok(!!planted && planted.split(STORE).length === 2 && planted.split(LIVE).length === 1, '⑭ CONTROL plant: the lister\'s walk over liveGrants() stands once in automation-engine.js, and the copy walks the raw store there instead');
  const MC14 = mutantCopies('may-use-keys', REPO);
  const red = planted ? listed(boot(MC14.load('src/server/automation-engine.js', planted, 'keys-store'))) : null;
  ok(!!red && red.includes('once14'), '⑭ RED CONTROL: a lister over the raw store lists the dead once-grant as granted (the door refuses it)', red);
  for (const r of copiesCensus(MC14.files, MC14.dir, REPO, { minCopies: 1, label: '⑭ ' })) ok(r.pass, r.name, r.detail);
}

// ── ⑮–⑰ THE MOVE ONTO THE int411 CHECKPOINT 8cef0006a (主开发 20:45Z): the meetings of logic, each with its leg ──
console.log('— ⑮ B-df5f: the Task Groups are asked with the conversation\'s machine (hostId), as every door asks them');
{
  const S15 = [{ id: 'sess-r', backend: 'codex', backendSessionId: 'cr', cwd: '/w/lane', host: 'm-2' }, { id: 'sess-l', backend: 'codex', backendSessionId: 'cl', cwd: '/w/lane' }];
  const asked = async (mod) => { const qs = []; const R15 = rig({ sessions: S15, onGroups: (q) => qs.push(q), mod }); await R15.mu.factsOf('codex:cr'); const r = qs.length; await R15.mu.factsOf('codex:cl'); return { remote: qs.slice(0, r), local: qs.slice(r) }; };
  const a = await asked(MU);
  ok(a.remote.length > 0 && a.remote.every((q) => q.hostId === 'm-2') && a.local.length > 0 && a.local.every((q) => q.hostId === null),
    '⑮ a conversation of another machine is judged with ITS machine (hostId m-2, its folder resolved there, never by the hub\'s realpath); a local one with none', { remote: a.remote.map((q) => q.hostId), local: a.local.map((q) => q.hostId) });
  const SRC15 = fs.readFileSync(path.join(REPO, 'src/server/may-use.js'), 'utf8');
  const PLANT15 = "hostId: str(s.host || s.hostId) || null, ";
  const planted15 = SRC15.split(PLANT15).length === 2 ? editAnchor(SRC15, PLANT15, '', "src/server/may-use.js") : null;
  ok(!!planted15 && !planted15.includes('hostId: str(s.host'), '⑮ CONTROL plant: the machine fact stands once in may-use.js, and the copy asks without it');
  const MC15 = mutantCopies('may-use-host', REPO);
  const red15 = planted15 ? await asked(MC15.load('src/server/may-use.js', planted15, 'no-host')) : null;
  ok(!!red15 && red15.remote.length > 0 && red15.remote.every((q) => q.hostId === undefined), '⑮ RED CONTROL: the copy asks the remote conversation\'s groups with no machine — the hub would read its folder', red15 && red15.remote.map((q) => q.hostId));
  for (const r of copiesCensus(MC15.files, MC15.dir, REPO, { minCopies: 1, label: '⑮ ' })) ok(r.pass, r.name, r.detail);
}
console.log('— ⑯ B-48a4: the exit lister answers as the door does — the same verdict over the same context, the membership asked when a list names a group');
{
  const { ExitProxyManager: XPM } = require(path.join(REPO, 'src/exit-proxy.js'));
  const ER = require(path.join(REPO, 'src/exit-reach.js'));
  const access16 = { use: { mode: 'only', who: [{ kind: 'group', id: 'g8' }], except: [] }, run: { mode: 'only', who: [{ kind: 'group', id: 'g7' }], except: [] } };
  const host16 = { id: 'm16', name: 'Build box' };
  const self16 = { _hosts: () => [host16], _raw: () => host16, accessOf: () => access16, groupsOf: () => ['g7'], log: () => { } };
  self16.ctxFor = (...a) => XPM.prototype.ctxFor.apply(self16, a);   // _ctxAgain asks the door's own ctxFor
  const sess16 = { cwd: '/w' };
  const ctx = XPM.prototype.ctxFor.call(self16, sess16, 'sess-16');
  const again = XPM.prototype._ctxAgain.call(self16, sess16, 'sess-16', { groupIds: [] }, access16.run);   // the run list names a group ⇒ asked again
  const door = { use: ER.exitVerdict(access16, 'use', ctx), run: ER.exitVerdict(access16, 'run', again) };
  const lister = (mod) => Object.fromEntries(mod.prototype.mayUseFor.call(self16, { sessionKeys: ctx.sessionKeys, conversationKeys: ctx.conversationKeys, groupIds: ['g7'], groupsUnreadable: false }).map((r) => [r.detail.grant, r]));
  const L = lister(XPM);
  ok(door.run.ok === true && door.run.via === 'group' && door.use.ok === false && !!L.run && L.run.ok === true && L.run.via === 'group' && L.run.groupId === 'g7' && !(L.use && L.use.ok),
    '⑯ the machine whose run list names Task Group g7: the door (its context asked again, B-48a4) and the unit\'s lister both admit run through g7, and neither admits use (g8)', { door: { use: door.use.ok, run: [door.run.ok, door.run.via] }, lister: Object.keys(L) });
  const SRC16 = fs.readFileSync(path.join(REPO, 'src/exit-proxy.js'), 'utf8');
  const PLANT16 = 'groupIds: (facts.groupIds || []).map(String),';   // stale-pins: kept — ⑯'s plant, proven to stand once in exit-proxy.js before the copy drops it
  const planted16 = SRC16.split(PLANT16).length === 2 ? editAnchor(SRC16, PLANT16, 'groupIds: [],', "src/exit-proxy.js") : null;
  ok(!!planted16 && planted16.split(PLANT16).length === 1, '⑯ CONTROL plant: the lister\'s groups stand once in exit-proxy.js, and the copy drops them');
  const MC16 = mutantCopies('may-use-exit', REPO);
  const red16 = planted16 ? lister(MC16.load('src/exit-proxy.js', planted16, 'drop-groups').ExitProxyManager) : null;
  ok(!!red16 && !(red16.run && red16.run.ok), '⑯ RED CONTROL: a lister that drops the groups does not list the run grant the door admits', red16 && Object.keys(red16));
  for (const r of copiesCensus(MC16.files, MC16.dir, REPO, { minCopies: 1, label: '⑯ ' })) ok(r.pass, r.name, r.detail);
}
console.log('— ⑰ B-460d + B-70f9: Session Properties holds the CPU priority row AND the «What it may use» section, each once');
{
  const SP = fs.readFileSync(path.join(REPO, 'src/lib/session-props.js'), 'utf8');
  const CPU_ROW = "if (cpuWords) row(idSec, t('CPU priority'), escHtml(cpuWords));", MOUNT = 'if (!winInfo._mayUse) winInfo._mayUse = mountMayUse(';
  const both = (sp) => { const once = (x) => sp.split(x).length === 2;
    return once("import { cpuPriorityWords } from './cpu-priority-words.js';") && once("import { mountMayUse } from './may-use-section.js';") && once(CPU_ROW)
      && once(MOUNT) && once("muSec.classList.add('session-props-may-use');") && sp.indexOf("row(idSec, t('CPU priority')") < sp.indexOf("muSec.classList.add('session-props-may-use')"); };
  ok(both(SP), '⑰ both units stand in Session Properties: the CPU priority row in the identity section (B-460d), the may-use section of its own after it, mounted once per window');
  // RED CONTROLS (主开发 21:35Z: the presence pin had none) — each proves its plant first: the line stands once, the copy lacks it
  const drop = (x) => (SP.split(x).length === 2 ? SP.replace(x, '') : null);
  const noMount = drop(MOUNT), noCpu = drop(CPU_ROW);
  ok(!!noMount && !noMount.includes(MOUNT) && !!noCpu && !noCpu.includes(CPU_ROW), '⑰ CONTROL plants: the section\'s once-per-window mount and B-460d\'s CPU row each stand once in session-props.js, and each copy lacks its line');
  ok(!!noMount && both(noMount) === false, '⑰ RED CONTROL: a Properties without the «What it may use» mount is caught');
  ok(!!noCpu && both(noCpu) === false, '⑰ RED CONTROL: a Properties that lost B-460d\'s CPU priority row is caught');
}

// B-e630 (主开发's ruling 2026-11-18): ONE HOME + THE CONNECT FORM'S FOLD, from the GRANT facts only. A profile whose grant row does
// not open it to this conversation is LISTED (state closed, its «Who can use it» door on the row); the Connect form of a type whose
// capability row says a browser sign-in can stand for it draws its line + door when this conversation cannot use at least one
// profile — never by a profile's name or label
{
  const row = (name, ok, code) => ({ door: 'browser-profile', resource: 'bp-' + name.toLowerCase().replace(/\W+/g, ''), name, ...(ok ? { ok: true, via: 'self' } : { ok: false, code }) });
  const view = (answers, facts = {}) => M.viewOf({ facts: { live: true, ...facts }, answers, accounts: [] });
  const closed = M.rowOf(row('Work', false, 'not_open'));
  ok(closed && closed.state === 'closed' && M.LISTED_REFUSALS.includes('not_open'), 'B-e630 ONE HOME: a profile not open to this conversation (not_open) is a LISTED row, state closed', closed);
  const bOf = (v) => v.kinds.find((k) => k.kind === 'browser');
  const both = bOf(view([row('Mine', true), row('Lark (company login)', false, 'not_open')]));
  ok(both.profiles.map((r) => r.state).join() === 'ok,closed', 'B-e630: the usable profile first, the closed one after it — each by its own name', both.profiles);
  const F = M.browserSignInFold;
  const cases = {
    none: F(true, view([])),
    allUsable: F(true, view([row('Mine', true), row('Lark (company login)', true)])),
    oneClosed: F(true, view([row('Mine', true), row('Work', false, 'not_open')])),
    labelSaysLarkButUsable: F(true, view([row('Lark (company login)', true)])),
    noSuchCaps: F(false, view([row('Work', false, 'not_open')])),
    remote: F(true, view([row('Work', false, 'not_open')], { remote: true })),
    unknownOnly: F(true, view([row('Groups', false, 'groups_unreadable'), row('Odd', false, 'unknown_shape')])),
    leftOut: F(true, view([row('Kept', false, 'excepted')])),
  };
  ok(cases.none === null && cases.allUsable === null && cases.oneClosed && cases.oneClosed.n === 1 && cases.labelSaysLarkButUsable === null && cases.noSuchCaps === null && cases.remote === null && cases.unknownOnly === null && cases.leftOut && cases.leftOut.n === 1,
    'B-e630 THE FOLD: no profile — no line; every profile usable — no line; one it may not use — the line (n 1) whatever its name; a type without browserSignIn, a conversation on another machine, rows only UNKNOWN (a part that failed, groups unreadable) — no line; one left out by an Except — the line', cases);
  // RED: a fold drawn from a profile's LABEL (the ruling's named wrong road) answers the label, not the grant
  const src = fs.readFileSync(path.join(REPO, 'src/may-use-model.js'), 'utf8');
  const cut = '  const n = Number.isFinite(br.profilesNotUsable) ? br.profilesNotUsable : br.profiles.filter(notUsable).length;';
  ok(src.includes(cut), 'control setup (B-e630): the grant count is where the control cuts');
  const MCe = mutantCopies('may-use-e630', REPO);
  const Ml = require(MCe.write('src/may-use-model.js', editAnchor(src, cut, "  const n = br.profiles.filter((r) => /lark|飞书/i.test(String(r.name || ''))).length;", "src/may-use-model.js"), 'by-label'));
  const lab = { closedNoLabel: Ml.browserSignInFold(true, Ml.viewOf({ facts: { live: true }, answers: [row('Work', false, 'not_open')], accounts: [] })), usableWithLabel: Ml.browserSignInFold(true, Ml.viewOf({ facts: { live: true }, answers: [row('Lark (company login)', true)], accounts: [] })) };
  ok(lab.closedNoLabel === null && lab.usableWithLabel && lab.usableWithLabel.n === 1, 'CONTROL (B-e630): a fold drawn from a profile\'s label misses the closed profile named «Work» and offers a door for a usable one named Lark (RED for the leg above)', lab);
  // the wiring: the keeper lists not_open, the contract validates the entry, the three web adapters declare it, the dialog draws the fold
  const keeper = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8'), contract = fs.readFileSync(path.join(REPO, 'src/channels/index.js'), 'utf8');
  const dlg = fs.readFileSync(path.join(REPO, 'src/lib/channel-account-dialogs.js'), 'utf8'), eng = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const declared = ['lark', 'slack', 'gmail'].filter((a) => /\n  browserSignIn: true,/.test(fs.readFileSync(path.join(REPO, `src/channels/${a}.js`), 'utf8')));
  const notLark = ['src/lib/channel-account-dialogs.js', 'src/may-use-model.js'].filter((f) => /['"]lark['"]/.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
  ok(/else if \(v\.code === 'not_owner'\) out\.push\(\{ \.\.\.base, ok: false, code: 'not_open' \}\);/.test(keeper) && /c\.browserSignIn !== undefined && typeof c\.browserSignIn !== 'boolean'/.test(contract)
    && declared.join() === 'lark,slack,gmail' && /browserSignIn: !!m\.caps\.browserSignIn/.test(eng) && /if \(k\.browserSignIn && conversation && conversation\.sessionKey\) fields\.push\(\{ key: `bsi\$\{sfx\}`, type: 'node', node: browserSignInNode\(app, k, conversation, mayUseFacts\), when: is\(k\.kind\) \}\);/.test(dlg) && (dlg.match(/fetchJson\(`\/api\/may-use/g) || []).length === 1
    && /const fold = r && r\.ok \? browserSignInFold\(true, r\.view\) : null;/.test(dlg) && /app\.openSessionProps\(s, \{ section: 'may-use' \}\)/.test(dlg) && !/browser-trace-view/.test(dlg) && /else if \(v\.code === 'not_owner' && \(v\.unknown \|\| !B\.grantRowOf\(p\)\)\) out\.push\(\{ \.\.\.base, ok: false, code: 'unknown_shape' \}\);/.test(keeper) && !notLark.length,
    'B-e630 wiring: the keeper lists a not-open profile (an unreadable row stays unknown); the adapter contract validates browserSignIn and lark / slack / gmail declare it; the kinds carry it; the Connect dialog reads the facts ONCE, draws the fold from them, its door the conversation\'s own What it may use; no generic file names an adapter', { declared, notLark });
  const BP = require(path.join(REPO, 'src/browser-profiles.js'));
  const unread = BP.mayAttach({ id: 'bp-0000e630', label: 'Lark (company login)', grantUse: { unknown: true } }, { browserKey: 'bk-0000e630', conversationKeys: ['claude:e630'] });
  const others = BP.mayAttach({ id: 'bp-0000e631', label: 'Lark (company login)', grantUse: { to: ['claude:someone-else'], except: [] } }, { browserKey: 'bk-0000e630', conversationKeys: ['claude:e630'] });
  ok(unread && unread.code === 'not_owner' && unread.unknown === true && others && others.ok === false && others.code === 'not_owner' && !others.unknown,
    'B-e630: an unreadable «Who can use it» answers not_owner WITH unknown (the keeper says it unknown); a readable row naming others answers not_owner without it (the keeper lists it «not open»)', { unread, others });
  // the cure (主开发 07:51Z): the fold counts PAST the cut, and a closed profile has its own count — never «left out or unknown»
  const unk = ['A', 'B', 'C'].map((n) => row('Unread ' + n, false, 'unknown_shape'));
  const fiveClosed = ['P', 'Q', 'R', 'S', 'T'].map((n) => row('Shut ' + n, false, 'not_open'));
  const fourOut = ['K', 'L', 'M', 'N'].map((n) => row('Kept ' + n, false, 'excepted'));
  const past = {
    unk1: bOf(view([...unk, row('Work', false, 'not_open')])),
    shut5: bOf(view([...unk, ...fiveClosed])),
    out4: bOf(view(fourOut)),
  };
  const fold = { unk1: F(true, view([...unk, row('Work', false, 'not_open')])), shut5: F(true, view([...unk, ...fiveClosed])), out4: F(true, view(fourOut)) };
  const pv = (b) => ({ rows: b.profiles.map((r) => r.state).join(), more: b.profilesMore, moreOut: b.profilesMoreOut, moreClosed: b.profilesMoreClosed, notUsable: b.profilesNotUsable });
  ok(fold.unk1 && fold.unk1.n === 1 && fold.shut5 && fold.shut5.n === 5 && fold.out4 && fold.out4.n === 4,
    'B-e630 cure: the fold counts every profile it may not use, before the cut — three unreadable rows and one closed: n 1; five closed (three drawn): n 5; four taken out (three drawn): n 4', fold);
  ok(pv(past.unk1).rows === 'unknown,unknown,unknown,closed' && past.unk1.profilesMoreOut === 0 && past.unk1.profilesMoreClosed === 0
    && pv(past.shut5).rows === 'unknown,unknown,unknown,closed,closed,closed' && past.shut5.profilesMoreOut === 0 && past.shut5.profilesMoreClosed === 2
    && past.out4.profilesMoreOut === 1 && past.out4.profilesMoreClosed === 0,
    'B-e630 cure: a closed profile stands in its OWN bucket — three unreadable rows never hide it, and the ones past the cut are counted «not open to it», never «left out or unknown»', { unk1: pv(past.unk1), shut5: pv(past.shut5), out4: pv(past.out4) });
  const sec = fs.readFileSync(path.join(REPO, 'src/lib/may-use-section.js'), 'utf8');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(/\(x\.moreClosed \|\| 0\) > 0 \? `<div class="ns-pv-via dim mu-more">\$\{escHtml\(t\('\{n\} more not open to it', \{ n: x\.moreClosed \}\)\)\} \$\{door\}<\/div>`/.test(sec)
    && sec.includes('moreOf({ more: br.profilesMore, moreOut: br.profilesMoreOut, moreClosed: br.profilesMoreClosed }, ') && zh.includes('"{n} more not open to it": "') && ja.includes('"{n} more not open to it": "'),
    'B-e630 cure: the section says the closed ones past the cut by their own words (zh / ja entries), with the browser list\'s own door');
  // RED ×2: a fold that counts only the drawn rows misses the closed past the cut; a bounded() with closed back in the «left out» bucket counts it unknown
  const MCc = mutantCopies('may-use-e630-cure', REPO);
  const Md = require(MCc.write('src/may-use-model.js', editAnchor(src, cut, '  const n = br.profiles.filter(notUsable).length;', "src/may-use-model.js"), 'drawn-only'));
  const drawn = Md.browserSignInFold(true, Md.viewOf({ facts: { live: true }, answers: [...unk, ...fiveClosed], accounts: [] }));
  const oldB = "const ok = s.filter((r) => r.state === 'ok'), ask = s.filter((r) => r.state === 'request'), closed = s.filter((r) => r.state === 'closed');\n  const out = s.filter((r) => r.state !== 'ok' && r.state !== 'request' && r.state !== 'closed');";
  ok(src.includes(oldB), 'control setup (B-e630 cure): the bucket split is where the control cuts');
  const Mo = require(MCc.write('src/may-use-model.js', editAnchor(src, oldB, "const ok = s.filter((r) => r.state === 'ok'), ask = s.filter((r) => r.state === 'request'), closed = [];\n  const out = s.filter((r) => r.state !== 'ok' && r.state !== 'request');", "src/may-use-model.js"), 'one-out-bucket'));
  const oneB = Mo.viewOf({ facts: { live: true }, answers: [...unk, row('Work', false, 'not_open')], accounts: [] }).kinds.find((k) => k.kind === 'browser');
  ok(drawn && drawn.n === 3 && oneB.profilesMoreOut === 1 && !oneB.profiles.some((r) => r.state === 'closed'),
    'CONTROL (B-e630 cure): the drawn-rows fold says 3 of 5; one «left out» bucket hides the closed profile behind three unreadable rows and counts it «left out or unknown» (RED for the two legs above)', { drawn, moreOut: oneB.profilesMoreOut });
  // cure 2 (主开发's read, 08:56Z): EVERY bounded list forwards its closed count, so a door that answers not_open past the cut is
  // counted on its own list (today only the browser keeper answers it)
  const shut5 = (door, res, extra = () => ({})) => Array.from({ length: 5 }, (_, i) => A(door, res(i), { ok: false, code: 'not_open', ...extra(i) }));
  const allShut = (Mx) => {
    const v = Mx.viewOf({ facts: { live: true }, accounts: [{ id: 'a1', label: 'Inbox', state: 'none' }], answers: [
      ...shut5('channel-reach', (i) => `rule:a1/r${i}`, () => ({ parent: 'account:a1' })), ...shut5('channel-reach', (i) => `conversation:a1/c${i}`, () => ({ parent: 'account:a1' })),
      ...shut5('channel-reach', (i) => `conversation:gone/c${i}`, () => ({ parent: 'account:gone' })), ...shut5('browser-login', (i) => `login:l${i}`),
      ...shut5('vault-use', (i) => `entry:e${i}`), ...shut5('vault-job', (i) => `entry:e${i}|job${i}`, (i) => ({ detail: { job: 'j' + i } }))] });
    const kOf = (k) => v.kinds.find((x) => x.kind === k), ch = kOf('channels'), acc = ch.accounts[0], brK = kOf('browser'), vaK = kOf('vault');
    return { rules: acc && acc.rulesMoreClosed, chats: acc && acc.chatsMoreClosed, orphans: ch.orphans.moreClosed, logins: brK.loginsMoreClosed, use: vaK.useMoreClosed, jobs: vaK.jobsMoreClosed };
  };
  const counts = allShut(M);
  ok(Object.values(counts).length === 6 && Object.values(counts).every((n) => n === 2),
    'B-e630 cure 2: five closed rows on EVERY bounded list (channel rules, single chats, a removed account\'s rows, logins, vault use, vault jobs): three named, the other two counted «not open to it» on that list', counts);
  const unforwarded = (secSrc) => (secSrc.match(/moreOf\(\{[^}]*\}/g) || []).filter((c) => /moreOut:/.test(c) && !/moreClosed:/.test(c));
  const calls = (sec.match(/moreOf\(\{[^}]*\}/g) || []).length;
  ok(calls === 6 && unforwarded(sec).length === 0, 'B-e630 cure 2: every list the section counts by hand (rules, chats, profiles, logins, vault use, vault jobs) hands its closed count to moreOf — a census over the section\'s calls', { calls, unforwarded: unforwarded(sec) });
  // RED ×2: a model that forwards no closed count for logins; a section call that drops it
  const fwd = 'loginsMoreOut: logins.moreOut, loginsMoreClosed: logins.moreClosed });';
  ok(src.includes(fwd), 'control setup (B-e630 cure 2): the logins\' forward is where the control cuts');
  const Mf = require(MCc.write('src/may-use-model.js', editAnchor(src, fwd, 'loginsMoreOut: logins.moreOut });', "src/may-use-model.js"), 'logins-unforwarded'));   // stale-pins: kept — the base's line, written back by this RED control
  const secCut = 'moreOf({ more: br.loginsMore, moreOut: br.loginsMoreOut, moreClosed: br.loginsMoreClosed }, ';
  ok(sec.includes(secCut) && allShut(Mf).logins === undefined && unforwarded(sec.replace(secCut, 'moreOf({ more: br.loginsMore, moreOut: br.loginsMoreOut }, ')).length === 1,   // stale-pins: kept — the base's line, written back by this RED control
    'CONTROL (B-e630 cure 2): a model without the logins\' forward counts their closed rows nowhere, and a section call without it is named by the census (RED for the two legs above)');
}

// ── ⑱–⑲ THE HOSTED CURE (主开发 00:53Z): the leak and the scroll in session-props.js; the heavy suites are the proof ──
console.log('— ⑱ the section\'s ref is made once at the WINDOW\'s scope, never inside render (it lives as long as the window)');
{
  const SP = fs.readFileSync(path.join(REPO, 'src/lib/session-props.js'), 'utf8');
  const REF = 'const mayUseRef = () => { const x = findSession(); return x ? { sessionKey: refKey, webuiId: x.webuiId || null } : null; };';
  const MOUNT = 'winInfo._mayUse = mountMayUse(app, mayUseRef, { onPainted: onMayUsePainted });';
  const atWindow = (sp) => { const r = sp.indexOf('  const render = () => {'); return r > 0 && sp.split(REF).length === 2 && sp.indexOf(REF) < r && sp.split(MOUNT).length === 2 && sp.indexOf(MOUNT) > r && !/mountMayUse\(app, \(\) =>/.test(sp); };   // stale-pins: kept — the release's form, named on purpose (an absence check / the RED control's plant)
  ok(atWindow(SP), '⑱ mountMayUse is handed mayUseRef, made once beside findSession / refKey before render() — no arrow made inside a render is kept for the window\'s life');
  const OLD = 'winInfo._mayUse = mountMayUse(app, () => { const x = findSession(); return x ? { sessionKey: refKey, webuiId: x.webuiId || null } : null; });';   // stale-pins: kept — the release's form, named on purpose (an absence check / the RED control's plant)
  const planted = anchored(SP, MOUNT, OLD, 'ref-in-render');
  ok(!!planted && planted.includes(OLD) && !planted.includes(MOUNT), '⑱ CONTROL plant: the mount stands once, and the copy makes its ref inside render as the release did');
  ok(!!planted && atWindow(planted) === false, '⑱ RED CONTROL: a ref made inside render (the leak) is caught');
}
console.log('— ⑲ the asked scroll lands on the section ON the page at the frame; the flag is cleared only after it');
{
  const SP = fs.readFileSync(path.join(REPO, 'src/lib/session-props.js'), 'utf8');
  const lands = (sp) => { const i = sp.indexOf('const scrollToMayUse = () => requestAnimationFrame(() => {'); if (i < 0) return false; const b = sp.slice(i, sp.indexOf('\n  });', i));
    const q = b.indexOf("body.querySelector('.session-props-may-use')"), c = b.indexOf('sec.isConnected'), sc = b.indexOf('sec.scrollIntoView('), cl = b.indexOf('winInfo._mayUseFocus = false;');
    return q > 0 && c > q && sc > c && cl > sc && sp.split('      if (winInfo._mayUseFocus) scrollToMayUse();\n').length === 2 && !sp.includes('muSec.scrollIntoView('); };   // stale-pins: kept — the release's form, named on purpose (an absence check / the RED control's plant)
  ok(lands(SP), '⑲ the frame callback looks the section up in the body, scrolls it only when connected, and clears the focus flag only after the scroll');
  const NOW = '      if (winInfo._mayUseFocus) scrollToMayUse();\n';   // render's own line (onMayUsePainted holds the same words)
  const OLD = "      if (winInfo._mayUseFocus) { winInfo._mayUseFocus = false; requestAnimationFrame(() => { try { muSec.scrollIntoView({ block: 'start' }); } catch { } }); }\n";   // stale-pins: kept — the release's form, named on purpose (an absence check / the RED control's plant)
  const planted = anchored(SP, NOW, OLD, 'flag-first');
  ok(!!planted && planted.includes(OLD) && !planted.includes(NOW), '⑲ CONTROL plant: the render\'s call stands once, and the copy clears the flag first and scrolls the captured section');
  ok(!!planted && lands(planted) === false, '⑲ RED CONTROL: the release\'s order (the flag cleared before the frame, the captured section scrolled) is caught');
}

// ── ⑳–㉑ THE BOX PROOF'S CURE (主开发 04:23Z, the integrator's runs alone on the box): both moving reds were the product drawing early ──
console.log('— ⑳ a Task Group is named from the HUB\'s answer first (facts.groups), the sidebar\'s list only for a group the answer does not hold');
{
  const SEC = fs.readFileSync(path.join(REPO, 'src/lib/may-use-section.js'), 'utf8');
  const NAME = "const own = view && view.facts && Array.isArray(view.facts.groups) ? view.facts.groups.find((g) => g && String(g.id) === String(id)) : null; if (own && own.name) return String(own.name);";
  const fromAnswer = (s) => s.split(NAME).length === 2 && s.split('groupNameOf(app, r.groupId, st.data)').length === 2 && s.split('groupNameOf(app, p.id, st.data)').length === 2 && s.split('groupNameOf: (id) => groupNameOf(app, id, st.data)').length === 2;
  ok(fromAnswer(SEC), '⑳ groupNameOf reads the answer\'s own groups before the sidebar, and every row\'s call hands it the answer (how a row admits, an exception\'s name, a granted account)');
  const planted = anchored(SEC, NAME, '', 'sidebar-alone');
  ok(!!planted && !planted.includes(NAME), '⑳ CONTROL plant: the answer-first lookup stands once, and the copy asks the sidebar alone');
  ok(!!planted && fromAnswer(planted) === false, '⑳ RED CONTROL: a section that names a group from the sidebar alone (the box run: a just-made group drawn by its id) is caught');
}
console.log('— ㉑ the asked scroll lands AFTER the answer is drawn: the flag holds until then, and the section\'s paint asks again');
{
  const SP = fs.readFileSync(path.join(REPO, 'src/lib/session-props.js'), 'utf8'), SEC = fs.readFileSync(path.join(REPO, 'src/lib/may-use-section.js'), 'utf8');
  const HOLD = 'if (winInfo._mayUse && winInfo._mayUse.painted()) winInfo._mayUseFocus = false;';
  const ASK = 'const onMayUsePainted = () => { if (winInfo._mayUseFocus) scrollToMayUse(); };';
  const after = (sp, sec) => { const r = sp.indexOf('  const render = () => {'); return r > 0 && sp.split(HOLD).length === 2 && sp.split(ASK).length === 2 && sp.indexOf(ASK) < r
    && sp.split('mountMayUse(app, mayUseRef, { onPainted: onMayUsePainted })').length === 2 && sec.split("    paint();\n    try { if (typeof onPainted === 'function') onPainted(); } catch { }").length === 2 && sec.includes('painted: () => !!(st.data || st.error),'); };
  ok(after(SP, SEC), '㉑ the flag is cleared only once the answer is drawn; the section calls its onPainted after each paint; Properties hands it a window-scope onMayUsePainted that lands the asked scroll');
  const planted = anchored(SP, HOLD, 'winInfo._mayUseFocus = false;', 'clear-at-scroll');
  ok(!!planted && !planted.includes(HOLD), '㉑ CONTROL plant: the held clear stands once, and the copy clears the flag at the first scroll');
  ok(!!planted && after(planted, SEC) === false, '㉑ RED CONTROL: a flag cleared at the first scroll (before the answer is drawn: the box run, the section 63 px down) is caught');
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
