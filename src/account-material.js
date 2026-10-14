'use strict';
/**
 * account-material.js — the DEVICE-TIER credential-MATERIAL operations
 * (design §Account management split: "credential material and login lifecycle
 * belong to the device tier … the server machine's credential directories
 * (data/subs/) are properly understood as DEVICE #0's account store").
 *
 * This module is the formalization: the mechanical acts that touch credential
 * material live HERE, shared by the server (device #0, in-process) and the
 * daemon bundle (the sealed-orders emergency reflex re-points the pool
 * symlink with the SAME implementation). The orchestrator keeps decisions and
 * descriptors; material mechanics are one implementation per machine.
 *
 * repointPoolSymlink: the pool hot-swap primitive (2.251.0 semantics kept
 * byte-for-byte — symlink-to-temp + rename + utimes on the target's creds so
 * the CLI's mtime-gated credential cache invalidates; refuses to clobber a
 * REAL directory, which would be someone's credentials).
 *
 * writePrivateFile: THE 0600 atomic write of credential material into an
 * account dir (tmp opened `wx` 0600 + fchmod + mode check + fsync + rename —
 * the CLI's own tmp+rename shape, so a reader never sees half a file). The
 * merge fold, the bundle import and the long-lived-token materialization
 * (writeCredentialFile, lane pool-oat-materialize) all write through it; the
 * one-writer census in scripts/test-oat-mint.mjs §8 names it.
 * archiveCredentialFile / removeCredentialFile: the two other acts on a
 * member's .credentials.json — rename aside (`.credentials.json.dead-<ms>`,
 * never deleted) and take OURS back. WHICH file may go is the caller's
 * verdict; the remover still asks it again (`isOurs`) on the bytes it is about
 * to remove, and keeps the CLI's other keys (`rest`) when there are any.
 *
 * pool-oat-materialize verify r1: the oat's acts run off the event loop's back
 * (fs.promises — the never-block-the-loop law, F13) and each is GUARDED: the
 * file must still be the one the verdict read (inode + mtime + size — F7), a
 * member dir that is a symlink is refused (F8), a body that is not an object is
 * refused (F4). readCredentialFile is their one read (a failed read names its
 * errno — never "unreadable", F2).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fsp = fs.promises;

/** Atomically re-point `linkPath` at `targetDir`. `credsPath` gets a utimes
 *  bump — LOAD-BEARING (measured on claude 2.1.281, lane-hot-switch
 *  2026-09-30, scripts/fixtures/claude-cred-read-2.1.281.json): a running CLI
 *  re-reads its credential file only when the mtime it statx()es through the
 *  link DIFFERS from the last one it saw, so a re-point onto a file with an
 *  equal mtime is never followed. Every re-point of a session or pool link
 *  passes the target's creds path. Throws rather than replace a non-symlink. */
function repointPoolSymlink(linkPath, targetDir, credsPath = null) {
  try {
    const st = fs.lstatSync(linkPath);
    if (!st.isSymbolicLink()) throw new Error('pool path is a real directory, refusing to replace: ' + linkPath);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const tmp = linkPath + '.swap-' + crypto.randomBytes(4).toString('hex');
  fs.symlinkSync(targetDir, tmp);
  fs.renameSync(tmp, linkPath);
  if (credsPath) { try { const now = Date.now() / 1000; fs.utimesSync(credsPath, now, now); } catch { } }
}

/** Write `bytes` to `dest` atomically, 0600, never through a half-written file.
 *  The tmp is opened O_EXCL (`wx`) so a planted file/symlink at its name is an
 *  error, not a target; the mode is re-asserted on the fd and checked (a umask
 *  or ACL that widens it throws before the rename). */
function writePrivateFile(dest, bytes) {
  const tmp = dest + `.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fchmodSync(fd, 0o600);
    if ((fs.fstatSync(fd).mode & 0o777) !== 0o600) throw new Error('private mode not applied');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(tmp, dest);
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { } }
    try { fs.unlinkSync(tmp); } catch { }
  }
}

/** writePrivateFile's twin OFF the loop (fs.promises): the same tmp `wx` 0600 +
 *  fchmod + mode check + fsync + rename. `expect` (when given) = the dest's
 *  {ino, mtimeMs, size} as the caller read it, or null for "absent": a dest that
 *  moved since is a refusal (code 'changed'), never overwritten — for "absent"
 *  the tmp is LINKED into place (link(2) never replaces: EEXIST = a file landed).
 *  F2 (pool-oat verify r2): a REPLACE is rename-aside — the judged file moves
 *  aside FIRST and is checked after it moved (moveAside), the tmp is linked into
 *  the empty name, the aside goes; a stat check before a rename could not stop a
 *  login landing after the check (lost: 14–50 µs, measured). */
async function writePrivateFileAsync(dest, bytes, { expect } = {}) {
  const tmp = dest + `.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let fh;
  try {
    fh = await fsp.open(tmp, 'wx', 0o600);
    await fh.writeFile(bytes);
    await fh.chmod(0o600);
    if (((await fh.stat()).mode & 0o777) !== 0o600) throw new Error('private mode not applied');
    await fh.sync();
    await fh.close(); fh = undefined;
    if (expect === null) await linkInto(tmp, dest);
    else if (expect !== undefined) {
      const aside = await moveAside(dest, expect);
      try { await linkInto(tmp, dest); } catch (e) { await putBack(aside, dest); throw e; } // a login that took the empty name stays; ours goes back or rests archived
      try { await fsp.unlink(aside); } catch { }
    } else await fsp.rename(tmp, dest);
  } finally {
    if (fh !== undefined) { try { await fh.close(); } catch { } }
    try { await fsp.unlink(tmp); } catch { }
  }
}

const statOf = (st) => ({ ino: st.ino, mtimeMs: st.mtimeMs, size: st.size });
const changed = () => Object.assign(new Error('the credential file changed since it was read'), { code: 'changed' });
const symlinked = () => Object.assign(new Error('the credential file is a symlink'), { code: 'symlink' });
/** `tmp` into the EMPTY name `dest`: link(2) never replaces (EEXIST = a file landed ⇒ 'changed'); a filesystem
 *  without hard links falls back to the stat guard + rename. */
async function linkInto(tmp, dest) {
  try { await fsp.link(tmp, dest); } catch (e) {
    if (e.code === 'EEXIST') { let sl = false; try { sl = (await fsp.lstat(dest)).isSymbolicLink(); } catch { } throw sl ? symlinked() : changed(); } // a dangling symlink there says so too
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes(e.code)) throw e;
    await stillSame(dest, null); await fsp.rename(tmp, dest); // a filesystem without hard links: the stat guard alone
  }
}
/** F2 (pool-oat verify r2) — THE ONE ATOMIC STEP of a replace or a remove: a rename moves exactly ONE inode, so
 *  `p` goes aside FIRST and what moved is checked AFTER (inode + mtime + size vs `expect`): a login that landed
 *  before the rename is what moved (it goes back, the act is refused 'changed'); one landing after it lands in an
 *  empty name and stays. The aside carries an archive name, so a file that cannot go back is ARCHIVED, never lost.
 *  → the aside's path. */
async function moveAside(p, expect) {
  const aside = `${p}.dead-${Date.now()}-a${crypto.randomBytes(4).toString('hex')}`;
  try { await fsp.rename(p, aside); } catch (e) { throw e.code === 'ENOENT' ? changed() : e; }
  const st = await fsp.lstat(aside);
  if (!expect || st.isSymbolicLink() || st.ino !== expect.ino || st.mtimeMs !== expect.mtimeMs || st.size !== expect.size) { await putBack(aside, p); throw st.isSymbolicLink() ? symlinked() : changed(); }
  return aside;
}
/** The aside back into its EMPTY name (link(2) never replaces); a name a third write took meanwhile leaves it where
 *  it is — an archive (0600). */
async function putBack(aside, p) {
  try { await fsp.link(aside, p); } catch { try { await fsp.chmod(aside, 0o600); } catch { } return; }
  try { await fsp.unlink(aside); } catch { }
}
/** F7: `p` is still exactly what was read (`expect` = statOf, or null = it was absent). */
async function stillSame(p, expect) {
  let st = null;
  try { st = await fsp.lstat(p); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (st && st.isSymbolicLink()) throw symlinked(); // the row says it (verify r2 low), never written through
  if (!expect) { if (st) throw changed(); return; }
  if (!st || st.ino !== expect.ino || st.mtimeMs !== expect.mtimeMs || st.size !== expect.size) throw changed();
}

/** THE ONE READ of a member's credential file for the oat's acts:
 *  { dirState: 'dir'|'absent'|'symlink'|'read-failed', fileState: 'present'|'absent'|'unreadable'|'read-failed',
 *    file, stat, code }. 'unreadable' = read, but not a JSON object; 'read-failed' = the READ failed (code = errno). */
async function readCredentialFile(dir) {
  const out = (dirState, fileState, extra = {}) => ({ dirState, fileState, file: null, stat: null, ...extra });
  try { if ((await fsp.lstat(dir)).isSymbolicLink()) return out('symlink', 'absent'); } catch (e) { return e.code === 'ENOENT' ? out('absent', 'absent') : out('read-failed', 'read-failed', { code: String(e.code || 'error') }); }
  let fh;
  try { fh = await fsp.open(path.join(dir, '.credentials.json'), 'r'); } catch (e) { return e.code === 'ENOENT' ? out('dir', 'absent') : out('dir', 'read-failed', { code: String(e.code || 'error') }); }
  try {
    const stat = statOf(await fh.stat());
    const txt = await fh.readFile('utf8');
    let file = null;
    try { file = JSON.parse(txt); } catch { file = null; }
    if (!file || typeof file !== 'object' || Array.isArray(file)) return out('dir', 'unreadable', { stat });
    return { dirState: 'dir', fileState: 'present', file, stat };
  } catch (e) { return out('dir', 'read-failed', { code: String(e.code || 'error') }); } finally { try { await fh.close(); } catch { } }
}

/** THE ONE WRITER of a long-lived token into a member's credential file
 *  (accounts' oat sync is its only caller): the dir 0700 and never a symlink
 *  (F8), the file 0600, atomic, guarded by `expect` (F7). `body` is an object
 *  — login-expiry's oatFileMerge — anything else is refused by name (F4). */
async function writeCredentialFile(dir, body, { expect } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('a credential file must be a JSON object'), { code: 'not-an-object' });
  try { if ((await fsp.lstat(dir)).isSymbolicLink()) throw Object.assign(new Error('the account folder is a symlink'), { code: 'dir-symlink' }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  await fsp.chmod(dir, 0o700);
  await writePrivateFileAsync(path.join(dir, '.credentials.json'), JSON.stringify(body), { expect });
}

/** Rename a member's .credentials.json aside — `.credentials.json.dead-<ms>`
 *  (a `-n` suffix if that name is taken, a dangling symlink included), 0600 — and
 *  return the name. A login we replace is ARCHIVED, never deleted (q-035
 *  invariant 4); the file must still be the one that was judged (`expect`, F7). */
async function archiveCredentialFile(dir, at = Date.now(), { expect } = {}) {
  const src = path.join(dir, '.credentials.json');
  if (expect !== undefined) await stillSame(src, expect);
  const stem = `.credentials.json.dead-${Math.round(Number(at) || Date.now())}`;
  const taken = async (n) => { try { await fsp.lstat(path.join(dir, n)); return true; } catch { return false; } };
  let name = stem;
  for (let n = 1; await taken(name); n++) name = `${stem}-${n}`;
  const dst = path.join(dir, name);
  await fsp.rename(src, dst);
  // …and what moved must BE what was judged: a login that landed between the stat and the rename goes
  // straight back (link(2): only into an empty name — a third write leaves it archived, never lost)
  if (expect) {
    const st = await fsp.lstat(dst);
    if (st.ino !== expect.ino || st.mtimeMs !== expect.mtimeMs || st.size !== expect.size) {
      try { await fsp.link(dst, src); await fsp.unlink(dst); } catch { }
      throw changed();
    }
  }
  try { await fsp.chmod(dst, 0o600); } catch { }
  return name;
}

/** Take OUR file back: the bytes on disk are asked `isOurs` again first (no
 *  question, no removal — 'no-ownership'; not ours — 'not-ours'). The CLI's
 *  other keys (`rest(file)`, when any) stay in the file; with none it is
 *  unlinked. → true (unlinked) | 'stripped' | false (nothing there). */
async function removeCredentialFile(dir, { isOurs, rest = null, expect } = {}) {
  if (typeof isOurs !== 'function') throw Object.assign(new Error('removing a credential file needs the "ours?" question'), { code: 'no-ownership' });
  const p = path.join(dir, '.credentials.json');
  const seen = await readCredentialFile(dir);
  if (seen.fileState === 'absent') return false;
  if (seen.fileState !== 'present' || !isOurs(seen.file)) throw Object.assign(new Error('not ours: the credential file stays'), { code: 'not-ours' });
  if (expect !== undefined && (!expect || expect.ino !== seen.stat.ino || expect.mtimeMs !== seen.stat.mtimeMs || expect.size !== seen.stat.size)) throw changed();
  const keep = rest ? rest(seen.file) : null;
  if (keep && typeof keep === 'object' && Object.keys(keep).length) { await writePrivateFileAsync(p, JSON.stringify(keep), { expect: seen.stat }); return 'stripped'; }
  await fsp.unlink(await moveAside(p, seen.stat)); // F2: rename aside → check → unlink (never the name itself)
  return true;
}

/** A merge folds a member dir away (accounts.mergeSubscription): its archived dead
 *  logins MOVE into the survivor's dir first (verify r1 F12 — never destroyed with
 *  the folded dir); a name the survivor already holds gets an `-m<n>` suffix.
 *  Returns the names moved. Sync: a merge is one person's act, not a sweep. */
function moveCredentialArchives(fromDir, intoDir) {
  let names = [];
  try { names = fs.readdirSync(fromDir).filter((f) => /^\.credentials\.json\.dead-/.test(f)); } catch { return []; }
  const moved = [];
  for (const f of names) {
    let name = f;
    for (let n = 1; (() => { try { fs.lstatSync(path.join(intoDir, name)); return true; } catch { return false; } })(); n++) name = `${f}-m${n}`;
    try { fs.renameSync(path.join(fromDir, f), path.join(intoDir, name)); moved.push(name); } catch { }
  }
  return moved;
}

module.exports = { repointPoolSymlink, writePrivateFile, writePrivateFileAsync, readCredentialFile, writeCredentialFile, archiveCredentialFile, removeCredentialFile, moveCredentialArchives };
