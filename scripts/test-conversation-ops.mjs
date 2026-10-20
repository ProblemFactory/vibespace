#!/usr/bin/env node
// test-conversation-ops — THE CONVERSATION VERBS AS SERVER-SIDE SEAMS (lane automation-verbs, design q-046 §2 「动词实现」 /
// §4 L2): the owner's ws frames, the routes and (with L1's engine) an automation key reach the SAME create / rename / bind
// / end / invite through src/server/conversation-ops.js, with WHO asked named on every line.
//   ① PURE src/conversation-spec.js — the closed open spec (the coordinator's own spec passes; every refusal NAMED, a
//      resume / fork / host / extra-args field refused), the caller (`by`), its audit subject, its spend identity
//   ② the seams over fake deps — a ws caller's create is ITS handler with ITS arguments (byte-identical); a caller with no
//      window must be an automation; an automation's open asks the spend guard FIRST (reason automation-open, the key's
//      identity), a refusal spawns nothing; the HEADLESS sink is the new session's first client and leaves it the moment
//      the handler answers; note on success, release on a refusal / a throw; rename / end / bind / invite pass the owner's
//      own arguments through and judge an automation's; two server instances never cross (forDeps)
//   ③ the wiring pins — the three ws cases call the seams, the moved bodies kept their markers, the routes call the seams
//   ④ data/bin/vibespace-api's TYPED verbs (L1's keys / call / audit kept) — argv → ONE POST /api/agent/automation/<verb>
//      with L1's argument names and only the session token; the answer printed as JSON; a refusal exits 1, the lock 3, a
//      usage error 2 with nothing sent
//   ⑤ MUTANTS (patched copies outside the tree): the spend gate moved after the spawn, the sink left attached ⇒ RED
//   ⑥ THE WIRED AUTOMATION VERBS (automationVerbs — L1's engine `verbs`): the door's arguments → the seams; open waits for
//      the conversation id (else pending); a conversation the key OPENED is within its reach, another one needs a grant; bind
//      only into the caller's own Task Group; invite quietly, `pending` before the conversation has an id
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const SPEC = require(path.join(ROOT, 'src/conversation-spec.js'));
const OPS = require(path.join(ROOT, 'src/server/conversation-ops.js'));
const TABLES = { backends: ['claude', 'shell'], chatBackends: ['claude'], byBackend: {
  claude: { models: ['opus', 'sonnet'], modelFree: true, efforts: ['low', 'high', 'max'], effortFree: true, permissionModes: ['auto', 'bypassPermissions', 'plan', 'acceptEdits'] },
  shell: { models: [], modelFree: true, efforts: [], effortFree: false, permissionModes: [] } } };
const MKWORKER = { backend: 'claude', mode: 'chat', name: 'lane foo', cwd: '/var/tmp/vibespace-lanes', model: 'opus', effort: 'xhigh', permissionMode: 'bypassPermissions', taskId: 'T-261002-vibespace', accountId: 'pool-d1e27705257c' };
const AUTO = { kind: 'automation', key: 'ak1', keyName: 'dispatch', subject: 'session:c0ffee', cid: 'c0ffee', sessionKey: 'claude:c0ffee' };

console.log('① PURE src/conversation-spec.js — the closed open spec, the caller, its subject and identity');
{
  const v = SPEC.openSpecVerdict(MKWORKER, TABLES);
  const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  ok(v.ok && sorted(v.spec) === sorted(MKWORKER), "the coordinator's own worker spec (mkworker.mjs: claude chat opus xhigh bypass, a Task Group, the pool) passes unchanged", v);
  ok(JSON.stringify(SPEC.openSpecVerdict({ cwd: '/x' }, TABLES).spec) === JSON.stringify({ backend: 'claude', mode: 'chat', cwd: '/x' }), 'defaults: backend claude, mode chat');
  const code = (spec) => { const r = SPEC.openSpecVerdict(spec, TABLES); return r.ok ? 'ok' : `${r.code}:${r.field}`; };
  const rows = [
    [{ cwd: '/x', resumeId: 'r' }, 'unknown_field:resumeId'], [{ cwd: '/x', fork: true }, 'unknown_field:fork'], [{ cwd: '/x', hostId: 'h' }, 'unknown_field:hostId'],
    [{ cwd: '/x', extraArgs: ['--x'] }, 'unknown_field:extraArgs'], [{ cwd: '/x', backend: 'gpt' }, 'bad_backend:backend'], [{ cwd: '/x', mode: 'web' }, 'bad_mode:mode'],
    [{ cwd: '/x', backend: 'shell' }, 'bad_mode:mode'], [{ cwd: '/x', backend: 'shell', mode: 'terminal' }, 'ok'], [{ cwd: 'rel/path' }, 'bad_cwd:cwd'], [{}, 'bad_cwd:cwd'],
    [{ cwd: '/x', name: 'n'.repeat(61) }, 'bad_name:name'], [{ cwd: '/x', name: 'n'.repeat(60) }, 'ok'], [{ cwd: '/x', name: 'a‮b' }, 'bad_name:name'], [{ cwd: '/x', name: '   ' }, 'bad_name:name'],
    [{ cwd: '/x', model: 'claude-opus-5-5' }, 'ok'], [{ cwd: '/x', model: 'opus; rm -rf' }, 'bad_model:model'], [{ cwd: '/x', effort: 'ultracode' }, 'ok'], [{ cwd: '/x', effort: 'X H' }, 'bad_effort:effort'],
    [{ cwd: '/x', backend: 'shell', mode: 'terminal', effort: 'high' }, 'bad_effort:effort'], [{ cwd: '/x', permissionMode: 'yolo' }, 'bad_permission_mode:permissionMode'],
    [{ cwd: '/x', backend: 'shell', mode: 'terminal', permissionMode: 'plan' }, 'bad_permission_mode:permissionMode'], [{ cwd: '/x', taskId: 'g-1234' }, 'bad_task:taskId'],
    [{ cwd: '/x', accountId: '../etc' }, 'bad_account:accountId'], [null, 'bad_spec:null'],
  ];
  const bad = rows.filter(([s, want]) => code(s) !== want).map(([s, want]) => ({ s, want, got: code(s) }));
  ok(bad.length === 0, `${rows.length} specs, each refusal NAMED by its code and field (a resume / fork / host / extra-args field is not an automation's to ask for)`, bad);
  const by = (b) => { const r = SPEC.byVerdict(b); return r.ok ? r.by.kind : r.code; };
  ok(by({ kind: 'human', actBy: 'human:abc' }) === 'human' && by({ kind: 'agent', cid: 'c1' }) === 'agent' && by(AUTO) === 'automation' && by({ kind: 'automation', key: 'k' }) === 'bad_by' && by({ kind: 'root' }) === 'bad_by' && by({ kind: 'automation', key: 'k', subject: 'session:x', sessionKey: 'nope' }) === 'bad_by',
    'byVerdict: human / agent / automation (an automation names its key and a session: / group: / external subject; a malformed field is refused)');
  ok(SPEC.actByOf({ kind: 'human', actBy: 'human:abc' }) === 'human:abc' && SPEC.actByOf(AUTO) === 'agent:claude:c0ffee' && SPEC.actByOf({ kind: 'automation', key: 'ak9' }) === 'system:automation-ak9' && SPEC.actByOf({ kind: 'agent', cid: 'c1' }) === 'agent:claude:c1',
    "actByOf: the sign-in's subject, the calling conversation's agent:<sessionKey> (device-acts' spelling), a no-conversation key's system:automation-<id>");
  ok(JSON.stringify(SPEC.spendIdentityOf(AUTO)) === JSON.stringify({ key: 'automation:ak1', name: 'automation key «dispatch»' }) && SPEC.spendIdentityOf({ kind: 'human' }) === null, 'spendIdentityOf: an automation is charged to its KEY (design §1 summary 7); nobody else here');
  ok(JSON.stringify(SPEC.wireOf(MKWORKER).spawnOriginHint) === JSON.stringify({ model: 'chosen', effort: 'chosen' }) && !('spawnOriginHint' in SPEC.wireOf({ backend: 'claude', mode: 'chat', cwd: '/x' })), "wireOf: a chosen model / effort says so (the coordinator's spawnOriginHint), nothing chosen says nothing");
  const tv = (t) => { const r = SPEC.targetVerdict(t); return r.ok ? Object.keys(r.target)[0] : r.code; };
  ok(tv({ webuiId: 'sess-3-17' }) === 'webuiId' && tv({ sessionKey: 'claude:abc' }) === 'sessionKey' && tv({}) === 'bad_target' && tv({ webuiId: 'sess-1', sessionKey: 'claude:x' }) === 'bad_target' && tv({ webuiId: '../x' }) === 'bad_target',
    'targetVerdict: exactly one of webuiId (sess-…) or sessionKey (<backend>:<id>)');
  const mv = SPEC.membersVerdict(['claude:aa11', 'aa11', 'lane foo']);
  ok(mv.ok && JSON.stringify(mv.members) === JSON.stringify(['aa11', 'lane foo']) && SPEC.membersVerdict([]).code === 'bad_member' && SPEC.membersVerdict(Array.from({ length: 21 }, (_, k) => 'm' + k)).code === 'bad_member',
    'membersVerdict: a sessionKey becomes its conversation id (the groups engine resolves ids / names), duplicates fold, 1..20');
  ok(SPEC.groupVerdict('g-f52477e5').ok && SPEC.groupVerdict('').code === 'bad_group' && SPEC.taskIdVerdict('T-261002-vibespace').ok, 'groupVerdict / taskIdVerdict');
  ok(!/require\(|from '/.test(read('src/conversation-spec.js').replace(/^\s*(\/\/|\*).*$/gm, '')), 'conversation-spec.js imports nothing (PURE — test-architecture PURE row)');
}

/** A fake server: a create handler that registers the creator socket as the session's first client (ws-create line 942). */
function world({ guard = 'allow', create = 'ok', conv = null } = {}) {
  const log = [];
  const activeSessions = new Map();
  const W = { log, activeSessions, sinkSends: 0 };
  W.handleCreate = async (ws, data, attached) => {
    log.push(['create', data.type, data.reqId ? 'reqId' : 'no-reqId', ws._headless ? 'sink' : 'ws', attached instanceof Set]);
    W.lastFrame = data; W.lastSocket = ws;
    if (create === 'throw') throw new Error('spawn exploded');
    if (create === 'error') { ws.send(JSON.stringify({ type: 'error', message: 'Unknown backend "claude".' })); return; }
    if (create === 'silent') return;
    const id = 'sess-9-' + (activeSessions.size + 1);
    const session = { name: data.name, cwd: data.cwd, mode: data.mode, backend: data.backend, clients: new Map([[ws, { cols: data.cols, rows: data.rows }]]), claudeSessionId: conv, backendSessionId: conv };
    activeSessions.set(id, session);
    ws.send(JSON.stringify({ type: 'created', sessionId: id, name: data.name, cwd: data.cwd, mode: data.mode, reqId: data.reqId, billing: { accountId: data.accountId || null } }));
    W.afterCreatedClients = session.clients.size;
    try { ws.send(JSON.stringify({ type: 'output', data: 'after' })); } catch { } // the session prints: a detached sink must take nothing
  };
  W.spendGuard = {
    authorize: (o) => { log.push(['authorize', o.reason, o.identity && o.identity.key]); return guard === 'allow' ? { ok: true, hold: 'h1' } : { ok: false, why: 'hour-cap', detail: 'automation key ak1 has spent 6 unattended turns this hour (cap 6)', retryAfter: 1234 }; },
    note: (o) => log.push(['note', o.reason, o.hold]), release: (o) => log.push(['release', o.hold]),
  };
  W.getSessionKey = (s) => (s.backendSessionId ? `${s.backend || 'claude'}:${s.backendSessionId}` : '');
  W.renames = []; W.rename = (d) => { W.renames.push(d); for (const [id] of activeSessions) if (id === d.webuiId) return { ok: true, targetId: id, name: String(d.name).trim() }; return { ok: false, code: 'not_found' }; };
  W.ends = []; W.endSession = async (d, o) => { W.ends.push({ d, actBy: o.actBy }); o.reply({ type: 'killed', sessionId: d.sessionId, ok: activeSessions.has(d.sessionId) }); };
  W.tasks = { binds: [], notes: [], bind(id, k) { this.binds.push([id, k]); if (id !== 'T-1-x') throw new Error('task not found'); return { id, sessions: [k] }; }, addProgress(id, p) { this.notes.push([id, p]); } };
  W.ge = { calls: [], invite(o) { this.calls.push(o); return { ok: true, added: o.members }; } };
  W.ops = OPS.forDeps({ handleCreate: W.handleCreate, spendGuard: W.spendGuard, activeSessions, getSessionKey: W.getSessionKey, rename: W.rename, endSession: W.endSession, tasks: W.tasks, groupsEngine: () => W.ge, specTables: () => TABLES, WS_OPEN: 1 });
  return W;
}

console.log('② the seams over fake deps');
{
  const W = world();
  const ws = { _actBy: 'human:abc', send() { } }, att = new Set(), data = { type: 'create', backend: 'claude', mode: 'chat', cwd: '/x', reqId: 'r1', resumeId: 'keep-me' };
  await W.ops.openConversation(data, { kind: 'human', actBy: ws._actBy }, { ws, attachedSessions: att });
  ok(W.lastFrame === data && W.lastSocket === ws && W.log.length === 1 && W.log[0][3] === 'ws', "a ws caller: ITS handler with ITS frame, ITS socket and ITS attached set — no judging, no spend call (the owner's dialog, byte-identical; a resume field is the owner's to send)", W.log);
}
for (const kind of [{ kind: 'human', actBy: 'human:abc' }, { kind: 'agent', cid: 'c1' }]) {
  const W = world();
  const r = await W.ops.openConversation(MKWORKER, kind);
  ok(r.code === 'needs_a_window' && W.log.length === 0, `no window, a ${kind.kind} caller: refused needs_a_window — nothing spawns, nothing is charged (the door is an automation key's)`, r);
}
{
  const W = world();
  const r = await W.ops.openConversation(MKWORKER, AUTO);
  ok(r.ok && /^sess-9-/.test(r.sessionId) && r.pending === true && r.claudeSessionId === null && r.billing.accountId === 'pool-d1e27705257c', 'an automation opens: the ids come back, `pending` until its CLI reports the conversation id', r);
  ok(JSON.stringify(W.log.map((l) => l[0])) === JSON.stringify(['authorize', 'create', 'note']) && W.log[0][1] === 'automation-open' && W.log[0][2] === 'automation:ak1' && W.log[2][2] === 'h1',
    'the spend guard is asked FIRST (reason automation-open, the identity automation:<key>), the create runs, the hold is NOTED', W.log);
  ok(W.lastFrame.type === 'create' && W.lastFrame.reqId.startsWith('auto-') && W.lastFrame.cols === 120 && W.lastFrame.rows === 30 && W.lastFrame.permissionMode === 'bypassPermissions' && W.lastFrame.spawnOriginHint.effort === 'chosen' && !('resumeId' in W.lastFrame),
    "the handler gets the frame the owner's dialog would send for the same choices (a reqId, 120×30, the judged fields only)", W.lastFrame);
  const s = W.activeSessions.get(r.sessionId);
  ok(W.lastSocket._headless === true && W.lastSocket._actBy === 'agent:claude:c0ffee' && W.afterCreatedClients === 0 && s.clients.size === 0,
    "the HEADLESS sink: its device acts name the calling conversation; it left the session's clients the moment `created` arrived (what the session prints next reaches no sink)", { actBy: W.lastSocket._actBy, after: W.afterCreatedClients });
  s.claudeSessionId = s.backendSessionId = 'aa11';
  const st = W.ops.conversationStatus({ webuiId: r.sessionId });
  ok(st.ok && st.sessionKey === 'claude:aa11' && st.pending === false && W.ops.conversationStatus({ webuiId: 'sess-0-0' }).code === 'not_found', 'conversationStatus: the conversation id once reported (pending → claude:<id>); a gone one is not_found', st);
}
{
  const W = world({ guard: 'refuse' });
  const r = await W.ops.openConversation(MKWORKER, AUTO);
  ok(r.code === 'spend_refused' && r.bucket === 'hour-cap' && r.retryAfter === 1234 && W.log.length === 1 && W.log[0][0] === 'authorize', 'a spend refusal: spend_refused NAMING the bucket — the create never ran', r);
}
{
  const W = world({ create: 'error' });
  const r = await W.ops.openConversation(MKWORKER, AUTO);
  ok(r.code === 'create_failed' && /Unknown backend/.test(r.why) && JSON.stringify(W.log.map((l) => l[0])) === JSON.stringify(['authorize', 'create', 'release']), "the handler's first refusal (it carries no reqId) is the answer, by name; the hold is RELEASED, never noted", { r, log: W.log });
}
{
  const W = world({ create: 'throw' });
  let threw = null; try { await W.ops.openConversation(MKWORKER, AUTO); } catch (e) { threw = e.message; }
  const W2 = world({ create: 'silent' });
  const r2 = await W2.ops.openConversation(MKWORKER, AUTO);
  ok((threw === null) && W.log.some((l) => l[0] === 'release') && r2.code === 'no_answer' && W2.log.some((l) => l[0] === 'release'), 'a handler that throws or ends silently: a named refusal (create_threw / no_answer), the hold released', { log: W.log, r2 });
}
{
  const W = world();
  const r1 = await W.ops.openConversation({ ...MKWORKER, resumeId: 'x' }, AUTO);
  const r2 = await W.ops.openConversation(MKWORKER, { kind: 'automation', key: 'ak1' });
  const W3 = world(); const ops3 = OPS.forDeps({ handleCreate: W3.handleCreate, activeSessions: W3.activeSessions, specTables: () => TABLES, spendGuard: undefined });
  const r3 = await ops3.openConversation(MKWORKER, AUTO);
  ok(r1.code === 'unknown_field' && r2.code === 'bad_by' && W.log.length === 0 && r3.code === 'spend_refused' && r3.bucket === 'no-guard' && W3.log.length === 0, 'a refused spec / caller, or no spend guard wired: nothing is charged and nothing spawns (fail closed)', { r1, r2, r3 });
}
{
  const W = world();
  await W.ops.openConversation(MKWORKER, AUTO); const id = [...W.activeSessions.keys()][0];
  const frame = { type: 'rename-session', webuiId: id, name: ' n ' };
  const a = W.ops.renameConversation(frame, frame.name, { kind: 'human', actBy: 'human:abc' });
  ok(W.renames[0] === frame && a.ok, "rename, the owner's frame: the body gets THAT frame object (byte-identical — it reads webuiId / sessionKey / backendSessionId / name)");
  const b = W.ops.renameConversation({ webuiId: id }, '  worker one ', AUTO);
  const c = W.ops.renameConversation({ webuiId: 'sess-0-0' }, 'x', AUTO);
  const d = W.ops.renameConversation({ webuiId: id }, 'n'.repeat(61), AUTO);
  ok(b.ok && W.renames[1].name === 'worker one' && c.code === 'not_found' && d.code === 'bad_name' && W.renames.length === 2, "rename, an automation: the target and the name judged first (trimmed, ≤ 60), a conversation that is not live is named — the body never runs for a refusal", { b, c, d });
  const replies = [];
  await W.ops.endConversation({ type: 'kill', sessionId: id }, { kind: 'human', actBy: 'human:abc' }, { reply: (m) => replies.push(m) });
  ok(W.ends[0].d.type === 'kill' && W.ends[0].actBy === 'human:abc' && replies[0].type === 'killed', "end, the owner's frame: the body gets the frame, the reply and the sign-in's subject (ws._actBy)");
  W.activeSessions.get(id).backendSessionId = 'bb22';
  const e = await W.ops.endConversation({ sessionKey: 'claude:bb22' }, AUTO);
  const f = await W.ops.endConversation({ sessionKey: 'claude:none' }, AUTO);
  ok(e.ok && e.sessionId === id && W.ends[1].d.sessionId === id && W.ends[1].actBy === 'agent:claude:c0ffee' && f.code === 'not_found', "end, an automation: its sessionKey resolved to the live session, the teardown's device acts name the calling conversation; a gone one is not_found", { e, f, actBy: W.ends[1].actBy });
}
{
  const W = world();
  const t = W.ops.bindConversation({ sessionKey: undefined }, 'T-1-x', { kind: 'human' });
  ok(t.id === 'T-1-x' && W.tasks.binds.length === 1 && W.tasks.binds[0][0] === 'T-1-x' && W.tasks.binds[0][1] === undefined && W.tasks.notes.length === 0, "bind, the owner's route: the request's own sessionKey reaches the store as given (an undefined one too — the store's refusal is the answer)", W.tasks.binds);
  let thrown = null; try { W.ops.bindConversation({ sessionKey: 'claude:aa' }, 'T-nope', { kind: 'human' }); } catch (e) { thrown = e.message; }
  ok(thrown === 'task not found', "…and the store's own error surfaces unchanged (the routes map it as before: 404 / 400)");
  await W.ops.openConversation(MKWORKER, AUTO); const id = [...W.activeSessions.keys()][0];
  let pend = null; try { W.ops.bindConversation({ webuiId: id }, 'T-1-x', AUTO); } catch (e) { pend = e.code; }
  W.activeSessions.get(id).backendSessionId = 'cc33'; W.activeSessions.get(id).claudeSessionId = 'cc33';
  W.ops.bindConversation({ webuiId: id }, 'T-1-x', AUTO, { note: '[automation] bound', noteSession: 'claude:c0ffee' });
  ok(pend === 'pending' && JSON.stringify(W.tasks.binds.at(-1)) === JSON.stringify(['T-1-x', 'claude:cc33']) && W.tasks.notes.length === 1 && W.tasks.notes[0][1].session === 'claude:c0ffee', "bind by webui id: `pending` until the conversation reported its id, then its claude:<id>; the caller's note is ONE activity line", W.tasks);
}
{
  const W = world();
  const own = { context: 'ctx', quiet: true, mayWake: 2, consent: 'yes' };
  await W.ops.inviteToGroup('g-1', ['a', 'b'], { kind: 'agent', cid: 'c1' }, { ge: W.ge, ...own });
  ok(JSON.stringify(W.ge.calls[0]) === JSON.stringify({ by: 'c1', group: 'g-1', members: ['a', 'b'], context: 'ctx', quiet: true, mayWake: 2, consent: 'yes' }), "invite, an agent's own route: its engine and options pass through exactly as the route built them (byte-identical)", W.ge.calls[0]);
  const r = await W.ops.inviteToGroup('g-1', ['claude:aa11'], AUTO, { quiet: true });
  const r2 = await W.ops.inviteToGroup('g-1', [], AUTO);
  const r3 = await W.ops.inviteToGroup('g-1', ['x'], { kind: 'automation', key: 'ak1', subject: 'external' });
  ok(r.ok && W.ge.calls[1].by === 'c0ffee' && JSON.stringify(W.ge.calls[1].members) === JSON.stringify(['aa11']) && r2.code === 'bad_member' && r3.code === 'bad_by' && W.ge.calls.length === 2,
    "invite, an automation: the provided engine, the inviter = the calling conversation, a sessionKey member → its id; no member / no conversation behind the key ⇒ refused by name", { r, r2, r3 });
}
{
  const A = world(), B = world();
  await A.ops.openConversation({ type: 'create' }, { kind: 'human' }, { ws: { send() { } }, attachedSessions: new Set() });
  ok(A.log.length === 1 && B.log.length === 0, 'two server instances (forDeps): a socket of one never reaches the other\'s handler');
  const shared = OPS.provide({ zzTest: 1 });
  ok(shared.zzTest === 1 && typeof OPS.openConversation === 'function' && typeof OPS.bindConversation === 'function', 'provide() merges an owner\'s parts into the shared seams (the routes, the automation engine)');
}

console.log('③ the wiring pins');
{
  const wh = read('src/ws-handler.js'), srv = read('server.js'), ar = read('src/agent-routes.js');
  ok(/case 'create': \{\n\s+await convOps\.openConversation\(data, byOfWs\(ws\), \{ ws, attachedSessions \}\);/.test(wh)
    && /case 'rename-session': \{\n\s+convOps\.renameConversation\(data, data\.name, byOfWs\(ws\)\);/.test(wh)
    && /case 'kill': \{\n\s+await convOps\.endConversation\(data, byOfWs\(ws\), \{ reply: \(m\) => ws\.send\(JSON\.stringify\(m\)\) \}\);/.test(wh), 'the three ws cases call the seams (create / rename-session / kill)');
  const co = read('src/server/conversation-ops.js');
  const rb = co.slice(co.indexOf('function renameSession(deps, data) {'), co.indexOf('let shared = {};') > co.indexOf('function renameSession(') ? co.indexOf('let shared = {};') : co.indexOf('/** The harness registry'));
  const kb = wh.slice(wh.indexOf('  const endSessionBody = async (data, { reply, actBy } = {}) => {'), wh.indexOf('  const byOfWs = '));
  ok(rb.length > 1500 && /if \(trimmedName\) \{ session\._nameExplicit = true;/.test(rb) && /if \(!targetId\) return \{ ok: false, code: 'not_found' \};/.test(rb) && !/\bws\./.test(rb) && !/const trimmedName/.test(wh)
    && /rename: \(data\) => ConversationOps\.renameSession\(\{ activeSessions, setCustomName, writeSessionMeta, readSessionMeta, broadcastActiveSessions, getSessionKey \}, data\),/.test(wh),
    "the rename body is conversation-ops' renameSession (L1 moved it there whole — its customNames marker kept, no socket in it); the ws handler provides it bound to its ctx as `rename`");
  ok(kb.length > 5000 && !/\bws\./.test(kb) && /reply\(\{ type: 'killed', sessionId: requestedKillId, resolvedId: data\.sessionId, ok: true \}\)/.test(kb) && /by: actBy \|\| 'system:session-end'/.test(kb) && /data\.sessionId = eid; break/.test(kb),
    "the kill body: no requester socket left in it (reply / actBy), its stale-id fallback kept verbatim");
  ok(/ConversationOps\.provide\(convOpsOwn\);/.test(wh) && /const convOps = ConversationOps\.forDeps\(convOpsOwn\);/.test(wh) && (wh.match(/require\('\.\/server\/conversation-ops\.js'\)/g) || []).length === 1, 'ws-handler provides its create / rename / end to the shared seams (one require) and binds its own instance');
  ok(/convOps\.provide\(\{ tasks, spendGuard \}\);/.test(srv) && /task: convOps\.bindConversation\(\{ sessionKey: req\.body\?\.sessionKey \}, req\.params\.id, /.test(srv) && !/tasks\.bind\(req\.params\.id/.test(srv), "server.js: the owner's bind route calls the seam; the task store and THE spend guard are provided");
  ok(/convOps\.forDeps\(\{ tasks \}\)\.bindConversation\(\{ sessionKey: sk \}, bind\.id,/.test(ar) && /r = await convOps\.inviteToGroup\(b\.group, members, \{ kind: 'agent', cid: c\.cid \}, \{ ge: c\.ge,/.test(ar) && /convOps\.provide\(\{ groupsEngine \}\);/.test(ar) && !/c\.ge\.invite\(/.test(ar), "agent-routes: the manager's bind and an agent's group invite call the seams; the groups engine is provided");
  ok((read('src/server/conversation-ops.js').match(/\bcreateHeadless\s*\(/g) || []).length === 1, 'conversation-ops holds ONE headless-create call (the spend census row `headless-open` — test-spend-paths)');
}

console.log("④ data/bin/vibespace-api — the typed verbs (L1's keys / call / audit kept)");
{
  const CLI = path.join(ROOT, 'data/bin/vibespace-api');
  const C = require(CLI);
  const v = (argv) => { const r = C.typed(argv); return r.error ? 'ERR' : `${r.verb} ${JSON.stringify(r.args)}${r.key ? ' key=' + r.key : ''}`; };
  ok(v(['conversations', 'open', '--cwd', '/var/tmp/vibespace-lanes', '--name', 'lane foo', '--model', 'opus', '--effort', 'xhigh', '--permission', 'bypassPermissions', '--task', 'T-261002-vibespace', '--pool', 'pool-d1e27705257c', '--key', 'dispatch'])
    === 'conversations.open {"cwd":"/var/tmp/vibespace-lanes","name":"lane foo","model":"opus","effort":"xhigh","permission":"bypassPermissions","task":"T-261002-vibespace","pool":"pool-d1e27705257c"} key=dispatch', "conversations open: the flags → the door's own argument names (L1's SCOPES), --key picks a key");
  ok(v(['conversations', 'rename', 'sess-3-17', 'worker one']) === 'conversations.rename {"target":"sess-3-17","name":"worker one"}' && v(['conversations', 'bind', 'claude:aa11', 'T-1-x']) === 'conversations.bind {"target":"claude:aa11","task":"T-1-x"}'
    && v(['conversations', 'end', 'aa11']) === 'conversations.end {"target":"aa11"}' && v(['conversations', 'status', 'sess-3-17']) === 'conversations.status {"target":"sess-3-17"}' && v(['groups', 'invite', 'g-1', 'claude:bb']) === 'groups.invite {"group":"g-1","target":"claude:bb"}',
    'rename / bind / end / status / groups invite: positionals in order (a conversation id, <backend>:<id> or sess-…)');
  ok(['conversations open', 'conversations open --cwd /x stray', 'conversations open --cwd /x --bogus 1', 'conversations rename sess-1 two words', 'groups invite g-1', 'conversations status', 'conversations frob', 'conversations end sess-1 --name x', 'conversations open --cwd /x --cwd /y'].every((a) => v(a.split(' ')) === 'ERR'),
    'a stray word, an unknown or misplaced flag, a missing argument, a flag twice: refused by name');
  const hits = [];
  let mode = 'door';
  const srv = http.createServer((q, s) => {
    let body = ''; q.on('data', (c) => { body += c; }); q.on('end', () => {
      hits.push({ m: q.method, u: q.url, auth: q.headers.authorization, body });
      const J = (st, o) => { s.writeHead(st, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(o)); };
      if (mode === 'door') return J(200, { ok: true, keyId: 'ak-000000000001', key: 'dispatch', verb: 'conversations.open', result: { ok: true, sessionId: 'sess-5-1', claudeSessionId: null, sessionKey: null, pending: true } });
      if (mode === 'locked') return J(423, { ok: false, code: 'vault_locked', error: 'the vault is locked' });
      return J(429, { ok: false, code: 'spend_refused', bucket: 'hour-cap', error: 'spend_refused: automation key «dispatch» has spent 6 unattended turns this hour (cap 6)' });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const API = `http://127.0.0.1:${srv.address().port}`;
  const run = (args, env = {}) => new Promise((res) => {
    const c = spawn(process.execPath, [CLI, ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_test', ...env } });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => res({ code, out, err }));
  });
  const a = await run(['conversations', 'open', '--cwd', '/x', '--name', 'w', '--key', 'dispatch']);
  let printed = null; try { printed = JSON.parse(a.out); } catch { printed = null; }
  ok(a.code === 0 && printed && printed.sessionId === 'sess-5-1' && printed.pending === true && printed.key === 'dispatch' && hits.length === 1 && hits[0].m === 'POST' && hits[0].u === '/api/agent/automation/conversations.open?key=dispatch' && hits[0].auth === 'Bearer vsst_test' && JSON.parse(hits[0].body).name === 'w',
    "ONE POST to /api/agent/automation/<verb>?key= carrying only the session's own token; the answer printed as JSON (the ids, pending)", { a, hits });
  mode = 'locked'; const b = await run(['conversations', 'end', 'sess-1']);
  mode = 'spend'; const c = await run(['conversations', 'open', '--cwd', '/x']);
  const d = await run(['conversations', 'open', '--cwd', '/x', 'stray']);
  ok(b.code === 3 && /vault_locked/.test(b.err) && c.code === 1 && /spend_refused/.test(c.err) && d.code === 2 && hits.length === 3, "the lock exits 3 (L1's), a refusal names its code (exit 1), a usage error sends NOTHING (exit 2)", { b: b.code, c: c.code, d: d.code, hits: hits.length });
  srv.close();
}

console.log('⑤ MUTANTS (patched copies outside the tree)');
{
  const src = read('src/server/conversation-ops.js');
  const mut = (name, from, to) => {
    const dir = scratch('convops-mut-' + name); // ended at exit (scratch.mjs)
    fs.mkdirSync(path.join(dir, 'src', 'server'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'src/conversation-spec.js'), path.join(dir, 'src/conversation-spec.js'));
    fs.writeFileSync(path.join(dir, 'src/backend-caps.js'), 'module.exports = { capsOf: () => ({}) };\n'); // the rename body's one import
    if (!src.includes(from)) return { dir, missing: true };
    fs.writeFileSync(path.join(dir, 'src/server/conversation-ops.js'), src.replace(from, to));
    return { dir, M: require(path.join(dir, 'src/server/conversation-ops.js')) };
  };
  const gateLine = "    const g = spendGuard.authorize({ reason: 'automation-open', identity, sessionName: v.spec.name || null });\n";
  const late = mut('late-gate', gateLine + "    if (!g || !g.ok) return refusal(", "    await D().handleCreate({ send() {}, _headless: true }, { type: 'create', cwd: '/early' }, new Set());\n" + gateLine + "    if (!g || !g.ok) return refusal(");
  const detach = mut('no-detach', "try { if (s && s.clients && typeof s.clients.delete === 'function') s.clients.delete(sink); } catch { }", '/* left attached */');
  const runs = [];
  for (const m of [late, detach]) {
    if (m.missing) { runs.push('anchor missing'); continue; }
    const W = world({ guard: 'refuse' });
    const W2 = world();
    const ops = m.M.forDeps({ handleCreate: W.handleCreate, spendGuard: W.spendGuard, activeSessions: W.activeSessions, getSessionKey: W.getSessionKey, specTables: () => TABLES });
    const ops2 = m.M.forDeps({ handleCreate: W2.handleCreate, spendGuard: W2.spendGuard, activeSessions: W2.activeSessions, getSessionKey: W2.getSessionKey, specTables: () => TABLES });
    await ops.openConversation(MKWORKER, AUTO); const r2 = await ops2.openConversation(MKWORKER, AUTO);
    const spawnedOnRefusal = W.log.some((l) => l[0] === 'create');
    const leftAttached = r2.ok && W2.activeSessions.get(r2.sessionId).clients.size === 1;
    runs.push({ spawnedOnRefusal, leftAttached });
  }
  ok(runs[0] && runs[0].spawnedOnRefusal === true && runs[0].leftAttached === false, 'MUTANT: the spend gate after a spawn ⇒ a refused key still spawned (the order leg above is RED for it)', runs[0]);
  ok(runs[1] && runs[1].spawnedOnRefusal === false && runs[1].leftAttached === true, 'MUTANT: the sink never detached ⇒ it stays the session\'s client (the detach leg above is RED for it)', runs[1]);
}

console.log('⑥ THE WIRED AUTOMATION VERBS (automationVerbs — the engine\'s `verbs`)');
{
  const W = world({ conv: null });
  const opsW = W.ops;
  const caller = { conversationId: 'c0ffee', sessionKey: 'claude:c0ffee', name: 'coordinator', groups: ['T-1-x'] };
  W.activeSessions.set('sess-0-9', { name: 'coordinator', backend: 'claude', backendSessionId: 'c0ffee', claudeSessionId: 'c0ffee', clients: new Map() });
  W.activeSessions.set('sess-0-8', { name: 'stranger', backend: 'claude', backendSessionId: 'dd44', claudeSessionId: 'dd44', clients: new Map() });
  let ticks = 0;
  const V = OPS.automationVerbs({ activeSessions: W.activeSessions, groupsOf: () => [], ops: opsW, waitMs: 2000, sleep: async () => { ticks++; if (ticks === 3) for (const s of W.activeSessions.values()) if (!s.backendSessionId) { s.backendSessionId = s.claudeSessionId = 'ee55'; } } });
  const reachSelf = (cid) => cid === 'c0ffee';
  const ctx = { caller, keyId: 'ak-000000000001', reach: reachSelf, identity: 'automation:ak-000000000001' };
  const o = await V['conversations.open']({ cwd: '/var/tmp/vibespace-lanes', name: 'worker', model: 'opus', effort: 'xhigh', permission: 'bypassPermissions', task: 'T-1-x', pool: 'pool-a' }, ctx);
  ok(o.ok && o.claudeSessionId === 'ee55' && o.sessionKey === 'claude:ee55' && o.pending === false && ticks === 3 && W.lastFrame.permissionMode === 'bypassPermissions' && W.lastFrame.taskId === 'T-1-x' && W.lastFrame.accountId === 'pool-a' && W.log[0][2] === 'automation:ak-000000000001',
    "open: the door's arguments → the spec (permission → permissionMode, task → taskId, pool → accountId), charged to the key, and it WAITS for the conversation id", { o, ticks });
  const id = o.sessionId;
  OPS.provide({ rename: W.rename }); // the rename verb reaches L1's body through the shared `rename` the ws handler provides
  const st = V['conversations.status']({ target: id }, ctx);
  const rn = V['conversations.rename']({ target: id, name: 'worker one' }, ctx);
  ok(st.ok && st.sessionKey === 'claude:ee55' && rn.ok && rn.target === 'ee55' && W.renames.at(-1).webuiId === id, 'a conversation THIS key opened is within its reach (status, rename) — no grant of its own needed', { st, rn });
  const other = { ...ctx, keyId: 'ak-000000000002' };
  ok(V['conversations.rename']({ target: id, name: 'x' }, other).code === 'not_granted' && V['conversations.end']({ target: 'dd44' }, ctx) instanceof Promise, 'another key does not reach it; a stranger conversation needs a grant');
  const strangerEnd = await V['conversations.end']({ target: 'dd44' }, ctx);
  ok(strangerEnd.code === 'not_granted' && !W.ends.some((e) => e.d.sessionId === 'sess-0-8'), 'end on a conversation the key does not reach ⇒ not_granted, nothing ended', strangerEnd);
  const bd = V['conversations.bind']({ target: id, task: 'T-1-x' }, ctx);
  const bdOut = V['conversations.bind']({ target: id, task: 'T-other' }, ctx);
  ok(bd.ok && JSON.stringify(W.tasks.binds.at(-1)) === JSON.stringify(['T-1-x', 'claude:ee55']) && /\[automation\] session ee55 bound by coordinator \(key ak-000000000001\)/.test(W.tasks.notes.at(-1)[1].note) && bdOut.code === 'not_granted',
    "bind: into the CALLER's own Task Group (one activity line names it and the key); another Task Group ⇒ not_granted", { bd, bdOut });
  const iv = await V['groups.invite']({ group: 'g-1', target: id }, ctx);
  ok(iv.ok && W.ge.calls.at(-1).by === 'c0ffee' && JSON.stringify(W.ge.calls.at(-1).members) === JSON.stringify(['ee55']) && W.ge.calls.at(-1).quiet === true, 'invite: the caller invites the conversation\'s id, QUIETLY (no wake — a billed turn of its own)', W.ge.calls.at(-1));
  W.activeSessions.set('sess-0-7', { name: 'young', backend: 'claude', backendSessionId: null, claudeSessionId: null, clients: new Map() });
  const denied = await V['groups.invite']({ group: 'g-1', target: 'sess-0-7' }, { ...ctx, reach: () => false });
  const young = await V['groups.invite']({ group: 'g-1', target: 'sess-0-7' }, { ...ctx, reach: () => true });
  ok(denied.code === 'not_granted' && young.code === 'pending' && W.ge.calls.length === 1, 'invite: a conversation the key does not reach ⇒ not_granted; one that has no id yet ⇒ pending — the engine is never asked', { denied, young });
  const en = await V['conversations.end']({ target: id }, ctx);
  ok(en.ok && en.target === 'ee55' && W.ends.at(-1).d.sessionId === id && W.ends.at(-1).actBy === 'agent:claude:c0ffee', 'end: the conversation ends, its teardown names the calling conversation', en);
  OPS.provide(null);
  const W3 = world({ guard: 'refuse' });
  const V3 = OPS.automationVerbs({ activeSessions: W3.activeSessions, ops: W3.ops });
  const rf = await V3['conversations.open']({ cwd: '/x' }, ctx);
  ok(rf.code === 'spend_refused' && rf.bucket === 'hour-cap' && !W3.log.some((l) => l[0] === 'create'), 'open, the ceiling full: spend_refused with its bucket — nothing spawned', rf);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
