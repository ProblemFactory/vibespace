'use strict';
/**
 * THE PACE OF A STORE'S WRITE (lane hub-loop-stalls, commit 2 — «no store write holds the main thread»). PURE, imports
 * nothing: when a dirty store is written, given how big it is and when it was last written. The ORCH half is
 * src/store-writer.js (its own thread does the syscalls; the main thread only produces the bytes when they are due).
 *
 * MEASURED (a scratch hub over a 22.3 MB / 2 032-conversation channels index, strace delay injection on the hub's own
 * renames — lane dir c2/slowstore): a busy index (5 row changes a second) was rewritten WHOLE every ~0.5 s — the 500 ms
 * debounce never re-armed — 101 writes and 2 257 MB a minute at local-disk speed; at 500 ms per rename each write held
 * the main thread 0.5 s (75 holds ≥ 250 ms in that minute). Off the main thread alone the holds go; the 2 GB a minute
 * would not. So a store rewritten whole is written at a pace STATED FOR ITS SIZE:
 *
 *   minGapMs(bytes) = clamp(MIN_GAP_FLOOR_MS, MIN_GAP_CEIL_MS, GAP_MS_PER_MB × bytes / 1 MB)
 *     a 1 KB meta file 500 ms (its debounce) · 2 MB 1 s · the 22 MB index 11.2 s · 60 MB and up 30 s
 *
 * so the busy index is written ~5 times a minute (~110 MB a minute), never back to back. A store's OWN debounce (the
 * coalescing of a burst) is the floor, and the last write's MEASURED time too (round 2).
 *
 * THE QUEUE'S TWO STATED BOUNDS (round 3, law 1 — round 2's «an act is the NEXT write» starved a paced store for as long as
 * acts kept coming: the index 0 writes in 60 s, a kill then lost minutes of paced state). One write in flight across all
 * stores; acts (urgent) and paced stores ALTERNATE when both are due (`nextOf`), so, counted in WRITES (the storage decides
 * how long one takes — at 1.2 s a write: an act 3.6 s with one durable store owed, 6.0 s with two; a paced store 3.6 s past
 * due with one other due):
 *   (a) an act on one of K durable stores owed is on disk within ACT_BOUND(K) = 2K + 1 writes (every act already pending on
 *       its store rides that one write);
 *   (b) a paced store's oldest unwritten change is never older than its due (its debounce / gap) + PACED_BOUND(P) = 2P + 1
 *       writes, P = the paced stores due — under ANY stream of acts.
 * The crash story is that: a SIGKILL loses at most a paced store's due + PACED_BOUND writes, never an answered act. The
 * writer's stats say the MEASURED ages (maxAgeMs), never this design.
 */

const MB = 1024 * 1024;
const MIN_GAP_FLOOR_MS = 500;      // a small store: its burst is coalesced, nothing more (the stores' own debounce)
const MIN_GAP_CEIL_MS = 30000;     // a very large store: at least twice a minute
const GAP_MS_PER_MB = 500;         // half a second per megabyte written — ≤ ~2 MB a second spent on one store on average
const RETRY_FLOOR_MS = 1000, RETRY_CEIL_MS = 60000;   // a failed write keeps the store dirty and retries (1 s … 60 s)

/** PURE: the minimum gap between two writes of a store of `bytes` (its last size; unknown ⇒ the floor). */
function minGapMs(bytes, { floorMs = MIN_GAP_FLOOR_MS, ceilMs = MIN_GAP_CEIL_MS, perMbMs = GAP_MS_PER_MB } = {}) {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  return Math.round(Math.min(ceilMs, Math.max(floorMs, (perMbMs * b) / MB)));
}
/** PURE: the age the oldest unwritten change of that store may reach — its gap plus one write in flight (`writeMs`, the
 *  last write's own time; the storage decides it, so it is said, never promised). */
const maxAgeMs = (bytes, writeMs = 0, o = {}) => minGapMs(bytes, o) + Math.max(0, writeMs || 0);
/** PURE: WHEN is a dirty store due — `{dirtySince, lastEndAt, bytes, debounceMs, failures, lastMs}` (ms on one monotonic
 *  clock). Never before its own debounce from the first unwritten change; never sooner than its gap after the last write
 *  ended — the gap stated for its size, and NEVER less than its last write TOOK (round 2, law C ii: a 0.5 s floor on a
 *  storage where a rename takes 1.2 s saturated the one-write queue for ever); after a failure, its backoff. */
function dueAt({ dirtySince, lastEndAt = null, bytes = 0, debounceMs = MIN_GAP_FLOOR_MS, failures = 0, failedAt = null, lastMs = 0 } = {}, o = {}) {
  let t = (Number.isFinite(dirtySince) ? dirtySince : 0) + Math.max(0, debounceMs || 0);
  if (Number.isFinite(lastEndAt)) t = Math.max(t, lastEndAt + Math.max(minGapMs(bytes, o), Number.isFinite(lastMs) ? lastMs : 0));
  if (failures > 0 && Number.isFinite(failedAt)) t = Math.max(t, failedAt + retryMs(failures));
  return t;
}
/** PURE: the backoff after `failures` failed writes in a row (1 s, 2 s, 4 s … 60 s). */
const retryMs = (failures) => Math.min(RETRY_CEIL_MS, RETRY_FLOOR_MS * 2 ** Math.min(6, Math.max(0, failures - 1)));
/** PURE: of the dirty stores, which ONE is written next (the writer keeps ONE write in flight across ALL stores — a slow
 *  storage takes one thread, never the fs threadpool). ROUND 3 (law 1): THE QUEUE HAS TWO STATED BOUNDS, AND BOTH HOLD
 *  UNDER ANY STREAM. Two classes: URGENT (a store an act waits on — durable(); oldest act first) and PACED (the most
 *  overdue first, then the oldest change). When both have a store due they ALTERNATE: after an urgent write an overdue
 *  paced store takes the next turn, after a paced write an urgent one. (Round 2's «an act is the NEXT write» starved a
 *  paced store for as long as acts kept coming: 0 writes of the index in 60 s.) Hence, counted in WRITES — the storage
 *  decides how long one takes:
 *    (a) ACT_BOUND(K) = 2K + 1: an act on one of K durable stores owed is on disk within the write in flight, at most one
 *        paced turn after it, the K − 1 urgent stores with an older act (each with a paced turn after it) and its own
 *        write — every act already pending on its store rides that same write;
 *    (b) PACED_BOUND(P) = 2P + 1: a paced store, once DUE (its debounce / gap — `dueAt`), is on disk within the write in
 *        flight, the P − 1 paced stores due before it (each with an urgent turn before it), one urgent turn and its own.
 *  A store in its failure backoff is not due (an outage is no write per act) — the bounds are for writes that land.
 *  `rows` = [{name, due, dirtySince, urgent}]; `last` = the class of the write just started ('urgent' | 'paced' | null);
 *  null when none is due at `now`. */
// ROUND 4 (true words 1): an urgent row's PLACE is its oldest change — or, for a store whose write FAILED, the time it
// failed when that is later: its retry queues behind the acts that came before its failure (round 3 put it back at its
// first change after every backoff, ahead of every newer act: 2.6× the bound, measured)
const placeOf = (r) => (Number.isFinite(r.failedAt) && r.failedAt > r.dirtySince ? r.failedAt : r.dirtySince);
function nextOf(rows, now, { last = null } = {}) {
  let u = null, p = null;
  for (const r of rows || []) {
    if (!(r.due <= now)) continue;
    if (r.urgent) { if (!u || placeOf(r) < placeOf(u)) u = r; }
    else if (!p || r.due < p.due || (r.due === p.due && r.dirtySince < p.dirtySince)) p = r;
  }
  if (u && p) return last === 'urgent' ? p : u;
  return u || p;
}
/** PURE (round 3, law 1; round 4 true words 1): the two bounds, in writes — (a) an act: within 2K + 1 writes from its
 *  arrival, K = every DURABLE store with ANY unwritten change then (its own and the one in flight included); when its own
 *  store's last write FAILED, from the end of that store's backoff (retryMs — a failing storage is not retried sooner), K
 *  taken then; a failed store's retry queues by the time it failed (placeOf). The seeded walk pins it, failing writes
 *  included. (b) a paced store once due, P paced stores due */
const actBoundWrites = (k) => 2 * Math.max(1, k | 0) + 1;
const pacedBoundWrites = (p) => 2 * Math.max(1, p | 0) + 1;
/** PURE: the bounds as a person waits them at `writeMs` a write (the report's table) */
const boundsTable = ({ writeMs = 1200, ks = [1, 2, 3, 4], ps = [1, 2, 4, 8] } = {}) => ({
  writeMs, acts: ks.map((k) => ({ durableStoresWithAChange: k, writes: actBoundWrites(k), ms: actBoundWrites(k) * writeMs })),
  paced: ps.map((q) => ({ pacedStoresDue: q, writes: pacedBoundWrites(q), msPastDue: pacedBoundWrites(q) * writeMs })) });
/** THE STOP GRACE — WHAT THE SERVICE MANAGER ALLOWS (round 6, E1: after a stop the ONLY bound is the manager's): systemd
 *  gives the main process TimeoutStopSec — 90 s by default, and the unit scripts/install-service.sh writes sets none —
 *  before its kill; a Kubernetes pod terminationGracePeriodSeconds — 30 s by default, and deploy/helm sets none; a deployer
 *  states its own with VIBESPACE_STOP_GRACE_S (seconds). Nothing of the product's own is shorter: the exit writes every
 *  store owed and the keeper only SAYS, shortly before the grace ends, what is still owed. The grace sets the keeper's
 *  moment (a stop) and its one end (a crash with no stop asked — the keeper is then the manager). A stated value that is
 *  not a grace (0, negative, not a number, Infinity) is not used, and one outside GRACE_MIN_MS … GRACE_MAX_MS is clamped —
 *  either is SAID once (`refused`). → {graceMs, source, refused} */
const GRACE_MIN_MS = 1000, GRACE_MAX_MS = 24 * 3600 * 1000;
function stopGraceOf(env = {}) {
  const [dflt, dsrc] = env.KUBERNETES_SERVICE_HOST ? [30000, 'a pod (terminationGracePeriodSeconds 30 s)'] : [90000, 'systemd (TimeoutStopSec 90 s)'];
  const raw = env.VIBESPACE_STOP_GRACE_S;
  if (raw === undefined || raw === null || String(raw).trim() === '') return { graceMs: dflt, source: dsrc, refused: null };
  const shown = String(raw).slice(0, 40), stated = Number(raw);
  if (!Number.isFinite(stated) || stated <= 0) return { graceMs: dflt, source: dsrc, refused: `VIBESPACE_STOP_GRACE_S=${shown} is not a grace (a number of seconds above 0) — ${dsrc} is used` };
  const ms = Math.round(stated * 1000), used = Math.min(GRACE_MAX_MS, Math.max(GRACE_MIN_MS, ms));
  return { graceMs: used, source: 'VIBESPACE_STOP_GRACE_S', refused: used !== ms ? `VIBESPACE_STOP_GRACE_S=${shown} is outside ${GRACE_MIN_MS / 1000} s … ${GRACE_MAX_MS / 3600000} h — ${used / 1000} s is used` : null };
}
/** a SYNCHRONOUS FLUSH OUTSIDE THE EXIT (a store's own close, a first version — round 2, law D: never unbounded) waits at
 *  most a third of the grace; the exit's own flush has no bound of ours (E1) */
const syncBoundMs = (graceMs) => Math.round(graceMs / 3);
/** PURE: the order of the exit flush (the stop's and the crash road's alike) — what cannot be re-derived first
 *  (rank 0: a person's act, a binding, a decision), then the rest (rank 1); within a rank the SMALLER store first (the
 *  manager's grace spent on a 20 MB re-derivable index must not leave three metas, the cursors and the rates), then the
 *  oldest change. `rows` = [{rank, bytes, dirtySince}] */
const exitOrder = (rows) => [...(rows || [])].sort((a, b) => (a.rank ?? 1) - (b.rank ?? 1) || (a.bytes || 0) - (b.bytes || 0) || a.dirtySince - b.dirtySince);
/** PURE: the exit flush's words — what reached the disk and what did not, by name («NOT written: session-meta.write —
 *  the write failed (1 attempt)»): nothing is left by a bound of ours (round 6, E1) — only a write that failed or bytes
 *  that could not be made. Said once, in the journal. `crash`: the crash road's words (never «the signal», never «the
 *  shutdown's»). */
function exitLine({ written = [], left = [], ms = 0, debtMs = null, rank0 = 0, crash = false } = {}) {
  // a store written more than once in the exit (its own callback changed it again) is named once, with its count
  const times = new Map(); for (const x of written) times.set(x, (times.get(x) || 0) + 1);
  const names = [...times].map(([x, n]) => (n > 1 ? `${x} ×${n}` : x));
  const head = `[store-write] exit${crash ? ' after the crash' : ''}: ${names.length} store${names.length === 1 ? '' : 's'} written in ${Math.round(ms)} ms${names.length ? ` (${names.join(', ')})` : ''}`;
  // round 3 (law 2): what cannot be re-derived went BEFORE the road's own unmoved stores (census debt), whose time is said
  const own = crash ? 'the crash road\'s own unmoved stores (census debt)' : 'the shutdown\'s unmoved stores (census debt)';
  const debt = Number.isFinite(debtMs) ? `; ${rank0 ? `the first ${rank0} before ` : ''}${own}, which took ${Math.round(debtMs)} ms` : '';
  if (!left.length) return head + debt;
  return `${head}${debt}; NOT written: ${left.map((x) => `${x.name} — ${x.why}`).join('; ')} — their last changes are lost; the files hold their previous whole version`;
}

// ── ROUND 6 (主开发's law, 11:58Z + 12:03Z): NO BOUND OF OURS CUTS AN EXIT THAT IS STILL WRITING ──────────────────────
// The service manager already ends a process at its grace — master is the oracle. A thread that is NOT the main thread
// (src/store-exit-keeper.js — started at the SERVER's boot by name, src/store-writer.js bootKeeper(); everything it reads
// already in memory) keeps ONE clock:
//   · A STOP ASKED (a signal): it SPEAKS once at the grace less KEEPER_SLACK (the smaller of 2 s and a tenth of the grace)
//     — what is still owed and where the main thread is — and ENDS NOTHING, crash or no crash: the manager's own kill is
//     already coming at the stop + the grace (a crash after the stop changes only the words);
//   · A CRASH WITH NO STOP ASKED: no manager will end it, so THE KEEPER IS THE MANAGER — it gives the exit exactly what
//     the manager gives a stop, ONE FULL GRACE from the crash, then says the line «after the crash» and ends it (SIGKILL).
//     Never sooner; no progress is measured. A stop asked after the crash moves nothing (the manager's kill may come first).
const keeperSlackMs = (graceMs) => Math.round(Math.min(2000, graceMs / 10));
const keeperStopAtMs = (graceMs) => Math.max(0, graceMs - keeperSlackMs(graceMs));
const keeperCrashMs = (graceMs) => Math.round(graceMs);
// x86_64 syscall numbers a held main thread can be in; which argument names its file
const SYSCALLS = { 0: 'read', 1: 'write', 2: 'open', 3: 'close', 4: 'stat', 5: 'fstat', 6: 'lstat', 7: 'poll', 17: 'pread64', 18: 'pwrite64', 35: 'nanosleep', 61: 'wait4',
  74: 'fsync', 75: 'fdatasync', 76: 'truncate', 77: 'ftruncate', 82: 'rename', 83: 'mkdir', 87: 'unlink', 202: 'futex', 230: 'clock_nanosleep', 232: 'epoll_wait',
  257: 'openat', 262: 'newfstatat', 263: 'unlinkat', 264: 'renameat', 281: 'epoll_pwait', 316: 'renameat2', 332: 'statx' };
const FD_ARG0 = new Set([0, 1, 3, 5, 17, 18, 74, 75, 77]), PATH_ARG0 = new Set([2, 4, 6, 76, 82, 83, 87]), PATH_ARG1 = new Set([257, 262, 263, 264, 316, 332]);
/** PURE: a /proc/<pid>/task/<tid>/syscall text → {running} | {nr, name, fd?, pathPtr? (a BigInt)} | null */
function syscallOf(text, arch = process.arch) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (t === 'running') return { running: true };
  const parts = t.split(/\s+/), nr = Number(parts[0]);
  if (!Number.isInteger(nr) || nr < 0) return null;
  const arg = (i) => { try { return parts[i + 1] ? BigInt(parts[i + 1]) : null; } catch { return null; } };
  const x64 = arch === 'x64';
  const out = { nr, name: x64 && SYSCALLS[nr] ? SYSCALLS[nr] : `syscall ${nr}` };
  if (x64 && FD_ARG0.has(nr) && arg(0) != null) out.fd = Number(arg(0));
  else if (x64 && PATH_ARG0.has(nr) && arg(0)) out.pathPtr = arg(0);
  else if (x64 && PATH_ARG1.has(nr) && arg(1)) out.pathPtr = arg(1);
  return out;
}
/** PURE: THE keeper's ONE line — a stop asked (it speaks; the manager's kill follows) or a crash with no stop asked (the
 *  grace from the crash is spent: it ends the process). `crashAfterMs`: a crash that came after the stop (the words only) */
function keeperLine({ kind = 'stop', sinceMs = 0, graceMs = 0, slackMs = 0, source = null, crashAfterMs = null, summary = null, call = null, file = null, kernel = null } = {}) {
  const s = (ms) => (ms / 1000).toFixed(1);
  const head = kind === 'crash'
    ? `[store-write] exit after the crash: ${s(sinceMs)} s after the crash — the grace a service manager gives a stop (${s(graceMs)} s${source ? `, ${source}` : ''}) is spent and no manager ends a crashed process`
    : `[store-write] exit: ${s(sinceMs)} s after the stop signal${Number.isFinite(crashAfterMs) ? ` (a crash came ${s(crashAfterMs)} s after it)` : ''}, ${s(slackMs)} s before the service manager's grace of ${s(graceMs)} s ends`;
  const tail = kind === 'crash' ? 'the writer\'s exit keeper ends the process now' : 'said before the manager\'s own kill — the keeper ends nothing';
  return `${head} — ${summary || 'the writer had said nothing of its stores'} — the main thread is still in ${call || 'a call the kernel did not show'}${file ? ` on ${file}` : ''}${kernel ? ` (the kernel: ${kernel})` : ''} — ${tail}`;
}
/** PURE: the writer's word on its stores for the keeper's line — what it wrote during the exit and what it still owes;
 *  the main thread's OWN stores (the shutdown's or the crash road's synchronous writes) are not counted here — said so,
 *  never a stale list */
function exitSummary({ written = [], owed = [], inflight = null } = {}) {
  return `the writer's stores: ${written.length ? `written ${written.join(', ')}` : 'none written yet'}; ${owed.length ? `still owed ${owed.join(', ')}` : 'none owed'}${inflight ? `; in flight ${inflight}` : ''}; the main thread's own stores: not counted here`;
}

module.exports = { keeperSlackMs, keeperStopAtMs, keeperCrashMs, stopGraceOf, syncBoundMs, GRACE_MIN_MS, GRACE_MAX_MS, keeperLine, exitSummary, placeOf, syscallOf, SYSCALLS, actBoundWrites, pacedBoundWrites, boundsTable, minGapMs, maxAgeMs, dueAt, retryMs, nextOf, exitLine, exitOrder, MB, MIN_GAP_FLOOR_MS, MIN_GAP_CEIL_MS, GAP_MS_PER_MB, RETRY_FLOOR_MS, RETRY_CEIL_MS };
