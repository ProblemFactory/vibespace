'use strict';
/**
 * THE KEY-FILE LAW (lane key-file-law-stores, .269; credential class) — ONE rule for every key store under data/
 * (`.accounts-key`, `.mounts-key`, `.integrations-key`, `.channels-key`, `.app-secrets-key`, `browser-passkeys.key`):
 *
 *   · a key is MINTED only when its file is ABSENT (ENOENT) AND the store holds NO ciphertext;
 *   · absent while ciphertext exists ⇒ `key-missing` — a new key could never decrypt what is stored, and every secret
 *     written under it would orphan the old ones for good (the row says: restore the key file from a backup);
 *   · any other read error (EIO, EACCES, EMFILE, EISDIR …) ⇒ `key-unreadable:<errno>` for THIS call — the next call
 *     reads again, so every secret decrypts once the error clears;
 *   · a key of the wrong length / shape ⇒ `key-malformed` — refused, the file never overwritten (a truncated or emptied
 *     key file is not a fresh key).
 *
 * PURE: no fs, no crypto. The store hands in its three doors — `readKey()` (the file's bytes, or a throw carrying the
 * errno), `mintKey()` (an atomic, never-overwriting mint: the key, or null when another writer landed first — then the
 * landed one is read) and `hasCiphertext()` (anything stored under this key; a throw counts as YES: an unreadable store
 * still holds what it holds). The fs half is src/secret-box.js `lawfulKey`; scripts/test-key-file-law.mjs is the census
 * (every reader of a data/ key file goes through here) + one leg per store per branch.
 * (The defect it closes: accounts.js minted on ANY read error; mounts' / integrations' / channels' secret-box and the
 * passkey store minted on ENOENT without asking whether ciphertext existed.)
 */

const KEY_REFUSALS = Object.freeze(['key-missing', 'key-unreadable', 'key-malformed']);
const KEY_HEX_RE = /^[0-9a-f]{64}$/i;

/** The errno a failed read carries ('error' when it carries none — still a refusal, never a mint). */
const errnoOf = (e) => String((e && e.code && /^[A-Z][A-Z0-9_]*$/.test(String(e.code)) && e.code) || 'error');

/** 64 hex characters (the box stores' shape) → the 32-byte key; anything else → null (`key-malformed`). */
function parseHexKey(raw) {
  const hex = String(raw == null ? '' : raw).trim();
  return KEY_HEX_RE.test(hex) ? Buffer.from(hex, 'hex') : null;
}
/** Exactly 32 raw bytes (the passkey store's shape) → the key; anything else → null. */
function parseRawKey(raw) {
  return Buffer.isBuffer(raw) && raw.length === 32 ? raw : null;
}

/**
 * THE LAW. → `{ ok: true, key, minted? }` | `{ ok: false, code: 'key-missing' | 'key-unreadable:<errno>' | 'key-malformed' }`.
 * `mintKey` is called at most once per call, and only on ENOENT with `hasCiphertext()` false.
 */
function loadOrMintKey({ readKey, mintKey, hasCiphertext, parse = parseHexKey } = {}) {
  if (typeof readKey !== 'function' || typeof mintKey !== 'function' || typeof hasCiphertext !== 'function') {
    throw new TypeError('loadOrMintKey: readKey, mintKey and hasCiphertext are all required (no store is exempt from the ciphertext question)');
  }
  let raw;
  try { raw = readKey(); }
  catch (e) {
    const errno = errnoOf(e);
    if (errno !== 'ENOENT') return { ok: false, code: `key-unreadable:${errno}` };
    let holds = true;
    try { holds = !!hasCiphertext(); } catch { holds = true; }
    if (holds) return { ok: false, code: 'key-missing' };
    let minted;
    try { minted = mintKey(); } catch (e2) { return { ok: false, code: `key-unreadable:${errnoOf(e2)}` }; }
    if (minted) return parseRawKey(minted) ? { ok: true, key: minted, minted: true } : { ok: false, code: 'key-malformed' }; // the mint answers the 32 bytes
    try { raw = readKey(); } catch (e3) { return { ok: false, code: `key-unreadable:${errnoOf(e3)}` }; } // another writer landed first
  }
  const key = parse(raw);
  return key ? { ok: true, key } : { ok: false, code: 'key-malformed' };
}

/** A refusal code → `{ kind, errno }` (`kind` ∈ KEY_REFUSALS); null for anything that is not one. */
function refusalOf(code) {
  const m = /^(key-missing|key-malformed|key-unreadable)(?::([A-Za-z0-9_]+))?$/.exec(String(code || ''));
  return m ? { kind: m[1], errno: m[2] || null } : null;
}

/** The refusal in words (English; the client says it through t() — src/lib/key-file-words.js). `file` = the key
 *  file's base name. Never a secret: the code and the file name only. */
function refusalWords(code, file = 'the key file') {
  const r = refusalOf(code);
  if (!r) return '';
  if (r.kind === 'key-missing') return `${file} is missing — restore it from a backup (no new key was made: it could never decrypt what is stored)`;
  if (r.kind === 'key-malformed') return `${file} is damaged (not a key) — restore it from a backup; nothing was replaced`;
  return `${file} could not be read (${r.errno || 'error'}) — no new key was made; it is read again next time`;
}

module.exports = { KEY_REFUSALS, KEY_HEX_RE, errnoOf, parseHexKey, parseRawKey, loadOrMintKey, refusalOf, refusalWords };
