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

const STAT_MS = 3000;

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
async function jobWhere({ body, session, hubMachine, hostName = null, stat = (p) => fs.promises.stat(p), blocked = mountDoor.blocked, statMs = STAT_MS } = {}) {
  const remote = session && session.host ? String(hostName || session.hostName || session.host) : null;
  const cwd = cwdOfBody(body);
  let cwdExists = null, cwdBlocked = false;
  const relative = !!remote && startsProcess(body) && !(cwd && path.isAbsolute(cwd));
  if (remote && cwd && !relative) {
    if (blocked(cwd)) cwdBlocked = true;
    else {
      let t = null;
      const slow = new Promise((res) => { t = setTimeout(() => res('slow'), statMs); t.unref?.(); });
      const asked = Promise.resolve().then(() => stat(cwd)).then((st) => (st && st.isDirectory() ? 'dir' : 'not-dir'), (e) => (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR') ? 'missing' : 'unknown'));
      try {
        const r = await Promise.race([asked, slow]);
        if (r === 'slow') cwdBlocked = true;
        else if (r === 'missing' || r === 'not-dir') cwdExists = false;
        else if (r === 'dir') cwdExists = true;
      } finally { clearTimeout(t); }
    }
  }
  return jobWhereVerdict({ hubMachine, sessionMachine: remote, cwd, cwdExists, cwdBlocked, relative });
}

module.exports = { jobWhere, cwdOfBody, startsProcess, STAT_MS };
