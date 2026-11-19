'use strict';
/**
 * WHAT A STOPPED TURN'S COMMAND TOOL LEFT RUNNING (B-69a7, lane lg-rewind 2026-11-19; 主开发's rulings 09:50Z) — a FACT ABOUT A
 * MACHINE, read where it lives: this machine (the hub) and a paired one (the device agent's READ-ONLY op 'left-behind'), ONE
 * implementation. MEASURED (claude 2.1.322, read as bytes): at a Stop the CLI kills the command's whole process GROUP and every
 * descendant linked to it by parent (SIGKILL) — what survives was RE-PARENTED away first (a double fork, `setsid … &`). So the
 * read is not «the tree below the CLI» but THE CONVERSATION'S OWN ENV MARK, which every road gives the CLI and a daemon keeps:
 *   · `mark` = CLAUDE_WEBUI_SESSION_ID=<conversation id> in the process's environ, nothing else (never a probe of another
 *     variable) — never another conversation's;
 *   · the same user only (`others` counted, never read; this user's process whose folder is closed — a non-dumpable one, a
 *     thread stuck in D — is `unreadable`, and the caller SAYS it: «could not be read», never «nothing left»);
 *   · started after THIS turn began (`ageMs` back from `now`, this machine's own clock — a paired machine's clock never meets ours);
 *   · NEVER what the hub (or the agent) spawned and holds: a process under a `keep` root (the hub's own records — jobs, agent
 *     browsers, desktop apps, the device agent, other conversations' holders), by its parent chain, is theirs (`held`, counted);
 *   · under THIS conversation's own processes (`own`: its records — the pty, the CLI — and their ancestors that carry the mark:
 *     the wrapper, the dtach master) or under a marked process older than the turn (the CLI, a paired machine's keeper — read
 *     the same on both machines) it is the CLI's own — a background shell it keeps BY DESIGN: `kept` (named, never offered).
 * ASYNC AND BOUNDED (the hub's loop is never held): batches of reads, at most `maxRows` processes and `maxMs` — each batch RACED
 * against the time left (a read stuck in the kernel cuts the scan; a late answer changes nothing returned); a cut read PROVES
 * NOTHING (`scan.cut`). ONLY pid, command name and start time leave this function (ROW_KEYS): an environment's bytes and a
 * command's arguments never do — they hold secrets.
 */
const fs = require('fs');
const fsp = fs.promises;
const HZ = 100;   // USER_HZ: the unit of /proc/<pid>/stat field 22 (start time, ticks after boot)
const ROW_KEYS = Object.freeze(['pid', 'comm', 'start', 'startedAt']);
const MARK_RE = /^CLAUDE_WEBUI_SESSION_ID=[A-Za-z0-9_.:-]{1,128}$/;
const BATCH = 64, CHAIN = 64, THREADS = 64;
/** /proc/<pid>/stat → {comm, state, ppid, start} (the command name sits in the LAST parentheses: a name may hold «) ») */
function statOf(txt) {
  const a = String(txt || ''), i = a.lastIndexOf(')');
  if (i < 0) return null;
  const r = a.slice(i + 2).split(' ');
  return { comm: a.slice(a.indexOf('(') + 1, i), state: r[0], ppid: Number(r[1]), start: Number(r[19]) };
}
const realUidOf = (txt) => { const m = /^Uid:\s+(\d+)/m.exec(String(txt || '')); return m ? Number(m[1]) : -1; };
const pidsOf = (l) => (Array.isArray(l) ? l : [l]).map((x) => Number(Array.isArray(x) ? x[0] : x)).filter((p) => Number.isInteger(p) && p > 1);
async function leftBehind({ mark, ageMs = 0, keep = [], own = [], maxRows = 4096, maxMs = 1500, procRoot = '/proc', now = Date.now() } = {}) {
  const out = { left: [], kept: [], scan: { scanned: 0, total: 0, unreadable: 0, others: 0, held: 0, cut: false } };
  if (typeof mark !== 'string' || !MARK_RE.test(mark)) { out.unread = 'no-mark'; return out; }
  const t0 = Date.now();
  let btime = 0, names = [];
  try { btime = Number((/^btime (\d+)/m.exec(await fsp.readFile(`${procRoot}/stat`, 'utf8')) || [])[1]) || 0; names = await fsp.readdir(procRoot); } catch { btime = 0; }
  if (!btime) { out.unread = 'no-proc'; return out; }   // no /proc (macOS, Windows): could not be read — said, never «nothing left»
  const since = Math.floor(((Number(now) - Math.max(0, Number(ageMs) || 0)) / 1000 - btime) * HZ) - HZ;   // a tick's rounding: one second of slack
  const me = typeof process.getuid === 'function' ? process.getuid() : -1;
  const pids = names.filter((e) => /^\d+$/.test(e)).map(Number).filter((p) => p > 1 && p !== process.pid).sort((a, b) => b - a);   // newest first
  out.scan.total = pids.length;
  const keepSet = new Set(pidsOf(keep)), ownSet = new Set(), stats = new Map(), marks = new Map();
  let closed = false;   // past the bound: a late read changes nothing the caller holds
  const stat = async (p) => { if (stats.has(p)) return stats.get(p); let s = null; try { s = statOf(await fsp.readFile(`${procRoot}/${p}/stat`, 'utf8')); } catch { s = null; } stats.set(p, s); return s; };
  const stuck = async (p) => {   // a thread in D may hold what an environ read waits for (the memory map's lock): never read then
    let ts = [];
    try { ts = (await fsp.readdir(`${procRoot}/${p}/task`)).slice(0, THREADS); } catch { return false; }   // gone, or no thread list (the main state was read)
    for (const t of ts) { let s = null; try { s = statOf(await fsp.readFile(`${procRoot}/${p}/task/${t}/stat`, 'utf8')); } catch { s = null; } if (s && s.state === 'D') return true; }
    return false;
  };
  const hasMark = async (p) => {   // true | false | null (could not be read)
    if (marks.has(p)) return marks.get(p);
    let v = null;
    if (!(await stuck(p))) { try { v = (await fsp.readFile(`${procRoot}/${p}/environ`, 'latin1')).split('\0').includes(mark); } catch (e) { v = e && (e.code === 'ENOENT' || e.code === 'ESRCH') ? false : null; } }
    marks.set(p, v); return v;
  };
  const within = async (work) => {   // the work raced against the time left → true when it finished inside the bound
    const rest = maxMs - (Date.now() - t0);
    if (rest <= 0) return false;
    let tm = null;
    const done = await Promise.race([work.then(() => true, () => true), new Promise((r) => { tm = setTimeout(r, rest, false); })]);
    clearTimeout(tm);
    return done;
  };
  // THIS conversation's own: its records and, up their parent chain, every ancestor that still carries the mark
  const ownWalk = (async () => {
    for (const o of pidsOf(own)) {
      let q = o;
      for (let k = 0; k < CHAIN && q > 1 && !ownSet.has(q); k++) {
        if (k && (await hasMark(q)) !== true) break;
        ownSet.add(q);
        const s = await stat(q); if (!s) break;
        q = s.ppid;
      }
    }
  })();
  if (!(await within(ownWalk))) { closed = true; out.scan.cut = true; return out; }
  const recordOf = async (p) => {   // whose is it by the RECORDS, along the parent chain (stat reads only): 'own' | 'held' | null
    let q = p;
    for (let k = 0; k < CHAIN && q > 1; k++) { if (ownSet.has(q)) return 'own'; if (keepSet.has(q)) return 'held'; const s = await stat(q); if (!s) return null; q = s.ppid; }
    return null;
  };
  const underOlder = async (p) => {   // under a marked process older than the turn (the CLI, a paired machine's keeper)?
    let q = (await stat(p) || {}).ppid;
    for (let k = 0; k < CHAIN && q > 1; k++) { const s = await stat(q); if (!s) return false; if (s.start < since && (await hasMark(q)) === true) return true; q = s.ppid; }
    return false;
  };
  const put = (fn) => { if (!closed) fn(); };
  const one = async (p) => {
    out.scan.scanned++;
    const s = await stat(p);
    if (!s || s.state === 'Z' || !(s.start >= since) || ownSet.has(p)) return;   // the conversation itself (its CLI, wrapper, dtach master) is never named
    const by = await recordOf(p);
    if (by === 'held') { put(() => { out.scan.held++; }); return; }
    let uid = -1;
    try { uid = (await fsp.stat(`${procRoot}/${p}`)).uid; } catch { return; }
    if (me >= 0 && uid !== me) {
      let real = -1;
      try { real = realUidOf(await fsp.readFile(`${procRoot}/${p}/status`, 'utf8')); } catch { real = -1; }
      put(() => { if (real === me) out.scan.unreadable++; else out.scan.others++; });   // this user's, its folder closed (non-dumpable: ssh-agent)
      return;
    }
    const has = s.state === 'D' ? null : await hasMark(p);
    if (has === null) { put(() => { out.scan.unreadable++; }); return; }
    if (!has) return;
    const kept = by === 'own' || (await underOlder(p));
    const row = { pid: p, comm: String(s.comm).slice(0, 32), start: s.start, startedAt: Math.round((btime + s.start / HZ) * 1000) };
    put(() => { (kept ? out.kept : out.left).push(row); });
  };
  let i = 0;
  while (i < pids.length) {
    const room = Math.min(BATCH, Math.max(0, Number(maxRows) || 0) - out.scan.scanned);
    if (room <= 0) { out.scan.cut = true; break; }
    const batch = pids.slice(i, i + room); i += batch.length;
    if (!(await within(Promise.all(batch.map((p) => one(p).catch(() => { put(() => { out.scan.unreadable++; }); })))))) { out.scan.cut = true; break; }
  }
  closed = true;
  out.left.sort((a, b) => a.start - b.start); out.kept.sort((a, b) => a.start - b.start);
  return out;
}
/** at the END press, each pid again: the same start time, not under anything the hub holds NOW, and still the conversation's
 *  mark → its identity, else null (never signalled) */
async function stillLeft({ pid, start }, mark, { procRoot = '/proc', keep = [] } = {}) {
  const keepSet = new Set(pidsOf(keep));
  try {
    const s = statOf(await fsp.readFile(`${procRoot}/${pid}/stat`, 'utf8'));
    if (!s || s.state === 'Z' || s.start !== Number(start)) return null;
    let q = Number(pid), t = s;
    for (let k = 0; k < CHAIN && q > 1 && t; k++) { if (keepSet.has(q)) return null; q = t.ppid; t = q > 1 ? statOf(await fsp.readFile(`${procRoot}/${q}/stat`, 'utf8').catch(() => '')) : null; }
    if (!(await fsp.readFile(`${procRoot}/${pid}/environ`, 'latin1')).split('\0').includes(mark)) return null;
    return { pid: Number(pid), starttime: s.start, comm: s.comm };
  } catch { return null; }
}
/** the device agent's READ-ONLY op (agentd 'left-behind'): the same read on the machine where the facts live — the agent's own
 *  tree and its own records (`keep`: its desktop apps) held out */
async function leftBehindOp(msg, { procRoot = '/proc', keep = [] } = {}) {
  const r = await leftBehind({ mark: msg && msg.mark, ageMs: msg && msg.ageMs, keep: [process.pid, ...pidsOf(keep)], procRoot });
  const pick = (x) => Object.fromEntries(ROW_KEYS.map((k) => [k, x[k]]));
  return { left: r.left.map(pick), kept: r.kept.map(pick), scan: r.scan, ...(r.unread ? { unread: r.unread } : {}) };
}
module.exports = { leftBehind, leftBehindOp, stillLeft, statOf, ROW_KEYS, HZ, MARK_RE };
