'use strict';
/**
 * THE WITNESS'S WATCHDOG THREAD (lane hub-fuse-sync-guard). The main thread mirrors its ONE in-flight synchronous fs
 * call into a SharedArrayBuffer (src/server/sync-fs-witness.js) and beats a counter every second. This thread has its
 * own loop, so while the main thread is held it can still say so — straight to the journal (fd 2, one write(2) per line:
 * console.* in a worker is relayed through the main thread, which is the thread that is held):
 *   · a call in flight ≥ liveMs → «[sync-fs] the main thread has waited N s in statSync(/…/NAS/x) — the kernel:
 *     request_wait_answer in newfstatat» — again every REPEAT_MS while the same call holds;
 *   · the heartbeat stale ≥ liveMs with NO call in flight → «… held N s outside any synchronous fs call» (JavaScript on
 *     the CPU, a child the main thread waits on, a native call — the kernel's answer says which).
 * The kernel's answer is the main thread's /proc/self/task/<pid>/wchan + syscall: procfs, never a mount.
 */
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const { answerMemory } = require('../worker-memory');

const SLOT_INTS = 8, SLOT_PATH = 1024;
const EVERY_MS = 1000;
const REPEAT_MS = 60000;
// x86_64 syscall numbers the main thread can be held in (the rest print as their number)
const SYSCALLS = { 0: 'read', 1: 'write', 2: 'open', 3: 'close', 4: 'stat', 5: 'fstat', 6: 'lstat', 7: 'poll', 16: 'ioctl', 17: 'pread64', 18: 'pwrite64', 21: 'access',
  35: 'nanosleep', 42: 'connect', 59: 'execve', 61: 'wait4', 72: 'fcntl', 74: 'fsync', 76: 'truncate', 78: 'getdents', 82: 'rename', 83: 'mkdir', 84: 'rmdir', 87: 'unlink',
  89: 'readlink', 90: 'chmod', 202: 'futex', 217: 'getdents64', 230: 'clock_nanosleep', 232: 'epoll_wait', 254: 'inotify_add_watch', 257: 'openat', 258: 'mkdirat',
  262: 'newfstatat', 263: 'unlinkat', 264: 'renameat', 267: 'readlinkat', 269: 'faccessat', 271: 'ppoll', 281: 'epoll_pwait', 316: 'renameat2', 332: 'statx', 439: 'faccessat2' };

const { sab, fns = [], pid, liveMs = 10000 } = workerData || {};
const I = new Int32Array(sab, 0, SLOT_INTS), T = new Float64Array(sab, SLOT_INTS * 4, 1), P = new Uint8Array(sab, SLOT_INTS * 4 + 8, SLOT_PATH);
const dec = new TextDecoder();

/** PURE: the main thread's kernel state from its wchan + syscall files' text. */
function kernelWords(wchan, syscall, arch = process.arch) {
  const w = String(wchan || '').trim() || '?';
  const s = String(syscall || '').trim();
  if (s === 'running') return 'on the CPU (JavaScript or native work)';
  const nr = s.split(/\s+/)[0];
  const name = arch === 'x64' && SYSCALLS[nr] ? SYSCALLS[nr] : nr ? `syscall ${nr}` : '?';
  return `${w === '0' ? 'not sleeping' : w} in ${name}`;
}
function kernel() {
  let w = '', s = '';
  try { w = fs.readFileSync(`/proc/self/task/${pid}/wchan`, 'utf8'); } catch { }
  try { s = fs.readFileSync(`/proc/self/task/${pid}/syscall`, 'utf8'); } catch { }
  return kernelWords(w, s);
}
const say = (line) => { try { fs.writeSync(2, line + '\n'); } catch { } };

let saidSeq = -1, saidAt = 0, lastBeat = null, beatAt = Date.now(), outSaidAt = 0;
function check(now = Date.now()) {
  const beat = Atomics.load(I, 3);
  if (beat !== lastBeat) { lastBeat = beat; beatAt = now; }
  const flying = Atomics.load(I, 4) === 1;
  if (flying) {
    const s1 = Atomics.load(I, 0);
    const fn = fns[I[1]] || '?', len = Math.min(SLOT_PATH, Math.max(0, I[2])), startedAt = T[0];
    const p = len ? dec.decode(P.slice(0, len)) : '';
    const s2 = Atomics.load(I, 0);
    if (s1 !== s2 || s1 % 2 || Atomics.load(I, 4) !== 1) return null; // the slot moved under the read: the next tick
    const held = now - startedAt;
    if (held < liveMs || (s1 === saidSeq && now - saidAt < REPEAT_MS)) return null;
    saidSeq = s1; saidAt = now;
    const line = `[sync-fs] the main thread has waited ${Math.round(held / 1000)} s in ${fn}(${p}) — the kernel: ${kernel()}`;
    say(line); return line;
  }
  const stale = now - beatAt;
  if (stale >= liveMs && now - outSaidAt >= REPEAT_MS) {
    outSaidAt = now;
    const line = `[sync-fs] the main loop has been held ${Math.round(stale / 1000)} s outside any synchronous fs call — the kernel: ${kernel()}`;
    say(line); return line;
  }
  return null;
}

if (parentPort && sab) {
  setInterval(check, EVERY_MS);
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js); nothing else is asked
  });
}

module.exports = { kernelWords, check, SYSCALLS };
