// The TAILSCALE built-in plugin (2.140.0, B-2d44 — the first plugin; moved out of src/plugins.js by lane dc-plugins,
// 2026-10-04: one file per built-in plugin, registered by ONE line in src/plugins/index.js). Dual mode —
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
// The plugin contract (create(h) → verbs, the host handle h) is described in src/plugins.js.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { pidCmdline, pidAlive } = require('./proc.js');

const SOCKS_PORT = Number(process.env.VIBESPACE_TAILSCALE_SOCKS_PORT || 1055);

module.exports = {
  id: 'tailscale',
  label: 'Tailscale',
  description: 'Join your tailnet — reach home/LAN machines (NAS, dev boxes) from this instance. State persists across container rebuilds; no re-login.',
  provides: ['tunnel'],
  create(h) {
    const loginProcs = new Map(); // id → {proc, authUrl}
    const tsDir = () => h.dir;
    const tsBin = (name) => {
      const local = path.join(tsDir(), 'bin', name);
      if (fs.existsSync(local)) return local;
      try { return execFileSync('which', [name], { encoding: 'utf-8' }).trim() || null; } catch { return null; }
    };
    const tsSock = () => path.join(tsDir(), 'tailscaled.sock');
    const tsPidFile = () => path.join(tsDir(), 'tailscaled.pid');
    const tsOurDaemonPid = () => {
      try {
        const pid = Number(fs.readFileSync(tsPidFile(), 'utf-8').trim());
        if (pid && pidAlive(pid) && pidCmdline(pid).includes('tailscaled')) return pid;
      } catch { }
      return null;
    };
    const systemTailscaled = () => {
      // a root/system tailscaled on the DEFAULT socket — report, never manage.
      // OURS is identified by its cmdline referencing our socket/dir (in kernel
      // mode tailscaled runs under a `sudo` wrapper AND forks a child, so pgrep
      // returns pids that differ from the pidfile — comparing pids alone
      // false-flagged our own child as 'system', graying out the card).
      try {
        const out = execFileSync('pgrep', ['-x', 'tailscaled'], { encoding: 'utf-8' }).trim();
        const ours = tsSock();
        const ourDir = tsDir();
        for (const pid of out.split('\n').filter(Boolean)) {
          const cmd = pidCmdline(Number(pid));
          if (cmd.includes(ours) || cmd.includes(ourDir)) continue; // our parent/child
          return Number(pid); // genuinely foreign (default socket, dev machine)
        }
      } catch { }
      return null;
    };
    const sudoAvailable = () => {
      try { execFileSync('sudo', ['-n', 'true'], { stdio: 'ignore', timeout: 3000 }); return true; } catch { return false; }
    };
    const tunUsable = () => {
      try { fs.accessSync('/dev/net/tun', fs.constants.R_OK | fs.constants.W_OK); return true; } catch { }
      // root/sudo can still open it even without direct perms
      return fs.existsSync('/dev/net/tun') && (process.getuid?.() === 0 || sudoAvailable());
    };
    // User-tuned `tailscale up` flags (free text, whitespace-separated). Only
    // tokens starting with '-' or their following values are kept, and a small
    // denylist blocks flags we own (--socket/--tun/--socks5-server/up itself).
    const upFlags = () => {
      const raw = h.rec().upFlags;
      if (!raw) return [];
      const OWNED = /^--(socket|tun|socks5-server|outbound-http-proxy-listen|accept-routes)(=|$)/;
      return String(raw).split(/\s+/).filter(Boolean).filter((tok) => !OWNED.test(tok));
    };

    const verbs = {
      mode(mode) {
        if (!['auto', 'kernel', 'userspace'].includes(mode)) throw new Error('mode must be auto|kernel|userspace');
        h.rec().mode = mode;
        h.save();
        // if running, restart into the new mode (login persists in the statedir)
        if (tsOurDaemonPid()) { try { verbs.stop(); } catch { } setTimeout(() => { try { verbs.start(); } catch { } }, 1500); }
        h.notify();
        return { mode };
      },

      config(patch) {
        const rec = h.rec();
        if (patch.upFlags !== undefined) rec.upFlags = String(patch.upFlags || '').slice(0, 500);
        h.save();
        h.notify();
        return { upFlags: rec.upFlags || '' };
      },

      async install() {
        const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
        if (!arch) throw new Error('unsupported arch: ' + process.arch);
        const binDir = path.join(tsDir(), 'bin');
        fs.mkdirSync(binDir, { recursive: true, mode: 0o700 });
        // resolve the latest stable tarball name from the official index
        const idx = await fetch(`https://pkgs.tailscale.com/stable/?mode=json`).then((r) => r.json());
        const name = (idx.Tarballs || {})[arch];
        if (!name) throw new Error('no tarball for ' + arch);
        const tgz = path.join(tsDir(), name);
        const res = await fetch(`https://pkgs.tailscale.com/stable/${name}`);
        if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
        fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
        // tarball layout: tailscale_<ver>_<arch>/{tailscale,tailscaled}
        execFileSync('tar', ['-xzf', tgz, '-C', tsDir()]);
        const extracted = fs.readdirSync(tsDir()).find((f) => f.startsWith('tailscale_') && fs.statSync(path.join(tsDir(), f)).isDirectory());
        if (!extracted) throw new Error('unexpected tarball layout');
        for (const b of ['tailscale', 'tailscaled']) {
          fs.copyFileSync(path.join(tsDir(), extracted, b), path.join(binDir, b));
          fs.chmodSync(path.join(binDir, b), 0o755);
        }
        fs.rmSync(path.join(tsDir(), extracted), { recursive: true, force: true });
        fs.rmSync(tgz, { force: true });
        h.rec().installedAt = Date.now();
        h.save();
        h.notify();
        return { installed: true, version: extracted.replace(/^tailscale_/, '').replace(/_[^_]+$/, '') };
      },

      start() {
        if (systemTailscaled()) throw new Error('a system tailscaled is already running — this machine is managed outside VibeSpace');
        if (tsOurDaemonPid()) return { running: true };
        const daemon = tsBin('tailscaled');
        if (!daemon) throw new Error('tailscaled not installed — run install first');
        // the socket-path census (src/sock-path.js, lane-pairing ④): tailscaled's socket lives under the plugin root —
        // a path over the platform's sun_path is refused HERE by name, never a daemon that dies with `bind: invalid argument`
        { const fit = require('../sock-path.js').socketPathFits(tsSock(), process.platform); if (!fit.fits) throw new Error(`tailscaled's socket path would be ${fit.bytes} bytes (${tsSock()}) — over this platform's ${fit.max}-byte unix-socket limit; move the VibeSpace home to a shorter path`); }
        const stateDir = path.join(tsDir(), 'state');
        fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
        const logFd = fs.openSync(path.join(tsDir(), 'tailscaled.log'), 'a');
        // Mode preference (user-settable): 'auto' (default — kernel if a usable tun
        // exists, else userspace), 'kernel' (force full-tunnel; errors if no tun),
        // 'userspace' (force proxy-only — never touches the pod's routing table).
        const pref = h.rec().mode || 'auto';
        if (pref === 'kernel' && !tunUsable()) throw new Error('kernel mode needs /dev/net/tun + NET_ADMIN (or sudo) — none available; use auto or userspace');
        const kernel = pref === 'kernel' || (pref === 'auto' && tunUsable());
        const args = [
          `--statedir=${stateDir}`,
          `--socket=${tsSock()}`,
          ...(kernel ? [] : ['--tun=userspace-networking', `--socks5-server=localhost:${SOCKS_PORT}`, `--outbound-http-proxy-listen=localhost:${SOCKS_PORT + 1}`]),
        ];
        // kernel mode needs NET_ADMIN: root directly, else passwordless sudo
        const useSudo = kernel && process.getuid?.() !== 0;
        const cmd = useSudo ? 'sudo' : daemon;
        const argv = useSudo ? ['-n', daemon, ...args] : args;
        const child = spawn(cmd, argv, { detached: true, stdio: ['ignore', logFd, logFd] });
        child.unref();
        fs.writeFileSync(tsPidFile(), String(child.pid));
        const rec = h.rec();
        rec.desiredUp = true;
        rec.mode = kernel ? 'kernel' : 'userspace';
        h.save();
        setTimeout(() => h.notify(), 1500);
        return { starting: true, mode: rec.mode };
      },

      stop() {
        const pid = tsOurDaemonPid();
        if (pid) {
          // kernel-mode daemon may run as root — try plain kill, then sudo
          try { process.kill(pid, 'SIGTERM'); }
          catch { try { execFileSync('sudo', ['-n', 'kill', String(pid)], { timeout: 5000 }); } catch { } }
        }
        try { fs.unlinkSync(tsPidFile()); } catch { }
        const rec = h.rec();
        rec.desiredUp = false;
        h.save();
        h.notify();
        return { stopped: true };
      },

      status() {
        const rec = h.peek();
        const installed = !!tsBin('tailscaled');
        const sysPid = systemTailscaled();
        const base = {
          installed,
          tunAvailable: fs.existsSync('/dev/net/tun'),
          tunUsable: tunUsable(),
          sudo: sudoAvailable(),
          desiredUp: !!rec.desiredUp,
          modePref: rec.mode || 'auto',
          upFlags: rec.upFlags || '',
          socksPort: SOCKS_PORT,
        };
        const cli = tsBin('tailscale');
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
        const pid = tsOurDaemonPid();
        if (!pid) return { ...base, running: false, mode: rec.mode || null };
        return { ...base, running: true, mode: rec.mode || 'userspace', pid, ...(probe(tsSock()) || {}) };
      },

      // Guided login: `tailscale up` prints the auth URL — capture it for the UI
      // (the Drive-OAuth pattern: user opens the link, approves, we poll status).
      setup() {
        const id = h.id;
        if (systemTailscaled()) throw new Error('system tailscaled — log in with `sudo tailscale up` on the machine');
        if (!tsOurDaemonPid()) throw new Error('daemon not running — start it first');
        const st = verbs.status();
        if (st.backendState === 'Running') return Promise.resolve({ done: true, self: st.self });
        const prev = loginProcs.get(id);
        if (prev?.authUrl && prev.proc.exitCode === null) return Promise.resolve({ authUrl: prev.authUrl });
        prev?.proc?.kill?.();
        const cli = tsBin('tailscale');
        h.rec();
        const running = verbs.status().mode; // 'kernel' | 'userspace'
        const useSudo = running === 'kernel' && process.getuid?.() !== 0;
        // Base flags + user-tuned `tailscale up` flags (advertise-routes, exit-node,
        // hostname, ssh, …). Stored per-plugin; validated to look like flags.
        const argv = [`--socket=${tsSock()}`, 'up', '--accept-routes', ...upFlags()];
        const proc = spawn(useSudo ? 'sudo' : cli, useSudo ? ['-n', cli, ...argv] : argv, { stdio: ['ignore', 'pipe', 'pipe'] });
        const entry = { proc, authUrl: null };
        loginProcs.set(id, entry);
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
            h.notify();
            if (!entry.authUrl) {
              if (code === 0) resolve({ done: true }); // already authorized (key in statedir)
              else reject(new Error('tailscale up failed: ' + out.trim().slice(-300)));
            }
          });
          setTimeout(() => { if (!entry.authUrl && proc.exitCode === null) resolve({ pending: true }); }, 15000);
        });
      },
    };
    return verbs;
  },
};
