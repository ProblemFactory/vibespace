/**
 * safe-fs-worker.js — the fs executor that runs inside each SafeFs worker_thread.
 *
 * WHY THIS EXISTS / WHY EVERY OP IS SYNCHRONOUS:
 *   libuv's thread pool is PROCESS-GLOBAL and shared by the main thread AND all
 *   worker_threads. So async fs (fs.promises / streams) in a worker would draw
 *   from the SAME pool as main — a hung mount would starve everyone anyway, and
 *   the isolation would be a lie. The isolation comes from SYNC fs running on
 *   the worker's OWN dedicated event-loop THREAD: a statSync on a wedged mount
 *   blocks THIS worker's thread only, leaving main's event loop and the shared
 *   thread pool completely free. SafeFs (main) enforces a per-call deadline and
 *   terminate()s a wedged worker, spawning a replacement. Therefore: NEVER
 *   introduce async fs / streams here — that would silently re-share main's pool.
 *
 * The same runOp() is required by src/safe-fs.js as a last-resort in-main
 * fallback (only if the whole pool is unavailable), so it stays pure/exported.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');

// Own thread-pool sizing (documentational — we use SYNC fs so the pool is
// barely touched; the real isolation is sync-on-worker-thread, see the header).
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '8';

// Quote-aware CSV field split — MIRRORS splitCsvLine in src/routes/files.js
// (kept in lockstep so csvRange returns byte-identical rows). If you change one,
// change the other.
function splitCsvLine(line, sep) {
  const out = [];
  let cur = '', inQ = false, wasQuoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"' && cur === '') {
      inQ = true; wasQuoted = true;
    } else if (ch === sep) {
      out.push(wasQuoted ? cur : cur.trim()); cur = ''; wasQuoted = false;
    } else cur += ch;
  }
  out.push(wasQuoted ? cur : cur.trim());
  return out;
}

// lane file-preview-mount (userW inc-mvq4hn9x): a document preview's WHOLE file, bounded — a regular file over `capBytes`
// is refused by name (status 413, its size) before a byte is read. r2: the READ is the bound, not the stat — a FIFO, a
// special file or a file that grows reads at most cap + 1 bytes, and the (cap + 1)th byte says «too big» (its size
// unknown: «over N MB»). The read runs on this worker's thread: on the main thread the mount guard refuses a sync read of
// a storage mount (src/server/sync-fs-witness.js) and an async one waits in the shared pool.
function readCapped(p, capBytes) {
  const capMb = Math.round(capBytes / 1048576);
  const tooBig = (size) => Object.assign(new Error(size != null ? `file too large to preview (${(size / 1048576).toFixed(1)} MB > ${capMb} MB)` : `file too large to preview (over ${capMb} MB)`), { status: 413, size });
  const fd = fs.openSync(p, 'r');
  try {
    const st = fs.fstatSync(fd);
    if (capBytes && st.isFile() && st.size > capBytes) throw tooBig(st.size);
    const want = capBytes ? capBytes + 1 : Infinity;
    const chunks = [];
    let got = 0;
    while (got < want) {
      const room = Math.min(want - got, 1 << 20);
      const b = Buffer.allocUnsafe(room);
      const n = fs.readSync(fd, b, 0, room, null);
      if (!n) break;
      chunks.push(n === room ? b : b.subarray(0, n));
      got += n;
    }
    if (capBytes && got > capBytes) throw tooBig(undefined);
    return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, got);
  } finally { fs.closeSync(fd); }
}

// ── Op implementations. Each returns { result } and optionally { transfer }
// (a list of ArrayBuffers to hand off zero-copy). All paths are ALREADY resolved
// by the main process (path.resolve/safePath) — the worker never re-derives or
// validates paths; it just executes. ──
const OPS = {
  // Directory listing for GET /api/files — one round-trip: readdir + per-entry
  // stat, mirroring the route's original output exactly.
  listDir({ path: dirPath }) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries.map(e => {
      let stat = null;
      try { stat = fs.statSync(path.join(dirPath, e.name)); } catch {}
      return {
        name: e.name,
        isDirectory: e.isDirectory() || (e.isSymbolicLink() && !!stat?.isDirectory()),
        size: stat?.size || 0,
        modified: stat?.mtimeMs || 0,
        created: stat?.birthtimeMs || 0,
      };
    });
    return { result: { items } };
  },

  // Directory names for GET /api/dir-complete — resolves symlink-dirs like the
  // original (statSync only on symlinks; regular entries use the Dirent type).
  readdirNames({ path: dirPath }) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const out = [];
    for (const e of entries) {
      let isDir = e.isDirectory();
      if (!isDir && e.isSymbolicLink()) {
        try { isDir = fs.statSync(path.join(dirPath, e.name)).isDirectory(); } catch { isDir = false; }
      }
      out.push({ name: e.name, isDirectory: isDir });
    }
    return { result: { entries: out } };
  },

  // GET /api/home-folders (lane door-day-one-landing): the home's folders, each with a BOUNDED count of the regular files it
  // holds — the New Session dialog's folder chips (src/day-one.js folderChips orders them). Hidden names and dependency /
  // cache folders are skipped; a folder that is a MOUNT POINT (named in /proc/self/mountinfo, or on another device) is named,
  // never walked (a hung mount never answers a stat); the walk stops at `cap` entries per folder (`more`) and `depth` levels;
  // symlinked folders inside are not followed (lstat-free: a Dirent's own type).
  folderCensus({ path: dirPath, cap = 2000, depth = 4, max = 24 }) {
    let mps = null;
    try {
      mps = new Set();
      for (const ln of fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n')) {
        const f = ln.split(' ');
        if (f.length > 4) mps.add(f[4].replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))));
      }
    } catch { mps = null; }
    const top = fs.statSync(dirPath);
    const SKIP = new Set(['node_modules', '__pycache__', 'snap']);
    const out = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= max) break;
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      const p = path.join(dirPath, e.name);
      if (mps && mps.has(p)) { out.push({ name: e.name, path: p, files: null, mount: true }); continue; }
      let st = null;
      try { st = fs.statSync(p); } catch { continue; }   // a dangling link
      if (!st.isDirectory()) continue;
      if (st.dev !== top.dev) { out.push({ name: e.name, path: p, files: null, mount: true }); continue; }
      let files = 0, seen = 0, more = false;
      const walk = (d, level) => {
        let list;
        try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const x of list) {
          if (++seen > cap) { more = true; return; }
          if (x.name.startsWith('.')) continue;
          if (x.isFile()) files++;
          else if (x.isDirectory() && level < depth && !SKIP.has(x.name)) { walk(path.join(d, x.name), level + 1); if (more) return; }
        }
      };
      walk(p, 1);
      out.push({ name: e.name, path: p, files, more });
    }
    return { result: { folders: out } };
  },

  // THE PATH FIELD'S SLICE (lane path-field — GET /api/dir-complete): each asked folder listed ONCE with its facts — its
  // folders (a symlink to a folder resolved: `link` = its target), its files (`files: true`, name/size/mtime; else only
  // counted), `git` (a .git inside), the folder's own mtime; a folder whose mtime equals `known` answers `same` (the hub's
  // listing cache keeps it). `probes` = paths stated only (a Task Group's folder, a recent one, a name-derived one):
  // exists / isDir / git / mtime / fileCount. Bounded: `maxKids` entries per folder (`more`). Never walks.
  dirSlice({ dirs = [], probes = [], files = false, maxKids = 400, pkg = false }) {
    const gitOf = (d) => { try { fs.statSync(path.join(d, '.git')); return true; } catch { return false; } };
    // `pkg` (the home's listing): a folder's package.json name — the instance's own checkout is the one named vibespace
    const pkgOf = (d) => { try { const f = path.join(d, 'package.json'); if (fs.statSync(f).size > 65536) return {}; const n = JSON.parse(fs.readFileSync(f, 'utf8')).name; return typeof n === 'string' ? { pkg: n.slice(0, 80) } : {}; } catch { return {}; } };
    const out = [];
    for (const want of dirs) {
      const d = want && want.path;
      if (!d) continue;
      let st = null;
      try { st = fs.statSync(d); } catch { out.push({ path: d, exists: false }); continue; }
      if (!st.isDirectory()) { out.push({ path: d, exists: true, isDir: false, size: st.size, mtime: st.mtimeMs }); continue; }
      if (want.known != null && want.known === st.mtimeMs) { out.push({ path: d, exists: true, isDir: true, same: true, mtime: st.mtimeMs }); continue; }
      let list = [];
      try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { out.push({ path: d, exists: true, isDir: true, mtime: st.mtimeMs, unreadable: String(e.code || e.message || e) }); continue; }
      list.sort((a, b) => a.name.localeCompare(b.name));
      const kids = []; const fl = []; let fileCount = 0; let more = false; let n = 0;
      for (const e of list) {
        if (++n > maxKids) { more = true; break; }
        const p = path.join(d, e.name);
        if (e.isDirectory()) { kids.push({ name: e.name, git: gitOf(p), ...(pkg ? pkgOf(p) : {}) }); continue; }
        if (e.isSymbolicLink()) {
          let t = null; try { t = fs.statSync(p); } catch { continue; }   // a dangling link
          if (t.isDirectory()) { let to = ''; try { to = fs.realpathSync(p); } catch { } kids.push({ name: e.name, git: gitOf(p), link: to }); continue; }
          if (t.isFile()) { fileCount++; if (files) fl.push({ name: e.name, size: t.size, mtime: t.mtimeMs }); }
          continue;
        }
        if (e.isFile()) {
          fileCount++;
          if (files) { let t = null; try { t = fs.statSync(p); } catch { } fl.push({ name: e.name, size: t ? t.size : 0, mtime: t ? t.mtimeMs : 0 }); }
        }
      }
      out.push({ path: d, exists: true, isDir: true, mtime: st.mtimeMs, git: gitOf(d), kids, ...(files ? { files: fl } : {}), fileCount, more });
    }
    const pr = [];
    for (const p of probes) {
      if (!p) continue;
      let st = null;
      try { st = fs.statSync(p); } catch { pr.push({ path: p, exists: false }); continue; }
      if (!st.isDirectory()) { pr.push({ path: p, exists: true, isDir: false, size: st.size, mtime: st.mtimeMs }); continue; }
      let fileCount = 0;
      try { for (const e of fs.readdirSync(p, { withFileTypes: true })) if (e.isFile()) fileCount++; } catch { fileCount = null; }
      pr.push({ path: p, exists: true, isDir: true, mtime: st.mtimeMs, git: gitOf(p), fileCount });
    }
    return { result: { dirs: out, probes: pr } };
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

  // stat (+ optional dir entryCount) for GET /api/file/stat, and the fail-fast
  // guards on raw/download/excel. mode is returned raw; the route formats it.
  stat({ path: p, entryCount }) {
    const st = fs.statSync(p);
    const r = {
      isDirectory: st.isDirectory(),
      isFile: st.isFile(),
      size: st.size,
      mtimeMs: st.mtimeMs,
      birthtimeMs: st.birthtimeMs,
      mode: st.mode,
      uid: st.uid,
      gid: st.gid,
    };
    if (entryCount && st.isDirectory()) {
      try { r.entryCount = fs.readdirSync(p).length; } catch {}
    }
    return { result: r };
  },

  // GET /api/file/info: stat + binary sniff (first 8KB null-byte scan).
  fileInfo({ path: p }) {
    const st = fs.statSync(p);
    let isBinary = false;
    try {
      const fd = fs.openSync(p, 'r');
      const buf = Buffer.alloc(8192);
      const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
      fs.closeSync(fd);
      for (let i = 0; i < bytesRead; i++) { if (buf[i] === 0) { isBinary = true; break; } }
    } catch {}
    return { result: { size: st.size, modified: st.mtimeMs, isBinary, isDirectory: st.isDirectory() } };
  },

  // GET /api/file/content: size-capped utf-8 read. Throws with .size when too
  // large so the route can echo the original {error, size} shape.
  readText({ path: p, maxSize }) {
    const st = fs.statSync(p);
    if (maxSize && st.size > maxSize) {
      const e = new Error('File too large (>10MB). Use hex viewer.');
      e.size = st.size;
      throw e;
    }
    const content = fs.readFileSync(p, 'utf-8');
    return { result: { content, size: st.size } };
  },

  // GET /api/file/binary: raw byte range → transferred ArrayBuffer (zero-copy).
  readChunk({ path: p, offset, length }) {
    const fd = fs.openSync(p, 'r');
    let bytesRead = 0, size = 0;
    const buf = Buffer.alloc(length);
    try {
      bytesRead = fs.readSync(fd, buf, 0, length, offset);
      size = fs.fstatSync(fd).size;
    } finally { fs.closeSync(fd); }
    // Slice to actual bytes, then hand off the underlying ArrayBuffer.
    const slice = buf.subarray(0, bytesRead);
    const ab = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
    return { result: { buffer: ab, bytesRead, size }, transfer: [ab] };
  },

  // GET /api/file/docx (lane file-preview-mount): the whole file up to capBytes (readCapped) → a transferred ArrayBuffer;
  // the route parses the BUFFER (mammoth's {buffer}), never a path
  readFile({ path: p, capBytes }) {
    const buf = readCapped(p, capBytes);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { result: { buffer: ab, size: buf.length }, transfer: [ab] };
  },

  // GET /api/file/excel (lane file-preview-mount, userW inc-mvq4hn9x): the workbook read (readCapped) AND parsed here —
  // the lib's XLSX.readFile(path) did its own readFileSync on the main thread (refused on a storage mount) and the parse
  // of a 20 MB workbook is seconds of CPU. SafeFs runs this op in its PARSE lane (src/safe-fs.js LANES), never in the IO
  // pool. r2: the parse is bounded in every dimension — the lib parses only the first maxRows + 1 rows (sheetRows: the
  // row past the cap says «cut») and the first maxSheets sheets; the answer keeps maxCols columns and maxCell characters
  // of a cell's text. Every cut is NAMED: `truncated {rows, sheets, cols, cells}`, each sheet's own `cut`, the `limits`
  // the viewer says. r3: a cut is a fact about the cells PARSED, never the extent the file declares (`<dimension>` /
  // `!fullref`, and an unclipped `!ref` IS the declared one — a 3-row sheet may declare A1:C1048576, three columns
  // A1:AMJ3): the table ends at the last NON-EMPTY parsed cell within the caps; `cut.rows` = the non-empty rows the parse
  // met past the cap (it reads ONE row past it — the memory bound — so 1 = «the rows go on»; how far is never read),
  // `cut.cols` = the non-empty columns past maxCols among the rows shown, `cut.cells` = the texts shortened. A declared
  // extent past the shown one rides as `declared {rows, cols}` — information, never a cut.
  // The lib loads on this worker's first workbook (lazy), never in a worker that previews none.
  xlsxSheets({ path: p, capBytes, maxRows = 5000, maxSheets = 50, maxCols = 256, maxCell = 2000 }) {
    // THE LIBRARY IS THE HUB'S (主开发's merged .399 read: inlined, it grew the device bundle 31 %): build:agentd keeps it EXTERNAL,
    // so a paired machine never carries it — a workbook is parsed on the hub; asked on a device, this op refuses by name
    let XLSX;
    try { XLSX = require('xlsx'); } catch { throw Object.assign(new Error('a workbook is parsed on the hub, never on a paired machine (this machine carries no spreadsheet library)'), { code: 'xlsx_hub_only' }); }
    const wb = XLSX.read(readCapped(p, capBytes), { type: 'buffer', sheetRows: maxRows + 1, sheets: Array.from({ length: maxSheets }, (_, i) => i) });
    const truncated = { rows: 0, sheets: Math.max(0, wb.SheetNames.length - maxSheets), cols: 0, cells: 0 };
    const sheets = wb.SheetNames.slice(0, maxSheets).map((name) => {
      const ws = wb.Sheets[name], cut = { rows: 0, cols: 0, cells: 0 };
      let data = [], declared;
      if (ws && ws['!ref']) {
        const s = XLSX.utils.decode_range(ws['!ref']).s, D = XLSX.utils.decode_range(ws['!fullref'] || ws['!ref']);
        const capR = maxRows - 1, capC = s.c + maxCols - 1;   // sheetRows counts from the sheet's own row 1
        const far = { rows: new Set(), cols: new Set() };
        let er = -1, ec = -1;
        for (const k of Object.keys(ws)) {
          if (k[0] === '!' || ws[k] == null || ws[k].v == null || ws[k].v === '') continue;
          const a = XLSX.utils.decode_cell(k);
          if (a.r < s.r || a.c < s.c) continue;
          if (a.r > capR) { far.rows.add(a.r); continue; }
          if (a.r > er) er = a.r;
          if (a.c > capC) far.cols.add(a.c);
          else if (a.c > ec) ec = a.c;
        }
        cut.rows = far.rows.size;
        cut.cols = far.cols.size;
        const e = { r: er, c: Math.max(ec, s.c) };
        if (er >= s.r) data = XLSX.utils.sheet_to_json(ws, { header: 1, range: { s, e } }).map((row) => row.map((v) => {
          if (typeof v !== 'string' || v.length <= maxCell) return v;
          cut.cells++;
          return v.slice(0, maxCell) + '…';
        }));
        const shown = { rows: data.length ? e.r - s.r + 1 : 0, cols: data.length ? e.c - s.c + 1 : 0 };
        if (D.e.r - D.s.r + 1 > shown.rows || D.e.c - D.s.c + 1 > shown.cols) declared = { rows: D.e.r - D.s.r + 1, cols: D.e.c - D.s.c + 1 };
      }
      truncated.rows += cut.rows; truncated.cols += cut.cols; truncated.cells += cut.cells;
      return declared ? { name, data, cut, declared } : { name, data, cut };
    });
    return { result: { sheets, truncated, limits: { rows: maxRows, sheets: maxSheets, cols: maxCols, cell: maxCell } } };
  },

  writeFile({ path: p, content }) {
    fs.writeFileSync(p, content == null ? '' : content);
    return { result: { success: true } };
  },

  mkdir({ path: p }) {
    fs.mkdirSync(p, { recursive: true });
    return { result: { success: true } };
  },

  rename({ oldPath, newPath }) {
    fs.renameSync(oldPath, newPath);
    return { result: { success: true } };
  },

  // DELETE /api/file — auto file/dir (matches the route's statSync branch).
  remove({ path: p }) {
    const st = fs.statSync(p);
    if (st.isDirectory()) fs.rmSync(p, { recursive: true });
    else fs.unlinkSync(p);
    return { result: { success: true } };
  },

  // Unconditional remove (skip-existing archive dest cleanup); force so a
  // missing target is a no-op.
  unlink({ path: p, recursive }) {
    fs.rmSync(p, { recursive: !!recursive, force: true });
    return { result: { success: true } };
  },

  // Staged copy (restart audit #22): cpSync used to write the FINAL name
  // directly, so a crash mid-tree left a truncated dest that looked complete.
  // Copy into a `.vs-partial` sibling and rename on success — a crash leaves
  // only the clearly-marked partial. Suffix mirrors PARTIAL_SUFFIX in
  // src/routes/files.js (the du progress poll watches both names). The
  // overwrite path keeps direct cpSync merge semantics — dest already exists
  // there, and the full force re-copy IS the heal for an earlier interrupted
  // attempt (each file rewritten whole).
  copy({ src, dest, overwrite }) {
    if (overwrite) { fs.cpSync(src, dest, { recursive: true, force: true }); return { result: { success: true } }; }
    if (fs.existsSync(dest)) { const e = new Error(`EEXIST: dest exists: ${dest}`); e.code = 'EEXIST'; throw e; }
    const part = dest + '.vs-partial';
    try {
      fs.rmSync(part, { recursive: true, force: true });
      fs.cpSync(src, part, { recursive: true });
      fs.renameSync(part, dest);
    } catch (e) { try { fs.rmSync(part, { recursive: true, force: true }); } catch {} throw e; }
    return { result: { success: true } };
  },

  move({ src, dest, overwrite }) {
    if (overwrite) { try { if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true }); } catch {} }
    try { fs.renameSync(src, dest); }
    catch (e) {
      if (e.code !== 'EXDEV') throw e;
      // EXDEV fallback = copy+rm; stage through `.vs-partial` like copy() so a
      // crash mid-copy never leaves a truncated dest at the final name (#22).
      // Source is only removed after the rename landed.
      const part = dest + '.vs-partial';
      try {
        fs.rmSync(part, { recursive: true, force: true });
        fs.cpSync(src, part, { recursive: true });
        fs.renameSync(part, dest);
      } catch (e2) { try { fs.rmSync(part, { recursive: true, force: true }); } catch {} throw e2; }
      fs.rmSync(src, { recursive: true, force: true });
    }
    return { result: { success: true } };
  },

  exists({ path: p }) {
    return { result: { exists: fs.existsSync(p) } };
  },

  // lane hub-fuse-sync-guard: the Task Group context table's reads of a row on a STORAGE mount, off the main thread —
  // the SAME walk and read as src/task-groups.js _listContextFiles / _readText (scripts/test-sync-fs-census.mjs ④ runs
  // both over one folder and compares)
  contextFiles({ path: dir, cap = 100 }) {
    const out = [];
    const walk = (d, rel, depth) => {
      if (out.length >= cap || depth > 4) return;
      let entries = [];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (out.length >= cap) return;
        if (e.name === '.vibespace' || e.name === '.git' || e.name === 'node_modules') continue;
        const p = path.join(d, e.name);
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(p, r, depth + 1);
        else {
          let st; try { st = fs.statSync(p); } catch { continue; }
          out.push({ path: r, size: st.size, mtime: st.mtimeMs });
        }
      }
    };
    walk(dir, '', 0);
    return { result: out };
  },
  textHead({ path: p, cap }) {
    const st = fs.statSync(p);
    const size = st.size;
    if (size > cap) return { result: { text: '', size, binary: false, big: true } };
    const fd = fs.openSync(p, 'r');
    try {
      const b = Buffer.alloc(size);
      const n = fs.readSync(fd, b, 0, size, 0);
      const buf = b.subarray(0, n);
      if (buf.subarray(0, 8192).includes(0)) return { result: { text: '', size, binary: true, big: false } };
      return { result: { text: buf.toString('utf-8'), size, binary: false, big: false } };
    } finally { try { fs.closeSync(fd); } catch { } }
  },

  // the frame host's preview folder (lane frame-host-preview): a file's REAL path — a symlink out of the folder is judged
  // by where it lands, never by its name
  realpath({ path: p }) {
    return { result: { path: fs.realpathSync(p) } };
  },

  access({ path: p }) {
    fs.accessSync(p);
    return { result: { success: true } };
  },

  // GET /api/file/csv — SYNC port of the route's streaming line scan (offset/
  // limit/sep threaded through). StringDecoder handles multi-byte chars across
  // read-chunk boundaries (the original relied on a utf-8 stream). Returns the
  // exact shape the route emitted from its 'end'/'close' handlers.
  csvRange({ path: fp, offset = 0, limit = 100, sep = ',' }) {
    const st = fs.statSync(fp);
    const fd = fs.openSync(fp, 'r');
    const CHUNK = 1 << 16;
    const buf = Buffer.alloc(CHUNK);
    const dec = new StringDecoder('utf8');
    let partial = '', lineNum = 0, headerRow = null;
    const rows = [];
    let totalLines = 0, done = false, bytesConsumed = 0, pos = 0;
    try {
      while (true) {
        const bytesRead = fs.readSync(fd, buf, 0, CHUNK, pos);
        if (bytesRead === 0) break;
        pos += bytesRead;
        const lines = (partial + dec.write(buf.subarray(0, bytesRead))).split('\n');
        partial = lines.pop();
        for (const line of lines) {
          bytesConsumed += Buffer.byteLength(line) + 1;
          const trimmed = line.replace(/\r$/, '');
          if (!trimmed) continue;
          if (lineNum === 0) headerRow = splitCsvLine(trimmed, sep);
          else if (lineNum > offset && rows.length < limit) rows.push(splitCsvLine(trimmed, sep));
          lineNum++;
          totalLines = lineNum;
          if (rows.length >= limit && lineNum > offset + limit + 10000) { done = true; break; }
        }
        if (done) break;
      }
    } finally { fs.closeSync(fd); }
    if (done) {
      const bytesPerLine = Math.max(1, bytesConsumed) / Math.max(1, totalLines);
      const estimatedTotal = Math.round(st.size / bytesPerLine);
      return { result: { header: headerRow, rows, offset, total: estimatedTotal, fileSize: st.size, estimated: true } };
    }
    partial += dec.end();
    if (partial.trim()) { totalLines++; if (lineNum > offset && rows.length < limit) rows.push(splitCsvLine(partial, sep)); }
    return { result: { header: headerRow, rows, offset, total: totalLines, fileSize: st.size } };
  },

  // TEST-ONLY: wedge this worker's thread for `ms` to prove the deadline →
  // terminate → respawn path. Gated so it is unreachable in production
  // (no route calls it, and it refuses to run without the test env flag).
  __sleep({ ms = 60000 }) {
    if (process.env.VIBESPACE_SAFEFS_TEST !== '1') throw new Error('__sleep disabled');
    const sab = new SharedArrayBuffer(4);
    const ia = new Int32Array(sab);
    // Atomics.wait blocks THIS thread; worker.terminate() interrupts it.
    try { Atomics.wait(ia, 0, 0, ms); } catch {}
    return { result: { slept: ms } };
  },
};

function runOp(op, payload) {
  const fn = OPS[op];
  if (!fn) throw new Error('unknown fs op: ' + op);
  return fn(payload || {});
}

// ── Worker message loop (only when actually running as a worker thread) ──
let parentPort = null;
try { ({ parentPort } = require('worker_threads')); } catch {}
const { answerMemory } = require('./worker-memory.js');
if (parentPort) {
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
    const { id, op, payload } = msg || {};
    try {
      const { result, transfer } = runOp(op, payload);
      parentPort.postMessage({ id, ok: true, result }, transfer || []);
    } catch (e) {
      parentPort.postMessage({
        id, ok: false,
        error: { message: e.message, code: e.code, size: e.size, status: e.status },
      });
    }
  });
}

module.exports = { runOp, splitCsvLine };
