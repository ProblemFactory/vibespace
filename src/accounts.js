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
    this._onChange = onChange || (() => {});
    this._state = { version: 1, defaultAccountId: null, accounts: [] };
    this._load();
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

  // Sanitized — NEVER includes key material.
  list() {
    return {
      defaultAccountId: this._state.defaultAccountId || null,
      accounts: this._state.accounts.map((a) => ({
        id: a.id, name: a.name, tail: a.tail, source: a.source, createdAt: a.createdAt,
      })),
    };
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
    this._state.accounts.splice(i, 1);
    if (this._state.defaultAccountId === id) this._state.defaultAccountId = null;
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

  // Resolve what a create request means. undefined/null → server default;
  // 'subscription' → force none; 'acct-…' → that key (must exist).
  resolveForSpawn(requested) {
    if (requested === 'subscription') return null;
    const id = requested || this._state.defaultAccountId;
    if (!id) return null;
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    const key = this.getKey(id);
    if (!key) throw new Error('account key unavailable (decryption failed): ' + a.name);
    return { id: a.id, name: a.name, tail: a.tail, key };
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
