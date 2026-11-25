'use strict';
// ONE CLOSE OF A WRITTEN FILE (lane lg-store-writes, row B-15ac — 主开发 r635 / r755). A close of a file that was WRITTEN with no
// fsync before it is where a write error arrives on a network or FUSE data folder (the close reports a deferred write failure):
// swallowed, the file is believed written while its last bytes are not on disk. This helper closes ONCE and SAYS a failed close
// — its errno and where — once, in the sink of the process it runs in (the hub's journal, a wrapper's own log, a CLI's stderr);
// it never throws. The caller FORGETS the number in the statement that closes it: `fd = closeWritten(fd, where, say)` (→ null).
// SHARED: the hub (hosts.js, channel-store.js), the wrappers under data/bin (required eagerly as kept-copies.js is; each carries
// a one-line fallback that says THESE words — one spelling, pinned by test-fd-close-census ⑤), and the channels CLI (the
// cli-call road: the checkout's copy, else the copy beside it at boot — src/server/agent-tool-generators.js). Node builtins only
// (fs); no network; no path in its words (the site's name and the code only).
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
 *  not be there — a FAILED WRITE */
const SYNC_UNSUPPORTED = new Set(['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS']);
/** THE words of a sync the file system does not do (the one spelling) */
function syncUnsupportedWords(where, code) { return `${where}: its file system does not do a sync (${code}) — its new bytes took their name unsynced`; }

/** B-bcb8 unit B (主开发 r4367; r4474's law): A RECORD THE HUB READS TAKES ITS NAME ONLY AFTER ONE SYNC OF ITS TEMP — the job wrapper's
 *  pid / exit / bound records, the conversation wrappers' meta sidecar, buffer and handed records (after a power cut or a full disk the
 *  hub read a record with its name and no bytes). `bytes` written to `tmp` (its mode), synced ONCE, closed, renamed to `final`.
 *  A sync that FAILS — or a close that fails after the write (a deferred write error) — is a FAILED WRITE: the temp is removed, the
 *  error THROWN as writeFileSync's was, the OLD record stands; each caller's own try is unchanged. ONLY a sync the file system does not
 *  do at all (SYNC_UNSUPPORTED) is SAID once (the site's name, the code — no path) and the record still takes its name. WHAT is written
 *  and WHEN are the caller's. The wrappers carry a one-line fallback with THESE words (test-fd-close-census ⑥) */
function renameSynced(tmp, final, bytes, { mode, where, say } = {}) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes));
  let fd = fs.openSync(tmp, 'w', mode === undefined ? 0o666 : mode), failed = null;
  try {
    for (let o = 0; o < b.length;) { const n = fs.writeSync(fd, b, o, b.length - o); if (!(n > 0)) throw Object.assign(new Error('a short write'), { code: 'ESHORT' }); o += n; }
    try { fs.fsyncSync(fd); } catch (e) { if (!SYNC_UNSUPPORTED.has(e && e.code)) throw e; try { if (typeof say === 'function') say(syncUnsupportedWords(where, e.code)); } catch { /* a sink that throws says nothing more */ } }
  } catch (e) { failed = e; }
  try { fs.closeSync(fd); } catch (e) { if (!failed) failed = e; }   // a close that fails after the write: its bytes may not be there — a failed write
  fd = null;
  if (failed) { try { fs.unlinkSync(tmp); } catch { /* gone already */ } throw failed; }
  fs.renameSync(tmp, final);
}

module.exports = { closeWritten, closeWrittenHandle, closeFailedWords, renameSynced, syncUnsupportedWords, SYNC_UNSUPPORTED };
