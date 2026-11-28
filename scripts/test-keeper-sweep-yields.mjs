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
//   ③ L4 PROGRESS PERSISTS: the registry hands on a PIECE per write (F5 — lane lg-store-writes U5b: the keeper's hand-offs to the store writer); a keeper booted over a copy taken at a
//      write mid-walk (a restart there) retires exactly the records that were left.
//   ⑦ F4 THE WHOLE TURN THE CONVERSATION ENDS IN: a conversation with N leases, N child handles and N records ends at run time
//      (the tick, past the grace): the one turn that drops its leases and reaps its handles is COUNTED — in-memory acts only
//      (0 registry writes, 0 broadcasts, 0 child starts in it) — then its records retire one per turn.
//   ⑧ F5 ONE REGISTRY WRITE AND ONE BROADCAST PER PIECE OF THE WALK: the writes and the broadcasts (each counted: the keeper's
//      hand-off of the registry file to the store writer — lane lg-store-writes U5b — and the keeper's own broadcast) are bounded by the PIECES THE WALK SPANNED in this run (its own span
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
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const landedU5b = () => { try { require('../src/store-writer.js').storeWriter().flushSync(); } catch { } };   // lane lg-store-writes U5b: browser-profiles.json is the store writer's — a read or a fixture write of the FILE lands what the writer owes first (the release's order)
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const B = require('../src/browser-profiles.js');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  (landedU5b(), fs).writeFileSync(path.join(dataDir, 'browser-profiles.json'), JSON.stringify({ version: 1, profiles, leases: [], browsers, children: {}, told: {}, pins: {} }));
  return dataDir;
}
// lane lg-store-writes U5b (B-0248): the registry is the STORE WRITER's. A registry WRITE in this suite is the keeper's HAND-OFF of
// the file to the writer (one save() — what the walk's batching bounds; the writer may land two hand-offs as one write, and the
// rename is the worker's), counted at the shared writer's dirty() with the records ITS bytes hand on (the keeper's produce(), as
// memory stood at the hand-off). A mutant copy requires through the original's path, so it hands to the same writer.
const SWreg = require('../src/store-writer.js').storeWriter();
const onRegistryHandOff = (file, fn) => { const key = path.resolve(file), orig = SWreg.dirty; SWreg.dirty = function (f, o) { const r = orig.apply(this, arguments); if (f === key && o && o.name === 'browser-profiles.write') { let bytes = null; try { bytes = o.produce(); } catch { } fn(bytes); } return r; }; return () => { SWreg.dirty = orig; }; };
const eph = (bytes) => { try { return JSON.parse(bytes).profiles.filter((p) => p.ephemeral).length; } catch { return -1; } };
const onDisk = (dataDir) => JSON.parse((landedU5b(), fs).readFileSync(path.join(dataDir, 'browser-profiles.json'), 'utf8')).profiles.filter((p) => p.ephemeral).length;

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
  // F5's counters: every write of THIS registry file (lane lg-store-writes U5b: the keeper's hand-off of it to the store writer,
  // with the records its bytes hand on) and every broadcast of the list
  const storeFile = path.join(dataDir, 'browser-profiles.json'), writes = [], bcasts = [];
  const unhook = onRegistryHandOff(storeFile, (bytes) => { writes.push({ turn, left: eph(bytes), bytes }); if (onWrite) onWrite(writes.length, writes[writes.length - 1]); });
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
  } finally { running = false; clearInterval(iv); unhook(); try { k.shutdown(); } catch { /* none */ } }
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
  const noYield = editAnchor(ksrc, '        await yieldLoop();\n        if (reg.leases.some((l) => l.profileId === id))', '        if (reg.leases.some((l) => l.profileId === id))', "src/server/browser-keeper.js");
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
  ok(st != null && c.removed === 4 && c.closes === 1 && verdictOf(procGone), `CONTROL: beside 3 gone daemons, ONE whose daemon runs (pid ${proc.pid}, its start time recorded) is still closed by the browser CLI — 1 start in all — and ended; all 4 records removed`, { st, removed: c.removed, closes: c.closes, procGone });
  try { proc.kill('SIGKILL'); } catch { /* gone */ }
  // MUTANT: the gone-daemon judgment removed (every live-looking record goes to the CLI's close)
  const noJudge = editAnchor(ksrc, "        if (B.isLiveBrowser(rec0) && isLocalRec(rec0) && !starting.has(profileId) && !stopping.has(profileId) && daemonSeenGone(rec0)) {", '        if (false) {', "src/server/browser-keeper.js");
  ok(noJudge !== ksrc, 'MUTANT (the gone-daemon judgment removed): the patch applies');
  if (noJudge !== ksrc) {
    const Kj = M.load('src/server/browser-keeper.js', noJudge, 'no-judge');
    const sj = await sweep(Kj, registry(300, { live: true }), { stallMs: 0 });
    ok(sj.closes === 300, `MUTANT (the gone-daemon judgment removed) is RED on the law: ${sj.closes} browser-CLI starts for 300 records whose daemons are gone`, { closes: sj.closes });
  }
}

console.log('— ③ L4: progress persists — the registry hands on a PIECE per write; a restart mid-walk resumes with exactly the records left');
{
  const dataDir = registry(120);
  const mid = path.join(ROOT, 'mid'); fs.mkdirSync(mid, { recursive: true });
  let copied = null;
  // the copy taken at a write = the bytes that write hands on (lane lg-store-writes U5b: the registry as it stands once that write lands)
  const s = await sweep(K, dataDir, { stallMs: 5, onWrite: (n, w) => { if (copied === null && w.left > 0) { copied = w.left; fs.writeFileSync(path.join(mid, 'browser-profiles.json'), w.bytes); } } });
  const lefts = s.writeLog.map((w) => w.left);
  ok(s.removed === 120 && s.left === 0 && s.writes >= 2 && s.writes < 120 && gateOf(lefts.every((x, i) => i === 0 || x < lefts[i - 1])) && lefts[lefts.length - 1] === 0, `the registry hands on a PIECE per write (the keeper's hand-offs to the store writer — that each lands is the writer's own suites') — ${s.writes} writes for 120 removals, the records left after each: ${lefts.join(' → ')}`, { writes: s.writes, lefts });
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
  ok(backAt === 1 && s.removed === 19 && s.left === 1 && !!s.k.profile(KEEP) && gateOf(rec) && rec.state === 'ready' && rec.pid === 4100005 && s.closes === 0, 'among 20 orphans, the one whose lease came back after the first removal (before its own step) is KEPT — its browser record untouched (still `ready`, its pid), no CLI start — and the other 19 go', { removed: s.removed, left: s.left, state: rec && rec.state, closes: s.closes });
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
  ok(gateOf(g.kept) && g.state === 'ready' && gateOf(g.alive) && g.closes === 0 && gateOf(g.out) && g.out.kept === true, 'the conversation resumed inside the reap\'s window: after the reap the retire reads the lease again — the record KEPT, the browser it just started left RUNNING, no CLI start', g);
  const noReread = editAnchor(ksrc, "      if (reg.leases.some((l) => l.profileId === profileId)) return { removed: false, kept: true, why: 'its conversation is carried again' };\n      { const ph = passkeyHeldNow();", "      { const ph = passkeyHeldNow();", "src/server/browser-keeper.js")   /* r3702: the re-read now sits before the passkey hold's ask (still before the stop) */;
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
  const unhook = onRegistryHandOff(file, () => bump(turn, 'write'));   // lane lg-store-writes U5b: a registry write = a hand-off to the store writer
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
  } finally { running = false; clearInterval(iv); unhook(); try { k.shutdown(); } catch { /* none */ } }
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
    ok(gateOf(at) && at.memory === 50 && at.disk === at.memory, `K1: a stop (the keeper's shutdown) after 10 of 60 removals, inside one piece — the file holds what memory holds: ${at && at.disk} on disk, ${at && at.memory} in memory`, at);
  }
  const noBatch = editAnchor(ksrc, '    if (sweepIds.has(id)) sweepDirty = true; else commit();', '    commit();', "src/server/browser-keeper.js");
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
    ok(u.closes === 1 && gateOf(u.ended) && u.removed === 1, `a LIVE daemon whose record has ${shape === 'no pid' ? 'no pid' : 'its pid but no start time'}: the retire cannot see it gone, so it closes it by the CLI as before — ${u.closes} start, the daemon ${u.ended ? 'ended' : 'LEFT RUNNING'}, the record removed`, u);
  }
  const oldJudge = editAnchor(ksrc, '!stopping.has(profileId) && daemonSeenGone(rec0)) {', '!stopping.has(profileId) && daemonGone(rec0)) {', "src/server/browser-keeper.js");
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
  (landedU5b(), fs).writeFileSync(path.join(dataDir, 'browser-profiles.json'), JSON.stringify({ version: 1,
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
  ok(gateOf(d.answer) && d.answer.kept === true && d.closes === 0 && gateOf(d.running) && gateOf(d.kept) && d.state === 'ready', `a DIRECT retire of a record its conversation still holds KEEPS it — the record and its browser (answer kept, ${d.closes} CLI close, the daemon ${d.running ? 'running' : 'ENDED'}, state ${d.state})`, d);
  const r = await carriedRetire(K, true);
  ok(gateOf(r.answer) && r.answer.removed === true && r.closes === 1 && !r.running && !r.kept, `the product's road — a detach, then the retire (it joins the detach's own) — ENDS it: removed, ${r.closes} CLI close, the daemon ${r.running ? 'LEFT RUNNING' : 'ended'}`, r);
}

console.log('— ④ L3: the lifecycle of a child record, as the code has it');
{
  const dataDir = path.join(ROOT, 'life'); fs.mkdirSync(dataDir, { recursive: true });
  let live = new Set([PARENT]);
  const k = K.create({ dataDir, homeDir: ROOT, env: () => kenv, liveKeys: () => live, install: false, log: { log() { }, warn() { }, error() { }, info() { } }, tickMs: 3600e3 });
  const kids = [k.newChild({ browserKey: PARENT }), k.newChild({ browserKey: PARENT })].map((c) => c.handle);
  let r = k.reconcile({ graceMs: 0 }); await r.retired;
  ok(verdictOf(kids.every((h) => k._reg().children[h])), 'a sub-agent\'s child handle stays while its parent conversation is carried (newChild: «reaped with the parent»), however long ago it was minted', Object.keys(k._reg().children));
  live = new Set();
  r = k.reconcile({ graceMs: 0 }); await r.retired;
  ok(verdictOf(kids.every((h) => !k._reg().children[h])), '…and goes with the parent (reconcile §3.7: the same rule and grace as a lease)', Object.keys(k._reg().children));
}

console.log('— ⑪ B-346d law 2: a daemon gone BEFORE its idle timeout is never «idled out» — the words say what is known');
{
  const KB = require('../src/browser-kept.js');
  const mute = { log() { }, warn() { }, error() { }, info() { } };
  const CLOCK = 1795000000000, IDLE = 900000;   // the keeper's clock; a 15-minute idle timeout (the row's)
  const KEYS = ['bk-0000c461', 'bk-0000c462', 'bk-0000c463'];
  const mk = (i, key, { startedAgo, lastAgo, beforeAgo }) => {
    const id = 'bp-' + (0x20000000 + i).toString(16);
    const profile = B.newProfileRecord({ id, label: `(ephemeral) law 2 #${i}`, dir: null, ephemeral: true, owner: { kind: 'conversation', id: key }, now: CLOCK - startedAgo });
    profile.lastVerbAt = CLOCK - lastAgo; profile.verbBeforeAt = CLOCK - beforeAgo;
    return { profile,
      browser: { profileId: id, state: 'ready', pid: 4190000 + i, starttime: 1, cdpUrl: null, ns: 'vs-' + key, startedAt: CLOCK - startedAgo, idleMs: IDLE },   // a pid that names no process: its daemon is gone
      lease: { profileId: id, browserKey: key, sessionId: 'sess-law2-' + i, targetId: null, since: CLOCK - startedAgo, input: 'agent', viewers: 0, carrierLostAt: null, alias: 'ephemeral' } };
  };
  const E = [
    mk(1, KEYS[0], { startedAgo: 69e3, lastAgo: 60e3, beforeAgo: 65e3 }),        // the row's own: gone 69 s after its start, against a 15-minute idle
    mk(2, KEYS[1], { startedAgo: 7200e3, lastAgo: 1200e3, beforeAgo: 1500e3 }),  // a real idle-out: quiet 20 min (25 by the verb before)
    mk(3, KEYS[2], { startedAgo: 7200e3, lastAgo: 1e3, beforeAgo: 1800e3 }),     // takeover C3: the verb ASKING now was stamped 1 s ago; the one before, 30 min ago
  ];
  const law2 = async (Km) => {
    const dataDir = path.join(ROOT, 'law2-' + (++dirN)); fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'browser-profiles.json'), JSON.stringify({ version: 1, profiles: E.map((x) => x.profile), leases: E.map((x) => x.lease),
      browsers: Object.fromEntries(E.map((x) => [x.profile.id, x.browser])), children: {}, told: {}, pins: {} }));
    const k = Km.create({ dataDir, homeDir: ROOT, env: () => kenv, runtime: F.createBrowserRuntime({ env: kenv }), liveKeys: () => new Set(KEYS), now: () => CLOCK, install: false, log: mute, tickMs: 3600e3 });
    try {
      await k.tick();
      const rows = k.ephemerals();
      return E.map((x) => { const r = k.browserOf(x.profile.id) || {}; const row = rows.find((y) => y.profileId === x.profile.id) || {}; return { state: r.state, by: r.stoppedBy, early: r.endedEarly || null, note: r.note || '', rowEarly: row.endedEarly || null }; });
    } finally { try { k.shutdown(); } catch { /* none */ } }
  };
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const EARLY = '    const early = quietMs != null && Number(idleFor) > 0 && quietMs < Number(idleFor);';
  const BEFORE = '    const served = Math.max(Number(pe && pe.verbBeforeAt) || 0, Number(rec.startedAt) || 0);';
  if (!ksrc.includes(EARLY)) ok(false, 'the anchor of the control «B-346d law 2: the early verdict» is not in the source (src/server/browser-keeper.js)');
  if (!ksrc.includes(BEFORE)) ok(false, 'the anchor of the control «B-346d law 2: the verb before the newest» is not in the source (src/server/browser-keeper.js)');
  const Krel = ksrc.includes(EARLY) ? M.load('src/server/browser-keeper.js', editAnchor(ksrc, EARLY, '    const early = false; // the release: every gone daemon «idled out»', "src/server/browser-keeper.js"), 'law2-release') : null;
  const Knaive = ksrc.includes(BEFORE) ? M.load('src/server/browser-keeper.js', editAnchor(ksrc, BEFORE, '    const served = Math.max(Number(pe && pe.lastVerbAt) || 0, Number(rec.startedAt) || 0); // the newest verb (the asking one)', "src/server/browser-keeper.js"), 'law2-newest-verb') : null;
  const [r, rel, naive] = await Promise.all([law2(K), Krel ? law2(Krel) : null, Knaive ? law2(Knaive) : null]);
  ok(verdictOf(r.every((x) => x.state === 'stopped' && x.by === 'idle')), 'every gone daemon is recorded stopped with stoppedBy «idle» — every behaviour keyed on it unchanged (the next verb starts it again, its kept tabs reopen)', r);
  ok(gateOf(r[0].early) && r[0].early.withinMs === 65000 && r[0].early.idleMs === IDLE && gateOf(/^the browser was found gone within 65 s of a command it served, before its idle timeout of 15 min — why is not known here; the next command starts it again$/.test(r[0].note)) && gateOf(r[0].rowEarly) && r[0].rowEarly.withinMs === 65000,
    'B-346d law 2: a daemon gone 69 s after its start against a 15-minute idle is «found gone within 65 s of a command it served, before its idle timeout» — a BOUND, never when it ended — never «idled out», the cause said as unknown; the Housekeeping row carries the fact', r[0]);
  ok(!r[1].early && gateOf(/^the browser idled out \(15 min without a command\)/.test(r[1].note)) && !r[1].rowEarly, 'a daemon quiet past its idle timeout still idled out (the words as before)', r[1]);
  ok(!r[2].early && verdictOf(/^the browser idled out/.test(r[2].note)), 'takeover C3: the verb ASKING now (stamped 1 s ago, before the judge) never makes an idle-out read «found gone within 1 s» — the daemon is judged by the verb before it', r[2]);
  if (rel) ok(gateOf(/idled out/.test(rel[0].note)) && !rel[0].early, 'CONTROL (the release: every gone daemon «idled out»): the row\'s own 69 s daemon reads «idled out» — RED', rel[0]);
  if (naive) ok(gateOf(naive[2].early) && verdictOf(/found gone within 1 s of a command it served/.test(naive[2].note)), 'CONTROL (judged by the newest verb, the asking one): a real idle-out reads «found gone within 1 s of a command it served» — RED', naive[2]);
  // the kept store: 'ended' is its own word, reopened as an idle-out is (D2: an automatic stop)
  ok(gateOf(KB.STOP_WHYS.includes('ended')) && KB.stopWhyOf('ended') === 'ended' && KB.restoreKindFor('ended') === 'auto' && KB.restoreKindFor('ended') === KB.restoreKindFor('idle')
    && gateOf(/found gone before its idle timeout \(why is not known here\)/.test(KB.stopWhyWords('ended'))) && KB.stopWhyWords('idle') === 'it idled out',
    'the kept browser\'s reason: «ended» (found gone before its idle timeout, why unknown) — its tabs reopen by themselves as an idle-out\'s do; the agent\'s words say it', { why: KB.stopWhyOf('ended'), kind: KB.restoreKindFor('ended'), words: KB.stopWhyWords('ended') });
}

console.log('— ⑫ B-346d\'s RECORDER (r1228, r1311): ONE journal record at «daemon gone» — the bound both sides, its Chrome, the hub\'s own signals, the OOM counter; the recorder never gates the tick');
{
  const { anchored } = await import('./scratch.mjs');
  const { execFileSync } = require('node:child_process');
  const SLm = require('../src/server/signal-ledger.js');
  const GRm = require('../src/browser-gone-record.js');
  const CLK0 = 1795100000000, IDLE = 900000;
  const kids = [];
  const pause = (ms) => new Promise((r) => setTimeout(r, ms)); // the counter's own flight comes back in it (r1311: never awaited by the tick)
  const standIn = async (args = []) => { const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)', '--', ...args], { stdio: 'ignore' }); kids.push(c); for (let i = 0; i < 100 && F.procStart(c.pid) == null; i++) await pause(10); return c; };
  const ended = (c) => new Promise((r) => { if (c.exitCode !== null || c.signalCode !== null) return r(); c.once('exit', () => r()); try { c.kill('SIGKILL'); } catch { r(); } });
  const isEnded = async (c) => { const t0i = Date.now(); while (c.exitCode === null && c.signalCode === null && Date.now() - t0i < 5000) await pause(10); return c.exitCode !== null || c.signalCode !== null; };   // r4363: a 5 s bound; a scene names its expiry
  const evText = (n) => `low 0\nhigh 0\nmax 0\noom 0\noom_kill ${n}\n`;
  // ONE world: an ephemeral daemon (a stand-in process) seen alive by three ticks, its Chrome (a stand-in naming its user-data-dir),
  // the hub unit's counter (a stand-in memory.events: 3, then 4 before the third tick), then the daemon ENDS and the fourth tick
  // finds it gone 12 s after the last tick that saw it alive
  const recordOf = async (Km, { chromeCase = 'alive', signal = 'during', oomEnd = 4, tickAlive = true } = {}) => {
    const dataDir = path.join(ROOT, 'gone-' + (++dirN)); fs.mkdirSync(dataDir, { recursive: true });
    const chromeDir = path.join(dataDir, 'chrome-profile'); fs.mkdirSync(chromeDir, { recursive: true });
    const events = path.join(dataDir, 'memory.events'); fs.writeFileSync(events, evText(3));
    const daemon = await standIn();
    const chrome = chromeCase === 'none' ? null : await standIn([`--user-data-dir=${chromeDir}`]);
    let clk = CLK0;
    const key = 'bk-0000c4' + (0xa0 + dirN).toString(16).slice(-2), id = 'bp-' + (0x30000000 + dirN).toString(16);
    const profile = B.newProfileRecord({ id, label: '(ephemeral) recorder', dir: null, ephemeral: true, owner: { kind: 'conversation', id: key }, now: CLK0 - 60e3 });
    profile.lastVerbAt = CLK0 - 30e3; profile.verbBeforeAt = CLK0 - 40e3;
    const browser = { profileId: id, state: 'ready', pid: daemon.pid, starttime: F.procStart(daemon.pid), cdpUrl: null, ns: 'vs-' + key, startedAt: CLK0 - 60e3, idleMs: IDLE,
      ...(chrome ? { browser: { pid: chrome.pid, starttime: F.procStart(chrome.pid), dir: chromeDir } } : {}) };
    fs.writeFileSync(path.join(dataDir, 'browser-profiles.json'), JSON.stringify({ version: 1, profiles: [profile], browsers: { [id]: browser }, children: {}, told: {}, pins: {},
      leases: [{ profileId: id, browserKey: key, sessionId: 'sess-rec', targetId: null, since: CLK0 - 60e3, input: 'agent', viewers: 0, carrierLostAt: null, alias: 'ephemeral' }] }));
    const lines = [];
    const log = { log: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)), error() { }, info() { } };
    const k = Km.create({ dataDir, homeDir: ROOT, env: () => kenv, runtime: F.createBrowserRuntime({ env: kenv }), liveKeys: () => new Set([key]), now: () => clk, install: false, log, tickMs: 3600e3, oomEventsPath: events });
    let threw = null;
    try {
      const dStart = F.procStart(daemon.pid);
      if (signal === 'during') SLm.noteSignal(daemon.pid, 'the keeper: its stop', 'SIGTERM', CLK0 - 5e3, dStart);
      if (signal === 'before') SLm.noteSignal(daemon.pid, 'the keeper: its stop', 'SIGTERM', CLK0 - 120e3, dStart);   // a row from before the run (a reused pid)
      if (signal === 'other') SLm.noteSignal(daemon.pid, 'the keeper: its stop', 'SIGTERM', CLK0 - 5e3, 'another-start'); // a row whose process is not this run's
      if (tickAlive) {
        await k.tick(); await pause(40);                                     // alive at CLK0 (the counter's flight reads 3)
        clk = CLK0 + 5e3; await k.tick(); await pause(40);                   // alive (the run's first value: 3)
        fs.writeFileSync(events, evText(oomEnd)); clk = CLK0 + 10e3; await k.tick(); await pause(40); // alive (the flight reads oomEnd)
      } else fs.writeFileSync(events, evText(oomEnd));
      await ended(daemon); if (chrome && chromeCase === 'gone') await ended(chrome);   // the daemon ENDS (who or what is the record's question)
      clk = CLK0 + 22e3;
      try { await k.tick(); } catch (e) { threw = String(e && e.message); }  // the next tick finds it gone
      // r4363 (B-7e49; r4340 law 1): each wait is on its FACT and its bound's expiry is NAMED (the scene's `expired`, judged below), never a
      // silent read of whatever is there. A tick that THREW ran neither the record nor the reap (both are its own steps, and no other tick
      // comes: tickMs is an hour), so nothing more is waited for (the unfenced control paid 2 s + 2 s here for what could never come)
      const expired = [], waitFor = async (what, fact, ms) => { const t0f = Date.now(); while (!fact() && Date.now() - t0f < ms) await pause(10); if (!fact()) expired.push(what); };
      if (!threw) await waitFor('its gone record (or why none)', () => lines.some((l) => l.includes('gone record') || l.includes('could not be written')), 5000);
      const chromeEnded = chrome && chromeCase === 'alive' ? (threw ? (chrome.exitCode !== null || chrome.signalCode !== null) : await isEnded(chrome)) : null;
      if (chrome && chromeCase === 'alive' && !threw && !chromeEnded) expired.push('its Chrome ended by the reap');
      if (chromeEnded) await waitFor('the reap\'s own line', () => lines.some((l) => l.includes('ended its own orphaned browser pid')), 5000);
      const rec = k.browserOf(id) || {};
      return { expired, line: lines.find((l) => l.includes('gone record')) || '', lines, daemon: daemon.pid, chrome: chrome ? chrome.pid : null, state: rec.state, chromeEnded, threw, runs: k.recorderRuns() };
    } finally { try { k.shutdown(); } catch { /* none */ } for (const c of [daemon, chrome]) if (c) await ended(c); }
  };
  const iso = (ms) => new Date(ms).toISOString();
  const all = await recordOf(K);
  ok(gateOf(/gone record bp-/.test(all.line)) && gateOf(all.line.includes(`last seen alive ${iso(CLK0 + 10e3)} (12 s before it was found gone)`)) && verdictOf(all.line.includes(`found gone ${iso(CLK0 + 22e3)} by the tick`)),
    'B-346d recorder (a): the record says the last time a tick saw its daemon ALIVE beside the time it was found gone — a bound on both sides (12 s)', all.line);
  ok(verdictOf(all.line.includes(`its Chrome: alive (pid ${all.chrome}) when its daemon was found gone (the reap decides)`)), 'B-346d recorder (b): its Chrome OUTLIVED the daemon — said, read before the reap (which decides by its own, stricter rule)', all.line);
  ok(verdictOf(all.line.includes(`the hub's own signals: SIGTERM to its daemon (pid ${all.daemon}) by the keeper: its stop at ${iso(CLK0 - 5e3)}`)), 'B-346d recorder (c): the hub\'s own signal to that daemon during its run — what was sent, by which site, when', all.line);
  ok(verdictOf(all.line.includes(`the hub unit's OOM kills: 3 (read ${iso(CLK0)}) → 4 (read ${iso(CLK0 + 10e3)}): ROSE by 1 during its run`)), 'B-346d recorder (d): the first counter value read during the run and the last one read, each with its time — a rise said', all.line);
  ok(!/https?:|:\/\/|\bwww\./.test(all.line) && !/title/i.test(all.line), 'B-346d recorder: names and numbers only — no page address, no site name, no title', all.line);
  // r1311 (2): THE LINE IS WRITTEN WHEN ITS FACTS ARE READ — before the reap's own line; the reap's own signal to its Chrome is not one of the run's
  const iGone = all.lines.findIndex((l) => l.includes('gone record')), iReap = all.lines.findIndex((l) => l.includes('ended its own orphaned browser pid'));
  ok(iGone >= 0 && iReap > iGone && gateOf(all.chromeEnded) && !all.line.includes('its orphaned Chrome'), 'B-346d recorder (r1311 (2)): the record is written BEFORE the reap\'s own line, and the reap\'s own signal to its Chrome is never among the run\'s signals; the Chrome is still ended', { iGone, iReap, chromeEnded: all.chromeEnded });
  const [gone, none, other, early] = await Promise.all([recordOf(K, { chromeCase: 'gone', signal: 'none', oomEnd: 3 }), recordOf(K, { chromeCase: 'none', signal: 'before' }), recordOf(K, { signal: 'other' }), recordOf(K, { tickAlive: false, signal: 'none' })]);
  ok(gateOf(gone.line.includes(`its Chrome: already gone (pid ${gone.chrome})`)) && verdictOf(none.line.includes('its Chrome: none recorded for this run')), 'B-346d recorder (b): every case said — a Chrome already gone, none recorded for the run', { gone: gone.line, none: none.line });
  ok(gateOf(gone.line.includes('the hub\'s own signals: none (the ledger holds this hub process\'s notes since ')) && gateOf(none.line.includes('the hub\'s own signals: none (')) && verdictOf(none.line.includes(`the newest ${SLm.LEDGER_MAX} pids)`)),
    'B-346d recorder (c): no signal ⇒ «none», saying since when the ledger holds notes; a row noted BEFORE the run (a reused pid) is never read as this run\'s', { gone: gone.line, none: none.line });
  ok(verdictOf(other.line.includes(`SIGTERM to pid ${other.daemon} (another process by then, not its daemon)`)), 'B-346d recorder (r1311 (4)): a row whose process start is not this run\'s daemon is said as ANOTHER PROCESS — never as a signal to it', other.line);
  ok(gateOf(gone.line.includes('3 (read ')) && gateOf(gone.line.includes(': no change')) && gateOf(early.line.includes('last seen alive never by a tick')) && verdictOf(/OOM kills: not read/.test(early.line)), 'B-346d recorder (a)+(d): an unchanged counter says «no change»; a daemon gone before any tick saw it says «never by a tick», and a counter value that never came back «not read»', { gone: gone.line, early: early.line });
  ok(!all.runs.includes(all.line.match(/gone record (bp-[0-9a-f]+)/)?.[1]) && verdictOf(Array.isArray(all.runs)), 'B-346d recorder (r1311 (3)): a run found gone is forgotten (the runs no longer live are forgotten at every tick: one entry a conversation never lives for the hub\'s life)', all.runs);
  ok(GRm.memoryEventsPathFrom('0::/user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service\n') === '/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service/memory.events' && GRm.memoryEventsPathFrom('12:cpu:/x\n') === null && GRm.oomKillsFrom('oom 1\noom_kill 7\n') === 7 && GRm.oomKillsFrom('oom 1\n') === null,
    'B-346d recorder (d): the hub unit\'s memory.events path read off /proc/self/cgroup (cgroup v2 only; none ⇒ unreadable), oom_kill parsed');
  // THE LEDGER'S SITES — each notes only where the kill SUCCEEDED, with the process's start (r1311 (4))
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8'), wsrc = fs.readFileSync(path.join(REPO, 'src/server/sysinfo-wiring.js'), 'utf8');
  const n = (t, x) => t.split(x).length - 1;
  const SITES = [[ksrc, "try { process.kill(pid, 'SIGTERM'); SL.noteSignal(pid, site, 'SIGTERM', now(), starttime); }"], [ksrc, "try { process.kill(pid, 'SIGKILL'); SL.noteSignal(pid, site, 'SIGKILL', now(), starttime); }"],
    [ksrc, "try { process.kill(rec.pid, 'SIGTERM'); SL.noteSignal(rec.pid, 'the keeper: its stop', 'SIGTERM', now(), rec.starttime); }"], [ksrc, "try { process.kill(rec.pid, 'SIGKILL'); SL.noteSignal(rec.pid, 'the keeper: its stop', 'SIGKILL', now(), rec.starttime); }"]];
  // the panel's site (r1455): the kill's own try, whose catch only throws (a failed kill never reaches the note), then the note
  // in its OWN fence — only comment lines between them
  const W_KILL = "    try { process.kill(pid, 'SIG' + sig); } catch (e) {\n      if (e.code === 'ESRCH') throw new Error('no such process (already gone)');\n      if (e.code === 'EPERM') throw new Error(\"permission denied (another user's process)\");\n      throw e;\n    }\n";
  const W_NOTE = "    try { require('./signal-ledger.js').noteSignal(pid, 'the person: the process panel', 'SIG' + sig); } catch { /* the ledger is a record, never the kill's answer */ }\n";
  const wBetween = n(wsrc, W_KILL) === 1 && n(wsrc, W_NOTE) === 1 ? wsrc.slice(wsrc.indexOf(W_KILL) + W_KILL.length, wsrc.indexOf(W_NOTE)) : null;
  SITES.push([wsrc, W_KILL], [wsrc, W_NOTE]);
  ok(gateOf(SITES.every(([t, x]) => n(t, x) === 1)) && wBetween != null && verdictOf(/^(?:[ \t]*\/\/[^\n]*\n)*$/.test(wBetween)), `B-346d recorder (c): the hub's 5 signal sites each note the ONE ledger after their kill succeeded (the keeper's inside its try; the panel's after the kill's try, whose catch throws, in its OWN fence — r1455): a failed kill notes nothing`, { sites: SITES.map(([t, x]) => [x.slice(0, 50), n(t, x)]), between: wBetween });
  // r1455: A NOTE THAT FAILS NEVER SAYS A KILL THAT LANDED FAILED — a real child (sleep) killed through the panel's signalProc
  // with the ledger's noteSignal throwing ⇒ the answer is ok and the child ended by SIGTERM. CONTROL: 32554283d's line (the
  // note inside the kill's try, whose catch throws again), rebuilt by anchored() ⇒ the person is told the kill failed while
  // the child is dead — RED
  const panelKill = async (Wm) => {
    const ch = spawn('sleep', ['30'], { stdio: 'ignore' }); kids.push(ch);
    const real = SLm.noteSignal; SLm.noteSignal = () => { throw new Error('the ledger is down (planted)'); };
    let out;
    try { out = { r: await Wm.create({ getHosts: () => ({}) }).signalProc(null, ch.pid, 'TERM') }; } catch (e) { out = { err: String(e && e.message) }; } finally { SLm.noteSignal = real; }
    out.sig = (await isEnded(ch)) ? ch.signalCode : 'alive';
    return out;
  };
  const WIRING = 'src/server/sysinfo-wiring.js';
  const ownFence = await panelKill(require(path.join(REPO, WIRING)));
  ok(gateOf(ownFence.r) && ownFence.r.ok === true && !ownFence.err && ownFence.sig === 'SIGTERM', 'B-346d recorder (r1455): the panel\'s kill that LANDED answers ok while the ledger\'s note throws (the note in its own fence)', ownFence);
  const inTry = await panelKill(M.load(WIRING, anchored(wsrc, W_KILL + wsrc.slice(wsrc.indexOf(W_KILL) + W_KILL.length, wsrc.indexOf(W_NOTE)) + W_NOTE,
    "    try { process.kill(pid, 'SIG' + sig); require('./signal-ledger.js').noteSignal(pid, 'the person: the process panel', 'SIG' + sig); } catch (e) {\n      if (e.code === 'ESRCH') throw new Error('no such process (already gone)');\n      if (e.code === 'EPERM') throw new Error(\"permission denied (another user's process)\");\n      throw e;\n    }\n", // stale-pins: kept (r1455: 32554283d's line, the control's rebuilt text — gone from the product on purpose)
    'r1455 control: the note inside the kill\'s try'), 'note-in-kill-try'));
  ok(!!inTry.err && gateOf(/ledger is down/.test(inTry.err)) && inTry.sig === 'SIGTERM', 'CONTROL (r1455): 32554283d\'s line — the note inside the kill\'s try, whose catch throws again — tells the person a kill that LANDED failed — RED', inTry);
  ok(n(ksrc, 'function forgetEndedRuns() { for (const pid of [...aliveRuns.keys()]) { const r0 = reg.browsers[pid]; if (!r0 || !B.isLiveBrowser(r0)) aliveRuns.delete(pid); } }') === 1 && n(ksrc, '    refreshOom(); forgetEndedRuns();') === 1,
    'B-346d recorder (r1311 (3)): every tick forgets the runs whose record is no longer live — a stop, an idle end, a removal (the gone path forgets its own at once: judged above)');
  // r1311 THE MUST — THE RECORDER NEVER GATES THE TICK: a counter whose read never answers (a FIFO nobody writes: a held file
  // threadpool) leaves the tick free; CONTROL: the tick that awaits the read (58a5e2c02's) stays held — RED
  const heldTick = async (Km) => {
    const dataDir = path.join(ROOT, 'held-' + (++dirN)); fs.mkdirSync(dataDir, { recursive: true });
    const fifo = path.join(dataDir, 'memory.events'); execFileSync('mkfifo', [fifo]);
    const daemon = await standIn(), key = 'bk-0000c4f' + (dirN % 10), id = 'bp-' + (0x31000000 + dirN).toString(16);
    const profile = B.newProfileRecord({ id, label: '(ephemeral) held', dir: null, ephemeral: true, owner: { kind: 'conversation', id: key }, now: CLK0 - 60e3 });
    fs.writeFileSync(path.join(dataDir, 'browser-profiles.json'), JSON.stringify({ version: 1, profiles: [profile], children: {}, told: {}, pins: {},
      browsers: { [id]: { profileId: id, state: 'ready', pid: daemon.pid, starttime: F.procStart(daemon.pid), cdpUrl: null, ns: 'vs-' + key, startedAt: CLK0 - 60e3, idleMs: IDLE } },
      leases: [{ profileId: id, browserKey: key, sessionId: 'sess-held', targetId: null, since: CLK0 - 60e3, input: 'agent', viewers: 0, carrierLostAt: null, alias: 'ephemeral' }] }));
    const k = Km.create({ dataDir, homeDir: ROOT, env: () => kenv, runtime: F.createBrowserRuntime({ env: kenv }), liveKeys: () => new Set([key]), now: () => CLK0, install: false, log: { log() { }, warn() { }, error() { }, info() { } }, tickMs: 3600e3, oomEventsPath: fifo });
    let done = false;
    const t1 = k.tick().then(() => { done = true; }, () => { done = true; });
    await pause(300);   // the read is held for good: the tick is judged by whether it has ended, never by a clock
    const free = done;
    const w = fs.openSync(fifo, fs.constants.O_RDWR); fs.writeSync(w, evText(9)); fs.closeSync(w);   // release the held read (both ends ours: never blocks)
    await t1; try { k.shutdown(); } catch { /* none */ } await ended(daemon);
    return free;
  };
  const Kawait = M.load('src/server/browser-keeper.js', anchored(ksrc, '    refreshOom(); forgetEndedRuns();', '    oomSeen = { n: await readOomKills(), at: t }; forgetEndedRuns();', 'recorder: the tick awaits the counter'), 'recorder-tick-awaits');
  const [freeNow, freeCtl] = [await heldTick(K), await heldTick(Kawait)];
  ok(freeNow === true, 'B-346d recorder (r1311 THE MUST): a counter whose read never answers (a FIFO nobody writes — a held file threadpool) leaves the tick FREE: the read is its own flight', freeNow);
  ok(freeCtl === false, 'CONTROL (the tick that awaits the counter, as 58a5e2c02 did): the same held read holds the tick — RED', freeCtl);
  // RED CONTROLS — each field taken out of a copy of the keeper (anchored(): each anchor found once, else the control throws by name)
  const cut = (anchor, to, name) => M.load('src/server/browser-keeper.js', anchored(ksrc, anchor, to, name), name.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
  const FENCE_CALL = "    try { goneRecord(rec, seenBy); } catch (e) { try { log.warn?.(`[browser] ${rec.profileId}: its gone record could not be written (${e && e.message}) — the stop and the reap go on`); } catch { /* the journal's own failure */ } } // B-346d's recorder, FENCED (r1311 (1)): its facts read BEFORE the hub ends its Chrome\n";
  const THROW = ['  function goneRecord(rec, seenBy) {\n', "  function goneRecord(rec, seenBy) {\n    throw new Error('planted: the recorder throws');\n"];
  const throwing = anchored(ksrc, THROW[0], THROW[1], 'recorder (1) a planted throw');
  const unfenced = anchored(throwing, FENCE_CALL, '    goneRecord(rec, seenBy);\n', 'recorder (1) the fence taken away', { count: 2 });
  const afterReap = anchored(ksrc, FENCE_CALL + "    reapOrphan(rec, seenBy); // verify r2 M1:", "    { const snap = rec.browser; reapOrphan(rec, seenBy).then(() => { rec.browser = snap; try { goneRecord(rec, seenBy); } finally { rec.browser = null; } }); } // verify r2 M1:", 'recorder (2) the facts read after the reap');
  const [ca, cb, cc, fenced, bare, late] = await Promise.all([
    recordOf(cut('      if (isLocalRec(rec)) { try { aliveSeen(rec, t); } catch { /* the recorder never stops the tick (r1311 (1)) */ } } // B-346d\'s recorder (a): this tick saw its daemon alive\n', '', 'recorder (a) no alive stamp')),
    recordOf(cut("    const chrome = !b ? { state: 'none' } :", "    const chrome = { state: 'none' }; const chromeRead = !b ? { state: 'none' } :", 'recorder (b) the Chrome never said')),
    recordOf(cut("    const signals = [...SL.signalsTo(", "    const signals = [] || [...SL.signalsTo(", 'recorder (c) no ledger')),
    recordOf(M.load('src/server/browser-keeper.js', throwing, 'recorder-throws-fenced')),
    recordOf(M.load('src/server/browser-keeper.js', unfenced, 'recorder-throws-unfenced')),
    recordOf(M.load('src/server/browser-keeper.js', afterReap, 'recorder-after-reap')),
  ]);
  for (const [n, x] of [['recorder (a) all', all], ['gone', gone], ['none', none], ['other', other], ['early', early], ['CONTROL (a)', ca], ['CONTROL (b)', cb], ['CONTROL (c)', cc], ['fenced', fenced], ['CONTROL (2) late', late]]) if (x && x.expired && x.expired.length) ok(false, `HARNESS (⑫ ${n}): ${x.expired.join(', ')} did not come within its bound — its leg is not judged on it`, x.expired);
  ok(verdictOf(ca.line.includes('last seen alive never by a tick')), 'CONTROL (a): a keeper whose tick does not stamp «seen alive» says «never by a tick» of a daemon a tick saw — RED', ca.line);
  ok(gateOf(cb.line.includes('its Chrome: none recorded for this run')) && !cb.line.includes('alive (pid'), 'CONTROL (b): a record that never reads the Chrome says «none recorded» of a Chrome that outlived its daemon — RED', cb.line);
  ok(verdictOf(cc.line.includes('the hub\'s own signals: none (')), 'CONTROL (c): a record that never reads the ledger says «none» of a daemon the hub signalled — RED', cc.line);
  ok(fenced.state === 'stopped' && fenced.chromeEnded === true && !fenced.threw && verdictOf(fenced.lines.some((l) => l.includes('its gone record could not be written (planted: the recorder throws)'))),
    'B-346d recorder (r1311 (1)): a recorder that THROWS is fenced — the daemon is still marked gone (stopped), its Chrome still ended, the tick goes on, the journal says why no record was written', { state: fenced.state, chromeEnded: fenced.chromeEnded, threw: fenced.threw });
  ok(!!bare.threw || bare.chromeEnded === false, 'CONTROL (1): the same throw with the fence taken away stops the tick before the reap — the Chrome is NOT ended — RED', { threw: bare.threw, chromeEnded: bare.chromeEnded });
  ok(verdictOf(late.line.includes('by the keeper: its orphaned Chrome')) || late.lines.findIndex((l) => l.includes('gone record')) > late.lines.findIndex((l) => l.includes('ended its own orphaned browser pid')), 'CONTROL (2): facts read AFTER the reap carry the reap\'s own signal to its Chrome as the run\'s, written after the reap\'s line — RED', late.line);
  for (const c of kids) await ended(c);
}
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
