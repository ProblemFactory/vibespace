// Quota dead-reckoning ESTIMATOR (B-fcff v2, 2.263.0) — the prediction layer
// on top of the 2.261.0 anchor data foundation. Between ground-truth readings
// (anchors) it estimates each bucket's CURRENT utilization as
//   est_u = anchor_u + rate × ledger_cost_since_anchor
// with per-identity per-bucket rates LEARNED from the accumulated anchor pairs
// and re-derived automatically as data grows (weighted least squares through
// the origin: rate = Σ Δu / Σ cost — integer-% quantization noise averages
// out as total Δu accumulates; single-pair rates are ±3× noise, NEVER use
// them directly). Zero API calls anywhere (§ban-safety): inputs are the local
// anchor files + the local usage-history ledger only.
//
// PRIORS: seeded from the measured ProblemFactory Max quotas (2026-08-09,
// odometer method over full windows, 5 anchors self-consistent to ±3%):
// 5h ≈ $500, 7d ≈ $1730, Fable weekly ≈ $875 API-equivalent. Blended as a
// pseudo-pair with Δu-weight PRIOR_WEIGHT_DU so real observations dominate
// once an identity has ~15%+ of observed utilization movement. Caveat: these
// are Max-20x numbers — a Pro account starts ~4-10× off and self-corrects as
// its own pairs accumulate (the limit banner remains the hard backstop).
//
// Rates learn the EFFECTIVE local rate: an identity consuming on other
// devices too (the org-account ~1/7 case) learns a proportionally HIGHER
// rate per local dollar — external share is absorbed automatically as long
// as it stays roughly stable. Pod-exclusive accounts converge to 1/full.
const fs = require('fs');
const path = require('path');

// Δu-equivalent weight of the prior pseudo-observation.
const PRIOR_WEIGHT_DU = 0.15;
// Measured Max-20x full-quota sizes in API-equivalent USD (see header).
const CLAUDE_MAX_PRIOR_FULL_USD = { fiveHour: 500, sevenDay: 1730, 'scoped:fable': 875 };
const WEEK_SEC = 7 * 86400;

function normU(u) {
  const n = Number(u);
  if (!Number.isFinite(n)) return null;
  if (n > 1.5) return Math.min(n / 100, 1.5); // integer-% reading
  return Math.max(0, n);
}
function scopedKey(name) { return 'scoped:' + String(name || '').trim().toLowerCase(); }
// Which ledger model family a scoped bucket's cost comes from ('Fable' → the
// fable-family column; unknown scope names fall back to total cost).
function scopedFamily(name) {
  const n = String(name || '').toLowerCase();
  for (const fam of ['fable', 'opus', 'sonnet', 'haiku']) if (n.includes(fam)) return fam;
  return null;
}
function costForKey(key, costSince) {
  if (!costSince) return null;
  if (key === 'fiveHour' || key === 'sevenDay') return Number(costSince.total) || 0;
  const fam = scopedFamily(key.slice('scoped:'.length));
  if (fam && costSince.byFamily && Number.isFinite(Number(costSince.byFamily[fam]))) return Number(costSince.byFamily[fam]) || 0;
  return Number(costSince.total) || 0;
}

// Per-bucket (Δu, cost) observations from an identity's anchor lines. Each
// line's costSince covers [prevFetchedAt, fetchedAt] — the base anchor is
// matched BY fetchedAt (identity files can interleave sources; positional
// adjacency is not guaranteed). Guards: a reset crossing inside the pair
// (resetsAt moved >120s) voids the bucket's pair; a utilization DECREASE
// beyond quantization jitter (>0.02) without a reset change is an anomaly
// (skip); small negatives clamp to 0 with the cost still counted (the spend
// really happened — dropping it would bias rates high).
function extractPairs(lines) {
  const byFetched = new Map();
  for (const l of lines || []) if (l && l.fetchedAt) byFetched.set(l.fetchedAt, l);
  // v1-era interleaved records (pre-2.263.0 per-cache-file sweep): an identity
  // file MIXING distinct accountId values was double-anchored, each record's
  // costSince missing the sibling account's spend — such pairs contribute full
  // Δu against fractional cost and bias the rate HIGH. Grouped records on
  // multi-id identities carry `accountIds`; unmarked lines in a mixed-id file
  // are the legacy signature and are excluded from learning.
  const distinctIds = new Set();
  for (const l of lines || []) if (l && l.fetchedAt) distinctIds.add(l.accountId ?? '__global__');
  const out = {};
  const add = (key, du, cost) => { (out[key] = out[key] || []).push({ du, cost }); };
  for (const l of lines || []) {
    if (!l || !l.prevFetchedAt || !l.costSince) continue;
    if (distinctIds.size > 1 && !Array.isArray(l.accountIds)) continue; // legacy under-counted pair
    const base = byFetched.get(l.prevFetchedAt);
    if (!base || !base.buckets || !l.buckets) continue;
    const spanSec = (l.fetchedAt - base.fetchedAt) / 1000;
    const pairBucket = (key, b0, b1) => {
      if (!b0 || !b1) return;
      const u0 = normU(b0.u), u1 = normU(b1.u);
      if (u0 == null || u1 == null) return;
      const r0 = Number(b0.resetsAt) || 0, r1 = Number(b1.resetsAt) || 0;
      if (r0 && r1 && Math.abs(r0 - r1) > 120) return; // window rolled inside the pair
      // resetsAt can be 0/absent (partial cache writes) — the crossing guard
      // above is then disarmed, so bound pairs by the WINDOW LENGTH instead: a
      // 5h-bucket pair spanning >5h has definitionally crossed a reset.
      if (spanSec > (key === 'fiveHour' ? 5 * 3600 : WEEK_SEC)) return;
      // Scoped readings only refresh via ⟳ (asOf = scopedFetchedAt) — two
      // anchors carrying the SAME stale reading have zero information (du=0
      // with real cost would bias the rate low).
      if (key.startsWith('scoped:') && b0.asOf && b1.asOf && b0.asOf === b1.asOf) return;
      let du = u1 - u0;
      if (du < -0.02) return; // anomalous decrease without a reset change
      if (du < 0) du = 0;
      const cost = costForKey(key, l.costSince);
      if (cost == null) return;
      add(key, du, cost);
    };
    pairBucket('fiveHour', base.buckets.fiveHour, l.buckets.fiveHour);
    pairBucket('sevenDay', base.buckets.sevenDay, l.buckets.sevenDay);
    for (const s1 of l.buckets.scopedWeekly || []) {
      const s0 = (base.buckets.scopedWeekly || []).find((x) => scopedKey(x.name) === scopedKey(s1.name));
      if (s0) pairBucket(scopedKey(s1.name), s0, s1);
    }
  }
  return out;
}

// rate (utilization fraction per API-equivalent $) per bucket key. Prior is a
// pseudo-pair {du: PRIOR_WEIGHT_DU, cost: PRIOR_WEIGHT_DU × priorFullUsd}.
// Without a prior, a bucket needs real signal (≥$1 cost AND ≥0.5% movement)
// before we dare emit a rate at all.
function learnRates(lines, { priors = null } = {}) {
  const pairs = extractPairs(lines);
  const keys = new Set([...Object.keys(pairs), ...Object.keys(priors || {})]);
  const out = {};
  for (const key of keys) {
    let sumDu = 0, sumCost = 0, n = 0;
    for (const p of pairs[key] || []) { sumDu += p.du; sumCost += p.cost; n++; }
    const prior = priors ? Number(priors[key]) || null : null;
    let rate = null;
    if (prior) rate = (sumDu + PRIOR_WEIGHT_DU) / (sumCost + PRIOR_WEIGHT_DU * prior);
    else if (sumCost >= 1 && sumDu >= 0.005) rate = sumDu / sumCost;
    if (!rate || !Number.isFinite(rate) || rate <= 0) continue;
    out[key] = {
      rate,
      impliedFullUsd: Math.round(10 / rate) / 10,
      nPairs: n,
      obsDu: Math.round(sumDu * 10000) / 10000,
      obsCostUsd: Math.round(sumCost * 100) / 100,
      priorFullUsd: prior,
    };
  }
  return out;
}

// Estimate each bucket's utilization NOW from the last anchor + ledger cost.
// costFn(fromMs, toMs) → {total, byFamily} (the caller binds account ids).
// Window-roll semantics: a 7d/scoped reset that PASSED since the anchor means
// a new window began at the old resetsAt — re-base from utilization 0 at that
// moment and advance resetsAt in 7-day steps (the weekly window is a fixed
// cadence). The 5h window is NOT fixed-cadence (it opens with the first
// request after idle), so a passed 5h reset yields null (unknown — consumers
// treat it as full-again, exactly like the raw cache path).
function estimateBuckets({ anchor, rates, costFn, nowMs }) {
  if (!anchor || !anchor.buckets || !rates || !costFn) return null;
  const costMemo = new Map();
  const cost = (fromMs) => {
    if (!costMemo.has(fromMs)) { try { costMemo.set(fromMs, costFn(fromMs, nowMs) || { total: 0, byFamily: {} }); } catch { costMemo.set(fromMs, { total: 0, byFamily: {} }); } }
    return costMemo.get(fromMs);
  };
  let sinceCostUsd = 0;
  const estBucket = (key, b, { weekly }) => {
    const r = rates[key];
    if (!b || !r) return null;
    let baseU = normU(b.u);
    if (baseU == null) return null;
    let resetSec = Number(b.resetsAt) || 0;
    // Scoped readings arrive only via ⟳ — the anchor may carry a reading
    // OLDER than its own fetchedAt (preserve-merged). Cost accrues from when
    // the READING was true, not from the anchor write (else fable spend since
    // the last ⟳ silently vanishes from the estimate).
    let fromMs = (b.asOf && b.asOf < anchor.fetchedAt) ? b.asOf : anchor.fetchedAt;
    // resetsAt-less reading (defensive statusline fallbacks write resetsAt:0):
    // window state unknowable — dead-reckon only within ONE window length of
    // the base, then abstain (verifier repro: a 3-day-old anchor + $600 of
    // ledger cost otherwise rendered a 120% FIVE-HOUR arc and false-tripped
    // the pool's min-across-buckets gate).
    if (!resetSec && nowMs - fromMs > (weekly ? WEEK_SEC : 5 * 3600) * 1000) return null;
    if (resetSec && resetSec * 1000 <= nowMs) {
      if (!weekly) return null; // 5h roll — window start unknowable
      // new weekly window(s): re-base at the last reset boundary before now
      while (resetSec * 1000 <= nowMs) { fromMs = resetSec * 1000; resetSec += WEEK_SEC; }
      baseU = 0;
    }
    const c = costForKey(key, cost(fromMs));
    if (c == null) return null;
    sinceCostUsd = Math.max(sinceCostUsd, (cost(fromMs).total || 0));
    const u = Math.min(1.2, baseU + r.rate * c);
    return { utilization: Math.round(u * 10000) / 10000, resetsAt: resetSec || undefined, estimated: true };
  };
  const out = { estimated: true, anchorAt: anchor.fetchedAt, asOf: nowMs };
  const b = anchor.buckets;
  out.fiveHour = estBucket('fiveHour', b.fiveHour, { weekly: false });
  out.sevenDay = estBucket('sevenDay', b.sevenDay, { weekly: true });
  out.scopedWeekly = [];
  for (const s of b.scopedWeekly || []) {
    const e = estBucket(scopedKey(s.name), s, { weekly: true });
    if (e) out.scopedWeekly.push({ name: s.name, ...e });
  }
  if (!out.fiveHour && !out.sevenDay && !out.scopedWeekly.length) return null;
  out.sinceCostUsd = Math.round(sinceCostUsd * 100) / 100;
  return out;
}

// Merge an estimate over a raw cache entry → a cache-SHAPED view the pool
// decision logic consumes unchanged. Estimated buckets replace their raw
// counterparts; buckets the estimator abstained on keep the raw reading.
function overlayCache(rawCache, est) {
  if (!est) return rawCache;
  const out = { ...(rawCache || {}) };
  if (est.fiveHour) out.fiveHour = est.fiveHour;
  if (est.sevenDay) out.sevenDay = est.sevenDay;
  if (est.scopedWeekly?.length) {
    const raw = Array.isArray(out.scopedWeekly) ? [...out.scopedWeekly] : [];
    for (const e of est.scopedWeekly) {
      const i = raw.findIndex((x) => scopedKey(x?.name) === scopedKey(e.name));
      if (i >= 0) raw[i] = e; else raw.push(e);
    }
    out.scopedWeekly = raw;
  }
  out.estimated = true;
  return out;
}

// Predicted utilizations at a NEW anchor's time, from the PREVIOUS anchor +
// its recorded costSince — the calibration half of the design (predicted vs
// actual logged into the anchor record itself, offline-analyzable forever).
// Reset-crossed buckets are skipped (prediction across a roll is a different
// model — don't pollute the calibration record with it).
function predictCalib(prevAnchor, newBuckets, rates, costSince) {
  if (!prevAnchor?.buckets || !newBuckets || !rates || !costSince) return null;
  const out = {};
  const one = (key, b0, b1) => {
    const r = rates[key];
    if (!r || !b0 || !b1) return;
    const u0 = normU(b0.u), act = normU(b1.u);
    if (u0 == null || act == null) return;
    const r0 = Number(b0.resetsAt) || 0, r1 = Number(b1.resetsAt) || 0;
    if (r0 && r1 && Math.abs(r0 - r1) > 120) return;
    const c = costForKey(key, costSince);
    if (c == null) return;
    const pred = Math.min(1.2, u0 + r.rate * c);
    out[key] = { pred: Math.round(pred * 10000) / 10000, act, err: Math.round((pred - act) * 10000) / 10000 };
  };
  one('fiveHour', prevAnchor.buckets.fiveHour, newBuckets.fiveHour);
  one('sevenDay', prevAnchor.buckets.sevenDay, newBuckets.sevenDay);
  for (const s1 of newBuckets.scopedWeekly || []) {
    const s0 = (prevAnchor.buckets.scopedWeekly || []).find((x) => scopedKey(x.name) === scopedKey(s1.name));
    if (s0) one(scopedKey(s1.name), s0, s1);
  }
  return Object.keys(out).length ? out : null;
}

// Stateful wrapper the server owns: anchor-file reading (mtime-cached), rate
// memoization with explicit invalidation on new anchors, a 30s estimate memo
// (the taskbar polls /api/usage every 8s), and a rates.json snapshot for
// offline inspection. All reads are read-only — NEVER instantiate anything
// that scans/advances ledger cursors here.
class UsageEstimator {
  constructor({ anchorsDir, usageHistory, resolveIdentity, priorsFor }) {
    this.dir = anchorsDir;
    // May be the object OR a () => object thunk — server.js constructs this
    // estimator far above usageHistory's declaration (TDZ), so it passes a
    // lazy ref; everything here only dereferences at call time.
    this._usageHistory = usageHistory;
    this.resolveIdentity = resolveIdentity; // (accountId|null) → {identityKey} | null
    this.priorsFor = priorsFor || (() => CLAUDE_MAX_PRIOR_FULL_USD);
    this._lineCache = new Map();  // identityKey → {mtimeMs, size, lines}
    this._rateCache = new Map();  // identityKey → {rates, at}
    this._estMemo = new Map();    // accountId|'__global__' → {at, est}
  }
  _file(key) { return path.join(this.dir, 'anchors-' + String(key).replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'); }
  lines(identityKey) {
    const fp = this._file(identityKey);
    let st; try { st = fs.statSync(fp); } catch { return []; }
    const c = this._lineCache.get(identityKey);
    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.lines;
    let lines = [];
    try {
      lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { }
    lines.sort((a, b) => (a.fetchedAt || 0) - (b.fetchedAt || 0));
    this._lineCache.set(identityKey, { mtimeMs: st.mtimeMs, size: st.size, lines });
    return lines;
  }
  // Every account id this identity has EVER anchored under — ledger events
  // for removed/re-added subs live under their old ids. '__global__' is the
  // ONE reassignable id (a machine /login switch hands it to a DIFFERENT
  // identity): historical anchor lines must not union it in forever, or
  // identity X's odometer counts identity Y's post-switch machine-login spend
  // — it joins only via `extra` (the CURRENT identity-group mapping).
  accountIdsFor(identityKey, extra = []) {
    const ids = new Set(extra.filter(Boolean));
    for (const l of this.lines(identityKey)) {
      if (l.accountId !== undefined && l.accountId !== null && l.accountId !== '__global__') ids.add(l.accountId);
    }
    if (!ids.size) ids.add('__global__');
    return [...ids];
  }
  ratesFor(identityKey) {
    const c = this._rateCache.get(identityKey);
    if (c) return c.rates;
    const lines = this.lines(identityKey);
    const rates = learnRates(lines, { priors: this.priorsFor(identityKey) });
    this._rateCache.set(identityKey, { rates, at: Date.now() });
    this._persistRates(identityKey, rates, lines.length);
    return rates;
  }
  invalidate(identityKey) { this._rateCache.delete(identityKey); this._lineCache.delete(identityKey); this._estMemo.clear(); }
  _persistRates(identityKey, rates, nAnchors) {
    try {
      const fp = path.join(this.dir, 'rates.json');
      let all = {}; try { all = JSON.parse(fs.readFileSync(fp, 'utf-8')) || {}; } catch { }
      all[identityKey] = { computedAt: Date.now(), nAnchors, buckets: rates };
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(fp + '.tmp', JSON.stringify(all, null, 1)); fs.renameSync(fp + '.tmp', fp);
    } catch { }
  }
  _costFn(accountIds) {
    const { costBetweenMulti } = require('./usage-anchors.js');
    const uh = typeof this._usageHistory === 'function' ? this._usageHistory() : this._usageHistory;
    return (fromMs, toMs) => costBetweenMulti(uh, accountIds, fromMs, toMs);
  }
  // Estimated bucket view for one account NOW (memo 30s). rawCache is only a
  // freshness reference: when the cache reading is NEWER than the last anchor
  // (sweep lag ≤60s), the cache itself is the better base — build a pseudo-
  // anchor from it rather than estimating from the stale anchor.
  estimateFor(accountId, rawCache, nowMs = Date.now()) {
    const memoKey = accountId || '__global__';
    const m = this._estMemo.get(memoKey);
    // Memo is stale the moment FRESHER ground truth exists (rawCache newer
    // than what the memo was computed against) — a frozen estimate vs an
    // advancing reading (a) trips estDisplayPair's est<reading roll rule into
    // a false "window reset" collapse, and (b) MASKS a limit-banner mark
    // (utilization 1, fetchedAt now) so the pool's immediate switch reads
    // 85%-ish instead of dead and stays put (adversarial-review major).
    if (m && nowMs - m.at < 30000 && !(rawCache?.fetchedAt > (m.baseFetchedAt || 0))) return m.est;
    let est = null, baseFetchedAt = 0;
    try {
      const ident = this.resolveIdentity(accountId);
      if (ident?.identityKey) {
        let anchor = null;
        const lines = this.lines(ident.identityKey);
        if (lines.length) anchor = lines[lines.length - 1];
        if (rawCache?.fetchedAt && (!anchor || rawCache.fetchedAt > anchor.fetchedAt)) {
          anchor = {
            fetchedAt: rawCache.fetchedAt,
            buckets: {
              fiveHour: rawCache.fiveHour ? { u: rawCache.fiveHour.utilization, resetsAt: rawCache.fiveHour.resetsAt } : null,
              sevenDay: rawCache.sevenDay ? { u: rawCache.sevenDay.utilization, resetsAt: rawCache.sevenDay.resetsAt } : null,
              scopedWeekly: (rawCache.scopedWeekly || []).map((s) => ({ name: s.name, u: s.utilization, resetsAt: s.resetsAt, asOf: rawCache.scopedFetchedAt || undefined })),
            },
          };
        }
        if (anchor) {
          baseFetchedAt = anchor.fetchedAt;
          const rates = this.ratesFor(ident.identityKey);
          const accountIds = this.accountIdsFor(ident.identityKey, [accountId || '__global__']);
          est = estimateBuckets({ anchor, rates, costFn: this._costFn(accountIds), nowMs });
        }
      }
    } catch { est = null; }
    this._estMemo.set(memoKey, { at: nowMs, est, baseFetchedAt });
    return est;
  }
}

module.exports = {
  PRIOR_WEIGHT_DU, CLAUDE_MAX_PRIOR_FULL_USD,
  normU, scopedKey, scopedFamily, costForKey,
  extractPairs, learnRates, estimateBuckets, overlayCache, predictCalib,
  UsageEstimator,
};
