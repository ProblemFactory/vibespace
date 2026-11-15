'use strict';
// THE `.door-reads-<key>` SIDECAR'S OWNER (lane usage-predict, 2026-11-15): how often the on-demand usage door
// (src/server/cli-usage-door.js) ran an account's CLI today, by caller — a person's press (`person`), a usage wall its
// conversation named (`wall`), the end of a stretch of work (`afterTurn`) — and when it last ran. ONE writer
// (bumpDoorRead: the door, just before its spawn), ONE reader (readDoorReads). It is ON DISK so a hub restart can add no
// read: the after-turn read's 30-minute ceiling and the wall's re-read are counted from `lastReadAt` — the later of the
// account's last RECORDED reading (its cache file's `fetchedAt`) and the door's last run (a run that wrote nothing counts
// too: it was a request all the same). The day is the hub's local day (the account row says «today»).
const fs = require('fs');
const path = require('path');

const CALLERS = Object.freeze(['person', 'wall', 'afterTurn']);

function doorReadsSidecarName(key) { return '.door-reads-' + String(key).replace(/[^\w.-]/g, '_'); }
function dayOf(ms) {
  const d = new Date(Number(ms));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** THE ONE READER: the account's sidecar, or null (absent, unreadable, not an object). */
function readDoorReads(cacheDir, key) {
  try { const j = JSON.parse(fs.readFileSync(path.join(cacheDir, doorReadsSidecarName(key)), 'utf-8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch { return null; }
}

/** Today's count by caller (zeros when the sidecar is another day's) and the last run. PURE. */
function todayOf(rec, nowMs) {
  const same = !!rec && rec.day === dayOf(nowMs);
  const out = { day: dayOf(nowMs), total: 0, lastAt: (rec && Number(rec.lastAt)) || null };
  for (const c of CALLERS) { out[c] = same ? Math.max(0, Math.floor(Number(rec[c]) || 0)) : 0; out.total += out[c]; }
  return out;
}

/** THE ONE WRITER: one run of the door for `caller`, at `atMs`. */
function bumpDoorRead(cacheDir, key, caller, atMs, usageWrite = require('./usage-cache-write.js')) {
  if (!CALLERS.includes(caller)) throw new Error(`door-reads: unknown caller ${JSON.stringify(caller)}`);
  const prev = readDoorReads(cacheDir, key);
  const t = todayOf(prev, atMs);
  const next = { day: t.day, person: t.person, wall: t.wall, afterTurn: t.afterTurn, lastAt: Math.max(Number(atMs) || 0, Number(prev && prev.lastAt) || 0), lastBy: caller };
  next[caller] += 1;
  return usageWrite.writeSidecar(cacheDir, doorReadsSidecarName(key), next);
}

/** The account's last read, by any caller, as kept on disk: the later of its recorded reading and the door's last run. */
function lastReadAt(cacheDir, key, usageWrite = require('./usage-cache-write.js')) {
  let rec = 0;
  try { rec = Number((usageWrite.readCacheObject(cacheDir, key) || {}).fetchedAt) || 0; } catch { rec = 0; }
  const d = readDoorReads(cacheDir, key);
  return Math.max(rec, Number(d && d.lastAt) || 0);
}

module.exports = { CALLERS, doorReadsSidecarName, dayOf, readDoorReads, todayOf, bumpDoorRead, lastReadAt };
