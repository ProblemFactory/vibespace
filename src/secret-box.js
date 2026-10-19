'use strict';
/**
 * SECRET BOX — the ONE at-rest encryption primitive, N key files
 * (docs/design-communication-panel.zh.md §14.7; decision 24).
 *
 * SHARED tier: fs + path + crypto only. `secretBox(keyFile)` is a FACTORY —
 * mounts keeps `data/.mounts-key`, the integrations store gets
 * `data/.integrations-key`, the channels token store gets `data/.channels-key`.
 * A key file is a per-STORE blast radius: moving one is an irreversible
 * data-loss path, and a corrupted or rotated key must never take a second
 * store with it.
 *
 * THE CIPHERTEXT IS BYTE-IDENTICAL TO `src/mounts.js`'s former `_enc`/`_dec`
 * (aes-256-gcm, `iv.tag.data` as three base64 segments), pinned by
 * scripts/test-secret-box.mjs's PARITY leg: a patched copy of the pre-fix
 * `_enc` encrypts ⇒ this module decrypts, and the reverse. Nothing stored by
 * an older build needs re-encrypting.
 *
 * THE DEFECT THIS MODULE MUST NOT INHERIT (read off `src/mounts.js:360-367`,
 * not assumed):
 *
 *   _key() {
 *     try { return Buffer.from(fs.readFileSync(this._keyFile, 'utf-8').trim(), 'hex'); }
 *     catch {
 *       const k = crypto.randomBytes(32);
 *       fs.writeFileSync(this._keyFile, k.toString('hex'), { mode: 0o600 });
 *       return k;
 *     }
 *   }
 *
 * That bare catch is right for exactly ONE errno — ENOENT. For every other
 * read failure (EACCES, EMFILE, EIO, a truncated or emptied file) it MINTS A
 * NEW KEY AND OVERWRITES THE OLD ONE, after which every stored ciphertext is
 * undecryptable for ever and NOTHING IS SAID. It has stayed hidden only because
 * the file is 0600, owned by the service, and rarely read; fd exhaustion, a
 * read-only mount or a crash mid-write all reach it. So this module:
 *
 *   · creates the key ONLY on ENOENT; every other errno is a TYPED failure
 *     (`SecretBoxError` with `code`), which a caller renders as "the key file
 *     could not be read" — the OPPOSITE sentence from "nothing configured";
 *   · treats a key file whose content is not 64 hex characters as
 *     `key-malformed` (a truncated/emptied file is NOT a fresh key);
 *   · writes tmp + link/rename and NEVER overwrites an existing key file —
 *     `link(2)` refuses with EEXIST, so two processes minting at once both end
 *     up reading the one that landed; the atomic-write law matters more on
 *     this file than on any `.json` because it is the least recoverable byte
 *     under data/.
 *
 * THE KEY-FILE LAW (lane key-file-law-stores, .269 — src/key-file.js): ENOENT alone was not enough. A key file that
 * went missing (a partial restore, a hand-copied data/) beside a store that still holds ciphertext used to be minted
 * fresh — every stored secret undecryptable, and every secret entered afterwards sealed under a key a restored backup
 * cannot open. So a box now asks its store `hasCiphertext()` (every src/ caller passes one — the census) before it mints: absent + ciphertext ⇒
 * `key-missing` (the store's rows say: restore the key file from a backup). `refusal()` is the row fact.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const KF = require('./key-file.js'); // THE KEY-FILE LAW (PURE): mint only when absent AND no ciphertext; else a named refusal

// THE VAULT LAW (lane vault-e2e-password): a data dir whose vault is registered here answers EVERY key under it — the key-file
// law below is the vault's `not_set_up` branch only (src/server/vault-engine.js holds the DEK in memory; src/vault.js the record)
const VAULTS = new Map();   // path.resolve(dataDir) → { keyFor, peek, hasEntry, state, epoch }
/** Register a data dir's vault (the hub's engine) → its unregister function. */
function registerVault(dataDir, provider) {
  const k = path.resolve(dataDir);
  VAULTS.set(k, provider);
  return () => { if (VAULTS.get(k) === provider) VAULTS.delete(k); };
}
const vaultOf = (keyFile) => VAULTS.get(path.resolve(path.dirname(keyFile))) || null;
/** A dir whose vault is set up, seen from a process that holds no vault for it: LOCKED — its keys open in the hub only. */
const sealedHere = (keyFile) => fs.existsSync(path.join(path.dirname(keyFile), 'vault.json')) || fs.existsSync(keyFile + '.sealed');
/** Does a registered vault hold this key file's dir? (a holder of a key it got from the vault keeps it for ONE call) */
const vaultHeld = (keyFile) => !!vaultOf(keyFile);
/** THE VAULT of a data dir (lane vault-e2e-password-fix-r2: the device link tokens, the frp token and the sealed JSON files
 *  ask it) → its provider, or null when no engine holds the dir in this process; `sealedDir` = its vault is set up (a
 *  process with no engine reads it as LOCKED, never the files). */
const vaultForDir = (dataDir) => VAULTS.get(path.resolve(dataDir)) || null;
const sealedDir = (dataDir) => fs.existsSync(path.join(dataDir, 'vault.json'));

class SecretBoxError extends Error {
  constructor(code, message, cause, reason) {
    super(message);
    this.name = 'SecretBoxError';
    this.code = code;
    if (cause) this.cause = cause;
    if (reason) this.reason = reason; // the key-file law's whole code: `key-missing` | `key-unreadable:<errno>` | `key-malformed`
  }
}

const KEY_HEX_RE = KF.KEY_HEX_RE;
/** A secret-box ciphertext as it sits in a store's JSON: `iv.tag.data` — 12-byte iv (16 base64), 16-byte tag (24). */
const BOX_CIPHERTEXT_RE = /[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{22}==\.[A-Za-z0-9+/]*={0,2}/;

/**
 * THE KEY-FILE LAW's fs half (lane key-file-law-stores): `holdsCiphertext({ files, each, values, re })` — does the store
 * hold anything a key decrypts? A listed file that is ABSENT holds nothing; one that cannot be read holds (assume it
 * does); one whose text passes `re` (a RegExp, or a function of the text) holds. `each` = `[{ dir, file }]`: that file
 * in every immediate subdirectory of `dir` (a store kept per account / per app); `values` = in-memory state.
 */
function holdsCiphertext({ files = [], each = [], values = [], re = BOX_CIPHERTEXT_RE } = {}) {
  const hit = (t) => (typeof re === 'function' ? !!re(t) : re.test(t));
  for (const v of values) { let t = ''; try { t = typeof v === 'string' ? v : JSON.stringify(v); } catch { return true; } if (t && hit(t)) return true; }
  const all = [...files];
  for (const { dir, file } of each) {
    let names;
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { if (e && e.code === 'ENOENT') continue; return true; }
    for (const d of names) {
      if (d.isDirectory()) all.push(path.join(dir, d.name, file));
      else if (d.isSymbolicLink()) { try { if (fs.statSync(path.join(dir, d.name)).isDirectory()) all.push(path.join(dir, d.name, file)); } catch { /* a dangling link holds nothing */ } } // key-file-law-fix (verify r1 L4)
    }
  }
  for (const f of all) {
    let t;
    try { t = fs.readFileSync(f, 'utf-8'); } catch (e) { if (e && e.code === 'ENOENT') continue; return true; }
    if (hit(t)) return true;
  }
  return false;
}

/** Mint a key on ENOENT ONLY. tmp + hard link (refuses to clobber) with a rename fallback that re-checks existence —
 *  never an overwrite. → the 32 bytes, or null when another writer landed first. `raw` = the file holds the 32 bytes
 *  themselves (the passkey store) instead of 64 hex characters. */
function mintKeyFile(keyFile, { raw = false } = {}) {
  const k = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  const tmp = `${keyFile}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, raw ? k : k.toString('hex'), { mode: 0o600, flag: 'wx' });
    try {
      const fd = fs.openSync(tmp, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    } catch { /* fsync is best effort on filesystems that refuse it */ }
    try {
      fs.linkSync(tmp, keyFile);           // atomic, EEXIST if somebody landed first
    } catch (e) {
      if (e && e.code === 'EEXIST') return null;   // the other minter wins; re-read below
      // A filesystem without hard links: an EXCLUSIVE create (O_EXCL) — key-file-law-fix (verify r1 L2): existsSync +
      // renameSync is not exclusive (16 racing minters split keys); EEXIST = the other minter won, re-read below.
      try { fs.writeFileSync(keyFile, raw ? k : k.toString('hex'), { mode: 0o600, flag: 'wx' }); }
      catch (e2) { if (e2 && e2.code === 'EEXIST') return null; throw e2; }
      return k;
    }
    return k;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* already renamed or never written */ }
  }
}

/**
 * THE KEY-FILE LAW over a real file → `{ ok, key, minted? }` | `{ ok: false, code }` (src/key-file.js loadOrMintKey).
 * `hasCiphertext` is REQUIRED — every store answers "do I hold anything this key decrypts?" before a key is minted
 * (scripts/test-key-file-law.mjs: a reader of a data/ key file that does not come through here is RED).
 */
function lawfulKey(keyFile, { hasCiphertext, raw = false } = {}) {
  const legacy = () => KF.loadOrMintKey({
    readKey: () => (raw ? fs.readFileSync(keyFile) : fs.readFileSync(keyFile, 'utf-8')),
    mintKey: () => mintKeyFile(keyFile, { raw }),
    hasCiphertext,
    parse: raw ? KF.parseRawKey : KF.parseHexKey,
  });
  // THE VAULT LAW: the dir's vault answers (its `not_set_up` branch runs `legacy` — the migration window); no vault in this
  // process over a dir whose vault is set up ⇒ locked here, never the file
  const v = vaultOf(keyFile);
  if (v) return v.keyFor(path.basename(keyFile), { keyFile, raw, hasCiphertext, legacy });
  return sealedHere(keyFile) ? { ok: false, code: KF.VAULT_LOCKED } : legacy();
}

/**
 * A JSON parse failure described WITHOUT the bytes that failed (2026-09-14).
 * V8's `SyntaxError.message` embeds a source snippet around the error
 * position — `Unexpected token ']', ..."ijklmn"}},]" is not valid JSON` —
 * so logging `e.message` for a mistyped secret-bearing env block printed the
 * tail of a cluster secret (six characters, where masking permits four; an
 * unescaped quote mid-secret exposes the characters around it the same way).
 * Both readers of a secret-bearing JSON env (the integrations store's cluster
 * block, mounts.drivePresets' Google OAuth client presets) log THIS: the
 * error class and the position when V8 states one, never a quoted fragment.
 * A non-SyntaxError keeps its message (it carries no input bytes).
 */
function describeJsonError(e) {
  if (!(e instanceof SyntaxError)) return String((e && e.message) || e);
  const m = /at position (\d+)/.exec(String(e.message || ''));
  const lc = /\(line (\d+) column (\d+)\)/.exec(String(e.message || ''));
  return `not valid JSON (SyntaxError${m ? ` at position ${m[1]}` : ''}${lc ? `, line ${lc[1]} column ${lc[2]}` : ''})`;
}

/** A box with no store behind it (a suite reading a key file that exists; a scratch key). EVERY src/ caller passes its
 *  store's own `hasCiphertext` — scripts/test-key-file-law.mjs is RED on a src/ `secretBox(` call without one. */
const NO_STORE = () => false;

/**
 * @param {string} keyFile absolute path of THIS store's key file
 * @param {{ hasCiphertext?: () => boolean }} opts THE KEY-FILE LAW's question (lane key-file-law-stores): does this store
 *   hold anything the key decrypts? Asked only when the key file is ABSENT — yes ⇒ `key-missing`, never a new key.
 * @returns {{ enc(text:string):string, dec(blob:string):string, keyFile:string, hasKey():boolean, readKey():Buffer, refusal():(null|{code:string,file:string}) }}
 */
function secretBox(keyFile, { hasCiphertext = NO_STORE } = {}) {
  if (typeof keyFile !== 'string' || !keyFile) throw new SecretBoxError('bad-key-file', 'secretBox(keyFile): an absolute key file path is required');
  if (typeof hasCiphertext !== 'function') throw new SecretBoxError('bad-key-file', `secretBox(${path.basename(keyFile)}): hasCiphertext must be a function`);
  let cached = null;

  /** THE KEY-FILE LAW (src/key-file.js) — a refusal is a TYPED SecretBoxError: `code` = the kind (`key-missing` |
   *  `key-unreadable` | `key-malformed`), `reason` = the law's whole code (`key-unreadable:EIO`). Nothing is cached
   *  on a refusal: the next call reads again. */
  function readKey() {
    if (cached && !vaultOf(keyFile)) return cached;
    if (cached) { cached.fill(0); cached = null; }   // a key cached before the vault registered (the boot's first reads) ends here
    const r = lawfulKey(keyFile, { hasCiphertext });
    if (r.ok) { if (vaultOf(keyFile)) return r.key; cached = r.key; return cached; }   // a vault-held key is never cached here: lock() reaches every reader
    const { kind, errno } = KF.refusalOf(r.code);
    const why = errno === 'vault_locked'
      ? `the vault is locked — ${path.basename(keyFile)} opens after the owner unlocks it with the second password`
      : kind === 'key-missing'
      ? `the secret key file ${keyFile} is missing while this store holds encrypted values — restore it from a backup (no new key was made: it could never decrypt them)`
      : kind === 'key-malformed'
        ? `the secret key file ${keyFile} is not a 64-hex-character key — a truncated or emptied key file is NOT a fresh key; restore it from a backup or delete it deliberately to start over`
        : `cannot read the secret key file ${keyFile}: ${errno} — refusing to mint a new key over one that may exist`;
    throw new SecretBoxError(kind, why, errno ? Object.assign(new Error(errno), { code: errno }) : null, r.code);
  }
  /** The key file's state as a row fact: null (readable, or absent over an empty store) or `{ code, file }` — never
   *  throws, never mints (a list may ask it on every render). */
  function refusal() {
    const file = path.basename(keyFile);
    const v = vaultOf(keyFile);
    if (v && v.state() !== 'not_set_up') { const code = v.peek(file, { keyFile, hasCiphertext }); return code ? { code, file } : null; }
    if (!v && sealedHere(keyFile)) return { code: KF.VAULT_LOCKED, file };
    if (cached) return null;
    try { fs.statSync(keyFile); } catch (e) {
      if (e && e.code === 'ENOENT') { let holds = true; try { holds = !!hasCiphertext(); } catch { /* unreadable store = holds */ } return holds ? { code: 'key-missing', file } : null; }
    }
    try { readKey(); return null; } catch (e) { return { code: (e instanceof SecretBoxError && e.reason) || 'key-unreadable:error', file }; }
  }

  // a vault-held key is a COPY made for this one call — zeroed when the call is done
  const withKey = (fn) => { const k = readKey(); try { return fn(k); } finally { if (vaultOf(keyFile)) k.fill(0); } };
  const enc = (text) => withKey((k) => encWith(k, text));
  const dec = (blob) => withKey((k) => decWith(k, blob));

  const hasKey = () => {
    const v = vaultOf(keyFile);
    if (v && v.state() !== 'not_set_up') return v.hasEntry(path.basename(keyFile)) || fs.existsSync(keyFile);
    if (fs.existsSync(keyFile + '.sealed')) return true;   // the vault holds it (a process with no vault reads it as locked)
    try { fs.statSync(keyFile); return true; } catch { return false; }
  };

  return { enc, dec, readKey, hasKey, refusal, keyFile };
}

/** THE cipher of every box, over an explicit 32-byte key (lane app-display-secrets: a per-display key DERIVED from a
 *  box's key — the app's Secret Service store, sealed by src/app-secrets-seal.js). Same bytes as `enc`/`dec`. */
function encWith(key, text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${data.toString('base64')}`;
}

function decWith(key, blob) {
  const parts = String(blob).split('.');
  if (parts.length !== 3) throw new SecretBoxError('bad-ciphertext', 'secret-box: a ciphertext is `iv.tag.data` (three base64 segments)');
  const [iv, tag, data] = parts.map((s) => Buffer.from(s, 'base64'));
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch (e) {
    throw new SecretBoxError('bad-ciphertext', `secret-box: could not decrypt (${(e && e.message) || e}) — the key file may not be the one this ciphertext was written with`, e);
  }
}

module.exports = { secretBox, SecretBoxError, KEY_HEX_RE, BOX_CIPHERTEXT_RE, holdsCiphertext, lawfulKey, mintKeyFile, describeJsonError, encWith, decWith, registerVault, vaultHeld, vaultForDir, sealedDir };
