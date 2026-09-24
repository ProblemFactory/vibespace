#!/usr/bin/env node
// auto-cli refresh DECISION (2.329.0): burn-aware, never-poll-idle. The pure
// function is the whole policy — pin the owner's requirements: fast workflow
// bursts refresh within minutes (drift trigger), idle accounts are NEVER
// polled (the ban-postmortem's signal stays impossible), floors serialize.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { decideCliRefresh } = require('../src/account-pool-auto.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };

const NOW = 1_800_000_000_000;
const MIN = 60e3;

// 1. a fast burst: big est drift on a fresh reading → refresh NOW (the owner's
//    "workflow 快跑 30min 太慢" case — no waiting for any age threshold)
ok(decideCliRefresh([{ key: 'a', fetchedAt: NOW - 6 * MIN, lastAttemptAt: 0, estDriftPct: 12, activeBurn: true }], NOW)[0] === 'a',
  'burst drift (12pt in 6min) refreshes immediately — no fixed cadence wait');
// 2. idle account: old reading, ZERO movement → never polled
// idle SLOW rung (owner-directed 2026-08-13): a stale-enough idle account IS
// refreshed now; below the idle threshold it still is not
ok(decideCliRefresh([{ key: 'idle', fetchedAt: NOW - 300 * MIN, lastAttemptAt: 0, estDriftPct: 0, activeBurn: false }], NOW)[0] === 'idle',
  'idle account past idleMaxAgeMs is refreshed (slow rung)');
ok(decideCliRefresh([{ key: 'idle2', fetchedAt: NOW - 40 * MIN, lastAttemptAt: 0, estDriftPct: 0, activeBurn: false }], NOW, { idleMaxAgeMs: 60 * MIN }).length === 0,
  'idle account UNDER the idle threshold is not polled');
ok(decideCliRefresh([{ key: 'boot', fetchedAt: 0, lastAttemptAt: 0, estDriftPct: 0, activeBurn: false }], NOW)[0] === 'boot',
  'never-read account (fetchedAt 0) bootstraps through the idle rung');
ok(decideCliRefresh([
  { key: 'drifty', fetchedAt: NOW - 70 * MIN, lastAttemptAt: 0, estDriftPct: 9, activeBurn: true },
  { key: 'stale-idle', fetchedAt: NOW - 300 * MIN, lastAttemptAt: 0, estDriftPct: 0, activeBurn: false },
], NOW)[0] === 'drifty',
  'drift outranks stale-idle when only one slot per tick');
// 3. active but slow burn: stale reading + some movement → staleness cap fires
ok(decideCliRefresh([{ key: 'slow', fetchedAt: NOW - 50 * MIN, lastAttemptAt: 0, estDriftPct: 1.5, activeBurn: true }], NOW)[0] === 'slow',
  'active-but-slow burn refreshes at the staleness cap');
// 4. per-account floor: recent attempt suppresses even a big drift
ok(decideCliRefresh([{ key: 'a', fetchedAt: NOW - 10 * MIN, lastAttemptAt: NOW - 2 * MIN, estDriftPct: 20, activeBurn: true }], NOW).length === 0,
  '5min per-account floor holds even under drift (spawn hammering impossible)');
// 5. one per tick, biggest drift wins
const picks = decideCliRefresh([
  { key: 'x', fetchedAt: NOW - 10 * MIN, lastAttemptAt: 0, estDriftPct: 6, activeBurn: true },
  { key: 'y', fetchedAt: NOW - 10 * MIN, lastAttemptAt: 0, estDriftPct: 15, activeBurn: true },
], NOW);
ok(picks.length === 1 && picks[0] === 'y', 'one refresh per tick, biggest drift first (serialized spawns)');
// 6. sub-threshold drift on a fresh reading → nothing
ok(decideCliRefresh([{ key: 'a', fetchedAt: NOW - 10 * MIN, lastAttemptAt: 0, estDriftPct: 2, activeBurn: true }], NOW).length === 0,
  'small drift on a fresh reading stays quiet');
// 7. hostile/empty input never throws
ok(decideCliRefresh(null, NOW).length === 0 && decideCliRefresh([{}, null], NOW).length === 0,
  'hostile input returns empty, never throws');

// 8. THE PROJECTION RULE (B-f69c ③, owner ruling ut-1c6c15a2db ③ "1%/min 燃烧 40 分钟读一次不够"):
//    the estimator's projection asks the SAME fast rung when a crossing lands
//    before the next scheduled read — and only then.
{
  const { cliRefreshWhy, nextScheduledReadMs } = require('../src/account-pool-auto.js');
  const fs = require('node:fs');
  // the owner's arithmetic: a reading 5 min old, nothing drifted by the drift
  // rung's measure yet, the age rung reads at 45 min — 40 minutes blind while
  // the projection says the line is 8 minutes away (inside the 10-min projection window — quota r3)
  const blind = { key: 'p', fetchedAt: NOW - 5 * MIN, lastAttemptAt: 0, estDriftPct: 0, activeBurn: true, projCrossInMs: 8 * MIN, estBurnPtPerMin: 0 };
  ok(nextScheduledReadMs(blind, NOW) === 40 * MIN, 'next scheduled read of a 5-min-old reading with no measured drift = 40 min away (the age rung)', nextScheduledReadMs(blind, NOW));
  ok(cliRefreshWhy(blind, NOW) === 'projection' && decideCliRefresh([blind], NOW)[0] === 'p', 'a crossing 8 min out, 32 min before the next read ⇒ the fast rung NOW, named `projection`');
  ok(cliRefreshWhy({ ...blind, projCrossInMs: null }, NOW) === null, '…without the projection the same account stays quiet (the rule that was missing)');
  // the drift rung WILL read before the crossing: no extra spawn
  const driftFirst = { ...blind, estBurnPtPerMin: 1, projCrossInMs: 10 * MIN };
  ok(nextScheduledReadMs(driftFirst, NOW) === 4 * MIN && cliRefreshWhy(driftFirst, NOW) === null, 'a crossing 10 min out while the drift rung reads in 4 min (1 pt/min to a 4 pt drift) ⇒ NOT asked — the scheduled read comes first');
  ok(cliRefreshWhy({ ...driftFirst, projCrossInMs: 3 * MIN }, NOW) === 'projection', '…a crossing 3 min out beats that 4-min read ⇒ asked now');
  // the SAME rung's pacing: floor, one per tick, a crossing in the past or now is no projection
  ok(decideCliRefresh([{ ...blind, lastAttemptAt: NOW - 2 * MIN }], NOW).length === 0, 'the per-account 5-min floor holds for a projection too (never a cadence)');
  ok(cliRefreshWhy({ ...blind, projCrossInMs: 0 }, NOW) === null && cliRefreshWhy({ ...blind, projCrossInMs: -1 }, NOW) === null && cliRefreshWhy({ ...blind, projCrossInMs: 'x' }, NOW) === null,
    'a crossing now/past/garbage is not a projection (a bucket already under its line is the estimate\'s business)');
  const picks = decideCliRefresh([
    { key: 'drifty', fetchedAt: NOW - 30 * MIN, lastAttemptAt: 0, estDriftPct: 12, activeBurn: true },
    { ...blind, key: 'late', projCrossInMs: 9 * MIN },
    { ...blind, key: 'soon', projCrossInMs: 6 * MIN },
  ], NOW, { maxPerTick: 3 });
  ok(picks.join(',') === 'soon,late,drifty', 'projections rank first, soonest crossing first, then the drift/age order', picks);
  ok(decideCliRefresh([{ ...blind, key: 'x1' }, { ...blind, key: 'x2', projCrossInMs: 7 * MIN }], NOW).join(',') === 'x2', 'ONE refresh per tick — the soonest crossing (one fast-rung request)');
  // WIRING PIN (the 2.355.0 unstaged-wiring lesson): the loop feeds the engine's
  // projection into THIS decision and spends the pick on the existing rung —
  // the ONE owner-approved panel refresher, never a new vendor path. Code only.
  // the loop lives in src/server/auto-cli-loop.js since quota r2; server.js wires it
  const strip = (t) => t.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  const srv = strip(fs.readFileSync(new URL('../src/server/auto-cli-loop.js', import.meta.url), 'utf8'));
  const boot = strip(fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8'));
  ok(/require\('\.\/src\/server\/auto-cli-loop\.js'\)\.createAutoCliLoop\(\{[^\n]*projectionRereadFor, lastMemberReadAt, usage, onMemberReadingFresh, dataDir: path\.join\(__dirname, 'data'\) \}\)\.start\(\);/.test(boot), 'WIRING PIN: server.js starts the ONE auto-cli loop with the engine\'s projection, the attempt clock, the rung and the data dir');
  ok(/const pj = d\.projectionRereadFor\(a\.id, now\)[^\n]*\n[\s\S]{0,40}?list\.push\(\{[^\n]*projCrossInMs: pj \? pj\.inMs : null, estBurnPtPerMin: pj \? pj\.burnPtPerMin : 0/.test(srv), 'WIRING PIN: the auto-cli loop hands projectionRereadFor\'s crossing + burn to decideCliRefresh');
  ok(/const picks = decideCliRefresh\(list, now,[^\n]*\n\s*for \(const key of picks\) \{\n[^\n]*\n\s*attempts\.set\(key, now\);\n\s*saveState\(d\.dataDir, st, warn\);[^\n]*\n\s*let ok = false; try \{ ok = !!\(await d\.usage\.refreshViaCliPanel\(key\)\);/.test(srv), 'WIRING PIN: a pick is spent on usage.refreshViaCliPanel — the same rung, behind the same attempt clock, stamped on disk BEFORE the spawn (quota r3)');
  ok(/if \(ok\) \{ try \{ d\.onMemberReadingFresh\(key, 'auto-cli refresh'\); \} catch/.test(srv), 'WIRING PIN: the fresh reading takes the new-member wake — the pool re-decides on the READING (its own try, after the bookkeeping — quota r3)');
  // THE PROJECTION'S OWN MEMORY (quota r1, the B-f69c ③ verifier): a crossing
  // is bought ONE reading. The floor was never the drift rung's limiter (it
  // needs 4 pt of movement between reads) and the projection had no such
  // self-limiter: after each reading the crossing is still ahead and still
  // before the next scheduled read, so `projection` was answered again the
  // moment the 5-min floor cleared — 7 reads on one slow approach where the
  // pre-B-f69c rule took none before the line. The loop stamps the crossing
  // INSTANT it spent a projection read on (`projReadCrossAt`); the same instant
  // (within `projMoveMs`, 5 min) is never asked again; a crossing that MOVED is.
  {
    const { projectionCrossing } = require('../src/account-pool-auto.js');
    const approach = ({ startRemaining, burnPctPerMin, minutes = 120 }) => {
      const t0 = NOW; let fetchedAt = t0, lastAttempt = t0, bought = null; const reads = [];
      for (let t = t0; t <= t0 + minutes * MIN; t += 30e3) {
        const rem = startRemaining - burnPctPerMin * ((t - t0) / MIN); if (rem <= 0) break;
        const est = { fiveHour: { utilization: 1 - rem / 100, resetsAt: t / 1000 + 4 * 3600 }, sevenDay: { utilization: 0.3, resetsAt: t / 1000 + 5 * 86400 } };
        const c = projectionCrossing(est, { fiveHour: burnPctPerMin / 100 }, t / 1000, { hot: false });
        const it = { key: 'm', fetchedAt, lastAttemptAt: lastAttempt, estDriftPct: burnPctPerMin * ((t - fetchedAt) / MIN), activeBurn: true, projCrossInMs: c ? c.inSec * 1000 : null, estBurnPtPerMin: burnPctPerMin, projReadCrossAt: bought };
        const why = cliRefreshWhy(it, t);
        if (decideCliRefresh([it], t).length) { reads.push({ min: Math.round((t - t0) / MIN), why }); fetchedAt = lastAttempt = t; if (why === 'projection') bought = t + it.projCrossInMs; } // the loop's stamp, on the read it spent
      }
      return reads;
    };
    for (const w of [{ startRemaining: 7, burnPctPerMin: 0.05, label: '0.05 %/min from 7 % (the hard line at min 40)' }, { startRemaining: 5.8, burnPctPerMin: 0.02, label: 'a hover, 0.02 %/min from 5.8 % (min 40)' }]) {
      const reads = approach(w);
      const proj = reads.filter((r) => r.why === 'projection');
      ok(proj.length === 1 && proj[0].min < 40, `ONE projection read per crossing on a slow approach — ${w.label} (red on quota 3: 7 reads at min 5,10,…,35)`, reads);
    }
    ok(approach({ startRemaining: 20, burnPctPerMin: 1.2 }).every((r) => r.why === 'drift'), '…a fast burst is still the drift rung\'s (the memory changes nothing there)');
    const stamped = { ...blind, projReadCrossAt: NOW + 8 * MIN };
    ok(cliRefreshWhy(stamped, NOW) === null, 'a crossing already bought a reading (same instant) is not asked again');
    ok(cliRefreshWhy({ ...stamped, projReadCrossAt: NOW + 8 * MIN + 4 * MIN }, NOW) === null, '…nor one that drifted by less than projMoveMs (5 min — the estimate\'s own wobble)');
    ok(cliRefreshWhy({ ...stamped, projReadCrossAt: NOW + 20 * MIN }, NOW) === 'projection', 'a crossing that MOVED (12 min earlier: the burn rose) is a new crossing ⇒ asked');
    ok(cliRefreshWhy({ ...stamped, estDriftPct: 5 }, NOW) === 'drift' && cliRefreshWhy({ ...stamped, fetchedAt: NOW - 50 * MIN }, NOW) === 'stale-active', '…and the memory silences only the projection — the drift and age rungs still read a stamped account');
    ok(/why = cliRefreshWhy\(it && \{ \.\.\.it, lastAttemptAt: 0 \}, now,/.test(srv) && /if \(ok && it && it\.pj && \(why === 'projection' \|\| \(Number\(it\.pj\.inMs\) > 0 && Number\(it\.pj\.inMs\) <= PROJECTION_WINDOW_MS\)\)\) \{\n\s*for \(const k of \(it\.mem \|\| \[key\]\)\) projReads\.set\(k, projectionReadsAfter\(projReads\.get\(k\), it\.pj, now\)\);/.test(srv), 'WIRING PIN: the loop stamps the BUCKET a SUCCESSFUL projection read — or any read inside the projection window (quota r3) — was spent on, under every id of the identity');
    ok(/const pj = d\.projectionRereadFor\(a\.id, now\), reads = mergedReads\(mem\);/.test(srv) && /list\.push\(\{[^\n]*projLabel: pj \? pj\.label : null, projResetsAt: pj \? \(pj\.resetsAt \|\| 0\) : 0, projReads: reads, projReadCrossAt: lastBoughtInstant\(reads\)/.test(srv), 'WIRING PIN: …and hands the bucket memory (+ the r1 instant as the secondary guard) back to the rule on every tick');
  }
  const eng = fs.readFileSync(new URL('../src/server/usage-pool-engine.js', import.meta.url), 'utf8');
  ok(/function projectionRereadFor\(memberId, nowMs = Date\.now\(\)\)/.test(eng) && /projectionRereadFor,/.test(eng) && /projectionRereadFor,/.test(boot), 'WIRING PIN: the engine exports projectionRereadFor and server.js destructures it');
  ok(/return \{ inMs: best\.inSec \* 1000, label: best\.label,[^\n]*resetsAt: best\.resetsAt \|\| 0,/.test(eng), 'WIRING PIN: the engine\'s projection names the crossing bucket\'s WINDOW (`resetsAt`) — the memory\'s key half (§9 mirrors this return)');
}


// 9. THE PROJECTION'S MEMORY IS THE BUCKET, THE PASSIVE READING IS THE
//    READING, AND THE PACING STATE OUTLIVES A RESTART (quota r2 — the r2
//    verifier's three reproduced findings). §8's approach modelled a CONSTANT
//    burn, so it could not see what a real ledger does: `burnRates` is a 10-min
//    trailing window, and under Poisson arrivals the projected crossing INSTANT
//    wobbles by more than the r1 band on half the ticks — every wobble was "a
//    new crossing" bought at the floor cadence. This section drives the REAL
//    loop (src/server/auto-cli-loop.js, clock + RNG injected) with the REAL
//    rule, the REAL projectionCrossing and the REAL burnRates over a synthetic
//    ledger; the fast rung is a stub that RECORDS spawns and writes the truth.
//    Zero vendor calls. Each fix has a scratch-dir PATCHED COPY as its negative
//    control: the copy without it goes red on the same world.
{
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { cliRefreshWhy } = require('../src/account-pool-auto.js');
  const blind = { key: 'p', fetchedAt: NOW - 5 * MIN, lastAttemptAt: 0, estDriftPct: 0, activeBurn: true, projCrossInMs: 8 * MIN, estBurnPtPerMin: 0 };
  const { burnRates } = require('../src/usage-estimator.js');
  const { familyOfModel, projectCacheForFamily } = require('../src/model-family.js');
  const REAL_POOL = require.resolve('../src/account-pool-auto.js');
  const REAL_LOOP = require.resolve('../src/server/auto-cli-loop.js');
  const SRC = path.dirname(REAL_POOL);
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-auto-cli-r2-'));
  process.on('exit', () => { try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch { } });
  // a patched copy in the scratch dir: requires re-pointed at the real tree
  const patched = (name, file, edits, repoint = {}) => {
    let txt = fs.readFileSync(file, 'utf8').replace(/require\('\.\/([\w.-]+)'\)/g, (_, f) => `require(${JSON.stringify(path.join(path.dirname(file), f))})`).replace(/require\('\.\.\/([\w.-]+)'\)/g, (_, f) => `require(${JSON.stringify(repoint[f] || path.join(path.dirname(path.dirname(file)), f))})`);
    for (const [a, b] of edits) { if (!txt.includes(a)) throw new Error(`patch anchor missing in ${name}: ${a.slice(0, 60)}`); txt = txt.replace(a, b); }
    const out = path.join(scratchDir, name); fs.writeFileSync(out, txt); return out;
  };
  const NO_BUCKET = patched('pool-no-bucket.js', REAL_POOL, [["if (!projectionBucketBought(a, now) && !(Number.isFinite(bought)", "if (!(Number.isFinite(bought)"]]);
  const NO_AGE = patched('pool-no-age.js', REAL_POOL, [["cross <= projWindowMs && age >= floorMs && cross <", "cross <= projWindowMs && cross <"]]);
  const NO_PERSIST = patched('loop-no-persist.js', REAL_LOOP, [["  const st = loadState(d.dataDir, now0, warn);", "  const st = { attempts: new Map(), fails: new Map(), projReads: new Map() };"], ["        saveState(d.dataDir, st, warn); // the attempt reaches disk", "        // "], ["        saveState(d.dataDir, st, warn); // the backoff", "        // "]]);
  // quota r3 controls: the rule without the projection WINDOW (the read spent as far from the line as the floor allows);
  // the loop without the future-stamp clamp; without the pre-spawn save; with the r2 order (the wake unguarded, before the
  // bookkeeping); without the identity-group memory
  const NO_WINDOW = patched('pool-no-window.js', REAL_POOL, [["cross > 0 && cross <= projWindowMs && age >= floorMs", "cross > 0 && age >= floorMs"]]);
  const NO_CLAMP = patched('loop-no-clamp.js', REAL_LOOP, [["function clampStamps(st, now) {\n  let n = 0;", "function clampStamps(st, now) {\n  return 0; let n = 0;"]]);
  const NO_PRESAVE = patched('loop-no-presave.js', REAL_LOOP, [["        saveState(d.dataDir, st, warn); // the attempt reaches disk", "        // "]]);
  const R2_ORDER = patched('loop-r2-order.js', REAL_LOOP, [["        fails.set(key, ok ? 0 : (fails.get(key) || 0) + 1);\n", "        fails.set(key, ok ? 0 : (fails.get(key) || 0) + 1); if (ok) d.onMemberReadingFresh(key, 'auto-cli refresh');\n"], ["        if (ok) { try { d.onMemberReadingFresh(key, 'auto-cli refresh'); }", "        if (false) { try { }"]]);
  const NO_GROUP = patched('loop-no-group.js', REAL_LOOP, [["mem = [a.id, ...g.accountIds.filter((x) => x !== a.id)];", "mem = [a.id];"]]);
  const loopFor = (poolFile) => poolFile === REAL_POOL ? REAL_LOOP : patched('loop-' + path.basename(poolFile), REAL_LOOP, [], { 'account-pool-auto.js': poolFile });

  const T0 = 1_800_000_000_000;
  let dirN = 0;
  const ledger = ({ t0, minutes, everyMs = 60e3, cost = 1, fam = 'opus', poisson = false, seed = 7 }) => {
    const out = []; let x = seed >>> 0; const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
    let t = t0 + 30e3; const end = t0 + minutes * MIN;
    while (t <= end) { out.push({ t, cost, fam }); t += poisson ? -Math.log(1 - rnd()) * everyMs : everyMs; }
    return out;
  };
  const makeWorld = ({ members, sessions, loopFile = REAL_LOOP, poolFile = REAL_POOL, seed = 1, stateFile = null, wakeThrows = false, groups = null }) => {
    const pool = require(poolFile), { createAutoCliLoop } = require(loopFile);
    const dir = path.join(scratchDir, 'w' + (++dirN)), cacheDir = path.join(dir, 'usage-cache'), dataDir = path.join(dir, 'data');
    fs.mkdirSync(cacheDir, { recursive: true }); fs.mkdirSync(dataDir, { recursive: true });
    let T = T0; let rs = seed >>> 0;
    const rand = () => { rs += 0x6D2B79F5; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const byId = new Map(members.map((m) => [m.id, m]));
    const costFn = (m) => (from, to) => { const c = { total: 0, byFamily: {}, byClass: null }; for (const r of m.ledger) if (r.t > from && r.t <= to) { c.total += r.cost; c.byFamily[r.fam] = (c.byFamily[r.fam] || 0) + r.cost; } return c; };
    const truthOf = (m, key, t) => { const b = m.buckets[key]; let cost = 0; for (const r of m.ledger) if (r.t <= t && (!key.startsWith('scoped:') || r.fam === key.slice(7))) cost += r.cost; return Math.min(1.2, b.u0 + (m.rates[key] || 0) * cost); };
    const writeCache = (m, t) => {
      const o = { fetchedAt: t, fiveHour: null, sevenDay: null, scopedWeekly: [] };
      for (const k of Object.keys(m.buckets)) { const row = { utilization: truthOf(m, k, t), resetsAt: m.buckets[k].resetsAt, state: 'running' }; if (k === 'fiveHour' || k === 'sevenDay') o[k] = row; else o.scopedWeekly.push({ ...row, name: m.buckets[k].name }); }
      fs.writeFileSync(path.join(cacheDir, m.id + '.json'), JSON.stringify(o));
    };
    const readCache = (id) => { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, id + '.json'), 'utf8')); } catch { return null; } };
    const usageEstimator = {
      estimateFor(id, raw, now) {
        const m = byId.get(id); if (!m || !raw) return null; const c = costFn(m)(raw.fetchedAt || 0, now);
        const adv = (b, key) => b ? { ...b, utilization: Math.min(1.2, Number(b.utilization) + (m.rates[key] || 0) * (key.startsWith('scoped:') ? (c.byFamily[key.slice(7)] || 0) : c.total)) } : b;
        return { ...raw, fiveHour: adv(raw.fiveHour, 'fiveHour'), sevenDay: adv(raw.sevenDay, 'sevenDay'), scopedWeekly: (raw.scopedWeekly || []).map((b) => adv(b, 'scoped:' + String(b.name).toLowerCase())) };
      },
      burnFor(id, now) { const m = byId.get(id); const rates = {}; for (const k of Object.keys(m.rates)) rates[k] = { rate: m.rates[k] }; return burnRates({ rates, costFn: costFn(m), nowMs: now }); },
    };
    // the engine's projectionRereadFor, mirrored (sessions → families; the estimate as the view; the soonest crossing) — its return shape is pinned in §8
    const projectionRereadFor = (id, now) => {
      const fams = new Set(sessions.filter((x) => x.on === id).map((x) => familyOfModel(x.model) || null)); if (!fams.size) return null;
      const raw = readCache(id), view = raw ? usageEstimator.estimateFor(id, raw, now) : null, burn = usageEstimator.burnFor(id, now) || {};
      let best = null; for (const fam of fams) { const c = pool.projectionCrossing(projectCacheForFamily(view, fam), burn, now / 1000, { hot: false }); if (c && (!best || c.inSec < best.inSec)) best = { ...c, fam }; }
      if (!best) return null;
      return { inMs: best.inSec * 1000, label: best.label, line: best.line, pctPerMin: best.pctPerMin, band: best.band, fam: best.fam, resetsAt: best.resetsAt || 0, burnPtPerMin: Math.round(Math.max(0, ...Object.values(burn).map((v) => (Number(v) || 0) * 100)) * 100) / 100 };
    };
    const spawns = [], logs = [];
    let mode = 'ok'; // 'ok' | 'hang' (the process dies mid-spawn) | 'lie' (answers true, writes nothing) | 'fail'
    if (stateFile != null) fs.writeFileSync(path.join(dataDir, 'auto-cli-state.json'), typeof stateFile === 'string' ? stateFile : JSON.stringify(stateFile));
    const deps = {
      now: () => T, rand, dataDir, USAGE_CACHE_DIR: cacheDir, metric: () => {},
      serverSetting: (k) => (k === 'accounts.onDemandQuotaRefresh' ? 'auto-cli' : undefined),
      accounts: { list: () => ({ accounts: members.map((m) => ({ id: m.id, type: 'subscription', loggedIn: true, pooled: false, backend: 'claude' })) }) },
      autoCliReady: () => true, usageEstimator, projectionRereadFor, lastMemberReadAt: () => 0,
      // an org-merged identity (the engine's usageIdentityGroups): the freshest cache file of the group wins for every id
      usageIdentityGroupsCached: () => (groups ? new Map(groups.map((ids, i) => [`org-${i}`, { accountIds: ids, cache: ids.map((id) => readCache(id)).filter(Boolean).sort((a, b) => (b.fetchedAt || 0) - (a.fetchedAt || 0))[0] || null }])) : []),
      usage: { refreshViaCliPanel(key) { spawns.push({ t: T, key, mode }); if (mode === 'hang') return new Promise(() => {}); if (mode === 'lie') return Promise.resolve(true); if (mode === 'fail') return Promise.resolve(false); writeCache(byId.get(key), T); return Promise.resolve(true); } },
      onMemberReadingFresh: () => { if (wakeThrows) throw new Error('wake threw'); }, log: (l) => logs.push(l), warn: (l) => logs.push('WARN ' + l),
    };
    let loop = createAutoCliLoop(deps);
    for (const m of members) writeCache(m, T);
    const why = () => logs.map((l) => (/^\[auto-cli\] quota refresh (\S+): ok \(([\w-]+);(?:[^;]*; (\S+) crosses its \S+ line in ~(\d+) min)?/.exec(l) || [])).filter((x) => x.length).map((x) => ({ key: x[1], why: x[2], label: x[3], inMin: x[4] == null ? null : Number(x[4]) }));
    const lineAt = (id, key = 'fiveHour', line = 5) => { const m = byId.get(id); for (let t = T0; t <= T0 + 600 * MIN; t += MIN) if ((1 - truthOf(m, key, t)) * 100 < line) return (t - T0) / MIN; return null; };
    return {
      spawns, logs, dataDir, writeCache, byId, deps, lineAt, readCache, setMode(x) { mode = x; },
      state() { try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'auto-cli-state.json'), 'utf8')); } catch { return null; } },
      get now() { return T; }, advance(ms) { T += ms; },
      async tick() { await loop.tick(); },
      restart() { loop = createAutoCliLoop(deps); return loop; }, // a server restart: a NEW loop (its maps from the state file); the cache files persist
      reads: () => why(), proj: () => why().filter((x) => x.why === 'projection'),
    };
  };
  // the r2 verifier's slow-approach member: 0.05 %/min mean on the 5h bucket from 7 % remaining (the 5 % hard line ~min 40)
  const slowMember = ({ id = 'm1', poisson = false, everyMs = 60e3, seed = 7, u0 = 0.93, fable = false, minutes = 200 } = {}) => ({
    id,
    buckets: { fiveHour: { u0, resetsAt: T0 / 1000 + 4 * 3600 }, sevenDay: { u0: 0.3, resetsAt: T0 / 1000 + 5 * 86400 }, ...(fable ? { 'scoped:fable': { u0: 0.95, resetsAt: T0 / 1000 + 5 * 86400, name: 'Fable' } } : {}) },
    rates: { fiveHour: 0.0005 * (everyMs / 60e3), ...(fable ? { 'scoped:fable': 0.0004 } : {}) },
    ledger: [...ledger({ t0: T0 - 20 * MIN, minutes, everyMs, poisson, seed }), ...(fable ? ledger({ t0: T0, minutes, everyMs: 60e3, fam: 'fable' }) : [])],
  });
  const run = async (w, minutes, each) => { for (let i = 1; i <= minutes; i++) { w.advance(MIN); if (each) each(w, i); await w.tick(); } return w; };

  // ① THE BUCKET, NOT THE INSTANT
  const worlds = [
    ['a constant burn (1 request/min)', { poisson: false }],
    ['Poisson arrivals, mean 1/min (same mean burn)', { poisson: true }],
    ['Poisson arrivals, mean 1 per 2 min', { poisson: true, everyMs: 120e3 }],
    ['Poisson 1 per 2 min, seed 99', { poisson: true, everyMs: 120e3, seed: 99 }],
  ];
  for (const [label, o] of worlds) {
    const w = await run(makeWorld({ members: [slowMember(o)], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }] }), 120);
    const pr = w.proj();
    ok(pr.length === 1 && pr[0].label === '5h', `① ONE projection read per bucket on a slow approach — ${label} (red on quota r1 under Poisson: 3–4 reads at the floor cadence)`, w.reads());
  }
  {
    // since quota r3 the projection window already bounds a steady approach to ~2 reads, so the control uses the
    // sparse-Poisson world (seed 99) whose crossing wobbles in and out of the window
    const o = { poisson: true, everyMs: 120e3, seed: 99 };
    const real = await run(makeWorld({ members: [slowMember(o)], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }] }), 120);
    const w = await run(makeWorld({ members: [slowMember(o)], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }], poolFile: NO_BUCKET, loopFile: loopFor(NO_BUCKET) }), 120);
    ok(real.proj().length === 1 && w.proj().length > 1, '① NEGATIVE CONTROL (patched copy: the r1 instant band alone): the same sparse-Poisson world re-buys the same bucket', { real: real.reads(), control: w.reads() });
  }
  // A BUCKET IS BOUGHT ONCE, BY WHATEVER READ LANDED INSIDE ITS WINDOW (quota r3): a read of any rung taken while the
  // bucket's crossing is inside the projection window is the same number a projection read would buy
  const purchases = (w) => w.reads().filter((r) => r.label && (r.why === 'projection' || (r.inMin != null && r.inMin <= 10)));
  {
    const fam = () => makeWorld({ members: [slowMember({ fable: true })], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }, { on: 'm1', model: 'claude-fable-5-1' }] });
    const w = await run(fam(), 60);
    const bought = purchases(w).map((x) => x.label);
    ok(bought.length === 2 && new Set(bought).size === 2 && bought.includes('5h') && bought.includes('Fable'), '① two families on one member ⇒ each BUCKET bought exactly once (a projection read, or any read inside its window) — the second bucket is its own question (red on quota r2: Fable bought at min 42 by the idle rung, then re-bought by a projection at min 47)', w.reads());
    const NO_ANYREAD = patched('loop-no-anyread.js', REAL_LOOP, [["why === 'projection' || (Number(it.pj.inMs) > 0 && Number(it.pj.inMs) <= PROJECTION_WINDOW_MS)", "why === 'projection'"]]);
    const wc = makeWorld({ members: [slowMember({ fable: true })], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }, { on: 'm1', model: 'claude-fable-5-1' }], loopFile: NO_ANYREAD });
    await run(wc, 60);
    const cb = purchases(wc).map((x) => x.label);
    ok(cb.length > new Set(cb).size, '① NEGATIVE CONTROL (patched copy: only a projection read buys): the same world buys one bucket twice', wc.reads());
  }
  // THE READ IS SPENT NEXT TO THE LINE (quota r3): the one read per bucket lands inside PROJECTION_WINDOW_MS (10 min) of
  // the line — the estimate the pool meets the line with is at most floor + lead old
  {
    const { PROJECTION_WINDOW_MS } = require('../src/account-pool-auto.js');
    ok(PROJECTION_WINDOW_MS === 10 * MIN, '① PROJECTION_WINDOW_MS = the floor + the lead (10 min)');
    const placement = (w) => { const L = w.lineAt('m1'); const rs = w.reads(); const i = rs.findIndex((r) => r.why === 'projection'); const p = rs[i]; return p && L != null ? { line: L, readAt: (w.spawns[i].t - T0) / MIN, before: L - (w.spawns[i].t - T0) / MIN } : { line: L, readAt: null }; };
    const slow10 = () => { const m = slowMember({ u0: 0.90, minutes: 300 }); return makeWorld({ members: [m], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }] }); };
    for (const [label, mk] of [['7 % at 0.05 %/min', () => makeWorld({ members: [slowMember()], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }] })], ['Poisson 1/min, same mean', () => makeWorld({ members: [slowMember({ poisson: true })], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }] })], ['10 % at 0.05 %/min', slow10]]) {
      const w = await run(mk(), 120); const p = placement(w);
      ok(w.proj().length === 1 && p.readAt != null && p.before > 0 && p.before <= 10, `① the projection read lands ≤ 10 min before the line — ${label}: read at min ${p.readAt}, line at min ${p.line} (red on quota r2: the 10 % world read at min 43, 37 min before its line)`, { p, reads: w.reads() });
    }
    const m = slowMember({ u0: 0.90, minutes: 300 });
    const wc = await run(makeWorld({ members: [m], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }], poolFile: NO_WINDOW, loopFile: loopFor(NO_WINDOW) }), 120);
    const pc = placement(wc);
    ok(pc.readAt != null && pc.before > 20, `① NEGATIVE CONTROL (patched copy without the window): the 10 % world spends its read ${pc.before} min before the line`, { pc, reads: wc.reads() });
  }
  // the pure memory: bought until the window resets; an unknown reset = PROJECTION_MEMORY_MS; another bucket asks
  {
    const { projectionBucketBought, projectionReadsAfter, PROJECTION_MEMORY_MS } = require('../src/account-pool-auto.js');
    const R = NOW / 1000 + 3600;
    const reads = projectionReadsAfter(null, { label: '5h', inMs: 20 * MIN, resetsAt: R }, NOW);
    const b = { key: 'b', fetchedAt: NOW - 10 * MIN, lastAttemptAt: 0, estDriftPct: 0, activeBurn: true, projCrossInMs: 8 * MIN, estBurnPtPerMin: 0, projLabel: '5h', projResetsAt: R, projReads: reads };
    ok(reads['5h'] && reads['5h'].at === NOW + 20 * MIN && reads['5h'].resetsAt === R && reads['5h'].boughtAt === NOW, '① projectionReadsAfter stamps {at, resetsAt, boughtAt} under the bucket\'s label', reads);
    ok(cliRefreshWhy(b, NOW) === null, '① a bucket that bought its reading is NOT asked again — even when the crossing moved 10 min (the burn window\'s own noise)');
    ok(cliRefreshWhy({ ...b, fetchedAt: R * 1000 - 5 * MIN }, R * 1000 + 1000) === 'projection', '…after its window RESET the same bucket is a new question');
    ok(cliRefreshWhy({ ...b, projLabel: 'Fable' }, NOW) === 'projection', '…and another bucket is its own question');
    const unk = projectionReadsAfter(null, { label: '7d', inMs: 20 * MIN, resetsAt: 0 }, NOW);
    ok(projectionBucketBought({ projLabel: '7d', projReads: unk }, NOW + PROJECTION_MEMORY_MS - 1) && !projectionBucketBought({ projLabel: '7d', projReads: unk }, NOW + PROJECTION_MEMORY_MS), '…a bucket with an UNKNOWN reset is remembered PROJECTION_MEMORY_MS (5 h) after the purchase');
    ok(Object.keys(projectionReadsAfter({ '5h': { at: 1, resetsAt: NOW / 1000 - 10, boughtAt: 1 }, x: 'garbage' }, null, NOW)).length === 0, '…and an expired or garbage record is pruned');
    ok(cliRefreshWhy({ ...b, projReads: { '5h': 'x' } }, NOW) === 'projection' && cliRefreshWhy({ ...b, projReads: null }, NOW) === 'projection', '…hostile memory never silences the rule (and never throws)');
  }

  // ② A PASSIVE READING IS THE READING
  ok(cliRefreshWhy({ ...blind, fetchedAt: NOW - 30e3 }, NOW) === null, '② a reading 30 s old (statusline) is not re-bought by a projection — `age >= floorMs` (red on quota r1)');
  ok(cliRefreshWhy({ ...blind, fetchedAt: NOW - 5 * MIN }, NOW) === 'projection', '…a reading as old as the floor may be');
  ok(cliRefreshWhy({ ...blind, fetchedAt: NOW - 30e3, estDriftPct: 6 }, NOW) === 'drift', '…the drift rung is untouched by it');
  {
    const passive = (w, i) => { w.advance(-30e3); w.writeCache(w.byId.get('m1'), w.now); w.advance(30e3); };
    const w = await run(makeWorld({ members: [slowMember()], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }] }), 60, passive);
    ok(w.spawns.length === 0, '② a passive reading 30 s before every tick ⇒ ZERO spawns in 60 min (red on quota r1: 2 projection reads, each with a 30-s-old reading)', w.reads());
    const w5 = await run(makeWorld({ members: [slowMember()], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }] }), 60, (x, i) => { if (i % 5 === 0) passive(x, i); });
    ok(w5.proj().length <= 1, '② a passive reading every 5 min ⇒ at most the one projection read', w5.reads());
    const wc = await run(makeWorld({ members: [slowMember()], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }], poolFile: NO_AGE, loopFile: loopFor(NO_AGE) }), 60, passive);
    ok(wc.proj().length >= 1, '② NEGATIVE CONTROL (patched copy without `age >= floorMs`): the same passive world spends a projection read on a 30-s-old reading', wc.reads());
  }

  // ③ THE PACING STATE OUTLIVES A RESTART
  {
    const ctl = await run(makeWorld({ members: [slowMember()], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }] }), 40);
    for (const every of [3, 2]) {
      const w = await run(makeWorld({ members: [slowMember()], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }] }), 40, (x, i) => { if (i % every === 0) x.restart(); });
      ok(w.proj().length === 1 && w.spawns.length === ctl.spawns.length, `③ a crash loop (a restart every ${every} min for 40 min) spends ONE projection read — the no-restart control's count (red on quota r1: ${every === 3 ? 11 : 15} spawns)`, { restarts: w.reads(), control: ctl.reads() });
    }
    const w = await run(makeWorld({ members: [slowMember()], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }], loopFile: NO_PERSIST }), 40, (x, i) => { if (i % 2 === 0) x.restart(); });
    ok(w.proj().length > 1, '③ NEGATIVE CONTROL (patched copy that keeps its pacing state in memory only): the same crash loop re-buys the bucket after a restart', w.reads());
    const st = JSON.parse(fs.readFileSync(path.join(ctl.dataDir, 'auto-cli-state.json'), 'utf8'));
    ok(st.v === 1 && st.attempts.m1 > 0 && st.projReads.m1 && st.projReads.m1['5h'] && st.projReads.m1['5h'].resetsAt === T0 / 1000 + 4 * 3600, '③ data/auto-cli-state.json carries the attempt clock and the bought bucket (its window)', st);
    ok(!fs.readdirSync(ctl.dataDir).some((f) => f.endsWith('.tmp')), '③ …written atomically (tmp + rename, nothing left behind)');
    fs.writeFileSync(path.join(ctl.dataDir, 'auto-cli-state.json'), '{not json');
    const { loadState } = require(REAL_LOOP);
    const e = loadState(ctl.dataDir, T0);
    ok(e.attempts.size === 0 && e.projReads.size === 0, '③ an unreadable state file starts empty (never throws; the `age >= floorMs` guard is the floor without it)');
    // …and says so, ONCE (quota r3); a missing file (first boot) stays silent
    for (const [label, content] of [['corrupt JSON', '{not json'], ['a JSON array', '[1,2,3]'], ['a bare number', '42']]) {
      fs.writeFileSync(path.join(ctl.dataDir, 'auto-cli-state.json'), content);
      const warns = []; const st2 = loadState(ctl.dataDir, T0, (l) => warns.push(l));
      ok(st2.attempts.size === 0 && warns.length === 1 && /pacing state unreadable, starting empty/.test(warns[0]), `③ an unreadable state file (${label}) starts empty with ONE warn line naming it (red on quota r2: silent)`, warns);
    }
    fs.rmSync(path.join(ctl.dataDir, 'auto-cli-state.json'));
    { const warns = []; loadState(ctl.dataDir, T0, (l) => warns.push(l)); ok(warns.length === 0, '③ …a MISSING file (first boot) starts empty silently', warns); }
  }
  // THE CLOCK STEPPED BACK (quota r3): a state file whose stamps are in the FUTURE pinned every rung of that account off
  // until the wall clock passed them — and since nothing spawned, nothing rewrote the file
  {
    const H = 3600e3, mem = () => slowMember({ minutes: 400 }), S = [{ on: 'm1', model: 'claude-opus-5-5' }];
    const futureFile = (stepMs, fails = 0) => ({ v: 1, attempts: { m1: T0 + stepMs }, fails: fails ? { m1: fails } : {}, projReads: { m1: { '5h': { at: T0 + stepMs + 20 * MIN, resetsAt: 0, boughtAt: T0 + stepMs } } } });
    const ctl = await run(makeWorld({ members: [mem()], sessions: S, stateFile: { v: 1, attempts: { m1: T0 - 10 * MIN }, fails: {}, projReads: {} } }), 240);
    for (const [label, file] of [['720 h', futureFile(720 * H)], ['6 h with a failure backoff', futureFile(6 * H, 1)], ['2 h', futureFile(2 * H)]]) {
      const w = await run(makeWorld({ members: [mem()], sessions: S, stateFile: file }), 240);
      ok(w.spawns.length >= ctl.spawns.length - 2 && w.spawns[0] && w.spawns[0].t - T0 <= 15 * MIN && w.logs.some((l) => /clock stepped back/.test(l)), `③ a state file stamped ${label} in the future (the clock stepped back) costs at most one floor (attempts clamped, a future purchase dropped): first spawn at min ${w.spawns[0] ? (w.spawns[0].t - T0) / MIN : '—'}, ${w.spawns.length} spawns in 4 h vs the past-stamp control's ${ctl.spawns.length}, one warn line (red on quota r2: 0 spawns for the 720 h and 6 h files)`, { spawns: w.spawns.map((x) => (x.t - T0) / MIN), logs: w.logs.filter((l) => l.startsWith('WARN')) });
    }
    const wc = await run(makeWorld({ members: [mem()], sessions: S, stateFile: futureFile(720 * H), loopFile: NO_CLAMP }), 240);
    ok(wc.spawns.length === 0, '③ NEGATIVE CONTROL (patched copy without the clamp): the 720 h file silences every rung for the whole 4 h', wc.spawns.length);
  }
  // THE ATTEMPT REACHES DISK BEFORE THE SPAWN (quota r3): a restart while `claude -p /usage` is in flight (under
  // KillMode=process the orphaned probe still spends its vendor call) must not spawn again inside the floor
  {
    const S = [{ on: 'm1', model: 'claude-opus-5-5' }];
    const midSpawn = async (loopFile) => {
      const w = makeWorld({ members: [slowMember()], sessions: S, loopFile });
      // every spawn hangs (the process dies mid-spawn): tick until the FIRST spawn — the projection read
      w.setMode('hang'); const before = 0;
      for (let i = 0; i < 60 && !w.spawns.length; i++) { w.advance(MIN); await Promise.race([w.tick(), new Promise((r) => setTimeout(r, 5))]); }
      const hung = w.spawns.length;
      w.setMode('ok'); w.advance(30e3); w.restart(); await w.tick(); // restart 30 s later
      return { before, hung, after: w.spawns.length, disk: w.state() };
    };
    const r = await midSpawn(REAL_LOOP);
    ok(r.hung === r.before + 1 && r.after === r.hung && r.disk && r.disk.attempts && r.disk.attempts.m1 > 0, '③ a restart 30 s into a hung spawn does NOT spawn again — the attempt stamp was on disk before the spawn (red on quota r2: re-spawned inside the floor)', r);
    const c = await midSpawn(NO_PRESAVE);
    ok(c.after === c.hung + 1, '③ NEGATIVE CONTROL (patched copy that saves only after the spawn): the restart re-spawns inside the floor', c);
  }
  // THE BOOKKEEPING PRECEDES THE WAKE (quota r3): an engine wake that throws used to skip the bucket memory and the
  // state write, so the projection was re-bought every floor for as long as the wake kept throwing
  {
    const S = [{ on: 'm1', model: 'claude-opus-5-5' }];
    const w = await run(makeWorld({ members: [slowMember()], sessions: S, wakeThrows: true }), 16);
    ok(w.proj().length === 1 && w.state() && w.state().projReads.m1 && w.logs.some((l) => /reading wake failed/.test(l)), '③ a wake that throws on every read: the bucket is still bought ONCE, the state written, the failure named', { reads: w.reads(), logs: w.logs });
    const wc = await run(makeWorld({ members: [slowMember()], sessions: S, wakeThrows: true, loopFile: R2_ORDER }), 16);
    ok(wc.spawns.length >= 2 && !(wc.state() && wc.state().projReads && wc.state().projReads.m1), '③ NEGATIVE CONTROL (patched copy with the r2 order: the wake unguarded before the bookkeeping): the bucket is re-bought, no purchase reaches disk', { spawns: wc.spawns.map((x) => (x.t - T0) / MIN), logs: wc.logs });
  }

  // ⑤ quota r3 — ONE IDENTITY, ONE MEMORY; THE WINDOW THE CROSSING NAMES; A RECORD THAT CANNOT BE A WINDOW; A PRODUCER
  //   THAT ANSWERS WITHOUT A READING
  {
    const S2 = [{ on: 'm1', model: 'claude-opus-5-5' }, { on: 'm2', model: 'claude-opus-5-5' }];
    const w = await run(makeWorld({ members: [slowMember({ id: 'm1' }), slowMember({ id: 'm2' })], sessions: S2, groups: [['m1', 'm2']] }), 60);
    const st = w.state();
    ok(w.proj().length === 1 && st && st.projReads.m1 && st.projReads.m2 && st.projReads.m1['5h'].boughtAt === st.projReads.m2['5h'].boughtAt, '⑤ two account ids over ONE org-merged identity buy ONE projection read, recorded under both ids (red on quota r2: m1 at min 5, m2 again at min 10)', { reads: w.reads(), st });
    const wc = await run(makeWorld({ members: [slowMember({ id: 'm1' }), slowMember({ id: 'm2' })], sessions: S2, groups: [['m1', 'm2']], loopFile: NO_GROUP }), 60);
    ok(wc.proj().length === 2, '⑤ NEGATIVE CONTROL (patched copy keyed by account id): the same identity buys its bucket twice', wc.reads());
  }
  {
    const { projectionBucketBought, projectionReadsAfter, PROJECTION_RECORD_MAX_MS } = require('../src/account-pool-auto.js');
    const R = NOW / 1000 + 3600;
    const reads = { '5h': { at: NOW + 8 * MIN, resetsAt: R, boughtAt: NOW } };
    const b = { key: 'b', fetchedAt: NOW - 10 * MIN, lastAttemptAt: 0, estDriftPct: 0, activeBurn: true, projCrossInMs: 8 * MIN, estBurnPtPerMin: 0, projLabel: '5h', projResetsAt: R, projReads: reads };
    ok(projectionBucketBought(b, NOW) && cliRefreshWhy(b, NOW) === null, '⑤ the crossing in the record\'s own window: bought (control)');
    ok(!projectionBucketBought({ ...b, projResetsAt: R - 1800 }, NOW + 20 * MIN) && cliRefreshWhy({ ...b, projResetsAt: R - 1800 }, NOW + 20 * MIN) === 'projection', '⑤ the crossing names an EARLIER window (a panel estimate corrected by an exact reading, 30 min earlier) ⇒ a new question (red on quota r2: bought until the record\'s reset)');
    ok(!projectionBucketBought({ ...b, projResetsAt: R + 5 * 3600 }, NOW + 10 * MIN), '⑤ …the NEXT window (R + 5 h) ⇒ a new question');
    ok(projectionBucketBought({ ...b, projResetsAt: R + 60 }, NOW) && projectionBucketBought({ ...b, projResetsAt: 0 }, NOW), '⑤ …a minute of disagreement (the estimate\'s rounding) or an unknown crossing window is the same window');
    ok(PROJECTION_RECORD_MAX_MS === 8 * 86400e3, '⑤ PROJECTION_RECORD_MAX_MS = 8 d (no vendor window exceeds 7 d)');
    const ms = { '5h': { at: NOW - 2 * 3600e3 + 20 * MIN, resetsAt: NOW + 3 * 3600e3, boughtAt: NOW - 2 * 3600e3 } }; // resetsAt in MILLISECONDS
    const d30 = { '7d': { at: NOW, resetsAt: NOW / 1000 + 30 * 86400, boughtAt: NOW } };
    ok(!projectionBucketBought({ projLabel: '5h', projReads: ms }, NOW) && !projectionBucketBought({ projLabel: '7d', projReads: d30 }, NOW), '⑤ a record whose resetsAt cannot be a window (ms-shaped: year 58 700; 30 days out) silences nothing (red on quota r2: honoured for good)');
    ok(Object.keys(projectionReadsAfter(ms, null, NOW)).length === 0 && Object.keys(projectionReadsAfter(d30, null, NOW)).length === 0, '⑤ …and is pruned from the memory');
    const w = await run(makeWorld({ members: [slowMember()], sessions: [{ on: 'm1', model: 'claude-opus-5-5' }], stateFile: { v: 1, attempts: {}, fails: {}, projReads: { m1: { '5h': { at: T0, resetsAt: T0 + 3 * 3600e3, boughtAt: T0 - 2 * 3600e3 } } } } }), 60);
    ok(w.proj().length === 1 && !(w.state().projReads.m1['5h'].resetsAt > 1e12), '⑤ the loop with a ms-poisoned state file still spends the projection read (and the file heals)', { reads: w.reads(), st: w.state() });
  }
  {
    // a producer that ANSWERS WITHOUT A READING: usage-routes now answers false for a refused typed write (pinned with a
    // mutant in test-new-member-wake §9c); here the loop half — a false answer takes the failure backoff, never the floor
    const S = [{ on: 'm1', model: 'claude-opus-5-5' }];
    const w = makeWorld({ members: [slowMember({ minutes: 300 })], sessions: S }); w.setMode('fail');
    await run(w, 120);
    ok(w.spawns.length <= 5, `⑤ a refused write (the producer answers false) is paced by the failure backoff: ${w.spawns.length} spawns in 2 h (the control below: a producer answering true for it spawns every floor)`, w.spawns.map((x) => (x.t - T0) / MIN));
    const wl = makeWorld({ members: [slowMember({ minutes: 300 })], sessions: S }); wl.setMode('lie');
    await run(wl, 120);
    ok(wl.spawns.length >= 15, `⑤ CONTROL: the same world with a producer that answers true without writing spawns ${wl.spawns.length} times — the loop's pacing depends on the producer's boolean, which is why the producer's answer IS its write`, wl.spawns.length);
  }

  // ④ THE FLEET (10 members × 3 sessions, 3 h): one projection read per member whatever the arrivals
  for (const [label, poisson, everyMs] of [['constant 3 requests/min', false, 20e3], ['Poisson mean 3/min', true, 20e3], ['Poisson mean 1 per 2 min (sparse)', true, 120e3]]) {
    const members = [], sessions = [];
    for (let i = 0; i < 10; i++) { const m = slowMember({ id: 'm' + i, poisson, everyMs, seed: 11 + i, u0: 0.90 + i * 0.003 }); m.rates.fiveHour = (0.0005 / 3) * (everyMs / 20e3); members.push(m); for (let k = 0; k < 3; k++) sessions.push({ on: m.id, model: 'claude-opus-5-5' }); }
    const w = makeWorld({ members, sessions });
    const perHour = []; for (let h = 0; h < 3; h++) { const b = w.spawns.length; await run(w, 60); perHour.push(w.spawns.length - b); }
    const per = {}; for (const x of w.proj()) per[x.key] = (per[x.key] || 0) + 1;
    const readMembers = new Set(w.spawns.map((x) => x.key));
    ok(Object.values(per).every((n) => n === 1) && Object.keys(per).length >= 8 && readMembers.size === 10 && perHour[0] <= 20, `④ fleet, ${label}: at most ONE projection read per member (a member the one-per-tick slot reached late is read by its age rung instead), every member read, ${perHour.join('/')} spawns per hour (red on quota r1 under sparse Poisson: 42 projection reads in the first hour)`, { perHour, per });
  }
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
