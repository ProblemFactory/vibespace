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
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execFileSync } = require('child_process');

const VNC_PORT = parseInt(process.env.VIBESPACE_VNC_PORT || '', 10) || 5901;
const VNC_DISPLAY = process.env.VIBESPACE_VNC_DISPLAY || ':7';
const VNC_GEOMETRY = process.env.VIBESPACE_VNC_GEOMETRY || '1920x1080';

function which(cmd) {
  try { return execFileSync('which', [cmd], { timeout: 2000 }).toString().trim() || null; } catch { return null; }
}

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

class VncManager {
  constructor({ dataDir, stopOnShutdown = false }) {
    this._pidFile = path.join(dataDir, 'vnc.pid');
    this.port = VNC_PORT;
    this.display = VNC_DISPLAY;
    this._starting = null; // in-flight ensureRunning promise (dedupe)
    this._xvncBin = null;
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

  _findXvnc() {
    if (this._xvncBin) return this._xvncBin;
    this._xvncBin = which('Xtigervnc') || which('Xvnc');
    return this._xvncBin;
  }

  async status() {
    const running = await portListening(this.port);
    this._running = running;
    return { available: running || !!this._findXvnc(), running, port: this.port };
  }

  /** Start (or adopt) the desktop stack. Resolves to status(). */
  async ensureRunning() {
    if (this._starting) return this._starting;
    this._starting = this._ensureRunning().finally(() => { this._starting = null; });
    return this._starting;
  }

  async _ensureRunning() {
    if (await portListening(this.port)) return this.status(); // adopt
    const xvnc = this._findXvnc();
    if (!xvnc) throw new Error('no VNC server installed (Xtigervnc/Xvnc not on PATH)');
    // -localhost + SecurityTypes None is safe BECAUSE the only route in is the
    // cookie-authed WS bridge; never expose the raw port.
    // -UseBlacklist=0 is REQUIRED, not optional: TigerVNC blacklists a source
    // host after N unauthenticated connect-then-drop attempts (default 5,
    // timeout doubles each strike). EVERY connection here is 127.0.0.1 (the
    // bridge), AND our own `portListening` health probe connects+immediately
    // destroys the socket — which TigerVNC counts as a failed attempt. A few
    // status polls poisoned the blacklist and locked the desktop out with
    // "Too many security failures" (real report). Auth is done by the bridge,
    // so the blacklist protects nothing and only self-DoSes.
    const xArgs = [this.display, '-localhost', '-SecurityTypes', 'None',
      '-UseBlacklist', '0',
      '-rfbport', String(this.port), '-geometry', VNC_GEOMETRY, '-depth', '24'];
    const x = spawn(xvnc, xArgs, { detached: true, stdio: 'ignore' });
    // an `error` with no listener is an uncaught exception = the whole server
    // (the desktop-display.js r2 lesson: a binary gone between probe and spawn)
    x.on('error', (e) => console.warn(`[vnc] ${path.basename(xvnc)} failed to spawn: ${e.message}`));
    x.unref();
    if (x.pid) this._own = { pid: x.pid, start: procStart(x.pid) };
    try { fs.writeFileSync(this._pidFile, String(x.pid)); } catch {}
    // Wait for the RFB port, then start the desktop session on that display.
    for (let i = 0; i < 50; i++) {
      if (await portListening(this.port)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!(await portListening(this.port))) throw new Error('VNC server failed to start');
    this._startSession();
    return this.status();
  }

  /** Desktop session on the VNC display: XFCE preferred, fallbacks probed. */
  _startSession() {
    const env = { ...process.env, DISPLAY: this.display };
    delete env.XAUTHORITY; // our Xvnc runs without an auth cookie file
    const dbusLaunch = which('dbus-launch');
    const candidates = [
      ['xfce4-session', []],
      ['startxfce4', []],
      ['openbox-session', []],
      ['xterm', []], // last resort: at least a usable terminal appears
    ];
    for (const [cmd, args] of candidates) {
      const bin = which(cmd);
      if (!bin) continue;
      const [c, a] = dbusLaunch && cmd !== 'xterm'
        ? [dbusLaunch, ['--exit-with-session', bin, ...args]]
        : [bin, args];
      const p = spawn(c, a, { detached: true, stdio: 'ignore', env });
      p.unref();
      return cmd;
    }
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
