#!/usr/bin/env node
// AGENT BROWSER P1 second half — ANTI-DEFAULT-BLINDNESS, layers ① and ② (the
// FAST half; docs/design-agent-browser-v2.md §3.8, §3.2.5 path 3; §9's
// `test-profile-blindness` row). Layer ③ (the status-bar chip, a headless-
// chrome MUTATION leg) is the heavy half and is not here.
//
// What it proves, in order:
//   ① THE NOTICE SLOT IS A QUEUE (src/session-status.js): a status override
//      and a browser-profile change BOTH pending survive each other (the old
//      single slot overwrote), `renderNotice` dispatches on `kind`
//      ('status-override' keeps today's sentence verbatim), an unknown kind is
//      refused LOUDLY at push time, the queue is bounded, an agent's own clear
//      keeps a queued notice, and a file an OLDER build wrote (`pendingNotice`,
//      one fixed shape) is lifted into the queue once at load;
//   ② THE INJECTION SITE DRAINS: the REAL /api/agent/prompt-context route with
//      the REAL SessionStatusManager — both notices reach the SAME next prompt
//      (the old site consumed one and `break`-ed), and the following prompt
//      carries neither (consumed once); the record still under `webui:<id>`
//      drains too;
//   ③ the SESSION-START context lists the CURRENT attachment set (layer ②'s
//      other half) — only when the session holds one;
//   ④ END TO END, zero billed turns: a USER's mid-task pin through the UI route
//      re-points the running session's per-session config (no restart), queues
//      the typed `browser-pin` notice through the wiring-shaped `notice` dep
//      into the REAL SessionStatusManager, the next prompt-context drains it as
//      one <system-reminder>, and the keeper's next `resolveFor` is refused
//      exactly once (layer ①) — no spend site is touched anywhere on the path.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { SessionStatusManager, NOTICE_KINDS } = require('../src/session-status.js');
const { TaskGroupManager } = require('../src/task-groups.js');
const { setupAgentRoutes, sessionToolsIntro, browserSetLine } = require('../src/agent-routes.js');
const B = require('../src/browser-profiles.js');
const K = require('../src/server/browser-keeper.js');
const BE = require('../src/server/browser-env.js');
const LIMITS = require('../src/keeper-limits.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
const threw = (fn) => { try { fn(); return null; } catch (e) { return e; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = scratch('profile-blindness');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const SHORT = scratch('pb'); fs.mkdirSync(SHORT, { recursive: true });
const spawned = new Set();
function cleanup() { for (const pid of spawned) { try { process.kill(pid, 'SIGKILL'); } catch { } } for (const d of [ROOT, SHORT]) fs.rmSync(d, { recursive: true, force: true }); }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const mkStatus = (name) => { const d = path.join(ROOT, name); fs.mkdirSync(d, { recursive: true }); return new SessionStatusManager({ dataDir: d, onChange: () => { } }); };

// ═══ ① the queue ═════════════════════════════════════════════════════════
console.log('— ① the notice slot is a QUEUE of typed notices (src/session-status.js)');
{
  const st = mkStatus('q1');
  const KEY = 'claude:sess-1';
  st.setByAgent(KEY, { state: 'working', urgency: 'normal', reason: 'building' });
  st.setByUser(KEY, { state: 'blocked', urgency: 'high' });
  ok(st.pendingNotices(KEY).length === 1 && st.pendingNotices(KEY)[0].kind === 'status-override', 'a user override of an agent-set status queues ONE status-override notice');
  const n = st.pushNotice(KEY, B.profileChangeNotice({ was: 'ephemeral', now: 'Work', by: 'user', handles: ['work'] }));
  ok(n === 2 && st.pendingNotices(KEY).length === 2 && st.pendingNotices(KEY)[1].kind === 'browser-profile', 'a browser-profile notice pushed beside it makes TWO pending — neither overwrote the other');
  ok(NOTICE_KINDS.includes('status-override') && NOTICE_KINDS.includes('browser-profile') && NOTICE_KINDS.includes('browser-pin'), 'the closed kind set names status-override / browser-profile / browser-pin');
  const bad = threw(() => st.pushNotice(KEY, { kind: 'nope', at: 1 }));
  ok(bad && /unknown notice kind "nope"/.test(bad.message) && st.pendingNotices(KEY).length === 2, 'an unknown kind is refused LOUDLY at push time (never rendered as garbage)');
  const rendered = SessionStatusManager.renderNotices(st.pendingNotices(KEY));
  ok(/manually changed this session's status indicator/.test(rendered) && /Yours: state=working, urgency=normal, reason="building"/.test(rendered) && /browser profile changed: ephemeral → Work \(by user\)/.test(rendered) && (rendered.match(/<system-reminder>/g) || []).length === 2, 'renderNotices dispatches on kind: today\'s status-override sentence VERBATIM + the browser-profile reminder, one <system-reminder> each');
  ok(SessionStatusManager.renderNotice({ agent: { state: 'done', urgency: 'low' }, user: null, at: 1 }).includes('cleared the status indicator'), 'a notice with NO kind (an older build\'s shape) renders as the legacy status-override');
  ok(SessionStatusManager.renderNotice({ kind: 'browser-pin', was: null, now: 'Work', by: 'user', handles: ['work'] }).includes('ephemeral (no profile) → Work'), 'browser-pin renders through the same profile-change sentence with the ephemeral spelling for "no profile"');
  const drained = st.consumeNotices(KEY);
  ok(drained.length === 2 && drained[0].kind === 'status-override' && drained[1].kind === 'browser-profile' && st.pendingNotices(KEY).length === 0 && st.consumeNotices(KEY).length === 0, 'consumeNotices drains EVERYTHING in order, once');
  ok(st.get(KEY) && st.get(KEY).state === 'blocked', '…and the status record itself stays');
  // bounded
  for (let i = 0; i < 12; i++) st.pushNotice(KEY, { kind: 'browser-profile', was: 'p' + i, now: 'p' + (i + 1), by: 'user', handles: [] });
  const q = st.pendingNotices(KEY);
  ok(q.length === 8 && q[0].was === 'p4' && q[7].was === 'p11', 'the queue is BOUNDED at 8 — the oldest go first (the newest describe the present)');
  st.consumeNotices(KEY);
  // an agent's own clear keeps a queued notice
  st.setByAgent(KEY, { state: 'working', urgency: 'normal' });
  st.pushNotice(KEY, { kind: 'browser-pin', was: null, now: 'Work', by: 'user', handles: ['work'] });
  st.clear(KEY, 'agent');
  ok(st.pendingNotices(KEY).length === 1 && st.pendingNotices(KEY)[0].kind === 'browser-pin', 'an agent\'s own clear keeps the browser-pin notice queued for it');
  st.consumeNotices(KEY);
  ok(!st.get(KEY), 'a record with nothing left (no state, no notices) is removed');
  // the pending queue survives an agent re-set
  st.setByUser(KEY, { state: 'review', urgency: 'low' });
  st.pushNotice(KEY, { kind: 'browser-profile', was: 'a', now: 'b', by: 'user', handles: [] });
  st.setByAgent(KEY, { state: 'working', urgency: 'normal' });
  ok(st.pendingNotices(KEY).length === 1, 'an agent re-set keeps the undelivered notices');
  st.consumeNotices(KEY);
  // a key with no record at all
  ok(st.pushNotice('claude:fresh', { kind: 'browser-pin', now: 'X', by: 'user', handles: [] }) === 1 && st.get('claude:fresh') && st.get('claude:fresh').setBy === null, 'pushing to a key with no status record creates a state-less record that carries only the queue');
  // legacy lift
  const d2 = path.join(ROOT, 'q2'); fs.mkdirSync(d2, { recursive: true });
  fs.writeFileSync(path.join(d2, 'session-status.json'), JSON.stringify({ statuses: { 'claude:old': { state: 'blocked', urgency: 'high', reason: null, setBy: 'user', at: 1, pendingNotice: { agent: { state: 'working', urgency: 'normal', reason: 'x' }, user: { state: 'blocked', urgency: 'high' }, at: 1 } } } }));
  const st2 = new SessionStatusManager({ dataDir: d2, onChange: () => { } });
  const lifted = st2.pendingNotices('claude:old');
  ok(lifted.length === 1 && lifted[0].kind === 'status-override' && lifted[0].agent.reason === 'x' && !('pendingNotice' in st2.get('claude:old')), 'a file an OLDER build wrote (one fixed-shape pendingNotice) is lifted into the queue once at load');
  ok(/manually changed/.test(SessionStatusManager.renderNotices(st2.consumeNotices('claude:old'))), '…and renders as the status-override it was');
}

// ═══ ② the injection site drains ═════════════════════════════════════════
console.log('— ② /api/agent/prompt-context DRAINS the queue (both notices reach ONE prompt, then none)');
{
  const tmp = path.join(ROOT, 'routes'); fs.mkdirSync(path.join(tmp, 'work'), { recursive: true });
  const tasks = new TaskGroupManager({ dataDir: tmp, onChange: () => { } });
  const sessionStatus = mkStatus('q3');
  const routes = {};
  const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
  const session = { agentToken: 'vsst_test', backend: 'claude', cwd: path.join(tmp, 'work'), name: 't' };
  const activeSessions = new Map([['sess1', session]]);
  setupAgentRoutes({
    app, activeSessions, tasks, sessionStatus, SessionStatusManager,
    userTodos: { rekey: () => { }, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (s, id) => `claude:${id}`, serverSetting: () => undefined, scheduleCtxSync: () => { }, remoteCtxBaseFor: () => null,
  });
  const prompt = () => { let out; const req = { headers: { authorization: 'Bearer vsst_test' }, query: {}, body: {} }; const res = { json: (o) => { out = o; }, status: () => res }; routes['GET /api/agent/prompt-context'](req, res); return out.context || ''; };
  const KEY = 'claude:sess1';
  sessionStatus.setByAgent(KEY, { state: 'working', urgency: 'normal', reason: 'building' });
  sessionStatus.setByUser(KEY, { state: 'blocked', urgency: 'high' });
  sessionStatus.pushNotice(KEY, B.profileChangeNotice({ was: 'ephemeral', now: 'Work', by: 'user', handles: ['work'] }));
  const c1 = prompt();
  ok(/manually changed this session's status indicator/.test(c1) && /browser profile changed: ephemeral → Work/.test(c1), 'BOTH pending notices reach the same next prompt (the old site consumed one and broke)');
  const c2 = prompt();
  ok(!/status indicator/.test(c2) && !/browser profile changed/.test(c2), 'the following prompt carries neither (drained once)');
  // the record still under webui:<id> (before the agent's first call re-keys it) drains too
  sessionStatus.pushNotice('webui:sess1', { kind: 'browser-pin', was: null, now: 'Personal', by: 'user', handles: ['personal'] });
  const c3 = prompt();
  ok(/browser profile changed: ephemeral \(no profile\) → Personal/.test(c3), 'a notice queued under webui:<id> is drained as well');
  ok(!/browser profile changed/.test(prompt()), '…once');
}

// ═══ ③ the session-start context ═════════════════════════════════════════
console.log('— ③ the session-start context lists the CURRENT attachment set (§3.8 layer ②)');
{
  const set = B.attachmentsFor({ leases: [{ profileId: 'bp-00000001', browserKey: 'bk-0000000a', since: 1, alias: 'personal' }, { profileId: 'bp-00000002', browserKey: 'bk-0000000a', since: 2, alias: 'work' }], profiles: [{ id: 'bp-00000001', label: 'Personal', dir: '/p' }, { id: 'bp-00000002', label: 'Work', dir: '/w' }], browserKey: 'bk-0000000a', pin: { profileId: 'bp-00000002' } });
  const line = browserSetLine(set);
  ok(/personal, work \(default\)/.test(line) && /must name one with `--profile <handle>`/.test(line) && /profile_required/.test(line) && /profile_changed/.test(line), 'the line names every attachment, marks the default, and states the ≥2 rule + the one-time refusal');
  const one = B.attachmentsFor({ leases: [{ profileId: 'bp-00000001', browserKey: 'bk-0000000a', since: 1 }], profiles: [{ id: 'bp-00000001', label: 'Personal', dir: '/p' }], browserKey: 'bk-0000000a' });
  ok(/personal \(default\)/.test(browserSetLine(one)) && !/profile_required/.test(browserSetLine(one)), 'with ONE attachment the line says a bare command lands on it (no refusal rule — the commonest shape stays one command)');
  const T = { status: true, ask: true, task: true, jobs: true, msg: true, pages: true, browser: true };
  const withSet = sessionToolsIntro(T, { browserVariant: 'D', browserSet: set });
  const without = sessionToolsIntro(T, { browserVariant: 'D' });
  ok(/Browser profiles attached to THIS session: personal, work \(default\)/.test(withSet) && !/Browser profiles attached/.test(without), 'sessionToolsIntro carries the set line only when the session holds a set');
}

// ═══ ④ end to end: a mid-task pin, no restart, zero billed turns ══════════
console.log('— ④ end to end: the UI pin re-points the running session, queues the notice, the next prompt carries it, the keeper refuses once');
{
  const express = require('express');
  const R = require('../src/routes/browser.js');
  const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
  const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
  const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB = path.join(ROOT, 'ab'); fs.mkdirSync(AB, { recursive: true });
  // a launch-free fake: the keeper's start needs `open` + `session info`; the daemon is a sleep
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const [a, b] = process.argv.slice(2).filter((x) => x !== '--pin-tab');
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, socketDir: path.join(st, ns, 'run'), version: '0.38.0' } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n'); } out({ success: true, data: {} }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:1/x' } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1 } }); process.exit(0); }
out({ success: false, error: 'fake: unknown ' + a }); process.exit(1);
`, { mode: 0o755 });
  const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}`;
  const KEY = 'bk-0000000a';
  const sessionStatus = mkStatus('q4');
  const k = K.create({ dataDir: DATA, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB }), broadcast: () => { }, serverSetting: () => undefined, liveKeys: () => new Set([KEY]), limits: { ...LIMITS, CONCURRENT_CAP: 2 }, log: { log() { }, warn() { }, error() { } }, tickMs: 3600e3, install: false });
  await k._facts.probeVersion();
  const be = BE.create({ dataDir: DATA, homeDir: HOME, serverNotice: null, telemetry: null, log: { warn() { }, log() { } }, env: { XDG_RUNTIME_DIR: SHORT }, socketDirBase: path.join(ROOT, 'sock') });
  const env0 = be.envFor({ browserKey: KEY, integrationOn: true, remote: false, cwd: ROOT });
  const TOKEN = 'vsst_' + 'b'.repeat(24);
  const session = { agentToken: TOKEN, backend: 'claude', cwd: path.join(ROOT, 'work'), name: 't', _browserKey: KEY, _browserVariant: env0.variant, sockName: 'cw-9' };
  fs.mkdirSync(session.cwd, { recursive: true });
  const activeSessions = new Map([['sess-9', session]]);
  const sessionStatusKey = (s, id) => `claude:${id}`;
  const persisted = [];
  // the ROUTES on an in-process express app, with the wiring-shaped deps
  const app = express(); app.use(express.json());
  R.setup({ keeper: k, activeSessions, browserEnv: () => be, notice: (sid, s, n) => sessionStatus.pushNotice(sessionStatusKey(s, sid), n), persistPin: (s, id, origin) => persisted.push({ id, origin }), tasksForSession: () => [] });
  app.use(R.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const API = `http://127.0.0.1:${srv.address().port}`;
  const j = async (method, p, body) => { const res = await fetch(API + p, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  // the prompt-context route with the REAL manager
  const tasks = new TaskGroupManager({ dataDir: path.join(ROOT, 'routes4'), onChange: () => { } });
  const routes = {};
  setupAgentRoutes({ app: { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } }, activeSessions, tasks, sessionStatus, SessionStatusManager, userTodos: { rekey: () => { }, forSession: () => [], resolveByAgent: () => null, add: () => ({}) }, sessionStatusKey, serverSetting: () => undefined, scheduleCtxSync: () => { }, remoteCtxBaseFor: () => null });
  const prompt = () => { let out; const req = { headers: { authorization: 'Bearer ' + TOKEN }, query: {}, body: {} }; const res = { json: (o) => { out = o; }, status: () => res }; routes['GET /api/agent/prompt-context'](req, res); return out.context || ''; };
  const work = k.createProfile({ label: 'Work' }, { owner: { kind: 'session', id: KEY } });
  const pers = k.createProfile({ label: 'Personal' }, { owner: { kind: 'instance', id: null } });
  await k.attach({ profileId: work.id, browserKey: KEY, sessionId: 'sess-9' });
  await k.attach({ profileId: pers.id, browserKey: KEY, sessionId: 'sess-9' });
  try { for (const l of fs.readFileSync(path.join(AB, 'pids'), 'utf8').trim().split('\n')) spawned.add(Number(l)); } catch { }
  ok(k.resolveFor({ browserKey: KEY, handle: 'work' }).ok, 'the agent has issued a command (told: two attachments, no default)');
  const p0 = prompt(); // the FIRST prompt delivers the intro context; the second is the per-turn reminder — neither may carry a browser notice yet
  ok(be.resolvedProfileDir(KEY) === '' && !/browser profile changed/.test(p0) && !/browser profile changed/.test(prompt()), 'before the pin: the config names no profile and no prompt carries a browser notice');
  const r = await j('POST', '/api/browser/pin', { sessionId: 'sess-9', profile: 'Work' });
  ok(r.status === 200 && r.json.pin.profileId === work.id && /applies/.test(r.json.appliesFrom), 'the USER pins Work mid-task through the UI route');
  ok(be.resolvedProfileDir(KEY) === work.dir && session._browserProfileId === work.id && persisted[0].id === work.id, 'NO RESTART: the same browserKey\'s config now names Work\'s dir, the live session is stamped, the meta write was asked');
  ok(sessionStatus.pendingNotices(sessionStatusKey(session, 'sess-9')).length === 1 && sessionStatus.pendingNotices(sessionStatusKey(session, 'sess-9'))[0].kind === 'browser-pin', 'ONE typed browser-pin notice is queued in the REAL session-status store');
  const c = prompt();
  ok(/browser profile changed: ephemeral \(no profile\) → Work \(by user\)/.test(c) && /Attached now: work, personal/.test(c) && (c.match(/<system-reminder>/g) || []).length === 1, 'the user\'s next prompt carries the notice as one <system-reminder> naming the set — zero billed turns (it rides the user\'s own message)');
  ok(!/browser profile changed/.test(prompt()), '…once');
  const v = k.resolveFor({ browserKey: KEY, handle: 'work' });
  ok(!v.ok && v.code === 'profile_changed' && v.now.default === 'work', 'layer ①: the agent\'s next CLI command is refused ONCE with profile_changed');
  ok(k.resolveFor({ browserKey: KEY, handle: 'work' }).ok, '…and then runs');
  // no spend site: the pin path never touches the spend guard (the notice is free by construction)
  const routeSrc = fs.readFileSync(new URL('../src/routes/browser.js', import.meta.url), 'utf8');
  const keeperSrc = fs.readFileSync(new URL('../src/server/browser-keeper.js', import.meta.url), 'utf8');
  ok(!/spendGuard|authorizeUnattendedSpend|reason:\s*'browser-pin'/.test(routeSrc + keeperSrc), 'the notice path names no spend reason and asks no spend guard — the billed `announcePin` ladder is a later, OFF-by-default producer');
  await k.stop(work.id).catch(() => { }); await k.stop(pers.id).catch(() => { });
  k.shutdown();
  srv.close();
  await sleep(50);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
