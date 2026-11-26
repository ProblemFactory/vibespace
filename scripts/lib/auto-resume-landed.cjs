'use strict';
// Row B-9a24 R9 / B-574d (lane lg-store-writes, 主开发 r4350): auto-resume.json is written by THE STORE WRITER (src/server/auto-resume.js
// save(): dirty + produce, off the main thread). A SUITE that reads the file right after an act, or starts a second instance over the
// same folder (a restart in process), calls landEveryAutoResumeSave() once: the process's own store writer (the one every instance and
// every copy of the module reaches) then follows each auto-resume.json dirty() with its synchronous flush of that one file, on the
// SUITE's thread — the bytes on disk are the product's own write, never a suite's copy. Other stores are untouched.
const path = require('path');
const SW = require(path.join(__dirname, '..', '..', 'src', 'store-writer.js'));
// r4812 REQUIRED 2 (the product's landing reads «this store is among the files the flush WROTE»): the record step saves and then flushes
// that one file in one run. The landing here writes that very version inside the save, so the product's own flush finds nothing left to
// write; its answer then names the write this landing really made, ONLY while the store is still at that version and clean. A hand-over
// that threw leaves no landing to name (the last one is forgotten before each hand-over), so the product refuses as it would alone.
function landEveryAutoResumeSave() {
  const W = SW.storeWriter();
  if (W._autoResumeLanded) return W;
  const isAR = (f) => path.basename(String(f)) === 'auto-resume.json';
  const row = (file) => W.stats().find((x) => x.file === file) || null;
  const landed = new Map();   // file → { version, written }: this landing's own write of that version
  const dirty0 = W.dirty, flush0 = W.flushSync;
  W.dirty = function (file, opts) {
    if (isAR(file)) landed.delete(file);
    const r = dirty0.call(this, file, opts);
    if (isAR(file)) {
      try {
        const v = row(file) ? row(file).version : null;
        const f = flush0.call(W, [file], { waitedBy: 'a suite: auto-resume.json read right after an act' });
        if (v != null && f && !f.deferred && Array.isArray(f.written) && f.written.length && !(f.left || []).length) landed.set(file, { version: v, written: f.written.slice() });
      } catch { }
    }
    return r;
  };
  W.flushSync = function (names, opts) {
    const r = flush0.call(this, names, opts);
    if (r && !r.deferred && Array.isArray(names) && names.length === 1 && isAR(names[0]) && !(r.written || []).length && !(r.left || []).length) {
      const e = landed.get(names[0]), now = row(names[0]);
      if (e && now && now.version === e.version && !now.dirty && !now.inflight) return { ...r, written: e.written.slice() };
    }
    return r;
  };
  Object.defineProperty(W, '_autoResumeLanded', { value: true });
  return W;
}
module.exports = { landEveryAutoResumeSave };
