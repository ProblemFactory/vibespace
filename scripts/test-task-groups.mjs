#!/usr/bin/env node
// test-task-groups — TASK GROUP MEMBERSHIP HAS ONE TRUTH (lane open-task-binds, the owner 2026-10-23 05:4x: «你最近建立的车道都
// 不在 VibeSpace 车道 这个组里»). Two defects, one rule each:
//   · a conversation opened INTO a group (`vibespace-api conversations open … --task T-…`, the New Session window's Task, a
//     fork's first group) was recorded only as its BIRTH group (ws-create `_initialGroupId`): the agent's groupsForSession
//     counted it, the group's `sessions` list — the owner's panel, its counts, its activity log — did not. Now ws-create marks
//     `_birthBind` and conversation-ops `settleBirthGroups` (asked at server.js broadcastActiveSessions, the session list's ONE
//     notify point) binds it through bindConversation the moment it has its own id;
//   · the group's folder was stored as `/var/tmp/vibespace-lanes/**` (the agent context's own print of a recursive folder,
//     written back) and matched NO conversation — not even one started exactly there. PURE src/task-membership.js folderOf
//     reads a glob tail as the recursive switch; insideFolder (a folder includes itself) is THE folder rule everywhere.
//   ① PURE src/task-membership.js — folderOf / insideFolder / birthBindVerdict tables
//   ② the REAL TaskGroupManager over the owner's stored folder shape — a conversation started exactly at the folder, and under
//      it, is a member; the store keeps the folder normalized (RED on the base: the glob folder matched nothing)
//   ③ THE BIRTH BIND end to end — the real automation verb conversations.open --task over the real conversation-ops and the
//      real store (ws-create's own `_birthBind` expression in the fake create): pending ⇒ not yet; the id adopted + the notify
//      point ⇒ in `sessions`, groupsForSession agrees WITHOUT the birth note, ONE activity line (conversations.bind's
//      spelling); a fork waits past its source's id; a window's open writes no line; a deleted group is dropped, never retried;
//      --task into a group the caller is not in ⇒ not_granted, nothing spawned (RED on the base: nothing bound it)
//   ③b (int346 — lane new-session-form × this lane) a New Session create naming TWO groups (`taskIds`, the order picked) is a
//      MEMBER of both — sessions[] of each through the same bindConversation, at the same notify point (RED with either half
//      alone: open-task-binds' mark names the first group only; new-session-form's create marks nothing)
//   ④ the panel's own resolver (sidebar-tasks.js `_getTaskSessionKeys`, evaluated from the source) lists the opened
//      conversation and the conversation started at the folder
//   ⑤ the wiring pins + THE CENSUS: no hand-rolled `startsWith(<folder>.path + '/')` in a Task Group folder file (controls:
//      the base's two spellings are caught)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };   // a missing file reads empty (the base has no task-membership.js — its legs go RED, never crash)
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let M = {};
try { M = require(path.join(ROOT, 'src/task-membership.js')); } catch (e) { M = {}; }
const has = (fn) => typeof M[fn] === 'function';

console.log('① PURE src/task-membership.js — the folder rule and the birth bind verdict');
{
  ok(has('folderOf') && has('insideFolder') && has('birthBindVerdict'), 'the module exports folderOf / insideFolder / birthBindVerdict');
  const fo = (x) => (has('folderOf') ? M.folderOf(x) : 'missing');
  const rows = [
    ['/var/tmp/lanes/**', { path: '/var/tmp/lanes', recursive: true }], [{ path: '/var/tmp/lanes/**', recursive: true }, { path: '/var/tmp/lanes', recursive: true }],
    [{ path: '/a/**/**/', recursive: false }, { path: '/a', recursive: true }], ['/a/*', { path: '/a', recursive: true }], ['/a/', { path: '/a', recursive: true }],
    [{ path: '/a', recursive: false }, { path: '/a', recursive: false }], ['  /a/b  ', { path: '/a/b', recursive: true }], ['h1::/w/**', { path: 'h1::/w', recursive: true }],
    ['/a/**x', { path: '/a/**x', recursive: true }], ['/', null], ['/**', null], ['', null], [null, null], [{ path: 3 }, null],
  ];
  const bad = rows.filter(([x, want]) => !same(fo(x), want)).map(([x, want]) => ({ x, want, got: fo(x) }));
  ok(bad.length === 0, `folderOf: ${rows.length} rows — a glob tail is the recursive switch (never part of the path), a bare string is recursive, '/' is no folder`, bad);
  const inn = (c, f) => (has('insideFolder') ? M.insideFolder(c, f) : 'missing');
  const rowsIn = [
    ['/var/tmp/lanes', { path: '/var/tmp/lanes', recursive: true }, true], ['/var/tmp/lanes', { path: '/var/tmp/lanes/**', recursive: true }, true],
    ['/var/tmp/lanes/wt-x', '/var/tmp/lanes/**', true], ['/var/tmp/lanes/', '/var/tmp/lanes', true], ['/var/tmp/lanes-old', '/var/tmp/lanes', false],
    ['/var/tmp/lanes/x', { path: '/var/tmp/lanes', recursive: false }, false], ['/var/tmp/lanes', { path: '/var/tmp/lanes', recursive: false }, true],
    ['/var/tmp', '/var/tmp/lanes', false], ['h1::/w/x', 'h1::/w', true], ['/w/x', 'h1::/w', false], ['', '/a', false], [null, '/a', false], ['/a', null, false],
  ];
  const badIn = rowsIn.filter(([c, f, want]) => inn(c, f) !== want).map(([c, f, want]) => ({ c, f, want, got: inn(c, f) }));
  ok(badIn.length === 0, `insideFolder: ${rowsIn.length} rows — a folder INCLUDES ITSELF, a recursive one every path under it on a whole segment, a non-recursive one only itself`, badIn);
  const bv = (s) => (has('birthBindVerdict') ? M.birthBindVerdict(s) : 'missing');
  ok(same(bv({}), { none: true }) && same(bv({ _birthBind: null, claudeSessionId: 'a' }), { none: true }) && same(bv({ _birthBind: { groupId: 'T-1' } }), { wait: true, why: 'no-id-yet' })
    && same(bv({ _birthBind: { groupId: 'T-1' }, claudeSessionId: 'p', _forkRequested: true }), { wait: true, why: 'fork-source-id' })
    && same(bv({ _birthBind: { groupId: 'T-1' }, backendSessionId: 'th-1' }), { bind: true, groupId: 'T-1', groupIds: ['T-1'] })
    && same(bv({ _birthBind: { groupId: 'T-1', groupIds: ['T-1', 'T-2'] }, backendSessionId: 'th-1' }), { bind: true, groupId: 'T-1', groupIds: ['T-1', 'T-2'] }), 'birthBindVerdict: none · wait (no own id yet / a fork still on its source\'s id) · bind (int346: every group the create named)');
  ok(!!read('src/task-membership.js') && !/require\(|\bimport\b/.test(read('src/task-membership.js').replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '')), 'task-membership.js imports nothing (PURE — the test-architecture PURE row)');
}

const { TaskGroupManager } = require(path.join(ROOT, 'src/task-groups.js'));
const SCR = scratch('task-groups');
fs.rmSync(SCR, { recursive: true, force: true });
fs.mkdirSync(SCR, { recursive: true });
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });
const LANES = path.join(SCR, 'lanes');   // a synthetic folder, never a real one
let dirSeq = 0;
const freshStore = (raw) => {
  const dataDir = path.join(SCR, `data-${++dirSeq}`);
  fs.mkdirSync(dataDir, { recursive: true });
  if (raw) fs.writeFileSync(path.join(dataDir, 'task-groups.json'), JSON.stringify(raw));
  return new TaskGroupManager({ dataDir });
};

console.log('② the REAL store over the owner\'s stored folder shape (`<folder>/**`, recursive)');
{
  const tgm = freshStore();
  const g = tgm.create({ title: 'Lanes', folders: [{ path: LANES + '/**', recursive: true }] });
  const ids = (cwd) => tgm.groupsForSession({ cwd }).map((t) => t.id);
  ok(ids(LANES).includes(g.id), 'a conversation started EXACTLY at the group\'s folder is a member (the lanes\' own cwd)', { folders: tgm.get(g.id).folders });
  ok(ids(path.join(LANES, 'wt-x')).includes(g.id) && !ids(LANES + '-old').includes(g.id) && !ids(path.dirname(LANES)).includes(g.id), 'under it ⇒ a member; a sibling with the same prefix, the parent ⇒ not');
  // int346: lane task-group-context — a group's folders are its Context table's 自动发现会话 rows (the live record keeps
  // `ctx`; `folders` is DERIVED on the wire, view() / list())
  ok(same(tgm.view(g.id).folders, [{ path: LANES, recursive: true }]) && tgm.get(g.id).ctx[0].path === LANES, 'the store keeps the folder NORMALIZED (the glob tail is the recursive switch, not part of the path)', { folders: tgm.view(g.id).folders, ctx: tgm.get(g.id).ctx });
  const raw = { tasks: { 'T-260101-old': { id: 'T-260101-old', title: 'Old', sessions: [], folders: [{ path: LANES + '/**', recursive: true }, LANES], createdAt: 1, updatedAt: 1 } } };
  const old = freshStore(raw);
  // int346: a store from before the Context table reads its folders once the boot's one migration has run
  // (2026-10-task-group-context-rows — lane task-group-context's RED control: before it a cwd joins nothing)
  old.migrateContextRows();
  const listed = (old.list().find((t) => t.id === 'T-260101-old') || {}).folders;
  ok(same(listed, [{ path: LANES, recursive: true }]) && old.groupsForSession({ cwd: LANES }).some((t) => t.id === 'T-260101-old'),
    'a store written BEFORE the fix (the glob folder on disk): every reader sees it normalized + deduped (the panel\'s list, groupsForSession) and it matches at once', listed);
  // int346: lane task-group-context — a linked folder IS a 自动发现会话 row and membership is recursive (no non-recursive
  // folder remains; the migration counts any it meets): the folder itself and under it
  const plain = tgm.create({ title: 'Plain', folders: [{ path: LANES, recursive: false }] });
  ok(ids(LANES).includes(plain.id) && ids(path.join(LANES, 'wt-x')).includes(plain.id), 'a folder linked non-recursive: itself AND under it (the Context table\'s discover rows are recursive)');
}

console.log('③ THE BIRTH BIND — conversations.open --task through the real conversation-ops into the real store');
const OPS = require(path.join(ROOT, 'src/server/conversation-ops.js'));
const wsCreate = read('src/ws-create.js');
const birthLine = (wsCreate.match(/^\s*_birthBind: (.+),\s*$/m) || [])[1] || null;
// int346: the create's groups are new-session-form's PURE spawnGroupIds (`taskIds` in the order picked, else the old `taskId`) —
// ws-create's `spawnGroups`, handed to its OWN expression beside the frame
const SPEC = (() => { try { return require(path.join(ROOT, 'src/new-session-spec.js')); } catch { return null; } })();
const spawnOf = (data) => (SPEC ? SPEC.spawnGroupIds(data) : []);
const birthFn = birthLine ? new Function('data', 'spawnGroups', `return ${birthLine};`) : null;   // ws-create's OWN expression, evaluated over the frame
const birthOf = (data) => (birthFn ? birthFn(data, spawnOf(data)) : undefined);
ok(!!birthLine && same(birthOf({ taskId: 'T-261002-vibespace' }), { groupId: 'T-261002-vibespace', groupIds: ['T-261002-vibespace'], by: null }) && birthOf({ taskId: 'T-1; rm' }) === null && birthOf({}) === null,
  'ws-create marks `_birthBind` from the create\'s taskId under the SAME id shape as _initialGroupId (a junk id marks nothing)', birthLine);
ok(!!birthLine && same(birthOf({ taskId: 'T-a', taskIds: ['T-a', 'T-b', 'T-a', 'T-1; rm'] }), { groupId: 'T-a', groupIds: ['T-a', 'T-b'], by: null }),
  'int346: a create naming SEVERAL groups (taskIds) marks every one, in the order picked (a duplicate / junk id marks nothing)', birthLine && birthOf({ taskId: 'T-a', taskIds: ['T-a', 'T-b'] }));
const TABLES = { backends: ['claude'], chatBackends: ['claude'], byBackend: { claude: { models: ['opus'], modelFree: true, efforts: ['high'], effortFree: true, permissionModes: ['bypassPermissions'] } } };
function world(tgm) {
  const activeSessions = new Map();
  const W = { activeSessions, creates: 0 };
  W.handleCreate = async (ws, data) => {   // as src/ws-create.js: the creator socket is the first client; the conversation id comes LATER
    W.creates++;
    const id = 'sess-7-' + (activeSessions.size + 1);
    activeSessions.set(id, { name: data.sessionName || null, cwd: data.cwd, mode: data.mode, backend: data.backend, clients: new Map([[ws, {}]]), claudeSessionId: null, backendSessionId: null,
      _initialGroupId: spawnOf(data)[0] || null, _initialGroupIds: spawnOf(data), _birthBind: birthOf(data) });
    ws.send(JSON.stringify({ type: 'created', sessionId: id, cwd: data.cwd, mode: data.mode, reqId: data.reqId }));
  };
  W.spendGuard = { authorize: () => ({ ok: true, hold: 'h' }), note() { }, release() { } };
  W.getSessionKey = (s) => { const c = s.backendSessionId || s.claudeSessionId; return c ? `${s.backend || 'claude'}:${c}` : ''; };
  W.ops = OPS.forDeps({ handleCreate: W.handleCreate, spendGuard: W.spendGuard, activeSessions, getSessionKey: W.getSessionKey, tasks: tgm, specTables: () => TABLES, WS_OPEN: 1 });
  W.notify = () => (typeof W.ops.settleBirthGroups === 'function' ? W.ops.settleBirthGroups() : 'missing');   // what server.js broadcastActiveSessions asks
  return W;
}
const lines = (tgm, gid) => (tgm.get(gid).progress || []).map((p) => p.note).filter((n) => /bound by/.test(n));
{
  const tgm = freshStore();
  const g = tgm.create({ title: 'VibeSpace lanes' });
  const W = world(tgm);
  const caller = { conversationId: 'c0ffee01', sessionKey: 'claude:c0ffee01', name: 'coordinator', groups: [g.id] };
  const ctx = { caller, keyId: 'ak-000000000001', reach: () => ({ ok: true }) };
  const V = OPS.automationVerbs({ activeSessions: W.activeSessions, ops: W.ops, waitMs: 500, sleep: async () => { } });
  const o = await V['conversations.open']({ cwd: '/srv/fixture/elsewhere', name: 'lane x', task: g.id }, ctx);
  const s = W.activeSessions.get(o.sessionId);
  ok(o.ok && o.pending === true && !tgm.get(g.id).sessions.length, 'open --task: the conversation has no id yet ⇒ answered pending, no membership yet (nothing to key it by)', { o, sessions: tgm.get(g.id).sessions });
  W.notify();
  ok(!tgm.get(g.id).sessions.length, 'the notify point before the id: still nothing (waits, never keys a membership by the webui id)');
  s.claudeSessionId = s.backendSessionId = 'ee55aa01';   // the stream parser adopts its id, then broadcasts
  const n = W.notify();
  const key = 'claude:ee55aa01';
  ok(n === 1 && same(tgm.get(g.id).sessions, [key]), 'the id adopted + the session list\'s notify point ⇒ the conversation is IN the group\'s sessions (the panel, its counts)', { n, sessions: tgm.get(g.id).sessions });
  ok(tgm.groupsForSession({ sessionKey: key, cwd: '/srv/fixture/elsewhere' }).some((t) => t.id === g.id), 'groupsForSession agrees WITHOUT the birth note (a membership, not a note — one truth for the agent and the owner)');
  ok(same(lines(tgm, g.id), ['[automation] session ee55aa01 bound by coordinator (key ak-000000000001)']), 'ONE activity line, conversations.bind\'s own spelling (who bound it, with which key)', lines(tgm, g.id));
  W.notify(); W.notify();
  ok(same(tgm.get(g.id).sessions, [key]) && lines(tgm, g.id).length === 1 && s._birthBind === null, 'asked again ⇒ nothing more (the mark is spent: one bind, one line)');
  const created = W.creates;
  const refused = await V['conversations.open']({ cwd: '/srv/fixture/x', task: 'T-261231-other' }, ctx);
  ok(refused.code === 'not_granted' && W.creates === created, '--task into a group the CALLER is not in ⇒ not_granted, nothing spawned (conversations.bind\'s own rule — the open now writes what a bind writes)', refused);
  // the verb's own settle: an id that arrives inside the open's wait lands the membership before the answer
  let ticks = 0;
  const V2 = OPS.automationVerbs({ activeSessions: W.activeSessions, ops: W.ops, waitMs: 2000, sleep: async () => { if (++ticks === 2) for (const x of W.activeSessions.values()) if (!x.claudeSessionId) x.claudeSessionId = x.backendSessionId = 'ff66bb02'; } });
  const o2 = await V2['conversations.open']({ cwd: '/srv/fixture/elsewhere', name: 'lane y', task: g.id }, ctx);
  ok(o2.ok && o2.pending === false && tgm.get(g.id).sessions.includes('claude:ff66bb02'), 'an id inside the open\'s wait ⇒ a member BEFORE the answer (the verb settles once the id is here)', { o2, sessions: tgm.get(g.id).sessions });
}
{
  const tgm = freshStore();
  const a = tgm.create({ title: 'A' });
  const W = world(tgm);
  // a FORK (its row carries its SOURCE's id until the harness announces its own) and a window's open (no automation `by`)
  W.activeSessions.set('sess-7-f', { backend: 'claude', claudeSessionId: 'aa00p001', backendSessionId: 'aa00p001', _forkRequested: true, _birthBind: { groupId: a.id, by: null } });
  W.activeSessions.set('sess-7-w', { backend: 'claude', claudeSessionId: null, backendSessionId: null, _birthBind: { groupId: a.id, by: null } });
  W.notify();
  ok(!tgm.get(a.id).sessions.includes('claude:aa00p001'), 'a fork still on its source\'s id is NOT bound (that would tag the source)');
  const f = W.activeSessions.get('sess-7-f'); f._forkRequested = false; f.claudeSessionId = f.backendSessionId = 'aa00f002';
  const w = W.activeSessions.get('sess-7-w'); w.claudeSessionId = w.backendSessionId = 'aa00w003';
  W.notify();
  ok(same(tgm.get(a.id).sessions.slice().sort(), ['claude:aa00f002', 'claude:aa00w003']) && lines(tgm, a.id).length === 0, 'the fork\'s own id ⇒ bound under it; a window\'s open ⇒ bound, no activity line (the owner\'s own bind route writes none)', tgm.get(a.id).sessions);
  W.activeSessions.set('sess-7-g', { backend: 'claude', claudeSessionId: 'aa00g004', backendSessionId: 'aa00g004', _birthBind: { groupId: 'T-261231-gone', by: null } });
  let threw = null; const warn = console.warn; console.warn = () => { };
  try { W.notify(); } catch (e) { threw = e.message; } finally { console.warn = warn; }
  ok(threw === null && W.activeSessions.get('sess-7-g')._birthBind === null, 'a group deleted before the id arrived ⇒ the mark is dropped, nothing thrown at the notify point, never retried', threw);
}

console.log('③b (int346) THE NEW SESSION FORM × THE BIRTH BIND — a create naming TWO groups is a member of BOTH');
{
  const tgm = freshStore();
  const a = tgm.create({ title: 'Payments' }), b = tgm.create({ title: 'Investor relations' });
  const W = world(tgm);
  // the two-column form's create frame (src/lib/app.js: taskId = the first picked, taskIds = every one, in the order picked)
  await W.handleCreate({ readyState: 1, send() { } }, { type: 'create', cwd: '/srv/fixture/two', mode: 'chat', backend: 'claude', taskId: b.id, taskIds: [b.id, a.id] });
  const s = [...W.activeSessions.values()].pop();
  W.notify();
  ok(!tgm.get(a.id).sessions.length && !tgm.get(b.id).sessions.length, 'no id yet ⇒ neither group yet (nothing to key it by)');
  s.claudeSessionId = s.backendSessionId = 'ab00ab01';
  const n = W.notify();
  const key = 'claude:ab00ab01';
  ok(n === 2 && same(tgm.get(b.id).sessions, [key]) && same(tgm.get(a.id).sessions, [key]) && !lines(tgm, a.id).length && !lines(tgm, b.id).length,
    'the id adopted + the notify point ⇒ a MEMBER of BOTH groups (each one\'s sessions[]), through bindConversation; a window\'s create writes no line', { n, a: tgm.get(a.id).sessions, b: tgm.get(b.id).sessions });
  ok(same(tgm.groupsForSession({ sessionKey: key, cwd: '/srv/fixture/two' }).map((g) => g.id).sort(), [a.id, b.id].sort()), 'groupsForSession agrees for both WITHOUT the birth note');
  W.notify();
  ok(s._birthBind === null && tgm.get(a.id).sessions.length === 1 && tgm.get(b.id).sessions.length === 1, 'asked again ⇒ nothing more (the mark is spent)');
}

console.log('④ the panel\'s own resolver (sidebar-tasks.js, evaluated from the source) lists them');
{
  const src = read('src/lib/sidebar-tasks.js');
  const body = (marker) => {   // a method body by brace depth (these bodies hold no brace in a string)
    const i = src.indexOf(marker); if (i < 0) return null;
    const j = src.indexOf('{', i); let d = 0;
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(j, k + 1); }
    return null;
  };
  const recLine = (src.match(/proto\._folderRec = (\(f\) => .+);\n/) || [])[1];
  const sfm = body('proto._sessionFolderMatch = function(s, folderRecs)'), gtk = body('proto._getTaskSessionKeys = function(task, allSessions)'), mfr = body('proto._memberFolderRecs = function(task)') || '{ return ((task && task.folders) || []).map(this._folderRec); }';
  let keys = null, err = null;
  try {
    const mk = new Function('folderOf', 'insideFolder', 'stripCwdHostLabel', 'membershipCwds', 'memberFolders', 'folderOnHost', `return { _folderRec: ${recLine}, _sessionFolderMatch: function(s, folderRecs) ${sfm}, _memberFolderRecs: function(task) ${mfr}, _getTaskSessionKeys: function(task, allSessions) ${gtk}, _getSessionStateKey: (s) => s.sessionKey };`);
    const sb = mk(M.folderOf, M.insideFolder, (c) => String(c || '').replace(/^[^:]+: (?=\/)/, ''), M.membershipCwds, M.memberFolders, M.folderOnHost);   // B-df5f: the panel's cwds through the one rule; B-06de: its machine-scoped rows
    const tgm = freshStore();
    const g = tgm.create({ title: 'Lanes', folders: [{ path: LANES + '/**', recursive: true }] });
    tgm.bind(g.id, 'claude:ee55aa01');
    // the store's own list as the panel receives it, with the glob folder as the pre-fix server would have sent it
    const task = { ...tgm.get(g.id), folders: [{ path: LANES + '/**', recursive: true }] };
    keys = [...sb._getTaskSessionKeys(task, [
      { sessionKey: 'claude:ee55aa01', cwd: '/srv/fixture/elsewhere' }, { sessionKey: 'claude:ab12', cwd: LANES }, { sessionKey: 'claude:cd34', cwd: path.join(LANES, 'wt-y') }, { sessionKey: 'claude:ef56', cwd: LANES + '-old' },
    ])].sort();
  } catch (e) { err = e.message; }
  ok(same(keys, ['claude:ab12', 'claude:cd34', 'claude:ee55aa01']), 'the panel lists the conversation bound by its opening, the one started AT the folder and the one under it — not the same-prefix sibling', { keys, err });
}

console.log('⑥ B-06de: a Task Group folder row matches conversations of ITS OWN machine — a hub row the hub\'s, `R::/x` machine R\'s');
{
  const HUBW = path.join(SCR, 'hubwork');   // a hub folder (never created: a rooted row matches by its string, as before)
  const cases = (t) => [
    [{ cwd: path.join(HUBW, 'x') }, t, 'the hub\'s conversation under the hub row'],
    [{ cwd: path.join(HUBW, 'x'), hostId: 'local' }, t, '«local» is the hub'],
    [{ cwd: path.join(HUBW, 'x'), hostId: 'h1' }, '', 'machine h1\'s conversation at the SAME spelling: not a member (the row\'s own scene)'],
    [{ cwd: '/srv/app/y', hostId: 'h1' }, t, 'h1\'s conversation under h1\'s `h1::/srv/app` row'],
    [{ cwd: '/srv/app', hostId: 'h1' }, t, '…at the folder itself'],
    [{ cwd: '/srv/app/y' }, '', 'the hub\'s conversation at h1\'s path: not'],
    [{ cwd: '/srv/app/y', hostId: 'h2' }, '', 'another machine\'s: not'],
  ];
  const world = (Manager) => {
    const d = path.join(SCR, `data-${++dirSeq}`); fs.mkdirSync(d, { recursive: true });
    const tgm = new Manager({ dataDir: d });
    const g = tgm.create({ title: 'Mixed', ctx: [{ path: HUBW, note: 'hub work', tags: ['discover'] }, { path: 'h1::/srv/app', note: 'h1 app', tags: ['discover'] }] });
    return { tgm, g };
  };
  const judge = (Manager) => { const { tgm, g } = world(Manager); return cases(g.id).map(([a, want, what]) => ({ what, want, index: tgm.groupsForSession(a).map((t) => t.id).join(), walk: tgm._groupsForSessionWalk(a).map((t) => t.id).join() })); };
  const cur = judge(TaskGroupManager);
  const bad = cur.filter((c) => c.index !== c.want || c.walk !== c.want);
  ok(bad.length === 0, `the REAL store (the member index AND the walk), ${cur.length} cases: ${cur.map((c) => c.what).join(' · ')}`, bad);
  const mf = has('memberFolders') ? M.memberFolders([{ path: '/a', tags: ['discover'] }, { path: 'h1::/b/', tags: ['discover'] }, { path: '/c', tags: ['notes'] }, { path: '/f.md', tags: ['discover'] }], [{ abs: '/a', kind: 'dir' }, { abs: 'h1::/b/', kind: 'remote', host: 'h1' }, { abs: '/c', kind: 'dir' }, { abs: '/f.md', kind: 'file' }]) : null;
  ok(same(mf, [{ path: '/a', recursive: true, host: null }, { path: '/b', recursive: true, host: 'h1' }]) && has('folderOnHost') && M.folderOnHost({ path: '/a', host: null }, null) && M.folderOnHost({ path: '/a', host: null }, 'local') && !M.folderOnHost({ path: '/a', host: null }, 'h1') && M.folderOnHost({ path: '/b', host: 'h1' }, 'h1') && !M.folderOnHost({ path: '/b', host: 'h1' }, null) && !M.folderOnHost({ path: '/b', host: 'h1' }, 'h2'),
    'PURE memberFolders (discover rows only, a file never, `h1::/b/` → {/b, host h1}) and folderOnHost (a hub row: the hub\'s only — none / local; an R row: R\'s only)', mf);
  // CONTROL — the release's matcher (the folders with no machine, matched by spelling — anchored on the source)
  const { anchored } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  let rel = anchored(read('src/task-groups.js'), '      g.dirs = this.memberFoldersOf(g.t);', '      g.dirs = this.foldersOf(g.t);', 'the index rows');   // stale-pins: kept — the control writes the release's rows back on purpose
  rel = anchored(rel, 'for (const f of this.memberFoldersOf(t)) {', 'for (const f of this.foldersOf(t)) {', 'the walk rows');   // stale-pins: kept — the same
  rel = anchored(rel, 'folderOnHost(f, hostId) && ', '', 'the machine check', { count: 2 });
  const RelM = mutantCopies('tg-b06de', ROOT).load('src/task-groups.js', rel, 'release').TaskGroupManager;
  const r = judge(RelM);
  const sameSpelling = r.find((c) => /SAME spelling/.test(c.what)), remoteRow = r.find((c) => /under h1/.test(c.what));
  ok(sameSpelling.index !== '' && sameSpelling.walk !== '' && remoteRow.index === '' && remoteRow.walk === '', 'CONTROL — the release\'s matcher: h1\'s conversation at the hub row\'s spelling JOINS the group, and h1\'s conversation under `h1::/srv/app` does NOT', { sameSpelling, remoteRow });
  // THE PAGE (sidebar-tasks `_getTaskSessionKeys` / `_memberFolderRecs` / `_sessionFolderMatch`, evaluated from the source as ④) — the same rows
  const src = read('src/lib/sidebar-tasks.js');
  const body = (marker) => { const i = src.indexOf(marker); if (i < 0) return null; const j = src.indexOf('{', i); let d = 0; for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(j, k + 1); } return null; };
  const recLine = (src.match(/proto\._folderRec = (\(f\) => .+);\n/) || [])[1];
  let keys = null, err = null;
  try {
    const mk = new Function('folderOf', 'insideFolder', 'stripCwdHostLabel', 'membershipCwds', 'memberFolders', 'folderOnHost', `return { _folderRec: ${recLine}, _sessionFolderMatch: function(s, folderRecs) ${body('proto._sessionFolderMatch = function(s, folderRecs)')}, _memberFolderRecs: function(task) ${body('proto._memberFolderRecs = function(task)')}, _getTaskSessionKeys: function(task, allSessions) ${body('proto._getTaskSessionKeys = function(task, allSessions)')}, _getSessionTaskGroups: function(s) ${body('proto._getSessionTaskGroups = function(s)')}, _firstFolder: function(task) ${body('proto._firstFolder = function(task)')}, _getSessionStateKey: (s) => s.sessionKey, _getLegacySessionId: () => null, _tasks: [] };`);
    const sb = mk(M.folderOf, M.insideFolder, (c) => String(c || '').replace(/^[^:]+: (?=\/)/, ''), M.membershipCwds, M.memberFolders, M.folderOnHost);
    const { tgm, g } = world(TaskGroupManager);
    const task = tgm.list().find((t) => t.id === g.id);   // the group as the page receives it (ctx + ctxRes + the derived folders)
    const SESS = [
      { sessionKey: 'claude:hub1', cwd: path.join(HUBW, 'x') }, { sessionKey: 'claude:h1same', cwd: 'h1: ' + path.join(HUBW, 'x'), host: 'h1' },
      { sessionKey: 'claude:h1app', cwd: 'h1: /srv/app/y', host: 'h1' }, { sessionKey: 'claude:hubapp', cwd: '/srv/app/y' }, { sessionKey: 'claude:h2app', cwd: 'h2: /srv/app/y', host: 'h2' },
    ];
    keys = [...sb._getTaskSessionKeys(task, SESS)].sort();
    sb._tasks = [task];   // _getSessionTaskGroups (Task View, the cards, the pickers, the taskbar) reads the same rows
    keys = { board: keys, perSession: SESS.filter((x) => sb._getSessionTaskGroups(x).length > 0).map((x) => x.sessionKey).sort() };
    const first = world(TaskGroupManager);
    first.tgm.update(first.g.id, { ctx: [{ path: 'h1::/srv/app', note: 'h1 app', tags: ['discover'] }, { path: HUBW, note: 'hub', tags: ['discover'] }] });
    keys.firstFolder = sb._firstFolder(first.tgm.list().find((t) => t.id === first.g.id));
  } catch (e) { err = e.message; }
  ok(!!keys && same(keys.board, ['claude:h1app', 'claude:hub1']) && same(keys.perSession, ['claude:h1app', 'claude:hub1']), 'the PAGE lists the same members — the board (_getTaskSessionKeys) AND each session\'s groups (_getSessionTaskGroups): the hub\'s conversation under the hub row and h1\'s under h1\'s row — never h1\'s at the hub spelling, the hub\'s at h1\'s path, h2\'s', { keys, err });
  // THE PAGE'S WRITE DOORS write the machine's row for another machine's folder, and a New Session from a group opens on its row's machine
  const FE = read('src/lib/file-explorer-ops.js'), SR = read('src/lib/sidebar-render.js'), ST = read('src/lib/sidebar-tasks.js');
  ok(/const fullPath = this\.currentPath \+ '\/' \+ dataset\.name;\n *const fullHost = this\._host \|\| '';/.test(FE) && /_taskAddFolder\(t\.id, fullHost \? `\$\{fullHost\}::\$\{fullPath\}` : fullPath\)/.test(FE)
    && /folderHost = e\.dataTransfer\.getData\('application\/x-file-host'\)/.test(ST) && /this\._taskAddFolder\(task\.id, folderHost \? `\$\{folderHost\}::\$\{folderPath\}` : folderPath\)/.test(ST)
    && /const groupHost = hosts\.size === 1 \? \[\.\.\.hosts\]\[0\] : '';/.test(SR) && /const linkPath = groupHost \? `\$\{groupHost\}::\$\{stripCwdHostLabel\(cwd\)\}` : cwd;/.test(SR),
    'the write doors: Files «Add to task» (the machine taken WITH the path), a folder dragged from another machine\'s Files, the sidebar folder-group link (another machine\'s row only when EVERY session of the group is that machine\'s — a shared home\'s hub group stays the hub\'s)');
  // B-06de cure (主开发 08:04Z MUST 1): every New Session opened FROM a group goes through ONE door, sidebar-tasks _openGroupSession —
  // the one showNewSessionDialog with a taskId is its own (the folder from _firstFolder: another machine's row opens on THAT machine)
  const nsCalls = ['src/lib/sidebar-tasks.js', 'src/lib/task-detail.js', 'src/lib/sidebar.js', 'src/lib/sidebar-render.js', 'src/lib/app.js'].flatMap((f) => [...read(f).matchAll(/showNewSessionDialog\(\{([^\n]*?)\}\)/g)].map((m) => ({ f, args: m[1] }))).filter((c) => /taskId/.test(c.args) && !/\} = \{/.test(c.args));   // the calls, never the method's own definition
  const doorCalls = ['src/lib/sidebar-tasks.js', 'src/lib/task-detail.js'].flatMap((f) => [...read(f).matchAll(/_openGroupSession\((?:t|g|task)\)/g)].map(() => f));
  ok(nsCalls.length === 1 && nsCalls[0].f === 'src/lib/sidebar-tasks.js' && /^ \.\.\.first, \.\.\.extra, taskId: task\.id $/.test(nsCalls[0].args) && /proto\._openGroupSession = async function\(task, extra = \{\}\) \{\n\s*const first = this\._firstFolder\(task\);/.test(ST) && doorCalls.length === 4,
    `every New Session opened FROM a group (${doorCalls.length} doors: the group menu, the flat view's plus, the card's plus, the group window's «Start a conversation here») goes through _openGroupSession — the ONE dialog call with a taskId, its folder from _firstFolder`, { nsCalls, doorCalls });
  // …BEHAVIOUR (the methods evaluated from their source, as ④): a gone machine refused by name (nothing opened), an unreadable machines
  // list refused, a paired one opens ON it; MUST 2: the rule change's loss counted per hub row and machine; WITH IT: a machine's root
  // never written (all three doors meet in _taskAddFolder), another machine's row written as its own, the folders ON one machine
  let cure = null, cureErr = null;
  try {
    const line = (re) => (ST.match(re) || [])[1];
    const bodyAfter = (marker) => { const i = src.indexOf(marker); if (i < 0) return null; const j = src.indexOf('{', i + marker.length); let d = 0; for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(j, k + 1); } return null; };   // the body's brace AFTER the signature (a default `= {}` in it is no body)
    const ctxCopyL = line(/\n  const ctxCopy = (\(t\) => .+);\n/), ctxRowOfL = line(/\n  const ctxRowOf = (\(t, rows, folderPath\) => .+);\n/);
    const M2 = ['_sessionFolderMatch = function(s, folderRecs)', '_memberFolderRecs = function(task)', '_getTaskSessionKeys = function(task, allSessions)', '_firstFolder = function(task)', '_lostByMachine = function(task, allSessions, withKeys = false)', '_lostKeys = function(task, allSessions)', '_hubSessionsIn = function(p)', '_folderPathsOn = function(task, host = null)', '_hostNameOf = function(id)', '_folderLabel = function(p)', '_taskAddFolder = function(id, folderPath)'];
    const methods = M2.map((m) => `${m.slice(0, m.indexOf(' = '))}: ${m.slice(m.indexOf(' = ') + 3)} ${body('proto.' + m)}`).join(',\n');
    const io = { toasts: [], opened: [], updates: [], hosts: null };
    const mk2 = new Function('folderOf', 'insideFolder', 'stripCwdHostLabel', 'membershipCwds', 'memberFolders', 'folderOnHost', 'onOtherMachine', 'fetchJson', 'showToast', 'tr', 'localStorage', 'isRootRow',
      `const ctxCopy = ${ctxCopyL}; const ctxRowOf = ${ctxRowOfL}; return { _folderRec: ${recLine}, ${methods}, _openGroupSession: async function(task, extra = {}) ${bodyAfter('proto._openGroupSession = async function(task, extra = {})')}, _getSessionStateKey: (s) => s.sessionKey, _getLegacySessionId: () => null, _tasks: [] };`);
    const sb2 = mk2(M.folderOf, M.insideFolder, (c) => String(c || '').replace(/^[^:]+: (?=\/)/, ''), M.membershipCwds, M.memberFolders, M.folderOnHost, M.onOtherMachine,
      async () => io.hosts, (m, o) => io.toasts.push({ m, type: o && o.type }), (s, v) => (v ? s.replace(/\{(\w+)\}/g, (x, k) => String(v[k])) : s), { setItem() { } }, M.isRootRow);
    sb2.app = { showNewSessionDialog: (o) => { io.opened.push(o); return 'opened'; }, openTaskDetail() { }, _showAgentsDialog() { } };
    sb2._hostsData = { hosts: [{ id: 'h1', name: 'Build box' }] };
    const w0 = world(TaskGroupManager), task0 = w0.tgm.list().find((x) => x.id === w0.g.id);
    const hubPath = sb2._memberFolderRecs(task0).find((f) => f.host == null).path;
    const SESS = [
      { sessionKey: 'claude:hub1', cwd: path.join(HUBW, 'x') }, { sessionKey: 'claude:h1same', cwd: 'h1: ' + path.join(HUBW, 'x'), host: 'h1' }, { sessionKey: 'claude:h1same2', cwd: 'h1: ' + path.join(HUBW, 'z'), host: 'h1' },
      { sessionKey: 'claude:h1app', cwd: 'h1: /srv/app/y', host: 'h1' }, { sessionKey: 'claude:h2app', cwd: 'h2: /srv/app/y', host: 'h2' },
    ];
    cure = { lost: sb2._lostByMachine(task0, SESS), hubPath, on: { hub: sb2._folderPathsOn(task0, null), local: sb2._folderPathsOn(task0, 'local'), h1: sb2._folderPathsOn(task0, 'h1'), h2: sb2._folderPathsOn(task0, 'h2') }, label: [sb2._folderLabel('h1::/srv/app'), sb2._folderLabel('h9::/x'), sb2._folderLabel('/srv')] };
    // the root: refused at the one meeting point (said); another machine's folder written as its row
    sb2._taskById = () => ({ id: 'T-x', ctx: [], ctxRes: [] }); sb2._taskUpdate = (id, p) => { io.updates.push(p); return p; };
    for (const p of ['h1::/', '/', 'h1:://', 'h1::/srv/x']) sb2._taskAddFolder('T-x', p);
    cure.add = { updates: io.updates.map((u) => u.ctx.map((r) => `${r.path}|${r.tags.join(',')}`)), toasts: io.toasts.map((x) => x.type) };
    // MUST 1: the group whose FIRST row is h1's — h1 gone ⇒ refused; the list unreadable ⇒ refused; h1 paired ⇒ opened ON h1
    const w1 = world(TaskGroupManager); w1.tgm.update(w1.g.id, { ctx: [{ path: 'h1::/srv/app', note: 'h1 app', tags: ['discover'] }, { path: HUBW, note: 'hub', tags: ['discover'] }] });
    const task1 = w1.tgm.list().find((x) => x.id === w1.g.id);
    io.toasts.length = 0;
    io.hosts = { hosts: [{ id: 'h2' }] }; const gone = await sb2._openGroupSession(task1);
    io.hosts = { error: 'unreachable' }; const unread = await sb2._openGroupSession(task1);
    io.hosts = { hosts: [{ id: 'h1' }] }; const paired = await sb2._openGroupSession(task1, { prompt: 'p' });
    cure.open = { gone, unread, paired, opened: io.opened, toasts: io.toasts.map((x) => x.m.slice(0, 40)) };
    // the read's M1: THE LIVE CHIPS (app.js _taskCwdSuggestions, from its source) take the group's folders ON the machine chosen
    const AP = read('src/lib/app.js'), mi = AP.indexOf('  _taskCwdSuggestions(hostId) {');
    const chipBody = mi < 0 ? null : (() => { const j = AP.indexOf('{', mi + '  _taskCwdSuggestions(hostId)'.length); let d = 0; for (let k = j; k < AP.length; k++) { if (AP[k] === '{') d++; else if (AP[k] === '}' && --d === 0) return AP.slice(j, k + 1); } return null; })();
    const chipsOf = new Function('t', 'membershipCwds', 'insideFolder', `return function(hostId) ${chipBody};`)((s) => s, M.membershipCwds, M.insideFolder);
    const appStub = { _nsGroups: () => [{ ...task1, title: 'Mixed', color: '' }], sidebar: Object.assign(sb2, { _allSessions: [] }) };
    cure.chips = { hub: chipsOf.call(appStub, '').map((c) => c.path), h1: chipsOf.call(appStub, 'h1').map((c) => c.path), h2: chipsOf.call(appStub, 'h2').map((c) => c.path) };
    // the read's S2: the fallback (a PATCH's answer before its delta: rows and resolutions not aligned) still names the machine
    { const wN = world(TaskGroupManager); wN.tgm.update(wN.g.id, { ctx: [{ path: HUBW, note: 'hub', tags: ['discover'] }, { path: path.join(HUBW, 'x'), note: 'nested', tags: ['discover'] }, { path: 'h1::/srv/app', note: 'h1 app', tags: ['discover'] }] });
      const tN = wN.tgm.list().find((x) => x.id === wN.g.id); cure.perRow = sb2._lostByMachine(tN, SESS).reduce((k, o) => k + o.n, 0); cure.lostKeys = sb2._lostKeys(tN, SESS).size; }
    cure.root = ['/', '/.', 'h1::/', 'h1::/./', '/srv', 'h1::/srv', 'h1::' + '/'.repeat(5000) + 'x'].map((p) => M.isRootRow(p));   // an exponential test would hang the suite here (red by its timeout) — no clock asked
    cure.fallback = [sb2._firstFolder({ id: 'T-f', ctx: [{ path: 'x' }], ctxRes: [], folders: ['h1::/srv/app'] }), sb2._firstFolder({ id: 'T-l', ctx: [{ path: 'x' }], ctxRes: [], folders: ['local::/srv/l'] }), sb2._firstFolder({ id: 'T-r', ctx: [{ path: 'x' }], ctxRes: [], folders: ['h1::/'] })];
    sb2._allSessions = SESS; cure.hubIn = [sb2._hubSessionsIn(cure.hubPath), sb2._hubSessionsIn('/srv/app')]; sb2._allSessions = [];
  } catch (e) { cureErr = e.stack || e.message; }
  ok(!!cure && same(cure.lost, [{ path: cure.hubPath, host: 'h1', n: 2 }]), 'MUST 2: the rule change\'s loss is COUNTED per hub row and machine — h1\'s two conversations in the hub row\'s spelling (not gathered any more), never the hub\'s own, h1\'s under its own row, or h2\'s outside the hub row', { cure, cureErr });
  ok(!!cure && same(cure.on, { hub: [cure.hubPath], local: [cure.hubPath], h1: ['/srv/app'], h2: [] }) && same(cure.label, ['Build box: /srv/app', 'h9: /x', '/srv']), 'WITH IT: the group\'s folders ON one machine (a chip, a base) — the hub\'s rows for the hub, `h1::/srv/app` → /srv/app on h1, none on h2; a row as a person reads it says its machine by name, never the raw `host::/path`', cure && { on: cure.on, label: cure.label });
  ok(!!cure && same(cure.add, { updates: [['h1::/srv/x|discover']], toasts: ['warn', 'warn', 'warn'] }), 'WITH IT: a machine\'s ROOT (h1::/, /, h1:://) is never written — said where the person pressed (the three doors meet in _taskAddFolder); another machine\'s folder is written as ITS row', cure && cure.add);
  ok(!!cure && same(cure.chips, { hub: [cure.hubPath], h1: ['/srv/app'], h2: [] }) && !JSON.stringify(cure.chips).includes('::') && same(cure.fallback, [{ cwd: '/srv/app', hostId: 'h1' }, { cwd: '/srv/l', hostId: 'local' }, { cwd: '/', hostId: 'h1' }]) && same(cure.hubIn, [true, false]) && cure.perRow === 3 && cure.lostKeys === 2 && cure.root.join() === 'true,true,true,true,false,false,false',
    'the read\'s M1 + S2: the LIVE New Session chips (app.js _taskCwdSuggestions, its source) are the group\'s folders ON the machine chosen — the hub row on This machine, /srv/app on h1, none on h2, never a raw `host::/path`; a first folder the fallback carries raw still opens on ITS machine (the fallback parses the row); the Members line counts DISTINCT conversations (2); a machine\'s whole disk is said by ONE linear test (a 5000-slash row answers)', cure && { chips: cure.chips, fallback: cure.fallback, lostKeys: cure.lostKeys, root: cure.root, perRow: cure.perRow, hubIn: cure.hubIn });
  { const TD = read('src/lib/task-detail.js'), APs = read('src/lib/app.js');
    ok(/const repoint = kind === 'missing' && lostNow\.filter\(\(q\) => q\.path === o\.path\)\.length === 1 && !\(sidebar\._hubSessionsIn && sidebar\._hubSessionsIn\(o\.path\)\);/.test(TD) && /fetchJson\('\/api\/hosts'\)\.then\(\(d\) => \{\n\s*if \(closed \|\| !d/.test(TD) && /winInfo\.onClose = \(\) => \{ closed = true;/.test(TD)
      && /if \(hostId && !this\._nsHostPicked && hostSel\.value !== hostId\) \{[^\n]*hostSel\.value = hostId; this\._updateAcctRow\?\.\(\); \}/.test(APs) && /chip\('notes', [^\n]*\{ disabled: isFile \|\| \(kind === 'remote' && !tags\.includes\('notes'\)\),/.test(TD)
      && /if \(\/\^\[\^:\/\\s\]\+::\\\/\/\.test\(text\)\) rows\[j\]\.tags = \(rows\[j\]\.tags \|\| \[\]\)\.filter\(\(g\) => g !== 'notes'\);/.test(TD) && /if \(repoint && !\(sidebar\._hubSessionsIn && sidebar\._hubSessionsIn\(o\.path\)\)\) \{ const rows = rowsOf\(\)[^\n]*tags: \(rows\[j\]\.tags \|\| \[\]\)\.filter\(\(g\) => g !== 'notes'\)/.test(TD),
      'the delta reads\' pins: a hub row is RE-POINTED only when one machine\'s loss is on it and no conversation of This machine sits there; a machines answer landing after the window closed paints nothing; the dialog keeps the machine it was opened on when the list lands without it; another machine\'s row takes no notes (its chip can only be turned off; a typed `host::` path and the re-point drop it; the press re-checks This machine\'s members)'); }
  ok(!!cure && cure.open.gone === null && cure.open.unread === null && cure.open.paired === 'opened' && same(cure.open.opened, [{ cwd: '/srv/app', hostId: 'h1', prompt: 'p', taskId: cure.open.opened[0] && cure.open.opened[0].taskId }]) && cure.open.toasts.length === 2,
    'MUST 1: a group whose first row is on a machine NOT PAIRED any more opens NOTHING (said by name), an unreadable machines list the same; paired, it opens ON that machine at the row\'s path', cure && cure.open);
  ok(!!keys && same(keys.firstFolder, { cwd: '/srv/app', hostId: 'h1' }), 'a New Session from a group whose first folder is `h1::/srv/app` opens ON h1 at /srv/app (never a hub session with the literal row as its cwd)', keys && keys.firstFolder);
}

console.log('⑤ the wiring pins + THE CENSUS (one folder rule, one bind writer)');
{
  const server = read('server.js'), ops = read('src/server/conversation-ops.js');
  const bcast = (server.match(/function broadcastActiveSessions\(\) \{[\s\S]*?\n\}/) || [''])[0];
  ok(/try \{ convOps\.settleBirthGroups\(\); \} catch \{ \}/.test(bcast), 'server.js broadcastActiveSessions (the session list\'s ONE notify point) asks settleBirthGroups');
  ok(/const \{ birthBindVerdict \} = require\('\.\.\/task-membership\.js'\);/.test(ops) && /for \(const groupId of v\.groupIds\) \{[^\n]*\n\s*try \{\n\s*bindConversation\(\{ webuiId: id \}, groupId,/.test(ops) && /\{ birthBy \}\);/.test(ops) && /if \(s && s\._birthBind && birthBy\) s\._birthBind\.by = birthBy;/.test(ops),
    'conversation-ops: the verdict is the PURE one, the bind is bindConversation (the owner\'s route\'s writer), the verb hands who bound it to the headless create');
  ok((ops.match(/\[automation\] session \$\{/g) || []).length === 1 && (ops.match(/boundNote\(/g) || []).length === 2, 'ONE spelling of the automation bind line (boundNote — conversations.bind and the --task open)');
  ok(/import \{ folderOf, insideFolder, membershipCwds, memberFolders, folderOnHost, onOtherMachine, isRootRow \} from '\.\.\/task-membership\.js';/.test(read('src/lib/sidebar-tasks.js')) && /import \{ insideFolder, membershipCwds \} from '\.\.\/task-membership\.js';/.test(read('src/lib/app.js'))
    && /const \{ folderOf, insideFolder, membersWithout, onOtherMachine, memberFolders, folderOnHost \} = require\('\.\/task-membership\.js'\);/.test(read('src/task-groups.js')), 'the store, the panel and the New Session chips import THE folder rule (lane task-group-fanout: + THE unbind rule; B-df5f: + THE hub-real-path rule, membershipCwds / onOtherMachine)');
  // THE CENSUS: a Task Group folder file (it reads a group's folders) never hand-rolls the prefix test
  const HAND = /startsWith\(\s*[\w$.]*\.path\s*\+\s*'\/'\s*\)/;
  const FOLDER_FILE = /_folderRec\b|_sanitizeFolders\b|\b(?:t|task|tg|g|group)\.folders\b/;
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const files = walk('src').filter((f) => FOLDER_FILE.test(read(f)));
  const hits = files.flatMap((f) => read(f).split('\n').map((l, i) => (HAND.test(l) ? `${f}:${i + 1}` : null)).filter(Boolean));
  ok(files.length >= 4 && files.includes('src/task-groups.js') && files.includes('src/lib/sidebar-tasks.js') && files.includes('src/lib/app.js'), `the census reads every Task Group folder file (${files.length})`, files);
  ok(hits.length === 0, 'CENSUS: no hand-rolled `startsWith(<folder>.path + \'/\')` in a Task Group folder file — insideFolder is the rule (a folder includes itself)', hits);
  ok(HAND.test("          if (cwds.some(c => c === f.path || (f.recursive && c.startsWith(f.path + '/')))) { member = true; break; }") && HAND.test("          const under = s.cwd.startsWith(rec.path + '/') || (s.realCwd && s.realCwd.startsWith(rec.path + '/'));"),
    'CONTROL: the census catches the base\'s two spellings (task-groups.js groupsForSession, app.js _taskCwdSuggestions)');
}

console.log(`\ntest-task-groups: ${pass} passed, ${fail} failed`);
if (fail) { console.log('FAIL'); process.exit(1); }
console.log(`ALL PASS (${pass})`);
