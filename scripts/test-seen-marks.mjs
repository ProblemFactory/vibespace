#!/usr/bin/env node
// THE HOOK INJECTION'S SEEN MARKS SURVIVE A RESTART + THE CONTEXT-FOLDER INDEX IS BUDGETED (B-86d3 ① ②, lane
// hook-seen-marks). In-process: the real setupAgentRoutes over a real TaskGroupManager in a temp dir, a Map as the
// session-meta store, and boot-restore's REAL sessionFromMeta (its source extracted and evaluated — the module itself
// pulls node-pty) as the restart.
//   §1 the PURE marks (src/seen-marks.js): round trip, a new build, no / foreign marks, bounds, the folder digest
//   §2 the restart legs on the real routes: marks written when an injection is SENT (once per change), a restart ⇒
//      only what changed is re-sent (the unchanged groups named in ONE line), a changed group as its DIFF (the lite
//      snapshot), a touched folder / a session holding too many items re-sent whole, no marks ⇒ today's full send, a new
//      build ⇒ the intros once, the preamble by its hash, the jobs cursor
//   §3 RED control: a copy of agent-routes without the persist call re-sends everything after a restart (the base)
//   §4 the budget table: the newest rows that fit + ONE pointer line, budget 0 / a small folder unchanged, the 100-file
//      cap, the rules part untouched, the setting, the 9600 B cap, `show --full` lists every file (belted)
//   §5 the measurement: 13 sessions × 3 groups in the real shape — bytes on the first turn after a restart, base vs
//      now, and each group's index bytes before / after the budget (printed; the report quotes it)
//   §6 lane task-group-fanout (the owner's constraint: what the model is told must not change): the Context read OFF the
//      main thread (a real SafeFs pool) vs the old synchronous walk — the same folder edits + turns, byte-identical
//      deliveries; the stale path (a read past its bound tells nothing new and moves no mark; the next turn tells all)
// Run: node scripts/test-seen-marks.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SEEN = require('../src/seen-marks.js');
const { TaskGroupManager } = require('../src/task-groups.js');
const ROUTES = require('../src/agent-routes.js');
const VERSION = require('../package.json').version;

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const B = (t) => Buffer.byteLength(String(t || ''), 'utf-8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-seenmarks-'));
const quiet = console.log;   // the routes' own [inject] journal lines are not the suite's output
const routeLog = [];
const hush = (fn) => { const l = console.log, w = console.warn; console.log = (...a) => routeLog.push(a.join(' ')); console.warn = (...a) => routeLog.push(a.join(' ')); try { return fn(); } finally { console.log = l; console.warn = w; } };

// ── boot-restore's REAL meta→session spelling (the one all three restore paths call) ──
const brSrc = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf-8');
const sfmSrc = (brSrc.match(/\nfunction sessionFromMeta\(meta, transportFacts\) \{[\s\S]*?\n\}\n/) || [''])[0];
const sessionFromMetaAt = (ver) => new Function('os', 'poolPinFromMeta', 'restoreMarks', 'BUILD_VERSION', `${sfmSrc}\nreturn sessionFromMeta;`)(os, () => null, SEEN.restoreMarks, ver);
const sessionFromMeta = sessionFromMetaAt(VERSION);

// ── the rig: the real routes, fakes for the rest, a Map as the session-meta store ──
const mkMeta = () => {
  const m = new Map(); let writes = 0;
  return { m, writes: () => writes, readSessionMeta: (k) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null), writeSessionMeta: (k, v) => { writes++; m.set(k, JSON.parse(JSON.stringify(v))); } };
};
function mkRig({ tasks, meta, settings = {}, userState = {}, jobs = null, routesMod = ROUTES }) {
  const routes = {};
  const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; }, put: () => {}, patch: () => {}, delete: () => {}, use: () => {} };
  const activeSessions = new Map();
  routesMod.setupAgentRoutes({
    app, activeSessions, tasks,
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], dropNotices: () => {}, rekey: () => {}, clear: () => null, setByUser: () => null, setByAgent: () => null, history: () => [] },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (s, id) => `claude:${id}`,
    serverSetting: (k) => settings[k],
    scheduleCtxSync: () => {},
    remoteCtxBaseFor: () => null,
    readUserState: () => userState,
    getJobs: () => jobs,
    getSessionMetaStore: () => meta,
  });
  const call = (route, id, query = {}) => {
    let out = null;
    const s = activeSessions.get(id);
    const req = { headers: { authorization: 'Bearer ' + s.agentToken }, query, body: {} };
    const res = { json: (o) => { out = o; }, status: () => res };
    hush(() => routes[`GET ${route}`](req, res));
    return out || {};
  };
  return { routes, activeSessions, call, prompt: (id) => call('/api/agent/prompt-context', id).context || '', start: (id) => call('/api/agent/task-context', id).context || '' };
}
// a live session as ws-create would hold it, and its meta file as the store holds it
const mkSession = (id, cwd) => ({ agentToken: `vsst_${id}`, backend: 'claude', cwd, name: id, sockName: `sock-${id}`, clients: new Map() });
const seedMeta = (meta, s) => meta.writeSessionMeta(s.sockName, { cwd: s.cwd, agentToken: s.agentToken, name: s.name });
// THE RESTART: a fresh routes closure (a new process) and the session rebuilt from its meta by sessionFromMeta
const restart = (rig0, meta, ids, opts = {}) => {
  const rig = mkRig({ ...opts, meta });
  for (const id of ids) {
    const m = meta.readSessionMeta(`sock-${id}`) || {};
    const s = (opts.from || sessionFromMeta)(m, { sockName: `sock-${id}`, backend: 'claude' });
    rig.activeSessions.set(id, s);
  }
  return rig;
};

// ════════ §1 the PURE marks ════════
console.log('§1 src/seen-marks.js (PURE)');
{
  const s = { _groupSeenAt: { 'T-a': 1000, 'T-b': 2000 }, _ctxSig: { 'T-a': 'x.md:10:1|y.md:20:2', 'T-b': '' }, _preambleSeen: 'abc123def456', _toolsIntroSeen: true, _mgrIntroSeen: true, _jobsEventsSeenTs: 77 };
  const m = SEEN.marksOf(s, '9.9.1');
  const r = SEEN.restoreMarks(JSON.parse(JSON.stringify(m)), '9.9.1');
  ok(JSON.stringify(r._groupSeenAt) === JSON.stringify(s._groupSeenAt) && r._preambleSeen === s._preambleSeen && r._toolsIntroSeen === true && r._mgrIntroSeen === true && r._jobsEventsSeenTs === 77 && r._marksRestored === true,
    'round trip under the same build: the groups\' instants, the preamble hash, both intros, the jobs cursor — and _marksRestored', r);
  ok(SEEN.isSigDigest(m.ctxSig['T-a']) && m.ctxSig['T-b'] === '' && !JSON.stringify(m).includes('x.md'), 'the folder signature is persisted as a DIGEST (no file names in the meta); an empty one stays empty', m.ctxSig);
  ok(SEEN.liveSig(r._ctxSig['T-a'], s._ctxSig['T-a']) === s._ctxSig['T-a'] && SEEN.liveSig(r._ctxSig['T-a'], 'x.md:10:1|y.md:21:3') === r._ctxSig['T-a'],
    'liveSig: a held digest becomes the live signature when the folder is unchanged, stays a digest (≠ any signature) when it changed');
  const r2 = SEEN.restoreMarks(m, '9.9.2');
  ok(r2._toolsIntroSeen === false && r2._mgrIntroSeen === false && r2._preambleSeen === 'abc123def456' && r2._groupSeenAt['T-b'] === 2000, 'a NEW build: the intros restore unseen (taught once again), the groups and the preamble hash keep', r2);
  ok(JSON.stringify(SEEN.restoreMarks(undefined, '9.9.1')) === '{}' && JSON.stringify(SEEN.restoreMarks({ v: 99, groupSeenAt: { a: 1 } }, '9.9.1')) === '{}' && JSON.stringify(SEEN.restoreMarks('junk', '9.9.1')) === '{}',
    'no marks / a foreign version / junk restore NOTHING (that session behaves as before: everything once)');
  const big = { _groupSeenAt: {}, _ctxSig: {} };
  for (let i = 0; i < 100; i++) { big._groupSeenAt['T-' + i] = i; big._ctxSig['T-' + i] = 'f' + i; }
  big._groupSeenAt['bad'] = 'nope';
  const mb = SEEN.marksOf(big, 'v');
  ok(Object.keys(mb.groupSeenAt).length === SEEN.MAX_GROUPS && mb.groupSeenAt['T-99'] === 99 && !('T-0' in mb.groupSeenAt) && !('bad' in mb.groupSeenAt) && Object.keys(mb.ctxSig).length === SEEN.MAX_GROUPS,
    `bounded: ≤ ${SEEN.MAX_GROUPS} groups, the newest by seen instant; a non-number instant dropped`);
  const rb = SEEN.restoreMarks({ v: 1, groupSeenAt: { 'T-x': 5, 'T-y': 'x' }, ctxSig: { 'T-x': 'raw|sig', 'T-z': '#00000000000000' }, preamble: 'p'.repeat(65), toolsIntro: 'v', mgrIntro: null, jobsTs: 'x' }, 'v');
  ok(rb._groupSeenAt['T-x'] === 5 && !('T-y' in rb._groupSeenAt) && !('T-x' in rb._ctxSig) && !('T-z' in rb._ctxSig) && rb._preambleSeen === undefined && rb._toolsIntroSeen === true && rb._jobsEventsSeenTs === undefined,
    'restore keeps only well-formed marks (a raw signature or a stray group is not a mark; an over-long hash is no hash)', rb);
  ok(JSON.stringify(SEEN.marksOf(s, '9.9.1')) === JSON.stringify(m), 'marksOf is deterministic for the same state (the route writes only on a difference)');
  // the LITE diff snapshot: only the items THIS session parked or claimed (the only ones the diff speaks of)
  const snap = { title: 'g', objHash: 'h'.repeat(12), contextDir: '/c', lastProgressAt: 9, backlog: [
    { id: 'B-1', text: 'mine parked', status: 'open', addedBy: 'claude:A', claimedBy: [] },
    { id: 'B-2', text: 'mine claimed', status: 'open', addedBy: 'claude:P', claimedBy: ['claude:A'] },
    { id: 'B-3', text: 'a peer\'s', status: 'open', addedBy: 'claude:P', claimedBy: ['claude:Q'] }] };
  const lite = SEEN.liteSnap(snap, 'claude:A');
  ok(lite && lite.backlog.map((b) => b.id).join() === 'B-1,B-2' && lite.of === 'claude:A' && lite.objHash === snap.objHash && lite.lastProgressAt === 9, 'liteSnap keeps the session\'s own items (parked or claimed) and the scalar fields', lite);
  const many = { ...snap, backlog: Array.from({ length: SEEN.SNAP_MAX_ITEMS + 1 }, (_, i) => ({ id: 'B-' + i, text: 'x', status: 'open', addedBy: 'claude:A', claimedBy: [] })) };
  ok(SEEN.liteSnap(many, 'claude:A') === null && SEEN.liteSnap(snap, null) === null && SEEN.liteSnap(null, 'claude:A') === null && SEEN.liteSnap({ ...snap, backlog: [{ id: 'B-9', text: 'x'.repeat(9000), addedBy: 'claude:A' }] }, 'claude:A') === null,
    `no lite snapshot past ${SEEN.SNAP_MAX_ITEMS} own items or ${SEEN.SNAP_MAX_BYTES} B, without a key or a snapshot (that group is re-sent whole once)`);
  const ms = SEEN.marksOf({ ...s, _groupSnap: { 'T-a': snap, 'T-b': many } }, '9.9.1', 'claude:A');
  const rs = SEEN.restoreMarks(JSON.parse(JSON.stringify(ms)), '9.9.1');
  ok(JSON.stringify(rs._groupSnap['T-a']) === JSON.stringify(lite) && !('T-b' in rs._groupSnap) && JSON.stringify(SEEN.marksOf({ ...s, ...rs }, '9.9.1', 'claude:A').snap) === JSON.stringify(ms.snap),
    'the lite snapshot rides the marks and comes back as _groupSnap (a restored one re-persists unchanged)');
  ok(!('T-a' in SEEN.restoreMarks({ ...ms, snap: { 'T-a': { ...lite, backlog: 'x' } } }, '9.9.1')._groupSnap), 'a malformed snapshot is not restored');
  // the wiring pins: ONE spelling in sessionFromMeta, called by all three restore paths
  ok(sfmSrc && /\n    \.\.\.restoreMarks\(meta\.seenMarks, BUILD_VERSION\), /.test(sfmSrc) && (brSrc.match(/= sessionFromMeta\(meta, \{/g) || []).length === 3
    && /const BUILD_VERSION = \(\(\) => \{ try \{ return require\('\.\.\/\.\.\/package\.json'\)\.version; \}/.test(brSrc),
    'WIRING PIN: boot-restore\'s sessionFromMeta spreads restoreMarks(meta.seenMarks, BUILD_VERSION) — the one meta→session spelling all three restore paths call');
}

// ── fixtures: groups in the REAL SHAPE (lengths and counts of the production store, 2026-10-14 — no contents) ──
const WORDS = 'lane verify census harness restart marks budget index folder shared context hook inject session group report gate suite fixture control'.split(' ');
const textOf = (n, seed) => { let out = '', i = seed; while (B(out) < n) out += (out ? ' ' : '') + WORDS[(i = (i * 7 + 3) % WORDS.length)]; return out.slice(0, n); };
const DAY = 86400000, T0 = Date.UTC(2026, 9, 14);
function mkFolder(dir, nFiles, nameLen, seed) {
  fs.mkdirSync(dir, { recursive: true });
  const sizes = [480, 1900, 3500, 6200, 9800, 14000, 21000, 44000, 88000, 355000];
  for (let i = 0; i < nFiles; i++) {
    const sub = i % 9 === 4 ? 'vibespace-designs/' : '';
    const stem = textOf(Math.max(8, nameLen - sub.length - 7 - (i % 5) * 2), seed + i).replace(/ /g, '-');
    const p = path.join(dir, `${sub}${stem}-${String(i).padStart(3, '0')}.md`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '');
    fs.truncateSync(p, sizes[(i * 7 + seed) % sizes.length]);   // sparse: the size shows, the tmpfs holds nothing
    const t = new Date(T0 - ((i * 37 + seed * 11) % 60) * DAY - i * 1000);
    fs.utimesSync(p, t, t);
  }
}
// three groups: the lanes group, the personal project, the school group (their shapes)
const SHAPES = [
  { title: 'VibeSpace 车道', obj: 375, open: 12, item: 294, progress: 500, note: 194, files: 78, nameLen: 33 },
  { title: '个人项目', obj: 155, open: 51, item: 274, progress: 500, note: 121, files: 78, nameLen: 33 },
  { title: '学校', obj: 135, open: 0, item: 0, progress: 76, note: 172, files: 158, nameLen: 55 },
];
function mkStore(tag, { shapes = SHAPES, cwd, sessionKeys = [], settings = {} } = {}) {
  const dataDir = path.join(tmp, tag);
  fs.mkdirSync(dataDir, { recursive: true });
  const t1 = new TaskGroupManager({ dataDir, onChange: () => {}, getSetting: (k) => settings[k] });
  const ids = [];
  shapes.forEach((sh, gi) => {
    const ctx = path.join(dataDir, `ctx-${gi}-` + 'c'.repeat(8));
    mkFolder(ctx, sh.files, sh.nameLen, gi * 13 + 1);
    ids.push(t1.create({ title: sh.title, objective: textOf(sh.obj, gi), folders: [cwd], contextDir: ctx }).id);
  });
  // the long backlog + activity log go in through the store file (500 addProgress calls would rewrite TASK.md 500 times)
  const file = path.join(dataDir, 'task-groups.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf-8'));
  shapes.forEach((sh, gi) => {
    const t = doc.tasks[ids[gi]];
    t.backlog = Array.from({ length: sh.open }, (_, i) => ({ id: `B-${gi}${String(i).padStart(3, '0')}`, text: textOf(sh.item, i + gi), status: 'open', addedAt: T0 - i * DAY, addedBy: sessionKeys[i % Math.max(1, sessionKeys.length)] || 'claude:x', claimedBy: sessionKeys.length ? [sessionKeys[(i * 3) % sessionKeys.length]] : [] }));
    t.progress = Array.from({ length: sh.progress }, (_, i) => ({ id: `P-${gi}${String(i).padStart(4, '0')}`, at: T0 - (sh.progress - i) * 600000, note: textOf(sh.note, i * 3 + gi), session: sessionKeys[i % Math.max(1, sessionKeys.length)] || 'claude:x' }));
    t.contentUpdatedAt = t.updatedAt = T0;
  });
  fs.writeFileSync(file, JSON.stringify(doc));
  return { tasks: new TaskGroupManager({ dataDir, onChange: () => {}, getSetting: (k) => settings[k] }), ids, dataDir };
}

// ════════ §2 the restart legs on the real routes ════════
console.log('§2 the restart on the real routes');
const work = path.join(tmp, 'work');
// the backlog's parkers / claimants: 13 peers (the session under test holds none — its per-turn cleanup nudge is not the subject)
const PEERS = Array.from({ length: 13 }, (_, i) => `claude:P${i}`);
fs.mkdirSync(work, { recursive: true });
{
  const { tasks, ids } = mkStore('r2', { cwd: work, sessionKeys: PEERS });
  const meta = mkMeta();
  const rig = mkRig({ tasks, meta });
  const A = mkSession('A', work);
  rig.activeSessions.set('A', A); seedMeta(meta, A);
  const w0 = meta.writes();
  const c1 = rig.prompt('A');
  const sm = (meta.readSessionMeta('sock-A') || {}).seenMarks;
  ok(c1.includes('<vibespace-task-context>') && ids.every((g) => c1.includes(g)), 'first prompt: the FULL multi-context of the three groups (as before)', c1.slice(0, 200));
  ok(meta.writes() === w0 + 1 && sm && ids.every((g) => typeof sm.groupSeenAt[g] === 'number' && SEEN.isSigDigest(sm.ctxSig[g])) && (meta.readSessionMeta('sock-A') || {}).agentToken === A.agentToken,
    'the marks are written to the session meta WITH that answer (one write; the meta\'s other fields kept)', sm);
  const c2 = rig.prompt('A');
  ok(!c2.includes('<vibespace-task-context>') && meta.writes() === w0 + 1, 'a quiet turn: nothing re-sent and NO meta write (the marks did not move)', { writes: meta.writes() - w0 });

  // a restart: the routes' memory is gone, the session comes back through sessionFromMeta
  const rigR = restart(rig, meta, ['A'], { tasks });
  const AR = rigR.activeSessions.get('A');
  ok(AR._marksRestored === true && ids.every((g) => AR._groupSeenAt[g] === sm.groupSeenAt[g]), 'sessionFromMeta restores the marks (and _marksRestored)');
  const r1 = rigR.prompt('A');
  ok(!r1.includes('<vibespace-task-context>') && !r1.includes('was UPDATED') && /<vibespace-task-unchanged>VibeSpace restarted; unchanged since you last saw them, so not repeated: /.test(r1) && ids.every((g) => r1.includes(`(${g})`)) && B(r1) < 700,
    `restart, nothing changed: no group re-sent — ONE line names the three (${B(r1)} B vs ${B(c1)} B before)`, r1);
  const r2 = rigR.prompt('A');
  ok(!r2.includes('vibespace-task-unchanged') && !r2.includes('<vibespace-task-context>'), 'the pointer rides the FIRST prompt after the restart only', r2.slice(0, 200));

  // a group changed while the server was down → only that group is re-sent (whole: the diff snapshot is not persisted)
  const rigX = restart(rig, meta, ['A'], { tasks });
  tasks.addProgress(ids[0], { note: 'landed the seen marks', session: 'claude:B' });
  const x1 = rigX.prompt('A');
  ok(x1.includes('<vibespace-task-update>') && x1.includes(`(${ids[0]}) changed since your last update`) && x1.includes('landed the seen marks') && !x1.includes('<vibespace-task-context>') && B(x1) < 1500
    && new RegExp(`so not repeated: "[^"]+" \\(${ids[1]}\\), "[^"]+" \\(${ids[2]}\\)`).test(x1),
    `restart with ONE group changed: that group arrives as its DIFF (the lite snapshot), the other two named as not repeated (${B(x1)} B)`, x1.slice(0, 300) + ' …… ' + x1.slice(-400));
  const x2 = rigX.prompt('A');
  ok(!x2.includes('<vibespace-task-context>') && !x2.includes('vibespace-task-unchanged'), 'and the next turn is quiet again');
  // a context-folder file touched (outside the store — no content instant moves) → that group re-sent
  const rigF = restart(rig, meta, ['A'], { tasks });
  const g2dir = tasks.contextDirOf(ids[1]);   // lane task-group-context: the 记笔记 row's folder
  fs.writeFileSync(path.join(g2dir, 'new-notes-from-a-peer.md'), 'x'.repeat(321));
  tasks._sigCache && tasks._sigCache.clear();
  const f1 = rigF.prompt('A');
  ok(f1.includes('was UPDATED') && f1.includes(`(${ids[1]})`) && f1.includes(`- ${g2dir}/ — `) && new RegExp(`so not repeated: "[^"]+" \\(${ids[0]}\\), "[^"]+" \\(${ids[2]}\\)`).test(f1),
    'restart with a context-folder file added: the digest no longer matches ⇒ that group re-sent whole (its Context row told again), the others named', f1.slice(0, 300));
  // a session holding more than SNAP_MAX_ITEMS items has no lite snapshot: a moved group is re-sent whole once
  {
    const { tasks: t2, ids: i2 } = mkStore('r2h', { cwd: work, sessionKeys: ['claude:H'], shapes: [SHAPES[1]] });   // H parked / holds all 51
    const metaH = mkMeta(), rigH = mkRig({ tasks: t2, meta: metaH });
    const H = mkSession('H', work); rigH.activeSessions.set('H', H); seedMeta(metaH, H);
    rigH.prompt('H');
    const smH = metaH.readSessionMeta('sock-H').seenMarks;
    t2.addProgress(i2[0], { note: 'a peer moved it', session: 'claude:P1' });
    const h1 = restart(rigH, metaH, ['H'], { tasks: t2 }).prompt('H');
    ok(!(i2[0] in smH.snap) && h1.includes('was UPDATED') && h1.includes('<vibespace-task-context>'), 'a session holding 51 items: no lite snapshot is kept — its moved group is re-sent whole once (the old no-snapshot path)', Object.keys(smH.snap));
  }
  // ACCEPTED EDGE: an item the session claimed AFTER its last delivery is not in its lite snapshot — the diff names it as parked
  {
    const { tasks: t3, ids: i3 } = mkStore('r2e', { cwd: work, sessionKeys: PEERS, shapes: [SHAPES[0]] });
    const metaE = mkMeta(), rigE = mkRig({ tasks: t3, meta: metaE });
    const E = mkSession('E', work); rigE.activeSessions.set('E', E); seedMeta(metaE, E);
    rigE.prompt('E');
    const g = t3.get(i3[0]);
    t3.update(i3[0], { backlog: g.backlog.map((b, i) => (i === 0 ? { ...b, claimedBy: [...b.claimedBy, 'claude:E'] } : b)) });
    const e1 = restart(rigE, metaE, ['E'], { tasks: t3 }).prompt('E');
    ok(e1.includes('<vibespace-task-update>') && e1.includes(`[${g.backlog[0].id}]`), `an item claimed after the last delivery still surfaces in the diff (as "Backlog PARKED" — the lite snapshot never held it; the report names the edge)`, e1.slice(0, 400));
  }
  // an OLDER meta (no seenMarks): today's behaviour — everything once
  const metaOld = mkMeta();
  const O = mkSession('O', work); seedMeta(metaOld, O);
  const rigO = restart(null, metaOld, ['O'], { tasks });
  const o1 = rigO.prompt('O');
  ok(o1.includes('<vibespace-task-context>') && ids.every((g) => o1.includes(g)) && !o1.includes('vibespace-task-unchanged') && rigO.activeSessions.get('O')._marksRestored === undefined,
    'a meta with NO marks (written before this lane): the full context once, as today', o1.slice(0, 160));
  // SessionStart after a restart (a CLI resume / compact) carries everything — the next prompt names nothing
  const rigS = restart(rig, meta, ['A'], { tasks });
  const s1 = rigS.start('A'), s2 = rigS.prompt('A');
  ok(s1.includes('<vibespace-task-context>') && !s2.includes('vibespace-task-unchanged') && rigS.activeSessions.get('A')._marksRestored === false,
    'a SessionStart after the restart sends the full context (its source is not known — a compact needs it) and clears the pointer');
}
{
  // the intros: a no-group session (tools intro) that is also a designated manager (manager intro); the preamble; jobs
  const lone = path.join(tmp, 'lone');
  fs.mkdirSync(lone, { recursive: true });
  const tasks = new TaskGroupManager({ dataDir: path.join(tmp, 'r2b'), onChange: () => {} });
  const settings = { 'agents.allowGroupManagement': true, 'agents.injectPreamble': 'standing instructions for the fleet' };
  const userState = { sessionConfigs: { 'claude:L': { groupManager: true } } };
  const since = [];
  const jobs = { ready: true, updatesFor: (caller, ts) => { since.push(ts); return { text: '', lastTs: 4242 }; }, digestFor: () => '', peekNotifs: () => [] };
  const meta = mkMeta();
  const rig = mkRig({ tasks, meta, settings, userState, jobs });
  const L = mkSession('L', lone);
  rig.activeSessions.set('L', L); seedMeta(meta, L);
  const c1 = rig.prompt('L');
  const sm = meta.readSessionMeta('sock-L').seenMarks;
  ok(c1.includes('<vibespace-session-tools>') && c1.includes('</vibespace-group-manager>') && c1.includes('standing instructions for the fleet') && sm.toolsIntro === VERSION && sm.mgrIntro === VERSION && typeof sm.preamble === 'string' && sm.jobsTs === 4242,
    'first prompt: tools intro + manager intro + preamble; the marks name the build (intros), the hash (preamble), the jobs cursor', sm);
  const rigR = restart(rig, meta, ['L'], { tasks, settings, userState, jobs });
  const r1 = rigR.prompt('L');
  ok(!r1.includes('<vibespace-session-tools>') && !r1.includes('vibespace-group-manager>') && !r1.includes('standing instructions for the fleet') && since[since.length - 1] === 4242,
    'restart under the SAME build: no intro, no preamble repeated, the jobs update reads from the persisted cursor (4242, not 0)', { r1: r1.slice(0, 200), since });
  const rigN = restart(rig, meta, ['L'], { tasks, settings, userState, jobs, from: sessionFromMetaAt('0.0.1-next') });
  const n1 = rigN.prompt('L'), n2 = rigN.prompt('L');
  ok(n1.includes('<vibespace-session-tools>') && n1.includes('</vibespace-group-manager>') && !n1.includes('standing instructions for the fleet') && !n2.includes('<vibespace-session-tools>'),
    'a NEW build: the tools intro and the manager intro taught ONCE again; the preamble (the user\'s text, unchanged) is not', n1.slice(0, 200));
  settings['agents.injectPreamble'] = 'new standing instructions';
  const rigP = restart(rig, meta, ['L'], { tasks, settings, userState, jobs });
  ok(rigP.prompt('L').includes('new standing instructions'), 'a CHANGED preamble after the restart: re-sent (its hash differs)');
}

// ════════ §3 RED control: no persist call ⇒ the base (everything again) ════════
console.log('§3 RED control');
let patchN = 0;
const loadPatched = (rel, cuts) => {
  let out = fs.readFileSync(path.join(REPO, rel), 'utf8');
  for (const [a, b] of cuts) { if (!out.includes(a)) throw new Error(`patch anchor missing in ${rel}: ${a.slice(0, 60)}`); out = out.split(a).join(b); }
  out = out.replace(/require\('(\.\.?\/[^']+)'\)/g, (_, m) => `require(${JSON.stringify(path.join(REPO, path.dirname(rel), m))})`);
  out = out.replace(/require\('([a-z@][^'.][^']*)'\)/g, (_, m) => `require(${JSON.stringify(require.resolve(m, { paths: [path.join(REPO, path.dirname(rel))] }))})`);
  const f = path.join(tmp, `patched-${patchN++}-${path.basename(rel)}`);
  fs.writeFileSync(f, out);
  return require(f);
};
{
  const noPersist = loadPatched('src/agent-routes.js', [['    persistSeenMarks(s, key);   // B-86d3: the marks this answer moved, written as it is sent\n', '']]);
  const { tasks, ids } = mkStore('r3', { cwd: work, sessionKeys: PEERS });
  const run = (routesMod) => {
    const meta = mkMeta();
    const rig = mkRig({ tasks, meta, routesMod });
    const A = mkSession('A', work); rig.activeSessions.set('A', A); seedMeta(meta, A);
    rig.prompt('A');
    const rigR = mkRig({ tasks, meta, routesMod });
    rigR.activeSessions.set('A', sessionFromMeta(meta.readSessionMeta('sock-A'), { sockName: 'sock-A', backend: 'claude' }));
    return rigR.prompt('A');
  };
  const base = run(noPersist), now = run(ROUTES);
  ok(base.includes('<vibespace-task-context>') && ids.every((g) => base.includes(g)) && B(base) > 5000, `CONTROL: without the persist call a restart re-sends the full context (${B(base)} B — the base behaviour)`);
  ok(!now.includes('<vibespace-task-context>') && B(now) < 700, `…and with it, ${B(now)} B`);
  const src = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  ok((src.match(/\n    persistSeenMarks\(s, key\);   \/\/ B-86d3: the marks this answer moved, written as it is sent\n    res\.json\(/g) || []).length === 2,
    'WIRING PIN: both hook routes persist the marks on the line before their answer (task-context and prompt-context)');
}

// ════════ §4 the budget table ════════
// lane task-group-context: the old budgeted folder index (newest files that fit + a pointer) is gone — the folder is a ROW
// of the Context table, told at its depth within the table's budget, stepping down and SAYING so when it does not fit
// (scripts/test-task-groups-context.mjs has the levels and the words). What this section keeps: the rules part is untouched by
// the budget, the school group's SessionStart is whole under the cap, show --full lists every file through the belt.
console.log('§4 the Context table budget (the old folder index)');
{
  const { tasks, ids } = mkStore('r4', { cwd: work, shapes: [SHAPES[2]] });
  const id = ids[0], dir = tasks.contextDirOf(id);
  const set = (v) => { tasks._getSetting = (k) => (k === 'tasks.contextIndexBytes' ? v : undefined); };
  set(undefined);
  ok(tasks.contextIndexBytes() === 10240, 'the table\'s budget defaults to 10 KB (the key B-86d3 gave the folder index, kept)', tasks.contextIndexBytes());
  // the rules part rides above it untouched; the whole context
  // lane teach-clock-scrub: both renders at ONE clock — the head holds the zone sentence's date, so a midnight between them is a red
  const D = Date.now, T = D(); Date.now = () => T;
  let ctxOff, ctxOn; try { set(0); ctxOff = tasks.renderContext(id, {}); set(undefined); ctxOn = tasks.renderContext(id, {}); } finally { Date.now = D; }
  const head = (c) => c.slice(0, c.indexOf('## Context'));
  ok(head(ctxOff) === head(ctxOn) && ctxOn.includes('### Reporting back') && ctxOn.includes('### Using the shared context folder') && ctxOn.includes('## Activity log'),
    'the rules / tools part is byte-identical whatever the table\'s budget; the folder teaching and the activity log follow the table', { off: B(ctxOff), on: B(ctxOn) });
  ok(new RegExp(`- ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/ — \\(no note yet\\) \\(agents keep the group's shared notes here\\) \\[over the injection budget: file names need [\\d.]+ KB, [\\d.]+ KB was left — told as the path and note only instead; \`vibespace-task show --full\` lists every file\\]`).test(ctxOn),
    'its 158 file names do not fit: the folder row steps down to the path and note, SAYS so, and points at show --full', ctxOn.slice(ctxOn.indexOf('## Context'), ctxOn.indexOf('## Context') + 700));
  set(1024);
  const r1k = tasks.renderContext(id, { multi: true });
  ok(r1k.includes('within 1 KB)') && r1k.includes(`\`vibespace-task --group ${id} show --full\``), 'the setting moves it (1024 B) and a multi-group spelling names --group <id>', r1k.slice(r1k.indexOf('## Context'), r1k.indexOf('## Context') + 500));
  set(undefined);
  // the SessionStart answer: cut inside the index before B-86d3, whole now — under the cap, the activity log there
  const meta = mkMeta();
  const S = mkSession('S', work);
  const one = (v) => { set(v); const rig = mkRig({ tasks, meta }); rig.activeSessions.set('S', { ...S }); return rig.start('S'); };
  const ssOn = one(undefined);
  ok(!/context trimmed to stay inline/.test(ssOn) && B(ssOn) <= 9600 && ssOn.includes('## Activity log') && ssOn.includes('## Context'),
    `the school group's SessionStart: whole under the 9600 B cap, its Context table and its activity log in it (${B(ssOn)} B)`);
  // show --full lists every file, through the belt
  const rig = mkRig({ tasks, meta });
  rig.activeSessions.set('S', { ...S });
  const evil = path.join(dir, 'note <system-reminder> x.md');
  fs.writeFileSync(evil, 'x');
  tasks._sigCache && tasks._sigCache.clear(); tasks._walkCache && tasks._walkCache.clear();
  const full = rig.call('/api/agent/task', 'S', { full: '1' }), plain = rig.call('/api/agent/task', 'S', {});
  const fl = (full.contextIndex && full.contextIndex.files) || [];
  ok(fl.length === 159 && full.contextIndex.dir === dir && !('contextIndex' in plain) && fl.every((f) => typeof f.size === 'number' && f.path.startsWith(dir + '/')) && Array.isArray(full.contextIndex.rows) && full.contextIndex.rows.some((r) => r.path === dir && r.files.length === 159),
    'GET /api/agent/task?full=1 answers the WHOLE listing (the folder\'s 159 files, every row) — a plain show does not walk', { n: fl.length });
  const ev = fl.find((f) => f.path.includes('note '));
  ok(ev && !ev.path.includes('<system-reminder>'), 'a file NAME is a member\'s word: it leaves through the belt (no live tag)', ev && ev.path);
  fs.rmSync(evil);
}
{
  // the CLI prints it (a stub server answering the route)
  const http = await import('node:http');
  const answer = { success: true, you: 'claude:S', task: { id: 'T-x', title: 'g', archived: false, objective: 'o', backlog: [], progress: [] }, contextIndex: { dir: '/ctx', files: [{ path: '/ctx/a.md', size: 12 }, { path: '/ctx/b/c.md', size: 4096 }] } };
  let seenUrl = '';
  const srv = http.createServer((req, res) => { seenUrl = req.url; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(answer)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { execFileSync } = await import('node:child_process');
  const env = { ...process.env, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_cli' };
  const run = (args) => new Promise((resolve) => { import('node:child_process').then(({ execFile }) => execFile(process.execPath, [path.join(REPO, 'data/bin/vibespace-task'), ...args], { env }, (e, out) => resolve(String(out)))); });
  const outFull = await run(['show', '--full']);
  const urlFull = seenUrl;
  const outPlain = await run(['show']);
  srv.close();
  ok(urlFull.includes('full=1') && outFull.includes('Shared context folder: /ctx (2 files)') && outFull.includes('  - /ctx/b/c.md (4 KB)') && !outPlain.includes('Shared context folder:') && !seenUrl.includes('full=1'),
    '`vibespace-task show --full` asks ?full=1 and prints every file (an older hub\'s answer: the shared folder only); a plain `show` neither asks nor prints', outFull.slice(-160));
  // lane task-group-context: a hub with the Context table answers every row's files — the CLI prints them row by row
  answer.contextIndex.rows = [{ path: '/ctx', note: 'notes', files: answer.contextIndex.files }, { path: '/w/handbook.md', note: 'rules', files: [{ path: '/w/handbook.md', size: 900 }] }];
  const srv2 = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(answer)); });
  await new Promise((r) => srv2.listen(0, '127.0.0.1', r));
  env.VIBESPACE_API = `http://127.0.0.1:${srv2.address().port}`;
  const outRows = await run(['show', '--full']);
  srv2.close();
  ok(outRows.includes("Context table — every row's files:") && outRows.includes('  /ctx — notes (2 files)') && outRows.includes('    - /ctx/b/c.md (4 KB)') && outRows.includes('  /w/handbook.md — rules (1 file)') && !outRows.includes('Shared context folder:'),
    '…a hub with the Context table: every row\'s files, row by row', outRows.slice(-260));
  void execFileSync;
}

// ════════ §5 the measurement: 13 sessions × 3 groups in the real shape ════════
console.log('§5 measurement — 13 sessions × 3 groups, the real shape');
{
  const N = 13;
  const keys = Array.from({ length: N }, (_, i) => `claude:S${i}`);
  const { tasks, ids } = mkStore('r5', { cwd: work, sessionKeys: keys });
  const firstTurn = (routesMod, { change = false, marks = true } = {}) => {
    const meta = mkMeta();
    const rig = mkRig({ tasks, meta, routesMod });
    for (let i = 0; i < N; i++) { const s = mkSession(`S${i}`, work); rig.activeSessions.set(`S${i}`, s); seedMeta(meta, s); }
    let before = 0;
    for (let i = 0; i < N; i++) before += B(rig.prompt(`S${i}`));
    if (change) tasks.addProgress(ids[0], { note: textOf(194, 99), session: 'claude:peer' });
    const rigR = mkRig({ tasks, meta, routesMod });
    for (let i = 0; i < N; i++) {
      const m = meta.readSessionMeta(`sock-S${i}`) || {};
      if (!marks) delete m.seenMarks;
      rigR.activeSessions.set(`S${i}`, sessionFromMeta(m, { sockName: `sock-S${i}`, backend: 'claude' }));
    }
    let after = 0;
    for (let i = 0; i < N; i++) after += B(rigR.prompt(`S${i}`));
    return { before, after };
  };
  const baseSame = firstTurn(ROUTES, { marks: false });
  const nowSame = firstTurn(ROUTES);
  const baseChg = firstTurn(ROUTES, { marks: false, change: true });
  const nowChg = firstTurn(ROUTES, { change: true });
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  quiet(`    first turn after a restart (13 sessions × 3 groups):`);
  quiet(`      nothing changed        base ${kb(baseSame.after)}  now ${kb(nowSame.after)}`);
  quiet(`      the lanes group moved  base ${kb(baseChg.after)}  now ${kb(nowChg.after)}`);
  ok(baseSame.after > 90 * 1024 && nowSame.after < baseSame.after * 0.08, `nothing changed: ${kb(baseSame.after)} (base) → ${kb(nowSame.after)} — the 13 pointer lines only`);
  ok(nowChg.after < baseChg.after * 0.2 && nowChg.after > nowSame.after, `the lanes group moved: ${kb(baseChg.after)} (base) → ${kb(nowChg.after)} — its diff + the pointer`);
  // each group's Context table in the three-group SessionStart (lane task-group-context: one shared room, rows step down)
  const multi = tasks.renderMultiContext(ids, {});
  ok(B(multi) <= 9600 && ids.every((id) => multi.includes(`### "${tasks.get(id).title}"\n`)), `the three groups' layered context, every Context table in it, under the cap (${kb(B(multi))})`);
}

// ════════ §6 THE OWNER'S CONSTRAINT (lane task-group-fanout, 2026-10-24): what the model is told must not change ════════
// The hook path's Context-table signature moved OFF the main thread (a SafeFs read per told row, awaited ≤ the bound). ONE
// store, ONE folder tree, two rigs over the same routes: the CONTROL with no off-thread reader — the old synchronous walk,
// the base's own road — and the NEW road (a real SafeFs pool). The same sequence of folder edits + turns; every delivery
// compared BYTE FOR BYTE. Then the stale path: a read that misses its bound tells nothing new at that turn and moves no
// mark; the next turn tells all of it — exactly the control's delivery of the turn before (never dropped).
console.log('§6 the Context read off the main thread (lane task-group-fanout): byte-identical deliveries, the stale path');
{
  const { SafeFs } = require('../src/safe-fs.js');
  const pool = new SafeFs({ poolSize: 2, name: 'seenmarks-fanout' });
  const ops = { contextFiles: 0, stat: 0 };
  const counted = { call: (op, payload, o) => { if (op in ops) ops[op]++; return pool.call(op, payload, o); } };
  let road = null;   // the off-thread reader the store sees — null = the CONTROL (the old synchronous signature)
  const root6 = path.join(tmp, 'f6'), work6 = path.join(root6, 'work'), dirA = path.join(root6, 'notes'), dirC = path.join(root6, 'handbook'), fileB = path.join(root6, 'brief.md');
  let clock = T0;
  const put = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); const t = new Date(clock += 60000); fs.utimesSync(p, t, t); };
  fs.mkdirSync(work6, { recursive: true });
  for (let i = 0; i < 6; i++) put(path.join(dirA, `note-${i}.md`), textOf(200 + i * 40, i));
  put(path.join(dirC, 'HANDOFF.md'), textOf(600, 3)); put(path.join(dirC, 'guide', 'part-1.md'), textOf(300, 4)); put(fileB, textOf(900, 7));
  const dataDir6 = path.join(root6, 'data'); fs.mkdirSync(dataDir6, { recursive: true });
  const tasks = new TaskGroupManager({ dataDir: dataDir6, onChange: () => {}, getSetting: () => undefined, mirrorFs: () => road, sigBoundMs: 150 });
  const g1 = tasks.create({ title: 'Fanout notes', objective: textOf(120, 1), ctx: [{ path: work6, tags: ['discover'], tell: 'note' }, { path: dirA, tell: 'names' }, { path: fileB, tell: 'contents' }] }).id;
  const g2 = tasks.create({ title: 'Fanout handbook', objective: textOf(90, 2), ctx: [{ path: work6, tags: ['discover'], tell: 'note' }, { path: dirC, tell: 'index' }, { ref: g1 }] }).id;
  const rigC = mkRig({ tasks, meta: mkMeta() }), rigN = mkRig({ tasks, meta: mkMeta() });
  for (const rig of [rigC, rigN]) rig.activeSessions.set('A', mkSession('A', work6));
  const fresh = () => { for (const c of [tasks._sigCache, tasks._walkCache, tasks._resCache]) if (c) c.clear(); };   // every turn reads (the 4 s TTL is not the subject)
  // the new road's call, awaited (the route re-enters itself once the read settled); main-thread readdir under the fixture counted
  const callN = (route, id) => new Promise((resolve) => {
    const s = rigN.activeSessions.get(id);
    const req = { headers: { authorization: 'Bearer ' + s.agentToken }, query: {}, body: {} };
    const l = console.log, w = console.warn;
    console.log = (...a) => routeLog.push(a.join(' ')); console.warn = (...a) => routeLog.push(a.join(' '));
    const res = { json: (o) => { console.log = l; console.warn = w; resolve(o || {}); }, status: () => res };
    rigN.routes[`GET ${route}`](req, res);
  });
  let mainWalks = 0;
  const realReaddir = fs.readdirSync;
  fs.readdirSync = function (p, ...a) { if (String(p).startsWith(root6 + '/') && !String(p).startsWith(dataDir6)) mainWalks++; return realReaddir.call(this, p, ...a); };
  const turn = async (route) => {
    road = null; fresh(); const w0 = mainWalks;
    const c = (route === 'task-context' ? rigC.start('A') : rigC.prompt('A'));
    const cWalks = mainWalks - w0;
    road = counted; fresh(); const w1 = mainWalks;
    const n = ((await callN(`/api/agent/${route}`, 'A')).context) || '';
    return { c, n, cWalks, nWalks: mainWalks - w1 };
  };
  const STEPS = [
    ['SessionStart', null, 'task-context'],
    ['the first prompt', null],
    ['nothing changed', null],
    ['a listed note edited (size + mtime)', () => put(path.join(dirA, 'note-2.md'), textOf(500, 9))],
    ['a note added', () => put(path.join(dirA, 'note-9.md'), textOf(250, 11))],
    ['the contents-told brief rewritten', () => put(fileB, textOf(700, 12))],
    ['a key file edited', () => put(path.join(dirC, 'HANDOFF.md'), textOf(650, 13))],
    ['a nested file removed', () => fs.rmSync(path.join(dirC, 'guide', 'part-1.md'))],
    ['an Activity line (no file moved)', () => tasks.addProgress(g1, { note: 'a peer finished the index', session: 'claude:P1' })],
    ['a note removed + an Activity line', () => { fs.rmSync(path.join(dirA, 'note-0.md')); tasks.addProgress(g2, { note: 'the handbook moved', session: 'claude:P2' }); }],
  ];
  const QUIET = new Set(['the first prompt', 'nothing changed']);   // SessionStart told both groups whole; then nothing moved
  const diffs = [];
  let told = 0, cWalks = 0, nWalks = 0;
  for (const [name, mutate, route = 'prompt-context'] of STEPS) {
    if (mutate) mutate();
    const r = await turn(route);
    if (r.c !== r.n) diffs.push({ step: name, control: r.c.slice(0, 300), road: r.n.slice(0, 300) });
    const t = /<vibespace-task-(?:context|update)\b/.test(r.c);
    if (t) told++;
    if (QUIET.has(name) === t) diffs.push({ step: name, why: t ? 'told on a turn where nothing changed' : 'a change was not told' });
    cWalks += r.cWalks; nWalks += r.nWalks;
  }
  ok(!diffs.length && told === STEPS.length - QUIET.size, `BYTE-IDENTICAL: ${STEPS.length} turns over ${STEPS.length - 3} folder / store edits — every delivery of the off-thread road equals the old synchronous walk's, byte for byte (${told} told the groups; the ${QUIET.size} quiet turns told nothing)`, diffs);
  ok(cWalks > 0 && nWalks === 0 && ops.contextFiles > 0 && ops.stat > 0, `the control walked the fixture ON the main thread (${cWalks} readdirSync), the new road never did (${nWalks}) — its facts came from the SafeFs pool (${ops.contextFiles} contextFiles, ${ops.stat} stat)`, { cWalks, nWalks, ops });
  // ── THE STALE PATH: a reader that answers only when released ──
  const held = [];
  const slow = { call: (op, payload, o) => new Promise((resolve, reject) => { held.push(() => pool.call(op, payload, o).then(resolve, reject)); }) };
  const release = async () => { while (held.length) held.shift()(); await new Promise((r) => setTimeout(r, 60)); };
  put(path.join(dirA, 'note-5.md'), textOf(333, 21)); tasks.addProgress(g1, { note: 'the stale-path line', session: 'claude:P3' });
  road = null; fresh(); const cN = rigC.prompt('A');
  const sA = rigN.activeSessions.get('A');
  const marks0 = JSON.stringify([sA._groupSeenAt, sA._ctxSig]);
  road = slow; fresh();
  const nN = (await callN('/api/agent/prompt-context', 'A')).context || '';
  ok(cN.includes('<vibespace-task-update') && !nN.includes('<vibespace-task-update') && !nN.includes('the stale-path line') && JSON.stringify([sA._groupSeenAt, sA._ctxSig]) === marks0 && sA._sigStale && g1 in sA._sigStale,
    'turn N, the read missed its bound: NOTHING new told (the control told the update), no seen mark moved, the session holds the group sigStale', { control: cN.slice(0, 160), road: nN.slice(0, 300), stale: sA._sigStale });
  await release();
  const nN1 = (await callN('/api/agent/prompt-context', 'A')).context || '';
  ok(nN1 === cN && !sA._sigStale, 'turn N+1: EVERYTHING told — byte for byte the control\'s turn-N delivery (the read that landed after the mark answers; never dropped) — and the mark is gone', { want: cN.slice(0, 200), got: nN1.slice(0, 200) });
  await release();
  road = null; fresh(); const cN1 = rigC.prompt('A');
  road = counted; fresh(); const nN2 = (await callN('/api/agent/prompt-context', 'A')).context || '';
  ok(cN1 === nN2 && !nN2.includes('<vibespace-task-update'), 'turn N+2: nothing told twice (both roads quiet again)', { control: cN1.slice(0, 160), road: nN2.slice(0, 160) });
  // SessionStart on a read that misses its bound: no group is told there, every group waits whole for the first prompt
  rigC.activeSessions.set('B', mkSession('B', work6)); rigN.activeSessions.set('B', mkSession('B', work6));
  road = null; fresh(); const cS = rigC.start('B'); const cP = rigC.prompt('B');
  road = slow; fresh(); const nS = (await callN('/api/agent/task-context', 'B')).context || '';
  await release();
  road = counted; fresh(); const nP = (await callN('/api/agent/prompt-context', 'B')).context || '';
  ok(cS.includes(g1) && cS.includes(g2) && !nS.includes(g1) && !nS.includes(g2) && nP.includes(g1) && nP.includes(g2) && !rigN.activeSessions.get('B')._sigStale && !cP.includes(g1),
    'SessionStart on a read that missed its bound tells no group (nothing marked seen) — the first prompt tells both whole', { start: nS.slice(0, 160), first: nP.slice(0, 160) });
  fs.readdirSync = realReaddir;
  pool.close();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
