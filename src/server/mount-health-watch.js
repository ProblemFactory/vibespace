'use strict';
/**
 * lane fuse-canary-notice (B-b327): the I/O half of src/mount-health.js (PURE). The threadpool canary
 * (src/server/fs-canary.js) hands every answered probe to onProbe(); MH.canaryStep decides the EPISODE.
 *   · at its start: ONE For-you item (origin `server`, lane browser-resource-care's "This machine" row) naming the
 *     mountpoint, the strikes, the processes pressing it with who started each (memory-pressure-watch's ownerIds →
 *     memory-pressure attribute(), shared — never a second attribution), and what the server paused;
 *   · while it is on: paused(kind, paths) is THE gate the server's own scans ask (usage-history scan + its walk's
 *     onBudget, the /api/sessions discovery sweep's schedule) — MH.shouldPause answers per kind; a person's read is
 *     never paused. A journal line per pause (first ask of a kind) and per resume;
 *   · at its end: the item resolves itself and the journal says "the mount <mp> answers again — N s wedged".
 * The process table is read by a CHILD (this file, --suspects): /proc reads in the server would queue behind the very
 * threadpool the canary says is wedged — spawning needs no pool thread.
 */
const fs = require('fs');
const { execFile } = require('child_process');
const MH = require('../mount-health.js');

const INBOX_KEY = 'mount-health';
const SCAN_TIMEOUT_MS = 15000;
const SCAN_MAX_BUFFER = 64 * 1024 * 1024;
const FD_READS_PER_PROC = 2048;
const FD_READS_TOTAL = 200000;
const ARGV_KEEP = 12;
const KEEP_ARG_RE = /^--(vibespace-keeper=|remote-debugging|user-data-dir=|type=)/;

/** SYNC /proc walk — run ONLY in the child (`node mount-health-watch.js --suspects <mp>`). Bounded: FD_READS_PER_PROC
 *  fd links per process, FD_READS_TOTAL overall; a process we may not read keeps its pid/ppid/comm. */
function scanProc(mountpoint, { procDir = '/proc', perProc = FD_READS_PER_PROC, total = FD_READS_TOTAL } = {}) {
  const out = [];
  let budget = total;
  let pids = [];
  try { pids = fs.readdirSync(procDir).filter((n) => /^\d+$/.test(n)); } catch { return out; }
  for (const d of pids) {
    const pid = +d;
    let comm = '', ppid = 0;
    try { const st = fs.readFileSync(`${procDir}/${d}/stat`, 'utf8'); const i = st.lastIndexOf(')'); comm = st.slice(st.indexOf('(') + 1, i); ppid = +st.slice(i + 2).split(' ')[1] || 0; } catch { continue; }
    let argv = [];
    try { argv = fs.readFileSync(`${procDir}/${d}/cmdline`, 'utf8').split('\0').filter(Boolean); } catch { }
    argv = argv.filter((a, i) => i < ARGV_KEEP || KEEP_ARG_RE.test(a)).map((a) => a.slice(0, 300));
    let cwd = null;
    try { cwd = fs.readlinkSync(`${procDir}/${d}/cwd`); } catch { }
    let fdHits = 0;
    try {
      for (const fd of fs.readdirSync(`${procDir}/${d}/fd`).slice(0, perProc)) {
        if (budget-- <= 0) break;
        try { if (MH.underMount(fs.readlinkSync(`${procDir}/${d}/fd/${fd}`), mountpoint)) fdHits++; } catch { }
      }
    } catch { }
    out.push({ pid, ppid, comm, argv, cwd: cwd && MH.underMount(cwd, mountpoint) ? cwd : null, fdHits });
  }
  return out;
}

function childScan(mountpoint) {
  return new Promise((resolve) => {
    execFile(process.execPath, [__filename, '--suspects', mountpoint], { timeout: SCAN_TIMEOUT_MS, maxBuffer: SCAN_MAX_BUFFER }, (err, out) => {
      if (err) return resolve([]);
      try { resolve(JSON.parse(String(out))); } catch { resolve([]); }
    });
  });
}

function readMountinfo() { try { return fs.readFileSync('/proc/self/mountinfo', 'utf8'); } catch { return ''; } } // procfs, once at boot
function realOf(file) { try { return fs.realpathSync(file); } catch { return file; } }

function create({ file, mountpoint = null, getUserTodos = () => null, ownerIds = async () => ({}), procTable = childScan, log = console, mountinfo = readMountinfo } = {}) {
  const mp = mountpoint || MH.mountOf(mountinfo(), realOf(file)) || '/';
  let state = null;
  let itemId = null;
  let filing = null;
  const pausedNow = new Set();
  const counts = { strikes: 0, clean: 0, episodes: 0, filed: 0, resolved: 0, paused: {}, ran: {} };

  async function open(episode) {
    let suspects = [];
    try { const procs = await procTable(mp); suspects = MH.suspectsOf(procs, mp, await ownerIds(procs)); } catch (e) { log.warn?.(`[mount-health] who presses ${mp}: not read — ${e && e.message}`); }
    const it = MH.canaryItem({ mountpoint: mp, strikes: state.count, latencyMs: state.worstMs, suspects, pausing: MH.PAUSE_KINDS });
    if (!state.on || state.episode !== episode) return; // the episode ended while the table was read: nothing to say
    const todos = getUserTodos && getUserTodos();
    if (todos) {
      try { const r = todos.add(INBOX_KEY, { origin: 'server', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Storage', text: it.text, detail: it.detail, i18n: it.i18n }); itemId = (r && (r.id || (r.item && r.item.id))) || null; counts.filed++; }
      catch (e) { log.warn?.(`[mount-health] ${mp}: the For-you item was not filed — ${e && e.message}`); }
    }
    log.warn?.(`[mount-health] ${mp} wedged (episode ${episode}, ${state.count} strikes): For-you item ${itemId ? 'filed' : 'NOT filed'}, ${suspects.length} process groups press it; the server's own scans pause on it`); // never the item's words (record-clear census)
  }
  function close(wedgedMs) {
    const todos = getUserTodos && getUserTodos();
    if (todos && itemId) { try { if (todos.get(itemId) && todos.get(itemId).status === 'open') { todos.setStatus(itemId, 'done', 'agent'); counts.resolved++; } } catch { /* the owner cleared it */ } }
    itemId = null;
    const skipped = [...pausedNow].map((k) => `${k} ${counts.paused[k] || 0}`).join(', ') || 'none asked';
    log.warn?.(`[mount-health] ${MH.canaryEndLine({ mountpoint: mp, wedgedMs })} — resumed the server's own scans (skipped: ${skipped})`);
    pausedNow.clear();
  }
  /** One answered canary probe ({strike, at, ms}) → the episode step (never throws into the canary). */
  function onProbe(probe) {
    const r = MH.canaryStep(state, probe);
    state = r.state;
    if (probe && probe.strike) counts.strikes++; else counts.clean++;
    if (r.open) { counts.episodes++; filing = open(state.episode).catch((e) => log.warn?.(`[mount-health] ${e && e.message}`)); }
    if (r.close) close(r.wedgedMs);
    return r;
  }
  /** THE gate a scan asks: true ⇒ skip this run (its own schedule tries again). `paths` = the scan's roots. */
  function paused(kind, paths = null) {
    const v = MH.shouldPause(kind, { on: !!(state && state.on), mountpoint: mp }, paths);
    if (!v) { counts.ran[kind] = (counts.ran[kind] || 0) + 1; return false; }
    counts.paused[kind] = (counts.paused[kind] || 0) + 1;
    if (!pausedNow.has(kind)) { pausedNow.add(kind); log.warn?.(`[mount-health] paused ${kind} on ${mp} until it answers`); }
    return true;
  }
  return { onProbe, paused, counts, mountpoint: mp, settled: () => filing || Promise.resolve(), state: () => ({ ...(state || {}), itemId }) };
}

if (require.main === module && process.argv[2] === '--suspects') process.stdout.write(JSON.stringify(scanProc(process.argv[3] || '/')));

module.exports = { create, scanProc, INBOX_KEY, SCAN_TIMEOUT_MS };
