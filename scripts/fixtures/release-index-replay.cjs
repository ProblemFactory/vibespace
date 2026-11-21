'use strict';
// THE RELEASE'S OWN REPLAY, FROZEN (row B-360d unit 1, law 7 of 主开发's ruling wi1q6956v: «A ROLLBACK FINDS EVERYTHING»).
// src/channel-store.js lines 448-465 at the release a117cebb8 (2.369.414), copied BY TEXT — the CI mirror is a shallow clone,
// so the release is never read by its sha. A hub of that release, opening a folder the new store left, parses index.json and
// replays index-acts.ndjson exactly as below. NEVER EDIT THIS FILE TO FOLLOW THE PRODUCT: it IS the old reader; a leg that
// goes red here means a released hub would read the folder differently.
function releaseLoad(indexText, journalText) {
  const ix = JSON.parse(indexText);
  let actSeq = Number(ix.actsSeq) > 0 ? Number(ix.actsSeq) : 0, actsReplayed = 0;
  const actLines = [];
  const text = journalText == null ? null : String(journalText);
    const held = actSeq;
    let skippedHeld = 0, unreadable = 0, wrongShape = 0, backwards = 0, last = held, partialRows = 0, wrongTop = 0;
    const kindOf = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);
    const lines = (text || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      let o = null; try { o = JSON.parse(line); } catch { o = null; }
      if (!o) { unreadable++; continue; }   // not JSON: a line cut short
      if (!Number.isInteger(o.seq) || !o.rows || typeof o.rows !== 'object' || Array.isArray(o.rows) || Object.values(o.rows).some((row) => row !== null && (typeof row !== 'object' || Array.isArray(row)))) { wrongShape++; continue; }   // round 3 (smaller 7): JSON, but not an act's line — said as such
      if (o.seq <= held) { skippedHeld++; continue; }   // the index holds it already
      if (o.seq <= last) { backwards++; continue; }      // out of order: never applied over a later act
      // round 4 (true words 5): the load SAYS a row that is not a whole conversation row (no key of its own — applied as
      // written, over the whole one) and a top-level table of another type than the index's own (NOT applied: the index's kept)
      for (const [k, row] of Object.entries(o.rows)) { if (row === null) delete ix.conversations[k]; else if (row && typeof row === 'object') { if (row.key !== k) partialRows++; ix.conversations[k] = row; } }
      if (o.top && typeof o.top === 'object') for (const [k, v] of Object.entries(o.top)) if (k !== 'conversations' && !k.startsWith('_')) { if (ix[k] !== undefined && kindOf(ix[k]) !== kindOf(v)) { wrongTop++; continue; } ix[k] = v; }
      actLines.push({ seq: o.seq, text: line + '\n' }); last = actSeq = Math.max(actSeq, o.seq); actsReplayed++;
    }
  return { ix, actSeq, actsReplayed };
}
module.exports = { releaseLoad };
