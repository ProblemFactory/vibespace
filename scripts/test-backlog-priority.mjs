#!/usr/bin/env node
// BACKLOG PRIORITY + OWNERSHIP-AWARE SELECTION (2026-09-22, owner: "没必要设上限，
// 只要有合适的 priority 分级和 ownership，每次 push 能选择正确的条目就行"). The
// store keeps every item; what a READ shows is decided by src/backlog-select.js.
// Legs: (1) PURE sortBacklog / selectReminders (order, newest-first within a
// priority, owned-first, the unclaimed-HIGH surfacing, limit, othersCount) +
// a NEGATIVE CONTROL (a patched copy that sorts oldest-first fails the order
// leg); (2) STORE — priority normalized by update(), TASK.md sorted with
// markers, the repo-file export/import round-trip keeps it, an old
// marker-less line = normal, a priority change rides the diff; (3) ROUTE — the
// REAL /api/agent/task-backlog on the fake-express harness: add with a
// priority is stored, an invalid value is a 400 that stores nothing, edit
// changes it, GET task lists in sortBacklog order with `you`, a NUMBER ref
// resolves in that same order; (4) INJECTION — `_backlogNoteLines` for a
// session owning 8 items shows its 5 highest-priority newest ones + the
// unclaimed-HIGH line + the count; (5) the REAL CLI (data/bin/vibespace-task)
// against the real route over loopback http: `--priority` reaches the store,
// the listing carries the markers and the (you)/(unclaimed)/(claimed by N)
// tails; (6) wiring pins; (7) the Task Group log's Backlog tab — sortBacklog
// over rows that keep their store index, the Priority write through the real
// store, source pins (comments stripped) each with a cut-copy negative
// control, theme-var-only chip CSS, zh+ja keys. r2 (verifier findings): (2b) a
// marker-like TEXT ("! …" / "↓ …") survives the repo-file round trip, a
// pre-priority file is read verbatim — control: the pre-fix writer/reader;
// (3b) a NUMBER is the item the caller was SHOWN under it (store order ≠
// sorted order; another session's add in between) — control: the pre-fix
// numbering; (4b) the unclaimed-HIGH line's byte budget, shared across
// groups, and claimants no longer running — each with a control.
// Run: node scripts/test-backlog-priority.mjs
import './scratch.mjs';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sel = require('../src/backlog-select.js');
const { TaskGroupManager } = require('../src/task-groups.js');
const { setupAgentRoutes } = require('../src/agent-routes.js');

let failed = 0, passed = 0;
const check = (name, cond, extra) => { if (typeof cond !== 'boolean') throw new TypeError(`check: its condition is a ${typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`);
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-backlog-prio-'));
// a PATCHED COPY of a src module in the scratch dir, its relative requires
// pointed back at the real tree — the negative controls load these
let patchN = 0;
const loadPatched = (rel, cuts) => {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  let out = src;
  for (const [a, b] of cuts) { if (!out.includes(a)) throw new Error(`patch anchor missing in ${rel}: ${a.slice(0, 60)}`); out = out.split(a).join(b); }
  out = out.replace(/require\('(\.\.?\/[^']+)'\)/g, (_, m) => `require(${JSON.stringify(path.join(REPO, path.dirname(rel), m))})`);   // './x' and '../x' (B-0248 step 3: a copy of a src/server module)
  // bare package names resolve from the real tree's node_modules (builtins resolve to themselves)
  out = out.replace(/require\('([a-z@][^'.][^']*)'\)/g, (_, m) => `require(${JSON.stringify(require.resolve(m, { paths: [path.join(REPO, path.dirname(rel))] }))})`);
  const f = path.join(tmp, `patched-${patchN++}-${path.basename(rel)}`);
  fs.writeFileSync(f, out);
  return require(f);
};

// ── (1) PURE ──
console.log('(1) pure selection');
const fixture = () => [
  { id: 'B-0001', text: 'normal old', status: 'open', priority: 'normal', addedAt: 100, claimedBy: ['me'] },
  { id: 'B-0002', text: 'low new', status: 'open', priority: 'low', addedAt: 900, claimedBy: ['me'] },
  { id: 'B-0003', text: 'high old', status: 'open', priority: 'high', addedAt: 200, claimedBy: [] },
  { id: 'B-0004', text: 'done late', status: 'done', priority: 'high', addedAt: 50, resolvedAt: 2000, claimedBy: ['me'] },
  { id: 'B-0005', text: 'high new', status: 'open', priority: 'high', addedAt: 800, claimedBy: ['me'] },
  { id: 'B-0006', text: 'legacy (no priority)', status: 'open', addedAt: 500, claimedBy: ['other'] },
  { id: 'B-0007', text: 'dropped early', status: 'dropped', addedAt: 60, resolvedAt: 1000, claimedBy: [] },
  { id: 'B-0008', text: 'normal tie b', status: 'open', priority: 'normal', addedAt: 300, claimedBy: [] },
  { id: 'B-0009', text: 'bogus priority', status: 'open', priority: 'URGENT', addedAt: 300, claimedBy: [] },
];
const ORDER = ['B-0005', 'B-0003', 'B-0006', 'B-0008', 'B-0009', 'B-0001', 'B-0002', 'B-0004', 'B-0007'];
const orderLeg = (mod) => mod.sortBacklog(fixture()).map((b) => b.id).join(',') === ORDER.join(',');
check('PRIORITIES is the closed set high,normal,low', sel.PRIORITIES.join(',') === 'high,normal,low');
check('priorityRank: high 0 · normal 1 · low 2 · unknown/absent = normal', sel.priorityRank('high') === 0 && sel.priorityRank('normal') === 1 && sel.priorityRank('low') === 2 && sel.priorityRank('URGENT') === 1 && sel.priorityRank(undefined) === 1);
check('sortBacklog: open by priority, NEWEST first within one (ties by id; unknown = normal), then resolved by resolvedAt desc', verdictOf(orderLeg(sel)), sel.sortBacklog(fixture()).map((b) => b.id).join(','));
{ const f = fixture(); const before = f.map((b) => b.id).join(','); sel.sortBacklog(f); check('sortBacklog never mutates its input', f.map((b) => b.id).join(',') === before); }
{
  const open = fixture().filter((b) => (b.status || 'open') === 'open');
  const r = sel.selectReminders(open, 'me', { limit: 5 });
  check('selectReminders.mine = MY claimed open items in sortBacklog order', r.mine.map((b) => b.id).join(',') === 'B-0005,B-0001,B-0002', r.mine.map((b) => b.id).join(','));
  check('mineTotal counts all of mine', r.mineTotal === 3);
  check('unclaimedHigh = open HIGH items nobody claimed (ids + text), never a claimed or resolved one', JSON.stringify(r.unclaimedHigh) === JSON.stringify([{ id: 'B-0003', text: 'high old' }]), JSON.stringify(r.unclaimedHigh));
  check('othersCount = open items not claimed by me', r.othersCount === open.length - 3);
  const r1 = sel.selectReminders(open, 'me', { limit: 1 });
  check('limit bounds mine (and keeps the highest)', r1.mine.length === 1 && r1.mine[0].id === 'B-0005' && r1.mineTotal === 3);
  const rn = sel.selectReminders(open, null);
  check('no session key ⇒ nothing is "mine", the unclaimed HIGH still surfaces', rn.mine.length === 0 && rn.unclaimedHigh.length === 1 && rn.othersCount === open.length);
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `B-10${i}0`, text: `h${i}`, status: 'open', priority: 'high', addedAt: i, claimedBy: [] }));
  const rm = sel.selectReminders(many, 'me', { limit: 5 });
  check('unclaimedHigh is bounded by limit, newest first, with the total', rm.unclaimedHigh.length === 5 && rm.unclaimedHigh[0].text === 'h7' && rm.unclaimedHighTotal === 8);
}
check('priorityMarker: ! high · ↓ low · none for normal/unknown', sel.priorityMarker('high') === '!' && sel.priorityMarker('low') === '↓' && sel.priorityMarker('normal') === '' && sel.priorityMarker('x') === '');
{
  // NEGATIVE CONTROL — a patched copy that sorts OLDEST first must fail the order leg
  const src = fs.readFileSync(path.join(REPO, 'src/backlog-select.js'), 'utf8');
  const patched = src.replace('(num(b.addedAt) - num(a.addedAt))', '(num(a.addedAt) - num(b.addedAt))');
  // the copy's relative require (the PURE belt, lane peer-census verify r4 F1) pointed back at the tree, like every patched copy here
  const bad = loadPatched('src/backlog-select.js', [['(num(b.addedAt) - num(a.addedAt))', '(num(a.addedAt) - num(b.addedAt))']]);
  check('negative control: the patch applied', patched !== src);
  check('negative control: an oldest-first copy FAILS the order leg', !orderLeg(bad));
}

// ── (2) STORE ──
console.log('(2) store');
const tasks = new TaskGroupManager({ dataDir: tmp, onChange: () => {} });
const cwd = path.join(tmp, 'work'); fs.mkdirSync(cwd, { recursive: true });
const ctx = path.join(tmp, 'ctx'); fs.mkdirSync(ctx, { recursive: true });
const g = tasks.create({ title: 'prio', objective: 'obj', folders: [cwd], contextDir: ctx });
{
  const out = tasks.update(g.id, { backlog: [
    { text: 'a', status: 'open', priority: 'high', addedAt: 1 },
    { text: 'b', status: 'open', priority: 'HIGH', addedAt: 2 },
    { text: 'c', status: 'open', addedAt: 3 },
    { text: 'd', status: 'open', priority: 'low', addedAt: 4 },
  ] }).backlog;
  check('update(): high/low kept, an unknown value and an absent one normalized to normal', out.map((b) => b.priority).join(',') === 'high,normal,normal,low', out.map((b) => b.priority).join(','));
  await tasks.mirrorIdle();   // lane cli-call-timeouts: TASK.md is mirrored OFF the store write (queued, bounded) — wait for the copy to land
  const md = fs.readFileSync(path.join(ctx, '.vibespace', 'TASK.md'), 'utf8');
  const lines = md.split('\n').filter((l) => /^- \[B-/.test(l));
  check('TASK.md lists open items in sortBacklog order with the markers (high `!`, low `↓`)', lines.length === 4 && gateOf(/ ! a /.test(lines[0] + ' ')) && gateOf(/ c /.test(lines[1] + ' ')) && gateOf(/ b /.test(lines[2] + ' ')) && verdictOf(/ ↓ d /.test(lines[3] + ' ')), lines.join(' | '));
  // repo-file round-trip
  const file = path.join(tmp, 'repo', 'task.md');
  await tasks.exportToFile(g.id, file);
  const txt = fs.readFileSync(file, 'utf8');
  check('repo file carries the markers after the id', gateOf(/\] \[B-[0-9a-f]+\] ! a$/m.test(txt)) && gateOf(/\] \[B-[0-9a-f]+\] ↓ d$/m.test(txt)) && verdictOf(/\] \[B-[0-9a-f]+\] c$/m.test(txt)), txt);
  tasks.update(g.id, { backlog: out.map((b) => ({ ...b, priority: 'normal' })) });
  const back = tasks.importFromFile(file).backlog;
  check('import round-trip restores every priority (and keeps the text without the marker)', back.map((b) => `${b.text}:${b.priority}`).join(',') === 'a:high,b:normal,c:normal,d:low', back.map((b) => `${b.text}:${b.priority}`).join(','));
  // an OLD file (no markers) = normal; an id-less marker line still parses
  const old = txt.replace(/ ! a$/m, ' a').replace(/ ↓ d$/m, ' d').replace(/^- \[ \] \[B-[0-9a-f]+\] c$/m, '- [ ] ↓ c-no-id');
  fs.writeFileSync(file, old);
  const back2 = tasks.importFromFile(file).backlog;
  check('an old marker-less line imports as normal; an id-less marker line still carries its priority', back2.find((b) => b.text === 'a')?.priority === 'normal' && back2.find((b) => b.text === 'd')?.priority === 'normal' && back2.find((b) => b.text === 'c-no-id')?.priority === 'low', back2.map((b) => `${b.text}:${b.priority}`).join(','));
  // bundle import normalizes too
  const n = tasks.importBundle({ tasks: [{ id: 'T-260922-bundle', title: 'bundle', backlog: [{ text: 'x', priority: 'low' }, { text: 'y', priority: 42 }] }] });
  check('config-bundle import keeps a valid priority and normalizes a bogus one', n === 1 && tasks.get('T-260922-bundle').backlog.map((b) => b.priority).join(',') === 'low,normal');
  // the diff announces a priority change
  const snap = tasks.snapshotForDiff(g.id);
  const cur = tasks.get(g.id).backlog.map((b) => ({ ...b }));
  cur[0].priority = 'high'; cur[0].claimedBy = ['claude:sess1'];
  tasks.update(g.id, { backlog: cur });
  const d = tasks.diffChanges(g.id, { ...snap, backlog: snap.backlog.map((b, i) => (i === 0 ? { ...b, claimedBy: ['claude:sess1'] } : b)) }, { sessionKey: 'claude:sess1' });
  check('a priority change rides the diff to the owner', gateOf(d) && verdictOf(d.lines.some((l) => /^- Backlog priority normal → high \[B-/.test(l))), d && d.lines.join(' | '));
  const dOld = tasks.diffChanges(g.id, { ...snap, backlog: snap.backlog.map((b) => { const { p, ...rest } = b; return { ...rest, claimedBy: ['claude:sess1'] }; }) }, { sessionKey: 'claude:sess1' });
  check('a pre-priority snapshot (no `p`) is not read as a priority change', gateOf(dOld) && !dOld.lines.some((l) => /Backlog priority/.test(l)));
}

// ── (2b) the repo task file never turns TEXT into a marker ──
console.log('(2b) repo-file marker-like text');
{
  const TEXTS = [['! not urgent, just exclaiming', 'normal'], ['↓ arrow text normal', 'normal'], ['! shouting and high', 'high'], ['\\! already escaped', 'low'], ['!bang no space', 'normal'], ['plain', 'high']];
  const elsewhere = path.join(tmp, 'elsewhere'); fs.mkdirSync(elsewhere, { recursive: true }); // not the route session's cwd — never a second membership
  const g2 = tasks.create({ title: 'esc', objective: 'o', folders: [elsewhere] });
  const roundTrip = async (mgr) => {
    mgr.update(g2.id, { backlog: TEXTS.map(([text, priority], i) => ({ text, priority, addedAt: i + 1 })) });
    const f = path.join(tmp, 'repo', `esc-${patchN++}.md`);
    await mgr.exportToFile(g2.id, f);
    mgr.update(g2.id, { backlog: [] });
    return { txt: fs.readFileSync(f, 'utf8'), back: mgr.importFromFile(f).backlog.map((b) => [b.text, b.priority]) };
  };
  const { txt, back } = await roundTrip(tasks);
  check('every text + priority survives the export/import round trip (a normal "! …" / "↓ …" stays normal, its prefix kept)', JSON.stringify(back) === JSON.stringify(TEXTS), JSON.stringify(back));
  check('the writer declares `backlog_priority: markers` and escapes a marker-like normal text as `\\! …`', gateOf(/^backlog_priority: markers$/m.test(txt)) && gateOf(/\] \\! not urgent/.test(txt)) && gateOf(/\] \\↓ arrow/.test(txt)) && verdictOf(/\] ! \\! shouting/.test(txt)), txt);
  // a file written BEFORE priorities (no frontmatter key, no escaping) is read verbatim
  const oldFile = path.join(tmp, 'repo', 'pre-priority.md');
  fs.writeFileSync(oldFile, ['---', `vibespace_task: ${g2.id}`, 'title: "esc"', 'kind: task', 'archived: false', 'color: null', '---', '', '# esc', '', '## Objective', '', 'o', '', '## Backlog', '', '- [ ] [B-00aa] ! exclaiming text', '- [ ] [B-00ab] ↓ arrow text', '- [x] [B-00ac] done thing', ''].join('\n'));
  const oldBack = tasks.importFromFile(oldFile).backlog.map((b) => [b.text, b.priority, b.status]);
  check('a pre-priority file (no `backlog_priority` key) imports VERBATIM: "! …" stays text, every item normal', JSON.stringify(oldBack) === JSON.stringify([['! exclaiming text', 'normal', 'open'], ['↓ arrow text', 'normal', 'open'], ['done thing', 'normal', 'done']]), JSON.stringify(oldBack));
  // TASK.md prints the same escaped form
  tasks.update(g2.id, { backlog: [{ text: '! bang normal', addedAt: 1 }, { text: 'hi', priority: 'high', addedAt: 2 }] });
  const md2 = tasks.renderTaskMd(tasks.get(g2.id), 50);
  check('TASK.md escapes a marker-like normal text too (`[B-x] \\! bang normal`), a real high reads `[B-x] ! hi`', gateOf(/\[B-[0-9a-f]+\] \\! bang normal/.test(md2)) && verdictOf(/\[B-[0-9a-f]+\] ! hi/.test(md2)), md2);
  // NEGATIVE CONTROL — the pre-fix writer (marker only, no escape, no key) + the pre-fix reader
  const Bad = loadPatched('src/task-groups.js', [
    ["} ${markedText(b)}`);\n        if (b.detail) for (const dl of b.detail.split('\\n')) body.push(`  > ${dl}`);", "}${priorityMarker(b.priority) ? ' ' + priorityMarker(b.priority) : ''} ${b.text}`);\n        if (b.detail) for (const dl of b.detail.split('\\n')) body.push(`  > ${dl}`);"],
    ["const markersOn = fm.backlog_priority === 'markers';", 'const markersOn = true;'],
    ['const txt = markersOn ? unescapeItemText(bm[4].trim()) : bm[4].trim();', 'const txt = bm[4].trim();'],
    ['normalizePriority, markedText,', 'normalizePriority, priorityMarker, markedText,'],
  ]).TaskGroupManager;
  const badMgr = new Bad({ dataDir: fs.mkdtempSync(path.join(tmp, 'bad-')), onChange: () => {} });
  const bg = badMgr.create({ title: 'esc', objective: 'o', folders: [cwd] });
  badMgr.update(bg.id, { backlog: TEXTS.map(([text, priority], i) => ({ text, priority, addedAt: i + 1 })) });
  const bf = path.join(tmp, 'repo', 'bad.md'); await badMgr.exportToFile(bg.id, bf); badMgr.update(bg.id, { backlog: [] });
  const badBack = badMgr.importFromFile(bf).backlog.map((b) => [b.text, b.priority]);
  check('negative control: the pre-fix writer/reader flips "! not urgent…" to high and drops its prefix', JSON.stringify(badBack) !== JSON.stringify(TEXTS) && badBack[0][1] === 'high' && badBack[0][0] === 'not urgent, just exclaiming', JSON.stringify(badBack));
}

// ── (3) ROUTE ──
console.log('(3) route');
const routes = {};
const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
const session = { agentToken: 'vsst_test', backend: 'claude', cwd, name: 't' };
setupAgentRoutes({
  app, activeSessions: new Map([['sess1', session]]), tasks,
  sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => {} },
  SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
  userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
  sessionStatusKey: (s, id) => `claude:${id}`,
  serverSetting: () => undefined,
  scheduleCtxSync: () => {},
  remoteCtxBaseFor: () => null,
});
const call = (method, p, body) => {
  let out, code = 200;
  const req = { headers: { authorization: 'Bearer vsst_test' }, query: {}, body: body || {} };
  const res = { json: (o) => { out = o; return res; }, status: (c) => { code = c; return res; } };
  routes[`${method} ${p}`](req, res);
  // lane lg-store-writes, the census cure (the hunt's finding 2): every writing backlog verb answers once task-groups.json holds it —
  // a route not answered in its own run is answered when the suite lands the writer's owed writes, LOUDLY
  if (out === undefined) { const r = require('../src/store-writer.js').storeWriter().flushSync(); if (r.left && r.left.length) throw new Error(`the store writer left owed writes: ${JSON.stringify(r.left)}`); }
  return { out, code };
};
tasks.update(g.id, { backlog: [] });
// B-55dc: an agent's right to its group is decided on a READ answer (the deciding door awaits the cwd's first realpath off the
// loop — a symlinked cwd could reach another folder); this rig calls the route synchronously, so that read lands first
await tasks.groupsForSessionDecided({ cwd });
{
  const r = call('POST', '/api/agent/task-backlog', { add: 'urgent thing', priority: 'high' });
  check('add with priority high → stored high, echoed', r.code === 200 && r.out.item?.priority === 'high' && tasks.get(g.id).backlog[0].priority === 'high', JSON.stringify(r.out).slice(0, 200));
  const r0 = call('POST', '/api/agent/task-backlog', { add: 'plain thing' });
  check('add without priority → normal', r0.code === 200 && r0.out.item?.priority === 'normal');
  const rBad = call('POST', '/api/agent/task-backlog', { add: 'bad thing', priority: 'urgent' });
  check('add with a value outside the set → 400 naming the set, nothing stored', rBad.code === 400 && gateOf(/high, normal, low/.test(rBad.out.error || '')) && tasks.get(g.id).backlog.length === 2, JSON.stringify(rBad.out));
  const rLow = call('POST', '/api/agent/task-backlog', { add: 'someday', priority: 'low' });
  const rE = call('POST', '/api/agent/task-backlog', { edit: r0.out.item.id, priority: 'low' });
  check('edit priority → stored, the edit echoes its item BY ID', rE.code === 200 && rE.out.item?.id === r0.out.item.id && rE.out.item?.priority === 'low' && tasks.get(g.id).backlog.find((b) => b.id === r0.out.item.id).priority === 'low', JSON.stringify(rE.out).slice(0, 200));
  const rEBad = call('POST', '/api/agent/task-backlog', { edit: r0.out.item.id, priority: 'medium' });
  check('edit with an invalid priority → 400, unchanged', rEBad.code === 400 && tasks.get(g.id).backlog.find((b) => b.id === r0.out.item.id).priority === 'low');
  const rG = call('GET', '/api/agent/task');
  check('GET task lists open items in sortBacklog order, carrying priority + `you`', rG.out.you === 'claude:sess1' && rG.out.task.backlog[0].id === r.out.item.id && verdictOf(rG.out.task.backlog.every((b) => typeof b.priority === 'string')), JSON.stringify(rG.out.task.backlog.map((b) => [b.text, b.priority])));
  const rP = call('POST', '/api/agent/task-backlog', { show: '1' });
  check('a NUMBER ref resolves in the same sorted order (1 = the high item)', rP.code === 200 && rP.out.item?.id === r.out.item.id, JSON.stringify(rP.out).slice(0, 200));
  check('the POST answer lists open items in the same order', JSON.stringify(rLow.out.backlog.map((b) => b.id)) === JSON.stringify(sel.sortBacklog(rLow.out.backlog).map((b) => b.id)) && rLow.out.backlog[0].priority === 'high');
}

// ── (3b) a NUMBER is the item the caller was SHOWN under it ──
console.log('(3b) numbers = the list you were shown');
const twoSessionRoutes = (mod) => {
  const r = {};
  const app2 = { get: (p, h) => { r[`GET ${p}`] = h; }, post: (p, h) => { r[`POST ${p}`] = h; } };
  mod.setupAgentRoutes({
    app: app2, activeSessions: new Map([['sa', { agentToken: 'vsst_a', backend: 'claude', cwd, name: 'a' }], ['sb', { agentToken: 'vsst_b', backend: 'claude', cwd, name: 'b' }]]), tasks,
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => {} },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (s, id) => `claude:${id}`, serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null,
  });
  return (tok, method, p, body) => {
    let out, code = 200;
    const res = { json: (o) => { out = o; return res; }, status: (c) => { code = c; return res; } };
    r[`${method} ${p}`]({ headers: { authorization: `Bearer ${tok}` }, query: {}, body: body || {} }, res);
    // the census cure (finding 2): a writing backlog verb answers once task-groups.json holds it — the owed writes land, LOUDLY
    if (out === undefined) { const w = require('../src/store-writer.js').storeWriter().flushSync(); if (w.left && w.left.length) throw new Error(`the store writer left owed writes: ${JSON.stringify(w.left)}`); }
    return { out, code };
  };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the store order (oldest first) and the numbered order (newest first) DIFFER
const seedABC = async (as) => { tasks.update(g.id, { backlog: [] }); for (const t of ['A', 'B', 'C']) { as('vsst_a', 'POST', '/api/agent/task-backlog', { add: t }); await sleep(3); } };
const numberLegs = async (mod) => {
  const as = twoSessionRoutes(mod);
  const r = {};
  await seedABC(as);
  r.fresh = as('vsst_a', 'POST', '/api/agent/task-backlog', { show: '1' }).out?.item?.text; // never listed ⇒ the live sorted order
  r.listing = as('vsst_a', 'GET', '/api/agent/task').out.task.backlog.map((b) => b.text).join('');
  r.show1 = as('vsst_a', 'POST', '/api/agent/task-backlog', { show: '1' }).out?.item?.text;
  as('vsst_a', 'POST', '/api/agent/task-backlog', { edit: '1', text: 'EDITED' });
  r.afterEdit = tasks.get(g.id).backlog.map((b) => b.text).join(',');
  // two sessions: a lists, b parks D, a resolves #3 (= A as printed)
  await seedABC(as);
  as('vsst_a', 'GET', '/api/agent/task');
  await sleep(3);
  as('vsst_b', 'POST', '/api/agent/task-backlog', { add: 'D' });
  const d = as('vsst_a', 'POST', '/api/agent/task-backlog', { done: '3' });
  r.done3 = tasks.get(g.id).backlog.filter((b) => b.status === 'done').map((b) => b.text).join(',');
  r.doneEcho = d.out?.item?.text;
  // a has not relisted: #2 is still B, #3 (A) is now resolved ⇒ refused, nothing changes
  const again = as('vsst_a', 'POST', '/api/agent/task-backlog', { drop: '3' });
  r.againCode = again.code; r.againErr = again.out?.error || '';
  r.dropped = tasks.get(g.id).backlog.filter((b) => b.status === 'dropped').length;
  const far = as('vsst_a', 'POST', '/api/agent/task-backlog', { done: '9' });
  r.farCode = far.code; r.farErr = far.out?.error || '';
  // b never listed: its numbers are the LIVE sorted open list (D, C, B)
  r.bShow1 = as('vsst_b', 'POST', '/api/agent/task-backlog', { show: '1' }).out?.item?.text;
  return r;
};
{
  const r = await numberLegs({ setupAgentRoutes });
  check('never listed: `show 1` = the newest item (the live sorted order), not the oldest stored', r.fresh === 'C', r.fresh);
  check('the listing numbers 1=C 2=B 3=A (store order is A,B,C)', r.listing === 'CBA', r.listing);
  check('`show 1` = C, the item the listing printed as 1', r.show1 === 'C', r.show1);
  check('`edit 1` rewrites C (store A,B,EDITED), never the oldest stored item', r.afterEdit === 'A,B,EDITED', r.afterEdit);
  check("another session's add does not move a number: `done 3` resolves A, the item a was shown as 3", r.done3 === 'A', r.done3);
  check('done echoes the item it resolved (by id)', r.doneEcho === 'A', String(r.doneEcho));
  check('a number whose shown item is already resolved is REFUSED by name, nothing changes', r.againCode === 400 && gateOf(/already done/.test(r.againErr)) && gateOf(/\bA\b/.test(r.againErr)) && r.dropped === 0, `${r.againCode} ${r.againErr}`);
  check('a number past the shown list is refused, naming the list and the id route', r.farCode === 400 && verdictOf(/no item #9 in the backlog list you were last shown \(3 items\)/.test(r.farErr)), r.farErr);
  check('a session that never listed resolves against the live sorted open list', r.bShow1 === 'D', r.bShow1);
  // NEGATIVE CONTROL — the pre-fix numbering: store order when openOnly is off, the live order otherwise, no snapshot
  const bad = await numberLegs(loadPatched('src/agent-routes.js', [[
    "const ids = shown || sortBacklog(backlog.filter((b) => b.status === 'open')).map((b) => b.id);",
    "const ids = (openOnly ? sortBacklog(backlog.filter((b) => b.status === 'open')) : backlog).map((b) => b.id);",
  ]]));
  check('negative control: the pre-fix numbering shows A for 1 and edits A', bad.show1 === 'A' && bad.afterEdit === 'EDITED,B,C', `${bad.show1} ${bad.afterEdit}`);
  check('negative control: the pre-fix numbering resolves B for `done 3` after the other add', bad.done3 === 'B', bad.done3);
}

// ── (4) INJECTION ──
console.log('(4) injection');
{
  const me = 'claude:sess1';
  const owned = [
    ['o-low-new', 'low', 900], ['o-norm-1', 'normal', 100], ['o-high-1', 'high', 200], ['o-norm-2', 'normal', 700],
    ['o-high-2', 'high', 600], ['o-norm-3', 'normal', 400], ['o-low-old', 'low', 50], ['o-norm-4', 'normal', 300],
  ].map(([text, priority, addedAt]) => ({ text, priority, addedAt, status: 'open', claimedBy: [me] }));
  const others = [
    { text: 'free-high-A', priority: 'high', addedAt: 10, status: 'open', claimedBy: [] },
    { text: 'free-high-B', priority: 'high', addedAt: 20, status: 'open', claimedBy: [] },
    { text: 'taken-high', priority: 'high', addedAt: 30, status: 'open', claimedBy: ['codex:x'] },
    { text: 'free-normal', priority: 'normal', addedAt: 40, status: 'open', claimedBy: [] },
    { text: 'resolved-high', priority: 'high', addedAt: 45, status: 'done', claimedBy: [] },
  ];
  tasks.update(g.id, { backlog: [...owned, ...others] });
  const lines = tasks._backlogNoteLines(tasks.get(g.id), { sessionKey: me });
  const itemLines = lines.filter((l) => /^- \[B-/.test(l));
  const texts = itemLines.map((l) => l.replace(/^- \[B-[0-9a-f]+\] (?:[!↓] )?/, '').replace(/ †$/, ''));
  check('an 8-owned session sees its 5 highest-priority newest items, in order', texts.join(',') === 'o-high-2,o-high-1,o-norm-2,o-norm-3,o-norm-4', texts.join(','));
  check('owned high items carry the `!` marker', verdictOf(itemLines[0].includes('] ! o-high-2')));
  check('the "+N more claimed by you" line counts the rest', verdictOf(lines.some((l) => l === '- … +3 more claimed by you')));
  const hl = lines.filter((l) => l.startsWith('- unclaimed HIGH: '));
  check('ONE unclaimed-HIGH line naming the unowned high items (newest first), never a claimed/resolved one', hl.length === 1 && gateOf(/\[B-[0-9a-f]+\] free-high-B · \[B-[0-9a-f]+\] free-high-A/.test(hl[0])) && !/taken-high|resolved-high/.test(hl[0]), hl.join(' | '));
  check('the count line follows (12 open incl. 4 not claimed by you)', verdictOf(/^\(group backlog holds 12 open parked items incl\. 4 not claimed by you/.test(lines[lines.length - 1])), lines[lines.length - 1]);
  const other = tasks._backlogNoteLines(tasks.get(g.id), { sessionKey: 'codex:nobody' });
  check('a session owning nothing gets the pointer line AND the unclaimed-HIGH line', gateOf(/^Group backlog: 12 open/.test(other[1])) && gateOf(other.some((l) => l.startsWith('- unclaimed HIGH: '))) && !other.some((l) => /^- \[B-/.test(l)));
  check('task tool off ⇒ no backlog lines at all', tasks._backlogNoteLines(tasks.get(g.id), { sessionKey: me, tools: { task: false } }).length === 0);
  const ctxText = tasks.renderContext(g.id, { sessionKey: me });
  check('renderContext carries the same selection', gateOf(ctxText.includes('- unclaimed HIGH: ')) && verdictOf(ctxText.includes('] ! o-high-2')));
}

// ── (4b) the unclaimed-HIGH line: a BYTE budget, one budget across groups, dead owners ──
console.log('(4b) unclaimed-HIGH budget + dead owners');
{
  const cjk = (n) => '高优先级事项需要处理'.repeat(10).slice(0, 100) + n;
  const highs = (tag) => Array.from({ length: 5 }, (_, i) => ({ text: `${cjk(i)}${tag}`, priority: 'high', addedAt: i + 1, status: 'open', claimedBy: [] }));
  const gs = ['m1', 'm2', 'm3'].map((t) => { const x = tasks.create({ title: t, objective: 'o', folders: [path.join(tmp, 'elsewhere')] }); tasks.update(x.id, { backlog: highs(t) }); return x.id; });
  const lineOf = (lines) => lines.find((l) => l.startsWith('- unclaimed HIGH: ')) || '';
  const one = lineOf(tasks._backlogNoteLines(tasks.get(gs[0]), { sessionKey: 'claude:x' }));
  const bytes = Buffer.byteLength(one, 'utf-8');
  check('one group: 5 CJK high items of 100 chars — the line stays ≤ 600 B of text + its fixed tail (≤ 800 B), the rest by id', bytes <= 800 && verdictOf(/\[B-[0-9a-f]+\]( ·|  _)/.test(one)), `${bytes} B: ${one.slice(0, 120)}`);
  const unbudgeted = lineOf(tasks._backlogNoteLines(tasks.get(gs[0]), { sessionKey: 'claude:x', highBudget: { bytes: 1e9 } }));
  check('negative control: without the budget the same line is > 1400 B (the pre-fix growth)', Buffer.byteLength(unbudgeted, 'utf-8') > 1400, String(Buffer.byteLength(unbudgeted, 'utf-8')));
  const multi = tasks.renderMultiContext(gs, { sessionKey: 'claude:x' });
  const hl = multi.split('\n').filter((l) => l.startsWith('- unclaimed HIGH: '));
  check('multi-group: ONE shared budget — the later groups name their high items by id only', hl.length === 3 && !/[高]/.test(hl[1]) && !/[高]/.test(hl[2]) && verdictOf(/[高]/.test(hl[0])), hl.map((l) => Buffer.byteLength(l)).join(','));
  const multiBytes = hl.reduce((n, l) => n + Buffer.byteLength(l, 'utf-8'), 0);
  check('multi-group: three groups spend < 1400 B on the line in total (pre-fix: ~1.6 KB each)', multiBytes < 1400, String(multiBytes));
  // dead owners
  const gd = tasks.create({ title: 'dead', objective: 'o', folders: [path.join(tmp, 'elsewhere')] });
  tasks.update(gd.id, { backlog: [
    { text: 'owned by a live session', priority: 'high', addedAt: 1, status: 'open', claimedBy: ['claude:alive'] },
    { text: 'owned by a gone session', priority: 'high', addedAt: 2, status: 'open', claimedBy: ['claude:gone'] },
    { text: 'nobody', priority: 'high', addedAt: 3, status: 'open', claimedBy: [] },
  ] });
  const live = (k) => k === 'claude:alive' || k === 'claude:me';
  const dl = lineOf(tasks._backlogNoteLines(tasks.get(gd.id), { sessionKey: 'claude:me', isLiveClaim: live }));
  check('a high item whose claimant is not running is surfaced as unowned, marked (claimant not running); a live owner keeps it', gateOf(/owned by a gone session \(claimant not running\)/.test(dl)) && gateOf(/nobody/.test(dl)) && !/owned by a live session/.test(dl), dl);
  const noPred = lineOf(tasks._backlogNoteLines(tasks.get(gd.id), { sessionKey: 'claude:me' }));
  check('negative control: without the liveness predicate a dead claim still hides the item', !/gone session/.test(noPred) && verdictOf(/nobody/.test(noPred)), noPred);
  const pure = sel.selectReminders(tasks.get(gd.id).backlog, 'claude:gone', { isLive: live });
  check('pure: the caller\'s OWN claim is "mine", never surfaced to itself as unowned', pure.mine.length === 1 && !pure.unclaimedHigh.some((b) => b.text === 'owned by a gone session'));
}

// ── (5) the REAL CLI against the real route over loopback http ──
console.log('(5) CLI');
{
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const h = routes[`${req.method} ${u.pathname}`];
      if (!h) { res.writeHead(404); res.end('{}'); return; }
      let code = 200;
      const r = { status: (c) => { code = c; return r; }, json: (o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); return r; } };
      h({ headers: { authorization: req.headers.authorization || '' }, query: Object.fromEntries(u.searchParams), body: raw ? JSON.parse(raw) : {} }, r);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const env = { ...process.env, VIBESPACE_API: `http://127.0.0.1:${server.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_test' };
  const run = (...args) => promisify(execFile)(process.execPath, [path.join(REPO, 'data/bin/vibespace-task'), ...args], { env }).then((r) => ({ code: 0, out: r.stdout }), (e) => ({ code: e.code, out: (e.stdout || '') + (e.stderr || '') }));
  tasks.update(g.id, { backlog: [
    { text: 'theirs', priority: 'normal', addedAt: 5, status: 'open', claimedBy: ['codex:a', 'codex:b'] },
    { text: 'nobody', priority: 'low', addedAt: 6, status: 'open', claimedBy: [] },
  ] });
  const a = await run('backlog-add', 'cli high item', '--priority', 'high');
  const stored = tasks.get(g.id).backlog.find((b) => b.text === 'cli high item');
  check('`backlog-add --priority high` reaches the store', a.code === 0 && stored?.priority === 'high' && verdictOf(/parked as \[B-[0-9a-f]+\] priority high/.test(a.out)), a.out);
  const bad = await run('backlog-add', 'x', '--priority=soon');
  check('`--priority=soon` is refused by the server, exit 1, nothing stored', bad.code === 1 && gateOf(/invalid priority/.test(bad.out)) && !tasks.get(g.id).backlog.some((b) => b.text === 'x'), bad.out);
  const e = await run('backlog-edit', stored.id, '--priority', 'low');
  check('`backlog-edit <id> --priority low` changes it and says so', e.code === 0 && tasks.get(g.id).backlog.find((b) => b.id === stored.id).priority === 'low' && verdictOf(/priority low/.test(e.out)), e.out);
  await run('backlog-edit', stored.id, '--priority', 'high');
  const l = await run('backlog');
  const rows = l.out.split('\n').filter((x) => /^\s+\d+\. /.test(x));
  check('`backlog` lists high first with `!`, the (you)/(claimed by N)/(unclaimed) tails, `↓` on low', rows.length === 3
    && gateOf(/^\s+1\. ! \[B-[0-9a-f]+\] cli high item\s+\(you\)$/.test(rows[0]))
    && gateOf(/^\s+2\. \[B-[0-9a-f]+\] theirs\s+\(claimed by 2\)$/.test(rows[1]))
    && verdictOf(/^\s+3\. ↓ \[B-[0-9a-f]+\] nobody\s+\(unclaimed\)$/.test(rows[2])), rows.join(' | '));
  const one = await run('backlog', stored.id);
  check('`backlog <id>` prints the priority', verdictOf(/priority: high/.test(one.out)), one.out);
  const dn = await run('backlog-done', stored.id);
  check('`backlog-done` prints WHICH item it resolved (id + text)', dn.code === 0 && verdictOf(new RegExp(`^resolved \\[${stored.id}\\] cli high item; 2 still open`).test(dn.out.trim())), dn.out);
  const u = await run('--help');
  check('usage says a # is the number in the list you were last shown, and steers mutating verbs to ids', gateOf(/a # is the number in the list YOU were last shown/.test(u.out)) && verdictOf(/prefer the B-xxxx id/.test(u.out)));
  check('usage documents --priority on backlog-add and backlog-edit', gateOf(/backlog-add "item" \[--detail "context"\] \[--priority high\|normal\|low\]/.test(u.out)) && verdictOf(/backlog-edit <id\|#\|text> \[--text "new"\] \[--detail "more"\] \[--replace-detail\] \[--priority high\|normal\|low\]/.test(u.out)));
  server.close();
}

// ── (6) wiring pins ──
console.log('(6) wiring pins');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const tg = strip(fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8'));
const ar = strip(fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8'));
const cli = strip(fs.readFileSync(path.join(REPO, 'data/bin/vibespace-task'), 'utf8'));
const bs = fs.readFileSync(path.join(REPO, 'src/backlog-select.js'), 'utf8');
check('task-groups.js requires backlog-select', verdictOf(/require\('\.\/backlog-select'\)/.test(tg)));
check('_backlogNoteLines selects through selectReminders, with the liveness predicate', verdictOf(/const sel = selectReminders\(open, sessionKey, \{ limit: LIMIT, isLive: isLiveClaim \}\)/.test(tg)));
check('renderContext + renderMultiContext thread isLiveClaim to _backlogNoteLines; multi shares ONE highBudget', gateOf(/this\._backlogNoteLines\(t, \{ gid: multi \? `--group \$\{t\.id\} ` : '', sessionKey, tools, isLiveClaim \}\)/.test(tg)) && gateOf(/this\._backlogNoteLines\(ts\[id\], \{ gid: `--group \$\{id\} `, sessionKey, tools, isLiveClaim, highBudget, mineBudget, nudge: false \}\)/.test(tg)) && verdictOf(/const highBudget = \{ bytes: HIGH_LINE_TEXT_BYTES \};/.test(tg)));
check('every agent-routes render call passes isLiveClaim: liveClaimPredicate() (4 sites)', (ar.match(/isLiveClaim: liveClaimPredicate\(\)/g) || []).length === 4 && (ar.match(/tasks\.render(?:Multi)?Context\(/g) || []).length === 4);
check('GET task remembers the listing it served; findIdx resolves a number against it', gateOf(/rememberBacklogListing\(`\$\{you\}\|\$\{gid\}`, openSorted\.map\(\(b\) => b\.id\)\);/.test(ar)) && verdictOf(/const shown = backlogListingShown\.get\(`\$\{key\}\|\$\{gid\}`\);/.test(ar)));
check('done/drop echo the resolved item by id', verdictOf(/backlog\[r\]\.resolvedAt = Date\.now\(\);\n\s*actedId = backlog\[r\]\.id \|\| null;/.test(ar)));
{
  // raw source (the '/**' string literal in renderTaskMd defeats the comment stripper — see below)
  const raw = fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8');
  check('the repo-file writer + TASK.md + reminders print through markedText; the reader gates markers on the frontmatter key', gateOf(/body\.push\(`- \[\$\{b\.status === 'done'[^\n]*\} \$\{markedText\(b\)\}`\);/.test(raw)) && gateOf(/lines\.push\(`- \[\$\{b\.id \|\| '\?'\}\] \$\{markedText\(\{ priority: b\.priority, text: agentLine\(b\.text\) \}\)\}/.test(raw)) && gateOf(/out\.push\(`- \[\$\{b\.id \|\| '\?'\}\] \$\{markedText\(\{ priority: b\.priority/.test(raw)) && gateOf(/'backlog_priority: markers',/.test(raw)) && verdictOf(/const markersOn = fm\.backlog_priority === 'markers';/.test(raw)));
}
{
  // (the raw source: renderTaskMd holds a '/**' string literal the comment stripper would eat through)
  const raw = fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8');
  const body = raw.slice(raw.indexOf('  renderTaskMd(t, cap = 50, { now = null } = {}) {'), raw.indexOf('  syncAllContextMd() {'));   // lane agent-context-owner-facts: + the `now` option (the injection's dateless today)
  check('renderTaskMd lists through sortBacklog', verdictOf(/\n\s*const openBl = sortBacklog\(\(t\.backlog \|\| \[\]\)\.filter/.test(body)));
}
check('update() normalizes priority', verdictOf(/priority: normalizePriority\(it\?\.priority\),/.test(tg)));
check('agent-routes requires backlog-select and GET task sorts with it', gateOf(/require\('\.\/backlog-select\.js'\)/.test(ar)) && gateOf(/const openSorted = sortBacklog\(\(t\.backlog \|\| \[\]\)\.filter\(\(b\) => b\.status === 'open'\)\);/.test(ar)) && verdictOf(/task: taskShowAnswer\(t, openSorted\)/.test(ar)));   // verify r4 F1 (lane peer-census): the answer leaves through the task door, the sorted open list inside it
check('findIdx numbers the SAME sorted open list (never the store order)', verdictOf(/const ids = shown \|\| sortBacklog\(backlog\.filter\(\(b\) => b\.status === 'open'\)\)\.map\(\(b\) => b\.id\);/.test(ar)));
check('the route refuses a priority outside the set', verdictOf(/!BACKLOG_PRIORITIES\.includes\(priority\)\) return res\.status\(400\)/.test(ar)));
check('the CLI passes `priority` on backlog-add and backlog-edit', gateOf(/\{ add: arg, [^\n]*\{ priority \}/.test(cli)) && verdictOf(/body\.priority = priority;/.test(cli)));
// lane peer-census verify r4 F1: the ONE import allowed is the PURE belt (the nudge quotes other sessions' item texts and cuts them — a cut is followed by the rule where the cut is)
check('backlog-select.js is PURE (imports nothing but the PURE belt ./peer-text.js)', (bs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').match(/require\(/g) || []).length === 1 && verdictOf(/require\('\.\/peer-text\.js'\)/.test(bs)));

// ── (7) the Backlog tab (src/lib/task-log.js) shows and sets priority ──
// The tab is DOM-bound (no DOM library in the tree), so its legs are: the
// behaviour of what it FEEDS — sortBacklog over rows carrying their store
// index `_i` (the index every write patches), the whole-backlog write the
// Priority menu / ✎ editor issue, through the REAL store — and source pins,
// each pin proven to BITE by a patched copy that must fail it.
console.log('(7) Backlog tab');
{
  const g7 = tasks.create({ title: 'tab', objective: 'obj', folders: [cwd], contextDir: path.join(tmp, 'ctx7') });
  const stored = tasks.update(g7.id, { backlog: [
    { text: 'old normal', status: 'open', addedAt: 10, addedBy: 'claude:aaa', claimedBy: ['claude:aaa'] },
    { text: 'new low', status: 'open', priority: 'low', addedAt: 30 },
    { text: 'mid high', status: 'open', priority: 'high', addedAt: 20, detail: 'ctx' },
    { text: 'done one', status: 'done', addedAt: 5, resolvedAt: 40, resolvedBy: 'user' },
  ] }).backlog;
  // the tab's own shape: rows = backlog.map((b, i) => ({ ...b, _i: i })) → sortBacklog
  const rows = sel.sortBacklog(stored.map((b, i) => ({ ...b, _i: i })));
  check('tab order: high, then normal/low newest-first by priority, resolved last', rows.map((r) => r.text).join('|') === 'mid high|old normal|new low|done one', rows.map((r) => r.text).join('|'));
  check('every sorted row still names ITS store index (_i) — a write patches the right item', verdictOf(rows.every((r) => stored[r._i].id === r.id)));
  // the Priority submenu's write: patchItem(it, b => ({ ...b, priority })) — ONE ROW by its id since B-0248 step 3 (the fields fn changed)
  const target = rows.find((r) => r.text === 'old normal');
  const after = tasks.update(g7.id, { backlogRow: { id: target.id, set: { priority: 'high' } } }).backlog;
  const moved = after.find((b) => b.id === target.id);
  check('the menu write stores the new priority on THAT item (by id), nothing else changes', moved.priority === 'high'
    && JSON.stringify(after.filter((b) => b.id !== target.id)) === JSON.stringify(stored.filter((b) => b.id !== target.id)), JSON.stringify(after));
  check('…and keeps its identity, claim and attribution', moved.text === 'old normal' && moved.addedBy === 'claude:aaa' && moved.claimedBy.join() === 'claude:aaa' && after.length === stored.length);
  check('after the write the tab re-sorts it among the highs (newest high first)', sel.sortBacklog(after).map((b) => b.text).slice(0, 2).join('|') === 'mid high|old normal');
  const back = tasks.update(g7.id, { backlogRow: { id: target.id, set: { priority: 'normal' } } }).backlog;
  check('choosing Normal writes normal (no chip)', back.find((b) => b.id === target.id).priority === 'normal');
}
{
  // comments stripped: a pin must be satisfied by CODE, never by a note (the 2.369.134 lesson)
  const TL = strip(fs.readFileSync(path.join(REPO, 'src/lib/task-log.js'), 'utf8'));
  const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  const pins = {
    'task-log.js imports sortBacklog/normalizePriority/PRIORITIES from the pure module': (src) => /^import \{ BACKLOG_ROW_FIELDS, PRIORITIES, normalizePriority, priorityMarker, sortBacklog \} from '\.\.\/backlog-select\.js';$/m.test(src),
    'the Backlog tab lists sortBacklog(items), filtered after': (src) => /const visible = sortBacklog\(items\)\.filter\(\(it\) =>/.test(src),
    'a chip per non-normal row: class bl-prio bl-prio-<p>, normal ⇒ no chip': (src) => /if \(n === 'normal'\) return null;/.test(src) && /c\.className = 'bl-prio bl-prio-' \+ n;/.test(src) && /const chip = prioChip\(it\.priority\);\n\s*if \(chip\) top\.appendChild\(chip\);/.test(src),
    'chip words: t(High) / t(Low) with t(High priority) / t(Low priority) titles': (src) => /high: t\('High'\), normal: t\('Normal'\), low: t\('Low'\)/.test(src) && /t\('High priority'\) : t\('Low priority'\)/.test(src),
    'setPriority = ONE whole-backlog write through patchItem (no local mutation)': (src) => /patchItem\(it, \(b\) => \(\{ \.\.\.b, priority: p \}\)\);/.test(src) && !/it\.priority\s*=[^=]/.test(src) && /for \(const k of BACKLOG_ROW_FIELDS\) if \(now\[k\] !== ref\[k\]\) set\[k\] = now\[k\] === undefined \? null : now\[k\];/.test(src) && /return tookRow\(await sidebar\._taskUpdate\(taskId, \{ backlogRow: row \}, \{ onRefused: rowGone\(was\) \}\)\);/.test(src),   // B-0248 step 3: the write is ONE ROW now (the fields fn changed, by the row's id)
    "the row's context menu carries a Priority submenu over PRIORITIES": (src) => /line\.addEventListener\('contextmenu'/.test(src) && /\{ label: t\('Priority'\), children: PRIORITIES\.map\(\(p\) => \(\{[^\n]*action: \(\) => setPriority\(it, p\) \}\)\) \}/.test(src),
    'Copy as Markdown exports the view order with the markers': (src) => /md = sortBacklog\(task\.backlog \|\| \[\]\)\n\s*\.filter\(/.test(src) && /\$\{priorityMarker\(it\.priority\) \? priorityMarker\(it\.priority\) \+ ' ' : ''\}\$\{it\.text\}/.test(src),
    'the ✎ editor has a Priority select and Save writes it': (src) => /prioLbl\.textContent = t\('Priority'\);/.test(src) && /b\.priority = ps\.value;/.test(src) && /form\.append\(ti, prioWrap, ta, btns\);/.test(src),
  };
  for (const [name, fn] of Object.entries(pins)) check(`pin: ${name}`, verdictOf(fn(TL)));
  // NEGATIVE CONTROLS — each pin must fail on a copy with its wiring removed
  const cuts = [
    ['the Backlog tab lists sortBacklog(items), filtered after', ['const visible = sortBacklog(items).filter(', 'const visible = items.filter(']],
    ['a chip per non-normal row: class bl-prio bl-prio-<p>, normal ⇒ no chip', ['if (chip) top.appendChild(chip);', '']],
    ['setPriority = ONE whole-backlog write through patchItem (no local mutation)', ['patchItem(it, (b) => ({ ...b, priority: p }));', 'it.priority = p; render();']],
    ["the row's context menu carries a Priority submenu over PRIORITIES", ["{ label: t('Priority'), children:", "{ label: t('Priority'), kids:"]],
    ['the ✎ editor has a Priority select and Save writes it', ['b.priority = ps.value; ', '']],
    ['Copy as Markdown exports the view order with the markers', ['md = sortBacklog(task.backlog || [])', 'md = (task.backlog || [])']],
    ['task-log.js imports sortBacklog/normalizePriority/PRIORITIES from the pure module', ["from '../backlog-select.js';", "from '../backlog-select-copy.js';"]],
  ];
  for (const [name, [a, b]] of cuts) {
    const bad = TL.replace(a, b);
    check(`negative control: cutting "${a.slice(0, 40)}" fails the pin "${name.slice(0, 40)}…"`, bad !== TL && !pins[name](bad));
  }
  // the chip CSS: theme vars only (no literal colours in the new rules)
  const rules = CSS.split('\n').filter((l) => /^\.bl-prio/.test(l));
  check('style.css has .bl-prio-high and .bl-prio-low chips', gateOf(rules.some((l) => l.startsWith('.bl-prio-high '))) && verdictOf(rules.some((l) => l.startsWith('.bl-prio-low '))));
  const lit = (l) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(l);
  check('the chip rules use theme vars only (no literal colours)', rules.length >= 3 && !rules.some(lit), rules.filter(lit).join(' | '));
  check('negative control: the literal-colour check catches a hard-coded colour', verdictOf(lit('.bl-prio-high { color: #e55; }')));
  // i18n: the new keys exist in both dictionaries
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8');
  const ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const keys = ['Priority', 'High priority', 'Low priority', 'High', 'Normal', 'Low'];
  check('zh + ja carry every Backlog-priority key', verdictOf(keys.every((k) => zh.includes(`  "${k}": `) && ja.includes(`  "${k}": `))), keys.filter((k) => !zh.includes(`  "${k}": `) || !ja.includes(`  "${k}": `)).join(','));
}

console.log('(8) the page\'s backlog by row (B-0248 step 3, r1436 / r1443)');
// THE LOST CLAIM: the page sent its copy of the WHOLE list and the store took it — an agent's claim, row or close that landed after
// that copy reached the page was written out of the store (the agent told «done»). Now a page writes ONE ROW by its id, applied to the
// LIVE list (src/task-groups.js backlogWithRow), through the REAL route (src/server/task-groups-wiring.js mountRoutes on a fake app);
// a whole list from a page older than the hub is refused by name — its add (the only id-less row a page sends) is taken as that row.
{
  const TGW = require('../src/server/task-groups-wiring.js');
  const rts8 = {};
  const app8 = { get: (p, h) => { rts8['GET ' + p] = h; }, post: (p, h) => { rts8['POST ' + p] = h; }, patch: (p, h) => { rts8['PATCH ' + p] = h; }, delete: (p, h) => { rts8['DELETE ' + p] = h; }, put() {}, use() {} };
  TGW.mountRoutes({ app: app8, tasks, taskFanout: { mark: () => ({}) }, activeSessions: new Map(), sameToken: () => false, serverSetting: () => undefined, sessionStatusKey: () => '', spendGuard: null });
  const patch8 = (id, body) => new Promise((resolve) => { let status = 200; try { rts8['PATCH /api/tasks/:id']({ params: { id }, body, headers: {} }, { status(x) { status = x; return this; }, json(o) { resolve({ status, body: o }); } }); } catch (e) { resolve({ status: 500, body: { error: e.message } }); } });
  const scene = (title) => {
    const g8 = tasks.create({ title, objective: 'obj', folders: [cwd], contextDir: path.join(tmp, 'ctx8-' + title) });
    const seeded = tasks.update(g8.id, { backlog: [
      { text: 'row one', status: 'open', addedAt: 10, addedBy: 'claude:pg', claimedBy: ['claude:pg'] },
      { text: 'row two', status: 'open', addedAt: 20, addedBy: 'user', claimedBy: ['claude:bbb'] },
    ] }).backlog;
    const pageCopy = JSON.parse(JSON.stringify(seeded));   // what the page holds: the list as the last broadcast carried it
    const [R1, R2] = seeded.map((b) => b.id);
    // an AGENT acts after that copy reached the page — the agent route's own shape: its write built from the LIVE list in one handler
    const agentAct = (fn) => tasks.update(g8.id, { backlog: fn(tasks.get(g8.id).backlog.map((b) => ({ ...b, claimedBy: [...(b.claimedBy || [])] }))) });
    agentAct((l) => l.map((b) => ({ ...b, claimedBy: [...b.claimedBy, 'claude:agentA'] })));   // claims both rows
    agentAct((l) => [...l, { text: 'agent parked', status: 'open', addedBy: 'claude:agentA', addedAt: 30, claimedBy: ['claude:agentA'] }]);
    return { id: g8.id, pageCopy, R1, R2, live: () => tasks.get(g8.id).backlog };
  };
  const A = scene('rows');
  const p1 = await patch8(A.id, { backlogRow: { id: A.R1, set: { priority: 'high' } } });
  const p2 = await patch8(A.id, { backlogRow: { id: A.R2, unclaim: ['claude:bbb'] } });
  const l1 = A.live(), r1 = l1.find((b) => b.id === A.R1), r2 = l1.find((b) => b.id === A.R2);
  check('a row write\'s answer says the hub TOOK it as one row (backlogRows: a page newer than its hub tells an old hub\'s plain 200 apart)', p1.body.backlogRows === 1 && p2.body.backlogRows === 1, JSON.stringify(p1.body).slice(0, 200));
  check('THE LOST CLAIM, cured: a page\'s ONE-ROW writes (R1\'s priority, R2\'s one unclaim) keep the agent\'s claims and its parked row that landed after the page\'s copy', p1.status === 200 && p2.status === 200 && r1.priority === 'high' && gateOf(r1.claimedBy.includes('claude:agentA')) && r2.claimedBy.join() === 'claude:agentA' && gateOf(l1.some((b) => b.text === 'agent parked')) && l1.length === 3, JSON.stringify({ p1: p1.status, p2: p2.status, l1 }));
  // CONTROL (a copy of the ROUTE without its refusal — the release's road): the page's copy with the one field changed erases them
  const B = scene('release');
  const TGWx = loadPatched('src/server/task-groups-wiring.js', [["    if (req.body && req.body.backlog !== undefined) { const one = require('../task-groups.js').oldPageAdd(req.body);", "    if (false) { const one = require('../task-groups.js').oldPageAdd(req.body);"]]);
  const rtsX = {}, appX = { get: (p, h) => { rtsX['GET ' + p] = h; }, post: (p, h) => { rtsX['POST ' + p] = h; }, patch: (p, h) => { rtsX['PATCH ' + p] = h; }, delete: (p, h) => { rtsX['DELETE ' + p] = h; }, put() {}, use() {} };
  TGWx.mountRoutes({ app: appX, tasks, taskFanout: { mark: () => ({}) }, activeSessions: new Map(), sameToken: () => false, serverSetting: () => undefined, sessionStatusKey: () => '', spendGuard: null });
  const lrA = await new Promise((resolve) => { let status = 200; rtsX['PATCH /api/tasks/:id']({ params: { id: B.id }, body: { backlog: B.pageCopy.map((b) => (b.id === B.R1 ? { ...b, priority: 'high' } : b)) }, headers: {} }, { status(x) { status = x; return this; }, json(o) { resolve({ status, body: o }); } }); });
  const lr = B.live();
  check('CONTROL (a copy of the route without its refusal — the release\'s road): the same press\'s whole list ERASES the agent\'s claims and its parked row (red)', lrA.status === 200 && !lr.some((b) => b.text === 'agent parked') && !lr.find((b) => b.id === B.R1).claimedBy.includes('claude:agentA'), JSON.stringify({ status: lrA.status, lr }));
  // a page OLDER than the hub: that same whole-list body over the route ⇒ refused by name, nothing written
  const before = JSON.stringify(A.live());
  const w = await patch8(A.id, { backlog: A.pageCopy.map((b) => (b.id === A.R1 ? { ...b, priority: 'low' } : b)) });
  check('a whole list from a page older than the hub is REFUSED (409 backlog_whole): its words name the one act that ends it (reload) and keep what was typed (copy it first); nothing written', w.status === 409 && w.body.code === 'backlog_whole' && gateOf(/reload the page/.test(w.body.error)) && gateOf(/copy anything you typed/.test(w.body.error)) && JSON.stringify(A.live()) === before, JSON.stringify(w));
  // …but that old page's ADD (its copy + the one row it just cleared from its box) keeps the typed words, as that one row
  const a = await patch8(A.id, { backlog: [...A.pageCopy, { text: 'typed on an old page', status: 'open', addedBy: 'user', addedAt: 40 }] });
  const l2 = A.live(), typed = l2.find((b) => b.text === 'typed on an old page');
  check('…an old page\'s ADD (its copy + one row without an id) is taken as THAT row: the typed words kept (a fresh id, no claim), the agent\'s claims and row untouched', a.status === 200 && !!typed && gateOf(/^B-[0-9a-f]{4,8}$/.test(typed.id)) && typed.claimedBy.length === 0 && l2.length === 4 && gateOf(l2.find((b) => b.id === A.R1).claimedBy.includes('claude:agentA')) && verdictOf(l2.some((b) => b.text === 'agent parked')), JSON.stringify({ a: a.status, l2 }));
  // r1699 (3): an old page's whole list is taken as an add ONLY with exactly one row without an id — two such rows, or a list whose only
  // change is a removed row, are refused by name (nothing written)
  const snap3 = JSON.stringify(A.live());
  const two = await patch8(A.id, { backlog: [...A.pageCopy, { text: 'typed one', status: 'open' }, { text: 'typed two', status: 'open' }] });
  check('an old page\'s whole list with TWO rows without an id is refused (409 backlog_whole), nothing written', two.status === 409 && two.body.code === 'backlog_whole' && JSON.stringify(A.live()) === snap3, JSON.stringify(two));
  const rm = await patch8(A.id, { backlog: A.pageCopy.slice(1) });
  check('an old page\'s whole list whose only change is a REMOVED row is refused (409 backlog_whole) — the row stays', rm.status === 409 && rm.body.code === 'backlog_whole' && JSON.stringify(A.live()) === snap3, JSON.stringify(rm));
  // r1699 (6): a resend is recognised with BOTH sides trimmed (an API caller's add with spaces, sent twice with its stamp)
  const sp1 = await patch8(A.id, { backlogAdd: { text: '  spaced words  ', status: 'open', addedBy: 'user', addedAt: 95 } }), sp2 = await patch8(A.id, { backlogAdd: { text: '  spaced words  ', status: 'open', addedBy: 'user', addedAt: 95 } });
  check('an add with surrounding spaces, sent again with its stamp, is taken ONCE (both sides trimmed)', sp1.status === 200 && sp2.status === 200 && A.live().filter((b) => String(b.text).trim() === 'spaced words').length === 1, JSON.stringify(A.live().filter((b) => /spaced/.test(b.text))));
  // a row gone meanwhile (another window deleted it): refused by name, nothing written
  const del = await patch8(A.id, { backlogRow: { id: A.R2, remove: true } });
  const afterDel = JSON.stringify(A.live());
  const gone = await patch8(A.id, { backlogRow: { id: A.R2, set: { priority: 'low' } } });
  check('a row deleted meanwhile (another window) is refused BY NAME (409 backlog_row_gone, the row\'s id) — nothing written; the page says it by the row\'s text (pinned below)', del.status === 200 && !A.live().some((b) => b.id === A.R2) && gone.status === 409 && gone.body.code === 'backlog_row_gone' && gateOf(gone.body.error.includes(A.R2)) && JSON.stringify(A.live()) === afterDel, JSON.stringify(gone));
  // a claim is never SET through a row; a row keeps its line; a page's add brings no id and no claim
  const m1 = await patch8(A.id, { backlogRow: { id: A.R1, set: { claimedBy: [] } } });
  const m2 = await patch8(A.id, { backlogRow: { id: A.R1, set: { text: '' } } });
  let m3 = null; try { tasks.update(A.id, { backlogRow: { id: A.R1, set: { priority: 'low' } }, backlog: [] }); } catch (e) { m3 = e.code; }
  check('a claim is never SET through a row (claimedBy refused, 400 backlog_row_bad), a row keeps its line, a write is one row OR the whole list — nothing written by any', m1.status === 400 && m1.body.code === 'backlog_row_bad' && m2.status === 400 && m2.body.code === 'backlog_row_bad' && m3 === 'backlog_row_bad' && JSON.stringify(A.live()) === afterDel, JSON.stringify({ m1, m2, m3 }));
  // a close / reopen carries the status the press SAW: an agent's close meanwhile is refused, never written over (its «resolved by» kept)
  tasks.update(A.id, { backlog: A.live().map((b) => (b.id === A.R1 ? { ...b, status: 'done', resolvedBy: 'claude:agentA', resolvedAt: 60 } : b)) });   // the agent closed R1
  const mv = await patch8(A.id, { backlogRow: { id: A.R1, expect: { status: 'open' }, set: { status: 'done', resolvedBy: 'user', resolvedAt: 70 } } });
  const r1c = A.live().find((b) => b.id === A.R1);
  check('a close of a row an agent closed meanwhile is REFUSED by name (409 backlog_row_moved) — the agent\'s «resolved by» is kept', mv.status === 409 && mv.body.code === 'backlog_row_moved' && r1c.resolvedBy === 'claude:agentA' && r1c.resolvedAt === 60, JSON.stringify({ mv, r1c }));
  const ok7 = await patch8(A.id, { backlogRow: { id: A.R1, expect: { status: 'done' }, set: { status: 'open', resolvedBy: null, resolvedAt: null } } });
  const r1o = A.live().find((b) => b.id === A.R1);
  check('…and a reopen of the status it saw is taken (resolvedBy / resolvedAt leave the row)', ok7.status === 200 && r1o.status === 'open' && r1o.resolvedBy === undefined && r1o.resolvedAt === undefined, JSON.stringify(r1o));
  // a field is typed: a non-string line never deletes a row in silence; an add needs its line
  const m4 = await patch8(A.id, { backlogRow: { id: A.R1, set: { text: false } } });
  const m5 = await patch8(A.id, { backlogAdd: {} });
  check('a row\'s fields are TYPED (set.text false, an add with no line: 400 backlog_row_bad) — never a row deleted or a no-op answered 200', m4.status === 400 && m4.body.code === 'backlog_row_bad' && m5.status === 400 && m5.body.code === 'backlog_row_bad' && verdictOf(A.live().some((b) => b.id === A.R1)), JSON.stringify({ m4, m5 }));
  // an add whose answer was lost, sent again with the same stamp (the page keeps it): taken ONCE
  const tw = { text: 'sent twice', status: 'open', addedBy: 'user', addedAt: 80 };
  const t1 = await patch8(A.id, { backlogAdd: tw }), t2 = await patch8(A.id, { backlogAdd: { ...tw } });
  check('an add sent again with the same stamp (its first answer lost) is taken ONCE — no doubled row', t1.status === 200 && t2.status === 200 && A.live().filter((b) => b.text === 'sent twice').length === 1, JSON.stringify(A.live().filter((b) => b.text === 'sent twice')));
  const ad = await patch8(A.id, { backlogAdd: { id: A.R1, text: 'second add', claimedBy: ['claude:x'], addedBy: 'user', addedAt: 50 } });
  const sa = A.live().find((b) => b.text === 'second add');
  check('a page\'s add (backlogAdd) brings no id and no claim: the store mints the id, nobody holds it', ad.status === 200 && !!sa && sa.id !== A.R1 && sa.claimedBy.length === 0 && A.live().filter((b) => b.id === A.R1).length === 1, JSON.stringify(sa));
  // THE CENSUS (r1443 law (i)): every caller IN THE TREE of the page route that sends a whole list — the page (src/lib), the suites
  // (scripts/*.mjs), the CLIs (data/bin): none. The automation verbs and the config import call the store, never this route. This
  // suite's own legs send whole lists on purpose (the release's control, the old page) and are left out of it by name.
  const WHOLE = /\bbacklog\s*:/;
  const enclosingCall = (src, at) => { let d = 0, i = at; for (; i >= 0; i--) { const c = src[i]; if (c === ')') d++; else if (c === '(') { if (d === 0) break; d--; } } if (i < 0) return ''; let e = 0, j = i; for (; j < src.length; j++) { const c = src[j]; if (c === '(') e++; else if (c === ')' && --e === 0) break; } return src.slice(i, j + 1); };   // the call whose parentheses hold `at`
  const callsOf = (src, head) => { const out = []; let i = src.indexOf(head); while (i >= 0) { if (i > 0 && /[\w$]/.test(src[i - 1])) { i = src.indexOf(head, i + 1); continue; } let d = 0, j = i + head.length - 1; for (; j < src.length; j++) { const c = src[j]; if (c === '(') d++; else if (c === ')' && --d === 0) break; } out.push(src.slice(i, j + 1)); i = src.indexOf(head, j); } return out; };   // a whole name only (`patch(` is never `dispatch(`)
  const KEY = /[{,]\s*backlog\s*(?::|,|\})/;   // a `backlog` key, or its shorthand `{ backlog }`
  const wholeSenders = (files) => {
    const hits = [];
    for (const [rel, text] of files) {
      // the page: every call of _taskUpdate, and of a local wrapper that forwards to it (task-detail.js `patch = (p) => sidebar._taskUpdate(taskId, p)`)
      const heads = ['_taskUpdate(', ...[...text.matchAll(/const (\w+) = \(\w+\) => sidebar\._taskUpdate\(/g)].map((m) => m[1] + '(')];
      for (const h of heads) for (const call of callsOf(text, h)) if (WHOLE.test(call) || KEY.test(call)) hits.push(`${rel}: ${call.slice(0, 80)}`);
      // a suite or CLI: every call that carries 'PATCH' to /api/tasks/ (the whole call, its body on any line), and every call of a wrapper
      // defined over one (test-dialog-yield-chrome's `patchT(body)`); a store fixture's `backlog: []` is no PATCH and is not read
      if (!rel.startsWith('src/lib/') && text.includes('/api/tasks/')) {
        for (let at = text.search(/'PATCH'|"PATCH"/); at >= 0; at = (() => { const n = text.slice(at + 1).search(/'PATCH'|"PATCH"/); return n < 0 ? -1 : at + 1 + n; })()) {
          const call = enclosingCall(text, at);
          if (call.includes('/api/tasks/') && (WHOLE.test(call) || KEY.test(call))) hits.push(`${rel}: ${call.slice(0, 80)}`);
        }
        for (const m of text.matchAll(/const (\w+) = (?:async )?\([^)]*\) => [^\n]*/g)) if (m[0].includes('/api/tasks/') && /'PATCH'|"PATCH"/.test(m[0])) for (const call of callsOf(text, m[1] + '(')) if (WHOLE.test(call) || KEY.test(call)) hits.push(`${rel}: ${call.slice(0, 80)}`);
      }
    }
    return hits;
  };
  const read = (dir, keep) => fs.readdirSync(path.join(REPO, dir)).filter(keep).map((f) => [`${dir}/${f}`, fs.readFileSync(path.join(REPO, dir, f), 'utf8')]);
  const SELF = 'scripts/' + path.basename(fileURLToPath(import.meta.url));
  const tree = [...read('src/lib', (f) => f.endsWith('.js')), ...read('scripts', (f) => f.endsWith('.mjs')).filter(([rel]) => rel !== SELF), ...read('data/bin', (f) => fs.statSync(path.join(REPO, 'data/bin', f)).isFile())];
  const hits = wholeSenders(tree);
  check(`THE CENSUS — its reach: src/lib, scripts, data/bin; LITERAL call bodies only (a body built in a variable before the call is not read; the route's 409 backlog_whole is the runtime belt): no caller in the tree sends the page route a whole backlog (${tree.length} files)`, hits.length === 0 && tree.length > 100, hits.join(' | '));
  const planted = wholeSenders([['src/lib/zz.js', "sidebar._taskUpdate(taskId, {\n  backlog: next.filter(Boolean) });"], ['src/lib/zw.js', "const patch = (p) => sidebar._taskUpdate(taskId, p);\npatch({ backlog });"], ['scripts/zz.mjs', "const patchT = (body) => fetch(`/api/tasks/${tid}`, { method: 'PATCH', body: J(body) });\nawait patchT({\n  backlog: [] });"]]);
  check('CONTROL: the census catches a planted page call (over two lines), a wrapper\'s shorthand, and a suite PATCH through a wrapper with its body on another line', planted.length === 3, planted.join(' | '));
  const plantedOk = wholeSenders([['scripts/zy.mjs', "const fixture = { 'T-1': { id: 'T-1', backlog: [], sessions: [] } };\nawait api('PATCH', `/api/tasks/${id}`, { color: '#61afef' });\nawait api('PATCH', `/api/tasks/${id}`, {\n  backlogAdd: { text: 'one row' } });"]]);
  check('CONTROL: a store fixture\'s backlog key and a one-row PATCH (its body on the next line) are no whole-list sender', plantedOk.length === 0, plantedOk.join(' | '));
  // the page's words (comments stripped): a gone row SAID by its text; the add box cleared only once the hub took the row
  const TL8 = strip(fs.readFileSync(path.join(REPO, 'src/lib/task-log.js'), 'utf8'));
  const pins8 = {
    'a gone or moved row is SAID by its text, the call answered (no generic toast), at both row writes': (src) => /if \(!d \|\| \(d\.code !== 'backlog_row_gone' && d\.code !== 'backlog_row_moved'\)\) return false;/.test(src) && /t\('"\{text\}" is no longer in this group\\'s backlog — it was removed meanwhile; nothing was written', \{ text: clip80\(was\.text\) \}\)/.test(src) && (src.match(/\{ onRefused: rowGone\(was\) \}/g) || []).length === 2,
    'the add box keeps what was typed until the hub took the row (the CURRENT boxes cleared)': (src) => /try \{ took = tookRow\(await sidebar\._taskUpdate\(taskId, \{ backlogAdd: item \}\)\); \} finally \{ state\.blAdding = false; \}\s*if \(!took\) return;/.test(src) && /if \(cur && cur\.value === typed\) cur\.value = '';/.test(src),
    'an add sent again after a lost answer keeps its stamp': (src) => /const again = state\.blAddTry && state\.blAddTry\.typed === typed && state\.blAddTry\.detail === typedDetail;/.test(src) && /addedAt: state\.blAddTry\.addedAt \}/.test(src),
    'what was typed survives a re-render: captured before every rebuild, put back after, a removed box is no press': (src) => /const render = \(\) => \{\n\s*captureBacklogDraft\(\);/.test(src) && /captureBacklogDraft\(\);\n\s*state\.rerendering = true; queueMicrotask\(\(\) => \{ state\.rerendering = false; \}\);\n\s*body\.innerHTML = '';\n\s*renderBacklog\(body\);/.test(src) && /if \(rowEl\) \{ editForm\(it, rowEl, ed\); hidden\.delete\(ed\.id\); continue; \}/.test(src) && /for \(const ed of \[\.\.\.blEdits\(\)\.values\(\)\]\) \{/.test(src) && /add\.addEventListener\('blur', \(e\) => \{ if \(!state\.rerendering &&/.test(src),
    'the editor diffs against its OWN opening values; Save closes it only once the hub took it': (src) => /const opened = draft && draft\.opened \? draft\.opened : \{ text: ti\.value, detail: ta\.value, priority: ps\.value, status: it\.status \|\| 'open' \};/.test(src) && /if \(took !== false\) \{ blEdits\(\)\.delete\(it\.id\); \(state\.blHiddenOwnSaid \|\| new Set\(\)\)\.delete\(it\.id\); render\(\); \}/.test(src),
    'every open editor is carried by its row id; a hidden one is said by its CAUSE with its drop, at once (once for the person\'s own search or filter); a removed one\'s words are never lost without a word (Copy attended)': (src) => /const forms = \[\.\.\.b\.querySelectorAll\('\.task-log-edit\[data-bl-id\]'\)\]/.test(src) && /\{ action: \{ label: t\('Drop this edit'\), run: \(\) => dropEdit\(ed\.id\) \} \}/.test(src) && /const dropEdit = \(id\) => \{[^\n]*if \(root\.isConnected\) render\(\); \};/.test(src) && /const moved = !!\(ed\.opened && ed\.opened\.status && \(it\.status \|\| 'open'\) !== ed\.opened\.status\);/.test(src) && /if \(moved \? !hidden\.has\(ed\.id\) : !ownSaid\.has\(ed\.id\)\) \{/.test(src) && /const kept = wordsNotice\(ed, words\);/.test(src) && /if \(ok\) \{ try \{ kept\.remove\(\); \} catch \{ \} showToast\(t\('Copied'\)\); \} else showToast\(t\('The clipboard refused the copy/.test(src) && /action: \{ label: t\('Copy'\)/.test(src),
    'a press finds its row by the row\'s own id (never the drawn index)': (src) => /const was = \(task\.backlog \|\| \[\]\)\.find\(\(b\) => b && row0 && b\.id === row0\.id\);/.test(src) && /const was = \(task\.backlog \|\| \[\]\)\.find\(\(b\) => b && b\.id === el\.dataset\.bid\);/.test(src) && !/patchItem\(it\._i/.test(src),
    'a close / reopen carries the status the press saw; a hub that did not take a row is said': (src) => /if \(set\.status !== undefined\) row\.expect = \{ status: was\.status \|\| 'open' \};/.test(src) && /if \(data\.backlogRows\) return true;/.test(src),
  };
  for (const [name, fn] of Object.entries(pins8)) check(`pin: ${name}`, verdictOf(fn(TL8)));
  const cuts8 = [
    ['a gone or moved row is SAID by its text, the call answered (no generic toast), at both row writes', ["{ onRefused: rowGone(was) }).then(tookRow);", '{}).then(tookRow);']],
    ['the add box keeps what was typed until the hub took the row (the CURRENT boxes cleared)', ['if (!took) return;', '']],
    ['an add sent again after a lost answer keeps its stamp', ['addedAt: state.blAddTry.addedAt }', 'addedAt: Date.now() }']],   // the cut writes the release's stamp back on purpose — stale-pins: kept
    ['what was typed survives a re-render: captured before every rebuild, put back after, a removed box is no press', ['if (rowEl) { editForm(it, rowEl, ed); hidden.delete(ed.id); continue; }', 'if (rowEl) { continue; }']],
    ['the editor diffs against its OWN opening values; Save closes it only once the hub took it', ['if (took !== false) { blEdits().delete(it.id); (state.blHiddenOwnSaid || new Set()).delete(it.id); render(); }', 'blEdits().delete(it.id); render();']],   // the cut writes a closing without its forget on purpose — stale-pins: kept
    ['every open editor is carried by its row id; a hidden one is said by its CAUSE with its drop, at once (once for the person\'s own search or filter); a removed one\'s words are never lost without a word (Copy attended)', ["if (moved ? !hidden.has(ed.id) : !ownSaid.has(ed.id)) {", 'if (true) {']],
    ['a press finds its row by the row\'s own id (never the drawn index)', ['const was = (task.backlog || []).find((b) => b && row0 && b.id === row0.id);', 'const was = (task.backlog || [])[row0 && row0._i];']],
    ['a close / reopen carries the status the press saw; a hub that did not take a row is said', ["if (set.status !== undefined) row.expect = { status: was.status || 'open' };", '']],
  ];
  for (const [name, [x, y]] of cuts8) { const bad = TL8.replace(x, y); check(`negative control: cutting "${x.slice(0, 40)}" fails the pin "${name.slice(0, 40)}…"`, bad !== TL8 && !pins8[name](bad)); }
  const zh8 = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja8 = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const K8s = ['"{text}" is no longer in this group\'s backlog — it was removed meanwhile; nothing was written', '"{text}" was closed or reopened meanwhile by someone else — nothing was written; the list shows it now', 'This page is newer than VibeSpace — reload it once VibeSpace has restarted (nothing changed)', '"{text}" was removed from this group\'s backlog meanwhile — what you typed is in the add box', '"{text}" was removed from this group\'s backlog meanwhile', '"{text}" changed meanwhile and this view hides it now — your edit is kept until it shows again'].map((k) => '  ' + JSON.stringify(k) + ': ');
  K8s.push(...['"{text}" was removed from this group\'s backlog meanwhile — what you typed: {words}', 'Drop this edit', '"{text}" is hidden by this view\'s search or filter — your edit is kept until it shows again', 'The clipboard refused the copy — the words are still in the notice, to select'].map((k) => '  ' + JSON.stringify(k) + ': '));
  check('zh + ja carry the Backlog tab\'s ten new sentences', verdictOf(K8s.every((k) => zh8.includes(k) && ja8.includes(k))), K8s.filter((k) => !zh8.includes(k) || !ja8.includes(k)).join(' | '));
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED (${passed} passed)`); process.exit(1); }
console.log(`\nALL PASS (${passed})`); import { verdictOf, gateOf } from './lib/check.mjs';
