'use strict';
// A SIDECAR WRITE HELD MID-WAY (ci358-reds item 7) — a suite's preload for a chat wrapper (`node --require <this> <wrapper>
// <buf> <sidecar> …`, VS_HOLD_DIR=<dir>): once <dir>/arm exists, the wrapper's NEXT write of its sidecar — or of a temp
// file beside it (`<sidecar>.*`) — is opened the way fs.writeFileSync opens it (O_TRUNC: that file is EMPTY from here),
// <dir>/held names it, and the write WAITS there until <dir>/release exists (10 s at most: a suite that died never wedges
// the wrapper); then its bytes land. The instant a loaded runner's scheduler can leave a writer in — between its truncate
// and its bytes — made to last. Never loaded by the product.
const fs = require('fs');
const path = require('path');
const DIR = process.env.VS_HOLD_DIR, SIDE = process.argv[3];
if (DIR && SIDE) {
  const write0 = fs.writeFileSync;
  let held = false;
  fs.writeFileSync = function (p, data, ...rest) {
    if (held || typeof p !== 'string' || !(p === SIDE || p.startsWith(SIDE + '.')) || !fs.existsSync(path.join(DIR, 'arm'))) return write0.call(this, p, data, ...rest);
    held = true;
    const fd = fs.openSync(p, 'w');
    try {
      write0(path.join(DIR, 'held'), p);
      const nap = new Int32Array(new SharedArrayBuffer(4)), t0 = Date.now();
      while (!fs.existsSync(path.join(DIR, 'release')) && Date.now() - t0 < 10000) Atomics.wait(nap, 0, 0, 5);
      fs.writeSync(fd, typeof data === 'string' ? data : Buffer.from(data));
    } finally { fs.closeSync(fd); }
  };
}
