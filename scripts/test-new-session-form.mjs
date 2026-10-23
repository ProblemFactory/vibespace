#!/usr/bin/env node
// THE NEW SESSION FORM'S FACTS (lane new-session-form — POC v2.2, the owner accepted it 2026-10-23), in-process, no browser:
//   ① src/new-session-spec.js — spawnGroupIds (the groups a new session joins, IN SELECTION ORDER; an older page's one
//      taskId), createAccessRow / withCreateAccess (the ONE access row a tick in 「账号 · 以你的身份」 writes, judged by
//      the Channels window's own validateAccess)
//   ② the REAL TaskGroupManager.groupsForSession with a LIST (`initialGroupIds`) — before any bind, both groups; the old
//      single `initialGroupId` still answers; an archived group never
//   ③ src/lib/new-session-model.js — the fold (unfoldReasons by the person's own data, foldPlan), the footer chips, the
//      refusal in words, the 可用工具 cycle (Bash never ✗), accountRows (group / everyone grants locked, the rest
//      tickable), 无 | 已选 | 全部, the group order, the name's placeholder
//   ④ the wiring: ws-create → _initialGroupIds + meta taskIds; boot-restore reads them back; EVERY groupsForSession call
//      that passes the spawn group passes the list too (a census over src/ + server.js, with a planted control); the page
//      sends taskIds + tools; the right column writes only through the access route
// Run: node scripts/test-new-session-form.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const S = require(path.join(REPO, 'src/new-session-spec.js'));
const F = require(path.join(REPO, 'src/channel-filter.js'));
const M = await import(path.join(REPO, 'src/lib/new-session-model.js'));

console.log('① the create facts (src/new-session-spec.js)');
ok(eq(S.spawnGroupIds({ taskIds: ['T-b', 'T-a', 'T-c'] }), ['T-b', 'T-a', 'T-c']), 'spawnGroupIds keeps the SELECTION ORDER (the first picked is the meta taskId)');
ok(eq(S.spawnGroupIds({ taskIds: ['T-a', 'bad id', 'T-a', 42, 'T-b;rm -rf', 'T-b'] }), ['T-a', 'T-b']), 'an id off the shape, a duplicate and a non-string are dropped — never forwarded');
ok(eq(S.spawnGroupIds({ taskId: 'T-old' }), ['T-old']) && eq(S.spawnGroupIds({}), []) && eq(S.spawnGroupIds(null), []), 'an older page\'s single taskId is a list of one; nothing picked = []');
ok(eq(S.spawnGroupIds({ taskIds: ['T-x'], taskId: 'T-y' }), ['T-x']), 'the list wins over the single id (the form sends both: taskId = taskIds[0])');
ok(S.spawnGroupIds({ taskIds: Array.from({ length: 40 }, (_, i) => 'T-' + i) }).length === S.SPAWN_GROUPS_MAX, `at most ${S.SPAWN_GROUPS_MAX} groups`);
ok(eq(S.createAccessRow('cid-1'), { principal: { kind: 'agent', id: 'cid-1' }, authority: 'draft' }) && S.createAccessRow('') === null, 'createAccessRow: ONE agent row, draft — nothing for an empty id');
{
  const before = [{ principal: { kind: 'group', id: 'T-a', name: 'IR' }, authority: 'draft', authorityStored: 'send', updatedAt: 5 }, { principal: { kind: 'everyone', id: '*' }, authority: 'draft' }];
  const after = S.withCreateAccess(before, 'cid-9');
  ok(after && after.length === 3 && eq(after[2], { principal: { kind: 'agent', id: 'cid-9' }, authority: 'draft' }), 'withCreateAccess appends the conversation\'s row to the grain\'s whole list');
  ok(after && after[0].authority === 'send' && eq(after[0].principal, { kind: 'group', id: 'T-a', name: 'IR' }) && !('updatedAt' in after[0]), 'the rows already there are re-sent with their STORED authority (never narrowed by a clamp) in the route\'s shape');
  ok(F.validateAccess(after, { offersSend: true, policyRequiresReview: false }).ok === true, 'the list it builds passes the Channels window\'s own verdict (channel-filter validateAccess)');
  ok(F.validateAccess(after, { offersSend: true, policyRequiresReview: true }).code === 'authority-capped', 'a stored send the channel no longer offers is refused BY NAME (the write fails and says so) — never narrowed to draft behind the person\'s back');
  ok(S.withCreateAccess([...before, { principal: { kind: 'agent', id: 'cid-9' }, authority: 'send' }], 'cid-9') === null, 'a conversation that already holds a row there gets none (never a duplicate, never its send narrowed to draft)');
}

console.log('② groupsForSession with a list (the real store)');
{
  const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-nsf-'));
  try {
    const tgm = new TaskGroupManager({ dataDir: dir });
    const a = tgm.create({ title: 'Alpha' }), b = tgm.create({ title: 'Beta' }), c = tgm.create({ title: 'Gamma' });
    const ids = (q) => tgm.groupsForSession(q).map((g) => g.id).sort();
    ok(eq(ids({ sessionKey: 'claude:none', initialGroupIds: [b.id, a.id] }), [a.id, b.id].sort()), 'a new session spawned into TWO groups belongs to both before any bind lands');
    ok(eq(ids({ initialGroupId: c.id }), [c.id]), 'the old single initialGroupId still answers');
    ok(eq(ids({ initialGroupId: a.id, initialGroupIds: [b.id] }), [a.id, b.id].sort()), 'the single id and the list are joined');
    ok(eq(ids({ initialGroupIds: ['T-nope'] }), []) && eq(ids({ initialGroupIds: null }), []), 'an id the store does not hold / no list ⇒ none');
    tgm.update(b.id, { archived: true });
    ok(eq(ids({ initialGroupIds: [a.id, b.id] }), [a.id]), 'an archived group is never joined');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log('③ the form\'s facts (src/lib/new-session-model.js)');
{
  const now = 1_800_000_000_000, day = 86400000;
  const hosts = [{ id: 'h1', name: 'my-mac' }];
  ok(M.unfoldReasons({ sessions: [{ host: 'h1', startedAt: now - 29 * day }], hosts, now }).host === 'my-mac', 'a paired machine used in the last 30 days unfolds the machine row (by its name)');
  ok(M.unfoldReasons({ sessions: [{ host: 'h1', startedAt: now - 31 * day }], hosts, now }).host === '' && M.unfoldReasons({ sessions: [{ host: 'gone', startedAt: now }], hosts, now }).host === '', 'CONTROL: 31 days ago, or a machine no longer paired ⇒ folded');
  ok(M.unfoldReasons({ accounts: 2 }).account === 2 && M.unfoldReasons({ accounts: 1 }).account === 0, 'two accounts or more unfold the account row; one stays folded');
  ok(M.unfoldReasons({ isGit: true }).worktree === true && M.unfoldReasons({}).worktree === false, 'a git folder unfolds the worktree tick');
  ok(M.unfoldReasons({ sessions: [{ mode: 'terminal', startedAt: now - day }], now }).terminal === true, 'terminal used lately is reported (the header\'s kind switch shows it anyway)');
  const plan = M.foldPlan({ present: ['host', 'args', 'worktree'], why: { host: '', worktree: true } });
  ok(eq(plan, { up: ['worktree'], folded: ['host', 'args'] }), 'foldPlan: an unfolded row stands in its card, the rest fold — a row not offered is in neither', plan);
  const chips = M.footerChips({ backend: 'claude', backendLabel: 'Claude', model: '', effortRow: true, effort: 'max', permission: 'bypassPermissions', tools: '✓Read', kind: 'chat', hostRow: true, hostName: '', accountRow: true, account: 'Work', argsRow: true, args: '--verbose', worktreeRow: true, worktree: false }, ['host', 'args']);
  ok(eq(chips.map((c) => c.row), ['backend', 'model', 'effort', 'permission', 'tools', 'host', 'account', 'args']), 'the footer has a chip for every value the run depends on (no worktree chip unticked)', chips.map((c) => c.row));
  ok(chips.find((c) => c.row === 'host').folded && chips.find((c) => c.row === 'args').folded && !chips.find((c) => c.row === 'account').folded, 'a folded row\'s chip is dashed (folded), the others are not — never hidden');
  ok(chips.find((c) => c.row === 'model').word === true && chips.find((c) => c.row === 'model').text === 'Default model', 'an empty model is said in words (the form translates them)');
  ok(eq(M.footerChips({ backend: 'shell', shell: true, kind: 'terminal', hostRow: true }).map((c) => c.row), ['backend', 'host']), 'a plain shell has no model / effort / permission / tools chips');
  ok(M.createRefusal({ cwd: { status: 'empty' } })?.key === 'Choose a folder first', 'an empty folder is refused in words before Create («还不能创建：先选文件夹»)');
  ok(M.createRefusal({ cwd: { status: 'unresolved', text: 'Not applied: …' } })?.text === 'Not applied: …', 'the field\'s own sentence is the refusal when it says why');
  ok(M.createRefusal({ cwd: { status: 'ok', path: '/x' }, modelsNone: true })?.row === 'model' && M.createRefusal({ cwd: { status: 'ok' }, modelsNone: true, noAgent: true }) === null, 'a provider without models refuses (not for a plain shell)');
  ok(M.createRefusal({ cwd: { status: 'ok', path: '/x' } }) === null && M.createRefusal({ cwd: { status: 'missing', path: '/x' } }) === null, 'ok / missing (the create road asks) ⇒ Create may run');
  const row = { kind: 'tools', tools: ['Read', 'Bash', 'WebFetch'], keep: ['Bash'] };
  ok(M.toolCycle(row, 'Read', '') === 'allow' && M.toolCycle(row, 'Read', 'allow') === 'deny' && M.toolCycle(row, 'Read', 'deny') === '', 'a tool chip cycles default → ✓ → ✗ → default');
  ok(M.toolCycle(row, 'Bash', 'allow') === '', 'Bash goes ✓ → default: it never takes ✗ (deny beats allow — the vibespace-* allow rules stay)');
  ok(eq(M.toolPickOf(row, { Read: 'allow', WebFetch: 'deny', Bash: 'deny' }), { allow: ['Read'], deny: ['WebFetch'] }) && M.toolPickOf(row, {}) === null, 'toolPickOf: the chip states as {allow, deny} (a forged ✗ Bash dropped); none ⇒ null');
  const cx = { kind: 'sandbox', sandbox: ['read-only', 'workspace-write'], approval: ['never', 'on-request'] };
  ok(eq(M.toolPickOf(cx, { sandbox: 'read-only', approval: 'bogus' }), { sandbox: 'read-only' }), 'codex: a pick outside the closed words is dropped');
  ok(M.toolChipText(row, { allow: ['Read'], deny: ['WebFetch'] }) === '✓Read ✗WebFetch' && M.toolChipText(cx, { sandbox: 'read-only', approval: 'never' }) === 'read-only · never', 'the chip words of a pick');
  const adapters = [{ id: 'gm', kind: 'gmail', label: 'IR mail' }, { id: 'lk', kind: 'lark', label: 'Co Lark' }, { id: 'sl', kind: 'slack', label: 'Vendor' }, { id: 'agents', kind: 'agents', builtin: true }, { id: 'hid', kind: 'x', listed: false }, { id: 'wh', kind: 'webhook', reach: 'paths' }];
  const grains = { gm: [{ principal: { kind: 'group', id: 'T-ir' }, authority: 'draft', authorityStored: 'send' }], lk: [{ principal: { kind: 'everyone', id: '*' }, authority: 'draft' }], sl: [{ principal: { kind: 'group', id: 'T-other' }, authority: 'send' }] };
  const rows = M.accountRows(adapters, grains, ['T-ir']);
  ok(eq(rows.map((r) => r.id), ['gm', 'lk', 'sl']), 'accountRows: ONE list of the channel accounts — the built-in agents channel, an unlisted one and a non-grant reach are not ticks', rows.map((r) => r.id));
  ok(rows[0].granted && rows[0].authority === 'send' && eq(rows[0].groups, ['T-ir']) && rows[1].granted && rows[1].everyone && !rows[2].granted, 'a picked group\'s (stored send) or everyone\'s row is GRANTED; another group\'s is not');
  ok(M.tickState(rows, {}) === 'none' && M.tickState(rows, { sl: true }) === 'all' && M.tickState(M.accountRows(adapters, {}, []), { gm: true }) === 'some', '无 | 已选 | 全部 follows the tickable rows');
  ok(eq(M.bulkTick(rows, {}, 'all'), { sl: true }) && eq(M.bulkTick(rows, { sl: true }, 'none'), {}), '全部 ticks every tickable row (never a granted one); 无 unticks them');
  ok(eq(M.bulkTick(M.accountRows(adapters, {}, []), {}, 'some', { lk: true }), { lk: true }), '已选 restores the last mixed selection');
  ok(eq(M.toggleGroup(['T-a'], 'T-b'), ['T-a', 'T-b']) && eq(M.toggleGroup(['T-a', 'T-b'], 'T-a'), ['T-b']), 'the group chips keep the order picked (unpick removes one)');
  ok(M.nameHint('/home/u/work/payments/') === 'payments' && M.nameHint('~') === null && M.nameHint('') === null, 'the name\'s placeholder is the folder\'s own name');
  ok(!/^\s*import\b|require\(/m.test(rd('src/lib/new-session-model.js')) && !/^\s*import\b|require\(/m.test(rd('src/new-session-spec.js')), 'both fact modules are PURE (import nothing)');
}

console.log('④ the wiring');
{
  const ws = rd('src/ws-create.js');
  ok(/const spawnGroups = spawnGroupIds\(data\);/.test(ws) && /_initialGroupId: spawnGroups\[0\] \|\| null,\s*\n\s*_initialGroupIds: spawnGroups,/.test(ws), 'ws-create: the session holds the list (its first stays _initialGroupId)');
  ok(/taskId: session\._initialGroupId \|\| null,[^\n]*\n\s*taskIds: session\._initialGroupIds && session\._initialGroupIds\.length \? session\._initialGroupIds : undefined,/.test(ws), 'the meta keeps `taskId` for old pages and adds `taskIds`');
  ok(!/initialGroupId: \(typeof data\.taskId/.test(ws), 'no create-time ask re-reads the single taskId (the browser ladder asks with the list)');
  ok((rd('src/server/boot-restore.js').match(/_initialGroupIds: spawnGroupIds\(meta\)/g) || []).length === 2, 'boot-restore reads the list back on the two paths that restore the spawn group');
  // THE CENSUS: every groupsForSession({… initialGroupId: X._initialGroupId …}) also passes X._initialGroupIds
  const files = ['server.js', ...['src', 'src/server'].flatMap((d) => fs.readdirSync(path.join(REPO, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))];
  const census = (src) => [...src.matchAll(/initialGroupId: ([\w.[\]]+)\._initialGroupId\b(?!s)/g)].filter((m) => !src.slice(m.index, m.index + 200).includes(`initialGroupIds: ${m[1]}._initialGroupIds`)).length;
  const sites = files.reduce((n, f) => n + (rd(f).match(/initialGroupId: [\w.[\]]+\._initialGroupId\b(?!s)/g) || []).length, 0);
  const missing = files.flatMap((f) => (census(rd(f)) ? [f] : []));
  ok(sites >= 15 && missing.length === 0, `every groupsForSession ask that passes the spawn group passes the list too (${sites} sites)`, missing.join(' '));
  ok(census('tasks.groupsForSession({ sessionKey: k, cwd: s.cwd, initialGroupId: s._initialGroupId })') === 1, 'CONTROL: a planted ask without the list is caught');
  const life = rd('src/lib/session-lifecycle.js');
  ok(/taskIds: Array\.isArray\(taskIds\) \? taskIds : undefined,/.test(life) && /const bindIds = \[\.\.\.new Set\(\[taskId, \.\.\.\(Array\.isArray\(taskIds\) \? taskIds : \[\]\), \.\.\.\(extraTaskBinds \|\| \[\]\)\]\.filter\(Boolean\)\)\];/.test(life), 'the page sends taskIds and binds the session to EVERY group picked once its id exists');
  ok(/tools: savedCfg\.tools,/.test(life), 'a resume re-passes the conversation\'s 可用工具 pick (the CLI records none of it)');
  const app = rd('src/lib/app.js');
  ok(/taskId: taskIds\[0\] \|\| undefined,\s*\n\s*taskIds,\s*\n\s*tools: this\._nsToolPick\?\.\(\) \|\| undefined,/.test(app), 'Create sends the groups in order + the tools pick');
  const form = rd('src/lib/new-session-form.js');
  const writes = [...form.matchAll(/method: '(PUT|POST|PATCH|DELETE)'/g)].map((m) => m[1]);
  ok(eq(writes, ['PUT']) && /\/api\/channels\/adapters\/\$\{encodeURIComponent\(acc\.id\)\}\/access`, \{ method: 'PUT'/.test(form) && /withCreateAccess\(st\.access, cid\)/.test(form), 'the right column writes ONE store, through its existing route: the account grain\'s access list (the stamp it read rides as `base`)');
  ok(/pendingBindVerdict\(p, live\)/.test(form), 'the access row waits for the conversation\'s OWN id (the task binds\' own rule)');
}

console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
