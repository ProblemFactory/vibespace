'use strict';
// THE LEDGER ROWS READ WHERE THEY LIVE (B-9428 r2/r3). The cold columns (cache-bounds.js ColdSlab) and the
// hot cache record each row's place (shard + byte offset), so a reader asks for EXACTLY the rows the cache
// holds, in their ts order — never a shard picked by its name, no dedup to redo. r3 (verify #10/#11): a place
// can go STALE (a shard rewritten under the cache), so every line read is VERIFIED — it must start a line and
// parse to the ts + rid hash the cache recorded; anything else throws STALE (the caller rebuilds and re-runs),
// never a torn fragment folded as a row. A shard that vanished (verify #13) counts its rows as missing.
// Sync on purpose: the server runs it in usage-cold-worker.js (off the loop); aggregate() / rows() on the
// loop are the DECLARED sync readers (a migration, a test).
const fs = require('fs');
const path = require('path');
const { idHash, COLD_ROW_BUDGET } = require('./cache-bounds.js');

const CHUNK = 2 * 1024 * 1024;
const stale = (why) => Object.assign(new Error('a ledger place went stale: ' + why), { code: 'STALE' });

/** Fill lines[ord[k]] for k in [k0, k1) (offsets ascending, one shard). A missing file ⇒ false (the caller
 *  counts the rows); a place that does not start a line ⇒ STALE. */
function readLinesAt(fp, off, ord, k0, k1, lines) {
  let fd;
  try { fd = fs.openSync(fp, 'r'); } catch (e) { if (e && e.code === 'ENOENT') return false; throw e; }
  try {
    let k = k0, base = -1, buf = Buffer.alloc(0);
    while (k < k1) {
      const o = off[ord[k]];
      if (base < 0 || o <= base || o >= base + buf.length) { base = o > 0 ? o - 1 : 0; buf = Buffer.alloc(0); } // jump: never read the gap (keep the byte before)
      let nl = buf.length ? buf.indexOf(10, o - base) : -1;
      while (nl < 0) { // the line runs past what we hold: read the next chunk behind it
        const more = Buffer.alloc(CHUNK);
        const got = fs.readSync(fd, more, 0, CHUNK, base + buf.length);
        if (got <= 0) break;
        buf = buf.length ? Buffer.concat([buf, more.subarray(0, got)]) : more.subarray(0, got);
        nl = buf.indexOf(10, o - base);
        if (buf.length > 64 * CHUNK && nl < 0) break;
      }
      if (o > 0 && buf[o - base - 1] !== 10) throw stale(`${path.basename(fp)}@${o} does not start a line`);
      if (nl < 0) throw stale(`${path.basename(fp)}@${o} has no line end`);
      lines[ord[k]] = buf.toString('utf8', o - base, nl);
      if (o - base > CHUNK) { buf = buf.subarray(o - base - 1); base = o - 1; } // drop what is behind us
      k++;
    }
  } finally { fs.closeSync(fd); }
  return true;
}

/** Parse + verify one line against the place's record (ts, rid hash): the row, or STALE. */
function verified(line, ts, rh, where) {
  if (idHash(line) !== rh) throw stale(where + ' holds another line'); // r4: the WHOLE line's hash (an in-place edit too)
  let ev; try { ev = JSON.parse(line); } catch { throw stale(where + ' is not a row'); }
  if (!ev || (ev.ts || 0) !== ts) throw stale(where + ' holds another row');
  return ev;
}

/** Read `n` places (sh[], off[]) → lines[] (null for a vanished shard, counted in stats.missing). */
function readPlaces(dir, shards, sh, off, n, stats) {
  const ord = new Uint32Array(n);
  for (let i = 0; i < n; i++) ord[i] = i;
  ord.sort((a, b) => (sh[a] - sh[b]) || (off[a] - off[b]));
  const lines = new Array(n).fill(null);
  for (let k = 0; k < n;) {
    const s = sh[ord[k]];
    let k2 = k;
    while (k2 < n && sh[ord[k2]] === s) k2++;
    if (!readLinesAt(path.join(dir, shards[s]), off, ord, k, k2, lines)) { stats.missing += k2 - k; stats.missingShards.add(shards[s]); }
    k = k2;
  }
  return lines;
}

/** The cold rows of a walk {dir, shards, groups: [{sh, off, ts, rh}]} in order, each verified. */
function* coldRows({ dir, shards, groups, rowBudget = COLD_ROW_BUDGET }, stats = { missing: 0, missingShards: new Set() }) {
  for (const g of groups) {
    // r4 (verify #5): a group (a month) is materialised rowBudget rows at a time, never whole
    for (let a = 0; a < g.off.length; a += rowBudget) {
      const b = Math.min(g.off.length, a + rowBudget), n = b - a;
      const sh = g.sh.subarray(a, b), off = g.off.subarray(a, b);
      const lines = readPlaces(dir, shards, sh, off, n, stats);
      for (let i = 0; i < n; i++) {
        if (lines[i] === null) continue;
        const ev = verified(lines[i], g.ts[a + i], g.rh[a + i], `${shards[sh[i]]}@${off[i]}`);
        lines[i] = null;
        yield ev;
      }
    }
  }
}

/** The HOT rows {tss, locs, rh, objs} in the hot cache's order (ts||0, then load order) within [from, to]:
 *  read at their place and verified, or handed over whole (objs[i]) when they have no place. */
function* hotRows({ dir, shards, hot, from, to }, stats = { missing: 0, missingShards: new Set() }) {
  const n = hot.tss.length, ord = new Uint32Array(n);
  for (let i = 0; i < n; i++) ord[i] = i;
  ord.sort((a, b) => (hot.tss[a] - hot.tss[b]) || (a - b));
  const want = [];
  for (let k = 0; k < n; k++) { const i = ord[k], t = hot.tss[i]; if (from && t < from) continue; want.push(i); }
  const placed = want.filter((i) => !Number.isNaN(hot.locs[i]));
  const sh = new Uint8Array(placed.length), off = new Uint32Array(placed.length), at = new Map();
  placed.forEach((i, k) => { sh[k] = Math.floor(hot.locs[i] / 4294967296); off[k] = hot.locs[i] % 4294967296; at.set(i, k); });
  const lines = readPlaces(dir, shards, sh, off, placed.length, stats);
  for (const i of want) {
    let ev;
    if (at.has(i)) { const k = at.get(i); if (lines[k] === null) continue; ev = verified(lines[k], hot.tss[i], hot.rh[i], `${shards[sh[k]]}@${off[k]}`); lines[k] = null; }
    else ev = hot.objs[i];
    if (to && ev.ts > to) break;
    yield ev;
  }
}

/** Cold rows then hot rows by ts: a hot row goes before a cold row of a later-or-equal ts (only a row the
 *  columns cannot hold sits below the cutoff) — the order aggregate() folds in. */
function* mergedRows(cold, hot) {
  const h = hot[Symbol.iterator]();
  let x = h.next();
  for (const ev of cold) {
    while (!x.done && (x.value.ts || 0) <= ev.ts) { yield x.value; x = h.next(); }
    yield ev;
  }
  while (!x.done) { yield x.value; x = h.next(); }
}

/** ONE line at a place, ≤ 64 KB a read — async (the meta popup) and sync (a hash hit's string compare on
 *  the loader's pass, verify #4: a hash hit is never an identity). null when it is not a whole line. */
async function readLineAt(fp, off) {
  let fh; try { fh = await fs.promises.open(fp, 'r'); } catch { return null; }
  try {
    let buf = Buffer.alloc(0);
    const start = off > 0 ? off - 1 : 0;
    for (;;) {
      const more = Buffer.alloc(65536);
      const { bytesRead } = await fh.read(more, 0, more.length, start + buf.length);
      if (bytesRead <= 0) return null;
      buf = Buffer.concat([buf, more.subarray(0, bytesRead)]);
      if (off > 0 && buf[0] !== 10) return null;
      const nl = buf.indexOf(10, off - start);
      if (nl >= 0) return buf.toString('utf8', off - start, nl);
    }
  } finally { await fh.close(); }
}
function readLineAtSync(fp, off) {
  let fd; try { fd = fs.openSync(fp, 'r'); } catch { return null; }
  try {
    let buf = Buffer.alloc(0);
    const start = off > 0 ? off - 1 : 0;
    for (;;) {
      const more = Buffer.alloc(65536);
      const got = fs.readSync(fd, more, 0, more.length, start + buf.length);
      if (got <= 0) return null;
      buf = Buffer.concat([buf, more.subarray(0, got)]);
      if (off > 0 && buf[0] !== 10) return null;
      const nl = buf.indexOf(10, off - start);
      if (nl >= 0) return buf.toString('utf8', off - start, nl);
    }
  } finally { fs.closeSync(fd); }
}

module.exports = { coldRows, hotRows, mergedRows, readLinesAt, readLineAt, readLineAtSync, verified, CHUNK };
