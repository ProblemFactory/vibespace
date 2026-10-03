'use strict';
// worker-pool.js — the daemon's R2 fs worker pool (docs/design-three-tier.md): deadline → terminate → respawn. DEVICE
// tier, node builtins only; agentd.js hands it its OWN bundle path (`new Worker(file)` re-enters the single-file bundle,
// whose worker branch runs FS_ACTIONS). Returns null where worker_threads is unavailable or off the main thread —
// runFs() then runs the same FS_ACTIONS inline (one implementation, honest fallback).
//
// B-442c (2026-10-02, the 16:23 OOM that stopped the production service): a scratch daemon whose bundle had been deleted
// under it (a suite's rm -rf of its root) lost ONE worker to a deadline. Every respawn then failed to load
// (MODULE_NOT_FOUND), and a failed Worker emits 'error' AND 'exit' — both ran die(): each failure decremented `live`
// twice and scheduled two respawns, `live` went negative, the SIZE cap stopped binding and the pool doubled every
// ~0.5 s — 45.7 GB anon RSS and 5.7 TB virtual (an isolate per worker) within two minutes (reproduced on the real
// bundle: 94 MB → 4.2 GB, 978 threads, 10 s after the death). THE BOUNDS: a worker dies ONCE (die is idempotent);
// `live` never exceeds `size`; a death the pool did not ask for — an 'error', or an exit before any terminate — is a
// CRASH, and consecutive crashes back off (respawnMs doubling up to respawnMaxMs) and are said, never a storm — only a
// worker spawned AFTER a crash ends the backoff, by answering a job (a healthy sibling's answers prove nothing about
// the file a respawn loads). A deadline's terminate is not a crash: that respawn keeps the R2 pace.
//
// verify r1 (2026-10-02): a thread blocked IN A SYSCALL — a hung mount, a FIFO with no writer — cannot be terminated:
// its 'exit' waits for the kernel. Two such reads held both slots, `alive()` stayed true, and every later op sat in
// the queue with no deadline — the device's whole fs surface hung, silently (measured on the real daemon: every stat
// '/' timed out at the client's 30 s, nothing in agentd.log). Now a terminated worker still alive `wedgeMs` later is
// ABANDONED: its slot is refilled (at most `maxWedged` times — each costs a thread), it is said, and a job waits in
// the queue no longer than its own deadline, then fails BY NAME. With every slot wedged the pool fails ops by name
// (never inline: the same path would wedge the loop that holds the session pipes). And `process.exit` JOINS every
// worker thread — one blocked in the kernel never joins: SIGTERM logged "exiting" and the daemon stayed, serving
// nothing (measured). `exit(code)` runs the exit handlers and ends by SIGKILL while any worker is stuck.

function createWorkerPool({ file, workerData = { role: 'agentd-worker' }, size = 2, respawnMs = 500, respawnMaxMs = 60000, wedgeMs = 2000, maxWedged = 8, log = () => { }, workerThreads } = {}) {
  let wt = workerThreads || null; if (!wt) try { wt = require('worker_threads'); } catch { }
  if (!wt || !wt.isMainThread) return null;
  const idle = [], queue = [], all = new Set();
  let live = 0, crashesInRow = 0, pending = 0, wedged = 0, lastWedge = '';
  const counts = { spawned: 0, deaths: 0, crashes: 0, maxLive: 0, abandoned: 0 };
  const say = (m) => { try { log(m); } catch { } };
  const later = (ms) => { pending++; const t = setTimeout(() => { pending--; spawnWorker(); }, ms); t.unref?.(); return ms; };
  const backoffMs = () => Math.min(respawnMaxMs, respawnMs * 2 ** Math.min(crashesInRow, 20));
  function crashed(why) {
    crashesInRow++; counts.crashes++;
    const ms = later(backoffMs());
    say(`fs worker crashed (${why}) — ${crashesInRow} in a row, the next respawn in ${Math.round(ms / 100) / 10} s (B-442c backoff: a pool never storms)`);
  }
  function abandon(w, what) {
    if (w._dead || w._abandoned) return;
    w._abandoned = lastWedge = what; live--; wedged++; counts.abandoned++;
    const i = idle.indexOf(w); if (i >= 0) idle.splice(i, 1);
    w._replaced = wedged <= maxWedged;
    if (w._replaced) later(respawnMs);
    say(`fs worker wedged in the kernel on ${what} — terminate cannot end it; its slot ${w._replaced ? 'is refilled' : 'stays empty'} (${wedged} wedged, cap ${maxWedged})`);
  }
  function spawnWorker() {
    if (live >= size) return;
    let w;
    try { w = new wt.Worker(file, { workerData }); } catch (e) { crashed((e && (e.code || e.message)) || String(e)); return; }
    live++; counts.spawned++; counts.maxLive = Math.max(counts.maxLive, live); all.add(w);
    const probe = crashesInRow > 0; // spawned during a backoff: its first answer proves the file loads again
    w.unref();
    w._jobs = new Map();
    w.on('message', (m) => {
      const j = w._jobs.get(m.id);
      if (probe) crashesInRow = 0; // the respawn that crashed before now answers — the backoff is over
      if (j) { w._jobs.delete(m.id); clearTimeout(j.t); j.resolve(m); pump(w); }
    });
    let error = null;
    const die = (code) => {
      if (w._dead) return; // a failed Worker emits 'error' THEN 'exit': ONE death (the pre-fix pool counted two)
      w._dead = true; counts.deaths++; clearTimeout(w._grace); all.delete(w);
      if (w._abandoned) { wedged--; say(`fs worker wedged on ${w._abandoned} exited at last (${wedged} still wedged)`); if (!w._replaced) later(respawnMs); return; }
      live--;
      for (const j of w._jobs.values()) { clearTimeout(j.t); j.reject(new Error('worker died')); }
      w._jobs.clear();
      const i = idle.indexOf(w); if (i >= 0) idle.splice(i, 1);
      if (error) crashed(error); else if (!w._terminated) crashed(`exited on its own, code ${code}`); else later(respawnMs);
    };
    w.on('error', (e) => { error = (e && (e.code || e.message)) || 'error'; die(); });
    w.on('exit', die);
    idle.push(w);
    pump(w);
  }
  function pump(w) {
    if (w._jobs.size || w._terminated) return; // one in-flight per worker — deadline stays attributable
    const job = queue.shift();
    if (!job) { if (!idle.includes(w)) idle.push(w); return; }
    clearTimeout(job.qt);
    const i = idle.indexOf(w); if (i >= 0) idle.splice(i, 1);
    w._jobs.set(job.id, job);
    job.t = setTimeout(() => {
      // deadline: the op is STUCK (hung mount class). Kill the whole worker —
      // a thread wedged in a sync fs call can't be cancelled any other way.
      w._jobs.delete(job.id);
      job.reject(new Error('fs deadline (' + job.msg.action + ')'));
      w._terminated = true;
      try { w.terminate(); } catch { }
      w._grace = setTimeout(() => abandon(w, `${job.msg.action} ${job.msg.path || ''}`.trim()), wedgeMs);
      w._grace.unref?.();
    }, job.timeoutMs);
    try { w.postMessage(job.msg); } catch (e) { clearTimeout(job.t); w._jobs.delete(job.id); job.reject(e); }
  }
  let nextJob = 1;
  for (let k = 0; k < size; k++) spawnWorker();
  return {
    run(action, params, timeoutMs = 10000) {
      return new Promise((resolve, reject) => {
        const job = { id: nextJob++, msg: { id: 0, action, ...params }, timeoutMs, resolve, reject };
        job.msg.id = job.id;
        const w = idle[0];
        if (!w && live === 0 && !wedged) return reject(new Error('no workers')); // runFs's inline fallback (a crash backoff)
        if (!w && live === 0 && !pending) return reject(new Error(`fs pool exhausted (${action}): ${wedged} workers wedged in the kernel (last on ${lastWedge}) — not run inline, it would wedge the daemon's loop`));
        queue.push(job);
        job.qt = setTimeout(() => {
          const k = queue.indexOf(job); if (k < 0) return;
          queue.splice(k, 1);
          reject(new Error(`fs deadline (${action}): never started — ${live} worker(s) busy, ${wedged} wedged in the kernel`));
        }, timeoutMs);
        if (w) pump(w);
      });
    },
    alive: () => live > 0 || wedged > 0, // wedged workers: fail by name, never inline
    /** {live, spawned, deaths, crashes, crashesInRow, maxLive, wedged, abandoned, pending, stuck} — the bounds, observable
     *  (test-agentd-worker-pool); `stuck` = threads a join may wait on (a job in flight, or terminated and not yet gone) */
    stats: () => ({ live, crashesInRow, wedged, pending, ...counts, stuck: [...all].filter((w) => w._jobs.size || w._terminated).length }),
    /** the process's exit that no stuck worker can hold: process.exit when every thread can join, else the exit handlers
     *  (the singleton lock's unlink) and SIGKILL */
    exit(code) {
      const stuck = [...all].filter((w) => w._jobs.size || w._terminated).length;
      if (stuck) { say(`exit ${code}: ${stuck} fs worker(s) blocked in the kernel would hold process.exit forever (it joins every thread) — exit handlers, then SIGKILL`); try { process.emit('exit', code); } catch { } process.kill(process.pid, 'SIGKILL'); }
      process.exit(code);
    },
  };
}

module.exports = { createWorkerPool };
