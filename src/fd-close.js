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

module.exports = { closeWritten, closeWrittenHandle, closeFailedWords };
