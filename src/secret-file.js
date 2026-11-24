'use strict';
/**
 * A SECRET-BEARING FILE REPLACED (lane vault-e2e-password-fix-r2) — SHARED tier, fs + path + crypto only. A rewrite that REMOVES a
 * secret (a device token taken out of an attach config, a plaintext login map re-written as digests, a voice pair sealed)
 * must not leave the old bytes in the inode the rename retired: `replaceShredding` writes the new text atomically (tmp +
 * rename, 0600) and then overwrites the OLD inode in place through an fd opened before the rename. Readers of the name
 * never see a torn file (the rename is atomic; the overwrite reaches only the retired inode).
 * THE NEW BYTES ARE ON DISK BEFORE THE NAME POINTS AT THEM (B-dc3f, 主开发 r1148 4): the temp file is synced, THEN renamed,
 * then its folder synced (best effort). Before, the rename came first: a crash or a power loss after it could leave the name
 * on a file of no bytes — the sign-in table is rewritten at least once an hour while anyone is signed in, and a torn one
 * started a home machine OPEN. One function, so every user gets it: src/auth.js (the sign-in table), src/plugins/frp.js (the
 * relay record and its config), src/server/host-tokens.js (the link values' copies), src/server/sealed-json.js (the
 * sealed stores).
 */
const fs = require('fs');
const path = require('path');
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
    const fd = fs.openSync(tmp, 'wx', 0o600);
    try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }   // THE BYTES ON DISK FIRST
    fs.renameSync(tmp, file);                                                              // then the name points at them
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* never written */ }
    if (old !== null) try { fs.closeSync(old); } catch { }
    throw e;
  }
  // THE FOLDER'S SYNC, BEST EFFORT (not every platform opens a folder): its open, its sync AND its close sit under it, so a
  // write that LANDED is never reported as failed to its caller (主开发 r1195 1)
  try { const dir = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); } } catch { /* the name already points at the synced bytes */ }
  if (old !== null) {
    try { if (size > 0) fs.writeSync(old, crypto.randomBytes(size), 0, size, 0); try { fs.fsyncSync(old); } catch { } } catch { /* the name already holds the new text */ }
    try { fs.closeSync(old); } catch { }
  }
}

/** THE SAME REPLACE, ASYNC (the separation's B3b-1: the interface holds the sign-in table and makes no synchronous disk call on
 *  its loop): never through a link, the old inode opened before the rename, the temp written and SYNCED, then renamed, the folder
 *  synced (best effort), the old bytes overwritten. A close that fails is never swallowed: the first one is kept and thrown after
 *  the write's own work is done (a write that LANDED reports its landing — `landed` on the error), so the caller can say it. */
async function replaceShreddingAsync(file, text) {
  const fsp = fs.promises;
  let st = null;
  try { st = await fsp.lstat(file); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
  if (st && st.isSymbolicLink()) throw Object.assign(new Error(`${file} is a symbolic link — a secret-bearing file is never rewritten (nor its old bytes overwritten) through a link`), { code: 'ELOOP' });
  let old = null, size = 0, closeErr = null;
  const closeOf = async (h) => { try { await h.close(); } catch (e) { if (!closeErr) closeErr = e; } };   // kept, never swallowed
  try { old = await fsp.open(file, 'r+'); size = (await old.stat()).size; }
  catch (e) { void e; if (old) { try { await old.close(); } catch (c) { void c; /* the old file is only shredded: its own close never stops the new text's rename */ } } old = null; size = 0; }
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    const fh = await fsp.open(tmp, 'wx', 0o600);
    try { await fh.writeFile(text); await fh.sync(); } finally { await closeOf(fh); }   // THE BYTES ON DISK FIRST
    if (closeErr) throw closeErr;                                                  // a temp whose close failed is never renamed in
    await fsp.rename(tmp, file);                                                   // then the name points at them
  } catch (e) {
    await fsp.unlink(tmp).catch((u) => u);   // never written, or never renamed: the temp goes (a missing one is nothing to do)
    if (old) await closeOf(old);
    throw e;
  }
  try { const dir = await fsp.open(path.dirname(file), 'r'); try { await dir.sync(); } finally { await closeOf(dir); } } catch (e) { void e; /* the name already points at the synced bytes (best effort: not every platform opens a folder) */ }
  if (old) {
    try { if (size > 0) await old.write(crypto.randomBytes(size), 0, size, 0); await old.sync(); } catch (e) { void e; /* the name already holds the new text */ }
    await closeOf(old);
  }
  if (closeErr) throw Object.assign(closeErr, { landed: true });   // the new text is in place; a close failed — said, never swallowed
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

/** THE SAME REMOVAL, SYNC (主开发 r3932, lane bl-chat-b: a sealed store's plain copy of torn sign-in bytes, shredded inside the
 *  store's own sync write at the person's Connect): the bytes overwritten in place (random, fsync) before the name is unlinked;
 *  never through a link; a missing file is nothing to do. → true when it is gone. */
function shredFileSync(file) {
  let st = null;
  try { st = fs.lstatSync(file); } catch { return true; }
  if (!st.isSymbolicLink() && st.isFile()) {
    let fd = null;
    try { fd = fs.openSync(file, 'r+'); if (st.size > 0) fs.writeSync(fd, crypto.randomBytes(st.size), 0, st.size, 0); try { fs.fsyncSync(fd); } catch { } }
    catch { /* the unlink below still removes the name */ }
    finally { if (fd !== null) { try { fs.closeSync(fd); } catch (e) { void e; /* its bytes were overwritten and synced before: the unlink below still removes the name */ } fd = null; } }
  }
  try { fs.unlinkSync(file); } catch { /* said by the answer below */ }
  try { fs.lstatSync(file); return false; } catch { return true; }
}

module.exports = { replaceShredding, replaceShreddingAsync, shredFile, shredFileSync };
