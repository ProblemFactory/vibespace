// THE GATE'S DIRECTORY SWEEP (B-60d2, 2026-10-07). /tmp is tmpfs (= RAM + swap) and held 30 of 62 GB: 13 986 `vs-*`
// scratch directories older than a day + /tmp/vs-work's old verify workspaces. scripts/ci.mjs `--reap` (2.369.104)
// ended PROCESSES only — judgeScratch convicts a process by its scratch ROOT and never touched a directory. This module
// is the directory half, on the same evidence: a unit (scratch.mjs SCRATCH_SWEEP.prefixes — never a hand list) is
// reaped only when NO live process names a path in it (cwd / HOME and the other root env names / --user-data-dir /
// argv — ci.mjs liveScratchPaths), its run record's owner is not alive, and the NEWEST mtime in its tree is a day old
// (a leaked server still writing is young whatever its dir's own mtime says). Never a production root, never a symlink
// (lstat, then realpath == path, then an O_NOFOLLOW fd whose inode is the lstat's), never a shell: fs.rmSync.
// dirVerdict is PURE (test-ci-gate §9d drives it as a table); sweepScratchDirs is the thin fs driver.
import fs from 'node:fs';
import path from 'node:path';
import { SCRATCH_SWEEP } from './scratch.mjs';
import { readRunRecord, runOwnerState } from './scratch-run.mjs';

export const DIR_STALE_MS = 24 * 60 * 60 * 1000;
const NAME_RE = /^[A-Za-z0-9._-]+$/;
const fmtAge = (ms) => (ms >= 3600000 ? `${Math.round(ms / 3600000)} h` : `${Math.round(ms / 60000)} min`);
export const fmtBytes = (b) => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(1)} GB` : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

/** reap | keep(why) for ONE directory entry, PURE. `mtimeMs` = the NEWEST mtime in its tree (-Infinity: not measured —
 *  only the other rules can keep it); `liveRoots` = the paths live processes name; `production` = never a unit (exact
 *  regexes); `keepList` = paths it may neither be, sit in, nor contain (the repo, its data/); `owner` = its run record's
 *  owner state (scratch-run.mjs runOwnerState) or null. */
export function dirVerdict({ path: p, name, mtimeMs, now, liveRoots = [], prefixes = SCRATCH_SWEEP.prefixes, production = SCRATCH_SWEEP.production, keepList = [], isDir = true, symlink = false, owner = null, staleMs = DIR_STALE_MS }) {
  const keep = (why) => ({ verdict: 'keep', why });
  const unit = prefixes.find((u) => path.posix.dirname(p) === u.under && path.posix.basename(p) === name && NAME_RE.test(name) && name.startsWith(u.prefix) && name.length > u.prefix.length);
  if (!unit) return keep('no minted prefix under a declared tmp root');
  const prod = production.find((re) => re.test(p));
  if (prod) return keep(`a production root (${prod})`);
  const inKeep = keepList.find((k) => p === k || p.startsWith(k + '/') || k.startsWith(p + '/'));
  if (inKeep) return keep(`a production root (${inKeep})`);
  if (symlink) return keep('a symlink (never followed, never reaped)');
  if (!isDir) return keep('not a directory');
  const held = liveRoots.find((r) => r === p || r.startsWith(p + '/'));
  if (held) return keep(`held: a live process names ${held}`);
  if (owner && owner.alive) return keep(`its run record's owner is alive (${owner.why})`);
  if (mtimeMs == null || Number.isNaN(mtimeMs)) return keep('newest write unknown (its tree could not be read)');
  const age = now - mtimeMs;
  if (age < staleMs) return keep(`young: newest write ${fmtAge(Math.max(0, age))} ago < ${fmtAge(staleMs)}`);
  return { verdict: 'reap', why: Number.isFinite(age) ? `newest write ${fmtAge(age)} ago, no live process names it` : 'no live process names it' };
}

/** The newest mtime and the bytes of a tree (lstat: a symlink is a leaf, never followed). Stops at the first entry
 *  newer than `stopAt` (the verdict is "young" either way). null newest = unreadable. */
export function treeFacts(root, { stopAt = Infinity } = {}) {
  let newest = -Infinity, bytes = 0, young = false;
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    // an entry that vanished between its listing and its lstat is skipped (its parent's mtime moved with it); any
    // other error means the tree cannot be read whole — no verdict on a partial read
    try {
      const st = fs.lstatSync(d);
      newest = Math.max(newest, st.mtimeMs); bytes += (st.blocks || 0) * 512;
      if (newest >= stopAt) { young = true; break; }
      if (st.isDirectory()) for (const e of fs.readdirSync(d)) stack.push(path.join(d, e));
    } catch (e) { if (!(e && e.code === 'ENOENT') || d === root) return { newest: null, bytes, young }; }
  }
  return { newest, bytes, young };
}

/** A unit family for the summary: `vs-chan-gmail-1234` → `vs-chan-gmail` (a pid / random tail dropped). PURE. */
export const familyOf = (name) => name.replace(/(?:[-_.][0-9]+)+$/, '').replace(/-[A-Za-z0-9]{6}$/, (t) => (/[0-9]/.test(t) && /[A-Za-z]/.test(t) ? '' : t)) || name;

/** rm -rf of a path the verdict named — refused unless it is (still) a real directory, not a symlink, under its unit root. */
export function removeUnit(p, { prefixes = SCRATCH_SWEEP.prefixes, rm = fs.rmSync } = {}) {
  if (!prefixes.some((u) => path.posix.dirname(p) === u.under)) throw new Error(`refused: ${p} is not under a declared tmp root`);
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`refused: ${p} is ${st.isSymbolicLink() ? 'a symlink' : 'not a directory'}`);
  if (fs.realpathSync(p) !== p) throw new Error(`refused: ${p} resolves to ${fs.realpathSync(p)}`);
  const fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { const f = fs.fstatSync(fd); if (f.ino !== st.ino || f.dev !== st.dev) throw new Error(`refused: ${p} changed under the judge`); } finally { fs.closeSync(fd); }
  rm(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

/** THE DRIVER: judge every unit under the declared roots, reap the ones the verdict names (unless `dryRun`), ONE line
 *  per reaped root and a summary. `liveRoots` comes from the caller (ci.mjs liveScratchPaths over /proc). */
export function sweepScratchDirs({ liveRoots = [], now = Date.now(), dryRun = false, log = console.log, prefixes = SCRATCH_SWEEP.prefixes, production = SCRATCH_SWEEP.production, keepList = [], staleMs = DIR_STALE_MS, readOwner = (d) => { const r = readRunRecord(d); return r ? runOwnerState(r) : null; }, rm, verbose = false } = {}) {
  const res = { reaped: [], kept: [], failed: [], bytes: 0 };
  for (const u of prefixes) {
    let names = [];
    try { names = fs.readdirSync(u.under); } catch { continue; }
    for (const name of names) {
      if (!name.startsWith(u.prefix)) continue;
      const p = path.posix.join(u.under, name);
      let st; try { st = fs.lstatSync(p); } catch { continue; }
      const facts = { path: p, name, now, liveRoots, prefixes, production, keepList, staleMs, isDir: st.isDirectory(), symlink: st.isSymbolicLink() };
      let v = dirVerdict({ ...facts, mtimeMs: -Infinity });
      if (v.verdict === 'reap') {
        const owner = readOwner(p);
        const t = treeFacts(p, { stopAt: now - staleMs });
        v = dirVerdict({ ...facts, owner, mtimeMs: t.newest });
        if (v.verdict === 'reap') {
          try { if (!dryRun) removeUnit(p, { prefixes, rm }); } catch (e) { res.failed.push({ path: p, why: e.message }); log(`[ci] dir sweep: could not reap ${p} — ${e.message}`); continue; }
          res.reaped.push({ path: p, name, family: familyOf(name), bytes: t.bytes, why: v.why }); res.bytes += t.bytes;
          log(`[ci] ${dryRun ? 'would reap' : 'reaped'} dir ${p} — ${v.why} — ${fmtBytes(t.bytes)}`);
          continue;
        }
      }
      res.kept.push({ path: p, why: v.why });
      if (verbose) log(`[ci]   keep dir ${p} — ${v.why}`);
    }
  }
  log(sweepSummary(res, { dryRun }));
  return res;
}

/** ONE summary line: count, bytes, the top families; the kept count by reason head. PURE. */
export function sweepSummary({ reaped = [], kept = [], failed = [], bytes = 0 } = {}, { dryRun = false } = {}) {
  const fam = new Map(); for (const r of reaped) { const f = fam.get(r.family) || { n: 0, b: 0 }; f.n++; f.b += r.bytes; fam.set(r.family, f); }
  const top = [...fam].sort((a, b) => b[1].b - a[1].b).slice(0, 6).map(([k, f]) => `${k} ${f.n} / ${fmtBytes(f.b)}`).join(', ');
  const why = new Map(); for (const k of kept) { const h = k.why.split(/[:(]/)[0].trim(); why.set(h, (why.get(h) || 0) + 1); }
  return `[ci] dir sweep: ${dryRun ? 'would reap' : 'reaped'} ${reaped.length} dir(s), ${fmtBytes(bytes)}${top ? ` (${top}${fam.size > 6 ? ', …' : ''})` : ''}; kept ${kept.length}${why.size ? ` (${[...why].map(([h, n]) => `${h} ${n}`).join(', ')})` : ''}${failed.length ? `; ${failed.length} refused` : ''}${dryRun ? ' — dry run, nothing removed' : ''}`;
}
