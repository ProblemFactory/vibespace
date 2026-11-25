'use strict';
/**
 * proc-identity — A PID IS NEVER AN IDENTITY (B-1cc6, lane pid-identity-census).
 *
 * This box's pid_max is 4 194 304 and its pids wrapped ≥ 3 times between the
 * 09-17 boot and 2026-10 (about once a day under the gate's churn); a fleet
 * pod's pid_max is smaller. A pid recorded hours ago can name a STRANGER by the
 * time it is signalled: `process.kill(pid)` on a recycled pid kills someone
 * else's process, and `kill -0` reads "alive" for a dead one (a zombie answers
 * kill -0 / tail --pid too). So every signal to a RECORDED pid goes through
 * here and proves the record first:
 *
 *   identity = { pid, starttime, bootId }   starttime = /proc/<pid>/stat field 22
 *                                           (clock ticks since boot, counted from
 *                                           the LAST ')' — comm may hold ") ");
 *                                           bootId = /proc/sys/kernel/random/boot_id
 *   no /proc (macOS)  → { pid, starttime: null, lstart, bootId: '' }   (`ps -o lstart=`)
 *
 * Verdicts (judge): same | zombie | pid-recycled | gone | unknown-identity | unknown.
 *   · a record WITHOUT a starttime (an older build wrote it) is `unknown-identity`:
 *     never signalled, REPORTED once — "a process this build cannot prove is ours";
 *   · a verdict that cannot be reached (no /proc and no ps) is a SAID `unknown`,
 *     never "alive" (the S9 round-11 lesson).
 * A pid this process spawned and still holds the ChildProcess handle for needs
 * none of this — the handle IS the identity (`child.kill`, or `child.pid` read
 * from the handle in the same tick). A pid read back from disk never is.
 *
 * SHARED: node builtins only (the agentd bundle carries it to paired machines).
 */
const fs = require('fs');
const { spawnSync, execFile } = require('child_process');
const i18nKey = (k) => k; // the extraction marker scripts/i18n-extract.mjs reads (zh/ja: src/lib/i18n-zh.js / i18n-ja.js)

const PROC_ROOT = '/proc';
const UNPROVABLE = 'a process this build cannot prove is ours — restart it to re-record';

const rootOf = (opts) => (opts && opts.procRoot) || PROC_ROOT;
const pidOk = (pid) => Number.isInteger(Number(pid)) && Number(pid) > 1;

/** The fields after comm (rest[0] = state, field 3; rest[19] = starttime, field 22), or null. */
function statRest(pid, opts) {
  if (!pidOk(pid)) return null;
  try {
    const s = fs.readFileSync(`${rootOf(opts)}/${Number(pid)}/stat`, 'utf8');
    return s.slice(s.lastIndexOf(')') + 2).split(' ');
  } catch { return null; }
}
/** Does this machine read process identities from a procfs at all? */
function hasProc(opts) {
  const root = rootOf(opts);
  return fs.existsSync(`${root}/self/stat`) || fs.existsSync(`${root}/sys/kernel/random/boot_id`);
}
let _bootId = null;
function bootIdOf(opts) {
  if (rootOf(opts) === PROC_ROOT && _bootId != null) return _bootId;
  let v = '';
  try { v = fs.readFileSync(`${rootOf(opts)}/sys/kernel/random/boot_id`, 'utf8').trim(); } catch { }
  if (rootOf(opts) === PROC_ROOT) _bootId = v;
  return v;
}
/** /proc/<pid>/stat field 22 as a Number, or null (gone / no /proc / unreadable). */
function starttimeOf(pid, opts) {
  const r = statRest(pid, opts);
  const v = r ? Number(r[19]) : NaN;
  return Number.isFinite(v) && r[19] !== '' ? v : null;
}
/** /proc/<pid>/stat field 3 ('R', 'S', 'Z' …) or null. */
function stateOf(pid, opts) { const r = statRest(pid, opts); return r ? r[0] : null; }
/** B-2c5c: /proc/<pid>/stat field 5 (its process group) or null — the same one read */
function pgidOf(pid, opts) { const r = statRest(pid, opts); return r && Number(r[2]) > 0 ? Number(r[2]) : null; }
/** B-2c5c (主开发 02:46Z): /proc/<pid>/stat field 4 (its parent) or null — the same one read */
function ppidOf(pid, opts) { const r = statRest(pid, opts); return r && Number(r[1]) > 0 ? Number(r[1]) : null; }
/** B-91aa (met at 2.369.412's second checkpoint: src/mounts.js keeps no /proc read of its own — B-e783's law): ONE process's
 *  [state, starttime] from the same one read, SYNC (a libuv pool thread may be held by the very mount a probe watches) —
 *  null when it is gone (ENOENT / ESRCH), undefined when /proc cannot be read (never «gone» on an unreadable /proc). */
function statOf(pid, opts) {
  if (!pidOk(pid)) return null;
  try { const s = fs.readFileSync(`${rootOf(opts)}/${Number(pid)}/stat`, 'utf8'); const f = s.slice(s.lastIndexOf(')') + 2).split(' '); return [f[0], f[19]]; }
  catch (e) { return e && (e.code === 'ENOENT' || e.code === 'ESRCH') ? null : undefined; }
}
/** The no-/proc rung: `ps -o stat= -o lstart= -p <pid>` → { ran, state, lstart } (lstart null = no such pid). */
function psOf(pid, opts) {
  if (opts && typeof opts.ps === 'function') return opts.ps(Number(pid));
  const r = spawnSync('ps', ['-o', 'stat=', '-o', 'lstart=', '-p', String(Number(pid))], { encoding: 'utf8', timeout: 3000 });
  if (r.error) return { ran: false, state: null, lstart: null };
  const out = String(r.stdout || '').trim();
  if (!out) return { ran: true, state: null, lstart: null };
  const sp = out.indexOf(' ');
  return { ran: true, state: out.slice(0, sp), lstart: out.slice(sp + 1).trim().replace(/\s+/g, ' ') };
}

/** {pid, starttime, bootId} of a LIVE pid now (record it at spawn), or null. */
function identityOf(pid, opts) {
  if (!pidOk(pid)) return null;
  if (hasProc(opts)) {
    const starttime = starttimeOf(pid, opts);
    return starttime == null ? null : { pid: Number(pid), starttime, bootId: bootIdOf(opts) };
  }
  const p = psOf(pid, opts);
  return p.lstart ? { pid: Number(pid), starttime: null, lstart: p.lstart, bootId: '' } : null;
}

/** The verdict on a recorded identity: { verdict, cur } — see the header. */
function judge(identity, opts) {
  const rec = identity || {};
  if (!pidOk(rec.pid)) return { verdict: 'unknown-identity', cur: null };
  if (hasProc(opts)) {
    if (rec.starttime == null || rec.starttime === '' || !Number.isFinite(Number(rec.starttime))) return { verdict: 'unknown-identity', cur: null };
    const boot = bootIdOf(opts);
    if (rec.bootId && boot && rec.bootId !== boot) return { verdict: 'gone', cur: null }; // the box rebooted: that process is gone
    const r = statRest(rec.pid, opts);
    const cur = r ? Number(r[19]) : null;
    if (cur == null || !Number.isFinite(cur)) return { verdict: 'gone', cur: null };
    if (cur !== Number(rec.starttime)) return { verdict: 'pid-recycled', cur };
    return { verdict: r[0] === 'Z' ? 'zombie' : 'same', cur };
  }
  if (!rec.lstart) return { verdict: rec.starttime == null ? 'unknown-identity' : 'unknown', cur: null };
  const p = psOf(rec.pid, opts);
  if (!p.ran) return { verdict: 'unknown', cur: null };
  if (!p.lstart) return { verdict: 'gone', cur: null };
  if (p.lstart !== String(rec.lstart).replace(/\s+/g, ' ')) return { verdict: 'pid-recycled', cur: p.lstart };
  return { verdict: /^Z/.test(p.state || '') ? 'zombie' : 'same', cur: p.lstart };
}

/** Is `pid` still the process `identity` recorded (a zombie still is — it is just not alive)? */
function sameProcess(pid, identity, opts) {
  const v = judge({ ...(identity || {}), pid }, opts).verdict;
  return v === 'same' || v === 'zombie';
}
/** true = that very process runs · false = gone / recycled / a zombie · null = cannot be proven either way. */
function aliveIdentity(identity, opts) {
  const v = judge(identity, opts).verdict;
  if (v === 'same') return true;
  return v === 'unknown' || v === 'unknown-identity' ? null : false;
}

const _reported = new Set();
/** ONE line per (why, pid, start) — the journal hears a refusal once, not every tick. */
function reportOnce(why, identity, opts, cur) {
  const rec = identity || {};
  const key = `${why}:${rec.pid}:${rec.starttime != null ? rec.starttime : rec.lstart || ''}`;
  if (_reported.has(key)) return null;
  _reported.add(key);
  const what = (opts && opts.what) || 'a recorded process';
  const line = why === 'pid-recycled'
    ? `[proc-identity] pid ${rec.pid} (${what}) now names ANOTHER process (start ${cur} ≠ recorded ${rec.starttime != null ? rec.starttime : rec.lstart}) — pid-recycled, not signalled`
    : `[proc-identity] pid ${rec.pid} (${what}): ${UNPROVABLE} — not signalled`;
  const say = (opts && opts.say) || ((l) => console.warn(l));
  try { say(line); } catch { }
  return line;
}

/**
 * Signal the RECORDED process — only when judge() says it is still that very
 * process. → { ok: true, target } | { ok: false, why: 'pid-recycled' | 'gone' |
 * 'unknown-identity' | 'unknown' | 'not-ours' }. opts.group: the process group
 * first (-pid), its leader alone when it leads none. opts.kill: injectable.
 */
function signalIdentity(identity, signal, opts = {}) {
  const { verdict, cur } = judge(identity, opts);
  if (verdict !== 'same') {
    const why = verdict === 'zombie' ? 'gone' : verdict;
    if (why === 'pid-recycled' || why === 'unknown-identity' || why === 'unknown') reportOnce(why, identity, opts, cur);
    return { ok: false, why };
  }
  const kill = opts.kill || ((p, s) => process.kill(p, s));
  const pid = Number(identity.pid);
  const one = (target) => { try { kill(target, signal); return { ok: true, target }; } catch (e) { return { ok: false, why: e && e.code === 'EPERM' ? 'not-ours' : 'gone' }; } };
  if (opts.group) { const g = one(-pid); if (g.ok) return g; }
  return one(pid);
}

/**
 * THE PROCESSES OF A RECORDED RUN (lane jobs-memory-bound, acceptance round 6) — a FRESH /proc scan, never a list read back:
 * every process of process group `pgid` (0: none), or carrying `mark` (NAME=value) in its environ — a process that left the
 * group (setsid) still carries what it inherited — started at or after `since` (field 22), not a zombie, never this process.
 * Identities ({pid, starttime, bootId}), proven again by signalIdentity at the act. [] where there is no /proc.
 * Round 7: BOUNDED by rows AND time (the caller's thread is the hub's: the sync-fs law's spirit) — at most `maxRows` processes
 * and `maxMs`; a process in uninterruptible sleep (D) is not read (an environ read takes its memory map's lock). What it could
 * not read is COUNTED on the answer's `scan` — {scanned, total, unreadable, cut} — for the caller to say, never skipped silently.
 * Round 8: A CUT SCAN PROVES NOTHING (the caller never reads «none found» off one as «none left»), and the bound is spent where it
 * matters: the job's OWN candidates first — `first` (the pids its record names) and their children (/proc/<pid>/task/<pid>/
 * children), at most 256, outside the bound — then the rest, newest pid first. An unreadable environ is told by its OWNER (the
 * real uid of /proc/<pid>/status): `others` of other users (never ours to read), the rest ours (not dumpable, in uninterruptible sleep, or inside an exec — B-d8f4 r2215).
 */
const MEMBERS_ROWS = 4096, MEMBERS_MS = 250;
function membersOf({ pgid = 0, since = 0, mark = '', first = [], maxRows = MEMBERS_ROWS, maxMs = MEMBERS_MS } = {}, opts) {
  const root = rootOf(opts), out = [];
  let ents = [];
  try { ents = fs.readdirSync(root); } catch (err) { out.scan = { scanned: 0, total: 0, unreadable: 0, others: 0, ending: 0, cut: false, unread: (err && err.code) || 'error' }; return out; }   // B-d8f4 (10): the listing failed — the caller says so, with its errno
  const bootId = bootIdOf(opts), me = typeof process.getuid === 'function' ? process.getuid() : -1;
  const pids = ents.filter((e) => /^\d+$/.test(e) && Number(e) !== process.pid).map(Number).sort((a, b) => b - a); // newest first
  let scanned = 0, unreadable = 0, others = 0, ending = 0, cut = false;
  const endingSeen = new Set();   // r4302: read ENDING at the first look — looked at once more at the walk's end
  const ownerOf = (e) => { try { const m = /^Uid:\s+(\d+)/m.exec(fs.readFileSync(`${root}/${e}/status`, 'utf8')); return m ? Number(m[1]) : -1; } catch { return -1; } };
  const unread = (e) => { unreadable++; const u = ownerOf(e); if (u >= 0 && u !== me) others++; };
  const again = [];   // B-d8f4 (主开发 r2215): read unread for a moment (uninterruptible sleep, an exec's empty window) — read ONCE more at the end
  const check = (e, second = false) => {
    if (!second) scanned++;
    const r = statRest(e, opts);
    if (!r || r[0] === 'Z' || Number(r[19]) < since) return;
    let hit = !!pgid && Number(r[2]) === Number(pgid);
    if (!hit && mark) {
      const v = envOf(root, e, r);   // the shipped twin's ONE rule (the wrapper's escapee scan reads the same text)
      if (v.env) hit = v.env.includes(mark);
      else if (v.ending) { if (second) ending++; else { endingSeen.add(e); again.push(e); } }   // r4302: still ending at the last look ⇒ counted «still ending», never «could not be read»
      else if (v.unread) { if (v.final || second) unread(e); else again.push(e); }   // an access refusal is final; unread twice is counted
    }
    if (hit) out.push({ pid: e, starttime: Number(r[19]), bootId });
  };
  const cand = new Set(), queue = (Array.isArray(first) ? first : []).map(Number).filter((p) => p > 1 && p !== process.pid);
  while (queue.length && cand.size < 256) {
    const p = queue.shift();
    if (cand.has(p)) continue;
    cand.add(p);
    try { for (const c of fs.readFileSync(`${root}/${p}/task/${p}/children`, 'utf8').split(/\s+/)) if (/^\d+$/.test(c) && Number(c) !== process.pid) queue.push(Number(c)); } catch { }
  }
  const listed = new Set(pids);
  for (const p of cand) if (listed.has(p)) check(p);
  let rest = 0;
  const t1 = Date.now(); // the bound is the rest's
  for (const e of pids) {
    if (cand.has(e)) continue;
    if (rest >= maxRows || Date.now() - t1 > maxMs) { cut = true; break; }
    rest++; check(e);
  }
  // B-d8f4 (主开发 r2215): THE SECOND READ — at the walk's end, INSIDE its own bound, of ONLY those read unread for a moment; what it then
  // reads decides (the mark ⇒ a member, its start time read again; none ⇒ not counted); still unread ⇒ counted. No third read, no wait
  for (const e of again) { if (Date.now() - t1 > maxMs) { if (endingSeen.has(e)) ending++; else unread(e); } else check(e, true); }
  out.scan = { scanned, total: pids.length, unreadable, others, ending, cut };
  return out;
}

// ── SHIPPED TWIN (B-c134) BEGIN — data/bin/job-wrapper.js carries these lines byte-for-byte (a wrapper copied into a scratch data
// folder cannot require src/); scripts/test-stop-tree.mjs pins the copy to this source ──
/** THE TREE A STOP STARTED (B-c134, lane bl-jobs 2026-11-18): every process under `root` by the PARENT CHAIN — each one's main-thread
 *  children list (/proc/<pid>/task/<pid>/children: the file the release's member walk reads; no directory is listed), breadth first —
 *  read BEFORE the first signal. A child that made its own group (setsid, the timeout program) or dropped the job's environ (env -i, a
 *  `systemd-run --scope … env -i`) is outside the group walk and the environ mark, but it is its parent's child until that parent
 *  dies; after the first signal it is re-parented and the chain is gone. SYNCHRONOUS on purpose, as the release's member walk: procfs is
 *  memory (never a mount), it costs THE TREE (a list and a stat a member) — never all of /proc — no thread pool stands between a stop
 *  and its first signal, and the stop's signal stays synchronous; bounded by `maxRows` and `maxMs` all the same. A zombie is no member (its children are re-parented already); nothing that started before `since`.
 *  → {rows: [[pid, starttime, pgid, comm]], cut, pruned} — a CUT walk proves nothing (the caller says so). THE MODEL: it ends what a
 *  MISTAKE left behind; a child that hides ON PURPOSE (a double fork that re-parents before the stop) is outside it, not chased.
 *  WHAT THE STOP DOES NOT OWN (cure, MUST A): `exclude` = identities [[pid, starttime]] (starttime 0: that pid, whatever its start)
 *  that are PRUNED — never added AND never walked into: what lives under the hub, another conversation's holder or another job's
 *  wrapper is theirs, however it came to sit under this root (a hub restarted from inside a conversation or a job) */
function childTreeOf(root, { since = 0, maxRows = 512, maxMs = 50, procRoot = '/proc', exclude = [] } = {}) {
  const rows = [], seen = new Set([Number(root)]), queue = [Number(root)], t0 = Date.now(), keep = new Map();
  for (const x of exclude || []) { const p = Number(Array.isArray(x) ? x[0] : x); if (p > 1 && p !== Number(root)) keep.set(p, Number(Array.isArray(x) ? x[1] : 0) || 0); }
  let cut = false, pruned = 0;
  walk: while (queue.length) {
    const p = queue.shift();
    let kids = '';
    try { kids = fs.readFileSync(`${procRoot}/${p}/task/${p}/children`, 'utf8'); } catch { continue; }
    for (const w of kids.split(/\s+/)) {
      const c = Number(w);
      if (!(c > 1) || seen.has(c)) continue;
      if (rows.length >= maxRows || Date.now() - t0 > maxMs) { cut = true; break walk; }
      seen.add(c);
      let st = '';
      try { st = fs.readFileSync(`${procRoot}/${c}/stat`, 'utf8'); } catch { continue; }
      const o = st.indexOf('('), e = st.lastIndexOf(')');
      if (o < 0 || e < o) continue;
      const r = st.slice(e + 2).split(' ');
      if (keep.has(c) && (!keep.get(c) || keep.get(c) === Number(r[19]))) { pruned++; continue; }   // not the stop's: never added, never walked into
      if (r[0] === 'Z' || !(Number(r[19]) >= since)) continue;
      rows.push([c, Number(r[19]), Number(r[2]), st.slice(o + 1, e).slice(0, 32)]);
      queue.push(c);
    }
  }
  return { rows, cut, pruned };
}
/** B-2c5c (lane bl-jobs): is `pid` — or a process up its PARENT chain — one of `keep` (a Map pid → starttime, 0 = that pid whatever
 *  its start), or one `isRoot` names? What runs under the hub is the hub's: a hub started by hand INSIDE a job lives in that job's
 *  scope, its process group and with its mark, and no stop of the job ends it or what it runs. The walk STOPS at a pid of `stop` (the
 *  job's own wrapper: the hub spawned every wrapper, so a walk past it reaches the hub from EVERY job process — its read r1, M1). The
 *  chain is read from <procRoot>/<p>/stat (its 4th field, the parent), at most `maxHops` links up; a link that cannot be read ends
 *  the walk — not kept. */
function keptByChain(pid, keep, { procRoot = '/proc', maxHops = 64, stop = null, isRoot = null } = {}) {
  let p = Number(pid);
  for (let hop = 0; hop <= maxHops && p > 1; hop++) {
    if (stop && stop.has(p)) return false;
    let st = '';
    try { st = fs.readFileSync(`${procRoot}/${p}/stat`, 'utf8'); } catch { return false; }
    const e = st.lastIndexOf(')');
    if (e < 0) return false;
    const r = st.slice(e + 2).split(' ');
    if ((keep.has(p) && (!keep.get(p) || keep.get(p) === Number(r[19]))) || (isRoot && isRoot(p))) return true;
    p = Number(r[1]);
  }
  return false;
}
/** B-2c5c (r1263 (b)): THE ONE RECOGNISER of «this run's main is the hub, or leads to it» — the engine's and the wrapper's, one text.
 *  The HUB'S OWN parent chain, read up from `hub` (the hub itself first): `pids` = every process on it until `stop` (the run's
 *  wrapper; never in it) or pid 1 — the hub and the launcher(s) it runs under (`./run.sh`, `npm start`: the hub's own supervisor,
 *  never a stop's to end); `reached` = the chain met `stop` (by its start, when `stopStart` is given): the run's main IS the hub or
 *  a launcher of it. The engine reads it from itself (process.pid), the wrapper from the hub of its <data>/server.pid. A link that
 *  cannot be read ends the walk (not reached) */
function hubChain(hub, { procRoot = '/proc', maxHops = 64, stop = 0, stopStart = 0 } = {}) {
  const pids = new Set();
  let p = Number(hub);
  for (let hop = 0; hop <= maxHops && p > 1; hop++) {
    let st = '';
    try { st = fs.readFileSync(`${procRoot}/${p}/stat`, 'utf8'); } catch { return { pids, reached: false }; }
    const e = st.lastIndexOf(')');
    if (e < 0) return { pids, reached: false };
    const r = st.slice(e + 2).split(' ');
    if (Number(stop) > 1 && p === Number(stop)) return { pids, reached: !stopStart || Number(stopStart) === Number(r[19]) };
    pids.add(p);
    p = Number(r[1]);
  }
  return { pids, reached: false };
}
/** B-d8f4 (主开发 r2215): ONE ANSWER to «what environment does this process carry?» — proc-identity's membersOf (the engine's walks)
 *  and the job wrapper's escapee scan read THIS text. `rest` = its /proc/<pid>/stat after the comm (the state first, the flags 7th).
 *  → {env: [...]} | {none: why} | {unread: why, final?}. A zombie or a kernel thread (its flags: PF_KTHREAD) carries none. A process in
 *  uninterruptible sleep is NEVER read (an environ read takes its memory map's lock): unread. An environ that reads EMPTY while the
 *  command line reads empty too is a process inside its exec (the new image's tables not yet written — Linux reads both as nothing,
 *  no error): unread; an empty environ WITH a command line was started with none: it carries no mark. A read refused (another user's:
 *  EACCES / EPERM) is unread for good (`final`); any other failed read is unread; a gone one carries none */
function envOf(root, pid, rest) {
  if (!rest || rest[0] === 'Z' || (Number(rest[6]) & 0x00200000)) return { none: 'no process to carry one' };
  if (rest[0] === 'D') return endingOf(root, pid, rest) || { unread: 'D' };
  const read = (name) => { try { return { text: fs.readFileSync(`${root}/${pid}/${name}`, 'latin1') }; } catch (err) { return { err: err || {} }; } };
  const gone = (r) => !!r.err && (r.err.code === 'ENOENT' || r.err.code === 'ESRCH');
  const env = read('environ');
  if (env.err) return gone(env) ? { none: 'gone' } : endingOf(root, pid, rest) || { unread: env.err.code || 'error', final: env.err.code === 'EACCES' || env.err.code === 'EPERM' };
  if (env.text.length) return { env: env.text.split('\0') };
  const cmd = read('cmdline');
  if (cmd.err) return gone(cmd) ? { none: 'gone' } : endingOf(root, pid, rest) || { unread: cmd.err.code || 'error' };
  return cmd.text.length ? { env: [] } : endingOf(root, pid, rest) || { unread: 'exec' };
}
/** r4302 (主开发): THE KERNEL SAYS IT IS ENDING — a process of OURS (its uid) whose mark could not be read, that is exiting
 *  (PF_EXITING: its memory given back, its environ reads empty) or holds a signal that ends it (SIGKILL pending; a SIGTERM pending that
 *  it neither blocks, ignores nor catches) → { ending } — never «could not be read». The walk looks at it once more at its end and says it
 *  «still ending» if it stands there (an exit can hang). null: not ending, or not ours — the read goes on as before (a LIVING process's
 *  mark is read as it always was; nothing here signals anything) */
function endingOf(root, pid, rest) {
  let s = ''; try { s = fs.readFileSync(`${root}/${pid}/status`, 'latin1'); } catch { return null; }
  const field = (k) => { const m = new RegExp(`^${k}:\\s*(\\S+)`, 'm').exec(s); return m ? m[1] : ''; };
  const me = typeof process.getuid === 'function' ? process.getuid() : -1;
  if (me < 0 || Number(field('Uid')) !== me) return null;
  if (Number(rest && rest[6]) & 0x4) return { ending: 'exiting' };
  const low = (k) => (parseInt(field(k).slice(-8) || '0', 16) || 0) >>> 0, pending = low('SigPnd') | low('ShdPnd');
  if (pending & 0x100) return { ending: 'killed' };
  if ((pending & 0x4000) && !((low('SigBlk') | low('SigIgn') | low('SigCgt')) & 0x4000)) return { ending: 'terminated' };
  return null;
}
// ── SHIPPED TWIN (B-c134) END ──
/** WHAT NO STOP OWNS (B-c134 cure, MUST A — the kill law: a stop never reaches the hub's own subtree). Each road that HOLDS a
 *  process names it here by the identity it already holds — the conversations' holders (ws-handler), the jobs' wrappers (the jobs
 *  engine) — `fn` → [[pid, starttime]] (starttime 0: the road holds the pid alone; a recycled pid only makes a stop end LESS).
 *  The hub's own identity is always in it. A root the stop itself names is never kept out of its own walk. */
const KEEP_OUT = new Map();
function keepOut(name, fn) { const k = String(name); KEEP_OUT.set(k, fn); return () => { if (KEEP_OUT.get(k) === fn) KEEP_OUT.delete(k); }; }   // → its off (only while it is still the one named)
function keptOut(roots, popts) {
  const own = new Set(roots.map(Number)), out = [[process.pid, Number(starttimeOf(process.pid, popts)) || 0]];
  for (const [name, fn] of KEEP_OUT) {
    let l = [];
    try { l = fn() || []; } catch (e) { console.warn(`[proc] what ${name} holds could not be read — its processes are not kept out of this stop's walk: ${(e && e.message) || e}`); }
    for (const x of l) { const p = Number(Array.isArray(x) ? x[0] : x); if (pidOk(p) && !own.has(p)) out.push([p, Number(Array.isArray(x) ? x[1] : 0) || 0]); }
  }
  return out;
}
/** the hub's form: the tree as identities ({pid, starttime, bootId, comm, pgid}), `.cut` on the list; WHAT NO STOP OWNS pruned
 *  (keptOut + `opts.exclude`), `.pruned` = how many such processes the walk met and did not enter */
function treeOf(roots, opts = {}, popts) {
  const out = [], bootId = bootIdOf(popts), list = (Array.isArray(roots) ? roots : [roots]).map(Number).filter(pidOk);
  const exclude = [...keptOut(list, popts), ...(Array.isArray(opts.exclude) ? opts.exclude : [])];
  let cut = false, pruned = 0;
  for (const r of list) {
    const t = childTreeOf(r, { ...opts, exclude, procRoot: rootOf(popts) });
    cut = cut || t.cut; pruned += t.pruned;
    for (const [pid, starttime, pgid, comm] of t.rows) if (pid !== process.pid && !out.some((m) => m.pid === pid)) out.push({ pid, starttime, bootId, comm, pgid });
  }
  out.cut = cut; out.pruned = pruned; out.keptOut = exclude;
  return out;
}
/** END A TREE (B-c134): `signal` to each member THROUGH signalIdentity (a refused one — EPERM — is said, never «ended») (its pid and start time judged at the act — a recycled
 *  pid is never signalled), `graceMs` for them to end, `hard` for what is left, 1 s more to see it go. → {ended, left, stale}:
 *  `ended` = what was ours and is gone (comm names), `left` = what is still there after the hard signal, `stale` = members
 *  no longer ours at the act (gone before, or another process now). opts.kill: injectable (signalIdentity's). */
async function endTree(members, { graceMs = 5000, signal = 'SIGTERM', hard = 'SIGKILL', pollMs = 50 } = {}, opts = {}) {
  const sent = [], refused = [];
  let stale = 0;
  for (const m of members || []) { const r = signalIdentity(m, signal, opts); if (r.ok) sent.push(m); else if (r.why === 'not-ours') refused.push(m); else stale++; }
  const alive = (m) => aliveIdentity(m, opts) === true;
  const wait = async (ms, list) => { const t = Date.now(); let l = list.filter(alive); while (l.length && Date.now() - t < ms) { await new Promise((r) => setTimeout(r, pollMs)); l = l.filter(alive); } return l; };
  let live = await wait(graceMs, sent);
  if (live.length) { for (const m of live) signalIdentity(m, hard, opts); live = await wait(1000, live); }
  const left = new Set(live.map((m) => m.pid)), name = (m) => m.comm || String(m.pid);
  return { ended: sent.filter((m) => !left.has(m.pid)).map(name), left: [...live.map(name), ...refused.map((m) => `${name(m)} (not ours to signal)`)], stale };
}
/** THE ONE LINE a stop says of its tree: the count and the names of what it ended and of what it could not; a cut or blind read said */
const countNames = (l) => { const c = new Map(); for (const n of l) c.set(n, (c.get(n) || 0) + 1); return [...c].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(', '); };
function treeLine(r, scan) {
  const names = countNames;
  const parts = [];
  if (r && r.ended.length) parts.push(`ended ${r.ended.length} process${r.ended.length === 1 ? '' : 'es'} it started (${names(r.ended)})`);
  if (r && r.left.length) parts.push(`could not end ${r.left.length} (${names(r.left)})`);
  if (scan && scan.cut) parts.push('its process tree was read only in part (past its bound): what it started may be left');
  return parts.join('; ');
}
/** B-c134 cure (MUST B): WHAT A STOP TELLS THE PERSON when it could not end everything — a member left (it did not end by force, or
 *  was not ours to signal) or a walk CUT (what it did not read may run). PURE → {key, params, text} for the person's notice (the
 *  client words `key` with `params`; `text` the English for the journal and an older client) | null: all ended, the journal's
 *  line alone. The process names are the kernel's (comm), never a person's words */
const TREE_NOTICE = {
  left: i18nKey('"{name}" ended, but {n} of the processes it started could not be stopped ({names}) — they may still be running.'),
  leftCut: i18nKey('"{name}" ended, but {n} of the processes it started could not be stopped ({names}) and its process list was read only in part — more of them may still be running.'),
  cut: i18nKey('"{name}" ended, but its process list was read only in part — some processes it started may still be running.'),
};
function treeNotice(r, scan, name) {
  const left = ((r && r.left) || []).map((n) => String(n).replace(/ \(not ours to signal\)$/, '')), cut = !!(scan && scan.cut);
  if (!left.length && !cut) return null;
  const key = left.length ? (cut ? TREE_NOTICE.leftCut : TREE_NOTICE.left) : TREE_NOTICE.cut;
  const params = { name: String(name || '').slice(0, 120), n: left.length, names: countNames(left) };
  return { key, params, text: key.replace(/\{(\w+)\}/g, (_, k) => String(params[k])) };
}

// ── SHIPPED TWIN BEGIN — data/bin/vibespace-remote-keeper carries these lines byte-for-byte: it ships to a host as ONE
// file and cannot require src/ (the vibespace-usage-scan precedent). test-pid-identity pins the copy to this source. ──
/** agentd's spawn-proof token (moved verbatim from src/agentd/agentd.js pidStartTime): 'l' + field 22 on a
 *  procfs, else 'p' + the `ps -o lstart=` string, else ''. Kept because session metas persist it as `startTime`. */
let _procfs = null;   // B-f64b: Linux's procfs, read once (a platform fact)
function startToken(pid) {
  try {
    const st = fs.readFileSync('/proc/' + pid + '/stat', 'utf-8');
    const rest = st.slice(st.lastIndexOf(')') + 2).split(' ');
    if (rest[19]) return 'l' + rest[19];
  } catch { }
  if (_procfs === null) { try { _procfs = process.platform === 'linux' && fs.statSync('/proc/self').isDirectory(); } catch { _procfs = false; } }
  if (_procfs) return '';   // B-f64b: on Linux's procfs its silence is the answer (gone) — ps reads the same /proc
  try {
    const r = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf-8', timeout: 3000 });   // B-f64b cure: never unbounded (macOS / BSD)
    const s = String(r.stdout || '').trim();
    if (s) return 'p' + s;
  } catch { }
  return '';
}
/** This box's boot id ('' with no procfs) — recorded beside a token: a reboot ends every process a record names. */
function bootToken() { try { return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf-8').trim(); } catch { return ''; } }
/** A RECORDED birth (startToken's form) against the pid now → same | zombie | pid-recycled | gone | unknown-identity
 *  (no birth recorded) | unknown (the recorded rung is not readable here). Only `same` may be signalled. */
function tokenVerdict(pid, token, bootId) {
  if (!(Number(pid) > 1) || !token) return 'unknown-identity';
  if (bootId) { const b = bootToken(); if (b && b !== bootId) return 'gone'; }
  const cur = startToken(pid);
  if (!cur) return 'gone';
  if (cur[0] !== String(token)[0]) return 'unknown';
  if (cur !== String(token)) return 'pid-recycled';
  try { const st = fs.readFileSync('/proc/' + pid + '/stat', 'utf-8'); if (st[st.lastIndexOf(')') + 2] === 'Z') return 'zombie'; } catch { }
  return 'same';
}
// ── SHIPPED TWIN END ──

/** THE BIRTHS OF MANY RECORDS IN ONE LOOK (B-5a4d root, r3282 — a chat wrapper's start judges every record a killed wrapper left,
 *  up to fifty): [{ pid, token, bootId }] → tokenVerdict's words, in order. On Linux's procfs each is tokenVerdict (there its silence
 *  is the answer: gone). WITHOUT ONE (macOS, BSD — a paired machine runs the chat wrapper) ONE listing of every process answers them
 *  all, off the loop and bounded: a listing that failed, passed its bound or said nothing PROVES NOTHING — every verdict is 'unknown',
 *  never 'gone'; only a listing that answered and does not hold the pid is 'gone'. `listing` is a seam (→ Map pid → {stat, lstart}). */
async function tokenVerdicts(list, { procfs = process.platform === 'linux' && hasProc(), listing = processListing } = {}) {
  const items = Array.isArray(list) ? list : [];
  if (procfs) return items.map((x) => tokenVerdict(x && x.pid, x && x.token, x && x.bootId));
  let rows = null;
  if (items.some((x) => x && Number(x.pid) > 1 && x.token)) { try { rows = await listing(); } catch { rows = null; } }
  const norm = (t) => String(t || '').trim().replace(/\s+/g, ' ');
  return items.map((x) => {
    if (!x || !(Number(x.pid) > 1) || !x.token) return 'unknown-identity';
    if (!(rows instanceof Map) || !rows.size) return 'unknown';
    const t = String(x.token);
    if (t[0] !== 'p') return 'unknown';   // a birth another rung recorded (a procfs's ticks) is not readable here
    const row = rows.get(Number(x.pid));
    if (!row) return 'gone';
    if (norm(row.lstart) !== norm(t.slice(1))) return 'pid-recycled';
    return /Z/.test(String(row.stat || '')) ? 'zombie' : 'same';
  });
}
/** ONE `ps` listing of every process — pid, state, start (startToken's off-procfs rung, the same env: the same words) → Map, or null
 *  when it failed, passed its bound or listed nothing */
function processListing({ timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    try {
      execFile('ps', ['-A', '-o', 'pid=,stat=,lstart='], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve(null); return; }
        const m = new Map();
        for (const line of String(stdout || '').split('\n')) { const r = /^\s*(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line); if (r) m.set(Number(r[1]), { stat: r[2], lstart: r[3] }); }
        resolve(m.size ? m : null);
      });
    } catch { resolve(null); }
  });
}

/** A record's start token (+ bootId) → the identity judge() / signalIdentity() read. No token = a birth-less record
 *  (`unknown-identity`: never signalled by proof — the caller's legacy rung decides, said once). */
function identityFromToken(pid, token, bootId) {
  const t = String(token || '');
  if (t[0] === 'l' && /^\d+$/.test(t.slice(1))) return { pid: Number(pid), starttime: Number(t.slice(1)), bootId: bootId || '' };
  if (t[0] === 'p' && t.length > 1) return { pid: Number(pid), starttime: null, lstart: t.slice(1), bootId: '' };
  return { pid: Number(pid), starttime: null, bootId: '' };
}

/** THE SH TWIN (B-5ee1): `vs_same_proc <pid> <token> [bootId]` returns 0 only while <pid> is still the process whose
 *  start token (startToken's form) was recorded; else 1 with $VS_SAME_WHY = pid-recycled | gone | zombie |
 *  unknown-identity | unknown. Linux: /proc/<pid>/stat field 22 counted from the LAST ') ' (comm may hold one) +
 *  /proc/sys/kernel/random/boot_id; else `ps -o lstart= -p`. Embedded verbatim by the writer sweep and the ssh kill,
 *  exactly as cliIdentityShellFns() is; test-pid-identity drives it against a REAL scratch sleep. */
function procIdentityShellFns() {
  return `vs_same_proc() {
  VS_SAME_WHY=unknown-identity
  case "$1" in ''|*[!0-9]*) return 1;; esac
  [ -n "$2" ] || return 1
  if [ -n "$3" ] && [ -r /proc/sys/kernel/random/boot_id ] && [ "$(cat /proc/sys/kernel/random/boot_id)" != "$3" ]; then VS_SAME_WHY=gone; return 1; fi
  vs_sp_cur=; vs_sp_state=
  if [ -r "/proc/$1/stat" ]; then
    vs_sp_st=$(cat "/proc/$1/stat" 2>/dev/null)
    vs_sp_rest=\${vs_sp_st##*) }
    vs_sp_t=$(printf '%s\\n' "$vs_sp_rest" | cut -d' ' -f20)
    [ -n "$vs_sp_st" ] && [ -n "$vs_sp_t" ] && { vs_sp_cur=l$vs_sp_t; vs_sp_state=$(printf '%s\\n' "$vs_sp_rest" | cut -d' ' -f1); }
  fi
  if [ -z "$vs_sp_cur" ]; then
    vs_sp_ps=$(ps -p "$1" -o lstart= 2>/dev/null | sed 's/^ *//;s/ *$//')
    [ -n "$vs_sp_ps" ] && vs_sp_cur=p$vs_sp_ps
  fi
  [ -n "$vs_sp_cur" ] || { VS_SAME_WHY=gone; return 1; }
  case "$vs_sp_cur" in l*) case "$2" in l*) ;; *) VS_SAME_WHY=unknown; return 1;; esac;; *) case "$2" in p*) ;; *) VS_SAME_WHY=unknown; return 1;; esac;; esac
  [ "$vs_sp_cur" = "$2" ] || { VS_SAME_WHY=pid-recycled; return 1; }
  [ "$vs_sp_state" = Z ] && { VS_SAME_WHY=zombie; return 1; }
  VS_SAME_WHY=same; return 0
}`;
}

/** The words a WITHHELD signal reaches the user with (the no-silent-failures law): the kill answer / exit record / notice
 *  where the stop was asked. i18n = {key, params} for serverNotice; `text` = the English (journal, older clients). */
const WITHHELD_KEY = i18nKey("{name}'s process was not stopped: pid {pid} now belongs to another process (recorded {when}) — nothing of VibeSpace's is running");
function withheldWords(name, pid, when) {
  const params = { name: String(name || 'VibeSpace'), pid: String(pid), when: String(when || 'earlier') };
  return { text: WITHHELD_KEY.replace(/\{(\w+)\}/g, (m, k) => params[k]), i18n: { key: WITHHELD_KEY, params } };
}
/** The legacy rung's ONE line per record (B-5ee1 rung 3, retire 2026-12-01): a record an older build wrote carries no birth. */
const LEGACY_LINE = 'legacy pid record, cmdline-only — re-recorded at its next start';
const _legacySaid = new Set();
function legacyOnce(door, pid, say) {
  const key = `${door}:${pid}`;
  if (_legacySaid.has(key)) return null;
  _legacySaid.add(key);
  const line = `[proc-identity] ${door}: pid ${pid} — ${LEGACY_LINE}`;
  try { (say || ((l) => console.warn(l)))(line); } catch { }
  return line;
}

/** B-03af — A START ON THE WALL CLOCK, PAIRED IN ONE INSTANT: `ticks` (stat field 22, USER_HZ 100 after boot) put on this
 *  machine's wall clock with the boot's uptime and the wall clock read together, here — never another moment's anchor (a
 *  reader whose own start was slow, or whose time origin was stamped late, moves nothing). Wall ms, or null (no procfs, an
 *  unreadable uptime, no ticks). A wall clock stepped since that process started still moves the answer by the step: only a
 *  record in ticks (startToken) is free of it. `opts.now` = the wall clock (a suite's stand-in). */
const USER_HZ = 100;
function wallStartOf(ticks, opts) {
  const t = Number(ticks);
  if (ticks == null || ticks === '' || !Number.isFinite(t) || t < 0) return null;
  let up = NaN;
  try { up = Number(String(fs.readFileSync(`${rootOf(opts)}/uptime`, 'utf8')).split(' ')[0]); } catch { return null; }
  const wallNow = opts && typeof opts.now === 'function' ? Number(opts.now()) : Date.now();
  return Number.isFinite(up) && up > 0 && Number.isFinite(wallNow) ? Math.round(wallNow - (up * 1000 - t * (1000 / USER_HZ))) : null;
}
/** B-03af — what proves «this pid is still the process that wrote its record», read NOW in one place (the hub's boot hands it
 *  to src/conversation-facts.js adoptionProof): { proc, state, verdict, startMs }.
 *  · proc FIRST: this machine has a procfs. Without one NOTHING else is read and NO PROGRAM IS STARTED (round w57qbqw4n: the
 *    boot's restore is one synchronous pass — tokenVerdict's no-procfs rung is a `ps` per call): state and startMs null, the
 *    verdict «unknown» for a recorded birth — the caller SAYS it could not be proven, never «gone»;
 *  · verdict: tokenVerdict of the birth the record carries (`start` in startToken's form + `boot`, the boot id) — ONE clock,
 *    the kernel's start ticks under the same boot; null when the record carries none (an older writer);
 *  · state: stat field 3; startMs: the same read's start on the wall clock (wallStartOf) — read ONLY for a record with no birth
 *    (an older record's one bridge; the birth road never uses it). */
function birthReading(pid, { start = '', boot = '' } = {}, opts) {
  const born = typeof start === 'string' && start !== '';
  if (!hasProc(opts)) return { proc: false, state: null, verdict: born ? 'unknown' : null, startMs: null };
  const r = statRest(pid, opts);
  const verdict = born ? tokenVerdict(pid, start, typeof boot === 'string' ? boot : '') : null;
  return { proc: true, state: r ? r[0] : null, verdict, startMs: r && !born ? wallStartOf(r[19], opts) : null };
}

module.exports = {
  childTreeOf, keptByChain, hubChain, treeOf, endTree, treeLine, treeNotice, TREE_NOTICE, keepOut, keptOut,
  PROC_ROOT, UNPROVABLE, WITHHELD_KEY, LEGACY_LINE,
  hasProc, bootIdOf, starttimeOf, stateOf, pgidOf, ppidOf, statOf, identityOf, judge, sameProcess, aliveIdentity, signalIdentity, membersOf, reportOnce, startToken,
  bootToken, tokenVerdict, tokenVerdicts, processListing, identityFromToken, procIdentityShellFns, withheldWords, legacyOnce,
  wallStartOf, birthReading,
  _resetReported: () => { _reported.clear(); _legacySaid.clear(); },
};
