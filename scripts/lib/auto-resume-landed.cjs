'use strict';
// Row B-9a24 R9 / B-574d (lane lg-store-writes, 主开发 r4350): auto-resume.json is written by THE STORE WRITER (src/server/auto-resume.js
// save(): dirty + produce, off the main thread). A SUITE that reads the file right after an act, or starts a second instance over the
// same folder (a restart in process), calls landEveryAutoResumeSave() once: the process's own store writer (the one every instance and
// every copy of the module reaches) then follows each auto-resume.json dirty() with its synchronous flush of that one file, on the
// SUITE's thread — the bytes on disk are the product's own write, never a suite's copy. Other stores are untouched.
const path = require('path');
const SW = require(path.join(__dirname, '..', '..', 'src', 'store-writer.js'));
function landEveryAutoResumeSave() {
  const W = SW.storeWriter();
  if (W._autoResumeLanded) return W;
  const dirty0 = W.dirty;
  W.dirty = function (file, opts) {
    const r = dirty0.call(this, file, opts);
    if (path.basename(String(file)) === 'auto-resume.json') { try { W.flushSync([file], { waitedBy: 'a suite: auto-resume.json read right after an act' }); } catch { } }
    return r;
  };
  Object.defineProperty(W, '_autoResumeLanded', { value: true });
  return W;
}
module.exports = { landEveryAutoResumeSave };
