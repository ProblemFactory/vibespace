'use strict';
/**
 * A JSON FILE SEALED THROUGH THE VAULT (lane vault-e2e-password-fix-r2) — the voice sign-in pair (data/dropline-oauth.json,
 * rotated by the hourly refresh) and any small secret-bearing JSON a feature keeps at rest. `sealedJson(file, { dataDir })`
 * answers the plain token file's shape — `{ read, write, clear }` — plus `seal()` (the vault's open hook) and `locked()`:
 *   · THE VAULT SET UP ⇒ the file is `{"sealed":"vault-v1","entry":"file:<name>","box":"<iv.tag.data>"}` — AES-256-GCM
 *     (src/secret-box.js encWith) under a random 32-byte key that lives ONLY in the vault, as the entry `file:<name>`.
 *     Unlocked ⇒ read and write; LOCKED ⇒ both refuse with `code: 'vault_locked'` (nothing read, nothing written).
 *   · NOT SET UP ⇒ the plain JSON file as before (the migration window); the setup and every unlock seal it (`seal()`), and
 *     so does its first read while unlocked — the plaintext bytes overwritten in place (secret-box `replaceShredding`).
 *   · the decrypted value is cached for ONE vault epoch: a lock ends it.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SB = require('../secret-box.js');
const KF = require('../key-file.js');
const { replaceShredding } = require('../secret-file.js');

const MARK = 'vault-v1';
/** The refusal every reader words as is (the store's file name, the door). */
const lockedError = (name) => Object.assign(new Error(`the vault is locked — ${name} opens after the owner unlocks the vault with the second password (nothing was read or written)`), { code: 'vault_locked' });
const isSealed = (j) => !!j && typeof j === 'object' && j.sealed === MARK && typeof j.box === 'string';

function sealedJson(file, { dataDir = path.dirname(file) } = {}) {
  const base = path.basename(file);
  const entry = 'file:' + base;
  let cache, cacheAt = null;
  const vault = () => SB.vaultForDir(dataDir);
  /** 'not_set_up' | 'locked' | 'unlocked' as THIS process sees the dir (no engine over a sealed dir = locked) */
  const stateOf = () => { const v = vault(); return v ? v.state() : (SB.sealedDir(dataDir) ? 'locked' : 'not_set_up'); };
  const epochOf = () => { const v = vault(); return `${stateOf()}:${v ? v.epoch() : 0}`; };
  function readRaw() { try { return fs.readFileSync(file, 'utf8'); } catch (e) { if (e && e.code === 'ENOENT') return null; throw e; } }
  /** this file's key — minted INTO the vault at the first sealed write; LOCKED ⇒ refused by name */
  function keyOf({ mint = false } = {}) {
    const v = vault();
    if (!v) throw lockedError(base);
    const r = v.secretGet(entry);
    if (!r.ok) throw r.code === KF.VAULT_LOCKED ? lockedError(base) : Object.assign(new Error(`${base}: its vault key could not be read (${r.code})`), { code: r.code });
    if (r.value) return r.value;
    if (!mint) throw Object.assign(new Error(`${base} is sealed but the vault holds no key for it — restore data/vault.json from a backup`), { code: 'key-missing' });
    const k = crypto.randomBytes(32);
    const p = v.secretPut(entry, k);
    if (!p.ok) { k.fill(0); throw p.code === KF.VAULT_LOCKED ? lockedError(base) : Object.assign(new Error(`${base}: a vault key could not be made (${p.code})`), { code: p.code }); }
    return k;
  }
  function writeSealed(obj) {
    const k = keyOf({ mint: true });
    try { replaceShredding(file, JSON.stringify({ sealed: MARK, entry, box: SB.encWith(k, JSON.stringify(obj)) }) + '\n'); } finally { k.fill(0); }
  }
  /** → the object, or null (absent / damaged — the plain token file's answer); LOCKED ⇒ throws `vault_locked` */
  function read() {
    const at = epochOf();
    if (cache !== undefined && cacheAt === at) return cache;
    const st = stateOf();
    const text = readRaw();
    let j = null;
    if (text !== null) { try { j = JSON.parse(text); } catch { j = null; } }
    if (isSealed(j)) {
      if (st !== 'unlocked') throw lockedError(base);
      const k = keyOf();
      try { j = JSON.parse(SB.decWith(k, j.box)); } finally { k.fill(0); }
    } else if (j !== null) {
      if (st === 'locked') throw lockedError(base);   // nothing is read while locked — a plaintext copy neither
      if (st === 'unlocked') { try { writeSealed(j); } catch { /* stays plain — the next open seals it */ } }
    }
    cache = j; cacheAt = at;
    return j;
  }
  function write(obj) {
    const st = stateOf();
    if (st === 'locked') throw lockedError(base);
    if (st === 'unlocked') writeSealed(obj);
    else { fs.mkdirSync(path.dirname(file), { recursive: true }); replaceShredding(file, JSON.stringify(obj)); }   // not set up: plain JSON, 0600 (as before)
    cache = obj; cacheAt = epochOf();
  }
  /** Disconnect: the file and its vault key forgotten (a locked vault forgets too — dropping an entry needs no DEK). */
  function clear() {
    try { fs.unlinkSync(file); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
    cache = null; cacheAt = epochOf();
    const v = vault();
    if (v && v.state() !== 'not_set_up') v.secretDrop(entry);
  }
  /** THE OPEN HOOK (after a setup and every unlock): a plain file sealed now → whether one was. */
  function seal() {
    if (stateOf() !== 'unlocked') return false;
    const text = readRaw();
    if (text === null) return false;
    let j; try { j = JSON.parse(text); } catch { return false; }
    if (isSealed(j)) return false;
    writeSealed(j);
    return true;
  }
  /** THE LOCK'S HOOK (verify r2 low): the decrypted value is not kept in this process after a lock — the cache is dropped
   *  (a JS object cannot be zeroed; its last reference goes) and the next read meets the lock by name. */
  function forget() { cache = undefined; cacheAt = null; }
  /** Is a value there that the lock keeps closed? (the voice card's "the vault is locked" — never "connect") */
  function locked() {
    if (stateOf() !== 'locked') return false;
    try { return readRaw() !== null; } catch { return true; }
  }
  return { read, write, clear, seal, locked, forget, file };
}

module.exports = { sealedJson, MARK, isSealed, lockedError };
