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
/** B-8033 cure r3: a folder under the NEW user's prefix when that prefix extends the old one (vibe → vibe-alice) is AMBIGUOUS by
 *  name — `-home-vibe-alice-notes` is /home/vibe/alice-notes (an old project, to move) or /home/vibe-alice/notes (the new user's
 *  own). Its transcript says which: an old project still to move records a /home/<old>/… cwd whose encoding IS the folder's name
 *  (once moved, the name is the new cwd's encoding and no longer matches — never moved twice). No transcript ⇒ nothing to
 *  resume ⇒ left as it is. Reads the head of at most three transcripts of that one folder. */
function oldProjectByCwd(dir, old) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).slice(0, 3); } catch { return false; }
  for (const f of names) {
    let head = '';
    try { const fd = fs.openSync(path.join(dir, f), 'r'); try { const b = Buffer.alloc(8192); head = b.toString('utf8', 0, fs.readSync(fd, b, 0, b.length, 0)); } finally { fs.closeSync(fd); } } catch { continue; }
    const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(head);
    if (!m) continue;
    let cwd = ''; try { cwd = JSON.parse(`"${m[1]}"`); } catch { continue; }
    return (cwd === `/home/${old}` || cwd.startsWith(`/home/${old}/`)) && cwdToProjectDir(cwd) === path.basename(dir);
  }
  return false;
}
/** Old usernames left behind: -home-<old>-… projdirs whose /home/<old> is gone. */
function staleUsers(home, user, { homeGone = homeGoneOnDisk } = {}) {
  let dirs = [];
  try { dirs = fs.readdirSync(projectsDirOf(home)); } catch { return []; }
  const oldUsers = new Set();
  for (const d of dirs) {
    const m = /^-home-([a-z][a-z0-9]*)-/.exec(d);
    if (m && m[1] !== user && homeGone(m[1])) oldUsers.add(m[1]);
  }
  return [...oldUsers];
}

/** Re-encode -home-<old>-* → -home-<user>-* (merge, never overwrite: both sides
 *  may hold transcripts). Returns the number of projdirs moved. */
function moveUser(home, old, user) {
  const projectsDir = projectsDirOf(home);
  let moved = 0;
  for (const d of fs.readdirSync(projectsDir)) {
    if (!d.startsWith(`-home-${old}-`)) continue;
    if (`-home-${user}-`.startsWith(`-home-${old}-`) && d.startsWith(`-home-${user}-`) && !oldProjectByCwd(path.join(projectsDir, d), old)) continue;   // B-8033 cure r2/r3: vibe → vibe-alice — the new user's own folders are never moved; an old project whose name only LOOKS new is (its transcript's cwd)
    const nd = `-home-${user}-` + d.slice(`-home-${old}-`.length);
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
  let failed = 0, sameName = 0, names = [];
  try { names = fs.readdirSync(projectsDir); } catch { return { failed, sameName }; }
  for (const d of names) {
    if (!d.startsWith(`-home-${old}-`)) continue;
    if (`-home-${user}-`.startsWith(`-home-${old}-`) && d.startsWith(`-home-${user}-`) && !oldProjectByCwd(path.join(projectsDir, d), old)) continue;   // B-8033 cure r2/r3: vibe → vibe-alice — the new user's own folders are never moved; an old project whose name only LOOKS new is (its transcript's cwd)
    const src = path.join(projectsDir, d), dst = path.join(projectsDir, `-home-${user}-` + d.slice(`-home-${old}-`.length));
    let st = null; try { st = fs.lstatSync(src); } catch { continue; }
    if (!st.isDirectory()) continue;
    let files = []; try { files = fs.readdirSync(src); } catch { failed++; continue; }
    let dstDir = false; try { dstDir = fs.statSync(dst).isDirectory(); } catch { dstDir = false; }
    if (!dstDir || files.some((f) => !fs.existsSync(path.join(dst, f)))) failed++; else sameName++;
  }
  return { failed, sameName };
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
    if ((newPrefix + '-').startsWith(oldPrefix) && d.startsWith(newPrefix + '-') && !oldProjectByCwd(full, old)) continue;   // B-8033 cure r3: the new name's own folders (a deeper -x-x-… each boot, ELOOP)
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
