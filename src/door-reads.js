'use strict';
// THE `.door-reads-<key>` SIDECAR'S OWNER (lane usage-predict, 2026-11-15): how often the on-demand usage door
// (src/server/cli-usage-door.js) ran an account's CLI today, by caller — a person's press (`person`), a usage wall its
// conversation named (`wall`), the end of a stretch of work (`afterTurn`) — and when it last ran. ONE writer
// (bumpDoorRead: the door, BEFORE its spawn — the count is written first, and a count that could not be written refuses the
// read), ONE reader (readDoorReads). MEMORY IS AUTHORITATIVE once a key is read (the store writer's law): the file is written
// on the writer's own thread (src/store-writer.js `dirty` / `durable`), never synchronously on the hub's loop.
// It is ON DISK so a hub restart can add no read: the after-turn read's 30-minute ceiling and the wall's re-read are counted
// from `lastReadAt` — the later of the account's last RECORDED reading (its cache file's `fetchedAt`) and the door's last run
// (a run that wrote nothing counts too: it was a request all the same). The day is the hub's local day (the row says «today»).
const fs = require('fs');
const path = require('path');

const CALLERS = Object.freeze(['person', 'wall', 'afterTurn']);
const mem = new Map();   // the sidecar's path → its record (null = read, absent on disk)
const STORE_WRITER = () => require('./store-writer.js').storeWriter();
const LOG = (l) => console.log(l);

function doorReadsSidecarName(key) { return '.door-reads-' + String(key).replace(/[^\w.-]/g, '_'); }
function dayOf(ms) {
  const d = new Date(Number(ms));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const fileOf = (cacheDir, key) => path.join(cacheDir, doorReadsSidecarName(key));

/** THE ONE READER: the account's record — memory once read, else the file (absent, unreadable, not an object ⇒ null). */
function readDoorReads(cacheDir, key) {
  const f = fileOf(cacheDir, key);
  if (mem.has(f)) return mem.get(f);
  let j = null;
  try { j = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { j = null; }
  const rec = j && typeof j === 'object' && !Array.isArray(j) ? j : null;
  mem.set(f, rec);
  return rec;
}

/** Today's count by caller (zeros when the record is another day's) and the last run. PURE. */
function todayOf(rec, nowMs) {
  const same = !!rec && rec.day === dayOf(nowMs);
  const out = { day: dayOf(nowMs), total: 0, lastAt: (rec && Number(rec.lastAt)) || null };
  for (const c of CALLERS) { out[c] = same ? Math.max(0, Math.floor(Number(rec[c]) || 0)) : 0; out.total += out[c]; }
  return out;
}

/** THE ONE WRITER: one run of the door for `caller`, at `atMs` — in memory at once, on disk through the store writer.
 *  → a promise of true when the record is on disk, false when its write failed (the door then refuses the read). */
function bumpDoorRead(cacheDir, key, caller, atMs, opts = {}) {
  const writer = opts.writer || STORE_WRITER, log = opts.log || LOG;
  if (!CALLERS.includes(caller)) throw new Error(`door-reads: unknown caller ${JSON.stringify(caller)}`);
  const f = fileOf(cacheDir, key), prev = readDoorReads(cacheDir, key);
  const t = todayOf(prev, atMs);
  const next = { day: t.day, person: t.person, wall: t.wall, afterTurn: t.afterTurn, lastAt: Math.max(Number(atMs) || 0, Number(prev && prev.lastAt) || 0), lastBy: caller };
  next[caller] += 1;
  mem.set(f, next);
  // a count that is not on disk is no count: memory goes back to what the file holds (the refused read never ran)
  const undo = () => { if (mem.get(f) === next) mem.set(f, prev); return false; };
  let w = null;
  try {
    w = typeof writer === 'function' ? writer() : writer;   // the store writer, or (suites) an object with its two verbs
    w.dirty(f, { name: 'door-reads.write', rank: 0, produce: () => JSON.stringify(mem.get(f)),
      onWritten: (ok, e) => { if (!ok) log(`[door-reads] ${f}: its write failed (${(e && (e.code || e.message)) || e})`); } });
  } catch (e) { log(`[door-reads] ${f}: the writer threw (${e.message}) — not counted`); return Promise.resolve(undo()); }   // a throw is a failed write too
  return Promise.resolve(w.durable(f)).then((ok) => (ok === true ? true : undo()), undo);
}

/** The account's last read, by any caller: the later of its recorded reading and the door's last run. */
function lastReadAt(cacheDir, key, usageWrite = require('./usage-cache-write.js')) {
  let rec = 0;
  try { rec = Number((usageWrite.readCacheObject(cacheDir, key) || {}).fetchedAt) || 0; } catch { rec = 0; }
  const d = readDoorReads(cacheDir, key);
  return Math.max(rec, Number(d && d.lastAt) || 0);
}
/** THE ROW /api/usage serves for an on-demand account (PURE): its reading and today's count — an account with NO reading but
 *  reads today is served too (law A3: an account whose reads all fail shows its count); neither ⇒ null. */
function homeAccountEntry(cache, reads) {
  const has = !!(cache && Array.isArray(cache.limits) && cache.limits.length);
  if (!has && !(reads && reads.total)) return null;
  return { limits: has ? cache.limits : [], fetchedAt: (has && cache.fetchedAt) || null, source: (has && cache.source) || null,
    windowNames: has && cache.windowNames && typeof cache.windowNames === 'object' ? cache.windowNames : null, reads };
}
/** Suites only: forget what memory holds (a «restart» of the reader). */
function _forget() { mem.clear(); }

module.exports = { CALLERS, doorReadsSidecarName, dayOf, readDoorReads, todayOf, bumpDoorRead, lastReadAt, homeAccountEntry, _forget };
