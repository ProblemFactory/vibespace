#!/usr/bin/env node
// Route-level smoke for /api/agent/prompt-context — the diff-update delivery
// (2.113.0). Drives setupAgentRoutes with a fake express app + a real
// TaskGroupManager in a temp dir; asserts the delivery sequence: full context
// first → nothing on no change → <vibespace-task-update> diff on change →
// full "was UPDATED" fallback with the toggle off → ONE layered multi-context
// when several groups arrive at once. Run: node scripts/test-prompt-context.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { TaskGroupManager } = require('../src/task-groups.js');
const { setupAgentRoutes } = require('../src/agent-routes.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-promptctx-'));
const tasks = new TaskGroupManager({ dataDir: tmp, onChange: () => {} });

const routes = {};
const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
const session = { agentToken: 'vsst_test', backend: 'claude', cwd: path.join(tmp, 'work'), name: 't' };
const activeSessions = new Map([['sess1', session]]);
const settings = {};
setupAgentRoutes({
  app, activeSessions, tasks,
  sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, rekey: () => {}, clear: () => null, setByUser: () => null, setByAgent: () => null, history: () => [] },
  SessionStatusManager: { renderNotice: () => '' },
  userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
  sessionStatusKey: (s, id) => `claude:${id}`,
  serverSetting: (k) => settings[k],
  scheduleCtxSync: () => {},
  remoteCtxBaseFor: () => null,
});

function call() {
  let out;
  const req = { headers: { authorization: 'Bearer vsst_test' }, query: {}, body: {} };
  const res = { json: (o) => { out = o; }, status: () => res };
  routes['GET /api/agent/prompt-context'](req, res);
  return out.context || '';
}

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const g1 = tasks.create({ title: 'alpha', objective: 'obj one', folders: [session.cwd] });
tasks.update(g1.id, { plan: [{ text: 'step one', done: false }] });

const c1 = call();
check('first prompt → full context', c1.includes('<vibespace-task-context>') && c1.includes('step one'), c1.slice(0, 200));
const c2 = call();
check('no change → reminder only', !c2.includes('task-context') && !c2.includes('task-update') && c2.includes('vibespace-reminder'), c2);

await sleep(3);
tasks.addProgress(g1.id, { note: 'made progress here', session: 'claude:sess1' });
tasks.update(g1.id, { plan: [{ text: 'step one', done: true, by: 'claude:sess1' }, { text: 'step two', done: false }] });
const c3 = call();
check('change → diff only (no full re-inject)', c3.includes('<vibespace-task-update>') && !c3.includes('<vibespace-task-context>'), c3.slice(0, 300));
check('diff carries the actual deltas', c3.includes('Checklist CHECKED: step one') && c3.includes('Checklist NEW: [ ] step two') && c3.includes('made progress here'), c3);
check('diff omits the tools teaching (already known)', !c3.includes('Reporting back — three CLIs'), c3);
const c4 = call();
check('after diff → quiet again', !c4.includes('task-update') && !c4.includes('task-context'), c4);

// no-op edit (same objective re-saved) bumps contentUpdatedAt but changes nothing visible
await sleep(3);
tasks.update(g1.id, { objective: 'obj one' });
const c5 = call();
check('no-op edit → nothing injected (old code re-sent everything)', !c5.includes('task-update') && !c5.includes('task-context'), c5);

// toggle off → full "was UPDATED" fallback
settings['agents.contextUpdateDiffs'] = false;
await sleep(3);
tasks.addProgress(g1.id, { note: 'with diffs disabled' });
const c6 = call();
check('toggle off → full re-inject with UPDATED preface', c6.includes('was UPDATED since you last saw it') && c6.includes('<vibespace-task-context>'), c6.slice(0, 300));
delete settings['agents.contextUpdateDiffs'];

// a SECOND group appears mid-session (bind) while g1 later changes: full for new, diff for old.
// MIXED delivery structure (user directive — the 2KB persisted-preview must
// never erase one kind entirely): manifest first, small diffs next, full last.
const g2 = tasks.create({ title: 'beta', objective: 'obj two', folders: [session.cwd] });
await sleep(3);
tasks.addProgress(g1.id, { note: 'alpha moved again' });
const c7 = call();
check('new group full + old group diff in one delivery', c7.includes('<vibespace-task-context>') && c7.includes('"beta"') && c7.includes('<vibespace-task-update>') && c7.includes('alpha moved again'), c7.slice(0, 400));
const c7manifest = c7.slice(0, c7.indexOf('</vibespace-delivery-note>'));
check('manifest heads the mixed delivery, names EVERY block + rescue', c7.indexOf('<vibespace-delivery-note>') === 0 && c7manifest.includes(`"beta" (${g2.id})`) && c7manifest.includes(`"alpha" (${g1.id})`) && c7manifest.includes('persisted-output'), c7.slice(0, 300));
check('diff precedes the full context (small first)', c7.indexOf('<vibespace-task-update>') < c7.indexOf('<vibespace-task-context>'), '');
check('partial first-delivery avoids the absolute-membership claim', !c7.includes('This session belongs to 1 VibeSpace Task Groups') && c7.includes('MORE THAN ONE Task Group'), c7);
check('multi mode diff pointer carries --group', c7.includes(`--group ${g1.id} show --full`), c7);

// fresh session, two groups at once → ONE layered multi-context
const s2 = { agentToken: 'vsst_test', backend: 'codex', cwd: session.cwd, name: 't2' };
activeSessions.set('sess1', s2);
const c8 = call();
check('fresh multi-group first prompt → single layered context', (c8.match(/<vibespace-task-context>/g) || []).length === 1 && c8.includes('2 VibeSpace Task Groups'), c8.slice(0, 300));
await sleep(3);
tasks.update(g2.id, { plan: [{ text: 'beta step', done: false }] });
const c9 = call();
check('then a beta change → beta diff only', c9.includes('<vibespace-task-update>') && c9.includes('"beta"') && c9.includes('Checklist NEW: [ ] beta step') && !c9.includes('<vibespace-task-context>'), c9.slice(0, 300));

// BOTH groups change on one turn → ONE combined block whose HEADER enumerates
// every changed group (user directive: stacked per-group blocks + the ~2KB
// persisted-preview truncation could hide that the second group changed at all)
await sleep(3);
tasks.addProgress(g1.id, { note: 'alpha combined news' });
tasks.addProgress(g2.id, { note: 'beta combined news' });
const c9b = call();
check('two changed groups → ONE combined update block', (c9b.match(/<vibespace-task-update>/g) || []).length === 1 && !c9b.includes('<vibespace-delivery-note>'), c9b.slice(0, 200));
const c9bHead = c9b.split('\n').slice(0, 2).join('\n');
check('combined HEADER enumerates both groups with summaries', c9bHead.includes('2 of your Task Groups changed') && c9bHead.includes(`"alpha" (${g1.id}): 1 new activity`) && c9bHead.includes(`"beta" (${g2.id}): 1 new activity`), c9bHead);
check('per-group sections carry the deltas', c9b.includes(`## "alpha" (${g1.id})`) && c9b.includes('alpha combined news') && c9b.includes(`## "beta" (${g2.id})`) && c9b.includes('beta combined news'), c9b);

// flood BOTH groups: the combined block stays bounded, truncates details from
// the tail, and the enumeration header still names both groups
await sleep(3);
for (const g of [g1, g2]) {
  const plan = tasks.get(g.id).plan.map((p) => ({ ...p }));
  for (let i = 0; i < 40; i++) plan.push({ text: `${g.id} flood ${i} ` + 'q'.repeat(300), done: false });
  tasks.update(g.id, { plan });
}
const c10 = call();
check('flooded combined block stays bounded (≤ ~6.6KB)', Buffer.byteLength(c10, 'utf-8') <= 6600, `bytes=${Buffer.byteLength(c10, 'utf-8')}`);
const c10head = c10.split('\n').slice(0, 2).join('\n');
check('flood: header still names BOTH groups', c10head.includes(`"${'alpha'}" (${g1.id})`) && c10head.includes(`"beta" (${g2.id})`), c10head.slice(0, 300));
check('flood: truncation pointer present', c10.includes('truncated — per-group'), c10.slice(-200));

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall prompt-context smoke tests passed');
