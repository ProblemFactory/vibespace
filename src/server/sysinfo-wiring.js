'use strict';
// SYSINFO WIRING (decomposition #3): the remote machine snapshot ladder —
// device op first, ssh script fallback. Extracted verbatim; `hosts` arrives
// lazily (created later in boot order). ORCH tier.
const sysinfo = require('../sysinfo');

function create({ getHosts }) {
  const hostsProxy = new Proxy({}, { get: (_, k) => { const h = getHosts(); return typeof h[k] === 'function' ? h[k].bind(h) : h[k]; } });
  const hosts = hostsProxy;
// Remote machine snapshot for the System panel's machine switcher.
// ONE IMPLEMENTATION (2.314.0, CS separation — this was a missed twin-set):
// the daemon bundles src/sysinfo.js and the `sysinfo` op runs it ON the
// machine, so local and remote share one interpretation of "used memory"
// (working set). The interpretation had already drifted once between the two
// copies — the local panel read raw memory.current (page cache included) and
// pinned at a false 100% while this script correctly used MemTotal −
// MemAvailable. The script below is now only the FALLBACK RUNG for
// daemon-less ssh hosts; its raw-host semantics (MemTotal = limit, no
// cgroup awareness) are the fallback's known limitation, not the contract.
// History stays LOCAL-only — the sampler runs in this server.
const REMOTE_SYSINFO_SCRIPT = `
U=$(uname)
if [ "$U" = Darwin ]; then
  T=$(sysctl -n hw.memsize 2>/dev/null)
  P=$(sysctl -n vm.pagesize 2>/dev/null || echo 4096)
  W=$(vm_stat 2>/dev/null | awk -v p="$P" '/Pages (active|wired down|occupied by compressor)/ {gsub("\\\\.","",$NF); s+=$NF} END {print s*p}')
  echo "MEM \${W:-0} \${T:-0}"
  echo "LOAD $(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}')"
  echo "CPUS $(sysctl -n hw.ncpu 2>/dev/null)"
  df -k "$HOME" 2>/dev/null | tail -1 | awk '{print "DISK", $3*1024, ($3+$4)*1024}'
  ps ax -o rss=,pid=,command= 2>/dev/null | sort -k1,1 -rn | head -8 | sed 's/^ */PROC /'
else
  awk '/MemTotal/{t=$2*1024} /MemAvailable/{a=$2*1024} END{print "MEM", t-a, t}' /proc/meminfo
  echo "LOAD $(cut -d' ' -f1-3 /proc/loadavg)"
  echo "CPUS $(nproc 2>/dev/null || echo 1)"
  df -k "$HOME" 2>/dev/null | tail -1 | awk '{print "DISK", $3*1024, ($3+$4)*1024}'
  ps ax -o rss=,pid=,args= --sort=-rss 2>/dev/null | head -8 | sed 's/^ */PROC /'
fi`;
async function remoteSysinfo(hostId) {
  const h = hosts.get(hostId);
  if (!h) throw new Error('unknown machine');
  // Ladder: device op (the shared module, run where the facts live) → ssh
  // script (daemon-less hosts) — the per-op fallback pattern every other
  // device op follows. Capability-gated: an old daemon is never asked.
  try {
    const dm = await hosts.deviceBounded(hostId, 6000);
    const r = await dm.sysinfo();
    if (r?.mem) return { host: hostId, ...r };
  } catch { /* fall through to the ssh script */ }
  const out = await hosts._hostShell(h, REMOTE_SYSINFO_SCRIPT, { timeoutMs: 8000 });
  const r = { host: hostId, procs: [] };
  for (const line of String(out).split('\n')) {
    const m = line.match(/^([A-Z]+) (.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'MEM') { const [u, t] = v.trim().split(/\s+/).map(Number); if (t > 0) r.mem = { used: u, limit: t, pct: Math.round(u / t * 100) }; }
    else if (k === 'DISK') { const [u, t] = v.trim().split(/\s+/).map(Number); if (t > 0) r.disk = { used: u, total: t, pct: Math.round(u / t * 100) }; }
    else if (k === 'LOAD') { const l = v.trim().split(/\s+/).slice(0, 3).filter(Boolean); if (l.length) r.load = l; }
    else if (k === 'CPUS') { const n = parseInt(v, 10); if (n > 0) r.cpus = n; }
    else if (k === 'PROC') { const pm = v.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); if (pm && r.procs.length < 8) r.procs.push({ rss: Number(pm[1]) * 1024, pid: Number(pm[2]), cmd: pm[3].slice(0, 400) }); }
  }
  if (!r.mem && !r.load && !r.procs.length) throw new Error('probe returned nothing usable');
  return r;
}
  return { sysinfo, remoteSysinfo };
}
module.exports = { create };
