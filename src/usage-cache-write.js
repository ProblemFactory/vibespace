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
const SR = require('./store-read.js');   // r3136: the store-read law's one answer (data / missing / unreadable / corrupt)
const DFILE = require('./agentd/durable-file.js');   // B-574d «usage-readings» (主开发 r5075 (B)): THE device's one door — the person's set-aside's stub is a RECORD (the device bundles this module)

/** THE cache filename rule, in ONE place. Every producer spelled this inline;
 *  a key that sanitises differently in two places is two different accounts. */
function cacheFileFor(cacheDir, key) {
  return path.join(cacheDir, cacheFileName(key));
}
/** an account's reading file's NAME (no folder): what a write's notice names, matched by a listener (r3285 (7)) */
function cacheFileName(key) { return String(key).replace(/[^\w.-]/g, '_') + '.json'; }

/** Is this directory entry a usage-cache SNAPSHOT? (Not `__models__.json`, not
 *  a `.window-`/`.slot-` sidecar — those deliberately carry no `.json`.) */
function isCacheFileName(fn) { return /\.json$/.test(fn) && !fn.startsWith('__models__'); }

function readCacheObject(cacheDir, key) {
  // r3136: a read that FAILS (not «not there») marks the account unknown — a consumer that gates spend or placement asks
  // readingUnread and HOLDS; a read that answers clears the mark only while no refused write is owed (it is replayed by the next write)
  try { const v = readCacheJson(cacheFileFor(cacheDir, key)) || null; if (!_owed.has(String(key))) clearUnread(key); return v; }
  catch (e) { if (!(e && e.code === 'ENOENT')) markUnread(key, e instanceof SyntaxError ? 'torn bytes' : ((e && e.code) || 'unreadable')); return null; }
}
/** THE CACHE MODULE'S READERS (lane lg-store-writes, B-0248 U6.1): every hub read of a file in the readings folder goes
 *  through these — so that when the folder's writes move off the main thread (U6.5) ONE place consults the pending copy
 *  first. Each throws exactly as the raw call it replaces did (a caller keeps its own try). */
// `via` (U6.2): a reader with run-reads' shape — readText(file) / readdir(dir) — the hub's pool passes src/run-reads.js (B-403e:
// one ask per file per synchronous run); the module never requires it (it is bundled into the device agent)
function readCacheJson(file, { via = null } = {}) { return JSON.parse(via ? via.readText(file) : fs.readFileSync(file, 'utf-8')); }
function listCacheDir(dir, { via = null } = {}) { return via ? via.readdir(dir) : fs.readdirSync(dir); }

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
        limitId: 'plan', familyOf, extraKeys: CLAUDE_EXTRA_KEYS, stored: measuredAt == null,   // B-37bc: a stored object's buckets by their own stamps
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
    stored: measuredAt == null,   // B-37bc: a STORED object (no write instant given) is dated by the one order; a write's own object by the write
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
// ── THE PASSIVE WITNESS (lane no-5h-window r3; r4: PER PRODUCER, acceptance r3 BLOCKER) ──────
// A PASSIVE answer — a statusline render, a stream `rate_limit_event` — is ONE claude process's own rate-limit state,
// and the CLI DROPS a window whose reset has passed from both (2.1.314: the statusline's `cn`/`ot` filter, the
// stream's `xd`), and re-renders the statusline AT that reset. So «the week and no five_hour» is the NORMAL shape of
// every member in the minutes after its 5h reset: on its own it proves nothing. It is evidence only when it carries a
// NEW API answer — the week moved FORWARD against the SAME producer's previous reading — and TWO such answers from one
// producer lay the tombstone (`quotaModel.countPassiveAnswer`, the rule the shipped statusline mirrors byte for byte).
// The file's last writer is no baseline: every session on the account writes this file, and two of them holding
// different stale weeks used to alternate the file's signature into two «witnesses» (reproduced with the shipped tool).
// `fiveHourAbsentWitnesses` ({<producer>: {n, lastSig, at}}) is a raw field of the FILE. An ENUMERATING reading (a
// verified /usage panel, an OAuth usage reply) needs no second witness: it is `absentWindows`, above.
const PASSIVE_WITNESSES = quotaModel.PASSIVE_WITNESSES;

// ONE listener (the pool engine's, which says the change once to the owner): the write path is SHARED tier and
// knows no For-you store, so it only reports what it saw.
let _onWindowChange = null;
function onWindowChange(fn) { _onWindowChange = typeof fn === 'function' ? fn : null; }
// …and ONE listener for «a reading of `key` landed» (lane reset-unproven: the pool engine ends a member's proof in flight
// — the proving spawn — the moment its first reading is written). `at` = when the windows were measured (ms). A REPAIR
// (`replace`) measures nothing and says nothing.
let _onReading = null;
function onReading(fn) { _onReading = typeof fn === 'function' ? fn : null; }
// A RESET SEEN IN A READING (lane account-reset-door): the one write path names a lane whose newer MEASUREMENT dropped under
// an unchanged, still-ahead reset (quotaModel.resetsSeen) — every subscriber hears it (the claim store says it once and ends
// a claim on it; the pool engine lifts the session walls that came from THAT lane). Compared on the RAW PAIR before the
// merge (r2, ROOT 2): the stored reading against the producer's OWN measurement, each lane by its own time — never the
// merged object, whose lift stamps a carried bucket with the write's clock (a late older record would read as a reset),
// never a wall's mark, a repair or a view. A DIRECT writer (the shipped
// statusline) is compared by its reader through `noteDirectWrite` — once a write: a file the write path itself wrote and
// compared is not compared again.
const _onVendorReset = new Set();
function onVendorReset(fn) { if (typeof fn === 'function') _onVendorReset.add(fn); return () => _onVendorReset.delete(fn); }
function noteVendorResets(key, prev, next, nowMs = Date.now(), { cacheDir = null } = {}) {
  let seen = [];
  try { seen = quotaModel.resetsSeen(prev, next, nowMs); } catch { seen = []; }
  return sayVendorResets(key, seen, cacheDir);
}
function sayVendorResets(key, seen, cacheDir = null) {
  if (!Array.isArray(seen) || !seen.length) return [];
  for (const fn of _onVendorReset) { try { fn({ key, resets: seen, cacheDir }); } catch { } }
  return seen;
}
// THE LANES A WRITE MEASURED (lane account-reset-door r2): the claim store settles a claim on them — a ⟳ that re-read a
// claimed cap at the SAME 97 % keeps that window's older age (the carry rule) and is still the contradiction
const _onLanesRead = new Set();
function onLanesRead(fn) { if (typeof fn === 'function') _onLanesRead.add(fn); return () => _onLanesRead.delete(fn); }
const _comparedOut = new Map(); // key → the stamp of the object the write path last wrote AND compared (the reader's dedupe)
const outStamp = (o) => (o && typeof o === 'object' ? `${o.fetchedAt}|${o.source}|${Array.isArray(o.limits) ? o.limits.length : '-'}` : '');
// THE LANES A STATED WRITE MEASURED (r3): the producer's own lifted reading, restricted to what it named; a refused lane is a
// refusal (no number of spend), synthesized at 100 % when the producer's reading holds no window for it
function statedLanesNow({ stated, refusedKeys, lifted, own, at }) {
  const keys = new Set([...(Array.isArray(stated) ? stated.filter((l) => quotaModel.isLaneKey(l)) : stated && typeof stated === 'object' ? quotaModel.statedLanesOf(stated, own) : []), ...refusedKeys]);
  const t = Number(at) || Date.now();
  const rows = quotaModel.lanesOfReading({ fetchedAt: t, limits: quotaModel.limitsOf(lifted) }).filter((x) => keys.has(x.lane));
  const stamps = new Map(quotaModel.lanesOfReading(own && typeof own === 'object' ? { ...own, limits: undefined } : null).filter((x) => x.own).map((x) => [x.lane, x.at]));
  const out = rows.map((x) => ({ ...x, at: stamps.has(x.lane) && stamps.get(x.lane) < t ? stamps.get(x.lane) : t }));
  for (const l of refusedKeys) if (!out.some((x) => x.lane === l)) out.push({ lane: l, at: t, usedPct: 100, resetsAt: null, source: null, mark: true });
  return out.map((x) => (refusedKeys.includes(x.lane) ? { ...x, refused: true, mark: true, at: t } : x));
}
// WHEN EACH LANE WAS LAST STATED (r3, the age badge): the carry rule keeps an unchanged number's older `measuredAt` — the
// number's provenance — so «read 14 h ago» stood beside a lane a ⟳ had just read. The write path knows; /api/usage hands it.
const _lanesReadAt = new Map();
function noteLanesReadAt(key, lanes) {
  let m = _lanesReadAt.get(key);
  if (!m) { m = new Map(); _lanesReadAt.set(key, m); if (_lanesReadAt.size > 2048) _lanesReadAt.delete(_lanesReadAt.keys().next().value); }
  for (const x of lanes) if (x && x.lane && Number(x.at) > (m.get(x.lane) || 0)) m.set(x.lane, Number(x.at));
}
function lanesReadAt(key) { const m = _lanesReadAt.get(key); return m ? Object.fromEntries(m) : {}; }
// A DIRECT writer's write (the shipped statusline writes the file itself): the lanes it STATED are those whose own stamp
// (`asOf` — it stamps every window it renders) is newer than the file's last one; a bucket it spread forward unstated has
// no new stamp and settles nothing. Compared by its reader once a write.
function noteDirectWrite(key, prev, next, { nowMs = Date.now(), cacheDir = null } = {}) {
  if (!prev || !next || _comparedOut.get(key) === outStamp(next)) return [];
  let was = [], now = [];
  try { was = quotaModel.lanesOfReading(prev); now = quotaModel.lanesOfReading(next); } catch { return []; }
  const before = new Map(was.map((x) => [x.lane, x]));
  const statedNow = now.filter((x) => x.own && Number(x.at) > 0 && !(before.get(x.lane) && Number(before.get(x.lane).at) >= Number(x.at)));
  if (statedNow.length) { noteLanesReadAt(key, statedNow); for (const fn of _onLanesRead) { try { fn({ key, cacheDir, lanes: statedNow }); } catch { } } }
  let seen = [];
  try { seen = quotaModel.resetsSeenLanes(was, statedNow, nowMs); } catch { seen = []; }
  return sayVendorResets(key, seen, cacheDir);
}

// B-360d part 3 U3: a file the hub wrote replaces its entry in the folder's kept reply at once (src/usage-cache-folder.js)
const _onWritten = new Set();
function onWritten(fn) { if (typeof fn === 'function') _onWritten.add(fn); return () => _onWritten.delete(fn); }
// `replace`: the write is a repair's REPLACE (writeCacheObject replace:true, the repair's fallback) — it stands over any reading a read in
// flight took (r2120 (1)); a reading's write stands only when it is not older than what the read saw
function noteWritten(file, text, { replace = false } = {}) { for (const fn of _onWritten) { try { fn(file, text, { replace }); } catch { } } }
function atomicWrite(file, text, { replace = false } = {}) {
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
  noteWritten(file, text, { replace });
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
// ── r3136 (the store census, form 3 item 2): AN ACCOUNT's READING FILE IS NEVER MERGED OVER A READ THAT FAILED ──────────────
// «not there» (ENOENT: a first reading), «the read failed» (refused: EIO, a lock, a storage gone) and «the bytes do not parse» are
// three answers (src/store-read.js). The read-merge-write stays SYNCHRONOUS (the readings' standing rule); nothing else is added
// on the loop but the torn case's own copy.
//  · FAILED: the write is REFUSED for that account and its reading is KEPT IN MEMORY (bounded: OWED_MAX an account, OWED_KEYS
//    accounts; a restart forgets it) — replayed in order before the next write of that account whose read answers, because a
//    reading may carry a WALL the next one does not state (an ordinary reading dropped is replaced by the next; a lost wall is
//    not). Said ONCE an episode in the journal, by the account's kind and an opaque id only. While the mark stands every reader
//    asked answers UNKNOWN for that account (readingUnread): a consumer that gates spend or placement HOLDS.
//  · TORN BYTES: kept aside ONCE per content (`<file>.corrupt-<ms>`, compared byte for byte with the newest copies — no digest
//    written under data/) BEFORE the name is written; then the reading starts the file again. No place for the copy ⇒ refused
//    like a failed read (the live file is then their only copy).
const OWED_MAX = 8, OWED_KEYS = 256, COPY_LOOK = 20;
const _owed = new Map();      // key → [the refused writes' arguments], oldest first
const _unread = new Map();    // key → { code, at }: the account's reading file did not answer
const _unreadSaid = new Set();
/** the account in a journal line: its kind and an OPAQUE id — never an address, an organisation id or a name holding either */
function accountWord(key) {
  const k = String(key || '');
  if (k === '__global__') return "the hub's own login";
  if (/^(sub|pool|acct|key)-[A-Za-z0-9]{4,40}$/.test(k)) return `account ${k}`;
  return 'an account';
}
/** ONE read of a reading file → the law's answer, with its bytes */
function readStored(file) {
  let read;
  try { const buf = fs.readFileSync(file); read = { text: buf.toString('utf-8'), buf }; } catch (e) { read = { error: e }; }
  return { ...SR.storeAnswer(read), buf: read.buf || null };
}
/** torn bytes beside the file, ONCE per content → { name: the copy's basename, fresh: kept by THIS call }, or null (no place for it) */
function keepTornAside(file, buf) {
  const dir = path.dirname(file), head = path.basename(file) + '.corrupt-';
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.startsWith(head)).sort().slice(-COPY_LOOK); } catch { names = []; }
  for (const n of names.reverse()) { try { const b = fs.readFileSync(path.join(dir, n)); if (b.length === buf.length && b.equals(buf)) return { name: n, fresh: false }; } catch { /* not this one */ } }
  for (let k = 0; k < 5; k++) {
    const to = path.join(dir, head + Date.now() + (k ? '-' + k : ''));
    try { fs.writeFileSync(to, buf, { flag: 'wx', mode: 0o600 }); return { name: path.basename(to), fresh: true }; } catch (e) { if (!e || e.code !== 'EEXIST') return null; }
  }
  return null;
}
const _onUnreadMarked = new Set();   // r3200: (key, {code, at}) — an episode BEGINS for that account (its For-you item is filed)
function onUnreadMarked(fn) { if (typeof fn === 'function') _onUnreadMarked.add(fn); return () => _onUnreadMarked.delete(fn); }
function markUnread(key, code) {
  const k = String(key);
  const fresh = !_unread.has(k);
  _unread.set(k, { code: String(code || 'unreadable'), at: fresh ? Date.now() : _unread.get(k).at });
  if (_unread.size > OWED_KEYS) { const old = _unread.keys().next().value; _unread.delete(old); _unreadSaid.delete(old); }   // (the round: an evicted key's next episode is said again)
  if (!_unreadSaid.has(k)) {
    _unreadSaid.add(k);
    // the round's word: TORN BYTES are not «nothing written over it» — the next reading keeps them aside and starts the file again
    const torn = String(code || '') === 'torn bytes';
    try { console.warn(torn ? `[usage-write] ${accountWord(k)}: its reading file did not parse — the account reads unknown until a reading starts the file again (the bytes are kept aside first)` : `[usage-write] ${accountWord(k)}: its reading file could not be read (${String(code || 'unreadable')}) — nothing is written over it; a reading for it waits in memory and is written once the file reads; until then the account reads unknown`); } catch { }
  }
  for (const fn of _onUnreadMarked) { try { fn(k, { ..._unread.get(k), fresh }); } catch { } }   // r3285 (1): every mark — the producer files again for a marked account with no open item
}
/** r3285 (1): the accounts marked unknown now (the producer's tick files again for one with no open item) */
function unreadKeys() { return [..._unread.keys()]; }
const _missingHeld = new Map();   // r3285 (4): key → the aside name, after a press whose last rename AND put-back failed: no file, still held
const _onStartedAgain = new Set();   // r3285 (2): (key, 'started' | 'whole') — a file that started again after torn bytes / made whole
function onStartedAgain(fn) { if (typeof fn === 'function') _onStartedAgain.add(fn); return () => _onStartedAgain.delete(fn); }
const _onUnreadLifted = new Set();   // r3136 commit 2: (key) — the account's reading file reads again (the guard closes its notice)
function onUnreadLifted(fn) { if (typeof fn === 'function') _onUnreadLifted.add(fn); return () => _onUnreadLifted.delete(fn); }
function clearUnread(key) {
  const k = String(key);
  if (_missingHeld.has(k)) return;   // r3285 (4): the file is missing after a failed press — held until a write starts it again
  if (!_unread.delete(k)) return;
  if (_unreadSaid.delete(k)) { try { console.log(`[usage-write] ${accountWord(k)}: its reading file reads again`); } catch { } }
  for (const fn of _onUnreadLifted) { try { fn(k); } catch { } }
}
/** r3200 (the round's should): a waiting reading that STATES A WALL — a refusal it names, or a lane at 100 % or more */
function statesWall(a) {
  if (!a || typeof a !== 'object') return false;
  if ((Array.isArray(a.refused) && a.refused.length) || (Array.isArray(a.refusalMarks) && a.refusalMarks.length)) return true;
  // the producer's object, or (r3285 (5)) a TYPED reading's own set — the usage door's, at its cap — read with that set's limits
  const typed = a.set && Array.isArray(a.set.limits) ? { ...(a.obj && typeof a.obj === 'object' ? a.obj : {}), limits: a.set.limits } : null;
  try { return [a.obj, typed].some((o) => !!o && typeof o === 'object' && quotaModel.lanesOfReading(o).some((l) => Number(l.usedPct) >= 100)); } catch { return false; }
}
/** a refused write: the account marked unknown, its reading owed (never a replace's — the repair migration runs again). Past the
 *  bound the OLDEST PLAIN reading goes first: a wall stated early in the episode outlives later plain ones (only walls ⇒ the oldest) */
function refuseUnread(key, code, args, replace) {
  key = String(key);
  markUnread(key, code);
  if (!replace && args) {
    const l = _owed.get(key) || [];
    l.push(args);
    while (l.length > OWED_MAX) { const i = l.findIndex((a) => !statesWall(a)); l.splice(i >= 0 ? i : 0, 1); }
    _owed.delete(key); _owed.set(key, l);
    if (_owed.size > OWED_KEYS) _owed.delete(_owed.keys().next().value);
  }
  return { ok: false, why: `refusing to write ${accountWord(key)}: its reading file could not be read (${String(code || 'unreadable')}) — nothing is written over it`, unread: true };
}
/** r3136 (主开发 r3146 (2)), PURE: the gating facts a file that STARTED AGAIN after torn bytes has not stated since — each reads
 *  UNKNOWN for its own consumer: 'plan:5h' / 'plan:7d' (a reading that measured the window states it), 'model:*' (an absent
 *  cap: only an enumerating reading states it), 'overage' (claude), 'spendControl' and 'resetCredits' (codex). [] = whole. */
function restartUnknowns(obj) {
  const sa = obj && typeof obj === 'object' ? obj.startedAgain : null;
  if (!sa || typeof sa !== 'object') return [];
  // r3285 (2), THE LAW: after torn bytes the unknown ENDS at the first ENUMERATING reading of that account (the vendor's whole
  // statement — a person's refresh makes one): what it does not state is «never stated», as for a new account (the release's rule)
  if (sa.enumerated) return [];
  const at = Number(sa.at) || 0, out = [];
  let lanes = [];
  try { lanes = quotaModel.lanesOfReading(obj); } catch { lanes = []; }
  const statedLane = (l) => sa.enumerated || lanes.some((x) => x.lane === l && (Number(x.at) || 0) >= at);
  if (!statedLane('plan:5h')) out.push('plan:5h');
  if (!statedLane('plan:7d')) out.push('plan:7d');
  if (!sa.enumerated) out.push('model:*');
  // the harness's own fact (src/backend-caps.js): a backend with stored reset credits states them and its spend control;
  // the others state overage — never a branch on a harness id here
  let credits = false;
  try { credits = !!require('./backend-caps.js').capsOf(backendOfCacheObject(obj)).resetCredit; } catch { credits = false; }
  if (!credits && !sa.overage) out.push('overage');
  if (credits && !sa.spendControl) out.push('spendControl');
  if (credits && !sa.resetCredits) out.push('resetCredits');
  return out;
}
/** THE READING-DOOR's ONE READ (r3136): `null` = NOT THERE (a new account: «no reading», exactly as before), the reading, or
 *  UNREAD_READING — the read FAILED or the bytes are torn: the account is marked unknown, never «no reading» */
const UNREAD_READING = Object.freeze({ held: 'unread' });
function readReading(file, key, { via = null } = {}) {
  const k = key != null ? String(key) : null;
  const failed = (e) => { if (e && e.code === 'ENOENT') return k != null && _missingHeld.has(k) ? UNREAD_READING : null; if (k != null) markUnread(k, e instanceof SyntaxError ? 'torn bytes' : ((e && e.code) || 'unreadable')); return UNREAD_READING; };
  let v;
  try { v = readCacheJson(file, { via }); } catch (e) { return failed(e); }
  if (k != null && _owed.has(k)) {
    // r3200 (the round's should): the file READS AGAIN while readings wait for it — they are written NOW, at this read, in order
    // (an idle account has no writer that would replay them): the door then answers the file they leave
    if (_replaying.has(k)) return UNREAD_READING;
    replayOwed(k);
    if (_owed.has(k)) return UNREAD_READING;   // a replay refused again: still unknown
    try { v = readCacheJson(file, { via }); } catch (e) { return failed(e); }
  }
  if (k != null) clearUnread(k);
  return v;
}
const _replaying = new Set();
/** the waiting readings of `key`, written in order (each through the one writer) — bounded: OWED_MAX, once an episode */
function replayOwed(key) {
  const k = String(key), owed = _owed.get(k);
  if (!owed) return;
  _owed.delete(k); _replaying.add(k);
  try { for (const a of owed) { try { writeCacheObject(a); } catch { } } } finally { _replaying.delete(k); }
}
/** r3200 (主开发: «a way out for the person from a hold that never ends»): THE PERSON's SET-ASIDE of an account's reading file that
 *  cannot be read (owned by another user, a bad inode) or does not parse. Read ONCE MORE first: a file that reads (or is gone) is
 *  never moved ({state:'none'}). Else it is RENAMED beside itself (`<file>.unreadable-<iso>`: nothing deleted) and a file that
 *  STARTED AGAIN takes its place — every gating fact UNKNOWN until a reading states it (restartUnknowns), never «no reading» as for
 *  a new account; the readings waiting in memory are written over it at once. → { ok, state: 'none'|'pass' (set aside), setAside?, why? } */
function setAsideReading({ cacheDir, key, backend = null, now = Date.now() }) {
  if (!cacheDir || !key) return { ok: false, why: 'no cacheDir/key' };
  const k = String(key), file = cacheFileFor(cacheDir, k);
  const st = readStored(file);
  if (st.state === 'data' || st.state === 'missing') { if (_owed.has(k)) replayOwed(k); if (!_owed.has(k)) clearUnread(k); return { ok: true, state: 'none' }; }
  const aside = `${file}.unreadable-${new Date(now).toISOString().replace(/[:.]/g, '-')}`;
  // the instant it starts again = the FIRST waiting reading's own (what they state is the freshest the account knows), else now
  const owedAts = (_owed.get(k) || []).map((a) => Number(a && a.measuredAt) || Number(a && a.obj && a.obj.fetchedAt) || 0).filter((x) => x > 0);
  const stub = { startedAgain: { at: owedAts.length ? Math.min(...owedAts) : now, setAside: path.basename(aside), enumerated: false, overage: false, spendControl: false, resetCredits: false }, ...(backend ? { backend: String(backend) } : {}) };
  // the new file is made FIRST (beside), then the old one moved aside, then the new one put in place: never a moment with no file
  // but the last rename's (a failure there puts the old one back)
  // B-574d «usage-readings» (主开发 r5075 (B)): a person's own act, rare — DURABLE. The stub that starts again is made beside the file
  // through THE DEVICE's OWN DOOR (src/agentd/durable-file.js writeDurable — this module is a device bundle input, so never the hub's
  // src/fd-close.js): its own temp written, synced ONCE, closed, then renamed to its beside name. The door's record law, as taken: a
  // refused sync is said once and the stub still lands; a failed write, close or rename leaves no temp and NOTHING is moved.
  try { DFILE.writeDurable({ fs, file: file + '.tmp', data: JSON.stringify(stub), what: `${accountWord(k)}: its reading file that starts again`, log: (l) => { try { console.warn(`[usage-write] ${l}`); } catch { } } }); } catch (e) { return { ok: false, why: `the new file could not be made (${(e && e.code) || (e && e.message) || e}) — nothing was moved` }; }
  try { fs.renameSync(file, aside); } catch (e) { try { fs.unlinkSync(file + '.tmp'); } catch { } return { ok: false, why: `the file could not be set aside (${(e && e.code) || (e && e.message) || e}) — nothing was moved` }; }
  try { fs.renameSync(file + '.tmp', file); } catch (e) {
    const code = (e && e.code) || (e && e.message) || e;
    try { fs.renameSync(aside, file); } catch (e2) {
      // r3285 (4): BOTH failed — no file is there now: the account stays HELD (never «no reading» as for a new account) until a
      // reading starts the file again, marked «started again» from the copy kept aside
      _missingHeld.set(k, path.basename(aside)); markUnread(k, 'missing after a failed set-aside');
      return { ok: false, why: `the new file could not be put in place (${code}), and the old one could not be put back (${(e2 && e2.code) || (e2 && e2.message) || e2}): no file is there now — the account stays held until a reading starts the file again (the old bytes are kept beside it)` };
    }
    return { ok: false, why: `the new file could not be put in place (${code}) — the old one was put back` };
  }
  noteWritten(file, JSON.stringify(stub));   // r3285 (lens 1): the folder's kept reply learns the new file, as at any write
  try { console.warn(`[usage-write] ${accountWord(k)}: its reading file was set aside by the person's press (kept beside the file) — it starts again, every fact unknown until a reading states it`); } catch { }
  replayOwed(k);
  if (!_owed.has(k)) clearUnread(k);
  return { ok: true, state: 'pass', setAside: path.basename(aside) };
}
/** r3136: { code, at } while the account's reading file did not answer (a reader asks it: unknown, never «no reading»), else null */
function readingUnread(key) { const u = _unread.get(String(key)); return u ? { ...u, owed: (_owed.get(String(key)) || []).length } : null; }

function writeCacheObject({ cacheDir, key, obj, set = null, measuredAt = null, source = null, familyOf = null, backend = null, onRefuse = null, replace = false, overageStated = null, wholeStatement = false, authoritativeScopes = null, absentWindows = null, passiveAnswer = null, stated = null, refused = null, refusalMarks = null }) {
  if (!cacheDir || !key) return { ok: false, why: 'no cacheDir/key' };
  const file = cacheFileFor(cacheDir, key);
  const at = Number(measuredAt) || Number(obj && obj.fetchedAt) || Date.now();
  // THE FILE IS READ FIRST, because the lift below needs it: a legacy snapshot
  // is ONE reading spread over a carry-forward of everything else, and only the
  // file can say which halves are which (carryUnmeasuredLimits).
  // (r5) a REPLACE reads it too, for the stored record's word on itself only (carryStamps below) — never its numbers
  let prevObj = null, storedObj = null;
  const args0 = arguments[0];
  // r3136: the read's three answers — never «nothing stored» for a read that failed
  let stored = readStored(file);
  if (stored.state === 'unreadable') return refuseUnread(key, stored.code, args0, replace);
  let tornKept = null;
  if (stored.state === 'corrupt') {
    const kept = keepTornAside(file, stored.buf);
    tornKept = kept ? kept.name : null;
    if (!kept) return refuseUnread(key, 'torn bytes, not kept aside', args0, replace);
    // r3200: the copy's NAME is never said (it carries the account's own file key — the opaque word is the rule); once per content
    if (kept.fresh) { try { console.warn(`[usage-write] ${accountWord(key)}: its reading file did not parse — its bytes are kept aside beside the file; this reading starts the file again`); } catch { } }
    stored = { state: 'missing' };
  }
  // r3285 (4): no file after a press whose renames both failed — this reading starts the file again, «started again» from the copy
  if (stored.state === 'missing' && _missingHeld.has(String(key))) tornKept = _missingHeld.get(String(key));
  // the file answers: a write refused in the episode before is replayed FIRST, in order (a wall it stated is not lost)
  if (!replace && _owed.has(String(key)) && !_replaying.has(String(key))) {
    replayOwed(key);
    stored = readStored(file);
    if (stored.state !== 'data' && stored.state !== 'missing') return refuseUnread(key, stored.code || 'torn bytes', args0, replace);
    if (stored.state === 'data') tornKept = null;   // the replay started the file again (its mark is on it): this write merges over that
  }
  clearUnread(key);
  storedObj = stored.state === 'data' ? (stored.value || null) : null;
  if (!replace) prevObj = storedObj;
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
  let lifted = null;   // the producer's object lifted, before the carry rule (lane account-reset-door r2: lanesMeasured)
  if (!next) {
    next = lifted = liftCacheObject(obj, { identity: key, backend, familyOf, measuredAt: at });
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
  // …or a passive answer, counted as a WITNESS of ITS producer (r4): `{producer, weekSig, fiveHour, absent5h}` from
  // the stream capture. A stated 5h window older than the file's tombstone is a session that never saw the lift: it
  // is kept out (the plan keeps its tombstone at the instant it was first said) and nothing is said.
  let witnesses = prevObj ? prevObj.fiveHourAbsentWitnesses : undefined; // the FILE's (a producer's object may be a SIBLING's spread)
  if (passiveAnswer && typeof passiveAnswer === 'object' && !replace) {
    const absentAt = quotaModel.absentSince(quotaModel.planLimit(prevSet), '5h') || 0;
    const c = quotaModel.countPassiveAnswer({ witnesses, producer: passiveAnswer.producer || null, sig: typeof passiveAnswer.weekSig === 'string' ? passiveAnswer.weekSig : null,
      fiveHour: passiveAnswer.fiveHour || null, absent5h: !!passiveAnswer.absent5h, absentAt, now: at });
    witnesses = c.witnesses;
    if (c.lay) next = markPlanAbsent(next, ['5h'], at);
    if (c.stale) next = markPlanAbsent(next, ['5h'], absentAt);
  } else if ((() => {
    // a NON-passive producer that MEASURED a 5h window (its claim is not the file's — a panel, an OAuth reply, a
    // banner) is a new answer with the window in it: every producer's count ends
    const w = quotaModel.windowOfKind(quotaModel.planLimit(next), '5h');
    if (!w) return false;
    const pw = quotaModel.windowOfKind(quotaModel.planLimit(prevSet), '5h');
    return !pw || quotaModel.windowClaimKey(pw) !== quotaModel.windowClaimKey(w);
  })()) witnesses = Object.fromEntries(Object.entries(quotaModel.liveWitnesses(witnesses, at)).map(([k, e]) => [k, { ...e, n: 0 }]));
  const vNext = quotaModel.validateLimitSet(next);
  if (!vNext.ok) {
    const why = `refusing to write ${key}: the producer's limit set is malformed`;
    try { console.error('[usage-write]', why, vNext.errors.join('; ')); } catch { }
    try { onRefuse && onRefuse(why, vNext.errors); } catch { }
    return { ok: false, why, errors: vNext.errors };
  }
  // THE RAW PAIR (lane account-reset-door): the stored reading vs THE LANES THIS WRITE MEASURED. r3: A PRODUCER NAMES THEM —
  // `stated` = every lane it stated in this write, at whatever number (lane keys, or its OWN reading — a panel's parse, an
  // OAuth answer — never a spread of the file: a sibling's bucket it carried is not this account's reading), `refused` = the
  // lanes the vendor REFUSED (a wall, a banner, a rejected rate_limit_event, the stream wall): the contradiction of a claim
  // on them at once, whatever the merge keeps, and the record's own mark (`refusedAt`, below). A producer that names none
  // keeps round 2's inference (quotaModel.lanesMeasured: a moved window, every cap an enumerating panel listed, a typed
  // set's windows). Each lane no later than a bucket's own stamp. A claim is settled by them (`onLanesRead`) and a reset is
  // seen in them against the stored reading — never in the merged object, never in a refusal.
  let measuredLanes = [], seenResets = [];
  const refusedKeys = (Array.isArray(refused) ? refused : []).filter((l) => quotaModel.isLaneKey(l));
  // `refusalMarks` (r5): lanes whose number in this write is a REFUSAL's but which the producer does not state — a guessed
  // lane (the capture's and the banner's guessed 5h): the window is stamped a refusal (`refusedAt`), the claim store is told
  // nothing (a guess is not this account's statement)
  const markKeys = (Array.isArray(refusalMarks) ? refusalMarks : []).filter((l) => quotaModel.isLaneKey(l));
  if (!replace) {   // (a reading of another harness names no plan:/model: lane — lanesOfReading — so it measures none)
    try {
      if (stated || refusedKeys.length) measuredLanes = statedLanesNow({ stated, refusedKeys, lifted: lifted || set, own: set ? null : obj, at });
      else measuredLanes = quotaModel.lanesMeasured({ carried: next, lifted, own: set ? null : obj, at, enumerated: Array.isArray(authoritativeScopes) && authoritativeScopes.includes('model') });
    } catch { measuredLanes = []; }
    if (prevObj) { try { seenResets = quotaModel.resetsSeenLanes(quotaModel.lanesOfReading(prevObj), measuredLanes.filter((x) => !x.refused), Date.now()); } catch { seenResets = []; } }
  }
  const base = replace ? prevSet : retireUnnamedScopes(prevSet, next, authoritativeScopes, { key, source: source || (obj && obj.source) || null });
  let merged = quotaModel.mergeLimitSets(base, next);
  // THE RECORD'S WORD ON ITSELF (r5): a window rebuilt from a legacy view keeps the stamps of the same number; then every
  // lane this write stated or measured (and every refusal mark) at 100 % or more is stamped `statedAt`, every refused one
  // `refusedAt` (≥ it) — a refusal and a reading told apart by these, never by a status or a source (quota-model)
  if (storedObj) merged = quotaModel.carryStamps(storedObj, merged);
  const statedKeys = [...new Set([...measuredLanes.map((x) => x.lane), ...refusedKeys, ...markKeys])];
  if (statedKeys.length) merged = quotaModel.markStated(merged, statedKeys, at);
  if (refusedKeys.length || markKeys.length) merged = quotaModel.markRefused(merged, [...new Set([...refusedKeys, ...markKeys])], at);   // the record's own mark (r3, MUST 2)
  // B-37bc (a): a claude file's buckets carry each window's own instant (`stamps`), so a direct writer that spreads an
  // unrendered bucket forward (the shipped statusline) keeps when it was read — the one order reads it back on both sides
  // — the harness's own declared row says whose file this is (backend-caps `oauthUsage`: Claude's typed limits; no harness named
  // reads the legacy harness's row, as the lift reads it), never an id spelled here
  const view = quotaModel.toLegacyView(merged, { stamps: !!require('./backend-caps.js').capsOf(backend || backendOfCacheObject(obj)).oauthUsage });
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
  // the passive witnesses are a raw field of the FILE (a producer's object may be a SIBLING's spread): computed from
  // the file's own above, never taken from `obj`
  const liveW = witnesses && typeof witnesses === 'object' ? quotaModel.liveWitnesses(witnesses, at) : {};
  if (Object.keys(liveW).length) out.fiveHourAbsentWitnesses = liveW; else delete out.fiveHourAbsentWitnesses;
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
  // r3136 (主开发 r3146 (2)): AFTER TORN BYTES THE FILE IS NOT A WHOLE READING. The first reading starts it again and the facts
  // it did not state are LOST, not «absent»: `startedAgain` says so — the instant, the copy, and what has been STATED since (a
  // lane a reading measured is stated by its own age; an ENUMERATING reading — the panel's, the approved automatic read's —
  // states every plan window and cap, the absent ones included; overage, spend control and reset credits by a reading that
  // carries them). Kept on every write until all are stated; a consumer reads each fact not yet stated as UNKNOWN for its
  // own decision only (restartUnknowns). Never on a REPLACE (the repair names what survives).
  if (!replace) {
    const was = tornKept ? { at, setAside: tornKept, enumerated: false, overage: false, spendControl: false, resetCredits: false }   // `at` = this reading's own instant: what it states is stated
      : (prevObj && prevObj.startedAgain && typeof prevObj.startedAgain === 'object' ? prevObj.startedAgain : null);
    if (was) {
      const sa = { ...was };
      // an ENUMERATING reading (the producer's own parse enumerated its caps — the panel, the approved automatic read): it states
      // every cap, an empty list meaning «no cap» FOR THIS MARK ONLY (it retires nothing: the retire rule above is unchanged)
      if ((Array.isArray(authoritativeScopes) && authoritativeScopes.length) || quotaModel.scopedEnumeration(obj) || quotaModel.scopedEnumeration(stated) || wholeStatement === true) sa.enumerated = true;   // r3285 (2): + a producer's own whole statement (the codex live read's reply, the usage door's whole panel)   // `stated` = the enumerating producer's own parse (its flag is not spread)
      // r3200 (the round's shoulds): a producer whose object spreads another file (the stream capture: the identity's freshest
      // sibling) says whether ITS OWN event stated overage (`overageStated`) — never a sibling's older copy; spend control is
      // stated by true or false only (a codex reading sends null when the vendor said nothing); reset credits by their own record
      // (a TYPED producer states these in its own set, never at the object's top: codex's spend control in its plan limit's flag,
      // claude's overage as its `overage` limit's flags — either is this write's own)
      const ownSet = set || lifted;
      const flagStated = (f) => !!(ownSet && Array.isArray(ownSet.limits) && ownSet.limits.some((l) => l && l.flags && typeof l.flags[f] === 'boolean'));
      const overSet = !!(set && Array.isArray(set.limits) && set.limits.some((l) => l && l.scope === 'overage' && l.flags && Object.keys(l.flags).length));
      if (((obj && obj.overage && typeof obj.overage === 'object') || overSet) && overageStated !== false) sa.overage = true;
      if ((obj && typeof obj.spendControlReached === 'boolean') || flagStated('spendControl')) sa.spendControl = true;
      if (obj && obj.resetCredits && typeof obj.resetCredits === 'object') sa.resetCredits = true;
      if (restartUnknowns({ ...out, startedAgain: sa }).length) out.startedAgain = sa; else delete out.startedAgain;
    } else delete out.startedAgain;
  }
  // `fetchedAt` IS NEVER INVENTED HERE. It means "this file was promoted to
  // freshest at t", the producers own that decision (the sibling fan-out
  // deliberately withholds it), and the repair writes an identity-only remnant
  // whose entire point is that NOTHING on it claims to be a reading.
  // …AND IT NEVER MOVES BACKWARDS (B-37bc's follow, r639): a late record (an event measured before what the file already
  // states) promotes nothing — the file keeps its own clocks (`fetchedAt` with the producer it names, `scopedFetchedAt`),
  // by the one rule (quotaModel.laterInstant); its windows were already judged by their own instants in the merge above.
  // Never on a REPLACE (the repair names what survives).
  if (!replace && prevObj) {
    if (out.fetchedAt !== undefined && quotaModel.laterInstant(prevObj.fetchedAt, out.fetchedAt) !== (Number(out.fetchedAt) > 0 ? Number(out.fetchedAt) : null)) {
      out.fetchedAt = prevObj.fetchedAt;
      if (prevObj.source !== undefined) out.source = prevObj.source;
    }
    if (out.scopedFetchedAt !== undefined && quotaModel.laterInstant(prevObj.scopedFetchedAt, out.scopedFetchedAt) !== (Number(out.scopedFetchedAt) > 0 ? Number(out.scopedFetchedAt) : null)) out.scopedFetchedAt = prevObj.scopedFetchedAt;
  }
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    atomicWrite(file, JSON.stringify(out), { replace });
  } catch (e) {
    return { ok: false, why: 'write failed: ' + e.message };
  }
  if (_missingHeld.delete(String(key))) clearUnread(key);   // r3285 (4): the file is there again («started again»)
  if (!replace) {   // r3285 (2): the producer's item stands for a file that started again, and goes when it is made whole
    const was = !!(storedObj && storedObj.startedAgain), now = !!out.startedAgain;
    if (was !== now) for (const fn of _onStartedAgain) { try { fn(String(key), now ? 'started' : 'whole'); } catch { } }
  }
  // …or the change a DIRECT writer saw and left unsaid (the shipped statusline: `windowChangeUnsaid`) — said here
  // once when the merged set agrees with it, and the marker never outlives this write. A marker belongs to the key
  // that laid it: only the one ON the file being written, stamped with THIS key, is said — never one riding a
  // producer's object (the capture and the banner spread the identity's freshest SIBLING; acceptance r3 MAJOR 1).
  const pm = prevObj && prevObj.windowChangeUnsaid;
  const unsaid = pm && typeof pm === 'object' && pm.key === key ? pm : null;
  const nowPlan = quotaModel.planLimit(merged);
  const unsaidHolds = !!(unsaid && unsaid.kind === '5h' && (unsaid.change === 'removed' ? !!quotaModel.absentSince(nowPlan, '5h') : unsaid.change === 'restored' ? !!quotaModel.windowOfKind(nowPlan, '5h') : false));
  const windowChange = replace ? null : (windowChangeOf(prevObj, prevSet, merged) || (unsaidHolds ? { kind: '5h', change: unsaid.change, at: Number(unsaid.at) || Date.now() } : null));
  if (windowChange && _onWindowChange) { try { _onWindowChange({ key, ...windowChange, source: source || (obj && obj.source) || null }); } catch { } }
  if (!replace && _onReading) { try { _onReading({ key, at }); } catch { } }
  if (!replace) { _comparedOut.set(key, outStamp(out)); if (_comparedOut.size > 2048) _comparedOut.delete(_comparedOut.keys().next().value); }
  if (measuredLanes.length) { noteLanesReadAt(key, measuredLanes); for (const fn of _onLanesRead) { try { fn({ key, cacheDir, lanes: measuredLanes }); } catch { } } }
  sayVendorResets(key, seenResets, cacheDir);
  return { ok: true, file, limits: merged.limits, object: out, ...(windowChange ? { windowChange } : {}) };
}

/** The typed entry: a producer that built a LimitSet hands it here and never
 *  spells the legacy shape at all. `extras` are the non-bucket fields it wants
 *  persisted (identity, planType, …). */
function writeReading({ cacheDir, key, set, extras = null, source = null, familyOf = null, backend = null, onRefuse = null, wholeStatement = false }) {
  const base = { ...(extras && typeof extras === 'object' ? extras : {}) };
  if (set && set.fetchedAt) base.fetchedAt = set.fetchedAt;
  if (source || (set && set.source)) base.source = source || set.source;
  if (set && set.extra) for (const [k, v] of Object.entries(set.extra)) if (base[k] === undefined) base[k] = v;
  return writeCacheObject({ cacheDir, key, obj: base, set, source: source || (set && set.source) || null, familyOf, backend, onRefuse, wholeStatement });
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
  cacheFileFor, isCacheFileName, readCacheObject, readCacheJson, listCacheDir,
  backendOfCacheObject, liftCacheObject, limitsOfCache,
  writeCacheObject, writeReading, writeSidecar,
  readingUnread, readReading, UNREAD_READING, restartUnknowns, onUnreadLifted, onUnreadMarked, setAsideReading, unreadKeys, onStartedAgain, cacheFileName, // r3136: unknown, never «no reading»; after torn bytes, each fact until stated
  carryUnmeasuredLimits, retireUnnamedScopes, markPlanAbsent, windowChangeOf, onWindowChange, PASSIVE_WITNESSES, onReading, onVendorReset, noteVendorResets, noteDirectWrite, onLanesRead, lanesReadAt,
  onWritten, noteWritten,
  DERIVED_KEYS,
};
