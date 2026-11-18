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
//   ⑭ THE RESTACK ONTO 2.369.410: the key lister reads the door's LIVE grants (a once-grant from before a restart is not
//      listed; RED: a lister over the raw store) — the release's B-3190 follow-up made the key door read them
//   ⑧ THE FORM'S ROWS BYTE FOR BYTE: src/lib/may-use-rows.js renders what the released form's closures rendered (a frozen copy of
//      2.369.407's, scripts/fixtures/may-use/) over the same rows — the lift changed no byte
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 1500) : '')); } return !!c; };
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
  const patched = src.replace("if (!a || typeof a !== 'object' || !DOOR_KIND[a.door]) return null;", "if (!a || typeof a !== 'object' || !DOOR_KIND[a.door] || a.door === 'exit') return null;");
  ok(patched !== src, '② (the drop patch applied)');
  const copy = require(MC.write('src/may-use-model.js', patched, 'drop-exit'));
  const red = omitted(copy);
  ok(red.length === 2 && red.every((k) => k.startsWith('exit|')), '② RED CONTROL: the patched model that drops the exit door\'s rows is CAUGHT (both exit rows named as omitted)', red);
  for (const r of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 1, label: '② ' })) ok(r.pass, r.name, r.detail);
}

function rig({ sessions = [], stored = [], groupsThrow = false, doors = {}, noAgent = () => false } = {}) {
  const activeSessions = new Map(sessions.map((s) => [s.id, s]));
  const seen = [];
  const mk = (name) => ({ [name === 'browser' ? 'admitsFor' : 'mayUseFor']: (f) => { seen.push({ name, f }); return []; } });
  const D = { channels: { mayUseFor: (f) => { seen.push({ name: 'channels', f }); return { accounts: [], answers: [] }; } }, browser: mk('browser'), logins: mk('logins'), vaultUse: mk('vaultUse'), automation: mk('automation'), exits: mk('exits'), windows: mk('windows'), ...doors };
  const mu = MU.create({
    activeSessions, sessionKeyOf: (s, id) => (s.backendSessionId ? `${s.backend}:${s.backendSessionId}` : `webui:${id}`), addressableId: (s) => s.backendSessionId || null,
    storedRow: async (key) => stored.find((r) => r.sessionKey === key) || null,
    groupsOf: (q) => { if (groupsThrow) throw new Error('tasks.json unreadable'); return q.sessionKey === 'codex:c1' || q.cwd === '/w/lane' ? [{ id: 'g1', title: 'Lane' }] : []; },
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
  const body = src.replace(/^import [^\n]*\n/gm, '').replace(/^export (const|function) /gm, '$1 ');
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
  ok(/const prov = provRow;/.test(form) && /const acc = \(r\) => accLine\(r, !!this\._ns\.open\[r\.key\]\);/.test(form) && /grantedAccountHtml\(r, \{/.test(form) && /tickAccountHtml\(r, \{ ticked, words: \[t\('Written into the channel assignment at create/.test(form) && !/const doorBtn = \(door, label/.test(form),
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
  const whole = src.replace(cut, "const accessNamed = (res) => { const r = CG.rowOf(CG.DOORS.reach, res); const v = require('../grant-model.js').admits([{ door: 'channel-reach', resource: res, to: r.to, except: r.except }], RF); return v.ok ? CG.accessOf(res) : []; };");
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
  const nolevel = require(MC.write('src/server/channels-access.js', src.replace(cutL, 'const sees = hits, asks = [];'), 'no-level'));
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
  const STORE = LIVE.replace('for (const g of liveGrants()) {', 'for (const g of db.grants) {');
  const planted = ENGS.split(LIVE).length === 2 ? ENGS.replace(LIVE, STORE) : null;
  ok(!!planted && planted.split(STORE).length === 2 && planted.split(LIVE).length === 1, '⑭ CONTROL plant: the lister\'s walk over liveGrants() stands once in automation-engine.js, and the copy walks the raw store there instead');
  const MC14 = mutantCopies('may-use-keys', REPO);
  const red = planted ? listed(boot(MC14.load('src/server/automation-engine.js', planted, 'keys-store'))) : null;
  ok(!!red && red.includes('once14'), '⑭ RED CONTROL: a lister over the raw store lists the dead once-grant as granted (the door refuses it)', red);
  for (const r of copiesCensus(MC14.files, MC14.dir, REPO, { minCopies: 1, label: '⑭ ' })) ok(r.pass, r.name, r.detail);
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
