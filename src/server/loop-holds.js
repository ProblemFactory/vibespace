'use strict';
/**
 * THE MAIN THREAD'S BOOK OF HOLDS (lane hub-loop-stalls). The watchdog thread (src/server/sync-fs-witness-worker.js)
 * measures a hold while it lasts — the scheduler's facts and the JavaScript frames — and hands them here when the loop
 * turns again (`onHold`). This side adds what only the main thread knows, and nothing here can hold it:
 *   · THE MEMORY on every hold line: heap used / the heap's limit / external (v8 heap statistics — no syscall) and the
 *     RSS the watchdog read (law B's fallback, as the law itself words it: «if it costs more, say so and print the
 *     heap's size at resume instead»).
 *   · THE COLLECTIONS — OFF by default (`observeGc`). A `gc` PerformanceObserver costs nothing measurable in CPU (on/off
 *     0.9995 under allocation churn, both Node versions) but on Node 24 NEAR THE HEAP LIMIT it alone makes the process
 *     abort out of memory with a third less data (the check's ramp: step 17–20 against 28–29 without it; Node 22 28 both
 *     ways — lane dir probe/oombisect.cjs; the beat, the heap reading, the utilization timer and the thread change
 *     nothing). Turned on, it keeps every collection ≥ GC_MIN_MS in a small ring and a hold names the ones inside it.
 *   · THE LOOP'S UTILIZATION (performance.eventLoopUtilization): a snapshot every ELU_EVERY_MS; the last 10 s, the last
 *     minute and since start in the report; «the loop was N % busy in the minute before» on every hold line.
 * Then ONE [loop-hold] line in the journal (PURE src/loop-hold.js holdLine), telemetry srv-loop-hold-ms (detail: the
 * verdict · the frame — the formatter's words only), a ring of RING_KEEP holds and THE SINCE-START TABLE keyed by
 * (verdict, top repo frame): count, total held, worst — TABLE_KEYS keys, the rest folded into «other», in memory only.
 * GET /api/loop-holds (the owner's cookie — every /api/ path outside auth.js's doors), ⚙ Diagnostics «Main loop held»
 * and the incident bundle's server section read report().
 */
const v8 = require('v8');
const { performance, PerformanceObserver } = require('perf_hooks');
const LH = require('../loop-hold.js');
const { pressBearer } = require('../write-origin.js');   // law G: the owner's cookie only — no agent, job or automation bearer, also with sign-in off

const ELU_EVERY_MS = 5000;
/** every length from the monotonic clock (the watchdog's own); the wall clock only dates what a person reads */
const mono = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
const ELU_KEEP = 16;     // > 60 s of snapshots
const GC_KEEP = 400;

function create({ log = console, record = () => {}, now = mono, wallNow = () => Date.now(), gcMinMs = LH.GC_MIN_MS, ringKeep = LH.RING_KEEP, tableKeys = LH.TABLE_KEYS,
  heap = () => { const h = v8.getHeapStatistics(); return { heapUsed: h.used_heap_size, heapLimit: h.heap_size_limit, external: h.external_memory }; },
  elu = (a, b) => performance.eventLoopUtilization(a, b), observeGc = false, samplingState = () => ({}), eluEveryMs = ELU_EVERY_MS, eluBeforeMs = 60000, askProfile = null, profileMs = LH.PROFILE_MS, readProfile = () => null, lostAfterMs = 30000,
  debuggerNow = () => false,
  // round 4: the heap that FILLS — the old generation against its own limit (src/loop-hold.js heapFillOf), not heap_size_limit
  heapFill = () => LH.heapFillOf({ stats: v8.getHeapStatistics(), spaces: v8.getHeapSpaceStatistics(), argv: LH.nodeArgv(), nodeMajor: Number(process.versions.node.split('.')[0]) }) } = {}) {
  const perfToMono = mono() - performance.now();   // a gc entry's startTime (this thread's performance clock) on the monotonic clock
  const ring = [], table = new Map(), gc = [], snaps = [];
  const counts = { holds: 0, sampled: 0, boot: 0, lost: 0 };   // lost = holds the watchdog's ring could not keep (said in its line, counted here)
  let obs = null, timer = null;
  if (observeGc) {
    try {
      obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!(e.duration >= gcMinMs)) continue;
          gc.push({ at: perfToMono + e.startTime, ms: e.duration, kind: e.detail ? e.detail.kind : e.kind });
          if (gc.length > GC_KEEP) gc.splice(0, gc.length - GC_KEEP);
        }
      });
      obs.observe({ entryTypes: ['gc'] });
    } catch { obs = null; }
  }
  const snap = () => { try { snaps.push({ at: now(), u: elu() }); if (snaps.length > ELU_KEEP) snaps.shift(); } catch { } };
  snap();
  timer = setInterval(snap, eluEveryMs); timer.unref?.();
  /** the loop's utilization between the snapshot nearest `from` (at or before it) and the one ≈ windowMs earlier */
  function eluWindow(at, windowMs) {
    let end = null, start = null;
    for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].at <= at) { end = snaps[i]; break; }
    if (!end) return null;
    for (const s of snaps) if (s.at <= end.at - windowMs + eluEveryMs / 2) start = s;
    if (!start || start === end) return null;
    try { return elu(end.u, start.u).utilization; } catch { return null; }
  }
  function eluNow() {
    let cur = null; try { cur = elu(); } catch { }
    const back = (ms) => { const t = now() - ms; let s = null; for (const x of snaps) if (x.at <= t + eluEveryMs / 2) s = x; return s; };
    const since = (s) => { if (!cur || !s) return null; try { return elu(cur, s.u).utilization; } catch { return null; } };
    return { last10s: since(back(10000)), lastMinute: since(back(60000)), sinceStart: cur ? cur.utilization : null };
  }

  /** holds the main thread's ring dropped before the watchdog read them (round 4: counted, never silent) */
  function onLost(n) { if (Number.isInteger(n) && n > 0) counts.lost += n; }
  function onHold(facts) {
    if (!facts || !(facts.ms >= 0)) return null;
    const h = { ...facts, gc: obs ? gc : null };
    try { h.mem = { ...heap(), rss: facts.d && facts.d.rss != null ? facts.d.rss : null }; } catch { h.mem = null; }
    h.eluBefore = eluWindow(h.fromM != null ? h.fromM : now(), eluBeforeMs);
    h.fold = LH.foldHold(h);
    h.line = LH.holdLine(h);
    const pub = LH.publicHold(h);
    ring.push(pub); if (ring.length > ringKeep) ring.splice(0, ring.length - ringKeep);
    LH.tableAdd(table, h.fold, h.ms, tableKeys);   // keyed by (verdict, the frame's LOCATION): one function, one row
    counts.holds++; if (h.fold.inside) counts.sampled++; if (h.boot) counts.boot++;
    try { log.warn?.(h.line); } catch { }
    try { record({ kind: 'metric', name: 'srv-loop-hold-ms', value: Math.round(h.ms), detail: `${h.fold.verdict} · ${h.fold.frame}` }); } catch { }
    return pub;
  }

  // law L: the profile a person presses — ONE at a time, kept in memory (the last result). Its END costs the main thread
  // nothing: the watchdog writes the result into a shared slot and says the line itself; it is read here only when
  // someone asks (`settleProfile`, from report()). A refusal is answered AT THE PRESS — the debugger read at the press
  // itself, the watchdog checked before anything answers «running»; a watchdog that died ends a running profile AT ONCE as
  // «lost — the watchdog thread stopped» (and, without a word from it, lostAfterMs past its end).
  let profile = { running: null, last: null };
  const watchdogAlive = () => { let st = {}; try { st = samplingState() || {}; } catch { st = {}; } return st.watchdog !== false; };
  const lost = () => { profile = { running: null, last: LH.profileOf({ refused: 'lost', startedAt: profile.running.startedAt, endedAt: wallNow() }) }; };
  function settleProfile() {
    let r = null; try { r = readProfile(); } catch { r = null; }
    if (r) { profile = { running: null, last: LH.profileOf(r) }; return; }
    if (profile.running && (!watchdogAlive() || now() > profile.running.untilM + lostAfterMs)) lost();
  }
  const REFUSALS = { off: 'sampling_off', debugger: 'debugger_attached', heap: 'heap_near_limit', unknown: 'setting_unknown', inspector: 'no_inspector' };
  let hasInspector = true; try { require('inspector'); } catch { hasInspector = false; }   // round 4: no inspector ⇒ the press is refused, never a 200 that samples nothing
  function startProfile(ms = profileMs) {
    settleProfile();
    let st = {}; try { st = samplingState() || {}; } catch { st = {}; }
    if (st.watchdog === false || typeof askProfile !== 'function') return { ok: false, error: 'no_watchdog' };   // BEFORE «running»: a dead watchdog serves no press
    if (profile.running) return { ok: true, running: true, startedAt: profile.running.startedAt, until: profile.running.until };
    if (!hasInspector) return { ok: false, error: REFUSALS.inspector };
    if (st.known === false) return { ok: false, error: REFUSALS.unknown };
    if (st.on === false) return { ok: false, error: REFUSALS.off };
    let dbg = false; try { dbg = debuggerNow() === true; } catch { dbg = false; }
    if (dbg || st.debugger === true) return { ok: false, error: REFUSALS.debugger };   // read AT the press (the beat's flag is up to a beat old)
    // THE RATE IS A SAFETY BOUND (the independent check): periodic samples of a free loop near the heap limit run a hub
    // out of memory sooner — refused by name while heap used is past PROFILE_HEAP_SHARE of its limit
    let hp = null; try { hp = heap(); } catch { }
    let hf = null; try { hf = heapFill(); } catch { }
    if ((hp && hp.heapLimit > 0 && hp.heapUsed >= LH.PROFILE_HEAP_SHARE * hp.heapLimit) || (hf && hf.high) || st.heapHigh === true) return { ok: false, error: REFUSALS.heap, ...(hp ? { heapUsed: hp.heapUsed, heapLimit: hp.heapLimit } : {}) };
    const at = wallNow(), atM = now();
    profile.running = { startedAt: at, until: at + ms, untilM: atM + ms };
    try { askProfile(ms); } catch (e) { profile.running = null; return { ok: false, error: 'no_watchdog' }; }
    return { ok: true, running: true, startedAt: at, until: at + ms };
  }

  function report({ maxBytes = 0 } = {}) {
    settleProfile();
    let mem = null; try { mem = heap(); } catch { }
    const rep = {
      elu: eluNow(), heap: mem, counts: { ...counts }, sampling: samplingState(),
      holds: ring.slice().reverse(), table: LH.tableRows(table),
      law: { holdMs: LH.HOLD_MS, samplesPerHold: LH.SAMPLES_PER_HOLD, capPerHour: LH.CAP_PER_HOUR, gcMinMs },
      profile: { running: profile.running ? { startedAt: profile.running.startedAt, until: profile.running.until } : null, last: profile.last, note: LH.PROFILE_NOTE },
    };
    return maxBytes > 0 ? LH.boundReport(rep, maxBytes) : rep;   // the incident bundle's share: an explicit byte bound
  }
  const REFUSED = { error: 'the owner’s diagnostics — not an agent route', code: 'agent_forbidden' };
  function register(app) {
    app.get('/api/loop-holds', (req, res) => { if (pressBearer(req.headers)) return res.status(403).json(REFUSED); res.json(report()); });
    // law L: the owner's cookie (auth.js's gate + the same-origin rule for every write) — a profile of ≤ 10 minutes
    app.post('/api/loop-holds/profile', (req, res) => { if (pressBearer(req.headers)) return res.status(403).json(REFUSED); const r = startProfile(); res.status(r.ok ? 200 : 503).json(r); });
    return api;
  }
  function stop() { try { obs && obs.disconnect(); } catch { } clearInterval(timer); }

  const api = { onHold, onLost, startProfile, report, register, stop, eluNow, gcRing: () => gc.slice(), ring: () => ring.slice(), table: () => LH.tableRows(table) };
  return api;
}

module.exports = { create, ELU_EVERY_MS };
