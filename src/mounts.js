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
const FASTBIN_RETRY_MS = 15 * 60e3;   // B-323e (r1381 (4)): a FAILED local copy of the rclone binary is tried again after this — never at every rcloneBin(), never «for the process's life»
const path = require('path');
// B-e783: the daemons' /proc walk is async and bounded (below); every kill goes through PI.signalIdentity (a recycled pid is
// never signalled)
const PI = require('./proc-identity.js');
// B-e783: one process's stat line → { state, start, comm } or { err } (no memory-map lock: safe for a process asleep in the kernel)
const procStat = async (root, pid) => { let s; try { s = await fs.promises.readFile(`${root}/${pid}/stat`, 'utf8'); } catch (e) { return { err: e }; } const rest = s.slice(s.lastIndexOf(')') + 2).split(' '); return { state: rest[0], start: Number(rest[19]), comm: s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')) }; };
const notOurs = (e) => !!e && ['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(e.code);   // ended, or another user's (hidepid): not ours
const READ_MS = 2000;   // B-e783: one /proc read that has not answered — the walk gives up («can't tell») and never asks that process again
const CANT_TELL_GAP_MS = 30 * 60e3;   // r9: a «can't tell» entry this old is an episode long over — the next one waits again
const DAEMON_ASK_MS = 15000;   // B-323e (主开发 r1299): the detached start's answer (its spawn) is awaited this long; past it: no verdict, no start said
/** line 385's small follow: `ps -o etime` («[[dd-]hh:]mm:ss») → seconds, NaN when it is not that shape (never a guess) */
const etimeSec = (s) => { const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(String(s || '').trim()); return m ? ((Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 60 + Number(m[3])) * 60 + Number(m[4]) : NaN; };
const unasked = (st) => !!st && !!st.unknown && (st.why === 'no starter' || st.why === 'the starter could not be started');   // its follow: a starter that never ran asked nothing
// B-323e's part 3 remainder (lane mask-value-shape, 主开发 r4379): the auto-reconnect's own starts (a CephFS connect's shim, mount and
// unmount, the rc socket's ask, the cache's witness and its old dir's removal) are asked of THE STARTER — never forked from the hub's
// process (a fork of the whole hub on a timer that retries a mount that stays down). The same argv, bound and buffer as before. An
// answer that is not an ended start (no reply, past its bound, output past its buffer) is NO VERDICT; each site words it below.
const viaStarter = (cmd, args, o) => Promise.resolve().then(() => require('./server/child-starter').childStarter().run(cmd, args, o)).catch((e) => ({ started: false, error: (e && e.message) || String(e) }));
const endedOk = (r) => !!r && r.started !== false && !r.unknown && !r.timedOut && !r.overflow && r.code === 0;
const noAnswer = (r) => !r || !!r.unknown || !!r.timedOut;
// line 1004's follow (主开发 r4444): a sudo start past its bound ends as the release's execFile ended it — SIGTERM first, which sudo
// RELAYS to the mount / umount program under it; SIGKILL only after this grace (a SIGKILL sudo cannot relay would leave a root mount
// running after the hub said «failed», and the next reconnect pass could stack a second one beside it)
const SUDO_TERM_GRACE_MS = 2000;
const failWords = (r) => String((r && (r.error || (r.overflow ? 'its output passed its bound' : r.code != null ? `exit ${r.code}` : ''))) || 'not started').split('\n')[0];
const CANT_TELL_MS = 60000;   // B-e783 r8: a connect waits at most this long on «can't tell» (a sleeper it cannot read may be ANY rclone: a pull mount's, another instance's) — then it connects, said
const hasProcMemo = new Map();   // no /proc (a hub on macOS): «can't tell» — the walks' callers keep their old answer; asked once per root
const hasProc = (opts) => { const k = (opts && opts.procRoot) || ''; if (!hasProcMemo.has(k)) hasProcMemo.set(k, PI.hasProc(opts)); return hasProcMemo.get(k); };
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
// At-rest encryption is THE shared primitive (src/secret-box.js, design
// §14.7): same aes-256-gcm `iv.tag.data` bytes as the former inline
// `_enc`/`_dec` (parity-pinned by scripts/test-secret-box.mjs), but the key
// is created on ENOENT ONLY — the inline `_key()` used to mint a fresh key on
// ANY read failure and silently orphan every stored ciphertext.
const { secretBox, holdsCiphertext, BOX_CIPHERTEXT_RE, describeJsonError } = require('./secret-box');
const { parseDriveClients } = require('./preset-layers.js');
const { serviceEnv, RCLONE_ENV_KEEP } = require('./agent-env.js');
const { obscure: rcloneObscure } = require('./rclone-obscure.js'); // lane mount-password-off-argv: rclone's public obscure, computed IN-PROCESS (a secret never rides argv)
/** EVERY rclone child's env (lane spawn-env-debts, 2026-10-20): the service list + RCLONE_ENV_KEEP + the egress door +
 *  the caller's RCLONE_CONFIG_* — never the hub's whole env (its tokens, an agent conversation's, a cloud key) in a mount
 *  daemon that lives for days (detached, it survives server restarts). */
const rcloneEnv = (cfg = {}) => serviceEnv(process.env, { keep: RCLONE_ENV_KEEP, egress: true, add: cfg });
const PROBE_OUT_MAX = 1024 * 1024;   // B-323e: a probe's output bound — the old road's (execFile's default maxBuffer; past it the child was ended and the answer read no proof)
const LIVENESS = require('./mount-liveness.js');
const SR = require('./store-read.js');
const HOLD = require('./store-read-hold.js');   // B-f276 family unit 1: mounts.json under the store-read law
const MOUNTS_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v);   // lane mount-liveness: THE sweep's verdict table (PURE)
const MW = require('./mount-error-words.js');   // B-af94: a row's words BY CODE — the page words them in its language
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
const UNKNOWN_BLOCK_MS = 65000;   // B-91aa: a connect probe that got no answer blocks its path until the next sweep re-checks it (the liveness table's own slowBlockMs, src/mount-liveness.js), never longer
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

/** lane vault-contents-window r2: what a sealed field answers outside the page's reveal window (never a character of it). */
const VAULT_MASK = '••••••••';
/** THE WRITE-ONLY LAW (lane ui-controls-and-bugs; 主开发's ruling 2026-11-13 — the walk found the storage Edit dialog showing a
 *  Drive record's OAuth token in an edit box): a storage record's SECRET bytes never travel to the page — not to the owner's
 *  cookie, inside the vault's reveal window or out of it. A secret is what the record SEALS: every `<cell>Enc` (the OAuth token,
 *  a client secret, an S3 secret key / session token, a WebDAV / SFTP password, a bearer token, a Ceph secret); a raw rclone
 *  record seals EVERY parameter, and there every parameter is a secret but the PLAIN ones (SECRET_PARAM, below). config() drops
 *  them, names the ones the record HOLDS in `held` and every write-only parameter field in `secretParams`; the dialog
 *  says «已保存» with an empty «替换…» (the OAuth token: «已授权» beside its Re-authorize door). Everything else stays readable. */
// THE rclone PARAMETER TABLE — DENY BY DEFAULT (主开发's closure 2026-11-13: «a raw parameter is secret unless its name is on an
// explicit allow-list of plain names kept in ONE table»). Every option a provider of this tree writes has its row here, plain or
// secret — scripts/test-write-only-secrets.mjs ② reads the options from the providers, and a new one with no row is red. A name
// with NO row (what the owner typed into a raw record) is a SECRET, whatever its value or its ending.
const RCLONE_PARAMS = Object.freeze({
  // plain: what kind, where, who, how big, which switch — never a credential
  type: 'plain', provider: 'plain', vendor: 'plain', drive_type: 'plain', env_auth: 'plain', region: 'plain', location: 'plain', location_constraint: 'plain',
  endpoint: 'plain', url: 'plain', host: 'plain', port: 'plain', user: 'plain', username: 'plain', account: 'plain', tenant: 'plain', domain: 'plain',
  bucket: 'plain', container: 'plain', scope: 'plain', acl: 'plain', bucket_acl: 'plain', object_acl: 'plain', storage_class: 'plain', server_side_encryption: 'plain',
  chunk_size: 'plain', upload_cutoff: 'plain', copy_cutoff: 'plain', upload_concurrency: 'plain', list_chunk: 'plain', encoding: 'plain', auth_version: 'plain',
  path: 'plain', dir: 'plain', root: 'plain', remote: 'plain', shell_type: 'plain',
  team_drive: 'plain', drive_id: 'plain', root_folder_id: 'plain', shared_with_me: 'plain', client_id: 'plain', access_key_id: 'plain', key_file: 'plain',
  token_url: 'plain', auth_url: 'plain',
  force_path_style: 'plain', no_check_bucket: 'plain', v2_auth: 'plain', key_use_agent: 'plain', ask_password: 'plain', client_credentials: 'plain',
  // secret: the tree's own credential options — decided here, never left to the default
  token: 'secret', client_secret: 'secret', pass: 'secret', secret_access_key: 'secret', session_token: 'secret', bearer_token: 'secret',
});
// …and a VALUE that is a CREDENTIAL URL is a secret whatever its row (the closure: rclone's http backend authenticates by
// `url = https://user:pass@host`, a webdav url / an S3 endpoint / sia's api_url the same; a signed query carries its key):
// a URL with userinfo, or a query naming a signature, a token or a key
const CREDENTIAL_QUERY = /^(sig|signature|x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-signature|x-goog-credential|token|access_token|auth|key|api_key|apikey|password|pass|secret)$/i;
const CREDENTIAL_URL = (value) => {
  let u; try { u = new URL(String(value == null ? '' : value).trim()); } catch { return false; }
  return !!(u.username || u.password) || [...u.searchParams.keys()].some((k) => CREDENTIAL_QUERY.test(k));
};
const PLAIN_PARAM = (name, value) => RCLONE_PARAMS[String(name).toLowerCase()] === 'plain' && !CREDENTIAL_URL(value);
const SECRET_PARAM = (name, value) => !PLAIN_PARAM(name, value);
function writeOnly(out, m) {
  const held = [], secretParams = [];
  for (const [k, v] of Object.entries(m)) {
    if (!/Enc$/.test(k) || typeof v !== 'string') continue;   // a sealed CELL (the bags below are objects)
    const name = k.slice(0, -3);
    delete out[name];
    if (v) held.push(name);
  }
  for (const [bag, pre] of [['params', 'param:'], ['extraParams', 'extraParams:']]) {
    const b = out[bag];
    if (b && typeof b === 'object') for (const p of Object.keys(b)) if (SECRET_PARAM(p, b[p])) { secretParams.push(pre + p); if (b[p]) held.push(pre + p); b[p] = ''; }   // the key stays (its field), never its value
  }
  if (held.length) out.held = held;
  if (secretParams.length) out.secretParams = secretParams;   // which parameter fields are write-only (the page draws them so)
  return out;
}
class MountManager {
  constructor({ dataDir, broadcast, getSetting, storeWriter = null }) {
    this._storeWriter = storeWriter;   // B-574d «mounts-and-forwards» (主开发 r4751 / r4758 / r4796, lane nl-mounts): the store writer mounts.json is written by (a suite's; else the process's)
    // Gmail-as-a-folder engine (2.134.0) — lazy so plain deployments pay nothing
    const { GmailSync } = require('./gmail-sync');
    this.gmail = new GmailSync({ presets: () => MountManager.drivePresets(), onProgress: () => this._notify(), onClientProven: (id, client, rt) => { try { const m = this._state.mounts.find((x) => x.id === id); if (m && rt && MountManager._rtOf(this._dec(m.tokenEnc)) === rt) this._adoptClient(m, client); } catch { } } });   // B-e40d: adopted only while the record holds the token that refreshed
    this.dataDir = dataDir;
    this.broadcast = broadcast || (() => {});
    this._getSetting = getSetting || (() => undefined);
    this._file = path.join(dataDir, 'mounts.json');
    this._keyFile = path.join(dataDir, '.mounts-key');
    // decision 24: mounts keeps ITS OWN key file, byte-for-byte; THE KEY-FILE LAW (lane key-file-law-stores): a key is
    // minted only while mounts.json (and the state in memory) holds no ciphertext — else `key-missing`, the rows say restore
    this._box = secretBox(this._keyFile, { hasCiphertext: () => holdsCiphertext({ files: [this._file], values: [this._state] }) });
    this._logDir = path.join(dataDir, 'mount-logs');
    this.mountBase = process.env.VIBESPACE_MOUNT_BASE || path.join(os.homedir(), 'vibespace-mounts');
    this._state = { mounts: [], shares: [] };
    this._errors = new Map(); // id -> last mount error line
    this._load();
    if (!this._hold.held()) this._maybeImportEnvStorage();   // held: the env import (it saves) waits for the read — _lifted runs it
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
    this._hold.refuse('changing the storage settings');
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
    this._save({ now: true, why: 'the storage settings' });
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
  static RCLONE_PARAMS = RCLONE_PARAMS;   // THE table (the census reads every provider option against it)
  static SECRET_PARAM = SECRET_PARAM;   // the census (scripts/test-write-only-secrets.mjs) reads the law from here
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
    if (this._fastBinMemo?.src === binPath && !(this._fastBinMemo.failedAt && Date.now() - this._fastBinMemo.failedAt > FASTBIN_RETRY_MS)) return this._fastBinMemo.use;
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
        fs.mkdirSync(cacheDir, { recursive: true });   // before the flag: a throw here leaves no copy «in flight» for ever
        this._fastBinCopying = true;
        // B-323e follow (r2030 (3c)): the copy's own retry stamp — while it runs (≤ 180 s) every rcloneBin() answers the network
        // path from this memo (no realpath + /proc/mounts + stat on the loop at each call); its end replaces it
        this._fastBinMemo = { src: binPath, use: binPath, failedAt: Date.now() };
        const tmp = `${cached}.tmp-${process.pid}`;
        execFile('sh', ['-c', `cp "${binPath}" "${tmp}" && chmod 755 "${tmp}" && mv "${tmp}" "${cached}"`], { timeout: 180000 }, (err) => {
          this._fastBinCopying = false;
          if (err) this._fastBinMemo = { src: binPath, use: binPath, failedAt: Date.now() };   // B-323e: a FAILED copy is remembered FASTBIN_RETRY_MS (the network path stands meanwhile) — never redone at every rcloneBin()
          if (!err) {
            this._fastBinMemo = { src: binPath, use: cached };   // the copy landed: the next call execs it (the settled state)
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
      this._fastBinMemo = { src: binPath, use: binPath, failedAt: Date.now() };   // B-323e follow (r2030 (3c)): a thrown stat / mkdir is retried after FASTBIN_RETRY_MS too — never the network path for the process's life
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

  /** B-323e: is rclone there? Asked of THE STARTER (`rclone version`, 5 s) and KEPT — never a synchronous fork of the hub per
   *  Storage-panel read (each read held the loop the child's whole run; the panel re-reads at every mounts / hosts broadcast).
   *  → true · false · null (no answer: a dead or slow starter — the panel then offers no install; nothing is kept). */
  rcloneAvailable() { return this._toolKnown('rclone', this.rcloneBin(), ['version'], 5000); }

  /** B-323e: a program's presence (`<bin> <argv>` exits 0), asked of THE STARTER and kept for the process: a yes for good, a
   *  no asked again at most once a minute (a hand install is seen), an install drops both (the generation). One ask at a
   *  time; no answer keeps nothing and answers null. */
  _toolKnown(key, bin, argv, timeoutMs, { fresh = false } = {}) {
    const known = (this._tools = this._tools || new Map()), c = known.get(key);
    if (c && c.v === true) return Promise.resolve(true);
    if (c && c.v === false && !fresh && Date.now() - c.at < 60000) return Promise.resolve(false);
    if (c && c.ask) return c.ask;
    const gen = this._toolsGen || 0;
    const ask = require('./server/child-starter').childStarter().run(bin, argv, { timeoutMs, env: serviceEnv(process.env), envAdd: { PATH: process.env.PATH || '' } })   // resolved on the hub's PATH, as the direct start resolved it (B-e783's meeting); the starter's old road gets the service env, never the hub's whole env (its read)
      .then((r) => {
        if (!r || r.unknown || r.timedOut) return null;   // no answer, or slower than its bound: no proof either way, nothing kept
        const v = r.code === 0;
        if ((this._toolsGen || 0) === gen) known.set(key, { v, at: Date.now() });
        return v;
      }, () => null)
      .finally(() => { const e = known.get(key); if (e && e.ask === ask) { if (e.v === undefined) known.delete(key); else known.set(key, { v: e.v, at: e.at }); } });
    known.set(key, { ...(c || {}), ask });
    return ask;
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
    this._rcloneFlagsHelp = undefined; this._rcloneFlagsGen = (this._rcloneFlagsGen || 0) + 1; this._rcloneFlagsAsk = null; this._rcloneFlagsUnsaid = false;
    this._fastBinMemo = undefined;
    this._toolsGen = (this._toolsGen || 0) + 1; this._tools?.delete('rclone');   // B-323e: the kept answer was about the old binary
    if ((await this.rcloneAvailable()) === false) throw new Error('installed binary failed to run');   // no answer is no proof of failure
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
      // B-323e: asked of the starter (never a synchronous fork at boot); only a NO installs — no answer is no proof
      if (needsRclone) this.rcloneAvailable().then((has) => {
        if (has === null && !this._reinstallAskedAgain) { this._reinstallAskedAgain = true; setTimeout(() => this.maybeUpgradePinnedRclone(), 60000).unref?.(); return; }   // no answer at boot: once more, a minute on
        if (has !== false) return;
        console.log(`[mounts] data/bin/rclone missing and no PATH rclone — installing ${MountManager.RCLONE_PIN}`);
        this.installRclone().then(
          (r) => console.log(`[mounts] rclone ${r.version} installed`),
          (e) => console.warn(`[mounts] rclone install failed: ${e.message}`));
      });
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

  // B-f276 family unit 1 (lane bl-jobs, 主开发 r2930): THE STORE-READ LAW (src/store-read-hold.js). The release read ANY failure as
  // «nothing connected» and the next save — a person's Connect storage, a migration — wrote over the file: every storage record and
  // its sealed credentials gone. HELD: no storage is listed (the list says why), every change is refused by name (_get and the doors
  // that make a record), nothing is written over it, the boot's restore and the env import wait, and it is read again off the
  // loop; torn bytes are kept aside once per content, then the list starts empty. A restart while held reads the same file again
  _load() {
    this._hold = HOLD.create({
      file: this._file, valid: MOUNTS_SHAPE, code: 'storage_unread', aside: (mark) => this._file + '.corrupt-' + mark,
      words: (h) => `mounts.json in VibeSpace's data folder could not be read (${h.code}); VibeSpace reads it again every few minutes. No storage is lost: nothing is written over it, and changes to storage wait until it reads.`,
      log: (s) => console.warn('[mounts] ' + s),
      onLift: (v) => this._lifted(v),
    });
    // B-574d (r4796): a list made AGAIN in this process (a suite's restart on the same data folder) lands what the last one still owed
    // before it reads the file; a hub's start owes nothing (pending() is false: no wait)
    { const W = this._writer(); if (W.pending(this._file)) W.flushSync([this._file], { waitedBy: 'mounts.json, a list made again in this process' }); }
    let read; try { read = { text: fs.readFileSync(this._file, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: MOUNTS_SHAPE });
    if (this._hold.start(a) === 'data') this._state = a.value;
    this._shapeState();
    this._asked = a.state === 'data' && !this._hold.held() ? JSON.stringify(this._state, null, 2) : null;   // B-574d (r4796 (b)): the bytes read — a save that would write them again writes nothing
    if (!this._hold.held()) this._maybeMigrateDrive();
  }
  _shapeState() {
    if (!Array.isArray(this._state.mounts)) this._state.mounts = [];
    if (!Array.isArray(this._state.shares)) this._state.shares = [];
  }
  /** the hold LIFTED (src/store-read-hold.js): the records read (null: empty) — what the start skipped runs now (the one-time
   *  migration, the env import, the boot's restore when it was asked), and every page is told */
  _lifted(v) {
    this._state = v || { mounts: [], shares: [] };
    this._shapeState();
    this._asked = v ? JSON.stringify(this._state, null, 2) : null;   // B-574d (r4796 (b)): read again — what it holds is on disk
    this._maybeMigrateDrive();
    this._maybeImportEnvStorage();
    this._notify();
    if (this._restoreAsked) { this._restoreAsked = false; this.restore().catch(() => { }); }
    try { const r = this.clientSwapCheck(); if (r && typeof r.catch === 'function') r.catch(() => { }); } catch { }   // the census's MS2: the check the hold made wait
  }
  /** the words a person reads while mounts.json is held (the storage list, a refused change) — null when it reads */
  unreadWords() { return this._hold.words(); }
  /** a lift from torn bytes in this run: the copy's base name (the Storage section says where the old bytes are) — null when none */
  tornCopy() { const t = this._hold.torn(); return t ? t.copy : null; }

  _save({ now = false, why = 'the storage change' } = {}) {
    if (!this._hold.writable('a storage change')) return;   // held: nothing is written over the file
    // B-574d «mounts-and-forwards» (主开发 r4751 / r4758 / r4796, lane nl-mounts): mounts.json goes through THE STORE WRITER (src/store-writer.js: its
    // thread writes the temp, SYNCS it and renames it — a power loss never leaves the list empty or torn), the bytes made AT the write;
    // ONE road for the file, so a later state always lands last. NO WRITE WHEN NOTHING CHANGED (r4796 (b)): the bytes the writer was
    // last handed are never asked again — the watchdog's remount of a mount that dies after each start (60 s floor), the boot's env
    // import, a landing that changes nothing write NOTHING. A save no person pressed (a remount or a landing, the watchdog's park,
    // the cache's place, a client refresh, a Gmail landing, the boot) rides the writer off the loop: a failed landing is the writer's
    // own line (its first failure and every tenth) and stays owed — never thrown into a sweep, a timer or a promise. A PERSON's own act
    // (`now`: add, add a child, convert, edit, remove, Disconnect, the Drive sign-in, a share minted or revoked, the storage settings, an
    // import) lands before it answers — the writer's own synchronous road (flushSync); a landing that fails throws `not-durable` with
    // law F's one sentence (kept in memory, written when the storage can)
    const W = this._writer(), json = JSON.stringify(this._state, null, 2);
    if (json === this._asked && !W.pending(this._file)) return;
    W.dirty(this._file, { name: 'mounts.write', mode: 0o600, produce: () => {
      const j = JSON.stringify(this._state, null, 2); this._asked = j; return j;
    } });
    if (!now) return;
    let r = null; try { r = W.flushSync([this._file], { waitedBy: `mounts.json: ${why}` }); } catch (e) { r = { left: [{ file: this._file, why: (e && e.message) || 'the writer threw' }] }; }
    const miss = !r ? { why: 'the store writer did not answer' } : r.deferred ? null : (r.left || []).find((x) => x && x.file === this._file);   // deferred: the hub is stopping — its exit flush writes it
    if (miss) throw Object.assign(new Error('Saved, but not on disk yet — the storage has not written it (it is slow or failing). It stays in memory and is written when the storage can; a restart before then loses it.'), { code: 'not-durable', status: 503, why: `${why}: ${miss.why || 'the write failed'}` });
  }
  _writer() { return this._storeWriter || require('./store-writer.js').storeWriter(); }

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


  // ── lane vault-contents-window: THE VAULT WINDOW's rows of this store — every `*Enc` field of every record (and the
  // params maps), plus My storage's secret key; masked (the ciphertext rides only to the length class) ──
  vaultRows() {
    const out = [];
    const each = (entry, label, detail, createdAt, rec) => {
      for (const [k, v] of Object.entries(rec || {})) {
        if (!/Enc$/.test(k) || !v) continue;
        const name = k.slice(0, -3);
        if (typeof v === 'string') out.push({ entry, field: name, label, detail, createdAt, cipher: v, kind: name === 'token' ? 'oauth-token' : name === 'cephSecret' ? 'secret-key' : undefined });
        else if (typeof v === 'object' && !Array.isArray(v)) for (const [p, b] of Object.entries(v)) if (typeof b === 'string' && /^[\w.:-]{1,100}$/.test(p)) out.push({ entry, field: `${name}.${p}`, kind: 'parameter', label, detail, createdAt, cipher: b });
      }
    };
    for (const m of this._state.mounts) if (m && m.id) each(m.id, m.name || m.id, m.type || 's3', m.createdAt || null, m);
    if (this._state.myStorage) each('my-storage', 'My storage', this._state.myStorage.bucket || '', this._state.myStorage.updatedAt || null, this._state.myStorage);
    return out;
  }
  /** lane vault-contents-window: ONE value — `field` names a `<name>Enc` field or `<map>.<param>`; null when gone. */
  vaultReveal(entry, field) {
    const rec = entry === 'my-storage' ? this._state.myStorage : this._state.mounts.find((x) => x && x.id === entry);
    if (!rec) return null;
    const [name, param] = String(field).split(/\.(.*)/s);
    const v = rec[name + 'Enc'];
    const blob = param ? (v && typeof v === 'object' ? v[param] : null) : (typeof v === 'string' ? v : null);
    return typeof blob === 'string' && blob ? this._dec(blob) : null;
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
      mintedClient: MountManager._mintedExport(m, this),   // B-e40d: the client its token was minted under (sealed again at import)
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
    this._hold.refuse('importing storage');
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
        MountManager._mintedImport(this._get(nid), m.mintedClient, this);   // B-e40d: a restored mount keeps its minted client
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
      this._save({ now: true, why: 'an import' });
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

  /** B-864f (src/server/cwd-wait.js): ONE row's wait facts by id — its connect / start in flight, its last error, whether its
   *  key waits for the vault — without building every row (list()); asked every 500 ms while a create waits for the mount. */
  waitFacts(m) {
    const conn = this._connOf(m), keyNo = BOX_CIPHERTEXT_RE.test(JSON.stringify(conn)) ? this._box.refusal() : null;
    return { connecting: !!this._connecting?.has(m.id), starting: !!this._starting?.get(m.id), error: this._errors.get(m.id) || null, keyCode: (keyNo && keyNo.code) || null };
  }

  /** The registered storage whose mount point contains p but is NOT mounted
   *  right now, or null. A write landing there goes to the bare local
   *  directory: invisible once the storage reconnects, and the reconnect
   *  itself then fails "not empty" (real incident — a generated TASK.md
   *  recreated a whole folder tree under a disconnected OneDrive). Every
   *  server-side writer consults this before touching a path. */
  /** lane hub-fuse-sync-guard: THE STORAGE ROWS' MOUNT POINTS for the mount guard (src/server/sync-fs-witness.js →
   *  src/mount-path-class.js rootsOf) — every filesystem row (a sync worker's folder and a credential are not mounts),
   *  mounted or not: the main thread never waits on one, and an unmounted one is the bare folder shadowedBy guards. */
  storageRoots() {
    const out = [];
    for (const m of this._state?.mounts || []) {
      if (rowFor(this, m).filesystem === false || this._kindOf(m) === 'credential') continue;
      let mp; try { mp = this.pathOf(m); } catch { continue; }
      out.push({ mountpoint: mp, name: m.name, id: m.id });
    }
    return out;
  }

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
    let keyNo; const keyOf = () => (keyNo === undefined ? (keyNo = this._box.refusal()) : keyNo); // THE KEY-FILE LAW: asked once, only for a row holding a secret (never mints)
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
        mounted: this.isMounted(m), error: this._errors.get(m.id) || null, ...this._errorCodeOf(m.id),
        parked: m.parked ? { at: m.parked.at, verdict: m.parked.verdict } : null,   // B-5ce7: kept disconnected until the person's Reconnect
        ...(BOX_CIPHERTEXT_RE.test(JSON.stringify(conn)) && keyOf() ? { keyFile: keyOf() } : {}),   // { code, file } only on a refusal: a row with a secret says restore the key file
        ...((lv) => lv ? { probe: { verdict: lv.verdict, strikes: lv.strikes, lastMs: lv.lastMs } } : {})(this._liveness?.get(m.id)),   // the sweep's last verdict (lane mount-liveness)
        // A connect legitimately spends 10-25s in mount()'s window (mountpoint
        // wait + IO probe + auth probes). Without this flag EVERY client showed
        // a plain grey "Not mounted" dot the whole time, and the initiating
        // client's local row-dimming was wiped by any mounts-updated broadcast.
        connecting: this._connecting?.has(m.id) || false,
        disconnecting: this._disconnecting?.has(m.id) || false,   // B-323e (主开发 r1501 (8)): a person's Disconnect in flight — every client's row says it
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
    if (!m) { const held = this.unreadWords(); if (held) throw refuse('storage_unread', held); throw refuse('mount-gone', 'that storage mount no longer exists'); }   // B-f276 (r3230's table): held ⇒ by name, never «gone»
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
   * The DECRYPTED connection config for the edit dialog (user directive: prefill the REAL current values instead of
   * "blank = keep" placeholders) — EXCEPT every SECRET (THE WRITE-ONLY LAW above: named in `held`, never sent).
   * Served only on the cookie-authed config route. Env-provisioned records return no secrets (their connection is
   * deployment-owned and not editable anyway).
   */
  /** Would config(id) carry any SEALED byte? (the acceptance reader: every Edit open inside the reveal window audited a
   *  «vault-reveal» for a record that, under the write-only law, reveals nothing sealed). Only a raw rclone record's PLAIN
   *  parameters are sealed AND shown — the route asks the vault's reveal (paced, audited) only then. */
  revealNeeded(id) {
    const m = this._get(id);
    // judged by the ANSWER's own `secretParams` (the rule read the value: a blanked credential URL is no longer a URL)
    const sp = new Set(this.config(id).secretParams || []);
    return [['paramsEnc', 'param:'], ['extraParamsEnc', 'extraParams:']].some(([k, pre]) => { const v = m && m[k]; if (!v || typeof v !== 'object' || Array.isArray(v)) return false; return Object.keys(v).some((p) => !sp.has(pre + p)); });
  }
  config(id, { masked = false } = {}) {
    const m = this._get(id);
    // lane vault-contents-window r2 (verify r1): outside the page's reveal window every sealed field answers the MASK and
    // is named in `masked` (the dialog leaves it as it is unless a new value is typed); the rest of the record is real
    if (masked) {
      const out = this.config(id);
      const names = [], secretOut = new Set(out.secretParams || []);   // the write-only fields stay blank — never the mask of a plain one
      for (const [k, v] of Object.entries(m)) {
        if (!/Enc$/.test(k) || !v) continue;
        const name = k.slice(0, -3);
        if (typeof v === 'string' && out[name] !== undefined) { out[name] = VAULT_MASK; names.push(name); }
        else if (typeof v === 'object' && !Array.isArray(v) && out[name] && typeof out[name] === 'object') for (const p of Object.keys(v)) if (p in out[name] && !secretOut.has(`${name === 'params' ? 'param' : name}:${p}`)) { out[name][p] = VAULT_MASK; names.push(`${name === 'params' ? 'param' : name}:${p}`); }
      }
      return { ...out, masked: names };
    }
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
    return writeOnly(out, m);
  }

  // ── CRUD ──

  add(cfg) {
    this._hold.refuse('connecting storage');
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
    this._save({ now: true, why: 'a storage added' });
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
    this._save({ now: true, why: 'a folder added' });
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
    this._save({ now: true, why: 'a storage converted' });
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
    if (m.parked) this._unpark(m, 'removed');   // B-5ce7: its For-you item resolves with it
    this._killedSaid?.delete(id); try { this.onAnswered?.(m); } catch { }
    try { this.onRemoved?.(m); } catch { }   // its stranded-files notice too (the cap counts live records)
    this._unmountWhy?.delete(id);   // its follow: a press's reason leaves with the record
    this._mountGen?.delete(id); this._cantTell?.delete(mpRemoved);   // B-e783: its generation and any «can't tell» wait leave with the record (after the unmount, which moves it)
    this._state.mounts = this._state.mounts.filter(x => x.id !== id);
    setTimeout(() => this._cleanupEmptyMountpoint(mpRemoved), 1500);
    this._errors.delete(id); this._errorCodes?.delete(id);   // B-af94: the code goes with its record
    this._reconnects?.delete(id);
    // a CHILD removes the cache (up to vfsCacheMaxSizeGB, 164 788 files over NFS on the owner's box): fs.rm on the
    // libuv threadpool is the FUSE-threadpool outage class this module exists to prevent (lane vfs-cache-local)
    for (const dir of new Set([this._cacheDirOf(m), m.cacheOld].filter(Boolean))) this._dropCacheDir(m, dir, { removing: true });
    this._save({ now: true, why: 'a storage removed' });
    this._notify();
    this.clientSwapCheck().catch(() => { });   // B-e40d: a removed mount is no longer counted on its preset's old client
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
    this._save({ now: true, why: 'a storage edited' });
    this._notify();
    this.clientSwapCheck().catch(() => { });   // B-e40d: a renamed mount, or one moved to another preset key, is said as it is now
    // Auto-remount after an edit — a FAILED remount must reach the row (the
    // swallowed catch here was why an unwritable path change looked like a
    // successful save; no-silent-failure rule).
    if (wasMounted) {
      try { await this.mount(id); }
      catch (e) { if (!this._errors.get(id)) { this._errors.set(id, this._sayE(id, e)); this._notify(); } }
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
    this._hold.refuse('this storage change');   // held: no record is known — refused by name, never «mount not found»
    const m = this._state.mounts.find(x => x.id === id);
    if (!m) throw new Error('mount not found');
    return m;
  }

  // ── Mount / unmount ──

  // rclone requires PASS-type params in its reversible obscured form. We store the
  // REAL secret AES-GCM'd (secret-box — our actual protection) and produce the
  // obscured form IN-PROCESS at use time (src/rclone-obscure.js, a public algorithm).
  // It used to shell out to `rclone obscure <plain>`: the password rode the child's
  // ARGV — readable in /proc/<pid>/cmdline by any local user — on a SYNC exec that
  // blocked the loop. A secret never rides argv; a public algorithm runs in-process.
  _obscure(plain) {
    return rcloneObscure(String(plain));
  }

  /** Per-type rclone env + remote string for a mount record. */
  _rcloneFor(m) {
    m = this._connOf(m); // child mounts resolve to credential + own path
    const R = 'VS';
    const P = (k) => `RCLONE_CONFIG_${R}_${k}`;
    const cfg = {};   // the provider's RCLONE_CONFIG_VS_* — the remote's ONLY channel (credentials ride env, never argv)
    let remote;
    const row = rowFor(this, m);
    remote = (row.rclone ? row : PROVIDERS.defaultRow).rclone(m, cfg, P, R, this);
    // Advanced extra params (custom API keys, tuning) override/extend any type
    for (const [k, blob] of Object.entries(m.extraParamsEnc || {})) cfg[P(k.toUpperCase())] = this._dec(blob);
    const env = rcloneEnv(cfg);
    return { env, remote };
  }

  // Backends where the account root and a bucket/container are DIFFERENT
  // permission scopes — a bucket-scoped token root-mounts "successfully" and
  // then EIOs on every IO. Detection (below) only fires for these.
  static BUCKETY_BACKENDS = new Set(['s3', 'b2', 'azureblob', 'googlecloudstorage', 'swift', 'oos', 'qingstor']);

  /** Probe whether this record's token can list the account ROOT. */
  _probeRootDenied(m) {
    const { env } = this._rcloneFor(m);
    // B-323e (its mount half): by THE STARTER with the record's whole env (rcloneEnv), as the sweep's probes; DENIED only by an ended
    // run's own words — no answer, a run that never started or one ended at its bound says nothing (never «denied»)
    return this._rcloneProbeRun(['lsf', 'VS:', '--max-depth', '1', '--retries', '1', '--low-level-retries', '1'], env, 20000)
      .then((r) => !!r && !r.unknown && !!r.started && !r.timedOut && r.code !== 0 && /AccessDenied|Access Denied|status code: 403/i.test(String(r.stderr || '')), () => false);
  }

  async mount(id) {
    { const dj = this._pressJoins?.get(id); if (dj) await dj.catch(() => { }); }   // its follow (r1890 (1)): bounded by that road itself — the trio (10 s each), the daemon's wait (8 looks 0.5 s apart, each a bounded walk) and its end; a throw in it answers by what is known, so it always settles   // B-323e (r1501 (8)): a Disconnect in flight ends first — its daemon wait would kill a new one
    // B-5ce7: a connect ends a PARK — the automatic roads (restore, the sweep's reconnect) never call mount() for a parked
    // record, so a mount() here is the person's (the Reconnect door, Connect, an edit, a re-authorization)
    { const pm = this._state.mounts.find((x) => x.id === id); if (pm && pm.parked) this._unpark(pm, 'reconnect'); if (pm) { try { this._forgetHeldProbes(this.pathOf(pm)); } catch { } } }
    // One connect in flight per record — the watchdog's auto-reconnect must
    // never race a user-initiated connect (or itself).
    // A second connect JOINS the one in flight (2.369.213: one daemon per
    // mountpoint — it used to answer false, which the client called a failure).
    this._connecting = this._connecting || new Set();
    this._joins = this._joins || new Map();
    if (this._connecting.has(id)) {
      const j = this._joins.get(id), w = this._word?.get(id) || 0;
      if (j && (this._connWord?.get(id) || 0) !== w) return j.catch(() => { }).then(() => ((this._word?.get(id) || 0) !== w || !this._state.mounts.some((x) => x.id === id) ? false : this.mount(id)));   // its follow: an Unmount since that connect began — this Connect is the last word: once that one ends, a connect anew, unless a later Unmount or a removal came
      return j || false;
    }
    this._connecting.add(id); (this._connWord || (this._connWord = new Map())).set(id, this._word?.get(id) || 0);   // its follow: the person's word this connect began under
    this._notify(); // every client shows "Connecting…" for the whole window
    const p = (async () => {
      try { return await this._mountInner(id); }
      finally { this._connecting.delete(id); this._joins.delete(id); this._connWord?.delete(id); this._notify(); }
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
    this._bumpGen(id);   // B-e783: a connect that really starts — a sweep or probe that walked meanwhile drops its verdict (a press on a mounted or starting record moves nothing)
    const myGen = this._mountGen.get(id);   // r9: this connect's own turn — the person's Unmount during its walk moves it
    // A row with its OWN mount (Gmail = a sync WORKER writing .eml files; CephFS = a native kernel mount) — not rclone.
    const prow = rowFor(this, m);
    if (prow.mount) return prow.mount(id, this);
    // A daemon ALREADY on this mountpoint with no mount yet (a server restart
    // mid-scan, a Connect after the old 5 s verdict) is ADOPTED and watched
    // like a fresh spawn: killing it restarted its scan from zero (the
    // owner's three Connect clicks at 16:52, 2026-10-04).
    const pid0 = await this._adoptable(this.pathOf(m), id);
    if (pid0 === null) {   // B-e783: a second daemon on one folder is worse than a wait — bounded (CANT_TELL_MS), the ask kept: an edit's or a
      if (this._mountGen?.get(id) !== myGen || !this._state.mounts.some((x) => x.id === id)) { this._cantTell?.delete(this.pathOf(m)); return false; }   // r9: unmounted or removed meanwhile — the person's word stands, nothing written (the wait the walk wrote back ends too)
      m.desired = 'mounted'; this._save();   // re-authorize's bounce unmounted first, so the sweep's backoff must ask again
      const ct = (this._cantTell && this._cantTell.get(this.pathOf(m))) || {};
      console.warn(`[mounts] mount ${id}: «can't tell» — process ${(ct.pids || []).join(', ') || '(a read that stalled)'} did not answer; waiting, at most ${Math.round(CANT_TELL_MS / 1000)} s from the first`);   // the pids here, never in the row's words (the backoff's auth test reads digits)
      const lostAt = hasProc(this._procOpts) ? undefined : this._lostStart?.get(this.pathOf(m));   // its follow (r1782 (4)): the hold after a lost reply says so, and what is left of it
      const leftMin = lostAt == null ? 0 : Math.max(1, Math.ceil(((this._startingT || MountManager.STARTING).ceilingMs - (Date.now() - lostAt)) / 60e3));
      this._errors.set(id, lostAt != null ? this._sayW(id, 'start_lost_wait', { min: String(leftMin) }) : 'could not tell whether this storage’s previous connection still runs (a process did not answer) — it is tried again by itself');
      this._notify(); return false;
    }
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
        throw MW.refusal('root_denied');
      }
      // Auto-heal: a previously credential-only record whose token can NOW
      // list the root (rescoped token) becomes root-mountable again.
      if (m.kind === 'credential') { delete m.kind; this._save(); }
    }
    const mp = this.pathOf(m);
    let dest = null;
    try { dest = await this._ensureMountpointDir(mp, { quarantine: true }); }
    catch (e) { this._strandedRefused(m, e); this._errors.set(id, this._sayE(id, e)); this._notify(); throw e; } // mount()'s finally clears _connecting
    if (dest) this._noteStranded(m, dest);
    await this._rcloneFlagsReady();   // B-323e: the help text through THE STARTER first — the argv's flag checks below then read the cache
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
      // B-323e (its mount half): by THE STARTER with the record's whole env, as the sweep's probes; an ended 0 = signed fine (null),
      // anything else its words (no answer / never started / ended at its bound: no verdict word — the record stays undecided)
      const probe = (extraEnv) => this._rcloneProbeRun(['lsf', remote, '--max-depth', '1', '--retries', '1', '--low-level-retries', '1',
        ...(this._rcloneSupportsAcceptEncodingFlag() ? ['--s3-use-accept-encoding-gzip=false'] : [])], { ...env, ...extraEnv }, 20000)
        .then((r) => (r && !r.unknown && r.started && !r.timedOut && r.code === 0 ? null : String((r && (r.stderr || r.error)) || (r && r.unknown ? 'no answer' : 'failed'))), (e) => String((e && e.message) || e));
      const v4err = await probe({});
      if (!v4err) { m.v2Auth = false; }
      else if (/AccessDenied|Access Denied/i.test(v4err)) {
        // Definitive server answer: the token can't list this path. Fail NOW
        // with a pointer instead of fuse-mounting a folder that EIOs on every
        // read (the FishR2 trap: bucket typo / out-of-scope bucket). v2Auth
        // stays undefined so a fixed path re-probes on the next mount.
        const target = remote.split(':').slice(1).join(':') || '(account root)';
        this._errors.set(id, this._sayW(id, 's3_access_denied', { target }));   // B-af94: worded by code (src/mount-error-words.js)
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
    if (await this._daemonAlive(mp, { witness: false })) {
      rcQueue = (await this._rcStats(m)).queue || { error: 'no answer' };
      console.warn(`[mounts] stale daemon still on ${mp} at mount time — killing it`);
      await this._killMountDaemon(mp);
      await new Promise((r) => setTimeout(r, 300));
    }
    // WHERE the cache lives is decided HERE, at a remount, after the outgoing daemon is gone (lane vfs-cache-local)
    const cacheDir = await this._placeCache(m, rcQueue);
    const args = this._mountArgv(m, { remote, mp, cacheDir, rcSocket: this._rcSocketReady(m) });
    // THE DAEMON'S OWN START (B-323e, 主开发 r1299): THE STARTER starts it DETACHED — never signalled, held nor counted by it — so it
    // outlives the starter and the hub and is adopted after a restart as before, and the hub never forks for it. Its output goes to the
    // record's OWN log (the path judged here, the marker written first, as today); its env is the record's whole env (the starter keeps
    // none of it); its answer comes at its SPAWN (the pid, seeded and watched as before). No /proc (law 6): the watch reads its life by
    // signal 0 as before, the starter reaping it when it ends; adoption has no walk there — a start whose ANSWER WAS LOST holds the
    // next start on its mount point as «can't tell» does (bounded, CANT_TELL_MS), the rest as before (a connect starts one)
    const log = this._openMountLog(m.id), logPath = this._mountLogFile(m.id);
    fs.closeSync(log);
    const askAt = Date.now();   // its follow: with no /proc a daemon is proven ours by a start not before this ask
    const st = await require('./server/child-starter').childStarter().run(this.rcloneBin(), args, { detach: { log: logPath }, wholeEnv: true, env, timeoutMs: DAEMON_ASK_MS })
      .catch((e) => ({ started: false, error: String((e && e.message) || e) }));
    // its follow (主开发 r1782 (1)): A PERSON's DISCONNECT DURING THE START — the starter's answer may take DAEMON_ASK_MS: the mount's own
    // generation is read again; moved (an Unmount, a removal) ⇒ nothing is set wanted again, and a daemon that started meanwhile is
    // ended by its recorded identity (the person's word stands)
    if (this._mountGen?.get(id) !== myGen || !this._state.mounts.some((x) => x.id === id)) {
      if (st && st.started && st.pid) await this._endStartedDaemon(mp, st, askAt);
      else if (st && st.unknown && !unasked(st)) {   // its read (MUST 1): a LOST answer may have started one — with /proc its walk ends it; with none the next start on that mount point waits for it
        if (hasProc(this._procOpts)) await this._killMountDaemon(mp).catch(() => []);
        else (this._lostStart = this._lostStart || new Map()).set(mp, Date.now());
      }
      if (this._state.mounts.some((x) => x.id === id) && this.isMounted(m)) await Promise.resolve(this.unmount(id, { internal: true })).catch(() => { });   // its read (S2): it mounted before it was ended — the dead endpoint released, the person's word unchanged
      return false;
    }
    m.desired = 'mounted';
    if (!st || !st.started || !st.pid) {
      // NO REPLY IS NO VERDICT (law 5): «could not be started», never «died» — the person's words are today's for a start that never ran;
      // and A REPLY LOST IS NOT «NO START» (law 2): the next turn's own adoption look (the recorded identity, else the argv walk, above)
      // finds a daemon that lives before any new start — one daemon a mount point, whatever is lost
      console.warn(`[mounts] mount ${id}: the rclone daemon could not be started: ${(st && (st.error || (st.unknown ? (unasked(st) ? 'the starter could not be started' : 'no answer from the starter') : ''))) || 'not started'}`);
      if (st && st.unknown && !unasked(st) && !hasProc(this._procOpts)) (this._lostStart = this._lostStart || new Map()).set(mp, Date.now());   // an ask that may have started it: no /proc ⇒ the next look waits (_adoptable); with /proc its walk finds it
      this._errors.set(id, this._sayW(id, unasked(st) ? 'start_not_asked' : st && st.unknown ? 'start_unanswered' : 'start_exited'));   // line 385's small follow (r2259 (2)): nothing was started — its own words   // no reply: no verdict — never «exited»; no starter at all: nothing was asked (its follow: the could-not-be-started words)
      this._save(); this._notify();
      return false;
    }
    this._lostStart?.delete(mp);
    this._seedDaemonId(mp, st.pid, st.starttime);   // B-e783: known from its first moment — judged by its stat line, killed without a walk (its start time read by its starter at its spawn)
    this._errors.delete(id);
    this._save();
    return this._watchStart(m, mp, st.pid, opts);
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
  static PARK_BLOCK_MS = 10 * 365 * 24 * 3600e3;   // B-5ce7: a parked mount's path stays blocked until its park ends (_unpark unblocks it)

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
    const done = this._waitMounted(m, pid, mp)
      .then((r) => { if (r !== 'mounted') this._starting.delete(m.id); return this._startSettled(m, mp, r, opts); })
      .catch((e) => { this._errors.set(m.id, this._sayE(m.id, e)); return false; })
      .finally(() => { if (this._starting.get(m.id) === st) this._starting.delete(m.id); this._notify(); });
    return Promise.race([done, new Promise((r) => { setTimeout(() => r('starting'), T.quickMs).unref?.(); })]);
  }

  /** Wait for the fuse mount WHILE ITS DAEMON LIVES (never a fixed 5 s):
   *  'mounted' | 'died' (pid gone) | 'hung' (no CPU progress for hungMs) |
   *  'ceiling' — the last two SIGKILL it. Progress = utime+stime. */
  _waitMounted(m, pid, mp0) {
    const T = this._startingT || MountManager.STARTING;
    const o = this._procOpts || {}, popts = { ...(o.procRoot ? { procRoot: o.procRoot } : {}), ...(o.kill ? { kill: o.kill } : {}), ...(o.ps ? { ps: o.ps } : {}), what: 'the daemon of a storage mount point' };
    return new Promise((resolve) => {
      const t0 = Date.now();
      let mark = null, markAt = t0, ident = null, asked = false;   // B-e783: the first tick takes the mark (it runs at t0) and the daemon's identity
      const tick = async () => {
        if (this.isMounted(m)) return resolve('mounted');
        const cpu = await this._cpuTicks(pid);
        if (cpu == null) return resolve('died');
        if (mark == null) mark = cpu;
        if (!asked) { asked = true; const rec = this._daemonIds && this._daemonIds.get(mp0 || this.pathOf(m)); ident = rec && rec.pid === pid ? rec : PI.identityOf(pid, popts); }   // B-e783 cure: ONCE, at the first tick, while it lives — the record (the spawn's, the adopt's) or its own stat line (no /proc: PI's ps, once)
        const now = Date.now();
        if (cpu - mark >= T.progressTicks) { mark = cpu; markAt = now; }
        const verdict = now - markAt >= T.hungMs ? 'hung' : now - t0 >= T.ceilingMs ? 'ceiling' : null;
        if (verdict) {   // B-e783 cure: by identity, like every road (a recycled pid is never signalled; a refusal is said)
          const r = ident ? PI.signalIdentity(ident, 'SIGKILL', popts) : { ok: false, why: 'unknown-identity' };
          if (r.ok) { (this._killed || (this._killed = new Map())).set(ident.pid + ':' + ident.starttime, Date.now()); const mp = mp0 || this.pathOf(m); if (this._daemonIds && this._daemonIds.get(mp)?.pid === ident.pid) this._daemonIds.delete(mp); }   // cure 2: killed by this manager — never recorded or adopted while it lingers (the walk's mp, the wait's own)
          else if (r.why === 'gone' || r.why === 'pid-recycled') return resolve('died');   // cure 2: it ended (a zombie, or its pid now another process's) before the kill — «died», never «hung … killed»
          else console.warn(`[mounts] mount ${m.id}: the ${verdict} daemon was not signalled (${r.why})`);   // the record id, never its name
          return resolve(verdict);
        }
        setTimeout(tick, T.pollMs);
      };
      tick();
    });
  }

  /** utime+stime (clock ticks) of a live process; null when gone/zombie. */
  _cpuTicks(pid) {   // ONE stat line (no memory-map lock): read as the release did — a pool parked by a wedged mount never stalls a tick (B-e783 r6)
    try {
      const s = fs.readFileSync(`${(this._procOpts && this._procOpts.procRoot) || '/proc'}/${pid}/stat`, 'utf-8');
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
    // B-323e (its mount half): THE STARTER counts (a fork of a few MB, never the hub's): its dots captured up to the cap — past it the
    // child is ended (an overflow = the cap reached); bounded by the start's own ceiling; no answer = a failed count (0), as before.
    // (Said: a count ended at the ceiling answers 0 — the starter keeps no output past a bound — and stderr past the cap reads as capped)
    const T = this._startingT || MountManager.STARTING;
    return require('./server/child-starter').childStarter().run('find', [dir, '-type', 'f', '-printf', '.'], { timeoutMs: T.ceilingMs, capture: true, maxBuffer: cap, envAdd: { PATH: process.env.PATH || '' } })
      .then((r) => { const n = r && !r.unknown && r.overflow ? cap : String((r && !r.unknown && r.stdout) || '').length; return { n: Math.min(n, cap), capped: n >= cap }; }, () => ({ n: 0, capped: false }));
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
    let msg = tail || 'rclone exited before mounting', coded = null;   // B-af94 (its read): the code is recorded WITH the words, after the kill's await
    if (r !== 'died') {
      coded = r === 'hung' ? ['start_hung', { s: Math.round(T.hungMs / 1000) }] : ['start_ceiling', { min: Math.round(T.ceilingMs / 60e3) }];
      msg = MW.wordsFor(coded[0], coded[1]);
      console.warn(`[mounts] ${r} daemon on ${mp} (never mounted) — killed`);
      await this._killMountDaemon(mp);
      this._noteReconnectBackoff(id);
      this._saidKilled(m);   // B-5ce7 (merged B-f230): the STARTING state too — a daemon stopped while it was coming up is said
    }
    this._errors.set(id, coded ? this._sayCoded(id, msg, coded[0], coded[1]) : msg);
    this.unblockPath(mp);
    this._notify();
    return false;
  }

  /** Stray files moved aside at connect: said on the row (the move itself
   *  broadcasts the level-2 server-notice). */
  _noteStranded(m, dest, { maybe = false } = {}) {
    if (!maybe) (this._stranded = this._stranded || new Map()).set(m.id, dest);   // the row's «were moved» line: a move KNOWN to have run
    try { this.onStranded?.(m, { dest, path: this.pathOf(m), ...(maybe ? { maybe: true } : {}) }); } catch (e) { console.warn(`[mounts] ${m.id}: the stranded notice was not filed: ${e.message}`); }   // B-5ce7 (merged B-f230): kept in For-you, not a toast only
  }

  /** B-323e (its re-read's S1/S3): a refusal AFTER the files may have moved — the move got no answer (mp_move_unanswered: «may
   *  have been moved») or the re-make after a known move failed (mp_not_recreated / mp_remake_unanswered) — is FILED For-you with the folder it names,
   *  never only a row error the next reconnect erases */
  _strandedRefused(m, e) {
    const dest = e && e.params && e.params.dest;
    if (!dest) return;
    if (e.code === 'mp_move_unanswered') {   // the journal names EVERY such folder (one For-you item a mount names only the latest)
      console.warn(`[mounts] mount ${m.id}: files may have been moved from ${e.params.mp} to ${dest} — no answer; filed For-you`);
      this._noteStranded(m, dest, { maybe: true });
    } else if (e.code === 'mp_not_recreated' || e.code === 'mp_remake_unanswered') this._noteStranded(m, dest);   // a known move (its quarantine line is journalled already)
  }

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
    // B-91aa (its read, M2): no answer at connect (the starter dead or slow) is no witness: the connect's block is re-armed to ONE
    // sweep, so the next sweep decides — never a healthy mount refused for the connect block's whole length
    if (lv.unknown) { this.blockPath(mp, UNKNOWN_BLOCK_MS); this._notify(); return this.isMounted(m); }
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
    const key = verb + ':' + mp, heldMap = (this._heldProbes = this._heldProbes || new Map()), held = heldMap.get(key);
    // B-91aa (its read, M1): a held child whose end the hub can no longer hear (its exit line lost, its starter replaced) is
    // asked of /proc by its pid — gone, or a zombie nobody reaped yet, ⇒ the mark goes and the mount is asked again. A SYNC read of
    // procfs (r4: an async read waits for a libuv pool thread, which a hung FUSE mount can hold; every other /proc read of the
    // sweep is sync); only «no such process» (ENOENT) is gone — a /proc we cannot read says nothing, the mark stays
    if (held && held.pid) {
      // the cure (its readers): a pid the kernel gave to another process (its start time differs) is gone too
      const st = PI.statOf(held.pid);   // B-91aa's held child's witness — read in src/proc-identity.js (B-e783: no /proc read here)
      const gone = st === null || (!!st && (st[0] === 'Z' || (!!held.start && st[1] !== held.start)));
      if (!gone) return Promise.resolve({ health: 'hung', ms: Date.now() - held.t0, held: true });
      if (heldMap.get(key) === held) heldMap.delete(key);
      return this._probeMountpoint(mp, timeoutMs, verb);
    }
    if (held) return Promise.resolve({ health: 'hung', ms: Date.now() - held.t0, held: true });
    // B-91aa: the `ls` is started by THE STARTER (src/server/child-starter.js) — never a fork of the hub from its sweep. Its
    // answer: exit 0 'ok', another exit 'error', past its bound 'hung' (killed there; the held key stays until it ends at
    // last), and NO ANSWER (a dead or slow starter) 'unknown' — never «the mount is down» (no strike, no heal, no remount).
    // B-e783 (met at 2.369.412's second checkpoint): a child that NEVER STARTED (the starter's spawn error) is `spawnErr` —
    // _zombieAt answers nothing for it, never «dead»; its `ls` is resolved on the hub's PATH as the direct spawn resolved it
    const t0 = Date.now();
    return require('./server/child-starter').childStarter().run('ls', verb === 'attr' ? ['-d', mp] : [mp], { timeoutMs, envAdd: { PATH: process.env.PATH || '' }, onTimeout: (pid) => heldMap.set(key, { t0, pid, start: pid ? ((PI.statOf(pid) || [])[1] || null) : null }), onLateExit: () => heldMap.delete(key) })
      .then((r) => {
        if (r.unknown) return { health: 'unknown', ms: Date.now() - t0 };
        if (r.timedOut) return { health: 'hung', ms: Date.now() - t0 };   // marked at the timeout itself (its read, M1)
        heldMap.delete(key);
        return { health: r.code === 0 ? 'ok' : 'error', ms: Date.now() - t0, ...(r.error && r.code == null ? { spawnErr: true } : {}) };
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
    const s3 = !!rowFor(this, m).s3Backend?.(m.parentId ? this._connOf(m) : m);
    // B-323e: started by THE STARTER with the child's WHOLE env as rcloneEnv built it — never a fork of the hub from its sweep;
    // an s3 backend's flag check reads the help text the starter fetched (`_rcloneFlagsReady`), never two synchronous forks
    return (s3 ? this._rcloneFlagsReady() : Promise.resolve()).then(() => {
      const args = ['lsf', remote, '--max-depth', '1', '--retries', '1', '--low-level-retries', '1'];
      if (s3 && this._rcloneSupportsAcceptEncodingFlag()) args.push('--s3-use-accept-encoding-gzip=false');
      return this._rcloneProbeRun(args, env, timeoutMs);
    }).then((r) => {
      // NO ANSWER (a dead or slow starter): 'unanswered' — no proof either way; every caller reads it as 'unknown', and the
      // access error's re-probe leaves the banner as it is (no banner flips on it). A program that never started: 'unknown'
      // (the old road read a start error so: execFile's own callback answered before the 'error' listener)
      if (!r || r.unknown) return 'unanswered';
      if (!r.started) return 'unknown';
      if (r.overflow) return 'unknown';   // the output passed the bound: the child was ended (as execFile did) — no proof either way
      if (r.timedOut) return 'hung';
      if (String(r.stdout || '').length >= PROBE_OUT_MAX) return 'unknown';   // past the old road's 1 MB bound: the release's verdict — execFile ENDED the child with ERR_CHILD_PROCESS_STDIO_MAXBUFFER, which carries no `killed` flag (measured: killed undefined), so it read 'unknown' too, never 'hung' (unless its stderr named a timeout or an auth word: now 'unknown' there too)
      if (r.code === 0) { this._adoptProbed(m, env); return 'ok'; }   // B-e40d: an answer on a spent token proves the client ITS env carried
      const s = String(r.stderr || '');
      if (/ETIMEDOUT/.test(s)) return 'hung';
      // "unauthenticated"/"invalid_grant"/"InvalidAuthenticationToken" are
      // the OAuth-refresh-token death phrasings (rclone onedrive / Google /
      // MS Graph) — a real OneDrive incident failed every read with
      // "unauthenticated: Unauthenticated" and matched NOTHING here.
      if (/401|403|Unauthorized|unauthenticated|invalid_grant|InvalidAuthenticationToken|AccessDenied|Access Denied|expired|Forbidden|SignatureDoesNotMatch|InvalidAccessKeyId|no longer valid/i.test(s)) return 'denied';
      // A NON-auth lsf failure is NOT a revocation — SMB especially fails
      // to enumerate the server root while the mounted share lists fine
      // (real report: a working NAS mount kept flashing "access denied").
      // 'unknown' → callers do not surface a scary revoked/denied banner.
      return 'unknown';
    });
  }

  /** B-323e: ONE rclone run of a sweep probe, through THE STARTER (src/server/child-starter.js), its child's WHOLE env as
   *  rcloneEnv built it (`wholeEnv`: the starter starts this one child with exactly it and keeps nothing). The env is never
   *  said — the probes return a word, never the child's output or its env. */
  _rcloneProbeRun(args, env, timeoutMs) {
    return require('./server/child-starter').childStarter().run(this.rcloneBin(), args, { timeoutMs, capture: true, maxBuffer: PROBE_OUT_MAX, env, wholeEnv: true });
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
    // B-323e: both runs through THE STARTER (the access probe's road); no answer is 'unknown'
    return this._rcloneProbeRun(['lsf', remote, '--files-only', '--max-depth', '1', '--retries', '1', '--low-level-retries', '1'], env, timeoutMs).then((r) => {
      const file = String((r && r.stdout) || '').split('\n').filter(Boolean)[0];
      if (!r || r.unknown || !r.started || r.timedOut || r.code !== 0 || !file || String(r.stdout).length >= PROBE_OUT_MAX) return 'unknown'; // list handled by the access probe; no root file (or past the old 1 MB bound) → can't tell
      const target = remote.endsWith(':') || remote.endsWith('/') ? remote + file : `${remote}/${file}`;
      return this._rcloneProbeRun(['cat', '--count', '1', target, '--retries', '1', '--low-level-retries', '2'], env, timeoutMs).then((r2) => {
        if (!r2 || r2.unknown || !r2.started) return 'unknown';
        if (r2.code === 0 && !r2.timedOut) return 'ok';
        const s = String(r2.stderr || '');
        if (/401|403|Unauthorized|unauthenticated|invalid_grant|InvalidAuthenticationToken|AccessDenied|Forbidden/i.test(s)) return 'denied';
        return 'unknown';
      });
    });
  }

  /** Is an rclone daemon still serving this mountpoint? A SIGKILLed/crashed
   *  daemon leaves a ZOMBIE fuse entry in /proc/mounts ("Transport endpoint
   *  is not connected") — isMounted() lies, so recovery must key off the
   *  PROCESS (same exact-argv /proc scan as _killMountDaemon). */
  _bumpGen(id) { (this._mountGen || (this._mountGen = new Map())).set(id, ((this._mountGen.get(id)) || 0) + 1); }
  /** its follow: the person's Unmounts of a record, counted — moved by nothing else (a connect bumps its generation, never this) */
  _bumpWord(id) { (this._word || (this._word = new Map())).set(id, ((this._word.get(id)) || 0) + 1); }

  /** Is a daemon serving this mount point? B-e783: «not found» means «dead» in this manager, so the walk's «can't tell» (a
   *  process it could not read, a read that did not answer) is never «dead» by itself: the sweep (`witness`) then asks the mount
   *  point itself — a FUSE entry whose daemon is gone fails `ls -d` (ENOTCONN) — and the teardown roads never wait on it (no 4 s
   *  loop, no false «survived», no rc question for an unknown). No /proc (a hub on macOS): alive, as the release. */
  async _daemonAlive(mp, { witness = true, attrMs = 0 } = {}) {
    const st = await this._daemonState(mp);
    if (st === 'alive' || st === 'noproc') return true;
    if (st === 'dead') return false;
    return witness ? !(await this._zombieAt(mp, attrMs)) : false;
  }

  /** → 'alive' | 'dead' | 'unknown' | 'noproc'. The daemon RECORDED for this mount point (at its spawn, its adopt, or the last
   *  walk that named it) is judged first by its stat line — one read, no walk (PI.aliveIdentity: the start time; a recycled pid
   *  is not it) — then the walk. */
  async _daemonState(mp) {
    if (!hasProc(this._procOpts)) return 'noproc';
    if (this._recordedAlive(mp)) return 'alive';
    let w; try { w = await this._walk({ mp }); } catch (e) { const named = this._unkilled((e && e.partial) || []); if (named.length) { this._record(mp, named[0]); return 'alive'; } return 'unknown'; }   // B-e783 cure: what the walk NAMED before a stall is alive (recorded)
    if (this._unkilled(w.ids).length) return 'alive';
    return w.unread > 0 ? 'unknown' : 'dead';
  }

  /** The mount point's own answer: a FUSE entry whose daemon is gone fails `ls -d` (ENOTCONN) — a child with the row's own
   *  patience (the probe's: the held child is shared by its key); a child that never started (`spawnErr`) answers nothing. */
  async _zombieAt(mp, ms) { try { const r = await this._probeMountpoint(mp, ms || LIVENESS.probeCell(null).attrMs, 'attr'); return !!r && r.health === 'error' && !r.spawnErr; } catch { return false; } }

  /** The recorded daemon of `mp` when its stat line still says it is that process (any state but a zombie); clears a stale one. */
  _recordedAlive(mp) {
    const rec = this._daemonIds && this._daemonIds.get(mp);
    if (!rec) return null;
    if (this._killed && this._killed.has(rec.pid + ':' + rec.starttime)) { this._daemonIds.delete(mp); return null; }   // killed by this manager: never alive for it again
    const o = this._procOpts && this._procOpts.procRoot ? { procRoot: this._procOpts.procRoot } : undefined;
    const a = PI.aliveIdentity(rec, o);
    if (a === true) return rec;
    if (a === false) this._daemonIds.delete(mp);
    return null;
  }
  /** cure 2: the ids a walk named, less any this manager killed while that walk ran, or that ended since — never handed out, never «alive» for it. */
  _unkilled(list) { if (!list.length) return list; const k = this._killed, o = this._procOpts && this._procOpts.procRoot ? { procRoot: this._procOpts.procRoot } : undefined; return list.filter((x) => !(k && k.has(x.pid + ':' + x.starttime)) && PI.aliveIdentity({ pid: x.pid, starttime: x.starttime }, o) !== false); }   // r5: nor one that has ended since (its key pruned by a later walk) — its stat line
  _record(mp, id) { if (this._killed && this._killed.has(id.pid + ':' + id.starttime)) return; (this._daemonIds || (this._daemonIds = new Map())).set(mp, { pid: id.pid, starttime: id.starttime }); }   // a daemon this manager killed is never recorded (it lingers)

  /** The daemon THIS hub spawned is known from its first moment: the pid and its start time — ONE stat line, read at once (no
   *  memory-map lock; never through the pool, which a wedged mount may hold — the record is what judges and kills with no walk). */
  _seedDaemonId(mp, pid, given = null) {
    if (!pid) return;
    const root = this._procOpts && this._procOpts.procRoot;
    const st = given != null && !root ? given : PI.starttimeOf(pid, root ? { procRoot: root } : undefined);
    if (st != null) this._record(mp, { pid, starttime: st });
  }

  /** its follow (主开发 r1782 (1)): a daemon THIS connect started for a mount the person disconnected meanwhile — ended by the
   *  identity its starter ANSWERED (the pid and the start time read at its spawn) and by nothing else: a record or an identity read
   *  NOW may name a pid the person's Unmount already ended and the kernel gave to another process (its read's MUST 2). Ended already
   *  (the Unmount's walk) or gone: nothing to do. NO /proc: no start time came back — ONE ps row (`_psRow`, by THE STARTER: off the
   *  hub's loop and its process) names the process: ours only when ITS PROGRAM is the mount's (rclone) and it began around this ask
   *  (`askAt`, by its age: a pid freed and taken by a stranger in that window is never signalled — line 385's small follow, r2259 (1));
   *  the signal's own judge reads that same row. Not provable ⇒ the next start on that mount point waits for it, said */
  async _endStartedDaemon(mp, st, askAt = 0) {
    const o = this._procOpts || {}, popts = { ...(o.procRoot ? { procRoot: o.procRoot } : {}), ...(o.kill ? { kill: o.kill } : {}), ...(o.ps ? { ps: o.ps } : {}), what: 'the daemon of a storage mount point' };
    const ident = { pid: Number(st.pid), starttime: st.starttime == null ? null : st.starttime }, key = ident.pid + ':' + ident.starttime;
    if (this._killed && this._killed.has(key)) return true;
    const proc = hasProc(this._procOpts);
    let target = ident;
    if (!proc) {   // no /proc: ONE ps row — its program the mount's, its age within two minutes of this ask (a clock stepped since the boot moves
      // a start by seconds); the signal's own judge reads that same row (a second ps may move lstart by a second: our own daemon read «recycled»)
      const row = await this._psRow(ident.pid);
      if (row && row.gone) return true;   // ps answered: no such process — ours ended (nothing to end, nothing to hold)
      const age = row ? etimeSec(row.etime) : NaN, prog = path.basename(this.rcloneBin() || 'rclone').slice(0, 15);   // a comm is 15 characters at most
      const ours = !!row && path.basename(row.comm || '').slice(0, 15) === prog && Number.isFinite(age) && Math.abs(Date.now() - age * 1000 - askAt) <= 120000;
      if (ours && this._killed && this._killed.has(ident.pid + ':' + row.lstart)) return true;   // ended already (its start: never a pid alone)
      target = ours ? { pid: ident.pid, starttime: null, lstart: row.lstart, bootId: '' } : null;
      if (target) popts.ps = (p) => (Number(p) === ident.pid ? { ran: true, state: row.state || 'S', lstart: row.lstart } : { ran: true, state: null, lstart: null });
    }
    const r = target ? PI.signalIdentity(target, 'SIGKILL', popts) : { ok: false, why: 'unknown-identity' };
    if (r.ok) { (this._killed || (this._killed = new Map())).set(proc ? key : ident.pid + ':' + target.lstart, Date.now()); const rec = this._daemonIds?.get(mp); if (rec && Number(rec.pid) === ident.pid) this._daemonIds.delete(mp); return true; }
    if (r.why === 'gone' || r.why === 'pid-recycled') return true;   // ours ended (its pid another's now: never signalled)
    if (!proc) (this._lostStart = this._lostStart || new Map()).set(mp, Date.now());   // only where no walk can look (with /proc the next connect's walk finds it)
    console.warn(`[mounts] the daemon started for a mount disconnected meanwhile was not ended (${r.why})${proc ? '' : ' — the next start on that mount point waits for it'}`);
    return false;
  }

  /** line 385's small follow (主开发 r2259 (1)(3)): ONE ps row of a pid — { state, etime, lstart, comm } — asked of THE STARTER (never a start
   *  from the hub's own process, never its loop: a person's Disconnect waits on nothing synchronous), the C locale; { gone: true } when
   *  ps answered that no such process runs; null when unanswered (its bound: the ask's 3 s, the starter's guard and one grace — about 7 s) */
  async _psRow(pid) {
    const r = await require('./server/child-starter').childStarter().run('ps', ['-o', 'stat=', '-o', 'etime=', '-o', 'lstart=', '-o', 'comm=', '-p', String(Number(pid))], { timeoutMs: 3000, capture: true, maxBuffer: 4096, envAdd: { PATH: process.env.PATH || '', LC_ALL: 'C' } }).catch(() => null);
    if (r && !r.unknown && r.started && r.code === 1 && !String(r.stdout || '').trim()) return { gone: true };   // ps: no such process
    const f = r && !r.unknown && r.started && r.code === 0 ? String(r.stdout || '').trim().split(/\s+/) : [];
    return f.length >= 8 ? { state: f[0], etime: f[1], lstart: f.slice(2, 7).join(' '), comm: f.slice(7).join(' ') } : null;
  }

  /** B-e783: the daemon a connect ADOPTS — its pid, 0 (none: spawn; no /proc: spawn, as the release), or null («can't tell»: a
   *  process the walk could not read, a read that stalled before it named one — neither adopt nor spawn, for CANT_TELL_MS at most:
   *  the sleeper may be any rclone, a pull mount's or another instance's, so the wait ends and the connect goes on, said). */
  async _adoptable(mp, id = '') {
    const ct = this._cantTell || (this._cantTell = new Map());
    let pids, noProc = false;
    try { const p = (await this._daemonPids(mp, { strict: true }))[0] || 0; ct.delete(mp); return p; }
    catch (e) {
      // B-323e (主开发 r1299, law 2 with NO /proc): a detached start whose ANSWER WAS LOST may live, and no walk can say so — the
      // connect waits on it as on «can't tell» (bounded; the mount table shows it if it mounts meanwhile), never a second daemon at once
      if (e && e.code === 'no_proc') { if (!this._lostStart?.has(mp)) return 0; noProc = true; pids = ['(a start whose answer was lost)']; }
      else pids = (e && e.unreadPids) || [];
    }
    const was = ct.get(mp), now = Date.now();   // r8: «can't tell» may be ANY rclone asleep (a pull mount's, another instance's) — bounded
    const since = was && now - was.at < CANT_TELL_GAP_MS ? was.since : now;   // r9: from the FIRST refusal of this episode
    ct.set(mp, { since, at: now, pids });
    const lost = this._lostStart?.get(mp);   // (no /proc) a lost start is held as long as a start may take — its ceiling — never «can't tell»'s 60 s
    if (noProc && lost != null && now - lost < (this._startingT || MountManager.STARTING).ceilingMs) return null;   // its follow (r1782 (2)): only where no walk can look
    if (now - since < (this._cantTellMs ?? CANT_TELL_MS)) return null;
    ct.delete(mp); this._lostStart?.delete(mp);
    console.warn(`[mounts] mount ${id}: «can't tell» for ${Math.round((Date.now() - since) / 1000)} s (unread: ${pids.join(', ') || 'a read that stalled'}) — connecting`);   // the record id, never its name
    return 0;
  }

  /** Pids of the rclone daemons serving a mountpoint — the recorded one if it still runs, else the walk; throws without /proc
   *  (`strict`: also when the walk named none but could not read a process — `walk_unknown`). */
  async _daemonPids(mp, { strict = false } = {}) {
    if (!hasProc(this._procOpts)) throw Object.assign(new Error('no /proc'), { code: 'no_proc' });
    const rec = this._recordedAlive(mp);
    if (rec) return [rec.pid];
    let w;
    try { w = await this._walk({ mp }); }
    catch (e) { const named = this._unkilled((e && e.partial) || []); if (named.length) { this._record(mp, named[0]); return named.map((x) => x.pid); } if (e) e.partial = named; throw e; }   // a stall's rethrow carries only the living (no caller adopts the dying daemon)   // B-e783 cure: what the walk NAMED before a stall is alive (the probe keeps its CPU witness)
    const ids = this._unkilled(w.ids);
    if (ids.length) this._record(mp, ids[0]);
    else if (strict && w.unread > 0) throw Object.assign(new Error('a process could not be read'), { code: 'walk_unknown', partial: [], unreadPids: w.unreadPids });
    return ids.map((x) => x.pid);
  }

  /** B-e783: THE walk of /proc for the daemons of a mount point (or, `authorize`, for orphaned rclone authorize processes) —
   *  ASYNC, one process at a time, BOUNDED per read. Its rules, each the answer to a read that refuted an earlier round:
   *  · OUR daemons are named by what they HOLD: the spawn gives each the mount's own log as stdout (<logDir>/<id>.log, .log.1
   *    after a rotation, « (deleted)» after a second), so readlink(/proc/<pid>/fd/1) says whose record it serves — in ANY state
   *    (stat and readlink take no memory-map lock): an rclone by its comm, of a record on this mount point.
   *  · Any OTHER process is judged by the release's rule (its argv: an rclone, «mount», the mount point) — an rclone by its comm
   *    only, and only while NO thread of it sleeps in the kernel (a command line read takes the memory map's lock and parks a
   *    pool thread for as long as a sleeper holds it). An rclone it cannot read safely is `unread` (the caller's «can't tell»).
   *  · fd/1 refused (EACCES/EPERM): another user's process is not ours; ours (its /proc dir is our uid — a non-dumpable rclone)
   *    is judged by its argv. A process that ended is not ours; any other read error is `unread`.
   *  · Every read has READ_MS: one that does not answer ends the walk (a throw carrying what it named so far, `partial`) and its
   *    process is never read again while it lives; the walk stops there. A daemon this manager SIGKILLed is never named again
   *    while it lingers (never adopted). `_procOpts` = a suite's planted /proc and kill. → { ids: [{pid, starttime, state}], unread } */
  async _walk({ mp = null, authorize = false } = {}) {
    if (!hasProc(this._procOpts)) throw new Error('no /proc');
    const root = (this._procOpts && this._procOpts.procRoot) || '/proc';
    let owners = new Map();   // log path as readlink states it → record id (asked inside the walk: its read is bounded too)
    const here = new Set(authorize ? [] : this._state.mounts.filter((x) => { try { return this.pathOf(x) === mp; } catch { return false; } }).map((x) => x.id));
    const killed = this._killed || (this._killed = new Map()), skip = this._unreadable || (this._unreadable = new Map());
    const myUid = typeof process.getuid === 'function' ? process.getuid() : null;
    const ids = [], seen = new Set();
    let unread = 0, inFlight = null, stalled = null, timer = null, stopped = false, listedAt = Infinity;
    const unreadPids = [], cant = (pid) => { unread++; unreadPids.push(Number(pid)); };
    const read = (key, p) => { inFlight = key; clearTimeout(timer); timer = setTimeout(() => stalled && stalled(), this._readMs || READ_MS); if (timer.unref) timer.unref(); return p.finally(() => { inFlight = null; clearTimeout(timer); }); };
    const stall = new Promise((_, rej) => { stalled = () => rej(Object.assign(new Error('a /proc read did not answer'), { code: 'walk_stalled' })); });
    const work = (async () => {
      if (!authorize) owners = await this._logOwners(read);
      if (stopped) return;
      const pids = (await read(null, fs.promises.readdir(root))).filter((n) => /^\d+$/.test(n) && Number(n) !== process.pid);
      listedAt = Date.now();   // cure 2 r3: a kill stamped after this listing is not judged by it
      for (const pid of pids) {
        if (stopped) return;
        seen.add(pid);
        if (!authorize) {
          let to = null;
          try { to = String(await read(null, fs.promises.readlink(`${root}/${pid}/fd/1`))).replace(/ \(deleted\)$/, ''); }
          catch (e) {
            if (e && (e.code === 'EACCES' || e.code === 'EPERM')) {   // another user's — or ours made non-dumpable (an rclone given file caps): its owner says
              const o = await read(null, fs.promises.stat(`${root}/${pid}`)).catch(() => null);
              if (!o || myUid == null || o.uid !== myUid) continue;
            }
          }
          if (stopped) return;
          if (to && owners.has(to)) {
            if (!here.has(owners.get(to))) continue;   // another record's daemon: never this mount point's, never «can't tell»
            const st = await read(null, procStat(root, pid));
            if (st.err || !/rclone/.test(st.comm) || st.state === 'Z' || st.state === 'X' || killed.has(pid + ':' + st.start)) continue;   // a child holding the log (a sleep) is no daemon
            ids.push({ pid: Number(pid), starttime: st.start, state: st.state });
            continue;
          }
        }
        const st = await read(null, procStat(root, pid));
        if (stopped) return;
        if (st.err) { if (!notOurs(st.err)) cant(pid); continue; }
        if (!/rclone/.test(st.comm) || st.state === 'Z' || st.state === 'X') continue;
        const key = pid + ':' + st.start;
        if (killed.has(key)) continue;
        if (skip.has(key) || st.state === 'D' || await this._threadAsleep(root, pid, read)) { cant(pid); continue; }
        if (stopped) return;
        let argv;
        try { argv = String(await read(key, fs.promises.readFile(`${root}/${pid}/cmdline`, 'utf8'))).split('\0'); } catch (e) { if (!notOurs(e)) cant(pid); continue; }
        const bin = /rclone/.test(path.basename(String(argv[0] || '')));
        if (bin && (authorize ? argv.includes('authorize') : (argv.includes('mount') && argv.includes(mp)))) ids.push({ pid: Number(pid), starttime: st.start, state: st.state });
      }
    })();
    try { await Promise.race([work, stall]); }
    catch (e) {
      stopped = true;
      if (e && e.code === 'walk_stalled' && inFlight) skip.set(inFlight, Date.now());
      work.catch(() => { });
      throw Object.assign(e, { partial: ids.slice(), unreadPids: unreadPids.concat(inFlight ? [Number(String(inFlight).split(':')[0])] : []) });
    }
    finally { clearTimeout(timer); }
    for (const k of [...skip.keys()]) if (!seen.has(k.split(':')[0])) skip.delete(k);   // that process is gone: forgotten
    for (const [k, at] of [...killed]) if (at < listedAt && !seen.has(k.split(':')[0])) killed.delete(k);   // cure 2: forgotten only when that process is gone from a listing taken AFTER its kill (a killed daemon asleep in the kernel can linger past any clock)
    return { ids, unread, unreadPids };
  }

  /** Any thread of `pid` asleep in the kernel (its tasks' stat lines — no memory-map lock): its command line must not be read. */
  async _threadAsleep(root, pid, read) {
    let tasks = [];
    try { tasks = await read(null, fs.promises.readdir(`${root}/${pid}/task`)); } catch { return false; }
    for (const t of tasks) { const st = await read(null, procStat(`${root}/${pid}/task`, t)); if (!st.err && st.state === 'D') return true; }
    return false;
  }

  /** Every record's own log — its daemon's stdout — as readlink states it (the log dir and its real path, the rotation): → id. */
  async _logOwners(read = (k, p) => p) {
    if (!this._logDirReal) {   // a dir not made yet: asked again; ONE realpath in flight — a stalled one is joined by every walk, never a second pool thread
      const p = this._logDirRealP || (this._logDirRealP = fs.promises.realpath(this._logDir).then((r) => { this._logDirReal = r; }, () => { }).finally(() => { this._logDirRealP = null; }));
      await read(null, p);   // bounded like every read of the walk
    }
    const out = new Map();
    for (const m of this._state.mounts) {
      for (const d of new Set([this._logDir, this._logDirReal].filter(Boolean))) { const f = path.join(d, `${m.id}.log`); out.set(f, m.id); out.set(f + '.1', m.id); }
    }
    return out;
  }

  // B-e783: the kill of a mount point's daemons — the RECORDED one first (judged by its stat line at the kill: no walk, so a pool
  // parked by a wedged mount never keeps it alive), then every one the walk names (awake or asleep in the kernel: a FUSE wait is
  // killable; what a stalled walk named so far still counts), each as itself (PI.signalIdentity), and remembered so the next
  // mount never adopts it while it lingers. → the pids signalled; non-Linux: no /proc — [] (the daemon exits with the unmount)
  async _killMountDaemon(mp) {
    const o = this._procOpts || {}, hit = [];
    const opts = { ...(o.procRoot ? { procRoot: o.procRoot } : {}), ...(o.kill ? { kill: o.kill } : {}), what: 'the daemon of a storage mount point' };
    const sig = (id) => {
      if (!id || hit.includes(id.pid)) return;
      const r = PI.signalIdentity(id, 'SIGKILL', opts);
      if (r.ok) { hit.push(id.pid); (this._killed || (this._killed = new Map())).set(id.pid + ':' + id.starttime, Date.now()); }
    };
    if (!hasProc(this._procOpts)) return hit;
    sig(this._daemonIds && this._daemonIds.get(mp));
    let ids = []; try { ids = (await this._walk({ mp })).ids; } catch (e) { ids = (e && e.partial) || []; }
    for (const id of ids) sig(id);
    if (hit.length && this._daemonIds) this._daemonIds.delete(mp);
    return hit;
  }


  /** Gather ONE sweep's witnesses for a mounted record and apply the table's verdict (lane mount-liveness): attr =
   *  `ls -d` (liveness — answered without a backend call), list = `ls` (readiness), backend = a fresh `rclone lsf` only
   *  when the listing hung, cpu = the daemon's tick Δ across the probes (/proc reads). Children with timeouts only. */
  async _probeLiveness(m, mp) {
    const row = rowFor(this, m), P = LIVENESS.probeCell(row);
    let pid = 0;
    const gen0 = this._mountGen?.get(m.id);   // B-e783: a teardown is never applied to a mount that moved while the witnesses were gathered
    try { pid = row.daemon === false ? 0 : ((await this._daemonPids(mp))[0] || 0); } catch {}
    const cpu0 = pid ? await this._cpuTicks(pid) : null;
    const st = (r) => { const x = typeof r === 'object' && r ? r : { health: r }; return { state: x.health || 'skipped', ms: x.ms || 0, held: !!x.held }; };
    const attr = st(await this._probeMountpoint(mp, P.attrMs, 'attr'));
    const list = attr.state === 'hung' || attr.state === 'unknown' ? st('skipped') : st(await this._probeMountpoint(mp, P.listMs));
    // B-91aa: a probe that got NO ANSWER (the starter dead or slow) is no witness at all — the table is not asked, the
    // verdict stands as it was (a false «down» would strike, heal or remount a healthy mount)
    if (attr.state === 'unknown' || list.state === 'unknown') return { verdict: 'unknown', unknown: true, health: 'unknown', teardown: false };
    let backend = st('skipped');
    if (list.state === 'hung' && row.rclone !== false) {
      const t0 = Date.now();
      const said = await this._probeBackendAccess(m);   // ok · denied (an answer: the vendor is reachable) · hung · unknown (inconclusive)
      backend = { state: said === 'ok' ? 'ok' : said === 'denied' ? 'error' : said === 'hung' ? 'hung' : 'skipped', ms: Date.now() - t0, held: false };
    }
    const cpu1 = pid ? await this._cpuTicks(pid) : null;
    const T = this._startingT || MountManager.STARTING;
    const w = { daemonAlive: true, attr, list, backend, cpuTicks: cpu0 != null && cpu1 != null ? cpu1 - cpu0 : null, progressTicks: T.progressTicks, now: Date.now(), gen0 };
    const v = await this._livenessApply(m, mp, w);
    return { ...v, health: list.state };
  }

  /** Apply a verdict: the journal line + `mount-probe-ms` metric on every strike / teardown, the block, the row's words,
   *  the teardown (named cause). `list()` carries the last verdict as `probe`. */
  async _livenessApply(m, mp, w) {
    this._liveness = this._liveness || new Map();
    const v = LIVENESS.livenessStep(this._liveness.get(m.id)?.state, w, rowFor(this, m));
    if (!this._state.mounts.some((x) => x.id === m.id) || (w && 'gen0' in w && this._mountGen?.get(m.id) !== w.gen0)) return { ...v, verdict: 'moved', teardown: false, park: false, dropped: true };   // B-e783: removed, or moved while its witnesses were gathered — dropped whole (no strikes, no words, no teardown; its callers see no verdict to act on)
    this._liveness.set(m.id, { state: v.state, verdict: v.verdict, strikes: v.strikes.n, lastMs: Math.round((w.list && w.list.state !== 'skipped' ? w.list.ms : w.attr?.ms) || 0), at: Date.now(), seq: (this._livenessSeq = (this._livenessSeq || 0) + 1) });   // `seq`: B-5ce7's Reconnect reads only a verdict of THIS connect (a counter, never the clock: two verdicts in one millisecond are told apart)
    if (v.verdict === 'alive') {
      if (v.unblock) this.unblockPath(mp);
      // B-5ce7 (B-f230): the stopped-process notice resolves itself at the answer — and the FIRST answer after a boot resolves one
      // a hub before this one filed (r1 #9: the said-set lives in memory)
      const first = !(this._answeredOnce = this._answeredOnce || new Set()).has(m.id);
      if (first || this._killedSaid?.has(m.id)) { this._answeredOnce.add(m.id); this._killedSaid?.delete(m.id); try { this.onAnswered?.(m); } catch { } }
      return v;
    }
    console.warn(LIVENESS.verdictLine(m.id, v, w));   // the record id, never its name (the journal ring outlives a clear)
    try { global.__vsMetric?.('mount-probe-ms', Math.round((w.list?.state === 'hung' ? w.list.ms : w.attr?.ms) || 0), `mount=${m.id} verdict=${v.verdict}`); } catch {}
    if (v.blockMs) this.blockPath(mp, v.blockMs);
    const words = this._sayCoded(m.id, LIVENESS.wordsFor(v.words.key, 'en', v.words.vars), MW.LIVE + v.words.key, v.words.vars);   // B-af94: the page words the verdict from the same table
    if (this._errors.get(m.id) !== words) { this._errors.set(m.id, words); if (!v.teardown) this._notify(); }
    if (v.teardown && v.verdict !== 'died') {
      // desired stays 'mounted' → the sweep's dead-mount branch reconnects with backoff; only a user Unmount ends supervision —
      // B-5ce7: unless the verdict PARKS (a wedge: the reconnect re-wedges — the flap loop): kept disconnected, said, a For-you
      // item with the Reconnect door; nothing automatic connects it again
      await this.unmount(m.id, { internal: true });
      await this._killMountDaemon(mp);
      this._forgetHeldProbes(mp);   // r1 #11: a stuck `ls` of the OLD daemon must not read «hung (still)» on the next mount
      // r1 #10: the teardown awaited up to seconds — a person's Unmount / Remove in that window wins (no park, no backoff)
      const live = this._state.mounts.find((x) => x.id === m.id);
      if (live && live.desired === 'mounted') {
        if (v.park) this._park(live, v, w);
        else this._noteReconnectBackoff(m.id);
        // B-5ce7 (merged B-f230): its process was stopped (silent, or its storage unreachable past the ceiling) — the person
        // KNOWS it until it answers again
        if (v.verdict === 'dead' || v.verdict === 'unreachable') this._saidKilled(live);
      }
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
        // unknown: not proof either way — fall through to generic handling; the cure's read: an auth error SHOWING stays until a
        // probe proves it gone (a backend probe that got no answer, or hung, is not that proof)
        if (showingAuthErr && acc !== 'ok') return undefined;
      } else if (showingAuthErr) {
        return undefined; // keep the auth error until a probe proves otherwise
      }
    }
    if (health === 'error') {
      // User-owned backend (SMB/NAS, SFTP, own S3): a single non-zero ls is
      // NOT proof of denial. Re-probe; if it lists now it was transient, and
      // if the backend itself lists fine the ls error was a benign quirk.
      const again = healthOf(await this._probeMountpoint(mp));
      if (again === 'unknown' || again === 'hung') return undefined;   // B-91aa (its readers): no answer, or a hang, is no proof either way — the banner stands; only a listing clears it
      if (again !== 'error') return null;
      const acc = await this._probeBackendAccess(m);
      if (acc === 'ok') return null;
      if (acc === 'unanswered') return undefined;   // B-323e: the starter gave no answer — no proof, the banner stands as it is
      return this._accessErrorMsg(m); // persistently broken → honest message
    }
    return null; // healthy + not revocable → definitely fine
  }

  async _healthSweep() {
    if (this._sweepBusy) return;
    try { const { pruneSignIns } = require('./gmail-sync'); pruneSignIns(this._driveSignIns); pruneSignIns(this.gmail && this.gmail._signIns); } catch { }   // B-e40d: a sign-in's client leaves at its day's end
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
        const gen0 = this._mountGen?.get(m.id);
        if (rowFor(this, m).daemon !== false && !(await this._daemonAlive(mp, { attrMs: LIVENESS.probeCell(rowFor(this, m)).attrMs }))) {
          // B-e783: the walk was awaited — a mount that began STARTING or CONNECTING meanwhile, that the person unmounted or
          // connected again (its generation moved), is not dead
          if (this._starting?.has(m.id) || this._connecting?.has(m.id) || !this.isMounted(m) || this._mountGen?.get(m.id) !== gen0) continue;
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
  /** B-5ce7 cure: the PARKED record whose mount point holds p → {id, name, mp} | null — an array walk, no fs (the doors'
   *  question: a parked mount's refusal names it and its doors, never «try again in a moment»). */
  parkedAt(p) {
    if (!p) return null;
    const rp = String(p);
    for (const m of this._state.mounts) {
      if (!m.parked) continue;
      let mp = m.parked.mp || ''; if (!mp) { try { mp = this.pathOf(m); } catch { continue; } }   // the path it was parked AT (an edit may move the record's)
      if (mp && (rp === mp || rp.startsWith(mp + '/'))) return { id: m.id, name: m.name || m.id, mp };
    }
    return null;
  }
  /** B-5ce7 cure: THE Reconnect door's answer (POST /api/mounts/:id/reconnect): mount() — which ends the park and forgets the
   *  last sweep's verdict — then {ok, state} as the For-you row's said words read: 'pass' only when the mount answers its
   *  checks, 'checking' when it came up still being checked (or rebuilds its cache index), else {ok:false, error}. */
  async reconnect(id) {
    const s0 = this._livenessSeq || 0;   // the last verdict before the press (a counter: the clock cannot order two verdicts in one ms)
    const ok = await this.mount(id);
    const row = this.list().find((x) => x.id === id);
    const coded = (r) => (r && r.errorCode ? { code: r.errorCode, params: r.errorParams || {} } : {});   // B-af94 (its read): the For-you Reconnect words the row's code
    if (!(ok || (row && row.mounted))) return row && row.error ? { ok: false, error: row.error, ...coded(row) } : { ok: false, error: MW.wordsFor('storage_not_connected'), code: 'storage_not_connected', params: {} };
    // 'pass' ONLY on THIS connect's own answer — the mount's first check said alive at or after the press (round 2 of the cure:
    // a verdict from before the press, or none at all, is 'checking'; the sweep's verdicts are never deleted — the cache
    // placement reads them); alive but the row says what is wrong (a sign-in that expired) is that error, never the success words
    const lv = this._liveness && this._liveness.get(id);
    if (ok !== 'starting' && lv && lv.verdict === 'alive' && lv.seq > s0) return row && row.error ? { ok: false, error: row.error, ...coded(row) } : { ok: true, state: 'pass' };
    return { ok: true, state: 'checking' };
  }
  /** B-5ce7 (B-f230): a stopped process is said once per episode (`onKilled`), resolved at its next answer. */
  _saidKilled(m) {
    (this._killedSaid = this._killedSaid || new Set()).add(m.id);
    try { this.onKilled?.(m, {}); } catch (e) { console.warn(`[mounts] ${m.id}: the stopped notice was not filed: ${e.message}`); }
  }
  /** r1 #11: the held probe children of a mount point (the `list:` / `attr:` keys of _probeMountpoint) are forgotten. */
  _forgetHeldProbes(mp) { this._heldProbes?.delete('list:' + mp); this._heldProbes?.delete('attr:' + mp); }
  /** B-5ce7: PARK a torn-down record — persisted (`m.parked`, so a restart keeps it disconnected), its words on the row, its
   *  path BLOCKED while parked (r1 #6: the hub's own doors answer, never write into the bare folder), and the For-you producer
   *  told (`onPark`, wired to src/server/mount-for-you.js). The record id in the journal, never its name. */
  _park(m, v, w) {
    const n = (v.strikes && v.strikes.n) || 0;
    let provider = ''; try { provider = String(this._sourceLabel(m) || ''); } catch { }
    const mp = this.pathOf(m);
    m.parked = { at: Date.now(), verdict: v.verdict, reason: String(v.reason || '').slice(0, 240), strikes: n, provider, mp };   // provider + path kept: the same at every re-filing, unblocked where blocked
    this._reconnects?.delete(m.id);
    this._save();
    this.blockPath(mp, MountManager.PARK_BLOCK_MS);
    if (this._killedSaid?.delete(m.id)) { try { this.onAnswered?.(m); } catch { } }   // r1 #8: a stopped-process notice ends with the park
    this._errors.set(m.id, this._parkedWords(m));
    console.warn(`[mounts] ${m.id} PARKED after the ${v.verdict} teardown (${n} strikes) — no automatic reconnect until the person's Reconnect`);   // the record id and the verdict only (the record-clear census)
    try { this.onPark?.(m, { verdict: v.verdict, reason: m.parked.reason, strikes: n, provider }); } catch (e) { console.warn(`[mounts] ${m.id}: the parked notice was not filed: ${e.message}`); }
  }
  /** B-5ce7: END a park (the person's connect / Unmount, the record removed) — the For-you item resolves (`onUnpark`). */
  _unpark(m, why) {
    if (!m || !m.parked) return;
    const parkedMp = m.parked.mp;
    delete m.parked;
    this._save();
    try { this.unblockPath(parkedMp || this.pathOf(m)); } catch { }   // the path it was blocked at (an edit may have moved the record's)
    if (this._errors.get(m.id) === this._parkedWordsFor(m.id)) this._errors.delete(m.id);
    console.warn(`[mounts] ${m.id} park ended (${why})`);
    try { this.onUnpark?.(m, why); } catch (e) { console.warn(`[mounts] ${m.id}: the parked notice was not resolved: ${e.message}`); }
  }
  /** B-af94: a row's words with their code — recorded beside `_errors` (a code is shown only while ITS words are the row's;
   *  a paramless sentence of ours is found by its words, src/mount-error-words.js codeOfWords). → the words */
  _sayCoded(id, words, code, params) { (this._errorCodes = this._errorCodes || new Map()).set(id, { words, code, params: params || {} }); return words; }
  _sayW(id, code, params) { return this._sayCoded(id, MW.wordsFor(code, params), code, params); }
  _sayE(id, e) { const words = String((e && e.message) || e); if (e && MW.known(e.code)) this._sayCoded(id, words, e.code, e.params); return words; }
  _errorCodeOf(id) {
    const words = this._errors.get(id), c = words && this._errorCodes && this._errorCodes.get(id);
    if (c && c.words === words) return { errorCode: c.code, errorParams: c.params };
    const k = MW.codeOfWords(words);
    return k ? { errorCode: k.code, errorParams: k.params } : {};
  }

  _parkedWords(m) {
    const N = (m.parked && m.parked.strikes) || 2, words = this._sayCoded(m.id, LIVENESS.wordsFor('wedged', 'en', { N }), MW.LIVE + 'wedged', { N });   // the one verdict that parks
    (this._parkedSaid = this._parkedSaid || new Map()).set(m.id, words);
    return words;
  }
  _parkedWordsFor(id) { return this._parkedSaid?.get(id); }

  _noteReconnectBackoff(id) {
    const r = (this._reconnects = this._reconnects || new Map());
    const st = r.get(id) || { attempts: 0, nextAt: 0 };
    st.attempts++;
    st.nextAt = Date.now() + [60, 120, 300, 600][Math.min(st.attempts - 1, 3)] * 1000;
    r.set(id, st);
  }

  async _maybeAutoRemount(m) {
    if (m.parked) return;   // B-5ce7: a parked mount waits for the person's Reconnect — never a remount loop
    const mp = this.pathOf(m);
    if (this.pathBlocked(mp) || this._connecting?.has(m.id) || this._starting?.has(m.id)) return; // connect/start/teardown in flight
    if (m.expiresAt && Date.now() > m.expiresAt) return;             // expired — user must re-import
    const err = this._errors.get(m.id) || '', said = this._errorCodes && this._errorCodes.get(m.id);
    // B-323e (its re-read): a mount point's OWN refusal (mp_*) is never an auth verdict — its words carry paths and a destination's
    // stamp («…0401…» read as «401»); the words are tested only when the row's error is not one
    const mpOwn = !!said && said.words === err && /^mp_/.test(String(said.code || ''));
    if (!mpOwn && /denied|revoked|expired|AccessDenied|SignatureDoesNotMatch|self-mount|bucket-scoped|credential|log ?in|invalid_grant|unauthorized|401|403/i.test(err)) return;
    const st = this._reconnects?.get(m.id);
    if (st && Date.now() < st.nextAt) return;
    this._noteReconnectBackoff(m.id);
    const n = this._reconnects.get(m.id).attempts;
    this._errors.set(m.id, this._sayW(m.id, 'reconnecting', { n }));
    this._notify();
    // A crashed daemon leaves a dead fuse endpoint ("Transport endpoint is
    // not connected") that blocks the fresh mount — clear it first.
    if (rowFor(this, m).daemon !== false) {
      // B-323e (its mount half): the clearing pair by THE STARTER (a mount that stays down is retried every 10 minutes — never a
      // fork of the hub), in turn, whatever each says (as the release); each bounded (10 s), so a wedged one never holds the reconnect
      const S = require('./server/child-starter').childStarter(), envAdd = { PATH: process.env.PATH || '' };
      await S.run('fusermount3', ['-uz', mp], { timeoutMs: 10000, envAdd }).catch(() => null);
      await S.run('fusermount', ['-uz', mp], { timeoutMs: 10000, envAdd }).catch(() => null);
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
    // B-323e's part 3 remainder: asked of the starter; its answer is read by nobody, as before (the mount's own answer decides)
    await viaStarter('sh', ['-c', 'command -v /sbin/modprobe >/dev/null 2>&1 || sudo -n sh -c \'mkdir -p /sbin && printf "#!/bin/sh\\nexit 0\\n" > /sbin/modprobe && chmod 755 /sbin/modprobe\' 2>/dev/null; true'], { timeoutMs: 10000, envAdd: { PATH: process.env.PATH || '' } });
  }

  /** A KERNEL mount's unmount (no fuse daemon to stop) — the cephfs row's `unmount` hook. */
  _kernelUnmount(m, mp, finish) {
    return new Promise((resolve) => {
      viaStarter('sudo', ['-n', 'umount', '-l', mp], { timeoutMs: 10000, termFirst: SUDO_TERM_GRACE_MS, envAdd: { PATH: process.env.PATH || '' } }).then(() => { let v = false; try { v = finish(!this.isMounted(m)); } catch (e) { console.warn(`[mounts] unmount of ${mp}: its finish threw (${(e && e.message) || e})`); } resolve(v); });   // B-323e: bounded as the trio is (a child that never ends no longer holds the press)
    });
  }

  async _mountCephfs(id) {
    const m = this._get(id);
    const mp = this.pathOf(m);
    const dest = await this._ensureMountpointDir(mp, { quarantine: true }).catch((e) => { this._strandedRefused(m, e); this._errors.set(id, this._sayE(id, e)); this._notify(); throw e; }); // sudo -n fallback covers root-owned parents
    if (dest) this._noteStranded(m, dest);   // B-5ce7 (B-f230, r1 #19): a CephFS mount's stranded files reach For-you too
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
      // B-323e's part 3 remainder: asked of the starter (the secret rides its argv as before — the starter writes no argv anywhere). An
      // ended failure is cephfs_failed as before; a start with NO ANSWER is judged by the mount table alone (mounted ⇒ mounted)
      viaStarter('sudo', ['-n', 'mount', '-t', 'ceph', src, mp, '-o', opts], { timeoutMs: 30000, termFirst: SUDO_TERM_GRACE_MS, capture: true, maxBuffer: 1024 * 1024, envAdd: { PATH: process.env.PATH || '' } }).then((r) => {   // the buffer: execFile's own default, as the release had it
        const err = endedOk(r) ? null : { message: r && r.timedOut ? 'no answer in 30000 ms' : noAnswer(r) ? 'no answer from the starter' : failWords(r) }, stderr = r && r.stderr;   // past its bound: the starter DID answer
        if ((err && !noAnswer(r)) || !this.isMounted(m)) {
          this._errors.set(id, this._sayW(id, 'cephfs_failed', { detail: String(stderr || err?.message || 'unknown').slice(0, 200 - 'CephFS mount failed: '.length) }));
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
    // B-323e's part 3 remainder: asked of the starter. The rc client over a unix socket needs none of the provider's sign-in values
    // (line 1004's follow, r4444 (f)): the starter's service env and PATH, never the record's whole rclone env
    const ask = (cmd) => viaStarter(this.rcloneBin(), ['rc', '--unix-socket', pick.path, cmd], { timeoutMs, capture: true, maxBuffer: 1024 * 1024, envAdd: { PATH: process.env.PATH || '' } }).then((r) => {
      if (!endedOk(r)) return { error: `${cmd}: ${r && r.timedOut ? `no answer in ${timeoutMs} ms` : noAnswer(r) ? 'no answer from the starter' : String((r && r.stderr) || failWords(r)).trim().split('\n').pop()}` };
      try { return { v: JSON.parse(String(r.stdout || '')) }; } catch { return { error: `${cmd}: not JSON` }; }
    });
    const [stats, queue] = await Promise.all([ask('core/stats'), ask('vfs/queue')]);
    if (stats.error) return { error: stats.error };
    return { stats: stats.v, queue: queue.error ? { error: queue.error } : queue.v };
  }

  /** A NEW daemon's log fd: data/mount-logs/<id>.log APPENDED (it was reopened 'w' at every remount, destroying the
   *  dead daemon's last words), rotated to <id>.log.1 past LOG_ROTATE_BYTES, one marker line per spawn. */
  /** B-323e (主开发 r1299, law 4): THE LOG PATH IS THE HUB'S OWN — the record's own file under the mount logs folder, judged here before
   *  any child is asked to open it (an id that would leave the folder is refused, never opened) */
  _mountLogFile(id) {
    const dir = path.resolve(this._logDir), f = path.resolve(dir, `${id}.log`);
    if (String(id).includes('\0') || path.dirname(f) !== dir || path.basename(f) !== `${id}.log`) throw Object.assign(new Error('a mount log path outside its folder'), { code: 'log_path' });
    return f;
  }
  _openMountLog(id) {
    fs.mkdirSync(this._logDir, { recursive: true });
    const f = this._mountLogFile(id);
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
      // B-323e's part 3 remainder: asked of the starter; NO ANSWER reads as a walk past its bound (unread, fail closed, retried at its bound)
      viaStarter(process.execPath, ['-e', CACHE_META_CHILD, require.resolve('./vfs-cache-place.js'), dir], { timeoutMs, capture: true, maxBuffer: 64 * 1024 }).then((r) => {
        if (!endedOk(r)) return resolve(noAnswer(r) || (r && r.overflow) ? { timedOut: true } : null);   // output past its buffer: as the release read it (the retry memo armed)
        try { resolve(JSON.parse(String(r.stdout || ''))); } catch { resolve(null); }
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
    // B-323e's part 3 remainder: asked of the starter; no answer is «not removed», retried after the next mount (the old dir stays named)
    viaStarter('rm', ['-rf', '--one-file-system', '--', dir], { timeoutMs: MountManager.CACHE_RM_MS, envAdd: { PATH: process.env.PATH || '' } }).then((r) => {
      const err = endedOk(r) ? null : r && r.timedOut ? 'timed out' : noAnswer(r) ? 'no answer from the starter' : failWords(r);
      console.log(`[mounts] vfs cache ${m.id}: ${err ? `old dir not removed (${err}) — retried after the next mount` : 'old dir removed by a child'}: ${dir}`);
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
    // B-323e (its mount half): by THE STARTER (a connect, and the sweep's reconnect of a mount that stays down); NO ANSWER from it is no
    // verdict — never «no permission» — said by its own code (mp_unanswered), and the reconnect asks again by itself
    const S = require('./server/child-starter').childStarter();
    // r1284 (6): a child KILLED AT ITS BOUND (a dead endpoint) is no verdict either; (1) an output past its bound is kept as `overflow`
    // (read FIRST: a listing past its bound is not empty, even when its end came at the bound); its re-read: a child that NEVER STARTED
    // (the starter's table full, EAGAIN, EMFILE) is no answer either — never «empty», «no permission» nor «not writable» on a guess;
    // `pid`: a child that may still run (a move is judged by it); the C locale, so an answered failure's words read as written
    const run = (cmd, args) => S.run(cmd, args, { timeoutMs: 8000, capture: true, envAdd: { PATH: process.env.PATH || '', LC_ALL: 'C' } }).then((r) => (!r || r.unknown || !r.started || (r.timedOut && !r.overflow)
      ? { ok: false, unknown: true, started: false, never: !!r && !r.unknown && !r.started, pid: (r && r.pid) || 0, stdout: '', stderr: '' }
      : { ok: !r.timedOut && r.code === 0 && !r.error, started: true, overflow: !!r.overflow, stdout: String(r.stdout || ''), stderr: String(r.stderr || r.error || '') }), () => ({ ok: false, unknown: true, started: false, pid: 0, stdout: '', stderr: '' }));
    const owner = `${typeof process.getuid === 'function' ? process.getuid() : 0}:${typeof process.getgid === 'function' ? process.getgid() : 0}`;
    // every no answer is no verdict (its reader's S1): never «no permission», «not writable», «not empty» nor «moved» on a guess
    const ask = async (cmd, args) => { const x = await run(cmd, args); if (x.unknown) throw MW.refusal('mp_unanswered', { mp }); return x; };
    let made = await ask('mkdir', ['-p', mp]);
    if (!made.ok && /permission denied|not permitted/i.test(made.stderr)) {
      const su = await run('sudo', ['-n', 'mkdir', '-p', mp]);   // a rescue with no answer: the plain step's answered verdict stands (its re-read's S2)
      if (su.ok) {
        await run('sudo', ['-n', 'chown', owner, mp]);
        global.__vsEvent?.('mount-mkdir-sudo');
        made = { ok: true };
      }
    }
    if (!made.ok) {
      throw MW.refusal('mp_no_permission', { mp, owner });
    }
    // Writability check catches a PRE-EXISTING root-owned dir too.
    let w = await ask('test', ['-w', mp]);
    if (!w.ok) {
      const su = await run('sudo', ['-n', 'chown', owner, mp]);   // (the same: its rescue's no answer leaves «not writable»)
      if (su.ok) { global.__vsEvent?.('mount-mkdir-sudo'); w = await ask('test', ['-w', mp]); }
    }
    if (!w.ok) throw MW.refusal('mp_not_writable', { mp, owner });
    if (!quarantine) return null;
    // Leftovers under an UNMOUNTED mount point are STRANDED writes: something
    // wrote into the bare directory while the storage was down. rclone
    // refuses "not empty" (and --allow-non-empty would only hide them under
    // the mount), so move the directory aside as a sibling — never delete,
    // never merge — and tell the user where it went. A dead fuse endpoint
    // answers ENOTCONN at once — it goes on as before (the reconnect's clearing pair, the stale-daemon belt); a listing with no answer
    // is «could not be checked», any other ANSWERED failure (EIO, ESTALE, EACCES…) «could not be read» (B-323e: never «empty» on a guess)
    const ls = await ask('ls', ['-A', mp]);
    if (!ls.ok && !ls.overflow && !/Transport endpoint is not connected/i.test(ls.stderr)) { console.warn(`[mounts] the mount point ${mp} could not be listed: ${ls.stderr.trim().slice(0, 200)}`); throw MW.refusal('mp_unreadable', { mp }); }
    const names = ls.ok || ls.overflow ? ls.stdout.split('\n').filter(Boolean) : [];   // r1284 (1): more names than the listing holds = NOT empty (the release mounted over them)
    if (ls.overflow && !names.length) names.push('…');
    const many = ls.overflow ? '+' : '';
    if (!names.length) return null;
    const dest = `${mp}.stranded-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)}`;
    // a move with no answer may have run (the starter gone before its end): the destination itself says whether it did
    // its source gone AND its destination there (a same-minute destination of an earlier move is not this one's); r1284 (2): when the
    // checks get no answer either, the files may already sit at the destination — the refusal names it (mp_move_unanswered)
    const moved = async (x, { sudo = false } = {}) => {
      if (!x.unknown) return x;
      // a move that NEVER STARTED never ran (its third read): no folder to name — the plain move «could not be checked», the sudo one
      // as sudo absent (not moved)
      if (x.never) { if (sudo) return { ok: false }; throw MW.refusal('mp_unanswered', { mp }); }
      const unk = (y) => y.unknown;   // (a check that never started is no answer: run reads it so)
      const src = await run('test', ['-e', mp]), dst = await run('test', ['-e', dest]);
      // a child of the move MAY STILL RUN (its pid kept): only «source gone, destination there» is a verdict — anything else may yet land
      if (x.pid) { if (!unk(src) && !unk(dst) && !src.ok && dst.ok) return { ok: true }; throw MW.refusal('mp_move_unanswered', { mp, dest }); }
      if (!unk(dst) && !dst.ok) return { ok: false };   // its destination answered ABSENT and no child of the move may still run: the rename never ran (a rename is whole)
      if (unk(dst) || unk(src)) throw MW.refusal('mp_move_unanswered', { mp, dest });
      return { ok: !src.ok && dst.ok };
    };
    let mv = await moved(await run('mv', [mp, dest]));
    if (!mv.ok) mv = await moved(await run('sudo', ['-n', 'mv', mp, dest]), { sudo: true });
    if (!mv.ok) throw MW.refusal('mp_not_empty', { mp, names: `${names.slice(0, 5).join(', ')}${names.length > 5 ? ', …' : ''}` });
    const text = `${mp} held ${names.length}${many} item${names.length === 1 && !many ? '' : 's'} written while the storage was disconnected (${names.slice(0, 5).join(', ')}${names.length > 5 ? ', …' : ''}) — moved to ${dest}. Nothing was deleted; merge them into the storage yourself.`;
    console.warn(`[mounts] stranded content quarantined: ${text}`);
    global.__vsEvent?.('mount-stranded-quarantine');
    this.broadcast({ type: 'server-notice', key: `mount-stranded:${dest}`, text, level: 2 });
    // the re-make AFTER the notice (its re-read's S1): the files are already moved, so its failure — no answer included — names where
    const re = await run('mkdir', ['-p', mp]);
    if (re.unknown) throw MW.refusal('mp_remake_unanswered', { dest, mp });
    if (!re.ok) throw MW.refusal('mp_not_recreated', { dest, mp, detail: String(re.stderr || '') });
    return dest;
  }

  /** B-323e (主开发 r1501 (8)): A PERSON's DISCONNECT (the route's press: `press`) IS SAID WHILE IT RUNS — `_disconnecting`, a broadcast
   *  each way, so every client's row says it through every redraw — and a second press (another client) JOINS the one in flight: one
   *  road, one answer; the mark ends with the road, ok or not, a throw included. A connect meanwhile waits for it (mount()). Every other
   *  caller (an edit's or a re-authorization's bounce, a removal, a conversion, a teardown) is the road itself, unmarked */
  unmount(id, opts = {}) {
    if (!opts || !opts.press) return this._unmountRoad(id, opts);
    const joins = (this._pressJoins = this._pressJoins || new Map());
    if (joins.has(id)) return joins.get(id);
    (this._disconnecting = this._disconnecting || new Set()).add(id); this._notify();
    this._unmountWhy?.delete(id);   // its follow: a new road's reason is its own
    let road; try { road = Promise.resolve(this._unmountRoad(id, opts)); } catch (e) { road = Promise.reject(e); }
    const done = road.finally(() => { joins.delete(id); this._disconnecting.delete(id); this._notify(); });
    joins.set(id, done);
    return done;
  }

  /** its follow (主开发 r1890 (1)): when the person's last Disconnect of a record THREW — { code, why } (unmount_threw: not detached; unmount_unconfirmed:
   *  detached, its process not confirmed ended), null otherwise — the route words it */
  unmountWhyOf(id) { return (this._unmountWhy && this._unmountWhy.get(id)) || null; }

  _unmountRoad(id, opts = {}) {
    const m = this._get(id);
    if (!(opts && opts.internal)) { this._bumpGen(id); this._cantTell?.delete(this.pathOf(m)); }   // B-e783: the person's Unmount — a sweep that walked meanwhile drops its verdict; a «can't tell» wait ends
    const mp = this.pathOf(m);
    // internal teardown (hang defense / reconnect cycle) must NOT rewrite the
    // user's intent — only an explicit user Unmount clears desired.
    if (!opts.internal) {
      m.desired = 'unmounted';
      this._reconnects?.delete(id);
      this._bumpWord(id);   // its follow: the person's word — a Connect that joined a connect in flight reads it again before it connects anew
      if (m.parked) this._unpark(m, 'unmounted');   // B-5ce7: the person ended supervision — its For-you item resolves
      this._killedSaid?.delete(id); try { this.onAnswered?.(m); } catch { }   // …and a stopped-process notice with it (r1 #9: even one a hub before this one filed)
      this._save({ now: true, why: 'a Disconnect' });
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
      // its follow (主开发 r1890 (1)): THE ROAD ALWAYS SETTLES — a throw in its own body (the wait for the daemon, its end, a child's
      // answer read) answers by what is known, with its reason (unmountWhyOf: the route words it): not detached ⇒ «not disconnected»;
      // detached (a rung ended it) ⇒ disconnected, its process not confirmed ended. Never a promise left open — the row's
      // «Disconnecting…» and a Connect that waits on this press both hang on it — not even when finish itself (its notify) throws
      let settled = false;
      const settle = (v) => { if (settled) return; settled = true; let out = v; try { out = finish(v); } catch (e) { console.warn(`[mounts] unmount ${id}: its finish threw (${(e && e.message) || e}) — answered as it stood`); } resolve(out); };
      const threw = (e, detached = false) => {
        if (settled) return;
        const why = String((e && e.message) || e || 'failed').slice(0, 200);
        console.warn(`[mounts] unmount ${id}: its road threw (${why}) — ${detached ? 'detached, its process not confirmed ended' : 'not disconnected'}`);   // the record id, never its name
        if (opts && opts.press) (this._unmountWhy || (this._unmountWhy = new Map())).set(id, { code: detached ? 'unmount_unconfirmed' : 'unmount_threw', why });   // a person's press only (an internal road's throw is not its answer)
        settle(detached);
      };
      const ensureDaemonGone = async (ok) => {
        try {
          for (let i = 0; i < 8 && (await this._daemonAlive(mp, { witness: false })); i++) await new Promise((r) => setTimeout(r, 500));
          if (await this._daemonAlive(mp, { witness: false })) {
            console.warn(`[mounts] daemon survived lazy unmount of ${mp} — killing it`);
            await this._killMountDaemon(mp);
            await new Promise((r) => setTimeout(r, 300));
          }
        } catch (e) { threw(e, ok); return; }
        settle(ok);
      };
      // B-323e (its mount half, its reader's S4): the lazy-unmount trio by THE STARTER — the sweep's own road into a dead daemon's unmount
      // (every 60 s) and a person's Disconnect; in turn as before (the next only when one did not end 0), each bounded 10 s
      const S = require('./server/child-starter').childStarter(), envAdd = { PATH: process.env.PATH || '' };
      const ended0 = (r) => !!r && !r.unknown && !!r.started && !r.timedOut && r.code === 0 && !r.error;
      (async () => {
        if (ended0(await S.run('fusermount3', ['-uz', mp], { timeoutMs: 10000, envAdd }).catch(() => null))) return ensureDaemonGone(true);
        if (ended0(await S.run('fusermount', ['-uz', mp], { timeoutMs: 10000, envAdd }).catch(() => null))) return ensureDaemonGone(true);
        await S.run('umount', ['-l', mp], { timeoutMs: 10000, envAdd }).catch(() => null);
        return ensureDaemonGone(!this.isMounted(m));
      })().catch(threw);
    });
  }

  /** Boot: adopt live mounts, re-mount anything desired-but-dead. */
  async restore() {
    this.maybeUpgradePinnedRclone(); // async, best-effort — see the pin note (first, as the release: test-mount-oauth-probe wires it)
    if (this._hold.held()) { this._restoreAsked = true; this._notify(); return; }   // B-f276 family unit 1: held — the list is unread, not empty; the restore runs at the lift
    // B-5ce7 cure round 2: every parked mount's path is BLOCKED and its words set at once, before any connect is awaited —
    // the doors meet the parked words from the first request after a boot, not when the loop's turn comes
    for (const m of this._state.mounts) if (m.parked) { try { this.blockPath(m.parked.mp || this.pathOf(m), MountManager.PARK_BLOCK_MS); this._errors.set(m.id, this._parkedWords(m)); } catch { } }
    // B-5ce7 (r1 #16): an item whose record is NOT parked any more (a crash between the park's end and its item's) resolves
    for (const m of this._state.mounts) if (!m.parked) { try { this.onUnpark?.(m, 'boot'); } catch { } }
    for (const m of this._state.mounts) {
      if (m.desired !== 'mounted') continue;
      if (m.parked) {   // B-5ce7: kept disconnected across a restart — said, its path blocked, its For-you item re-filed (merged)
        try { this.onPark?.(m, { verdict: m.parked.verdict, reason: m.parked.reason, strikes: m.parked.strikes, provider: String(m.parked.provider || '') }); } catch { }
        continue;
      }
      if (m.expiresAt && Date.now() > m.expiresAt) { this._errors.set(m.id, 'credential expired'); continue; }
      if (this.isMounted(m)) continue; // adopted — detached rclone survived
      try { await this.mount(m.id); } catch (e) { this._errors.set(m.id, this._sayE(m.id, e)); }
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

  /** B-323e: the help text the flag checks read (`rclone help flags` + `rclone mount --help`), asked of THE STARTER
   *  (src/server/child-starter.js) — never two synchronous forks of the hub from its sweep or a mount start. Cached for the
   *  process once both runs ANSWERED (a run that failed or timed out reads '' — as the synchronous road read it). No answer
   *  (a dead or slow starter) is asked AGAIN, up to three times: the starter is replaced after its first fault and takes its old
   *  road (an async start) after its second, so the third ask is answered — never a synchronous fork. One ask at a time; an
   *  install in between (the generation) discards the old binary's answer and asks the new one. */
  _rcloneFlagsReady(timeoutMs = 10000) {
    if (this._rcloneFlagsHelp !== undefined) return Promise.resolve(true);
    if (this._rcloneFlagsAsk) return this._rcloneFlagsAsk;
    const once = () => {
      const gen = this._rcloneFlagsGen || 0, bin = this.rcloneBin(), S = require('./server/child-starter').childStarter();
      return Promise.all([['help', 'flags'], ['mount', '--help']].map((argv) => S.run(bin, argv, { timeoutMs, capture: true, maxBuffer: 4 * 1024 * 1024, env: serviceEnv(process.env), envAdd: { PATH: process.env.PATH || '' } })))
        .then((rs) => {
          if (rs.some((r) => !r || r.unknown) || gen !== (this._rcloneFlagsGen || 0)) return false;
          if (this._rcloneFlagsHelp === undefined) this._rcloneFlagsHelp = rs.map((r) => (r.code === 0 && !r.timedOut ? String(r.stdout || '') : '')).join('');
          return true;
        }, () => false);
    };
    const ask = (async () => { for (let i = 0; i < 3; i++) { if (this._rcloneFlagsHelp !== undefined || await once()) return true; } return false; })()
      .finally(() => { if (this._rcloneFlagsAsk === ask) this._rcloneFlagsAsk = null; });
    this._rcloneFlagsAsk = ask;
    return ask;
  }

  _rcloneSupportsAcceptEncodingFlag() {
    if (this._rcloneAEFlag !== undefined) return this._rcloneAEFlag;
    if (this._rcloneFlagsHelp === undefined) return false;   // B-323e (its read): a help text never read is no answer — off for this call, never kept as «false» for the process
    this._rcloneAEFlag = this._rcloneHasFlag('use-accept-encoding-gzip');
    return this._rcloneAEFlag;
  }

  /** Does the installed rclone know this flag? Cached probe over BOTH help
   *  outputs — `help flags` lists global/backend flags but NOT the vfs/mount
   *  flags (those only appear in `mount --help`; verified on 1.65.2). Passing
   *  an unknown flag makes rclone refuse to start at all, so gate every
   *  version-sensitive flag through this. */
  _rcloneHasFlag(flag) {
    // B-323e: the help text is fetched through THE STARTER first (`_rcloneFlagsReady` — every road that reads a flag awaits it:
    // the s3 sweep probe, the mount start). Never a synchronous fork of the hub here: a text never read (three asks with no
    // answer) leaves the version-gated flag OFF for this call — said once — and is asked again by the next road.
    if (this._rcloneFlagsHelp === undefined) {
      if (!this._rcloneFlagsUnsaid) { this._rcloneFlagsUnsaid = true; console.warn('[mounts] rclone\'s help text was not read (the starter gave no answer) — its version-gated flags are left off until it is'); }
      return false;
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
  /** B-e40d (B-166e's rule — src/channels/gmail.js refreshClientOf — for the storage mounts): a Google refresh token answers
   *  only to the OAuth client it was MINTED under, and a preset-backed Drive / Gmail record stores only the preset KEY. So a
   *  record names the client its token was minted under (`mintedClient {id, key, sealed}`, the secret sealed with
   *  .mounts-key like every secret of the record). Taken from the SIGN-IN that minted the token — Drive's startDriveAuth or
   *  gmail-sync's startAuth keeps the client it used (kept a day after the flow ends — keepSignIn: a Save after the flow's 10
   *  minutes, or after another sign-in began), and the saved token is that sign-in's when their refresh tokens match —
   *  never guessed from the key at save time (a swap between the sign-in and Save, a withdrawn key whose sign-in fell to
   *  another preset, an import from another instance). A token no sign-in of this hub minted (or one from before a restart)
   *  names none here: its first proven-good refresh adopts the client (_adoptClient). A record with its own client names
   *  none. → the field or null. */
  static mintClientOf(m, x, tok) {
    if (!m || m.clientId || !tok || (m.type && !rowFor(x, m).mintedClient?.(m))) return null;   // only a record whose ROW takes a minted client (drive, gmail, an rclone Drive under a preset)
    const c = MountManager.signInOf(x, tok);
    return c ? { id: c.clientId, key: m.clientPreset || null, sealed: x._enc(c.clientSecret) } : null;
  }
  /** The client a sign-in of THIS hub minted `tok` under ({clientId, clientSecret}), or null: the live Drive / Gmail flow whose
   *  token has the same refresh token, else the one kept a day after its flow ended (keepSignIn). */
  static signInOf(x, tok) {
    const rt = MountManager._rtOf(tok);
    if (!rt) return null;
    for (const f of [x && x._driveAuth, x && x.gmail && x.gmail._auth]) {
      if (f && f.token && f.client && f.client.clientId && f.client.clientSecret && MountManager._rtOf(f.token) === rt) return { clientId: String(f.client.clientId), clientSecret: String(f.client.clientSecret) };
    }
    const { signInClient } = require('./gmail-sync');
    return signInClient(x && x._driveSignIns, rt) || signInClient(x && x.gmail && x.gmail._signIns, rt);
  }
  /** A Connect dialog's picker BEFORE Save (a transient token — the shared drives, the labels): the client its sign-in minted
   *  it under when the preset under the key now names another (a swap between the sign-in and Save), else the preset's. */
  static pickerClient(x, tok, clientPreset) {
    const pc = MountManager._driveClient({ clientPreset: clientPreset || null });
    const si = MountManager.signInOf(x, tok);
    return si && (!pc || String(pc.clientId) !== si.clientId) ? si : pc;
  }
  /** A record's sealed token: a Drive / Gmail record's `tokenEnc`, an rclone-type Drive record's `paramsEnc.token`. */
  static _sealedTokenOf(m) { return (m && (m.tokenEnc || (m.paramsEnc && typeof m.paramsEnc.token === 'string' ? m.paramsEnc.token : null))) || null; }
  /** The refresh token inside a token's JSON text, or null. */
  static _rtOf(tok) { try { const t = JSON.parse(String(tok)); return t && typeof t.refresh_token === 'string' && t.refresh_token ? t.refresh_token : null; } catch { return null; } }
  /** Set (or clear) a record's minted client for a token about to be saved — called BEFORE its tokenEnc is written. No key at
   *  all when none is known (a record's shape is unchanged for every record this rule does not touch); the SAME refresh token
   *  saved again (a re-paste) keeps the client it already names — only another token clears it. */
  static setMinted(m, x, tok) {
    const mc = MountManager.mintClientOf(m, x, tok);
    // B-e40d: who is counted may change. The check runs in a LATER microtask: setMinted is synchronous, so the record is complete
    // by then — an await inside setMinted would break that (the check would read the record half-written)
    if (x && typeof x.clientSwapCheck === 'function') x.clientSwapCheck().catch(() => { });
    if (mc) { m.mintedClient = mc; return; }
    let prev = null; try { const se = MountManager._sealedTokenOf(m); prev = se ? MountManager._rtOf(x._dec(se)) : null; } catch { prev = null; }
    if (!m.clientId && m.mintedClient && prev && prev === MountManager._rtOf(tok)) return;
    delete m.mintedClient;
  }
  /** The minted client opened ({clientId, clientSecret}), or null: none named — or its sealed secret cannot be opened, which
   *  is never silent (the hub's log says it once: the mount refreshes with the preset; re-authorize it). A LOCKED vault (the
   *  key sealed by the second password) is no unreadable copy: nothing is said, `why.locked` tells the caller, and the MANAGER
   *  keeps no opened copy — the lock reaches every reader; only a running worker holds the copy it opened (mintedReader), as it
   *  holds its token. */
  static mintedOf(m, x, why = null) {
    const mc = m && !m.clientId && m.mintedClient && typeof m.mintedClient === 'object' && typeof m.mintedClient.id === 'string' && m.mintedClient.id ? m.mintedClient : null;
    if (!mc) return null;
    let sec = null, locked = false;
    try { sec = typeof mc.sealed === 'string' && mc.sealed ? x._dec(mc.sealed) : null; } catch (e) { sec = null; locked = /vault_locked/.test(String((e && e.reason) || '')); }
    if (typeof sec === 'string' && sec) return { clientId: mc.id, clientSecret: sec };
    if (locked) { if (why) { why.locked = true; why.id = mc.id; } return null; }
    MountManager.sayMinted(m, mc.id, null, true);
    return null;
  }
  /** B-e40d: a running Gmail worker's READER of its record's minted client — read at EACH refresh (a client adopted while the
   *  worker runs is used at once). The copy it last opened is held ON THE WORKER (in this closure — as the worker holds its
   *  token), so a locked vault stops no running worker; it is used only while the record still names that client. */
  static mintedReader(x, id) {
    let held = null;
    return () => {
      const why = {};
      const r = MountManager.mintedOf(x._state.mounts.find((y) => y.id === id), x, why);
      if (r) { held = r; return r; }
      return why.locked && held && held.clientId === why.id ? held : null;
    };
  }
  /** The export carries the minted client like the record's other secrets (plaintext — the caller seals the bundle under the
   *  export passphrase); the import seals it again under this instance's key (_mintedImport). */
  static _mintedExport(m, x) {
    const mc = MountManager.mintedOf(m, x);
    return mc ? { id: mc.clientId, key: (m.mintedClient && m.mintedClient.key) || null, secret: mc.clientSecret } : undefined;
  }
  static _mintedImport(rec, mc, x) {
    if (!rec || rec.clientId || !['drive', 'gmail'].includes(rec.type) || !mc || typeof mc.id !== 'string' || !mc.id || mc.id.length > 300 || typeof mc.secret !== 'string' || !mc.secret || mc.secret.length > 500) return false;
    rec.mintedClient = { id: mc.id, key: rec.clientPreset || null, sealed: x._enc(mc.secret) };
    x._save();
    x.clientSwapCheck?.().catch(() => { });   // B-e40d: a restored mount on a replaced client is said
    return true;
  }
  /** THE CLIENT A REFRESH USES for a preset-backed record: the preset's values while they name the client the token was
   *  minted under (a rotated SECRET is the preset's — it reaches every mount, as before); the MINTED client when the preset
   *  under the key now names ANOTHER client, or is gone (the 2026-10-23 fleet outage: the presets were replaced under the
   *  same keys and every refresh was refused for hours); a token saved before this rule names none — the preset's. */
  static refreshClient(m, x) {
    const pc = MountManager._driveClient(m);
    const mc = MountManager.mintedOf(m, x);
    if (mc && (!pc || String(pc.clientId) !== mc.clientId)) { MountManager.sayMinted(m, mc.clientId, pc && pc.clientId); return { ...mc, minted: true }; }
    return pc;
  }
  /** Said ONCE per record and pair (the hub's log): the preset under its key now names another client (or none), so this mount
   *  keeps the client its token was minted under — re-authorize it to move it (deploy/README.md: before deleting a replaced client). */
  static sayMinted(m, minted, preset, unreadable = false) {
    const k = `${m && m.id}|${minted}|${unreadable ? 'unreadable' : preset || '-'}`;
    const said = MountManager._mintedSaid || (MountManager._mintedSaid = new Set());
    if (said.has(k)) return;
    said.add(k);
    const who = MountManager.lentName(m) || (m && m.id), kw = m && m.clientPreset ? `preset «${m.clientPreset}»` : 'instance\'s default preset';
    if (unreadable) { console.log(`[mounts] ${who}: the sealed copy of the client its token was minted under (${String(minted).slice(0, 12)}…) cannot be opened — it refreshes with the ${kw}; re-authorize it`); return; }
    console.log(`[mounts] ${who}: the ${kw} ${preset ? 'now names another OAuth client' : 'is gone'} — this mount keeps the client its token was minted under (${String(minted).slice(0, 12)}…); re-authorize it to move it`);
  }
  /** B-e40d's remainder — THE CLIENT-SWAP NOTICE (B-166e part 2's shape, for the storage mounts). Per preset key: the client
   *  in force (`to` — the preset under the key, '' when it is withdrawn: nothing is said then, the mounts keep their minted
   *  client and the hub's log names them) and the mounts still on ANOTHER client — holders (no parent; a submount refreshes
   *  through its parent) whose row takes a minted client, with no own client, that NAME a minted client other than `to`. A
   *  record that names none (from before the rule, not proven yet) is not counted. Plaintext ids only: no vault is asked.
   *  → [{ key, preset (its label, else its key), to, need: [{ id, name }] }]. */
  clientSwapFacts() {
    const groups = new Map();
    for (const m of this._state.mounts) {
      if (!m || m.parentId || m.clientId || !rowFor(this, m).mintedClient?.(m)) continue;
      // the key the record RESOLVES to (no key: the single / default preset — the same one as an explicit key for it: ONE group)
      const pc = MountManager._driveClient({ clientPreset: m.clientPreset || null });
      const key = m.clientPreset || (pc && pc.key) || '';
      let g = groups.get(key);
      if (!g) { g = { key, preset: (pc && (pc.label || pc.key)) || key, to: pc && pc.clientId ? String(pc.clientId) : '', need: [] }; groups.set(key, g); }
      const minted = m.mintedClient && typeof m.mintedClient.id === 'string' ? m.mintedClient.id : '';
      if (g.to && minted && minted !== g.to) g.need.push({ id: m.id, name: MountManager.lentName(m) || m.id });
    }
    return [...groups.values()];
  }
  /** Say it now: the facts → the producer (`onClientSwaps`, wired to src/server/mount-for-you.js clientSwaps) → the memos it
   *  hands back (`_state.clientSwaps` — WHAT WAS SAID per key, B-166e's memo), saved when they changed. One check running, at
   *  most one queued (a burst coalesces — no timer). Asked at the boot, a presets reload, and every door that changes who is
   *  counted (a token saved, a client adopted, a record removed or imported). */
  clientSwapCheck() {
    if (this._swapQueued) return this._swapQueued;
    const run = (this._swapChain || Promise.resolve()).then(() => { this._swapQueued = null; return this._clientSwapCheckNow(); });
    this._swapQueued = run;
    this._swapChain = run.catch(() => { });
    return run;
  }
  _clientSwapCheckNow() {
    if (typeof this.onClientSwaps !== 'function') return;
    if (this._hold.held()) return;   // B-f276 family unit 2 (the census's MS2): held, its facts read EMPTY — nothing filed, redrawn or closed; the lift runs the check
    const was = this._state.clientSwaps && typeof this._state.clientSwaps === 'object' && !Array.isArray(this._state.clientSwaps) ? this._state.clientSwaps : {};
    const next = this.onClientSwaps(this.clientSwapFacts(), was);
    if (next && typeof next === 'object' && JSON.stringify(next) !== JSON.stringify(was)) { this._state.clientSwaps = next; this._save(); }
  }
  /** (`sealed`, not «…Enc»: in a mount record a «…Enc» name is a secret a PERSON writes in a page field — the convention
   *  test-write-only-secrets holds every one of them to; the minted secret is the hub's own — no page field, never in config
   *  or the list (test-mounts-oauth §4); the owner's export carries it like the record's other secrets (_mintedExport).)
   *  B-e40d: ADOPT the client a proven-good refresh used — a token no flow of this hub minted names none (its first good
   *  refresh adopts it, as B-166e's channel accounts do), and a secret rotated under the SAME client follows into the sealed
   *  copy (never a stale one). The minted client is the truth: a refresh under ANOTHER id never re-names it. Preset-backed
   *  Drive / Gmail records only (written on the credential holder — a child's token is its parent's). → whether it wrote. */
  _adoptClient(rec, used) {
    const holder = rec && rec.parentId ? this._state.mounts.find((x) => x.id === rec.parentId) : rec;
    const ruled = !!(holder && rowFor(this, holder).mintedClient?.(holder));   // the record's ROW declares it takes a minted client
    if (!holder || holder.clientId || !ruled || !used || !used.clientId || !used.clientSecret) return false;
    const mc = holder.mintedClient && typeof holder.mintedClient === 'object' ? holder.mintedClient : null;
    if (mc && mc.id !== String(used.clientId)) return false;
    let same = false; try { same = !!mc && this._dec(mc.sealed) === String(used.clientSecret); } catch { same = false; }
    if (same) return false;
    holder.mintedClient = { id: String(used.clientId), key: holder.clientPreset || null, sealed: this._enc(String(used.clientSecret)) };
    this._save();
    this.clientSwapCheck().catch(() => { });   // B-e40d: a mount that names its client now is counted
    return true;
  }
  /** B-e40d: a backend probe ANSWERED (rclone listed) while the token ITS env carried was SPENT — rclone refreshed it with the
   *  client that SAME env carried: adopt that one, never a client worked out again after the run (a preset swapped during the
   *  probe is not recorded), and only while the record still holds the token the probe ran with. → whether it wrote. */
  _adoptProbed(m, env) {
    try {
      let t = null; try { t = JSON.parse(String((env && env.RCLONE_CONFIG_VS_TOKEN) || '')); } catch { t = null; }
      const e = t ? (typeof t.expiry === 'number' ? t.expiry : Date.parse(t.expiry || '') || 0) : 0;
      if (!t || !t.refresh_token || !(e > 0 && e < Date.now() - 60e3)) return false;
      // the RECORD that holds the token: a submount's parent — never _connOf's merged copy, which no write reaches
      const holder = m && m.parentId ? this._state.mounts.find((x) => x.id === m.parentId) : m;
      let cur = null; try { const se = MountManager._sealedTokenOf(holder); cur = se ? MountManager._rtOf(this._dec(se)) : null; } catch { cur = null; }
      if (cur !== t.refresh_token) return false;
      return this._adoptClient(holder, { clientId: env.RCLONE_CONFIG_VS_CLIENT_ID, clientSecret: env.RCLONE_CONFIG_VS_CLIENT_SECRET });
    } catch { return false; }
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
      env = rcloneEnv({ RCLONE_CONFIG_VS_TYPE: 'drive', RCLONE_CONFIG_VS_TOKEN: tok, RCLONE_CONFIG_VS_SCOPE: 'drive' });
      let cid = clientId, csec = clientSecret;
      if (!cid) { const pc = MountManager.pickerClient(this, tok, clientPreset); if (pc) { cid = pc.clientId; csec = pc.clientSecret; } }   // B-e40d: its sign-in's client after a swap
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
        id, name: MountManager.lentName(m) || id, minted: MountManager.mintedOf(m, this),   // B-e40d: a labels read that refreshed adopts too
      });
    }
    if (!token) throw new Error('token required');
    return this.gmail.listLabels({ token: String(token).trim(), clientId, clientSecret, clientPreset, minted: MountManager.signInOf(this, String(token).trim()) });   // B-e40d: its sign-in's client after a swap
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
      // B-e40d: the client its token was minted under (gmail-sync uses it when the preset under the key names another) — read
      // AT EACH REFRESH, never a copy taken at start: a client adopted while this worker runs is the one its next refresh uses
      name: MountManager.lentName(m) || id, minted: MountManager.mintedReader(this, id),
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
  // B-e783: off the loop — the same walk asked for an rclone AUTHORIZE (its argv), each kill re-checked and through
  // PI.signalIdentity; non-Linux: no /proc — [] (the orphan clears with the machine)
  async _killOrphanAuthorize() {   // silent, as the release's
    const o = this._procOpts || {}, hit = [];
    let ids = []; try { ids = (await this._walk({ authorize: true })).ids; } catch (e) { ids = (e && e.partial) || []; }
    for (const id of ids) {
      const r = PI.signalIdentity(id, 'SIGKILL', { ...(o.procRoot ? { procRoot: o.procRoot } : {}), ...(o.kill ? { kill: o.kill } : {}), what: 'an orphaned rclone authorize' });
      if (r.ok) hit.push(id.pid);
    }
    return hit;
  }


  async startDriveAuth({ backend = 'drive', clientId, clientSecret, clientPreset } = {}) {
    this.cancelDriveAuth();
    const gen = this._driveAuthGen;
    await this._killOrphanAuthorize();   // B-e783: the orphans are gone BEFORE the spawn (the authorize port)
    // r2: a Cancel, or a newer press, while the sweep ran — that one decides; this press spawns nothing
    if (gen !== this._driveAuthGen) return { error: 'the sign-in was cancelled or started again' };
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
    const child = spawn(this.rcloneBin(), authArgs, { env: rcloneEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', (e) => console.warn(`[mounts] the drive sign-in's rclone could not be started: ${(e && e.code) || e}`));   // ckpt61 cure 2: the hub survives a start that fails (the road's own failure words owed: the next unit)
    // B-e40d: the client this sign-in mints under — a token saved from it names THAT client (MountManager.mintClientOf)
    const st = { child, url: null, token: null, error: null, buf: '', startedAt: Date.now(), client: clientId && clientSecret ? { clientId: String(clientId), clientSecret: String(clientSecret) } : null };
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
    if (!r.ok) throw MW.refusal('onedrive_lookup_failed', { status: r.status });
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
    this._save({ now: true, why: 'a Drive sign-in' });
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
    this._driveAuthGen = (this._driveAuthGen || 0) + 1;   // B-e783 r2: a press still sweeping its orphans spawns nothing
    const st = this._driveAuth;
    if (st) { clearTimeout(st.timer); try { st.child.kill(); } catch {} }
    if (st && st.token) require('./gmail-sync').keepSignIn((this._driveSignIns ||= new Map()), st);   // B-e40d: a later Save still names its client
    this._driveAuth = null;
  }

  // ── Minting (mc service account → STS AssumeRole fallback) ──

  /** B-323e: is `mc` there? Asked of THE STARTER and kept (`_toolKnown`) — never a fork of the hub per Storage-panel read.
   *  The panel's read answers null when the starter gave no answer. A SHARE'S ACT (`act: true` — a mint, a revoke) never reads «no answer» as «no mc»: it asks afresh (a kept no is not
   *  enough), and when the starter gives no answer it asks the old way, once (a revoke that skipped `mc` would leave a
   *  never-expiring key alive; a mint would make a 7-day link the panel did not promise). */
  async mcAvailable({ act = false } = {}) {
    const v = await this._toolKnown('mc', 'mc', ['--version'], 10000, { fresh: act });
    if (!act) return v;   // the panel's read: true · false · null («don't know» — the panel then says neither «expires» nor «stays valid»)
    if (v !== null) return v === true;
    return new Promise((resolve) => execFile('mc', ['--version'], { timeout: 30000 }, (err) => resolve(!err)));
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
    this._hold.refuse('making a share');
    prefix = String(prefix || '').replace(/^\/+|\/+$/g, '');
    const policy = this._sharePolicy(bucket, prefix, mode);
    let cred, method;
    if (await this.mcAvailable({ act: true })) {
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
    this._save({ now: true, why: 'a share minted' });
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
    this._save({ now: true, why: 'a share minted' });
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
    this._hold.refuse('revoking a share');
    const share = this._state.shares.find(s => s.id === id);
    if (!share) throw new Error('share not found');
    if (share.kind === 'cephmount' && share.client && this.cephMintAvailable()) {
      await this._mintCall('/revoke', { client: share.client }).catch(() => {});
      this._state.shares = this._state.shares.filter(x => x.id !== id);
      this._save({ now: true, why: 'a share revoked' }); this._notify();
      return;
    }
    if (share.method === 'service-account') {
      // need the OWNER credential again — my-storage env is the canonical owner
      const env = this.envStorage();
      if (env && await this.mcAvailable({ act: true })) {
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
    this._save({ now: true, why: 'a share revoked' });
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
