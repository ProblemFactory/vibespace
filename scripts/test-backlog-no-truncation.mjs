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
// reported "not stored" for a stored item; `--priority` the older server
// ignores is SAID, never claimed (add + edit, with a no-check control).
// Run: node scripts/test-backlog-no-truncation.mjs
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
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
const check = (name, cond, extra) => { if (typeof cond !== 'boolean') throw new TypeError(`check: its condition is a ${typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`);
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
// a leg that judges prints every fact it judges — on a pass too (B-6edc's legs)
const checkP = (name, cond, facts) => { check(name, verdictOf(cond), facts); if (cond) console.log(`    ${facts}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-backlog-notrunc-'));
// lane cli-one-text-arg: a CLI copy outside the checkout reads its ONE-text rule beside it (a host's layout: the boot-time copy)
fs.copyFileSync(path.join(REPO, 'src/agent-cli-text.js'), path.join(tmp, 'agent-cli-text.js'));
fs.copyFileSync(path.join(REPO, 'src/cli-call.js'), path.join(tmp, 'cli-call.js'));   // lane cli-call-timeouts: THE ONE CALL rides beside it too
const tasks = new TaskGroupManager({ dataDir: tmp, onChange: () => {} });
// lane lg-store-writes U5 + the U4/U5 cure: the store writer's owed writes landed — LOUDLY (a landing that left a write throws)
const landOwed = () => { const r = require('../src/store-writer.js').storeWriter().flushSync(); if (r.left && r.left.length) throw new Error(`the store writer left owed writes: ${JSON.stringify(r.left)}`); };
const cwd = path.join(tmp, 'work'); fs.mkdirSync(cwd, { recursive: true });
const g = tasks.create({ title: 'big', objective: 'obj', folders: [cwd] });

// (1) 2000 items — 1500 done, 480 open, 20 dropped — round-trip intact
const N = 2000;
const mk = (i) => ({ text: `item ${i}`, status: i % 100 === 0 ? 'dropped' : (i % 4 === 0 ? 'open' : 'done'), addedBy: 'claude:x', claimedBy: ['claude:x'], addedAt: 1e12 + i, ...(i % 4 !== 0 ? { resolvedBy: 'claude:x', resolvedAt: 1e12 + i + 1 } : {}) });
const items = Array.from({ length: N }, (_, i) => mk(i));
const after = tasks.update(g.id, { backlog: items }).backlog;
check(`update() keeps all ${N} items (got ${after.length})`, after.length === N);
check('ids minted for every item, all unique', gateOf(after.every((b) => /^B-[0-9a-f]{4,8}$/i.test(b.id))) && new Set(after.map((b) => b.id)).size === N);
check('order kept (first/last text)', after[0].text === 'item 0' && after[N - 1].text === `item ${N - 1}`);
check('statuses kept (open count)', after.filter((b) => b.status === 'open').length === items.filter((b) => b.status === 'open').length);
// +1 on top of a big store: the new item is stored, everything else stays
const plusOne = tasks.update(g.id, { backlog: [...after, { text: 'the 2001st', status: 'open', addedBy: 'claude:y', claimedBy: ['claude:y'], addedAt: Date.now() }] }).backlog;
check('adding to a 2000-item store keeps 2001 (nothing sliced)', plusOne.length === N + 1 && plusOne[N].text === 'the 2001st');
landOwed();   // lane lg-store-writes U5: task-groups.json is the store writer's — landed before the file is read (loudly: the U4/U5 cure, should 6)
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
  sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => {} },
  SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
  userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
  sessionStatusKey: (s, id) => `claude:${id}`,
  serverSetting: () => undefined,
  scheduleCtxSync: () => {},
  remoteCtxBaseFor: () => null,
});
tasks.update(g.id, { backlog: Array.from({ length: 600 }, (_, i) => mk(i)) });
// lane lg-store-writes, the U4/U5 cure: a CLAIM answers once task-groups.json holds it (on the store writer's synchronous
// road) — a route not answered in its own run is answered when the suite LANDS the writer's owed writes (landOwed, above)
const post = (body) => {
  let out, code = 200;
  const req = { headers: { authorization: 'Bearer vsst_test' }, query: {}, body };
  const res = { json: (o) => { out = o; }, status: (c) => { code = c; return res; } };
  routes['POST /api/agent/task-backlog'](req, res);
  const inRun = out !== undefined;
  if (!inRun) landOwed();
  return { out, code, inRun };
};
{
  tasks.update(g.id, { backlog: plusOne });
  let out; const req = { headers: { authorization: 'Bearer vsst_test' }, query: {}, body: {} };
  const res = { json: (o) => { out = o; }, status: () => res };
  routes['GET /api/agent/task'](req, res);
  const openN = plusOne.filter((b) => b.status === 'open').length;
  check(`the show route lists every open item of a 2001-item store (${openN})`, gateOf(out) && gateOf(out.task) && gateOf(Array.isArray(out.task.backlog)) && out.task.backlog.length === openN, out && JSON.stringify(out).slice(0, 160));
  tasks.update(g.id, { backlog: Array.from({ length: 600 }, (_, i) => mk(i)) });
}
const before = new Set(tasks.get(g.id).backlog.map((b) => b.id));
const r = post({ add: 'parked on a full store', detail: '中文 (括号) / 斜杠' });
check('route answers 200 with success', r.code === 200 && gateOf(r.out) && r.out.success === true, JSON.stringify(r.out).slice(0, 200));
check('the echoed item is the one just added (by text + detail), with a FRESH id', gateOf(r.out.item) && r.out.item.text === 'parked on a full store' && r.out.item.detail === '中文 (括号) / 斜杠' && !before.has(r.out.item.id), JSON.stringify(r.out.item));
check('the item is in the stored backlog afterwards (601)', tasks.get(g.id).backlog.length === 601 && verdictOf(tasks.get(g.id).backlog.some((b) => b.id === r.out.item.id)));
check('the echoed item is claimed by the caller', gateOf(Array.isArray(r.out.item.claimedBy)) && verdictOf(r.out.item.claimedBy.includes('claude:sess1')));
const r2 = post({ add: 'second on the same store' });
check('a second add gets its own fresh id', gateOf(r2.out) && gateOf(r2.out.item) && r2.out.item.id !== r.out.item.id && tasks.get(g.id).backlog.length === 602);
// claim echo by ID survives a reorder of the array (a position is not an identity)
const target = tasks.get(g.id).backlog[3];
const rc = post({ claim: target.id });
check('claim echoes the item by id', gateOf(rc.out) && gateOf(rc.out.item) && rc.out.item.id === target.id && verdictOf(rc.out.item.claimedBy.includes('claude:sess1')), JSON.stringify(rc.out).slice(0, 200));
// the U4/U5 cure (主开发's as-if-must): a claim is NOT answered while task-groups.json does not hold it (two agents are never
// both told they own a row) — answered once the writer landed it; the census cure (主开发 2026-11-19 08:56Z, the hunt's finding 2): an
// ADD too — every writing verb answers once the row is on disk (a parked row is never lost in silence)
check('a CLAIM is answered only once task-groups.json holds it (not in the route\'s own run; answered when the store landed)', rc.inRun === false && !!rc.out && verdictOf(JSON.parse(fs.readFileSync(path.join(tmp, 'task-groups.json'), 'utf8')).tasks[g.id].backlog.find((b) => b.id === target.id).claimedBy.includes('claude:sess1')), { inRun: rc.inRun });
{
  const disk = () => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(tmp, 'task-groups.json'), 'utf8')).tasks).find((t) => t.id === g.id).backlog; } catch { return []; } };
  check('an ADD is answered only once task-groups.json holds its row (the census cure, finding 2: not in the route\'s own run; «parked» is never said for a row a kill would lose)', r.inRun === false && r2.inRun === false && gateOf(disk().some((b) => b.id === r.out.item.id)) && verdictOf(disk().some((b) => b.id === r2.out.item.id)), { add: r.inRun, add2: r2.inRun });
  const rd = post({ done: r2.out.item.id });
  check('a DONE is answered only once task-groups.json holds it (the census cure, finding 2: a resolved row never comes back open in silence)', rd.inRun === false && gateOf(rd.out) && rd.out.success === true && disk().find((b) => b.id === r2.out.item.id)?.status === 'done', { inRun: rd.inRun, out: rd.out && rd.out.success });
}

// (3b) B-31d7 (2026-09-26, B-4ffb stored twice): the store keeps an item's ONE LINE to 500 characters
// (CAPS.backlogItem) and its detail to 6000. A 600-character title was stored CLIPPED, the identity
// echo compared the clipped text with the sent one, and the route answered "the item was not stored —
// nothing parked" for an item that WAS stored — the agent parked it again. Over the cap the route now
// refuses BEFORE the write, by name, with the recipe (shorter line, the rest in --detail); at the cap
// (CJK, ①…⑨, →) it is stored whole and echoed by id. edit --text / --detail keep the same caps.
{
  const unit = '①②③④⑤⑥⑦⑧⑨ 去重 → (括号) / ';
  const mkText = (n) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n - 1) + '。'; // never ends in a space (the route trims)
  const count = () => tasks.get(g.id).backlog.length;
  const n0 = count();
  const long = mkText(612);
  const rl = post({ add: long, detail: 'the rest' });
  check('B-31d7: a 612-character line is refused 400 by name — the cap, its length, --detail, nothing parked', rl.code === 400 && gateOf(rl.out) && gateOf(/612/.test(rl.out.error || '')) && gateOf(/500/.test(rl.out.error || '')) && gateOf(/--detail/.test(rl.out.error || '')) && verdictOf(/nothing parked/.test(rl.out.error || '')), JSON.stringify(rl));
  check('B-31d7: …and the store is unchanged (no clipped twin of it)', count() === n0 && !tasks.get(g.id).backlog.some((b) => b.text === long.slice(0, 500)), `count ${n0} → ${count()}`);
  const at = mkText(500);
  const ra = post({ add: at });
  check('B-31d7: exactly 500 characters (①…⑨, →, CJK) is stored WHOLE and echoed by its fresh id', ra.code === 200 && gateOf(ra.out.item) && ra.out.item.text === at && verdictOf(tasks.get(g.id).backlog.some((b) => b.id === ra.out.item.id && b.text === at)), JSON.stringify(ra).slice(0, 200));
  const mid = mkText(330);
  const rm = post({ add: mid, detail: '330 characters, as reported' });
  check('B-31d7: the reported ~330-character CJK title is stored and echoed', rm.code === 200 && gateOf(rm.out.item) && rm.out.item.text === mid, JSON.stringify(rm).slice(0, 200));
  const rd = post({ add: 'a short line', detail: 'x'.repeat(6001) });
  check('B-31d7: a 6001-character detail is refused 400 by name (never clipped silently)', rd.code === 400 && gateOf(/6001/.test(rd.out.error || '')) && verdictOf(/6000/.test(rd.out.error || '')), JSON.stringify(rd).slice(0, 200));
  const n1 = count();
  const re = post({ edit: ra.out.item.id, text: mkText(501) });
  check('B-31d7: edit --text past the cap is refused 400 and the item keeps its words', re.code === 400 && gateOf(/501/.test(re.out.error || '')) && tasks.get(g.id).backlog.find((b) => b.id === ra.out.item.id).text === at && count() === n1, JSON.stringify(re).slice(0, 200));
  const rde = post({ edit: ra.out.item.id, detail: 'y'.repeat(6001) });
  check('B-31d7: edit --detail past the cap is refused 400', rde.code === 400 && !tasks.get(g.id).backlog.find((b) => b.id === ra.out.item.id).detail, JSON.stringify(rde).slice(0, 200));
}

// (3b) B-6edc (agent feedback fb-f5f3c65a9d; 主开发's law): AN EDIT NEVER LOSES A DETAIL BY ACCIDENT — the plain --detail ADDS
// (the old text kept, the new below it); replacing or clearing the WHOLE detail is asked for by name (replaceDetail); the answer
// says the characters before and after; a refusal changes nothing; an older CLI's plain form gets the safe add
{
  const { anchored } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const drive = (setup) => {
    const rt = {}, ap = { get: (p, h) => { rt[`GET ${p}`] = h; }, post: (p, h) => { rt[`POST ${p}`] = h; } };
    setup({ app: ap, activeSessions, tasks, sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => {} }, SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' }, userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) }, sessionStatusKey: (s, id) => `claude:${id}`, serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null });
    return (body) => { let out, code = 200; const req = { headers: { authorization: 'Bearer vsst_test' }, query: {}, body }; const res = { json: (o) => { out = o; }, status: (c) => { code = c; return res; } }; rt['POST /api/agent/task-backlog'](req, res); return { out, code }; };
  };
  const detailOf = (id) => (tasks.get(g.id).backlog.find((b) => b.id === id) || {}).detail;
  const J = JSON.stringify;
  const a = post({ add: 'B-6edc: a row with a detail', detail: 'the old evidence, dated' }), id = a.out.item.id;
  const r1 = post({ edit: id, detail: 'one more line' });
  checkP('B-6edc: a plain --detail ADDS — the old text kept, the new line below it; the answer says the characters before and after',
    r1.code === 200 && detailOf(id) === 'the old evidence, dated\none more line' && J(r1.out.detailEdit) === J({ mode: 'added', was: 23, now: 37 }), J({ code: r1.code, d: detailOf(id), de: r1.out && r1.out.detailEdit }));
  const r2 = post({ edit: id, detail: '' });
  checkP('B-6edc: a plain --detail "" is REFUSED by name (it would clear) — the detail untouched, the recipe named (--replace-detail)',
    r2.code === 400 && r2.out.code === 'detail-clear-by-name' && /--replace-detail/.test(r2.out.error) && /37 characters/.test(r2.out.error) && detailOf(id) === 'the old evidence, dated\none more line', J({ code: r2.code, out: r2.out, d: detailOf(id) }));
  const r3 = post({ edit: id, detail: 'the whole new detail', replaceDetail: true });
  checkP('B-6edc: replacing the WHOLE detail is asked for by name (replaceDetail) — done, and the answer says how many characters it replaced',
    r3.code === 200 && detailOf(id) === 'the whole new detail' && J(r3.out.detailEdit) === J({ mode: 'replaced', was: 37, now: 20 }), J({ code: r3.code, d: detailOf(id), de: r3.out && r3.out.detailEdit }));
  const r4 = post({ edit: id, detail: '', replaceDetail: true });
  checkP('B-6edc: clearing is asked for by name too (--detail "" --replace-detail): the detail gone, «cleared» with the characters removed',
    r4.code === 200 && detailOf(id) === undefined && J(r4.out.detailEdit) === J({ mode: 'cleared', was: 20, now: 0 }), J({ code: r4.code, d: detailOf(id) === undefined ? '(no detail)' : detailOf(id), de: r4.out && r4.out.detailEdit }));
  const r5 = post({ edit: id, detail: 'first words' });
  checkP('B-6edc: a plain --detail on an item with no detail SETS it («set»)', r5.code === 200 && detailOf(id) === 'first words' && J(r5.out.detailEdit) === J({ mode: 'set', was: 0, now: 11 }), J({ code: r5.code, d: detailOf(id), de: r5.out && r5.out.detailEdit }));
  post({ edit: id, detail: 'z'.repeat(5990), replaceDetail: true });
  const r6 = post({ edit: id, text: 'renamed in the same request', detail: 'a line past the cap' });
  checkP('B-6edc: an add that would pass the cap is refused by name (the sizes, the replace recipe) — and NOTHING of the request is applied (the text either)',
    r6.code === 400 && r6.out.code === 'detail-too-long' && /6010/.test(r6.out.error) && /6000/.test(r6.out.error) && detailOf(id) === 'z'.repeat(5990) && tasks.get(g.id).backlog.find((b) => b.id === id).text === 'B-6edc: a row with a detail',
    J({ code: r6.code, out: r6.out, detailLength: (detailOf(id) || '').length, detailSame: detailOf(id) === 'z'.repeat(5990), text: tasks.get(g.id).backlog.find((b) => b.id === id).text }));
  // RED CONTROL: the old replace compiled back into a copy of the route — the plain form loses the old text again
  const AR = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const OLD = anchored(AR, '          nextDetail = joined;\n', '          nextDetail = d;\n', 'b6edc-old-replace');
  const M = mutantCopies('backlog-6edc', REPO), oldPost = drive(M.load('src/agent-routes.js', OLD, 'b6edc-old-replace').setupAgentRoutes);
  const b = post({ add: 'B-6edc control row', detail: 'kept evidence' }), bid = b.out.item.id;
  oldPost({ edit: bid, detail: 'one more line' });
  checkP('B-6edc CONTROL: with the old replace in a copy of the route, the plain --detail WIPES the old detail — RED (the add leg can go red)', detailOf(bid) === 'one more line', J({ d: detailOf(bid), was: 'kept evidence' }));
  // r2 (主开发 r246): …AND NEVER DOUBLES IT — the replace era's habit (read the row, send the old text and the new together)
  const c0 = post({ add: 'B-6edc r2: the old + new habit', detail: 'the old evidence, dated' }), cid = c0.out.item.id;
  const r7 = post({ edit: cid, detail: '  the old evidence, dated\none more line\n' });
  checkP('B-6edc r2: a plain detail that already holds the WHOLE old detail at its start TAKES ITS PLACE (after the same trim) — nothing lost, nothing doubled, said «contained»',
    r7.code === 200 && detailOf(cid) === 'the old evidence, dated\none more line' && J(r7.out.detailEdit) === J({ mode: 'contained', was: 23, now: 37 }), J({ code: r7.code, d: detailOf(cid), de: r7.out && r7.out.detailEdit }));
  const r8 = post({ edit: cid, detail: 'the old evidence, dated\none more line' });
  checkP('B-6edc r2: the same whole detail sent again changes nothing (contained, 0 characters added)',
    r8.code === 200 && detailOf(cid) === 'the old evidence, dated\none more line' && J(r8.out.detailEdit) === J({ mode: 'contained', was: 37, now: 37 }), J({ code: r8.code, d: detailOf(cid), de: r8.out && r8.out.detailEdit }));
  const r9 = post({ edit: cid, detail: 'a note first\nthe old evidence, dated\none more line' });
  checkP('B-6edc r2: the old text NOT at the start is no «contained» — the plain add (the old kept whole above)',
    r9.code === 200 && detailOf(cid) === 'the old evidence, dated\none more line\na note first\nthe old evidence, dated\none more line' && r9.out.detailEdit && r9.out.detailEdit.mode === 'added', J({ code: r9.code, d: detailOf(cid), de: r9.out && r9.out.detailEdit }));
  post({ edit: cid, detail: 'y'.repeat(5990), replaceDetail: true });
  const r10 = post({ edit: cid, detail: 'y'.repeat(5990) + '\ntail' });
  checkP('B-6edc r2: near the cap the old + new habit is NOT refused (5990 held, 5995 sent: contained, 5 characters added)',
    r10.code === 200 && detailOf(cid) === 'y'.repeat(5990) + '\ntail' && J(r10.out.detailEdit) === J({ mode: 'contained', was: 5990, now: 5995 }), J({ code: r10.code, error: r10.out && r10.out.error, detailLength: (detailOf(cid) || '').length, de: r10.out && r10.out.detailEdit }));
  // RED CONTROL: the tip's join compiled back (no «contained») — the habit doubles the old text
  const JOIN = anchored(AR, "contained = oldT !== '' && d.startsWith(oldT);", 'contained = false;', 'b6edc-tip-join');
  const joinPost = drive(M.load('src/agent-routes.js', JOIN, 'b6edc-tip-join').setupAgentRoutes);
  const k0 = post({ add: 'B-6edc r2 control row', detail: 'kept evidence' }), kid = k0.out.item.id;
  joinPost({ edit: kid, detail: 'kept evidence\none more line' });
  checkP('B-6edc r2 CONTROL: with the tip\'s join in a copy of the route, the old + new habit DOUBLES the old text — RED (the «contained» leg can go red)',
    detailOf(kid) === 'kept evidence\nkept evidence\none more line', J({ d: detailOf(kid), sent: 'kept evidence\none more line' }));
}

// (4) source pins
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const tg = strip(fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8'));
const ar = strip(fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8'));
const cli = strip(fs.readFileSync(path.join(REPO, 'data/bin/vibespace-task'), 'utf8'));
check('no `CAPS.backlogItems` (no store cap) anywhere in task-groups.js', !/CAPS\.backlogItems/.test(tg));
check('no `.slice(0, CAPS.` on a backlog array in task-groups.js', !/backlog\.slice\(0, CAPS\./.test(tg));
check('the route finds the added item by identity (addedAt + addedBy + text)', verdictOf(/updated\.backlog\.find\(\(b\) => b\.addedAt === added\.addedAt && b\.addedBy === key && b\.text === added\.text\)/.test(ar)));
check('the route never echoes by position', !/updated\.backlog\[actedIdx\]/.test(ar));
check('the route refuses when the item is not found stored', verdictOf(/the item was not stored/.test(ar)));
const addBranch = cli.slice(cli.indexOf("cmd === 'backlog-add'"), cli.indexOf("cmd === 'backlog-claim'"));
check('the CLI reads r.item FIRST for backlog-add, the older-server fallback matches by EXACT text + open, never the last element',
  gateOf(/const mine = \(r && r\.item\) \|\| \(\(r && r\.backlog\) \|\| \[\]\)\.find\(\(b\) => b && b\.text === added && b\.status === 'open'\) \|\| null;/.test(addBranch))
  && gateOf(/const added = String\(arg\)\.trim\(\);/.test(addBranch))
  && !/backlog\[backlog\.length - 1\]|\.at\(-1\)|\.pop\(\)/.test(addBranch));

// (5) the REAL CLI against an older server's answer shape
const { execFile } = await import('node:child_process');
const http = await import('node:http');
let reply = null, sent = null;   // B-6edc: the body the CLI sent, read back
const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { sent = JSON.parse(b || 'null'); } catch { sent = null; } res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(reply)); }); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const apiUrl = `http://127.0.0.1:${srv.address().port}`;
const runCli = (file, args) => new Promise((resolve) => execFile(process.execPath, [file, ...args], { env: { ...process.env, VIBESPACE_API: apiUrl, VIBESPACE_SESSION_TOKEN: 'vsst_test' }, timeout: 15000 }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: String(stdout) + String(stderr) })));
const CLI = path.join(REPO, 'data/bin/vibespace-task');
const OLD_SHAPE = { success: true, backlog: [{ id: 'B-aaaa', text: 'another item', status: 'open' }, { id: 'B-bbbb', text: 'my parked item', status: 'open' }, { id: 'B-cccc', text: 'a later stranger', status: 'open' }] };
reply = { success: true, item: { id: 'B-1111', text: 'my parked item', status: 'open' }, backlog: OLD_SHAPE.backlog };
let c = await runCli(CLI, ['backlog-add', 'my parked item']);
check('a current server: the CLI echoes r.item', c.code === 0 && verdictOf(/parked as \[B-1111\]/.test(c.out)), c.out);
reply = OLD_SHAPE;
c = await runCli(CLI, ['backlog-add', '  my parked item  ']);
check('an older server (backlog only): the stored item found by its exact trimmed text — NOT the last element', c.code === 0 && gateOf(/parked as \[B-bbbb\]/.test(c.out)) && !/B-cccc/.test(c.out), c.out);
reply = { success: true, backlog: [{ id: 'B-aaaa', text: 'another item', status: 'open' }, { id: 'B-zzzz', text: 'a stranger that survived the slice', status: 'open' }] };
c = await runCli(CLI, ['backlog-add', 'my parked item']);
check('an older server that did NOT store it: refused (exit 1), the stranger never echoed', c.code === 1 && gateOf(/did not store/.test(c.out)) && !/B-zzzz/.test(c.out), c.out);
reply = { success: true, backlog: [{ id: 'B-dddd', text: 'my parked item', status: 'done' }] };
c = await runCli(CLI, ['backlog-add', 'my parked item']);
check('an older server whose only exact-text row is closed: refused (the fallback is open rows only)', c.code === 1 && !/B-dddd/.test(c.out), c.out);
// --priority against an older server: it stores the item and ignores the
// field — the CLI says so instead of claiming it (add AND edit)
reply = OLD_SHAPE;
c = await runCli(CLI, ['backlog-add', 'my parked item', '--priority', 'high']);
check('an older server + --priority high: parked, and the CLI says the priority was NOT recorded (never "priority high")', c.code === 0 && gateOf(/parked as \[B-bbbb\]/.test(c.out)) && gateOf(/note: the server did not record --priority high/.test(c.out)) && !/parked as \[B-bbbb\] priority high/.test(c.out), c.out);
reply = { success: true, item: { id: 'B-1111', text: 'my parked item', status: 'open', priority: 'high' }, backlog: [] };
c = await runCli(CLI, ['backlog-add', 'my parked item', '--priority', 'high']);
check('a current server + --priority high: "priority high", no unrecorded note', c.code === 0 && gateOf(/parked as \[B-1111\] priority high/.test(c.out)) && !/did not record/.test(c.out), c.out);
reply = { success: true, backlog: OLD_SHAPE.backlog }; // an old edit echoes no item
c = await runCli(CLI, ['backlog-edit', 'B-bbbb', '--text', 'renamed', '--priority', 'low']);
check('an older server + backlog-edit --priority: "updated text", never "priority low", plus the unrecorded note', c.code === 0 && gateOf(/^updated text$/m.test(c.out)) && !/priority low$/m.test(c.out) && verdictOf(/note: the server did not record --priority low/.test(c.out)), c.out);
const noNote = fs.readFileSync(CLI, 'utf8').replace("if (!priorityRecorded(mine)) printPriorityUnrecorded(mine.id);", '');
const noNoteFile = path.join(tmp, 'vibespace-task.nonote'); fs.writeFileSync(noNoteFile, noNote);
reply = OLD_SHAPE;
c = await runCli(noNoteFile, ['backlog-add', 'my parked item', '--priority', 'high']);
check('control: a CLI without the check parks silently on an older server (no note)', noNote !== fs.readFileSync(CLI, 'utf8') && c.code === 0 && !/did not record/.test(c.out), c.out);
// CONTROL — the pre-fallback CLI (r.item only) on the older server's answer
const preSrc = fs.readFileSync(CLI, 'utf8').replace(/const mine = \(r && r\.item\) \|\| [^\n]*\n/, 'const mine = r && r.item;\n');
const preFile = path.join(tmp, 'vibespace-task.pre'); fs.writeFileSync(preFile, preSrc);
reply = OLD_SHAPE;
c = await runCli(preFile, ['backlog-add', 'my parked item']);
check('control: the r.item-only CLI reports "not stored" for an item the older server stored', preSrc !== fs.readFileSync(CLI, 'utf8') && c.code === 1 && verdictOf(/did not store/.test(c.out)), c.out);
// B-6edc: THE CLI — the plain --detail sends the add (no replaceDetail), --replace-detail asks for the replace by name, and the
// answer's words say what happened to the detail, in characters; an older server that replaced is said as such
{
  reply = { success: true, item: { id: 'B-1111', text: 'my parked item', status: 'open' }, backlog: [], detailEdit: { mode: 'added', was: 23, now: 37 } };
  let e = await runCli(CLI, ['backlog-edit', 'B-1111', '--detail', 'one more line']);
  checkP('B-6edc CLI: a plain --detail sends NO replaceDetail (the add) and says «14 characters added below the old 23 (now 37)»', e.code === 0 && sent && sent.edit === 'B-1111' && sent.detail === 'one more line' && !('replaceDetail' in sent) && /detail: 14 characters added below the old 23 \(now 37\)/.test(e.out), JSON.stringify({ code: e.code, sent, out: e.out }));
  reply = { success: true, item: { id: 'B-1111', text: 'my parked item', status: 'open' }, backlog: [], detailEdit: { mode: 'replaced', was: 37, now: 20 } };
  e = await runCli(CLI, ['backlog-edit', 'B-1111', '--detail', 'the whole new detail', '--replace-detail']);
  checkP('B-6edc CLI: --replace-detail sends replaceDetail: true and says «detail REPLACED: 37 characters replaced by 20»', e.code === 0 && sent && sent.replaceDetail === true && /detail REPLACED: 37 characters replaced by 20/.test(e.out), JSON.stringify({ code: e.code, sent, out: e.out }));
  sent = null;
  e = await runCli(CLI, ['backlog-edit', 'B-1111', '--replace-detail']);
  checkP('B-6edc CLI: --replace-detail with no --detail is refused before anything is sent (exit 1)', e.code === 1 && sent === null && /--replace-detail says how --detail is used/.test(e.out), JSON.stringify({ code: e.code, sent, out: e.out }));
  reply = { success: true, item: { id: 'B-1111', text: 'my parked item', status: 'open' }, backlog: [], detailEdit: { mode: 'contained', was: 23, now: 37 } };
  e = await runCli(CLI, ['backlog-edit', 'B-1111', '--detail', 'the old evidence, dated\none more line']);
  checkP('B-6edc r2 CLI: a detail that already held the old one is said in its own word — «the old text was already in it: 14 characters added (now 37)»', e.code === 0 && sent && !('replaceDetail' in sent) && /detail: the old text was already in it: 14 characters added \(now 37\)/.test(e.out), JSON.stringify({ code: e.code, sent, out: e.out }));
  reply = { success: true, item: { id: 'B-1111', text: 'my parked item', status: 'open' }, backlog: [] };   // an older server: no detailEdit
  e = await runCli(CLI, ['backlog-edit', 'B-1111', '--detail', 'x']);
  checkP('B-6edc CLI: an older server (no detailEdit in its answer) — the CLI says it REPLACED the whole detail, never «added»', e.code === 0 && /detail REPLACED — this server is older than the add form/.test(e.out) && !/added below/.test(e.out), JSON.stringify({ code: e.code, out: e.out }));
  const help = await runCli(CLI, []);
  const man = fs.readFileSync(path.join(REPO, 'docs/agent/task-manual.md'), 'utf8');
  checkP('B-6edc: the tool\'s help and the agents\' manual say BOTH forms (--detail adds; --replace-detail replaces, by name)',
    /--detail ADDS a paragraph below the old detail/.test(help.out) && /--replace-detail with --detail REPLACES the whole detail/.test(help.out)
      && /--detail "one more line" +# ADDS below the old detail/.test(man) && /a `--detail` that already starts with the whole old detail takes its place \(nothing lost, nothing doubled/.test(man) && /--replace-detail +# REPLACES it — by name/.test(man) && /--detail "" --replace-detail +# clears it — by name/.test(man),
    JSON.stringify({ help: help.out.split('\n').filter((l) => /--detail ADDS|--replace-detail with --detail/.test(l)), manual: man.split('\n').filter((l) => /# (ADDS below the old detail|REPLACES it — by name|clears it — by name)$|takes its place \(nothing lost, nothing doubled/.test(l)) }));
}
srv.close();

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log(`\nALL PASS (${passed})`); import { verdictOf, gateOf } from './lib/check.mjs'; // counted, never a literal (the literal said 20 over 19 checks)
