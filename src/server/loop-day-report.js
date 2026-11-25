'use strict';
/**
 * THE MAIN LOOP'S HOUR IN THE JOURNAL (lane hub-loop-stalls, unit «loop-day-report», 2026-11-16) — the ORCH half of PURE
 * src/loop-day-report.js. A measurement release: what the main loop did per hour and per day, readable without the page.
 *   · M2 — ONE [loop-hour] line at each UTC hour and ONE [loop-exit] line at exit (the hour so far): the hour's held
 *     seconds and holds (every hold the watchdog booked — src/server/loop-holds.js `onEach`), the three top causes, the
 *     longest; the loop's busy share over the hour (performance.eventLoopUtilization between the two cuts).
 *   · M3 — the engines' shares of the busy time: the watchdog thread's census over the hour (src/loop-census.js, taken
 *     once at the cut — `census()`; none answering ⇒ «?», never a guess).
 *   · M4 — memory once an hour: the hub's heap (used / its limit) and RSS; its processes by kind — agent CLIs, browsers, the
 *     device agent, the rest — counted and their RSS summed, read ASYNCHRONOUSLY (fs.promises: the hub's cgroup when it runs
 *     in a service or scope unit — dtach keeps a conversation's CLI there, not under the hub's pid — else the hub's process
 *     tree); a process's command line is read only to tell the device agent and a node-based CLI apart, and never kept.
 *   · M5 — the sizes at the cut (live conversations, open page sockets, device links) and the hour's counts
 *     (src/server/loop-counts.js).
 * THE COST: the cut swaps the hour's tally (no walk over rows — the holds were folded as they came), the reads are async
 * (no synchronous call: test-loop-day-report counts them), the line is ONE write. The last 24 hours are kept in memory for
 * ⚙ Diagnostics (GET /api/loop-holds → `hourly`). No file, no setting, no request to anyone.
 */
const fs = require('fs');
const v8 = require('v8');
const { performance } = require('perf_hooks');
const LDR = require('../loop-day-report.js');
const LC = require('./loop-counts.js');

const KEEP_HOURS = 24;
const MAX_PROCS = 2000;
const CENSUS_WAIT_MS = 3000;
const PROCS_WAIT_MS = 20000;
const CLI_RE = /^(claude|codex|opencode|agy|gemini|qwen|cursor-agent|amp|crush|kimi|aider)$/i;
const BROWSER_RE = /^(chrome|chromium|chromium-browser|google-chrome|headless_shell|firefox)$|^chrome_/i;
// a node process is told by the SCRIPT it runs (its first argument that is not an option of node's), never by a pattern anywhere
// in its arguments — a conversation's wrapper carries the CLI's absolute path among them and is a wrapper (cure r2, S3)
const NODE_OPTS_WITH_VALUE = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader', '-e', '--eval', '-p', '--print', '--title', '--inspect-port']);
const scriptOf = (argv) => { for (let i = 1; i < argv.length; i++) { const a = argv[i]; if (NODE_OPTS_WITH_VALUE.has(a)) { i++; continue; } if (a.startsWith('-')) continue; return a; } return ''; };
const CLI_SCRIPT_RE = /\/(?:@anthropic-ai\/claude-code|@openai\/codex|opencode-ai|@google\/gemini-cli|@qwen-code\/qwen-code)\/|\/(?:claude|codex|opencode|gemini|qwen|agy)(?:\.[cm]?js)?$/;
const WRAPPER_SCRIPT_RE = /(?:^|\/)[\w.-]*-wrapper\.[cm]?js$/;
const AGENTD_SCRIPT_RE = /(?:^|\/)vibespace-agentd\.js$|\/agentd\/current\/agentd\.js$/;

/** a promise, or `fallback` after ms */
const within = (p, ms, fallback = null) => new Promise((res) => { const t = setTimeout(() => res(fallback), ms); if (t.unref) t.unref(); Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, () => { clearTimeout(t); res(fallback); }); });
const base = (p) => String(p || '').split('/').pop();

/** PURE: a process's kind, by WHAT IT IS — its program (argv[0] / its name) and, for node, the script it runs; a pid the browser
 *  keeper launched (its live map — every engine, whatever its program is called) is a browser. Never a pattern in its arguments. */
function kindOf(name, argv = [], { browserPid = false } = {}) {
  const n = String(name || ''), av = Array.isArray(argv) ? argv : String(argv || '').split(' ').filter(Boolean);
  if (/^vibespace-devic/.test(n)) return 'agentd';   // the device agent titles itself «vibespace-device…» (its argv rewritten)
  if (browserPid) return 'browser';
  const prog = base(av[0] || n);
  if (/^(node|nodejs)$/.test(prog) || /^(node|MainThread|nodejs)$/.test(n)) {
    const sc = scriptOf(av);
    if (AGENTD_SCRIPT_RE.test(sc)) return 'agentd';
    if (WRAPPER_SCRIPT_RE.test(sc)) return 'wrapper';
    if (CLI_SCRIPT_RE.test(sc)) return 'cli';
    return 'other';
  }
  if (CLI_RE.test(prog) || CLI_RE.test(n)) return 'cli';
  if (BROWSER_RE.test(prog) || BROWSER_RE.test(n)) return 'browser';
  return 'other';
}
/** a process listing's pids (a stand-in root in the suite) */
async function pidsOf(procRoot) {
  let names = []; try { names = await fs.promises.readdir(procRoot); } catch { return []; }
  return names.filter((n) => /^\d+$/.test(n)).map(Number);
}
/** the processes under `roots` (each task's `children` file), breadth-first, at most `max`; a cancelled walk stops where it is */
async function treeOf(roots, procRoot, signal = null, max = MAX_PROCS) {
  const seen = new Set(), queue = roots.filter((p) => p > 0);
  while (queue.length && seen.size < max) {
    if (signal && signal.cancelled) break;
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    let tids = []; try { tids = await fs.promises.readdir(`${procRoot}/${pid}/task`); } catch { continue; }
    for (const tid of tids.slice(0, 32)) {
      let kids = ''; try { kids = await fs.promises.readFile(`${procRoot}/${pid}/task/${tid}/children`, 'utf8'); } catch { continue; }
      for (const k of kids.trim().split(/\s+/)) if (/^\d+$/.test(k)) queue.push(Number(k));
    }
  }
  return [...seen];
}
/** PURE: how the hub's processes are told apart, from its cgroup v2 path (`0::<path>` of /proc/self/cgroup) and ONE more fact
 *  (`inContainer`: a container's own marker file — /.dockerenv, /run/.containerenv — or the orchestrator's environment):
 *   · 'container' — the path names a container runtime's cgroup, or it is the ROOT and the second fact says container: the WHOLE
 *     container is the hub's (the conversations' dtach masters left the hub's tree by design, and are still the hub's);
 *   · 'service' — a systemd SERVICE unit: the unit's members are the hub's (dtach keeps a conversation's CLI there);
 *   · 'tree' — anything else: a login shell's session scope, an app or run scope, the root group with NO second fact (a machine
 *     with no container), no v2 line — such a place may hold the person's other programs, so only the hub's own count: its process
 *     tree, and the dtach masters whose command line names the hub's sockets folder with their trees. When unsure, the tree:
 *     fewer, never the person's own programs. */
const CONTAINER_RE = /\/(?:kubepods|docker|containerd|libpod|lxc)[/.\-]|(?:docker|cri-containerd|crio|libpod)-[0-9a-f]{12,}\.scope$/;
function howOf(cgroupText, { inContainer = false } = {}) {
  const m = /^0::(\S*)\s*$/m.exec(String(cgroupText || ''));
  if (!m) return 'tree';
  if (CONTAINER_RE.test(m[1])) return 'container';
  if (m[1] === '/') return inContainer ? 'container' : 'tree';
  if (/\.service$/.test(m[1])) return 'service';
  return 'tree';
}
/** the second fact: a container's own marker file under `rootFs`, or an orchestrator's environment */
async function inContainerOf(rootFs = '/', env = process.env) {
  if (env && (env.KUBERNETES_SERVICE_HOST || env.container)) return true;
  for (const f of ['.dockerenv', 'run/.containerenv']) { try { await fs.promises.access(`${rootFs.replace(/\/$/, '')}/${f}`); return true; } catch { } }
  return false;
}
/** the hub's processes (not itself), by howOf; `procRoot` / `cgroupRoot` / `rootFs` are stand-ins in the suite */
async function membersOf({ self = process.pid, procRoot = '/proc', cgroupRoot = '/sys/fs/cgroup', rootFs = '/', env = process.env, socketsDir = null, signal = null } = {}) {
  let cg = '';
  try { cg = await fs.promises.readFile(`${procRoot}/self/cgroup`, 'utf8'); } catch { }
  const root = /^0::\/\s*$/m.test(cg);
  const how = howOf(cg, { inContainer: root ? await inContainerOf(rootFs, env) : false });
  if (how === 'container') return { how, pids: (await pidsOf(procRoot)).filter((p) => p !== self).slice(0, MAX_PROCS) };
  if (how === 'service') {
    const path0 = /^0::(\S*)\s*$/m.exec(cg)[1];
    try { const t = await fs.promises.readFile(`${cgroupRoot}${path0}/cgroup.procs`, 'utf8'); return { how, pids: t.split('\n').map(Number).filter((p) => p > 0 && p !== self).slice(0, MAX_PROCS) }; } catch { }
  }
  const roots = [self];
  if (socketsDir) {
    for (const pid of await pidsOf(procRoot)) {
      if (signal && signal.cancelled) break;
      if (pid === self || roots.length > 512) continue;
      let c = ''; try { c = (await fs.promises.readFile(`${procRoot}/${pid}/cmdline`, 'utf8')).split('\0'); } catch { continue; }
      if (/(^|\/)dtach$/.test(c[0] || '') && c.some((a) => a.startsWith(`${socketsDir}/`))) roots.push(pid);
    }
  }
  return { how: 'tree', pids: (await treeOf(roots, procRoot, signal)).filter((p) => p !== self) };
}
/** M4: the hub's processes by kind → { cli: {n, rss}, wrapper, browser, agentd, other, how } (rss in bytes; a process gone meanwhile
 *  is skipped; a cancelled walk answers null). `browserPids` = the keeper's live browsers as {pid, starttime} (any engine; the
 *  daemon and its browser) — a pid counts as one only while /proc/<pid>/stat's start time is still the record's (cure r3). A CLI
 *  is counted ONCE: a CLI process whose parent is a CLI (a launcher script or a node shim and the native CLI it starts) adds its
 *  memory to the CLI, not a second count. */
async function procKids(opts = {}) {
  const procRoot = opts.procRoot || '/proc', signal = opts.signal || null;
  // the keeper's browsers as {pid, starttime}: a root counts only while /proc/<pid>/stat's start time is still that record's (a reused pid is not it)
  const want = new Map(); for (const b of opts.browserPids || []) if (b && Number.isInteger(b.pid) && b.starttime != null) want.set(b.pid, Number(b.starttime));
  const bp = new Set();
  const out = { how: null }; for (const k of LDR.KIDS) out[k] = { n: 0, rss: 0 };
  const mem = await membersOf(opts);
  out.how = mem.how;
  const rows = new Map();
  for (const pid of mem.pids) {
    if (signal && signal.cancelled) return null;
    let st = '';
    try { st = await fs.promises.readFile(`${procRoot}/${pid}/status`, 'utf8'); } catch { continue; }
    const name = (/^Name:\s*(.*)$/m.exec(st) || [])[1] || '';
    const ppid = Number((/^PPid:\s*(\d+)/m.exec(st) || [])[1] || 0);
    const rss = Number((/^VmRSS:\s*(\d+)\s*kB/m.exec(st) || [])[1] || 0) * 1024;
    let argv = [];
    if (/^(node|MainThread|nodejs)$/.test(name)) { try { argv = (await fs.promises.readFile(`${procRoot}/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean).slice(0, 64); } catch { } }
    rows.set(pid, { name, ppid, rss, argv });
  }
  for (const [pid, st0] of want) { if (signal && signal.cancelled) return null; if (!rows.has(pid)) continue; try { const st = await fs.promises.readFile(`${procRoot}/${pid}/stat`, 'utf8'); const f = st.slice(st.lastIndexOf(')') + 2).split(' '); if (Number(f[19]) === st0) bp.add(pid); } catch { } }
  // a keeper browser and every process under it is a browser (an engine's own helpers, whatever their names)
  const underBrowser = (pid) => { for (let p = pid, i = 0; p > 0 && i < 64; i++) { if (bp.has(p)) return true; const r = rows.get(p); if (!r) return false; p = r.ppid; } return false; };
  const kinds = new Map(); for (const [pid, r] of rows) kinds.set(pid, kindOf(r.name, r.argv, { browserPid: underBrowser(pid) }));
  for (const [pid, r] of rows) {
    const k = kinds.get(pid);
    // a CLI is counted ONCE: a launcher (a shell script, a node shim) and the native CLI it starts are one CLI — the child adds its memory, not a count
    if (!(k === 'cli' && kinds.get(r.ppid) === 'cli')) out[k].n++;
    out[k].rss += r.rss;
  }
  return signal && signal.cancelled ? null : out;
}
/** S4: each live conversation's OUTPUT FILE time (its buffer file's mtime — a fact that survives a restart of the hub), read with
 *  fs.promises, at most `max`; an id without the file is absent */
async function outputTimes(entries, buffersDir, { max = 2000, signal = null } = {}) {
  const out = new Map();
  if (!buffersDir) return out;
  let n = 0;
  for (const [id] of entries || []) {
    if (signal && signal.cancelled) return null;   // ended at its time-out: says so (null), never a partial or a previous hour's map
    if (++n > max) break;
    try { const st = await fs.promises.stat(`${buffersDir}/${id}.buf`); out.set(String(id), st.mtimeMs); } catch { }
    if (signal) signal.read = n;   // how many it has read — the hour says it when the pass runs out of time
  }
  return signal && signal.cancelled ? null : out;
}
/** M6 — PURE: the live conversations by turn and idle age, from the turn facts the hub holds (src/server/turn-facts.js: turnOf /
 *  turnKnown) and, idle, the age of the conversation's OUTPUT FILE (`times`: id → mtime ms — survives a restart): running, waiting
 *  on the person, idle under 1 h, 1–2 h, 2–4 h, over 4 h; a harness that publishes no turn facts (a terminal) or no output file is
 *  «turn-unknown». `entries` = [id, session] pairs. */
function turnsOf(entries, t, times = new Map()) {
  const TF = require('./turn-facts.js');
  const out = Object.fromEntries(LDR.AGES.map((a) => [a, 0]));
  const aged = times instanceof Map;   // cure r3 (T2): no pass this hour (it ran out of time, or none ran) ⇒ the idle ages are «?»
  if (!aged) for (const a of ['idle-under-1h', 'idle-1-2h', 'idle-2-4h', 'idle-over-4h']) out[a] = null;
  for (const e of entries || []) {
    const [id, s] = Array.isArray(e) ? e : [null, e];
    if (!TF.turnKnown(s)) { out['turn-unknown']++; continue; }
    const st = TF.turnOf(s);
    if (st === 'running') { out['turn-running']++; continue; }
    if (st === 'waiting') { out['turn-waiting']++; continue; }
    if (!aged) continue;
    const at = times.get(String(id));
    if (!(at > 0)) { out['turn-unknown']++; continue; }
    const age = t - at, H = LDR.HOUR_MS;
    out[age < H ? 'idle-under-1h' : age < 2 * H ? 'idle-1-2h' : age < 4 * H ? 'idle-2-4h' : 'idle-over-4h']++;
  }
  return out;
}

function create({ log = console, census = async () => null, foldCensus = null, sizes = () => ({}), starter = () => require('./child-starter').childStarter().stats(), wallNow = () => Date.now(), watched = () => true,
  sessions = () => [], browsers = () => null, lost = () => null, upMs = () => process.uptime() * 1000, buffersDir = null, outputs = outputTimes, walkWaitMs = PROCS_WAIT_MS,
  elu = (a, b) => performance.eventLoopUtilization(a, b), kids = (signal) => procKids({ signal }), heap = () => { const s = v8.getHeapStatistics(); return { heapUsed: s.used_heap_size, heapLimit: s.heap_size_limit }; },
  rss = () => process.memoryUsage.rss(), keepHours = KEEP_HOURS } = {}) {
  const watchedNow = () => { try { return watched() !== false; } catch { return false; } };
  let cur = LDR.newHour(wallNow(), { watched: watchedNow() });
  let eluAt = (() => { try { return elu(); } catch { return null; } })();
  let lastKids = null, timer = null, stopped = false, exitSaid = false, walking = null, aging = null;
  let lost0 = (() => { try { const n = lost(); return Number.isFinite(n) ? n : null; } catch { return null; } })();
  const kept = [];
  const fold = foldCensus || ((t) => { try { return require('../loop-census.js').censusFold(t); } catch { return null; } });
  const busySince = (from) => { try { return from ? elu(elu(), from).utilization : null; } catch { return null; } };
  const memNow = (k) => { let h = {}; try { h = heap() || {}; } catch { } let r = null; try { r = rss(); } catch { } return { heapUsed: h.heapUsed, heapLimit: h.heapLimit, rss: r, kids: k }; };
  const sizesNow = () => { try { return sizes() || {}; } catch { return {}; } };
  const starterNow = () => { try { return starter() || null; } catch { return null; } };   // B-91aa: «program-starts=» — the old road in force is said every hour
  // B-91aa's remainder (r4591 (A)): «vault-direct-starts=» — the vault jobs' starts on the hub's own road since the last line (the starter's
  // `directJobs` counts them; its delta here); a starter that tells none ⇒ «?»
  let directJobs0 = (() => { const s = starterNow(); return s && Number.isFinite(s.directJobs) ? s.directJobs : 0; })();
  const vaultDirectOf = (s) => { if (!s || !Number.isFinite(s.directJobs)) return null; const d = s.directJobs - directJobs0; directJobs0 = s.directJobs; return d; };
  const entriesNow = () => { try { return [...(sessions() || [])]; } catch { return []; } };
  const turnsNow = (t, entries = entriesNow(), times = null) => { try { return turnsOf(entries, t, times); } catch { return null; } };
  /** THE AGE PASS (cure r3, T2): ONE at a time, ended at its time-out (cancelled) — then the hour's idle ages are «?» and the line says
   *  how many conversations were read; never a previous hour's times */
  async function agesOnce(entries) {
    if (aging) return { times: null, read: 0, total: entries.length };   // the last pass is still ending: this hour reads none
    const signal = { cancelled: false, read: 0 };
    aging = Promise.resolve().then(() => outputs(entries, buffersDir, { signal }));
    const times = await within(aging, walkWaitMs);
    if (times === null) signal.cancelled = true;
    aging.finally(() => { aging = null; }).catch(() => { });
    const ok = times instanceof Map;
    return { times: ok ? times : null, read: signal.read > 0 ? signal.read : (ok ? times.size : 0), total: entries.length };
  }
  const upNow = () => { try { const v = upMs(); return Number.isFinite(v) ? v : null; } catch { return null; } };
  /** the hour's holds the watchdog's ring dropped (a count since the last cut; null when the book cannot say) */
  const lostSince = () => { let n = null; try { n = lost(); } catch { } if (!Number.isFinite(n) || !Number.isFinite(lost0)) { lost0 = Number.isFinite(n) ? n : null; return null; } const d = n - lost0; lost0 = n; return d; };
  /** THE PROCESS WALK: ONE at a time — a cut while one still runs reads none («?»); its time-out ENDS it (cancelled), never a second
   *  walk beside it */
  async function walkOnce() {
    if (walking) return null;
    const signal = { cancelled: false };
    walking = Promise.resolve().then(() => kids(signal));
    const k = await within(walking, walkWaitMs);
    if (k === null) signal.cancelled = true;
    walking.finally(() => { walking = null; }).catch(() => { });
    return k;
  }
  const browsersNow = (t) => { try { return browsers(t) || null; } catch { return null; } };

  /** a hold the watchdog booked (src/server/loop-holds.js onEach) into the current hour */
  function onHold(f) { if (f) LDR.holdAdd(cur, { ms: f.ms, verdict: f.verdict, frame: f.frame, boot: !!f.boot, noOurs: f.noOurs === true }); }   // the boot's own hold apart (R5)

  /** THE CUT: the hour so far is swapped out FIRST (a hold during the reads below counts in the next hour), then the census
   *  and the process table are read asynchronously, then ONE line */
  async function tick() {
    const toMs = wallNow(), h = cur, from = eluAt;
    if (!watchedNow()) h.watched = false;   // R3: a watchdog gone at the cut ⇒ the hour was not (wholly) watched
    h.lost = lostSince();
    cur = LDR.newHour(toMs, { watched: watchedNow() });
    eluAt = (() => { try { return elu(); } catch { return null; } })();
    let busy = null; try { busy = from && eluAt ? elu(eluAt, from).utilization : null; } catch { }
    const counts = LC.take();
    const take = await within(census(), CENSUS_WAIT_MS);
    const engines = take ? fold(take) : null;
    const k = await walkOnce();
    if (k) lastKids = k;
    const entries = entriesNow();
    const ag = await agesOnce(entries);
    const st0 = starterNow();
    const rep = { kind: 'hour', hour: h, toMs, busy, engines, upMs: upNow(), mem: memNow(k), turns: turnsNow(toMs, entries, ag.times), agesRead: ag, browsers: browsersNow(toMs), sizes: { ...sizesNow(), ...counts }, starter: st0, vaultDirect: vaultDirectOf(st0) };
    rep.line = LDR.line(rep);
    kept.push(rep); if (kept.length > keepHours) kept.splice(0, kept.length - keepHours);
    try { log.log(rep.line); } catch { }
    return rep;
  }
  function schedule() {
    if (stopped) return;
    const ms = Math.max(1000, LDR.nextHourAt(wallNow()) - wallNow() + 50);
    timer = setTimeout(() => { tick().catch(() => { }).finally(schedule); }, ms);
    if (timer.unref) timer.unref();
  }
  /** the exit line: the hour so far, the counts so far, the last process table read (no read now — the idle ages print «?»). A hub KILLED
   *  outright (SIGKILL, the OOM killer) writes none — its journal's hours can then add to less than the stored day */
  function exitLine() {
    if (exitSaid) return null;
    exitSaid = true;
    const t = wallNow();
    if (!watchedNow()) cur.watched = false;
    const st0 = starterNow();
    const rep = { kind: 'exit', hour: cur, toMs: t, busy: busySince(eluAt), engines: null, upMs: upNow(), mem: memNow(lastKids), turns: turnsNow(t, entriesNow(), null), agesRead: { read: 0, total: entriesNow().length }, browsers: browsersNow(t), sizes: { ...sizesNow(), ...LC.peek() }, starter: st0, vaultDirect: vaultDirectOf(st0) };
    rep.line = LDR.line(rep);
    try { log.log(rep.line); } catch { }
    return rep;
  }
  const onExit = () => exitLine();
  function start() { stopped = false; schedule(); process.once('exit', onExit); return api; }
  function stop() { stopped = true; clearTimeout(timer); process.removeListener('exit', onExit); }
  /** ⚙ Diagnostics: the hours kept (newest first) and their day */
  function hours() {
    const rows = kept.slice().reverse().map((r) => ({ line: r.line, from: r.hour.fromMs, to: r.toMs, watched: r.hour.watched !== false, lost: r.hour.lost, upMs: r.upMs, heldMs: r.hour.heldMs, holds: r.hour.holds, longestMs: r.hour.longestMs, boot: r.hour.boot, busy: r.busy, top: LDR.topOf(r.hour.by), engines: r.engines ? { busyTicks: Number.isFinite(r.engines.busyTicks) ? r.engines.busyTicks : null, shares: r.engines.shares || null, native: r.engines.native || null, outside: r.engines.outside || null, viaHelper: r.engines.viaHelper || null, deep: r.engines.deep || null, held: r.engines.held || null, idle: r.engines.idle || null, cost: r.engines.cost || null } : null, mem: r.mem, turns: r.turns, agesRead: r.agesRead || null, browsers: r.browsers, sizes: r.sizes }));
    return { hours: rows, day: LDR.dayFold(kept), now: { from: cur.fromMs, heldMs: cur.heldMs, holds: cur.holds, busy: busySince(eluAt) } };
  }
  const api = { onHold, tick, start, stop, exitLine, hours };
  return api;
}

/** server.js's ONE line: the report started beside the watchdog (`witness` = src/server/sync-fs-witness.js's) — each hold its book
 *  books handed to the hour, its hours read by the book's report (⚙ Diagnostics), the census asked of its thread */
function wire({ witness, sizes, sessions = () => [], socketsDir = null, buffersDir = null, log = console } = {}) {
  const book = witness && typeof witness.holds === 'function' ? witness.holds() : null;
  const keeper = () => { try { return require('./browser-keeper.js').keeper(); } catch { return null; } };
  const r = create({ log, sizes, sessions, buffersDir,
    census: () => (witness && typeof witness.census === 'function' ? witness.census() : null),
    watched: () => !!(book && (typeof book.watching !== 'function' || book.watching())),   // R3: no book / no watchdog ⇒ «?»
    lost: () => (book && typeof book.lostCount === 'function' ? book.lostCount() : null),
    browsers: (t) => { try { return keeper()?.readyCounts?.(t) || null; } catch { return null; } },
    kids: (signal) => procKids({ socketsDir, signal, browserPids: (() => { try { return keeper()?.browserPids?.() || []; } catch { return []; } })() }) }).start();
  if (book) { book.onEach((h) => r.onHold(h)); book.setHourly(() => r.hours()); }
  return r;
}

module.exports = { create, wire, procKids, membersOf, howOf, inContainerOf, turnsOf, outputTimes, kindOf, scriptOf, KEEP_HOURS };
