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
//   ③ L4 PROGRESS PERSISTS: the registry file on disk loses one record per step; a keeper booted over a copy taken mid-sweep
//      (a restart there) retires exactly the records that were left.
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
function registry(N, { live = false, extra = [] } = {}) {
  const dataDir = path.join(ROOT, 'd' + (++dirN)); fs.mkdirSync(dataDir, { recursive: true });
  const profiles = [], browsers = {};
  for (let i = 1; i <= N; i++) {
    const id = 'bp-' + (0x10000000 + i).toString(16), key = `${PARENT}.${i}`;
    profiles.push(B.newProfileRecord({ id, label: `(ephemeral) Chat child ${i}`, dir: null, ephemeral: true, owner: { kind: 'conversation', id: key }, now: 1790000000000 }));
    browsers[id] = live ? { profileId: id, state: 'ready', pid: 4100000 + i, starttime: 1, cdpUrl: null, ns: 'vs-' + key, startedAt: 1790000000000 }
      : { profileId: id, state: 'stopped', pid: null, starttime: null, cdpUrl: null, ns: 'vs-' + key, startedAt: 1790000000000, endedAt: 1790000001000, stoppedBy: 'idle', lastError: null };
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
async function sweep(Km, dataDir, { how = 'reconcile', onRemoved = null } = {}) {
  let turn = 0, running = true;
  const ticker = () => { turn++; if (running) setImmediate(ticker); };
  setImmediate(ticker);
  const perTurn = new Map(); const removed = [];
  const line = (m) => { const s = String(m); if (/ephemeral browser record \S+ .* removed with its conversation/.test(s)) { removed.push(s); perTurn.set(turn, (perTurn.get(turn) || 0) + 1); stall(STALL_MS); if (onRemoved) onRemoved(removed.length); } };
  const closes = [];
  const execFileImpl = (bin, args, opts, cb) => { if (Array.isArray(args) && args[0] === 'close') { closes.push(args.join(' ')); if (closeHook) closeHook(opts); } const c = typeof opts === 'function' ? opts : cb; setImmediate(() => c(null, '{"success":true,"data":{}}', '')); return { on() { }, kill() { } }; };
  const k = Km.create({ dataDir, homeDir: ROOT, env: () => kenv, runtime: F.createBrowserRuntime({ env: kenv, execFileImpl }), liveKeys: () => new Set(), install: false, log: { log: line, warn: line, error: line, info: line }, tickMs: 3600e3 });
  let maxLate = 0, last = performance.now();
  const iv = setInterval(() => { const t = performance.now(); maxLate = Math.max(maxLate, t - last - 5); last = t; }, 5);
  try {
    if (how === 'boot') await k.boot();
    else if (how === 'tick') await k.tick();
    else { const r = k.reconcile({ graceMs: 0 }); await r.retired; }
    await new Promise((res) => setTimeout(res, 12));   // the timer fires once more: a hold that ran to the end is read too
  } finally { running = false; clearInterval(iv); try { k.shutdown(); } catch { /* none */ } }
  return { perTurnMax: Math.max(0, ...perTurn.values()), turnsWithRemovals: perTurn.size, removed: removed.length, closes: closes.length, lateEvidenceMs: Math.round(maxLate), left: onDisk(dataDir), k };
}
let closeHook = null;

const { mutantCopies } = await import('./mutant-copy.mjs');
const M = mutantCopies('keeper-sweep-yields', REPO);
const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');

console.log('— ① L1: the orphan sweep takes ONE record per loop turn, whatever the count (a stall placed in each removal)');
{
  for (const N of [50, 300]) {
    const s = await sweep(K, registry(N));
    ok(s.removed === N && s.left === 0 && s.perTurnMax === 1 && s.turnsWithRemovals === N, `reconcile, ${N} orphan records: all removed, ONE per loop turn (the most in one turn: ${s.perTurnMax}; the stall placed per record ${STALL_MS} ms — evidence, a 5 ms timer's worst lateness ${s.lateEvidenceMs} ms)`, { removed: s.removed, left: s.left, perTurnMax: s.perTurnMax, turns: s.turnsWithRemovals });
  }
  const sb = await sweep(K, registry(300), { how: 'boot' });
  ok(sb.removed === 300 && sb.left === 0 && sb.perTurnMax === 1, `boot, 300 orphan records: all removed, one per loop turn (most in one turn ${sb.perTurnMax}; lateness evidence ${sb.lateEvidenceMs} ms)`, { removed: sb.removed, perTurnMax: sb.perTurnMax });
  const st = await sweep(K, registry(300), { how: 'tick' });
  ok(st.removed === 300 && st.left === 0 && st.perTurnMax === 1, `the tick (the runtime half), 300 orphan records: all removed, one per loop turn (most in one turn ${st.perTurnMax}; lateness evidence ${st.lateEvidenceMs} ms)`, { removed: st.removed, perTurnMax: st.perTurnMax });
  // MUTANT: the yield removed (the steps run back to back inside one turn)
  const noYield = ksrc.replace('      await yieldLoop();\n      if (reg.leases.some((l) => l.profileId === id))', '      if (reg.leases.some((l) => l.profileId === id))');
  ok(noYield !== ksrc, 'MUTANT (the yield removed): the patch applies');
  if (noYield !== ksrc) {
    const Kn = M.load('src/server/browser-keeper.js', noYield, 'no-yield');
    const sm = await sweep(Kn, registry(300));
    ok(sm.removed === 300 && sm.perTurnMax > 1, `MUTANT (the yield removed) is RED on the law: ${sm.perTurnMax} records retired in one loop turn (lateness evidence ${sm.lateEvidenceMs} ms)`, { perTurnMax: sm.perTurnMax });
  }
}

console.log('— ② L2: a record whose daemon is GONE starts no browser-CLI child; a daemon that runs is still closed');
{
  const s = await sweep(K, registry(300, { live: true }));
  ok(s.removed === 300 && s.left === 0 && s.closes === 0, `300 records left \`ready\` whose daemon is gone: every one removed, browser-CLI \`close\` starts: ${s.closes} (one per record would fork the hub ${300} times)`, { removed: s.removed, closes: s.closes, left: s.left });
  // CONTROL: a daemon that RUNS — a process of this test, its start time recorded as the keeper records one
  const proc = spawn('sleep', ['30'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 50));
  const st = F.procStart(proc.pid);
  const id = 'bp-1fffffff', key = `${PARENT}.999`;
  const extra = [{ profile: B.newProfileRecord({ id, label: '(ephemeral) Chat child live', dir: null, ephemeral: true, owner: { kind: 'conversation', id: key }, now: 1790000000000 }), browser: { profileId: id, state: 'ready', pid: proc.pid, starttime: st, cdpUrl: null, ns: 'vs-' + key, startedAt: 1790000000000 } }];
  closeHook = () => { try { process.kill(proc.pid, 'SIGTERM'); } catch { /* gone */ } };   // the CLI's own close ends its daemon
  const c = await sweep(K, registry(3, { live: true, extra }));
  closeHook = null;
  const procGone = await new Promise((r) => { if (proc.exitCode !== null || proc.signalCode) return r(true); proc.once('exit', () => r(true)); setTimeout(() => r(false), 2000); });
  ok(st != null && c.removed === 4 && c.closes === 1 && procGone, `CONTROL: beside 3 gone daemons, ONE whose daemon runs (pid ${proc.pid}, its start time recorded) is still closed by the browser CLI — 1 start in all — and ended; all 4 records removed`, { st, removed: c.removed, closes: c.closes, procGone });
  try { proc.kill('SIGKILL'); } catch { /* gone */ }
  // MUTANT: the gone-daemon judgment removed (every live-looking record goes to the CLI's close)
  const noJudge = ksrc.replace("        if (B.isLiveBrowser(rec0) && isLocalRec(rec0) && !starting.has(profileId) && !stopping.has(profileId) && daemonGone(rec0)) {", '        if (false) {');
  ok(noJudge !== ksrc, 'MUTANT (the gone-daemon judgment removed): the patch applies');
  if (noJudge !== ksrc) {
    const Kj = M.load('src/server/browser-keeper.js', noJudge, 'no-judge');
    const sj = await sweep(Kj, registry(300, { live: true }));
    ok(sj.closes === 300, `MUTANT (the gone-daemon judgment removed) is RED on the law: ${sj.closes} browser-CLI starts for 300 records whose daemons are gone`, { closes: sj.closes });
  }
}

console.log('— ③ L4: progress persists — a restart mid-sweep resumes with exactly the records left');
{
  const dataDir = registry(120);
  const mid = path.join(ROOT, 'mid'); fs.mkdirSync(mid, { recursive: true });
  const seen = [];
  const s = await sweep(K, dataDir, { onRemoved: (n) => { seen.push([n, onDisk(dataDir)]); if (n === 40) fs.copyFileSync(path.join(dataDir, 'browser-profiles.json'), path.join(mid, 'browser-profiles.json')); } });
  ok(s.removed === 120 && seen.every(([n, d]) => d === 120 - n), 'each removal is on disk when its journal line is written (the file loses one record per step)', seen.filter(([n, d]) => d !== 120 - n).slice(0, 4));
  const left = onDisk(mid);
  const r = await sweep(K, mid, { how: 'boot' });
  ok(left === 80 && r.removed === 80 && r.left === 0, `a keeper booted over the registry as it stood after 40 removals (a restart there): ${left} records left, and its boot sweep retires exactly those ${r.removed}`, { left, removed: r.removed });
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
