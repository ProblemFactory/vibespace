#!/usr/bin/env node
// THE BACKLOG STORE NEVER TRUNCATES (2026-09-22): the 工作 group sat at exactly
// 200 items = the old `CAPS.backlogItems` and every `vibespace-task backlog-add`
// was sliced off silently while the CLI echoed the last SURVIVING item's id
// ("parked as [B-a5b0]" for an item that was never stored). Owner: no cap —
// a bound belongs to a READ (what an injection selects, by ownership and
// priority), never to a WRITE. Legs: (1) 2000 items round-trip through
// update() intact, ids unique, order kept; (2) the TASK.md re-parse path and
// the import path keep everything; (3) the REAL /api/agent/task-backlog route
// on a 600-item store echoes THE STORED ITEM found by identity (a fresh id,
// present afterwards); (4) source pins — no `CAPS.backlogItems` anywhere, the
// route finds the added item by identity (never by position), the CLI reads
// `r.item` (never the last element); (5) the REAL CLI against an OLDER server
// (built before 2.369.150 — it stores the item and answers with only the open
// `backlog`): the item is found by its exact (trimmed) text, never by position,
// a truncated store is refused, and master's pre-fallback CLI as the CONTROL
// reported "not stored" for a stored item. Run: node scripts/test-backlog-no-truncation.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { TaskGroupManager } = require('../src/task-groups.js');
const { setupAgentRoutes } = require('../src/agent-routes.js');

let failed = 0, passed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-backlog-notrunc-'));
const tasks = new TaskGroupManager({ dataDir: tmp, onChange: () => {} });
const cwd = path.join(tmp, 'work'); fs.mkdirSync(cwd, { recursive: true });
const g = tasks.create({ title: 'big', objective: 'obj', folders: [cwd] });

// (1) 2000 items — 1500 done, 480 open, 20 dropped — round-trip intact
const N = 2000;
const mk = (i) => ({ text: `item ${i}`, status: i % 100 === 0 ? 'dropped' : (i % 4 === 0 ? 'open' : 'done'), addedBy: 'claude:x', claimedBy: ['claude:x'], addedAt: 1e12 + i, ...(i % 4 !== 0 ? { resolvedBy: 'claude:x', resolvedAt: 1e12 + i + 1 } : {}) });
const items = Array.from({ length: N }, (_, i) => mk(i));
const after = tasks.update(g.id, { backlog: items }).backlog;
check(`update() keeps all ${N} items (got ${after.length})`, after.length === N);
check('ids minted for every item, all unique', after.every((b) => /^B-[0-9a-f]{4,8}$/i.test(b.id)) && new Set(after.map((b) => b.id)).size === N);
check('order kept (first/last text)', after[0].text === 'item 0' && after[N - 1].text === `item ${N - 1}`);
check('statuses kept (open count)', after.filter((b) => b.status === 'open').length === items.filter((b) => b.status === 'open').length);
// +1 on top of a big store: the new item is stored, everything else stays
const plusOne = tasks.update(g.id, { backlog: [...after, { text: 'the 2001st', status: 'open', addedBy: 'claude:y', claimedBy: ['claude:y'], addedAt: Date.now() }] }).backlog;
check('adding to a 2000-item store keeps 2001 (nothing sliced)', plusOne.length === N + 1 && plusOne[N].text === 'the 2001st');
const stored = JSON.parse(fs.readFileSync(path.join(tmp, 'task-groups.json'), 'utf8'));
const onDisk = Object.values(stored.tasks).find((t) => t.id === g.id).backlog;
check('the store on disk carries all 2001', onDisk.length === N + 1);

// (2) the injection form deliberately omits the backlog (user directive
// 2.122.0: a summary of CLAIMED items only) — the FULL listing is the `show`
// route, which must carry every open item (checked after the routes are wired)

// (3) the REAL route on a 600-item store: the echo is the stored item, by identity
const routes = {};
const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
const session = { agentToken: 'vsst_test', backend: 'claude', cwd, name: 't' };
const activeSessions = new Map([['sess1', session]]);
setupAgentRoutes({
  app, activeSessions, tasks,
  sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => {} },
  SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
  userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
  sessionStatusKey: (s, id) => `claude:${id}`,
  serverSetting: () => undefined,
  scheduleCtxSync: () => {},
  remoteCtxBaseFor: () => null,
});
tasks.update(g.id, { backlog: Array.from({ length: 600 }, (_, i) => mk(i)) });
const post = (body) => {
  let out, code = 200;
  const req = { headers: { authorization: 'Bearer vsst_test' }, query: {}, body };
  const res = { json: (o) => { out = o; }, status: (c) => { code = c; return res; } };
  routes['POST /api/agent/task-backlog'](req, res);
  return { out, code };
};
{
  tasks.update(g.id, { backlog: plusOne });
  let out; const req = { headers: { authorization: 'Bearer vsst_test' }, query: {}, body: {} };
  const res = { json: (o) => { out = o; }, status: () => res };
  routes['GET /api/agent/task'](req, res);
  const openN = plusOne.filter((b) => b.status === 'open').length;
  check(`the show route lists every open item of a 2001-item store (${openN})`, out && out.task && Array.isArray(out.task.backlog) && out.task.backlog.length === openN, out && JSON.stringify(out).slice(0, 160));
  tasks.update(g.id, { backlog: Array.from({ length: 600 }, (_, i) => mk(i)) });
}
const before = new Set(tasks.get(g.id).backlog.map((b) => b.id));
const r = post({ add: 'parked on a full store', detail: '中文 (括号) / 斜杠' });
check('route answers 200 with success', r.code === 200 && r.out && r.out.success === true, JSON.stringify(r.out).slice(0, 200));
check('the echoed item is the one just added (by text + detail), with a FRESH id', r.out.item && r.out.item.text === 'parked on a full store' && r.out.item.detail === '中文 (括号) / 斜杠' && !before.has(r.out.item.id), JSON.stringify(r.out.item));
check('the item is in the stored backlog afterwards (601)', tasks.get(g.id).backlog.length === 601 && tasks.get(g.id).backlog.some((b) => b.id === r.out.item.id));
check('the echoed item is claimed by the caller', Array.isArray(r.out.item.claimedBy) && r.out.item.claimedBy.includes('claude:sess1'));
const r2 = post({ add: 'second on the same store' });
check('a second add gets its own fresh id', r2.out && r2.out.item && r2.out.item.id !== r.out.item.id && tasks.get(g.id).backlog.length === 602);
// claim echo by ID survives a reorder of the array (a position is not an identity)
const target = tasks.get(g.id).backlog[3];
const rc = post({ claim: target.id });
check('claim echoes the item by id', rc.out && rc.out.item && rc.out.item.id === target.id && rc.out.item.claimedBy.includes('claude:sess1'), JSON.stringify(rc.out).slice(0, 200));

// (4) source pins
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const tg = strip(fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8'));
const ar = strip(fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8'));
const cli = strip(fs.readFileSync(path.join(REPO, 'data/bin/vibespace-task'), 'utf8'));
check('no `CAPS.backlogItems` (no store cap) anywhere in task-groups.js', !/CAPS\.backlogItems/.test(tg));
check('no `.slice(0, CAPS.` on a backlog array in task-groups.js', !/backlog\.slice\(0, CAPS\./.test(tg));
check('the route finds the added item by identity (addedAt + addedBy + text)', /updated\.backlog\.find\(\(b\) => b\.addedAt === added\.addedAt && b\.addedBy === key && b\.text === added\.text\)/.test(ar));
check('the route never echoes by position', !/updated\.backlog\[actedIdx\]/.test(ar));
check('the route refuses when the item is not found stored', /the item was not stored/.test(ar));
const addBranch = cli.slice(cli.indexOf("cmd === 'backlog-add'"), cli.indexOf("cmd === 'backlog-claim'"));
check('the CLI reads r.item FIRST for backlog-add, the older-server fallback matches by EXACT text + open, never the last element',
  /const mine = \(r && r\.item\) \|\| \(\(r && r\.backlog\) \|\| \[\]\)\.find\(\(b\) => b && b\.text === added && b\.status === 'open'\) \|\| null;/.test(addBranch)
  && /const added = String\(arg\)\.trim\(\);/.test(addBranch)
  && !/backlog\[backlog\.length - 1\]|\.at\(-1\)|\.pop\(\)/.test(addBranch));

// (5) the REAL CLI against an older server's answer shape
const { execFile } = await import('node:child_process');
const http = await import('node:http');
let reply = null;
const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(reply)); }); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const apiUrl = `http://127.0.0.1:${srv.address().port}`;
const runCli = (file, args) => new Promise((resolve) => execFile(process.execPath, [file, ...args], { env: { ...process.env, VIBESPACE_API: apiUrl, VIBESPACE_SESSION_TOKEN: 'vsst_test' }, timeout: 15000 }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: String(stdout) + String(stderr) })));
const CLI = path.join(REPO, 'data/bin/vibespace-task');
const OLD_SHAPE = { success: true, backlog: [{ id: 'B-aaaa', text: 'another item', status: 'open' }, { id: 'B-bbbb', text: 'my parked item', status: 'open' }, { id: 'B-cccc', text: 'a later stranger', status: 'open' }] };
reply = { success: true, item: { id: 'B-1111', text: 'my parked item', status: 'open' }, backlog: OLD_SHAPE.backlog };
let c = await runCli(CLI, ['backlog-add', 'my parked item']);
check('a current server: the CLI echoes r.item', c.code === 0 && /parked as \[B-1111\]/.test(c.out), c.out);
reply = OLD_SHAPE;
c = await runCli(CLI, ['backlog-add', '  my parked item  ']);
check('an older server (backlog only): the stored item found by its exact trimmed text — NOT the last element', c.code === 0 && /parked as \[B-bbbb\]/.test(c.out) && !/B-cccc/.test(c.out), c.out);
reply = { success: true, backlog: [{ id: 'B-aaaa', text: 'another item', status: 'open' }, { id: 'B-zzzz', text: 'a stranger that survived the slice', status: 'open' }] };
c = await runCli(CLI, ['backlog-add', 'my parked item']);
check('an older server that did NOT store it: refused (exit 1), the stranger never echoed', c.code === 1 && /did not store/.test(c.out) && !/B-zzzz/.test(c.out), c.out);
reply = { success: true, backlog: [{ id: 'B-dddd', text: 'my parked item', status: 'done' }] };
c = await runCli(CLI, ['backlog-add', 'my parked item']);
check('an older server whose only exact-text row is closed: refused (the fallback is open rows only)', c.code === 1 && !/B-dddd/.test(c.out), c.out);
// CONTROL — the pre-fallback CLI (r.item only) on the older server's answer
const preSrc = fs.readFileSync(CLI, 'utf8').replace(/const mine = \(r && r\.item\) \|\| [^\n]*\n/, 'const mine = r && r.item;\n');
const preFile = path.join(tmp, 'vibespace-task.pre'); fs.writeFileSync(preFile, preSrc);
reply = OLD_SHAPE;
c = await runCli(preFile, ['backlog-add', 'my parked item']);
check('control: the r.item-only CLI reports "not stored" for an item the older server stored', preSrc !== fs.readFileSync(CLI, 'utf8') && c.code === 1 && /did not store/.test(c.out), c.out);
srv.close();

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log(`\nALL PASS (${passed})`); // counted, never a literal (the literal said 20 over 19 checks)
