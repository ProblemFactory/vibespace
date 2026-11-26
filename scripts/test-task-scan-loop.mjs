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
//  ⑤b (B-a60e + its remainder: THE ROLLOUT INDEX) on a planted tree of hundreds of rollouts in dated folders (a fake HOME):
//      status() of a codex conversation makes 0 SYNCHRONOUS listings on this thread from the first call, its records right
//      (RED: the release's sync find planted back); N askers in one moment ⇒ ONE walk (RED: a walk an asker); a sync ask during
//      the walk ⇒ «not known yet», then the path at the next ask, no press (RED: «none» for a find that came late); a walk that
//      fails ⇒ «not known yet», never «none» (RED: a failed walk read as «none»); the kept path's legs on the index — a MOVED
//      rollout, an AGED .zst (59 s kept, past the minute the first walk begun after it decides), the cap (a copy scaled to 2)
//  ⑥ (A4) chatStatus probes no project folder · ⑦ (A5) the merge parses the buffer lines it gained, against the release's merge
//     planted back (an append, a split line, a mid-line trim, a kept map landing late; each guard's mutant RED)
//  ⑦b (the cure) the position indexes the merges keep are counted in the transcript tails' census row (RED: cadb07780's row)
// Runs in a CHILD with a fake HOME (findSessionJsonlPath resolves into a throwaway projects dir — never the real ~/.claude).
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
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
  // B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
  // anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
  // crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
  function editAnchor(text, from, to, file, mode = 'one') {
    const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
    const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
    if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
    return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
  }
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
  const Rel = mutantCopies('task-scan-inline', REPO).load('src/session-store.js', editAnchor(src, CALL, 'Promise.resolve(taskLinesSince(fp, offset))', "src/session-store.js"), 'inline');
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
    let during = null, gateWarm = null, warmCalls = 0;   // gateWarm (B-a26e): the NEXT warm waits on this promise (the step-aside leg holds an attach in its waits); warmCalls counts them
    H.store.warmTaskState = (...x) => { warmCalls++; if (during) during(); if (gateWarm) { const g = gateWarm; gateWarm = null; return g.then(() => realWts(...x)); } return realWts(...x); };
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
      // B-80cb: the re-attach's reader door (readOffLoop → the claude reader's rawAsync: the worker's warm, which also scans the task
      // tools) refreshes the state too — the control takes BOTH warms away
      const noWarm = await scene(plantW('no-warm', [[WARM, ''], ['await readOffLoop(reSm, {', 'await (async () => null)(reSm, {']]), 2);
      ok(noWarm.second === 'pending', `RED CONTROL (no warm at the attach — neither the task warm nor the reader's door; the first rebuild's alone): the second attach answers the stale state (${noWarm.second})`, noWarm);
      const late = await scene(plantW('warm-after-join', [[WARM, ''], [JOIN, JOIN + '            await warmTaskStateFor(session);\n']]), 3);
      ok(late.second === 'completed' && late.probeAhead, 'RED CONTROL (the warm after the socket joined — the first cure\'s place): the stamped frame reached the new socket AHEAD of its `attached`', late);
      const noPend = await scene(plantW('no-pending-join', [[PEND, '']]), 4, SB, { resize: false });   // r2's own window (no resize: a resize would register the socket with no flag at all)
      ok(noPend.second === 'completed' && !noPend.unstamped, 'RED CONTROL (the warm before any join — r2\'s form): the unstamped frame never reached the new socket', noPend);
      const SEQ = '...(prev.pending ? { pending: true } : {}) } : {});';
      const dropped = await scene(plantW('pending-dropped', [[SEQ, ' } : {});']]), 6);
      ok(wshSrc.split(SEQ).length === 2 && dropped.probeAhead, 'RED CONTROL (a resize during the waits rebuilds the entry without its pending flag — r3): the stamped frame reached the new socket AHEAD of its `attached`', dropped);
      const noSkip = await scene(require(path.join(REPO, 'src/ws-handler.js')), 5, MCW.load('src/server/session-broadcast.js', editAnchor(sbSrc, SKIP, '      if (false) continue;', "src/server/session-broadcast.js"), 'no-pending-skip'));
      ok(sbSrc.split(SKIP).length === 2 && noSkip.probeAhead, 'RED CONTROL (the choke point without its pending skip): the stamped frame reached the pending socket AHEAD of its `attached`', noSkip);
      // B-a26e (主开发 r4686; the cure round's should, r4708 — no leg reached it): THE HUB's STEP-ASIDE, DRIVEN. Two attaches of one
      // conversation on ONE socket with the page's rising ids, one of them still in its waits (its warm held by the leg's gate) when
      // the other comes. The older one steps aside — it answers nothing — and the newer one is answered ONCE, in both orders: the
      // older first (a window asked again while its attach waited), the newer first (an attach queued while its socket was closing,
      // flushed after the reconnect's own). The fact judged is each attach's own handler promise settling (bounded, named).
      // RED CONTROLS: the step-asides taken out; the hub keeping the LAST id to arrive (4c2a64f15's form). THE SECOND STEP-ASIDE ALONE
      // (r4708's delta read: the first one always caught the older attach): a session REPLACED during the older attach's pre-join
      // waits reads again after the join (the hub's own road to it); that post-join read waits on the leg's gate while the newer
      // attach is answered — RED CONTROL: that one line taken out alone.
      const STEP = wshSrc.split('\n').filter((l) => l.includes('ws.__attachLatest.get(data.sessionId) > attachId) break;'));
      const SETMAX = 'if (attachId != null) { const M = ws.__attachLatest || (ws.__attachLatest = new Map()), was = M.get(data.sessionId); if (was == null || attachId > was) M.set(data.sessionId, attachId); }';
      const idsScene = async (WSH, n, first) => {
        const sidA = `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`, fA = path.join(projDir, sidA + '.jsonl');
        fs.writeFileSync(fA, [create(`a${n}-1`, T1, `tc-a${n}`, 'Attach it'), createRes(`a${n}-2`, T1, `tc-a${n}`, 1, 'Attach it')].join('\n') + '\n');
        const sessions = new Map();
        let gateRead = null;   // 'post': the first reader built for gateRead.for waits on gateRead.p (its rawAsync — what readOffLoop awaits)
        const ctx = new Proxy({ activeSessions: sessions, WS_OPEN: 1, BUFFERS_DIR: buf, SOCKETS_DIR: buf, fs, path, os, telemetry: { record() { } }, serverNotice() { }, activeSessionsPayload: () => [], resizeSessionToMin() { },
          broadcastActiveSessions() { }, broadcastToSession() { }, refreshWebuiPids() { }, readSessionMeta: () => null, writeSessionMeta() { }, readLayouts: () => ({}), writeLayouts() { },
          createSessionMessages: (s0, id) => { const sm = new SS.SessionMessages(s0, id, { buffersDir: buf, permissionModes: [] }); const g = gateRead; if (g && g.for === s0 && !g.used) { g.used = true; const ra = sm.rawAsync.bind(sm); sm.rawAsync = async (...x) => { g.entered = true; await g.p; return ra(...x); }; } return sm; } }, { has: () => true, get: (tg, k) => (k in tg ? tg[k] : undefined) });
        const on = {}, wss = { _heartbeatTimer: true, clients: new Set(), on: (ev, fn) => { on[ev] = fn; } };
        WSH.registerWsHandler(wss, ctx);
        const h = {}, frames = [];
        const sock = { readyState: 1, bufferedAmount: 0, send: (x) => frames.push(JSON.parse(x)), on: (ev, fn) => { h[ev] = fn; }, ping() { }, terminate() { }, close() { } };
        wss.clients.add(sock); on.connection(sock);
        await SS.warmSessionJsonlAsync(sidA, cwd);
        const mkS = () => ({ backend: 'claude', mode: 'chat', claudeSessionId: sidA, backendSessionId: sidA, cwd, clients: new Map(), _normalizer: createMessageManager('claude', sidA), _historyLoaded: true, _normEpoch: 1788550000000 });
        sessions.set(sidA, mkS());
        const within = (pr, ms) => Promise.race([pr.then(() => true, () => true), new Promise((r) => setTimeout(() => r(false), ms))]);
        const answersOf = () => frames.filter((f) => f.type === 'attached' && f.sessionId === sidA).map((f) => f.attachId);
        const w0 = warmCalls;
        const acksOf = () => frames.filter((f) => f.type === 'attach-ack' && f.sessionId === sidA && !('progress' in f)).map((f) => f.attachId);   // the synchronous ack (its re-acks carry `progress`)
        if (first === 'two') {   // a SECOND socket (another tab or device) with its own, lower id: answered — the newest is kept per socket
          const h2 = {}, frames2 = [];
          const sock2 = { readyState: 1, bufferedAmount: 0, send: (x) => frames2.push(JSON.parse(x)), on: (ev, fn) => { h2[ev] = fn; }, ping() { }, terminate() { }, close() { } };
          wss.clients.add(sock2); on.connection(sock2);
          const dX = await within(Promise.resolve(h.message(JSON.stringify({ type: 'attach', sessionId: sidA, attachId: 5 }))), 8000);
          const dY = await within(Promise.resolve(h2.message(JSON.stringify({ type: 'attach', sessionId: sidA, attachId: 1 }))), 8000);
          return { first, answers: answersOf(), answers2: frames2.filter((f) => f.type === 'attached' && f.sessionId === sidA).map((f) => f.attachId), expired: !dX || !dY };
        }
        if (first === 'post') {
          const pHeld = Promise.resolve(h.message(JSON.stringify({ type: 'attach', sessionId: sidA, attachId: 1 })));   // the older: its pre-join waits run after this tick (the warm is called in a microtask)…
          const s2 = mkS(); sessions.set(sidA, s2);   // …so the conversation's session REPLACED here is what they meet
          let openR = null; gateRead = { for: s2, p: new Promise((r) => { openR = r; }), used: false, entered: false };
          for (let k = 0; k < 4000 && !gateRead.entered; k++) await new Promise((r) => setTimeout(r, 2));   // the harness's bound (8 s): the older attach reaches its POST-join read
          const reached = gateRead.entered;
          const pThen = Promise.resolve(h.message(JSON.stringify({ type: 'attach', sessionId: sidA, attachId: 2 })));
          const thenDone = await within(pThen, 8000);
          openR();
          const heldDone = await within(pHeld, 8000);
          return { first, reached, thenDone, heldDone, answers: answersOf(), acks: acksOf(), expired: !reached || !thenDone || !heldDone };
        }
        const [heldId, thenId] = first === 'older' ? [1, 2] : [2, 1];
        let open = null; gateWarm = new Promise((r) => { open = r; });
        const pHeld = Promise.resolve(h.message(JSON.stringify({ type: 'attach', sessionId: sidA, attachId: heldId })));   // its warm waits on the gate
        const pThen = Promise.resolve(h.message(JSON.stringify({ type: 'attach', sessionId: sidA, attachId: thenId })));
        const thenDone = await within(pThen, 8000);   // the harness's bound (r4340 law 1): the other attach's handler settles
        open(); gateWarm = null;
        const heldDone = await within(pHeld, 8000);   // …then the held one's, its gate opened
        return { first, thenDone, heldDone, answers: answersOf(), acks: acksOf(), warms: warmCalls - w0, expired: !thenDone || !heldDone };
      };
      const stepOk = (r) => !r.expired && JSON.stringify(r.answers) === '[2]' && JSON.stringify([...r.acks].sort()) === '[1,2]';
      const so = await idsScene(require(path.join(REPO, 'src/ws-handler.js')), 7, 'older'), sn = await idsScene(require(path.join(REPO, 'src/ws-handler.js')), 8, 'newer');
      const sp = await idsScene(require(path.join(REPO, 'src/ws-handler.js')), 12, 'post');
      ok(STEP.length === 3 && stepOk(so) && stepOk(sn) && stepOk(sp), `B-a26e (r4686): two attaches of one conversation on one socket — the OLDER steps aside and answers nothing, the newer is answered ONCE (older first: answers ${JSON.stringify(so.answers)}; newer first: ${JSON.stringify(sn.answers)}; the older held AFTER its join: ${JSON.stringify(sp.answers)}; all acked) — the hub's three step-asides (${STEP.length}: at arrival, after the pre-join waits, again before the answer)`, { so, sn, sp });
      ok(so.expired === false && sn.expired === false && sp.expired === false && sp.reached === true, 'HARNESS: each attach\'s handler settled within its bound (8 s); the older one reached its post-join read', { so, sn, sp });
      const noStep = plantW('no-step-aside', STEP.map((l) => [l + '\n', '']));
      const xo = await idsScene(noStep, 9, 'older'), xn = await idsScene(noStep, 10, 'newer');
      ok(!stepOk(xo) && !stepOk(xn) && xo.answers.includes(1) && xn.answers.includes(1), `RED CONTROL (the step-asides taken out): the older attach is answered too (older first: ${JSON.stringify(xo.answers)}; newer first: ${JSON.stringify(xn.answers)}) — the page would meet a late answer on its live socket`, { xo, xn });
      const lastWins = plantW('last-id-wins', [[SETMAX, 'if (attachId != null) (ws.__attachLatest || (ws.__attachLatest = new Map())).set(data.sessionId, attachId);']]);   // stale-pins: kept (4c2a64f15's form, planted back as the RED control)
      const STEP2 = STEP.filter((l) => l.includes('AGAIN after the waits above'));
      const xp = await idsScene(plantW('no-second-step-aside', STEP2.map((l) => [l + '\n', ''])), 13, 'post');
      ok(STEP2.length === 1 && xp.reached === true && !stepOk(xp) && xp.answers.includes(1), `RED CONTROL (the SECOND step-aside alone taken out, the one before the answer): the older attach held after its join is answered too (${JSON.stringify(xp.answers)}) — the leg reaches it`, xp);
      ok(sn.warms === 1 && so.warms === 2, `B-a26e (r4857): an attach the hub knows is older at its ARRIVAL does nothing at all — no warm (newer first: ${sn.warms} warm, the newer's; older first: ${so.warms})`, { sn, so });
      const STEP_ARR = STEP.filter((l) => l.includes('KNOWN older at its arrival'));
      const xa = await idsScene(plantW('no-arrival-step-aside', STEP_ARR.map((l) => [l + '\n', ''])), 14, 'newer');
      ok(STEP_ARR.length === 1 && xa.warms === 2 && JSON.stringify(xa.answers) === '[2]', `RED CONTROL (the ARRIVAL step-aside alone taken out): the older attach does its waits before it steps aside (${xa.warms} warms; answers ${JSON.stringify(xa.answers)}, caught later) — the leg above can go red`, xa);
      const s2 = await idsScene(require(path.join(REPO, 'src/ws-handler.js')), 15, 'two');
      ok(!s2.expired && JSON.stringify(s2.answers) === '[5]' && JSON.stringify(s2.answers2) === '[1]', `B-a26e (r4857): two sockets of one conversation keep their own ids — a lower id on the second socket is answered (${JSON.stringify(s2.answers)} / ${JSON.stringify(s2.answers2)})`, s2);
      const xl = await idsScene(lastWins, 11, 'newer');
      ok(!stepOk(xl) && xl.answers.includes(1), `RED CONTROL (the hub keeps the LAST id to arrive — 4c2a64f15's form): newer first, the older attach is answered (${JSON.stringify(xl.answers)}) — the leg can go red`, xl);
    } finally { H.store.warmTaskState = realWts; }
    const twSrc = fs.readFileSync(path.join(REPO, 'src/transcript-worker.js'), 'utf8'), SHIP = "require('path').join(__dirname, 'transcript-worker.js')";
    const Dev = mutantCopies('task-scan-device', REPO).load('src/transcript-worker.js', editAnchor(twSrc, SHIP, "require('path').join(__dirname, 'transcript-worker-not-shipped.js')", "src/transcript-worker.js"), 'device');
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
    // B-ec25: under VS_NO_REAL_CLI=1 a view starts only THE codex CODEX_CMD names — each stand-in here is named for its own scene
    const scene = async (TS, cmd) => { const cxWas = process.env.CODEX_CMD; process.env.CODEX_CMD = cmd; try { return await sceneOf(TS, cmd); } finally { if (cxWas === undefined) delete process.env.CODEX_CMD; else process.env.CODEX_CMD = cxWas; } };
    const sceneOf = async (TS, cmd) => {
      CTR._resetForTests(); CTR.configure({ codexCmd: cmd, enabled: true });
      const svc = TS.createTranscriptService({ activeSessions: new Map(), createSessionMessages: mkReader, hosts: null });
      let ans = null;
      const nTask = await listing(async () => { ans = await svc.taskState(cref); });
      const nStatus = await listing(async () => { await svc.status(cref); });
      return { nTask, nStatus, ans, ran: ran(cmd) };
    };
    const tsSrc = fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8');
    const WARM_NOW = "const warm = harnessOf(r.backend || 'claude').store?.warmTaskState; if (warm) await warm(r.sessionId, r.cwd, { remote: !!r.host, bulk: bulkOf(r) });";   // B-cd4b r1035: the conversation's bulk mark rides it
    // RED: cadb07780's road planted back — the task-state and status roads call the harness's TRANSCRIPT warm
    const RelTS = mutantCopies('a2-transcript-warm', REPO).load('src/transcript-service.js', editAnchor(tsSrc, WARM_NOW, () => WARM_NOW.replace('warmTaskState', 'warmTranscript'), "src/transcript-service.js"), 'transcript-warm');
    const green = await scene({ createTranscriptService }, standIn('codex-green'));
    const red = await scene(RelTS, standIn('codex-red'));
    ok(tsSrc.split(WARM_NOW).length === 2 && green.nTask === 0 && !green.ran && ran(path.join(HOME_FAKE, 'codex-red')) && !ran(path.join(HOME_FAKE, 'codex-green')) && Array.isArray(green.ans && green.ans.todos),
      `a codex conversation's task state (GET /api/session-todos, a Properties window at every broadcast): ${green.nTask} listings of the codex store on this thread, no codex started; RED (the transcript warm on this road — cadb07780): ${red.nTask} listings and a codex app-server started for a thread this machine does not hold (${red.ran})`, { green, red });
    ok(nReader === 0 && green.nStatus === 0 && !green.ran && red.ran,
      `status(): no synchronous listing of the codex store, its reader's (${nReader}) nor the road's (${green.nStatus}) — the rollout index answers (B-a60e remainder) — and no warm on top; RED (the transcript warm on this road): a codex app-server started`);
    // ⑤b B-a60e + its remainder (主开发 r1430 / r1433): THE ROLLOUT INDEX — the finder never walks on this thread; ONE asynchronous
    // walk, shared by every asker of the moment, keeps every rollout's path; an answer is a path, «none» (only from a whole walk
    // BEGUN after the thread was first missed) or «not known yet». Each leg on the real modules, each RED in an anchored copy.
    {
      const { anchored } = await import('./scratch.mjs');
      const AD = require(path.join(REPO, 'src/adapters/codex.js'));
      const adSrc = fs.readFileSync(path.join(REPO, 'src/adapters/codex.js'), 'utf8'), csSrcA = fs.readFileSync(path.join(REPO, 'src/codex-session-store.js'), 'utf8');
      // THE PLANTED TREE: hundreds of rollouts in dated folders over three years (a stand-in at the ORDER of a person's store,
      // no number of anyone's), beside the 40 above — the real ~/.codex is never read (this child's HOME is a fake one)
      let planted = 0;
      for (let d = 0; d < 120; d++) {
        const dir = path.join(csess, String(2024 + (d % 3)), String(1 + (d % 12)).padStart(2, '0'), String(1 + (d % 28)).padStart(2, '0'));
        fs.mkdirSync(dir, { recursive: true });
        for (let j = 0; j < 2; j++) { fs.writeFileSync(path.join(dir, `rollout-2025-01-01T00-00-0${j}-ffffffff-0000-4000-8000-${String(d * 2 + j).padStart(12, '0')}.jsonl`), '{}\n'); planted++; }
      }
      const asyncListing = async (fn) => { let n = 0; const real = fs.promises.readdir; fs.promises.readdir = function (p0, ...a) { if (typeof p0 === 'string' && p0.startsWith(csess)) n++; return real.call(this, p0, ...a); }; try { await fn(); } finally { fs.promises.readdir = real; } return n; };
      const svcOf = (CSm) => createTranscriptService({ activeSessions: new Map(), createSessionMessages: (s0) => new CSm.CodexSessionMessages(s0, undefined, { buffersDir: path.join(os.homedir(), 'buf') }), hosts: null });
      // a copy of the adapter and the store wired to THAT copy (one instance: the leg resets and reads the index the store asks)
      const copyPair = (tag, adCopySrc) => { const M = mutantCopies(tag, REPO); const ad = M.write('src/adapters/codex.js', adCopySrc, tag + '-ad'); return { AD: require(ad), CS: M.load('src/codex-session-store.js', anchored(csSrcA, "require('./adapters/codex')", `require(${JSON.stringify(ad)})`, tag + '-cs', { count: 'any' }), tag + '-cs') }; };
      // (1) THE STATUS ROAD, the row's own leg: a conversation WITH a rollout, a FRESH index — status() and its page make 0
      // synchronous listings of the codex store on this thread FROM THE FIRST CALL, and answer its records (the model of its
      // turn_context, its words). RED: the release's synchronous find planted back (every lookup walks on this thread)
      const tid2 = 'eeeeeeee-0000-4000-8000-00000000a60e', cref2 = { backend: 'codex', sessionId: tid2, cwd };
      const rdir = path.join(csess, '2026', '07', '02'); fs.mkdirSync(rdir, { recursive: true });
      const rfile = path.join(rdir, `rollout-2026-07-02T00-00-00-${tid2}.jsonl`);
      const msg = (role, text) => ({ timestamp: T0, type: 'response_item', payload: { type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] } });
      fs.writeFileSync(rfile, [{ timestamp: T0, type: 'session_meta', payload: { id: tid2 } }, { timestamp: T0, type: 'turn_context', payload: { model: 'gpt-stand-in-a60e' } }, msg('user', 'hello a60e'), msg('assistant', 'reply a60e')].map((x) => JSON.stringify(x)).join('\n') + '\n');
      const statusRoad = async (ADm, CSm) => {
        ADm._resetRolloutIndexForTests();
        let st = null, pg = null;
        const nSync = await listing(async () => { st = await svcOf(CSm).status(cref2); pg = await svcOf(CSm).page(cref2); });
        const words = ((pg && pg.messages) || []).map((m) => JSON.stringify(m.content || m.text || '')).join(' ');
        return { nSync, model: st && st.chatStatus && st.chatStatus.model, words: /hello a60e/.test(words) && /reply a60e/.test(words), walks: ADm.rolloutIndexStats().walks };
      };
      const SYNC_BACK = '  if (!isMainThread) return { fp: findCodexSessionJsonlPathWalking(threadId), known: true };';
      const g1 = await statusRoad(AD, CS), r1p = copyPair('a60e-sync-find', anchored(adSrc, SYNC_BACK, SYNC_BACK.replace('!isMainThread', 'true'), 'a60e-sync-find')), r1 = await statusRoad(r1p.AD, r1p.CS);
      ok(g1.nSync === 0 && g1.model === 'gpt-stand-in-a60e' && g1.words && g1.walks === 1 && r1.nSync > 0 && r1.model === 'gpt-stand-in-a60e',
        `status() + its page of a codex conversation, a FRESH index over ${planted + 40} rollouts: ${g1.nSync} synchronous listings on this thread from the first call (${g1.walks} walk, off it), its model «${g1.model}» and its words read; RED (the release's sync find planted back): ${r1.nSync} listings`);
      // (2) N ASKERS IN ONE MOMENT ⇒ ONE WALK: thirty conversations' lookups at once share one walk (its directories listed once);
      // RED: a copy where a lookup does not join the running walk ⇒ a walk an asker (and the late ones answer «not known yet»)
      const ids30 = Array.from({ length: 30 }, (_, i) => `ffffffff-0000-4000-8000-${String(i * 7).padStart(12, '0')}`);
      const nAskers = async (ADm) => {
        ADm._resetRolloutIndexForTests();
        let got = [];
        const nAsync = await asyncListing(async () => { got = await Promise.all(ids30.map((t) => ADm.codexRolloutLookupAsync(t))); });
        const st = ADm.rolloutIndexStats();
        return { walks: st.walks, dirs: st.last && st.last.dirs, nAsync, found: got.filter((x) => x.fp && x.known).length };
      };
      const SHARE = '  if (ROLLOUT_INDEX.running) return ROLLOUT_INDEX.running;\n  const last = ROLLOUT_INDEX.last;\n';
      const g2 = await nAskers(AD), r2 = await nAskers(copyPair('a60e-no-share', anchored(adSrc, SHARE, '  const last = ROLLOUT_INDEX.last;\n', 'a60e-no-share')).AD);
      ok(g2.walks === 1 && g2.found === 30 && g2.nAsync > 0 && g2.nAsync <= g2.dirs && (r2.walks > 1 || r2.found < 30),
        `thirty askers in one moment: ${g2.walks} walk (${g2.nAsync} directory listings, off this thread), ${g2.found} of 30 found; RED (no shared walk): ${r2.walks} walks, ${r2.found} found`);
      // (3) A SYNC ASK DURING THE WALK ⇒ «NOT KNOWN YET», then the path at the next ask with no press — and a NEW conversation's
      // rollout written after a walk is never «none» for the length of the next one. RED: a copy whose «none» needs no walk begun
      // after the miss ⇒ the new conversation answers «none» at once
      const lateRoad = async (ADm) => {
        ADm._resetRolloutIndexForTests();
        const tNew = 'eeeeeeee-0000-4000-8000-0000000a60e9', fNew = path.join(rdir, `rollout-2026-07-02T00-00-09-${tNew}.jsonl`);
        const first = ADm.codexRolloutLookup(tid2);                    // the walk asked, not waited for
        await ADm.warmCodexRolloutIndex();
        const next = ADm.codexRolloutLookup(tid2);                     // the next ask: the path, no press
        fs.writeFileSync(fNew, '{}\n');                                // a new conversation's rollout, after that walk
        const fresh = ADm.codexRolloutLookup(tNew);                    // the walk before it never saw it
        await ADm.warmCodexRolloutIndex();
        const after = ADm.codexRolloutLookup(tNew);
        fs.rmSync(fNew, { force: true });
        return { first, next, fresh, after };
      };
      const NONE_RULE = '  if (last && last.ok && last.startedAt >= missAt) {';
      const g3 = await lateRoad(AD), r3 = await lateRoad(copyPair('a60e-late-none', anchored(adSrc, NONE_RULE, '  if (last && last.ok) {', 'a60e-late-none')).AD);
      ok(g3.first.known === false && g3.first.fp === null && g3.next.fp === rfile && g3.fresh.known === false && g3.after.fp && g3.after.known && r3.fresh.known === true && r3.fresh.fp === null,
        `a sync ask during the walk: «not known yet» (known ${g3.first.known}), the next ask the path (${path.basename(String(g3.next.fp))}); a new conversation's rollout written after a walk: «not known yet» (known ${g3.fresh.known}) until the next walk finds it; RED («none» with no walk begun after the miss): «none» at once`);
      // (4) A WALK THAT FAILS (a folder it cannot list) ⇒ «not known yet», never «none»; a name it READ before failing is still a
      // fact. RED: a copy that reads a failed walk's miss as «none»
      const failRoad = async (ADm) => {
        ADm._resetRolloutIndexForTests();
        // the folder that cannot be listed: its listing REFUSED (EACCES) by this leg — a mode change would not refuse a privileged user
        const shut = path.join(csess, '0000-unlistable'); fs.mkdirSync(shut, { recursive: true });
        const real = fs.promises.readdir;
        fs.promises.readdir = function (p0, ...a) { if (p0 === shut) return Promise.reject(Object.assign(new Error('EACCES: permission denied, scandir ' + shut), { code: 'EACCES' })); return real.call(this, p0, ...a); };
        try {
          const miss = await ADm.codexRolloutLookupAsync('eeeeeeee-0000-4000-8000-0000000a60fa', { boundMs: 3000 });
          return { miss, ok: ADm.rolloutIndexStats().last && ADm.rolloutIndexStats().last.ok };
        } finally { fs.promises.readdir = real; fs.rmSync(shut, { recursive: true, force: true }); }
      };
      const g4 = await failRoad(AD), r4 = await failRoad(copyPair('a60e-failed-none', anchored(adSrc, NONE_RULE, '  if (last && last.startedAt >= missAt) {', 'a60e-failed-none')).AD);
      ok(g4.ok === false && g4.miss.known === false && g4.miss.fp === null && r4.miss.known === true,
        `a walk that cannot list a folder (ok ${g4.ok}): a thread it did not see is «not known yet» (known ${g4.miss.known}), never «none»; RED (a failed walk's miss read as «none»): known ${r4.miss.known}`);
      // (5) A MOVED ROLLOUT (another date folder): the kept path is asked again (existsSync), gone ⇒ looked up again — «not known
      // yet» on this thread, the new path from the walk begun after; RED (the kept path never asked again) ⇒ the old path
      const tid4 = 'eeeeeeee-0000-4000-8000-0000000a60e4', mdir2 = path.join(csess, '2026', '07', '03'); fs.mkdirSync(mdir2, { recursive: true });
      const mfile = path.join(rdir, `rollout-2026-07-02T00-00-02-${tid4}.jsonl`), mfile2 = path.join(mdir2, path.basename(mfile));
      const moved = async (ADm) => {
        ADm._resetRolloutIndexForTests();
        fs.writeFileSync(mfile, '{}\n'); const m0 = (await ADm.codexRolloutLookupAsync(tid4)).fp; fs.renameSync(mfile, mfile2);
        let m1 = null, m2 = null; const n = await listing(async () => { m1 = ADm.codexRolloutLookup(tid4); m2 = (await ADm.codexRolloutLookupAsync(tid4)).fp; });
        fs.rmSync(mfile2, { force: true }); return { m0, m1, m2, n };
      };
      const STILL = '  if (fs.existsSync(k.fp)) return k.fp;\n  CODEX_PATH_KEPT.delete(threadId);\n  return null;\n';
      const mv = await moved(AD), mvr = await moved(copyPair('a60e-no-still', anchored(adSrc, STILL, '  return k.fp;\n', 'a60e-no-still')).AD);
      ok(mv.m0 === mfile && mv.m1.known === false && mv.m2 === mfile2 && mv.n === 0 && mvr.m1.fp === mfile,
        `a MOVED rollout: kept, then gone ⇒ «not known yet» on this thread (known ${mv.m1.known}), the new path from the next walk (${path.basename(path.dirname(String(mv.m2)))}), ${mv.n} synchronous listings; RED (the kept path never asked again): the old path (${path.basename(path.dirname(String(mvr.m1.fp)))})`);
      // (6) AN AGED COMPRESSED ROLLOUT: a kept .jsonl.zst, then a plain rollout of the thread in ANOTHER folder — at 59 s the .zst,
      // no walk asked; past its minute the .zst still answers and ONE walk is asked; the first walk begun after the minute decides:
      // the plain one. RED (no age rule) ⇒ the .zst for good
      const tid5 = 'eeeeeeee-0000-4000-8000-0000000a60e5', pdir5 = path.join(csess, '2026', '07', '05'); fs.mkdirSync(pdir5, { recursive: true });
      const zf5 = path.join(rdir, `rollout-2026-07-02T00-00-03-${tid5}.jsonl.zst`), pf5 = path.join(pdir5, `rollout-2026-07-05T00-00-00-${tid5}.jsonl`);
      const aged = async (ADm) => {
        ADm._resetRolloutIndexForTests();
        fs.writeFileSync(zf5, 'zst'); const first = (await ADm.codexRolloutLookupAsync(tid5)).fp; fs.writeFileSync(pf5, '{}\n');
        const realNow = Date.now; let before = null, past = null, decided = null, wBefore = 0, wPast = 0, n = 0;
        try {
          Date.now = () => realNow() + 59000; const w0 = ADm.rolloutIndexStats().walks;
          n += await listing(async () => { before = ADm.codexRolloutLookup(tid5).fp; }); wBefore = ADm.rolloutIndexStats().walks - w0;
          Date.now = () => realNow() + 61000;
          n += await listing(async () => { past = ADm.codexRolloutLookup(tid5).fp; }); wPast = ADm.rolloutIndexStats().walks - w0;
          await ADm.warmCodexRolloutIndex();
          n += await listing(async () => { decided = ADm.codexRolloutLookup(tid5).fp; });
        } finally { Date.now = realNow; }
        fs.rmSync(pf5, { force: true }); fs.rmSync(zf5, { force: true }); return { first, before, past, decided, wBefore, wPast, n };
      };
      const AGE = '    if (Date.now() - k.at > CODEX_ZST_KEPT_MS) {   // a minute old: decided again\n';
      const ag = await aged(AD), agr = await aged(copyPair('a60e-no-age', anchored(adSrc, AGE, '    if (false) {   // a minute old: decided again\n', 'a60e-no-age')).AD);
      ok(adSrc.split('const CODEX_ZST_KEPT_MS = 60_000;').length === 2 && ag.first === zf5 && ag.before === zf5 && ag.wBefore === 0 && ag.past === zf5 && ag.wPast === 1 && ag.decided === pf5 && ag.n === 0 && agr.decided === zf5,
        `a kept .jsonl.zst: at 59 s kept (${ag.wBefore} walks asked), past its minute still the .zst with ${ag.wPast} walk asked, then the plain rollout in another folder (${path.basename(String(ag.decided))}), ${ag.n} synchronous listings; RED (no age rule): ${path.basename(String(agr.decided))} for good`);
      // (7) THE CAP (CODEX_PATH_KEPT_MAX 4096, pinned; a copy scaled to 2): the oldest kept path goes first — answered by the index
      // again with no walk; RED (the copy without the drop) ⇒ three kept
      const CAPL = 'const CODEX_PATH_KEPT_MAX = 4096;', DROP = '  if (CODEX_PATH_KEPT.size > CODEX_PATH_KEPT_MAX) CODEX_PATH_KEPT.delete(CODEX_PATH_KEPT.keys().next().value);\n';
      const capIds = ['eeeeeeee-0000-4000-8000-0000000a60e6', 'eeeeeeee-0000-4000-8000-0000000a60e7', 'eeeeeeee-0000-4000-8000-0000000a60e8'];
      const capFiles = capIds.map((t, i) => path.join(rdir, `rollout-2026-07-02T00-00-1${i}-${t}.jsonl`));
      const capOf = async (ADm) => {
        ADm._resetRolloutIndexForTests(); capFiles.forEach((f) => fs.writeFileSync(f, '{}\n'));
        for (const t of capIds) await ADm.codexRolloutLookupAsync(t);
        const kept = ADm.rolloutIndexStats().kept, w0 = ADm.rolloutIndexStats().walks;
        const again = ADm.codexRolloutLookup(capIds[0]); const w1 = ADm.rolloutIndexStats().walks;
        capFiles.forEach((f) => fs.rmSync(f, { force: true })); return { kept, again, walked: w1 - w0 };
      };
      const cap2 = anchored(adSrc, CAPL, 'const CODEX_PATH_KEPT_MAX = 2;', 'a60e-cap-2');
      const cg = await capOf(copyPair('a60e-cap', cap2).AD), cr = await capOf(copyPair('a60e-cap-r', anchored(cap2, DROP, '', 'a60e-cap-no-drop')).AD);
      ok(adSrc.split(CAPL).length === 2 && cg.kept === 2 && cg.again.fp === capFiles[0] && cg.walked === 0 && cr.kept === 3,
        `the kept paths are bounded (4096; a copy scaled to 2): ${cg.kept} kept, the oldest answered by the index again (${cg.walked} walks); RED (no drop): ${cr.kept} kept`);
      // (8) THE SYNCHRONOUS ROAD ASKED IN A LOOP (主开发 r1465: it keeps nothing on «not known yet» — what bounds it?): a reader
      // asked chatStatus() 200 times while the index's ONE walk hangs asks the index no more (it reads again only once the index
      // has MOVED — a walk ended: rolloutIndexEpoch), asks no second walk, lists nothing on this thread; the walk released, the ASYNC
      // road reads the rollout (r2743 (1): the synchronous road never re-reads) and the next ask sees it with no press. RED: a copy of the
      // store that re-reads a partial reader on every synchronous ask ⇒ an ask of the index a call
      const EPOCH = '    if (this._all) return;\n';
      const loopRoad = async (CSm) => {
        AD._resetRolloutIndexForTests();
        const realRd = fs.promises.readdir; let release = () => { }; const gate = new Promise((r) => { release = r; });
        fs.promises.readdir = function (p0, ...a) { if (p0 === csess) return gate.then(() => realRd.call(this, p0, ...a)); return realRd.call(this, p0, ...a); };
        let n = 0, st = null, asks0 = 0, asks1 = 0, walks = 0;
        try {
          const rd = new CSm.CodexSessionMessages({ backend: 'codex', backendSessionId: tid2, cwd, buffer: '' }, undefined, { buffersDir: path.join(os.homedir(), 'buf') });
          rd.chatStatus(); asks0 = AD.rolloutIndexStats().asks;
          n = await listing(async () => { for (let i = 0; i < 200; i++) rd.chatStatus(); });
          asks1 = AD.rolloutIndexStats().asks; walks = AD.rolloutIndexStats().walks;
          release(); await AD.warmCodexRolloutIndex();
          await rd.rawAsync(); st = rd.chatStatus();   // r2743 (1): the async road re-reads, the sync accessor reads what it filled
        } finally { fs.promises.readdir = realRd; release(); }
        return { n, loopAsks: asks1 - asks0, walks, model: st && st.model };
      };
      const lg = await loopRoad(CS), lr = await loopRoad(mutantCopies('a60e-no-epoch', REPO).load('src/codex-session-store.js', anchored(csSrcA, EPOCH, '    if (this._all && !this._partial) return;\n', 'a60e-no-epoch'), 'no-epoch'));
      ok(lg.loopAsks === 0 && lg.walks === 1 && lg.n === 0 && lg.model === 'gpt-stand-in-a60e' && lr.loopAsks >= 200,
        `chatStatus() 200 times while the one walk hangs: ${lg.loopAsks} asks of the index, ${lg.walks} walk, ${lg.n} synchronous listings; the walk ended, the async road read the rollout and the next ask sees it (model «${lg.model}»); RED (no epoch rule): ${lr.loopAsks} asks`);
      // ── THE ROUND wdxrfw5q7's CURE (主开发 r1638): each leg on the real modules, each RED in an anchored copy ──
      const withReaddir = async (pick, fn) => {   // a listing this leg refuses (EACCES) or holds (a promise): fs.promises, as the walk reads it
        const real = fs.promises.readdir;
        fs.promises.readdir = function (p0, ...a) { const v = pick(p0); if (v === 'fail') return Promise.reject(Object.assign(new Error('EACCES: permission denied, scandir ' + p0), { code: 'EACCES' })); if (v && typeof v.then === 'function') return v.then(() => real.call(this, p0, ...a)); return real.call(this, p0, ...a); };
        try { return await fn(); } finally { fs.promises.readdir = real; }
      };
      const adCopy = (tag, src) => require(mutantCopies(tag, REPO).write('src/adapters/codex.js', src, tag));
      // (9) MUST 1 — ONE WALK OF A ROOT, SHARED: a channels-style walk of the same root runs on SLOW storage; a lookup of a rollout
      // only THAT walk sees WAITS for it and answers the path (never «not known yet» at once); no stuck words within the bound;
      // the epoch moves once. RED: today's guard (an at-once «unknown» while another walk is out)
      const tF = 'eeeeeeee-0000-4000-8000-0000000a60f1', fF = path.join(rdir, `rollout-2026-07-02T00-00-21-${tF}.jsonl`);
      const foreign = async (A) => {
        A._resetRolloutIndexForTests(); const e0 = A.rolloutIndexStats().ended;
        let release = () => { }; const gate = new Promise((r) => { release = r; });
        let warned = 0; const realWarn = console.warn; console.warn = (...a) => { if (/has not answered since/.test(String(a[0]))) warned++; else realWarn.apply(console, a); };
        try {
          return await withReaddir((p0) => (p0 === csess ? gate : null), async () => {
            const sweep = A.codexTranscriptIndex({ boundMs: 5000 });   // the channels' sweep: the same root, held at its first listing
            fs.writeFileSync(fF, '{}\n');                                // a rollout only that walk will see
            const ask = A.codexRolloutLookupAsync(tF);
            setTimeout(release, 60);
            const [sw, got] = await Promise.all([sweep, ask]);
            return { got, sweepSaw: sw.has(tF), moved: A.rolloutIndexStats().ended - e0, warned };
          });
        } finally { console.warn = realWarn; release(); fs.rmSync(fF, { force: true }); }
      };
      const OUT_NOW = adSrc.slice(adSrc.indexOf('  const out = CODEX_WALKS_OUT.get(key);\n'), adSrc.indexOf("    return { ...st, ok: false, late: true, has: () => false, pathOf: () => null };\n  }\n") + "    return { ...st, ok: false, late: true, has: () => false, pathOf: () => null };\n  }\n".length);
      const OUT_THEN = "  if (CODEX_WALKS_OUT.has(key)) { require('../session-store.js').stuckSaid(CODEX_WALKS_OUT, key, 'codex', sessionsDir); return { ...st, ok: false, late: true, has: () => false, pathOf: () => null }; }   // a stuck walk is not doubled, said once\n";   // stale-pins: kept (the red control plants the release's guard back)
      const g9 = await foreign(AD), r9 = await foreign(adCopy('a60e-bounce', anchored(adSrc, OUT_NOW, OUT_THEN, 'a60e-bounce')));
      ok(OUT_NOW.length > 200 && g9.got.fp === fF && g9.got.known && g9.sweepSaw && g9.warned === 0 && g9.moved === 1 && r9.got.known === false,
        `a channels-style walk of the same root on slow storage: the lookup WAITED for it and read the path it saw (${path.basename(String(g9.got.fp))}), ${g9.warned} stuck lines, the epoch moved ${g9.moved}; RED (today's guard): «not known yet» at once (known ${r9.got.known})`);
      // (10) MUST 2 — A FOLDER THAT CANNOT BE LISTED hides nothing after it: the index's walk goes on (the first folder below the root
      // refuses); every rollout elsewhere is found, those it could not see are «not known yet», none is «none». RED: the walk stops there
      const walkOn = async (A) => {
        A._resetRolloutIndexForTests(); let failed = null;
        return withReaddir((p0) => { if (!failed && p0 !== csess && p0.startsWith(csess + path.sep)) { failed = p0; return 'fail'; } return null; }, async () => {
          const got = await Promise.all(ids30.map((t) => A.codexRolloutLookupAsync(t)));
          return { found: got.filter((x) => x.fp).length, none: got.filter((x) => !x.fp && x.known).length, unknown: got.filter((x) => !x.known).length, ok: A.rolloutIndexStats().last && A.rolloutIndexStats().last.ok, failed };
        });
      };
      const WALK_ON = "      if ((!st.ok || late) && !onDone) { cut = late; return; }\n    }\n    // the cache:";
      const g10 = await walkOn(AD), r10 = await walkOn(adCopy('a60e-walk-stops', anchored(adSrc, WALK_ON, "      if (!st.ok || (late && !onDone)) { cut = late; return; }\n    }\n    // the cache:", 'a60e-walk-stops')));
      ok(g10.ok === false && g10.none === 0 && g10.unknown === 30 - g10.found && g10.found >= 10 && r10.found < g10.found,
        `one folder below the root cannot be listed (${path.relative(csess, String(g10.failed))}): the walk went on — ${g10.found} of 30 found, ${g10.unknown} «not known yet», ${g10.none} «none»; RED (the walk stops there): ${r10.found} found`);   // stale-pins: kept (a printed word, no pin)
      // (11) MUST 3 — THE FLAG TRAVELS, FOLDED INTO LINE 411's DOOR (主开发 r2439): the service's status and page (the paired machine's
      // transcript ops ARE these) of a conversation whose rollout's folder cannot be listed say line 411's «not loaded» with the cause
      // «not known yet» (`notKnownYet`) on its page (r2743 (4): the status carries nothing new — no road read it); the page words that
      // cause in its own sentence on line 411's line and its toast, and both HTTP roads hand the cause on. RED: the page without it
      const travel = async (TSm) => withReaddir((p0) => (p0 === rdir ? 'fail' : null), async () => {
        AD._resetRolloutIndexForTests();
        const svc = TSm.createTranscriptService({ activeSessions: new Map(), createSessionMessages: (s0) => new CS.CodexSessionMessages(s0, undefined, { buffersDir: path.join(os.homedir(), 'buf') }), hosts: null });
        const st = await svc.status(cref2), pg = await svc.page(cref2);
        return { st: !!(st.notLoaded || st.notKnownYet), pg: !!(pg.notLoaded && pg.notKnownYet) };
      });
      const CAUSE = '...(v.notLoadedInfo.notKnownYet ? { notKnownYet: v.notLoadedInfo.notKnownYet } : {}), ';
      const g11 = await travel({ createTranscriptService }), r11 = await travel(mutantCopies('a60e-no-flag', REPO).load('src/transcript-service.js', anchored(tsSrc, CAUSE, '', 'a60e-no-cause'), 'no-flag'));
      const PAGE_SRC = ['src/lib/chat-view.js', 'src/lib/session-lifecycle.js'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf8')).join('\n');
      const said = PAGE_SRC.split("t('Its saved history is not known yet — it fills in here by itself.')").length - 1;
      const handed = PAGE_SRC.split('notKnownYet: data.notKnownYet || false').length - 1;
      ok(!g11.st && g11.pg && !r11.pg && said === 2 && handed === 2,
        `a rollout «not known yet»: the service's status says nothing new (${!g11.st}), its page says the cause (${g11.pg}); the page words it in its own sentence (${said}: line 411's line, its toast); the HTTP roads hand the cause on (${handed}: the history pill's fetch, the resume's first page); RED (the page without the cause): ${r11.pg}`);
      AD._resetRolloutIndexForTests();
      // (12) «none» NEVER STANDS OVER A COPY A FETCH WROTE: one exact look before «none» (the host folders the walk listed), and the
      // fetch's note (a host folder the walk never listed). RED: neither (the walk's minute-long «none»)
      const RR = path.join(HOME_FAKE, 'remote-root-a60e'); fs.mkdirSync(path.join(RR, 'host-y', 'codex'), { recursive: true });
      const ROOTLINE = "const CODEX_REMOTE_ROOT = path.join(__dirname, '..', '..', 'data', 'remote-jsonl');   // the remote-jsonl cache (hosts.fetchCodexJsonl)\n";
      const adRR = anchored(adSrc, ROOTLINE, `const CODEX_REMOTE_ROOT = ${JSON.stringify(RR)};\n`, 'a60e-remote-root');
      const EXACT = "      for (const d of last.hostDirs || []) for (const ext of ['.jsonl', '.jsonl.zst']) { const f = path.join(d, threadId + ext); if (fs.existsSync(f)) { ROLLOUT_INDEX.missAt.delete(threadId); return { fp: f, known: true }; } }\n";
      const NOTE = "  keepBounded(ROLLOUT_INDEX.noted, String(threadId), String(fp));\n";
      const exactRoad = async (A) => {
        const tY = 'eeeeeeee-0000-4000-8000-0000000a60f2', tX = 'eeeeeeee-0000-4000-8000-0000000a60f3';
        const fy = path.join(RR, 'host-y', 'codex', tY + '.jsonl'), fx = path.join(RR, 'host-z', 'codex', tX + '.jsonl');
        const y0 = await A.codexRolloutLookupAsync(tY); fs.writeFileSync(fy, '{}\n'); const y1 = A.codexRolloutLookup(tY);
        const x0 = await A.codexRolloutLookupAsync(tX); fs.mkdirSync(path.dirname(fx), { recursive: true }); fs.writeFileSync(fx, '{}\n'); A.noteCodexRollout(tX, fx); const x1 = A.codexRolloutLookup(tX);
        fs.rmSync(fy, { force: true }); fs.rmSync(path.join(RR, 'host-z'), { recursive: true, force: true });
        return { y0, y1, x0, x1 };
      };
      const g12 = await exactRoad(adCopy('a60e-rr', adRR)), r12 = await exactRoad(adCopy('a60e-rr-red', anchored(anchored(adRR, EXACT, '', 'a60e-no-exact'), NOTE, '', 'a60e-no-note')));
      ok(g12.y0.known && !g12.y0.fp && g12.y1.fp && g12.x0.known && !g12.x0.fp && g12.x1.fp && !r12.y1.fp && !r12.x1.fp,
        `a «none», then a fetch writes the copy: in a host folder the walk listed, the exact look finds it (${path.basename(String(g12.y1.fp))}); in one it never listed, the fetch's note (${path.basename(String(g12.x1.fp))}); RED (neither): «none» for both`);
      // (13) ONE WAIT A THREAD: while the one walk hangs, an awaited ask of a thread waits its bound ONCE; the next awaited ask of it,
      // nothing moved since, answers at once (an attach, a resume's three questions). RED: the second waits the bound again
      const LATE = '  if (ROLLOUT_INDEX.late.get(threadId) === ROLLOUT_INDEX.ended) return Promise.resolve(first);   // waited already, nothing moved since\n';
      const ASK_BOUND = 150;   // the bound these two asks are given (the mechanism's constant: the first waits it, × 0.8 slack)
      const oneWait = async (A) => {
        A._resetRolloutIndexForTests(); let release = () => { }; const gate = new Promise((r) => { release = r; });
        try {
          return await withReaddir((p0) => (p0 === csess ? gate : null), async () => {
            const tZ = 'eeeeeeee-0000-4000-8000-0000000a60f4';
            const t0 = Date.now(); const a = await A.codexRolloutLookupAsync(tZ, { boundMs: ASK_BOUND }); const t1 = Date.now();
            const b = await A.codexRolloutLookupAsync(tZ, { boundMs: ASK_BOUND }); const t2 = Date.now();
            release(); await A.warmCodexRolloutIndex();
            return { a, b, first: t1 - t0, second: t2 - t1 };
          });
        } finally { release(); }
      };
      const g13 = await oneWait(AD), r13 = await oneWait(adCopy('a60e-two-waits', anchored(adSrc, LATE, '', 'a60e-two-waits')));
      ok(!g13.a.known && !g13.b.known && g13.first >= ASK_BOUND * 0.8 && g13.second * 4 < g13.first && r13.second * 4 >= r13.first,   // the second against the first, measured in the run
        `while the walk hangs: the first awaited ask waited its bound (${g13.first} ms), the second answered at once (${g13.second} ms); RED (no memo): the second waited again (${r13.second} ms)`);
      // (14) A FAILED WALK IS ASKED AGAIN BY ITSELF (the status line never stays partial until a re-open): the walk fails once at a
      // folder; nobody asks; its retry (a short time here) walks, the epoch moves, the next read finds the rollout. RED: no retry
      const RETRY = '      if (!ROLLOUT_INDEX.retry) {\n';
      const retryRoad = async (A) => {
        A._resetRolloutIndexForTests(); A._setRolloutTimingForTests({ retryMs: 40 }); let once = false;
        try {
          return await withReaddir((p0) => { if (!once && p0 === rdir) { once = true; return 'fail'; } return null; }, async () => {
            const a = await A.codexRolloutLookupAsync(tid2, { boundMs: 300 }); const w1 = A.rolloutIndexStats().walks;
            await new Promise((r) => setTimeout(r, 400));
            const s = A.rolloutIndexStats(); const b = A.codexRolloutLookup(tid2);
            return { a, w1, walks: s.walks, ok: !!(s.last && s.last.ok), b };
          });
        } finally { A._setRolloutTimingForTests({}); }
      };
      const g14 = await retryRoad(AD), r14 = await retryRoad(adCopy('a60e-no-retry', anchored(adSrc, RETRY, '      if (false) {\n', 'a60e-no-retry')));
      ok(!g14.a.known && g14.w1 === 1 && g14.walks === 2 && g14.ok && g14.b.fp === rfile && r14.walks === 1 && !r14.b.known,
        `a walk that failed once at a folder: «not known yet»; nobody asked, its retry walked (${g14.walks} walks), the next read found it (${path.basename(String(g14.b.fp))}); RED (no retry): ${r14.walks} walk, still «not known yet»`);
      AD._resetRolloutIndexForTests();
      // (15) the kept .jsonl.zst yields to its plain twin in the same folder, with no walk (the round's should: its leg restored).
      // RED (no twin check) ⇒ the .zst stays
      const tid3 = 'eeeeeeee-0000-4000-8000-0000000a60e3', zfile = path.join(rdir, `rollout-2026-07-02T00-00-01-${tid3}.jsonl.zst`), pfile = zfile.slice(0, -'.zst'.length);
      const twin = async (A) => {
        A._resetRolloutIndexForTests(); fs.writeFileSync(zfile, 'zst');
        const first = (await A.codexRolloutLookupAsync(tid3)).fp; fs.writeFileSync(pfile, '{}\n');
        let got = null; const n = await listing(async () => { got = A.codexRolloutLookup(tid3).fp; }); const w = A.rolloutIndexStats().walks;
        fs.rmSync(pfile, { force: true }); fs.rmSync(zfile, { force: true }); return { first, got, n, w };
      };
      const TWIN = "    if (fs.existsSync(plain)) { CODEX_PATH_KEPT.set(threadId, { fp: plain, at: Date.now() }); return plain; }\n";
      const tw = await twin(AD), twr = await twin(adCopy('a60e-no-twin', anchored(adSrc, TWIN, '', 'a60e-no-twin')));
      ok(tw.first === zfile && tw.got === pfile && tw.n === 0 && tw.w === 1 && twr.got === zfile,
        `a kept .jsonl.zst and then its plain twin: the plain wins (${path.basename(String(tw.got))}) with ${tw.n} listings and no walk; RED (no twin check): ${path.basename(String(twr.got))}`);
      // (16) THE CHANNELS' LIVENESS FALLBACK: a codex conversation of THIS machine (its session-meta here) whose rollout is «not known
      // yet» is NOT gone; once a walk begun after the miss found none, it is gone. RED: the release's fallback (gone at once)
      const tQ = 'eeeeeeee-0000-4000-8000-0000000a60f5', metaDir = path.join(HOME_FAKE, 'meta-a60e'); fs.mkdirSync(metaDir, { recursive: true });
      fs.writeFileSync(path.join(metaDir, 'q.json'), JSON.stringify({ backendSessionId: tQ }));
      const cwSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-wiring.js'), 'utf8');
      const FOUND = cwSrc.split('\n').find((l) => l.startsWith('  const found = findTranscript || ((cid) => { if (require(')) + '\n';
      const live = async (W) => {
        AD._resetRolloutIndexForTests();
        const rd = W.livenessReader({ liveSessions: () => [], readUserState: () => ({}), convIndex: () => null, metaDir, transcriptDirs: () => [projects] });
        const before = rd(tQ); await AD.warmCodexRolloutIndex(); await AD.codexRolloutLookupAsync(tQ); const after = rd(tQ);
        return { before: before.state, after: after.state };
      };
      const g16 = await live(require(path.join(REPO, 'src/server/channels-wiring.js'))), r16 = await live(mutantCopies('a60e-gone-at-once', REPO).load('src/server/channels-wiring.js', anchored(cwSrc, FOUND, "  const found = findTranscript || ((cid) => !!(require('../session-store.js').findSessionJsonlPath(cid) || require('../adapters/codex.js').findCodexSessionJsonlPath(cid)));\n", 'a60e-gone-at-once'), 'gone-at-once'));   // stale-pins: kept (the red control plants the release's liveness fallback back)
      ok(FOUND.length > 60 && g16.before !== 'gone' && g16.after === 'gone' && r16.before === 'gone',
        `the channels' liveness fallback: a local codex conversation whose rollout is «not known yet» is ${g16.before} (never gone), after a walk that found none ${g16.after}; RED (the release's fallback): ${r16.before} at once`);
      // (17) THE THREAD/READ WARM starts no app-server for a rollout «not known yet» (it may be there): the rollout's folder cannot be
      // listed ⇒ false, no codex started. RED: the warm that reads only the path (a codex app-server started)
      const hSrc = fs.readFileSync(path.join(REPO, 'src/harnesses/codex.js'), 'utf8'), WARM = '      if (got.fp || !got.known) return false;\n';
      const warmRoad = async (HC, name) => withReaddir((p0) => (p0 === rdir ? 'fail' : null), async () => {
        AD._resetRolloutIndexForTests(); const cmd = standIn(name); const was = process.env.CODEX_CMD; process.env.CODEX_CMD = cmd;
        try { CTR._resetForTests(); CTR.configure({ codexCmd: cmd, enabled: true }); const r = await HC.store.warmTranscript(tid2, cwd, {}); await new Promise((x) => setTimeout(x, 300)); return { r, ran: ran(cmd) }; }
        finally { if (was === undefined) delete process.env.CODEX_CMD; else process.env.CODEX_CMD = was; }
      });
      const g17 = await warmRoad(require(path.join(REPO, 'src/harnesses/codex.js')), 'codex-warm-green'), r17 = await warmRoad(mutantCopies('a60e-warm', REPO).load('src/harnesses/codex.js', anchored(hSrc, WARM, '      if (got.fp) return false;\n', 'a60e-warm'), 'warm'), 'codex-warm-red');
      ok(g17.r === false && !g17.ran && r17.ran,
        `the thread/read warm, its rollout «not known yet»: ${g17.r}, no codex started; RED (the path alone read): a codex app-server started (${r17.ran})`);
      // (18) THE RESUME'S FORK CHAIN, awaited: a forked thread's rollout written after the last walk — the resume's road (ws-create →
      // forkChainEnvAsync) carries its native parent; the synchronous road at the same moment would not. RED: the sync chain on that road
      const tP = 'eeeeeeee-0000-4000-8000-0000000a60f6', tC = 'eeeeeeee-0000-4000-8000-0000000a60f7', fC = path.join(rdir, `rollout-2026-07-02T00-00-31-${tC}.jsonl`);
      const rsSrc = fs.readFileSync(path.join(REPO, 'src/resume-store.js'), 'utf8'), ASYNC_CHAIN = "await st.forkChainAsync(resumeId) : st.forkChain(resumeId)";
      const chainRoad = async (RS) => {
        AD._resetRolloutIndexForTests(); await AD.warmCodexRolloutIndex();
        fs.writeFileSync(fC, JSON.stringify({ timestamp: T0, type: 'session_meta', payload: { id: tC, forked_from: [tP] } }) + '\n');
        try { return Object.values(await RS.forkChainEnvAsync('codex', tC))[0] || ''; } finally { fs.rmSync(fC, { force: true }); }
      };
      const g18 = await chainRoad(require(path.join(REPO, 'src/resume-store.js'))), r18 = await chainRoad(mutantCopies('a60e-sync-chain', REPO).load('src/resume-store.js', anchored(rsSrc, ASYNC_CHAIN, 'st.forkChain(resumeId) : st.forkChain(resumeId)', 'a60e-sync-chain'), 'sync-chain'));
      ok(g18 === `${tP},${tC}` && r18 === tC, `the resume's fork chain (a rollout written after the last walk): «${g18}»; RED (the synchronous chain on that road): «${r18}»`);
      // (19) ROUND wlatrwrv3's MUST (主开发 r1953): A WALK THAT STOPPED AT ITS BOUND IS NEVER WHOLE — for itself and for everyone who
      // adopts it. Slow storage: the index's first walk fails once (a folder), tid2 is missed «not known yet»; a ONE-OFF walk (the
      // channels' sweep's shape) starts, its root's listing held past its bound (cut); while it is out the index (asked, in the leg's order), the channels'
      // liveness reader and the attachments' index all wait on it and adopt it. (i) tid2 (in a folder that walk never listed): «not
      // known yet», never «none»; (ii) the channels-style reader: a local conversation is NOT judged gone; (iii) the attachments-style
      // reader: «unknown». RED: the settled result without the late term (a cut walk said whole)
      // (iii) reads the attachments' door, whose «absent» needs the CLAUDE tree read whole too: a stand-in holds that half whole on
      // BOTH roads (the green and the RED), so the door's answer is the codex half's alone — never the child's own projects tree
      const claudeWhole = mutantCopies('a60e-claude-whole', REPO).write('src/session-store.js', 'module.exports = { claudeTranscriptIndex: async () => ({ ok: true, topReadable: true, has: () => false }) };\n', 'claude-whole');
      const caSrc = anchored(fs.readFileSync(path.join(REPO, 'src/server/chat-attachments.js'), 'utf8'), "require('../session-store.js')", `require(${JSON.stringify(claudeWhole)})`, 'a60e-claude-half-whole'), cwSrc0 = fs.readFileSync(path.join(REPO, 'src/server/channels-wiring.js'), 'utf8');
      const CA0 = mutantCopies('a60e-ca-green', REPO).load('src/server/chat-attachments.js', caSrc, 'ca-green'), CW0 = require(path.join(REPO, 'src/server/channels-wiring.js'));
      const cutRoad = async (A, CAm, CWm) => {
        A._resetRolloutIndexForTests(); A._setRolloutTimingForTests({ retryMs: 60000 });   // no retry timer fires inside the leg: the index is ASKED below, while the cut walk is out
        let failing = true, release = () => { }; const gate = new Promise((r) => { release = r; });   // tid2's folder refuses EVERY listing until the first ask is answered (a walker of another leg may list it first: one refusal is not enough)
        try {
          return await withReaddir((p0) => (failing && p0 === rdir ? 'fail' : null), async () => {
            const first = await A.codexRolloutLookupAsync(tid2, { boundMs: 2000 });   // the index's walk fails at tid2's folder (tid2 missed BEFORE the one-off walk begins)
            failing = false; A._setRolloutTimingForTests({ retryMs: 0 });   // the folder lists again; the failed walk's wait is over: the next ask walks (the order of the leg, never a timer's)
            const slow = { ...fs.promises, readdir: (p0, o) => (p0 === csess ? gate.then(() => fs.promises.readdir(p0, o)) : fs.promises.readdir(p0, o)), stat: fs.promises.stat };
            const sweep = A.codexTranscriptIndex({ boundMs: 80, fsp: slow });   // the one-off walk: its root held 300 ms, its bound 80 ms ⇒ CUT
            const ch = (async () => { const rd = CWm.livenessReader({ liveSessions: () => [], readUserState: () => ({}), convIndex: () => null, metaDir, transcriptIndex: {} }); const j = await rd.forSweep(); return j(tQ); })();
            const at = CAm.transcriptIndexes();
            // THE INDEX asks while the cut walk is out: it waits on it and adopts it. What it knows is read AT the adoption (the same microtask
            // chain): a later ask may walk for itself after a cut walk, as it should, and an asker outside this leg may make one
            const idx = A.refreshCodexRolloutIndex().then(() => ({ s0: A.rolloutIndexStats(), look: A.codexRolloutLookup(tid2) }));
            setTimeout(release, 300);
            const [sw, chv, atv, ad] = await Promise.all([sweep, ch, at, idx]);
            const s0 = ad.s0;
            return { first: first.known, swOk: sw.ok, swCut: sw.cut, look: ad.look, walks: s0.walks, ch: chv && chv.state, at: atv.has(tQ), lastOk: s0.last && s0.last.ok, lastFromSweep: !!(s0.last && s0.last.rollouts === 0) };
          });
        } finally { release(); A._setRolloutTimingForTests({}); A._resetRolloutIndexForTests(); }   // the leg's own asks detached
      };
      const SETTLED = '    const full = { ok: whole(), cut, ';
      const adCut = mutantCopies('a60e-cut-whole', REPO); const adCutPath = adCut.write('src/adapters/codex.js', anchored(adSrc, SETTLED, '    const full = { ok: st.ok, cut, ', 'a60e-cut-said-whole'), 'cut-said-whole');
      const wire = (src, tag) => adCut.load(tag === 'ca' ? 'src/server/chat-attachments.js' : 'src/server/channels-wiring.js', anchored(src, "require('../adapters/codex.js')", `require(${JSON.stringify(adCutPath)})`, 'a60e-cut-' + tag, { count: 'any' }), 'cut-' + tag);
      const g19 = await cutRoad(AD, CA0, CW0), r19 = await cutRoad(require(adCutPath), wire(caSrc, 'ca'), wire(cwSrc0, 'cw'));
      ok(!g19.first && g19.swOk === false && g19.lastFromSweep && g19.lastOk === false && g19.look.known === false && g19.ch !== 'gone' && g19.at === null
        && r19.look.known === true && !r19.look.fp && r19.ch === 'gone' && r19.at === false,
        `a one-off walk cut at its bound (its return ok ${g19.swOk}; its settled result, adopted: ok ${g19.lastOk}), adopted by the index and the two other readers: (i) tid2 «not known yet» (known ${g19.look.known}${g19.look.fp ? ' at ' + path.basename(g19.look.fp) : ''}; first ${g19.first}, from the cut walk ${g19.lastFromSweep}, walks ${g19.walks}), (ii) the channels' liveness ${g19.ch}, (iii) the attachments' index ${g19.at}; RED (the settled result without the late term): «none» (known ${r19.look.known}), ${r19.ch}, ${r19.at}`);
      // ── 主开发 r2439: «NOT KNOWN YET» FOLDED INTO LINE 411's DOOR — its three conditions
      const csSrcF = fs.readFileSync(path.join(REPO, 'src/codex-session-store.js'), 'utf8');
      const rdOf = (CSm, id) => new CSm.CodexSessionMessages({ backend: 'codex', backendSessionId: id, cwd, buffer: '' }, undefined, { buffersDir: path.join(os.homedir(), 'buf') });
      const reask = async (CSm, id) => { const rd = rdOf(CSm, id); await rd.rawAsync(); rd.raw(); return { notLoaded: rd.notLoaded || null, notKnown: !!rd.notLoadedNotKnown, notFound: !!rd.notFound }; };   // line 411's history-ask: readOffLoop (rawAsync), then raw()
      // (20) CONDITION 1 — THE PAGE's RE-ASK NEVER WALKS: the index's ONE walk is OUT (its own warm, hanging), the rollout's folder refusing;
      // two re-asks then come (a reader's off-loop reads run one at a time, so the walk being out is what they meet): the index walks
      // once (no second walk while one is out), nothing is listed on the hub's loop, and each re-ask is answered line 411's «not loaded»
      // with the cause «not known yet». RED: an index that starts a walk per ask (its join of the walk out removed), the reader wired to it
      const JOIN = '  if (ROLLOUT_INDEX.running) return ROLLOUT_INDEX.running;\n';
      const mj = mutantCopies('a60e-no-join', REPO), adJoinPath = mj.write('src/adapters/codex.js', anchored(adSrc, JOIN, '', 'a60e-no-join'), 'no-join');
      const csJoin = mj.load('src/codex-session-store.js', anchored(csSrcF, "require('./adapters/codex')", `require(${JSON.stringify(adJoinPath)})`, 'a60e-no-join-reader', { count: 'any' }), 'no-join-reader');
      const reaskRoad = async (A, CSm) => {
        A._resetRolloutIndexForTests(); let release = () => { }; const gate = new Promise((r) => { release = r; });
        try {
          return await withReaddir((p0) => (p0 === csess ? gate : p0 === rdir ? 'fail' : null), async () => {
            let rs = null;
            const listed = await listing(async () => { const out = A.warmCodexRolloutIndex(); const a = reask(CSm, tid2), b = reask(CSm, tid2); setTimeout(release, 150); rs = await Promise.all([a, b]); await out; });
            return { rs, listed, walks: A.rolloutIndexStats().walks };
          });
        } finally { release(); A._resetRolloutIndexForTests(); }
      };
      const g20 = await reaskRoad(AD, CS), r20 = await reaskRoad(require(adJoinPath), csJoin);
      ok(g20.walks === 1 && g20.listed === 0 && g20.rs.every((x) => x.notLoaded === 'transcript_reader_restarting' && x.notKnown && !x.notFound) && r20.walks >= 2,
        `r2439 (1) the page's re-ask never walks: two re-asks while the one walk hangs — ${g20.walks} walk, ${g20.listed} listings on the loop, both answered «not loaded» · «not known yet» (${g20.rs.map((x) => x.notKnown).join(', ')}); RED (an index that walks per ask): ${r20.walks} walks`);
      // (21) CONDITION 2 — IT ENDS. FOUND: a re-ask answered «not known yet» (the folder refused); the folder lists again and the index's
      // walk ends; the next re-ask reads the rollout — loaded, and the page is told ONCE (line 411's history-ready: the readable mark fires
      // once, a third read tells nobody). ABSENT: a thread with no rollout — «not known yet» while the folder refused, then the walk begun
      // after its miss finds none: the re-ask is answered LOADED with `notFound` (never «not loaded» again: the page's re-ask stops) and
      // the page's PURE decision (src/lib/history-reask.js endsNotFound) makes the line's words the final word. RED: a reader that keeps an
      // absent rollout «not known yet» (the page would ask for ever)
      const ABSENT = '      if (threadId) { const got = await codexRolloutLookupAsync(threadId); if (!got.known) partial.unknown = true; else if (!got.fp) partial.absent = true; }\n';
      const HR = await import((await import('node:url')).pathToFileURL(path.join(REPO, 'src/lib/history-reask.js')).href);
      const endRoad = async (CSm) => {
        AD._resetRolloutIndexForTests(); AD._setRolloutTimingForTests({ retryMs: 0 });
        const told = []; const off = SS.onHistoryReadable((id) => told.push(id));
        let failing = true;
        try {
          return await withReaddir((p0) => (failing && p0 === rdir ? 'fail' : null), async () => {
            const tA = 'eeeeeeee-0000-4000-8000-0000000a60f6';   // a thread with no rollout anywhere
            const f0 = await reask(CSm, tid2), a0 = await reask(CSm, tA);
            failing = false; await AD.refreshCodexRolloutIndex();   // the folder lists again; the index's own walk ends (the re-ask waits on it, never walks)
            const f1 = await reask(CSm, tid2), f2 = await reask(CSm, tid2), a1 = await reask(CSm, tA);
            return { f0, a0, f1, f2, a1, toldF: told.filter((x) => x === tid2).length };
          });
        } finally { off(); AD._setRolloutTimingForTests({}); AD._resetRolloutIndexForTests(); }
      };
      const g21 = await endRoad(CS), r21 = await endRoad(mutantCopies('a60e-absent-unknown', REPO).load('src/codex-session-store.js', anchored(csSrcF, ABSENT, '      if (threadId) { const got = await codexRolloutLookupAsync(threadId); if (!got.known || !got.fp) partial.unknown = true; }\n', 'a60e-absent-unknown'), 'absent-unknown'));   // stale-pins: kept (the red control: an absent rollout kept «not known yet»)
      const stop = HR.reaskNext({ ...HR.REASK_IDLE, code: 'transcript_reader_restarting', due: Date.now() + 5000 }, { type: 'loaded' });
      ok(g21.f0.notKnown && g21.a0.notKnown && !g21.f1.notLoaded && !g21.f1.notFound && g21.toldF === 1 && !g21.a1.notLoaded && g21.a1.notFound
        && HR.endsNotFound({ historyNotFound: g21.a1.notFound }, true) && !HR.endsNotFound({ historyNotFound: g21.f1.notFound }, true) && !HR.endsNotFound({ historyNotFound: true }, false) && stop.act === 'cancel' && !stop.state.code
        && r21.a1.notLoaded && r21.a1.notKnown,
        `r2439 (2) it ends: found — loaded (${!g21.f1.notLoaded}), the page told ${g21.toldF} time(s); absent — loaded with its final word (notFound ${g21.a1.notFound}; the page's decision: the final word ${HR.endsNotFound({ historyNotFound: g21.a1.notFound }, true)}, its re-ask ${stop.act}); RED (absent kept «not known yet»): still «not loaded» (${!!r21.a1.notLoaded})`);
      // (22) CONDITION 3 — THE WORDS: «not known yet: it fills in here by itself» in en, zh and ja, told apart from line 411's own causes
      // (a storage that hangs, the reader gone, the reader restarting), its final word «not found» in its own sentence; the unit's old
      // sentence (a person sent to open the conversation again) is gone from the page and the dictionaries; the storage's cause comes first
      const ZHS = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), JAS = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8'), CVS = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
      const NKY = 'Its saved history is not known yet — it fills in here by itself.', NFW = 'Its saved history was not found.';
      const valOf = (src, k) => { const l = src.split('\n').find((x) => x.startsWith('  ' + JSON.stringify(k) + ':')); if (!l) return null; const v = l.slice(l.indexOf('": ') + 3).trim(); return JSON.parse(v.endsWith(',') ? v.slice(0, -1) : v); };
      const OTHER = ["This conversation's file is not answering, so its history is not loaded yet (or not all of it). Trying again at {time} — it fills in here by itself.", 'The history is not loaded yet, or not all of it — the transcript reader is not running. Trying again at {time}.', 'The history is not loaded yet, or not all of it — the transcript reader is restarting. It fills in here by itself in a moment.'];
      const words = [NKY, NFW].flatMap((k) => [valOf(ZHS, k), valOf(JAS, k)]);
      const apart = [ZHS, JAS].every((src) => OTHER.every((k) => valOf(src, k) !== valOf(src, NKY)));
      const body = CVS.slice(CVS.indexOf('  _sayHistoryNotLoaded(code, '), CVS.indexOf('  _historyLoadedNow(msg = null) {'));
      // the move onto the train 2.369.418 (主开发 r3509): the train's line 660 says the reader's causes through ONE table
      // (src/lib/reader-words.js, r3077: the storage's first, then the reader gone / busy / restarting) — so the order is read as it
      // stands now: «not known yet» yields to a hung storage, then the table says every other cause (the toast's words too)
      const RW = fs.readFileSync(path.join(REPO, 'src/lib/reader-words.js'), 'utf8'), lineFn = RW.slice(RW.indexOf('export function readerLineWords('));
      const first = body.indexOf('if (info && info.notKnownYet && !info.storageHung) words') > 0 && body.indexOf('if (info && info.notKnownYet && !info.storageHung) words') < body.indexOf('else words = readerLineWords(info, this._clockOf(at));')
        && CVS.includes('if (info && info.notKnownYet && !info.storageHung) return ') && lineFn.indexOf("if (k === 'storage')") >= 0 && lineFn.indexOf("if (k === 'storage')") < lineFn.indexOf("if (k === 'gone')");   // r2743: the storage's cause first (it carries a time)
      const oldGone = !['src/lib/chat-view.js', 'src/lib/session-lifecycle.js', 'src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].some((f) => fs.readFileSync(path.join(REPO, f), 'utf8').includes('it is read again the next time this conversation opens'));   // stale-pins: kept (the absence check: the unit's old sentence is gone)
      ok(words.every((w) => typeof w === 'string' && w.length > 4) && apart && first && oldGone && CVS.includes("t('" + NFW + "')"),
        `r2439 (3) the words: «not known yet» and «not found» in zh and ja (${words.join(' · ')}), apart from line 411's three causes (${apart}), the storage's cause first, then this one, then line 411's others (${first}); the old sentence gone (${oldGone})`);
      // ── 主开发 r2743: LINE 513's REQUIRED SMALL
      // (23) (1) THE SYNCHRONOUS ROAD NEVER RE-READS what the async road filled: a reader partial («not known yet»: tid2's folder refused),
      // the index then MOVED (the folder lists, a walk ended), a synchronous accessor asked: zero reads of the rollout on the loop.
      // RED: the moved form's guard (a partial reader re-read synchronously once the epoch moved)
      const GUARD = csSrcF.split('\n').find((l) => l.startsWith('    if (this._all) return;')) + '\n';
      const syncRoad = async (CSm) => {
        AD._resetRolloutIndexForTests(); AD._setRolloutTimingForTests({ retryMs: 0 }); let failing = true;
        try {
          return await withReaddir((p0) => (failing && p0 === rdir ? 'fail' : null), async () => {
            const rd = rdOf(CSm, tid2); await rd.rawAsync(); const partial0 = !!rd.notLoadedNotKnown;
            failing = false; await AD.refreshCodexRolloutIndex();
            let reads = 0; const realOpen = fs.openSync, realRead = fs.readFileSync;
            fs.openSync = function (p0, ...a) { if (String(p0) === rfile) reads++; return realOpen.call(this, p0, ...a); };
            fs.readFileSync = function (p0, ...a) { if (String(p0) === rfile) reads++; return realRead.call(this, p0, ...a); };
            try { rd.raw(); rd.chatStatus(); } finally { fs.openSync = realOpen; fs.readFileSync = realRead; }
            return { partial0, reads };
          });
        } finally { AD._setRolloutTimingForTests({}); AD._resetRolloutIndexForTests(); }
      };
      const g23 = await syncRoad(CS), r23 = await syncRoad(mutantCopies('a60e-sync-reread', REPO).load('src/codex-session-store.js', anchored(csSrcF, GUARD, '    if (this._all && (!this._partial || this._partialEpoch === rolloutIndexEpoch())) return;\n', 'a60e-sync-reread'), 'sync-reread'));   // stale-pins: kept (the red control: the moved form's guard)
      ok(g23.partial0 && g23.reads === 0 && r23.partial0 && r23.reads > 0,
        `r2743 (1) a partial reader, the epoch moved, a synchronous accessor: ${g23.reads} reads of the rollout on the loop; RED (the moved form's guard): ${r23.reads}`);
      // (24) (2) THE LOADED MARK's PAIRS, one reader each. (a) NEVER LOADED WHILE THE STORAGE STILL REFUSES: a read «not known yet» (our
      // cause), then the index finds the rollout and the re-read meets line 411's storage refusal — «not loaded» with the storage's cause,
      // ours cleared. (b) NEVER «NOT LOADED» OVER A HISTORY THAT CAME IN: a read line 411's door refused (the pool's heap bound: its «not
      // loaded»), the reader partial (as a read whose chain held a rollout «not known yet» leaves it), the pool answers again — the re-read
      // loads it, nothing «not loaded». Each on a rollout of its own (a storage refusal stays in the adapter's memory for that file). RED: a re-read that does not
      // start from nothing (the moved form's _markRead)
      const T0P = new Date(Date.UTC(2026, 6, 3)).toISOString(), mkRoll = (dir, id, model) => { fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, `rollout-2026-07-03T00-00-00-${id}.jsonl`); fs.writeFileSync(f, [{ timestamp: T0P, type: 'session_meta', payload: { id } }, { timestamp: T0P, type: 'turn_context', payload: { model } }].map((x) => JSON.stringify(x)).join('\n') + '\n'); return f; };
      const refusingPool = { call() { return Promise.reject(Object.assign(new Error('a stand-in deadline'), { status: 503, safeFsTimeout: true, deadline: true })); } };
      const boundPool = { call() { return Promise.reject(Object.assign(new Error('a stand-in heap bound'), { code: 'heap_bound' })); } };   // line 411's «not loaded» that the next read gets past (no storage memory of the file)
      const OLD_MARK = "    if (partial.unknown) { if (!this.notLoaded) { this.notLoaded = NOT_LOADED; this._notLoadedByIndex = true; } this.notLoadedNotKnown = true; }\n    else if (this.notLoadedNotKnown) { this.notLoadedNotKnown = false; if (this._notLoadedByIndex) { this.notLoaded = null; this._notLoadedByIndex = false; } }\n";   // stale-pins: kept (the red control: the moved form's mark, set and cleared without a fresh start)
      const NEW_MARK = csSrcF.split('\n').find((l) => l.startsWith('    if (partial.unknown) { if (!this.notLoaded) this.notLoaded = NOT_LOADED; this.notLoadedNotKnown = ')) + '\n';
      const RESET = csSrcF.split('\n').find((l) => l.startsWith('      this._resetNotLoaded();')) + '\n';
      const csPairsRed = mutantCopies('a60e-pairs-red', REPO).load('src/codex-session-store.js', anchored(anchored(csSrcF, NEW_MARK, OLD_MARK, 'a60e-old-mark'), RESET, '', 'a60e-no-reset'), 'pairs-red');
      const pairRoad = async (CSm, tag) => {
        const tP = 'eeeeeeee-0000-4000-8000-00000a60f7' + tag, tB = 'eeeeeeee-0000-4000-8000-00000a60f8' + tag;
        const rdirP = path.join(csess, '2026', '07', '03' + tag), rdirB = path.join(csess, '2026', '07', '04' + tag);
        mkRoll(rdirP, tP, 'gpt-stand-in-pair-a'); mkRoll(rdirB, tB, 'gpt-stand-in-pair-b');
        const pool0 = AD.transcriptPool(); let failing = true;
        AD._resetRolloutIndexForTests(); AD._setRolloutTimingForTests({ retryMs: 0 });
        try {
          const a = await withReaddir((p0) => (failing && p0 === rdirP ? 'fail' : null), async () => {
            const rd = rdOf(CSm, tP); await rd.rawAsync(); const r1 = { nl: !!rd.notLoaded, nk: !!rd.notLoadedNotKnown };
            failing = false; await AD.refreshCodexRolloutIndex();
            AD._setTranscriptPoolForTest(refusingPool); try { await rd.rawAsync(); } finally { AD._setTranscriptPoolForTest(pool0); }
            return { r1, r2: { nl: !!rd.notLoaded, storage: !!rd.notLoadedStorage, nk: !!rd.notLoadedNotKnown } };
          });
          await AD.refreshCodexRolloutIndex();
          const rdB = rdOf(CSm, tB);
          AD._setTranscriptPoolForTest(boundPool); try { await rdB.rawAsync(); } finally { AD._setTranscriptPoolForTest(pool0); }
          const b1 = { nl: !!rdB.notLoaded, storage: !!rdB.notLoadedStorage };
          rdB._partial = true; rdB._partialEpoch = -1;   // as a read whose chain held a rollout «not known yet» leaves it: the next read is a re-read
          await rdB.rawAsync();   // the real pool answers
          return { a, b: { b1, b2: { nl: !!rdB.notLoaded } } };
        } finally { AD._setRolloutTimingForTests({}); AD._resetRolloutIndexForTests(); }
      };
      const g24 = await pairRoad(CS, 'a1'), r24 = await pairRoad(csPairsRed, 'b2');   // hex tags: the ids stay UUID-shaped (the index reads a rollout's id from its name)
      ok(g24.a.r1.nl && g24.a.r1.nk && g24.a.r2.nl && g24.a.r2.storage && !g24.a.r2.nk && g24.b.b1.nl && !g24.b.b1.storage && !g24.b.b2.nl
        && !r24.a.r2.nl && r24.b.b2.nl,   // r2873 (c): a red for EACH pair
        `r2743 (2) the loaded mark's pairs: (a) «not known yet», then the storage refuses the re-read — still «not loaded» with the storage's cause (${g24.a.r2.nl}, ${g24.a.r2.storage}), ours cleared (${!g24.a.r2.nk}); (b) the pool refused (line 411's «not loaded»), then the history came in — «not loaded» gone (${!g24.b.b2.nl}); RED (no fresh start): (a) loaded while the storage refused ${!r24.a.r2.nl}, (b) «not loaded» over the history ${r24.b.b2.nl}`);
      // (25) r2743 (3) as r2873 (a) meant it — THE FINAL WORD, driven through the reader, the attach's one rule and the page's decision: a
      // whole walk finds a thread's rollout ABSENT (the reader's `notFound`); a conversation this hub started FRESH (`_bornHere`) gets no
      // final word on the live attach (it keeps «not known yet» and the re-ask); a restored / resumed one is TOLD «not found» — the page's
      // PURE decision turns its line into the final word and its re-ask cancels. RED: the moved small's rule (no live attach told)
      const tGone = 'eeeeeeee-0000-4000-8000-0000000a6100';   // a thread with no rollout anywhere
      const FINAL = csSrcF.split('\n').find((l) => l.startsWith('function finalWordFor(sm, session) {')) + '\n';
      const csNoFinal = mutantCopies('a60e-no-final', REPO).load('src/codex-session-store.js', anchored(csSrcF, FINAL, 'function finalWordFor(sm, session) { return {}; }\n', 'a60e-no-final'), 'no-final');
      const finalRoad = async (CSm) => {
        AD._resetRolloutIndexForTests(); AD._setRolloutTimingForTests({ retryMs: 0 });
        try {
          await reask(CSm, tGone);   // its miss
          await AD.refreshCodexRolloutIndex();   // a whole walk begun after it
          const rd = rdOf(CSm, tGone); await rd.rawAsync();
          const fresh = CSm.finalWordFor(rd, { _bornHere: true }), restored = CSm.finalWordFor(rd, { _bornHere: false });
          const stop = HR.reaskNext({ ...HR.REASK_IDLE, code: 'transcript_reader_restarting', due: Date.now() + 5000 }, { type: 'loaded' });
          return { notFound: !!rd.notFound, fresh, restored, pageFresh: HR.endsNotFound(fresh, true), pageRestored: HR.endsNotFound(restored, true), stop: stop.act };
        } finally { AD._setRolloutTimingForTests({}); AD._resetRolloutIndexForTests(); }
      };
      const g25 = await finalRoad(CS), r25 = await finalRoad(csNoFinal);
      const WSH = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
      const wired = (WSH.split('\n').find((l) => l.includes("const livePayload = { type: 'attached'")) || '').includes("require('./codex-session-store.js').finalWordFor(sm, session)");
      ok(g25.notFound && !g25.pageFresh && g25.pageRestored && g25.stop === 'cancel' && wired && r25.notFound && !r25.pageRestored,
        `r2873 (a) the final word: absent after a whole walk (${g25.notFound}); a fresh conversation keeps «not known yet» (${!g25.pageFresh}); a restored one is told «not found», the line its final word (${g25.pageRestored}), the re-ask ${g25.stop}; the live attach asks the one rule (${wired}); RED (the moved small's rule): a restored one told ${r25.pageRestored}`);
      // (26) r2873 (b) — A RE-READ THAT THROWS LEAVES THE MARKS AS THEY WERE: a reader «not loaded» · «not known yet» (the folder refused),
      // the index then moved, the re-read's worker read THROWS: the reader still says «not loaded» · «not known yet». RED: the catch that
      // does not put them back (a reused reader would read as loaded over its partial history)
      const RESTORE = csSrcF.split('\n').find((l) => l.startsWith('      } catch (e) { Object.assign(this, kept); throw e; }')) + '\n';
      const csNoRestore = mutantCopies('a60e-no-restore', REPO).load('src/codex-session-store.js', anchored(csSrcF, RESTORE, '      } catch (e) { throw e; }\n', 'a60e-no-restore'), 'no-restore');
      const throwRoad = async (CSm) => {
        AD._resetRolloutIndexForTests(); AD._setRolloutTimingForTests({ retryMs: 0 }); let failing = true; const real = AD.codexHistoryMergedPagedAsync;
        try {
          return await withReaddir((p0) => (failing && p0 === rdir ? 'fail' : null), async () => {
            const rd = rdOf(CSm, tid2); await rd.rawAsync(); const before = { nl: !!rd.notLoaded, nk: !!rd.notLoadedNotKnown };
            failing = false; await AD.refreshCodexRolloutIndex();
            AD.codexHistoryMergedPagedAsync = async () => { throw new Error('a stand-in read that throws'); };
            let threw = false; try { await rd.rawAsync(); } catch { threw = true; } finally { AD.codexHistoryMergedPagedAsync = real; }
            return { before, threw, after: { nl: !!rd.notLoaded, nk: !!rd.notLoadedNotKnown } };
          });
        } finally { AD.codexHistoryMergedPagedAsync = real; AD._setRolloutTimingForTests({}); AD._resetRolloutIndexForTests(); }
      };
      const g26 = await throwRoad(CS), r26 = await throwRoad(csNoRestore);
      ok(g26.before.nl && g26.before.nk && g26.threw && g26.after.nl && g26.after.nk && r26.threw && !r26.after.nl,
        `r2873 (b) a re-read that throws: the reader still «not loaded» · «not known yet» (${g26.after.nl}, ${g26.after.nk}); RED (no marks put back): reads as loaded (${!r26.after.nl})`);
      // (27) r2873 (d) — A FOLDER THAT CAN NEVER BE LISTED IS SAID, NEVER PROMISED FOR EVER: the index's walks fail three times in a row (the
      // folder refuses every listing): the reader's cause is 'folder', the page says «A folder of its saved history cannot be read.» (en / zh /
      // ja); before that, «not known yet». RED: an index whose walks never count as unreadable, the reader wired to it
      const UNR = adSrc.split('\n').find((l) => l.startsWith('const UNREADABLE_AFTER = ')) + '\n';
      const mu = mutantCopies('a60e-never-unreadable', REPO), adUnrPath = mu.write('src/adapters/codex.js', anchored(adSrc, UNR, 'const UNREADABLE_AFTER = 1e9;\n', 'a60e-never-unreadable'), 'never-unreadable');
      const csUnr = mu.load('src/codex-session-store.js', anchored(csSrcF, "require('./adapters/codex')", `require(${JSON.stringify(adUnrPath)})`, 'a60e-never-unreadable-reader', { count: 'any' }), 'never-unreadable-reader');
      const folderRoad = async (A, CSm) => {
        A._resetRolloutIndexForTests(); A._setRolloutTimingForTests({ retryMs: 0 });
        try {
          return await withReaddir((p0) => (p0 === rdir ? 'fail' : null), async () => {
            const first = await reask(CSm, tid2);
            for (let i = 0; i < 3; i++) await A.refreshCodexRolloutIndex();
            const rd = rdOf(CSm, tid2); await rd.rawAsync();
            return { first: first.notKnown, cause: rd.notLoadedNotKnown, streak: A.rolloutIndexStats().walks };
          });
        } finally { A._setRolloutTimingForTests({}); A._resetRolloutIndexForTests(); }
      };
      const g27 = await folderRoad(AD, CS), r27 = await folderRoad(require(adUnrPath), csUnr);
      const FOLD = 'A folder of its saved history cannot be read.', CV27 = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
      const fWords = [valOf(fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), FOLD), valOf(fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8'), FOLD)];
      ok(g27.first && g27.cause === 'folder' && r27.cause === true && CV27.split("t('" + FOLD + "')").length - 1 === 2 && fWords.every((w) => typeof w === 'string' && w.length > 4),
        `r2873 (d) a folder that can never be listed: after ${g27.streak} walks the cause is ${JSON.stringify(g27.cause)} and the page says so (the line and the toast; zh / ja ${fWords.join(' · ')}); RED (never unreadable): ${JSON.stringify(r27.cause)}`);
      AD._resetRolloutIndexForTests();
      fs.rmSync(rfile, { force: true });
    }
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
      const { anchored } = await import('./scratch.mjs');   // B-0d3e: each red control below throws by name when its product line moves
      fs.mkdirSync(bdir, { recursive: true });
      fs.writeFileSync(path.join(bdir, wid + '.json'), JSON.stringify({ plan: [{ step: 'Read the failing test', status: 'completed' }, { step: 'Write the cure', status: 'inProgress' }, { step: 'Gate it', status: 'pending' }] }));
      const liveS = { backend: 'codex', mode: 'chat', backendSessionId: ctid, cwd, buffer: '' };
      const mk2 = (s0, id) => (s0.backend === 'codex' ? new CS.CodexSessionMessages(s0, id, { buffersDir: bdir }) : new SS.SessionMessages(s0, id || null, { buffersDir: bdir, permissionModes: [] }));
      const stepsOf = async (TS) => ((await TS.createTranscriptService({ activeSessions: new Map([[wid, liveS]]), createSessionMessages: mk2, hosts: null }).taskState({ backend: 'codex', sessionId: ctid, cwd })) || {}).todos || [];
      const CALL = 'createSessionMessages(sessionShape(r, live), liveIdOf(live))';
      const got = await stepsOf({ createTranscriptService });
      const noId = mutantCopies('b952b-no-id', REPO).load('src/transcript-service.js', anchored(tsSrc, CALL, 'createSessionMessages(sessionShape(r, live))', 'no-id'), 'no-id');
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
      // B-952b SMALLS (主开发 03:40Z) — (1) THE WINDOW'S OWN CONVERSATION FIRST: a codex fork still on its parent's thread id, both live;
      // the Properties request names the fork's own id ⇒ the fork's plan, never the parent's. RED CONTROL: the first-match lookup
      const pid = 'w-b952b-parent', fid = 'w-b952b-fork';
      fs.writeFileSync(path.join(bdir, pid + '.json'), JSON.stringify({ plan: [{ step: 'The parent step', status: 'pending' }] }));
      fs.writeFileSync(path.join(bdir, fid + '.json'), JSON.stringify({ plan: [{ step: 'The fork step', status: 'inProgress' }] }));
      const twins = () => new Map([[pid, { ...liveS }], [fid, { ...liveS }]]);
      const stepOfFork = async (TS) => (((await TS.createTranscriptService({ activeSessions: twins(), createSessionMessages: mk2, hosts: null }).taskState({ backend: 'codex', sessionId: ctid, cwd, webuiId: fid })) || {}).todos || [])[0]?.content || null;
      const LOOK = "    if (r.webuiId) { const own = activeSessions.get(r.webuiId); if (sameConv(own)) return own; }\n";
      const forkNow = await stepOfFork({ createTranscriptService });
      const forkBase = await stepOfFork(mutantCopies('b952b-first-match', REPO).load('src/transcript-service.js', anchored(tsSrc, LOOK, '', 'first-match'), 'first-match'));
      ok(forkNow === 'The fork step' && forkBase === 'The parent step', `B-952b smalls: a codex FORK still on its parent's thread id — the window's own id answers ITS plan («${forkNow}»); RED CONTROL (the first match): «${forkBase}»`, { forkNow, forkBase });
      // …and THE MACHINE THE REQUEST NAMES: a conversation live on m1 and here, on one thread id, m1's inserted first; a request for here
      // (no host) answers here's plan. RED CONTROL: the lookup without the machine
      const mid = 'w-b952b-m1', hid = 'w-b952b-here';
      fs.writeFileSync(path.join(bdir, mid + '.json'), JSON.stringify({ plan: [{ step: 'On m1', status: 'pending' }] }));
      fs.writeFileSync(path.join(bdir, hid + '.json'), JSON.stringify({ plan: [{ step: 'Here', status: 'pending' }] }));
      const machines = () => new Map([[mid, { ...liveS, host: 'm1' }], [hid, { ...liveS }]]);
      const stepHere = async (TS) => (((await TS.createTranscriptService({ activeSessions: machines(), createSessionMessages: mk2, hosts: null }).taskState({ backend: 'codex', sessionId: ctid, cwd })) || {}).todos || [])[0]?.content || null;
      const HOSTLINE = "      if (!sameConv(s) || (s.host || null) !== (r.host || null)) continue;\n";
      const hereNow = await stepHere({ createTranscriptService });
      const hereBase = await stepHere(mutantCopies('b952b-any-host', REPO).load('src/transcript-service.js', anchored(tsSrc, HOSTLINE, '      if (!sameConv(s)) continue;\n', 'any-host'), 'any-host'));
      ok(hereNow === 'Here' && hereBase === 'On m1', `B-952b smalls: the live lookup takes the MACHINE the request names — here's plan («${hereNow}»); RED CONTROL (any machine): «${hereBase}»`, { hereNow, hereBase });
      // (2) THE SIDE FILE IS READ OFF THE LOOP on the route (Properties refetches at every broadcast; the data folder may be a slow mount):
      // no synchronous read of it on the task-state road. RED CONTROL: the reader left to read it synchronously
      const syncReads = async (TS) => { let n = 0; const real = fs.readFileSync; fs.readFileSync = function (p0, ...x) { if (typeof p0 === 'string' && p0.endsWith(wid + '.json')) n++; return real.call(this, p0, ...x); };
        try { const svc = TS.createTranscriptService({ activeSessions: new Map([[wid, liveS]]), createSessionMessages: mk2, hosts: null }); await svc.taskState({ backend: 'codex', sessionId: ctid, cwd }); await svc.status({ backend: 'codex', sessionId: ctid, cwd }); } finally { fs.readFileSync = real; } return n; };
      const LOADS = "  const sideFileOf = async (sm) => { if (sm && typeof sm.loadWrapperMeta === 'function') { try { await sm.loadWrapperMeta(); } catch { } } return sm; };\n";
      const offNow = await syncReads({ createTranscriptService });
      const offBase = await syncReads(mutantCopies('b952b-sync-side', REPO).load('src/transcript-service.js', anchored(tsSrc, LOADS, '  const sideFileOf = async (sm) => sm;\n', 'sync-side'), 'sync-side'));
      ok(offNow === 0 && offBase === 2, `B-952b smalls: the side file is read OFF the loop on the task-state AND the status road (${offNow} synchronous reads); RED CONTROL (no async load): ${offBase}`, { offNow, offBase });
      // (3) THE STATUS ROAD ITSELF: a live codex conversation's status() states the model its side file holds. RED CONTROL: no id ⇒ not it
      fs.writeFileSync(path.join(bdir, wid + '.json'), JSON.stringify({ model: 'gpt-stand-in-b952b', plan: [] }));
      const modelOf = async (TS) => ((await TS.createTranscriptService({ activeSessions: new Map([[wid, liveS]]), createSessionMessages: mk2, hosts: null }).status({ backend: 'codex', sessionId: ctid, cwd })) || {}).chatStatus?.model || '';
      const ROAD2 = 'createSessionMessages(sessionShape(r, session), liveIdOf(session))';
      const mNow = await modelOf({ createTranscriptService });
      const mBase = await modelOf(mutantCopies('b952b-status-no-id', REPO).load('src/transcript-service.js', anchored(tsSrc, ROAD2, 'createSessionMessages(sessionShape(r, session))', 'status-no-id'), 'status-no-id'));   // stale-pins: kept (the red control rebuilds the road without the id)
      ok(mNow === 'gpt-stand-in-b952b' && mBase !== 'gpt-stand-in-b952b', `B-952b smalls: the STATUS road — a live codex conversation's status states the model its side file holds («${mNow}»); RED CONTROL (no id): «${mBase}»`, { mNow, mBase });
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
      const cxWas = process.env.CODEX_CMD; process.env.CODEX_CMD = path.join(HOME_FAKE, 'codex-route');   // B-ec25: the named stand-in
      let body = null;
      const n = await listing(async () => { body = await new Promise((resolve, reject) => { const res = { json: resolve, status: () => res }; Promise.resolve(layer.route.stack[0].handle({ query: { backend, backendSessionId: backend === 'codex' ? tid : sid, cwd, host: 'm1' } }, res)).catch(reject); }); });
      if (cxWas === undefined) delete process.env.CODEX_CMD; else process.env.CODEX_CMD = cxWas;
      return { todos: (body && body.todos) || [], asked: asked.join(' '), n, ran: ran(path.join(HOME_FAKE, 'codex-route')) };
    };
    const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8'), TSREQ = "const { createTranscriptService } = require('../transcript-service');";
    const GATE = "    const viaDev = fromTranscript ? await tryDevice(r, 'taskState', {}) : undefined;\n    if (viaDev) return viaDev;\n    const hostFetchError = fromTranscript ? await refreshRemote(r) : null;";
    const tsNoGate = mutantCopies('a2-route-gate', REPO).write('src/transcript-service.js', editAnchor(tsSrc, GATE, () => "    const viaDev = await tryDevice(r, 'taskState', {});\n    if (viaDev) return viaDev;\n    const hostFetchError = await refreshRemote(r);", "src/transcript-service.js"), 'no-gate');   // stale-pins: kept (dec3d0da0's road, planted back as the RED control)
    const R0 = require(path.join(REPO, 'src/routes/sessions.js'));
    const cGreen = await routeOf(R0, 'codex'), clGreen = await routeOf(R0, 'claude');
    const cRed = await routeOf(mutantCopies('a2-route-gate-r', REPO).load('src/routes/sessions.js', editAnchor(rsrc, TSREQ, () => `const { createTranscriptService } = require(${JSON.stringify(tsNoGate)});`, "src/routes/sessions.js"), 'no-gate-route'), 'codex');
    ok(tsSrc.split(GATE).length === 2 && rsrc.split(TSREQ).length === 2 && rsrc.includes('sessionId: rid, cwd, host: host || null, webuiId:') && cGreen.asked === '' && cGreen.todos.length === 0 && cGreen.n === 0 && !cGreen.ran && clGreen.asked === 'm1:taskState:claude' && clGreen.todos[0]?.content === 'held on m1' && cRed.asked.includes('m1:taskState:codex'),
      `GET /api/session-todos on m1: a codex conversation answered here as the release did (${cGreen.todos.length} steps; asked of m1: «${cGreen.asked}»; ${cGreen.n} listings, nothing started); a claude one asked of m1 (${clGreen.asked}); RED (no descriptor rule — dec3d0da0): the codex one asked of m1 (${cRed.asked})`, { cGreen, clGreen, cRed });
    // its TAKEN verdict (small 1): the machine rule reads the descriptor's OWN field (taskStateFromTranscript), never the warm hook
    // as a second meaning — a codex store that gains a warm stays answered here; one that DECLARES the field is asked of m1. RED: a
    // service that reads the warm hook ⇒ the warm alone sends a codex conversation's ask to m1
    {
      const HX = require(path.join(REPO, 'src/harnesses/codex.js')), FIELD = "store?.taskStateFromTranscript === true;";
      const tsWarmRule = mutantCopies('a2-route-field', REPO).write('src/transcript-service.js', editAnchor(tsSrc, FIELD, () => "store?.warmTaskState ? true : false;", "src/transcript-service.js"), 'warm-rule');
      const RW = mutantCopies('a2-route-field-r', REPO).load('src/routes/sessions.js', editAnchor(rsrc, TSREQ, () => `const { createTranscriptService } = require(${JSON.stringify(tsWarmRule)});`, "src/routes/sessions.js"), 'warm-rule-route');
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
    // B-5cf8 — A MACHINE THAT DOES NOT ANSWER IS SAID, NEVER «NO STEPS»: a claude conversation on m1 whose device link and
    // transcript fetch both fail used to answer {todos: []} (the service dropped refreshRemote's reason) and Properties read
    // «The agent hasn't kept a todo list». Now the route carries `hostFetchError` and the page's steps road (its REAL callback,
    // lifted out of session-props.js and run over a stub DOM) says «Couldn't load the steps from <machine> — <reason>»; a
    // machine that answers but holds no transcript still says the honest empty line; steps read earlier stay, with the failure
    // said under them. RED controls (anchored): the release's route answer, the release's service road.
    {
      const { anchored } = await import('./scratch.mjs');
      const WHY = 'ssh: connect to host m1 port 22: Connection timed out';
      const sidGone = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeee404';   // no transcript of it on this machine
      const hostsOf = (fetch, link = 'unknown') => ({ deviceBounded: async () => { throw new Error('the device link is down'); }, fetchTranscript: fetch, linkState: () => link });
      const todosOf = async (R, h, rid) => {
        R.setup({ activeSessions: new Map(), webuiPids: new Set(), refreshWebuiPids: () => { }, createSessionMessages: mkReader, BUFFERS_DIR: path.join(os.homedir(), 'buf'), PERMISSION_MODES: [], execFileSync, hosts: h, accounts: null, sessionAuth: () => ({}), serverSetting: () => undefined });
        const layer = R.router.stack.filter((l) => l.route?.path === '/api/session-todos').pop();   // the router is the module's: each setup() adds a layer — THIS setup's is the newest
        return await new Promise((resolve, reject) => { const res = { json: resolve, status: () => res }; Promise.resolve(layer.route.stack[0].handle({ query: { backend: 'claude', backendSessionId: rid, cwd, host: 'm1' } }, res)).catch(reject); });
      };
      const down = hostsOf(async () => { throw new Error(WHY); }, 'offline'), empty = hostsOf(async () => null, 'online'), lastCopy = hostsOf(async () => '/cache/copy.jsonl', 'offline');
      const R5 = require(path.join(REPO, 'src/routes/sessions.js'));
      const gone = await todosOf(R5, down, sidGone), none = await todosOf(R5, empty, sidGone), stale = await todosOf(R5, lastCopy, sid);
      const ROUTE_LINE = "      res.json({ todos: st.todos || [], ...(st.hostFetchError ? { hostFetchError: String(st.hostFetchError) } : {}), ...(st.hostOffline ? { hostOffline: true } : {}) });";
      const SVC_LINE = "    const hostFetchError = fromTranscript ? await refreshRemote(r) : null;";
      const routeRel = mutantCopies('b5cf8-route', REPO).load('src/routes/sessions.js', anchored(rsrc, ROUTE_LINE, '      res.json({ todos: st.todos || [] });', 'B-5cf8 the release route answer'), 'b5cf8-route');   // stale-pins: kept (the release's answer, planted back by this control)
      const tsRel = mutantCopies('b5cf8-svc', REPO).write('src/transcript-service.js', anchored(anchored(tsSrc, SVC_LINE, '    const hostFetchError = null; if (fromTranscript) await refreshRemote(r);', 'B-5cf8 the release service road'), /\n    const lastCopy = [^\n]*/, '\n    const lastCopy = null;', 'B-5cf8 the release had no last-copy word'), 'b5cf8-svc');
      const svcRel = mutantCopies('b5cf8-svc-r', REPO).load('src/routes/sessions.js', anchored(rsrc, TSREQ, `const { createTranscriptService } = require(${JSON.stringify(tsRel)});`, 'B-5cf8 the route over the release service'), 'b5cf8-svc-route');
      const redRoute = await todosOf(routeRel, down, sidGone), redSvc = await todosOf(svcRel, down, sidGone);
      ok(gone.todos.length === 0 && gone.hostFetchError === WHY && none.todos.length === 0 && !('hostFetchError' in none) && stale.todos.length > 0 && stale.hostFetchError === 'the machine does not answer' && stale.hostOffline === true && !('hostOffline' in gone),
        `B-5cf8 GET /api/session-todos for a claude conversation on m1: the machine does not answer ⇒ {todos: [], hostFetchError: «${gone.hostFetchError}»}; it answers with no transcript ⇒ {todos: []} alone; hosts serves its LAST COPY (ssh failed, a copy kept) ⇒ ${stale.todos.length} steps + «${stale.hostFetchError}»`, { gone, none, stale: { n: stale.todos.length, e: stale.hostFetchError } });
      ok(!('hostFetchError' in redRoute) && redRoute.todos.length === 0 && !('hostFetchError' in redSvc) && redSvc.todos.length === 0,
        'B-5cf8 RED CONTROLS: the release\'s route answer, and the release\'s service road (refreshRemote\'s reason dropped), each answer the unreachable machine as {todos: []} — what Properties read as «no steps»', { redRoute, redSvc });
      // THE PAGE: the steps road's callback, its text lifted out of session-props.js (fails by name when its markers move)
      const sp = fs.readFileSync(path.join(REPO, 'src/lib/session-props.js'), 'utf8');
      const at = sp.indexOf('fetch(`/api/session-todos?'), from = sp.indexOf('}).then(d => {', at), to = sp.indexOf('      }).catch((e) => {', from);
      if (at < 0 || from < 0 || to < 0 || sp.indexOf('fetch(`/api/session-todos?', at + 1) >= 0) throw new Error('B-5cf8: the steps road\'s markers moved in src/lib/session-props.js — move this leg with them');
      const cb = new Function('d', 'stepList', 'escHtml', 't', 's', 'sidebar', 'document', sp.slice(from + '}).then(d => {'.length, to));
      const tt = (k, p = {}) => k.replace(/\{(\w+)\}/g, (_, n) => (n in p ? String(p[n]) : `{${n}}`));
      const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const doc = { createElement: () => { const el = { className: '', style: {}, textContent: '', children: [], appendChild: (c) => el.children.push(c), replaceWith: () => { } }; return el; } };
      const page = (body, host) => { const list = { isConnected: true, style: {}, innerHTML: '', kids: [], appendChild: (c) => list.kids.push(c) }; cb(body, list, esc, tt, { host, backend: 'claude' }, { _hostsData: { hosts: [{ id: 'm1', name: 'Studio Mac' }] } }, doc); return { html: list.innerHTML, kids: list.kids.map((k) => `${k.className}|${k.textContent}`) }; };
      const pGone = page(gone, 'm1'), pNone = page(none, 'm1'), pStale = page(stale, 'm1'), pLocal = page({ todos: [], error: 'the reader failed' }, null), pHubRead = page({ todos: [], error: 'the reader failed' }, 'm1');
      ok(pGone.html.includes('usage-warn') && pGone.html.includes(`Couldn’t load the steps from Studio Mac — ${esc(WHY)}`) && !/hasn't kept/.test(pGone.html)
        && /hasn't kept a todo list/.test(pNone.html) && !pNone.html.includes('usage-warn')
        && pStale.kids.length > 1 && /^usage-warn\|Couldn’t refresh the steps from Studio Mac — it does not answer\. /.test(pStale.kids[pStale.kids.length - 1]) && pStale.kids[pStale.kids.length - 1].endsWith('These are the last ones read.')
        && pLocal.html.includes('Couldn’t load the steps — the reader failed') && pHubRead.html.includes('Couldn’t load the steps — the reader failed') && !pHubRead.html.includes('Studio Mac'),
        'B-5cf8 THE PAGE (the steps road\'s real callback over a stub DOM): the unreachable machine ⇒ «Couldn’t load the steps from Studio Mac — <reason>» (never «hasn\'t kept a todo list»); a machine with no transcript ⇒ the honest empty line; steps read before ⇒ the steps, then «Couldn’t refresh … These are the last ones read.»; a failed read on the hub ⇒ «Couldn’t load the steps — <reason>», never the machine\'s name', { pGone, pNone, pStale: pStale.kids.slice(-2), pLocal });
      const pRed = page(redRoute, 'm1');
      ok(/hasn't kept a todo list/.test(pRed.html), 'B-5cf8 RED CONTROL (the release\'s answer through the same page): «The agent hasn\'t kept a todo list» for a machine that did not answer', pRed);
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
    const RS = mutantCopies('a4-release-metas', REPO).load('src/session-store.js', editAnchor(ssrc, NOW_LINE, `subagentMetas: (${RELEASE.replace('function getSubagentMetas', 'function')})(getHistorySessionId(this._session), this._session.cwd),`, "src/session-store.js"), 'release');
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
  console.log('⑥b the transcript\'s find (B-299b, its folder probe — MEASURED: 1 000 project folders, one call 17 ms, 30 in a loop turn 508 ms): the cwd\'s own path first');
  {
    const lists = (fn) => { let n = 0; const real = fs.readdirSync; fs.readdirSync = function (p0, ...a) { if (p0 === projects) n++; return real.call(this, p0, ...a); }; let r = null; try { r = fn(); } finally { fs.readdirSync = real; } return { n, r }; };
    const hit = lists(() => SS.findSessionJsonlPath(sid, cwd)), bare = lists(() => SS.findSessionJsonlPath(sid, '')), away = lists(() => SS.findSessionJsonlPath(sid, '/tmp/somewhere-else'));
    const { anchored } = await import('./scratch.mjs');
    const SR = mutantCopies('find-lists-first', REPO).load('src/session-store.js', anchored(fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8'), '  if (own) { const hit = firstThere([own]); if (hit) return hit; }\n', '', 'the release order: the folder listed first'), 'listsfirst');
    const red = lists(() => SR.findSessionJsonlPath(sid, cwd));
    ok(hit.r === fp && hit.n === 0 && bare.r === fp && bare.n === 1 && away.r === fp && away.n === 1 && red.r === fp && red.n === 1,
      'a find with its cwd lists NO project folder (its own path answers); with no cwd, or a conversation that moved, the folders are walked once and it is found; CONTROL the release\'s order lists on every find', { withCwd: hit.n, noCwd: bare.n, moved: away.n, release: red.n });
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
    const ssrcB = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8'), ROW = 'liveRow.bytes = liveB + ix.bytes + ts.bytes + hb;';   // B-80cb cure: + the handed-off tails (hb)   // B-360d (A) r1374: the live row counts the indexes (the single row is gone)
    const RelC = mutantCopies('a5-census', REPO).load('src/session-store.js', editAnchor(ssrcB, ROW, () => 'liveRow.bytes = liveB + ts.bytes + hb;', "src/session-store.js"), 'uncounted');   // RED: cadb07780's count (the tails without their indexes), planted in the live row
    const NC = 400;
    const sceneC = async (M, k) => {
      const sidC = `cccccccc-0000-4000-8000-0000000c${String(k).padStart(4, '0')}`, fC = path.join(projDir, sidC + '.jsonl');
      fs.writeFileSync(fC, Array.from({ length: NC }, (_, i) => JSON.stringify({ uuid: `pc${k}-${i}`, timestamp: T1, type: 'assistant', message: { id: `msg_pc${k}_${i}`, role: 'assistant', content: [{ type: 'text', text: 'x' }] } })).join('\n') + '\n');
      await M.warmSessionJsonlAsync(sidC, cwd);
      const tails = () => { const r = M.jsonlCacheCensus(); const rows = Array.isArray(r) ? r : [r]; return { bytes: rows.reduce((a, x) => a + x.bytes, 0), basis: rows.map((x) => x.basis).join(' · ') }; };   // B-360d (A): the idle and live rows together
      const before = tails(), ix0 = M._jsonlPosCensus();
      const session = { backend: 'claude', backendSessionId: sidC, claudeSessionId: sidC, cwd, buffer: JSON.stringify({ uuid: `pcb${k}`, timestamp: T3, type: 'assistant', message: { id: `msg_pcb${k}`, role: 'assistant', content: [{ type: 'text', text: 'live' }] } }) + '\n' };
      new M.SessionMessages(session, null, { buffersDir: path.join(os.homedir(), 'buf'), permissionModes: [] }).raw();   // the merge builds the tail's index
      const after = tails(), ix = M._jsonlPosCensus();
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
    const nNow = nTrue(SS), nRed = nTrue(mutantCopies('a5-census-n', REPO).load('src/session-store.js', editAnchor(ssrcB, UNIX, () => '    if (i >= 0) { v.splice(i, 1); }\n', "src/session-store.js"), 'n-kept'));
    ok(ssrcB.split(UNIX).length === 2 && nNow.n === nNow.held && nNow.held > 0 && nRed.n > nRed.held, `the census's ordinal count across a slide = the ordinals held (${nNow.n} = ${nNow.held}); RED (the unindex never lowers it): ${nRed.n} counted for ${nRed.held} held`, { nNow, nRed });
    ok(ssrcB.split(ROW).length === 2 && c.keys === 2 * NC && c.ords === 2 * NC && c.ixBytes === c.keys * SS.POS_KEY_BYTES + c.ords * SS.POS_ORD_BYTES && c.grew === c.ixBytes && /position indexes/.test(c.basis) && r.keys === 2 * NC && r.grew === 0,
      `a merge over a cached tail of ${NC} records builds its index (${c.keys} keys, ${c.ords} ordinals ≈ ${c.ixBytes} B): the transcript tails' census row grew by exactly that and names it; RED (cadb07780's row): the same index (${r.keys} keys), the row grew ${r.grew} B`, { c, r });
  }
  // ═══ ⑧ (B-360d part 2, 主开发 r1223) THE ANSWER KEPT WHILE ITS INPUTS ARE THE SAME — every attach builds a fresh reader, and its
  // task state walked the reader's whole window again (78–230 ms a time measured) when nothing had changed; the supersede asked
  // every task at every launch. THE ORACLE is the release's own scan, planted back in a copy (its kept answer cut, its
  // supersede walk restored): at every step the two answer the same, and the COUNTS say what was walked.
  console.log('⑧ (B-360d) a re-attach of an unchanged conversation walks nothing; every change rescans; the answers are the release\'s');
  {
    const { anchored } = await import('./scratch.mjs');
    const SRC8 = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8');
    const KEPT_HIT = "      if (was && (was.keptRef ? was.keptRef.deref() : null) === key.kept && was.seq === key.seq && was.n === key.n && was.wStart === key.wStart) { _taskScanCounts.kept++; return copyTaskState(was.answer); }\n";
    const KEPT_SET = "    if (key && this._all) _taskStateMemo.set(this._all, { keptRef: key.kept ? new WeakRef(key.kept) : null, seq: key.seq, n: key.n, wStart: key.wStart, answer: copyTaskState({ tasks, todos }) });\n";
    const SUPERSEDE = "            if (syn.id) for (const k of byTaskId.get(syn.id) || []) { const tk = tasks[k]; if (tk && tk.id === syn.id && tk.status === 'running') tk.status = 'completed'; }\n";
    const REL_SUPERSEDE = "            if (syn.id) for (const tk of Object.values(tasks)) { if (tk.id === syn.id && tk.status === 'running') tk.status = 'completed'; }\n";   // stale-pins: kept (the release's own line, planted back as the oracle's)
    const M8 = mutantCopies('b360d-task-state', REPO);
    const release = M8.load('src/session-store.js', anchored(anchored(anchored(SRC8, KEPT_HIT, '', 'the release: no kept answer'), KEPT_SET, '', 'the release: nothing kept'), SUPERSEDE, REL_SUPERSEDE, 'the release: the supersede asks every task'), 'release-scan');
    const T8 = Date.parse('2026-07-20T00:00:00.000Z');
    let s8 = 0;
    const at = (i) => new Date(T8 + i * 1000).toISOString();
    const line = (o) => JSON.stringify(o);
    const asst = (i, content) => line({ uuid: `a8-${i}`, timestamp: at(i), type: 'assistant', message: { id: `msg_a8_${i}`, role: 'assistant', content } });
    const user = (i, content) => line({ uuid: `u8-${i}`, timestamp: at(i), type: 'user', message: { role: 'user', content } });
    // a window with background commands (some notified), a workflow RESUMED under the same run id (a live-stream system
    // task_started of that run between), an async agent, and the task tools
    const base8 = () => {
      const out = [];
      for (let i = 0; i < 240; i++) {
        if (i % 6 === 0) { out.push(asst(i, [{ type: 'tool_use', id: `tb${i}`, name: 'Bash', input: { command: `make step-${i}`, run_in_background: true } }])); out.push(user(i + 0.5, [{ type: 'tool_result', tool_use_id: `tb${i}`, content: `Command running in background with ID: b${i}. Output is being written to: /tmp/o${i}` }])); }
        else if (i % 24 === 11 && i > 24) out.push(user(i, `<task-notification>\n<task-id>b${i - 23}</task-id>\n<tool-use-id>tb${i - 23}</tool-use-id>\n<status>completed</status>\n<summary>step ${i - 23} done</summary>\n</task-notification>`));
        else if (i === 50) { out.push(asst(i, [{ type: 'tool_use', id: 'tw1', name: 'Workflow', input: { name: 'build' } }])); out.push(user(i + 0.5, [{ type: 'tool_result', tool_use_id: 'tw1', content: 'Workflow launched in background. Run ID: wf_b360d' }])); }
        else if (i === 90) out.push(line({ uuid: 'sys8', timestamp: at(i), type: 'system', subtype: 'task_started', tool_use_id: 'tsys', task_id: 'wf_b360d', task_type: 'local_workflow', description: 'the run again' }));
        else if (i === 130) { out.push(asst(i, [{ type: 'tool_use', id: 'tw2', name: 'Workflow', input: { name: 'build' } }])); out.push(user(i + 0.5, [{ type: 'tool_result', tool_use_id: 'tw2', content: 'Workflow launched in background. Run ID: wf_b360d' }])); }
        else if (i === 70) { out.push(asst(i, [{ type: 'tool_use', id: 'ta1', name: 'Agent', input: { description: 'a helper' } }])); out.push(user(i + 0.5, [{ type: 'tool_result', tool_use_id: 'ta1', content: [{ type: 'text', text: 'Async agent launched successfully. agentId: a8b2c3' }] }])); }
        else if (i === 20) { out.push(asst(i, [{ type: 'tool_use', id: 'tc1', name: 'TaskCreate', input: { subject: 'Ship it', activeForm: 'Shipping it' } }])); out.push(user(i + 0.5, [{ type: 'tool_result', tool_use_id: 'tc1', content: 'Task #1 created successfully: Ship it' }])); }
        else if (i === 200) out.push(asst(i, [{ type: 'tool_use', id: 'tu1', name: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' } }]));
        else out.push(asst(i, [{ type: 'text', text: `note ${i}` }]));
      }
      return out.join('\n') + '\n';
    };
    // ONE conversation through every step on module M: → [{ step, answer, scans, kept }]
    const scenario = async (M) => {
      const k = ++s8, sid8 = `aaaaaaaa-bbbb-cccc-dddd-${String(800000000000 + k)}`, fp8 = path.join(projDir, sid8 + '.jsonl');
      const buf8 = path.join(HOME_FAKE, `buf8-${k}`); fs.mkdirSync(buf8, { recursive: true });
      const meta8 = (startedAt) => fs.writeFileSync(path.join(buf8, 'w8.json'), JSON.stringify({ startedAt }));
      fs.writeFileSync(fp8, base8()); meta8(T8 - 60000);
      const session = { backend: 'claude', backendSessionId: sid8, claudeSessionId: sid8, cwd };
      const C = M._taskScanCounts, steps = [];
      const read = (step) => { const c0 = { ...C }; const st = new M.SessionMessages(session, 'w8', { buffersDir: buf8, permissionModes: [] }).taskState(); steps.push({ step, answer: JSON.stringify(st), scans: C.scans - c0.scans, kept: C.kept - c0.kept }); return st; };
      await M.warmSessionJsonlAsync(sid8, cwd);
      read('the first attach');
      read('a re-attach, nothing changed');
      const mine = read('a re-attach whose caller then changes its copy');
      for (const t of Object.values(mine.tasks)) t.status = 'changed by its caller';
      mine.todos.push({ content: 'pushed by its caller' });
      read('the attach after that caller');
      fs.appendFileSync(fp8, asst(299, [{ type: 'text', text: 'a plain reply, no task tool' }]) + '\n');
      await M.warmSessionJsonlAsync(sid8, cwd);
      read('after an append of a plain record only (the records grow, the task events do not)');
      fs.appendFileSync(fp8, asst(300, [{ type: 'tool_use', id: 'tu2', name: 'TaskUpdate', input: { taskId: '1', status: 'completed' } }]) + '\n' + user(301, '<task-notification>\n<task-id>b228</task-id>\n<tool-use-id>tb228</tool-use-id>\n<status>completed</status>\n</task-notification>') + '\n');
      await M.warmSessionJsonlAsync(sid8, cwd);
      read('after an append (a task completed, a command notified)');
      session.buffer = asst(302, [{ type: 'text', text: 'a live record' }]);
      read('after the live buffer moved');
      meta8(T8 + 10 * 60 * 1000);
      read('after the wrapper restarted (its launches before it are phantoms)');
      M._taskEventCache.delete(sid8);
      await M.warmSessionJsonlAsync(sid8, cwd);
      read('after the kept task events were read again from the start');
      // the kept task events CHANGE while the records stay the same array (the entry replaced: its last completion gone)
      const e0 = M._taskEventCache.get(sid8);
      M._taskEventCache.set(sid8, { ...e0, events: e0.events.filter((ev) => !(ev.kind === 'update' && ev.input && ev.input.status === 'completed')), uuids: new Set(e0.uuids), pending: new Map(e0.pending) });
      read('after the kept task events changed, the records the same');
      return steps;
    };
    const cure = await scenario(SS), rel = await scenario(release);
    const same = cure.length === rel.length && cure.every((s, i) => s.answer === rel[i].answer);
    ok(same && cure.length === 10, `⑧ at every step (${cure.map((s) => s.step).join(' · ')}) the answer is the release's own scan's`, cure.map((s, i) => s.answer === rel[i].answer ? `${s.step}: =` : `${s.step}: ${s.answer.slice(0, 160)} ≠ ${rel[i].answer.slice(0, 160)}`));
    const first = JSON.parse(cure[0].answer);
    ok(first.tasks.tw1 && first.tasks.tw1.status === 'completed' && first.tasks.tw2 && first.tasks.tw2.status === 'running' && (!first.tasks.tsys || first.tasks.tsys.status === 'completed') && Object.keys(first.tasks).length > 30, `⑧ the RESUMED workflow: its first launch completed, the last one running (${Object.keys(first.tasks).length} tasks in the window)`, { tw1: first.tasks.tw1, tw2: first.tasks.tw2, tsys: first.tasks.tsys || null });
    const want = [[1, 0], [0, 1], [0, 1], [0, 1], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]];
    ok(cure.every((s, i) => s.scans === want[i][0] && s.kept === want[i][1]), `⑧ COUNTS — walked / kept per step: ${cure.map((s) => `${s.scans}/${s.kept}`).join(' · ')} (a re-attach of an unchanged conversation walks nothing; a plain append, a task append, the live buffer, the wrapper's restart, the task events read again and the task events changed each rescan)`, cure.map((s) => [s.step, s.scans, s.kept]));
    ok(cure[3].answer === cure[0].answer, '⑧ a caller that changes its copy changes nobody else\'s: the next attach answers the first answer');
    const ts = SS._taskStateCensus(), row = [].concat(SS.jsonlCacheCensus()).pop();   // B-360d (A): two rows (idle, live): the kept answers ride the LIVE row, with the indexes
    ok(ts.answers >= 1 && ts.rows > 0 && ts.bytes === ts.rows * 160 && /kept task-state answers \(\d+, \d+ entries/.test(row.basis), `⑧ the kept answers are in the transcript tails' census row (${ts.answers} kept, ${ts.rows} entries ≈ ${ts.bytes} B): «${row.basis.slice(0, 200)}»`, ts);
    // RED CONTROLS — each a copy of the cure with ONE thing cut
    const R1 = await scenario(M8.load('src/session-store.js', anchored(SRC8, KEPT_HIT, '', 'no kept answer'), 'no-kept-answer'));
    ok(R1[1].scans === 1 && R1[1].kept === 0, `⑧ RED CONTROL no kept answer: the re-attach of the unchanged conversation walks it again (${R1[1].scans} walk)`, R1[1]);
    const R2 = await scenario(M8.load('src/session-store.js', anchored(SRC8, KEPT_HIT, KEPT_HIT.replace(' && was.wStart === key.wStart', ''), 'a key without the wrapper start'), 'no-wrapper-start'));
    ok(R2[7].answer !== rel[7].answer && R2[7].scans === 0, '⑧ RED CONTROL a kept answer that ignores the wrapper\'s start: after the restart its phantom launches still run (the release dropped them)', { red: R2[7].answer.slice(0, 200), release: rel[7].answer.slice(0, 200) });
    const R3 = await scenario(M8.load('src/session-store.js', anchored(SRC8, KEPT_HIT, KEPT_HIT.replace('(was.keptRef ? was.keptRef.deref() : null) === key.kept && was.seq === key.seq && was.n === key.n && ', ''), 'a key without the kept events'), 'no-kept-events'));
    ok(R3[9].scans === 0 && R3[9].answer !== rel[9].answer, '⑧ RED CONTROL a kept answer that ignores the kept task events: after they CHANGED (the records the same) it answers the old state — not the release\'s', { red: R3[9].answer.slice(0, 200), release: rel[9].answer.slice(0, 200) });
    const R5 = await scenario(M8.load('src/session-store.js', anchored(SRC8, KEPT_HIT, KEPT_HIT.replace('return copyTaskState(was.answer);', 'return was.answer;'), 'a kept answer handed out without a copy'), 'no-copy'));
    ok(R5[3].answer !== rel[3].answer, '⑧ RED CONTROL a kept answer handed out without a copy: the caller that changed its answer changed the next attach\'s', { red: R5[3].answer.slice(0, 200), release: rel[3].answer.slice(0, 200) });
    const R4 = await scenario(M8.load('src/session-store.js', anchored(SRC8, SUPERSEDE, SUPERSEDE.replace('byTaskId.get(syn.id) || []', '[]'), 'a supersede that finds nothing'), 'no-supersede'));
    ok(R4[0].answer !== rel[0].answer && JSON.parse(R4[0].answer).tasks.tw1.status === 'running', '⑧ RED CONTROL a supersede that finds nothing: the resumed workflow\'s first launch still runs — not the release\'s answer', JSON.parse(R4[0].answer).tasks.tw1);
  }
  console.log(fail ? `FAILED (${fail})` : `task-scan-loop test passed (${pass})`);
  process.exit(fail ? 1 : 0);
}
