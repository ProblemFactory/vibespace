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
if (parentPort) {
  parentPort.on('message', (msg) => {
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
