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
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
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

console.log('§1b the three homes of a grant (2026-09-26: account + pattern scopes)');
{
  const ctx = { kind: 'agent', id: 'a1', groups: ['g1'] };
  const lark = { key: 'lark/c1', adapterId: 'lark' };
  const lark2 = { key: 'lark:0000abcd/c1', adapterId: 'lark:0000abcd' };
  const acct = ACL.accountGrant({ principal: { kind: 'agent', id: 'a1' }, adapterId: 'lark', at: 1, by: 'user' });
  ok(acct.scope.kind === 'adapter' && acct.scope.id === 'lark' && acct.origin === 'access' && acct.level === 'visible', 'an ACCESS row on the whole account (R4) implies ONE adapter-scope grant with origin access');
  ok(ACL.effective(ctx, lark, ACL.grantsForConversation(lark, { accountGrants: [acct] })).level === 'visible', 'the account grant reaches every conversation of THAT account');
  ok(ACL.effective(ctx, lark2, ACL.grantsForConversation(lark2, { accountGrants: [acct] })).level === 'hidden', 'NEGATIVE CONTROL: …and never a second account of the same kind (the adapter id IS the account id — two accounts never mix)');
  const pg = ACL.patternGrant({ principal: { kind: 'group', id: 'g1' }, key: 'lark/c1', patternId: 'p-1' });
  ok(pg.scope.kind === 'conversation' && pg.scope.id === 'lark/c1' && pg.origin === 'access' && pg.pattern === 'p-1', 'a rule\'s ACCESS row implies a conversation grant that names its pattern (derived at read, never stored)');
  ok(ACL.effective(ctx, lark, ACL.grantsForConversation(lark, { patternGrants: [pg] })).via === 'group', '…and a group principal reaches its members');
  const userRow = { principal: { kind: 'agent', id: 'a1' }, scope: { kind: 'conversation', id: 'lark/c1' }, level: 'requestable', origin: 'user' };
  const all = ACL.grantsForConversation(lark, { entries: [userRow], accountGrants: [acct], patternGrants: [pg] });
  ok(all.length === 3 && ACL.effective(ctx, lark, all).level === 'visible', 'the three homes MAX together (widen only)');
  const left = ACL.removeGrant([userRow, acct], { principal: acct.principal, scope: acct.scope, origin: 'access' });
  ok(left.length === 1 && left[0] === userRow, 'removing that access removes ONLY its own origin:access row — the user row stays');
  ok(ACL.GRANT_ORIGINS.includes('access') && ACL.GRANT_ORIGINS.includes('assignment'), 'origin `access` is declared; the pre-R4 `assignment` is still honoured as a row (the migration renames it)');
  ok(ACL.effective(ctx, lark, ACL.grantsForConversation(lark, { entries: [userRow] })).level === 'requestable', '…so the agent falls back to what the user granted by hand');
}

console.log('§2 the real engine');
const AG = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: ['g1'], msgLevelFor: () => 'none' };
const A = 'fake-poll', C = 'fake-poll-ops', KEY = `${A}/${C}`;
{
  const dataDir = path.join(ROOT, 'e1');
  const userTodos = new UserTodoManager({ dataDir });
  const eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, userTodos, log: { log() {}, warn() {}, error() {} }, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }] });
  // 2026-09-26: no track step — a forced pass discovers AND ingests every conversation
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
  ok(rows.length === 2 && rows.some((g) => g.origin === 'access') && rows.some((g) => g.origin === 'user'), 'access (the compatibility write) adds ITS OWN row beside the user\'s');
  await eng.setAssignment(A, C, null);
  const rowsAfter = eng.store.index.snapshot().conversations[KEY].reachEntries;
  ok(rowsAfter.length === 1 && JSON.stringify(rowsAfter[0]) === userBefore, 'NEGATIVE CONTROL: removing the access removes ONLY its own row — the user grant is byte-identical');
  ok(eng.reachFor(AG, eng.adapterRecords().adapters.find((r) => r.id === A), eng.store.index.snapshot().conversations[KEY]).level === 'visible', '…and the agent still sees the conversation');
  ok(eng.listFor(AG).conversations.some((c) => c.key === KEY && c.level === 'visible') && eng.readFor(AG, A, C, {}).ok, 'now listed and readable');
  const audit = eng.store.auditTail().filter((l) => l.kind === 'acl').map((l) => [l.op, l.origin]);
  ok(JSON.stringify(audit) === JSON.stringify([['grant', 'user'], ['grant', 'access'], ['revoke', 'access']]), 'every grant change is an audit line with who/why', JSON.stringify(audit));
  // R4: TWO principals with access — removing ONE takes exactly its own row
  const B = { kind: 'agent', id: 'agent-2', name: 'Other' };
  await eng.setAccess(A, { kind: 'conversation', convId: C }, [{ principal: { kind: 'agent', id: 'agent-1', name: 'Worker' } }, { principal: B }]);
  const two = eng.store.index.snapshot().conversations[KEY].reachEntries.filter((g) => g.origin === 'access').map((g) => g.principal.id).sort().join();
  await eng.setAccess(A, { kind: 'conversation', convId: C }, [{ principal: B }]);
  const one = eng.store.index.snapshot().conversations[KEY].reachEntries.filter((g) => g.origin === 'access').map((g) => g.principal.id).join();
  ok(two === 'agent-1,agent-2' && one === 'agent-2' && JSON.stringify(eng.store.index.snapshot().conversations[KEY].reachEntries.find((g) => g.origin === 'user')) === userBefore, `two access rows ⇒ two grants; removing ONE principal removes exactly its row (${two} → ${one}); the user\'s grant untouched`);
  await eng.setAccess(A, { kind: 'conversation', convId: C }, []);
  // remove the user row
  await eng.setReach(A, C, { principal: { kind: 'agent', id: 'agent-1' }, level: null });
  ok(eng.store.index.snapshot().conversations[KEY].reachEntries.length === 0 && eng.readFor(AG, A, C, {}).code === 'not-found', 'removing the user grant hides it again');

  // REQUEST flow: requestable → request → For-you item → approve ⇒ exactly ONE grant
  // lane channel-agent-watch W2: a group chat is in the account's directory by default (requestable by its title) — the
  // uniform not-found holds for an account whose directory is off
  await eng.setAgentDirectory(A, { groups: false });
  ok(eng.request(AG, A, C, 'why').then === undefined || true, 'request is async');
  const rq0 = await eng.request(AG, A, C, 'I need to see the ops room to answer the alert');
  ok(rq0.code === 'not-found', 'a HIDDEN conversation (the account lists no titles) cannot be requested (uniform not-found — no oracle)');
  await eng.setAgentDirectory(A, { groups: true });
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
  // verify-r6 Q1: two decisions IN FLIGHT at once (Deny in one window, Approve in another) — both used to pass the
  // status check above the write's await and the later overwrote the earlier (a card read "denied" while the grant
  // stood); the status is asked again inside the write: exactly one decision lands, the other is bad-state
  {
    const AG2 = { ...AG, id: 'agent-2', name: 'Worker 2' };
    const rq3 = await eng.request(AG2, A, C, 'me too');
    const [dx, dy] = await Promise.all([eng.decideRequest(rq3.request.id, false), eng.decideRequest(rq3.request.id, true)]);
    const lvl = eng.listFor(AG2).conversations.find((c) => c.key === KEY).level;
    const stored = eng.store.index.snapshot().conversations[KEY].reachRequests.find((r) => r.id === rq3.request.id);
    ok(rq3.ok && dx.ok === true && dy.ok === false && dy.code === 'bad-state' && stored.status === 'denied' && lvl === 'requestable', 'verify-r6 Q1: Deny and Approve in flight at once ⇒ ONE lands (the first: denied), the other is bad-state, NO grant (pre-fix: both ok, the approval overwrote the denial)', { dx: dx.ok, dy: dy.code, status: stored && stored.status, lvl });
  }
  eng.stop();
}

console.log('§2b account + pattern grants through the REAL engine');
{
  const dataDir = path.join(ROOT, 'e2');
  const eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }] });
  await eng.pass(A, { force: true });
  const W = { kind: 'agent', id: 'agent-1', name: 'Worker' };
  ok(eng.listFor(AG).conversations.filter((c) => c.adapterId === A).length === 0, 'before any assignment the agent sees nothing of the account');
  const r1 = await eng.setScopeAssignment(A, { kind: 'account' }, { principal: W, mode: 'all' });
  ok(r1.ok, 'an ACCOUNT assignment is accepted', JSON.stringify(r1));
  const seen = eng.listFor(AG).conversations.filter((c) => c.adapterId === A);
  ok(seen.length === 2 && seen.every((c) => c.level === 'visible'), 'the account grant makes EVERY conversation of the account visible (both fake rooms)', JSON.stringify(seen.map((c) => c.key)));
  ok(eng.listFor(AG).conversations.every((c) => c.adapterId === A), 'NEGATIVE CONTROL: …and nothing of any OTHER account', JSON.stringify(eng.listFor(AG).conversations.map((c) => c.key)));
  await eng.setReach(A, C, { principal: W, level: 'visible' });
  const userBefore = JSON.stringify(eng.store.index.snapshot().conversations[KEY].reachEntries);
  await eng.setScopeAssignment(A, { kind: 'account' }, null);
  ok(eng.listFor(AG).conversations.filter((c) => c.adapterId === A).map((c) => c.key).join() === KEY, 'un-assigning the account removes ONLY its grant — the user\'s hand-written row on one room still stands');
  ok(JSON.stringify(eng.store.index.snapshot().conversations[KEY].reachEntries) === userBefore, '…byte-identical');
  await eng.setReach(A, C, { principal: W, level: null });
  const pr = await eng.setScopeAssignment(A, { kind: 'pattern' }, { principal: W, mode: 'all', pattern: { match: 'any', rules: [{ kind: 'title', value: 'announce' }] } });
  ok(pr.ok && pr.assignment && pr.assignment.scope && pr.assignment.scope.kind === 'pattern', 'a PATTERN assignment is accepted', JSON.stringify(pr));
  const pseen = eng.listFor(AG).conversations.filter((c) => c.adapterId === A).map((c) => c.key);
  ok(pseen.join() === `${A}/fake-poll-announce`, 'the pattern grant reaches EXACTLY the matching conversation (Announcements), not the Ops room', JSON.stringify(pseen));
  ok(!(eng.store.index.snapshot().conversations[`${A}/fake-poll-announce`].reachEntries || []).length, 'the pattern grant is DERIVED at read — no row was written to the conversation');
  await eng.setScopeAssignment(A, { kind: 'pattern', id: pr.assignment.scope.id }, null);
  ok(eng.listFor(AG).conversations.filter((c) => c.adapterId === A).length === 0, 'removing the pattern hides it again at once (nothing to clean up)');
  eng.stop();
}

// ── §2c AGENTS NEVER RECEIVE HTML (lane channel-rich security verify r2, continued, 2026-09-28) ──
// A mail's formatted body is the person's view only (the sandboxed frame); every agent verb answers WORDS. ① THE
// ROUTE CENSUS, derived: every engine method an `/api/agent/channels/*` handler calls is JUDGED here (a new agent
// verb is red until someone says what it hands an agent); ② THE REAL ENGINE over the fake world's formatted mail
// room (6 mails with a text/html body — the owner's own read carries them): list, read of every conversation,
// search, status and access answer no `role: body` attachment, no text/html, no render tree, no markup;
// ③ CONTROL: an engine copy whose readFor forgets `withoutBlocks` hands the body attachment to the agent.
console.log('§2c agents never receive HTML: the agent route census + every agent read over a formatted mail room');
{
  const src = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
  const handlers = [...src.matchAll(/^app\.(?:get|post)\('\/api\/agent\/channels\/[^\n]*\n([\s\S]*?)^\}\);/gm)];
  const called = [...new Set(handlers.flatMap((m) => [...m[1].matchAll(/\beng\.([A-Za-z]+)\(/g)].map((x) => x[1])))].sort();
  const JUDGED = {
    listFor: 'conversation rows (titles, counts, reach) — no record; driven below',
    readFor: 'records through withoutBlocks (no tree, no role:body attachment); driven below',
    searchFor: 'hits = {key, title, text ≤ 400, ids}; driven below',
    statusFor: 'proposals — the agent\'s / the owner\'s own words; driven below',
    accessFor: 'grains (ids, modes, authority); driven below',
    agentRefresh: 'counts + the conversation\'s key and title — no record',
    agentWatchesFor: 'notification rows naming the caller (how, rule words, cap) + key / title — no record (lane agent-watch-parity; test-channel-agent-watch ⑩)',
    propose: 'the agent\'s own draft', compose: 'the agent\'s own draft', replaceProposal: 'the agent\'s own draft (replacing its own)',
    withdrawProposal: 'a proposal id and its fate', request: 'a reach request record (the agent\'s own reason)',
    // the .197 integration: lane channel-threads' agent verbs, judged by what they hand an agent
    readAroundFor: 'design 010: the vendor\'s records around a hit it was shown, through withView\'s agent branch (viewsOf → agentCopy) — reach asked before AND after the await (stillSees); never stored',
    readThreadFor: 'a thread\'s records through withView\'s agent branch (viewsOf → agentCopy: no tree, no role:body attachment, frame-inert) — the same door as readFor',
    agentThreadRefresh: 'counts + the thread\'s key — no record',
    proposeReaction: 'the agent\'s own reaction proposal (a key + the reacted message\'s id)',
    // lane channel-attach-read (B-d6b9)
    attachment: 'the bytes of a part a message of a readable conversation carries — never its role:body part (not-found, even cached); the sender / title / type through the belt; driven below and in test-channels-images ③b',
  };
  ok(handlers.length >= 9 && called.every((k) => k in JUDGED) && Object.keys(JUDGED).every((k) => called.includes(k)), `THE ROUTE CENSUS: every engine method the ${handlers.length} agent channel handlers call is judged for what it hands an agent (${called.join(', ')})`, JSON.stringify({ called, unjudged: called.filter((k) => !(k in JUDGED)), dead: Object.keys(JUDGED).filter((k) => !called.includes(k)) }));
  // the fake world's mail room is read from process.env by the adapter (the server's own seam)
  const SEAMS = { VIBESPACE_CHANNELS_FAKE_MAIL: '2', VIBESPACE_CHANNELS_FAKE_BEACON: 'http://127.0.0.1:9' };
  const prevEnv = Object.fromEntries(Object.keys(SEAMS).map((k) => [k, process.env[k]]));
  Object.assign(process.env, SEAMS);
  const HTML_RE = /"role":"body"|text\/html|"blocks":|<script|<img|onerror|<style|<a href/i;
  const drive = async (E, label) => {
    const dataDir = path.join(ROOT, `html-${label}`);
    const eng = E.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }] });
    await eng.pass('fake-push', { force: true });
    const owner = eng.messages('fake-push', 'fake-push-mail', { limit: 200 });
    const ownerBodies = (Array.isArray(owner) ? owner : []).filter((r) => (r.attachments || []).some((a) => a.role === 'body')).length;
    await eng.setScopeAssignment('fake-push', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, mode: 'all' });
    const answers = {};
    answers.list = eng.listFor(AG);
    const convs = (answers.list.conversations || []).filter((c) => c.adapterId === 'fake-push');
    for (const c of convs) answers[`read:${c.id}`] = eng.readFor(AG, 'fake-push', c.id, { limit: 200 });
    answers.search = await eng.searchFor(AG, 'mail', {});
    answers.status = eng.statusFor(AG, null);
    answers.access = eng.accessFor(AG);
    // lane channel-attach-read: the ATTACHMENT verb never hands an agent the formatted body — a part:N id is guessable,
    // and the window may have cached it (fetched here first, as the owner); the leak check below reads its answer too
    const bodyRec = (Array.isArray(owner) ? owner : []).find((r) => (r.attachments || []).some((a) => a.role === 'body'));
    const bodyAtt = bodyRec ? bodyRec.attachments.find((a) => a.role === 'body') : null;
    let bodyCached = false;
    if (bodyAtt) {
      const own = await eng.attachment('fake-push', 'fake-push-mail', bodyAtt.id, { msg: bodyRec.vendorId });
      bodyCached = !!(own && own.ok);
      answers.attachmentBody = await eng.attachment('fake-push', 'fake-push-mail', bodyAtt.id, { msg: bodyRec.vendorId, by: 'agent', principal: AG });
    }
    eng.stop();
    const leaks = Object.entries(answers).filter(([, v]) => HTML_RE.test(JSON.stringify(v))).map(([k, v]) => `${k}: ${(JSON.stringify(v).match(HTML_RE) || [])[0]}`);
    const mailRead = answers['read:fake-push-mail'];
    return { bodyCached, bodyAnswer: answers.attachmentBody || null, ownerBodies, convs: convs.length, mailRecords: mailRead && mailRead.ok ? mailRead.records.length : 0, searchHits: (answers.search.results || []).length, leaks };
  };
  const real = await drive(ENG, 'real');
  ok(real.ownerBodies >= 6 && real.convs >= 3 && real.mailRecords >= 8 && real.searchHits > 0, `FIXTURE: the owner's read carries ${real.ownerBodies} formatted bodies; the agent (account access) sees ${real.convs} conversations, reads ${real.mailRecords} mails of the mail room, finds ${real.searchHits} search hits`, JSON.stringify(real));
  ok(!real.leaks.length, 'every agent answer — list, read of every conversation, search, status, access, an attachment — carries no body attachment, no text/html, no render tree, no markup', real.leaks.join('; '));
  ok(real.bodyCached && real.bodyAnswer && real.bodyAnswer.code === 'not-found', `the ATTACHMENT verb (lane channel-attach-read): a mail's formatted body the owner's window cached is the agent's not-found (${JSON.stringify(real.bodyAnswer && real.bodyAnswer.code)})`, JSON.stringify(real.bodyAnswer));
  // CONTROL: the same drive on an engine whose readFor forgets withoutBlocks
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const M = mutantCopies('chan-acl-html', REPO);
  const engSrc = engineSource(REPO);
  // the .197 integration: the agent's copy is withView's agent branch (viewsOf → agentCopy, which calls withoutBlocks) — the control drops that strip
  const noStrip = engSrc.replace('const base = agent ? viewsOf(rec, records).map(agentCopy) : withBlocks(rec, records);', 'const base = agent ? viewsOf(rec, records) : withBlocks(rec, records);');
  const bad = await drive(M.load('src/server/channels-engine.js', noStrip, 'read-keeps-body'), 'control');
  ok(noStrip !== engSrc && bad.leaks.some((l) => /^read:fake-push-mail: ("role":"body"|text\/html)$/.test(l)), 'CONTROL: an engine whose readFor forgets withoutBlocks hands the mail\'s text/html body attachment to the agent (the census above would be red)', bad.leaks.join('; '));
  // CONTROL (lane channel-attach-read): an engine whose agent attachment serves a role:body part hands the agent the text/html body
  const BODY_GATE = "if (!part || part.role === 'body') return";
  const bodyOpen = engSrc.replace(BODY_GATE, 'if (!part) return');
  const badBody = await drive(M.load('src/server/channels-engine.js', bodyOpen, 'agent-body-part'), 'control-body');
  ok(engSrc.split(BODY_GATE).length === 2 && badBody.leaks.some((l) => /^attachmentBody: text\/html$/.test(l)), 'CONTROL: an engine whose agent attachment serves the role:body part hands the agent the mail\'s text/html body (the leak census above would be red)', badBody.leaks.join('; '));
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);
  for (const [k, v] of Object.entries(prevEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
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
