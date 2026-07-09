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
    this._onChange = onChange || (() => {});
    this._state = { version: 1, defaultAccountId: null, accounts: [] };
    this._load();
    // Console-login scratch dirs (con-*) are transient; drop any abandoned by a
    // login that never completed before a prior restart.
    try { for (const d of fs.readdirSync(this._subsDir)) if (/^con-/.test(d)) fs.rmSync(path.join(this._subsDir, d), { recursive: true, force: true }); } catch { }
  }

  _acctType(a) { return a.type || 'api'; } // legacy records (no type) = API key
  subDir(id) { return path.join(this._subsDir, id); }
  subCredsPath(id) { return path.join(this.subDir(id), '.credentials.json'); }

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
      accounts: this._state.accounts.map((a) => {
        const type = this._acctType(a);
        const base = { id: a.id, name: a.name, type, source: a.source, createdAt: a.createdAt };
        if (type === 'subscription') {
          const info = this.readSubCreds(a.id);
          return { ...base, loggedIn: info.loggedIn, email: info.email, subscriptionType: info.subscriptionType };
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

  add({ name, key, source = 'manual' } = {}) {
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

  remove(id) {
    const i = this._state.accounts.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('account not found');
    const a = this._state.accounts[i];
    this._state.accounts.splice(i, 1);
    if (this._state.defaultAccountId === id) this._state.defaultAccountId = null;
    // Subscription accounts own a creds dir — wipe it (best-effort).
    if (this._acctType(a) === 'subscription') { try { fs.rmSync(this.subDir(id), { recursive: true, force: true }); } catch { } }
    this._save();
    this._notify();
  }

  // null = subscription is the default for new sessions.
  setDefault(id) {
    if (id != null && !this._state.accounts.some((a) => a.id === id)) throw new Error('account not found');
    this._state.defaultAccountId = id || null;
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
  resolveForSpawn(requested) {
    if (requested === 'subscription') return null; // the CLI's own global login
    const id = requested || this._state.defaultAccountId;
    if (!id) return null;
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    if (this._acctType(a) === 'subscription') {
      const info = this.readSubCreds(id);
      if (!info.loggedIn) throw new Error('subscription not logged in: ' + a.name);
      return { id: a.id, name: a.name, kind: 'subscription', localEnv: { CLAUDE_SECURESTORAGE_CONFIG_DIR: this.subDir(id) }, secret: null };
    }
    const key = this.getKey(id);
    if (!key) throw new Error('account key unavailable (decryption failed): ' + a.name);
    return { id: a.id, name: a.name, tail: a.tail, kind: 'api', localEnv: { ANTHROPIC_API_KEY: key }, secret: { var: 'ANTHROPIC_API_KEY', value: key } };
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
    return { id, dir };
  }
  captureConsoleLogin(id, { name } = {}) {
    if (!/^con-[a-f0-9]+$/.test(id)) throw new Error('bad login id');
    const dir = path.join(this._subsDir, id);
    const pk = this.cliPrimaryKey(); // reads ~/.claude.json primaryApiKey
    if (!pk.present || pk.imported) { // not yet, or already saved
      return { captured: false };
    }
    const account = this.importFromCli();
    if (name) { try { this.rename(account.id, name); account.name = name; } catch { } }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
    return { captured: true, account };
  }

  // A subscription account's read-only access token for the usage poll (null if
  // expired/absent — we NEVER refresh; a running session or a next-use refreshes
  // it). Used by server.js to poll per-account /api/oauth/usage.
  usageToken(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') return null;
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
