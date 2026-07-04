/**
 * MountManager — rclone-backed S3 mounts + share minting (collaboration P1).
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
      name: m.name, origin: m.origin, mode: m.mode,
      endpoint: m.endpoint, bucket: m.bucket, prefix: m.prefix,
      accessKey: m.accessKey, secretKey: this._dec(m.secretKeyEnc),
      sessionToken: m.sessionTokenEnc ? this._dec(m.sessionTokenEnc) : null,
      customPath: m.customPath, expiresAt: m.expiresAt,
    }));
    return { mounts, shares: this._state.shares };
  }

  importBundle(bundle) {
    if (!bundle || !Array.isArray(bundle.mounts)) return;
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

  list() {
    return this._state.mounts.map(m => ({
      id: m.id, name: m.name, origin: m.origin, mode: m.mode,
      endpoint: m.endpoint, bucket: m.bucket, prefix: m.prefix,
      path: this.pathOf(m), desired: m.desired, expiresAt: m.expiresAt || null,
      mounted: this.isMounted(m), error: this._errors.get(m.id) || null,
      createdAt: m.createdAt,
    }));
  }

  listShares() { return this._state.shares.map(s => ({ ...s, secretKey: undefined })); }

  // ── CRUD ──

  add(cfg) {
    const required = ['name', 'endpoint', 'bucket', 'accessKey', 'secretKey'];
    for (const k of required) if (!cfg[k]) throw new Error(`${k} required`);
    if (this._state.mounts.some(m => m.name === cfg.name)) throw new Error('A mount with that name exists');
    if (cfg.customPath && !path.isAbsolute(cfg.customPath)) throw new Error('Custom path must be absolute');
    const m = {
      id: 'mnt-' + crypto.randomBytes(5).toString('hex'),
      name: String(cfg.name).slice(0, 60),
      origin: cfg.origin || 'manual',
      mode: cfg.mode === 'ro' ? 'ro' : 'rw',
      endpoint: String(cfg.endpoint),
      bucket: String(cfg.bucket),
      prefix: String(cfg.prefix || '').replace(/^\/+|\/+$/g, ''),
      accessKey: String(cfg.accessKey),
      secretKeyEnc: this._enc(cfg.secretKey),
      sessionTokenEnc: cfg.sessionToken ? this._enc(cfg.sessionToken) : null,
      customPath: cfg.customPath || null,
      expiresAt: cfg.expiresAt || null,
      desired: 'unmounted',
      createdAt: Date.now(),
    };
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

  async mount(id) {
    const m = this._get(id);
    if (this.isMounted(m)) { m.desired = 'mounted'; this._save(); this._notify(); return; }
    const mp = this.pathOf(m);
    fs.mkdirSync(mp, { recursive: true });
    fs.mkdirSync(this._logDir, { recursive: true });
    const R = 'VS'; // rclone remote name (env-config)
    const env = {
      ...process.env,
      [`RCLONE_CONFIG_${R}_TYPE`]: 's3',
      [`RCLONE_CONFIG_${R}_PROVIDER`]: 'Other',
      [`RCLONE_CONFIG_${R}_ENDPOINT`]: m.endpoint,
      [`RCLONE_CONFIG_${R}_ACCESS_KEY_ID`]: m.accessKey,
      [`RCLONE_CONFIG_${R}_SECRET_ACCESS_KEY`]: this._dec(m.secretKeyEnc),
      [`RCLONE_CONFIG_${R}_FORCE_PATH_STYLE`]: 'true',
      [`RCLONE_CONFIG_${R}_NO_CHECK_BUCKET`]: 'true',
    };
    if (m.sessionTokenEnc) env[`RCLONE_CONFIG_${R}_SESSION_TOKEN`] = this._dec(m.sessionTokenEnc);
    const remote = `${R}:${m.bucket}${m.prefix ? '/' + m.prefix : ''}`;
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
    if (this._rcloneSupportsAcceptEncodingFlag()) args.push('--s3-use-accept-encoding-gzip=false');
    if (m.mode === 'ro') args.push('--read-only');
    // One-time signing probe: some proxies (Cloudflare) rewrite the signed
    // Accept-Encoding header → SignatureDoesNotMatch on everything. V2 auth
    // avoids signing it and rescues PERMANENT-credential mounts; STS session
    // tokens require V4, so those need rclone 1.63–1.69 (v1 SDK + the flag)
    // or an un-proxied endpoint — fail with a message that says so.
    if (m.v2Auth === undefined) {
      const probe = (extraEnv) => new Promise((resolve) => {
        execFile('rclone', ['lsf', remote, '--max-depth', '1', '--retries', '1', '--low-level-retries', '1',
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
    const child = spawn('rclone', args, { env, detached: true, stdio: ['ignore', log, log] });
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
    const e = process.env;
    if (!e.VIBESPACE_S3_ENDPOINT || !e.VIBESPACE_S3_BUCKET || !e.VIBESPACE_S3_ACCESS_KEY) return null;
    return {
      endpoint: e.VIBESPACE_S3_ENDPOINT, bucket: e.VIBESPACE_S3_BUCKET,
      prefix: e.VIBESPACE_S3_PREFIX || '', accessKey: e.VIBESPACE_S3_ACCESS_KEY,
      secretKey: e.VIBESPACE_S3_SECRET_KEY || '',
      configured: this._state.mounts.some(m => m.origin === 'my-storage'),
    };
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
      const out = execFileSync('rclone', ['help', 'flags'], { encoding: 'utf-8', timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
      this._rcloneAEFlag = out.includes('use-accept-encoding-gzip');
    } catch { this._rcloneAEFlag = false; }
    return this._rcloneAEFlag;
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
