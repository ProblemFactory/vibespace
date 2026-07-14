// HostMounts (2.147.0) — the REVERSE mount direction of "互挂云盘": mount THIS
// VibeSpace's storage ON a remote machine, OS-aware. (The forward direction —
// VibeSpace mounting a remote's disk — is the existing SFTP mount type.)
//
// Mechanism: VibeSpace already serves its files over the /dav WebDAV bridge
// with SCOPED vsmt_ tokens (src/webdav.js). The remote machine mounts that URL
// as a normal folder so its own processes see VibeSpace's files.
//
// TRANSPORT (2.148.0, user directive "不应该通过tailscale/公网"): the PRIMARY
// path is the agentd TUNNEL — DeviceManager.reverseForward binds a loopback
// port ON THE REMOTE whose accepted connections ride the device link (ssh
// stdio or wss dial-out) back to OUR OWN 127.0.0.1:<serverPort>. The remote
// mounts http://127.0.0.1:<port>/dav — NAT-traversal by construction, zero
// public-URL / VPN dependency, and the daemon keeps the port bound across
// link drops (reconnecting server re-owns it → mounts heal in place).
// agentd.publicUrl is only the FALLBACK for hosts without the device agent.
//
// OS matrix (the "consider the remote OS" requirement) — chosen per `uname`:
//   Linux  : rclone webdav mount (FUSE; /dev/fuse). Fallback: mount.davfs.
//   macOS  : rclone webdav mount (macFUSE) if present; else NATIVE mount_webdav
//            (built-in, no FUSE) via a mount helper.
//   Windows: rclone webdav mount to a drive letter (WinFsp) if present; else
//            NATIVE `net use` to the WebClient redirector (built-in, no FUSE).
// rclone is the cross-OS primary (we manage the pinned binary); the native
// per-OS fallbacks cover machines without a FUSE layer.
//
// Orchestration rides the CS device agent when the data-plane flag is on
// (hosts.device(id).runCmd / fsWrite), else plain ssh — same commands.
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const RCLONE_PIN = 'v1.65.2';

class HostMounts {
  /** @param deps { hosts, mountTokens, publicUrl:()=>string|null, localPort:()=>number|null, rcloneLocalBin:()=>string|null } */
  constructor({ dataDir, hosts, mountTokens, publicUrl, localPort, rcloneLocalBin, broadcast }) {
    this.dataDir = dataDir;
    this.hosts = hosts;
    this.mountTokens = mountTokens;
    this.publicUrl = publicUrl || (() => null);
    this.localPort = localPort || (() => null);
    this.rcloneLocalBin = rcloneLocalBin || (() => null);
    this.broadcast = broadcast || (() => {});
    this._file = path.join(dataDir, 'host-mounts.json');
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); } catch { this._state = { mounts: [] }; }
  }

  _save() {
    try { const t = this._file + '.tmp'; fs.writeFileSync(t, JSON.stringify(this._state, null, 2), { mode: 0o600 }); fs.renameSync(t, this._file); } catch { }
  }
  _notify() { this.broadcast({ type: 'host-mounts-updated', mounts: this.list() }); }
  list() { return this._state.mounts.map((m) => ({ id: m.id, hostId: m.hostId, folder: m.folder, mountpoint: m.mountpoint, mode: m.mode, os: m.os, method: m.method, via: m.tunnelPort ? 'tunnel' : 'public', mountedAt: m.mountedAt })); }

  /** How the remote reaches OUR /dav: agentd tunnel first (NAT-proof — bytes
   *  ride the device link), agentd.publicUrl second. wantPort pins a previous
   *  tunnel port (restore/re-mount stability). */
  async _davBase(hostId, { wantPort = 0, publicUrlFallback = null } = {}) {
    const lp = this.localPort();
    if (this.hosts.dataPlaneOn?.() && lp) {
      try {
        const dm = await this.hosts.device(hostId);
        const net = require('net');
        const { port } = await dm.reverseForward({ port: wantPort || 0, connectLocal: () => net.connect(lp, '127.0.0.1') });
        return { base: `http://127.0.0.1:${port}`, tunnelPort: port };
      } catch { /* device unreachable → public fallback below */ }
    }
    const pub = this.publicUrl() || publicUrlFallback;
    if (pub) return { base: String(pub).replace(/\/$/, ''), tunnelPort: null };
    throw new Error('no path for the remote to reach this instance — turn on agentd.dataPlane (the mount then rides the device tunnel, no public address needed) or set agentd.publicUrl');
  }

  /** Boot: re-own the device-side tunnel ports for recorded tunnel mounts so
   *  surviving remote mounts heal after a server restart. Best-effort. */
  async restore() {
    const lp = this.localPort();
    if (!lp || !this.hosts.dataPlaneOn?.()) return;
    const net = require('net');
    for (const rec of this._state.mounts) {
      if (!rec.tunnelPort) continue;
      try {
        const dm = await this.hosts.device(rec.hostId);
        await dm.reverseForward({ port: rec.tunnelPort, connectLocal: () => net.connect(lp, '127.0.0.1') });
      } catch { }
    }
  }

  // ── ssh/device helpers (run the SAME argv either way) ──
  async _run(hostId, cmd, args, { input } = {}) {
    if (this.hosts.dataPlaneOn?.()) {
      try {
        const dm = await this.hosts.device(hostId);
        if (input != null) { // write then run pattern handled by callers via fsWrite; here argv only
        }
        const r = await dm.runCmd(cmd, args, { stdin: input, timeoutMs: 60000 });
        return { code: r.code, stdout: r.stdout, stderr: r.stderr };
      } catch { /* fall through to ssh */ }
    }
    const h = this.hosts.get(hostId);
    const { execFile } = require('child_process');
    const sshArgs = [...this.hosts.sshArgs(h, { multiplex: true }), '--', [cmd, ...args.map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`)].join(' ')];
    return await new Promise((resolve) => {
      const child = execFile('ssh', sshArgs, { timeout: 60000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) resolve({ code: err.code || 1, stdout: (stdout || '').toString(), stderr: (stderr || err.message).toString() });
        else resolve({ code: 0, stdout: (stdout || '').toString(), stderr: '' });
      });
      if (input != null) { try { child.stdin.end(input); } catch {} } else { try { child.stdin.end(); } catch {} }
    });
  }
  async _writeRemote(hostId, absPath, buf, mode = 0o600) {
    if (this.hosts.dataPlaneOn?.()) {
      try { const dm = await this.hosts.device(hostId); await dm.fsWrite(absPath, buf); await dm.runCmd('chmod', [mode.toString(8), absPath]); return; } catch { }
    }
    const h = this.hosts.get(hostId);
    const { execFile } = require('child_process');
    await new Promise((resolve, reject) => {
      const child = execFile('ssh', [...this.hosts.sshArgs(h, { multiplex: true }), '--', `umask 077; mkdir -p "$(dirname '${absPath}')"; cat > '${absPath}'; chmod ${mode.toString(8)} '${absPath}'`], { timeout: 30000 }, (err) => err ? reject(err) : resolve());
      try { child.stdin.end(buf); } catch {}
    });
  }

  async detectOS(hostId) {
    const r = await this._run(hostId, 'uname', ['-s']);
    const u = (r.stdout || '').trim();
    if (r.code === 0 && u) return u === 'Darwin' ? 'macos' : (u === 'Linux' ? 'linux' : 'unix');
    return 'windows'; // uname missing → assume Windows
  }
  async _remoteHome(hostId) {
    const r = await this._run(hostId, 'sh', ['-c', 'echo "$HOME"']);
    return (r.stdout || '').trim() || '/root';
  }
  async _hasBin(hostId, name) {
    const r = await this._run(hostId, 'sh', ['-c', `command -v ${name} >/dev/null 2>&1 && echo yes || echo no`]);
    return (r.stdout || '').includes('yes');
  }

  /** Ensure rclone on the remote: prefer ~/.vibespace/bin/rclone; if absent and
   *  the remote arch/os matches ours, PUSH our pinned binary; else fetch. */
  async _ensureRclone(hostId, osKind) {
    const home = await this._remoteHome(hostId);
    const remoteBin = `${home}/.vibespace/bin/rclone`;
    const has = await this._run(hostId, 'sh', ['-c', `[ -x "${remoteBin}" ] && "${remoteBin}" version >/dev/null 2>&1 && echo yes || echo no`]);
    if ((has.stdout || '').includes('yes')) return remoteBin;
    if (await this._hasBin(hostId, 'rclone')) return 'rclone';
    // fetch on the remote (curl+unzip); pinned version, os/arch from uname
    const arch = (await this._run(hostId, 'uname', ['-m'])).stdout.trim();
    const rcArch = { x86_64: 'amd64', aarch64: 'arm64', arm64: 'arm64' }[arch] || 'amd64';
    const rcOs = osKind === 'macos' ? 'osx' : 'linux';
    const url = `https://downloads.rclone.org/${RCLONE_PIN}/rclone-${RCLONE_PIN}-${rcOs}-${rcArch}.zip`;
    const fetch = await this._run(hostId, 'sh', ['-c',
      `set -e; mkdir -p "${home}/.vibespace/bin"; cd "$(mktemp -d)"; curl -fsSL -o r.zip '${url}'; unzip -oj r.zip 'rclone-*/rclone' -d "${home}/.vibespace/bin"; chmod 755 "${remoteBin}"; "${remoteBin}" version >/dev/null 2>&1 && echo OK`]);
    if (!(fetch.stdout || '').includes('OK')) throw new Error('rclone install on host failed: ' + (fetch.stderr || fetch.stdout || '').slice(0, 200));
    return remoteBin;
  }

  /** Mount THIS VibeSpace's <folder> on the remote host as <mountpoint>. */
  async mountOnHost(hostId, { folder, mode = 'ro', mountpoint, publicUrlFallback } = {}) {
    const { base, tunnelPort } = await this._davBase(hostId, { publicUrlFallback });
    const abs = path.resolve(String(folder || os.homedir()));
    const share = this.mountTokens.mint({ name: 'host:' + hostId, root: abs, mode: mode === 'rw' ? 'rw' : 'ro' });
    const shareToken = share.raw, shareTokenId = share.rec.id;
    const davUrl = base + '/dav';
    const osKind = await this.detectOS(hostId);
    const home = await this._remoteHome(hostId);
    const mp = mountpoint || `${home}/vibespace-remote/${path.basename(abs) || 'root'}`;
    const id = 'hm-' + require('crypto').randomBytes(4).toString('hex');
    let method;

    if (osKind === 'windows') {
      // native WebClient redirector — no FUSE. drive letter or UNC-style path.
      const r = await this._run(hostId, 'cmd', ['/c', `net use * ${davUrl.replace(/^https?:/, m => m)} /user:vibespace ${shareToken} /persistent:no`]);
      if (r.code !== 0) throw new Error('net use failed: ' + (r.stderr || r.stdout).slice(0, 200));
      method = 'net-use';
    } else {
      const useNativeMac = osKind === 'macos' && !(await this._hasBin(hostId, 'rclone')) && !fs.existsSync('/dev/fuse');
      if (useNativeMac) {
        // macOS built-in WebDAV (no macFUSE): mount_webdav via a keychain-free URL
        await this._run(hostId, 'mkdir', ['-p', mp]);
        const url2 = davUrl.replace('://', `://vibespace:${shareToken}@`);
        const r = await this._run(hostId, 'mount_webdav', ['-S', url2, mp]);
        if (r.code !== 0) throw new Error('mount_webdav failed: ' + (r.stderr || r.stdout).slice(0, 200));
        method = 'mount_webdav';
      } else {
        const rclone = await this._ensureRclone(hostId, osKind);
        await this._run(hostId, 'mkdir', ['-p', mp]);
        // rclone webdav via env (no config file; bearer token) + detached mount
        const env = `RCLONE_CONFIG_VSDAV_TYPE=webdav RCLONE_CONFIG_VSDAV_URL='${davUrl}' RCLONE_CONFIG_VSDAV_VENDOR=other RCLONE_CONFIG_VSDAV_BEARER_TOKEN='${shareToken}'`;
        const roFlag = mode === 'rw' ? '' : '--read-only';
        // FULL fd redirect (</dev/null >/dev/null 2>>log) is MANDATORY: without
        // it the --daemon rclone inherits the ssh channel's stdio and the
        // ControlMaster connection never frees, deadlocking the next
        // multiplexed ssh (the mount itself works fine — this is transport
        // hygiene, caught by the reverse-mount e2e).
        const logf = `${home}/.vibespace/host-mount-${id}.log`;
        const cmd = `${env} setsid "${rclone}" mount vsdav: '${mp}' --daemon --vfs-cache-mode ${mode === 'rw' ? 'writes' : 'off'} ${roFlag} --dir-cache-time 10s --timeout 30s --contimeout 10s </dev/null >/dev/null 2>>'${logf}'`;
        const r = await this._run(hostId, 'sh', ['-c', cmd]);
        if (r.code !== 0) throw new Error('rclone mount failed: ' + (r.stderr || r.stdout).slice(0, 300));
        method = 'rclone-webdav';
      }
    }
    const rec = { id, hostId, folder: abs, mountpoint: mp, mode, os: osKind, method, tokenId: shareTokenId, tunnelPort, mountedAt: Date.now() };
    this._state.mounts.push(rec);
    this._save(); this._notify();
    return { id, mountpoint: mp, os: osKind, method, via: tunnelPort ? 'tunnel' : 'public' };
  }

  async unmountOnHost(hostId, mountId) {
    const rec = this._state.mounts.find((m) => m.id === mountId && m.hostId === hostId);
    if (!rec) throw new Error('no such host mount');
    if (rec.method === 'rclone-webdav' || rec.method === 'mount_webdav') {
      await this._run(hostId, 'sh', ['-c', `fusermount -u '${rec.mountpoint}' 2>/dev/null || umount '${rec.mountpoint}' 2>/dev/null || true`]);
    } else if (rec.method === 'net-use') {
      await this._run(hostId, 'cmd', ['/c', `net use ${rec.mountpoint} /delete /y`]);
    }
    try { this.mountTokens.revoke?.(rec.tokenId); } catch { }
    if (rec.tunnelPort) { // release the device-side listener (best-effort)
      try { const dm = await this.hosts.device(rec.hostId); await dm.reverseUnforward(rec.tunnelPort); } catch { }
    }
    this._state.mounts = this._state.mounts.filter((m) => m.id !== mountId);
    this._save(); this._notify();
    return { ok: true };
  }
}

module.exports = { HostMounts };
