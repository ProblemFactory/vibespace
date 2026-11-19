#!/usr/bin/env node
// THE TASK-STATE ANSWER READS NO TRANSCRIPT BYTE ON THE HUB'S LOOP (B-299b A2, lane bl-loop-a — the loop map's «agy-session»
// family, site 2: scanTaskEventsFull read, copied, decoded and split a claude transcript in 16 MB slabs on the main thread at
// the first task-state answer of every conversation after a restart — 12.4 s over 3 holds — and an open Properties window
// re-asked GET /api/session-todos at every broadcast). The bytes are read in the transcript worker (session-store
// taskLinesSince, op 'taskLines'); the main thread keeps each conversation's cursor + events and taskState() reads only them.
//  ① the answers the full scan gave (compaction replay, the newer family, an append, a line still being written, a rewrite)
//  ② COUNTS: the warm's task scan + taskState() read 0 bytes of the transcript on the main thread (path- and fd-named);
//     RED CONTROL the same scan on the main thread (where the release ran it) ⇒ the transcript read here
//  ③ the worker's inline road (the pool down) answers null on the main thread — never a read
//  ④ the kept conversations are bounded (TASK_EVENT_CACHE_MAX, least recently warmed out first)
//  ⑤ the two HTTP roads (status, GET /api/session-todos) warm ONLY what they read (the cure): claude's task scan, awaited first; a codex
//     conversation's task state lists nothing and starts nothing (RED: cadb07780's transcript warm); the route hands every harness its machine
//  ⑥ (A4) chatStatus probes no project folder · ⑦ (A5) the merge parses the buffer lines it gained, against the release's merge
//     planted back (an append, a split line, a mid-line trim, a kept map landing late; each guard's mutant RED)
//  ⑦b (the cure) the position indexes the merges keep are counted in the transcript tails' census row (RED: cadb07780's row)
// Runs in a CHILD with a fake HOME (findSessionJsonlPath resolves into a throwaway projects dir — never the real ~/.claude).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.TASK_SCAN_LOOP_CHILD) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'task-scan-loop-'));
  try {
    process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, HOME: home, TASK_SCAN_LOOP_CHILD: home }, encoding: 'utf-8' }));
  } catch (e) {
    process.stdout.write(String(e.stdout || '')); process.stderr.write(String(e.stderr || e.message)); process.exitCode = 1;
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
} else {
  const require = createRequire(import.meta.url);
  const { mutantCopies } = await import('./mutant-copy.mjs');
  let pass = 0, fail = 0;
  const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof name} — the arguments are swapped?`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 600) : ''}`); } };
  const SS = require(path.join(REPO, 'src/session-store.js'));
  const cwd = '/tmp/task-scan-loop-proj', sid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1';
  // the child's home is the throwaway one its parent made (TASK_SCAN_LOOP_CHILD names it): every transcript is written THERE —
  // never under the real ~/.claude (test-fixture-isolation reads this file's writes)
  const HOME_FAKE = process.env.TASK_SCAN_LOOP_CHILD;
  if (!HOME_FAKE || os.homedir() !== HOME_FAKE || !HOME_FAKE.startsWith(os.tmpdir())) throw new Error(`task-scan-loop: the child is not re-homed (${os.homedir()} vs ${HOME_FAKE})`);
  const projects = path.join(HOME_FAKE, '.claude', 'projects'), projDir = path.join(projects, cwd.replace(/[/._]/g, '-'));
  fs.mkdirSync(projDir, { recursive: true });
  const fp = path.join(projDir, sid + '.jsonl');
  const T0 = '2026-07-01T00:00:00.000Z', T1 = '2026-07-15T01:00:00.000Z', T2 = '2026-07-15T01:05:00.000Z', T3 = '2026-07-15T04:00:00.000Z';
  const rec = (uuid, ts, type, content) => JSON.stringify({ uuid, timestamp: ts, type, message: { role: type, content } });
  const create = (uuid, ts, tuid, subject = 'Ship it') => rec(uuid, ts, 'assistant', [{ type: 'tool_use', id: tuid, name: 'TaskCreate', input: { subject, activeForm: 'Shipping it' } }]);
  const createRes = (uuid, ts, tuid, n = 1, subject = 'Ship it') => rec(uuid, ts, 'user', [{ type: 'tool_result', tool_use_id: tuid, content: `Task #${n} created successfully: ${subject}` }]);
  const update = (uuid, ts, status, id = '1') => rec(uuid, ts, 'assistant', [{ type: 'tool_use', id: 'tu-' + uuid, name: 'TaskUpdate', input: { taskId: id, status } }]);
  const todoWrite = (uuid, ts) => rec(uuid, ts, 'assistant', [{ type: 'tool_use', id: 'tw-' + uuid, name: 'TodoWrite', input: { todos: [{ content: 'old todo', status: 'completed' }] } }]);
  const chat = (uuid, ts, text) => rec(uuid, ts, 'assistant', [{ type: 'text', text }]);
  const lines = [
    todoWrite('u0', T0), chat('c0', T0, '一'.repeat(2000)), create('u1', T1, 'tc-1'), createRes('u2', T1, 'tc-1'), update('u3', T2, 'in_progress'), update('u4', T3, 'completed'),
    create('u1', T1, 'tc-1'), createRes('u2', T1, 'tc-1'), update('u3', T2, 'in_progress'),   // the compaction replay (same uuids, original times)
    JSON.stringify({ timestamp: T2, type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu-x', name: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' } }] } }), // uuid-less stale replay
  ];
  fs.writeFileSync(fp, lines.join('\n') + '\n');
  const mk = () => new SS.SessionMessages({ backend: 'claude', backendSessionId: sid, claudeSessionId: sid, cwd }, null, { buffersDir: path.join(os.homedir(), 'buf'), permissionModes: [] });
  const todosOf = () => (mk().taskState() || {}).todos || [];
  // the counter: a byte READ of a transcript on this thread (openSync / readSync / readFileSync / a read stream, by path or by an fd those opened)
  const READS = ['openSync', 'readSync', 'readFileSync', 'createReadStream'];
  const reading = async (fn) => {
    let n = 0; const fds = new Set(), real = {};
    for (const k of READS) { real[k] = fs[k]; fs[k] = function (p0, ...a) { const named = typeof p0 === 'string' && p0.startsWith(projects); if (named || (typeof p0 === 'number' && fds.has(p0))) n++; const r = real[k].call(this, p0, ...a); if (k === 'openSync' && named) fds.add(r); return r; }; }
    try { await fn(); } finally { for (const k of READS) fs[k] = real[k]; }
    return n;
  };
  const st = () => fs.statSync(fp);
  console.log('① the answers the full scan gave — from the events the warm scanned off the loop');
  let t1 = [];
  const n1 = await reading(async () => { await SS.warmSessionJsonlAsync(sid, cwd); t1 = todosOf(); });   // the hub's warm (cold: the tail AND the task scan in the worker) + the answer
  ok(t1.length === 1 && t1[0].content === 'Ship it' && t1[0].status === 'completed', 'one task (never the ancient TodoWrite snapshot), completed despite the compaction replay after it', t1);
  const kept = SS._taskEventCache.get(sid);
  ok(kept && kept.events.map((e) => `${e.kind}${e.id || (e.input && e.input.status) || ''}`).join(' ') === 'todos create1 updatein_progress updatecompleted updatein_progress' && kept.offset === fs.statSync(fp).size,
    'the kept events = the full scan\'s: the replay copies dropped by uuid, the uuid-less one kept (the time sort neutralises it); the cursor at the end', kept && kept.events.map((e) => e.kind));
  fs.appendFileSync(fp, update('u9', '2026-07-16T09:00:00.000Z', 'in_progress') + '\n' + update('u10', '2026-07-16T10:00:00.000Z', 'completed').slice(0, 40));   // a genuine reopen + a line still being written
  const n2scan = await reading(async () => { await SS.warmTaskEvents(sid, fp, st()); });   // the task scan of the appended bytes
  await SS.warmSessionJsonlAsync(sid, cwd);   // the tail's own append (the parse cache's road, not this unit's)
  let t2 = [];
  const n2 = n2scan + await reading(async () => { t2 = todosOf(); });
  const off2 = SS._taskEventCache.get(sid).offset;
  ok(t2[0] && t2[0].status === 'in_progress' && off2 < fs.statSync(fp).size, 'an append: picked up from the cursor; the line still being written is not read yet (the cursor stops before it)', { t2, off2 });
  fs.appendFileSync(fp, update('u10', '2026-07-16T10:00:00.000Z', 'completed').slice(40) + '\n');
  await SS.warmTaskEvents(sid, fp, st());
  ok(todosOf()[0]?.status === 'completed', 'the line completed: read whole at the next warm');
  fs.writeFileSync(fp, [create('v1', T1, 'tc-9', 'Rewritten'), createRes('v2', T1, 'tc-9', 7, 'Rewritten')].join('\n') + '\n');   // rewritten shorter
  await SS.warmTaskEvents(sid, fp, st());
  const t3 = todosOf();
  ok(t3.length === 1 && t3[0].content === 'Rewritten' && t3[0].status === 'pending', 'a rewritten (shorter) transcript: read again from 0 — none of the old events stays', t3);
  console.log('② counts: no transcript byte read on the main thread for a task-state answer');
  ok(n1 === 0 && n2 === 0, `the first warm (tail + task scan) + taskState(): ${n1} byte reads of the transcript on the main thread; after an append, the task scan + taskState(): ${n2}`);
  const src = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8'), CALL = "require('./adapters/codex').transcriptWorkerCall('taskLines', { fp, offset }, () => null)";
  const Rel = mutantCopies('task-scan-inline', REPO).load('src/session-store.js', src.replace(CALL, 'Promise.resolve(taskLinesSince(fp, offset))'), 'inline');
  const relSm = () => new Rel.SessionMessages({ backend: 'claude', backendSessionId: sid, claudeSessionId: sid, cwd }, null, { buffersDir: path.join(os.homedir(), 'buf'), permissionModes: [] });
  const nRel = await reading(async () => { await Rel.warmTaskEvents(sid, fp, st()); });
  const tr = (relSm().taskState() || {}).todos || [];
  ok(src.split(CALL).length === 2 && nRel > 0 && tr[0]?.content === 'Rewritten', `RED CONTROL — the same scan on the main thread (where the release read it): ${nRel} byte reads of the transcript here`);
  console.log('③ the inline road (the pool down) never reads on the main thread');
  const TW = require(path.join(REPO, 'src/transcript-worker.js'));
  const inl = await reading(async () => { const r = TW.runOp('taskLines', { fp, offset: 0 }); ok(r && r.result === null, 'the worker op run on the main thread answers null'); });
  ok(inl === 0, `…and reads nothing (${inl})`);
  console.log('④ the kept conversations are bounded');
  const many = [];
  for (let k = 0; k < SS.TASK_EVENT_CACHE_MAX + 3; k++) { const id = `bbbbbbbb-0000-4000-8000-${String(k).padStart(12, '0')}`, f = path.join(projDir, id + '.jsonl'); fs.writeFileSync(f, update(`w${k}`, T1, 'completed') + '\n'); many.push([id, f]); }
  for (const [id, f] of many) await SS.warmTaskEvents(id, f, fs.statSync(f));
  ok(SS._taskEventCache.size === SS.TASK_EVENT_CACHE_MAX && !SS._taskEventCache.has(sid) && SS._taskEventCache.has(many[many.length - 1][0]),
    `${many.length} conversations warmed: ${SS._taskEventCache.size} kept (TASK_EVENT_CACHE_MAX ${SS.TASK_EVENT_CACHE_MAX}) — the least recently warmed left first`);
  console.log('④b its reads\' musts: EVERY attach warms the task scan, BEFORE the socket joins — the REAL ws-handler over a fake socket; the device agent reads in place');
  {
    const H = require(path.join(REPO, 'src/harnesses/claude.js'));
    ok(H.store.warmTaskState === SS.warmSessionJsonlAsync, 'claude\'s task-state warm is its transcript warm (the task scan rides it)');
    // r2 (its fixes' read, MUST-1 + MUST-2): the attach DRIVEN, not its text — a conversation born in this hub (its history
    // loaded, its warm run once), a TaskUpdate appended after a first attach, a second attach; a live frame broadcast WHILE
    // the warm waits (the choke point sends to every socket in session.clients) must not reach the new socket ahead of
    // `attached` — a resume by seq would then skip the frames it replays
    const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
    const wshSrc = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
    const WARM = '              await warmTaskStateFor(s0);\n', PEND = "              s0.clients.set(ws, { cols: 120, rows: 30, caps: clientCaps(data), pending: true }); attachedSessions.add(data.sessionId);\n";
    const SKIP = "      if (seq && entry && entry.pending) continue;";
    const SB = require(path.join(REPO, 'src/server/session-broadcast.js')), sbSrc = fs.readFileSync(path.join(REPO, 'src/server/session-broadcast.js'), 'utf8');
    const JOIN = "            session.clients.set(ws, { cols: 120, rows: 30, caps: clientCaps(data) });\n            attachedSessions.add(data.sessionId);\n";
    const MCW = mutantCopies('a2-attach', REPO);
    const plantW = (tag, edits) => { let t = wshSrc; for (const [x, y] of edits) { if (t.split(x).length !== 2) throw new Error(`④b (${tag}): its anchor is not ONE site: ${x.slice(0, 70)}`); t = t.replace(x, () => y); } return MCW.load('src/ws-handler.js', t, tag); };
    const realWts = H.store.warmTaskState;
    let during = null;
    H.store.warmTaskState = (...x) => { if (during) during(); return realWts(...x); };
    const buf = path.join(os.homedir(), 'buf'); fs.mkdirSync(buf, { recursive: true });
    const scene = async (WSH, n, BC = SB, opt = {}) => {
      const { broadcastToSession } = BC.createSessionBroadcast({ event() { }, log: { warn() { } } });
      const sidA = `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`, fA = path.join(projDir, sidA + '.jsonl');
      fs.writeFileSync(fA, [create(`a${n}-1`, T1, `tc-a${n}`, 'Attach it'), createRes(`a${n}-2`, T1, `tc-a${n}`, 1, 'Attach it')].join('\n') + '\n');
      const sessions = new Map();
      const ctx = new Proxy({ activeSessions: sessions, WS_OPEN: 1, BUFFERS_DIR: buf, SOCKETS_DIR: buf, fs, path, os, telemetry: { record() { } }, serverNotice() { }, activeSessionsPayload: () => [], resizeSessionToMin() { },
        broadcastActiveSessions() { }, broadcastToSession() { }, refreshWebuiPids() { }, readSessionMeta: () => null, writeSessionMeta() { }, readLayouts: () => ({}), writeLayouts() { },
        createSessionMessages: (s0, id) => new SS.SessionMessages(s0, id, { buffersDir: buf, permissionModes: [] }) }, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) });
      const on = {}, wss = { _heartbeatTimer: true, clients: new Set(), on: (ev, fn) => { on[ev] = fn; } };
      WSH.registerWsHandler(wss, ctx);
      const attachedOf = (c) => c.frames.find((f) => f.type === 'attached' && f.sessionId === sidA) || null;
      const connect = () => {
        const h = {}, frames = [];
        const sock = { readyState: 1, bufferedAmount: 0, send: (t) => frames.push(JSON.parse(t)), on: (ev, fn) => { h[ev] = fn; }, ping() { }, terminate() { }, close() { } };
        wss.clients.add(sock); on.connection(sock);
        const c = { frames, send: (m) => Promise.resolve(h.message(JSON.stringify(m))).catch(() => { }), attach: async () => { await h.message(JSON.stringify({ type: 'attach', sessionId: sidA })); for (let k = 0; k < 1500 && !attachedOf(c); k++) await new Promise((r) => setTimeout(r, 2)); } };
        return c;
      };
      await SS.warmSessionJsonlAsync(sidA, cwd);
      const session = { backend: 'claude', mode: 'chat', claudeSessionId: sidA, backendSessionId: sidA, cwd, clients: new Map(), _normalizer: createMessageManager('claude', sidA), _historyLoaded: true, _normEpoch: 1788550000000 };
      sessions.set(sidA, session);
      const todo = (c) => { const x = attachedOf(c), t = x && x.taskState && Array.isArray(x.taskState.todos) ? x.taskState.todos[0] : null; return t ? t.status : null; };
      const c1 = connect(); await c1.attach();
      fs.appendFileSync(fA, update(`a${n}-3`, T2, 'completed', '1') + '\n');   // the transcript gains a TaskUpdate after the first answer
      const c2 = connect();
      // r4: the attaching socket sends a RESIZE while the warm waits (its entry is rebuilt — it must stay pending), then the frames
      during = () => { if (opt.resize !== false) c2.send({ type: 'resize', sessionId: sidA, cols: 100, rows: 40 }); broadcastToSession(session, sidA, { type: 'msg', sessionId: sidA, probe: 'stamped' }); broadcastToSession(session, sidA, { type: 'subagent-message', sessionId: sidA, probe: 'unstamped' }); };
      try { await c2.attach(); } finally { during = null; }
      const i2 = c2.frames.findIndex((f) => f.type === 'attached'), pAt = c2.frames.findIndex((f) => f.probe === 'stamped');
      return { first: todo(c1), second: todo(c2), probeAhead: pAt >= 0 && (i2 < 0 || pAt < i2), unstamped: c2.frames.some((f) => f.probe === 'unstamped'), probeSeen: c1.frames.some((f) => f.probe === 'stamped'), c2: c2.frames.map((f) => f.type).slice(0, 8) };
    };
    try {
      const now = await scene(require(path.join(REPO, 'src/ws-handler.js')), 1);
      ok(now.first === 'pending' && now.second === 'completed' && now.probeSeen && !now.probeAhead && now.unstamped && wshSrc.split(WARM).length === 2,
        'a conversation born in this hub: its second attach answers the TaskUpdate the transcript gained (pending → completed); while the warm waited — the new socket resizing meanwhile — the STAMPED frame reached the socket already attached and NOT the new one ahead of its `attached` (the verdict covers it), the UNSTAMPED one reached both (r3, r4)', now);
      const noWarm = await scene(plantW('no-warm', [[WARM, '']]), 2);
      ok(noWarm.second === 'pending', `RED CONTROL (no warm at the attach — the first rebuild's alone): the second attach answers the stale state (${noWarm.second})`, noWarm);
      const late = await scene(plantW('warm-after-join', [[WARM, ''], [JOIN, JOIN + '            await warmTaskStateFor(session);\n']]), 3);
      ok(late.second === 'completed' && late.probeAhead, 'RED CONTROL (the warm after the socket joined — the first cure\'s place): the stamped frame reached the new socket AHEAD of its `attached`', late);
      const noPend = await scene(plantW('no-pending-join', [[PEND, '']]), 4, SB, { resize: false });   // r2's own window (no resize: a resize would register the socket with no flag at all)
      ok(noPend.second === 'completed' && !noPend.unstamped, 'RED CONTROL (the warm before any join — r2\'s form): the unstamped frame never reached the new socket', noPend);
      const SEQ = '...(prev.pending ? { pending: true } : {}) } : {});';
      const dropped = await scene(plantW('pending-dropped', [[SEQ, ' } : {});']]), 6);
      ok(wshSrc.split(SEQ).length === 2 && dropped.probeAhead, 'RED CONTROL (a resize during the waits rebuilds the entry without its pending flag — r3): the stamped frame reached the new socket AHEAD of its `attached`', dropped);
      const noSkip = await scene(require(path.join(REPO, 'src/ws-handler.js')), 5, MCW.load('src/server/session-broadcast.js', sbSrc.replace(SKIP, '      if (false) continue;'), 'no-pending-skip'));
      ok(sbSrc.split(SKIP).length === 2 && noSkip.probeAhead, 'RED CONTROL (the choke point without its pending skip): the stamped frame reached the pending socket AHEAD of its `attached`', noSkip);
    } finally { H.store.warmTaskState = realWts; }
    const twSrc = fs.readFileSync(path.join(REPO, 'src/transcript-worker.js'), 'utf8'), SHIP = "require('path').join(__dirname, 'transcript-worker.js')";
    const Dev = mutantCopies('task-scan-device', REPO).load('src/transcript-worker.js', twSrc.replace(SHIP, "require('path').join(__dirname, 'transcript-worker-not-shipped.js')"), 'device');
    const r = Dev.runOp('taskLines', { fp, offset: 0 });
    ok(twSrc.split(SHIP).length === 2 && r && r.result && Array.isArray(r.result.items) && r.result.items.length > 0 && TW.runOp('taskLines', { fp, offset: 0 }).result === null,
      `a bundle that ships no transcript worker script (the device agent's): the op reads in place on its own loop (${r && r.result && r.result.items.length} items), as the release did there; the hub's checkout answers null on its main thread`);
  }
  console.log('⑤ the HTTP roads warm ONLY what they read (the agy chain\'s cure): claude\'s task scan before the answer; a codex conversation\'s task state lists nothing on this thread and starts no process; the route hands every harness its machine');
  {
    const { createTranscriptService } = require(path.join(REPO, 'src/transcript-service.js'));
    const CS = require(path.join(REPO, 'src/codex-session-store.js')), CTR = require(path.join(REPO, 'src/codex-thread-read.js'));
    const H = require(path.join(REPO, 'src/harnesses/claude.js')), realWts = H.store.warmTaskState;
    // a codex sessions store on this (throwaway) home: 40 date folders, a rollout each — none of them the asked conversation's
    const csess = path.join(HOME_FAKE, '.codex', 'sessions');
    for (let d = 1; d <= 40; d++) { const dir = path.join(csess, '2026', String(1 + (d % 12)).padStart(2, '0'), String(d).padStart(2, '0')); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `rollout-2026-07-01T00-00-00-dddddddd-0000-4000-8000-${String(d).padStart(12, '0')}.jsonl`), '{}\n'); }
    // a stand-in codex: it marks that it ran, reads the first request (no broken pipe) and exits — the app-server read fails at once
    const standIn = (name) => { const f = path.join(HOME_FAKE, name); fs.writeFileSync(f, '#!/bin/sh\n: > "$0.ran"\nread line\nexit 1\n', { mode: 0o755 }); return f; };
    const ran = (f) => fs.existsSync(f + '.ran');
    const order = [];
    const mkReader = (s) => { order.push('reader'); return s.backend === 'codex' ? new CS.CodexSessionMessages(s, undefined, { buffersDir: path.join(os.homedir(), 'buf') }) : new SS.SessionMessages(s, null, { buffersDir: path.join(os.homedir(), 'buf'), permissionModes: [] }); };
    const listing = async (fn) => { let n = 0; const real = fs.readdirSync; fs.readdirSync = function (p0, ...a) { if (typeof p0 === 'string' && p0.startsWith(csess)) n++; return real.call(this, p0, ...a); }; try { await fn(); } finally { fs.readdirSync = real; } return n; };
    const tid = 'eeeeeeee-0000-4000-8000-00000000c0de', cref = { backend: 'codex', sessionId: tid, cwd };
    // the reader's OWN listings (chatStatus finds the rollout, as the release did): what status() may make, and no more
    const nReader = await listing(async () => { mkReader({ backend: 'codex', backendSessionId: tid, cwd, buffer: '' }).chatStatus(); });
    const scene = async (TS, cmd) => {
      CTR._resetForTests(); CTR.configure({ codexCmd: cmd, enabled: true });
      const svc = TS.createTranscriptService({ activeSessions: new Map(), createSessionMessages: mkReader, hosts: null });
      let ans = null;
      const nTask = await listing(async () => { ans = await svc.taskState(cref); });
      const nStatus = await listing(async () => { await svc.status(cref); });
      return { nTask, nStatus, ans, ran: ran(cmd) };
    };
    const tsSrc = fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8');
    const WARM_NOW = "const warm = harnessOf(r.backend || 'claude').store?.warmTaskState; if (warm) await warm(r.sessionId, r.cwd, { remote: !!r.host });";
    // RED: cadb07780's road planted back — the task-state and status roads call the harness's TRANSCRIPT warm
    const RelTS = mutantCopies('a2-transcript-warm', REPO).load('src/transcript-service.js', tsSrc.replace(WARM_NOW, () => WARM_NOW.replace('warmTaskState', 'warmTranscript')), 'transcript-warm');
    const green = await scene({ createTranscriptService }, standIn('codex-green'));
    const red = await scene(RelTS, standIn('codex-red'));
    ok(tsSrc.split(WARM_NOW).length === 2 && green.nTask === 0 && !green.ran && ran(path.join(HOME_FAKE, 'codex-red')) && !ran(path.join(HOME_FAKE, 'codex-green')) && Array.isArray(green.ans && green.ans.todos),
      `a codex conversation's task state (GET /api/session-todos, a Properties window at every broadcast): ${green.nTask} listings of the codex store on this thread, no codex started; RED (the transcript warm on this road — cadb07780): ${red.nTask} listings and a codex app-server started for a thread this machine does not hold (${red.ran})`, { green, red });
    ok(nReader > 0 && green.nStatus === nReader && red.nStatus > nReader,
      `status(): the listings its reader makes (${nReader}, chatStatus finds the rollout as the release did) and no warm's on top (${green.nStatus}); RED: ${red.nStatus}`);
    // claude: its own task-state warm, awaited before the reader is built — on both roads
    const calls = [];
    H.store.warmTaskState = async (...a) => { calls.push('warm'); await realWts(...a); calls.push('warmed'); order.push('warmed'); };
    try {
      const svc = createTranscriptService({ activeSessions: new Map(), createSessionMessages: mkReader, hosts: null });
      order.length = 0; await svc.taskState({ backend: 'claude', sessionId: sid, cwd }); const o1 = order.join(' ');
      order.length = 0; await svc.status({ backend: 'claude', sessionId: sid, cwd }); const o2 = order.join(' ');
      ok(o1 === 'warmed reader' && o2 === 'warmed reader' && calls.length === 4,
        `claude: status() and taskState() await ITS task-state warm (the task scan) before the reader answers (${o1} · ${o2})`);
    } finally { H.store.warmTaskState = realWts; }
    // B-952b: A LIVE CODEX CONVERSATION'S «AGENT STEPS» ARE ITS WRAPPER'S PLAN — the task-state road hands the reader the session's
    // own id (its key in activeSessions, the webui id the wrapper was spawned with), so BUFFERS_DIR/<id>.json is read. RED CONTROL:
    // the base's road (no id) ⇒ no side file read ⇒ [] (the row: «empty on every road»)
    {
      const bdir = path.join(os.homedir(), 'buf'), wid = 'w-b952b', ctid = 'eeeeeeee-0000-4000-8000-0000000b952b';
      fs.mkdirSync(bdir, { recursive: true });
      fs.writeFileSync(path.join(bdir, wid + '.json'), JSON.stringify({ plan: [{ step: 'Read the failing test', status: 'completed' }, { step: 'Write the cure', status: 'inProgress' }, { step: 'Gate it', status: 'pending' }] }));
      const liveS = { backend: 'codex', mode: 'chat', backendSessionId: ctid, cwd, buffer: '' };
      const mk2 = (s0, id) => (s0.backend === 'codex' ? new CS.CodexSessionMessages(s0, id, { buffersDir: bdir }) : new SS.SessionMessages(s0, id || null, { buffersDir: bdir, permissionModes: [] }));
      const stepsOf = async (TS) => ((await TS.createTranscriptService({ activeSessions: new Map([[wid, liveS]]), createSessionMessages: mk2, hosts: null }).taskState({ backend: 'codex', sessionId: ctid, cwd })) || {}).todos || [];
      const CALL = 'createSessionMessages(sessionShape(r, live), liveIdOf(live))';
      const got = await stepsOf({ createTranscriptService });
      const noId = mutantCopies('b952b-no-id', REPO).load('src/transcript-service.js', tsSrc.replace(CALL, () => 'createSessionMessages(sessionShape(r, live))'), 'no-id');
      const base = await stepsOf(noId);
      ok(tsSrc.split(CALL).length === 2 && got.length === 3 && got.map((t) => t.status).join(',') === 'completed,in_progress,pending' && got[1].content === 'Write the cure' && base.length === 0,
        `B-952b: a LIVE codex conversation's «Agent steps» (GET /api/session-todos) are its wrapper's plan — ${got.length} steps, their states mapped; RED CONTROL (the reader without the session's id, the base): ${base.length} steps`, { got, base });
      // …a LIVE claude conversation on the same road: its task state now comes from its wrapper's side file FIRST (the wrapper's
      // todos when it holds some), as the attach's does — Properties and the chat agree. RED CONTROL: no id ⇒ the transcript's alone
      const clId = 'w-b952b-cl';
      fs.writeFileSync(path.join(bdir, clId + '.json'), JSON.stringify({ todos: [{ content: 'Ship the restated leg', status: 'in_progress', activeForm: 'Shipping the restated leg' }] }));
      const liveC = { backend: 'claude', mode: 'chat', claudeSessionId: sid, backendSessionId: sid, cwd, buffer: '' };
      const todosC = async (TS) => ((await TS.createTranscriptService({ activeSessions: new Map([[clId, liveC]]), createSessionMessages: mk2, hosts: null }).taskState({ backend: 'claude', sessionId: sid, cwd })) || {}).todos || [];
      const gotC = await todosC({ createTranscriptService }), baseC = await todosC(noId);
      ok(gotC.length === 1 && gotC[0].content === 'Ship the restated leg' && !baseC.some((t) => t.content === 'Ship the restated leg'),
        `B-952b, claude on the same road: a LIVE claude conversation's task state comes from its wrapper's side file first, as the attach's does (the wrapper's one todo); RED CONTROL (no id): the transcript's alone (${baseC.length} todos, none the wrapper's)`, { gotC, baseC });
    }
    // THE ROUTE + THE SERVICE (its read, S1): the route hands every harness its machine; the task-state road asks that machine
    // only for a harness whose task state reads its transcript (claude) — a codex conversation on m1 is answered here, as the
    // release did (its steps are the wrapper's side file): no device op, no remote find + copy, nothing listed or started.
    // RED: the service with no such rule (dec3d0da0) ⇒ m1 asked for a codex answer that cannot differ, at every refetch
    const asked = [];
    const hosts = {
      deviceBounded: async (h) => ({ connect: async () => ({ info: { capabilities: ['transcript-op'] } }), transcriptOp: async (m, ref) => { asked.push(`${h}:${m}:${ref.backend}`); return { todos: [{ content: 'held on m1', status: 'pending' }] }; } }),
      fetchTranscript: async (h, b) => { asked.push(`fetch:${h}:${b}`); throw new Error('no fetch in this leg'); },
    };
    const routeOf = async (R, backend) => {
      R.setup({ activeSessions: new Map(), webuiPids: new Set(), refreshWebuiPids: () => { }, createSessionMessages: mkReader, BUFFERS_DIR: path.join(os.homedir(), 'buf'), PERMISSION_MODES: [], execFileSync, hosts, accounts: null, sessionAuth: () => ({}), serverSetting: () => undefined });
      const layer = R.router.stack.find((l) => l.route?.path === '/api/session-todos');
      asked.length = 0; CTR._resetForTests(); CTR.configure({ codexCmd: standIn('codex-route'), enabled: true });
      let body = null;
      const n = await listing(async () => { body = await new Promise((resolve, reject) => { const res = { json: resolve, status: () => res }; Promise.resolve(layer.route.stack[0].handle({ query: { backend, backendSessionId: backend === 'codex' ? tid : sid, cwd, host: 'm1' } }, res)).catch(reject); }); });
      return { todos: (body && body.todos) || [], asked: asked.join(' '), n, ran: ran(path.join(HOME_FAKE, 'codex-route')) };
    };
    const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8'), TSREQ = "const { createTranscriptService } = require('../transcript-service');";
    const GATE = "    const viaDev = fromTranscript ? await tryDevice(r, 'taskState', {}) : undefined;\n    if (viaDev) return viaDev;\n    if (fromTranscript) await refreshRemote(r);\n";
    const tsNoGate = mutantCopies('a2-route-gate', REPO).write('src/transcript-service.js', tsSrc.replace(GATE, () => "    const viaDev = await tryDevice(r, 'taskState', {});\n    if (viaDev) return viaDev;\n    await refreshRemote(r);\n"), 'no-gate');   // stale-pins: kept (dec3d0da0's road, planted back as the RED control)
    const R0 = require(path.join(REPO, 'src/routes/sessions.js'));
    const cGreen = await routeOf(R0, 'codex'), clGreen = await routeOf(R0, 'claude');
    const cRed = await routeOf(mutantCopies('a2-route-gate-r', REPO).load('src/routes/sessions.js', rsrc.replace(TSREQ, () => `const { createTranscriptService } = require(${JSON.stringify(tsNoGate)});`), 'no-gate-route'), 'codex');
    ok(tsSrc.split(GATE).length === 2 && rsrc.split(TSREQ).length === 2 && rsrc.includes('cwd, host: host || null });') && cGreen.asked === '' && cGreen.todos.length === 0 && cGreen.n === 0 && !cGreen.ran && clGreen.asked === 'm1:taskState:claude' && clGreen.todos[0]?.content === 'held on m1' && cRed.asked.includes('m1:taskState:codex'),
      `GET /api/session-todos on m1: a codex conversation answered here as the release did (${cGreen.todos.length} steps; asked of m1: «${cGreen.asked}»; ${cGreen.n} listings, nothing started); a claude one asked of m1 (${clGreen.asked}); RED (no descriptor rule — dec3d0da0): the codex one asked of m1 (${cRed.asked})`, { cGreen, clGreen, cRed });
    // its TAKEN verdict (small 1): the machine rule reads the descriptor's OWN field (taskStateFromTranscript), never the warm hook
    // as a second meaning — a codex store that gains a warm stays answered here; one that DECLARES the field is asked of m1. RED: a
    // service that reads the warm hook ⇒ the warm alone sends a codex conversation's ask to m1
    {
      const HX = require(path.join(REPO, 'src/harnesses/codex.js')), FIELD = "store?.taskStateFromTranscript === true;";
      const tsWarmRule = mutantCopies('a2-route-field', REPO).write('src/transcript-service.js', tsSrc.replace(FIELD, () => "store?.warmTaskState ? true : false;"), 'warm-rule');
      const RW = mutantCopies('a2-route-field-r', REPO).load('src/routes/sessions.js', rsrc.replace(TSREQ, () => `const { createTranscriptService } = require(${JSON.stringify(tsWarmRule)});`), 'warm-rule-route');
      const had = { w: HX.store.warmTaskState, f: HX.store.taskStateFromTranscript };
      let warmOnly = null, declared = null, warmRed = null;
      try {
        HX.store.warmTaskState = async () => true; delete HX.store.taskStateFromTranscript;
        warmOnly = await routeOf(R0, 'codex'); warmRed = await routeOf(RW, 'codex');
        HX.store.taskStateFromTranscript = true; declared = await routeOf(R0, 'codex');
      } finally { if (had.w === undefined) delete HX.store.warmTaskState; else HX.store.warmTaskState = had.w; if (had.f === undefined) delete HX.store.taskStateFromTranscript; else HX.store.taskStateFromTranscript = had.f; }
      const H0 = require(path.join(REPO, 'src/harnesses/claude.js'));
      ok(tsSrc.split(FIELD).length === 2 && H0.store.taskStateFromTranscript === true && warmOnly.asked === '' && declared.asked === 'm1:taskState:codex' && warmRed.asked.includes('m1:taskState:codex'),
        `the machine rule is the descriptor's own field: a codex store with a warm hook alone is answered here («${warmOnly.asked}»), one that declares taskStateFromTranscript is asked of m1 (${declared.asked}); RED (the warm hook read as that meaning): ${warmRed.asked}`, { warmOnly, declared, warmRed });
    }
  }
  console.log('⑥ the subagent metas (B-299b A4): chatStatus probes no project folder for a field nothing reads');
  {
    for (let k = 0; k < 30; k++) fs.mkdirSync(path.join(projects, `-tmp-other-${k}`), { recursive: true });   // the release listed them all, probed each
    const sub = path.join(projDir, sid, 'subagents'); fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'agent-a1.meta.json'), JSON.stringify({ description: 'a helper', agentType: 'general-purpose' }));
    fs.writeFileSync(fp, JSON.stringify({ uuid: 'm1', timestamp: T3, type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 10, output_tokens: 2 } } }) + '\n');
    await SS.warmSessionJsonlAsync(sid, cwd);
    const PROBES = ['existsSync', 'readdirSync', 'readFileSync', 'statSync'];
    const probing = (fn) => { let n = 0; const real = {}; for (const k of PROBES) { real[k] = fs[k]; fs[k] = function (p0, ...a) { if (typeof p0 === 'string' && /[/\\]subagents(?:[/\\]|$)/.test(p0)) n++; return real[k].call(this, p0, ...a); }; } try { fn(); } finally { for (const k of PROBES) fs[k] = real[k]; } return n; };
    let st = null; const n = probing(() => { st = mk().chatStatus(); });
    // RED: the release's walk, planted back into chatStatus (its text verbatim, 2.369.408)
    // the release's text, verbatim at run time; split at its home spelling in the SOURCE only — test-fixture-isolation reads every
    // suite's source for writes rooted at the real ~/.claude and would read this planted text's bindings as this suite's own
    const RELEASE = "function getSubagentMetas(claudeSessionId, cwd) {\n  const projectsDir = path.join(os.homedir" + "(), '.claude', 'projects');\n  const projDir = cwdToProjectDir(cwd || '');\n  const candidates = [];\n  if (cwd) candidates.push(path.join(projectsDir, projDir, claudeSessionId, 'subagents'));\n  try {\n    for (const dir of fs.readdirSync(projectsDir)) {\n      const fp = path.join(projectsDir, dir, claudeSessionId, 'subagents');\n      if (!candidates.includes(fp)) candidates.push(fp);\n    }\n  } catch {}\n  for (const subDir of candidates) {\n    try {\n      if (!fs.existsSync(subDir)) continue;\n      const metas = [];\n      for (const f of fs.readdirSync(subDir)) {\n        if (!f.endsWith('.meta.json')) continue;\n        try {\n          const meta = JSON.parse(fs.readFileSync(path.join(subDir, f), 'utf-8'));\n          const agentId = f.replace('agent-', '').replace('.meta.json', '');\n          metas.push({ agentId, description: meta.description || '', agentType: meta.agentType || '' });\n        } catch {}\n      }\n      return metas;\n    } catch {}\n  }\n  return [];\n}"; // stale-pins: kept (the release's walk, planted back as the RED control)
    const ssrc = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8'), NOW_LINE = 'subagentMetas: [], // B-299b A4: no reader (the walk that filled it held the loop)';
    const RS = mutantCopies('a4-release-metas', REPO).load('src/session-store.js', ssrc.replace(NOW_LINE, `subagentMetas: (${RELEASE.replace('function getSubagentMetas', 'function')})(getHistorySessionId(this._session), this._session.cwd),`), 'release');
    const rsm = (id) => new RS.SessionMessages({ backend: 'claude', backendSessionId: id, claudeSessionId: id, cwd }, null, { buffersDir: path.join(os.homedir(), 'buf'), permissionModes: [] });
    let rst = null; probing(() => { rst = rsm(sid).chatStatus(); });
    // the usual conversation has NO helper folder: the release probed every project folder for it
    const sid2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2'; fs.writeFileSync(path.join(projDir, sid2 + '.jsonl'), fs.readFileSync(fp));
    await SS.warmSessionJsonlAsync(sid2, cwd);
    let st2 = null; const n2 = probing(() => { st2 = new SS.SessionMessages({ backend: 'claude', backendSessionId: sid2, claudeSessionId: sid2, cwd }, null, { buffersDir: path.join(os.homedir(), 'buf'), permissionModes: [] }).chatStatus(); });
    const nRel = probing(() => { rsm(sid2).chatStatus(); });
    ok(ssrc.split(NOW_LINE).length === 2 && st && st.subagentMetas.length === 0 && n === 0 && st.model === 'claude-opus-5-5' && st2 && st2.subagentMetas.length === 0 && n2 === 0,
      `chatStatus after the warm: ${n} and ${n2} probes of a helper folder (a conversation with helpers, one without), the field empty as on every other harness (no client, CLI or doc reads it)`);
    ok(nRel >= 31 && rst && rst.subagentMetas.length === 1 && rst.subagentMetas[0].agentId === 'a1', `RED CONTROL — the release's walk for a conversation with no helper folder: ${nRel} probes on the main thread (one per project folder), for a field nothing reads (with one, it carried ${rst && rst.subagentMetas.length} meta)`);
  }
  console.log('⑦ the merge (B-299b A5): a reader after one new buffer record parses that record, never the whole buffer, and builds no position map — the RELEASE\'s merge planted back beside it');
  {
    // r2 (its read, M1 + S1): the control is the release's OWN _ensureParsed (7b89ef14c, the checkpoint 2.369.410's text,
    // verbatim) planted into a module copy — its own parse cache and merge memo — so a reader of it pays what every reader
    // paid on the release, and every step's merged history is compared with the release's, never with itself
    const REL_ENSURE = "  _ensureParsed() {\n    if (this._all) return;\n    const session = this._session;\n    const historySessionId = getHistorySessionId(session);\n    const jsonl = historySessionId ? parseSessionJsonl(historySessionId, session.cwd) : [];\n    // THE MERGE MEMO (perf chunk C): the merge below is a pure function of\n    // (the jsonl array, the buffer string) and the cache hands back the SAME\n    // array until the file changes, so a burst of SessionMessages over one\n    // session (a reconnect storm: chatStatus + pending permissions per\n    // re-attach) merges once. `_all` is shared exactly as the no-insert case\n    // always shared the cache's array; `_pendingPerms` is copied per instance.\n    const buffer = session.buffer || '';\n    const kept = session._keptFiles || null; // the restore's preload (a new map ⇒ a new merge)\n    const memo = _mergeMemo.get(jsonl);\n    if (memo && memo.buffer === buffer && memo.kept === kept) {\n      this._pendingPerms = { ...memo.perms };\n      this._helperResults = memo.helperResults || [];\n      this._all = memo.all;\n      this._display = this._all.filter(isDisplayMessage);\n      return;\n    }\n    const uuids = new Set();\n    const msgIds = new Set();\n    for (const m of jsonl) {\n      if (m.uuid) uuids.add(m.uuid);\n      // Streaming stdout events can carry a PLACEHOLDER uuid (…-000000000001)\n      // while the JSONL record for the SAME message has the real one — uuid\n      // dedup misses those and the stale buffer copy would render pinned after\n      // the entire history. message.id (msg_…) is stable across both copies.\n      const mid = m.message?.id;\n      if (mid) msgIds.add(mid);\n    }\n\n    this._pendingPerms = {};\n    this._helperResults = []; // verify r3: the helpers' tool_results the record list skips (they settle an asked ask at the rebuild)\n    // Surviving buffer records are INTERLEAVED at their true chronological\n    // position (right after the JSONL record their buffer-neighborhood dedups\n    // against) instead of all appended at the end. Stream-json stdout-only\n    // records (result/init/control_*) never dedup — appended at the end, an\n    // EARLIER turn's `result` replayed AFTER a still-running tool_use and the\n    // normalizer flushed the live pending tool card to ✗ Interrupted on every\n    // server restart (real user report); end-append also scrambled turn\n    // boundaries in the replay. The buffer is chronological, so the index of\n    // the last JSONL-matched record is a correct position anchor.\n    const jsonlPos = new Map(); // 'u:<uuid>' | 'm:<message.id>' → jsonl index\n    jsonl.forEach((m, i) => {\n      if (m.uuid) jsonlPos.set('u:' + m.uuid, i);\n      const mid = m.message?.id;\n      if (mid && !jsonlPos.has('m:' + mid)) jsonlPos.set('m:' + mid, i);\n    });\n    const parsed = [];\n    for (const line of buffer.split('\\n')) {\n      const trimmed = line.replace(/\\r/g, '').trim();\n      if (!trimmed) continue;\n      try { const rec = JSON.parse(trimmed); parsed.push(rec && rec.webui_copy ? KC.resolveRecord(rec, kept, (m) => console.warn(`[kept] ${this._sessionId || 'a session'}: ${m}`)) : rec); } catch {}\n    }\n    // A ROTATED buffer can start with unmatched stdout-only records from mid-\n    // history; anchor those just before the first matched record (not at the\n    // very start) — much closer to their true position.\n    let firstHit = -1;\n    for (const msg of parsed) {\n      const hitU = msg.uuid != null ? jsonlPos.get('u:' + msg.uuid) : undefined;\n      const hit = hitU !== undefined ? hitU : (msg.message?.id ? jsonlPos.get('m:' + msg.message.id) : undefined);\n      if (hit !== undefined) { firstHit = hit; break; }\n    }\n    let anchor = firstHit >= 0 ? firstHit - 1 : jsonl.length - 1;\n    const inserts = new Map(); // jsonl index (-1 = before all) → [records]\n    let anyInsert = false;\n    for (const msg of parsed) {\n      if (msg.type === 'control_request' && msg.request?.tool_use_id) { this._pendingPerms[msg.request.tool_use_id] = msg; }\n      const hitU = msg.uuid != null ? jsonlPos.get('u:' + msg.uuid) : undefined;\n      const hit = hitU !== undefined ? hitU : (msg.message?.id ? jsonlPos.get('m:' + msg.message.id) : undefined);\n      if (hit !== undefined) { if (hit > anchor) anchor = hit; continue; } // in JSONL — advances the position cursor\n      const isControl = msg.type === 'control_request' || msg.type === 'control_response' || msg.type === 'control_cancel_request';\n      if (!isControl) {\n        if (isSubagentMessage(msg)) { this._noteHelperResult(msg); continue; }\n        // a claude wrapper's copy of a MID-TURN frame (`webui_copy`, lane claude-steer-inject r2) is the only record of\n        // those words the transcript may hold — never dropped for a later user record (a tool_result is one); the\n        // normalizer draws it once (src/message-manager.js _processUser)\n        if (msg._fromWebui && msg.timestamp && !msg.webui_copy) {\n          if (jsonl.some(m => m.type === 'user' && m.timestamp >= msg.timestamp)) continue;\n        }\n      }\n      const list = inserts.get(anchor) || inserts.set(anchor, []).get(anchor);\n      list.push(msg);\n      anyInsert = true;\n    }\n    if (!anyInsert) this._all = jsonl;\n    else {\n      const all = [...(inserts.get(-1) || [])];\n      for (let i = 0; i < jsonl.length; i++) {\n        all.push(jsonl[i]);\n        const ins = inserts.get(i);\n        if (ins) all.push(...ins);\n      }\n      this._all = all;\n    }\n    _mergeMemo.set(jsonl, { buffer, kept, all: this._all, perms: { ...this._pendingPerms }, helperResults: this._helperResults });\n    this._display = this._all.filter(isDisplayMessage);\n  }\n";   // stale-pins: kept — the release's merge, planted back as the control
    const ssrc7 = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8');
    const ensureOf = (src) => { const i = src.indexOf('  _ensureParsed() {'), j = src.indexOf('\n  get total() {', i); return i < 0 || j < 0 ? null : src.slice(i, j); };
    const MC7 = mutantCopies('a5-merge', REPO);
    const plant = (tag, edits) => {
      let t = ssrc7;
      for (const [x, y] of edits) { if (t.split(x).length !== 2) throw new Error(`⑦ (${tag}): its anchor is not ONE site: ${x.slice(0, 70)}`); t = t.replace(x, () => y); }
      return MC7.load('src/session-store.js', t, tag);
    };
    const REL = plant('release', [[ensureOf(ssrc7), REL_ENSURE]]);
    const KEEP_TAIL = "  if (keyed && !(same && end <= from)) _bufRecsOf.set(session, { head: flatCopy(buffer.slice(0, Math.min(BUF_PROBE, end))), tail: flatCopy(buffer.slice(Math.max(0, end - BUF_PROBE), end)), len: end, recs, kept });\n  if (end < buffer.length) { recs = recs.slice(); parse(buffer.slice(end), recs); }";
    const MUT = {   // each guard of bufferRecordsOf / userAtOrAfter taken out, and the step it must turn red
      partialKept: [plant('partial-kept', [[KEEP_TAIL, "  if (end < buffer.length) { recs = recs.slice(); parse(buffer.slice(end), recs); }\n  if (keyed) _bufRecsOf.set(session, { head: flatCopy(buffer.slice(0, Math.min(BUF_PROBE, buffer.length))), tail: flatCopy(buffer.slice(Math.max(0, buffer.length - BUF_PROBE))), len: buffer.length, recs, kept });"]]), 'splitB'],
      lengthOnly: [plant('length-only', [['buffer.length >= c.len && buffer.startsWith(c.head) && buffer.startsWith(c.tail, c.len - c.tail.length)', 'buffer.length >= c.len']]), 'trim'],
      keptIgnored: [plant('kept-ignored', [['c && c.kept === kept && buffer.length', 'c && buffer.length']]), 'keptSet'],
      noUserStamp: [plant('no-user-stamp', [['if (typeof ts === \'string\' && pos.userTsAll) return pos.userTs !== null && pos.userTs >= ts;', 'if (typeof ts === \'string\' && pos.userTsAll) return false;']]), 'first'],
    };
    const T7 = (k) => new Date(Date.parse(T1) + k * 1000).toISOString();
    const SHA7 = 'ab'.repeat(16);
    const PIC64 = Buffer.from('the kept picture').toString('base64');   // the kept picture, resolved (keptSet) — a «gone» reference before its map (keptNull)
    // ONE session object through the buffer's roads (an append, a line split across two appends, a ring trim cut mid-line, a
    // kept copy read before its map landed and after): each step's merged history + the JSON.parse calls the read made
    const drive = async (M, N) => {
      const sidM = `cccccccc-0000-4000-8000-${String(N).padStart(12, '0')}`, fM = path.join(projDir, sidM + '.jsonl');
      const tRec = (k) => JSON.stringify({ uuid: `j${N}-${k}`, timestamp: T7(k), type: k % 2 ? 'assistant' : 'user', message: { id: `msg_${N}_${k}`, role: k % 2 ? 'assistant' : 'user', content: [{ type: 'text', text: `record ${k}` }] } });
      fs.writeFileSync(fM, Array.from({ length: N }, (_, k) => tRec(k)).join('\n') + '\n');   // every drive from the same transcript (r3: a drive appends to it)
      await M.warmSessionJsonlAsync(sidM, cwd);
      const live = (k) => JSON.stringify({ uuid: `b${N}-${k}`, timestamp: T7(N + k), type: 'assistant', message: { id: `msg_b${N}_${k}`, role: 'assistant', content: [{ type: 'text', text: `live ${k}` }] } });
      const typed = (ts, text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text }, _fromWebui: true, timestamp: ts });
      const session = { backend: 'claude', backendSessionId: sidM, claudeSessionId: sidM, cwd,
        buffer: [...Array.from({ length: 150 }, (_, k) => live(k)), typed(T7(10), 'typed, the transcript holds a later user record'), ...Array.from({ length: 150 }, (_, k) => live(150 + k)), typed(T7(N + 999), 'typed, not in the transcript yet')].join('\n') + '\n' };
      const c0 = { ...M._mergeCounts }, steps = {};
      const read = (name) => {
        let n = 0; const realParse = JSON.parse;
        JSON.parse = function (...x) { n++; return realParse.apply(this, x); };
        let all; try { all = new M.SessionMessages(session, null, { buffersDir: path.join(os.homedir(), 'buf'), permissionModes: [] }).raw(); } finally { JSON.parse = realParse; }
        const mc = M._mergeCounts || {};
        steps[name] = { json: JSON.stringify(all), len: all.length, parses: n, pos: (mc.posBuilt || 0) - (c0.posBuilt || 0), ext: (mc.posExtended || 0) - (c0.posExtended || 0), idx: (mc.posIndexed || 0) - (c0.posIndexed || 0) };
      };
      read('first');
      session.buffer += live(300) + '\n'; read('one');                                   // ONE new record
      fs.appendFileSync(fM, [tRec(N), tRec(N + 1), tRec(N + 2), live(300)].join('\n') + '\n');   // r3: the TRANSCRIPT gains three records + the buffered one the CLI wrote
      await M.warmSessionJsonlAsync(sidM, cwd); read('tAppend');                         // the tail cache's append: a NEW array of the old records + four
      fs.appendFileSync(fM, tRec(N + 3) + '\n'); await M.warmSessionJsonlAsync(sidM, cwd);   // r4: TWO appends with no read between
      fs.appendFileSync(fM, tRec(N + 4) + '\n'); await M.warmSessionJsonlAsync(sidM, cwd); read('tAppend2');
      const half = live(301); session.buffer += half.slice(0, 40); read('splitA');        // a record split across two appends
      session.buffer += half.slice(40) + '\n'; read('splitB');
      session.buffer = (session.buffer + live(302) + '\n').slice(37); read('trim');      // the ring trimmed, cut mid-line, no shorter
      session.buffer += JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'see' }, { type: 'image', source: { type: 'kept', sha: SHA7, ext: 'png', media_type: 'image/png' } }] }, _fromWebui: true, webui_copy: true, timestamp: T7(N + 303) }) + '\n';
      read('keptNull');                                                                  // read before the restore's preload landed
      session._keptFiles = new Map([[SHA7 + '.png', Buffer.from('the kept picture')]]); read('keptSet');
      return { steps, userScans: M._mergeCounts ? M._mergeCounts.userScans - c0.userScans : null };
    };
    const STEPS = ['first', 'one', 'tAppend', 'tAppend2', 'splitA', 'splitB', 'trim', 'keptNull', 'keptSet'];
    for (const N of [1000, 10000]) {
      const now = await drive(SS, N), rel = await drive(REL, N);
      const differ = STEPS.filter((k) => now.steps[k].json !== rel.steps[k].json);
      const s1 = now.steps.one, r1 = rel.steps.one;
      ok(s1.parses === 1 && s1.pos === 1 && r1.parses === 303 && s1.len === N + 302,
        `${N} transcript records + a 302-line buffer, one record new: the reader parses ${s1.parses} line and builds no position map past its first (${s1.pos} in all); the release's reader parses ${r1.parses} (RED CONTROL: the release, planted back)`, { now: s1.parses, rel: r1.parses, pos: s1.pos });
      ok(differ.length === 0 && now.steps.splitB.parses === 1 && now.steps.keptSet.json.includes(PIC64) && !now.steps.keptNull.json.includes(PIC64) && now.steps.keptNull.json.includes('"gone":true'),
        `every step's merged history is the release's, byte for byte (an append; a line split across two appends — parsed once it ends: ${now.steps.splitB.parses}; a trim cut mid-line; a kept picture before and after its map) — ${STEPS.length} steps at ${N}`, { differ });
      ok(now.userScans === 0, `the typed-record check asks the transcript's greatest user stamp: ${now.userScans} scans of the ${N} records (the release scanned them for every typed record at every merge)`);
      const ta = now.steps.tAppend, tb = now.steps.tAppend2;
      ok(ta.pos === 1 && ta.ext === 1 && ta.idx - now.steps.one.idx === 4 && ta.parses === 0 && tb.pos === 1 && tb.ext === 2 && tb.idx - ta.idx === 2,
        `r3 (its re-read's MUST): the transcript gained 4 records (a NEW array from the tail cache): the index MOVED (${ta.ext}), ${ta.idx - now.steps.one.idx} records indexed, no rebuild (${ta.pos} build in all) — the release rebuilt the map over all ${N + 4}; two more appends with no read between: still moved (${tb.ext}), 2 indexed (r4: the cache entry carries the array last indexed)`, { ta, tb });
    }
    const NOEXT = plant('no-extend', [['  pos = prevPos ? extendPos({ arr: prev, pos: prevPos }, jsonl) : null;\n', '  pos = null;\n']]);
    const ne = await drive(NOEXT, 1000);
    ok(ne.steps.tAppend.pos === 2 && ne.steps.tAppend.json === (await drive(REL, 1000)).steps.tAppend.json, `RED CONTROL (no extension — the r2 index): the transcript's append REBUILT the map (${ne.steps.tAppend.pos} builds), the same history`);
    // r3: the tail window's SLIDE (a transcript past 32 MB: an append drops head records) and a partial last line read again —
    // on the index itself, against the release's own map rule over the new array (uuid: the last record; message.id: the first)
    const slide = (M) => {
      const mk = (i) => ({ uuid: `s-${i % 97 === 0 ? 'dup' : i}`, type: i % 3 ? 'assistant' : 'user', timestamp: T7(i % 50 === 0 ? 9e6 - i : i), message: { id: `msg_s_${Math.floor(i / 2)}` } });
      const A = Array.from({ length: 400 }, (_, i) => mk(i)); A.push({ type: 'assistant', uuid: 's-399', message: { id: 'msg_s_partial' } });   // its last line still being written
      M._jsonlPosOf(A);
      const B = A.slice(37, A.length - 1).concat(Array.from({ length: 6 }, (_, k) => mk(400 + k)));
      const c = { ...M._mergeCounts }, pB = M._jsonlPosOf(B, null, A);   // its predecessor handed as the cache entry carries it
      const rel = new Map(); B.forEach((m, i) => { if (m.uuid) rel.set('u:' + m.uuid, i); const mid = m.message?.id; if (mid && !rel.has('m:' + mid)) rel.set('m:' + mid, i); });
      const gone = ['u:s-1', 'u:s-36', 'm:msg_s_partial', 'm:msg_s_17'];
      const bad = [...rel].filter(([k, i]) => pB.idx(k, k.startsWith('u:')) !== i).map(([k]) => k).concat(gone.filter((k) => pB.idx(k, k.startsWith('u:')) !== undefined));
      const x = T7(9e6 - 10);   // between the greatest stamp that slid out (9e6) and the greatest left (9e6 − 150)
      const release = B.some((m) => m.type === 'user' && m.timestamp >= x);
      const stampSame = M._userAtOrAfter(pB, B, x) === release, r1 = M._mergeCounts.userRescans - c.userRescans; M._userAtOrAfter(pB, B, x);
      return { bad, ext: M._mergeCounts.posExtended - c.posExtended, built: M._mergeCounts.posBuilt - c.posBuilt, idx: M._mergeCounts.posIndexed - c.posIndexed, stampSame, release, rescans: [r1, M._mergeCounts.userRescans - c.userRescans].join(',') };
    };
    const sl = slide(SS);
    ok(sl.bad.length === 0 && sl.ext === 1 && sl.built === 0 && sl.idx === 6 && sl.stampSame && sl.release === false && sl.rescans === '1,1',
      `r3: a slide of 37 head records + a partial last line read again + 5 new: every key answers the release's index over the new array, the slid ones none; ${sl.idx} records indexed, no rebuild; the greatest user stamp that slid out is asked again ONCE (the answer the release gives; rescans ${sl.rescans})`, sl);
    const noShift = slide(plant('no-base-shift', [['  pos.base = base0 + d;\n', '  pos.base = base0;\n']])), noStale = slide(plant('no-stale-stamp', [['m.timestamp >= pos.userTs) pos.userTsStale = true;', 'm.timestamp >= pos.userTs) pos.userTsStale = false;']]));
    ok(noShift.bad.length > 0 && !noStale.stampSame, `RED CONTROLS: the base not moved ⇒ ${noShift.bad.length} keys answer the wrong record; the slid-out stamp kept ⇒ a typed record is dropped that the release keeps`, { noShift: noShift.bad.slice(0, 4), noStale });
    for (const [name, [M, step]] of Object.entries(MUT)) {
      const mut = await drive(M, 1000), rel = await drive(REL, 1000);
      ok(mut.steps[step].json !== rel.steps[step].json, `RED CONTROL (${name}): the guard taken out ⇒ the «${step}» step's merged history is not the release's`);
    }
  }
  console.log('⑦b the position index is counted (the cure, small): the transcript tails\' census row carries the indexes their merges keep');
  {
    const ssrcB = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8'), ROW = 'bytes: _jsonlResident + ix.bytes,';
    const RelC = mutantCopies('a5-census', REPO).load('src/session-store.js', ssrcB.replace(ROW, () => 'bytes: _jsonlResident,'), 'uncounted');   // RED: cadb07780's row — stale-pins: kept (planted back as the RED control)
    const NC = 400;
    const sceneC = async (M, k) => {
      const sidC = `cccccccc-0000-4000-8000-0000000c${String(k).padStart(4, '0')}`, fC = path.join(projDir, sidC + '.jsonl');
      fs.writeFileSync(fC, Array.from({ length: NC }, (_, i) => JSON.stringify({ uuid: `pc${k}-${i}`, timestamp: T1, type: 'assistant', message: { id: `msg_pc${k}_${i}`, role: 'assistant', content: [{ type: 'text', text: 'x' }] } })).join('\n') + '\n');
      await M.warmSessionJsonlAsync(sidC, cwd);
      const before = M.jsonlCacheCensus(), ix0 = M._jsonlPosCensus();
      const session = { backend: 'claude', backendSessionId: sidC, claudeSessionId: sidC, cwd, buffer: JSON.stringify({ uuid: `pcb${k}`, timestamp: T3, type: 'assistant', message: { id: `msg_pcb${k}`, role: 'assistant', content: [{ type: 'text', text: 'live' }] } }) + '\n' };
      new M.SessionMessages(session, null, { buffersDir: path.join(os.homedir(), 'buf'), permissionModes: [] }).raw();   // the merge builds the tail's index
      const after = M.jsonlCacheCensus(), ix = M._jsonlPosCensus();
      return { grew: after.bytes - before.bytes, keys: ix.keys - ix0.keys, ords: ix.ords - ix0.ords, ixBytes: ix.bytes - ix0.bytes, basis: after.basis };
    };
    const c = await sceneC(SS, 1), r = await sceneC(RelC, 2);
    // its read (S4): the ordinal count stays TRUE across a slide (a head out, a partial last line read again, new records — the
    // unindex road): n = the ordinals the index holds; RED: a copy whose unindex never lowers it
    const nTrue = (M) => {
      const mk = (i) => ({ uuid: `n-${i}`, type: i % 3 ? 'assistant' : 'user', timestamp: T1, message: { id: `msg_n_${Math.floor(i / 2)}` } });
      const A = Array.from({ length: 300 }, (_, i) => mk(i)); A.push({ type: 'assistant', uuid: 'n-299p', message: { id: 'msg_n_partial' } });
      M._jsonlPosOf(A);
      const B = A.slice(25, A.length - 1).concat(Array.from({ length: 4 }, (_, k) => mk(300 + k)));
      const pB = M._jsonlPosOf(B, null, A);
      let held = 0; for (const v of pB.at.values()) held += v.length;
      return { n: pB.n, held };
    };
    const UNIX = '    if (i >= 0) { v.splice(i, 1); pos.n--; }\n';
    const nNow = nTrue(SS), nRed = nTrue(mutantCopies('a5-census-n', REPO).load('src/session-store.js', ssrcB.replace(UNIX, () => '    if (i >= 0) { v.splice(i, 1); }\n'), 'n-kept'));
    ok(ssrcB.split(UNIX).length === 2 && nNow.n === nNow.held && nNow.held > 0 && nRed.n > nRed.held, `the census's ordinal count across a slide = the ordinals held (${nNow.n} = ${nNow.held}); RED (the unindex never lowers it): ${nRed.n} counted for ${nRed.held} held`, { nNow, nRed });
    ok(ssrcB.split(ROW).length === 2 && c.keys === 2 * NC && c.ords === 2 * NC && c.ixBytes === c.keys * SS.POS_KEY_BYTES + c.ords * SS.POS_ORD_BYTES && c.grew === c.ixBytes && /position indexes/.test(c.basis) && r.keys === 2 * NC && r.grew === 0,
      `a merge over a cached tail of ${NC} records builds its index (${c.keys} keys, ${c.ords} ordinals ≈ ${c.ixBytes} B): the transcript tails' census row grew by exactly that and names it; RED (cadb07780's row): the same index (${r.keys} keys), the row grew ${r.grew} B`, { c, r });
  }
  console.log(fail ? `FAILED (${fail})` : `task-scan-loop test passed (${pass})`);
  process.exit(fail ? 1 : 0);
}
