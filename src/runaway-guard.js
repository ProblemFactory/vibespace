'use strict';
/**
 * THE RESOURCE VERDICT — ONE module every process keeper judges by, TWO
 * outcomes (2026-09-25; docs/design-agent-browser-v2 §3.5 / docs/design-
 * desktop-apps §2: the keepers SHARE one guard "instead of each inventing a
 * set").
 *
 * PURE: imports only the constants home (src/keeper-limits.js). The server,
 * the daemon bundle and the browser bundle (the panels' memory label) can all
 * carry it.
 *
 * WHY (the Chrome desktop-app incident, 2026-09-25 00:03 UTC): the verdict
 * lived in THREE verbatim copies (src/desktop-apps.js, src/browser-profiles.js,
 * an inline one in src/opencode-serve.js) and every copy compared
 * `sample.rssBytes` — a SUM of VmRSS over the set — with a footprint ceiling,
 * and every keeper STOPPED what crossed it. The owner launched Google Chrome
 * as a desktop app; 3 s after `ready` the keeper logged "RSS 2.0 GB (limit
 * 2.0 GB)" over 25 processes, stopped it, removed its profile and parked
 * chromium for an hour. Measured on the same box: 891 chrome pids ΣVmRSS
 * 94.67 GB vs ΣPss 15.09 GB vs ΣRssAnon 21.74 GB; one process Rss 240 MB vs
 * Pss 73 MB. The owner's ruling (verbatim): "不是就算是单一内存2G也不好啊，
 * chrome这么吃内存，完全可能超过这个量吧。这个keeper到底是干啥的，没必要别乱加
 * 会影响使用的feature" — a ceiling on an app a PERSON is using is wrong even
 * with an honest metric.
 *
 * SO THE VERDICT ONLY SAYS WHETHER A SAMPLE IS OVER; WHAT A KEEPER DOES WITH
 * IT IS THE KEEPER'S POLICY:
 *   · a HEADLESS service the product runs for itself (the OpenCode serve —
 *     the 2.369.42 incident: nobody watched it burn 209 CPU-min / 5 GB /
 *     30k inotify watches) ⇒ STOP + PARK (src/opencode-serve.js);
 *   · a session a person or an agent is USING (a desktop app, an agent
 *     browser) ⇒ REPORT ONLY: the live row, a notice when a crossing begins
 *     (`reportTransition` — with hysteresis and a per-session floor, r2),
 *     telemetry — never a stop, a park or a delete.
 * test-architecture's census holds both: the thresholds are compared only
 * here, and no keeper but opencode-serve stops or parks for a resource.
 *
 * THE MEMORY RULE: judged by the sample's `memBytes` in the metric it names
 * (`memMetric`): 'pss' (smaps_rollup — each shared page counted once across
 * the set) or 'anon' (RssAnon+RssShmem of ONE process — the fallback where
 * smaps_rollup is unreadable). A sample whose metric is 'rss' or 'anon-sum'
 * (RssAnon+RssShmem summed over several processes: copy-on-write and shared
 * memory counted once per sharer — measured +51 % over ΣPss on 889 chrome
 * pids) is NOT judged on memory at all (`memGuard: 'unavailable'`): a
 * per-process sum over a set is never compared with a footprint limit again. The CPU rule is unchanged (the
 * sample's cpuTicks already carry the 2026-09-14 reaped-ticks rule — a set
 * counts own + reaped work, desktop-display.sessionSample).
 */
const LIMITS = require('./keeper-limits');

/** The metric names a sentence speaks (never translated: they are units). */
const MEM_METRIC_LABELS = Object.freeze({ pss: 'PSS', anon: 'anon+shm', 'anon-sum': 'anon+shm, summed per process', rss: 'summed RSS' });
/** The metrics a footprint limit may be compared with. */
const JUDGED_METRICS = Object.freeze(['pss', 'anon']);
/** The browser families whose normal floor is higher than a serve's (§3.5:
 *  measured 6 processes / 420–667 MB PSS per idle chromium). A desktop-app
 *  browser row (B-bfe6 `rec.browser`) and the browser keeper's chromium
 *  provider are REPORTED by the same numbers. */
const BROWSER_GUARD_KINDS = Object.freeze(['chromium', 'firefox']);

const gb = (b) => (b / 2 ** 30).toFixed(1);

/** "6.2 GB (PSS)" / "412 MB (anon+shm)" / '' — the ONE spelling of a memory
 *  reading (the notices, the desktop-app chip, the Browser panel). */
function memoryText(memBytes, memMetric) {
  if (!Number.isFinite(memBytes)) return '';
  const n = memBytes >= 2 ** 30 ? `${gb(memBytes)} GB` : `${Math.round(memBytes / 1048576)} MB`;
  const l = MEM_METRIC_LABELS[memMetric];
  return l ? `${n} (${l})` : n;
}

/** Per-PROVIDER thresholds: a browser family gets the browser floor (3 GiB,
 *  250 % CPU); anything else the shared numbers. */
function providerGuard(provider, limits = LIMITS) {
  const base = { ...(limits || LIMITS) };
  if (BROWSER_GUARD_KINDS.includes(provider)) return { ...base, GUARD_MEM_BYTES: 3 * 1024 * 1024 * 1024, GUARD_CPU_PCT: 250 };
  return base;
}

/** THE ONE PLACE a keeper learns which thresholds judge a RECORD: a record
 *  that runs a browser (the desktop-app keeper's `rec.browser`) gets the
 *  browser numbers; every other record the shared ones. Never an app-id
 *  literal in a keeper. */
function guardFor(rec, limits = LIMITS) {
  const kind = rec && typeof rec.browser === 'string' ? rec.browser : null;
  return kind ? providerGuard(kind, limits) : { ...(limits || LIMITS) };
}

/**
 * ONE resource sample. `sample` = `{ cpuTicks, memBytes, memMetric, … }` read
 * now (null = no evidence), `prev` = `{ at, cpuTicks }` from the previous
 * tick (or null), `hotSince` = when sustained-hot began (0 = not hot).
 * Returns `{ cpuPct, hotSince, over, overKind, hotMin, memGuard, clear }`:
 *   over     — null, or the sentence ("memory (PSS) 6.2 GB (limit 2.0 GB)" /
 *              "280% CPU sustained for 5 min (limit 150%)")
 *   overKind — 'memory' | 'cpu' | null (hotMin = the CPU crossing's minutes)
 *   memGuard — 'pss' | 'anon' (the metric the memory rule judged) |
 *              'unavailable' (not judged: the sample's metric is a summed RSS
 *              or absent) | null (no sample)
 *   clear    — the report level's RE-ARM fact (r2 hysteresis): memory under
 *              REPORT_REARM_FRACTION of the threshold (or not judged) AND
 *              CPU not hot; null with no sample
 */
function resourceVerdict(sample, prev, hotSince, now, { clkTck = 100, limits = LIMITS } = {}) {
  if (!sample) return { cpuPct: null, hotSince: 0, over: null, overKind: null, hotMin: null, memGuard: null, clear: null };
  const L = limits || LIMITS;
  let cpuPct = null;
  if (prev && now > prev.at) cpuPct = (sample.cpuTicks - prev.cpuTicks) * 100000 / clkTck / (now - prev.at);
  const metric = sample.memMetric;
  const memGuard = JUDGED_METRICS.includes(metric) && Number.isFinite(sample.memBytes) ? metric : 'unavailable';
  let over = null, overKind = null, hotMin = null;
  let hot = hotSince || 0;
  if (memGuard !== 'unavailable' && sample.memBytes > L.GUARD_MEM_BYTES) {
    over = `memory (${MEM_METRIC_LABELS[metric]}) ${gb(sample.memBytes)} GB (limit ${gb(L.GUARD_MEM_BYTES)} GB)`; overKind = 'memory';
  } else if (cpuPct !== null && cpuPct > L.GUARD_CPU_PCT) {
    if (!hot) hot = now;
    if (now - hot >= L.GUARD_CPU_SUSTAIN_MS) { over = `${cpuPct.toFixed(0)}% CPU sustained for ${Math.round((now - hot) / 60000)} min (limit ${L.GUARD_CPU_PCT}%)`; overKind = 'cpu'; hotMin = Math.round((now - hot) / 60000); }
  } else hot = 0;
  const rearm = Number.isFinite(L.REPORT_REARM_FRACTION) ? L.REPORT_REARM_FRACTION : LIMITS.REPORT_REARM_FRACTION;
  const memClear = memGuard === 'unavailable' || sample.memBytes < rearm * L.GUARD_MEM_BYTES;
  const clear = !over && memClear && !hot;
  return { cpuPct, hotSince: hot, over, overKind, hotMin, memGuard, clear };
}

/**
 * THE REPORT LEVEL (report-only keepers). A notice fires when `over` BEGINS
 * (`fire`: the keeper logs, records telemetry and files the notice) — and,
 * r2 (2026-09-25, the oscillation review: a reading hovering across the line
 * filed a fresh notice every second sample, 5 in 10 one-minute ticks):
 *   · HYSTERESIS — after a notice the level re-arms only once
 *     REPORT_REARM_SAMPLES samples IN A ROW read `clear` (memory under
 *     REPORT_REARM_FRACTION × the threshold, CPU not hot); an over sample or
 *     a merely-under one resets the run;
 *   · A FLOOR — a new crossing inside REPORT_NOTICE_FLOOR_MS of the previous
 *     notice waits (the level stays armed; the first over sample past the
 *     floor fires);
 *   · DELIVERY (`notify` / `reportDelivery`) — server.js's notice answers
 *     how many clients it reached and latches its key only on > 0 (the r5
 *     rule); a crossing nobody saw (0 — a restart with no browser connected)
 *     is `pending`, and the next sample STILL over re-sends the SAME key
 *     (`notify` without `fire`: no second log / telemetry). A reading back
 *     under drops a pending notice: it would describe a state that ended.
 * `state` = `{ reported, crossings, lastFireAt, clearRun, pending }` (in
 * memory, never persisted — a level, not a park: nothing about it outlives
 * the session or a restart). A missing sample (no evidence) changes nothing.
 * `opts` = `{ now, limits }` (no `now` ⇒ no floor). Returns `{ state, fire,
 * notify }`; `state.crossings` numbers the crossing (the notice key's
 * suffix — the server's notice keys dedupe per boot).
 */
function reportTransition(state, verdict, { now, limits = LIMITS } = {}) {
  const L = limits || LIMITS;
  const pick = (k) => (Number.isFinite(L[k]) ? L[k] : LIMITS[k]);
  const s = { reported: !!(state && state.reported), crossings: (state && state.crossings) || 0, lastFireAt: state && Number.isFinite(state.lastFireAt) ? state.lastFireAt : null, clearRun: (state && state.clearRun) || 0, pending: !!(state && state.pending) };
  if (!verdict || verdict.memGuard === null) return { state: s, fire: false, notify: false };
  if (verdict.over) {
    s.clearRun = 0;
    if (s.reported) return { state: s, fire: false, notify: s.pending };
    if (Number.isFinite(now) && s.lastFireAt !== null && now - s.lastFireAt < pick('REPORT_NOTICE_FLOOR_MS')) return { state: s, fire: false, notify: false };
    return { state: { reported: true, crossings: s.crossings + 1, lastFireAt: Number.isFinite(now) ? now : s.lastFireAt, clearRun: 0, pending: false }, fire: true, notify: true };
  }
  s.pending = false;
  s.clearRun = verdict.clear ? s.clearRun + 1 : 0;
  if (s.reported && s.clearRun >= pick('REPORT_REARM_SAMPLES')) s.reported = false;
  return { state: s, fire: false, notify: false };
}

/** The keeper's answer from the notice: `delivered` = what server.js's
 *  serverNotice returned. Exactly 0 = nobody saw it ⇒ `pending` (the next
 *  sample still over re-sends the same key); anything else (a count, or no
 *  answer from an unwired/older notice) = said. */
function reportDelivery(state, delivered) {
  return { ...(state || {}), pending: delivered === 0 };
}

/** The report notice: "Google Chrome is using 6.2 GB (PSS) — Stop it from
 *  the Desktop panel if that is not what you expect" / "… has been using 280%
 *  CPU for 5 min — …". `who` = the session's name, `where` = the panel that
 *  holds its Stop. */
function resourceNoticeText({ who, where, verdict, sample }) {
  const tail = ` — Stop it from the ${where} if that is not what you expect`;
  if (verdict && verdict.overKind === 'cpu') {
    const pct = Number.isFinite(verdict.cpuPct) ? Math.round(verdict.cpuPct) : '?';
    return `${who} has been using ${pct}% CPU for ${Math.max(1, Number(verdict.hotMin) || 1)} min${tail}`;
  }
  return `${who} is using ${memoryText(sample && sample.memBytes, sample && sample.memMetric) || 'a lot of memory'}${tail}`;
}

/** The keeper's once-per-session line when the memory rule cannot run. */
function memGuardOffLine(label, sample) {
  const rec = sample && Number.isFinite(sample.memBytes) && MEM_METRIC_LABELS[sample.memMetric] ? memoryText(sample.memBytes, sample.memMetric) : (sample && Number.isFinite(sample.rssBytes) ? memoryText(sample.rssBytes, 'rss') : '');
  return `${label}: memory is not judged for this session — /proc/<pid>/smaps_rollup (PSS) was not readable for every process, and a per-process sum over several processes (VmRSS, or RssAnon+RssShmem) is never compared with a footprint limit${rec ? ` (${rec}, recorded only)` : ''}; CPU is still judged`;
}

module.exports = { resourceVerdict, reportTransition, reportDelivery, resourceNoticeText, memoryText, providerGuard, guardFor, memGuardOffLine, MEM_METRIC_LABELS, JUDGED_METRICS, BROWSER_GUARD_KINDS };
