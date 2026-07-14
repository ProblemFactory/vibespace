// PluginManager (2.140.0, B-2d44) — a GENERIC mechanism for host-level
// capabilities that need: an install step, PERSISTENT state across pod
// rebuilds (everything lives under ~/.vibespace/plugins/<id>/ — the home dir
// is the per-user PVC in fleet deployments), a boot-time replay (rootfs is
// volatile — enabled plugins restart with the server), a guided setup flow
// (auth URLs surfaced to the UI like the Drive OAuth flow), and live status.
//
// First plugin: TAILSCALE. Dual mode —
//   • kernel: /dev/net/tun usable (+ root or passwordless sudo) → full tunnel
//     (SMB/NFS mounts to tailnet hosts work). Helm exposes an optional tun
//     device + NET_ADMIN for this.
//   • userspace: no tun needed, runs as the plain user —
//     `--tun=userspace-networking` + a local SOCKS5/HTTP proxy (ssh/http to
//     tailnet hosts work through localhost:<port>).
// A SYSTEM tailscaled (the dev-machine case) is detected and reported, never
// managed. Our instance runs with its OWN --socket and --statedir so it can
// coexist with a system daemon. The node key lives in the statedir → a pod
// rebuild reconnects WITHOUT re-login (the whole point).
//
// State: data/plugins.json { plugins: { <id>: { enabled, config, desiredUp } } }
// (enabled = replay at boot; runtime pid/state live in the plugin dir itself).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');

const PLUGIN_ROOT = path.join(os.homedir(), '.vibespace', 'plugins');
const SOCKS_PORT = Number(process.env.VIBESPACE_TAILSCALE_SOCKS_PORT || 1055);

function pidCmdline(pid) {
  try { return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf-8').replace(/\0/g, ' '); } catch { return ''; }
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

class PluginManager {
  constructor({ dataDir, broadcast }) {
    this._file = path.join(dataDir, 'plugins.json');
    this.broadcast = broadcast || (() => {});
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); } catch { this._state = { plugins: {} }; }
    this._loginProcs = new Map(); // id → {proc, authUrl}
  }

  _save() {
    try {
      const tmp = this._file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, this._file);
    } catch { }
  }

  _rec(id) { return (this._state.plugins[id] = this._state.plugins[id] || {}); }
  _notify() { this.broadcast({ type: 'plugins-updated', plugins: this.list() }); }

  // ── registry ──
  defs() {
    return {
      tailscale: {
        id: 'tailscale',
        label: 'Tailscale',
        description: 'Join your tailnet — reach home/LAN machines (NAS, dev boxes) from this instance. State persists across container rebuilds; no re-login.',
      },
    };
  }

  list() {
    return Object.values(this.defs()).map((d) => {
      const rec = this._state.plugins[d.id] || {};
      let st = {};
      try { st = this.status(d.id); } catch (e) { st = { error: e.message }; }
      return { ...d, enabled: !!rec.enabled, ...st };
    });
  }

  setEnabled(id, enabled) {
    if (!this.defs()[id]) throw new Error('unknown plugin: ' + id);
    this._rec(id).enabled = !!enabled;
    this._save();
    this._notify();
  }

  // Boot replay: rootfs is volatile — restart enabled plugins that were up.
  bootReplay() {
    for (const id of Object.keys(this.defs())) {
      const rec = this._state.plugins[id];
      if (!rec?.enabled || !rec?.desiredUp) continue;
      try {
        const st = this.status(id);
        if (!st.running && st.installed && st.mode !== 'system') {
          console.log(`[plugins] boot replay: starting ${id}`);
          this.start(id);
        }
      } catch (e) { console.warn(`[plugins] boot replay ${id} failed:`, e.message); }
    }
  }

  // ── tailscale ──
  _tsDir() { return path.join(PLUGIN_ROOT, 'tailscale'); }
  _tsBin(name) {
    const local = path.join(this._tsDir(), 'bin', name);
    if (fs.existsSync(local)) return local;
    try { return execFileSync('which', [name], { encoding: 'utf-8' }).trim() || null; } catch { return null; }
  }
  _tsSock() { return path.join(this._tsDir(), 'tailscaled.sock'); }
  _tsPidFile() { return path.join(this._tsDir(), 'tailscaled.pid'); }
  _tsOurDaemonPid() {
    try {
      const pid = Number(fs.readFileSync(this._tsPidFile(), 'utf-8').trim());
      if (pid && pidAlive(pid) && pidCmdline(pid).includes('tailscaled')) return pid;
    } catch { }
    return null;
  }
  _systemTailscaled() {
    // a root/system tailscaled on the default socket — report, never manage
    try {
      const out = execFileSync('pgrep', ['-x', 'tailscaled'], { encoding: 'utf-8' }).trim();
      for (const pid of out.split('\n').filter(Boolean)) {
        if (Number(pid) !== this._tsOurDaemonPid()) return Number(pid);
      }
    } catch { }
    return null;
  }
  _sudoAvailable() {
    try { execFileSync('sudo', ['-n', 'true'], { stdio: 'ignore', timeout: 3000 }); return true; } catch { return false; }
  }
  _tunUsable() {
    try { fs.accessSync('/dev/net/tun', fs.constants.R_OK | fs.constants.W_OK); return true; } catch { }
    // root/sudo can still open it even without direct perms
    return fs.existsSync('/dev/net/tun') && (process.getuid?.() === 0 || this._sudoAvailable());
  }

  async install(id) {
    if (id !== 'tailscale') throw new Error('unknown plugin: ' + id);
    const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
    if (!arch) throw new Error('unsupported arch: ' + process.arch);
    const binDir = path.join(this._tsDir(), 'bin');
    fs.mkdirSync(binDir, { recursive: true, mode: 0o700 });
    // resolve the latest stable tarball name from the official index
    const idx = await fetch(`https://pkgs.tailscale.com/stable/?mode=json`).then((r) => r.json());
    const name = (idx.Tarballs || {})[arch];
    if (!name) throw new Error('no tarball for ' + arch);
    const tgz = path.join(this._tsDir(), name);
    const res = await fetch(`https://pkgs.tailscale.com/stable/${name}`);
    if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
    fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
    // tarball layout: tailscale_<ver>_<arch>/{tailscale,tailscaled}
    execFileSync('tar', ['-xzf', tgz, '-C', this._tsDir()]);
    const extracted = fs.readdirSync(this._tsDir()).find((f) => f.startsWith('tailscale_') && fs.statSync(path.join(this._tsDir(), f)).isDirectory());
    if (!extracted) throw new Error('unexpected tarball layout');
    for (const b of ['tailscale', 'tailscaled']) {
      fs.copyFileSync(path.join(this._tsDir(), extracted, b), path.join(binDir, b));
      fs.chmodSync(path.join(binDir, b), 0o755);
    }
    fs.rmSync(path.join(this._tsDir(), extracted), { recursive: true, force: true });
    fs.rmSync(tgz, { force: true });
    this._rec('tailscale').installedAt = Date.now();
    this._save();
    this._notify();
    return { installed: true, version: extracted.replace(/^tailscale_/, '').replace(/_[^_]+$/, '') };
  }

  start(id) {
    if (id !== 'tailscale') throw new Error('unknown plugin: ' + id);
    if (this._systemTailscaled()) throw new Error('a system tailscaled is already running — this machine is managed outside VibeSpace');
    if (this._tsOurDaemonPid()) return { running: true };
    const daemon = this._tsBin('tailscaled');
    if (!daemon) throw new Error('tailscaled not installed — run install first');
    const stateDir = path.join(this._tsDir(), 'state');
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const logFd = fs.openSync(path.join(this._tsDir(), 'tailscaled.log'), 'a');
    const kernel = this._tunUsable();
    const args = [
      `--statedir=${stateDir}`,
      `--socket=${this._tsSock()}`,
      ...(kernel ? [] : ['--tun=userspace-networking', `--socks5-server=localhost:${SOCKS_PORT}`, `--outbound-http-proxy-listen=localhost:${SOCKS_PORT + 1}`]),
    ];
    // kernel mode needs NET_ADMIN: root directly, else passwordless sudo
    const useSudo = kernel && process.getuid?.() !== 0;
    const cmd = useSudo ? 'sudo' : daemon;
    const argv = useSudo ? ['-n', daemon, ...args] : args;
    const child = spawn(cmd, argv, { detached: true, stdio: ['ignore', logFd, logFd] });
    child.unref();
    fs.writeFileSync(this._tsPidFile(), String(child.pid));
    const rec = this._rec('tailscale');
    rec.desiredUp = true;
    rec.mode = kernel ? 'kernel' : 'userspace';
    this._save();
    setTimeout(() => this._notify(), 1500);
    return { starting: true, mode: rec.mode };
  }

  stop(id) {
    if (id !== 'tailscale') throw new Error('unknown plugin: ' + id);
    const pid = this._tsOurDaemonPid();
    if (pid) {
      // kernel-mode daemon may run as root — try plain kill, then sudo
      try { process.kill(pid, 'SIGTERM'); }
      catch { try { execFileSync('sudo', ['-n', 'kill', String(pid)], { timeout: 5000 }); } catch { } }
    }
    try { fs.unlinkSync(this._tsPidFile()); } catch { }
    const rec = this._rec('tailscale');
    rec.desiredUp = false;
    this._save();
    this._notify();
    return { stopped: true };
  }

  status(id) {
    if (id !== 'tailscale') throw new Error('unknown plugin: ' + id);
    const rec = this._state.plugins.tailscale || {};
    const installed = !!this._tsBin('tailscaled');
    const sysPid = this._systemTailscaled();
    const base = {
      installed,
      tunAvailable: fs.existsSync('/dev/net/tun'),
      sudo: this._sudoAvailable(),
      desiredUp: !!rec.desiredUp,
      socksPort: SOCKS_PORT,
    };
    const cli = this._tsBin('tailscale');
    const probe = (sockArg) => {
      try {
        const out = execFileSync(cli, [...(sockArg ? [`--socket=${sockArg}`] : []), 'status', '--json'], { encoding: 'utf-8', timeout: 5000 });
        const j = JSON.parse(out);
        return {
          backendState: j.BackendState,
          self: j.Self ? { dnsName: j.Self.DNSName, ips: j.Self.TailscaleIPs } : null,
          peers: j.Peer ? Object.keys(j.Peer).length : 0,
        };
      } catch { return null; }
    };
    if (sysPid) {
      // system daemon: report its state read-only (default socket)
      return { ...base, running: true, mode: 'system', ...(cli ? probe(null) || {} : {}) };
    }
    const pid = this._tsOurDaemonPid();
    if (!pid) return { ...base, running: false, mode: rec.mode || null };
    return { ...base, running: true, mode: rec.mode || 'userspace', pid, ...(probe(this._tsSock()) || {}) };
  }

  // Guided login: `tailscale up` prints the auth URL — capture it for the UI
  // (the Drive-OAuth pattern: user opens the link, approves, we poll status).
  loginStart(id) {
    if (id !== 'tailscale') throw new Error('unknown plugin: ' + id);
    if (this._systemTailscaled()) throw new Error('system tailscaled — log in with `sudo tailscale up` on the machine');
    if (!this._tsOurDaemonPid()) throw new Error('daemon not running — start it first');
    const st = this.status(id);
    if (st.backendState === 'Running') return Promise.resolve({ done: true, self: st.self });
    const prev = this._loginProcs.get(id);
    if (prev?.authUrl && prev.proc.exitCode === null) return Promise.resolve({ authUrl: prev.authUrl });
    prev?.proc?.kill?.();
    const cli = this._tsBin('tailscale');
    const rec = this._rec('tailscale');
    const useSudo = rec.mode === 'kernel' && process.getuid?.() !== 0;
    const argv = [`--socket=${this._tsSock()}`, 'up', '--accept-routes'];
    const proc = spawn(useSudo ? 'sudo' : cli, useSudo ? ['-n', cli, ...argv] : argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    const entry = { proc, authUrl: null };
    this._loginProcs.set(id, entry);
    return new Promise((resolve, reject) => {
      let out = '';
      const scan = (d) => {
        out += d.toString();
        const m = out.match(/https:\/\/login\.tailscale\.com\/[^\s]+/);
        if (m && !entry.authUrl) { entry.authUrl = m[0]; resolve({ authUrl: m[0] }); }
      };
      proc.stdout.on('data', scan);
      proc.stderr.on('data', scan);
      proc.on('exit', (code) => {
        this._notify();
        if (!entry.authUrl) {
          if (code === 0) resolve({ done: true }); // already authorized (key in statedir)
          else reject(new Error('tailscale up failed: ' + out.trim().slice(-300)));
        }
      });
      setTimeout(() => { if (!entry.authUrl && proc.exitCode === null) resolve({ pending: true }); }, 15000);
    });
  }
}

module.exports = { PluginManager };
