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
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecretBoxError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'SecretBoxError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

const KEY_HEX_RE = /^[0-9a-f]{64}$/i;

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

/**
 * @param {string} keyFile absolute path of THIS store's key file
 * @returns {{ enc(text:string):string, dec(blob:string):string, keyFile:string, hasKey():boolean, readKey():Buffer }}
 */
function secretBox(keyFile) {
  if (typeof keyFile !== 'string' || !keyFile) throw new SecretBoxError('bad-key-file', 'secretBox(keyFile): an absolute key file path is required');
  let cached = null;

  function parse(raw, where) {
    const hex = String(raw).trim();
    if (!KEY_HEX_RE.test(hex)) {
      throw new SecretBoxError('key-malformed', `the secret key file ${where} is not a 64-hex-character key (${hex.length} chars) — a truncated or emptied key file is NOT a fresh key; restore it from a backup or delete it deliberately to start over`);
    }
    return Buffer.from(hex, 'hex');
  }

  /** Mint a key on ENOENT ONLY. tmp + hard link (refuses to clobber) with a
   *  rename fallback that re-checks existence — never an overwrite. */
  function mint() {
    const k = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    const tmp = `${keyFile}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    try {
      fs.writeFileSync(tmp, k.toString('hex'), { mode: 0o600, flag: 'wx' });
      try {
        const fd = fs.openSync(tmp, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      } catch { /* fsync is best effort on filesystems that refuse it */ }
      try {
        fs.linkSync(tmp, keyFile);           // atomic, EEXIST if somebody landed first
      } catch (e) {
        if (e && e.code === 'EEXIST') return null;   // the other minter wins; re-read below
        // A filesystem without hard links: rename, but only into an absence.
        if (fs.existsSync(keyFile)) return null;
        fs.renameSync(tmp, keyFile);
        return k;
      }
      return k;
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* already renamed or never written */ }
    }
  }

  function readKey() {
    if (cached) return cached;
    let raw;
    try { raw = fs.readFileSync(keyFile, 'utf-8'); }
    catch (e) {
      if (!e || e.code !== 'ENOENT') {
        throw new SecretBoxError('key-unreadable', `cannot read the secret key file ${keyFile}: ${(e && e.code) || (e && e.message) || e} — refusing to mint a new key over one that may exist`, e);
      }
      const minted = mint();
      if (minted) { cached = minted; return cached; }
      try { raw = fs.readFileSync(keyFile, 'utf-8'); }
      catch (e2) { throw new SecretBoxError('key-unreadable', `cannot read the secret key file ${keyFile} after another writer created it: ${(e2 && e2.code) || e2}`, e2); }
    }
    cached = parse(raw, keyFile);
    return cached;
  }

  function enc(text) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', readKey(), iv);
    const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${data.toString('base64')}`;
  }

  function dec(blob) {
    const parts = String(blob).split('.');
    if (parts.length !== 3) throw new SecretBoxError('bad-ciphertext', 'secret-box: a ciphertext is `iv.tag.data` (three base64 segments)');
    const [iv, tag, data] = parts.map((s) => Buffer.from(s, 'base64'));
    const key = readKey();
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(data), d.final()]).toString('utf8');
    } catch (e) {
      throw new SecretBoxError('bad-ciphertext', `secret-box: could not decrypt (${(e && e.message) || e}) — the key file may not be the one this ciphertext was written with`, e);
    }
  }

  const hasKey = () => { try { fs.statSync(keyFile); return true; } catch { return false; } };

  return { enc, dec, readKey, hasKey, keyFile };
}

module.exports = { secretBox, SecretBoxError, KEY_HEX_RE, describeJsonError };
