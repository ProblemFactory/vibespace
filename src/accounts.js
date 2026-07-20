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
  constructor({ dataDir, onChange }) {
    this._file = path.join(dataDir, 'accounts.json');
    this._keyFile = path.join(dataDir, '.accounts-key');
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
        const base = { id: a.id, name: a.name, type, backend, source: a.source, originHost: a.originHost || null, note: a.note || null, createdAt: a.createdAt };
        if (backend === 'codex') {
          const info = this.readCodexSubAuth(a.id);
          return { ...base, loggedIn: info.loggedIn, email: info.email || a.email || null, emailDeclared: !info.email && !!a.email, subscriptionType: info.plan, authMode: info.authMode };
        }
        if (type === 'subscription') {
          const info = this.readSubCreds(a.id);
          // a.email = manual backfill (setEmail) for dirs whose login never
          // wrote the identity file; the dir's own identity wins when present.
          return { ...base, loggedIn: info.loggedIn, email: info.email || a.email || null, emailDeclared: !info.email && !!a.email, subscriptionType: info.subscriptionType };
        }
        return { ...base, tail: a.tail };
      }),
    };
  }

  // ── Subscription accounts (each = its own securestorage creds dir) ──

  // Allocate an empty account + dir. The OAuth login happens externally
  // (a terminal running `CLAUDE_SECURESTORAGE_CONFIG_DIR=<dir> claude /login`);
  // the caller watches for the creds file, then calls finalizeSubscription.
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

  // After the login terminal wrote creds: pull identity, default the name to
  // the email/plan if the user didn't set one. Returns loggedIn.
  finalizeSubscription(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') throw new Error('not a subscription account');
    const info = this.readSubCreds(id);
    if (info.loggedIn && (!a.name || a.name === 'Subscription')) {
      a.name = (info.email || (info.subscriptionType ? info.subscriptionType[0].toUpperCase() + info.subscriptionType.slice(1) : 'Subscription')).slice(0, 60);
      this._save();
    }
    this._notify();
    return { id, ...info, name: a.name };
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
      if (backend === 'codex') rec.files = readFiles(this.codexSubDir(a.id), CODEX_SUB_FILES);
      else if (type === 'subscription') rec.files = readFiles(this.subDir(a.id), CLAUDE_SUB_FILES);
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
  resolveForSpawn(requested, backend = 'claude') {
    if (backend === 'codex') return this._resolveCodexSpawn(requested);
    if (requested === 'subscription') return null; // the CLI's own global login
    const id = requested || this._state.defaultAccountId;
    if (!id) return null;
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    if (this._acctBackend(a) !== 'claude') throw new Error('not a Claude account: ' + a.name);
    if (this._acctType(a) === 'subscription') {
      const info = this.readSubCreds(id);
      if (!info.loggedIn) throw new Error('subscription not logged in: ' + a.name);
      return {
        id: a.id, name: a.name, kind: 'subscription',
        localEnv: { CLAUDE_SECURESTORAGE_CONFIG_DIR: this.subDir(id) }, secret: null,
        // REMOTE: ship the creds dir to the host so the remote CLI reads THIS
        // account's login (securestorage relocated; config stays ~/.claude).
        // probe: newest-wins keeps a POISONED remote file forever (e.g. a
        // Console /login inside a remote session wipes .credentials.json to {}
        // with a fresh mtime) — a remote primary file MISSING the marker is
        // deleted before extract so the valid local copy always restores it.
        remoteCreds: { srcDir: this.subDir(id), dirName: 'subs/' + id, envVar: 'CLAUDE_SECURESTORAGE_CONFIG_DIR', files: ['.credentials.json', '.claude.json'], symlinks: {}, ensureTargets: [], probe: { file: '.credentials.json', marker: 'accessToken' } },
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
