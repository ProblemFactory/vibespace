#!/usr/bin/env node
// test-watch-door — A WATCH THAT CANNOT BE ARMED NEVER ENDS THE HUB AND NEVER ENDS ITS FEATURE (主开发 2026-11-19 01:17Z: the
// production hub ended at 01:14Z — the machine's inotify watches used up by other programs, the hub armed one more for a helper
// conversation's transcript from a retry TIMER, fs.watch threw ENOSPC, nothing caught it).
//   §1 THE DOOR (src/watch-door.js) with stand-in fs modules — no real watch is armed, no real limit touched:
//      a refused watch (ENOSPC) is a bounded poll that still calls the listener; a watcher whose 'error' fires after it was
//      armed is swapped to the poll, never an uncaught 'error'; a listener that throws is caught; the limit is said ONCE
//      (journal + ONE For-you notice in en, its zh / ja rows in the dictionaries) and LIFTED when a watch arms again; close()
//      ends the poll
//   §2 THE CENSUS: no fs.watch of the hub's code outside the door (comments stripped; src/agentd/ is the device agent's own
//      process — its watches sit in a try) — a bare one is red by name; CONTROL: a planted bare watch is caught
//   §3 THE REAL PARSER'S ROAD (src/server/stdout/claude-stream-json.js) through the RETRY TIMER that ended the hub, with a
//      stand-in fs.watch that throws ENOSPC: the hub's road goes on, the helper's records still arrive (the poll), the notice
//      is filed once; CONTROL (in memory, never a file in src/): the release's two lines put back (the bare timer, the bare
//      watch) — the ENOSPC throws OUT of the timer (caught here as an uncaught exception, as it ended the hub)
// Run: node scripts/test-watch-door.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { scratchHome } from './scratch.mjs';
import { stripComments } from './ci.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1200) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, rounds = 60, every = 50) => { for (let i = 0; i < rounds; i++) { if (pred()) return true; await sleep(every); } return pred(); };   // a bounded wait for an EVENT — no verdict on the clock
const WD = require(path.join(REPO, 'src/watch-door.js'));
const enospc = () => { const e = new Error('ENOSPC: System limit for number of file watchers reached'); e.code = 'ENOSPC'; e.errno = -28; return e; };
const todosStub = () => { const T = { adds: [], done: [], items: new Map(), add(key, it) { const id = 'fy-' + (T.adds.length + 1); T.adds.push({ key, ...it }); T.items.set(id, { id, status: 'open' }); return { id }; }, get(id) { return T.items.get(id) || null; }, setStatus(id, st, by) { T.done.push({ id, st, by }); const x = T.items.get(id); if (x) x.status = st; } }; return T; };
const HOME = scratchHome('watch-door');
const TMP = path.join(HOME, 'files'); fs.mkdirSync(TMP, { recursive: true });

console.log('§1 the door — a refused watch is a poll; the limit said once, lifted when a watch arms');
{
  WD.resetForTest();
  const T = todosStub(), said = [];
  WD.configure({ getUserTodos: () => T, log: (l) => said.push(l) });
  const refusing = { ...fs, watch() { throw enospc(); } };
  const f = path.join(TMP, 'a.jsonl'); fs.writeFileSync(f, 'one\n');
  const heard = [];
  const w1 = WD.watch(f, () => heard.push('a'), { fs: refusing });
  const w2 = WD.watch(path.join(TMP, 'b.jsonl'), () => {}, { fs: refusing });
  await sleep(30);
  fs.appendFileSync(f, 'two\n');
  const got = await until(() => heard.length >= 1);
  ok(w1.polled && w2.polled && got && typeof w1.close === 'function' && WD.status().limited === true,
    `a watch the system refuses (ENOSPC) is a bounded POLL standing in — its listener heard the file grow (${heard.length}), nothing thrown`, { st: WD.status(), heard });
  ok(T.adds.length === 1 && T.adds[0].key === WD.NOTICE_KEY && /limit of file watches is reached/.test(T.adds[0].text) && T.adds[0].detail.includes(WD.LIMIT_NAME) && T.adds[0].detail.includes(WD.RAISE_CMD) && said.filter((l) => /limit of file watches is reached/.test(l)).length === 1,
    `two refusals: ONE For-you notice (the limit's name, the one command that raises it) and ONE journal line`, { adds: T.adds.map((a) => a.text), said });
  // an armed watch whose own 'error' fires later: swapped to the poll, never an uncaught 'error'
  let fake = null;
  const arming = { ...fs, watch() { fake = new EventEmitter(); fake.close = () => {}; return fake; } };
  const w3 = WD.watch(f, () => {}, { fs: arming });
  ok(!w3.polled && T.done.length === 1 && T.done[0].st === 'done' && WD.status().limited === false,
    `a watch that ARMS again lifts the limit — the notice resolves itself (${JSON.stringify(T.done)})`);
  let threw = null; try { fake.emit('error', enospc()); } catch (e) { threw = e; }
  ok(!threw && w3.polled && T.adds.length === 2, `an armed watcher's own 'error' (ENOSPC) after it was armed: no throw, the poll stands in, the limit said again (a new episode: ${T.adds.length} notices in all)`, { threw: threw && threw.message });
  // a listener that throws is caught
  const g = path.join(TMP, 'c.jsonl'); fs.writeFileSync(g, 'x\n');
  let calls = 0;
  const w4 = WD.watch(g, () => { calls++; throw new Error('a listener bug'); }, { fs: refusing });
  await sleep(30); fs.appendFileSync(g, 'y\n');
  await until(() => calls >= 1);
  ok(calls >= 1 && said.some((l) => /listener threw/.test(l)), `a listener that throws inside the poll is caught and said once — the poll goes on (${calls} calls)`);
  for (const w of [w1, w2, w3, w4]) w.close();
  ok(WD.status().pollers === 0, `close() ends every poll (${WD.status().pollers} left)`);
  WD.resetForTest();
}

console.log('§2 the census — no fs.watch of the hub\'s code outside the door');
{
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) { if (r !== path.join('src', 'agentd')) walk(r); } else if (/\.(c?js|mjs)$/.test(e.name)) files.push(r); } };
  walk('src'); files.push('server.js');
  const BARE = /\bfs\.watch\s*\(|=\s*fs\.watch\b|\bfs\.promises\.watch\s*\(|\bfsp\.watch\s*\(/;
  const bareIn = (list) => list.filter(([rel, src]) => rel !== path.join('src', 'watch-door.js') && BARE.test(stripComments(src)));
  const tree = files.map((rel) => [rel, fs.readFileSync(path.join(REPO, rel), 'utf8')]);
  const found = bareIn(tree).map(([rel]) => rel);
  ok(files.length > 200 && !found.length, `every file watch of the hub's code goes through src/watch-door.js — ${files.length} files read, ${found.length} bare (src/agentd/ is the device agent's own process)`, found);
  const planted = bareIn([...tree, ['src/server/planted.js', "const w = fs.watch(dir, () => {});"]]).map(([rel]) => rel);
  ok(planted.length === 1 && planted[0] === 'src/server/planted.js', 'CONTROL: a planted bare fs.watch is red by name', planted);
  const sites = ['src/server/stdout/claude-stream-json.js', 'src/workflow-usage-tailer.js', 'src/server/cluster-presets.js', 'src/desktop-serve.js', 'src/opencode-events.js'];
  const through = sites.filter((rel) => /\bWD\.watch\b/.test(fs.readFileSync(path.join(REPO, rel), 'utf8')));
  ok(through.length === sites.length, `the five watch sites of the release read the door (${through.join(', ')})`, sites.filter((s) => !through.includes(s)));
}

console.log('§3 the REAL parser\'s road — the retry timer that ended the hub, with a stand-in fs.watch that throws ENOSPC');
const realWatch = fs.watch;
async function parserRoad(consumer, { control = false } = {}) {
  WD.resetForTest();
  const T = todosStub();
  WD.configure({ getUserTodos: () => T, log: () => {} });
  const oldHome = process.env.HOME; process.env.HOME = HOME;
  const csSrc = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8');
  const engine = { _vsuPending: new Map(), resolveUsageKey: () => '__global__', usageEstimator: { noteLive() {} }, modelsMatch: () => false, servedDefinesModel: () => false, rerouteAnnouncedBy: () => null };
  for (const part of (/const \{([^}]*)\} = engine;/.exec(csSrc) || ['', ''])[1].split(',')) { const name = part.split(':')[0].replace(/\/\/.*$/, '').trim(); if (/^[A-Za-z_$][\w$]*$/.test(name) && !(name in engine)) engine[name] = () => {}; }
  const activeSessions = new Map();
  const { attach } = consumer.create({ activeSessions, engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result', 'control_request', 'control_response', 'control_cancel_request']), _seenStreamTypes: new Set(),
    USAGE_SCANNER_PATH: path.join(HOME, 'none'), checkClaudeGoalStatus() {}, noteModelSeen() {}, sbSeenFirst: () => true, hosts: null, usageHistory: null, pagesRef: { current: null } });
  const N = require(path.join(REPO, 'src/normalizers.js'));
  const { MessageManager } = require(path.join(REPO, 'src/message-manager.js'));
  const bcast = [];
  const helpers = { feedLive: N.feedLive, broadcastToSession: (x, id, m) => bcast.push(m), broadcastActiveSessions() {}, readSessionMeta: () => ({}), writeSessionMeta() {}, updateSessionTodos() {}, applyTaskToolUpdate() {} };
  const id = control ? 'sess-wd-ctl' : 'sess-wd', sid = control ? 'e2e00000-0000-4000-8000-000000000d02' : 'e2e00000-0000-4000-8000-000000000d01', cwd = path.join(HOME, 'proj');
  const s = { mode: 'chat', backend: 'claude', name: 'wd', cwd, host: null, claudeSessionId: sid, backendSessionId: null, sockName: 'cw-' + id, buffer: '', createdAt: Date.now(), _webuiId: id, _taskRecords: {} };
  s._normalizer = new MessageManager(id);
  activeSessions.set(id, s);
  const h = { data: null, onData(cb) { h.data = cb; }, onExit() {} };
  const { cwdToProjectDir } = require(path.join(REPO, 'src/session-store.js'));
  const sub = path.join(HOME, '.claude', 'projects', cwdToProjectDir(cwd), sid, 'subagents'), file = path.join(sub, 'agent-ag1.jsonl');
  const rec = (n) => JSON.stringify({ type: 'assistant', uuid: `wd-${control ? 'c' : 'r'}-${n}`, message: { role: 'assistant', content: [{ type: 'text', text: `helper says ${n}` }] } }) + '\n';
  const uncaught = [];
  const onUncaught = (e) => uncaught.push(e);
  process.on('uncaughtException', onUncaught);
  fs.watch = () => { throw enospc(); };   // THE STAND-IN: the machine's limit reached — no real watch, no real limit touched
  const warn = console.warn; console.warn = () => {};
  const r = {};
  try {
    attach(s, id, h, helpers);
    // the helper starts BEFORE its transcript exists: the parser's RETRY TIMER arms the watch (the road that ended the hub)
    h.data(JSON.stringify({ type: 'system', subtype: 'task_started', task_type: 'local_agent', task_id: 'ag1', tool_use_id: 'tu-wd-1' }) + '\n');
    fs.mkdirSync(sub, { recursive: true }); fs.writeFileSync(file, rec(1));
    const armed = await until(() => { const e = s.subagentWatchers && s.subagentWatchers.get('tu-wd-1'); return !!(e && e.watcher) || uncaught.length > 0; }, 80, 50);   // the timer fires after ~1 s
    r.armed = armed; r.uncaught = uncaught.map((e) => e && e.code);
    const helperMsgs = () => bcast.filter((m) => m && m.type === 'subagent-message' && m.parentToolUseId === 'tu-wd-1').map((m) => m.message && m.message.uuid);
    if (!control) {
      await sleep(30);
      fs.appendFileSync(file, rec(2));
      await until(() => helperMsgs().length >= 2, 80, 50);
    }
    r.helper = helperMsgs();
    r.polled = !!(s.subagentWatchers.get('tu-wd-1') || {}).watcher?.polled;
    r.notices = T.adds.length; r.alive = activeSessions.has(id);
  } finally {
    console.warn = warn; fs.watch = realWatch;
    process.removeListener('uncaughtException', onUncaught);
    activeSessions.delete(id);
    try { for (const w of (s.subagentWatchers || new Map()).values()) { if (w && w.retry) clearTimeout(w.retry); if (w && w.watcher && w.watcher.close) try { w.watcher.close(); } catch { } } } catch { }
    process.env.HOME = oldHome;
    WD.resetForTest();
  }
  return r;
}
{
  const consumer = require(path.join(REPO, 'src/server/stdout/claude-stream-json.js'));
  const a = await parserRoad(consumer);
  ok(a.armed && !a.uncaught.length && a.polled && a.alive, `the helper's transcript watch armed from the retry timer under ENOSPC: NOTHING thrown out of the timer, a poll stands in, the conversation goes on`, a);
  ok(a.helper.length === 2 && a.helper[0] === 'wd-r-1' && a.helper[1] === 'wd-r-2', `the helper's records still ARRIVE — the one there at the start and the one written after (by the poll): ${JSON.stringify(a.helper)}`, a);
  ok(a.notices === 1, `the limit's For-you notice is filed ONCE (${a.notices})`, a);
  // CONTROL — the release's two lines put back, compiled IN MEMORY beside the real file (its requires resolve as the real one's)
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8');
  const ANCHORS = [
    ["        const retry = setTimeout(() => { try { session.subagentWatchers.delete(toolUseId); if (!activeSessions.has(id)) return; startSubagentWatcher(toolUseId, agentId, attempt + 1); } catch (e) { console.warn(`[stream] a helper's transcript watch could not start (${e && e.message}) — caught`); } }, delay);\n",
     "        const retry = setTimeout(() => { session.subagentWatchers.delete(toolUseId); if (!activeSessions.has(id)) return; startSubagentWatcher(toolUseId, agentId, attempt + 1); }, delay);\n"],   // stale-pins: kept — the release's own line, put back by the control
    ["      const watcher = WD.watch(watchFile, () => {", "      const watcher = fs.watch(watchFile, () => {"],   // stale-pins: kept — the release's own line, put back by the control
  ];
  const missing = ANCHORS.filter(([from]) => SRC.split(from).length !== 2).map(([from]) => from.trim().slice(0, 60));
  ok(!missing.length, `the control's anchors are in the source, once each${missing.length ? ' — MISSING: ' + missing.join(' | ') : ''}`);
  let mut = null;
  if (!missing.length) {
    const Module = require('node:module');
    const fake = path.join(REPO, 'src/server/stdout/claude-stream-json.release-mutant.js');
    let src = SRC; for (const [from, to] of ANCHORS) src = src.replace(from, () => to);
    const m = new Module(fake, null); m.filename = fake; m.paths = Module._nodeModulePaths(path.dirname(fake)); m._compile(src, fake);
    mut = m.exports;
  }
  const c = mut ? await parserRoad(mut, { control: true }) : null;
  ok(c && c.uncaught.includes('ENOSPC'), `CONTROL (the release's bare timer and bare watch): the ENOSPC throws OUT of the retry timer — the uncaught exception that ended the hub (${c && JSON.stringify(c.uncaught)})`, c);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
