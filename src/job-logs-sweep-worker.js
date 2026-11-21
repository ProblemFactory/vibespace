'use strict';
// THE JOB-LOGS REMOVER'S CHILD (lane job-logs-sweep, 2026-11-12; a child process since round 2 — a process exit joins its
// threads, never its children). B-323e: ONE BATCH A CHILD, started by THE STARTER (src/server/child-starter.js — never a fork of
// the hub, no IPC channel): `node <this> <logsDir> <hubPid> --once <op> --names <job folder name>…` (a whole-dir batch's names, at
// most src/job-logs-sweep.js ARGV_MAX bytes) or `--once <op> --request <name>` (every other batch: the remover's own request file in
// the logs folder, read with its bound and removed here); its answer is ONE JSON line on stdout, and it ends. It THROWS without
// `--once` (never in the hub's own process). Every syscall
// that removes anything under data/job-logs runs HERE, never on the hub's main loop and never in the fs threadpool (on the
// owner's hub data/ is a network mount). lstat only — a link is removed as a link, never followed; only `jb-…` job dirs
// and numeric run dirs are judged; an entry of any other name in a job dir is left alone by the sweep.
//   whole {ids}  — its caller's verdict (the gc, the archive cap, the ✕, the boot collapse): every entry of each job dir
//                  goes, but a run dir whose wrapper lives or cannot be judged; the job dir once empty.
//   sweep {keep, cutoff, max, count, stateFile} — THE LAW's pass (src/job-logs-sweep.js runVerdict): each job dir's runs
//                  oldest first, at most `max` removed; `count` walks on past it to count what is left (the catch-up's
//                  start); `stateFile` (the first pass after a boot) reads the catch-up record here, off the main thread.
//   note {dir, notes} — round 4: a record store's NOTE (`<store>.corrupt-unread`, O_EXCL — one per store; EEXIST = it stands).
//   count {dir, name} — B-323e: a cut sweep's COUNT FILE, read once its child has ended (read only: the hub keeps its name in the
//                  record with its count, and a later batch forgets it).
if (process.argv[4] !== '--once') throw new Error('src/job-logs-sweep-worker.js runs only as the one-batch child src/job-logs-sweep.js starts through the starter (<logsDir> <hubPid> --once <op> …)');
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
// ITS HUB (round 2; B-323e): its parent is THE STARTER the hub made (or, on the starter's old road after two faults, the hub
// itself). The production unit stops with KillMode=process and a hub can be SIGKILLed (the OOM killer, a crash, the unit's
// timeout): the hub's end closes the starter's pipe and the starter kills the children it holds; a starter that ends any other way
// re-parents this child — it checks between two run dirs that its parent is still the one it was born of and stops at once, so no
// remover outlives its hub by more than the one call it is in, and two removers never delete in one data dir at once (the next hub
// starts ≥ 5 s later and passes 2 min after its boot)
// round 3 §4: the hub's pid is what the hub HANDED it (argv[3]) — never getppid alone (a hub that died before this child read it
// left a child whose «hub» was the reaper): born of the hub, or of a process the hub started (its parent's parent IS the hub), or the
// batch is refused
const HUB = Number(process.argv[3]) > 1 ? Number(process.argv[3]) : 0;
const BORN = process.ppid;
/** a process's parent: /proc's, or — a machine with no /proc (macOS; the fresh read's find 3) — `ps -o ppid=` (bounded); null unknown */
function parentOf(pid) {
  if (PI.hasProc()) return PI.ppidOf(pid);
  const r = require('child_process').spawnSync('ps', ['-o', 'ppid=', '-p', String(Number(pid))], { encoding: 'utf8', timeout: 3000 });
  const n = Number(String((r && r.stdout) || '').trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}
const bornOfHub = HUB > 1 && BORN > 1 && (BORN === HUB || parentOf(BORN) === HUB);
const hubGone = () => !bornOfHub || process.ppid !== BORN;
// B-323e: THIS sweep's COUNT FILE (`<ORPHAN_PREFIX><the remover>-<seq>.json` in the data dir, its name the hub's): rewritten by temp +
// rename after EVERY removal, never removed here — whatever ends this child (its answer, its bound, its hub's end, a stop), what it
// removed is on disk; the hub counts it ONCE (its name kept in the record beside its count) and a later batch forgets it
// r1283 (3): written at the child's START (a zero), so a missing file is a real loss, never a pass that removed nothing; r1283 (5):
// rewritten with `done` at its normal end, so the next start tells a pass that FINISHED from one whose hub ended
let countFile = null;
function countWrite(out, done = false) {
  if (!countFile) return false;
  try { fs.writeFileSync(countFile + '.tmp', JSON.stringify({ removed: out.removed, entries: out.entries, jobDirs: out.jobDirs, at: Date.now(), ...(done ? { done: true } : {}) })); fs.renameSync(countFile + '.tmp', countFile); out.countFile = path.basename(countFile); return true; } catch { return false; }
}
/** the hub ended mid-batch (or it was never this child's): stop now — what this batch removed is in its count file already */
function orphaned() { process.exit(0); }
/** B-323e: ONE file read WITH ITS BOUND — never a link followed (O_NOFOLLOW), never a FIFO waited on (O_NONBLOCK, then not a file)
 *  → {text} or {why} ('missing', 'not a file', 'over its bound (N bytes)', 'unreadable: CODE') */
function bounded(f, max) {
  let fd; try { fd = fs.openSync(f, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); } catch (e) { return { why: e && e.code === 'ENOENT' ? 'missing' : e && e.code === 'ELOOP' ? 'not a file' : `unreadable: ${(e && e.code) || e}` }; }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return { why: 'not a file' };
    if (st.size > max) return { why: `over its bound (${max} bytes)` };
    const buf = Buffer.alloc(st.size); let n = 0;
    while (n < st.size) { const k = fs.readSync(fd, buf, n, st.size - n, n); if (!k) break; n += k; }
    return { text: buf.toString('utf8', 0, n) };
  } catch (e) { return { why: `unreadable: ${(e && e.code) || e}` }; } finally { fs.closeSync(fd); }   // ONE close, its owner's (the fd-close census: never under an empty catch)
}
/** a count a remover wrote: whole numbers of a batch's size, never verbatim → {removed, entries, jobDirs} or null */
const countN = (v) => (Number.isInteger(v) && v >= 0 && v <= 100000 ? v : null);
function countsOf(o) {
  const c = o && typeof o === 'object' ? { removed: countN(o.removed), entries: countN(o.entries), jobDirs: countN(o.jobDirs == null ? 0 : o.jobDirs) } : null;
  return c && c.removed != null && c.entries != null && c.jobDirs != null ? c : null;
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

function sweep({ keep = {}, cutoff, max = S.PASS_MAX, count = false, stateFile = null, archiveFile = null, storeFile = null, setAside = null, orphanDir = null, forget: counted = null }) {
  const t0 = Date.now();
  // nameOld = run dirs that STARTED before the cutoff and no record lists, holds or recovered — THE CATCH-UP's count, BY NAME (a
  // counting pass walks on past `max` with readdirs only: no stat, no /proc — round 2 law 3); keptOld = of those, the ones the full
  // verdict kept (young by their newest file, live, unjudgeable) — the done line's «kept» (a complete pass's figure)
  const out = { removed: 0, entries: 0, jobDirs: 0, nameOld: 0, keptOld: 0, unnamedJobs: 0, failed: 0, more: false, kept: { listed: 0, held: 0, skeleton: 0, young: 0, alive: 0, unproven: 0 } };
  const progress = () => countWrite(out);   // B-323e: after every removal — a pass cut at its bound (or its hub's end, a stop) keeps its count
  // B-323e: the count files the hub has COUNTED (their names in its record) go first — whatever this pass answers after
  if (Array.isArray(counted) && counted.length && typeof orphanDir === 'string') out.forgot = forget({ dir: orphanDir, names: counted }).done;
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
    // B-323e: a request file left by a batch whose child never read it (its start failed, its write was cut) goes with this walk
    // r1283 (6): only its OWN remover's, or one older than a batch's bound — never another engine's request not yet read
    if (!je.isDirectory() || !S.JOB_NAME.test(je.name)) {
      if (je.name.startsWith(S.REQUEST_PREFIX)) {
        const rp = path.join(logsDir, je.name), own = !!myRequests && je.name.startsWith(myRequests);
        let old = false; if (!own) { const rs = lst(rp); old = !!rs && rs.mtimeMs < Date.now() - S.BATCH_TIMEOUT_MS; }
        if (own || old) { try { fs.unlinkSync(rp); } catch { } }
      }
      continue;
    }
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
  const orphans = [], cutCounts = [], cutBeside = [], badCounts = [];
  if (od) { let all = []; try { all = fs.readdirSync(od).filter((n) => n.startsWith(S.ORPHAN_PREFIX)); } catch { }
    for (const n of all) {
      if (n.endsWith('.json.tmp')) { try { fs.unlinkSync(path.join(od, n)); (all.includes(n.slice(0, -4)) ? cutBeside : cutCounts).push(n); } catch { } continue; }   // r1283 (5): its file beside it stands (short by one at most)   // a write cut by a death: no count in it
      if (!n.endsWith('.json')) continue;
      let o = null; const rd = bounded(path.join(od, n), S.COUNT_MAX); try { o = rd.why ? null : JSON.parse(rd.text); } catch { }   // B-323e: read with its bound
      const c = countsOf(o);
      if (!c) { try { fs.unlinkSync(path.join(od, n)); badCounts.push(n); } catch { } continue; }
      orphans.push({ name: n, ...c, ...(o.done === true ? { done: true } : {}) });
    } }
  return { state: st && typeof st === 'object' ? st : null, orphans, recordSetAside, cutCounts, cutBeside, badCounts };
}
/** an orphan's files, once the record that counted them is on disk — only names of that prefix, in that dir */
function forget({ dir, names = [] }) {
  let n = 0; const done = [];
  for (const name of Array.isArray(names) ? names : []) {
    if (typeof name !== 'string' || !name.startsWith(S.ORPHAN_PREFIX) || name.includes('/') || typeof dir !== 'string') continue;
    let gone = false; try { fs.unlinkSync(path.join(dir, name)); n++; gone = true; } catch (e) { gone = !!e && e.code === 'ENOENT'; }
    try { fs.unlinkSync(path.join(dir, name + '.tmp')); } catch { }   // B-323e: a write of it cut by a kill
    if (gone) done.push(name);
  }
  return { forgotten: n, done };
}
/** B-323e: a cut sweep's count, read once its child has ended → {count: {removed, entries, jobDirs}} or {count: null, why}: a file
 *  missing, cut while it was written, over its bound or not a count is «unknown» — never «nothing removed». Read only */
function countOf({ dir, name }) {
  if (typeof dir !== 'string' || typeof name !== 'string' || !S.COUNT_NAME.test(name)) return { count: null, why: 'not a count file\'s name' };
  const f = path.join(dir, name), rd = bounded(f, S.COUNT_MAX);
  if (rd.why) return { count: null, why: rd.why === 'missing' && lst(f + '.tmp') ? 'cut while it was written' : rd.why };
  let o = null; try { o = JSON.parse(rd.text); } catch { }
  const c = countsOf(o);
  return c ? { count: c } : { count: null, why: 'not a count' };
}
/** B-323e: THE BATCH — its job folder names in the arguments (a whole-dir batch), or the remover's own REQUEST FILE in the logs
 *  folder (every other batch): read with its bound and REMOVED here, read or not */
let myRequests = null;   // r1283 (6): `<REQUEST_PREFIX><its remover>-` — this remover's own request files
function batchOf([op, how, ...rest]) {
  if (!S.OPS.includes(op)) return { error: 'its batch names no op' };
  if (op === 'whole' && how === '--names') return { op, ids: rest.filter((n) => S.JOB_NAME.test(n)) };
  if (how !== '--request' || rest.length !== 1 || !S.REQUEST_NAME.test(rest[0])) return { error: 'its batch could not be read' };
  const own = /^(\.jobs-remover-request-[0-9a-z]{1,40}-)\d{1,12}\.json$/.exec(rest[0]); myRequests = own ? own[1] : null;
  const f = path.join(logsDir, rest[0]), rd = bounded(f, S.REQUEST_MAX);
  try { fs.unlinkSync(f); } catch { }
  if (rd.why) return { error: `its request file: ${rd.why}` };
  let m = null; try { m = JSON.parse(rd.text); } catch { return { error: 'its request file did not parse' }; }
  return m && typeof m === 'object' && m.op === op ? m : { error: 'its request file is not this batch\'s' };
}

// THE ONE BATCH (B-323e): refused before anything is read when its hub is gone (round 3 §4), its answer ONE line on stdout
// r1283 (4): a refusal by the parent check names its door in its one line (a machine whose `ps` fails would say only «no answer»)
if (hubGone()) { if (!bornOfHub) { try { fs.writeSync(1, JSON.stringify({ error: 'refused by its parent check: its parent is neither the hub nor a process the hub started' }) + '\n'); } catch { } } orphaned(); }
let msg; try { msg = batchOf(process.argv.slice(5)); } catch (e) { msg = { error: `its batch could not be read: ${(e && (e.code || e.message)) || e}` }; }
procRoot = typeof msg.procRoot === 'string' ? msg.procRoot : '/proc';   // a suite may point it elsewhere
countFile = msg.op === 'sweep' && typeof msg.orphanDir === 'string' && typeof msg.countName === 'string' && S.COUNT_NAME.test(msg.countName) ? path.join(msg.orphanDir, msg.countName) : null;
const countAtStart = countWrite({ removed: 0, entries: 0, jobDirs: 0 });   // r1283 (3)
{
  let out;
  try { out = msg.error ? { error: msg.error } : msg.op === 'whole' ? whole(msg) : msg.op === 'sweep' ? sweep(msg) : msg.op === 'state' ? stateOf(msg) : msg.op === 'forget' ? forget(msg) : msg.op === 'note' ? note(msg) : msg.op === 'count' ? countOf(msg) : { error: 'unknown op' }; }
  catch (e) { out = { error: (e && e.message) || String(e) }; }
  if (countAtStart && out && Number.isInteger(out.removed)) countWrite(out, true);   // r1283 (5): its end marked (a sweep that threw leaves its file unnamed: the next start counts it)
  try { process.stdout.write(JSON.stringify(out) + '\n'); } catch { }
}
