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

const projectsDirOf = (home) => path.join(home, '.claude', 'projects');

/** Is /home/<old> gone (a renamed user's old home)? — the default for a caller that hands none; migrateHomeRename hands its ONE
 *  injectable homeGone to both sources of an old user (B-8033 cure), so a test never depends on the paths of its machine. */
const homeGoneOnDisk = (old) => absentOnDisk(`/home/${old}`);
/** B-574d follow 3 (主开发 r5068, R6): «not there» is the ONLY absent — a look refused for any other cause is not «absent» (the old home
 *  not gone, a name in the new folder not free): nothing acts on a look that failed; it waits for a start that can see. */
function absentOnDisk(p) { return lookOf(p) === 'absent'; }
/** …ONE stat: 'present', 'absent' (ENOENT only) or the refusal's code (follow 3's second read: every refused look is named and owed). */
function lookOf(p) { try { fs.statSync(p); return 'present'; } catch (e) { return e && e.code === 'ENOENT' ? 'absent' : ((e && e.code) || 'error'); } }
/** B-8033 cure 2 (主开发's law): THE PERSON'S OWN FOLDERS ARE NEVER MOVED. A folder name is claude's encoding of a working folder
 *  (every character but a letter or a digit becomes '-' — src/harnesses/helper-transcripts.js projDirOf), so a name alone never
 *  says whose a folder is (`-home-vibe-alice-notes`: /home/vibe/alice-notes or /home/vibe-alice/notes or /home/vibe.alice/notes).
 *  A folder MOVES only when its transcripts say it is an old project still in place; anything else stays. */
const projDirOf = (cwd) => String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-');
const ownPrefixOf = (user) => projDirOf(path.posix.join('/home', String(user)));
const underPrefix = (d, P) => d === P || d.startsWith(P + '-');
const CWD_READ_MAX = 1024 * 1024;   // per transcript: far enough for any record that names its working folder
// B-8033 cure 3: THE BOOT READS ARE BOUNDED AND DONE ONCE — a folder's transcripts share READ_BUDGET bytes; a folder whose
// transcripts do not all speak within it is undecided (it stays, said), never a guess. Counted (readCounts) for the legs.
const READ_BUDGET = 8 * 1024 * 1024;
const reads = { opens: 0, bytes: 0, folders: 0 };
const readCounts = () => ({ ...reads });
const READ_ERR = Symbol('unreadable'), OVER = Symbol('over budget');
/** The first record of a transcript that carries its OWN working folder (a top-level `cwd`) — a record without one never ends
 *  the search; null = none in the first CWD_READ_MAX bytes; READ_ERR = the transcript could not be read (EIO, ESTALE …). */
function firstCwdOf(file, budget = { left: READ_BUDGET }) {
  const { StringDecoder } = require('string_decoder');
  const dec = new StringDecoder('utf8'), b = Buffer.alloc(65536);
  const cwdOfLine = (l) => { if (!l || !l.includes('"cwd"')) return null; try { const o = JSON.parse(l); return o && typeof o === 'object' && typeof o.cwd === 'string' && o.cwd ? o.cwd : null; } catch { return null; } };
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    reads.opens++;
    let pos = 0, rest = '';
    while (pos < CWD_READ_MAX) {
      if (budget.left <= 0) return OVER;
      const n = fs.readSync(fd, b, 0, Math.min(b.length, budget.left), pos);
      if (n <= 0) break;
      pos += n; budget.left -= n; reads.bytes += n;
      const text = dec.write(b.subarray(0, n));
      let at = text.indexOf('\n');
      if (at < 0) { rest += text; continue; }   // a long line: carried, never re-split
      let c = cwdOfLine(rest + text.slice(0, at));
      if (c != null) return c;
      for (let from = at + 1; (at = text.indexOf('\n', from)) >= 0; from = at + 1) { c = cwdOfLine(text.slice(from, at)); if (c != null) return c; rest = ''; }
      rest = text.slice(text.lastIndexOf('\n') + 1);
    }
    return cwdOfLine(rest + dec.end());
  } catch (e) {   // follow 3's second read: a transcript NOT THERE (a dangling link) is no evidence — every other failure is a look owed, its code kept
    if (e && e.code === 'ENOENT') return null;
    budget.err = (e && e.code) || 'error'; return READ_ERR;
  } finally { if (fd != null) { try { fs.closeSync(fd); } catch { } } }
}
/** Whose is this `-home-<old>…` folder? Every transcript in it is asked, within the folder's READ_BUDGET: 'old' = each one that
 *  names a working folder names a /home/<old>(/…) one whose encoding IS the folder's name (an old project still in place — once
 *  moved, the name no longer matches: never moved twice); 'own' = each names a working folder outside /home/<old>; null = none
 *  says, they DISAGREE, one names a folder under /home/<old> whose encoding is NOT this name (cure 3: undecided, said — never
 *  silently «own»), or the budget ran out first — the folder stays, said; 'error' = a transcript could not be read — a failed
 *  move (tried again, bounded), never a verdict.
 *  Two working folders can encode to ONE name (/home/vibe/alice-notes and /home/vibe-alice/notes both → -home-vibe-alice-notes):
 *  the folder moves only when EVERY transcript that names a working folder says «old project in place»; a transcript that names
 *  none cannot veto — it is no evidence either way. */
function ownerByCwd(dir, old, why = null) {   // why: the failed look's file and code, for its line (follow 3)
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort(); } catch (e) { if (why) why.code = (e && e.code) || 'error'; return 'error'; }
  reads.folders++;
  const seen = new Set(), budget = { left: READ_BUDGET };
  for (const f of names) {
    const cwd = firstCwdOf(path.join(dir, f), budget);
    if (cwd === READ_ERR) { if (why) { why.code = budget.err || 'error'; why.file = f; } return 'error'; }
    if (cwd === OVER) return null;
    if (cwd == null) continue;
    const underOld = cwd === `/home/${old}` || cwd.startsWith(`/home/${old}/`);
    seen.add(!underOld ? 'own' : projDirOf(cwd) === path.basename(dir) ? 'old' : '?');
  }
  return seen.size === 1 && !seen.has('?') ? [...seen][0] : null;
}
/** B-8033 cure 3: ONE verdict per candidate folder per boot — the move and the count of what is left read THIS map, never a
 *  transcript twice. A link (the symlinked-home deploy) is no candidate: lstat first, nothing is ever read through it. */
const whyOf = (m) => m.why || (m.why = new Map());   // the verdicts not taken, by folder: { name, code } (said by the caller)
function ownersOf(home, old) {
  const projectsDir = projectsDirOf(home), out = new Map();
  let names = []; try { names = fs.readdirSync(projectsDir); } catch (e) { if (!(e && e.code === 'ENOENT')) out.unlisted = (e && e.code) || 'error'; return out; }   // R6: a listing refused is no «none»
  for (const d of names) {
    if (!oldFolderOf(d, old)) continue;
    let st = null; try { st = fs.lstatSync(path.join(projectsDir, d)); } catch (e) { if (!(e && e.code === 'ENOENT')) { out.set(d, 'error'); whyOf(out).set(d, { name: d, code: (e && e.code) || 'error' }); } continue; }   // R6: refused ⇒ a failed move, tried again
    if (!st.isDirectory()) continue;
    const why = {}, v = ownerByCwd(path.join(projectsDir, d), old, why);
    out.set(d, v);
    if (v === 'error') whyOf(out).set(d, { name: why.file ? `${d}/${why.file}` : d, code: why.code || 'error' });
  }
  return out;
}
const ctxOwners = (ctx, home, old) => (ctx && ctx.owners) || (ctx ? (ctx.owners = ownersOf(home, old)) : ownersOf(home, old));
/** The folders a move of <old> asks about: its bare home folder `-home-<old>` (conversations started in ~) and `-home-<old>-…`;
 *  the new name of one: the bare one → the new bare folder, any other → under it. */
const oldFolderOf = (d, old) => d === `-home-${old}` || d.startsWith(`-home-${old}-`);
const newNameOf = (d, old, P) => (d === `-home-${old}` ? P : P + '-' + d.slice(`-home-${old}-`.length));
/** Old usernames left behind: -home-<old>-… projdirs whose /home/<old> is gone. */
function staleUsers(home, user, { homeGone = homeGoneOnDisk, say = null } = {}) {
  let dirs = [];
  try { dirs = fs.readdirSync(projectsDirOf(home)); }
  catch (e) { if (say && !(e && e.code === 'ENOENT')) say(`[migrate] home rename: ~/.claude/projects could not be listed (${(e && e.code) || 'error'}) — its old users wait for a start that can list it`); return []; }   // R6
  const oldUsers = new Set();
  for (const d of dirs) {
    const m = /^-home-([a-z][a-z0-9]*)(?:-|$)/.exec(d);   // B-8033 cure 2: the old user's bare home folder names it too
    if (m && m[1] !== user && homeGone(m[1])) oldUsers.add(m[1]);
  }
  return [...oldUsers];
}

/** Re-encode -home-<old>-* → -home-<user>-* (merge, never overwrite: both sides
 *  may hold transcripts). Returns the number of projdirs moved. */
function moveUser(home, old, user, ctx = null) {
  const projectsDir = projectsDirOf(home);
  let moved = 0;
  const P = ownPrefixOf(user), owners = ctxOwners(ctx, home, old);
  // follow 3 (its read): «not there» is nothing to move, and a refused listing moves nothing (ownersOf marked it: the count of what is
  // left says failed) — never a throw that ends the whole start's other old users and their owed rewrites
  let names = []; try { names = fs.readdirSync(projectsDir); } catch { return 0; }
  for (const d of names) {
    if (owners.get(d) !== 'old') continue;   // B-8033 cure 2/3: only an old project still in place moves (this boot's one verdict) — the person's own, an undecided one and an unreadable one stay
    const nd = newNameOf(d, old, P);
    const src = path.join(projectsDir, d), dst = path.join(projectsDir, nd);
    try {
      if (absentOnDisk(dst)) { fs.renameSync(src, dst); moved++; }   // follow 4 (r5221): a refused look at the destination is no free name either
      else {
        for (const f of fs.readdirSync(src)) {
          if (absentOnDisk(path.join(dst, f))) fs.renameSync(path.join(src, f), path.join(dst, f));   // R6: a refused look is no free name (a rename would replace a transcript)
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
function leftAfterMove(home, old, user, ctx = null) {
  const projectsDir = projectsDirOf(home);
  let failed = 0, sameName = 0, undecided = 0, unread = 0, names = [];   // unread: the refused looks (a verdict not taken — owed, never «gave up»)
  const refused = [], cannot = (name, code) => { failed++; unread++; refused.push({ name, code }); };   // each refused look by its name and code
  const P = ownPrefixOf(user), owners = ctxOwners(ctx, home, old);
  const judged = [...owners.values()].filter((v) => v === 'old').length;
  if (owners.unlisted) { cannot('~/.claude/projects', owners.unlisted); return { failed, sameName, undecided, judged, unread, refused }; }   // R6: the verdicts' listing was refused — not whole (tried again); said once
  // R6: a listing refused after the move ran is NOT «nothing left» — failed (tried again), this start's verdict kept (its rewrite runs now)
  try { names = fs.readdirSync(projectsDir); } catch (e) { if (!(e && e.code === 'ENOENT')) cannot('~/.claude/projects', (e && e.code) || 'error'); return { failed, sameName, undecided, judged, unread, refused }; }
  for (const d of names) {
    if (!owners.has(d)) continue;   // B-8033 cure 3: not a candidate of this boot's first pass (a destination, a link) — never read
    const who = owners.get(d);   // own ⇒ never moved; undecided ⇒ stays, said; unreadable ⇒ failed (tried again)
    if (who === 'error') { const w = owners.why && owners.why.get(d); cannot(w ? w.name : d, w ? w.code : 'error'); continue; }
    if (who === null) { undecided++; continue; }
    if (who !== 'old') continue;
    const nd = newNameOf(d, old, P), src = path.join(projectsDir, d), dst = path.join(projectsDir, nd);
    let st = null; try { st = fs.lstatSync(src); } catch (e) { if (!(e && e.code === 'ENOENT')) cannot(d, (e && e.code) || 'error'); continue; }   // R6: gone = moved; refused = not known moved
    if (!st.isDirectory()) continue;
    let files = []; try { files = fs.readdirSync(src); } catch (e) { cannot(d, (e && e.code) || 'error'); continue; }
    let dstSt = null; try { dstSt = fs.statSync(dst); } catch (e) { if (!(e && e.code === 'ENOENT')) { cannot(nd, (e && e.code) || 'error'); continue; } }
    if (!dstSt || !dstSt.isDirectory()) { failed++; continue; }
    const looks = files.map((f) => [f, lookOf(path.join(dst, f))]), bad = looks.find(([, l]) => l !== 'present' && l !== 'absent');
    if (bad) cannot(`${nd}/${bad[0]}`, bad[1]); else if (looks.some(([, l]) => l === 'absent')) failed++; else sameName++;
  }
  return { failed, sameName, undecided, judged, unread, refused };
}

/** The symlinked-home deploy (2.236.1): rename each -home-<old>-* dir to the
 *  new encoding and leave the old name as a symlink (cwdToProjectDir over
 *  recorded /home/<old> cwds keeps working through it). Idempotent;
 *  collisions skipped with a log. */
function relinkLegacy(home, old) {
  const projectsDir = projectsDirOf(home);
  const newPrefix = projDirOf(home); // e.g. -home-userW — B-8033 cure 3: the same encoder as everything else
  const oldPrefix = `-home-${old}-`;
  let names; try { names = fs.readdirSync(projectsDir); } catch { return; }
  let n = 0;
  for (const d of names) {
    if (!d.startsWith(oldPrefix)) continue;
    const full = path.join(projectsDir, d);
    let ds; try { ds = fs.lstatSync(full); } catch { continue; }
    if (!ds.isDirectory()) continue; // already a symlink from a prior run — lstat FIRST: nothing is read through a link
    // B-8033 cure 3: a folder under the new name (the person's own, the bare one, or one whose name cannot say) is never renamed
    // here and never read — under this deploy /home/<old> resolves to the new home, so an old project's own name keeps working
    if (underPrefix(d, newPrefix)) continue;
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

module.exports = { staleUsers, moveUser, relinkLegacy, leftAfterMove, ownersOf, readCounts };
