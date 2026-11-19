'use strict';
// B-70f9 (the owner's option A, 2026-11-18): A JOB RUNS ON THE HUB'S MACHINE — never on another. The create route's check of the
// folder a conversation on ANOTHER machine names, asked on the hub before anything is created:
//   - the folder a body names: a task's `cmd.cwd`, or a schedule's task (`action.task.cmd.cwd` — `--every` / `--cron` / `--at`);
//   - a relative folder, or none, from a remote conversation is refused: it would name the hub's own process folder (the checkout);
//   - the blocked-path door first (a mount struck as not answering is never asked), then ONE stat OFF the loop, BOUNDED (a mount
//     that hangs before its first strike, a person's own sshfs / NFS, answers «does not answer right now» — never a request left
//     open, never a thread held without end);
//   - only ENOENT / ENOTDIR (or a file where a folder is asked) is «not there»; another failure (EACCES …) decides nothing —
//     the job is created as before and its start says what it meets.
// A conversation on the hub's own machine is never asked (its folder is the hub's). The words: src/job-model.js jobWhereVerdict.
const fs = require('fs');
const path = require('path');
const mountDoor = require('../mount-door.js');
const { jobWhereVerdict } = require('../job-model.js');
const { mountOf } = require('../fd-budget.js');   // PURE: /proc/self/mountinfo text + a path → the mount it lives on

const STAT_MS = 3000;
// cure 2 (主开发 10:30Z): ONE STUCK STAT A MOUNT, NEVER SEVERAL. The 3 s race bounds the ANSWER, not the stat: on a mount that wedges
// before the liveness sweep strikes it, the stat it gave up on still holds a thread of the pool. While a stat on a mount is out, a new
// ask for that mount waits for it (inside its own bound) — the same folder takes its answer — and never starts a second one beside it
const inFlight = new Map();   // mount point (or the folder, when the mount table cannot be read) → {path, p}
const readMountinfo = (given) => (given != null ? Promise.resolve(String(given)) : fs.promises.readFile('/proc/self/mountinfo', 'utf8').catch(() => ''));   // procfs: memory, never a mount
const within = (p, ms) => { let t = null; return Promise.race([p, new Promise((r) => { t = setTimeout(() => r('slow'), Math.max(0, ms)); t.unref?.(); })]).finally(() => clearTimeout(t)); };
const classify = (st) => (st && st.isDirectory() ? 'dir' : 'not-dir');
const classifyErr = (e) => (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR') ? 'missing' : 'unknown');
async function statOnce(key, cwd, stat, statMs) {
  const t0 = Date.now(), left = () => statMs - (Date.now() - t0);
  for (let ahead = inFlight.get(key); ahead; ahead = inFlight.get(key)) {
    if (ahead.path === cwd) return within(ahead.p, left());   // the same folder: the answer of the stat already out
    if ((await within(ahead.p.then(() => 'done', () => 'done'), left())) === 'slow') return 'slow';   // that mount does not answer
  }
  const entry = { path: cwd, p: Promise.resolve().then(() => stat(cwd)).then(classify, classifyErr) };
  inFlight.set(key, entry);
  entry.p.then(() => { if (inFlight.get(key) === entry) inFlight.delete(key); });
  return within(entry.p, left());
}

/** the folder a create body names (a task's, or a schedule's task's) — or null */
function cwdOfBody(b) {
  const top = b && b.cmd && typeof b.cmd.cwd === 'string' ? b.cmd.cwd : null;
  const task = b && b.action && b.action.type === 'spawn-task' && b.action.task && b.action.task.cmd && typeof b.action.task.cmd.cwd === 'string' ? b.action.task.cmd.cwd : null;
  return top || task || null;
}
/** does the body start a process at all (a task, a service, a schedule's task — never a pure notify cron)? */
function startsProcess(b) {
  return !!(b && (b.cmd || (b.action && b.action.type === 'spawn-task')));
}

/** → jobWhereVerdict's answer: {ok: true, words} | {ok: false, code, error} */
async function jobWhere({ body, session, hubMachine, hostName = null, stat = (p) => fs.promises.stat(p), blocked = mountDoor.blocked, statMs = STAT_MS, mountinfo = null } = {}) {
  const remote = session && session.host ? String(hostName || session.hostName || session.host) : null;
  const cwd = cwdOfBody(body);
  let cwdExists = null, cwdBlocked = false;
  const relative = !!remote && startsProcess(body) && !(cwd && path.isAbsolute(cwd));
  if (remote && cwd && !relative) {
    if (blocked(cwd)) cwdBlocked = true;
    else {
      const key = (mountOf(cwd, await readMountinfo(mountinfo)) || {}).target || cwd;
      const r = await statOnce(key, cwd, stat, statMs);
      if (r === 'slow') cwdBlocked = true;
      else if (r === 'missing' || r === 'not-dir') cwdExists = false;
      else if (r === 'dir') cwdExists = true;
    }
  }
  return jobWhereVerdict({ hubMachine, sessionMachine: remote, cwd, cwdExists, cwdBlocked, relative });
}

/** cure 2 (主开发 10:30Z): THE CREATE DOOR ANSWERS EVERY THROW — the agent create route is async since the folder check, and Express 4
 *  catches no rejection: a throw after its await (the create, its answer) would only be logged while the agent's command waits with
 *  no answer. → an Express handler that answers it by name (500 create-failed), never twice */
function answersEveryThrow(handler, log = console) {
  return (req, res) => Promise.resolve().then(() => handler(req, res)).catch((e) => answerCreateFailed(res, e, log));
}
/** the create door's ONE answer to a throw (its words stand once): said in the log, then 500 create-failed by name — only when no
 *  answer went out. The wrapper's, and the reply's own catch when the reply is built later (lane lg-store-writes U4: inside the
 *  store's callback, once jobs.json holds the job — a throw there reaches no wrapper) */
function answerCreateFailed(res, e, log = console) {
  try { log.warn && log.warn('[jobs] the agent create route failed:', (e && e.message) || e); } catch { }
  if (res.headersSent) return;
  try { res.status(500).json({ error: `the job create failed on the hub: ${String((e && e.message) || e).slice(0, 200)} — \`vibespace-job list --mine\` says whether a job was made`, code: 'create-failed' }); } catch { }
}

module.exports = { jobWhere, cwdOfBody, startsProcess, answersEveryThrow, answerCreateFailed, STAT_MS, _inFlight: inFlight };
