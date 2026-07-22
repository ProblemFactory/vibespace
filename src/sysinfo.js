// System info + memory-pressure watch (2.216.0 — lengyue's instance was
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

// Container-aware memory: cgroup v2 → v1 → host meminfo. /sys reads are
// kernel-backed and never hang (unlike FUSE paths — safe to read sync).
function memInfo() {
  try { // cgroup v2
    const used = parseInt(fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8'), 10);
    const maxRaw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    const limit = maxRaw === 'max' ? 0 : parseInt(maxRaw, 10);
    if (Number.isFinite(used)) return { used, limit: limit || os.totalmem(), source: 'cgroup2' };
  } catch { }
  try { // cgroup v1
    const used = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8'), 10);
    let limit = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8'), 10);
    if (!Number.isFinite(limit) || limit > os.totalmem() * 4) limit = 0; // "unlimited" sentinel
    if (Number.isFinite(used)) return { used, limit: limit || os.totalmem(), source: 'cgroup1' };
  } catch { }
  return { used: os.totalmem() - os.freemem(), limit: os.totalmem(), source: 'host' };
}

function topProcs(n = 8) {
  return new Promise((resolve) => {
    execFile('ps', ['aux', '--sort=-rss'], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      const parse = (text) => text.split('\n').slice(1).filter(Boolean).map((ln) => {
        const f = ln.trim().split(/\s+/);
        // USER PID %CPU %MEM VSZ RSS TTY STAT START TIME CMD…
        return { pid: parseInt(f[1], 10), pcpu: parseFloat(f[2]) || 0, rss: (parseInt(f[5], 10) || 0) * 1024, cmd: f.slice(10).join(' ').slice(0, 160) };
      }).filter((p) => p.pid);
      if (!err) return resolve(parse(out).slice(0, n));
      // BSD ps (no --sort): sort ourselves
      execFile('ps', ['aux'], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (e2, out2) => {
        if (e2) return resolve([]);
        resolve(parse(out2).sort((a, b) => b.rss - a.rss).slice(0, n));
      });
    });
  });
}

function diskInfo(dir) {
  return new Promise((resolve) => {
    execFile('df', ['-kP', dir], { timeout: 8000 }, (err, out) => {
      if (err) return resolve(null);
      const f = (out.split('\n')[1] || '').trim().split(/\s+/);
      const total = (parseInt(f[1], 10) || 0) * 1024, used = (parseInt(f[2], 10) || 0) * 1024;
      resolve(total ? { total, used, pct: Math.round(used / total * 100), path: dir } : null);
    });
  });
}

async function read(dataDir) {
  const mem = memInfo();
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
function persistHistory() {
  if (!_histFile || !_histDirty) return;
  _histDirty = false;
  try {
    const tmp = _histFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ fine: _hist.fine, coarse: _hist.coarse }));
    fs.renameSync(tmp, _histFile);
  } catch { }
}
function recordSample(mem, cores) {
  const pt = { t: Date.now(), m: mem.used, l: mem.limit, c: cores };
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
function startWatch({ broadcast, dataDir, intervalMs = 45000 } = {}) {
  let lastLevel = 0, lastAlertAt = 0;
  if (dataDir) loadHistory(dataDir);
  sampleCpuCores(); // prime the delta baseline
  const persistT = setInterval(persistHistory, 5 * 60 * 1000);
  persistT.unref?.();
  const t = setInterval(async () => {
    try {
      const mem = memInfo();
      recordSample(mem, sampleCpuCores());
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
  return () => { clearInterval(t); clearInterval(persistT); persistHistory(); };
}

module.exports = { read, startWatch, memInfo, history, persistHistory };
