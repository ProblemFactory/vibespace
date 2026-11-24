'use strict';
/**
 * A JSON FILE SEALED THROUGH THE VAULT (lane vault-e2e-password-fix-r2) — the voice sign-in pair (data/dropline-oauth.json,
 * rotated by the hourly refresh) and any small secret-bearing JSON a feature keeps at rest. `sealedJson(file, { dataDir })`
 * answers the plain token file's shape — `{ read, write, clear }` — plus `seal()` (the vault's open hook), `locked()` and
 * `writable()` (B-1e9a cure 3: may a write land now — asked BEFORE spending something whose result must be kept):
 *   · THE VAULT SET UP ⇒ the file is `{"sealed":"vault-v1","entry":"file:<name>","box":"<iv.tag.data>"}` — AES-256-GCM
 *     (src/secret-box.js encWith) under a random 32-byte key that lives ONLY in the vault, as the entry `file:<name>`.
 *     Unlocked ⇒ read and write; LOCKED ⇒ both refuse with `code: 'vault_locked'` (nothing read, nothing written).
 *   · NOT SET UP ⇒ the plain JSON file as before (the migration window); the setup and every unlock seal it (`seal()`), and
 *     so does its first read while unlocked — the plaintext bytes overwritten in place (secret-box `replaceShredding`).
 *   · the decrypted value is cached for ONE vault epoch: a lock ends it.
 *   · r3334 unit 2 (lane bl-chat-b): THE STORE-READ LAW, when the caller names its hold (`hold: { code, words, log }` — the voice
 *     sign-in does): a read that FAILED (EIO, EACCES, …) is HELD on the family's helper (src/store-read-hold.js) — no value, every
 *     read, write and clear refused BY NAME (`refusal`), nothing written over, read again off the loop; TORN bytes (a file that
 *     does not parse) are kept aside ONCE by the helper (0600 from their create — they hold sealed sign-in material; never in a
 *     journal line or a reply: no message of the parse reaches one), then read as ABSENT with the damage said (`torn()` → the
 *     copy's base name) until a write lands over them (the person's Connect) or the file is cleared.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SB = require('../secret-box.js');
const KF = require('../key-file.js');
const { replaceShredding } = require('../secret-file.js');
const HOLD = require('../store-read-hold.js');   // r3334 unit 2: the store-read law's hold (its read again, the torn bytes' copy)
const SR = require('../store-read.js');

const MARK = 'vault-v1';
/** The refusal every reader words as is (the store's file name, the door). */
const lockedError = (name) => Object.assign(new Error(`the vault is locked — ${name} opens after the owner unlocks the vault with the second password (nothing was read or written)`), { code: 'vault_locked' });
const isSealed = (j) => !!j && typeof j === 'object' && j.sealed === MARK && typeof j.box === 'string';

function sealedJson(file, { dataDir = path.dirname(file), hold = null } = {}) {
  const base = path.basename(file);
  const entry = 'file:' + base;
  let cache, cacheAt = null;
  // r3334 unit 2: the hold (only when the caller names it — a store without one keeps the release's answers)
  let tornText = null, tornBy = null, pendingTorn = null;   // the torn bytes KEPT (their copy made) — read as absent while they stay
  const H = hold && hold.code ? HOLD.create({
    file, code: hold.code, aside: (mark) => file + '.corrupt-' + mark, words: typeof hold.words === 'function' ? hold.words : () => `${base} could not be read`,
    log: typeof hold.log === 'function' ? hold.log : () => { },
    // the lift: torn bytes copied (their copy named) ⇒ read as absent with the damage said; a read that answers ⇒ read as before
    onLift: (v, f) => { cache = undefined; cacheAt = null; if (f && f.setAside) { tornText = pendingTorn; tornBy = String(f.setAside); } else { tornText = null; tornBy = null; } pendingTorn = null; },
  }) : null;
  /** the hold's refusal BY NAME (503, the caller's code) — `what` the act refused; null when nothing is held */
  const heldRefusal = (what) => (H && H.held() ? H.refusal(what) : null);
  const vault = () => SB.vaultForDir(dataDir);
  /** 'not_set_up' | 'locked' | 'unlocked' as THIS process sees the dir (no engine over a sealed dir = locked) */
  const stateOf = () => { const v = vault(); return v ? v.state() : (SB.sealedDir(dataDir) ? 'locked' : 'not_set_up'); };
  const epochOf = () => { const v = vault(); return `${stateOf()}:${v ? v.epoch() : 0}`; };
  /** lane vault-locked-refusal-notice: the refusal, NOTED (the vault's ONE helper — «VibeSpace», this file) → the error */
  const lockedRefusal = () => { const v = vault(); try { if (v && typeof v.blocked === 'function') v.blocked('VibeSpace', `the sealed file ${base}`); } catch { } return lockedError(base); };
  function readRaw() { try { return fs.readFileSync(file, 'utf8'); } catch (e) { if (e && e.code === 'ENOENT') return null; throw e; } }
  /** this file's key — minted INTO the vault at the first sealed write; LOCKED ⇒ refused by name */
  function keyOf({ mint = false } = {}) {
    const v = vault();
    if (!v) throw lockedRefusal();
    const r = v.secretGet(entry);
    if (!r.ok) throw r.code === KF.VAULT_LOCKED ? lockedRefusal() : Object.assign(new Error(`${base}: its vault key could not be read (${r.code})`), { code: r.code });
    if (r.value) return r.value;
    if (!mint) throw Object.assign(new Error(`${base} is sealed but the vault holds no key for it — restore data/vault.json from a backup`), { code: 'key-missing' });
    const k = crypto.randomBytes(32);
    const p = v.secretPut(entry, k);
    if (!p.ok) { k.fill(0); throw p.code === KF.VAULT_LOCKED ? lockedRefusal() : Object.assign(new Error(`${base}: a vault key could not be made (${p.code})`), { code: p.code }); }
    return k;
  }
  function writeSealed(obj) {
    const k = keyOf({ mint: true });
    try { replaceShredding(file, JSON.stringify({ sealed: MARK, entry, box: SB.encWith(k, JSON.stringify(obj)) }) + '\n'); } finally { k.fill(0); }
  }
  /** → the object, or null (absent / damaged — the plain token file's answer); LOCKED ⇒ throws `vault_locked`; HELD (r3334: a read
   *  that failed, or torn bytes while their copy is made) ⇒ throws the hold's refusal BY NAME */
  function read() {
    const at = epochOf();
    if (cache !== undefined && cacheAt === at) return cache;
    { const no = heldRefusal(`reading ${base}`); if (no) throw no; }
    const st = stateOf();
    let text;
    if (H) { try { text = readRaw(); } catch (error) { H.start(SR.storeAnswer({ error })); throw H.refusal(`reading ${base}`); } }
    else text = readRaw();
    let j = null;
    if (text !== null) {
      let torn = false;
      try { j = JSON.parse(text); } catch { j = null; torn = true; }   // (the parse's own message is never kept: it may quote the bytes)
      if (torn && H && text !== tornText) {
        // r3334: TORN bytes — held while the helper keeps them aside ONCE (off the loop); then read as absent, the damage said
        pendingTorn = text; tornText = null; tornBy = null;
        H.start({ state: 'corrupt', code: 'did not parse', why: 'did not parse', writable: false });
        throw H.refusal(`reading ${base}`);
      }
    }
    if (isSealed(j)) {
      if (st !== 'unlocked') throw lockedRefusal();
      const k = keyOf();
      try { j = JSON.parse(SB.decWith(k, j.box)); } finally { k.fill(0); }
    } else if (j !== null) {
      if (st === 'locked') throw lockedRefusal();   // nothing is read while locked — a plaintext copy neither
      if (st === 'unlocked') { try { writeSealed(j); } catch { /* stays plain — the next open seals it */ } }
    }
    cache = j; cacheAt = at;
    return j;
  }
  function write(obj) {
    { const no = heldRefusal(`writing ${base}`); if (no) throw no; }   // r3334: HELD — nothing is written over the file
    const st = stateOf();
    if (st === 'locked') throw lockedRefusal();
    if (st === 'unlocked') writeSealed(obj);
    else { fs.mkdirSync(path.dirname(file), { recursive: true }); replaceShredding(file, JSON.stringify(obj)); }   // not set up: plain JSON, 0600 (as before)
    cache = obj; cacheAt = epochOf();
    tornText = null; tornBy = null;   // r3334: a write landed over the torn bytes (the person's Connect): the damage is over (their copy stays)
  }
  /** Disconnect: the file and its vault key forgotten (a locked vault forgets too — dropping an entry needs no DEK). */
  function clear() {
    { const no = heldRefusal(`clearing ${base}`); if (no) throw no; }   // r3334: HELD — the unread file is not removed
    try { fs.unlinkSync(file); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
    cache = null; cacheAt = epochOf();
    tornText = null; tornBy = null;
    const v = vault();
    if (v && v.state() !== 'not_set_up') v.secretDrop(entry);
  }
  /** THE OPEN HOOK (after a setup and every unlock): a plain file sealed now → whether one was. */
  function seal() {
    if (stateOf() !== 'unlocked') return false;
    if (H && H.held()) return false;   // r3334: HELD — nothing is written over the unread file (the lift's next read seals it)
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
  /** B-1e9a cure 3: may a write land NOW? — the answer write() gives on its first line (false = locked), whether or not the
   *  file exists (with no file a locked read gives nothing): a caller about to spend something it must keep asks first. A NO
   *  is a refusal like write()'s — NOTED (lockedRefusal: For you names this file among what waits on the vault). */
  function writable() { if (stateOf() !== 'locked') return true; lockedRefusal(); return false; }
  /** r3334: the hold's facts ({ file, code, since } — a read that failed, or torn bytes being kept aside), null when none */
  const held = () => (H ? H.held() : null);
  /** r3334: torn bytes kept aside and read as absent → { copy } (the copy's base name), null when none */
  const torn = () => (tornBy ? { copy: tornBy } : null);
  return { read, write, clear, seal, locked, forget, writable, file, held, torn, heldRefusal, dispose: () => { if (H) H.stop(); } };
}

module.exports = { sealedJson, MARK, isSealed, lockedError };
