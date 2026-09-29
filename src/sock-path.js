'use strict';
/**
 * SHARED (node builtins only: crypto + fs by injection; CJS; the daemon bundles it) — WHERE A UNIX SOCKET
 * MAY LIVE (lane-pairing ④, B-7007; the owner's MacBook, 2026-09-27).
 *
 * The kernel's `sun_path` is a fixed byte array: 104 bytes on macOS and the BSDs, 108 on Linux, INCLUDING the
 * terminating NUL — so 103 / 107 usable bytes. The installer names a dial device's root
 * `$HOME/.vibespace/device@<dial host>`, and the owner's frp host name made
 * `/Users/…/.vibespace/device@…frp…/state/agentd.sock` 106 bytes: `listen EINVAL` on macOS, forever, while the
 * row said "offline". The tree already knew the bound twice (the ssh ControlPath dir in src/hosts.js, the
 * agent-browser socket rule in src/browser-profiles.js) — this is the daemon's own rule, ONE function the
 * daemon (listen), its `--stdio` bridge and the hub's local transport (src/agentd/client.js) all read.
 *
 * THE LADDER — the FIRST rung whose whole path fits the PLATFORM bound (`h` = sha1(root).hex[0..12], the
 * Windows pipe rule of agentd.js):
 *   1. natural      <root>/state/agentd.sock
 *   2. runtime-dir  <XDG_RUNTIME_DIR>/vibespace/d-<h>.sock      (Linux: per-user, 0700 by logind)
 *   3. tmpdir       <TMPDIR>/vibespace/d-<h>.sock               ONLY a per-user TMPDIR (macOS /var/folders/…)
 *   4. tmp          /tmp/vs-dev-<uid>/d-<h>.sock                the LITERAL /tmp (TMPDIR may be the long path
 *                                                               being escaped — browser-profiles' reasoning)
 *   5. none fits ⇒ `socket_path_too_long` (the daemon logs every rung's bytes and exits 7)
 * A directory the ladder picks (rungs 2–4) is created 0700 and VERIFIED before a socket goes in it:
 * `lstat` not a symlink, a directory, owned by us, no group/other bits — else `socket_dir_hijacked`
 * (a fixed name in a shared /tmp can be pre-created by anyone; no socket in somebody else's directory).
 *
 * THE WITNESS: after `listen` the daemon writes the path it listens on to `<root>/state/socket-path`. The
 * bridge and the hub read the witness FIRST (`witnessOrRule`) — launchd / systemd and a login shell need not
 * agree on TMPDIR / XDG_RUNTIME_DIR — and fall back to the rule (a daemon that has not started yet).
 *
 * Gate: scripts/test-sock-path.mjs (fast — the ladder table, the ownership verdict with a patched lstat, the
 * witness reader, the census of every socket path the tree builds, patched-copy controls).
 */
const crypto = require('crypto');

/** Bytes of `sun_path` INCLUDING the NUL, per platform (node's `process.platform` names). */
const SUN_PATH_MAX = Object.freeze({ darwin: 104, freebsd: 104, openbsd: 104, netbsd: 104, linux: 108, sunos: 108, default: 104 });
const WITNESS_NAME = 'socket-path';
const TMP_BASE = '/tmp';
const DIR_MODE = 0o700;
const VIAS = Object.freeze(['natural', 'runtime-dir', 'tmpdir', 'tmp']);

/** Usable bytes of a socket path on `platform` (the NUL is not ours). */
function maxBytes(platform) {
  const m = Object.prototype.hasOwnProperty.call(SUN_PATH_MAX, platform) ? SUN_PATH_MAX[platform] : SUN_PATH_MAX.default;
  return m - 1;
}
/** Bytes, not characters: the kernel counts bytes (a CJK home is 3 bytes a character). */
function utf8Bytes(s) { return Buffer.byteLength(String(s == null ? '' : s), 'utf8'); }
/** Does this path fit a socket on `platform`? */
function socketPathFits(p, platform) {
  const bytes = utf8Bytes(p), max = maxBytes(platform);
  return { fits: bytes <= max, bytes, max };
}
/** The 12-hex key of a root (the same derivation as the Windows pipe name in agentd.js). */
function rootHash(root) { return crypto.createHash('sha1').update(String(root)).digest('hex').slice(0, 12); }
const joinP = (...parts) => parts.map((p, i) => (i ? String(p).replace(/^\/+/, '') : String(p)).replace(/\/+$/, '')).join('/');
/** Is TMPDIR a PER-USER directory (macOS: /var/folders/… — a shared /tmp is not this rung)? */
function isPerUserTmpdir(tmpdir) {
  const t = String(tmpdir || '');
  return /^\/(private\/)?var\/folders\//.test(t);
}

/**
 * THE RULE. `{root, platform, tmpdir, xdgRuntimeDir, uid, tmpBase}` →
 *   `{path, via, bytes, max, natural, tried:[{via, path, bytes}]}` — the first rung that fits, or
 *   `{path: null, code: 'socket_path_too_long', max, natural, tried}`.
 * `tmpBase` is the literal '/tmp' in production (a suite may hand another to construct the none-fits cell).
 */
function daemonSocketPath({ root, platform = 'linux', tmpdir = '', xdgRuntimeDir = '', uid = null, tmpBase = TMP_BASE } = {}) {
  const r = String(root || '').replace(/\/+$/, '');
  const h = rootHash(r);
  const max = maxBytes(platform);
  const natural = joinP(r, 'state', 'agentd.sock');
  const rungs = [['natural', natural]];
  const xdg = String(xdgRuntimeDir || '');
  if (xdg.startsWith('/')) rungs.push(['runtime-dir', joinP(xdg, 'vibespace', `d-${h}.sock`)]);
  if (isPerUserTmpdir(tmpdir)) rungs.push(['tmpdir', joinP(String(tmpdir), 'vibespace', `d-${h}.sock`)]);
  rungs.push(['tmp', joinP(String(tmpBase || TMP_BASE), `vs-dev-${Number.isInteger(uid) && uid >= 0 ? uid : 'u'}`, `d-${h}.sock`)]);
  const tried = [];
  for (const [via, p] of rungs) {
    const bytes = utf8Bytes(p);
    tried.push({ via, path: p, bytes });
    if (bytes <= max) return { path: p, via, bytes, max, natural, tried };
  }
  return { path: null, code: 'socket_path_too_long', max, natural, tried };
}

/** The directory a non-natural rung puts its socket in (the one to create + verify); null for `natural`. */
function socketDirOf(pick) {
  if (!pick || !pick.path || pick.via === 'natural') return null;
  return pick.path.slice(0, pick.path.lastIndexOf('/'));
}

/**
 * The ownership VERDICT over an lstat result (PURE given `st`): a directory, not a symlink, owned by `uid`,
 * no group/other bits. → `{ok: true}` | `{ok: false, code: 'socket_dir_hijacked', why}`.
 */
function socketDirVerdict(st, uid) {
  const bad = (why) => ({ ok: false, code: 'socket_dir_hijacked', why });
  if (!st) return bad('it does not exist after mkdir');
  if (typeof st.isSymbolicLink === 'function' && st.isSymbolicLink()) return bad('it is a SYMLINK, not a directory — something else planted that name');
  if (typeof st.isDirectory === 'function' && !st.isDirectory()) return bad('it exists and is not a directory');
  if (Number.isInteger(uid) && st.uid !== uid) return bad(`it is owned by uid ${st.uid}, not this user (${uid}) — a socket never lives in somebody else's directory`);
  if ((Number(st.mode) & 0o077) !== 0) return bad(`its mode is ${(Number(st.mode) & 0o777).toString(8)} — group/other may enter it (want 700)`);
  return { ok: true };
}
/** Create (0700) and VERIFY the directory of a picked rung. `fs` injectable (the fast gate patches lstat). */
function ensureSocketDir(dir, { fs = require('fs'), uid = (typeof process.getuid === 'function' ? process.getuid() : null) } = {}) {
  if (!dir) return { ok: true };
  let st = null;
  try { st = fs.lstatSync(dir); } catch (e) { if (e && e.code !== 'ENOENT') return { ok: false, code: 'socket_dir_hijacked', why: `cannot stat it: ${e.message}` }; }
  if (!st) {
    try { fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE }); } catch (e) { return { ok: false, code: 'socket_dir_hijacked', why: `mkdir failed: ${e.message}` }; }
    try { st = fs.lstatSync(dir); } catch (e) { return { ok: false, code: 'socket_dir_hijacked', why: `vanished after mkdir: ${e.message}` }; }
  }
  return socketDirVerdict(st, uid);
}

/** `<root>/state/socket-path` — the daemon's own statement of where it listens. */
function witnessPathOf(root) { return joinP(String(root || '').replace(/\/+$/, ''), 'state', WITNESS_NAME); }
/**
 * THE READER (the `--stdio` bridge and the hub's local transport): the witness's path when the file exists AND
 * the path it names is a socket, else the rule with the caller's own environment.
 * → `{path, via: 'witness' | <rung>}` (path null when nothing fits).
 */
function witnessOrRule({ root, platform = process.platform, tmpdir = '', xdgRuntimeDir = '', uid = null, tmpBase = TMP_BASE, fs = require('fs') } = {}) {
  try {
    const p = String(fs.readFileSync(witnessPathOf(root), 'utf8')).split('\n')[0].trim();
    if (p && p.startsWith('/') && fs.statSync(p).isSocket()) return { path: p, via: 'witness' };
  } catch { /* no witness yet (or it names nothing live) — the rule */ }
  const pick = daemonSocketPath({ root, platform, tmpdir, xdgRuntimeDir, uid, tmpBase });
  return { path: pick.path, via: pick.via || pick.code };
}

/** The one log line the daemon writes when nothing fits (every rung's bytes). */
function tooLongLine(pick) {
  const rungs = (pick && pick.tried || []).map((t) => `${t.via} ${t.bytes} B (${t.path})`).join('; ');
  return `socket_path_too_long — no socket path fits ${pick && pick.max} bytes: ${rungs} — shorten VIBESPACE_DEVICE_ROOT or free a shorter TMPDIR`;
}

module.exports = {
  SUN_PATH_MAX, WITNESS_NAME, TMP_BASE, DIR_MODE, VIAS,
  maxBytes, utf8Bytes, socketPathFits, rootHash, isPerUserTmpdir, daemonSocketPath, socketDirOf,
  socketDirVerdict, ensureSocketDir, witnessPathOf, witnessOrRule, tooLongLine,
};
