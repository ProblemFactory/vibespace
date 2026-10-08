'use strict';
/**
 * THE COPY of a stopped profile's directory into a new profile's (lane browser-profile-clone, B-9669). ORCH, off the event
 * loop: the size walk and the copy are fs.promises (libuv's pool) — never a sync walk. What is left behind is the PURE
 * tables' verdict (src/browser-clone.js cloneSkip). ATOMIC: the copy lands in `<dst>.copying` and is renamed onto `<dst>`
 * at the end; any failure removes the partial directory and throws `clone_failed` with the fs code — no `<dst>`, no
 * `.copying` is ever left. `fsp` is a seam (a test throws mid-copy through it).
 */
const fs = require('fs');
const path = require('path');
const C = require('../browser-clone.js');

/** The bytes a copy would write (the tables' entries not counted; symlinks count as links). Stops early past `stopAt`. */
async function sizeToCopy(dir, { fsp = fs.promises, stopAt = Infinity } = {}) {
  let total = 0;
  const walk = async (d) => {
    let ents;
    try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch (e) { if (d === dir) throw e; return; }
    for (const e of ents) {
      if (total > stopAt) return;
      if (C.cloneSkip(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) await walk(f);
      else if (e.isFile()) { try { total += (await fsp.lstat(f)).size; } catch { /* gone meanwhile */ } }
    }
  };
  await walk(String(dir));
  return total;
}

function cloneFailed(e, step) {
  const err = new Error(`the copy failed while ${step}: ${(e && e.message) || e}`);
  err.code = 'clone_failed'; err.fsCode = (e && e.code) || null;
  return err;
}

/** Copy `src` into `dst` (which must not exist). → `{dir: dst, skipped: [names at the top level left behind]}`. Throws
 *  `clone_failed` (with `fsCode`) after removing the partial directory. */
async function copyProfileDir(src, dst, { fsp = fs.promises } = {}) {
  const tmp = `${dst}.copying`;
  const skipped = [];
  try { await fsp.rm(tmp, { recursive: true, force: true }); } catch { /* a previous run's leftover — the copy below says it */ }
  try {
    await fsp.mkdir(tmp, { mode: 0o700 });
    await fsp.cp(String(src), tmp, {
      recursive: true, verbatimSymlinks: true, preserveTimestamps: true, errorOnExist: false, force: true,
      filter: (s) => { if (s === String(src)) return true; const why = C.cloneSkip(path.basename(s)); if (why && path.dirname(s) === String(src)) skipped.push(path.basename(s)); return !why; },
    });
    await fsp.chmod(tmp, 0o700);
    await fsp.rename(tmp, dst);
  } catch (e) {
    try { await fsp.rm(tmp, { recursive: true, force: true }); } catch { /* best effort — said below */ }
    throw cloneFailed(e, 'copying the folder');
  }
  return { dir: dst, skipped: skipped.sort() };
}

module.exports = { sizeToCopy, copyProfileDir };
