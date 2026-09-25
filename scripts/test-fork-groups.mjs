#!/usr/bin/env node
// A FORK LANDS IN ITS SOURCE'S TASK GROUPS (owner 2026-09-25: "fork的会话不会
// 自动分配到和fork之前的会话相同的group里"). Fast, DOM-free, zero network.
//
//   ① the PURE plan (src/lib/fork-groups.js): two groups ⇒ spawned into the
//      first + pending-bound to the second; none ⇒ no taskId; archived /
//      duplicate / malformed ids dropped.
//   ② the PURE pending-bind verdict: a fork waits PAST its source's id (the
//      live row carries the parent's id until the harness announces the
//      fork's own) — then binds EVERY group; a plain entry binds on the first
//      id; merge adds; the cap sweep keeps a live fork that is still waiting.
//   ③ DRIVEN: the REAL `_doForkSession` body (extracted from
//      src/lib/session-lifecycle.js, its imports injected) run for the card
//      fork, the terminal-mode fork (forkSession's non-chat branch) and a
//      fork-at-message handle; the REAL `_registerPendingTaskBind` /
//      `_processPendingTaskBinds` (from src/lib/sidebar-tasks.js) run against
//      a stub sidebar across the source-id → fork-id transition.
//   ④ WIRING pins + a census: every fork entry point funnels into
//      `_doForkSession`, it is the ONLY `fork: true` create in the client,
//      and the `created` handler registers taskId + extraTaskBinds with the
//      fork's notId.
//   ⑤ NEGATIVE CONTROLS (scripts/mutant-copy.mjs): a copy of
//      session-lifecycle.js without the plan, and a copy of fork-groups.js
//      without the fork-source guard, each turn ③ RED.
//   ⑥ THE TERMINAL-MODE FORK, END TO END over the real modules (verifier
//      2026-09-25: terminal mode has no stream parser, and the lock capture
//      was gated on an EMPTY id, so the fork's row kept its parent's id for
//      life and the queue waited for ever): the real plan → a real
//      TaskGroupManager in a scratch data dir → the real lock capture
//      (src/claude-lock-capture.js) over real lock files in a scratch dir →
//      the real client queue → `groupsForSession` for the FORK's own key names
//      BOTH groups with no spawn group to lean on. The parent-side race with
//      the locks fed in BOTH orders (pure) and file-backed with the fork's
//      lock named to sort first. THE PID WITNESS (round 2): two sessions
//      created together whose later CLI writes first (both kinds, both
//      orders), stray locks (external / dead / stale pid name / the seed /
//      a nested claude / a tie / no witness), a lock landing after the old
//      17 s window (the armed chain), REAL process trees over the real /proc
//      (a shim at depth 2, a dead pid, a live external pid), and the restored
//      fork flag of an adopted chat fork. ROUND 3: the WRITER witness over a
//      real wrapper → claude.js → sleep tree (a stale lock under the sleep's
//      pid, with a foreign procStart and with none, fresh AND restored), a
//      restored pending CHAT fork adopting from its lock, the no-sidecar rule
//      with ONE eligible lock, the boot dedup through the real
//      dedupWebuiSockets, the real chat consumer over a fake pty (the glued
//      \e[H\e[J preamble, a torn record reported), the real boot-restore
//      re-opening two daemon-pipe metas (armLockCapture spied), and every
//      wiring pin read over CODE ONLY (comments stripped, with its control).
//      ROUND 4: the NEAREST witnessed lock is judged, never skipped for a
//      deeper one (pure: the seed / a claimed id / a pre-creation file at depth
//      1 beside a depth-3 lock; REAL tree wrapper → claude.js → sh → claude.js
//      where a record misread as a pending fork answers nothing and a genuine
//      pending fork adopts its CLI's own lock), the pre-2.369.134 adopted chat
//      fork shape owns its id, and dtach's real exit bytes through the
//      consumer are no dropped record (the telemetry lane capped like the log).
//   ⑦ NEGATIVE CONTROLS for ⑥ (scripts/mutant-copy.mjs, twenty copies): the
//      shipped empty-id gate, the seed as a claim, the witness removed,
//      excludeId removed, the start floor removed, the 15-attempt cap put
//      back, the flag restored verbatim; round 3: the writer witness removed,
//      the no-sidecar rule inverted, the chat exclusion put back, every id a
//      dedup claim, the preamble strip removed, the drop report removed, the
//      R6 re-open's arm commented out; round 4: the one-pass filter back (q),
//      no source ⇒ always pending (s), the `[[{]` prefix with no banner rule
//      (r), the telemetry cap removed (t) — each RED. The SIGKILL-restart itself
//      (real server, real dtach, a fake CLI) is scripts/test-fork-restore.mjs
//      (heavy).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fixtureSid, scratch, scratchHome } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

// THIS PROCESS IS RE-HOMED before any fixture exists (test-fixture-isolation
// (c): a suite that mints fixtureSid() isolates its own process): HOME and
// os.homedir point at a scratch home, cleaned on exit AND on signals, and the
// real ~/.claude/projects is censused at the end.
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const { fixtureLitter } = createRequire(import.meta.url)('../src/fixture-guard.js');
const fakeHome = scratchHome('fork-groups-home', fs);
const cleanupHome = () => { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanupHome);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanupHome(); process.exit(143); });
process.env.HOME = fakeHome;
os.homedir = () => fakeHome;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const FG_PATH = path.join(REPO, 'src/lib/fork-groups.js');
const FG = await import(pathToFileURL(FG_PATH).href);
const { forkGroupPlan, pendingBindVerdict, mergePendingBind, sweepPendingBinds, PENDING_BIND_CAP } = FG;

const PARENT = fixtureSid('f0a1');
const FORK = fixtureSid('f0a2');
const G = (id, extra = {}) => ({ id, name: `Group ${id}`, sessions: [`claude:${PARENT}`], ...extra });

console.log('① forkGroupPlan');
{
  const p = forkGroupPlan([G('T-alice'), G('T-bob')]);
  ok(p.taskId === 'T-alice' && JSON.stringify(p.pendingBinds) === '["T-bob"]', 'source in two groups ⇒ spawned into the first, pending-bound to the second', JSON.stringify(p));
  const n = forkGroupPlan([]);
  ok(n.taskId === null && n.pendingBinds.length === 0, 'source in no group ⇒ no taskId, nothing pending', JSON.stringify(n));
  ok(forkGroupPlan(undefined).taskId === null, 'no store (sidebar not loaded) ⇒ no taskId, never a throw');
  const a = forkGroupPlan([G('T-old', { archived: true }), G('T-live')]);
  ok(a.taskId === 'T-live' && a.pendingBinds.length === 0, 'an ARCHIVED group is not inherited (the next live one is the spawn group)', JSON.stringify(a));
  const d = forkGroupPlan([G('T-x'), G('T-x'), { id: 'not a task id' }, null, 'T-y']);
  ok(d.taskId === 'T-x' && JSON.stringify(d.pendingBinds) === '["T-y"]', 'duplicates / malformed / null dropped; bare ids accepted', JSON.stringify(d));
}

console.log('② pendingBindVerdict / merge / sweep');
{
  const e = mergePendingBind(undefined, ['T-alice', 'T-bob'], PARENT);
  ok(e && e.notId === PARENT && e.taskIds.length === 2, 'a fork entry carries its source id', JSON.stringify(e));
  const w = pendingBindVerdict(e, { id: 'w1', backend: 'claude', backendSessionId: PARENT });
  ok(w.wait && w.why === 'fork-source-id', 'the live row still carries the PARENT id ⇒ wait (binding now would tag the parent and consume the entry)', JSON.stringify(w));
  ok(pendingBindVerdict(e, undefined).wait && pendingBindVerdict(e, { id: 'w1' }).wait, 'not listed / no id yet ⇒ wait');
  const b = pendingBindVerdict(e, { id: 'w1', backend: 'claude', backendSessionId: FORK });
  ok(!b.wait && b.sessionKey === `claude:${FORK}` && b.taskIds.join() === 'T-alice,T-bob', 'the fork\'s own id appears ⇒ bind EVERY group to the fork\'s key', JSON.stringify(b));
  const cx = pendingBindVerdict(mergePendingBind(null, ['T-a'], PARENT), { id: 'w2', backend: 'codex', backendSessionId: FORK });
  ok(!cx.wait && cx.sessionKey === `codex:${FORK}`, 'the key names the live row\'s backend (codex fork)');
  const plain = mergePendingBind(null, 'T-new');
  ok(plain.notId === null && !pendingBindVerdict(plain, { id: 'w3', backend: 'claude', claudeSessionId: FORK }).wait, 'a plain new-session-in-group entry binds on the FIRST id (unchanged behaviour; a bare string is accepted)');
  const m = mergePendingBind(mergePendingBind(null, ['T-a'], PARENT), ['T-a', 'T-b']);
  ok(m.taskIds.join() === 'T-a,T-b' && m.notId === PARENT, 'a second registration ADDS (the old one-slot Map replaced) and keeps the guard', JSON.stringify(m));
  ok(mergePendingBind(null, []) === null, 'nothing to bind ⇒ no entry');
  const ids = Array.from({ length: PENDING_BIND_CAP + 1 }, (_, i) => `w${i}`);
  const drop = sweepPendingBinds(ids, ['w0']);
  ok(drop.length === PENDING_BIND_CAP && !drop.includes('w0'), `past the cap (${PENDING_BIND_CAP}) only GONE sessions are swept — a live fork still waiting for its first input keeps its entry`);
  ok(sweepPendingBinds(ids.slice(0, PENDING_BIND_CAP), []).length === 0, 'at or under the cap nothing is swept');
  const gone = pendingBindVerdict({ ...e, seen: true }, undefined);
  ok(gone.drop === true && gone.why === 'gone', 'an entry LISTED once and now gone from the live list (the fork died before its own id) ⇒ dropped at once, not at the cap', JSON.stringify(gone));
  ok(pendingBindVerdict(e, undefined).why === 'not-listed' && !pendingBindVerdict(e, undefined).drop, 'never listed yet (created ⇢ first broadcast) ⇒ still waits');
  ok(mergePendingBind({ ...e, seen: true }, ['T-c']).seen === true, 'a later registration keeps the seen mark');
}

// ── source extraction: a method body by brace depth (strings in these bodies
// are balanced; the same reader test-codex-effort-meta uses) ──
function bodyFrom(src, startIdx) {
  const open = src.indexOf(') {', startIdx) + 2;
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(startIdx, k + 1);
  }
  return null;
}
function extractMethod(src, marker) {
  const i = src.indexOf(marker);
  return i < 0 ? null : bodyFrom(src, i);
}

async function driveFork(lifeSrc, fg) {
  const text = extractMethod(lifeSrc, 'async _doForkSession(');
  if (!text) return { error: 'no _doForkSession' };
  const fn = new Function('forkGroupPlan', 'worktreePick', `return async function ${text.replace(/^async /, '')};`)(
    fg.forkGroupPlan, ({ saved, live }) => saved ?? live ?? false);
  const run = async (sessionInfo, tasksOf, ...args) => {
    const calls = [];
    const self = {
      maybeOfferHarnessService: async () => {},
      _defaultForkName: (s) => `${s.webuiName || 'Session'} (forked)`,
      settings: { get: () => 'chat' },
      sidebar: { getSessionConfig: () => ({}), _getSessionTasks: (s) => tasksOf(s) },
      createSession: (o) => { calls.push(o); },
    };
    await fn.call(self, sessionInfo, ...args);
    return calls[0];
  };
  return { run };
}

function driveSidebar(tasksSrc, fg, taskBind = null) {
  const reg = extractMethod(tasksSrc, 'proto._registerPendingTaskBind = function(');
  const proc = extractMethod(tasksSrc, 'proto._processPendingTaskBinds = function(');
  if (!reg || !proc) return null;
  const mk = (t) => new Function('mergePendingBind', 'pendingBindVerdict', 'sweepPendingBinds',
    `return ${t.replace(/^proto\.\w+ = /, '')};`)(fg.mergePendingBind, fg.pendingBindVerdict, fg.sweepPendingBinds);
  const bound = [];
  const sb = { _pendingTaskBinds: new Map(), _webuiSessions: [], _taskBind: (id, key) => { bound.push(`${id}@${key}`); if (taskBind) taskBind(id, key); } };
  sb._registerPendingTaskBind = mk(reg); sb._processPendingTaskBinds = mk(proc);
  return { sb, bound };
}

// The owner's shape: a card in two groups, forked three ways.
async function forkLegs(lifeSrc, tasksSrc, fg, label) {
  const res = {};
  const d = await driveFork(lifeSrc, fg);
  if (d.error) return { error: d.error };
  const store = [G('T-alice'), G('T-bob')];
  const tasksOf = (s) => ((s.backendSessionId || s.sessionId) === PARENT ? store : []);
  const card = { backend: 'claude', backendSessionId: PARENT, sessionId: PARENT, cwd: '/tmp/vs-fixture/proj', webuiName: 'Alice', webuiMode: 'chat' };
  const c1 = await d.run(card, tasksOf, 'hello', null, '');
  res.card = c1;
  const c2 = await d.run({ ...card, webuiMode: 'terminal' }, tasksOf, '');
  res.terminal = c2;
  const c3 = await d.run({ backend: 'claude', backendSessionId: PARENT, cwd: card.cwd, webuiName: 'Alice', webuiMode: 'chat' }, tasksOf, 'hi', 'uuid-1', '');
  res.atMessage = c3;
  const c4 = await d.run({ ...card, backendSessionId: FORK, sessionId: FORK }, tasksOf, 'x');
  res.none = c4;
  // then the created handler's registration + the active-sessions transition
  const s = driveSidebar(tasksSrc, fg);
  if (s && c1) {
    s.sb._registerPendingTaskBind('w-fork', [c1.taskId, ...(c1.extraTaskBinds || [])].filter(Boolean), { notId: c1.backendSessionId });
    s.sb._webuiSessions = [{ id: 'w-fork', backend: 'claude', backendSessionId: PARENT }];
    s.sb._processPendingTaskBinds();
    res.beforeAdopt = [...s.bound];
    s.sb._webuiSessions = [{ id: 'w-fork', backend: 'claude', backendSessionId: FORK }];
    s.sb._processPendingTaskBinds();
    res.afterAdopt = [...s.bound];
    res.leftover = s.sb._pendingTaskBinds.size;
  }
  return res;
}
const forkJudged = (r) => ({
  card: !!r.card && r.card.taskId === 'T-alice' && JSON.stringify(r.card.extraTaskBinds) === '["T-bob"]' && r.card.fork === true,
  terminal: !!r.terminal && r.terminal.taskId === 'T-alice' && JSON.stringify(r.terminal.extraTaskBinds) === '["T-bob"]',
  atMessage: !!r.atMessage && r.atMessage.taskId === 'T-alice' && r.atMessage.forkAtUuid === 'uuid-1',
  none: !!r.none && !r.none.taskId && (r.none.extraTaskBinds || []).length === 0,
  wait: Array.isArray(r.beforeAdopt) && r.beforeAdopt.length === 0,
  bind: Array.isArray(r.afterAdopt) && r.afterAdopt.join() === `T-alice@claude:${FORK},T-bob@claude:${FORK}` && r.leftover === 0,
});

console.log('③ DRIVEN — the real _doForkSession + the real pending-bind queue');
const lifeSrc = rd('src/lib/session-lifecycle.js');
const tasksSrc = rd('src/lib/sidebar-tasks.js');
{
  const r = await forkLegs(lifeSrc, tasksSrc, FG, 'real');
  const j = forkJudged(r);
  ok(j.card, 'card Fork… ⇒ createSession({fork:true, taskId: first group, extraTaskBinds: [the rest]})', JSON.stringify(r.card && { taskId: r.card.taskId, extra: r.card.extraTaskBinds }));
  ok(j.terminal, 'terminal-mode fork (forkSession\'s non-chat branch calls the same method) ⇒ the same plan');
  ok(j.atMessage, 'fork-at-message (the chat view\'s hand-built handle, no webuiId) ⇒ the same plan');
  ok(j.none, 'a source in no group ⇒ no taskId, nothing extra');
  ok(j.wait, 'while the fork\'s live row still carries the PARENT id nothing is bound (the entry is kept)', JSON.stringify(r.beforeAdopt));
  ok(j.bind, 'the fork\'s own id appears ⇒ bound to BOTH groups under the fork\'s key, entry consumed', JSON.stringify(r.afterAdopt));
}

console.log('④ WIRING + census');
{
  ok(/if \(mode !== 'chat'\) \{ this\._doForkSession\(sessionInfo, ''\); return; \}/.test(lifeSrc), 'terminal-mode forkSession goes through _doForkSession');
  ok(/forkFromMessage\(sessionInfo, messageUuid\) \{\s*this\._openForkDialog\(/.test(lifeSrc) && /this\._doForkSession\(info, text, at, customName\)/.test(rd('src/lib/app.js')),
    'fork-at-message and the Fork dialog\'s send button both land in _doForkSession');
  const libDir = path.join(REPO, 'src/lib');
  const forkCreates = [], doForkCallers = [];
  for (const f of fs.readdirSync(libDir).filter((n) => n.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(libDir, f), 'utf8');
    // every createSession({...}) object literal that names a `fork` key
    for (const m of s.matchAll(/createSession\(\{/g)) {
      let depth = 0, end = -1;
      for (let k = m.index + 'createSession('.length; k < s.length; k++) {
        if (s[k] === '{') depth++;
        else if (s[k] === '}' && --depth === 0) { end = k; break; }
      }
      const obj = s.slice(m.index, end + 1);
      if (/\bfork\s*:/.test(obj)) forkCreates.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
    for (const m of s.matchAll(/_doForkSession\(/g)) doForkCallers.push(f);
  }
  ok(forkCreates.length === 1 && forkCreates[0].startsWith('session-lifecycle.js:') && lifeSrc.slice(0, lifeSrc.indexOf('async _doForkSession(')).split('\n').length < Number(forkCreates[0].split(':')[1]), 'CENSUS: exactly ONE client createSession({…}) names a `fork` key (the one in _doForkSession) — a second fork path would bypass the plan', forkCreates.join(' '));
  ok(doForkCallers.every((f) => f === 'session-lifecycle.js' || f === 'app.js') && doForkCallers.length >= 3, 'CENSUS: _doForkSession is called only from session-lifecycle.js / app.js', doForkCallers.join(' '));
  ok(/const bindIds = \[taskId, \.\.\.\(extraTaskBinds \|\| \[\]\)\]\.filter\(Boolean\);/.test(lifeSrc)
    && /this\.sidebar\?\._registerPendingTaskBind\?\.\(msg\.sessionId, bindIds, \{ notId: fork \? \(backendSessionId \|\| resumeId \|\| null\) : null \}\);/.test(lifeSrc),
    'the `created` handler registers taskId + extraTaskBinds, guarded by the fork source id');
  ok(/fork: fork\|\|undefined, cols:120, rows:30, reqId,\n\s+taskId: taskId \|\| undefined,/.test(lifeSrc)
    && /_initialGroupId: \(typeof data\.taskId === 'string' && \/\^T-\[\\w-\]\{1,60\}\$\/\.test\(data\.taskId\)\) \? data\.taskId : null,/.test(rd('src/ws-create.js')),
    'the ws create message carries `taskId` and ws-create turns it into `_initialGroupId` (the task context from the first turn — no spawn ENV carries it)');
  ok(!/VIBESPACE_TASK_ID/.test(fs.readFileSync(FG_PATH, 'utf8').replace(/VIBESPACE_TASK_ID[\s/]+has had no producer/, '')) && !/spawns VIBESPACE_TASK_ID/.test(lifeSrc),
    'no text claims a VIBESPACE_TASK_ID spawn env (its producer left in the Task refactor P2)');
  ok(/import \{ mergePendingBind, pendingBindVerdict, sweepPendingBinds \} from '\.\/fork-groups\.js';/.test(tasksSrc)
    && /import \{ forkGroupPlan \} from '\.\/fork-groups\.js';/.test(lifeSrc), 'both consumers import the ONE pure module');
  ok(!/^import|require\(/m.test(fs.readFileSync(FG_PATH, 'utf8')), 'fork-groups.js imports nothing (PURE)');
  ok(/if \(!t\.sessions\.includes\(key\)\) \{[\s\S]{0,120}this\._notify\(\);/.test(rd('src/task-groups.js')),
    'multi-client: a bind goes through the store\'s bind(), which notifies (tasks-updated broadcast) — nothing new needed');
}

console.log('⑤ NEGATIVE CONTROLS (mutant copies outside the tree)');
{
  const M = mutantCopies('fork-groups', REPO);
  // (a) session-lifecycle.js without the plan: the pre-fix create
  const noPlan = lifeSrc
    .replace(/      taskId: forkGroups\.taskId \|\| undefined,\n      extraTaskBinds: forkGroups\.pendingBinds,\n/, '');
  ok(noPlan !== lifeSrc, 'control (a) edit applied');
  const pa = M.write('src/lib/session-lifecycle.js', noPlan, 'noplan');
  const ra = await forkLegs(fs.readFileSync(pa, 'utf8'), tasksSrc, FG, 'noplan');
  const ja = forkJudged(ra);
  ok(!ja.card && !ja.terminal && !ja.atMessage, 'control (a): a fork without the plan is spawned into NO group ⇒ ③ RED (the owner\'s bug, reproduced)');
  // (b) fork-groups.js without the fork-source guard
  const fgSrc = fs.readFileSync(FG_PATH, 'utf8');
  const noGuard = fgSrc.replace("  if (entry?.notId && bsid === entry.notId) return { wait: true, why: 'fork-source-id' };\n", '');
  ok(noGuard !== fgSrc, 'control (b) edit applied');
  const pb = M.write('src/lib/fork-groups.js', noGuard, 'noguard');
  const FGb = await import(pathToFileURL(pb).href);
  const rb = await forkLegs(lifeSrc, tasksSrc, FGb, 'noguard');
  const jb = forkJudged(rb);
  ok(!jb.wait && !jb.bind, 'control (b): without the guard the PARENT is bound and the entry consumed — the fork is never tagged ⇒ ③ RED', JSON.stringify({ before: rb.beforeAdopt, after: rb.afterAdopt }));
  globalThis.__forkMutants = M;
}

// ── ⑥ the terminal-mode fork, end to end over the real modules ──
const require = createRequire(import.meta.url);
const LC_PATH = path.join(REPO, 'src/claude-lock-capture.js');
const LC = require(LC_PATH);
const { readPpid } = require(path.join(REPO, 'src/cli-identity.js'));
const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
const SCR = scratch('fork-groups');
fs.rmSync(SCR, { recursive: true, force: true });
fs.mkdirSync(SCR, { recursive: true });
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch {} });
const CWD = path.join(SCR, 'proj'); // a synthetic cwd, never a real one
let runSeq = 0;
// the pid witness as a table: pid → hops to THIS session's wrapper (0 = not ours)
const depthOf = (table) => (pid) => table[pid] || 0;

async function terminalForkChain(lc) {
  const dir = path.join(SCR, `run-${++runSeq}`);
  const dataDir = path.join(dir, 'data'), lockDir = path.join(dir, 'sessions');
  fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(lockDir, { recursive: true });
  const tgm = new TaskGroupManager({ dataDir });
  const alice = tgm.create({ title: 'Alice group' }), bob = tgm.create({ title: 'Bob group' });
  tgm.bind(alice.id, `claude:${PARENT}`); tgm.bind(bob.id, `claude:${PARENT}`);
  const out = { ids: [alice.id, bob.id] };
  // the client: the real _doForkSession on a TERMINAL card in both groups
  const d = await driveFork(lifeSrc, FG);
  const card = { backend: 'claude', backendSessionId: PARENT, sessionId: PARENT, cwd: CWD, webuiName: 'Alice', webuiMode: 'terminal' };
  const msg = await d.run(card, (s) => ((s.backendSessionId || s.sessionId) === PARENT ? tgm.list().filter((g) => g.sessions.includes(`claude:${PARENT}`)) : []), '');
  out.msg = msg && { taskId: msg.taskId, extra: msg.extraTaskBinds, fork: msg.fork };
  // the server: ws-create's rows (a fork is SEEDED with its source's id)
  const T0 = Date.now() - 60_000, T1 = T0 + 30_000;
  const parent = { mode: 'terminal', backend: 'claude', host: null, cwd: CWD, createdAt: T0, claudeSessionId: PARENT, backendSessionId: PARENT };
  const fork = { mode: 'terminal', backend: 'claude', host: null, cwd: CWD, createdAt: T1, claudeSessionId: PARENT, backendSessionId: PARENT, _forkRequested: true, _initialGroupId: msg?.taskId || null };
  const active = new Map([['w-parent', parent], ['w-fork', fork]]);
  // the CLI's lock files (the fork's lock names the id it minted)
  fs.writeFileSync(path.join(lockDir, '41001.json'), JSON.stringify({ pid: 41001, sessionId: FORK, cwd: CWD, startedAt: T1 + 400 }));
  fs.writeFileSync(path.join(lockDir, '41000.json'), JSON.stringify({ pid: 41000, sessionId: PARENT, cwd: CWD, startedAt: T0 + 300 }));
  // the client queue, bound to the real store
  const q = driveSidebar(tasksSrc, FG, (id, key) => tgm.bind(id, key));
  q.sb._registerPendingTaskBind('w-fork', [msg?.taskId, ...(msg?.extraTaskBinds || [])].filter(Boolean), { notId: msg?.backendSessionId || null });
  const tick = () => { q.sb._webuiSessions = [...active].map(([id, s]) => ({ id, backend: s.backend, backendSessionId: s.backendSessionId, claudeSessionId: s.claudeSessionId })); q.sb._processPendingTaskBinds(); };
  tick();
  out.boundBeforeCapture = [...q.bound];
  // ws-create's chain: the attempt guard + the pick (the fork's wrapper owns 41001) + the adoption
  out.wanted = lc.lockCaptureWanted(fork);
  for (let attempt = 0; attempt < 3 && lc.lockCaptureWanted(fork); attempt++) {
    const lockId = lc.pickClaudeLock({ locks: lc.readClaudeLocks(lockDir), createdAt: fork.createdAt, claimed: lc.claimedLockIds(active, 'w-fork'), excludeId: fork._forkRequested ? fork.claudeSessionId : null, pidDepth: depthOf({ 41001: 1 }) });
    if (lockId) out.adopted = lc.adoptCapturedId(fork, lockId);
  }
  out.forkId = fork.claudeSessionId; out.forkedFrom = fork.forkedFrom; out.stillWanted = lc.lockCaptureWanted(fork);
  out.parentWanted = lc.lockCaptureWanted(parent); out.parentId = parent.claudeSessionId;
  tick();
  out.bound = [...q.bound]; out.leftover = q.sb._pendingTaskBinds.size;
  // persisted membership of the FORK's own conversation, no spawn group to lean on
  // (keyed by the conversation's REAL id — the lock names it — never by the
  // row's id: a row that kept the parent's id "has" both groups through the
  // PARENT's key, exactly what the verifier saw)
  out.forkGroups = tgm.groupsForSession({ sessionKey: `claude:${FORK}` }).map((g) => g.id);
  out.agentView = tgm.groupsForSession({ sessionKey: `claude:${fork.claudeSessionId}`, cwd: CWD, initialGroupId: fork._initialGroupId }).map((g) => g.id);
  return out;
}
const chainJudged = (r) => ({
  plan: !!r.msg && r.msg.fork === true && r.msg.taskId === r.ids[0] && JSON.stringify(r.msg.extra) === JSON.stringify([r.ids[1]]),
  waited: Array.isArray(r.boundBeforeCapture) && r.boundBeforeCapture.length === 0,
  captured: r.wanted === true && r.forkId === FORK && JSON.stringify(r.forkedFrom) === JSON.stringify([PARENT]) && r.stillWanted === false && r.adopted?.forkRequested === false,
  parentKept: r.parentWanted === false && r.parentId === PARENT,
  bound: r.leftover === 0 && r.bound?.length === 2 && r.bound.every((b) => b.endsWith(`@claude:${FORK}`)),
  groups: JSON.stringify([...(r.forkGroups || [])].sort()) === JSON.stringify([...r.ids].sort()),
});

// the parent-side race (round-1 finding 3): a fork seeded with the parent's id
// lands inside the parent's capture window. The locks are fed IN BOTH ORDERS
// (the pick is PURE — a readdir on tmpfs comes back name-sorted whatever the
// write order, so a file-backed "reversed" leg was the same order twice), and
// once file-backed with the fork's lock NAMED to sort first.
function parentRace(lc, order) {
  const T0 = Date.now() - 20_000;
  const forkLock = { pid: 10001, sessionId: FORK, cwd: CWD, startedAt: T0 + 1700 };   // the fork's CLI
  const parentLock = { pid: 20000, sessionId: PARENT, cwd: CWD, startedAt: T0 + 400 }; // the parent's own CLI
  let locks;
  if (order === 'file') {
    const dir = path.join(SCR, `race-${++runSeq}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const l of [parentLock, forkLock]) fs.writeFileSync(path.join(dir, `${l.pid}.json`), JSON.stringify(l));
    locks = lc.readClaudeLocks(dir);
  } else locks = order === 'fork-first' ? [forkLock, parentLock] : [parentLock, forkLock];
  const firstInDir = locks[0]?.sessionId === FORK ? 'fork' : 'parent';
  // a terminal parent whose own capture has not run yet (the sidebar already
  // listed its conversation off the lock), and its fork seeded with that id
  const parent = { mode: 'terminal', backend: 'claude', cwd: CWD, createdAt: T0, claudeSessionId: null, backendSessionId: null };
  const fork = { mode: 'terminal', backend: 'claude', cwd: CWD, createdAt: T0 + 1500, claudeSessionId: PARENT, backendSessionId: PARENT, _forkRequested: true };
  const active = new Map([['w-parent', parent], ['w-fork', fork]]);
  const pick = lc.pickClaudeLock({ locks, createdAt: parent.createdAt, claimed: lc.claimedLockIds(active, 'w-parent'), excludeId: null, pidDepth: depthOf({ 20000: 1 }) });
  // the chat parent the stream parser named first (the reproduced shape)
  const chatParent = { mode: 'chat', backend: 'claude', cwd: CWD, createdAt: T0, claudeSessionId: PARENT, backendSessionId: PARENT };
  return { pick, firstInDir, chatParentWanted: lc.lockCaptureWanted(chatParent) };
}

// TWO SESSIONS CREATED TOGETHER (round-2 finding 1): the later one's CLI
// writes its lock first. F1 created at T (slow CLI), F2 at T+25 (fast CLI).
// Before the pid witness the earlier-created session took whichever lock
// landed first and the two rows swapped identities for life.
const S1 = fixtureSid('f0b1'), S2 = fixtureSid('f0b2'), SN = fixtureSid('f0b3'), SX = fixtureSid('f0b4'), SD = fixtureSid('f0b5'), SNEST = fixtureSid('f0b6');
function siblingPicks(lc, reversed, bothForks = true) {
  const T = Date.now() - 10_000;
  const l2 = { pid: 52002, sessionId: S2, cwd: CWD, startedAt: T + 100 };   // F2's fast CLI, landed first
  const l1 = { pid: 52001, sessionId: S1, cwd: CWD, startedAt: T + 2400 };  // F1's slow CLI
  const f1 = { mode: 'terminal', backend: 'claude', cwd: CWD, createdAt: T, claudeSessionId: bothForks ? PARENT : null, _forkRequested: bothForks };
  const f2 = { mode: 'terminal', backend: 'claude', cwd: CWD, createdAt: T + 25, claudeSessionId: PARENT, _forkRequested: true };
  const active = new Map([['w-f1', f1], ['w-f2', f2]]);
  const pick = (s, id, locks, own) => lc.pickClaudeLock({ locks, createdAt: s.createdAt, claimed: lc.claimedLockIds(active, id), excludeId: s._forkRequested ? s.claudeSessionId : null, pidDepth: depthOf(own) });
  const both = reversed ? [l1, l2] : [l2, l1];
  return {
    f1Early: pick(f1, 'w-f1', [l2], { 52001: 1 }),          // only the sibling's lock exists yet
    f1: pick(f1, 'w-f1', both, { 52001: 1 }),
    f2: pick(f2, 'w-f2', both, { 52002: 1 }),
  };
}
// the pre-creation / dead / external locks (round-2 finding 2) and the
// fork's own CLI whose lock still names the seed (excludeId)
function strayPicks(lc) {
  const T = Date.now() - 10_000;
  const s = { mode: 'terminal', backend: 'claude', cwd: CWD, createdAt: T, claudeSessionId: PARENT, _forkRequested: true };
  const one = (locks, own) => lc.pickClaudeLock({ locks, createdAt: T, claimed: new Set(), excludeId: PARENT, pidDepth: depthOf(own) });
  return {
    external: one([{ pid: 60001, sessionId: SX, cwd: CWD, startedAt: T - 3000 }, { pid: 60002, sessionId: SD, cwd: CWD, startedAt: T + 50 }], { 60009: 1 }),
    externalAlone: one([{ pid: 60002, sessionId: SD, cwd: CWD, startedAt: T + 50 }], { 60009: 1 }),                    // one live external lock inside the window, not ours
    stale: one([{ pid: 60009, sessionId: SD, cwd: CWD, startedAt: T - 1000 }], { 60009: 1 }),          // a dead CLI's file under a pid name ours re-used
    seedLock: one([{ pid: 60009, sessionId: PARENT, cwd: CWD, startedAt: T + 200 }], { 60009: 1 }),     // our CLI's lock still names the parent
    ownLate: one([{ pid: 60001, sessionId: SX, cwd: CWD, startedAt: T - 3000 }, { pid: 60009, sessionId: FORK, cwd: CWD, startedAt: T + 19_000 }], { 60009: 1 }),
    nested: [one([{ pid: 60009, sessionId: FORK, cwd: CWD, startedAt: T + 200 }, { pid: 60010, sessionId: SNEST, cwd: '/elsewhere', startedAt: T + 900 }], { 60009: 1, 60010: 2 }),
      one([{ pid: 60010, sessionId: SNEST, cwd: '/elsewhere', startedAt: T + 900 }, { pid: 60009, sessionId: FORK, cwd: CWD, startedAt: T + 200 }], { 60009: 1, 60010: 2 })],
    tie: one([{ pid: 60009, sessionId: FORK, cwd: CWD, startedAt: T + 200 }, { pid: 60011, sessionId: SNEST, cwd: CWD, startedAt: T + 300 }], { 60009: 1, 60011: 1 }),
    noWitness: lc.pickClaudeLock({ locks: [{ pid: 60009, sessionId: FORK, cwd: CWD, startedAt: T + 200 }], createdAt: T, claimed: new Set() }),
    // round 4: the NEAREST lock is judged, never skipped for a deeper one — the
    // seed / a claimed id / a pre-creation file at depth 1 with a nested
    // claude's lock at depth 3 (a `claude -p` the session's Bash tool runs)
    pastSeed: one([{ pid: 60009, sessionId: PARENT, cwd: CWD, startedAt: T + 200 }, { pid: 60012, sessionId: SNEST, cwd: CWD, startedAt: T + 900 }], { 60009: 1, 60012: 3 }),
    pastClaimed: lc.pickClaudeLock({ locks: [{ pid: 60009, sessionId: S1, cwd: CWD, startedAt: T + 200 }, { pid: 60012, sessionId: SNEST, cwd: CWD, startedAt: T + 900 }], createdAt: T, claimed: new Set([S1]), pidDepth: depthOf({ 60009: 1, 60012: 3 }) }),
    pastFloor: one([{ pid: 60009, sessionId: SD, cwd: CWD, startedAt: T - 1000 }, { pid: 60012, sessionId: SNEST, cwd: CWD, startedAt: T + 900 }], { 60009: 1, 60012: 3 }),
    // round 5: the CLI's own lock exists but is torn mid-rewrite (readClaudeLocks'
    // placeholder) ⇒ nothing this step, never the nested lock below it; a torn
    // DEEPER lock does not hide the CLI's readable one; a torn lock beside a
    // readable one at the same depth is a tie
    pastTorn: one([{ pid: 60009, unreadable: true }, { pid: 60012, sessionId: SNEST, cwd: CWD, startedAt: T + 900 }], { 60009: 1, 60012: 3 }),
    tornDeeper: one([{ pid: 60009, sessionId: FORK, cwd: CWD, startedAt: T + 200 }, { pid: 60012, unreadable: true }], { 60009: 1, 60012: 3 }),
    tornTie: one([{ pid: 60009, sessionId: FORK, cwd: CWD, startedAt: T + 200 }, { pid: 60011, unreadable: true }], { 60009: 1, 60011: 1 }),
  };
}
const strayJudged = (r) => ({
  external: r.external === null && r.externalAlone === null, stale: r.stale === null, seedLock: r.seedLock === null, ownLate: r.ownLate === FORK,
  nested: r.nested.every((x) => x === FORK), tie: r.tie === null, noWitness: r.noWitness === null,
  pastSeed: r.pastSeed === null, pastClaimed: r.pastClaimed === null, pastFloor: r.pastFloor === null,
  pastTorn: r.pastTorn === null, tornDeeper: r.tornDeeper === FORK, tornTie: r.tornTie === null,
});

// the chain never gives up while the capture is wanted (round-2 finding 3):
// a fork whose CLI lands its lock after the old 15th attempt
function driveArm(lc, lateAt) {
  const queue = [];
  const schedule = (fn, ms) => { queue.push({ fn, ms }); return null; };
  const s = { mode: 'terminal', backend: 'claude', cwd: CWD, createdAt: 0, claudeSessionId: PARENT, _forkRequested: true };
  const active = new Map([['w', s]]);
  let calls = 0, adopted = null;
  const args = { id: 'w', session: s, activeSessions: active, attempt: () => (++calls >= lateAt ? FORK : null), onAdopt: (x) => { adopted = x; lc.adoptCapturedId(s, x); }, schedule };
  const armed = lc.armLockCapture(args);
  const again = lc.armLockCapture(args);
  let elapsed = 0, guard = 0;
  while (queue.length && guard++ < 1000) { const { fn, ms } = queue.shift(); elapsed += ms; fn(); }
  // a second session that leaves the live list stops its chain
  const s2 = { mode: 'terminal', backend: 'claude', cwd: CWD, createdAt: 0, claudeSessionId: null };
  const active2 = new Map([['w2', s2]]);
  let calls2 = 0;
  lc.armLockCapture({ id: 'w2', session: s2, activeSessions: active2, attempt: () => { calls2++; if (calls2 === 3) active2.delete('w2'); return null; }, onAdopt: () => {}, schedule });
  guard = 0;
  while (queue.length && guard++ < 1000) queue.shift().fn();
  return { armed, again, adopted, calls, elapsed, calls2, left: queue.length };
}

// REAL PROCESSES over the real /proc (the witness end to end): a "wrapper"
// that records its own pid in a sidecar and spawns a "CLI" that writes its
// lock after a delay — plain, or behind a non-exec shell shim (depth 2).
const kids = [];
const killKids = () => { for (const k of kids) { try { process.kill(-k.pid, 'SIGKILL'); } catch {} } };
process.on('exit', killKids);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(40); } return false; }
function processTrees() {
  const dir = path.join(SCR, `procs-${++runSeq}`), lockDir = path.join(dir, 'sessions');
  fs.mkdirSync(lockDir, { recursive: true });
  // the fake CLI is named `claude.js` (cli-identity's interpreter rung) and
  // stamps its own /proc stat field 22 as `procStart`, exactly like the CLI
  // (round 3's writer witness); with a tree file it first runs a `sleep` child
  // — the non-claude descendant whose pid NAME a stale lock can carry
  const cliJs = path.join(dir, 'claude.js'), wrapJs = path.join(dir, 'wrapper.js');
  fs.writeFileSync(cliJs, `const [lockDir, sid, cwd, delay, treeFile, nestSid] = process.argv.slice(2);
const fs = require('fs');
if (treeFile) { const c = require('child_process').spawn('sleep', ['60'], { stdio: 'ignore' }); fs.writeFileSync(treeFile, JSON.stringify({ cli: process.pid, child: c.pid })); }
const st = fs.readFileSync('/proc/self/stat', 'utf8'); const procStart = st.slice(st.lastIndexOf(')') + 2).split(' ')[19];
setTimeout(() => {
  fs.writeFileSync(require('path').join(lockDir, process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: sid, cwd, startedAt: Date.now(), procStart, kind: 'interactive' }));
  if (nestSid) require('child_process').spawn('sh', ['-c', '"$0" "$@"; true', process.execPath, __filename, lockDir, nestSid, cwd, '0'], { stdio: 'ignore' }); // a claude the CLI's Bash tool runs
}, Number(delay));
setTimeout(() => {}, 60000);\n`);
  fs.writeFileSync(wrapJs, `const [sidecar, shim, ...cli] = process.argv.slice(2);
require('fs').writeFileSync(sidecar, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
const cp = require('child_process');
if (shim === '1') cp.spawn('sh', ['-c', '"$0" "$@"; true', process.execPath, ...cli], { stdio: 'ignore' });
else cp.spawn(process.execPath, cli, { stdio: 'ignore' });
setTimeout(() => {}, 60000);\n`);
  const tree = (name, sid, delay, shim, child = false, nestSid = null) => {
    const sidecar = path.join(dir, `${name}.json`);
    const k = spawn(process.execPath, [wrapJs, sidecar, shim ? '1' : '0', cliJs, lockDir, sid, CWD, String(delay), ...(child || nestSid ? [child ? path.join(dir, `${name}.tree.json`) : ''] : []), ...(nestSid ? [nestSid] : [])], { stdio: 'ignore', detached: true });
    kids.push(k);
    return sidecar;
  };
  return { lockDir, tree, dir };
}
async function realRace(lc) {
  const out = {};
  const P = processTrees();
  const T = Date.now();
  const f1 = { mode: 'terminal', backend: 'claude', host: null, cwd: CWD, createdAt: T, claudeSessionId: PARENT, backendSessionId: PARENT, _forkRequested: true };
  const side1 = P.tree('f1', S1, 1500, false);
  await sleep(25);
  const f2 = { mode: 'terminal', backend: 'claude', host: null, cwd: CWD, createdAt: Date.now(), claudeSessionId: PARENT, backendSessionId: PARENT, _forkRequested: true };
  const side2 = P.tree('f2', S2, 0, true); // the fast CLI, behind a shim
  const active = new Map([['w-f1', f1], ['w-f2', f2]]);
  const cap = (s, id, sidecarPath) => lc.captureLockId({ session: s, id, activeSessions: active, sessionsDir: P.lockDir, sidecarPath, readPpid });
  const hasLock = (sid) => lc.readClaudeLocks(P.lockDir).some((l) => l.sessionId === sid);
  out.f2First = await waitFor(() => hasLock(S2) && fs.existsSync(side1));
  out.f1Before = hasLock(S1);
  out.f1Early = cap(f1, 'w-f1', side1);
  out.f1Landed = await waitFor(() => hasLock(S1));
  out.f1 = cap(f1, 'w-f1', side1); out.f2 = cap(f2, 'w-f2', side2);
  // stray locks beside a slow plain session: a DEAD CLI's leftover and an
  // external live same-cwd claude (this suite's own pid) started before it
  const dead = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
  await new Promise((r) => dead.on('exit', r));
  const n = { mode: 'terminal', backend: 'claude', host: null, cwd: CWD, createdAt: Date.now(), claudeSessionId: null };
  fs.writeFileSync(path.join(P.lockDir, `${dead.pid}.json`), JSON.stringify({ pid: dead.pid, sessionId: SD, cwd: CWD, startedAt: n.createdAt + 5 }));
  fs.writeFileSync(path.join(P.lockDir, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: SX, cwd: CWD, startedAt: n.createdAt - 3000 }));
  const sideN = P.tree('n', SN, 700, false);
  active.set('w-n', n);
  await waitFor(() => fs.existsSync(sideN));
  out.nEarly = cap(n, 'w-n', sideN);
  out.nLanded = await waitFor(() => hasLock(SN));
  out.n = cap(n, 'w-n', sideN);
  out.noSidecar = cap({ ...n }, 'w-n', path.join(P.dir, 'absent.json'));
  killKids();
  return out;
}

// THE WRITER WITNESS + THE NO-SIDECAR RULE + A CHAT FORK (round 3, findings
// 2/3/5), over a REAL tree: wrapper → claude.js → `sleep`. A stale lock named
// after the sleep's pid (it descends from the wrapper at depth 2 and starts
// inside the window) is refused with a foreign `procStart` AND with none (the
// sleep is no claude); a restored pending fork keeps its flag; the CLI's own
// lock is adopted by a fresh session AND by a restored pending CHAT fork; and
// with the sidecar gone a dir holding exactly ONE eligible lock adopts nothing.
const SW = fixtureSid('f0b7'), STALE = fixtureSid('f0b8');
async function writerLegs(lc) {
  const out = {};
  const P = processTrees();
  const createdAt = Date.now();
  const side = P.tree('w', SW, 2500, false, true);
  const treeFile = path.join(P.dir, 'w.tree.json');
  out.treeUp = await waitFor(() => fs.existsSync(treeFile) && fs.existsSync(side));
  const t = JSON.parse(fs.readFileSync(treeFile, 'utf8'));
  const wrapperPid = JSON.parse(fs.readFileSync(side, 'utf8')).pid;
  out.childDepth = lc.wrapperDepthOf(wrapperPid, readPpid)(t.child);
  out.childComm = (() => { try { return fs.readFileSync(`/proc/${t.child}/comm`, 'utf8').trim(); } catch { return null; } })();
  const s = { mode: 'terminal', backend: 'claude', host: null, cwd: CWD, createdAt, claudeSessionId: null };
  const cap = (sess, sidecarPath = side) => lc.captureLockId({ session: sess, id: 'w-x', activeSessions: new Map([['w-x', sess]]), sessionsDir: P.lockDir, sidecarPath, readPpid });
  const staleFile = path.join(P.lockDir, `${t.child}.json`);
  fs.writeFileSync(staleFile, JSON.stringify({ pid: t.child, sessionId: STALE, cwd: CWD, startedAt: createdAt + 500, procStart: '1' }));
  out.ownYet = lc.readClaudeLocks(P.lockDir).some((l) => l.sessionId === SW);
  out.staleProc = cap(s);
  const restored = { mode: 'terminal', backend: 'claude', host: null, cwd: CWD, createdAt: createdAt - 3 * 86400e3, claudeSessionId: PARENT, backendSessionId: PARENT, _forkRequested: true };
  out.restored = cap(restored);
  if (out.restored) lc.adoptCapturedId(restored, out.restored);
  out.restoredFlag = restored._forkRequested;
  fs.writeFileSync(staleFile, JSON.stringify({ pid: t.child, sessionId: STALE, cwd: CWD, startedAt: createdAt + 500 })); // no procStart (a macOS lock / an older CLI)
  out.staleNoProc = cap(s);
  fs.unlinkSync(staleFile);
  out.ownLanded = await waitFor(() => lc.readClaudeLocks(P.lockDir).some((l) => l.sessionId === SW));
  out.own = cap(s);
  const chatFork = { mode: 'chat', backend: 'claude', host: null, cwd: CWD, createdAt: createdAt - 3 * 86400e3, claudeSessionId: PARENT, backendSessionId: PARENT, _forkRequested: true };
  out.chatFork = cap(chatFork);
  out.lockCount = lc.readClaudeLocks(P.lockDir).length;
  out.noSidecar = cap({ ...s }, path.join(P.dir, 'absent.json'));
  killKids();
  return out;
}
const writerJudged = (r) => ({
  shape: r.treeUp && r.childDepth === 2 && r.childComm === 'sleep' && r.ownYet === false,
  staleProc: r.staleProc === null, restored: r.restored === null && r.restoredFlag === true, staleNoProc: r.staleNoProc === null,
  own: r.ownLanded && r.own === SW, chatFork: r.chatFork === SW, noSidecar: r.lockCount === 1 && r.noSidecar === null,
});

// THE NESTED CLAUDE (round 4, finding 1 — reproduced on a scratch upgrade:
// master's session meta in the pre-2.369.134 adopted-fork shape, the lane
// booted beside it, a `claude -p` run from the session's Bash tool): a REAL
// tree wrapper → claude.js (its own lock) → sh → claude.js (the nested one's
// lock, depth 3). The session's own id is the "seed" when the record is
// misread as a pending fork; the capture must answer nothing — never the
// nested claude's id — and a genuine pending fork beside a nested claude
// still adopts its CLI's own lock.
const SOWN = fixtureSid('f0b9'), SNEST2 = fixtureSid('f0ba'), SPF = fixtureSid('f0bb'), SNEST3 = fixtureSid('f0bc');
async function nestedLegs(lc) {
  const out = {};
  const P = processTrees();
  const sideA = P.tree('own', SOWN, 0, false, false, SNEST2);
  const sideF = P.tree('pf', SPF, 0, false, false, SNEST3);
  const has = (sid) => lc.readClaudeLocks(P.lockDir).find((l) => l.sessionId === sid);
  out.up = await waitFor(() => has(SOWN) && has(SNEST2) && has(SPF) && has(SNEST3) && fs.existsSync(sideA) && fs.existsSync(sideF));
  const wA = JSON.parse(fs.readFileSync(sideA, 'utf8')).pid;
  out.depths = [has(SOWN), has(SNEST2)].map((l) => l && lc.wrapperDepthOf(wA, readPpid)(l.pid));
  const oldShape = { forkRequested: true, claudeSessionId: SOWN, backendSessionId: SOWN }; // the verifier's repro shape: no source, no trace
  const a = { mode: 'chat', backend: 'claude', host: null, cwd: CWD, createdAt: Date.now() - 3 * 86400e3, claudeSessionId: SOWN, backendSessionId: SOWN, _forkRequested: lc.restoredForkPending(oldShape) };
  out.aFlag = a._forkRequested;
  out.a = lc.captureLockId({ session: a, id: 'w-a', activeSessions: new Map([['w-a', a]]), sessionsDir: P.lockDir, sidecarPath: sideA, readPpid });
  const f = { mode: 'terminal', backend: 'claude', host: null, cwd: CWD, createdAt: Date.now() - 60_000, claudeSessionId: PARENT, backendSessionId: PARENT, _forkRequested: true };
  out.f = lc.captureLockId({ session: f, id: 'w-f', activeSessions: new Map([['w-f', f]]), sessionsDir: P.lockDir, sidecarPath: sideF, readPpid });
  // round 5: the fork CLI's own lock TORN mid-rewrite (half its bytes on disk)
  // beside the nested claude's intact one ⇒ the capture answers nothing this
  // step (never the nested id); once the rewrite lands it adopts its own
  const ownF = has(SPF), fileF = ownF && path.join(P.lockDir, `${ownF.pid}.json`);
  if (fileF) {
    const whole = fs.readFileSync(fileF, 'utf8');
    fs.writeFileSync(fileF, whole.slice(0, Math.floor(whole.length / 2)));
    out.tornRead = lc.readClaudeLocks(P.lockDir).some((l) => l.unreadable === true && l.pid === ownF.pid);
    const g = { ...f, _forkRequested: true };
    out.torn = lc.captureLockId({ session: g, id: 'w-f', activeSessions: new Map([['w-f', g]]), sessionsDir: P.lockDir, sidecarPath: sideF, readPpid });
    fs.writeFileSync(fileF, whole);
    out.healed = lc.captureLockId({ session: g, id: 'w-f', activeSessions: new Map([['w-f', g]]), sessionsDir: P.lockDir, sidecarPath: sideF, readPpid });
  }
  killKids();
  return out;
}
const nestedJudged = (r) => ({
  shape: r.up && JSON.stringify(r.depths) === '[1,3]',
  own: r.aFlag === true && r.a === null,
  fork: r.f === SPF,
  torn: r.tornRead === true && r.torn === null && r.healed === SPF,
});

// THE BOOT DEDUP (round 3, findings 1+4): which restored metas may claim a
// conversation. Fed through the REAL dedupWebuiSockets exactly as
// boot-restore builds its entries (claudeAlive false: a live claude never
// holds its JSONL, the essay's own measurement).
function dedupLeg(lc) {
  const { dedupWebuiSockets } = require(path.join(REPO, 'src/session-store.js'));
  const metas = [
    ['cw-1', { claudeSessionId: PARENT, createdAt: 1 }],                                                  // the parent
    ['cw-2', { claudeSessionId: PARENT, createdAt: 2, forkRequested: true, forkSourceId: PARENT }],       // its pending fork (seeded)
    ['cw-3', { claudeSessionId: PARENT, createdAt: 3, forkRequested: true }],                             // an older server's terminal fork (no forkSourceId, never learned its id)
    ['cw-4', { claudeSessionId: S1, createdAt: 4 }], ['cw-5', { claudeSessionId: S1, createdAt: 5 }],     // a GENUINE duplicate pair (a plain --resume of one conversation)
    ['cw-6', { claudeSessionId: FORK, createdAt: 6, forkRequested: true, forkSourceId: PARENT }],         // an adopted fork whose flag stayed true: owns FORK
    ['cw-7', { claudeSessionId: FORK, createdAt: 7 }],                                                    // a resume of that fork: a genuine duplicate
  ];
  const entries = metas.filter(([, m]) => lc.ownsItsId(m)).map(([sockFile, m]) => ({ sockFile, backend: 'claude', host: 'local', claudeSessionId: m.claudeSessionId, createdAt: m.createdAt, claudeAlive: false }));
  return [...dedupWebuiSockets(entries).retire].sort();
}

// THE CHAT CONSUMER (round 3, finding 3b): the REAL claude-stream-json attach
// over a fake pty. A restored pending chat fork's init arrives glued behind
// dtach's re-attach preamble (the verifier's instrumented capture:
// `\e[H\e[J{"type":"system","subtype":"init",…`); a torn record after it must
// be REPORTED, never dropped silently.
async function consumerLeg(consumer) {
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  const csSrc = rd('src/server/stdout/claude-stream-json.js');
  const engine = { _vsuPending: new Map(), resolveUsageKey: () => '__global__', usageEstimator: { noteLive() {} }, modelsMatch: () => false, servedDefinesModel: () => false, rerouteAnnouncedBy: () => null };
  for (const part of (/const \{([^}]*)\} = engine;/.exec(csSrc) || ['', ''])[1].split(',')) {
    const name = part.split(':')[0].replace(/\/\/.*$/, '').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(name) && !(name in engine)) engine[name] = () => {};
  }
  const activeSessions = new Map();
  const { attach } = consumer.create({
    activeSessions, engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result']), _seenStreamTypes: new Set(),
    USAGE_SCANNER_PATH: path.join(SCR, 'none'), checkClaudeGoalStatus() {}, noteModelSeen() {}, sbSeenFirst: () => true, hosts: null, usageHistory: null, pagesRef: { current: null },
  });
  const writes = [];
  const helpers = {
    feedLive: (x, m) => { x._normalizer?.processLive(m); }, broadcastToSession() {}, broadcastActiveSessions() {},
    readSessionMeta: () => ({}), writeSessionMeta: (sock, m) => writes.push(m), updateSessionTodos() {}, applyTaskToolUpdate() {}, emitTaskListTodos() {},
  };
  const s = { mode: 'chat', backend: 'claude', name: 'fc2', cwd: CWD, host: null, claudeSessionId: PARENT, backendSessionId: PARENT, _forkRequested: true, sockName: 'cw-fc2', buffer: '', createdAt: Date.now() };
  s._normalizer = createMessageManager('claude', 'w-fc2');
  activeSessions.set('w-fc2', s);
  const h = { data: null, onData(cb) { h.data = cb; }, onExit() {} };
  const events = [], r = {};
  const prevEv = global.__vsEvent;
  global.__vsEvent = (name, detail) => events.push({ name, detail });
  const warn = console.warn; console.warn = () => {};
  try {
    attach(s, 'w-fc2', h, helpers);
    h.data('\x1b[H\x1b[J');                                  // the preamble: dtach's FIRST chunk to an attaching client
    h.data(JSON.stringify({ type: 'system', subtype: 'init', session_id: FORK, cwd: CWD, model: 'fake', tools: [] }) + '\n');
    h.data('{"type":"assistant","message":{"id":"m1"\n');     // a torn record
    await sleep(50);
    r.dropped = events.filter((e) => e.name === 'cli-unparsable-line').length;
    // round 4: dtach's own exit banner — the REAL bytes a `dtach -a <sock> -E -r
    // winch` client read when the CLI exited (captured by the verifier), then
    // the detach banner; round 5: ALL FIVE banners in the dtach binary's
    // strings — `[got signal 15 - dying]` as a real attach client wrote it on
    // SIGTERM (`\e[999H` on its OWN line), `[read returned an error]`,
    // `[select failed]`; transport chatter, never a dropped record
    for (const chunk of ['\x1b[H\x1b[J\x1b[999H\r\n[EOF - dtach terminating]\r\n\x1b[?25h', '\x1b[999H\r\n[detached]\r\n',
      '\x1b[999H\r\n[got signal 15 - dying]\r\n\x1b[?25h', '\x1b[999H\r\n[read returned an error]\r\n', '\x1b[999H\r\n[select failed]\r\n']) h.data(chunk);
    await sleep(20);
    r.bannerEvents = events.length - r.dropped;
    r.bannerCount = s._droppedLines?.['cli-unparsable-line'] || 0;
    // …and a chatty producer of 249 more torn lines: the count is exact, the
    // telemetry lane is capped like the log (n ≤ 3, then every 100th)
    const before = events.length;
    for (let i = 0; i < 249; i++) h.data('{"type":"assistant","torn":' + i + '\n');
    await sleep(20);
    r.chattyEvents = events.length - before;
    r.chattyCount = s._droppedLines?.['cli-unparsable-line'] || 0;
  } finally { global.__vsEvent = prevEv; console.warn = warn; }
  return { id: s.claudeSessionId, forkedFrom: s.forkedFrom || null, flag: s._forkRequested, persisted: writes.some((m) => m.claudeSessionId === FORK && m.forkRequested === false), ...r };
}

// THE R6 PIPE RE-OPEN (round 3, finding 6): the REAL boot-restore create()
// over a scratch meta dir holding two daemon-pipe metas — a pending chat fork
// and a plain session that owns its id — and a stub device whose
// openPipeSession answers. The capture's armLockCapture is spied on through
// the module cache (boot-restore destructures it at load).
async function pipeReopenLeg(loadBr) {
  const dir = path.join(SCR, `pipe-${++runSeq}`);
  const META = path.join(dir, 'meta'), BUF = path.join(dir, 'buf'), SOCK = path.join(dir, 'sockets');
  for (const d of [META, BUF, SOCK]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(META, 'cw-9-1.json'), JSON.stringify({ agentdPipe: true, backend: 'claude', mode: 'chat', cwd: CWD, name: 'pending fork', claudeSessionId: PARENT, forkRequested: true, forkSourceId: PARENT, createdAt: Date.now() - 1000 }));
  fs.writeFileSync(path.join(META, 'cw-9-2.json'), JSON.stringify({ agentdPipe: true, backend: 'claude', mode: 'chat', cwd: CWD, name: 'plain', claudeSessionId: S2, createdAt: Date.now() - 1000 }));
  const lcMod = require(LC_PATH);
  const realArm = lcMod.armLockCapture;
  const armed = [];
  lcMod.armLockCapture = (a) => { armed.push({ id: a.id, fork: !!a.session?._forkRequested }); return true; };
  const activeSessions = new Map();
  try {
    const br = loadBr();
    br.create({
      rootDir: dir, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', ENV_CMD: 'env', NODE_CMD: process.execPath, CHAT_WRAPPER: 'none',
      activeSessions, sessionCounterRef: { value: 0 }, attachToDtach() {}, setupSessionPty() {},
      readSessionMeta: (f) => { try { return JSON.parse(fs.readFileSync(path.join(META, f + '.json'), 'utf8')); } catch { return {}; } },
      writeSessionMeta() {}, deleteSessionMeta() {}, broadcastToSession() {}, broadcastActiveSessions() {}, refreshWebuiPids() {}, sbNoteServerOp() {},
      getHosts: () => ({ device: async () => ({ openPipeSession: async ({ sid }) => ({ pid: 1, sid, write() {}, kill() {} }) }) }),
      getDialBridge: () => null,
    });
    const t0 = Date.now(); while (activeSessions.size < 2 && Date.now() - t0 < 3000) await sleep(20);
    await sleep(20);
  } finally { lcMod.armLockCapture = realArm; }
  return { reopened: activeSessions.size, armed: armed.map((a) => a.id).sort(), forkFlag: activeSessions.get('sess-9-1')?._forkRequested, plainFlag: activeSessions.get('sess-9-2')?._forkRequested };
}
const BR_PATH = path.join(REPO, 'src/server/boot-restore.js');
const loadRealBr = () => { delete require.cache[BR_PATH]; return require(BR_PATH); };

// the restored fork flag (round-2 finding 5): an adopted CHAT fork whose meta
// kept `forkRequested: true` must not come back as a pending fork
function restoredFork(lc) {
  const pend = lc.restoredForkPending;
  const adoptedChat = { mode: 'chat', backend: 'claude', claudeSessionId: FORK, backendSessionId: FORK, _forkRequested: pend({ forkRequested: true, forkSourceId: PARENT, claudeSessionId: FORK, backendSessionId: FORK }) };
  const idless = { mode: 'terminal', backend: 'claude', cwd: CWD, createdAt: 0, claudeSessionId: null };
  const active = new Map([['w-chat-fork', adoptedChat], ['w-s', idless]]);
  return {
    adoptedFlag: adoptedChat._forkRequested,
    claimed: [...lc.claimedLockIds(active, 'w-s')],
    pendingSeeded: pend({ forkRequested: true, forkSourceId: PARENT, claudeSessionId: PARENT }),
    pendingIdless: pend({ forkRequested: true, forkSourceId: PARENT, claudeSessionId: null }),
    legacy: pend({ forkRequested: true, claudeSessionId: PARENT }),
    notFork: pend({ forkRequested: false, claudeSessionId: PARENT }),
    // round 4: every chat fork a pre-2.369.134 server adopted — flag never
    // cleared, no forkSourceId, the seed in forkedFrom (the parser's adoption
    // bookkeeping) — owns its id; the shape with no adoption trace stays pending
    pre134Adopted: pend({ forkRequested: true, claudeSessionId: FORK, backendSessionId: FORK, forkedFrom: [PARENT] }),
    pre134Owns: lc.ownsItsId({ forkRequested: true, claudeSessionId: FORK, forkedFrom: [PARENT] }),
    pre134Wanted: lc.lockCaptureWanted({ mode: 'chat', backend: 'claude', host: null, claudeSessionId: FORK, _forkRequested: pend({ forkRequested: true, claudeSessionId: FORK, forkedFrom: [PARENT] }) }),
    forkOfForkSeeded: pend({ forkRequested: true, claudeSessionId: FORK, forkedFrom: [PARENT, FORK] }),
  };
}
const restoredJudged = (r) => r.adoptedFlag === false && r.claimed.includes(FORK) && r.pendingSeeded === true && r.pendingIdless === true && r.legacy === true && r.notFork === false
  && r.pre134Adopted === false && r.pre134Owns === true && r.pre134Wanted === false && r.forkOfForkSeeded === true;

console.log('⑥ END TO END — the terminal-mode fork learns its own id and lands in BOTH groups');
{
  const r = await terminalForkChain(LC);
  const j = chainJudged(r);
  ok(j.plan, 'terminal card Fork… ⇒ the plan rides the create (first group taskId, the other pending)', JSON.stringify(r.msg));
  ok(j.waited, 'while the fork\'s row carries the PARENT id (seeded), nothing is bound', JSON.stringify(r.boundBeforeCapture));
  ok(j.captured, 'the lock capture runs for a pending TERMINAL fork, adopts the lock its OWN wrapper\'s CLI wrote, records forkedFrom, disarms', JSON.stringify({ wanted: r.wanted, forkId: r.forkId, forkedFrom: r.forkedFrom, still: r.stillWanted }));
  ok(j.parentKept, 'the parent (its own id) is not re-captured and keeps its id');
  ok(j.bound, 'the queue binds BOTH groups under the fork\'s OWN key and empties', JSON.stringify(r.bound));
  ok(j.groups, 'groupsForSession(claude:<fork own id>) with NO spawn group names both groups — the persisted membership the owner asked for', JSON.stringify(r.forkGroups));
  ok(JSON.stringify([...r.agentView].sort()) === JSON.stringify([...r.ids].sort()), 'the agent\'s task context (groupsForSession with the session\'s _initialGroupId) names both groups');
  const chat = { mode: 'chat', backend: 'claude', claudeSessionId: PARENT, _forkRequested: true };
  ok(LC.lockCaptureWanted(chat) === true, 'a pending CHAT fork is captured too (round 3: an init that landed while the server was down is never replayed to the parser; the first adopter ends the chain)');
  ok(LC.lockCaptureWanted({ mode: 'terminal', backend: 'claude', host: 'h1', claudeSessionId: PARENT, _forkRequested: true }) === false, 'a REMOTE session never scans the local lock dir (2.156.2)');
  ok(LC.lockCaptureWanted({ mode: 'terminal', backend: 'claude', claudeSessionId: null }) === true && LC.lockCaptureWanted({ mode: 'terminal', backend: 'codex', claudeSessionId: null }) === false, 'an id-less local claude session is still captured (unchanged); codex has its own chain');
  for (const order of ['fork-first', 'parent-first', 'file']) {
    const p = parentRace(LC, order);
    ok(p.pick === PARENT, `parent + a fork seeded with its id inside the window (${order}${order === 'file' ? `, readdir gave the ${p.firstInDir}'s lock first` : ''}) ⇒ the parent adopts ITS OWN lock`, JSON.stringify(p));
    if (order === 'file') ok(p.firstInDir === 'fork', 'the file-backed leg really reads the FORK\'s lock first (named 10001.json — tmpfs readdir is name-sorted)', p.firstInDir);
    if (order === 'fork-first') ok(p.chatParentWanted === false, 'a parent the stream parser already named stops capturing (the attempt guard re-asks) — it can never adopt its fork\'s lock');
  }
}

console.log('⑥ THE PID WITNESS — two sessions created together, stray locks, a late lock, a restored flag');
{
  for (const [both, label] of [[true, 'two forks of one parent'], [false, 'a new session beside a fork']]) {
    for (const rev of [false, true]) {
      const r = siblingPicks(LC, rev, both);
      ok(r.f1Early === null && r.f1 === S1 && r.f2 === S2, `${label}, the LATER one's CLI writes its lock first (${rev ? 'slow lock listed first' : 'fast lock listed first'}) ⇒ the earlier one waits, then each adopts ITS OWN (round-2 finding 1: they swapped)`, JSON.stringify(r));
    }
  }
  const st = strayPicks(LC), sj = strayJudged(st);
  ok(sj.external, 'an external same-cwd lock started 3 s BEFORE the session and one started after it, neither the wrapper\'s descendant ⇒ nothing (the chain waits)', JSON.stringify(st.external));
  ok(sj.stale, 'a lock file under OUR pid but started before the session (a dead CLI\'s file whose pid name was re-used) ⇒ nothing', JSON.stringify(st.stale));
  ok(sj.seedLock, 'our own CLI\'s lock while it still names the fork\'s SEED ⇒ nothing (the parent\'s id is never the fork\'s)', JSON.stringify(st.seedLock));
  ok(sj.ownLate, 'the own lock landing 19 s later beside an external pre-creation one ⇒ the own', JSON.stringify(st.ownLate));
  ok(sj.nested, 'a claude the CLI itself runs (a deeper descendant with its own lock) never wins over the CLI\'s own lock, in either order', JSON.stringify(st.nested));
  ok(sj.tie, 'two locks at the same depth ⇒ refused (null), never a coin toss', JSON.stringify(st.tie));
  ok(sj.noWitness, 'no witness function ⇒ nothing is picked by cwd or clock', JSON.stringify(st.noWitness));
  ok(sj.pastSeed && sj.pastClaimed && sj.pastFloor, 'the NEAREST lock is judged, never skipped: the seed / a claimed id / a pre-creation file at depth 1 beside a nested claude\'s lock at depth 3 ⇒ nothing, never the nested id (round-4 finding 1)', JSON.stringify({ seed: st.pastSeed, claimed: st.pastClaimed, floor: st.pastFloor }));
  ok(sj.pastTorn && sj.tornDeeper && sj.tornTie, 'a TORN nearest lock (unreadable placeholder) ⇒ nothing, never the nested lock below it; a torn deeper lock does not hide the CLI\'s readable one; a torn lock beside a readable one at the same depth is a tie (round-5 finding 2)', JSON.stringify({ torn: st.pastTorn, deeper: st.tornDeeper, tie: st.tornTie }));
  const a = driveArm(LC, 40);
  ok(a.armed === true && a.again === false, 'one chain per session (the boot sweep meeting a fresh create\'s chain arms nothing twice)', JSON.stringify({ armed: a.armed, again: a.again }));
  ok(a.adopted === FORK && a.calls === 40 && a.elapsed > 60_000, `a lock that lands at the 40th attempt (${Math.round(a.elapsed / 1000)} s — the old chain gave up after 15 attempts, ~17 s) is still adopted (round-2 finding 3)`, JSON.stringify({ adopted: a.adopted, calls: a.calls, elapsed: a.elapsed }));
  ok(a.calls2 === 3 && a.left === 0, 'a session that leaves the live list ends its chain', JSON.stringify({ calls2: a.calls2, left: a.left }));
  ok([0, 1, 14, 15, 44, 45, 1000].every((n) => Number.isFinite(LC.captureDelay(n)) && LC.captureDelay(n) >= 1000 && LC.captureDelay(n) <= 30_000), 'the backoff is bounded (1 s … 30 s) and never ends the chain');
  const rr = await realRace(LC);
  ok(rr.f2First && !rr.f1Before && rr.f1Early === null, 'REAL processes: the later-created fork\'s CLI (behind a shim, depth 2) writes its lock first ⇒ the earlier fork adopts nothing yet', JSON.stringify({ f2First: rr.f2First, f1Before: rr.f1Before, f1Early: rr.f1Early }));
  ok(rr.f1Landed && rr.f1 === S1 && rr.f2 === S2, 'REAL processes: each fork adopts the lock its OWN wrapper\'s CLI wrote (the /proc ancestry, liveness included)', JSON.stringify({ f1: rr.f1, f2: rr.f2 }));
  ok(rr.nEarly === null && rr.nLanded && rr.n === SN, 'REAL processes: a DEAD CLI\'s leftover lock and a live external same-cwd claude started 3 s earlier are never adopted; the slow session\'s own lock is (round-2 finding 2)', JSON.stringify({ nEarly: rr.nEarly, n: rr.n }));
  ok(rr.noSidecar === null, 'no wrapper sidecar (no witness) ⇒ nothing (two locks here — the single-lock proof is below)');
  const rf = restoredFork(LC);
  ok(restoredJudged(rf), 'a restored ADOPTED chat fork (meta kept forkRequested:true, own id ≠ forkSourceId) is not pending ⇒ its own id is a CLAIM; a seeded / id-less / legacy pending fork stays pending (round-2 finding 5)', JSON.stringify(rf));
}

console.log('⑥ ROUND 3 — the writer witness, the boot dedup, the chat consumer, the R6 re-open');
{
  const w = await writerLegs(LC), wj = writerJudged(w);
  ok(wj.shape, 'REAL tree wrapper → claude.js → sleep: the sleep descends at depth 2, its comm is `sleep`, the CLI has not written its lock yet (the window the finding names)', JSON.stringify({ depth: w.childDepth, comm: w.childComm, ownYet: w.ownYet }));
  ok(wj.staleProc, 'a stale lock under the SLEEP\'s pid name, started inside the window, procStart ≠ the live pid\'s stat field 22 ⇒ nothing (round-3 finding 2: it was adopted)', JSON.stringify(w.staleProc));
  ok(wj.restored, 'the same stale lock and a RESTORED pending fork (created days ago) ⇒ nothing, its fork flag still set', JSON.stringify({ restored: w.restored, flag: w.restoredFlag }));
  ok(wj.staleNoProc, 'the same stale lock with NO procStart (a macOS / older-CLI shape) ⇒ nothing: the live pid is no claude by cli-identity', JSON.stringify(w.staleNoProc));
  ok(wj.own, 'the CLI\'s own lock (its pid wrote it: procStart matches) ⇒ adopted', JSON.stringify(w.own));
  ok(wj.chatFork, 'a restored pending CHAT fork adopts its own lock (the capture no longer refuses chat mode)', JSON.stringify(w.chatFork));
  ok(wj.noSidecar, 'NO sidecar and exactly ONE eligible lock in the dir (live, ours, written by its pid) ⇒ nothing — the rule itself, not a tie (round-3 finding 5)', JSON.stringify({ n: w.lockCount, got: w.noSidecar }));
  const nl = await nestedLegs(LC), nj = nestedJudged(nl);
  ok(nj.shape, 'REAL tree wrapper → claude.js → sh → claude.js: the CLI\'s own lock at depth 1, the nested claude\'s at depth 3', JSON.stringify({ up: nl.up, depths: nl.depths }));
  ok(nj.own, 'a restored record whose own id reads as a fork seed (forkRequested, no source, no adoption trace) ⇒ the capture answers NOTHING — never the nested claude\'s id (round-4 finding 1: the session was re-keyed to it)', JSON.stringify({ flag: nl.aFlag, got: nl.a }));
  ok(nj.fork, 'a genuine pending fork beside its CLI\'s nested claude adopts the CLI\'s OWN lock', JSON.stringify(nl.f));
  ok(nj.torn, 'the same fork with its CLI\'s lock TORN mid-rewrite: read as an unreadable placeholder, the capture answers nothing (never the nested claude\'s intact lock), and adopts its own once the rewrite lands (round-5 finding 2)', JSON.stringify({ read: nl.tornRead, torn: nl.torn, healed: nl.healed }));
  const d = dedupLeg(LC);
  ok(JSON.stringify(d) === JSON.stringify(['cw-4', 'cw-6']), 'boot dedup: a parent + its pending fork + an older server\'s never-adopted fork ⇒ NOTHING retired under the parent\'s id; two sockets that each own an id still dedup (cw-4 < cw-5, cw-6 < cw-7) (round-3 findings 1+4)', JSON.stringify(d));
  const cv = await consumerLeg(require(path.join(REPO, 'src/server/stdout/claude-stream-json.js')));
  ok(cv.id === FORK && JSON.stringify(cv.forkedFrom) === JSON.stringify([PARENT]) && cv.flag === false && cv.persisted, 'the chat consumer: an init glued behind dtach\'s \\e[H\\e[J preamble is parsed and the pending fork adopts it (persisted forkRequested:false)', JSON.stringify(cv));
  ok(cv.dropped === 1, 'a torn record after it is REPORTED (one `cli-unparsable-line` event), never silently dropped', JSON.stringify(cv.dropped));
  ok(cv.bannerEvents === 0 && cv.bannerCount === 1, 'dtach\'s five banners ([EOF - dtach terminating] and [got signal 15 - dying] as real clients wrote them, [detached], [read returned an error], [select failed]) are transport chatter: zero events, nothing counted (round-4 finding 2: one false report per natural exit; round 5: all five)', JSON.stringify({ events: cv.bannerEvents, count: cv.bannerCount }));
  ok(cv.chattyCount === 250 && cv.chattyEvents === 4, '249 more torn lines (#2…#250): the count is exact (250) and telemetry is capped like the log (#2, #3, #100, #200 go out — 4 events, not 249)', JSON.stringify({ count: cv.chattyCount, events: cv.chattyEvents }));
  const pr = await pipeReopenLeg(loadRealBr);
  ok(pr.reopened === 2 && JSON.stringify(pr.armed) === JSON.stringify(['sess-9-1']), 'boot-restore re-opens both daemon-pipe sessions and ARMS the capture from the re-open of the one that wants it (the pending fork; the plain one owns its id)', JSON.stringify(pr));
  ok(pr.forkFlag === true && pr.plainFlag === false, 'a re-opened pipe session restores its pending-fork flag (restoredForkPending) — the parser and the capture can both adopt it', JSON.stringify({ fork: pr.forkFlag, plain: pr.plainFlag }));
}

// ── wiring pins over CODE ONLY (round 3, finding 6: `/armRestoredCapture\(id,
// session\);/` was satisfied by `// armRestoredCapture(id, session);` — the
// 2.369.134 lesson). Whole-line comments and every `//` outside a string are
// removed before a pin reads a file.
const codeOnly = (src) => String(src).split('\n').map((l) => {
  if (/^\s*(\/\/|\*|\/\*)/.test(l)) return '';
  let q = null;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '/' && l[i + 1] === '/') return l.slice(0, i);
  }
  return l;
}).join('\n');
ok(!/armRestoredCapture\(id, session\);/.test(codeOnly('      // armRestoredCapture(id, session); // a pipe'))
  && !/armRestoredCapture\(id, session\);/.test(codeOnly('      foo(); // armRestoredCapture(id, session);'))
  && /armRestoredCapture\(id, session\);/.test(codeOnly("      armRestoredCapture(id, session); // a pipe")),
  'codeOnly control: a commented-out call (whole line or after code) no longer satisfies a pin; the live call still does');

console.log('⑥ WIRING — both capture sites use the ONE module');
{
  const wc = codeOnly(rd('src/ws-create.js')), br = codeOnly(rd('src/server/boot-restore.js')), cs = codeOnly(rd('src/server/stdout/claude-stream-json.js'));
  ok(/if \(lockCaptureWanted\(session\)\) \{/.test(wc) && /armLockCapture\(\{\s*id, session, activeSessions,\s*attempt: \(\) => captureLockId\(\{ session, id, activeSessions, sessionsDir: SESSIONS_DIR, sidecarPath: metaFileW, readPpid \}\),/.test(wc),
    'ws-create: the chain is gated by lockCaptureWanted and armed through armLockCapture with the wrapper sidecar as the witness');
  ok(/const adopted = adoptCapturedId\(session, lockId\);/.test(wc), 'ws-create: adopts through adoptCapturedId');
  ok(/attempt: \(\) => captureLockId\(\{ session: s, id, activeSessions, sessionsDir: SESSIONS_DIR, sidecarPath, readPpid \}\),/.test(br)
    && /restoredSidecars\.set\(id, wrapperFiles\.sidecar\);/.test(br)
    && /setTimeout\(\(\) => \{ for \(const \[id, s\] of activeSessions\) armRestoredCapture\(id, s\); \}, 2000\);/.test(br)
    && /armRestoredCapture\(id, session\);/.test(br),
    'boot-restore: every restored session (dtach AND R6 pipe) arms the same capture, witnessed by its resolved sidecar');
  ok((br.match(/_forkRequested: restoredForkPending\(meta\),/g) || []).length === 2, 'boot-restore: the fork flag is restored only while the record still names its source — dtach AND R6 pipe restores');
  ok(/^\s*if \(ownsItsId\(m\)\) dedupMetas\.push\(\{ sockFile, m \}\);$/m.test(br) && !/if \(m && m\.claudeSessionId\) dedupMetas\.push/.test(br), 'boot-restore: the conversation dedup is fed only metas that OWN their id (ownsItsId)');
  ok(/\.replace\(DTACH_CLEAR_PREAMBLE, ''\)/.test(cs) && /if \(parsed \|\| LOOKS_LIKE_RECORD\.test\(line\)\) noteDroppedLine\(session, id, parsed \? 'cli-line-handler-error' : 'cli-unparsable-line', line, e\);/.test(cs), 'the chat consumer strips the re-attach preamble and reports a dropped record');
  ok(!/DTACH_BANNER/.test(cs), 'the JSON-prefix test IS the whole record rule: no separate dtach banner list (round 5: it had no behaviour of its own under the prefix test)');
  ok(/isWriter: \(l\) => lockWrittenByItsPid\(l, \{ procStartOf, isCli \}\),/.test(codeOnly(fs.readFileSync(LC_PATH, 'utf8'))), 'captureLockId passes the writer witness to the pick');
  ok(/forkedFrom: session\.forkedFrom \|\| null,[\s\S]{0,400}?forkRequested: false,[\s\S]{0,400}?mode: session\.mode,/.test(cs), 'the stream parser\'s fork adoption write RE-LISTS forkRequested:false (it used to leave the stale true to the spread)');
  ok(!/lockData\.startedAt|claimed\.add\(os\.claudeSessionId\)|pickClaudeLock\(|readClaudeLocks\(|tryCapture\(15\)/.test(wc + br), 'CENSUS: no inline lock-matching loop and no capped claude chain left in ws-create / boot-restore');
}

console.log('⑦ NEGATIVE CONTROLS for ⑥ (patched copies of src/claude-lock-capture.js)');
{
  const M = globalThis.__forkMutants;
  const lcSrc = fs.readFileSync(LC_PATH, 'utf8');
  const mut = (tag, from, to) => { const t = lcSrc.replace(from, to); ok(t !== lcSrc, `control (${tag}) edit applied`); return M.load('src/claude-lock-capture.js', t, tag); };
  const LCc = mut('c', "  return !!session._forkRequested;\n", '  return false;\n');
  const rc = chainJudged(await terminalForkChain(LCc));
  ok(!rc.captured && !rc.bound && !rc.groups, 'control (c): the capture gated on an EMPTY id (the shipped gate) ⇒ the terminal fork keeps the parent id, nothing binds ⇒ ⑥ RED (round-1 finding 1, reproduced)');
  const LCd = mut('d', '    if (os._forkRequested) continue;\n', '');
  const rd1 = parentRace(LCd, 'fork-first'), rd2 = parentRace(LCd, 'parent-first');
  ok(rd1.pick !== PARENT && rd2.pick !== PARENT, 'control (d): a fork\'s seed counted as a claim ⇒ the parent cannot adopt its own lock ⇒ ⑥ RED (round-1 finding 3)', JSON.stringify({ rd1, rd2 }));
  const LCe = mut('e', '    const d = Number(pidDepth(l.pid)) || 0;\n', '    const d = 1;\n');
  const re = siblingPicks(LCe, false), re2 = siblingPicks(LCe, false, false), rex = strayJudged(strayPicks(LCe));
  ok(re.f1Early === S2 && re2.f1Early === S2 && !rex.external, 'control (e): the pid witness removed (every lock "ours") ⇒ the earlier session takes its sibling\'s lock, the external lock is adopted ⇒ ⑥ RED (round-2 findings 1+2, reproduced)', JSON.stringify({ re, ext: rex.external }));
  const LCf = mut('f', '  if (excludeId && best.sessionId === excludeId) return null;\n', '');
  const rf = strayPicks(LCf);
  ok(rf.seedLock === PARENT, 'control (f): excludeId removed ⇒ the fork adopts its SEED (the parent\'s id) ⇒ ⑥ RED', JSON.stringify(rf.seedLock));
  const LCg = mut('g', '  if (!(Number(best.startedAt) >= t0)) return null;\n', '');
  ok(strayPicks(LCg).stale === SD, 'control (g): the start floor removed ⇒ a stale file under a re-used pid name is adopted ⇒ ⑥ RED');
  const LCh = mut('h', '  const step = () => {\n', '  const step = () => {\n    if (n >= 15) { ARMED.delete(session); return; }\n');
  const rh = driveArm(LCh, 40);
  ok(rh.adopted === null && rh.calls <= 16, 'control (h): the old attempt cap put back ⇒ a lock landing after ~17 s is never adopted ⇒ ⑥ RED (round-2 finding 3, reproduced)', JSON.stringify({ adopted: rh.adopted, calls: rh.calls }));
  const LCi = mut('i', "  if (!meta || !meta.forkRequested) return false;\n", "  return !!(meta && meta.forkRequested);\n");
  ok(!restoredJudged(restoredFork(LCi)) && !restoredFork(LCi).claimed.includes(FORK), 'control (i): the flag restored verbatim (the pre-fix boot-restore) ⇒ an adopted chat fork\'s own id claims nothing ⇒ ⑥ RED (round-2 finding 5, reproduced)');
  const LCj = mut('j', '    isWriter: (l) => lockWrittenByItsPid(l, { procStartOf, isCli }),\n', '');
  const rj = writerJudged(await writerLegs(LCj));
  ok(!rj.staleProc && !rj.restored, 'control (j): the writer witness removed ⇒ the stale lock under the sleep\'s pid is adopted and the restored fork clears its flag on it ⇒ ⑥ RED (round-3 finding 2, reproduced)', JSON.stringify(rj));
  const LCk = mut('k', '  if (!wrapperPid) return null;\n', '  if (!wrapperPid) return pickClaudeLock({ locks: readClaudeLocks(sessionsDir), createdAt: session.createdAt, claimed: claimedLockIds(activeSessions, id), excludeId: session._forkRequested ? session.claudeSessionId : null, pidDepth: () => 1 });\n');
  const rk = writerJudged(await writerLegs(LCk));
  ok(!rk.noSidecar, 'control (k): the no-sidecar rule inverted (no witness ⇒ every lock ours) ⇒ the single-lock leg adopts ⇒ ⑥ RED (round-3 finding 5: the old leg stayed green by a tie)', JSON.stringify(rk));
  const LCn = mut('n', "  return !!session._forkRequested;\n", "  return !!session._forkRequested && session.mode !== 'chat';\n");
  ok(!writerJudged(await writerLegs(LCn)).chatFork, 'control (n): the chat exclusion put back ⇒ a restored pending chat fork never adopts from its lock ⇒ ⑥ RED (round-3 finding 3a)');
  const LCo = mut('o', '  return !!(meta && meta.claudeSessionId) && !restoredForkPending(meta);\n', '  return !!(meta && meta.claudeSessionId);\n');
  const ro = dedupLeg(LCo);
  ok(ro.includes('cw-1'), 'control (o): every meta with an id fed to the dedup (the shipped loop) ⇒ the PARENT (cw-1) is retired beside its own fork ⇒ ⑥ RED (round-3 findings 1+4)', JSON.stringify(ro));
  const CS_PATH = path.join(REPO, 'src/server/stdout/claude-stream-json.js');
  const csSrc = fs.readFileSync(CS_PATH, 'utf8');
  const mutCs = (tag, from, to) => { const t = csSrc.replace(from, to); ok(t !== csSrc, `control (${tag}) edit applied`); return M.load('src/server/stdout/claude-stream-json.js', t, tag); };
  const cl = await consumerLeg(mutCs('l', ".trim().replace(DTACH_CLEAR_PREAMBLE, '').trim();", '.trim();'));
  ok(cl.id === PARENT && cl.flag === true, 'control (l): the preamble strip removed ⇒ the glued init is lost and the fork keeps its parent\'s id ⇒ ⑥ RED (round-3 finding 3b, reproduced)', JSON.stringify(cl));
  const cm = await consumerLeg(mutCs('m', "          if (parsed || LOOKS_LIKE_RECORD.test(line)) noteDroppedLine(session, id, parsed ? 'cli-line-handler-error' : 'cli-unparsable-line', line, e);\n", ''));
  ok(cm.dropped === 0, 'control (m): the report removed (the shipped bare catch) ⇒ the torn record vanishes without a trace ⇒ ⑥ RED');
  const brSrc = fs.readFileSync(BR_PATH, 'utf8');
  const brP = brSrc.replace('      armRestoredCapture(id, session); // a pipe', '      // armRestoredCapture(id, session); // a pipe');
  ok(brP !== brSrc, 'control (p) edit applied');
  const rp = await pipeReopenLeg(() => M.load('src/server/boot-restore.js', brP, 'p'));
  ok(rp.reopened === 2 && rp.armed.length === 0, 'control (p): the R6 re-open call commented out ⇒ nothing is armed ⇒ ⑥ RED (round-3 finding 6: the old substring pin stayed green)', JSON.stringify(rp));
  ok(!/armRestoredCapture\(id, session\);/.test(codeOnly(brP).split('restoreAgentdPipeSessions')[1] || ''), 'control (p): …and the code-only pin no longer sees the call');
  // round 4
  const LCq = mut('q', `    if (unreadable && !Number.isInteger(Number(l.pid))) continue;
    const d = Number(pidDepth(l.pid)) || 0;`, `    if (unreadable && !Number.isInteger(Number(l.pid))) continue;
    if (claimed && claimed.has(l.sessionId)) continue;
    if (excludeId && l.sessionId === excludeId) continue;
    if (!(Number(l.startedAt) >= t0)) continue;
    const d = Number(pidDepth(l.pid)) || 0;`);
  const rqs = strayJudged(strayPicks(LCq)), rqn = nestedJudged(await nestedLegs(LCq));
  ok(!rqs.pastSeed && !rqs.pastClaimed && !rqs.pastFloor && !rqn.own, 'control (q): the one-pass filter put back (exclusions skip the nearest lock) ⇒ the nested claude\'s id is adopted, in the pure table AND over the real tree ⇒ ⑥ RED (round-4 finding 1, reproduced)', JSON.stringify({ rqs, rqn }));
  const LCs = mut('s', `  const ff = Array.isArray(meta.forkedFrom) ? meta.forkedFrom : [];
  return !(ff.length > 0 && !ff.includes(cur));`, '  return true;');
  const rs = restoredFork(LCs);
  ok(rs.pre134Adopted === true && rs.pre134Owns === false && rs.pre134Wanted === true, 'control (s): no source ⇒ always pending (the round-3 rule) ⇒ a chat fork a pre-.134 server adopted is misread as pending, left out of the dedup and captured for life ⇒ ⑥ RED', JSON.stringify(rs));
  // round 5: control (r) reverts the prefix test ALONE (it used to bundle a
  // second edit, so the regex itself was never proven)
  const cr = await consumerLeg(mutCs('r', 'const LOOKS_LIKE_RECORD = /^(?:\\x1b\\[[0-9;?]*[A-Za-z]|\\s)*(?:\\{\\s*["}]|\\[\\s*[[{"\\]])/;', 'const LOOKS_LIKE_RECORD = /^(?:\\x1b\\[[0-9;?]*[A-Za-z]|\\s)*[[{]/;'));
  ok(cr.bannerCount === 6 && cr.bannerEvents === 2, 'control (r): ONLY the pre-fix `[[{]` prefix test put back ⇒ all five dtach banners counted as dropped records (#2…#6; #2 and #3 reach telemetry under the cap) ⇒ ⑥ RED (round-4 finding 2 + round-5 finding 1, reproduced)', JSON.stringify({ events: cr.bannerEvents, count: cr.bannerCount }));
  // round 5: a torn lock skipped silently (the round-4 reader) / a placeholder
  // skipped by the pick ⇒ the nested claude's lock becomes "the nearest"
  const LCu = mut('u', `    } else if (namePid) {
      // round 5`, `    } else if (false) {
      // round 5`);
  const ruRaw = await nestedLegs(LCu), ru = nestedJudged(ruRaw);
  ok(!ru.torn && ruRaw.torn === SNEST3, 'control (u): the reader skips a torn lock again (the round-4 readClaudeLocks) ⇒ over the real tree the fork adopts the NESTED claude\'s id while its own lock is torn ⇒ ⑥ RED (round-5 finding 2, reproduced)', JSON.stringify({ torn: ruRaw.torn, read: ruRaw.tornRead }));
  const LCv = mut('v', "    if (unreadable && !Number.isInteger(Number(l.pid))) continue;\n", "    if (unreadable) continue;\n");
  const rvRaw = strayPicks(LCv), rv = strayJudged(rvRaw);
  ok(rvRaw.pastTorn === SNEST && !rv.tornTie, 'control (v): the pick skips an unreadable placeholder ⇒ the nested lock below a torn nearest one is adopted and a torn tie is no tie ⇒ ⑥ RED', JSON.stringify(rv));
  const ct = await consumerLeg(mutCs('t', '  if (!(n <= 3 || n % 100 === 0)) return;\n', ''));
  ok(ct.chattyEvents === 249, 'control (t): the telemetry cap removed ⇒ one event per torn line (249) ⇒ ⑥ RED', JSON.stringify(ct.chattyEvents));
  for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 22 })) ok(row.pass, row.name, row.detail);
}

// ── the REAL home is untouched (this process was re-homed before any fixture was written) ──
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  ok(lit.offenders.length === 0, `the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, JSON.stringify(lit.offenders.slice(0, 3)));
}

console.log(`\ntest-fork-groups: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
