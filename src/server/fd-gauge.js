'use strict';
// THE FD GAUGE (lane-dead-bridge, ORCH over PURE src/fd-budget.js).
//
// Three duties, all read-only on procfs (never a mountpoint, never a spawn):
//   ① the BOOT LINE — the soft/hard limit this process really runs at (node
//     raises its own soft limit to the hard one at startup, so the unit's
//     `LimitNOFILESoft` is NOT it), the handles it holds, and the estimate
//     (fdBudget) for the work it restored;
//   ② THE GAUGE — /proc/self/fd counted every minute (async; readlink bounded
//     by SAMPLE_CAP), a server notice at ≥ 80 % of the soft limit at most once
//     an hour naming the holders by kind; it FALLS with the count;
//   ③ THE NAME OF AN EMFILE — a failed background write (session-status /
//     user-todos flush) or a crash hands its error here and gets ONE journal
//     line + (EMFILE/ENFILE) ONE notice an hour saying WHO ran out: this server,
//     the FUSE daemon of the mount the path lives on, or the machine.
const fs = require('fs');
const path = require('path');
const FB = require('../fd-budget.js');

function create({ serverNotice = null, log = console, procSelf = '/proc/self', now = () => Date.now(), sampleMs = FB.GAUGE_SAMPLE_MS } = {}) {
  const fdDir = path.join(procSelf, 'fd');
  const readText = (f) => { try { return fs.readFileSync(f, 'utf-8'); } catch { return ''; } };
  const available = (() => { try { fs.accessSync(fdDir); return true; } catch { return false; } })();
  // The last limits we could read: at a FULL table even /proc/self/limits cannot be opened (EMFILE), and that is
  // exactly when the numbers are needed. (A limit can change at runtime — prlimit — so it is re-read every time.)
  let lastLimits = null;
  const limits = () => { const l = FB.readLimits(readText(path.join(procSelf, 'limits'))); if (l.soft != null) { lastLimits = l; return l; } return lastLimits || l; };
  const FULL = new Set(['EMFILE', 'ENFILE']);
  let lastReportAt = null;    // the last notice a CLIENT received (verify r1: a notice nobody was there to see does not spend the hour — serverNotice's own rule, its return is the count)
  let lastJournalAt = null;   // the journal line's own hour
  let last = null;            // the last sample {at, total, kinds, topDirs, level, ratio}
  let timer = null;
  const reported = new Map(); // `${code}|${mount}` → last notice instant a CLIENT received (≤ 1/hour each)
  const journaled = new Map(); // `${code}|${mount}` → the journal line's own hour

  /** A synchronous COUNT only (readdir of procfs — used by the crash path, where nothing may await). When the
   *  readdir itself is refused with EMFILE, THIS process's table is full (procfs is never a FUSE daemon): the
   *  count IS the soft limit — the one moment the gauge must not go blind. */
  function countNow() {
    try { return fs.readdirSync(fdDir).length; }
    catch (e) { if (e && FULL.has(e.code)) { const { soft } = limits(); return Number.isFinite(soft) ? soft : null; } return null; }
  }

  /** One sample: the count (all fds) + the kinds of the first SAMPLE_CAP. */
  async function sample() {
    if (!available) return null;
    let names;
    try { names = await fs.promises.readdir(fdDir); }
    catch (e) {
      if (!(e && FULL.has(e.code))) return null;
      const { soft } = limits();   // no handle left even to list them: the table is full
      return Number.isFinite(soft) ? { at: now(), total: soft, sampled: 0, kinds: {}, topDirs: [], refused: e.code } : null;
    }
    const pick = names.slice(0, FB.SAMPLE_CAP);
    const targets = [];
    for (let i = 0; i < pick.length; i += 256) {
      const batch = pick.slice(i, i + 256);
      const got = await Promise.all(batch.map((n) => fs.promises.readlink(path.join(fdDir, n)).catch(() => '')));
      for (const t of got) if (t) targets.push(t);
    }
    const t = FB.tallyKinds(targets);
    return { at: now(), total: names.length, sampled: pick.length, kinds: t.kinds, topDirs: t.topDirs };
  }

  async function tick() {
    const s = await sample();
    if (!s) return null;
    const { soft } = limits();
    const v = FB.gaugeVerdict({ count: s.total, soft, now: s.at, lastReportAt });
    last = { ...s, soft, level: v.level, ratio: v.ratio };
    if (v.report) {
      const w = FB.gaugeWords({ count: s.total, soft, kinds: s.kinds, topDirs: s.topDirs, refused: !!s.refused });
      if (!(lastJournalAt != null && s.at - lastJournalAt < FB.GAUGE_REARM_MS)) { lastJournalAt = s.at; try { log.warn?.(`[fd] ${w.text}`); } catch { } }
      let delivered = 1;   // a notice sink that answers no count is taken as heard
      try { const d = serverNotice?.(`fd-gauge:${Math.floor(s.at / FB.GAUGE_REARM_MS)}`, w.text, { level: 2, i18n: w.i18n }); if (typeof d === 'number') delivered = d; } catch { }
      if (delivered > 0) lastReportAt = s.at;   // nobody connected ⇒ said again at the next sample, not an hour later
    }
    return last;
  }

  /** ① the boot line. `work` = {sessions, clients, streams} for the estimate. */
  function bootLine(work = {}) {
    const { soft, hard } = limits();
    const count = countNow();
    const est = FB.fdBudget(work);
    const lim = soft == null ? 'unknown here (no /proc)' : `soft ${soft} / hard ${hard}`;
    const line = `[fd] open-files limit: ${lim} (node raises its soft limit to the hard one at start — the unit's LimitNOFILESoft is not what it runs at); open now: ${count == null ? '?' : count}; estimate for ${work.sessions || 0} session(s): ${est.total} (${est.rows.filter((r) => r.n).map((r) => `${r.what} ${r.n}`).join(', ')})`;
    try { log.log?.(line); } catch { }
    return { soft, hard, count, estimate: est.total, line };
  }

  /** ③ name an EMFILE/ENFILE (or any write error) for a path. SYNC (procfs
   *  only), so the crash path can call it. Returns the blame. */
  function blame(err, file) {
    const code = err && err.code;
    const { soft } = limits();
    const mount = file ? FB.mountOf(path.resolve(String(file)), readText(path.join(procSelf, 'mountinfo'))) : null;
    return { ...FB.emfileBlame({ code, path: file || null, ownCount: countNow(), soft, mount }), code, mount };
  }

  /** A background write failed (the store keeps its data and retries): ONE
   *  journal line + for EMFILE/ENFILE ONE notice an hour per (code, mount). */
  function reportWriteError(err, file, { failures = 1, retryMs = null } = {}) {
    const b = blame(err, file);
    const key = `${b.code}|${b.mount ? b.mount.target : '-'}`;
    const at = now();
    const jPrev = journaled.get(key);
    if (!(jPrev != null && at - jPrev < FB.GAUGE_REARM_MS) || failures === 1) {   // `!= null`: an instant of 0 is an instant
      journaled.set(key, at);
      try { log.warn?.(`[fd] a background write failed (${b.code || (err && err.message)}; attempt ${failures}${retryMs ? `, retrying in ${Math.round(retryMs / 1000)} s` : ''}) — ${b.words}`); } catch { }
    }
    const prev = reported.get(key);
    const fresh = !(prev != null && at - prev < FB.GAUGE_REARM_MS);
    if (fresh && (b.code === 'EMFILE' || b.code === 'ENFILE')) {
      let delivered = 1;
      try { const d = serverNotice?.(`fd-blame:${key}:${Math.floor(at / FB.GAUGE_REARM_MS)}`, b.words, { level: 2, ...(b.i18n ? { i18n: b.i18n } : {}) }); if (typeof d === 'number') delivered = d; } catch { }
      if (delivered > 0) reported.set(key, at);   // verify r1: a notice nobody received is tried again at the next failed write
    }
    return b;
  }

  function start() {
    if (!available || timer) return false;
    timer = setInterval(() => { tick().catch(() => { }); }, sampleMs);
    timer.unref?.();
    return true;
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  return { available, limits, countNow, sample, tick, bootLine, blame, reportWriteError, start, stop, lastSample: () => last };
}

module.exports = { create };
