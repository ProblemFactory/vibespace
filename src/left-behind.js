'use strict';
/**
 * WHAT A STOPPED TURN'S COMMAND TOOL LEFT RUNNING (B-69a7, lane lg-rewind 2026-11-19; 主开发's rulings 09:50Z + round wz421di05)
 * — a FACT ABOUT A MACHINE, read where it lives: this machine (the hub) and a paired one (the device agent's READ-ONLY op
 * 'left-behind'), ONE implementation. MEASURED (claude 2.1.322, read as bytes): at a Stop the CLI kills the command's whole
 * process GROUP and every descendant linked to it by parent (SIGKILL) — what survives was RE-PARENTED away first (a double
 * fork, `setsid … &`). So the read is not «the tree below the CLI» but THE CONVERSATION'S OWN ENV MARK:
 *   · `mark` = CLAUDE_WEBUI_SESSION_ID=<conversation id> in the process's environ, nothing else (never a probe of another
 *     variable) — never another conversation's;
 *   · THE CONVERSATION'S OWN CHAIN IS KNOWN BY RECORD or nothing is said but «could not be read» (`own-unknown`, no row, no
 *     door): the pids its records name (`records`: the hub's wrapper meta; a paired machine's keeper / pipe-session meta —
 *     `pid`, `keeperPid`, `childPid`; `recordPids`: the hub's recorded CLI pid), at least one alive and carrying the mark. They,
 *     their marked ancestors (the dtach master) and `own` (the pty — never proof alone) are never named; what runs under
 *     them, or under a marked process older than the turn, is the CLI's own: `kept` (named, never offered for ending);
 *   · the same user only (`others` counted, never read; this user's process whose folder is closed, in D, with a thread in D,
 *     or whose parent chain broke mid-read is `unreadable` — the caller SAYS it, never «nothing left»);
 *   · started after THIS turn began (`ageMs` back from `now`, this machine's own clock);
 *   · NEVER what the hub (or the agent) spawned and holds: under a `keep` root (the hub's own records — jobs, agent browsers,
 *     desktop apps, the device agent), by its parent chain, it is theirs (`held`, counted); the reading process's own parent
 *     (its supervisor, by record: process.ppid) is never named; a process carrying a job's mark (VIBESPACE_JOB_ID — its
 *     presence only) is a JOB's (`jobs`: named as a job's, never offered).
 * ASYNC AND BOUNDED (the hub's loop is never held): batches of reads, at most `maxRows` processes and `maxMs` — each batch RACED
 * against the time left (a late answer changes nothing returned); environ reads take one of ENV_SLOTS process-wide slots (a
 * read the kernel holds keeps its slot: never more than ENV_SLOTS pool threads — half of a device agent's four; the hub runs 32)
 * and a closed read's waiters are dropped at its close; a cut read PROVES NOTHING
 * (`scan.cut`). ONLY pid, command name and start time leave this function (ROW_KEYS).
 */
const fs = require('fs');
const fsp = fs.promises;
const HZ = 100;   // USER_HZ: the unit of /proc/<pid>/stat field 22 (start time, ticks after boot)
const ROW_KEYS = Object.freeze(['pid', 'comm', 'start', 'startedAt']);
const MARK_RE = /^CLAUDE_WEBUI_SESSION_ID=[A-Za-z0-9_.:-]{1,128}$/;
const JOB_KEY = 'VIBESPACE_JOB_ID=';
const BATCH = 64, CHAIN = 64, THREADS = 64, RECORD_MAX = 1 << 20, ENV_SLOTS = 2;
/** /proc/<pid>/stat → {comm, state, ppid, start} (the command name sits in the LAST parentheses: a name may hold «) ») */
function statOf(txt) {
  const a = String(txt || ''), i = a.lastIndexOf(')');
  if (i < 0) return null;
  const r = a.slice(i + 2).split(' ');
  return { comm: a.slice(a.indexOf('(') + 1, i), state: r[0], ppid: Number(r[1]), start: Number(r[19]) };
}
/** THE NAME A PERSON READS FOR A PROCESS IS THE PROGRAM'S, NEVER A THREAD'S (主开发 10:15Z, the cut of .413): the stat's name in
 *  its parentheses is the MAIN THREAD's, and a program may rename it (Node 24 names it «MainThread»). → the base name of the
 *  program the kernel says the process runs (its exe link: «/usr/bin/node» or «… (deleted)»), bounded as the row's name;
 *  only when that cannot be read, the stat's name. PURE. */
function nameOf(statName, exeTarget) {
  const t = typeof exeTarget === 'string' ? exeTarget.replace(/ \(deleted\)$/, '') : '';
  const base = t ? t.slice(t.lastIndexOf('/') + 1) : '';
  return String(base || statName || '').slice(0, 32);
}
/** the exe link of a process found (read only for the rows the read names — off the loop, inside the read's bound); null when it cannot be read */
async function exeOf(procRoot, p) { try { return await fsp.readlink(`${procRoot}/${p}/exe`); } catch { return null; } }
const realUidOf = (txt) => { const m = /^Uid:\s+(\d+)/m.exec(String(txt || '')); return m ? Number(m[1]) : -1; };
const pidsOf = (l) => (Array.isArray(l) ? l : [l]).map((x) => Number(Array.isArray(x) ? x[0] : x)).filter((p) => Number.isInteger(p) && p > 1);
// THE ENVIRON SLOTS (process-wide): a read the kernel holds (a target's thread stuck in D) keeps its slot until it returns
let envBusy = 0;
let envQueue = [];
const envTake = (alive) => new Promise((res, rej) => {
  const w = { alive, rej, go: () => { if (!alive()) { envGive(); rej(new Error('closed')); } else res(); } };
  if (envBusy < ENV_SLOTS) { envBusy++; w.go(); } else envQueue.push(w);
});
function envGive() { const n = envQueue.shift(); if (n) n.go(); else envBusy = Math.max(0, envBusy - 1); }
/** a read that closed drops its waiters (they would hold its whole scope until the kernel let a slot go) */
function envPrune() { const gone = envQueue.filter((w) => !w.alive()); envQueue = envQueue.filter((w) => w.alive()); for (const w of gone) w.rej(new Error('closed')); }
/** a process's environ → {mark, job} | null (could not be read: a D thread, a closed folder, no slot in time) */
async function envFacts(procRoot, p, mark, alive = () => true) {
  let ts = [];
  try { ts = (await fsp.readdir(`${procRoot}/${p}/task`)).slice(0, THREADS); } catch { ts = []; }   // gone, or no thread list (the main state was read)
  for (const t of ts) { let s = null; try { s = statOf(await fsp.readFile(`${procRoot}/${p}/task/${t}/stat`, 'utf8')); } catch { s = null; } if (s && s.state === 'D') return null; }
  try { await envTake(alive); } catch { return null; }
  try {
    const kv = (await fsp.readFile(`${procRoot}/${p}/environ`, 'latin1')).split('\0');
    return { mark: kv.includes(mark), job: kv.some((x) => x.startsWith(JOB_KEY)) };
  } catch (e) { return e && (e.code === 'ENOENT' || e.code === 'ESRCH') ? { mark: false, job: false } : null; }
  finally { envGive(); }
}
// a record's pid → the birth written beside it (the 'l' + start-ticks token of src/proc-identity.js startToken, its copies in the
// keeper and the agent): `childStart` (the wrapper's and the keeper's CLI), `keeperStart`, `startTime` (a pipe session's CLI)
const RECORD_KEYS = Object.freeze([['pid', ['pidStart']], ['keeperPid', ['keeperStart']], ['childPid', ['childStart', 'startTime']]]);
/** the pids a record file names, each with its birth when written — a missing, unreadable, oversized or unparsable record names none */
async function recordPidsOf(files) {
  const out = [];
  for (const f of (Array.isArray(files) ? files : []).filter((x) => typeof x === 'string' && x)) {
    try {
      const st = await fsp.stat(f);
      if (!st.isFile() || st.size > RECORD_MAX) continue;
      const m = JSON.parse(await fsp.readFile(f, 'utf8'));
      for (const [k, bs] of RECORD_KEYS) { const p = Number(m && m[k]); if (Number.isInteger(p) && p > 1) out.push({ pid: p, birth: bs.map((b) => m[b]).find((x) => typeof x === 'string' && x) || null }); }
    } catch { /* names none */ }
  }
  return out;
}
const timeLeft = (t0, maxMs) => maxMs - (Date.now() - t0);
async function raced(work, rest) {   // the work raced against the time left → true when it finished inside the bound
  if (rest <= 0) return false;
  let tm = null;
  const done = await Promise.race([work.then(() => true, () => true), new Promise((r) => { tm = setTimeout(r, rest, false); })]);
  clearTimeout(tm);
  return done;
}
async function leftBehind({ mark, ageMs = 0, keep = [], own = [], records = [], recordPids = [], maxRows = 4096, maxMs = 1500, procRoot = '/proc', now = Date.now(), parent = process.ppid } = {}) {
  const out = { left: [], kept: [], jobs: [], scan: { scanned: 0, total: 0, unreadable: 0, others: 0, held: 0, cut: false } };
  if (typeof mark !== 'string' || !MARK_RE.test(mark)) { out.unread = 'no-mark'; return out; }
  const t0 = Date.now();
  let closed = false;   // past the bound: a late read changes nothing the caller holds
  const alive = () => !closed;
  let btime = 0, names = [];
  try { btime = Number((/^btime (\d+)/m.exec(await fsp.readFile(`${procRoot}/stat`, 'utf8')) || [])[1]) || 0; names = await fsp.readdir(procRoot); } catch { btime = 0; }
  if (!btime) { out.unread = 'no-proc'; return out; }   // no /proc (macOS, Windows): could not be read — said, never «nothing left»
  const since = Math.floor(((Number(now) - Math.max(0, Number(ageMs) || 0)) / 1000 - btime) * HZ) - HZ;   // a tick's rounding: one second of slack
  const me = typeof process.getuid === 'function' ? process.getuid() : -1;
  const pids = names.filter((e) => /^\d+$/.test(e)).map(Number).filter((p) => p > 1 && p !== process.pid).sort((a, b) => b - a);   // newest first
  out.scan.total = pids.length;
  const keepSet = new Set(pidsOf(keep)), ownSet = new Set(), never = new Set(pidsOf([parent])), stats = new Map(), envs = new Map();
  const stat = async (p) => { if (stats.has(p)) return stats.get(p); let s = null; try { s = statOf(await fsp.readFile(`${procRoot}/${p}/stat`, 'utf8')); } catch { s = null; } stats.set(p, s); return s; };
  const env = async (p) => { if (!envs.has(p)) envs.set(p, envFacts(procRoot, p, mark, alive)); return envs.get(p); };
  // THE CONVERSATION'S OWN CHAIN, BY RECORD: its records' pids (at least one alive and marked), their marked ancestors, the pty
  let known = false;
  const ownWalk = (async () => {
    const rec = [...pidsOf(recordPids).map((p) => ({ pid: p, birth: null })), ...(await recordPidsOf(records))], proven = [];
    for (const { pid: o, birth } of rec) {   // a record proves the chain only while its pid is alive, marked and of its recorded birth
      const s = await stat(o);
      if (!s || s.state === 'Z' || (typeof birth === 'string' && birth.startsWith('l') && birth !== 'l' + s.start)) continue;
      if (((await env(o)) || {}).mark === true) { known = true; proven.push(o); }
    }
    for (const o of [...proven, ...pidsOf(own)]) {
      let q = o;
      for (let k = 0; k < CHAIN && q > 1 && !ownSet.has(q); k++) {
        if (k && ((await env(q)) || {}).mark !== true) break;
        ownSet.add(q);
        const s = await stat(q); if (!s) break;
        q = s.ppid;
      }
    }
  })();
  if (!(await raced(ownWalk, timeLeft(t0, maxMs)))) { closed = true; envPrune(); out.scan.cut = true; return out; }
  if (!known) { closed = true; envPrune(); out.unread = 'own-unknown'; return out; }   // the chain is not known by record: nothing is named, no door
  const recordOf = async (p) => {   // whose is it by the RECORDS, along the parent chain (stat reads only): 'own' | 'held' | 'broken' | null
    let q = p;
    for (let k = 0; k < CHAIN && q > 1; k++) { if (ownSet.has(q)) return 'own'; if (keepSet.has(q)) return 'held'; const s = await stat(q); if (!s) return q === p ? null : 'broken'; q = s.ppid; }
    return null;
  };
  const underOlder = async (p) => {   // under a marked process older than the turn (the CLI, a paired machine's keeper)?
    let q = (await stat(p) || {}).ppid;
    for (let k = 0; k < CHAIN && q > 1; k++) { const s = await stat(q); if (!s) return false; if (s.start < since && ((await env(q)) || {}).mark === true) return true; q = s.ppid; }
    return false;
  };
  const put = (fn) => { if (!closed) fn(); };
  const one = async (p) => {
    out.scan.scanned++;
    const s = await stat(p);
    if (!s || s.state === 'Z' || !(s.start >= since) || ownSet.has(p) || never.has(p)) return;   // the conversation itself, the reader's own supervisor: never named
    let by = await recordOf(p);
    if (by === 'broken') { stats.delete(p); by = await recordOf(p); }   // a parent that exited mid-read: p has its new parent now
    if (by === 'held') { put(() => { out.scan.held++; }); return; }
    let uid = -1;
    try { uid = (await fsp.stat(`${procRoot}/${p}`)).uid; } catch { return; }
    if (me >= 0 && uid !== me) {
      let real = -1;
      try { real = realUidOf(await fsp.readFile(`${procRoot}/${p}/status`, 'utf8')); } catch { real = -1; }
      put(() => { if (real === me) out.scan.unreadable++; else out.scan.others++; });   // this user's, its folder closed (non-dumpable: ssh-agent)
      return;
    }
    const e = s.state === 'D' ? null : await env(p);
    if (e === null) { put(() => { out.scan.unreadable++; }); return; }
    if (!e.mark) return;
    if (by === 'broken') { put(() => { out.scan.unreadable++; }); return; }   // this conversation's, but whose chain it is in is not known
    const row = { pid: p, comm: nameOf(s.comm, await exeOf(procRoot, p)), start: s.start, startedAt: Math.round((btime + s.start / HZ) * 1000) };
    if (e.job) { put(() => { out.jobs.push(row); }); return; }   // a job's (its own mark beside the conversation's): never offered
    const kept = by === 'own' || (await underOlder(p));
    put(() => { (kept ? out.kept : out.left).push(row); });
  };
  let i = 0;
  while (i < pids.length) {
    const room = Math.min(BATCH, Math.max(0, Number(maxRows) || 0) - out.scan.scanned);
    if (room <= 0) { out.scan.cut = true; break; }
    const batch = pids.slice(i, i + room); i += batch.length;
    if (!(await raced(Promise.all(batch.map((p) => one(p).catch(() => { put(() => { out.scan.unreadable++; }); }))), timeLeft(t0, maxMs)))) { out.scan.cut = true; break; }
  }
  closed = true; envPrune();
  for (const l of [out.left, out.kept, out.jobs]) l.sort((a, b) => a.start - b.start);
  return out;
}
/** at the END press, each pid again — the same bound, slots and stuck check as the scan: the same start time, not under anything
 *  the hub holds NOW, still the conversation's mark and no job's → {pid, starttime, comm}; else 'gone' | 'held' | 'unread' */
async function stillLeft({ pid, start }, mark, { procRoot = '/proc', keep = [], maxMs = 1500 } = {}) {
  const keepSet = new Set(pidsOf(keep)), t0 = Date.now();
  let closed = false, v = 'unread';
  const work = (async () => {
    const s = statOf(await fsp.readFile(`${procRoot}/${pid}/stat`, 'utf8').catch(() => ''));
    if (!s || s.state === 'Z' || s.start !== Number(start)) { v = 'gone'; return; }
    let q = Number(pid), t = s;
    for (let k = 0; k < CHAIN && q > 1; k++) {
      if (keepSet.has(q)) { v = 'held'; return; }
      q = t.ppid; t = q > 1 ? statOf(await fsp.readFile(`${procRoot}/${q}/stat`, 'utf8').catch(() => '')) : null;
      if (q > 1 && !t) { v = 'unread'; return; }   // its chain broke mid-read: whether the hub holds it is not known
    }
    const e = s.state === 'D' ? null : await envFacts(procRoot, pid, mark, () => !closed);
    if (e === null) { v = 'unread'; return; }
    if (!e.mark) { v = 'gone'; return; }
    if (e.job) { v = 'held'; return; }
    v = { pid: Number(pid), starttime: s.start, comm: nameOf(s.comm, await exeOf(procRoot, pid)) };   // judged by pid, start time and mark; named by its program
  })();
  if (!(await raced(work, timeLeft(t0, maxMs)))) { closed = true; envPrune(); return 'unread'; }
  closed = true;
  return v;
}
/** the device agent's READ-ONLY op (agentd 'left-behind'): the same read on the machine where the facts live — the agent's own
 *  tree and its own records (`keep`: its desktop apps) held out; the conversation's chain known by the agent's own record
 *  files for `msg.sid` (`records`: the keeper's meta, the pipe session's meta) */
async function leftBehindOp(msg, { procRoot = '/proc', keep = [], records = [] } = {}) {
  const r = await leftBehind({ mark: msg && msg.mark, ageMs: msg && msg.ageMs, keep: [process.pid, ...pidsOf(keep)], records, procRoot });
  const pick = (x) => Object.fromEntries(ROW_KEYS.map((k) => [k, x[k]]));
  return { left: r.left.map(pick), kept: r.kept.map(pick), jobs: r.jobs.map(pick), scan: r.scan, ...(r.unread ? { unread: r.unread } : {}) };
}
module.exports = { leftBehind, leftBehindOp, stillLeft, statOf, nameOf, recordPidsOf, ROW_KEYS, HZ, MARK_RE, ENV_SLOTS, envSlotsBusy: () => envBusy, envSlotsWaiting: () => envQueue.length };
