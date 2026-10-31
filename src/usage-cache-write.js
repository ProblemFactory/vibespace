'use strict';
/**
 * usage-cache-write.js — THE ONE WRITE PATH for data/usage-cache/*.json
 * (docs/design-account-hardening.md §4.2 / P4, with the typed model of
 * src/quota-model.js).
 *
 * WHAT IT REPLACES. Nine producers wrote this store, each with its own
 * read-modify-write and its own idea of what a snapshot is:
 *
 *   statusline ingest (shipped tool) · on-demand `claude -p /usage` panel ·
 *   bare-token ⟳ · rate_limit_event capture (+ its sibling fan-out) ·
 *   the wall/limit-banner mark · the codex live app-server push ·
 *   the codex rollout-tail summariser · the remote host-* harvest ·
 *   the repair migration
 *
 * Every one of them rebuilt the whole object, so the store's history is a list
 * of fields that were silently lost because ONE of the nine forgot to carry
 * them forward: `scopedWeekly`, the org identity, `spend`, `corroborated`, and
 * — the one that replayed a live incident — the established window (which is
 * why that fact now lives in a SIDECAR no producer writes). And because the
 * object could hold exactly one set of buckets, codex's three concurrent limits
 * collapsed into whichever pushed last (B-9213).
 *
 * WHAT IT GUARANTEES.
 *  1. **Per-limit merge, never last-writer-wins.** A producer that knows about
 *     one limit updates one limit; the others are carried forward untouched.
 *  2. **The legacy snapshot is a DERIVED VIEW.** `fiveHour` / `sevenDay` /
 *     `scopedWeekly` / `overage` are PROJECTED from the merged `limits` after
 *     every write, so a reader that has not migrated yet still sees a
 *     consistent object — and sees the PLAN limit's numbers, deterministically,
 *     instead of whichever limit spoke last.
 *  3. **A malformed set never lands.** The validator runs on what we are about
 *     to persist; our own producer being wrong is a bug we refuse to write, a
 *     corrupt file already on disk is a fact we heal past (its limits are
 *     dropped, loudly, and the new reading proceeds).
 *  4. **Provenance per limit, and only for what was MEASURED.** `source` and
 *     `fetchedAt` are stamped on the LIMIT, not only on the file, so a panel
 *     showing three limits side by side can say who produced each number and
 *     how old it is — and a limit this write only CARRIED FORWARD keeps the
 *     provenance of the reading that established it (`carryUnmeasuredLimits`).
 *  5. **Only a producer that enumerates may retire.** A limit the file holds
 *     and this write does not name is carried forward — unless the producer
 *     declares itself authoritative over that scope (`authoritativeScopes`),
 *     which exactly one kind of producer can: the one whose own parse listed
 *     the complete set.
 *
 * WHAT IT DOES NOT DO. It does not decide WHICH key a reading belongs to. That
 * is the slot/window question and it already has an owner: the caller resolves
 * the key (`readingSlotFor`) and may hand us a `guard` (the engine's
 * `guardReadingTarget`, i.e. src/reading-lag.js ②) which we call before
 * touching anything. Composing, never forking — a second answer to "whose
 * numbers are these" is exactly the defect class this store has already
 * suffered five times.
 *
 * SHARED tier: fs/path + the PURE model + the harness parsers. The daemon can
 * bundle it, and the shipped statusline tool mirrors the RULES it needs
 * (src/reading-lag.js's sentinels) rather than requiring this file.
 */
const fs = require('fs');
const path = require('path');
const quotaModel = require('./quota-model.js');

/** THE cache filename rule, in ONE place. Every producer spelled this inline;
 *  a key that sanitises differently in two places is two different accounts. */
function cacheFileFor(cacheDir, key) {
  return path.join(cacheDir, String(key).replace(/[^\w.-]/g, '_') + '.json');
}

/** Is this directory entry a usage-cache SNAPSHOT? (Not `__models__.json`, not
 *  a `.window-`/`.slot-` sidecar — those deliberately carry no `.json`.) */
function isCacheFileName(fn) { return /\.json$/.test(fn) && !fn.startsWith('__models__'); }

function readCacheObject(cacheDir, key) {
  try { return JSON.parse(fs.readFileSync(cacheFileFor(cacheDir, key), 'utf-8')) || null; } catch { return null; }
}

// ── lifting a stored object into the typed model ────────────────────────────

/** Which harness shape is this legacy object? By its FIELDS, never by the key
 *  name — `__global_codex__` is a convention, `limitId` + `windowMinutes` is
 *  evidence. A claude snapshot never carries `limitId`. */
function backendOfCacheObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  // a producer that names its harness is taken at its word (lane antigravity-card-fixes: the on-demand reading of an
  // antigravity account, src/server/cli-usage-door.js, stamps `backend`) — its projected buckets would otherwise read as
  // claude's. No claude / codex writer stamps the field; the shape rules below are theirs.
  if (typeof obj.backend === 'string' && obj.backend) return obj.backend;
  if (obj.limitId !== undefined || obj.rateLimitReachedType !== undefined || obj.spendControlReached !== undefined) return 'codex';
  if (obj.scopedWeekly !== undefined || obj.overallStatus !== undefined || obj.spend !== undefined) return 'claude';
  if (obj.fiveHour && typeof obj.fiveHour === 'object' && obj.fiveHour.windowMinutes) return 'codex';
  return 'claude'; // the historical default: this store was claude-only for a year
}

/** A stored cache object → a typed LimitSet. Uses the canonical `limits` array
 *  when the file already has one; otherwise lifts the legacy view (which is
 *  what every file written before this module holds).
 *
 *  A CLAUDE ARRAY WITH NO `plan` LIMIT TAKES ITS PLAN LIMIT FROM THE LEGACY
 *  VIEW (r2). For claude the legacy buckets ARE the plan limit — `fromLegacy`
 *  builds exactly that — and there is one producer that can state them without
 *  being able to state anything else: the shipped statusline, a single file on
 *  hosts with no checkout, which measures `rate_limits` and nothing more.
 *  Round 1 let it rebuild the whole object from a hand-written preserve list
 *  that did not name `limits`, so one ordinary render deleted the canonical
 *  half of every claude snapshot (reproduced against the real tool). The fix is
 *  not a longer preserve list — that list is the tool that has failed six times
 *  on this one file. The tool now keeps every limit it did not measure and
 *  DROPS the one it did, leaving its reading in the legacy buckets it has
 *  always written; this rung puts the plan limit back, stamped with that
 *  object's own `source`/`fetchedAt`, which are the statusline's own and are
 *  therefore the only provenance it is entitled to. A producer that cannot
 *  express a window state or another limit's age can never forge one.
 *
 *  `familyOf` is INJECTED (src/model-family.js) — quota-model is PURE and this
 *  module must not decide the family vocabulary either. */
function liftCacheObject(obj, { identity = null, backend = null, familyOf = null, measuredAt = null } = {}) {
  if (!obj || typeof obj !== 'object') return quotaModel.makeLimitSet({ identity });
  const be0 = backend || backendOfCacheObject(obj);
  if (Array.isArray(obj.limits)) {
    const set = quotaModel.makeLimitSet({ identity, fetchedAt: obj.fetchedAt, source: obj.source, limits: obj.limits });
    // Scoped to claude on purpose: codex names its limits itself ('codex',
    // 'codex_bengalfox', 'premium') and none of them is called 'plan', so a
    // backend-blind rung would invent a plan limit on every codex file — and on
    // every file of a third harness (lane antigravity-card-fixes, reproduced: an
    // antigravity reading's projected 5h/7d came back as a phantom 'plan' limit
    // and its 7d windows as duplicate model caps on the SECOND write).
    if (be0 === 'claude') {
      const { CLAUDE_EXTRA_KEYS } = require('./harnesses/claude-quota.js');
      const legacy = quotaModel.fromLegacy(obj, {
        identity, source: obj.source || null, fetchedAt: Number(measuredAt) || Number(obj.fetchedAt) || null,
        limitId: 'plan', familyOf, extraKeys: CLAUDE_EXTRA_KEYS,
      });
      const have = new Set(set.limits.map((l) => l && l.limitId));
      const restored = [];
      const plan = have.has('plan') ? null : legacy.limits.find((l) => l && l.limitId === 'plan');
      // Only when the legacy view actually STATES something. An account whose
      // plan limit is genuinely absent (no buckets at all) keeps it absent —
      // this rung restores a reading, it does not manufacture one.
      if (plan && plan.windows.length) restored.push(plan);
      // THE SAME RUNG FOR A MODEL CAP THE STATUSLINE MEASURED (2.1.274 ships
      // `rate_limits.model_scoped[]`, inc-mubu23bd-5vxi): the tool drops the
      // `model:<name>` limit it measured exactly as it drops the plan one, so a
      // legacy `scopedWeekly` entry whose limit is ABSENT from the array is that
      // reading, stamped with the object's own provenance. Every write-path
      // write projects the array INTO `scopedWeekly`, so after a retirement the
      // entry is gone too — the only way an entry outlives its limit is the
      // producer that cannot construct one.
      for (const l of legacy.limits) if (l && l.scope === 'model' && !have.has(l.limitId)) restored.push(l);
      if (restored.length) return quotaModel.makeLimitSet({ ...set, limits: [...restored, ...set.limits] });
    }
    return set;
  }
  const be = be0;
  const at = Number(measuredAt) || Number(obj.fetchedAt) || null;
  if (be === 'codex') {
    const { limitSetFromSnapshot } = require('./harnesses/codex-quota.js');
    return limitSetFromSnapshot({ ...obj, fetchedAt: at || obj.fetchedAt }, { identity, source: obj.source || null })
      || quotaModel.makeLimitSet({ identity, fetchedAt: obj.fetchedAt, source: obj.source });
  }
  const { CLAUDE_EXTRA_KEYS } = require('./harnesses/claude-quota.js');
  return quotaModel.fromLegacy(obj, {
    identity, source: obj.source || null, fetchedAt: at, limitId: 'plan', familyOf, extraKeys: CLAUDE_EXTRA_KEYS,
  });
}

/** THE READ-SIDE ENTRY every consumer uses: a cache object (whatever era it
 *  was written in) → the typed set the accessors take. Exported so readers do
 *  not each re-invent "does this file have `limits` yet". */
function limitsOfCache(obj, opts = undefined) { return liftCacheObject(obj, opts); }

// ── what this write actually MEASURED ───────────────────────────────────────

/**
 * A LIFTED LIMIT WHOSE NUMBERS DID NOT MOVE IS NOT A NEW READING (r5).
 *
 * THE DEFECT. A legacy producer hands us ONE reading spread over a
 * carry-forward of everything else: `captureRateLimitEvent` spreads the
 * identity's freshest file, changes the one bucket its event names, and hands
 * the whole object here. `liftCacheObject` then rebuilds EVERY limit on it with
 * THIS producer's `source` and THIS write's clock, and `mergeLimit` prefers the
 * newer copy — so one `rate_limit_event` about the 5-hour bucket re-stamped the
 * model-scoped Fable cap and the overage limit as "via own session, just now".
 * Reproduced against a copy of this instance's own post-migration cache file:
 * `model:fable` went from `on-demand @ 1788974610137` to
 * `rate-limit-event @ 1788975217500` on a record that says nothing about Fable,
 * and its window's `measuredAt` moved to now while `utilization` stayed 1.
 * The panel rows added to END that class (`limitRows` → "via X · Updated Y")
 * were reading the lie.
 *
 * WHY THE ANSWER IS A DERIVATION AND NOT A LIST. "Which fields did I measure?"
 * asked of each producer is a preserve list, and a preserve list is the single
 * tool that has failed on this store six times (scopedWeekly, the org identity,
 * `spend`, `corroborated`, the established window, `limits`). The file can
 * answer it without being asked: a limit whose CLAIM — its numbers, not its
 * clock (`quotaModel.limitClaimKey`) — is unchanged from what the file already
 * holds is the reading the file already holds, so it keeps that reading's
 * provenance, verbatim.
 *
 * THE DIRECTION IT ERRS IN, DELIBERATELY. A producer that genuinely
 * re-measured a number and got the same value keeps the OLDER age: the row
 * says "measured then" rather than "confirmed now". That is the conservative
 * half — a number that looks staler than it is costs a re-read, while a stale
 * number wearing a fresh timestamp is the sentence the readings-by-slot
 * incident could not survive. The FILE-level `fetchedAt` is untouched by this
 * rule, so freshness-ranked machinery (the anchor sweep, the identity-group
 * "freshest file" base) sees exactly what it saw before.
 *
 * NOT APPLIED TO A TYPED `set`. A producer that builds a LimitSet states
 * exactly the limits it carries — that is what the typed shape is FOR — so
 * there is no carried-forward half to detect and re-deriving one would be a
 * second, weaker answer to a question the producer already answered.
 */
function carryUnmeasuredLimits(prevSet, next) {
  const prevById = new Map();
  for (const l of quotaModel.limitsOf(prevSet)) if (l && l.limitId) prevById.set(l.limitId, l);
  if (!prevById.size) return next;
  let carried = 0;
  const limits = quotaModel.limitsOf(next).map((l) => {
    const prev = l && prevById.get(l.limitId);
    if (!prev) return l;
    if (quotaModel.sameLimitClaim(prev, l)) { carried++; return prev; } // the same claim IS the previous reading
    // THE LIMIT MOVED, BUT NOT NECESSARILY ALL OF IT. A claude plan limit holds
    // TWO windows and a `rate_limit_event` names exactly ONE bucket, so the
    // producer's object carries the other window forward verbatim. Granularity
    // is the WINDOW because that is the unit a producer measures — resolving
    // this per LIMIT re-stamped a week-old 7-day number with this event's clock
    // (and `windowState` reads that clock).
    const prevByKind = new Map();
    for (const w of quotaModel.windowsOf(prev)) if (w) prevByKind.set(w.kind, w);
    if (!prevByKind.size) return l;
    let cw = 0;
    const windows = quotaModel.windowsOf(l).map((w) => {
      const pw = w && prevByKind.get(w.kind);
      if (!pw || quotaModel.windowClaimKey(pw) !== quotaModel.windowClaimKey(w)) return w;
      cw++;
      return pw;
    });
    if (!cw) return l;
    carried++;
    return { ...l, windows };
  });
  return carried ? quotaModel.makeLimitSet({ ...next, limits }) : next;
}

/**
 * RETIRING A LIMIT THE PRODUCER NO LONGER REPORTS (r5, the second finding).
 *
 * `mergeLimitSets` keeps every previous limitId unconditionally — that is the
 * whole B-9213 fix, and it is right for the producers that know about ONE
 * limit. But it also means NOBODY can say a limit is gone: a model-scoped cap
 * the vendor stops reporting is resurrected forever with its last number, and
 * `toLegacyView` re-emits it into `scopedWeekly`, so the pool mins over a cap
 * that no longer exists. Reproduced: two scoped caps, then a panel read naming
 * only one, and `accountRemaining` answered `{remaining:0}` — for an account
 * whose live reading says 80. The base commit answered 80: the producer's list
 * landed verbatim there, so this is a regression of this branch's own making.
 *
 * `replace` is not the answer — it is documented as repair-only and it drops
 * EVERYTHING, including limits this producer never had an opinion about.
 *
 * So the producer says it, and only a producer that can: `authoritativeScopes`
 * is passed exactly where the call site's OWN parse enumerated the complete set
 * (a `/usage` panel that listed model caps lists all of them). A producer that
 * carried the previous list forward, or that knows about one bucket, must never
 * pass it — and forgetting to pass it leaves today's behaviour (a stale cap
 * lingers until its own reset), which is the safe direction to fail in.
 */
function retireUnnamedScopes(prevSet, next, scopes, { key = null, source = null } = {}) {
  const drop = new Set(Array.isArray(scopes) ? scopes : []);
  if (!drop.size) return prevSet;
  const named = new Set(quotaModel.limitsOf(next).map((l) => l && l.limitId).filter(Boolean));
  const retired = [];
  const kept = quotaModel.limitsOf(prevSet).filter((l) => {
    if (!l || !drop.has(l.scope) || named.has(l.limitId)) return true;
    retired.push(l);
    return false;
  });
  if (!retired.length) return prevSet;
  // LOUD, AND IT NAMES THE CLAIM IT IS DROPPING (r6). "Retired model:opus" and
  // "retired model:opus, which was reading 100 % and counting" are different
  // sentences to whoever reads this line after the pool starts spending on an
  // account it thought was free — the second one says whether a constraint just
  // disappeared. (`state`/`usedPct` come off the limit's own windows; a limit
  // with no window states nothing, and the line says that too.)
  const describe = (l) => {
    const w = quotaModel.windowsOf(l).filter((x) => x && x.usedPct != null)
      .sort((a, b) => (b.usedPct || 0) - (a.usedPct || 0))[0];
    return w ? `${l.limitId} (${Math.round(w.usedPct)}% ${w.kind}, ${w.state})` : `${l.limitId} (no window)`;
  };
  try { console.log(`[usage-write] ${key}: ${source || 'a producer'} enumerated ${[...drop].join('/')} and did not list ${retired.map(describe).join(', ')} — retiring`); } catch { }
  return quotaModel.makeLimitSet({ ...prevSet, limits: kept });
}

// ── the write ───────────────────────────────────────────────────────────────

/** Fields the derived view OWNS. Everything else on the object the producer
 *  computed is carried through verbatim (identity, planType, resetCredits,
 *  corroborated, scopedFetchedAt, …) — this module projects the buckets, it
 *  does not curate the rest. */
const DERIVED_KEYS = ['fiveHour', 'sevenDay', 'scopedWeekly', 'overage', 'fiveHourAbsent'];

// ── A WINDOW THE VENDOR REMOVED, OR GAVE BACK (lane no-5h-window) ───────────
/** A reading that ENUMERATED the plan's windows found `kinds` missing (`absentWindows`, from the parse's own
 *  `quotaModel.absentWindowsOf` — never from a stored object): the plan limit of `next` loses those windows and
 *  carries the dated tombstone. A set with no plan limit gets one holding only the tombstone. */
function markPlanAbsent(next, kinds, at) {
  const list = Array.isArray(kinds) ? kinds.filter(Boolean) : [];
  if (!list.length) return next;
  const limits = quotaModel.limitsOf(next).slice();
  const i = limits.findIndex((l) => l && l.scope === 'plan');
  const plan = i >= 0 ? limits[i] : quotaModel.makeLimit({ limitId: 'plan', scope: 'plan', windows: [], source: next.source, fetchedAt: at });
  const marked = quotaModel.markWindowsAbsent(plan, list, at);
  if (i >= 0) limits[i] = marked; else limits.unshift(marked);
  return quotaModel.makeLimitSet({ ...next, limits });
}

/** THE CHANGE, judged where every write-path write passes: the 5h window the file HAD is now tombstoned
 *  ('removed'), or a tombstoned file holds a 5h window again ('restored'). «Had» reads the file as stored, and
 *  the raw `fiveHourAbsent` too — a direct writer (the shipped statusline) may restore a window behind this
 *  module's back, and the view field it spread forward is the last thing the write path said. A reading that
 *  never had one and reads none now is a SHAPE, not a change: nothing is said. */
function windowChangeOf(prevObj, prevSet, merged) {
  const prevPlan = quotaModel.planLimit(prevSet), nowPlan = quotaModel.planLimit(merged);
  const had5 = !!quotaModel.windowOfKind(prevPlan, '5h');
  const wasAbsent = !!quotaModel.absentSince(prevPlan, '5h') || !!(prevObj && Number(prevObj.fiveHourAbsent) > 0);
  const nowAbsent = quotaModel.absentSince(nowPlan, '5h');
  const now5 = quotaModel.windowOfKind(nowPlan, '5h');
  if (nowAbsent && had5 && !wasAbsent) return { kind: '5h', change: 'removed', at: nowAbsent };
  if (now5 && wasAbsent) return { kind: '5h', change: 'restored', at: Number(now5.measuredAt) || Date.now() };
  return null;
}
// ── THE PASSIVE WITNESS (lane no-5h-window r3, acceptance r2 BLOCKER) ──────
// A PASSIVE answer — a statusline render, a stream `rate_limit_event` — is the CLI's OWN rate-limit state, and the CLI
// DROPS a window whose reset has passed from both (2.1.314: the statusline's `cn`/`ot` filter, the stream's `xd`), and
// re-renders the statusline AT that reset. So «the week and no five_hour» is the NORMAL shape of every member in the
// minutes after its 5h reset: on its own it proves nothing. It becomes evidence only when it carries a NEW API answer —
// the plan week MOVED (utilization or reset) since the previous reading of it — and only TWO such answers lay the
// tombstone (identity by witness, never by time). `planWeekSig` (the last passive reading of the week, both producers
// spell it `7d:<integer %>@<reset s>` so one API answer seen by both counts once) and `fiveHourAbsentWitnesses` ({n,
// at}) are raw fields of the file; any producer that states a 5h window again ends the count. An ENUMERATING reading
// (a verified /usage panel, an OAuth usage reply) needs no second witness: it is `absentWindows`, above.
const PASSIVE_WITNESSES = 2;

// ONE listener (the pool engine's, which says the change once to the owner): the write path is SHARED tier and
// knows no For-you store, so it only reports what it saw.
let _onWindowChange = null;
function onWindowChange(fn) { _onWindowChange = typeof fn === 'function' ? fn : null; }

function atomicWrite(file, text) {
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
}

/**
 * THE write. `obj` is the legacy-shaped snapshot the producer computed (it
 * keeps whatever preserve-merge rules it already had); we lift it, merge its
 * limits into the file's, project the buckets back, and persist.
 *
 * @param {string} cacheDir
 * @param {string} key            the identity this reading is filed on (already resolved)
 * @param {object} obj            the producer's snapshot
 * @param {object} [set]          the TYPED set, when the producer built one (preferred —
 *                                a single-limit push must not be inferred from a
 *                                collapsed legacy object)
 * @param {number} [measuredAt]   when the WINDOWS were measured (ms). Separate from
 *                                `obj.fetchedAt` on purpose: the sibling fan-out marks a
 *                                bucket without promoting the file to "freshest", and a
 *                                window measured now must not lose the merge to an older file.
 * @param {string} [source]       the producer's own name (stamped per limit)
 * @param {function} [familyOf]   model-family resolver for scoped buckets
 * @param {string} [backend]      'claude' | 'codex' — shape hint for the lift
 * @param {function} [onRefuse]   called with (why, errors) when we refuse to write
 * @param {boolean} [replace]     REPLACE the file's limits instead of merging into them.
 *                                Exactly ONE caller may ask for this: the repair
 *                                migration, whose whole job is to remove a bucket
 *                                that is provably not this account's. Merging there
 *                                would resurrect what it just archived — so the
 *                                exception is NAMED rather than smuggled in by
 *                                writing the file behind this module's back.
 * @param {string[]} [authoritativeScopes]  scopes this producer ENUMERATED. A limit of
 *                                such a scope that the file holds and this write does
 *                                not name is RETIRED instead of carried forward. Pass it
 *                                only where the call site's own parse produced the
 *                                complete list — see `retireUnnamedScopes`.
 * @returns {{ok:boolean, why?:string, errors?:string[], limits?:Array, file?:string}}
 */
function writeCacheObject({ cacheDir, key, obj, set = null, measuredAt = null, source = null, familyOf = null, backend = null, onRefuse = null, replace = false, authoritativeScopes = null, absentWindows = null, passiveAnswer = null }) {
  if (!cacheDir || !key) return { ok: false, why: 'no cacheDir/key' };
  const file = cacheFileFor(cacheDir, key);
  const at = Number(measuredAt) || Number(obj && obj.fetchedAt) || Date.now();
  // THE FILE IS READ FIRST, because the lift below needs it: a legacy snapshot
  // is ONE reading spread over a carry-forward of everything else, and only the
  // file can say which halves are which (carryUnmeasuredLimits).
  let prevObj = null;
  if (!replace) { try { prevObj = JSON.parse(fs.readFileSync(file, 'utf-8')) || null; } catch { prevObj = null; } }
  let prevSet = quotaModel.makeLimitSet({ identity: key });
  if (prevObj) {
    prevSet = liftCacheObject(prevObj, { identity: key, backend, familyOf });
    const vPrev = quotaModel.validateLimitSet(prevSet);
    if (!vPrev.ok) {
      // A file already on disk being malformed must NEVER block a new reading —
      // that would make one bad write permanent. Drop its limits, say so, and
      // let this write re-establish the canonical half.
      try { console.warn('[usage-write] stored limits for', key, 'are malformed — rebuilding from this reading:', vPrev.errors.join('; ')); } catch { }
      prevSet = quotaModel.makeLimitSet({ identity: key });
    }
  }
  let next = set;
  if (!next) {
    next = liftCacheObject(obj, { identity: key, backend, familyOf, measuredAt: at });
    next = carryUnmeasuredLimits(prevSet, next);
  }
  // Stamp the producer's name on every limit this write MEASURED. A producer WE
  // SHIP always names itself — "unknown source, printed verbatim" is a rule for
  // producers we have never seen, and using it on our own is the honesty
  // feature telling a lie (2026-09-07 r3). A carried-forward limit already
  // carries the name of the producer that DID measure it, and `l.source ||`
  // leaves that alone.
  if (source) {
    next = quotaModel.makeLimitSet({
      ...next,
      source,
      limits: next.limits.map((l) => ({ ...l, source: l.source || source })),
    });
  }
  // «NO 5h LIMIT» (lane no-5h-window): only an enumerating call site passes it, from its parse's own mark.
  if (Array.isArray(absentWindows) && absentWindows.length) next = markPlanAbsent(next, absentWindows, at);
  // …or a passive answer, counted as a WITNESS (r3): `{weekSig, fiveHour, absent5h}` from the stream capture.
  let witness, weekSig = null; // witness: undefined = the file's own count stands, null = ended, {n, at} = this count
  if (passiveAnswer && typeof passiveAnswer === 'object' && !replace) {
    weekSig = typeof passiveAnswer.weekSig === 'string' && passiveAnswer.weekSig ? passiveAnswer.weekSig : null;
    const prevSig = prevObj && typeof prevObj.planWeekSig === 'string' ? prevObj.planWeekSig : null;
    if (passiveAnswer.fiveHour) witness = null;
    else if (passiveAnswer.absent5h && weekSig && prevSig && weekSig !== prevSig && !quotaModel.absentSince(quotaModel.planLimit(prevSet), '5h')) {
      const pw = prevObj && prevObj.fiveHourAbsentWitnesses;
      const n = (pw && Number(pw.n) > 0 ? Number(pw.n) : 0) + 1;
      if (n >= PASSIVE_WITNESSES) { next = markPlanAbsent(next, ['5h'], at); witness = null; } else witness = { n, at };
    }
  }
  // ANY producer that MEASURED a 5h window (its claim is not the file's) ends the count — the window is there.
  const measured5h = (() => {
    const w = quotaModel.windowOfKind(quotaModel.planLimit(next), '5h');
    if (!w) return false;
    const pw = quotaModel.windowOfKind(quotaModel.planLimit(prevSet), '5h');
    return !pw || quotaModel.windowClaimKey(pw) !== quotaModel.windowClaimKey(w);
  })();
  if (measured5h) witness = null;
  const vNext = quotaModel.validateLimitSet(next);
  if (!vNext.ok) {
    const why = `refusing to write ${key}: the producer's limit set is malformed`;
    try { console.error('[usage-write]', why, vNext.errors.join('; ')); } catch { }
    try { onRefuse && onRefuse(why, vNext.errors); } catch { }
    return { ok: false, why, errors: vNext.errors };
  }
  const base = replace ? prevSet : retireUnnamedScopes(prevSet, next, authoritativeScopes, { key, source: source || (obj && obj.source) || null });
  const merged = quotaModel.mergeLimitSets(base, next);
  const view = quotaModel.toLegacyView(merged);
  const out = { ...(obj && typeof obj === 'object' ? obj : {}) };
  // THE DERIVED VIEW WINS over whatever the producer computed for the bucket
  // fields — that is the whole point: the producer knows about its own limit,
  // the projection knows about all of them. Non-bucket fields are the
  // producer's and are untouched.
  for (const k of DERIVED_KEYS) {
    if (view[k] !== undefined) out[k] = view[k];
    else if (k !== 'overage') delete out[k]; // never leave a stale bucket the model does not carry
  }
  out.limits = merged.limits;
  delete out.windowChangeUnsaid; // a direct writer's unsaid change is said by THIS write (below) or by nobody
  // the passive witness's raw fields are the FILE's (a producer's object may be a SIBLING's spread)
  for (const k of ['planWeekSig', 'fiveHourAbsentWitnesses']) { if (prevObj && prevObj[k] !== undefined) out[k] = prevObj[k]; else delete out[k]; }
  if (weekSig) out.planWeekSig = weekSig;
  if (witness === null || quotaModel.absentSince(quotaModel.planLimit(merged), '5h')) delete out.fiveHourAbsentWitnesses;
  else if (witness) out.fiveHourAbsentWitnesses = witness;
  // THE STORED RESET-CREDIT COUNT survives a push that does not state it (r2,
  // reproduced: one passive codex push erased it from the file the roster and
  // the rung read). The producer's own count wins when it has one; else the
  // merged set's (a set lifted from producers that stated it); else the FILE's
  // own — a lifted file with `limits` carries no `extra`, so the view alone
  // cannot remember it. Never on a REPLACE (the repair names what survives).
  if (out.resetCredits === undefined) {
    if (view.resetCredits !== undefined) out.resetCredits = view.resetCredits;
    else if (prevObj && prevObj.resetCredits && typeof prevObj.resetCredits === 'object') out.resetCredits = prevObj.resetCredits;
  }
  // `fetchedAt` IS NEVER INVENTED HERE. It means "this file was promoted to
  // freshest at t", the producers own that decision (the sibling fan-out
  // deliberately withholds it), and the repair writes an identity-only remnant
  // whose entire point is that NOTHING on it claims to be a reading.
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    atomicWrite(file, JSON.stringify(out));
  } catch (e) {
    return { ok: false, why: 'write failed: ' + e.message };
  }
  // …or the change a DIRECT writer saw and left unsaid (the shipped statusline: `windowChangeUnsaid`) — said here
  // once when the merged set agrees with it, and the marker never outlives this write.
  const unsaid = (prevObj && prevObj.windowChangeUnsaid) || (obj && obj.windowChangeUnsaid) || null;
  const nowPlan = quotaModel.planLimit(merged);
  const unsaidHolds = !!(unsaid && unsaid.kind === '5h' && (unsaid.change === 'removed' ? !!quotaModel.absentSince(nowPlan, '5h') : unsaid.change === 'restored' ? !!quotaModel.windowOfKind(nowPlan, '5h') : false));
  const windowChange = replace ? null : (windowChangeOf(prevObj, prevSet, merged) || (unsaidHolds ? { kind: '5h', change: unsaid.change, at: Number(unsaid.at) || Date.now() } : null));
  if (windowChange && _onWindowChange) { try { _onWindowChange({ key, ...windowChange, source: source || (obj && obj.source) || null }); } catch { } }
  return { ok: true, file, limits: merged.limits, object: out, ...(windowChange ? { windowChange } : {}) };
}

/** The typed entry: a producer that built a LimitSet hands it here and never
 *  spells the legacy shape at all. `extras` are the non-bucket fields it wants
 *  persisted (identity, planType, …). */
function writeReading({ cacheDir, key, set, extras = null, source = null, familyOf = null, backend = null, onRefuse = null }) {
  const base = { ...(extras && typeof extras === 'object' ? extras : {}) };
  if (set && set.fetchedAt) base.fetchedAt = set.fetchedAt;
  if (source || (set && set.source)) base.source = source || set.source;
  if (set && set.extra) for (const [k, v] of Object.entries(set.extra)) if (base[k] === undefined) base[k] = v;
  return writeCacheObject({ cacheDir, key, obj: base, set, source: source || (set && set.source) || null, familyOf, backend, onRefuse });
}

/** A SIDECAR beside the cache (`.window-<key>`, `.slot-<id>`, …). Deliberately
 *  here: these files live in the same directory and must be written with the
 *  same atomicity, and the write-path census would otherwise have to allow
 *  arbitrary writers into the directory to serve them. Never `.json` — every
 *  usage-cache scanner filters on that suffix. */
function writeSidecar(cacheDir, name, payload) {
  if (/\.json$/.test(String(name))) throw new Error('a usage-cache sidecar must not end in .json — every scanner would pick it up');
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    atomicWrite(path.join(cacheDir, name), typeof payload === 'string' ? payload : JSON.stringify(payload));
    return true;
  } catch { return false; }
}

module.exports = {
  cacheFileFor, isCacheFileName, readCacheObject,
  backendOfCacheObject, liftCacheObject, limitsOfCache,
  writeCacheObject, writeReading, writeSidecar,
  carryUnmeasuredLimits, retireUnnamedScopes, markPlanAbsent, windowChangeOf, onWindowChange, PASSIVE_WITNESSES,
  DERIVED_KEYS,
};
