'use strict';
/**
 * lane browser-resource-care (B-afeb): the I/O half of src/memory-pressure.js (PURE). Two duties, both report-only —
 * nothing here ever stops a process:
 *   · onSample(mem) — every sysinfo watch sample (45 s): MP.pressureStep decides the EPISODE; at its start ONE For-you
 *     item (origin `server`) names the top process groups by ΣPss with who started each, the RAM-backed /tmp's usage and
 *     its largest roots; at its end the item resolves itself.
 *   · scanOwnChrome() — every OWN_CHROME_SCAN_MS: a Chrome with a debugging port and no `--vibespace-keeper` mark under a
 *     conversation's process tree is that conversation's OWN Chrome; the conversation is TOLD once per launch burst
 *     (session-status notice kind `browser-own-chrome`, free, at its next turn).
 * Every read is async (ps, /proc/<pid>/smaps_rollup, du, statfs) — the server loop never waits on a process table.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const MP = require('../memory-pressure.js');

const INBOX_KEY = 'memory-pressure';
const OWN_CHROME_SCAN_MS = 5 * 60 * 1000;
const OWN_CHROME_RETELL_MS = 30 * 60 * 1000;
const PSS_READS = 300;            // PSS for the largest processes by RSS; the rest count their RSS (said: "(RSS)")
const TMP_ROOT_RE = /^(vs-|cdp-prof-|agent-browser-chrome-)/;
const TMPFS_MAGIC = 0x01021994;
const PS_MAX_BUFFER = 64 * 1024 * 1024;

function psTable() {
  return new Promise((resolve) => {
    execFile('ps', ['axo', 'pid=,ppid=,rss=,comm=,args='], { timeout: 15000, maxBuffer: PS_MAX_BUFFER }, (err, out) => {
      if (err) return resolve([]);
      const rows = [];
      for (const ln of String(out).split('\n')) {
        const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/.exec(ln);
        if (m) rows.push({ pid: +m[1], ppid: +m[2], rss: +m[3] * 1024, pss: +m[3] * 1024, approx: true, comm: m[4], args: m[5].slice(0, 4000) });
      }
      resolve(rows);
    });
  });
}
async function withPss(rows, n = PSS_READS) {
  const top = [...rows].sort((a, b) => b.rss - a.rss).slice(0, n);
  await Promise.all(top.map(async (p) => {
    try { const t = await fs.promises.readFile(`/proc/${p.pid}/smaps_rollup`, 'utf8'); const m = /^Pss:\s+(\d+)\s+kB/m.exec(t); if (m) { p.pss = +m[1] * 1024; p.approx = false; } } catch { /* gone or unreadable: RSS stands */ }
  }));
  return rows;
}
function du(paths, timeout = 20000) {
  if (!paths.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    execFile('du', ['-s', '-B1', '--', ...paths], { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      resolve(String(out || '').split('\n').map((l) => /^(\d+)\s+(.+)$/.exec(l)).filter(Boolean).map((m) => ({ path: m[2], bytes: +m[1] })));
    });
  });
}
async function tmpfsOf(dir = '/tmp') {
  try { const s = await fs.promises.statfs(dir); if (s.type !== TMPFS_MAGIC) return null; return { mount: dir, size: s.blocks * s.bsize, used: (s.blocks - s.bfree) * s.bsize }; } catch { return null; }
}
/** The largest /tmp roots by family (`vs-ar-*` → one row): the 400 newest matching entries, summed per family. */
async function tmpRoots(dir = '/tmp') {
  let names = [];
  try { names = (await fs.promises.readdir(dir)).filter((n) => TMP_ROOT_RE.test(n)); } catch { return []; }
  const sized = await du(names.slice(-400).map((n) => path.join(dir, n)));
  const fam = new Map();
  for (const r of sized) { const f = path.join(dir, path.basename(r.path).replace(/[-_.][0-9a-zA-Z]{4,}(-[0-9a-f]{4,})*$/, '') + '*'); fam.set(f, (fam.get(f) || 0) + r.bytes); }
  return [...fam.entries()].map(([p, bytes]) => ({ path: p, bytes })).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
}

function create({ activeSessions, BUFFERS_DIR, getUserTodos, getSessionStatus, sessionStatusKey, jobsWiringOf = () => null, getKeeper = () => null, getApps = () => [], log = console } = {}) {
  let state = { on: false, episode: 0, since: null, peak: 0 };
  let itemId = null;
  const told = new Map(); // conversation id → { pids:Set, at }

  async function sessionRoots({ files = true } = {}) {
    const out = [];
    for (const [id, s] of activeSessions || []) {
      if (!s || s.host || s._dialDeviceId) continue;
      const name = s.name || s.webuiName || id;
      if (Number.isInteger(s._childPid)) out.push({ pid: s._childPid, name, id });
      if (files) try { const m = JSON.parse(await fs.promises.readFile(path.join(BUFFERS_DIR, id + '.json'), 'utf8')); if (Number.isInteger(m.pid)) out.push({ pid: m.pid, name, id }); } catch { /* no meta */ }
    }
    return out;
  }
  function jobRoots() {
    const jw = jobsWiringOf(); const jm = jw && typeof jw.getJobs === 'function' ? jw.getJobs() : null; const out = [];
    try { for (const j of (jm && jm.jobs ? jm.jobs.values() : [])) if (j && j.proc && Number.isInteger(j.proc.pid)) out.push({ pid: j.proc.pid, name: j.name || j.id }); } catch { /* none */ }
    return out;
  }
  function keeperMarks(procs) {
    const k = getKeeper(); const marks = {};
    for (const p of procs) {
      const m = MP.markOf(p); if (!m || marks[m]) continue;
      let label = m, holders = [];
      try { const pr = k && k.profile ? k.profile(m) : null; if (pr && pr.label) label = pr.label; } catch { /* label = mark */ }
      try { holders = (k && k.leasesOn ? k.leasesOn(m) : []).map((l) => { const s = activeSessions && activeSessions.get(l.sessionId); return (s && (s.name || s.webuiName)) || l.sessionId; }).filter(Boolean); } catch { holders = []; }
      marks[m] = { label, holders };
    }
    return marks;
  }
  async function groupsNow({ pss = true } = {}) {
    let procs = await psTable();
    if (pss) procs = await withPss(procs);
    const ids = await ownerIds(procs, { files: true });
    return { procs, sessions: ids.sessions, groups: MP.attribute(procs, ids) };
  }
  /** WHO started what — attribute()'s owner roots. `files: false` (lane fuse-canary-notice) reads no session meta file:
   *  a wedged mount's episode must not queue behind the pool it is reporting. */
  async function ownerIds(procs, { files = false } = {}) {
    return { sessions: await sessionRoots({ files }), jobs: jobRoots(), apps: (() => { try { return getApps() || []; } catch { return []; } })(), keepers: keeperMarks(procs) };
  }

  async function open(pct, mem) {
    const [{ groups }, tmpfs, roots] = await Promise.all([groupsNow(), tmpfsOf('/tmp'), tmpRoots('/tmp')]);
    const it = MP.pressureItem({ pct, used: mem.used, limit: mem.limit, groups, tmpfs, roots });
    const todos = getUserTodos && getUserTodos();
    if (todos) {
      try { const r = todos.add(INBOX_KEY, { origin: 'server', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Memory', text: it.text, detail: it.detail, i18n: it.i18n }); itemId = (r && (r.id || (r.item && r.item.id))) || null; }
      catch (e) { log.warn?.(`[sysinfo] memory pressure: the For-you item was not filed — ${e && e.message}`); }
    }
    for (const g of groups) if (g.kind === 'own-chrome') await tell(g); // the item says they were told
    log.warn?.(`[sysinfo] memory pressure episode ${state.episode}: ${Math.round(pct)}% — For-you item ${itemId ? 'filed' : 'NOT filed'}, ${groups.length} process groups`); // never the item's words (record-clear census)
  }
  function close() {
    const todos = getUserTodos && getUserTodos();
    if (todos && itemId) { try { if (todos.get(itemId) && todos.get(itemId).status === 'open') todos.setStatus(itemId, 'done', 'agent'); } catch { /* the owner cleared it */ } }
    itemId = null;
  }
  /** One sysinfo sample → the episode step (never throws into the watch). */
  function onSample(mem) {
    const r = MP.pressureStep(state, { used: mem && mem.used, limit: mem && mem.limit, at: Date.now() });
    state = r.state;
    if (r.open) open(r.pct, mem).catch((e) => log.warn?.(`[sysinfo] memory pressure: ${e && e.message}`));
    if (r.close) close();
    return r;
  }

  async function tell(g) {
    const sid = (() => { for (const [id, s] of activeSessions || []) if (s && (s.name || s.webuiName || id) === g.name) return [id, s]; return null; })();
    if (!sid) return false;
    const [id, s] = sid;
    const pids = new Set(g.chromes || []);
    const prev = told.get(id);
    const fresh = [...pids].filter((p) => !prev || !prev.pids.has(p));
    if (!fresh.length || (prev && Date.now() - prev.at < OWN_CHROME_RETELL_MS)) { if (prev) for (const p of pids) prev.pids.add(p); return false; }
    const onTmp = [];
    for (const d of g.dirs || []) { if (await tmpfsOf(d)) onTmp.push(d); }
    const sized = await du(onTmp.slice(0, 5), 10000);
    const bytes = sized.length ? sized.reduce((a, b) => a + b.bytes, 0) : null;
    const text = MP.ownChromeNotice({ count: pids.size, dirs: g.dirs || [], tmpfsDirs: onTmp, bytes });
    const st = getSessionStatus && getSessionStatus();
    try { st.pushNotice(sessionStatusKey(s, id), { kind: MP.NOTICE_KIND, text, at: Date.now() }, { replaceKind: true }); } catch (e) { log.warn?.(`[browser] ${id}: the own-Chrome note was not queued — ${e && e.message}`); return false; }
    told.set(id, { pids: new Set([...(prev ? prev.pids : []), ...pids]), at: Date.now() });
    return true;
  }
  async function scanOwnChrome() {
    const { groups } = await groupsNow({ pss: false });
    let n = 0;
    for (const g of groups) if (g.kind === 'own-chrome' && await tell(g)) n++;
    return n;
  }
  const t = setInterval(() => { scanOwnChrome().catch(() => {}); }, OWN_CHROME_SCAN_MS);
  t.unref?.();
  return { onSample, scanOwnChrome, ownerIds, stop: () => clearInterval(t), state: () => ({ ...state, itemId }) };
}

module.exports = { create, INBOX_KEY, OWN_CHROME_SCAN_MS, OWN_CHROME_RETELL_MS, tmpRoots, tmpfsOf };
