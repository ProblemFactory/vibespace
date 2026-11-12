'use strict';
// THE JOB-LOGS REMOVER'S CHILD (lane job-logs-sweep, 2026-11-12; a child process since round 2 — a process exit joins its
// threads, never its children) — src/job-logs-sweep.js createRemover forks it for a batch (an IPC channel, a built env) and
// kills it when its queue is empty; it THROWS without its IPC channel (never in the hub's own process). Every syscall
// that removes anything under data/job-logs runs HERE, never on the hub's main loop and never in the fs threadpool (on the
// owner's hub data/ is a network mount). lstat only — a link is removed as a link, never followed; only `jb-…` job dirs
// and numeric run dirs are judged; an entry of any other name in a job dir is left alone by the sweep.
//   whole {ids}  — its caller's verdict (the gc, the archive cap, the ✕, the boot collapse): every entry of each job dir
//                  goes, but a run dir whose wrapper lives or cannot be judged; the job dir once empty.
//   sweep {keep, cutoff, max, count, stateFile} — THE LAW's pass (src/job-logs-sweep.js runVerdict): each job dir's runs
//                  oldest first, at most `max` removed; `count` walks on past it to count what is left (the catch-up's
//                  start); `stateFile` (the first pass after a boot) reads the catch-up record here, off the main thread.
//   note {dir, notes} — round 4: a record store's NOTE (`<store>.corrupt-unread`, O_EXCL — one per store; EEXIST = it stands).
if (typeof process.send !== 'function') throw new Error('src/job-logs-sweep-worker.js runs only as the child src/job-logs-sweep.js forks (an IPC channel)');
const fs = require('fs');
const path = require('path');
const PI = require('./proc-identity.js');
const S = require('./job-logs-sweep.js');

const logsDir = process.argv[2];
const BOOT = PI.bootIdOf();
// «KEPT UNTIL EVIDENCE» WITH NO CLOCK (round 3 §5 — round 2's «before this machine's boot by a day» compared the STORE's clock with
// this machine's): a stamp that cannot be judged names no live writer when NO running process's argv names that run dir. The
// wrapper is the run dir's ONLY writer and its argv is `node job-wrapper.js <ctlDir> <specPath>` for its whole life (it never sets
// a title); matched by the trailing components `job-logs/<id>/<runTs>` (a respelled or relative data dir still matches; another
// instance's wrapper of the same id and stamp — a copied data dir — KEEPS ours: the safe side). The walk of /proc is read WHOLE
// (one per batch, only when an unjudgeable stamp occurs); a /proc that cannot be listed ⇒ no evidence ⇒ KEPT.
// (For the identity census: a MISS here is evidence because of those four facts — the one writer, its argv for life, the
// trailing components, the whole walk — and only then; /proc unreadable is never a miss.)
let procRoot = '/proc', writers = null;   // writers: Set of `<id>/<runTs>` named by a running process's argv; false = /proc unreadable
const RUN_IN_ARGV = /(?:^|\/)job-logs\/(jb-[0-9a-z]{1,40})\/(\d{1,16})(?:\/|$)/;
function namedRuns() {
  if (writers !== null) return writers;
  let pids; try { pids = fs.readdirSync(procRoot).filter((n) => /^\d+$/.test(n)); } catch { writers = false; return writers; }
  const set = new Set();
  for (const pid of pids) {
    let raw; try { raw = fs.readFileSync(path.join(procRoot, pid, 'cmdline'), 'latin1'); } catch { continue; }   // gone meanwhile, or not ours to read
    for (const a of raw.split('\0')) { const m = RUN_IN_ARGV.exec(a); if (m) set.add(`${m[1]}/${m[2]}`); }
  }
  writers = set; return writers;
}
// ITS HUB (round 2): the process that forked it. The production unit stops with KillMode=process and a hub can be SIGKILLed (the
// OOM killer, a crash, the unit's timeout) — nobody kills this child then; it checks between two run dirs (getppid: the parent's
// death re-parents it) and stops at once, so no remover outlives its hub by more than the one call it is in, and two removers
// never delete in one data dir at once (the next hub starts ≥ 5 s later and passes 2 min after its boot)
// round 3 §4: the hub's pid is what the hub HANDED it (argv[3]) — never getppid read ~20 ms after the fork (a hub that died in that
// window left a child whose «hub» was the reaper); a child whose parent already differs at a batch's start refuses the batch
const HUB = Number(process.argv[3]) > 1 ? Number(process.argv[3]) : process.ppid;
const hubGone = () => process.ppid !== HUB;
let orphanDir = null, orphanSeq = null;
/** the hub ended mid-batch: what this batch removed is left in a file for the next engine (counted once), then exit */
function orphaned(out) {
  if (orphanDir && out && out.removed) {
    const f = path.join(orphanDir, `${S.ORPHAN_PREFIX}${process.pid}-${orphanSeq}.json`);
    try { fs.writeFileSync(f + '.tmp', JSON.stringify({ removed: out.removed, entries: out.entries, jobDirs: out.jobDirs, at: Date.now() })); fs.renameSync(f + '.tmp', f); } catch { }
  }
  process.exit(0);
}
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
  // a stamp that cannot be judged keeps its run UNTIL EVIDENCE — no running process's argv names this run dir (no clock: §5)
  const runKey = path.basename(path.dirname(runDir)) + '/' + path.basename(runDir);
  const unproven = () => { const ws = namedRuns(); return ws === false || ws.has(runKey) ? null : false; };
  if (!st.isFile()) return unproven();
  let stamp; try { stamp = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return unproven(); }
  if (!stamp || !stamp.pid) return unproven();
  if (stamp.bootId && BOOT && stamp.bootId !== BOOT) return false;
  const v = PI.aliveIdentity(stamp);
  if (v === null && stamp.bootId && BOOT && stamp.bootId === BOOT) return null;   // a stamp that says THIS boot is never evidence of an end (§5)
  return v === null ? unproven() : v;
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
  const out = { removed: 0, entries: 0, keptAlive: 0, gone: [], kept: [], keptWhy: {} };   // keptWhy: id → 'running' | 'unjudgeable' (the ✕ says which)
  for (const id of ids) {
    if (!S.JOB_NAME.test(id)) continue;
    const jobDir = path.join(logsDir, id), st = lst(jobDir);
    if (!st) { out.gone.push(id); continue; }
    // a LINK (or a file) under a job's name: the link itself goes, never what it points at — the release's rmSync did the same
    if (!st.isDirectory()) { try { fs.unlinkSync(jobDir); out.removed++; out.entries++; out.gone.push(id); } catch { out.kept.push(id); } continue; }
    let ents; try { ents = fs.readdirSync(jobDir, { withFileTypes: true }); } catch { continue; }
    let keptHere = 0, unjudged = 0;
    for (const e of ents) {
      if (hubGone()) orphaned(null);   // a whole-dir batch: nothing to count
      const p = path.join(jobDir, e.name);
      if (e.isDirectory() && S.RUN_NAME.test(e.name)) { const a = aliveOf(p); if (S.wholeKeeps(a)) { keptHere++; if (a !== true) unjudged++; continue; } }
      const sc = e.isDirectory() ? scan(p) : null;
      try { fs.rmSync(p, { recursive: true, force: true }); out.entries += 1 + (sc ? sc.n : 0); } catch { }
    }
    if (keptHere) { out.keptAlive += keptHere; out.kept.push(id); out.keptWhy[id] = unjudged ? 'unjudgeable' : 'running'; continue; }
    try { fs.rmdirSync(jobDir); out.removed++; out.entries++; out.gone.push(id); } catch { }
  }
  return out;
}

function sweep({ keep = {}, cutoff, max = S.PASS_MAX, count = false, stateFile = null, archiveFile = null, storeFile = null, setAside = null, seq = null }) {
  const t0 = Date.now();
  // nameOld = run dirs that STARTED before the cutoff and no record lists, holds or recovered — THE CATCH-UP's count, BY NAME (a
  // counting pass walks on past `max` with readdirs only: no stat, no /proc — round 2 law 3); keptOld = of those, the ones the full
  // verdict kept (young by their newest file, live, unjudgeable) — the done line's «kept» (a complete pass's figure)
  const out = { removed: 0, entries: 0, jobDirs: 0, nameOld: 0, keptOld: 0, unnamedJobs: 0, failed: 0, more: false, kept: { listed: 0, held: 0, skeleton: 0, young: 0, alive: 0, unproven: 0 } };
  const progress = () => { if (seq != null) { try { process.send({ seq, progress: { removed: out.removed, entries: out.entries, jobDirs: out.jobDirs } }); } catch { } } };   // a pass cut at its timeout keeps its count
  if (stateFile) { let st = null; try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { st = null; } out.state = st && typeof st === 'object' ? st : null; }
  if (count === 'auto') count = !(out.state && out.state.catchUp);
  out.counted = !!count;
  const listed = new Set(keep.listed || []), held = new Set(keep.held || []), skel = new Set(keep.skeleton || []), named = new Set(keep.named || []);
  // a store the hub could not read (`storeFile`, its load failed with no set-aside) and the archive it has not loaded or could
  // not read (`archiveFile`) are read HERE, never on the main thread: their records name and list as memory's do. ONLY «the
  // file is not there» reads as no records; a read that fails, or bytes that are not a list, keep the walk from removing anything
  const readRecords = (file, what) => {
    let arr; try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e && e.code === 'ENOENT') return []; throw new Error(`the ${what} could not be read: ${(e && (e.code || e.message)) || e}`); }
    if (!Array.isArray(arr)) throw new Error(`the ${what} is not a list of records`);
    return arr;
  };
  try {
    for (const [file, what] of [[storeFile, 'store'], [archiveFile, 'archive']]) {
      if (!file) continue;
      const k = S.keepSetOf({ archive: readRecords(file, what) });
      for (const x of k.named) named.add(x); for (const x of k.listed) listed.add(x); for (const x of k.skeleton) skel.add(x);
    }
  } catch (e) { out.error = e.message; out.ms = Date.now() - t0; return out; }
  // THE HELD FACT (round 2 law 1; round 3: LAST, after every read — a set-aside the main thread made while this child read, or
  // the archive sweep's set-aside + fresh write in one call, is seen here, never read as «no file»): a record store of jobs SET ASIDE in the data dir (`jobs.json.corrupt-*`,
  // `jobs-archive.json.corrupt-*` — the bytes the hub could not read, kept by its load) — the pass removes NOTHING while one is
  // there: on every road and after every restart, because the fact is the file, never a variable. A person moving or deleting
  // it is what lifts it. A data dir that cannot be listed holds the pass too.
  if (setAside && setAside.dir) {
    let names; try { names = fs.readdirSync(setAside.dir).filter((n) => (setAside.prefixes || []).some((p) => n.startsWith(p))); } catch (e) { out.error = 'the data dir could not be listed: ' + (e.code || e.message); out.ms = Date.now() - t0; return out; }
    if (names.length) { out.heldBy = 'set-aside'; out.heldFiles = names.sort(); out.notes = notesOf(setAside.dir, out.heldFiles, setAside.prefixes || []); out.ms = Date.now() - t0; return out; }
  }
  let jobs; try { jobs = fs.readdirSync(logsDir, { withFileTypes: true }); } catch (e) { if (e.code !== 'ENOENT') out.error = e.message; out.ms = Date.now() - t0; return out; }
  walk: for (const je of jobs) {
    if (!je.isDirectory() || !S.JOB_NAME.test(je.name)) continue;
    const id = je.name, jobDir = path.join(logsDir, id);
    if (!named.has(id)) out.unnamedJobs++;
    let ents; try { ents = fs.readdirSync(jobDir, { withFileTypes: true }); } catch { continue; }
    const runs = ents.filter((e) => e.isDirectory() && S.RUN_NAME.test(e.name)).map((e) => e.name).sort((a, b) => Number(a) - Number(b));
    let removedHere = 0;
    for (const r of runs) {
      if (hubGone()) orphaned(out);   // between two run dirs: the hub is still there, or this child stops now
      const runDir = path.join(jobDir, r), k = `${id}/${r}`;
      const byName = !listed.has(k) && !held.has(k) && !skel.has(id) && Number(r) < cutoff;
      if (byName) out.nameOld++;
      if (out.removed >= max) { if (byName) { out.more = true; if (!count) break walk; } continue; }   // past B: counted by its name only
      let sc = null;
      const v = S.runVerdict({ listed: listed.has(k), held: held.has(k), skeleton: skel.has(id), startMs: Number(r), cutoff,
        newestMs: () => { sc = scan(runDir); return !sc ? Infinity : sc.n ? sc.newest : Number(r); }, alive: () => aliveOf(runDir) });
      if (v !== 'remove') { out.kept[v]++; if (byName) out.keptOld++; continue; }
      const n = 1 + (sc ? sc.n : 0);
      try { fs.rmSync(runDir, { recursive: true, force: true }); out.removed++; out.entries += n; removedHere++; progress(); } catch { out.failed++; }
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

/** round 4 §2: what each NOTE says (its exact name only: `<store>.corrupt-unread`) — {at, error}, or {} for bytes that are not a note's
 *  (a person's file of that name, a write cut short): it holds all the same */
function notesOf(dir, names, prefixes) {
  const out = {};
  for (const n of names) {
    if (!prefixes.some((p) => n === p + 'unread')) continue;
    let o = null; try { const st = lst(path.join(dir, n)); if (st && st.isFile() && st.size <= 4096) o = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch { }
    out[n] = o && typeof o === 'object' && Number.isFinite(o.at) ? { at: o.at, error: typeof o.error === 'string' ? o.error.slice(0, 60) : null } : {};
  }
  return out;
}
/** round 4 §1 + §2: a record store's NOTE — ONE per store, by a name that cannot multiply (O_EXCL: EEXIST = a note already stands — not
 *  a new failure); no listing (a data dir that cannot be listed made a note per boot). → {notes: {name: 'written' | 'stood' | {error}}} */
function note({ dir, notes = [] }) {
  const out = { notes: {} };
  for (const n of Array.isArray(notes) ? notes : []) {
    if (!n || typeof n.name !== 'string' || !S.NOTE_NAME.test(n.name) || typeof dir !== 'string') continue;
    try { fs.writeFileSync(path.join(dir, n.name), JSON.stringify(n.body && typeof n.body === 'object' ? n.body : {}), { flag: 'wx' }); out.notes[n.name] = 'written'; }
    catch (e) { out.notes[n.name] = e && e.code === 'EEXIST' ? 'stood' : { error: (e && (e.code || e.message)) || String(e) }; }
  }
  return out;
}
/** the catch-up's record, read here (never on the main thread): its parsed object, or null (none, or bytes that do not parse) */
function stateOf({ stateFile, orphanDir: od = null }) {
  // round 3 §8: ONLY «not there» is «no record»; a record that cannot be READ (EACCES, EIO, a directory) is an error — the pass
  // waits (a fresh record would overwrite its open catch-up and what it owes); bytes that do not parse are set aside and a fresh
  // record starts (the catch-up's bookkeeping only — never a job record)
  let st = null, recordSetAside = null, raw = null;
  try { raw = fs.readFileSync(stateFile, 'utf8'); } catch (e) { if (!e || e.code !== 'ENOENT') return { error: `the catch-up record could not be read: ${(e && (e.code || e.message)) || e}`, code: String((e && (e.code || e.message)) || e).slice(0, 60) }; }
  if (raw != null) { try { st = JSON.parse(raw); } catch { const to = `${stateFile}.corrupt-${Date.now()}`; try { fs.renameSync(stateFile, to); recordSetAside = path.basename(to); } catch (re) { return { error: `the catch-up record did not parse and could not be set aside: ${(re && re.code) || re}`, code: `did not parse; set-aside refused: ${String((re && re.code) || re).slice(0, 30)}` }; } } }
  const orphans = [], cutCounts = [], badCounts = [];
  const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 100000 ? v : null);   // a count a remover wrote: a whole number of a batch's size, never verbatim
  if (od) { let all = []; try { all = fs.readdirSync(od).filter((n) => n.startsWith(S.ORPHAN_PREFIX)); } catch { }
    for (const n of all) {
      if (n.endsWith('.json.tmp')) { try { fs.unlinkSync(path.join(od, n)); cutCounts.push(n); } catch { } continue; }   // a write cut by a death: no count in it
      if (!n.endsWith('.json')) continue;
      let o = null; try { o = JSON.parse(fs.readFileSync(path.join(od, n), 'utf8')); } catch { }
      const c = o && typeof o === 'object' ? { removed: count(o.removed), entries: count(o.entries), jobDirs: count(o.jobDirs == null ? 0 : o.jobDirs) } : null;
      if (!c || c.removed == null || c.entries == null || c.jobDirs == null) { try { fs.unlinkSync(path.join(od, n)); badCounts.push(n); } catch { } continue; }
      orphans.push({ name: n, ...c });
    } }
  return { state: st && typeof st === 'object' ? st : null, orphans, recordSetAside, cutCounts, badCounts };
}
/** an orphan's files, once the record that counted them is on disk — only names of that prefix, in that dir */
function forget({ dir, names = [] }) { let n = 0; for (const name of names) { if (typeof name !== 'string' || !name.startsWith(S.ORPHAN_PREFIX) || name.includes('/')) continue; try { fs.unlinkSync(path.join(dir, name)); n++; } catch { } } return { forgotten: n }; }

process.on('disconnect', () => process.exit(0));   // the hub went (or killed its remover): nothing is waited for
process.on('message', (msg) => {
  if (hubGone()) orphaned(null);   // round 3 §4: a batch from a hub that is gone is never started
  procRoot = msg && typeof msg.procRoot === 'string' ? msg.procRoot : '/proc'; writers = null;   // a fresh walk per batch (a suite may point it elsewhere)
  orphanDir = msg && typeof msg.orphanDir === 'string' ? msg.orphanDir : null; orphanSeq = msg && msg.seq;
  let out;
  try { out = msg && msg.op === 'whole' ? whole(msg) : msg && msg.op === 'sweep' ? sweep({ ...msg, seq: msg.seq }) : msg && msg.op === 'state' ? stateOf(msg) : msg && msg.op === 'forget' ? forget(msg) : msg && msg.op === 'note' ? note(msg) : { error: 'unknown op' }; }
  catch (e) { out = { error: (e && e.message) || String(e) }; }
  try { process.send({ ...out, seq: msg && msg.seq }); } catch { }
});
