#!/usr/bin/env node
// test-jobs-away-roads — row B-d8f4 unit 4a (lane bl-jobs): the legs B-2566's cure did not write (round wem0s6k1d, 主开发 r440),
// each with its RED (an anchored copy of the engine loaded by the REAL wiring file, or of the record-clear door):
//   (a) A RESTART: the away episode's count goes ON across it, and an item a person closed STAYS closed after it;
//   (b) THE CLEAR CASCADE: a job's clear reaches its away-failed item by its jobId (the item's words go with the job's);
//   (c) THE RE-POST ROAD: a schedule failing once every ten minutes for a day (each failure past the duplicate window: a stash, an owed
//       wake, a renewal each time — production's ~144 a day) ⇒ ONE item, its count 144, the stash held at its cap.
// In-process (the wiring of src/server/jobs-wiring.js + a For-you store on scratch folders; the delivery ladder a stand-in).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wiring = require(path.join(ROOT, 'src/server/jobs-wiring.js'));
const { UserTodoManager } = require(path.join(ROOT, 'src/user-todos.js'));
const SW = require(path.join(ROOT, 'src/store-writer.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };
// a leg that judges prints every fact it judges (the .414 gates' rule) — on a pass too
const okP = (c, n, facts) => { ok(c, n, facts); if (c) console.log('    ' + JSON.stringify(facts)); };
const dirs = [];
const mkDir = (name) => { const d = scratch(name); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(path.join(d, 'bin'), { recursive: true }); dirs.push(d); return d; };
process.on('exit', () => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const settle = async (fn, ms = 3000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 5)); } return !!fn(); };
function fakeApp() { const routes = new Map(); const reg = (m) => (p, h) => routes.set(m + ' ' + p, h); return { app: { get: reg('GET'), post: reg('POST'), patch: reg('PATCH'), delete: reg('DELETE'), use() { } } }; }
const AWAY = { ok: false, reason: 'no live inbox for this conversation on any reachable machine', notRunning: true };
// the rig of test-jobs-triage §12 (B-2566), with a folder that may be an earlier rig's (a RESTART) and the ladder's owed-wake park
const rig = (name, wiringMod = wiring, dir = null) => {
  const d = dir || mkDir(name), todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 }), logs = [], wakes = [];
  const W = wiringMod.create({ app: fakeApp().app, dataDir: d, broadcastAll: () => { }, userTodos: todos, log: (...a) => logs.push(a.join(' ')), serverSetting: () => undefined, taskGroups: null, activeSessions: new Map(),
    deliver: {
      peerReachable: () => false, liveForWake: () => false,
      deliverToConversation: async () => AWAY,
      parkEndedWake: (cid, o) => { wakes.push({ cid, meta: o && o.meta }); return { parked: true, merged: wakes.filter((w) => w.cid === cid).length > 1 }; },
    } });
  W.initAfterListen();
  return { dir: d, W, jm: W.jm, todos, logs, wakes, stop: () => { W.shutdown?.(); todos.stop(); } };
};
const owner = (cid) => ({ conversation: { backend: 'claude', id: cid }, sessionId: 's-' + cid, sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] });
const task = (R, id, name, cid, extra = {}) => { const j = { id, kind: 'task', name, note: '', state: 'failed', desiredUp: false, owner: owner(cid), access: { view: 'group', control: 'session' }, runs: [{ startedAt: Date.now() - 60e3, endedAt: Date.now(), exit: 1, cause: 'error', lastLine: 'Error: frame 7 failed to render' }], notifyLog: [], ...extra }; R.jm.jobs.set(id, j); return j; };
const schedule = (R, id, name, cid) => { const c = { id, kind: 'cron', name, state: 'scheduled', owner: owner(cid), access: { view: 'group', control: 'session' }, runs: [], notifyLog: [] }; R.jm.jobs.set(id, c); return c; };
const failOf = (R, j, what = 'failed exit=1 error (1m)') => R.jm._notifyOwner(j, { what, wake: 'result' });
const awayItems = (R, cid) => { const s = R.todos.snapshot(); return [...s.open, ...s.resolved].filter((i) => i.sessionKey === `claude:${cid}` && i.jobFact === 'away-failed'); };
const cidOf = (n) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const landed = () => { const r = SW.storeWriter().flushSync(); if (r.deferred || (r.left && r.left.length)) throw new Error('the store writer left owed writes: ' + JSON.stringify(r.left || 'deferred')); };
// RED copies: anchored copies of the ENGINE loaded by the REAL wiring file (the For-you store hands its filer key only to that file)
const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8'), RCSRC = fs.readFileSync(path.join(ROOT, 'src/server/record-clear.js'), 'utf8');
const MC = mutantCopies('jobs-away-roads', ROOT);
const WIRING_PATH = path.join(ROOT, 'src/server/jobs-wiring.js'), JOBS_PATH = path.join(ROOT, 'src/jobs.js');
const wiringWith = (jobsSrc, tag) => {
  const mut = MC.load('src/jobs.js', jobsSrc, tag), keepW = require.cache[WIRING_PATH], keepJ = require.cache[JOBS_PATH];
  try { delete require.cache[WIRING_PATH]; require.cache[JOBS_PATH] = { id: JOBS_PATH, filename: JOBS_PATH, loaded: true, exports: mut, children: [], paths: [] }; return require(WIRING_PATH); }
  finally { if (keepW) require.cache[WIRING_PATH] = keepW; else delete require.cache[WIRING_PATH]; if (keepJ) require.cache[JOBS_PATH] = keepJ; else delete require.cache[JOBS_PATH]; }
};

try {
  // ── (a) A RESTART ───────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('(a) a restart: the away episode\'s count goes on, and an item a person closed stays closed');
  const restart = async (W1, W2, tag) => {
    const A = cidOf(0xa1 + tag.length);
    let R = rig('away-restart-' + tag, W1);
    const j = task(R, 'jb-away-rs1', 'nightly-render', A);
    failOf(R, j); await settle(() => awayItems(R, A).length === 1);
    failOf(R, j); await settle(() => j.awayFail && j.awayFail.count === 2);   // the same words within 10 min: the duplicate branch COUNTS it
    const it = awayItems(R, A)[0], since = j.awayFail && j.awayFail.since;
    R.todos.setStatus(it.id, 'dismissed');   // a PERSON closes it this episode
    R.jm._save(); R.stop(); landed();
    R = rig('away-restart-' + tag, W2, R.dir);   // THE RESTART: a new engine and a new For-you store on the same data folder
    const j2 = R.jm.jobs.get('jb-away-rs1');
    if (j2) { failOf(R, j2); await settle(() => (j2.awayFail && j2.awayFail.count) === 3, 1500); }
    const items = awayItems(R, A), back = R.todos.get(it.id);
    const facts = { count: j2 && j2.awayFail && j2.awayFail.count, sinceKept: !!(j2 && j2.awayFail && j2.awayFail.since === since), items: items.length, status: back && back.status };
    R.stop();
    return facts;
  };
  const fa = await restart(wiring, wiring, 'real');
  okP(fa.count === 3 && fa.sinceKept && fa.items === 1 && fa.status === 'dismissed', 'across a RESTART the episode goes on (count 3 since its first failure) and the item the person closed STAYS closed — no second item', fa);
  const W_noAway = wiringWith(anchored(JSRC, "const storeBytes = (obj) => JSON.stringify(obj, (k, v) => (k.startsWith('_') ? undefined : v), 1);", "const storeBytes = (obj) => JSON.stringify(obj, (k, v) => (k.startsWith('_') || k === 'awayFail' ? undefined : v), 1);", 'red-episode-unsaved'), 'red-episode-unsaved');
  const far = await restart(W_noAway, W_noAway, 'red');
  okP(far.count !== 3 || far.status !== 'dismissed' || far.items !== 1, 'RED: the episode not kept on the record (a copy of the engine) — after the restart its count starts again and the closed item does not stay closed', far);

  // ── (b) THE CLEAR CASCADE ───────────────────────────────────────────────────────────────────────────────────────────
  console.log('(b) the clear cascade: a job\'s clear reaches its away-failed item by its jobId');
  const clearScene = async (RCmod, tag) => {
    const B = cidOf(0xb1 + tag.length), R = rig('away-clear-' + tag);
    const j = task(R, 'jb-away-cl1', 'render-the-quarterly-figures', B);
    failOf(R, j); await settle(() => awayItems(R, B).length === 1);
    const it = awayItems(R, B)[0], before = R.todos.get(it.id).text;
    const RC = RCmod.create({ userTodos: R.todos, getJobs: () => R.jm, log: () => { } });
    const r = await RC.clear({ kind: 'job', id: j.id }, { caller: { role: 'owner' } });
    const after = R.todos.get(it.id);
    const facts = { answer: r, cleared: !!(r && r.ok && (r.cleared >= 1 || r.already >= 1)), itemCleared: !!(after && after.clearedAt), nameBefore: /render-the-quarterly-figures/.test(before || ''), nameAfter: /render-the-quarterly-figures/.test(JSON.stringify(after || {})) };
    R.stop();
    return facts;
  };
  const RCreal = require(path.join(ROOT, 'src/server/record-clear.js'));
  const fb = await clearScene(RCreal, 'real');
  okP(fb.cleared && fb.nameBefore && fb.itemCleared && !fb.nameAfter, 'a job\'s clear reaches its AWAY-FAILED item by its jobId: the item is cleared and the job\'s name leaves it with the job\'s', fb);
  const RCred = MC.load('src/server/record-clear.js', anchored(RCSRC, "        if (tIds.length) r.cascade = userTodos.clearItems(tIds, { by, at, allow: caller && caller.role === 'owner' ? null : verdictFor('todo', caller) });", '        // (no cascade)', 'red-no-cascade'), 'red-no-cascade');
  const fbr = await clearScene(RCred, 'red');
  okP(fbr.cleared && !fbr.itemCleared && fbr.nameAfter, 'RED: no cascade (a copy of the door) — the job is cleared and its away-failed item still carries its name', fbr);

  // ── (c) THE RE-POST ROAD ────────────────────────────────────────────────────────────────────────────────────────────
  console.log('(c) the re-post road: a failure every ten minutes for a day — a stash, an owed wake, a renewal each time');
  const repost = async (Wmod, tag, N) => {
    const C = cidOf(0xc1 + tag.length), R = rig('away-repost-' + tag, Wmod);
    const cron = schedule(R, 'jb-away-cron', 'export-every-ten-minutes', C), child = task(R, 'jb-away-cron-run', 'export-every-ten-minutes run', C, { cronParent: cron.id });
    const realNow = Date.now, base = realNow();
    try {
      for (let k = 0; k < N; k++) {
        const at = base + k * (600_000 + 1_000); Date.now = () => at;   // past the 10-minute duplicate window and the 30 s floor: the ladder's whole road each time
        failOf(R, child);
        await settle(() => (cron.awayFail && cron.awayFail.count) === k + 1);
      }
    } finally { Date.now = realNow; }
    const items = awayItems(R, C), stash = (R.jm.pendingNotifs.get(C) || []).length, suppressed = (child.notifyLog || []).filter((l) => l.lane === 'suppressed').length;
    const facts = { failures: N, items: items.length, count: cron.awayFail && cron.awayFail.count, itemCount: items[0] && items[0].i18n && items[0].i18n.text.params.count, stash, stashCap: 30, wakesAsked: R.wakes.filter((w) => w.cid === C).length, suppressed };
    R.stop();
    return facts;
  };
  const fc = await repost(wiring, 'real', 144);
  okP(fc.items === 1 && fc.count === 144 && fc.itemCount === '144' && fc.stash <= fc.stashCap && fc.wakesAsked === 144 && fc.suppressed === 0, 'a schedule failing every ten minutes for a day (144, each past the duplicate window: the ladder\'s road each time — stashed, a wake owed, the item renewed) ⇒ ONE item under the schedule, its count 144; the stash held at its cap', fc);
  const W_noCap = wiringWith(anchored(JSRC, 'const dropped = capUnclaimedNotifs(q);', 'const dropped = [];', 'red-stash-uncapped'), 'red-stash-uncapped');
  const fcr = await repost(W_noCap, 'red', 40);
  okP(fcr.stash > fcr.stashCap, 'RED: the stash uncapped (a copy of the engine) — every re-post stays in it (40 of 40 past its cap of 30)', fcr);
} catch (e) {
  fail++; console.error('  ✗ the suite threw: ' + ((e && e.stack) || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
