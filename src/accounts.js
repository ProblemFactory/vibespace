/**
 * AccountManager — Anthropic account switching for Claude sessions.
 *
 * Two billing identities exist for the Claude CLI:
 *  - Subscription: the CLI's global OAuth login (~/.claude/.credentials.json).
 *  - API / Console: an org API key. The CLI's own console login MINTS one and
 *    stores it as `primaryApiKey` in ~/.claude.json — but /login is mutually
 *    exclusive (switching wipes the other), so VibeSpace keeps console keys in
 *    its OWN store and injects ANTHROPIC_API_KEY into a session's spawn env
 *    (process-env channel, never argv). Per-session choice, no global switch.
 *
 * Keys are AES-256-GCM encrypted at rest under a server-local key
 * (data/.accounts-key), same pattern as mounts.js. list() never returns
 * secrets — only the key tail (last 8 chars) for identification; that matches
 * how the CLI's own trust list (customApiKeyResponses) fingerprints keys.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class AccountManager {
  constructor({ dataDir, onChange, platform = process.platform }) {
    this._file = path.join(dataDir, 'accounts.json');
    this._keyFile = path.join(dataDir, '.accounts-key');
    this._platform = platform;
    // Per-SUBSCRIPTION credential dirs. A subscription account is a real dir
    // holding ONLY that account's .credentials.json; the CLI reads it via
    // CLAUDE_SECURESTORAGE_CONFIG_DIR (relocates the SECRET store only —
    // projects/sessions/settings stay in ~/.claude, so transcripts + discovery
    // stay shared). Verified vs claude 2.1.205 (Wde() = env ?? sn()). This is
    // how we hold MANY subscription logins at once.
    this._subsDir = path.join(dataDir, 'subs');
    // Per-CODEX-account homes. Codex has NO auth-only relocation env (CODEX_HOME
    // moves the WHOLE config dir), so we isolate auth by giving each account its
    // own CODEX_HOME whose `sessions/` + `config.toml` are SYMLINKS to the
    // shared ~/.codex — auth.json stays real per-account, threads land in the
    // shared sessions dir (unified discovery), settings stay shared. Verified vs
    // codex 0.142.5 (symlinks survive a run; rollout written to shared dir).
    this._codexSubsDir = path.join(dataDir, 'codex-subs');
    this._onChange = onChange || (() => {});
    this._state = { version: 1, defaultAccountId: null, defaultCodexAccountId: null, accounts: [] };
    this._load();
    // Console-login scratch dirs (con-*) are transient; drop any abandoned by a
    // login that never completed before a prior restart.
    try { for (const d of fs.readdirSync(this._subsDir)) if (/^con-/.test(d)) fs.rmSync(path.join(this._subsDir, d), { recursive: true, force: true }); } catch { }
  }

  _acctType(a) { return a.type || 'api'; } // legacy records (no type) = API key
  _acctBackend(a) { return a.backend || 'claude'; } // legacy records = Claude
  _localOnlyClaudeSub(a) {
    return this._platform === 'darwin'
      && this._acctBackend(a) === 'claude'
      && this._acctType(a) === 'subscription';
  }
  subDir(id) { return path.join(this._subsDir, id); }
  subCredsPath(id) { return path.join(this.subDir(id), '.credentials.json'); }
  codexSubDir(id) { return path.join(this._codexSubsDir, id); }

  // Pre-seed an isolated login dir's .claude.json with the onboarding-complete
  // flags (hasCompletedOnboarding/hasTrustDialogAccepted) so the login (run with
  // CLAUDE_CONFIG_DIR=dir) does NOT show the first-run onboarding screen. Setting
  // CLAUDE_CONFIG_DIR isolates the identity (oauthAccount) INTO the dir, so the
  // GLOBAL ~/.claude.json is never clobbered — the whole point.
  _seedConfigDir(dir) {
    const seed = { hasCompletedOnboarding: true, hasTrustDialogAccepted: true, theme: 'dark' };
    try { const g = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8')); if (g.theme) seed.theme = g.theme; } catch { }
    try { fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify(seed), { mode: 0o600 }); } catch { }
  }

  _load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this._file, 'utf-8'));
      if (parsed && Array.isArray(parsed.accounts)) this._state = parsed;
    } catch { /* fresh install */ }
  }

  _save() {
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this._file);
  }

  _notify() { try { this._onChange(this.list()); } catch { } }

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
    const enc = Buffer.concat([c.update(text, 'utf-8'), c.final()]);
    return iv.toString('hex') + ':' + c.getAuthTag().toString('hex') + ':' + enc.toString('hex');
  }

  _dec(blob) {
    const [iv, tag, data] = String(blob).split(':').map((s) => Buffer.from(s, 'hex'));
    const d = crypto.createDecipheriv('aes-256-gcm', this._key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf-8');
  }

  // Sanitized — NEVER includes key material. Subscription accounts add a
  // read-only identity probe (email/plan/loggedIn) from their creds dir.
  list() {
    return {
      defaultAccountId: this._state.defaultAccountId || null,
      defaultCodexAccountId: this._state.defaultCodexAccountId || null,
      accounts: this._state.accounts.map((a) => {
        const type = this._acctType(a);
        const backend = this._acctBackend(a);
        const base = { id: a.id, name: a.name, type, backend, source: a.source, originHost: a.originHost || null, note: a.note || null, hostLogins: a.hostLogins || null, createdAt: a.createdAt, localOnly: this._localOnlyClaudeSub(a) };
        if (backend === 'codex') {
          const info = this.readCodexSubAuth(a.id);
          return { ...base, loggedIn: info.loggedIn, email: info.email || a.email || null, emailDeclared: !info.email && !!a.email, subscriptionType: info.plan, authMode: info.authMode };
        }
        if (type === 'pooled') {
          const cur = this.poolCurrent(a.id);
          const info = this.readSubCreds(a.id); // resolves through the symlink
          const curAcct = cur ? this.get(cur) : null;
          return { ...base, pooled: true, loggedIn: info.loggedIn, email: info.email || null, subscriptionType: info.subscriptionType, current: cur, currentName: curAcct?.name || null, members: a.members || null, memberOptions: this.poolMembers(a.id), auto: !!a.auto, hot: !!a.hot, supported: this.poolSupported() };
        }
        if (type === 'subscription') {
          const info = this.readSubCreds(a.id);
          // a.email = manual backfill (setEmail) for dirs whose login never
          // wrote the identity file; the dir's own identity wins when present.
          return { ...base, loggedIn: info.loggedIn, email: info.email || a.email || null, emailDeclared: !info.email && !!a.email, subscriptionType: info.subscriptionType, ...this._oatMeta(a) };
        }
        return { ...base, tail: a.tail };
      }),
    };
  }

  // ── Subscription accounts (each = its own securestorage creds dir) ──

  // Allocate an empty account + dir. The OAuth login happens in an interactive
  // terminal through vibespace-claude-subscription-login.mjs; the caller
  // watches for the creds/status file, then calls finalizeSubscription.
  createSubscription({ name } = {}) {
    const id = 'sub-' + crypto.randomBytes(6).toString('hex');
    fs.mkdirSync(this.subDir(id), { recursive: true, mode: 0o700 });
    this._seedConfigDir(this.subDir(id));
    const a = { id, name: String(name || '').trim().slice(0, 60) || 'Subscription', type: 'subscription', source: 'login', createdAt: Date.now() };
    this._state.accounts.push(a);
    this._save();
    this._notify();
    return { id, dir: this.subDir(id) };
  }

  // Read-only parse of a subscription account's creds. NEVER writes/refreshes
  // (rotation would break the account, issue #20). Returns loggedIn + identity
  // + the access token IF currently valid (for the usage poll).
  readSubCreds(id) {
    try {
      const raw = JSON.parse(fs.readFileSync(this.subCredsPath(id), 'utf-8'));
      const o = raw?.claudeAiOauth;
      if (!o?.accessToken) return { loggedIn: false };
      const valid = !o.expiresAt || Date.now() < o.expiresAt - 60000;
      // Identity (email/org) is NOT in .credentials.json — it's in the dir's
      // .claude.json (written because LOGIN also set CLAUDE_CONFIG_DIR=dir).
      let email = o.email || o.emailAddress || null, org = null;
      if (!email) {
        try {
          const cfg = JSON.parse(fs.readFileSync(path.join(this.subDir(id), '.claude.json'), 'utf-8'));
          email = cfg?.oauthAccount?.emailAddress || null;
          org = cfg?.oauthAccount?.organizationName || null;
        } catch { }
      }
      return {
        loggedIn: true,
        subscriptionType: o.subscriptionType || null,
        email, org,
        accessToken: valid ? o.accessToken : null,
        expiresAt: o.expiresAt || null,
      };
    } catch { return { loggedIn: false }; }
  }

  _subscriptionLoginStatus(id) {
    try {
      const status = JSON.parse(fs.readFileSync(path.join(this.subDir(id), '.vibespace-login-status.json'), 'utf-8'));
      if (status?.state !== 'error' || !/^[a-z0-9-]{1,40}$/.test(status.code || '')) return null;
      return { state: 'error', code: status.code };
    } catch { return null; }
  }

  // After the login terminal wrote creds: pull identity, default the name to
  // the email/plan if the user didn't set one. Returns loggedIn.
  finalizeSubscription(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') throw new Error('not a subscription account');
    const info = this.readSubCreds(id);
    const loginStatus = this._subscriptionLoginStatus(id);
    if (info.loggedIn && (!a.name || a.name === 'Subscription')) {
      a.name = (info.email || (info.subscriptionType ? info.subscriptionType[0].toUpperCase() + info.subscriptionType.slice(1) : 'Subscription')).slice(0, 60);
      this._save();
    }
    this._notify();
    const { accessToken: _accessToken, ...publicInfo } = info;
    return {
      id, ...publicInfo, name: a.name,
      localOnly: this._localOnlyClaudeSub(a),
      loginFailed: !info.loggedIn && loginStatus?.state === 'error',
      loginErrorCode: !info.loggedIn ? loginStatus?.code || null : null,
    };
  }

  // ── Codex subscription accounts (each = its own CODEX_HOME, auth isolated) ──

  // The shared ~/.codex the per-account homes symlink into. Ensure the symlink
  // TARGETS exist (sessions dir + config.toml) so codex reads/writes go there.
  _codexSharedHome() { return process.env.CODEX_HOME || path.join(os.homedir(), '.codex'); }
  _seedCodexDir(dir) {
    const shared = this._codexSharedHome();
    try { fs.mkdirSync(path.join(shared, 'sessions'), { recursive: true }); } catch { }
    try { if (!fs.existsSync(path.join(shared, 'config.toml'))) fs.writeFileSync(path.join(shared, 'config.toml'), ''); } catch { }
    const link = (name) => {
      const p = path.join(dir, name);
      try { fs.rmSync(p, { recursive: true, force: true }); } catch { }
      try { fs.symlinkSync(path.join(shared, name), p); } catch { }
    };
    link('sessions');   // threads land in the shared dir → unified discovery
    link('config.toml'); // model/approval settings shared across accounts
  }

  createCodexSubscription({ name } = {}) {
    const id = 'cxs-' + crypto.randomBytes(6).toString('hex');
    fs.mkdirSync(this.codexSubDir(id), { recursive: true, mode: 0o700 });
    this._seedCodexDir(this.codexSubDir(id));
    const a = { id, name: String(name || '').trim().slice(0, 60) || 'ChatGPT', type: 'subscription', backend: 'codex', source: 'login', createdAt: Date.now() };
    this._state.accounts.push(a);
    this._save();
    this._notify();
    return { id, dir: this.codexSubDir(id) };
  }

  // Decode a JWT payload without verifying (identity display only — never trust
  // for auth). Returns {} on any malformation.
  _jwtPayload(tok) {
    try {
      const seg = String(tok).split('.')[1];
      return JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')) || {};
    } catch { return {}; }
  }

  // Read-only parse of a codex auth.json (never refreshes). Reports loggedIn +
  // auth mode + identity (email/plan) from the id_token claims.
  _parseCodexAuthFile(file) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const mode = raw.auth_mode || (raw.tokens ? 'chatgpt' : (raw.OPENAI_API_KEY ? 'apikey' : null));
      const hasTok = !!(raw.tokens?.access_token || raw.tokens?.id_token || raw.OPENAI_API_KEY);
      if (!hasTok) return { loggedIn: false };
      let email = null, plan = null;
      if (raw.tokens?.id_token) {
        const c = this._jwtPayload(raw.tokens.id_token);
        email = c.email || null;
        const auth = c['https://api.openai.com/auth'] || {};
        plan = auth.chatgpt_plan_type || auth.plan_type || null;
      }
      return { loggedIn: true, authMode: mode, email, plan };
    } catch { return { loggedIn: false }; }
  }
  readCodexSubAuth(id) { return this._parseCodexAuthFile(path.join(this.codexSubDir(id), 'auth.json')); }
  // The machine's OWN codex login (~/.codex/auth.json) — the codex counterpart
  // of subscriptionStatus(); identity feeds the codex global↔named-account link.
  codexGlobalStatus() { return this._parseCodexAuthFile(path.join(this._codexSharedHome(), 'auth.json')); }

  finalizeCodexSubscription(id) {
    const a = this.get(id);
    if (!a || this._acctBackend(a) !== 'codex') throw new Error('not a codex account');
    const info = this.readCodexSubAuth(id);
    if (info.loggedIn && (!a.name || a.name === 'ChatGPT')) {
      a.name = (info.email || (info.plan ? 'ChatGPT ' + info.plan : 'ChatGPT')).slice(0, 60);
      this._save();
    }
    this._notify();
    return { id, ...info, name: a.name };
  }

  // ── Config export / import (Backup & migrate, 2.100.0) ──
  // Returns PLAINTEXT secrets — the caller MUST put this inside the export's
  // passphrase-encrypted sensitive blob. API keys are decrypted out of the
  // machine-local .accounts-key store (the key file itself never travels);
  // subscription creds ride as whitelisted dir files. Import re-encrypts under
  // the TARGET machine's own key and recreates the dirs.
  exportBundle() {
    const CLAUDE_SUB_FILES = ['.credentials.json', '.claude.json'];
    const CODEX_SUB_FILES = ['auth.json'];
    const readFiles = (dir, names) => {
      const out = {};
      for (const n of names) {
        try { out[n] = fs.readFileSync(path.join(dir, n), 'utf-8'); } catch { }
      }
      return out;
    };
    const accounts = this._state.accounts.map((a) => {
      const backend = this._acctBackend(a);
      const type = this._acctType(a);
      const rec = { id: a.id, name: a.name, backend, type, source: a.source, createdAt: a.createdAt };
      if (a.email) rec.email = a.email;
      if (a.tail) rec.tail = a.tail;
      if (a.keyEnc) { try { rec.key = this._dec(a.keyEnc); } catch { } }
      // Long-lived token travels like an API key (decrypted into the
      // passphrase blob; re-encrypted under the TARGET's key on import) — an
      // oat-ONLY account would otherwise import as a dead record (B-211a)
      if (a.oatEnc) { try { rec.oat = this._dec(a.oatEnc); rec.oatMintedAt = a.oatMintedAt || null; } catch { } }
      if (backend === 'codex') rec.files = readFiles(this.codexSubDir(a.id), CODEX_SUB_FILES);
      else if (type === 'subscription') {
        // macOS secure storage is Keychain-primary. The local fallback is a
        // same-machine compatibility shadow for launchd and can diverge after
        // refresh-token rotation, so never treat it as a portable backup.
        rec.files = readFiles(this.subDir(a.id), this._localOnlyClaudeSub(a) ? ['.claude.json'] : CLAUDE_SUB_FILES);
      }
      return rec;
    });
    return {
      version: 1,
      defaultAccountId: this._state.defaultAccountId || null,
      defaultCodexAccountId: this._state.defaultCodexAccountId || null,
      accounts,
    };
  }

  importBundle(bundle) {
    if (!bundle || !Array.isArray(bundle.accounts)) return { imported: 0, skipped: 0 };
    const FILE_OK = /^[.\w][\w.-]*$/; // whitelist shape — no separators, no traversal
    let imported = 0, skipped = 0;
    for (const rec of bundle.accounts) {
      if (!rec || typeof rec.id !== 'string' || !/^(acct|sub|cxs)-[a-f0-9]{6,}$/.test(rec.id)) { skipped++; continue; }
      if (this._state.accounts.some((a) => a.id === rec.id)) { skipped++; continue; } // never clobber an existing account
      const a = {
        id: rec.id,
        name: String(rec.name || '').slice(0, 60) || rec.id,
        source: rec.source || 'import',
        createdAt: rec.createdAt || Date.now(),
      };
      if (rec.email) a.email = String(rec.email).slice(0, 120);
      const isCodex = rec.backend === 'codex';
      if (isCodex) { a.backend = 'codex'; a.type = 'subscription'; }
      else if (rec.type === 'subscription') a.type = 'subscription';
      if (rec.key && /^sk-ant-/.test(rec.key)) { a.keyEnc = this._enc(String(rec.key)); a.tail = String(rec.key).slice(-8); }
      else if (rec.tail) a.tail = rec.tail;
      if (rec.oat && /^sk-ant-oat\d{2}-/.test(String(rec.oat))) { a.oatEnc = this._enc(String(rec.oat)); a.oatMintedAt = Number(rec.oatMintedAt) || Date.now(); }
      if (rec.files && typeof rec.files === 'object' && (isCodex || a.type === 'subscription')) {
        const dir = isCodex ? this.codexSubDir(a.id) : this.subDir(a.id);
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        if (isCodex) this._seedCodexDir(dir); // sessions/config.toml symlinks into the shared ~/.codex
        else this._seedConfigDir(dir);
        for (const [n, content] of Object.entries(rec.files)) {
          if (!FILE_OK.test(n) || typeof content !== 'string') continue;
          fs.writeFileSync(path.join(dir, n), content, { mode: 0o600 });
        }
      }
      this._state.accounts.push(a);
      imported++;
    }
    // Defaults only when the referenced account actually landed and none is set
    // locally — an import must not silently re-route existing sessions' billing.
    for (const [k, v] of [['defaultAccountId', bundle.defaultAccountId], ['defaultCodexAccountId', bundle.defaultCodexAccountId]]) {
      if (v && !this._state[k] && this._state.accounts.some((a) => a.id === v)) this._state[k] = v;
    }
    if (imported) { this._save(); this._notify(); }
    return { imported, skipped };
  }

  /** Identity email of a claude subscription record: the dir's own identity
   *  wins, then the declared email, then an email-shaped name. */
  identityEmailOf(a) {
    let dirEmail = null;
    try { if (this._acctType(a) === 'subscription' && (a.backend || 'claude') === 'claude') dirEmail = this.readSubCreds(a.id).email; } catch { }
    const v = dirEmail || a.email || (String(a.name || '').includes('@') ? a.name : '');
    return String(v || '').trim().toLowerCase();
  }

  /** Merge duplicate records of the SAME real account (same identity email —
   *  2.205.0, real report: a host add-flow login minted a second record of an
   *  account the user already had; "can't it auto-recognize?"). `fromId` (the
   *  newer dup) folds into `intoId` (the survivor): fresh local creds win
   *  when asked, hostLogins union, metadata kept on the survivor, the dup
   *  record spliced WITHOUT the delete-path host cleanup (its host dirs are
   *  renamed to the survivor by the caller first). */
  mergeSubscription(fromId, intoId, { preferFromCreds = false, liveAccountIds = null } = {}) {
    const from = this._state.accounts.find((x) => x.id === fromId);
    const into = this._state.accounts.find((x) => x.id === intoId);
    if (!from || !into || fromId === intoId) throw new Error('bad merge pair');
    // B-3f8a: NEVER rewrite creds while a session of EITHER side is running.
    // The CLI re-reads .credentials.json per HTTP request (verified vs 2.1.222,
    // SharedContext/devices-and-access.md) — so copying over intoDir/.credentials.json
    // would silently re-bill the survivor's live sessions MID-TURN, and the
    // rmSync(fromDir) would yank creds out from under the merged-away side's
    // live sessions. The caller (server.js, which holds activeSessions) passes
    // the set of account ids with a running session; refuse loudly if hit.
    if (liveAccountIds && (liveAccountIds.has?.(fromId) || liveAccountIds.has?.(intoId))) {
      const e = new Error('cannot merge these accounts while a session using either is running — stop those sessions first');
      e.code = 'merge-account-live';
      throw e;
    }
    // Claude's macOS Keychain service is hashed from the config-dir path
    // (PR #23, walter). Moving fresh fallback bytes to another id does NOT
    // move that Keychain item, so the survivor can keep reading its old token
    // and the new item is orphaned. Keep both records instead of claiming a
    // safe file-only merge.
    if (this._localOnlyClaudeSub(from) || this._localOnlyClaudeSub(into)) {
      throw new Error('macOS Keychain-backed subscriptions cannot be merged across config directories');
    }
    // local creds: bring the dup's dir over when it's fresher/the only login
    try {
      const fromDir = this.subDir(fromId), intoDir = this.subDir(intoId);
      const intoLogged = this.readSubCreds(intoId).loggedIn;
      if (fs.existsSync(path.join(fromDir, '.credentials.json')) && (preferFromCreds || !intoLogged)) {
        fs.mkdirSync(intoDir, { recursive: true, mode: 0o700 });
        fs.chmodSync(intoDir, 0o700);
        for (const f of ['.credentials.json', '.claude.json']) {
          const src = path.join(fromDir, f);
          if (fs.existsSync(src)) {
            const dest = path.join(intoDir, f);
            const tmp = dest + `.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
            let fd;
            try {
              const content = fs.readFileSync(src);
              fd = fs.openSync(tmp, 'wx', 0o600);
              fs.writeFileSync(fd, content);
              fs.fchmodSync(fd, 0o600);
              if ((fs.fstatSync(fd).mode & 0o777) !== 0o600) throw new Error('private mode not applied');
              fs.fsyncSync(fd);
              fs.closeSync(fd); fd = undefined;
              fs.renameSync(tmp, dest);
            } finally {
              if (fd !== undefined) { try { fs.closeSync(fd); } catch { } }
              try { fs.unlinkSync(tmp); } catch { }
            }
          }
        }
      }
      fs.rmSync(fromDir, { recursive: true, force: true });
    } catch { /* best-effort file consolidation */ }
    if (from.hostLogins) into.hostLogins = { ...(from.hostLogins), ...(into.hostLogins || {}) };
    if (!into.email && from.email) into.email = from.email;
    if (!into.oatEnc && from.oatEnc) { into.oatEnc = from.oatEnc; into.oatMintedAt = from.oatMintedAt; } // long-lived token survives the fold (B-211a)
    if (!into.note && from.note) into.note = from.note;
    if (this._state.defaultAccountId === fromId) this._state.defaultAccountId = intoId;
    this._state.accounts = this._state.accounts.filter((x) => x.id !== fromId);
    this._save();
    this._notify();
    return this.list().accounts.find((x) => x.id === intoId) || null;
  }

  /** Write-through from a host identity probe (2.204.0): remember which
   *  machines hold a per-account login dir for each account, so EVERY view
   *  (incl. the local one, which probes no host) can say "logged in on X"
   *  instead of a bare "not logged in" (real report: an account whose only
   *  login lived on AIDev read as dead on the local view). Cleared for a
   *  host when its probe stops listing the account. */
  noteHostLogins(hostId, ids) {
    if (!hostId) return;
    const set = new Set(ids || []);
    let changed = false;
    for (const a of this._state.accounts) {
      const has = !!a.hostLogins?.[hostId];
      if (set.has(a.id) && !has) { (a.hostLogins ||= {})[hostId] = Date.now(); changed = true; }
      else if (!set.has(a.id) && has) {
        delete a.hostLogins[hostId];
        if (!Object.keys(a.hostLogins).length) delete a.hostLogins;
        changed = true;
      }
    }
    if (changed) { this._save(); this._notify(); }
  }

  /** Decrypted key VALUE for the reveal dialog (API-key accounts only).
   *  Same trust model as the mounts config endpoint (2.108.8, user
   *  directive): single-user instance, cookie-authed — blank secrets that
   *  can never be re-read are worse than showing them on request (real
   *  incident: a removed key was unrecoverable; the Console never re-shows
   *  values). */
  revealKey(id) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('unknown account');
    if (!a.keyEnc) throw new Error('not an API-key account');
    return this._dec(a.keyEnc);
  }

  /** Free-text provenance/annotation shown as a dim tag in the roster —
   *  answers "where did this key come from?" (real report: a key imported
   *  from a host read as live-shared from it; the note + originHost make the
   *  independent-copy semantics visible). */
  setNote(id, note) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('unknown account');
    const v = String(note || '').trim().slice(0, 120);
    if (v) a.note = v; else delete a.note;
    this._save();
    return this.list().accounts.find((x) => x.id === id) || null;
  }

  add({ name, key, source = 'manual', originHost = null } = {}) {
    key = String(key || '').trim();
    if (!/^sk-ant-/.test(key)) throw new Error('not an Anthropic API key (must start with sk-ant-)');
    const tail = key.slice(-8);
    // Idempotent: re-adding the same key returns the existing record.
    for (const a of this._state.accounts) {
      if (a.tail === tail) {
        try { if (this._dec(a.keyEnc) === key) return { id: a.id, name: a.name, tail: a.tail, existing: true }; } catch { }
      }
    }
    const a = {
      id: 'acct-' + crypto.randomBytes(6).toString('hex'),
      name: String(name || '').trim().slice(0, 60) || ('API key …' + tail),
      keyEnc: this._enc(key),
      tail,
      source,
      // provenance: the machine this key was imported FROM (display only —
      // the record is an independent copy in this store, not live-linked)
      ...(originHost ? { originHost: String(originHost).slice(0, 60) } : {}),
      createdAt: Date.now(),
    };
    this._state.accounts.push(a);
    this._save();
    this._notify();
    return { id: a.id, name: a.name, tail: a.tail };
  }

  rename(id, name) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('account not found');
    a.name = String(name || '').trim().slice(0, 60) || a.name;
    this._save();
    this._notify();
    return { id: a.id, name: a.name, tail: a.tail };
  }

  // Manual identity backfill: some login flows leave a subscription's creds dir
  // without the identity file (.claude.json oauthAccount) — creds work, but the
  // email is unknowable from disk. The email is what links a named account to
  // the machine's own CLI login (usage merge/dedup), so let the user declare it.
  // Stored on the account record; list() uses it only when the dir has none.
  setEmail(id, email) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('account not found');
    a.email = String(email || '').trim().slice(0, 120) || undefined;
    this._save();
    this._notify();
    return { id: a.id, name: a.name, email: a.email || null };
  }

  remove(id) {
    const i = this._state.accounts.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('account not found');
    const a = this._state.accounts[i];
    this._state.accounts.splice(i, 1);
    if (this._state.defaultAccountId === id) this._state.defaultAccountId = null;
    if (this._state.defaultCodexAccountId === id) this._state.defaultCodexAccountId = null;
    // Isolated-login accounts own a creds dir — wipe it (best-effort).
    if (this._acctBackend(a) === 'codex') { try { fs.rmSync(this.codexSubDir(id), { recursive: true, force: true }); } catch { } }
    else if (this._acctType(a) === 'pooled') { try { fs.unlinkSync(this.subDir(id)); } catch { } } // unlink ONLY — the target is a real account's dir
    else if (this._acctType(a) === 'subscription') { try { fs.rmSync(this.subDir(id), { recursive: true, force: true }); } catch { } }
    this._save();
    this._notify();
  }

  // null = the CLI's own global login is the default for new sessions. Each
  // backend has its OWN default (claude vs codex). When id is given the backend
  // is derived from the account; when clearing (id null) the caller passes it.
  setDefault(id, backend = 'claude') {
    let be = backend;
    if (id != null) {
      const a = this.get(id);
      if (!a) throw new Error('account not found');
      be = this._acctBackend(a);
    }
    if (be === 'codex') this._state.defaultCodexAccountId = id || null;
    else this._state.defaultAccountId = id || null;
    this._save();
    this._notify();
  }

  get(id) { return this._state.accounts.find((a) => a.id === id) || null; }

  getKey(id) {
    const a = this.get(id);
    if (!a) return null;
    try { return this._dec(a.keyEnc); } catch { return null; }
  }

  // Resolve what a create request means into a spawn descriptor.
  //   undefined/null → server default; 'subscription' → the CLI's GLOBAL login
  //   (no env override); 'acct-…'/'sub-…' → that account.
  // Returns null (= global login, no env change) or:
  //   { id, name, tail?, kind:'api'|'subscription',
  //     localEnv: {VAR:val},          // set in the LOCAL process spawn env
  //     secret: {var,value} | null }  // shipped over ssh-stdin for REMOTE (api only)
  /**
   * evaluateOnHost — THE single authority for "how does account X run on
   * machine Y" (B-f531, 2.244.0 — after SIX field incidents where four client
   * surfaces and two server branches each computed their own verdict from
   * their own caches). PURE given hostFacts: the same function feeds the
   * display surfaces (accounts-status `verdicts`) and the spawn path
   * (ws-handler create), so what the UI promises is exactly what the spawn
   * does.
   *
   * @param a          account record (this.get(id))
   * @param hostFacts  null = LOCAL spawn; else the accountsStatus() result
   *                   (+ .transport) — LIVE host facts, never a client cache
   * @param opts       { allowShip } — accounts.shipSubscriptionToRemote
   * @returns {usable, how, reason, linked, held, heldVerified}
   *   how:    'local-env'  spawn locally with the account env
   *           'ship'       creds/key ship to the host (resolveForSpawn path)
   *           'host-held'  host-side ~/.vibespace/subs/<id> dir (nothing ships)
   *           'host-login' the host's own CLI login IS this account (email)
   *   reason (when !usable): 'never-signed-in' | 'ship-disabled' |
   *           'dial-no-ship' | 'held-identity-mismatch'
   * PRECEDENCE (2.243.2 lesson): host-held beats email-linked — the dir's
   * creds are the named account deterministically, while the host's config
   * email goes stale right after a /login switch (2.114.1 class). And when
   * the host REPORTS the dir's actual identity (hostSubEmails) and it does
   * NOT match this account, the dir is poisoned/mislabeled — refuse it
   * loudly instead of billing whoever's creds sit in it.
   */
  evaluateOnHost(a, hostFacts, { allowShip = false } = {}) {
    const backend = this._acctBackend(a);
    // Pooled pseudo-accounts are LOCAL-ONLY: shipping would freeze the pool at
    // spawn time (a copy of the symlink's contents) and break the shared-lock
    // invariant on the host. Never let them fall into the API-key always-ship
    // branch below.
    if (this._acctType(a) === 'pooled') {
      if (hostFacts) return { usable: false, how: null, reason: 'pool-local-only', linked: false, held: false, heldVerified: false };
      const ok = !!this.poolCurrent(a.id) && !!this.readSubCreds(a.id).loggedIn;
      return { usable: ok, how: 'local-env', reason: ok ? null : 'pool-no-target', linked: false, held: false, heldVerified: false };
    }
    const isSub = backend === 'codex' || this._acctType(a) === 'subscription';
    const norm = (v) => String(v || '').trim().toLowerCase();
    const acctEmail = norm(a.email || (String(a.name || '').includes('@') ? a.name : ''));
    if (!isSub) {
      // API keys are the sanctioned programmatic path — always shippable
      return { usable: true, how: hostFacts ? 'ship' : 'local-env', reason: null, linked: false, held: false, heldVerified: false };
    }
    const loggedIn = backend === 'codex' ? !!this.readCodexSubAuth(a.id).loggedIn : !!this.readSubCreds(a.id).loggedIn;
    // Hosts KNOWN to hold this account's own login (noteHostLogins write-
    // through) minus the host being evaluated: "signed in SOMEWHERE else" is
    // a different situation than "never signed in anywhere" — natural's
    // report: ClaudeLu (held on Novita) showed "never finished signing in"
    // in a CW-H200 session's menu, reading as a broken account (2.244.3).
    const otherHosts = Object.keys(a.hostLogins || {}).filter((h) => h !== hostFacts?.hostId);
    const noLoginReason = () => (otherHosts.length ? 'not-on-this-host' : 'never-signed-in');
    // hasOat = a VALID token only — mirrors resolveForSpawn's oatExpired drop
    // (an expired oat must never rank an account usable: the switcher would
    // kill-then-fail the create, and a DEFAULT account would silently flip to
    // the host login the day it expires). Expired gets its own 'oat-expired'
    // reason below so every surface can say re-mint instead of the §ban-safety
    // ship explanation.
    const hasOat = backend === 'claude' && !!a.oatEnc && (a.oatMintedAt || 0) + this.OAT_TTL_MS > Date.now();
    const oatExpired = backend === 'claude' && !!a.oatEnc && !hasOat;
    if (!hostFacts) {
      if (loggedIn) return { usable: true, how: 'local-env', reason: null, linked: false, held: false, heldVerified: false };
      // no local login but a long-lived token → spawns via the env token
      if (hasOat) return { usable: true, how: 'oat', reason: null, linked: false, held: false, heldVerified: false };
      if (oatExpired) return { usable: false, how: null, reason: 'oat-expired', linked: false, held: false, heldVerified: false };
      return { usable: false, how: null, reason: noLoginReason(), otherHosts, linked: false, held: false, heldVerified: false };
    }
    const hostEmail = norm(backend === 'codex' ? hostFacts.codex?.email : hostFacts.subscription?.email);
    const linked = !!acctEmail && !!hostEmail && acctEmail === hostEmail;
    const held = backend === 'claude' && (hostFacts.hostSubs || []).includes(a.id);
    if (held) {
      const dirEmail = norm(hostFacts.hostSubEmails?.[a.id]);
      if (dirEmail && acctEmail && dirEmail !== acctEmail) {
        return { usable: false, how: null, reason: 'held-identity-mismatch', linked, held, heldVerified: false, dirEmail };
      }
      return { usable: true, how: 'host-held', reason: null, linked, held, heldVerified: !!dirEmail };
    }
    if (linked) return { usable: true, how: 'host-login', reason: null, linked, held, heldVerified: false };
    // Long-lived token: usable on ANY host incl. dial — it rides the secret
    // env channel (nothing rotates, no token-endpoint traffic from the host).
    // Ranked below host-held/linked (a full login there has more capability)
    // and above full-login shipping.
    if (hasOat) return { usable: true, how: 'oat', reason: null, linked, held, heldVerified: false };
    if (loggedIn && allowShip && hostFacts.transport !== 'dial') {
      // macOS Keychain-backed logins never ship (PR #23, walter): the file
      // fallback is a same-machine shadow that forks the rotating refresh
      // token the moment either copy refreshes. Log in ON the host instead
      // (held/linked/oat rungs above stay fully usable for these accounts).
      if (this._localOnlyClaudeSub(a)) return { usable: false, how: null, reason: 'local-only-mac', linked, held, heldVerified: false };
      return { usable: true, how: 'ship', reason: null, linked, held, heldVerified: false };
    }
    // Expired oat beats the generic reasons — 're-mint' is the actionable fix
    if (oatExpired) return { usable: false, how: null, reason: 'oat-expired', linked, held, heldVerified: false };
    if (!loggedIn) return { usable: false, how: null, reason: noLoginReason(), otherHosts, linked, held, heldVerified: false };
    // local-only-mac beats ship-disabled: flipping the ship setting would not
    // make a Keychain-backed login portable — say the real constraint.
    return { usable: false, how: null, reason: hostFacts.transport === 'dial' ? 'dial-no-ship' : this._localOnlyClaudeSub(a) ? 'local-only-mac' : 'ship-disabled', linked, held, heldVerified: false };
  }

  // ── Long-lived OAuth token (oat01, B-211a) ─────────────────────────────
  // `claude setup-token` mints a 1-year subscription token with NO refresh
  // token (verified vs 2.1.225: LONG_LIVED_OAUTH_TOKEN_TTL_SECONDS=31536000,
  // inferenceOnly:true; the client adapts it as {refreshToken:null,
  // expiresAt:null} and NEVER touches the token endpoint). Stored encrypted
  // like API keys. What it buys per placement:
  //   · REMOTE: ships as CLAUDE_CODE_OAUTH_TOKEN via the existing 0600-file +
  //     $(cat …) secret channel (ssh AND dial) — never rotates, so the local
  //     and remote copies can never diverge and the host makes ZERO
  //     token-endpoint calls (§ban-safety's #1 signal gone; the creds-dir
  //     tar dance isn't used for oat accounts).
  //   · LOCAL fallback: an account with no local login but an oat spawns via
  //     the env token (macOS keychain bypassed too).
  // Scope is inference-only (no user:profile): the on-demand quota ⟳ cannot
  // work through an oat, and a 401 (revoked/expired) has NO self-heal — the
  // CLI errors until re-mint. Minting the token is treated as the per-account
  // consent to run it on remote machines (finer-grained than the global
  // shipSubscriptionToRemote toggle, which stays for full-login shipping).
  OAT_TTL_MS = 31536000 * 1000;

  setOat(id, token) {
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    if (this._acctBackend(a) !== 'claude' || this._acctType(a) !== 'subscription') throw new Error('long-lived tokens apply to Claude subscription accounts only');
    token = String(token || '').trim();
    // sk-ant-oat01-… today; tolerate future oat revisions, refuse everything
    // else (an API key or a pasted access token here would mis-bill silently)
    if (!/^sk-ant-oat\d{2}-[\w-]{20,600}$/.test(token)) throw new Error('that does not look like a long-lived token (expected sk-ant-oat01-…, from `claude setup-token`)');
    a.oatEnc = this._enc(token);
    a.oatMintedAt = Date.now();
    this._save();
    this._notify();
    return { id, mintedAt: a.oatMintedAt };
  }

  clearOat(id) {
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    delete a.oatEnc; delete a.oatMintedAt;
    this._save();
    this._notify();
  }

  getOat(id) {
    const a = this.get(id);
    if (!a || !a.oatEnc) return null;
    try { return this._dec(a.oatEnc); } catch { return null; }
  }

  _oatMeta(a) {
    if (!a?.oatEnc) return {};
    const expiresAt = (a.oatMintedAt || 0) + this.OAT_TTL_MS;
    return { oat: true, oatMintedAt: a.oatMintedAt || null, oatDaysLeft: Math.floor((expiresAt - Date.now()) / 86400000) };
  }

  // ── Pooled pseudo-account (B-6217) ──────────────────────────────────────
  // A pooled account is NOT a login of its own: its "creds dir" is a DIRECTORY
  // SYMLINK at data/subs/<poolId> pointing at a REAL subscription's dir, and
  // switching accounts = atomically re-pointing that symlink.
  //
  // Why a DIRECTORY symlink and not copies or a file symlink (proven in
  // scripts/test-creds-symlink-swap.mjs, 8 asserts):
  //   · the CLI writes credentials with atomicWrite = tmp+rename, which
  //     REPLACES a *file* symlink on the first refresh — a *directory* one
  //     survives, because the rename happens INSIDE the resolved dir;
  //   · refreshes therefore land in the canonical account dir, so there is
  //     exactly ONE credential copy and Anthropic's ROTATING refresh token
  //     never gets rotated out from under a sibling session (the reason
  //     per-session copies are unsafe);
  //   · `<dir>/.oauth_refresh.lock` resolves through the symlink to the SAME
  //     real lock a normal session of that account takes ⇒ a pooled session
  //     and a normal session of one account are mutually excluded exactly as
  //     two normal sessions are today. Zero new refresh conflict.
  //   · QX() (the CLI's config-home resolver) returns the env STRING with no
  //     realpath and no caching, so the kernel re-resolves per syscall and a
  //     re-point is visible immediately; the stat'd mtime changes too, which
  //     is what invalidates the CLI's credential cache.
  // LINUX ONLY: on macOS credentials go to a keychain whose service name is
  // sha256(NFC(env string)) — the STRING, not the resolved path — so the pool
  // path would get its own keychain entry and the sharing silently breaks.
  poolSupported() { return process.platform !== 'win32' && process.platform !== 'darwin'; }

  // Candidate members: explicit list (filtered to still-valid logins) or, when
  // the pool declares none, EVERY logged-in Claude subscription (the default
  // the user asked for). Never includes another pool.
  poolMembers(id) {
    const a = this.get(id);
    const all = this._state.accounts.filter((x) => this._acctBackend(x) === 'claude' && this._acctType(x) === 'subscription');
    const wanted = Array.isArray(a?.members) && a.members.length ? all.filter((x) => a.members.includes(x.id)) : all;
    return wanted.filter((x) => this.readSubCreds(x.id).loggedIn).map((x) => ({ id: x.id, name: x.name }));
  }

  // The real account a pool currently resolves to, read from the symlink
  // itself (the link IS the state — no second source of truth to drift).
  poolCurrent(id) {
    try {
      const t = fs.readlinkSync(this.subDir(id));
      const sub = path.basename(t);
      return this.get(sub) ? sub : null;
    } catch { return null; }
  }

  // Atomically re-point the pool at `subId`. symlink-to-temp + rename so a
  // concurrent spawn either sees the old target or the new one, never a gap.
  // The target's creds mtime is bumped because the CLI's credential cache is
  // mtime-gated and two accounts could otherwise share an mtimeMs.
  setPoolTarget(id, subId) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'pooled') throw new Error('not a pooled account');
    const target = this.get(subId);
    if (!target || this._acctType(target) !== 'subscription' || this._acctBackend(target) !== 'claude') throw new Error('not a Claude subscription: ' + subId);
    if (!this.readSubCreds(subId).loggedIn) throw new Error('subscription not logged in: ' + target.name);
    const link = this.subDir(id);
    // Refuse to clobber a REAL directory — that would be someone's creds.
    try { const st = fs.lstatSync(link); if (!st.isSymbolicLink()) throw new Error('pool path is a real directory, refusing to replace: ' + link); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const tmp = link + '.swap-' + crypto.randomBytes(4).toString('hex');
    fs.symlinkSync(this.subDir(subId), tmp);
    fs.renameSync(tmp, link);
    try { const now = Date.now() / 1000; fs.utimesSync(this.subCredsPath(subId), now, now); } catch { }
    this._notify();
    return { id, current: subId, name: target.name };
  }

  createPool({ name, members } = {}) {
    if (!this.poolSupported()) throw new Error('pooled accounts need a platform with directory symlinks and no keychain-backed credentials (Linux)');
    const id = 'pool-' + crypto.randomBytes(6).toString('hex');
    const a = { id, name: String(name || '').trim().slice(0, 60) || 'Pool', type: 'pooled', backend: 'claude', members: Array.isArray(members) && members.length ? members.slice(0, 40) : null, auto: false, hot: false, createdAt: Date.now() };
    this._state.accounts.push(a);
    this._save();
    const first = this.poolMembers(id)[0];
    if (!first) { this._state.accounts = this._state.accounts.filter((x) => x.id !== id); this._save(); throw new Error('no logged-in Claude subscription to pool'); }
    this.setPoolTarget(id, first.id);
    this._notify();
    return { id, current: first.id };
  }

  // members / auto / hot. A member list that drops the CURRENT target re-points
  // to the first remaining member (a pool must always resolve to something).
  updatePool(id, { members, auto, hot } = {}) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'pooled') throw new Error('not a pooled account');
    if (members !== undefined) a.members = Array.isArray(members) && members.length ? members.slice(0, 40) : null;
    if (auto !== undefined) a.auto = !!auto;
    if (hot !== undefined) a.hot = !!hot;
    this._save();
    const cur = this.poolCurrent(id);
    const list = this.poolMembers(id);
    if (list.length && !list.some((m) => m.id === cur)) this.setPoolTarget(id, list[0].id);
    this._notify();
    return this.get(id);
  }

  resolveForSpawn(requested, backend = 'claude') {
    if (backend === 'codex') return this._resolveCodexSpawn(requested);
    if (requested === 'subscription') return null; // the CLI's own global login
    const id = requested || this._state.defaultAccountId;
    if (!id) return null;
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    if (this._acctBackend(a) !== 'claude') throw new Error('not a Claude account: ' + a.name);
    if (this._acctType(a) === 'pooled') {
      const cur = this.poolCurrent(id);
      if (!cur) throw new Error('pooled account has no target: ' + a.name);
      // readSubCreds resolves THROUGH the symlink, so this is the real login.
      if (!this.readSubCreds(id).loggedIn) throw new Error('pooled target is not logged in: ' + a.name);
      // No remoteCreds: shipping would copy the symlink's CONTENTS to a fixed
      // remote dir, freezing the pool at spawn time and (on a macOS host)
      // landing in a per-path keychain entry. Pools are local-only for now.
      return { id: a.id, name: a.name, kind: 'subscription', pooled: true, poolTarget: cur, localEnv: { CLAUDE_SECURESTORAGE_CONFIG_DIR: this.subDir(id) }, secret: null };
    }
    if (this._acctType(a) === 'subscription') {
      const info = this.readSubCreds(id);
      // Long-lived token (B-211a): rides the API-key secret channel for
      // remote spawns (both remote paths check .secret BEFORE the creds-dir
      // ship, so an oat account never tars its rotating login to a host).
      // Locally the dir login stays authoritative when present (hot-swap +
      // full capabilities); with NO local login the env token IS the spawn.
      const oatExpired = a.oatEnc && (a.oatMintedAt || 0) + this.OAT_TTL_MS < Date.now();
      const oat = oatExpired ? null : this.getOat(id);
      const oatSecret = oat ? { var: 'CLAUDE_CODE_OAUTH_TOKEN', value: oat } : null;
      if (!info.loggedIn && oat) {
        return { id: a.id, name: a.name, kind: 'subscription', oatOnly: true, localEnv: { CLAUDE_CODE_OAUTH_TOKEN: oat }, secret: oatSecret };
      }
      // Expired oat: fail the CREATE with the real reason instead of letting
      // the CLI 401 opaquely mid-session (a long-lived 401 has no self-heal).
      // loggedIn + expired-oat just drops the secret — the dir login works
      // locally and the remote paths give their normal actionable errors.
      if (!info.loggedIn && a.oatEnc && oatExpired) throw new Error(`the long-lived token for ${a.name} has expired — re-mint it in Manage agents (⋯ → Long-lived token)`);
      if (!info.loggedIn) throw new Error('subscription not logged in: ' + a.name);
      return {
        id: a.id, name: a.name, kind: 'subscription', oatExpired: oatExpired || undefined,
        localEnv: { CLAUDE_SECURESTORAGE_CONFIG_DIR: this.subDir(id) }, secret: oatSecret,
        // REMOTE: ship the creds dir to the host so the remote CLI reads THIS
        // account's login (securestorage relocated; config stays ~/.claude).
        // probe: newest-wins keeps a POISONED remote file forever (e.g. a
        // Console /login inside a remote session wipes .credentials.json to {}
        // with a fresh mtime) — a remote primary file MISSING the marker is
        // deleted before extract so the valid local copy always restores it.
        remoteCreds: {
          srcDir: this.subDir(id), dirName: 'subs/' + id, envVar: 'CLAUDE_SECURESTORAGE_CONFIG_DIR',
          files: ['.credentials.json', '.claude.json'], symlinks: {}, ensureTargets: [],
          probe: { file: '.credentials.json', marker: 'accessToken' },
          // Keychain + fallback can fork when either copy refreshes (rotating
          // refresh tokens). It remains usable on this Mac, or on another host
          // that has its OWN login for the account, but must never be copied.
          shippable: !this._localOnlyClaudeSub(a),
        },
      };
    }
    const key = this.getKey(id);
    if (!key) throw new Error('account key unavailable (decryption failed): ' + a.name);
    return { id: a.id, name: a.name, tail: a.tail, kind: 'api', localEnv: { ANTHROPIC_API_KEY: key }, secret: { var: 'ANTHROPIC_API_KEY', value: key } };
  }

  // Codex spawn: undefined/null → the account's own global login (default) or
  // ~/.codex when none; a 'cxs-…' id → that account's isolated CODEX_HOME.
  _resolveCodexSpawn(requested) {
    if (requested === 'subscription') return null; // codex's own global login
    const id = requested || this._state.defaultCodexAccountId;
    if (!id) return null;
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    if (this._acctBackend(a) !== 'codex') throw new Error('not a Codex account: ' + a.name);
    const info = this.readCodexSubAuth(id);
    if (!info.loggedIn) throw new Error('codex account not logged in: ' + a.name);
    return {
      id: a.id, name: a.name, kind: 'codex-subscription',
      localEnv: { CODEX_HOME: this.codexSubDir(id) }, secret: null,
      // REMOTE: ship auth.json to the host's CODEX_HOME copy; sessions/config
      // symlink the host's own ~/.codex (targets ensured first) so threads +
      // settings stay shared on the host, auth isolated per account.
      remoteCreds: {
        srcDir: this.codexSubDir(id), dirName: 'codex-subs/' + id, envVar: 'CODEX_HOME',
        files: ['auth.json'],
        symlinks: { sessions: '$HOME/.codex/sessions', 'config.toml': '$HOME/.codex/config.toml' },
        ensureTargets: ['mkdir -p "$HOME/.codex/sessions"', 'touch "$HOME/.codex/config.toml"'],
        probe: { file: 'auth.json', marker: 'auth_mode|tokens|OPENAI_API_KEY' },
      },
    };
  }

  // ── Add a CONSOLE account (its minted API key) WITHOUT nuking the global
  // subscription. A console /login mints primaryApiKey into ~/.claude.json AND
  // wipes .credentials.json (destructive). We protect the global creds by
  // pointing CLAUDE_SECURESTORAGE_CONFIG_DIR at a throwaway dir — the wipe lands
  // THERE, ~/.claude/.credentials.json is untouched (its token reads from
  // securestorage). The minted key still lands in the shared ~/.claude.json, so
  // capture reads it via importFromCli. Config dir stays ~/.claude → no
  // first-run onboarding. Throwaway dir discarded after.
  beginConsoleLogin() {
    const id = 'con-' + crypto.randomBytes(6).toString('hex');
    const dir = path.join(this._subsDir, id);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this._seedConfigDir(dir);
    return { id, dir };
  }
  captureConsoleLogin(id, { name } = {}) {
    if (!/^con-[a-f0-9]+$/.test(id)) throw new Error('bad login id');
    const dir = path.join(this._subsDir, id);
    // With CLAUDE_CONFIG_DIR=dir the console login minted primaryApiKey into
    // dir/.claude.json (isolated — ~/.claude.json untouched). Read it there.
    let pk = null, org = null;
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.claude.json'), 'utf-8'));
      pk = cfg?.primaryApiKey; org = cfg?.oauthAccount?.organizationName || null;
    } catch { }
    if (typeof pk !== 'string' || !/^sk-ant-/.test(pk)) return { captured: false };
    const account = this.add({ name: name || (org ? org + ' (Console)' : 'Console API'), key: pk, source: 'console-login' });
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
    return { captured: true, account };
  }

  // A subscription account's read-only access token for the usage poll (null if
  // expired/absent — we NEVER refresh; a running session or a next-use refreshes
  // it). Used by server.js to poll per-account /api/oauth/usage.
  usageToken(id) {
    const a = this.get(id);
    // Anthropic-only poll — codex usage is OpenAI-side, not surfaced here.
    if (!a || this._acctBackend(a) !== 'claude' || this._acctType(a) !== 'subscription') return null;
    return this.readSubCreds(id).accessToken || null;
  }

  // ── Read-only probes of the CLI's own login state (NEVER written) ──

  // Subscription = global OAuth login present in ~/.claude/.credentials.json.
  subscriptionStatus() {
    let loggedIn = false;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf-8'));
      loggedIn = !!raw?.claudeAiOauth?.accessToken;
    } catch { }
    let email = null, org = null;
    if (loggedIn) {
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8'));
        email = cfg?.oauthAccount?.emailAddress || null;
        org = cfg?.oauthAccount?.organizationName || null;
      } catch { }
    }
    return { loggedIn, email, org };
  }

  // The CLI's console login mints primaryApiKey in ~/.claude.json — importable.
  cliPrimaryKey() {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8'));
      const pk = cfg?.primaryApiKey;
      if (typeof pk === 'string' && /^sk-ant-/.test(pk)) {
        const tail = pk.slice(-8);
        return {
          present: true,
          tail,
          org: cfg?.oauthAccount?.organizationName || null,
          imported: this._state.accounts.some((a) => a.tail === tail),
        };
      }
    } catch { }
    return { present: false };
  }

  importFromCli() {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8'));
      const pk = cfg?.primaryApiKey;
      if (typeof pk !== 'string' || !/^sk-ant-/.test(pk)) throw new Error('no primaryApiKey in ~/.claude.json — log in to a Console account first');
      const org = cfg?.oauthAccount?.organizationName;
      return this.add({ name: org ? org + ' (API)' : 'Console API', key: pk, source: 'cli-import' });
    } catch (e) { throw new Error(e.message); }
  }
}

module.exports = { AccountManager };
