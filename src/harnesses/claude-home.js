'use strict';
// THE CLAUDE HOME-RENAME HOOK (store.homeRename; rv-server M5, dc-harness-store
// 2.369.213). claude encodes each per-project transcript dir under
// ~/.claude/projects from the RESOLVED cwd (-home-<user>-…), so a renamed home
// leaves every pre-rename conversation where claude's resume lookup no longer
// looks ("No conversation found"). The core owns WHEN (server.js boot
// migrateHomeRename: one-shot per old→new marker, then the generic
// recorded-path rewrite; boot-restore migrateLegacyHomeProjects: the
// /home/vibe→/home/<name> symlink deploy) and asks every harness's hook; the
// .claude/projects layout lives only here.
const fs = require('fs');
const path = require('path');
const { cwdToProjectDir } = require('../session-store');

const projectsDirOf = (home) => path.join(home, '.claude', 'projects');

/** Old usernames left behind: -home-<old>-… projdirs whose /home/<old> is gone. */
function staleUsers(home, user) {
  let dirs = [];
  try { dirs = fs.readdirSync(projectsDirOf(home)); } catch { return []; }
  const oldUsers = new Set();
  for (const d of dirs) {
    const m = /^-home-([a-z][a-z0-9]*)-/.exec(d);
    if (m && m[1] !== user && !fs.existsSync(`/home/${m[1]}`)) oldUsers.add(m[1]);
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

module.exports = { staleUsers, moveUser, relinkLegacy };
