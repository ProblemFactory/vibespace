'use strict';
/**
 * THE PERSON'S POOL PIN, ON DISK BEFORE ITS ANSWER (lane lg-group-parents, B-526c unit 2; its cure, 主开发 r1070) — synchronous, small.
 * THE LAW: the record is THE ONE TRUTH of what the person last chose, and it says both things — «pinned to this member» and
 * «cleared» (automatic) — each with its time and who; the session meta's `poolPin` is its COPY.
 *   data/pool-pins/<poolId>/<sockName>   a symlink whose TARGET TEXT is `<memberId>#<at>#<by>` or `*cleared#<at>#<by>` (symlink +
 *                                        rename — the pool link's own primitive, atomic); a clear WRITES its mark, never removes
 * keyed by the conversation's meta name (`cw-…`, the one name a conversation keeps across restarts). The pin route writes the
 * record before anything else changes and refuses by name when it cannot (`pin_not_saved`, nothing changed); the meta's copy
 * follows at its pace (a pin `{memberId, at, by}`, a clear `{cleared: true, at, by}` — an older reader sees no pin in it).
 * THE BOOT (restorePin, at the two LOCAL restore sites of src/server/boot-restore.js — the ssh readopt restores a remote
 * conversation, which can never hold a pin): the record DECIDES whenever it exists, and its decision is written back into the
 * meta at that boot (paced; the record stays). ONE BOUND, where no record of this tree's making can tell: an OLDER hub (a
 * downgrade and back) writes only the meta — a later pin of its own carries a later `at` (it wins), and its CLEAR is a bare
 * `poolPin: null`, which this tree never writes; only there are the two FILES' times compared (one filesystem, one clock): a
 * meta written after the record stands, a tie goes to the record. No record (an older tree's data) ⇒ the meta, as before. A
 * record that exists and cannot be read is said by name at the boot (the meta's pin is used). The boot reads each pool's
 * folder ONCE (one listing a pool). Every call is booked by the tree's timed wrapper (src/timed-sync.js — a hold on a data
 * folder that is a network mount is at least seen; a synchronous call is never cut short: a write that fails refuses the pin).
 * NOT beside the pool link (data/pool-links/<poolId>/): that folder's walkers read every entry as a session link. A record whose
 * conversation is gone (no meta) leaves with the links' boot sweep (src/accounts.js sweepSessionPoolLinks).
 * Gate: scripts/test-pool-pin-durable.mjs.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { timedSync } = require('./timed-sync.js');

const MEMBER_RE = /^[\w.:-]{1,120}$/;
const CLEARED = '*cleared';
const TEXT_RE = /^(\*cleared|[\w.:-]{1,120})#(\d{1,16})#([\w:.-]{1,64})$/;
const dirOf = (dataDir, poolId) => path.join(dataDir, 'pool-pins', String(poolId).replace(/[^\w-]/g, ''));
const keyOf = (key) => String(key).replace(/[^\w.-]/g, '');
const recordPath = (dataDir, poolId, key) => path.join(dirOf(dataDir, poolId), keyOf(key));
const byOf = (by) => String(by || 'user').replace(/[^\w:.-]/g, '').slice(0, 64) || 'user';
/** The record `{memberId, at, by}` | `{cleared: true, at, by}` ⇄ its text (null: not a record). */
function textOf(rec) {
  if (!rec) return null;
  const at = Number(rec.at) > 0 ? Math.floor(Number(rec.at)) : 0;
  if (rec.cleared === true) return `${CLEARED}#${at}#${byOf(rec.by)}`;
  if (!MEMBER_RE.test(String(rec.memberId || ''))) return null;
  return `${rec.memberId}#${at}#${byOf(rec.by)}`;
}
function pinOf(text) {
  const m = TEXT_RE.exec(String(text || ''));
  if (!m) return null;
  return m[1] === CLEARED ? { cleared: true, at: Number(m[2]), by: m[3] } : { memberId: m[1], at: Number(m[2]), by: m[3] };
}
/** Write ONE conversation's record (a pin, or a clear's mark) — synchronous; THROWS when it cannot (the caller refuses the pin:
 *  nothing changed). → {file, written}. */
function write(dataDir, poolId, key, rec) {
  const file = recordPath(dataDir, poolId, key);
  const text = textOf(rec);
  if (!text) throw new Error('not a pin record: ' + String(JSON.stringify(rec)).slice(0, 120));
  timedSync('pool-pin.write', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.swap-' + crypto.randomBytes(4).toString('hex');
    fs.symlinkSync(text, tmp);
    try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
  });
  return { file, written: true };
}
/** ONE conversation's record → {rec | null, error: a code | null}: none (no file — or no name in the pool's ONE listing, when the
 *  boot hands `listing`, a Map dir → Set | the listing's error) is `rec: null, error: null`; a record that exists and does not
 *  read is said by its code — never «no record» in silence. */
function read(dataDir, poolId, key, listing = null) {
  const dir = dirOf(dataDir, poolId), k = keyOf(key);
  if (listing) {
    if (!listing.has(dir)) {
      let names = null;
      try { names = new Set(timedSync('pool-pin.read', () => fs.readdirSync(dir))); } catch (e) { names = e && e.code === 'ENOENT' ? new Set() : { error: (e && e.code) || 'EIO' }; }
      listing.set(dir, names);
    }
    const l = listing.get(dir);
    if (l && l.error) return { rec: null, error: l.error };
    if (!l.has(k)) return { rec: null, error: null };
  }
  try {
    const text = timedSync('pool-pin.read', () => fs.readlinkSync(path.join(dir, k)));
    const rec = pinOf(text);
    return rec ? { rec, error: null } : { rec: null, error: 'unreadable text' };
  } catch (e) { return e && e.code === 'ENOENT' ? { rec: null, error: null } : { rec: null, error: (e && e.code) || 'EIO' }; }
}
/** The meta's COPY of a record: a pin `{memberId, at, by}`, a clear `{cleared: true, at, by}`. */
const copyOf = (rec) => (rec.cleared ? { cleared: true, at: rec.at, by: rec.by } : { memberId: rec.memberId, at: rec.at, by: rec.by });
/** WHO DECIDES (PURE): the record whenever it exists — but an OLDER hub's act after it: a later pin of its own (a later `at`), or
 *  its clear, a bare `null` this tree never writes, written after the record (`metaAfter`, the files' own times; a tie → the
 *  record). → 'record' | 'meta'. */
function decide(rec, metaPin, { metaAfter = false } = {}) {
  if (!rec) return 'meta';
  if (metaPin && typeof metaPin === 'object' && typeof metaPin.memberId === 'string' && Number(metaPin.at) > rec.at) return 'meta';
  if (metaPin === null && metaAfter) return 'meta';
  return 'record';
}
/** THE BOOT, at a local restore site: the record decides, its decision is written into the meta in place (the restore then
 *  builds the session from it — a clear's copy reads as no pin) and, where the meta said otherwise, written BACK through
 *  `write(meta)` (paced; the record stays). → {from: 'record' | 'meta', rec, wroteBack} | null (no record). */
function restorePin(dataDir, meta, key, { listing = null, write: writeMeta = null, say = null } = {}) {
  if (!dataDir || !meta || typeof meta !== 'object' || !meta.accountId || !key) return null;
  const { rec, error } = read(dataDir, meta.accountId, key, listing);
  if (error && say) say(`[pool] the pin record of ${keyOf(key)} could not be read (${error}) — the session meta's pin is used`);
  if (!rec) return null;
  const mp = meta.poolPin === undefined ? undefined : meta.poolPin;
  let metaAfter = false;
  if (mp === null) {
    try {
      const mt = timedSync('pool-pin.read', () => fs.statSync(path.join(dataDir, 'session-meta', keyOf(key) + '.json')).mtimeMs);
      metaAfter = mt > timedSync('pool-pin.read', () => fs.lstatSync(recordPath(dataDir, meta.accountId, key)).mtimeMs);
    } catch { /* a time that cannot be read gives none — the record (this tree's last act) decides */ }
  }
  if (decide(rec, mp, { metaAfter }) === 'meta') return { from: 'meta', rec, wroteBack: false };
  const copy = copyOf(rec);
  const same = JSON.stringify(mp) === JSON.stringify(copy);
  meta.poolPin = copy;
  if (!same && typeof writeMeta === 'function') { try { writeMeta(meta); } catch (e) { if (say) say(`[pool] the pin of ${keyOf(key)} could not be written back into its meta (${(e && e.code) || (e && e.message) || e}) — the record still decides at the next boot`); } }
  return { from: 'record', rec, wroteBack: !same };
}
/** The records whose conversation is gone (`keep(key)` false — its meta is not on disk) and half-made swaps — removed. → how many. */
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
module.exports = { recordPath, textOf, pinOf, write, read, copyOf, decide, restorePin, sweep, CLEARED };
