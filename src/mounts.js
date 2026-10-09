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
// At-rest encryption is THE shared primitive (src/secret-box.js, design
// §14.7): same aes-256-gcm `iv.tag.data` bytes as the former inline
// `_enc`/`_dec` (parity-pinned by scripts/test-secret-box.mjs), but the key
// is created on ENOENT ONLY — the inline `_key()` used to mint a fresh key on
// ANY read failure and silently orphan every stored ciphertext.
const { secretBox, describeJsonError } = require('./secret-box');
const { parseDriveClients } = require('./preset-layers.js');
const LIVENESS = require('./mount-liveness.js');   // lane mount-liveness: THE sweep's verdict table (PURE)
const CACHE_PLACE = require('./vfs-cache-place.js');   // lane vfs-cache-local: where the VFS cache lives + the dirty witnesses (PURE)
// The vfsMeta walk, run in a CHILD node (never the loop, never the threadpool: 164 788 files over NFS): each file judged
// by the PURE metaVerdict (PARSED — never a grep for a spelling) → one JSON summary on stdout.
const CACHE_META_CHILD = `const fs = require('fs'), path = require('path'), { metaVerdict } = require(process.argv[1]);
const dir = process.argv[2], out = { exists: false, files: 0, dirty: 0, unread: 0 };
// only a TRUE absence is 'no cache' (ENOENT under a root that exists); any other stat error, a non-dir, or an absent root
// (a mount not there yet) is UNKNOWN — exists null + the code, judged dirty (verify r1 #0)
try { const st = fs.statSync(dir); out.exists = st.isDirectory() ? true : null; if (!out.exists) out.error = 'ENOTDIR'; }
catch (e) {
  if (e.code !== 'ENOENT') { out.exists = null; out.error = e.code || 'EIO'; }
  else { try { fs.statSync(path.dirname(path.dirname(dir))); } catch (e2) { out.exists = null; out.error = 'ENOENT-root'; } }
}
const walk = (d) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { if (e.code !== 'ENOENT') out.unread++; return; }
  for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) { walk(p); continue; } if (!e.isFile()) continue;
    out.files++; let t = null; try { t = fs.readFileSync(p, 'utf8'); } catch {} const v = t == null ? 'unread' : metaVerdict(t);
    if (v === 'dirty') out.dirty++; else if (v === 'unread') out.unread++; } };
if (out.exists) walk(path.join(dir, 'vfsMeta'));
process.stdout.write(JSON.stringify(out));`;
const PROVIDERS = require('./mount-providers/index.js');   // lane dc-mount-providers: a storage provider = its row file + one list line
/** A record's storage-provider ROW (src/mount-providers/): every per-provider fact and branch is asked of it. A module
 *  function, not a method — suites call the manager's predicates on a bare `this`. */
const healthOf = (r) => (r && typeof r === 'object') ? r.health : r;   // a probe answers {health, ms} (a stub may answer the bare word)
const rowOf = (m) => PROVIDERS.rowOf(m && m.type);                 // lane cluster-presets: ONE parser for the file and the env
/** THE effective row of a record (lane mount-liveness): a CHILD mount point (parentId, no type of its own) reads its PARENT's
 *  row — a drive child resolved to the s3 default row and its daemon got `--s3-use-accept-encoding-gzip=false`. Every row
 *  read in this file goes through here (test-mount-providers' census); `x` = the manager whose records hold the parent. */
const rowFor = (x, m) => rowOf((m && !m.type && m.parentId && x?._state?.mounts?.find((r) => r.id === m.parentId)) || m);
const clusterPresets = require('./server/cluster-presets.js');              // the presets DIRECTORY's reader (the file rung, live)
const { rcloneMountArgs, rcSocketPath, LOG_ROTATE_BYTES } = require('./mount-argv.js');   // lane mount-argv-dir-cache: THE mount argv (hub + device twin)
const { ensureSocketDir } = require('./sock-path.js');

const SHARE_PREFIX = 'vibespace-share:v1:';
const CEPHMOUNT_PREFIX = 'vibespace-cephmount:v1:';

class MountManager {
  constructor({ dataDir, broadcast, getSetting }) {
    // Gmail-as-a-folder engine (2.134.0) — lazy so plain deployments pay nothing
    const { GmailSync } = require('./gmail-sync');
    this.gmail = new GmailSync({ presets: () => MountManager.drivePresets(), onProgress: () => this._notify() });
    this.dataDir = dataDir;
    this.broadcast = broadcast || (() => {});
    this._getSetting = getSetting || (() => undefined);
    this._file = path.join(dataDir, 'mounts.json');
    this._keyFile = path.join(dataDir, '.mounts-key');
    this._box = secretBox(this._keyFile);   // decision 24: mounts keeps ITS OWN key file, byte-for-byte
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
    const cephMs = this._state.mounts.find(m => m.origin === 'my-storage' && rowFor(this, m).replacesMyStorage);
    if (cephMs && cephMs.desired !== 'mounted') { cephMs.desired = 'mounted'; this._save(); }
    if (this._state._cephImportedSig === sig) return;
    const hadMyStorage = this._state.mounts.some(m => m.origin === 'my-storage');
    // A prior S3 my-storage is REPLACED by cephfs (user directive) — unmount
    // + drop it so the flash mount takes the "My storage" slot.
    if (!hadMyStorage || !this._state.mounts.some(m => m.origin === 'my-storage' && rowFor(this, m).replacesMyStorage)) {
      for (const old of this._state.mounts.filter(m => m.origin === 'my-storage' && !rowFor(this, m).replacesMyStorage)) {
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
    // Google Drive remotes import as the native `drive` type (unified); add()
    // does the param→field normalization.
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
  // we've verified end-to-end — still predates the aws-sdk-go-v2 signing
  // behavior that breaks V4 auth through Cloudflare-fronted MinIO, i.e. the
  // documented STS-safe range 1.63–1.69).
  // v1.65.2 → v1.69.3 (2.368.8, real incident): Microsoft's migrated consumer
  // OneDrive rejects 1.65.2's download path with "unauthenticated" on EVERY
  // file read while listings/uploads/token-refresh all work — A/B against the
  // live account: 1.65.2 fails, 1.69.3 and 1.75.0 both download fine.
  static RCLONE_PIN = 'v1.69.3';

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

  /** Boot self-heal: a data/bin/rclone WE installed stays at its download
   *  version forever (nothing re-runs installRclone), so a pin bump alone
   *  never reaches existing deployments — the OneDrive download breakage
   *  would have stayed broken on every box that installed 1.65.2. Only OUR
   *  install target is touched (a user's own rclone lives on PATH, never in
   *  data/bin); best-effort, never blocks boot, failure keeps the old binary. */
  maybeUpgradePinnedRclone() {
    const local = path.join(this.dataDir, 'bin', 'rclone');
    if (!fs.existsSync(local)) {
      // 2.368.9 untracked the binary from git, so an update PULL deletes the
      // copy older releases committed — reinstall it when some mount actually
      // needs rclone and the PATH has none (a user's own PATH rclone is
      // respected; we never shadow it).
      const needsRclone = this._state.mounts.some((m) => rowFor(this, m).rclone !== false);
      if (needsRclone && !this.rcloneAvailable()) {
        console.log(`[mounts] data/bin/rclone missing and no PATH rclone — installing ${MountManager.RCLONE_PIN}`);
        this.installRclone().then(
          (r) => console.log(`[mounts] rclone ${r.version} installed`),
          (e) => console.warn(`[mounts] rclone install failed: ${e.message}`));
      }
      return;
    }
    execFile(local, ['version'], { timeout: 10000 }, (err, out) => {
      const have = String(out || '').match(/rclone (v[\d.]+)/)?.[1] || null;
      if (err || !have || have === MountManager.RCLONE_PIN) return;
      console.log(`[mounts] pinned rclone ${have} → ${MountManager.RCLONE_PIN} (upgrading data/bin copy)`);
      this.installRclone().then(
        (r) => console.log(`[mounts] rclone upgraded to ${r.version}`),
        (e) => console.warn(`[mounts] rclone upgrade failed (keeping ${have}): ${e.message}`));
    });
  }

  // The former inline `_key()`/`_enc()`/`_dec()` live in src/secret-box.js
  // (design §14.7). The ciphertext format is unchanged; what changed is that a
  // key file that exists but cannot be read is now a TYPED error instead of a
  // silently minted replacement key.
  _key() { return this._box.readKey(); }
  _enc(text) { return this._box.enc(text); }
  _dec(blob) { return this._box.dec(blob); }

  _load() {
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); } catch { /* fresh */ }
    if (!Array.isArray(this._state.mounts)) this._state.mounts = [];
    if (!Array.isArray(this._state.shares)) this._state.shares = [];
    this._maybeMigrateDrive();
  }

  _save() {
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this._file);
  }

  _notify() { this.broadcast({ type: 'mounts-updated', mounts: this.list() }); }

  // ── Google Drive UNIFICATION (2.135.4) ──────────────────────────────────
  // There is ONE Google Drive. The native `drive` type IS rclone's drive
  // backend with first-class fields + guided OAuth; a `type:'rclone',
  // rcloneType:'drive'` record (rclone.conf import / custom-backend) is the
  // same thing wearing raw params. We normalize every such record to the
  // native `drive` type so users + code see a single concept.
  // the generic rclone row's record of a backend another row ADOPTS → that row's record (its adoptRecord moves the params)
  _adoptRawRclone(m) {
    const row = rowFor(this, m).rawRclone && this._adopterOf(m.rcloneType);
    if (!row) return false;
    row.adoptRecord(m, this);
    return true;
  }
  /** The providers' client cells for GET /api/mounts (`providers`) — lane dc-mount-client. */
  providers() { return PROVIDERS.clientRows(); }
  _adopterOf(rcloneType) { return PROVIDERS.rows.find((r) => r.adopts && r.adopts(rcloneType, MountManager)) || null; }

  _maybeMigrateDrive() {
    // v2 guard (2.137.1): the generic-cloud wave came AFTER _cloudUnified — a
    // fresh flag or old instances would never normalize their dropbox/box/…
    // rclone records (caught by smoke test, real-data hazard).
    if (this._state._cloudUnified2) return;
    let changed = false;
    for (const m of this._state.mounts) {
      if (this._adoptRawRclone(m)) changed = true;
    }
    this._state._cloudUnified = true;
    this._state._cloudUnified2 = true;
    if (changed) this._save();
  }


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
      syncCount: m.syncCount, labelIds: m.labelIds, query: m.query, email: m.email, groupBy: m.groupBy,
      clientSecret: m.clientSecretEnc ? this._dec(m.clientSecretEnc) : undefined,
      // webdav / vibespace
      url: m.url, vendor: m.vendor, user: m.user,
      pass: m.passEnc ? this._dec(m.passEnc) : undefined,
      bearerToken: m.bearerTokenEnc ? this._dec(m.bearerTokenEnc) : undefined,
      // sftp
      sshHost: m.sshHost, sshUser: m.sshUser, sshPort: m.sshPort, sshPath: m.sshPath, keyPath: m.keyPath,
      // generic cloud (dropbox/box/pcloud/…)
      backend: m.backend,
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

  isMounted(m, live = this._liveMounts()) {
    // a row with its own liveness (a sync worker is not a filesystem) answers itself
    const prow = rowFor(this, m);
    if (prow.isMounted) return prow.isMounted(m, this);
    // /proc/mounts escapes spaces as \040
    const p = this.pathOf(m).replace(/ /g, '\\040');
    // the row's fstype (a native KERNEL mount says its own), else fuse.rclone
    const fstypeRe = prow.fstype || /fuse\.rclone/;
    return live.split('\n').some(l => {
      const parts = l.split(' ');
      return parts[1] === p && fstypeRe.test(parts[2] || '');
    });
  }

  pathOf(m) {
    return m.customPath || path.join(this.mountBase, m.name.replace(/[^\w.-]+/g, '_'));
  }

  /** The registered storage whose mount point contains p but is NOT mounted
   *  right now, or null. A write landing there goes to the bare local
   *  directory: invisible once the storage reconnects, and the reconnect
   *  itself then fails "not empty" (real incident — a generated TASK.md
   *  recreated a whole folder tree under a disconnected OneDrive). Every
   *  server-side writer consults this before touching a path. */
  shadowedBy(p) {
    if (!p || !this._state?.mounts?.length) return null;
    const rp = String(p);
    const live = this._liveMounts();
    for (const m of this._state.mounts) {
      if (rowFor(this, m).filesystem === false || this._kindOf(m) === 'credential') continue;
      let mp; try { mp = this.pathOf(m); } catch { continue; }
      if (rp !== mp && !rp.startsWith(mp + '/')) continue;
      if (!this.isMounted(m, live)) return m;
    }
    return null;
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
    for (const k of ['remotePath', 'bucket', 'prefix', 'driveFolder', 'driveMode', 'teamDriveId', 'rootFolderId', 'clientPreset', 'sshPath']) {
      if (m[k] !== undefined && m[k] !== null) conn[k] = m[k];
    }
    if (m.extraParamsEnc) conn.extraParamsEnc = { ...p.extraParamsEnc, ...m.extraParamsEnc };
    return conn;
  }

  _sourceLabel(m) {
    m = this._connOf(m);
    const row = rowFor(this, m);
    return (row.label ? row : PROVIDERS.defaultRow).label(m, MountManager);
  }

  list() {
    return this._state.mounts.map(m => {
      const conn = this._connOf(m);
      const st = this._starting?.get(m.id);
      return {
        id: m.id, name: m.name, type: conn.type || 's3', origin: m.origin, mode: m.mode,
        kind: this._kindOf(m), parentId: m.parentId || null,
        childCount: m.parentId ? undefined : this._childrenOf(m.id).length,
        endpoint: conn.endpoint, bucket: conn.bucket, prefix: conn.prefix,
        rcloneType: conn.rcloneType, remotePath: conn.remotePath, driveFolder: conn.driveFolder,
        driveMode: conn.driveMode || rowFor(this, conn).driveModeDefault, teamDriveId: conn.teamDriveId, clientPreset: conn.clientPreset,
        ...(rowFor(this, m).listFields?.(m, this) || {}),   // a row's own list cells (Gmail's sync state)
        // secret VALUES never leave the server; keys let the edit dialog offer
        // per-parameter replacement (blank = keep) for custom rclone records
        paramKeys: (rowFor(this, conn).rawRclone && !m.parentId) ? Object.keys(conn.paramsEnc || {}) : undefined,
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
        ...((lv) => lv ? { probe: { verdict: lv.verdict, strikes: lv.strikes, lastMs: lv.lastMs } } : {})(this._liveness?.get(m.id)),   // the sweep's last verdict (lane mount-liveness)
        // A connect legitimately spends 10-25s in mount()'s window (mountpoint
        // wait + IO probe + auth probes). Without this flag EVERY client showed
        // a plain grey "Not mounted" dot the whole time, and the initiating
        // client's local row-dimming was wiped by any mounts-updated broadcast.
        connecting: this._connecting?.has(m.id) || false,
        // STARTING (2.369.213): the daemon lives, its fuse mount does not exist
        // yet — the row says what it waits for (cached files, elapsed, ceiling)
        starting: st ? { since: st.since, files: st.files, capped: st.capped, maxMin: Math.round((this._startingT || MountManager.STARTING).ceilingMs / 60e3) } : null,
        stranded: this._stranded?.get(m.id) || null,
        cache: rowFor(this, m).rclone === false || this._kindOf(m) === 'credential' ? null : this._cacheCell(m),   // lane vfs-cache-local: the row's one cache line
        createdAt: m.createdAt,
      };
    });
  }

  listShares() { return this._state.shares.map(s => ({ ...s, secretKey: undefined })); }

  // ── A STORAGE MOUNT'S OWN OAUTH CLIENT, LENT TO A CHANNEL ACCOUNT (2.369.195) ──
  // The owner typed a custom Google client (id + secret) once for Drive /
  // Gmail-as-a-folder; a Channels account (the Gmail adapter) may sign in
  // under the SAME client without anyone copying the secret by hand. Two
  // halves, split by who may see what:
  //  · `oauthClientsFor(vendor)` — the READ-ONLY list the account dialog
  //    offers: `{mountId, name, type, email, clientIdPrefix}` per top-level
  //    record holding its OWN client of that vendor (a client id AND a sealed
  //    secret). No secret, no ciphertext, not even the whole id — the route
  //    that serves it answers only the prefix.
  //  · `oauthClientIdOf(mountId, {vendor})` — SERVER-ONLY, KEY-LESS (verify
  //    r2): the mount's client ID + every refusal that needs no key (gone /
  //    no client / another vendor), nothing decrypted — what a caller asks
  //    FIRST when it can refuse on the id alone.
  //  · `oauthClientOf(mountId, {vendor})` — SERVER-ONLY: the same plus the
  //    secret DECRYPTED with `.mounts-key` (this store's key, decision 24),
  //    handed to the channels engine, which re-seals the secret under ITS
  //    key at once. No route answers it; a refusal is TYPED by `code` and
  //    never carries a value; a mount of another vendor is refused BEFORE
  //    its secret is opened (verify r1: nothing is decrypted for a body that
  //    will be refused).
  // A child mount never holds a client of its own (it resolves its parent's
  // at use time), so only top-level records are listed; a preset-backed
  // record holds no client to lend.
  static OAUTH_CLIENT_VENDOR = Object.freeze(Object.fromEntries(PROVIDERS.rows.filter((r) => r.oauth).map((r) => [r.id, r.oauth])));   // each row's `oauth` cell
  /** B-2198 (D3): a lent client's RAW-API ROW per vendor — the channel registry's one raw-API schema (`validateApi`), plus
   *  `refresh` (the token endpoint the raw API's orchestrator refreshes a mount's token at, in memory). Declared HERE, by
   *  the owner of the storage OAuth clients (the vendor map above, `oauthClientOf` / `oauthTokenOf`): the orchestrator
   *  lists a vendor's mounts as credentials only when its row is declared, and names no vendor itself. */
  static OAUTH_API = Object.freeze({
    google: Object.freeze({
      label: 'Google APIs',
      hosts: Object.freeze(['www.googleapis.com', 'gmail.googleapis.com', 'docs.googleapis.com', 'sheets.googleapis.com', 'slides.googleapis.com', 'drive.googleapis.com', 'people.googleapis.com', 'tasks.googleapis.com']),
      docs: Object.freeze(['https://developers.google.com/workspace/explore', 'https://developers.google.com/gmail/api/reference/rest']),
      readByPost: Object.freeze([/:batchGet$/]),
      sensitive: Object.freeze([/\/permissions/, /trash/i, /delete/i, /\/acl/]),   // `batchDelete` too
      refresh: 'https://oauth2.googleapis.com/token',
    }),
  });
  /** The raw-API rows of the vendors whose lent clients are credentials (`{vendor: row}`) — read by the orchestrator. */
  oauthApiRows() { return MountManager.OAUTH_API; }
  _lendsOAuthClient(m) {
    return !!(m && !m.parentId && m.origin !== 'my-storage' && MountManager.OAUTH_CLIENT_VENDOR[m.type || 's3'] && m.clientId && m.clientSecretEnc);
  }
  oauthClientsFor(vendor) {
    const v = String(vendor || '');
    if (!v) return [];
    return this._state.mounts
      .filter((m) => this._lendsOAuthClient(m) && MountManager.OAUTH_CLIENT_VENDOR[m.type] === v)
      .map((m) => ({ mountId: m.id, name: MountManager.lentName(m), type: m.type, email: m.email || null, clientIdPrefix: String(m.clientId).slice(0, 12) }));
  }
  /** A lent mount's name as a message / list may carry it: control characters
   *  stripped, capped like add()/update() cap it (verify r2: a hand-edited
   *  record's 2 000-char name with a newline forged a journal line). */
  static lentName(m) { return String((m && m.name) || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }
  /** THE KEY-LESS HALF (verify r2): every refusal that needs no key — the
   *  mount is gone / lends no client / holds another vendor's — and the
   *  client's ID, with NOTHING decrypted. `oauthClientOf` is this plus the
   *  secret; a caller that can refuse on the id alone (a sign-in's client
   *  compared by id, the registry's id rule) asks THIS first. */
  oauthClientIdOf(mountId, { vendor = null } = {}) {
    const refuse = (code, message) => { const e = new Error(message); e.code = code; return e; };
    const m = this._state.mounts.find((x) => x.id === String(mountId || ''));
    if (!m) throw refuse('mount-gone', 'that storage mount no longer exists');
    if (!this._lendsOAuthClient(m)) throw refuse('mount-no-client', `the storage mount "${MountManager.lentName(m)}" holds no custom OAuth client of its own (a preset, or no client at all)`);
    const v = MountManager.OAUTH_CLIENT_VENDOR[m.type];
    // verify r1: the vendor is judged BEFORE the secret is opened — a body naming another vendor's
    // mount is refused with nothing decrypted, and its refusal names the vendor, never the key state
    // (an undecryptable OneDrive mount in a Gmail body answered `mount-secret-undecryptable`)
    if (vendor && v !== vendor) throw refuse('mount-client-vendor', `the storage mount "${MountManager.lentName(m)}" holds a ${v} client, not a ${vendor} one`);
    return { mountId: m.id, name: MountManager.lentName(m), vendor: v, clientId: String(m.clientId), _rec: m };
  }
  oauthClientOf(mountId, { vendor = null } = {}) {
    const refuse = (code, message) => { const e = new Error(message); e.code = code; return e; };
    const { _rec: m, ...head } = this.oauthClientIdOf(mountId, { vendor });
    let clientSecret;
    try { clientSecret = this._dec(m.clientSecretEnc); }
    catch (e) { throw refuse('mount-secret-undecryptable', `the storage mount "${head.name}"'s client secret cannot be decrypted with .mounts-key (${(e && e.code) || 'decrypt-failed'})`); }
    return { ...head, clientSecret };
  }
  /** B-2198 (D3): a Google mount as a raw-API credential — SERVER-ONLY, for src/server/channel-api.js's ONE fetch site:
   *  the lent client plus the mount's OAuth token (rclone's JSON), decrypted here and never answered on a route. */
  oauthTokenOf(mountId, { vendor = 'google' } = {}) {
    const c = this.oauthClientOf(mountId, { vendor });
    const m = this._state.mounts.find((x) => x.id === c.mountId);
    let token = null;
    try { token = m && m.tokenEnc ? JSON.parse(this._dec(m.tokenEnc)) : null; } catch { token = null; }
    if (!token || typeof token !== 'object') { const e = new Error(`the storage mount "${c.name}" holds no readable OAuth token — sign it in again`); e.code = 'mount-no-token'; throw e; }
    return { ...c, token };
  }

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
        driveFolder: m.driveFolder, driveMode: m.driveMode, teamDriveId: m.teamDriveId, rootFolderId: m.rootFolderId,
        driveType: p.driveType, sshPath: m.sshPath,
      };
    }
    const out = { ...base, type: m.type || 's3' };
    rowFor(this, m).config?.(m, out, dec, this);
    if (m.extraParamsEnc) out.extraParams = Object.fromEntries(Object.entries(m.extraParamsEnc).map(([k, v]) => [k, this._dec(v)]));
    return out;
  }

  // ── CRUD ──

  add(cfg) {
    // a raw rclone cfg of a backend another row ADOPTS (ONE Google Drive, OneDrive, the cloud list) is added as that row
    const adopter = rowFor(this, cfg).rawRclone && this._adopterOf(cfg.rcloneType);
    if (adopter) cfg = adopter.fromRclone(cfg);
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
    const row = PROVIDERS.byId[type];
    if (!row || !row.create) throw new Error('unknown mount type: ' + type);
    row.create(m, cfg, this);
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
    const row = rowFor(this, p);
    if (!row.child) throw new Error(`credentials of type "${p.type}" don't support mount points yet`);
    row.child(m, cfg, p, this);
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
    // a CHILD removes the cache (up to vfsCacheMaxSizeGB, 164 788 files over NFS on the owner's box): fs.rm on the
    // libuv threadpool is the FUSE-threadpool outage class this module exists to prevent (lane vfs-cache-local)
    for (const dir of new Set([this._cacheDirOf(m), m.cacheOld].filter(Boolean))) this._dropCacheDir(m, dir, { removing: true });
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
    // D2 (docs/design-integrations-per-account.zh.md §6), held HERE and not
    // only in the storage Edit dialog: switching the OAuth client of a record
    // that holds a token IS a re-authorization — a token only works with the
    // client that minted it, so a bare PATCH that re-points the client beside
    // the old token ends in `invalid_client` at the next refresh. Refused by
    // name BEFORE anything is touched; the client lands WITH its token
    // (drive-token {token, client}, or this PATCH carrying `token`).
    this._refuseClientSwitch(m, patch);
    // Fail-FAST on an unwritable new mountpoint BEFORE touching the live
    // mount (2.227.2, user report: the failure only surfaced at reconnect,
    // leaving a half-state stuck between old and new paths). An early throw
    // keeps the mount up and the record untouched.
    if (patch.customPath !== undefined) {
      const cpNew = String(patch.customPath || '').trim();
      if (cpNew && !path.isAbsolute(cpNew)) throw new Error('Custom path must be absolute');
      if (cpNew && cpNew !== (m.customPath || '')) await this._ensureMountpointDir(cpNew);
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
    const connectionKeys = ['endpoint', 'bucket', 'prefix', 'accessKey', 'secretKey', 'sessionToken', 'rcloneType', 'remotePath', 'params', 'driveFolder', 'driveMode', 'teamDriveId', 'rootFolderId', 'token', 'clientId', 'clientPreset', 'clientSecret', 'syncCount', 'labelIds', 'query', 'groupBy', 'driveId', 'driveType', 'region', 'url', 'user', 'pass', 'bearerToken', 'sshHost', 'sshUser', 'sshPort', 'sshPath', 'keyPath', 'cephMonHosts', 'cephFsName', 'cephPath', 'cephUser', 'cephSecret'];
    if (envLocked && connectionKeys.some((k) => patch[k] !== undefined && patch[k] !== '')) {
      throw new Error('This storage is provisioned by your deployment — its connection settings can\'t be edited here (name and mount point can).');
    }
    const setIf = (k, transform = (v) => String(v)) => { if (patch[k] !== undefined && patch[k] !== '') m[k] = transform(patch[k]); };
    // A mount point under a credential owns ONLY its path — connection fields
    // live on (and are edited via) the parent credential.
    const parentType = m.parentId ? (this._get(m.parentId).type || 's3') : null;
    if (!envLocked) {
      // the row edits the record: a mount point's PARENT row its path (`updateChild`), a top-level record its own row
      const row = parentType ? PROVIDERS.rowOf(parentType) : rowFor(this, m);
      const said = parentType ? row.updateChild?.(m, patch, setIf, this) : row.update?.(m, patch, setIf, this);
      // a sync worker's scope change answers 'reseed': its state file goes (the folder is the dedup index)
      if (said === 'reseed' && row.syncStateFile) { try { fs.rmSync(path.join(this.pathOf(m), row.syncStateFile), { force: true }); } catch { } }
    }
    this._save();
    this._notify();
    // Auto-remount after an edit — a FAILED remount must reach the row (the
    // swallowed catch here was why an unwritable path change looked like a
    // successful save; no-silent-failure rule).
    if (wasMounted) {
      try { await this.mount(id); }
      catch (e) { if (!this._errors.get(id)) { this._errors.set(id, String(e.message || e)); this._notify(); } }
    }
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

  /** The OAuth client a Drive / Gmail record RESOLVES to, as an identity
   *  string — the way `_driveClient` / gmail-sync `_client` resolve it: a
   *  custom id wins (Gmail: id + secret), else the preset key, else the
   *  resolver's own fallback (the only preset, else `default`, else the
   *  built-in). The secret is NOT the identity (a rotated secret of the same
   *  client keeps its tokens). The client-side twin is sidebar-mounts
   *  `_mountClientSwitch`. */
  static _clientIdentity(type, r) {
    const presets = MountManager.drivePresets();
    const fallback = presets.length === 1 ? presets[0].key : (presets.find((p) => p.key === 'default')?.key || '');
    const custom = PROVIDERS.rowOf(type).presetClient?.idAlone ? (r.clientId || '') : (r.clientId && r.hasSecret ? r.clientId : '');
    return custom ? `custom:${custom}` : `preset:${r.clientPreset || fallback}`;
  }

  /** D2 at the server: throw `client-change-needs-reauth` when `patch`
   *  would re-point a token-holding Drive / Gmail record's client without
   *  the token minted under the new one. Mirrors update()'s own write
   *  semantics (Drive: `clientPreset` any value, `clientId` only when
   *  non-empty; Gmail: `clientPreset` only). */
  _refuseClientSwitch(m, patch) {
    const type = m.type || 's3', pc = rowFor(this, m).presetClient;
    if (!pc || m.parentId || m.origin === 'my-storage' || !m.tokenEnc) return;
    if (patch.token !== undefined && String(patch.token).trim() !== '') return; // the token lands with its client
    const cur = { clientId: m.clientId || '', clientPreset: m.clientPreset || null, hasSecret: !!m.clientSecretEnc };
    const next = { ...cur };
    if (patch.clientPreset !== undefined) next.clientPreset = patch.clientPreset ? String(patch.clientPreset) : null;
    if (pc.idAlone && patch.clientId !== undefined && patch.clientId !== '') next.clientId = String(patch.clientId);
    if (MountManager._clientIdentity(type, cur) === MountManager._clientIdentity(type, next)) return;
    const e = new Error('Switching the OAuth client needs a new sign-in — use Re-authorize (a token only works with the client that minted it; the new client is saved together with the token minted under it)');
    e.code = 'client-change-needs-reauth';
    throw e;
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
    const row = rowFor(this, m);
    remote = (row.rclone ? row : PROVIDERS.defaultRow).rclone(m, env, P, R, this);
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
    // A second connect JOINS the one in flight (2.369.213: one daemon per
    // mountpoint — it used to answer false, which the client called a failure).
    this._connecting = this._connecting || new Set();
    this._joins = this._joins || new Map();
    if (this._connecting.has(id)) return this._joins.get(id) || false;
    this._connecting.add(id);
    this._notify(); // every client shows "Connecting…" for the whole window
    const p = (async () => {
      try { return await this._mountInner(id); }
      finally { this._connecting.delete(id); this._joins.delete(id); this._notify(); }
    })();
    this._joins.set(id, p);
    return p;
  }

  async _mountInner(id, opts = {}) {
    const m = this._get(id);
    if (this.isMounted(m)) { m.desired = 'mounted'; this._save(); this._notify(); return; }
    // STARTING (2.369.213): a connect while the daemon still rebuilds its
    // cache index JOINS it — never a second daemon, never a kill.
    if (this._starting?.has(id)) return 'starting';
    // A row with its OWN mount (Gmail = a sync WORKER writing .eml files; CephFS = a native kernel mount) — not rclone.
    const prow = rowFor(this, m);
    if (prow.mount) return prow.mount(id, this);
    // A daemon ALREADY on this mountpoint with no mount yet (a server restart
    // mid-scan, a Connect after the old 5 s verdict) is ADOPTED and watched
    // like a fresh spawn: killing it restarted its scan from zero (the
    // owner's three Connect clicks at 16:52, 2026-10-04).
    let pid0 = 0;
    try { pid0 = this._daemonPids(this.pathOf(m))[0] || 0; } catch {}
    if (pid0) { m.desired = 'mounted'; this._save(); return this._watchStart(m, this.pathOf(m), pid0, opts); }
    // The row's own pre-flight (OneDrive resolves its drive through Graph; a VibeSpace bridge refuses a token THIS
    // instance minted — a self-mount deadlocks the server): `undefined` = go on, anything else is the answer.
    // a child's pre-flight runs on its parent (the record that holds the connection)
    if (prow.preMount) { const said = await prow.preMount(m.parentId ? this._get(m.parentId) : m, id, this); if (said !== undefined) return said; }
    // Credential model (user-refined): a credential IS the rclone remote (the
    // part before the colon); a mount is remote:path. A credential itself IS
    // mountable when its token can reach the remote's root (Google Drive,
    // account-wide S3 keys) — mounting it mounts the root. Bucket-scoped S3
    // tokens CAN'T list the root: the fuse mount would "succeed" and EIO on
    // every IO, so probe first and convert such records to credentials with
    // guidance instead of mounting a dead folder.
    if (!m.parentId && prow.rootMayBeDenied?.(m, MountManager) && !m.remotePath) {
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
    let dest = null;
    try { dest = await this._ensureMountpointDir(mp, { quarantine: true }); }
    catch (e) { this._errors.set(id, String(e.message || e)); this._notify(); throw e; } // mount()'s finally clears _connecting
    if (dest) this._noteStranded(m, dest);
    const { env, remote } = this._rcloneFor(m);
    // The argv is ONE PURE builder (src/mount-argv.js) over the record's EFFECTIVE row — read+write vfs cache on a
    // PERSISTENT per-mount --cache-dir (dirty writes survive a daemon crash), bounded timeouts, the row's directory
    // cache, the s3 proxy-signing flag for an s3 backend, the owner-only rc socket — every version-sensitive flag
    // gated on the installed rclone knowing it.
    const isS3 = !!rowFor(this, m).s3Backend?.(m.parentId ? this._connOf(m) : m);
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
    // Belt to unmount()'s suspenders: never STACK a daemon — if a stale one
    // still serves this mountpoint (survived a lazy detach), kill it first,
    // or the new spawn either fails or shadows a daemon that keeps failing.
    let rcQueue = null; // the outgoing daemon's LIVE dirty witness (rc vfs/queue) — asked before it is killed
    if (this._daemonAlive(mp)) {
      rcQueue = (await this._rcStats(m)).queue || { error: 'no answer' };
      console.warn(`[mounts] stale daemon still on ${mp} at mount time — killing it`);
      this._killMountDaemon(mp);
      await new Promise((r) => setTimeout(r, 300));
    }
    // WHERE the cache lives is decided HERE, at a remount, after the outgoing daemon is gone (lane vfs-cache-local)
    const cacheDir = await this._placeCache(m, rcQueue);
    const args = this._mountArgv(m, { remote, mp, cacheDir, rcSocket: this._rcSocketReady(m) });
    // detached: mounts survive server restarts (adopted on boot)
    const log = this._openMountLog(m.id);
    const child = spawn(this.rcloneBin(), args, { env, detached: true, stdio: ['ignore', log, log] });
    child.unref();
    fs.closeSync(log);
    m.desired = 'mounted';
    this._errors.delete(id);
    this._save();
    return this._watchStart(m, mp, child.pid, opts);
  }

  // ── STARTING (2.369.213, the owner's OneDrive, 2026-10-04) ──
  // rclone --vfs-cache-mode full REBUILDS its cache index (walks every cached
  // file) BEFORE it mounts: 164 788 files took 4.5 min (24 s CPU at 136 s).
  // The old fixed 5 s verdict called that "failed", unblocked the bare mount
  // point (an outside writer dropped .restore into it; rclone then died "not
  // empty"), and each Connect killed the scan before it. A live daemon with no
  // mount yet is STARTING: the path stays blocked (and shadowedBy answers the
  // record) until the fuse mount exists; only a daemon with no CPU progress
  // for 60 s, or past the ceiling, is killed. Ceiling 15 min ≈ 3× the measured
  // 164 788-file scan (the scan is ~linear in cached files).
  static STARTING = Object.freeze({ ceilingMs: 15 * 60e3, hungMs: 60e3, progressTicks: 30, pollMs: 500, quickMs: 5000, countCap: 200000 });

  /** Watch a spawned/adopted daemon until its fuse mount exists. A quick
   *  mount answers the caller with the real verdict; past quickMs the caller
   *  gets 'starting' and the watch carries on in the background. */
  async _watchStart(m, mp, pid, opts = {}) {
    const T = this._startingT || MountManager.STARTING;
    const st = { pid, since: Date.now(), files: null, capped: false };
    (this._starting = this._starting || new Map()).set(m.id, st);
    this.blockPath(mp, T.ceilingMs + 60e3); // no writer reaches the bare directory before the mount exists
    this._countCacheFiles(this._cacheDirOf(m), T.countCap)
      .then((c) => { st.files = c.n; st.capped = c.capped; this._notify(); }, () => {});
    this._notify();
    const done = this._waitMounted(m, pid)
      .then((r) => { if (r !== 'mounted') this._starting.delete(m.id); return this._startSettled(m, mp, r, opts); })
      .catch((e) => { this._errors.set(m.id, String(e.message || e)); return false; })
      .finally(() => { if (this._starting.get(m.id) === st) this._starting.delete(m.id); this._notify(); });
    return Promise.race([done, new Promise((r) => { setTimeout(() => r('starting'), T.quickMs).unref?.(); })]);
  }

  /** Wait for the fuse mount WHILE ITS DAEMON LIVES (never a fixed 5 s):
   *  'mounted' | 'died' (pid gone) | 'hung' (no CPU progress for hungMs) |
   *  'ceiling' — the last two SIGKILL it. Progress = utime+stime. */
  _waitMounted(m, pid) {
    const T = this._startingT || MountManager.STARTING;
    return new Promise((resolve) => {
      const t0 = Date.now();
      let mark = this._cpuTicks(pid), markAt = t0;
      const tick = () => {
        if (this.isMounted(m)) return resolve('mounted');
        const cpu = this._cpuTicks(pid);
        if (cpu == null) return resolve('died');
        const now = Date.now();
        if (cpu - mark >= T.progressTicks) { mark = cpu; markAt = now; }
        const verdict = now - markAt >= T.hungMs ? 'hung' : now - t0 >= T.ceilingMs ? 'ceiling' : null;
        if (verdict) { try { process.kill(pid, 'SIGKILL'); } catch {} return resolve(verdict); }
        setTimeout(tick, T.pollMs);
      };
      tick();
    });
  }

  /** utime+stime (clock ticks) of a live process; null when gone/zombie. */
  _cpuTicks(pid) {
    try {
      const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
      const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
      return (f[0] === 'Z' || f[0] === 'X') ? null : Number(f[11]) + Number(f[12]);
    } catch {
      // no /proc (non-Linux): alive = progressing, the ceiling still bounds it
      try { process.kill(pid, 0); return Math.floor(process.uptime() * 100); } catch { return null; }
    }
  }

  /** Files in a mount's VFS cache dir, counted by a CHILD `find` (never a
   *  walk on the event loop), stopped at `cap`. */
  _countCacheFiles(dir, cap) {
    return new Promise((resolve) => {
      let n = 0, done = false;
      const end = () => { if (!done) { done = true; resolve({ n: Math.min(n, cap), capped: n >= cap }); } };
      const c = spawn('find', [dir, '-type', 'f', '-printf', '.'], { stdio: ['ignore', 'pipe', 'ignore'] });
      c.stdout.on('data', (b) => { n += b.length; if (n >= cap) { try { c.kill('SIGKILL'); } catch {} end(); } });
      c.on('close', end); c.on('error', end);
    });
  }

  async _startSettled(m, mp, r, opts = {}) {
    if (r === 'mounted') {
      const ok = await this._afterMounted(m, mp);
      if (ok && m.cacheOld) this._dropCacheDir(m, m.cacheOld); // the moved-from dir goes only once the new daemon MOUNTED
      return ok;
    }
    const id = m.id;
    let tail = '';
    tail = this.tailMountLog(id, 2, { current: true }).join(' ');
    // "not empty": something wrote into the bare directory while it started —
    // isolate the strays (the connect-time stranded move) and retry ONCE
    if (r === 'died' && /is not empty/i.test(tail) && !opts.retried) {
      console.warn(`[mounts] rclone refused the non-empty mount point ${mp} — isolating the strays, retrying once`);
      return this._mountInner(id, { retried: true });
    }
    const T = this._startingT || MountManager.STARTING;
    let msg = tail || 'rclone exited before mounting';
    if (r !== 'died') {
      msg = r === 'hung'
        ? `rclone made no progress for ${Math.round(T.hungMs / 1000)} s and never mounted — stopped it; will retry`
        : `still not mounted after ${Math.round(T.ceilingMs / 60e3)} min of starting — stopped it; will retry`;
      console.warn(`[mounts] ${r} daemon on ${mp} (never mounted) — killed`);
      this._killMountDaemon(mp);
      this._noteReconnectBackoff(id);
    }
    this._errors.set(id, msg);
    this.unblockPath(mp);
    this._notify();
    return false;
  }

  /** Stray files moved aside at connect: said on the row (the move itself
   *  broadcasts the level-2 server-notice). */
  _noteStranded(m, dest) { (this._stranded = this._stranded || new Map()).set(m.id, dest); }

  /** The fuse mount exists: IO health probe, unblock, access check. */
  async _afterMounted(m, mp) {
    const id = m.id;
    // Post-mount IO health probe: a fuse mount to an UNREACHABLE backend
    // "succeeds" and then HANGS every IO — node's libuv threadpool fills with
    // stuck fs ops and the whole server stops answering (real incident: an
    // SMB mount whose host only resolves on the user's home LAN wedged a
    // deployed instance — /login took 130s, readiness failed, pod dropped
    // from the Service). Probe in a CHILD process (never node fs), and cut
    // the mount loose instead of serving a folder that would wedge us.
    // The same TWO QUESTIONS as the sweep (lane mount-liveness): a slow cold listing keeps the path blocked and says so;
    // only the table's teardown verdicts cut the mount loose (the first sweep after a mount starts from strike 0).
    const lv = await this._probeLiveness(m, mp);
    if (lv.teardown) return false;
    if (lv.verdict !== 'alive') { this._notify(); return this.isMounted(m); }
    const health = lv.health;
    this.unblockPath(mp);
    // Revoke/expiry surfacing: a fuse mount to a REVOKED share still "mounts"
    // (and a cached mountpoint `ls` lies about it), so probe the BACKEND fresh
    // — it re-auths and returns 401/403. Stay mounted (may recover; the user
    // decides) but surface the error (user-flagged: "revoke了token接受方如何提示").
    const accErr = await this._accessErrorFor(m, mp, health);
    if (accErr) this._errors.set(id, accErr);
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
  _probeMountpoint(mp, timeoutMs = 6000, verb = 'list') {
    // A killed `ls` on a FUSE mount whose daemon never answers stays in D state (request_wait_answer — measured, lane
    // mount-liveness): it only exits when the daemon answers. Never stack a second one — the held child IS the witness.
    const key = verb + ':' + mp, held = (this._heldProbes = this._heldProbes || new Map()).get(key);
    if (held) return Promise.resolve({ health: 'hung', ms: Date.now() - held.t0, held: true });
    return new Promise((resolve) => {
      const t0 = Date.now();
      const c = spawn('ls', verb === 'attr' ? ['-d', mp] : [mp], { stdio: 'ignore' });
      const t = setTimeout(() => { this._heldProbes.set(key, { t0 }); try { c.kill('SIGKILL'); } catch {} resolve({ health: 'hung', ms: Date.now() - t0 }); }, timeoutMs);
      c.on('exit', (code) => { clearTimeout(t); this._heldProbes.delete(key); resolve({ health: code === 0 ? 'ok' : 'error', ms: Date.now() - t0 }); });
      c.on('error', () => { clearTimeout(t); this._heldProbes.delete(key); resolve({ health: 'error', ms: Date.now() - t0 }); });
    });
  }
  /** Back-compat: true only when the mountpoint HANGS. */
  async _probeMountpointHung(mp, timeoutMs = 6000) { return healthOf(await this._probeMountpoint(mp, timeoutMs)) === 'hung'; }

  /** A mount whose access can be REVOKED/EXPIRE out from under us (an imported
   *  share, a VibeSpace bridge, or an STS-style expiring credential). Only
   *  these get the (heavier) backend re-auth probe — my own S3/Drive don't. */
  _revocable(m) { return m.origin === 'imported' || !!rowFor(this, m).revocable || !!m.expiresAt; }

  /** OAuth-backed mount (Drive/OneDrive/Dropbox/…): its refresh token can die
   *  out from under a HEALTHY-looking mount (revoked, password change, expiry)
   *  — the fuse dir cache keeps listings working while every download 401s,
   *  so the UI showed a fine mount whose every file open was EIO (real
   *  OneDrive incident: "unauthenticated: Unauthenticated" on every read). */
  _oauthBacked(m) {
    return !!rowFor(this, m).oauthBacked?.(m.parentId ? this._connOf(m) : m, MountManager);
  }

  /** Uncached BACKEND access probe (fresh rclone process re-auths, bypassing
   *  the fuse/dir cache that makes a mountpoint `ls` lie about a revoked
   *  token). Returns 'ok' | 'denied' | 'hung'. */
  _probeBackendAccess(m, timeoutMs = 15000) {
    let env, remote;
    try { ({ env, remote } = this._rcloneFor(m)); } catch { return Promise.resolve('ok'); }
    if (m.v2Auth) env.RCLONE_CONFIG_VS_V2_AUTH = 'true';
    const args = ['lsf', remote, '--max-depth', '1', '--retries', '1', '--low-level-retries', '1'];
    if (rowFor(this, m).s3Backend?.(m.parentId ? this._connOf(m) : m) && this._rcloneSupportsAcceptEncodingFlag()) args.push('--s3-use-accept-encoding-gzip=false');
    return new Promise((resolve) => {
      let done = false;
      const child = execFile(this.rcloneBin(), args, { env, timeout: timeoutMs },
        (err, _o, stderr) => {
          if (done) return; done = true;
          if (!err) return resolve('ok');
          const s = String(stderr || err.message || '');
          if (err.killed || /ETIMEDOUT/.test(s)) return resolve('hung');
          // "unauthenticated"/"invalid_grant"/"InvalidAuthenticationToken" are
          // the OAuth-refresh-token death phrasings (rclone onedrive / Google /
          // MS Graph) — a real OneDrive incident failed every read with
          // "unauthenticated: Unauthenticated" and matched NOTHING here.
          if (/401|403|Unauthorized|unauthenticated|invalid_grant|InvalidAuthenticationToken|AccessDenied|Access Denied|expired|Forbidden|SignatureDoesNotMatch|InvalidAccessKeyId|no longer valid/i.test(s)) return resolve('denied');
          // A NON-auth lsf failure is NOT a revocation — SMB especially fails
          // to enumerate the server root while the mounted share lists fine
          // (real report: a working NAS mount kept flashing "access denied").
          // 'unknown' → callers do not surface a scary revoked/denied banner.
          return resolve('unknown');
        });
      child.on('error', () => { if (!done) { done = true; resolve('denied'); } });
    });
  }

  /** DOWNLOAD probe (2.368.8): the OneDrive incident's failure mode passes
   *  `lsf` — listings, uploads and token refresh all worked while EVERY file
   *  download 401'd (old rclone vs Microsoft's migrated consumer drive). So a
   *  list-only probe says "ok" about a mount whose every read is EIO. Read 1
   *  byte of the first file at the root; no file there → 'unknown' (skip).
   *  Returns 'ok' | 'denied' | 'unknown'. */
  _probeBackendRead(m, timeoutMs = 20000) {
    let env, remote;
    try { ({ env, remote } = this._rcloneFor(m)); } catch { return Promise.resolve('ok'); }
    if (m.v2Auth) env.RCLONE_CONFIG_VS_V2_AUTH = 'true';
    return new Promise((resolve) => {
      execFile(this.rcloneBin(), ['lsf', remote, '--files-only', '--max-depth', '1', '--retries', '1', '--low-level-retries', '1'],
        { env, timeout: timeoutMs }, (err, out) => {
          const file = String(out || '').split('\n').filter(Boolean)[0];
          if (err || !file) return resolve('unknown'); // list handled by the access probe; no root file → can't tell
          const target = remote.endsWith(':') || remote.endsWith('/') ? remote + file : `${remote}/${file}`;
          execFile(this.rcloneBin(), ['cat', '--count', '1', target, '--retries', '1', '--low-level-retries', '2'],
            { env, timeout: timeoutMs }, (err2, _o2, stderr2) => {
              if (!err2) return resolve('ok');
              const s = String(stderr2 || err2.message || '');
              if (/401|403|Unauthorized|unauthenticated|invalid_grant|InvalidAuthenticationToken|AccessDenied|Forbidden/i.test(s)) return resolve('denied');
              return resolve('unknown');
            });
        });
    });
  }

  /** Is an rclone daemon still serving this mountpoint? A SIGKILLed/crashed
   *  daemon leaves a ZOMBIE fuse entry in /proc/mounts ("Transport endpoint
   *  is not connected") — isMounted() lies, so recovery must key off the
   *  PROCESS (same exact-argv /proc scan as _killMountDaemon). */
  _daemonAlive(mp) {
    try { return this._daemonPids(mp).length > 0; }
    catch { return true; } // no /proc (non-Linux) — can't tell, assume alive
  }

  /** Pids of the rclone daemons serving a mountpoint (exact argv); throws without /proc. */
  _daemonPids(mp) {
    const out = [];
    for (const pid of fs.readdirSync('/proc').filter(d => /^\d+$/.test(d))) {
      let argv;
      try { argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').split('\0'); } catch { continue; }
      if (argv.includes('mount') && argv.includes(mp) && /rclone/.test(argv[0] || '')) out.push(+pid);
    }
    return out;
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

  /** Gather ONE sweep's witnesses for a mounted record and apply the table's verdict (lane mount-liveness): attr =
   *  `ls -d` (liveness — answered without a backend call), list = `ls` (readiness), backend = a fresh `rclone lsf` only
   *  when the listing hung, cpu = the daemon's tick Δ across the probes (/proc reads). Children with timeouts only. */
  async _probeLiveness(m, mp) {
    const row = rowFor(this, m), P = LIVENESS.probeCell(row);
    let pid = 0;
    try { pid = row.daemon === false ? 0 : (this._daemonPids(mp)[0] || 0); } catch {}
    const cpu0 = pid ? this._cpuTicks(pid) : null;
    const st = (r) => { const x = typeof r === 'object' && r ? r : { health: r }; return { state: x.health || 'skipped', ms: x.ms || 0, held: !!x.held }; };
    const attr = st(await this._probeMountpoint(mp, P.attrMs, 'attr'));
    const list = attr.state === 'hung' ? st('skipped') : st(await this._probeMountpoint(mp, P.listMs));
    let backend = st('skipped');
    if (list.state === 'hung' && row.rclone !== false) {
      const t0 = Date.now();
      const said = await this._probeBackendAccess(m);   // ok · denied (an answer: the vendor is reachable) · hung · unknown (inconclusive)
      backend = { state: said === 'ok' ? 'ok' : said === 'denied' ? 'error' : said === 'hung' ? 'hung' : 'skipped', ms: Date.now() - t0, held: false };
    }
    const cpu1 = pid ? this._cpuTicks(pid) : null;
    const T = this._startingT || MountManager.STARTING;
    const w = { daemonAlive: true, attr, list, backend, cpuTicks: cpu0 != null && cpu1 != null ? cpu1 - cpu0 : null, progressTicks: T.progressTicks, now: Date.now() };
    const v = await this._livenessApply(m, mp, w);
    return { ...v, health: list.state };
  }

  /** Apply a verdict: the journal line + `mount-probe-ms` metric on every strike / teardown, the block, the row's words,
   *  the teardown (named cause). `list()` carries the last verdict as `probe`. */
  async _livenessApply(m, mp, w) {
    this._liveness = this._liveness || new Map();
    const v = LIVENESS.livenessStep(this._liveness.get(m.id)?.state, w, rowFor(this, m));
    this._liveness.set(m.id, { state: v.state, verdict: v.verdict, strikes: v.strikes.n, lastMs: Math.round((w.list && w.list.state !== 'skipped' ? w.list.ms : w.attr?.ms) || 0) });
    if (v.verdict === 'alive') { if (v.unblock) this.unblockPath(mp); return v; }
    console.warn(LIVENESS.verdictLine(m.id, v, w));   // the record id, never its name (the journal ring outlives a clear)
    try { global.__vsMetric?.('mount-probe-ms', Math.round((w.list?.state === 'hung' ? w.list.ms : w.attr?.ms) || 0), `mount=${m.id} verdict=${v.verdict}`); } catch {}
    if (v.blockMs) this.blockPath(mp, v.blockMs);
    const words = LIVENESS.wordsFor(v.words.key, 'en', v.words.vars);
    if (this._errors.get(m.id) !== words) { this._errors.set(m.id, words); if (!v.teardown) this._notify(); }
    if (v.teardown && v.verdict !== 'died') {
      // desired stays 'mounted' → the sweep's dead-mount branch reconnects with backoff; only a user Unmount ends supervision
      await this.unmount(m.id, { internal: true });
      this._killMountDaemon(mp);
      this._noteReconnectBackoff(m.id);
      this._notify();
    }
    return v;
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

  /** Human error for a mount whose IO is denied. The "revoked / credentials
   *  changed" wording is ONLY right for a share you IMPORTED (someone else's
   *  token can be revoked) — for a backend YOU configured (SMB/NAS, SFTP, your
   *  own S3) there is no share to revoke, so a generic "couldn't list" message
   *  avoids the misleading banner (user report: a working SMB mount). */
  _accessErrorMsg(m) {
    if (rowFor(this, m).everyFileErrors) return rowFor(this, m).everyFileErrors;
    if (m.expiresAt && Date.now() > m.expiresAt) return 'connected but access denied — this share credential has expired';
    if (m.origin === 'imported') return 'connected but access denied — the share may have been revoked or its credentials changed';
    if (this._oauthBacked(m)) return 'connected but the sign-in has expired or been revoked — listings come from cache while every file read fails; re-authorize to fix';
    return 'connected but the folder couldn’t be listed — the server may be busy or temporarily unreachable';
  }

  /** Decide whether to surface an access error, avoiding single-shot false
   *  positives (an SMB root-enumeration quirk, a transient ls hiccup on a
   *  working mount — real report). Returns:
   *    string    — surface this message
   *    null      — confirmed accessible → CLEAR any prior error
   *    undefined — inconclusive (transient/unknown) → leave state as-is  */
  async _accessErrorFor(m, mp, health) {
    if (this._revocable(m)) {
      // Imported/expiring share: a cached mountpoint ls can't see a revoked
      // token, so the fresh backend re-auth is authoritative.
      const acc = await this._probeBackendAccess(m);
      if (acc === 'denied') return this._accessErrorMsg(m);
      if (acc === 'ok') return null;
      return undefined; // hung/unknown — don't flip the banner either way
    }
    if (this._oauthBacked(m)) {
      // A dead refresh token hides behind a healthy mountpoint (dir cache
      // lists, downloads 401) — only a fresh backend probe can see it. Token
      // death is not a seconds-scale event, so probe on a slow clock instead
      // of hitting the provider every 60s sweep; probe every sweep only while
      // an auth error is already showing (so recovery clears fast) or the
      // mountpoint itself just failed.
      const now = Date.now();
      const last = (this._oauthProbeAt ??= new Map()).get(m.id) || 0;
      const showingAuthErr = /re-authorize|downloads are rejected/i.test(this._errors.get(m.id) || '');
      if (health === 'error' || showingAuthErr || now - last > 10 * 60000) {
        this._oauthProbeAt.set(m.id, now);
        const acc = await this._probeBackendAccess(m);
        if (acc === 'denied') return this._accessErrorMsg(m);
        if (acc === 'ok') {
          // Listing fine ≠ reads fine (the OneDrive incident passed lsf while
          // every download 401'd) — verify an actual 1-byte read too.
          const rd = await this._probeBackendRead(m);
          if (rd === 'denied') return 'connected but file downloads are rejected while listings work — disconnect and reconnect the mount to pick up the updated rclone; if it persists, check the account';
          if (showingAuthErr) return null; // recovered — clear it
        }
        // unknown: not proof either way — fall through to generic handling
      } else if (showingAuthErr) {
        return undefined; // keep the auth error until a probe proves otherwise
      }
    }
    if (health === 'error') {
      // User-owned backend (SMB/NAS, SFTP, own S3): a single non-zero ls is
      // NOT proof of denial. Re-probe; if it lists now it was transient, and
      // if the backend itself lists fine the ls error was a benign quirk.
      if (healthOf(await this._probeMountpoint(mp)) !== 'error') return null;
      if ((await this._probeBackendAccess(m)) === 'ok') return null;
      return this._accessErrorMsg(m); // persistently broken → honest message
    }
    return null; // healthy + not revocable → definitely fine
  }

  async _healthSweep() {
    if (this._sweepBusy) return;
    this._sweepBusy = true;
    try {
      for (const m of [...this._state.mounts]) {
        if (this._kindOf(m) === 'credential') continue;
        if (rowFor(this, m).filesystem === false) {
          // sync worker, not a filesystem — restart it if it died, skip all
          // fuse/mountpoint probing (a plain dir can't hang the pool)
          if (!this.isMounted(m) && m.desired === 'mounted') await this._maybeAutoRemount(m);
          continue;
        }
        if (!this.isMounted(m)) {
          // STARTING is not dead (2.369.213): never remount over / kill a
          // daemon that is still rebuilding its cache index.
          if (this._starting?.has(m.id)) continue;
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
        if (rowFor(this, m).daemon !== false && !this._daemonAlive(mp)) {
          this._livenessApply(m, mp, { daemonAlive: false, now: Date.now() });
          await this.unmount(m.id, { internal: true }); // clears the zombie entry
          if (m.desired === 'mounted') await this._maybeAutoRemount(m);
          this._notify();
          continue;
        }
        // THE TWO QUESTIONS (lane mount-liveness, 2026-10-09): one slow `ls` tore the owner's OneDrive down 37× in 7 days.
        // The sweep only GATHERS witnesses; src/mount-liveness.js's table decides (strike · block · teardown — no second
        // decision site). A slow listing is never a teardown; the daemon's own silence (or a wedge the backend proves) is.
        const lv = await this._probeLiveness(m, mp);
        if (lv.verdict !== 'alive') continue;
        const health = lv.health;
        {
          // Not hung. Decide whether to surface an access error with re-confirm
          // (no single-shot false positives on a working SMB/NAS mount).
          const accErr = await this._accessErrorFor(m, mp, health);
          if (accErr === undefined) {
            // inconclusive (transient/unknown) — leave the current state as-is
          } else if (accErr) {
            if (this._errors.get(m.id) !== accErr) { this._errors.set(m.id, accErr); this._notify(); }
          } else if (this._errors.has(m.id)) {
            this._errors.delete(m.id); this._notify(); // confirmed accessible — clear
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
    if (this.pathBlocked(mp) || this._connecting?.has(m.id) || this._starting?.has(m.id)) return; // connect/start/teardown in flight
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
    if (rowFor(this, m).daemon !== false) {
      await new Promise((res) => execFile('fusermount3', ['-uz', mp], () =>
        execFile('fusermount', ['-uz', mp], () => res())));
    }
    const ok = await this.mount(m.id).catch(() => false);
    if (ok) this._reconnects.delete(m.id); // mount() already cleared the error
  }

  // ── CephFS (native kernel mount; deployment-provisioned all-flash storage) ──
  // mount.ceph HARDCODES a /sbin/modprobe call and treats "command not found"
  // as FATAL (2.237.2, userW's recurring failure): images without the kmod
  // package (3.5.0 dropped it) die "sh: 1: /sbin/modprobe: not found" even
  // though the ceph module is ALREADY LOADED host-side (a container can never
  // modprobe the shared kernel anyway — on kmod-bearing images the call always
  // FAILED and mount.ceph ignored the failure; exit-127 is the only variant it
  // refuses). Ensure a no-op shim so the module state, not the image's package
  // list, decides the outcome. Idempotent; container-scoped; survives until
  // the pod is recreated, so it runs before every mount attempt.
  async _ensureModprobeShim() {
    return new Promise((resolve) => {
      execFile('sh', ['-c', 'command -v /sbin/modprobe >/dev/null 2>&1 || sudo -n sh -c \'mkdir -p /sbin && printf "#!/bin/sh\\nexit 0\\n" > /sbin/modprobe && chmod 755 /sbin/modprobe\' 2>/dev/null; true'], { timeout: 10000 }, () => resolve());
    });
  }

  /** A KERNEL mount's unmount (no fuse daemon to stop) — the cephfs row's `unmount` hook. */
  _kernelUnmount(m, mp, finish) {
    return new Promise((resolve) => {
      execFile('sudo', ['-n', 'umount', '-l', mp], () => resolve(finish(!this.isMounted(m))));
    });
  }

  async _mountCephfs(id) {
    const m = this._get(id);
    const mp = this.pathOf(m);
    await this._ensureMountpointDir(mp, { quarantine: true }); // sudo -n fallback covers root-owned parents
    await this._ensureModprobeShim(); // 3.5.0-class images lack kmod — see above
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
  /** The rclone mount argv of a record (lane mount-argv-dir-cache): its EFFECTIVE row — a child (parentId, no type)
   *  mounts its parent's backend, but its own typeless row is the s3 DEFAULT row (/mnt/gdrive_39ai_shared carried the s3
   *  flag, its parent did not), read through rowFor (lane mount-liveness: ONE resolver) — through THE builder the device twin calls too. */
  _mountArgv(m, { remote, mp, cacheDir, rcSocket = null }) {
    const conn = this._connOf(m), row = rowFor(this, m);
    return rcloneMountArgs({ row, remote, mountpoint: mp, cacheDir, s3: !!row.s3Backend?.(conn), readOnly: m.mode === 'ro',
      cacheGB: this._getSetting('mounts.vfsCacheMaxSizeGB'), hasFlag: (f) => this._rcloneHasFlag(f), rcSocket, dataDir: this.dataDir });
  }

  /** Where this mount's rc socket lives (src/mount-argv.js rcSocketPath: a LOCAL per-user dir, never the data dir,
   *  never a network filesystem). → {path, dir, via} | {path: null, why}. */
  _rcSocketPick(m) {
    return rcSocketPath({ id: m.id, dataDir: this.dataDir, xdgRuntimeDir: process.env.XDG_RUNTIME_DIR || '',
      uid: typeof process.getuid === 'function' ? process.getuid() : null, network: (d) => MountManager._onNetworkFs(d) });
  }

  /** The rc socket for a NEW daemon, or null (the mount still spawns, without rc): the dir created 0700 and verified
   *  (sock-path's ownership verdict), and a dead daemon's socket file removed — measured on v1.69.3: a socket left by
   *  a SIGKILLed daemon makes the next mount die "Failed to start remote control … address already in use". */
  _rcSocketReady(m) {
    if (!this._rcloneHasFlag('rc-addr')) return null;
    const pick = this._rcSocketPick(m);
    const v = pick.path ? ensureSocketDir(pick.dir) : { ok: false, why: pick.why };
    if (!v.ok) { console.warn(`[mounts] ${m.id}: no rc socket for this daemon — ${v.why}`); return null; }
    try { fs.unlinkSync(pick.path); } catch {}
    return pick.path;
  }

  /** Is `dir` (or its nearest existing ancestor) on a network / FUSE filesystem? statfs magic: NFS, SMB, CIFS, SMB2,
   *  FUSE (bindfs, rclone), Ceph. A unix socket there is refused. */
  static _onNetworkFs(dir) {
    const NET = new Set(CACHE_PLACE.NETWORK_FS_MAGIC);
    for (let d = dir; ; d = path.dirname(d)) {
      try { return NET.has(Number(fs.statfsSync(d).type) >>> 0); } catch {}
      if (d === path.dirname(d)) return false;
    }
  }

  /** The owner's rclone daemon, asked for its own stats over its rc socket (a SEAM: nothing in the sweep calls it
   *  yet). `core/stats` (transfers, errors, retries) + `vfs/queue` (the dirty items still to upload), each ONE
   *  `rclone rc` child bounded at `timeoutMs` — never on the loop. → {stats, queue} | {error}. */
  async _rcStats(m, timeoutMs = 2000) {
    const pick = this._rcSocketPick(m);
    if (!pick.path) return { error: pick.why };
    try { if (!(await fs.promises.stat(pick.path)).isSocket()) return { error: `${pick.path} is not a socket` }; }
    catch { return { error: `no rc socket at ${pick.path}` }; }
    const ask = (cmd) => new Promise((resolve) => {
      execFile(this.rcloneBin(), ['rc', '--unix-socket', pick.path, cmd], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, out, stderr) => {
        if (err) return resolve({ error: `${cmd}: ${err.killed ? `no answer in ${timeoutMs} ms` : String(stderr || err.message).trim().split('\n').pop()}` });
        try { resolve({ v: JSON.parse(out) }); } catch { resolve({ error: `${cmd}: not JSON` }); }
      });
    });
    const [stats, queue] = await Promise.all([ask('core/stats'), ask('vfs/queue')]);
    if (stats.error) return { error: stats.error };
    return { stats: stats.v, queue: queue.error ? { error: queue.error } : queue.v };
  }

  /** A NEW daemon's log fd: data/mount-logs/<id>.log APPENDED (it was reopened 'w' at every remount, destroying the
   *  dead daemon's last words), rotated to <id>.log.1 past LOG_ROTATE_BYTES, one marker line per spawn. */
  _openMountLog(id) {
    fs.mkdirSync(this._logDir, { recursive: true });
    const f = path.join(this._logDir, `${id}.log`);
    try { if (fs.statSync(f).size >= LOG_ROTATE_BYTES) fs.renameSync(f, f + '.1'); } catch {}
    const fd = fs.openSync(f, 'a');
    try { fs.writeSync(fd, `${MountManager.LOG_MARK} ${new Date().toISOString()}\n`); } catch {}
    return fd;
  }

  /** The last `n` lines of a mount's log — a bounded read (its last 64 KB). `current` = the newest daemon's lines
   *  only (after the last spawn marker); else the previous daemon's last words too, markers included. */
  tailMountLog(id, n = 20, { current = false } = {}) {
    let text = '';
    try {
      const fd = fs.openSync(path.join(this._logDir, `${id}.log`), 'r');
      try {
        const size = fs.fstatSync(fd).size, len = Math.min(size, 65536), b = Buffer.alloc(len);
        fs.readSync(fd, b, 0, len, size - len);
        text = b.toString('utf8');
      } finally { fs.closeSync(fd); }
    } catch { return []; }
    if (current) { const at = text.lastIndexOf(MountManager.LOG_MARK); if (at >= 0) text = text.slice(at).split('\n').slice(1).join('\n'); }
    return text.split('\n').filter((l) => l.trim()).slice(-n);
  }

  static LOG_MARK = '=== vibespace: rclone mount spawned';

  _vfsCacheRoot() {
    return process.env.VIBESPACE_VFS_CACHE_DIR || path.join(this.dataDir, 'vfs-cache');
  }

  // ── WHERE THE VFS CACHE LIVES (lane vfs-cache-local, B-4997) ── the PURE rule is src/vfs-cache-place.js; this only
  // gathers: statfs of each dir, the vfsMeta walk in a child, the outgoing daemon's rc vfs/queue. A cache MOVES only at a
  // remount whose outgoing daemon left nothing dirty — never a copy; the old dir is removed by a child after the mount.
  static CACHE_WITNESS_MS = 10 * 60e3;   // the vfsMeta walk's ceiling (164 788 files over NFS); past it ⇒ dirty (fail closed)
  static CACHE_RM_MS = 30 * 60e3;        // the old dir's removal child; killed ⇒ retried after the next mount
  static CACHE_WALK_RETRY_MS = 6 * 3600e3;   // a timed-out vfsMeta walk is retried after this, not at every reconnect

  /** The dir the record's cache uses now: its remembered m.cacheDir, else the legacy `<root>/<id>`. */
  _cacheDirOf(m) { return m.cacheDir || path.join(this._vfsCacheRoot(), m.id); }

  /** The class of the filesystem under `dir` (or its nearest existing ancestor): 'network' | 'ephemeral' | 'local' —
   *  statfs once per dir per process (list() runs at every broadcast). */
  _cacheFs(dir) {
    const memo = (this._cacheFsMemo = this._cacheFsMemo || new Map());
    if (!memo.has(dir)) memo.set(dir, CACHE_PLACE.fsClassOf(MountManager._statfsType(dir)));
    return memo.get(dir);
  }
  static _statfsType(dir) {
    for (let d = dir; ; d = path.dirname(d)) {
      try { return Number(fs.statfsSync(d).type) >>> 0; } catch {}
      if (d === path.dirname(d)) return null;
    }
  }

  /** The candidate per-mount dir: the owner's override (env, then mounts.vfsCacheRoot) — else the local home root
   *  ~/.cache/vibespace/vfs-cache (0700). `probe` = create + test the root (only at a remount, never from list()): a root
   *  that is not a writable dir carries writable:false + its code (an override is then REFUSED, verify r1 #1). */
  _cacheCandidates(m, { probe = false } = {}) {
    const ov = process.env.VIBESPACE_VFS_CACHE_DIR || String(this._getSetting('mounts.vfsCacheRoot') || '').trim();
    const root = ov || path.join(os.homedir(), '.cache', 'vibespace', 'vfs-cache');
    let writable = true, why = null;
    if (probe) {
      try {
        fs.mkdirSync(root, { recursive: true, mode: 0o700 });
        if (!fs.statSync(root).isDirectory()) throw Object.assign(new Error('not a directory'), { code: 'ENOTDIR' });
        fs.accessSync(root, fs.constants.W_OK);
      } catch (e) { writable = false; why = e.code || 'not writable'; }
    }
    return [{ dir: path.join(root, m.id), fs: this._cacheFs(root), writable, override: !!ov, root, why }];
  }

  _cacheInputs(m, probe) {
    const recordDir = this._cacheDirOf(m);
    return { recordDir, recordFs: this._cacheFs(recordDir), dataDirNetwork: this._cacheFs(this.dataDir) === 'network',
      dataDirDefault: path.join(this.dataDir, 'vfs-cache', m.id), candidates: this._cacheCandidates(m, { probe }) };
  }

  /** The crash-surviving witness: the vfsMeta walk in a child, bounded → its summary | {timedOut} | null. */
  _readCacheMeta(dir, timeoutMs = MountManager.CACHE_WITNESS_MS) {
    return new Promise((resolve) => {
      execFile(process.execPath, ['-e', CACHE_META_CHILD, require.resolve('./vfs-cache-place.js'), dir], { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (err, out) => {
        if (err) return resolve(err.killed ? { timedOut: true } : null);
        try { resolve(JSON.parse(String(out))); } catch { resolve(null); }
      });
    });
  }

  /** At a remount: the PURE rule over the gathered witnesses → the dir the new daemon gets. ONE journal line per decision. */
  async _placeCache(m, rcQueue = null) {
    const inp = this._cacheInputs(m, true);
    let p = CACHE_PLACE.cachePlacement({ ...inp, exists: true });
    if (p.needWitness) {
      // the walk is never started while the mount is down (the rel242 liveness verdict), and a walk that ran out its
      // ceiling is not repeated for CACHE_WALK_RETRY_MS — re-armed at EVERY timeout, cleared by a walk that finished
      // (verify r1 #2); both stay put, unread (fail closed)
      const memo = (this._cacheWalkFailed = this._cacheWalkFailed || new Map());
      const lv = this._liveness?.get(m.id)?.verdict;
      let meta;
      if (lv === 'unreachable' || lv === 'wedged' || lv === 'dead') meta = { exists: null, error: 'mount-' + lv };
      else if (Date.now() - (memo.get(m.id) || 0) < MountManager.CACHE_WALK_RETRY_MS) meta = { timedOut: true };
      else {
        meta = await this._readCacheMeta(inp.recordDir);
        if (meta && meta.timedOut) memo.set(m.id, Date.now()); else if (meta) memo.delete(m.id);
      }
      p = CACHE_PLACE.cachePlacement({ ...inp, exists: meta && meta.exists === false ? false : true, witness: CACHE_PLACE.dirtyWitness(meta, rcQueue) });
    }
    const prev = this._cachePlace?.get(m.id);
    (this._cachePlace = this._cachePlace || new Map()).set(m.id, p);
    if (p.move) {
      try { fs.mkdirSync(p.dir, { recursive: true, mode: 0o700 }); } catch {}
      m.cacheDir = p.dir;
      if (p.from) m.cacheOld = p.from;
      this._save();
      console.log(`[mounts] vfs cache ${m.id}: ${p.from ? `moved (clean: nothing left to upload) ${p.from} → ${p.dir} — the old dir is removed by a child once mounted` : `new cache on ${p.dir}`}`);
      return p.dir;
    }
    if (!m.cacheDir) { m.cacheDir = p.dir; this._save(); }   // the record remembers its dir (a later env change never orphans it)
    const SAY = { 'no-local': 'no writable persistent local disk to move it to', 'ephemeral-home': 'the home folder is not a persistent disk',
      dirty: `${p.items} items still uploading — moves at the next reconnect once clean`, unread: `its state could not be read (${p.code}) — not moved` };
    if (p.reason === 'override-refused') {
      const said = (this._cacheOverrideSaid = this._cacheOverrideSaid || new Set());   // once per boot per override
      if (!said.has(p.override)) { said.add(p.override); console.warn(`[mounts] vfs cache: the cache folder override ${p.override} is refused (${p.code}) — every cache stays where it is until it is fixed or cleared`); }
    } else if (SAY[p.reason] && (!prev || prev.reason !== p.reason || prev.items !== p.items || prev.code !== p.code)) {
      console.log(`[mounts] vfs cache ${m.id}: kept (${SAY[p.reason]}) ${p.dir}`);
    }
    if (!p.pendingMove && p.reason !== 'override-refused') { try { fs.mkdirSync(p.dir, { recursive: true }); } catch {} }
    return p.dir;
  }

  /** The row's cache cell: {dir, network, fs, pendingMove, why, items, code, override} — why null when nothing needs saying. */
  _cacheCell(m) {
    const dir = this._cacheDirOf(m), last = this._cachePlace?.get(m.id);
    const SAID = new Set(['no-local', 'ephemeral-home', 'override-refused']);
    if (last && last.dir === dir) {
      const why = SAID.has(last.reason) ? last.reason : last.pendingMove ? (last.reason === 'unread' ? 'unread' : 'dirty') : null;
      return { dir, network: last.network, fs: last.fs, pendingMove: !!last.pendingMove, why, items: last.items ?? null, code: last.code ?? null, override: last.override ?? null };
    }
    const p = CACHE_PLACE.cachePlacement({ ...this._cacheInputs(m, false), exists: true });
    return { dir, network: p.network, fs: p.fs, pendingMove: false, why: p.needWitness ? 'at-remount' : SAID.has(p.reason) ? p.reason : null, items: null, code: null, override: null };
  }

  /** A cache dir removed by a CHILD with a timeout (never fs.rm on the threadpool). Only a dir named after the record;
   *  never the live one unless the record itself is being removed. */
  _dropCacheDir(m, dir, { removing = false } = {}) {
    if (!dir || !path.isAbsolute(dir) || path.basename(dir) !== m.id || (!removing && dir === this._cacheDirOf(m))) return;
    execFile('rm', ['-rf', '--one-file-system', '--', dir], { timeout: MountManager.CACHE_RM_MS }, (err) => {
      console.log(`[mounts] vfs cache ${m.id}: ${err ? `old dir not removed (${err.killed ? 'timed out' : String(err.message).split('\n')[0]}) — retried after the next mount` : 'old dir removed by a child'}: ${dir}`);
      if (!err && m.cacheOld === dir && !removing) { delete m.cacheOld; this._save(); }
    });
  }

  /** Remove a LEFTOVER mountpoint directory — only when it exists, is not a
   *  live mount, and is EMPTY (rmdir refuses non-empty; never recursive).
   *  RETRY LADDER (2.227.2, user report: husks stayed behind): lazy unmounts
   *  (`fusermount -uz` / `umount -l`) detach asynchronously — the old
   *  one-shot rmdir at 1.5s raced the kernel, hit EBUSY, and the swallowed
   *  error left the husk forever. Child-process rmdir only (§2.108.3: never
   *  node fs on an ex-mountpoint). */
  _cleanupEmptyMountpoint(mp, attempt = 0) {
    if (!mp || !path.isAbsolute(mp)) return;
    if (this._state.mounts.some((x) => this.pathOf(x) === mp && this.isMounted(x))) return;
    execFile('rmdir', [mp], { timeout: 5000 }, (err, _o, stderr) => {
      if (!err) { console.log(`[mounts] removed leftover mountpoint dir ${mp}`); return; }
      const se = String(stderr || err.message || '');
      if (/no such file/i.test(se)) return;            // already gone
      if (/not empty/i.test(se)) return;               // real content — never recursive
      const delays = [3500, 10000, 30000, 60000];      // EBUSY etc: the unmount is still detaching
      if (attempt < delays.length) setTimeout(() => this._cleanupEmptyMountpoint(mp, attempt + 1), delays[attempt]).unref();
      else console.warn(`[mounts] leftover mountpoint dir not removable after retries: ${mp} (${se.trim().slice(0, 80)})`);
    });
  }

  /** Create + verify a mountpoint dir — child-process only (§2.108.3), with a
   *  NON-INTERACTIVE sudo fallback for unwritable parents (user-approved
   *  auto-escalation 2026-07-25: `sudo -n` never prompts — containers with
   *  passwordless sudo just work, everything else falls through to the honest
   *  error). Ownership is normalized to the service user so the unprivileged
   *  fuse daemon can use the dir. */
  async _ensureMountpointDir(mp, { quarantine = false } = {}) {
    const run = (cmd, args) => new Promise((resolve) =>
      execFile(cmd, args, { timeout: 8000 }, (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || (err && err.message) || '') })));
    const owner = `${typeof process.getuid === 'function' ? process.getuid() : 0}:${typeof process.getgid === 'function' ? process.getgid() : 0}`;
    let made = await run('mkdir', ['-p', mp]);
    if (!made.ok && /permission denied|not permitted/i.test(made.stderr)) {
      const su = await run('sudo', ['-n', 'mkdir', '-p', mp]);
      if (su.ok) {
        await run('sudo', ['-n', 'chown', owner, mp]);
        global.__vsEvent?.('mount-mkdir-sudo');
        made = { ok: true };
      }
    }
    if (!made.ok) {
      throw new Error(`No permission to create the mount point ${mp} — pick a writable location, or create it yourself first: sudo mkdir -p '${mp}' && sudo chown ${owner} '${mp}'`);
    }
    // Writability check catches a PRE-EXISTING root-owned dir too.
    let w = await run('test', ['-w', mp]);
    if (!w.ok) {
      const su = await run('sudo', ['-n', 'chown', owner, mp]);
      if (su.ok) { global.__vsEvent?.('mount-mkdir-sudo'); w = await run('test', ['-w', mp]); }
    }
    if (!w.ok) throw new Error(`The mount point ${mp} exists but is not writable by VibeSpace — fix ownership: sudo chown ${owner} '${mp}'`);
    if (!quarantine) return null;
    // Leftovers under an UNMOUNTED mount point are STRANDED writes: something
    // wrote into the bare directory while the storage was down. rclone
    // refuses "not empty" (and --allow-non-empty would only hide them under
    // the mount), so move the directory aside as a sibling — never delete,
    // never merge — and tell the user where it went. A dead fuse endpoint
    // makes `ls` fail/time out ⇒ falls through to the stale-daemon kill.
    const ls = await run('ls', ['-A', mp]);
    const names = ls.ok ? ls.stdout.split('\n').filter(Boolean) : [];
    if (!names.length) return null;
    const dest = `${mp}.stranded-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)}`;
    let mv = await run('mv', [mp, dest]);
    if (!mv.ok) mv = await run('sudo', ['-n', 'mv', mp, dest]);
    if (!mv.ok) throw new Error(`The mount point ${mp} is not empty (${names.slice(0, 5).join(', ')}${names.length > 5 ? ', …' : ''}) — these were written while the storage was disconnected; move them away, then reconnect`);
    const re = await run('mkdir', ['-p', mp]);
    if (!re.ok) throw new Error(`Moved stranded files to ${dest} but could not recreate the mount point ${mp}: ${re.stderr}`);
    const text = `${mp} held ${names.length} item${names.length === 1 ? '' : 's'} written while the storage was disconnected (${names.slice(0, 5).join(', ')}${names.length > 5 ? ', …' : ''}) — moved to ${dest}. Nothing was deleted; merge them into the storage yourself.`;
    console.warn(`[mounts] stranded content quarantined: ${text}`);
    global.__vsEvent?.('mount-stranded-quarantine');
    this.broadcast({ type: 'server-notice', key: `mount-stranded:${dest}`, text, level: 2 });
    return dest;
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
    const urow = rowFor(this, m);   // a row with its own unmount (a sync worker stops; a kernel mount umounts)
    if (urow.unmount) return urow.unmount(m, id, mp, finish, this);
    return new Promise((resolve) => {
      // A lazy detach can leave the DAEMON alive: an EIO-wedged rclone (dead
      // OAuth token, VFS waiters stuck) survives `fusermount -uz`, and the
      // next mount() then stacks a fresh daemon on top while the old one
      // keeps failing every read (real OneDrive incident — the re-auth bounce
      // looked like it worked and changed nothing; 4 leaked daemons found).
      // Unmount is NOT done until the daemon is gone: wait briefly for a
      // clean exit, then kill by exact argv. This must complete BEFORE the
      // promise resolves — bounce callers mount() right after, and a kill
      // fired later would murder the fresh daemon instead.
      const ensureDaemonGone = async (ok) => {
        for (let i = 0; i < 8 && this._daemonAlive(mp); i++) await new Promise((r) => setTimeout(r, 500));
        if (this._daemonAlive(mp)) {
          console.warn(`[mounts] daemon survived lazy unmount of ${mp} — killing it`);
          this._killMountDaemon(mp);
          await new Promise((r) => setTimeout(r, 300));
        }
        resolve(finish(ok));
      };
      execFile('fusermount3', ['-uz', mp], (err) => {
        if (!err) return ensureDaemonGone(true);
        execFile('fusermount', ['-uz', mp], (err2) => {
          if (!err2) return ensureDaemonGone(true);
          execFile('umount', ['-l', mp], () => ensureDaemonGone(!this.isMounted(m)));
        });
      });
    });
  }

  /** Boot: adopt live mounts, re-mount anything desired-but-dead. */
  async restore() {
    this.maybeUpgradePinnedRclone(); // async, best-effort — see the pin note
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

  /** Instance-preset Google OAuth clients (admin-provided, never persisted).
   *  lane cluster-presets (B-53fe): FIRST the presets DIRECTORY's
   *  `gdrive-clients.json` (ONE cluster Secret every pod mounts, the release's
   *  `override/` merged over it per key, re-read live when the kubelet swaps
   *  `..data` — src/server/cluster-presets.js); the env is the FALLBACK rung
   *  for an instance whose directory says nothing about Google clients:
   *  VIBESPACE_GDRIVE_CLIENTS = JSON [{key, label, clientId, clientSecret}, …]
   *  Legacy single pair VIBESPACE_GDRIVE_CLIENT_ID/SECRET = preset key 'default'.
   *  A mount stores only the preset KEY (clientPreset); id/secret resolve at
   *  authorize/mount time, so rotating the presets rotates every mount (a
   *  live rclone mount picks a rotated secret up at its next (re)mount). */
  static drivePresets() {
    const fromFile = clusterPresets.sharedPresets().entries('gdrive');
    if (fromFile) return fromFile;
    return MountManager._envDrivePresets();
  }
  /** The env rung: the rule the env has always been read with (src/preset-layers.js parseDriveClients). */
  static _envDrivePresets() {
    let out = [];
    try {
      const raw = process.env.VIBESPACE_GDRIVE_CLIENTS;
      if (raw) out = parseDriveClients(JSON.parse(raw));
    } catch (e) { console.error('[mounts] VIBESPACE_GDRIVE_CLIENTS unparseable:', describeJsonError(e)); } // never `e.message`: V8 quotes the bytes around the error (a client secret's tail)
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
      if (!rowFor(this, m).sharedDrives) throw new Error('not a Google Drive record');
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

  /** Labels picker data — by existing record id (decrypt its creds) or a
   *  transient token from the add dialog. */
  listGmailLabels({ id, token, clientId, clientSecret, clientPreset } = {}) {
    if (id) {
      const m = this._get(id);
      if (!rowFor(this, m).labels) throw new Error('not a Gmail record');
      return this.gmail.listLabels({
        token: this._dec(m.tokenEnc),
        clientPreset: m.clientPreset || null,
        clientId: m.clientId || null,
        clientSecret: m.clientSecretEnc ? this._dec(m.clientSecretEnc) : null,
      });
    }
    if (!token) throw new Error('token required');
    return this.gmail.listLabels({ token: String(token).trim(), clientId, clientSecret, clientPreset });
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
      syncCount: m.syncCount, labelIds: m.labelIds, query: m.query, groupBy: m.groupBy,
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

  // OAuth cloud backends that authorize through rclone's loopback flow — the
  // union of "native type" (drive/onedrive) and the generic friendly layer.
  static OAUTH_BACKENDS = ['drive', 'onedrive', 'dropbox', 'box', 'pcloud', 'yandex', 'premiumizeme', 'sharefile', 'hidrive', 'jottacloud'];

  // Generic friendly layer (2.137.1, B-2bbf): OAuth clouds that need nothing
  // beyond a token + optional folder. One `cloud` record type + this registry
  // covers them all — adding a provider is ONE line here + one UI option.
  static CLOUD_BACKENDS = {
    dropbox: { label: 'Dropbox' },
    box: { label: 'Box' },
    pcloud: { label: 'pCloud' },
    yandex: { label: 'Yandex Disk' },
    jottacloud: { label: 'Jottacloud' },
    hidrive: { label: 'HiDrive' },
  };

  // A server restart mid-auth orphans the non-detached `rclone authorize`
  // child (idle until the OAuth callback → no SIGPIPE) still holding the fixed
  // loopback port 53682 — every later auth then fails to bind and dies with
  // "did not produce an auth URL" until someone kills it by hand. Sweep
  // leftovers by exact /proc cmdline match (the _killMountDaemon pattern)
  // before each spawn; our own live child is nulled by cancelDriveAuth first.
  _killOrphanAuthorize() {
    try {
      for (const pid of fs.readdirSync('/proc').filter(d => /^\d+$/.test(d))) {
        let argv;
        try { argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').split('\0'); } catch { continue; }
        if (argv.includes('authorize') && /rclone/.test(argv[0] || '')) {
          try { process.kill(+pid, 'SIGKILL'); } catch {}
        }
      }
    } catch {} // non-Linux: no /proc — the orphan clears with the machine
  }

  startDriveAuth({ backend = 'drive', clientId, clientSecret, clientPreset } = {}) {
    this.cancelDriveAuth();
    this._killOrphanAuthorize();
    this._driveAuthPreset = clientPreset || null;
    // `rclone authorize "<backend>" [<id> <secret>]`. For drive, no explicit
    // client falls back to the instance-preset client (VIBESPACE_GDRIVE_*);
    // other backends use their own custom client or rclone's built-in.
    const authArgs = ['authorize', backend];
    if (!clientId && PROVIDERS.rows.some((r) => r.rcloneType === backend && r.presetClient)) {   // the backend's row resolves preset clients
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
    const row = rowFor(this, m);   // the row says which client re-signs it in (its own, a preset, rclone's)
    if (!row.reauthClient) throw new Error('Not an OAuth cloud connection');
    return this.startDriveAuth(row.reauthClient(m, this));
  }

  /** Write a freshly minted token back into a Drive-backed record + remount. */
  // rclone's onedrive backend REFUSES to create the fs without drive_id +
  // drive_type in config (the cryptic "if you are upgrading from older
  // versions of rclone" error) — its interactive `rclone config` resolves
  // them via Microsoft Graph, so our guided flow must do the same (2.268.8,
  // real local report: every FRESH native OneDrive add failed at first
  // connect; imported rclone.conf records only worked because the conf
  // already carried both).
  static GRAPH_BASE = { global: 'https://graph.microsoft.com', us: 'https://graph.microsoft.us', de: 'https://graph.microsoft.de', cn: 'https://microsoftgraph.chinacloudapi.cn' };
  async _resolveOneDriveDrive(m) {
    let tok;
    try { tok = JSON.parse(this._dec(m.tokenEnc)); } catch { throw new Error('OneDrive token unreadable — re-run the sign-in'); }
    const base = MountManager.GRAPH_BASE[m.region || 'global'] || MountManager.GRAPH_BASE.global;
    const r = await fetch(base + '/v1.0/me/drive', { headers: { Authorization: `Bearer ${tok.access_token || ''}` }, signal: AbortSignal.timeout(15000) });
    if (r.status === 401) throw new Error('OneDrive token expired before the drive could be resolved — sign in again ("Re-authorize OneDrive…" in the edit dialog)');
    if (!r.ok) throw new Error(`OneDrive drive lookup failed (HTTP ${r.status})`);
    const d = await r.json().catch(() => null);
    if (!d?.id) throw new Error('OneDrive drive lookup returned no drive id');
    m.driveId = String(d.id);
    m.driveType = d.driveType || m.driveType || 'personal';
  }

  //
  // `client` (D2 of docs/design-integrations-per-account.zh.md — switching a
  // record's OAuth client IS a re-authorization): the client the token was
  // minted under, `{clientPreset}` or `{clientId, clientSecret}`, written
  // TOGETHER with the token so a record never holds a new client beside the
  // old token (the silent edit that ended in `invalid_client` at the next
  // refresh). Google Drive records only — Gmail's switch lands through its
  // PATCH, which already writes the preset and the token in one save. The
  // two forms exclude each other because the custom id wins at resolve
  // (`_driveClient`): a preset beside a leftover custom id would mint under
  // the preset and refresh under the custom client.
  async applyDriveToken(id, token, client = null) {
    const rec = this._get(id);
    // token may target a child's parent credential — write where the token lives
    const holder = rec.parentId ? this._get(rec.parentId) : rec;
    let tok = String(token).trim();
    const jm = tok.match(/\{[\s\S]*\}/); if (jm) tok = jm[0];
    JSON.parse(tok); // validate
    // The client must NAME itself (integrations r1): `{clientPreset:'<k>'}`,
    // `{clientPreset:''}` (= the built-in, chosen explicitly) or
    // `{clientId, clientSecret}`. An object naming neither (`{}`, a secret
    // alone) or a non-object used to read as "built-in" / be ignored — a
    // caller that dropped the field by mistake silently downgraded the
    // record beside a token minted elsewhere.
    if (client != null && (typeof client !== 'object' || Array.isArray(client)
        || (!Object.prototype.hasOwnProperty.call(client, 'clientPreset') && !String(client.clientId || '').trim()))) {
      throw new Error('client must name a preset ("" = built-in) or a custom id + secret');
    }
    if (client && typeof client === 'object') {
      if (!rowFor(this, holder).presetClient?.reauthSwitch) throw new Error('Switching the OAuth client with a new sign-in is only for Google Drive records');
      const cid = String(client.clientId || '').trim();
      if (cid && !client.clientSecret) throw new Error('A custom OAuth client needs its client secret too');
      if (cid) { holder.clientId = cid; holder.clientSecretEnc = this._enc(String(client.clientSecret)); holder.clientPreset = null; }
      else { holder.clientPreset = client.clientPreset ? String(client.clientPreset) : null; holder.clientId = null; holder.clientSecretEnc = null; }
    }
    // OneDrive + generic cloud backends re-auth through the same dialog —
    // rejecting them here left the edit-dialog button dead for those types.
    const hrow = rowFor(this, holder);   // the row stores the token where its record keeps it
    if (!hrow.writeToken) throw new Error('Not an OAuth cloud connection');
    hrow.writeToken(holder, tok, this);
    this._save();
    this._notify();
    if (hrow.afterToken) await hrow.afterToken(holder, this);   // the row's follow-up (OneDrive resolves its drive now)
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
    return !!rowFor(this, m).s3Share && !!m.secretKeyEnc && !m.sessionTokenEnc && m.origin !== 'imported';
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
  canCephShare(m) { return !!m && !!rowFor(this, m).cephShare && this.cephMintAvailable(); }

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

module.exports = { MountManager, rowFor };
