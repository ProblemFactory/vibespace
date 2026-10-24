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
//   ⑤ lane new-session-group-folder-link — the folder's ORIGIN (folderOn*): a folder a Task Group gave follows the groups
//      until the person edits it (the owner's × A, + B); the 由名字 chips per state (path-candidates nameChips); the wiring
//   ⑥ lane new-session-layout-v3-build — WHAT CREATE SENDS is PURE (createPlan): for every choice the v2 form offered, the
//      v3 form's same choice (the header's Terminal = a login shell, the harness's own terminal UI = the fold's tick) gives
//      the SAME BYTES as the v2 form's Create (c1dfc1af app.js, transcribed: a depth-1 runner checkout has no c1dfc1af to
//      read) — a 3840-choice matrix over every harness; CONTROL: a plan that drops the tick is caught. The right column READS the left
//      (groupReach), the phone's accordion lines (resourceSummary), a group grant's 「除了」 on its account row
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
  ok(M.unfoldReasons({ tuiDefault: true }).tui === true && M.unfoldReasons({}).tui === false, 'v3: the person\'s own default (Settings: sessions start in the terminal) unfolds the «harness\'s own terminal UI» tick; otherwise it folds (the owner\'s ①: default folded)');
  ok(eq(M.FOLD_ROWS, ['host', 'account', 'args', 'tui', 'worktree']), 'v3: the fold\'s rows in the design\'s order — 机器 · 账号 · 附加参数 · 终端界面 · git worktree', M.FOLD_ROWS);
  const plan = M.foldPlan({ present: ['host', 'args', 'worktree'], why: { host: '', worktree: true } });
  ok(eq(plan, { up: ['worktree'], folded: ['host', 'args'] }), 'foldPlan: an unfolded row stands in its card, the rest fold — a row not offered is in neither', plan);
  const chips = M.footerChips({ backend: 'claude', backendLabel: 'Claude', model: '', effortRow: true, effort: 'max', permission: 'bypassPermissions', tools: '✓Read', kind: 'chat', hostRow: true, hostName: '', accountRow: true, account: 'Work', argsRow: true, args: '--verbose', worktreeRow: true, worktree: false }, ['host', 'args']);
  ok(eq(chips.map((c) => c.row), ['backend', 'model', 'effort', 'permission', 'tools', 'host', 'account', 'args']), 'the footer has a chip for every value the run depends on (no worktree chip unticked)', chips.map((c) => c.row));
  ok(chips.find((c) => c.row === 'host').folded && chips.find((c) => c.row === 'args').folded && !chips.find((c) => c.row === 'account').folded, 'a folded row\'s chip is dashed (folded), the others are not — never hidden');
  ok(chips.find((c) => c.row === 'model').word === true && chips.find((c) => c.row === 'model').text === 'Default model', 'an empty model is said in words (the form translates them)');
  ok(eq(M.footerChips({ backend: 'shell', shell: true, kind: 'terminal', hostRow: true }).map((c) => c.row), ['backend', 'host']), 'a plain shell has no model / effort / permission / tools chips');
  const sh = M.footerChips({ backend: 'shell', shell: true, tui: true, hostRow: true })[0];
  ok(sh.text === 'Terminal · login shell' && sh.word === true, 'v3: the header\'s Terminal says itself on the footer in words («终端 · 登录 shell») — never a backend id', sh);
  const tu = M.footerChips({ backend: 'claude', backendLabel: 'Claude', tui: true, hostRow: true }, ['tui']);
  ok(tu.some((c) => c.row === 'tui' && c.text === 'Harness terminal UI' && c.folded) && !M.footerChips({ backend: 'claude', tui: false }).some((c) => c.row === 'tui'), 'v3: the harness\'s own terminal UI ticked ⇒ its chip («harness 终端界面», dashed while folded); unticked ⇒ none', tu.map((c) => c.row));
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
  ok(M.tickState === undefined && M.bulkTick === undefined, 'v3: the 无 | 已选 | 全部 switch is gone (one or two tickable accounts — the switch was heavier than the rows)');
  const ex = M.accountRows(adapters, grains, ['T-ir'], { gm: [{ kind: 'conversation', key: 'claude:c-1', name: 'Q3 board' }, { kind: 'group', id: 'T-x' }, { kind: 'bogus' }], sl: [{ kind: 'conversation', key: 'c-2' }] });
  ok(ex[0].except.length === 2 && ex[0].except[0].key === 'claude:c-1' && ex[0].except[1].id === 'T-x', 'v3: a granted row carries its grain\'s 「除了」 (a conversation by key, a group by id; a shapeless entry is not drawn)', ex[0].except);
  ok(eq(ex[2].except, []), 'v3: a row no picked group grants draws no 除了 (there is no grant to leave anyone out of)');
  const sm = M.resourceSummary({ rows, ticks: { sl: true } });
  ok(eq(sm, { granted: 2, ticked: 1, todo: 0 }) && eq(M.resourceSummary({ rows, ticks: {} }), { granted: 2, ticked: 0, todo: 1 }), 'v3 phone: the 频道 accordion line — through the groups / ticked here / left to tick (the yellow mark)', sm);
  ok(eq(M.toggleGroup(['T-a'], 'T-b'), ['T-a', 'T-b']) && eq(M.toggleGroup(['T-a', 'T-b'], 'T-a'), ['T-b']), 'the group chips keep the order picked (unpick removes one)');
  ok(M.nameHint('/home/u/work/payments/') === 'payments' && M.nameHint('~') === null && M.nameHint('') === null, 'the name\'s placeholder is the folder\'s own name');
  ok(eq(M.groupReach([{ keys: ['a', 'b'] }, { keys: ['b', 'c'] }]), { groups: 2, sessions: 3 }) && eq(M.groupReach([]), { groups: 0, sessions: 0 }), 'v3: the 「会话」 sentence READS the left column — the groups joined and their sessions, a session in two groups counted once');
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
  ok(/taskId: taskIds\[0\] \|\| undefined,\s*\n\s*taskIds,\s*\n\s*tools: v\.tools \|\| undefined,/.test(rd('src/lib/new-session-model.js')) && /taskIds: this\._nsTaskIds\?\.\(\) \|\| \[\], tools: this\._nsToolPick\?\.\(\) \|\| undefined,/.test(app) && /this\.createSession\(\{ \.\.\.plan\.payload, onCreateResult/.test(app), 'Create sends the groups in order + the tools pick (through the PURE createPlan — lane new-session-layout-v3-build)');
  const form = rd('src/lib/new-session-form.js');
  const writes = [...form.matchAll(/method: '(PUT|POST|PATCH|DELETE)'/g)].map((m) => m[1]);
  ok(eq(writes, ['PUT']) && /\/api\/channels\/adapters\/\$\{encodeURIComponent\(acc\.id\)\}\/access`, \{ method: 'PUT'/.test(form) && /withCreateAccess\(st\.access, cid\)/.test(form), 'the right column writes ONE store, through its existing route: the account grain\'s access list (the stamp it read rides as `base`)');
  ok(/pendingBindVerdict\(p, live\)/.test(form), 'the access row waits for the conversation\'s OWN id (the task binds\' own rule)');
}

console.log('⑤ the folder follows its Task Group until the person edits (lane new-session-group-folder-link)');
{
  const P = require(path.join(REPO, 'src/path-candidates.js'));
  const NONE = { value: '', origin: 'empty', from: null };
  const A = { id: 'T-a', folders: ['/w/studio/'] }, B = { id: 'T-b', folders: ['/w/payments'] }, N = { id: 'T-n', folders: [] };
  const seen = new Set();
  const note = (f) => { seen.add(f.origin); return f; };
  // the owner's sequence: pick 工作 → folder; × it; pick another → the folder changes
  let f = note(M.folderOnOpen({ groups: [] }));
  ok(eq(f, NONE), 'opened with nothing: the folder is empty — and it follows the groups');
  let prev = f; f = note(M.folderOnGroups(f, [A]));
  ok(eq(f, { value: '/w/studio', origin: 'derived-group', from: 'T-a' }) && M.folderShows(prev, f) === '/w/studio', 'add A ⇒ A\'s first folder, DERIVED from A — the field is told to show it', { f, shows: M.folderShows(prev, f) });
  prev = f; f = note(M.folderOnGroups(f, []));
  ok(eq(f, NONE) && M.folderShows(prev, f) === '', 'remove A ⇒ empty again, the field cleared (nothing typed was there)', { f, shows: M.folderShows(prev, f) });
  prev = f; f = note(M.folderOnGroups(f, [B]));
  ok(f.value === '/w/payments' && f.from === 'T-b' && M.folderShows(prev, f) === '/w/payments', 'remove A, add B ⇒ B\'s folder (THE FINDING: the shipped one-shot kept A\'s)', f);
  ok(M.folderShows(f, M.folderOnGroups(f, [B])) === null, 'the same groups again ⇒ nothing to rewrite');
  const two = M.folderOnGroups(M.folderOnGroups(null, [A]), [A, B]);
  ok(two.from === 'T-a' && two.value === '/w/studio', 'two groups ⇒ the FIRST picked group\'s folder', two);
  const next = M.folderOnGroups(two, [B]);
  ok(next.from === 'T-b' && M.folderShows(two, next) === '/w/payments', 'the first of two removed ⇒ the next picked group\'s folder', next);
  ok(M.groupFolder([N, B]).from === 'T-b' && eq(M.groupFolder([N]), NONE), 'a group without a folder passes the turn to the next; none ⇒ empty');
  ok(M.folderOnGroups(M.folderOnGroups(null, [A]), [B, A]).from === 'T-b', 'reordered (B now first) ⇒ B\'s folder');
  // type ⇒ frozen
  const typed = note(M.folderOnEdit(two, '~/mine'));
  ok(typed.origin === 'typed' && typed.value === '~/mine' && M.folderOnGroups(typed, [B]) === typed && M.folderOnGroups(typed, []) === typed, 'type ⇒ FROZEN: adding, removing or reordering groups never moves it', typed);
  ok(M.folderShows(typed, M.folderOnGroups(typed, [B])) === null, '…and the field is never rewritten under the person\'s text');
  // clear the typed text ⇒ derived again (on leaving, or the next group change — never under the caret)
  const cleared = M.folderOnEdit(typed, '   ');
  ok(eq(cleared, NONE), 'clear the typed text ⇒ it follows the groups again (empty for now: nothing is refilled while typing)');
  const left = M.folderOnLeave(cleared, [A, B]);
  ok(left.from === 'T-a' && M.folderShows(cleared, left) === '/w/studio', 'leaving the field empty ⇒ the first group\'s folder again, shown', left);
  ok(M.folderOnGroups(cleared, [B]).from === 'T-b', '…or the next group change derives it');
  ok(M.folderOnLeave(typed, [A]) === typed && M.folderOnLeave(two, [B]) === two, 'leaving changes nothing else (a typed or a derived folder stays)');
  // what the field committed
  ok(M.folderOnCommit(two, { text: '/w/studio', derived: true, how: 'blur' }) === two, 'a commit of the derived text, untouched (info.derived) ⇒ still derived');
  const picked = M.folderOnCommit(two, { text: '~/workspace/studio/测试', derived: false, how: 'pick' });
  ok(picked.origin === 'typed' && picked.value === '~/workspace/studio/测试', 'a pick / a 由名字 chip / the picker ⇒ the person\'s (typed)', picked);
  ok(eq(M.folderOnCommit(null, null), NONE) && eq(M.folderOnCommit(NONE, null), NONE), 'no answer ⇒ nothing changes');
  // the open
  const fromGroup = note(M.folderOnOpen({ cwd: '/w/studio', groups: [A] }));
  ok(fromGroup.origin === 'derived-group' && fromGroup.from === 'T-a', 'opened from a group (its folder + its id) ⇒ derived — it follows', fromGroup);
  ok(M.folderOnGroups(fromGroup, []).origin === 'empty' && M.folderOnGroups(fromGroup, [B]).from === 'T-b', '…so removing that group and picking another changes it');
  const place = note(M.folderOnOpen({ cwd: '/srv/elsewhere', groups: [A] }));
  ok(place.origin === 'prefill-cwd' && place.value === '/srv/elsewhere' && M.folderOnGroups(place, [B]) === place && M.folderShows(null, place) === null, 'opened on a folder (a folder\'s «+») ⇒ the person\'s place: kept through every group change', place);
  ok(M.folderOnCommit(place, { text: '/srv/elsewhere', derived: false, how: 'blur' }) === place, '…and a blur over it unchanged keeps it what it was');
  ok(M.folderOnOpen({ cwd: '', groups: [A] }).from === 'T-a', 'opened with a group and no folder ⇒ the group\'s');
  // the machine
  const H = { id: 'T-h', folders: ['h-mac::/Users/me/p', '/w/local'] };
  ok(M.groupFolder([H], '').value === '/w/local' && M.groupFolder([H], 'h-mac').value === '/Users/me/p', 'a folder declared for one machine counts on that machine only');
  ok([...seen].every((o) => M.FOLDER_ORIGINS.includes(o)) && M.FOLDER_ORIGINS.every((o) => seen.has(o) || o === 'typed') && seen.has('typed'), 'every origin the machine produces is a declared one, and each declared one is produced', [...seen]);
  // RED CONTROL — the shipped rule (new-session-form.js _nsSetGroups at c1dfc1af): the FIRST group picked fills an EMPTY field once
  const base = (steps) => { let cwd = '', ids = []; for (const [op, g] of steps) { const before = ids; ids = op === '+' ? [...ids, g.id] : ids.filter((x) => x !== g.id); if (op === '+' && !before.length && g.folders[0] && !cwd.trim()) cwd = g.folders[0]; } return cwd; };
  ok(base([['+', A], ['-', A], ['+', B]]) === '/w/studio/', 'RED CONTROL: the shipped one-shot keeps A\'s folder after × A, + B (the owner\'s report)', base([['+', A], ['-', A], ['+', B]]));

  // THE 由名字 CHIPS PER STATE (PURE path-candidates nameChips — what the field paints under itself)
  const L = { home: '/home/u', dirs: { '~/workspace/studio': { kids: ['old'] }, '~/workspace/studio/old': { kids: [] }, '~/pay': { kids: [] } } };
  const G1 = { id: 'T-a', name: '工作', color: '#4a8', folders: ['~/workspace/studio'], selected: true }, G2 = { id: 'T-b', name: 'Pay', color: '', folders: ['~/pay'], selected: true };
  ok(eq(P.nameChips({ groups: [G1], listing: L, name: '' }), []) && eq(P.nameChips({ groups: [G1], listing: L, name: '   ' }), []), 'the name empty ⇒ no 由名字 chips (the row says nothing about it)');
  const c1 = P.nameChips({ groups: [G1], listing: L, name: '测试' });
  ok(eq(c1.map((c) => [c.path, c.isNew]), [['~/workspace/studio/测试', true], ['~/测试', true]]) && c1[0].group.name === '工作' && c1[1].group === null, 'name 测试 + 工作 picked ⇒ 新建 ~/workspace/studio/测试, then ~/测试 (the owner\'s screenshot)', c1);
  const c2 = P.nameChips({ groups: [G1, G2], listing: L, name: 'old' });
  ok(eq(c2.map((c) => [c.path, c.isNew]), [['~/workspace/studio/old', false], ['~/pay/old', true], ['~/old', true]]), 'two groups ⇒ one per group in the order picked, then home; a folder that is there is no 新建', c2);
  ok(eq(P.nameChips({ groups: [{ ...G1, selected: false }], listing: L, name: 'x' }).map((c) => c.path), ['~/x']), 'a group offered but not picked gives no 由名字 chip (home only)');
  ok(eq(P.nameChips({ groups: [G1], listing: L, name: 'a/b' }).map((c) => c.path), ['~/workspace/studio/a-b', '~/a-b']), 'a slash in the name never makes a path of two levels');

  // the wiring: the decisions are the PURE ones, the one-shot is gone, the field paints its own chips
  const form = rd('src/lib/new-session-form.js'), app = rd('src/lib/app.js'), pf = rd('src/lib/path-field.js');
  ok(/App\.prototype\._nsSetGroups = function[^]*?this\._nsFolderFollow\(\);/.test(form) && !/!before\.length/.test(form), '_nsSetGroups re-derives through the model (the one-shot `!before.length` prefill is gone)');
  ok(/folderOnEdit\(this\._ns\.folder, e\.target\.value\)/.test(form) && /folderOnCommit\(this\._ns\.folder, info\)/.test(form) && /folderOnLeave\(/.test(form) && /this\._cwdField\.setDerived\(text, \{ note \}\)/.test(form), 'typing, a commit and leaving go through the model; a derived folder is SHOWN through setDerived');
  ok(/kind: 'folder', chips: true, id: 'new-session-cwd'/.test(app) && /onCommit: \(info\) => this\._nsFolderCommitted\?\.\(info\)/.test(app) && !/_fillCwdRecent|paintFolderChips/.test(app), 'New Session switches on the field\'s own chips row (one row) — _fillCwdRecent\'s second painter is retired');
  ok(/this\._nsFolderOpen\(cwd \|\| ''\);/.test(app), 'every open goes through folderOnOpen');
  ok(/const names = nameChips\(inp\)/.test(pf) && /setDerived, refresh,/.test(pf) && /^  paint\(\);   \/\/ the chips row waits for refresh\(\)/m.test(pf), 'the field: PURE nameChips paints the 由名字 chips, setDerived is on the handle, no chips painted at construction (no fetch at boot)');
}

console.log('⑥ what Create sends — the v3 choices give the v2 form\'s bytes (lane new-session-layout-v3-build)');
{
  // THE v2 FORM'S CREATE (c1dfc1af src/lib/app.js, the .btn-create click handler), transcribed over the same control
  // values: the shell road first (terminalOnly(backend) ⇒ openShellTerminal(cwd || undefined, { hostId })), then the
  // createSession object literal in its own order. (Quoted here: the Actions runner's depth-1 checkout has no c1dfc1af.)
  const v2Create = (c) => {
    const backend = c.backend || 'claude'; const hostId = c.hostId || undefined; const cwd = String(c.cwd || '').trim();
    if (c.backend === 'shell') return { shell: [cwd || undefined, { hostId }] };
    const taskIds = c.taskIds || [];
    return { create: { backend, hostId, mode: c.mode, cwd, name: c.name.trim() || M.nameHint(cwd) || '',
      model: c.model === '__custom__' ? (c.modelCustom.trim() || '') : c.model, permission: c.permission, effort: c.effort,
      extraArgs: c.extraArgs.trim(), taskId: taskIds[0] || undefined, taskIds, tools: c.tools || undefined,
      accountId: c.accountId || undefined, browserProfileId: c.browserProfileId || undefined, browserProfileOrigin: c.browserProfileOrigin || undefined,
      worktree: c.worktreeSupported && !!c.worktree } };
  };
  // THE SAME CHOICE IN THE v3 FORM: «Terminal (plain shell)» on the backend row → the header's Terminal (noAgent); Mode
  // «Terminal» with a harness → the fold's tick «Run in the harness's own terminal UI» (tui)
  const v3Create = (c, plan = M.createPlan) => { const p = plan({ ...c, noAgent: c.backend === 'shell', tui: c.mode === 'terminal' }); return p.login ? { shell: [p.login.cwd, { hostId: p.login.hostId }] } : { create: p.payload }; };
  const choices = [];
  for (const backend of ['claude', 'codex', 'opencode', 'antigravity', 'shell']) for (const mode of ['chat', 'terminal']) for (const hostId of ['', 'h-mac'])
    for (const model of ['', 'claude-opus-5-5', '__custom__']) for (const name of ['', '  Roadshow  ']) for (const taskIds of [[], ['T-a', 'T-b']])
      for (const tools of [null, { allow: ['Read'], deny: ['WebFetch'] }]) for (const accountId of ['', 'acc-1']) for (const browserProfileId of ['', 'bp-1'])
        for (const [worktreeSupported, worktree] of [[true, true], [false, true]])
          choices.push({ backend, mode, hostId, cwd: ' /home/u/work/roadshow ', name, model, modelCustom: ' fast ', permission: 'acceptEdits', effort: 'high', extraArgs: ' --verbose ', taskIds, tools, accountId, browserProfileId, browserProfileOrigin: browserProfileId ? 'task-group' : '', worktreeSupported, worktree });
  const diff = choices.filter((c) => JSON.stringify(v2Create(c)) !== JSON.stringify(v3Create(c)));
  ok(choices.length === 3840 && diff.length === 0, `every one of ${choices.length} choices sends the v2 form's bytes (the road, every field, the order)`, diff.slice(0, 2).map((c) => [JSON.stringify(v2Create(c)), JSON.stringify(v3Create(c))]));
  ok(v3Create({ ...choices[0], backend: 'claude', mode: 'terminal' }).create.mode === 'terminal' && v3Create({ ...choices[0], backend: 'claude', mode: 'chat' }).create.mode === 'chat', 'the harness\'s own terminal UI ticked ⇒ mode terminal (ws-create\'s pty-wrapper road); unticked ⇒ the chat');
  const shellPlan = M.createPlan({ noAgent: true, backend: 'shell', cwd: '', hostId: '' });
  ok(eq(shellPlan, { login: { cwd: undefined, hostId: undefined } }), 'the header\'s Terminal ⇒ a login shell (openShellTerminal) — no payload, no harness', shellPlan);
  // CONTROL: a plan that forgets the tick (always the chat) — the matrix must say no
  const noTick = (v) => { const p = M.createPlan(v); if (p.payload) p.payload.mode = 'chat'; return p; };
  const caught = choices.filter((c) => JSON.stringify(v2Create(c)) !== JSON.stringify(v3Create(c, noTick))).length;
  const want = choices.filter((c) => c.backend !== 'shell' && c.mode === 'terminal').length;
  ok(caught === want && want === 1536, `CONTROL: a plan that drops the terminal-UI tick differs on exactly the harness × terminal choices (${caught} of ${want})`);
}

console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
