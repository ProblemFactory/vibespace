'use strict';
/**
 * PURE (imports nothing; CJS) — THE SERVER'S FILE HANDLES, COUNTED AND NAMED
 * (lane-dead-bridge, 2026-09-30).
 *
 * THE INCIDENT. At 12:03:17 the production server died of
 * `EMFILE: too many open files, open '…/data/session-status.json.tmp'` —
 * thrown from a 500 ms debounce timer that had no try/catch, so the file
 * system's refusal became `uncaughtException` → exit(1). The first reading was
 * "node runs at the unit's soft limit (LimitNOFILESoft=1024)". MEASURED, that
 * is not what node runs at: node raises its own soft RLIMIT_NOFILE to the hard
 * limit at startup (`prlimit --nofile=1024:524288 node -e …` reads
 * 524288/524288 from /proc/self/limits; the production server and every dtach /
 * wrapper / CLI it spawns carry 524288). The server held ~75 handles. The
 * EMFILE came from BENEATH it: the workspace is a `fuse.bindfs` mount whose
 * daemon ran at the default soft 1024 and sat at 947 (~700 of them another
 * group's mmapped venv), and a FUSE daemon's EMFILE is relayed to the caller's
 * open() verbatim. So an EMFILE has two possible owners and the next one must
 * NAME which: this process (its own count near its own soft limit) or the file
 * system the path lives on (a FUSE mount, own count far below the limit).
 *
 * WHAT LIVES HERE (every rule PURE, the ORCH half is src/server/fd-gauge.js):
 *   readLimits     /proc/self/limits text → {soft, hard}
 *   fdKind         one /proc/self/fd readlink target → its kind
 *   tallyKinds     many targets → a count per kind + the busiest file dirs
 *   gaugeVerdict   THE GAUGE (a gauge that can fall): high at ≥ 80 % of the
 *                  soft limit, reported at most once per hour, `ok` again the
 *                  moment the count drops
 *   fdBudget       the ESTIMATE the boot line prints beside the limit
 *   mountOf        /proc/self/mountinfo text + a path → the mount it lives on
 *   emfileBlame    an EMFILE/ENFILE → who ran out, in words
 */

const GAUGE_RATIO = 0.8;              // report at 80 % of the soft limit
const GAUGE_REARM_MS = 3600e3;        // …at most once per hour
const GAUGE_SAMPLE_MS = 60e3;         // the ORCH samples /proc/self/fd every minute
const SAMPLE_CAP = 4096;              // readlink at most this many fds per sample — a leak of 500 k must not cost 500 k syscalls a minute
const SELF_BLAME_RATIO = 0.9;         // an EMFILE with our own count ≥ 90 % of our soft limit is OURS

const KINDS = Object.freeze(['socket', 'pipe', 'pty', 'anon', 'file', 'device', 'other']);

// The notice sentences — English t() keys the client words per device
// (i18nKey is the extraction marker scripts/i18n-extract.mjs reads; the
// server keeps the English `text` for the journal and older clients).
const i18nKey = (s) => s;
const GAUGE_KEY = i18nKey('This server holds {count} open file handles — {pct}% of its limit ({soft}). By kind: {kinds}. Past the limit, saving and new connections fail.');
const FS_BLAME_KEY = i18nKey('The file system under {mount} ({fstype}) refused to open a file (too many open files) while this server holds {held} file handles — the file system\'s own process ran out. Raise its limit (for a mount unit: LimitNOFILE in a drop-in), not this server\'s.');
const fill = (key, params) => key.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));

/** /proc/self/limits text → {soft, hard} (numbers; Infinity for "unlimited"; null when the row is absent). */
function readLimits(text) {
  const line = String(text || '').split('\n').find((l) => /^Max open files\b/.test(l));
  if (!line) return { soft: null, hard: null };
  const parts = line.replace(/^Max open files\s+/, '').trim().split(/\s+/);
  const num = (s) => (s === 'unlimited' ? Infinity : (Number.isFinite(Number(s)) ? Number(s) : null));
  return { soft: num(parts[0]), hard: num(parts[1]) };
}

/** One readlink(/proc/self/fd/N) target → its kind. */
function fdKind(target) {
  const t = String(target || '');
  if (!t) return 'other';
  if (t.startsWith('socket:')) return 'socket';
  if (t.startsWith('pipe:')) return 'pipe';
  if (t === '/dev/ptmx' || /^\/dev\/pts\/\d+$/.test(t)) return 'pty';
  if (t.startsWith('anon_inode:')) return 'anon';
  if (t.startsWith('/dev/')) return 'device';
  if (t.startsWith('/')) return 'file';
  return 'other';
}

/** Targets → {total, kinds: {kind: n}, topDirs: [{dir, n}] (≤ 3, files only)}. */
function tallyKinds(targets, { topN = 3 } = {}) {
  const kinds = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const dirs = new Map();
  let total = 0;
  for (const t of targets || []) {
    total++;
    const k = fdKind(t);
    kinds[k]++;
    if (k === 'file') {
      const s = String(t).replace(/ \(deleted\)$/, '');
      const i = s.lastIndexOf('/');
      const d = i > 0 ? s.slice(0, i) : '/';
      dirs.set(d, (dirs.get(d) || 0) + 1);
    }
  }
  const topDirs = [...dirs.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, topN).map(([dir, n]) => ({ dir, n }));
  return { total, kinds, topDirs };
}

/** THE GAUGE. {count, soft, now, lastReportAt} → {level:'ok'|'high'|'unknown', ratio, report}.
 *  A gauge that can FALL: the level is re-judged from the count every sample,
 *  so a leak that recedes reads `ok` at once (never latched). `report` = high
 *  AND no report within the last hour. */
function gaugeVerdict({ count, soft, now, lastReportAt = null } = {}) {
  const c = Number(count), s = Number(soft);
  if (!Number.isFinite(c) || c < 0 || !(s > 0) || s === Infinity) return { level: 'unknown', ratio: null, report: false };
  const ratio = c / s;
  if (ratio < GAUGE_RATIO) return { level: 'ok', ratio, report: false };
  const since = Number(lastReportAt);
  const report = !(Number.isFinite(since) && since > 0) || (Number(now) - since) >= GAUGE_REARM_MS;
  return { level: 'high', ratio, report };
}

/** THE ESTIMATE the boot log prints beside the limit — what this server
 *  should hold for the work it has, so a count far above it is a leak with a
 *  number. Per-item costs are MEASURED on the production server (2026-09-30,
 *  13 local sessions, 75 handles): one pty master per local dtach attach, one
 *  socket per browser client, three handles per event loop (io_uring +
 *  eventpoll + eventfd) for the main loop and each worker thread, two per
 *  proxied live stream (the client socket + its upstream), ~20 pipes of child
 *  stdio (the local daemon, the safe-fs workers' parent side, probes) and a
 *  handful of fixed ones (listen socket, inotify, /dev/null). */
function fdBudget({ sessions = 0, clients = 0, streams = 0, workers = 8, pipes = 20, base = 8 } = {}) {
  const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
  const rows = [
    { what: 'session pty masters', n: n(sessions) },
    { what: 'client sockets', n: n(clients) },
    { what: 'live streams', n: 2 * n(streams) },
    { what: 'event loops', n: 3 * (1 + n(workers)) },
    { what: 'child stdio pipes', n: n(pipes) },
    { what: 'fixed', n: n(base) },
  ];
  return { total: rows.reduce((a, r) => a + r.n, 0), rows };
}

/** /proc/self/mountinfo text + an absolute path → the mount it lives on
 *  {target, fstype, source} (longest mount-point prefix), or null. */
function mountOf(p, mountinfoText) {
  const file = String(p || '');
  if (!file.startsWith('/')) return null;
  let best = null;
  for (const line of String(mountinfoText || '').split('\n')) {
    const dash = line.indexOf(' - ');
    if (dash < 0) continue;
    const pre = line.slice(0, dash).split(' ');
    const post = line.slice(dash + 3).split(' ');
    const target = (pre[4] || '').replace(/\\040/g, ' ');
    if (!target) continue;
    const under = target === '/' || file === target || file.startsWith(target + '/');
    if (!under) continue;
    if (!best || target.length >= best.target.length) best = { target, fstype: post[0] || '', source: post[1] || '' };
  }
  return best;
}

/** WHO RAN OUT. {code, path, ownCount, soft, mount} → {who, words}.
 *  who: 'this-server' (our own count is at our own limit) ·
 *       'file-system' (EMFILE on a FUSE mount while we are far below ours —
 *                      the mount's daemon relayed ITS refusal) ·
 *       'system'      (ENFILE: the machine's file table) ·
 *       'unknown'     (an EMFILE we cannot place: say both numbers). */
function emfileBlame({ code, path: p = null, ownCount = null, soft = null, mount = null } = {}) {
  const own = Number(ownCount), lim = Number(soft);
  const counted = Number.isFinite(own) && own >= 0 && lim > 0 && lim !== Infinity;
  const held = counted ? `${own} of ${lim}` : (Number.isFinite(own) ? `${own}` : 'an unknown number');
  const where = p ? ` (${p})` : '';
  if (code === 'ENFILE') return { who: 'system', words: `The machine's file table is full (ENFILE)${where} — every process on it is refused; this server holds ${held} file handles.` };
  if (code !== 'EMFILE') return { who: 'unknown', words: `${code || 'error'}${where}` };
  if (counted && own >= SELF_BLAME_RATIO * lim) return { who: 'this-server', words: `This server ran out of file handles (EMFILE)${where}: it holds ${held}. The top holders are in the fd gauge's journal line.` };
  const fuse = mount && /^fuse/.test(String(mount.fstype || ''));
  if (fuse) {
    const params = { mount: mount.target, fstype: mount.fstype, held };
    return { who: 'file-system', words: fill(FS_BLAME_KEY, params) + where, i18n: { key: FS_BLAME_KEY, params } };
  }
  return { who: 'unknown', words: `Opening a file was refused with EMFILE${where} while this server holds ${held} file handles${mount ? ` (the path is on ${mount.target}, ${mount.fstype})` : ''}.` };
}

/** The gauge notice: {text, i18n} — the English sentence (journal + older
 *  clients) and the key + params the client words per device. The kinds are
 *  ordered largest first; the busiest folders ride inside {kinds}. */
function gaugeWords({ count, soft, kinds = {}, topDirs = [], refused = false } = {}) {
  const pct = soft > 0 ? Math.round((100 * count) / soft) : null;
  const byKind = KINDS.filter((k) => kinds[k] > 0).sort((a, b) => kinds[b] - kinds[a]).map((k) => `${k} ${kinds[k]}`).join(', ');
  const dirs = topDirs.length ? `; busiest folders: ${topDirs.map((d) => `${d.dir} (${d.n})`).join(', ')}` : '';
  const params = { count, pct, soft, kinds: refused ? 'not listable — not one handle is left to open /proc with' : (byKind || 'none counted') + dirs };
  return { text: fill(GAUGE_KEY, params), i18n: { key: GAUGE_KEY, params } };
}

module.exports = {
  GAUGE_RATIO, GAUGE_REARM_MS, GAUGE_SAMPLE_MS, SAMPLE_CAP, SELF_BLAME_RATIO, KINDS, GAUGE_KEY, FS_BLAME_KEY,
  readLimits, fdKind, tallyKinds, gaugeVerdict, fdBudget, mountOf, emfileBlame, gaugeWords,
};
