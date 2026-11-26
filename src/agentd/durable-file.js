'use strict';
// THE DEVICE'S ONE DOOR FOR ITS OWN FILES (row B-93e7, 主开发 r4381 / r4387 / r4671). A RECORD the device agent writes for itself on a
// paired machine — its dial file and dial status, its trust / floor / hub pins, its allow list, its orders, a secret file the hub
// hands it, its socket witness, the mac stream helper's state and version, a boot hook rewritten at a retire: 13 records — takes its
// NAME only after ONE sync of its temp. (The usage CURSOR is a cache, not a record: it asks no sync on any road and does not come
// here — r4671: an old or torn cursor only walks again, and the hub drops every row it holds by its own id.) Before: the temp was written and renamed with no sync, and after a power cut on a file
// system that does not flush at a rename the name could point at an empty or a short file: the agent came back unable to dial or
// to start. A RECORD's refused sync (EIO, ENOSPC, …) is SAID in the agent's own log — once a file, until a sync of it answers again —
// and the record still lands: a record put in place unsynced is better than a record lost. (The bundle is not a record: its landing
// syncs in src/agentd/agentd.js landBundle and a sync that FAILS refuses it — `syncRefusal` below tells the classes apart.)
// THIS FILE IS A DEVICE BUNDLE INPUT: every change of it rides a SIGNED device-agent release. That is why it is a door of its own
// and not the hub's wrapper helper in src/fd-close.js, which changes with any hub release (r4387: the class's two doors stay two;
// scripts/test-temp-rename-census.mjs names both, and a third is red).
const nodeFs = require('fs');
const nodePath = require('path');

/** r4387 — a refused SYNC's class, by the error's own code (one table, legged in scripts/test-device-durable-writes.mjs):
 *  'not-offered' — the file system has no sync for this file (not supported, not implemented, an invalid request for that kind of
 *  file): there is nothing to wait for, and a machine on such a folder must still take an update; 'failed' — anything else (an
 *  i/o error, no space, a quota, a read-only file system, no code at all): the bytes may not be on disk. */
const NOT_OFFERED = Object.freeze(['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EINVAL', 'EISDIR']);   // EISDIR: libuv's name on Windows for ERROR_INVALID_FUNCTION — a volume that offers no flush (its fresh read)
// A KNOWN LIMIT (r4671 (3)): on Linux fsync's EINVAL is documented for special files only, and a network file system reports a
// failed write-back as EIO, ENOSPC or EDQUOT (a failed close is «failed» here too) — but a FUSE or network server that answers a
// real failed flush with EINVAL would be read «not offered»: such a bundle lands unsynced, exactly as before this door
function syncRefusal(e) { return NOT_OFFERED.includes(String((e && e.code) || '')) ? 'not-offered' : 'failed'; }

/** the flag a written file is opened with to be synced: READ-ONLY on POSIX (fsync needs no write access there — a bundle staged
 *  read-only still lands), read-write on Windows (its flush needs it) */
const SYNC_OPEN = process.platform === 'win32' ? 'r+' : 'r';

/** the words of a record's refused sync (one spelling) */
function refusedSyncWords(what, code) { return `${what}: its write could not be synced to disk (${code || 'error'}) — it is put in place anyway; after a power cut it may come back older`; }

const SAID = new Set();   // the files whose refused sync was said (once a file, until a sync of it answers again)
/** say a refused sync of `key` ONCE (→ true when said now) */
function sayOnce(key, line, log) {
  if (SAID.has(key)) return false;
  SAID.add(key);
  try { if (typeof log === 'function') log(line); } catch { /* a log that throws must not stop the write */ }
  return true;
}

/** Write `data` to `file` through `tmp`, THE ORDER: a stale temp removed → the temp created EXCLUSIVE at `mode` → written whole →
 *  synced ONCE → closed → (`chmod` when given) → renamed over `file`. A refused sync is said once (`log`) and the write goes on; a
 *  failed write, close, chmod or rename removes the temp and THROWS (the caller's own catch and words, as before). → { synced } */
function writeDurable({ fs = nodeFs, file, tmp, data, mode = null, chmod = null, log = null, what = null } = {}) {
  if (!file) throw new Error('durable-file: a file is required');
  const temp = tmp || file + '.' + process.pid + '.tmp';
  try { fs.unlinkSync(temp); } catch { /* no stale temp */ }
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data == null ? '' : data));
  const fd = mode == null ? fs.openSync(temp, 'wx') : fs.openSync(temp, 'wx', mode);
  let failure = null, synced = false;
  try {
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
    try { fs.fsyncSync(fd); synced = true; SAID.delete(file); }
    catch (e) { sayOnce(file, refusedSyncWords(what || nodePath.basename(file), e && (e.code || e.name)), log); }
  } catch (e) { failure = e; }
  try { fs.closeSync(fd); } catch (e) { failure = failure || e; }
  if (!failure) {
    try { if (chmod != null) fs.chmodSync(temp, chmod); fs.renameSync(temp, file); } catch (e) { failure = e; }
  }
  if (failure) { try { fs.unlinkSync(temp); } catch { /* already gone */ } throw failure; }
  return { synced };
}

module.exports = { writeDurable, syncRefusal, refusedSyncWords, sayOnce, NOT_OFFERED, SYNC_OPEN };
