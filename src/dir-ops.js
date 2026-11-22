'use strict';
// THE FOLDER FIELD'S DISK OPS (the paired machine's folder listing, r1636: «the machine collects, the hub shapes»): dirSlice
// (a folder listed: names and types), pathStat (ONE bare stat; absent ⇒ the names under the typed prefix; `facts` ⇒ a kid's own),
// dirIndex (the bounded folder walk of the fuzzy search), mountRows (the machine's mounted folders, named) — with the facts they share (goneOf, gitOf, pkgOf, the racy tick). Cut out of
// src/safe-fs-worker.js, whose op table spreads them back unchanged (the hub's SafeFs pool runs them as before), so the DEVICE agent's
// fs worker runs the SAME three (src/agentd/agentd.js DIR_OPS — its own worker table, never the hub-callable fs-op door) without the
// worker's other ops and their libraries (xlsx, csv): one implementation where the facts live. Run ONLY on a worker thread (each is
// sync fs: a hung mount holds the worker, never a loop). node builtins only.
const fs = require('fs');
const path = require('path');

/* A stat's error as an ANSWER (B-d833, the coordinator's find 2026-11-20): only «no such file» (ENOENT, or ENOTDIR — a file where a
   folder was) says the path is not there; any other error (EACCES, EIO, ELOOP, a dead mount's ESTALE) is NOT KNOWN, said as such */
function goneOf(e) { return e && (e.code === 'ENOENT' || e.code === 'ENOTDIR') ? {} : { err: String((e && (e.message || e.code)) || e).slice(0, 200) }; }
// a folder's own facts, read INSIDE it (the folder's own listing, its probe, or its own `facts` call — B-5561): a .git there; its
// package.json name (the instance's own checkout is the one named vibespace)
const gitOf = (d) => { try { fs.statSync(path.join(d, '.git')); return true; } catch { return false; } };
// B-1c27 — A LISTING READ WITHIN ONE TIMESTAMP TICK OF ITS FOLDER'S MTIME IS RACY (the git racy-index shape): a folder's timestamps
// come from a coarse clock (a jiffy on a local disk; 1-2 s on some shares and FAT), so a kid made in the same tick as the listing
// leaves the folder's mtime where it was. The hub never sends a racy listing's mtime as `known` — the next re-statement lists the
// folder again. A mtime AHEAD of the read (another machine's clock) is racy too: listed again, never trusted.
const RACY_TICK_MS = 2000;
const pkgOf = (d) => { try { const f = path.join(d, 'package.json'); if (fs.statSync(f).size > 65536) return {}; const n = JSON.parse(fs.readFileSync(f, 'utf8')).name; return typeof n === 'string' ? { pkg: n.slice(0, 80) } : {}; } catch { return {}; } };

const OPS = {
  // THE PATH FIELD'S SLICE (lane path-field — GET /api/dir-complete): each asked folder listed ONCE — its folders, its files
  // (`files: true`, name/size/mtime; else only counted), `git` (a .git inside the listed folder itself), the folder's own mtime; a
  // folder whose mtime equals `known` answers `same` (the hub's listing cache keeps it; a listing read within a tick of its mtime says
  // `racy` — B-1c27: its mtime is never sent back as `known`). `probes` = paths stated only (a Task Group's
  // folder, a recent one, a name-derived one): exists / isDir / git / mtime / fileCount. Bounded: `maxKids` entries per folder
  // (`more`). Never walks.
  // A LISTING READS NAMES AND TYPES ONLY (B-5561): no call reaches under a kid (its .git, its package.json, a link's target), so a dead
  // folder sitting in the listed folder (one nobody typed, not a mount the hub knows) never holds its parent's rows — each kid's facts
  // come from the KID'S OWN call (pathStat `facts`). A symlink kid is named `link: ''` (its kind and target are its own call's); a file
  // kid is counted by its type, and with `files` its size and mtime come from its own stat (a file lies on its folder's filesystem,
  // never a mount). Said and left: on a filesystem whose listing carries no entry types, Node's readdir itself lstats each entry.
  dirSlice({ dirs = [], probes = [], files = false, maxKids = 400 }) {
    const out = [];
    for (const want of dirs) {
      const d = want && want.path;
      if (!d) continue;
      let st = null;
      try { st = fs.statSync(d); } catch (e) { out.push({ path: d, exists: false, ...goneOf(e) }); continue; }
      if (!st.isDirectory()) { out.push({ path: d, exists: true, isDir: false, size: st.size, mtime: st.mtimeMs }); continue; }
      if (want.known != null && want.known === st.mtimeMs) { out.push({ path: d, exists: true, isDir: true, same: true, mtime: st.mtimeMs }); continue; }
      let list = [];
      const readAt = Date.now();   // (r1748: the read's own time, taken BEFORE the readdir — a slow listing never shrinks its racy window)
      try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { out.push({ path: d, exists: true, isDir: true, mtime: st.mtimeMs, unreadable: String(e.code || e.message || e) }); continue; }
      list.sort((a, b) => a.name.localeCompare(b.name));
      const kids = []; const fl = []; let fileCount = 0; let more = false; let n = 0;
      for (const e of list) {
        if (++n > maxKids) { more = true; break; }
        if (e.isDirectory()) { kids.push({ name: e.name }); continue; }
        if (e.isSymbolicLink()) { kids.push({ name: e.name, link: '' }); continue; }   // (its kind and target: its own call's)
        if (e.isFile()) {
          fileCount++;
          if (files) { let t = null; try { t = fs.statSync(path.join(d, e.name)); } catch { } fl.push({ name: e.name, size: t ? t.size : 0, mtime: t ? t.mtimeMs : 0 }); }
        }
      }
      const racy = readAt - st.mtimeMs < RACY_TICK_MS;
      out.push({ path: d, exists: true, isDir: true, mtime: st.mtimeMs, ...(racy ? { racy: true } : {}), git: gitOf(d), kids, ...(files ? { files: fl } : {}), fileCount, more });
    }
    const pr = [];
    for (const p of probes) {
      if (!p) continue;
      let st = null;
      try { st = fs.statSync(p); } catch (e) { pr.push({ path: p, exists: false, ...goneOf(e) }); continue; }
      if (!st.isDirectory()) { pr.push({ path: p, exists: true, isDir: false, size: st.size, mtime: st.mtimeMs }); continue; }
      let fileCount = 0;
      try { for (const e of fs.readdirSync(p, { withFileTypes: true })) if (e.isFile()) fileCount++; } catch { fileCount = null; }
      pr.push({ path: p, exists: true, isDir: true, mtime: st.mtimeMs, git: gitOf(p), fileCount });
    }
    return { result: { dirs: out, probes: pr } };
  },

  // THE FOLDER FIELD'S LINE (B-d833, its fourth shape — the coordinator's ruling 2026-11-20 03:24Z): ONE BARE STAT of `path` — is it
  // there, is it a folder (no readdir count, no .git: a living folder that is merely large never times out), its link's target; a stat
  // that failed for another reason than the path's absence says its error. When it is ABSENT and `names` is given (the typed last
  // segment), the SAME call reads the NAMES in its parent that start with it (a readdir — never a stat of any kid: a dead sibling cannot
  // hang it). NAMES ONLY: the one match is stated by the hub, under ITS OWN name, through the door every level uses (it joins a call
  // already out, obeys the marks, the skip list and the pool's blocked check — the read of the fourth shape, 2026-11-20 11:34Z). `files`
  // lets a file be the answer.
  pathStat({ path: p, names = null, files = false, facts = false }) {
    const bare = (q) => { try { const st = fs.statSync(q); const o = { path: q, exists: true, isDir: st.isDirectory() }; if (o.isDir) { try { if (fs.lstatSync(q).isSymbolicLink()) o.link = fs.realpathSync(q); } catch { } } else if (facts) { o.size = st.size; o.mtime = st.mtimeMs; } return o; } catch (e) { return { path: q, exists: false, ...goneOf(e) }; } };
    const stat = bare(p);
    // `facts` (B-5561): a KID's facts in the kid's own call — a folder's git and package.json name, a file's size and mtime (a link to
    // a file is a file of its folder) — read inside the kid, nothing beside it
    if (facts && !stat.err) { stat.facts = true; if (stat.isDir) { stat.git = gitOf(p); Object.assign(stat, pkgOf(p)); } }
    if (names != null && !stat.exists && !stat.err) {
      const pre = String(names).toLowerCase(), dir = path.dirname(p), hits = [];
      try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (!e.name.toLowerCase().startsWith(pre)) continue; if (e.isDirectory() || e.isSymbolicLink() || (files && e.isFile())) { hits.push(e.name); if (hits.length > 20) break; } } }
      catch (e) { const g = goneOf(e); if (g.err) stat.namesErr = g.err; }
      stat.names = hits.slice(0, 20);
    }
    return { result: { stat } };
  },

  // THE PATH FIELD'S FOLDER INDEX (lane path-field — the whole-path fuzzy search): the folders under `roots`, breadth
  // first, `depth` levels, at most `max`, stopping at `budgetMs` (`partial`). Dot-folders, dependency / cache folders and
  // `skip` (the instance's own checkout + data dir, the mounts — a mount is named, never walked) are not entered; a
  // folder on another device is not entered; a symlink to a folder is reported as a link (`links`), never followed.
  dirIndex({ roots = [], depth = 4, max = 6000, budgetMs = 350, skip = [] }) {
    const t0 = Date.now();
    const SKIP = new Set(['node_modules', '__pycache__', 'snap', 'venv', 'site-packages', 'target', 'build', 'dist']);
    const skipSet = new Set(skip);
    const dirs = []; const links = []; let partial = false;
    const seen = new Set();
    let q = [];
    for (const r of roots) { let st = null; try { st = fs.statSync(r); } catch { continue; } if (st.isDirectory() && !seen.has(r)) { seen.add(r); q.push({ p: r, level: 0, dev: st.dev }); } }
    while (q.length) {
      const next = [];
      for (const { p, level, dev } of q) {
        if (Date.now() - t0 > budgetMs || dirs.length >= max) { partial = true; break; }
        let list;
        try { list = fs.readdirSync(p, { withFileTypes: true }); } catch { continue; }
        for (const e of list) {
          if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
          const c = path.join(p, e.name);
          if (skipSet.has(c) || seen.has(c)) continue;
          if (e.isSymbolicLink()) { let t = null; try { t = fs.statSync(c); } catch { continue; } if (t.isDirectory()) { let to = ''; try { to = fs.realpathSync(c); } catch { } links.push({ from: c, to }); } continue; }
          if (!e.isDirectory()) continue;
          seen.add(c);
          dirs.push(c);
          if (dirs.length >= max) { partial = true; break; }
          if (level + 1 < depth) {
            let st = null; try { st = fs.statSync(c); } catch { continue; }
            if (st.dev === dev) next.push({ p: c, level: level + 1, dev });
          }
        }
        if (partial) break;
      }
      if (partial) break;
      q = next;
    }
    return { result: { dirs, links, partial, ms: Date.now() - t0 } };
  },

  // THE MACHINE'S MOUNTED FOLDERS as the folder field names them — the sh road's own rule (src/dir-slice-script.js), kept alike: on a Mac
  // each /Volumes entry that is a folder (a link is not: «Macintosh HD» points at /), elsewhere every mount point under /mnt, /media or
  // the home (/proc/mounts, its \040 spaces read back; the label is the filesystem's type). NAMES ONLY: no mount is stated (a hung one
  // would hold the worker); the index walk never crosses into one anyway (another device). The device agent's collector reads it behind
  // its answers (src/agentd/agentd.js); the hub names its own mounts from its mount manager.
  mountRows({ home = '', platform = process.platform } = {}) {
    const rows = [];
    if (platform === 'darwin') {
      let list = []; try { list = fs.readdirSync('/Volumes', { withFileTypes: true }); } catch { }
      for (const e of list) if (e.isDirectory()) rows.push({ path: '/Volumes/' + e.name, label: e.name, mounted: true });
    } else {
      let text = ''; try { text = fs.readFileSync('/proc/mounts', 'utf8'); } catch { }
      const h = String(home || '').replace(/\/+$/, '');
      for (const line of text.split('\n')) {
        const f = line.split(' '); if (f.length < 3) continue;
        const mp = f[1].replace(/\\040/g, ' ');
        if (/^\/(mnt|media)\//.test(mp) || (h && mp.startsWith(h + '/'))) rows.push({ path: mp, label: f[2], mounted: true });
      }
    }
    return { result: { rows: rows.slice(0, 200) } };
  },
};

/** the three ops by name (the device worker's and the suites' door; the hub worker spreads OPS into its own table) */
function runOp(op, payload) {
  const fn = OPS[op];
  if (!fn) throw new Error('unknown folder op: ' + op);
  return fn(payload || {});
}

module.exports = { OPS, runOp, goneOf, gitOf, pkgOf, RACY_TICK_MS };
