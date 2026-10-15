// THE HANG REPORT (lane ci-hang-report, 2026-10-15): a suite the gate kills at its budget used to leave ONE line —
// rel280's mirror: test-cache-bounds hung 300 s twice on the hosted runner, last line `§1 PURE cache-bounds`, load
// 4.8→0.2 (blocked, nothing to read). Now the tier ASKS FIRST, KILLS SECOND: every suite it spawns runs with Node's
// own diagnostic report armed on SIGUSR2 (the flags below, env left out); at the deadline the tier reads the
// suite's threads from /proc, sends SIGUSR2, waits ≤ 2 s for a COMPLETE report file in the run's fail-log dir, then
// SIGTERM (SIGKILL 10 s later), and the ✗ row carries the path + a ≤ 12-line digest of it.
//
// What a signal-asked report can and cannot see (measured on Node 20.19 / 22.23 / 24.12, the floor-to-hub range):
//   · an IDLE loop (a promise nobody resolves, a read nobody answers) ⇒ the report is written; the main thread's
//     JS stack is EMPTY (no JS runs while the loop waits) — the libuv handles (timer / pipe fd / tcp peer / child
//     pid) are what names the wait, and a worker's sub-report carries ITS frames (a busy or Atomics.wait-blocked
//     worker answers the interrupt with `at fn (file:line:col)`).
//   · a BUSY main thread (`for (;;) {}`) or one blocked in a synchronous call (spawnSync, readFileSync of a FIFO)
//     ⇒ NO report: Node's handler is a JS signal listener and the JS thread never yields. The /proc line says
//     which: MainThread R (spinning) or S + its wchan (ep_poll = spawnSync's own loop, pipe_read, …).
//   · a worker blocked in a SYSCALL (a FIFO open, a read off a storage that does not answer) ⇒ a PARTIAL report:
//     the main thread waits, unbounded, for every worker's sub-report (node_report.cc) and the file stops at the
//     last 8 KB flush. parseReport keeps every whole section (and the whole handles before the cut); the /proc
//     line shows the worker's wait (WorkerThread S wait_for_partner).
// `--report-exclude-env` exists from Node 22.13 / 23.3 (the README floor is 18; the hosted runner runs 22.2x,
// the hub 24): where it is missing the tier strips `environmentVariables` from the file once it is complete and
// cuts a partial file before that key — a report never carries the runner's token env (VIBESPACE_CI_OAT).
import fs from 'node:fs';
import path from 'node:path';

export const HANG_SIGNAL = 'SIGUSR2';
export const HANG_WAIT_MS = 2000;   // how long the deadline waits for the report before SIGTERM
export const HANG_KILL_MS = 10000;  // SIGTERM → SIGKILL, for a suite whose SIGTERM listener can never run (a main thread stuck in the report's own worker wait)
export const HANG_MAX_LINES = 12;
export const HANG_MAX_FRAMES = 8;

/** PURE: the report's file name — the fail log's own `<sha8>.<suite>.<try>` + `.hang.json`. */
export const hangReportName = (sha8, suite, attempt) => `${sha8 || 'nosha'}.${suite}.${attempt || 1}.hang.json`;

/** PURE: the node flags that arm the report for one spawned suite. `flags` = the flags the running Node knows
 *  (process.allowedNodeEnvironmentFlags — the suite runs on process.execPath, the same binary). */
export function hangReportArgv({ dir, filename, flags = process.allowedNodeEnvironmentFlags } = {}) {
  const has = (f) => !!(flags && flags.has(f));
  if (!dir || !filename || !has('--report-on-signal')) return { argv: [], armed: false, envExcluded: false };
  const argv = ['--report-on-signal', `--report-signal=${HANG_SIGNAL}`, `--report-directory=${dir}`, `--report-filename=${filename}`];
  const envExcluded = has('--report-exclude-env');
  if (envExcluded) argv.push('--report-exclude-env');
  if (has('--report-exclude-network')) argv.push('--report-exclude-network'); // the host's interface list is no fact about a hang
  return { argv, armed: true, envExcluded };
}

/** PURE: a report's text → { report, partial, cutIn }. A report whose writer stopped (a worker that never answered)
 *  keeps every whole top-level section, and the whole elements of the array it stopped in (`libuv`, `workers`). */
export function parseReport(text) {
  const t = String(text || '');
  if (!t.trim()) return { report: null, partial: true, cutIn: null };
  try { return { report: JSON.parse(t), partial: false, cutIn: null }; } catch { }
  const keys = [...t.matchAll(/\n {2}"([A-Za-z]+)": /g)];
  if (keys.length) {
    const last = keys[keys.length - 1], tail = t.slice(last.index), end = tail.lastIndexOf('\n    }');
    if (/^\n {2}"[A-Za-z]+": \[/.test(tail) && end > 0) {
      try { return { report: JSON.parse(t.slice(0, last.index + end + 6) + '\n  ]\n}'), partial: true, cutIn: last[1] }; } catch { }
    }
    for (let i = keys.length - 1; i >= 1; i--) {
      try { return { report: JSON.parse(t.slice(0, keys[i].index).replace(/,\s*$/, '') + '\n}'), partial: true, cutIn: keys[i][1] }; } catch { }
    }
  }
  return { report: null, partial: true, cutIn: null };
}

/** PURE: a report's text with no environment section (for a Node without --report-exclude-env) — the report's own
 *  AND every worker's sub-report's (each carries its own copy). A text that does not parse is cut before the first
 *  key (a worker's comes before the top level's) — nothing after it is kept. */
const dropEnv = (r) => { if (r && typeof r === 'object') { delete r.environmentVariables; for (const w of r.workers || []) dropEnv(w); } return r; };
export function withoutEnv(text) {
  const t = String(text || '');
  if (!t.includes('"environmentVariables"')) return t;
  try { return JSON.stringify(dropEnv(JSON.parse(t)), null, 2) + '\n'; } catch { }
  return t.slice(0, t.indexOf('"environmentVariables"'));
}

// `at fn (file:line:col)` / `at file:line:col` → `fn · file:line`, the run root and file:// cut off
const frameOf = (line, root) => {
  const m = /^\s*at (?:(.*?) \((.+)\)|(.+))$/.exec(String(line));
  if (!m) return null;
  let loc = (m[2] || m[3] || '').replace(/^file:\/\//, '');
  if (root) loc = loc.split(root.replace(/\/+$/, '') + '/').join('');
  loc = loc.replace(/:(\d+):\d+$/, ':$1');
  return { fn: (m[1] || '').trim() || '<anonymous>', loc, internal: /^node:internal\//.test(loc) };
};
const framesOf = (sub, root) => ((sub && sub.javascriptStack && sub.javascriptStack.stack) || []).map((l) => frameOf(l, root)).filter(Boolean);
const mb = (n) => `${Math.round(Number(n) / 1048576)} MB`;
const sec = (n) => `${(Number(n) || 0).toFixed(2)} s`;
// a socket's end: {ip4|ip6|host, port} for tcp / udp, a path string for a unix pipe (the run root cut off, a long one cut short)
const ep = (e, root) => {
  if (typeof e === 'string') { const p = root ? e.split(root.replace(/\/+$/, '') + '/').join('') : e; return p.length > 60 ? '…' + p.slice(-59) : p; }
  return e && (e.ip4 || e.ip6 || e.host) ? `${e.ip4 || e.ip6 || e.host}:${e.port}` : '';
};

/** PURE: the handles keeping the loop alive (active AND referenced; the loop itself and Node's own unref'd plumbing
 *  counted, not listed), by kind, with the peer of a socket / the fd of a pipe / the pid of a child. */
export function handleSummary(libuv = [], { workers = 0, root = '' } = {}) {
  const held = {}, order = [];
  let rest = 0;
  for (const h of libuv || []) {
    if (!h || h.type === 'loop') continue;
    if (!(h.is_active && h.is_referenced)) { rest++; continue; }
    if (!held[h.type]) { held[h.type] = []; order.push(h.type); }
    const l = ep(h.localEndpoint, root), r = ep(h.remoteEndpoint, root);
    held[h.type].push(h.type === 'tcp' || h.type === 'udp' ? (r ? `${l} → ${r}` : l ? `listening ${l}` : '')
      : h.type === 'pipe' ? (r ? `→ ${r}` : l || (h.fd != null && h.fd >= 0 ? `fd ${h.fd}` : ''))
      : h.type === 'process' ? (h.pid ? `pid ${h.pid}` : '')
      : h.type === 'timer' ? (h.repeat ? `every ${h.repeat} ms` : '')
      : h.type === 'signal' ? (h.signal || '') : '');
  }
  const kinds = order.map((k) => {
    const d = held[k].filter(Boolean), shown = d.slice(0, 3).join(', ') + (d.length > 3 ? `, +${d.length - 3}` : '');
    return `${k} ×${held[k].length}${shown ? ` (${shown})` : ''}`;
  });
  if (workers) kinds.push(`workers ×${workers}`);
  return { kinds, rest, line: `${kinds.length ? kinds.join(' · ') : 'none'}${rest ? ` — +${rest} unref'd / idle` : ''}` };
}

// Node's / V8's own helpers (named from Node 24 — on 20 / 22 nearly every thread is `node`) and any thread parked on a
// futex are counted, not listed: what is left is the main thread and whatever waits on something else
const PLATFORM_THREADS = new Set(['V8Worker', 'DelayedTaskSche', 'SignalInspector']);
const parked = (t) => !t.main && t.state === 'S' && (PLATFORM_THREADS.has(t.comm) || (/^futex/.test(t.wchan || '') && t.comm !== 'WorkerThread'));
/** PURE: /proc's word on the suite at the deadline → `main S ep_poll · WorkerThread S wait_for_partner — +6 idle helpers`. */
export function threadsLine(snap) {
  if (!snap || !snap.threads || !snap.threads.length) return '';
  const counts = new Map();
  let idle = 0;
  for (const t of snap.threads) {
    if (parked(t)) { idle++; continue; }
    const k = `${t.main ? 'main' : t.comm} ${t.state}${t.wchan && t.wchan !== '0' ? ' ' + t.wchan : ''}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(' · ') + (idle ? ` — +${idle} idle helpers` : '');
}

/**
 * PURE: THE DIGEST — a report (object, or its text — a partial one is repaired) → ≤ 12 lines: the top JS frames
 * (the main thread's, else the first workers' with a stack; node:internal frames dropped), the handles holding
 * the loop, cpu user/sys + maxRSS, and — from the tier's own /proc read — the threads and the child processes.
 * `opts`: { root (cut off frame paths), snapshot ({threads, children} from procSnapshot), partial, cutIn, bytes, at (who asked:
 *  'the signal' — or 'the watchdog', a suite's own clock: scripts/suite-watchdog.mjs) }.
 */
export function hangDigest(reportJson, opts = {}) {
  const parsed = typeof reportJson === 'string' ? parseReport(reportJson) : { report: reportJson || null, partial: !!opts.partial, cutIn: opts.cutIn || null };
  const r = parsed.report, partial = parsed.partial || !!opts.partial, cutIn = parsed.cutIn || opts.cutIn || null;
  const P = '  [hang] ', out = [], tailLines = [];
  if (!r) out.push(`${P}no report to read${opts.bytes ? ` (${opts.bytes} bytes, nothing whole)` : ''} — the JS thread never answered the signal (a busy loop or a synchronous call): read the threads line`);
  else if (partial) out.push(`${P}report PARTIAL${opts.bytes ? ` (${opts.bytes} bytes` : ' ('}${cutIn ? `${opts.bytes ? ', ' : ''}cut in "${cutIn}"` : ''}) — the main thread stopped while writing it: a worker that never answered (a syscall that does not return) holds it`);
  if (r) {
    const main = framesOf(r, opts.root), workers = (r.workers || []).map((w) => ({ tid: w && w.header && w.header.threadId, frames: framesOf(w, opts.root) }));
    const stacks = [];
    if (main.length) stacks.push({ who: 'main', frames: main });
    else out.push(`${P}JS main: idle at ${opts.at || 'the signal'} (no JS running — the loop waits on the handles below)`);
    for (const w of workers) if (w.frames.length) stacks.push({ who: `worker ${w.tid != null ? w.tid : '?'}`, frames: w.frames });
    tailLines.push(`${P}handles holding the loop: ${handleSummary(r.libuv, { workers: workers.length, root: opts.root }).line}`);
    const ru = r.resourceUsage || {};
    if (ru.userCpuSeconds != null || ru.maxRss != null) tailLines.push(`${P}cpu user ${sec(ru.userCpuSeconds)} · sys ${sec(ru.kernelCpuSeconds)} · maxRSS ${ru.maxRss != null ? mb(ru.maxRss) : '?'}`);
    const th = threadsLine(opts.snapshot), kids = (opts.snapshot && opts.snapshot.children) || [];
    if (th) tailLines.push(`${P}threads at the deadline: ${th}`);
    if (kids.length) tailLines.push(`${P}children: ${kids.slice(0, 4).map((c) => `${c.pid} ${c.comm} ${c.state}${c.wchan && c.wchan !== '0' ? ' ' + c.wchan : ''}`).join(' · ')}${kids.length > 4 ? ` · +${kids.length - 4}` : ''}`);
    let room = Math.min(HANG_MAX_FRAMES, HANG_MAX_LINES - out.length - tailLines.length);
    for (const st of stacks) {
      const own = st.frames.filter((f) => !f.internal), cut = st.frames.length - own.length;
      for (let i = 0; i < own.length && room > 0; i++, room--) out.push(`${P}${i ? ' '.repeat(`JS ${st.who}: `.length) : `JS ${st.who}: `}at ${own[i].fn} · ${own[i].loc}${i === own.length - 1 && cut ? `  (+${cut} node:internal)` : ''}`);
    }
    out.push(...tailLines);
  } else {
    const th = threadsLine(opts.snapshot), kids = (opts.snapshot && opts.snapshot.children) || [];
    if (th) out.push(`${P}threads at the deadline: ${th}`);
    if (kids.length) out.push(`${P}children: ${kids.slice(0, 4).map((c) => `${c.pid} ${c.comm} ${c.state}${c.wchan && c.wchan !== '0' ? ' ' + c.wchan : ''}`).join(' · ')}${kids.length > 4 ? ` · +${kids.length - 4}` : ''}`);
  }
  return out.slice(0, HANG_MAX_LINES);
}

// ── the tier's side (not PURE): /proc, the signal, the file ─────────────────────────────────────────────────
const readText = (p) => { try { return fs.readFileSync(p, 'utf-8'); } catch { return null; } };
const statOf = (txt) => { const s = String(txt || ''), i = s.lastIndexOf(')'); return i < 0 ? '?' : (s.slice(i + 2).split(' ')[0] || '?'); };

/** The suite's threads (comm · state · wchan) and its descendants (two levels) from /proc, read at the deadline,
 *  BEFORE the signal — so a main thread later stuck writing the report is not what this says. null off Linux. */
export function procSnapshot(pid, { procRoot = '/proc', depth = 2 } = {}) {
  const taskDir = path.join(procRoot, String(pid), 'task');
  let tids;
  try { tids = fs.readdirSync(taskDir); } catch { return null; }
  const threads = tids.map((tid) => {
    const d = path.join(taskDir, tid);
    return { tid: Number(tid), main: String(tid) === String(pid), comm: (readText(path.join(d, 'comm')) || '?').trim(), state: statOf(readText(path.join(d, 'stat'))), wchan: (readText(path.join(d, 'wchan')) || '').trim() };
  });
  const children = [];
  const walk = (p, level) => {
    let ts = [];
    try { ts = fs.readdirSync(path.join(procRoot, String(p), 'task')); } catch { return; }
    for (const tid of ts) {
      for (const c of String(readText(path.join(procRoot, String(p), 'task', tid, 'children')) || '').trim().split(/\s+/).filter(Boolean)) {
        const d = path.join(procRoot, c);
        children.push({ pid: Number(c), comm: (readText(path.join(d, 'comm')) || '?').trim(), state: statOf(readText(path.join(d, 'stat'))), wchan: (readText(path.join(d, 'wchan')) || '').trim() });
        if (level < depth) walk(c, level + 1);
      }
    }
  };
  walk(pid, 1);
  return { threads, children };
}

const reportComplete = (file) => { const t = readText(file); if (!t || !/\}\s*$/.test(t)) return false; try { JSON.parse(t); return true; } catch { return false; } };

/**
 * THE DEADLINE, ASK FIRST: read /proc, remove a stale file of the same name, SIGUSR2, poll ≤ waitMs for a
 * COMPLETE report (or the child's own exit), then SIGTERM, and SIGKILL killMs later if it is still there.
 * Returns at once the state it fills in ({ snapshot, file, asked, waitedMs, done }).
 */
export function askThenKill(child, { dir, file, waitMs = HANG_WAIT_MS, killMs = HANG_KILL_MS, procRoot } = {}) {
  const seen = { snapshot: procSnapshot(child.pid, { procRoot }), file, asked: false, waitedMs: null, done: null };
  const gone = () => child.exitCode !== null || child.signalCode !== null;
  try { fs.mkdirSync(dir, { recursive: true }); fs.rmSync(file, { force: true }); } catch { }
  try { seen.asked = child.kill(HANG_SIGNAL); } catch { }
  const t0 = Date.now();
  seen.done = new Promise((resolve) => {
    const tick = () => {
      if (!gone() && !reportComplete(file) && Date.now() - t0 < waitMs) { setTimeout(tick, 50); return; }
      seen.waitedMs = Date.now() - t0;
      if (!gone()) {
        try { child.kill('SIGTERM'); } catch { }
        const k = setTimeout(() => { if (!gone()) { try { child.kill('SIGKILL'); } catch { } } }, killMs);
        k.unref(); child.once('exit', () => clearTimeout(k));
      }
      resolve(seen);
    };
    tick();
  });
  return seen;
}

/**
 * After the suite is gone: the file (env stripped where this Node could not leave it out) → `head` for the ✗ line
 * (` — hang report: <path>`, or why there is none) + the digest lines.
 */
export function readHangReport(seen, { root, envExcluded = true } = {}) {
  if (!seen) return null;
  let text = readText(seen.file);
  if (text && !envExcluded) { const clean = withoutEnv(text); if (clean !== text) { try { fs.writeFileSync(seen.file, clean); } catch { } text = clean; } }
  if (!text) {
    const why = !seen.asked ? 'the signal could not be sent' : seen.waitedMs == null ? `asked with ${HANG_SIGNAL}; the suite exited first` : `asked with ${HANG_SIGNAL}, nothing written in ${seen.waitedMs} ms`;
    return { head: ` — no hang report (${why})`, lines: hangDigest(null, { snapshot: seen.snapshot }) };
  }
  const p = parseReport(text);
  return { head: ` — hang report${p.partial ? ' (partial)' : ''}: ${seen.file}`, lines: hangDigest(p.report, { root, snapshot: seen.snapshot, partial: p.partial, cutIn: p.cutIn, bytes: p.partial ? Buffer.byteLength(text) : 0 }) };
}
