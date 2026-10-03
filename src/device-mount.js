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

/** rclone argv of a pull mount (read-only webdav). Pinned by test-pull-refresh. */
function pullMountArgs(mountpoint) {
  return ['mount', 'vsdev:', mountpoint, '--read-only', '--dir-cache-time', '5s',
    '--vfs-cache-mode', 'minimal', '--timeout', '30s', '--contimeout', '10s',
    '--attr-timeout', '1s'];
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
    let asked = 0, answered = 0, changed = 0; const cand = [];
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
      if (moved || h.again) cand.push([abs, moved]);
      h.again = moved; h.seen = key;
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
async function deviceFolderMount({ device, remotePath, mountpoint, rcloneBin, vfsCacheDir, log = () => {} }) {
  let refresher = null, tornDown = false; // heldRefresher, once the mount is up
  const sawGet = (d) => { if (refresher && d.indexOf('GET ') !== -1) refresher.sawRead(); };
  // 1) ask the device to serve the folder over WebDAV on its own loopback
  const sf = await device.serveFolder(remotePath);
  if (!sf || !sf.port) throw new Error('device serve-folder failed: ' + (sf && sf.error || 'no port'));
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
  // offline with no way back). Lazy-unmount + kill the exact orphan by
  // /proc cmdline (the mounts.js _killMountDaemon lesson).
  await new Promise((r) => { const c = spawn('fusermount', ['-uz', mountpoint], { stdio: 'ignore' }); c.on('exit', r); c.on('error', r); });
  try {
    for (const pidS of fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n))) {
      try {
        const cmd = fs.readFileSync(`/proc/${pidS}/cmdline`, 'utf8').replace(/\0/g, ' ');
        if (cmd.includes('rclone') && cmd.includes(' mount ') && cmd.includes(mountpoint)) process.kill(Number(pidS), 'SIGKILL');
      } catch { }
    }
  } catch { } // non-Linux: the fusermount pass alone
  fs.mkdirSync(mountpoint, { recursive: true });
  // /proc fd links name the REAL path; resolve it before the mount covers it
  let realMp = mountpoint; try { realMp = await fs.promises.realpath(mountpoint); } catch { }
  const env = {
    ...process.env,
    RCLONE_CONFIG_VSDEV_TYPE: 'webdav',
    RCLONE_CONFIG_VSDEV_URL: `http://127.0.0.1:${bridgePort}`,
    RCLONE_CONFIG_VSDEV_VENDOR: 'other',
  };
  const args = pullMountArgs(mountpoint);
  if (vfsCacheDir) { args.push('--cache-dir', vfsCacheDir); }
  const rc = spawn(rcloneBin, args, { env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  rc.stderr.on('data', (d) => { stderr += d.toString().slice(0, 2000); });
  rc.unref();
  // rclone gone = the mount is gone: the refresher stops and the journal says so
  rc.on('exit', (code, sig) => {
    if (tornDown || !refresher) return;
    refresher.stop();
    log(`pull refresh stopped: rclone for ${mountpoint} exited (${sig || code}) — the mount is gone until it is healed`);
  });

  // wait for the mount to appear (rclone forks; poll the mountpoint)
  const ok = await waitMounted(mountpoint, 8000);
  if (!ok) {
    try { process.kill(-rc.pid, 'SIGKILL'); } catch {}
    try { bridge.close(); } catch {}
    try { await device.unserveFolder(devicePort); } catch {}
    throw new Error('rclone webdav mount did not come up: ' + (stderr.slice(-300) || 'timeout'));
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
    // one open + close per file in a CHILD (never node fs on the mount): the
    // kernel drops the inode's cached pages on open; nothing is read
    invalidate: (paths) => new Promise((resolve) => {
      const c = spawn('sh', ['-c', 'for f; do : < "$f"; done 2>/dev/null', 'sh', ...paths], { stdio: 'ignore' });
      const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch {} resolve(); }, 10000);
      c.on('exit', () => { clearTimeout(t); resolve(); });
      c.on('error', () => { clearTimeout(t); resolve(); });
    }),
  });

  const teardown = async () => {
    tornDown = true;
    refresher.stop();
    try { spawn('fusermount', ['-uz', mountpoint]); } catch {}
    setTimeout(() => { try { process.kill(rc.pid, 'SIGTERM'); } catch {} }, 300);
    setTimeout(() => { try { bridge.close(); } catch {} }, 500);
    try { await device.unserveFolder(devicePort); } catch {}
  };
  return { mountpoint, devicePort, bridgePort, teardown };
}

function waitMounted(mp, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      // a child `ls` (never node fs — a wedged fuse mount hangs the thread pool)
      const c = spawn('ls', [mp], { stdio: 'ignore' });
      c.on('exit', (code) => { if (code === 0) return resolve(true); retry(); });
      c.on('error', retry);
    };
    const retry = () => { if (Date.now() - t0 > timeoutMs) return resolve(false); setTimeout(tick, 250); };
    setTimeout(tick, 300);
  });
}

module.exports = { deviceFolderMount, heldRefresher, pullMountArgs };
