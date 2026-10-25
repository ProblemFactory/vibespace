#!/usr/bin/env node
// A BROADCAST CARRIES THE CHANGE, NEVER THE STORE (lane task-group-fanout, 2026-10-24). Measured on the owner's instance:
// every Activity line / Backlog item / bind sent EVERY Task Group whole — 1.57 MB of JSON to every WebSocket client, 267
// times a day — and every `vibespace-status` all 500 status records (106 KB). In-process, no server, no child:
//   §1 the PURE delta (src/task-delta.js): a group's change against what was sent, applied back; the order rule
//      (mirrorVerdict / fetchVerdict); what a frame concerns (touches / metaChanged); the status delta
//   §2 THE FAN-OUT (src/server/task-fanout.js) over a REAL store: a seeded walk of 240 store writes (every writer) with
//      flushes at random points — a client mirror that takes only the frames equals tasks.list() after every frame;
//      a burst is ONE frame; GET's mark flushes first; a missed frame / another boot / an oversized frame ⇒ re-fetch
//   §3 session-status-updated = the touched keys: a mirror over a seeded walk (every writer + the 500-record bound's
//      prune) equals snapshot() after every frame; the history clear still names what it touched
//   §4 the measurement on the owner's shape (6 groups, 500 Activity entries WITH detail, 750 members): bytes per
//      Activity line and per status, base vs now, and which open windows repaint for an Activity line (printed)
// Run: node scripts/test-task-group-fanout.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const TD = require('../src/task-delta.js');
const FANOUT = require('../src/server/task-fanout.js');
const { TaskGroupManager } = require('../src/task-groups.js');
const { SessionStatusManager } = require('../src/session-status.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const J = (v) => JSON.stringify(v);
// a group's equality, field by field (a rebuilt group's keys arrive in another order — no reader keys on that order)
const C = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-fanout-'));
// mulberry32 — a seeded walk (an LCG degenerates in doubles)
const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// a fake clock for the fan-out's coalescing timer (no wall clock in a fast suite)
const fakeTimers = () => { let next = null; return { setTimer: (fn) => { next = fn; return { unref() { } }; }, clearTimer: () => { next = null; }, fire: () => { const f = next; next = null; if (f) f(); }, armed: () => !!next }; };

// ════════ §1 the PURE delta ════════
console.log('§1 src/task-delta.js (PURE)');
{
  const g0 = { id: 'T-1-a', title: 'a', objective: 'o', color: null, createdAt: 1, updatedAt: 1, contentUpdatedAt: 1, ctx: [], progress: [{ id: 'P-1', at: 1, note: 'one', detail: 'd1' }], backlog: [{ id: 'B-1', text: 'x', status: 'open' }], sessions: ['claude:a'] };
  const first = TD.groupChange(undefined, g0);
  ok(first.change && first.change.patch.title === 'a' && first.change.patch.createdAt === 1 && J(first.change.patch.progress) === J(g0.progress) && J(first.change.patch.sessions) === '["claude:a"]' && C(TD.applyGroupPatch(null, first.change)) === C(g0),
    'a group nobody holds yet travels WHOLE (every field, every entry) and is rebuilt exactly');
  ok(TD.groupChange(first.sent, g0).change === null, 'nothing moved ⇒ no change at all');
  const g1 = { ...g0, updatedAt: 2, contentUpdatedAt: 2, progress: [...g0.progress, { id: 'P-2', at: 2, note: 'two' }] };
  const c1 = TD.groupChange(first.sent, g1);
  ok(J(Object.keys(c1.change.patch).sort()) === J(['contentUpdatedAt', 'progress', 'updatedAt']) && c1.change.patch.progress.length === 1 && c1.change.patch.progress[0].id === 'P-2' && J(c1.change.counts) === J({ open: 1, backlog: 1, progress: 2, sessions: 1 }),
    'an Activity line ⇒ ONLY the entry added (+ the clocks and the counts) — never the 499 others', c1.change);
  const g2 = { ...g1, updatedAt: 3, progress: [{ ...g1.progress[0], note: '[cleared]', detail: undefined }, g1.progress[1]].map((p) => JSON.parse(J(p))), backlog: [{ id: 'B-2', text: 'y', status: 'open' }, { id: 'B-1', text: 'x', status: 'done' }], sessions: ['claude:b'], color: '#123456' };
  delete g2.objective;
  const c2 = TD.groupChange(c1.sent, g2);
  const p = c2.change.patch;
  ok(p.progressSet.length === 1 && p.progressSet[0].note === '[cleared]' && !p.progress && p.backlog.length === 2 && J(p.backlogOrder) === '["B-2","B-1"]' && J(p.sessions) === '["claude:b"]' && J(p.sessionsRemoved) === '["claude:a"]' && p.color === '#123456' && J(p.unset) === '["objective"]',
    'a clear in place (progressSet), a Backlog item added + changed + the order moved, a member in / out, a field set, a field gone (unset)', p);
  ok(C(TD.applyGroupPatch(TD.applyGroupPatch(TD.applyGroupPatch(null, first.change), c1.change), c2.change)) === C(g2), 'the three changes applied in order rebuild the group exactly');
  const g3 = { ...g2, updatedAt: 4, progress: g2.progress.slice(1).concat([{ id: 'P-3', at: 4, note: 'three' }]) };
  const c3 = TD.groupChange(c2.sent, g3);
  ok(J(c3.change.patch.progressDropped) === '["P-1"]' && c3.change.patch.progress.length === 1 && C(TD.applyGroupPatch(g2, c3.change)) === C(g3), 'the live list trimmed from its front (an entry archived) ⇒ progressDropped + the new one', c3.change.patch);
  const g4 = { ...g3, updatedAt: 5, progress: [g3.progress[1], g3.progress[0]] };
  const c4 = TD.groupChange(c3.sent, g4);
  ok(Array.isArray(c4.change.patch.progressAll) && C(TD.applyGroupPatch(g3, c4.change)) === C(g4), 'an order the patch cannot express (an import reordered it) ⇒ the whole log once (progressAll)');
  ok(TD.groupChange(c3.sent, { ...g3, title: 'renamed', progress: [{ id: 'P-9', note: 'not compared' }] }, { deep: false }).change.patch.title === 'renamed' && !TD.groupChange(c3.sent, { ...g3, progress: [] }, { deep: false }).change,
    'deep:false (a group no write named) compares the fields only — its derived fields still travel, its logs are never read');
  ok(TD.applyGroupPatch(null, { id: 'T-x', patch: { progress: [] } }) === null && TD.applyTasksDelta([], { changed: [{ id: 'T-x', patch: { progress: [] } }] }) === null && TD.applyTasksDelta([g0], { refetch: true }) === null,
    'a PART of a group the mirror does not hold, or a refetch frame ⇒ null (re-fetch, never a guessed group)');
  const r = TD.applyTasksDelta([g0, { id: 'T-0', title: 'z', createdAt: 0 }], { changed: [c1.change], removed: ['T-0'] });
  ok(r && r.tasks.length === 1 && r.tasks[0].progress.length === 2 && J([...r.ids].sort()) === '["T-0","T-1-a"]', 'a frame over the list: the changed group patched, the removed one gone, the ids it concerned');
  // the order rule
  const M = { loaded: true, epoch: 100, seq: 5 };
  const v = (mark, msg) => TD.mirrorVerdict(mark, msg);
  ok(v(null, { epoch: 100, base: 5, seq: 6 }) === 'hold' && v({ loaded: false }, { epoch: 100, base: 5, seq: 6 }) === 'hold', 'not loaded yet ⇒ HOLD (kept until the fetch lands)');
  ok(v(M, { epoch: 100, base: 5, seq: 6 }) === 'apply' && v(M, { epoch: 100, base: 4, seq: 5 }) === 'drop' && v(M, { epoch: 100, base: 6, seq: 7 }) === 'refetch' && v(M, { epoch: 101, base: 0, seq: 1 }) === 'refetch' && v(M, { epoch: 99, base: 9, seq: 10 }) === 'drop' && v(M, { epoch: 100, base: 5, seq: 6, refetch: true }) === 'refetch' && v(M, { type: 'tasks-updated' }) === 'refetch',
    'loaded: exactly next ⇒ apply · already in ⇒ drop · a gap / another boot / a refetch frame / no order ⇒ refetch · an older boot ⇒ drop');
  const f = (mark, a) => TD.fetchVerdict(mark, a);
  ok(f(null, { epoch: 1, seq: 0 }) === 'replace' && f(M, { epoch: 100, seq: 5 }) === 'replace' && f(M, { epoch: 100, seq: 4 }) === 'drop' && f(M, { epoch: 101, seq: 0 }) === 'replace' && f(M, { epoch: 99, seq: 50 }) === 'drop' && f(M, null) === 'drop',
    'a GET answer: replaces unless the mirror already holds a NEWER frame (the R4 rule in the hub\'s order) — another boot replaces, an older boot never');
  const fsx = (mark, msg, o) => TD.frameStep(mark, msg, o);
  ok(fsx(M, { epoch: 100, base: 5, seq: 6 }) === 'apply' && fsx(M, { epoch: 100, base: 4, seq: 5 }) === 'drop' && fsx(null, { epoch: 100, base: 5, seq: 6 }) === 'hold' && fsx(M, { epoch: 100, base: 7, seq: 8 }) === 'refetch' && fsx(M, { epoch: 100, base: 7, seq: 8 }, { replayed: true }) === 'cover' && fsx(M, { type: 'tasks-updated' }) === 'refresh' && fsx(null, { type: 'tasks-updated' }) === 'refresh',
    'frameStep (what the bundle\'s mirror DOES): apply / drop / hold / refetch — a REPLAYED frame that still does not follow is covered (never held twice), an unordered frame only asks for a fetch');
  ok(TD.touches({ changed: [{ id: 'a' }], removed: [] }, 'a') && !TD.touches({ changed: [{ id: 'a' }], removed: [] }, 'b') && TD.touches({ changed: [], removed: ['b'] }, 'b') && TD.touches({ refetch: true }, 'b') && TD.touches({ type: 'tasks-updated' }, 'b'),
    'touches: its own group, its removal, a refetch / unordered frame (re-read everything)');
  ok(!TD.metaChanged({ changed: [c1.change], removed: [] }) && TD.metaChanged({ changed: [c2.change], removed: [] }) && TD.metaChanged({ changed: [], removed: ['x'] }) && TD.metaChanged({ refetch: true }),
    'metaChanged: an Activity line / clocks ⇒ false (the board and the rosters stay); a member, a colour, a removal, a refetch ⇒ true');
  const st = { 'claude:a': { state: 'working' }, 'claude:b': { state: 'done' } };
  const d = TD.statusChange(['claude:a', 'claude:gone'], st);
  ok(J(d) === J({ statuses: { 'claude:a': { state: 'working' } }, removed: ['claude:gone'] }) && J(TD.applyStatusDelta({ 'claude:gone': {}, 'claude:b': { state: 'done' } }, d)) === J({ 'claude:b': { state: 'done' }, 'claude:a': { state: 'working' } }),
    'the status delta: the touched keys\' records, the touched keys gone as `removed`; applied over a map');
}

// ════════ §2 THE FAN-OUT over a real store ════════
console.log('§2 the fan-out (src/server/task-fanout.js) over a real TaskGroupManager');
{
  const dataDir = path.join(tmp, 'walk');
  fs.mkdirSync(dataDir, { recursive: true });
  let fan = null;
  const tasks = new TaskGroupManager({ dataDir, onChange: (ch) => fan && fan.note(ch && ch.ids), getSetting: () => undefined });
  const frames = [];
  const T = fakeTimers();
  fan = FANOUT.create({ list: () => tasks.list(), send: (json) => frames.push(JSON.parse(json)), setTimer: T.setTimer, clearTimer: T.clearTimer, now: () => 1792900000000 });
  // a client: the sidebar's rule (src/lib/sidebar-tasks.js _onTasksDelta / _fetchTasks) over the PURE functions
  // `step` = the decision (TD.frameStep; a CONTROL passes the pre-fix rule); `failNext` = the next fetch fails (a 503)
  const client = (step = TD.frameStep, { preFix = false } = {}) => {
    const c = { tasks: [], mark: null, held: [], fetches: 0, failNext: 0 };
    c.fetch = () => {
      if (++c.fetches > 50) throw new Error('fetch loop');
      if (c.failNext > 0) { c.failNext--; return; }
      const a = { tasks: tasks.list(), ...fan.mark() };
      if (TD.fetchVerdict(c.mark, a) === 'replace') { c.tasks = JSON.parse(J(a.tasks)); c.mark = { loaded: true, epoch: a.epoch, seq: a.seq }; }
      for (const m of c.held.splice(0)) c.take(m, true);
    };
    c.take = (m, replayed = false) => {
      const st = step(c.mark, m, { replayed });
      if (st === 'refresh' || st === 'cover') return c.fetch();
      if (st === 'hold') { c.held.push(m); return c.fetch(); }   // (the model's fetch is synchronous: never «in flight»)
      if (st === 'drop') return;
      const r = st === 'apply' ? TD.applyTasksDelta(c.tasks, m) : null;
      if (!r && replayed && !preFix) return c.fetch();
      if (!r) { c.mark = null; c.held.push(m); return c.fetch(); }
      c.tasks = r.tasks; c.mark = { loaded: true, epoch: m.epoch, seq: m.seq };
    };
    return c;
  };
  const A = client(); A.fetch();
  const rnd = rngOf(20261024);
  const pick = (l) => l[Math.floor(rnd() * l.length)];
  const ids = () => Object.keys(tasks._state.tasks);
  const writers = {
    create: () => tasks.create({ title: 'g' + Math.floor(rnd() * 1e6), objective: 'o' }),
    title: () => tasks.update(pick(ids()), { title: 't' + Math.floor(rnd() * 1e6) }),
    objective: () => tasks.update(pick(ids()), { objective: 'obj ' + rnd().toString(36) }),
    color: () => tasks.update(pick(ids()), { color: pick(['#112233', '#445566', null]) }),
    ctx: () => tasks.update(pick(ids()), { ctx: rnd() < 0.5 ? [] : [{ path: path.join(tmp, 'ctx-' + Math.floor(rnd() * 3)), tell: 'names' }] }),
    progress: () => tasks.addProgress(pick(ids()), { note: 'n ' + rnd().toString(36), ...(rnd() < 0.5 ? { detail: 'detail '.repeat(1 + Math.floor(rnd() * 40)) } : {}), session: 'claude:s' + Math.floor(rnd() * 9) }),
    backlog: () => { const id = pick(ids()); const bl = tasks.get(id).backlog.slice(); if (bl.length && rnd() < 0.3) bl.splice(Math.floor(rnd() * bl.length), 1); else if (bl.length && rnd() < 0.5) bl[0] = { ...bl[0], status: 'done' }; else bl.push({ text: 'item ' + rnd().toString(36), status: 'open' }); if (rnd() < 0.2) bl.reverse(); tasks.update(id, { backlog: bl }); },
    bind: () => tasks.bind(pick(ids()), 'claude:k' + Math.floor(rnd() * 30)),
    unbind: () => { const id = pick(ids()); const s = tasks.get(id).sessions; if (s.length) tasks.unbind(id, pick(s)); },
    archived: () => tasks.unbindKeys(['claude:k' + Math.floor(rnd() * 30)]),
    clear: () => { const id = pick(ids()); const pr = tasks.get(id).progress; if (pr.length) tasks.clearProgress(id, [pick(pr).id], { by: 'owner' }); },
    remove: () => { if (ids().length > 3) tasks.remove(pick(ids())); },
  };
  for (let i = 0; i < 4; i++) writers.create();
  T.fire(); for (const m of frames) A.take(m);
  const kinds = Object.keys(writers);
  let checks = 0, bad = null, coalescedFrames = 0, writes = 0;
  for (let i = 0; i < 240 && !bad; i++) {
    const k = kinds[i % kinds.length] === 'remove' && rnd() < 0.7 ? 'progress' : kinds[Math.floor(rnd() * kinds.length)];
    writers[k](); writes++;
    if (rnd() < 0.35) {
      const n0 = frames.length; T.fire(); for (const m of frames.slice(n0)) A.take(m); coalescedFrames += frames.length - n0;
      checks++;
      if (C(A.tasks) !== C(tasks.list())) bad = { at: i, writer: k, mirror: A.tasks.length, store: tasks.list().length };
    }
  }
  T.fire(); for (const m of frames.slice(-1)) A.take(m);
  ok(!bad && checks > 60 && C(A.tasks) === C(tasks.list()) && A.fetches === 1, `a seeded walk of ${writes} writes (every writer) — the client mirror that takes only the frames equals tasks.list() at all ${checks} checks; ONE fetch (the first)`, bad);
  ok(frames.every((m, i) => m.type === 'tasks-updated' && m.seq === i + 1 && m.base === i && m.epoch === 1792900000000) && coalescedFrames < writes, `${frames.length} frames for ${writes} writes, numbered contiguously in this boot (seq = base + 1)`);
  // a burst is ONE frame; a frame for an Activity line carries that line only
  const n0 = frames.length;
  const gid = ids()[0];
  for (let i = 0; i < 20; i++) tasks.addProgress(gid, { note: 'burst ' + i, detail: 'x'.repeat(200) });
  ok(frames.length === n0 && T.armed(), 'a burst of 20 Activity lines sends NOTHING until the coalescing timer fires (the store writes stayed synchronous)');
  T.fire();
  const burst = frames[frames.length - 1];
  ok(frames.length === n0 + 1 && burst.changed.length === 1 && burst.changed[0].patch.progress.length === 20 && !('backlog' in burst.changed[0].patch) && !('title' in burst.changed[0].patch), '…then ONE frame: that group, the 20 entries, nothing else', Object.keys(burst.changed[0].patch));
  A.take(burst);
  // GET flushes first: a write pending at the GET is in the answer AND its frame is out before it, at the seq it answers
  tasks.addProgress(gid, { note: 'pending at the GET' });
  const B = client(); B.fetch();
  ok(frames.length === n0 + 2 && B.mark.seq === frames[frames.length - 1].seq && B.tasks.find((t) => t.id === gid).progress.some((pp) => pp.note === 'pending at the GET') && !T.armed(), 'GET /api/tasks\'s mark flushes the pending write first — the answer sits exactly at the frame that carried it');
  A.take(frames[frames.length - 1]);
  // a client that MISSED a frame re-fetches; another boot re-fetches; an oversized frame says refetch
  const Cl = client(); Cl.fetch();
  tasks.update(gid, { title: 'missed' }); T.fire();
  tasks.update(gid, { title: 'after the miss' }); T.fire();
  const fetches0 = Cl.fetches;
  Cl.take(frames[frames.length - 1]);
  ok(Cl.fetches === fetches0 + 1 && C(Cl.tasks) === C(tasks.list()), 'a client that MISSED a frame (a reconnect) re-fetches at the next one — never a stale mirror');
  const big = FANOUT.create({ list: () => tasks.list(), send: (json) => frames.push(JSON.parse(json)), setTimer: T.setTimer, clearTimer: T.clearTimer, byteCap: 2000, now: () => 1792900000001 });
  big.mark(); fan = big;
  for (let i = 0; i < 30; i++) tasks.addProgress(gid, { note: 'import ' + i, detail: 'y'.repeat(300) });
  T.fire();
  const over = frames[frames.length - 1];
  const D = { ...client(), mark: { loaded: true, epoch: 1792900000001, seq: 0 } };
  ok(over.refetch === true && J(over.changed) === J([{ id: gid }]) && TD.mirrorVerdict(D.mark, over) === 'refetch' && TD.mirrorVerdict({ loaded: true, epoch: 1792900000000, seq: 99 }, over) === 'refetch',
    'a frame over the byte cap says `refetch` (the ids only); a client of the OLD boot re-fetches too', over);
  tasks.remove(gid); T.fire();
  ok(J(frames[frames.length - 1].removed) === J([gid]) && frames[frames.length - 1].changed.length === 0, 'a group deleted ⇒ `removed: [id]`');
  // the glue's edges (heavy test-task-detail-chrome found the first: a synthetic {type:'tasks-updated'} was held, re-fetched,
  // replayed and held again — a fetch loop that reset Session Properties' 300 ms render for ever)
  const E = client(); E.fetch(); const e0 = E.fetches;
  E.take({ type: 'tasks-updated' });
  ok(E.fetches === e0 + 1 && E.held.length === 0 && C(E.tasks) === C(tasks.list()), 'an UNORDERED frame (a suite\'s synthetic one): ONE fetch, nothing held — no loop');
  const preFix = (mark, msg) => { const vv = TD.mirrorVerdict(mark, msg); return vv; };   // the first cut: every non-apply ⇒ hold + refetch, replays too
  const Ctl = client(preFix, { preFix: true }); Ctl.fetch();
  let looped = false; try { Ctl.take({ type: 'tasks-updated' }); } catch (e) { looped = /fetch loop/.test(e.message); }
  ok(looped, 'RED CONTROL: the pre-fix step (an unordered frame held and replayed) fetches without end');
  const F = client(); F.fetch();
  tasks.update(ids()[0], { title: 'gap' }); T.fire();
  const gapFrame = frames[frames.length - 1];
  F.mark = { ...F.mark, seq: F.mark.seq - 1 };   // F missed one frame…
  F.failNext = 1;                                // …and its re-fetch fails (a 503 during a restart)
  F.take(gapFrame);
  ok(F.mark === null && F.held.length === 1, 'a gap whose re-fetch FAILED: the mirror unloaded, the frame held');
  tasks.update(ids()[0], { title: 'next' }); T.fire();
  F.take(frames[frames.length - 1]);
  ok(F.mark && F.held.length === 0 && C(F.tasks) === C(tasks.list()), 'the NEXT frame (held, no fetch on its way) asks again — the mirror heals without waiting for a reconnect');
}

// ════════ §3 session-status-updated = the touched keys ════════
console.log('§3 session-status-updated carries the keys a write touched');
{
  const dataDir = path.join(tmp, 'status');
  fs.mkdirSync(dataDir, { recursive: true });
  const frames = [];
  const ss = new SessionStatusManager({ dataDir, onChange: (statuses, extra) => frames.push(JSON.parse(J({ type: 'session-status-updated', statuses, ...(extra && extra.sync), ...(extra && Array.isArray(extra.cleared) ? { cleared: extra.cleared } : {}) }))) });
  const mirror = { map: JSON.parse(J(ss.snapshot())), mark: { loaded: true, ...ss.syncMark() } };
  const take = (m) => { const vv = TD.mirrorVerdict(mirror.mark, m); if (vv !== 'apply') return vv; mirror.map = TD.applyStatusDelta(mirror.map, m); mirror.mark = { loaded: true, epoch: m.epoch, seq: m.seq }; return vv; };
  const rnd = rngOf(77);
  const key = () => 'claude:k' + Math.floor(rnd() * 40);
  let bad = null, n = 0, maxKeys = 0;
  for (let i = 0; i < 400 && !bad; i++) {
    const r = rnd();
    if (r < 0.4) ss.setByAgent(key(), { state: 'working', reason: 'r' + i });
    else if (r < 0.55) ss.setByUser(key(), { state: 'blocked' });
    else if (r < 0.65) ss.clear(key(), rnd() < 0.5 ? 'user' : 'agent');
    else if (r < 0.75) { try { ss.pushNotice(key(), { kind: 'status-override', agent: { state: 'working' }, user: null }); } catch { } }
    else if (r < 0.85) ss.consumeNotices(key());
    else if (r < 0.92) ss.rekey('webui:' + Math.floor(rnd() * 5), key());
    else ss.setByAgent('webui:' + Math.floor(rnd() * 5), { state: 'review' });
    while (n < frames.length) { maxKeys = Math.max(maxKeys, Object.keys(frames[n].statuses).length + frames[n].removed.length); if (take(frames[n]) !== 'apply') bad = { at: i, frame: frames[n] }; n++; }
    if (!bad && J(mirror.map) !== J(ss.snapshot())) bad = { at: i, why: 'mirror differs' };
  }
  ok(!bad && frames.length > 300 && maxKeys <= 2, `a seeded walk of 400 writes (every writer): ${frames.length} frames, each with ≤ ${maxKeys} keys, all contiguous — the mirror equals snapshot() after every one`, bad);
  // the 500-record bound prunes the oldest: the frame names them gone
  const many = new SessionStatusManager({ dataDir: path.join(tmp, 'many'), onChange: (statuses, extra) => frames.push({ statuses, ...extra.sync }) });
  for (let i = 0; i < 500; i++) many.setByAgent('claude:m' + i, { state: 'working' });
  const before = frames.length;
  many.setByAgent('claude:m500', { state: 'done' });
  const pr = frames[before];
  ok(J(Object.keys(pr.statuses)) === '["claude:m500"]' && J(pr.removed) === '["claude:m0"]' && Object.keys(many.snapshot()).length === 500, 'the 500-record bound: the pruned oldest key rides the frame as `removed` (a client mirror never keeps it)', { statuses: Object.keys(pr.statuses), removed: pr.removed });
  const fs0 = TD.fetchVerdict({ loaded: true, ...many.syncMark() }, { ...many.syncMark() });
  ok(fs0 === 'replace' && many.syncMark().seq === 501, 'GET /api/session-status answers syncMark() — the seq of the last frame (a fetch answered then replaces a mirror at it)');
}

// ════════ §4 the measurement on the owner's shape ════════
console.log('§4 the measurement (the owner\'s shape: 6 groups, 500 Activity entries WITH detail, 750 members)');
{
  const dataDir = path.join(tmp, 'shape');
  fs.mkdirSync(dataDir, { recursive: true });
  const rnd = rngOf(1557);
  const words = 'lane verify census harness restart marks budget index folder shared context hook inject session group report gate suite fixture control'.split(' ');
  const text = (n) => { let s = ''; while (s.length < n) s += words[Math.floor(rnd() * words.length)] + ' '; return s.slice(0, n); };
  const SHAPES = [{ p: 500, d: 1500, m: 750, b: 40 }, { p: 500, d: 700, m: 120, b: 60 }, { p: 300, d: 500, m: 60, b: 10 }, { p: 120, d: 300, m: 30, b: 5 }, { p: 76, d: 200, m: 12, b: 0 }, { p: 20, d: 100, m: 4, b: 2 }];
  const doc = { version: 1, tasks: {} };
  SHAPES.forEach((sh, gi) => {
    const id = `T-261001-shape-${gi}`;
    doc.tasks[id] = { id, title: 'Group ' + gi, kind: 'task', archived: false, objective: text(375), ctx: [], createdAt: gi + 1, updatedAt: gi + 1, contentUpdatedAt: gi + 1, colorSeq: gi,
      sessions: Array.from({ length: sh.m }, (_, i) => `claude:${(gi * 10000 + i).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`),
      backlog: Array.from({ length: sh.b }, (_, i) => ({ id: `B-${gi}${String(i).padStart(3, '0')}`, text: text(290), status: i % 4 ? 'open' : 'done', priority: 'normal', claimedBy: [], detail: text(600) })),
      progress: Array.from({ length: sh.p }, (_, i) => ({ id: `P-${gi}${String(i).padStart(5, '0')}`, at: 1792000000000 + i * 60000, note: text(190), detail: text(Math.floor(sh.d * (0.4 + rnd()))), session: 'claude:x' })) };
  });
  fs.writeFileSync(path.join(dataDir, 'task-groups.json'), J(doc));
  let fan = null;
  const tasks = new TaskGroupManager({ dataDir, onChange: (ch) => fan && fan.note(ch && ch.ids), getSetting: () => undefined });
  const frames = [];
  const T = fakeTimers();
  fan = FANOUT.create({ list: () => tasks.list(), send: (json) => frames.push(json), setTimer: T.setTimer, clearTimer: T.clearTimer });
  fan.mark();
  const lane = 'T-261001-shape-0';
  tasks.addProgress(lane, { note: text(190), detail: text(1500), session: 'claude:x' });
  const baseBytes = J({ type: 'tasks-updated', tasks: tasks.list() }).length;   // what server.js sent before this lane (the whole list)
  T.fire();
  const nowBytes = frames[frames.length - 1].length;
  tasks.addProgress(lane, { note: text(190), session: 'claude:x' });
  const f0 = process.hrtime.bigint();
  T.fire();
  const flushMs = Number(process.hrtime.bigint() - f0) / 1e6;   // printed only (a cost claim is a census, never a fast suite's bound)
  const nowBytesNoDetail = frames[frames.length - 1].length;
  const kb = (b) => (b / 1024).toFixed(1) + ' KB';
  console.log(`    one Activity line in the lanes group: base ${kb(baseBytes)} to every client · now ${kb(nowBytes)} (with a 1.5 KB detail) / ${kb(nowBytesNoDetail)} (a one-liner); the hub's flush (list + the named group's diff) ${flushMs.toFixed(1)} ms, once for every client`);
  ok(baseBytes > 1.4 * 1024 * 1024 && nowBytes < 4 * 1024 && nowBytesNoDetail < 1024, `bytes per Activity line: ${kb(baseBytes)} (the whole store, base) → ${kb(nowBytes)} — the line, its counts and clocks`, { baseBytes, nowBytes, nowBytesNoDetail });
  // which open windows repaint for it (each consumer's own filter, src/lib/*: the board + rosters ask metaChanged, a group's
  // windows ask touches): the owner's desk — the board, the lanes group's Task window + log, two other groups' windows,
  // Session Properties, a principal picker, the browser trace view
  const msg = JSON.parse(frames[frames.length - 1]);
  const desk = [['the board (sidebar Tasks tab)', () => TD.metaChanged(msg)], ['Task Group window — the lanes group', () => TD.touches(msg, lane) || TD.metaChanged(msg)], ['Task log — the lanes group', () => TD.touches(msg, lane)],
    ['Task Group window — group 1', () => TD.touches(msg, 'T-261001-shape-1') || TD.metaChanged(msg)], ['Task log — group 2', () => TD.touches(msg, 'T-261001-shape-2')], ['Session Properties', () => TD.metaChanged(msg)], ['a principal picker', () => TD.metaChanged(msg)], ['the browser trace view', () => TD.metaChanged(msg)]];
  const now = desk.filter(([, f]) => f()).map(([n]) => n);
  console.log(`    repaints for that line on the owner's desk (${desk.length} open surfaces): base ${desk.length} (every one) · now ${now.length} — ${now.join(', ')}`);
  ok(now.length === 2 && now.every((n) => n.includes('the lanes group')), `an Activity line repaints ${now.length} of ${desk.length} open surfaces (its own group's window + log), not all ${desk.length}`, now);
  // the status records
  const ss = new SessionStatusManager({ dataDir, onChange: (statuses, extra) => frames.push(J({ type: 'session-status-updated', statuses, ...(extra && extra.sync) })) });
  for (let i = 0; i < 500; i++) ss.setByAgent(`claude:${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, { state: 'working', reason: text(120), detail: text(60) });
  const statusBase = J({ type: 'session-status-updated', statuses: ss.snapshot() }).length;
  ss.setByAgent('claude:00000007-0000-4000-8000-000000000000', { state: 'review', reason: text(120) });
  const statusNow = frames[frames.length - 1].length;
  console.log(`    one vibespace-status over 500 records: base ${kb(statusBase)} · now ${kb(statusNow)}`);
  ok(statusBase > 90 * 1024 && statusNow < 1024, `bytes per vibespace-status: ${kb(statusBase)} (every record, base) → ${kb(statusNow)} (the one record)`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
