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
//   ④c lane wake-approve-card r3 — A POINTER HIDES, NEVER DECIDES: an access request's (rq-) item closed by the person (the
//      ✓ a stale page draws, «Mark all seen») is HIDDEN — the request stays open; the pointer comes back when the agent asks
//      again and at the boot reconcile; a decision in the Reach dialog stamps the hidden pointer «approved by you»
//   ④d lane wake-approve-card r3 — A WAKE ASK HAS A LIFETIME (7 days): filed with its end (the request + the item), the card
//      says «expires in 7 d»; the refusal at the bound names the oldest ask and its end; past it the sweep expires it
//      («expired · the agent can ask again», the bound freed); an Approve after its end is refused `expired`; an ask filed
//      before the lifetime and an item that ended while nobody listened are settled at the boot reconcile
//   ④e lane wake-approve-card r4 — THE WAKE'S REACH IS THE PERSON'S: the real engine behind the real routes; on a grain holding an
//      approved wake the reviewer's three curls (a rule's pattern match-all, its watchExcept [], the conversation's filter) from a
//      vsst_ and from a bare curl ⇒ 403, nothing widened; the same writes on a grain holding no wake ⇒ 200 (RED: bec3e3f8 ⇒ 200)
//   ④f lane wake-approve-card r5 — «HELD» IS READ BY THE READER THAT FIRES: the reviewer's fixture (a rule wake whose watcher holds
//      the account's access) is held — a vsst_ pattern edit ⇒ 403, the owner's own edit KEEPS the wake; a stored wake made inert
//      (its access taken off the account) is held — the agent's own vsst_ reach ⇒ 403, the wake stays inert (RED: 4b8896e7 ⇒ 200)
//   ④g lane wake-approve-card r5 — A WEBHOOK PATH THAT HOLDS A WAKE IS A WAKE GRAIN: a bare curl / a vsak_ enabling (budget,
//      allow-list, callers) a disabled held path ⇒ 403; the same on a path with no wake ⇒ 200 (RED: 4b8896e7 ⇒ 200)
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
const FA = require(path.join(REPO, 'src/foryou-actions.js'));   // lane wake-approve-card r3: THE registry's words (a hide, an expiry)
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const FAKE = require(path.join(REPO, 'src/channels/fake.js'));
const { createChannelRegistry } = require(path.join(REPO, 'src/channels/index.js'));
const ROOT = scratch('chan-agent-watch');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const MUT = mutantCopies('chan-agent-watch', REPO);
const J2s = (x) => JSON.stringify(x);

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
function mkEngine(name, { ENGM = ENG, live = null, sendHook = null, decisionEngine = null, lines = null } = {}) {
  const dataDir = path.join(ROOT, name);
  const clock = dayStartClock();
  const userTodos = new UserTodoManager({ dataDir, now: clock });
  const delivered = [], stashed = [];
  const deliver = {
    deliverToConversation: async (cid, text, o) => { delivered.push({ cid, text, o }); return { ok: true, lane: 'message' }; },
    stashFor: (cid, e) => { stashed.push({ cid, ...e }); return { stored: true }; },
  };
  // the fake world follows THIS clock (a later pass sees the day's later records — new messages)
  const registry = createChannelRegistry();
  const fk = FAKE.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'], now: clock });
  // lane slack-file-send-key r2: a leg may stand in for the vendor's send (the adapter's own send handed in)
  if (sendHook) { const mk0 = fk.create; fk.create = (record, deps) => { const a = mk0(record, deps); const s0 = a.send; a.send = (convId, o) => sendHook(s0, convId, o); return a; }; }
  registry.register(fk);
  const log = lines ? { log: (x) => lines.push(String(x)), warn: (x) => lines.push(String(x)), error() {} } : { log() {}, warn() {}, error() {} };   // + lines: lane dm-reply-infers reads the journal
  const eng = ENGM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: () => {}, userTodos, deliver, now: clock, log, liveSessions: () => live || [{ cid: 'agent-1', name: 'Worker', groups: [] }, { cid: 'agent-2', name: 'Other', groups: [] }], ...(decisionEngine ? { decisionEngine } : {}) });
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

console.log('④b THE ITEM AND THE REQUEST ARE ONE STATE (lane wake-approve-card): a wake request\'s item closed by ✓ / ✕ settles it');
/** a wake ask, its item closed by a generic verb (✕ Dismiss), the agent asking again, the closed item reopened */
async function oneStateLeg(ENGM, name) {
  const { eng, userTodos, clock } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)] });
  const wk = await eng.agentWatch(AG, KEY, { delivery: 'wake', why: 'on call' });
  if (!wk.ok || !wk.request) return { wk };
  const reqOf = (id) => (eng.store.index.table('watchRequests') || []).find((r) => r.id === id) || {};
  const todoId = reqOf(wk.request && wk.request.id).todoId;
  const tryClose = (st) => { try { userTodos.setStatus(todoId, st, 'user'); return 'closed'; } catch (e) { return e.code || e.message; } };
  const dismiss = tryClose('dismissed');   // the card's (or the tray's) ✕ — a generic closer, not a decision
  const markDone = tryClose('done');       // ✓ Mark done
  const seenAll = userTodos.setStatusMany([todoId], 'dismissed', 'user');   // «Mark all seen» on its band
  await new Promise((r) => setTimeout(r, 60));
  const afterClosers = { item: userTodos.get(todoId).status, request: reqOf(wk.request.id).status };
  const dec = await eng.decideRequest(wk.request.id, false, 'user', { person: true });   // THE decide route's call (its verdict asked)
  const it1 = userTodos.get(todoId);
  const reopen = tryClose('open');         // the old ↺ / the 6 s Undo
  const it1b = userTodos.get(todoId);
  // an END that is no decision: the agent asks again, its item expires (the store's sweep of a producer's expiresAt)
  const wk2 = await eng.agentWatch(AG, KEY, { delivery: 'wake', why: 'still on call' });
  const t2 = reqOf(wk2.request && wk2.request.id).todoId;
  const item2 = t2 ? userTodos.get(t2) : null; if (item2) item2.expiresAt = clock() - 1;
  const swept = userTodos.expireDue(clock());
  for (let i = 0; i < 40 && wk2.request && reqOf(wk2.request.id).status === 'open'; i++) await new Promise((r) => setTimeout(r, 25));
  const again = await eng.agentWatch(AG, KEY, { delivery: 'wake', why: 'on call once more' });
  return { dismiss, markDone, seenAll: { changed: seenAll.changed.length, decisions: seenAll.decisions || null }, afterClosers,
    decided: { ok: dec.ok, request: reqOf(wk.request.id).status, decidedBy: reqOf(wk.request.id).decidedBy, item: it1.status, by: it1.resolvedBy, fact: it1.resolvedFact || null },
    reopen, kept: { status: it1b.status, by: it1b.resolvedBy, fact: it1b.resolvedFact || null },
    expired: { swept, item: t2 ? userTodos.get(t2).resolvedBy : null, request: wk2.request ? reqOf(wk2.request.id).status : null, decidedBy: wk2.request ? reqOf(wk2.request.id).decidedBy : null },
    again: { already: !!again.already, fresh: !!again.request && !!wk2.request && again.request.id !== wk2.request.id } };
}
{
  // acceptance round 2 (主开发): A DECISION ROW HAS TWO VERBS — a generic close is not a decision (it was a silent Deny whose
  // record read «✓ done», and its 6 s Undo reopened a request that was over); the item and its request stay ONE state
  const g = await oneStateLeg(ENG, 'e3b');
  ok(g.dismiss === 'decision_row' && g.markDone === 'decision_row' && g.seenAll.changed === 0 && (g.seenAll.decisions || []).length === 1, `✕ Dismiss / ✓ Mark done on a wake request's item are refused BY NAME (${g.dismiss}, ${g.markDone}); «Mark all seen» passes it by (${J2s(g.seenAll)})`, J2s(g));
  ok(g.afterClosers.item === 'open' && g.afterClosers.request === 'open', 'the item and its request are still open — decidable by their two verbs only', J2s(g.afterClosers));
  ok(g.decided.ok && g.decided.request === 'denied' && g.decided.decidedBy === 'person' && g.decided.item === 'done' && g.decided.by === 'denied' && !!g.decided.fact && g.decided.fact.decidedBy === 'person' && Number(g.decided.fact.decidedAt) > 0, 'Deny through the decide route (its person verdict asked): the request records decidedBy \'person\' + the time, the item carries the same mark (resolvedFact) — the only record that says «by you»', J2s(g.decided));
  ok(g.reopen === 'decision_final' && g.kept.status === 'done' && g.kept.by === 'denied' && !!g.kept.fact, `a decision is FINAL: reopening it is refused by name (${g.reopen}); its record keeps «denied» and its mark`, J2s(g.kept));
  ok(g.expired.swept === 1 && g.expired.item === 'expired' && g.expired.request === 'expired' && g.expired.decidedBy === 'expired', `an item that ENDS without a decision (the expiry sweep) settles its request \`expired\` (${g.expired.request}) — never «denied», never «ask-over»`, J2s(g.expired));
  ok(!g.again.already && g.again.fresh, 'the agent can ask again: a NEW request the owner can decide (never «already filed» behind an item that ended)', J2s(g.again));
  // CONTROL: the engine without the hook — the request stays open for ever behind an item that ended
  const src = engineSource(REPO);
  const anchor = "    userTodos.onStatus((it, { status, by } = {}) => {\n      if (status === 'open') return;";
  const cut = src.split(anchor).length === 2 ? src.replace(anchor, "    userTodos.onStatus((it) => {\n      return;") : src;
  const E3 = MUT.load('src/server/channels-engine.js', cut, 'no-one-state');
  const r = await oneStateLeg(E3, 'e3b-red');
  ok(cut !== src && r.expired.item === 'expired' && r.expired.request === 'open' && r.again.already, `CONTROL: an engine without the hook — the expired item leaves its request OPEN (${r.expired.request}) and the agent's next ask is «already filed» behind an item nobody can see`, J2s(r));
}

console.log('④c A POINTER HIDES, NEVER DECIDES (lane wake-approve-card r3): an access request\'s item is a pointer to the Reach dialog');
async function pointerLeg(ENGM, name) {
  const { eng, userTodos } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  await eng.setAgentDirectory(A, { groups: false });
  await eng.setReach(A, C, { principal: AGENT, level: 'requestable' });
  const rq = await eng.request(AG, A, C, 'to read the incident thread');
  const reqOf = () => ((eng.store.index.peek(KEY) || {}).reachRequests || []).find((r) => rq.request && r.id === rq.request.id) || {};
  const todoId = reqOf().todoId;
  if (!todoId) return { rq };
  const snap = () => { const it = userTodos.get(todoId); return { status: it.status, by: it.resolvedBy, words: FA.settledWords(it), closers: FA.closersOf ? FA.closersOf(it) : null, stamp: (FA.decidedStamp(it) || {}).text || null }; };
  const open0 = snap();
  let press = null; try { userTodos.setStatus(todoId, 'done', 'user'); press = 'ok'; } catch (e) { press = e.code || e.message; }   // the ✓ a stale page still draws
  const hidden = { ...snap(), request: reqOf().status };
  const again = await eng.request(AG, A, C, 'to read the incident thread');   // the agent asks again while it is open
  const back = { ...snap(), resurfaced: !!again.resurfaced, already: !!again.already, sameId: again.request && again.request.id === rq.request.id };
  const seen = userTodos.setStatusMany([todoId], 'dismissed', 'user');   // «Mark all seen» on its band
  const seenAll = { changed: seen.changed.length, ...snap() };
  const boot = typeof eng.reconcileAsks === 'function' ? await eng.reconcileAsks() : { resurfaced: 0 };   // the next boot
  const atBoot = { ...snap(), resurfaced: boot.resurfaced };
  userTodos.setStatus(todoId, 'dismissed', 'user');   // hidden once more, then decided in the Reach dialog
  const dec = await eng.decideRequest(rq.request.id, true, 'user', { person: true });
  const decided = { ok: dec.ok, request: reqOf().status, ...snap() };
  return { open0, press, hidden, back, seenAll, atBoot, decided };
}
try {
  const g = await pointerLeg(ENG, 'e4c');
  ok(g.open0 && g.open0.status === 'open' && J2s(g.open0.closers) === '["hide"]', 'an open access request\'s item offers ONE closer — Hide (no ✓ Mark done)', J2s(g));
  ok(g.press === 'ok' && g.hidden.status === 'dismissed' && g.hidden.by === 'hidden' && g.hidden.words === 'hidden — nothing was decided' && g.hidden.request === 'open' && J2s(g.hidden.closers) === '[]', 'the ✓ a stale page still sends is a HIDE: the record «hidden — nothing was decided» (never «✓ done»), no ↺ — the request still OPEN in the Reach dialog', J2s(g.hidden));
  ok(g.back.resurfaced && g.back.already && g.back.sameId && g.back.status === 'open', 'the agent asks again while it is open ⇒ the SAME request, its pointer back in the tray (resurfaced: true) — never a second filing', J2s(g.back));
  ok(g.seenAll.changed === 1 && g.seenAll.status === 'dismissed' && g.seenAll.by === 'hidden', '«Mark all seen» hides it too (never «done»)', J2s(g.seenAll));
  ok(g.atBoot.resurfaced === 1 && g.atBoot.status === 'open', 'the next boot reconcile: the request still open ⇒ its hidden pointer comes back', J2s(g.atBoot));
  ok(g.decided.ok && g.decided.request === 'approved' && g.decided.status === 'done' && g.decided.by === 'allowed' && /^approved by you · (\d+\/\d+ )?\d\d:\d\d$/.test(g.decided.stamp || ''), 'decided in the Reach dialog while hidden ⇒ the pointer takes the decision: «approved by you · HH:MM» (never «hidden» over an answered request)', J2s(g.decided));
  // CONTROL: the engine whose pointer never comes back (resurface cut) — a hidden pointer stays hidden over an open request
  const src = engineSource(REPO);
  const anchor = '  function resurface(req) {\n';
  const cut = src.split(anchor).length === 2 ? src.replace(anchor, '  function resurface(req) { return false;\n') : src;
  const E4 = MUT.load('src/server/channels-engine.js', cut, 'no-resurface');
  const r = await pointerLeg(E4, 'e4c-red');
  ok(cut !== src && r.hidden.status === 'dismissed' && !r.back.resurfaced && r.back.status === 'dismissed' && r.atBoot.status === 'dismissed', 'CONTROL: an engine without the resurface — the agent\'s re-ask and the boot leave the pointer hidden over an open request', J2s({ back: r.back, atBoot: r.atBoot }));
} catch (e) { ok(false, '④c threw on this tree (an API it asks for is missing): ' + ((e && e.message) || e)); }

console.log('④d A WAKE ASK HAS A LIFETIME (lane wake-approve-card r3): 7 days, said on the card, the bound freed at its end');
/** the REAL routes (src/routes/channels.js over express) in front of `eng` for one `fn(call)` — `call(method, path, body,
 *  headers)` → {status, code, …answer} (r4: the decide route's answer to a press past an ask's end) */
async function withRoutes(eng, fn) {
  const express = require('express'), http = require('node:http');
  const ROUTES = require(path.join(REPO, 'src/routes/channels.js'));
  ROUTES.setup({ getEngine: () => eng });
  const app = express(); app.use(express.json()); app.use(ROUTES.router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, p, body = {}, headers = { 'Sec-Fetch-Site': 'same-origin' }) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch { } return { status: r.status, ...j }; };
  try { return await fn(call); } finally { await new Promise((r) => srv.close(r)); }
}
async function lifetimeLeg(ENGM, name) {
  const { eng, userTodos, clock } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)] });
  const reqOf = (id) => (eng.store.index.table('watchRequests') || []).find((r) => r.id === id) || {};
  const DAY = 86400e3, t0 = clock();
  const a = await eng.agentWatch(AG, KEY, { delivery: 'wake', why: 'on call' });
  clock.advance(3600e3);
  const b = await eng.agentWatch(AG, `${A}/fake-poll-announce`, { delivery: 'wake', why: 'on call too' });
  const full = await eng.agentWatch(AG, A, { delivery: 'wake', why: 'the whole account' });   // the bound (2) is full
  const ra = reqOf(a.request && a.request.id), ia = ra.todoId ? userTodos.get(ra.todoId) : null;
  const filed = { at: ra.at, expiresAt: ra.expiresAt || null, itemExpires: ia ? ia.expiresAt : null, answer: a.expiresAt || null, words: ia && FA.expiryWords ? FA.expiryWords(ia, { now: clock() }) : null };
  const show = eng.agentWatchesFor(AG, KEY);
  clock.advance(6 * DAY - 3600e3);   // day 6
  const day6 = { words: ia && FA.expiryWords ? FA.expiryWords(userTodos.get(ra.todoId), { now: clock() }) : null, open: reqOf(ra.id).status };
  clock.advance(DAY + 60e3);   // a is 7 days + 1 min old, b 1 h younger
  const swept = typeof eng.expireWatchRequests === 'function' ? await eng.expireWatchRequests() : [];   // the engine's minute sweep
  const ia2 = ra.todoId ? userTodos.get(ra.todoId) : null;
  const ended = { request: reqOf(ra.id).status, decidedBy: reqOf(ra.id).decidedBy || null, item: ia2 && ia2.status, by: ia2 && ia2.resolvedBy, words: ia2 ? FA.settledWords(ia2) : null, b: reqOf(b.request && b.request.id).status };
  const next = await eng.agentWatch(AG, A, { delivery: 'wake', why: 'the whole account' });   // its bound freed
  clock.advance(2 * 3600e3);   // b is past its end now — never swept yet
  const rb = reqOf(b.request.id);
  // r4 (主开发): a press past the end answers ONE way on both sides of the minute sweep — the page's own route (this instance's
  // page: Sec-Fetch-Site same-origin), a 409 `expired` with its end (was: 500 before the sweep, «already decided» after it)
  const http2 = await withRoutes(eng, async (call) => ({ before: await call('POST', `/api/channels/reach-requests/${b.request.id}/approve`), after: await call('POST', `/api/channels/reach-requests/${ra.id}/deny`) }));
  const late = { code: http2.before.code || null, ok: !!http2.before.ok };
  // BOOT: an ask filed BEFORE the lifetime (no end of its own, its item lasting) 8 days old; an item that ended while nobody listened
  const old = userTodos.add('channels', { origin: 'channels', text: 'Worker asks to be woken by an old room', action: { type: 'channel-watch-request', id: 'wr-legacy' } });
  const dark = userTodos.add('channels', { origin: 'channels', text: 'Worker asks to be woken by a dark room', action: { type: 'channel-watch-request', id: 'wr-dark' } });
  const darkIt = userTodos._state.items.find((x) => x.id === dark.id); darkIt.status = 'done'; darkIt.resolvedBy = 'expired'; darkIt.resolvedAt = clock();   // the store's load-time sweep, before the hook listened
  await eng.store.index.update((ix) => { ix.watchRequests.push({ id: 'wr-legacy', kind: 'watch', principal: AGENT, scope: { kind: 'conversation', id: `${A}/legacy` }, adapterId: A, grain: { kind: 'conversation', convId: 'legacy' }, watch: { principal: AGENT }, why: '', at: clock() - 8 * DAY, status: 'open', todoId: old.id, decidedAt: null });
    ix.watchRequests.push({ id: 'wr-dark', kind: 'watch', principal: OTHER, scope: { kind: 'conversation', id: `${A}/dark` }, adapterId: A, grain: { kind: 'conversation', convId: 'dark' }, watch: { principal: OTHER }, why: '', at: clock() - DAY, expiresAt: clock() + 6 * DAY, status: 'open', todoId: dark.id, decidedAt: null }); });
  const boot = typeof eng.reconcileAsks === 'function' ? await eng.reconcileAsks() : null;
  for (let i = 0; i < 40 && reqOf('wr-dark').status === 'open'; i++) await new Promise((r) => setTimeout(r, 25));
  return { t0, filed, show: show && show.request, day6, full: { code: full.code, error: full.error || '', oldest: full.oldest || null }, a: ra.id, swept, ended, next: { ok: !!next.ok, proposed: !!next.proposed, code: next.code || null },
    late: { code: late.code || null, ok: !!late.ok, request: reqOf(b.request.id).status }, http: { before: { status: http2.before.status, code: http2.before.code, expiredAt: http2.before.expiredAt || null, error: http2.before.error || '' }, after: { status: http2.after.status, code: http2.after.code, expiredAt: http2.after.expiredAt || null, error: http2.after.error || '' }, bEnd: rb.expiresAt || null }, boot: { legacy: reqOf('wr-legacy').status, legacyItem: userTodos.get(old.id).resolvedBy, dark: reqOf('wr-dark').status, darkBy: reqOf('wr-dark').decidedBy || null, settled: boot && boot.settled } };
}
try {
  const g = await lifetimeLeg(ENG, 'e4d');
  const WEEK = F.WATCH_REQUEST_TTL_MS;
  ok(WEEK === 7 * 86400e3 && g.filed.expiresAt === g.filed.at + WEEK && g.filed.itemExpires === g.filed.expiresAt && g.filed.answer === g.filed.expiresAt, 'a wake ask is filed WITH its end — the request, its item and the agent\'s answer: its filing + 7 days', J2s(g.filed));
  ok(g.filed.words === 'expires in 7 d' && g.day6.words === 'expires in 1 d' && g.day6.open === 'open', 'the card and the tray row say it: «expires in 7 d» at filing, «expires in 1 d» on day 6', J2s({ f: g.filed.words, d6: g.day6 }));
  ok(g.show && g.show.expiresAt === g.filed.expiresAt, '`watch --show` reads it back: the waiting ask\'s end', J2s(g.show));
  ok(g.full.code === 'watch-request-limit' && g.full.oldest && g.full.oldest.id === g.a && g.full.oldest.expiresAt === g.filed.expiresAt && g.full.error.includes(g.a) && /expires unanswered .* \(in 7 d\)/.test(g.full.error), 'the refusal at the bound NAMES the oldest open ask and its end («… the oldest, wr-… (for …), expires unanswered <when> (in 7 d)»)', g.full.error);
  ok(g.swept.includes(g.a) && g.ended.request === 'expired' && g.ended.decidedBy === 'expired' && g.ended.item === 'done' && g.ended.by === 'expired' && g.ended.words === 'expired · the agent can ask again' && g.ended.b === 'open', 'past 7 days the sweep EXPIRES it: the request `expired` (nothing written), its item closed «expired · the agent can ask again»; the younger ask still waits', J2s(g.ended));
  ok(g.next.ok && g.next.proposed, 'its bound is freed: the agent\'s next wake ask is filed', J2s(g.next));
  ok(g.late.code === 'expired' && !g.late.ok && g.late.request === 'expired', 'an Approve after its end (before the sweep wrote it) is refused `expired` — never approved late', J2s(g.late));
  const word = /^this request expired on \d{4}-\d\d-\d\d \d\d:\d\d [A-Z]+ — the agent can ask again$/;
  ok(g.http.before.status === 409 && g.http.before.code === 'expired' && g.http.before.expiredAt === g.http.bEnd && word.test(g.http.before.error), `r4: the page\'s Approve in the ≤ 60 s BEFORE the sweep ⇒ 409 expired with its end — «${g.http.before.error}» (was 500, words no page translated)`, J2s(g.http.before));
  ok(g.http.after.status === 409 && g.http.after.code === 'expired' && g.http.after.expiredAt === g.filed.expiresAt && word.test(g.http.after.error), 'r4: …and AFTER the sweep (the request already `expired`) the same answer — 409 expired with its end (was «request already expired», a 409 bad-state the page words «already decided»)', J2s(g.http.after));
  ok(g.boot.legacy === 'expired' && g.boot.legacyItem === 'expired' && g.boot.dark === 'expired' && g.boot.darkBy === 'expired' && g.boot.settled >= 1, 'the boot reconcile: an ask filed before the lifetime (8 days old, its item lasting) expires; an item that ended while nobody listened settles its request', J2s(g.boot));
  // CONTROL: the engine whose asks never end (the base: no lifetime) — 8 days on, the ask is open for ever and the bound stays full
  const src = engineSource(REPO);
  const anchor = 'const askEndOf = (r) => (Number(r && r.expiresAt) > 0 ? Number(r.expiresAt) : Number(r && r.at) + F.WATCH_REQUEST_TTL_MS);';
  const cut = src.split(anchor).length === 2 ? src.replace(anchor, 'const askEndOf = () => Infinity;') : src;
  const E5 = MUT.load('src/server/channels-engine.js', cut, 'no-lifetime');
  const r = await lifetimeLeg(E5, 'e4d-red');
  ok(cut !== src && r.ended.request === 'open' && r.next.code === 'watch-request-limit' && r.boot.legacy === 'open', 'CONTROL: an engine whose asks never end — 7 days on the ask is still OPEN, the agent\'s next ask refused at the bound, the 8-day-old one still open after the boot', J2s({ ended: r.ended, next: r.next, legacy: r.boot.legacy }));
} catch (e) { ok(false, '④d threw on this tree (an API it asks for is missing): ' + ((e && e.message) || e)); }

console.log('④e THE WAKE\'S REACH IS THE PERSON\'S (lane wake-approve-card r4): the reviewer\'s three curls on a grain holding an approved wake');
/** The REAL engine behind the REAL routes (src/routes/channels.js over express): a conversation holding an APPROVED wake (the
 *  agent's ask, the owner's Approve) beside the owner's own wake for another agent filtered on the room's filter, and a rule
 *  holding the owner's wake; beside
 *  them a conversation and a rule holding NONE. The reviewer's three writes — the rule's pattern (match-all), its watchExcept
 *  ([]), the conversation's filter (one letter) — from an agent's vsst_ and from a bare curl. → statuses + what was stored. */
async function reachLeg(ENGM, name) {
  const express = require('express'), http = require('node:http');
  const ROUTES = require(path.join(REPO, 'src/routes/channels.js'));
  const { eng } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT), acc(OTHER)] });
  const ANN = `${A}-announce`;
  await eng.setFilter(A, C, { match: 'any', rules: [{ kind: 'keyword', value: 'outage' }] });
  await eng.setFilter(A, ANN, { match: 'any', rules: [{ kind: 'keyword', value: 'release' }] });
  const fid = (eng.store.index.peek(KEY) || {}).filterId;
  await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: OTHER, delivery: 'wake', mode: 'filtered', filterId: fid }] });   // the owner's Notify…: Other is woken on «outage»
  const ask = await eng.agentWatch(AG, KEY, { delivery: 'wake', why: 'paged on an outage' });
  const approved = ask.request ? await eng.decideRequest(ask.request.id, true, 'user', { person: true }) : { ok: false, code: 'no-ask' };
  const rows = eng.store.index.peek(KEY).watchers || [];
  const row = rows.find((w) => w.principal && w.principal.id === AGENT.id) || null, other = rows.find((w) => w.principal && w.principal.id === OTHER.id) || null;
  const p1 = await eng.setGrain(A, { kind: 'pattern' }, { pattern: { match: 'any', rules: [{ kind: 'title', value: 'Ops' }] }, access: [acc(AGENT)], watchers: [{ principal: AGENT, delivery: 'wake' }] });
  const p2 = await eng.setGrain(A, { kind: 'pattern' }, { pattern: { match: 'any', rules: [{ kind: 'title', value: 'Announce' }] }, access: [acc(AGENT)], watchers: [{ principal: AGENT, delivery: 'next-turn' }] });
  const P1 = p1.grain && p1.grain.id, P2 = p2.grain && p2.grain.id;
  ROUTES.setup({ getEngine: () => eng });
  const app = express(); app.use(express.json()); app.use(ROUTES.router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const put = async (p, body, headers) => { const r = await fetch(base + p, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, code: (j && j.code) || null }; };
  const MATCH_ALL = { match: 'any', rules: [{ kind: 'kind', value: 'group' }, { kind: 'kind', value: 'dm' }] };
  const WIDE = { match: 'any', rules: [{ kind: 'keyword', value: 'e' }] };
  const curls = (rule, conv) => [['pattern', `/api/channels/adapters/${A}/patterns/${rule}`, { pattern: MATCH_ALL }], ['watchExcept', `/api/channels/adapters/${A}/patterns/${rule}`, { watchExcept: [] }], ['filter', `/api/channels/${A}/${conv}/filter`, { filter: WIDE }]];
  const VSST = { Authorization: 'Bearer vsst_0123456789abcdef' };
  const out = { setup: { approved: !!approved.ok, delivery: row && F.deliveryModeOf(row), other: other && F.deliveryModeOf(other), otherMode: other && other.mode, fid: fid || null, otherFilter: other && other.filterId, P1: !!P1, P2: !!P2 }, held: {}, bare: {}, free: {} };
  try {
    out.marks = typeof eng.wakeHeldAt === 'function' ? { conv: eng.wakeHeldAt(A, { kind: 'conversation', convId: C }).held, rule: eng.wakeHeldAt(A, { kind: 'pattern', id: P1 }).held, ann: eng.wakeHeldAt(A, { kind: 'conversation', convId: ANN }).held, p2: eng.wakeHeldAt(A, { kind: 'pattern', id: P2 }).held, account: eng.wakeHeldAt(A, { kind: 'account' }).held } : null;
    for (const [k, p, b] of curls(P1, C)) out.bare[k] = (await put(p, b, {})).status;   // a bare curl first (sign-in off) — then the agent's bearer
    for (const [k, p, b] of curls(P1, C)) out.held[k] = await put(p, b, VSST);
    for (const [k, p, b] of curls(P2, ANN)) out.free[k] = (await put(p, b, VSST)).status;
    const snap = eng.store.index.snapshot();
    const pa = (snap.patternAssignments || {})[P1];
    out.after = { pattern: pa && JSON.stringify(pa.pattern), filter: JSON.stringify(((snap.filters || {})[fid] || {}).rules || null) };
  } finally { await new Promise((r) => srv.close(r)); }
  return out;
}
try {
  const g = await reachLeg(ENG, 'e4e');
  ok(g.setup.approved && g.setup.delivery === 'wake' && g.setup.other === 'wake' && g.setup.otherMode === 'filtered' && g.setup.otherFilter === g.setup.fid && g.setup.P1 && g.setup.P2, 'setup: the agent\'s wake ask on the Ops room, APPROVED by the owner, beside the owner\'s wake for Other on the room\'s own filter («outage»); a rule holding the owner\'s wake; a rule and a room holding none', J2s(g.setup));
  ok(g.marks && g.marks.conv && g.marks.rule && !g.marks.ann && !g.marks.p2 && !g.marks.account, 'the engine MARKS the grains that hold a wake (wakeHeldAt): the Ops room and the Ops rule — not the Announcements room, not the next-turn rule, not the account', J2s(g.marks));
  ok(g.held.pattern.status === 403 && g.held.pattern.code === 'human_only' && g.held.watchExcept.status === 403 && g.held.watchExcept.code === 'human_only' && g.held.filter.status === 403 && g.held.filter.code === 'human_only', 'THE REVIEWER\'S THREE CURLS from an agent\'s vsst_ on the grains holding the wake — the rule\'s pattern (match-all), its watchExcept ([]), the room\'s filter — ⇒ 403 human_only each', J2s(g.held));
  ok(g.bare.pattern === 403 && g.bare.watchExcept === 403 && g.bare.filter === 403, '…and from a bare curl (an instance whose sign-in is off) ⇒ 403 (cross_site)', J2s(g.bare));
  ok(g.after.pattern === J2s({ match: 'any', rules: [{ kind: 'title', value: 'Ops' }] }) && g.after.filter === J2s([{ kind: 'keyword', value: 'outage' }]), 'nothing was widened: the rule still matches «Ops», Other\'s wake still fires on «outage» only', J2s(g.after));
  ok(g.free.pattern === 200 && g.free.watchExcept === 200 && g.free.filter === 200, 'the SAME three writes on a rule and a room holding NO wake ⇒ 200 (a non-wake grain stays the agent\'s to edit)', J2s(g.free));
} catch (e) { ok(false, '④e threw on this tree (an API it asks for is missing): ' + ((e && e.stack) || e)); }

console.log('④f «HELD» IS READ BY THE READER THAT FIRES (lane wake-approve-card r5): a rule wake whose watcher holds the account\'s access; a stored wake made inert');
/** (a) THE REVIEWER'S FIXTURE: the account's access [Worker, Other]; rule «Ops» with access [Other] and Notify Worker (a wake) —
 *  Worker's access is the ACCOUNT's, so the wake fires (F.effectiveGrants reads the rule with the account's access). A vsst_
 *  rewrite of the rule's pattern; then the owner's own (this page's) edit of the rule. (b) THE INERT ROW: Notify Worker on the
 *  Ops room (a wake) while Worker holds the account; the owner takes Worker off the account (the row stays stored, inert);
 *  then the agent's own vsst_ `PUT …/reach visible` on that room. → statuses + what fires. */
async function heldLeg(ENGM, name) {
  const { eng } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT), acc(OTHER)] });
  const OPS = { match: 'any', rules: [{ kind: 'title', value: 'Ops' }] };
  const p = await eng.setGrain(A, { kind: 'pattern' }, { pattern: OPS, access: [acc(OTHER)], watchers: [{ principal: AGENT, delivery: 'wake' }] });
  const P = p.grain && p.grain.id;
  const firesOn = () => { const e = eng.effectiveFor(A, C); const w = e && e.watchers.find((x) => x.watcher.principal.id === AGENT.id); return w ? `${w.source}:${F.deliveryModeOf(w.watcher)}` : null; };
  const ruleRows = () => { const pa = (eng.store.index.snapshot().patternAssignments || {})[P]; const g = typeof eng.grainReadAt === 'function' ? eng.grainReadAt(A, { kind: 'pattern', id: P }) : null; return { stored: (pa && pa.watchers || []).map((w) => w.principal.id), listed: g ? g.stored.some((w) => w.principal.id === AGENT.id) : !!(pa && (pa.watchers || []).length) }; };   // listed = the grants store's watch row still names Worker (the overlay keeps only listed rows)
  const VSST = { Authorization: 'Bearer vsst_0123456789abcdef' };
  const MATCH_ALL = { match: 'any', rules: [{ kind: 'kind', value: 'group' }, { kind: 'kind', value: 'dm' }] };
  const out = { setup: { P: !!P, fires: firesOn() } };
  out.mark = eng.wakeHeldAt(A, { kind: 'pattern', id: P });
  out.a = await withRoutes(eng, async (call) => {
    const vsst = await call('PUT', `/api/channels/adapters/${A}/patterns/${P}`, { pattern: MATCH_ALL }, VSST);
    const afterVsst = { pattern: JSON.stringify(((eng.store.index.snapshot().patternAssignments || {})[P] || {}).pattern), rows: ruleRows(), fires: firesOn() };
    // the owner's own edit of the SAME rule (this page): the rule now matches «Ops» or «Incident» — the wake must stay
    const page = await call('PUT', `/api/channels/adapters/${A}/patterns/${P}`, { pattern: { match: 'any', rules: [{ kind: 'title', value: 'Ops' }, { kind: 'title', value: 'Incident' }] } });
    const view = (page.watchers || []).map((w) => w.principal && w.principal.id);
    // the dialog's lists ARE the lists the writer stamps: a save carrying the stamp of what the answer drew lands
    const based = await call('PUT', `/api/channels/adapters/${A}/patterns/${P}/access`, { access: [acc(OTHER)], base: F.grainStamp({ access: page.access || [], watchers: page.watchers || [], except: page.except || [], watchExcept: page.watchExcept || [] }) });
    return { vsst: { status: vsst.status, code: vsst.code || null, wakeHeld: !!vsst.wakeHeld }, afterVsst, page: { status: page.status, view }, afterPage: { rows: ruleRows(), fires: firesOn() }, based: { status: based.status, code: based.code || null }, afterBased: { rows: ruleRows(), fires: firesOn() } };
  });
  // (b) the inert row
  const r = await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'wake' }] });
  const convFires = () => { const e = eng.effectiveFor(A, C); const w = e && e.watchers.find((x) => x.watcher.principal.id === AGENT.id && x.source === 'conversation'); return w ? F.deliveryModeOf(w.watcher) : null; };
  out.b = { set: !!r.ok, live: convFires() };
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(OTHER)] });   // the owner takes Worker off the account
  out.b.inert = convFires();
  out.b.stored = (eng.store.index.peek(KEY).watchers || []).filter((w) => w.principal.id === AGENT.id).length;
  out.b.mark = eng.wakeHeldAt(A, { kind: 'conversation', convId: C });
  out.b.reach = await withRoutes(eng, async (call) => { const x = await call('PUT', `/api/channels/${A}/${C}/reach`, { principal: { kind: 'agent', id: AGENT.id }, level: 'visible' }, VSST); return { status: x.status, code: x.code || null }; });
  out.b.after = convFires();
  // a write on that room that does not name the inert row (the owner's access list) keeps it stored
  await eng.setGrain(A, { kind: 'conversation', convId: C }, { access: [acc(OTHER)] });
  out.b.keptByAccessWrite = (eng.store.index.peek(KEY).watchers || []).filter((w) => w.principal.id === AGENT.id).length;
  return out;
}
try {
  const g = await heldLeg(ENG, 'e4f');
  ok(g.setup.P && g.setup.fires === 'pattern:wake', 'setup (the reviewer\'s fixture): the account\'s access [Worker, Other]; rule «Ops» with access [Other] and Notify Worker — the wake FIRES (effectiveFor: Worker via the rule, a wake)', J2s(g.setup));
  ok(g.mark.held === true && g.mark.rows === 1, '(a) the engine marks the rule HELD — read by the reader that fires (the account\'s access included)', J2s(g.mark));
  ok(g.a.vsst.status === 403 && g.a.vsst.code === 'human_only' && g.a.vsst.wakeHeld, '(a) an agent\'s vsst_ rewriting the rule\'s pattern (match-all) ⇒ 403 human_only', J2s(g.a.vsst));
  ok(g.a.afterVsst.pattern === J2s({ match: 'any', rules: [{ kind: 'title', value: 'Ops' }] }) && g.a.afterVsst.rows.stored.includes(AGENT.id) && g.a.afterVsst.rows.listed && g.a.afterVsst.fires === 'pattern:wake', '(a) …nothing changed: the rule still matches «Ops», the owner\'s wake still stored, listed and FIRING', J2s(g.a.afterVsst));
  ok(g.a.page.status === 200 && g.a.page.view.includes(AGENT.id) && g.a.afterPage.rows.stored.includes(AGENT.id) && g.a.afterPage.rows.listed && g.a.afterPage.fires === 'pattern:wake', '(a) the OWNER\'s own edit of that rule (this page) ⇒ 200 and the wake is KEPT — the writer reads the rule as the wake does (round 4\'s writer deleted it), and the dialog lists it', J2s({ page: g.a.page, after: g.a.afterPage }));
  ok(g.a.based.status === 200 && g.a.afterBased.fires === 'pattern:wake', '(a) the dialog\'s lists are the lists the writer stamps: a save carrying the stamp of what the answer drew lands (never `grain-changed`), the wake kept', J2s({ based: g.a.based, after: g.a.afterBased }));
  ok(g.b.set && g.b.live === 'wake' && g.b.inert === null && g.b.stored === 1, '(b) setup: Notify Worker on the Ops room (a live wake, its access the account\'s); the owner takes Worker off the account ⇒ the row is INERT (stored, never woken)', J2s(g.b));
  ok(g.b.mark.held === true && g.b.mark.inert === 1, '(b) the engine marks the room HELD — a wake row stored on it counts whether active or inert', J2s(g.b.mark));
  ok(g.b.reach.status === 403 && g.b.reach.code === 'human_only' && g.b.after === null, '(b) the agent\'s own vsst_ `PUT …/reach visible` on that room ⇒ 403 human_only — the inert wake stays inert (no billed turn without a click)', J2s({ reach: g.b.reach, after: g.b.after }));
  ok(g.b.keptByAccessWrite === 1, '(b) a write on the room that does not name the inert row (an access list) keeps it stored — never a narrower view that drops a row', g.b.keptByAccessWrite);
} catch (e) { ok(false, '④f threw on this tree (an API it asks for is missing): ' + ((e && e.stack) || e)); }
/** (c) THE SAME READER DELIVERS: a rule digest (a paced wake) for Worker, whose access is the account's — the hits held for it
 *  (the firing reader puts them there) and its window's flush (`flushScope`, which finds the watcher by the same reader). */
async function digestLeg(ENGM, name) {
  const { eng, delivered } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT), acc(OTHER)] });
  const p = await eng.setGrain(A, { kind: 'pattern' }, { pattern: { match: 'any', rules: [{ kind: 'title', value: 'Ops' }] }, access: [acc(OTHER)], watchers: [{ principal: AGENT, delivery: 'wake', notify: 'digest', digestMinutes: 60, dailyWakeCap: 5 }] });
  const P = p.grain && p.grain.id;
  const recs = eng.messages(A, C, { limit: 3 });
  await eng.onFresh(eng.adapterRecords().adapters.find((r) => r.id === A), C, (recs.records || recs).slice(-3), { origin: 'test' });
  await new Promise((r) => setTimeout(r, 50));
  const held = (eng.store.index.live()[KEY].pending || []).filter((x) => x && x.for === 'agent:agent-1').length;
  const d0 = delivered.length;
  const fl = await eng.flushScope(A, 'pattern', P, 'agent:agent-1');
  await new Promise((r) => setTimeout(r, 50));
  return { P: !!P, held, flush: { ok: !!(fl && fl.ok), why: (fl && fl.why) || null }, delivered: delivered.slice(d0).filter((d) => d.cid === 'agent-1').length };
}
try {
  const g = await digestLeg(ENG, 'e4f-digest');
  ok(g.P && g.held >= 1 && g.flush.ok && g.delivered === 1, `(c) a rule DIGEST for Worker (its access the account's): the hits are held for it (${g.held}) and its window's flush DELIVERS one block — the flush finds the watcher by the reader that held them (round 4's flush read the rule without the account's access: «not-watching», the hits held for ever)`, J2s(g));
} catch (e) { ok(false, '④f (c) threw on this tree: ' + ((e && e.stack) || e)); }

console.log('④g A WEBHOOK PATH THAT HOLDS A WAKE IS A WAKE GRAIN (lane wake-approve-card r5): the path verbs behind the person verdict');
/** The REAL webhook routes (src/routes/webhook.js) in front of a REAL engine with the built-in inbound door: two paths made on
 *  this page — «held» with the owner's wake on its conversation, «free» with none — both disabled on this page. Then the
 *  path verbs from a bare curl (an instance whose sign-in is off) and from an automation key's bearer (vsak_ — `owner()`
 *  refuses only vsst_ / jbt_). → statuses + the stored path. */
async function pathLeg(ENGM, name) {
  const express = require('express'), http = require('node:http');
  const WR = require(path.join(REPO, 'src/routes/webhook.js'));
  const dataDir = path.join(ROOT, name);
  const quiet = { log() {}, warn() {}, error() {} };
  const eng = ENGM.create({ dataDir, env: {}, broadcast: () => {}, log: quiet, deliver: { deliverToConversation: async () => ({ ok: true, lane: 'message' }), stashFor() {} }, serverSetting: () => undefined, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }], httpInbound: true });
  WR.setup({ getEngine: () => eng, dataDir, serverSetting: () => undefined });
  const app = express(); app.use(WR.router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const PAGE = { 'Sec-Fetch-Site': 'same-origin' }, VSAK = { Authorization: 'Bearer vsak_0123456789abcdef' };
  const call = async (method, p, body = {}, headers = PAGE) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch { } return { status: r.status, code: j.code || null, wakeHeld: !!j.wakeHeld, j }; };
  const W = WR.ADAPTER_ID;
  try {
    const mk = { held: await call('POST', '/api/channels/webhook/paths', { slug: 'held', title: 'held', textPath: 'text' }), free: await call('POST', '/api/channels/webhook/paths', { slug: 'free', title: 'free', textPath: 'text' }) };
    const cHeld = await call('POST', '/api/channels/webhook/paths/held/callers', { name: 'ci-bot', auth: 'bearer', delivery: { mode: 'poll' } });
    const n = await eng.setGrain(W, { kind: 'conversation', convId: 'held' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, delivery: 'wake' }] });   // the owner's Notify… on the held path
    const off = { held: (await call('PUT', '/api/channels/webhook/paths/held', { disabled: true })).status, free: (await call('PUT', '/api/channels/webhook/paths/free', { disabled: true })).status };
    const marks = typeof eng.wakeHeldAt === 'function' ? { held: eng.wakeHeldAt(W, { kind: 'path', convId: 'held' }).held, free: eng.wakeHeldAt(W, { kind: 'path', convId: 'free' }).held } : null;
    const disabledOf = (slug) => { const f = JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', W, 'callers.json'), 'utf8')); return !!(f.paths[slug] && f.paths[slug].disabled); };
    const out = { setup: { made: [mk.held.status, mk.free.status], caller: cHeld.status, notify: !!n.ok, off }, marks };
    out.bare = { enable: await call('PUT', '/api/channels/webhook/paths/held', { disabled: false }, {}), budget: await call('PUT', '/api/channels/webhook/paths/held', { wakesPerHour: 60 }, {}), ipAllow: await call('PUT', '/api/channels/webhook/paths/held', { ipAllow: [] }, {}), caller: await call('POST', '/api/channels/webhook/paths/held/callers', { name: 'intruder', auth: 'bearer', delivery: { mode: 'poll' } }, {}), revoke: await call('POST', `/api/channels/webhook/paths/held/callers/${cHeld.j.caller && cHeld.j.caller.id}/revoke`, {}, {}) };
    out.vsak = await call('PUT', '/api/channels/webhook/paths/held', { disabled: false }, VSAK);
    out.heldAfter = disabledOf('held');
    out.free = { enable: await call('PUT', '/api/channels/webhook/paths/free', { disabled: false }, {}), caller: await call('POST', '/api/channels/webhook/paths/free/callers', { name: 'ci-bot', auth: 'bearer', delivery: { mode: 'poll' } }, {}) };
    out.freeAfter = disabledOf('free');
    out.page = await call('PUT', '/api/channels/webhook/paths/held', { disabled: false });
    out.pageAfter = disabledOf('held');
    return out;
  } finally { await new Promise((r) => srv.close(r)); try { eng.stop && eng.stop(); } catch { } }
}
try {
  const g = await pathLeg(ENG, 'e4g');
  const st = (x) => x && x.status;
  ok(J2s(g.setup.made) === '[200,200]' && g.setup.caller === 200 && g.setup.notify && g.setup.off.held === 200 && g.setup.off.free === 200, 'setup: paths «held» (the owner\'s wake on its conversation, a caller) and «free» (no wake) made and disabled on this page', J2s(g.setup));
  ok(g.marks && g.marks.held === true && g.marks.free === false, 'the engine marks the held path (wakeHeldAt {kind: path}) — not the free one', J2s(g.marks));
  ok(Object.values(g.bare).every((x) => x.status === 403 && x.code === 'cross_site' && x.wakeHeld) && g.heldAfter === true, `a BARE curl (sign-in off) on the held path — enable it, raise its wake budget, open its allow-list, register a caller, revoke one — ⇒ 403 cross_site each (${Object.values(g.bare).map(st).join(', ')}); the path stays disabled`, J2s(Object.fromEntries(Object.entries(g.bare).map(([k, v]) => [k, [v.status, v.code]]))));
  ok(g.vsak.status === 403 && g.vsak.code === 'human_only', '…an automation key\'s bearer (vsak_ — `owner()` lets it by) ⇒ 403 human_only', J2s(g.vsak));
  ok(st(g.free.enable) === 200 && st(g.free.caller) === 200 && g.freeAfter === false, 'the SAME bare curls on the path with NO wake ⇒ 200 (enabled, a caller registered)', J2s({ enable: st(g.free.enable), caller: st(g.free.caller) }));
  ok(g.page.status === 200 && g.pageAfter === false, 'this instance\'s own page enables the held path ⇒ 200', J2s(g.page.status));
} catch (e) { ok(false, '④g threw on this tree (an API it asks for is missing): ' + ((e && e.stack) || e)); }

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
  // free a slot in the tray with a FILLER (lane wake-approve-card: closing the wake request's own item now settles its request — ④b)
  const filler = userTodos.snapshot().open.find((i) => i.sessionKey === key && /^filler /.test(i.text));
  await userTodos.setStatus(filler.id, 'done', 'user');
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

console.log('⑧ lane channel-self-unread (B-c91b): the owner\'s OWN words are never a watch hit');
async function selfWatchLeg(ENGM, name) {
  const { eng, delivered, stashed } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)] });
  const w = await eng.agentWatch(AG, KEY, { keywords: ['inc-'] });
  const rec = eng.adapterRecords().adapters.find((r) => r.id === A);
  const got = eng.messages(A, C, { limit: 1 });
  const r0 = (got.records || got)[0];
  const mkR = (vendorId, author, text, dt) => ({ ...r0, id: `${r0.id}-${vendorId}`, vendorId, at: Number(r0.at) + dt, author, text });
  const n = () => delivered.filter((d) => d.cid === 'agent-1').length + stashed.filter((d) => d.cid === 'agent-1').length;
  // B-c91b's exact shape: the owner's OWN Outbox reply to userW carries the incident id the keyword watches
  await eng.onFresh(rec, C, [mkR('own-1', { id: 'ou_owner', name: 'Owner', isSelf: true, isBot: false }, 'Re: inc-muxekkry-clfb — fixed, closing it', 1000)], { origin: 'test' });
  await new Promise((r) => setTimeout(r, 50));
  const afterSelf = n();
  await eng.onFresh(rec, C, [mkR('userW-1', { id: 'ou_userW', name: 'userW', isSelf: false, isBot: false }, 'inc-muxekkry-clfb is back', 2000)], { origin: 'test' });
  await new Promise((r) => setTimeout(r, 50));
  return { set: !!(w.ok && w.set), afterSelf, afterPeer: n() };
}
{
  const r = await selfWatchLeg(ENG, 'e8');
  ok(r.set && r.afterSelf === 0, 'the owner\'s own \'inc-…\' reply (author.isSelf) is NO hit: nothing stashed, nobody woken', JSON.stringify(r));
  ok(r.afterPeer >= 1, 'userW\'s \'inc-…\' message IS a hit (the watch still works)', JSON.stringify(r));
  const src = engineSource(REPO);
  const cut = src.replace('            if (FO.selfRead(r, selfId)) continue;\n', '');
  const E8 = MUT.load('src/server/channels-engine.js', cut, 'no-self-skip');
  const rc = await selfWatchLeg(E8, 'e8c');
  ok(cut !== src && rc.afterSelf >= 1, 'CONTROL: the watch without its self skip hits on the owner\'s own words (B-c91b; the leg above would be red)', JSON.stringify(rc));
}

console.log('⑨ reply-to-sent (owner 2026-10-07): a reply to what a MEMBER sent reaches that member alone — a group and All agents are judged per member');
const GRP = { kind: 'group', id: 'g-work', name: 'Work' };
async function replyLeg(ENGM, name, principal) {
  const live = [{ cid: 'agent-1', name: 'Worker', groups: ['g-work'] }, { cid: 'agent-2', name: 'Other', groups: ['g-work'] }];
  const { eng, delivered, stashed } = mkEngine(name, { ENGM, live });
  await eng.pass(A, { force: true });
  const rec = eng.adapterRecords().adapters.find((r) => r.id === A);
  const got = eng.messages(A, C, { limit: 1 });
  const r0 = (got.records || got)[0];
  const t0 = Number(r0.at);
  const set = await eng.setGrain(A, { kind: 'conversation', convId: C }, { access: [acc(principal)], watchers: [{ principal, delivery: 'next-turn', mode: 'filtered', filter: { match: 'any', rules: [{ kind: 'reply-to-sent' }] } }] });
  // what each member sent from here: the outbox's sent proposals (draftedBy, vendorMessageId, at)
  const sent = (id, cid, vid, text, dt) => ({ id, adapterId: A, convId: C, state: 'sent', text, draftedBy: { kind: 'agent', id: cid, name: cid }, at: t0 + dt, updatedAt: t0 + dt, result: { vendorMessageId: vid, at: t0 + dt } });
  await eng.store.outbox.update((ob) => { ob.proposals['p-a'] = sent('p-a', 'agent-1', 'vm-a1', 'Worker asks: can you send the deck?', 100); ob.proposals['p-b'] = sent('p-b', 'agent-2', 'vm-b1', 'Other asks: the invoice?', 200); });
  const mkR = (vid, to, dt) => ({ ...r0, id: `${r0.id}-${vid}`, vendorId: vid, at: t0 + dt, author: { id: 'ou_rowan', name: 'Rowan', isSelf: false, isBot: false }, text: `answer ${vid}`, replyTo: to, root: to, threadKey: to });
  const step = async (r) => { await eng.onFresh(rec, C, [r], { origin: 'test' }); await new Promise((res) => setTimeout(res, 30)); return stashed.map((x) => x.cid).join(','); };
  const s1 = await step(mkR('w-1', 'vm-a1', 1000));
  const s2 = await step(mkR('w-2', 'vm-a1', 2000));
  const s3 = await step(mkR('w-3', 'vm-b1', 3000));
  const s4 = await step(mkR('w-4', 'om_owner_own', 4000));
  // lane channel-reply-real (owner 2026-10-08, B-a871): the conversation as a DIRECT chat — the peer's plain message
  // seconds after both sends (no quote, no thread) reaches NOBODY; a quote of A's message there still reaches A
  await eng.store.index.update((ix) => { if (ix.conversations[KEY]) ix.conversations[KEY].kind = 'dm'; });
  const dmKind = (eng.store.index.peek(KEY) || {}).kind;
  const s5 = await step({ ...mkR('w-5', null, 5000), replyTo: null, root: null, threadKey: null });
  const s6 = await step({ ...mkR('w-6', 'vm-a1', 6000), root: null, threadKey: null });
  return { set: !!set.ok, s1, s2, s3, s4, s5, s6, dmKind, billed: delivered.length, text: (stashed[0] || {}).text || '' };
}
for (const [label, pr] of [['a GROUP of A + B', GRP], ['ALL AGENTS', { kind: 'everyone', id: '*' }]]) {
  const r = await replyLeg(ENG, `e9-${pr.kind}`, pr);
  ok(r.set && r.s1 === 'agent-1' && r.s2 === 'agent-1,agent-1' && r.s3 === 'agent-1,agent-1,agent-2' && r.s4 === r.s3 && r.billed === 0, `${label}: two replies to A's message reach A only, a reply to B's reaches B only, a reply to anything else nobody (next-turn: nothing billed)`, JSON.stringify(r));
  ok(r.dmKind === 'dm' && r.s5 === r.s4 && r.s6 === r.s4 + ',agent-1', `${label}: in a DIRECT chat the peer's plain message 5 s after both sends reaches nobody (no marker, no reply — B-a871); a quote of A's message there reaches A`, JSON.stringify({ dmKind: r.dmKind, s4: r.s4, s5: r.s5, s6: r.s6 }));
  if (pr.kind === 'group') ok(/\nReply to your message \([^)]*, "Worker asks: can you send the deck\?"\): from Rowan at /.test(r.text) && /matched: replies in the thread of your message of \d\d:\d\d UTC|matched: quotes your message of \d\d:\d\d UTC/.test(r.text), 'the hand-over (the stash): the line begins "Reply to your message (<when>, <first words>)" and the why names the member\'s own message', r.text.split('\n').slice(0, 4).join(' | '));
}
{
  const src = engineSource(REPO);
  // lane grants-unify: the fan-out also takes THE wake admission (`admit`) — the mutant drops only the filter reader
  const cut = src.replace("{ filterOf: (w) => (w && w.mode === 'filtered' ? filterFor(w.filterId) : null), admit: (item, tg) => admit(item)(tg.cid, tg.groups) }", '{ admit: (item, tg) => admit(item)(tg.cid, tg.groups) }');
  const E9 = MUT.load('src/server/channels-engine.js', cut, 'group-not-per-member');
  const rc = await replyLeg(E9, 'e9c', GRP);
  ok(cut !== src && !(rc.s2 === 'agent-1,agent-1' && rc.s3 === 'agent-1,agent-1,agent-2'), 'CONTROL: an engine judging the group row as ONE round-robin item hands a reply to the wrong member — the group leg above would be red', JSON.stringify(rc));
}

console.log('⑨b lane slack-file-send-key (B-2840): a FILE send keyed by its file id learns its share message at ingest — a thread reply under the share is a reply to the drafter');
// Slack keys a file send by the FILE id (scripts/fixtures/slack/send-files.json: completeUploadExternal answers {ok, files:[{id, title}]}
// — no share ts); the share arrives later as a SELF-authored record whose attachments[].id is that file id (recorded.json: subtype
// file_share, or a plain message with files[]). Slack lists history by ts, so a reply never arrives in a page BEFORE its share.
async function fileLeg(ENGM, name) {
  const { eng, stashed } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  const rec = eng.adapterRecords().adapters.find((r) => r.id === A);
  const got = eng.messages(A, C, { limit: 1 });
  const r0 = (got.records || got)[0];
  const t0 = Number(r0.at);
  const EV = { kind: 'everyone', id: '*' };
  await eng.setGrain(A, { kind: 'conversation', convId: C }, { access: [acc(EV)], watchers: [{ principal: EV, delivery: 'next-turn', mode: 'filtered', filter: { match: 'any', rules: [{ kind: 'reply-to-sent' }] } }] });
  const part = (n, fid, extra = {}) => ({ part: 'attachment', name: n, ok: true, vendorMessageId: fid, ...extra });
  await eng.store.outbox.update((ob) => {
    ob.proposals['p-f'] = { id: 'p-f', adapterId: A, convId: C, state: 'sent', text: 'Worker: the deck and the chart', draftedBy: { kind: 'agent', id: 'agent-1', name: 'agent-1' }, at: t0 + 100, updatedAt: t0 + 100, result: { ok: true, vendorMessageId: 'F0SEND001', at: t0 + 100, sentAs: 'user', parts: [part('deck.pdf', 'F0SEND001', { withText: true }), part('chart.png', 'F0SEND002')] } };
    ob.proposals['p-b'] = { id: 'p-b', adapterId: A, convId: C, state: 'sent', text: 'Other asks: the invoice?', draftedBy: { kind: 'agent', id: 'agent-2', name: 'agent-2' }, at: t0 + 200, updatedAt: t0 + 200, result: { vendorMessageId: 'vm-b1', at: t0 + 200 } };
  });
  const share = (ts, fid, dt) => ({ ...r0, id: `${r0.id}-${ts}`, vendorId: ts, at: t0 + dt, author: { id: 'U0SELF', name: 'Me', isSelf: true, isBot: false }, text: '', attachments: [{ id: fid, name: 'f', bytes: 1, mime: 'application/pdf' }], replyTo: null, root: null, threadKey: null });
  const reply = (vid, ts, dt) => ({ ...r0, id: `${r0.id}-${vid}`, vendorId: vid, at: t0 + dt, author: { id: 'U0ROWAN', name: 'Rowan', isSelf: false, isBot: false }, text: `answer ${vid}`, attachments: [], replyTo: ts, root: null, threadKey: ts });
  const real = eng.store.outbox.update.bind(eng.store.outbox);
  let writes = 0;
  eng.store.outbox.update = (fn) => { writes++; return real(fn); };
  const step = async (rs) => { writes = 0; await eng.onFresh(rec, C, rs, { origin: 'test' }); await new Promise((res) => setTimeout(res, 30)); return { stash: stashed.map((x) => x.cid).join(','), writes }; };
  const pf = () => JSON.parse(JSON.stringify(eng.store.outbox.snapshot().proposals['p-f']));
  // ONE page: the share of the first file, then a thread reply under it (thread_ts = the share's ts)
  const s1 = await step([share('1700000100.000100', 'F0SEND001', 500), reply('w-1', '1700000100.000100', 1000)]);
  const p1 = pf();
  const s2 = await step([share('1700000100.000100', 'F0SEND001', 500)]);   // the same page again (a re-poll)
  const p2 = pf();
  const s3 = await step([share('1700000300.000300', 'F0OTHER01', 3000), reply('w-3', '1700000300.000300', 3500)]);   // an UNRELATED file share
  const s4 = await step([share('1700000400.000400', 'F0SEND002', 4000), reply('w-4', '1700000400.000400', 4500)]);   // the second file's own share
  const p4 = pf();
  const ledger = ((eng.store.index.peek(KEY) || {}).sentBy || {})['agent:agent-1'] || [];
  return { s1, s2, s3, s4, p1, p2, p4, ledger };
}
{
  const r = await fileLeg(ENG, 'e9f');
  ok(r.s1.stash === 'agent-1' && r.p1.result.vendorMessageId === '1700000100.000100' && JSON.stringify(r.p1.result.fileIds) === '["F0SEND001"]' && r.p1.result.parts[0].vendorMessageId === '1700000100.000100' && r.p1.result.parts[0].fileId === 'F0SEND001' && r.p1.result.parts[1].vendorMessageId === 'F0SEND002', 'ONE page (the share, then a thread reply under it): the proposal\'s result is re-keyed by the share ts (file id kept in fileIds) BEFORE the reply is judged — the reply reaches the drafter (agent-1) and nobody else', JSON.stringify({ s1: r.s1, result: r.p1.result }));
  ok(r.s1.writes === 1 && r.p1.state === 'sent' && r.s2.writes === 0 && JSON.stringify(r.p2) === JSON.stringify(r.p1) && r.s2.stash === r.s1.stash, 'THE DOOR: the re-key is ONE outbox write with the state unchanged (sent); the same page again writes nothing and moves nothing (idempotent)', JSON.stringify({ w1: r.s1.writes, w2: r.s2.writes, state: r.p1.state }));
  ok(r.s3.stash === r.s1.stash && r.s3.writes === 0, 'a thread reply under an UNRELATED file share reaches nobody (no proposal moved)', JSON.stringify(r.s3));
  ok(r.s4.stash === 'agent-1,agent-1' && r.p4.result.vendorMessageId === '1700000100.000100' && r.p4.result.parts[1].vendorMessageId === '1700000400.000400' && JSON.stringify(r.p4.result.fileIds) === '["F0SEND001","F0SEND002"]' && r.ledger.includes('1700000100.000100') && r.ledger.includes('1700000400.000400'), 'the SECOND file (its own share message, one per file on Slack) re-keys its part; a reply under it reaches agent-1; the sentBy ledger carries both share ts', JSON.stringify({ s4: r.s4, result: r.p4.result, ledger: r.ledger }));
  const engSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const noKey = engSrc.replace('    try { await learnSentFiles(rec, convId, fresh0); }', '    try { /* no re-key */ }');
  const rc = await fileLeg(MUT.load('src/server/channels-engine.js', noKey, 'no-file-rekey'), 'e9f-c1');
  ok(noKey !== engSrc && rc.s1.stash === '' && rc.p1.result.vendorMessageId === 'F0SEND001', 'CONTROL: an engine copy WITHOUT the ingest re-key — the reply under the file share reaches nobody (the leg above would be red)', JSON.stringify({ s1: rc.s1, vid: rc.p1.result.vendorMessageId }));
  const obSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-outbound.js'), 'utf8');
  const again = obSrc.replace('if (r1) { q.result = r1; moved.push(id); }', 'if (r1) { q.result = { ...r1, vendorMessageId: q.result.vendorMessageId, parts: q.result.parts }; moved.push(id); }');
  const engAgain = engSrc.replace("const ChannelsOutbound = require('./channels-outbound.js');", `const ChannelsOutbound = require(${JSON.stringify(MUT.write('src/server/channels-outbound.js', again, 'file-key-again'))});`);
  const ra = await fileLeg(MUT.load('src/server/channels-engine.js', engAgain, 'file-key-again'), 'e9f-c2');
  ok(again !== obSrc && engAgain !== engSrc && ra.s1.stash === '' && ra.p1.result.vendorMessageId === 'F0SEND001', 'CONTROL: an outbox door that keys the result by the FILE id again — the reply reaches nobody (red)', JSON.stringify({ s1: ra.s1, vid: ra.p1.result.vendorMessageId }));
}

console.log('⑨c lane slack-file-send-key r2: the share INGESTED while the proposal was still sending — the transition that turns it sent looks back over the stored records');
async function lookBackLeg(ENGM, name) {
  const TS = '1700000500.000500';
  const hook = { fn: null };
  const { eng, stashed, clock } = mkEngine(name, { ENGM, sendHook: (s0, convId, o) => hook.fn(s0, convId, o) });
  await eng.pass(A, { force: true });
  const rec = eng.adapterRecords().adapters.find((r) => r.id === A);
  const r0 = ((g) => (g.records || g)[0])(eng.messages(A, C, { limit: 1 }));
  const EV = { kind: 'everyone', id: '*' };
  await eng.setGrain(A, { kind: 'conversation', convId: C }, { access: [acc(EV)], watchers: [{ principal: EV, delivery: 'next-turn', mode: 'filtered', filter: { match: 'any', rules: [{ kind: 'reply-to-sent' }] } }] });
  const share = () => ({ ...r0, id: `${r0.id}-${TS}`, vendorId: TS, at: Number(clock()), author: { id: 'U0SELF', name: 'Me', isSelf: true, isBot: false }, text: '', attachments: [{ id: 'F0SEND005', name: 'deck.pdf', bytes: 1, mime: 'application/pdf' }], replyTo: null, root: null, threadKey: null });
  // the vendor's send: the share lands in the log and is ingested (the poll's order: stored, then judged) BEFORE the answer comes
  hook.fn = async () => {
    const sh = share();
    await eng.store.appendRecords(A, C, [sh]);
    await eng.onFresh(rec, C, [sh], { origin: 'test' });
    return { ok: true, vendorMessageId: 'F0SEND005', at: Number(clock()), sentAs: 'user', parts: [{ part: 'attachment', name: 'deck.pdf', withText: true, ok: true, vendorMessageId: 'F0SEND005' }] };
  };
  const real = eng.store.outbox.update.bind(eng.store.outbox);
  const seen = [];
  let writes = 0;
  eng.store.outbox.update = async (fn) => { writes++; const out = await real(fn); for (const q of Object.values(eng.store.outbox.snapshot().proposals || {})) if (q && q.result && q.draftedBy && q.draftedBy.id === 'agent-1') seen.push(String(q.result.vendorMessageId)); return out; };
  const pr = await eng.propose(AGENT, A, C, { text: 'Worker: the deck' });
  const ap = pr.ok ? await eng.approve(pr.proposal.id) : null;
  const q1 = JSON.parse(JSON.stringify(eng.store.outbox.snapshot().proposals[pr.proposal && pr.proposal.id] || {}));
  const before = stashed.length;
  await eng.onFresh(rec, C, [{ ...r0, id: `${r0.id}-w5`, vendorId: 'w-5', at: Number(clock()) + 1000, author: { id: 'U0ROWAN', name: 'Rowan', isSelf: false, isBot: false }, text: 'answer w-5', attachments: [], replyTo: TS, root: null, threadKey: TS }], { origin: 'test' });
  await new Promise((res) => setTimeout(res, 30));
  const reached = stashed.slice(before).map((x) => x.cid).join(',');
  writes = 0;
  await eng.onFresh(rec, C, [share()], { origin: 'test' });   // AFTER the reply: the same share handed in again moves nothing
  const replayWrites = writes;
  return { proposed: !!pr.ok, state: ap && ap.proposal && ap.proposal.state, q1, seen: [...new Set(seen)], replayWrites, reached, ledger: ((eng.store.index.peek(KEY) || {}).sentBy || {})['agent:agent-1'] || [] };
}
{
  const r = await lookBackLeg(ENG, 'e9g');
  const res = r.q1.result || {};
  ok(r.proposed && r.state === 'sent' && res.vendorMessageId === '1700000500.000500' && JSON.stringify(res.fileIds) === '["F0SEND005"]' && res.parts && res.parts[0].vendorMessageId === '1700000500.000500', 'the share was stored and ingested while the proposal was SENDING; the transition that turned it sent re-keyed it by the stored share (state sent)', JSON.stringify({ proposed: r.proposed, state: r.state, result: res }));
  ok(JSON.stringify(r.seen) === '["1700000500.000500"]' && r.replayWrites === 0 && r.ledger.includes('1700000500.000500') && !r.ledger.includes('F0SEND005'), 'ONE write: the result was never stored under the file id (the re-key rode the sent transition); the same share again writes nothing; the sentBy ledger carries the ts', JSON.stringify({ seen: r.seen, replayWrites: r.replayWrites, ledger: r.ledger }));
  ok(r.reached === 'agent-1', 'the thread reply under the share reaches the drafter (agent-1) alone', JSON.stringify({ reached: r.reached }));
  const obSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-outbound.js'), 'utf8');
  const noLook = obSrc.replace("? sharedSince(p.adapterId, p.convId, t0) : null;", '? null : null;');
  const engSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const engNo = engSrc.replace("const ChannelsOutbound = require('./channels-outbound.js');", `const ChannelsOutbound = require(${JSON.stringify(MUT.write('src/server/channels-outbound.js', noLook, 'no-look-back'))});`);
  const rc = await lookBackLeg(MUT.load('src/server/channels-engine.js', engNo, 'no-look-back'), 'e9g-c');
  ok(noLook !== obSrc && engNo !== engSrc && rc.state === 'sent' && (rc.q1.result || {}).vendorMessageId === 'F0SEND005' && rc.reached === '', 'CONTROL: an outbox WITHOUT the look-back — the share ingested mid-send never re-keys it and the reply reaches nobody (red)', JSON.stringify({ state: rc.state, vid: (rc.q1.result || {}).vendorMessageId, reached: rc.reached }));
}

console.log('⑩ lane agent-watch-parity: the agent\'s watch = the dialog\'s grammar on the real engine; read back');
async function parityLeg(ENGM, name) {
  const { eng, userTodos } = mkEngine(name, { ENGM });
  await eng.pass(A, { force: true });
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)] });
  const out = {};
  out.set = await eng.agentWatch(AG, KEY, { target: KEY, args: ['--regex', '^deploy v\\d+', '--has-attachment', '--match', 'every', '--cap', '7'] });
  out.show = eng.agentWatchesFor(AG, KEY);
  out.refused = await eng.agentWatch(AG, KEY, { target: KEY, args: ['--regex', '(a+)+'] });
  out.kind = await eng.agentWatch(AG, KEY, { target: KEY, spec: { filter: { rules: [{ kind: 'nope' }] } } });
  // lane decision-rule: the LLM plugin rule through the agent's flags (the same grammar), read back by --show
  out.dec = await eng.agentWatch(AG, KEY, { target: KEY, args: ['--kind', 'decision', '--condition', 'the sender asks me to pay', '--per-hour', '5'] });
  out.decShow = eng.agentWatchesFor(AG, KEY);
  // the USER sets a digest for this agent on the whole account — the agent reads it, never writes it
  await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 60, mode: 'filtered', filter: { match: 'any', rules: [{ kind: 'mention', value: 'Worker' }] } }] });
  out.all = eng.agentWatchesFor(AG);
  out.digest = await eng.agentWatch(AG, KEY, { target: KEY, args: ['--mode', 'digest', '--digest-minutes', '45', '--keyword', 'outage'] });
  const wr = (eng.store.index.table('watchRequests') || []).find((r) => out.digest && out.digest.request && r.id === out.digest.request.id);
  out.item = wr && wr.todoId ? userTodos.get(wr.todoId) : null;
  out.other = eng.agentWatchesFor({ kind: 'agent', id: 'agent-2', name: 'Other', groups: [], msgLevelFor: () => 'none' });
  return out;
}
{
  const o = await parityLeg(ENG, 'e10');
  const row = o.show && o.show.rows && o.show.rows[0];
  ok(o.set.ok && o.set.set && /regex \/\^deploy v\\d\+\/ and has attachment/.test(o.set.what || ''), 'a next-turn watch with a regex AND an attachment rule is set at once (the dialog\'s rule kinds, judged)', JSON.stringify(o.set));
  ok(row && row.setBy === 'agent' && row.delivery === 'next-turn' && row.filter && row.filter.match === 'every' && row.filter.rules.map((r) => r.kind).join() === 'regex,has-attachment' && row.dailyWakeCap === 7, '--show reads it back: next-turn, match every, regex + has-attachment, cap 7, set by the agent', JSON.stringify(o.show));
  const d = F.validateRule({ kind: 'regex', value: '(a+)+' });
  ok(!o.refused.ok && o.refused.badSpec && o.refused.code === d.code && o.refused.error === d.error, 'a pattern the dialog refuses is refused to the agent identically (code + words; the route answers 400)', JSON.stringify(o.refused));
  ok(!o.kind.ok && o.kind.code === 'bad-kind', 'a kind the dialog does not know is refused by the same validator', JSON.stringify(o.kind));
  { const dr = o.decShow && o.decShow.rows && o.decShow.rows[0]; const r0 = dr && dr.filter && dr.filter.rules[0];
    ok(o.dec.ok && o.dec.set && /decision "the sender asks me to pay"/.test(o.dec.what || '') && r0 && r0.kind === 'decision' && r0.perHour === 5 && r0.threshold === 0.7 && r0.question === 'predicate', 'lane decision-rule: `--kind decision --condition … --per-hour 5` is set at once (next-turn) and read back with its why words, cap 5/h, threshold 0.70', JSON.stringify(o.dec)); }
  const acct = (o.all.watches || []).find((w) => w.grain === 'account');
  const conv = (o.all.watches || []).find((w) => w.grain === 'conversation');
  ok(acct && acct.setBy === 'user' && acct.notify === 'digest' && acct.digestMinutes === 60 && /mention @Worker/.test(acct.what) && conv && conv.setBy === 'agent', '`watches` lists every grain: its own row AND the row the user set for it (a digest on the account — read-only)', JSON.stringify(o.all.watches));
  ok(o.digest.ok && o.digest.proposed && o.item && /As a digest: one billed turn every 45 minutes/.test(o.item.detail || '') && /keyword "outage"/.test(o.item.detail || ''), 'a digest is a billed turn: ONE request the user approves, its For-you item names the digest window and the rule in words', JSON.stringify(o.digest) + ' ' + JSON.stringify(o.item && o.item.detail));
  ok(o.other.ok && !(o.other.watches || []).length, 'another agent reads none of these rows');
  // CONTROL: a SECOND SCHEMA at the door (the pre-parity keywords-only body) instead of the one grammar — ⑩ goes red
  const src = engineSource(REPO);
  const cut = src.replace('    const sp = WS.watchSpecOfBody(body);', "    const sp = { ok: true, spec: { delivery: body.delivery || 'next-turn', notify: 'wake', mode: (body.keywords || []).length ? 'filtered' : 'all', ...((body.keywords || []).length ? { filter: { match: 'any', rules: body.keywords.map((value) => ({ kind: 'keyword', value })) } } : {}), dailyWakeCap: 40, why: '' } };");
  const E10 = MUT.load('src/server/channels-engine.js', cut, 'second-schema');
  const c = await parityLeg(E10, 'e10c');
  const crow = c.show && c.show.rows && c.show.rows[0];
  ok(cut !== src && c.refused.ok && !(crow && crow.filter), 'CONTROL: a second schema at the door drops the rules and accepts "(a+)+" — the legs above would be red', JSON.stringify(c.refused));
}
{ const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const wv = asrc.slice(asrc.indexOf('const watchVerb = async'), asrc.indexOf("app.post('/api/agent/channels/watch'"));
  ok(/eng\.agentWatch\(ctx, b\.target, b\)/.test(wv) && !/keywords|delivery:|dailyWakeCap/.test(wv.replace(/\/\/.*$/gm, '')), 'the route hands the body WHOLE to the engine\'s one grammar — no schema of its own in watchVerb');
  ok(/app\.get\('\/api\/agent\/channels\/watches'/.test(asrc) && /agentWatchesFor\(channelPrincipal\(s, id\)/.test(asrc), 'the read-back route answers the caller\'s own principal'); }

// ── wiring pins: the route + CLI spell the three verbs ──
{
  const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf8');
  ok(/app\.post\('\/api\/agent\/channels\/watch', async \(req, res\) => \{ const t = await watchVerb\('watch', req, res\)/.test(asrc) && /app\.post\('\/api\/agent\/channels\/unwatch', async \(req, res\) => \{ const t = await watchVerb\('unwatch', req, res\)/.test(asrc) && /listFor\(channelPrincipal\(s, id\), \{ all: /.test(asrc), 'wiring: the agent routes for watch / unwatch / list --all');
  ok(/verb === 'watch' \|\| verb === 'unwatch'/.test(cli) && /\/api\/agent\/channels\/list' \+ \(all \? '\?all=1' : ''\)/.test(cli) && /\{ target, args: rest \}/.test(cli), 'wiring: the CLI spells watch / unwatch / list --all and hands the watch flags to the server raw (lane agent-watch-parity: the grammar is the server\'s)');
}

{ const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf8'); ok(cli && require(path.join(REPO, 'src/channel-watch-spec.js')).watchSpecFromArgs([]).spec.delivery === 'next-turn' && require(path.join(REPO, 'src/channel-watch-spec.js')).watchSpecOfBody({}).spec.delivery === 'next-turn', 'wiring (verify r1 ⑤): the CLI\'s default mode is next-turn — an agent never chooses a billed wake for itself by default'); }
fs.rmSync(ROOT, { recursive: true, force: true });
console.log('⑪ lane dm-reply-infers (B-6b4b): a plain reply judged ONCE by the decision API — a yes wakes once, a no never, the memo holds, the scope and the caps');
{
  const DE = require(path.join(REPO, 'src/server/decision-engine.js'));
  // D1's REAL engine over an in-process provider (no vendor call): it answers YES when the sent text asks for the contract
  function judgeSide(name, { p = null, budgetCents = 100 } = {}) {
    const ddir = path.join(ROOT, `${name}-decision`); fs.mkdirSync(ddir, { recursive: true });
    const fetches = [];
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(await new Response(init.body).text()); fetches.push(body);
      const sentLine = (/\nsent: ([^\n]*)/.exec(body.input) || [])[1] || '';
      const prob = p !== null ? p : /contract/.test(sentLine) ? 0.9 : 0.2;
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ answers: body.questions.map((q) => ({ type: 'predicate', name: q.name, probability: prob })), usage: { input_tokens: 120 } }) };
    };
    const integrations = { resolveIntegration: () => ({ values: { provider: 'openai', apiKey: ['sk', 'test', 'dmri', '0001'].join('-') }   /* built at runtime: the secret scan */, source: 'user' }) };
    const dec = DE.create({ dataDir: ddir, integrations, fetchImpl, log: { log() {}, warn() {}, error() {} } });
    dec.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ rules: true, dailyBudgetCents: budgetCents }) });
    const judged = [];   // EVERY judge() call the channels engine makes (a memo answer too)
    const spy = { ...dec, judge: async (use, parts, o) => { const r = await dec.judge(use, parts, o); judged.push({ use, parts, o, r }); return r; } };
    const journal = () => { try { return fs.readFileSync(path.join(ddir, 'decision-journal.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
    return { dec, spy, fetches, judged, journal, ddir, integrations };
  }
  const RI = { kind: 'reply-to-sent', infer: true };
  async function inferLeg(name, { rule = RI, ENGM = ENG, p = null, budgetCents = 100, principal = AGENT, live = null } = {}) {
    const J = judgeSide(name, { p, budgetCents });
    const lines = [];
    const { eng, delivered } = mkEngine(name, { ENGM, live, decisionEngine: J.spy, lines });
    await eng.pass(A, { force: true });
    const rec = eng.adapterRecords().adapters.find((r) => r.id === A);
    const got = eng.messages(A, C, { limit: 1 });
    const r0 = (got.records || got)[0];
    const t0 = Number(r0.at);
    const set = rule ? await eng.setGrain(A, { kind: 'conversation', convId: C }, { access: [acc(principal)], watchers: [{ principal, delivery: 'wake', notify: 'wake', mode: 'filtered', filter: { match: 'any', rules: [rule] } }] }) : null;
    await eng.store.index.update((ix) => { if (ix.conversations[KEY]) ix.conversations[KEY].kind = 'dm'; });   // userW's p2p chat
    const sent = (id, cid, vid, text, dt) => ({ id, adapterId: A, convId: C, state: 'sent', text, draftedBy: { kind: 'agent', id: cid, name: cid }, at: t0 + dt, updatedAt: t0 + dt, result: { vendorMessageId: vid, at: t0 + dt } });
    await eng.store.outbox.update((ob) => { ob.proposals['p-a'] = sent('p-a', 'agent-1', 'vm-a1', 'Can you send me the signed contract by Friday?', 100); ob.proposals['p-b'] = sent('p-b', 'agent-2', 'vm-b1', 'Lunch on Thursday?', 200); });
    const mkR = (vid, dt, more = {}) => ({ ...r0, id: `${r0.id}-${vid}`, vendorId: vid, at: t0 + dt, author: { id: 'ou_userw', name: 'userW', isSelf: false, isBot: false }, text: `Signed it — sending now (${vid})`, replyTo: null, root: null, threadKey: null, ...more });
    const step = async (...rs) => { await eng.onFresh(rec, C, rs, { origin: 'test' }); await eng.settleWakes(); };
    return { eng, J, lines, delivered, mkR, step, set, r0, t0 };
  }
  const H1 = 3600e3;
  // ── a DM follow-up IN SCOPE judged YES ⇒ ONE wake ──
  const y = await inferLeg('e11-yes');
  await y.step(y.mkR('w-1', 2 * H1));
  const yIn = y.J.fetches[0] && y.J.fetches[0].input;
  const yRow = y.J.journal().find((r) => r.use === 'reply-infer');
  ok(y.set.ok && y.J.judged.length === 1 && y.J.fetches.length === 1 && y.delivered.length === 1 && y.delivered[0].cid === 'agent-1', 'a plain DM answer 2 h after the agent\'s send, judged YES ⇒ ONE call, ONE wake to the agent that sent', JSON.stringify({ judged: y.J.judged.length, fetches: y.J.fetches.length, delivered: y.delivered.map((d) => d.cid) }));
  ok(/matched: judged an answer to your message of \d\d:\d\d UTC/.test(y.delivered[0].text) && /\nReply to your message \([^)]*, "Can you send me the signed contract by Friday\?", judged 0\.90\): from userW at /.test(y.delivered[0].text) && y.delivered[0].o && y.delivered[0].o.spendReason === 'channel-message', 'the same wake, the same card: the why says it was judged, the hand-over line names the answered message and the score (the existing money door, channel-message)', y.delivered[0].text.split('\n').slice(0, 4).join(' | '));
  ok(yIn && /\nsent: Can you send me the signed contract by Friday\?\nreply: Signed it — sending now \(w-1\)\ngap: 120 minutes\nbetween: Nobody else wrote between sent and reply\.$/.test(yIn) && !yIn.includes(y.r0.text) && y.J.fetches[0].questions.length === 1 && y.J.fetches[0].questions[0].name === 'answers_sent', 'the parts = the sent text + the candidate\'s text + the gap + the between line (fixed words — lane reply-infer-owner-between) — NOTHING else of the conversation (its first message is not in the input); ONE fixed question', yIn);
  ok(yRow && yRow.outcome === 'ok' && yRow.p === 0.9 && y.J.judged[0].o.memo.sent === 'vm-a1' && y.J.judged[0].o.memo.id === `${y.r0.id}-w-1`, 'the decision ledger (data/decision-journal.jsonl) logs the judgment with its score; the memo = the record\'s id + the sent message\'s id', JSON.stringify({ yRow, memo: y.J.judged[0].o.memo }));
  // ── judged NO ⇒ no wake, and THE MEMO HOLDS: a second pass never judges again (a restart neither) ──
  async function noLeg(ENGM, name) {
    const n = await inferLeg(name, { ENGM, p: 0.2 });
    await n.step(n.mkR('w-1', 2 * H1));
    const first = n.J.fetches.length;
    await n.step(n.mkR('w-1', 2 * H1));   // the same record handed in again (a re-pass)
    return { n, first, second: n.J.fetches.length, delivered: n.delivered.length };
  }
  const no = await noLeg(ENG, 'e11-no');
  const dec2 = DE.create({ dataDir: no.n.J.ddir, integrations: no.n.J.integrations, fetchImpl: async () => { throw new Error('a restart must not call'); }, log: { log() {}, warn() {}, error() {} } });
  dec2.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ rules: true }) });
  const again = await dec2.judge('reply-infer', no.n.J.judged[0].parts, no.n.J.judged[0].o);
  ok(no.first === 1 && no.second === 1 && no.delivered === 0 && no.n.J.judged.length === 2 && no.n.J.judged[1].r.memo === true && again.ok && again.memo === true && again.answers[0].probability === 0.2, 'judged NO ⇒ no wake; the SAME record again ⇒ answered by the memo, no second call; a restart (a new engine over the same data) remembers the no', JSON.stringify({ first: no.first, second: no.second, delivered: no.delivered, again: again.memo }));
  const src = engineSource(REPO);
  const MEMO = "{ questions: [DM.REPLY_INFER_QUESTION], memo: { id: String(r0.id), sent: String(c.sent.id) }, accountNever: rec.judge === 'never' }";
  const rejudge = MUT.load('src/server/channels-engine.js', src.replace(MEMO, "{ questions: [DM.REPLY_INFER_QUESTION], memo: null, accountNever: rec.judge === 'never' }"), 'infer-rejudge');
  const nm = await noLeg(rejudge, 'e11-no-mut');
  ok(src.split(MEMO).length === 2 && nm.second === 2, 'CONTROL: an engine that asks WITHOUT the memo re-judges the same record on the second pass (2 calls) — the memo leg above goes RED', JSON.stringify({ first: nm.first, second: nm.second }));
  // ── OUTSIDE THE SCOPE ⇒ never judged (judge() is not even asked) ──
  const o = await inferLeg('e11-out');
  await o.step(o.mkR('w-early', 50), o.mkR('w-late', 25 * H1), { ...o.mkR('w-own', 2 * H1), author: { id: 'ou_owner', name: 'Owner', isSelf: true, isBot: false } });
  ok(o.J.judged.length === 0 && o.J.fetches.length === 0 && o.delivered.length === 0, 'outside the scope ⇒ judge() is never called (0 calls): a message BEFORE the send, one 25 h after it (the default 24 h span), the owner\'s own message', JSON.stringify({ judged: o.J.judged.length }));
  // ── a MARKER hit stays the marker road: never judged ──
  const m = await inferLeg('e11-marker');
  await m.step(m.mkR('w-q', 60e3, { replyTo: 'vm-a1' }));
  ok(m.J.judged.length === 0 && m.delivered.length === 1 && /matched: quotes your message of /.test(m.delivered[0].text) && !/judged/.test(m.delivered[0].text), 'a QUOTE of the send ⇒ the marker road\'s wake, judge() never called', JSON.stringify({ judged: m.J.judged.length, delivered: m.delivered.length }));
  // ── THE CAP reached ⇒ no judgment, and the record says so ──
  const b = await inferLeg('e11-budget', { budgetCents: 0 });
  await b.step(b.mkR('w-1', 2 * H1));
  const bRow = b.J.journal().find((r) => r.use === 'reply-infer');
  ok(b.J.fetches.length === 0 && b.delivered.length === 0 && bRow && bRow.outcome === 'refused' && bRow.why === 'daily-budget' && b.lines.some((l) => /reply-infer — 1 plain message\(s\) not judged — daily-budget \(no hit, no wake/.test(l)), 'the day\'s budget spent ⇒ no call, no wake; the decision ledger records the refusal (daily-budget) and the channels journal names it', JSON.stringify({ bRow, lines: b.lines.filter((l) => /reply-infer/.test(l)) }));
  const hcap = await inferLeg('e11-hour', { p: 0.2 });
  await hcap.step(...Array.from({ length: 22 }, (_, i) => hcap.mkR(`w-h${i}`, 2 * H1 + i * 1000)));
  ok(hcap.J.fetches.length === 20 && hcap.J.judged.length === 20 && hcap.lines.filter((l) => /reply-infer — 1 plain message\(s\) not judged — per-hour/.test(l)).length === 1, `the conversation's hour cap (${F.INFER.perHour}): 22 plain messages ⇒ 20 judgments; the rest NOT judged, said ONCE an hour (not once a message)`, JSON.stringify({ fetches: hcap.J.fetches.length, said: hcap.lines.filter((l) => /per-hour/.test(l)) }));
  // ── review r1: a judgment that cannot change the answer is never bought — `any` with a keyword that hits, `every` with one that misses ──
  const kw = await inferLeg('e11-kw', { rule: null });
  await kw.eng.setGrain(A, { kind: 'conversation', convId: C }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, delivery: 'wake', notify: 'wake', mode: 'filtered', filter: { match: 'any', rules: [{ kind: 'keyword', value: 'signed' }, RI] } }] });
  await kw.step(kw.mkR('w-1', 2 * H1));
  const ev = await inferLeg('e11-every', { rule: null });
  await ev.eng.setGrain(A, { kind: 'conversation', convId: C }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, delivery: 'wake', notify: 'wake', mode: 'filtered', filter: { match: 'every', rules: [RI, { kind: 'keyword', value: 'invoice' }] } }] });
  await ev.step(ev.mkR('w-1', 2 * H1));
  ok(kw.J.judged.length === 0 && kw.delivered.length === 1 && /matched: keyword "signed"/.test(kw.delivered[0].text) && ev.J.judged.length === 0 && ev.delivered.length === 0, 'a judgment that cannot change the answer is never bought: `any` + a keyword that hits ⇒ the keyword\'s wake, 0 judgments; `every` + a keyword that misses ⇒ no wake, 0 judgments', JSON.stringify({ kw: [kw.J.judged.length, kw.delivered.length], every: [ev.J.judged.length, ev.delivered.length] }));
  // ── a GROUP judges each member against its OWN send (the fan-out keeps per-member sends) ──
  const live2 = [{ cid: 'agent-1', name: 'Worker', groups: ['g-work'] }, { cid: 'agent-2', name: 'Other', groups: ['g-work'] }];
  const g = await inferLeg('e11-group', { principal: { kind: 'group', id: 'g-work', name: 'Work' }, live: live2 });
  await g.step(g.mkR('w-1', 2 * H1));
  ok(g.J.fetches.length === 2 && J2s(g.J.judged.map((x) => x.o.memo.sent).sort()) === J2s(['vm-a1', 'vm-b1']) && g.delivered.length === 1 && g.delivered[0].cid === 'agent-1', 'a GROUP row with infer: the message is judged once per member send (A\'s contract ask → yes, B\'s lunch ask → no) — only A is woken', JSON.stringify({ sends: g.J.judged.map((x) => x.o.memo.sent), delivered: g.delivered.map((d) => d.cid) }));
  // ── infer OFF ⇒ the marker road, byte for byte: nothing judged, the plain answer missed, a quote still wakes ──
  const off = await inferLeg('e11-off', { rule: { kind: 'reply-to-sent' } });
  await off.step(off.mkR('w-1', 2 * H1));
  await off.step(off.mkR('w-q', 2 * H1 + 1000, { replyTo: 'vm-a1' }));
  ok(off.J.judged.length === 0 && off.delivered.length === 1 && /matched: quotes your message of /.test(off.delivered[0].text) && !off.lines.some((l) => /reply-infer/.test(l)), 'infer OFF: the 2 h plain answer is missed (the RED control), judge() never called, a quote still wakes — the marker road unchanged', JSON.stringify({ judged: off.J.judged.length, delivered: off.delivered.length }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
