'use strict';
// THE CLAUDE HOME-RENAME HOOK (store.homeRename; rv-server M5, dc-harness-store
// 2.369.213). claude encodes each per-project transcript dir under
// ~/.claude/projects from the RESOLVED cwd (-home-<user>-…), so a renamed home
// leaves every pre-rename conversation where claude's resume lookup no longer
// looks ("No conversation found"). The core owns WHEN (src/server/home-rename.js
// migrateHomeRename at boot: one marker per half — B-8033 —, then the generic
// recorded-path rewrite; boot-restore migrateLegacyHomeProjects: the
// /home/vibe→/home/<name> symlink deploy) and asks every harness's hook; the
// .claude/projects layout lives only here.
const fs = require('fs');
const path = require('path');
const { cwdToProjectDir } = require('../session-store');

const projectsDirOf = (home) => path.join(home, '.claude', 'projects');

/** Is /home/<old> gone (a renamed user's old home)? — the default for a caller that hands none; migrateHomeRename hands its ONE
 *  injectable homeGone to both sources of an old user (B-8033 cure), so a test never depends on the paths of its machine. */
const homeGoneOnDisk = (old) => !fs.existsSync(`/home/${old}`);
/** B-8033 cure 2 (主开发's law): THE PERSON'S OWN FOLDERS ARE NEVER MOVED. A folder name is claude's encoding of a working folder
 *  (every character but a letter or a digit becomes '-' — src/harnesses/helper-transcripts.js projDirOf), so a name alone never
 *  says whose a folder is (`-home-vibe-alice-notes`: /home/vibe/alice-notes or /home/vibe-alice/notes or /home/vibe.alice/notes).
 *  A folder MOVES only when its transcripts say it is an old project still in place; anything else stays. */
const projDirOf = (cwd) => String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-');
const ownPrefixOf = (user) => projDirOf(path.posix.join('/home', String(user)));
const underPrefix = (d, P) => d === P || d.startsWith(P + '-');
const CWD_READ_MAX = 4 * 1024 * 1024;   // per transcript: far enough for any record that names its working folder
const READ_ERR = Symbol('unreadable');
/** The first record of a transcript that carries its OWN working folder (a top-level `cwd`) — a record without one never ends
 *  the search; null = none in the first CWD_READ_MAX bytes; READ_ERR = the transcript could not be read (EIO, ESTALE …). */
function firstCwdOf(file) {
  const { StringDecoder } = require('string_decoder');
  const dec = new StringDecoder('utf8'), b = Buffer.alloc(65536);
  const cwdOfLine = (l) => { if (!l || !l.includes('"cwd"')) return null; try { const o = JSON.parse(l); return o && typeof o === 'object' && typeof o.cwd === 'string' && o.cwd ? o.cwd : null; } catch { return null; } };
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    let pos = 0, rest = '';
    while (pos < CWD_READ_MAX) {
      const n = fs.readSync(fd, b, 0, b.length, pos);
      if (n <= 0) break;
      pos += n;
      const text = dec.write(b.subarray(0, n));
      let at = text.indexOf('\n');
      if (at < 0) { rest += text; continue; }   // a long line: carried, never re-split
      let c = cwdOfLine(rest + text.slice(0, at));
      if (c != null) return c;
      for (let from = at + 1; (at = text.indexOf('\n', from)) >= 0; from = at + 1) { c = cwdOfLine(text.slice(from, at)); if (c != null) return c; rest = ''; }
      rest = text.slice(text.lastIndexOf('\n') + 1);
    }
    return cwdOfLine(rest + dec.end());
  } catch { return READ_ERR; } finally { if (fd != null) { try { fs.closeSync(fd); } catch { } } }
}
/** Whose is this `-home-<old>…` folder? Every transcript in it is asked: 'old' = each one that names a working folder names a
 *  /home/<old>(/…) one whose encoding IS the folder's name (an old project still in place — once moved, the name no longer
 *  matches: never moved twice); 'own' = each names another; null = none says, or they DISAGREE — the folder stays, said;
 *  'error' = a transcript could not be read — a failed move (tried again, bounded), never a verdict. */
function ownerByCwd(dir, old) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort(); } catch { return 'error'; }
  const seen = new Set();
  for (const f of names) {
    const cwd = firstCwdOf(path.join(dir, f));
    if (cwd === READ_ERR) return 'error';
    if (cwd == null) continue;
    seen.add((cwd === `/home/${old}` || cwd.startsWith(`/home/${old}/`)) && projDirOf(cwd) === path.basename(dir) ? 'old' : 'own');
  }
  return seen.size === 1 ? [...seen][0] : null;
}
/** The folders a move of <old> asks about: its bare home folder `-home-<old>` (conversations started in ~) and `-home-<old>-…`;
 *  the new name of one: the bare one → the new bare folder, any other → under it. */
const oldFolderOf = (d, old) => d === `-home-${old}` || d.startsWith(`-home-${old}-`);
const newNameOf = (d, old, P) => (d === `-home-${old}` ? P : P + '-' + d.slice(`-home-${old}-`.length));
/** Old usernames left behind: -home-<old>-… projdirs whose /home/<old> is gone. */
function staleUsers(home, user, { homeGone = homeGoneOnDisk } = {}) {
  let dirs = [];
  try { dirs = fs.readdirSync(projectsDirOf(home)); } catch { return []; }
  const oldUsers = new Set();
  for (const d of dirs) {
    const m = /^-home-([a-z][a-z0-9]*)(?:-|$)/.exec(d);   // B-8033 cure 2: the old user's bare home folder names it too
    if (m && m[1] !== user && homeGone(m[1])) oldUsers.add(m[1]);
  }
  return [...oldUsers];
}

/** Re-encode -home-<old>-* → -home-<user>-* (merge, never overwrite: both sides
 *  may hold transcripts). Returns the number of projdirs moved. */
function moveUser(home, old, user) {
  const projectsDir = projectsDirOf(home);
  let moved = 0;
  const P = ownPrefixOf(user);
  for (const d of fs.readdirSync(projectsDir)) {
    if (!oldFolderOf(d, old)) continue;
    if (ownerByCwd(path.join(projectsDir, d), old) !== 'old') continue;   // B-8033 cure 2: only an old project still in place moves — the person's own, an undecided one and an unreadable one stay
    const nd = newNameOf(d, old, P);
    const src = path.join(projectsDir, d), dst = path.join(projectsDir, nd);
    try {
      if (!fs.existsSync(dst)) { fs.renameSync(src, dst); moved++; }
      else {
        for (const f of fs.readdirSync(src)) {
          if (!fs.existsSync(path.join(dst, f))) fs.renameSync(path.join(src, f), path.join(dst, f));
        }
        try { fs.rmdirSync(src); } catch { }
        moved++;
      }
    } catch (e) { console.warn(`[migrate] projdir ${d}: ${e.message}`); }
  }
  return moved;
}

/** B-8033 cure: what a move LEFT under the old encoding → { failed, sameName }. A projdir that still holds a transcript the new
 *  one lacks (or whose new one is no folder) is a FAILED move (EACCES / EXDEV, logged by moveUser) — tried again; one whose
 *  every file the new one has too is a same-name leftover (never overwritten — moveUser's merge rule) — kept and said. The
 *  symlinked-home deploy's links (relinkLegacy) are no leftovers. */
function leftAfterMove(home, old, user) {
  const projectsDir = projectsDirOf(home);
  let failed = 0, sameName = 0, undecided = 0, names = [];
  try { names = fs.readdirSync(projectsDir); } catch { return { failed, sameName, undecided }; }
  const P = ownPrefixOf(user);
  for (const d of names) {
    if (!oldFolderOf(d, old)) continue;
    let st0 = null; try { st0 = fs.lstatSync(path.join(projectsDir, d)); } catch { continue; }
    if (!st0.isDirectory()) continue;   // the symlinked-home deploy's links are no leftovers
    const who = ownerByCwd(path.join(projectsDir, d), old);   // B-8033 cure 2: own ⇒ never moved; undecided ⇒ stays, said; unreadable ⇒ failed (tried again)
    if (who === 'error') { failed++; continue; }
    if (who === null) { undecided++; continue; }
    if (who !== 'old') continue;
    const src = path.join(projectsDir, d), dst = path.join(projectsDir, newNameOf(d, old, P));
    let st = null; try { st = fs.lstatSync(src); } catch { continue; }
    if (!st.isDirectory()) continue;
    let files = []; try { files = fs.readdirSync(src); } catch { failed++; continue; }
    let dstDir = false; try { dstDir = fs.statSync(dst).isDirectory(); } catch { dstDir = false; }
    if (!dstDir || files.some((f) => !fs.existsSync(path.join(dst, f)))) failed++; else sameName++;
  }
  return { failed, sameName, undecided };
}

/** The symlinked-home deploy (2.236.1): rename each -home-<old>-* dir to the
 *  new encoding and leave the old name as a symlink (cwdToProjectDir over
 *  recorded /home/<old> cwds keeps working through it). Idempotent;
 *  collisions skipped with a log. */
function relinkLegacy(home, old) {
  const projectsDir = projectsDirOf(home);
  const newPrefix = cwdToProjectDir(home); // e.g. -home-userW
  const oldPrefix = `-home-${old}-`;
  let names; try { names = fs.readdirSync(projectsDir); } catch { return; }
  let n = 0;
  for (const d of names) {
    if (!d.startsWith(oldPrefix)) continue;
    const full = path.join(projectsDir, d);
    if (underPrefix(d, newPrefix) && ownerByCwd(full, old) !== 'old') continue;   // B-8033 cure 2: the new name's own folders, the bare one included (a deeper -x-x-… each boot, ELOOP)
    let ds; try { ds = fs.lstatSync(full); } catch { continue; }
    if (!ds.isDirectory()) continue; // already a symlink from a prior run
    const target = newPrefix + '-' + d.slice(oldPrefix.length);
    const targetFull = path.join(projectsDir, target);
    if (fs.existsSync(targetFull)) { console.warn(`[migrate] projects collision, left in place: ${d}`); continue; }
    try {
      fs.renameSync(full, targetFull);
      fs.symlinkSync(target, full);
      n++;
    } catch (e) { console.warn(`[migrate] projects rename failed for ${d}: ${e.message}`); }
  }
  if (n) console.log(`[migrate] personalized-username: re-encoded ${n} claude project dir(s) ${oldPrefix}* -> ${newPrefix}-* (old names symlinked)`);
}

module.exports = { staleUsers, moveUser, relinkLegacy, leftAfterMove };
