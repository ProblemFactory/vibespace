'use strict';
/**
 * THE OWNER MARK of a product folder under the shared temp root (主开发 r1213 — A SWEEP REMOVES ONLY WHAT IT CAN PROVE IS ITS OWN
 * DEAD THING; the rows that use it: src/temp-sweepers.js). The maker writes `.owner` — the hub's identity (pid, start, boot:
 * src/proc-identity.js) — as the folder's FIRST file, the write CHECKED (a short write is a failed mark: writeMark throws and
 * the maker removes the folder, as a failed mkdtemp fails). A start's sweep removes only a folder whose mark parses AND whose
 * owner is proven gone (aliveIdentity === false: an owner that lives, or cannot be proven gone, keeps it) — and each sweeper keeps
 * its own age bar beside it (a run in another pid space reads as gone here, yet a live run is never older than its life); a folder
 * of the name with NO mark is not the product's to judge and is LEFT (another program's, a suite's, a second hub's in the instant
 * before its mark). A removal takes the mark LAST, and only once nothing else is left (read again), so an interrupted or partial
 * removal leaves a folder the next start still judges.
 */
const fs = require('fs');
const path = require('path');
const PI = require('./proc-identity.js');

const OWNER_FILE = '.owner';
const MARK_MAX = 4096;

/** This process's identity — read once, at the maker's construction (a boot step), never per folder. */
function selfIdentity() { try { return PI.identityOf(process.pid) || { pid: process.pid }; } catch { return { pid: process.pid }; } }

/** Write `dir`'s mark (its first file): created only if absent, never through a link, 0600; a short write throws. */
function writeMark(dir, identity) {
  const b = Buffer.from(JSON.stringify(identity && typeof identity === 'object' ? identity : { pid: process.pid }));
  const fd = fs.openSync(path.join(dir, OWNER_FILE), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try {
    const n = fs.writeSync(fd, b);
    if (n !== b.length) throw Object.assign(new Error(`the owner mark was written short (${n} of ${b.length} bytes)`), { code: 'ESHORTMARK' });
  } finally { fs.closeSync(fd); }
}

/** `dir`'s owner, or null: no mark, unreadable, not a small regular file, not an object with an integer pid. */
function ownerOf(dir) {
  let fd;
  try { fd = fs.openSync(path.join(dir, OWNER_FILE), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0)); } catch { return null; }
  let o = null;
  try {
    const st = fs.fstatSync(fd);
    if (st.isFile() && st.size <= MARK_MAX) {
      const b = Buffer.alloc(st.size);
      let n = 0;
      while (n < st.size) { const k = fs.readSync(fd, b, n, st.size - n, null); if (!k) break; n += k; }
      o = JSON.parse(b.subarray(0, n).toString('utf8'));
    }
  } catch { o = null; } finally { fs.closeSync(fd); }   // a failed close throws to the caller (the sweep keeps that folder) — never swallowed
  return o && typeof o === 'object' && Number.isInteger(Number(o.pid)) ? o : null;
}

/** Whether `dir` is a dead thing of the product's: marked, and its owner proven gone. */
function provenDead(dir) { const o = ownerOf(dir); return !!o && PI.aliveIdentity(o) === false; }

/** Remove a marked folder: everything but the mark, then the mark only once nothing else is left (read again), then the folder.
 *  An entry that would not go keeps the folder MARKED — the next start's sweep judges it again. */
function removeMarked(dir) {
  let st = null;
  try { st = fs.lstatSync(dir); } catch { return; }
  if (!st.isDirectory()) return;   // never through a link to a folder elsewhere (the round's note)
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const n of names) if (n !== OWNER_FILE) { try { fs.rmSync(path.join(dir, n), { recursive: true, force: true }); } catch { } }
  let left = null;
  try { left = fs.readdirSync(dir); } catch { left = null; }
  if (left && left.length === 1 && left[0] === OWNER_FILE) { try { fs.unlinkSync(path.join(dir, OWNER_FILE)); } catch { } }
  try { fs.rmdirSync(dir); } catch { }
}

module.exports = { OWNER_FILE, MARK_MAX, selfIdentity, writeMark, ownerOf, provenDead, removeMarked };
