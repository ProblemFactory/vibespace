'use strict';
/**
 * THE ONE ANSWER «is this path on a storage mount?» for every module of this process (lane hub-fuse-sync-guard).
 * SHARED: node builtins + the PURE src/mount-path-class.js. The hub's sync fs witness (src/server/sync-fs-witness.js)
 * sets the roots at its start and at every refresh (30 s, a mounts-registry change); a process nobody set (the device
 * daemon, a child, a suite) has no roots and answers null — every caller then keeps its old road.
 *   rootOf(p)        → the root row holding p (any kind: storage / home / network), or null
 *   storageRootOf(p) → the STORAGE root holding p (the main thread is refused there), or null
 * A caller that must answer synchronously reads a storage path off the main thread instead (src/storage-facts.js).
 */
const MPC = require('./mount-path-class.js');

let state = { roots: [], rootDir: null, dataDir: null, home: null, cwd: null };
let CTX = { mountRoots: [] };

function setRoots(roots, { rootDir = null, dataDir = null, home = null, cwd = null } = {}) {
  state = { roots: Array.isArray(roots) ? roots.slice() : [], rootDir, dataDir, home, cwd };
  CTX = { mountRoots: state.roots, rootDir, dataDir, home, cwd };
}
function rootOf(p) { return state.roots.length ? MPC.rootOf(p, CTX) : null; }
function storageRootOf(p) { const r = rootOf(p); return r && r.kind === 'storage' ? r : null; }

// B-891e: the whole state, for a worker that answers this module's questions the same way (src/sessions-assemble.js setFacts)
const snapshot = () => ({ roots: state.roots.slice(), rootDir: state.rootDir, dataDir: state.dataDir, home: state.home, cwd: state.cwd });

module.exports = { setRoots, rootOf, storageRootOf, roots: () => state.roots.slice(), snapshot };
