/**
 * Session store — JSONL parsing, caching, SessionMessages class,
 * session discovery helpers (path recovery, tmux, PID checks).
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { extractTailIds, nameFromUserRecord, titleFromText, titleLinesOf, TITLE_NEEDLE, TITLE_HEAD_BYTES, TITLE_TAIL_BYTES } = require('./discovery-facts');
// THE process reader (B-3185): identity, and since 2026-09-09 the two
// process-tree facts this sweep used to buy with one child process per item.
const { isCliProcess, hasProcfs, readPpid, readChildPids } = require('./cli-identity.js');
const { readJsonlTail } = require('./adapters/codex');
// A test suite's synthetic transcript is never a conversation (see the essay
// in src/fixture-guard.js — one declaration, shared with the usage walk).
const { isFixtureProjectDir, isFixtureSid } = require('./fixture-guard.js');
const HANDED = require('./handed-records.js');   // B-5a4d's root (unit 1): the records of frames handed to a CLI that died — drawn by the history read
const { costResume, costShown } = require('./cost-segments.js'); // PURE (2.369.402): THE ONE fold of the CLI's running totals — this restore and message-manager's live road
const SP = require('./storage-path.js'); // lane hub-fuse-sync-guard: SHARED — the witness's storage roots (none in a process nobody set)

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');

// ── Helpers ──

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function cwdToProjectDir(cwd) {
  return cwd.replace(/[/._]/g, '-');
}

// lane hub-fuse-sync-guard: the decode probes the disk one candidate at a time — on a STORAGE mount (src/storage-path.js)
// it never does (GET /api/sessions runs it on the main thread): a mount point itself is taken as there, anything below
// it is not probed and the rest of the name is kept as it reads.
const probeCandidate = (p) => { const r = SP.storageRootOf(p); return r ? p === r.root : fs.existsSync(p); };
function recoverCwdFromProjDir(projDir) {
  const parts = projDir.replace(/^-/, '').split('-');
  let current = '/';
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '') continue;
    let found = false;
    for (let j = parts.length; j > i; j--) {
      const segment = parts.slice(i, j).join('-');
      if (probeCandidate(path.join(current, segment))) {
        current = path.join(current, segment); i = j - 1; found = true; break;
      }
      if (probeCandidate(path.join(current, '.' + segment))) {
        current = path.join(current, '.' + segment); i = j - 1; found = true; break;
      }
      const underscored = parts.slice(i, j).join('_');
      if (underscored !== segment && probeCandidate(path.join(current, underscored))) {
        current = path.join(current, underscored); i = j - 1; found = true; break;
      }
    }
    if (!found) {
      current = path.join(current, parts.slice(i).join('-'));
      break;
    }
  }
  return current;
}

// The SYNC tmux twins (`getTmuxPaneMap` / `findTmuxTarget`) are GONE
// (2026-09-09). They had NO callers — the kb line "sync variants remain for
// boot paths" described boot-restore's OWN execFileSync calls, not these — and
// they carried the retired per-pid `ps -o ppid=` fork this change exists to
// remove. Dead code that spells a forbidden shape is how the shape comes back.

// The SYNC `isProcessClaude` is GONE (B-3185 r4). Its one caller was
// /api/kill-pid's local branch — a SIGTERM gate — and a kill decision belongs
// to THE identity (src/cli-identity.js), which that route now asks for both CLI
// names, like its own remote branch's shell twin. Only the async twin below
// survives, and only where it never kills anything.

// ── ASYNC discovery helpers (2.242.0) ──
// The /api/sessions sweep ran these as execFileSync — a live V8 profile on the
// busiest fleet pod caught a single sweep blocking the event loop 5.1s (22
// live sessions × sequential pgrep + tmux + per-lock ps; each sync fork is
// 100-300ms under load and pgrep's 2s timeout × N bounded the worst sweeps at
// tens of seconds — the 8-33s "whole instance freezes while I work" class).
//
// ASYNC WAS ONLY HALF OF IT (2026-09-09, userW's pod). `execFile` moves the
// WAIT off the loop; the FORK still happens on the calling thread and still
// copies the parent's page tables (measured: 1.8ms at 45MB RSS, 18.8ms at
// 543MB, 67-73ms at 1.5GB), and `Promise.all` over N of them lines N forks up
// inside ONE tick. On a pod with 61 locks and a 1.6GB server that is the
// 11-17s block seen after EVERY session create and EVERY kill, 27 times in 7
// days. So the sweep now spawns NOTHING per session: parents and children come
// from /proc through THE process reader (src/cli-identity.js) and the ONE
// remaining exec — `tmux list-panes` — is skipped entirely when no tmux binary
// is on PATH and cached for the discovery cache's own TTL when it is.
function execFileP(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    try { execFile(cmd, args, { encoding: 'utf-8', ...opts }, (err, stdout) => resolve(err ? null : String(stdout || ''))); }
    catch { resolve(null); }
  });
}

/** How long ONE tmux pane map stands. The /api/sessions cache is 4.5s and a
 *  create/kill forces an extra sweep, so this makes the burst share one map
 *  while a genuinely new pane still appears within a poll. */
const TMUX_MAP_TTL_MS = 4000;
/** A PATH lookup is a platform fact that can change (a user installs tmux). */
const TMUX_PATH_TTL_MS = 60000;
let _paneMapMemo = null;   // { at, map }
let _tmuxPathMemo = null;  // { at, path }

/** Where `tmux` is on PATH, or null — by STATTING the PATH entries, never by
 *  spawning `which`/`command -v`. userW's pod has no tmux at all, so every
 *  sweep paid for a doomed spawn AND then paid a `ps` per lock because the
 *  empty pane map still went to the per-lock lookup below. */
/** B-1425 (cure, batch 69 verdict MUST 1+2): a PATH dir under a STORAGE root is never read (the guard refuses it; a tmux
 *  there was never found); a dir under any OTHER root (an NFS home, the instance's own mount — a conda or linuxbrew tmux)
 *  is answered by the last ASYNC stat into it (`_tmuxMountFacts`, landed by landTmuxMounts, which getTmuxPaneMapAsync
 *  awaits first): never statted from the main thread, still found. One stat in flight per dir, each bounded by
 *  TMUX_MOUNT_STAT_MS (past it: no fact this round, asked again after the memo's TTL — a hung mount holds one pool
 *  thread per dir, never one per ask). Before the witness has set its roots (a boot's first moments) rootOf answers null
 *  and the walk stats as the release did. */
const TMUX_MOUNT_STAT_MS = 2000;
const _tmuxMountFacts = new Map();   // dir → { at, yes }
const _tmuxMountInFlight = new Set();
function tmuxMountDirs() {
  return String(process.env.PATH || '').split(path.delimiter).filter((d) => { if (!d) return false; const r = SP.rootOf(d); return !!r && r.kind !== 'storage'; });
}
async function landTmuxMounts() {
  const now = Date.now();
  const todo = tmuxMountDirs().filter((d) => { const f = _tmuxMountFacts.get(d); return !_tmuxMountInFlight.has(d) && !(f && now - f.at < TMUX_PATH_TTL_MS); });
  if (!todo.length) return;
  let moved = false;
  await Promise.all(todo.map((d) => {
    _tmuxMountInFlight.add(d);
    const stat = fs.promises.stat(path.join(d, 'tmux')).then((st) => st.isFile() && !!(st.mode & 0o111), () => false)
      .finally(() => _tmuxMountInFlight.delete(d));
    let timer = null;
    const late = new Promise((r) => { timer = setTimeout(() => r(undefined), TMUX_MOUNT_STAT_MS); if (timer.unref) timer.unref(); });
    return Promise.race([stat, late]).then((yes) => {
      clearTimeout(timer);
      if (yes === undefined) return;   // past the bound: no fact this round
      const was = _tmuxMountFacts.get(d);
      if (!was || was.yes !== yes) moved = true;
      _tmuxMountFacts.set(d, { at: Date.now(), yes });
    });
  }));
  if (moved) _tmuxPathMemo = null;   // the next ask walks again, in PATH order, with the landed facts
}
function tmuxOnPath() {
  const now = Date.now();
  if (_tmuxPathMemo && now - _tmuxPathMemo.at < TMUX_PATH_TTL_MS) return _tmuxPathMemo.path;
  let found = null;
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const r = SP.rootOf(dir);
    if (r && r.kind === 'storage') continue;   // B-1425: never read from the main thread (the guard refuses it)
    if (r) { const f = _tmuxMountFacts.get(dir); if (f && f.yes) { found = path.join(dir, 'tmux'); break; } continue; }   // B-1425: an NFS / home dir answers from its async stat
    try {
      const p = path.join(dir, 'tmux');
      const st = fs.statSync(p);
      if (st.isFile() && (st.mode & 0o111)) { found = p; break; }
    } catch { /* not here */ }
  }
  _tmuxPathMemo = { at: now, path: found };
  return found;
}

/** B-323e (lane bl-keys-misc, 主开发 r1351 (2) — the owner's hub HAS tmux on its PATH): `tmux list-panes` was a start of its own at
 *  every sessions sweep (~every 5 s per open page), forked from the sweep's WORKER (a fork copies the hub's whole page tables
 *  whichever thread asks). Now the MAIN thread asks it of the hub's starter (src/server/child-starter.js), memoised as before
 *  (TMUX_MAP_TTL_MS), and HANDS the map to the worker with the sweep's facts (setTmuxPanes); a worker never starts it. */
let _handedPanes = null;   // the worker's: the main thread's last map
function setTmuxPanes(entries) { _handedPanes = new Map(Array.isArray(entries) ? entries : []); }
// r1381 (2) + (5): THE HUB HANDS ITS READER IN (src/routes/sessions.js tmuxReaderVia — this file is a device bundle input: it carries
// none of the starter's words). The reader finds tmux by the kept lookup and asks the starter: no stat walk of PATH on the loop.
// Its answer: the pane list's text ('' = no tmux, no server), or undefined = NO REPLY — never kept as a reply (nothing memoised;
// the next sweep asks again). A process that hands nothing (a scratch tool) keeps the release's road.
const TMUX_PANE_ARGS = Object.freeze(['list-panes', '-a', '-F', '#{pane_pid}||#{session_name}:#{window_index}.#{pane_index}']);
// r2030 (3b): A NO-REPLY BACKS OFF — after the reader's no-reply the next ask waits TMUX_NO_REPLY_MS, doubled at each no-reply in a
// row up to TMUX_NO_REPLY_MAX_MS; meanwhile (and for the no-reply's own sweep) the pane map of the LAST GOOD read serves
const TMUX_NO_REPLY_MS = 5000;
const TMUX_NO_REPLY_MAX_MS = 5 * 60 * 1000;
let _tmuxReader = null, _paneNoReply = null;   // { at, waitMs }
function useTmuxReader(fn) { _tmuxReader = typeof fn === 'function' ? fn : null; _paneMapMemo = null; _paneNoReply = null; }   // a reader handed in starts from no memo (a new road)
/** r2030 (3a) + r2262 MUST 2: where tmux is when the host has no `which` program — the walk along PATH OFF THE LOOP: every folder
 *  (rooted or not, a storage root never) by an async stat bounded at TMUX_WALK_STAT_MS, one stat in flight per folder (a hung
 *  mount holds one pool thread, never one per ask), PATH ORDER KEPT (r2489 (3)): a folder's tmux counts only when every earlier
 *  folder said «none here»; an earlier folder past its bound makes the answer a no-reply (it may hold the tmux the panes run).
 *  → its path; null = every folder answered and none holds tmux; undefined = no answer (a folder past its bound, none found) —
 *  the reader says NO REPLY. No synchronous stat of a PATH folder on this road (the release walked in the sweep's worker). */
const TMUX_WALK_STAT_MS = 2000;
const _tmuxWalkInFlight = new Map();   // folder → its stat in flight
let _tmuxWalkMemo = null;   // { at, path } — a whole answer only, kept TMUX_PATH_TTL_MS
async function tmuxPathAsync({ statMs = TMUX_WALK_STAT_MS } = {}) {
  const now = Date.now();
  if (_tmuxWalkMemo && now - _tmuxWalkMemo.at < TMUX_PATH_TTL_MS) return _tmuxWalkMemo.path;
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter((d) => { if (!d) return false; const r = SP.rootOf(d); return !(r && r.kind === 'storage'); });
  const probes = dirs.map((d) => {
    let p = _tmuxWalkInFlight.get(d);
    if (!p) {
      p = fs.promises.stat(path.join(d, 'tmux')).then((st) => st.isFile() && !!(st.mode & 0o111), () => false).finally(() => { if (_tmuxWalkInFlight.get(d) === p) _tmuxWalkInFlight.delete(d); });
      _tmuxWalkInFlight.set(d, p);
    }
    let timer = null;
    const late = new Promise((r) => { timer = setTimeout(() => r(undefined), statMs); if (timer.unref) timer.unref(); });
    return Promise.race([p, late]).then((v) => { clearTimeout(timer); return v; });
  });
  for (let i = 0; i < dirs.length; i++) {   // every folder asked at once; their answers read in PATH order
    const a = await probes[i];
    if (a === undefined) return undefined;   // r2489 (3): an earlier folder past its bound — no answer, never a later folder's tmux
    if (a === true) { const found = path.join(dirs[i], 'tmux'); _tmuxWalkMemo = { at: Date.now(), path: found }; return found; }
  }
  _tmuxWalkMemo = { at: Date.now(), path: null };
  return null;
}
async function getTmuxPaneMapAsync() {
  const now = Date.now();
  if (!require('worker_threads').isMainThread) return _handedPanes || new Map();   // B-323e: a worker never starts it
  if (_paneMapMemo && now - _paneMapMemo.at < TMUX_MAP_TTL_MS) return _paneMapMemo.map;
  const map = new Map();
  let out;
  if (_tmuxReader) {
    if (_paneNoReply && now - _paneNoReply.at < _paneNoReply.waitMs) return _paneMapMemo ? _paneMapMemo.map : map;   // waiting after a no-reply: the last good map
    out = await Promise.resolve().then(() => _tmuxReader(TMUX_PANE_ARGS)).catch(() => undefined);
    if (out === undefined) {   // no reply: never kept as a reply — the last good map serves this sweep, the next ask waits
      const was = _paneNoReply ? _paneNoReply.waitMs : 0;
      _paneNoReply = { at: Date.now(), waitMs: Math.min(was ? was * 2 : TMUX_NO_REPLY_MS, TMUX_NO_REPLY_MAX_MS) };
      const old = _paneMapMemo ? `the map read at ${new Date(_paneMapMemo.at).toISOString()} serves` : 'no map read yet: none serves';
      // r2262: SAID — one line at the first no-reply in a row, one when the wait reaches its cap (then every 5 min, silent)
      if (!was) console.warn(`[sessions] tmux's pane list got no reply — ${old}; asked again in ${_paneNoReply.waitMs / 1000} s, the wait growing to ${TMUX_NO_REPLY_MAX_MS / 60000} min`);
      else if (_paneNoReply.waitMs === TMUX_NO_REPLY_MAX_MS && was < TMUX_NO_REPLY_MAX_MS) console.warn(`[sessions] tmux's pane list still gets no reply — ${old}; asked every ${TMUX_NO_REPLY_MAX_MS / 60000} min from now`);
      return _paneMapMemo ? _paneMapMemo.map : map;
    }
    _paneNoReply = null;
  } else {
    await landTmuxMounts();   // B-1425: a tmux on an NFS / home PATH dir is seen — off the main thread
    if (!tmuxOnPath()) { _paneMapMemo = { at: now, map }; return map; } // no binary ⇒ no spawn
    out = await execFileP('tmux', [...TMUX_PANE_ARGS], { timeout: 3000 });
  }
  for (const line of String(out || '').trim().split('\n')) {
    const [pid, target] = line.split('||');
    if (pid && target) map.set(parseInt(pid), target);
  }
  _paneMapMemo = { at: Date.now(), map };
  return map;
}

/** Which tmux pane owns this pid, or null. An EMPTY pane map means there are
 *  no panes to match — answer without touching the process table at all (this
 *  is the shape on every machine without tmux, i.e. every fleet pod), and
 *  otherwise read the parent from /proc rather than forking a `ps` per lock. */
async function findTmuxTargetAsync(pid, paneMap) {
  if (!paneMap || paneMap.size === 0) return null;
  if (paneMap.has(pid)) return paneMap.get(pid);
  const ppid = readPpid(pid);
  return ppid != null && paneMap.has(ppid) ? paneMap.get(ppid) : null;
}

// THE LAST `comm` IDENTITY, AND ITS REAL BLAST RADIUS (B-3185 r4 — r3 recorded
// this twin with the wrong one). Exactly ONE caller: `isLockClaude` below, as
// the fallback taken when a claude lock file carries no NUMERIC `procStart`
// (macOS locks write `procStartFt`) or /proc could not be read — which feeds
// the discovery sweep's "does this lock still have a live owner?" question and
// nothing else. It decides whether a CARD READS RUNNING. It is NOT on any kill
// path any more (the /api/kill-pid gate that used its sync twin now asks
// src/cli-identity.js) — a card it credits wrongly does hand that pid to the
// sidebar's Terminate, but the ROUTE re-asks THE identity and refuses, which is
// the whole point of gating the kill where the kill happens rather than
// trusting the label that led there. It must not become one either: `ps -o
// comm=` is 15 bytes
// of a name the process may set for itself (node renames its main thread to
// `MainThread` — measured — so an npm-installed `node …/claude-code/cli.js`
// answers NO here), matched as a SUBSTRING (so `claude-keeper` answers YES).
// Both errors are survivable for a label and neither is survivable for a
// SIGTERM. It is kept rather than ported because on the path that reaches it
// (macOS, every lock) `isCliProcess` is SYNCHRONOUS — a per-lock blocking fork
// is the 2.242.0 event-loop stall this whole async family exists to avoid — and
// on Linux `procStart` answers first with a pure file read. scripts/
// test-local-discovery-device.mjs compares the two rungs on a live fixture.
//   2026-09-09 NARROWED IT FURTHER: it is now reachable ONLY where there is no
// procfs at all. A Linux lock with no usable `procStart` (an older writer, or a
// pid that raced its own exit between `isPidAlive` and the stat — routine on a
// 61-lock pod) used to land HERE and buy a fork per lock; `isLockClaude` asks
// `isCliProcess` first on any procfs machine, which is pure file reads and is
// the DAEMON snapshot's own rule.
async function isProcessClaudeAsync(pid) {
  const out = await execFileP('ps', ['-p', String(pid), '-o', 'comm='], { timeout: 2000 });
  const cmd = String(out || '').trim();
  return cmd === 'claude' || cmd.includes('claude');
}

// /proc/<pid>/stat field 22 (starttime, clock ticks since boot). Verified
// byte-equal to the claude lock's `procStart` across 6/6 real locks (2.248.x).
// comm may contain spaces/parens — counted from the LAST ')'; ONE reader in
// src/cli-identity.js (the lock capture's writer witness asks the same one).
function procStartTicks(pid) { return require('./cli-identity').procStartTicks(pid); }

// B-2104: identity-verify a lock's pid WITHOUT a per-lock `ps` fork — the
// 2.242.0 event-loop stall was 22 locks × serial `ps`. claude's own lock
// carries `procStart` (= /proc/<pid>/stat field 22); matching it proves the
// alive pid is the SAME process the lock was written for (defeats PID reuse),
// which is exactly what the `ps comm=claude` check established. GOTCHA: only
// LINUX locks carry `procStart` — macOS writes the string `procStartFt`
// (`ps -o lstart=`), so an absent numeric procStart is NOT a mismatch; it
// falls back to the `ps` fork (never a silent always-true guard).
async function isLockClaude(lock) {
  const pid = lock?.pid;
  if (!pid) return false;
  const want = lock.procStart != null ? String(lock.procStart) : null;
  if (want) {
    const have = procStartTicks(pid);
    if (have != null) return have === want; // pure file read, no fork
    // /proc unreadable (non-Linux, or raced exit) → fall through
  }
  // NO USABLE procStart. Where there IS a procfs, ask THE identity
  // (src/cli-identity.js) — the same predicate the DEVICE snapshot's lock scan
  // uses (discovery-facts `pidLooksClaude`), and on Linux it is pure /proc
  // reads: zero forks per lock. This closes the one remaining per-lock fork on
  // a procfs machine (a lock written without a numeric procStart, or a pid
  // that exited between `isPidAlive` and the stat — routine on a 61-lock pod)
  // and makes the local sweep and the daemon sweep ONE rule.
  if (hasProcfs()) return isCliProcess(pid, 'claude');
  return isProcessClaudeAsync(pid);
}

// ── Lock → JSONL claiming (discovery) ──
// "Newest JSONL in the lock's project dir" misattributes files when SEVERAL
// sessions run in parallel in ONE cwd — mtime order among concurrent writers is
// arbitrary (real incident: 4 parallel external sessions read as 5 running;
// killing one flagged the WRONG session id stopped, and resuming that id
// collided with a still-running process). The lock file carries the CURRENT
// sessionId and every JSONL RECORD carries a sessionId field; after --resume
// the FILENAME keeps the original id but recent records carry the current one.
// So: claim by exact id first, tail-scan second, mtime-recency last.

// Last `bytes` of a JSONL as the sessionIds seen in it, in occurrence order
// (last element = the file's current writer). null = unreadable.
function readJsonlTailIds(fp, bytes = 65536) {
  let fd = null;
  try {
    fd = fs.openSync(fp, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(bytes, size);
    if (!len) return [];
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    let text = buf.toString('utf-8');
    if (len < size) { // line-align: drop the partial first line
      const nl = text.indexOf('\n');
      if (nl >= 0) text = text.slice(nl + 1);
    }
    // ONE tail-id rule (discovery-facts, 2.278.0): uniq-collapsed runs,
    // last 8 — the semantics the ssh script and daemon snapshot always had;
    // the full-list local variant gave claimJsonls a different mention window.
    return extractTailIds(text);
  } catch { return null; } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
  }
}

/**
 * Match alive locks to JSONL files within ONE project dir. Pure — testable
 * without live processes; shared by local (/api/sessions) and remote
 * (hosts.discoverSessions) discovery.
 *
 * @param locks  [{ sessionId: string|null, exactOnly: bool, ...caller fields }]
 *               exactOnly (webui-tracked ids) never fall through to tail/mtime.
 * @param jsonls [{ id: filename-id, mtime, ...caller fields }] any order
 * @param tailIdsFor (jsonl) => [sessionIds in tail, occurrence order] | null
 * @returns Map<jsonlId, lock> — each JSONL claimed by at most one lock.
 *
 * Passes:
 *  1. exact — the lock's current sessionId IS a JSONL filename (non-resumed).
 *  2. tail  — a resumed session writes records carrying its CURRENT id into the
 *             ORIGINAL-named file; prefer the file whose LAST tail id is the
 *             lock's (its current writer) over a mere mention.
 *  3. mtime — locks with no id evidence (brand-new session that hasn't flushed
 *             a record yet, unreadable tail, old lock without sessionId) take
 *             the newest unclaimed JSONL among files with NO tail evidence
 *             (empty file / unreadable / no tail data). Files whose tail names
 *             some OTHER (dead) session are NEVER fallback-claimed — they are a
 *             stopped session's transcript, and stealing one is the bug above
 *             (the unmatched lock is instead listed by its own sessionId).
 * Tail reads only happen when the dir is ambiguous — single-lock-single-jsonl
 * short-circuits without touching the file (the overwhelmingly common case).
 */
function claimJsonls(locks, jsonls, tailIdsFor) {
  const claims = new Map(); // jsonl id -> lock
  const sorted = [...jsonls].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  const byId = new Map(sorted.map(j => [j.id, j]));
  const claimedIds = new Set();
  const unmatched = [];

  // Pass 1 — exact filename match.
  for (const lock of locks) {
    const want = lock.sessionId;
    if (want && byId.has(want) && !claimedIds.has(want)) {
      claims.set(want, lock);
      claimedIds.add(want);
    } else if (!lock.exactOnly) {
      unmatched.push(lock);
    }
  }
  if (!unmatched.length) return claims;

  const unclaimed = () => sorted.filter(j => !claimedIds.has(j.id));

  // Short-circuit — unambiguous dir: one lock, one JSONL, no tail read.
  if (locks.length === 1 && jsonls.length === 1) {
    const j = unclaimed()[0];
    if (j) claims.set(j.id, unmatched[0]);
    return claims;
  }

  // Pass 2 — tail match (bounded: newest candidates only).
  const TAIL_CANDIDATES_MAX = 30;
  const tails = new Map(); // jsonl id -> [ids] | null
  for (const j of unclaimed().slice(0, TAIL_CANDIDATES_MAX)) {
    let ids = null;
    try { ids = tailIdsFor ? tailIdsFor(j) : null; } catch {}
    tails.set(j.id, Array.isArray(ids) ? ids : null);
  }
  const stillUnmatched = [];
  for (const lock of unmatched) {
    if (!lock.sessionId) { stillUnmatched.push(lock); continue; }
    let best = null, bestScore = 0;
    for (const j of unclaimed()) {
      const ids = tails.get(j.id);
      if (!ids || !ids.length) continue;
      const at = ids.lastIndexOf(lock.sessionId);
      if (at < 0) continue;
      const score = at === ids.length - 1 ? 2 : 1; // current writer beats mention
      if (score > bestScore) { best = j; bestScore = score; }
    }
    if (best) { claims.set(best.id, lock); claimedIds.add(best.id); }
    else stillUnmatched.push(lock);
  }

  // Pass 3 — mtime fallback over NO-EVIDENCE files only. A file whose tail
  // names some other (dead) session is a stopped session's transcript — never
  // hand it to an unrelated lock; the caller lists leftover locks by their own
  // sessionId instead.
  if (stillUnmatched.length) {
    const order = unclaimed().filter(j => !(tails.get(j.id) || []).length); // mtime-desc
    for (const lock of stillUnmatched) {
      const j = order.shift();
      if (!j) break;
      claims.set(j.id, lock);
      claimedIds.add(j.id);
    }
  }
  return claims;
}

// ── JSONL helpers ──

const { parseBackgroundLaunch, initFrameFacts, commandNames } = require('./message-manager.js');

function isSubagentMessage(msg) { return !!(msg.parent_tool_use_id || msg.isSidechain); }

function isDisplayMessage(msg) {
  return msg.type === 'user' || msg.type === 'assistant' || msg.type === 'result' || (msg.type === 'system' && msg.subtype === 'init');
}

/** THE PATH RULE (pure — no fs): where the CLI writes a conversation started in `cwd` on this machine. The person's CLI
 *  index carries it (src/server/local-index.js — the writer never LISTS a folder: lane human-cli r2); the locate below
 *  tries it first. null when the cwd is unknown. */
function transcriptPathOf(claudeSessionId, cwd) {
  if (!claudeSessionId || !cwd) return null;
  return path.join(os.homedir(), '.claude', 'projects', cwdToProjectDir(cwd), claudeSessionId + '.jsonl');
}

// B-299b (its folder probe, MEASURED on the test machine: with 1 000 project folders ONE call took 17 ms even when the cwd's own path held
// the transcript — the folder was listed, and every candidate de-duplicated against the list, before that path was asked; 30 calls in one
// loop turn 508 ms; 300 folders: 1.5 ms, 48 ms): the cwd's own path is asked FIRST — a hit lists no folder; only a miss (no cwd, a
// conversation that moved) walks the project folders and the remote cache, in the same order as before.
function findSessionJsonlPath(claudeSessionId, cwd) {
  const firstThere = (list) => { for (const fp of list) { try { if (fs.existsSync(fp)) return fp; } catch {} } return null; };
  const own = cwd ? transcriptPathOf(claudeSessionId, cwd) : null;
  if (own) { const hit = firstThere([own]); if (hit) return hit; }
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const candidates = [];
  try {
    for (const dir of fs.readdirSync(projectsDir)) candidates.push(path.join(projectsDir, dir, claudeSessionId + '.jsonl'));
  } catch {}
  // Remote-host transcripts fetched over ssh (hosts.fetchSessionJsonl) land in
  // data/remote-jsonl/<hostId>/<id>.jsonl — session ids are UUIDs, so scanning
  // the cache here makes every history consumer remote-capable for free.
  try {
    const cacheRoot = path.join(__dirname, '..', 'data', 'remote-jsonl');
    for (const hostDir of fs.readdirSync(cacheRoot)) {
      candidates.push(path.join(cacheRoot, hostDir, claudeSessionId + '.jsonl'));
    }
  } catch {}
  return firstThere(candidates);
}

/** lane roster-per-pass: what `findSessionJsonlPath(id)` (no cwd) would find, read ONCE for a liveness sweep — the TOP
 *  LEVEL of every project directory under ~/.claude/projects and of every remote-cache host directory
 *  (data/remote-jsonl/<host>/), never deeper (the subagents / workflows trees are not read), through fs.promises (the
 *  reads in libuv, the JS a few µs per directory), one directory at a time. A directory that fails (EACCES, EMFILE, one that
 *  vanished), or a walk past `boundMs`, leaves the index UNKNOWN (`ok: false`) — its caller then judges nobody gone on it.
 *  A missing ~/.claude/projects or data/remote-jsonl is not a failure: there is nothing there (as the per-id lookup finds).
 *  → { ok, topReadable, has(id) → boolean, dirs, entries } — `topReadable` = the projects directory itself was read (the
 *  liveness reader's `dirReadable`). */
async function claudeTranscriptIndex({ boundMs = 10000, fsp = fs.promises, projectsRoot = path.join(os.homedir(), '.claude', 'projects'), remoteRoot = path.join(__dirname, '..', 'data', 'remote-jsonl') } = {}) {
  const names = new Set();
  const st = { ok: true, topReadable: false, dirs: 0, entries: 0 };
  const listOf = async (dir, { top = false } = {}) => {
    try { st.dirs++; const ents = await fsp.readdir(dir, { withFileTypes: true }); st.entries += ents.length; return ents; }
    catch (e) {
      if (top && e && e.code === 'ENOENT') return [];        // nothing there: as the per-id lookup finds
      if (!top && e && e.code === 'ENOTDIR') return [];      // a file beside the project dirs: the per-id lookup finds nothing in it
      st.ok = false; return [];
    }
  };
  const addJsonl = async (dir, ents) => {
    for (const e of ents) {
      if (!e.name.endsWith('.jsonl')) continue;
      if (e.isSymbolicLink()) { try { await fsp.stat(path.join(dir, e.name)); } catch { continue; } } // existsSync follows a link: a dangling one finds nothing
      names.add(e.name);
    }
  };
  // a walk still out from an earlier sweep (it passed its bound: storage not answering) is not joined and not doubled —
  // this sweep is UNKNOWN on the tree, and no second read queues behind the stuck one (each holds a libuv thread)
  const key = projectsRoot + '\0' + remoteRoot;
  if (TRANSCRIPT_WALKS_OUT.has(key)) { stuckSaid(TRANSCRIPT_WALKS_OUT, key, 'claude', projectsRoot); return { ...st, ok: false, late: true, has: () => false }; }
  const walk = (async () => {
    let top = [];
    try { st.dirs++; top = await fsp.readdir(projectsRoot, { withFileTypes: true }); st.entries += top.length; st.topReadable = true; } // dirReadable: the projects directory itself was read
    catch (e) { st.topReadable = false; if (!(e && e.code === 'ENOENT')) st.ok = false; }
    for (const e of top) { const d = path.join(projectsRoot, e.name); await addJsonl(d, await listOf(d)); if (!st.ok) return; }
    for (const h of await listOf(remoteRoot, { top: true })) { const d = path.join(remoteRoot, h.name); await addJsonl(d, await listOf(d)); if (!st.ok) return; }
  })();
  TRANSCRIPT_WALKS_OUT.set(key, { since: Date.now(), said: false });
  walk.then(() => {}, () => { st.ok = false; }).finally(() => TRANSCRIPT_WALKS_OUT.delete(key));
  let timer = null;
  const bound = new Promise((r) => { timer = setTimeout(() => { st.ok = false; r(); }, boundMs); });
  try { await Promise.race([walk.catch(() => { st.ok = false; }), bound]); } finally { clearTimeout(timer); }
  const ok = st.ok;   // a late walk that finishes after the bound changes nothing handed out
  // a name the walk READ is a fact even when the walk failed later (round 2: equal to the per-id lookup for what was read);
  // `ok` says whether an absent name means absent
  return { ok, topReadable: st.topReadable, dirs: st.dirs, entries: st.entries, has: (id) => names.has(String(id) + '.jsonl') };
}
const TRANSCRIPT_WALKS_OUT = new Map();   // roots → {since, said}: a walk past its bound, still out
/** A walk that never returns leaves its tree UNKNOWN for as long as it stays out (the hub's life, if it never answers):
 *  said ONCE in the journal — which tree, since when — and never doubled (round 2; no retry: the next sweep asks again). */
function stuckSaid(map, key, tree, root) {
  const e = map.get(key);
  if (!e || e.said) return;
  e.said = true;
  console.warn(`[transcripts] the ${tree} transcript tree ${root} has not answered since ${new Date(e.since).toISOString()} — nobody is judged gone on it until it does`);
}

// ── WHY THERE IS NO CLAUDE MODEL READER HERE (B-6b6d round 2) ─────────────
// Round 1 shipped `lastClaudeTurnModel`: a tail scan for the last MAIN-THREAD
// assistant record's `message.model`, handed to the resume ladder as "the
// conversation's own model". It is removed, not repaired, because the field it
// read CANNOT ANSWER THE QUESTION THE LADDER ASKS.
//
// The ladder asks "what should this resume COMMAND". `message.model` answers
// "which model SERVED that turn", and it answers it in a form that cannot
// express the CONTEXT-WINDOW VARIANT the conversation was started with.
// Measured over the whole local corpus (2650 transcripts / 3.5 GB under
// ~/.claude/projects): ZERO `"model":"…"` values carry a `[…]` suffix, while
// the CLI's own `system/model_refusal_fallback` records prove conversations
// running `claude-fable-5[1m]` (5 sightings). So every id this reader could
// produce is a LOSSY rendering, and `--model claude-fable-5` on the resume of a
// `claude-fable-5[1m]` conversation silently turns 1M of context into 200k —
// on a path where master commanded nothing at all.
//
// It was also wrong about the model itself. A safety-classifier reroute is
// recorded as an ASSISTANT record whose `message.model` is ALREADY the fallback
// target and which carries a `{type:'fallback',from,to}` content block; the
// `system/model_refusal_fallback` record the round-1 guard looked for is
// written 2-10 lines AFTER it, so a ≤20-line BACKWARD look-back matched 1 of
// 139 reroutes in the owner's transcript, and 13,694 of 81,707 main-thread
// assistant records (16.8%) sit inside such a reroute run (median 87 records,
// max 1647) — i.e. ~1 in 6 interruption points resumed pinned to the fallback.
//
// A guard that can never produce a commandable answer must not be shipped as
// the capability (2.369.66). So the SOURCE goes: claude records NEITHER knob in
// a form a spawn can command (no effort anywhere, no variant on the model), a
// claude resume therefore commands NEITHER, and the CLI's own session record —
// which is variant-exact — decides. That is not a fallback to the instance
// default: the client stopped sending `claude.defaultModel` on a continuation
// in the same change, which is the bug B-6b6d was opened for.
// If a future CLI writes the commanded model (variant included) as a typed
// record, add the reader back as `store.lastTurnModel` in src/harnesses/claude.js
// — its PRESENCE is the whole declaration (src/resume-continuity.js).

// JSONL parse cache — stores ALL non-subagent messages (unfiltered).
// LRU-bounded: it retains the FULL parsed history of each session, so an
// uncapped map slowly pins every session ever viewed in memory.
//
// INCREMENTAL (perf lane chunk C, 2.369.167): an entry is the byte SPAN it
// was parsed from — `{mtimeMs, size, ino, dev, spanStart, spanEnd, messages,
// starts, partial, headProbe, tailProbe, incr}` (src/adapters/codex.js
// readJsonlTail owns the shape). A live conversation's transcript grows
// between any two attaches, and every re-attach reads chatStatus() and
// activePendingPermissions() through here SYNC — so the (mtime, size) key
// alone re-read and re-parsed the whole 32 MiB tail on the loop to learn about
// the few KB the CLI had appended. Now a grown, append-only file is read from
// `spanEnd` only, and the head slides out by byte span where readJsonlBounded's
// tail rule cuts it; a shrink, a replaced inode or a rewritten probe byte is
// today's full read. `messages` is always a NEW array (never grown in place):
// a SessionMessages whose `_all` is the old one keeps what it read.
// Metrics (global hook — this module stays decoupled from the telemetry
// instance in server.js): `srv-jsonl-parse-bytes` = bytes read and parsed and
// `srv-jsonl-parse-ms` = the time it took, stamped on EVERY non-hit read (the
// ms metric was only the >200 ms outliers before; the cold/append split is what
// the pair now shows).
const _jsonlCache = new Map();
// B-9428 (the owner's heap snapshot: this Map held 328 MB — 30 parsed tails of up to 32 MiB each, bounded
// only by COUNT): an entry IS the parsed tail its readers return, so the bound is its BYTES (spanEnd −
// spanStart) — r2 (verify #7): every tail touched in the last 10 min is the WORKING SET and stays; idle tails
// go oldest-first past a 128 MB floor; the old count is the second ceiling (cache-bounds.js evictIdle).
const { evictIdle, cacheRow, JSONL_CACHE_MAX_BYTES, JSONL_CACHE_IDLE_MS, JSONL_CACHE_MAX_ENTRIES: JSONL_CACHE_MAX, JSONL_LIVE_MAX_BYTES } = require('./cache-bounds.js');
const _jsonlBytes = (e) => (e && e.spanEnd != null && e.spanStart != null ? e.spanEnd - e.spanStart : (e && e.size) || 0);
let _jsonlResident = 0, _jsonlLive = 0, _jsonlLiveEvicted = 0;
const _jsonlUsed = new WeakMap(); // entry → last touched (ms)
// B-360d (A) (主开发 r1358): WHAT «TOUCHED» MEANS — a tail is LIVE (kept whatever the 128 MB idle floor says) while:
//   · it was READ through this cache in the last 10 min: an attach (a live session's or a history window's), a page-up or
//     page-down (/api/session-messages), a WS reconnect's re-attach, the search and turn-map reads; OR
//   · its conversation is HELD: a window is open on it (a client attached to the live session, or a history window opened
//     by a socket still open — a draw in the page never reaches the server, so the open window itself is what counts),
//     or a TURN IS RUNNING on it (session._isStreaming). The live set's own ceiling (512 MB) still bounds the held ones.
// The idle floor is enforced at every put AND at the memory census's tick (jsonlCacheTrim — server/memory-enforce.js),
// so an idle set is at its floor within a minute of going idle, never «at the next put».
// THE HELD PREDICATE IS ASKED AT EVERY PUT (r1374): a walk of the live sessions and the open history windows, no file call
// and no parse — keep it a walk (a put runs on every parse or read hit).
let _jsonlHeldFn = () => null;   // → a Set of held conversation ids (server/memory-enforce.js wires it), or null
const _jsonlViews = new Map();   // a socket → its history windows: window id → { key: the CACHE's key, n: the windows open under that id }
// (r1374: a window's hold ends with the window; r1470: two history windows of ONE conversation on one page share one id, so
// the holders are COUNTED and the hold ends with the last of them)
function setJsonlHeld(fn) { _jsonlHeldFn = typeof fn === 'function' ? fn : () => null; }
/** a history window `windowId` of socket `ws` is open on the conversation whose tail the cache keeps under `key` */
function noteJsonlView(ws, key, windowId = key) { if (!ws || !key) return; let m = _jsonlViews.get(ws); if (!m) { m = new Map(); _jsonlViews.set(ws, m); } const w = String(windowId), k = String(key), h = m.get(w); if (h && h.key === k) h.n++; else m.set(w, { key: k, n: 1 }); }
/** the window is gone (the page's `view-close`): its hold with it */
function dropJsonlView(ws, windowId) { const m = _jsonlViews.get(ws); if (!m) return; const w = String(windowId), h = m.get(w); if (h && --h.n > 0) return; m.delete(w); if (!m.size) _jsonlViews.delete(ws); }
/** the socket is gone: every window it held */
function dropJsonlViews(ws) { _jsonlViews.delete(ws); }
/** the conversation ids held now: the live sessions' (from the wiring) + every history window an open socket holds */
function _jsonlHeldNow() { let h = null; try { h = _jsonlHeldFn(); } catch { h = null; } const out = new Set(h || []); for (const m of _jsonlViews.values()) for (const v of m.values()) out.add(v.key); return out; }
// A grown file the ASYNC warm folds in inline (on the loop) instead of handing
// a full re-parse to the worker: the append is the only work, bounded here.
const WARM_INLINE_APPEND_MAX = 4 * 1024 * 1024;
// B-80cb cure (主开发 r1524): THE WARM'S READ IS NEVER THROWN AWAY. A tail the cache does not ADMIT (its live set past
// JSONL_LIVE_MAX_BYTES — a restart's storm of long conversations: forty 32 MB tails pass it at the seventeenth; measured at the release:
// those readers parsed their tails on the loop, its longest step 2.9 s on first attaches and 9.8 s on re-attaches) is handed to EVERY
// READER of its warm (r2195: parseSessionJsonl takes it as its previous entry — an unchanged file is a hit, a grown one is read as an
// append) until its time, a newer read, or the cache's admission; the warm's own fresh check sees it. THE BOUND (r2257): at most
// WARM_HANDOFF_MAX (4) handed tails — each a parsed tail of tens of megabytes — each for up to WARM_HANDOFF_MS (2 min) from its FIRST
// put (a re-put of the same entry keeps that time) plus one census minute (the memory census tick's sweep); counted in the live
// transcript-tails census row. A tail that goes before a reader came: that reader's parse reads the file, as every parse past the
// cache's bound always did.
const WARM_HANDOFF_MAX = 4, WARM_HANDOFF_MS = 120000;   // a handoff lives from a warm to its readers' parses: two warms at once ⇒ ≤ 2–3 held
const _warmHandoff = new Map();   // claude session id → { entry, at (its first put) }
// r2257 (3): the counts as they are — held: handoffs made (a new entry); served: reads served from one (every reader of its warm);
// pushedOut: gone past WARM_HANDOFF_MAX; expiredAtAsk / expiredAtSweep: gone past their time, found at an ask or by the census tick
const _handoffStats = { held: 0, served: 0, pushedOut: 0, expiredAtAsk: 0, expiredAtSweep: 0 };
let _liveMaxBytes = JSONL_LIVE_MAX_BYTES;   // the cache's live bound (a test seam sets it low: the not-admitted road at any size)
function _handoffGet(id) {
  const h = _warmHandoff.get(id);
  if (!h) return null;
  if (Date.now() - h.at > WARM_HANDOFF_MS) { _warmHandoff.delete(id); _handoffStats.expiredAtAsk++; return null; }
  return h.entry;
}
/** the warm's put: the cache, and — when the cache did not admit the entry — the handoff to the next parse */
function _warmPut(id, entry) {
  _jsonlCachePut(id, entry);
  if (_jsonlCache.get(id) === entry) { _warmHandoff.delete(id); return; }
  const prev = _warmHandoff.get(id), same = !!prev && prev.entry === entry;   // r2257 (3): a re-put of the SAME entry keeps its first time — warmed again and again, it is not held past its time
  _warmHandoff.delete(id); _warmHandoff.set(id, { entry, at: same ? prev.at : Date.now() }); if (!same) _handoffStats.held++;
  while (_warmHandoff.size > WARM_HANDOFF_MAX) { _warmHandoff.delete(_warmHandoff.keys().next().value); _handoffStats.pushedOut++; }
}
const warmHandoffStats = () => ({ ..._handoffStats, holding: _warmHandoff.size });
function _warmHandoffTestSeam({ liveMaxBytes } = {}) { if (liveMaxBytes !== undefined) _liveMaxBytes = liveMaxBytes == null ? JSONL_LIVE_MAX_BYTES : liveMaxBytes; return { liveMaxBytes: _liveMaxBytes }; }

function _jsonlCachePut(id, entry) {
  _jsonlCache.delete(id);
  _jsonlCache.set(id, entry);
  _jsonlUsed.set(entry, Date.now());
  const held = _jsonlHeldNow();
  const r = evictIdle(_jsonlCache, { floorBytes: JSONL_CACHE_MAX_BYTES, maxEntries: JSONL_CACHE_MAX, idleMs: JSONL_CACHE_IDLE_MS, liveMaxBytes: _liveMaxBytes, now: Date.now(), sizeOf: _jsonlBytes, usedAt: (e) => _jsonlUsed.get(e), held: (k) => held.has(k) });
  _jsonlResident = r.bytes; _jsonlLive = r.live; _jsonlLiveEvicted += r.liveEvicted;
}
/** B-360d (A): THE MEMORY CENSUS'S TICK — the idle trim with no newcomer (a cache drop: nothing read, nothing asked). The live
 *  set is untouched (its ceiling is the put's admission). → { evicted, freedBytes, ms, entries } — a walk of the map (≤ 30 idle
 *  entries + the live ones), no parse. */
function jsonlCacheTrim(now = Date.now()) {
  const t0 = performance.now(), before = _jsonlResident, held = _jsonlHeldNow();
  const r = evictIdle(_jsonlCache, { floorBytes: JSONL_CACHE_MAX_BYTES, maxEntries: JSONL_CACHE_MAX, idleMs: JSONL_CACHE_IDLE_MS, liveMaxBytes: Infinity, now, sizeOf: _jsonlBytes, usedAt: (e) => _jsonlUsed.get(e), held: (k) => held.has(k) });
  _jsonlResident = r.bytes; _jsonlLive = r.live;
  let handoffsExpired = 0;   // r2195 (b): a handed tail nobody came for (a window closed between its warm and its parse) goes at its time — never held until four newer ones push it out
  for (const [hid, h] of [..._warmHandoff]) if (now - h.at > WARM_HANDOFF_MS) { _warmHandoff.delete(hid); _handoffStats.expiredAtSweep++; handoffsExpired++; }
  return { evicted: r.evicted, freedBytes: Math.max(0, before - r.bytes), ms: performance.now() - t0, entries: _jsonlCache.size, handoffsExpired };
}
/** (a suite's) a parsed tail of `bytes` put as if last read at `usedAt` — the trim's and the rows' legs over this very map */
function jsonlHas(id) { return _jsonlCache.has(id); }
function jsonlCacheTestPut(id, bytes, usedAt = Date.now()) { const e = { spanStart: 0, spanEnd: bytes }; _jsonlCachePut(id, e); _jsonlUsed.set(e, usedAt); return e; }
/** The census row (tail bytes ≈ the parsed messages' share of the heap) + the position indexes their merges keep (the agy
 *  chain's cure: that memory was out of sight) — an index lives beside its tail's array, so the row counts it with them. */
function jsonlCacheCensus(now = Date.now()) {
  const ix = jsonlPosCensus(), ts = taskStateCensus();   // the root's kept task-state answers (B-360d part 2) ride the live row with the indexes
  // B-360d (A) (主开发 r1358): TWO ROWS, each judged against its own ceiling — the idle set's 128 MB floor and the live set's 512 MB
  // (the one row said «ceiling 128 · OVER» for a live set the code lawfully keeps, and nothing of how long an idle set stayed over)
  const held = _jsonlHeldNow(); let idleB = 0, idleN = 0, liveB = 0, liveN = 0;
  let hb = 0; for (const h of _warmHandoff.values()) hb += _jsonlBytes(h.entry);   // B-80cb cure: the warmed tails past the live set held for their reader's parse
  for (const [k, e] of _jsonlCache) { const b = _jsonlBytes(e); if (held.has(k) || now - (_jsonlUsed.get(e) || 0) < JSONL_CACHE_IDLE_MS) { liveB += b; liveN++; } else { idleB += b; idleN++; } }
  const idleRow = cacheRow('transcript tails (idle)', { bytes: idleB, count: idleN, unit: 'entries', ceiling: JSONL_CACHE_MAX_BYTES, enforced: { by: ['src/session-store.js#_jsonlCachePut', 'src/session-store.js#jsonlCacheTrim'], when: 'at every put, and at the memory census tick (a minute): idle tails go oldest-first past the floor' }, basis: `tails not read for ${JSONL_CACHE_IDLE_MS / 60e3} min and not held (no window open on them, no turn running)` });
  const liveRow = cacheRow('transcript tails (live)', { bytes: liveB, count: liveN, unit: 'entries', ceiling: JSONL_LIVE_MAX_BYTES, enforced: { by: ['src/session-store.js#_jsonlCachePut'], when: 'at every put: past the ceiling a newcomer is served and not kept, then the oldest-touched go' }, basis: `tails read in the last ${JSONL_CACHE_IDLE_MS / 60e3} min or held (a window open, a turn running)` });
  // the position indexes ride the live row (they live beside their tails' arrays); OVER stays judged on the tails alone
  liveRow.bytes = liveB + ix.bytes + ts.bytes + hb;   // the position indexes and the kept task-state answers live beside their tails' arrays: the live row counts them
  liveRow.basis += ` + their position indexes (${ix.keys} keys, ${ix.ords} ordinals ≈ ${Math.round(ix.bytes / 1048576)} MB) + the kept task-state answers (${ts.answers}, ${ts.rows} entries ≈ ${Math.round(ts.bytes / 1024)} KB at ${TASK_ROW_BYTES} B an entry; an answer whose tail was evicted while a reader still holds its records lives with that reader, uncounted)${_warmHandoff.size ? ` + ${_warmHandoff.size} warmed tail(s) past the live set held for their reader's parse (${Math.round(hb / 1048576)} MB)` : ''}`;
  return [idleRow, liveRow];
}
function _stampJsonlParse(bytes, ms) {
  global.__vsMetric?.('srv-jsonl-parse-bytes', bytes);
  global.__vsMetric?.('srv-jsonl-parse-ms', Math.round(ms * 10) / 10);
}
/** Test hook: forget every cached parse (the cold-read control). */
function jsonlCacheClear() { _jsonlCache.clear(); _warmHandoff.clear(); _jsonlResident = 0; }

// Async warm (2.235.0): populate _jsonlCache OFF the main thread via the
// transcript worker, so the sync parseSessionJsonl below (many sync callers)
// hits a warm cache instead of blocking the loop for the 0.5-1s a 32MB tail
// parse costs. Await this at the HOT entry points (ws attach history rebuild,
// /api/session-messages) before the sync machinery runs. Since chunk C: a
// cached entry the file merely GREW past (≤ WARM_INLINE_APPEND_MAX) is folded
// in inline — reading the appended bytes costs less than the worker round trip
// plus the structured-clone of a whole tail — and the worker's full read
// returns the same span entry, so the NEXT change is an append too.
// ROW B-422c (lane hub-loop-stalls, 主开发 r1006 — A for every road; unit 2 re-made it on the FILE): while the transcript pool
// refuses this session's FILE (src/adapters/codex.js `fileRefused`: a refusal of it with no pool answer for it since) — or refuses
// every call (`poolRefusing`: closed, no worker) — the history's sync parse reads NOTHING of it on the loop: it answers the kept
// copy, LOADED when one stat shows it IS the file (the main process read it: the sliced road, an append folded in), else tagged
// `notLoaded` (the attach keeps the history unloaded: the next one reads again), and asks the warm again off the loop (one every
// RETRY_WARM_MS a session). A file whose record is the STORAGE's (a deadline, a hung path, a blocked mount): the parse makes no
// stat and asks no warm, and a warm asks the pool alone for it — no find, no stat. The state is the FILE's, kept by the pool's
// doors (a refusal notes it, any answer for the file forgives it): no per-session note to race. A refusal of the file that is not
// the storage's and stood past the stated time ⇒ the warm reads it on the main process in slices (readJsonlTailSliced).
const RETRY_WARM_MS = 2000;
const NOT_LOADED = 'transcript_reader_restarting';
const _fpOf = new Map();       // claudeSessionId → its transcript's path, as the last find answered (the storage's guard needs no find)
const _reWarmAt = new Map();   // claudeSessionId → when the parse may ask the warm again
const FP_OF_MAX = 8192;
const knowFp = (id, fp) => { _fpOf.delete(id); _fpOf.set(id, fp); while (_fpOf.size > FP_OF_MAX) _fpOf.delete(_fpOf.keys().next().value); };
const notLoadedList = (info = {}) => Object.assign([], { notLoaded: NOT_LOADED, storageHung: !!info.storageHung, retryAt: info.retryAt || null, readerGone: !!info.readerGone, readerCause: info.readerCause || null });   // r1461 (1): readerGone — the pool is gone: the page promises no «moment»
// r1243 item 2 — A PAGE TOLD «NOT LOADED» IS NOTIFIED when its history becomes readable (the tree's law: a cache a page also keeps is
// NOTIFIED at its one entry point): a session answered «not loaded» is remembered; the warm or the parse that next LOADS it tells
// every listener once (ws-handler pushes `history-ready` to that conversation's clients — the page asks again, never a re-open)
const _awaitingRead = new Set();
const _readableListeners = new Set();
function onHistoryReadable(fn) { _readableListeners.add(fn); return () => _readableListeners.delete(fn); }
function noteAwaiting(id) { _awaitingRead.delete(id); _awaitingRead.add(id); while (_awaitingRead.size > FP_OF_MAX) _awaitingRead.delete(_awaitingRead.keys().next().value); }
function noteReadable(id) { if (!_awaitingRead.delete(id)) return; for (const fn of _readableListeners) { try { fn(id); } catch (e) { console.warn('[session-store] a history-readable listener threw:', e && e.message); } } }
const C = () => require('./adapters/codex');   // lazily (the adapter requires nothing of this module at load)
// the kept copy's tagged twin, ONE per cache entry (an entry's list never changes in place): the merge memo keys on the array
const _taggedKept = new WeakMap();
const taggedKeptOf = (list, info = {}) => { let c = _taggedKept.get(list); if (!c) { c = Object.assign(list.slice(), { notLoaded: NOT_LOADED, kept: true }); _taggedKept.set(list, c); } c.storageHung = !!info.storageHung; c.retryAt = info.retryAt || null; c.readerGone = !!info.readerGone; c.readerCause = info.readerCause || null; return c; };   // the twin is ours: its door and its next try are told fresh
// B-cd4b unit 2 (hold 3): THE WARM'S COLD READ IN PAGES. Its one-shot reply (`jsonlTail`: readJsonlTail's whole entry, a 100 MB
// conversation's ~70 MB of records) crossed to the main thread in ONE structured clone — measured at a hub restart with 80
// survivors, the page's re-attaches: the loop held ~1.0–1.3 s at its deserialize. Now the ONE pager carries it
// (src/adapters/codex.js readJsonlBoundedParsedPagedAsync `entry`: the worker runs the same function once and hands its messages
// back a page at a time, the loop free between pages); what the warm caches is the SAME entry. ONE warm's pages at a time, in the
// worker's own slot ('warm'): the worker keeps one snapshot a slot, so a second warm's first page would cut the first's; a person's
// history read ('') and a helper's ('helper') keep their own snapshots beside it
// ITS FOLLOW (主开发 r935): A PERSON'S OWN ACT FIRST. A warm asked for by a person's own act — an attach the person made, the history
// view of a conversation the person opened: every warm but a bulk resume's — is served before every warm of a bulk resume (the first
// attach of a conversation a paced «Resume all» created, `bulk: true`) that has not started; a warm in flight finishes. Within each
// class first come first served; a person's ask for a file whose bulk warm still waits moves that warm into the person's line. The
// line is let go in a finally: a warm that rejects (its worker dead, its read refused) never holds the warms behind it.
// B-80cb cure (主开发 r1524): TWO WARMS AT ONCE, each in its own lane (src/safe-fs.js LANES `warm` / `warm2`: one worker, one 'warm'
// slot each: 'warm' / 'warm2') — one at a time made a restart's storm of forty wait one by one where the release read two cold tails at once. The line's
// rules stand: a person's warm before every bulk one not started, the lift, one warm a file joined, the fresh check, let go in a finally.
// LAW TWO, AS IT IS (r2195 (d) / r2257): no lane is kept for people — a person's window waits behind AT MOST ONE tail read already in
// flight (the first of the two lanes to free), then goes before every bulk warm not yet started.
const WARM_LANES = ['warm', 'warm2'];
const _warmQ = { person: [], bulk: [], free: [...WARM_LANES] };
const _warmLine = { turns: 0, atOnce: 0, bulkTurns: 0 };   // bulkTurns: the turns a bulk warm took (r2195 (a): the door's bulk word, seen)
const warmLineStats = () => ({ ..._warmLine, free: _warmQ.free.length });
// its fresh read's MUSTs: ONE warm in flight a file — a second asker (an attach's task-state warm gives up at 10 s, then its transcript
// warm asks again) joins it, never a second whole read; a warm whose turn comes after the cache was filled for the same file (another
// road) reads nothing; the read's time is taken from its turn in the line, never the wait before it; a warm that leaves the paged
// road (the history worker's heap bound, the lane busy, a snapshot gone) is read in one piece on the general pool and SAID, once
const _warmInFlight = new Map();
let _warmLeftSaid = false;
const warmLeft = (why) => { if (_warmLeftSaid) return; _warmLeftSaid = true; console.warn(`[session-store] a claude warm left the paged road: ${why} (said once; the pager's stats count the rest)`); };
async function warmTurn(fp, fresh, lane) {
  const t0 = performance.now();
  if (fresh && fresh()) return { fresh: true };
  const { readJsonlBoundedParsedPagedAsync } = require('./adapters/codex');
  const look = performance.now();   // r2506: the worker's look at the file comes after this send
  const r = stampLook(await readJsonlBoundedParsedPagedAsync(fp, { entry: true, dropSubagent: true, slot: lane || 'warm', onFail: warmLeft, lane }), look);   // B-80cb cure: the lane's own slot ('warm' / 'warm2')
  return r ? { ...r, t0 } : r;
}
function pumpWarm() {
  while (_warmQ.free.length) {
    const job = _warmQ.person.shift() || _warmQ.bulk.shift();
    if (!job) return;
    const lane = _warmQ.free.shift();
    _warmLine.turns++; if (job.bulk) _warmLine.bulkTurns++; _warmLine.atOnce = Math.max(_warmLine.atOnce, WARM_LANES.length - _warmQ.free.length);
    Promise.resolve().then(() => warmTurn(job.fp, job.fresh, lane)).then(job.resolve, job.reject).finally(() => { _warmQ.free.push(lane); pumpWarm(); });
  }
}
function warmPaged(fp, { fresh = null, bulk = false } = {}) {
  let job = null;
  const p = new Promise((resolve, reject) => { job = { fp, fresh, resolve, reject, bulk: !!bulk }; (job.bulk ? _warmQ.bulk : _warmQ.person).push(job); });
  pumpWarm();
  return { p, job };
}
// r935 (a) — every put of a WHOLE read that waited (a warm's, the main process's slices, the storage's retry): NEVER OVER A NEWER ENTRY.
// ONE LAW (主开发 r2506): A READ IS JUDGED BY WHEN ITS LOOK AT THE FILE WAS TAKEN, never by the file's own time or size. The look's
// moment is `lookAt` — this thread's monotonic clock (performance.now), stamped where the read is ASKED: a worker's read when it is
// SENT (its look at the file comes after), a read on this thread at its stat. A read whose look is LATER than the cached copy's (or as
// late) is taken — an older restore, a cut in place, a clock stepped back: all taken; a read whose look was EARLIER never replaces it
// (an older read landing after a newer one was cached: the newest history stays, nothing folded); a SHORT read (the file shrank under
// it: readJsonlTail's mtimeMs -1) never replaces a copy. A copy with no look (put before this rule) is replaced
const cachedCopyWins = (c, entry) => !!(c && entry && c !== entry && (entry.mtimeMs === -1 || (c.lookAt != null && entry.lookAt != null && c.lookAt > entry.lookAt)));   // PURE — the law above
const stampLook = (r, at) => { if (r && r.entry && r.mode !== 'hit' && r.entry.lookAt == null) r.entry.lookAt = at; return r; };   // a hit is the copy itself: its own look stands
// → true: put; false: the cached copy won — the warm that read it says NOT «ready» (its caller returns false: the page is told nothing)
const putUnlessNewer = (id, entry) => { if (cachedCopyWins(_jsonlCache.get(id) || _handoffGet(id), entry)) return false; _warmPut(id, entry); return true; };   // B-80cb cure: every warm's put is the warm's — the cache, or (not admitted) the handoff to the next parse; «unless newer» asks the handoff too: the kept copy judged is the cache's, or the handed one (round wf_32f917e5-722: an older read never replaces a newer handed tail)
const promoteWarm = (job) => { if (!job || !job.bulk) return; const i = _warmQ.bulk.indexOf(job); if (i < 0) return; _warmQ.bulk.splice(i, 1); job.bulk = false; _warmQ.person.push(job); };
// ONE WARM A SESSION AT A TIME: a second ask while one is in flight joins it (the parse's 2 s re-warm, an attach, a page) — never a
// second history read of the same file sent to the pool (the whole-state read: unjoined re-warms queued reads whose deadlines ended
// workers)
// (B-cd4b unit 2's _warmInFlight joins ONE warm A FILE inside warmOnce; this joins one a SESSION around it.) A person's ask never
// waits behind a BULK one of the same session: it goes on into warmOnce, whose per-file join promotes that read (r935), no second read
const _warmOfSession = new Map();   // session key → { p, bulk }
function warmSessionJsonlAsync(claudeSessionId, cwd, opts = null) {
  const k = claudeSessionId + '\u0000' + (cwd || ''), bulk = !!(opts && opts.bulk === true);
  const was = _warmOfSession.get(k);
  if (was && (bulk || !was.bulk)) return was.p;
  // B-5a4d's root (unit 1): the conversation's handed records are read off the loop BESIDE its transcript (bounded, never its verdict)
  const p = Promise.all([warmOnce(claudeSessionId, cwd, opts), HANDED.warm([claudeSessionId], opts && opts.handedDir ? { dir: opts.handedDir } : {}).catch(() => null)]).then(([ok]) => ok).then((ok) => { if (ok) { _reWarmAt.delete(claudeSessionId); noteReadable(claudeSessionId); } return ok; })   // a warm that read: the parse may ask again at once after a later refusal; a page told «not loaded» is told it can read now
    .finally(() => { const cur = _warmOfSession.get(k); if (cur && cur.p === p) _warmOfSession.delete(k); });
  _warmOfSession.set(k, { p, bulk });
  return p;
}
/** the session's transcript path as memory knows it — the last find's, else its folder's (pure) — for the storage's guard */
const knownPathOf = (id, cwd) => _fpOf.get(id) || (cwd ? transcriptPathOf(id, cwd) : null);
async function warmOnce(claudeSessionId, cwd, opts = null) {
  const bulk = !!(opts && opts.bulk === true);   // r935: a bulk resume's first attach (ws-handler `_bulkRead`); every other ask is a person's
  const known = knownPathOf(claudeSessionId, cwd);
  if (known && C().fileStorageHung(known)) {
    if (!C().storageRetryDue(known, { claim: false })) return false;   // asked of the pool again at most once a gap (30 s doubling, ≤ 8 min) — never stuck; the gap is SPENT only by a retry that is sent (r2506)
    // the STORAGE hung under this transcript (a deadline, a hung path, a blocked mount — its record says so) — NO find and NO stat on
    // this loop: the pool alone is asked again (its path memory refuses at once while it remembers; then a worker tries, off the loop)
    // the POOL GONE (closed for good, none on this process) can never retry it: the due retry is the main process's own sliced read
    // (r1243 item 3 — the guard holds: one at a time, none while one is parked, its own deadline; a door-blocked mount never). A pool
    // that only REFUSED a moment ago (no worker, restarting) is asked again at the next gap — a file it called hung is never read
    // on the main process while a worker can still come back
    const t0 = performance.now();
    let r = null;
    if (C().poolGone()) { C().storageRetryClaim(known); const look = performance.now(); try { r = stampLook(await C().readJsonlTailSliced(known, { dropSubagent: true, storageRetry: true }), look); } catch { return false; } }
    // the POOL UP (主开发 r2246's MUST, r2344 (1)): a file whose record says «the storage» never holds a line the other conversations
    // wait in. Its retry first PROBES the file — one small read (its first bytes) under a short bound, on the general pool: a file that
    // does not answer costs that bound and nothing else (its deadline is remembered by the pool's path memory for calls that short: the
    // next retry's probe is refused at the door). A file that ANSWERS joins B-cd4b's paged warm line like any other (person first): read
    // in pages, never one whole clone; the line is held by no dead file. A dead file holds ONE general worker for the probe's bound —
    // alone in it (r2715) — and only one probe is out on the pool at a time, so two dead files never take both.
    // THE PROBE's BOUND ENDS ONLY THE PROBE (主开发 r2506): it is sent only to a general worker IDLE at the send (the pool's own
    // idleOnly) — a deadline queued behind a healthy call would end THAT call and mark ITS file the storage's. None idle ⇒ NOT sent:
    // nothing ended, nothing marked, the retry's gap NOT spent — asked again at the next ask. A file whose first bytes answer but which
    // hangs later still holds the warm line for the history bound (its page's 60 s): the probe is a look, not a promise
    else {
      let probe;
      try { probe = await C().probeTranscriptAsync(known); } catch { C().storageRetryClaim(known); return false; }   // sent, refused (its deadline: still hung) — the gap spent
      if (probe === 'busy') return false;   // NOT sent: no general worker idle
      C().storageRetryClaim(known);   // sent and answered: the gap spent; the file joins the warm line
      try { r = await warmPaged(known, { bulk }).p; } catch { return false; }
    }
    if (!r || !r.entry) return false;
    _stampJsonlParse(r.bytes, performance.now() - t0);
    if (!putUnlessNewer(claudeSessionId, r.entry)) return false;   // a later copy is cached: not «ready» (r2506)
    await warmTaskEvents(claudeSessionId, known, { ino: r.entry.ino, size: r.entry.size });   // the storage answers again: the task scan beside it
    return true;
  }
  let tasks = null;
  try {
    const fp = findSessionJsonlPath(claudeSessionId, cwd);
    if (!fp) return false;
    knowFp(claudeSessionId, fp);
    if (C().fileStorageHung(fp)) return false;   // found now, and the memory calls it the storage's: no stat (the next warm: the pool alone)
    const look = performance.now();   // r2506: this thread's look at the file (its stat)
    const stat = fs.statSync(fp);
    tasks = warmTaskEvents(claudeSessionId, fp, stat); // B-299b A2: the task-tool scan, in the transcript worker, beside the tail's warm
    const cached = _jsonlCache.get(claudeSessionId) || _handoffGet(claudeSessionId);   // B-80cb cure: or the read the cache did not admit
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size && cached.ino === stat.ino) { _warmPut(claudeSessionId, cached); return true; } // already warm (touched: the working set)
    const { readJsonlTail } = C();
    if (cached && cached.incr && stat.size > cached.size && stat.size - cached.spanEnd <= WARM_INLINE_APPEND_MAX) {
      const t0 = performance.now();
      const r = stampLook(readJsonlTail(fp, cached, { dropSubagent: true, stat, appendOnly: true }), look);
      if (r) {
        if (r.mode === 'append') carryPosFrom(r.entry, cached);   // B-299b A5 r4: the merge's index follows the append
        _stampJsonlParse(r.bytes, performance.now() - t0);
        _warmPut(claudeSessionId, r.entry);
        return true;
      }
    }
    let w = _warmInFlight.get(fp);   // one warm in flight a file: a second asker joins it (above)
    if (w) { if (!bulk) promoteWarm(w.job); }   // r935: a person's ask for a file a bulk warm waits for moves it into the person's line
    else {
      const fresh = () => { const c = _jsonlCache.get(claudeSessionId) || _handoffGet(claudeSessionId); return !!c && c.mtimeMs === stat.mtimeMs && c.size === stat.size && c.ino === stat.ino; };
      w = { job: null, p: null };
      w.p = (async () => {
        const q = warmPaged(fp, { fresh, bulk }); w.job = q.job;   // B-cd4b unit 2: the entry in pages (above)
        const r = await q.p;
        if (r && r.fresh) return true;   // filled meanwhile: this turn read nothing
        if (!r || !r.entry) return false; // worker unavailable — sync path will parse inline
        _stampJsonlParse(r.bytes, performance.now() - (r.t0 || performance.now()));
        // r935 (a): never over a NEWER entry of the same file (the sync road or the inline append put it while this warm waited in the
        // line) — one rule for every warm's put, its modification time with it (putUnlessNewer, above)
        return putUnlessNewer(claudeSessionId, r.entry);   // a later copy is cached: not «ready» (r2506)
      })().finally(() => { if (_warmInFlight.get(fp) === w) _warmInFlight.delete(fp); });
      _warmInFlight.set(fp, w);
    }
    // row B-422c: a pool refusal of the warm's read (the pager's one-shot fallback refuses by name) — noted on the file, nothing parsed on the loop
    let ok;
    try { ok = await w.p; }
    catch (e) {
      // the pool's refusal is noted on the FILE by its door; a refusal that is not the storage's and stood past the stated time ⇒
      // UNIT 2: the main process reads it in bounded slices (the same entry, every file call async, the guard)
      if (!(e && e.code === NOT_LOADED) || e.storageHung || !C().slicedRoadFor(fp).ok) return false;
      const t1 = performance.now();
      try {
        const r2 = stampLook(await C().readJsonlTailSliced(fp, { dropSubagent: true }), t1);
        if (r2 && r2.entry) { _stampJsonlParse(r2.bytes, performance.now() - t1); return putUnlessNewer(claudeSessionId, r2.entry); }
      } catch { }
      return false;
    }
    return ok;
  } catch { return false; } finally { if (tasks) await tasks; }
}

function parseSessionJsonl(claudeSessionId, cwd) {
  const known = knownPathOf(claudeSessionId, cwd);
  if (C().poolRefusing() || (known && (C().fileRefused(known) || C().fileStorageHung(known)))) {
    // row B-422c: the pool refuses this file (or every call) — nothing of it is read on this loop
    const hung = !!known && C().fileStorageHung(known);
    if (!hung) {
      const now = Date.now();
      if (now >= (_reWarmAt.get(claudeSessionId) || 0)) {
        _reWarmAt.delete(claudeSessionId); _reWarmAt.set(claudeSessionId, now + RETRY_WARM_MS);
        while (_reWarmAt.size > FP_OF_MAX) _reWarmAt.delete(_reWarmAt.keys().next().value);
        warmSessionJsonlAsync(claudeSessionId, cwd).catch(() => false);
      }
    }
    const kept = _jsonlCache.get(claudeSessionId);   // after the warm's synchronous part (an append it folded in)
    const info = { storageHung: hung, retryAt: C().nextReadAt(known), readerGone: C().poolGone(), readerCause: C().readerCauseFor(known) };   // r1243 items 1 + 2: the page says which door refused, and when it asks again (r3077: its cause)
    if (!kept || !Array.isArray(kept.messages)) { noteAwaiting(claudeSessionId); return notLoadedList(info); }
    if (!hung && known) {
      const look = performance.now();   // r2506: this thread's look (the stat)
      let st = null; try { st = fs.statSync(known); } catch { st = null; }
      if (st && st.mtimeMs === kept.mtimeMs && st.size === kept.size && st.ino === kept.ino) { _jsonlUsed.set(kept, Date.now()); noteReadable(claudeSessionId); return kept.messages; }   // the copy IS the file: loaded
      // the file merely GREW past the copy, within the warm's inline bound (≤ WARM_INLINE_APPEND_MAX): folded in here as the warm does
      // with the pool up — a bounded read of the appended bytes, never the whole file — so a growing conversation never flickers
      // «not loaded» between two warms
      if (st && kept.incr && st.ino === kept.ino && st.size > kept.size && st.size - kept.spanEnd <= WARM_INLINE_APPEND_MAX) {
        const t0 = performance.now();
        let r = null; try { r = stampLook(readJsonlTail(known, kept, { dropSubagent: true, stat: st, appendOnly: true }), look); } catch { r = null; }
        if (r && r.entry) {
          if (r.mode === 'append') carryPosFrom(r.entry, kept);
          _stampJsonlParse(r.bytes, performance.now() - t0);
          _jsonlCachePut(claudeSessionId, r.entry);
          noteReadable(claudeSessionId);
          return r.entry.messages;
        }
      }
    }
    noteAwaiting(claudeSessionId);
    return taggedKeptOf(kept.messages, info);   // BEHIND the file (or its storage hung): a copy of its list, tagged — never the cache's own array
  }
  const fp = findSessionJsonlPath(claudeSessionId, cwd);
  if (!fp) return [];
  try {
    const look = performance.now();   // r2506: this thread's look (the stat)
    const stat = fs.statSync(fp);
    const held = _jsonlCache.get(claudeSessionId) ? null : _handoffGet(claudeSessionId);   // B-80cb cure: the warm's read the cache did not admit
    const cached = held || _jsonlCache.get(claudeSessionId);
    if (held) _handoffStats.served++;   // r2195 (round wll8bb3rr's MUST): SERVED TO EVERY READER of its warm (a view and its live attach, two devices' re-attaches) — never deleted at a take: it goes at its time (the census tick's sweep), at a newer read, or when the cache admits it
    // Bounded read: a full readFileSync('utf-8') THROWS past Node's ~512MB
    // string limit (and blocks the event loop for hundreds of MB below it).
    // Tail-only: the client seek-loads the earlier history as a continuous
    // virtual scroll, so no seam marker is stitched in.
    const t0 = performance.now();
    const r = stampLook(readJsonlTail(fp, cached && cached.spanEnd != null ? cached : null, { dropSubagent: true, stat }), look);
    if (r.mode !== 'hit') _stampJsonlParse(r.bytes, performance.now() - t0);
    if (r.mode === 'append') carryPosFrom(r.entry, cached);   // B-299b A5 r4: the merge's index follows the append
    _jsonlCachePut(claudeSessionId, r.entry);   // refreshes the LRU position on a hit too
    if (held) { const h = _warmHandoff.get(claudeSessionId); if (_jsonlCache.get(claudeSessionId) === r.entry) _warmHandoff.delete(claudeSessionId); else if (h && h.entry !== r.entry) h.entry = r.entry; }   // admitted ⇒ the cache holds it; a newer read (an append) ⇒ the handoff carries it, its time unchanged
    return r.entry.messages;
  } catch { return []; }
}

/** B-437e files tier (r1247 / r1307): the parse `jsonl` is the WHOLE transcript — the cache entry it came from is that very
 *  array and its span starts at the file's first byte (a transcript past the tail bound is read from its tail: not whole) */
function spanFromStart(entry, jsonl) { return !!entry && Array.isArray(jsonl) && entry.messages === jsonl && entry.spanStart === 0; }

// Session metadata cache (cwd + first user message)
const _sessionMetaCache = new Map();
// B-891e: the memo's cap is at least the last walk's transcript count (+ room) — a fixed 8 192 under the owner's 12 543 evicted
// every entry before the next sweep reached it, so EVERY sweep re-parsed EVERY head; entries the last walk did not visit go
let _metaCap = 8192;
// B-80cb: the conversations' walk gives the loop back every this many transcript reads (a stat or a head read: ~0.1 ms each on
// stand-ins, ~1 ms a real transcript's head and title windows cold) or this many ms, whichever comes first — the time bound is the one
// that holds at real sizes; no step near the 250 ms law at the owner's order of sizes
const SWEEP_STEP_READS = 256, SWEEP_STEP_MS = 20;
let _lastWalkSteps = null;
/** B-80cb: the last walk's steps → { reads, yields, maxPerStep } (the law's leg counts them; null before a walk). */
const lastWalkSteps = () => (_lastWalkSteps ? { ..._lastWalkSteps } : null);
const META_SCAN_CHUNK = 65536;
const META_SCAN_MAX = 2 * 1024 * 1024;

// The CLI's own title (lane session-title-record): the head + tail windows — ONE rule with the ssh scanner's TT lines
// and the device snapshot (discovery-facts titleLinesOf → titleFromText). A file with no title record costs one
// raw-byte search per window (no utf-8 decode).
function readCliTitle(filePath, size) {
  if (!size) return null;
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const head = Buffer.alloc(Math.min(TITLE_HEAD_BYTES, size));
      fs.readSync(fd, head, 0, head.length, 0);
      const tail = Buffer.alloc(Math.min(TITLE_TAIL_BYTES, size));
      fs.readSync(fd, tail, 0, tail.length, size - tail.length);
      if (head.indexOf(TITLE_NEEDLE) < 0 && tail.indexOf(TITLE_NEEDLE) < 0) return null;
      return titleFromText(titleLinesOf(head.toString('utf-8') + '\n' + tail.toString('utf-8')).join('\n'));
    } finally { fs.closeSync(fd); }
  } catch { return null; }
}

function extractSessionMeta(filePath, st0 = null) {   // st0 (B-891e): the walk's own stat of this file — ONE stat, no parse, for an unchanged transcript
  let st = st0;
  if (!st) { try { st = fs.statSync(filePath); } catch {} }
  const cached = _sessionMetaCache.get(filePath);
  if (cached && st && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.meta;   // the memo: path + mtime + size
  // A HEAD WITH NO NAME YET IS RESUMED (lane peer-card-sender): a delivery never names a session (discovery-facts
  // nameFromUserRecord), so a worker whose every user record is a wake has no name in its head — and a live file's
  // mtime moves on every write. The scan continues where it stopped (the same file, grown) instead of re-reading
  // the head; past the cap the answer cannot change.
  const resume = cached && st && !cached.meta.name && cached.ino === st.ino && st.size >= cached.size ? cached : null;
  if (resume && resume.pos >= META_SCAN_MAX) {
    const meta = { ...resume.meta, cliTitle: readCliTitle(filePath, st.size) }; // a nameless worker is exactly who the CLI's title names
    _sessionMetaCache.set(filePath, { ...resume, mtimeMs: st.mtimeMs, size: st.size, meta });
    return meta;
  }

  let cwd = resume ? resume.meta.cwd : '', name = '';
  let pos = resume ? resume.pos : 0;
  try {
    // Stream in 64KB chunks with a leftover-line buffer until both cwd + name
    // are found (cap at 2MB). A fixed 32KB read truncated the meta whenever an
    // early line carried a large attachment (>32KB) — the line JSON.parse threw
    // and `cwd` stayed empty, so the session became silently un-resumable
    // (wrong/empty cwd → resume no-ops). (issue #18)
    // Lines are cut on the BYTES ('\n'), so `pos` (the end of the last whole line) is exact for the resume.
    const fd = fs.openSync(filePath, 'r');
    try {
      const chunk = Buffer.alloc(META_SCAN_CHUNK);
      let leftover = Buffer.alloc(0), readPos = pos;
      while (readPos < META_SCAN_MAX) {
        const bytesRead = fs.readSync(fd, chunk, 0, META_SCAN_CHUNK, readPos);
        if (bytesRead <= 0) break;
        readPos += bytesRead;
        const buf = leftover.length ? Buffer.concat([leftover, chunk.subarray(0, bytesRead)]) : chunk.subarray(0, bytesRead);
        let at = 0;
        for (let nl = buf.indexOf(10, at); nl >= 0; nl = buf.indexOf(10, at)) {
          const line = buf.toString('utf-8', at, nl);
          at = nl + 1;
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            if (!cwd && d.cwd) cwd = d.cwd;
            if (d.type === 'user' && !name) {
              // ONE naming rule for every machine (discovery-facts, 2.278.0):
              // first non-empty line of the first REAL user message — the
              // remote parser used to whitespace-collapse the WHOLE message,
              // so one session could carry two names depending on where it ran.
              const cand = nameFromUserRecord(d);
              if (cand) name = cand;
            }
          } catch {}
          if (cwd && name) break;
        }
        leftover = Buffer.from(buf.subarray(at));   // a copy: `chunk` is reused by the next read
        pos = readPos - leftover.length;
        if (cwd && name) break;
      }
    } finally { fs.closeSync(fd); }
  } catch {}

  const meta = { cwd, name, cliTitle: readCliTitle(filePath, st ? st.size : 0) };
  try {
    _sessionMetaCache.set(filePath, { mtimeMs: st ? st.mtimeMs : fs.statSync(filePath).mtimeMs, size: st ? st.size : 0, ino: st ? st.ino : 0, pos, meta });
    if (_sessionMetaCache.size > _metaCap) _sessionMetaCache.delete(_sessionMetaCache.keys().next().value);
  } catch {}
  return meta;
}

// getSubagentMetas — DELETED (B-299b A4, lane bl-loop-a — 1.4 s in one hold measured): at every chatStatus it listed
// ~/.claude/projects and probed every project folder for <id>/subagents, then read each helper's meta, on the main thread —
// for a field NOTHING reads (no client, CLI or doc reads chatStatus.subagentMetas since the unified chat view; the Agent View
// Log finds its helper by its own record). The field stays, empty, as on every other harness.

// ── Full-file task-tool event scan (2.180.1, real report: a long-completed
// task showed as in_progress in Steps forever) ──
// Two cooperating failure modes: (a) the tail-only display window can MISS a
// task's completing TaskUpdate entirely; (b) COMPACTION re-appends the
// retained records (with their ORIGINAL timestamps and uuids) after the whole
// history — so a task's create/in_progress get replayed while its completed
// update (summarized away) does not, and even a full FILE-ORDER apply ends on
// the stale replay. Fix: stream the WHOLE file once (substring pre-filter,
// byte-safe line splitting, incremental byte cursor so a live session only
// scans appended bytes) with uuid dedup (kills replay copies), and let the
// caller apply events in TIMESTAMP order.
//
// OFF THE HUB'S LOOP (B-299b A2, lane bl-loop-a — 12.4 s over 3 holds measured: the 16 MB slabs read, copied, decoded and
// split on the main thread at the first task-state answer of every conversation after a restart, and an open Properties
// window re-asking at every broadcast): the BYTES are read in the transcript worker (`taskLinesSince`, op 'taskLines' — a
// stateless reader: the task-tool lines past a byte offset, each parsed to its facts), the main thread keeps each
// conversation's cursor and events (`_taskEventCache`, bounded) and applies the facts (dedup by uuid, a TaskCreate's id from
// its result) exactly as the full scan did. The warm (warmSessionJsonlAsync — the descriptor's store.warmTranscript, awaited
// before every task-state answer) scans what was appended; taskState() reads only the kept events — no transcript byte.
const TASK_EVENT_CACHE_MAX = 256; // conversations whose task events are kept (least recently warmed out first)
const _taskEventCache = new Map(); // conversation id → {fp, ino, offset, size, seq, pending, events, uuids}
const _taskWarming = new Map();
// THE TASK-STATE ANSWER KEPT WHILE ITS INPUTS ARE THE SAME OBJECTS (B-360d part 2, 主开发 r1223 — every attach builds a FRESH
// reader and its task state walked the reader's whole window again, 78–230 ms a time, when nothing had changed): keyed by the
// reader's merged records (`_all` — the merge memo hands every fresh reader the SAME array until the transcript or its buffer
// moves), and kept only while the kept task events (the entry, its seq and length: they only grow) and the wrapper's start (the
// phantom rule reads it) are the ones it was built from. A WeakMap by the records array: it dies with them (the transcript
// tails' census row counts it). Every caller gets its own copy.
const _taskStateMemo = new WeakMap();   // the reader's merged records array → { keptRef (a WeakRef of the task-event entry), seq, n, wStart, answer }
const _taskScanCounts = { scans: 0, kept: 0, records: 0 };   // what taskState walked / answered from the kept answer (test-task-scan-loop ⑧ counts them)
const TASK_ROW_BYTES = 160;   // a kept answer's entry ≈ a small object of a few short strings (an estimate, stated)
function copyTaskState(st) {
  const tasks = {};
  for (const [k, v] of Object.entries(st.tasks)) tasks[k] = v && typeof v === 'object' ? { ...v } : v;
  return { tasks, todos: st.todos.map((t) => (t && typeof t === 'object' ? { ...t } : t)) };
}
/** The kept answers' memory: those of the cached tails' merged records (the merge memo of each entry's array). */
function taskStateCensus() {
  let answers = 0, rows = 0;
  for (const e of _jsonlCache.values()) {
    const m = e && e.messages && _mergeMemo.get(e.messages);
    const k = m && m.all && _taskStateMemo.get(m.all);
    if (!k) continue;
    answers++; rows += Object.keys(k.answer.tasks).length + k.answer.todos.length;
  }
  return { answers, rows, bytes: rows * TASK_ROW_BYTES };
}
const TASK_NEEDLES = ['"TaskCreate"', '"TaskUpdate"', '"TodoWrite"', 'Task #'];
/** THE WORKER'S READ (B-299b A2): the complete lines of `fp` from byte `offset` that may carry a task-tool event (the full
 *  scan's own pre-filter), each parsed to its facts → {size, ino, next, reset, items: [{uuid, ts, type, blocks}]} | null (no
 *  file). `next` = the byte after the last complete line (a line still being written is read next time); `reset` = the file
 *  is shorter than `offset` (rewritten: read from 0). byte-safe: never toString across a slab edge. */
function taskLinesSince(fp, offset = 0) {
  let st;
  try { st = fs.statSync(fp); } catch { return null; }
  const reset = offset > st.size, from = reset ? 0 : Math.max(0, Number(offset) || 0), items = [];
  let next = from;
  if (from < st.size) {
    let fd;
    try { fd = fs.openSync(fp, 'r'); } catch { return null; }
    try {
      const CH = 16 * 1024 * 1024, buf = Buffer.allocUnsafe(CH);
      let pos = from, carry = Buffer.alloc(0);
      while (pos < st.size) {
        const n = fs.readSync(fd, buf, 0, Math.min(CH, st.size - pos), pos);
        if (n <= 0) break;
        pos += n;
        const data = carry.length ? Buffer.concat([carry, buf.subarray(0, n)]) : buf.subarray(0, n);
        const cut = data.lastIndexOf(0x0a);
        if (cut === -1) { carry = Buffer.from(data); continue; }
        next = pos - (data.length - cut - 1);
        carry = Buffer.from(data.subarray(cut + 1));
        for (const line of data.toString('utf-8', 0, cut).split('\n')) {
          if (!TASK_NEEDLES.some((x) => line.includes(x))) continue;
          let rec; try { rec = JSON.parse(line); } catch { continue; }
          const content = rec && rec.message && rec.message.content, blocks = [];
          if (Array.isArray(content)) for (const b of content) {
            if (!b || typeof b !== 'object') continue;
            if (rec.type === 'assistant' && b.type === 'tool_use') {
              if (b.name === 'TodoWrite' && b.input && b.input.todos) blocks.push({ k: 'todos', todos: b.input.todos });
              else if (b.name === 'TaskCreate') blocks.push({ k: 'call', id: b.id, input: b.input || {} });
              else if (b.name === 'TaskUpdate' && b.input && b.input.taskId) blocks.push({ k: 'update', input: b.input });
            } else if (rec.type === 'user' && b.type === 'tool_result') {
              const txt = typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map((x) => (x && x.text) || '').join(' ') : '');
              const m = /Task #(\d+) created/.exec(txt);
              blocks.push({ k: 'result', id: b.tool_use_id, n: m ? m[1] : null });
            }
          }
          items.push({ uuid: (rec && rec.uuid) || null, ts: Date.parse((rec && rec.timestamp) || '') || 0, type: rec && rec.type, array: Array.isArray(content), blocks });
        }
      }
    } finally { try { fs.closeSync(fd); } catch { } }
  }
  return { size: st.size, ino: st.ino, next, reset, items };
}
/** The worker's facts applied to a conversation's kept state — the full scan's own rules (a uuid seen ⇒ a compaction replay
 *  copy, skipped; a TaskCreate's id from ITS result). */
function applyTaskItems(c, items) {
  for (const it of items || []) {
    if (it.uuid) { if (c.uuids.has(it.uuid)) continue; c.uuids.add(it.uuid); }
    if (!it.array) continue;
    for (const b of it.blocks) {
      if (b.k === 'todos') c.events.push({ kind: 'todos', todos: b.todos, ts: it.ts, seq: c.seq++ });
      else if (b.k === 'call') c.pending.set(b.id, b.input || {});
      else if (b.k === 'update') c.events.push({ kind: 'update', input: b.input, ts: it.ts, seq: c.seq++ });
      else if (b.k === 'result' && c.pending.has(b.id)) {
        const inp = c.pending.get(b.id);
        c.pending.delete(b.id);
        if (b.n) c.events.push({ kind: 'create', id: b.n, subject: inp.subject || '', activeForm: inp.activeForm, ts: it.ts, seq: c.seq++ });
      }
    }
  }
}
function taskCachePut(id, c) {
  _taskEventCache.delete(id); _taskEventCache.set(id, c);
  while (_taskEventCache.size > TASK_EVENT_CACHE_MAX) _taskEventCache.delete(_taskEventCache.keys().next().value);
}
/** THE WARM'S TASK SCAN (B-299b A2): the bytes `fp` gained since the kept cursor, read in the transcript worker (its inline
 *  road answers null on the main thread — nothing then, the kept events stand). `st` = the warm's own stat. Never throws. */
function warmTaskEvents(id, fp, st) {
  if (!id || !fp) return Promise.resolve(false);
  const was = _taskEventCache.get(id);
  if (was && was.fp === fp && st && was.ino === st.ino && was.size === st.size) { taskCachePut(id, was); return Promise.resolve(true); }
  if (_taskWarming.has(id)) return _taskWarming.get(id);
  const p = (async () => {
    const c0 = _taskEventCache.get(id), ask = (offset) => require('./adapters/codex').transcriptWorkerCall('taskLines', { fp, offset }, () => null);
    let same = !!(c0 && c0.fp === fp && (!st || c0.ino === st.ino));
    let r = await ask(same ? c0.offset : 0);
    if (r && same && !r.reset && r.ino !== c0.ino) { same = false; r = await ask(0); } // replaced between the stat and the read: from 0
    if (!r || !Array.isArray(r.items)) return false;
    const c = same && !r.reset ? c0 : { fp, ino: r.ino, offset: 0, size: 0, seq: 0, pending: new Map(), events: [], uuids: new Set() }; // a reset was read from 0
    applyTaskItems(c, r.items);
    c.offset = r.next; c.size = r.size; c.ino = r.ino;
    taskCachePut(id, c);
    return true;
  })().catch(() => false).finally(() => _taskWarming.delete(id));
  _taskWarming.set(id, p);
  return p;
}

function getHistorySessionId(session) {
  return session?.backendSessionId || session?.claudeSessionId || null;
}
/** r1461 (2): every live conversation whose history WAITS on the transcript `id` names — matched by the id its marks are kept under
 *  (the parse's: getHistorySessionId, a fork's or a resumed parent's backend id first), its history not loaded, with a page to
 *  tell. PURE over the sessions map → [[sessionId, session]] (ws-handler pushes `history-ready` to each one's clients: every device) */
function historyWaitersOf(sessions, id) {
  const out = [];
  if (!id || !sessions) return out;
  for (const [sid, s] of sessions) if (s && getHistorySessionId(s) === id && !s._historyLoaded && s.clients instanceof Map && s.clients.size) out.push([sid, s]);
  return out;
}

// ── SessionMessages class ──

// jsonl array (the parse cache's, by identity) → {buffer, all, perms}: the
// last buffer merge over it. Weak: a cache entry that is evicted or replaced
// takes its memo with it.
const _mergeMemo = new WeakMap();
// B-299b A5 (lane bl-loop-a — 1.6 s in one hold measured: the merge built two Sets and a Map over EVERY transcript record and
// JSON.parsed EVERY buffer line, again for each reader after any write — a live conversation's buffer moves with every record):
// the position map is built ONCE per transcript array (it changes when the file does, never with the buffer); the buffer's
// records are parsed once per session — a buffer that only GREW parses the lines it gained; the two Sets nothing read are gone.
// r2 (its read): the kept parse lives in a WeakMap by session (no blackboard field); its identity is two probes (no copy of the
// ring); a webui record asks the transcript's greatest user stamp, not a scan. NOT CURED: a head trim parses the whole ring.
// r3 (its re-read): the position index follows a transcript append (a NEW array) at the cost of what changed, never rebuilt;
// r4: the array it follows is carried by the parse cache's entry (never a map of whole arrays of its own).
const _jsonlPosMemo = new WeakMap();   // the jsonl array → its position index (makePos)
// the buffer's kept parse, keyed by the SESSION OBJECT (r2: never a field on the live session — the blackboard keeps none; it
// dies with the session, and each module copy keeps its own): { head, tail, len, recs, kept }
const _bufRecsOf = new WeakMap();
const _mergeCounts = { posBuilt: 0, posExtended: 0, posIndexed: 0, linesParsed: 0, userScans: 0, userRescans: 0 };   // what the merge built / moved / indexed / parsed / scanned (test-task-scan-loop ⑦ counts them)
/** THE POSITION INDEX of a transcript array, by ABSOLUTE ordinals (r3): 'u:<uuid>' and 'm:<message.id>' → every record's
 *  ordinal, ascending; `base` = the ordinal of the array's first record. idx(key, last) answers an index INTO the array — the
 *  LAST record of a uuid (the release's map: a later one overwrote) or the FIRST of a message.id (the release kept the first). */
function makePos() {
  return { at: new Map(), n: 0, base: 0, userTs: null, userTsAll: true, userTsStale: false,   // n = the ordinals it holds (the census counts them)
    idx(k, last) {
      const v = this.at.get(k); if (!v || !v.length) return undefined;
      const o = last ? v[v.length - 1] : v[0];
      return o >= this.base ? o - this.base : undefined;
    } };
}
function posIndex(pos, m, o) {
  _mergeCounts.posIndexed++;
  if (!m) return;
  if (m.uuid) { const k = 'u:' + m.uuid, v = pos.at.get(k); if (v) v.push(o); else pos.at.set(k, [o]); pos.n++; }
  const mid = m.message?.id;
  if (mid) { const k = 'm:' + mid, v = pos.at.get(k); if (v) v.push(o); else pos.at.set(k, [o]); pos.n++; }
  if (m.type === 'user') {   // the greatest user stamp (r2, S4): the webui-record check below asks it, not a scan per record
    const t = m.timestamp;
    if (typeof t === 'string') { if (pos.userTs === null || t > pos.userTs) pos.userTs = t; } else if (t != null) pos.userTsAll = false;
  }
}
function posUnindex(pos, m, o) {
  if (!m) return;
  for (const k of [m.uuid ? 'u:' + m.uuid : null, m.message?.id ? 'm:' + m.message.id : null]) {
    if (!k) continue;
    const v = pos.at.get(k); if (!v) continue;
    const i = v[0] === o ? 0 : v.lastIndexOf(o);   // a slid head is the front, a replaced last line the end
    if (i >= 0) { v.splice(i, 1); pos.n--; }
    if (!v.length) pos.at.delete(k);
  }
  if (m.type === 'user' && typeof m.timestamp === 'string' && pos.userTs !== null && m.timestamp >= pos.userTs) pos.userTsStale = true;   // the greatest left: asked again
}
/** r3: an append makes a NEW array (src/adapters/codex.js readJsonlTail: the old one's records — a head that slid out of the
 *  tail window dropped, a partial last line replaced — then the new records). The index MOVES with it at the cost of what
 *  changed: the dropped and the replaced records leave, the new ones enter. Anything else (a full read: new objects) ⇒ null. */
function extendPos(last, B) {
  const A = last.arr, pos = last.pos;
  if (!A.length || !B.length) return null;
  const d = A[0] === B[0] ? 0 : A.indexOf(B[0], 1);
  if (d < 0) return null;
  const L = A.length - d;
  let c = Math.min(L, B.length);
  if (A[d + c - 1] !== B[c - 1]) c--;   // the old array's partial last line, read again
  if (c < 1 || c < L - 1 || A[d + c - 1] !== B[c - 1]) return null;
  const base0 = pos.base;
  for (let i = 0; i < d; i++) posUnindex(pos, A[i], base0 + i);
  for (let i = d + c; i < A.length; i++) posUnindex(pos, A[i], base0 + i);
  pos.base = base0 + d;
  for (let i = c; i < B.length; i++) posIndex(pos, B[i], pos.base + i);
  _jsonlPosMemo.delete(A);
  return pos;
}
/** THE INDEX'S MEMORY (the agy chain's cure — the census did not count it): the indexes of the cached tails' arrays and of the
 *  arrays their entries carry (`_posFrom`), O(entries). A key ≈ its string + a Map slot + a small array (an estimate, stated). */
const POS_KEY_BYTES = 128, POS_ORD_BYTES = 8;
function jsonlPosCensus() {
  let keys = 0, ords = 0;
  const seen = new Set();
  for (const e of _jsonlCache.values()) {
    for (const a of [e && e.messages, e && e._posFrom]) {
      const p = a && _jsonlPosMemo.get(a);
      if (!p || seen.has(p)) continue;
      seen.add(p); keys += p.at.size; ords += p.n || 0;
    }
  }
  return { keys, ords, bytes: keys * POS_KEY_BYTES + ords * POS_ORD_BYTES };
}
/** r4 (its delta read): the array an appended one was built from is CARRIED BY ITS PARSE-CACHE ENTRY (`_posFrom`: the newest
 *  array the merge indexed — its predecessor, or the one that predecessor carried) until a read indexes it — never held by a map
 *  of its own (a tail the byte-bounded cache evicted lived on in r3's); it goes with the entry when the cache evicts it */
function carryPosFrom(entry, prev) {
  if (!entry || !prev || entry === prev || !Array.isArray(prev.messages)) return;
  entry._posFrom = _jsonlPosMemo.has(prev.messages) ? prev.messages : (prev._posFrom || null);
}
function jsonlPosOf(jsonl, key = null, from = undefined) {
  let pos = _jsonlPosMemo.get(jsonl);
  if (pos) return pos;
  const entry = from === undefined && key != null ? _jsonlCache.get(key) : null;
  const own = !!entry && entry.messages === jsonl;
  const prev = from !== undefined ? from : (own ? entry._posFrom || null : null);   // `from`: a leg's own predecessor
  const prevPos = prev ? _jsonlPosMemo.get(prev) : null;
  pos = prevPos ? extendPos({ arr: prev, pos: prevPos }, jsonl) : null;
  if (own) entry._posFrom = null;
  if (pos) _mergeCounts.posExtended++;
  else { pos = makePos(); _mergeCounts.posBuilt++; jsonl.forEach((m, i) => posIndex(pos, m, i)); }
  _jsonlPosMemo.set(jsonl, pos);
  return pos;
}
/** = jsonl.some((m) => m.type === 'user' && m.timestamp >= ts): for string stamps the greatest one answers (the same order);
 *  a transcript holding a user stamp that is not a string is scanned, as the release did */
function userAtOrAfter(pos, jsonl, ts) {
  if (pos.userTsStale) {   // r3: the greatest stamp slid out of the tail window — asked again, once
    _mergeCounts.userRescans++;
    pos.userTs = null; pos.userTsAll = true; pos.userTsStale = false;
    for (const m of jsonl) if (m && m.type === 'user') { const t = m.timestamp; if (typeof t === 'string') { if (pos.userTs === null || t > pos.userTs) pos.userTs = t; } else if (t != null) pos.userTsAll = false; }
  }
  if (typeof ts === 'string' && pos.userTsAll) return pos.userTs !== null && pos.userTs >= ts;
  _mergeCounts.userScans++;
  return jsonl.some((m) => m.type === 'user' && m.timestamp >= ts);
}
const BUF_PROBE = 4096;   // the kept buffer's identity: its first BUF_PROBE chars and the BUF_PROBE chars before its kept end
const flatCopy = (s) => (' ' + s).slice(1);   // a copy: a plain slice would keep the whole old ring alive after a trim
/** The buffer's records — parsed once per session: a buffer that only GREW parses the complete lines it gained; a last line
 *  still being written is parsed each time (never kept). Every writer of session.buffer appends or trims its head (+=,
 *  .slice(-N), the acp cut at a line, the claude ring's trimRing — a cut at a line with the owed records carried in front,
 *  src/chat-ring.js; the restore assigns a NEW session) — so the same first chars and the same chars before
 *  the kept end, at a length no shorter, say it only grew; a trimmed head parses the whole buffer again (bounded by the ring).
 *  `resolve` = the kept copies'; a new kept map (the restore's preload landing) parses again. */
function bufferRecordsOf(session, buffer, kept, resolve) {
  const keyed = !!session && typeof session === 'object';
  const c = keyed ? _bufRecsOf.get(session) : null;
  const same = !!(c && c.kept === kept && buffer.length >= c.len && buffer.startsWith(c.head) && buffer.startsWith(c.tail, c.len - c.tail.length));
  const from = same ? c.len : 0;
  const end = buffer.lastIndexOf('\n') + 1;   // past the last complete line (≥ from when `same`: the kept span ends at a line)
  const parse = (text, into) => {
    for (const line of text.split('\n')) {
      const trimmed = line.replace(/\r/g, '').trim();
      if (!trimmed) continue;
      _mergeCounts.linesParsed++;
      try { const rec = JSON.parse(trimmed); into.push(rec && rec.webui_copy ? resolve(rec) : rec); } catch {}
    }
  };
  let recs = same ? c.recs : [];   // the kept array is never pushed into: the lines it gains go into a copy
  if (end > from) { recs = recs.slice(); parse(buffer.slice(from, end), recs); }
  if (keyed && !(same && end <= from)) _bufRecsOf.set(session, { head: flatCopy(buffer.slice(0, Math.min(BUF_PROBE, end))), tail: flatCopy(buffer.slice(Math.max(0, end - BUF_PROBE), end)), len: end, recs, kept });
  if (end < buffer.length) { recs = recs.slice(); parse(buffer.slice(end), recs); }   // the line still being written: parsed, never kept
  return recs;
}

// THE COPY'S KEPT FILES (lane claude-steer-inject r5, r6): a claude wrapper's copy of a mid-turn frame (`webui_copy`) names its
// pictures — and a text block over 8 KB — by sha + extension, the files beside its buffer in ITS OWN session's folder
// (src/kept-copies.js). They are read back OFF the event loop before the history needs them (boot-restore preloads them into
// `session._keptFiles`, the attach awaits `session._keptLoad`); the merge resolves from that map with no fs call. A file that
// is not in it (gone, refused, past the cap, never written) stays a reference marked `gone` — the placeholder that says so.
const KC = require('./kept-copies.js');

class SessionMessages {
  constructor(session, sessionId, { buffersDir, permissionModes } = {}) {
    this._session = session;
    this._sessionId = sessionId;
    this._buffersDir = buffersDir;
    this._permissionModes = permissionModes || [];
    this._all = null;
    this._display = null;
    this._pendingPerms = null;
    this._wrapperMeta = undefined;
    this._taskState = undefined;
  }

  _ensureParsed() {
    if (this._all) return;
    const session = this._session;
    const historySessionId = getHistorySessionId(session);
    const jsonl = historySessionId ? parseSessionJsonl(historySessionId, session.cwd) : [];
    // B-437e files tier (r1247): whether these records reach back to the transcript's FIRST byte — a transcript past the tail
    // bound is read from its tail only (src/adapters/codex.js readJsonlTail: the span's start); no transcript read: not known
    // r2195 (e): a tail handed to its reader (not admitted by the cache), read from the file's first byte, says so too
    this._fromStart = spanFromStart(historySessionId ? (_jsonlCache.get(historySessionId) || _handoffGet(historySessionId)) : null, jsonl);
    this.notLoaded = (jsonl && jsonl.notLoaded) || null;   // row B-422c: the page says the history waits on the reader
    this.notLoadedStorage = !!(jsonl && jsonl.notLoaded && jsonl.storageHung);   // r1243 item 1: which door refused (the storage's: its own words)
    this.notLoadedRetryAt = (jsonl && jsonl.notLoaded && jsonl.retryAt) || null;   // r1243 item 2: when the page asks again by itself
    this.notLoadedReaderGone = !!(jsonl && jsonl.notLoaded && jsonl.readerGone);   // r1461 (1): the pool is gone — no «moment» promised
    this.notLoadedReaderCause = (jsonl && jsonl.notLoaded && jsonl.readerCause) || null;   // r3077: the cause it has (busy / restarting), else none named
    // THE MERGE MEMO (perf chunk C): the merge below is a pure function of
    // (the jsonl array, the buffer string) and the cache hands back the SAME
    // array until the file changes, so a burst of SessionMessages over one
    // session (a reconnect storm: chatStatus + pending permissions per
    // re-attach) merges once. `_all` is shared exactly as the no-insert case
    // always shared the cache's array; `_pendingPerms` is copied per instance.
    const buffer = session.buffer || '';
    const kept = session._keptFiles || null; // the restore's preload (a new map ⇒ a new merge)
    const memo = _mergeMemo.get(jsonl);
    if (memo && memo.buffer === buffer && memo.kept === kept) {
      this._pendingPerms = { ...memo.perms };
      this._helperResults = memo.helperResults || [];
      this._all = memo.all;
      this._display = this._all.filter(isDisplayMessage);
      this._drawHanded(session, historySessionId);
      return;
    }
    // (B-299b A5: the two Sets of every record's uuid and message.id built here were read by nothing — gone. The dedup is the
    // position map below: a streaming stdout event can carry a PLACEHOLDER uuid (…-000000000001) while the JSONL record for the
    // SAME message has the real one — message.id (msg_…) is stable across both copies.)

    this._pendingPerms = {};
    this._helperResults = []; // verify r3: the helpers' tool_results the record list skips (they settle an asked ask at the rebuild)
    // Surviving buffer records are INTERLEAVED at their true chronological
    // position (right after the JSONL record their buffer-neighborhood dedups
    // against) instead of all appended at the end. Stream-json stdout-only
    // records (result/init/control_*) never dedup — appended at the end, an
    // EARLIER turn's `result` replayed AFTER a still-running tool_use and the
    // normalizer flushed the live pending tool card to ✗ Interrupted on every
    // server restart (real user report); end-append also scrambled turn
    // boundaries in the replay. The buffer is chronological, so the index of
    // the last JSONL-matched record is a correct position anchor.
    const jsonlPos = jsonlPosOf(jsonl, historySessionId); // 'u:<uuid>' | 'm:<message.id>' → jsonl index — built once per transcript, moved by each append (B-299b A5)
    const parsed = bufferRecordsOf(session, buffer, kept, (rec) => KC.resolveRecord(rec, kept, (m) => console.warn(`[kept] ${this._sessionId || 'a session'}: ${m}`)));
    // A ROTATED buffer can start with unmatched stdout-only records from mid-
    // history; anchor those just before the first matched record (not at the
    // very start) — much closer to their true position.
    let firstHit = -1;
    for (const msg of parsed) {
      const hitU = msg.uuid != null ? jsonlPos.idx('u:' + msg.uuid, true) : undefined;
      const hit = hitU !== undefined ? hitU : (msg.message?.id ? jsonlPos.idx('m:' + msg.message.id) : undefined);
      if (hit !== undefined) { firstHit = hit; break; }
    }
    let anchor = firstHit >= 0 ? firstHit - 1 : jsonl.length - 1;
    const inserts = new Map(); // jsonl index (-1 = before all) → [records]
    let anyInsert = false;
    for (const msg of parsed) {
      if (msg.type === 'control_request' && msg.request?.tool_use_id) { this._pendingPerms[msg.request.tool_use_id] = msg; }
      const hitU = msg.uuid != null ? jsonlPos.idx('u:' + msg.uuid, true) : undefined;
      const hit = hitU !== undefined ? hitU : (msg.message?.id ? jsonlPos.idx('m:' + msg.message.id) : undefined);
      if (hit !== undefined) { if (hit > anchor) anchor = hit; continue; } // in JSONL — advances the position cursor
      const isControl = msg.type === 'control_request' || msg.type === 'control_response' || msg.type === 'control_cancel_request';
      if (!isControl) {
        if (isSubagentMessage(msg)) { this._noteHelperResult(msg); continue; }
        // a claude wrapper's copy of a MID-TURN frame (`webui_copy`, lane claude-steer-inject r2) is the only record of
        // those words the transcript may hold — never dropped for a later user record (a tool_result is one); the
        // normalizer draws it once (src/message-manager.js _processUser)
        if (msg._fromWebui && msg.timestamp && !msg.webui_copy) {
          if (userAtOrAfter(jsonlPos, jsonl, msg.timestamp)) continue;   // B-299b A5 r2: the kept greatest user stamp
        }
      }
      const list = inserts.get(anchor) || inserts.set(anchor, []).get(anchor);
      list.push(msg);
      anyInsert = true;
    }
    if (!anyInsert) this._all = jsonl;
    else {
      const all = [...(inserts.get(-1) || [])];
      for (let i = 0; i < jsonl.length; i++) {
        all.push(jsonl[i]);
        const ins = inserts.get(i);
        if (ins) all.push(...ins);
      }
      this._all = all;
    }
    _mergeMemo.set(jsonl, { buffer, kept, all: this._all, perms: { ...this._pendingPerms }, helperResults: this._helperResults });
    this._display = this._all.filter(isDisplayMessage);
    this._drawHanded(session, historySessionId);
  }

  /** B-5a4d's root (unit 1): THE ONE DRAWER of a frame the person handed to a CLI that died — its record, named by the conversation
   *  (src/handed-records.js, from the cache the harness's warm filled off the loop): «Not delivered», or «Not confirmed» while its fate
   *  is unknown — at its send time, in the stopped view and after a Resume alike. A live session's own frames in flight are not drawn. */
  _drawHanded(session, historySessionId) {
    if (!historySessionId) return;
    // the conversation's chain: the ids it moved through — never a REQUESTED fork's parent (a fork takes none of its parent's records).
    // r3282: the live and restored session CARRY the fork's source (ws-create / boot-restore, through claude-lock-capture's one rule
    // each); a fork still borrowing its parent's id (its own not yet announced) draws nothing
    const forkSource = session._forkSourceId || session.forkSourceId || null;
    if (forkSource && historySessionId === forkSource) return;
    const ids = [historySessionId, ...(Array.isArray(session.forkedFrom) ? session.forkedFrom.filter((x) => x && x !== forkSource) : [])];
    let drawn = [];
    try { drawn = HANDED.drawnFor(HANDED.recordsFor(ids, this._buffersDir ? { dir: this._buffersDir } : {}), { liveSince: session.pty || session.socketPath ? Number(session.createdAt) || 0 : 0 }); } catch { drawn = []; }
    if (!drawn.length) return;
    // ASK THE TRANSCRIPT FIRST (unit 2): a stamp the CLI already recorded (its user record's uuid, a batch's mergedSendUuids, a
    // queued_command's source_uuid) is that message — never drawn again beside it
    const recorded = new Set();
    for (const m of this._all) {
      if (!m || typeof m !== 'object') continue;
      if (m.type === 'user' && typeof m.uuid === 'string') recorded.add(m.uuid);
      if (Array.isArray(m.mergedSendUuids)) for (const u of m.mergedSendUuids) if (typeof u === 'string') recorded.add(u);
      if (m.attachment && typeof m.attachment.source_uuid === 'string') recorded.add(m.attachment.source_uuid);
    }
    drawn = drawn.filter((d) => !(d.rec && typeof d.rec.cliUuid === 'string' && recorded.has(d.rec.cliUuid)));
    if (!drawn.length) return;
    this._all = HANDED.insertDrawn(this._all, drawn);
    this._display = this._all.filter(isDisplayMessage);
  }

  get total() { this._ensureParsed(); return this._display.length; }
  get pendingPermissions() { this._ensureParsed(); return this._pendingPerms; }

  get isStreaming() {
    const wMeta = this.wrapperMeta();
    if (wMeta?.streaming != null) return wMeta.streaming;
    return false;
  }

  tail(n = 50) { this._ensureParsed(); return this._display.slice(-n); }
  slice(offset, limit) { this._ensureParsed(); return this._display.slice(offset, offset + limit); }
  all() { this._ensureParsed(); return this._display; }
  raw() { this._ensureParsed(); return this._all; }
  /** the records reach back to the transcript's first byte (B-437e files tier: the rebuild says it to the normalizer) */
  get fromStart() { this._ensureParsed(); return this._fromStart === true; }
  /** B-80cb: THE DOOR every reader takes (readOffLoop, src/attach-read.js — as codex's reader has one): the transcript's tail parsed
   *  in the worker (warmSessionJsonlAsync) BEFORE this reader's merge, so a reader read after it does not parse its 32 MB tail on
   *  the hub's loop (measured on stand-ins: 123–162 ms a cold parse; an append since the warm is folded in on the loop, up to 4 MB, as
   *  before; the transcript pool down: the old road). `wanted` (a socket closed while it waited) drops the read before
   *  it starts — and is asked AGAIN after the warm (r2195: a caller that left meanwhile takes no parse). `bulk` (r2195 (a)): the
   *  first attach of a paced «Resume all»'s conversation — carried to the warm, so this door's own warm never counts as a person's
   *  (it would lift a waiting bulk warm into the person's line). → the records (null when dropped) */
  async rawAsync({ wanted = null, bulk = false } = {}) {
    if (this._all) return this._all;
    if (typeof wanted === 'function' && !wanted()) return null;
    const id = getHistorySessionId(this._session);
    if (id) { try { await warmSessionJsonlAsync(id, this._session.cwd, bulk === true ? { bulk: true } : null); } catch { } }
    if (typeof wanted === 'function' && !wanted()) return null;
    this._ensureParsed();
    return this._all;
  }
  /** THE HELPERS' TOOL_RESULTS (lane S1 verify r3): every sidechain `user` record's
   *  tool_result blocks, as `{toolUseId, text, isError, parentToolUseId}` — the
   *  record list (`raw()`) skips sidechain records, yet a helper's result for an
   *  ASKED call is the one witness that the CLI settled the request without a
   *  record of ours (rebuildHistory feeds them to the table's result rows). */
  helperResults() { this._ensureParsed(); return this._helperResults || []; }
  _noteHelperResult(msg) {
    if (!msg || msg.type !== 'user') return;
    const c = msg.message && msg.message.content;
    if (!Array.isArray(c)) return;
    for (const b of c) {
      if (!b || b.type !== 'tool_result' || !b.tool_use_id) continue;
      const text = typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map((x) => (x && typeof x.text === 'string' ? x.text : '')).join('') : '';
      (this._helperResults || (this._helperResults = [])).push({ toolUseId: String(b.tool_use_id), text: text.slice(0, 400), isError: !!b.is_error, parentToolUseId: msg.parent_tool_use_id || null });
    }
  }

  search(query) {
    this._ensureParsed();
    const q = query.toLowerCase();
    const matches = [];
    for (let i = 0; i < this._display.length; i++) {
      const m = this._display[i];
      const c = m.message?.content;
      let text = '';
      if (typeof c === 'string') text = c;
      else if (Array.isArray(c)) text = c.map(b => b.text || '').join(' ');
      if (text.toLowerCase().includes(q)) matches.push({ index: i, type: m.type, preview: text.substring(0, 120) });
    }
    return matches;
  }

  chatStatus() {
    this._ensureParsed();
    const msgs = this._all;
    let lastUsage = null, model = null, contextWindow = 0, slashCommands = null, permissionMode = null;
    let assistantModel = null, iAsst = -1;
    // Scan depth: the tail of _all can be dominated by hundreds of surviving
    // buffer records (stdout-only system/hook events that never dedup against
    // the JSONL) — a 200-record window missed every assistant usage record and
    // the status bar lost its context% on refresh. 2000 covers the spam.
    for (let i = msgs.length - 1; i >= Math.max(0, msgs.length - 2000); i--) {
      const m = msgs[i];
      // a `<synthetic>` rejection record carries all-zero usage (2.369.97): not a reading
      if (!lastUsage && m.type === 'assistant' && m.message?.usage && m.message.model !== '<synthetic>'
        && ((m.message.usage.input_tokens || 0) + (m.message.usage.cache_read_input_tokens || 0) + (m.message.usage.cache_creation_input_tokens || 0)) > 0) lastUsage = m.message.usage;
      // result/init records are stream-json stdout-only — they NEVER appear in
      // the JSONL, so for stopped/resumed sessions (no buffer) the assistant
      // record's message.model is the only model source available
      if (!assistantModel && m.type === 'assistant' && m.message?.model && !String(m.message.model).startsWith('<')) { assistantModel = m.message.model; iAsst = i; }
      if (!model && m.type === 'result' && m.modelUsage) { model = Object.keys(m.modelUsage)[0]; contextWindow = Object.values(m.modelUsage)[0]?.contextWindow || 0; }
      if (lastUsage && model && assistantModel) break;
    }
    if (!model) model = assistantModel;
    // THE NEWEST TURN'S ASKED MODEL, where its record states one (lane fable-52-cli-321 rounds 14–15): a turn the CLI fell back in
    // carries the fallback block {from, to} on the record that served — `from` is what that turn asked; a view of that history names
    // (and locks) it, never the fallback that served. A record that states no ask in that turn: master's `model`
    let lastAsked = null;
    for (let j = iAsst; j >= 0 && j >= msgs.length - 2000; j--) {
      const r = msgs[j];
      if (r.type === 'result') break;   // the turn before the newest one
      if (r.type !== 'assistant' || !r.message) continue;
      const fb = Array.isArray(r.message.content) ? r.message.content.find((b) => b && b.type === 'fallback' && b.from?.model) : null;
      if (fb && (!fb.to?.model || fb.to.model === assistantModel)) { lastAsked = fb.from.model; break; }
    }
    for (let i = 0; i < Math.min(msgs.length, 5); i++) {
      const m = msgs[i];
      if (m.type === 'system' && m.subtype === 'init') {
        if (m.slash_commands) slashCommands = m.slash_commands;
        if (!model && m.model) model = m.model;
        if (m.permissionMode) permissionMode = m.permissionMode;
        break;
      }
    }
    // The WIDENED init facts + the CURRENT command list (§2.6). A session
    // re-inits (resume, wrapper restart) and pushes `commands_changed`
    // mid-run, so the FIRST init is the wrong authority for anything live:
    // upstream's own rule is "re-emitted inits carry the current value — the
    // newest frame wins", and a commands_changed push REPLACES the list. This
    // is the attach/HTTP twin of the live meta op, so a window that opens
    // after the push (or whose init card sits outside the loaded tail) still
    // gets the same answer. Bounded tail scan, like the usage one above.
    //
    // POSITIONS, NOT PRESENCE (round 3). "The newest frame wins" is an
    // ORDERING rule, and a buffer holds many inits — one per spawn, and the
    // round-2 measurement found 33 in a single conversation — so
    // `[…, commands_changed, …, init]` is an ordinary order, not a corner
    // case: a resume or a wrapper respawn re-inits AFTER a mid-run push. The
    // first version applied the push unconditionally and handed the composer
    // the PRE-restart list, disagreeing with the live path on the very same
    // records (the live normalizer re-emits the new init's list, so the two
    // twins answered differently — and applyStatus runs after the history
    // loop, so the stale answer OVERWROTE the correct one the init card's own
    // side effect had just set). So both indices are recorded and the push
    // only wins when it is genuinely newer.
    //
    // The `!initFrame.slashCommands` half is the same rule read the other way:
    // live, `_emitSlashCommands` returns early on an init that names no
    // commands, so the last thing that SPOKE still stands. An init without
    // `slash_commands` cannot happen on a real CLI (the field is REQUIRED in
    // the 2.1.257 zod schema) — this is the degradation branch, not a shape
    // we expect.
    let initFrame = null, initIdx = -1, pushedCommands = null, pushedIdx = -1;
    for (let i = msgs.length - 1; i >= Math.max(0, msgs.length - 2000); i--) {
      const m = msgs[i];
      if (!pushedCommands && m.type === 'system' && m.subtype === 'commands_changed') { pushedCommands = commandNames(m.commands); pushedIdx = i; }
      if (!initFrame && m.type === 'system' && m.subtype === 'init') { initFrame = initFrameFacts(m); initIdx = i; }
      if (initFrame && pushedCommands) break;
    }
    if (initFrame) {
      if (pushedCommands && (pushedIdx > initIdx || !initFrame.slashCommands)) initFrame.slashCommands = pushedCommands;
      if (initFrame.slashCommands) slashCommands = initFrame.slashCommands;
      if (initFrame.terminalSlashCommands && initFrame.slashCommands) {
        initFrame.terminalSlashCommands = initFrame.terminalSlashCommands.filter((c) => initFrame.slashCommands.includes(c));
      }
    } else if (pushedCommands) {
      slashCommands = pushedCommands;
    }
    // contextWindow comes from result.modelUsage (stdout-only). When restoring
    // from JSONL the only sound DEDUCTION is: observed usage beyond the 200k
    // window proves the 1M beta. Anything else stays 0 = unknown — the UI shows
    // "?" rather than a guessed default (a wrong 200k on a 1M session made the
    // context % lie by 5x).
    if (!contextWindow && lastUsage) {
      const used = (lastUsage.input_tokens || 0) + (lastUsage.cache_read_input_tokens || 0) + (lastUsage.cache_creation_input_tokens || 0);
      if (used > 190000) contextWindow = 1000000;
    }
    // the CLI's total_cost_usd is its PROCESS's running total: the shown figure is each segment's LAST total, summed (src/cost-segments.js);
    // the conversation's fold — the kept fact the boot resumed, carried by the normalizer — is read BEFORE the buffer, whose head
    // may have lost every earlier process
    const norm = this._session && this._session._normalizer;
    const totalCost = costShown(costResume(norm && typeof norm.costState === 'function' ? norm.costState() : null, msgs));
    if (!lastUsage && !model) return null;
    return {
      model, ...(lastAsked ? { lastAsked } : {}), lastUsage, contextWindow, total_cost_usd: totalCost, slashCommands, permissionMode, // lastAsked: the newest turn's asked model where its record states one (lane fable-52-cli-321 rounds 14–15)
      initFrame, // the widened claude init facts (§2.6): terminal-bound commands, memory dirs, health — null on every other harness / older CLI
      permissionModes: this._permissionModes,
      subagentMetas: [], // B-299b A4: no reader (the walk that filled it held the loop)
    };
  }

  activePendingPermissions() {
    this._ensureParsed();
    const resolved = new Set();
    // Scan ALL records for tool_results, not a tail window — a session that
    // kept running after answering pushes the tool_result out of any fixed
    // window and the stale control_request re-injects an awaiting-approval
    // overlay on every attach (real report: an answered AskUserQuestion
    // questionnaire resurrected after each server restart). Same class as
    // the chatStatus 200→2000 scan-depth bug.
    // Answered request_ids: the chat-wrapper appends control_response stdin
    // lines to its buffer (2.220.0), so an APPROVED permission whose tool is
    // STILL RUNNING at restart (no tool_result yet) resolves here instead of
    // resurrecting the Allow/Deny overlay on every attach.
    const answered = new Set();
    for (const m of this._all) {
      if (m.type === 'control_response') {
        const rid = m.response?.request_id;
        if (rid) answered.add(rid);
        continue;
      }
      // …and a request the CLI WITHDREW (lane S1: `stop_task` on a helper whose
      // ask was pending ⇒ control_cancel_request) — without this a helper's ask,
      // whose tool_result lives in the helper's own transcript and never here,
      // came back as pending after every restart
      if (m.type === 'control_cancel_request') { if (m.request_id) answered.add(m.request_id); continue; }
      if (m.type !== 'user') continue;
      const c = m.message?.content;
      if (!Array.isArray(c)) continue;
      for (const b of c) { if (b.type === 'tool_result' && b.tool_use_id) resolved.add(b.tool_use_id); }
    }
    const result = {};
    for (const [id, cr] of Object.entries(this._pendingPerms)) {
      if (resolved.has(id)) continue;
      if (cr.request_id && answered.has(cr.request_id)) continue;
      result[id] = cr;
    }
    return result;
  }

  /** B-952b (its smalls, 主开发 03:40Z): the side file read OFF the loop — a route's refetch (Properties, at every broadcast) on a
   *  data folder that may sit on a slow mount; wrapperMeta() then answers from what this read. → the meta | null */
  async loadWrapperMeta() {
    if (this._wrapperMeta !== undefined) return this._wrapperMeta;
    if (!this._buffersDir || !this._sessionId) { this._wrapperMeta = null; return null; }
    try { this._wrapperMeta = JSON.parse(await fs.promises.readFile(path.join(this._buffersDir, `${this._sessionId}.json`), 'utf-8')); } catch { this._wrapperMeta = null; }
    return this._wrapperMeta;
  }

  wrapperMeta() {
    if (this._wrapperMeta === undefined) {
      if (this._sessionId && this._buffersDir) {
        try { this._wrapperMeta = JSON.parse(fs.readFileSync(path.join(this._buffersDir, this._sessionId + '.json'), 'utf-8')); }
        catch { this._wrapperMeta = null; }
      } else {
        this._wrapperMeta = null;
      }
    }
    return this._wrapperMeta;
  }

  taskState() {
    if (this._taskState !== undefined) return this._taskState;
    const wMeta = this.wrapperMeta();
    if (wMeta?.tasks || wMeta?.todos) {
      const base = { tasks: wMeta.tasks || {}, todos: wMeta.todos || [] };
      // An EMPTY todos array in wrapper meta must not short-circuit the scan —
      // the newer TaskCreate/TaskUpdate family only exists in the transcript.
      if (base.todos.length) { this._taskState = base; return base; }
      const scanned = this._scanTaskState();
      // MERGE, never fallback (the two-shape-payload law): the wrapper's map
      // is live truth for ITS OWN tasks only — one live entry used to hide
      // the entire history-synthesized set (2.368.31, seen as a 41→1 flap).
      this._taskState = { tasks: { ...scanned.tasks, ...base.tasks }, todos: scanned.todos };
      return this._taskState;
    }
    this._taskState = this._scanTaskState();
    return this._taskState;
  }

  _scanTaskState() {
    this._ensureParsed();
    // B-360d part 2: the answer kept for these very inputs (the merged records, the kept task events as they stand, the
    // wrapper's start) — a fresh reader of an unchanged conversation (every re-attach) walks nothing
    let key = null;
    try {
      const hid0 = getHistorySessionId(this._session);
      const kept0 = (hid0 ? (_taskEventCache.get(hid0) || (this._session?.claudeSessionId && _taskEventCache.get(this._session.claudeSessionId))) : null) || null;
      key = { kept: kept0, seq: kept0 ? kept0.seq : -1, n: kept0 && Array.isArray(kept0.events) ? kept0.events.length : -1, wStart: Number(this.wrapperMeta()?.startedAt) || 0 };
      const was = this._all ? _taskStateMemo.get(this._all) : null;
      if (was && (was.keptRef ? was.keptRef.deref() : null) === key.kept && was.seq === key.seq && was.n === key.n && was.wStart === key.wStart) { _taskScanCounts.kept++; return copyTaskState(was.answer); }
    } catch { key = null; }
    _taskScanCounts.scans++; _taskScanCounts.records += (this._all || []).length;
    const tasks = {};
    const todos = [];
    // a launch's task id → the tool_use ids of the entries that carry it (B-360d part 2: the supersede below asked every entry
    // of `tasks` at every launch — quadratic in the launches of the window; 61 % of the scan measured)
    const byTaskId = new Map();
    const putTask = (k, v) => { tasks[k] = v; if (v && v.id != null) { const ks = byTaskId.get(v.id); if (ks) ks.add(k); else byTaskId.set(v.id, new Set([k])); } };
    // Newer task-tool family (TaskCreate/TaskUpdate, CLI ≥2.1.2xx): CRUD by id
    // — replay into a list. The created id only appears in the RESULT text
    // ("Task #N created successfully: …").
    const pendingCreates = new Map(); // tool_use_id → input
    const taskList = new Map(); // taskId → {content, activeForm, status}
    // Prefer the FULL-FILE event scan applied in TIMESTAMP order — the tail
    // window misses old completions, and compaction replays stale records
    // AFTER them (see taskLinesSince). B-299b A2: the events the warm
    // scanned off the loop (no transcript byte read here); falls back to
    // the in-window walk when none were kept (never warmed — the pool down).
    let fullApplied = false;
    try {
      const hid = getHistorySessionId(this._session);
      const kept = hid ? (_taskEventCache.get(hid) || (this._session?.claudeSessionId && _taskEventCache.get(this._session.claudeSessionId))) : null;
      const events = kept ? kept.events : null;
      if (events) {
        fullApplied = true;
        let lastTodoTs = -1, lastTaskTs = -1;
        for (const ev of [...events].sort((a, b) => (a.ts - b.ts) || (a.seq - b.seq))) {
          if (ev.kind === 'todos') { todos.length = 0; todos.push(...ev.todos); lastTodoTs = ev.ts; }
          else if (ev.kind === 'create') { if (!taskList.has(ev.id)) taskList.set(ev.id, { content: ev.subject, activeForm: ev.activeForm, status: 'pending' }); lastTaskTs = ev.ts; }
          else if (ev.kind === 'update') {
            lastTaskTs = ev.ts;
            const key = String(ev.input.taskId);
            if (ev.input.status === 'deleted') taskList.delete(key);
            else {
              const cur = taskList.get(key) || { content: '', status: 'pending' };
              if (ev.input.subject) cur.content = ev.input.subject;
              if (ev.input.activeForm) cur.activeForm = ev.input.activeForm;
              if (ev.input.status) cur.status = ev.input.status;
              taskList.set(key, cur);
            }
          }
        }
        // The LATEST-used family wins. The old tail-window scan expressed this
        // as "TodoWrite present in the window"; over the FULL history that
        // reads as "TodoWrite EVER used" and an ancient TodoWrite snapshot
        // shadowed the current task list (caught on the first real transcript).
        if (taskList.size && lastTaskTs >= lastTodoTs) todos.length = 0;
      }
    } catch { /* fall through to the in-window walk */ }
    // Launch-ack synthesis (2.368.30, shared parser with the normalizer):
    // the system task_* subtypes below are live-stream-only and never appear
    // in a persisted transcript — without this, taskState.tasks was EMPTY
    // after every restart and the status bar showed nothing.
    const launchUses = new Map(); // tool_use_id → { name, input }
    for (const msg of this._all) {
      if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
        for (const b of msg.message.content) {
          if (b?.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Workflow' || b.name === 'Bash')) launchUses.set(b.id, { name: b.name, input: b.input });
        }
      }
      if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
        for (const b of msg.message.content) {
          if (b?.type !== 'tool_result' || !launchUses.has(b.tool_use_id) || tasks[b.tool_use_id]) continue;
          const lu = launchUses.get(b.tool_use_id);
          const txt = typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map((c) => c?.text || '').join(' ') : '');
          const syn = parseBackgroundLaunch(lu.name, lu.input, txt);
          if (syn) {
            // supersede an earlier launch of the SAME task id (workflow resume)
            if (syn.id) for (const k of byTaskId.get(syn.id) || []) { const tk = tasks[k]; if (tk && tk.id === syn.id && tk.status === 'running') tk.status = 'completed'; }
            putTask(b.tool_use_id, { ...syn, status: 'running', _launchTs: Date.parse(msg.timestamp || '') || 0 });
          }
        }
      }
      // the notification rides THREE transports (2.368.31): idle-wake user
      // record, mid-turn queue-operation records, queued_command attachment
      const notifC = (msg.type === 'user' && typeof msg.message?.content === 'string') ? msg.message.content
        : (msg.type === 'queue-operation' && typeof msg.content === 'string') ? msg.content
        : (msg.type === 'attachment' && typeof msg.attachment?.prompt === 'string') ? msg.attachment.prompt : '';
      if (notifC.includes('<task-notification>')) {
        const c = notifC;
        const tu = c.match(/<tool-use-id>([\s\S]*?)<\/tool-use-id>/)?.[1]?.trim();
        if (tu && tasks[tu] && tasks[tu].status === 'running') {
          tasks[tu].status = (c.match(/<status>([\s\S]*?)<\/status>/)?.[1]?.trim() || 'completed').toLowerCase();
          const sm = c.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim();
          if (sm) tasks[tu].summary = sm.slice(0, 200);
        }
      }
      if (msg.type === 'system' && msg.tool_use_id) {
        if (msg.subtype === 'task_started') {
          putTask(msg.tool_use_id, { id: msg.task_id, type: msg.task_type === 'local_agent' ? 'agent' : 'command', description: msg.description || '', status: 'running' });
        } else if (msg.subtype === 'task_progress' && tasks[msg.tool_use_id]) {
          if (msg.description) tasks[msg.tool_use_id].description = msg.description;
          if (msg.last_tool_name) tasks[msg.tool_use_id].lastTool = msg.last_tool_name;
        } else if (msg.subtype === 'task_notification' && tasks[msg.tool_use_id]) {
          tasks[msg.tool_use_id].status = 'completed';
        }
      }
      if (!fullApplied && msg.type === 'assistant' && msg.message?.content) {
        const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
        for (const b of blocks) {
          if (b.type !== 'tool_use') continue;
          if (b.name === 'TodoWrite' && b.input?.todos) {
            todos.length = 0;
            todos.push(...b.input.todos);
          } else if (b.name === 'TaskCreate') {
            pendingCreates.set(b.id, b.input || {});
          } else if (b.name === 'TaskUpdate' && b.input?.taskId) {
            const key = String(b.input.taskId);
            if (b.input.status === 'deleted') taskList.delete(key);
            else {
              const cur = taskList.get(key) || { content: '', status: 'pending' };
              if (b.input.subject) cur.content = b.input.subject;
              if (b.input.activeForm) cur.activeForm = b.input.activeForm;
              if (b.input.status) cur.status = b.input.status;
              taskList.set(key, cur);
            }
          }
        }
      }
      if (!fullApplied && msg.type === 'user' && Array.isArray(msg.message?.content) && pendingCreates.size) {
        for (const b of msg.message.content) {
          if (b?.type !== 'tool_result' || !pendingCreates.has(b.tool_use_id)) continue;
          const inp = pendingCreates.get(b.tool_use_id);
          pendingCreates.delete(b.tool_use_id);
          const txt = typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map((c) => c?.text || '').join(' ') : '');
          const m = /Task #(\d+) created/.exec(txt);
          if (m) taskList.set(m[1], { content: inp.subject || '', activeForm: inp.activeForm, status: 'pending' });
        }
      }
    }
    // A background OS task cannot outlive the CLI process (its /tmp task dir
    // dies with it) — a synthesized 'running' whose launch predates the
    // CURRENT wrapper start is a phantom (the field transcript showed 16
    // forever-'running' watchers from previous wrapper lives). Workflow runs
    // are in-process too. Keep unknown-timestamp entries (never guess dead).
    const wStart = Number(this.wrapperMeta()?.startedAt) || 0;
    if (wStart) {
      for (const [tuid, tk] of Object.entries(tasks)) {
        if (tk.status === 'running' && tk._launchTs && tk._launchTs < wStart) delete tasks[tuid];
      }
    }
    for (const tk of Object.values(tasks)) delete tk._launchTs;
    // Prefer the newer task-tool list when TodoWrite wasn't used.
    if (!todos.length && taskList.size) {
      todos.push(...[...taskList.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, v]) => v));
    }
    // the task-event entry by a WEAK reference (the round's should): an entry the LRU evicts is never held by a kept answer
    if (key && this._all) _taskStateMemo.set(this._all, { keptRef: key.kept ? new WeakRef(key.kept) : null, seq: key.seq, n: key.n, wStart: key.wStart, answer: copyTaskState({ tasks, todos }) });
    return { tasks, todos };
  }
}

// Dedup surviving webui dtach sockets by conversation (userW's local
// double-writer class, real owner report). A plain `claude --resume`
// REUSES the conversation id, so resuming a session whose claude had already
// died (the live-guard sees no live session to block) mints a SECOND dtach
// session for the SAME claudeSessionId. Two surviving sockets → two sidebar
// cards and — if both claude are alive — two writers on ONE JSONL. On restore
// keep ONE socket per conversation and retire the rest. Winner precedence:
// alive-claude beats dead, then newest createdAt (that's the current writer).
//   entries: [{ sockFile, backend, host, claudeSessionId, createdAt, claudeAlive }]
//   → { winners: Map(key -> sockFile), retire: Set(sockFile) }
// Sessions with no claudeSessionId yet are never duplicates (each is distinct).
// ── THE claude session sweep (S3, docs/design-harness-plugins.md §2.4):
// moved VERBATIM out of routes/sessions.js so the claude harness descriptor's
// `store.discover` owns it and the route only iterates harnesses + merges.
// Steps: webui-pid map (+15s pgrep cache) → lock files + tmux panes → lock-
// first JSONL claims per project dir → entries; `devSnap` = device #0's
// discovery snapshot when agentd.localDiscovery is on (facts pre-verified
// device-side), null ⇒ the local scan. Returns plain entries (the route adds
// sessionKey/realCwd). ──
async function discoverClaudeSessions({ activeSessions, webuiPids = new Set(), devSnap = null, stepClock = null } = {}) {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  // snapshot jsonls grouped by projDir for the walk below
  const snapByDir = devSnap ? (() => {
    const m = new Map();
    for (const j of devSnap.jsonls) { if (!m.has(j.projDir)) m.set(j.projDir, new Map()); m.get(j.projDir).set(j.file, j); }
    return m;
  })() : null;

  // Step 0: Use cached webuiPids (updated on session create/kill/restore)

  // Step 1: Scan lock files + tmux panes -> build map of RUNNING sessions
  // Build webuiPid -> claudeSessionId map for precise JSONL matching
  // THE `pgrep -P <childPid>` PER LIVE SESSION IS GONE (2026-09-09), and so is
  // the 15s cache that existed only to blunt it: the direct children of a pid
  // are `/proc/<pid>/task/*/children`, which is a file read. The cache was also
  // a correctness cost — a wrapper that forked a new claude within the window
  // stayed unmapped — so removing the fork removes the staleness with it.
  const webuiPidToSessionId = new Map();
  for (const [id, s] of activeSessions) {
    if (s.claudeSessionId && s._childPid) {
      // the childPid + its direct children (claude forks from the node-pty spawn)
      webuiPidToSessionId.set(s._childPid, s.claudeSessionId);
      for (const p of readChildPids(s._childPid)) webuiPidToSessionId.set(p, s.claudeSessionId);
    }
  }

  const paneMap = await getTmuxPaneMapAsync();
  const runningByProjDir = new Map(); // projDirName -> [{lock, tmuxTarget, assigned, claudeSessionId}]
  if (devSnap || fs.existsSync(SESSIONS_DIR)) {
    let lockDatas = [];
    if (devSnap) {
      // device facts: liveness + pidLooksClaude already applied device-side
      lockDatas = devSnap.locks;
    } else for (const f of fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'));
        if (!isPidAlive(data.pid)) continue;
        lockDatas.push(data);
      } catch {}
    }
    // probe in PARALLEL, assemble in ORIGINAL order (claimJsonls' mtime
    // fallback + the firstRunning cwd pick depend on stable entry order)
    const probed = await Promise.all(lockDatas.map(async (data) => {
      try {
        if (!devSnap && !(await isLockClaude(data))) return null; // B-2104: procStart file-read, ps only as fallback (device facts arrive pre-verified)
        return { data, tmuxTarget: await findTmuxTargetAsync(data.pid, paneMap) };
      } catch { return null; }
    }));
    for (const hit of probed) {
      if (!hit) continue;
      // a live lock that names no cwd (a stub CLI's, another CLI version's) is no session we can place: skipped, never
      // thrown — one such lock answered EVERY GET /api/sessions 500, and the page's boot ladder gives up there (B-0ece)
      if (typeof hit.data.cwd !== 'string' || !hit.data.cwd) continue;
      const projDirName = cwdToProjectDir(hit.data.cwd);
      const claudeSessionId = webuiPidToSessionId.get(hit.data.pid) || null;
      if (!runningByProjDir.has(projDirName)) runningByProjDir.set(projDirName, []);
      runningByProjDir.get(projDirName).push({ lock: hit.data, tmuxTarget: hit.tmuxTarget, assigned: false, claudeSessionId });
    }
  }

  // Step 2: Scan JSONL files, match with running locks
  const sessions = [];
  const visited = new Set();   // B-891e: the transcripts this walk read — the memo's floor and its prune
  const sessionMap = new Map(); // sessionId → index in sessions[] (dedup: running wins over stopped)
  // B-80cb: THE WALK IN BOUNDED STEPS. On the healthy road it runs in the «sessions-sweep» worker (src/sessions-sweep.js); when that
  // pool has no worker at the FIRST sweep the route runs it HERE, on the hub's loop (its inline fallback) — and each transcript's stat
  // and head read ran there in one go (measured on stand-ins at the owner's order of sizes: one step of about a second cold). The walk
  // gives the loop back every SWEEP_STEP_READS transcript reads or SWEEP_STEP_MS, whichever comes first (at real sizes a cold read is
  // ~1 ms: the 20 ms bound is the one that holds); its steps are counted (lastWalkSteps — the law's legs in test-sessions-sweep-steps).
  const steps = { reads: 0, yields: 0, maxPerStep: 0 };
  const now = typeof stepClock === 'function' ? stepClock : () => performance.now();   // `stepClock`: a suite's clock (the time bound counted)
  let stepAt = now(), inStep = 0;
  const stepDue = () => { steps.reads++; inStep++; return inStep >= SWEEP_STEP_READS || now() - stepAt >= SWEEP_STEP_MS; };   // an await only when a step ends
  const stepEnd = async () => {
    if (inStep > steps.maxPerStep) steps.maxPerStep = inStep;
    await new Promise((r) => setImmediate(r));
    steps.yields++; inStep = 0; stepAt = now();
  };
  if (snapByDir || fs.existsSync(projectsDir)) {
    for (const projDir of (snapByDir ? [...snapByDir.keys()] : fs.readdirSync(projectsDir))) {
      // A SUITE'S THROWAWAY cwd is not a conversation (2026-09-09). Its
      // transcript is hand-written, its "session" was never a session, and it
      // is deleted seconds later — but the production instance polls this
      // directory every 5s, so it listed one card per gate run (12 measured on
      // this box before the isolation fix, each with its own cwd folder
      // group). The DEVICE snapshot path goes through the same predicate: the
      // fact is about the directory, not about which transport read it.
      if (isFixtureProjectDir(projDir)) continue;
      const projPath = path.join(projectsDir, projDir);
      const snapFiles = snapByDir?.get(projDir) || null;
      if (!snapFiles) { try { if (!fs.statSync(projPath).isDirectory()) continue; } catch { continue; } }

      // Pre-fetch stats for sorting + mtime lookup (device facts carry them)
      const jsonls = (snapFiles ? [...snapFiles.keys()]
        : fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-')))
        .filter(f => !isFixtureSid(f.replace(/\.jsonl$/, ''))); // synthetic conversation id, wherever it landed
      const statMap = new Map(), stOf = new Map();   // stOf (B-891e): the stat itself, handed to extractSessionMeta — one stat per transcript
      for (const f of jsonls) {
        if (stepDue()) await stepEnd();
        if (snapFiles) { statMap.set(f, snapFiles.get(f)?.mtimeMs || 0); continue; }
        try { const st = fs.statSync(path.join(projPath, f)); statMap.set(f, st.mtimeMs); stOf.set(f, st); } catch { statMap.set(f, 0); }
      }
      // Sort by mtime desc (display recency; claiming no longer relies on it alone)
      jsonls.sort((a, b) => (statMap.get(b) || 0) - (statMap.get(a) || 0));

      // Check if there are running locks for this project dir
      const runningEntries = runningByProjDir.get(projDir) || [];

      // Match running locks to JSONLs (claimJsonls in session-store):
      // 1. exact — webui-tracked claudeSessionId, or the lock file's own
      //    sessionId equals a JSONL filename (non-resumed sessions)
      // 2. tail — resumed sessions write their CURRENT id into the
      //    ORIGINAL-named file; scan the last 64KB for the lock's id
      // 3. mtime fallback — brand-new session with nothing flushed yet.
      // With N parallel sessions in ONE cwd, the old "newest unclaimed
      // JSONL takes the next lock" attributed files arbitrarily (kill one
      // → the WRONG id showed stopped → resume collided with a live one).
      const claims = runningEntries.length ? claimJsonls(
        runningEntries.map(e => ({ sessionId: e.claudeSessionId || e.lock.sessionId || null, exactOnly: !!e.claudeSessionId, entry: e })),
        jsonls.map(f => ({ id: f.replace(/\.jsonl$/, ''), mtime: statMap.get(f) || 0 })),
        (j) => {
          // device facts carry tail ids for the newest 60 files; older
          // files with a running lock (rare) fall back to a local read —
          // extractTailIds' null-on-unreadable contract is preserved
          const sf = snapFiles?.get(j.id + '.jsonl');
          return sf && 'tailIds' in sf ? sf.tailIds : readJsonlTailIds(path.join(projPath, j.id + '.jsonl'));
        },
      ) : new Map();

      for (const f of jsonls) {
        if (stepDue()) await stepEnd();
        const sessionId = f.replace('.jsonl', '');
        const filePath = path.join(projPath, f);
        const mtime = statMap.get(f) || 0;

        const meta = extractSessionMeta(filePath, stOf.get(f) || null); visited.add(filePath);
        const firstRunning = runningEntries.find(e => !e.assigned);
        const cwd = (firstRunning?.lock.cwd) || meta.cwd || recoverCwdFromProjDir(projDir);

        let status = 'stopped', pid = null, tmuxTarget = null;
        const match = claims.get(sessionId)?.entry || null;
        // Also check if any active webui session claims this claudeSessionId (covers race during resume)
        let isWebuiSession = false;
        if (match) isWebuiSession = webuiPids.has(match.lock.pid);
        if (!isWebuiSession) {
          for (const [, s] of activeSessions) {
            if (s.claudeSessionId === sessionId) { isWebuiSession = true; break; }
          }
        }
        if (match) {
          status = isWebuiSession ? 'live'
            : match.tmuxTarget ? 'tmux' : 'external';
          pid = match.lock.pid;
          tmuxTarget = match.tmuxTarget || null;
          match.assigned = true;
        }

        const entry = {
          backend: 'claude',
          backendSessionId: sessionId,
          claudeSessionId: sessionId,
          sessionId,
          cwd,
          pid,
          startedAt: mtime,
          status,
          name: meta.name || '',
          cliTitle: meta.cliTitle || null, // the CLI's own title (lane session-title-record) — the name ladder's middle rung
          tmuxTarget,
        };

        // Deduplicate: same JSONL can appear in multiple project dirs
        if (sessionMap.has(sessionId)) {
          const existing = sessions[sessionMap.get(sessionId)];
          // Running status wins over stopped
          if (existing.status === 'stopped' && status !== 'stopped') {
            sessions[sessionMap.get(sessionId)] = entry;
          }
        } else {
          sessionMap.set(sessionId, sessions.length);
          sessions.push(entry);
        }
      }
    }
  }

  // Step 3: Running locks that didn't match any project dir (brand new, no JSONL yet)
  for (const [, entries] of runningByProjDir) {
    for (const entry of entries) {
      if (!entry.assigned && !sessionMap.has(entry.lock.sessionId)) {
        sessionMap.set(entry.lock.sessionId, sessions.length);
        sessions.push({
          backend: 'claude',
          backendSessionId: entry.lock.sessionId,
          claudeSessionId: entry.lock.sessionId,
          sessionId: entry.lock.sessionId, cwd: entry.lock.cwd, pid: entry.lock.pid,
          startedAt: entry.lock.startedAt || Date.now(),
          status: (webuiPids.has(entry.lock.pid) || [...activeSessions.values()].some(s => s.claudeSessionId === entry.lock.sessionId)) ? 'live'
            : entry.tmuxTarget ? 'tmux' : 'external', name: '',
          tmuxTarget: entry.tmuxTarget || null,
        });
      }
    }
  }
  if (visited.size) {   // B-891e: the memo holds every transcript this walk read, and only those (a deleted one leaves it)
    _metaCap = Math.max(8192, visited.size + 1024);
    if (_sessionMetaCache.size > visited.size + 1024) for (const k of [..._sessionMetaCache.keys()]) if (!visited.has(k)) _sessionMetaCache.delete(k);
  }
  if (inStep > steps.maxPerStep) steps.maxPerStep = inStep;
  _lastWalkSteps = steps;
  return sessions;
}

function dedupWebuiSockets(entries) {
  const best = new Map(); // key -> entry
  for (const e of entries || []) {
    if (!e || !e.claudeSessionId) continue;
    const key = `${e.backend || 'claude'}:${e.host || 'local'}:${e.claudeSessionId}`;
    const cur = best.get(key);
    if (!cur) { best.set(key, e); continue; }
    const better = (!!e.claudeAlive && !cur.claudeAlive)
      || (!!e.claudeAlive === !!cur.claudeAlive && (e.createdAt || 0) > (cur.createdAt || 0));
    if (better) best.set(key, e);
  }
  const winners = new Map();
  for (const [key, e] of best) winners.set(key, e.sockFile);
  const retire = new Set();
  for (const e of entries || []) {
    if (!e || !e.claudeSessionId) continue;
    const key = `${e.backend || 'claude'}:${e.host || 'local'}:${e.claudeSessionId}`;
    if (winners.get(key) !== e.sockFile) retire.add(e.sockFile);
  }
  return { winners, retire };
}

module.exports = { setJsonlHeld, noteJsonlView, dropJsonlView, dropJsonlViews, jsonlCacheTrim, jsonlCacheTestPut, jsonlHas, claudeTranscriptIndex, stuckSaid,
  warmSessionJsonlAsync, jsonlCacheClear, jsonlCacheCensus, onHistoryReadable, cachedCopyWins, warmHandoffStats, _warmHandoffTestSeam, warmLineStats,   // B-80cb cure
  taskLinesSince, warmTaskEvents, TASK_EVENT_CACHE_MAX, _taskEventCache, _mergeCounts, _taskScanCounts, _taskStateCensus: taskStateCensus, _spanFromStart: spanFromStart, _jsonlPosOf: jsonlPosOf, _userAtOrAfter: userAtOrAfter, _jsonlPosCensus: jsonlPosCensus, POS_KEY_BYTES, POS_ORD_BYTES,
  extractSessionMeta,
  SESSIONS_DIR,
  dedupWebuiSockets,
  isPidAlive,
  cwdToProjectDir,
  transcriptPathOf,
  recoverCwdFromProjDir,
  getTmuxPaneMapAsync, setTmuxPanes, useTmuxReader, TMUX_PANE_ARGS, tmuxPathAsync, TMUX_NO_REPLY_MS, TMUX_NO_REPLY_MAX_MS,
  tmuxOnPath,
  landTmuxMounts,   // B-1425 (cure): the async landing of a tmux on an NFS / home PATH dir
  findTmuxTargetAsync,
  isProcessClaudeAsync,
  isLockClaude,
  execFileP,
  isSubagentMessage,
  isDisplayMessage,
  readJsonlTailIds,
  claimJsonls,
  findSessionJsonlPath,
  parseSessionJsonl,
  getHistorySessionId, historyWaitersOf, noteAwaiting, noteReadable,
  SessionMessages,
  discoverClaudeSessions, lastWalkSteps,
};
