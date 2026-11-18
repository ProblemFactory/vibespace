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
//  ⑤ the two HTTP roads (status, GET /api/session-todos) await the warm before they answer
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
  console.log('⑤ the HTTP roads await the warm before they answer');
  const ts = fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8');
  const body = (name) => { const i = ts.indexOf(`async function ${name}(ref)`); return i < 0 ? '' : ts.slice(i, ts.indexOf('\n  }\n', i)); };
  const warmedFirst = (b) => b.includes('await warmOf(r, ') && b.indexOf('await warmOf(r, ') < b.indexOf('createSessionMessages(');
  ok(warmedFirst(body('status')) && warmedFirst(body('taskState')) && /harnessOf\(r\.backend \|\| 'claude'\)\.store\?\.warmTranscript/.test(ts.slice(ts.indexOf('async function warmOf'))),
    'transcript-service status() and taskState() (GET /api/session-todos, the device ops) await the descriptor\'s warm before the reader answers');
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
  console.log(fail ? `FAILED (${fail})` : `task-scan-loop test passed (${pass})`);
  process.exit(fail ? 1 : 0);
}
