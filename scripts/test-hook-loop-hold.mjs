#!/usr/bin/env node
// THE HOOK PATH HOLDS NOTHING OVER A SLOW CONTEXT ROOT (heavy, in-process — lane task-group-fanout, 2026-10-24). Measured
// on the owner's instance: a member's every turn walked each told Context folder SYNCHRONOUSLY on the hub's main thread to
// sign it (task-groups contextSignature: readdirSync + statSync, ≤ 401 files, depth 4) — 92–185 ms a turn over the
// owner's NFS rows (not a storage mount, so the .350 SafeFs road never covered them); a stalled NFS server held the whole
// hub. The real routes over a real store, a Context row on a SLOW fake root (every readdir / stat under it sleeps in the
// call — Atomics.wait, the NFS / FUSE wait's shape: no CPU, no run-queue wait), the suite's own 10 ms loop clock and a
// same-box control process — THE 3-NUMBER JUDGE of scripts/test-boot-loop-hold.mjs (a gap's HOLD = its ms − max(the main
// thread's run-queue wait, the control's stall); the law, 250 ms, never moves):
//   ① the judge (its table, as test-boot-loop-hold ①)
//   ② RED CONTROL — the old synchronous signature (no off-thread reader; the main thread's fs slowed): one prompt holds the
//      loop past the law
//   ③ the off-thread road (a SafeFs pool whose WORKERS' fs is slowed the same way): the same prompt holds nothing; the
//      answer comes when the read landed and tells byte for byte what the control told
//   ④ a root slower than the bound: the answer at the bound (≤ 1 s, inside the hook's 3 s), that group deferred
//      (sigStale), the loop still free; once the read lands the next turn tells it
// The report quotes the printed numbers (the hook path's main-thread ms over a slow root, base vs now).
// Run: node scripts/test-hook-loop-hold.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { TaskGroupManager } = require('../src/task-groups.js');
const { SafeFs } = require('../src/safe-fs.js');
const ROUTES = require('../src/agent-routes.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAW_MS = 250, SLOW_MS = 25, SLOWER_MS = 90, FILES = 14;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hookhold-'));

// ── THE 3-NUMBER JUDGE (copied from scripts/test-boot-loop-hold.mjs — the same law, the same words) ──
const stallOver = (control, at, ms) => ((control && control.gaps) || []).reduce((m, x) => Math.max(m, Math.min(at + ms, x.at + x.ms) - Math.max(at, x.at)), 0);
function judge(clock, law = LAW_MS, control = null) {
  const gaps = ((clock && clock.gaps) || []).map((g) => { const ctl = Math.round(stallOver(control, (clock.origin || 0) + g.at, g.ms)); return { ...g, ctl, held: Math.max(0, g.ms - Math.max(g.wait || 0, ctl)) }; });
  const over = gaps.filter((g) => g.held >= law);
  const top = gaps.reduce((m, g) => (!m || g.ms > m.ms ? g : m), null);
  return { ok: !!clock && clock.first != null && !over.length, over, gaps, top, maxMs: top ? top.ms : 0, maxHeld: gaps.reduce((m, g) => Math.max(m, g.held), 0), firstMs: clock ? clock.first : null };
}
const gapWords = (g) => g ? `${g.ms} ms (cpu ${g.cpu ?? '?'} · run-queue wait ${g.wait ?? '?'} · control ${g.ctl} ⇒ held ${g.held})` : 'none';
console.log('① the judge');
ok(!judge({ first: 900, gaps: [{ at: 2000, ms: 300 }] }).ok && judge({ first: 900, gaps: [{ at: 2000, ms: 249 }] }).ok, 'a 300 ms gap is red, a 249 ms one green');
ok(judge({ first: 900, gaps: [{ at: 2000, ms: 300, cpu: 175, wait: 120 }] }).ok && judge({ first: 900, origin: 1e6, gaps: [{ at: 2000, ms: 300, cpu: 90, wait: 0 }] }, LAW_MS, { gaps: [{ at: 1e6 + 1990, ms: 220 }] }).ok, 'a gap the box made wait (run-queue) or stalled on the same-box control is excused by that much');
ok(!judge({ first: 900, gaps: [{ at: 2000, ms: 260, cpu: 2, wait: 0 }] }).ok && !judge(null).ok, 'a thread asleep IN a call (no CPU, no run-queue wait — the NFS shape) is all hold; no clock proves nothing');

// ── the clocks: the main thread's own 10 ms clock (each gap with its CPU + run-queue wait), the same-box control ──
const clock = { origin: performance.timeOrigin, first: null, gaps: [] };
let sfd = -1; try { sfd = fs.openSync('/proc/thread-self/schedstat', 'r'); } catch { }
const sb = Buffer.alloc(96);
const facts = () => { const c = process.threadCpuUsage(); let w = null; if (sfd >= 0) { try { const n = fs.readSync(sfd, sb, 0, 96, 0); w = Number(sb.toString('latin1', 0, n).split(' ')[1]) / 1e6; } catch { } } return { cpu: (c.user + c.system) / 1000, wait: w }; };
let last = performance.now(), lastF = facts();
const tickT = setInterval(() => { const t = performance.now(), f = facts(); if (clock.first === null) clock.first = Math.round(t); else if (t - last - 10 >= 20) clock.gaps.push({ at: Math.round(last), ms: Math.round(t - last - 10), cpu: Math.round(f.cpu - lastF.cpu), wait: f.wait == null || lastF.wait == null ? null : Math.round(f.wait - lastF.wait) }); last = t; lastF = f; }, 10);
const CONTROL = path.join(tmp, 'control.cjs');
fs.writeFileSync(CONTROL, `const { performance } = require('perf_hooks'); const fs = require('fs');
const out = process.argv[2], gaps = []; let last = performance.now();
setInterval(() => { const t = performance.now(); if (t - last - 10 >= 20) gaps.push({ at: Math.round(performance.timeOrigin + last), ms: Math.round(t - last - 10) }); last = t; }, 10);
const save = () => { try { fs.writeFileSync(out + '.tmp', JSON.stringify({ gaps })); fs.renameSync(out + '.tmp', out); } catch { } };
setInterval(save, 250); process.on('SIGTERM', () => { save(); process.exit(0); });
`);
// one measured span: the control beside it, the clock's gaps inside it judged
const measure = async (tag, fn) => {
  const out = path.join(tmp, `control-${tag}.json`);
  const ctl = spawn(process.execPath, [CONTROL, out], { stdio: 'ignore' });
  await sleep(150);
  const g0 = clock.gaps.length, t0 = Date.now();
  const r = await fn();
  const ms = Date.now() - t0;
  await sleep(60);   // the clock's next tick past the span (a hold is recorded when the loop turns again)
  const span = { ...clock, gaps: clock.gaps.slice(g0) };
  ctl.kill('SIGTERM');
  await Promise.race([new Promise((res) => (ctl.exitCode !== null ? res() : ctl.once('exit', res))), sleep(3000)]);
  let control = null; try { control = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { }
  return { r, ms, j: judge(span, LAW_MS, control) };
};

// ── the rig: the real routes over a real store; one Context row on the slow fake root ──
const slowRoot = path.join(tmp, 'slow-root'), work = path.join(tmp, 'work');
fs.mkdirSync(work, { recursive: true });
for (let i = 0; i < FILES; i++) { const p = path.join(slowRoot, i % 2 ? 'b' : 'a', `note-${String(i).padStart(2, '0')}.md`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'x'.repeat(100 + i * 10)); }
// a thread asleep in the call (no CPU): the main thread's fs for the CONTROL, each worker's for the new road
const SLEEP_SRC = (ms) => `const __sab = new Int32Array(new SharedArrayBuffer(4)); const __slow = (p) => { if (String(p).startsWith(${JSON.stringify(slowRoot)})) Atomics.wait(__sab, 0, 0, ${ms}); };
for (const k of ['readdirSync', 'statSync', 'lstatSync']) { const real = require('fs')[k]; require('fs')[k] = function (p, ...a) { __slow(p); return real.call(this, p, ...a); }; }`;
const workerOf = (ms) => { const f = path.join(tmp, `slow-worker-${ms}.js`); fs.writeFileSync(f, `${SLEEP_SRC(ms)}\nrequire(${JSON.stringify(path.join(REPO, 'src/safe-fs-worker.js'))});\n`); return f; };
const slowMain = () => { const real = {}; const sab = new Int32Array(new SharedArrayBuffer(4)); for (const k of ['readdirSync', 'statSync', 'lstatSync']) { real[k] = fs[k]; fs[k] = function (p, ...a) { if (String(p).startsWith(slowRoot)) Atomics.wait(sab, 0, 0, SLOW_MS); return real[k].call(this, p, ...a); }; } return () => { for (const k of Object.keys(real)) fs[k] = real[k]; }; };
let road = null;
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const tasks = new TaskGroupManager({ dataDir, onChange: () => { }, getSetting: () => undefined, mirrorFs: () => road });
const gid = tasks.create({ title: 'Slow root', objective: 'the told folder sits on a slow mount', ctx: [{ path: work, tags: ['discover'], tell: 'note' }, { path: slowRoot, tell: 'names' }] }).id;
const mkRig = () => {
  const routes = {};
  const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; }, put: () => {}, patch: () => {}, delete: () => {}, use: () => {} };
  const activeSessions = new Map();
  ROUTES.setupAgentRoutes({
    app, activeSessions, tasks,
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], dropNotices: () => {}, rekey: () => {}, clear: () => null, setByUser: () => null, setByAgent: () => null, history: () => [] },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (s, id) => `claude:${id}`, serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => null,
    getSessionMetaStore: () => ({ readSessionMeta: () => null, writeSessionMeta: () => {} }),
  });
  const prompt = (id) => new Promise((resolve) => {
    const s = activeSessions.get(id);
    const req = { headers: { authorization: 'Bearer ' + s.agentToken }, query: {}, body: {} };
    const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { };
    const res = { json: (o) => { console.log = l; console.warn = w; resolve((o && o.context) || ''); }, status: () => res };
    routes['GET /api/agent/prompt-context'](req, res);
  });
  return { activeSessions, prompt };
};
const mkSession = (id) => ({ agentToken: `vsst_${id}`, backend: 'claude', cwd: work, name: id, sockName: `sock-${id}`, clients: new Map() });
const fresh = () => { for (const c of [tasks._sigCache, tasks._walkCache]) if (c) c.clear(); };

// ════════ ② RED CONTROL: the old synchronous signature ════════
console.log('② RED CONTROL — the old synchronous signature (no off-thread reader), the main thread\'s fs slowed');
const rigC = mkRig(); rigC.activeSessions.set('A', mkSession('A'));
road = null; fresh();
const restore = slowMain();
const base = await measure('base', () => rigC.prompt('A'));
restore();
console.log(`    base: one prompt over the slow root answered in ${base.ms} ms; the loop's worst gap ${gapWords(base.j.top)}`);
ok(!base.j.ok && base.j.maxHeld >= LAW_MS && base.r.includes(gid), `RED CONTROL: the old road holds the loop ${base.j.maxHeld} ms (≥ ${LAW_MS} ms) for one prompt — the hub stood still while it walked`, base.j.top);

// ════════ ③ the off-thread road ════════
console.log('③ the off-thread road — the SafeFs workers\' fs slowed the same way');
const pool = new SafeFs({ poolSize: 2, name: 'hookhold', workerPath: workerOf(SLOW_MS) });
const rigN = mkRig(); rigN.activeSessions.set('A', mkSession('A'));
road = pool; fresh();
const now = await measure('now', () => rigN.prompt('A'));
console.log(`    now: the same prompt answered in ${now.ms} ms; the loop's worst gap ${gapWords(now.j.top)}`);
ok(now.j.ok && now.j.maxHeld < LAW_MS, `the same prompt holds the loop ${now.j.maxHeld} ms at most (< ${LAW_MS} ms) — the walk ran in a worker`, now.j.over);
ok(now.r === base.r && !rigN.activeSessions.get('A')._sigStale, 'it answered once the read landed (inside the bound) and told byte for byte what the old road told', { base: base.r.slice(0, 160), now: now.r.slice(0, 160) });
pool.close();

// ════════ ④ a root slower than the bound ════════
console.log(`④ a root slower than the bound (${SLOWER_MS} ms a call — the read needs over 1 s)`);
const slower = new SafeFs({ poolSize: 2, name: 'hookhold-slower', workerPath: workerOf(SLOWER_MS) });
const rigS = mkRig(); rigS.activeSessions.set('B', mkSession('B'));
road = slower; fresh();
const late = await measure('late', () => rigS.prompt('B'));
const sB = rigS.activeSessions.get('B');
console.log(`    the prompt answered at ${late.ms} ms; the loop's worst gap ${gapWords(late.j.top)}`);
ok(late.j.ok && late.ms >= 900 && late.ms < 2000 && !late.r.includes(gid) && sB._sigStale && gid in sB._sigStale, `the answer at the BOUND (${late.ms} ms, inside the hook's 3 s), the group DEFERRED (nothing told, sigStale), the loop free (${late.j.maxHeld} ms at most)`, { ms: late.ms, stale: sB._sigStale, over: late.j.over });
await sleep(FILES * SLOWER_MS * 1.6);   // the read lands
const after = await measure('after', () => rigS.prompt('B'));
ok(after.j.ok && after.r.includes(gid) && !sB._sigStale, `the next turn tells the group (the read that landed after the mark answers) — never dropped; the loop free (${after.j.maxHeld} ms at most)`, { ms: after.ms, ctx: after.r.slice(0, 160) });
slower.close();

clearInterval(tickT);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
