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
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const MPC = require('../mount-path-class.js');
const SP = require('../storage-path.js');
const LB = require('./loop-blame.js');
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

// the live slot's SharedArrayBuffer: Int32 [0 seq, 1 fn index, 2 path bytes, 3 heartbeat, 4 in flight, 5 store index + 1] · Float64 startedAt · path
const SLOT_INTS = 8, SLOT_PATH = 1024;
const slotBytes = () => SLOT_INTS * 4 + 8 + SLOT_PATH;

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
  now = () => Date.now(), armed = null, live = true, liveMs = LIVE_MS, ringMs = RING_MS, heldMs = HELD_MS, fresh = false } = {}) {
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
  const I = new Int32Array(sab, 0, SLOT_INTS), T = new Float64Array(sab, SLOT_INTS * 4, 1), P = new Uint8Array(sab, SLOT_INTS * 4 + 8, SLOT_PATH);
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

  let timer = null, beat = null, worker = null;
  function start({ installHook = true } = {}) {
    refresh();
    if (installHook) LB.setHook(hook);
    if (armed === null) setImmediate(() => { isArmed = true; }); // the first loop turn: the main-module evaluation is over
    timer = setInterval(refresh, ROOTS_EVERY_MS); timer.unref?.();
    if (live) {
      beat = setInterval(() => bump(3), 1000); beat.unref?.();
      try {
        const { Worker } = require('worker_threads');
        worker = new Worker(path.join(__dirname, 'sync-fs-witness-worker.js'), { workerData: { sab, fns: FNS, stores: TS.NAMES, pid: process.pid, liveMs, rootDir }, env: process.env, stdout: false, stderr: false });
        require('../worker-memory').trackWorker('sync-fs-witness', worker);
        worker.on('message', (m) => { if (m && m.ev === 'memory') return; });   // the census's answer; the watchdog says nothing else
        worker.on('error', (e) => { try { log.warn?.(`[sync-fs] the watchdog thread stopped — ${e && e.message}; the witness keeps its post-mortem`); } catch { } });
        worker.unref();
      } catch (e) { try { log.warn?.(`[sync-fs] no watchdog thread (${e && e.message}) — the witness keeps its post-mortem`); } catch { } }
    }
    return api;
  }
  function stop() { clearInterval(timer); clearInterval(beat); try { worker && worker.terminate(); } catch { } LB.setHook(null); }

  const api = {
    start, stop, refresh, heldIn, hook, counts,
    roots: () => roots.slice(),
    arm: (v = true) => { isArmed = !!v; },
    /** server.js, once telemetry / the settings / the mounts registry exist (the boot trace started the witness earlier). */
    wire({ record: r, guardOn: g, registry: reg, onHeld: h } = {}) {
      if (typeof r === 'function') record = r;
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
  };
  if (!fresh) one = api;
  return api;
}

module.exports = { create, callWords, heldLine, guardError, REFUSAL, SETTING, RING_KEEP, RING_MS, HELD_MS, EPISODE_MS, LIVE_MS, ROOTS_EVERY_MS, SLOT_INTS, SLOT_PATH };
