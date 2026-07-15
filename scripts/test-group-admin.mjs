#!/usr/bin/env node
// Route-level smoke for /api/agent/group-admin (2.132.0, issue #21 — manager
// agent delegation). Fake express + real TaskGroupManager in a temp dir.
// Asserts the DOUBLE GATE (setting + per-session designation), the path
// allowlist, all five verbs, and the audit trail. Run: node scripts/test-group-admin.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { TaskGroupManager } = require('../src/task-groups.js');
const { setupAgentRoutes } = require('../src/agent-routes.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-groupadmin-'));
const tasks = new TaskGroupManager({ dataDir: tmp, onChange: () => {} });

const routes = {};
const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
const session = { agentToken: 'vsst_test', backend: 'claude', backendSessionId: 'abc-123', cwd: tmp, name: 'mgr' };
const activeSessions = new Map([['sess1', session]]);
const settings = {};
let userState = {};
setupAgentRoutes({
  app, activeSessions, tasks,
  sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, rekey: () => {}, clear: () => null, setByUser: () => null, setByAgent: () => null, history: () => [] },
  SessionStatusManager: { renderNotice: () => '' },
  userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
  sessionStatusKey: () => 'claude:abc-123',
  serverSetting: (k) => settings[k],
  scheduleCtxSync: () => {},
  remoteCtxBaseFor: () => null,
  readUserState: () => userState,
});

function call(body) {
  let out, code = 200;
  const req = { headers: { authorization: 'Bearer vsst_test' }, query: {}, body };
  const res = { json: (o) => { out = o; return res; }, status: (c) => { code = c; return res; } };
  routes['POST /api/agent/group-admin'](req, res);
  return { code, out };
}

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};

// gate 1: setting off
let r = call({ list: true });
check('setting off → 403 with guidance', r.code === 403 && /disabled/.test(r.out.error));

// gate 2: setting on, not designated
settings['agents.allowGroupManagement'] = true;
r = call({ list: true });
check('not designated → 403 naming the session key', r.code === 403 && r.out.error.includes('claude:abc-123'));

// designated → verbs work
userState = { sessionConfigs: { 'claude:abc-123': { groupManager: true } } };
r = call({ list: true });
check("list works when designated", r.code === 200 && Array.isArray(r.out.groups), JSON.stringify(r));

const ctxDir = path.join(os.homedir(), '.vs-test-ctx-' + Date.now());
r = call({ create: { title: 'War room', objective: 'Test initiative', contextDir: ctxDir, folders: [path.join(os.homedir(), 'work')] } });
check('create returns the group', r.code === 200 && r.out.group?.title === 'War room');
const gid = r.out.group.id;
const g = tasks.get(gid);
check('contextDir + folders stored', g.contextDir === ctxDir && g.folders?.[0]?.path === path.join(os.homedir(), 'work'));
check('create audited in activity log', (g.progress || []).some((p) => /group created by manager agent/.test(p.note) && p.session === 'claude:abc-123'));

// path allowlist (default root = ~)
r = call({ create: { title: 'Evil', contextDir: '/etc' } });
check('contextDir outside roots rejected', r.code === 400 && /must be under/.test(r.out.error));
settings['agents.groupManagementRoots'] = '/srv/allowed';
r = call({ update: { id: gid, contextDir: path.join(os.homedir(), 'x') } });
check('custom roots enforced on update', r.code === 400 && /must be under/.test(r.out.error));
settings['agents.groupManagementRoots'] = '~';

// update + bind + unbind
r = call({ update: { id: gid, objective: 'Updated objective', archived: false } });
check('update works', r.code === 200 && tasks.get(gid).objective === 'Updated objective');
r = call({ bind: { id: gid, sessionKey: 'claude:other-999' } });
check('bind another session', r.code === 200 && tasks.get(gid).sessions.includes('claude:other-999'));
r = call({ bind: { id: gid } });
check('bind defaults to self', r.code === 200 && tasks.get(gid).sessions.includes('claude:abc-123'));
r = call({ unbind: { id: gid, sessionKey: 'claude:other-999' } });
check('unbind works', r.code === 200 && !tasks.get(gid).sessions.includes('claude:other-999'));
check('every op audited', (tasks.get(gid).progress || []).filter((p) => p.note.startsWith('[group-admin]')).length >= 4);

// no delete verb exists
r = call({ delete: { id: gid } });
check('unknown verb → 400', r.code === 400);

// ── 2.152.0: manager scope = ALL groups (user directive) ──────────────────
// A manager may target ANY group with explicit --group on REGULAR verbs, even
// one it does not belong to; non-managers keep the belonging enforcement.
function callRoute(route, { query = {}, body = {} } = {}) {
  let out, code = 200;
  const req = { headers: { authorization: 'Bearer vsst_test' }, query, body };
  const res = { json: (o) => { out = o; return res; }, status: (c) => { code = c; return res; } };
  routes[route](req, res);
  return { code, out };
}
// the manager session is NOT in this group (bound to nobody, folders elsewhere)
r = call({ create: { title: 'Foreign group' } });
const foreignId = r.out.group.id;
call({ unbind: { id: foreignId } }); // ensure self not bound (create doesn't bind, but be explicit)
r = callRoute('POST /api/agent/task-progress', { body: { group: foreignId, note: 'manager cross-group note' } });
check('manager: progress into a NON-belonged group via --group', r.code === 200,
  JSON.stringify(r.out));
check('cross-group note attributed + stored', (tasks.get(foreignId).progress || []).some((p) => p.note === 'manager cross-group note' && p.session === 'claude:abc-123'));
r = callRoute('POST /api/agent/task-progress', { body: { group: 'T-nonexistent', note: 'x' } });
check('manager: unknown group id → 404 with group-list pointer', r.code === 404 && /group-list/.test(r.out.error), JSON.stringify(r.out));
userState = {}; // de-designate → belonging enforcement returns
r = callRoute('POST /api/agent/task-progress', { body: { group: foreignId, note: 'nope' } });
check('non-manager: explicit non-belonged group still 403', r.code === 403, JSON.stringify(r.out));
userState = { sessionConfigs: { 'claude:abc-123': { groupManager: true } } };

// ── 2.152.0: the manager LEARNS its powers in injected context ────────────
r = callRoute('GET /api/agent/prompt-context', {});
check('prompt-context teaches the manager block once', r.code === 200 && /vibespace-group-manager/.test(r.out.context) && /group-list/.test(r.out.context), (r.out.context || '').slice(0, 120));
r = callRoute('GET /api/agent/prompt-context', {});
check('manager block is one-shot (not re-sent)', r.code === 200 && !/vibespace-group-manager/.test(r.out.context || ''));
// per-turn reminder carries a manager clause
settings['agents.perTurnToolReminder'] = true;
r = callRoute('GET /api/agent/prompt-context', {});
check('per-turn reminder names the manager powers', /Group MANAGER/.test(r.out.context || ''), (r.out.context || '').slice(0, 200));
// a NON-manager session gets neither
delete session._mgrIntroSeen; delete session._toolsIntroSeen;
userState = {};
r = callRoute('GET /api/agent/prompt-context', {});
check('non-manager gets no manager teaching', !/vibespace-group-manager|Group MANAGER/.test(r.out.context || ''), (r.out.context || '').slice(0, 200));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall green');
process.exit(failed ? 1 : 0);
