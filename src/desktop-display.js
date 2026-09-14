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
 */
const fs = require('fs');
const os = require('os');
const net = require('net');
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
const PROBE_BINS = Object.freeze(['xpra', 'Xvnc', 'Xtigervnc', 'Xvfb', 'x11vnc', 'xfwm4', 'openbox', 'xdotool', 'wmctrl', 'xwininfo', 'xdpyinfo']);

/** `{ hostId, bins: { name: path|null }, xpra: { version, raw } | null, at }`. */
async function hostFacts({ hostId = null, env = process.env, bins = PROBE_BINS, now = Date.now } = {}) {
  assertLocal(hostId, 'hostFacts');
  const out = {};
  for (const b of bins) out[b] = binOnPath(b, { env, now });
  const xpra = out.xpra ? await xpraVersion({ binPath: out.xpra, env }) : null;
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
  Xvnc: ({ authFile, geometry, depth, rfbPort }) => ['-displayfd', '3', '-auth', authFile, '-nolisten', 'tcp', '-localhost', '-SecurityTypes', 'None', '-UseBlacklist', '0', '-rfbport', String(rfbPort), '-geometry', geometry, '-depth', String(depth)],
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

// ── the bring-up RECIPES (one per name the PURE table can say) ──────────────
/**
 * Each recipe brings up the DISPLAY HALF of a session and returns
 * `{ display, port, shared, authFile? }`; the keeper starts the window
 * manager and the application afterwards and records what the recipe hands
 * it THROUGH `ctx.onPart(part, child, facts)` — called the moment each pid is
 * known, so a failure one step later still leaves a reapable record. ctx =
 *   { bins, authFile, cookie, geometry, base (sanitised env), logFd,
 *     freePort, x11Env(display), writeAuth(display), onPart, singleton() }
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
  /** P8-2 owns `xpra start --html=on`; until then the name exists so the
   *  table is complete and the refusal is BY NAME. */
  'xpra-seamless': async () => { throw namedError('backend-not-wired', 'xpra bring-up is not wired until P8-2'); },
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
  const out = new Map();
  const want = new Map();
  for (const id of ids || []) if (id) want.set(`${key}=${id}`, id);
  if (!want.size) return out;
  let ents = [];
  try { ents = fs.readdirSync(procRoot); } catch { return out; }
  for (const name of ents) {
    if (!/^\d+$/.test(name)) continue;
    let env;
    try { env = fs.readFileSync(`${procRoot}/${name}/environ`).toString('utf8'); } catch { continue; }
    if (!env.includes(`${key}=`)) continue;
    for (const kv of env.split('\0')) {
      const id = want.get(kv);
      if (id === undefined) continue;
      if (!out.has(id)) out.set(id, []);
      out.get(id).push(Number(name));
      break;
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
// `0x200020 "xmessage": ("xmessage" "Xmessage")  300x100+10+10  +10+10` — a
// class-less window prints `(has no name): ()`, so the class group is optional
const TREE_RE = /^\s*(0x[0-9a-fA-F]+)\s+(?:"((?:[^"\\]|\\.)*)"|\(has no name\))(?::\s*\((?:"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)")?\))?\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+)\s+\+(-?\d+)\+(-?\d+)/;
/** Parse `xwininfo -root -tree` into rows — exported so the suite can drive it
 *  over captured output. */
function parseWininfoTree(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    const m = TREE_RE.exec(line);
    if (!m) continue;
    rows.push({ id: parseInt(m[1], 16), name: m[2] != null ? m[2] : null, instance: m[3] || null, cls: m[4] || null, w: +m[5], h: +m[6], x: +m[9], y: +m[10] });
  }
  return rows;
}
/**
 * The windows on a display: `[{ id, name, instance, cls, x, y, w, h, mapped }]`.
 * `mapped` is true/false when xdotool could answer, null when only xwininfo
 * was available. Two child processes per call, bounded, async — never a
 * per-window spawn.
 */
async function enumerateWindows({ hostId = null, display, authFile, env = process.env, bins = null } = {}) {
  assertLocal(hostId, 'enumerateWindows');
  const b = bins || { xwininfo: binOnPath('xwininfo', { env }), xdotool: binOnPath('xdotool', { env }) };
  if (!b.xwininfo) return { ok: false, why: 'xwininfo not on PATH', windows: [] };
  const xenv = x11Env(env, { display, authFile });
  const tree = await run(b.xwininfo, ['-root', '-tree'], { env: xenv });
  if (tree.err) return { ok: false, why: `xwininfo failed: ${tree.err.message}`, windows: [] };
  const rows = parseWininfoTree(tree.stdout);
  let visible = null;
  if (b.xdotool) {
    const vis = await run(b.xdotool, ['search', '--onlyvisible', '--name', ''], { env: xenv });
    if (!vis.err) visible = new Set(vis.stdout.split(/\s+/).filter(Boolean).map((s) => parseInt(s, 10)));
  }
  return { ok: true, why: null, windows: rows.map((r) => ({ ...r, mapped: visible ? visible.has(r.id) : null })) };
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
  newCookie, writeXauthority, xauthEntry, freePort, rfbBanner, waitForRfb,
  listenerInode, pidHoldsInode, listenerHeldBy,
  spawnDetached, X_SERVER_ARGS, startXServer, startX11vnc, startWindowManager, startApp, RECIPES,
  pidAlive, procStart, sameProcess, procSample,
  sessionMembers, refreshSessions, sessionCensus, environHas, sessionSample, markerCensus,
  parseWininfoTree, enumerateWindows, xpraVersion,
};
