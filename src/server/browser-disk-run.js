'use strict';
/**
 * lane browser-disk-sample (B-5fab): THE BROWSER DISK SAMPLE — the ORCH half of src/browser-disk.js. Every NAMED profile
 * on THIS machine is measured by ONE bounded child `du -sk <dir>` (DISK_DU_TIMEOUT_MS, SIGKILL on timeout), one child at
 * a time, never two profiles in the same minute, every 15 min per profile and at its browser's start / stop (debounced);
 * the event loop never walks a directory. The verdict is runaway-guard's diskVerdict and the report rides the memory
 * footprint's machinery: reportTransition (one notice per profile per episode, the re-arm hysteresis, the hourly floor),
 * reportDelivery (a notice that was not filed is filed again on the next sample still over). The notice is ONE For-you
 * item naming the profile, the size, the limit, the top 3 subdirectories (a second `du -sk` child, only when a notice
 * is filed) and the remedy. REPORT ONLY: nothing here stops a browser or deletes a file.
 * A paired machine's profile is never measured from here: `sampleDir({dir, hostId})` answers `disk_not_measured`
 * (the browser-serve op can carry hostId later).
 */
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const D = require('../browser-disk.js');
const RG = require('../runaway-guard.js');
const LIMITS = require('../keeper-limits.js');

function createDiskSampler({ profiles = () => [], userTodos = null, limits = LIMITS, log = console, now = Date.now, execFileImpl = execFile, timeoutMs = D.DISK_DU_TIMEOUT_MS, onChange = null } = {}) {
  let step = D.diskSampleStep(null, { type: 'tick', ids: [] }, now()).state;
  const facts = new Map();     // profileId → the last answer {state, bytes?, partial?, why?, at}
  const lastOk = new Map();    // profileId → the last MEASURED {bytes, at} (growthOf's prev; the row keeps it through an unknown)
  const reports = new Map();   // profileId → { report (reportTransition's state), noticeId }
  const unknownSaid = new Map(); // profileId → when its unknown was last logged (once per hour)
  let timer = null, inFlight = Promise.resolve();

  const localRows = () => (profiles() || []).filter((p) => p && p.id && p.dir && !p.host);
  /** ONE `du -sk` child, bounded — never throws: {code, signal, timedOut, stdout, stderr, spawnError}. */
  function du(args) {
    return new Promise((resolve) => {
      try {
        execFileImpl('du', ['-sk', '--', ...args], { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
          resolve({ code: err ? (Number.isInteger(err.code) ? err.code : null) : 0, signal: (err && err.signal) || null, timedOut: !!(err && err.killed), stdout: String(stdout || ''), stderr: String(stderr || ''), spawnError: err && typeof err.code === 'string' ? err.code : null });
        });
      } catch (e) { resolve({ code: null, signal: null, timedOut: false, stdout: '', stderr: '', spawnError: (e && e.code) || 'spawn failed' }); }
    });
  }
  /** One directory → {state:'ok', bytes, partial} | {state:'unknown', why} | {state:'not-measured', code, why}. */
  async function sampleDir({ dir, hostId = null }) {
    if (hostId) return { state: 'not-measured', code: 'disk_not_measured', why: 'its folder is on a paired machine' };
    try { await fsp.stat(dir); } catch (e) { if (e && e.code === 'ENOENT') return { state: 'ok', bytes: 0, partial: false, missing: true }; }
    return D.duVerdict(await du([dir]), dir);
  }
  /** The top 3 of one profile's entries (Chrome's Default/ listed by its children) — the SECOND child, only for a notice. */
  async function topOf(dir) {
    let names = [];
    try { names = (await fsp.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
    const expand = new Set(D.expandNames(names));
    const args = [];
    for (const n of names) {
      if (!expand.has(n)) { args.push(path.join(dir, n)); continue; }
      try { for (const e of await fsp.readdir(path.join(dir, n), { withFileTypes: true })) if (e.isDirectory()) args.push(path.join(dir, n, e.name)); } catch { args.push(path.join(dir, n)); }
    }
    if (!args.length) return [];
    const r = await du(args);
    if (r.timedOut || r.signal || r.spawnError) return [];
    return D.topDirs(D.parseDu(r.stdout), dir);
  }
  function fileNotice(p, verdict, top, growth, at) {
    const rep = reports.get(p.id);
    if (!userTodos || typeof userTodos.add !== 'function') { log.warn?.(`[browser] ${p.id} "${p.label}": ${verdict.over} — no For-you store is wired, so only this journal says so`); return 0; }
    // a restart forgets reportTransition's state: an open notice of this profile is ADOPTED, never filed twice
    try { const open = typeof userTodos.forSession === 'function' ? userTodos.forSession('browser') : []; const had = (open || []).find((i) => i.kind === 'notice' && String(i.text || '').startsWith(D.diskNoticeHead(p.label))); if (had) { rep.noticeId = had.id; return 1; } } catch { /* the plain add below */ }
    const n = D.diskNotice({ label: p.label, verdict, top, growth, at, limits });
    try {
      const it = userTodos.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', text: n.text, detail: n.detail, sessionName: 'Agent browser' });
      rep.noticeId = it && typeof it.id === 'string' ? it.id : null;
      return 1;
    } catch (e) { log.warn?.(`[browser] ${p.id} "${p.label}": the disk notice was not filed (${e && e.message}) — filed again on the next sample still over`); return 0; }
  }
  function resolveNotice(p) {
    const rep = reports.get(p.id);
    if (!rep || !rep.noticeId || !userTodos || typeof userTodos.setStatus !== 'function') return;
    try { const it = typeof userTodos.get === 'function' ? userTodos.get(rep.noticeId) : null; if (!it || it.status === 'open') userTodos.setStatus(rep.noticeId, 'done', 'agent'); } catch { /* gone already */ }
    rep.noticeId = null;
  }
  /** Measure ONE profile, judge it, report it. */
  async function measure(id) {
    const p = localRows().find((x) => x.id === id);
    if (!p) return;
    const at = now();
    const m = await sampleDir({ dir: p.dir, hostId: p.host || null });
    if (!localRows().some((x) => x.id === id)) return; // removed meanwhile
    facts.set(id, { ...m, at });
    if (m.state !== 'ok') {
      const said = unknownSaid.get(id);
      if (!Number.isFinite(said) || at - said >= D.DISK_UNKNOWN_LOG_MS) { unknownSaid.set(id, at); log.warn?.(`[browser] ${id} "${p.label}": its folder's size is not known — ${m.why} (said once per hour; tried again on schedule)`); }
      onChange?.(id);
      return;
    }
    const prev = lastOk.get(id) || null, next = { bytes: m.bytes, at };
    lastOk.set(id, next);
    const verdict = RG.diskVerdict(m.bytes, { limits });
    if (!reports.has(id)) reports.set(id, { report: null, noticeId: null });
    const rep = reports.get(id);
    const lvl = RG.reportTransition(rep.report, verdict, { now: at, limits }); rep.report = lvl.state;
    if (lvl.fire) log.warn?.(`[browser] ${id} "${p.label}": ${verdict.over} — reported, nothing stopped or deleted`);
    if (lvl.notify) {
      const top = await topOf(p.dir);
      rep.report = RG.reportDelivery(rep.report, fileNotice(p, verdict, top, D.growthOf(prev, next), at));
    }
    if (!verdict.over && verdict.clear) resolveNotice(p); // it shrank: the notice is no longer true
    onChange?.(id);
  }
  function apply(ev) {
    const r = D.diskSampleStep(step, ev, now());
    step = r.state;
    if (!r.sample) return null;
    const id = r.sample.id;
    inFlight = measure(id).catch((e) => log.warn?.(`[browser] ${id}: the disk sample failed: ${e && e.message}`)).finally(() => { step = D.diskSampleStep(step, { type: 'done', id }, now()).state; });
    return inFlight;
  }
  /** The minute clock's pass (also the suite's door): the profiles to keep, then at most one sample. */
  function pass() { return apply({ type: 'tick', ids: localRows().map((p) => p.id) }); }
  /** A browser started / stopped: one more sample (debounced to one per minute per profile). Named local profiles only. */
  function event(id, kind) { if (localRows().some((p) => p.id === id)) apply({ type: kind === 'stop' ? 'stop' : 'start', id }); }
  /** THE disk fact of a profile record (GET /api/browser/profiles rows, the panel row). */
  function diskOf(p) {
    if (!p) return null;
    const m = facts.get(p.id) || null;
    return D.diskFact({ measured: m, last: lastOk.get(p.id) || null, hostId: p.host || null, dir: p.dir || null, limits });
  }
  function start() { if (timer) return; timer = setInterval(() => { pass(); }, D.DISK_SLOT_MS); if (timer.unref) timer.unref(); }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  return { pass, event, diskOf, sampleDir, start, stop, settled: () => inFlight, _state: () => step };
}

module.exports = { createDiskSampler };
