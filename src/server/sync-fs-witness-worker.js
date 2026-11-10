'use strict';
/**
 * THE WITNESS'S WATCHDOG THREAD (lane hub-fuse-sync-guard). The main thread mirrors its ONE in-flight synchronous fs
 * call into a SharedArrayBuffer (src/server/sync-fs-witness.js) and beats a counter every BEAT_MS. This thread has its
 * own loop, so while the main thread is held it can still say so — straight to the journal (fd 2, one write(2) per line:
 * console.* in a worker is relayed through the main thread, which is the thread that is held):
 *   · a call in flight ≥ liveMs → «[sync-fs] the main thread has waited N s in statSync(/…/NAS/x) — the kernel:
 *     request_wait_answer in newfstatat» — again every REPEAT_MS while the same call holds; lane ledger-dedup-law r8: with
 *     the store it is made for when a timedSync armed one («… in appendFileSync(…) (usage-shards.write) — …»);
 *   · the heartbeat stale ≥ liveMs with NO call in flight → «… held N s outside any synchronous fs call» (JavaScript on
 *     the CPU, a child the main thread waits on, a native call — the kernel's answer says which).
 * The kernel's answer is the main thread's /proc/self/task/<pid>/wchan + syscall: procfs, never a mount.
 *
 * LANE HUB-LOOP-STALLS — THE HOLD IS NAMED (a fleet user's hub held 10–70 s, «on the CPU» and nothing else):
 *   · a HOLD exists only when the MAIN thread's own beats say so: the beat stale ≥ holdMs while this thread watches, or
 *     — seen only afterwards (this thread did not run either) — a gap the MAIN thread's beat wrote into its gap ring
 *     (≥ hold + beat), dated at the beat that ended it. A late watchdog never invents one. The boot: no beat yet — timed
 *     from the process's start, outside the cap. Every length from the monotonic clock; the wall clock dates once.
 *   · THE SCHEDULER'S FACTS, read by THIS thread only: the main thread's stat + schedstat at every check the loop was
 *     fresh (a short ring of baselines; a reading timed when it was read), plus its cgroup's cpu.stat, /proc/pressure and
 *     the RSS at the hold's first stale check, at each sample and at the end; judged only over a window that covers at
 *     least half of the hold; the PURE verdict (src/loop-hold.js) — the measured table, then THREE states.
 *   · THE SAMPLES: ONE ask in flight (a hold's or the profile's), asked at held ≈ 1, 2, 4 … × holdMs; ONE constant
 *     expression; its answer leaves through the main thread's NOTE slot with the main thread's beat count and monotonic
 *     time (where it landed: inside / at its end / after). The session by the main thread's kernel state: asleep in a call
 *     ⇒ posted and closed in one stretch (no session across an exit); on the CPU ⇒ kept until its answer, ≤ SESSION_MS,
 *     to read the RangeError of an ask that cannot enter a full stack. Unanswered at noAnswerMs while the loop is still
 *     held ⇒ «no JavaScript frame» INSIDE (the only road to «native»); the ask then runs at the first JavaScript after the
 *     native stretch — «the first JavaScript after it». A debugger port (the sample checks it ON the main thread: 'D') or
 *     an accessor on the stack hook ('A') stands the sampler down for the hold. A repo frame must be a REAL file of the
 *     repo, its name kept only where the file's own line spells it (read HERE, remembered). ≤ capPerHour sampled holds an
 *     hour; off by the setting (read before the first ask — unknown ⇒ nothing is asked), while a debugger port is open,
 *     without an inspector.
 *   · the watchdog judges itself: its own check running late is summed per hold; ≥ STARVED_MS = «starved N s too».
 *   · at the end the facts go to the main thread (`{ev: 'hold'}`), which adds the memory and the loop's utilization and
 *     writes the [loop-hold] line (src/server/loop-holds.js).
 *   · THE PROFILE a person presses: a sample every everyMs; the main thread's KERNEL STATE first (asleep in its own epoll
 *     with the beat fresh = idle, asleep in any other call = no JavaScript frame — neither asked: periodic asks of a free
 *     loop near the heap limit run Node 24 out of memory sooner); its END costs the main thread nothing — the result,
 *     bounded by construction, is written into a shared slot (read when someone asks for the report) and its line said here.
 */
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { answerMemory } = require('../worker-memory');
const LH = require('../loop-hold.js');

const SLOT_INTS = 8, SLOT_FLOATS = 3, SLOT_PATH = 1024;
const REPEAT_MS = 60000;
const AFTER_WAIT_MS = 2000;   // an abandoned ask at the hold's end: look this long for «the first JavaScript after it»
// published by the MAIN thread (inspector.url() and the setting are main-side facts): sampling on, a debugger port open,
// heap past the profile's bound, the setting known (unknown ⇒ nothing is asked)
const FLAG_SAMPLING = 1, FLAG_DEBUGGER = 2, FLAG_HEAP_HIGH = 4, FLAG_KNOWN = 8;
// x86_64 syscall numbers the main thread can be held in (the rest print as their number)
const SYSCALLS = { 0: 'read', 1: 'write', 2: 'open', 3: 'close', 4: 'stat', 5: 'fstat', 6: 'lstat', 7: 'poll', 16: 'ioctl', 17: 'pread64', 18: 'pwrite64', 21: 'access',
  35: 'nanosleep', 42: 'connect', 59: 'execve', 61: 'wait4', 72: 'fcntl', 74: 'fsync', 76: 'truncate', 78: 'getdents', 82: 'rename', 83: 'mkdir', 84: 'rmdir', 87: 'unlink',
  89: 'readlink', 90: 'chmod', 202: 'futex', 217: 'getdents64', 230: 'clock_nanosleep', 232: 'epoll_wait', 254: 'inotify_add_watch', 257: 'openat', 258: 'mkdirat',
  262: 'newfstatat', 263: 'unlinkat', 264: 'renameat', 267: 'readlinkat', 269: 'faccessat', 271: 'ppoll', 281: 'epoll_pwait', 316: 'renameat2', 332: 'statx', 439: 'faccessat2' };

const { sab, noteSab = null, profileSab = null, gapSab = null, fns = [], stores = [], pid, liveMs = LH.LIVE_MS, rootDir = null, beatMs = LH.BEAT_MS, holdMs = LH.HOLD_MS,
  noAnswerMs = LH.NO_ANSWER_MS, capPerHour = LH.CAP_PER_HOUR, samplesPerHold = LH.SAMPLES_PER_HOLD, bootAt = null, startedAt = null, procRoot = '/proc' } = workerData || {};
/** EVERY LENGTH FROM A CLOCK THAT CANNOT STEP: the process's monotonic clock (uv_hrtime — ONE clock for both threads); the
 *  wall clock only dates a hold once, when it is said (a +2 s or −1 h step of the date invents no hold and moves none). */
const mono = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
const toWall = (m) => Date.now() - (mono() - m);
// before the first beat: the boot's hold from the process's start when the witness started before the loop's first turn
// (bootAt), else an ordinary hold from the witness's own start
const firstFrom = bootAt != null ? bootAt : startedAt != null ? startedAt : mono();
const I = sab ? new Int32Array(sab, 0, SLOT_INTS) : null, T = sab ? new Float64Array(sab, SLOT_INTS * 4, SLOT_FLOATS) : null;
const P = sab ? new Uint8Array(sab, SLOT_INTS * 4 + SLOT_FLOATS * 8, SLOT_PATH) : null;
// the main thread's NOTE slot (src/server/sync-fs-witness.js): [seqlock, count, bytes, beat when written, ENTERED, beat at
// entry, -, -] + the monotonic time it was written + the answer's bytes
const NI = noteSab ? new Int32Array(noteSab, 0, 8) : null, NF = noteSab ? new Float64Array(noteSab, 32, 1) : null, NB = noteSab ? new Uint8Array(noteSab, 40) : null;
const PI = profileSab ? new Int32Array(profileSab, 0, 4) : null, PB = profileSab ? new Uint8Array(profileSab, 16) : null;
// the main thread's own beat GAPS ≥ hold − beat, a ring written by its beat ([count] + {end, gap} pairs, monotonic ms) —
// nothing is lost between two of this thread's checks however late it is (the read-then-acknowledge race of round 2 is gone)
const GAPS = 16;
const GI = gapSab ? new Int32Array(gapSab, 0, 2) : null, GF = gapSab ? new Float64Array(gapSab, 8, 2 * GAPS) : null;
const dec = new TextDecoder(), enc = new TextEncoder();

/** PURE: the main thread's kernel state from its wchan + syscall files' text. */
function kernelWords(wchan, syscall, arch = process.arch) {
  const w = String(wchan || '').trim() || '?';
  const s = String(syscall || '').trim();
  if (s === 'running') return 'on the CPU (JavaScript or native work)';
  const nr = s.split(/\s+/)[0];
  const name = arch === 'x64' && SYSCALLS[nr] ? SYSCALLS[nr] : nr ? `syscall ${nr}` : '?';
  return `${w === '0' ? 'not sleeping' : w} in ${name}`;
}
// every procfs / cgroupfs read of this thread goes through ONE reader (never a mount: procfs and cgroupfs answer from the kernel)
const readProc = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const task = (f) => `${procRoot}/self/task/${pid}/${f}`;
function kernel() { return kernelWords(readProc(task('wchan')), readProc(task('syscall'))); }
const say = (line) => { try { fs.writeSync(2, line + '\n'); } catch { } };

// ROUND 4 (MUST 2): THE WATCHDOG'S OWN FILE READS NEVER DELAY A CHECK. A repo frame is a REAL file of the repo inside it
// (a forged location, a symlink leading out, is not) and its NAME is kept only when the file's own line spells it
// (src/loop-hold.js frameOf) — both read HERE, never on the main thread, and never synchronously: an answer is parsed for
// what this thread already knows (NO_READ); once a hold has ENDED (a profile at its end) the files its frames need are
// read with fs.promises, ONE read in flight at a time (a hung network read holds one threadpool thread, never more, and
// no other read starts behind it), within NAME_BUDGET_MS — past it, or for SLOW_HOLD_MS after one read took SLOW_READ_MS
// or more (a network checkout), a frame is said by its location alone and the line says why. The check loop never waits.
const realFiles = new Map();   // rel → a real file of the repo (true / false)
const SOURCE_MAX = 4 * 1024 * 1024, SOURCE_FILES = 64;
const sources = new Map();     // rel → its lines (null: unreadable or too big — no name from it)
const NAME_BUDGET_MS = 200, SLOW_READ_MS = 100, SLOW_HOLD_MS = 10 * 60000;
let rootReal, slowUntil = 0, naming = null;
const remember = (m, k, v, max) => { if (m.size >= max) m.delete(m.keys().next().value); m.set(k, v); };
const cachedLine = (rel, n) => { const lines = sources.get(rel); return lines && n >= 1 && n <= lines.length ? lines[n - 1] : null; };
// a node: frame keeps its name only when its id is one of Node's OWN loaded modules — the main thread's list at the
// witness's start and this thread's own (a vm script named «node:…» is said by its location alone)
const INTERNALS = new Set([...(workerData && Array.isArray(workerData.internals) ? workerData.internals : []), ...((process.moduleLoadList || []).filter((x) => x.startsWith('NativeModule ')).map((x) => x.slice(13)))]);
const isInternal = (id) => INTERNALS.has(id);
/** what this thread knows WITHOUT reading: a file checked before, a source line read before; anything else UNREAD */
const NO_READ = { isInternal, isRepoFile: (rel) => (!rootDir ? true : realFiles.has(rel) ? realFiles.get(rel) : LH.UNREAD), lineOf: (rel, n) => (!rootDir ? null : sources.has(rel) ? cachedLine(rel, n) : LH.UNREAD) };
/** one repo file, read without blocking this thread: is it a real file inside the repo, and its lines */
async function readSource(rel) {
  const p = path.join(rootDir, rel);
  if (rootReal === undefined) { try { rootReal = await fs.promises.realpath(rootDir); } catch { rootReal = null; } }
  let ok = false, st = null;
  try { st = await fs.promises.stat(p); ok = st.isFile() && !!rootReal && (await fs.promises.realpath(p)).startsWith(rootReal + path.sep); } catch { ok = false; }
  let lines = null;
  if (ok && st.size <= SOURCE_MAX) { try { lines = (await fs.promises.readFile(p, 'utf8')).split('\n'); } catch { lines = null; } }
  remember(realFiles, rel, ok, 4096); remember(sources, rel, lines, SOURCE_FILES);
}
/** the files these answers' frames need, read off the check's path → `done(why, unread)`: why null (all read) | 'budget' |
 *  'slow'; `unread` = the files left by location alone */
function namesFor(texts, done) {
  const need = new Set();
  const probe = (rel) => { if (rootDir && !(realFiles.has(rel) && sources.has(rel))) need.add(rel); return NO_READ.isRepoFile(rel); };
  for (const t of texts) LH.sampleOf(t, rootDir, probe, NO_READ.lineOf, isInternal);
  if (!need.size || !rootDir) return done(null, new Set());
  if (mono() < slowUntil || naming) return done('slow', need);
  const left = [...need];
  let over = false;
  const end = (why) => { if (over) return; over = true; clearTimeout(timer); done(why, new Set(left)); };
  const timer = setTimeout(() => end('budget'), NAME_BUDGET_MS); timer.unref?.();
  (async () => {
    while (left.length && !over) {
      naming = left[0]; const a = mono();
      try { await readSource(left[0]); } catch { }
      naming = null;
      left.shift();
      if (mono() - a >= SLOW_READ_MS) { slowUntil = mono() + SLOW_HOLD_MS; return end('slow'); }
    }
    end(null);
  })();
}

// ── the scheduler's facts ────────────────────────────────────────────────────────────────────────────────────────
let cpuStatPath;   // undefined = not looked for yet; null = this box has none (nothing is said about it)
function cpuStatText() {
  if (cpuStatPath === undefined) {
    cpuStatPath = null;
    for (const p of LH.cpuStatPaths(readProc(`${procRoot}/self/cgroup`))) { const t = readProc(p); if (t && LH.parseCpuStat(t)) { cpuStatPath = p; break; } }
  }
  return cpuStatPath ? readProc(cpuStatPath) : null;
}
/** the main thread's own counters (two small procfs reads) — at every check the loop was fresh: the hold's baseline. A
 *  reading is TIMED WHEN IT WAS READ (after its reads — a watchdog held inside a read never pairs an old time with new numbers) */
const baseReading = () => { const stat = readProc(task('stat')), schedstat = readProc(task('schedstat')); return LH.readingOf({ at: mono(), stat, schedstat }); };
/** + its group, the box's pressure and the RSS — at the first stale check, at each sample, at the end */
const fullReading = () => { const stat = readProc(task('stat')), schedstat = readProc(task('schedstat')), cpuStat = cpuStatText(), cpuPressure = readProc(`${procRoot}/pressure/cpu`),
  memPressure = readProc(`${procRoot}/pressure/memory`), status = readProc(`${procRoot}/self/status`); return LH.readingOf({ at: mono(), stat, schedstat, cpuStat, cpuPressure, memPressure, status }); };
const withGlobals = (base, full) => (base ? { ...base, cpu: full.cpu, cpuP: full.cpuP, memP: full.memP, rss: full.rss } : full);

// ── the sampler: ONE ask in flight, its session closed in the same synchronous stretch ───────────────────────────────
let inspector = null;
try { inspector = require('inspector'); } catch { inspector = null; }
let inflight = null;   // THE one ask in flight — a hold's or the profile's, never two (no pile of asks behind a native stretch,
                       // never two samples queued on the main thread: its note slot is written by one sample at a time)
/** THE SESSION, by the main thread's kernel state at the ask:
 *   · ASLEEP IN A CALL (a sync child, a sync fs call — its own epoll included): connect, post, close in ONE synchronous
 *     stretch — the main thread still runs the posted ask at the first JavaScript after the call (its answer comes through
 *     the note slot), and no session exists across an exit (measured, Node 22 and 24: the debugger line is gone);
 *   · ON THE CPU: the session stays until the answer, at most SESSION_MS (a JavaScript answer comes in single-digit ms) —
 *     only so that an ask the held code cannot even ENTER (its stack within a frame of the limit) is told by the session's
 *     own RangeError: «the stack was nearly full», never «no JavaScript frame». The residual, said in the kb: an exit within
 *     SESSION_MS of an ask while the main thread computes in NATIVE code (a long JSON.parse) prints Node's debugger line. */
function post(q, keep) {
  if (!inspector || !NI) return false;
  let sess = null;
  try {
    sess = new inspector.Session(); sess.connectToMainThread();
    q.postedAt = mono();   // THE POST (after the connect): an answer's latency is measured from here
    if (!keep) { sess.post('Runtime.evaluate', { expression: LH.SAMPLE_EXPR, silent: true }); sess.disconnect(); return true; }
    q.sess = sess;
    sess.post('Runtime.evaluate', { expression: LH.SAMPLE_EXPR, silent: true }, (err, r) => {
      if (!q.sess) return;   // closed under it: its answer comes through the note slot
      const ex = r && r.exceptionDetails, e = ex && ex.exception;
      q.responded = true; q.respondedAt = mono(); q.threw = !!(err || ex);
      // round 4 (5): THE ANSWER OF A SAMPLE THAT THREW — «deep recursion» only for a full stack, else its own error's class
      q.thrown = LH.thrownOf({ err, className: e && e.className, description: e && e.description, text: ex && ex.text });
      q.deep = !!q.thrown.deep;
      closeSession(q); settleAsk(mono());
    });
    const t = setTimeout(() => closeSession(q), LH.SESSION_MS); t.unref?.();
    return true;
  } catch { try { if (sess) sess.disconnect(); } catch { } q.sess = null; return false; }
}
function closeSession(q) { const s0 = q.sess; q.sess = null; if (s0) { try { s0.disconnect(); } catch { } } }
/** the note slot, read whole or not at all (the seqlock) */
function readNote() {
  if (!NI) return null;
  const s1 = Atomics.load(NI, 0);
  if (s1 % 2) return null;
  const count = NI[1], len = Math.min(NB.length, Math.max(0, NI[2])), beat = NI[3], at = NF[0];
  const text = dec.decode(NB.slice(0, len));
  if (Atomics.load(NI, 0) !== s1) return null;
  return { count, beat, at, text };
}
/** one ask for `asker` ({kind: 'hold', h} | {kind: 'profile', pr, pq}) — null when one is in flight or it cannot post */
function ask(asker) {
  if (inflight || !I) return null;
  // THE THREAD'S KERNEL STATE AT THE POST (round 4): read just before it — running / asleep (its wait channel) / stopped
  const state = LH.stateOf(readProc(task('stat')));
  const q = { asker, at: mono(), postedAt: null, state, kernel: state === 'asleep' ? kernel() : null, notes0: NI[1], entered0: NI[4], beat0: Atomics.load(I, 3), late: false, enteredSeenAt: 0, result: null, answer: null, text: null, answeredAt: null, beat: null, sess: null, responded: false, threw: false, deep: false };
  if (!post(q, state === 'running')) return null;
  inflight = q;
  try {   // read the answer the moment the main thread writes it (its note wakes this wait), else at noAnswerMs
    const w = Atomics.waitAsync(NI, 1, q.notes0, noAnswerMs + 1);
    if (w.async) w.value.then(() => settleAsk(mono()), () => {}); else settleAsk(mono());
  } catch { const t = setTimeout(() => settleAsk(mono()), noAnswerMs + 1); t.unref?.(); }
  return q;
}
/** a sample that ran and could not finish for a reason that is NOT a full stack — said by the session's own word */
const couldNot = (word) => ({ kind: 'js', words: `${LH.WORDS.failed} (${word})`, key: LH.KEYS.failed, keyWords: LH.KEYS.failed, failed: true });
function settleAsk(now) {
  const q = inflight;
  if (!q) return;
  const n = readNote();
  if (n && n.count !== q.notes0) { inflight = null; closeSession(q); q.text = n.text; return answered(q, textAnswer(n.text, NO_READ), n.beat, n.at); }
  if (q.responded) {   // the session answered and no note: it threw — at its entry or inside (the stack nearly full) ⇒ JavaScript
    inflight = null;
    const beat = NI[4] !== q.entered0 ? NI[5] : Atomics.load(I, 3);
    return answered(q, q.threw ? q.thrown : { kind: 'js', words: LH.WORDS.unreadable, key: LH.KEYS.unreadable, keyWords: LH.KEYS.unreadable }, beat, q.respondedAt != null ? q.respondedAt : null);
  }
  if (NI[4] !== q.entered0) {   // it ran: never «late» — its note may still be on its way; none after 20 ms ⇒ it threw (the
    if (!q.enteredSeenAt) { q.enteredSeenAt = now; const t = setTimeout(() => settleAsk(mono()), 21); t.unref?.(); return; }   // stack nearly full): JavaScript, at the beat it entered
    if (now - q.enteredSeenAt >= 20) { inflight = null; return answered(q, couldNot('no word from it'), NI[5], null); }   // it ran and left nothing: no time, no cause claimed
    return;
  }
  if (!q.late && now - q.at > noAnswerMs) { q.late = true; unanswered(q); }
  if (q.late && !q.enteredSeenAt && Atomics.load(I, 3) - q.beat0 >= 3) { inflight = null; }   // the loop turned 3 times and it never ran: dropped
}
/** an answer → what it says (the check's condition 3): frames; «the stack was nearly full (deep recursion)»; «between
 *  JavaScript frames» for a stack with no JavaScript frame; «frames unreadable (inside the program's own stack
 *  formatting)»; the stand-downs ('D' a debugger port, 'A' an accessor). */
function textAnswer(text, readers = NO_READ) {
  const sm = LH.sampleOf(text, rootDir, readers.isRepoFile, readers.lineOf, readers.isInternal);
  if (sm.form === 'accessor') return { kind: 'standDown', why: 'accessor' };
  if (sm.form === 'debugger') return { kind: 'standDown', why: 'debugger' };
  if (sm.form === 'formatting') return { kind: 'js', words: LH.WORDS.formatting, key: LH.KEYS.formatting, keyWords: LH.KEYS.formatting };
  if (sm.form === 'none') return { kind: 'js', words: LH.WORDS.unreadable, key: LH.KEYS.unreadable, keyWords: LH.KEYS.unreadable };
  if (!sm.frames.length) return { kind: 'js', words: LH.WORDS.between, key: LH.KEYS.between, keyWords: LH.KEYS.between, empty: true };
  return { kind: 'js', words: LH.chainWords(sm.frames), key: LH.keyFrame(sm.frames), keyWords: LH.keyWords(sm.frames), form: sm.form };
}
function answered(q, a, beat, at) {
  if (q.asker.kind === 'profile') {
    const latency = at != null && q.postedAt != null ? at - q.postedAt : null;
    return profileAnswered(q, a, latency != null ? latency <= noAnswerMs : !q.late);   // a deep sample has no time: at the point unless it was already late
  }
  const h = q.asker.h;
  if (a.kind === 'standDown') { q.result = 'standDown'; h.standDown = a.why; if (!h.asks.some((x) => x.answer)) h.unsampled = a.why; return; }
  // THE ASK'S FACTS, judged once the hold has ended (src/loop-hold.js askOf — the PURE law): its answer, the beat it ran
  // in, the sample's own first instruction
  q.result = 'answered'; q.answer = a; q.beat = beat; q.answeredAt = at;
  h.last = withGlobals(null, fullReading(mono()));
}
/** unanswered at noAnswerMs: its facts stay as they are (no answer yet) — the PURE judgement says what the instant was
 *  by the thread's state at the post (asleep ⇒ the kernel, on the CPU ⇒ native, unread ⇒ not JavaScript) */
function unanswered(q) {
  if (q.asker.kind === 'profile') return profileUnanswered(q);
  q.result = 'late';
  q.asker.h.last = withGlobals(null, fullReading(mono()));
}
/** the PURE input of one ask */
const askFacts = (q) => ({ postedAt: q.postedAt != null ? q.postedAt : q.at, answeredAt: q.answeredAt, state: q.state, kernel: q.kernel, answer: q.answer, beat: q.beat, withdrawn: q.result === 'standDown' });

let saidSeq = -1, saidAt = 0, outSaidAt = 0, lastCheckAt = mono(), base = null, hold = null, lastBeat = null, gapRead = 0, gapsLost = 0;
// the last baselines and this thread's own lateness, kept a few seconds (a hold seen only afterwards is measured from the
// baseline taken before it began, with the lateness inside it)
const bases = [], lates = [];
const keepBase = (b) => { bases.push(b); if (bases.length > 32) bases.shift(); };
const sampledAt = [];   // the starts of the sampled holds in the rolling hour (the cap)

function startHold(now, first) {   // first = no beat came yet
  const flags = Atomics.load(I, 6), boot = first && bootAt != null;
  const h = { boot, first, beat0: Atomics.load(I, 3), fromM: first ? firstFrom : (T[1] || now), seenAt: now, samples: [], asks: [], k: 0, starvedMs: 0, lateMs: 0, unsampled: null, standDown: null, after: null, ended: false, finished: false, waitAfterUntil: 0 };
  let b0 = null; for (const x of bases) if (x.at <= h.fromM + beatMs) b0 = x;   // the last baseline before the hold began
  h.a = withGlobals(b0 || base, fullReading(now));
  h.last = h.a;
  for (const x of lates) if (x.at > h.fromM && x.at < now) { h.lateMs += x.late; if (x.late >= LH.STARVED_MS) h.starvedMs = Math.max(h.starvedMs, x.late); }
  if (!(flags & FLAG_KNOWN)) h.unsampled = 'unknown';   // the setting not read yet: nothing is asked
  else if (!(flags & FLAG_SAMPLING)) h.unsampled = 'off';
  else if (flags & FLAG_DEBUGGER) h.unsampled = 'debugger';
  else if (!inspector) h.unsampled = 'inspector';
  else if (!boot && !LH.capAllows(sampledAt, now, capPerHour)) h.unsampled = 'cap';
  else if (!boot) sampledAt.push(now);
  return h;
}
const mine = (h) => inflight && inflight.asker.kind === 'hold' && inflight.asker.h === h;
const afterWait = new Set();
/** the hold ends at the beat that ended its gap — the MAIN thread's own entry (`g`: {end, gap}), so the range said always
 *  contains the truth (never a later beat's) and it is dated at that beat */
function endHold(h, g, now) {
  if (mine(h)) settleAsk(now);   // an answer already in the note slot is the hold's (or after it) — read before judging
  h.ended = true;
  const end = g ? g.end : (T[1] || now);
  if (h.first) { h.toM = end; h.ms = Math.max(0, end - h.fromM); h.msHi = h.ms; }   // the boot: from the process's start to the first beat
  else if (g) { h.fromM = g.end - g.gap; h.toM = g.end; h.msHi = g.gap; h.ms = Math.max(0, g.gap - beatMs); }   // at least the gap less one beat, at most the gap
  else { h.toM = end; const gap = Math.max(0, end - h.fromM); h.msHi = gap; h.ms = Math.max(0, gap - beatMs); }
  h.b = fullReading(now);
  h.d = LH.coveredDelta(h.a, h.b, h.fromM, h.toM);   // the scheduler judges a hold only from a window covering at least half of it
  if (mine(h)) { h.waitAfterUntil = now + AFTER_WAIT_MS; afterWait.add(h); }   // still unanswered: wait for «the first JavaScript after it»
  else finish(h);
}
function lookAfter(now) {
  for (const h of afterWait) if (!mine(h) || now >= h.waitAfterUntil) { afterWait.delete(h); finish(h); }
}
/** a hold this thread could not see while it lasted (it did not run either): the MAIN thread's own gap entry says it, dated
 *  at the beat that ended it */
const baseOf = (g) => { const from = g.end - g.gap; let a = null; for (const x of bases) if (x.at <= from + beatMs) a = x; return a; };
function unseenHold(g, now, shared = 1) {
  const from = g.end - g.gap, b = fullReading(now);
  const a = baseOf(g);
  let lateMs = 0, starvedMs = 0; for (const x of lates) if (x.at > from && x.at <= now) { lateMs += x.late; starvedMs = Math.max(starvedMs, x.late); }
  // round 5: smaller 1 — the watchdog on time says so (it asks only after a second); smaller 2 — a window two holds share is said
  const d = LH.coveredDelta(a, b, from, g.end); if (d && shared >= 2) d.shared = shared;
  finish({ boot: false, first: false, fromM: from, toM: g.end, ms: Math.max(0, g.gap - beatMs), msHi: g.gap, samples: [], asks: [], unsampled: LH.unseenWhy({ starvedMs }), after: null, d, lateMs, starvedMs: starvedMs >= LH.STARVED_MS ? starvedMs : 0, ended: true, finished: false });
}
function finish(h) {
  if (h.finished) return;
  h.finished = true;
  if (!LH.isHoldOf({ lo: h.ms, hi: h.msHi, holdMs })) return;   // THE ONE BAR (round 4), watched or not
  // the hold has ENDED: its answers' names are read now, off the check's path (MUST 2) — then the PURE law judges each ask
  const named = (h.asks || []).filter((q) => q.text != null && q.answer && q.answer.kind === 'js' && !q.answer.deep && !q.answer.failed);
  namesFor(named.map((q) => q.text), (why, unread) => tell(h, named, why, unread));
}
function tell(h, named, why, unread) {
  for (const q of named) q.answer = textAnswer(q.text, NO_READ);
  // round 5 (law A): an ask the sampler withdrew is not a sample — with no real answer the hold is «not sampled (why)»
  const J = LH.judgeAsks((h.asks || []).map(askFacts), { beat0: h.beat0, holdEnd: h.toM, standDown: h.standDown, windowed: !!h.d });
  const samples = J.samples.map((x) => ({ cls: x.cls, kind: x.cls === 'js' ? 'js' : 'none', words: x.words, key: x.key, keyWords: x.keyWords, ...(Number.isFinite(x.at) ? { at: x.at } : {}) }));
  const facts = { boot: h.boot, from: toWall(h.fromM), to: toWall(h.toM), fromM: h.fromM, toM: h.toM, ms: h.ms, msHi: h.msHi, samples, outside: J.outside,
    after: J.after ? J.after.words : null, afterKey: J.after ? J.after.key : null, afterKeyWords: J.after ? J.after.keyWords : null,
    unsampled: samples.length ? h.unsampled : (h.unsampled || h.standDown), standDown: samples.length ? h.standDown : null, d: h.d, starvedMs: h.starvedMs, lateMs: h.lateMs, ...(unread.size ? { namesUnread: { n: unread.size, why: why || 'budget' } } : {}) };
  try { parentPort && parentPort.postMessage({ ev: 'hold', hold: facts }); } catch { }
}
function stepHold(h, now) {
  if (h.unsampled || h.standDown || inflight) return;   // nothing more is asked while ANY ask is in flight (an abandoned one: until it ran)
  // round 4: the switch and a debugger are RE-READ at every step — sampling turned off mid-hold asks nothing more
  const why = LH.stepRefusalOf(Atomics.load(I, 6));   // FLAG_SAMPLING 1, FLAG_DEBUGGER 2, FLAG_KNOWN 8
  if (why) { if (!h.asks.length) h.unsampled = why; else h.standDown = why; return; }
  if (LH.sampleDue(h.k, now - h.fromM, holdMs, samplesPerHold)) { h.k++; const q = ask({ kind: 'hold', h }); if (q) h.asks.push(q); else if (!inspector) h.unsampled = 'inspector'; else if (!h.asks.length) h.unsampled = 'failed'; else h.standDown = 'failed'; }
}
/** the main thread's gap entries since the last read, oldest first (a ring of GAPS: more than that unread ⇒ the oldest are
 *  counted lost, never invented) */
function drainGaps() {
  if (!GI) return [];
  const w = Atomics.load(GI, 0), out = [];
  if (w - gapRead > GAPS) { gapsLost += w - gapRead - GAPS; gapRead = w - GAPS; }
  for (; gapRead < w; gapRead++) { const k = gapRead % GAPS; out.push({ end: GF[2 * k], gap: GF[2 * k + 1] }); }
  return out;
}

// ── law L: THE PROFILE A PERSON PRESSES — one sample every everyMs for ms, then it stops by itself ──────────────────
let prof = null, profSeq = 0;
/** the result into the shared slot (the main thread reads it when someone asks for the report) + its line, said here. The
 *  result is BOUNDED BY CONSTRUCTION (src/loop-hold.js foldProfileBy: the largest PROFILE_KEEP locations + one «other»);
 *  one that still did not fit is written as ITSELF — its counts, «too large» — never dropped */
function profileOut(result) {
  say(LH.profileLine(LH.profileOf(result)));
  if (!PI) return;
  let bytes = enc.encode(JSON.stringify(result));
  if (bytes.length > PB.length) { const { by, names, ...counts } = result; bytes = enc.encode(JSON.stringify({ ...counts, by: {}, names: {}, other: result.js || 0, tooLarge: true })); }   // eslint-disable-line no-unused-vars
  if (bytes.length > PB.length) return;
  Atomics.store(PI, 0, PI[0] + 1); PB.set(bytes); PI[1] = ++profSeq; PI[2] = bytes.length; Atomics.store(PI, 0, PI[0] + 1);   // this thread is the ONE writer (a seqlock)
}
const refusalOf = (flags) => (!(flags & FLAG_KNOWN) ? 'unknown' : !(flags & FLAG_SAMPLING) ? 'off' : flags & FLAG_DEBUGGER ? 'debugger' : flags & FLAG_HEAP_HIGH ? 'heap' : !inspector ? 'inspector' : null);
function startProfile({ ms = LH.PROFILE_MS, everyMs = LH.PROFILE_EVERY_MS } = {}, now = mono()) {
  if (prof) return;
  const refused = refusalOf(Atomics.load(I, 6));
  if (refused) { const w = toWall(now); profileOut({ refused, startedAt: w, endedAt: w }); return; }
  prof = { startedM: now, untilM: now + Math.max(everyMs, ms), everyMs, nextAt: now, samples: 0, idle: 0, between: 0, noJs: 0, js: 0, unsampled: 0, unsampledWhy: null, by: {}, names: {}, texts: new Map() };
}
function endProfile(pr, now, stopped) {
  prof = null;
  // the kept locations' names, read off the check's path (MUST 2), then the result
  const keys = Object.keys(pr.by).sort((x, y) => pr.by[y] - pr.by[x]).slice(0, LH.PROFILE_KEEP).filter((k) => pr.texts.has(k));
  namesFor(keys.map((k) => pr.texts.get(k)), () => {
    for (const k of keys) { const a = textAnswer(pr.texts.get(k), NO_READ); if (a.key === k && a.keyWords) pr.names[k] = a.keyWords; }
    outProfile(pr, now, stopped);
  });
}
function outProfile(pr, now, stopped) {
  const f = LH.foldProfileBy(pr.by, pr.names);
  profileOut({ startedAt: toWall(pr.startedM), endedAt: toWall(now), samples: pr.samples, idle: pr.idle, between: pr.between, noJs: pr.noJs, js: pr.js, unsampled: pr.unsampled,
    ...(pr.unsampledWhy ? { unsampledWhy: pr.unsampledWhy } : {}), by: f.by, names: f.names, other: f.other, locations: f.locations, ...(stopped ? { stopped } : {}) });
}
function profileAnswered(q, a, atPoint) {
  const { pr, pq } = q.asker;
  if (pq.counted || pr !== prof) return;
  pq.counted = true; pr.samples++;
  if (!atPoint) { pr.noJs++; return; }
  if (a.kind === 'standDown') { pr.unsampled++; pr.unsampledWhy = a.why; return; }   // a stand-down is «not sampled», never «no JavaScript frame»
  if (a.empty) { if (mono() - T[1] <= 2 * beatMs + noAnswerMs) pr.idle++; else pr.between++; return; }
  pr.js++; pr.by[a.key] = (pr.by[a.key] || 0) + 1; if (!pr.names[a.key] || /^[\w./@+-]+:\d+$/.test(pr.names[a.key])) pr.names[a.key] = a.keyWords;
  if (q.text != null && !pr.texts.has(a.key)) pr.texts.set(a.key, q.text);   // its names are read at the profile's end (MUST 2)
}
function profileUnanswered(q) { const { pr, pq } = q.asker; if (!pq.counted && pr === prof) { pq.counted = true; pr.samples++; pr.noJs++; } }
function stepProfile(now) {
  const pr = prof;
  // THE RATE IS A SAFETY BOUND (the check): the heap past the bound, the setting turned off, a debugger port ⇒ it stops
  const stop = refusalOf(Atomics.load(I, 6));
  if (stop) return endProfile(pr, now, stop);
  if (inflight && inflight.asker.kind === 'profile' && inflight.late) {   // its ask abandoned: each interval it lasts counts «no JavaScript frame»
    const pq = inflight.asker.pq;
    while (now - pq.countedTo >= pr.everyMs && now < pr.untilM) { pq.countedTo += pr.everyMs; pr.samples++; pr.noJs++; }
  }
  if (now >= pr.untilM) return endProfile(pr, now, null);
  if (now < pr.nextAt || (inflight && inflight.asker.kind === 'profile')) return;
  pr.nextAt = Math.max(pr.nextAt + pr.everyMs, now);
  // THE KERNEL FIRST: asleep in the loop's own epoll wait with the beat fresh = idle; asleep in any other call = no
  // JavaScript frame (an epoll wait while the beat is STALE is a sync child's own loop) — neither asked
  const wchan = String(readProc(task('wchan')) || '').trim(), sys = String(readProc(task('syscall')) || '').trim();
  const turning = now - T[1] <= 2 * beatMs + noAnswerMs;
  if (sys !== 'running' && wchan === 'ep_poll' && turning) { pr.samples++; pr.idle++; return; }
  if (sys !== 'running' && wchan && wchan !== '0') { pr.samples++; pr.noJs++; return; }
  if (inflight) { if (inflight.late) { pr.samples++; pr.noJs++; } return; }   // a HOLD's ask is out (one in flight): unanswered past noAnswerMs ⇒ no JavaScript frame; else this interval is not asked
  ask({ kind: 'profile', pr, pq: { countedTo: now, counted: false } });
}

function check(now = mono()) {
  if (!I) return null;
  const late = Math.max(0, now - lastCheckAt - beatMs);   // this thread's OWN lateness (a starved or stopped watchdog) — monotonic
  lastCheckAt = now;
  if (late > 0) { lates.push({ at: now, late }); if (lates.length > 64) lates.shift(); }
  if (hold) { hold.lateMs += late; if (late >= LH.STARVED_MS) hold.starvedMs = Math.max(hold.starvedMs, late); }
  if (inflight) settleAsk(now);
  if (afterWait.size) lookAfter(now);
  const beat = Atomics.load(I, 3);
  if (beat !== lastBeat) {   // the loop turned
    lastBeat = beat;
    const lost0 = gapsLost, gaps = drainGaps();
    if (gapsLost > lost0) {   // SAID, never silent (round 4): more holds came than the ring keeps while this thread did not read it
      say(`[loop-hold] ${gapsLost - lost0} hold${gapsLost - lost0 === 1 ? ' was' : 's were'} not told — the main thread's ring keeps its last ${GAPS} and this thread did not run to read them`);
      try { parentPort && parentPort.postMessage({ ev: 'holdsLost', n: gapsLost - lost0 }); } catch { }
    }
    const unseenBy = new Map();   // round 5 (smaller 2): the unseen holds of this read that share ONE scheduler window (the same baseline)
    for (const g of gaps) if (!(hold && !hold.first && Math.abs(g.end - g.gap - hold.fromM) < 1) && LH.isUnseenHold({ mainGap: g.gap, late, beatMs, holdMs })) { const a = baseOf(g); const k = a ? a.at : null; unseenBy.set(k, (unseenBy.get(k) || 0) + 1); }
    for (const g of gaps) {   // the main thread's OWN gaps: the seen hold's own, else a hold nobody watched
      if (hold && !hold.first && Math.abs(g.end - g.gap - hold.fromM) < 1) { const h = hold; hold = null; endHold(h, g, now); }
      else if (LH.isUnseenHold({ mainGap: g.gap, late, beatMs, holdMs })) { const a = baseOf(g); unseenHold(g, now, a ? unseenBy.get(a.at) || 1 : 1); }
    }
    if (hold && beat !== 0) { const h = hold; hold = null; endHold(h, null, now); }   // the boot's (no gap before the first beat), or a lost entry
    base = baseReading(now); keepBase(base);
    if (prof) stepProfile(now);
    return null;
  }
  const lastBeatAt = T[1];
  const boot = beat === 0 || !lastBeatAt;
  const stale = now - (boot ? firstFrom : lastBeatAt);
  if (!hold && stale >= holdMs) { hold = startHold(now, boot); hold.lateMs += late; if (late >= LH.STARVED_MS) hold.starvedMs = Math.max(hold.starvedMs, late); }
  if (hold) stepHold(hold, now);
  if (prof) stepProfile(now);
  const flying = Atomics.load(I, 4) === 1;
  if (flying) {
    const s1 = Atomics.load(I, 0);
    const fn = fns[I[1]] || '?', len = Math.min(SLOT_PATH, Math.max(0, I[2])), startedAt0 = T[0], store = I[5] > 0 ? stores[I[5] - 1] || '' : '';
    const p = len ? dec.decode(P.slice(0, len)) : '';
    const s2 = Atomics.load(I, 0);
    if (s1 !== s2 || s1 % 2 || Atomics.load(I, 4) !== 1) return null; // the slot moved under the read: the next tick
    const held = now - startedAt0;
    if (held < liveMs || (s1 === saidSeq && now - saidAt < REPEAT_MS)) return null;
    saidSeq = s1; saidAt = now;
    const line = `[sync-fs] the main thread has waited ${Math.round(held / 1000)} s in ${fn}(${p})${store ? ` (${store})` : ''} — the kernel: ${kernel()}`;
    say(line); return line;
  }
  if (stale >= liveMs && now - outSaidAt >= REPEAT_MS) {
    outSaidAt = now;
    const done = hold ? LH.judgeAsks(hold.asks.filter((q) => q !== inflight).map(askFacts), { beat0: hold.beat0, standDown: hold.standDown }).samples : [];
    const more = hold ? LH.liveWords({ samples: done, pendingMs: mine(hold) ? now - inflight.at : 0, pendingState: mine(hold) ? inflight.state : null, pendingKernel: mine(hold) ? inflight.kernel : null, unsampled: hold.unsampled, d: LH.schedDelta(hold.a, hold.last) }) : '';
    const line = `[sync-fs] the main loop has been held ${Math.round(stale / 1000)} s outside any synchronous fs call — the kernel: ${kernel()}${more ? ' — ' + more : ''}`;
    say(line); return line;
  }
  return null;
}

if (parentPort && sab) {
  lastBeat = Atomics.load(I, 3);
  if (GI) gapRead = Atomics.load(GI, 0);
  base = baseReading(); keepBase(base);   // a baseline from the start (the boot's hold is measured from it, not from its first stale check)
  setInterval(check, beatMs);
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
    if (msg && msg.ev === 'profile') startProfile(msg);   // law L: the owner pressed «Profile the server for 10 minutes»
  });
}

module.exports = { kernelWords, check, GAPS, SYSCALLS, SLOT_INTS, SLOT_FLOATS, SLOT_PATH, FLAG_SAMPLING, FLAG_DEBUGGER, FLAG_HEAP_HIGH, FLAG_KNOWN };
