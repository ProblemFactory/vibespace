#!/usr/bin/env node
// test-watch-door — A WATCH THAT CANNOT BE ARMED NEVER ENDS THE HUB AND NEVER ENDS ITS FEATURE (主开发 2026-11-19 01:17Z: the
// production hub ended at 01:14Z — the machine's inotify watches used up by other programs, the hub armed one more for a helper
// conversation's transcript from a retry TIMER, fs.watch threw ENOSPC, nothing caught it).
//   §1 THE DOOR (src/watch-door.js) with stand-in fs modules — no real watch is armed, no real limit touched (主开发 01:30Z: the
//      notice never flaps — lifted only after 3 arms in a row and 10 quiet minutes, at most one item an hour, CONTROL the hotfix's
//      rule flaps; the pollers bounded — at most 4 file calls in flight across all, counted by the stand-in, CONTROL unbounded):
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
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();   // THE ONE assertion helper (scripts/lib/check.mjs): the condition first, a boolean
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, rounds = 60, every = 50) => { for (let i = 0; i < rounds; i++) { if (pred()) return true; await sleep(every); } return pred(); };   // a bounded wait for an EVENT — no verdict on the clock
const WD = require(path.join(REPO, 'src/watch-door.js'));
const enospc = () => { const e = new Error('ENOSPC: System limit for number of file watchers reached'); e.code = 'ENOSPC'; e.errno = -28; return e; };
const todosStub = () => { const T = { adds: [], done: [], items: new Map(), add(key, it) { const id = 'fy-' + (T.adds.length + 1); T.adds.push({ key, ...it }); T.items.set(id, { id, status: 'open' }); return { id }; }, get(id) { return T.items.get(id) || null; }, setStatus(id, st, by) { T.done.push({ id, st, by }); const x = T.items.get(id); if (x) x.status = st; } }; return T; };
const HOME = scratchHome('watch-door');
const TMP = path.join(HOME, 'files'); fs.mkdirSync(TMP, { recursive: true });

console.log('§1 the door — a refused watch is a poll; the limit said once, never flapping; the pollers bounded');
{
  WD.resetForTest();
  let T0 = 1e12; const clock = () => T0;
  const T = todosStub(), said = [];
  WD.configure({ getUserTodos: () => T, log: (l) => said.push(l), clock, container: false, limitNow: () => 65536 });
  const refusing = { ...fs, watch() { throw enospc(); } };
  const f = path.join(TMP, 'a.jsonl'); fs.writeFileSync(f, 'one\n');
  const heard = [];
  const w1 = WD.watch(f, () => heard.push('a'), { fs: refusing });
  const w2 = WD.watch(path.join(TMP, 'b.jsonl'), () => {}, { fs: refusing });
  await w1.ready;   // the poll's baseline taken — a FACT, never a sleep (its readers' 6)
  fs.appendFileSync(f, 'two\n');
  const got = await until(() => heard.length >= 1);
  ok(w1.polled && w2.polled && got && typeof w1.close === 'function' && WD.status().limited === true,
    `a watch the system refuses (ENOSPC) is a bounded POLL standing in — its listener heard the file grow (${heard.length}), nothing thrown`, { st: WD.status(), heard });
  ok(T.adds.length === 1 && T.adds[0].key === WD.NOTICE_KEY && /limit of file watches is reached/.test(T.adds[0].text) && T.adds[0].detail.includes(WD.LIMIT_NAME) && T.adds[0].detail.includes(WD.raiseCmd(65536)) && WD.raiseCmd(65536).endsWith('=524288') && said.filter((l) => /limit of file watches is reached \(/.test(l)).length === 1,
    `two refusals: ONE For-you notice (the limit's name, the one command that raises it) and ONE journal line`, { adds: T.adds.map((a) => a.text), said });
  { // (its readers' 4) THE WORDS SAY ONLY WHAT IS TRUE: no claim of who holds the watches; every few seconds at most; a container's limit is its host's
    const host = WD.noticeItem({ container: false, current: 65536 }), pod = WD.noticeItem({ container: true, current: 65536 });
    ok(!/other program/i.test(host.detail + pod.detail) && /every few seconds at most/.test(host.detail) && host.detail.includes(WD.raiseCmd(65536)) && !/sysctl/.test(pod.detail) && /in a container: the limit belongs to its host and is raised there/.test(pod.detail) && pod.detail.includes(WD.LIMIT_NAME),
      'the words: no claim about who holds the watches, «every few seconds at most»; the command offered on a machine, NEVER in a container (its host raises it)', { host: host.detail, pod: pod.detail }); }
  { // (主开发 01:57Z, its reader's S2) THE COMMAND NEVER LOWERS THE LIMIT: double the machine's current value, never under 524 288
    const big = WD.noticeItem({ container: false, current: 1048576 }), unread = WD.noticeItem({ container: false, current: null });
    const FIXED = 'fs.inotify.max_user_watches=524288';
    ok(big.detail.includes('fs.inotify.max_user_watches=2097152') && !big.detail.includes(FIXED) && unread.detail.includes(FIXED) && WD.raiseCmd(300000).endsWith('=600000'),
      `a machine at 1 048 576 (this owner's since today) is offered ${WD.raiseCmd(1048576).split(' ').pop()} — never the fixed 524 288 that would halve it; an unread limit falls back to 524 288`, { big: big.detail, unread: unread.detail });
    // CONTROL (in memory, never a file in src/): the hotfix's fixed number put back into the door — the same machine is offered 524 288
    const DSRC = fs.readFileSync(path.join(REPO, 'src/watch-door.js'), 'utf8'), RC = "const raiseCmd = (current) => `sudo sysctl -w ${LIMIT_NAME}=${Math.max(524288, 2 * (Number(current) > 0 ? Math.floor(Number(current)) : 0))}`;";
    if (DSRC.split(RC).length !== 2) ok(false, 'the anchor of the control «the fixed command» is not in src/watch-door.js (once)');
    else {
      const Module = require('node:module'), fake = path.join(REPO, 'src/watch-door.fixed-mutant.js'), m = new Module(fake, null);
      m.filename = fake; m.paths = Module._nodeModulePaths(path.dirname(fake)); m._compile(DSRC.replace(RC, () => 'const raiseCmd = () => `sudo sysctl -w ${LIMIT_NAME}=524288`;'), fake);
      const mb = m.exports.noticeItem({ container: false, current: 1048576 });
      ok(mb.detail.includes(FIXED) && !mb.detail.includes('=2097152'), 'CONTROL (the hotfix\'s fixed number put back): a machine at 1 048 576 is offered 524 288 — the leg above is red on it', mb.detail);
    }
  }
  // (主开发 01:30Z, 1) THE NOTICE NEVER FLAPS: at the limit's edge watches arm and are refused in turn
  let fake = null;
  const arming = { ...fs, watch() { fake = new EventEmitter(); fake.close = () => {}; return fake; } };
  const flap = (n) => { const ws = []; for (let i = 0; i < n; i++) { ws.push(WD.watch(f, () => {}, { fs: arming })); ws.push(WD.watch(f, () => {}, { fs: refusing })); } return ws; };
  const fw = flap(10);
  ok(T.adds.length === 1 && !T.done.length && WD.status().limited, `ten armed-then-refused turns at the limit's edge: still ONE item, never lifted (${T.adds.length} filed, ${T.done.length} lifted)`, WD.status());
  // the lift: LIMITS.liftArms armed IN A ROW and LIMITS.liftQuietMs since the last refusal
  const ws3 = [WD.watch(f, () => {}, { fs: arming }), WD.watch(f, () => {}, { fs: arming }), WD.watch(f, () => {}, { fs: arming })];
  const notYet = WD.status().limited;
  T0 += WD.LIMITS.liftQuietMs;
  const w3 = WD.watch(f, () => {}, { fs: arming });
  ok(notYet && !WD.status().limited && T.done.length === 1 && T.done[0].st === 'done', `three arms in a row are not enough inside the quiet time (still limited: ${notYet}); armed again after ${WD.LIMITS.liftQuietMs / 60e3} quiet minutes, the notice resolves itself`, { done: T.done, st: WD.status() });
  // at most ONE item an hour: a refusal right after the lift is said, not filed; filed once the hour has passed
  T0 += 60e3;
  const w5 = WD.watch(f, () => {}, { fs: refusing });
  const heldBack = T.adds.length === 1 && WD.status().filesDue && said.some((l) => /filed again once the hour has passed/.test(l));
  T0 += WD.LIMITS.fileGapMs;
  const w6 = WD.watch(f, () => {}, { fs: refusing });
  ok(heldBack && T.adds.length === 2, `a refusal a minute after the lift is said in the journal and NOT filed (at most one item an hour); after the hour, filed (${T.adds.length} in all)`, WD.status());
  let threw = null; try { fake.emit('error', enospc()); } catch (e) { threw = e; }
  ok(!threw && w3.polled, `an armed watcher's own 'error' (ENOSPC) after it was armed: no throw, the poll stands in`, { threw: threw && threw.message });
  // a listener that throws is caught
  const g = path.join(TMP, 'c.jsonl'); fs.writeFileSync(g, 'x\n');
  let calls = 0;
  const w4 = WD.watch(g, () => { calls++; throw new Error('a listener bug'); }, { fs: refusing });
  await w4.ready; fs.appendFileSync(g, 'y\n');
  await until(() => calls >= 1);
  ok(calls >= 1 && said.some((l) => /listener threw/.test(l)), `a listener that throws inside the poll is caught and said once — the poll goes on (${calls} calls)`);
  for (const w of [w1, w2, w3, w4, w5, w6, ...fw, ...ws3]) w.close();
  ok(WD.status().pollers === 0, `close() ends every poll (${WD.status().pollers} left)`);
  { // (its readers' 5) A LIMIT MET BEFORE THE STORE, AND A FILING THAT FAILED, ARE FILED LATER — never lost
    WD.resetForTest();
    const early = WD.watch(f, () => {}, { fs: refusing });   // no store yet
    const T3 = todosStub(); WD.configure({ getUserTodos: () => T3, log: () => {}, clock, container: false });
    const filedAtConfigure = T3.adds.length;
    WD.resetForTest();
    let fails = 1; const T4 = todosStub(); const add0 = T4.add; T4.add = (k, it) => { if (fails-- > 0) throw new Error('the store is busy'); return add0(k, it); };
    WD.configure({ getUserTodos: () => T4, log: () => {}, clock, container: false });
    const a1 = WD.watch(f, () => {}, { fs: refusing }), afterFail = T4.adds.length, due = WD.status().filesDue;
    const a2 = WD.watch(f, () => {}, { fs: refusing });
    ok(filedAtConfigure === 1 && afterFail === 0 && due && T4.adds.length === 1, `a limit met before the For-you store files its notice when the store arrives (${filedAtConfigure}); a filing that threw is marked due and filed at the next refusal (${T4.adds.length})`, { filedAtConfigure, afterFail, due });
    for (const w of [early, a1, a2]) w.close();
  }
  // CONTROL of the flap: the hotfix's rule (lift at the first arm, file at every refusal) — the same ten turns file ten items
  WD.resetForTest();
  const T2 = todosStub(); WD.configure({ getUserTodos: () => T2, log: () => {}, clock, container: false });
  Object.assign(WD.LIMITS, { liftArms: 1, liftQuietMs: 0, fileGapMs: 0 });
  WD.watch(f, () => {}, { fs: refusing }).close();
  for (const w of flap(10)) w.close();
  ok(T2.adds.length >= 10, `CONTROL (the hotfix's rule: lifted at the first arm, filed at every refusal): the same turns FLAP — ${T2.adds.length} items filed`, T2.adds.length);
  WD.resetForTest();
}
{ // (主开发 01:30Z, 2) THE POLLERS ARE BOUNDED — the stand-in's OWN count of file calls in flight, never the door's word
  const run = async (limits) => {
    WD.resetForTest(); WD.configure({ log: () => {} });
    if (limits) Object.assign(WD.LIMITS, limits);
    let cur = 0, peak = 0, calls = 0;
    const slow = { ...fs, watch() { throw enospc(); }, promises: { stat: async () => { cur++; calls++; if (cur > peak) peak = cur; await sleep(4); cur--; return { isDirectory: () => false, size: 1, mtimeMs: 1 }; }, readdir: async () => [] } };
    const ws = []; for (let i = 0; i < 120; i++) ws.push(WD.watch(path.join(TMP, `p${i}`), () => {}, { fs: slow }));
    await Promise.all(ws.map((w) => w.ready));   // every poll's baseline taken — a fact
    const r = { peak, calls, pollers: WD.status().pollers, cadence: WD.cadenceFor(WD.status().pollers), slowest: Math.min(...ws.map((w) => w.cadenceMs)) };
    for (const w of ws) w.close();
    WD.resetForTest();
    return r;
  };
  const b = await run(null), c = await run({ inflight: 1e9, running: 1e9 });
  ok(b.calls >= 120 && b.peak <= WD.LIMITS.inflight && b.pollers === 120 && b.cadence > WD.ACTIVE_MS && b.slowest >= b.cadence,
    `120 refused watches: every poll read its file (${b.calls} calls) with at most ${b.peak} in flight at once (the bound ${WD.LIMITS.inflight}, counted by the stand-in itself); every poll's own cadence (its seam) is at least the slowed ${b.cadence} ms (the least: ${b.slowest} ms)`, b);
  ok(c.peak > WD.LIMITS.inflight, `CONTROL (the bounds lifted): the same 120 polls put ${c.peak} file calls in flight at once — the count can see an unbounded pool`, c);
}

console.log('§2 the census — no fs.watch of the hub\'s code outside the door');
{
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) { if (r !== path.join('src', 'agentd')) walk(r); } else if (/\.(c?js|mjs)$/.test(e.name)) files.push(r); } };
  walk('src'); files.push('server.js');
  // (its readers' 6) the census also sees fs.watchFile, a watch required inline, and a destructured watch
  const BARE = /\bfs\.watch(File)?\s*\(|=\s*fs\.watch(File)?\b|\bfs\.promises\.watch\s*\(|\bfsp\.watch\s*\(|require\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)\.watch(File)?\b|\{[^}]*\bwatch(File)?\b[^}]*\}\s*=\s*(?:require\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)|fs\b|fsp\b)/;
  // EXEMPT BY NAME (主开发 01:35Z / 01:40Z — the device agent's SIGNED bundle stays byte for byte in a hub hotfix): src/desktop-serve.js
  // and src/opencode-events.js ride that bundle (each watch in a try WITH its error listener — neither can end the hub; the lane's
  // caller src/opencode-serve.js rides it too, so no hub-only file can hand the door in), beside the device agent's own src/agentd/
  const SHARED = ['src/desktop-serve.js', 'src/opencode-events.js'];
  const EXEMPT = new Set([path.join('src', 'watch-door.js'), ...SHARED.map((r) => path.join(...r.split('/')))]);
  const bareIn = (list) => list.filter(([rel, src]) => !EXEMPT.has(rel) && BARE.test(stripComments(src)));
  const tree = files.map((rel) => [rel, fs.readFileSync(path.join(REPO, rel), 'utf8')]);
  const found = bareIn(tree).map(([rel]) => rel);
  ok(files.length > 200 && !found.length, `every file watch of the hub's code goes through src/watch-door.js — ${files.length} files read, ${found.length} bare (src/agentd/ is the device agent's own process)`, found);
  const PLANTS = ["const w = fs.watch(dir, () => {});", "fs.watchFile(f, () => {});", "const w = require('fs').watch(dir);", "const { watch } = require('node:fs'); watch(dir);", "const { readFileSync, watch } = fs;"];
  const planted = PLANTS.map((src, i) => bareIn([[`src/server/planted-${i}.js`, src]]).length);
  ok(planted.every((n) => n === 1), `CONTROL: each planted bare watch is red by name (a call, watchFile, an inline require, two destructurings): ${planted.join(' ')}`, planted);
  { // the release's object (§75: guarded — a depth-1 checkout has no e3754d9cd; the leg then says SKIP by name)
    let rel = null; try { rel = Object.fromEntries(SHARED.map((r) => [r, require('node:child_process').execFileSync('git', ['-C', REPO, 'show', `e3754d9cd:${r}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })])); } catch { rel = null; }
    const errOn = SHARED.filter((r) => /\.on\??\.?\(\s*'error'/.test(fs.readFileSync(path.join(REPO, r), 'utf8')));
    if (!rel) console.log(`  ⊘ SKIP the device agent's bundle files against the release — no git object of e3754d9cd in this checkout (a depth-1 clone)`);
    else { const same = SHARED.filter((r) => rel[r] === fs.readFileSync(path.join(REPO, r), 'utf8'));
      ok(same.length === SHARED.length && errOn.length === SHARED.length, `the device agent's bundle files are the release's byte for byte (${same.join(', ')}) — no new signature for a hub hotfix — and each keeps its watch's error listener`, { same, errOn }); } }
  const sites = ['src/server/stdout/claude-stream-json.js', 'src/workflow-usage-tailer.js', 'src/server/cluster-presets.js'];
  const through = sites.filter((rel) => /\bWD\.watch\b/.test(fs.readFileSync(path.join(REPO, rel), 'utf8')));
  ok(through.length === sites.length, `the three hub-only watch sites of the release read the door (${through.join(', ')}); desktop-serve.js and opencode-events.js exempt by name (the device agent's bundle)`, sites.filter((s) => !through.includes(s)));
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
  ok(!!c && c.uncaught.includes('ENOSPC'), `CONTROL (the release's bare timer and bare watch): the ENOSPC throws OUT of the retry timer — the uncaught exception that ended the hub (${c && JSON.stringify(c.uncaught)})`, c);
}

report();
