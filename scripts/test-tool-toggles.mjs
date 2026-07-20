#!/usr/bin/env node
// Route-level smoke for the per-feature Integration toggles (2.211.0):
// agents.contextInjection / toolStatus / toolAsk / toolTask. Asserts that a
// disabled feature is neither TAUGHT (context tools section, baseline intro,
// per-turn reminder, stop nudge) nor SERVED (write endpoints refuse with
// skip-and-continue guidance). Run: node scripts/test-tool-toggles.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { TaskGroupManager } = require('../src/task-groups.js');
const { setupAgentRoutes } = require('../src/agent-routes.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tooltoggle-'));
const tasks = new TaskGroupManager({ dataDir: tmp, onChange: () => {} });

const routes = {};
const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
const settings = {};
let session, activeSessions;
const freshSession = () => {
  session = { agentToken: 'vsst_test', backend: 'claude', cwd: path.join(tmp, 'work'), name: 't' };
  activeSessions.clear();
  activeSessions.set('sess1', session);
};
activeSessions = new Map();
freshSession();
setupAgentRoutes({
  app, activeSessions, tasks,
  sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, rekey: () => {}, clear: () => null, setByUser: () => null, setByAgent: () => ({ state: 'working' }), history: () => [] },
  SessionStatusManager: { renderNotice: () => '' },
  userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({ id: 'x', text: 'q' }) },
  sessionStatusKey: (s, id) => `claude:${id}`,
  serverSetting: (k) => settings[k],
  scheduleCtxSync: () => {},
  remoteCtxBaseFor: () => null,
});

const call = (route, body = {}) => {
  let out, code = 200;
  const req = { headers: { authorization: 'Bearer vsst_test' }, query: {}, body };
  const res = { json: (o) => { out = o; return res; }, status: (c) => { code = c; return res; } };
  routes[route](req, res);
  return { out, code };
};
const promptCtx = () => call('GET /api/agent/prompt-context').out.context || '';

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};

const g1 = tasks.create({ title: 'alpha', objective: 'obj one', folders: [session.cwd] });

// ── defaults: everything taught + served ──
const cAll = promptCtx();
check('defaults: full context teaches all three CLIs', cAll.includes('3 CLIs') && cAll.includes('vibespace-status blocked') && cAll.includes('vibespace-ask "the question"') && cAll.includes('progress "one-line summary"'), cAll.slice(0, 300));
const rAll = promptCtx();
check('defaults: per-turn reminder lists all three', rAll.includes('vibespace-status') && rAll.includes('vibespace-ask') && rAll.includes('vibespace-task'), rAll);
check('defaults: status write serves', call('POST /api/agent/session-status', { state: 'working' }).code === 200);
check('defaults: ask write serves', call('POST /api/agent/user-todo', { add: { text: 'q' } }).code === 200);
check('defaults: progress write serves', call('POST /api/agent/task-progress', { note: 'n' }).code === 200);

// ── ask + task off: context/reminder teach only status; endpoints refuse ──
settings['agents.toolAsk'] = false;
settings['agents.toolTask'] = false;
freshSession();
const cS = promptCtx();
check('ask/task off: context teaches ONLY status', cS.includes('one CLI') && cS.includes('vibespace-status blocked') && !cS.includes('vibespace-ask') && !cS.includes('backlog-add') && !cS.includes('progress "one-line summary"'), cS.slice(0, 400));
const rS = promptCtx();
check('ask/task off: reminder lists only status', rS.includes('vibespace-status') && !rS.includes('vibespace-ask') && !rS.includes('vibespace-task'), rS);
const askRef = call('POST /api/agent/user-todo', { add: { text: 'q' } });
check('ask off: endpoint refuses with guidance', askRef.code === 403 && /disabled/.test(askRef.out.error) && /continue/.test(askRef.out.error), JSON.stringify(askRef));
const progRef = call('POST /api/agent/task-progress', { note: 'n' });
check('task off: progress endpoint refuses', progRef.code === 403 && /disabled/.test(progRef.out.error), JSON.stringify(progRef));
const blRef = call('POST /api/agent/task-backlog', { add: 'x' });
check('task off: backlog endpoint refuses', blRef.code === 403, JSON.stringify(blRef));
check('ask/task off: status still serves', call('POST /api/agent/session-status', { state: 'working' }).code === 200);

// ── status off: stop-check never nudges + endpoint refuses ──
settings['agents.toolAsk'] = true;
settings['agents.toolTask'] = true;
settings['agents.toolStatus'] = false;
freshSession();
const stop1 = call('GET /api/agent/stop-check');
check('status off: stop-check never blocks', stop1.out.block === false, JSON.stringify(stop1.out));
const stRef = call('POST /api/agent/session-status', { state: 'working' });
check('status off: endpoint refuses', stRef.code === 403 && /disabled/.test(stRef.out.error), JSON.stringify(stRef));
settings['agents.toolStatus'] = true;
freshSession();
const stop2 = call('GET /api/agent/stop-check');
check('status on: stop-check nudges (stale board)', stop2.out.block === true && /vibespace-status/.test(stop2.out.reason), JSON.stringify(stop2.out).slice(0, 200));
check('stop nudge lists ask+task steps when enabled', /vibespace-ask/.test(stop2.out.reason) && /vibespace-task progress/.test(stop2.out.reason), stop2.out.reason);
settings['agents.toolAsk'] = false;
settings['agents.toolTask'] = false;
freshSession();
const stop3 = call('GET /api/agent/stop-check');
check('stop nudge omits disabled tools', stop3.out.block === true && !/vibespace-ask/.test(stop3.out.reason) && !/vibespace-task/.test(stop3.out.reason), stop3.out.reason);

// ── contextInjection off: no group payload, baseline intro instead ──
settings['agents.toolAsk'] = true;
settings['agents.toolTask'] = true;
settings['agents.contextInjection'] = false;
freshSession();
const cNoCtx = promptCtx();
check('contextInjection off: NO group context', !cNoCtx.includes('<vibespace-task-context>') && !cNoCtx.includes('obj one'), cNoCtx.slice(0, 300));
check('contextInjection off: baseline tools intro delivered instead', cNoCtx.includes('<vibespace-session-tools>') && cNoCtx.includes('vibespace-status'), cNoCtx.slice(0, 300));
check('contextInjection off: writes still serve', call('POST /api/agent/task-progress', { note: 'n2' }).code === 200);

// ── everything off: silence (no intro, no reminder) ──
settings['agents.toolStatus'] = false;
settings['agents.toolAsk'] = false;
settings['agents.toolTask'] = false;
freshSession();
const cNone = promptCtx();
check('all tools + context off: no tools intro', !cNone.includes('vibespace-session-tools'), cNone.slice(0, 200));
check('all tools off: reminder has no tool teaching', !/vibespace-(status|ask|task)/.test(cNone), cNone);

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\ntool-toggle smoke passed — disabled features neither taught nor served');
