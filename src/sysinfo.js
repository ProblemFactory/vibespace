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

// Memory-pressure watch: amber ≥80%, red ≥92% of the container limit.
// Re-alerts on ESCALATION immediately, otherwise once per 30min per level;
// fully clears below 75% so a later climb alerts again.
function startWatch({ broadcast, dataDir, intervalMs = 45000 } = {}) {
  let lastLevel = 0, lastAlertAt = 0;
  const t = setInterval(async () => {
    try {
      const mem = memInfo();
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
  return () => clearInterval(t);
}

module.exports = { read, startWatch, memInfo };
