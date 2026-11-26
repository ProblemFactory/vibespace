'use strict';
// ONE CLOSE OF A WRITTEN FILE (lane lg-store-writes, row B-15ac — 主开发 r635 / r755). A close of a file that was WRITTEN with no
// fsync before it is where a write error arrives on a network or FUSE data folder (the close reports a deferred write failure):
// swallowed, the file is believed written while its last bytes are not on disk. This helper closes ONCE and SAYS a failed close
// — its errno and where — once, in the sink of the process it runs in (the hub's journal, a wrapper's own log, a CLI's stderr);
// it never throws. The caller FORGETS the number in the statement that closes it: `fd = closeWritten(fd, where, say)` (→ null).
// SHARED: the hub (hosts.js, channel-store.js), the wrappers under data/bin (required eagerly as kept-copies.js is; each carries
// a one-line fallback that says THESE words — one spelling, pinned by test-fd-close-census ⑤), and the channels CLI (the
// cli-call road: the checkout's copy, else the copy beside it at boot — src/server/agent-tool-generators.js). Node builtins only
// (fs); no network; no path in its words (the site's name and the code only). Its SYNC_UNSUPPORTED is the store writer's too
// (src/store-writer-worker.js, 主开发 r5010: one set for both doors), and syncUnsupportedWords its one no-sync line (src/store-writer.js).
const fs = require('fs');

/** THE words of a failed close (the one spelling) */
function closeFailedWords(where, code) { return `${where}: the file could not be closed (${code || 'error'}) — what was written may not be on disk`; }

/** close a written descriptor ONCE; a failure is said once; → null (the caller's number, forgotten) */
function closeWritten(fd, where, say) {
  if (fd === null || fd === undefined) return null;
  try { fs.closeSync(fd); } catch (e) { try { if (typeof say === 'function') say(closeFailedWords(where, e && e.code)); } catch { /* a sink that throws says nothing more */ } }
  return null;
}

/** the same for a FileHandle of the promises API (its own close forgets its number; a failure is said once) → Promise<null> */
async function closeWrittenHandle(fh, where, say) {
  if (!fh) return null;
  try { await fh.close(); } catch (e) { try { if (typeof say === 'function') say(closeFailedWords(where, e && e.code)); } catch { /* a sink that throws says nothing more */ } }
  return null;
}

/** THE codes of a sync the file system REFUSES TO DO AT ALL (r4474): EINVAL — the kernel's own answer for a file system with no fsync
 *  operation at all (Linux vfs_fsync_range), and fsync(2)'s for a file kind that cannot be synced; ENOTSUP / EOPNOTSUPP — a file
 *  system (some network and FUSE ones) answering that it does not support the operation (one number on Linux, two names elsewhere);
 *  ENOSYS — the call itself not implemented (Linux's FUSE layer turns a daemon's ENOSYS into success; another kernel may pass it on).
 *  EVERY OTHER CODE (EIO, ENOSPC, EDQUOT, EROFS, an unknown one) is where a WRITE error first shows on a network folder: the bytes may
 *  not be there — a FAILED WRITE. ONE SET FOR BOTH DOORS (主开发 r5010): the store writer's thread (src/store-writer-worker.js) reads THIS
 *  constant, no second list. The kernel's own code, read at v7.0.14: fs/sync.c vfs_fsync_range answers -EINVAL when the file's
 *  operations have no fsync; fs/fuse/file.c fuse_fsync turns a daemon's -ENOSYS into success and asks it no more */
const SYNC_UNSUPPORTED = new Set(['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS']);
/** THE words of a sync the file system does not do (the one spelling) */
function syncUnsupportedWords(where, code) { return `${where}: its file system does not do a sync (${code}) — its new bytes took their name unsynced`; }

/** B-ddf3 unit 3 (lane bl-vault, 主开发 r4634): A PERSON's FILE ON A FOLDER WHOSE FILE SYSTEM DOES NOT DO A SYNC STILL LANDS. THE one
 *  reading of a sync's error at a site that writes a person's file: a code of SYNC_UNSUPPORTED → true (the file takes its name), its
 *  words SAID ONCE A SITE (`where`, for the life of a process or of a worker thread — each pool worker has its own: the site's name and
 *  the code, no path) in the site's own sink; THE one cadence of these words in this file (r4675); EVERY OTHER
 *  error → false (a failed write — the caller's, said by name). The open and the write keep their own try: only the sync's answer comes here */
const syncUnsupportedSaid = new Set();
function syncUnsupportedLands(e, where, say) {
  if (!(e && SYNC_UNSUPPORTED.has(e.code))) return false;
  if (!syncUnsupportedSaid.has(where)) { syncUnsupportedSaid.add(where); try { if (typeof say === 'function') say(syncUnsupportedWords(where, e.code)); } catch { /* a sink that throws says nothing more */ } }
  return true;
}

/** B-bcb8 unit B (主开发 r4367; r4474's law): A RECORD THE HUB READS TAKES ITS NAME ONLY AFTER ONE SYNC OF ITS TEMP — the job wrapper's
 *  pid / exit / bound records, the conversation wrappers' meta sidecars and the chat wrapper's handed records (after a power cut or a full
 *  disk the hub read a record with its name and no bytes); the two BUFFERS (chat, codex) pass `sync: false` (r4563 / r4578). `bytes` written to `tmp` (its mode), synced ONCE, closed, renamed to `final`.
 *  A sync that FAILS — or a close that fails after the write (a deferred write error), or the final RENAME (r4938) — is a FAILED WRITE: the temp is removed, the
 *  error THROWN as writeFileSync's was, the OLD record stands; each caller's own try is unchanged. ONLY a sync the file system does not
 *  do at all (SYNC_UNSUPPORTED) is SAID once (the site's name, the code — no path) and the record still takes its name. WHAT is written
 *  and WHEN are the caller's. THE SYNC IS THE CALLER'S NAMED CHOICE (r4563: «a buffer is not a durable record»): `sync: false` asks
 *  none — the write and the close still JUDGED (a failed write or close is a failed write: thrown, the temp removed, the OLD file
 *  stands; on a network folder a write error held back by the client comes out at the close, on a local disk a full disk is refused at
 *  the write), then the rename. The wrappers carry a one-line fallback with THESE words (test-fd-close-census ⑥) */
function renameSynced(tmp, final, bytes, { mode, where, say, sync = true } = {}) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes));
  let fd = fs.openSync(tmp, 'w', mode === undefined ? 0o666 : mode), failed = null;
  try {
    for (let o = 0; o < b.length;) { const n = fs.writeSync(fd, b, o, b.length - o); if (!(n > 0)) throw Object.assign(new Error('a short write'), { code: 'ESHORT' }); o += n; }
    if (sync) { try { fs.fsyncSync(fd); } catch (e) { if (!syncUnsupportedLands(e, where, say)) throw e; /* THE one cadence (主开发 r4675): said through the once-door, once a site */ } }   // r4563: `sync: false` — a caller's named choice (a buffer)
  } catch (e) { failed = e; }
  try { fs.closeSync(fd); } catch (e) { if (!failed) failed = e; }   // a close that fails after the write: its bytes may not be there — a failed write
  fd = null;
  if (failed) { try { fs.unlinkSync(tmp); } catch { /* gone already */ } throw failed; }
  // r4938: a RENAME that fails is a failed write too — the temp removed (as on a failed write, sync or close), the OLD file standing,
  // the rename's own error thrown to the caller (the one door's cure; never each caller's)
  try { fs.renameSync(tmp, final); } catch (e) { try { fs.unlinkSync(tmp); } catch { /* gone already */ } throw e; }
}

/** B-574d «usage-readings» (主开发 r5075 (C)): THE SAME DOOR, ASYNCHRONOUS — for a road that already writes OFF the loop through the
 *  promises API and orders its own steps (the usage hold road's set file, src/usage-hold-road.js): `bytes` written to `tmp` (its
 *  mode) through a FileHandle, synced ONCE, closed, then renamed to `final` — EVERY call handed to `step(promise)` (the caller's own
 *  queue: its bound, its slow word). THE SAME LAW as renameSynced: a write, sync or close that FAILS is a failed write — the temp
 *  removed, the error thrown, the OLD file stands; a rename that fails removes the temp too and throws; ONLY a sync the file system
 *  does not do at all (SYNC_UNSUPPORTED) is SAID (the site's name, the code — no path) and the file lands. → Promise(undefined)
 *  主开发 r5124: its removals of the temp go through `step` as its other calls do (the caller's bound, its slow word). ONE POINT ON
 *  WHICH THE TWO DOORS DIFFER: a refused rename — this twin removes its temp; renameSynced leaves it, as the release's writeFileSync
 *  + renameSync did. */
async function renameSyncedAsync(tmp, final, bytes, { mode, where, say, sync = true, step = (p) => p } = {}) {
  const fsp = fs.promises, b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes));
  const fh = await step(fsp.open(tmp, 'w', mode === undefined ? 0o666 : mode));
  let failed = null;
  try {
    await step(fh.writeFile(b));
    if (sync) { try { await step(fh.sync()); } catch (e) { if (!syncUnsupportedLands(e, where, say)) throw e; /* THE one cadence (主开发 r4675): said through the once-door, once a site */ } }
  } catch (e) { failed = e; }
  try { await step(fh.close()); } catch (e) { if (!failed) failed = e; }   // a close that fails after the write: its bytes may not be there — a failed write
  if (failed) { try { await step(fsp.unlink(tmp)); } catch { /* gone already */ } throw failed; }
  try { await step(fsp.rename(tmp, final)); } catch (e) { try { await step(fsp.unlink(tmp)); } catch { /* gone already */ } throw e; }
}

module.exports = { closeWritten, closeWrittenHandle, closeFailedWords, renameSynced, renameSyncedAsync, syncUnsupportedWords, SYNC_UNSUPPORTED, syncUnsupportedLands };
