'use strict';
// THE /proc LISTEN READER (lane artifacts-services; moved out of port-forward.js's detectLocal, which keeps reading it):
// the TCP sockets in LISTEN in this network namespace, a process tree, and the ports that tree listens on. ASYNC only
// (fs.promises — the 2.241.2 lesson: the sync sweep was the largest main-thread consumer on a busy pod) and BOUNDED;
// never an exec. The jobs engine reads a service's port facts through it on its own tick (src/jobs.js `_listenRead`).
const fs = require('fs');

/** Every TCP socket in LISTEN: [{port, inode}] (st column '0A'; local_address HEXIP:HEXPORT; inode = column 10). */
async function listenSockets() {
  const out = [];
  for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let txt = '';
    try { txt = await fs.promises.readFile(f, 'utf-8'); } catch { continue; }
    for (const line of txt.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10 || cols[3] !== '0A') continue;
      const port = parseInt(String(cols[1]).split(':').pop(), 16);
      if (port > 0 && port < 65536) out.push({ port, inode: cols[9] });
    }
  }
  return out;
}

/** A process and its descendants (each task's `children` file), breadth-first, at most `max` pids. */
async function pidTree(root, { max = 64 } = {}) {
  const seen = [];
  const queue = [Number(root)].filter((p) => p > 0);
  while (queue.length && seen.length < max) {
    const pid = queue.shift();
    if (seen.includes(pid)) continue;
    seen.push(pid);
    let tids = [];
    try { tids = await fs.promises.readdir(`/proc/${pid}/task`); } catch { continue; }
    for (const tid of tids.slice(0, 32)) {
      let kids = '';
      try { kids = await fs.promises.readFile(`/proc/${pid}/task/${tid}/children`, 'utf-8'); } catch { continue; }
      for (const k of kids.trim().split(/\s+/)) if (/^\d+$/.test(k)) queue.push(Number(k));
    }
  }
  return seen;
}

/** The ports a set of pids listens on: their fds' socket inodes ∩ the LISTEN table. `budget` bounds the readlinks. */
async function listenPortsOf(pids, { budget = 2000 } = {}) {
  const socks = await listenSockets();
  if (!socks.length || !pids || !pids.length) return [];
  const byInode = new Map(socks.map((s) => [s.inode, s.port]));
  const ports = new Set();
  for (const pid of pids) {
    let fds = [];
    try { fds = await fs.promises.readdir(`/proc/${pid}/fd`); } catch { continue; } // gone, or not ours
    for (const fd of fds) {
      if (--budget <= 0) return [...ports].sort((a, b) => a - b);
      let ln = '';
      try { ln = await fs.promises.readlink(`/proc/${pid}/fd/${fd}`); } catch { continue; }
      const m = /^socket:\[(\d+)\]$/.exec(ln);
      if (m && byInode.has(m[1])) ports.add(byInode.get(m[1]));
    }
  }
  return [...ports].sort((a, b) => a - b);
}

module.exports = { listenSockets, pidTree, listenPortsOf };
