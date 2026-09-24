'use strict';
// ── THE AUTO-CLI QUOTA REFRESH LOOP (2.329.0; moved out of server.js in quota
// r2 so its pacing state could persist and the suites could drive the REAL
// loop body with an injected clock). Owner-approved after the ToS
// explicitly-permit argument; §ban-safety posture: the fetch is made by the
// official CLI exactly as if the user typed /usage — this instance never
// touches the vendor API. Setting accounts.onDemandQuotaRefresh='auto-cli';
// cadence is BURN-AWARE, not fixed: the dead-reckoner's own drift signal
// (est vs last reading) triggers refreshes within minutes during a fast
// workflow burst; idle accounts get a SLOW rung (owner-directed 2026-08-13):
// a reading older than a per-tick-randomized 30–60min threshold refreshes
// even with zero activity, so the roster never shows week-stale numbers —
// the wandering threshold avoids the metronomic fixed-interval pattern the
// ban postmortem flagged, and never-read accounts bootstrap their first
// reading through the same rung. One CLI spawn per tick, per-account 5min
// floor, exponential backoff on consecutive failures (an unparseable
// account must not spawn claude every 5min forever). The PROJECTION rung
// (B-f69c ③) asks the same spawn when the estimator projects a crossing
// before the next scheduled read; its memory is per BUCKET (quota r2 — see
// account-pool-auto.js `projectionBucketBought`).
//
// THE PACING STATE SURVIVES A RESTART (quota r2, the r2 verifier's crash
// loops: a restart every 3 min spawned 11 `claude -p /usage` in 40 min, every
// 2 min 15). `attempts` (the per-account attempt clock), `fails` (the backoff
// exponent) and `projReads` (the bought buckets) live in
// data/auto-cli-state.json, written atomically (tmp + rename) BEFORE every
// spawn (the attempt stamp — quota r3: a restart while `claude -p /usage` is
// in flight must see it, and under KillMode=process the orphaned probe still
// spends its vendor call) and again after it (the backoff and the bought
// bucket) — at most two small writes per 60 s tick, so there is nothing to
// flush on SIGTERM that is not already on disk. A missing file starts empty
// silently (first boot); an unreadable one starts empty with ONE warn line
// naming it (quota r3). The drift/age rungs are restart-safe by construction;
// the projection's `age >= floorMs` guard is the floor without the file.
// THE CLOCK CAN STEP BACK (quota r3: a VM snapshot restore, an NTP step after
// suspend): a stamp in the FUTURE would pin every rung of that account off
// until the wall clock passed it — and since nothing spawns, nothing rewrites
// the file. At load and on every tick (`clampStamps`) an attempt stamp is
// clamped to `now` (a step back costs at most one floor, never the step) and a
// bought-bucket record from the future (beyond a 60 s skew) is dropped — a
// purchase that has not happened yet is no knowledge of the current window.
// THE ORDER OF A SPAWN (quota r3): stamp → save → spawn → the backoff and the
// bought bucket → save → THEN the engine wake (its own try — an engine
// exception can never skip the loop's bookkeeping) → the journal line.
// ONE IDENTITY, ONE MEMORY (quota r3): two account ids over one org-merged
// identity (usageIdentityGroupsCached) share a reading, so they share the
// bought buckets and the attempt floor — a purchase is written under every id
// of the group, and each id reads the group's merged memory.
const fs = require('fs');
const path = require('path');
const { decideCliRefresh, cliRefreshWhy, projectionReadsAfter, projectionBucketBought, PROJECTION_WINDOW_MS } = require('../account-pool-auto.js');
const { cliRefreshDrift } = require('../usage-estimator.js');

const STATE_FILE = 'auto-cli-state.json';
const ATTEMPT_KEEP_MS = 24 * 3600e3; // an attempt older than a day paces nothing (the longest backoff is 5 min × 2^6 = 5.3 h)
const CLOCK_SKEW_MS = 60e3; // a stamp further in the future than this is a clock that stepped back, not a race

/** Clamp every stamp to `now` (quota r3) — returns how many it moved. */
function clampStamps(st, now) {
  let n = 0;
  for (const [k, v] of st.attempts) if (v > now) { st.attempts.set(k, now); if (v > now + CLOCK_SKEW_MS) n++; }
  for (const [k, reads] of st.projReads) {
    const out = {};
    for (const [lab, r] of Object.entries(reads || {})) {
      const b = Number(r && r.boughtAt) || 0;
      if (b > now + CLOCK_SKEW_MS) { n++; continue; } // a purchase from the future is no knowledge of THIS window — dropped
      if (b > now) { const shift = b - now; out[lab] = { ...r, boughtAt: now, at: (Number(r.at) || now) - shift }; } else out[lab] = r;
    }
    st.projReads.set(k, out);
  }
  return n;
}
function loadState(dataDir, now, warn = () => {}) {
  const st = { attempts: new Map(), fails: new Map(), projReads: new Map() };
  const fp = path.join(dataDir, STATE_FILE);
  let text = null; try { text = fs.readFileSync(fp, 'utf-8'); } catch (e) { if (e && e.code !== 'ENOENT') warn(`[auto-cli] pacing state unreadable, starting empty: ${e.message}`); return st; }
  let raw = null; try { raw = JSON.parse(text); } catch (e) { warn(`[auto-cli] pacing state unreadable, starting empty: ${e.message}`); return st; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { warn(`[auto-cli] pacing state unreadable, starting empty: not an object (${Array.isArray(raw) ? 'array' : typeof raw})`); return st; }
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  for (const [k, v] of Object.entries(obj(raw.attempts))) if (Number.isFinite(v) && now - v < ATTEMPT_KEEP_MS) st.attempts.set(k, v);
  for (const [k, v] of Object.entries(obj(raw.fails))) if (Number.isFinite(v) && v > 0) st.fails.set(k, v);
  for (const [k, v] of Object.entries(obj(raw.projReads))) st.projReads.set(k, v);
  const moved = clampStamps(st, now);
  if (moved) warn(`[auto-cli] pacing state held ${moved} stamp(s) in the future (the clock stepped back) — clamped to now`);
  for (const [k, v] of [...st.projReads]) {
    const kept = projectionReadsAfter(v, null, now);
    if (Object.keys(kept).length) st.projReads.set(k, kept); else st.projReads.delete(k);
  }
  return st;
}
function saveState(dataDir, st, warn) {
  try {
    const fp = path.join(dataDir, STATE_FILE);
    fs.mkdirSync(dataDir, { recursive: true });
    const doc = { v: 1, attempts: Object.fromEntries(st.attempts), fails: Object.fromEntries([...st.fails].filter(([, n]) => n > 0)), projReads: Object.fromEntries(st.projReads) };
    fs.writeFileSync(fp + '.tmp', JSON.stringify(doc));
    fs.renameSync(fp + '.tmp', fp);
  } catch (e) { warn(`[auto-cli] pacing state write failed: ${e.message}`); } // loud; the in-memory state still paces this process
}
/** The last crossing INSTANT any bucket of this account bought (the r1
 *  instant band — the secondary guard across buckets). */
function lastBoughtInstant(reads) {
  let best = null;
  for (const r of Object.values(reads || {})) if (r && (!best || (Number(r.boughtAt) || 0) > (Number(best.boughtAt) || 0))) best = r;
  return best && Number.isFinite(Number(best.at)) ? Number(best.at) : null;
}

/**
 * @param {object} d  deps: serverSetting, accounts, autoCliReady, USAGE_CACHE_DIR,
 *   usageIdentityGroupsCached, usageEstimator, projectionRereadFor,
 *   lastMemberReadAt, usage (refreshViaCliPanel), onMemberReadingFresh, dataDir;
 *   now/rand/log/warn/metric injectable for the suites.
 */
function createAutoCliLoop(d) {
  const now0 = (d.now || Date.now)();
  const clock = d.now || Date.now, rand = d.rand || Math.random;
  const log = d.log || ((l) => console.log(l)), warn = d.warn || ((l) => console.warn(l));
  const st = loadState(d.dataDir, now0, warn);
  const { attempts, fails, projReads } = st;
  const jitter = 1 + rand() * 0.4; // per-boot 45–63min active-burn cap
  async function tick() {
    try {
      if (d.serverSetting('accounts.onDemandQuotaRefresh') !== 'auto-cli') return;
      const now = clock();
      if (clampStamps(st, now)) warn('[auto-cli] the clock stepped back — pacing stamps clamped to now');
      const list = [];
      for (const a of (d.accounts.list().accounts || [])) {
        if (a.type !== 'subscription' || !a.loggedIn || a.pooled || (a.backend || 'claude') !== 'claude' || !d.autoCliReady(a.id)) continue; // auto-cli spawns `claude -p /usage` — claude accounts only, and NOT READY IS NOT FAILED (autoCliReady, 2026-09-08)
        let raw = null, mem = [a.id];
        try { raw = JSON.parse(fs.readFileSync(path.join(d.USAGE_CACHE_DIR, a.id + '.json'), 'utf-8')); } catch { }
        try {
          for (const [, g] of d.usageIdentityGroupsCached()) {
            if (!g.accountIds.includes(a.id)) continue;
            mem = [a.id, ...g.accountIds.filter((x) => x !== a.id)]; // one identity, one memory (quota r3)
            if (g.cache && (g.cache.fetchedAt || 0) > (raw?.fetchedAt || 0)) raw = g.cache;
            break;
          }
        } catch { }
        // never-read accounts (no cache at all) ride the idle rung with fetchedAt 0 —
        // their first auto-cli read IS the bootstrap; failure backoff bounds retries
        const f = fails.get(a.id) || 0;
        if (f > 0 && now - (attempts.get(a.id) || 0) < 5 * 60e3 * Math.pow(2, Math.min(f, 6))) continue;
        let est = null; try { est = raw ? d.usageEstimator.estimateFor(a.id, raw, now) : null; } catch { }
        // B-a5c0: a raw bucket whose window already reset is NO control for the
        // logged drift (it printed a 100-point "drift" old-window-vs-new); the
        // scheduler keeps its inputs (triggerDrift/moved) — the refresh was right
        const dr = cliRefreshDrift(est, raw, now);
        const pj = d.projectionRereadFor(a.id, now), reads = mergedReads(mem);
        // ONE attempt clock for both schedulers (lastMemberReadAt, 2026-09-08); pj = the estimator's PROJECTION (B-f69c ③):
        // a crossing before the next scheduled read asks this same rung now — once per BUCKET (projLabel/projResetsAt vs projReads, quota r2)
        list.push({ key: a.id, fetchedAt: raw?.fetchedAt || 0, lastAttemptAt: Math.max(...mem.map((x) => Math.max(attempts.get(x) || 0, d.lastMemberReadAt(x) || 0))), estDriftPct: dr.triggerDrift, activeBurn: dr.moved, drift: dr.drift, rolled: dr.rolled, projCrossInMs: pj ? pj.inMs : null, estBurnPtPerMin: pj ? pj.burnPtPerMin : 0, projLabel: pj ? pj.label : null, projResetsAt: pj ? (pj.resetsAt || 0) : 0, projReads: reads, projReadCrossAt: lastBoughtInstant(reads), pj, mem });
      }
      // idle threshold re-rolls EVERY tick inside the owner's 30–60min band —
      // a wandering threshold, not a fixed cadence
      const idleMaxAgeMs = 30 * 60e3 * (1 + rand());
      const picks = decideCliRefresh(list, now, { maxAgeMs: 45 * 60e3 * jitter, idleMaxAgeMs });
      for (const key of picks) {
        const it = list.find((x) => x.key === key), why = cliRefreshWhy(it && { ...it, lastAttemptAt: 0 }, now, { maxAgeMs: 45 * 60e3 * jitter, idleMaxAgeMs }); // the pick's own reason (the attempt floor already passed)
        attempts.set(key, now);
        saveState(d.dataDir, st, warn); // the attempt reaches disk BEFORE the spawn (quota r3: a restart mid-spawn must see it)
        let ok = false; try { ok = !!(await d.usage.refreshViaCliPanel(key)); } catch { ok = false; }
        fails.set(key, ok ? 0 : (fails.get(key) || 0) + 1);
        // a successful read BUYS its bucket's window: a projection read, or ANY read taken while the bucket's crossing is inside
        // the projection window (quota r3 — it is the same number) — never asked again before that window resets. A failed read
        // bought nothing (the failure backoff paces its retry). Written under every id of the identity (quota r3).
        if (ok && it && it.pj && (why === 'projection' || (Number(it.pj.inMs) > 0 && Number(it.pj.inMs) <= PROJECTION_WINDOW_MS))) {
          for (const k of (it.mem || [key])) projReads.set(k, projectionReadsAfter(projReads.get(k), it.pj, now));
        }
        saveState(d.dataDir, st, warn); // the backoff and the bought buckets outlive a restart (quota r2)
        if (ok) { try { d.onMemberReadingFresh(key, 'auto-cli refresh'); } catch (e) { warn(`[auto-cli] reading wake failed for ${key}: ${e.message}`); } } // the THIRD producer of a fresh reading takes the SAME edge (2026-09-08: its 02:31:43 success changed nothing) — AFTER the bookkeeping (quota r3)
        log(`[auto-cli] quota refresh ${key}: ${ok ? 'ok' : 'failed'} (${why || '?'}; ${it?.drift == null ? (it?.rolled ? 'no drift control — the reading\'s window already reset' : 'no drift control') : `drift ${Math.round(it.drift)}pt`}${it?.pj ? `; ${it.pj.label} crosses its ${it.pj.line}% line in ~${Math.max(1, Math.round(it.pj.inMs / 60e3))} min at ${it.pj.pctPerMin}%/min` : ''})`);
        (d.metric || global.__vsMetric)?.('auto-cli-refresh-ms', 0);
      }
    } catch (e) { warn('[auto-cli] tick failed: ' + e.message); }
  }
  // the group's merged memory: per bucket, the latest purchase any id of the identity made
  function mergedReads(ids) {
    let out = null;
    for (const k of ids) {
      const r = projReads.get(k); if (!r || typeof r !== 'object') continue;
      for (const [lab, rec] of Object.entries(r)) {
        if (!rec || typeof rec !== 'object') continue;
        out = out || {};
        if (!out[lab] || (Number(rec.boughtAt) || 0) > (Number(out[lab].boughtAt) || 0)) out[lab] = rec;
      }
    }
    return out;
  }
  return {
    tick, state: st,
    start() { const t = setInterval(tick, 60000); t.unref?.(); return t; },
  };
}

module.exports = { createAutoCliLoop, loadState, saveState, clampStamps, lastBoughtInstant, STATE_FILE, projectionBucketBought };
