'use strict';
/**
 * DESKTOP DISPLAY — machine FACTS and machine ACTS for desktop-app windows
 * (docs/design-desktop-apps §2 row 2; P8-1, 2026-09-13; r2 2026-09-14).
 * SHARED tier: node builtins + src/cli-identity.js only, so the device daemon
 * can bundle it later; `hostId` is a PARAMETER of every entry point (v1 is
 * local-only and REFUSES any other host by name — never a silent local
 * fallback).
 *
 * What lives here: which binaries exist (`binOnPath`, memoised YES-only like
 * `hostCanIdentify` — and RE-STATTED at every spawn, see `assertExecutable`),
 * X display allocation through `-displayfd` (never a guessed `:N` — two
 * keepers, a Wayland session's Xwayland and the singleton desktop all mint
 * displays on this box), the Xauthority cookie file (written in the binary
 * format directly — no `xauth` spawn, and the server reads the cookie under
 * ANY display number: measured 2026-09-13, a placeholder `:0` entry
 * authorised connections to the real `:3`, while a client with no entry for
 * `:3` was refused), the RFB banner READ-probe (the picture server is
 * "listening" when it sends `RFB 003.008`; measured: x11vnc answers a silent
 * client after ~320 ms — its websocket sniff — so the probe waits, it never
 * writes), THE BRING-UP RECIPES (`RECIPES`, one per name the PURE table's
 * `recipes[via]` can say — the keeper looks a name up and never spells a
 * rung), the window enumeration a P9 window target will reuse (`xdotool
 * search --onlyvisible` for the mapped set + ONE `xwininfo -root -tree` for
 * names/classes/geometry — two spawns per call whatever N is), the xpra
 * version probe, and the PROCESS facts the keeper's r2/r3 defects were all
 * missing: `listenerHeldBy` (WHO holds the 127.0.0.1:<port> LISTEN socket —
 * x11vnc 0.9.17 does not exit when its `-rfbport` is taken: measured, it
 * printed `PORT=<the requested port>` on stdout, bound `[::1]:<the same
 * number>` and left `127.0.0.1:<port>` to the stranger the bridge then
 * relays), `sessionCensus`/`sessionSample` (every pid in the SESSIONS the
 * keeper's detached leaders own — a `sh -c 'x & sleep'` wrapper's children,
 * the launcher whose work is in a child) and `environHas` (the per-session
 * env marker that identifies a straggler after its leader is gone and the
 * pid could have been recycled).
 *
 * What does NOT live here: decisions (which backend, whether to launch, when
 * to stop) and records — those are desktop-apps.js (PURE) and the keeper.
 *
 * EVERY SPAWN IS AWAITED AND KEEPS AN `error` LISTENER FOR LIFE (r2): a
 * ChildProcess whose spawn fails emits `error` asynchronously, and an `error`
 * event with no listener is an UNCAUGHT EXCEPTION that kills the whole
 * server — reproduced on the real keeper by probing a shim x11vnc, deleting
 * it and launching (`binOnPath` remembers a YES for good, so the memo handed
 * the keeper a path that no longer existed). `spawnDetached` resolves on the
 * child's `spawn` event and rejects on `error`, and the listener stays
 * attached so a later `error` (a signal that cannot be delivered) is a
 * rejected promise or a logged event, never a crash.
 *
 * MEASURED FACTS THIS FILE ENCODES (dev box, Ubuntu 25.10, x11vnc 0.9.17):
 *   · x11vnc EXITS when `WAYLAND_DISPLAY` is in its environment ("Wayland
 *     display server detected … Exiting"), even with `-display :N` naming an
 *     Xvfb; `x11Env()` strips it and pins XDG_SESSION_TYPE=x11 for every
 *     process on a private display (GTK/Qt get GDK_BACKEND=x11 / QT_QPA_PLATFORM=xcb
 *     for the same reason — a Wayland session's toolkits would otherwise ignore
 *     DISPLAY).
 *   · Xvfb answers `-displayfd` in ~40 ms; x11vnc's first banner ~350 ms after
 *     spawn; Xvfb 1024x768x24 = 65 MB RSS, x11vnc = 14.5 MB, xmessage = 5.8 MB.
 *   · both die cleanly on SIGTERM; `xwininfo -root -tree` lists an unmanaged
 *     top-level with name, class and geometry; `wmctrl -l` needs a WM.
 *   · x11vnc with a TAKEN `-rfbport` does not exit and does not autoport
 *     honestly: `-localhost` binds 127.0.0.1 AND ::1, the IPv4 bind fails,
 *     the IPv6 one succeeds on the SAME number, stdout still says
 *     `PORT=<requested>` — so the recorded number can be "right" while the
 *     address the bridge connects to belongs to somebody else. The only fact
 *     is the socket's owner.
 *
 * XPRA (P8-2, measured 2026-09-21 on xpra v6.5.3 / xpra-html5 21, this box):
 *   · `xpra start --daemon=no --displayfd=3` answers the display number on
 *     fd 3 ~1.2 s after spawn (it starts its own Xvfb, `--use-display=no`
 *     spelled so it never adopts a stranger's display), the `--bind-tcp`
 *     port answers `GET /` 200 (the html5 client) at ~2.3 s, and a GTK app
 *     started on the display has a mapped window at ~2.5 s. The port is the
 *     READY fact — xpra sniffs HTTP vs its own protocol on ONE socket, so the
 *     bridge relays a WebSocket to the same number.
 *   · idle RSS: xpra 86 MB + its Xvfb 98 MB at `-screen 0 4096x2304x24`
 *     (192 MB with xpra's default 8192x4096 — the framebuffer is the whole
 *     difference, and `--resize-display=yes` only ever resizes DOWN to the
 *     client, so 4096x2304 is the ceiling a 4K viewport can ask for) +
 *     gnome-calculator 132 MB; idle CPU over 10 s with no client: 0 %.
 *   · `xpra info tcp://127.0.0.1:<port>` costs ~115-135 ms and a full
 *     connection per call (1,048 lines, a `windows.<xid>.*` family with
 *     title/class-instance/pid/size) — too dear for a poll. The live window
 *     title + icon ride the html5 PROTOCOL for free (`new-window` /
 *     `window-metadata` / `window-icon` packets, pushed on every change) and
 *     that is what the client renders; the server-side snapshot a route wants
 *     is `enumerateWindows` (two spawns, ~10 ms) through `seamlessWindows`,
 *     which drops xpra's own `Xpra-CorralWindow-*` wrappers and 1x1 leaders.
 *   · with XAUTHORITY unset in its env, `xpra start` wrote the cookie into
 *     the user's REAL ~/.Xauthority (mtime moved during the measurement);
 *     the recipe pins XAUTHORITY to the per-app file and xpra's `xauth add`
 *     lands there, so the app started with the same file is admitted.
 *   · `--commands=no` disables `--start*` too (measured: no "started command"
 *     line, no app) — the recipe leaves commands on and starts NOTHING
 *     through xpra: the keeper spawns the app itself (its own detached
 *     leader, handle + starttime + session marker — every keeper rule
 *     unchanged; under xpra's `--start-child` the app would be xpra's child
 *     with no handle, and its exit would read as `display-gone`).
 *   · xpra's `--input-method=auto` launches an ibus-daemon that wrote under
 *     the real ~/.config/ibus; `none` keeps the session to xpra + Xvfb.
 */
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const cliIdentity = require('./cli-identity');

const LOCAL_HOST_IDS = new Set([null, undefined, '', 'local']);
function assertLocal(hostId, what) {
  if (LOCAL_HOST_IDS.has(hostId)) return;
  const e = new Error(`desktop-display ${what}: host ${JSON.stringify(String(hostId))} — desktop apps are local-only in v1 (the daemon op is not written yet)`);
  e.code = 'unsupported-host';
  throw e;
}
const namedError = (code, msg) => { const e = new Error(msg); e.code = code; return e; };

// ── binaries on PATH ─────────────────────────────────────────────────────────
/** A YES is a platform fact and is remembered for good; a NO is re-checked
 *  after BIN_RECHECK_MS (a package install must be seen without a restart).
 *  A memoised YES is a PROBE answer, not a guarantee at spawn time — every
 *  spawn re-stats its path through `assertExecutable`, which forgets a YES
 *  that stopped being true. */
const BIN_RECHECK_MS = 60000;
const _binMemo = new Map(); // name -> { at, path }
function binOnPath(name, { env = process.env, now = Date.now } = {}) {
  if (typeof name !== 'string' || !name || /[\/\0]/.test(name)) return null;
  const hit = _binMemo.get(name);
  if (hit && (hit.path || now() - hit.at < BIN_RECHECK_MS)) return hit.path;
  let found = null;
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, name);
    try { const st = fs.statSync(p); if (st.isFile() && (st.mode & 0o111)) { found = p; break; } } catch { /* not here */ }
  }
  _binMemo.set(name, { at: now(), path: found });
  return found;
}
function resetBinMemo() { _binMemo.clear(); }
/** Drop ONE memoised answer (a YES that a re-stat just refuted). */
function forgetBin(name) { _binMemo.delete(name); }
/** Re-stat a binary path IMMEDIATELY before spawning it. Throws a named
 *  `exec-vanished` and forgets the memo when the path is no longer an
 *  executable file — the next `hostFacts` re-probes it. */
function assertExecutable(binPath, name) {
  try {
    const st = fs.statSync(binPath);
    if (st.isFile() && (st.mode & 0o111)) return binPath;
  } catch { /* fall through */ }
  if (name) forgetBin(name);
  throw namedError('exec-vanished', `${name || path.basename(String(binPath))} is no longer an executable at ${binPath} (it was when probed; uninstalled or replaced since)`);
}

/** Every binary a backend rung, a light WM or the enumeration may need. */
const PROBE_BINS = Object.freeze(['xpra', 'Xvnc', 'Xtigervnc', 'Xvfb', 'x11vnc', 'xfwm4', 'openbox', 'xdotool', 'wmctrl', 'xwininfo', 'xdpyinfo', 'xauth', 'xrdb']);

/** `{ hostId, bins: { name: path|null }, xpra: { version, raw } | null, at }`. */
async function hostFacts({ hostId = null, env = process.env, bins = PROBE_BINS, now = Date.now } = {}) {
  assertLocal(hostId, 'hostFacts');
  const out = {};
  for (const b of bins) out[b] = binOnPath(b, { env, now });
  const xpra = out.xpra ? { ...(await xpraVersion({ binPath: out.xpra, env })), www: xpraWwwDir({ binPath: out.xpra, env }) } : null;
  return { hostId: 'local', bins: out, xpra, at: now() };
}

// ── env for a process on a private X display ─────────────────────────────────
/** The env every process on a keeper-owned display gets: the caller's
 *  (already sanitised) base minus the Wayland session, plus the display and
 *  its cookie file. See the x11vnc fact in the header. */
function x11Env(base, { display, authFile }) {
  const env = { ...base };
  delete env.WAYLAND_DISPLAY;
  env.DISPLAY = display;
  env.XAUTHORITY = authFile;
  env.XDG_SESSION_TYPE = 'x11';
  env.GDK_BACKEND = 'x11';
  env.QT_QPA_PLATFORM = 'xcb';
  return env;
}

// ── Xauthority ───────────────────────────────────────────────────────────────
const FAMILY_LOCAL = 256;
const COOKIE_PROTO = 'MIT-MAGIC-COOKIE-1';
function newCookie() { return crypto.randomBytes(16).toString('hex'); }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n, 0); return b; }
function xauthEntry({ display, cookieHex, host = os.hostname() }) {
  const addr = Buffer.from(host, 'utf8');
  const num = Buffer.from(String(display).replace(/^:/, ''), 'utf8');
  const name = Buffer.from(COOKIE_PROTO, 'utf8');
  const data = Buffer.from(cookieHex, 'hex');
  return Buffer.concat([u16(FAMILY_LOCAL), u16(addr.length), addr, u16(num.length), num, u16(name.length), name, u16(data.length), data]);
}
/** Write (replace) an Xauthority file with one entry per display, mode 0600.
 *  The X SERVER only needs the cookie to be present under SOME entry (it
 *  ignores address/display); CLIENTS look the entry up by display, so the
 *  keeper writes a placeholder before the server starts and the real display
 *  once `-displayfd` has answered. */
function writeXauthority(file, entries) {
  const buf = Buffer.concat(entries.map(xauthEntry));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf, { mode: 0o600 });
  fs.renameSync(tmp, file);
  return file;
}

// ── ports + the RFB banner probe ─────────────────────────────────────────────
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
/** Read the RFB banner from 127.0.0.1:port — resolves the banner string or
 *  null (refused / nothing within timeoutMs). Writes NOTHING. */
function rfbBanner(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; clearTimeout(t); try { s.destroy(); } catch { } resolve(v); };
    const s = net.connect({ port, host: '127.0.0.1' });
    const t = setTimeout(() => finish(null), timeoutMs);
    s.once('data', (b) => finish(b.toString('latin1')));
    s.once('error', () => finish(null));
  });
}
/** Wait until the banner answers or the deadline passes / a watched child
 *  exits. Returns { ok, banner, why }. A banner is LIVENESS, never identity —
 *  the caller still asks `listenerHeldBy` who answered. */
async function waitForRfb(port, { deadlineMs = 10000, child = null, now = Date.now, stepMs = 100 } = {}) {
  const until = now() + deadlineMs;
  let exited = null;
  if (child) child.once('exit', (code, signal) => { exited = { code, signal }; });
  while (now() < until) {
    if (exited) return { ok: false, banner: null, why: `picture server exited (${exited.signal || `code ${exited.code}`}) before listening` };
    const b = await rfbBanner(port, Math.max(200, Math.min(1500, until - now())));
    if (b && /^RFB /.test(b)) return { ok: true, banner: b.trim(), why: null };
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return { ok: false, banner: null, why: `picture server did not answer on 127.0.0.1:${port} within ${deadlineMs} ms` };
}

/** ONE HTTP GET against 127.0.0.1:port — resolves the status code, or null
 *  (refused / no answer within timeoutMs). xpra's `--bind-tcp` socket answers
 *  `GET /` with its html5 client the moment the server is ready (P8-2). */
function httpProbe(port, { path: p = '/', timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; clearTimeout(t); resolve(v); };
    let req;
    try { req = http.get({ host: '127.0.0.1', port, path: p, timeout: timeoutMs, headers: { connection: 'close' } }, (res) => { res.resume(); finish(res.statusCode); }); }
    catch { finish(null); return; }
    const t = setTimeout(() => { try { req.destroy(); } catch { } finish(null); }, timeoutMs);
    req.on('error', () => finish(null));
    req.on('timeout', () => { try { req.destroy(); } catch { } finish(null); });
  });
}
/** Like waitForRfb, for a port that speaks HTTP (xpra). */
async function waitForHttp(port, { deadlineMs = 10000, child = null, now = Date.now, stepMs = 100 } = {}) {
  const until = now() + deadlineMs;
  let exited = null;
  if (child) child.once('exit', (code, signal) => { exited = { code, signal }; });
  while (now() < until) {
    if (exited) return { ok: false, banner: null, why: `picture server exited (${exited.signal || `code ${exited.code}`}) before listening` };
    const st = await httpProbe(port, { timeoutMs: Math.max(200, Math.min(1500, until - now())) });
    if (st) return { ok: true, banner: `HTTP ${st}`, why: null };
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return { ok: false, banner: null, why: `picture server did not answer HTTP on 127.0.0.1:${port} within ${deadlineMs} ms` };
}
/** The LISTEN probe of a rung's own kind: 'rfb' = the banner read, 'http' =
 *  xpra's GET /. A recipe says which (`probe`), the keeper never spells it. */
const LISTEN_PROBES = Object.freeze({ rfb: waitForRfb, http: waitForHttp });
function waitForListen(kind, port, opts = {}) {
  const fn = LISTEN_PROBES[kind];
  if (!fn) return Promise.resolve({ ok: false, banner: null, why: `unknown listen probe ${JSON.stringify(kind)}` });
  return fn(port, opts);
}
/** ONE shot of the same probe (boot adoption): does 127.0.0.1:port answer as
 *  `kind` right now? */
async function portAnswers(kind, port, timeoutMs = 1500) {
  if (!port) return false;
  if (kind === 'http') return !!(await httpProbe(port, { timeoutMs }));
  const b = await rfbBanner(port, timeoutMs);
  return !!(b && /^RFB /.test(b));
}

// ── who holds a listening socket (the identity the banner cannot give) ──────
/** The inode of the LISTEN socket that 127.0.0.1:<port> resolves to on this
 *  box — a 127.0.0.1-bound listener first (the kernel matches the most
 *  specific bind), else a 0.0.0.0-bound one — read from /proc/net/tcp. null =
 *  no IPv4 listener on that port (an `[::1]`-only bind is NOT one: the bridge
 *  connects to 127.0.0.1). */
function listenerInode(port, { procRoot = '/proc' } = {}) {
  let text = '';
  try { text = fs.readFileSync(`${procRoot}/net/tcp`, 'utf8'); } catch { return null; }
  const want = Number(port).toString(16).toUpperCase().padStart(4, '0');
  let loop = null, any = null;
  for (const line of text.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10 || f[3] !== '0A') continue; // 0A = TCP_LISTEN
    const [addr, p] = f[1].split(':');
    if (p !== want) continue;
    const inode = Number(f[9]);
    if (!Number.isInteger(inode)) continue;
    if (addr === '0100007F') loop = inode; else if (addr === '00000000') any = inode;
  }
  return loop != null ? loop : any;
}
/** Does `pid` hold the socket `inode` among its open fds? (readlink of every
 *  /proc/<pid>/fd entry — bounded by ONE process's fd table, never a walk.) */
function pidHoldsInode(pid, inode, { procRoot = '/proc' } = {}) {
  const want = `socket:[${inode}]`;
  let fds = [];
  try { fds = fs.readdirSync(`${procRoot}/${pid}/fd`); } catch { return false; }
  for (const fd of fds) {
    try { if (fs.readlinkSync(`${procRoot}/${pid}/fd/${fd}`) === want) return true; } catch { /* closed meanwhile */ }
  }
  return false;
}
/** Which of `pids` holds the 127.0.0.1:<port> LISTEN socket — that pid, or
 *  null when none of them does (nobody listens, or a STRANGER does). The
 *  caller hands it the picture server's whole SESSION (an Xvnc shim's real
 *  x11vnc is its child), never the box's process table. */
function listenerHeldBy(port, pids, opts = {}) {
  const inode = listenerInode(port, opts);
  if (inode == null) return null;
  for (const pid of pids || []) if (pidHoldsInode(pid, inode, opts)) return pid;
  return null;
}

// ── spawning: DETACHED, AWAITED, an `error` listener for life ───────────────
/**
 * Spawn a child that must SURVIVE a VibeSpace restart (setsid + unref).
 * Returns { child, spawned }: `spawned` resolves with the child on its
 * `spawn` event and rejects (named `spawn-failed`) on `error` — the caller
 * awaits it BEFORE recording a pid. The `error` listener is permanent: a
 * ChildProcess `error` with no listener is an uncaught exception, i.e. the
 * whole server (r2's HIGH). `extraStdio` adds fd 3 (`-displayfd`).
 */
function spawnDetached(bin, args, { env, cwd, logFd = 'ignore', extraStdio = null, name = null } = {}) {
  const label = name || path.basename(String(bin));
  const stdio = ['ignore', logFd, logFd];
  if (extraStdio) stdio.push(extraStdio);
  let child;
  try { child = spawn(bin, args, { env, cwd: cwd || undefined, detached: true, stdio }); }
  catch (e) { const p = Promise.reject(namedError('spawn-failed', `${label} failed to spawn: ${e.message}`)); p.catch(() => { }); return { child: null, spawned: p }; }
  child.unref();
  let settled = false;
  const spawned = new Promise((resolve, reject) => {
    child.once('spawn', () => { if (!settled) { settled = true; resolve(child); } });
    child.on('error', (e) => { if (!settled) { settled = true; reject(namedError('spawn-failed', `${label} failed to spawn: ${e.message}`)); } });
  });
  spawned.catch(() => { }); // the caller awaits; nothing may turn a rejection between here and there into an unhandled one
  return { child, spawned };
}

// ── X servers ────────────────────────────────────────────────────────────────
/** The argv of each X server this module can start, keyed by binary name —
 *  a table, so a new server is a row (Xtigervnc is spelled Xvnc by its own
 *  package). Every row reports its display on fd 3 (`-displayfd 3`). */
const X_SERVER_ARGS = Object.freeze({
  Xvfb: ({ authFile, geometry, depth }) => ['-displayfd', '3', '-auth', authFile, '-nolisten', 'tcp', '-screen', '0', `${geometry}x${depth}`],
  // -localhost + SecurityTypes None is safe BECAUSE the only route in is the
  // cookie-authed ws bridge; -UseBlacklist 0 is REQUIRED (src/vnc.js: our own
  // read-probes count as failed attempts and lock localhost out).
  // -AcceptSetDesktopSize (P8-2 x4, MEASURED 2026-09-22 on Xtigervnc 1.15 with
  // this exact argv): the framebuffer FOLLOWS the client's SetDesktopSize —
  // 1280x800 → 900x600 answered with an ExtendedDesktopSize rect (status 0)
  // in 43 ms, xdpyinfo/xrandr showing the new size at 50 ms, growing past
  // -geometry (1600x1000) and back; `-AcceptSetDesktopSize=0` is the ONE
  // lever that refuses it (the framebuffer stayed 1280x800), while
  // `-extension RANDR` only blinds xrandr on the X side and the client resize
  // still lands. The default is on; it is spelled so the invariant "the
  // display follows the window" is in the argv, not in a distro default.
  Xvnc: ({ authFile, geometry, depth, rfbPort }) => ['-displayfd', '3', '-auth', authFile, '-nolisten', 'tcp', '-localhost', '-SecurityTypes', 'None', '-UseBlacklist', '0', '-AcceptSetDesktopSize', '-rfbport', String(rfbPort), '-geometry', geometry, '-depth', String(depth)],
});
/**
 * Start an X server and learn its display number from `-displayfd` (fd 3),
 * never from a guess. Resolves { display:':N', pid, child } when the server
 * has written its number (= it is accepting connections); rejects on a spawn
 * failure, exit-before-ready or after `deadlineMs`. The child is DETACHED and
 * unref'd: it must survive a VibeSpace restart, that is the whole point of
 * the keeper.
 */
function startXServer({ bin, binPath, authFile, geometry = '1280x800', depth = 24, rfbPort = null, env, logFd = 'ignore', deadlineMs = 10000 }) {
  const argsOf = X_SERVER_ARGS[bin];
  if (!argsOf) return Promise.reject(namedError('unknown-x-server', `startXServer: unknown X server ${bin}`));
  const args = argsOf({ authFile, geometry, depth, rfbPort });
  return new Promise((resolve, reject) => {
    const { child, spawned } = spawnDetached(binPath || bin, args, { env, logFd, extraStdio: 'pipe', name: bin });
    let settled = false;
    const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(t); fn(v); };
    const t = setTimeout(() => { if (!settled) { try { child?.kill('SIGTERM'); } catch { } done(reject, namedError('x-timeout', `${bin} did not report a display within ${deadlineMs} ms`)); } }, deadlineMs);
    spawned.catch((e) => done(reject, e));
    if (!child) return;
    child.once('exit', (code, signal) => done(reject, namedError('x-exited', `${bin} exited (${signal || `code ${code}`}) before reporting a display`)));
    let buf = '';
    child.stdio[3].on('data', (b) => {
      buf += b.toString('utf8');
      const m = /^\s*(\d+)\s*\n/.exec(buf);
      if (m) { child.stdio[3].destroy(); done(resolve, { display: `:${m[1]}`, pid: child.pid, child }); }
    });
  });
}

/** x11vnc bound to loopback on a private display: -forever (a client leaving
 *  does not end the server), -shared (N browsers on one display). Resolves
 *  the child once SPAWNED; rejects a spawn failure by name. */
function startX11vnc({ binPath, display, authFile, rfbPort, env, logFd = 'ignore' }) {
  const args = ['-display', display, '-auth', authFile, '-localhost', '-rfbport', String(rfbPort), '-forever', '-shared', '-nopw', '-quiet'];
  return spawnDetached(binPath || 'x11vnc', args, { env, logFd, name: 'x11vnc' }).spawned;
}

/**
 * The argv of `xpra start` for ONE seamless app session (P8-2; every flag
 * chosen against `xpra start --help` on v6.5.3 and recorded here):
 *   --daemon=no            the keeper owns the pid (detached by spawnDetached, not by xpra)
 *   --displayfd=3          the display number arrives on fd 3, never guessed
 *   --use-display=no       start our own Xvfb; never adopt a display somebody else runs
 *   --xvfb=…4096x2304x24   the framebuffer IS the RSS (98 MB vs 192 MB at the 8192x4096 default);
 *                          resize-display only shrinks to the client, so this is the ceiling a viewport can ask for
 *   --html=on              serve the html5 client on the same socket (the validation slice hosts it behind our auth)
 *   --bind-tcp=127.0.0.1:P one loopback socket: HTTP + WebSocket + the xpra protocol, sniffed;
 *                          `,stop=no,exit=no,detach=no,run=no,info=no,screenshot=no,print=no`
 *                          (XPRA_BIND_REFUSALS) refuses every hello `request` that ACTS on the
 *                          session — measured 6.5.3: without it a hello carrying `request: stop`
 *                          or `exit` from ANY client ended the server (record exited / failed);
 *                          with it xpra answers `disconnect permission error: 'stop' requests are
 *                          not enabled for this connection` and lives. The server's lifecycle is
 *                          the keeper's; the bridge drops the packet spellings (desktop-stream
 *                          XPRA_LIFECYCLE_TYPES) and XPRA_CLIENT_CAN_SHUTDOWN=0 in xpra's env
 *                          makes xpra itself ignore `shutdown-server` (exit-server has no such
 *                          switch in 6.5.3 — the bridge is its only gate)
 *   --bind=none            no unix socket (nothing under ~/.xpra or /run/user); --socket-dir/--sessions-dir
 *                          keep xpra's session files under the app dir all the same
 *   --resize-display=yes   the virtual screen follows the client's viewport (RANDR)
 *   --clipboard=yes --clipboard-direction=both   text both ways (owner acceptance 2)
 *   --exit-with-children=no / --terminate-children=no   xpra starts nothing (see the header): the keeper's app is its own leader
 *   --notifications=no --audio=no --pulseaudio=no --speaker=disabled --microphone=disabled --printing=no
 *   --webcam=no --file-transfer=no --open-files=no --open-url=no --system-tray=no --bell=no   each off BY NAME
 *   --mdns=no --systemd-run=no --dbus=no --dbus-launch=no --dbus-control=no   no publishing, no cgroup wrapper, no bus
 *   --input-method=none    no ibus-daemon (it wrote under the real ~/.config/ibus)
 *   --start-new-commands=no --shell=no --opengl=no --splash=no --remote-logging=no --http-scripts=off
 *   (NOT --mmap=no: xpra 6.5.3 blocks the whole `xpra.net.mmap` package in sys.modules for
 *   that flag and its per-connection image-filter class then fails to import — EVERY client
 *   was answered `disconnect: connection error / error accepting new connection`, measured;
 *   a browser cannot mmap a server anyway, the default costs nothing over TCP)
 *   --sharing=yes --lock=no   N browsers on one session, none may lock the others out
 *   --pidfile=<dir>/xpra/server.pid   under the app dir (never $XPRA_SESSION_DIR); with
 *                          --daemon=no xpra logs to stderr = the app dir's app.log (a
 *                          --log-file only applies when daemonising — measured: none written)
 *   --dpi=<n>              THE DISPLAY'S FONT DPI (2.369.158, HiDPI): xpra writes it as Xft.dpi into the
 *                          resource manager AND as Xft/DPI into XSETTINGS before any client connects —
 *                          but ~1 s AFTER the display is up (measured 6.5.3: the recipe returns, the app
 *                          would start at ~0.2 s, Xft.dpi appears at ~1.25 s and the write REPLACES the
 *                          whole database), so the keeper waits for it (`waitForXftDpi`) before it merges
 *                          its own resources and starts the app. It is 96 × scale / GDK_SCALE
 *                          (PURE desktop-apps `scaleKnobs`) — the integer part of the scale is GDK_SCALE in
 *                          the app's env, and Xft.dpi MULTIPLIES with it (GDK_SCALE=2 + Xft.dpi 192 = 4× text,
 *                          measured on GTK 3.24 and 4.22). Spelled always, 96 included, so the value is in
 *                          the argv and never a client's: the client sends the SAME dpi (xpra rewrites
 *                          Xft.dpi to a client's dpi when it changes — measured 96 → 144).
 * `--commands` stays at its default: `no` disables every `--start*` (measured), and a
 * future recipe may want one.
 */
const XPRA_GEOMETRY_MAX = '4096x2304';
/** Socket options on `--bind-tcp`: the hello `request`s that act on (or read out) the session, refused by xpra. */
const XPRA_BIND_REFUSALS = 'stop=no,exit=no,detach=no,run=no,info=no,screenshot=no,print=no';
const XPRA_ARGS = ({ port, dir, geometryMax = XPRA_GEOMETRY_MAX, dpi = 96 }) => [
  'start', '--daemon=no', '--displayfd=3', '--use-display=no',
  `--xvfb=Xvfb -screen 0 ${geometryMax}x24 +extension GLX +extension RANDR +extension RENDER +extension Composite -extension DOUBLE-BUFFER -nolisten tcp -noreset -auth $XAUTHORITY`,
  '--html=on', `--bind-tcp=127.0.0.1:${port},${XPRA_BIND_REFUSALS}`, '--bind=none', `--socket-dir=${dir}/xpra`, `--sessions-dir=${dir}/xpra`,
  '--resize-display=yes', '--clipboard=yes', '--clipboard-direction=both',
  '--exit-with-children=no', '--terminate-children=no',
  '--notifications=no', '--audio=no', '--pulseaudio=no', '--speaker=disabled', '--microphone=disabled', '--printing=no',
  '--webcam=no', '--file-transfer=no', '--open-files=no', '--open-url=no', '--system-tray=no', '--bell=no',
  '--mdns=no', '--systemd-run=no', '--dbus=no', '--dbus-launch=no', '--dbus-control=no',
  '--input-method=none', '--start-new-commands=no', '--shell=no', '--opengl=no', '--splash=no', '--remote-logging=no', '--http-scripts=off',
  '--sharing=yes', '--lock=no',
  `--pidfile=${dir}/xpra/server.pid`,
  `--dpi=${Number.isInteger(dpi) && dpi >= 48 && dpi <= 288 ? dpi : 96}`,
];
/**
 * Start ONE xpra seamless server on a free loopback port and learn its display
 * from `--displayfd=3` (the same fd-3 discipline as startXServer; ~1.2 s
 * measured). Resolves { display, pid, child } once the number arrived — the
 * PORT is not ready yet at that instant (the keeper waits for the HTTP
 * answer through `waitForListen('http', …)`). Detached + unref'd like every
 * part; a spawn failure / exit-before-ready / deadline is a named rejection.
 */
function startXpra({ binPath, port, dir, env, logFd = 'ignore', deadlineMs = 15000, geometryMax = XPRA_GEOMETRY_MAX, dpi = 96 }) {
  const args = XPRA_ARGS({ port, dir, geometryMax, dpi });
  return new Promise((resolve, reject) => {
    // XPRA_CLIENT_CAN_SHUTDOWN=0: xpra ignores a client's `shutdown-server` (server/base.py `_request_stop`) — the keeper stops it
    const { child, spawned } = spawnDetached(binPath || 'xpra', args, { env: { ...(env || process.env), XPRA_CLIENT_CAN_SHUTDOWN: '0' }, logFd, extraStdio: 'pipe', name: 'xpra' });
    let settled = false;
    const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(t); fn(v); };
    const t = setTimeout(() => { if (!settled) { try { child?.kill('SIGTERM'); } catch { } done(reject, namedError('x-timeout', `xpra did not report a display within ${deadlineMs} ms`)); } }, deadlineMs);
    spawned.catch((e) => done(reject, e));
    if (!child) return;
    child.once('exit', (code, signal) => done(reject, namedError('x-exited', `xpra exited (${signal || `code ${code}`}) before reporting a display — see xpra.log in the app dir`)));
    let buf = '';
    child.stdio[3].on('data', (b) => {
      buf += b.toString('utf8');
      const m = /^\s*(\d+)\s*\n/.exec(buf);
      if (m) { child.stdio[3].destroy(); done(resolve, { display: `:${m[1]}`, pid: child.pid, child }); }
    });
  });
}
/** Where the installed xpra ships its html5 client (the validation slice
 *  hosts it behind VibeSpace's auth): `<prefix>/share/xpra/www` beside the
 *  binary's prefix, else the two packaging spellings; null when none has an
 *  index.html. XPRA_WWW_DIR (an operator's own build) wins when it exists. */
function xpraWwwDir({ binPath = null, env = process.env } = {}) {
  const cands = [];
  if (env && env.XPRA_WWW_DIR) cands.push(env.XPRA_WWW_DIR);
  if (binPath) cands.push(path.resolve(path.dirname(binPath), '..', 'share', 'xpra', 'www'));
  cands.push('/usr/share/xpra/www', '/usr/local/share/xpra/www', '/usr/share/xpra/html5');
  for (const d of cands) { try { if (fs.statSync(path.join(d, 'index.html')).isFile()) return d; } catch { /* next */ } }
  return null;
}
/** The APPLICATION's windows on an xpra display: xpra is the window manager
 *  there and wraps every managed top-level in an `Xpra-CorralWindow-<xid>`
 *  frame (measured: `0x200006 "Xpra-CorralWindow-0xa00005"` around
 *  `0xa00005 "Calculator"`), keeps 1x1 helper windows of its own and the
 *  toolkit's 1x1 group leaders — none of those is a window a user sees. */
function seamlessWindows(rows) {
  return (rows || []).filter((w) => w && !(typeof w.name === 'string' && /^Xpra(-CorralWindow-|$)/.test(w.name)) && w.w > 1 && w.h > 1 && (w.cls || w.instance || w.name));
}

/** A light window manager when one is present (xfwm4 preferred, else
 *  openbox); resolves { name, child } or null. Bare X otherwise — the app
 *  still renders, it just has no title bar. A WM that fails to spawn is a
 *  named rejection, never a crash. */
async function startWindowManager({ bins, env, logFd = 'ignore' }) {
  const pick = bins.xfwm4 ? ['xfwm4', bins.xfwm4, ['--replace']] : bins.openbox ? ['openbox', bins.openbox, []] : null;
  if (!pick) return null;
  const [name, binPath, args] = pick;
  assertExecutable(binPath, name);
  const child = await spawnDetached(binPath, args, { env, logFd, name }).spawned;
  return { name, child };
}

/** Spawn the APPLICATION itself, detached, stdout/err to the app log.
 *  Resolves the child once SPAWNED; rejects a spawn failure by name. */
function startApp({ exec, args = [], cwd, env, logFd = 'ignore' }) {
  return spawnDetached(exec, args, { env, cwd, logFd, name: path.basename(String(exec)) }).spawned;
}

/**
 * Merge X resources into a display's resource database BEFORE its app starts
 * (2.369.158, HiDPI — PURE desktop-apps `scaleKnobs().xresources`: an Xft face
 * for xterm at a scale > 1, whose default bitmap font no dpi reaches; measured).
 * `xrdb -merge` from stdin, async with a deadline (never a sync spawn). Resolves
 * `{ ok, why }` — a missing xrdb or a failure is REPORTED, never thrown: the app
 * still starts, only its bitmap-font terminal stays at 1×.
 */
function applyXResources({ binPath, env, text, deadlineMs = 5000 }) {
  if (!text) return Promise.resolve({ ok: true, why: null });
  if (!binPath) return Promise.resolve({ ok: false, why: 'xrdb not on PATH' });
  return new Promise((resolve) => {
    let child;
    try { child = execFile(binPath, ['-merge'], { env, timeout: deadlineMs }, (err) => resolve(err ? { ok: false, why: `xrdb -merge failed: ${err.message.split('\n')[0]}` } : { ok: true, why: null })); }
    catch (e) { resolve({ ok: false, why: `xrdb -merge failed: ${e.message}` }); return; }
    child.stdin.on('error', () => { /* the exit callback reports */ });
    child.stdin.end(text);
  });
}

/**
 * Wait until xpra has written ITS resource database (r2, 2.369.158 — the verifier's race, measured on
 * 6.5.3): xpra REPLACES the display's RESOURCE_MANAGER (Xft.dpi, Xcursor.size, …) about a second
 * AFTER its display is up — after the recipe returns — so an app started at once read Xvfb's own
 * 100 dpi (a "1.5×" xterm got a 7×14 cell, not 10×19), and the X resources merged before that write
 * were wiped (the XTerm* Xft face gone). `xrdb -query` is polled (async, each query under its own
 * deadline) until an `Xft.dpi:` line is there; resolves `{ ok, dpi, ms, why }` — a missing xrdb, a
 * failing query or the deadline is REPORTED, never thrown (the app still starts).
 */
function waitForXftDpi({ binPath, env, deadlineMs = 5000, stepMs = 100, now = Date.now } = {}) {
  if (!binPath) return Promise.resolve({ ok: false, dpi: null, ms: 0, why: 'xrdb not on PATH' });
  const t0 = now();
  return new Promise((resolve) => {
    let lastErr = null;
    const tick = () => {
      execFile(binPath, ['-query'], { env, timeout: Math.min(2000, deadlineMs) }, (err, stdout) => {
        const m = !err && /^Xft\.dpi:\s*(\d+(?:\.\d+)?)\s*$/m.exec(String(stdout || ''));
        if (m) { resolve({ ok: true, dpi: Number(m[1]), ms: now() - t0, why: null }); return; }
        if (err) lastErr = err.message.split('\n')[0];
        if (now() - t0 + stepMs > deadlineMs) { resolve({ ok: false, dpi: null, ms: now() - t0, why: `no Xft.dpi in the display's resources within ${deadlineMs} ms${lastErr ? ` (xrdb: ${lastErr})` : ''}` }); return; }
        setTimeout(tick, stepMs);
      });
    };
    tick();
  });
}

// ── the bring-up RECIPES (one per name the PURE table can say) ──────────────
/**
 * Each recipe brings up the DISPLAY HALF of a session and returns
 * `{ display, port, shared, authFile? }`; the keeper starts the window
 * manager and the application afterwards and records what the recipe hands
 * it THROUGH `ctx.onPart(part, child, facts)` — called the moment each pid is
 * known, so a failure one step later still leaves a reapable record. ctx =
 *   { bins, dir (the per-app dir), authFile, cookie, geometry, base (sanitised env), logFd,
 *     dpi (the display's font dpi — the xpra recipe spells it; 96 elsewhere),
 *     freePort, x11Env(display), writeAuth(display), onPart, singleton() }
 * A recipe may add `wm:false` (it IS the window manager) and `probe:'http'`
 * (its READY fact is an HTTP answer, not an RFB banner) to what it returns.
 * Every spawn inside a recipe is re-statted and awaited (see the header);
 * a rejection is a named error the keeper turns into `failed` + teardown.
 */
const RECIPES = Object.freeze({
  /** ONE process is both the X server and the picture server (Xvnc). */
  'x-serves-rfb': async (ctx) => {
    assertExecutable(ctx.bins.Xvnc, 'Xvnc');
    const port = await ctx.freePort();
    const x = await startXServer({ bin: 'Xvnc', binPath: ctx.bins.Xvnc, authFile: ctx.authFile, geometry: ctx.geometry, rfbPort: port, env: ctx.x11Env(':0'), logFd: ctx.logFd });
    ctx.onPart('x', x.child, { display: x.display, port, alsoServer: true });
    ctx.writeAuth(x.display);
    return { display: x.display, port, shared: false };
  },
  /** An X server (Xvfb), then a picture server (x11vnc) attached to it. */
  'x-then-server': async (ctx) => {
    assertExecutable(ctx.bins.Xvfb, 'Xvfb');
    const x = await startXServer({ bin: 'Xvfb', binPath: ctx.bins.Xvfb, authFile: ctx.authFile, geometry: ctx.geometry, env: ctx.x11Env(':0'), logFd: ctx.logFd });
    ctx.onPart('x', x.child, { display: x.display });
    ctx.writeAuth(x.display);
    assertExecutable(ctx.bins.x11vnc, 'x11vnc');
    const port = await ctx.freePort();
    const v = await startX11vnc({ binPath: ctx.bins.x11vnc, display: x.display, authFile: ctx.authFile, rfbPort: port, env: ctx.x11Env(x.display), logFd: ctx.logFd });
    ctx.onPart('server', v, { port });
    return { display: x.display, port, shared: false };
  },
  /** The pre-existing shared desktop (src/vnc.js): nothing is started. */
  shared: async (ctx) => {
    const s = await ctx.singleton();
    if (!s || !s.running) throw namedError('shared-desktop-down', 'the shared desktop is not running');
    return { display: s.display, port: s.port, shared: true, authFile: s.authFile || null };
  },
  /**
   * ONE xpra per app session (P8-2): xpra starts its own Xvfb and is the
   * window manager AND the picture server on one loopback port; the keeper
   * starts the app on the display afterwards like every other rung (no WM
   * of ours — `wm:false`; xpra IS the WM, a second one would fight it). The
   * READY probe is HTTP (`probe:'http'`), the stream kind is 'xpra'. XAUTHORITY
   * is pinned to the per-app file: xpra's own `xauth add` writes the cookie
   * there (measured: unset, it wrote the user's real ~/.Xauthority), and the
   * app started with the same file is admitted. `xauth` must be on PATH for
   * that — refused by name before anything spawns.
   */
  'xpra-seamless': async (ctx) => {
    assertExecutable(ctx.bins.xpra, 'xpra');
    if (!ctx.bins.xauth) throw namedError('exec-not-found', 'xauth not on PATH — xpra writes the display cookie through it');
    // THE FILE MUST EXIST BEFORE xpra STARTS (measured 2026-09-21, xpra/x11/vfb_util.py
    // `valid_xauth`): a missing XAUTHORITY path is treated as none and xpra writes the
    // user's REAL ~/.Xauthority instead — the keeper writes a placeholder first, and
    // the recipe guarantees it on its own so no caller can reopen that hole.
    if (!fs.existsSync(ctx.authFile)) writeXauthority(ctx.authFile, [{ display: '0', cookieHex: ctx.cookie || newCookie() }]);
    const port = await ctx.freePort();
    const env = ctx.x11Env(':0');
    delete env.DISPLAY; // xpra starts the display; a stale DISPLAY would be "an existing display"
    const x = await startXpra({ binPath: ctx.bins.xpra, port, dir: ctx.dir, env, logFd: ctx.logFd, dpi: ctx.dpi });
    ctx.onPart('x', x.child, { display: x.display, port, alsoServer: true });
    return { display: x.display, port, shared: false, wm: false, probe: 'http' };
  },
});

// ── liveness + identity (pid AND starttime) ──────────────────────────────────
function pidAlive(pid) { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e && e.code === 'EPERM'; } }
/** starttime ticks for a live pid, or null (no evidence). */
function procStart(pid, opts = {}) { const s = cliIdentity.procSample(pid, opts); return s ? s.starttime : null; }
/**
 * Is `pid` STILL the process recorded with `starttime`? A recycled pid says
 * no — and so does NO EVIDENCE (r3, 2026-09-14): a record whose starttime is
 * null (an older/hand-written record, or one written on a machine with no
 * readable /proc) used to degrade to bare liveness, which made the keeper's
 * boot adoption treat a RECYCLED pid as a verified leader and SIGKILL a
 * stranger's whole process group — the exact case the starttime rule exists
 * to prevent. An identity nobody recorded is not proven, and a pid whose
 * /proc cannot be read NOW (vanished between the two reads, hidepid) is not
 * proven either. The only identity such a record still has is the session
 * env marker (`environHas`), and the keeper's teardown asks that one instead.
 */
function sameProcess(pid, starttime, opts = {}) {
  if (starttime == null || !pidAlive(pid)) return false;
  const st = procStart(pid, opts);
  return st != null && st === starttime;
}
const procSample = (pid) => cliIdentity.procSample(pid);

// ── sessions: the processes a detached leader OWNS ──────────────────────────
/** Every live pid whose session id is `sid` (a detached leader's sid is its
 *  own pid). cli-identity's ONE /proc walk, memoised. */
function sessionMembers(sid, opts = {}) { return cliIdentity.sessionMembers(sid, opts); }
/** Rebuild the session table NOW — one /proc walk a teardown pays once for
 *  all four parts instead of once per part (the keeper's r3). */
function refreshSessions(opts = {}) { cliIdentity.sessionIndex({ ...opts, fresh: true }); }
/** The union of the sessions led by `leaders` (pids; falsy skipped), each
 *  leader included when alive — the set a stop must empty and a runaway
 *  sample must cover. */
function sessionCensus(leaders, opts = {}) {
  const out = new Set();
  for (const l of leaders || []) { if (!l) continue; for (const p of sessionMembers(l, opts)) out.add(p); }
  return [...out];
}
/** Does `pid`'s environment carry `KEY=value` verbatim? The keeper stamps
 *  `VIBESPACE_DESKTOP_APP=<id>` on every process it starts, so a straggler
 *  is identified by what it INHERITED, not by a pid that may have been
 *  recycled. false = no evidence (no /proc, another uid, a zombie). */
function environHas(pid, needle, { procRoot = '/proc' } = {}) {
  try { return fs.readFileSync(`${procRoot}/${pid}/environ`).toString('utf8').split('\0').includes(needle); } catch { return false; }
}
/**
 * ONE sample over several pids: cpuTicks and rssBytes SUMMED, `pids` = how
 * many answered. null when none did (no evidence).
 *
 * cpuTicks COUNTS EACH UNIT OF WORK EXACTLY ONCE (r3, 2026-09-14): a live
 * member's own utime+stime PLUS the cutime+cstime of every child it has
 * already reaped. Summing only the pids alive at sample time made the guard
 * blind to any application whose work runs in short-lived children — a child
 * that exits between two samples takes its ticks with it and the sustain
 * window resets. Measured on the real keeper: `sh -c 'exec yes >/dev/null'`
 * tripped at 4.5 s while `while :; do yes | head -c 30000000 >/dev/null; done`
 * read 0-1 ticks per 500 ms over live pids (2 %) against 53-55 ticks
 * (≈110 %) once the parent's reaped time was read. A child's own ticks are
 * counted while it lives and move INTO its parent's cutime when it is
 * reaped, so the sum never double-counts. BOUNDARY: a child reaped by init
 * (its parent died first — the double-fork daemon shape) leaves the set
 * entirely and is not counted.
 */
function sessionSample(pids) {
  let cpuTicks = 0, rssBytes = 0, n = 0;
  for (const pid of pids || []) { const s = procSample(pid); if (!s) continue; cpuTicks += s.cpuTicks + (s.reapedTicks || 0); rssBytes += s.rssBytes; n++; }
  return n ? { cpuTicks, rssBytes, pids: n } : null;
}
/**
 * ONE /proc walk answering "which live pids carry `KEY=<id>` for ANY of these
 * ids" — `Map<id, pid[]>` (ids with no hit are absent). The keeper's boot
 * belt (r3): a session's processes are identified by what they INHERITED,
 * so a leftover of a record that is already terminal — a stop torn in half
 * by a SIGKILL, a part a recipe spawned after its record died — is found
 * without trusting a recorded pid that may have been recycled. Reads every
 * readable `environ` once (measured: 3,848 pids, 3,241 readable, ~50 ms);
 * another uid's process is unreadable and therefore never ours. Never
 * asked with ids outside the caller's OWN store — two instances under one
 * uid mint disjoint ids, and a foreign id must never be signalled.
 */
function markerCensus(key, ids, { procRoot = '/proc' } = {}) {
  const want = new Map();
  for (const id of ids || []) if (id) want.set(`${key}=${id}`, id);
  return environCensus(want, { procRoot });
}
/**
 * The same ONE walk over ANY verbatim `KEY=value` needles (2026-09-22):
 * `needles` = Map<needle, id> → Map<id, pid[]> (a pid is listed once per id,
 * whichever of that id's needles it carries). The keeper asks it with TWO
 * needles per record — the session marker, and the per-app
 * `XAUTHORITY=<data>/desktop-apps/<id>/Xauthority` every process ON the
 * record's own display carries: xpra hands its Xvfb a SANITISED env (no
 * marker) that still names that file (measured on 6.5.3: `XAUTHORITY`,
 * `XPRA_SESSION_DIR` under the app dir, nothing else of ours), and the path
 * holds the record id, so it names this session and no other.
 */
function environCensus(needles, { procRoot = '/proc' } = {}) {
  const out = new Map();
  if (!needles || !needles.size) return out;
  const keys = [...new Set([...needles.keys()].map((n) => n.slice(0, n.indexOf('=') + 1)).filter(Boolean))];
  let ents = [];
  try { ents = fs.readdirSync(procRoot); } catch { return out; }
  for (const name of ents) {
    if (!/^\d+$/.test(name)) continue;
    let env;
    try { env = fs.readFileSync(`${procRoot}/${name}/environ`).toString('utf8'); } catch { continue; }
    if (!keys.some((k) => env.includes(k))) continue;
    const seen = new Set();
    for (const kv of env.split('\0')) {
      const id = needles.get(kv);
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      if (!out.has(id)) out.set(id, []);
      out.get(id).push(Number(name));
    }
  }
  return out;
}

// ── window enumeration (P9 reuses this shape) ────────────────────────────────
function run(bin, args, { env, timeout = 3000 } = {}) {
  return new Promise((resolve) => {
    execFile(bin, args, { env, timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => resolve({ err, stdout: String(stdout || '') }));
  });
}
// One `xwininfo -root -tree` child line: indent, id, the NAME, `: ("instance" "Class")`,
// then `WxH+relX+relY  +absX+absY`. Parsed from the RIGHT, because the name is
// printed UNESCAPED or not at all — MEASURED on xwininfo 1.1.6 (2026-09-22):
//   0x40000c "计算器 "x" \ é": ("xterm" "XTerm")  484x316+0+0  +0+0   ← a UTF-8 _NET_WM_NAME, quotes verbatim
//   0x20000c (name in unsupported encoding COMPOUND_TEXT): ("xterm" "XTerm") …   ← xterm with a non-Latin-1 title
//   0x40000c " (failure in conversion from UTF8_STRING to ANSI_X3.4-1968)": (…) … ← UTF-8 under a non-UTF-8 locale
//   0x400001 (has no name): ()  10x10+0+0  +0+0
// The pre-x4 regex read a quoted name as `"(?:[^"\\]|\\.)*"` and required
// `(has no name)` otherwise, so the first two lines were DROPPED: the app's
// window vanished from the fit plan and from windows(id). An unreadable name
// is `null`; the window is still a row.
const TREE_HEAD_RE = /^(\s*)(0x[0-9a-fA-F]+)\s(.*)$/;
const TREE_GEOM_RE = /\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+)\s+\+(-?\d+)\+(-?\d+)\s*$/;
const TREE_CLASS_RE = /^(.*):\s\((?:"(.*?)"\s"(.*)")?\)$/; // greedy head ⇒ the LAST `: (` — the class group always ends the line's text part
const UNREADABLE_NAME_RE = /^(?:\(has no name\)|\(name in unsupported encoding [^)]*\)|" \(failure in conversion from \S+ to \S+\)")$/;
function wininfoName(part) {
  if (UNREADABLE_NAME_RE.test(part)) return null;
  return part.length >= 2 && part[0] === '"' && part[part.length - 1] === '"' ? part.slice(1, -1) : null;
}
/** Parse `xwininfo -root -tree` into rows — exported so the suite can drive it
 *  over captured output. `depth` (P8-2 x4) comes from the line's indentation:
 *  xwininfo indents root's direct children by 5 spaces and every level below
 *  by 3 more (measured: `     0x20000c "xterm"` then `        0x200011 (has no
 *  name)` for xterm's inner VT window), so depth 1 = a TOP-LEVEL window — the
 *  only kind the fit plan may move; a child moved inside its parent would
 *  wreck the app. `x`/`y` are the ABSOLUTE position (the last pair). */
function parseWininfoTree(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    const h = TREE_HEAD_RE.exec(line);
    if (!h) continue;
    const g = TREE_GEOM_RE.exec(h[3]);
    if (!g) continue;
    const body = h[3].slice(0, g.index);
    const c = TREE_CLASS_RE.exec(body);
    const depth = Math.max(1, Math.round((h[1].length - 2) / 3));
    rows.push({ id: parseInt(h[2], 16), name: wininfoName(c ? c[1] : body), instance: (c && c[2]) || null, cls: (c && c[3]) || null, w: +g[1], h: +g[2], x: +g[5], y: +g[6], depth });
  }
  return rows;
}
/** The window TREE of a display: ONE bounded `xwininfo -root -tree` →
 *  `{ ok, why, rows, text }` (`text` = the raw output, which the keeper's belt
 *  compares with the last read: an unchanged tree needs no visibility read
 *  and no plan — 2026-09-22, the spawn-count finding). */
async function windowTree({ hostId = null, display, authFile, env = process.env, bins = null } = {}) {
  assertLocal(hostId, 'windowTree');
  const bin = (bins && bins.xwininfo) || (bins ? null : binOnPath('xwininfo', { env }));
  if (!bin) return { ok: false, why: 'xwininfo not on PATH', rows: [], text: '' };
  // LC_ALL=C.UTF-8: xwininfo converts a UTF-8 _NET_WM_NAME to the LOCALE's charset and prints a
  // "failure in conversion" under C/POSIX (measured) — we decode its stdout as UTF-8, so we ask for UTF-8
  const tree = await run(bin, ['-root', '-tree'], { env: { ...x11Env(env, { display, authFile }), LC_ALL: 'C.UTF-8' } });
  if (tree.err) return { ok: false, why: `xwininfo failed: ${tree.err.message}`, rows: [], text: '' };
  return { ok: true, why: null, rows: parseWininfoTree(tree.stdout), text: tree.stdout };
}
/** The VIEWABLE window ids of a display (a window and every ancestor mapped):
 *  ONE `xdotool search --onlyvisible` → a Set, or null when xdotool is
 *  absent or failed (then nothing is known — never "nothing is visible"). */
async function viewableWindows({ hostId = null, display, authFile, env = process.env, bins = null } = {}) {
  assertLocal(hostId, 'viewableWindows');
  const bin = (bins && bins.xdotool) || (bins ? null : binOnPath('xdotool', { env }));
  if (!bin) return null;
  const vis = await run(bin, ['search', '--onlyvisible', '--name', ''], { env: x11Env(env, { display, authFile }) });
  return vis.err ? null : new Set(vis.stdout.split(/\s+/).filter(Boolean).map((s) => parseInt(s, 10)));
}
/** Tree rows + the viewable set ⇒ rows with `mapped` true/false (null when unknown). */
const withMapped = (rows, visible) => rows.map((r) => ({ ...r, mapped: visible ? visible.has(r.id) : null }));
/**
 * The windows on a display: `[{ id, name, instance, cls, x, y, w, h, depth, mapped }]`.
 * `mapped` is true/false when xdotool could answer, null when only xwininfo
 * was available. Two child processes per call (`windowTree` +
 * `viewableWindows`), bounded, async — never a per-window spawn.
 */
async function enumerateWindows({ hostId = null, display, authFile, env = process.env, bins = null } = {}) {
  assertLocal(hostId, 'enumerateWindows');
  const b = bins || { xwininfo: binOnPath('xwininfo', { env }), xdotool: binOnPath('xdotool', { env }) };
  const tree = await windowTree({ display, authFile, env, bins: b });
  if (!tree.ok) return { ok: false, why: tree.why, windows: [] };
  const visible = await viewableWindows({ display, authFile, env, bins: b });
  return { ok: true, why: null, windows: withMapped(tree.rows, visible) };
}

// ── the display's size and the fit act (P8-2 x4) ───────────────────────────
const DIMS_RE = /dimensions:\s+(\d+)x(\d+)\s+pixels/;
/** The framebuffer of a display as the X server states it — ONE `xdpyinfo`
 *  (~10 ms; no RANDR needed, measured: the size reads right with `-extension
 *  RANDR` too). `{ ok, w, h, why }`; never throws. */
async function displaySize({ hostId = null, display, authFile, env = process.env, bins = null } = {}) {
  assertLocal(hostId, 'displaySize');
  const bin = (bins && bins.xdpyinfo) || binOnPath('xdpyinfo', { env });
  if (!bin) return { ok: false, w: 0, h: 0, why: 'xdpyinfo not on PATH' };
  const r = await run(bin, [], { env: x11Env(env, { display, authFile }) });
  if (r.err) return { ok: false, w: 0, h: 0, why: `xdpyinfo failed: ${r.err.message}` };
  const m = DIMS_RE.exec(r.stdout);
  if (!m) return { ok: false, w: 0, h: 0, why: 'xdpyinfo printed no dimensions line' };
  return { ok: true, w: +m[1], h: +m[2], why: null };
}
/**
 * Apply a fit plan (src/desktop-apps.js `appFitPlan`) to a display. On bare X
 * ONE `xdotool` invocation chains `windowmove --sync … windowsize --sync …`
 * for the main window and a `windowmove` per nudged window (xdotool runs a
 * chain of commands in one process — measured: a bare-X xterm and a GTK3
 * gnome-calculator each landed at 1280x800+0+0 in 2-3 ms: the server applies
 * a client's ConfigureWindow directly when nobody manages the window). A main
 * in a WM FRAME (`plan.resize.framed`) is MAXIMISED through the WM — `wmctrl
 * -i -r <CLIENT> -b add,maximized_vert,maximized_horz` — MEASURED 2026-09-22
 * on the fleet image's xfwm4 4.18 over a scratch X: the frame becomes exactly
 * the framebuffer (xterm 1280x776+0+24 under a 24 px title), the WM keeps it
 * so when the app resizes itself and when the root is resized (1000x700 and
 * back); wmctrl on the FRAME id is ignored (it is no client). Without wmctrl
 * the client is moved/resized so the frame lands at 0,0 with the framebuffer
 * size (`windowmove <client> 0 0` puts the frame's corner there — measured).
 * `{ ok, why, ms, acts, via }`; never throws.
 */
async function applyWindowPlan({ hostId = null, display, authFile, env = process.env, bins = null, plan } = {}) {
  assertLocal(hostId, 'applyWindowPlan');
  const b = bins || { xdotool: binOnPath('xdotool', { env }), wmctrl: binOnPath('wmctrl', { env }) };
  if (!b.xdotool) return { ok: false, why: 'xdotool not on PATH', ms: 0, acts: 0, via: null };
  if (!plan || !plan.main) return { ok: false, why: (plan && plan.why) || 'no plan', ms: 0, acts: 0, via: null };
  const viaWm = !!(plan.resize && plan.resize.framed && b.wmctrl);
  const args = [];
  if (plan.resize && !viaWm) args.push('windowmove', '--sync', String(plan.resize.id), '0', '0', 'windowsize', '--sync', String(plan.resize.id), String(plan.resize.w), String(plan.resize.h));
  for (const m of plan.moves || []) args.push('windowmove', '--sync', String(m.id), String(m.x), String(m.y));
  if (!args.length && !viaWm) return { ok: true, why: null, ms: 0, acts: 0, via: null };
  const xenv = x11Env(env, { display, authFile });
  const t0 = Date.now();
  let acts = 0;
  if (viaWm) {
    const w = await run(b.wmctrl, ['-i', '-r', String(plan.resize.id), '-b', 'add,maximized_vert,maximized_horz'], { env: xenv, timeout: 5000 });
    if (w.err) return { ok: false, why: `wmctrl failed: ${w.err.message}`, ms: Date.now() - t0, acts: 0, via: 'wm' };
    acts++;
  }
  if (args.length) {
    const r = await run(b.xdotool, args, { env: xenv, timeout: 5000 });
    if (r.err) return { ok: false, why: `xdotool failed: ${r.err.message}`, ms: Date.now() - t0, acts, via: viaWm ? 'wm' : 'xdotool' };
    acts += (plan.resize && !viaWm ? 1 : 0) + (plan.moves || []).length;
  }
  return { ok: true, why: null, ms: Date.now() - t0, acts, via: viaWm ? 'wm' : 'xdotool' };
}

// ── xpra ─────────────────────────────────────────────────────────────────────
/** `xpra --version` → { version:'6.5.3'|null, raw }. A probe only (P8-1). */
async function xpraVersion({ binPath, env = process.env } = {}) {
  const bin = binPath || binOnPath('xpra', { env });
  if (!bin) return null;
  const r = await run(bin, ['--version'], { env, timeout: 5000 });
  const raw = r.stdout.trim();
  const m = /xpra\s+v?(\d+(?:\.\d+)+)/i.exec(raw) || /(\d+\.\d+(?:\.\d+)?)/.exec(raw);
  return { version: m ? m[1] : null, raw: raw.slice(0, 200), error: r.err ? r.err.message : null };
}

module.exports = {
  assertLocal, binOnPath, resetBinMemo, forgetBin, assertExecutable, PROBE_BINS, hostFacts, x11Env,
  newCookie, writeXauthority, xauthEntry, freePort, rfbBanner, waitForRfb, httpProbe, waitForHttp, waitForListen, portAnswers, LISTEN_PROBES,
  listenerInode, pidHoldsInode, listenerHeldBy,
  spawnDetached, X_SERVER_ARGS, startXServer, startX11vnc, startWindowManager, startApp, applyXResources, waitForXftDpi, RECIPES,
  XPRA_ARGS, XPRA_GEOMETRY_MAX, XPRA_BIND_REFUSALS, startXpra, xpraWwwDir, seamlessWindows,
  pidAlive, procStart, sameProcess, procSample,
  sessionMembers, refreshSessions, sessionCensus, environHas, sessionSample, markerCensus, environCensus,
  parseWininfoTree, windowTree, viewableWindows, enumerateWindows, displaySize, applyWindowPlan, xpraVersion,
};
