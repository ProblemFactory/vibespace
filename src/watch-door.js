'use strict';
/**
 * THE ONE DOOR FOR A FILE WATCH IN THE HUB'S CODE (required by hub-only files; it imports nothing of the server and is in no module of
 * the device agent's signed bundle — src/desktop-serve.js and src/opencode-events.js ride that bundle and keep their own watches, each
 * in a try with its error listener, exempt by name; 主开发 2026-11-19 01:17Z — the production hub ended at 01:14Z: the
 * machine's inotify watches (65 536 a user) were used up by other programs, the hub armed one more — a helper conversation's
 * transcript, src/server/stdout/claude-stream-json.js, from a retry TIMER — fs.watch threw ENOSPC, nothing caught it, and
 * the process exited). THE LAW: A WATCH THAT CANNOT BE ARMED NEVER ENDS THE HUB AND NEVER ENDS ITS FEATURE.
 *   · watch(target, options, listener) answers a watcher-shaped object (close / ref / unref / on — an EventEmitter) whatever
 *     happens: a watch the system REFUSES (ENOSPC, EMFILE, ENFILE, ENOENT in a race, EACCES, EPERM — any throw) and a watch
 *     whose own 'error' event fires after it was armed are both replaced, in place, by A BOUNDED POLL: a stat of the target
 *     (a folder: its entries, at most POLL_ENTRIES of them), every activeMs while it changes, backing off to QUIET_MS while it
 *     is quiet; unref'd; ended by the same close(). The listener is called as fs.watch calls it ('change', the entry's name),
 *     and a listener that throws is caught and said once — no callback of the door can end the process.
 *   · THE POLLERS ARE BOUNDED (主开发 01:30Z, 2): hundreds of refused watches never become hundreds of pollers hammering the
 *     hub's small thread pool — at most LIMITS.running polls run at once (the rest wait their turn), at most LIMITS.inflight
 *     file calls are in flight across ALL of them (each stat / readdir waits for a slot — 2: never more than HALF the runtime's
 *     default pool of 4, so a wedged mount's stats can never hold every thread; see LIMITS), and the active cadence slows as the
 *     pollers grow (cadenceFor: ACTIVE_MS × ⌈pollers / POLLERS_PER_STEP⌉, never under ACTIVE_MS, never over CADENCE_MAX_MS up to
 *     320 pollers — the timer's gap; above, the TOTAL tick rate is held at TICKS_PER_S_MAX; past 32 polls a tick also waits its
 *     turn for the running and in-flight bounds).
 *   · THE LIMIT IS SAID, AND NEVER FLAPS (主开发 01:30Z, 1): the system's limit of watches reached (ENOSPC) is said ONCE in the
 *     journal and ONCE to the person — one For-you notice (en, zh, ja) with the limit's name and the one command that raises
 *     it (on a container, that it is raised on the host — never a command; no claim about who holds the watches) — and LIFTED only when the limit has stayed clear: LIMITS.liftArms watches armed IN A ROW and LIMITS.liftQuietMs since
 *     the last refusal (while limited, a probe tries one watch every LIMITS.probeMs, closed at once, so a hub that arms nothing
 *     else still learns it). At most ONE item is filed an hour (LIMITS.fileGapMs): a refusal inside that hour after a lift is
 *     said in the journal only, and filed once the hour has passed. The For-you store is handed in by configure() (the
 *     system-resource notices' module does it at boot — server.js gains no line); before that, the notice waits for it.
 *   · scripts/test-watch-door.mjs: the door's own legs (the flap and the bounds with their controls), THE CENSUS (no fs.watch
 *     of the hub's server code outside this file), and the REAL parser's road with a stand-in fs.watch that throws ENOSPC.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const ACTIVE_MS = 250;      // the poll's cadence while the target changes (with few pollers)
const QUIET_MS = 2000;      // …backed off to this while it is quiet (doubling from the active cadence)
const POLLERS_PER_STEP = 16;   // every this many pollers slow the active cadence by one more ACTIVE_MS
const POLL_ENTRIES = 32;    // a folder's poll reads at most this many entries a tick
// THE IN-FLIGHT CAP IS AT MOST HALF THE THREAD POOL (主开发 2026-11-19 09:53Z): every async file call runs on the runtime's thread
// pool — 4 threads by default (the hub raises its own to 32 in server.js's first lines, unless the environment sets one) — and a
// stat on a wedged mount never returns: were the door to hold the whole pool, EVERY async file call of the process would wait
// (the hub-freeze class). The cap is 2 — and never more than half of THIS process's pool (a pool of 2 set in the environment
// gives 1), read once at load (its fresh reader's N3)
const POOL = Number(process.env.UV_THREADPOOL_SIZE) > 0 ? Math.floor(Number(process.env.UV_THREADPOOL_SIZE)) : 4;
// THE DECLARED LIMITS, written ONCE: the live LIMITS and resetForTest() both copy them, so a suite reads the shipped values (its
// fresh reader's M1: a second copy in the reset let a declared 4 ship under a green suite)
const DEFAULT_LIMITS = Object.freeze({ running: 32, inflight: Math.min(2, Math.max(1, Math.floor(POOL / 2))), liftArms: 3, liftQuietMs: 10 * 60e3, probeMs: 5 * 60e3, fileGapMs: 60 * 60e3, adoptRetryMs: Object.freeze([0, 1000, 5000, 30000]) });
const LIMITS = { ...DEFAULT_LIMITS, adoptRetryMs: [...DEFAULT_LIMITS.adoptRetryMs] };   // read at call time (the suite's controls move them)
const NOTICE_KEY = 'watch-limit';
const LIMIT_NAME = 'fs.inotify.max_user_watches';
const LIMIT_FILE = '/proc/sys/fs/inotify/max_user_watches';
/** PURE (主开发 01:57Z, its reader's S2): the one command that RAISES the limit — double what the machine has now, never under
 *  524 288. A fixed 524 288 would LOWER a large machine's limit (kernels since 5.11 scale it with RAM, up to 1 048 576; this owner's
 *  machine stands at 1 048 576). */
const raiseCmd = (current) => `sudo sysctl -w ${LIMIT_NAME}=${Math.max(524288, 2 * (Number(current) > 0 ? Math.floor(Number(current)) : 0))}`;
const i18nKey = (s) => s;   // marks a dictionary key (src/lib/i18n-zh.js, i18n-ja.js)

let todosOf = () => null;
let log = (line) => { try { console.warn(line); } catch { } };
let now = () => Date.now();
let probeFs = fs;
let containerOverride = null;   // the suite's seam; else read once at the notice
const readLimit = () => { try { return Number(fs.readFileSync(LIMIT_FILE, 'utf8').trim()) || null; } catch { return null; } };   // procfs, read at a notice only
let limitNow = readLimit;
let gen = 0;   // a reset's generation: a tick of an older one never gives a slot back into the new one (its reader's N10)
const fresh = () => ({ limited: false, code: null, itemId: null, pollers: 0, refusals: 0, listenerSaid: false, saidOther: false, failSaid: false,
  lastRefusalAt: 0, armsInRow: 0, lastFiledAt: -Infinity, filesDue: false, gapSaid: false, filed: 0, lifted: 0, probe: null, running: 0, inflight: 0, maxInflight: 0, maxRunning: 0 });
const state = fresh();
const runWait = [], slotWait = [];

/** Is this machine a container (a pod): its limit is then its HOST's, raised there — never a command offered here. */
const inContainer = () => { if (containerOverride != null) return !!containerOverride; try { return fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv') || !!process.env.KUBERNETES_SERVICE_HOST; } catch { return false; } };
/** The words of the one notice (PURE but for `container`): only what is true (主开发 01:35Z, 4) — nobody measured who holds the
 *  watches, the poll checks every few seconds at most, and a container's limit is raised on its host. */
function noticeItem({ container = inContainer(), current = limitNow() } = {}) {
  const rows = [
    { key: i18nKey('Linux gives each user a fixed number of file watches ({limit}), and all of them are in use.'), params: { limit: LIMIT_NAME } },
    { key: i18nKey('VibeSpace keeps working: it checks the files it follows every few seconds at most, instead of being told at once.') },
    container
      ? { key: i18nKey('This machine runs in a container: the limit belongs to its host and is raised there ({limit}).'), params: { limit: LIMIT_NAME } }
      : { key: i18nKey('To raise the limit: {cmd} (to keep it after a restart, put the same setting in /etc/sysctl.d/).'), params: { cmd: raiseCmd(current) } },
    { key: i18nKey('This item resolves itself once watches can be set again for a while.') },
  ];
  const fill = (r) => r.key.replace(/\{(\w+)\}/g, (m, k) => (r.params && r.params[k] != null ? r.params[k] : m));
  const text = 'The system’s limit of file watches is reached — VibeSpace follows files more slowly until it is raised';
  return { text, detail: rows.map(fill).join('\n'), i18n: { text: { key: i18nKey('The system’s limit of file watches is reached — VibeSpace follows files more slowly until it is raised'), params: {} }, detail: rows } };
}
/** PURE: the active cadence for `n` pollers — slower as they grow, never past CADENCE_MAX_MS up to 320 pollers (the notice's
 *  «every few seconds at most», its reader's N4); ABOVE 320 it grows past 5 s so the total stays ≤ TICKS_PER_S_MAX — the notice's
 *  sentence then stops being exact; KEPT by the coordinator's ruling (2026-11-19 19:22Z: 320 refused watches at once is far past
 *  anything met). */
const CADENCE_MAX_MS = 5000;
// …and above 320 pollers the cadence grows again (主开发 09:53Z, 3): in a steady state the TOTAL tick rate stays at most
// TICKS_PER_S_MAX (n / cadence ≤ 64 a second; a new poll ticks once at once, an old one takes the new cadence at its next tick);
// at 320 pollers both rules give 5 s, below it the step rule is larger or equal. NOTE: two wedged targets now hold both
// in-flight slots, and every door poll of the process waits behind them — the trade the pool law chose
const TICKS_PER_S_MAX = 64;
const cadenceFor = (n) => { const k = Number(n) || 0; return Math.max(Math.min(CADENCE_MAX_MS, ACTIVE_MS * Math.max(1, Math.ceil(k / POLLERS_PER_STEP))), Math.ceil(k * 1000 / TICKS_PER_S_MAX)); };

function fileNotice() {
  if (state.itemId) return;
  const todos = todosOf();
  if (!todos || typeof todos.add !== 'function') { state.filesDue = true; return; }   // configure() files it when the store arrives
  if (now() - state.lastFiledAt < LIMITS.fileGapMs) {   // at most ONE item an hour: said in the journal, filed when the hour has passed
    state.filesDue = true;
    if (!state.gapSaid) { state.gapSaid = true; log('[watch] the limit of file watches is reached again — its For-you notice was filed less than an hour ago; it is filed again once the hour has passed'); }
    return;
  }
  try {
    const it = noticeItem();
    const r = todos.add(NOTICE_KEY, { origin: 'server', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'File watches', text: it.text, detail: it.detail, i18n: it.i18n });
    state.itemId = (r && (r.id || (r.item && r.item.id))) || null;
    state.lastFiledAt = now(); state.filesDue = false; state.gapSaid = false; state.filed++;
  } catch (e) { state.filesDue = true; if (!state.failSaid) { state.failSaid = true; log(`[watch] the For-you notice of the watch limit was not filed — ${e && e.message}; it is tried again while the limit lasts`); } }   // (主开发 01:35Z, 5) retried: the next refusal, the probe, configure() — said ONCE a limit (its reader's N9)
}
function liftNotice() {
  const todos = todosOf();
  if (todos && state.itemId) { try { const it = todos.get && todos.get(state.itemId); if (!it || it.status === 'open') todos.setStatus(state.itemId, 'done', 'agent'); } catch { /* the owner cleared it */ } }
  state.itemId = null; state.filesDue = false;
}
/** While limited: one watch tried every probeMs and closed at once — a hub that arms nothing else still learns the limit cleared. */
function armProbe() {
  if (state.probe || !state.limited) return;
  state.probe = setTimeout(() => {
    state.probe = null;
    if (!state.limited) return;
    let w = null;
    try { w = probeFs.watch(os.tmpdir(), { persistent: false }, () => {}); w.on('error', () => {}); } catch (e) { w = null; if (e && e.code === 'ENOSPC') { state.lastRefusalAt = now(); state.armsInRow = 0; } }
    if (w) { try { w.close(); } catch { } noteArmed(); }
    if (state.limited && state.filesDue) fileNotice();   // a notice the hour held back is filed at its turn
    armProbe();
  }, LIMITS.probeMs);
  if (state.probe.unref) state.probe.unref();
}
/** A watch the system refused (or whose watcher failed). */
function noteRefused(e) {
  state.refusals++;
  const code = (e && e.code) || 'error';
  if (code !== 'ENOSPC') { if (!state.saidOther) { state.saidOther = true; log(`[watch] a file watch could not be set (${code}) — that file is followed by polling`); } return; }
  state.lastRefusalAt = now(); state.armsInRow = 0;
  if (!state.limited) {
    state.limited = true; state.code = code; state.failSaid = false;
    log(`[watch] the system's limit of file watches is reached (${LIMIT_NAME}, ENOSPC) — files are followed by polling until a watch can be set again${inContainer() ? ' (a container: the limit is raised on its host)' : `; to raise it: ${raiseCmd(limitNow())}`}`);
  }
  if (!state.itemId) fileNotice();
  armProbe();
}
/** A watch armed: the limit is lifted only once it has stayed clear (liftArms in a row, liftQuietMs since the last refusal). */
function noteArmed() {
  if (!state.limited) return;
  state.armsInRow++;
  if (state.armsInRow < LIMITS.liftArms || now() - state.lastRefusalAt < LIMITS.liftQuietMs) return;
  state.limited = false; state.code = null; state.armsInRow = 0; state.lifted++;
  if (state.probe) { clearTimeout(state.probe); state.probe = null; }
  log('[watch] file watches have been set again for a while — the limit notice is lifted');
  liftNotice();
}
/** (its readers' S1) THE ITEM A PREVIOUS PROCESS LEFT OPEN: adopted — the limit taken as met from then (its filing time the item's
 *  own), the probe armed, lifted by the same rule; never a second item beside it, never one left open for good.
 *  → true when the store answered (adopted, or nothing to adopt), false when there is no store yet. */
function adoptOpen() {
  if (state.itemId) return true;
  const t = todosOf();
  if (!t || typeof t.openItems !== 'function') return false;
  let open = null;
  try { open = t.openItems().find((x) => x && x.sessionKey === NOTICE_KEY) || null; } catch { return false; }
  if (!open) return true;
  state.itemId = open.id; state.lastFiledAt = Number.isFinite(open.createdAt) ? open.createdAt : now(); state.filesDue = false;
  if (!state.limited) { state.limited = true; state.code = 'ENOSPC'; state.lastRefusalAt = now(); state.armsInRow = 0; log('[watch] a watch-limit notice from before the restart is kept until watches have been set again for a while'); armProbe(); }
  return true;
}
// the store's later turns (LIMITS.adoptRetryMs, the gaps): the next loop turn (the hub's boot has made it by then), then a few
// more, each timer unref'd; the LAST try's failure is said once in the journal (主开发 09:53Z, 2) — never a silent give-up
let adoptTimer = null;
function adoptSoon(k) {
  const gaps = LIMITS.adoptRetryMs;
  if (adoptTimer || k >= gaps.length) return;
  adoptTimer = setTimeout(() => {
    adoptTimer = null;
    if (adoptOpen()) { if (state.limited && !state.itemId) fileNotice(); return; }
    if (k + 1 < gaps.length) { adoptSoon(k + 1); return; }
    log('[watch] the For-you store did not answer during the start — a watch-limit notice left open before the restart, if any, was not looked for; it stays until it is cleared by hand');
  }, gaps[k]);
  if (adoptTimer.unref) adoptTimer.unref();
}
/** Hand the door the For-you store (the system-resource notices' module, at boot). A limit already met files its notice now. */
function configure({ getUserTodos = null, log: lg = null, clock = null, probeFs: pf = null, container = undefined, limitNow: ln = null } = {}) {
  if (container !== undefined) containerOverride = container;   // the suite's seam
  if (typeof ln === 'function') limitNow = ln;   // the suite's seam: the machine's current limit
  if (typeof getUserTodos === 'function') todosOf = () => { try { return getUserTodos(); } catch { return null; } };
  if (typeof lg === 'function') log = lg;
  if (typeof clock === 'function') now = clock;   // the suite's clock (the flap legs)
  if (pf) probeFs = pf;
  // (its reader's S1) A NOTICE THAT OUTLIVED A RESTART is adopted — now if the store answers, else at the first turns after the
  // boot (the system-resource module configures the door BEFORE the hub's store exists: its getter throws until then)
  if (!adoptOpen()) adoptSoon(0);
  if (state.limited && !state.itemId) fileNotice();
}

const safeCall = (listener, ev, name) => {
  if (typeof listener !== 'function') return;
  try { listener(ev, name); } catch (e) { if (!state.listenerSaid) { state.listenerSaid = true; log(`[watch] a watch's listener threw (${e && e.message}) — caught; the watch goes on`); } }
};
// THE BOUNDS: a poll's tick waits for a RUNNING turn; each of its file calls waits for an IN-FLIGHT slot
const take = (q, key, max, maxKey) => new Promise((res) => { const go = () => { state[key]++; if (state[key] > state[maxKey]) state[maxKey] = state[key]; res(); }; if (state[key] < LIMITS[max]) go(); else q.push(go); });
const give = (q, key, g) => { if (g !== gen) return; state[key] = Math.max(0, state[key] - 1); const next = q.shift(); if (next) next(); };
async function call(fn, g) { if (g !== gen) throw new Error('an older reset'); await take(slotWait, 'inflight', 'inflight', 'maxInflight'); if (g !== gen) throw new Error('an older reset'); try { return await fn(); } finally { give(slotWait, 'inflight', g); } }   // a tick of an older reset takes nothing from the new one, and gives nothing into it (its reader's N10)

/** The bounded poll that stands in for a watch: the target's stat (a folder: its entries'), compared tick to tick. */
function startPoll(target, listener, F) {
  let timer = null, closed = false, waitMs = cadenceFor(state.pollers + 1), last = null, baseline = null;
  const g = gen;
  const ready = new Promise((r) => { baseline = r; });
  state.pollers++;
  const sig = async () => {
    const st = await call(() => F.promises.stat(target), g);
    if (!st.isDirectory()) return { [path.basename(String(target))]: `${st.size}:${st.mtimeMs}` };
    const out = {};
    const names = (await call(() => F.promises.readdir(target), g)).slice(0, POLL_ENTRIES);
    for (const n of names) { if (closed) break; try { const s = await call(() => F.promises.stat(path.join(String(target), n)), g); out[n] = `${s.size}:${s.mtimeMs}`; } catch { out[n] = 'gone'; } }
    return out;
  };
  const tick = async () => {
    if (closed || g !== gen) return;   // a poll of an older reset ticks no more (N10)
    await take(runWait, 'running', 'running', 'maxRunning');
    if (g !== gen) return;   // a reset came while it held its turn: that turn was the OLD state's (wiped) — giving it to the new one would over-release
    let cur = null;
    try { cur = closed ? null : await sig(); } catch { cur = {}; } finally { give(runWait, 'running', g); }   // a target gone (or not there yet) is polled on, quietly
    if (closed || !cur || g !== gen) { if (baseline) { baseline(); baseline = null; } return; }   // an older reset's tick calls no listener (its delta reader's F4)
    const changed = last ? Object.keys({ ...last, ...cur }).filter((k) => last[k] !== cur[k]) : [];
    last = cur;
    if (baseline) { baseline(); baseline = null; }   // the baseline is taken: changes from here on are heard
    const active = cadenceFor(state.pollers);
    if (changed.length) { waitMs = active; for (const n of changed) safeCall(listener, 'change', n); }
    else waitMs = Math.max(active, Math.min(Math.max(QUIET_MS, active), waitMs * 2));
    schedule();
  };
  const schedule = () => { if (closed) return; timer = setTimeout(() => { tick().catch(() => {}); }, waitMs); if (timer.unref) timer.unref(); };
  tick().catch(() => {});   // the baseline at once (in its turn)
  return { ready, cadenceMs: () => waitMs, close() { if (closed) return; closed = true; if (g === gen) state.pollers--; if (timer) clearTimeout(timer); timer = null; if (baseline) { baseline(); baseline = null; } } };
}

/**
 * fs.watch's shape, through the one door: (target[, options][, listener]) → a watcher (EventEmitter: close, ref, unref; its
 * `polled` says whether a poll stands in). Never throws; never emits 'error' — a failure becomes the poll, said.
 * `seam.fs` = the fs module to use (the suite's stand-in); default the real one.
 */
function watch(target, options, listener, seam = {}) {
  if (typeof options === 'function') { seam = listener || {}; listener = options; options = {}; }
  const F = (seam && seam.fs) || fs;
  const w = new EventEmitter();
  let inner = null, poll = null, closed = false, refusedCode = null;
  const toPoll = (e) => {
    if (closed || poll) return;
    refusedCode = (e && e.code) || 'error';
    if (inner) { try { inner.removeAllListeners('error'); inner.on('error', () => {}); inner.close(); } catch { } inner = null; }
    noteRefused(e);
    poll = startPoll(target, listener, F);
  };
  try {
    inner = F.watch(target, options || {}, (ev, name) => safeCall(listener, ev, name));
    inner.on('error', (e) => toPoll(e));   // a watch that fails AFTER it was armed is followed by the poll, never an uncaught 'error'
    noteArmed();
  } catch (e) { inner = null; toPoll(e); }
  Object.defineProperty(w, 'polled', { get: () => !!poll });
  Object.defineProperty(w, 'refusedCode', { get: () => refusedCode });   // why a poll stands in (a caller with its own poll may say its own line)
  Object.defineProperty(w, 'ready', { get: () => (poll ? poll.ready : Promise.resolve()) });   // the poll's baseline taken (an armed watch: at once)
  Object.defineProperty(w, 'cadenceMs', { get: () => (poll ? poll.cadenceMs() : null) });
  w.close = () => { if (closed) return; closed = true; if (inner) { try { inner.close(); } catch { } inner = null; } if (poll) { poll.close(); poll = null; } };
  w.ref = () => { try { if (inner && inner.ref) inner.ref(); } catch { } return w; };
  w.unref = () => { try { if (inner && inner.unref) inner.unref(); } catch { } return w; };
  return w;
}

/** The suite's view (and the journal's): the door's state, and a reset between legs. */
const status = () => ({ limited: state.limited, code: state.code, itemId: state.itemId, pollers: state.pollers, refusals: state.refusals, filed: state.filed, lifted: state.lifted, armsInRow: state.armsInRow, maxInflight: state.maxInflight, maxRunning: state.maxRunning, filesDue: state.filesDue });
function resetForTest() {
  if (state.probe) clearTimeout(state.probe);
  if (adoptTimer) { clearTimeout(adoptTimer); adoptTimer = null; }
  gen++; Object.assign(state, fresh()); runWait.length = 0; slotWait.length = 0;
  Object.assign(LIMITS, { ...DEFAULT_LIMITS, adoptRetryMs: [...DEFAULT_LIMITS.adoptRetryMs] });
  todosOf = () => null; log = (line) => { try { console.warn(line); } catch { } }; now = () => Date.now(); probeFs = fs; containerOverride = null; limitNow = readLimit;
}

module.exports = { watch, configure, status, noticeItem, cadenceFor, resetForTest, LIMITS, DEFAULT_LIMITS, ACTIVE_MS, QUIET_MS, CADENCE_MAX_MS, TICKS_PER_S_MAX, POLLERS_PER_STEP, POLL_ENTRIES, NOTICE_KEY, LIMIT_NAME, raiseCmd };
