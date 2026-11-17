#!/usr/bin/env node
// LANE KEEPER-SWEEP-YIELDS (a fleet incident, 2026-11-16): one conversation held 437 ephemeral CHILD browser records; when it
// went away the keeper's reconcile retired them all in ONE loop turn (a Promise.all over retireEphemeral), about a second per
// record on the main thread — the liveness probe killed the hub six times before the list was done. Measured here
// (chrome-157/ksy/measure-retire.mjs over a scratch registry): a record whose daemon is already gone was still asked to
// `close --all` by the browser CLI — ONE child start per record, and a start forks the whole hub (the witness's
// «pipe_read in read»: the main thread waiting for the child to reach its exec).
//   ① L1 THE SWEEP NEVER HOLDS THE LOOP: 300 orphan records (and 50: the master's hold grows with the count), a stall PLACED
//      in each record's removal (Atomics.wait — the thread sleeps, nothing spins): the records retired within ONE loop turn
//      are counted (a setImmediate ticker numbers the turns) — one per turn, at boot and on the tick; the lateness of a
//      5 ms timer is printed as evidence (a fast suite asserts no wall-clock bound: test-ci-gate §2e). MUTANT: the yield
//      removed ⇒ every record in one turn, RED.
//   ② L2 NO CHILD START FOR A GONE DAEMON: 300 records left `ready` whose daemon is gone — the browser CLI's starts are
//      counted through the runtime's own execFile seam: none (the record is marked stopped by the tick's own act, its left
//      browser reaped by identity), every record removed. CONTROL: a record whose daemon RUNS (a process of this test, its
//      start time recorded) is still closed by the CLI — one start — and ended. MUTANT: the gone-daemon judgment removed ⇒
//      one start per record, RED.
//   ③ L4 PROGRESS PERSISTS: the registry file on disk loses a PIECE per write (F5); a keeper booted over a copy taken at a
//      write mid-walk (a restart there) retires exactly the records that were left.
//   ⑦ F4 THE WHOLE TURN THE CONVERSATION ENDS IN: a conversation with N leases, N child handles and N records ends at run time
//      (the tick, past the grace): the one turn that drops its leases and reaps its handles is COUNTED — in-memory acts only
//      (0 registry writes, 0 broadcasts, 0 child starts in it) — then its records retire one per turn.
//   ⑧ F5 ONE REGISTRY WRITE AND ONE BROADCAST PER PIECE OF THE WALK: the writes and the broadcasts (each counted: the rename
//      onto the registry file, the keeper's own broadcast) are bounded by the PIECES THE WALK SPANNED in this run (its own span
//      over the keeper's SWEEP_PIECE_MS — a slower machine spans more pieces, never fewer) and stay below the removals. MUTANT:
//      the batching dropped ⇒ one per record, RED on any machine. K1: an orderly STOP mid-walk (shutdown) writes what memory
//      holds — the records the walk removed and had not yet written.
//   ⑤ F1 A CLAIMED LAW HAS A LEG: among 20 orphans, one whose lease comes back before its step is KEPT — its browser record
//      untouched (nothing of it stopped), no CLI start — and the other 19 go.
//   ⑥ F2 NOTHING OF A CARRIED CONVERSATION IS ENDED BY THE SWEEP: a stall PLACED in the reap's window (its scan by launch
//      mark, held open); the conversation resumes there (its lease back, its browser started again — a process of this
//      test); after the reap the retire reads the lease again: kept, its browser left running, no CLI start. MUTANT: the
//      re-read removed ⇒ the browser the conversation just started is closed, RED.
//   F3 THE FIELD'S SHAPE (in ②): 30 records left `ready` with a scratch DIRECTORY and a launch MARK each — each pays the
//      reap's own road (the directory's lock read, the /proc walk by mark, counted) — still no child start, one per turn.
//   ⑨ FOR A RETIRE, «GONE» IS A FACT THE KEEPER HAS SEEN: a recorded pid that is not there, or is another process now by its
//      start time. A LIVE daemon whose fact is missing — no pid recorded, or a pid with no recorded start time — cannot be told
//      gone, so the retire closes it by the CLI as before (1 start, the daemon ended); without the law it would be skipped and
//      left running, a browser nobody ends. MUTANT: the tick's wider judgment (an absent fact read as «gone») ⇒ no close, RED.
//   ⑩ THE RETIRE'S CONTRACT (the 2.369.406 union's red, test-browser-mediation-chrome ⑧b): a record its conversation still holds
//      is KEPT by a retire — the record AND its browser (F2: nothing of a carried conversation is ended; on 2.369.405 the browser
//      was stopped first) — and the product's own road, a detach and then the retire, ends it (1 CLI close, the daemon ended).
//   ④ L3's lifecycle, pinned: a sub-agent's child handle — and its record — lives exactly as long as its parent conversation
//      is carried (newChild; reconcile §3.7); only a job's handle is dropped earlier (dropChild). The pile is the parent's.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const B = require('../src/browser-profiles.js');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sweep-yields-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ } });
const PARENT = 'bk-0000a1a1';
const STALL_MS = 1;   // the stall PLACED in each record's removal (the per-record work the field paid on the main thread)
const stall = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// a stand-in browser CLI on PATH — answers --version; every other call goes through the runtime's execFile seam below
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
fs.writeFileSync(path.join(BIN, 'agent-browser'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "agent-browser 0.38.1"; exit 0; fi\necho \'{"success":true,"data":{}}\'\nexit 0\n', { mode: 0o755 });
const kenv = { PATH: `${BIN}:/usr/bin:/bin`, HOME: ROOT };

/** A scratch registry: N orphan ephemeral CHILD records of one parent key (the field's shape), each with its browser record —
 *  `stopped` (idled out), or `ready` with a daemon that is gone (`pid` names no process). → its dataDir. */
let dirN = 0;
function registry(N, { live = false, extra = [], dirMark = false } = {}) {
  const dataDir = path.join(ROOT, 'd' + (++dirN)); fs.mkdirSync(dataDir, { recursive: true });
  const profiles = [], browsers = {};
  for (let i = 1; i <= N; i++) {
    const id = 'bp-' + (0x10000000 + i).toString(16), key = `${PARENT}.${i}`;
    const dir = dirMark ? path.join(dataDir, 'eph', 'vs-' + key) : null;   // the field's shape: a scratch directory under the suite's root
    if (dir) fs.mkdirSync(dir, { recursive: true });
    profiles.push(B.newProfileRecord({ id, label: `(ephemeral) Chat child ${i}`, dir, ephemeral: true, owner: { kind: 'conversation', id: key }, now: 1790000000000 }));
    browsers[id] = live ? { profileId: id, state: 'ready', pid: 4100000 + i, starttime: 1, cdpUrl: null, ns: 'vs-' + key, startedAt: 1790000000000 }
      : { profileId: id, state: 'stopped', pid: null, starttime: null, cdpUrl: null, ns: 'vs-' + key, startedAt: 1790000000000, endedAt: 1790000001000, stoppedBy: 'idle', lastError: null };
    if (dirMark) browsers[id].mark = `vsk-sweep-${dirN}-${i}`;   // and its launch mark (the reap scans /proc for it)
  }
  for (const x of extra) { profiles.push(x.profile); browsers[x.profile.id] = x.browser; }
  fs.writeFileSync(path.join(dataDir, 'browser-profiles.json'), JSON.stringify({ version: 1, profiles, leases: [], browsers, children: {}, told: {}, pins: {} }));
  return dataDir;
}
const onDisk = (dataDir) => JSON.parse(fs.readFileSync(path.join(dataDir, 'browser-profiles.json'), 'utf8')).profiles.filter((p) => p.ephemeral).length;

/** Run one sweep over `dataDir` with keeper module `Km`: `how` = 'boot' (keeper.boot()) | 'reconcile' (reconcile at graceMs 0,
 *  the sweep awaited) | 'tick' (keeper.tick() — the runtime half). A setImmediate ticker numbers the loop turns; each
 *  record's removal (its journal line) is stamped with the turn it ran in and stalls STALL_MS there. → the records per turn
 *  (max), the removals, the CLI `close` starts counted through the runtime's execFile seam, the lateness evidence. */
async function sweep(Km, dataDir, { how = 'reconcile', onRemoved = null, onWrite = null, stallMs = STALL_MS } = {}) {
  let turn = 0, running = true;
  const ticker = () => { turn++; if (running) setImmediate(ticker); };
  setImmediate(ticker);
  const perTurn = new Map(); const removed = [];
  let kref = null;
  const line = (m) => { const s = String(m); if (/ephemeral browser record \S+ .* removed with its conversation/.test(s)) { removed.push(s); perTurn.set(turn, (perTurn.get(turn) || 0) + 1); stall(stallMs); if (onRemoved) onRemoved(removed.length, kref); } };
  // F5's counters: every write of THIS registry file (the keeper's writeJsonAtomic renames onto it) and every broadcast of the list
  const storeFile = path.join(dataDir, 'browser-profiles.json'), writes = [], bcasts = [];
  const origRename = fs.renameSync;
  fs.renameSync = function (a, b) { const r = origRename.apply(this, arguments); if (b === storeFile) { writes.push({ turn, left: onDisk(dataDir) }); if (onWrite) onWrite(writes.length, writes[writes.length - 1]); } return r; };
  const closes = [];
  const execFileImpl = (bin, args, opts, cb) => { if (Array.isArray(args) && args[0] === 'close') { closes.push(args.join(' ')); if (closeHook) closeHook(opts); } const c = typeof opts === 'function' ? opts : cb; setImmediate(() => c(null, '{"success":true,"data":{}}', '')); return { on() { }, kill() { } }; };
  const k = Km.create({ dataDir, homeDir: ROOT, env: () => kenv, runtime: F.createBrowserRuntime({ env: kenv, execFileImpl }), liveKeys: () => new Set(), install: false, log: { log: line, warn: line, error: line, info: line }, broadcast: (m) => { if (m && m.type === 'browser-profiles-updated') bcasts.push(turn); }, tickMs: 3600e3 });
  kref = k;
  let maxLate = 0, last = performance.now(), walkMs = 0;
  const iv = setInterval(() => { const t = performance.now(); maxLate = Math.max(maxLate, t - last - 5); last = t; }, 5);
  const tw = performance.now();
  try {
    if (how === 'boot') await k.boot();
    else if (how === 'tick') await k.tick();
    else { const r = k.reconcile({ graceMs: 0 }); await r.retired; }
    walkMs = performance.now() - tw;   // K2: the walk's own span in this run — the pieces it spanned bound its writes
    await new Promise((res) => setTimeout(res, 12));   // the timer fires once more: a hold that ran to the end is read too
  } finally { running = false; clearInterval(iv); fs.renameSync = origRename; try { k.shutdown(); } catch { /* none */ } }
  return { perTurnMax: Math.max(0, ...perTurn.values()), turnsWithRemovals: perTurn.size, removed: removed.length, closes: closes.length, lateEvidenceMs: Math.round(maxLate), left: onDisk(dataDir), writes: writes.length, writeLog: writes, broadcasts: bcasts.length, piecesSpanned: Math.floor(walkMs / K.SWEEP_PIECE_MS) + 1, k };
}
let closeHook = null;

let s300 = null;   // ①'s 300-record reconcile — ⑧ reads its writes and broadcasts
const { mutantCopies } = await import('./mutant-copy.mjs');
const M = mutantCopies('keeper-sweep-yields', REPO);
const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');

console.log('— ① L1: the orphan sweep takes ONE record per loop turn, whatever the count (a stall placed in each removal)');
{
  for (const N of [50, 300]) {
    const s = await sweep(K, registry(N));
    if (N === 300) s300 = s;
    ok(s.removed === N && s.left === 0 && s.perTurnMax === 1 && s.turnsWithRemovals === N, `reconcile, ${N} orphan records: all removed, ONE per loop turn (the most in one turn: ${s.perTurnMax}; the stall placed per record ${STALL_MS} ms — evidence, a 5 ms timer's worst lateness ${s.lateEvidenceMs} ms)`, { removed: s.removed, left: s.left, perTurnMax: s.perTurnMax, turns: s.turnsWithRemovals });
  }
  const sb = await sweep(K, registry(300), { how: 'boot', stallMs: 0 });   // (the count is the claim; the placed stall's evidence is ①'s reconcile)
  ok(sb.removed === 300 && sb.left === 0 && sb.perTurnMax === 1, `boot, 300 orphan records: all removed, one per loop turn (most in one turn ${sb.perTurnMax}; lateness evidence ${sb.lateEvidenceMs} ms)`, { removed: sb.removed, perTurnMax: sb.perTurnMax });
  const st = await sweep(K, registry(300), { how: 'tick', stallMs: 0 });
  ok(st.removed === 300 && st.left === 0 && st.perTurnMax === 1, `the tick (the runtime half), 300 orphan records: all removed, one per loop turn (most in one turn ${st.perTurnMax}; lateness evidence ${st.lateEvidenceMs} ms)`, { removed: st.removed, perTurnMax: st.perTurnMax });
  // MUTANT: the yield removed (the steps run back to back inside one turn)
  const noYield = ksrc.replace('        await yieldLoop();\n        if (reg.leases.some((l) => l.profileId === id))', '        if (reg.leases.some((l) => l.profileId === id))');
  ok(noYield !== ksrc, 'MUTANT (the yield removed): the patch applies');
  if (noYield !== ksrc) {
    const Kn = M.load('src/server/browser-keeper.js', noYield, 'no-yield');
    const sm = await sweep(Kn, registry(300));
    ok(sm.removed === 300 && sm.perTurnMax > 1, `MUTANT (the yield removed) is RED on the law: ${sm.perTurnMax} records retired in one loop turn (lateness evidence ${sm.lateEvidenceMs} ms)`, { perTurnMax: sm.perTurnMax });
  }
}

console.log('— ② L2: a record whose daemon is GONE starts no browser-CLI child; a daemon that runs is still closed');
{
  const s = await sweep(K, registry(300, { live: true }), { stallMs: 0 });
  ok(s.removed === 300 && s.left === 0 && s.closes === 0, `300 records left \`ready\` whose daemon is gone: every one removed, browser-CLI \`close\` starts: ${s.closes} (one per record would fork the hub ${300} times)`, { removed: s.removed, closes: s.closes, left: s.left });
  // F3: the field's shape — a scratch directory and a launch mark per record; each pays the reap's own road
  const origMB = F.markedBrowsers; let walks = 0;
  F.markedBrowsers = (...a) => { walks++; return origMB(...a); };
  const s3 = await sweep(K, registry(30, { live: true, dirMark: true }), { stallMs: 0 });
  F.markedBrowsers = origMB;
  ok(s3.removed === 30 && s3.left === 0 && s3.closes === 0 && s3.perTurnMax === 1 && walks === 30, `F3 the field's shape — 30 records left \`ready\` with a scratch directory and a launch mark each: every one pays the reap's own road (${walks} /proc walks by mark, the directory's lock read), browser-CLI starts: ${s3.closes}, one record per loop turn (most ${s3.perTurnMax})`, { removed: s3.removed, closes: s3.closes, perTurnMax: s3.perTurnMax, walks });
  // CONTROL: a daemon that RUNS — a process of this test, its start time recorded as the keeper records one
  const proc = spawn('sleep', ['30'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 50));
  const st = F.procStart(proc.pid);
  const id = 'bp-1fffffff', key = `${PARENT}.999`;
  const extra = [{ profile: B.newProfileRecord({ id, label: '(ephemeral) Chat child live', dir: null, ephemeral: true, owner: { kind: 'conversation', id: key }, now: 1790000000000 }), browser: { profileId: id, state: 'ready', pid: proc.pid, starttime: st, cdpUrl: null, ns: 'vs-' + key, startedAt: 1790000000000 } }];
  closeHook = () => { try { process.kill(proc.pid, 'SIGTERM'); } catch { /* gone */ } };   // the CLI's own close ends its daemon
  const c = await sweep(K, registry(3, { live: true, extra }), { stallMs: 0 });
  closeHook = null;
  const procGone = await new Promise((r) => { if (proc.exitCode !== null || proc.signalCode) return r(true); proc.once('exit', () => r(true)); setTimeout(() => r(false), 2000); });
  ok(st != null && c.removed === 4 && c.closes === 1 && procGone, `CONTROL: beside 3 gone daemons, ONE whose daemon runs (pid ${proc.pid}, its start time recorded) is still closed by the browser CLI — 1 start in all — and ended; all 4 records removed`, { st, removed: c.removed, closes: c.closes, procGone });
  try { proc.kill('SIGKILL'); } catch { /* gone */ }
  // MUTANT: the gone-daemon judgment removed (every live-looking record goes to the CLI's close)
  const noJudge = ksrc.replace("        if (B.isLiveBrowser(rec0) && isLocalRec(rec0) && !starting.has(profileId) && !stopping.has(profileId) && daemonSeenGone(rec0)) {", '        if (false) {');
  ok(noJudge !== ksrc, 'MUTANT (the gone-daemon judgment removed): the patch applies');
  if (noJudge !== ksrc) {
    const Kj = M.load('src/server/browser-keeper.js', noJudge, 'no-judge');
    const sj = await sweep(Kj, registry(300, { live: true }), { stallMs: 0 });
    ok(sj.closes === 300, `MUTANT (the gone-daemon judgment removed) is RED on the law: ${sj.closes} browser-CLI starts for 300 records whose daemons are gone`, { closes: sj.closes });
  }
}

console.log('— ③ L4: progress persists — the file loses a PIECE per write; a restart mid-walk resumes with exactly the records left');
{
  const dataDir = registry(120);
  const mid = path.join(ROOT, 'mid'); fs.mkdirSync(mid, { recursive: true });
  let copied = null;
  const s = await sweep(K, dataDir, { stallMs: 5, onWrite: (n, w) => { if (copied === null && w.left > 0) { copied = w.left; fs.copyFileSync(path.join(dataDir, 'browser-profiles.json'), path.join(mid, 'browser-profiles.json')); } } });
  const lefts = s.writeLog.map((w) => w.left);
  ok(s.removed === 120 && s.left === 0 && s.writes >= 2 && s.writes < 120 && lefts.every((x, i) => i === 0 || x < lefts[i - 1]) && lefts[lefts.length - 1] === 0, `the registry file loses a PIECE per write — ${s.writes} writes for 120 removals, the records left after each: ${lefts.join(' → ')}`, { writes: s.writes, lefts });
  const left = copied == null ? -1 : onDisk(mid);
  const r = copied == null ? { removed: -1, left: -1 } : await sweep(K, mid, { how: 'boot', stallMs: 0 });
  ok(copied > 0 && left === copied && r.removed === left && r.left === 0, `a keeper booted over the registry as it stood at a write mid-walk (a restart there): ${left} records left, and its boot sweep retires exactly those ${r.removed}`, { copied, left, removed: r.removed });
}

console.log('— ⑤ F1: a record whose conversation is carried again before its step is KEPT, nothing of it stopped');
{
  const dataDir = registry(20, { live: true });
  const KEEP = 'bp-' + (0x10000000 + 5).toString(16), KEEP_KEY = `${PARENT}.5`;
  let backAt = 0;
  const s = await sweep(K, dataDir, { stallMs: 0, onRemoved: (n, k) => { if (n === 1) { backAt = n; k._reg().leases.push({ profileId: KEEP, browserKey: KEEP_KEY, sessionId: 'sess-back', targetId: null, since: Date.now(), input: 'agent', viewers: 0, carrierLostAt: null, alias: 'ephemeral' }); } } });
  const reg = s.k._reg(); const rec = reg.browsers[KEEP];
  ok(backAt === 1 && s.removed === 19 && s.left === 1 && !!s.k.profile(KEEP) && rec && rec.state === 'ready' && rec.pid === 4100005 && s.closes === 0, 'among 20 orphans, the one whose lease came back after the first removal (before its own step) is KEPT — its browser record untouched (still `ready`, its pid), no CLI start — and the other 19 go', { removed: s.removed, left: s.left, state: rec && rec.state, closes: s.closes });
}

console.log('— ⑥ F2: nothing of a carried conversation is ended by the sweep — a stall placed in the reap\'s window');
const f2 = async (Km) => {
  const dataDir = registry(1, { live: true, dirMark: true });
  const id = 'bp-' + (0x10000000 + 1).toString(16), key = `${PARENT}.1`;
  const origMB = F.markedBrowsers; let entered, release;
  const inWindow = new Promise((r) => { entered = r; }); const gate = new Promise((r) => { release = r; });
  F.markedBrowsers = async (m) => { if (/^vsk-sweep-/.test(String(m))) { entered(); await gate; return []; } return origMB(m); };   // THE PLACED STALL: the reap's scan held open
  const closes = [];
  let proc = null;   // the browser the resumed conversation starts (below); the CLI's own close ends its daemon, as the real one does
  const execFileImpl = (bin, args, opts, cb) => { if (Array.isArray(args) && args[0] === 'close') { closes.push(args.join(' ')); try { if (proc) process.kill(proc.pid, 'SIGTERM'); } catch { /* gone */ } } const c = typeof opts === 'function' ? opts : cb; setTimeout(() => c(null, '{"success":true,"data":{}}', ''), 30); return { on() { }, kill() { } }; };
  const quiet = { log() { }, warn() { }, error() { }, info() { } };
  const k = Km.create({ dataDir, homeDir: ROOT, env: () => kenv, runtime: F.createBrowserRuntime({ env: kenv, execFileImpl }), liveKeys: () => new Set(), install: false, log: quiet, tickMs: 3600e3 });
  proc = spawn('sleep', ['30'], { stdio: 'ignore' });
  try {
    const r = k.reconcile({ graceMs: 0 });
    await inWindow;   // the retire is inside the reap (the record already marked stopped by the gone-daemon judgment)
    // the conversation resumes HERE: its lease is back and its browser started again (a process of this test, its start time recorded)
    await new Promise((res) => setTimeout(res, 50));
    k._reg().leases.push({ profileId: id, browserKey: key, sessionId: 'sess-back', targetId: null, since: Date.now(), input: 'agent', viewers: 0, carrierLostAt: null, alias: 'ephemeral' });
    k._reg().browsers[id] = { profileId: id, state: 'ready', pid: proc.pid, starttime: F.procStart(proc.pid), cdpUrl: null, ns: 'vs-' + key, startedAt: Date.now() };
    release();
    const out = await r.retired;
    const alive = proc.exitCode === null && !proc.signalCode && F.pidAlive(proc.pid);
    const rec = k._reg().browsers[id];
    return { out: out[0], kept: !!k.profile(id), state: rec && rec.state, alive, closes: closes.length };
  } finally { F.markedBrowsers = origMB; try { proc.kill('SIGKILL'); } catch { /* gone */ } try { k.shutdown(); } catch { /* none */ } }
};
{
  const g = await f2(K);
  ok(g.kept && g.state === 'ready' && g.alive && g.closes === 0 && g.out && g.out.kept === true, 'the conversation resumed inside the reap\'s window: after the reap the retire reads the lease again — the record KEPT, the browser it just started left RUNNING, no CLI start', g);
  const noReread = ksrc.replace("      if (reg.leases.some((l) => l.profileId === profileId)) return { removed: false, kept: true, why: 'its conversation is carried again' };\n      try { if (B.isLiveBrowser(reg.browsers[profileId])) await stop(profileId, { why }); }", "      try { if (B.isLiveBrowser(reg.browsers[profileId])) await stop(profileId, { why }); }");
  ok(noReread !== ksrc, 'MUTANT (the re-read after the reap removed): the patch applies');
  if (noReread !== ksrc) {
    const gm = await f2(M.load('src/server/browser-keeper.js', noReread, 'no-reread'));
    ok(!(gm.state === 'ready' && gm.alive && gm.closes === 0), `MUTANT (the re-read removed) is RED on the law: the browser the resumed conversation had just started was closed (CLI starts ${gm.closes}, state ${gm.state}, its process ${gm.alive ? 'alive' : 'ended'})`, gm);
  }
}

console.log('— ⑦ F4: the whole turn in which a conversation ends — its leases, child handles and records');
{
  const N = 300;
  const dataDir = registry(N, { live: true });
  const file = path.join(dataDir, 'browser-profiles.json'); const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let i = 1; i <= N; i++) {
    const key = `${PARENT}.${i}`, id = 'bp-' + (0x10000000 + i).toString(16);
    doc.leases.push({ profileId: id, browserKey: key, sessionId: 'sess-p', targetId: null, since: 1790000000000, input: 'agent', viewers: 0, carrierLostAt: null, alias: 'ephemeral' });
    doc.children[key] = { parent: PARENT, since: 1790000000000, sessionId: 'sess-p', carrierLostAt: null };
  }
  fs.writeFileSync(file, JSON.stringify(doc));
  let clock = 1790000100000, live = new Set([PARENT]);
  let turn = 0, running = true; const ticker = () => { turn++; if (running) setImmediate(ticker); }; setImmediate(ticker);
  const perTurn = new Map(); const bump = (t, kind) => { const m = perTurn.get(t) || { lease: 0, handle: 0, record: 0, write: 0, broadcast: 0, start: 0 }; m[kind]++; perTurn.set(t, m); };
  const span = { first: 0, last: 0 };   // evidence only: the drop loop's span on the clock (never asserted — test-ci-gate §2e)
  const walk = { first: 0, last: 0 };   // the walk's own span (its first and last removal): the pieces it spanned bound its writes (K2)
  const line = (m) => { const x = String(m); if (/\] dropped the lease of /.test(x) || /\] reaped child handle /.test(x)) { const t = performance.now(); if (!span.first) span.first = t; span.last = t; } if (/\] dropped the lease of /.test(x)) bump(turn, 'lease'); else if (/\] reaped child handle /.test(x)) bump(turn, 'handle'); else if (/ephemeral browser record \S+ .* removed with its conversation/.test(x)) { const t = performance.now(); if (!walk.first) walk.first = t; walk.last = t; bump(turn, 'record'); } };
  const origRename = fs.renameSync; fs.renameSync = function (a, b) { const r = origRename.apply(this, arguments); if (b === file) bump(turn, 'write'); return r; };
  const execFileImpl = (bin, args, opts, cb) => { if (Array.isArray(args) && args[0] === 'close') bump(turn, 'start'); const cbk = typeof opts === 'function' ? opts : cb; setImmediate(() => cbk(null, '{"success":true,"data":{}}', '')); return { on() { }, kill() { } }; };
  const k = K.create({ dataDir, homeDir: ROOT, env: () => kenv, runtime: F.createBrowserRuntime({ env: kenv, execFileImpl }), liveKeys: () => live, now: () => clock, install: false, log: { log: line, warn: line, error: line, info: line }, broadcast: (m) => { if (m && m.type === 'browser-profiles-updated') bump(turn, 'broadcast'); }, tickMs: 3600e3 });
  let maxLate = 0, last = performance.now();
  const iv = setInterval(() => { const t = performance.now(); maxLate = Math.max(maxLate, t - last - 5); last = t; }, 5);
  try {
    await k.tick();                       // carried: its leases and handles stand
    live = new Set();                     // the conversation ends at run time
    await k.tick();                       // the grace starts (each lease and handle stamped)
    clock += B.LEASE_DROP_GRACE_MS + 1000;
    await new Promise((res) => setTimeout(res, 20));   // the next tick in a turn of its own (the timer's), as the keeper's own timer runs it
    await k.tick();                       // past the grace: in ONE reconcile its leases drop and its handles are reaped, then the walk
    await new Promise((res) => setTimeout(res, 12));
  } finally { running = false; clearInterval(iv); fs.renameSync = origRename; try { k.shutdown(); } catch { /* none */ } }
  const turns = [...perTurn.values()];
  const drop = turns.find((m) => m.lease > 0) || {};
  const tot = turns.reduce((a, m) => { for (const kk of Object.keys(m)) a[kk] = (a[kk] || 0) + m[kk]; return a; }, {});
  const recMax = Math.max(0, ...turns.map((m) => m.record));
  ok(drop.lease === N && drop.handle === N && drop.write === 0 && drop.broadcast === 0 && drop.start === 0 && drop.record === 0, `the turn the conversation ends in drops its ${N} leases and reaps its ${N} child handles — in-memory acts only: in that turn ${drop.write} registry writes, ${drop.broadcast} broadcasts, ${drop.start} child starts, ${drop.record} records retired (the walk starts at the next turn; evidence: the drop loop spans ${Math.round(span.last - span.first)} ms, a 5 ms timer's worst lateness over the three ticks ${Math.round(maxLate)} ms)`, drop);
  const pieces = Math.floor((walk.last - walk.first) / K.SWEEP_PIECE_MS) + 1, TICKS = 3;   // the walk's pieces, + one commit of each tick's own
  ok(tot.record === N && recMax === 1 && !tot.start && (tot.write || 0) <= pieces + TICKS && (tot.write || 0) < N && (tot.broadcast || 0) <= pieces + TICKS && (tot.broadcast || 0) < N, `…then its ${N} records retire ONE per loop turn (most ${recMax}), with ${tot.start || 0} child starts, ${tot.write || 0} registry writes and ${tot.broadcast || 0} broadcasts in all — at most one per piece the walk spanned (${pieces}) plus each of the ${TICKS} ticks' own, below the ${N} removals`, { ...tot, pieces });
}

console.log('— ⑧ F5: one registry write and one broadcast per PIECE of the walk, not per record');
{
  const s = s300;   // ①'s 300-record reconcile, read for its writes and broadcasts
  // K2: a cost claim is a COUNT bounded by the run's own span — the pieces this walk spanned (floor(span / SWEEP_PIECE_MS) + 1:
  // a slower machine spans more of them, never fewer) — and far below the removals; no ceiling a clock decides
  ok(s.removed === 300 && s.writes >= 1 && s.writes <= s.piecesSpanned && s.writes < s.removed && s.broadcasts >= 1 && s.broadcasts <= s.piecesSpanned && s.broadcasts < s.removed, `300 removals (①'s reconcile): ${s.writes} registry writes and ${s.broadcasts} broadcasts — at most one per piece the walk spanned in this run (${s.piecesSpanned}), and below the 300 removals`, { removed: s.removed, writes: s.writes, broadcasts: s.broadcasts, piecesSpanned: s.piecesSpanned });
  // K1: an orderly stop in the middle of a walk writes what memory holds (the removals the walk had deferred)
  {
    const dataDir = registry(60);
    let at = null;
    await sweep(K, dataDir, { stallMs: 0, onRemoved: (n, k) => { if (n === 10 && at === null) { k.shutdown(); at = { disk: onDisk(dataDir), memory: k._reg().profiles.filter((p) => p.ephemeral).length }; } } });
    ok(at && at.memory === 50 && at.disk === at.memory, `K1: a stop (the keeper's shutdown) after 10 of 60 removals, inside one piece — the file holds what memory holds: ${at && at.disk} on disk, ${at && at.memory} in memory`, at);
  }
  const noBatch = ksrc.replace('    if (sweepIds.has(id)) sweepDirty = true; else commit();', '    commit();');
  ok(noBatch !== ksrc, 'MUTANT (the batching dropped): the patch applies');
  if (noBatch !== ksrc) {
    const sm = await sweep(M.load('src/server/browser-keeper.js', noBatch, 'no-batch'), registry(300), { stallMs: 0 });
    ok(sm.writes >= 300 && sm.broadcasts >= 300, `MUTANT (the batching dropped) is RED on the law: ${sm.writes} registry writes and ${sm.broadcasts} broadcasts for 300 removals`, { writes: sm.writes, broadcasts: sm.broadcasts });
  }
}

console.log('— ⑨ «gone» is a fact the keeper has SEEN: a live daemon whose fact is missing is still closed by the CLI');
const unseen = async (Km, shape, waitMs = 1500) => {   // waitMs: how long a close may take to end the daemon (a mutant that never closes waits it whole)
  const proc = spawn('sleep', ['30'], { stdio: 'ignore' });
  await new Promise((res) => setTimeout(res, 50));
  const id = 'bp-1ffffffd', key = `${PARENT}.997`;
  const facts = shape === 'no pid' ? { pid: null, starttime: null } : { pid: proc.pid, starttime: null };
  const extra = [{ profile: B.newProfileRecord({ id, label: '(ephemeral) Chat child unseen', dir: null, ephemeral: true, owner: { kind: 'conversation', id: key }, now: 1790000000000 }), browser: { profileId: id, state: 'ready', ...facts, cdpUrl: null, ns: 'vs-' + key, startedAt: 1790000000000 } }];
  closeHook = () => { try { process.kill(proc.pid, 'SIGTERM'); } catch { /* gone */ } };   // the CLI's own close ends its daemon
  try {
    const s = await sweep(Km, registry(0, { live: true, extra }), { stallMs: 0 });
    const ended = await new Promise((r) => { if (proc.exitCode !== null || proc.signalCode) return r(true); proc.once('exit', () => r(true)); setTimeout(() => r(false), waitMs); });
    return { closes: s.closes, removed: s.removed, ended };
  } finally { closeHook = null; try { proc.kill('SIGKILL'); } catch { /* gone */ } }
};
{
  for (const shape of ['no pid', 'no start time']) {
    const u = await unseen(K, shape);
    ok(u.closes === 1 && u.ended && u.removed === 1, `a LIVE daemon whose record has ${shape === 'no pid' ? 'no pid' : 'its pid but no start time'}: the retire cannot see it gone, so it closes it by the CLI as before — ${u.closes} start, the daemon ${u.ended ? 'ended' : 'LEFT RUNNING'}, the record removed`, u);
  }
  const oldJudge = ksrc.replace('!stopping.has(profileId) && daemonSeenGone(rec0)) {', '!stopping.has(profileId) && daemonGone(rec0)) {');
  ok(oldJudge !== ksrc, 'MUTANT (an absent fact read as «gone», the old judgment): the patch applies');
  if (oldJudge !== ksrc) {
    const um = await unseen(M.load('src/server/browser-keeper.js', oldJudge, 'absent-is-gone'), 'no pid', 300);   // no close is made: 300 ms shows it left running
    ok(um.closes === 0 && !um.ended, `MUTANT (the old judgment) is RED on the law: ${um.closes} CLI starts, the live daemon ${um.ended ? 'ended' : 'left running'} — a live browser nobody ends`, um);
  }
}

console.log('— ⑩ the retire\'s contract: a record its conversation still holds is kept with its browser; detach, then retire, ends it');
const carriedRetire = async (Km, detachFirst) => {
  const dataDir = path.join(ROOT, 'c' + (++dirN)); fs.mkdirSync(dataDir, { recursive: true });
  const daemon = spawn('sleep', ['30'], { stdio: 'ignore' });
  await new Promise((res) => setTimeout(res, 50));
  const KEY = 'bk-0000c8b8', id = 'bp-18b18b18';
  fs.writeFileSync(path.join(dataDir, 'browser-profiles.json'), JSON.stringify({ version: 1,
    profiles: [B.newProfileRecord({ id, label: '(ephemeral) carried', dir: null, ephemeral: true, owner: { kind: 'conversation', id: KEY }, now: 1790000000000 })],
    leases: [{ profileId: id, browserKey: KEY, sessionId: 'sess-c', targetId: null, since: 1790000000000, input: 'agent', viewers: 0, carrierLostAt: null, alias: 'ephemeral' }],
    browsers: { [id]: { profileId: id, state: 'ready', pid: daemon.pid, starttime: F.procStart(daemon.pid), cdpUrl: null, ns: 'vs-' + KEY, startedAt: 1790000000000 } },
    children: {}, told: {}, pins: {} }));
  const closes = [];
  const execFileImpl = (bin, args, opts, cb) => { if (Array.isArray(args) && args[0] === 'close') { closes.push(1); try { process.kill(daemon.pid, 'SIGTERM'); } catch { /* gone */ } } const cbk = typeof opts === 'function' ? opts : cb; setTimeout(() => cbk(null, '{"success":true,"data":{}}', ''), 20); return { on() { }, kill() { } }; };
  const k = Km.create({ dataDir, homeDir: ROOT, env: () => kenv, runtime: F.createBrowserRuntime({ env: kenv, execFileImpl }), liveKeys: () => new Set([KEY]), install: false, log: { log() { }, warn() { }, error() { }, info() { } }, tickMs: 3600e3 });
  try {
    if (detachFirst) { try { k.detach({ profileId: id, browserKey: KEY, by: 'user' }); } catch { /* none */ } }
    let answer; try { answer = await k.retireEphemeral(id, 'test'); } catch (e) { answer = { threw: String(e && e.message) }; }
    await new Promise((res) => setTimeout(res, 100));
    return { answer, closes: closes.length, running: daemon.exitCode === null && !daemon.signalCode && F.pidAlive(daemon.pid), kept: !!k.profile(id), state: (k.browserOf(id) || {}).state || null };
  } finally { try { daemon.kill('SIGKILL'); } catch { /* gone */ } try { k.shutdown(); } catch { /* none */ } }
};
{
  const d = await carriedRetire(K, false);
  ok(d.answer && d.answer.kept === true && d.closes === 0 && d.running && d.kept && d.state === 'ready', `a DIRECT retire of a record its conversation still holds KEEPS it — the record and its browser (answer kept, ${d.closes} CLI close, the daemon ${d.running ? 'running' : 'ENDED'}, state ${d.state})`, d);
  const r = await carriedRetire(K, true);
  ok(r.answer && r.answer.removed === true && r.closes === 1 && !r.running && !r.kept, `the product's road — a detach, then the retire (it joins the detach's own) — ENDS it: removed, ${r.closes} CLI close, the daemon ${r.running ? 'LEFT RUNNING' : 'ended'}`, r);
}

console.log('— ④ L3: the lifecycle of a child record, as the code has it');
{
  const dataDir = path.join(ROOT, 'life'); fs.mkdirSync(dataDir, { recursive: true });
  let live = new Set([PARENT]);
  const k = K.create({ dataDir, homeDir: ROOT, env: () => kenv, liveKeys: () => live, install: false, log: { log() { }, warn() { }, error() { }, info() { } }, tickMs: 3600e3 });
  const kids = [k.newChild({ browserKey: PARENT }), k.newChild({ browserKey: PARENT })].map((c) => c.handle);
  let r = k.reconcile({ graceMs: 0 }); await r.retired;
  ok(kids.every((h) => k._reg().children[h]), 'a sub-agent\'s child handle stays while its parent conversation is carried (newChild: «reaped with the parent»), however long ago it was minted', Object.keys(k._reg().children));
  live = new Set();
  r = k.reconcile({ graceMs: 0 }); await r.retired;
  ok(kids.every((h) => !k._reg().children[h]), '…and goes with the parent (reconcile §3.7: the same rule and grace as a lease)', Object.keys(k._reg().children));
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
