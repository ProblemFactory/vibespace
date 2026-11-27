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
//   §P (B-dfa4 r5450, hold (i)) accessFor reads a conversation's grain only when a row of its own names it: PARITY with the
//      release's whole walk over every kind and asker, the grains read counted; RED: a kind left out of the own-keys set.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
// lane grants-unify: a conversation's OWN reach rows (its access, the owner's, approved requests) are rows of THE grants store —
// read back through the engine's reach view (the account's and a rule's derived rows left out)
const ownRows = (eng, key) => (eng.reachView(eng.store.index.peek(key)) || { entries: [] }).entries.filter((g) => g.scope && g.scope.kind === 'conversation' && !g.derived);

import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

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

// ── §1c 完全信任 (lane api-tier-write-all, 2026-10-13): the API tier is widen-only up to write-all; everyone NEVER holds it ──
console.log('§1c the API tier: widen-only none → read → write-ask → write-auto → write-all; All agents never hold write-all');
{
  const { Module } = require('module');
  const SRC = fs.readFileSync(path.join(REPO, 'src/channel-acl.js'), 'utf8');
  const load = (src) => { const f = path.join(REPO, 'src/channel-acl.js'); const m = new Module(f); m.filename = f; m.paths = Module._nodeModulePaths(path.dirname(f)); m._compile(src, f); return m.exports; };
  const mutate = (src, a, b) => { if (!src.includes(a)) throw new Error(`mutant anchor missing: ${a.slice(0, 80)}`); return editAnchor(src, a, b, "the text handed to mutate()"); };
  const row = (kind, id, api) => ({ principal: { kind, id, name: kind === 'everyone' ? null : id }, scope: { kind: 'adapter', id: 'L' }, level: 'hidden', origin: 'api', at: 1, by: 'user', api });
  const legs = [
    ['the order is none < read < write-ask < write-auto < write-all, and the MAX over the rows wins (agent write-all beats its group\'s read)', (A) => A.API_TIERS.join() === 'none,read,write-ask,write-auto,write-all' && A.effectiveApi({ kind: 'agent', id: 'c1', groups: ['g1'] }, 'L', [row('group', 'g1', 'read'), row('agent', 'c1', 'write-all')]).tier === 'write-all' && A.effectiveApi({ kind: 'agent', id: 'c1', groups: ['g1'] }, 'L', [row('agent', 'c1', 'write-all'), row('group', 'g1', 'write-ask')]).tier === 'write-all',
      ["const API_RANK = Object.freeze({ none: 0, read: 1, 'write-ask': 2, 'write-auto': 3, 'write-all': 4 });", "const API_RANK = Object.freeze({ none: 0, read: 1, 'write-ask': 2, 'write-auto': 3, 'write-all': 0 });"]],
    ['a row giving write-all to All agents is refused by name write_all_named_only (validateGrant); one agent (a conversation) is accepted', (A) => { const v = A.validateGrant(row('everyone', '*', 'write-all')); return v.ok === false && /^write_all_named_only:/.test(v.error) && A.validateGrant(row('agent', 'c1', 'write-all')).ok === true; },
      ["  if (g.api === API_NAMED_ONLY && p.kind !== 'agent') return", "  if (false) return"]],
    // tier-verify M1: a group's members join by cwd, so a group row reaches conversations nobody named — RED = c53bffc3b's everyone-only check
    ['a row giving write-all to a Task Group is refused by name write_all_named_only (validateGrant); a rule (pattern) is no principal at all', (A) => { const v = A.validateGrant(row('group', 'T-1', 'write-all')); return v.ok === false && /^write_all_named_only:/.test(v.error) && A.validateGrant(row('group', 'T-1', 'write-auto')).ok === true && A.validateGrant(row('pattern', 'p1', 'write-all')).ok === false; },
      ["  if (g.api === API_NAMED_ONLY && p.kind !== 'agent') return", "  if (g.api === API_NAMED_ONLY && p.kind === 'everyone') return"]],
    ['a STORED everyone write-all row (a hand edit, an old import) answers write-auto at most — a sensitive call still asks', (A) => A.effectiveApi({ kind: 'agent', id: 'c9' }, 'L', [{ ...row('everyone', '*', 'write-auto'), api: 'write-all' }]).tier === 'write-auto',
      ["const api = g.api === API_NAMED_ONLY && g.principal.kind !== 'agent' ? 'write-auto' : g.api;", "const api = g.api;"]],
    ['a STORED Task Group write-all row answers write-auto at most to every member; a named agent row keeps write-all', (A) => A.effectiveApi({ kind: 'agent', id: 'c9', groups: ['T-1'] }, 'L', [{ ...row('group', 'T-1', 'write-auto'), api: 'write-all' }]).tier === 'write-auto' && A.effectiveApi({ kind: 'agent', id: 'c1', groups: ['T-1'] }, 'L', [{ ...row('group', 'T-1', 'write-auto'), api: 'write-all' }, row('agent', 'c1', 'write-all')]).tier === 'write-all',
      ["const api = g.api === API_NAMED_ONLY && g.principal.kind !== 'agent' ? 'write-auto' : g.api;", "const api = g.api === API_NAMED_ONLY && g.principal.kind === 'everyone' ? 'write-auto' : g.api;"]],
  ];
  for (const [name, judge, [a, b]] of legs) {
    ok(judge(ACL), name);
    let red; try { red = !judge(load(mutate(SRC, a, b))); } catch (e) { red = `threw: ${e.message}`; }
    ok(red === true, `CONTROL: ${name} — without its rule the leg goes red`, red);
  }
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
  const userRow = () => ownRows(eng, KEY).find((g) => g.origin === 'user');
  const userBefore = JSON.stringify(userRow());
  await eng.setAssignment(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, mode: 'all' });
  const rows = ownRows(eng, KEY);
  ok(rows.length === 2 && rows.some((g) => g.origin === 'access') && rows.some((g) => g.origin === 'user'), 'access (the compatibility write) adds ITS OWN row beside the user\'s');
  await eng.setAssignment(A, C, null);
  const rowsAfter = ownRows(eng, KEY);
  ok(rowsAfter.length === 1 && JSON.stringify(rowsAfter[0]) === userBefore, 'NEGATIVE CONTROL: removing the access removes ONLY its own row — the user grant is byte-identical');
  ok(eng.reachFor(AG, eng.adapterRecords().adapters.find((r) => r.id === A), eng.store.index.snapshot().conversations[KEY]).level === 'visible', '…and the agent still sees the conversation');
  ok(eng.listFor(AG).conversations.some((c) => c.key === KEY && c.level === 'visible') && eng.readFor(AG, A, C, {}).ok, 'now listed and readable');
  const audit = eng.store.auditTail().filter((l) => l.kind === 'acl').map((l) => [l.op, l.origin]);
  ok(JSON.stringify(audit) === JSON.stringify([['grant', 'user'], ['grant', 'access'], ['revoke', 'access']]), 'every grant change is an audit line with who/why', JSON.stringify(audit));
  // R4: TWO principals with access — removing ONE takes exactly its own row
  const B = { kind: 'agent', id: 'agent-2', name: 'Other' };
  await eng.setAccess(A, { kind: 'conversation', convId: C }, [{ principal: { kind: 'agent', id: 'agent-1', name: 'Worker' } }, { principal: B }]);
  const two = ownRows(eng, KEY).filter((g) => g.origin === 'access').map((g) => g.principal.id).sort().join();
  await eng.setAccess(A, { kind: 'conversation', convId: C }, [{ principal: B }]);
  const one = ownRows(eng, KEY).filter((g) => g.origin === 'access').map((g) => g.principal.id).join();
  ok(two === 'agent-1,agent-2' && one === 'agent-2' && JSON.stringify(ownRows(eng, KEY).find((g) => g.origin === 'user')) === userBefore, `two access rows ⇒ two grants; removing ONE principal removes exactly its row (${two} → ${one}); the user\'s grant untouched`);
  await eng.setAccess(A, { kind: 'conversation', convId: C }, []);
  // remove the user row
  await eng.setReach(A, C, { principal: { kind: 'agent', id: 'agent-1' }, level: null });
  ok(ownRows(eng, KEY).length === 0 && eng.readFor(AG, A, C, {}).code === 'not-found', 'removing the user grant hides it again');

  // REQUEST flow: requestable → request → For-you item → approve ⇒ exactly ONE grant
  // lane channel-agent-watch W2: a group chat is in the account's directory by default (requestable by its title) — the
  // uniform not-found holds for an account whose directory is off
  await eng.setAgentDirectory(A, { groups: false });
  ok(eng.request(AG, A, C, 'why').then === undefined || true, 'request is async');
  const rq0 = await eng.request(AG, A, C, 'I need to see the ops room to answer the alert');
  ok(rq0.code === 'not-found', 'a HIDDEN conversation (the account lists no titles) cannot be requested (uniform not-found — no oracle)');
  await eng.setAgentDirectory(A, { groups: true });
  await eng.setReach(A, C, { principal: { kind: 'group', id: 'g1', name: 'Ops' }, level: 'requestable' });
  const groupBefore = JSON.stringify(ownRows(eng, KEY));
  ok(eng.listFor(AG).conversations.some((c) => c.key === KEY && c.level === 'requestable') && eng.readFor(AG, A, C, {}).code === 'not-found', 'requestable: listed as such, still not readable');
  const rq = await eng.request(AG, A, C, 'I need to see the ops room to answer the alert');
  ok(rq.ok && rq.request.status === 'open' && rq.request.todoId, 'the request is filed with a For-you item');
  const item = userTodos.get(rq.request.todoId);
  ok(item && /Worker requests access to Ops room/.test(item.text) && /answer the alert/.test(item.detail), 'the item names the agent, the conversation and the stated reason');
  const rq2 = await eng.request(AG, A, C, 'again');
  ok(rq2.ok && rq2.already === true && rq2.request.id === rq.request.id, 'a second request from the same agent is the same open request (no spam)');
  const dec = await eng.decideRequest(rq.request.id, true);
  const rowsNow = ownRows(eng, KEY);
  ok(dec.ok && dec.grant && dec.grant.origin === 'request' && dec.grant.level === 'visible' && dec.grant.principal.id === 'agent-1', 'approval writes EXACTLY ONE visible grant for (that agent, that conversation) with origin request');
  ok(rowsNow.length === 2 && JSON.stringify(rowsNow.filter((g) => g.origin !== 'request')) === groupBefore, 'NEGATIVE CONTROL: the group\'s requestable default is byte-identical after the approval');
  ok(userTodos.get(rq.request.todoId).status === 'done' && userTodos.get(rq.request.todoId).resolvedBy === 'allowed', 'the request\'s For-you item is resolved by the producer — `allowed` (lane chat-needs-you-card: the card\'s record says «approved»)');
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
  const userBefore = JSON.stringify(ownRows(eng, KEY));
  await eng.setScopeAssignment(A, { kind: 'account' }, null);
  ok(eng.listFor(AG).conversations.filter((c) => c.adapterId === A).map((c) => c.key).join() === KEY, 'un-assigning the account removes ONLY its grant — the user\'s hand-written row on one room still stands');
  ok(JSON.stringify(ownRows(eng, KEY)) === userBefore, '…byte-identical');
  await eng.setReach(A, C, { principal: W, level: null });
  const pr = await eng.setScopeAssignment(A, { kind: 'pattern' }, { principal: W, mode: 'all', pattern: { match: 'any', rules: [{ kind: 'title', value: 'announce' }] } });
  ok(pr.ok && pr.assignment && pr.assignment.scope && pr.assignment.scope.kind === 'pattern', 'a PATTERN assignment is accepted', JSON.stringify(pr));
  const pseen = eng.listFor(AG).conversations.filter((c) => c.adapterId === A).map((c) => c.key);
  ok(pseen.join() === `${A}/fake-poll-announce`, 'the pattern grant reaches EXACTLY the matching conversation (Announcements), not the Ops room', JSON.stringify(pseen));
  ok(!ownRows(eng, `${A}/fake-poll-announce`).length, 'the pattern grant is DERIVED at read — no row was written to the conversation');
  await eng.setScopeAssignment(A, { kind: 'pattern', id: pr.assignment.scope.id }, null);
  ok(eng.listFor(AG).conversations.filter((c) => c.adapterId === A).length === 0, 'removing the pattern hides it again at once (nothing to clean up)');
  eng.stop();
}

// ── §2d THE NEW SESSION FORM'S TICK (lane new-session-form): a tick in 「账号 · 以你的身份」 writes ONE access row
// {principal: the new conversation, authority: draft} into the SAME account grain the Channels window writes, through the
// same whole-list access write with the stamp it read (src/new-session-spec.js withCreateAccess) — no second store, and
// the conversation then reaches the account through channel-acl's own effective() like any granted agent.
console.log('§2d the New Session form\'s create-time access row (the same store, the same verdict)');
{
  const S = require(path.join(REPO, 'src/new-session-spec.js'));
  const F = require(path.join(REPO, 'src/channel-filter.js'));
  const dataDir = path.join(ROOT, 'e-ns');
  const eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, liveSessions: () => [{ cid: 'cid-new', name: 'New one', groups: [] }, { cid: 'agent-1', name: 'Worker', groups: ['T-ir'] }] });
  await eng.pass(A, { force: true });
  const NEW = { kind: 'agent', id: 'cid-new', name: 'New one', groups: [], msgLevelFor: () => 'none' };
  const GRP = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: ['T-ir'], msgLevelFor: () => 'none' };
  const grain = () => eng.adapterView(eng.adapterRecords().adapters.find((r) => r.id === A)).accountGrain;
  const g0 = await eng.setAccess(A, { kind: 'account' }, [{ principal: { kind: 'group', id: 'T-ir', name: 'IR' }, authority: 'draft' }]);
  ok(g0.ok && eng.listFor(GRP).conversations.some((c) => c.adapterId === A) && !eng.listFor(NEW).conversations.some((c) => c.adapterId === A), 'before the tick: the group\'s member reaches the account, the new conversation does not (everything defaults to hidden)');
  const before = grain();
  const list = S.withCreateAccess(before.access, 'cid-new');
  const w = await eng.setAccess(A, { kind: 'account' }, list, { base: F.grainStamp({ access: before.access, watchers: before.watchers }) });
  ok(w.ok, 'the tick\'s whole list (the stored rows + ONE agent row) is accepted by the access write, the stamp it read as `base`', JSON.stringify(w));
  const after = grain().access;
  ok(after.length === 2 && after.some((r) => r.principal.kind === 'group' && r.principal.id === 'T-ir' && r.authority === 'draft') && after.some((r) => r.principal.kind === 'agent' && r.principal.id === 'cid-new' && r.authority === 'draft'), 'the grain now holds the group\'s row untouched beside the conversation\'s draft row', JSON.stringify(after));
  const seen = eng.listFor(NEW).conversations.filter((c) => c.adapterId === A);
  ok(seen.length > 0 && seen.every((c) => c.level === 'visible'), 'the new conversation now sees the account\'s conversations — channel-acl\'s own verdict, through its own row', JSON.stringify(seen.map((c) => c.key)));
  ok(S.withCreateAccess(grain().access, 'cid-new') === null, 'a second tick writes nothing (the conversation already holds its row)');
  const stale = await eng.setAccess(A, { kind: 'account' }, S.withCreateAccess(before.access, 'cid-other'), { base: F.grainStamp({ access: before.access, watchers: before.watchers }) });
  ok(!stale.ok && stale.code === 'grain-changed', 'CONTROL: a tick built on a list that moved since its read is refused BY NAME (the page reads again once) — never written over', JSON.stringify(stale));
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
    // lane channels-proposals-recall
    proposalsListFor: 'the agent\'s own proposals as rows (ids, kind, state, its conversation key through agentIdsOf, a one-line summary through the belt) — the set statusFor reads',
    proposeRecall: 'the agent\'s own recall proposal (the message id + a quote of the user\'s own message through the belt; agentIdsOf)',
    // lane channel-attach-read (B-d6b9)
    attachment: 'the bytes of a part a message of a readable conversation carries — never its role:body part (not-found, even cached); the sender / title / type through the belt; driven below and in test-channels-images ③b',
    // lane pod-oauth-callback: an account TYPE, never a conversation (test-architecture §65 NO_CONVERSATION)
    connectOffer: 'a vendor type\'s label, glyph, whether a company app is offered, how many accounts of it hold a sign-in — no conversation, nothing of one; the touch it leaves is the chat\'s Connect row',
    connectOffers: 'the types no account of which holds a sign-in ({kind, label, accounts}) — `list`\'s not-connected line',
    // lane channel-direct-send-sync
    // lane bl-msg B-da74 / B-ae13 (restack-411)
    resendRest: 'the drafting agent\'s rest of its OWN sent proposal: a NEW proposal from the kept bytes, always for the user\'s review (forceReview) — its answer is propose\'s (the agent\'s own draft); a caller who is not the drafter = the uniform not-found',
    withdrawWatchRequest: 'the asker\'s OWN open wake request taken back: {id, status: withdrawn, decidedAt} — another agent, or a decided request, = refused by name; no record of a conversation',
    collectReceipt: 'the drafting agent reads its OWN direct send\'s receipt inline (receiptText = the rendered block; marks receipt.road:\'inline\') — a caller who is not the drafter = the uniform not-found',
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

// ═══ §P accessFor DECIDES BY THE ROW's OWN ROWS FIRST — PARITY (B-dfa4, 主开发 r5450, hold (i): 1.1–1.3 s on the owner's hub) ═══
// The list form of an agent's `vibespace-channels status` read every conversation of every account through its whole grain only
// to ask whether that grain holds access rows; it now reads a conversation's grain only when the grants door names it in a row of
// its own. THE LAW IS PARITY: no answer changes for any asker. BOTH ROADS over the same world — the release's whole walk (a closed
// world of copies: the engine requiring channels-access with the release's line) and the new one — every kind the stack knows: a
// row of its own (with its watcher), the owner's reach row (#user), a legacy assignment, an account grant, a rule's grant, a Task Group grant with its «除了»
// member, a plain Task Group grant, All agents, an account no row names the asker on, a disabled account, a directory's single and
// group rows; askers: the named agent, another member of the group, an agent of no group, an asker that is no agent. The answers are
// EQUAL row for row; the grains read are COUNTED (the cure's proof is the count, never a clock). RED CONTROL: a kind left out of the
// door's own-keys set (the conversations' own access rows) — a conversation with access goes missing, RED by name.
console.log('§P accessFor reads a conversation\'s grain only when a row of its own names it — parity with the release\'s whole walk, every kind, every asker; the grains read counted');
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MP = mutantCopies('chan-acl-access-parity', REPO);
  const engSrcP = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');   // its own name: §2c's engSrc (engineSource) carries two older unanchored controls, which test-suite-files-parse counts by the name a file read assigns
  const accSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf-8');
  const grSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-grants.js'), 'utf-8');
  const GATE = "      for (const en of store.index.rowsOf(rec.id)) { accessStats.rows++; if (en && en.adapterId === rec.id && own.has(en.key)) { accessStats.grains++; const g = convGrainOf(en); if (g.access.length) push('conversation', g, { key: agentId(en.key), title: agentTitle(en, en.id) }); } }";
  const RELEASE = "      for (const en of store.index.rowsOf(rec.id)) { accessStats.rows++; if (en && en.adapterId === rec.id) { accessStats.grains++; const g = convGrainOf(en); if (g.access.length) push('conversation', g, { key: agentId(en.key), title: agentTitle(en, en.id) }); } }";
  // the release's road: the engine requiring a copy of channels-access with the release's line (the whole walk)
  const accRelPath = MP.write('src/server/channels-access.js', editAnchor(accSrc, GATE, RELEASE, 'src/server/channels-access.js'), 'release-walk', { name: 'access-release-walk' });
  const ENGREL = MP.load('src/server/channels-engine.js', editAnchor(engSrcP, "require('./channels-access.js')", `require(${JSON.stringify(accRelPath)})`, 'src/server/channels-engine.js'), 'release-walk-engine');
  // the red control: the door's own-keys set without the conversations' own ACCESS rows (only the owner's and approved requests' rows kept)
  const OWNKEYS = "    if (!ix.ownKeys) ix.ownKeys = new Set([...ix.rows.keys()].filter((k) => k.startsWith('conversation:')).map((k) => k.slice('conversation:'.length).replace(/#(user|request)$/, '')));";
  const grRedPath = MP.write('src/server/channels-grants.js', editAnchor(grSrc, OWNKEYS, "    if (!ix.ownKeys) ix.ownKeys = new Set([...ix.rows.keys()].filter((k) => k.startsWith('conversation:') && /#(user|request)$/.test(k)).map((k) => k.slice('conversation:'.length).replace(/#(user|request)$/, '')));", 'src/server/channels-grants.js'), 'own-keys-narrow', { name: 'grants-own-keys-narrow' });
  const ENGRED = MP.load('src/server/channels-engine.js', editAnchor(engSrcP, "require('./channels-grants.js')", `require(${JSON.stringify(grRedPath)})`, 'src/server/channels-engine.js'), 'own-keys-narrow-engine');
  const AGT = { kind: 'agent', id: 'agent-1', name: 'Worker' }, AGT2 = { kind: 'agent', id: 'agent-2', name: 'Other' };
  const GRP = { kind: 'group', id: 'g1', name: 'Ops' }, ALL = { kind: 'everyone', id: '*' };
  const LIVE = [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }, { cid: 'agent-2', name: 'Other', groups: ['g1'] }, { cid: 'agent-3', name: 'Lone', groups: [] }];
  const ASKERS = [['the named agent (a member of g1)', { kind: 'agent', id: 'agent-1', name: 'Worker', groups: ['g1'], msgLevelFor: () => 'none' }],
    ['another member of g1', { kind: 'agent', id: 'agent-2', name: 'Other', groups: ['g1'], msgLevelFor: () => 'none' }],
    ['an agent of no group', { kind: 'agent', id: 'agent-3', name: 'Lone', groups: [], msgLevelFor: () => 'none' }],
    ['an asker that is no agent', { kind: 'user', id: 'owner', name: 'Owner', groups: [] }]];
  const acct = (id, enabled, extra = {}) => ({ id, kind: 'fake-poll', label: id, enabled, options: {}, state: {}, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, ...extra });
  const mkE = (E, dataDir) => E.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, liveSessions: () => LIVE });
  const base = path.join(ROOT, 'parity-world');
  fs.mkdirSync(path.join(base, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(base, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [acct('mail', true, { agentDirectory: { groups: true, singles: true } }), acct('mail2', true), acct('mail3', false)] }));
  const said = [];
  {
    const e0 = mkE(ENG, base);
    const ix = e0.store.index;
    const T0 = Date.UTC(2026, 10, 27, 12, 0, 0);
    await ix.update(() => {
      for (let i = 0; i < 320; i++) Object.assign(ix.entry('mail', `c-${i}`), { title: i % 40 === 0 ? `Rule room ${i}` : `Thread ${i}`, kind: i % 3 === 0 ? 'dm' : 'group', lastAt: T0 - i * 60e3, unread: 0, listedAt: T0 - 86400e3 });
      for (let i = 0; i < 60; i++) Object.assign(ix.entry('mail2', `d-${i}`), { title: `Other ${i}`, kind: 'group', lastAt: T0 - i * 60e3, unread: 0, listedAt: T0 - 86400e3 });
      for (let i = 0; i < 20; i++) Object.assign(ix.entry('mail3', `x-${i}`), { title: `Off ${i}`, kind: 'group', lastAt: T0 - i * 60e3, unread: 0, listedAt: T0 - 86400e3 });
      ix.entry('mail', 'c-7', { create: false }).assignment = { principal: AGT, notify: 'wake', at: T0 };   // a LEGACY assignment (watchers only, never access)
    });
    const C = (convId) => ({ kind: 'conversation', convId });
    said.push(['own row', await e0.setAccess('mail', C('c-1'), [{ principal: AGT, authority: 'draft' }])]);
    said.push(['own watcher', await e0.setWatchers('mail', C('c-1'), [{ principal: AGT, notify: 'wake' }])]);
    said.push(['account grant', await e0.setAccess('mail', { kind: 'account' }, [{ principal: AGT2, authority: 'draft' }])]);
    said.push(['rule grant', await e0.setScopeAssignment('mail', { kind: 'pattern' }, { principal: AGT, mode: 'all', pattern: { match: 'any', rules: [{ kind: 'title', value: 'Rule room' }] } })]);
    said.push(['group with «除了»', await e0.setAccess('mail', C('c-2'), [{ principal: GRP, authority: 'draft' }], { except: [{ kind: 'conversation', key: 'agent-1' }] })]);
    said.push(['plain group', await e0.setAccess('mail', C('c-3'), [{ principal: GRP, authority: 'draft' }])]);   // draft: the fake account caps «send» (authority-capped)
    said.push(['All agents', await e0.setAccess('mail', C('c-4'), [{ principal: ALL, authority: 'draft' }])]);
    said.push(['another agent\'s own row', await e0.setAccess('mail2', C('d-5'), [{ principal: AGT2, authority: 'draft' }])]);
    said.push(['the owner\'s reach row (#user)', await e0.setReach('mail', 'c-5', { principal: AGT, level: 'visible' })]);   // a row of its own that holds no ACCESS: in the own-keys set, its grain read, nothing to report
    ix.flush();
    e0.stop();
  }
  const okWrites = said.filter(([, r]) => r && r.ok).length;
  const run = (E, tag) => {
    const d = path.join(ROOT, `parity-${tag}`);
    fs.cpSync(base, d, { recursive: true });
    const e = mkE(E, d);
    const out = {};
    const s0 = e.accessForStats();
    for (const [who, ctx] of ASKERS) { try { out[who] = e.accessFor(ctx); } catch (err) { out[who] = { threw: String((err && err.message) || err) }; } }   // a throw is an answer too: compared like any
    const s1 = e.accessForStats();
    e.stop();
    return { out, rows: s1.rows - s0.rows, grains: s1.grains - s0.grains, calls: s1.calls - s0.calls };
  };
  const neu = run(ENG, 'new'), rel = run(ENGREL, 'release'), red = run(ENGRED, 'red');
  const differs = ASKERS.map(([who]) => who).filter((who) => JSON.stringify(neu.out[who]) !== JSON.stringify(rel.out[who]));
  const convGrains = (o) => Object.values(o).flatMap((a) => (a && a.access) || []).filter((x) => x.grain === 'conversation').length;
  ok(okWrites === said.length, `§P the world: every kind written through the engine's own doors (${okWrites} of ${said.length})`, JSON.stringify(said.filter(([, r]) => !(r && r.ok)).map(([k, r]) => [k, r && (r.code || r.error)])));
  ok(differs.length === 0 && convGrains(neu.out) >= 3, `§P PARITY: every asker's answer is EQUAL row for row on both roads (${ASKERS.length} askers; ${convGrains(neu.out)} conversation grain line(s) among them) — the askers whose answers differ: ${JSON.stringify(differs)}`, differs.map((who) => ({ who, new: neu.out[who], release: rel.out[who] })).slice(0, 2).map((x) => JSON.stringify(x).slice(0, 600)).join(' | '));
  ok(neu.calls === ASKERS.length && rel.calls === ASKERS.length && neu.rows === rel.rows && rel.grains === rel.rows && neu.grains < 40 && neu.grains * 20 < rel.grains, `§P THE COUNT: over ${neu.rows} row(s) walked by the ${neu.calls} calls, the release read ${rel.grains} grains (every row), the new road ${neu.grains} — only the conversations a row of their own names`, { neu: { rows: neu.rows, grains: neu.grains }, rel: { rows: rel.rows, grains: rel.grains } });
  const missing = ASKERS.map(([who]) => who).filter((who) => convGrains({ x: red.out[who] }) < convGrains({ x: neu.out[who] }));
  ok(missing.length >= 1, `§P RED CONTROL: the door's own-keys set without the conversations' own access rows — a conversation with access goes MISSING for ${JSON.stringify(missing)} — the parity leg above would be red by name`, missing);
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
