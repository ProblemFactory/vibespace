#!/usr/bin/env node
// LANE CHANNEL-AGENT-WATCH (the owner, 2026-10-01 — three asks + an addendum on the Channels permission and notification
// model; fast, in-process: the PURE rules + the REAL engine over the fake adapter with an injected clock):
//   ① PURE src/channel-filter.js: `deliveryModeOf` (a row that never said = wake), a watcher keeps `delivery` / `origin`
//      only spelled right; THE ELIGIBILITY RULE — access is MAX over the grain AND ITS ANCESTORS (the owner's ask 3:
//      an account grant makes a per-chat notification valid; All agents covers everyone; nothing above ⇒ refused)
//   ② PURE src/channel-acl.js: the directory switches (groups ON, single chats OFF by default) and their validator
//   ③ the owner's symptom REPRODUCED on the real engine (account access, then Notify… on one chat) and fixed
//   ④ W1 the agent's own watch: hidden ⇒ the uniform not-found; requestable ⇒ refused naming `request`; next-turn at
//      once (origin agent); the user's row is never replaced; `unwatch` removes only its own; `wake` ⇒ ONE request, the
//      owner's Approve writes exactly it (the access request's decide route)
//   ⑤ W5 delivery: a next-turn watcher's hits go to the free stash (no billed turn); a legacy row still wakes
//   ⑥ W2 the directory: `list --all` = titles + kind + age + member count, never a message; a request may name one;
//      single chats hidden by default; an account switched off lists nothing
//   ⑦ verify r1: the USER's removal of an agent's own row STICKS (a direct re-registration is refused by name; a wake
//      ask still goes to the user and their Approve lifts the mark; the agent's own unwatch leaves no mark); ONE agent
//      holds at most MAX_AGENT_WATCHES rows of its own and MAX_OPEN_WATCH_REQUESTS wake asks waiting (said with the
//      count); the For-you item tells the owner the agent's totals; the tray's cap REFUSES the ask (never a request
//      without an item); the request table drops decided rows first, never an open one; the CLI's default is next-turn
//   CONTROLS (scripts/mutant-copy.mjs, scratch copies): a filter without the inherited rule refuses ③; an engine
//   dispatch without the next-turn branch bills ⑤; an engine without the removed-by-user check lets ⑦ re-register.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(e).slice(0, 500) : '')); } };
const F = require(path.join(REPO, 'src/channel-filter.js'));
const ACL = require(path.join(REPO, 'src/channel-acl.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const FAKE = require(path.join(REPO, 'src/channels/fake.js'));
const { createChannelRegistry } = require(path.join(REPO, 'src/channels/index.js'));
const ROOT = scratch('chan-agent-watch');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const MUT = mutantCopies('chan-agent-watch', REPO);

const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker' };
const OTHER = { kind: 'agent', id: 'agent-2', name: 'Other' };
const acc = (p) => ({ principal: p, authority: 'draft' });

console.log('① PURE: delivery, origin, and the eligibility rule (access over the grain and its ancestors)');
function pureLegs(FF) {
  const bad = [];
  if (FF.deliveryModeOf({}) !== 'wake' || FF.deliveryModeOf({ delivery: 'next-turn' }) !== 'next-turn' || FF.deliveryModeOf({ delivery: 'bogus' }) !== 'wake') bad.push('deliveryModeOf');
  const v = FF.validateWatcher({ principal: AGENT, delivery: 'next-turn', origin: 'agent' });
  if (!v.ok || v.watcher.delivery !== 'next-turn' || v.watcher.origin !== 'agent') bad.push('a watcher keeps delivery + origin');
  const legacy = FF.validateWatcher({ principal: AGENT });
  if (!legacy.ok || 'delivery' in legacy.watcher || 'origin' in legacy.watcher) bad.push('a legacy watcher gains no field');
  if (FF.validateWatcher({ principal: AGENT, delivery: 'later' }).ok || FF.validateWatcher({ principal: AGENT, origin: 'robot' }).ok) bad.push('a misspelt delivery / origin is refused');
  const W = { principal: AGENT, delivery: 'next-turn' };
  if (FF.validateWatchers([W], []).code !== 'watcher-needs-access') bad.push('nothing above ⇒ watcher-needs-access');
  if (!FF.validateWatchers([W], [], { inherited: [acc(AGENT)] }).ok) bad.push('account access above ⇒ valid (the owner\'s ask 3)');
  if (!FF.validateWatchers([W], [], { inherited: ['everyone:*'] }).ok) bad.push('All agents above covers an agent');
  if (FF.validateWatchers([W], [], { inherited: [acc(OTHER)] }).ok) bad.push('another agent\'s access does not cover this one');
  if (FF.validateWatchers([{ principal: { kind: 'everyone', id: '*' } }], [], { inherited: [acc(AGENT)] }).ok) bad.push('an All-agents watcher needs All-agents access');
  const eff = FF.effectiveGrants({ conversation: { access: [], watchers: [W] }, patterns: [], account: { access: [acc(AGENT)], watchers: [] } }, {});
  if (!eff || eff.watchers.length !== 1 || eff.watchers[0].source !== 'conversation') bad.push('effectiveGrants: a chat watcher under an account grant is in effect');
  const none = FF.effectiveGrants({ conversation: { access: [], watchers: [W] }, patterns: [], account: null }, {});
  if (none) bad.push('effectiveGrants: with nothing above the chat watcher is inert');
  const viaGrant = FF.effectiveGrants({ conversation: { access: [], watchers: [W] } }, {}, { grantKeys: ['agent:agent-1'] });
  if (!viaGrant || viaGrant.watchers.length !== 1) bad.push('effectiveGrants: a visible grant here (an approved request) makes the watcher eligible');
  return bad;
}
{ const bad = pureLegs(F); ok(!bad.length, 'deliveryModeOf · origin · validateWatchers / grainOf / effectiveGrants by the inherited rule', bad.join('; ')); }
{ // CONTROL: the filter as it was — a watcher judged by its own grain's access only
  const src = fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf8');
  const cut = src.split('const keys = eligibleKeys({ access, inherited });').join('const keys = eligibleKeys({ access });');
  const FF = MUT.load('src/channel-filter.js', cut, 'no-inherited');
  const bad = pureLegs(FF);
  ok(cut !== src && bad.includes('account access above ⇒ valid (the owner\'s ask 3)'), 'CONTROL: a filter judging a watcher by its own grain only FAILS ① (the owner\'s symptom)', bad.join('; '));
}

console.log('② PURE: the directory switches');
ok(JSON.stringify(ACL.directoryOf({})) === '{"groups":true,"singles":false}' && ACL.directoryListable(ACL.directoryOf({}), 'group') && ACL.directoryListable(ACL.directoryOf({}), 'thread') && !ACL.directoryListable(ACL.directoryOf({}), 'dm'), 'default: group chats listed, single chats not');
ok(ACL.validateDirectory({ singles: true }).ok && ACL.validateDirectory({ singles: true }).directory.groups === true && !ACL.validateDirectory({ groups: 'yes' }).ok && !ACL.validateDirectory({ secret: true }).ok && !ACL.validateDirectory(null).ok, 'validateDirectory: booleans only, the two fields only, an absent one keeps its default');

// ── the real engine ──
const A = 'fake-poll', C = 'fake-poll-ops', KEY = `${A}/${C}`;
const AG = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: [], msgLevelFor: () => 'none' };
function dayStartClock() { const t0 = Date.now(); const day0 = Math.floor(t0 / 86400e3) * 86400e3 + 60e3; let skew = 0; const f = () => day0 + (Date.now() - t0) + skew; f.advance = (ms) => { skew += ms; }; return f; }
function mkEngine(name, { ENGM = ENG } = {}) {
  const dataDir = path.join(ROOT, name);
  const userTodos = new UserTodoManager({ dataDir });
  const delivered = [], stashed = [];
  const deliver = {
    deliverToConversation: async (cid, text, o) => { delivered.push({ cid, text, o }); return { ok: true, lane: 'message' }; },
    stashFor: (cid, e) => { stashed.push({ cid, ...e }); return { stored: true }; },
  };
  const clock = dayStartClock();
  // the fake world follows THIS clock (a later pass sees the day's later records — new messages)
  const registry = createChannelRegistry();
  registry.register(FAKE.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'], now: clock }));
  const eng = ENGM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: () => {}, userTodos, deliver, now: clock, log: { log() {}, warn() {}, error() {} }, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }, { cid: 'agent-2', name: 'Other', groups: [] }] });
  return { eng, userTodos, delivered, stashed, clock };
}

console.log('③ the owner\'s symptom: account access, then Notify… on ONE chat');
{
  const { eng } = mkEngine('e3');
  await eng.pass(A, { force: true });
  const ra = await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)] });
  ok(ra.ok, 'the whole account is shared with the agent (Grant access… on the account)', JSON.stringify(ra));
  const rw = await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'wake' }] });
  ok(rw.ok, 'Notify… on one chat for that agent is ACCEPTED without a per-chat access row (was: watcher-needs-access)', JSON.stringify(rw));
  const en = eng.store.index.snapshot().conversations[KEY];
  ok(!(en.access || []).length && (en.watchers || []).length === 1, 'nothing but the notification was written on the chat (no access row conjured)', JSON.stringify({ access: en.access, watchers: (en.watchers || []).length }));
  const listed = eng.listFor(AG).conversations.find((c) => c.key === KEY);
  ok(listed && listed.watched && listed.watched.via === 'conversation' && listed.watched.delivery === 'wake', 'the agent sees the chat\'s own notification in effect (via the conversation, delivery wake)', JSON.stringify(listed && listed.watched));
  const rgone = await eng.setGrain(A, { kind: 'account' }, { access: [] });
  ok(rgone.ok && !eng.listFor(AG).conversations.some((c) => c.key === KEY), 'the account access removed ⇒ the chat is hidden again and its notification inert');
  const r2 = await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT }] });
  ok(r2.code === 'watcher-needs-access', 'with no access anywhere above, Notify… is still refused by name', JSON.stringify(r2));
}

console.log('④ W1: the agent\'s own watch');
{
  const { eng, userTodos } = mkEngine('e4');
  await eng.pass(A, { force: true });
  await eng.setAgentDirectory(A, { groups: false });
  const hidden = await eng.agentWatch(AG, KEY, {});
  const nowhere = await eng.agentWatch(AG, `${A}/no-such`, {});
  ok(hidden.code === 'not-found' && JSON.stringify(hidden) === JSON.stringify(nowhere), 'a hidden conversation and a nonexistent one: the same uniform not-found');
  // (the group chat is in the account's directory by default — requestable, refused by name below; switched off here)
  await eng.setAgentDirectory(A, { groups: false });
  await eng.setReach(A, C, { principal: AGENT, level: 'requestable' });
  const req = await eng.agentWatch(AG, KEY, {});
  ok(req.code === 'no-access' && /vibespace-channels request/.test(req.error) && /never grants reading/.test(req.error), 'a requestable conversation is refused BY NAME, pointing at `request` (a watch never grants reading)', JSON.stringify(req));
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)] });
  const w1 = await eng.agentWatch(AG, KEY, { keywords: ['deploy', 'incident'] });
  const row = () => (eng.store.index.snapshot().conversations[KEY].watchers || []).find((w) => w.principal.id === 'agent-1');
  ok(w1.ok && w1.set && w1.delivery === 'next-turn' && row() && row().origin === 'agent' && row().delivery === 'next-turn' && row().mode === 'filtered', 'next-turn (the default) is written at once: ONE row, origin agent, its keywords as an inline filter', JSON.stringify({ w1, row: row() }));
  const again = await eng.agentWatch(AG, KEY, {});
  ok(again.ok && again.replaced && (eng.store.index.snapshot().conversations[KEY].watchers || []).filter((w) => w.principal.id === 'agent-1').length === 1, 'a second watch replaces its own row (still one per agent and grain)');
  const listed = eng.listFor(AG).conversations.find((c) => c.key === KEY);
  ok(listed && listed.watched && listed.watched.setBy === 'agent' && listed.watched.delivery === 'next-turn', '`list` says it: next turn, set by the agent', JSON.stringify(listed && listed.watched));
  // the user's row is never replaced
  await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'wake', notify: 'digest', digestMinutes: 30 }] });
  const before = JSON.stringify(row());
  const blocked = await eng.agentWatch(AG, KEY, { delivery: 'next-turn' });
  ok(blocked.ok && blocked.already && blocked.setBy === 'user' && JSON.stringify(row()) === before, 'over a row the USER set, `watch` changes nothing and says so (widen-only)', JSON.stringify(blocked));
  const un0 = await eng.agentUnwatch(AG, KEY);
  ok(un0.code === 'not-watching' && JSON.stringify(row()) === before, '`unwatch` never removes the user\'s row', JSON.stringify(un0));
  await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [] });
  await eng.agentWatch(AG, KEY, {});
  const un = await eng.agentUnwatch(AG, KEY);
  ok(un.ok && !row(), '`unwatch` removes its own row', JSON.stringify(un));
  // WAKE: a request the owner approves, never written by the agent
  const wk = await eng.agentWatch(AG, KEY, { delivery: 'wake', keywords: ['outage'], dailyWakeCap: 5, why: 'on call' });
  ok(wk.ok && wk.proposed && !row(), 'wake: a REQUEST is filed, nothing is written', JSON.stringify(wk));
  const dup = await eng.agentWatch(AG, KEY, { delivery: 'wake' });
  ok(dup.proposed && dup.already && dup.request.id === wk.request.id, 'a second wake ask while one waits is the same request');
  const item = userTodos.list ? (userTodos.list().open || userTodos.list()).find?.((i) => i.action && i.action.type === 'channel-watch-request') : null;
  const all = typeof userTodos.all === 'function' ? userTodos.all() : null;
  const todo = item || (Array.isArray(all) ? all.find((i) => i.action && i.action.type === 'channel-watch-request') : null) || (eng.store.index.table('watchRequests') || []).map((r) => r.todoId && userTodos.get(r.todoId)).find(Boolean);
  ok(todo && todo.action && todo.action.type === 'channel-watch-request' && todo.action.id === wk.request.id && /at most 5 wakes a day/.test(todo.detail) && /outage/.test(todo.detail), 'ONE For-you item carries the action and says exactly what Approve writes (the words, the cap)', todo && todo.detail);
  const ap = await eng.decideRequest(wk.request.id, true, 'user');
  ok(ap.ok && row() && row().delivery === 'wake' && row().origin === 'agent' && row().dailyWakeCap === 5 && row().mode === 'filtered', 'the owner\'s Approve (the access request\'s decide route) writes EXACTLY the frozen row', JSON.stringify({ ap: ap.ok, row: row() }));
  const ap2 = await eng.decideRequest(wk.request.id, true, 'user');
  ok(ap2.code === 'bad-state' && userTodos.get(todo.id).status !== 'open', 'decided once; the For-you item is resolved');
}

console.log('⑤ W5: next-turn rides the free stash; a legacy row still wakes');
async function deliveryLeg(ENGM, name) {
  const { eng, delivered, stashed, clock } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  await eng.setGrain(A, { kind: 'conversation', convId: C }, { access: [acc(AGENT), acc(OTHER)], watchers: [{ principal: AGENT, delivery: 'next-turn' }, { principal: OTHER }] });
  void clock;
  // the dispatch itself, handed the conversation's stored records as fresh news (the poll's own entry point)
  const recs = eng.messages(A, C, { limit: 3 });
  const fresh = (recs.records || recs).slice(-3);
  await eng.onFresh(eng.adapterRecords().adapters.find((r) => r.id === A), C, fresh, { origin: 'test' });
  await new Promise((r) => setTimeout(r, 50));
  return { toAgent1Billed: delivered.filter((d) => d.cid === 'agent-1').length, toAgent1Stashed: stashed.filter((d) => d.cid === 'agent-1').length, toAgent2Billed: delivered.filter((d) => d.cid === 'agent-2').length, stashText: (stashed[0] || {}).text || '' };
}
{
  const r = await deliveryLeg(ENG, 'e5');
  ok(r.toAgent1Stashed >= 1 && r.toAgent1Billed === 0, `the next-turn watcher's hits went to its stash (${r.toAgent1Stashed}) and never to the billed ladder (${r.toAgent1Billed})`, JSON.stringify(r));
  ok(r.toAgent2Billed >= 1, `the legacy row (no delivery) still wakes, as before (${r.toAgent2Billed})`, JSON.stringify(r));
  ok(/Ops room/.test(r.stashText), 'the stashed block is the same block a wake carries (names the conversation)', r.stashText.slice(0, 200));
  // CONTROL: the dispatch without its next-turn branch bills the next-turn watcher
  const src = engineSource(REPO);
  const cut = src.replace("if (F.deliveryModeOf(w) === 'next-turn') { runs.push(stashHits(rec, convId, hits, { item, pk, batch })); continue; }", '');
  const E2 = MUT.load('src/server/channels-engine.js', cut, 'no-next-turn');
  const rc = await deliveryLeg(E2, 'e5c');
  ok(cut !== src && rc.toAgent1Billed >= 1, 'CONTROL: an engine without the next-turn branch BILLS the next-turn watcher (the leg above would be red)', JSON.stringify(rc));
}

console.log('⑥ W2: the directory — titles the agent may request');
{
  const { eng } = mkEngine('e6');
  await eng.pass(A, { force: true });
  const plain = eng.listFor(AG).conversations.filter((c) => c.adapterId === A);
  const all = eng.listFor(AG, { all: true }).conversations.filter((c) => c.adapterId === A);
  ok(!plain.length, '`list` (no --all) is unchanged: nothing of a hidden account');
  const ops = all.find((c) => c.key === KEY);
  ok(ops && ops.directory && ops.level === 'requestable' && ops.title === 'Ops room' && ops.kind === 'group' && ops.members === 3 && !('records' in ops) && !('participants' in ops) && !('unread' in ops), '`list --all`: the group chat by title, kind, member COUNT — no messages, no names, no unread', JSON.stringify(ops));
  ok(all.every((c) => c.kind !== 'dm'), 'single chats are not listed by default');
  const rq = await eng.request(AG, A, C, 'I run the deploys');
  ok(rq.ok && rq.request && rq.request.status === 'open', 'a request may name a conversation the directory lists', JSON.stringify(rq));
  const off = await eng.setAgentDirectory(A, { groups: false });
  ok(off.ok && !eng.listFor(AG, { all: true }).conversations.some((c) => c.adapterId === A && c.directory), 'the account switched off ⇒ `list --all` lists nothing of it');
  const rq2 = await eng.request(AG, A, 'fake-poll-announce', 'x');
  ok(rq2.code === 'not-found', '…and a request for a hidden conversation is the uniform not-found again', JSON.stringify(rq2));
  ok(eng.adapterRecords().adapters.find((r) => r.id === A).agentDirectory.groups === false, 'the switch is the account record\'s');
}

console.log('⑦ verify r1: the user\'s removal sticks; one agent\'s rows and wake asks are bounded; the tray\'s cap refuses; decided rows go first');
async function removalLeg(ENGM, name) {
  const { eng } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)] });
  const row = () => (eng.store.index.snapshot().conversations[KEY].watchers || []).find((w) => w.principal.id === 'agent-1');
  const w1 = await eng.agentWatch(AG, KEY, {});
  const rm = await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [] }, { by: 'user' });
  const again = await eng.agentWatch(AG, KEY, {});
  return { eng, row, w1, rm, again };
}
{
  const { eng, row, w1, rm, again } = await removalLeg(ENG, 'e7');
  ok(w1.set && rm.ok && !row(), 'the agent watches; the user removes the row in Notify… (a whole-list save by the user)');
  ok(again.code === 'removed-by-user' && /theirs to restore/.test(again.error) && /--mode wake/.test(again.error) && !row(), 'a direct re-registration is refused BY NAME and nothing is written (it shipped: the row came back)', JSON.stringify(again));
  const ask = await eng.agentWatch(AG, KEY, { delivery: 'wake' });
  ok(ask.ok && ask.proposed && !row(), 'a wake ASK is still allowed — the user decides', JSON.stringify(ask));
  const ap = await eng.decideRequest(ask.request.id, true, 'user');
  ok(ap.ok && row() && row().delivery === 'wake' && !eng.store.index.snapshot().agentWatchBlocks[`conversation:${KEY}|agent:agent-1`], 'the user\'s Approve writes the row AND lifts the mark', JSON.stringify(ap));
  const un = await eng.agentUnwatch(AG, KEY);
  const back = await eng.agentWatch(AG, KEY, {});
  ok(un.ok && back.ok && back.set && row() && row().delivery === 'next-turn', 'the agent\'s OWN unwatch leaves no mark: it may watch again', JSON.stringify({ un, back }));
  const keep = await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ ...row() }] }, { by: 'user' });
  ok(keep.ok && row() && !eng.store.index.snapshot().agentWatchBlocks[`conversation:${KEY}|agent:agent-1`], 'a user save that KEEPS the agent\'s row marks nothing');
  // F2: the bounds — rows of its own (planted entries stand in for 19 more readable chats), wake asks waiting
  await eng.store.index.update((ix) => { for (let i = 0; i < F.MAX_AGENT_WATCHES - 1; i++) ix.conversations[`${A}/planted-${i}`] = { adapterId: A, id: `planted-${i}`, key: `${A}/planted-${i}`, watchers: [{ principal: AGENT, origin: 'agent', delivery: 'next-turn', notify: 'wake', mode: 'all' }] }; });
  const lim = await eng.agentWatch(AG, `${A}/fake-poll-announce`, {});
  ok(lim.code === 'watch-limit' && new RegExp(String(F.MAX_AGENT_WATCHES)).test(lim.error), `the ${F.MAX_AGENT_WATCHES + 1}th row of its own is refused by name, with the count`, JSON.stringify(lim));
  const rep = await eng.agentWatch(AG, KEY, { keywords: ['x'] });
  ok(rep.ok && rep.set && rep.replaced, 'replacing its OWN row at a grain it already holds is not a new row (still allowed)', JSON.stringify(rep));
  await eng.store.index.update((ix) => { for (const k of Object.keys(ix.conversations)) if (/\/planted-/.test(k)) delete ix.conversations[k]; });
  const a0 = await eng.agentWatch(AG, KEY, { delivery: 'wake' }); // (the earlier ask here was decided — a new one may wait)
  const a1 = await eng.agentWatch(AG, `${A}/fake-poll-announce`, { delivery: 'wake' });
  const a2 = await eng.agentWatch(AG, A, { delivery: 'wake' });
  ok(a0.ok && a0.proposed && a1.ok && a1.proposed && a2.code === 'watch-request-limit' && /already waiting/.test(a2.error), `the ${F.MAX_OPEN_WATCH_REQUESTS + 1}th wake ask while ${F.MAX_OPEN_WATCH_REQUESTS} wait is refused by name`, JSON.stringify({ a1, a2 }));
  const reqs = eng.store.index.table('watchRequests');
  ok(reqs.filter((r) => r.status === 'open' && r.principal.id === 'agent-1').length === F.MAX_OPEN_WATCH_REQUESTS, 'exactly the bound is open');
  const { userTodos } = { userTodos: null };
  void userTodos;
}
{
  // the owner reads the agent's totals on the ask; the tray's cap refuses an ask instead of filing a blind request
  const { eng, userTodos } = mkEngine('e7b');
  await eng.pass(A, { force: true });
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT), acc(OTHER)] });
  await eng.agentWatch(AG, KEY, {});
  const ask = await eng.agentWatch(AG, `${A}/fake-poll-announce`, { delivery: 'wake' });
  const req = eng.store.index.table('watchRequests').find((r) => r.id === ask.request.id);
  const todo = userTodos.get(req.todoId);
  ok(todo && /It already has 1 notifications of its own and 0 wake asks waiting\./.test(todo.detail) && todo.i18n && JSON.stringify(todo.i18n.detail).includes('{n} notifications of its own'), 'the For-you item tells the owner the agent\'s totals (rows of its own, asks waiting)', todo && todo.detail);
  const key = todo.sessionKey;
  for (let i = 0; i < 25; i++) { try { userTodos.add(key, { text: `filler ${i}`, origin: 'channels' }); } catch { break; } }
  const OG = { kind: 'agent', id: 'agent-2', name: 'Other', groups: [], msgLevelFor: () => 'none' };
  const before = eng.store.index.table('watchRequests').length;
  const full = await eng.agentWatch(OG, KEY, { delivery: 'wake' });
  ok(full.code === 'tray-full' && /nothing was filed/.test(full.error) && eng.store.index.table('watchRequests').length === before, 'the tray at its cap ⇒ the ask is REFUSED by name and no request is stored (it shipped: an open request nobody could decide)', JSON.stringify(full));
  // the table keeps 100: decided rows go first, an open one is never dropped
  // the decided rows are the NEWEST (pushed after the open ones): an oldest-first drop would take an open row
  await eng.store.index.update((ix) => { for (let i = 0; i < 100; i++) ix.watchRequests.push({ id: `wr-old-${i}`, kind: 'watch', principal: OTHER, scope: { kind: 'conversation', id: 'x' }, status: 'denied', at: 1 }); });
  const n0 = eng.store.index.table('watchRequests').filter((r) => r.status === 'open').length;
  await userTodos.setStatus(todo.id, 'done', 'user'); // free a slot in the tray
  const more = await eng.agentWatch(OG, `${A}/fake-poll-announce`, { delivery: 'wake' });
  const list = eng.store.index.table('watchRequests');
  ok(more.ok && more.proposed && list.length === 100 && list.filter((r) => r.status === 'open').length === n0 + 1 && list.some((r) => r.id === more.request.id), 'past 100 rows a DECIDED one is dropped, every open one kept', JSON.stringify({ len: list.length, open: list.filter((r) => r.status === 'open').length }));
}
{ // CONTROL: an engine without the removed-by-user check lets the agent write its row back
  const src = engineSource(REPO);
  const cut = src.replace("if (blk && d !== 'wake') return { ok: false, code: 'removed-by-user'", "if (false) return { ok: false, code: 'removed-by-user'");
  const E3 = MUT.load('src/server/channels-engine.js', cut, 'no-removed-mark');
  const r = await removalLeg(E3, 'e7c');
  ok(cut !== src && r.again.ok && r.again.set && r.row(), 'CONTROL: without the check the removed row comes BACK (the leg above would be red)', JSON.stringify(r.again));
}

// ── wiring pins: the route + CLI spell the three verbs ──
{
  const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf8');
  ok(/app\.post\('\/api\/agent\/channels\/watch', async \(req, res\) => \{ const t = await watchVerb\('watch', req, res\)/.test(asrc) && /app\.post\('\/api\/agent\/channels\/unwatch', async \(req, res\) => \{ const t = await watchVerb\('unwatch', req, res\)/.test(asrc) && /listFor\(channelPrincipal\(s, id\), \{ all: /.test(asrc), 'wiring: the agent routes for watch / unwatch / list --all');
  ok(/verb === 'watch' \|\| verb === 'unwatch'/.test(cli) && /\/api\/agent\/channels\/list' \+ \(all \? '\?all=1' : ''\)/.test(cli) && /--regex is not offered/.test(cli), 'wiring: the CLI spells watch / unwatch / list --all and refuses --regex by name');
}

{ const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf8'); ok(/delivery: flag\('--mode'\) \|\| 'next-turn'/.test(cli), 'wiring (verify r1 ⑤): the CLI\'s default mode is next-turn — an agent never chooses a billed wake for itself by default'); }
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
