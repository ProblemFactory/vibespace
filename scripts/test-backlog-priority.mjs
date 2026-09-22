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
const check = (name, cond, extra) => {
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
  out = out.replace(/require\('\.\/([^']+)'\)/g, (_, m) => `require(${JSON.stringify(path.join(REPO, path.dirname(rel), m))})`);
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
check('sortBacklog: open by priority, NEWEST first within one (ties by id; unknown = normal), then resolved by resolvedAt desc', orderLeg(sel), sel.sortBacklog(fixture()).map((b) => b.id).join(','));
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
  const f = path.join(tmp, 'backlog-select-oldest-first.js');
  fs.writeFileSync(f, patched);
  const bad = require(f);
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
  const md = fs.readFileSync(path.join(ctx, '.vibespace', 'TASK.md'), 'utf8');
  const lines = md.split('\n').filter((l) => /^- \[B-/.test(l));
  check('TASK.md lists open items in sortBacklog order with the markers (high `!`, low `↓`)', lines.length === 4 && / ! a /.test(lines[0] + ' ') && / c /.test(lines[1] + ' ') && / b /.test(lines[2] + ' ') && / ↓ d /.test(lines[3] + ' '), lines.join(' | '));
  // repo-file round-trip
  const file = path.join(tmp, 'repo', 'task.md');
  tasks.exportToFile(g.id, file);
  const txt = fs.readFileSync(file, 'utf8');
  check('repo file carries the markers after the id', /\] \[B-[0-9a-f]+\] ! a$/m.test(txt) && /\] \[B-[0-9a-f]+\] ↓ d$/m.test(txt) && /\] \[B-[0-9a-f]+\] c$/m.test(txt), txt);
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
  check('a priority change rides the diff to the owner', d && d.lines.some((l) => /^- Backlog priority normal → high \[B-/.test(l)), d && d.lines.join(' | '));
  const dOld = tasks.diffChanges(g.id, { ...snap, backlog: snap.backlog.map((b) => { const { p, ...rest } = b; return { ...rest, claimedBy: ['claude:sess1'] }; }) }, { sessionKey: 'claude:sess1' });
  check('a pre-priority snapshot (no `p`) is not read as a priority change', dOld && !dOld.lines.some((l) => /Backlog priority/.test(l)));
}

// ── (2b) the repo task file never turns TEXT into a marker ──
console.log('(2b) repo-file marker-like text');
{
  const TEXTS = [['! not urgent, just exclaiming', 'normal'], ['↓ arrow text normal', 'normal'], ['! shouting and high', 'high'], ['\\! already escaped', 'low'], ['!bang no space', 'normal'], ['plain', 'high']];
  const elsewhere = path.join(tmp, 'elsewhere'); fs.mkdirSync(elsewhere, { recursive: true }); // not the route session's cwd — never a second membership
  const g2 = tasks.create({ title: 'esc', objective: 'o', folders: [elsewhere] });
  const roundTrip = (mgr) => {
    mgr.update(g2.id, { backlog: TEXTS.map(([text, priority], i) => ({ text, priority, addedAt: i + 1 })) });
    const f = path.join(tmp, 'repo', `esc-${patchN++}.md`);
    mgr.exportToFile(g2.id, f);
    mgr.update(g2.id, { backlog: [] });
    return { txt: fs.readFileSync(f, 'utf8'), back: mgr.importFromFile(f).backlog.map((b) => [b.text, b.priority]) };
  };
  const { txt, back } = roundTrip(tasks);
  check('every text + priority survives the export/import round trip (a normal "! …" / "↓ …" stays normal, its prefix kept)', JSON.stringify(back) === JSON.stringify(TEXTS), JSON.stringify(back));
  check('the writer declares `backlog_priority: markers` and escapes a marker-like normal text as `\\! …`', /^backlog_priority: markers$/m.test(txt) && /\] \\! not urgent/.test(txt) && /\] \\↓ arrow/.test(txt) && /\] ! \\! shouting/.test(txt), txt);
  // a file written BEFORE priorities (no frontmatter key, no escaping) is read verbatim
  const oldFile = path.join(tmp, 'repo', 'pre-priority.md');
  fs.writeFileSync(oldFile, ['---', `vibespace_task: ${g2.id}`, 'title: "esc"', 'kind: task', 'archived: false', 'color: null', '---', '', '# esc', '', '## Objective', '', 'o', '', '## Backlog', '', '- [ ] [B-00aa] ! exclaiming text', '- [ ] [B-00ab] ↓ arrow text', '- [x] [B-00ac] done thing', ''].join('\n'));
  const oldBack = tasks.importFromFile(oldFile).backlog.map((b) => [b.text, b.priority, b.status]);
  check('a pre-priority file (no `backlog_priority` key) imports VERBATIM: "! …" stays text, every item normal', JSON.stringify(oldBack) === JSON.stringify([['! exclaiming text', 'normal', 'open'], ['↓ arrow text', 'normal', 'open'], ['done thing', 'normal', 'done']]), JSON.stringify(oldBack));
  // TASK.md prints the same escaped form
  tasks.update(g2.id, { backlog: [{ text: '! bang normal', addedAt: 1 }, { text: 'hi', priority: 'high', addedAt: 2 }] });
  const md2 = tasks.renderTaskMd(tasks.get(g2.id), 50);
  check('TASK.md escapes a marker-like normal text too (`[B-x] \\! bang normal`), a real high reads `[B-x] ! hi`', /\[B-[0-9a-f]+\] \\! bang normal/.test(md2) && /\[B-[0-9a-f]+\] ! hi/.test(md2), md2);
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
  const bf = path.join(tmp, 'repo', 'bad.md'); badMgr.exportToFile(bg.id, bf); badMgr.update(bg.id, { backlog: [] });
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
  sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => {} },
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
  return { out, code };
};
tasks.update(g.id, { backlog: [] });
{
  const r = call('POST', '/api/agent/task-backlog', { add: 'urgent thing', priority: 'high' });
  check('add with priority high → stored high, echoed', r.code === 200 && r.out.item?.priority === 'high' && tasks.get(g.id).backlog[0].priority === 'high', JSON.stringify(r.out).slice(0, 200));
  const r0 = call('POST', '/api/agent/task-backlog', { add: 'plain thing' });
  check('add without priority → normal', r0.code === 200 && r0.out.item?.priority === 'normal');
  const rBad = call('POST', '/api/agent/task-backlog', { add: 'bad thing', priority: 'urgent' });
  check('add with a value outside the set → 400 naming the set, nothing stored', rBad.code === 400 && /high, normal, low/.test(rBad.out.error || '') && tasks.get(g.id).backlog.length === 2, JSON.stringify(rBad.out));
  const rLow = call('POST', '/api/agent/task-backlog', { add: 'someday', priority: 'low' });
  const rE = call('POST', '/api/agent/task-backlog', { edit: r0.out.item.id, priority: 'low' });
  check('edit priority → stored, the edit echoes its item BY ID', rE.code === 200 && rE.out.item?.id === r0.out.item.id && rE.out.item?.priority === 'low' && tasks.get(g.id).backlog.find((b) => b.id === r0.out.item.id).priority === 'low', JSON.stringify(rE.out).slice(0, 200));
  const rEBad = call('POST', '/api/agent/task-backlog', { edit: r0.out.item.id, priority: 'medium' });
  check('edit with an invalid priority → 400, unchanged', rEBad.code === 400 && tasks.get(g.id).backlog.find((b) => b.id === r0.out.item.id).priority === 'low');
  const rG = call('GET', '/api/agent/task');
  check('GET task lists open items in sortBacklog order, carrying priority + `you`', rG.out.you === 'claude:sess1' && rG.out.task.backlog[0].id === r.out.item.id && rG.out.task.backlog.every((b) => typeof b.priority === 'string'), JSON.stringify(rG.out.task.backlog.map((b) => [b.text, b.priority])));
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
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => {} },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (s, id) => `claude:${id}`, serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null,
  });
  return (tok, method, p, body) => {
    let out, code = 200;
    const res = { json: (o) => { out = o; return res; }, status: (c) => { code = c; return res; } };
    r[`${method} ${p}`]({ headers: { authorization: `Bearer ${tok}` }, query: {}, body: body || {} }, res);
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
  check('a number whose shown item is already resolved is REFUSED by name, nothing changes', r.againCode === 400 && /already done/.test(r.againErr) && /\bA\b/.test(r.againErr) && r.dropped === 0, `${r.againCode} ${r.againErr}`);
  check('a number past the shown list is refused, naming the list and the id route', r.farCode === 400 && /no item #9 in the backlog list you were last shown \(3 items\)/.test(r.farErr), r.farErr);
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
  check('owned high items carry the `!` marker', itemLines[0].includes('] ! o-high-2'));
  check('the "+N more claimed by you" line counts the rest', lines.some((l) => l === '- … +3 more claimed by you'));
  const hl = lines.filter((l) => l.startsWith('- unclaimed HIGH: '));
  check('ONE unclaimed-HIGH line naming the unowned high items (newest first), never a claimed/resolved one', hl.length === 1 && /\[B-[0-9a-f]+\] free-high-B · \[B-[0-9a-f]+\] free-high-A/.test(hl[0]) && !/taken-high|resolved-high/.test(hl[0]), hl.join(' | '));
  check('the count line follows (12 open incl. 4 not claimed by you)', /^\(group backlog holds 12 open parked items incl\. 4 not claimed by you/.test(lines[lines.length - 1]), lines[lines.length - 1]);
  const other = tasks._backlogNoteLines(tasks.get(g.id), { sessionKey: 'codex:nobody' });
  check('a session owning nothing gets the pointer line AND the unclaimed-HIGH line', /^Group backlog: 12 open/.test(other[1]) && other.some((l) => l.startsWith('- unclaimed HIGH: ')) && !other.some((l) => /^- \[B-/.test(l)));
  check('task tool off ⇒ no backlog lines at all', tasks._backlogNoteLines(tasks.get(g.id), { sessionKey: me, tools: { task: false } }).length === 0);
  const ctxText = tasks.renderContext(g.id, { sessionKey: me });
  check('renderContext carries the same selection', ctxText.includes('- unclaimed HIGH: ') && ctxText.includes('] ! o-high-2'));
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
  check('one group: 5 CJK high items of 100 chars — the line stays ≤ 600 B of text + its fixed tail (≤ 800 B), the rest by id', bytes <= 800 && /\[B-[0-9a-f]+\]( ·|  _)/.test(one), `${bytes} B: ${one.slice(0, 120)}`);
  const unbudgeted = lineOf(tasks._backlogNoteLines(tasks.get(gs[0]), { sessionKey: 'claude:x', highBudget: { bytes: 1e9 } }));
  check('negative control: without the budget the same line is > 1400 B (the pre-fix growth)', Buffer.byteLength(unbudgeted, 'utf-8') > 1400, String(Buffer.byteLength(unbudgeted, 'utf-8')));
  const multi = tasks.renderMultiContext(gs, { sessionKey: 'claude:x' });
  const hl = multi.split('\n').filter((l) => l.startsWith('- unclaimed HIGH: '));
  check('multi-group: ONE shared budget — the later groups name their high items by id only', hl.length === 3 && !/[高]/.test(hl[1]) && !/[高]/.test(hl[2]) && /[高]/.test(hl[0]), hl.map((l) => Buffer.byteLength(l)).join(','));
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
  check('a high item whose claimant is not running is surfaced as unowned, marked (claimant not running); a live owner keeps it', /owned by a gone session \(claimant not running\)/.test(dl) && /nobody/.test(dl) && !/owned by a live session/.test(dl), dl);
  const noPred = lineOf(tasks._backlogNoteLines(tasks.get(gd.id), { sessionKey: 'claude:me' }));
  check('negative control: without the liveness predicate a dead claim still hides the item', !/gone session/.test(noPred) && /nobody/.test(noPred), noPred);
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
  check('`backlog-add --priority high` reaches the store', a.code === 0 && stored?.priority === 'high' && /parked as \[B-[0-9a-f]+\] priority high/.test(a.out), a.out);
  const bad = await run('backlog-add', 'x', '--priority=soon');
  check('`--priority=soon` is refused by the server, exit 1, nothing stored', bad.code === 1 && /invalid priority/.test(bad.out) && !tasks.get(g.id).backlog.some((b) => b.text === 'x'), bad.out);
  const e = await run('backlog-edit', stored.id, '--priority', 'low');
  check('`backlog-edit <id> --priority low` changes it and says so', e.code === 0 && tasks.get(g.id).backlog.find((b) => b.id === stored.id).priority === 'low' && /priority low/.test(e.out), e.out);
  await run('backlog-edit', stored.id, '--priority', 'high');
  const l = await run('backlog');
  const rows = l.out.split('\n').filter((x) => /^\s+\d+\. /.test(x));
  check('`backlog` lists high first with `!`, the (you)/(claimed by N)/(unclaimed) tails, `↓` on low', rows.length === 3
    && /^\s+1\. ! \[B-[0-9a-f]+\] cli high item\s+\(you\)$/.test(rows[0])
    && /^\s+2\. \[B-[0-9a-f]+\] theirs\s+\(claimed by 2\)$/.test(rows[1])
    && /^\s+3\. ↓ \[B-[0-9a-f]+\] nobody\s+\(unclaimed\)$/.test(rows[2]), rows.join(' | '));
  const one = await run('backlog', stored.id);
  check('`backlog <id>` prints the priority', /priority: high/.test(one.out), one.out);
  const dn = await run('backlog-done', stored.id);
  check('`backlog-done` prints WHICH item it resolved (id + text)', dn.code === 0 && new RegExp(`^resolved \\[${stored.id}\\] cli high item; 2 still open`).test(dn.out.trim()), dn.out);
  const u = await run('--help');
  check('usage says a # is the number in the list you were last shown, and steers mutating verbs to ids', /a # is the number in the list YOU were last shown/.test(u.out) && /prefer the B-xxxx id/.test(u.out));
  check('usage documents --priority on backlog-add and backlog-edit', /backlog-add "item" \[--detail "context"\] \[--priority high\|normal\|low\]/.test(u.out) && /backlog-edit <id\|#\|text> \[--text "new"\] \[--detail "new"\] \[--priority high\|normal\|low\]/.test(u.out));
  server.close();
}

// ── (6) wiring pins ──
console.log('(6) wiring pins');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const tg = strip(fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8'));
const ar = strip(fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8'));
const cli = strip(fs.readFileSync(path.join(REPO, 'data/bin/vibespace-task'), 'utf8'));
const bs = fs.readFileSync(path.join(REPO, 'src/backlog-select.js'), 'utf8');
check('task-groups.js requires backlog-select', /require\('\.\/backlog-select'\)/.test(tg));
check('_backlogNoteLines selects through selectReminders, with the liveness predicate', /const sel = selectReminders\(open, sessionKey, \{ limit: LIMIT, isLive: isLiveClaim \}\)/.test(tg));
check('renderContext + renderMultiContext thread isLiveClaim to _backlogNoteLines; multi shares ONE highBudget', /this\._backlogNoteLines\(t, \{ gid: multi \? `--group \$\{t\.id\} ` : '', sessionKey, tools, isLiveClaim \}\)/.test(tg) && /this\._backlogNoteLines\(ts\[id\], \{ gid: `--group \$\{id\} `, sessionKey, tools, isLiveClaim, highBudget, mineBudget, nudge: false \}\)/.test(tg) && /const highBudget = \{ bytes: HIGH_LINE_TEXT_BYTES \};/.test(tg));
check('every agent-routes render call passes isLiveClaim: liveClaimPredicate() (4 sites)', (ar.match(/isLiveClaim: liveClaimPredicate\(\)/g) || []).length === 4 && (ar.match(/tasks\.render(?:Multi)?Context\(/g) || []).length === 4);
check('GET task remembers the listing it served; findIdx resolves a number against it', /rememberBacklogListing\(`\$\{you\}\|\$\{gid\}`, openSorted\.map\(\(b\) => b\.id\)\);/.test(ar) && /const shown = backlogListingShown\.get\(`\$\{key\}\|\$\{gid\}`\);/.test(ar));
check('done/drop echo the resolved item by id', /backlog\[r\]\.resolvedAt = Date\.now\(\);\n\s*actedId = backlog\[r\]\.id \|\| null;/.test(ar));
{
  // raw source (the '/**' string literal in renderTaskMd defeats the comment stripper — see below)
  const raw = fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8');
  check('the repo-file writer + TASK.md + reminders print through markedText; the reader gates markers on the frontmatter key', /body\.push\(`- \[\$\{b\.status === 'done'[^\n]*\} \$\{markedText\(b\)\}`\);/.test(raw) && /lines\.push\(`- \[\$\{b\.id \|\| '\?'\}\] \$\{markedText\(b\)\}/.test(raw) && /out\.push\(`- \[\$\{b\.id \|\| '\?'\}\] \$\{markedText\(\{ priority: b\.priority/.test(raw) && /'backlog_priority: markers',/.test(raw) && /const markersOn = fm\.backlog_priority === 'markers';/.test(raw));
}
{
  // (the raw source: renderTaskMd holds a '/**' string literal the comment stripper would eat through)
  const raw = fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8');
  const body = raw.slice(raw.indexOf('  renderTaskMd(t, cap = 50) {'), raw.indexOf('  syncAllContextMd() {'));
  check('renderTaskMd lists through sortBacklog', /\n\s*const openBl = sortBacklog\(\(t\.backlog \|\| \[\]\)\.filter/.test(body));
}
check('update() normalizes priority', /priority: normalizePriority\(it\?\.priority\),/.test(tg));
check('agent-routes requires backlog-select and GET task sorts with it', /require\('\.\/backlog-select\.js'\)/.test(ar) && /const openSorted = sortBacklog\(\(t\.backlog \|\| \[\]\)\.filter\(\(b\) => b\.status === 'open'\)\);/.test(ar) && /backlog: openSorted,/.test(ar));
check('findIdx numbers the SAME sorted open list (never the store order)', /const ids = shown \|\| sortBacklog\(backlog\.filter\(\(b\) => b\.status === 'open'\)\)\.map\(\(b\) => b\.id\);/.test(ar));
check('the route refuses a priority outside the set', /!BACKLOG_PRIORITIES\.includes\(priority\)\) return res\.status\(400\)/.test(ar));
check('the CLI passes `priority` on backlog-add and backlog-edit', /\{ add: arg, [^\n]*\{ priority \}/.test(cli) && /body\.priority = priority;/.test(cli));
check('backlog-select.js is PURE (imports nothing)', !/require\(/.test(bs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));

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
  check('every sorted row still names ITS store index (_i) — a write patches the right item', rows.every((r) => stored[r._i].id === r.id));
  // the Priority submenu's write: patchItem(it._i, b => ({ ...b, priority })) over the WHOLE backlog, one update
  const target = rows.find((r) => r.text === 'old normal');
  const next = stored.map((b, j) => (j === target._i ? { ...b, priority: 'high' } : b));
  const after = tasks.update(g7.id, { backlog: next }).backlog;
  const moved = after.find((b) => b.id === target.id);
  check('the menu write stores the new priority on THAT item (by id), nothing else changes', moved.priority === 'high'
    && JSON.stringify(after.filter((b) => b.id !== target.id)) === JSON.stringify(stored.filter((b) => b.id !== target.id)), JSON.stringify(after));
  check('…and keeps its identity, claim and attribution', moved.text === 'old normal' && moved.addedBy === 'claude:aaa' && moved.claimedBy.join() === 'claude:aaa' && after.length === stored.length);
  check('after the write the tab re-sorts it among the highs (newest high first)', sel.sortBacklog(after).map((b) => b.text).slice(0, 2).join('|') === 'mid high|old normal');
  const back = tasks.update(g7.id, { backlog: after.map((b) => (b.id === target.id ? { ...b, priority: 'normal' } : b)) }).backlog;
  check('choosing Normal writes normal (no chip)', back.find((b) => b.id === target.id).priority === 'normal');
}
{
  // comments stripped: a pin must be satisfied by CODE, never by a note (the 2.369.134 lesson)
  const TL = strip(fs.readFileSync(path.join(REPO, 'src/lib/task-log.js'), 'utf8'));
  const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  const pins = {
    'task-log.js imports sortBacklog/normalizePriority/PRIORITIES from the pure module': (src) => /^import \{ PRIORITIES, normalizePriority, priorityMarker, sortBacklog \} from '\.\.\/backlog-select\.js';$/m.test(src),
    'the Backlog tab lists sortBacklog(items), filtered after': (src) => /const visible = sortBacklog\(items\)\.filter\(\(it\) =>/.test(src),
    'a chip per non-normal row: class bl-prio bl-prio-<p>, normal ⇒ no chip': (src) => /if \(n === 'normal'\) return null;/.test(src) && /c\.className = 'bl-prio bl-prio-' \+ n;/.test(src) && /const chip = prioChip\(it\.priority\);\n\s*if \(chip\) top\.appendChild\(chip\);/.test(src),
    'chip words: t(High) / t(Low) with t(High priority) / t(Low priority) titles': (src) => /high: t\('High'\), normal: t\('Normal'\), low: t\('Low'\)/.test(src) && /t\('High priority'\) : t\('Low priority'\)/.test(src),
    'setPriority = ONE whole-backlog write through patchItem (no local mutation)': (src) => /patchItem\(it\._i, \(b\) => \(\{ \.\.\.b, priority: p \}\)\);/.test(src) && !/it\.priority\s*=[^=]/.test(src) && /const next = task\.backlog\.map\(\(b, j\) => \(j === idx \? fn\(\{ \.\.\.b \}\) : b\)\);\n\s*sidebar\._taskUpdate\(taskId, \{ backlog: next\.filter\(Boolean\) \}\);/.test(src),
    "the row's context menu carries a Priority submenu over PRIORITIES": (src) => /line\.addEventListener\('contextmenu'/.test(src) && /\{ label: t\('Priority'\), children: PRIORITIES\.map\(\(p\) => \(\{[^\n]*action: \(\) => setPriority\(it, p\) \}\)\) \}/.test(src),
    'Copy as Markdown exports the view order with the markers': (src) => /md = sortBacklog\(task\.backlog \|\| \[\]\)\n\s*\.filter\(/.test(src) && /\$\{priorityMarker\(it\.priority\) \? priorityMarker\(it\.priority\) \+ ' ' : ''\}\$\{it\.text\}/.test(src),
    'the ✎ editor has a Priority select and Save writes it': (src) => /prioLbl\.textContent = t\('Priority'\);/.test(src) && /b\.priority = ps\.value;/.test(src) && /form\.append\(ti, prioWrap, ta, btns\);/.test(src),
  };
  for (const [name, fn] of Object.entries(pins)) check(`pin: ${name}`, fn(TL));
  // NEGATIVE CONTROLS — each pin must fail on a copy with its wiring removed
  const cuts = [
    ['the Backlog tab lists sortBacklog(items), filtered after', ['const visible = sortBacklog(items).filter(', 'const visible = items.filter(']],
    ['a chip per non-normal row: class bl-prio bl-prio-<p>, normal ⇒ no chip', ['if (chip) top.appendChild(chip);', '']],
    ['setPriority = ONE whole-backlog write through patchItem (no local mutation)', ['patchItem(it._i, (b) => ({ ...b, priority: p }));', 'it.priority = p; render();']],
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
  check('style.css has .bl-prio-high and .bl-prio-low chips', rules.some((l) => l.startsWith('.bl-prio-high ')) && rules.some((l) => l.startsWith('.bl-prio-low ')));
  const lit = (l) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(l);
  check('the chip rules use theme vars only (no literal colours)', rules.length >= 3 && !rules.some(lit), rules.filter(lit).join(' | '));
  check('negative control: the literal-colour check catches a hard-coded colour', lit('.bl-prio-high { color: #e55; }'));
  // i18n: the new keys exist in both dictionaries
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8');
  const ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const keys = ['Priority', 'High priority', 'Low priority', 'High', 'Normal', 'Low'];
  check('zh + ja carry every Backlog-priority key', keys.every((k) => zh.includes(`  "${k}": `) && ja.includes(`  "${k}": `)), keys.filter((k) => !zh.includes(`  "${k}": `) || !ja.includes(`  "${k}": `)).join(','));
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED (${passed} passed)`); process.exit(1); }
console.log(`\nALL PASS (${passed})`);
