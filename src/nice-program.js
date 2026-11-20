'use strict';
// B-460d's remainder — THE NICE PROGRAM'S LOOK, in ONE file both sides require (at src/, inside both fs censuses' scope:
// scripts/sync-fs-census.mjs and mount-reader-census.mjs scan src, src/server, src/routes): the hub (src/server/spawn-priority.js: a local
// start's priority) and the device agent (src/agentd/agentd.js: its hello says `nicePath`, so the hub starts a paired machine's
// conversation below THAT machine's agent with THAT machine's own program — the same verdict, src/server/spawn-priority.js
// devicePriorityFor). FIXED local system directories (coreutils / busybox / Homebrew), never the PATH: a PATH entry may sit on
// a network mount, and this is looked at on the main thread. ONE look per process. Windows: none (a nice under Git Bash sets
// no Windows priority class). Node builtins only — the device bundle carries it.
const fs = require('fs');
const path = require('path');

const NICE_DIRS = Object.freeze(['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin']);
let niceAt;            // undefined = not looked yet; null = none here; else its absolute path (ONE look per process)

/** The nice program's absolute path, or null — looked up ONCE per process (a few local stats, the first ask). */
function niceProgram({ dirs = NICE_DIRS, access = (p) => fs.accessSync(p, fs.constants.X_OK), platform = process.platform } = {}) {
  if (niceAt !== undefined) return niceAt;
  niceAt = null;
  if (platform === 'win32') return niceAt;
  for (const d of dirs) { const p = path.join(d, 'nice'); try { access(p); niceAt = p; break; } catch { } }
  return niceAt;
}

/** a suite's seam: forget the one look */
function _resetNice() { niceAt = undefined; }

module.exports = { niceProgram, NICE_DIRS, _resetNice };
