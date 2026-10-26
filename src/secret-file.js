'use strict';
/**
 * A SECRET-BEARING FILE REPLACED (lane vault-e2e-password-fix-r2) — SHARED tier, fs + crypto only. A rewrite that REMOVES a
 * secret (a device token taken out of an attach config, a plaintext login map re-written as digests, a voice pair sealed)
 * must not leave the old bytes in the inode the rename retired: `replaceShredding` writes the new text atomically (tmp +
 * rename, 0600) and then overwrites the OLD inode in place through an fd opened before the rename. Readers of the name
 * never see a torn file (the rename is atomic; the overwrite reaches only the retired inode).
 */
const fs = require('fs');
const crypto = require('crypto');

/** Replace a SECRET-BEARING file's content atomically (tmp + rename, 0600) and overwrite the OLD bytes in place — the inode
 *  the rename retired, through an fd opened before it — so a value a rewrite removes (a host token copy, a plaintext login
 *  token) never lingers in a block we could reach (lane vault-e2e-password-fix-r2). A missing file is simply written. */
function replaceShredding(file, text) {
  let old = null, size = 0;
  try { if (fs.lstatSync(file).isSymbolicLink()) throw Object.assign(new Error(`${file} is a symbolic link — a secret-bearing file is never rewritten (nor its old bytes overwritten) through a link`), { code: 'ELOOP' }); } catch (e) { if (e && e.code === 'ELOOP') throw e; }   // verify r2: the overwrite would reach the link's TARGET
  try { old = fs.openSync(file, 'r+'); size = fs.fstatSync(old).size; } catch { old = null; }
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* never written */ }
    if (old !== null) try { fs.closeSync(old); } catch { }
    throw e;
  }
  if (old !== null) {
    try { if (size > 0) fs.writeSync(old, crypto.randomBytes(size), 0, size, 0); try { fs.fsyncSync(old); } catch { } } catch { /* the name already holds the new text */ }
    try { fs.closeSync(old); } catch { }
  }
}

/** A SECRET-BEARING FILE REMOVED (lane engine-distribution: a git credential handed to ONE clone through a 0600 file — the
 *  askpass's token, a deploy key): its bytes are overwritten in place (random, fsync) before the name is unlinked. Async (the
 *  install road never blocks the loop); never through a link; a missing file is nothing to do. → true when it is gone. */
async function shredFile(file) {
  const fsp = fs.promises;
  let st = null;
  try { st = await fsp.lstat(file); } catch { return true; }
  if (st.isSymbolicLink() || !st.isFile()) { await fsp.unlink(file).catch(() => {}); return true; }
  let fh = null;
  try { fh = await fsp.open(file, 'r+'); if (st.size > 0) await fh.write(crypto.randomBytes(st.size), 0, st.size, 0); await fh.sync().catch(() => {}); }
  catch { /* the unlink below still removes the name */ }
  finally { if (fh) await fh.close().catch(() => {}); }
  await fsp.unlink(file).catch(() => {});
  try { await fsp.lstat(file); return false; } catch { return true; }
}

module.exports = { replaceShredding, shredFile };
