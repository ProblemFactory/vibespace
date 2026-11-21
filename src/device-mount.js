// deviceFolderMount (2.150.0) — mount a DEVICE's folder into VibeSpace over the
// agentd link. The device serves the folder over WEBDAV on its own loopback
// (serve-folder); we tcp-forward that port to OUR loopback via the mux, then
// rclone-`webdav`-mount it (read-only). NAT-proof: the bytes ride the device
// link (ssh-stdio or wss dial-out) — no inbound to the device, no public
// address. Used by MountManager's 'device' mount type and the acceptance test.
'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { serviceEnv, RCLONE_ENV_KEEP } = require('./agent-env.js');
const { rcloneMountArgs } = require('./mount-argv.js');   // THE mount argv — the hub's builder (lane mount-argv-dir-cache)
const { deviceCacheVerdict, NETWORK_FS_MAGIC } = require('./vfs-cache-place.js');   // lane vfs-cache-local: the device twin's cache verdict
const PI = require('./proc-identity.js');   // B-1ea6: a stale mount daemon is signalled only as the process the scan proved

// B-35e3 (2.369.202): a file rewritten IN PLACE on the device keeps its size
// (a SQLite DB), and a reader that keeps it open read the old bytes for days.
// Two deciders: (1) `--no-modtime` (a relic of the 2.150.0 http backend, where
// a modtime cost a HEAD per file) pinned every file's mtime to the mount time,
// so size + mtime never moved and no (size, mtime) reader could see a change
// (rsync's quick check, a stat-keyed cache); WebDAV's PROPFIND carries
// getlastmodified for free, so the flag is gone. (2) rclone's Linux FUSE never
// invalidates a node's DATA (only dentries) and does not ask for
// auto_inval_data, so the kernel serves a HELD file's cached pages until
// something OPENS it again (each open drops them: no FOPEN_KEEP_CACHE).
// heldRefresher does that open, for held files only, when the device's own
// stat moved; it never reads content and costs nothing on an idle mount.
const HELD_TICK_MS = 5000; // = --dir-cache-time: the mount's poll interval
const HELD_SCAN_GAP_MS = 10000; // a full /proc fd scan at most this often
const HELD_SCAN_DELAY_MS = 1000; // after a GET, let the reader finish opening
const HELD_MAX = 64;
const HELD_QUIET_PASSES = 3; // passes without a device answer before the refresher slows down and says so
const HELD_SLOW_FACTOR = 12; // then one probe per 12 ticks (a minute)

// ONE /proc pass serves every pull mount of this process: a refresher reuses
// any scan that STARTED after its GET (the reader's fd was open by then), so
// five mounts read nonstop cost one scan per gap, not five.
let scanSeq = 0; // scans started so far (a GET remembers it: exact where a clock tie is not)
const procScans = new Map(); // procRoot → { seq, start, promise } (the latest scan)
const scanPrefixes = new Map(); // procRoot → Map(prefix → live refreshers)
async function scanProc(procRoot, pfxs) {
  const out = new Map();
  let pids = [];
  try { pids = (await fs.promises.readdir(procRoot)).filter((n) => /^\d+$/.test(n)); } catch { return out; }
  for (const pid of pids) { // one process at a time: never flood the shared threadpool
    let fds; try { fds = await fs.promises.readdir(`${procRoot}/${pid}/fd`); } catch { continue; }
    for (const fd of fds) {
      let t; try { t = await fs.promises.readlink(`${procRoot}/${pid}/fd/${fd}`); } catch { continue; }
      if (pfxs.some((p) => t.startsWith(p))) { if (!out.has(t)) out.set(t, []); out.get(t).push([pid, fd]); }
    }
  }
  return out;
}
function sharedScan(procRoot, since) {
  const last = procScans.get(procRoot);
  if (last && last.seq > since) return last;
  const s = { seq: ++scanSeq, start: Date.now(), promise: scanProc(procRoot, [...(scanPrefixes.get(procRoot) || new Map()).keys()]) };
  procScans.set(procRoot, s);
  s.promise.catch(() => { }).finally(() => { if (procScans.get(procRoot) === s && !(scanPrefixes.get(procRoot) || new Map()).size) procScans.delete(procRoot); });
  return s;
}

/** The pull mount's ROW for the ONE argv builder (src/mount-argv.js): read-only webdav, minimal cache; webdav has
 *  no ChangeNotify, so the listing bound is the held-file tick (5 s) and no poll is declared. */
const PULL_ROW = Object.freeze({ id: 'device-pull', pull: true, dirCache: Object.freeze({ ttl: `${HELD_TICK_MS / 1000}s` }) });
/** rclone argv of a pull mount (read-only webdav). Pinned by test-pull-refresh. */
function pullMountArgs(mountpoint, cacheDir = null) {
  return rcloneMountArgs({ row: PULL_ROW, remote: 'vsdev:', mountpoint, cacheDir });
}

/** B-1ea6: is `argv` (a /proc cmdline split on NUL) an rclone MOUNT daemon of exactly `mountpoint`? By ELEMENTS, never a
 *  substring: the program's name holds «rclone», one element is `mount` and one element IS the mount point — so a mount
 *  point that is a prefix of another (…/mac against …/macbook, an instance's folder under another) never names the other's
 *  daemon. PURE. */
function isMountDaemonOf(argv, mountpoint) {
  if (!Array.isArray(argv) || typeof mountpoint !== 'string' || !mountpoint) return false;
  return /rclone/.test(path.basename(String(argv[0] || ''))) && argv.includes('mount') && argv.includes(mountpoint);
}
/** B-1ea6: the rclone daemons still serving `mountpoint` — a FRESH /proc pass OFF the loop (fs.promises, one process at a
 *  time as scanProc: the shared threadpool is never flooded), each with the identity read in the same pass ({pid,
 *  starttime}: /proc/<pid>/stat field 22, counted from the last ')'). Never this process. [] where there is no /proc. */
// cure 2 (the readers' should): a process LEFT because it sleeps in the kernel is SAID once (per mount point and pid) —
// never read further (its command line is the hazard), so the walk names it by /proc/<pid>/comm (no memory-map lock).
// The key is the line's KIND + mount point + pid + START TIME: a recycled pid asleep there again is a new process (said
// again), and a daemon the walk said «may be» stale that is found later and asleep at the re-check still gets the re-check's
// line. The set keeps its newest 1024 keys (the oldest leaves first)
const asleepSaid = new Set();
const sayAsleep = (say, kind, mountpoint, pid, start, line) => { const k = kind + '\0' + mountpoint + '\0' + pid + '\0' + start; if (!say || asleepSaid.has(k)) return; if (asleepSaid.size >= 1024) asleepSaid.delete(asleepSaid.values().next().value); asleepSaid.add(k); try { say(line); } catch { } };
async function mountDaemonsOf(mountpoint, { procRoot = '/proc', say = null } = {}) {
  const out = [];
  let pids = [];
  try { pids = (await fs.promises.readdir(procRoot)).filter((n) => /^\d+$/.test(n) && Number(n) !== process.pid); } catch { return out; }
  for (const pid of pids) {
    // the cure (the readers' 2): the STATE first — a process in uninterruptible sleep (D) is never read further: its command
    // line takes its memory map's lock and can hold a pool thread for as long as it sleeps (proc-identity membersOf's rule)
    const st = await statOf(procRoot, pid);
    if (!st) continue;
    if (st.state === 'D') {
      if (/rclone/.test(st.comm)) sayAsleep(say, 'walk', mountpoint, pid, st.start, `pull mount ${mountpoint}: rclone process ${pid} is asleep in the kernel — not read, not signalled (it may be a stale daemon of this folder); tried again at the next release`);
      continue;
    }
    let argv; try { argv = (await fs.promises.readFile(`${procRoot}/${pid}/cmdline`, 'utf8')).split('\0'); } catch { continue; }
    if (!isMountDaemonOf(argv, mountpoint)) continue;
    if (Number.isFinite(st.start)) out.push({ pid: Number(pid), starttime: st.start });
  }
  return out;
}
/** /proc/<pid>/stat → { state, start } (field 3 and field 22, counted from the last ')'), or null. Async. */
async function statOf(procRoot, pid) {
  let st; try { st = await fs.promises.readFile(`${procRoot}/${pid}/stat`, 'utf8'); } catch { return null; }
  const rest = st.slice(st.lastIndexOf(')') + 2).split(' ');
  return { state: rest[0], start: Number(rest[19]), comm: st.slice(st.indexOf('(') + 1, st.lastIndexOf(')')) };   // comm: field 2, the kernel's own name
}
/** B-1ea6: the pre-clean's kill — each daemon the scan proved, RE-CHECKED at the signal: its command line read again (still
 *  a mount daemon of exactly this mount point) and then PI.signalIdentity (the start time judged in the same tick as the
 *  kill: a pid that now names another process is never signalled). → the pids signalled. */
async function killMountDaemons(mountpoint, { procRoot = '/proc', kill = null, say = null } = {}) {
  const hit = [];
  for (const id of await mountDaemonsOf(mountpoint, { procRoot, say })) {
    const st = await statOf(procRoot, id.pid);
    if (!st) continue;
    if (st.state === 'D') {   // asleep in the kernel now: never read further (a SIGKILL would wait for it anyway) — said once,
      // and named the stale daemon only while it IS the process the walk found (its start time)
      if (st.start === id.starttime) sayAsleep(say, 'recheck', mountpoint, id.pid, st.start, `pull mount ${mountpoint}: its stale daemon ${id.pid} is asleep in the kernel — left; tried again at the next release`);
      continue;
    }
    let argv; try { argv = (await fs.promises.readFile(`${procRoot}/${id.pid}/cmdline`, 'utf8')).split('\0'); } catch { continue; }
    if (!isMountDaemonOf(argv, mountpoint)) continue;
    const r = PI.signalIdentity(id, 'SIGKILL', { procRoot, what: 'the stale daemon of a pull mount point', ...(kill ? { kill } : {}), ...(say ? { say } : {}) });
    if (r.ok) { hit.push(id.pid); if (say) say(`pull mount ${mountpoint}: ended its stale daemon ${id.pid} (start ${id.starttime})`); }
  }
  return hit;
}

/** The lazy unmount of a pull mount point, in a CHILD (never a sync call from the loop) → 'ok' | 'no' (it ran: not mounted, or
 *  refused) | 'missing' (neither program is here). THE LADDER of src/mounts.js and desktop-display: fusermount3 first (a fuse3
 *  host — the repo's own image installs fuse3), fusermount when it is not on PATH; neither ⇒ said ONCE (adversarial r1 #3: a
 *  missing program silently released nothing while every row said offline). */
let unmountMissingSaid = false;
// THE BOUND (主开发's «taken» of batch 15, its readers' first small one): an unmount child that has not answered in
// UNMOUNT_MS is ended by its handle and answers 'hung' — said once by its caller, never waited on for ever; while that child
// has not exited (a stat stuck in the kernel keeps it alive), the mount point gets no second child (it answers 'hung' at once)
const UNMOUNT_MS = 10000;
// B-323e (主开发 r1352 (2), lane bl-machines-b): the pair rides THE STARTER (a fork of a few MB, never the hub's: every pull attempt and
// teardown — about every six minutes for a failing pull, for ever on an ssh machine); its answers read as the release read its own
// children: ended 0 = 'ok', another end = 'no', not on PATH = 'missing'; killed at its bound, NO ANSWER from the starter or never
// started = 'hung' (no verdict: nothing is mounted over a folder still held). A child that may still run keeps the mount point
// STUCK while it lives — released at its late end, or once its end is asked and it is gone (`held`: the caller's witness —
// machine-mounts' heldChild, /proc by its pid or the kernel by signal 0 —; without one, its late end alone)
const unmountStuck = new Map();   // mount point → the stuck child's witness ({ gone() })
const stuckAt = (mp) => { const h = unmountStuck.get(mp); if (h && h.gone()) { unmountStuck.delete(mp); return false; } return !!h; };
function lazyUnmount(mountpoint, { say = null, ms = UNMOUNT_MS, held = null } = {}) {
  if (stuckAt(mountpoint)) return Promise.resolve('hung');
  const S = require('./server/child-starter').childStarter(), envAdd = { PATH: process.env.PATH || '' };
  const keep = (pid) => { const h = (typeof held === 'function' && pid ? held(pid) : null) || { pid, gone: () => false }; unmountStuck.set(mountpoint, h); return h; };
  const ask = (cmd) => {
    let h = null;
    return S.run(cmd, ['-uz', mountpoint], { timeoutMs: ms, envAdd, onTimeout: (pid) => { h = keep(pid); }, onLateExit: () => { if (h && unmountStuck.get(mountpoint) === h) unmountStuck.delete(mountpoint); } })
      .then((r) => {
        if (!r || r.unknown) { if (r && r.pid && !h) h = keep(r.pid); return 'hung'; }   // started, then no answer: it may still run
        if (!r.started) return r.error === 'ENOENT' ? 'missing' : /^(EAGAIN|EMFILE|ENFILE|ENOMEM)$/.test(String(r.error || '')) ? 'hung' : 'no';   // the table full: no verdict; another error (EACCES): as the release
        if (r.timedOut) { if (!h && r.pid) h = keep(r.pid); return 'hung'; }
        return r.code === 0 && !r.error ? 'ok' : 'no';
      }, () => 'hung');
  };
  const fuse3 = () => ask('fusermount3');
  const fuse2 = () => ask('fusermount');
  return fuse3().then((a) => (a === 'missing' ? fuse2() : a)).then((b) => {
    if (b === 'missing' && !unmountMissingSaid) { unmountMissingSaid = true; try { (say || ((l) => console.warn(l)))(`pull mount ${mountpoint}: neither fusermount3 nor fusermount is on PATH — a pull mount point cannot be released (install fuse3)`); } catch { } }
    if (b === 'hung') { try { (say || ((l) => console.warn(l)))(`pull mount ${mountpoint}: could not release the folder — its unmount did not answer in ${Math.round(ms / 1000)} s (ended; tried again at the next check)`); } catch { } }
    return b;
  });
}
/** B-fcc7: release what a pull mount left on THIS machine — the lazy unmount, then the stale daemons of exactly that mount
 *  point (B-1ea6). The pre-clean of every mount, and the boot's answer for a recorded pull whose machine is offline: its
 *  last hub's rclone must not stay a FUSE entry whose every read fails ENOTCONN until the next mount. */
async function releaseStale(mountpoint, { log = () => {}, ms = UNMOUNT_MS, held = null } = {}) {
  // a release whose unmount HUNG is a failure by name (`unmount_hung`): nothing is mounted over a folder still held
  if ((await lazyUnmount(mountpoint, { say: log, ms, held })) === 'hung') throw require('./mount-error-words.js').refusal('unmount_hung', { mountpoint, s: Math.round(ms / 1000) });   // B-af94: worded by code
  return killMountDaemons(mountpoint, { say: log }); // non-Linux: no /proc — the lazy unmount alone
}

/**
 * Keep held files of ONE pull mount fresh. A held file can only carry cached
 * pages after a content GET crossed the bridge, so sawRead() (the bridge saw a
 * GET) schedules a /proc fd scan; while any process holds a file under the
 * mountpoint, every tick asks the DEVICE for its stat (statRemote — uncached,
 * not rclone's listing) and, when (size, mtime) moved, invalidate()s it (an
 * open through the mount in a child). The pass after a change runs once more:
 * mtime has whole-second precision, so a second same-size write within that
 * second has no new stat. A newly found held file gets one pass too (it may
 * have changed between its read and our first look).
 * The device not answering HELD_QUIET_PASSES passes in a row is said once in
 * the journal and slows the pass to a minute (no spinning on an offline
 * machine); its first answer says so and restores the tick.
 * @param o { mountpoint (real path), statRemote(abs)→{size,mtime} | false (answered, not a file) | null (no answer), invalidate(abs[]), procRoot?, tickMs?, scanGapMs?, scanDelayMs?, log? }
 */
function heldRefresher({ mountpoint, statRemote, invalidate, procRoot = '/proc', tickMs = HELD_TICK_MS,
  scanGapMs = HELD_SCAN_GAP_MS, scanDelayMs = HELD_SCAN_DELAY_MS, log = () => {} }) {
  const fsp = fs.promises;
  const pfx = mountpoint.replace(/\/+$/, '') + '/';
  const held = new Map(); // abs → { holders: [[pid, fd]], seen: 'size|mtime' | null, again }
  let scanTimer = null, tickTimer = null, lastScan = 0, stopped = false, scanning = false, rescan = false, since = null;
  if (!scanPrefixes.has(procRoot)) scanPrefixes.set(procRoot, new Map());
  const pfxCount = scanPrefixes.get(procRoot);
  pfxCount.set(pfx, (pfxCount.get(pfx) || 0) + 1);
  let silent = 0; // consecutive passes in which the device answered no stat
  const later = (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; };
  async function runScan(want) {
    const s = sharedScan(procRoot, want);
    lastScan = s.start;
    const found = new Map();
    for (const [t, holders] of await s.promise) if (t.startsWith(pfx)) found.set(t, holders);
    if (stopped) return;
    for (const abs of [...held.keys()]) if (!found.has(abs)) held.delete(abs);
    for (const [abs, holders] of found) {
      const h = held.get(abs);
      if (h) h.holders = holders;
      else if (held.size < HELD_MAX) held.set(abs, { holders, seen: null, again: true });
    }
    if (held.size && !tickTimer) tickTimer = later(tick, tickMs);
  }
  async function tick() {
    if (stopped) { tickTimer = null; return; }
    const stale = [];
    let asked = 0, answered = 0, changed = 0; const cand = new Map(); // abs → moved
    for (const [abs, h] of [...held]) {
      if (asked && !answered && silent >= HELD_QUIET_PASSES) break; // slow mode: one probe per pass
      const still = [];
      for (const [pid, fd] of h.holders) { try { if (await fsp.readlink(`${procRoot}/${pid}/fd/${fd}`) === abs) still.push([pid, fd]); } catch { } }
      if (!still.length) { held.delete(abs); continue; }
      h.holders = still;
      const st = await statRemote(abs);
      asked++;
      if (st === null) continue; // no answer this pass: keep the baseline
      answered++;
      if (!st) continue; // answered, but not a file (a directory, gone on the device)
      const key = `${st.size}|${st.mtime}`;
      const moved = h.seen !== null && key !== h.seen;
      if (h.seen === null) h.cap = st.size; // rclone caps a held fd at the size its file had at open
      h.size = st.size;
      if (moved || h.again) cand.set(abs, moved);
      h.again = moved; h.seen = key;
    }
    // One pass stats a SQLite family (x.db, -wal, -shm) file by file: a commit or a checkpoint on the device
    // between two of those stats tears the pass (a -shm seen moved beside the -wal's size from before that commit;
    // a -wal truncated beside a db from before its checkpoint). A family with a moved file gets a second look,
    // -wal last, so it is judged on a -wal no older than what moved and refreshed as one
    for (const base of new Set([...cand].filter(([, m]) => m).map(([abs]) => abs.replace(/-(wal|shm)$/, '')))) {
      if (!held.has(base + '-wal') && !held.has(base + '-shm')) continue; // a plain file: no family
      for (const abs of [base, base + '-shm', base + '-wal']) {
        const h = held.get(abs);
        if (!h || h.seen === null || stopped) continue;
        const st = await statRemote(abs);
        if (!st) continue;
        const key = `${st.size}|${st.mtime}`;
        h.size = st.size;
        if (key !== h.seen) { cand.set(abs, true); h.again = true; h.seen = key; }
      }
    }
    // A SQLite -wal that outgrew what the open connection's handle can read:
    // refreshing its -shm points the reader at frames it cannot read (disk I/O
    // error) — leave that family as stale as it was before, and say so once
    const outgrown = new Set();
    for (const [abs, h] of held) {
      if (!abs.endsWith('-wal') || !(h.size > h.cap)) continue;
      outgrown.add(abs.slice(0, -4));
      if (!h.warned) { h.warned = true; log(`pull refresh: ${abs} outgrew what its open SQLite connection can read — that reader sees new rows after it reconnects`); }
    }
    for (const [abs, moved] of cand) if (!outgrown.has(abs.replace(/-(wal|shm)$/, ''))) { stale.push(abs); if (moved) changed++; }
    if (asked && !answered) {
      if (++silent === HELD_QUIET_PASSES) log(`pull refresh: the device has not answered ${silent} passes — ${held.size} held file(s) under ${mountpoint} may read stale; checking once a minute`);
    } else if (answered) {
      if (silent >= HELD_QUIET_PASSES) log(`pull refresh: the device answers again — ${mountpoint} refreshes every ${tickMs / 1000} s`);
      silent = 0;
    }
    if (stale.length && !stopped) {
      if (changed) log(`pull refresh: ${changed} held file(s) changed on the device — dropping their cached pages`);
      try { await invalidate(stale); } catch { }
    }
    tickTimer = (held.size && !stopped) ? later(tick, silent >= HELD_QUIET_PASSES ? tickMs * HELD_SLOW_FACTOR : tickMs) : null;
  }
  function sawRead() {
    if (stopped) return;
    if (since === null) since = scanSeq; // the oldest GET not yet covered: only a scan started after it may serve it
    if (scanning) { rescan = true; return; } // a GET during a scan gets its own pass
    if (scanTimer) return;
    scanTimer = later(() => {
      scanTimer = null; scanning = true;
      const want = since; since = null;
      runScan(want).catch(() => { }).finally(() => { scanning = false; if (rescan) { rescan = false; sawRead(); } });
    }, Math.max(scanDelayMs, lastScan + scanGapMs - Date.now()));
  }
  return {
    sawRead,
    stop() {
      if (!stopped && pfxCount.has(pfx)) { if (pfxCount.get(pfx) > 1) pfxCount.set(pfx, pfxCount.get(pfx) - 1); else pfxCount.delete(pfx); }
      stopped = true; clearTimeout(scanTimer); clearTimeout(tickTimer); scanTimer = tickTimer = null; held.clear();
    },
    held,
  };
}

/**
 * @param {object} o
 *  device       a connected DeviceManager (hosts.device(id) or deviceForDial(id))
 *  remotePath   absolute folder ON THE DEVICE to serve
 *  mountpoint   local dir to mount at
 *  rcloneBin    path to the rclone binary
 *  vfsCacheDir  optional per-mount vfs cache dir
 *  log          logger
 * @returns {Promise<{ mountpoint, devicePort, bridgePort, teardown }>}
 */
async function deviceFolderMount({ device, remotePath, mountpoint, rcloneBin, vfsCacheDir, log = () => {}, onGone = null, preCleaned = false, canRelease = null, heldChild = null }) {   // heldChild: the caller's witness of a child whose end may never be heard (B-323e)
  let refresher = null, tornDown = false; // heldRefresher, once the mount is up
  const sawGet = (d) => { if (refresher && d.indexOf('GET ') !== -1) refresher.sawRead(); };
  // 1) ask the device to serve the folder over WebDAV on its own loopback
  const sf = await device.serveFolder(remotePath, { by: 'system:device-mount' }); // lane device-act-audit: a pull mount's folder server
  if (!sf || !sf.port) throw require('./mount-error-words.js').refusal('serve_folder_failed', { detail: String((sf && sf.error) || 'no port') });
  const devicePort = sf.port;

  // 2) bridge a LOCAL loopback port → tcp-forward → the device's HTTP server.
  // One tcpForward per accepted connection (rclone http opens several).
  // allowHalfOpen:true is LOAD-BEARING: curl / rclone (Go http) half-close
  // their WRITE side (FIN) right after sending a GET. With the default
  // (false), Node auto-ends our writable side on that FIN — so the HTTP
  // response, which the folder server writes a tick later, has nowhere to go
  // and the client times out with 0 bytes. Node's own http client keeps the
  // socket fully open (keep-alive), which is why it worked and curl didn't.
  const bridge = net.createServer({ allowHalfOpen: true }, async (sock) => {
    sock.on('error', () => {});
    sock.on('end', () => {}); // peer half-closed; keep writing the response
    // CRITICAL: attach a data listener IMMEDIATELY (before the async
    // tcpForward round-trip) and buffer early bytes. A client that writes its
    // request the instant it connects (curl, rclone/Go, nc) would otherwise
    // lose those bytes during the await — a paused socket does NOT reliably
    // buffer a burst that arrives before any read mechanism, so the request
    // never reached the device and the response never came (real bug: Node
    // http.request worked because it sends a tick later; curl/rclone didn't).
    const early = [];
    const onEarly = (d) => { early.push(d); sawGet(d); };
    sock.on('data', onEarly);
    let fwd;
    try { fwd = await device.tcpForward(devicePort); }
    catch { try { sock.destroy(); } catch {} return; }
    fwd.onData = (b) => { try { sock.write(b); } catch {} };
    fwd.onClose = () => { try { sock.end(); } catch {} };
    sock.off('data', onEarly);
    for (const d of early) fwd.write(d);
    sock.on('data', (d) => { sawGet(d); fwd.write(d); });
    sock.on('close', () => { try { fwd.close(); } catch {} });
  });
  bridge.on('error', () => {});
  const bridgePort = await new Promise((resolve, reject) => {
    bridge.on('error', reject);
    bridge.listen(0, '127.0.0.1', () => resolve(bridge.address().port));
  });

  // 3) rclone WEBDAV mount the bridge (read-only). The webdav backend (not the
  // plain http backend) is deliberate — the http backend requests a fixed 128MB
  // range per read and then stalls ~6s on the keep-alive connection; webdav
  // requests sane ranges and reads cleanly (the daemon serves a WebDAV subset).
  // PRE-CLEAN stale occupation: rclone is spawned detached, so it SURVIVES a
  // server restart while its bridge dies with us — the mountpoint stays
  // claimed by an orphan whose every IO fails, and the dial-in heal's fresh
  // mount then fails forever (real report: device online, mount row stuck
  // offline with no way back). Lazy-unmount + kill the exact orphan (B-1ea6:
  // argv ELEMENTS, never a substring — a prefix mount point named another
  // mount's daemon; the /proc pass off the loop; the kill re-checked at the signal).
  if (!preCleaned) await releaseStale(mountpoint, { log, held: heldChild }); // machine-mounts _up released it before it asked the machine anything (B-fcc7 r2)
  await fs.promises.mkdir(mountpoint, { recursive: true }); // lane hub-fuse-sync-guard: a stale FUSE mount point right after the lazy unmount — never a sync call from the loop
  // /proc fd links name the REAL path; resolve it before the mount covers it
  let realMp = mountpoint; try { realMp = await fs.promises.realpath(mountpoint); } catch { }
  // the mount daemon's env is BUILT (lane spawn-env-debts): the rclone rule of src/mounts.js — never the hub's whole env
  const env = serviceEnv(process.env, { keep: RCLONE_ENV_KEEP, egress: true, add: {
    RCLONE_CONFIG_VSDEV_TYPE: 'webdav',
    RCLONE_CONFIG_VSDEV_URL: `http://127.0.0.1:${bridgePort}`,
    RCLONE_CONFIG_VSDEV_VENDOR: 'other',
  } });
  // The cache (lane vfs-cache-local, the STANDING SWEEP law): vfs-cache-mode minimal caches only files open for writing;
  // no caller passes vfsCacheDir, so rclone's own default ($XDG_CACHE_HOME/rclone, local home) applies. A passed dir on a
  // network filesystem is SAID, never moved — it may hold a write still uploading.
  let onNet = false;
  if (vfsCacheDir) { try { onNet = NETWORK_FS_MAGIC.includes(Number(fs.statfsSync(vfsCacheDir).type) >>> 0); } catch {} }
  const cv = deviceCacheVerdict({ dir: vfsCacheDir || null, network: onNet });
  if (cv.why === 'network') log(`device mount: its vfs cache ${cv.dir} sits on a network filesystem — kept there (minimal mode holds only files being written)`);
  const args = pullMountArgs(mountpoint, cv.dir);
  const rc = spawn(rcloneBin, args, { env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  rc.on('error', (e) => console.warn(`[device-mount] the pull mount's rclone could not be started: ${(e && e.code) || e}`));   // ckpt61 cure 2: the hub survives a start that fails (the road's own failure words owed: the next unit)
  let stderr = '';
  if (rc.stderr) rc.stderr.on('data', (d) => { stderr += d.toString().slice(0, 2000); });   // ckpt61 cure 3: none after a start that failed at once (the wait below says it did not come up)
  rc.unref();
  // rclone gone = the mount is gone: the refresher stops and the journal says so. B-fcc7: and the mount point is RELEASED
  // at once — the lazy unmount (a child), the bridge closed, the device's folder server let go — and the owner told
  // (onGone: the row says its state; the heal remounts). Never a zombie FUSE entry whose every read fails ENOTCONN.
  let rcGone = false;
  let released = null;   // B-fcc7: the lazy unmount's own promise — a probe of the bare folder waits for it
  // B-844b: may THIS chain still release its folder? (its owner answers: not when another record now holds that folder — a pull
  // removed while it was mounted and added again on the same folder). A chain that may not ends only its own processes
  const mayRelease = () => { try { return typeof canRelease !== 'function' || canRelease() !== false; } catch { return true; } };
  const releaseOwn = () => (mayRelease() ? lazyUnmount(mountpoint, { say: log, held: heldChild }).catch(() => 'no') : Promise.resolve('kept'));
  rc.on('exit', (code, sig) => {
    rcGone = true;
    if (tornDown || !refresher) return; // not up yet: the wait below answers it
    tornDown = true;
    refresher.stop();
    log(`pull refresh stopped: rclone for ${mountpoint} exited (${sig || code}) — the mount is gone until it is healed (unmounted, lazy)`);
    released = releaseOwn();
    try { bridge.close(); } catch { }
    Promise.resolve().then(() => device.unserveFolder(devicePort)).catch(() => { });
    if (typeof onGone === 'function') { try { onGone({ why: 'rclone-exit', code, sig, released }); } catch { } }
  });

  // wait for the mount to appear (rclone forks; poll the mountpoint)
  const ok = await waitMounted(mountpoint, 8000);
  if (!ok || rcGone) { // B-fcc7: an rclone that exited while we waited is a failed mount too (an empty directory lists fine)
    tornDown = true;
    if (!rcGone) { try { process.kill(-rc.pid, 'SIGKILL'); } catch {} }
    const releasedF = releaseOwn(); // r1 #1: a mount that came up BROKEN (its listing failed) is a FUSE entry too — released (B-fcc7: its promise rides the error)
    try { bridge.close(); } catch {}
    try { await device.unserveFolder(devicePort); } catch {}
    throw Object.assign(require('./mount-error-words.js').refusal(rcGone ? 'webdav_mount_exited' : 'webdav_mount_not_up', { detail: stderr.slice(-300) || (rcGone ? 'no message' : 'timeout') }), { released: releasedF });   // B-af94: worded by code
  }
  log(`device folder ${remotePath} mounted at ${mountpoint} (device:${devicePort} ↔ bridge:${bridgePort})`);
  refresher = heldRefresher({
    mountpoint: realMp, log,
    // the DEVICE's stat through our own bridge (Depth-0 PROPFIND): uncached,
    // never the FUSE mount (a wedged mount must not hang the threadpool)
    statRemote: (abs) => new Promise((resolve) => {
      const rel = path.relative(realMp, abs).split(path.sep).map(encodeURIComponent).join('/');
      const req = http.request({ host: '127.0.0.1', port: bridgePort, method: 'PROPFIND', path: '/' + rel, headers: { Depth: '0' }, agent: false, timeout: 8000 }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { if (body.length < 16384) body += d; });
        res.on('end', () => {
          const len = /getcontentlength>(\d+)</.exec(body), mod = /getlastmodified>([^<]+)</.exec(body);
          resolve(res.statusCode === 207 && len && mod ? { size: Number(len[1]), mtime: mod[1] } : false);
        });
        res.on('error', () => resolve(null));
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => resolve(null));
      req.end();
    }),
    invalidate: openHeld,
  });

  const teardown = async () => {
    if (tornDown) return; // B-fcc7: rclone's exit already released it all (the lazy unmount, the bridge, the device's server)
    tornDown = true;
    refresher.stop();
    released = releaseOwn();
    setTimeout(() => { try { if (rc.exitCode === null && rc.signalCode === null) process.kill(rc.pid, 'SIGTERM'); } catch {} }, 300);
    setTimeout(() => { try { bridge.close(); } catch {} }, 500);
    try { await device.unserveFolder(devicePort); } catch {}
  };
  return { mountpoint, devicePort, bridgePort, teardown, released: () => released };   // released(): the lazy unmount's promise once begun (B-fcc7)
}

/** One open + close per file in a CHILD (never node fs on the mount): the kernel drops the inode's cached pages on open; nothing is
 *  read. B-323e (r1352 (2)): by THE STARTER, bounded 10 s (as the release ended its own child); its answer, whatever it is, ends it */
function openHeld(paths) {
  return require('./server/child-starter').childStarter().run('sh', ['-c', 'for f; do : < "$f"; done 2>/dev/null', 'sh', ...paths], { timeoutMs: 10000, envAdd: { PATH: process.env.PATH || '' } }).then(() => { }, () => { });
}

function waitMounted(mp, timeoutMs) {
  // B-323e (r1352 (2)): each `ls` by THE STARTER, bounded by what is left of the wait — it had NO bound: a hung `ls` left the wait,
  // and the record's mounting mark, unresolved for ever; one at a time; no answer or killed at its bound = not up (yet)
  const S = require('./server/child-starter').childStarter(), envAdd = { PATH: process.env.PATH || '' };
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      // a child `ls` (never node fs — a wedged fuse mount hangs the thread pool)
      const left = timeoutMs - (Date.now() - t0);
      if (left <= 0) return resolve(false);
      S.run('ls', [mp], { timeoutMs: Math.max(1000, left), envAdd }).then((r) => { if (r && !r.unknown && r.started && !r.timedOut && r.code === 0 && !r.error) return resolve(true); retry(); }, retry);
    };
    const retry = () => { if (Date.now() - t0 > timeoutMs) return resolve(false); setTimeout(tick, 250); };
    setTimeout(tick, 300);
  });
}

module.exports = { deviceFolderMount, heldRefresher, pullMountArgs, PULL_ROW, isMountDaemonOf, mountDaemonsOf, killMountDaemons, releaseStale, lazyUnmount, UNMOUNT_MS, unmountStuckOf: (mp) => stuckAt(mp), openHeld, waitMounted };
