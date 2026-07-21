// MachineMounts (B-f3e8) — ONE mount manager for both directions on any
// machine (machine = a host record, transport ssh|dial):
//   push: THIS instance's folder mounted ON the machine over the /dav bridge
//         (was src/host-mounts.js — tunnel-first via reverseForward, OS-aware
//         rclone/mount_webdav/net-use; scoped vsmt_ tokens)
//   pull: the machine's folder mounted INTO this workspace over the device
//         link (was src/device-mounts.js — serve-folder → tcp-forward →
//         rclone webdav, read-only)
// Records live in data/machine-mounts.json keyed by hostId + dir; a one-time
// constructor migration ingests the legacy host-mounts.json (→ dir:'push')
// and device-mounts.json (deviceId → hostId, dir:'pull'), then renames both
// to *.migrated. Every data path rides hosts.device(hostId) — the SAME
// manager works for ssh (daemon over ssh --stdio) and dial (daemon dialed in)
// machines, which is the whole point of the unification.
//
// Persistence semantics: push mounts live on the REMOTE (rclone there
// survives us; restore() re-owns tunnel ports so they heal after our
// restart); pull mounts' live chain (serve-folder + bridge + rclone) is
// in-memory — restore()/onMachineLinked() remount recorded pulls (auto-heal;
// a pull whose machine is offline stays recorded + pending).
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { deviceFolderMount } = require('./device-mount');

const RCLONE_PIN = 'v1.65.2';

class MachineMounts {
  /** @param deps { hosts, mountTokens, publicUrl:()=>string|null, localPort:()=>number|null, rcloneBin:()=>string, broadcast, log } */
  constructor({ dataDir, hosts, mountTokens, publicUrl, localPort, rcloneBin, broadcast, log }) {
    this.dataDir = dataDir;
    this.hosts = hosts;
    this.mountTokens = mountTokens;
    this.publicUrl = publicUrl || (() => null);
    this.localPort = localPort || (() => null);
    this.rcloneBin = rcloneBin || (() => 'rclone');
    this.broadcast = broadcast || (() => {});
    this.log = log || (() => {});
    this._file = path.join(dataDir, 'machine-mounts.json');
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); }
    catch {
      // an unparseable store is backed up, never silently overwritten — its
      // records include live vsmt_ tokenIds (review hardening)
      try { if (fs.existsSync(this._file)) fs.copyFileSync(this._file, this._file + '.corrupt-' + Date.now()); } catch { }
      this._state = { mounts: [] };
      this._migrateLegacy();
    }
    // one-time hygiene: strip trailing slashes off legacy pull remotePaths —
    // slashed records predate the 2.168.0 intake normalization, never
    // dedup-match a re-added clean path (duplicate records on one mountpoint
    // cross-teardown each other), and fed the serve-folder double-slash 403
    let normed = false;
    for (const m of this._state.mounts || []) {
      if (m.dir === 'pull' && typeof m.remotePath === 'string' && /\/+$/.test(m.remotePath) && m.remotePath !== '/') {
        m.remotePath = m.remotePath.replace(/\/+$/, '') || '/';
        normed = true;
      }
    }
    if (normed) this._save();
    this._live = new Map(); // pull rec.id → { teardown, mountpoint }
    this._mounting = new Set(); // pull rec.id (single-flight)
    // Push tunnel ownership: rec.id whose reverse-forward listener was
    // established by THIS process. The boot re-own (restore→onMachineLinked)
    // is otherwise the ONLY attempt — ssh machines never dial in, the daemon
    // reaps a disowned listener after ~10min, and the machine-side rclone
    // STAYS in its mount table while pointing at the dead 127.0.0.1 port
    // (so the mount-table probe below can't see it) — review finding.
    this._pushTunnelOwned = new Set();
    this._pushRetryAt = new Map(); // push rec.id → next re-own attempt ts
    // Pull health sweep: a live pull whose LISTING hangs (its machine-side
    // serve-folder died with a daemon re-exec while the record still thinks
    // it's live — real Mac report) is torn down + remounted. Child-process ls
    // only (never node fs on a fuse mountpoint — §2.108.3 threadpool lesson).
    this._sweep = setInterval(() => this._healthSweep().catch(() => {}), 90000);
    if (this._sweep.unref) this._sweep.unref();
  }

  /** One-time ingest of the two pre-B-f3e8 stores. deviceId → hostId via the
   *  dial host record (hosts' dial-token migration runs FIRST in server.js,
   *  so the record is guaranteed). LOSSLESS is load-bearing (review-confirmed
   *  failure mode: rename-after-swallowed-save-error loses every record on an
   *  ENOSPC boot): each store is ingested per-file (one corrupt file can't
   *  take the other's data with it), the merged store is saved STRICTLY and
   *  re-parsed, and a legacy file is renamed .migrated only when it was
   *  actually ingested AND the save verified. */
  _migrateLegacy() {
    const hmF = path.join(this.dataDir, 'host-mounts.json');
    const dvF = path.join(this.dataDir, 'device-mounts.json');
    const ingest = (file, map) => {
      if (!fs.existsSync(file)) return null; // nothing to do
      try {
        const st = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const recs = (st.mounts || []).map(map);
        this._state.mounts.push(...recs);
        return recs.length;
      } catch (e) { this.log(`legacy store unreadable — kept in place (fix or remove it, then delete machine-mounts.json to re-migrate): ${file}: ${e.message}`); return -1; }
    };
    const nPush = ingest(hmF, (m) => ({ ...m, dir: 'push' }));
    const nPull = ingest(dvF, (m) => ({
      id: m.id, dir: 'pull',
      hostId: this.hosts.findByDeviceId?.(m.deviceId)?.id || ('host-dial-' + String(m.deviceId || '').replace(/[^\w-]/g, '')),
      remotePath: m.remotePath, mountpoint: m.mountpoint, createdAt: m.createdAt,
    }));
    if (nPush === null && nPull === null) return;
    try {
      const t = this._file + '.tmp';
      fs.writeFileSync(t, JSON.stringify(this._state, null, 2), { mode: 0o600 });
      fs.renameSync(t, this._file);
      JSON.parse(fs.readFileSync(this._file, 'utf-8')); // verify before renaming legacy stores
    } catch (e) { this.log('migration save FAILED — legacy stores kept, will re-run next boot: ' + e.message); return; }
    try { if (nPush >= 0 && fs.existsSync(hmF)) fs.renameSync(hmF, hmF + '.migrated'); } catch { }
    try { if (nPull >= 0 && fs.existsSync(dvF)) fs.renameSync(dvF, dvF + '.migrated'); } catch { }
    const migrated = (nPush > 0 ? nPush : 0) + (nPull > 0 ? nPull : 0);
    if (migrated) this.log(`migrated ${migrated} legacy mount record(s) into machine-mounts.json`);
  }

  _save() {
    try { const t = this._file + '.tmp'; fs.writeFileSync(t, JSON.stringify(this._state, null, 2), { mode: 0o600 }); fs.renameSync(t, this._file); } catch { }
  }
  _notify() { this.broadcast({ type: 'machine-mounts-updated', mounts: this.list() }); }

  _online(hostId) {
    try {
      const h = this.hosts.get(hostId);
      return h.transport === 'dial' ? !!this.hosts.dialOnline?.(h.deviceId) : true; // ssh: reachability is probed at use
    } catch { return false; }
  }

  list() {
    return this._state.mounts.map((m) => m.dir === 'pull'
      ? { id: m.id, dir: 'pull', hostId: m.hostId, remotePath: m.remotePath, mountpoint: m.mountpoint, live: this._live.has(m.id), online: this._online(m.hostId), createdAt: m.createdAt }
      : { id: m.id, dir: 'push', hostId: m.hostId, folder: m.folder, mountpoint: m.mountpoint, mode: m.mode, os: m.os, method: m.method, via: m.tunnelPort ? 'tunnel' : 'public', mountedAt: m.mountedAt, remoteMounted: !this._pushDown?.has(m.id) });
  }

  // ═══ PUSH direction (this instance's folder → the machine) ═══

  /** How the remote reaches OUR /dav: device-agent tunnel first (NAT-proof —
   *  bytes ride the device link; the ONLY path for dial machines),
   *  agentd.publicUrl second. wantPort pins a previous tunnel port. */
  async _davBase(hostId, { wantPort = 0, publicUrlFallback = null } = {}) {
    const lp = this.localPort();
    const dial = (() => { try { return this.hosts.get(hostId).transport === 'dial'; } catch { return false; } })();
    if ((dial || this.hosts.dataPlaneOn?.()) && lp) {
      try {
        const dm = await this.hosts.device(hostId);
        const net = require('net');
        const { port } = await dm.reverseForward({ port: wantPort || 0, connectLocal: () => net.connect(lp, '127.0.0.1') });
        return { base: `http://127.0.0.1:${port}`, tunnelPort: port };
      } catch { if (dial) throw new Error('device unreachable — its daemon is not dialed in'); /* ssh → public fallback below */ }
    }
    const pub = this.publicUrl() || publicUrlFallback;
    if (pub) return { base: String(pub).replace(/\/$/, ''), tunnelPort: null };
    throw new Error('no path for the remote to reach this instance — the device tunnel needs the machine daemon link; otherwise set agentd.publicUrl (Settings) or deploy with VIBESPACE_PUBLIC_URL');
  }

  // ── run-on-machine helpers (device link first; ssh fallback for ssh hosts) ──
  async _run(hostId, cmd, args, { input } = {}) {
    const h = this.hosts.get(hostId);
    if (h.transport === 'dial' || this.hosts.dataPlaneOn?.()) {
      try {
        const dm = await this.hosts.device(hostId);
        const r = await dm.runCmd(cmd, args, { stdin: input, timeoutMs: 60000 });
        return { code: r.code, stdout: r.stdout, stderr: r.stderr };
      } catch (e) {
        if (h.transport === 'dial') return { code: 1, stdout: '', stderr: 'device unreachable: ' + e.message }; // no ssh to fall to
      }
    }
    const sshArgs = [...this.hosts.sshArgs(h, { multiplex: true }), '--', [cmd, ...args.map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`)].join(' ')];
    return await new Promise((resolve) => {
      const child = execFile('ssh', sshArgs, { timeout: 60000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) resolve({ code: err.code || 1, stdout: (stdout || '').toString(), stderr: (stderr || err.message).toString() });
        else resolve({ code: 0, stdout: (stdout || '').toString(), stderr: '' });
      });
      if (input != null) { try { child.stdin.end(input); } catch {} } else { try { child.stdin.end(); } catch {} }
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

  /** Ensure rclone on the machine: prefer ~/.vibespace/bin/rclone, else the
   *  system one, else fetch the pinned build (unzip → busybox → python3
   *  fallbacks — unzip is absent on bare Debian, real report). */
  async _ensureRclone(hostId, osKind) {
    const home = await this._remoteHome(hostId);
    const remoteBin = `${home}/.vibespace/bin/rclone`;
    const has = await this._run(hostId, 'sh', ['-c', `[ -x "${remoteBin}" ] && "${remoteBin}" version >/dev/null 2>&1 && echo yes || echo no`]);
    if ((has.stdout || '').includes('yes')) return remoteBin;
    if (await this._hasBin(hostId, 'rclone')) return 'rclone';
    const arch = (await this._run(hostId, 'uname', ['-m'])).stdout.trim();
    const rcArch = { x86_64: 'amd64', aarch64: 'arm64', arm64: 'arm64' }[arch] || 'amd64';
    const rcOs = osKind === 'macos' ? 'osx' : 'linux';
    const url = `https://downloads.rclone.org/${RCLONE_PIN}/rclone-${RCLONE_PIN}-${rcOs}-${rcArch}.zip`;
    const script = `set -e; mkdir -p "${home}/.vibespace/bin"; cd "$(mktemp -d)"; curl -fsSL -o r.zip '${url}'; `
      + `if command -v unzip >/dev/null 2>&1; then unzip -oj r.zip 'rclone-*/rclone' -d "${home}/.vibespace/bin"; `
      + `elif command -v busybox >/dev/null 2>&1 && busybox unzip -h >/dev/null 2>&1; then busybox unzip -o r.zip && cp rclone-*/rclone "${home}/.vibespace/bin/"; `
      + `elif command -v python3 >/dev/null 2>&1; then python3 -c "import zipfile,glob,shutil,os,stat; z=zipfile.ZipFile('r.zip'); z.extractall(); src=glob.glob('rclone-*/rclone')[0]; dst=os.path.expanduser('${home}/.vibespace/bin/rclone'); shutil.copy(src,dst); os.chmod(dst,0o755)"; `
      + `else echo 'need unzip (or busybox/python3) on this machine — e.g. apt install unzip' >&2; exit 9; fi; `
      + `chmod 755 "${remoteBin}"; "${remoteBin}" version >/dev/null 2>&1 && echo OK`;
    // The ~20MB download exceeds the daemon's 30s run-cmd clamp on slow
    // uplinks (B-ee6d, review finding) — the device path streams it via
    // runStream (unbounded); ssh keeps the plain _run (no daemon clamp there).
    let out = '';
    const h = this.hosts.get(hostId);
    if (h.transport === 'dial' || this.hosts.dataPlaneOn?.()) {
      try {
        const dm = await this.hosts.device(hostId);
        const chunks = [];
        const r = await dm.runStream('sh', ['-c', script], { onData: (b) => chunks.push(b) });
        out = Buffer.concat(chunks).toString('utf8');
        if (r.code !== 0 && !out.includes('OK')) throw new Error('exit ' + r.code + ': ' + out.slice(-200));
      } catch (e) {
        if (h.transport === 'dial') throw new Error('rclone install on the device failed: ' + String(e.message || e).slice(0, 200));
        out = ''; // ssh fallback below
      }
    }
    if (!out.includes('OK')) {
      const fetch = await this._run(hostId, 'sh', ['-c', script]);
      out = (fetch.stdout || '') + (fetch.stderr || '');
    }
    if (!out.includes('OK')) throw new Error('rclone install on host failed: ' + out.slice(0, 200));
    return remoteBin;
  }

  /** Mount THIS VibeSpace's <folder> on the machine as <mountpoint>. */
  // Overall deadline for a mount operation (2.214.1, walter's HTTP 502): the
  // chain crosses the device link many times — an await that stalls in an
  // unforeseen way (half-open dial stream, wedged daemon) used to hang the
  // HTTP handler FOREVER, so the proxy answered 502 and the server logged
  // NOTHING (the forensic blindness that motivated this). Race a hard cap so
  // the dialog always gets a real, actionable error.
  _withDeadline(p, ms, label) {
    return Promise.race([p, new Promise((_, rej) => {
      const t = setTimeout(() => rej(new Error(`${label} timed out after ${Math.round(ms / 1000)}s — the device link may be stalled (machine asleep/offline?); wake the machine and retry`)), ms);
      t.unref?.();
    })]);
  }

  async mountPush(hostId, opts = {}) {
    console.log(`[machine-mounts] push mount request → ${hostId} folder=${opts.folder || '~'} mode=${opts.mode || 'ro'}`);
    const t0 = Date.now();
    try {
      const r = await this._withDeadline(this._mountPushInner(hostId, opts), 150000, 'push mount');
      console.log(`[machine-mounts] push mount OK in ${Date.now() - t0}ms → ${r.mountpoint} (${r.method}, ${r.via})`);
      return r;
    } catch (e) {
      console.warn(`[machine-mounts] push mount FAILED after ${Date.now() - t0}ms: ${e.message}`);
      global.__vsEvent?.('machine-mount-push-failed', { detail: String(e.message).slice(0, 160) });
      throw e;
    }
  }

  async _mountPushInner(hostId, { folder, mode = 'ro', mountpoint, publicUrlFallback } = {}) {
    // expand ~ BEFORE resolving — a literal '~' resolved against cwd made the
    // token mint fail with a bare 'root does not exist' (real report)
    const expanded = String(folder || os.homedir()).replace(/^~(?=$|\/)/, os.homedir());
    const abs = path.resolve(expanded);
    // LOOP GUARD (2.215.1, walter's real attempt): pushing a folder that IS a
    // pull-mount mirror routes every IO through the device chain TWICE
    // (machine → tunnel → /dav → instance FUSE → tunnel → machine) — rclone's
    // daemon never comes up ("Daemon timed out"). Refuse with the real story.
    const pull = this._state.mounts.find((m) => m.dir === 'pull' && m.mountpoint && (abs === m.mountpoint || abs.startsWith(m.mountpoint + '/')));
    if (pull) {
      const mName = (() => { try { return this.hosts.get(pull.hostId)?.name || pull.hostId; } catch { return pull.hostId; } })();
      throw new Error(pull.hostId === hostId
        ? `this folder is the live mirror of ${mName}'s own ${pull.remotePath} — it already lives on that machine; open it there directly instead of mounting it back`
        : `this folder is the live mirror of ${mName}'s ${pull.remotePath} — sharing a mounted mirror loops through two mount chains; share a real folder on this instance instead`);
    }
    // Existence/health probe via a CHILD process — NEVER node fs on a
    // possibly-FUSE-backed path (2.108.3 class; real incident: the old
    // fs.existsSync here BLOCKED THE EVENT LOOP on a wedged storage mount —
    // the whole server froze and the proxy answered 502 with zero logs).
    const shqL = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
    const probe = await new Promise((resolve) => {
      execFile('sh', ['-c', `[ -e ${shqL(abs)} ] || exit 3; ls ${shqL(abs)} >/dev/null 2>&1 || exit 4`], { timeout: 6000 }, (err) => {
        if (!err) return resolve('ok');
        if (err.killed || err.signal) return resolve('hung');
        resolve(err.code === 3 ? 'missing' : err.code === 4 ? 'unreadable' : 'hung');
      });
    });
    if (probe === 'missing') throw new Error(`folder does not exist on this instance: ${abs}`);
    if (probe !== 'ok') throw new Error(probe === 'hung'
      ? `folder is not responding (its backing mount/storage may be stalled): ${abs} — reconnect that storage first, or share a plain local folder`
      : `folder is not readable: ${abs}`);
    const { base, tunnelPort } = await this._davBase(hostId, { publicUrlFallback });
    console.log(`[machine-mounts] push: dav base ready (${tunnelPort ? 'tunnel:' + tunnelPort : 'public'})`);
    const share = this.mountTokens.mint({ name: 'host:' + hostId, kind: 'reverse-mount', owner: hostId, root: abs, mode: mode === 'rw' ? 'rw' : 'ro' });
    const shareToken = share.raw, shareTokenId = share.rec.id;
    try {
    const davUrl = base + '/dav';
    const osKind = await this.detectOS(hostId);
    const home = await this._remoteHome(hostId);
    const mp = mountpoint || `${home}/vibespace-remote/${path.basename(abs) || 'root'}`;
    const id = 'mm-' + require('crypto').randomBytes(4).toString('hex');
    let method;

    if (osKind === 'windows') {
      // native WebClient redirector — no FUSE. drive letter or UNC-style path.
      const r = await this._run(hostId, 'cmd', ['/c', `net use * ${davUrl.replace(/^https?:/, m => m)} /user:vibespace ${shareToken} /persistent:no`]);
      if (r.code !== 0) throw new Error('net use failed: ' + (r.stderr || r.stdout).slice(0, 200));
      method = 'net-use';
    } else {
      // macFUSE must be probed ON the Mac — the old check read the SERVER's
      // /dev/fuse (always present on Linux pods), so a macFUSE-less Mac was
      // sent down the rclone path and the mount died (real report: push to
      // "Mac" → 'rclone mount failed:' with an empty error). rclone mount
      // needs a FUSE layer on macOS; without macFUSE, native mount_webdav is
      // the only option.
      let useNativeMac = false;
      if (osKind === 'macos') {
        const fuse = await this._run(hostId, 'sh', ['-c', 'if [ -d /Library/Filesystems/macfuse.fs ] || [ -d /Library/Filesystems/osxfuse.fs ]; then echo yes; else echo no; fi']);
        useNativeMac = !(fuse.stdout || '').includes('yes');
      }
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
        // multiplexed ssh (transport hygiene, caught by the reverse-mount e2e).
        // setsid is LINUX-ONLY (macOS has none — the installer hit the same
        // trap, 2.152.1): prefix it only where it exists; rclone --daemon
        // self-detaches either way.
        const logf = `${home}/.vibespace/host-mount-${id}.log`;
        // Finder shows the VOLUME name, which defaults to an opaque
        // 'vsdav{hash}' (real report: 名字不太对) — name it after the folder.
        const volname = osKind === 'macos' ? `--volname 'VibeSpace ${path.basename(abs).replace(/[^\w .-]/g, '')}'` : '';
        const cmd = `${env} $(command -v setsid >/dev/null 2>&1 && echo setsid) "${rclone}" mount vsdav: '${mp}' --daemon ${volname} --vfs-cache-mode ${mode === 'rw' ? 'writes' : 'off'} ${roFlag} --dir-cache-time 10s --timeout 30s --contimeout 10s </dev/null >/dev/null 2>>'${logf}'`;
        const r = await this._run(hostId, 'sh', ['-c', cmd]);
        if (r.code !== 0) {
          // stderr went to the remote log (the fd redirect above) — pull its
          // tail so the dialog shows the REAL reason, not an empty message
          const tail = await this._run(hostId, 'sh', ['-c', `tail -c 400 '${logf}' 2>/dev/null`]).catch(() => ({ stdout: '' }));
          const detail = ((r.stderr || r.stdout || '').trim() || (tail.stdout || '').trim() || `no output — see ${logf} on the machine`);
          throw new Error('rclone mount failed: ' + detail.slice(0, 300));
        }
        method = 'rclone-webdav';
      }
    }
    const rec = { id, dir: 'push', hostId, folder: abs, mountpoint: mp, mode, os: osKind, method, tokenId: shareTokenId, tunnelPort, mountedAt: Date.now() };
    if (tunnelPort) this._pushTunnelOwned.add(id);
    this._state.mounts.push(rec);
    this._save(); this._notify();
    return { id, mountpoint: mp, os: osKind, method, via: tunnelPort ? 'tunnel' : 'public' };
    } catch (e) {
      // a FAILED push must not leak its freshly-minted credential — every
      // failed attempt used to leave an indistinguishable orphan token row
      // (real report: 6 stacked duplicates after the Mac's bad day)
      try { this.mountTokens.revoke?.(shareTokenId); } catch { }
      throw e;
    }
  }

  async _unmountPush(rec) {
    // best-effort on the machine (it may be offline) — the token is revoked
    // and the record dropped REGARDLESS, so a dead machine can't hold a live
    // credential hostage
    try {
      if (rec.method === 'rclone-webdav' || rec.method === 'mount_webdav') {
        await this._run(rec.hostId, 'sh', ['-c', `fusermount -u '${rec.mountpoint}' 2>/dev/null || umount '${rec.mountpoint}' 2>/dev/null || true`]);
      } else if (rec.method === 'net-use') {
        await this._run(rec.hostId, 'cmd', ['/c', `net use ${rec.mountpoint} /delete /y`]);
      }
    } catch { }
    try { this.mountTokens.revoke?.(rec.tokenId); } catch { }
    if (rec.tunnelPort) { // release the device-side listener (best-effort)
      try { const dm = await this.hosts.device(rec.hostId); await dm.reverseUnforward(rec.tunnelPort); } catch { }
    }
  }

  // ═══ PULL direction (the machine's folder → this workspace) ═══

  async mountPull(hostId, opts = {}) {
    console.log(`[machine-mounts] pull mount request → ${hostId} path=${opts.remotePath || '~'}`);
    const t0 = Date.now();
    try {
      const r = await this._withDeadline(this._mountPullInner(hostId, opts), 150000, 'pull mount');
      console.log(`[machine-mounts] pull mount OK in ${Date.now() - t0}ms → ${r.mountpoint}`);
      return r;
    } catch (e) {
      console.warn(`[machine-mounts] pull mount FAILED after ${Date.now() - t0}ms: ${e.message}`);
      global.__vsEvent?.('machine-mount-pull-failed', { detail: String(e.message).slice(0, 160) });
      throw e;
    }
  }

  async _mountPullInner(hostId, { remotePath, mountpoint } = {}) {
    const h = this.hosts.get(hostId); // throws for unknown machine
    // '~' paths are what the dialog's own autocomplete suggests — expand them
    // against the MACHINE's home (review finding: suggest-then-reject)
    let rp = String(remotePath || '');
    if (rp === '~' || rp.startsWith('~/')) {
      const dm = await this.hosts.device(hostId);
      const home = String((await dm.runCmd('sh', ['-c', 'echo "$HOME"'], { timeoutMs: 8000 })).stdout || '').trim();
      if (!home.startsWith('/')) throw new Error('could not resolve ~ on the machine — use an absolute path');
      rp = home + rp.slice(1);
      remotePath = rp;
    }
    if (!remotePath || !String(remotePath).startsWith('/')) throw new Error('remotePath must be absolute (a folder ON the machine)');
    // Strip a trailing slash (real walter bug): the daemon's serve-folder
    // confines requests with `root + path.sep`, so a root ending in '/' makes
    // the prefix a DOUBLE slash that no real subpath matches → every file 403s
    // ("couldn't list files: 403"). mountPush avoids this via path.resolve;
    // do the same here so the served + stored path is clean.
    remotePath = String(remotePath).replace(/\/+$/, '') || '/';
    const slug = String(h.name || hostId).replace(/[^\w-]/g, '-').slice(0, 40);
    const mp = mountpoint || path.join(os.homedir(), 'vibespace-machines', `${slug}-${path.basename(remotePath) || 'root'}`);
    let rec = this._state.mounts.find((m) => m.dir === 'pull' && m.hostId === hostId && m.remotePath === remotePath && m.mountpoint === mp);
    if (!rec) {
      rec = { id: 'mm-' + require('crypto').randomBytes(4).toString('hex'), dir: 'pull', hostId, remotePath, mountpoint: mp, createdAt: Date.now() };
      this._state.mounts.push(rec);
      this._save();
    }
    await this._up(rec);
    this._notify();
    return { ...rec, live: this._live.has(rec.id) };
  }

  async _up(rec) {
    if (this._live.has(rec.id) || this._mounting.has(rec.id)) return;
    this._mounting.add(rec.id);
    try {
      const device = await this.hosts.device(rec.hostId); // ssh: daemon over --stdio; dial: the dialed-in link
      // normalize a stored trailing slash so an EXISTING record (minted before
      // the mountPull fix) works without a daemon update (the serve-folder
      // confinement double-slash 403 — walter's real bug)
      const remotePath = String(rec.remotePath || '').replace(/\/+$/, '') || '/';
      const h = await deviceFolderMount({
        device, remotePath, mountpoint: rec.mountpoint,
        rcloneBin: this.rcloneBin(), log: this.log,
      });
      this._live.set(rec.id, { teardown: h.teardown, mountpoint: rec.mountpoint });
      this.log(`pull mount up: ${rec.hostId}:${rec.remotePath} → ${rec.mountpoint}`);
    } finally { this._mounting.delete(rec.id); }
  }

  /** Manual remount (the pull row's ↻ — e.g. after a failed heal). */
  async remount(id) {
    const rec = this._state.mounts.find((m) => m.id === id);
    if (!rec) throw new Error('unknown machine mount');
    if (!this._online(rec.hostId)) throw new Error('machine is offline — start its daemon first');
    if (rec.dir === 'push') {
      // a push mount manually umounted ON the machine (or torn by a reboot):
      // the raw token is unrecoverable (hashed at rest), so re-creating with
      // the SAME params is the remount — old record/token dropped first
      const { hostId, folder, mode, mountpoint } = rec;
      try { await this.unmount(id); } catch { }
      this._pushDown?.delete(id);
      return this.mountPush(hostId, { folder, mode, mountpoint });
    }
    const live = this._live.get(id);
    if (live) { try { await live.teardown(); } catch { } this._live.delete(id); }
    await this._up(rec);
    this._notify();
    return { ...rec, live: this._live.has(id) };
  }

  // ═══ shared lifecycle ═══

  async unmount(id) {
    const i = this._state.mounts.findIndex((m) => m.id === id);
    if (i < 0) throw new Error('unknown machine mount');
    const rec = this._state.mounts[i];
    if (rec.dir === 'pull') {
      const live = this._live.get(id);
      if (live) { try { await live.teardown(); } catch { } this._live.delete(id); }
    } else {
      await this._unmountPush(rec);
      this._pushTunnelOwned.delete(id);
      this._pushRetryAt.delete(id);
      this._pushDown?.delete(id);
    }
    this._state.mounts.splice(i, 1);
    this._save(); this._notify();
    return { ok: true };
  }

  /** A machine (re)linked — dial-in, or its daemon re-exec'd. Heal pulls
   *  (stale chain teardown first: a re-dial means the daemon RE-EXECED, so
   *  its serve-folder DIED and the live rclone points at a dead port — real
   *  Mac report) and re-own push tunnel ports (the fresh daemon has no
   *  listeners; the machine-side rclone still points at the recorded port).
   *  Fire-and-forget. */
  onMachineLinked(hostId) {
    if (!hostId) return;
    for (const rec of this._state.mounts.filter((m) => m.hostId === hostId)) {
      if (rec.dir === 'pull') {
        const stale = this._live.get(rec.id);
        const heal = async () => {
          if (stale) { try { await stale.teardown(); } catch { } this._live.delete(rec.id); }
          await this._up(rec);
        };
        heal().then(() => this._notify())
          .catch((e) => this.log(`pull mount heal failed (${rec.mountpoint}): ${e.message}`));
      } else if (rec.tunnelPort) {
        const lp = this.localPort();
        if (!lp) continue;
        const net = require('net');
        this.hosts.device(hostId)
          .then((dm) => dm.reverseForward({ port: rec.tunnelPort, connectLocal: () => net.connect(lp, '127.0.0.1') }))
          .then(() => { this._pushTunnelOwned.add(rec.id); this._pushRetryAt.delete(rec.id); })
          .catch((e) => {
            // clear ownership + backoff so the health sweep retries promptly —
            // a single failed re-own must not strand the tunnel (review finding)
            this._pushTunnelOwned.delete(rec.id);
            this._pushRetryAt.delete(rec.id);
            this.log(`push tunnel re-own failed (:${rec.tunnelPort}): ${e.message}`);
          });
      }
    }
  }

  /** Orphan-token GC: 'host:*' tokens whose id no PUSH RECORD references are
   *  unmanageable garbage (leaked by pre-2.162.1 failed pushes) — revoke them.
   *  Records are the source of truth; a token without one can't be re-owned,
   *  displayed meaningfully, or torn down through the app. */
  gcOrphanTokens() {
    let n = 0;
    try {
      const referenced = new Set(this._state.mounts.filter((m) => m.dir === 'push').map((m) => m.tokenId));
      for (const t of this.mountTokens.list?.() || []) {
        // structured kind (not a name-prefix hack): only reverse-mount tokens
        // with no backing push record are orphans; user 'share' tokens are
        // never touched
        if (t.kind === 'reverse-mount' && !referenced.has(t.id)) {
          try { this.mountTokens.revoke?.(t.id); n++; } catch { }
        }
      }
      if (n) this.log(`revoked ${n} orphan reverse-mount token(s) (no matching mount record)`);
    } catch { }
    return n;
  }

  /** Boot: heal every recorded mount whose machine is reachable. */
  async restore() {
    this.gcOrphanTokens();
    const byHost = new Set(this._state.mounts.map((m) => m.hostId));
    for (const hostId of byHost) {
      if (this._online(hostId)) { try { this.onMachineLinked(hostId); } catch { } }
    }
  }

  /** The machine is being removed/unpaired — drop its mounts (records + live
   *  chains + tokens). Remote-side unmounts are best-effort. */
  async onMachineUnpaired(hostId) {
    if (!hostId) return;
    for (const rec of [...this._state.mounts.filter((m) => m.hostId === hostId)]) {
      try { await this.unmount(rec.id); } catch { }
    }
  }

  async _healthSweep() {
    const { spawn } = require('child_process');
    // Recorded-but-not-live pulls retry here too (review finding: ssh machines
    // have no dial-in event, so a failed boot heal previously stayed 'Pending'
    // forever). 5min backoff per record so an unreachable machine isn't
    // hammered every sweep.
    this._pullRetryAt = this._pullRetryAt || new Map();
    for (const rec of this._state.mounts.filter((m) => m.dir === 'pull' && !this._live.has(m.id) && !this._mounting.has(m.id))) {
      if (!this._online(rec.hostId)) continue;
      const at = this._pullRetryAt.get(rec.id) || 0;
      if (Date.now() < at) continue;
      this._pullRetryAt.set(rec.id, Date.now() + 5 * 60000);
      this._up(rec).then(() => { this._pullRetryAt.delete(rec.id); this._notify(); }).catch(() => {});
    }
    // PUSH honesty (real report: user umounted on the Mac, the row stayed
    // green "on machine" and offered no way back): while the machine is
    // linked, ask it whether the mountpoint is still in its mount table —
    // a vanished mount flips the row to "not mounted there" + a remount ↻.
    this._pushDown = this._pushDown || new Set();
    for (const rec of this._state.mounts.filter((m) => m.dir === 'push')) {
      if (!this._online(rec.hostId)) continue;
      let dm = null;
      try { dm = await this.hosts.device(rec.hostId); } catch { continue; }
      let mounted = null;
      try {
        // `mount` prints "… on <mountpoint> (type…" (mac) / "… on <mountpoint> type …"
        // (linux) — a fixed-string match on ' on <mp> ' covers both
        const mp = String(rec.mountpoint).replace(/'/g, `'\\''`);
        const r = await dm.runCmd('sh', ['-c', `mount | grep -qF ' on ${mp} '`], { timeoutMs: 8000 });
        mounted = r.code === 0;
      } catch { mounted = null; }
      if (mounted === null) continue; // probe itself failed — no verdict
      const was = this._pushDown.has(rec.id);
      if (!mounted && !was) { this._pushDown.add(rec.id); this.log(`push mount ${rec.mountpoint} is GONE on the machine (umounted there?)`); this._notify(); }
      else if (mounted && was) { this._pushDown.delete(rec.id); this._notify(); }
      // Tunnel liveness (review finding): the mount-table probe above is
      // structurally blind to a dead reverse-forward — the machine-side
      // rclone stays mounted while every IO fails against the unbound
      // 127.0.0.1:tunnelPort. Verify end-to-end from the machine (a request
      // through the tunnel reaches our /dav only when a server owns the
      // listener; a disowned/reaped one refuses or resets) and re-own with
      // the same 5-min backoff the pull branch uses — ssh machines have no
      // dial-in event, so the boot attempt was otherwise the only one.
      if (rec.tunnelPort) {
        if (this._pushTunnelOwned.has(rec.id)) {
          try {
            // no curl on the machine ⇒ exit 0 (no verdict) — never churn re-owns
            const r = await dm.runCmd('sh', ['-c', `command -v curl >/dev/null 2>&1 || exit 0; curl -s -o /dev/null --max-time 5 http://127.0.0.1:${Number(rec.tunnelPort)}/`], { timeoutMs: 10000 });
            if (r.code !== 0) { this._pushTunnelOwned.delete(rec.id); this.log(`push tunnel :${rec.tunnelPort} dead on ${rec.hostId} — will re-own`); }
          } catch { }
        }
        const lp = this.localPort();
        if (!this._pushTunnelOwned.has(rec.id) && lp) {
          const at = this._pushRetryAt.get(rec.id) || 0;
          if (Date.now() >= at) {
            this._pushRetryAt.set(rec.id, Date.now() + 5 * 60000);
            const net = require('net');
            try {
              await dm.reverseForward({ port: rec.tunnelPort, connectLocal: () => net.connect(lp, '127.0.0.1') });
              this._pushTunnelOwned.add(rec.id);
              this._pushRetryAt.delete(rec.id);
              this.log(`push tunnel re-owned (:${rec.tunnelPort}) on ${rec.hostId}`);
            } catch (e) { this.log(`push tunnel re-own failed (:${rec.tunnelPort}): ${e.message}`); }
          }
        }
      }
    }
    for (const [id, h] of [...this._live]) {
      const rec = this._state.mounts.find((m) => m.id === id);
      if (!rec || !this._online(rec.hostId)) continue;
      const responsive = await new Promise((res) => {
        const c = spawn('ls', [h.mountpoint], { stdio: 'ignore' });
        const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch {} res(false); }, 8000);
        c.on('exit', (code) => { clearTimeout(t); res(code === 0); });
        c.on('error', () => { clearTimeout(t); res(false); });
      });
      if (!responsive) {
        this.log(`pull mount ${rec.mountpoint} hung — remounting`);
        try { await h.teardown(); } catch {}
        this._live.delete(id);
        this._up(rec).then(() => this._notify()).catch(() => {});
      }
    }
  }
}

module.exports = { MachineMounts };
