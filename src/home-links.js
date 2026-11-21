'use strict';
// THE FILE-SYSTEM SIDE OF A RE-HOME (B-ba47): src/home-verdict.js (PURE) decides — binLinks WHAT goes in a re-homed PATH's
// own folder (TOOL_ROWS; never an agent CLI), rehomeEnv which values are carried, judged by where their paths RESOLVE
// through a resolver it is HANDED. This file is that resolver and the linker. scripts/scratch.mjs (a suite's re-home, at
// import) and src/server/throwaway-root.js (a hub's, at the boot's first act — B-ba47 shape H) both call it: no copy.
const fs = require('fs');
const path = require('path');
const HV = require('./home-verdict');

/** Link each { name, target } into binDir (made 0700); → the names linked. */
function linkTools(binDir, links) {
  fs.mkdirSync(binDir, { recursive: true, mode: 0o700 });
  const done = [];
  for (const { name, target } of links) { try { fs.symlinkSync(target, path.join(binDir, name)); done.push(name); } catch { } }
  return done;
}
/** THE FILE SYSTEM'S WALK (主开发 18:25Z B1): src/home-verdict.js walk over lstat's kind and readlink — a path resolved as
 *  the kernel walks it, links first, a parent step applied to what the prefix resolved to. One resolver = one memo (a
 *  re-home makes one for the handed env); → the path, or null when it could not look. `refuse(p)` (the hub's first act: a path
 *  on a FUSE, network or storage mount, src/mount-path-class.js) is never walked — could not look, so the value rule drops it. */
function makeResolver({ refuse = null } = {}) {
  const K = new Map(), L = new Map();
  const kind = (p) => {
    if (!K.has(p) && refuse && refuse(p)) K.set(p, 'error');
    if (!K.has(p)) { let k; try { const st = fs.lstatSync(p); k = st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : 'file'; } catch (e) { k = e && e.code === 'ENOENT' ? 'missing' : 'error'; } K.set(p, k); }
    return K.get(p);
  };
  const readlink = (p) => { if (!L.has(p)) L.set(p, fs.readlinkSync(p)); return L.get(p); };
  return (p) => HV.walk(String(p).startsWith('/') ? String(p) : `${process.cwd()}/${p}`, { kind, readlink });
}
function resolveFs(p) { return makeResolver()(p); }
/** A regular file at `f` (following links). */
const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };

module.exports = { linkTools, makeResolver, resolveFs, isFile };
