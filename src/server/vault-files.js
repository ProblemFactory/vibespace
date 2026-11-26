'use strict';
/**
 * THE VAULT'S FILE BYTES AT REST (lane lg-vault-file, B-0830; design q-058 §1) — `data/vault-files/<id>.vfile`, ONE file per
 * file entry, sealed under that entry's FILE KEY (a random 32 bytes minted here, sealed at once as the entry's VALUE by the
 * engine: src/server/vault-engine.js filePut — never a key file, never on disk in the clear). The bytes are NOT in
 * data/vault.json: the record is rewritten whole at every put (a 1 MB file there would be rewritten with every two-step code).
 *
 *   · the format: `VSVF1\n` · iv (12) · tag (16) · AES-256-GCM ciphertext, the file id as its additional data (a `.vfile`
 *     renamed onto another id does not open); the folder 0700, every file 0600, written `wx` + fsync + rename + a fsync of
 *     the folder (a crash leaves the old file or the new one, never half of one);
 *   · `open` is proven by the seal itself (AES-GCM under the entry's OWN key, the id its additional data) and the size the box
 *     carries — a file that is not the one sealed is `file_damaged`; NO digest of the bytes is kept anywhere (RULE 5′);
 *   · `shred` overwrites the bytes in place (random, same length, fsync) and unlinks — never through a link; `sweep(live,
 *     { dropped })` (a start's) shreds ONLY a `.vfile` the record names as DROPPED and its own stale temp files — a sealed file
 *     the record says nothing of (a put that died between the file and the record, or a record restored from an older copy)
 *     is KEPT and counted (主开发 r4625: nothing removes a person's file because a record is silent about it);
 *   · OFF THE MAIN LOOP (the cure of the acceptance read, 主开发 11-18: «nothing of a file holds the hub's main loop» — the data
 *     folder may sit on a network mount): every read, write, fsync, rename, shred and the sweep go through fs.promises, in the
 *     same order and with the same crash points as before; the caller awaits each. The boot sweep asks the engine whether an
 *     id is live AT the moment it would shred it (a put in flight is live by its id — no age rule);
 *   · ONE AT A TIME (round 3 — the cure's second read: 32 parallel puts on a slow mount took every thread of the fs threadpool,
 *     and every async fs call, dns lookup and crypto job of the hub waited — the FUSE-threadpool outage class, kb-design-lessons
 *     §19): the store's operations run in ONE queue, so a sealed file takes at most one threadpool thread. Round 4 (the third
 *     read: a hung one held the queue for ever — every put unanswered, its bytes and its key in memory): an operation that has not
 *     come back in OP_MS (30 s) is answered `files_stuck` and the store is STUCK until it settles — every operation meanwhile is
 *     refused at once (`files_stuck`, the fs never asked: one thread held at most, never one more), the bytes a late read brings
 *     are zeroed. The engine says `file_not_stored` / `file_unreadable`; the run door bounds its own wait too (FILE_READ_MS).
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const VF = require('../vault-file.js');

const MAGIC = Buffer.from('VSVF1\n', 'latin1');
const TMP_RE = /^([0-9a-f]{10})\.vfile\.tmp-(\d+)-[0-9a-f]{8}$/;
const pidAlive = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return !!(e && e.code === 'EPERM'); } };   // a signal 0: asks, sends nothing
const VFILE_RE = /^([0-9a-f]{10})\.vfile$/;
const err = (code, why) => Object.assign(new Error(why || code), { code });
const OP_MS = 30000;   // round 4: a sealed-file operation that has not come back by then is answered `files_stuck` (the queue moves on)
const SHRED_CHUNK = 64 * 1024;   // round 7: the shred's one buffer, refilled per chunk

function create({ dataDir, opMs = OP_MS, log = console, randomId = () => crypto.randomBytes(5).toString('hex') }) {
  if (!dataDir) throw new TypeError('vault-files: dataDir is required');
  // round 7 (test-fd-close-census): a close that fails is SAID, never swallowed — the operation's own answer stands
  const said = (what) => (e) => { try { (log && (log.warn || log.log) || (() => {})).call(log, `vault-files: ${what}: ${(e && e.code) || e}`); } catch { /* a logger that throws changes no answer */ } };
  const DIR = path.join(dataDir, VF.FILE_DIR);
  const fileOf = (id) => { if (!VF.ID_RE.test(String(id))) throw err('bad_file_id'); return path.join(DIR, `${id}${VF.FILE_SUFFIX}`); };
  /** A new file id — 10 hex from 5 random bytes (crypto.randomBytes) — drawn again while `taken(id)` says it is in use (主开发 r4628:
   *  an id named by an entry, on the record's list of DROPPED files, or a put's in flight is NEVER used again — so a record
   *  restored from an older copy, whose list is stale, can never name a file that is live under it); and its file key (32 random
   *  bytes — the caller seals the key as the entry's value, then zeroes it). */
  const mintId = (taken = () => false) => { for (let i = 0; i < 64; i++) { const id = String(randomId()); if (VF.ID_RE.test(id) && !taken(id)) return id; } throw err('file_id_unavailable', 'no free file id could be drawn'); };
  const mintKey = () => crypto.randomBytes(32);
  async function ensureDir() {
    await fsp.mkdir(DIR, { recursive: true, mode: 0o700 });
    const st = await fsp.lstat(DIR);
    if (!st.isDirectory() || st.isSymbolicLink()) throw err('file_store_unsafe', `${VF.FILE_DIR} is not a folder`);
    if ((st.mode & 0o077) !== 0) await fsp.chmod(DIR, 0o700);
  }
  /** Seal `bytes` under `key` as the file of `id` → (a promise of) the bytes' sha256 (hex — the caller compares it with the
   *  sender's, in memory; it is never written). Rejects (nothing left behind) on
   *  any failure. The order is the crash proof: the temp file written and synced, renamed, the folder synced. */
  async function write(id, key, bytes) {
    const file = fileOf(id);
    await ensureDir();
    // 主开发 r4625 (the MUST): a sealed file the record says nothing of is KEPT — an id whose file is already on disk is never written over
    // 主开发 r5114 (THE MUST): the placement is EXCLUSIVE — only «not there» (ENOENT) is absent; any other answer of the look REFUSES (a
    // kept file at the counter is never written over by the rename below; the store's one queue puts no writer between the look and it)
    let there = true;
    try { await fsp.lstat(file); } catch (e) { if (!(e && e.code === 'ENOENT')) throw err('file_look_failed', `the place of a sealed file could not be looked at (${(e && e.code) || 'error'}) — nothing was written`); there = false; }
    if (there) throw err('file_id_taken', 'a sealed file of that id is already kept');
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(Buffer.from(String(id), 'latin1'));
    const ct = Buffer.concat([c.update(bytes), c.final()]);
    const out = Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const fh = await fsp.open(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    try { await fh.writeFile(out); try { await fh.sync(); } catch { /* best effort */ } } catch (e) { await fh.close().catch(said('a failed temp file could not be closed')); await fsp.unlink(tmp).catch(() => {}); throw e; }
    await fh.close();
    try { await fsp.rename(tmp, file); } catch (e) { await fsp.unlink(tmp).catch(() => {}); throw e; }
    try { const d = await fsp.open(DIR, 'r'); try { await d.sync(); } finally { await d.close(); } } catch (e) { said('the folder sync (best effort) failed')(e); }
    return crypto.createHash('sha256').update(bytes).digest('hex');
  }
  /** The bytes of `id` opened with `key`, checked against the box's facts → (a promise of) a Buffer (the caller's copy to zero). */
  async function read(id, key, facts = {}) {
    const file = fileOf(id);
    let blob;
    let sized = true;
    try {
      const fh = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      try {
        // round 7 (read 6): the sealed file's size is the box's (magic + iv + tag + the bytes) — one of another size is refused BEFORE a
        // byte is read (a replaced or damaged file was read and decrypted whole on the loop, then refused)
        if (facts.size != null) sized = (await fh.stat()).size === MAGIC.length + 28 + Number(facts.size);
        if (sized) blob = await fh.readFile();
      } finally { await fh.close(); }
    } catch (e) { throw err(e && e.code === 'ENOENT' ? 'file_missing' : 'file_unreadable', `the sealed file could not be read (${(e && e.code) || 'error'})`); }
    if (!sized) throw err('file_damaged', 'the sealed file is not the one the entry names');
    if (blob.length < MAGIC.length + 28 || !blob.subarray(0, MAGIC.length).equals(MAGIC)) throw err('file_damaged', 'the sealed file is not one this vault wrote');
    const iv = blob.subarray(MAGIC.length, MAGIC.length + 12), tag = blob.subarray(MAGIC.length + 12, MAGIC.length + 28), ct = blob.subarray(MAGIC.length + 28);
    // 主开发 r4625 (2): THE BYTES ARE ZEROED WHERE THEY ARE DECRYPTED — one buffer of the file's own size made for them (Buffer.alloc:
    // never a slice of the shared pool, whose whole slab a message to the run's worker would copy); the update and final pieces zeroed
    let out, a = null, b = null;
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAAD(Buffer.from(String(id), 'latin1')); d.setAuthTag(tag);
      a = d.update(ct); b = d.final();
      out = Buffer.alloc(a.length + b.length); a.copy(out, 0); b.copy(out, a.length);
    } catch { throw err('file_damaged', 'the sealed file does not open with its key'); } finally { if (a) a.fill(0); if (b) b.fill(0); }
    if (facts.size != null && out.length !== Number(facts.size)) { out.fill(0); throw err('file_damaged', 'the sealed file is not the one the entry names'); }   // the GCM tag under the entry's own key (the id its AAD) proved the bytes; the size is the box's
    return out;
  }
  /** Overwrite the file's bytes in place and unlink it (never through a link). → (a promise of) true when a file was there and is
   *  gone, 'absent' when the file system said by its name that it is not there (ENOENT), false when a look failed otherwise
   *  (主开发 r4774 A 1: only true and 'absent' let an id leave the record's dropped list — a failed look prunes nothing) */
  async function shredPath(file) {
    let st;
    try { st = await fsp.lstat(file); } catch (e) { return e && e.code === 'ENOENT' ? 'absent' : false; }
    if (st.isFile() && st.size > 0) {
      try {
        const fh = await fsp.open(file, fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0));
        try {
          // round 7 (read 6): ONE 64 KiB buffer refilled per chunk — never one allocation the size of the file (a 1 GiB orphan was one
          // 1 GiB randomBytes on the loop; at 2 GiB it threw and the file was unlinked unwritten)
          const buf = Buffer.allocUnsafe(Math.min(SHRED_CHUNK, st.size));
          for (let at = 0; at < st.size; at += buf.length) { const n = Math.min(buf.length, st.size - at); crypto.randomFillSync(buf, 0, n); await fh.write(buf, 0, n, at); }
          try { await fh.sync(); } catch { /* best effort */ }
        } finally { await fh.close(); }
      } catch (e) { said('a file being shredded could not be overwritten (it is unlinked below)')(e); }
    }
    try { await fsp.unlink(file); } catch (e) { return e && e.code === 'ENOENT' ? 'absent' : false; }
    return true;
  }
  /** → (a promise of) true when the sealed file of `id` was there and is gone, 'absent' when it is not there by name, else false. */
  const shred = (id) => (VF.ID_RE.test(String(id)) ? shredPath(fileOf(id)) : Promise.resolve(false));
  /** Is the sealed file of `id` on disk? → 'yes' | 'no' (ENOENT: the file system says so by its name) | 'unknown' (any other failure) */
  const has = async (id) => { try { await fsp.lstat(fileOf(id)); return 'yes'; } catch (e) { return e && e.code === 'ENOENT' ? 'no' : 'unknown'; } };
  /** THE START's SWEEP (主开发 r4625, the MUST: NOTHING REMOVES A PERSON's FILE AT A START BECAUSE A RECORD IS SILENT ABOUT IT) — it
   *  shreds only (i) its own unfinished TEMP files past their age and (ii) a sealed file the record NAMES as dropped (`dropped`:
   *  a Set of ids or a function id → bool — a re-put and a drop write that name down in the same record write that stops naming
   *  the file, before its shred). A sealed file no entry names and no list drops is KEPT and counted. `live` = a Set of ids or
   *  a function id → bool, asked at the moment a file would go (the sweep runs beside puts): TRUE for a put in flight too; a temp
   *  file of another LIVE process newer than a minute is its put in flight (the vault.json sweep's rule, sweepStaleVaultTmp).
   *  → (a promise of) { shredded, kept, owed, done, top }: `kept` the sealed files no list drops, `owed` the dropped ones whose
   *  shred failed (the next start takes them — never counted as unnamed), `done` the dropped ids shredded, `top` the highest
   *  file id met on disk (主开发 r4774 A 3: a broken or missing counter mints past it) */
  async function sweep(live, { at = Date.now(), dropped = () => false } = {}) {
    const isLive = typeof live === 'function' ? live : (id) => !!(live && live.has(id));
    const isDropped = typeof dropped === 'function' ? dropped : (id) => !!(dropped && dropped.has(id));
    let names;
    try { names = await listQ(); } catch { return { shredded: 0, kept: 0, owed: 0, done: [], top: -1 }; }
    let shredded = 0, kept = 0, owed = 0, top = -1;
    const done = [];
    for (const name of names) {   // round 4: each file is its OWN queued operation (a long sweep on a slow mount never holds the queue whole)
      const m = VFILE_RE.exec(name), tm = !m && TMP_RE.exec(name);
      if (!m && !tm) continue;
      if (m) top = Math.max(top, parseInt(m[1], 16));
      if (m && isLive(m[1])) continue;
      if (m && !isDropped(m[1])) { kept++; continue; }
      let gone = false;
      try { gone = await sweepOneQ(name, m, tm, isLive, isDropped, at); } catch { /* stuck or gone: the next start sweeps */ }
      if (gone === true) { shredded++; if (m) done.push(m[1]); } else if (gone === 'absent' && m) done.push(m[1]);
      else if (m && !isLive(m[1])) { if (isDropped(m[1])) owed++; else kept++; }
    }
    return { shredded, kept, owed, done, top };
  }
  /** One name of the sweep: asked again at its own turn (an entry may have been written, or the record gone, meanwhile), then shredded. */
  async function sweepOne(name, m, tm, isLive, isDropped, at) {
    let st = null; try { st = await fsp.lstat(path.join(DIR, name)); } catch (e) { return e && e.code === 'ENOENT' ? 'absent' : false; }   // r5114: the walk's own «not there» is absent, never owed
    if (tm) { if (isLive(tm[1])) return false; const pid = Number(tm[2]); if (pid !== process.pid && pidAlive(pid) && at - st.mtimeMs < 60_000) return false; }
    if (m && (isLive(m[1]) || !isDropped(m[1]))) return false;
    return shredPath(path.join(DIR, name));
  }
  // ONE AT A TIME (round 3): each public operation waits for the one before it; the sweep's own shreds run inside its turn.
  // BOUNDED (round 4): past opMs it is answered files_stuck and the store refuses everything until that operation settles
  let tail = Promise.resolve(), stuck = null;
  const stuckErr = () => err('files_stuck', "the vault's sealed files are not answering (an operation on data/vault-files has not come back in 30 s) — this operation was not done; try again once the folder answers");
  const one = (fn) => (...a) => {
    if (stuck) return Promise.reject(stuckErr());
    const p = tail.then(() => {
      if (stuck) throw stuckErr();
      return new Promise((resolve, reject) => {
        let over = false;
        const op = Promise.resolve().then(() => fn(...a));
        const t = setTimeout(() => { if (over) return; over = true; stuck = op; reject(stuckErr()); }, opMs);
        const settle = () => { clearTimeout(t); if (stuck === op) stuck = null; };
        op.then((v) => { settle(); if (!over) { over = true; resolve(v); } else if (Buffer.isBuffer(v)) v.fill(0); }, (e) => { settle(); if (!over) { over = true; reject(e); } });
      });
    });
    tail = p.then(() => {}, () => {});
    return p;
  };
  const listQ = one(() => fsp.readdir(DIR)), sweepOneQ = one(sweepOne);
  return { dir: DIR, mintId, mintKey, write: one(write), read: one(read), shred: one(shred), has: one(has), sweep };
}

module.exports = { create, MAGIC };
