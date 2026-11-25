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
 *   · r3932 (the vault's own law at this store, lane bl-chat-b): NO PLAIN COPY OF A SIGN-IN OUTLIVES ITS LIVE FILE's SEAL OR REPLACE.
 *     The copies are SEALED at the vault's seal of the live file (the open hook, the first read's seal, a copy the hold put in place
 *     while it opened): their bytes as they are, in a box under THIS store's key, the plain bytes overwritten in place — they stay
 *     the person's. They are SHREDDED at the person's own act that replaces the sign-in (a Connect's fresh pair, a Disconnect), as
 *     the release's Connect shredded the torn file. A copy made while the vault is OPEN is written sealed from its creation (the
 *     hold's copy road); none is made while it is LOCKED (the lock's refusal: nothing read, nothing copied). Never at a start or on
 *     a timer. A good file put back BY HAND is read only after a restart (the damage is cached for the vault's epoch).
 *   · r4045 (the coordinator's ruling): THE COPIES' ROAD RUNS OFF THE LOOP — every listing, look, read, seal and shred of them on the
 *     file pool (fs.promises; secret-file's async replace and shred), ONE SWEEP AT A TIME this store (a Connect while a seal is in
 *     flight waits for it), the order kept (a copy's box synced and renamed in before its plain bytes are overwritten). The person's
 *     Connect and Disconnect answer AFTER their sweep (a copy a shred could not remove is told: `left()`, the account's words); the
 *     vault's opening never waits for it. A stop while the hold wrote a plain copy leaves its hidden part (`.<copy>.part`): the sweep
 *     takes it (shredded at the vault's seal and at the person's acts; never touched while the hold copies). The seal also runs at a
 *     lift the hold's ladder fires and at the first sealing read: it keeps the bytes (a box), it never removes one.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SB = require('../secret-box.js');
const KF = require('../key-file.js');
const { replaceShredding, replaceShreddingAsync, shredFile } = require('../secret-file.js');
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
  const hlog = hold && typeof hold.log === 'function' ? hold.log : () => { };
  const asideOf = (mark) => file + '.corrupt-' + mark;   // the copies' ONE name (the hold makes them; r3932 seals or shreds them)
  const H = hold && hold.code ? HOLD.create({
    file, code: hold.code, aside: asideOf, words: typeof hold.words === 'function' ? hold.words : () => `${base} could not be read`,
    log: hlog,
    copy: { bytes: (buf) => copyBytes(buf), opens: (on) => copyOpens(on) },   // r3932: the copy's road — sealed while the vault is open
    // the lift: torn bytes copied (their copy named) ⇒ read as absent with the damage said; a read that answers ⇒ read as before
    onLift: (v, f) => {
      cache = undefined; cacheAt = null; if (f && f.setAside) { tornText = pendingTorn; tornBy = String(f.setAside); } else { tornText = null; tornBy = null; } pendingTorn = null;
      if (f && f.setAside && stateOf() === 'unlocked') sealCopies();   // r3932: a copy put in place as the vault opened is sealed with the rest
    },
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
  // r3932: THE COPIES' ROAD — `<file>.corrupt-*` (the hold's copies of torn bytes), a sealed one a box marked `copy: 'torn-bytes'`
  const COPY = 'torn-bytes';
  const copyHead = path.basename(asideOf(''));   // the copies' common head (`<file>.corrupt-`), from their one name
  const isCopyBox = (j) => isSealed(j) && j.copy === COPY;
  const parsedOf = (buf) => { try { return JSON.parse(buf.toString('utf8')); } catch { return null; } };
  /** a copy's bytes, as they are, in a box under this store's key (minted into the vault at the first, as writeSealed does) */
  function boxOfCopy(buf) { const k = keyOf({ mint: true }); try { return Buffer.from(JSON.stringify({ sealed: MARK, entry, copy: COPY, box: SB.encWith(k, buf.toString('base64')) }) + '\n'); } finally { k.fill(0); } }
  /** the hold's copy road: the bytes a copy is WRITTEN with — plain with no vault set up, sealed while it is open, none while locked */
  function copyBytes(buf) { const st = stateOf(); return st === 'not_set_up' ? buf : st === 'unlocked' ? boxOfCopy(buf) : null; }
  /** …and a copy's bytes back for its compare (a box opens only while the vault is open; null: not judged) */
  function copyOpens(on) { const j = parsedOf(on); if (!isCopyBox(j)) return on; if (stateOf() !== 'unlocked') return null; const k = keyOf(); try { return Buffer.from(SB.decWith(k, j.box), 'base64'); } finally { k.fill(0); } }
  // r4045: OFF THE LOOP, ONE SWEEP AT A TIME — each sweep waits for the one before it (its own failure never stops the next)
  let sweeping = Promise.resolve();
  const inTurn = (fn) => { const p = sweeping.then(fn, fn).catch((e) => { hlog(`${base}: a sweep of its copies failed (${(e && e.code) || 'failed'})`); return null; }); sweeping = p; return p; };
  let leftCopies = [];   // the plain copies the person's last act could not remove (base names) — told by the account's words
  const partHead = '.' + copyHead;   // a copy's hidden part (the helper's writeWhole, `.<copy>.part`): plain bytes a stop left behind
  /** the copies beside the live file, on the file pool → [{ p, n, part }] (files only — never a replace's own temp; a part only while
   *  the hold copies nothing: a part then is a stop's leftover, never its keep at work) */
  async function copiesNow() {
    const dir = path.dirname(file);
    let names = []; try { names = await fs.promises.readdir(dir); } catch { return []; }
    const out = [];
    for (const n of names) {
      const part = n.startsWith(partHead) && n.endsWith('.part');
      if (!part && !(n.startsWith(copyHead) && !/\.tmp-\d+-[0-9a-f]{8}$/.test(n))) continue;
      if (part && H && H.held()) continue;
      const p = path.join(dir, n);
      try { if ((await fs.promises.lstat(p)).isFile()) out.push({ p, n, part }); } catch { /* gone meanwhile */ }
    }
    return out;
  }
  const boxedOn = async (p) => { try { return isCopyBox(parsedOf(await fs.promises.readFile(p))); } catch { return false; } };
  /** the vault's seal of the live file: every PLAIN copy sealed under this store's key (the async replace: the box synced and renamed in,
   *  then the plain inode overwritten); `parts` (the vault's own seal): a part is shredded (no copy landed: its bytes are the live file's)
   *  → a promise of how many (the caller never waits for it) */
  function sealCopies({ parts = false } = {}) {
    return inTurn(async () => {
      if (!H || stateOf() !== 'unlocked') return 0;
      let n = 0;
      for (const c of await copiesNow()) {
        if (c.part) { if (parts && await shredFile(c.p)) n++; continue; }
        let on; try { on = await fs.promises.readFile(c.p); } catch (e) { hlog(`${c.n}: a copy of torn bytes could not be read to seal it (${(e && e.code) || 'unreadable'}) — it stays as it is`); continue; }
        if (isCopyBox(parsedOf(on))) continue;
        if (stateOf() !== 'unlocked') break;   // locked meanwhile: the next opening seals the rest
        try { await replaceShreddingAsync(c.p, boxOfCopy(on)); n++; } catch (e) { hlog(`${c.n}: a copy of torn bytes could not be sealed (${(e && e.code) || 'failed'}) — it stays as it is`); }
      }
      if (n) hlog(`${base}: ${n} plain cop${n === 1 ? 'y' : 'ies'} of its torn bytes sealed under the vault (the plain bytes overwritten in place)`);
      return n;
    });
  }
  /** the person's own act replaced the sign-in (a Connect's fresh pair, a Disconnect): every copy that is no box, and every part,
   *  SHREDDED → a promise of { removed, left } (left: the base names a shred could not remove — the person is told) */
  function shredPlainCopies() {
    return inTurn(async () => {
      if (!H) return { removed: 0, left: [] };
      let removed = 0; const left = [];
      for (const c of await copiesNow()) {
        if (!c.part && await boxedOn(c.p)) continue;
        if (await shredFile(c.p)) removed++; else left.push(c.n);
      }
      leftCopies = left;
      if (removed) hlog(`${base}: ${removed} plain cop${removed === 1 ? 'y' : 'ies'} of its torn bytes shredded (the person replaced the sign-in)`);
      if (left.length) hlog(`${base}: ${left.length} plain cop${left.length === 1 ? 'y' : 'ies'} of its torn bytes could not be removed (${left.join(', ')}) — the person is told`);
      return { removed, left: left.slice() };
    }).then((r) => r || { removed: 0, left: [] });
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
        if (st === 'locked') throw lockedRefusal();   // r3932: no copy while the vault is LOCKED (it could only be plain) — read at the unlock
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
      if (st === 'unlocked') { try { writeSealed(j); sealCopies(); } catch { /* stays plain — the next open seals it */ } }   // r3932: its plain copies with it
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
    tornText = null; tornBy = null;   // r3334: a write landed over the torn bytes (the person's Connect): the damage is over (r4045: its plain copies go by shredPlainCopies, off the loop)
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
    sealCopies({ parts: true });   // r3932: the vault's seal — the plain copies sealed under this store's key, off the loop (r4045: never waited for)
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
  return { read, write, clear, seal, locked, forget, writable, file, held, torn, heldRefusal, dispose: () => { if (H) H.stop(); },
    // r4045: the person's sweep (its promise answers after the copies are gone or their failure known), what it could not remove, the sweeps' turn
    shredPlainCopies, left: () => leftCopies[0] || null, settled: () => sweeping };
}

module.exports = { sealedJson, MARK, isSealed, lockedError };
