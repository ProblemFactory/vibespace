'use strict';
/**
 * rate-limit-capture.js — passive quota capture from the CLI's own
 * `rate_limit_event` stream-json records (B-e5c9, discovered by binary
 * forensics on 2.1.226: a first-class stdout record type "emitted when rate
 * limit info changes", riding real API responses — VibeSpace dropped it as
 * an unknown type since forever).
 *
 * WHY IT MATTERS: chat/stream-json sessions have no statusline, so their
 * accounts' quota showed last-known only. This record closes that gap with
 * ZERO extra API calls (§ban-safety: purely passive — nothing here may ever
 * originate a vendor call), and `status:"rejected"` is a STRUCTURED
 * exhaustion signal (the banner-text parse's typed sibling). Utilization
 * readings become dead-reckoning anchors for free (the anchors sweep treats
 * any usage-cache write as ground truth).
 *
 * ONE implementation for every machine (CS rule): the server calls this for
 * local AND remote chat sessions (remote stdout relays through the same
 * parse), and the module is deliberately dependency-free (fs/path only) so
 * the device daemon can bundle it when session.events moves device-side.
 *
 * Fields (builder `wFb` in the 2.1.226 binary): status(allowed/rejected)/
 * resetsAt/rateLimitType/utilization/overageStatus/overageResetsAt/
 * overageDisabledReason/isUsingOverage/overageInUse/surpassedThreshold/
 * rateLimitGraceActive/overagePeriodMonthly/overagePeriodChannel/errorCode/
 * canUserPurchaseCredits/hasChargeableSavedPaymentMethod. All optional —
 * real captured samples carried only status+resetsAt+type+overage.
 */
const fs = require('fs');
const path = require('path');
// THE ONE WRITE PATH, required lazily (usage-cache-write → claude-quota →
// this module would otherwise be a cycle) and spelled ONCE — test-quota-model
// ⑰ re-points this exact line at a patched copy for its negative controls.
const usageWriteMod = () => require('./usage-cache-write.js');

/** THE LANE VOCABULARY (measured on claude 2.1.274; the binary's own words).
 *  `rateLimitType` names the REPRESENTATIVE claim — the currently limiting
 *  window, from the `anthropic-ratelimit-unified-representative-claim` header —
 *  and `unifiedWindows` carries EVERY window the response stated: "Per-window
 *  usage for the session (5-hour), weekly (7-day), and overage-included weekly
 *  (per-model bucket; present only for accounts whose responses carry that
 *  window) … both windows are tracked on every observation, and events are
 *  emitted when a window's rounded percentage or reset time moves, not only on
 *  status transitions. Windows absent from the account state are absent here."
 *
 *  So ONE record yields up to THREE readings for the credential slot, and the
 *  lane of each is decided by what NAMES it (inc-mubu23bd-5vxi, 2026-09-21):
 *    five_hour                  → the plan 5h lane
 *    seven_day | weekly         → the plan 7d lane
 *    seven_day_overage_included → the account's MODEL-CAP weekly lane
 *                                 (scope 'model'; the model is named later by
 *                                 quota-model's `nameModelCapLane`) — NEVER the
 *                                 plan lane. 2.361.2 mapped it to `sevenDay`
 *                                 ("the accounting the CLI enforces"), and from
 *                                 then on every account with a model cap had
 *                                 its plan week overwritten by the bucket
 *                                 (measured: 0.43 plan vs 0.87 bucket on the
 *                                 owner's account — the 7d donut flipped
 *                                 red/green between every event and panel).
 *    seven_day_<model>          → that named model's cap
 *  The representative's status (allowed_warning / rejected) and its top-level
 *  utilization attach to the lane ITS type names and to no other; every other
 *  window is a plain reading of its own lane. */
const norm = (u) => {
  if (typeof u !== 'number' || !(u >= 0)) return null;
  if (u > 1.5) u = u / 100; // integer % (get_usage precedent)
  return Math.min(u, 1);
};
const SCOPED_TYPE_RE = /^seven_day_(?!overage)(\w+)$/;
const MODEL_CAP_TYPE = 'seven_day_overage_included';
const MODEL_CAP_WINDOW = MODEL_CAP_TYPE; // the unifiedWindows key is the type's own name

/** Normalize one stream-json record. Returns null for anything else.
 *  Accepts both key casings defensively (the 2.227.6 rule — this record is
 *  stdout-only today, but a future JSONL copy would be camelCase-at-top). */
function parseRateLimitEvent(msg) {
  if (!msg || msg.type !== 'rate_limit_event') return null;
  const info = msg.rate_limit_info || msg.rateLimitInfo;
  if (!info || typeof info !== 'object') return null;
  const rawType = String(info.rateLimitType ?? info.rate_limit_type ?? '') || null;
  // ④ of the 2.340.0 calibration batch: seven_day_<model> types are a passive
  // channel for scoped weekly buckets — scoped readings, never 'other', so
  // warnings/rejections anchor the scoped estimator (its -45% burst error
  // traced directly to anchor starvation).
  const scopedM = SCOPED_TYPE_RE.exec(rawType || '');
  const modelCap = rawType === MODEL_CAP_TYPE;
  const kind = rawType === 'five_hour' ? 'fiveHour'
    : (rawType === 'seven_day' || rawType === 'weekly') ? 'sevenDay'
      : (modelCap || scopedM) ? 'scoped'
        : rawType ? 'other' : null;
  // EVERY window the response stated (2.1.274 `unifiedWindows`). Absent on
  // older CLIs and on API-key/Bedrock/Vertex sessions ⇒ null, never `{}`: a
  // record that states no windows makes no claim about the other lanes.
  const uw = info.unifiedWindows ?? info.unified_windows;
  let windows = null;
  if (uw && typeof uw === 'object' && !Array.isArray(uw)) {
    const w = (x) => (x && typeof x === 'object') ? { utilization: norm(x.utilization ?? x.used_percentage), resetsAt: Number(x.resetsAt ?? x.resets_at) || null } : null;
    windows = { fiveHour: w(uw.five_hour), sevenDay: w(uw.seven_day), modelCap: w(uw[MODEL_CAP_WINDOW]), scoped: {} };
    for (const [k, v] of Object.entries(uw)) {
      const m = SCOPED_TYPE_RE.exec(k);
      if (!m || k === 'seven_day_oauth_apps') continue;
      const x = w(v); if (x) windows.scoped[m[1]] = x;
    }
  }
  let u = norm(info.utilization ?? info.used_percentage);
  let resetsAt = Number(info.resetsAt ?? info.resets_at) || null;
  // The representative lane's OWN window fills what the top level left out —
  // a `five_hour` event with no top-level utilization still states its 5h
  // number in `unifiedWindows.five_hour` (measured shape).
  const own = !windows ? null
    : kind === 'fiveHour' ? windows.fiveHour
      : kind === 'sevenDay' ? windows.sevenDay
        : modelCap ? windows.modelCap
          : scopedM ? (windows.scoped[scopedM[1]] || null) : null;
  if (u == null && own && own.utilization != null) u = own.utilization;
  if (!resetsAt && own && own.resetsAt) resetsAt = own.resetsAt;
  return {
    kind, rawType,
    // `scopedName` is the LOWERCASE lane key. A model-cap event has none until
    // `resolveModelCapLane` names it (the type names the accounting, not the
    // model); `modelCap` says which kind of scoped lane this is.
    scopedName: scopedM ? scopedM[1] : null, modelCap,
    status: String(info.status || '') || null, // allowed | allowed_warning | rejected | (future values pass through)
    utilization: u,
    resetsAt,
    windows,
    overage: {
      status: info.overageStatus ?? info.overage_status,
      resetsAt: info.overageResetsAt ?? info.overage_resets_at,
      disabledReason: info.overageDisabledReason ?? info.overage_disabled_reason,
      inUse: info.isUsingOverage ?? info.is_using_overage ?? info.overageInUse,
    },
    surpassedThreshold: info.surpassedThreshold ?? info.surpassed_threshold,
  };
}

const lower = (v) => String(v == null ? '' : v).toLowerCase();

/** NAME THE MODEL-CAP LANE of one parsed event against the account it is being
 *  filed on — the I/O half of quota-model's PURE `nameModelCapLane`: the
 *  `.window-<key>` sidecar's `scoped` map (api-phase verified) and the cache's
 *  own typed limits. `hint` = the requesting session's model family (a
 *  tie-breaker only). Returns a NEW event carrying `modelCapLane` (the rule's
 *  verdict), `modelCapName` (lowercase key, null = the placeholder) and, for a
 *  model-cap REPRESENTATIVE, `scopedName` set to that key. Idempotent; an
 *  event with no model-cap window is returned as is. */
function resolveModelCapLane({ cacheDir, key, ev, hint = null }) {
  if (!ev || ev.modelCapLane) return ev;
  const has = ev.modelCap || (ev.windows && ev.windows.modelCap);
  if (!has) return ev;
  const quotaModel = require('./quota-model.js');
  const resetsAt = ev.modelCap ? ev.resetsAt : (ev.windows.modelCap.resetsAt || null);
  let scoped = null, limits = [];
  if (cacheDir && key) {
    const readingLag = require('./reading-lag.js');
    try { const sc = JSON.parse(fs.readFileSync(path.join(cacheDir, readingLag.windowSidecarName(key)), 'utf-8')); scoped = sc && typeof sc.scoped === 'object' ? sc.scoped : null; } catch { scoped = null; }
    try {
      const usageWrite = usageWriteMod();
      const obj = usageWrite.readCacheObject(cacheDir, key);
      if (obj) limits = usageWrite.limitsOfCache(obj, { identity: key, backend: 'claude' }).limits;
    } catch { limits = []; }
  }
  const lane = quotaModel.nameModelCapLane({ limits, scoped, resetsAt, hint });
  const out = { ...ev, modelCapLane: lane, modelCapName: lane.named ? lower(lane.family || lane.name) : null, modelCapDisplay: lane.name };
  // THE PLACEHOLDER'S LANE IS SPELLED ONE WAY ON BOTH SIDES (r2): the wall
  // signal records `ev.scopedName` and the reading edge compares it with the
  // snapshot's name, which `lanesOf` spells as the placeholder's — a null here
  // left an un-named cap wall waiting only on its timer (and, before the
  // scoped dead-mark ladder, that timer had no instant).
  if (ev.modelCap) out.scopedName = out.modelCapName || lower(quotaModel.MODEL_CAP_PLACEHOLDER.name);
  return out;
}

/** EVERY lane one parsed event states, the representative first:
 *  `{kind, scopedName, displayName, modelCap, representative, status,
 *    utilization, resetsAt, dead}`. A non-representative window carries the
 *  status its own number implies (≥ 100 % ⇒ limited, else allowed — the same
 *  per-window rule the statusline and the OAuth parse apply to a window that
 *  states no status); a REJECTION kills the representative lane only. The
 *  placeholder lane writes under quota-model's placeholder NAME so the legacy
 *  view round-trips to `model:cap`. */
function lanesOf(ev) {
  if (!ev) return [];
  const { MODEL_CAP_PLACEHOLDER } = require('./quota-model.js');
  const phKey = lower(MODEL_CAP_PLACEHOLDER.name);
  const capName = ev.modelCapName || phKey;
  const capDisplay = ev.modelCapDisplay || MODEL_CAP_PLACEHOLDER.name;
  // a scoped event that names the placeholder's own key IS the model-cap lane
  // (the teardown settle re-drives a wall signal as {kind:'scoped', scopedName})
  const isCap = !!ev.modelCap || (ev.kind === 'scoped' && lower(ev.scopedName) === phKey);
  const lanes = [];
  if (ev.kind === 'fiveHour' || ev.kind === 'sevenDay' || (ev.kind === 'scoped' && (ev.scopedName || ev.modelCap))) {
    lanes.push({
      kind: ev.kind,
      scopedName: ev.kind !== 'scoped' ? null : (isCap ? capName : lower(ev.scopedName)),
      displayName: ev.kind !== 'scoped' ? null : (isCap ? capDisplay : ev.scopedName),
      modelCap: isCap, representative: true,
      status: ev.status || null, utilization: ev.utilization ?? null, resetsAt: ev.resetsAt || null,
      dead: ev.status === 'rejected',
    });
  }
  const w = ev.windows;
  if (!w) return lanes;
  const derived = (x) => ({
    status: x.utilization == null ? null : (x.utilization >= 1 ? 'limited' : 'allowed'),
    utilization: x.utilization, resetsAt: x.resetsAt || null, dead: false, representative: false,
  });
  if (w.fiveHour && ev.kind !== 'fiveHour') lanes.push({ kind: 'fiveHour', scopedName: null, displayName: null, modelCap: false, ...derived(w.fiveHour) });
  if (w.sevenDay && ev.kind !== 'sevenDay') lanes.push({ kind: 'sevenDay', scopedName: null, displayName: null, modelCap: false, ...derived(w.sevenDay) });
  if (w.modelCap && !(ev.kind === 'scoped' && ev.modelCap)) lanes.push({ kind: 'scoped', scopedName: capName, displayName: capDisplay, modelCap: true, ...derived(w.modelCap) });
  for (const [name, x] of Object.entries(w.scoped || {})) {
    if (ev.kind === 'scoped' && !ev.modelCap && lower(ev.scopedName) === lower(name)) continue;
    lanes.push({ kind: 'scoped', scopedName: lower(name), displayName: name, modelCap: false, ...derived(x) });
  }
  return lanes;
}

/** The lanes of one event in the SHARED legacy snapshot shape
 *  (`{fiveHour, sevenDay, scopedWeekly}`) — what the window fingerprint, the
 *  auto-resume reading edge and every other snapshot reader already take.
 *  `named:true` leaves the un-named placeholder out (it carries no identity
 *  and names no wall anybody is waiting on). Lanes that state no utilization
 *  and no reset are left out too. */
function lanesSnapshot(ev, { named = false } = {}) {
  const out = {};
  for (const l of lanesOf(ev)) {
    if (l.utilization == null && !l.resetsAt && !l.dead) continue;
    const b = {};
    if (l.dead) b.utilization = 1; else if (l.utilization != null) b.utilization = l.utilization;
    if (l.resetsAt) b.resetsAt = l.resetsAt;
    if (l.kind === 'scoped') {
      if (named && !ev.modelCapName && l.modelCap) continue;
      (out.scopedWeekly = out.scopedWeekly || []).push({ name: l.displayName || l.scopedName, ...b });
    } else out[l.kind] = b;
  }
  return out;
}

/**
 * Write one parsed event into the usage cache with the SAME identity-group
 * discipline markLimitBanner earned in 2.267.0 (anchor-poison root cause):
 * base the primary write on the identity's FRESHEST file; mark the bucket in
 * every sibling WITHOUT touching its fetchedAt; never CREATE a sibling.
 *
 * fetchedAt DISCIPLINE (the anti-poison rule this module adds): bump it ONLY
 * when the event carried a real READING (a utilization, or rejected ⇒ dead
 * bucket = utilization 1). A resetsAt/overage-only event updates bucket
 * fields in place but must NOT promote the file to "freshest" — the anchors
 * sweep would otherwise re-anchor stale utilization with fresh cost (the
 * exact bounce-pair poison 2.267.0 fixed).
 *
 * `source` (default 'rate-limit-event') labels the reading write — the wall
 * machine's ground-truth demotion (B-2c9b) rides this SAME path with source
 * 'wall' so anchors/estimator/verdicts see one write discipline, never a twin.
 * `corroborated` (optional) records whether the OTel observation agreed with
 * the credential slot this reading was filed on (2026-09-07). A LABEL only —
 * the key comes from readingSlotFor and nothing else.
 *
 * @returns {ok, dead, wroteReading} — dead=true when the bucket is exhausted
 *   (caller should treat it like a limit banner: immediate pool evaluation).
 */
function captureRateLimitEvent({ cacheDir, key, identityIds, ev, now = Date.now(), source = 'rate-limit-event', corroborated = undefined, familyOf = null, hint = null }) {
  if (!ev || (ev.kind !== 'fiveHour' && ev.kind !== 'sevenDay' && ev.kind !== 'scoped')) {
    // unknown bucket types: surface, never silently drop (the api_retry lesson)
    return { ok: false, dead: false, wroteReading: false, unknownType: ev?.rawType || null };
  }
  // THE MODEL-CAP LANE IS NAMED AGAINST THE KEY IT IS WRITTEN ON (the sidecar
  // and the limits of THIS account), before any lane is derived — a caller
  // that already resolved it (the engine, so its signals carry the name) is
  // left alone; `resolveModelCapLane` is idempotent.
  if (cacheDir && key) ev = resolveModelCapLane({ cacheDir, key, ev, hint });
  const lanes = lanesOf(ev);
  const rep = lanes.find((l) => l.representative) || null;
  const dead = !!(rep && rep.dead);
  const reading = lanes.some((l) => l.dead || l.utilization != null);
  const nowSec = Math.floor(now / 1000);
  // THE WINDOW STATE IS A VERDICT ABOUT A READING, NOT A PROPERTY OF THE SLOT
  // (r3). It is computed by the projection (`quota-model.toLegacyView`) from a
  // usedPct + resetsAt + measuredAt triple; this producer spreads the previous
  // bucket forward to keep the fields it is not restating, and the stamp used
  // to ride along onto numbers it no longer describes. So: whenever we RE-STATE
  // the numbers, we drop the verdict we are no longer entitled to and let the
  // write path re-derive it — with `measuredAt: now`, which is the correct
  // clock for this event. A `status`-only event changes no number, leaves the
  // reading intact, and therefore keeps the stamp (dropping it there would hand
  // `fromLegacy` the FILE's clock and flip a genuinely empty window to
  // 'running' — B-8b12 in the other direction).
  const restated = (b) => { const c = { ...b }; delete c.state; return c; };
  // THE RESET OF A DEAD MARK — ONE LADDER FOR EVERY LANE (r2): the signal's
  // own future reset > the lane's stored future reset > for a weekly lane the
  // record's plan weekly reset (every weekly window on every measured account
  // shares it) > a bounded guess that self-expires. The scoped lane used to
  // have no ladder at all: a model-cap rejection stating no reset marked the
  // placeholder dead with NO deadline, so `bucketRemaining` never rolled it and
  // the member read 0 % for every family until a panel retired it (the same
  // record self-expired in 24 h on the plan lane before the lane rule).
  const weeklyStated = (ev.windows && ev.windows.sevenDay && (Number(ev.windows.sevenDay.resetsAt) || 0) > nowSec) ? ev.windows.sevenDay.resetsAt : 0;
  const deadResetFor = (lane, stored) => (Number(lane.resetsAt) || 0) > nowSec ? lane.resetsAt
    : (Number(stored) || 0) > nowSec ? stored
      : (lane.kind !== 'fiveHour' && weeklyStated) ? weeklyStated
        : nowSec + (lane.kind === 'fiveHour' ? 5 * 3600 : 24 * 3600);
  // A NON-REPRESENTATIVE WINDOW'S STATUS IS WHAT ITS OWN NUMBER IMPLIES, and
  // when that number did not move the stored status stands: a warning the
  // representative stated at 0.84 is not withdrawn by a sibling window that
  // restates 0.84 inside another event (`limited` always lands).
  const statusFor = (lane, stored, prevU) => {
    if (lane.representative || lane.status === 'limited') return lane.status || stored;
    const moved = prevU == null || lane.utilization == null || Math.abs(Number(prevU) - lane.utilization) > 1e-9;
    return moved ? (lane.status || stored) : (stored || lane.status);
  };
  let scopedRead = false; // did a scoped lane carry a READING this event?
  const applyLane = (cache, lane) => {
    if (lane.kind === 'scoped') {
      const list = Array.isArray(cache.scopedWeekly) ? cache.scopedWeekly.slice() : [];
      const i = list.findIndex((s) => lower(s && s.name) === lane.scopedName);
      let s = { ...(i >= 0 ? list[i] : { name: lane.displayName || lane.scopedName }) };
      if (lane.dead) { s = restated(s); s.utilization = 1; s.status = 'limited'; s.resetsAt = deadResetFor(lane, s.resetsAt); scopedRead = true; }
      else {
        if (lane.utilization != null) { const st = statusFor(lane, s.status, s.utilization); s = restated(s); s.utilization = lane.utilization; s.status = st; scopedRead = true; }
        else if (lane.status) s.status = lane.status;
        if (Number(lane.resetsAt) > 0) { if (s.resetsAt !== lane.resetsAt) s = restated(s); s.resetsAt = lane.resetsAt; }
      }
      s.asOf = now; // fresh reading marker — the scoped pair guard keys on asOf
      if (i >= 0) list[i] = s; else list.push(s);
      cache.scopedWeekly = list;
      return;
    }
    let b = { ...(cache[lane.kind] || {}) };
    if (lane.dead) {
      b = restated(b);
      b.utilization = 1; b.status = 'limited';
      b.resetsAt = deadResetFor(lane, b.resetsAt);
    } else {
      if (lane.utilization != null) { const st = statusFor(lane, b.status, b.utilization); b = restated(b); b.utilization = lane.utilization; b.status = st; }
      else if (lane.status) b.status = lane.status;
      if ((Number(lane.resetsAt) || 0) > 0) { if (b.resetsAt !== lane.resetsAt) b = restated(b); b.resetsAt = lane.resetsAt; }
    }
    cache[lane.kind] = b;
  };
  const applyTo = (cache) => {
    scopedRead = false;
    for (const lane of lanes) applyLane(cache, lane);
    // THE SCOPED CLOCK IS THE READING'S CLOCK (r2): every anchor and overlay
    // site takes the file-level `scopedFetchedAt` as a scoped bucket's `asOf`
    // (the panel's own rule), so a stream-written cap that left it at the last
    // panel's stamp shared that stamp across every anchor and the estimator
    // discarded every pair as "the same reading" — the dominant cap producer
    // was invisible to rate learning.
    if (scopedRead) cache.scopedFetchedAt = now;
    if (ev.overage && Object.values(ev.overage).some((v) => v !== undefined)) {
      // Merge only what this event STATES — an absent field is not a claim.
      // A spread of `{status: undefined}` used to wipe a stored 'rejected' to
      // undefined, and "no status + inUse:false" is exactly the shape that
      // reads as usage credits ALLOWED (B-ad05, `overageState().mode`).
      const o = { ...(cache.overage || {}) };
      for (const [k, v] of Object.entries(ev.overage)) if (v !== undefined) o[k] = v;
      cache.overage = { ...o, asOf: now };
    }
    return cache; // primary write path consumes the return value
  };
  // THE ONE WRITE PATH (src/usage-cache-write.js): this module still decides
  // WHAT the reading says (applyTo, the fetchedAt discipline, the sibling
  // fan-out); it no longer decides how a snapshot reaches disk. The write path
  // merges this event's lanes into the file's typed `limits` per limitId, so
  // an event can never erase a limit it did not state — and, for claude,
  // never erases the model-scoped cap this file has lost five times.
  const usageWrite = usageWriteMod();
  const fileFor = (id) => usageWrite.cacheFileFor(cacheDir, id);
  const ids = (identityIds && identityIds.length ? identityIds : [key]);
  // `measuredAt` is `now` for the sibling writes too. The sibling deliberately
  // does NOT bump `fetchedAt` (the anti-poison rule above), and a window
  // measured now must not lose the per-limit merge to an older file just
  // because that file is not being promoted to "freshest".
  //
  // The object — not a separately built typed set — is what we hand the write
  // path, because `applyLane` above is where this event's resetsAt LADDER lives
  // (signal > cached > bounded guess): a rejection that states no reset keeps
  // the cached FUTURE one, and a set built from the raw event alone would
  // carry `resetsAt: null` and win the merge with it.
  try {
    let base = null, baseAt = -1;
    for (const id of ids) {
      try { const c = JSON.parse(fs.readFileSync(fileFor(id), 'utf-8')) || {}; if ((Number(c.fetchedAt) || 0) > baseAt) { baseAt = Number(c.fetchedAt) || 0; base = c; } } catch { }
    }
    const cache = applyTo(base ? { ...base } : {});
    // The freshest SIBLING was chosen for its READINGS; its `limits` describe a
    // different account's window set, so they must not travel with it.
    delete cache.limits;
    // NOTE (r2): the established window is a fact about WHICH ACCOUNT THIS FILE
    // IS, and this producer used to have to rescue it by hand (the
    // freshest-sibling base above is chosen for its READINGS, so writing it
    // through would let a sibling erase this key's window). It now lives in a
    // sidecar that no reading producer writes — see windowSidecarName in
    // src/reading-lag.js for why a hand-written preserve list was the bug.
    if (reading) {
      cache.fetchedAt = now; cache.source = source || 'rate-limit-event';
      // PROVENANCE (2026-09-07): did the OTel observation for the session that
      // produced this reading AGREE with the credential slot it was filed on?
      // true = corroborated, false = the observation named a different (=
      // spawn-time) org, undefined = nothing to compare. It is a LABEL for the
      // panel and for forensics — it never moved this write anywhere, which is
      // the whole point of the refutation it records.
      if (corroborated === undefined) delete cache.corroborated; else cache.corroborated = !!corroborated;
    }
    const w = usageWrite.writeCacheObject({
      cacheDir, key, obj: cache, measuredAt: now,
      source: reading ? (source || 'rate-limit-event') : null, familyOf, backend: 'claude',
    });
    if (!w.ok) return { ok: false, dead, wroteReading: false, error: w.why || 'write refused' };
    for (const id of ids) {
      if (id === key) continue;
      try {
        let c2; try { c2 = JSON.parse(fs.readFileSync(fileFor(id), 'utf-8')) || null; } catch { c2 = null; }
        if (!c2) continue; // never create a sibling
        applyTo(c2); // fetchedAt deliberately untouched
        delete c2.limits; // the sibling's own limits are rebuilt from its own (now updated) view
        usageWrite.writeCacheObject({ cacheDir, key: id, obj: c2, measuredAt: now, familyOf, backend: 'claude' });
      } catch { }
    }
    return { ok: true, dead, wroteReading: reading, lanes: lanes.map((l) => (l.kind === 'scoped' ? 'scoped:' + l.scopedName : l.kind)), modelCapLane: ev.modelCapLane || null };
  } catch (e) {
    return { ok: false, dead, wroteReading: false, error: e.message };
  }
}

module.exports = { parseRateLimitEvent, captureRateLimitEvent, resolveModelCapLane, lanesOf, lanesSnapshot, MODEL_CAP_TYPE };
