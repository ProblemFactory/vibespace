'use strict';
// THE HUB'S FILE POOL, ASKED FROM A MODULE THE DEVICE AGENT ALSO BUNDLES (主开发 r2660 (B), lane bl-machines-a).
//
// src/safe-fs.js is the hub's: each op runs in a worker thread whose script sits beside the code. A paired machine's agent is ONE
// bundled file that ships no worker script, so no pool is ever built there (the sites run their op in place, as before), and the
// pool's own bytes (about 23 KB as shipped) must not ride that bundle either. `hubPool(script)` answers src/safe-fs.js's exports only
// when `script` (the worker the site is about to start) exists beside the code; otherwise null, and src/safe-fs.js is never required.
// The require is COMPUTED (a path, not a literal), so esbuild does not follow it: the device build never carries src/safe-fs.js
// (test-architecture §107 reads the build's own input list, with a red control that writes this require as a literal).
const fs = require('fs');
const path = require('path');

const POOL = path.join(__dirname, 'safe-fs.js');

/** src/safe-fs.js's exports when the worker `script` is beside the code (the hub's checkout); null where it is not (the device bundle). */
function hubPool(script) {
  if (!fs.existsSync(script)) return null;
  return require(POOL);
}

module.exports = { hubPool };
