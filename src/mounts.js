/**
 * MountManager — rclone-backed mounts (S3 / Google Drive / WebDAV / SFTP /
 * VibeSpace bridge) + S3 share minting (collaboration P1).
 *
 * - Mount records are TYPED (m.type, default 's3' for legacy records); each
 *   type has its own rclone backend config built in _rcloneFor(). Passwords
 *   that rclone expects obscured are obscured at mount time (never stored
 *   obscured — obscure() is reversible, our AES-GCM is the real protection).
 * - "My storage" lives in VibeSpace config (state.myStorage, secrets
 *   encrypted) — VIBESPACE_S3_* env is imported ONCE when no config exists
 *   (Docker/legacy deployments keep working), after that the config wins.
 *
 * - Mount records live in data/mounts.json; S3 secrets are encrypted at rest
 *   (AES-256-GCM under a server-local key in data/.mounts-key — protects
 *   backups/casual file reads, not root).
 * - rclone mount runs DETACHED (setsid-style) so mounts survive server
 *   restarts (same philosophy as dtach sessions); on boot we adopt live
 *   mounts from /proc/mounts and auto-remount anything desired-but-dead.
 * - Credentials pass to rclone via child ENV (RCLONE_CONFIG_*), never argv —
 *   argv is world-readable in /proc.
 * - Share minting: mc CLI (permanent MinIO service account, revoke = delete)
 *   when available, else STS AssumeRole (temporary, ≤7 days) via plain
 *   SigV4-signed HTTP. Share links embed the derived credential:
 *   vibespace-share:v1:<base64url(json)> — treat links as secrets.
 * - Mount paths: VIBESPACE_MOUNT_BASE (default ~/vibespace-mounts)/<name>,
 *   or a per-mount custom absolute path.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile, execFileSync } = require('child_process');

const SHARE_PREFIX = 'vibespace-share:v1:';
const CEPHMOUNT_PREFIX = 'vibespace-cephmount:v1:';

class MountManager {
  constructor({ dataDir, broadcast, getSetting }) {
    // Gmail-as-a-folder engine (2.134.0) — lazy so plain deployments pay nothing
    const { GmailSync } = require('./gmail-sync');
    this.gmail = new GmailSync({ presets: () => MountManager.drivePresets() });
    this.dataDir = dataDir;
    this.broadcast = broadcast || (() => {});
    this._getSetting = getSetting || (() => undefined);
    this._file = path.join(dataDir, 'mounts.json');
    this._keyFile = path.join(dataDir, '.mounts-key');
    this._logDir = path.join(dataDir, 'mount-logs');
    this.mountBase = process.env.VIBESPACE_MOUNT_BASE || path.join(os.homedir(), 'vibespace-mounts');
    this._state = { mounts: [], shares: [] };
    this._errors = new Map(); // id -> last mount error line
    this._load();
    this._maybeImportEnvStorage();
  }

  // One-time migration: VIBESPACE_S3_* env → persisted config. Runs only when
  // no myStorage config exists yet; afterwards the in-app config is canonical
  // (edit/remove in the UI, included in export/import).
  _maybeImportEnvStorage() {
    // CephFS takes precedence over S3 when both are provisioned (the all-flash
    // storage REPLACES the slow RGW S3 — user directive). Handled first so a
    // deployment that switched from VIBESPACE_S3_* to VIBESPACE_CEPHFS_* imports
    // the new backing and (if it deleted the S3 mount) doesn't re-import S3.
    this._maybeImportEnvCephfs();
    // One-time migration of VIBESPACE_S3_* → a normal S3 mount (auto-mounted).
    // Storage is now ONE flat list of connections — no special "My storage"
    // slot. Legacy state.myStorage (from earlier builds) also migrates here.
    const e = process.env;
    const legacy = this._state.myStorage; // earlier-build config
    const src = legacy
      ? { endpoint: legacy.endpoint, bucket: legacy.bucket, prefix: legacy.prefix || '', accessKey: legacy.accessKey, secretKey: this._dec(legacy.secretKeyEnc) }
      : (e.VIBESPACE_S3_ENDPOINT && e.VIBESPACE_S3_BUCKET && e.VIBESPACE_S3_ACCESS_KEY)
        ? { endpoint: e.VIBESPACE_S3_ENDPOINT, bucket: e.VIBESPACE_S3_BUCKET, prefix: e.VIBESPACE_S3_PREFIX || '', accessKey: e.VIBESPACE_S3_ACCESS_KEY, secretKey: e.VIBESPACE_S3_SECRET_KEY || '' }
        : null;
    // Import by SIGNATURE, not a one-shot flag (2.106.3): the old boolean
    // burned on the very FIRST boot even with no env set, so a managed
    // instance that gained VIBESPACE_S3_* later (helm upgrade) never imported.
    // Now: import whenever the env's endpoint|bucket|prefix differs from the
    // last import — a user-deleted mount stays deleted (same signature), a
    // changed provisioning re-imports.
    const sig = src ? (src.endpoint + '|' + src.bucket + '|' + (src.prefix || '')) : '';
    const already = this._state._envImportedSig !== undefined
      ? this._state._envImportedSig
      : (this._state._envImported ? sig : undefined); // legacy flag: treat current env as imported ONLY if it predates the signature scheme AND a my-storage mount exists
    this._state._envImported = true; // kept for downgrade compat
    const hasMyStorage = this._state.mounts.some(m => m.origin === 'my-storage');
    if (!src || (already === sig && (hasMyStorage || this._state._envImportedSig !== undefined))) {
      this._state._envImportedSig = already !== undefined ? already : '';
      this._save(); return;
    }
    this._state._envImportedSig = sig;
    if (!hasMyStorage) {
      try {
        const id = this.add({ type: 's3', origin: 'my-storage', name: 'My storage', mode: 'rw', ...src });
        const m = this._state.mounts.find(x => x.id === id);
        if (m) m.desired = 'mounted'; // restore() connects it on boot
      } catch {}
    }
    delete this._state.myStorage;
    this._save();
  }

  // Env-provisioned all-flash CephFS as "My storage" (deployment-managed).
  // Signature-gated like the S3 import: a helm change re-imports, a user
  // delete stays deleted (same sig). Precedence: if a cephfs my-storage
  // exists, the S3 import below no-ops (hasMyStorage true).
  _maybeImportEnvCephfs() {
    const e = process.env;
    if (!e.VIBESPACE_CEPHFS_MONS || !e.VIBESPACE_CEPHFS_SECRET) return;
    const path0 = e.VIBESPACE_CEPHFS_PATH || '/';
    const sig = 'cephfs|' + e.VIBESPACE_CEPHFS_MONS + '|' + path0;
    // Self-heal on EVERY boot: an env-provisioned CephFS "My storage" must
    // always want to be mounted (the user can't un-provision it — only
    // unmount transiently). This also covers the one-shot where a prior boot
    // (e.g. running the pre-cephfs code, or an import race) left it unmounted.
    const cephMs = this._state.mounts.find(m => m.origin === 'my-storage' && m.type === 'cephfs');
    if (cephMs && cephMs.desired !== 'mounted') { cephMs.desired = 'mounted'; this._save(); }
    if (this._state._cephImportedSig === sig) return;
    const hadMyStorage = this._state.mounts.some(m => m.origin === 'my-storage');
    // A prior S3 my-storage is REPLACED by cephfs (user directive) — unmount
    // + drop it so the flash mount takes the "My storage" slot.
    if (!hadMyStorage || !this._state.mounts.some(m => m.origin === 'my-storage' && m.type === 'cephfs')) {
      for (const old of this._state.mounts.filter(m => m.origin === 'my-storage' && m.type !== 'cephfs')) {
        try { this.unmount(old.id); } catch {}
        this._state.mounts = this._state.mounts.filter(x => x.id !== old.id);
      }
      try {
        const id = this.add({
          type: 'cephfs', origin: 'my-storage', name: 'My storage', mode: 'rw',
          cephMonHosts: e.VIBESPACE_CEPHFS_MONS,
          cephFsName: e.VIBESPACE_CEPHFS_NAME || 'cephfs',
          cephPath: path0,
          cephUser: e.VIBESPACE_CEPHFS_USER || 'admin',
          cephSecret: e.VIBESPACE_CEPHFS_SECRET,
        });
        const m = this._state.mounts.find(x => x.id === id);
        if (m) m.desired = 'mounted'; // restore() connects it on boot
      } catch {}
    }
    this._state._cephImportedSig = sig;
    // Mark S3 as "already imported" to this sig so the S3 path won't re-add it.
    this._save();
  }

  // ── My storage config (in-app, canonical) ──

  getMyStorageConfig({ redact = true } = {}) {
    const c = this._state.myStorage;
    if (!c) return null;
    return {
      endpoint: c.endpoint, bucket: c.bucket, prefix: c.prefix || '',
      accessKey: c.accessKey,
      secretKey: redact ? undefined : this._dec(c.secretKeyEnc),
      importedFromEnv: !!c.importedFromEnv,
      configured: this._state.mounts.some(m => m.origin === 'my-storage'),
    };
  }

  setMyStorageConfig({ endpoint, bucket, prefix, accessKey, secretKey }) {
    if (!endpoint || !bucket || !accessKey) throw new Error('endpoint, bucket and accessKey required');
    const prev = this._state.myStorage;
    // secretKey omitted on edit = keep the existing one
    const enc = secretKey ? this._enc(secretKey) : prev?.secretKeyEnc;
    if (!enc) throw new Error('secretKey required');
    this._state.myStorage = {
      endpoint: String(endpoint), bucket: String(bucket),
      prefix: String(prefix || '').replace(/^\/+|\/+$/g, ''),
      accessKey: String(accessKey), secretKeyEnc: enc,
      importedFromEnv: false, updatedAt: Date.now(),
    };
    this._save();
    this._notify();
  }

  clearMyStorageConfig() {
    delete this._state.myStorage;
    this._save();
    this._notify();
  }

  // ── Import an rclone config file (rclone.conf) ──
  // Users who already configured remotes elsewhere (`rclone config`) can paste
  // the whole file. It's INI: [remote-name] then key = value lines. We turn
  // each [section] into a preview the UI lists; the user picks which to import
  // and each becomes a custom 'rclone' mount (all values encrypted at rest).
  static parseRcloneConf(text) {
    const remotes = [];
    let cur = null;
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;
      const sec = line.match(/^\[([^\]]+)\]$/);
      if (sec) { cur = { name: sec[1].trim(), type: '', params: {} }; remotes.push(cur); continue; }
      if (!cur) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k === 'type') cur.type = v;
      else if (k) cur.params[k] = v;
    }
    // Flag wrapping backends (crypt/alias/combine/union/chunker) — they
    // reference ANOTHER remote (a `remote =`/`upstreams =` value), which our
    // single-remote env model can't resolve. The UI greys these out.
    const WRAPPERS = new Set(['crypt', 'alias', 'combine', 'union', 'chunker']);
    return remotes.filter(r => r.type).map(r => ({
      ...r,
      wraps: WRAPPERS.has(r.type) || !!r.params.remote || !!r.params.upstreams,
    }));
  }

  /** Add a mount from one parsed rclone.conf remote (custom 'rclone' type). */
  addFromRcloneRemote(remote, { mode = 'rw', name } = {}) {
    return this.add({
      type: 'rclone', origin: 'rclone-conf',
      name: name || remote.name,
      rcloneType: remote.type,
      params: remote.params || {},
      mode,
    });
  }

  // ── rclone binary resolution + one-click install ──
  // Non-engineers shouldn't need a terminal: if rclone isn't on PATH we can
  // download the official static binary into data/bin (pinned to a version
  // we've verified end-to-end — also predates the aws-sdk-go-v2 signing
  // behavior that breaks V4 auth through Cloudflare-fronted MinIO).
  static RCLONE_PIN = 'v1.65.2';

  rcloneBin() {
    const local = path.join(this.dataDir, 'bin', 'rclone');
    if (fs.existsSync(local)) return this._fastBin(local);
    return 'rclone'; // PATH
  }

  // EXEC from a network/FUSE filesystem demand-pages the whole binary through
  // the mount on EVERY run — the 57MB pinned rclone measured ~22s wall per
  // invocation on an NFS-hosted workspace (419 major faults; page cache does
  // not persist through FUSE) vs 0.06s from local disk. Copy the binary ONCE
  // to a machine-local cache keyed by (size, mtime) and exec that instead.
  _fastBin(binPath) {
    if (this._fastBinMemo?.src === binPath) return this._fastBinMemo.use;
    try {
      if (process.platform !== 'linux' || !this._onNetworkFs(binPath)) {
        this._fastBinMemo = { src: binPath, use: binPath };
        return binPath;
      }
      const st = fs.statSync(binPath);
      const cacheDir = path.join(os.homedir(), '.cache', 'vibespace');
      const cached = path.join(cacheDir, `rclone-${st.size}-${Math.floor(st.mtimeMs)}`);
      if (fs.existsSync(cached)) {
        this._fastBinMemo = { src: binPath, use: cached }; // memoize the settled state only
        return cached;
      }
      // Copy in a CHILD process — 57MB over slow network storage is seconds
      // to tens of seconds and a sync copy would stall the whole event loop.
      // This call still returns the network path (one slow exec); the next
      // resolution finds the cache.
      if (!this._fastBinCopying) {
        this._fastBinCopying = true;
        fs.mkdirSync(cacheDir, { recursive: true });
        const tmp = `${cached}.tmp-${process.pid}`;
        execFile('sh', ['-c', `cp "${binPath}" "${tmp}" && chmod 755 "${tmp}" && mv "${tmp}" "${cached}"`], { timeout: 180000 }, (err) => {
          this._fastBinCopying = false;
          if (!err) {
            try {
              for (const f of fs.readdirSync(cacheDir)) { // prune superseded copies
                if (f.startsWith('rclone-') && f !== path.basename(cached)) fs.unlinkSync(path.join(cacheDir, f));
              }
            } catch {}
          }
        });
      }
      return binPath;
    } catch {
      this._fastBinMemo = { src: binPath, use: binPath };
      return binPath;
    }
  }

  /** True when the path lives on a network-ish filesystem (fuse/nfs/cifs/…). */
  _onNetworkFs(p) {
    try {
      const rp = fs.realpathSync(p);
      let best = null, bestLen = -1;
      for (const line of fs.readFileSync('/proc/mounts', 'utf-8').split('\n')) {
        const [, mp, fstype] = line.split(' ');
        if (!mp) continue;
        if ((rp === mp || rp.startsWith(mp.endsWith('/') ? mp : mp + '/')) && mp.length > bestLen) {
          best = fstype; bestLen = mp.length;
        }
      }
      return !!best && /^(fuse|nfs|cifs|smb|sshfs|9p|ceph|afs)/.test(best);
    } catch { return false; }
  }

  rcloneAvailable() {
    try { execFileSync(this.rcloneBin(), ['version'], { timeout: 5000, stdio: 'pipe' }); return true; }
    catch { return false; }
  }

  async installRclone() {
    const arch = { x64: 'amd64', arm64: 'arm64', arm: 'arm-v7' }[process.arch] || 'amd64';
    const osName = process.platform === 'darwin' ? 'osx' : 'linux';
    const ver = MountManager.RCLONE_PIN;
    const url = `https://downloads.rclone.org/${ver}/rclone-${ver}-${osName}-${arch}.zip`;
    const binDir = path.join(this.dataDir, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const zipPath = path.join(binDir, 'rclone-dl.zip');
    await new Promise((resolve, reject) => {
      execFile('curl', ['-fsSL', '-o', zipPath, url], { timeout: 120000 }, (err, _o, stderr) =>
        err ? reject(new Error('download failed: ' + (stderr || err.message).slice(0, 200))) : resolve());
    });
    await new Promise((resolve, reject) => {
      execFile('unzip', ['-oj', zipPath, `rclone-${ver}-${osName}-${arch}/rclone`, '-d', binDir], { timeout: 30000 }, (err, _o, stderr) =>
        err ? reject(new Error('unzip failed: ' + (stderr || err.message).slice(0, 200))) : resolve());
    });
    fs.chmodSync(path.join(binDir, 'rclone'), 0o755);
    try { fs.unlinkSync(zipPath); } catch {}
    this._rcloneAEFlag = undefined; // re-probe flags with the new binary
    this._rcloneFlagsHelp = undefined;
    this._fastBinMemo = undefined;
    if (!this.rcloneAvailable()) throw new Error('installed binary failed to run');
    return { version: ver, path: path.join(binDir, 'rclone') };
  }

  _key() {
    try { return Buffer.from(fs.readFileSync(this._keyFile, 'utf-8').trim(), 'hex'); }
    catch {
      const k = crypto.randomBytes(32);
      fs.writeFileSync(this._keyFile, k.toString('hex'), { mode: 0o600 });
      return k;
    }
  }

  _enc(text) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this._key(), iv);
    const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${data.toString('base64')}`;
  }

  _dec(blob) {
    const [iv, tag, data] = String(blob).split('.').map(s => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', this._key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  }

  _load() {
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); } catch { /* fresh */ }
    if (!Array.isArray(this._state.mounts)) this._state.mounts = [];
    if (!Array.isArray(this._state.shares)) this._state.shares = [];
  }

  _save() {
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this._file);
  }

  _notify() { this.broadcast({ type: 'mounts-updated', mounts: this.list() }); }

  // ── Config transfer ──
  // Secrets are stored encrypted under an INSTANCE-local key (data/.mounts-key),
  // so a raw mounts.json is useless elsewhere. Export decrypts to plaintext
  // (the caller re-encrypts under the user's export passphrase); import re-adds
  // each mount so it's re-encrypted under the new instance's key.
  exportBundle() {
    const mounts = this._state.mounts.map(m => ({
      name: m.name, type: m.type || 's3', origin: m.origin, mode: m.mode,
      kind: m.kind || undefined,
      parentName: m.parentId ? (this._state.mounts.find(x => x.id === m.parentId)?.name || undefined) : undefined,
      sshPath: m.sshPath,
      customPath: m.customPath, expiresAt: m.expiresAt,
      // s3
      endpoint: m.endpoint, bucket: m.bucket, prefix: m.prefix,
      accessKey: m.accessKey,
      secretKey: m.secretKeyEnc ? this._dec(m.secretKeyEnc) : undefined,
      sessionToken: m.sessionTokenEnc ? this._dec(m.sessionTokenEnc) : undefined,
      // drive
      token: m.tokenEnc ? this._dec(m.tokenEnc) : undefined,
      driveFolder: m.driveFolder, clientId: m.clientId,
      driveMode: m.driveMode, teamDriveId: m.teamDriveId, rootFolderId: m.rootFolderId, clientPreset: m.clientPreset,
      syncCount: m.syncCount, labelIds: m.labelIds, query: m.query, email: m.email,
      clientSecret: m.clientSecretEnc ? this._dec(m.clientSecretEnc) : undefined,
      // webdav / vibespace
      url: m.url, vendor: m.vendor, user: m.user,
      pass: m.passEnc ? this._dec(m.passEnc) : undefined,
      bearerToken: m.bearerTokenEnc ? this._dec(m.bearerTokenEnc) : undefined,
      // sftp
      sshHost: m.sshHost, sshUser: m.sshUser, sshPort: m.sshPort, sshPath: m.sshPath, keyPath: m.keyPath,
      // custom rclone
      rcloneType: m.rcloneType, remotePath: m.remotePath,
      params: m.paramsEnc ? Object.fromEntries(Object.entries(m.paramsEnc).map(([k, v]) => [k, this._dec(v)])) : undefined,
      extraParams: m.extraParamsEnc ? Object.fromEntries(Object.entries(m.extraParamsEnc).map(([k, v]) => [k, this._dec(v)])) : undefined,
    }));
    const myStorage = this.getMyStorageConfig({ redact: false }) || undefined;
    return { mounts, shares: this._state.shares, myStorage };
  }

  importBundle(bundle) {
    if (!bundle) return;
    if (bundle.myStorage && !this._state.myStorage) {
      try { this.setMyStorageConfig(bundle.myStorage); } catch {}
    }
    if (!Array.isArray(bundle.mounts)) return;
    // pass 1: credentials + standalone mounts (children need their parent first)
    for (const m of bundle.mounts) {
      if (m.parentName) continue;
      if (this._state.mounts.some(x => x.name === m.name)) continue; // skip dupes
      try {
        const nid = this.add(m);
        if (m.kind === 'credential') this._get(nid).kind = 'credential';
      } catch {}
    }
    // pass 2: mount points under credentials, re-linked by parent NAME
    for (const m of bundle.mounts) {
      if (!m.parentName) continue;
      if (this._state.mounts.some(x => x.name === m.name)) continue;
      const parent = this._state.mounts.find(x => x.name === m.parentName && this._kindOf(x) === 'credential');
      if (!parent) continue;
      try { this.addChild(parent.id, m); } catch {}
    }
    if (Array.isArray(bundle.shares)) {
      for (const s of bundle.shares) if (!this._state.shares.some(x => x.id === s.id)) this._state.shares.push(s);
      this._save();
    }
    this._notify();
  }

  // ── Introspection ──

  _liveMounts() {
    try { return fs.readFileSync('/proc/mounts', 'utf-8'); } catch { return ''; }
  }

  isMounted(m) {
    // gmail "mounts" are sync workers, not filesystems
    if (m.type === 'gmail') return !!this.gmail.status(m.id);
    // /proc/mounts escapes spaces as \040
    const p = this.pathOf(m).replace(/ /g, '\\040');
    // cephfs = native KERNEL mount (fstype 'ceph'), not fuse.rclone
    const fstypeRe = (m.type === 'cephfs') ? /^ceph$/ : /fuse\.rclone/;
    return this._liveMounts().split('\n').some(l => {
      const parts = l.split(' ');
      return parts[1] === p && fstypeRe.test(parts[2] || '');
    });
  }

  pathOf(m) {
    return m.customPath || path.join(this.mountBase, m.name.replace(/[^\w.-]+/g, '_'));
  }

  // ── Credentials (2.108.0) ──
  // A record with kind:'credential' holds ONLY connection settings (typically a
  // bucket-scoped S3/R2 token that can't list the account root — mounting it at
  // root fuse-mounts fine but EIOs on every IO, the FishR2 trap). It is not
  // mountable; MOUNT records reference it via parentId and add their own
  // path (bucket/prefix / remotePath / folder). _connOf() resolves a child to
  // its effective connection: parent's credentials + the child's path fields —
  // so refreshing a token on the credential heals every mount under it.
  _kindOf(m) { return m.kind === 'credential' ? 'credential' : 'mount'; }

  _childrenOf(id) { return this._state.mounts.filter(x => x.parentId === id); }

  _connOf(m) {
    if (!m.parentId) return m;
    const p = this._get(m.parentId);
    const conn = { ...p, id: m.id, name: m.name, mode: m.mode, kind: undefined, parentId: undefined, customPath: m.customPath, origin: m.origin };
    // child's own path fields override the parent's (that's the whole point)
    for (const k of ['remotePath', 'bucket', 'prefix', 'driveFolder', 'driveMode', 'teamDriveId', 'rootFolderId', 'sshPath']) {
      if (m[k] !== undefined && m[k] !== null) conn[k] = m[k];
    }
    if (m.extraParamsEnc) conn.extraParamsEnc = { ...p.extraParamsEnc, ...m.extraParamsEnc };
    return conn;
  }

  _sourceLabel(m) {
    m = this._connOf(m);
    switch (m.type || 's3') {
      case 'drive': {
        const scope = m.driveMode === 'shared-with-me' ? ' (shared with me)' : m.driveMode === 'shared-drive' ? ' (shared drive)' : '';
        return 'Google Drive' + scope + (m.driveFolder ? `: ${m.driveFolder}` : '');
      }
      case 'webdav': return m.url;
      case 'vibespace': return m.url;
      case 'sftp': return `${m.sshUser}@${m.sshHost}:${m.sshPath || '~'}`;
      case 'rclone': return `${m.rcloneType}:${m.remotePath || ''}`;
      case 'cephfs': return `CephFS ${m.cephPath || '/'} @ ${(m.cephMonHosts || '').split(',')[0] || '?'}`;
      case 'gmail': return 'Gmail' + (m.email ? `: ${m.email}` : '') + (m.query ? ` (${m.query})` : '');
      default: return `${m.bucket}${m.prefix ? '/' + m.prefix : ''} @ ${m.endpoint}`;
    }
  }

  list() {
    return this._state.mounts.map(m => {
      const conn = this._connOf(m);
      return {
        id: m.id, name: m.name, type: conn.type || 's3', origin: m.origin, mode: m.mode,
        kind: this._kindOf(m), parentId: m.parentId || null,
        childCount: m.parentId ? undefined : this._childrenOf(m.id).length,
        endpoint: conn.endpoint, bucket: conn.bucket, prefix: conn.prefix,
        rcloneType: conn.rcloneType, remotePath: conn.remotePath, driveFolder: conn.driveFolder,
        driveMode: conn.driveMode || (conn.type === 'drive' ? 'mydrive' : undefined), teamDriveId: conn.teamDriveId, clientPreset: conn.clientPreset,
        ...(m.type === 'gmail' ? (() => { const st = this.gmail.status(m.id); return { email: m.email || st?.email, syncCount: m.syncCount, labelIds: m.labelIds, query: m.query, gmailState: st?.state || null, gmailCount: st?.count ?? null, gmailError: st?.error || null, lastSyncAt: st?.lastSyncAt || null }; })() : {}),
        // secret VALUES never leave the server; keys let the edit dialog offer
        // per-parameter replacement (blank = keep) for custom rclone records
        paramKeys: (conn.type === 'rclone' && !m.parentId) ? Object.keys(conn.paramsEnc || {}) : undefined,
        url: conn.url, user: conn.user, vendor: conn.vendor,
        sshHost: conn.sshHost, sshUser: conn.sshUser, sshPort: conn.sshPort, sshPath: conn.sshPath, keyPath: conn.keyPath,
        clientId: conn.clientId,
        accessKeyTail: conn.accessKey ? String(conn.accessKey).slice(-4) : undefined,
        customPath: m.customPath || null,
        source: this._sourceLabel(m),
        canShare: this.canShareFromMount(m),
        canCephShare: this.canCephShare(m),
        path: this.pathOf(m), desired: m.desired, expiresAt: m.expiresAt || null,
        mounted: this.isMounted(m), error: this._errors.get(m.id) || null,
        createdAt: m.createdAt,
      };
    });
  }

  listShares() { return this._state.shares.map(s => ({ ...s, secretKey: undefined })); }

  /**
   * Full DECRYPTED connection config for the edit dialog (user directive:
   * prefill the REAL current values — tokens and keys included — instead of
   * "blank = keep" placeholders). Served only on the cookie-authed config
   * route; single-user instance model. Env-provisioned records return no
   * secrets (their connection is deployment-owned and not editable anyway).
   */
  config(id) {
    const m = this._get(id);
    const dec = (b) => (b ? this._dec(b) : undefined);
    const base = {
      id: m.id, name: m.name, kind: this._kindOf(m), parentId: m.parentId || null,
      mode: m.mode, customPath: m.customPath || '', origin: m.origin,
    };
    if (m.origin === 'my-storage') return { ...base, type: m.type || 's3', envLocked: true };
    if (m.parentId) {
      const p = this._get(m.parentId);
      return {
        ...base, type: p.type || 's3',
        bucket: m.bucket, prefix: m.prefix, remotePath: m.remotePath,
        driveFolder: m.driveFolder, sshPath: m.sshPath,
      };
    }
    const out = { ...base, type: m.type || 's3' };
    switch (m.type || 's3') {
      case 's3':
        Object.assign(out, { endpoint: m.endpoint, bucket: m.bucket, prefix: m.prefix, accessKey: m.accessKey, secretKey: dec(m.secretKeyEnc), sessionToken: dec(m.sessionTokenEnc) });
        break;
      case 'drive':
        Object.assign(out, { driveFolder: m.driveFolder, token: dec(m.tokenEnc), clientId: m.clientId, clientSecret: dec(m.clientSecretEnc) });
        break;
      case 'webdav': case 'vibespace':
        Object.assign(out, { url: m.url, vendor: m.vendor, user: m.user, pass: dec(m.passEnc), bearerToken: dec(m.bearerTokenEnc) });
        break;
      case 'sftp':
        Object.assign(out, { sshHost: m.sshHost, sshUser: m.sshUser, sshPort: m.sshPort, sshPath: m.sshPath, keyPath: m.keyPath, pass: dec(m.passEnc) });
        break;
      case 'rclone':
        Object.assign(out, { rcloneType: m.rcloneType, remotePath: m.remotePath, params: Object.fromEntries(Object.entries(m.paramsEnc || {}).map(([k, v]) => [k, this._dec(v)])) });
        break;
      case 'cephfs':
        Object.assign(out, { cephMonHosts: m.cephMonHosts, cephFsName: m.cephFsName, cephPath: m.cephPath, cephUser: m.cephUser }); // secret withheld
        break;
    }
    if (m.extraParamsEnc) out.extraParams = Object.fromEntries(Object.entries(m.extraParamsEnc).map(([k, v]) => [k, this._dec(v)]));
    return out;
  }

  // ── CRUD ──

  add(cfg) {
    const type = cfg.type || 's3';
    if (!cfg.name) throw new Error('name required');
    if (this._state.mounts.some(m => m.name === cfg.name)) throw new Error('A mount with that name exists');
    if (cfg.customPath && !path.isAbsolute(cfg.customPath)) throw new Error('Custom path must be absolute');
    const m = {
      id: 'mnt-' + crypto.randomBytes(5).toString('hex'),
      name: String(cfg.name).slice(0, 60),
      type,
      origin: cfg.origin || 'manual',
      mode: cfg.mode === 'ro' ? 'ro' : 'rw',
      customPath: cfg.customPath || null,
      expiresAt: cfg.expiresAt || null,
      desired: 'unmounted',
      createdAt: Date.now(),
    };
    switch (type) {
      case 's3': {
        for (const k of ['endpoint', 'bucket', 'accessKey', 'secretKey']) if (!cfg[k]) throw new Error(`${k} required`);
        Object.assign(m, {
          endpoint: String(cfg.endpoint), bucket: String(cfg.bucket),
          prefix: String(cfg.prefix || '').replace(/^\/+|\/+$/g, ''),
          accessKey: String(cfg.accessKey), secretKeyEnc: this._enc(cfg.secretKey),
          sessionTokenEnc: cfg.sessionToken ? this._enc(cfg.sessionToken) : null,
        });
        break;
      }
      case 'drive': {
        // token = the JSON blob printed by `rclone authorize "drive"` (run it
        // on any machine with a browser and paste the result here)
        if (!cfg.token) throw new Error('token required (run: rclone authorize "drive")');
        let tok = String(cfg.token).trim();
        const jsonMatch = tok.match(/\{[\s\S]*\}/); // tolerate the surrounding "Paste the following…" noise
        if (jsonMatch) tok = jsonMatch[0];
        try { JSON.parse(tok); } catch { throw new Error('token must be the JSON printed by rclone authorize'); }
        Object.assign(m, {
          tokenEnc: this._enc(tok),
          driveFolder: String(cfg.driveFolder || '').replace(/^\/+|\/+$/g, ''),
          driveMode: MountManager._driveMode(cfg.driveMode),
          teamDriveId: cfg.teamDriveId ? String(cfg.teamDriveId).trim() : null,
          rootFolderId: cfg.rootFolderId ? String(cfg.rootFolderId).trim() : null,
          clientId: cfg.clientId || null,
          clientPreset: cfg.clientPreset ? String(cfg.clientPreset) : null,
          clientSecretEnc: cfg.clientSecret ? this._enc(cfg.clientSecret) : null,
        });
        break;
      }
      case 'gmail': {
        if (!cfg.token) throw new Error('token required — use "Connect Gmail" (guided sign-in)');
        let tok = String(cfg.token).trim();
        try { JSON.parse(tok); } catch { throw new Error('gmail token must be the JSON from the guided flow'); }
        Object.assign(m, {
          tokenEnc: this._enc(tok),
          clientPreset: cfg.clientPreset ? String(cfg.clientPreset) : null,
          clientId: cfg.clientId || null,
          clientSecretEnc: cfg.clientSecret ? this._enc(cfg.clientSecret) : null,
          syncCount: Math.max(1, Math.min(2000, Number(cfg.syncCount) || 200)),
          labelIds: String(cfg.labelIds || 'INBOX'),
          query: String(cfg.query || ''),
          email: cfg.email ? String(cfg.email) : null,
          mode: 'ro', // read-only archive by design
        });
        break;
      }
      case 'webdav': {
        for (const k of ['url']) if (!cfg[k]) throw new Error(`${k} required`);
        if (!cfg.bearerToken && !cfg.user) throw new Error('user/pass or bearerToken required');
        Object.assign(m, {
          url: String(cfg.url), vendor: cfg.vendor === 'nextcloud' ? 'nextcloud' : 'other',
          user: cfg.user ? String(cfg.user) : null,
          passEnc: cfg.pass ? this._enc(cfg.pass) : null,
          bearerTokenEnc: cfg.bearerToken ? this._enc(cfg.bearerToken) : null,
        });
        break;
      }
      case 'vibespace': {
        // another VibeSpace instance's /dav bridge — webdav + scoped bearer token
        for (const k of ['url', 'bearerToken']) if (!cfg[k]) throw new Error(`${k} required`);
        // Self-mount guard: a token WE minted means the link points back at
        // THIS instance — fuse→HTTP→self is a threadpool deadlock loop (real
        // incident: a self-imported test share froze the instance on open).
        if (this.selfTokenCheck?.(String(cfg.bearerToken))) {
          throw new Error('This share link was minted by THIS VibeSpace — mounting your own share back onto yourself deadlocks the server. Open the shared folder directly instead.');
        }
        Object.assign(m, { url: String(cfg.url).replace(/\/+$/, ''), bearerTokenEnc: this._enc(cfg.bearerToken) });
        break;
      }
      case 'sftp': {
        for (const k of ['sshHost', 'sshUser']) if (!cfg[k]) throw new Error(`${k} required`);
        if (!cfg.keyPath && !cfg.pass) throw new Error('keyPath or pass required');
        if (cfg.keyPath && !path.isAbsolute(cfg.keyPath)) throw new Error('keyPath must be absolute');
        Object.assign(m, {
          sshHost: String(cfg.sshHost), sshUser: String(cfg.sshUser),
          sshPort: parseInt(cfg.sshPort) || 22,
          sshPath: String(cfg.sshPath || ''),
          keyPath: cfg.keyPath || null,
          passEnc: cfg.pass ? this._enc(cfg.pass) : null,
        });
        break;
      }
      case 'rclone': {
        // Any rclone backend the user knows how to configure: backend name +
        // freeform params → RCLONE_CONFIG_VS_<KEY>. All param values encrypted
        // (safe default — many are secrets); non-secret ones cost nothing.
        if (!cfg.rcloneType) throw new Error('rclone backend type required (e.g. dropbox, b2, azureblob)');
        const params = cfg.params && typeof cfg.params === 'object' ? cfg.params : {};
        if (!Object.keys(params).length && !cfg.remotePath) throw new Error('at least one parameter required');
        m.rcloneType = String(cfg.rcloneType).trim();
        m.paramsEnc = {};
        for (const [k, v] of Object.entries(params)) m.paramsEnc[k] = this._enc(String(v));
        m.remotePath = String(cfg.remotePath || '').replace(/^\/+/, '');
        break;
      }
      case 'cephfs': {
        // Native KERNEL CephFS mount (all-flash shared storage; deployment-
        // provisioned). `mount -t ceph <mons>:<path> <mp> -o name=…,secret=…`
        // — needs root, so the app sudo's it (the container has passwordless
        // sudo). NOT rclone; mount()/unmount()/isMounted() have cephfs branches.
        for (const k of ['cephMonHosts', 'cephSecret']) if (!cfg[k]) throw new Error(`${k} required`);
        Object.assign(m, {
          cephMonHosts: String(cfg.cephMonHosts),          // "10.0.0.1,10.0.0.2:6789"
          cephFsName: String(cfg.cephFsName || 'cephfs'),
          cephPath: '/' + String(cfg.cephPath || '/').replace(/^\/+/, ''),
          cephUser: String(cfg.cephUser || 'admin'),
          cephSecretEnc: this._enc(cfg.cephSecret),
        });
        break;
      }
      default: throw new Error('unknown mount type: ' + type);
    }
    // Advanced: extra rclone params merged into ANY type's config (custom API
    // keys, tuning flags, etc.) — encrypted like everything else.
    if (cfg.extraParams && typeof cfg.extraParams === 'object' && Object.keys(cfg.extraParams).length) {
      m.extraParamsEnc = {};
      for (const [k, v] of Object.entries(cfg.extraParams)) m.extraParamsEnc[k] = this._enc(String(v));
    }
    this._state.mounts.push(m);
    this._save();
    this._notify();
    return m.id;
  }

  /**
   * Add a SUBMOUNT under any storage record (user-refined model: EVERY
   * connection can act as a credential — remote:path children). The child
   * carries only its own path (+ name/mode/mountpoint) and resolves
   * connection settings from the parent at use time — refreshing the
   * parent's token/keys heals every child.
   */
  addChild(parentId, cfg = {}) {
    const p = this._get(parentId);
    if (p.parentId) throw new Error('Submounts can\'t nest — add it under the top-level connection');
    if (!cfg.name) throw new Error('name required');
    if (this._state.mounts.some(m => m.name === cfg.name)) throw new Error('A mount with that name exists');
    if (cfg.customPath && !path.isAbsolute(cfg.customPath)) throw new Error('Custom path must be absolute');
    const m = {
      id: 'mnt-' + crypto.randomBytes(5).toString('hex'),
      name: String(cfg.name).slice(0, 60),
      parentId,
      origin: 'manual',
      mode: cfg.mode === 'ro' ? 'ro' : 'rw',
      customPath: cfg.customPath || null,
      desired: 'unmounted',
      createdAt: Date.now(),
    };
    switch (p.type || 's3') {
      case 's3':
        if (!cfg.bucket) throw new Error('bucket required');
        m.bucket = String(cfg.bucket);
        m.prefix = String(cfg.prefix || '').replace(/^\/+|\/+$/g, '');
        break;
      case 'rclone':
        if (!cfg.remotePath) throw new Error('remote path required (e.g. bucket-name or bucket/prefix)');
        m.remotePath = String(cfg.remotePath).replace(/^\/+/, '');
        break;
      case 'drive':
        m.driveFolder = String(cfg.driveFolder || '').replace(/^\/+|\/+$/g, '');
        if (cfg.driveMode !== undefined) m.driveMode = MountManager._driveMode(cfg.driveMode);
        if (cfg.teamDriveId !== undefined) m.teamDriveId = cfg.teamDriveId ? String(cfg.teamDriveId).trim() : null;
        if (cfg.rootFolderId !== undefined) m.rootFolderId = cfg.rootFolderId ? String(cfg.rootFolderId).trim() : null;
        break;
      case 'sftp':
        m.sshPath = String(cfg.sshPath || '');
        break;
      default:
        throw new Error(`credentials of type "${p.type}" don't support mount points yet`);
    }
    this._state.mounts.push(m);
    this._save();
    this._notify();
    return m.id;
  }

  /** Manual convert: mount ⇄ credential (auto-detect covers the common case). */
  async convert(id, to) {
    const m = this._get(id);
    if (m.parentId) throw new Error('A mount point under a credential can\'t be converted');
    if (m.origin === 'my-storage') throw new Error('Deployment-provisioned storage can\'t be converted');
    if (to === 'credential') {
      if (this.isMounted(m)) await this.unmount(id);
      m.kind = 'credential';
      m.desired = 'unmounted';
      this._errors.delete(id);
    } else {
      if (this._childrenOf(id).length) throw new Error('Remove its mount points first');
      delete m.kind;
    }
    this._save();
    this._notify();
    return m.id;
  }

  async remove(id) {
    const m = this._get(id);
    // Env-provisioned personal storage is managed by the DEPLOYMENT (user
    // directive): deleting it in-app is confusing (a changed provisioning
    // re-imports it) — rename/edit instead. Unmount still works.
    if (m.origin === 'my-storage') {
      throw new Error('This storage is provisioned by your deployment and can\'t be deleted here — you can rename or edit it, and Unmount disconnects it.');
    }
    // Children resolve their connection through the parent — deleting the
    // credential out from under them would break every one of them.
    if (this._kindOf(m) === 'credential' && this._childrenOf(id).length) {
      throw new Error('This credential still has mount points under it — remove those first.');
    }
    const mpRemoved = this.pathOf(m);
    if (this.isMounted(m)) await this.unmount(id);
    this._state.mounts = this._state.mounts.filter(x => x.id !== id);
    setTimeout(() => this._cleanupEmptyMountpoint(mpRemoved), 1500);
    this._errors.delete(id);
    this._reconnects?.delete(id);
    // async — the cache can be up to vfsCacheMaxSizeGB; a sync rm would hold
    // the event loop hostage for seconds (the IO-hostage class this module
    // exists to prevent)
    try { fs.rm(path.join(this._vfsCacheRoot(), id), { recursive: true, force: true }, () => {}); } catch {}
    this._save();
    this._notify();
  }

  /**
   * Edit a mount's connection settings. Empty/undefined secret fields keep
   * the stored value. A mounted target is unmounted, patched, and remounted.
   * Renaming is refused while a bridge share references the mount's path
   * (the share's chroot would silently break — user-flagged risk).
   */
  async update(id, patch = {}) {
    const m = this._get(id);
    const wasMounted = this.isMounted(m) || m.desired === 'mounted';
    if (patch.name && patch.name !== m.name) {
      if (this._state.mounts.some(x => x.id !== id && x.name === patch.name)) throw new Error('A mount with that name exists');
      const myPath = this.pathOf(m);
      // pathGuard is injected by the server (bridge-share tokens live in
      // webdav.js's MountTokens — their chroot roots are filesystem paths
      // that a rename would silently break; user-flagged risk).
      if (this.pathGuard && this.pathGuard(myPath)) {
        throw new Error('A shared link points into this mount — revoke it before renaming (the share path would break).');
      }
    }
    if (this.isMounted(m)) await this.unmount(id);
    if (patch.name) m.name = String(patch.name).slice(0, 60);
    if (patch.mode === 'ro' || patch.mode === 'rw') m.mode = patch.mode;
    if (patch.customPath !== undefined) {
      const cp = String(patch.customPath || '').trim();
      if (cp && !path.isAbsolute(cp)) throw new Error('Custom path must be absolute');
      const oldMp = this.pathOf(m);
      m.customPath = cp || null;
      // Mountpoint moved → the old (already unmounted above) directory is a
      // leftover husk; sweep it if empty.
      if (this.pathOf(m) !== oldMp) setTimeout(() => this._cleanupEmptyMountpoint(oldMp), 1500);
    }
    // Env-provisioned storage: the CONNECTION is deployment-owned (endpoint/
    // bucket/keys come from env and a change re-imports) — name, mountpoint
    // and mode are the only editable fields (user directive).
    const envLocked = m.origin === 'my-storage';
    const connectionKeys = ['endpoint', 'bucket', 'prefix', 'accessKey', 'secretKey', 'sessionToken', 'rcloneType', 'remotePath', 'params', 'driveFolder', 'driveMode', 'teamDriveId', 'rootFolderId', 'token', 'clientId', 'clientPreset', 'clientSecret', 'syncCount', 'labelIds', 'query', 'url', 'user', 'pass', 'bearerToken', 'sshHost', 'sshUser', 'sshPort', 'sshPath', 'keyPath', 'cephMonHosts', 'cephFsName', 'cephPath', 'cephUser', 'cephSecret'];
    if (envLocked && connectionKeys.some((k) => patch[k] !== undefined && patch[k] !== '')) {
      throw new Error('This storage is provisioned by your deployment — its connection settings can\'t be edited here (name and mount point can).');
    }
    const setIf = (k, transform = (v) => String(v)) => { if (patch[k] !== undefined && patch[k] !== '') m[k] = transform(patch[k]); };
    // A mount point under a credential owns ONLY its path — connection fields
    // live on (and are edited via) the parent credential.
    const parentType = m.parentId ? (this._get(m.parentId).type || 's3') : null;
    switch (envLocked ? '__locked__' : (parentType ? '__child_' + parentType : (m.type || 's3'))) {
      case '__child_s3':
        setIf('bucket');
        if (patch.prefix !== undefined) m.prefix = String(patch.prefix || '').replace(/^\/+|\/+$/g, '');
        break;
      case '__child_rclone':
        if (patch.remotePath !== undefined && patch.remotePath !== '') m.remotePath = String(patch.remotePath).replace(/^\/+/, '');
        break;
      case '__child_drive':
        if (patch.driveFolder !== undefined) m.driveFolder = String(patch.driveFolder || '').replace(/^\/+|\/+$/g, '');
        if (patch.driveMode !== undefined) m.driveMode = MountManager._driveMode(patch.driveMode);
        if (patch.teamDriveId !== undefined) m.teamDriveId = patch.teamDriveId ? String(patch.teamDriveId).trim() : null;
        if (patch.rootFolderId !== undefined) m.rootFolderId = patch.rootFolderId ? String(patch.rootFolderId).trim() : null;
        break;
      case '__child_sftp':
        if (patch.sshPath !== undefined) m.sshPath = String(patch.sshPath || '');
        break;
      case 's3':
        setIf('endpoint'); setIf('bucket');
        if (patch.prefix !== undefined) m.prefix = String(patch.prefix || '').replace(/^\/+|\/+$/g, '');
        setIf('accessKey');
        if (patch.secretKey) m.secretKeyEnc = this._enc(String(patch.secretKey));
        if (patch.sessionToken) m.sessionTokenEnc = this._enc(String(patch.sessionToken));
        break;
      case 'rclone':
        setIf('rcloneType', (v) => String(v).trim());
        if (patch.remotePath !== undefined) m.remotePath = String(patch.remotePath || '').replace(/^\/+/, '');
        if (patch.params && typeof patch.params === 'object') {
          for (const [k, v] of Object.entries(patch.params)) {
            if (v === '' || v == null) delete m.paramsEnc[k];
            else m.paramsEnc[k] = this._enc(String(v));
          }
        }
        break;
      case 'gmail':
        if (patch.syncCount !== undefined) m.syncCount = Math.max(1, Math.min(2000, Number(patch.syncCount) || 200));
        if (patch.labelIds !== undefined) m.labelIds = String(patch.labelIds || '');
        if (patch.query !== undefined) m.query = String(patch.query || '');
        if (patch.clientPreset !== undefined) m.clientPreset = patch.clientPreset ? String(patch.clientPreset) : null;
        if (patch.token) { JSON.parse(String(patch.token).trim()); m.tokenEnc = this._enc(String(patch.token).trim()); }
        break;
      case 'drive':
        if (patch.driveFolder !== undefined) m.driveFolder = String(patch.driveFolder || '').replace(/^\/+|\/+$/g, '');
        if (patch.driveMode !== undefined) m.driveMode = MountManager._driveMode(patch.driveMode);
        if (patch.teamDriveId !== undefined) m.teamDriveId = patch.teamDriveId ? String(patch.teamDriveId).trim() : null;
        if (patch.rootFolderId !== undefined) m.rootFolderId = patch.rootFolderId ? String(patch.rootFolderId).trim() : null;
        if (patch.clientPreset !== undefined) m.clientPreset = patch.clientPreset ? String(patch.clientPreset) : null;
        setIf('clientId');
        if (patch.clientSecret) m.clientSecretEnc = this._enc(String(patch.clientSecret));
        if (patch.token) {
          let tok = String(patch.token).trim();
          const jm = tok.match(/\{[\s\S]*\}/); if (jm) tok = jm[0];
          JSON.parse(tok); // validate
          m.tokenEnc = this._enc(tok);
        }
        break;
      case 'webdav': case 'vibespace':
        setIf('url', (v) => String(v).replace(/\/+$/, ''));
        setIf('user');
        if (patch.pass) m.passEnc = this._enc(String(patch.pass));
        if (patch.bearerToken) m.bearerTokenEnc = this._enc(String(patch.bearerToken));
        break;
      case 'sftp':
        setIf('sshHost'); setIf('sshUser');
        if (patch.sshPort) m.sshPort = parseInt(patch.sshPort) || 22;
        if (patch.sshPath !== undefined) m.sshPath = String(patch.sshPath || '');
        if (patch.keyPath) {
          if (!path.isAbsolute(String(patch.keyPath))) throw new Error('keyPath must be absolute');
          m.keyPath = String(patch.keyPath);
        }
        if (patch.pass) m.passEnc = this._enc(String(patch.pass));
        break;
    }
    this._save();
    this._notify();
    if (wasMounted) { try { await this.mount(id); } catch {} }
    // Editing a CREDENTIAL (token refresh, endpoint change) must reach every
    // mount point that resolves through it — bounce the mounted children.
    if (this._kindOf(m) === 'credential') {
      for (const c of this._childrenOf(id)) {
        if (this.isMounted(c) || c.desired === 'mounted') {
          try { await this.unmount(c.id); await this.mount(c.id); } catch {}
        }
      }
    }
    return m.id;
  }

  /**
   * Derive a NEW mount from an existing one's connection (same credentials,
   * different bucket/path/prefix) — one imported R2/S3 credential can back
   * any number of mounts (user request). Encrypted fields copy verbatim
   * (same instance key).
   */
  async duplicate(id, { name, ...overrides } = {}) {
    const src = this._get(id);
    if (!name) throw new Error('name required');
    if (this._state.mounts.some(x => x.name === name)) throw new Error('A mount with that name exists');
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = 'mnt-' + crypto.randomBytes(5).toString('hex');
    copy.name = String(name).slice(0, 60);
    copy.origin = 'manual';
    copy.createdAt = Date.now();
    copy.desired = 'unmounted';
    copy.customPath = null;
    this._state.mounts.push(copy);
    this._save();
    try {
      await this.update(copy.id, overrides); // reuse the per-type field logic
    } catch (e) {
      this._state.mounts = this._state.mounts.filter(x => x.id !== copy.id);
      this._save(); this._notify();
      throw e;
    }
    return copy.id;
  }

  _get(id) {
    const m = this._state.mounts.find(x => x.id === id);
    if (!m) throw new Error('mount not found');
    return m;
  }

  // ── Mount / unmount ──

  // rclone obscure: rclone requires PASS-type params in its reversible
  // obscured form. We store the REAL secret AES-GCM'd and obscure at use time.
  _obscure(plain) {
    return execFileSync(this.rcloneBin(), ['obscure', String(plain)], { encoding: 'utf-8', timeout: 5000 }).trim();
  }

  /** Per-type rclone env + remote string for a mount record. */
  _rcloneFor(m) {
    m = this._connOf(m); // child mounts resolve to credential + own path
    const R = 'VS';
    const P = (k) => `RCLONE_CONFIG_${R}_${k}`;
    const env = { ...process.env };
    let remote;
    switch (m.type || 's3') {
      case 'drive': {
        env[P('TYPE')] = 'drive';
        env[P('TOKEN')] = this._dec(m.tokenEnc);
        env[P('SCOPE')] = 'drive';
        if (m.clientId) { env[P('CLIENT_ID')] = m.clientId; if (m.clientSecretEnc) env[P('CLIENT_SECRET')] = this._dec(m.clientSecretEnc); }
        else {
          // Instance-preset client (admin-injected env; record stores only the
          // preset KEY — see drivePresets). Never persisted app-side.
          const pc = MountManager._driveClient(m);
          if (pc) { env[P('CLIENT_ID')] = pc.clientId; env[P('CLIENT_SECRET')] = pc.clientSecret; }
        }
        // Cloud-side SCOPE of the mount (2.131.0): shared-with-me / a Shared
        // Drive are separate namespaces in the Drive API — rclone exposes them
        // as per-remote params. Each VibeSpace mount runs its OWN rclone
        // daemon+env, so these are freely per-child (same credential parent,
        // different scopes).
        // root_folder_id ALONE is the mount-one-shared-folder pattern; combining
        // it with shared_with_me breaks path resolution (rclone forum guidance) —
        // an explicit folder id wins over the scope flag.
        if (m.rootFolderId) env[P('ROOT_FOLDER_ID')] = m.rootFolderId;
        else if (m.driveMode === 'shared-with-me') env[P('SHARED_WITH_ME')] = 'true';
        if (m.driveMode === 'shared-drive' && m.teamDriveId) env[P('TEAM_DRIVE')] = m.teamDriveId;
        remote = `${R}:${m.driveFolder || ''}`;
        break;
      }
      case 'webdav':
      case 'vibespace': {
        env[P('TYPE')] = 'webdav';
        env[P('URL')] = m.type === 'vibespace' ? m.url + '/dav' : m.url;
        env[P('VENDOR')] = m.vendor === 'nextcloud' ? 'nextcloud' : 'other';
        if (m.user) env[P('USER')] = m.user;
        if (m.passEnc) env[P('PASS')] = this._obscure(this._dec(m.passEnc));
        if (m.bearerTokenEnc) env[P('BEARER_TOKEN')] = this._dec(m.bearerTokenEnc);
        remote = `${R}:`;
        break;
      }
      case 'sftp': {
        env[P('TYPE')] = 'sftp';
        env[P('HOST')] = m.sshHost;
        env[P('USER')] = m.sshUser;
        env[P('PORT')] = String(m.sshPort || 22);
        if (m.keyPath) env[P('KEY_FILE')] = m.keyPath;
        if (m.passEnc) env[P('PASS')] = this._obscure(this._dec(m.passEnc));
        remote = `${R}:${m.sshPath || ''}`;
        break;
      }
      case 'rclone': {
        env[P('TYPE')] = m.rcloneType;
        for (const [k, blob] of Object.entries(m.paramsEnc || {})) env[P(k.toUpperCase())] = this._dec(blob);
        remote = `${R}:${m.remotePath || ''}`;
        break;
      }
      default: { // s3
        env[P('TYPE')] = 's3';
        env[P('PROVIDER')] = 'Other';
        env[P('ENDPOINT')] = m.endpoint;
        env[P('ACCESS_KEY_ID')] = m.accessKey;
        env[P('SECRET_ACCESS_KEY')] = this._dec(m.secretKeyEnc);
        env[P('FORCE_PATH_STYLE')] = 'true';
        env[P('NO_CHECK_BUCKET')] = 'true';
        if (m.sessionTokenEnc) env[P('SESSION_TOKEN')] = this._dec(m.sessionTokenEnc);
        remote = `${R}:${m.bucket}${m.prefix ? '/' + m.prefix : ''}`;
      }
    }
    // Advanced extra params (custom API keys, tuning) override/extend any type
    for (const [k, blob] of Object.entries(m.extraParamsEnc || {})) env[P(k.toUpperCase())] = this._dec(blob);
    return { env, remote };
  }

  // Backends where the account root and a bucket/container are DIFFERENT
  // permission scopes — a bucket-scoped token root-mounts "successfully" and
  // then EIOs on every IO. Detection (below) only fires for these.
  static BUCKETY_BACKENDS = new Set(['s3', 'b2', 'azureblob', 'googlecloudstorage', 'swift', 'oos', 'qingstor']);

  /** Probe whether this record's token can list the account ROOT. */
  _probeRootDenied(m) {
    const { env } = this._rcloneFor(m);
    return new Promise((resolve) => {
      execFile(this.rcloneBin(), ['lsf', 'VS:', '--max-depth', '1', '--retries', '1', '--low-level-retries', '1'],
        { env, timeout: 20000 },
        (err, _o, stderr) => resolve(err ? /AccessDenied|Access Denied|status code: 403/i.test(String(stderr || err.message)) : false));
    });
  }

  async mount(id) {
    // One connect in flight per record — the watchdog's auto-reconnect must
    // never race a user-initiated connect (or itself).
    this._connecting = this._connecting || new Set();
    if (this._connecting.has(id)) return false;
    this._connecting.add(id);
    try { return await this._mountInner(id); }
    finally { this._connecting.delete(id); }
  }

  async _mountInner(id) {
    const m = this._get(id);
    if (this.isMounted(m)) { m.desired = 'mounted'; this._save(); this._notify(); return; }
    // Gmail = a sync WORKER writing .eml files, not a filesystem.
    if (m.type === 'gmail') return this._mountGmail(id);
    // CephFS = native kernel mount (not rclone) — its own path.
    if (m.type === 'cephfs') return this._mountCephfs(id);
    // Self-mount guard for EXISTING records too (imported before the add()
    // guard existed): our own bridge token = the URL points back at this
    // instance — refuse instead of fuse-mounting a self-referential loop.
    if (m.type === 'vibespace' && m.bearerTokenEnc && this.selfTokenCheck?.(this._dec(m.bearerTokenEnc))) {
      this._errors.set(id, 'this share was minted by this same VibeSpace (self-mount deadlocks the server) — open the shared folder directly instead');
      m.desired = 'unmounted';
      this._save();
      this._notify();
      return false;
    }
    // Credential model (user-refined): a credential IS the rclone remote (the
    // part before the colon); a mount is remote:path. A credential itself IS
    // mountable when its token can reach the remote's root (Google Drive,
    // account-wide S3 keys) — mounting it mounts the root. Bucket-scoped S3
    // tokens CAN'T list the root: the fuse mount would "succeed" and EIO on
    // every IO, so probe first and convert such records to credentials with
    // guidance instead of mounting a dead folder.
    if (!m.parentId && m.type === 'rclone' && MountManager.BUCKETY_BACKENDS.has(m.rcloneType) && !m.remotePath) {
      if (await this._probeRootDenied(m)) {
        m.kind = 'credential';
        m.desired = 'unmounted';
        this._errors.delete(id);
        this._save();
        this._notify();
        throw new Error('This token can’t list the account root (it’s bucket-scoped) — add a submount with a specific bucket under it.');
      }
      // Auto-heal: a previously credential-only record whose token can NOW
      // list the root (rescoped token) becomes root-mountable again.
      if (m.kind === 'credential') { delete m.kind; this._save(); }
    }
    const mp = this.pathOf(m);
    fs.mkdirSync(mp, { recursive: true });
    fs.mkdirSync(this._logDir, { recursive: true });
    const { env, remote } = this._rcloneFor(m);
    const log = fs.openSync(path.join(this._logDir, `${m.id}.log`), 'w');
    // Read+write caching (user directive: 最稳定 + 性能最好 + 开读写cache).
    // --vfs-cache-mode full = reads cached chunk-wise on local disk AND writes
    // land locally first, uploading async. With a PERSISTENT per-mount
    // --cache-dir, DIRTY WRITES SURVIVE a daemon crash / server restart and
    // resume uploading on remount — the crash-safety half of "最稳定". Bounded
    // timeouts make a flaky backend DEGRADE (IO error) instead of hanging the
    // fuse op; the hung-mount defense stays the backstop. Flags gated on the
    // installed rclone actually knowing them (an old system rclone would
    // refuse to mount at all on an unknown flag).
    const cacheDir = path.join(this._vfsCacheRoot(), m.id);
    try { fs.mkdirSync(cacheDir, { recursive: true }); } catch {}
    const cacheGB = Math.max(1, Number(this._getSetting('mounts.vfsCacheMaxSizeGB')) || 10);
    const args = ['mount', remote, mp,
      '--vfs-cache-mode', this._rcloneHasFlag('vfs-fast-fingerprint') ? 'full' : 'writes',
      '--cache-dir', cacheDir,
      '--vfs-cache-max-size', `${cacheGB}G`,
      '--vfs-cache-max-age', '168h',
      '--vfs-cache-poll-interval', '1m',
      '--vfs-write-back', '5s',
      '--buffer-size', '16M',
      '--timeout', '60s', '--contimeout', '15s',
      '--low-level-retries', '10', '--retries', '3',
      '--dir-cache-time', '30s',
      // NOTICE (rclone's default): the INFO per-minute vfs-cache heartbeat grew
      // mount logs unrotated for weeks AND polluted the tail-2 failure
      // diagnostic; ERROR/NOTICE lines are what that diagnostic actually reads.
      '--log-level', 'NOTICE'];
    if (this._rcloneHasFlag('vfs-fast-fingerprint')) args.push('--vfs-fast-fingerprint');
    if (this._rcloneHasFlag('vfs-read-ahead')) args.push('--vfs-read-ahead', '128M');
    // Proxy-safe signing: old aws-sdk-go signs Accept-Encoding into the V4
    // signature and CDN proxies (Cloudflare) rewrite that header on plain
    // object GETs → SignatureDoesNotMatch on every read (silent retry loop
    // that looks like a hang; list/put unaffected because query-string
    // requests pass untouched). rclone ≥1.63 has a flag that stops sending/
    // signing it — add it whenever the installed rclone supports it.
    // s3-backed whether it's the native type OR a custom rclone mount using
    // the s3 backend (rclone.conf import, Custom type) — both hit the proxy
    // signing issue, so the fix must key off the BACKEND, not our type name.
    const isS3 = (m.type || 's3') === 's3' || m.rcloneType === 's3';
    if (isS3 && this._rcloneSupportsAcceptEncodingFlag()) args.push('--s3-use-accept-encoding-gzip=false');
    if (m.mode === 'ro') args.push('--read-only');
    // One-time signing probe: some proxies (Cloudflare) rewrite the signed
    // Accept-Encoding header → SignatureDoesNotMatch on everything. V2 auth
    // avoids signing it and rescues PERMANENT-credential mounts; STS session
    // tokens require V4, so those need rclone 1.63–1.69 (v1 SDK + the flag)
    // or an un-proxied endpoint — fail with a message that says so.
    if (isS3 && m.v2Auth === undefined) {
      const probe = (extraEnv) => new Promise((resolve) => {
        execFile(this.rcloneBin(), ['lsf', remote, '--max-depth', '1', '--retries', '1', '--low-level-retries', '1',
          ...(this._rcloneSupportsAcceptEncodingFlag() ? ['--s3-use-accept-encoding-gzip=false'] : [])],
          { env: { ...env, ...extraEnv }, timeout: 20000 },
          (err, _o, stderr) => resolve(err ? String(stderr || err.message) : null));
      });
      const v4err = await probe({});
      if (!v4err) { m.v2Auth = false; }
      else if (/AccessDenied|Access Denied/i.test(v4err)) {
        // Definitive server answer: the token can't list this path. Fail NOW
        // with a pointer instead of fuse-mounting a folder that EIOs on every
        // read (the FishR2 trap: bucket typo / out-of-scope bucket). v2Auth
        // stays undefined so a fixed path re-probes on the next mount.
        const target = remote.split(':').slice(1).join(':') || '(account root)';
        this._errors.set(id, `the credential can’t access “${target}” (AccessDenied) — check the bucket name (S3 buckets are lowercase letters/digits/hyphens) and the token’s bucket scope`);
        this._notify();
        return false;
      }
      else if (/SignatureDoesNotMatch/i.test(v4err)) {
        if (m.sessionTokenEnc) {
          this._errors.set(id, 'endpoint proxy rewrites signed headers (Cloudflare?) — temporary-credential (STS) shares need rclone 1.63–1.69, a service-account share, or an un-proxied endpoint');
          this._notify();
          return false;
        }
        const v2err = await probe({ RCLONE_CONFIG_VS_V2_AUTH: 'true' });
        if (!v2err) { m.v2Auth = true; }
      }
      this._save();
    }
    if (m.v2Auth) env.RCLONE_CONFIG_VS_V2_AUTH = 'true';
    // detached: mounts survive server restarts (adopted on boot)
    const child = spawn(this.rcloneBin(), args, { env, detached: true, stdio: ['ignore', log, log] });
    child.unref();
    fs.closeSync(log);
    m.desired = 'mounted';
    this._errors.delete(id);
    this._save();
    // Circuit-break the path for the whole connect window: nothing may issue
    // node-fs IO against this root until the health probe has passed.
    this.blockPath(mp, 30000);
    // rclone daemonizes the fuse mount asynchronously — poll up to 5s
    const ok = await this._waitMounted(m, 5000);
    if (!ok) {
      let tail = '';
      try { tail = fs.readFileSync(path.join(this._logDir, `${m.id}.log`), 'utf-8').trim().split('\n').slice(-2).join(' '); } catch {}
      this._errors.set(id, tail || 'mount did not appear within 5s');
      this.unblockPath(mp);
      this._notify();
      return false;
    }
    // Post-mount IO health probe: a fuse mount to an UNREACHABLE backend
    // "succeeds" and then HANGS every IO — node's libuv threadpool fills with
    // stuck fs ops and the whole server stops answering (real incident: an
    // SMB mount whose host only resolves on the user's home LAN wedged a
    // deployed instance — /login took 130s, readiness failed, pod dropped
    // from the Service). Probe in a CHILD process (never node fs), and cut
    // the mount loose instead of serving a folder that would wedge us.
    const health = await this._probeMountpoint(mp);
    if (health === 'hung') {
      this.blockPath(mp, 90000); // keep failing fast while teardown + stragglers drain
      // desired stays 'mounted' — the watchdog auto-reconnects with backoff
      // (each attempt re-runs this same probe + teardown, so a still-dead
      // backend is cut loose again within seconds). Only an explicit user
      // Unmount stops the supervision.
      this._errors.set(id, 'storage connected but IO hangs (host unreachable from this machine?) — disconnected to protect the server; will retry');
      await this.unmount(id, { internal: true });
      this._killMountDaemon(mp);
      this._noteReconnectBackoff(id);
      this._notify();
      return false;
    }
    this.unblockPath(mp);
    // Revoke/expiry surfacing: a fuse mount to a REVOKED share still "mounts"
    // (and a cached mountpoint `ls` lies about it), so probe the BACKEND fresh
    // — it re-auths and returns 401/403. Stay mounted (may recover; the user
    // decides) but surface the error (user-flagged: "revoke了token接受方如何提示").
    if (this._revocable(m) && (await this._probeBackendAccess(m)) === 'denied') {
      this._errors.set(id, this._accessErrorMsg(m));
    } else if (health === 'error') {
      this._errors.set(id, this._accessErrorMsg(m));
    }
    this._notify();
    return this.isMounted(m);
  }

  // ── Path circuit breaker (2.108.4) ──
  // While a mount is CONNECTING (IO-probe window) or detected hanging, every
  // file-route op under its root fails fast instead of entering the libuv
  // threadpool — an open file-explorer window pointed at a dead mountpoint
  // stuffed the pool during the 6s probe window and degraded the whole server
  // for minutes even with the watchdog (real outage tail).
  blockPath(mp, ms) { (this._blockedPaths = this._blockedPaths || new Map()).set(mp, Date.now() + ms); }
  unblockPath(mp) { this._blockedPaths?.delete(mp); }
  /** Blocked mount root containing p, or false. */
  pathBlocked(p) {
    if (!p || !this._blockedPaths?.size) return false;
    const rp = String(p);
    for (const [mp, until] of this._blockedPaths) {
      if (Date.now() > until) { this._blockedPaths.delete(mp); continue; }
      if (rp === mp || rp.startsWith(mp + '/')) return mp;
    }
    return false;
  }

  /** Health of a mountpoint via a child `ls` (never node fs — that's what
   *  wedges the threadpool). Returns:
   *   'hung'  — the child timed out (unreachable backend; the dangerous case)
   *   'error' — non-zero exit (EIO / access denied — a REVOKED or expired
   *             share, changed creds; responsive but broken → surface it)
   *   'ok'    — listed fine.  */
  _probeMountpoint(mp, timeoutMs = 6000) {
    return new Promise((resolve) => {
      const c = spawn('ls', [mp], { stdio: 'ignore' });
      const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch {} resolve('hung'); }, timeoutMs);
      c.on('exit', (code) => { clearTimeout(t); resolve(code === 0 ? 'ok' : 'error'); });
      c.on('error', () => { clearTimeout(t); resolve('error'); });
    });
  }
  /** Back-compat: true only when the mountpoint HANGS. */
  async _probeMountpointHung(mp, timeoutMs = 6000) { return (await this._probeMountpoint(mp, timeoutMs)) === 'hung'; }

  /** A mount whose access can be REVOKED/EXPIRE out from under us (an imported
   *  share, a VibeSpace bridge, or an STS-style expiring credential). Only
   *  these get the (heavier) backend re-auth probe — my own S3/Drive don't. */
  _revocable(m) { return m.origin === 'imported' || m.type === 'vibespace' || !!m.expiresAt; }

  /** Uncached BACKEND access probe (fresh rclone process re-auths, bypassing
   *  the fuse/dir cache that makes a mountpoint `ls` lie about a revoked
   *  token). Returns 'ok' | 'denied' | 'hung'. */
  _probeBackendAccess(m, timeoutMs = 15000) {
    let env, remote;
    try { ({ env, remote } = this._rcloneFor(m)); } catch { return Promise.resolve('ok'); }
    if (m.v2Auth) env.RCLONE_CONFIG_VS_V2_AUTH = 'true';
    const args = ['lsf', remote, '--max-depth', '1', '--retries', '1', '--low-level-retries', '1'];
    if (((m.type || 's3') === 's3' || m.rcloneType === 's3') && this._rcloneSupportsAcceptEncodingFlag()) args.push('--s3-use-accept-encoding-gzip=false');
    return new Promise((resolve) => {
      let done = false;
      const child = execFile(this.rcloneBin(), args, { env, timeout: timeoutMs },
        (err, _o, stderr) => {
          if (done) return; done = true;
          if (!err) return resolve('ok');
          const s = String(stderr || err.message || '');
          if (err.killed || /ETIMEDOUT/.test(s)) return resolve('hung');
          if (/401|403|Unauthorized|AccessDenied|Access Denied|expired|Forbidden|SignatureDoesNotMatch|InvalidAccessKeyId|no longer valid/i.test(s)) return resolve('denied');
          return resolve('denied'); // any other list failure on a share = broken access
        });
      child.on('error', () => { if (!done) { done = true; resolve('denied'); } });
    });
  }

  /** Is an rclone daemon still serving this mountpoint? A SIGKILLed/crashed
   *  daemon leaves a ZOMBIE fuse entry in /proc/mounts ("Transport endpoint
   *  is not connected") — isMounted() lies, so recovery must key off the
   *  PROCESS (same exact-argv /proc scan as _killMountDaemon). */
  _daemonAlive(mp) {
    try {
      for (const pid of fs.readdirSync('/proc').filter(d => /^\d+$/.test(d))) {
        let argv;
        try { argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').split('\0'); } catch { continue; }
        if (argv.includes('mount') && argv.includes(mp) && /rclone/.test(argv[0] || '')) return true;
      }
      return false;
    } catch { return true; } // no /proc (non-Linux) — can't tell, assume alive
  }

  /** Kill the detached rclone daemon serving a mountpoint (a WEDGED daemon
   *  survives fusermount -uz and keeps dial-retrying forever). Exact-argv
   *  match via /proc — pkill -f patterns can't safely quote arbitrary paths. */
  _killMountDaemon(mp) {
    try {
      for (const pid of fs.readdirSync('/proc').filter(d => /^\d+$/.test(d))) {
        let argv;
        try { argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').split('\0'); } catch { continue; }
        if (argv.includes('mount') && argv.includes(mp) && /rclone/.test(argv[0] || '')) {
          try { process.kill(+pid, 'SIGKILL'); } catch {}
        }
      }
    } catch {} // non-Linux: no /proc — daemon exits with the unmount anyway
  }

  /**
   * Watchdog: every 60s, health-probe every mounted record from a child
   * process. A mount whose IO hangs is auto-disconnected (desired persisted,
   * daemon killed) — one bad mount must never take the whole server down.
   */
  startHealthWatchdog() {
    if (this._watchdog) return;
    this._watchdog = setInterval(() => { this._healthSweep().catch(() => {}); }, 60000);
    this._watchdog.unref?.();
    setTimeout(() => { this._healthSweep().catch(() => {}); }, 15000).unref?.();
  }

  /** Human error for a mount whose IO is denied (revoked/expired share). */
  _accessErrorMsg(m) {
    if (m.type === 'vibespace') return 'connected but every file errors — the share may have been revoked, or the source instance is unreachable';
    if (m.expiresAt && Date.now() > m.expiresAt) return 'connected but access denied — this share credential has expired';
    return 'connected but access denied — the share may have been revoked or its credentials changed';
  }

  async _healthSweep() {
    if (this._sweepBusy) return;
    this._sweepBusy = true;
    try {
      for (const m of [...this._state.mounts]) {
        if (this._kindOf(m) === 'credential') continue;
        if (m.type === 'gmail') {
          // sync worker, not a filesystem — restart it if it died, skip all
          // fuse/mountpoint probing (a plain dir can't hang the pool)
          if (!this.isMounted(m) && m.desired === 'mounted') await this._maybeAutoRemount(m);
          continue;
        }
        if (!this.isMounted(m)) {
          // Self-heal: desired-but-dead (daemon crashed/OOM-killed, kernel
          // mount evicted, or a prior hang teardown) — auto-remount with
          // backoff. Auth/revoke errors wait for the USER instead of looping.
          if (m.desired === 'mounted') await this._maybeAutoRemount(m);
          continue;
        }
        const mp = this.pathOf(m);
        // Daemon death check FIRST: a crashed daemon leaves a zombie fuse
        // entry, so isMounted() above said true — and the IO probe below
        // would read the zombie's ENOTCONN as an access error, poisoning the
        // record with a "revoked?" message that blocks auto-remount (found by
        // the 2.110.0 e2e). Overwrite any stale error and reconnect NOW.
        if (m.type !== 'cephfs' && !this._daemonAlive(mp)) {
          this._errors.set(m.id, 'mount daemon died — reconnecting…');
          await this.unmount(m.id, { internal: true }); // clears the zombie entry
          if (m.desired === 'mounted') await this._maybeAutoRemount(m);
          this._notify();
          continue;
        }
        // cephfs (native kernel mount) gets a longer probe window — an MDS
        // session on a cold mount can spike a first `ls` past the fuse budget,
        // and a single blip must not disconnect a trusted deployment mount.
        const health = await this._probeMountpoint(mp, m.type === 'cephfs' ? 12000 : 6000);
        if (health === 'hung') {
          // Blip tolerance: require TWO consecutive hangs before auto-
          // disconnecting a trusted deployment mount (cephfs) — a single slow
          // MDS access shouldn't tear it down. Untrusted mounts disconnect
          // immediately (a hung fuse mount is the outage class we defend).
          this._hungStrikes = this._hungStrikes || new Map();
          const strikes = (this._hungStrikes.get(m.id) || 0) + 1;
          if (m.type === 'cephfs' && strikes < 2) { this._hungStrikes.set(m.id, strikes); continue; }
          this._hungStrikes.delete(m.id);
          this.blockPath(mp, 90000); // fail fast while teardown + in-flight stragglers drain
          // desired stays 'mounted' → the sweep's dead-mount branch reconnects
          // with backoff; only an explicit user Unmount ends the supervision.
          this._errors.set(m.id, 'storage stopped responding (unreachable host?) — auto-disconnected to protect the server; will retry');
          await this.unmount(m.id, { internal: true });
          this._killMountDaemon(mp);
          this._noteReconnectBackoff(m.id);
          this._notify();
        } else {
          this._hungStrikes?.delete(m.id); // recovered — reset the strike count
          // Not hung. For a REVOCABLE share, a cached mountpoint `ls` can't
          // tell us the token was revoked — probe the backend fresh. Normal
          // mounts (my own S3/Drive) skip the extra round-trip.
          let denied = health === 'error';
          if (this._revocable(m)) {
            const acc = await this._probeBackendAccess(m);
            if (acc === 'hung') continue; // transient; mountpoint wasn't hung — leave as-is
            denied = acc === 'denied';
          }
          if (denied) {
            const msg = this._accessErrorMsg(m);
            if (this._errors.get(m.id) !== msg) { this._errors.set(m.id, msg); this._notify(); }
          } else if (this._errors.has(m.id)) {
            // Recovered (re-granted share) — clear a previously surfaced error.
            this._errors.delete(m.id); this._notify();
          }
        }
      }
    } finally { this._sweepBusy = false; }
  }

  // ── Auto-reconnect supervision (2.110.0) ──
  // A record whose desired='mounted' but whose mount is DEAD self-heals:
  // exponential backoff 1m → 2m → 5m → 10m (cap), reset on success. Each
  // attempt re-runs the full mount() pipeline (probe + circuit breaker), so a
  // still-unreachable backend is cut loose again within seconds per attempt —
  // bounded, threadpool-safe. Auth-class failures are excluded: retrying a
  // revoked/expired credential just hammers the backend and OVERWRITES the
  // actionable error the user needs to see.
  _noteReconnectBackoff(id) {
    const r = (this._reconnects = this._reconnects || new Map());
    const st = r.get(id) || { attempts: 0, nextAt: 0 };
    st.attempts++;
    st.nextAt = Date.now() + [60, 120, 300, 600][Math.min(st.attempts - 1, 3)] * 1000;
    r.set(id, st);
  }

  async _maybeAutoRemount(m) {
    const mp = this.pathOf(m);
    if (this.pathBlocked(mp) || this._connecting?.has(m.id)) return; // connect/teardown in flight
    if (m.expiresAt && Date.now() > m.expiresAt) return;             // expired — user must re-import
    const err = this._errors.get(m.id) || '';
    if (/denied|revoked|expired|AccessDenied|SignatureDoesNotMatch|self-mount|bucket-scoped|credential|log ?in|invalid_grant|unauthorized|401|403/i.test(err)) return;
    const st = this._reconnects?.get(m.id);
    if (st && Date.now() < st.nextAt) return;
    this._noteReconnectBackoff(m.id);
    const n = this._reconnects.get(m.id).attempts;
    this._errors.set(m.id, `storage disconnected — auto-reconnecting (attempt ${n})…`);
    this._notify();
    // A crashed daemon leaves a dead fuse endpoint ("Transport endpoint is
    // not connected") that blocks the fresh mount — clear it first.
    if (m.type !== 'cephfs') {
      await new Promise((res) => execFile('fusermount3', ['-uz', mp], () =>
        execFile('fusermount', ['-uz', mp], () => res())));
    }
    const ok = await this.mount(m.id).catch(() => false);
    if (ok) this._reconnects.delete(m.id); // mount() already cleared the error
  }

  _waitMounted(m, timeoutMs) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (this.isMounted(m)) return resolve(true);
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  // ── CephFS (native kernel mount; deployment-provisioned all-flash storage) ──
  async _mountCephfs(id) {
    const m = this._get(id);
    const mp = this.pathOf(m);
    try { fs.mkdirSync(mp, { recursive: true }); } catch {}
    // `sudo mount -t ceph <mons>:<path> <mp> -o name=<user>,secret=<key>,mds_namespace=<fs>`
    // Root-only, so sudo (the container has passwordless sudo). Secret rides in
    // the -o options (argv is world-readable in /proc for the ~1s the mount
    // runs — acceptable for a deployment-provisioned mount; the k8s secret is
    // the real boundary). Use secretfile? mount.ceph reads it, but writing a
    // temp keyfile is worse (persists); the option form is standard.
    const src = `${m.cephMonHosts}:${m.cephPath || '/'}`;
    const opts = `name=${m.cephUser},secret=${this._dec(m.cephSecretEnc)},mds_namespace=${m.cephFsName || 'cephfs'}${m.mode === 'ro' ? ',ro' : ''}`;
    return new Promise((resolve) => {
      execFile('sudo', ['-n', 'mount', '-t', 'ceph', src, mp, '-o', opts], { timeout: 30000 }, (err, _o, stderr) => {
        if (err || !this.isMounted(m)) {
          this._errors.set(id, ('CephFS mount failed: ' + String(stderr || err?.message || 'unknown')).slice(0, 200));
          this._notify();
          return resolve(false);
        }
        m.desired = 'mounted';
        this._errors.delete(id);
        this._save();
        this._notify();
        resolve(true);
      });
    });
  }

  /** VFS cache root — per-mount subdirs. On K8s this rides the PVC (fast,
   *  persistent — dirty write-back survives pod-level restarts). Overridable
   *  for hosts whose data dir sits on slow network storage. */
  _vfsCacheRoot() {
    return process.env.VIBESPACE_VFS_CACHE_DIR || path.join(this.dataDir, 'vfs-cache');
  }

  /** Remove a LEFTOVER mountpoint directory — only when it exists, is not a
   *  live mount, and is EMPTY (rmdir refuses non-empty; never recursive).
   *  User report: unmount / mountpoint change left empty husks behind. */
  _cleanupEmptyMountpoint(mp) {
    try {
      if (!mp || !path.isAbsolute(mp)) return;
      if (this._state.mounts.some((x) => this.pathOf(x) === mp && this.isMounted(x))) return;
      fs.rmdirSync(mp); // throws (swallowed) unless empty
    } catch {}
  }

  unmount(id, opts = {}) {
    const m = this._get(id);
    const mp = this.pathOf(m);
    // internal teardown (hang defense / reconnect cycle) must NOT rewrite the
    // user's intent — only an explicit user Unmount clears desired.
    if (!opts.internal) {
      m.desired = 'unmounted';
      this._reconnects?.delete(id);
      this._save();
    }
    const finish = (ok) => {
      // Lazy unmounts detach asynchronously — give the kernel a beat before
      // the empty-dir sweep. Internal teardowns keep the dir (auto-remount
      // re-creates it anyway, but skipping avoids churn).
      if (ok && !opts.internal) setTimeout(() => this._cleanupEmptyMountpoint(mp), 1500);
      this._notify();
      return ok;
    };
    if (m.type === 'gmail') {
      this.gmail.stop(id);
      return Promise.resolve(finish(true)); // synced .eml files stay — they're the archive
    }
    if (m.type === 'cephfs') {
      return new Promise((resolve) => {
        execFile('sudo', ['-n', 'umount', '-l', mp], () => resolve(finish(!this.isMounted(m))));
      });
    }
    return new Promise((resolve) => {
      execFile('fusermount3', ['-uz', mp], (err) => {
        if (!err) return resolve(finish(true));
        execFile('fusermount', ['-uz', mp], (err2) => {
          if (!err2) return resolve(finish(true));
          execFile('umount', ['-l', mp], () => resolve(finish(!this.isMounted(m))));
        });
      });
    });
  }

  /** Boot: adopt live mounts, re-mount anything desired-but-dead. */
  async restore() {
    for (const m of this._state.mounts) {
      if (m.desired !== 'mounted') continue;
      if (m.expiresAt && Date.now() > m.expiresAt) { this._errors.set(m.id, 'credential expired'); continue; }
      if (this.isMounted(m)) continue; // adopted — detached rclone survived
      try { await this.mount(m.id); } catch (e) { this._errors.set(m.id, String(e.message || e)); }
    }
    this._notify();
  }

  // ── My storage (env-provisioned) ──

  envStorage() {
    // Historical name — the source of truth is now the in-app config
    // (state.myStorage; env imported once at first boot, see constructor).
    const c = this.getMyStorageConfig({ redact: false });
    if (!c) return null;
    return { endpoint: c.endpoint, bucket: c.bucket, prefix: c.prefix, accessKey: c.accessKey, secretKey: c.secretKey, configured: c.configured };
  }

  addMyStorage() {
    const env = this.envStorage();
    if (!env) throw new Error('VIBESPACE_S3_* not configured');
    if (env.configured) throw new Error('My storage is already added');
    return this.add({ name: 'my-storage', origin: 'my-storage', mode: 'rw', ...env });
  }

  // ── Share links ──

  buildShareLink(share) {
    const payload = {
      name: share.name, endpoint: share.endpoint, bucket: share.bucket,
      prefix: share.prefix, mode: share.mode,
      accessKey: share.accessKey, secretKey: share.secretKey,
      sessionToken: share.sessionToken || undefined, expiresAt: share.expiresAt || undefined,
    };
    return SHARE_PREFIX + Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  static parseShareLink(link) {
    const s = String(link).trim();
    if (!s.startsWith(SHARE_PREFIX)) throw new Error('Not a VibeSpace share link');
    const payload = JSON.parse(Buffer.from(s.slice(SHARE_PREFIX.length), 'base64url').toString('utf8'));
    for (const k of ['endpoint', 'bucket', 'accessKey', 'secretKey']) {
      if (!payload[k]) throw new Error('Share link is missing ' + k);
    }
    return payload;
  }

  _rcloneSupportsAcceptEncodingFlag() {
    if (this._rcloneAEFlag !== undefined) return this._rcloneAEFlag;
    this._rcloneAEFlag = this._rcloneHasFlag('use-accept-encoding-gzip');
    return this._rcloneAEFlag;
  }

  /** Does the installed rclone know this flag? Cached probe over BOTH help
   *  outputs — `help flags` lists global/backend flags but NOT the vfs/mount
   *  flags (those only appear in `mount --help`; verified on 1.65.2). Passing
   *  an unknown flag makes rclone refuse to start at all, so gate every
   *  version-sensitive flag through this. */
  _rcloneHasFlag(flag) {
    if (this._rcloneFlagsHelp === undefined) {
      let out = '';
      for (const argv of [['help', 'flags'], ['mount', '--help']]) {
        try { out += execFileSync(this.rcloneBin(), argv, { encoding: 'utf-8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 }); } catch {}
      }
      this._rcloneFlagsHelp = out;
    }
    return this._rcloneFlagsHelp.includes(flag);
  }

  // ── Guided Google Drive OAuth (no terminal needed) ──
  // We spawn `rclone authorize "drive"` ON THE SERVER: rclone prints the
  // Google consent URL and listens on 127.0.0.1:53682 for the redirect.
  //  - Browser on the same machine as the server: the redirect lands directly
  //    and the flow completes hands-free.
  //  - Remote deployment: the redirect to 127.0.0.1 fails in the USER'S
  //    browser, but the code is in the address bar — the UI asks them to
  //    paste that URL back and we FORWARD it to rclone's local listener.
  // Either way rclone performs the token exchange itself (its own OAuth
  // client credentials) and prints the token JSON, which we capture. No
  // Google secrets to configure, no terminal.

  /** Instance-preset Google OAuth clients (admin-injected env, never persisted):
   *  VIBESPACE_GDRIVE_CLIENTS = JSON [{key, label, clientId, clientSecret}, …]
   *  Legacy single pair VIBESPACE_GDRIVE_CLIENT_ID/SECRET = preset key 'default'.
   *  A mount stores only the preset KEY (clientPreset); id/secret resolve at
   *  authorize/mount time, so rotating the env rotates every mount. */
  static drivePresets() {
    const out = [];
    try {
      const raw = process.env.VIBESPACE_GDRIVE_CLIENTS;
      if (raw) {
        for (const c of JSON.parse(raw)) {
          if (c && c.key && c.clientId && c.clientSecret) {
            out.push({ key: String(c.key), label: String(c.label || c.key), clientId: String(c.clientId), clientSecret: String(c.clientSecret) });
          }
        }
      }
    } catch (e) { console.error('[mounts] VIBESPACE_GDRIVE_CLIENTS unparseable:', e.message); }
    if (process.env.VIBESPACE_GDRIVE_CLIENT_ID && process.env.VIBESPACE_GDRIVE_CLIENT_SECRET
        && !out.some((c) => c.key === 'default')) {
      out.push({ key: 'default', label: 'Default', clientId: process.env.VIBESPACE_GDRIVE_CLIENT_ID, clientSecret: process.env.VIBESPACE_GDRIVE_CLIENT_SECRET });
    }
    return out;
  }

  /** The client a drive record should use: explicit custom client wins; else
   *  its chosen preset; else the single/first preset; else null (rclone's
   *  built-in client). */
  static _driveClient(m) {
    if (m.clientId) return null; // custom client on the record itself
    const presets = MountManager.drivePresets();
    if (m.clientPreset) return presets.find((c) => c.key === m.clientPreset) || null;
    return presets.length === 1 ? presets[0] : presets.find((c) => c.key === 'default') || null;
  }

  static _driveMode(v) {
    return ['mydrive', 'shared-with-me', 'shared-drive'].includes(v) ? (v === 'mydrive' ? null : v) : null;
  }

  /** List the Shared Drives visible to a drive credential — the picker data
   *  for driveMode:'shared-drive'. Accepts an existing record id OR a
   *  transient {token, clientId, clientSecret} (the add-dialog case, before
   *  any record exists). Runs `rclone backend drives` with the same env
   *  _rcloneFor builds. */
  listSharedDrives({ id, token, clientId, clientSecret, clientPreset } = {}) {
    let env;
    if (id) {
      const m = this._connOf(this._get(id));
      if ((m.type || 's3') !== 'drive') throw new Error('not a Google Drive record');
      ({ env } = this._rcloneFor(m));
    } else {
      if (!token) throw new Error('token required');
      let tok = String(token).trim();
      const jm = tok.match(/\{[\s\S]*\}/); if (jm) tok = jm[0];
      JSON.parse(tok); // validate
      env = { ...process.env, RCLONE_CONFIG_VS_TYPE: 'drive', RCLONE_CONFIG_VS_TOKEN: tok, RCLONE_CONFIG_VS_SCOPE: 'drive' };
      let cid = clientId, csec = clientSecret;
      if (!cid) { const pc = MountManager._driveClient({ clientPreset: clientPreset || null }); if (pc) { cid = pc.clientId; csec = pc.clientSecret; } }
      if (cid) { env.RCLONE_CONFIG_VS_CLIENT_ID = cid; if (csec) env.RCLONE_CONFIG_VS_CLIENT_SECRET = csec; }
    }
    return new Promise((resolve, reject) => {
      execFile(this.rcloneBin(), ['backend', 'drives', 'VS:'], { env, timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message || '').toString().trim().slice(0, 300)));
        try {
          const list = JSON.parse(String(stdout));
          resolve(list.map((d) => ({ id: d.id, name: d.name })));
        } catch { reject(new Error('unexpected rclone output')); }
      });
    });
  }

  _mountGmail(id) {
    const m = this._get(id);
    const dir = this.pathOf(m);
    fs.mkdirSync(dir, { recursive: true });
    this.gmail.start({
      id, dir,
      token: this._dec(m.tokenEnc),
      clientPreset: m.clientPreset || null,
      clientId: m.clientId || null,
      clientSecret: m.clientSecretEnc ? this._dec(m.clientSecretEnc) : null,
      syncCount: m.syncCount, labelIds: m.labelIds, query: m.query,
    });
    m.desired = 'mounted';
    this._errors.delete(id);
    this._save();
    this._notify();
    // learn the account email on first sync (worker fills it async)
    setTimeout(() => {
      const st = this.gmail.status(id);
      if (st?.email && !m.email) { m.email = st.email; this._save(); this._notify(); }
    }, 15000).unref?.();
    return true;
  }

  startDriveAuth({ clientId, clientSecret, clientPreset } = {}) {
    this.cancelDriveAuth();
    this._driveAuthPreset = clientPreset || null;
    // Custom OAuth client (own Google Cloud project) = positional args to
    // `rclone authorize "drive" <id> <secret>`; no explicit client → the
    // instance-default injected client (VIBESPACE_GDRIVE_CLIENT_ID/SECRET,
    // e.g. a company client set via helm) → else rclone's built-in client.
    const authArgs = ['authorize', 'drive'];
    if (!clientId) {
      const pc = MountManager._driveClient({ clientPreset: this._driveAuthPreset || null });
      if (pc) { clientId = pc.clientId; clientSecret = pc.clientSecret; }
    }
    if (clientId && clientSecret) authArgs.push(String(clientId), String(clientSecret));
    authArgs.push('--auth-no-open-browser');
    const child = spawn(this.rcloneBin(), authArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    const st = { child, url: null, token: null, error: null, buf: '', startedAt: Date.now() };
    this._driveAuth = st;
    const onData = (d) => {
      st.buf += d.toString();
      // rclone prints a LOCAL redirector URL (http://127.0.0.1:53682/auth?state=…)
      // that 302s to the real Google consent URL — resolve it server-side so a
      // user on ANOTHER machine gets a link that actually works.
      const m = st.buf.match(/http:\/\/127\.0\.0\.1:53682\/auth\?state=[\w-]+/);
      if (m && !st.localUrl) {
        st.localUrl = m[0];
        execFile('curl', ['-s', '-o', '/dev/null', '-w', '%{redirect_url}', st.localUrl], { timeout: 10000 },
          (err, stdout) => { if (!err && String(stdout).startsWith('http')) st.url = String(stdout).trim(); else st.url = st.localUrl; });
      }
      // token JSON is printed between marker lines on stdout
      const tok = st.buf.match(/--->\s*(\{[\s\S]*?\})\s*<---/);
      if (tok) { st.token = tok[1]; try { child.kill(); } catch {} }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', () => { if (!st.token && !st.error) st.error = st.error || null; });
    // safety: kill after 10 minutes
    st.timer = setTimeout(() => this.cancelDriveAuth(), 10 * 60 * 1000);
    st.timer.unref?.();
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (st.url) return resolve({ url: st.url });
        if (Date.now() - t0 > 15000) return resolve({ error: 'rclone did not produce an auth URL: ' + st.buf.slice(-200) });
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  /**
   * Re-authorize an EXISTING Drive-backed mount/credential whose token died
   * (Google invalid_grant — revoked/expired). Runs the same guided flow with
   * the mount's OWN OAuth client (if it has one; rclone's built-in otherwise)
   * so the minted token matches the client that will use it.
   */
  startDriveAuthForMount(id) {
    const m = this._connOf(this._get(id));
    let clientId, clientSecret;
    if (m.type === 'drive') {
      clientId = m.clientId || undefined;
      clientSecret = m.clientSecretEnc ? this._dec(m.clientSecretEnc) : undefined;
      if (!clientId) {
        const pc = MountManager._driveClient(m); // record's preset (or single default)
        if (pc) { clientId = pc.clientId; clientSecret = pc.clientSecret; }
      }
    } else if (m.type === 'rclone' && m.rcloneType === 'drive') {
      const p = (k) => m.paramsEnc?.[k] ? this._dec(m.paramsEnc[k]) : undefined;
      clientId = p('client_id');
      clientSecret = p('client_secret');
    } else {
      throw new Error('Not a Google Drive connection');
    }
    return this.startDriveAuth({ clientId, clientSecret });
  }

  /** Write a freshly minted token back into a Drive-backed record + remount. */
  async applyDriveToken(id, token) {
    const rec = this._get(id);
    // token may target a child's parent credential — write where the token lives
    const holder = rec.parentId ? this._get(rec.parentId) : rec;
    let tok = String(token).trim();
    const jm = tok.match(/\{[\s\S]*\}/); if (jm) tok = jm[0];
    JSON.parse(tok); // validate
    if (holder.type === 'drive') holder.tokenEnc = this._enc(tok);
    else if (holder.type === 'rclone' && holder.rcloneType === 'drive') {
      holder.paramsEnc = holder.paramsEnc || {};
      holder.paramsEnc.token = this._enc(tok);
    } else throw new Error('Not a Google Drive connection');
    this._save();
    this._notify();
    const bounce = async (m) => {
      if (this.isMounted(m) || m.desired === 'mounted') {
        try { await this.unmount(m.id); await this.mount(m.id); } catch {}
      }
    };
    if (this._kindOf(holder) === 'credential') { for (const c of this._childrenOf(holder.id)) await bounce(c); }
    else await bounce(holder);
    return holder.id;
  }

  driveAuthStatus() {
    const st = this._driveAuth;
    if (!st) return { active: false };
    return { active: !st.token, url: st.url, token: st.token, error: st.error };
  }

  /** Remote-deployment fallback: forward the pasted redirect URL to rclone's listener. */
  async forwardDriveCallback(pastedUrl) {
    const st = this._driveAuth;
    if (!st) throw new Error('no authorization in progress');
    let u;
    try { u = new URL(String(pastedUrl).trim()); } catch { throw new Error('paste the full URL from the browser address bar'); }
    if (!u.searchParams.get('code')) throw new Error('that URL has no ?code= — paste the address the browser showed AFTER approving');
    await new Promise((resolve, reject) => {
      execFile('curl', ['-fsS', '-o', '/dev/null', `http://127.0.0.1:53682${u.pathname}${u.search}`], { timeout: 20000 },
        (err, _o, stderr) => err ? reject(new Error('forward failed: ' + (stderr || err.message).slice(0, 150))) : resolve());
    });
    // token appears on rclone stdout momentarily
    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (st.token) return resolve({ token: st.token });
        if (st.error) return reject(new Error(st.error));
        if (Date.now() - t0 > 20000) return reject(new Error('rclone did not return a token: ' + st.buf.slice(-200)));
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  cancelDriveAuth() {
    const st = this._driveAuth;
    if (st) { clearTimeout(st.timer); try { st.child.kill(); } catch {} }
    this._driveAuth = null;
  }

  // ── Minting (mc service account → STS AssumeRole fallback) ──

  async mcAvailable() {
    return new Promise((resolve) => execFile('mc', ['--version'], (err) => resolve(!err)));
  }

  _sharePolicy(bucket, prefix, mode) {
    const objRes = `arn:aws:s3:::${bucket}${prefix ? '/' + prefix : ''}/*`;
    const actions = mode === 'rw'
      ? ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListMultipartUploadParts', 's3:AbortMultipartUpload']
      : ['s3:GetObject'];
    return {
      Version: '2012-10-17',
      Statement: [
        // GetBucketLocation must be condition-free — MinIO rejects s3:prefix on it
        { Effect: 'Allow', Action: ['s3:GetBucketLocation'], Resource: [`arn:aws:s3:::${bucket}`] },
        {
          Effect: 'Allow', Action: ['s3:ListBucket'],
          Resource: [`arn:aws:s3:::${bucket}`],
          ...(prefix ? { Condition: { StringLike: { 's3:prefix': [`${prefix}/*`, prefix] } } } : {}),
        },
        { Effect: 'Allow', Action: actions, Resource: [objRes] },
      ],
    };
  }

  /**
   * Mint a down-scoped credential for bucket/prefix in the given mode using
   * the OWNER credential (my-storage env or an existing mount's key).
   */
  async mintShare({ name, endpoint, bucket, prefix, mode, ownerAccessKey, ownerSecretKey, expiryDays }) {
    prefix = String(prefix || '').replace(/^\/+|\/+$/g, '');
    const policy = this._sharePolicy(bucket, prefix, mode);
    let cred, method;
    if (await this.mcAvailable()) {
      cred = await this._mintViaMc({ endpoint, ownerAccessKey, ownerSecretKey, policy, name });
      method = 'service-account';
    } else {
      cred = await this._mintViaSts({ endpoint, ownerAccessKey, ownerSecretKey, policy, expiryDays });
      method = 'sts';
    }
    const share = {
      id: 'shr-' + crypto.randomBytes(4).toString('hex'),
      name: String(name || 'share').slice(0, 60),
      endpoint, bucket, prefix, mode, method,
      accessKey: cred.accessKey,
      expiresAt: cred.expiresAt || null,
      createdAt: Date.now(),
    };
    this._state.shares.push(share);
    this._save();
    const link = this.buildShareLink({ ...share, secretKey: cred.secretKey, sessionToken: cred.sessionToken });
    return { share, link };
  }

  // Which mounts can mint an S3 share: full-credential S3 mounts (not an
  // imported down-scoped share, not a session-token STS credential).
  canShareFromMount(m) {
    m = this._connOf(m); // a child mount shares with its credential's keys
    return (m.type || 's3') === 's3' && !!m.secretKeyEnc && !m.sessionTokenEnc && m.origin !== 'imported';
  }

  async mintShareFromMount(mountId, { folder, mode, name, expiryDays }) {
    const rec = this._get(mountId);
    if (!this.canShareFromMount(rec)) throw new Error('This connection can’t create share links (only your own S3 storage can).');
    const m = this._connOf(rec);
    const prefix = [m.prefix, folder].filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
    return this.mintShare({
      name: name || m.name, endpoint: m.endpoint, bucket: m.bucket, prefix,
      mode: mode === 'rw' ? 'rw' : 'ro',
      ownerAccessKey: m.accessKey, ownerSecretKey: this._dec(m.secretKeyEnc), expiryDays,
    });
  }

  _mcEnv(endpoint, ak, sk) {
    const u = new URL(endpoint);
    return { ...process.env, MC_HOST_vsshare: `${u.protocol}//${ak}:${sk}@${u.host}` };
  }

  _mintViaMc({ endpoint, ownerAccessKey, ownerSecretKey, policy, name }) {
    const env = this._mcEnv(endpoint, ownerAccessKey, ownerSecretKey);
    const policyFile = path.join(os.tmpdir(), `vs-policy-${crypto.randomBytes(4).toString('hex')}.json`);
    fs.writeFileSync(policyFile, JSON.stringify(policy), { mode: 0o600 });
    const tryCmd = (args) => new Promise((resolve, reject) => {
      execFile('mc', args, { env }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || stdout || String(err)));
        resolve(stdout);
      });
    });
    // modern syntax first, legacy fallback
    const run = async () => {
      let out;
      try {
        out = await tryCmd(['admin', 'accesskey', 'create', 'vsshare/', '--policy', policyFile, '--name', name || 'vibespace-share', '--json']);
      } catch {
        out = await tryCmd(['admin', 'user', 'svcacct', 'add', 'vsshare', ownerAccessKey, '--policy', policyFile, '--json']);
      }
      const j = JSON.parse(out.trim().split('\n').pop());
      const accessKey = j.accessKey || j.svcaccAccessKey || j.serviceAccount?.accessKey;
      const secretKey = j.secretKey || j.svcaccSecretKey || j.serviceAccount?.secretKey;
      if (!accessKey || !secretKey) throw new Error('mc returned no credential: ' + out.slice(0, 200));
      return { accessKey, secretKey };
    };
    return run().finally(() => { try { fs.unlinkSync(policyFile); } catch {} });
  }

  // ── Direct CephFS subtree sharing (bypasses the WebDAV proxy) ──
  // Same-cluster instances mount a shared My-storage subfolder via the KERNEL
  // ceph client (full flash bandwidth) instead of relaying every byte through
  // the source instance's Node process. A cluster-side minter (ceph-mint,
  // holds ceph admin) issues a PATH-SCOPED cephx key on demand; the link
  // embeds it, the receiver adds a normal `cephfs` mount. Env-gated: absent
  // the minter, the row keeps only the WebDAV bridge.
  cephMintAvailable() { return !!(process.env.VIBESPACE_CEPHMINT_URL && process.env.VIBESPACE_CEPHMINT_TOKEN); }
  canCephShare(m) { return !!m && m.type === 'cephfs' && this.cephMintAvailable(); }

  async _mintCall(path, body) {
    const url = process.env.VIBESPACE_CEPHMINT_URL.replace(/\/+$/, '') + path;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(url, { method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.VIBESPACE_CEPHMINT_TOKEN },
        body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('mint service ' + r.status));
      return j;
    } finally { clearTimeout(t); }
  }

  /** Mint a path-scoped key for a subfolder of a cephfs mount → share link. */
  async mintCephShare(id, { subpath = '', mode = 'ro', name } = {}) {
    const m = this._get(id);
    if (!this.canCephShare(m)) throw new Error('Direct CephFS sharing is not available for this storage.');
    const base = (m.cephPath || '/').replace(/\/+$/, '');
    const rel = String(subpath || '').replace(/^\/+|\/+$/g, '');
    const full = rel ? base + '/' + rel : base;
    const minted = await this._mintCall('/mint', { path: full, mode: mode === 'rw' ? 'rw' : 'ro' });
    const shareName = name || (rel ? rel.split('/').pop() : m.name) + '-share';
    const share = {
      id: 'cs_' + crypto.randomBytes(6).toString('hex'), kind: 'cephmount',
      name: shareName, path: full, mode: minted.mode, client: minted.client, createdAt: Date.now(),
    };
    this._state.shares.push(share);
    this._save();
    const payload = {
      name: shareName, mons: minted.mons, fsName: minted.fsName, path: minted.path,
      user: minted.client, secret: minted.key, mode: minted.mode,
    };
    const link = CEPHMOUNT_PREFIX + Buffer.from(JSON.stringify(payload)).toString('base64url');
    return { link, id: share.id };
  }

  static parseCephMountLink(link) {
    const str = String(link || '').trim();
    if (!str.startsWith(CEPHMOUNT_PREFIX)) return null;
    const p = JSON.parse(Buffer.from(str.slice(CEPHMOUNT_PREFIX.length), 'base64url').toString('utf8'));
    for (const k of ['mons', 'path', 'user', 'secret']) if (!p[k]) throw new Error('malformed cephmount link');
    return p;
  }

  async revokeShare(id) {
    const share = this._state.shares.find(s => s.id === id);
    if (!share) throw new Error('share not found');
    if (share.kind === 'cephmount' && share.client && this.cephMintAvailable()) {
      await this._mintCall('/revoke', { client: share.client }).catch(() => {});
      this._state.shares = this._state.shares.filter(x => x.id !== id);
      this._save(); this._notify();
      return;
    }
    if (share.method === 'service-account') {
      // need the OWNER credential again — my-storage env is the canonical owner
      const env = this.envStorage();
      if (env && await this.mcAvailable()) {
        const mcEnv = this._mcEnv(share.endpoint, env.accessKey, env.secretKey);
        await new Promise((resolve) => {
          execFile('mc', ['admin', 'accesskey', 'rm', 'vsshare/', share.accessKey], { env: mcEnv }, (err) => {
            if (!err) return resolve();
            execFile('mc', ['admin', 'user', 'svcacct', 'rm', 'vsshare', share.accessKey], { env: mcEnv }, () => resolve());
          });
        });
      }
    }
    // STS shares just expire; either way drop the record
    this._state.shares = this._state.shares.filter(s => s.id !== id);
    this._save();
    return true;
  }

  // Minimal SigV4 signer for STS AssumeRole (no deps)
  async _mintViaSts({ endpoint, ownerAccessKey, ownerSecretKey, policy, expiryDays }) {
    const url = new URL(endpoint);
    const region = 'us-east-1';
    const duration = Math.min(Math.max(1, Number(expiryDays) || 7), 7) * 86400;
    const body = new URLSearchParams({
      Action: 'AssumeRole', Version: '2011-06-15',
      DurationSeconds: String(duration),
      Policy: JSON.stringify(policy),
      RoleArn: 'arn:minio:iam:::role/dummy', RoleSessionName: 'vibespace-share',
    }).toString();
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const service = 'sts';
    const host = url.host;
    const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const scope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n` + crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
    const kSigning = hmac(hmac(hmac(hmac('AWS4' + ownerSecretKey, dateStamp), region), service), 'aws4_request');
    const signature = hmac(kSigning, stringToSign).toString('hex');
    const auth = `AWS4-HMAC-SHA256 Credential=${ownerAccessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const res = await fetch(url.origin + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Amz-Date': amzDate, Authorization: auth },
      body,
    });
    const text = await res.text();
    if (!res.ok) throw new Error('STS AssumeRole failed: ' + text.slice(0, 300));
    const get = (tag) => (text.match(new RegExp(`<${tag}>([^<]+)</${tag}>`)) || [])[1];
    const accessKey = get('AccessKeyId'), secretKey = get('SecretAccessKey'), sessionToken = get('SessionToken');
    if (!accessKey) throw new Error('STS response missing credentials');
    const expiresAt = get('Expiration') ? Date.parse(get('Expiration')) : Date.now() + duration * 1000;
    return { accessKey, secretKey, sessionToken, expiresAt };
  }
}

module.exports = { MountManager };
