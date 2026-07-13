// opslog — OPTIONAL persistent ops logging into a deployment-provided directory
// (typically a path-scoped CephFS subtree shared with a fleet admin, so server
// logs survive pod recreation and are centrally scannable). Fully env-gated:
// without VIBESPACE_OPSLOG_DIR this module is a no-op.
//
// Env contract (all optional except DIR):
//   VIBESPACE_OPSLOG_DIR            target directory (logs land here)
//   VIBESPACE_OPSLOG_KEEP_DAYS      retention, default 30
//   VIBESPACE_OPSLOG_CEPHFS_MONS    if set, kernel-mount this CephFS subtree at DIR first:
//   VIBESPACE_OPSLOG_CEPHFS_PATH      `mount -t ceph <mons>:<path> <dir> -o name=,secret=,mds_namespace=`
//   VIBESPACE_OPSLOG_CEPHFS_NAME      (client id without the "client." prefix)
//   VIBESPACE_OPSLOG_CEPHFS_SECRET
//   VIBESPACE_OPSLOG_CEPHFS_FSNAME    default "cephfs"
//
// What it does: tees console.log/warn/error to <dir>/server-YYYY-MM-DD.log
// (daily files, retention-pruned), plus boot/exit/crash markers. Failure of
// any step disables the logger — it must NEVER break or slow the app.
//
// Hung-mount defense (the 2.108.3 lesson): a dead CephFS mount makes every fs
// op on it hang and poison the libuv threadpool. All writes are async, queued,
// and behind a circuit breaker — one write stuck >10s permanently disables the
// logger (max 1 threadpool slot lost). Never use sync fs on the opslog dir.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const DIR = process.env.VIBESPACE_OPSLOG_DIR || '';
const KEEP_DAYS = Math.max(1, parseInt(process.env.VIBESPACE_OPSLOG_KEEP_DAYS || '30', 10) || 30);

let _enabled = false;
let _queue = [];
let _writing = false;
let _dead = false;

function _today() { return new Date().toISOString().slice(0, 10); }
function _file() { return path.join(DIR, `server-${_today()}.log`); }

function _flush() {
  if (_writing || _dead || !_queue.length) return;
  _writing = true;
  const batch = _queue.splice(0, _queue.length).join('');
  const t = setTimeout(() => { _dead = true; console.warn('[opslog] write stuck >10s — disabling (hung mount?)'); }, 10000);
  fs.appendFile(_file(), batch, (err) => {
    clearTimeout(t);
    _writing = false;
    if (err && !_dead) { _dead = true; console.warn('[opslog] write failed — disabling:', String(err.message || err).slice(0, 120)); return; }
    if (_queue.length) _flush();
  });
}

function _emit(level, args) {
  if (!_enabled || _dead) return;
  try {
    const line = `${new Date().toISOString()} [${level}] ` + args.map((a) =>
      typeof a === 'string' ? a : (a instanceof Error ? (a.stack || a.message) : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())
    ).join(' ') + '\n';
    // Bounded queue — if the disk is wedged we drop, never balloon memory.
    if (_queue.length < 2000) _queue.push(line);
    _flush();
  } catch {}
}

function _prune() {
  fs.readdir(DIR, (err, names) => {
    if (err || _dead) return;
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    for (const n of names || []) {
      const m = /^server-(\d{4}-\d{2}-\d{2})\.log$/.exec(n);
      if (!m) continue; // never touch files we didn't create
      if (new Date(m[1] + 'T00:00:00Z').getTime() < cutoff) fs.unlink(path.join(DIR, n), () => {});
    }
  });
}

function _activate(version) {
  _enabled = true;
  // Tee console — keep originals; the terminal/journal remains primary.
  for (const lvl of ['log', 'warn', 'error']) {
    const orig = console[lvl].bind(console);
    console[lvl] = (...args) => { orig(...args); _emit(lvl, args); };
  }
  _emit('boot', [`server start pid=${process.pid} host=${os.hostname()} version=${version} node=${process.version}`]);
  process.on('exit', (code) => { try { fs.appendFileSync(_file(), `${new Date().toISOString()} [exit] code=${code}\n`); } catch {} });
  process.on('uncaughtExceptionMonitor', (err) => _emit('crash', [err && (err.stack || err.message) || 'uncaught']));
  _prune();
  setInterval(_prune, 6 * 3600000).unref();
  console.log(`[opslog] persistent ops log active → ${DIR} (keep ${KEEP_DAYS}d)`);
}

function _isMounted(dir, cb) {
  fs.readFile('/proc/mounts', 'utf-8', (err, txt) => {
    if (err) return cb(false);
    cb(txt.split('\n').some((l) => { const p = l.split(' '); return p[1] === dir && (p[2] === 'ceph' || p[2] === 'fuse.ceph'); }));
  });
}

function setupOpslog(version) {
  if (!DIR) return; // feature off
  const mons = process.env.VIBESPACE_OPSLOG_CEPHFS_MONS || '';
  const done = () => fs.mkdir(DIR, { recursive: true }, () => _activate(version));
  if (!mons) return done();
  // CephFS-backed dir: kernel-mount the subtree first (idempotent). The mount
  // point usually lives under a root-owned path (e.g. /var/opslog) while the
  // server runs unprivileged, so BOTH the mkdir and the mount go through sudo
  // (fs.mkdir would EACCES). mount.ceph may print a harmless "modprobe not
  // found" line while the kernel module is already loaded — that is NOT a
  // failure (exit 0), so gate on the exit code + a /proc/mounts re-check only.
  _isMounted(DIR, (mounted) => {
    if (mounted) return _activate(version);
    const src = `${mons}:${process.env.VIBESPACE_OPSLOG_CEPHFS_PATH || '/'}`;
    const opts = `name=${process.env.VIBESPACE_OPSLOG_CEPHFS_NAME || ''},secret=${process.env.VIBESPACE_OPSLOG_CEPHFS_SECRET || ''},mds_namespace=${process.env.VIBESPACE_OPSLOG_CEPHFS_FSNAME || 'cephfs'}`;
    // Two sudo calls with plain argv (same shape as the known-good My-storage
    // cephfs mount) — no `sudo sh -c`, so a command-restricted sudoers still works.
    execFile('sudo', ['-n', 'mkdir', '-p', DIR], { timeout: 15000 }, () => {
      execFile('sudo', ['-n', 'mount', '-t', 'ceph', src, DIR, '-o', opts], { timeout: 30000 }, (err) => {
        _isMounted(DIR, (nowMounted) => {
          if (!nowMounted) { console.warn('[opslog] cephfs mount failed — ops log disabled:', String(err?.message || 'not mounted').slice(0, 160)); return; }
          _activate(version);
        });
      });
    });
  });
}

module.exports = { setupOpslog };
