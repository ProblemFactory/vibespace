'use strict';
// THE READING ARCHIVE'S ROLL BY RENAME (B-360d part 3 U2, 主开发 r1459 — the pool engine's archive of refused readings, past
// 5 MB, was rolled by a WHOLE synchronous read of the file, an append of those bytes to a per-day file and an empty write, on
// the loop and on the data share). Now the live file is RENAMED to a per-day shard: one metadata operation, nothing read or
// rewritten. A shard that exists is never written over (a second roll the same day takes the next sequence number), so an
// archive never loses what it exists to keep. The per-line appends stay where they are (each is the only record of a refused
// reading).
const fs = require('fs');

/** `file` past `maxBytes` → RENAMED to `<base>-<yyyymmdd>.ndjson` (then `-<yyyymmdd>-2`, `-3` …) and that path answered; under
 *  the bound, or no file → null. Throws what the rename throws (the caller keeps appending to the live file). */
function rollIfOver(file, maxBytes, { now = Date.now() } = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  if (!(st.size > maxBytes)) return null;
  const day = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
  const base = file.replace(/\.ndjson$/, `-${day}`);
  for (let n = 1; n < 1000; n++) {
    const shard = n === 1 ? `${base}.ndjson` : `${base}-${n}.ndjson`;
    if (fs.existsSync(shard)) continue;
    fs.renameSync(file, shard);
    return shard;
  }
  return null;
}

module.exports = { rollIfOver };
