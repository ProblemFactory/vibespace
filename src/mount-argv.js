// src/mount-argv.js — THE rclone `mount` argv (lane mount-argv-dir-cache, owner 2026-10-09: the OneDrive disconnect
// forensics). ONE PURE builder the hub mount (MountManager._mountArgv), the device pull mount (device-mount.js
// pullMountArgs) and the ssh-host push mount (machine-mounts.js, SSH_HOST_WEBDAV_ROW + shellWords — B-069b, lane
// mount-argv-vsdav-twin) all call — a flag edited on one side only used to drift the twin. Imports nothing.
// test-mount-argv's drift census fails any rclone mount flag or `rclone … mount` spelled outside this file.
//
// THE DIRECTORY CACHE IS A ROW FACT. rclone's own rule: a backend that POLLS for changes (ChangeNotify) keeps its
// listings `--dir-cache-time` and learns of changes every `--poll-interval`, which must be SMALLER. rclone's
// defaults are 5m / 1m. We ran OneDrive at 30s under the default 1m poll, so every root listing older than 30 s
// was a Microsoft Graph round trip (109 entries, 1.4–2.1 s) and the 60 s health sweep's `ls` was cold by
// construction. A row declares `dirCache: {ttl, poll?}`: a polling backend {ttl: '5m', poll: '1m'}; a backend
// with no ChangeNotify only {ttl} (no poll flag: a change shows when the ttl ends).
'use strict';

/** rclone backends whose ChangeNotify is implemented in the pinned v1.69.3 AND that a row names (onedrive, drive);
 *  local / sftp / webdav / smb / s3 have none. Only these may declare `poll`. */
const CHANGE_NOTIFY_BACKENDS = Object.freeze(['drive', 'onedrive']);
/** A row that declares nothing (an unknown type): today's listing bound, no poll. */
const DIR_CACHE_DEFAULT = Object.freeze({ ttl: '30s' });
const LOG_LEVEL = 'NOTICE';   // rclone's default: the INFO per-minute vfs-cache heartbeat grew logs for weeks
const LOG_ROTATE_BYTES = 1024 * 1024;   // data/mount-logs/<id>.log → <id>.log.1 past this, before a spawn
const RC_DIR = 'vibespace-mounts';
/** The rung → rclone subcommand of a row that declares none (the hub + the device pull mount): a FUSE `mount`. */
const MOUNT_SUBS = Object.freeze({ fuse: 'mount' });
/** What a macOS volume name keeps of the folder's name (it rode a single-quoted shell word before shellWords). */
const VOLNAME_DROP = /[^\w .-]/g;

/**
 * The ssh-host push mount's ROW (B-069b — the THIRD twin, a shell string built by hand in machine-mounts.js until
 * lane mount-argv-vsdav-twin): an rclone ON THE USER'S MACHINE mounts this instance's /dav as the env-configured
 * remote `vsdav:` (webdav: no ChangeNotify ⇒ a ttl, no poll). It runs as ONE `sh -c` line over ssh / the device link,
 * so rclone self-detaches (`daemon`) and its child logs to the file the caller tails on a failure (the logFile input:
 * --daemon detaches stderr, inc-mtl78uhs). macOS Finder shows the VOLUME name (default 'vsdav{hash}', real report:
 * 名字不太对) ⇒ `volname` names it after the folder. `subs` = the rung → subcommand (macOS tries `nfsmount`, rclone
 * ≥ 1.66, before a FUSE `mount`). Every cell is the one the hand-built string carried, in its order (2.369.12).
 */
const SSH_HOST_WEBDAV_ROW = Object.freeze({
  id: 'ssh-host-webdav', host: true, daemon: true,
  subs: Object.freeze({ fuse: 'mount', nfs: 'nfsmount' }),
  vfsCacheMode: Object.freeze({ rw: 'writes', ro: 'off' }),
  dirCache: Object.freeze({ ttl: '10s' }),
  timeouts: Object.freeze({ timeout: '30s', contimeout: '10s' }),
  volname: Object.freeze({ os: Object.freeze(['macos']), prefix: 'VibeSpace ' }),
});

/** rclone duration → ms ('90s', '5m', '1h', '1m30s'); NaN for anything else. */
function durationMs(s) {
  const t = String(s == null ? '' : s).trim();
  if (!/^(\d+(\.\d+)?(ms|s|m|h))+$/.test(t)) return NaN;
  const per = { ms: 1, s: 1e3, m: 60e3, h: 3600e3 };
  let ms = 0;
  for (const [, n, , u] of t.matchAll(/(\d+(\.\d+)?)(ms|s|m|h)/g)) ms += Number(n) * per[u];
  return ms;
}

/** A row's directory-cache cell, judged: `{ttl, poll|null, ok, why}`. ok = rclone's poll < ttl law holds. */
function dirCacheOf(row) {
  const dc = (row && row.dirCache) || DIR_CACHE_DEFAULT;
  const ttl = String(dc.ttl), poll = dc.poll == null ? null : String(dc.poll);
  if (!(durationMs(ttl) > 0)) return { ttl, poll, ok: false, why: `ttl ${ttl} is not an rclone duration` };
  if (poll !== null && !(durationMs(poll) > 0 && durationMs(poll) < durationMs(ttl))) return { ttl, poll, ok: false, why: `poll ${poll} is not smaller than ttl ${ttl} (rclone: poll-interval < dir-cache-time)` };
  return { ttl, poll, ok: true, why: '' };
}

/** The argv cells of the directory cache — the ONE place `--dir-cache-time` / `--poll-interval` are written. */
function dirCacheArgs(row) {
  const d = dirCacheOf(row);
  return ['--dir-cache-time', d.ttl, ...(d.poll ? ['--poll-interval', d.poll] : [])];
}

/** The argv as ONE POSIX shell line (the ssh-host mount runs through `sh -c` on the user's machine): every word
 *  single-quoted, a `'` inside it as `'\''` — sh hands rclone exactly these words, whatever a path or a name holds. */
const shellWords = (argv) => argv.map((w) => `'${String(w).replace(/'/g, `'\\''`)}'`).join(' ');

/** Is `p` inside `dir` (or `dir` itself)? Plain string paths, no fs. */
const isUnder = (p, dir) => { const d = String(dir || '').replace(/\/+$/, ''); return !!d && (p === d || String(p).startsWith(d + '/')); };

/**
 * Where a mount's rc socket lives: a LOCAL per-user directory, never under the data dir (a unix socket on bindfs /
 * NFS is refused by the kernel or the fs). The rung ladder of src/sock-path.js: `$XDG_RUNTIME_DIR/vibespace-mounts/
 * <id>.sock` (0700 by logind), else `/tmp/vs-mounts-<uid>/<id>.sock`; a rung must fit the 107-byte sun_path and
 * stay out of `dataDir`. → `{path, dir, via}` | `{path: null, why}`. The caller creates + verifies the dir
 * (sock-path's ensureSocketDir) and asks the dir's filesystem (`network` = refused by name).
 */
function rcSocketPath({ id, dataDir = '', xdgRuntimeDir = '', uid = null, tmpBase = '/tmp', network = null } = {}) {
  if (!/^[\w.-]+$/.test(String(id || ''))) return { path: null, why: `mount id ${JSON.stringify(id)} is not a file name` };
  const rungs = [];
  if (String(xdgRuntimeDir).startsWith('/')) rungs.push(['runtime-dir', String(xdgRuntimeDir).replace(/\/+$/, '') + '/' + RC_DIR]);
  rungs.push(['tmp', String(tmpBase).replace(/\/+$/, '') + `/vs-mounts-${Number.isInteger(uid) && uid >= 0 ? uid : 'u'}`]);
  const why = [];
  for (const [via, dir] of rungs) {
    const p = `${dir}/${id}.sock`;
    if (dataDir && isUnder(p, dataDir)) { why.push(`${via}: under the data dir (${dir})`); continue; }
    if (network && network(dir)) { why.push(`${via}: ${dir} is on a network filesystem`); continue; }
    const bytes = new TextEncoder().encode(p).length;
    if (bytes > 107) { why.push(`${via}: ${bytes} bytes > 107`); continue; }
    return { path: p, dir, via };
  }
  return { path: null, why: why.join('; ') };
}

/**
 * THE argv. `row` = the EFFECTIVE provider row (a child record mounts its parent's backend — the caller resolves
 * it; this never sees a record). `s3` = the record's backend is rclone's s3 (the caller asks the row's s3Backend).
 * `hasFlag(name)` = the installed rclone knows `--name` (an unknown flag makes rclone refuse to start).
 * A `row.pull` row is the device pull mount (read-only webdav, minimal cache — device-mount.js); a `row.host` row is
 * the ssh-host push mount (SSH_HOST_WEBDAV_ROW: `logFile` = the machine-side log a `daemon` row needs, `hostOs` +
 * `folderName` = the macOS volume name); every other row is the hub's cached mount. `via` = the rung (a key of
 * `row.subs`, default MOUNT_SUBS: `fuse` → `mount`). `rcSocket` (a path from rcSocketPath) adds the owner-only rc
 * server when rclone has it.
 */
function rcloneMountArgs({ row, remote, mountpoint, cacheDir = null, cacheGB = 10, s3 = false, readOnly = false,
  hasFlag = () => false, rcSocket = null, dataDir = '', via = 'fuse', logFile = null, hostOs = '', folderName = '' }) {
  const subs = (row && row.subs) || MOUNT_SUBS, sub = Object.prototype.hasOwnProperty.call(subs, via) ? subs[via] : null;
  if (!sub) throw new Error(`rclone mount: the ${(row && row.id) || 'hub'} row has no ${JSON.stringify(via)} rung`);
  const args = [sub, remote, mountpoint];
  if (row && row.daemon) {
    // --daemon detaches the child's stderr: without its own log file the reason it died is lost (inc-mtl78uhs)
    if (!logFile) throw new Error(`rclone mount: the ${row.id} row runs --daemon and needs its log file`);
    args.push('--daemon', '--log-file', logFile);
  }
  if (row && row.host) {
    const vol = row.volname && row.volname.os.includes(hostOs) ? ['--volname', row.volname.prefix + String(folderName).replace(VOLNAME_DROP, '')] : [];
    args.push('--log-level', LOG_LEVEL, ...vol,
      '--vfs-cache-mode', readOnly ? row.vfsCacheMode.ro : row.vfsCacheMode.rw, ...(readOnly ? ['--read-only'] : []),
      ...dirCacheArgs(row), '--timeout', row.timeouts.timeout, '--contimeout', row.timeouts.contimeout);
  } else if (row && row.pull) {
    args.push('--read-only', ...dirCacheArgs(row), '--vfs-cache-mode', 'minimal', '--timeout', '30s', '--contimeout', '10s', '--attr-timeout', '1s');
    if (cacheDir) args.push('--cache-dir', cacheDir);
  } else {
    // Read+write caching (user directive: 最稳定 + 性能最好 + 开读写cache): --vfs-cache-mode full caches reads
    // chunk-wise on local disk and lands writes locally first (uploaded async); a PERSISTENT per-mount --cache-dir
    // keeps dirty writes across a daemon crash. Bounded timeouts make a flaky backend DEGRADE (IO error), not hang.
    args.push('--vfs-cache-mode', hasFlag('vfs-fast-fingerprint') ? 'full' : 'writes',
      '--cache-dir', cacheDir,
      '--vfs-cache-max-size', `${Math.max(1, Number(cacheGB) || 10)}G`,
      '--vfs-cache-max-age', '168h',
      '--vfs-cache-poll-interval', '1m',
      '--vfs-write-back', '5s',
      '--buffer-size', '16M',
      '--timeout', '60s', '--contimeout', '15s',
      '--low-level-retries', '10', '--retries', '3',
      ...dirCacheArgs(row),
      '--log-level', LOG_LEVEL);
    if (hasFlag('vfs-fast-fingerprint')) args.push('--vfs-fast-fingerprint');
    if (hasFlag('vfs-read-ahead')) args.push('--vfs-read-ahead', '128M');
    // Proxy-safe signing: CDN proxies (Cloudflare) rewrite the Accept-Encoding header old aws-sdk-go signs into
    // V4 ⇒ SignatureDoesNotMatch on every object GET. Keyed by the BACKEND (native s3 or a raw rclone s3 record).
    if (s3 && hasFlag('use-accept-encoding-gzip')) args.push('--s3-use-accept-encoding-gzip=false');
    if (readOnly) args.push('--read-only');
  }
  if (rcSocket && hasFlag('rc-addr') && !(dataDir && isUnder(rcSocket, dataDir))) args.push('--rc', '--rc-addr', `unix://${rcSocket}`, '--rc-no-auth');
  return args;
}

module.exports = { CHANGE_NOTIFY_BACKENDS, DIR_CACHE_DEFAULT, LOG_LEVEL, LOG_ROTATE_BYTES, RC_DIR, MOUNT_SUBS, SSH_HOST_WEBDAV_ROW,
  durationMs, dirCacheOf, dirCacheArgs, rcSocketPath, shellWords, rcloneMountArgs };
