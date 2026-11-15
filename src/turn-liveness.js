'use strict';
// THE TURN'S LIFE, JUDGED — lane turn-never-silent (2026-11-15; the owner: «对了你能解决一下 agy 动不动就卡住再也不动的问题吗？»).
// LAW L1: NO TURN OF ANY HARNESS IS SILENT WITHOUT A BOUND. Each harness's row (src/backend-caps.js `liveness`) declares how
// its turn's life is witnessed; THIS module is the one verdict over those witnesses. PURE: it imports nothing — every fact
// is handed in (the hub's watch, src/server/turn-watch.js, reads them; the suites hand in their own).
//
// WHAT WAS SEEN (the diagnosis, int359/agy-stuck: six silences in two weeks, all ONE shape): the CLI's command tool opened
// a step, its result never came, the CLI stayed alive and wrote nothing, and the turn stayed open — 3 h 47 min, 6 h 06 min,
// 27 h 45 min — until a person pressed Stop. Nothing anywhere bounded it.
//
// WHAT COUNTS AS WORKING (MEASURED on this box's live sessions, 2026-11-12, a read-only sampler — queued-is-not-woke/probe/
// life): a stuck Antigravity turn wrote nothing for 27 minutes and its ONE child used 0 CPU ticks the whole time, while
// agy ITSELF used 22–58 ticks/min and read 12–49 KB/min — what an idle agy does (2–16 ticks, 10–49 KB). So:
//   · the CLI's OWN counters prove nothing and are never read here — only the processes BELOW the CLI are;
//   · a child merely EXISTING proves nothing either (the stuck turn had one) — a process works when its counters MOVE:
//     CPU ticks (utime + stime), I/O bytes (rchar + wchar), or it was born / it ended between two readings;
//   · no byte rate of a CLI that is generating is a witness (主开发's ruling Q1: one sample is not a law, and a threshold
//     taken from it would turn a slow day into a false «stuck») — a CLI generating with nothing below it reads «silent»,
//     which says only the facts: nothing written, nothing working, the CLI running.
//
// THE STATES (one verdict, every harness):
//   'none'              no turn; the turn waits on the person (the chip's own fact); not silent for the bound yet; or the
//                       processes not yet read twice for this turn (why: 'reading')
//   'busy'              nothing written for the bound, but a process below the CLI worked within it — nothing is said
//   'stuck-on-command'  a tool step is open, and nothing was written and nothing below the CLI worked, for the bound — the
//                       shape of all six silences; every door («End the command» among them), and the ONLY state a
//                       by-itself ending may ever touch (held for the owner's word)
//   'silent'            no tool step is open, and nothing was written and nothing worked, for the bound — «no output for N
//                       minutes; the CLI is running»: Keep waiting and Stop the turn only; never ended by itself
//   'unknown'           nothing written for the bound, and its processes cannot be read here (why: 'no-procfs' — a paired
//                       machine, a hub without /proc; 'undeclared' — a contributed harness whose row declares no witness)
// The bound is a setting (default ten minutes). «Keep waiting» (the person's press) restarts it: the turn is judged again
// only after another FULL bound with nothing written and nothing working (主开发's ruling Q3).
//
// THE BY-ITSELF ENDING (the owner's word «可以», 2026-11-15 03:02Z): ONLY a command that is stuck — a tool step open,
// nothing written, nothing below the CLI working — for a SECOND bound (a setting, default thirty minutes; never under the
// first) is ended by the hub: the same act as the «End the command» door; the agent gets that tool step's failure and
// goes on in the same turn. `endDue` says when. A long task that is working is never touched (busy is never due), the
// «silent» state (no tool open) is never ended by itself, and «Keep waiting» restarts the thirty (the press is in the
// silence's clock, so the still clock starts after it too).

const DEFAULT_BOUND_MIN = 10;
const DEFAULT_END_MIN = 30;       // the by-itself ending's bound (the owner's thirty)
const MIN_BOUND_MIN = 2;          // under two minutes a healthy tool run would be named
const MAX_BOUND_MIN = 24 * 60;
const READ_EVERY_MS = 60 * 1000;  // the watch reads the processes once a minute
const TREE_MAX = 256;             // processes read in ONE session's tree a reading — a cut is said, and never «still»

const STATES = Object.freeze(['none', 'busy', 'stuck-on-command', 'silent', 'unknown']);
/** the states that SPEAK (L2: in the conversation and as one For-you item) */
const SPEAKING = Object.freeze(['stuck-on-command', 'silent', 'unknown']);

// THE ROW'S VOCABULARY (src/backend-caps.js `liveness`) — closed; the census (scripts/test-harness-contract.mjs) holds
// every built-in row to it, and a harness without a row is red there.
const ROW_VALUES = Object.freeze({
  // «written»: a line the CLI ITSELF wrote on stdout, stamped by the harness's WRAPPER (its descriptor's `wrapper`) in the
  // session's sidecar — the only place that tells the CLI's own line from the wrapper's echoes (queue_changed, the user
  // echo, notices), and it survives a hub restart (the wrapper keeps running in dtach)
  wrote: Object.freeze(['wrapper-stamp']),
  // «working»: the processes BELOW the CLI's pid (the sidecar's childPid) — their counters moving between two readings;
  // never the CLI's own
  working: Object.freeze(['tree-below-cli']),
  // the open tool step: the conversation's own running tool card (its name is what L2 says)
  openTool: Object.freeze(['tool-card']),
  // what Stop does to the CLI: 'restart' (the CLI process is ended and started again on the same conversation — agy, ACP)
  // or 'interrupt' (the CLI is asked to end its turn and keeps running — claude, codex)
  stop: Object.freeze(['restart', 'interrupt']),
  // does the CLI bound its OWN commands? 'cli' = it does (claude's command tool: 2 min by default, 10 at most); 'none' = it
  // does not (agy: no tool timeout in its help, its turn timeout pinned to 0 by our wrapper) — the rules injected for that
  // harness gain one line (src/agent-cli-registry.js STANDING_RULES 'command-bounds'); 'unverified' = not read here
  commandBound: Object.freeze(['cli', 'none', 'unverified']),
});
const ROW_KEYS = Object.freeze(Object.keys(ROW_VALUES));
/** a harness with no turn at all (a terminal) declares exactly this */
const NO_TURN = 'no-turn';

/** Is this a lawful `liveness` row? → null when it is, else the reason (the census's words). `turnState` is the same
 *  row's: a row with no turn concept (null) must declare NO_TURN, and only it may. */
function rowProblem(row, turnState) {
  if (row === NO_TURN) return turnState === null ? null : `declares '${NO_TURN}' but its turnState is ${JSON.stringify(turnState)}`;
  if (turnState === null) return `has no turn (turnState null) but does not declare '${NO_TURN}'`;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 'declares no liveness row';
  const keys = Object.keys(row);
  for (const k of keys) if (!ROW_KEYS.includes(k)) return `an unknown key '${k}'`;
  for (const k of ROW_KEYS) {
    if (!(k in row)) return `no '${k}'`;
    if (!ROW_VALUES[k].includes(row[k])) return `'${k}' is ${JSON.stringify(row[k])} — not one of ${ROW_VALUES[k].join(' / ')}`;
  }
  return null;
}

/** the bound in ms from the setting's minutes (a number, or a numeric string); anything else is the default */
function boundMsOf(minutes) {
  const n = typeof minutes === 'string' && minutes.trim() !== '' ? Number(minutes) : minutes;
  const m = typeof n === 'number' && Number.isFinite(n) ? Math.min(MAX_BOUND_MIN, Math.max(MIN_BOUND_MIN, n)) : DEFAULT_BOUND_MIN;
  return Math.round(m * 60 * 1000);
}

/** the by-itself ending's bound in ms from its setting's minutes: 'off' (or false) = never (null); a number is clamped to
 *  [the told bound, a day] — a command is never ended before it was told; anything else is the default thirty minutes */
function endBoundMsOf(minutes, boundMs = boundMsOf(DEFAULT_BOUND_MIN)) {
  if (minutes === false || minutes === 'off' || minutes === 0 || minutes === '0') return null;   // the setting's 0 = never
  const n = typeof minutes === 'string' && minutes.trim() !== '' ? Number(minutes) : minutes;
  const m = typeof n === 'number' && Number.isFinite(n) ? n : DEFAULT_END_MIN;
  return Math.round(Math.min(MAX_BOUND_MIN * 60 * 1000, Math.max(Number(boundMs) || 0, MIN_BOUND_MIN * 60 * 1000, m * 60 * 1000)));
}

/** /proc/<pid>/stat → {pid, comm, state, ppid, ticks, startTicks} | null. The command name sits in parentheses and may
 *  itself hold spaces and parentheses, so the fields are read after the LAST ')'. ticks = utime + stime (fields 14, 15);
 *  startTicks = the process's birth on the boot clock (field 22) — with the pid, a process's identity. */
function parseStat(text) {
  if (typeof text !== 'string') return null;
  const open = text.indexOf('('), close = text.lastIndexOf(')');
  if (open < 1 || close < open) return null;
  const pid = Number(text.slice(0, open).trim());
  const r = text.slice(close + 2).split(' ');
  // r[0] = state (field 3), r[1] = ppid (4), r[11] = utime (14), r[12] = stime (15), r[19] = starttime (22)
  if (!Number.isInteger(pid) || r.length < 20) return null;
  const ppid = Number(r[1]), ut = Number(r[11]), st = Number(r[12]), start = Number(r[19]);
  if (![ppid, ut, st, start].every(Number.isFinite)) return null;
  return { pid, comm: text.slice(open + 1, close), state: r[0], ppid, ticks: ut + st, startTicks: start };
}

/** /proc/<pid>/io → {rchar, wchar} | null (the file is unreadable for another user's process: null, never 0) */
function parseIo(text) {
  if (typeof text !== 'string') return null;
  const get = (k) => { const m = new RegExp(`^${k}:\\s*(\\d+)\\s*$`, 'm').exec(text); return m ? Number(m[1]) : null; };
  const rchar = get('rchar'), wchar = get('wchar');
  return rchar === null || wchar === null ? null : { rchar, wchar };
}

/** ONE READING of the processes below a CLI → {at, cut, procs: Map<'pid:startTicks', {ticks, io}>} from a list of
 *  {pid, startTicks, ticks, io} (the CLI itself is never in the list — the reader starts below it). */
function readingOf(at, list, cut = false) {
  const procs = new Map();
  for (const p of list || []) {
    if (!p || !Number.isInteger(p.pid) || !Number.isFinite(p.startTicks)) continue;
    procs.set(`${p.pid}:${p.startTicks}`, { ticks: Number(p.ticks) || 0, io: p.io && Number.isFinite(p.io.rchar) && Number.isFinite(p.io.wchar) ? { rchar: p.io.rchar, wchar: p.io.wchar } : null });
  }
  return { at: Number(at) || 0, cut: !!cut, procs };
}

/** Did anything below the CLI WORK between two readings? → true | false | null (null: no earlier reading to compare).
 *  Work = a process born (a key in `cur` only — a reused pid with another birth is another process), a process ended
 *  (in `prev` only), CPU ticks that grew, I/O bytes that grew. A reading that was CUT (more than TREE_MAX processes) is
 *  never «still»: what was not read cannot be said idle. */
function treeWorked(prev, cur) {
  if (!prev || !cur || !(prev.procs instanceof Map) || !(cur.procs instanceof Map)) return null;
  if (prev.cut || cur.cut) return true;
  for (const k of cur.procs.keys()) if (!prev.procs.has(k)) return true;
  for (const [k, was] of prev.procs) {
    const now = cur.procs.get(k);
    if (!now) return true;
    if (now.ticks > was.ticks) return true;
    if (now.io && was.io && (now.io.rchar > was.io.rchar || now.io.wchar > was.io.wchar)) return true;
  }
  return false;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** THE VERDICT (L1). Every fact handed in:
 *   row            capsOf(backend).liveness — an object (the vocabulary above), NO_TURN, or null (undeclared)
 *   streaming      a turn is open (the one flag every gate reads)
 *   waitingOnUser  the turn waits on the person (src/turn-state.js waitingOnUser — the chip's own fact)
 *   openedAt       the turn's known opening (ms), or 0
 *   lastWroteAt    the CLI's own last line (its wrapper's stamp), or 0
 *   keptAt         the person's last «Keep waiting» on THIS turn, or 0
 *   treeReadable   false: the processes cannot be read here
 *   readings       how many readings of the processes below the CLI the watch holds for this turn
 *   workSeenAt     the last reading that showed work below the CLI, or 0
 *   openTool       {name, since} of the open tool step, or null
 *   cliAlive       true / false / null (not known)
 *   boundMs        the told bound; endBoundMs the by-itself ending's (null = never; endBoundMsOf)
 *   now
 * → {state, why, since, quietMs, stillSince, endDue, tool, toolSince, cliAlive}: `since` = nothing WRITTEN since
 *   (quietMs = now − since); `stillSince` (the speaking states only) = nothing WORKING below the CLI since; `endDue` =
 *   «stuck on a command» still for the by-itself ending's bound — the ONLY state that is ever due. */
function livenessVerdict(f = {}) {
  const now = num(f.now) || 0;
  const boundMs = num(f.boundMs) || boundMsOf(DEFAULT_BOUND_MIN);
  const tool = f.openTool && typeof f.openTool.name === 'string' && f.openTool.name ? f.openTool.name : null;
  const toolSince = tool ? num(f.openTool.since) || null : null;
  const cliAlive = f.cliAlive === true ? true : f.cliAlive === false ? false : null;
  const endBoundMs = f.endBoundMs === null ? null : num(f.endBoundMs) || endBoundMsOf(DEFAULT_END_MIN, boundMs);
  const out = (state, why, since = 0, stillSince = 0) => ({ state, why, since: since || null, quietMs: since ? Math.max(0, now - since) : 0, stillSince: stillSince || null,
    endDue: state === 'stuck-on-command' && endBoundMs !== null && now - stillSince >= endBoundMs, tool, toolSince, cliAlive });
  if (!f.streaming) return out('none', 'no-turn');
  if (f.row === NO_TURN) return out('none', 'no-turn');
  if (f.waitingOnUser) return out('none', 'asks-the-person');
  // nothing WRITTEN since — the CLI's own last line, the turn's opening, the person's «Keep waiting», whichever is latest
  const quietFrom = Math.max(num(f.lastWroteAt), num(f.openedAt), num(f.keptAt));
  if (!quietFrom) return out('none', 'no-clock');
  if (now - quietFrom < boundMs) return out('none', 'not-yet', quietFrom);
  if (!f.row || typeof f.row !== 'object') return out('unknown', 'undeclared', quietFrom);
  if (f.treeReadable === false) return out('unknown', 'no-procfs', quietFrom);
  if (!(Number(f.readings) >= 2)) return out('none', 'reading', quietFrom);
  // nothing WORKING since — the silence AND the last work below the CLI, whichever is latest
  const stillFrom = Math.max(quietFrom, num(f.workSeenAt));
  if (now - stillFrom < boundMs) return out('busy', 'working', quietFrom);
  return tool ? out('stuck-on-command', 'command', quietFrom, stillFrom) : out('silent', 'no-command', quietFrom, stillFrom);
}

module.exports = {
  DEFAULT_BOUND_MIN, DEFAULT_END_MIN, MIN_BOUND_MIN, MAX_BOUND_MIN, READ_EVERY_MS, TREE_MAX, STATES, SPEAKING, ROW_VALUES, ROW_KEYS, NO_TURN,
  rowProblem, boundMsOf, endBoundMsOf, parseStat, parseIo, readingOf, treeWorked, livenessVerdict,
};
