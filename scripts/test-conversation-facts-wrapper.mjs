#!/usr/bin/env node
// scripts/test-conversation-facts-wrapper.mjs — THE WRAPPER KEEPS THE CONVERSATION'S FACTS (lane conversation-facts, majordomo
// piece 2; 主开发's ruling 2026-11-17, road A). MEASURED FIRST: after a hub restart with no page, 0 of 12 idle chat fixtures
// read known for background tasks, timers and idle age — the hub held them in memory only. The wrapper reads every record
// from its CLI's first line and outlives every restart, so it keeps them (src/conversation-facts.js factsStep, memory only,
// per record) and writes them with the sidecar writes it already makes — never a write per record.
// On the REAL data/bin/chat-wrapper.js over the stand-in CLI (scripts/fixtures/claude-stand-in-cli.cjs — BGSET- / BGEMPTY- /
// WAKE- / BURST-): the sidecar's facts after a plain turn, a background set, an emptied set, a fired wakeup; the writes
// counted over a burst of 2000 records (RED CONTROL: a copy that writes per record); the minute flush under a scaled clock
// (scripts/fixtures/clock-scale.cjs); a failed sidecar write never stops it.
//   C  主开发's condition on treeUsage's synchronous child walk: no single synchronous stretch of conversations.list holds the loop for
//      50 ms at 84 conversations × 15 processes (a stand-in process table), RED at a 60 ms block.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { stopWrapper, scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CF = require(path.join(REPO, 'src/conversation-facts.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const ad = new ClaudeCodeAdapter({ buffersDir: os.tmpdir() });
const WRAPPER = path.join(REPO, 'data/bin/chat-wrapper.js');
const STAND_IN = path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs');
const CLOCK = path.join(REPO, 'scripts/fixtures/clock-scale.cjs');
const ROOT = scratch('conversation-facts-wrapper');
fs.mkdirSync(ROOT, { recursive: true });
const atExit = [];
const cleanup = () => { for (const f of atExit.splice(0)) { try { f(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return true; await sleep(30); } return !!(await f()); };

// ── B · the REAL wrapper ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('B · the REAL data/bin/chat-wrapper.js over the stand-in CLI');
/** A preload that counts the wrapper's sidecar writes (each one is a rename onto the meta file) — test-only. */
const COUNTER = path.join(ROOT, 'count-meta-writes.cjs');
fs.writeFileSync(COUNTER, "'use strict';\nconst fs = require('fs');\nconst meta = process.argv[3], out = process.env.META_WRITES_FILE;\nconst real = fs.renameSync;\nfs.renameSync = function renameSync(a, b) { const r = real.apply(fs, arguments); if (out && b === meta) { try { fs.appendFileSync(out, Date.now() + '\\n'); } catch { } } return r; };\n");
async function boot(label, { wrapper = WRAPPER, clock = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(ROOT, label + '-'));
  const writes = path.join(dir, 'writes.txt');
  const argv = ['-r', COUNTER, ...(clock ? ['-r', CLOCK] : []), wrapper, path.join(dir, 's.buf'), path.join(dir, 's.json'), process.execPath, STAND_IN];
  const w = spawn(process.execPath, argv, { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: dir, META_WRITES_FILE: writes, STAND_IN_LONG_MS: '200', ...(clock ? { CLOCK_SCALE: String(clock) } : {}) } });
  atExit.push(() => { try { w.kill('SIGKILL'); } catch { } });
  const recs = []; let lb = '';
  w.stdout.setEncoding('utf8');
  w.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i); lb = lb.slice(i + 1); try { const r = JSON.parse(l); r.__at = Date.now(); recs.push(r); } catch { } } });
  w.stderr.on('data', () => { });
  let n = 0;
  const h = {
    dir, w, recs,
    say: (text) => w.stdin.write(ad.formatChatInput(text, 'm' + (++n)).stdinPayload + '\n'),
    results: () => recs.filter((r) => r.type === 'result').length,
    meta: () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 's.json'), 'utf8')); } catch { return null; } },
    writes: () => { try { return fs.readFileSync(writes, 'utf8').trim().split('\n').filter(Boolean).map(Number); } catch { return []; } },
    turn: async (text) => { const r0 = h.results(); h.say(text); return until(() => h.results() > r0, 10000); },
    stop: () => stopWrapper(w, { dir }),
  };
  await until(() => h.meta() !== null, 5000);
  return h;
}
{
  const h = await boot('facts');
  const m0 = h.meta();
  ok(m0 && m0.caps && m0.caps.facts === CF.FACTS_VERSION && m0.facts && m0.facts.fromStart === true && m0.facts.bg === null, 'at its start the sidecar advertises caps.facts and holds a tracker read from the CLI\'s first line', m0 && { caps: m0.caps, facts: m0.facts });
  ok(await h.turn('hello'), 'a plain turn answers');
  ok(await until(() => { const f = h.meta()?.facts; return f && Array.isArray(f.bg) && f.bg.length === 0 && f.cli; }, 3000), 'after a plain turn the sidecar says the empty set (the CLI\'s init named a level-publishing version)', h.meta()?.facts);
  const lastRec = h.recs.filter((r) => r.type !== '_stdin_ack').at(-1).__at;
  ok(await until(() => { const f = h.meta()?.facts; return f && Math.abs(f.at - lastRec) < 400; }, 3000), 'the sidecar\'s record time is the turn\'s last record (written with the turn-end write)', { at: h.meta()?.facts?.at, lastRec });
  await h.turn('BGSET- start it');
  ok(await until(() => h.meta()?.facts?.bg?.length === 1 && h.meta().facts.bg[0].description === 'a dev server', 3000), 'a background set: the sidecar holds it (id, type, description)', h.meta()?.facts);
  await h.turn('BGEMPTY- it ended');
  ok(await until(() => Array.isArray(h.meta()?.facts?.bg) && h.meta().facts.bg.length === 0, 3000), 'the set went empty: the sidecar says so', h.meta()?.facts);
  ok(h.meta()?.facts?.timer === false, 'no timer seen yet');
  await h.turn('WAKE- a fired loop wakeup');
  ok(await until(() => h.meta()?.facts?.timer === true, 3000), 'a fired wakeup: the one-way mark is in the sidecar', h.meta()?.facts);
  const back = CF.trackedFacts(CF.factsFromSidecar(h.meta().facts), { keeps: { background: true, timers: true, lastRecordAt: true }, turn: 'idle' });
  ok(Array.isArray(back.background) && back.timersWhy === CF.WHY.timerSet && Number.isFinite(back.idleSince), 'what a restarted hub reads from this sidecar: the set known, timers «it set a CLI timer», an idle age', back);
  await h.stop();
}
{
  // THE STAMP COSTS NOTHING PER RECORD: the writes over a burst of 2000 records
  const burst = async (h) => { await h.turn('hello'); await sleep(900); const w0 = h.writes().length; const ok1 = await h.turn('BURST- go'); await sleep(900); return { ok: ok1, writes: h.writes().length - w0, records: h.recs.filter((r) => r.type === 'assistant').length }; };
  const h = await boot('burst');
  const b = await burst(h);
  ok(b.ok && b.records >= 2000 && b.writes >= 1 && b.writes <= 4, `a turn of 2000 records costs ${b.writes} sidecar write(s) — the turn's own (≤ 4), never one per record`, b);
  await h.stop();
  // RED CONTROL: a copy whose step writes per record
  const MUT = mutantCopies('conversation-facts-wrapper', REPO);
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const NEEDLE = '  if (changed) { scheduleMeta(); return; }';
  ok(src.split(NEEDLE).length === 2, 'the wrapper\'s write rule is in it once (the mutation anchor)');
  const red = MUT.write('data/bin/chat-wrapper.js', src.replace(NEEDLE, '  persistMeta(); return;'), 'write-per-record');
  const hr = await boot('burst-red', { wrapper: red });
  const br = await burst(hr);
  ok(br.ok && br.writes >= 1000, `CONTROL a wrapper that writes per record: ${br.writes} writes over the same burst — the leg above would be red`, br);
  await hr.stop();
}
{
  // the record time rides the next write — or, when nothing wrote for a minute, ONE write then (a scaled clock: 1 min = 1 s)
  const h = await boot('flush', { clock: 60 });
  await h.turn('hello');
  await sleep(1600);   // the turn's writes and its scaled minute's flush have run
  const w0 = h.writes().length;
  const t = await h.turn('BGSET- once'); // one change write (debounced with the turn's own: 500 ms, under a second — not scaled)
  await sleep(800);
  const w1 = h.writes().length;
  await sleep(2600);   // two scaled minutes with no record: at most one flush, then nothing (the flush re-arms only on a record)
  const w2 = h.writes().length;
  ok(t && w1 - w0 >= 1 && w2 - w1 <= 1, `after a turn, the minute flush writes at most once (${w2 - w1}) and then nothing while no record comes`, { w0, w1, w2 });
  const lastRec = h.recs.filter((r) => r.type !== '_stdin_ack').at(-1).__at;
  ok(Math.abs((h.meta()?.facts?.at || 0) - lastRec) < 400, 'the sidecar ends on the last record\'s time', { at: h.meta()?.facts?.at, lastRec });
  await h.stop();
}
{
  // a failed sidecar write never stops the wrapper
  const h = await boot('rofs');
  await h.turn('hello');
  await sleep(700);
  fs.chmodSync(h.dir, 0o555);
  const answered = await h.turn('BGSET- while the folder refuses writes');
  await sleep(800);
  const alive = h.w.exitCode === null && h.w.signalCode === null;
  const answered2 = await h.turn('hello again');
  fs.chmodSync(h.dir, 0o755);
  ok(answered && answered2 && alive, 'with its sidecar folder refusing writes, the wrapper keeps answering turns (a failed write is caught)', { answered, answered2, alive });
  await h.stop();
}

// ── C · THE LIST'S LONGEST SYNCHRONOUS STRETCH (moved here from the fast suite: a fast suite holds no wall-clock bound) ──
console.log('C · the list\'s longest synchronous stretch over a stand-in process table');
const COL = require(path.join(REPO, 'src/server/conversation-facts.js'));
const KEEPS = { sidecarFacts: { background: true, timers: true, lastRecordAt: true } };
const KEY_A0 = 'claude:e2e00000-0000-4000-8000-0000000000a1', KEY_B = 'claude:e2e00000-0000-4000-8000-0000000000b2', KEY_T = 'claude:e2e00000-0000-4000-8000-0000000000c3';
function fakeChat(name, step = []) { const st = CF.factsFresh(); for (const [rec, at] of step) CF.factsStep(st, rec, at); return { backend: 'claude', mode: 'chat', name, cwd: '/tmp', _convFacts: st }; }
const known = { capsOf: () => KEEPS, turnOf: () => 'idle', turnKnown: (s) => s.mode === 'chat', heldOf: () => 0, asksOf: () => [], goalOf: () => 'none', continueOf: () => ({ armed: false }),
  jobsOf: () => ({ running: 0, schedules: 0, nextFireAt: null, items: [] }), waitingOf: () => ({ notices: 0 }), handoverOf: () => false, browserOf: () => null,
  desktopOf: () => ({ desktop: { id: 'd1', name: 'Main' }, window: true }), desktops: () => [{ id: 'd1', name: 'Main' }], machineMem: async () => ({ memTotal: 64e9, memAvailable: 20e9 }), memOf: async () => 2e9 };
{
  // THE CHILD WALK (主开发 2026-11-17 (b)): treeUsage still reads the process table synchronously — accepted while NO single
  // synchronous stretch of the list holds the loop for 50 ms, at 84 conversations with trees of fifteen processes (a stand-in table)
  const { monitorEventLoopDelay } = await import('node:perf_hooks');
  const BF = require(path.join(REPO, 'src/browser-facts.js')), CI = require(path.join(REPO, 'src/cli-identity.js'));
  const FAKE = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cfx-proc-'));
  fs.mkdirSync(path.join(FAKE, 'self'));
  const selfStat = fs.readFileSync('/proc/self/stat', 'utf8'), selfStatus = fs.readFileSync('/proc/self/status', 'utf8');
  let selfSmaps = ''; try { selfSmaps = fs.readFileSync('/proc/self/smaps_rollup', 'utf8'); } catch { }
  const put = (pid, kids) => {
    const d = path.join(FAKE, String(pid)); fs.mkdirSync(path.join(d, 'task', String(pid)), { recursive: true });
    fs.writeFileSync(path.join(d, 'task', String(pid), 'children'), kids.join(' ') + (kids.length ? ' ' : ''));
    fs.writeFileSync(path.join(d, 'stat'), selfStat.replace(/^\d+/, String(pid))); fs.writeFileSync(path.join(d, 'status'), selfStatus);
    fs.writeFileSync(path.join(d, 'smaps_rollup'), selfSmaps); fs.writeFileSync(path.join(d, 'cmdline'), 'node\0stand-in\0');
  };
  const sessions = new Map(), keys = new Map();
  for (let t = 0; t < 84; t++) {
    const r0 = 200000 + t * 100;   // root → 2 children → 6 grandchildren each = 15 processes
    put(r0, [r0 + 1, r0 + 2]); put(r0 + 1, [3, 4, 5, 6, 7, 8].map((k) => r0 + k)); put(r0 + 2, [9, 10, 11, 12, 13, 14].map((k) => r0 + k));
    for (let k = 3; k <= 14; k++) put(r0 + k, []);
    const s = { ...fakeChat('T' + t), _childPid: r0 }; sessions.set('sess-' + t, s); keys.set(s, 'claude:e2e00000-0000-4000-8000-' + String(t).padStart(12, '0'));
  }
  const tree = (block = null) => (pid) => BF.treeUsage(pid, { readChildren: (p) => { if (block && p === block) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60); return CI.readChildPids(p, { procRoot: FAKE }); }, procRoot: FAKE });
  const longest = async (treeUsage) => {
    const S = COL.sourcesFrom({ treeUsage });
    const h = monitorEventLoopDelay({ resolution: 1 }); h.enable();
    const r = await COL.create({ activeSessions: sessions, keyOf: (s) => keys.get(s), ...known, memOf: S.memOf, passMs: 60000 }).list();
    await sleep(5); h.disable();
    return { ms: Math.round(h.max / 1e5) / 10, known: r.conversations.filter((c) => Number.isFinite(c.memBytes)).length, pids: 0, pass: r.pass.ms };
  };
  const m1 = await longest(tree());
  ok(m1.known === 84 && m1.ms < 50, `84 conversations × 15 processes: every tree measured, and the longest synchronous stretch of the list is ${m1.ms} ms (< 50; the pass took ${m1.pass} ms)`, m1);
  const m2 = await longest(tree(200500));
  ok(m2.ms >= 50, `CONTROL a tree whose walk blocks 60 ms in one stretch: the same instrument reads ${m2.ms} ms — the leg above would be red`, m2);
  fs.rmSync(FAKE, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
