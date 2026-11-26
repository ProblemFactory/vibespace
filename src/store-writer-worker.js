'use strict';
/**
 * THE STORE WRITER'S THREAD (lane hub-loop-stalls, commit 2 — «no store write holds the main thread»). The syscalls of
 * every store write the main thread hands it (src/store-writer.js): open a temp file, write the bytes, close,
 * rename over the store's file — synchronous HERE, on this thread only. Never on the main thread (a rename on network
 * storage took 1.3 s median, 2.6 s max on the owner's hub, every one a hold of the whole loop), and never in the fs
 * threadpool (four slow renames there would stall every other async fs call, DNS and crypto of the hub — one of our
 * whole-instance outages was that pool filled by calls stuck in a slow mount). ONE write at a time: a storage that hangs
 * holds this thread alone.
 * The shared cells (workerData.sab, Int32): [0] the job in flight (0 = idle), [1] jobs done, [2] the last job's outcome
 * (1 ok, 2 failed), [3] the length of a failed job's error code, its ASCII bytes at offset 16 (≤ 32) — the main thread
 * waits on [1] with Atomics.wait when its loop cannot turn (a synchronous flush, the exit), and THIS thread notifies [1]
 * (round 6's amend: it notified [0], so every waited write ended at the wait's 50 ms poll, never at the write's end).
 */
const { parentPort, workerData } = require('worker_threads');
const FS = require('fs');   // the real fs — each function names the one it was handed `fs` (a suite's short-write stand-in), so every census reads its calls
const path = require('path');
// 主开发 r5002 / r5010 — ONE SET FOR BOTH DOORS: a SYNC the file system does not do at all (src/fd-close.js SYNC_UNSUPPORTED, the hub
// door's one constant — no second list: EINVAL, Linux vfs_fsync_range's answer for a file system with no fsync operation; ENOTSUP /
// EOPNOTSUPP; ENOSYS) LANDS here too: the job goes on exactly as a synced one and its answer carries the code (`noSync`) — the
// writer says it ONCE for its whole life (src/store-writer.js noSyncSeen). Every other failed sync, write, close or rename is a
// failed write, as before. Before this, such a data folder failed EVERY store write of the writer, retried for ever: nothing landed
const { SYNC_UNSUPPORTED } = require('./fd-close.js');
/** a refused sync of a temp, judged ALONE (a write's own error never reaches it): a code of the set → that code; any other → thrown */
const unsynced = (e) => { if (!e || !SYNC_UNSUPPORTED.has(e.code)) throw e; return e.code; };
const withNoSync = (res, code) => (code ? Object.assign(res || {}, { noSync: code }) : res);

const S = workerData && workerData.sab ? new Int32Array(workerData.sab) : null;

/** EVERY BYTE, OR A FAILED WRITE (round 2, law A): each part is written with a loop over the count `writeSync` returns —
 *  a short write (a filling disk, a file-size limit, a FUSE / NFS server) writes the rest; a write that makes no progress
 *  is a failed write. Never one call trusted to have written everything (the string road did; a 3 MB store came out as
 *  its first 2 MiB under a 2 MiB file-size limit). */
function writeAll(fs, fd, parts) {
  for (const p of parts || []) {
    const b = typeof p === 'string' ? Buffer.from(p) : Buffer.from(p);
    let o = 0;
    while (o < b.length) {
      const n = fs.writeSync(fd, b, o, b.length - o);
      if (!(n > 0)) throw Object.assign(new Error(`a short write: ${o} of ${b.length} bytes written, then ${n}`), { code: 'ESHORT' });
      o += n;
    }
  }
}
/** a killed process leaves its temp file (`<file>.tmp-<pid>[-w]`): the first write of a file in this process removes
 *  the ones another process left (never this one's) */
const swept = new Set();
function sweepTemps(fs, file, ownTmp = null) {   // B-f276 1b (its read r2 N3): + THIS road's own temp left by an earlier life of its thread
  if (swept.has(file)) return;
  swept.add(file);
  const dir = path.dirname(file), base = path.basename(file) + '.tmp-';
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const n of names) {
    const m = n.startsWith(base) ? /^(\d+)(-w)?$/.exec(n.slice(base.length)) : null;
    if (m && (Number(m[1]) !== process.pid || path.join(dir, n) === ownTmp)) { try { fs.unlinkSync(path.join(dir, n)); } catch (e) { if (path.join(dir, n) === ownTmp && e && e.code !== 'ENOENT' && sameFile(fs, ownTmp, file)) LINKED.add(ownTmp); } }   // only a temp that IS a second name of the store   // B-f276 1c: this road's own temp that would not go — a second name, never opened (ETEMPLINKED)
  }
}
/** B-f276 1b (主开发 r809, THE MISSING LAW): an EXCLUSIVE job — its store read the file MISSING — LINKS the temp to the file: a link
 *  refuses an existing file (EEXIST — it appeared since, a mount that came late: thrown, the caller removes the temp, nothing is written
 *  over it). → true (linked: the temp removed) | false (a filesystem without links and no file there: the caller renames) */
const NO_LINK = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV']);
// B-f276 1b (its read r1 S2): a temp whose removal FAILED after its link is a SECOND NAME of the store file — never opened for a write
// again (an open would truncate the live store in place) before it is gone
const LINKED = new Set();
function dropTemp(fs, tmp) {
  try { fs.unlinkSync(tmp); } catch (e) { if (!e || e.code !== 'ENOENT') { LINKED.add(tmp); return false; } }
  LINKED.delete(tmp);
  return true;
}
// B-f276 1b (its read r1 S3): an EEXIST whose file IS the temp (an NFS retransmit of our own link, its first answer lost) is our link landed
const sameFile = (fs, a, b) => { try { const [x, y] = [a, b].map((p) => fs.statSync(p, { bigint: true })); return x.ino === y.ino && x.dev === y.dev; } catch { return false; } };   // bigint: an NTFS id passes 2^53
// B-f276 1c (主开发 r1143 (1)): file → the own numbers {dev, ino} of the file THIS road made for a store that may write only over its own
// file (`m.ownOnly`: its store read the file missing and has not read it since). A later whole write CHECKS, just before its rename, that
// the file there is that one; a later append opens only that file, never creating it. The job carries the store's last known numbers
// (`m.own`), asked FIRST, then this thread's map: a file EITHER names is the store's own (its round whfrsuwsp, 主开发 r1588 (3)). The
// store's cell comes from every road (the thread's replies and the main thread's own writes), so a thread that started again — or the
// main thread writing while it could not — never refuses the store's own file over the map of an older life; the thread's map is the
// fresher one for a job sent before the last reply came back (its own write just landed here). TWO NARROW LIMITS (kb): a file that takes the name between the check and the rename is renamed
// over (no rename primitive closes that window; a mount over the whole folder takes the temp with it: ENOENT), and a file removed and
// copied back under a running hub can be given the freed inode number again (ext4), so it reads as the store's own. A THIRD (its round
// wp3niroz5): a writer thread that dies between a rename (or a first 'ax' append) and its reply takes its map with it, and the store's
// cell is one write old — the requeued job refuses the store's own file, and the family is held «appeared» for nothing until a restart
const OWN = new Map();
const idOf = (fs, p) => { try { const s = fs.statSync(p, { bigint: true }); return { dev: s.dev, ino: s.ino }; } catch (e) { if (e && e.code === 'ENOENT') return null; throw e; } };
const notOwn = (file) => Object.assign(new Error(`${file} is not the file its store made (a mount that came late?) — not written over`), { code: 'EEXIST' });
function linkedHere(fs, tmp, file) {
  try { fs.linkSync(tmp, file); }
  catch (e) {
    if (e && e.code === 'EEXIST' && sameFile(fs, tmp, file)) { dropTemp(fs, tmp); return true; }
    if (!e || !NO_LINK.has(e.code)) throw e;
    if (fs.existsSync(file)) throw Object.assign(new Error(`${file} appeared since its store read it missing`), { code: 'EEXIST' });
    return false;
  }
  dropTemp(fs, tmp);
  return true;
}
/** A REWRITE of an append store FROM ITS OWN BYTES (row B-360d — the OTel stash's trim as a job of its ONE writer, 主开发
 *  r725 a): the kept byte ranges of the file's first `size` bytes, then every byte past `size` (appended after the ranges were
 *  read — in order, since no append of this file runs beside this job), then the job's own parts (the appends owed with it),
 *  copied to the temp in pieces of at most PIECE bytes, fsync'd, closed and renamed over the file. A range ending at size + 1
 *  is the file's unterminated last line: the newline it lacks is written after it; bytes past `size` that end torn get one too,
 *  before the job's own lines. A file shorter than `size` (not the bytes the ranges were read from), a short read or a short
 *  write FAILS the job: the caller removes the temp, the file stays whole. After the rename the DIRECTORY is fsync'd: the lines
 *  the job carried are on disk with the rename, as an append's are (a storage that refuses a directory fsync is let be). */
const PIECE = 4 * 1024 * 1024;
function rewriteJob(m, fs) {
  sweepTemps(fs, m.file, m.tmp);   // B-f276 1b's: this road's own temp left by an earlier life of its thread
  if (LINKED.has(m.tmp) && !dropTemp(fs, m.tmp)) {   // B-f276 1b's law on the rewrite road too: never opened for a write while it is a second name of the store
    throw Object.assign(new Error(`${m.tmp} is still a second name of ${m.file} (its removal failed) — not rewritten through it`), { code: 'ETEMPLINKED' });
  }
  const ranges = m.rewrite.ranges, size = m.rewrite.size;
  let src = null, out = null, err = null, noSync = null;
  try {
    src = fs.openSync(m.file, 'r');
    const now = fs.fstatSync(src).size;
    if (now < size) throw Object.assign(new Error(`the file is ${now} bytes, shorter than the ${size} its kept lines were read from`), { code: 'ESHRUNK' });
    out = fs.openSync(m.tmp, 'w', m.mode == null ? 0o666 : m.mode);
    const buf = Buffer.allocUnsafe(PIECE);
    let o = 0, last = 10;
    const flush = () => { for (let w = 0; w < o;) { const n = fs.writeSync(out, buf, w, o - w); if (!(n > 0)) throw Object.assign(new Error(`a short write: ${w} of ${o} bytes written, then ${n}`), { code: 'ESHORT' }); w += n; } o = 0; };
    const copy = (a, e) => {
      for (let at = a; at < e;) {
        if (o === PIECE) flush();
        const n = fs.readSync(src, buf, o, Math.min(PIECE - o, e - at), at);
        if (!(n > 0)) throw Object.assign(new Error(`a short read at ${at} of the ${e} bytes to keep`), { code: 'ESHORTREAD' });
        o += n; at += n; last = buf[o - 1];
      }
    };
    for (let k = 0; k < ranges.length; k += 2) {
      const a = ranges[k], e = ranges[k + 1];
      if (!(a >= 0 && e > a && e <= size + 1)) throw Object.assign(new Error(`a kept range out of the file: [${a}, ${e}) of ${size}`), { code: 'EBADRANGE' });
      if (e > size) { copy(a, size); if (o === PIECE) flush(); buf[o++] = 10; } else copy(a, e);
    }
    copy(size, now);
    if (now > size && last !== 10) { if (o === PIECE) flush(); buf[o++] = 10; }   // a torn tail past the read: the job's lines start on a new line
    flush();
    writeAll(fs, out, m.parts);
    try { fs.fsyncSync(out); } catch (e) { noSync = unsynced(e); }   // r5010: judged alone — a sync the file system does not do lands, said once
  } catch (e) { err = e; }
  if (out != null) { try { fs.closeSync(out); } catch (e) { if (!err) err = e; } }
  if (src != null) { try { fs.closeSync(src); } catch (e) { if (!err) err = e; } }   // a close that fails is the job's (every byte or nothing)
  if (err) throw err;   // the caller removes the temp: the file keeps its whole old version
  if (m.mode != null) { try { fs.chmodSync(m.tmp, m.mode); } catch { /* a filesystem without modes */ } }
  fs.renameSync(m.tmp, m.file);   // the commit point: the old whole file or the new one
  const UNSYNCABLE = ['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'EISDIR', 'EPERM', 'EACCES'];   // a storage that refuses a directory's fsync (some FUSE / network mounts)
  // a failure from here on comes AFTER the rename: the file IS rewritten (its lines in it) — said by its own code, ERENAMEDNOSYNC,
  // never as a failed rewrite (主开发 r915 2)
  let after = null, dfd = null;
  try { dfd = fs.openSync(path.dirname(m.file), 'r'); } catch (e) { if (!UNSYNCABLE.includes(e && e.code)) after = e; else noSync = noSync || e.code; }   // r5010: a let-be code is said by the writer's one no-sync line
  if (dfd != null) {
    try { fs.fsyncSync(dfd); } catch (e) { if (!UNSYNCABLE.includes(e && e.code)) after = e; else noSync = noSync || e.code; }
    try { fs.closeSync(dfd); } catch (e) { if (!after) after = e; }
  }
  if (after) throw Object.assign(new Error(`the rewrite landed (renamed over the file); its directory's fsync did not: ${(after && (after.code || after.message)) || after}`), { code: 'ERENAMEDNOSYNC' });
  return noSync ? { noSync } : undefined;
}
/** ONE job. A whole-file write: temp, every byte, fsync (B-9275), close (its error is the write's), rename — NOTHING is renamed
 *  over the store unless every byte was written, synced and the temp closed without error. An APPEND (the acts journal): every byte,
 *  fsync, close — a failure truncates back to the size before it (no torn line is left for a promise that resolved). */
function writeJob(m, fs = FS) {
  // its round wp3niroz5 (3): A REWRITE NEVER RUNS UNDER THE OWN-FILE LAW — it copies its file by name, so a job that asks both is refused by
  // name (no channels family asks one: the OTel stash's trim is the one rewrite; this line makes that a law)
  if (m.rewrite && (m.ownOnly || m.exclusive)) throw Object.assign(new Error(`${m.file}: a rewrite is never run for a store under the own-file law (exclusive / own-only)`), { code: 'EREWRITEOWN' });
  if (m.rewrite) return rewriteJob(m, fs);
  let res;
  if (m.append) {
    sweepTemps(fs, m.file, m.tmp);   // row B-360d: a rewrite killed mid-copy left its temp beside an APPEND store — the first append of the file in this process removes another process's, and (主开发 r1939 (2)) this road's OWN temp left by an earlier life of the thread: the sweep runs once a file, so an append first must not leave it for the whole write's
    // B-f276 1c (r1143 (1)): an own-only store's FIRST append is an exclusive create; every later one is checked by the open file's numbers
    // …and a LATER own-only open never creates the file (its round whfrsuwsp's follow, judged): a journal gone since is not this store's to
    // make again — refused as not its own (its store holds the family), never an empty file made in a folder that may be a mount's
    const fl = m.ownOnly ? (!OWN.get(m.file) && !m.own ? 'ax' : FS.constants.O_WRONLY | FS.constants.O_APPEND) : 'a';
    // the ONE open of an append (made again after a ring's rotation); a missing parent directory is made here, on the writer's
    // thread, ONLY for a store that asks (`m.makeDir` — B-48a4: the hub's audit rings, whose old main-thread code made it per line)
    const openA = () => {
      try { return fs.openSync(m.file, fl, m.mode == null ? 0o666 : m.mode); }
      catch (e) { if (!e || e.code !== 'ENOENT' || !m.makeDir) throw e; fs.mkdirSync(path.dirname(m.file), { recursive: true, mode: 0o700 }); return fs.openSync(m.file, fl, m.mode == null ? 0o666 : m.mode); }
    };
    let fd;
    try { fd = openA(); } catch (e) { if (m.ownOnly && typeof fl === 'number' && e && e.code === 'ENOENT') throw Object.assign(notOwn(m.file), { gone: true }); throw e; }
    if (m.ownOnly) {
      let st;
      try { st = fs.fstatSync(fd, { bigint: true }); } catch (e) { try { fs.closeSync(fd); } catch (ce) { e.closeError = ce.code || String(ce); } throw e; }   // B-f276 1c (its read r1 S1): no fd left open
      const mine = [m.own, OWN.get(m.file)].filter(Boolean);   // the store's own cell, then the thread's map (r1588 (3)): a file either names is its own
      if (mine.length && !mine.some((x) => st.ino === x.ino && st.dev === x.dev)) { let ce = null; try { fs.closeSync(fd); } catch (e) { ce = e; } throw Object.assign(notOwn(m.file), ce ? { closeError: ce.code || String(ce) } : {}); }   // the close's error rides the refusal
      res = { own: { dev: st.dev, ino: st.ino } }; OWN.set(m.file, res.own);
    }
    let err = null, size0 = null, noSync = null;
    try {
      size0 = fs.fstatSync(fd).size;
      // B-48a4: A RING (the hub's two audits): past `rotateAt` the live file moves to `.1` HERE — on the writer's thread, in
      // order with every append of the file, before these bytes — never on the main loop or the fs threadpool; the old `.1` goes
      if (m.rotateAt > 0 && size0 > 0 && size0 + (m.parts || []).reduce((n, b) => n + (typeof b === 'string' ? Buffer.byteLength(b) : (b && b.byteLength) || 0), 0) > m.rotateAt) {
        const was = fd; fd = null; fs.closeSync(was);
        try { fs.renameSync(m.file, m.file + '.1'); } catch { /* a rename the storage refuses (a hand-placed .1, EACCES): the ring keeps RECORDING past its bound, as the release's main-thread code did — a line is worth more than the bound */ }
        fd = openA();
        size0 = fs.fstatSync(fd).size;
      }
      writeAll(fs, fd, m.parts);
      try { fs.fsyncSync(fd); } catch (e) { noSync = unsynced(e); }   // r5010: judged alone — a sync the file system does not do lands, said once
    } catch (e) { err = e; }
    if (err && size0 != null && fd != null) { try { fs.ftruncateSync(fd, size0); } catch { } }
    if (fd != null) { try { fs.closeSync(fd); } catch (e) { if (!err) err = e; } }
    if (err) { if (res && res.own && typeof err === 'object') err.own = res.own; throw err; }   // r2593 (2): the numbers THIS job made ride its error — the main-thread road (writeHere) feeds the store's cell on a failure too
    return withNoSync(res, noSync);
  }
  sweepTemps(fs, m.file, m.tmp);
  // channel-store-off-loop (commit 1): A MISSING PARENT DIRECTORY IS MADE HERE, on the writer's thread — a store whose
  // directory is new (an account's people.json) never makes it on the main thread (the field: an account directory's
  // mkdir held the owner's loop 75 s in a day on a mount where a create costs ~4 s). Owner-only, as the store's own file.
  // Cure r1: ONLY for a write that asks (`m.makeDir` — the people door); any other store's missing directory is ENOENT.
  if (LINKED.has(m.tmp) && !dropTemp(fs, m.tmp)) throw Object.assign(new Error(`${m.tmp} is still a second name of ${m.file} (its removal failed) — not written through it`), { code: 'ETEMPLINKED' });
  let fd;
  try { fd = fs.openSync(m.tmp, 'w', m.mode == null ? 0o666 : m.mode); }
  catch (e) {
    if (!e || e.code !== 'ENOENT' || !m.makeDir) throw e;
    fs.mkdirSync(path.dirname(m.file), { recursive: true, mode: 0o700 });
    fd = fs.openSync(m.tmp, 'w', m.mode == null ? 0o666 : m.mode);
  }
  let err = null, noSync = null;
  // B-9275 — A STORE'S NEW BYTES ARE ON DISK BEFORE ITS NAME POINTS AT THEM: the temp is synced HERE, before its close and the
  // rename (a power loss or a machine's crash after a rename of unsynced bytes left the name on an empty or half file — the old
  // whole version gone). A sync that fails is a failed write, as a short write or a close's error is: nothing is renamed — except a
  // sync the file system does not do at all (r5010: judged alone, never a write's error): the write goes on and lands, said once.
  try { writeAll(fs, fd, m.parts); try { fs.fsyncSync(fd); } catch (e) { noSync = unsynced(e); } } catch (e) { err = e; }
  try { fs.closeSync(fd); } catch (e) { if (!err) err = e; }   // an error at close (an NFS server's ENOSPC) is the write's
  if (err) throw err;   // the caller removes the temp: the store keeps its previous whole version
  // `mode` applies when the temp file is CREATED; a leftover temp from a killed write keeps its old bits
  if (m.mode != null) { try { fs.chmodSync(m.tmp, m.mode); } catch { /* a filesystem without modes */ } }
  // B-f276 1c (主开发 r1143 (1)): an own-only store renames only over the file it made itself — CHECKED JUST BEFORE THE RENAME (the
  // narrow window between the two: the head comment above) (a different file there: not its own,
  // refused — its store reads and keeps it); a file gone since is created exclusively again
  if (m.ownOnly && !m.exclusive) {
    const cur = idOf(fs, m.file), mine = [m.own, OWN.get(m.file)].filter(Boolean);   // the store's own cell, then the thread's map (r1588 (3))
    if (cur && !mine.some((x) => cur.ino === x.ino && cur.dev === x.dev)) throw notOwn(m.file);
    const made0 = !cur ? idOf(fs, m.tmp) : null;   // B-f276 1c (S2): the temp's own numbers, read BEFORE the link (after it: the same inode)
    if (!cur && linkedHere(fs, m.tmp, m.file)) { res = { own: made0 }; OWN.set(m.file, made0); return withNoSync(res, noSync); }
  }
  const made1 = m.exclusive && m.ownOnly ? idOf(fs, m.tmp) : null;   // B-f276 1c (S2): read from the temp, before the link
  if (m.exclusive && linkedHere(fs, m.tmp, m.file)) {   // B-f276 1b: a store read missing — its first write never lands over a file that appeared
    if (m.ownOnly) { res = { own: made1 }; OWN.set(m.file, made1); }
    return withNoSync(res, noSync);
  }
  const made = m.ownOnly ? idOf(fs, m.tmp) : null;
  fs.renameSync(m.tmp, m.file);   // THE commit point: the store's file is the old whole version or the new one, never half
  if (made) { res = { own: made }; OWN.set(m.file, made); }
  return withNoSync(res, noSync);
}

/** A WHOLE WRITE IN PIECES (the writer unit, 主开发 r1328 — law 1, NO WHOLE WRITE HOLDS A TURN): the main thread hands one turn's
 *  snapshot of a store's bytes BY REFERENCE in pieces of about 4 MB, one piece a turn; HERE the first piece opens the temp (a
 *  missing directory made only for a store that asks, as writeJob's), each piece writes every byte, and the LAST syncs the temp,
 *  closes it and renames it over the store — B-9275 unit 1's order on this road too. A failure at any piece (or the main
 *  thread's ABORT: a handed buffer written into, a write given up) is the write's: its later pieces write nothing, the temp
 *  is closed and removed at the last, the store keeps its previous whole version. `cur` = this thread's one write in pieces
 *  (a new first piece drops one never finished: a requeue after a lost answer). → { cur, done: null | { err, ms } } */
function pieceJob(m, cur, fs = FS) {
  const t0 = process.hrtime.bigint();
  if (m.first) {
    let dropped = null;   // an earlier write in pieces never finished (its answer lost): its temp closed and removed — a close that fails is SAID
    if (cur && cur.fd != null) { try { fs.closeSync(cur.fd); } catch (e) { dropped = (e && e.code) || 'EIO'; } try { fs.unlinkSync(cur.tmp); } catch { /* gone already */ } }
    cur = { id: m.id, tmp: m.tmp, fd: null, err: null, ms: 0, dropped };
    sweepTemps(fs, m.file, m.tmp);   // B-f276 1b (r2 N3), as writeJob: + this road's own temp an earlier life of its thread left
    // B-f276 1b, as writeJob: a temp still a second name of the store (its removal failed) is never written through
    if (LINKED.has(m.tmp) && !dropTemp(fs, m.tmp)) cur.err = Object.assign(new Error(`${m.tmp} is still a second name of ${m.file} (its removal failed) — not written through it`), { code: 'ETEMPLINKED' });
    else try { cur.fd = fs.openSync(m.tmp, 'w', m.mode == null ? 0o666 : m.mode); }
    catch (e) {
      if (e && e.code === 'ENOENT' && m.makeDir) { try { fs.mkdirSync(path.dirname(m.file), { recursive: true, mode: 0o700 }); cur.fd = fs.openSync(m.tmp, 'w', m.mode == null ? 0o666 : m.mode); } catch (e2) { cur.err = e2; } }
      else cur.err = e;
    }
  }
  if (!cur || cur.id !== m.id) return { cur, done: m.last ? { err: Object.assign(new Error('a piece of a write whose first piece never came'), { code: 'EPIECE' }), ms: 0 } : null };
  if (m.abort && !cur.err) cur.err = Object.assign(new Error(m.why || 'the write was given up by the main thread'), { code: m.code || 'EABORT' });
  if (!cur.err) { try { writeAll(fs, cur.fd, m.parts); if (m.last) { try { fs.fsyncSync(cur.fd); } catch (e) { cur.noSync = unsynced(e); } } } catch (e) { cur.err = e; } }   // THE BYTES ON DISK BEFORE THE NAME (B-9275); r5010: a sync the file system does not do lands, said once
  cur.ms += Number(process.hrtime.bigint() - t0) / 1e6;
  if (!m.last) return { cur, done: null };
  if (cur.fd != null) { try { fs.closeSync(cur.fd); } catch (e) { if (!cur.err) cur.err = e; } cur.fd = null; }
  if (!cur.err && m.mode != null) { try { fs.chmodSync(m.tmp, m.mode); } catch { /* a filesystem without modes */ } }
  // THE commit point, after every piece and the sync — B-f276 1b, as writeJob: a store read missing lands by its EXCLUSIVE link
  // THE commit point, as writeJob's (line for line — the line 320 move onto the train, r2294): B-f276 1c's own-only check just before the
  // rename (a file there that is not the store's own: refused EEXIST, by name), 1b's exclusive link, else the rename — and the own numbers
  // of the file an own-only store made, handed back as writeJob's are
  if (!cur.err) {
    try {
      let done = false;
      if (m.ownOnly && !m.exclusive) {
        const at = idOf(fs, m.file), mine = [m.own, OWN.get(m.file)].filter(Boolean);
        if (at && !mine.some((x) => at.ino === x.ino && at.dev === x.dev)) throw notOwn(m.file);
        const made0 = !at ? idOf(fs, m.tmp) : null;
        if (!at && linkedHere(fs, m.tmp, m.file)) { cur.own = made0; OWN.set(m.file, made0); done = true; }
      }
      if (!done) {
        const made1 = m.exclusive && m.ownOnly ? idOf(fs, m.tmp) : null;
        if (m.exclusive && linkedHere(fs, m.tmp, m.file)) { if (m.ownOnly) { cur.own = made1; OWN.set(m.file, made1); } }
        else { const made = m.ownOnly ? idOf(fs, m.tmp) : null; fs.renameSync(m.tmp, m.file); if (made) { cur.own = made; OWN.set(m.file, made); } }
      }
    } catch (e) { cur.err = e; }
  }
  if (cur.err) { try { fs.unlinkSync(m.tmp); } catch { } }
  return { cur: null, done: { err: cur.err, ms: cur.ms + Number(process.hrtime.bigint() - t0) / 1e6, dropped: cur.dropped, own: cur.err ? null : (cur.own || null), noSync: cur.err ? null : (cur.noSync || null) } };
}

/** THE THREAD'S OWN ANSWER (r5010 — one function): the thread's own script runs it over the real fs (below), a suite's stand-in thread
 *  over a placed one — so a leg reads the REAL cells and the REAL message of every road */
function serve(parentPort, S, fs = FS) {   // its port named as the thread's own (test-memory-census reads the loop's first line)
  const { answerMemory } = require('./worker-memory.js');
  let cur = null;   // this thread's one whole write in pieces (pieceJob)
  /** a job's end in the shared cells: its outcome, its error code, the done count (this thread its ONE writer), then the wake */
  const settleCells = (err, own = null, noSync = null) => {
    if (!S) return;
    if (S.byteLength >= 64) { const B = new BigUint64Array(S.buffer, 48, 2); B[0] = own ? BigInt(own.dev) : 0n; B[1] = own ? BigInt(own.ino) : 0n; }   // the own numbers, read by a settle before this answer is
    // r5010: a LANDED job whose sync its file system does not do carries that code in the same cells (its outcome ok — the waited road reads it)
    const code = err ? String(err.code || 'EWRITE') : noSync ? String(noSync) : null;
    if (code && S.byteLength >= 48) { const c = Buffer.from(code.slice(0, 32), 'latin1'); new Uint8Array(S.buffer, 16, 32).set(c); Atomics.store(S, 3, c.length); } else if (S.length > 3) Atomics.store(S, 3, 0);
    Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1);   /* this thread is the count's ONE writer */ Atomics.store(S, 0, 0); Atomics.notify(S, 1);   // the cell the main thread waits on
  };
  // THE FILE ITS STORE MADE (B-f276 1c × the lanes): this thread's map is not the other lane's — a FIRST append that created the
  // file and then failed leaves it here only, and the answer carries it to the store's own cell. Handed back only when THIS job
  // made the entry (r2593 (1)): an entry an older job set is stale on this lane once the other lane's compaction renamed a newer
  // file, and handing it back would put the old pair over the store's fresh one
  const ownNow = (m, own, was) => own || (m.ownOnly && m.file && OWN.get(m.file) !== was ? OWN.get(m.file) || null : null);
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return;   // the memory census (src/worker-memory.js) — answered at once
    const m = msg;
    if (!m || (m.ev !== 'write' && m.ev !== 'unlink' && m.ev !== 'piece')) return;
    if (m.ev === 'piece') {   // a whole write in pieces: answered (and counted in the cells) at its LAST piece only
      if (S && m.first) Atomics.store(S, 0, m.id);
      const r = pieceJob(m, cur, fs); cur = r.cur;
      if (!r.done) return;
      const err = r.done.err ? { code: (r.done.err && r.done.err.code) || null, message: (r.done.err && r.done.err.message) || String(r.done.err) } : null;
      const own = r.done.own || null;   // the piece road: the job's own result alone (r2593 (1))
      const noSync = err ? null : r.done.noSync || null;   // r5010
      settleCells(err, own, noSync);
      parentPort.postMessage({ ev: 'written', id: m.id, ms: r.done.ms, err, file: m.file, own, ...(r.done.dropped ? { dropped: r.done.dropped } : {}), ...(noSync ? { noSync } : {}) });   // own: as the plain road's (B-f276 1c)
      return;
    }
    if (S) Atomics.store(S, 0, m.id);
    const t0 = process.hrtime.bigint();
    let err = null;
    let res = null;
    const was = m.ownOnly && m.file ? OWN.get(m.file) : undefined;   // the thread's entry before the job (r2593 (1))
    if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch (e) { if (!e || e.code !== 'ENOENT') err = { code: (e && e.code) || null, message: (e && e.message) || String(e) }; } }
    else { try { res = writeJob(m, fs); } catch (e) { err = { code: (e && e.code) || null, message: (e && e.message) || String(e) }; if (!m.append) { try { fs.unlinkSync(m.tmp); } catch { } } } }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const own = m.ev === 'unlink' ? null : ownNow(m, res && res.own, was);
    const noSync = !err && res && res.noSync ? res.noSync : null;   // r5010: the code of a sync its file system does not do — the writer says it once
    settleCells(err, own, noSync);
    parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err, file: m.file, own, ...(noSync ? { noSync } : {}) });   // own: the numbers of the file an own-only store made
  });
}
if (parentPort && require.main === module) serve(parentPort, S);   // the thread's own script, over the real fs

module.exports = { writeJob, pieceJob, writeAll, sweepTemps, linkedHere, rewriteJob };
module.exports.serve = serve;   // r5010: a suite's stand-in thread runs THIS answer over a placed fs
