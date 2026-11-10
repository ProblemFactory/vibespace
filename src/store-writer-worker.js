'use strict';
/**
 * THE STORE WRITER'S THREAD (lane hub-loop-stalls, commit 2 — «no store write holds the main thread»). The syscalls of
 * every store write the main thread hands it (src/store-writer.js): open a temp file, write the bytes, close,
 * rename over the store's file — synchronous HERE, on this thread only. Never on the main thread (a rename on network
 * storage took 1.3 s median, 2.6 s max on the owner's hub, every one a hold of the whole loop), and never in the fs
 * threadpool (four slow renames there would stall every other async fs call, DNS and crypto of the hub — one of our
 * whole-instance outages was that pool filled by calls stuck in a slow mount). ONE write at a time: a storage that hangs
 * holds this thread alone.
 * The shared cells (workerData.sab, Int32): [0] the job in flight (0 = idle), [1] jobs done, [2] the last job's outcome
 * (1 ok, 2 failed), [3] the length of a failed job's error code, its ASCII bytes at offset 16 (≤ 32) — the main thread
 * waits on [1] with Atomics.wait when its loop cannot turn (a synchronous flush, the exit), and THIS thread notifies [1]
 * (round 6's amend: it notified [0], so every waited write ended at the wait's 50 ms poll, never at the write's end).
 */
const { parentPort, workerData } = require('worker_threads');
const FS = require('fs');   // the real fs — each function names the one it was handed `fs` (a suite's short-write stand-in), so every census reads its calls
const path = require('path');

const S = workerData && workerData.sab ? new Int32Array(workerData.sab) : null;

/** EVERY BYTE, OR A FAILED WRITE (round 2, law A): each part is written with a loop over the count `writeSync` returns —
 *  a short write (a filling disk, a file-size limit, a FUSE / NFS server) writes the rest; a write that makes no progress
 *  is a failed write. Never one call trusted to have written everything (the string road did; a 3 MB store came out as
 *  its first 2 MiB under a 2 MiB file-size limit). */
function writeAll(fs, fd, parts) {
  for (const p of parts || []) {
    const b = typeof p === 'string' ? Buffer.from(p) : Buffer.from(p);
    let o = 0;
    while (o < b.length) {
      const n = fs.writeSync(fd, b, o, b.length - o);
      if (!(n > 0)) throw Object.assign(new Error(`a short write: ${o} of ${b.length} bytes written, then ${n}`), { code: 'ESHORT' });
      o += n;
    }
  }
}
/** a killed process leaves its temp file (`<file>.tmp-<pid>[-w]`): the first write of a file in this process removes
 *  the ones another process left (never this one's) */
const swept = new Set();
function sweepTemps(fs, file) {
  if (swept.has(file)) return;
  swept.add(file);
  const dir = path.dirname(file), base = path.basename(file) + '.tmp-';
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const n of names) {
    const m = n.startsWith(base) ? /^(\d+)(-w)?$/.exec(n.slice(base.length)) : null;
    if (m && Number(m[1]) !== process.pid) { try { fs.unlinkSync(path.join(dir, n)); } catch { } }
  }
}
/** ONE job. A whole-file write: temp, every byte, close (its error is the write's), rename — NOTHING is renamed over the
 *  store unless every byte was written and the temp closed without error. An APPEND (the acts journal): every byte,
 *  fsync, close — a failure truncates back to the size before it (no torn line is left for a promise that resolved). */
function writeJob(m, fs = FS) {
  if (m.append) {
    const fd = fs.openSync(m.file, 'a', m.mode == null ? 0o666 : m.mode);
    let err = null, size0 = null;
    try { size0 = fs.fstatSync(fd).size; writeAll(fs, fd, m.parts); fs.fsyncSync(fd); } catch (e) { err = e; }
    if (err && size0 != null) { try { fs.ftruncateSync(fd, size0); } catch { } }
    try { fs.closeSync(fd); } catch (e) { if (!err) err = e; }
    if (err) throw err;
    return;
  }
  sweepTemps(fs, m.file);
  const fd = fs.openSync(m.tmp, 'w', m.mode == null ? 0o666 : m.mode);
  let err = null;
  try { writeAll(fs, fd, m.parts); } catch (e) { err = e; }
  try { fs.closeSync(fd); } catch (e) { if (!err) err = e; }   // an error at close (an NFS server's ENOSPC) is the write's
  if (err) throw err;   // the caller removes the temp: the store keeps its previous whole version
  // `mode` applies when the temp file is CREATED; a leftover temp from a killed write keeps its old bits
  if (m.mode != null) { try { fs.chmodSync(m.tmp, m.mode); } catch { /* a filesystem without modes */ } }
  fs.renameSync(m.tmp, m.file);   // THE commit point: the store's file is the old whole version or the new one, never half
}

if (parentPort && require.main === module) {   // the thread's own script (a suite's stand-in thread requires writeJob alone)
  const { answerMemory } = require('./worker-memory.js');
  const fs = FS;
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return;   // the memory census (src/worker-memory.js) — answered at once
    const m = msg;
    if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
    if (S) Atomics.store(S, 0, m.id);
    const t0 = process.hrtime.bigint();
    let err = null;
    if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch (e) { if (!e || e.code !== 'ENOENT') err = { code: (e && e.code) || null, message: (e && e.message) || String(e) }; } }
    else { try { writeJob(m); } catch (e) { err = { code: (e && e.code) || null, message: (e && e.message) || String(e) }; if (!m.append) { try { fs.unlinkSync(m.tmp); } catch { } } } }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (S) {
      if (err && S.byteLength >= 48) { const c = Buffer.from(String(err.code || 'EWRITE').slice(0, 32), 'latin1'); new Uint8Array(S.buffer, 16, 32).set(c); Atomics.store(S, 3, c.length); } else if (S.length > 3) Atomics.store(S, 3, 0);
      Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1);   /* this thread is the count's ONE writer */ Atomics.store(S, 0, 0); Atomics.notify(S, 1);   // the cell the main thread waits on
    }
    parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err });
  });
}

module.exports = { writeJob, writeAll, sweepTemps };
