'use strict';
/**
 * THE SYNC FS WITNESS + THE MOUNT GUARD (lane hub-fuse-sync-guard — the hold of 2026-10-23 21:56–22:02 PT).
 *
 * The production hub answered nothing for 6.5 min. Its MAIN thread sat in the kernel's FUSE wait (request_wait_answer)
 * inside a synchronous fs call into the NAS / OneDrive rclone mounts that three orphaned `bfs` walks of `/` were
 * crawling. The canary had said a minute earlier «no sync fs call over 20 ms in that window» — the call was outside the
 * 18 calls loop-blame wrapped — and it said NOTHING after the hold (no probe was in flight; nothing has a post-mortem).
 * Two laws, one module (installed by src/server/boot-trace.js start(), server.js's 6th line — before any module holds
 * a reference to an fs function — through loop-blame's ONE wrapper over every synchronous call of the fs module):
 *
 *   THE WITNESS — a held loop names the call that held it, with its path and its mount.
 *     · ONE in-flight slot {fn, path, startedAt, root} (sync calls cannot interleave on one thread), mirrored into a
 *       SharedArrayBuffer a watchdog THREAD reads (src/server/sync-fs-witness-worker.js): a call still in flight past
 *       LIVE_MS is named in the journal WHILE it holds — with the kernel's wchan and syscall of the main thread — and a
 *       loop held outside any sync fs call is said to be so (CPU, a child, a native call). A hold that never ends is
 *       still named.
 *     · a ring of the last RING_KEEP calls over RING_MS (fn, path, ms, the src/ caller; the hub frames of the stack only
 *       for a path the classifier calls `mount` — cheap because rare). A call ≥ HELD_MS hands itself to onHeld at its
 *       return (the canary words it: src/server/fs-canary.js held()); the canary's late probe asks heldIn(from, to).
 *   THE GUARD — the main thread never waits on a storage mount.
 *     · before the syscall, a call whose path is under a STORAGE root (src/mount-path-class.js: a product storage row,
 *       any FUSE / SMB / WebDAV mount — never the mount the instance itself lives on) is REFUSED: it throws
 *       `EVSMOUNTSYNC` {path, mount}; the journal says it ONCE per call site (the src/ frame) with the door to take
 *       (SafeFs or async fs); telemetry counts it (⚙ Diagnostics). `mounts.mainThreadSyncGuard` = false turns the
 *       refusal into a journal line for a person who hits a false refusal; the witness stays on regardless.
 *     · the main-module evaluation (before the first loop turn) is witnessed, never refused: a throw there would stop
 *       the boot on every restart — the boot's own law (kb-design-lessons §19) keeps sync work out of it.
 * The roots are re-read every ROOTS_EVERY_MS and on refresh() (the mounts registry changed): procfs never hangs.
 *
 * LANE HUB-LOOP-STALLS — THE HOLD IS NAMED: the beat is every BEAT_MS (ONE unref'd timer; its first bump at the first loop
 * turn, so the boot — no beat yet — is a hold timed from the process's start) and carries the flags the watchdog thread
 * reads (sampling on by `telemetry.loopHoldSampling`, a debugger port open ⇒ the sampler stands down, said once). The
 * watchdog thread names the hold (src/server/sync-fs-witness-worker.js) and hands its facts back at the resume; the book
 * (src/server/loop-holds.js) adds the collections, the memory and the utilization and writes the [loop-hold] line.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const MPC = require('../mount-path-class.js');
const SP = require('../storage-path.js');
const LB = require('./loop-blame.js');
const LH = require('../loop-hold.js');
const TS = require('../timed-sync.js'); // lane ledger-dedup-law r8: the store a call is made for, armed before it (timedSync)

const RING_KEEP = 32;
const RING_MS = 50;
const HELD_MS = 1000;
const EPISODE_MS = 5000;
const LIVE_MS = 10000;
const ROOTS_EVERY_MS = 30000;
const FD_PATHS_MAX = 4096;
const STACK_FRAMES = 6;
const SETTING = 'mounts.mainThreadSyncGuard';
const TWO_PATH = new Set(['renameSync', 'copyFileSync', 'cpSync', 'linkSync', 'symlinkSync']);
const FD_FNS = new Set(['readSync', 'writeSync', 'closeSync', 'fstatSync', 'fsyncSync', 'fdatasyncSync', 'ftruncateSync', 'futimesSync', 'fchmodSync', 'fchownSync', 'readvSync', 'writevSync']);
const REFUSAL = 'refused: a synchronous fs call on a storage mount from the main thread';

// the live slot's SharedArrayBuffer: Int32 [0 seq, 1 fn index, 2 path bytes, 3 heartbeat, 4 in flight, 5 store index + 1,
// 6 flags (1 sampling on, 2 a debugger port open, 4 heap used past PROFILE_HEAP_SHARE of its limit, 8 the setting KNOWN
// — all read HERE, on the main thread: inspector.url() in a worker is always undefined), 7 the watchdog's acknowledgement
// of the largest beat gap] · Float64 [startedAt, the last beat's time, the main thread's OWN largest beat gap since the
// watchdog last acknowledged (a hold exists only when the main thread's own beats say so)] · path
const SLOT_INTS = 8, SLOT_FLOATS = 3, SLOT_PATH = 1024;
const FLAG_SAMPLING = 1, FLAG_DEBUGGER = 2, FLAG_HEAP_HIGH = 4, FLAG_KNOWN = 8;
const NOTE_BYTES = 16 * 1024, PROFILE_BYTES = 64 * 1024, GAPS = 16;
/** EVERY LENGTH FROM A CLOCK THAT CANNOT STEP: the process's monotonic clock (uv_hrtime — the SAME clock on the watchdog
 *  thread); the wall clock only dates a hold when it is said (lane hub-loop-stalls round 3: a +2 s step of the date with an
 *  idle loop was a 2 s «hold»). */
const mono = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
const slotBytes = () => SLOT_INTS * 4 + SLOT_FLOATS * 8 + SLOT_PATH;
const SAMPLING_SETTING = 'telemetry.loopHoldSampling';
/** a debugger port this process opened (--inspect, SIGUSR1) — the sampler never interrupts a person's debugger */
let inspectorMod;   // required once (a build without an inspector ⇒ null: no debugger port can be open)
const debuggerOpen = () => { if (inspectorMod === undefined) { try { inspectorMod = require('inspector'); } catch { inspectorMod = null; } } try { return !!(inspectorMod && inspectorMod.url()); } catch { return false; } };

const hubFrames = (stack, root, k = STACK_FRAMES) => String(stack || '').split('\n').slice(1)
  .filter((l) => !/loop-blame\.js|sync-fs-witness\.js/.test(l) && (!root || l.includes(root)) && !l.includes('node_modules'))
  .slice(0, k).map((l) => l.trim().replace(/^at /, '').replace(root ? root + '/' : '\0', ''));

/** PURE: the words of a hold — «{fn}({path}) {ms} ms, under storage mount «…» ← caller». */
function callWords(e) {
  if (!e) return '';
  const where = !e.mount ? 'not under a mount'
    : e.mount.kind === 'storage' ? `under storage mount «${e.mount.root}»`
    : e.mount.kind === 'home' ? `under the network mount «${e.mount.root}» this instance lives on (witnessed, never refused)`
    : `under the network mount «${e.mount.root}» (witnessed, never refused)`;
  return `${e.fn}(${e.path})${e.store ? ` (${e.store})` : ''} ${e.ms} ms${e.failed ? ' (it failed)' : ''}, ${where}${e.caller ? ` ← ${e.caller}` : ''}`;
}
/** PURE: the canary's line for a held loop. */
function heldLine(loopMs, e) {
  return `[canary] the main loop was held ${Math.round(loopMs)} ms — the sync fs call that returned as it resumed: ${callWords(e)}`;
}

function guardError(fn, p, root) {
  return Object.assign(new Error(REFUSAL), { code: 'EVSMOUNTSYNC', path: String(p), mount: root.root, mountName: root.name || null, syscall: fn });
}

/**
 * The witness of THIS process's main thread (one; a second create answers the first unless `fresh`).
 * `registry()` → the product's storage rows [{ mountpoint, name, id }]; `guardOn()` → the setting (default ON);
 * `record(ev)` → telemetry; `onHeld(entry)` → who words a hold (default: the journal, heldLine).
 */
let one = null;
function create({ rootDir = null, dataDir = null, home = os.homedir(), cwd = process.cwd(), log = console, record = () => {},
  readMountinfo = () => fs.readFileSync('/proc/self/mountinfo', 'utf8'), registry = () => [], guardOn = () => true,
  now = mono, armed = null, live = true, liveMs = LIVE_MS, ringMs = RING_MS, heldMs = HELD_MS, fresh = false,
  beatMs = LH.BEAT_MS, holdMs = LH.HOLD_MS, noAnswerMs = LH.NO_ANSWER_MS, capPerHour = LH.CAP_PER_HOUR, samplesPerHold = LH.SAMPLES_PER_HOLD,
  samplingOn = () => true, holdsOptions = {}, profileEveryMs = LH.PROFILE_EVERY_MS, heapStats = () => { const v8 = require('v8'), f = LH.heapFillOf({ stats: v8.getHeapStatistics(), spaces: v8.getHeapSpaceStatistics(), argv: LH.nodeArgv(), nodeMajor: Number(process.versions.node.split('.')[0]) }); return { used_heap_size: f.used, heap_size_limit: f.limit }; }, procRoot = '/proc' } = {}) {
  if (one && !fresh) return one;
  let roots = [], busy = false, cur = null, isArmed = armed === null ? false : !!armed;
  const ring = [], fdPaths = new Map(), saidSites = new Map();
  const counts = { refused: 0, allowed: 0, held: 0, heldOnMount: 0, slow: 0, rootsRead: 0 };
  let onHeld = (e) => { try { log.warn?.(heldLine(e.ms, e)); } catch { } };
  let CTX = { mountRoots: roots, rootDir, dataDir, home, cwd };   // rebuilt at every refresh (rootOf caches its buckets per roots array)
  // THE HOT CASE in one compare: a path in the instance's own tree (its stores, its checkout) is never a mount path
  const OWN = [rootDir, dataDir].filter((d) => typeof d === 'string' && d[0] === '/' && d.length > 1).map((d) => d.replace(/\/+$/, '') + '/');
  const ownPath = (p) => typeof p === 'string' && p.indexOf('/..') < 0 && OWN.some((o) => p.startsWith(o));

  function refresh() {
    let mounts = [], reg = [];
    try { mounts = MPC.parseMountinfo(readMountinfo()); } catch { }
    try { reg = registry() || []; } catch { }
    roots = MPC.rootsOf({ mounts, registry: reg, rootDir, dataDir });
    CTX = { mountRoots: roots, rootDir, dataDir, home, cwd };
    SP.setRoots(roots, { rootDir, dataDir, home, cwd });   // every module's answer (src/storage-path.js)
    counts.rootsRead++;
    return roots;
  }

  // the live slot, mirrored for the watchdog thread
  const sab = new SharedArrayBuffer(slotBytes());
  const I = new Int32Array(sab, 0, SLOT_INTS), T = new Float64Array(sab, SLOT_INTS * 4, SLOT_FLOATS), P = new Uint8Array(sab, SLOT_INTS * 4 + SLOT_FLOATS * 8, SLOT_PATH);
  const FNS = [...LB.SYNC_FNS, 'realpathSync.native', 'Dir.readSync'];
  const fnIndex = new Map(FNS.map((f, i) => [f, i]));
  const enc = new TextEncoder();
  const bump = (k) => Atomics.store(I, k, I[k] + 1);   // this thread is the slot's ONE writer (a seqlock: odd = being written)
  const storeIndex = new Map(TS.NAMES.map((n, i) => [n, i]));
  const liveBegin = (fn, p, store) => {
    bump(0);
    I[1] = fnIndex.has(fn) ? fnIndex.get(fn) : -1;
    I[2] = typeof p === 'string' ? enc.encodeInto(p, P).written : 0;
    I[5] = store && storeIndex.has(store) ? storeIndex.get(store) + 1 : 0;
    T[0] = now();
    bump(0);
    Atomics.store(I, 4, 1);
  };
  const liveEnd = () => { Atomics.store(I, 4, 0); };

  const pathsOf = (fn, args, self) => {
    if (fn.startsWith('Dir.')) return self && typeof self.path === 'string' ? [self.path] : [];
    const a0 = args[0];
    if (FD_FNS.has(fn) || typeof a0 === 'number') { const p = fdPaths.get(a0); return p ? [p] : []; }
    return TWO_PATH.has(fn) ? [a0, args[1]] : [a0];
  };
  const shown = (p) => (typeof p === 'string' ? p : LB.pathOf(p));
  const siteOf = () => LB.callerOf(new Error().stack, rootDir) || '(not the hub\'s own code)';
  const sayOnce = (key, line) => { const n = saidSites.get(key) || 0; saidSites.set(key, n + 1); if (!n) { try { log.warn?.(line); } catch { } } };

  const hook = {
    before(fn, args, self) {
      if (busy) return;
      busy = true;
      let refusal = null;
      try {   // nothing here may break an fs call: only the deliberate refusal leaves this hook
        let hit = null, hp = null;
        for (const p of pathsOf(fn, args, self)) {
          if (ownPath(p)) continue;
          const r = MPC.rootOf(p, CTX);
          if (r && (!hit || (r.kind === 'storage' && hit.kind !== 'storage'))) { hit = r; hp = p; }
        }
        const p0 = hp !== null ? hp : pathsOf(fn, args, self)[0];
        cur = { fn, path: shown(p0), root: hit, store: TS.armed() };
        liveBegin(fn, cur.path, cur.store);
        if (!hit || hit.kind !== 'storage' || !isArmed) return;
        const site = siteOf();
        const mount = hit.root;   // the mount point names the storage (never a record's own name in a journal line)
        let on = true;
        try { on = guardOn() !== false; } catch { }
        if (on) {
          counts.refused++;
          try { record({ kind: 'event', name: 'srv-mount-guard-refused', detail: fn }); } catch { }
          sayOnce(`refused ${site}`, `[mount-guard] ${fn}(${cur.path}) from ${site} refused — use SafeFs/async; the mount «${mount}»`);
          liveEnd(); cur = null;
          refusal = guardError(fn, p0, hit);
          return;
        }
        counts.allowed++;
        try { record({ kind: 'event', name: 'srv-mount-guard-allowed', detail: fn }); } catch { }
        sayOnce(`allowed ${site}`, `[mount-guard] ${fn}(${cur.path}) from ${site} ran on the mount «${mount}» — ${SETTING} is off (log only); use SafeFs/async`);
      } catch { /* a witness fault never reaches the caller: the call runs unwitnessed */ }
      finally {
        busy = false;
        if (refusal) throw refusal;   // eslint-disable-line no-unsafe-finally — THE refusal, before any syscall
      }
    },
    after(fn, args, ms, at, r, failed, self) {
      if (busy) return;
      busy = true;
      try {
        liveEnd();
        const c = cur; cur = null;
        if (fn === 'openSync' && !failed && typeof r === 'number' && c && typeof c.path === 'string') {
          if (fdPaths.size >= FD_PATHS_MAX) fdPaths.delete(fdPaths.keys().next().value);
          fdPaths.set(r, c.path);
        } else if (fn === 'closeSync') fdPaths.delete(args[0]);
        if (ms < ringMs) return;
        counts.slow++;
        const stack = new Error().stack;
        const mount = c && c.root ? { root: c.root.root, name: c.root.name || null, kind: c.root.kind, id: c.root.id || null } : null;
        const e = { fn, path: c ? c.path : shown(args[0]), ...(c && c.store ? { store: c.store } : {}), ms: Math.round(ms), at, failed: !!failed, class: mount ? 'mount' : 'local', mount,
          caller: LB.callerOf(stack, rootDir), stack: mount ? hubFrames(stack, rootDir) : null, said: false };
        ring.push(e); if (ring.length > RING_KEEP) ring.splice(0, ring.length - RING_KEEP);
        if (ms >= heldMs) {
          counts.held++; if (mount) counts.heldOnMount++;
          setImmediate(() => { if (!e.said) { e.said = true; try { onHeld(e); } catch { } } });
        }
      } finally { busy = false; }
    },
  };

  /** The longest witnessed call overlapping [fromMs, toMs] (wall clock), or null. */
  function heldIn(fromMs, toMs) {
    let best = null;
    for (const e of ring) if (e.at + e.ms >= fromMs && e.at <= toMs && (!best || e.ms > best.ms)) best = e;
    return best;
  }

  let timer = null, beat = null, worker = null, holds = null, dbgSaid = false, beats = 0, heapHigh = false, started = false, workerGone = false, inBeat = false;
  // the main thread's side of the sample (src/loop-hold.js HOOK_KEY), installed ONCE here: `dbg()` (a debugger port open
  // NOW — the sample checks it on the main thread, also inside a hold the beat cannot see), `note(out)` (THE way an answer
  // leaves: the watchdog closed its session as it posted), `z` (the sample's ENTERED cell + the beat count then — plain
  // stores, no call) and `b` (this slot: the beat count at I[3])
  // the note slot: [seqlock, count, bytes, beat (−1 = written inside the beat itself), ENTERED, beat at entry, -, -] +
  // the monotonic time of the sample's first instruction + the bytes; THIS thread is its ONE writer, one sample at a time (the watchdog keeps ONE ask
  // in flight; a sample never runs inside another — the inspector drains its queue one message after another)
  const noteSab = new SharedArrayBuffer(40 + NOTE_BYTES), NI = new Int32Array(noteSab, 0, 8), NF = new Float64Array(noteSab, 32, 1), NB = new Uint8Array(noteSab, 40);
  const Z = new Int32Array(noteSab, 16, 2);
  const profileSab = new SharedArrayBuffer(16 + PROFILE_BYTES), PI = new Int32Array(profileSab, 0, 4), PB = new Uint8Array(profileSab, 16);
  // THE MAIN THREAD'S OWN GAPS ≥ hold − beat, a ring the beat writes ([count] + {end, gap} pairs): the watchdog reads every
  // one however late it runs — a hold it could not watch is dated at the beat that ended it, and a seen hold's range is its own gap's
  const gapSab = new SharedArrayBuffer(8 + 16 * GAPS), GI = new Int32Array(gapSab, 0, 2), GF = new Float64Array(gapSab, 8, 2 * GAPS);
  // `t0` = the sample's OWN FIRST INSTRUCTION (its `H.now()` before anything else): the watchdog judges by it whether the
  // thread answered at JavaScript speed (round 4 — the note's own time came after the stack was built)
  const note = (out, t0) => {
    if (typeof out !== 'string') return;
    const w0 = NI[0];
    Atomics.store(NI, 0, w0 + 1);   // odd = being written
    try {
      NI[2] = enc.encodeInto(out.length > NOTE_BYTES / 4 ? out.slice(0, NOTE_BYTES / 4) : out, NB).written;
      NI[3] = inBeat ? -1 : I[3]; NF[0] = typeof t0 === 'number' && t0 >= 0 ? t0 : mono(); NI[1] = NI[1] + 1;
    } catch { } finally { Atomics.store(NI, 0, w0 + 2); }   // ALWAYS even again (a throw inside leaves no odd slot behind)
    try { Atomics.notify(NI, 1); } catch { }
  };
  const hookObject = Object.freeze({ dbg: () => debuggerOpen() === true, note, now: mono, z: Z, b: I });
  let profSeen = 0;
  /** the profile's result the watchdog wrote into the shared slot — read only when someone asks (the end costs nothing) */
  function readProfile() {
    const s1 = Atomics.load(PI, 0);
    if (s1 % 2 || PI[1] === profSeen) return null;
    const seq = PI[1], len = Math.min(PB.length, Math.max(0, PI[2]));
    let r = null; try { r = JSON.parse(new TextDecoder().decode(PB.slice(0, len))); } catch { r = null; }
    if (Atomics.load(PI, 0) !== s1) return null;
    profSeen = seq;
    return r;
  }
  /** the flags (the setting read here, before anything may be asked: null / a throw = NOT known ⇒ nothing is asked) */
  function writeFlags() {
    let flags = 0, on = null;
    try { on = samplingOn(); } catch { on = null; }
    if (on === true || on === false) flags |= FLAG_KNOWN;
    if (on === true) flags |= FLAG_SAMPLING;
    if (debuggerOpen()) {
      flags |= FLAG_DEBUGGER;
      if (!dbgSaid) { dbgSaid = true; try { log.warn?.('[loop-hold] a debugger port is open — the hold sampler stands down while it is (holds are still measured and said)'); } catch { } }
    } else dbgSaid = false;
    if (beats++ % 4 === 0) { try { const h = heapStats(); heapHigh = h.used_heap_size >= LH.PROFILE_HEAP_SHARE * h.heap_size_limit; } catch { } }   // every 4th beat (a second)
    if (heapHigh) flags |= FLAG_HEAP_HIGH;
    Atomics.store(I, 6, flags);
  }
  /** ONE beat: the flags, the main thread's OWN beat gap (into the ring when it could be a hold), its time, the counter */
  function beatOnce() {
    inBeat = true;
    try {
      writeFlags();
      const t = now(), g = T[1] ? t - T[1] : 0;
      // ONLY a hold enters the ring (the one bar, src/loop-hold.js isGapHold): a gap that is not one never evicts one
      if (LH.isGapHold(g, beatMs, holdMs)) { const k = GI[0] % GAPS; GF[2 * k] = t; GF[2 * k + 1] = g; Atomics.store(GI, 0, GI[0] + 1); }   // before the beat moves
      T[1] = t; bump(3);
    } finally { inBeat = false; }
  }
  function start({ installHook = true } = {}) {
    refresh();
    if (installHook) LB.setHook(hook);
    if (armed === null) setImmediate(() => { isArmed = true; }); // the first loop turn: the main-module evaluation is over
    timer = setInterval(refresh, ROOTS_EVERY_MS); timer.unref?.();
    if (live) {
      try { Object.defineProperty(globalThis, LH.HOOK_KEY, { value: hookObject, configurable: true, enumerable: false, writable: false }); } catch { }
      try {
        const st = () => { const f = Atomics.load(I, 6); return { known: (f & FLAG_KNOWN) !== 0, on: (f & FLAG_SAMPLING) !== 0, debugger: (f & FLAG_DEBUGGER) !== 0, heapHigh: (f & FLAG_HEAP_HIGH) !== 0, capPerHour, holdMs, watchdog: !!worker && !workerGone }; };
        holds = require('./loop-holds.js').create({ log, record: (ev) => record(ev), askProfile: (ms) => worker.postMessage({ ev: 'profile', ms, everyMs: profileEveryMs }), samplingState: st, readProfile, debuggerNow: () => debuggerOpen() === true, ...holdsOptions });
      } catch (e) { try { log.warn?.(`[loop-hold] no book of holds (${e && e.message})`); } catch { } }
      writeFlags();             // the boot's hold reads the flags before any beat (the setting read BEFORE anything is asked)
      started = true;
      setImmediate(beatOnce);   // the first loop turn: the boot's hold ends here (no beat before it)
      beat = setInterval(beatOnce, beatMs); beat.unref?.();
      try {
        const { Worker } = require('worker_threads');
        // THE BOOT: started before the loop's first turn (server.js's 6th line — nodeTiming.loopStart is −1 until then), the
        // hold before the first beat is the boot's, timed from the process's start; started later (a suite, a REPL), it is an
        // ordinary hold timed from now — never minutes of «boot» a process spent before the witness existed
        const beforeLoop = (() => { try { return require('perf_hooks').performance.nodeTiming.loopStart < 0; } catch { return false; } })();
        const startedAt = now(), bootAt = beforeLoop ? startedAt - process.uptime() * 1000 : null;
        worker = new Worker(path.join(__dirname, 'sync-fs-witness-worker.js'), { workerData: { sab, noteSab, profileSab, gapSab, fns: FNS, stores: TS.NAMES, pid: process.pid, liveMs, rootDir, beatMs, holdMs, noAnswerMs, capPerHour, samplesPerHold, bootAt, startedAt, procRoot, internals: (process.moduleLoadList || []).filter((x) => x.startsWith('NativeModule ')).map((x) => x.slice(13)) }, env: process.env, stdout: false, stderr: false });
        require('../worker-memory').trackWorker('sync-fs-witness', worker);
        worker.on('message', (m) => {   // the census's answer, or a hold the watchdog measured (one turn later: the collections are in)
          if (m && m.ev === 'memory') return;
          if (m && m.ev === 'hold' && holds) setImmediate(() => { try { holds.onHold(m.hold); } catch { } });
          if (m && m.ev === 'holdsLost' && holds && typeof holds.onLost === 'function') { try { holds.onLost(m.n); } catch { } }
        });
        worker.on('error', (e) => { workerGone = true; try { log.warn?.(`[sync-fs] the watchdog thread stopped — ${e && e.message}; the witness keeps its post-mortem`); } catch { } });
        worker.on('exit', () => { workerGone = true; });
        worker.unref();
      } catch (e) { try { log.warn?.(`[sync-fs] no watchdog thread (${e && e.message}) — the witness keeps its post-mortem`); } catch { } }
    }
    return api;
  }
  function stop() { clearInterval(timer); clearInterval(beat); try { worker && worker.terminate(); } catch { } try { holds && holds.stop(); } catch { } LB.setHook(null); }

  const api = {
    start, stop, refresh, heldIn, hook, counts,
    roots: () => roots.slice(),
    arm: (v = true) => { isArmed = !!v; },
    /** server.js, once telemetry / the settings / the mounts registry exist (the boot trace started the witness earlier). */
    wire({ record: r, guardOn: g, registry: reg, onHeld: h, samplingOn: so } = {}) {
      if (typeof r === 'function') record = r;
      if (typeof so === 'function') { samplingOn = so; if (started) writeFlags(); }   // the setting applies NOW — a synchronous boot never reaches a beat
      if (typeof g === 'function') guardOn = g;
      if (typeof reg === 'function') registry = reg;
      if (typeof h === 'function') onHeld = h;
      refresh();
      return api;
    },
    setOnHeld: (f) => { if (typeof f === 'function') onHeld = f; },
    setRegistry: (f) => { if (typeof f === 'function') { registry = f; refresh(); } },
    setGuard: (f) => { if (typeof f === 'function') guardOn = f; },
    ring: () => ring.slice(),
    inflight: () => (cur ? { ...cur, root: cur.root ? cur.root.root : null } : null),
    sites: () => Object.fromEntries(saidSites),
    slot: sab,
    /** the book of holds (src/server/loop-holds.js) — null without the watchdog thread */
    holds: () => holds,
  };
  if (!fresh) one = api;
  return api;
}

/** the setting as the boot can read it BEFORE anything may be asked (boot-trace's start, the main module's own first lines):
 *  data/settings.json's `telemetry.loopHoldSampling` — absent file or key ⇒ its default, ON; an unreadable file ⇒ null
 *  (not known ⇒ nothing is asked until server.js wires the live setting). */
function bootSetting(dataDir, readFile = (p) => fs.readFileSync(p, 'utf8')) {
  let text;
  try { text = readFile(path.join(dataDir, 'settings.json')); } catch (e) { return e && e.code === 'ENOENT' ? true : null; }
  try { const v = JSON.parse(text)[SAMPLING_SETTING]; return v === false ? false : true; } catch { return null; }
}

module.exports = { create, bootSetting, callWords, heldLine, guardError, REFUSAL, SETTING, SAMPLING_SETTING, RING_KEEP, RING_MS, HELD_MS, EPISODE_MS, LIVE_MS, ROOTS_EVERY_MS, SLOT_INTS, SLOT_FLOATS, SLOT_PATH, FLAG_SAMPLING, FLAG_DEBUGGER, FLAG_HEAP_HIGH, FLAG_KNOWN };
