'use strict';
// THE JOB-LOGS REMOVER'S THREAD (lane job-logs-sweep, 2026-11-12) — a worker_threads script that src/job-logs-sweep.js
// createRemover starts for a batch and terminates when its queue is empty; it THROWS on the main thread. Every syscall
// that removes anything under data/job-logs runs HERE, never on the hub's main loop and never in the fs threadpool (on the
// owner's hub data/ is a network mount). lstat only — a link is removed as a link, never followed; only `jb-…` job dirs
// and numeric run dirs are judged; an entry of any other name in a job dir is left alone by the sweep.
//   whole {ids}  — its caller's verdict (the gc, the archive cap, the ✕, the boot collapse): every entry of each job dir
//                  goes, but a run dir whose wrapper lives or cannot be judged; the job dir once empty.
//   sweep {keep, cutoff, max, count, stateFile} — THE LAW's pass (src/job-logs-sweep.js runVerdict): each job dir's runs
//                  oldest first, at most `max` removed; `count` walks on past it to count what is left (the catch-up's
//                  start); `stateFile` (the first pass after a boot) reads the catch-up record here, off the main thread.
const { isMainThread, parentPort, workerData } = require('worker_threads');
if (isMainThread) throw new Error('src/job-logs-sweep-worker.js runs only in a worker thread (src/job-logs-sweep.js starts it)');
const fs = require('fs');
const path = require('path');
const PI = require('./proc-identity.js');
const S = require('./job-logs-sweep.js');
const { answerMemory } = require('./worker-memory.js');

const logsDir = workerData.logsDir;
const BOOT = PI.bootIdOf();
const lst = (p) => { try { return fs.lstatSync(p); } catch { return null; } };

/** the run's wrapper, judged by its own stamp: true (it runs) · false (gone, recycled, a zombie, another machine boot, or no
 *  stamp at all — its wrapper never started) · null (a stamp that cannot be read or judged — such a run is KEPT). A stamp of
 *  ANY shape never throws out of here (round 2: a `null` stamp past a dropped guard threw, and every run after it in the walk
 *  went unremoved — the catch-up never ended) */
function aliveOf(runDir) {
  try { return aliveOfStamp(runDir); } catch { return null; }
}
function aliveOfStamp(runDir) {
  const f = path.join(runDir, 'pid.json'), st = lst(f);
  if (!st) return false;
  if (!st.isFile()) return null;
  let stamp; try { stamp = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
  if (!stamp || !stamp.pid) return null;
  if (stamp.bootId && BOOT && stamp.bootId !== BOOT) return false;
  return PI.aliveIdentity(stamp);
}
/** every entry under `dir` (lstat; a sub dir walked): its count and its newest mtime — null when `dir` cannot be read */
function scan(dir) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  let newest = -Infinity, n = 0;
  for (const e of ents) {
    const p = path.join(dir, e.name), st = lst(p);
    if (!st) continue;
    n++; if (st.mtimeMs > newest) newest = st.mtimeMs;
    if (st.isDirectory()) { const s = scan(p); if (s) { n += s.n; if (s.newest > newest) newest = s.newest; } }
  }
  return { newest, n };
}

function whole({ ids = [] }) {
  const out = { removed: 0, entries: 0, keptAlive: 0, gone: [], kept: [] };
  for (const id of ids) {
    if (!S.JOB_NAME.test(id)) continue;
    const jobDir = path.join(logsDir, id), st = lst(jobDir);
    if (!st) { out.gone.push(id); continue; }
    // a LINK (or a file) under a job's name: the link itself goes, never what it points at — the release's rmSync did the same
    if (!st.isDirectory()) { try { fs.unlinkSync(jobDir); out.removed++; out.entries++; out.gone.push(id); } catch { out.kept.push(id); } continue; }
    let ents; try { ents = fs.readdirSync(jobDir, { withFileTypes: true }); } catch { continue; }
    let keptHere = 0;
    for (const e of ents) {
      const p = path.join(jobDir, e.name);
      if (e.isDirectory() && S.RUN_NAME.test(e.name) && S.wholeKeeps(aliveOf(p))) { keptHere++; continue; }
      const sc = e.isDirectory() ? scan(p) : null;
      try { fs.rmSync(p, { recursive: true, force: true }); out.entries += 1 + (sc ? sc.n : 0); } catch { }
    }
    if (keptHere) { out.keptAlive += keptHere; out.kept.push(id); continue; }
    try { fs.rmdirSync(jobDir); out.removed++; out.entries++; out.gone.push(id); } catch { }
  }
  return out;
}

function sweep({ keep = {}, cutoff, max = S.PASS_MAX, count = false, stateFile = null, archiveFile = null }) {
  const t0 = Date.now();
  const out = { removed: 0, entries: 0, left: 0, leftEntries: 0, jobDirs: 0, failed: 0, more: false, kept: { listed: 0, held: 0, skeleton: 0, young: 0, alive: 0, unproven: 0 } };
  if (stateFile) { let st = null; try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { st = null; } out.state = st && typeof st === 'object' ? st : null; }
  if (count === 'auto') count = !(out.state && out.state.catchUp);
  out.counted = !!count;
  const listed = new Set(keep.listed || []), held = new Set(keep.held || []), skel = new Set(keep.skeleton || []), named = new Set(keep.named || []);
  // the archive the hub has not loaded is read HERE (never on the main thread): its records name and list as the store's do;
  // an archive that cannot be read keeps the walk from removing anything (a record it names could be lost)
  if (archiveFile) {
    let arr = null; try { arr = JSON.parse(fs.readFileSync(archiveFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') { out.error = 'the archive could not be read: ' + e.message; out.ms = Date.now() - t0; return out; } arr = []; }
    const k = S.keepSetOf({ archive: Array.isArray(arr) ? arr : [] });
    for (const x of k.named) named.add(x); for (const x of k.listed) listed.add(x); for (const x of k.skeleton) skel.add(x);
  }
  let jobs; try { jobs = fs.readdirSync(logsDir, { withFileTypes: true }); } catch (e) { if (e.code !== 'ENOENT') out.error = e.message; out.ms = Date.now() - t0; return out; }
  walk: for (const je of jobs) {
    if (!je.isDirectory() || !S.JOB_NAME.test(je.name)) continue;
    const id = je.name, jobDir = path.join(logsDir, id);
    let ents; try { ents = fs.readdirSync(jobDir, { withFileTypes: true }); } catch { continue; }
    const runs = ents.filter((e) => e.isDirectory() && S.RUN_NAME.test(e.name)).map((e) => e.name).sort((a, b) => Number(a) - Number(b));
    let removedHere = 0;
    for (const r of runs) {
      const runDir = path.join(jobDir, r), k = `${id}/${r}`;
      let sc = null;
      const v = S.runVerdict({ listed: listed.has(k), held: held.has(k), skeleton: skel.has(id), startMs: Number(r), cutoff,
        newestMs: () => { sc = scan(runDir); return !sc ? Infinity : sc.n ? sc.newest : Number(r); }, alive: () => aliveOf(runDir) });
      if (v !== 'remove') { out.kept[v]++; continue; }
      const n = 1 + (sc ? sc.n : 0);
      if (out.removed >= max) { out.more = true; if (!count) break walk; out.left++; out.leftEntries += n; continue; }
      try { fs.rmSync(runDir, { recursive: true, force: true }); out.removed++; out.entries += n; removedHere++; } catch { out.failed++; }
    }
    // a job dir no record names: removed once empty — emptied by this pass, or old itself (a young empty one may be a spawn
    // between its two mkdirs; it is left to a later pass)
    if (!named.has(id)) {
      const st = lst(jobDir);
      if (st && st.isDirectory() && (removedHere > 0 || st.mtimeMs < cutoff)) { try { fs.rmdirSync(jobDir); out.jobDirs++; out.entries++; } catch { } }
    }
  }
  out.ms = Date.now() - t0;
  return out;
}

parentPort.on('message', (msg) => {
  if (answerMemory(msg, parentPort)) return;   // the memory census (src/worker-memory.js) — answered between two ops
  let out;
  try { out = msg && msg.op === 'whole' ? whole(msg) : msg && msg.op === 'sweep' ? sweep(msg) : { error: 'unknown op' }; }
  catch (e) { out = { error: (e && e.message) || String(e) }; }
  parentPort.postMessage({ ...out, seq: msg && msg.seq });
});
