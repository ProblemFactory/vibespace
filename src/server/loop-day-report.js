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
const CLI_RE = /^(claude|codex|opencode|agy|gemini|qwen|cursor-agent|amp|crush|kimi|aider)\b/i;
const BROWSER_RE = /chrom|headless_shell|firefox|cloakbrowser/i;
const CLI_ARGS_RE = /(?:@anthropic-ai\/claude-code|\/claude(?:\.js)?\b|@openai\/codex|\/codex(?:\.js)?\b|opencode|\/agy\b|gemini-cli)/;

/** a promise, or `fallback` after ms */
const within = (p, ms, fallback = null) => new Promise((res) => { const t = setTimeout(() => res(fallback), ms); if (t.unref) t.unref(); Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, () => { clearTimeout(t); res(fallback); }); });

/** PURE: a process's kind from its Name (comm) and, for a node process only, its command line */
function kindOf(name, args = '') {
  const n = String(name || '');
  if (/^vibespace-devic/.test(n)) return 'agentd';   // the device agent titles itself «vibespace-device…» (comm keeps 15 characters)
  if (BROWSER_RE.test(n)) return 'browser';
  if (CLI_RE.test(n)) return 'cli';
  if (/^(node|MainThread|nodejs)$/.test(n)) {
    if (/vibespace-agentd/.test(args)) return 'agentd';
    if (CLI_ARGS_RE.test(args)) return 'cli';
  }
  return 'other';
}
/** the hub's processes (not itself): its cgroup's members when it runs in a service / scope unit, else its process tree */
async function membersOf(self = process.pid) {
  let cg = '';
  try { cg = await fs.promises.readFile('/proc/self/cgroup', 'utf8'); } catch { }
  const m = /^0::(\/\S*\.(?:service|scope))$/m.exec(cg);
  if (m) {
    try { const t = await fs.promises.readFile(`/sys/fs/cgroup${m[1]}/cgroup.procs`, 'utf8'); return { how: 'cgroup', pids: t.split('\n').map(Number).filter((p) => p > 0 && p !== self).slice(0, MAX_PROCS) }; } catch { }
  }
  const tree = await require('../proc-listen.js').pidTree(self, { max: MAX_PROCS });
  return { how: 'tree', pids: tree.filter((p) => p !== self) };
}
/** M4: the hub's processes by kind → { cli: {n, rss}, browser, agentd, other, how } (rss in bytes; a process gone meanwhile is skipped) */
async function procKids(self = process.pid) {
  const out = { how: null }; for (const k of LDR.KIDS) out[k] = { n: 0, rss: 0 };
  const mem = await membersOf(self);
  out.how = mem.how;
  for (const pid of mem.pids) {
    let st = '';
    try { st = await fs.promises.readFile(`/proc/${pid}/status`, 'utf8'); } catch { continue; }
    const name = (/^Name:\s*(.*)$/m.exec(st) || [])[1] || '';
    const rss = Number((/^VmRSS:\s*(\d+)\s*kB/m.exec(st) || [])[1] || 0) * 1024;
    let args = '';
    if (/^(node|MainThread|nodejs)$/.test(name)) { try { args = (await fs.promises.readFile(`/proc/${pid}/cmdline`, 'utf8')).replace(/\0/g, ' ').slice(0, 2000); } catch { } }
    const k = kindOf(name, args);
    out[k].n++; out[k].rss += rss;
  }
  return out;
}

function create({ log = console, census = async () => null, foldCensus = null, sizes = () => ({}), wallNow = () => Date.now(),
  elu = (a, b) => performance.eventLoopUtilization(a, b), kids = procKids, heap = () => { const s = v8.getHeapStatistics(); return { heapUsed: s.used_heap_size, heapLimit: s.heap_size_limit }; },
  rss = () => process.memoryUsage.rss(), keepHours = KEEP_HOURS } = {}) {
  let cur = LDR.newHour(wallNow());
  let eluAt = (() => { try { return elu(); } catch { return null; } })();
  let lastKids = null, timer = null, stopped = false, exitSaid = false;
  const kept = [];
  const fold = foldCensus || ((t) => { try { return require('../loop-census.js').censusFold(t); } catch { return null; } });
  const busySince = (from) => { try { return from ? elu(elu(), from).utilization : null; } catch { return null; } };
  const memNow = (k) => { let h = {}; try { h = heap() || {}; } catch { } let r = null; try { r = rss(); } catch { } return { heapUsed: h.heapUsed, heapLimit: h.heapLimit, rss: r, kids: k }; };
  const sizesNow = () => { try { return sizes() || {}; } catch { return {}; } };

  /** a hold the watchdog booked (src/server/loop-holds.js onEach) into the current hour */
  function onHold(f) { if (f && !f.boot) LDR.holdAdd(cur, { ms: f.ms, verdict: f.verdict, frame: f.frame }); }

  /** THE CUT: the hour so far is swapped out FIRST (a hold during the reads below counts in the next hour), then the census
   *  and the process table are read asynchronously, then ONE line */
  async function tick() {
    const toMs = wallNow(), h = cur, from = eluAt;
    cur = LDR.newHour(toMs);
    eluAt = (() => { try { return elu(); } catch { return null; } })();
    let busy = null; try { busy = from && eluAt ? elu(eluAt, from).utilization : null; } catch { }
    const counts = LC.take();
    const take = await within(census(), CENSUS_WAIT_MS);
    const engines = take ? fold(take) : null;
    const k = await within(kids(), PROCS_WAIT_MS);
    if (k) lastKids = k;
    const rep = { kind: 'hour', hour: h, toMs, busy, engines, mem: memNow(k), sizes: { ...sizesNow(), ...counts } };
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
  /** the exit line: the hour so far, the counts so far, the last process table read (no read now) */
  function exitLine() {
    if (exitSaid) return null;
    exitSaid = true;
    const rep = { kind: 'exit', hour: cur, toMs: wallNow(), busy: busySince(eluAt), engines: null, mem: memNow(lastKids), sizes: { ...sizesNow(), ...LC.peek() } };
    rep.line = LDR.line(rep);
    try { log.log(rep.line); } catch { }
    return rep;
  }
  const onExit = () => exitLine();
  function start() { stopped = false; schedule(); process.once('exit', onExit); return api; }
  function stop() { stopped = true; clearTimeout(timer); process.removeListener('exit', onExit); }
  /** ⚙ Diagnostics: the hours kept (newest first) and their day */
  function hours() {
    const rows = kept.slice().reverse().map((r) => ({ line: r.line, from: r.hour.fromMs, to: r.toMs, heldMs: r.hour.heldMs, holds: r.hour.holds, longestMs: r.hour.longestMs, busy: r.busy, top: LDR.topOf(r.hour.by), engines: r.engines ? r.engines.shares || null : null, mem: r.mem, sizes: r.sizes }));
    return { hours: rows, day: LDR.dayFold(kept), now: { from: cur.fromMs, heldMs: cur.heldMs, holds: cur.holds, busy: busySince(eluAt) } };
  }
  const api = { onHold, tick, start, stop, exitLine, hours };
  return api;
}

/** server.js's ONE line: the report started beside the watchdog (`witness` = src/server/sync-fs-witness.js's) — each hold its book
 *  books handed to the hour, its hours read by the book's report (⚙ Diagnostics), the census asked of its thread */
function wire({ witness, sizes, log = console } = {}) {
  const book = witness && typeof witness.holds === 'function' ? witness.holds() : null;
  const r = create({ log, sizes, census: () => (witness && typeof witness.census === 'function' ? witness.census() : null) }).start();
  if (book) { book.onEach((h) => r.onHold(h)); book.setHourly(() => r.hours()); }
  return r;
}

module.exports = { create, wire, procKids, membersOf, kindOf, KEEP_HOURS };
