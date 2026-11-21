'use strict';
/**
 * THE PERSON'S POOL PIN, ON DISK BEFORE ITS ANSWER (lane lg-group-parents, B-526c unit 2) — synchronous and small.
 * The pin route answered at once while the session meta's durable write — the pin's only record — was dropped by its caller: a
 * stop right after the answer lost the person's choice. Now the pin is ALSO a record of its own, written before the answer:
 *   data/pool-pins/<poolId>/<sockName>   a symlink whose TARGET TEXT is `<memberId>#<at>#<by>` (symlink + rename — the pool
 *                                        link's own primitive, atomic); a cleared pin («自动») unlinks it
 * keyed by the conversation's meta name (`cw-…`, the one name a conversation keeps across restarts — its `sess-` id is minted again
 * at a dtach restore). The session meta's `poolPin` follows at its pace; the boot takes the record when the meta holds no pin or
 * an older one (`pinAtBoot`, called by the two LOCAL restore sites of src/server/boot-restore.js — the third, an ssh readopt,
 * restores a remote conversation, which can never hold a pin). An older tree's data (no folder) reads as before: the meta only.
 * NOT beside the pool link (data/pool-links/<poolId>/): that folder's walkers read every entry as a session link — the boot's
 * sweep, the sealed orders handed to the device agent, the long-lived-token check. A record whose conversation is gone (no meta)
 * leaves with the links' boot sweep (src/accounts.js sweepSessionPoolLinks). Gate: scripts/test-pool-pin-durable.mjs.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEMBER_RE = /^[\w.:-]{1,120}$/;
const TEXT_RE = /^([\w.:-]{1,120})#(\d{1,16})#([\w:.-]{1,64})$/;
const dirOf = (dataDir, poolId) => path.join(dataDir, 'pool-pins', String(poolId).replace(/[^\w-]/g, ''));
const recordPath = (dataDir, poolId, key) => path.join(dirOf(dataDir, poolId), String(key).replace(/[^\w.-]/g, ''));
/** The pin `{memberId, at, by}` ⇄ the record's text (null: not a pin / not a record). */
function textOf(pin) {
  if (!pin || !MEMBER_RE.test(String(pin.memberId || ''))) return null;
  const at = Number(pin.at) > 0 ? Math.floor(Number(pin.at)) : 0;
  const by = String(pin.by || 'user').replace(/[^\w:.-]/g, '').slice(0, 64) || 'user';
  return `${pin.memberId}#${at}#${by}`;
}
function pinOf(text) {
  const m = TEXT_RE.exec(String(text || ''));
  return m ? { memberId: m[1], at: Number(m[2]), by: m[3] } : null;
}
/** Write ONE conversation's record (`pin` null ⇒ remove it) — synchronous; THROWS when it cannot (the caller refuses the pin:
 *  nothing changed). → {file, written|removed}. */
function write(dataDir, poolId, key, pin) {
  const file = recordPath(dataDir, poolId, key);
  if (!pin) { try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } return { file, removed: true }; }
  const text = textOf(pin);
  if (!text) throw new Error('not a pin: ' + String(JSON.stringify(pin)).slice(0, 120));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.swap-' + crypto.randomBytes(4).toString('hex');
  fs.symlinkSync(text, tmp);
  try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
  return { file, written: true };
}
/** ONE conversation's record → the pin | null (none, or a text that does not read — never a guess). */
function read(dataDir, poolId, key) {
  try { return pinOf(fs.readlinkSync(recordPath(dataDir, poolId, key))); } catch { return null; }
}
/** THE BOOT: the meta's pin or the record's (of the meta's OWN pool), whichever is newer by `at` — written into the meta in
 *  place, before the restore builds the session from it (sessionFromMeta's ONE pin expression then reads it). A meta that says
 *  `poolPin: null` (a pin CLEARED) carries no time: there the two FILES are compared by their own mtimes (one filesystem, one
 *  clock) — a meta written after the record is a clear the record never heard of (an older release cleared it; this release's
 *  own clear unlinks the record), and it stands. → the record taken | null (the meta's own pin stands, or there is none). */
function pinAtBoot(dataDir, meta, key) {
  if (!dataDir || !meta || typeof meta !== 'object' || !meta.accountId || !key) return null;
  const rec = read(dataDir, meta.accountId, key);
  if (!rec) return null;
  const mp = meta.poolPin && typeof meta.poolPin === 'object' && typeof meta.poolPin.memberId === 'string' ? meta.poolPin : null;
  if (mp && Number(mp.at || 0) >= rec.at) return null;
  if (!mp && meta.poolPin === null) {
    try {
      const mt = fs.statSync(path.join(dataDir, 'session-meta', String(key).replace(/[^\w.-]/g, '') + '.json')).mtimeMs;
      if (mt > fs.lstatSync(recordPath(dataDir, meta.accountId, key)).mtimeMs) return null;
    } catch { /* a file that cannot be read gives no time — the record (the person's last act this release saw) stands */ }
  }
  meta.poolPin = { memberId: rec.memberId, at: rec.at, by: rec.by };
  return rec;
}
/** The records whose conversation is gone (`keep(key)` false — its meta is not on disk) — removed. → how many. */
function sweep(dataDir, keep) {
  const root = path.join(dataDir, 'pool-pins');
  let dropped = 0;
  let pools = [];
  try { pools = fs.readdirSync(root); } catch { return 0; }
  for (const p of pools) {
    const dir = path.join(root, p);
    let keys = [];
    try { keys = fs.readdirSync(dir); } catch { continue; }
    for (const k of keys) if (/\.swap-[0-9a-f]{8}$/.test(k) || !keep(k)) { try { fs.unlinkSync(path.join(dir, k)); dropped++; } catch { } }
    try { if (!fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch { }
  }
  return dropped;
}
module.exports = { recordPath, textOf, pinOf, write, read, pinAtBoot, sweep };
