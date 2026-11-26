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
// bucket) — at most two small writes per 60 s tick. B-574d: THE STORE WRITER
// writes it (off the hub's loop, every byte or nothing, synced), and the spawn
// WAITS for the stamp's landing (durable): a stamp not on disk is no ask — this
// tick spawns nothing, said once — so «on disk before the ask» stays true; the
// writer's exit flush carries the after-write at a stop. A missing file starts empty
// silently (first boot). AN UNREADABLE ONE IS «UNKNOWN: WAIT THE LONGEST»,
// NEVER «NO BACKOFF» (the ban-safety law, 主开发 r3003 / r3019): a file that is
// there and could not be read — a failed read, bytes that do not parse, not an
// object — may have held any backoff, so every account this life has not
// asked waits UNKNOWN_WAIT_MS (the longest backoff, 5 min × 2^6) from the
// start that met it: no /usage call is ever made sooner because the file
// failed to read. ONE warn line names it. NOTHING IS WRITTEN OVER THE FILE
// while unknown (saveState refuses: an unprobeable row's said-once memory
// stays in memory meanwhile — a write of the empty maps would be read at the
// next start as «no backoff»), so a restart meanwhile reads the same file
// again: still unknown ⇒ the wait again from that start; readable ⇒ its own
// pacing. The tick ends the unknown once the wait has passed (a clock that
// stepped back moves its start to now); past it the old bytes pace nothing
// (every backoff, idle and active cadence is shorter) and the next save
// writes the state over them. The drift/age rungs are restart-safe by construction;
// the projection's `age >= floorMs` guard is the floor without the file.
// THE CLOCK CAN STEP BACK (quota r3: a VM snapshot restore, an NTP step after
// suspend): a stamp in the FUTURE would pin every rung of that account off
// until the wall clock passed it — and since nothing spawns, nothing rewrites
// the file. At load and on every tick (`clampStamps`) an attempt stamp is
// clamped to `now` (a step back costs at most one floor, never the step) and a
// bought-bucket record from the future (beyond a 60 s skew) is dropped — a
// purchase that has not happened yet is no knowledge of the current window.
// AN ACCOUNT THE PROBE CANNOT PROVE IS NEVER SENT (lane auto-cli-oat-unprobeable,
// 2026-10-22: six oat-only rows booked 11–36 "failed" probes each — the probe
// door refuses them by name, no spawn — and backed off for ever; their readings
// were 35–48 h old and nothing said why). src/auto-cli-model.js
// probeEligibility is the verdict the loop, the probe door and the row share
// (its addendum: an oat-only row whose token carries user:profile, on a CLI
// measured with it in the folder and written there, IS probeable — the same
// rung, the same spawn); an unprobeable account costs NO attempt, NO failure,
// NO backoff; the loop says it ONCE a day per kind (`said`, `<id>|<kind>`,
// persisted beside the attempt clock) and clears what the base booked
// against it (its old attempts and failures, said on that line). A probeable
// account's failed probe names its reason on the journal line (the probe
// door's verdict for THIS attempt, already scrubbed by probeWhyText).
// THE ORDER OF A SPAWN (quota r3): stamp → save → spawn → the backoff and the
// bought bucket → save → THEN the engine wake (its own try — an engine
// exception can never skip the loop's bookkeeping) → the journal line.
// ONE IDENTITY, ONE MEMORY (quota r3): two account ids over one org-merged
// identity (usageIdentityGroupsCached) share a reading, so they share the
// bought buckets and the attempt floor — a purchase is written under every id
// of the group, and each id reads the group's merged memory. Since B-87fd unit 4
// the memory is the groups' PACING set (主开发 r3311 MUST 2): rows not proven
// different pace as one, as the release grouped them (never more asks).
const fs = require('fs');
const path = require('path');
const usageWrite = require('../usage-cache-write.js');   // lane lg-store-writes U6.4: a reading is read through the cache module
const { decideCliRefresh, cliRefreshWhy, projectionReadsAfter, projectionBucketBought, PROJECTION_WINDOW_MS } = require('../account-pool-auto.js');
const { cliRefreshDrift } = require('../usage-estimator.js');
const { withOwnAbsence } = require('../quota-model.js'); // PURE: a sibling's 5h window never outranks this account's «no 5h limit»
const SR = require('../store-read.js');   // 主开发 r4771: the ONE classifier of a read's answer (data / missing / torn / unreadable)
const { capsOf } = require('../backend-caps.js'); // PURE: caps.quotaProbe — the harness whose quota rung IS `<cli> -p /usage`
const { probeEligibility, isUnprobeable, notProbedWords, NOT_PROBED_SAY_MS, probeWhyText, SIGNIN_UNKNOWN } = require('../auto-cli-model.js'); // PURE: may the panel probe PROVE this account (lane auto-cli-oat-unprobeable)

const STATE_FILE = 'auto-cli-state.json';
const ATTEMPT_KEEP_MS = 24 * 3600e3; // an attempt older than a day paces nothing (the longest backoff is 5 min × 2^6 = 5.3 h)
const READ_AGAIN_MS = 30e3;   // 主开发 r5030 (a): the read again at the wait's end answers within this — past it the read is UNREADABLE (the wait starts again, said once): a hung folder never holds the tick for ever in silence
const STAMP_LANDING_MS = 30e3;   // B-574d (主开发 r4732 3): the stamp's landing waited for at most this long — past it a FAILED landing (no spawn, said once), never a tick held for ever
const UNKNOWN_WAIT_MS = 5 * 60e3 * Math.pow(2, 6); // a state that could not be read: every unasked account waits the longest backoff (the ban-safety law)
const CLOCK_SKEW_MS = 60e3; // a stamp further in the future than this is a clock that stepped back, not a race

/** Clamp every stamp to `now` (quota r3) — returns how many it moved. */
function clampStamps(st, now) {
  let n = 0;
  for (const [k, v] of st.attempts) if (v > now) { st.attempts.set(k, now); if (v > now + CLOCK_SKEW_MS) n++; }
  for (const [k, v] of (st.said || [])) if (v > now) st.said.set(k, now); // a "not probed" line stamped in the future would only stay quiet
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
  const st = { attempts: new Map(), fails: new Map(), projReads: new Map(), said: new Map() };
  const fp = path.join(dataDir, STATE_FILE);
  // THE BAN-SAFETY LAW: a file there that could not be read is «unknown» (`unknownAt` = this start) — never «no backoff»
  const unknown = (why) => { st.unknownAt = now; warn(`[auto-cli] pacing state unreadable, unknown: ${why} — every account waits the longest backoff (${Math.round(UNKNOWN_WAIT_MS / 60e3)} min) before its next /usage read`); return st; };
  let text = null; try { text = fs.readFileSync(fp, 'utf-8'); } catch (e) { return e && e.code === 'ENOENT' ? st : unknown(e.message); }
  let raw = null; try { raw = JSON.parse(text); } catch (e) { return unknown(e.message); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return unknown(`not an object (${Array.isArray(raw) ? 'array' : typeof raw})`);
  return fieldsOf(raw, now, warn, st);
}
/** the state's fields from a parsed file (an object), through the start's own filters: a stale stamp dropped, a future one clamped
 *  (said), an expired bucket pruned — the start's read and the read again at the end of the unknown wait (主开发 r4771) share it */
function fieldsOf(raw, now, warn = () => {}, st = { attempts: new Map(), fails: new Map(), projReads: new Map(), said: new Map() }) {
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  for (const [k, v] of Object.entries(obj(raw.attempts))) if (Number.isFinite(v) && now - v < ATTEMPT_KEEP_MS) st.attempts.set(k, v);
  for (const [k, v] of Object.entries(obj(raw.fails))) if (Number.isFinite(v) && v > 0) st.fails.set(k, v);
  for (const [k, v] of Object.entries(obj(raw.projReads))) st.projReads.set(k, v);
  for (const [k, v] of Object.entries(obj(raw.said))) if (Number.isFinite(v) && now - v < NOT_PROBED_SAY_MS) st.said.set(k, v);
  const moved = clampStamps(st, now);
  if (moved) warn(`[auto-cli] pacing state held ${moved} stamp(s) in the future (the clock stepped back) — clamped to now`);
  for (const [k, v] of [...st.projReads]) {
    const kept = projectionReadsAfter(v, null, now);
    if (Object.keys(kept).length) st.projReads.set(k, kept); else st.projReads.delete(k);
  }
  return st;
}
/** 主开发 r4748 / r4771: what the file holds MERGED into this process's memory — every stamp the later, every count the larger, every
 *  bucket kept (one label in both: the later purchase). PURE over the two states; `st` is changed in place → st */
function mergeState(st, got) {
  const later = (m, k, v) => { const h = m.get(k); if (h == null || v > h) m.set(k, v); };
  for (const [k, v] of got.attempts) later(st.attempts, k, v);
  for (const [k, v] of got.fails) later(st.fails, k, v);
  if (!st.said) st.said = new Map();
  for (const [k, v] of (got.said || [])) later(st.said, k, v);
  for (const [k, reads] of got.projReads) {
    const mine = { ...(st.projReads.get(k) || {}) };
    for (const [lab, r] of Object.entries(reads || {})) { const h = mine[lab]; if (!h || (Number(r && r.boughtAt) || 0) > (Number(h.boughtAt) || 0)) mine[lab] = r; }
    st.projReads.set(k, mine);
  }
  return st;
}
function saveState(dataDir, st, warn, W = null, boundMs = STAMP_LANDING_MS) {
  // r4732 (6a): while the unknown wait runs NO candidate is picked (the tick's `if (st.unknownAt != null) continue`), so no spawn waits on this
  if (st.unknownAt != null) return Promise.resolve(true);   // never over a state file that could not be read, while its wait runs (the ban-safety law) — nothing owed, as before
  if (!dataDir) return Promise.resolve(true);   // r4732 (6b): a loop with no data folder (an embedding's; production always has one) keeps no state file: nothing to land — the release warned at each write
  const fp = path.join(dataDir, STATE_FILE);
  const doc = { v: 1, attempts: Object.fromEntries(st.attempts), fails: Object.fromEntries([...st.fails].filter(([, n]) => n > 0)), projReads: Object.fromEntries(st.projReads), said: Object.fromEntries(st.said || []) };
  const body = JSON.stringify(doc);
  // B-574d (lane lg-text-legs-3): THE STORE WRITER writes it (src/store-writer.js) — the answer is its LANDING (true / false); a failed write is
  // said loud, and the in-memory state still paces this process
  try {
    const w = W || require('../store-writer.js').storeWriter();
    // 主开发 r4786: a failed write is said ONCE until a write lands (a dead mount fails every save of every tick); st.writeFailSaid lives in
    // memory only (the doc above names every field written)
    w.dirty(fp, { name: 'auto-cli-state.write', makeDir: true, produce: () => body, onWritten: (ok, e) => { if (ok) { st.writeFailSaid = false; return; } if (!st.writeFailSaid) { st.writeFailSaid = true; warn(`[auto-cli] pacing state write failed: ${(e && (e.code || e.message)) || e} — said once until a write lands`); } } });
    // the landing of THESE bytes: the writer's durable() waits for the version this dirty() made (its waiter is keyed by s.version
    // at the call; an earlier write of the same file landing settles only its own, lower version — src/store-writer.js durable /
    // settled), bounded twice: the writer's own timeout and a timer here (a lost thread, a hung mount: false past the bound) — the
    // loop's timer is the ONLY guard against a writer that never answers at all, so it stays beside the writer's own
    let timer = null;
    const bound = new Promise((resolve) => { timer = setTimeout(() => resolve(false), boundMs); if (timer.unref) timer.unref(); });
    return Promise.race([Promise.resolve(w.durable(fp, { timeoutMs: boundMs })), bound]).then((ok) => { clearTimeout(timer); return ok === true; }, () => { clearTimeout(timer); return false; });
  } catch (e) { if (!st.writeFailSaid) { st.writeFailSaid = true; warn(`[auto-cli] pacing state write failed: ${e.message} — said once until a write lands`); } return Promise.resolve(false); }
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
 *   memberServeLapsed (optional: a LAPSED subscription keeps the idle cadence, no failure backoff),
 *   usageIdentityGroupsCached, usageEstimator, projectionRereadFor,
 *   projectionBillingIndex (optional: ONE who-bills-where pass per tick, handed
 *   to every projectionRereadFor call of that tick — prod-stall-202),
 *   lastMemberReadAt, usage (refreshViaCliPanel + panelVerdictFor — a failure's reason), onMemberReadingFresh, dataDir;
 *   now/rand/log/warn/metric injectable for the suites.
 */
function createAutoCliLoop(d) {
  const landingMs = Number.isFinite(d.stampLandingMs) ? d.stampLandingMs : STAMP_LANDING_MS;   // a suite's short bound; the real one otherwise
  const readAgainMs = Number.isFinite(d.readAgainMs) ? d.readAgainMs : READ_AGAIN_MS;   // the same: a suite's short bound for the read again
  let stampUnlanded = false;   // B-574d: «a stamp did not land» said once until one lands
  let afterUnlanded = false;   // r4764: «an after-write did not land» said once until one lands (the same latch)
  let owed = [];   // r4732 (5): saves of this tick that are not the stamp's — awaited before the tick ends
  const now0 = (d.now || Date.now)();
  const clock = d.now || Date.now, rand = d.rand || Math.random;
  const log = d.log || ((l) => console.log(l)), warn = d.warn || ((l) => console.warn(l));
  const st = loadState(d.dataDir, now0, warn);
  if (!st.said) st.said = new Map(); // a state built by hand (a suite's in-memory copy) carries no say-memory
  const { attempts, fails, projReads, said } = st;
  const jitter = 1 + rand() * 0.4; // per-boot 45–63min active-burn cap
  // AN UNPROBEABLE ACCOUNT (lane auto-cli-oat-unprobeable): true ⇒ skipped with no attempt and no failure; what the
  // base booked against it is cleared (and said); the line — naming the fact that failed — is said once a day per
  // kind (a row whose reason changes says the new one). Returns whether to skip.
  function unprobeable(a, now) {
    const el = probeEligibility(a);
    if (!isUnprobeable(el)) return false;
    const booked = fails.get(a.id) || 0, stamped = attempts.has(a.id);
    if (booked || stamped) { fails.delete(a.id); attempts.delete(a.id); }
    const sk = `${a.id}|${el}`;
    if (booked || stamped || !(now - (said.get(sk) || 0) < NOT_PROBED_SAY_MS)) {
      said.set(sk, now);
      owed.push(saveState(d.dataDir, st, warn, d.storeWriter, landingMs));
      log(`[auto-cli] quota refresh ${a.id}: not probed — ${notProbedWords(el, a)}${booked ? ` (${booked} failed attempt${booked === 1 ? '' : 's'} booked before this cleared)` : ''}`);
    }
    return true;
  }
  // ONE TICK AT A TIME (round wldn7whag, the owner's rule: never more probes than ruled): the tick awaits its sign-in facts at its
  // head — on a stalled share a second tick could enter meanwhile; it returns at once instead
  // 主开发 r4748 / r4771: THE ONE READ AGAIN, at the tick that ends the unknown wait — one async read (fs.promises), never a look on a
  // cadence. Its answer: the state → MERGED into memory (mergeState); no file → nothing to merge; an error of the FILE SYSTEM (it may
  // heal) → the wait starts again, said once a wait; TORN BYTES (read whole, not the state: they never heal) → kept aside ONCE under
  // the hold's dated name (src/store-hold.js setAside's), and the loop goes on with its memory, as the release did — never an
  // automatic read paused for ever on a file nobody can mend. The wait ends only here: while it runs nothing is picked or written.
  // 主开发 r5061 (1): AT MOST ONE READ OF THE STATE FILE IS EVER OUT — the read that has not answered is KEPT here; while it is out no new
  // read is started (a data folder that stays hung pins ONE thread of the hub's file pool, never one more each wait's end)
  let readOut = null;
  async function readAgain(now) {
    if (!d.dataDir) { st.unknownAt = null; return; }
    const statePath = path.join(d.dataDir, STATE_FILE);   // its own name: the sync-fs census reads a path by its name across the file
    // r5030 (a): BOUNDED — a read with no answer past readAgainMs is an error of the file system (ETIMEDOUT): the wait starts again, said once.
    // r5061 (1): the read that missed its bound stays OUT; at the next wait's end, while it is still out, none is started and the tick takes
    // it as unreadable again (the same words, said once a wait); when it answers at last its bytes go to nobody (the race settled already),
    // and the next wait's end may read anew
    const timedOut = () => ({ error: Object.assign(new Error(`no answer in ${Math.round(readAgainMs / 1000)} s`), { code: 'ETIMEDOUT' }) });
    let read;
    if (readOut) read = timedOut();
    else {
      const mine = readOut = fs.promises.readFile(statePath, 'utf-8').then((text) => ({ text }), (error) => ({ error }));
      mine.then(() => { if (readOut === mine) readOut = null; });
      let timer = null;
      const bound = new Promise((resolve) => { timer = setTimeout(() => resolve(timedOut()), readAgainMs); if (timer.unref) timer.unref(); });
      read = await Promise.race([mine, bound]);
      clearTimeout(timer);
    }
    const a = SR.storeAnswer(read, { valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v) });
    if (a.state === 'data') { mergeState(st, fieldsOf(a.value, now, warn)); st.unknownAt = null; warn('[auto-cli] pacing state read again at the end of its unknown wait — merged into memory (every stamp the later, every count the larger, every bucket kept)'); return; }
    if (a.state === 'missing') { st.unknownAt = null; return; }
    if (a.state === 'corrupt') {
      const aside = `${statePath}.damaged-${new Date(now).toISOString().replace(/[:.]/g, '-')}`;
      let kept = null, why = null; try { await fs.promises.rename(statePath, aside); kept = path.basename(aside); } catch (e) { why = (e && (e.code || e.message)) || String(e); }
      // r5030 (b): WHERE THIS STORE DIFFERS FROM THE STORE-READ LAW (src/store-read.js afterSetAside: torn bytes that could not be set
      // aside are «unreadable», never written over): here the next save writes over them — torn pacing bytes carry no readable stamp,
      // and r4771 ruled the loop never paused for ever on a file nobody can mend
      st.unknownAt = null;
      warn(kept ? `[auto-cli] pacing state's bytes are torn (${a.code}) — kept aside as ${kept}; the loop goes on with its memory`
        : `[auto-cli] pacing state's bytes are torn (${a.code}) and could not be kept aside (${why}) — the loop goes on with its memory; its next save writes over them`);
      return;
    }
    st.unknownAt = clock();   // r5061 (3): the wait counted from the clock read AFTER the read gave up (never up to its bound early)
    warn(`[auto-cli] pacing state still unreadable (${a.code}) — the longest backoff starts again (${Math.round(UNKNOWN_WAIT_MS / 60e3)} min) before any /usage read`);
  }
  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      if (d.serverSetting('accounts.onDemandQuotaRefresh') !== 'auto-cli') return;
      // THE TIMER ROW (B-360d, 主开发 r1221): the sign-in facts confirmed OFF the loop first — awaited, each ask bounded by the
      // file door's deadline — then the decision road's rows; a row not confirmed decides NOTHING: no probe this tick
      const { since: factsSince } = await d.accounts.signinFactsSettled();
      let now = clock();
      if (clampStamps(st, now)) warn('[auto-cli] the clock stepped back — pacing stamps clamped to now');
      if (st.unknownAt != null) { if (st.unknownAt > now) st.unknownAt = now; else if (now - st.unknownAt >= UNKNOWN_WAIT_MS) { await readAgain(now); now = clock(); } }   // r5030 (c): the clock read again after the read (a slow read never makes this tick's stamps older than its spawns); the unknown state's wait: its end (a step back starts it at now)
      const list = [];
      // idle threshold re-rolls EVERY tick inside the owner's 30–60min band —
      // a wandering threshold, not a fixed cadence
      const idleMaxAgeMs = 30 * 60e3 * (1 + rand());
      // who bills where — resolved ONCE per tick, on the first account that asks, and dropped with
      // the tick (prod-stall-202: per account it was accounts × sessions synchronous login-file reads,
      // 6–15 s stalls on production). No await runs before `list` is complete: the index never
      // outlives the synchronous segment that built it, so a session added or a link re-pointed is
      // seen by the next tick exactly as before.
      let billing;
      const billingIndex = () => (billing === undefined ? (billing = d.projectionBillingIndex ? d.projectionBillingIndex() : null) : billing);
      for (const a of (d.accounts.decisionList({ since: factsSince }).accounts || [])) {
        if (probeEligibility(a) === SIGNIN_UNKNOWN) continue;   // no attempt, no failure, nothing said (a skipped probe costs nothing)
        if (a.type !== 'subscription' || a.pooled || capsOf(a.backend).quotaProbe !== 'cli-usage' || unprobeable(a, now) || !d.autoCliReady(a.id)) continue; // auto-cli spawns `claude -p /usage` — claude accounts only, an account the probe cannot PROVE is never sent (oat-only / no login — unprobeable, lane auto-cli-oat-unprobeable), and NOT READY IS NOT FAILED (autoCliReady, 2026-09-08)
        let raw = null, mem = [a.id];
        // r3136 (主开发 r3146 (5)): a reading file whose READ FAILS NOW asks NO probe — its answer could not be written (the write is
        // refused): fewer vendor calls, never more. The loop asks the file itself, not the reading door: once the file reads again
        // a probe is what lands the readings owed in memory, so the account is judged by its own schedule at once (the file's own
        // age: one probe at most, no catch-up burst). Not there, or torn bytes: the ordinary first read (no reading) — that read's
        // write keeps torn bytes aside and starts the file again
        let readFailed = false;
        try { raw = usageWrite.readCacheJson(path.join(d.USAGE_CACHE_DIR, a.id + '.json')); } catch (e) { raw = null; readFailed = !!e && e.code !== 'ENOENT' && !(e instanceof SyntaxError); }
        if (readFailed) continue;
        const ownFetchedAt = (raw && raw.fetchedAt) || 0;   // the row's OWN reading's age: the pick inside a pacing set rotates on it (r3680)
        try {
          // THE PACING MEMORY (B-87fd identity unit 4, 主开发 r3311 MUST 2 — §ban-safety): the rows the one comparison does not prove
          // DIFFERENT pace as ONE (the engine's `pacing`: the release's grouping less the proven splits) — the attempt floor, the
          // bought buckets and the freshest reading's age — never more automatic asks for what may be one account than the release
          // made; each row still files and decides on its own reading. A groups map with no `pacing` paces by its groups
          const gs = d.usageIdentityGroupsCached(), pace = gs && gs.pacing ? gs.pacing.get(a.id) : null;
          if (pace) {
            mem = [a.id, ...pace.ids.filter((x) => x !== a.id)];
            if (pace.cache && (pace.cache.fetchedAt || 0) > (raw?.fetchedAt || 0)) raw = withOwnAbsence(pace.cache, raw); // (no-5h-window r5)
          } else for (const [, g] of gs) {
            if (!g.accountIds.includes(a.id)) continue;
            mem = [a.id, ...g.accountIds.filter((x) => x !== a.id)]; // one identity, one memory (quota r3)
            if (g.cache && (g.cache.fetchedAt || 0) > (raw?.fetchedAt || 0)) raw = withOwnAbsence(g.cache, raw); // (no-5h-window r5)
            break;
          }
        } catch { }
        // never-read accounts (no cache at all) ride the idle rung with fetchedAt 0 —
        // their first auto-cli read IS the bootstrap; failure backoff bounds retries
        const f = fails.get(a.id) || 0;
        // A LAPSED SUBSCRIPTION (2026-10-08) stays on this rung at the idle cadence — its failures do NOT
        // back off to hours: the next read after a renewal is the evidence that re-admits it (memberServeLapsed)
        const lapsed = !!(d.memberServeLapsed && d.memberServeLapsed(a.id));
        if (st.unknownAt != null) continue;   // the state unread: «unknown — wait the longest» (the ban-safety law; the tick above ends it)
        if (lapsed ? now - (attempts.get(a.id) || 0) < idleMaxAgeMs : (f > 0 && now - (attempts.get(a.id) || 0) < 5 * 60e3 * Math.pow(2, Math.min(f, 6)))) continue;
        let est = null; try { est = raw ? d.usageEstimator.estimateFor(a.id, raw, now) : null; } catch { }
        // B-a5c0: a raw bucket whose window already reset is NO control for the
        // logged drift (it printed a 100-point "drift" old-window-vs-new); the
        // scheduler keeps its inputs (triggerDrift/moved) — the refresh was right
        const dr = cliRefreshDrift(est, raw, now);
        const pj = d.projectionRereadFor(a.id, now, billingIndex()), reads = mergedReads(mem);
        // ONE attempt clock for both schedulers (lastMemberReadAt, 2026-09-08); pj = the estimator's PROJECTION (B-f69c ③):
        // a crossing before the next scheduled read asks this same rung now — once per BUCKET (projLabel/projResetsAt vs projReads, quota r2)
        list.push({ key: a.id, fetchedAt: raw?.fetchedAt || 0, ownFetchedAt, lastAttemptAt: Math.max(...mem.map((x) => Math.max(attempts.get(x) || 0, d.lastMemberReadAt(x) || 0))), estDriftPct: dr.triggerDrift, activeBurn: dr.moved, drift: dr.drift, rolled: dr.rolled, projCrossInMs: pj ? pj.inMs : null, estBurnPtPerMin: pj ? pj.burnPtPerMin : 0, projLabel: pj ? pj.label : null, projResetsAt: pj ? (pj.resetsAt || 0) : 0, projReads: reads, projReadCrossAt: lastBoughtInstant(reads), pj, mem });
      }
      const picks = decideCliRefresh(list, now, { maxAgeMs: 45 * 60e3 * jitter, idleMaxAgeMs }); const attemptWas = new Map(picks.map((k) => [k, attempts.get(k)]));   // B-360d: given back if the door could not read the sign-in
      for (const key of picks) {
        const it = list.find((x) => x.key === key), why = cliRefreshWhy(it && { ...it, lastAttemptAt: 0 }, now, { maxAgeMs: 45 * 60e3 * jitter, idleMaxAgeMs }); // the pick's own reason (the attempt floor already passed)
        attempts.set(key, now);
        // the attempt reaches disk BEFORE the spawn (quota r3: a restart mid-spawn must see it) — B-574d: the spawn WAITS for the stamp's
        // landing (the store writer's own answer); a stamp NOT on disk is NO ASK: the attempt given back, this pick skipped, said once
        if ((await saveState(d.dataDir, st, warn, d.storeWriter, landingMs)) !== true) {
          if (attemptWas.get(key) == null) attempts.delete(key); else attempts.set(key, attemptWas.get(key));
          if (!stampUnlanded) { stampUnlanded = true; warn(`[auto-cli] quota refresh ${key}: not asked — its attempt stamp did not reach the disk (the ban-safety law: never an ask a restart could not see); asked again when a stamp lands`); }
          continue;
        }
        stampUnlanded = false;
        // B-5279: the door's refusals (refresh-off / -no-reader / -held) give the attempt back below — only when the row turns off or the settings become held inside a tick (the loop runs only in auto-cli): never a more frequent read
        let ok = false; try { ok = !!(await d.usage.refreshViaCliPanel(key)); } catch { ok = false; }
        // B-360d: the door read the sign-in again NOW and could not — nothing was asked: no failure booked, the attempt given back
        // (in memory: the next save carries it — a restart before it keeps the stamped attempt, which only paces the next try)
        if (!ok) {
          let pv0 = null; try { pv0 = d.usage.panelVerdictFor?.(key); } catch { }
          if (pv0 && pv0.at >= now && /^(sign-in-unknown|refresh-off|refresh-no-reader|refresh-held)$/.test(pv0.code)) { if (attemptWas.get(key) == null) attempts.delete(key); else attempts.set(key, attemptWas.get(key)); continue; }
        }
        // A FAILED PROBE NAMES ITS REASON (lane auto-cli-oat-unprobeable): the probe door's verdict for THIS attempt (stamped
        // after this tick's clock) — its class and the CLI's first line, scrubbed there (probeWhyText again here: the ONE
        // scrub, idempotent)
        let failWhy = '';
        if (!ok) { try { const pv = d.usage.panelVerdictFor?.(key); if (pv && pv.at >= now && pv.why) failWhy = `${probeWhyText(pv.why)} [${pv.code || pv.outcome || 'failed'}]`; } catch { } }
        fails.set(key, ok ? 0 : (fails.get(key) || 0) + 1);
        // a successful read BUYS its bucket's window: a projection read, or ANY read taken while the bucket's crossing is inside
        // the projection window (quota r3 — it is the same number) — never asked again before that window resets. A failed read
        // bought nothing (the failure backoff paces its retry). Written under every id of the identity (quota r3).
        if (ok && it && it.pj && (why === 'projection' || (Number(it.pj.inMs) > 0 && Number(it.pj.inMs) <= PROJECTION_WINDOW_MS))) {
          for (const k of (it.mem || [key])) projReads.set(k, projectionReadsAfter(projReads.get(k), it.pj, now));
        }
        // the backoff and the bought buckets outlive a restart (quota r2) — AWAITED before the next pick and before the tick ends (r4732 (5)):
        // a kill of the hub inside the writer's latency loses this ask's backoff step and bought bucket; the stamp, already on disk, still
        // paces the next start by the attempt floor (the release's own window: its synchronous write right after the ask)
        const afterLanded = await saveState(d.dataDir, st, warn, d.storeWriter, landingMs);
        if (afterLanded !== true) { if (!afterUnlanded) { afterUnlanded = true; warn(`[auto-cli] quota refresh ${key}: its backoff and bought bucket did NOT reach the disk — a restart now would lose them (the stamp on disk still paces the next ask); said once until one lands`); } } else afterUnlanded = false;
        if (ok) { try { d.onMemberReadingFresh(key, 'auto-cli refresh'); } catch (e) { warn(`[auto-cli] reading wake failed for ${key}: ${e.message}`); } } // the THIRD producer of a fresh reading takes the SAME edge (2026-09-08: its 02:31:43 success changed nothing) — AFTER the bookkeeping (quota r3)
        log(`[auto-cli] quota refresh ${key}: ${ok ? 'ok' : 'failed'} (${why || '?'}; ${it?.drift == null ? (it?.rolled ? 'no drift control — the reading\'s window already reset' : 'no drift control') : `drift ${Math.round(it.drift)}pt`}${it?.pj ? `; ${it.pj.label} crosses its ${it.pj.line}% line in ~${Math.max(1, Math.round(it.pj.inMs / 60e3))} min at ${it.pj.pctPerMin}%/min` : ''})${failWhy ? ` — ${failWhy}` : ''}`);
        (d.metric || global.__vsMetric)?.('auto-cli-refresh-ms', 0);
      }
    } catch (e) { warn('[auto-cli] tick failed: ' + e.message); }
    finally {
      // r4732 (5): the tick's other saves (a «not probed» row's) land before the tick ends — a promise wait, nothing on the loop
      const mine = owed; owed = [];
      try { const got = await Promise.all(mine); if (got.some((ok) => ok !== true)) warn('[auto-cli] a pacing state write did NOT reach the disk this tick — a restart now would lose it'); } catch { }
      ticking = false;
    }
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

module.exports = { createAutoCliLoop, loadState, saveState, mergeState, fieldsOf, clampStamps, lastBoughtInstant, STATE_FILE, UNKNOWN_WAIT_MS, STAMP_LANDING_MS, READ_AGAIN_MS, projectionBucketBought };
