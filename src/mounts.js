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

class MountManager {
  constructor({ dataDir, broadcast }) {
    this.dataDir = dataDir;
    this.broadcast = broadcast || (() => {});
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
    if (this._state.myStorage) return;
    const e = process.env;
    if (!e.VIBESPACE_S3_ENDPOINT || !e.VIBESPACE_S3_BUCKET || !e.VIBESPACE_S3_ACCESS_KEY) return;
    this._state.myStorage = {
      endpoint: e.VIBESPACE_S3_ENDPOINT,
      bucket: e.VIBESPACE_S3_BUCKET,
      prefix: e.VIBESPACE_S3_PREFIX || '',
      accessKey: e.VIBESPACE_S3_ACCESS_KEY,
      secretKeyEnc: this._enc(e.VIBESPACE_S3_SECRET_KEY || ''),
      importedFromEnv: true,
      updatedAt: Date.now(),
    };
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

  // ── rclone binary resolution + one-click install ──
  // Non-engineers shouldn't need a terminal: if rclone isn't on PATH we can
  // download the official static binary into data/bin (pinned to a version
  // we've verified end-to-end — also predates the aws-sdk-go-v2 signing
  // behavior that breaks V4 auth through Cloudflare-fronted MinIO).
  static RCLONE_PIN = 'v1.65.2';

  rcloneBin() {
    const local = path.join(this.dataDir, 'bin', 'rclone');
    if (fs.existsSync(local)) return local;
    return 'rclone'; // PATH
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
      customPath: m.customPath, expiresAt: m.expiresAt,
      // s3
      endpoint: m.endpoint, bucket: m.bucket, prefix: m.prefix,
      accessKey: m.accessKey,
      secretKey: m.secretKeyEnc ? this._dec(m.secretKeyEnc) : undefined,
      sessionToken: m.sessionTokenEnc ? this._dec(m.sessionTokenEnc) : undefined,
      // drive
      token: m.tokenEnc ? this._dec(m.tokenEnc) : undefined,
      driveFolder: m.driveFolder, clientId: m.clientId,
      clientSecret: m.clientSecretEnc ? this._dec(m.clientSecretEnc) : undefined,
      // webdav / vibespace
      url: m.url, vendor: m.vendor, user: m.user,
      pass: m.passEnc ? this._dec(m.passEnc) : undefined,
      bearerToken: m.bearerTokenEnc ? this._dec(m.bearerTokenEnc) : undefined,
      // sftp
      sshHost: m.sshHost, sshUser: m.sshUser, sshPort: m.sshPort, sshPath: m.sshPath, keyPath: m.keyPath,
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
    for (const m of bundle.mounts) {
      if (this._state.mounts.some(x => x.name === m.name)) continue; // skip dupes
      try { this.add(m); } catch {}
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
    // /proc/mounts escapes spaces as \040
    const p = this.pathOf(m).replace(/ /g, '\\040');
    return this._liveMounts().split('\n').some(l => {
      const parts = l.split(' ');
      return parts[1] === p && /fuse\.rclone/.test(parts[2] || '');
    });
  }

  pathOf(m) {
    return m.customPath || path.join(this.mountBase, m.name.replace(/[^\w.-]+/g, '_'));
  }

  _sourceLabel(m) {
    switch (m.type || 's3') {
      case 'drive': return 'Google Drive' + (m.driveFolder ? `: ${m.driveFolder}` : '');
      case 'webdav': return m.url;
      case 'vibespace': return m.url;
      case 'sftp': return `${m.sshUser}@${m.sshHost}:${m.sshPath || '~'}`;
      default: return `${m.bucket}${m.prefix ? '/' + m.prefix : ''} @ ${m.endpoint}`;
    }
  }

  list() {
    return this._state.mounts.map(m => ({
      id: m.id, name: m.name, type: m.type || 's3', origin: m.origin, mode: m.mode,
      endpoint: m.endpoint, bucket: m.bucket, prefix: m.prefix,
      source: this._sourceLabel(m),
      path: this.pathOf(m), desired: m.desired, expiresAt: m.expiresAt || null,
      mounted: this.isMounted(m), error: this._errors.get(m.id) || null,
      createdAt: m.createdAt,
    }));
  }

  listShares() { return this._state.shares.map(s => ({ ...s, secretKey: undefined })); }

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
          clientId: cfg.clientId || null,
          clientSecretEnc: cfg.clientSecret ? this._enc(cfg.clientSecret) : null,
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
      default: throw new Error('unknown mount type: ' + type);
    }
    this._state.mounts.push(m);
    this._save();
    this._notify();
    return m.id;
  }

  async remove(id) {
    const m = this._get(id);
    if (this.isMounted(m)) await this.unmount(id);
    this._state.mounts = this._state.mounts.filter(x => x.id !== id);
    this._errors.delete(id);
    this._save();
    this._notify();
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
    const R = 'VS';
    const P = (k) => `RCLONE_CONFIG_${R}_${k}`;
    const env = { ...process.env };
    let remote;
    switch (m.type || 's3') {
      case 'drive': {
        env[P('TYPE')] = 'drive';
        env[P('TOKEN')] = this._dec(m.tokenEnc);
        env[P('SCOPE')] = 'drive';
        if (m.clientId) env[P('CLIENT_ID')] = m.clientId;
        if (m.clientSecretEnc) env[P('CLIENT_SECRET')] = this._dec(m.clientSecretEnc);
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
    return { env, remote };
  }

  async mount(id) {
    const m = this._get(id);
    if (this.isMounted(m)) { m.desired = 'mounted'; this._save(); this._notify(); return; }
    const mp = this.pathOf(m);
    fs.mkdirSync(mp, { recursive: true });
    fs.mkdirSync(this._logDir, { recursive: true });
    const { env, remote } = this._rcloneFor(m);
    const log = fs.openSync(path.join(this._logDir, `${m.id}.log`), 'w');
    const args = ['mount', remote, mp,
      '--vfs-cache-mode', 'writes',
      '--dir-cache-time', '30s',
      '--log-level', 'INFO'];
    // Proxy-safe signing: old aws-sdk-go signs Accept-Encoding into the V4
    // signature and CDN proxies (Cloudflare) rewrite that header on plain
    // object GETs → SignatureDoesNotMatch on every read (silent retry loop
    // that looks like a hang; list/put unaffected because query-string
    // requests pass untouched). rclone ≥1.63 has a flag that stops sending/
    // signing it — add it whenever the installed rclone supports it.
    const isS3 = (m.type || 's3') === 's3';
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
    // rclone daemonizes the fuse mount asynchronously — poll up to 5s
    const ok = await this._waitMounted(m, 5000);
    if (!ok) {
      let tail = '';
      try { tail = fs.readFileSync(path.join(this._logDir, `${m.id}.log`), 'utf-8').trim().split('\n').slice(-2).join(' '); } catch {}
      this._errors.set(id, tail || 'mount did not appear within 5s');
    }
    this._notify();
    return this.isMounted(m);
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

  unmount(id) {
    const m = this._get(id);
    const mp = this.pathOf(m);
    m.desired = 'unmounted';
    this._save();
    return new Promise((resolve) => {
      execFile('fusermount3', ['-uz', mp], (err) => {
        if (!err) { this._notify(); return resolve(true); }
        execFile('fusermount', ['-uz', mp], (err2) => {
          if (!err2) { this._notify(); return resolve(true); }
          execFile('umount', ['-l', mp], () => { this._notify(); resolve(!this.isMounted(m)); });
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
    try {
      const out = execFileSync(this.rcloneBin(), ['help', 'flags'], { encoding: 'utf-8', timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
      this._rcloneAEFlag = out.includes('use-accept-encoding-gzip');
    } catch { this._rcloneAEFlag = false; }
    return this._rcloneAEFlag;
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

  startDriveAuth() {
    this.cancelDriveAuth();
    const child = spawn(this.rcloneBin(), ['authorize', 'drive', '--auth-no-open-browser'], { stdio: ['ignore', 'pipe', 'pipe'] });
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

  async revokeShare(id) {
    const share = this._state.shares.find(s => s.id === id);
    if (!share) throw new Error('share not found');
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
