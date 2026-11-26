/**
 * VncManager — in-container desktop through VibeSpace's OWN auth.
 *
 * A VNC server (TigerVNC Xvnc) runs bound to LOCALHOST ONLY; browsers reach it
 * through the cookie-authenticated /api/vnc WebSocket bridge (server.js) and
 * the `desktop` window type renders it with noVNC. Single login — no second
 * password, no per-user VNC ports exposed, no -desktop subdomain.
 *
 * Lifecycle: lazy. Nothing runs until the first desktop window calls
 * POST /api/vnc/start. The X server + session are spawned DETACHED (setsid)
 * so an app-only VibeSpace restart (git pull → systemctl restart) does not
 * kill the desktop — on boot ensureRunning() ADOPTS whatever already listens
 * on the port. A port that is already listening is always adopted, which is
 * also the manual-test path (Xvfb+x11vnc) and the bring-your-own-VNC path
 * (e.g. KasmVNC on the same port).
 *
 * Availability = an Xvnc-style binary on PATH (Xtigervnc/Xvnc) OR the port
 * already listening. The desktop menu entry hides when unavailable, so
 * non-desktop deployments see nothing.
 *
 * NAMES + SHUTDOWN (2026-09-25, the heavy RED on 69720f2b): `:7` and 5901 are
 * MACHINE-GLOBAL names — a scratch server that opened the Desktop started (or
 * adopted) the one Xtigervnc every run on the box and the owner's production
 * instance shared, and left it running after its own exit (nothing called
 * stop()). Gate suites now pass per-run VIBESPACE_VNC_DISPLAY/_PORT (scripts/
 * scratch.mjs vncEnv, test-architecture §57), and a server constructed with
 * `stopOnShutdown` (server.js: a THROWAWAY root — code under the OS temp dir)
 * stops, at SIGINT/SIGTERM, the Xvnc THIS process spawned — identified by pid
 * AND /proc start time, never by the pid file (pids wrap daily on a busy box)
 * and never one it adopted. An installed server keeps the design above: its
 * desktop outlives an app-only restart and the next boot adopts it.
 *
 * THE DISPLAY IS TAKEN, NOT ASSUMED (B-956d, 2026-10-02). Desktop apps' X
 * servers take the lowest free display with `-displayfd` (src/desktop-
 * display.js), so one of them can hold :7 before the Desktop starts — and a
 * fixed `:7` then never started at all. The configured display (VIBESPACE_VNC_
 * DISPLAY, else the historic :7) is now the PREFERRED one: Xvnc is started on
 * it with `-displayfd 3`, and when it is held (Xvnc exits "server already
 * active") it is started again with `-displayfd` alone — the X server picks a
 * free display itself, race-free. The display it reported is RECORDED in
 * data/vnc.json `{display, port, pid, start}`; a restart that finds the port
 * listening adopts THAT display (the desktop-singleton rung and the session
 * run on it), never the configured name.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { serviceEnv } = require('./agent-env.js');

const VNC_PORT = parseInt(process.env.VIBESPACE_VNC_PORT || '', 10) || 5901;
const VNC_DISPLAY = process.env.VIBESPACE_VNC_DISPLAY || ':7'; // the PREFERRED display (B-956d) — held ⇒ -displayfd picks one
const STATE_FILE = 'vnc.json';      // B-956d: the display the running Desktop actually took (adopted after a restart)
const DISPLAYFD_MS = 10000;         // the X server's answer on fd 3 (measured ~40 ms for Xvfb; a bound, never a sleep)
const VNC_GEOMETRY = process.env.VIBESPACE_VNC_GEOMETRY || '1920x1080';

// B-323e (lane bl-keys-misc, 主开发 r1351 (6)): where a program lives — the kept lookup (src/plugins/which-kept.js: a found OR a
// missing answer kept 60 s), asked of the hub's starter; never a SYNCHRONOUS child (status() runs on the belt's 60 s facts
// refresh: a box with no Xvnc paid two synchronous forks of the hub a minute)
const lookup = (cmd, o) => require('./plugins/which-kept.js').whichFreshAnswer(cmd, o);   // {path, known} — known false: no reply

function portListening(port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    const done = (v) => { try { s.destroy(); } catch {} resolve(v); };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    s.setTimeout(timeoutMs, () => done(false));
  });
}

/** /proc start time (clock ticks since boot, field 22) — with the pid, the
 *  identity of a process; null when gone or unreadable (non-Linux). */
function procStart(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/stat`, 'latin1');
    const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
    return f[19] || null;
  } catch { return null; }
}

/** B-956d: the display recorded for `port` in data/vnc.json, or null (absent, unreadable, another port, not `:N`).
 *  `whole` (r2489): the record itself for that port — its X server's identity and a session's no-reply mark — or null. */
function recordedDisplay(file, port, { whole = false } = {}) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (whole) return j && j.port === port ? j : null;
    return j && j.port === port && /^:\d{1,5}$/.test(String(j.display)) ? String(j.display) : null;
  } catch { return null; }
}
/** B-574d (r4874): a record's KEY — what it says, its time (`at`) left out: two records with the same key are the same record */
function recordKey(o) {
  return JSON.stringify({ display: o.display, port: o.port, pid: o.pid || null, start: o.pid ? (o.start == null ? null : o.start) : null, ...(Array.isArray(o.sessionNoReply) && o.sessionNoReply.length ? { sessionNoReply: o.sessionNoReply } : {}) });
}

class VncManager {
  /** `display` / `port` / `xvncBin` default to the env / PATH (server.js passes none; the suites pass stand-ins). */
  constructor({ dataDir, stopOnShutdown = false, display = VNC_DISPLAY, port = VNC_PORT, xvncBin = null, storeWriter = null }) {
    this._storeWriter = storeWriter;   // B-574d «doors-small-state» (主开发 r4867 / r4874, lane nl-mounts): the store writer vnc.json is written by (a suite's; else the process's)
    this._pidFile = path.join(dataDir, 'vnc.pid');
    this._stateFile = path.join(dataDir, STATE_FILE);
    this.port = port;
    this._preferred = display;
    this.display = recordedDisplay(this._stateFile, port) || display; // B-956d: a running Desktop is on the display it TOOK
    { const r0 = recordedDisplay(this._stateFile, port, { whole: true }); this._recKey = r0 ? recordKey(r0) : null; }   // B-574d (r4874): the record on disk, the time left out
    this._starting = null; // in-flight ensureRunning promise (dedupe)
    this._xvncBin = xvncBin;
    this._running = false;  // last status() answer — the desktop-app keeper's `desktop-singleton` rung reads it
    this._stopOnShutdown = !!stopOnShutdown; // server.js: a throwaway (temp-dir) root — see the header
    this._own = null;       // { pid, start } of the Xvnc THIS process spawned (never an adopted one)
  }

  /** The shared desktop as the desktop-app keeper sees it (the
   *  `desktop-singleton` rung of src/desktop-apps.js's ladder): running = the
   *  last status() answer, refresh = a fresh probe. No auth cookie — our Xvnc
   *  runs without one (see _startSession). */
  singletonFacts() {
    return { running: this._running, display: this.display, port: this.port, authFile: null, refresh: () => this.status() };
  }

  /** → {path, known}: known false = the lookup got no reply (r1381: never said as «not installed»); `fresh` = a person's Start
   *  (it looks again past a kept «not found»: an Xvnc installed a moment ago is found) */
  async _findXvnc({ fresh = false } = {}) {
    if (this._xvncBin) return { path: this._xvncBin, known: true };
    const o = fresh ? { maxAgeMs: 0 } : undefined;
    const a = await lookup('Xtigervnc', o); if (a.path) { this._xvncBin = a.path; return { path: a.path, known: true }; }   // r2030: a kept path served at a no-reply is a path
    const b = await lookup('Xvnc', o); if (b.path) { this._xvncBin = b.path; return { path: b.path, known: true }; }
    return { path: null, known: !!(a.known && b.known) };
  }

  async status() {
    const running = await portListening(this.port);
    this._running = running;
    const x = running ? null : await this._findXvnc();
    return { available: running || !!(x && x.path), running, port: this.port, ...(x && !x.known ? { lookup: 'no-reply' } : {}) };
  }

  /** Start (or adopt) the desktop stack. Resolves to status(). */
  async ensureRunning() {
    if (this._starting) return this._starting;
    this._starting = this._ensureRunning().finally(() => { this._starting = null; });
    return this._starting;
  }

  async _ensureRunning() {
    if (await portListening(this.port)) {   // adopt — on the RECORDED display (constructor), B-956d
      // B-323e follow (主开发 r2262 MUST 1): a display OURS whose desktop session was not started for a no-reply — the reopen the
      // toast names runs the session's lookups again and starts it there (once it starts, never again; a second no-reply is said again).
      // r2489 (1)+(2): OURS = our X server STILL the same process (the identity stop() checks) — this hub's own spawn, or the one the
      // display's record names after a restart; the mark is kept beside that record. Anything else is adopted as before.
      if (this._noReplyMark() && this._ourX()) return this._sessionOn(await this._startSession());
      return this.status();
    }
    const found = await this._findXvnc({ fresh: true });
    if (!found.path) throw new Error(found.known ? 'no VNC server installed (Xtigervnc/Xvnc not on PATH)' : 'could not check whether a VNC server is installed — the lookup got no answer in time; try again');
    const xvnc = found.path;
    // the flags' reasons (-localhost, SecurityTypes None, -UseBlacklist 0) live on _spawnX
    // B-956d: the preferred display first; held ⇒ the X server picks a free one itself (-displayfd)
    let r = await this._spawnX(xvnc, this._preferred);
    if (!r.display) {
      console.warn(`[vnc] ${this._preferred} is not free (${r.why}) — starting the Desktop on a display the X server picks (-displayfd)`);
      r = await this._spawnX(xvnc, null);
    }
    if (!r.display) throw new Error(`VNC server failed to start (${r.why})`);
    const x = r.child;
    this.display = r.display;
    if (x.pid) this._own = { pid: x.pid, start: procStart(x.pid) };
    try { fs.writeFileSync(this._pidFile, String(x.pid)); } catch {}
    this._record(x.pid);   // B-574d (r4935): handed to the writer at once (urgent) — the start waits on no landing, whoever called it
    // Wait for the RFB port, then start the desktop session on that display.
    for (let i = 0; i < 50; i++) {
      if (await portListening(this.port)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!(await portListening(this.port))) throw new Error('VNC server failed to start');
    return this._sessionOn(await this._startSession());   // r2030 (3c): a bare screen says why
  }

  /** The Start's answer with its session's word (r2030 (3c) + r2262): no session for a no-reply ⇒ `session: 'no-reply'` and the
   *  display is MARKED (the next open runs the lookups again); a session started without a helper that got no reply (the bus) ⇒
   *  `session: 'partial'`; a session started, or none for no lookup's fault ⇒ the mark is cleared. */
  async _sessionOn(sess) {
    const st = await this.status();
    const noReply = sess && typeof sess === 'object' && Array.isArray(sess.noReply) ? sess.noReply : null;
    if (noReply && !sess.cmd) { this._sessionNoReply = noReply; this._markRecord(noReply); return { ...st, session: 'no-reply', sessionNoReply: noReply }; }
    if (this._noReplyMark()) this._markRecord(null);
    this._sessionNoReply = null;
    return noReply ? { ...st, session: 'partial', sessionNoReply: noReply } : st;
  }

  /** r2489 (1): our X server, STILL the same process — this hub's own spawn (`_own`), else the one the display's record names
   *  (after a restart) — its pid's start time still the one recorded (stop()'s check); null = not ours (dead, replaced, adopted) */
  _ourX() {
    const live = (o) => !!(o && o.pid > 1 && o.start && procStart(o.pid) === o.start);
    if (live(this._own)) return this._own;
    const r = recordedDisplay(this._stateFile, this.port, { whole: true });
    return r && live(r) && String(r.display) === String(this.display) ? { pid: r.pid, start: r.start } : null;
  }
  /** r2489 (2): the session's no-reply mark — this process's, else the one kept beside the display's record (a restart keeps it) */
  _noReplyMark() {
    if (this._sessionNoReply) return this._sessionNoReply;
    if (this._markRun !== undefined) return this._markRun;   // B-574d (r4874): the mark THIS run set or cleared — its record may still be owed to the writer, so the file is not asked
    const r = recordedDisplay(this._stateFile, this.port, { whole: true });
    return r && Array.isArray(r.sessionNoReply) && r.sessionNoReply.length ? r.sessionNoReply : null;
  }
  /** the mark written beside the display's record (null clears it); the record's X server stays the one it names */
  _markRecord(list) {
    this._markRun = Array.isArray(list) && list.length ? list : null;   // B-574d (r4874): the mark this run knows (its record rides the writer)
    const r = recordedDisplay(this._stateFile, this.port, { whole: true });
    const pid = (this._own && this._own.pid) || (r && r.pid) || null;
    if (pid) this._record(pid, list);
  }

  /** Start Xvnc on `display` (null = the X server picks a free one) with `-displayfd 3`: resolves `{ child, display }`
   *  once the server wrote its display number (it is listening then), `{ display: null, why }` when it exited first
   *  (a held display: "server already active") or never answered. -localhost + SecurityTypes None is safe BECAUSE
   *  the only route in is the cookie-authed WS bridge; never expose the raw port. -UseBlacklist=0 is REQUIRED, not
   *  optional: TigerVNC blacklists a source host after N unauthenticated connect-then-drop attempts (default 5,
   *  timeout doubles each strike). EVERY connection here is 127.0.0.1 (the bridge), AND our own `portListening`
   *  health probe connects+immediately destroys the socket — which TigerVNC counts as a failed attempt. A few status
   *  polls poisoned the blacklist and locked the desktop out with "Too many security failures" (real report). Auth
   *  is done by the bridge, so the blacklist protects nothing and only self-DoSes. */
  _spawnX(xvnc, display) {
    const xArgs = [...(display ? [display] : []), '-displayfd', '3', '-localhost', '-SecurityTypes', 'None',
      '-UseBlacklist', '0',
      '-rfbport', String(this.port), '-geometry', VNC_GEOMETRY, '-depth', '24'];
    return new Promise((resolve) => {
      let x;
      // a service's env (src/agent-env.js serviceEnv): the X server never holds the hub's secrets (lane spawn-env-census)
      try { x = spawn(xvnc, xArgs, { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe'], env: serviceEnv(process.env) }); }
      catch (e) { resolve({ child: null, display: null, why: e.message }); return; }
      let buf = '', done = false, timer = null;
      const finish = (v) => {
        if (done) return; done = true; clearTimeout(timer);
        try { x.stdio && x.stdio[3] && x.stdio[3].destroy(); } catch {}
        if (v.display) x.unref(); else if (x.exitCode == null && x.signalCode == null) { try { x.kill('SIGTERM'); } catch {} }
        resolve(v);
      };
      // an `error` with no listener is an uncaught exception = the whole server (the desktop-display.js r2 lesson: a binary gone
      // between probe and spawn) — and it comes FIRST (ckpt61 cure 3): a start that fails at once (a full file table) has no stdio
      // at all, and the display pipe read before it threw while its error was still queued
      x.on('error', (e) => { console.warn(`[vnc] ${path.basename(xvnc)} failed to spawn: ${e.message}`); finish({ child: null, display: null, why: e.message }); });
      timer = setTimeout(() => finish({ child: null, display: null, why: `no display number within ${DISPLAYFD_MS} ms` }), DISPLAYFD_MS);
      const fd3 = x.stdio && x.stdio[3];
      if (fd3) fd3.on('data', (d) => { buf += d; const m = /^(\d+)\s/.exec(buf); if (m) finish({ child: x, display: `:${m[1]}` }); });
      if (fd3) fd3.on('error', () => { /* the exit below answers */ });
      x.once('exit', (code, sig) => finish({ child: null, display: null, why: `${path.basename(xvnc)} exited (${sig || `code ${code}`}) before naming a display` }));
    });
  }

  /** B-956d: the display this Desktop took, for the next boot's adoption. */
  _record(pid, sessionNoReply = null) {
    // B-574d «doors-small-state» (主开发 r4867 / r4874, lane nl-mounts): vnc.json rides THE STORE WRITER on EVERY road (r4874: the Desktop
    // window's reconnect ladder calls the start by itself — up to six times an open, exactly when nothing answers: a cadence) — its
    // thread writes the temp, SYNCS it, renames it; the bytes made at the write, off the loop. NO WRITE WHEN NOTHING BUT THE TIME
    // CHANGED: the record without its `at` the same as the last one asked (or read at the start) asks nothing. NO WAIT AT ALL (r4935
    // (a)): the record is handed to the writer at once (an URGENT ask: its next write) and the route replies — the person's press and
    // the ladder's calls alike, an X server spawned included (a ladder call after the display's program died spawns one). This run's
    // readers answer from memory (_own, the mark this run knows: _noReplyMark); the file is the NEXT boot's. THE WRITER's CRASH
    // WINDOW, the family's accepted cost: a hub KILLED before the record lands (a stop or a crash lands it at the exit) leaves the
    // next start the older record — an X server spawned just before is adopted on the older (or the preferred) display, and a
    // no-reply mark just set is lost (a reopened Desktop adopts the bare display without running the session's lookups again, until
    // its X server is started anew). A refused landing is the writer's own line and stays owed
    const rec = { display: this.display, port: this.port, pid: pid || null, start: pid ? procStart(pid) : null, ...(Array.isArray(sessionNoReply) && sessionNoReply.length ? { sessionNoReply } : {}) };
    const key = recordKey(rec);
    if (key === this._recKey) return;
    this._recKey = key;
    try { this._writer().dirty(this._stateFile, { name: 'vnc.write', urgent: true, produce: () => JSON.stringify({ display: rec.display, port: rec.port, pid: rec.pid, start: rec.start, at: Date.now(), ...(rec.sessionNoReply ? { sessionNoReply: rec.sessionNoReply } : {}) }) + '\n' }); }
    catch (e) { console.warn(`[vnc] could not record the Desktop's display (${e.message}) — a restart adopts ${this._preferred}`); }
  }
  _writer() { return this._storeWriter || require('./store-writer.js').storeWriter(); }


  /** Desktop session on the VNC display: XFCE preferred, fallbacks probed. */
  async _startSession() {
    // a service's env, not the hub's (lane spawn-env-census): the user's shell names (USER / LOGNAME / SHELL — the
    // allowlist deploy/sysroot/vs-sysroot-enter hands a user's shell) + DISPLAY; no XAUTHORITY (our Xvnc runs without an
    // auth cookie file) and no bus of the hub's (dbus-launch starts the session's own)
    const env = serviceEnv(process.env, { keep: ['USER', 'LOGNAME', 'SHELL'], add: { DISPLAY: this.display } });
    // r2030 (3c): a person's Start — each helper looked up afresh (maxAgeMs 0); a lookup with no reply is SAID, never a silent bare screen
    const noReply = [];
    const helper = async (cmd) => { const f = await lookup(cmd, { maxAgeMs: 0 }); if (!f.known && !f.path) noReply.push(cmd); return f.path; };
    const dbusLaunch = await helper('dbus-launch');
    const candidates = [
      ['xfce4-session', []],
      ['startxfce4', []],
      ['openbox-session', []],
      ['xterm', []], // last resort: at least a usable terminal appears
    ];
    for (const [cmd, args] of candidates) {
      const bin = await helper(cmd);
      if (!bin) continue;
      const [c, a] = dbusLaunch && cmd !== 'xterm'
        ? [dbusLaunch, ['--exit-with-session', bin, ...args]]
        : [bin, args];
      const p = spawn(c, a, { detached: true, stdio: 'ignore', env });
      p.on('error', (e) => console.warn(`[vnc] the desktop session's ${cmd} could not be started: ${(e && e.code) || e}`));   // ckpt61 cure 2: the hub survives a start that fails (the road's own failure words owed: the next unit)
      p.unref();
      if (noReply.length) { console.warn(`[vnc] the desktop session ${cmd} was started, but the lookup of ${noReply.join(', ')} got no answer in time`); return { cmd, noReply }; }   // r2262: said on the page too
      return cmd;
    }
    if (noReply.length) { console.warn(`[vnc] no desktop session was started: the lookup of ${noReply.join(', ')} got no answer in time — the display stays bare until the Desktop is opened again`); return { noReply }; }
    return null; // bare X — the viewer still connects, just empty
  }

  /** Stop the Xvnc THIS process spawned (adopted servers are left alone) —
   *  only while its pid still names the same process (/proc start time), so a
   *  recycled pid is never signalled; the pid file is NOT the identity (it
   *  outlives the process that wrote it). The session dies with the display. */
  stop() {
    const own = this._own;
    this._own = null;
    if (!own || !(own.pid > 1) || !own.start || procStart(own.pid) !== own.start) return false;
    try { process.kill(own.pid, 'SIGTERM'); } catch { return false; }
    try { if (parseInt(fs.readFileSync(this._pidFile, 'utf-8'), 10) === own.pid) fs.unlinkSync(this._pidFile); } catch {}
    return true;
  }

  /** server.js's SIGINT/SIGTERM path: a throwaway server leaves no desktop
   *  behind; an installed one keeps it for the next boot to adopt. */
  shutdown() { return this._stopOnShutdown ? this.stop() : false; }
}

module.exports = { VncManager, portListening };
