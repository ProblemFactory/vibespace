'use strict';
// THE PROCESSES BELOW A CLI, READ WITHOUT HOLDING THE HUB — lane turn-never-silent (law L1; src/turn-liveness.js judges what
// this reads). The witness of «working» is the processes BELOW a session's CLI — never the CLI's own counters (measured
// 2026-11-12: a stuck agy turn's ONE child sat at 0 CPU ticks for 27 minutes while agy itself used 22–58 ticks/min).
//
// HOW IT READS:
//   · fs.promises ONLY (the libuv threadpool) — never a synchronous call on the hub's loop;
//   · the CLI's OWN children files (/proc/<pid>/task/<tid>/children, every thread's), then each child's, breadth first —
//     never a walk of all of /proc;
//   · each child's stat is checked against its PARENT as it is walked (a pid is never an identity: a pid reused between
//     the children file and the stat belongs to another tree), and a zombie is not counted (it holds nothing, works nothing);
//   · at most TREE_MAX processes a reading; past it `cut` says so — and a cut reading is never judged «still» (turn-liveness
//     treeWorked), so which processes were left unread changes no verdict;
//   · per process: utime + stime (stat), rchar + wchar (io; null when unreadable — never invented as 0), its birth.
// THE ROOT is the process the session's wrapper started (the sidecar's childPid), proven by the tree's SHAPE: its parent
// is the wrapper (the sidecar's pid) — a recycled pid under another parent is no root of ours.
// A hub without /proc (macOS), a kernel without children files, a paired machine's session: `readable: false` with the
// reason — the verdict says «unknown», never «stuck».

const fs = require('fs');
const path = require('path');
const TL = require('../turn-liveness.js');

function createProcTree({ procRoot = '/proc', fsp = fs.promises, max = TL.TREE_MAX } = {}) {
  const P = (...a) => path.join(procRoot, ...a.map(String));
  async function stat(pid) { try { return TL.parseStat(await fsp.readFile(P(pid, 'stat'), 'utf8')); } catch { return null; } }
  async function io(pid) { try { return TL.parseIo(await fsp.readFile(P(pid, 'io'), 'utf8')); } catch { return null; } }
  /** a process's children (every thread's children file) — null when the files are ABSENT (no such kernel support) */
  async function childrenOf(pid) {
    let tasks; try { tasks = await fsp.readdir(P(pid, 'task')); } catch { return null; }
    const out = []; let read = 0;
    for (const tid of tasks) {
      try { for (const k of (await fsp.readFile(P(pid, 'task', tid, 'children'), 'utf8')).split(/\s+/).filter(Boolean)) out.push(Number(k)); read++; } catch { }
    }
    return read ? [...new Set(out)].filter((k) => Number.isInteger(k) && k > 0) : (tasks.length ? null : []);
  }

  /** ONE READING below `root` → {readable, why, alive, at, cut, list: [{pid, ppid, startTicks, ticks, io, comm, state}]}.
   *  `parent`: the wrapper's pid — when given, the root must be its child (the shape proves it). */
  async function readBelow(root, { parent = null, now = () => Date.now() } = {}) {
    const at = now();
    const none = (why, alive = false) => ({ readable: false, why, alive, at, cut: false, list: [] });
    if (!Number.isInteger(root) || root <= 1) return none('no CLI pid');
    try { await fsp.access(P('self', 'stat')); } catch { return none('no /proc on this machine'); }
    const r = await stat(root);
    if (!r || r.state === 'Z') return { readable: true, why: 'the CLI is gone', alive: false, at, cut: false, list: [] };
    if (Number.isInteger(parent) && parent > 1 && r.ppid !== parent) return { readable: true, why: 'the pid is not the wrapper\'s child (reused)', alive: false, at, cut: false, list: [] };
    const first = await childrenOf(root);
    if (first === null) return none('no children files on this kernel', true);
    const list = []; let cut = false;
    const queue = first.map((pid) => ({ pid, parent: root }));
    const seen = new Set([root]);
    while (queue.length) {
      const { pid, parent: pp } = queue.shift();
      if (seen.has(pid)) continue; seen.add(pid);
      const s = await stat(pid);
      if (!s || s.ppid !== pp || s.state === 'Z') continue;   // ended, reparented (another tree now), or a zombie
      if (list.length >= max) { cut = true; break; }
      list.push({ pid, ppid: s.ppid, startTicks: s.startTicks, ticks: s.ticks, io: await io(pid), comm: s.comm, state: s.state });
      for (const k of (await childrenOf(pid)) || []) queue.push({ pid: k, parent: pid });
    }
    return { readable: true, why: null, alive: true, at, cut, list };
  }
  return { readBelow, childrenOf, stat };
}

module.exports = { createProcTree };
