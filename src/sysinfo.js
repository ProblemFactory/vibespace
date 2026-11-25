// System info + memory-pressure watch (2.216.0 — userL's instance was
// OOMKilled at its 32Gi pod limit after a week of process accumulation; the
// pod-level kill takes EVERY dtach session with it, and nothing warned).
// read() = container-aware snapshot for the System rail panel; startWatch()
// = cheap cgroup poll that broadcasts a `sysinfo-alert` (amber ≥80% of the
// limit, red ≥92%) with the top RSS consumers, so the user can kill the
// culprit BEFORE the kernel kills everything.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// THE HUB HANDS ITS STARTER (B-360d, lane bl-keys-misc — the coordinator's r1020: GET /api/sysinfo held the hub's loop 62 ms in ONE
// turn while this module's programs were started by a FORK of the hub; src/server/child-starter.js B-91aa measured those forks on
// the owner's 4.5–5 GB hub). EVERY program this module starts goes through `runProgram`: the runner the hub hands (its starter in
// execFile's shape, child-starter.js execFileVia — the starter's words live THERE, hub-only, so the device agent's signed bundle
// keeps its bytes) else execFile from this process — the device agent hands none (its own small process, as the desktop belt's).
// The hub hands it in src/server/sysinfo-wiring.js create (where it wires these facts). → Promise<{ err, stdout }>
let _run = null;
function useStarter(run) { _run = typeof run === 'function' ? run : null; }
function runProgram(bin, args, { timeout = 8000, maxBuffer = 1024 * 1024 } = {}) {
  if (_run) return _run(bin, args, { timeout, maxBuffer });
  // r1666 (test-agentd-spawn-hide): the device agent runs console-less — its child is HIDDEN (a program named by a variable is no
  // POSIX tool the census can read by name; on Windows an unhidden console program opens a window per child)
  return new Promise((resolve) => { execFile(bin, args, { timeout, maxBuffer, encoding: 'utf8', windowsHide: true }, (err, stdout) => resolve({ err, stdout: String(stdout || '') })); });
}

// Container-aware memory: cgroup v2 → v1 → host meminfo. /sys reads are
// kernel-backed and never hang (unlike FUSE paths — safe to read sync).
//
// ⚠ WHAT "USED" MEANS (2.312.0, a fleet user's false 100% alarm): a cgroup's
// `memory.current` COUNTS THE PAGE CACHE. A pod that merely reads big files
// (transcripts, a dataset pass) parks tens of GB of reclaimable file cache
// there and sits pinned at the limit forever — memory.events showed `max 770`
// reclaim events and `oom_kill 0`, i.e. the kernel calmly reclaiming, while
// the panel screamed 100% and every process together held 2.7 GB. Reporting
// raw `current` is therefore not "conservative", it is WRONG: the number never
// falls, so the one alert that matters (a real leak) can never stand out.
// We report the WORKING SET (`current − inactive_file`) — the same definition
// kubectl top / cadvisor use and the one Kubernetes evicts on — and carry the
// raw + cache figures alongside so the UI can explain the difference.
// NOTE this is also what the REMOTE host probe already computed (MemTotal −
// MemAvailable, which excludes reclaimable cache): the local twin had drifted.
/** key→number over a "<key> <num>[ unit]" file — covers BOTH cgroup
 *  memory.stat ("anon 1659514880") and /proc/meminfo ("MemAvailable: 12 kB",
 *  aligned with spaces and unit-suffixed; a naive first-space split yields NaN
 *  there). Units are NOT converted — callers know their file. */
function memStat(file) {
  const m = new Map();
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const mm = /^(\S+?):?\s+(\d+)/.exec(line);
      if (mm) m.set(mm[1], Number(mm[2]));
    }
  } catch { }
  return m;
}

function memInfo() {
  try { // cgroup v2
    const raw = parseInt(fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8'), 10);
    const maxRaw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    const limit = maxRaw === 'max' ? 0 : parseInt(maxRaw, 10);
    if (Number.isFinite(raw)) {
      const st = memStat('/sys/fs/cgroup/memory.stat');
      const inactiveFile = st.get('inactive_file') || 0;
      const cache = st.get('file') || 0;
      const anon = st.get('anon') || 0;
      const used = Math.max(0, raw - inactiveFile);
      return { used, limit: limit || os.totalmem(), raw, cache, anon, source: 'cgroup2' };
    }
  } catch { }
  try { // cgroup v1
    const raw = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8'), 10);
    let limit = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8'), 10);
    if (!Number.isFinite(limit) || limit > os.totalmem() * 4) limit = 0; // "unlimited" sentinel
    if (Number.isFinite(raw)) {
      const st = memStat('/sys/fs/cgroup/memory/memory.stat');
      const inactiveFile = st.get('total_inactive_file') ?? st.get('inactive_file') ?? 0;
      const cache = st.get('total_cache') ?? st.get('cache') ?? 0;
      const anon = st.get('total_rss') ?? st.get('rss') ?? 0;
      const used = Math.max(0, raw - inactiveFile);
      return { used, limit: limit || os.totalmem(), raw, cache, anon, source: 'cgroup1' };
    }
  } catch { }
  // Bare host: os.freemem() also ignores reclaimable cache — prefer
  // MemAvailable, the kernel's own "can be handed out without swapping".
  const total = os.totalmem();
  const mi = memStat('/proc/meminfo'); // kB values
  const avail = (mi.get('MemAvailable') || 0) * 1024;
  const raw = total - os.freemem();
  return { used: avail ? Math.max(0, total - avail) : raw, limit: total, raw, source: 'host' };
}

// macOS has no /proc and no cgroups: the working-set analogue is vm_stat's
// active + wired + compressor pages (what the old remote SCRIPT computed —
// its interpretation moved here when the script became the fallback rung).
// Async because vm_stat is a child process; the sync memInfo() stays the
// cheap /sys path for the Linux watch loop.
function memInfoDarwin() {
  return new Promise((resolve) => {
    runProgram('sysctl', ['-n', 'hw.memsize', 'vm.pagesize'], { timeout: 4000 }).then(({ err: e1, stdout: out1 }) => {
      const [total, pageRaw] = String(out1 || '').split('\n').map((x) => parseInt(x, 10));
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 4096;
      if (e1 || !Number.isFinite(total) || !total) return resolve(null);
      runProgram('vm_stat', [], { timeout: 4000 }).then(({ err: e2, stdout: out2 }) => {
        if (e2) return resolve(null);
        let pages = 0;
        for (const ln of String(out2).split('\n')) {
          const m = /^Pages (active|wired down|occupied by compressor):\s+(\d+)/.exec(ln);
          if (m) pages += Number(m[2]);
        }
        resolve({ used: pages * page, limit: total, raw: pages * page, source: 'darwin' });
      });
    });
  });
}

async function memInfoAsync() {
  if (process.platform === 'darwin') {
    const d = await memInfoDarwin();
    if (d) return d;
  }
  return memInfo();
}

// THE BUFFER IS SIZED FOR A BUSY MACHINE, AND A FAILURE IS NEVER SILENT
// (2026-09-07, found by the release gate going red on this dev box). `ps aux`
// output is ~1.8 KB per process once command lines are long: measured here at
// **4,258,412 bytes for 2,404 processes**, i.e. PAST the old 4 MiB maxBuffer.
// Over that line execFile kills `ps`, both legs error, and the old code
// `resolve([])`d — so `read().procs` was EMPTY on exactly the machines whose
// process list matters, with no log, no error field and no way to tell "this
// box has no processes" from "we threw the answer away". That fed the System
// panel's top-process list AND the memory-pressure alert's "top: …" line,
// which is printed *because* the machine is under pressure. 64 MiB covers
// ~36k processes; past that the failure now SAYS SO (the degrade-gracefully
// lesson: a catch that logs the message verbatim is the only reason these are
// ever found). The full-table twin listProcs() below carries the same size.
const PS_MAX_BUFFER = 64 * 1024 * 1024;
function topProcs(n = 8) {
  return new Promise((resolve) => {
    runProgram('ps', ['aux', '--sort=-rss'], { timeout: 8000, maxBuffer: PS_MAX_BUFFER }).then(({ err, stdout: out }) => {
      const parse = (text) => text.split('\n').slice(1).filter(Boolean).map((ln) => {
        const f = ln.trim().split(/\s+/);
        // USER PID %CPU %MEM VSZ RSS TTY STAT START TIME CMD…
        return { pid: parseInt(f[1], 10), pcpu: parseFloat(f[2]) || 0, rss: (parseInt(f[5], 10) || 0) * 1024, cmd: f.slice(10).join(' ').slice(0, 400) };
      }).filter((p) => p.pid);
      if (!err) return resolve(parse(out).slice(0, n));
      // BSD ps (no --sort): sort ourselves
      runProgram('ps', ['aux'], { timeout: 8000, maxBuffer: PS_MAX_BUFFER }).then(({ err: e2, stdout: out2 }) => {
        if (e2) {
          console.warn(`[sysinfo] topProcs: both ps legs failed — process list will be EMPTY (${String(e2.message || e2).slice(0, 200)}; first leg: ${String(err.message || err).slice(0, 120)})`);
          return resolve([]);
        }
        resolve(parse(out2).sort((a, b) => b.rss - a.rss).slice(0, n));
      });
    });
  });
}

// ── Full process table (2.354.0, the btop-like process manager) ──
// ONE implementation for every machine: the server runs it for machine #0,
// the daemon bundles it and serves the `proc-list` op, and the ssh fallback
// rung runs the same `ps axo` line remotely with parsePsProcs() interpreting
// orchestrator-side — the columns and their meaning live HERE only.
const PS_COLUMNS = 'user=,pid=,ppid=,pcpu=,pmem=,rss=,stat=,etime=,args=';

/** Parse `ps axo ${PS_COLUMNS}` output: 8 whitespace fields + args rest.
 *  (unix usernames have no whitespace; stat/etime are single tokens) */
function parsePsProcs(text) {
  const rows = [];
  for (const ln of String(text || '').split('\n')) {
    const t = ln.trim();
    if (!t) continue;
    // drop OUR OWN probe (owner report: "永远有个ps在最顶端" at 200%): ps
    // lists itself, and its %CPU = lifetime-cpu / elapsed — a process alive
    // for ~10ms that burned ~20ms across threads reads as 200%, and its pid
    // is new every poll so the live-delta correction never applies. Matching
    // our exact column string hides only the probe (its `sh -c` wrapper on
    // the remote rung too), never a user's own `ps aux`.
    if (t.includes(PS_COLUMNS)) continue;
    const f = t.split(/\s+/);
    if (f.length < 9) continue;
    const pid = parseInt(f[1], 10);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    rows.push({
      user: f[0], pid, ppid: parseInt(f[2], 10) || 0,
      pcpu: parseFloat(f[3]) || 0, pmem: parseFloat(f[4]) || 0,
      rss: (parseInt(f[5], 10) || 0) * 1024, state: f[6], etime: f[7],
      cmd: f.slice(8).join(' ').slice(0, 400),
    });
  }
  return rows;
}

/** Transport cap: top-by-RSS ∪ top-by-CPU, so a CPU-sorted client still has
 *  the hot processes even when the table is truncated. CPU rank uses the
 *  LIVE sample when present (review-confirmed: ps %CPU is a lifetime average
 *  that shows 0.0 for a long-lived process that JUST started spinning — for
 *  a 10-day-old process it takes ~14min of burn to even reach 0.1, so ranking
 *  by it alone dropped exactly the runaway the panel exists to catch). */
function capProcs(all, max = 350) {
  max = Math.max(20, Math.min(2000, Math.floor(Number(max) || 350))); // clamp — a negative/fractional max breaks the slice math
  if (all.length <= max) return all;
  const cpu = (p) => Math.max(p.pcpu || 0, p.pcpuNow || 0);
  const byRss = [...all].sort((a, b) => b.rss - a.rss).slice(0, Math.floor(max * 0.75));
  const chosen = new Set(byRss.map((p) => p.pid));
  const byCpu = [...all].sort((a, b) => cpu(b) - cpu(a)).filter((p) => !chosen.has(p.pid)).slice(0, max - byRss.length);
  return byRss.concat(byCpu);
}

// Instantaneous CPU% (what btop shows; ps %CPU is a LIFETIME average that
// flatlines long-running processes): delta of /proc/<pid>/stat utime+stime
// between successive calls. Keyed pid:starttime so a recycled pid never
// inherits the old sample (the counter-capture class). /proc reads are
// kernel-backed and never hang (same justification as memInfo's /sys reads).
// First call has no baseline → callers fall back to ps %CPU; the 5s panel
// poll makes every later call a good sample. macOS/BSD: no /proc — ps only.
const _procCpu = new Map(); // 'pid:starttime' → { ticks, at }
/** PURE: one /proc/<pid>/stat line → { ticks: utime + stime, start: starttime } (null: not a stat line). The comm may hold
 *  spaces and parens: the fields are read after the LAST ')': [0]=state(3) … utime(14)→[11], stime(15)→[12], starttime(22)→[19] */
function statTicks(st) {
  const close = String(st).lastIndexOf(')');
  if (close < 0) return null;
  const rest = String(st).slice(close + 2).split(' ');
  return { ticks: (parseInt(rest[11], 10) || 0) + (parseInt(rest[12], 10) || 0), start: rest[19] };
}
// B-360d (lane bl-keys-misc, r1072 — measured on the test machine: the sample read /proc/<pid>/stat for EVERY row of the table,
// synchronously, 32–35 ms at the owner's 2 400 processes, every 5 s while the System panel is open): THE READS GO OFF THE LOOP —
// fs.promises in slices of SAMPLE_SLICE, each slice's answers parsed in one short turn. r1316 (the round's three smalls):
//   · ONE SAMPLE IN FLIGHT: two pages, or a page and a paired machine's poll, would interleave their slices over the one baseline
//     map (a row then reads 0 % or falls back): a second ask JOINS the flight that is out (its rows take the flight's shares by pid)
//   · A BOUND: the reads ride the file threadpool; a pool held behind a storage that stops replying never answers — past
//     SAMPLE_BOUND_MS the table goes out «not sampled» (as a failed read does), and the next ask joins that same flight (never one
//     more pending table each poll)
//   · THE INSTANT IS A SLICE'S: taken when that slice's reads have answered, so a busy pool in one sample and not the other skews
//     nothing
const SAMPLE_SLICE = 128;
const SAMPLE_BOUND_MS = 4000;
let _sampleFlight = null;
async function sampleRun(pids) {
  const seen = new Set(), live = new Map();
  for (let i = 0; i < pids.length; i += SAMPLE_SLICE) {
    const slice = pids.slice(i, i + SAMPLE_SLICE);
    const texts = await Promise.all(slice.map((pid) => fs.promises.readFile('/proc/' + pid + '/stat', 'utf8').catch(() => null)));   // null: exited between ps and the sample
    const now = Date.now();   // THE SLICE'S instant (r1316)
    for (let k = 0; k < slice.length; k++) {
      const t = texts[k] === null ? null : statTicks(texts[k]);
      if (!t) continue;
      const pid = slice[k], key = pid + ':' + t.start;
      seen.add(key);
      const prev = _procCpu.get(key);
      _procCpu.set(key, { ticks: t.ticks, at: now });
      // % of ONE core (btop convention — multithreaded may exceed 100)
      if (prev && now > prev.at) live.set(pid, Math.max(0, Math.round(((t.ticks - prev.ticks) / 100) / ((now - prev.at) / 1000) * 1000) / 10));
    }
  }
  if (_procCpu.size > 2000) for (const k of _procCpu.keys()) if (!seen.has(k)) _procCpu.delete(k);
  return live;
}
/** → Promise<boolean> (a live share was set on any row). A second ask JOINS the flight that is out; past `boundMs` it answers
 *  false (the table «not sampled») and the flight is left to end on its own. */
async function sampleProcCpu(rows, { boundMs = SAMPLE_BOUND_MS } = {}) {
  if (process.platform !== 'linux') return false;
  const flight = _sampleFlight || (_sampleFlight = sampleRun(rows.map((r) => r.pid)).finally(() => { _sampleFlight = null; }));
  let timer = null;
  const live = await Promise.race([flight, new Promise((resolve) => { timer = setTimeout(() => resolve(null), boundMs); if (timer.unref) timer.unref(); })]).finally(() => clearTimeout(timer));
  if (!live) return false;
  let any = false;
  for (const r of rows) { const v = live.get(r.pid); if (v !== undefined) { r.pcpuNow = v; any = true; } }
  return any;
}

/** The full table for the System panel's process manager.
 *  Returns { procs, total, sampled } — `sampled` says pcpuNow is live. */
function listProcs({ max = 350 } = {}) {
  return new Promise((resolve) => {
    // Same sizing story as topProcs above — measured 4,244,406 bytes for 2,404
    // processes here, which is half of the old 8 MiB: the cap is applied AFTER
    // parsing the whole table, so the WHOLE table has to fit.
    runProgram('ps', ['axo', PS_COLUMNS], { timeout: 8000, maxBuffer: PS_MAX_BUFFER }).then(async ({ err, stdout: out }) => {
      if (err) {
        console.warn(`[sysinfo] listProcs: ps failed — process table will be EMPTY (${String(err.message || err).slice(0, 200)})`);
        return resolve({ procs: [], total: 0, sampled: false, error: String(err.message || err).slice(0, 200) });
      }
      const all = parsePsProcs(out);
      // sample the WHOLE table BEFORE capping (review-confirmed ordering bug:
      // capping first meant both cap membership and sampling were chosen by
      // the flatlined lifetime %CPU, so a newly-hot low-RSS process on a
      // >max-proc machine never got sampled and never shipped; a full sweep
      // is ~7ms for ~1000 /proc stat reads)
      let sampled = false;
      try { sampled = await sampleProcCpu(all); } catch { sampled = false; }   // B-360d: its reads off the loop (the whole table, before the cap); a sample that fails never holds the answer
      const procs = capProcs(all, max);
      resolve({ procs, total: all.length, sampled });
    });
  });
}

function diskInfo(dir) {
  return new Promise((resolve) => {
    runProgram('df', ['-kP', dir], { timeout: 8000 }).then(({ err, stdout: out }) => {
      if (err) return resolve(null);
      const f = (out.split('\n')[1] || '').trim().split(/\s+/);
      const total = (parseInt(f[1], 10) || 0) * 1024, used = (parseInt(f[2], 10) || 0) * 1024;
      resolve(total ? { total, used, pct: Math.round(used / total * 100), path: dir } : null);
    });
  });
}

async function read(dataDir) {
  const mem = await memInfoAsync();
  const [disk, procs] = await Promise.all([diskInfo(dataDir || process.cwd()), topProcs()]);
  return {
    mem: { ...mem, pct: mem.limit ? Math.round(mem.used / mem.limit * 100) : 0 },
    load: os.loadavg().map((v) => Math.round(v * 100) / 100),
    cpus: os.cpus().length,
    disk,
    procs,
    ts: Date.now(),
  };
}

// ── Resource HISTORY (2.223.0, user request: the admin panel's CPU/memory
// charts, self-contained in the instance): every watch tick samples container
// CPU (cgroup usage delta → cores) + memory into two rings — 24h at the 45s
// cadence and 7d at 15min — persisted to data/sysinfo-history.json (atomic,
// debounced) so charts survive restarts. No Prometheus dependency: works on
// bare Docker/self-hosted the same as in the fleet.
let _cpuPrev = null; // { usec, at }
function cpuUsageUsec() {
  try { // cgroup v2
    const m = /usage_usec (\d+)/.exec(fs.readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8'));
    if (m) return Number(m[1]);
  } catch { }
  try { // cgroup v1 (ns)
    return Number(fs.readFileSync('/sys/fs/cgroup/cpuacct/cpuacct.usage', 'utf8')) / 1000;
  } catch { }
  try { // host fallback: aggregate cpu times (ms → usec)
    const cpus = os.cpus();
    let busy = 0;
    for (const c of cpus) busy += c.times.user + c.times.nice + c.times.sys + c.times.irq;
    return busy * 1000;
  } catch { return null; }
}
function sampleCpuCores() {
  const usec = cpuUsageUsec();
  const at = Date.now();
  if (usec == null) return null;
  const prev = _cpuPrev; _cpuPrev = { usec, at };
  if (!prev || usec < prev.usec || at <= prev.at) return null;
  return Math.round(((usec - prev.usec) / ((at - prev.at) * 1000)) * 100) / 100;
}
const _hist = { fine: [], coarse: [], loadedFrom: null }; // fine: 45s×24h, coarse: 15min×7d
const FINE_MAX = Math.ceil(24 * 3600 / 45), COARSE_MAX = Math.ceil(7 * 24 * 4);
let _histDirty = false, _histFile = null, _lastCoarseAt = 0;
function loadHistory(dataDir) {
  _histFile = path.join(dataDir, 'sysinfo-history.json');
  try {
    const d = JSON.parse(fs.readFileSync(_histFile, 'utf8'));
    if (Array.isArray(d.fine)) _hist.fine = d.fine.slice(-FINE_MAX);
    if (Array.isArray(d.coarse)) _hist.coarse = d.coarse.slice(-COARSE_MAX);
  } catch { }
}
// B-0248 step 2 unit 5 (lane bl-loop-b, 主开发 r4147): the history's temp, write and rename are THE STORE WRITER's, on its thread. The release
// wrote them ON THE LOOP every 5 minutes (about 100 KB, both rings), and on slow storage a rename holds the loop its whole delay (the page
// bl-loop-b/b0248-page.md, row 9). The bytes are made AT the write (the rings as they are then). At the hub's stop server.js asks it once
// more and the writer's exitFlush writes what is owed. THE WRITER IS HANDED IN (startWatch's `writer`, server.js; a suite's own as the
// argument), never required here: this module is in the device agent's bundle (src/agentd), and the store writer is the hub's alone.
// No writer handed: nothing is written (only the hub keeps a history on disk)
let _histWriter = null;
function persistHistory(writer = _histWriter) {
  if (!_histFile || !_histDirty || !writer) return;
  // the rings are no longer owed only once the writer TOOK them (unit 5's follow, r4231): a hand-over that throws leaves them owed
  try { writer.dirty(_histFile, { name: 'sysinfo-history.write', produce: () => JSON.stringify({ fine: _hist.fine, coarse: _hist.coarse }) }); _histDirty = false; } catch { }
}
let _lastLoopLag = 0; // most recent 500ms-drift sample, folded into history
function recordSample(mem, cores) {
  const pt = { t: Date.now(), m: mem.used, l: mem.limit, c: cores, e: _lastLoopLag };
  _hist.fine.push(pt);
  if (_hist.fine.length > FINE_MAX) _hist.fine.splice(0, _hist.fine.length - FINE_MAX);
  if (pt.t - _lastCoarseAt >= 15 * 60 * 1000) { // 15-min ring: max-mem + avg-cpu over the window
    const winFrom = pt.t - 15 * 60 * 1000;
    const win = _hist.fine.filter((x) => x.t >= winFrom);
    const cs = win.map((x) => x.c).filter((v) => v != null);
    _hist.coarse.push({
      t: pt.t, l: pt.l,
      m: Math.max(...win.map((x) => x.m), 0),
      c: cs.length ? Math.round(cs.reduce((a, b) => a + b, 0) / cs.length * 100) / 100 : null,
      e: Math.max(...win.map((x) => x.e || 0), 0), // worst loop lag in the window (B-bb68)
    });
    if (_hist.coarse.length > COARSE_MAX) _hist.coarse.splice(0, _hist.coarse.length - COARSE_MAX);
    _lastCoarseAt = pt.t;
  }
  _histDirty = true;
}
function history(rangeMs) {
  const from = Date.now() - rangeMs;
  // fine ring covers ≤24h; longer ranges serve the coarse ring
  const src = rangeMs <= 24 * 3600 * 1000 ? _hist.fine : _hist.coarse;
  return src.filter((p) => p.t >= from);
}

// Memory-pressure watch: amber ≥80%, red ≥92% of the container limit.
// Re-alerts on ESCALATION immediately, otherwise once per 30min per level;
// fully clears below 75% so a later climb alerts again.
// ── A PROCESS'S COMMAND-LINE HEAD (lane ledger-dedup-law F5, B-7f9e) ──
// The memory-pressure item said only "node" for the process that filled a fleet container: the admin's probe, exec'd into
// the pod from outside (`runuser` with ppid 0 → `bash -lc … | base64 -d | node`) — the one fact the owner needed. THE
// reader every surface names a process with: /proc/<pid>/cmdline (NUL-separated argv, ≤ CMDLINE_READ bytes read), secret
// shapes redacted (src/secret-shapes.js — the one rule), cut at CMDLINE_HEAD chars. null = gone / unreadable / no /proc.
const CMDLINE_HEAD = 120;
const CMDLINE_READ = 4096;
/** PURE: a cmdline file's bytes → its head (argv joined by spaces, control characters folded, secrets redacted, ≤ max). */
function cmdlineHeadOf(buf, max = CMDLINE_HEAD) {
  const raw = Buffer.from(buf || '').toString('utf8').replace(/\0+$/, '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (!raw) return null;
  const s = require('./secret-shapes.js').redactSecrets(raw).text;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
/** A process's command-line head (async; never throws) — see CMDLINE_HEAD. */
async function cmdlineHead(pid, { max = CMDLINE_HEAD, procDir = '/proc' } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  let fh;
  try { fh = await fs.promises.open(path.join(procDir, String(pid), 'cmdline'), 'r'); } catch { return null; }
  try { const buf = Buffer.alloc(CMDLINE_READ); const { bytesRead } = await fh.read(buf, 0, buf.length, 0); return cmdlineHeadOf(buf.subarray(0, bytesRead), max); }
  catch { return null; } finally { try { await fh.close(); } catch { } }
}

// lane hub-loop-stalls commit 3: THE LAG WATCH'S CURRENT LEVEL for the CPU capture's trigger (src/cpu-capture.js
// triggerVerdict) — {level, medianMs, at} of the last 3-min window, null before the window is full or without the watch
let _lagNow = null;
const loopLagNow = () => _lagNow;
function startWatch({ broadcast, dataDir, intervalMs = 45000, onSample = null, writer = null } = {}) {
  _histWriter = writer;   // B-0248 unit 5: the hub's store writer (persistHistory, above)
  let lastLevel = 0, lastAlertAt = 0;
  // ── Event-loop lag watch (2.235.0, userL "卡了2h但CPU不高" incident): the
  // ONE metric that caught that degradation was loop lag, and it lived only in
  // telemetry (visible after the fact). Sample drift every 500ms, keep a
  // 3-min window, alert on SUSTAINED degradation: median >300ms amber /
  // >800ms red (median, not max — a single big GC pause must not page anyone).
  // Same cooldown discipline as the memory watch.
  const lagWin = [];
  let lastLag = Date.now(), lagLevel = 0, lagAlertAt = 0;
  const lagT = setInterval(() => {
    const now = Date.now();
    const lag = Math.max(0, now - lastLag - 500);
    lastLag = now;
    lagWin.push({ t: now, lag });
    while (lagWin.length && lagWin[0].t < now - 3 * 60 * 1000) lagWin.shift();
    _lastLoopLag = lag; // picked up by recordSample into history
    if (lagWin.length < 60) return; // need a real window before judging
    const sorted = lagWin.map((x) => x.lag).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const level = med >= 800 ? 2 : med >= 300 ? 1 : 0;
    _lagNow = { level, medianMs: med, at: now };
    if (level === 0) { if (med < 150) lagLevel = 0; return; }
    const cooldown = level > lagLevel ? 0 : 30 * 60 * 1000;
    if (now - lagAlertAt < cooldown) return;
    lagAlertAt = now; lagLevel = level;
    console.warn(`[sysinfo] event-loop degradation: median lag ${med}ms over 3min (level ${level}) — the server thread is saturated (big parses / sync work), machine CPU% will NOT show this`);
    global.__vsEvent?.('evloop-degraded', { detail: `median ${med}ms level${level}` });
    broadcast?.({ type: 'sysinfo-alert', kind: 'evloop', level, lagMs: med });
  }, 500);
  lagT.unref?.();
  if (dataDir) loadHistory(dataDir);
  sampleCpuCores(); // prime the delta baseline
  const persistT = setInterval(persistHistory, 5 * 60 * 1000);
  persistT.unref?.();
  const t = setInterval(async () => {
    try {
      const mem = memInfo();
      recordSample(mem, sampleCpuCores());
      // lane browser-resource-care: the memory-pressure EPISODE (src/memory-pressure.js via src/server/memory-pressure-watch.js)
      // sees EVERY sample — its own hysteresis (on ≥ 90 %, off < 80 %), ONE For-you item per episode; the log line below stays
      if (typeof onSample === 'function') { try { onSample(mem); } catch { /* never into the watch */ } }
      const pct = mem.limit ? (mem.used / mem.limit) * 100 : 0;
      global.__vsMetric?.('srv-container-mem-pct', Math.round(pct));
      const level = pct >= 92 ? 2 : pct >= 80 ? 1 : 0;
      if (level === 0) { if (pct < 75) lastLevel = 0; return; }
      const cooldown = level > lastLevel ? 0 : 30 * 60 * 1000;
      if (Date.now() - lastAlertAt < cooldown) return;
      lastAlertAt = Date.now(); lastLevel = level;
      const procs = await topProcs(5);
      console.warn(`[sysinfo] memory pressure: ${Math.round(pct)}% of ${Math.round(mem.limit / 1073741824)}Gi (level ${level}) — top: ${procs.slice(0, 3).map((p) => `${Math.round(p.rss / 1048576)}M ${p.cmd.slice(0, 60)}`).join(' | ')}`);
      global.__vsEvent?.('memory-pressure', { detail: `${Math.round(pct)}% level${level}` });
      broadcast?.({ type: 'sysinfo-alert', level, pct: Math.round(pct), used: mem.used, limit: mem.limit, procs });
    } catch { }
  }, intervalMs);
  t.unref?.();
  return () => { clearInterval(t); clearInterval(lagT); clearInterval(persistT); persistHistory(); };
}

module.exports = { read, startWatch, loopLagNow, memInfo, memInfoAsync, history, persistHistory, loadHistory, recordSample, listProcs, parsePsProcs, capProcs, PS_COLUMNS, cmdlineHead, cmdlineHeadOf, CMDLINE_HEAD, useStarter, runProgram, sampleProcCpu, statTicks, SAMPLE_SLICE, SAMPLE_BOUND_MS };
