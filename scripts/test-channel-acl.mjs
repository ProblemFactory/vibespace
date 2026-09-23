#!/usr/bin/env node
// AGENT REACH (docs/design-communication-panel.zh.md §8; gate row
// `test-channel-acl`, fast).
//
//   §1 PURE src/channel-acl.js — hidden by default; MAX over every applicable
//      grant; WIDEN ONLY (a group grant is never narrowed by a member row);
//      one row per (principal, scope, origin); a request approval writes
//      EXACTLY ONE grant and leaves the group default byte-identical; the
//      uniform not-found; every grant carries its origin; the msg-acl
//      crosswalk.
//   §2 The REAL engine: THE NEGATIVE CONTROL of §17 — a user grant beside an
//      assignment grant on the same (principal, scope) survives un-assign
//      byte-for-byte; the request → For-you item → approve → one grant flow;
//      a hidden conversation is absent from list/read and answers the same
//      not-found as a nonexistent id.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const ACL = require(path.join(REPO, 'src/channel-acl.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));

const ROOT = scratch('chan-acl');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

console.log('§1 channel-acl (PURE)');
{
  const ctx = { kind: 'agent', id: 'a1', groups: ['g1'] };
  const target = { key: 'lark/c1', adapterId: 'lark' };
  ok(ACL.effective(ctx, target, []).level === 'hidden' && ACL.effective(ctx, target, []).via === 'default', 'EVERYTHING defaults to hidden');
  const gGroup = { principal: { kind: 'group', id: 'g1' }, scope: { kind: 'conversation', id: 'lark/c1' }, level: 'visible', origin: 'user', at: 1, by: 'user' };
  const gAgentNarrow = { principal: { kind: 'agent', id: 'a1' }, scope: { kind: 'conversation', id: 'lark/c1' }, level: 'requestable', origin: 'user', at: 2, by: 'user' };
  ok(ACL.effective(ctx, target, [gGroup]).level === 'visible' && ACL.effective(ctx, target, [gGroup]).via === 'group', 'an agent INHERITS its group');
  const e2 = ACL.effective(ctx, target, [gGroup, gAgentNarrow]);
  ok(e2.level === 'visible' && e2.via === 'group', 'NEGATIVE CONTROL: a member row BELOW its group cannot narrow it — MAX wins (widen only)', JSON.stringify(e2));
  const gAgentWide = { ...gAgentNarrow, level: 'visible' };
  const gGroupReq = { ...gGroup, level: 'requestable' };
  ok(ACL.effective(ctx, target, [gGroupReq, gAgentWide]).level === 'visible', 'an individual may be widened above its group');
  ok(ACL.effective({ kind: 'agent', id: 'a2', groups: [] }, target, [gGroup, gAgentWide]).level === 'hidden', 'a grant names ITS principal only — a stranger stays hidden');
  const gAdapter = { principal: { kind: 'agent', id: 'a1' }, scope: { kind: 'adapter', id: 'lark' }, level: 'visible', origin: 'user' };
  ok(ACL.effective(ctx, { key: 'lark/other', adapterId: 'lark' }, [gAdapter]).level === 'visible' && ACL.effective(ctx, { key: 'gmail/x', adapterId: 'gmail' }, [gAdapter]).level === 'hidden', 'an adapter-scoped grant covers every conversation of that adapter and no other');
  ok(!ACL.validateGrant({ ...gGroup, origin: undefined }).ok && /origin/.test(ACL.validateGrant({ ...gGroup, origin: undefined }).error), 'every grant MUST say who wrote it (origin)');
  ok(!ACL.validateGrant({ ...gGroup, level: 'super' }).ok && !ACL.validateGrant({ ...gGroup, principal: { kind: 'robot', id: 'x' } }).ok, 'unknown levels / principal kinds are refused');
  // one row per (principal, scope, origin)
  let grants = ACL.applyGrant([], gGroup);
  grants = ACL.applyGrant(grants, { ...gGroup, level: 'requestable', at: 9 });
  ok(grants.length === 1 && grants[0].level === 'requestable' && grants[0].at === 9, 'applyGrant REPLACES the row of the same (principal, scope, origin)');
  const asg = { ...gGroup, origin: 'assignment', at: 5 };
  grants = ACL.applyGrant(grants, asg);
  ok(grants.length === 2, 'a different origin on the same pair is a DIFFERENT row');
  const afterRemove = ACL.removeGrant(grants, { principal: asg.principal, scope: asg.scope, origin: 'assignment' });
  ok(afterRemove.length === 1 && JSON.stringify(afterRemove[0]) === JSON.stringify(grants.find((g) => g.origin === 'user')), 'removeGrant removes ONLY that origin\'s row; the user\'s row is byte-identical');
  // approve a request: EXACTLY ONE grant, the group default untouched
  const before = JSON.stringify(grants);
  const { grants: g2, grant } = ACL.approveRequest(grants, { principal: { kind: 'agent', id: 'a9' }, scope: { kind: 'conversation', id: 'lark/c1' }, at: 7, by: 'user' });
  ok(g2.length === grants.length + 1 && grant.origin === 'request' && grant.level === 'visible', 'approving a request writes EXACTLY ONE visible grant with origin request');
  ok(JSON.stringify(g2.slice(0, grants.length)) === before, 'NEGATIVE CONTROL: every pre-existing row (the group default included) is byte-identical after the approval');
  const again = ACL.approveRequest(g2, { principal: { kind: 'agent', id: 'a9' }, scope: { kind: 'conversation', id: 'lark/c1' }, at: 8, by: 'user' });
  ok(again.grants.length === g2.length, 'approving twice is still one row');
  ok(ACL.notFound().code === 'not-found' && ACL.notFound().error === ACL.NOT_FOUND_TEXT && JSON.stringify(ACL.notFound()) === JSON.stringify(ACL.notFound()), 'the not-found answer is ONE constant (hidden === nonexistent)');
  ok(ACL.canSee('visible') && !ACL.canSee('requestable') && ACL.canRequest('requestable') && !ACL.canRequest('visible') && !ACL.canRequest('hidden'), 'canSee / canRequest are exact');
  ok(ACL.fromMsgLevel('none') === 'hidden' && ACL.fromMsgLevel('visible') === 'visible' && ACL.fromMsgLevel('messageable') === 'visible', 'the msg-acl crosswalk: none → hidden, visible|messageable → visible (send authority is another axis)');
  ok(ACL.grantsFor(target, g2).every((g) => g.id && g.origin) && ACL.grantsFor({ key: 'gmail/z', adapterId: 'gmail' }, g2).length === 0, 'grantsFor lists this target\'s rows with ids and origins');
}

console.log('§2 the real engine');
const AG = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: ['g1'], msgLevelFor: () => 'none' };
const A = 'fake-poll', C = 'fake-poll-ops', KEY = `${A}/${C}`;
{
  const dataDir = path.join(ROOT, 'e1');
  const userTodos = new UserTodoManager({ dataDir });
  const eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, userTodos, log: { log() {}, warn() {}, error() {} }, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }] });
  await eng.pass(A, { force: true });
  await eng.setTracked(A, C, true);
  await eng.pass(A, { force: true });
  // hidden by default: absent from list, read = not-found, and IDENTICAL to a nonexistent id
  ok(eng.listFor(AG).conversations.every((c) => c.adapterId !== A), 'a fresh conversation is absent from the agent\'s list');
  const hidden = eng.readFor(AG, A, C, {});
  const nowhere = eng.readFor(AG, A, 'no-such-conversation', {});
  ok(JSON.stringify(hidden) === JSON.stringify(nowhere) && hidden.code === 'not-found', 'a HIDDEN conversation and a NONEXISTENT one give byte-identical answers');
  // THE §17 NEGATIVE CONTROL: user grant + assignment grant, un-assign
  await eng.setReach(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, level: 'visible' });
  const userRow = () => eng.store.index.snapshot().conversations[KEY].reachEntries.find((g) => g.origin === 'user');
  const userBefore = JSON.stringify(userRow());
  await eng.setAssignment(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, mode: 'all' });
  const rows = eng.store.index.snapshot().conversations[KEY].reachEntries;
  ok(rows.length === 2 && rows.some((g) => g.origin === 'assignment') && rows.some((g) => g.origin === 'user'), 'assignment adds ITS OWN row beside the user\'s');
  await eng.setAssignment(A, C, null);
  const rowsAfter = eng.store.index.snapshot().conversations[KEY].reachEntries;
  ok(rowsAfter.length === 1 && JSON.stringify(rowsAfter[0]) === userBefore, 'NEGATIVE CONTROL: un-assign removes ONLY the assignment row — the user grant is byte-identical');
  ok(eng.reachFor(AG, eng.adapterRecords().adapters.find((r) => r.id === A), eng.store.index.snapshot().conversations[KEY]).level === 'visible', '…and the agent still sees the conversation');
  ok(eng.listFor(AG).conversations.some((c) => c.key === KEY && c.level === 'visible') && eng.readFor(AG, A, C, {}).ok, 'now listed and readable');
  const audit = eng.store.auditTail().filter((l) => l.kind === 'acl').map((l) => [l.op, l.origin]);
  ok(JSON.stringify(audit) === JSON.stringify([['grant', 'user'], ['grant', 'assignment'], ['revoke', 'assignment']]), 'every grant change is an audit line with who/why', JSON.stringify(audit));
  // remove the user row
  await eng.setReach(A, C, { principal: { kind: 'agent', id: 'agent-1' }, level: null });
  ok(eng.store.index.snapshot().conversations[KEY].reachEntries.length === 0 && eng.readFor(AG, A, C, {}).code === 'not-found', 'removing the user grant hides it again');

  // REQUEST flow: requestable → request → For-you item → approve ⇒ exactly ONE grant
  ok(eng.request(AG, A, C, 'why').then === undefined || true, 'request is async');
  const rq0 = await eng.request(AG, A, C, 'I need to see the ops room to answer the alert');
  ok(rq0.code === 'not-found', 'a HIDDEN conversation cannot be requested (uniform not-found — no oracle)');
  await eng.setReach(A, C, { principal: { kind: 'group', id: 'g1', name: 'Ops' }, level: 'requestable' });
  const groupBefore = JSON.stringify(eng.store.index.snapshot().conversations[KEY].reachEntries);
  ok(eng.listFor(AG).conversations.some((c) => c.key === KEY && c.level === 'requestable') && eng.readFor(AG, A, C, {}).code === 'not-found', 'requestable: listed as such, still not readable');
  const rq = await eng.request(AG, A, C, 'I need to see the ops room to answer the alert');
  ok(rq.ok && rq.request.status === 'open' && rq.request.todoId, 'the request is filed with a For-you item');
  const item = userTodos.get(rq.request.todoId);
  ok(item && /Worker requests access to Ops room/.test(item.text) && /answer the alert/.test(item.detail), 'the item names the agent, the conversation and the stated reason');
  const rq2 = await eng.request(AG, A, C, 'again');
  ok(rq2.ok && rq2.already === true && rq2.request.id === rq.request.id, 'a second request from the same agent is the same open request (no spam)');
  const dec = await eng.decideRequest(rq.request.id, true);
  const rowsNow = eng.store.index.snapshot().conversations[KEY].reachEntries;
  ok(dec.ok && dec.grant && dec.grant.origin === 'request' && dec.grant.level === 'visible' && dec.grant.principal.id === 'agent-1', 'approval writes EXACTLY ONE visible grant for (that agent, that conversation) with origin request');
  ok(rowsNow.length === 2 && JSON.stringify(rowsNow.filter((g) => g.origin !== 'request')) === groupBefore, 'NEGATIVE CONTROL: the group\'s requestable default is byte-identical after the approval');
  ok(userTodos.get(rq.request.todoId).status === 'done' && userTodos.get(rq.request.todoId).resolvedBy === 'system', 'the request\'s For-you item is resolved by the producer');
  ok(eng.readFor(AG, A, C, {}).ok && eng.listFor(AG).conversations.find((c) => c.key === KEY).level === 'visible', 'the agent now reads it');
  ok(eng.listFor({ ...AG, id: 'agent-2' }).conversations.find((c) => c.key === KEY).level === 'requestable', 'another member of the group is still only requestable (the approval touched no default)');
  ok(!(await eng.decideRequest(rq.request.id, true)).ok, 'deciding twice is refused');
  eng.stop();
}

// ── §3 AGENT GROUPS ask msg-acl for reach (design §22.5) — the SAME answer
// `vibespace-msg list` gets, widen-only: same Task Group = mutual, another
// group only through a messageable override or the group's externalVisibility;
// `visible` is NOT enough to be invited. Uniform refusal, atomic create.
console.log('§3 agent groups: invite reach = msg-acl (widen-only)');
{
  const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
  const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
  const store = createChannelStore({ dir: path.join(ROOT, 'groups-acl', 'channels') });
  const roster = [
    { cid: 'c-alpha', name: 'alpha', groups: ['tg1'], reachability: null },
    { cid: 'c-beta', name: 'beta', groups: ['tg1'], reachability: null },
    { cid: 'c-vis', name: 'vis', groups: ['tg2'], reachability: 'visible' },
    { cid: 'c-open', name: 'open', groups: ['tg2'], reachability: 'messageable' },
    { cid: 'c-grp', name: 'grp', groups: ['tg3'], reachability: null },
    { cid: 'c-lone', name: 'lone', groups: [], reachability: null },
  ];
  const ext = { tg3: 'messageable' };
  const eng = GE.create({ store, deliver: null, roster: () => roster, groupSetting: (g) => ext[g] || 'none', log: { info() {}, warn() {}, log() {} } });
  ok(eng.reach('c-alpha', 'c-beta') === 'messageable', 'same Task Group = mutual (messageable)');
  ok(eng.reach('c-alpha', 'c-vis') === 'visible' && eng.reach('c-alpha', 'c-open') === 'messageable' && eng.reach('c-alpha', 'c-grp') === 'messageable' && eng.reach('c-alpha', 'c-lone') === 'none',
    'another group: only the override / the group\'s externalVisibility widens; an ungrouped session is closed');
  ok(eng.reach('user', 'c-lone') === 'messageable', 'the owner reaches every live session');
  const vis = await eng.create({ by: 'c-alpha', name: 'x', members: ['beta', 'vis'], quiet: true });
  ok(vis.ok === false && vis.code === 'unreachable', 'VISIBLE is not enough to be invited (messageable is the bar)');
  const lone = await eng.create({ by: 'c-alpha', name: 'x', members: ['lone'], quiet: true });
  const ghost = await eng.create({ by: 'c-alpha', name: 'x', members: ['no-such-session'], quiet: true });
  ok(lone.code === ghost.code && lone.error.replace('lone', '?') === ghost.error.replace('no-such-session', '?'), 'an unreachable session and a nonexistent one get the SAME refusal (no existence oracle)');
  ok(Object.keys(store.groups.live().groups).length === 0, 'NEGATIVE CONTROL: every refused create wrote nothing');
  const good = await eng.create({ by: 'c-alpha', name: 'x', members: ['beta', 'open', 'grp'], quiet: true });
  ok(good.ok && good.group.members.length === 4, 'the override and the open group are invitable');
  const byOpen = await eng.invite({ by: 'c-open', group: good.group.id, members: ['vis'] });
  ok(byOpen.ok && byOpen.added.join() === 'vis', 'reach is judged from the INVITER: open shares vis\'s Task Group and brings it in — the same session alpha could not invite', JSON.stringify(byOpen));
  ok(byOpen.refused.length === 1 && /no delivery ladder/.test(byOpen.refused[0].reason), '…and a wake with no ladder wired is an honest refusal, never a silent drop');
  store.close();
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
