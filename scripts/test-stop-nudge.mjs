#!/usr/bin/env node
// A TURN THAT BOOKKEPT ITSELF STOPS FREE (B-a8f0, owner YES 2026-10-02; lane stop-nudge-free).
// GET /api/agent/stop-check answers the claude Stop hook and the codex wrapper's turn/completed;
// a `block` there is a real billed turn. Measured 2026-10-02: 250 of 329 unattended billed turns
// in 24 h were that nudge — the old rule read only the status store's AGE, so a long turn that
// reported at its start was asked again at its end. The verdict (src/stop-nudge.js, PURE) now
// frees a turn whose bookkeeping stamp (`s._bookkeptAt`) is at or after its start — FIRST.
//   §1 the PURE table: every `why`, the first-rule order, no turn start ⇒ the time rule; control = the verdict without the first rule
//   §2 the route over a real express app with fixture sessions (claude + codex shaped); a free stop never asks the spend authorizer
//   §3 the census: every agent bookkeeping write route stamps the witness (reads named exempt); control = a cut stamp
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SN = require('../src/stop-nudge.js');
let failed = 0, passed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra !== undefined ? `\n    ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-stop-nudge-'));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ── §1 THE PURE TABLE ───────────────────────────────────────────────────────
console.log('§1 the verdict (PURE table)');
const MIN = 60 * 1000, NOW = 1_800_000_000_000;
const base = { now: NOW, staleMin: 5, cooldownMin: 5, maxUnanswered: 3, nudgesUnanswered: 0, lastNudgeAt: 0 };
const ROWS = [
  ['bookkept 30 min ago inside a 35-min turn, status 30 min old ⇒ free', { turnStartedAt: NOW - 35 * MIN, bookkeptAt: NOW - 30 * MIN, statusAt: NOW - 30 * MIN }, false, 'bookkept-this-turn'],
  ['bookkept at the very instant the turn started (≥, not >) ⇒ free', { turnStartedAt: NOW - 35 * MIN, bookkeptAt: NOW - 35 * MIN, statusAt: NOW - 35 * MIN }, false, 'bookkept-this-turn'],
  ['FIRST RULE: bookkept (progress, no status ever), stale, no cooldown, nudges unanswered ⇒ still free', { turnStartedAt: NOW - 40 * MIN, bookkeptAt: NOW - 39 * MIN, statusAt: null, nudgesUnanswered: 0 }, false, 'bookkept-this-turn'],
  ['FIRST RULE: a bookkept turn under 0/0 every-stop mode ⇒ free', { staleMin: 0, cooldownMin: 0, turnStartedAt: NOW - 2 * MIN, bookkeptAt: NOW - MIN, statusAt: NOW - MIN }, false, 'bookkept-this-turn'],
  ['bookkept BEFORE the turn started, inside the cooldown ⇒ the old rule: cooldown', { turnStartedAt: NOW - 35 * MIN, bookkeptAt: NOW - 50 * MIN, statusAt: NOW - 50 * MIN, lastNudgeAt: NOW - 2 * MIN }, false, 'cooldown'],
  ['bookkept before the turn, status 4 min old ⇒ the old rule: fresh-status', { turnStartedAt: NOW - 3 * MIN, bookkeptAt: NOW - 4 * MIN, statusAt: NOW - 4 * MIN }, false, 'fresh-status'],
  ['never reported, 3 nudges unanswered ⇒ the exit condition', { turnStartedAt: NOW - 35 * MIN, bookkeptAt: null, statusAt: null, nudgesUnanswered: 3 }, false, 'never-answered'],
  ['bookkept 36 min ago, the turn started 35 min ago ⇒ stale (blocks)', { turnStartedAt: NOW - 35 * MIN, bookkeptAt: NOW - 36 * MIN, statusAt: NOW - 36 * MIN }, true, 'stale'],
  ['0/0 every-stop mode, not bookkept this turn ⇒ stale (blocks)', { staleMin: 0, cooldownMin: 0, turnStartedAt: NOW - 2 * MIN, bookkeptAt: NOW - 3 * MIN, statusAt: NOW - 3 * MIN }, true, 'stale'],
  ['NO TURN START: a fresh stamp is no free pass — the time rule blocks, and says why', { turnStartedAt: null, bookkeptAt: NOW - MIN, statusAt: NOW - 30 * MIN }, true, 'no-turn-start'],
  ['no turn start keeps the time rule\'s free verdicts (status 1 min old)', { turnStartedAt: null, bookkeptAt: NOW - MIN, statusAt: NOW - MIN }, false, 'fresh-status'],
];
const runTable = (verdict) => ROWS.map(([name, over, block, why]) => { const v = verdict({ ...base, ...over }); return { name, v, pass: v.block === block && v.why === why, want: { block, why } }; });
const table = runTable(SN.stopNudgeVerdict);
for (const r of table) ok(r.name, r.pass, { got: r.v, want: r.want });
const seen = new Set(table.map((r) => r.v.why));
ok(`the table drives EVERY why of the closed set (${SN.STOP_NUDGE_WHYS.join(', ')})`, SN.STOP_NUDGE_WHYS.every((w) => seen.has(w)) && seen.size === SN.STOP_NUDGE_WHYS.length, [...seen]);
ok('block:true ⇔ why ∈ STOP_NUDGE_BLOCKING (stale, no-turn-start)', table.every((r) => r.v.block === SN.STOP_NUDGE_BLOCKING.includes(r.v.why)));
ok('turnStartOf: the later of _userInputAt / _machineInputAt; neither ⇒ null',
  SN.turnStartOf({}) === null && SN.turnStartOf({ _userInputAt: 5 }) === 5 && SN.turnStartOf({ _userInputAt: 5, _machineInputAt: 9 }) === 9
  && SN.turnStartOf({ _machineInputAt: 7, _userInputAt: 3 }) === 7 && SN.turnStartOf({ _machineInputAt: 'x' }) === null && SN.turnStartOf(null) === null);
const pureSrc = read('src/stop-nudge.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
ok('src/stop-nudge.js is PURE (no require / import)', !/\brequire\s*\(|^\s*import\b/m.test(pureSrc));
{ // CONTROL: the same verdict without its first rule reds the table's first-rule rows
  const cut = read('src/stop-nudge.js').split('\n').filter((l) => !l.includes("why: 'bookkept-this-turn'")).join('\n');
  const f = path.join(tmp, 'stop-nudge-no-first-rule.js');
  fs.writeFileSync(f, cut);
  const mutant = runTable(require(f).stopNudgeVerdict);
  const red = mutant.filter((r) => !r.pass).map((r) => r.name);
  ok('control: the patched copy (first rule cut) differs from the source by that one line', cut.split('\n').length === read('src/stop-nudge.js').split('\n').length - 1);
  ok(`control: …and the table goes RED on it (${red.length} rows, incl. the FIRST-RULE rows)`, red.length >= 3 && red.some((n) => n.startsWith('FIRST RULE')), red);
}

// ── §2 THE ROUTE OVER A REAL EXPRESS APP ────────────────────────────────────
console.log('\n§2 GET /api/agent/stop-check over a real express app');
const express = require('express');
const { setupAgentRoutes } = require('../src/agent-routes.js');
const { SessionStatusManager } = require('../src/session-status.js');
const { UserTodoManager } = require('../src/user-todos.js');
const { TaskGroupManager } = require('../src/task-groups.js');
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir);
const work = path.join(tmp, 'work'); fs.mkdirSync(work);
const settings = { 'agents.stopNudgeStaleMinutes': 5, 'agents.stopNudgeCooldownMinutes': 5 };   // this instance's owner values
const realStatus = new SessionStatusManager({ dataDir, onChange: () => { } });
const statusAge = new Map();   // key → a backdated `at` (a long turn is simulated, never slept)
const status = {};
for (const k of Object.getOwnPropertyNames(SessionStatusManager.prototype)) if (k !== 'constructor' && typeof realStatus[k] === 'function') status[k] = realStatus[k].bind(realStatus);
status.get = (k) => { const r = realStatus.get(k); return r && statusAge.has(k) ? { ...r, at: statusAge.get(k) } : r; };
const todos = new UserTodoManager({ dataDir, onChange: () => { } });
const tasks = new TaskGroupManager({ dataDir, onChange: () => { }, getSetting: (k) => settings[k] });
tasks.create({ title: 'lane', objective: 'o', folders: [work] });
const sessions = new Map();
let asked = 0, charged = 0;
const spendGuard = { nudgeRec: () => null, noteNudge: () => { }, authorize: () => { asked++; return { ok: true, identity: 'sub-a' }; }, note: () => { charged++; } };
const app = express();
app.use(express.json());
setupAgentRoutes({
  app, activeSessions: sessions, tasks, sessionStatus: status, SessionStatusManager, userTodos: todos,
  sessionStatusKey: (s, id) => `${s.backend}:${id}`, serverSetting: (k) => settings[k], spendGuard,
  scheduleCtxSync: () => { }, remoteCtxBaseFor: () => null,
});
const server = await new Promise((r) => { const sv = app.listen(0, '127.0.0.1', () => r(sv)); });
const API = `http://127.0.0.1:${server.address().port}`;
const call = async (tok, method, p, body) => {
  const r = await fetch(API + p, { method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { code: r.status, out: await r.json() };
};
const C = { agentToken: 'vsst_c1', backend: 'claude', cwd: work, name: 'claude-conv' };
const X = { agentToken: 'vsst_x1', backend: 'codex', cwd: work, name: 'codex-conv' };
sessions.set('c1', C); sessions.set('x1', X);
const stop = (s) => call(s.agentToken, 'GET', '/api/agent/stop-check').then((r) => r.out);
const fresh = (s) => { delete s._lastStopNudge; delete s._bookkeptAt; delete s._userInputAt; delete s._machineInputAt; };
realStatus.setByAgent('claude:c1', { state: 'working' });
realStatus.setByAgent('codex:x1', { state: 'working' });
{
  fresh(C); const now = Date.now();
  C._userInputAt = now - 35 * MIN; C._bookkeptAt = now - 30 * MIN; statusAge.set('claude:c1', now - 30 * MIN);
  const a0 = asked, r = await stop(C);
  ok('bookkept 30 min ago inside a 35-min turn (status 30 min old, stale at 5) ⇒ {block:false}', r.block === false && r.why === 'bookkept-this-turn', r);
  ok('…and a free stop charges NOTHING: the spend authorizer is not even asked', asked === a0);
}
{
  fresh(C); const now = Date.now();
  C._userInputAt = now - 20 * MIN; C._bookkeptAt = now - 30 * MIN; statusAge.set('claude:c1', now - 30 * MIN);
  const a0 = asked, c0 = charged, r = await stop(C);
  ok('bookkept BEFORE the turn started ⇒ the old rule: the stale board is nudged', r.block === true && /vibespace-status/.test(r.reason || ''), r);
  ok('…through the spend authorizer and its charge, as before', asked === a0 + 1 && charged === c0 + 1);
  const r2 = await stop(C);
  ok('…and the cooldown then holds (the old rule, unchanged)', r2.block === false && r2.why === 'cooldown', r2);
}
{
  fresh(C); const now = Date.now();
  C._machineInputAt = now - 40 * MIN; C._bookkeptAt = now - 39 * MIN; statusAge.set('claude:c1', now - 39 * MIN);
  const r = await stop(C);
  ok('a MACHINE-started turn (a delivered message) that bookkept ⇒ free', r.block === false && r.why === 'bookkept-this-turn', r);
}
{
  fresh(C); const now = Date.now();
  C._bookkeptAt = now - MIN; statusAge.set('claude:c1', now - 30 * MIN);
  const r = await stop(C);
  ok('no turn start (a restored session) with a fresh stamp ⇒ the time rule nudges (never a free pass on a missing fact)', r.block === true, r);
}
// THE WITNESS, written by the real routes: a 40-min turn that reported at minute 5 stops free
const WRITES = [
  ['vibespace-status working', 'POST', '/api/agent/session-status', { state: 'working', reason: 'r' }],
  ['vibespace-task progress', 'POST', '/api/agent/task-progress', { note: 'did a thing' }],
  ['vibespace-task backlog-add', 'POST', '/api/agent/task-backlog', { add: 'later item' }],
  ['vibespace-ask', 'POST', '/api/agent/user-todo', { add: { text: 'a question?' } }],
];
for (const [name, m, p, body] of WRITES) {
  fresh(C); const t0 = Date.now();
  C._userInputAt = t0 - 1;
  const w = await call(C.agentToken, m, p, body);
  const stamped = C._bookkeptAt >= C._userInputAt;
  // shift the whole turn 35 min into the past: started 40 min ago, reported at minute 5, the status record stale
  C._userInputAt -= 40 * MIN; C._bookkeptAt -= 35 * MIN; statusAge.set('claude:c1', Date.now() - 35 * MIN);
  const a0 = asked, r = await stop(C);
  ok(`${name} stamps the witness (route ${w.code}) ⇒ a 40-min turn that ran it at minute 5 stops free`, w.code === 200 && stamped && r.block === false && r.why === 'bookkept-this-turn' && asked === a0, { w, r });
}
{ // the resolve half of vibespace-ask, and the reads that never stamp
  const item = (await call(C.agentToken, 'POST', '/api/agent/user-todo', { add: { text: 'to resolve' } })).out.item;
  fresh(C); C._userInputAt = Date.now() - 1;
  const w = await call(C.agentToken, 'POST', '/api/agent/user-todo', { resolve: item.id });
  ok('vibespace-ask resolve stamps the witness', w.code === 200 && C._bookkeptAt >= C._userInputAt, w);
  fresh(C);
  const reads = [
    await call(C.agentToken, 'POST', '/api/agent/session-status', { show: true }),
    await call(C.agentToken, 'POST', '/api/agent/user-todo', { list: true }),
    await call(C.agentToken, 'POST', '/api/agent/task-backlog', { show: 1 }),
    await call(C.agentToken, 'GET', '/api/agent/task'),
  ];
  ok('READS never stamp (status show · ask list · backlog show · task show): a free stop needs a real write', C._bookkeptAt === undefined, reads.map((r) => r.code));
  const bad = await call(C.agentToken, 'POST', '/api/agent/task-progress', {});
  ok('a REFUSED write never stamps (progress with no note)', bad.code === 400 && C._bookkeptAt === undefined, bad);
}
{ // CODEX: the wrapper's turn/completed hits the same route with a codex-shaped session
  fresh(X); const now = Date.now();
  X._machineInputAt = now - 35 * MIN; statusAge.set('codex:x1', now - 30 * MIN);
  const w = await call(X.agentToken, 'POST', '/api/agent/task-progress', { note: 'codex progress' });
  X._bookkeptAt -= 30 * MIN;
  const r = await stop(X);
  ok('codex-shaped session: progress 30 min ago inside a 35-min turn ⇒ {block:false}', w.code === 200 && r.block === false && r.why === 'bookkept-this-turn', r);
  fresh(X); X._machineInputAt = Date.now() - 10 * MIN;
  const r2 = await stop(X);
  ok('codex-shaped session that did not bookkeep ⇒ nudged', r2.block === true && !!r2.reason, r2);
  const wrapper = read('data/bin/codex-chat-wrapper.js'), hook = read('data/bin/vibespace-hook.mjs');
  ok('both callers read only block + reason (a free answer carries `why`, which neither starts a turn on)',
    /fetch\(api \+ '\/api\/agent\/stop-check'/.test(wrapper) && /if \(!d \|\| !d\.block \|\| !d\.reason\) return;/.test(wrapper)
    && /fetch\(api \+ '\/api\/agent\/stop-check'/.test(hook) && /if \(d && d\.block && d\.reason\)/.test(hook) && /if \(input\.stop_hook_active\) return process\.exit\(0\);/.test(hook));
}
server.close();

// ── §3 THE CENSUS ──────────────────────────────────────────────────────────
console.log('\n§3 every agent bookkeeping write stamps the witness');
const FILES = ['src/agent-routes.js', 'src/agent-routes/status.js'];
const ROUTE_RE = /^app\.post\('(\/api\/agent\/(?:session-status|task-progress|task-plan|task-backlog|task\/[^']*|user-todo[^']*))'/gm;
const EXEMPT = { '/api/agent/task-plan': '410 Gone since 2.121.0 — writes nothing; a free stop needs a real write' };
// named READ routes that never stamp, and why
const READS = {
  'GET /api/agent/task': 'vibespace-task show / backlog — a read',
  'GET /api/session-status': 'the board read (UI)',
  'POST /api/session-status': 'the OWNER sets / clears a status from the UI — not the agent bookkeeping',
  'GET /api/session-status/history': 'the status timeline read (UI)',
};
const census = (texts) => {
  const all = Object.values(texts).join('\n');
  const ca = all.indexOf('async function clearAsAgent('), caEnd = all.indexOf('\n}\n', ca);
  const clearStamps = ca >= 0 && /bookkept\(hit\[0\]\);/.test(all.slice(ca, caEnd));
  const rows = [];
  for (const [f, t] of Object.entries(texts)) {
    for (const m of t.matchAll(ROUTE_RE)) {
      const rest = t.slice(m.index + 1), end = rest.search(/\napp\.|\n\/\/ Status-change history|\n}\n/);
      const body = end >= 0 ? rest.slice(0, end) : rest;
      const stamps = /\bbookkept\((hit\[0\]|s|found)\);/.test(body) || (clearStamps && /return clearAsAgent\(/.test(body));   // a clear stamps inside clearAsAgent
      rows.push({ route: m[1], file: f, stamps });
    }
  }
  return { rows, clearStamps };
};
const texts = Object.fromEntries(FILES.map((f) => [f, read(f)]));
const c = census(texts);
const WANT = ['/api/agent/session-status', '/api/agent/task-progress', '/api/agent/task/progress-redact', '/api/agent/task-plan', '/api/agent/task-backlog', '/api/agent/user-todo'];
ok(`the census finds every bookkeeping write route (${c.rows.length}: ${c.rows.map((r) => r.route).join(', ')})`, WANT.every((w) => c.rows.some((r) => r.route === w)), c.rows);
ok('clearAsAgent (progress-redact / ask clear) stamps after a clear that took', c.clearStamps);
for (const r of c.rows) {
  if (EXEMPT[r.route]) ok(`EXEMPT ${r.route} — ${EXEMPT[r.route]} (and it does not stamp)`, !r.stamps);
  else ok(`${r.route} (${r.file}) stamps the witness`, r.stamps);
}
for (const [k, why] of Object.entries(READS)) {
  const [m, p] = k.split(' ');
  const t = Object.values(texts).join('\n'), i = t.indexOf(`app.${m.toLowerCase()}('${p}'`);
  const body = i >= 0 ? t.slice(i, i + 1 + t.slice(i + 1).search(/\napp\.|\n}\n/)) : '';
  ok(`READ ${k} — ${why} (exists, no stamp)`, i >= 0 && !/\bbookkept\(/.test(body));
}
{ // CONTROL: cut one stamp in a text copy ⇒ the census names that route
  const cut = { ...texts, 'src/agent-routes.js': texts['src/agent-routes.js'].replace(/(session: sessionStatusKey\(hit\[0\], hit\[1\]\) \}\);\n)    bookkept\(hit\[0\]\);\n/, '$1') };
  const cc = census(cut);
  ok('control: the copy differs by exactly the task-progress stamp', cut['src/agent-routes.js'] !== texts['src/agent-routes.js'] && cut['src/agent-routes.js'].split('\n').length === texts['src/agent-routes.js'].split('\n').length - 1);
  ok('control: …and the census goes RED naming /api/agent/task-progress', cc.rows.filter((r) => !r.stamps && !EXEMPT[r.route]).map((r) => r.route).join() === '/api/agent/task-progress');
}
{ // the stop-check route: the verdict first, the spend authorizer only after a blocking verdict
  const ar = texts['src/agent-routes.js'];
  const i = ar.indexOf("app.get('/api/agent/stop-check'"), j = ar.indexOf('\n});\n', i), body = ar.slice(i, j);
  const v = body.indexOf('stopNudgeVerdict({'), free = body.indexOf('if (!v.block) return res.json({ block: false, why: v.why });'), auth = body.indexOf("spendGuard.authorize({ reason: 'stop-nudge'");
  ok('stop-check: the verdict → a free answer → THEN the spend authorizer (the order a free stop charges nothing by)', v > 0 && free > v && auth > free, { v, free, auth });
  ok('stop-check: the turn start and the witness are the verdict\'s inputs', /turnStartedAt: turnStartOf\(s\), bookkeptAt: s\._bookkeptAt/.test(body));
}

console.log(`\n${failed ? 'FAILED' : 'ALL PASS'} (${passed} passed, ${failed} failed)`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
