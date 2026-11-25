'use strict';
// THE FROZEN READER (B-360d, the coordinator's r1319 «a rollback to the release reads what you leave»): the poll stamps' LOAD of
// 2.369.414 (a117cebb8, src/channel-store.js — the side file's validator, its map fill and the journal's replay, copied
// VERBATIM in their order; only the scaffolding around them is new). test-channel-store-writer-laws (m6) reads the files the
// compaction leaves through it — a store rolled back to that release reads every stamp. A FIXTURE, not `git show`: a hosted
// run's checkout is shallow, and the rollback leg must run there too. Never edit the copied lines; a later release that
// changes its reader adds its own frozen copy beside this one.
const fs = require('fs');
const path = require('path');
const STAMP_KEYS = Object.freeze(['lastPollAt', 'lastScanAt', 'walkStartedAt']);

function readStamps(dir) {
  const stampsFile = path.join(dir, 'poll-stamps.json'), stampsLog = path.join(dir, 'poll-stamps.log');
  // the release's loadJsonFamily, its reading half (a file it cannot read as its shape is set aside there: «aside» here)
  const loadJsonFamily = (file, valid, empty) => {
    let text; try { text = fs.readFileSync(file, 'utf-8'); } catch (e) { return { value: empty(), blocked: null, missing: !!(e && e.code === 'ENOENT') }; }
    let v; try { v = JSON.parse(text); } catch { return { value: empty(), blocked: null, aside: 'corrupt JSON' }; }
    if (!valid(v)) return { value: empty(), blocked: null, aside: 'not the expected shape' };
    return { value: v, blocked: null };
  };
  let journalTorn = false;
  const journalStats = { replayed: 0, torn: 0 };
  // ── copied verbatim from 2.369.414 (a117cebb8) src/channel-store.js ──
  const psLoad = loadJsonFamily(stampsFile, (v) => v && typeof v === 'object' && v.v === 1 && Array.isArray(v.fields) && v.fields.includes('lastPollAt') && v.stamps && typeof v.stamps === 'object' && !Array.isArray(v.stamps), () => null);
  const stampMap = new Map();   // key -> { lastPollAt?, lastScanAt?, walkStartedAt? } (an instant > 0, or absent)
  let unreadStamps = 0;        // entries of a readable file that are not a row of instants — said by count below
  if (psLoad.value) {
    const at = psLoad.value.fields.map((f) => STAMP_KEYS.indexOf(f));
    for (const [k, arr] of Object.entries(psLoad.value.stamps)) {
      if (!Array.isArray(arr)) { unreadStamps++; continue; }
      const st = {};
      at.forEach((x, i) => { if (x >= 0 && Number(arr[i]) > 0) st[STAMP_KEYS[x]] = Number(arr[i]); });
      if (Object.keys(st).length) stampMap.set(k, st);
    }
  }
  {   // the journal replayed over the side file, in order — a kill since its last write lost no stamp
    let text = '';
    try { text = fs.readFileSync(stampsLog, 'utf8'); } catch { /* none: the side file is the whole truth */ }
    if (text && !text.endsWith('\n')) journalTorn = true;   // a tail a kill cut short: the next line starts on its own
    for (const ln of text.split('\n')) {
      if (!ln) continue;
      let a = null;
      try { a = JSON.parse(ln); } catch { /* a line a kill cut short */ }
      if (!Array.isArray(a) || a.length !== 1 + STAMP_KEYS.length || typeof a[0] !== 'string') { journalStats.torn++; continue; }
      const st = {};
      STAMP_KEYS.forEach((f, i) => { if (Number(a[i + 1]) > 0) st[f] = Number(a[i + 1]); });
      if (Object.keys(st).length) stampMap.set(a[0], st); else stampMap.delete(a[0]);
      journalStats.replayed++;
    }
  }
  // ── end of the copied lines ──
  return { map: stampMap, side: psLoad, unreadStamps, journalTorn, journalStats };
}

module.exports = { readStamps, RELEASE: '2.369.414', SHA: 'a117cebb8' };
