'use strict';
/**
 * THE WRITER'S EXIT KEEPER (lane hub-loop-stalls commit 2 — round 6, 主开发's law: NO BOUND OF OURS CUTS AN EXIT THAT IS
 * STILL WRITING). A thread that is not the main thread and needs NOTHING from the storage at the moment it is needed: the
 * SERVER'S BOOT starts it by name (src/store-writer.js bootKeeper(), called by server.js — no other process has one), from
 * the TEXT of this file and store-pace's that the boot read (the thread itself reads nothing of the install), and it SLEEPS
 * on a shared cell until the exit arms it.
 *  · A STOP ASKED: at the grace less its slack (store-pace keeperStopAtMs) ONE line on fd 2 (store-pace keeperLine) — the
 *    writer's word on its stores (a shared text it publishes at each step) and what the main thread is in, FROM THE
 *    KERNEL: its syscall (/proc/self/task/<pid>/syscall), the file of an fd-based call (readlink /proc/self/fd/N) or the
 *    path argument of a path-based one (read from this process's own /proc/self/mem, capped), its wait channel. It ENDS
 *    NOTHING, crash or no crash: the service manager's own kill is already coming at the stop + the grace.
 *  · A CRASH WITH NO STOP ASKED: no manager will end it, so the keeper is the manager — ONE FULL GRACE from the crash
 *    (keeperCrashMs), then the line «after the crash» and SIGKILL, the one signal a process whose main thread is asleep in
 *    the kernel cannot miss. Never sooner; nothing is measured.
 * One line, ever. Before it is armed and after it has spoken it is ASLEEP (Atomics.wait on the wake cell, no timeout) —
 * never a spin.
 */
const { workerData } = require('worker_threads');
const fs = require('fs');
// round 6's amend: the writer hands this thread store-pace's TEXT, read at the server's boot — compiled here, nothing of the
// install is read by this thread (its own code came the same way: `new Worker(text, {eval: true})`)
const P = workerData && typeof workerData.paceSource === 'string'
  ? (() => { const m = { exports: {} }; require('vm').compileFunction(workerData.paceSource, ['module', 'exports', 'require'], { filename: 'store-pace.js' })(m, m.exports, require); return m.exports; })()
  : require('./store-pace.js');

const { sab, source = null } = workerData || {};
const pid = process.pid;   // a worker's process.pid is its process's — the main thread's own tid
// I[0] armed (0 / 1) · I[1] the text's bytes · I[2] the kind (1 stop · 2 crash) · I[3] the wake cell; F[0] the deadline
// (monotonic) · F[1] the clock's start (the stop or the crash) · F[2] the grace · F[3] a crash's time after a stop (NaN:
// none); T the writer's word on its stores
const I = new Int32Array(sab, 0, 4), F = new Float64Array(sab, 16, 4), T = new Uint8Array(sab, 64);
const mono = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const dec = new TextDecoder();

function speak() {
  const kind = Atomics.load(I, 2) === 2 ? 'crash' : 'stop';
  let summary = null;
  try { summary = dec.decode(T.slice(0, Math.max(0, Math.min(T.length, I[1])))) || null; } catch { summary = null; }
  const sc = P.syscallOf(read(`/proc/self/task/${pid}/syscall`));
  const wchan = String(read(`/proc/self/task/${pid}/wchan`) || '').trim();
  let file = null;
  if (sc && sc.fd != null) { try { file = fs.readlinkSync(`/proc/self/fd/${sc.fd}`); } catch { file = null; } }
  else if (sc && sc.pathPtr != null) {   // the path argument, from this process's own memory (≤ 4 KB, up to its NUL)
    let fd = null;
    try { fd = fs.openSync('/proc/self/mem', 'r'); const b = Buffer.alloc(4096); const n = fs.readSync(fd, b, 0, b.length, sc.pathPtr); const z = b.indexOf(0); file = b.subarray(0, z >= 0 && z < n ? z : n).toString('utf8') || null; } catch { file = null; } finally { try { if (fd != null) fs.closeSync(fd); } catch { } }
  }
  const call = !sc ? null : sc.running ? 'JavaScript or native code (on the CPU)' : sc.name;
  const graceMs = F[2];
  const line = P.keeperLine({ kind, sinceMs: mono() - F[1], graceMs, slackMs: P.keeperSlackMs(graceMs), source, crashAfterMs: Number.isFinite(F[3]) ? F[3] - F[1] : null, summary, call,
    file: file || (sc && (sc.fd != null || sc.pathPtr != null) ? 'a file the kernel did not show' : null), kernel: wchan && wchan !== '0' ? wchan : null });
  try { fs.writeSync(2, line + '\n'); } catch { }
  if (kind === 'crash') process.kill(process.pid, 'SIGKILL');
}

let said = false;
for (;;) {
  const v = Atomics.load(I, 3);
  if (said || Atomics.load(I, 0) !== 1) { Atomics.wait(I, 3, v); continue; }   // IDLE, or SAID: asleep until the writer changes a cell
  const left = F[0] - mono();
  if (left > 0) { Atomics.wait(I, 3, v, Math.max(1, left)); continue; }   // until the deadline (a crash after a stop moves none)
  speak();
  said = true;
}
