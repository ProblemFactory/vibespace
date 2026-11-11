'use strict';
/**
 * WHAT HELD THE HUB'S MAIN LOOP (lane hub-loop-stalls — a fleet user's hub was taken offline by holds of 10–70 s that its
 * watchdog could only call «on the CPU»). PURE: every word that leaves the watchdog comes from here. The ORCH halves are
 * the watchdog thread (src/server/sync-fs-witness-worker.js: the hold, the samples, the scheduler's facts) and the main
 * thread's book (src/server/loop-holds.js: the garbage collections, the memory, the utilization, the ring, the table).
 *
 * THE SAMPLE (measured on Node 22 and 24; docs/kb-design-lessons §19): the watchdog thread posts `Runtime.evaluate(SAMPLE_EXPR)`
 * to the main thread through an inspector session — closed as it posts when the main thread is asleep in a call, kept
 * ≤ SESSION_MS until the answer when it is on the CPU. Nothing is enabled — no Debugger (its enable costs ~0.25 s a GB of
 * heap and makes `await` 8× slower while on), no Profiler (its start costs 2 s at a 2.3 GB heap). The inspector delivers
 * the ask by a V8 interrupt, so the expression runs AT the held point and the call sites it captures are the held code's:
 * 0.3–2 ms a sample. Native work (a big JSON.parse, a sync child, a sync syscall) takes no interrupt: the ask runs only
 * when it returns, at the first JavaScript after it — said as such. The answer leaves through the main thread's note
 * slot with its beat count and a monotonic time: the watchdog judges whether it landed INSIDE the hold. The expression
 * changes nothing the held code can observe and keeps nothing: ONE constant text; it creates no promise, it schedules
 * nothing, it sets Error.prepareStackTrace / stackTraceLimit (own writable DATA properties on Node 22 and 24 — a plain
 * store, never a call) and restores both in a `finally` that makes no call.
 *
 * THE VERDICT of a hold — the independent check's MEASURED table (lane dir acc-scratch/…/robustness/results.md), in
 * this order, W = the hold's wall time, every number the MAIN THREAD's own (schedstat run / run-queue wait, stat's
 * utime / stime) or the watchdog's own lateness — never the cgroup's usage (the whole service with every agent in it)
 * and never system-wide pressure (both are printed as facts, never judged by):
 *   not running (stopped or frozen)  the watchdog's own timer late ≥ STOPPED_LATE_SHARE W and run + wait < STOPPED_RUN_SHARE W
 *                                    (a stopped process, a paused container or VM: nothing of it ran, the watchdog neither)
 *   waiting for a CPU                run-queue wait ≥ WAIT_SHARE W (starved measured 0.50, every other case ≤ 0.006)
 *   in the kernel (blocked)          run < RAN_SHARE W (a syscall, a child waited on, Atomics.wait)
 *   in the kernel (on the CPU)       stime ≥ KERNEL_SHARE of utime + stime
 * — then, ROUND 5 (law B): THE WINDOW SAYS HOW MUCH, A SAMPLE SAYS WHERE (`partsOf`): with a window covering the hold, its
 *   split by TIME (on the CPU vs asleep) decides and the samples name each part; a sample of the smaller part is printed
 *   as a sample and never names the hold; two real parts (each ≥ PART_SHARE W, each sampled) are said as two, in time
 *   order, with their seconds («JavaScript for 2.1 s, then in the kernel (blocked) for 2.6 s»); the on-CPU part with only
 *   asleep samples is «on the CPU — JavaScript or native code, no sample of that part». With NO covering window:
 * — THE ASKS (round 4's law: A SAMPLE SPEAKS FOR WHERE THE THREAD WAS WHEN IT WAS ASKED — `askOf`): each ask carries
 *   its post time, its answer's first instruction (or none), the thread's kernel state AT THE POST (/proc stat) and its
 *   frames; the class most asks inside the hold fell in decides (ties: the kernel, stopped, JavaScript, native, unread),
 *   and the line says no window covered it:
 *   in the kernel (blocked)          asked while ASLEEP (its wait channel said)
 *   not running (…)                  asked while STOPPED
 *   JavaScript                       answered at JavaScript speed (≤ JS_FAST_MS of the post), before the hold's end, with a
 *                                    JavaScript frame on its stack
 *   garbage collection               the main thread's own collections cover ≥ GC_SHARE W (opted in)
 *   native code or garbage collection   asked while ON THE CPU and not answered at JavaScript speed — its only road; the
 *                                    late answer is «the first JavaScript after it»
 *   not in JavaScript when asked     its kernel state unread and not answered at JavaScript speed (never «native»)
 *   not sampled                      no ask spoke for an instant inside it (not asked, answered at its end with no frame
 *                                    of it, or asked after it ended)
 * Throttling (cpu.stat) is said, never judged by — and untested on a real quota (the box measured had none).
 * WHAT IT MAY SAY (law G): a function name and a file:line only for a frame whose file is the hub's own code (server.js,
 * src/, node_modules/, scripts/ under the root — a REAL file, the name only where its own line spells it) or a node: internal; a V8 built-in is «(built-in)»; anything else —
 * another path, eval'd code, a plugin, data/ — is «(outside the repo)», with no name and no path.
 */

const HOLD_MS = 1000;          // a hold: the main thread's beat stale this long
const BEAT_MS = 250;           // the main thread's beat AND the watchdog's check (ONE unref'd timer each side)
const SAMPLES_PER_HOLD = 7;    // asked at held ≈ 1, 2, 4, 8, 16, 32, 64 × HOLD_MS — one in flight at a time
const JS_FAST_MS = 2;          // ROUND 4: a thread RUNNING JavaScript enters a posted ask in p50 0.015–0.02 ms, p99 0.08–0.15 ms,
                               // max 0.29–0.51 ms (post → the sample's first instruction, 400 asks a run over a busy main thread,
                               // Node 22 and 24, load 4.7–4.8 — lane dir probe/r4/jslat.cjs): an answer later than four times the
                               // largest was NOT in JavaScript when it was asked
const NO_ANSWER_MS = 50;       // the watchdog waits this long before its live line says «no JavaScript answered» (the VERDICT
                               // is the ask's own latency against JS_FAST_MS, never this wait)
const SESSION_MS = 20;         // an ask of a main thread ON THE CPU keeps its session this long at most (asleep in a call: none)
const CAP_PER_HOUR = 20;       // sampled holds per rolling hour (the boot is outside it)
const LIVE_MS = 10000;         // the watchdog's «has been held» line (src/server/sync-fs-witness-worker.js)
const RING_KEEP = 50;          // the main thread's last holds
const TABLE_KEYS = 200;        // the since-start table's keys; the rest fold into «other»
const GC_MIN_MS = 50;          // a collection kept by the main thread's ring
const RAN_SHARE = 0.2, WAIT_SHARE = 0.2, KERNEL_SHARE = 0.6, GC_SHARE = 0.5, STOPPED_LATE_SHARE = 0.5, STOPPED_RUN_SHARE = 0.05;
// THE RATE IS A SAFETY BOUND (the check: periodic main-thread evaluates of a FREE loop near the heap limit made Node 24
// abort out of memory with a third less data — they keep incremental marking running into the next allocation burst;
// samples DURING a hold do not): a hold's samples ≥ HOLD_MS apart, ≤ SAMPLES_PER_HOLD, ≤ CAP_PER_HOUR holds; the
// profile one a second, refused (and stopped) while heap used ≥ PROFILE_HEAP_SHARE of the limit. test-loop-hold ⑤ pins them.
const PROFILE_HEAP_SHARE = 0.85;
/** the young generation's reserve inside heap_size_limit, in semi-spaces of its largest size (three: two semi-spaces and
 *  the new large-object space) — measured: Node 24 64 MB a semi-space (192 MB), Node 22 16 MB (48 MB) */
const DEFAULT_SEMI_MB = (major) => (major >= 24 ? 64 : 16);
const STARVED_MS = 1000;       // the watchdog's own check ran this much late ⇒ it says it was starved too
const CODE = ['src/', 'node_modules/', 'scripts/'];
const NAME_RE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){0,3}$/;
const NAME_MAX = 60;
/** THE main thread's side of the sample, installed ONCE by the witness at its start (never by a sample) as a STRING-keyed,
 *  non-enumerable global — the sample reaches it with a property read, no call (a stack within a frame of its limit can
 *  still count itself, below):
 *  `dbg()` — is a debugger port open NOW (inspector.url() answers per thread: only the main thread can see it, also when a
 *  person opened it by SIGUSR1 inside the hold); `note(out)` — THE ONLY WAY AN ANSWER LEAVES: the watchdog posts its ask
 *  and closes its session in the same synchronous stretch (no session is ever left connected — an exit right after a
 *  native stretch prints no «Waiting for the debugger to disconnect…»), so the main thread writes the answer into a shared
 *  slot with ITS beat count and a monotonic time — the watchdog judges by them whether the sample landed inside the hold;
 *  `z` — two Int32 cells the sample bumps with plain stores (ENTERED, and the beat count then): a sample that entered and
 *  left no note threw (the stack nearly full) — JavaScript, never «no answer»; `b` — the main thread's beat slot. */
const HOOK_KEY = 'vibespace.loopHold';
/** THE expression the watchdog asks the main thread to evaluate — ONE constant text (a text new to V8 at every ask kept
 *  ~3.5 KB of main-thread heap per ask for good: never the ask's number in it). A plain script block: its own frame is ONE
 *  (skipped), its `const` / `let` are block-scoped (nothing global). It stands down first when a debugger port is open
 *  ('D') or when Error.prepareStackTrace / stackTraceLimit is an ACCESSOR ('A' — nothing read or set). Else its own hook
 *  for the call: both globals saved, the sampler's prepareStackTrace + 32 frames installed, both restored in a `finally` of
 *  plain stores (`delete` when absent); never the held program's hook. ITS ANSWER CANNOT BE RE-SHAPED BY ANYTHING THE
 *  PROGRAM NAMES: every string in it is LENGTH-PREFIXED (a name holding tabs, newlines or a fake «(…/src/x.js:7)» is one
 *  name, read whole); a non-string from a call site is ''. Forms: 'C' + frames (`<n>:<name><n>:<file><line>,<function's
 *  own line><e|n>` each, its own frame skipped) · 'S' + `<n>:` + V8's default STRING (the sample landed inside the
 *  program's own stack formatting — V8 does not re-enter a prepareStackTrace; read for LOCATIONS only, and only when every
 *  line reads as V8's own format). */
const SAMPLE_EXPR = `{ const H = globalThis['${HOOK_KEY}'], Z = H && H.z; let out = '';
  if (Z) { Z[0] = Z[0] + 1; Z[1] = H.b[3]; }
  try {
    const t0 = typeof H.now === 'function' ? H.now() : -1;
    if (typeof H.dbg === 'function' && H.dbg() === true) out = 'D';
    else {
      const E = Error, O = Object, dp = O.getOwnPropertyDescriptor(E, 'prepareStackTrace'), dl = O.getOwnPropertyDescriptor(E, 'stackTraceLimit');
      if ((dp && (dp.get || dp.set)) || (dl && (dl.get || dl.set))) out = 'A';
      else {
        const p = E.prepareStackTrace, l = E.stackTraceLimit;
        try {
          E.stackTraceLimit = 32;
          E.prepareStackTrace = function (_, cs) { return cs; };
          const cs = new E().stack;
          if (typeof cs === 'string') out = 'S' + cs.length + ':' + cs;
          else {
            out = 'C';
            for (let i = 1; i < cs.length; i++) {
              const c = cs[i];
              let f = c.getFunctionName(), u = c.getFileName(), n = c.getLineNumber(), m = typeof c.getEnclosingLineNumber === 'function' ? c.getEnclosingLineNumber() : 0;
              f = typeof f === 'string' ? f : ''; u = typeof u === 'string' ? u : ''; n = typeof n === 'number' && n > 0 && n < 1e9 ? n : 0; m = typeof m === 'number' && m > 0 && m < 1e9 ? m : 0;
              out += f.length + ':' + f + u.length + ':' + u + n + ',' + m + (c.isEval() === true ? 'e' : 'n');
            }
          }
        } finally { if (dp) E.prepareStackTrace = p; else delete E.prepareStackTrace; if (dl) E.stackTraceLimit = l; else delete E.stackTraceLimit; }
      }
    }
    if (typeof H.note === 'function') H.note(out, t0);
  } catch (e) { out = ''; }
  out; }`;
/** the same text whatever is asked (kept for callers of the round-2 name) */
const sampleExpr = () => SAMPLE_EXPR;

// ── frames ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** PURE: does `lineText` (the repo's own source at the function's OWN line — the call site's enclosing line) spell `name`
 *  as a whole token? A name V8 took from a runtime value (a computed key, a vm script compiled under a repo file's name, a
 *  name defined over the function's own) is not in the source there: the frame is said by its location alone. */
/** what a name resolver answers when it did NOT read (its budget spent, the source files slow): the frame is said by its
 *  location alone, marked — never «outside the repo», never a name */
const UNREAD = Symbol('unread');
function spelledIn(lineText, name) {
  if (typeof lineText !== 'string' || typeof name !== 'string' || !name) return false;
  const q = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^\\w$])' + q + '(?![\\w$])').test(codeOf(lineText.slice(0, 4000)));
}
/** PURE: a source line with its strings, template texts and comments blanked (round 4: a name that appears only INSIDE
 *  a string or a comment on the function's own line is not spelled there). One line, no state carried across lines: a
 *  line that opens inside a multi-line comment or template reads as code — the name is then kept only if spelled. */
function codeOf(line) {
  let out = '', i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '/' && line[i + 1] === '/') break;
    if (c === '/' && line[i + 1] === '*') { const e = line.indexOf('*/', i + 2); out += ' '; i = e < 0 ? line.length : e + 2; continue; }
    if (c === "'" || c === '"' || c === '`') { let j = i + 1; while (j < line.length && line[j] !== c) j += line[j] === '\\' ? 2 : 1; out += ' '; i = j + 1; continue; }
    out += c; i++;
  }
  return out;
}
/** PURE: one raw frame {fn, file, line, encl, evalish} → its class + the words it may carry (law G). `isRepoFile(rel)` — is
 *  that a REAL file of the repo (the watchdog thread checks and remembers; a forged location is not) — absent ⇒ trusted.
 *  `lineOf(rel, n)` — the repo's own source line n of that file (the watchdog thread reads it, bounded and cached): a repo
 *  frame keeps its NAME only when that line — the function's own line (`encl`) — spells it; else its location alone.
 *  Absent ⇒ trusted (a PURE caller's own fixture). A location-only frame (the string form) carries no name (`fn: null`). */
function frameOf(raw, root, isRepoFile = null, lineOf = null, isInternal = null) {
  const file0 = String((raw && raw.file) || '').replace(/^file:\/\//, '');
  const fn0 = raw && typeof raw.fn === 'string' ? raw.fn : '';
  const fn = raw && raw.fn === null ? null : fn0 && fn0.length <= NAME_MAX && NAME_RE.test(fn0) ? fn0 : '(anonymous)';
  const line = Number.isInteger(raw && raw.line) && raw.line > 0 ? raw.line : 0;
  if (!file0) return raw && raw.evalish ? { cls: 'outside' } : { cls: 'builtin' };
  // node:internal/streams/end-of-stream, node:v8 — its NAME only when that id is one of Node's own loaded modules (round 4:
  // a vm script may call itself «node:…»; it is then said by its location alone)
  if (/^node:[\w/-]+$/.test(file0)) return { cls: 'node', fn: typeof isInternal !== 'function' || isInternal(file0.slice(5)) === true ? fn : null, file: file0, line };
  const r = typeof root === 'string' && root.startsWith('/') ? root.replace(/\/+$/, '') + '/' : null;
  if (r && file0.startsWith(r) && !file0.includes('/../') && !(raw && raw.evalish)) {
    const rel = file0.slice(r.length);
    const real = (rel === 'server.js' || CODE.some((d) => rel.startsWith(d))) && /^[\w./@+-]+$/.test(rel) ? (typeof isRepoFile !== 'function' ? true : isRepoFile(rel)) : false;
    if (real === UNREAD) return { cls: 'repo', fn: null, file: rel, line, unread: true };   // not read (the name budget spent / the source slow): its location alone
    if (real === true) {
      if (fn && fn !== '(anonymous)' && typeof lineOf === 'function') {
        const encl = Number.isInteger(raw && raw.encl) && raw.encl > 0 ? raw.encl : 0;
        let text = null; try { text = encl ? lineOf(rel, encl) : null; } catch { text = null; }
        if (text === UNREAD) return { cls: 'repo', fn: null, file: rel, line, unread: true };
        if (!spelledIn(text, fn)) return { cls: 'repo', fn: null, file: rel, line };   // a name the source does not spell there: the location alone
      }
      return { cls: 'repo', fn, file: rel, line };
    }
  }
  return { cls: 'outside' };
}
/** PURE: a frame's location (the table's key: one function, one key, whichever form answered) and its words. */
const frameLoc = (f) => (f && (f.cls === 'repo' || f.cls === 'node') ? `${f.file}${f.line ? ':' + f.line : ''}` : f ? (f.cls === 'builtin' ? '(built-in)' : '(outside the repo)') : '');
function frameText(f) {
  if (!f) return '';
  if (f.cls === 'repo' || f.cls === 'node') return f.fn === null ? frameLoc(f) : `${f.fn} (${frameLoc(f)})`;
  return f.cls === 'builtin' ? '(built-in)' : '(outside the repo)';
}
/** PURE: one line of V8's default stack STRING → a raw LOCATION-ONLY frame (fn: null), or null when the line is not in
 *  V8's own format. Strict: «at [async ][new ]<identifier[.identifier…][ [as x]]> (<location>)», «at [async ]<location>», an eval
 *  origin «at [name ](eval at …)» (outside — its text is never read), «(index N)» / «(<anonymous>)» / «(native)» (a built-in). */
const STRING_NAME = /^(?:async )?(?:new )?[A-Za-z_$<][\w$<>]*(?:\.[A-Za-z_$<][\w$<>]*)*(?: \[as [\w$]+\])?$/;
function stringFrame(line) {
  const t = String(line || '');
  if (!/^ {4}at \S/.test(t)) return null;
  const body = t.slice(7);
  if (/^(?:(?:async )?(?:new )?[^\s()]+ )?\(eval at .*\)$/.test(body)) return { fn: null, file: '', line: 0, evalish: true };   // an eval origin: outside, never read
  let loc = body;
  const m = /^(.*) \(([^()]*)\)$/.exec(body);
  if (m) { if (!STRING_NAME.test(m[1])) return null; loc = m[2]; }
  else { loc = body.replace(/^async /, ''); if (/[()\s]/.test(loc)) return null; }   // «at [async ]<location>»
  if (/^index \d+$/.test(loc)) return { fn: null, file: '', line: 0, evalish: false };   // «at async Promise.all (index 0)»: a built-in
  if (/, <anonymous>:\d+:\d+$/.test(loc)) return { fn: null, file: '', line: 0, evalish: true };
  const fl = /^([^\s()]+):(\d+):(\d+)$/.exec(loc);
  if (!fl) return /^(native|<anonymous>)$/.test(loc) ? { fn: null, file: '', line: 0, evalish: false } : null;   // a built-in
  if (fl[1] === '<anonymous>') return { fn: null, file: '', line: 0, evalish: true };
  return { fn: null, file: fl[1], line: Number(fl[2]), evalish: false };
}
/** PURE: read `<n>:` + n characters at `i` → [string, next] or null. */
function readLen(t, i) {
  const m = /^(\d{1,7}):/.exec(t.slice(i, i + 9));
  if (!m) return null;
  const n = Number(m[1]), at = i + m[0].length;
  return at + n <= t.length ? [t.slice(at, at + n), at + n] : null;
}
/** PURE: the sample's text → {form, frames} — 'calls' | 'string' (locations only) | 'accessor' | 'debugger' | 'none' |
 *  'formatting' (the string form did not read line for line as V8's own: the whole sample is «frames unreadable (inside
 *  the program's own stack formatting)», never a frame from it). A call-site text that does not read EXACTLY as the
 *  encoding gives the frames read before the fault, never a guess. */
function sampleOf(text, root, isRepoFile = null, lineOf = null, isInternal = null) {
  if (typeof text !== 'string') return { form: 'none', frames: [] };
  if (text === 'A') return { form: 'accessor', frames: [] };
  if (text === 'D') return { form: 'debugger', frames: [] };
  if (text[0] === 'S') {
    const r = readLen(text, 1);
    if (!r) return { form: 'none', frames: [] };
    const lines = r[0].split('\n');
    if (lines[0] !== 'Error' || lines.length < 2) return { form: 'formatting', frames: [] };   // V8's own header for `new Error()`, exactly
    const raw = lines.slice(1).map(stringFrame);
    if (raw.some((x) => x === null)) return { form: 'formatting', frames: [] };   // ONE line not in V8's format ⇒ the whole sample is unreadable
    return { form: 'string', frames: raw.slice(1, 32).map((x) => frameOf(x, root, isRepoFile, null, isInternal)) };   // its own frame skipped
  }
  if (text[0] !== 'C') return { form: 'none', frames: [] };
  const frames = [];
  let i = 1;
  while (i < text.length && frames.length < 32) {
    const a = readLen(text, i); if (!a) break;
    const b = readLen(text, a[1]); if (!b) break;
    const m = /^(\d{1,9}),(\d{1,9})([en])/.exec(text.slice(b[1], b[1] + 21)); if (!m) break;
    frames.push(frameOf({ fn: a[0], file: b[0], line: Number(m[1]), encl: Number(m[2]), evalish: m[3] === 'e' }, root, isRepoFile, lineOf, isInternal));
    i = b[1] + m[0].length;
  }
  return { form: 'calls', frames };
}
/** PURE: the call-site form's frames (sampleOf's, for a caller that wants frames only). */
const parseSample = (text, root, isRepoFile = null, lineOf = null) => { const s = sampleOf(text, root, isRepoFile, lineOf); return s.form === 'calls' || s.form === 'string' ? s.frames : []; };
/** PURE: the first frame of the hub's own code, or null. */
const repoFrame = (frames) => (frames || []).find((f) => f.cls === 'repo') || null;
/** PURE: a sample's words — the top frames (≤ 3, a run of «outside» / «built-in» frames said once) and the first repo
 *  frame when it is deeper: «processChunkSync (node:zlib:463) ← zlibBufferSync (node:zlib:182) ← … ← loadIndex (src/x.js:12)». */
function chainWords(frames) {
  if (!frames || !frames.length) return '(no frame)';
  const top = [];
  for (const f of frames) {
    const w = frameText(f);
    if (top.length && top[top.length - 1] === w && (f.cls === 'outside' || f.cls === 'builtin')) continue;
    top.push(w);
    if (top.length >= 3) break;
  }
  const rf = repoFrame(frames), rw = rf ? frameText(rf) : null;
  if (rw && !top.includes(rw)) top.push('… ' + rw);
  return top.join(' ← ');
}
/** PURE: the table's key — the LOCATION of the first repo frame (else the top frame's): one function, ONE key, whichever
 *  form answered («x» from call sites, a location-only frame from the string form) — and its display words. */
const keyFrame = (frames) => { const rf = repoFrame(frames); const f = rf || (frames && frames[0]); return f ? frameLoc(f) : '(no frame)'; };
const keyWords = (frames) => { const rf = repoFrame(frames); const f = rf || (frames && frames[0]); return f ? frameText(f) : '(no frame)'; };

// ── the scheduler's facts ─────────────────────────────────────────────────────────────────────────────────────────────
const num = (x) => (Number.isFinite(x) ? x : null);
/** PURE: /proc/<pid>/task/<tid>/stat → {uMs, sMs, majflt} (fields 12, 14, 15 after the command's last «)»). */
function parseTaskStat(text, clkTck = 100) {
  const s = String(text || ''), i = s.lastIndexOf(')');
  if (i < 0) return null;
  const f = s.slice(i + 2).trim().split(/\s+/);   // f[0] = field 3 (state)
  const majflt = Number(f[9]), ut = Number(f[11]), st = Number(f[12]);
  if (!Number.isFinite(ut) || !Number.isFinite(st)) return null;
  return { uMs: ut * 1000 / clkTck, sMs: st * 1000 / clkTck, majflt: num(majflt) };
}
/** PURE: schedstat → {runNs, waitNs} (time on the CPU, time runnable on a run queue). */
function parseSchedstat(text) {
  const f = String(text || '').trim().split(/\s+/).map(Number);
  return f.length >= 2 && Number.isFinite(f[0]) && Number.isFinite(f[1]) ? { runNs: f[0], waitNs: f[1] } : null;
}
/** PURE: a cgroup's cpu.stat → {nrThrottled, throttledUs} (v2 throttled_usec; v1 throttled_time in ns), or null. */
function parseCpuStat(text) {
  const m = {};
  for (const l of String(text || '').split('\n')) { const [k, v] = l.trim().split(/\s+/); if (k && v !== undefined) m[k] = Number(v); }
  if (Number.isFinite(m.throttled_usec)) return { nrThrottled: num(m.nr_throttled), throttledUs: m.throttled_usec };
  if (Number.isFinite(m.throttled_time)) return { nrThrottled: num(m.nr_throttled), throttledUs: m.throttled_time / 1000 };
  return null;
}
/** PURE: /proc/self/cgroup → the cpu.stat files to try, the likeliest first (v2 unified; v1's cpu controller). */
function cpuStatPaths(cgroupText) {
  const out = [];
  for (const l of String(cgroupText || '').split('\n')) {
    const m = /^\d+:([^:]*):(\/.*)$/.exec(l.trim());
    if (!m) continue;
    const p = m[2] === '/' ? '' : m[2].replace(/\/+$/, '');
    if (p.includes('..')) continue;
    if (m[1] === '') out.push(`/sys/fs/cgroup${p}/cpu.stat`);
    else if (m[1].split(',').includes('cpu')) out.push(`/sys/fs/cgroup/${m[1]}${p}/cpu.stat`, `/sys/fs/cgroup/cpu${p}/cpu.stat`);
  }
  out.push('/sys/fs/cgroup/cpu.stat');   // a container's own namespace root (its path in /proc/self/cgroup is the host's)
  return [...new Set(out)];
}
/** PURE: /proc/pressure/<x> → {someUs, fullUs} (the totals), or null. */
function parsePressure(text) {
  const t = String(text || ''), s = /some .*total=(\d+)/.exec(t), f = /full .*total=(\d+)/.exec(t);
  return s ? { someUs: Number(s[1]), fullUs: f ? Number(f[1]) : null } : null;
}
/** PURE: /proc/self/status → its VmRSS in bytes, or null. */
function parseRss(text) { const m = /VmRSS:\s+(\d+)\s*kB/.exec(String(text || '')); return m ? Number(m[1]) * 1024 : null; }
/** PURE: one reading from the texts the watchdog read (any may be missing). */
function readingOf({ at, stat, schedstat, cpuStat, cpuPressure, memPressure, status }, clkTck = 100) {
  return { at, task: parseTaskStat(stat, clkTck), sched: parseSchedstat(schedstat), cpu: parseCpuStat(cpuStat), cpuP: parsePressure(cpuPressure), memP: parsePressure(memPressure), rss: parseRss(status) };
}
/** PURE: two readings → what happened between them (ms; a fact missing on either side is null). */
function schedDelta(a, b) {
  if (!a || !b) return null;
  const d = (x, y) => (x != null && y != null ? Math.max(0, y - x) : null);
  const userMs = a.task && b.task ? d(a.task.uMs, b.task.uMs) : null, kernelMs = a.task && b.task ? d(a.task.sMs, b.task.sMs) : null;
  const runMs = a.sched && b.sched ? d(a.sched.runNs, b.sched.runNs) / 1e6 : null, waitMs = a.sched && b.sched ? d(a.sched.waitNs, b.sched.waitNs) / 1e6 : null;
  return {
    wallMs: Math.max(0, b.at - a.at), userMs, kernelMs,
    ranMs: runMs != null ? runMs : userMs != null && kernelMs != null ? userMs + kernelMs : null, waitMs,
    majflt: a.task && b.task ? d(a.task.majflt, b.task.majflt) : null,
    throttledMs: a.cpu && b.cpu ? d(a.cpu.throttledUs, b.cpu.throttledUs) / 1000 : null,
    nrThrottled: a.cpu && b.cpu ? d(a.cpu.nrThrottled, b.cpu.nrThrottled) : null,
    cpuStallMs: a.cpuP && b.cpuP ? d(a.cpuP.someUs, b.cpuP.someUs) / 1000 : null,
    memStallMs: a.memP && b.memP ? d(a.memP.someUs, b.memP.someUs) / 1000 : null,
    rss: b.rss,
  };
}
/** PURE: the delta of two readings ONLY when their window covers at least half of the hold [fromMs, toMs] — a window that
 *  missed it (no reading before it: the watchdog was itself held through it) judges nothing: null (no scheduler facts). */
function coveredDelta(a, b, fromMs, toMs) {
  if (!a || !b || !(toMs > fromMs)) return a && b ? schedDelta(a, b) : null;
  const cover = Math.max(0, Math.min(b.at, toMs) - Math.max(a.at, fromMs)) / (toMs - fromMs);
  return cover >= 0.5 ? schedDelta(a, b) : null;
}
/** THE verdict words (the table's first key). */
const V = {
  notRunning: 'not running (stopped, frozen or blocked)', waiting: 'waiting for a CPU', blocked: 'in the kernel (blocked)', kernel: 'in the kernel (on the CPU)',
  js: 'JavaScript', gc: 'garbage collection', native: 'native code or garbage collection', unsampled: 'on the CPU in user mode — JavaScript or native code, not sampled',
  unknown: 'not sampled, and no scheduler facts', notJs: 'not in JavaScript when asked (its kernel state unread)',
  cpu: 'on the CPU — JavaScript or native code, no sample of that part', runnable: 'not in JavaScript when asked (running or waiting for a CPU)',
};
/** PURE (round 5, smaller 1): why a hold the watchdog did not watch was not sampled — its own check ran ≥ STARVED_MS late
 *  ⇒ it was not running either; on time ⇒ none of its checks came after the hold's first second (it asks only from then) */
const unseenWhy = ({ starvedMs = 0 } = {}) => (starvedMs >= STARVED_MS ? 'unseen' : 'between');
/** PURE (the follow-up, minor 2): the words of «not sampled» — the unseen road says how late the watchdog was when it was
 *  late at all (100 ms or more) yet under the 1 s it calls starved, never «on time» */
function unsampledWords(h) {
  if (h.unsampled === 'between' && Number.isFinite(h.unseenLateMs) && h.unseenLateMs >= 100) return `the watchdog ran ${secs(h.unseenLateMs)} s late (under the 1 s it calls starved), and none of its checks came after the hold\u2019s first second — it asks only from then`;
  return UNSAMPLED[h.unsampled] || h.unsampled;
}
/** ROUND 5 (law B): a part of a hold is REAL when the scheduler's window gives it at least this share of the time measured */
const PART_SHARE = 0.25;
const CPU_CLS = ['js', 'native', 'notJs'], SLEEP_CLS = ['kernel', 'stopped'];
const topIn = (n, ks) => { let t = null; for (const k of ks) if ((n[k] || 0) > (t ? n[t] : 0)) t = k; return t; };
/** PURE (round 5, law B): THE WINDOW SAYS HOW MUCH, A SAMPLE SAYS WHERE. With a window covering the hold, its split by TIME
 *  — on the CPU (`ranMs`) vs asleep (the rest, less the wait for a CPU) — decides; the samples only name what each part
 *  was (the on-CPU part: which JavaScript, or native; the asleep part: its wait channel). A sample of the smaller part
 *  never names the hold (it is printed as a sample). Two REAL parts (each ≥ PART_SHARE of the window), each sampled, are
 *  said as two parts in time order (`order`: 'sleep' when the first asleep sample came before the first on-CPU one).
 *  → null (no covering window: the samples alone, by count) | [{v, ms, part}] (one or two, in time order). */
function partsOf({ d = null, n = {}, gc = false, order = null, spanMs = null } = {}) {
  const W0 = d && d.wallMs > 0 ? d.wallMs : 0;
  if (!W0 || d.ranMs == null) return null;
  // the follow-up (minor 1): the parts' shares are taken over the HOLD's own span — the window measured reaches up to a beat
  // past each side of it (and the idle before a hog), which round 5 counted as «asleep» (a 2.0 s hog with 0.42 s of naps
  // read «… then in the kernel (blocked) for 0.8 s»; a 2.6 s sleep read 2.9 s)
  const W = Number.isFinite(spanMs) && spanMs > 0 ? Math.min(W0, spanMs) : W0;
  const cpuMs = Math.min(d.ranMs, W), sleepMs = Math.max(0, W - cpuMs - Math.min(d.waitMs || 0, W - cpuMs));
  const ct = topIn(n, CPU_CLS), st = topIn(n, SLEEP_CLS);
  const cpuV = ct === 'js' ? V.js : gc ? V.gc : ct === 'native' ? V.native : ct === 'notJs' ? V.notJs : st ? V.cpu : V.unsampled;
  const cpu = { v: cpuV, ms: cpuMs, part: 'cpu' }, sleep = { v: st === 'stopped' ? V.notRunning : V.blocked, ms: sleepMs, part: 'sleep' };
  if (cpuMs >= PART_SHARE * W && sleepMs >= PART_SHARE * W && ct && st) return order === 'sleep' ? [sleep, cpu] : [cpu, sleep];
  return [cpuMs >= sleepMs ? cpu : sleep];
}
/** PURE: THE verdict of a hold (the measured table in the header, in its order). `n` = the asks that spoke for an instant
 *  INSIDE it, by class ({js, kernel, stopped, native, notJs} — `judgeAsks`); `lateMs` = the watchdog's own timer lateness
 *  inside it (late for most of it ⇒ it claims no more than it knows: «not running (stopped, frozen or blocked)», never the
 *  firm «stopped or frozen»); `gcMs` = the collections inside it (opted in; else null). THE LAW, once: «JavaScript» only
 *  from an ask answered at JavaScript speed; «native» only from an ask posted while ON THE CPU and not answered at that
 *  speed; an ask posted while ASLEEP names its wait channel — and, round 5 (law B), names the hold only when the window's
 *  larger part is asleep too (or as the asleep one of two real parts). */
const ASK_ORDER = ['kernel', 'stopped', 'js', 'native', 'runnable', 'notJs'];
function verdict({ d = null, n = {}, gcMs = null, lateMs = 0, order = null, spanMs = null } = {}) {
  const W = d && d.wallMs > 0 ? d.wallMs : 0;
  if (W && d.ranMs != null) {
    if (lateMs >= STOPPED_LATE_SHARE * W && d.ranMs + (d.waitMs || 0) < STOPPED_RUN_SHARE * W) return V.notRunning;
    if (d.waitMs != null && d.waitMs >= WAIT_SHARE * W) return V.waiting;
    if (d.ranMs < RAN_SHARE * W) return V.blocked;
    if (d.userMs != null && d.kernelMs != null && d.userMs + d.kernelMs > 0 && d.kernelMs >= KERNEL_SHARE * (d.userMs + d.kernelMs)) return V.kernel;
    // round 5 (law B): the window's split by time decides; the samples name each part (never the count of samples)
    return partsOf({ d, n, gc: !!(gcMs != null && gcMs >= GC_SHARE * W), order, spanMs }).map((p) => p.v).join(', then ');
  }
  // no window covers it: the samples alone, by count — the line says so and claims no more than they say
  const gc = !!(W && gcMs != null && gcMs >= GC_SHARE * W);
  let top = null;
  for (const k of ASK_ORDER) if ((n[k] || 0) > (top ? n[top] : 0)) top = k;
  if (!top) return gc ? V.gc : W && d.ranMs != null ? V.unsampled : V.unknown;
  if (top === 'kernel') return V.blocked;
  if (top === 'stopped') return V.notRunning;
  if (top === 'js') return V.js;
  if (gc) return V.gc;
  return top === 'native' ? V.native : top === 'runnable' ? V.runnable : V.notJs;
}
/** PURE: the thread's scheduling state from its /proc …/task/<tid>/stat text — the letter after the command's closing
 *  paren: 'running' (R: on a CPU or runnable), 'asleep' (S / D: inside a call), 'stopped' (T / t), else 'unknown'. */
function stateOf(statText) {
  const t = String(statText || ''), i = t.lastIndexOf(')');
  const c = i >= 0 ? t.charAt(i + 2) : '';
  return c === 'R' ? 'running' : c === 'S' || c === 'D' ? 'asleep' : c === 'T' || c === 't' ? 'stopped' : 'unknown';
}
const ASK_WORDS = { native: 'on the CPU, not in JavaScript (native code or a collection)', notJs: 'not in JavaScript (its kernel state unread)', stopped: 'stopped',
  runnable: 'running or waiting for a CPU, not in JavaScript (native code, a collection, or no CPU free)' };
/** PURE: ONE ASK, judged by where the thread was WHEN IT WAS ASKED (round 4). In: `postedAt` (monotonic ms, the post),
 *  `answeredAt` (the sample's own FIRST instruction; null = no answer), `state` at the post (`stateOf`), `kernel` (its wait
 *  channel in words, asleep only), `answer` ({kind: 'js', words, key, keyWords, empty, deep} | null), `beat` (the main
 *  thread's beat count when the sample ran; −1 = inside the beat), `beat0` (the hold's), `holdEnd` (the beat that ended the
 *  gap — null while it lasts). Out: {cls, words, key, keyWords, after}:
 *    'outside'  posted at or after the hold's end — not this hold's;
 *    'kernel'   ASLEEP at the post — the kernel's word with its wait channel (a later answer is «after»);
 *    'stopped'  STOPPED at the post;
 *    'js'       answered at JavaScript speed (≤ jsFastMs after the post — a deep stack is JavaScript by its own error),
 *               before the hold's end, with a JavaScript frame on its stack;
 *    'end'      answered at JavaScript speed with NO JavaScript on its stack (the loop's own machinery — the held code had
 *               returned), or in / after the beat that ended the gap: never inside — the hold's end is the fact, no margin;
 *    'native'   ON THE CPU at the post, not answered at JavaScript speed: native code or a collection — its only road;
 *    'notJs'    its state unread, not answered at JavaScript speed: not in JavaScript, nothing more.
 *  `after` (native / kernel / stopped / notJs) = a frame of the late answer that ran BEFORE the loop turned — «the first
 *  JavaScript after it» (the held code's own continuation). */
function askOf({ postedAt = null, answeredAt = null, state = 'unknown', kernel = null, answer = null, beat = null, beat0 = null, holdEnd = null, jsFastMs = JS_FAST_MS, windowed = true } = {}) {
  if (Number.isFinite(holdEnd) && Number.isFinite(postedAt) && postedAt >= holdEnd) return { cls: 'outside' };
  const ranInside = Number.isInteger(beat) && beat !== -1 && beat === beat0;
  const framed = !!(answer && answer.kind === 'js' && !answer.empty);
  const after = framed && ranInside && !answer.deep && !answer.failed && answer.key !== KEYS.unreadable ? { words: answer.words, key: answer.key, keyWords: answer.keyWords } : null;
  if (state === 'asleep') { const w = `asleep: ${kernel || 'in a call'}`; return { cls: 'kernel', words: w, key: `(${w})`, keyWords: `(${w})`, after }; }
  if (state === 'stopped') return { cls: 'stopped', words: ASK_WORDS.stopped, key: '(stopped)', keyWords: '(stopped)', after };
  const fast = !!answer && answer.kind === 'js' && (answer.deep === true || (Number.isFinite(answeredAt) && Number.isFinite(postedAt) && answeredAt - postedAt <= jsFastMs));
  if (fast) return !ranInside || !framed ? { cls: 'end' } : { cls: 'js', words: answer.words, key: answer.key, keyWords: answer.keyWords };
  // round 5 (smaller 3): stat R is «running OR runnable» — only a scheduler window covering the hold tells the two apart
  if (state === 'running' && !windowed) return { cls: 'runnable', words: ASK_WORDS.runnable, key: '(running or waiting for a CPU)', keyWords: '(running or waiting for a CPU)', after };
  if (state === 'running') return { cls: 'native', words: ASK_WORDS.native, key: '(native)', keyWords: '(native)', after };
  return { cls: 'notJs', words: ASK_WORDS.notJs, key: '(not in JavaScript)', keyWords: '(not in JavaScript)', after };
}
/** PURE: a hold's asks → `samples` (the asks that speak for an instant INSIDE it, each with its class), `outside` ({end,
 *  outside, withdrawn}), `after` (the first nameable «after» frame). The watchdog calls it at the hold's end; the suite's
 *  table too. ROUND 5 (law A): AN ASK THE SAMPLER WITHDREW IS NOT A SAMPLE — one it answered with a stand-down
 *  (`withdrawn`: a debugger opened, an accessor on Error.prepareStackTrace) and, in a hold during which it stood down
 *  (`standDown`), one that got no answer at all (its silence may be the debugger's) say nothing about the thread: they
 *  are counted `withdrawn`, never «running, no fast answer» ⇒ native. Only a REAL answer of the same hold samples it. */
function judgeAsks(asks, { beat0 = null, holdEnd = null, jsFastMs = JS_FAST_MS, standDown = null, windowed = true } = {}) {
  const samples = [], outside = { end: 0, outside: 0, withdrawn: 0 };
  let after = null;
  for (const q of asks || []) {
    if (q && (q.withdrawn || (standDown && !q.answer))) { outside.withdrawn++; continue; }
    const a = askOf({ ...q, beat0, holdEnd, jsFastMs, windowed });
    if (a.cls === 'end' || a.cls === 'outside') { outside[a.cls]++; continue; }
    samples.push(Number.isFinite(q.postedAt) ? { ...a, at: q.postedAt } : a);   // round 5 (law B): the time order of a hold's parts
    if (a.after && !after) after = a.after;
  }
  return { samples, outside, after };
}

/** PURE: THE HEAP THAT FILLS (round 4): the process dies when its OLD generation reaches its limit — heap_size_limit also
 *  holds the young generation's reserve (288 MB under --max-old-space-size=96 on Node 24: the process died at 95–99 MB
 *  used while «85 % of the limit» was 245 MB). → {used (all spaces but the young ones), limit (the stated
 *  --max-old-space-size, else heap_size_limit less three semi-spaces), high (used ≥ PROFILE_HEAP_SHARE of it)}. `argv` =
 *  NODE_OPTIONS's words then the process's execArgv (a later flag wins); `spaces` = v8.getHeapSpaceStatistics(). */
function heapFillOf({ stats = {}, spaces = [], argv = [], nodeMajor = 24, share = PROFILE_HEAP_SHARE } = {}) {
  const MiB = 1048576;
  const flag = (name) => {
    let v = null;
    for (let i = 0; i < (argv || []).length; i++) {
      const t = String(argv[i]).replace(/_/g, '-');
      if (t.startsWith(`--${name}=`)) v = Number(t.slice(name.length + 3)); else if (t === `--${name}` && i + 1 < argv.length) v = Number(argv[i + 1]);
    }
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const young = (spaces || []).filter((x) => x && (x.space_name === 'new_space' || x.space_name === 'new_large_object_space')).reduce((a, x) => a + (Number(x.space_used_size) || 0), 0);
  const used = Math.max(0, (Number(stats.used_heap_size) || 0) - young);
  const old = flag('max-old-space-size'), semi = flag('max-semi-space-size');
  const limit = old != null ? old * MiB : Math.max(0, (Number(stats.heap_size_limit) || 0) - 3 * (semi != null ? semi : DEFAULT_SEMI_MB(nodeMajor)) * MiB);
  return { used, limit, high: limit > 0 && used >= share * limit };
}
/** this process's flag words for heapFillOf */
const nodeArgv = () => [...String(process.env.NODE_OPTIONS || '').split(/\s+/).filter(Boolean), ...process.execArgv];

// ── the hold's words ──────────────────────────────────────────────────────────────────────────────────────────────────
const secs = (ms) => { const s = Math.max(0, ms || 0) / 1000; return s < 100 ? s.toFixed(1) : String(Math.round(s)); };
const gb = (b) => (b == null ? '?' : (b / 1073741824).toFixed(b >= 10 * 1073741824 ? 0 : 1));
/** PURE: how long it was held — from the main thread's OWN beats: at least the gap less one beat (`ms`), at most the gap
 *  (`msHi`); said as a range when they differ by 50 ms or more («held 1.8–2.0 s»), one number else (the boot: exact). */
function heldWords(h) {
  const lo = Math.max(0, h.ms || 0), hi = h.msHi != null && h.msHi > lo ? h.msHi : lo;
  return hi - lo >= 50 && secs(lo) !== secs(hi) ? `${secs(lo)}–${secs(hi)} s` : `${secs(lo)} s`;
}
/** PURE: the scheduler's numbers in plain words — «the main thread ran 11.9 s of the 12.4 s measured (user 11.2, kernel 0.7)» (the window
 *  measured runs from the watchdog's check before the hold to its check after it: up to a beat each side of it), «— waited
 *  11.0 s for a CPU; its group was throttled 9.8 s (40 times)». */
function schedWords(d) {
  if (!d || d.ranMs == null) return '';
  const parts = [`the main thread ran ${secs(d.ranMs)} s of the ${secs(d.wallMs)} s measured${d.userMs != null ? ` (user ${secs(d.userMs)}, kernel ${secs(d.kernelMs)})` : ''}`];
  if (d.waitMs != null && d.waitMs >= 100) parts[0] += ` — waited ${secs(d.waitMs)} s for a CPU`;
  if (d.shared >= 2) parts[0] += ` (one window for the ${d.shared} holds the watchdog slept through — these numbers are theirs together)`;   // round 5 (smaller 2)
  if (d.throttledMs != null && d.throttledMs >= 100) parts.push(`its group was throttled ${secs(d.throttledMs)} s${d.nrThrottled ? ` (${d.nrThrottled} times)` : ''}`);
  if (d.majflt) parts.push(`${d.majflt} major page fault${d.majflt === 1 ? '' : 's'}`);
  const pr = [d.cpuStallMs >= 100 ? `cpu ${secs(d.cpuStallMs)} s` : '', d.memStallMs >= 100 ? `memory ${secs(d.memStallMs)} s` : ''].filter(Boolean);
  if (pr.length) parts.push(`the box's pressure: ${pr.join(', ')}`);
  return parts.join('; ');
}
const GC_KINDS = { 1: 'scavenge', 2: 'mark-compact', 4: 'mark-compact', 8: 'incremental marking', 16: 'weak callbacks' };
/** PURE: the collections inside a hold → {ms, words} («garbage collection: mark-compact 3.1 s, scavenge 0.2 s (14) inside
 *  the hold») — only when a maintainer opted the observer in (loop-holds `observeGc`); by default there are none. */
function gcOf(entries, from, to) {
  const by = new Map(); let ms = 0;
  for (const e of entries || []) {
    if (!(e && e.at + e.ms >= from && e.at <= to)) continue;
    const k = GC_KINDS[e.kind] || 'collection', o = by.get(k) || { ms: 0, n: 0 };
    o.ms += e.ms; o.n++; by.set(k, o); ms += e.ms;
  }
  if (!by.size) return { ms: 0, words: '' };
  const words = 'garbage collection: ' + [...by].sort((a, b) => b[1].ms - a[1].ms).map(([k, o]) => `${k} ${secs(o.ms)} s${o.n > 1 ? ` (${o.n})` : ''}`).join(', ') + ' inside the hold';
  return { ms, words };
}
/** PURE: the memory a hold line carries: «heap 3.4 of 4.1 GB, external 0.4 GB, rss 3.9 GB». */
function memWords(m) {
  if (!m) return '';
  return [m.heapUsed != null ? `heap ${gb(m.heapUsed)} of ${gb(m.heapLimit)} GB` : '', m.external != null ? `external ${gb(m.external)} GB` : '', m.rss != null ? `rss ${gb(m.rss)} GB` : ''].filter(Boolean).join(', ');
}
const pct = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(Math.max(0, Math.min(1, x)) * 100));
/** PURE: the folded samples → «busyHog (src/x.js:38) ×4, no JavaScript frame ×2». */
function samplesWords(samples) {
  const by = new Map();
  for (const s of samples || []) { const w = s.words || (s.kind === 'js' ? '(no frame)' : 'no JavaScript frame'); by.set(w, (by.get(w) || 0) + 1); }
  return [...by].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} ×${n}`).join(', ');
}
const UNSAMPLED = { off: 'sampling is off in Settings', debugger: 'a debugger is attached', cap: `${CAP_PER_HOUR} holds were sampled in the last hour`, inspector: 'this Node has no inspector', failed: 'the sampler could not connect',
  unseen: 'the watchdog was not running either', between: 'the watchdog ran on time, but none of its checks came after the hold\u2019s first second — it asks only from then', accessor: 'Error.prepareStackTrace is an accessor here — the sampler stands down', heap: `the heap is above ${PROFILE_HEAP_SHARE * 100} % of its limit`,
  unknown: 'the setting was not read yet', lost: 'the watchdog thread stopped', inside: 'no sample landed inside it' };
/** PURE: where an answer ran against the hold's own beats: 'end' — inside the beat itself; 'after' — a later beat;
 *  'inside' — before the beat that ended the gap (no margin: `askOf` says an answer with no JavaScript on its stack is the
 *  loop's own machinery, never inside). */
function landedOf({ beat, beat0 } = {}) {
  if (beat === -1) return 'end';
  if (!Number.isInteger(beat) || beat !== beat0) return 'after';
  return 'inside';
}
/** PURE: THE ONE BAR FOR A HOLD, watched or not (round 4): the beats bound a hold between the gap less one beat (`lo`) and
 *  the gap (`hi`); it is a hold when the MIDDLE of that range reaches holdMs (a length known exactly — the boot's — is its
 *  own middle). One bar for the watchdog's own holds, the holds it could not watch and the main thread's ring alike. */
const isHoldOf = ({ lo, hi = null, holdMs = HOLD_MS } = {}) => Number.isFinite(lo) && (lo + (Number.isFinite(hi) ? hi : lo)) / 2 >= holdMs;
/** PURE: a main-thread beat gap is a hold by the one bar */
const isGapHold = (gap, beatMs = BEAT_MS, holdMs = HOLD_MS) => Number.isFinite(gap) && isHoldOf({ lo: gap - beatMs, hi: gap, holdMs });
/** PURE: THE RULE FOR A HOLD THE WATCHDOG COULD NOT WATCH: the MAIN thread's own beat gap alone says it, by the one bar.
 *  The watchdog's own lateness is NOT an argument — a late watchdog invents no hold. */
const isUnseenHold = ({ mainGap, late = 0, beatMs = BEAT_MS, holdMs = HOLD_MS } = {}) => isGapHold(mainGap, beatMs, holdMs);   // eslint-disable-line no-unused-vars
/** the words of three answers that are not a frame (the check's condition 3) */
const WORDS = { deep: 'the stack was nearly full (deep recursion)', between: 'between JavaScript frames (promise / microtask jobs)', unreadable: '(frames unreadable at that instant)',
  formatting: 'frames unreadable (inside the program\u2019s own stack formatting)', failed: 'the sample could not run' };
const KEYS = { deep: '(deep recursion)', between: '(between JavaScript frames)', unreadable: '(frames unreadable)', formatting: '(frames unreadable)', failed: '(the sample could not run)' };
/** PURE (round 4 (5)): what a sample that THREW says — `deep` only for a full stack (a RangeError / «Maximum call stack»),
 *  else «the sample could not run (<the error's own class>)» (a class that is not a plain word: «an error»; the session's
 *  own refusal: «the session refused it») — never «deep recursion» for another cause */
function thrownOf({ err = null, className = null, description = '', text = '' } = {}) {
  if (className === 'RangeError' || /Maximum call stack/.test(String(description || '')) || /Maximum call stack/.test(String(text || ''))) return { kind: 'js', words: WORDS.deep, key: KEYS.deep, keyWords: KEYS.deep, deep: true };
  const word = typeof className === 'string' && /^[A-Za-z]{1,40}$/.test(className) ? className : err ? 'the session refused it' : 'an error';
  return { kind: 'js', words: `${WORDS.failed} (${word})`, key: KEYS.failed, keyWords: KEYS.failed, failed: true };
}
/** PURE (round 4 (4)): may a live hold ask again? The switch and a debugger are re-read at EVERY step (bits of the main
 *  thread's flag word: 1 sampling on, 2 a debugger, 8 the setting known) → null (ask) | 'off' | 'debugger' | 'unknown' */
const stepRefusalOf = (flags) => (!(flags & 8) ? 'unknown' : !(flags & 1) ? 'off' : flags & 2 ? 'debugger' : null);
/** PURE: the samples that spoke for an instant INSIDE the hold (judged by `judgeAsks`: each carries its class) */
const insideOf = (h) => (h.samples || []).filter((x) => !x.landed || x.landed === 'inside');
/** PURE: a sample's class (a PURE caller's own fixture without one: a framed JavaScript sample is 'js', any other 'notJs') */
const clsOf = (x) => x.cls || (x.kind === 'js' ? 'js' : 'notJs');
const OUTSIDE_WORDS = { end: 'the answer came at its end, with no frame of it', outside: 'asked after it ended' };
/** PURE: the asks that spoke for no instant inside — «asked 2 times: the answer came at its end, with no frame of it» */
function notInsideWords(h) {
  const o = h.outside || {}, n = (o.end || 0) + (o.outside || 0);
  if (!n) return UNSAMPLED.inside;
  const where = ['end', 'outside'].filter((k) => o[k]).map((k) => OUTSIDE_WORDS[k] + (o[k] > 1 ? ` (${o[k]})` : ''));
  return `${UNSAMPLED.inside} — asked ${n} time${n === 1 ? '' : 's'}: ${where.join(', ')}`;
}
/** PURE: a hold's facts → its fold (the verdict, the table's key — a LOCATION — and its display words, the counts). */
function foldHold(h) {
  const samples = insideOf(h);
  const n = {};
  for (const x of samples) { const c = clsOf(x); n[c] = (n[c] || 0) + 1; }
  const js = n.js || 0, none = samples.length - js;
  const gc = gcOf(h.gc, h.fromM != null ? h.fromM : h.from, h.toM != null ? h.toM : h.to);
  const firstAt = (ks) => { let t = null; for (const x of samples) if (ks.includes(clsOf(x)) && Number.isFinite(x.at) && (t == null || x.at < t)) t = x.at; return t; };
  const tc = firstAt(CPU_CLS), ts = firstAt(SLEEP_CLS), order = tc != null && ts != null && ts < tc ? 'sleep' : 'cpu';
  const spanMs = Number.isFinite(h.msHi) ? h.msHi : Number.isFinite(h.ms) ? h.ms : null;
  const v = verdict({ d: h.d, n, gcMs: h.gc ? gc.ms : null, lateMs: h.lateMs || 0, order, spanMs });
  const W = h.d && h.d.wallMs > 0 ? h.d.wallMs : 0;
  const parts = W && h.d.ranMs != null && v.includes(', then ') ? partsOf({ d: h.d, n, gc: !!(h.gc && gc.ms != null && gc.ms >= GC_SHARE * W), order, spanMs }) : null;
  // the follow-up (minor 3): parts that INTERLEAVE (JavaScript, asleep, JavaScript …) are said as both, never one «then»
  const seq = samples.filter((x) => Number.isFinite(x.at)).slice().sort((p, q) => p.at - q.at).map((x) => (CPU_CLS.includes(clsOf(x)) ? 'c' : SLEEP_CLS.includes(clsOf(x)) ? 's' : '')).filter(Boolean).join('').replace(/(.)\1+/g, '$1');
  const interleaved = !!parts && seq.length > 2;
  const topOf = (cls) => {
    const by = new Map(), words = new Map();
    for (const x of samples) if (clsOf(x) === cls) { by.set(x.key, (by.get(x.key) || 0) + 1); if (!words.has(x.key) || (x.keyWords && !/^[\w./@+-]+:\d+$/.test(x.keyWords))) words.set(x.key, x.keyWords || x.key); }
    const t = [...by].sort((a, b) => b[1] - a[1])[0];
    return t ? { key: t[0], words: words.get(t[0]) } : null;
  };
  // the table's key: the JavaScript frame most asks found; else the kernel's wait channel of a kernel verdict; else the
  // first JavaScript after it (marked «after»)
  const top = topOf('js') || (v === V.blocked ? topOf('kernel') : null);
  const frameKey = top ? top.key : h.afterKey ? `${h.afterKey} (after)` : !samples.length ? '(not sampled)' : '(no JavaScript frame)';
  const frame = top ? top.words : h.afterKey ? `${h.afterKeyWords || h.afterKey} (after)` : frameKey;
  return { verdict: v, frame, frameKey, js, none, n, gc, inside: samples.length, parts, interleaved };
}
/** why a frame's name was not read (the watchdog reads source files only after a hold has ended, within a budget) */
const NAMES_UNREAD = { slow: 'the source files answered slowly — names are not read for ten minutes', budget: 'the time for reading names was spent' };
const SCHED_FIRST = new Set([V.notRunning, V.waiting, V.blocked, V.kernel]);
/** PURE: THE resume line of a hold (the main thread writes it once the loop turns again). Never an empty tail; the main
 *  thread's own numbers and the samples each say what they are (a frame beside «ran 0.0 s» is WHERE it was). */
function holdLine(h) {
  const f = h.fold || foldHold(h);
  // round 5 (law B): a hold with two real parts says both, in time order, with the window's seconds
  const vw = f.parts && f.parts.length === 2 ? (f.interleaved ? `${f.parts.map((p) => `${p.v} for ${secs(p.ms)} s`).join(' and ')}, interleaved` : f.parts.map((p) => `${p.v} for ${secs(p.ms)} s`).join(', then ')) : f.verdict;
  const head = h.boot ? `[loop-hold] the boot held the main loop ${heldWords(h)} before its first turn — ${vw}` : `[loop-hold] the main loop was held ${heldWords(h)} — ${vw}`;
  const parts = [schedWords(h.d)];
  if (!h.d && !h.boot && insideOf(h).length) parts.push('no scheduler window covered it — the samples alone say where it was');   // the boot has no window by construction
  const inside = insideOf(h), asked = inside.length + Object.values(h.outside || {}).reduce((a, b) => a + (b || 0), 0);
  if (inside.length) {
    const n = `${inside.length} sample${inside.length === 1 ? '' : 's'}`;
    parts.push(`${SCHED_FIRST.has(f.verdict) && f.js ? `where it was (${n})` : n}: ${samplesWords(inside)}${h.standDown ? ` — then ${UNSAMPLED[h.standDown] || h.standDown}: the sampler stood down` : ''}`);
  } else if (h.unsampled) parts.push(`not sampled (${unsampledWords(h)})`);
  else if (asked) parts.push(`not sampled (${notInsideWords(h)})`);
  if (h.after) parts.push(`the first JavaScript after it: ${h.after}`);
  if (h.namesUnread && h.namesUnread.n) parts.push(`the frames of ${h.namesUnread.n} source file${h.namesUnread.n === 1 ? '' : 's'} said by location alone (${NAMES_UNREAD[h.namesUnread.why] || NAMES_UNREAD.budget})`);
  parts.push(f.gc.words, memWords(h.mem));
  const e = pct(h.eluBefore);
  if (e != null) parts.push(`the loop was ${e} % busy in the minute before`);
  if (h.starvedMs >= STARVED_MS && f.verdict !== V.notRunning) parts.push(`the watchdog was starved ${secs(h.starvedMs)} s too`);
  const tail = parts.filter(Boolean).join('; ');
  return tail ? head + ': ' + tail : head;
}
/** PURE: the words the watchdog's «has been held» line gains while the hold lasts. */
function liveWords({ samples = [], pendingMs = 0, pendingState = null, pendingKernel = null, unsampled = null, d = null } = {}) {
  const parts = [];
  const js = samples.filter((x) => clsOf(x) === 'js');
  if (pendingMs >= NO_ANSWER_MS) parts.push(pendingState === 'asleep' ? `asleep in the kernel since it was asked ${secs(pendingMs)} s ago${pendingKernel ? ` (${pendingKernel})` : ''}` : `no JavaScript answered for ${secs(pendingMs)} s (${pendingState === 'running' ? 'on the CPU: native code or a collection' : 'not in JavaScript'})`);
  else if (js.length) parts.push(`JavaScript: ${js[js.length - 1].words} [${js.length} of ${samples.length} samples]`);
  else if (samples.length) parts.push(`no JavaScript at the instant asked: ${samplesWords(samples)}`);
  else if (unsampled) parts.push(`not sampled (${UNSAMPLED[unsampled] || unsampled})`);
  const sw = schedWords(d);
  if (sw) parts.push(sw);
  return parts.join('; ');
}

// ── the schedule, the cap, the table ──────────────────────────────────────────────────────────────────────────────────
/** PURE: is sample k due at `heldMs`? (k = 0 … SAMPLES_PER_HOLD − 1; held ≈ holdMs × 2^k) */
const sampleDue = (k, heldMs, holdMs = HOLD_MS, max = SAMPLES_PER_HOLD) => k < max && heldMs >= holdMs * 2 ** k;
/** PURE: the most samples a hold of `heldMs` may carry under the schedule (the live suite's upper bound). */
const samplesBound = (heldMs, holdMs = HOLD_MS, max = SAMPLES_PER_HOLD) => { let k = 0; while (sampleDue(k, heldMs, holdMs, max)) k++; return k; };
/** PURE: may one more hold be sampled at `now`? `times` = the starts of the sampled holds (pruned in place to the hour). */
function capAllows(times, now, cap = CAP_PER_HOUR, windowMs = 3600000) {
  while (times.length && times[0] <= now - windowMs) times.shift();
  return times.length < cap;
}
/** PURE: the since-start table — keyed by (verdict, frame LOCATION), bounded: a new key past `max` folds into «other»;
 *  the row shows the frame's display words (a named one wins over a location-only one). */
function tableAdd(table, { verdict: v, frame, frameKey }, ms, max = TABLE_KEYS) {
  const fk = frameKey || frame;
  let k = v + '\u0000' + fk;
  if (!table.has(k) && table.size >= max) k = 'other\u0000(other)';
  const other = k.startsWith('other\u0000');
  const r = table.get(k) || { verdict: other ? 'other' : v, frame: other ? '(other)' : frame, count: 0, totalMs: 0, worstMs: 0 };
  if (!other && frame && frame !== fk && r.frame === fk) r.frame = frame;
  r.count++; r.totalMs += ms; r.worstMs = Math.max(r.worstMs, ms);
  table.set(k, r);
  return r;
}
const tableRows = (table, top = TABLE_KEYS + 1) => [...table.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, top);
/** PURE: the hold as the API / Diagnostics / the incident bundle carry it — the formatter's words and numbers only. */
function publicHold(h) {
  const f = h.fold || foldHold(h);
  return { at: h.from, ms: Math.round(h.ms), msHi: h.msHi != null ? Math.round(h.msHi) : null, boot: !!h.boot, verdict: f.verdict, frame: f.frame, line: h.line || holdLine(h),
    samples: insideOf(h).length, js: f.js, gcMs: Math.round(f.gc.ms), ranMs: h.d && h.d.ranMs != null ? Math.round(h.d.ranMs) : null,
    waitMs: h.d && h.d.waitMs != null ? Math.round(h.d.waitMs) : null, throttledMs: h.d && h.d.throttledMs != null ? Math.round(h.d.throttledMs) : null };
}
/** PURE: a report within `maxBytes` of JSON (the incident bundle's share): the table's tail, then the oldest holds, then
 *  the lines are cut until it fits; `truncated` says what went. */
function boundReport(rep, maxBytes = 64 * 1024) {
  const r = JSON.parse(JSON.stringify(rep || {}));
  const enc = new TextEncoder(), size = () => enc.encode(JSON.stringify(r)).length;   // bytes (UTF-8), in any process
  const cut = { table: 0, holds: 0, lines: 0 };
  while (size() > maxBytes && Array.isArray(r.table) && r.table.length > 10) { r.table.pop(); cut.table++; }
  while (size() > maxBytes && Array.isArray(r.holds) && r.holds.length > 5) { r.holds.pop(); cut.holds++; }
  if (size() > maxBytes && Array.isArray(r.holds)) for (const h of r.holds) if (h && typeof h.line === 'string' && h.line.length > 400) { h.line = h.line.slice(0, 400) + '…'; cut.lines++; }
  while (size() > maxBytes && Array.isArray(r.table) && r.table.length) { r.table.pop(); cut.table++; }
  while (size() > maxBytes && Array.isArray(r.holds) && r.holds.length) { r.holds.pop(); cut.holds++; }
  if (cut.table || cut.holds || cut.lines) r.truncated = { ...cut, maxBytes };
  return r;
}

// ── the profile a person presses (law L) ──────────────────────────────────────────────────────────────────────────
const PROFILE_MS = 600000, PROFILE_EVERY_MS = 1000, PROFILE_TOP = 20;
const PROFILE_KEEP = 50;      // the frame locations a profile's RESULT keeps (the rest is ONE «other» count): it always fits its slot
const PROFILE_WORD_MAX = 300; // a kept frame's key / words, at most (a long node_modules path)
const PROFILE_NOTE = 'one sample a second; the main thread asleep in its own loop is idle and asleep in any other call is «no JavaScript frame» (native work, a syscall), neither asked; a thread on the CPU is asked and an answer within 50 ms names what ran; «between JavaScript frames» is the loop held by promise / microtask jobs';
/** ONE table of words for why a profile stopped early — the journal line and ⚙ Diagnostics say the same sentence (the
 *  client words it with t(): each sentence has its zh / ja entry, scripts/i18n-check.mjs's key tables); a cause this table
 *  does not know draws the neutral sentence, never another cause's. */
const PROFILE_STOPPED = {
  heap: 'It stopped early: the server’s memory neared its limit.',
  debugger: 'It stopped early: a debugger was attached to the server.',
  off: 'It stopped early: “Name the code that holds the server” was turned off in Settings.',
  unknown: 'It stopped early: the server had not read its settings.',
  inspector: 'It stopped early: this server’s Node has no inspector.',
  lost: 'It stopped early: the server’s watchdog thread stopped.',
};
const PROFILE_STOPPED_ANY = 'It stopped early.';
/** round 4: why the last profile DID NOT RUN — or, `lost`, ran until the watchdog thread stopped (never «did not run»):
 *  the window's ONE sentence (zh / ja by i18n-check's key tables), never the raw token */
const PROFILE_REFUSED = {
  heap: 'The last profile did not run: the server’s memory was near its limit.',
  off: 'The last profile did not run: “Name the code that holds the server” was off in Settings.',
  debugger: 'The last profile did not run: a debugger was attached to the server.',
  unknown: 'The last profile did not run: the server had not read its settings.',
  inspector: 'The last profile did not run: this server’s Node has no inspector.',
  lost: 'The last profile ran until the server’s watchdog thread stopped — its samples are lost.',
};
const PROFILE_REFUSED_ANY = 'The last profile did not run.';
/** why samples of a profile were not taken (a stand-down answered by the sample itself) */
const PROFILE_UNSAMPLED = {
  accessor: 'Some samples were not taken: the program’s Error.prepareStackTrace is an accessor, so the sampler stood down.',
  debugger: 'Some samples were not taken: a debugger was attached, so the sampler stood down.',
};
const PROFILE_UNSAMPLED_ANY = 'Some samples were not taken: the sampler stood down.';
/** PURE (round 5, smaller 6): a frame's words cut to `max` — «fn (location)» keeps the function in front and the location's
 *  TAIL (its file and line), the middle of the path going («busyHog (…/lib/index.js:12)»); words of another shape keep their
 *  tail. A function name itself past a quarter of `max` is cut at its end. */
function cutWords(x, max = PROFILE_WORD_MAX) {
  if (typeof x !== 'string' || x.length <= max) return x;
  const m = /^([^()]+?) \((.+)\)$/.exec(x);
  if (!m) return '…' + x.slice(-(max - 1));
  const fnMax = Math.floor(max / 4), fn = m[1].length > fnMax ? m[1].slice(0, fnMax - 1) + '…' : m[1];
  return `${fn} (…${m[2].slice(-(max - fn.length - 4))})`;
}
/** PURE: a profile's per-frame counts → what its RESULT keeps — the PROFILE_KEEP largest (key and words each ≤
 *  PROFILE_WORD_MAX) + ONE count of the rest: bounded by construction, whatever the profile met (5 000 distinct locations
 *  with long paths fit the same slot as five). */
function foldProfileBy(by, names, keep = PROFILE_KEEP) {
  // round 4: a long key is cut keeping its TAIL (the file and its line — what tells two locations apart), and two kept keys
  // that still meet after the cut stay two rows (a number on the second): never one row under one function's name
  const cut = (x) => (typeof x === 'string' && x.length > PROFILE_WORD_MAX ? '…' + x.slice(-(PROFILE_WORD_MAX - 1)) : x);
  const all = Object.entries(by || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const outBy = {}, outNames = {}, usedWords = new Set(); let other = 0;
  for (const [i, [k, n]] of all.entries()) {
    if (i >= keep) { other += n; continue; }
    let kk = cut(k);
    for (let j = 2; kk in outBy; j++) kk = `(#${j}) ` + k.slice(-(PROFILE_WORD_MAX - 6));   // the tail kept, numbered in front
    // round 5 (smaller 6): the WORDS keep the FUNCTION in front when the path is cut (the middle of the location goes), and
    // two rows whose words still meet are numbered — never 50 rows with one identical text
    let w = cutWords((names || {})[k] || k);
    for (let j = 2; usedWords.has(w); j++) w = `(#${j}) ` + cutWords((names || {})[k] || k, PROFILE_WORD_MAX - 6);
    usedWords.add(w); outBy[kk] = n; outNames[kk] = w;
  }
  return { by: outBy, names: outNames, other, locations: all.length };
}
/** PURE: integer counts → shares in tenths of a percent that sum to EXACTLY 100.0 (largest remainder). */
function sharesOf(counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) return counts.map(() => 0);
  const raw = counts.map((c) => (1000 * c) / n), base = raw.map(Math.floor);
  let left = 1000 - base.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - base[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; base[i]++; left--; }
  return base.map((x) => x / 10);
}
/** PURE: a finished profile's counts → its shares of all samples (summing to exactly 100 %): the idle loop, between
 *  JavaScript frames, no JavaScript frame, not sampled (a stand-down) and each top frame (keyed by its LOCATION, shown by
 *  its words) + ONE «other» row for every other frame; the sentences for a stop and for samples not taken. */
function profileOf(r) {
  const n = Math.max(0, (r && r.samples) || 0);
  const names = (r && r.names) || {};
  const ent = Object.entries((r && r.by) || {}).sort((a, b) => b[1] - a[1]);
  const top = ent.slice(0, PROFILE_TOP);
  const jsCount = Math.max(0, (r && r.js) || 0), other = Math.max(0, jsCount - top.reduce((a, [, k]) => a + k, 0));   // every JavaScript sample not in a top row (the result's own «other» included)
  const counts = [(r && r.idle) || 0, (r && r.between) || 0, (r && r.noJs) || 0, (r && r.unsampled) || 0, ...top.map(([, k]) => k), other];
  const sh = n ? sharesOf(counts) : counts.map(() => 0);
  const rows = top.map(([key, k], i) => ({ frame: names[key] || key, n: k, pct: sh[4 + i] }));
  if (other) rows.push({ frame: '(other)', n: other, pct: sh[4 + top.length], other: true });
  const jsPct = Math.round(10 * rows.reduce((a, x) => a + x.pct, 0)) / 10;
  const stopped = r && r.stopped ? r.stopped : null;
  return { startedAt: r && r.startedAt, endedAt: r && r.endedAt, samples: n, idlePct: sh[0], betweenPct: sh[1], noJsPct: sh[2], notSampledPct: sh[3], jsPct, top: rows, note: PROFILE_NOTE,
    locations: r && Number.isFinite(r.locations) ? r.locations : ent.length,
    ...(r && r.refused ? { refused: r.refused, refusedWords: PROFILE_REFUSED[r.refused] || PROFILE_REFUSED_ANY } : {}), ...(stopped ? { stopped, stoppedWords: PROFILE_STOPPED[stopped] || PROFILE_STOPPED_ANY } : {}),
    ...(sh[3] > 0 || (r && r.unsampled) ? { notSampledWords: PROFILE_UNSAMPLED[r && r.unsampledWhy] || PROFILE_UNSAMPLED_ANY } : {}),
    ...(r && r.tooLarge ? { tooLarge: true } : {}) };
}
/** PURE: the profile's journal line (the stop's sentence from THE table above). */
function profileLine(p) {
  if (p.refused === 'lost') return '[loop-hold] the profile ran until the watchdog thread stopped — its samples are lost';
  if (p.refused) return `[loop-hold] the profile did not run — ${UNSAMPLED[p.refused] || p.refused}`;
  return `[loop-hold] profile of ${secs((p.endedAt || 0) - (p.startedAt || 0))} s (${p.samples} samples): idle ${p.idlePct} %, between JavaScript frames ${p.betweenPct} %, no JavaScript frame ${p.noJsPct} %, ${p.notSampledPct ? `not sampled ${p.notSampledPct} %, ` : ''}JavaScript ${p.jsPct} %` +
    (p.top.length ? ' — ' + p.top.slice(0, 5).map((x) => `${x.frame} ${x.pct} %`).join(', ') : '') + (p.stopped ? ` — ${p.stoppedWords || PROFILE_STOPPED_ANY}` : '') +
    (p.notSampledPct && p.notSampledWords ? ` — ${p.notSampledWords}` : '') + (p.tooLarge ? ' — its frames could not be kept (too large)' : '');
}

module.exports = { partsOf, PART_SHARE, unseenWhy, unsampledWords, cutWords,
  profileOf, profileLine, foldProfileBy, sharesOf, heapFillOf, nodeArgv, PROFILE_MS, PROFILE_EVERY_MS, PROFILE_NOTE, PROFILE_HEAP_SHARE, PROFILE_KEEP, PROFILE_TOP, PROFILE_WORD_MAX,
  PROFILE_STOPPED, PROFILE_STOPPED_ANY, PROFILE_UNSAMPLED, PROFILE_UNSAMPLED_ANY, PROFILE_REFUSED, PROFILE_REFUSED_ANY, STOPPED_LATE_SHARE, STOPPED_RUN_SHARE, HOOK_KEY, ASK_WORDS, OUTSIDE_WORDS,
  frameOf, frameText, frameLoc, parseSample, sampleOf, stringFrame, spelledIn, repoFrame, chainWords, keyFrame, keyWords, sampleExpr, codeOf, thrownOf, stepRefusalOf, landedOf, isUnseenHold, isHoldOf, isGapHold, insideOf, notInsideWords,
  parseTaskStat, parseSchedstat, parseCpuStat, cpuStatPaths, parsePressure, parseRss, readingOf, schedDelta, coveredDelta, verdict, stateOf, askOf, judgeAsks, clsOf, UNREAD, V, KEYS, WORDS,
  schedWords, heldWords, gcOf, memWords, samplesWords, foldHold, holdLine, liveWords, publicHold, boundReport,
  sampleDue, samplesBound, capAllows, tableAdd, tableRows, secs, pct,
  SAMPLE_EXPR, UNSAMPLED, GC_KINDS,
  HOLD_MS, BEAT_MS, SAMPLES_PER_HOLD, NO_ANSWER_MS, JS_FAST_MS, SESSION_MS, CAP_PER_HOUR, LIVE_MS, RING_KEEP, TABLE_KEYS, GC_MIN_MS, RAN_SHARE, WAIT_SHARE, KERNEL_SHARE, GC_SHARE, STARVED_MS,
};
