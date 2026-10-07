'use strict';
/**
 * CHANNEL CAPABILITIES — THE ONE PLACE THAT ANSWERS "DOES THIS CONTROL EXIST"
 * AND "WHICH LANE IS THIS CONVERSATION ON RIGHT NOW"
 * (docs/design-communication-panel.zh.md §4, §6.4, §12.5).
 *
 * PURE — imports NOTHING. Four consumers read the same records and each reads
 * its own face, but the FOLDING happens here and only here:
 *
 *   panel            freshnessClaim(caps, laneState(...)|scanState(...), entry, now)
 *                    offers(...) for the send control, identityWarning(caps)
 *   ingest engine    laneState(...).pollCadence  — the tick's cadence
 *                    laneState(...).carryContent — content vs cursor kick, i.e.
 *                                                  fence 12's coalescing gate
 *   filter/assign    offers(...) — an assignment that can never send is a lie
 *   spend authorizer NOTHING, deliberately: the receive mode does not change
 *                    the money decision, only the arrival instant.
 *
 * TWO AXES, MODELLED NOT FLATTENED (r3/Q3):
 *
 *   axis 1  HOW MESSAGES ARRIVE — `caps.receive` push | poll | scan, plus the
 *           per-platform `caps.scanSources` / `caps.scanLatency` /
 *           `caps.historyBySource` upper bounds for the scan lane.
 *   axis 2  WHAT MAY BE SENT AND AS WHOM — `caps.sendAs` (a static UPPER
 *           BOUND) narrowed per conversation by the adapter's `convCaps()`.
 *
 * THE LAW BOTH RESOLVERS OBEY: a declaration is an UPPER BOUND and a
 * resolution may only NARROW it. `convCaps.sendAs` must be a subset of
 * `caps.sendAs`; `scanState().source` may never be wider than
 * `caps.scanSources[platform]` (store > ui > null). Otherwise "we have never
 * verified sending on this platform" could be undone by one optimistic
 * runtime answer.
 *
 * WHY `laneState` EXISTS AT ALL (r4): "which lane is carrying this
 * conversation, is it alive, may it carry content" is ONE fact that lives in
 * THREE stores — a static declaration (`caps`), a per-DEPLOYMENT claim on the
 * adapter record (`push.claimedExclusive`, measured by `push.missRate`,
 * withdrawn by `push.demotedAt`) and a per-conversation observation
 * (`entry.lane`). All three storage sites stay — a claim, a measurement and an
 * observation are different facts — but there is exactly ONE answer, and its
 * precedence is written down:
 *
 *     DEMOTED  >  LIVE  >  CLAIM,   and `unknown` never carries content.
 *
 * Before that rule the product could demote a lane on the adapter row and keep
 * carrying content through it, and the freshness chip drew `live` off a static
 * declaration — the `opencode-events` round-4 lesson ("a lane that lies about
 * `active` is worse than no lane, because it switches the fallback OFF").
 *
 * `scanState` is that same law on the other lane (r5/r6), with ONE deliberate
 * exception that keeps it from becoming the thing it guards against: A REFUSED
 * READ DOES NOT SILENTLY FALL BACK TO `'ui'`. `tcc-denied` is a NAMED answer
 * with `source: null`; falling back would swap a 15-second lane for a
 * 5-minute one behind the user's back, and the latency number on the
 * conversation row is this whole class's honesty contract.
 */

/** `convCaps` is a CACHE, not a stored fact (design §5 invariant 7): it is the
 *  result of a vendor round trip, so it cannot be re-derived locally. It pays
 *  for its exemption with a TTL and an honest degrade, never with a pass. */
const CONV_CAPS_TTL_MS = 6 * 60 * 60 * 1000;

/** The same price for `scan.hostFacts` (r6): platform, client presence, store
 *  path and read grant are a (possibly cross-machine) round trip too, and a
 *  frozen answer keeps drawing "15 s" over a lane that fails every pass. */
const HOST_FACTS_TTL_MS = 6 * 60 * 60 * 1000;

/** Liveness needs POSITIVE evidence: connected AND something heard inside this
 *  window. OURS, not a vendor constant — no push transport has been run in
 *  this tenant yet (design §21), so P1 measures it and this is the bound we
 *  are willing to be wrong in the SAFE direction on (too short = we fall back
 *  to polling, which is the behaviour a lane with no claim gets anyway). */
const PUSH_HEARTBEAT_MS = 90 * 1000;

/** Ordering of scan sources, widest first. A resolution may move DOWN this
 *  list and never up. */
const SCAN_SOURCE_ORDER = ['store', 'ui'];

/** §6.4's EXCLUSIVITY MEASUREMENT (`push.missRate`). Exclusivity is ASSERTED
 *  by the operator (`push.claimedExclusive`), MEASURED here and WITHDRAWN by
 *  the engine: while the lane CARRIES CONTENT, every record first seen by the
 *  reconciliation POLL rather than by push is a record push missed, and a
 *  genuinely exclusive lane misses none. Crossing PUSH_MISS_THRESHOLD over at
 *  least PUSH_MISS_MIN_SAMPLES demotes the lane to kick mode. The window is
 *  ROLLING — the last PUSH_MISS_MIN_KEEP records or the last 24 h, whichever
 *  is LARGER (r4): in kick mode push carries nothing, so a lifetime ratio
 *  tends to 1.0 by construction and would pin a demoted lane above the line
 *  for ever; and ticks where `laneState().carryContent` is false contribute
 *  NO samples at all (the engine's rule — this module only does arithmetic).
 *  A demotion is never retracted by these numbers: only the party that made
 *  the claim re-declares it (the adapter row's "re-declare to retry"). */
const PUSH_MISS_THRESHOLD = 0.02;
const PUSH_MISS_MIN_SAMPLES = 20;
const PUSH_MISS_WINDOW_MS = 24 * 60 * 60 * 1000;
const PUSH_MISS_MIN_KEEP = 200;
/** A memory bound on the batches kept, never a measurement rule. */
const PUSH_MISS_MAX_BATCHES = 2000;
/** The three values `push.claimedExclusive` may hold; `unknown` (declare
 *  nothing) is the conservative default — a cursor kick, never content. */
const PUSH_CLAIMS = Object.freeze(['exclusive', 'shared', 'unknown']);

/** The batches inside the rolling window at `now`: everything newer than
 *  24 h, extended BACKWARDS until PUSH_MISS_MIN_KEEP records are covered. */
function pushWindow(samples, now) {
  const list = (Array.isArray(samples) ? samples : []).filter((s) => s && num(s.at) !== null && Number(s.n) > 0).slice();
  list.sort((a, b) => Number(a.at) - Number(b.at));
  const from = Number(now) - PUSH_MISS_WINDOW_MS;
  let i = list.length, covered = 0;
  while (i > 0 && (Number(list[i - 1].at) >= from || covered < PUSH_MISS_MIN_KEEP)) { i--; covered += Number(list[i].n); }
  return list.slice(i);
}
/** Add ONE batch `{at, n, p}` (`n` judgeable records, `p` of them first seen
 *  by the poll) and trim to the window. Pure: returns a new array. */
function pushSamplesAdd(samples, { at, n, p } = {}) {
  const nn = Math.max(0, Math.round(Number(n) || 0));
  const pp = Math.min(nn, Math.max(0, Math.round(Number(p) || 0)));
  const list = (Array.isArray(samples) ? samples : []).slice();
  if (!nn) return list;
  list.push({ at: Number(at) || 0, n: nn, p: pp });
  const kept = pushWindow(list, Number(at) || 0);
  return kept.length > PUSH_MISS_MAX_BATCHES ? kept.slice(kept.length - PUSH_MISS_MAX_BATCHES) : kept;
}
/** `{rate, total, missed, enough, batches}` over the window at `now`. */
function pushMissRate(samples, now) {
  const w = pushWindow(samples, now);
  let total = 0, missed = 0;
  for (const s of w) { total += Number(s.n); missed += Number(s.p); }
  return { rate: total ? missed / total : 0, total, missed, enough: total >= PUSH_MISS_MIN_SAMPLES, batches: w.length };
}
/** Should the engine demote NOW. Never true for a lane already demoted (the
 *  counters are not the trigger that clears one either). */
function pushDemotionVerdict(push, now) {
  const p = push || {};
  const m = pushMissRate(p.samples, now);
  return { demote: !p.demotedAt && m.enough && m.rate > PUSH_MISS_THRESHOLD, ...m, threshold: PUSH_MISS_THRESHOLD, minSamples: PUSH_MISS_MIN_SAMPLES };
}

/** THE ADAPTER ROW'S PUSH SENTENCE — structure in (`adapterView().push` +
 *  the resolved lane), words out, `t()` injected because the digest is
 *  broadcast to every client while the language is per device. Says the
 *  lane's STATE and, when demoted, the REASON with its numbers. */
function pushLaneText(push, lane, { t = defaultT, now = null, coldSeconds = COLD_MAX_SEC } = {}) {
  const p = push || {};
  const l = lane || {};
  const pct = (r) => (Math.round(Number(r) * 1000) / 10).toString();
  if (p.enabled === false) return p.optIn ? t('push off (available — turn it on under Push…)') : t('push off');
  if (p.demotedAt) {
    const d = p.demoted || {};
    return t('push is not exclusive here — fell back to cursor kicks, polling returned to the fast cadence ({missed} of {total} records, {pct}%, were first seen by the reconciliation poll)', { missed: d.missed || 0, total: d.total || 0, pct: pct(d.rate || 0) });
  }
  if (p.state === 'unavailable') {
    // THE REMEDY BY CODE (2026-09-26): the lane's own `why` is an English
    // sentence for the log; the card says what to DO in the device's words.
    // A code this table does not know falls back to the lane's words.
    const text = pushUnavailableText(p.lastStateCode, { t, words: p.unavailableWords });
    return text || t('push unavailable: {why}', { why: p.lastStateWhy || t('unknown') });
  }
  if (!p.state) return t('push not started');
  if (l.via === 'push' && l.live && l.carryContent) return t('push live — carrying messages (declared exclusive); polling reconciles every {age} as a safety net', { age: humanAge(coldSeconds) });
  if (l.via === 'push' && l.live) return p.claimedExclusive === 'shared' ? t('push live — cursor kicks only (declared shared)') : t('push live — cursor kicks only (exclusivity not declared)');
  // Connected but silent past the heartbeat window: the resolver reads it as
  // dead (positive evidence only) and polling is back at the fast cadence.
  if (p.state === 'live' && l.why === 'push-dead') {
    const age = num(p.lastEventAt) !== null && num(now) !== null ? humanAge(ageS(p.lastEventAt, Number(now))) : '';
    return age ? t('push silent for {age} — polling at the fast cadence until it speaks', { age }) : t('push silent — polling at the fast cadence until it speaks');
  }
  return t('push {state} — polling at the fast cadence', { state: p.state });
}

/** A push lane parked `unavailable`, in words, BY ITS CODE — the words are the
 *  LANE'S OWN DECLARATION (lane dc-channels-blocks: each live lane declares
 *  `UNAVAILABLE_WORDS` {code → i18n key} beside the codes it parks with, its
 *  adapter module exports them as `unavailableWords`, the account view carries
 *  them while the lane is unavailable). '' for a code nobody declared. */
function pushUnavailableText(code, { t = defaultT, words = null } = {}) {
  const k = words && typeof words === 'object' && Object.prototype.hasOwnProperty.call(words, String(code || '')) ? words[String(code || '')] : null;
  return typeof k === 'string' && k ? t(k) : '';
}

/** A number, or `null` for ANYTHING that is not one. `Number(null)` is 0 and
 *  `Number('')` is 0, so a bare `Number.isFinite(Number(v))` turns "we were
 *  never told" into the epoch — which then renders as an age of 56 years and,
 *  worse, as a `measuredAt` a TTL can compare against. Absence is not zero. */
const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v));
const ageS = (then, now) => (num(then) === null ? null : Math.max(0, Math.round((now - Number(then)) / 1000)));

/** The `t()` this module falls back to when no translator is injected: the
 *  English key WITH its params substituted, exactly as src/lib/i18n.js does
 *  for a missing translation. A default that dropped the params would ship
 *  `within {age}` to anyone who called the resolver without a translator —
 *  including every node-side consumer and this module's own suite. */
const defaultT = (s, params) => (params ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : String(s));

/**
 * WHICH LANE IS CARRYING THIS CONVERSATION RIGHT NOW.
 *
 *   caps          the adapter's static declaration
 *   adapterRecord data/channels/adapters.json row — { push: { enabled,
 *                 claimedExclusive, state, lastEventAt, demotedAt, demotedWhy } }
 *   entry         the per-conversation index entry (its `lane` half)
 *   now           epoch ms — passed, never read from a clock in here
 *
 * -> { via, carryContent, live, pollCadence, why }
 *
 * `via` is the lane ACTUALLY carrying records, never the declared one: a
 * demoted or dead push lane answers `via:'poll'`, because that is where the
 * records come from and the chip must draw what is true.
 */
function laneState(caps, adapterRecord, entry, now, { feed = null } = {}) {
  const c = caps || {};
  const l = baseLane(c, adapterRecord, now);
  // lane lark-search-poll (§2.8): a live EXCLUSIVE push lane wins (`reconcile`); else a CARRYING change feed — fresh,
  // measured complete — answers the poll lane at the relaxed cadence (`pollCadence:'feed'`); else today's answer.
  // Positive evidence only: a feed that is behind, backing off, measuring or demoted carries nothing.
  if (l.via === 'scan' || l.pollCadence === 'reconcile') return l;
  const fo = feed && typeof feed === 'object' ? feed : {};
  const fs = feedState(c, adapterRecord, now, fo);
  // lane channel-feed-authority (OWNER'S LAW 2026-10-06: fetch the updates, never ask each conversation): an AUTHORITATIVE
  // feed (Gmail's history.list — the vendor's own sync primitive) carrying ⇒ `feed-only`: no per-row timer at all
  if (fs.carrying) return { via: 'poll', carryContent: false, live: false, pollCadence: feedAuthoritative(c) ? 'feed-only' : 'feed', why: 'feed', feedSeconds: feedBoundSec(fo) };
  return l;
}
function baseLane(c, adapterRecord, now) {
  const push = (adapterRecord && adapterRecord.push) || {};
  const receive = c.receive === 'push' || c.receive === 'scan' ? c.receive : 'poll';

  if (receive === 'scan') {
    // A scan pass IS a batch, exactly like a poll pass (r6) — so it never
    // carries content through fence 12's coalescing window, and opening that
    // window here would buy 60 s of latency for nothing.
    return { via: 'scan', carryContent: false, live: false, pollCadence: 'fast', why: 'scan' };
  }
  // An OPT-IN push lane (`caps.pushOptIn`, Gmail's Pub/Sub pull — decision 20:
  // available but off by default) is the poll lane until the record says
  // `push.enabled === true`; every other push lane is on unless switched off.
  if (receive !== 'push' || push.enabled === false || (c.pushOptIn && push.enabled !== true)) {
    return { via: 'poll', carryContent: false, live: false, pollCadence: 'fast', why: 'poll' };
  }

  // 1. DEMOTED — the product withdrew its own claim. Only the party that MADE
  //    the claim may take the demotion back (a re-declaration in the connect
  //    wizard); the counter must never do it, because the evidence that would
  //    clear it is exactly what a kick-mode lane cannot produce.
  if (push.demotedAt) return { via: 'poll', carryContent: false, live: false, pollCadence: 'fast', why: 'demoted' };

  // 2. LIVE — positive evidence only: the socket says live AND we heard
  //    something inside the heartbeat window.
  const live = push.state === 'live' && num(push.lastEventAt) !== null && now - Number(push.lastEventAt) <= PUSH_HEARTBEAT_MS;
  if (!live) return { via: 'poll', carryContent: false, live: false, pollCadence: 'fast', why: 'push-dead' };

  // 3. CLAIM — and `unknown` (the DEFAULT: declare nothing and you get the
  //    conservative behaviour) is a cursor kick, never content.
  if (push.claimedExclusive === 'exclusive') return { via: 'push', carryContent: true, live: true, pollCadence: 'reconcile', why: 'exclusive' };
  if (push.claimedExclusive === 'shared') return { via: 'push', carryContent: false, live: true, pollCadence: 'fast', why: 'kick-shared' };
  return { via: 'push', carryContent: false, live: true, pollCadence: 'fast', why: 'kick-unknown' };
}

/**
 * WHICH SOURCE IS THIS SCAN LANE READING — the same law on the other lane.
 *
 *   hostFacts  the adapter record's `scan.hostFacts` — { platform,
 *              clientInstalled, storePath, grant, why, at }, the answer a
 *              `channels-scan-store` round trip gave for ONE machine
 *
 * Precedence: FACTS FRESH > PLATFORM DECLARATION > CLIENT PRESENT > READ GRANT
 * > `'ui'` — freshness first because every level below it reads `hostFacts`,
 * and a stale record makes all four answer what the machine looked like THEN.
 */
function scanState(caps, adapterRecord, hostFacts, now) {
  const c = caps || {};
  const dead = (why) => ({ via: 'scan', source: null, history: null, carryContent: false, why, latencySeconds: null, storePath: null, grant: (hostFacts && hostFacts.grant) || null, hostFactsAgeSeconds: ageS(hostFacts && hostFacts.at, now) });
  if (c.receive !== 'scan') return dead('no-source');

  // 1. FRESHNESS. No facts at all, or older than the TTL, is not an answer
  //    about this machine — it is an answer about a machine at some past time.
  const at = num(hostFacts && hostFacts.at);
  if (!hostFacts || at === null || now - at > HOST_FACTS_TTL_MS) return dead('host-facts-stale');

  // 2. PLATFORM DECLARATION — the upper bound. A platform the adapter never
  //    declared has no lane at all.
  const declared = (c.scanSources && c.scanSources[hostFacts.platform]) || null;
  if (!SCAN_SOURCE_ORDER.includes(declared)) return dead('no-source');

  // 3. CLIENT PRESENT. "Not installed" is a NAMED refusal, never an empty
  //    scan — an empty result is byte-identical to "we are not looking"
  //    (fence 8).
  if (!hostFacts.clientInstalled) return dead('client-not-installed');

  // 4. THE USER'S OWN CHOICE, but only as a NARROWING: picking `'ui'` where
  //    `'store'` is declared is a choice the wizard offers; picking `'store'`
  //    where only `'ui'` is declared is the widening this law forbids.
  const chosen = (adapterRecord && adapterRecord.scan && adapterRecord.scan.chosenSource) || null;
  if (chosen === 'ui' && declared === 'store') return resolved(c, 'ui', 'user-chose-ui', hostFacts, now);

  if (declared === 'ui') {
    // The adapter's own scanHost() says WHY there is no store here; a library
    // the vendor encrypted and a platform with no desktop client are
    // different facts and the wizard renders different steps for them.
    return resolved(c, 'ui', hostFacts.why === 'store-encrypted' ? 'store-encrypted' : 'no-store-on-platform', hostFacts, now);
  }

  // 5. READ GRANT. `granted` is NEVER trusted across a pass — the op's own
  //    EPERM is the authority and a revoked grant re-files as `tcc-denied` —
  //    but within this resolution it is what decides.
  if (hostFacts.grant === 'granted') return resolved(c, 'store', 'store', hostFacts, now);
  return dead('tcc-denied');
}

function resolved(caps, source, why, hostFacts, now) {
  return {
    via: 'scan',
    source,
    history: (caps.historyBySource && caps.historyBySource[source]) || null,
    carryContent: false,
    why,
    latencySeconds: (caps.scanLatency && num(caps.scanLatency[source])) ?? null,
    storePath: source === 'store' ? (hostFacts.storePath || null) : null,
    grant: hostFacts.grant || null,
    hostFactsAgeSeconds: ageS(hostFacts.at, now),
  };
}

/**
 * IS THIS ADAPTER AUTHENTICATED RIGHT NOW — resolved, never asserted (r2).
 *
 * The digest used to publish `state: rec.auth && rec.auth.expiresAt ?
 * 'connected' : 'connected'` — a ternary whose two branches are the same
 * string, so an expired or never-authenticated adapter was announced to the
 * panel as connected. That is a claim the product cannot check, shipped on the
 * one surface that is supposed to say whether a lane can serve.
 *
 * The answer comes from the TWO facts the adapter record already holds, in the
 * order of how much they prove:
 *
 *   1. THE LAST PASS'S OWN VERDICT. `lastPass.code === 'auth-expired'` is the
 *      vendor refusing us — measured, not projected. It outranks a token whose
 *      stamped expiry has not arrived yet (a revoked or rotated credential
 *      carries a perfectly future `expiresAt`, exactly like a wiped claude
 *      login does — src/login-state.js's whole reason for existing).
 *   2. THE STAMPED EXPIRY, which is a claim about the future and is only ever
 *      believed once it has PASSED.
 *
 * With no credential at all the answer is `'unknown'`, never `'connected'`:
 * the P0a fake adapters authenticate against nothing, and saying so is the
 * point. `now` is a parameter, like every other resolver here.
 */
function authState(adapterRecord, now, { lastPass = undefined, adapterState = null } = {}) {
  const a = (adapterRecord && adapterRecord.auth) || {};
  const lp = lastPass === undefined ? (adapterRecord && adapterRecord.lastPass) || null : lastPass;
  const expiresAt = num(a.expiresAt);
  // The adapter's OWN answer, when the engine has one (design §14.3): an
  // application credential that was withdrawn — the cluster env removed, the
  // user's keys cleared — makes the adapter `needs-credentials` however fresh
  // its token record looks, because a Lark tenant token is re-minted from the
  // app secret on every call and a Google refresh needs the client secret.
  // It is asked FIRST: nothing below can be true of an adapter that cannot
  // build a request at all.
  if (adapterState && adapterState.state === 'needs-credentials') {
    // `why` is the store's English sentence (the contract); `whyCode` +
    // `whyParams` are the same fact as STRUCTURE for the client to word —
    // an adapter that resolves its own credential (the fake fixtures) has no
    // `credential` facts on its digest row, so this is the only path (a3 i18n).
    return { state: 'needs-credentials', why: adapterState.why || 'no-credentials', whyCode: adapterState.whyCode || null, whyParams: adapterState.whyParams || null, expiresAt: null, missing: Array.isArray(adapterState.missing) ? adapterState.missing.slice() : [] };
  }
  // The adapter's own `needs-reauth` (P1: a refresh token past its lifetime,
  // or a refresh the vendor answered `invalid_grant`) is a REFUSAL, so it is
  // honoured like `needs-credentials`; its own `connected` is NOT — a stub can
  // say that, only the record's evidence can (the r2 rule below).
  if (adapterState && adapterState.state === 'needs-reauth') {
    const at = num(adapterState.expiresAt);
    return { state: 'expired', why: adapterState.why || 'needs-reauth', expiresAt: at === null ? expiresAt : at };
  }
  if (lp && lp.ok === false && lp.code === 'auth-expired') return { state: 'expired', why: 'last-pass-refused', expiresAt };
  if (expiresAt !== null && expiresAt <= now) return { state: 'expired', why: 'token-expired', expiresAt };
  const hasCredential = !!(a.tokenEnc || expiresAt !== null || (Array.isArray(a.scopes) && a.scopes.length));
  if (!hasCredential) return { state: 'unknown', why: 'never-authenticated', expiresAt: null };
  return { state: 'connected', why: null, expiresAt };
}

/** WHY A SEND ROW COULD NOT BE RESOLVED — a closed set (lane gmail-reply-known, 2026-10-05: an old listed Gmail
 *  thread had no reply box because ONE metadata read was rate-limited, and the open's re-ask swallowed the refusal,
 *  so the foot said "not known yet" for ever). The engine writes `{read:'unknown', sendAs:[], why, at, retryAt}`
 *  with one of these when the conversation's lookup was refused: the ChannelError codes the adapters throw, plus
 *  the engine's own `backoff` (the account's vendor back-off; the owner's Retry is exempt) and `not-connected`. */
const CONV_CAPS_FAIL_WHYS = Object.freeze(['rate-limited', 'backoff', 'not-connected', 'vendor-error', 'auth-expired']);

/**
 * THE per-conversation capability cache, resolved against its own age
 * (design §4, r4). Past the TTL it degrades to `unknown` — which `offers()`
 * already renders as "not offered + a reason", so the degrade needs no new
 * vocabulary. Without this a week-old `sendAs:['user']` (cached before the
 * user left that group) still draws the composer and still lets an assignment
 * be built, which manufactures exactly the proposal that can never be sent.
 */
function convCapsState(cached, now, ttlMs = CONV_CAPS_TTL_MS) {
  const e = cached && typeof cached === 'object' ? cached : null;
  const at = num(e && e.at);
  if (!e || at === null || now - at > ttlMs) return { read: 'unknown', sendAs: [], why: e ? 'stale' : 'unknown', at: at, ageSeconds: ageS(at, now), threads: null, reactions: null };
  const read = ['yes', 'no', 'unknown'].includes(e.read) ? e.read : 'unknown';
  // lane channel-threads (spec §2.5): the two NARROWING rows the adapter resolved for this conversation —
  // `null` when the cache predates them (a control whose row is unknown is not offered, the r4 rule)
  const threads = e.threads && typeof e.threads === 'object' ? { replyInto: e.threads.replyInto === true, mode: e.threads.mode || null, why: e.threads.why || null } : null;
  const reactions = e.reactions && typeof e.reactions === 'object' ? { read: e.reactions.read === true, add: e.reactions.add === true, why: e.reactions.why || null } : null;
  // lane lark-upload-preflight: the FILES row (an account whose sign-in cannot upload) — `null` = the adapter does not narrow files
  const files = e.files && typeof e.files === 'object' ? { send: e.files.send === true, why: e.files.why || null, requiredScopes: Array.isArray(e.files.requiredScopes) ? e.files.requiredScopes.slice(0, 8).map(String) : [] } : null;
  const failed = read === 'unknown' && CONV_CAPS_FAIL_WHYS.includes(e.why) ? { retryAt: num(e.retryAt) } : {};   // when the engine asks again by itself (null: an owner step is needed)
  return { read, sendAs: Array.isArray(e.sendAs) ? e.sendAs.slice() : [], why: e.why || null, at, ageSeconds: ageS(at, now), threads, reactions, ...(files ? { files } : {}), ...failed };
}

/** The reasons a control is not offered, in the order they are checked.
 *  lane channel-threads: `thread-reply` (reply INTO a thread), `react` /
 *  `unreact` (the account's user adds / removes its own reaction),
 *  `read-reactions` (the chips have a source). */
const OFFER_WHAT = ['send-as-user', 'send-as-bot', 'fetch-attachment', 'read', 'thread-reply', 'react', 'unreact', 'read-reactions', 'send-attachment'];
/** A capability row an adapter did not declare reads as none (fail closed — spec §6.5). */
const threadsRow = (c) => (c && c.threads && typeof c.threads === 'object' ? c.threads : { read: 'none', replyInto: false, listing: 'none' });
const reactionsRow = (c) => (c && c.reactions && typeof c.reactions === 'object' ? c.reactions : { read: 'none', add: false, remove: 'none', vocabulary: 'names', custom: 'none', perMessageMax: null });

/**
 * DOES THIS CONTROL EXIST — the only question the composer, the approval card
 * and the assignment editor ask. BOTH the static declaration and the
 * per-conversation resolution must allow it; `unknown` is `offered:false` with
 * a reason, NEVER "allowed".
 */
function offers(caps, convCaps, what, now = Date.now()) {
  const c = caps || {};
  const resolved = convCapsState(convCaps, now);
  if (!OFFER_WHAT.includes(what)) return { offered: false, why: 'unknown-capability' };

  if (what === 'read') {
    if (resolved.read === 'yes') return { offered: true, why: null };
    return { offered: false, why: resolved.why || (resolved.read === 'no' ? 'not-a-member' : 'unknown') };
  }
  // lane lark-upload-preflight (userW inc-muxsy69b-mjg1): SENDING a file — the declared `sendAttachments` row AND the
  // resolved files row (the HELD scopes: Lark needs an upload scope beside the send pair); a refusal names the scopes
  if (what === 'send-attachment') {
    if (!c.sendAttachments) return { offered: false, why: 'attachments-not-offered' };
    if (resolved.read !== 'yes') return { offered: false, why: resolved.why || 'unknown' };
    const f = resolved.files || null;
    if (f && f.send !== true) return { offered: false, why: f.why === 'send-scope-not-granted' ? f.why : 'attachments-not-sendable', requiredScopes: Array.isArray(f.requiredScopes) ? f.requiredScopes.slice(0, 8).map(String) : [] };
    return { offered: true, why: null };
  }
  if (what === 'fetch-attachment') {
    if (c.attachments !== 'fetch') return { offered: false, why: 'attachments-not-fetchable' };
    return resolved.read === 'yes' ? { offered: true, why: null } : { offered: false, why: resolved.why || 'unknown' };
  }
  // lane channel-threads (spec §2.4) — the NARROW law unchanged: the declaration AND this conversation's own
  // resolved row must both allow it; a row the cache does not hold (stale / unknown / predating it) is not offered
  if (what === 'thread-reply') {
    const t = threadsRow(c);
    if (!t.replyInto) return { offered: false, why: t.read === 'none' ? 'no-threads' : 'thread-reply-not-declared' };
    // replying into a thread is a SEND: the conversation must offer sending as some identity first
    const send = offers(c, convCaps, 'send-as-user', now).offered || offers(c, convCaps, 'send-as-bot', now).offered;
    if (!send) { const u = offers(c, convCaps, 'send-as-user', now); return { offered: false, why: u.why || 'unknown' }; }
    if (!resolved.threads) return { offered: false, why: resolved.why || 'unknown' };
    if (!resolved.threads.replyInto) return { offered: false, why: resolved.threads.why || 'topic-forbidden' };
    return { offered: true, why: null };
  }
  if (what === 'react' || what === 'unreact') {
    const r = reactionsRow(c);
    if (what === 'react' ? !r.add : r.remove !== 'own') return { offered: false, why: r.read === 'none' ? 'no-reactions' : 'react-not-declared' };
    if (resolved.read === 'no') return { offered: false, why: resolved.why || 'not-a-member' };
    if (!resolved.reactions) return { offered: false, why: resolved.why || 'unknown' };
    if (!resolved.reactions.add) return { offered: false, why: resolved.reactions.why || 'reactions-scope-not-granted' };
    return { offered: true, why: null };
  }
  if (what === 'read-reactions') {
    const r = reactionsRow(c);
    if (r.read === 'none') return { offered: false, why: 'no-reactions' };
    if (resolved.read === 'no') return { offered: false, why: resolved.why || 'not-a-member' };
    if (!resolved.reactions) return { offered: false, why: resolved.why || 'unknown' };
    if (!resolved.reactions.read) return { offered: false, why: resolved.reactions.why || 'reactions-scope-not-granted' };
    return { offered: true, why: null };
  }

  const as = what === 'send-as-user' ? 'user' : 'bot';
  const declared = Array.isArray(c.sendAs) ? c.sendAs : [];
  if (!declared.includes(as)) return { offered: false, why: declared.length ? 'not-declared-for-this-identity' : 'read-only-adapter' };
  // The resolution may only NARROW: intersect, so an adapter answering wider
  // than its own declaration can never widen a control (and the contract
  // suite fails that adapter outright).
  if (!resolved.sendAs.includes(as)) return { offered: false, why: resolved.why || 'unknown' };
  return { offered: true, why: null };
}

/**
 * WHAT THE RECIPIENT WILL SEE, said at the moment of authorization (§9.5).
 * `unknown` warns exactly as loudly as `marked`: an unverified claim about
 * whose name appears on a message is not a reason to say nothing.
 *
 * THIS RESOLVER RETURNS STRUCTURE; `identityWarningText()` RENDERS IT (r2) —
 * see `freshnessClaim` below for why. `verbatim` is the ADAPTER's own sentence
 * and is shown as-is: it is a statement about a vendor's UI, not product
 * chrome, so it is never translated and it is the one string that may travel
 * on the wire already spelled out.
 */
function identityWarning(caps) {
  const c = caps || {};
  const mark = ['none', 'marked', 'unknown'].includes(c.identityMarking) ? c.identityMarking : 'unknown';
  if (mark === 'none') return { level: 'none', marking: mark, verbatim: '' };
  return { level: 'warn', marking: mark, verbatim: c.identityMarkingText ? String(c.identityMarkingText) : '' };
}

/**
 * WHY SENDING IS NOT OFFERED, in words (P4). The `why` is the adapter's own
 * reason (§4's enum plus `send-scope-not-granted`, the P4 state where the
 * platform can send but the held consent lacks the send permission — the
 * sentence says what unlocks it, never a greyed control). An unknown reason
 * is shown verbatim rather than hidden.
 */
function sendWhyText(why, { t = defaultT } = {}) {
  switch (String(why || 'unknown')) {
    case 'send-scope-not-granted': return t('sending needs the send permission on the connected app — reconnect (Re-authorize) to allow drafts and sending; on Lark that also means enabling im:message + im:message.send_as_user and publishing a version');
    case 'read-only-adapter': return t('this channel is read-only');
    case 'read-only-mailbox': return t('this conversation is read-only');
    case 'not-a-member': return t('you are not a member of this conversation');
    // design 012 (Slack S1): a conversation the vendor narrows by its own state
    case 'archived': return t('this channel is archived');
    case 'frozen': return t('this channel is frozen');
    case 'read-only-channel': return t('only some people may post in this channel');
    case 'thread-only-channel': return t('in this channel you may only reply in threads');
    case 'team-access-not-granted': return t('your organization has not granted this app access to this conversation');
    case 'restricted': return t('your workspace\'s settings do not allow this');
    case 'ekm': return t('your organization\'s key management hides this content');
    case 'missing-scope': return t('the app was installed without a permission this needs — add it on the app\'s page and paste the new token (Re-authorize)');
    case 'token-revoked': return t('the token was revoked or the app was removed — paste a new token (Re-authorize)');
    case 'left-group': return t('you left this conversation');
    case 'bot-not-in-chat': return t('the bot is not in this chat');
    case 'not-declared-for-this-identity': return t('this identity cannot send on this channel');
    // lane gmail-reply-known: a lookup that was REFUSED names why (CONV_CAPS_FAIL_WHYS) — the engine asks again by itself
    case 'rate-limited': return t('the vendor is rate-limiting this account — it is asked again by itself');
    case 'backoff': return t('this account is paused after repeated vendor errors — it is asked again by itself');
    case 'vendor-error': return t('the vendor did not answer whether you can reply — it is asked again by itself');
    case 'auth-expired': return t('this account\'s sign-in expired — Re-authorize');
    case 'not-connected': return t('this account is not connected — Re-authorize');
    case 'checking': return t('checking whether you can reply…');
    case 'stale': return t('the send capability has not been re-checked recently');
    case 'unknown': return t('the send capability is not known yet');
    // r6 verify F1 / F3 (2026-09-28): a reply's target, re-judged at approval
    case 'reply-anchor-gone': return t('the message this reply answers is no longer a stored message of this conversation — nothing was sent');
    case 'reply-envelope-missing': return t('this reply was proposed before its recipients were resolved — ask the agent to propose it again');
    case 'reply-envelope': return t('who this reply goes to could not be resolved');
    default: return String(why);
  }
}

/** THE WINDOW'S FOOT WHILE THE SEND ROW IS NOT RESOLVED (lane gmail-reply-known). A lookup in flight — or about to be:
 *  the window's open re-asks an unknown / stale row — reads "Checking…" (never the raw word); a REFUSED lookup names
 *  why, when it is asked again (`retryAt`, the engine's own timer) and offers Retry (+ Re-authorize where the sign-in
 *  is the fix). `null` = a RESOLVED refusal — the caller's "Read-only here ({why})". */
function sendFoot(cc, why, { t = defaultT, vendor = '', checking = false } = {}) {
  const w = String(why || 'unknown');
  if (checking || w === 'unknown' || w === 'stale') return { state: 'checking', why: w, text: t('Checking whether you can reply…'), retry: false, reauth: false };
  if (!CONV_CAPS_FAIL_WHYS.includes(w)) return null;
  const v = vendor || t('The vendor');
  const said = w === 'rate-limited' ? t('{vendor} is rate-limiting this account — the reply box returns when it answers', { vendor: v })
    : w === 'backoff' ? t('This account is paused after repeated vendor errors — the reply box returns when it answers')
      : w === 'auth-expired' ? t('This account\'s sign-in expired — Re-authorize to reply')
        : w === 'not-connected' ? t('This account is not connected — Re-authorize to reply')
          : t('{vendor} did not answer whether you can reply here', { vendor: v });
  const at = cc ? num(cc.retryAt) : null;
  const text = at ? t('{sentence} (retrying at {time})', { sentence: said, time: hhmm(at) }) : said;
  return { state: 'failed', why: w, text, retryAt: at, retry: true, reauth: w === 'auth-expired' || w === 'not-connected' };
}

/** WHY REPLYING INTO A THREAD IS NOT OFFERED, in words (lane channel-threads,
 *  spec §2.7) — the thread pane's read-only line. A send reason (the pane's
 *  reply is a send) falls through to `sendWhyText`. */
function threadWhyText(why, { t = defaultT } = {}) {
  switch (String(why || 'unknown')) {
    case 'topic-forbidden': return t('This group does not allow replies in threads');
    case 'no-threads': return t('this channel has no threads');
    case 'thread-reply-not-declared': return t('this channel cannot reply into a thread');
    case 'no-threads-here': return t('this channel does not allow threads');
    case 'thread-not-loaded': return t('this thread is not loaded yet — opening it loads it');
    default: return sendWhyText(why, { t });
  }
}
/** WHY A REACTION CONTROL IS NOT OFFERED (react / unreact / the chips' source),
 *  in words — the strip's line and the agent's refusal. `scopes` = what unlocks
 *  reading them (the adapter's `reactionsGrant`), named where it is known. */
function reactWhyText(why, { t = defaultT, scopes = null, refused = null, vendor = '' } = {}) {
  switch (String(why || 'unknown')) {
    // owner ruling (2026-09-28): the chips, the window's line and the card say ONE sentence — the account's own
    // evidence first (the last consent DROPPED the scope because the vendor refused it), else one Re-authorize
    case 'reactions-scope-not-granted':
      if (Array.isArray(refused) && refused.length) return refusedScopeText(refused, { t, vendor });
      return scopes && scopes.length ? t('Reactions can be read after one Re-authorize ({scopes})', { scopes: scopes.join(' + ') }) : t('Reactions can be read after one Re-authorize');
    case 'no-reactions': return t('This channel has no reactions');
    case 'react-not-declared': return t('this channel cannot add reactions');
    case 'policy-off': return t('agent reactions are turned off for this account');
    case 'read-only-adapter': return t('this channel is read-only');
    default: return sendWhyText(why, { t });
  }
}

/** THE VENDOR REFUSED AN OPTIONAL SCOPE (owner ruling 2026-09-28): the last consent was narrowed ONCE because the
 *  vendor's page refused it (Lark 20027 — the app has not enabled it) — said by name, never a silent narrower consent. */
function refusedScopeText(scopes, { t = defaultT, vendor = '' } = {}) {
  return t('{vendor} refused {scopes} — enable it in the app console and Re-authorize', { vendor: vendor || t('The vendor'), scopes: (Array.isArray(scopes) ? scopes : []).join(' + ') });
}
/** THE ACCOUNT'S REACTIONS-READ LINE (owner ruling 2026-09-28): the card's, the window's and the chips' words while the
 *  HELD sign-in lacks the read scope. `grant` = the engine's `reactionsGrant` view ({scopes, missing, refused,
 *  wanted}); '' when nothing is missing or the account turned reading off. */
function reactReadText(grant, { t = defaultT, vendor = '' } = {}) {
  const g = grant && typeof grant === 'object' ? grant : {};
  const missing = Array.isArray(g.missing) ? g.missing : [];
  if (!missing.length || g.wanted === false) return '';
  return reactWhyText('reactions-scope-not-granted', { t, scopes: missing, refused: Array.isArray(g.refused) ? g.refused : null, vendor });
}

/** The sentence for an `identityWarning`. Rendered where the LANGUAGE is
 *  known — see `freshnessText`. */
function identityWarningText(warn, { t = defaultT } = {}) {
  const w = warn || {};
  if (w.level !== 'warn') return '';
  if (w.verbatim) return String(w.verbatim);
  return w.marking === 'marked'
    ? t('The recipient sees this as sent by the app, not by you.')
    : t('It is not verified whose name the recipient sees on this message.');
}

/**
 * HOW FRESH IS THIS ROW — the number the panel draws, and the only thing a
 * user needs when deciding whether to hand something to this lane.
 *
 * `laneOrScan` is the answer from `laneState()` or `scanState()`; the union is
 * discriminated by `via`, which BOTH now answer (r6) so no caller has to sniff
 * which keys happen to be present. `now` is passed because this function
 * answers "how long ago", and every sibling resolver in this tree takes its
 * clock as an argument.
 *
 * IT RETURNS STRUCTURE — `{kind, state, seconds}` — AND NOTHING ELSE (r2).
 * It used to compose the sentence too, and the ingest engine called it with no
 * translator, so the chip this feature calls its honesty contract shipped
 * ENGLISH-ONLY to a zh/ja UI: nine human-visible strings left the server as
 * DATA, which is precisely why the build's i18n-check (a src/lib/ literal
 * scan) could never see them. And the server structurally CANNOT fix it by
 * taking a translator: language is per DEVICE (localStorage) while this digest
 * is BROADCAST to every client at once. So the sentence is rendered where the
 * language is known — `freshnessText()` below, called by the panel and the
 * window with their own `t`.
 *
 * `kind` drives the chip's colour; `state` names WHICH sentence, because
 * `kind` alone collapses distinct answers ('not scanning' and 'not scanned
 * yet' are both `scanned`+`seconds:null`, 'reconciling' and 'polling' are both
 * `within`+`seconds:null`) and a renderer that cannot tell them apart is back
 * to inventing the difference.
 *
 * A ROW NOTHING WILL FETCH SAYS SO (r3). A disabled adapter's rows are
 * refused by the tick and the pass alike, so they answer the lane's own `off`
 * vocabulary ("not polling") — `why` names the silencing fact. Since
 * 2026-09-26 (a linked account is an aggregated IM) there is NO `tracked`
 * gate: every conversation is fetched, at the cadence `cadenceFor()` resolves
 * for it — so the claim IS that cadence (hot / warm / cold by activity, or
 * the owner's override), and a PAUSED override says `paused` rather than an
 * age it will not keep. A stale `tracked` flag on an entry is ignored.
 */
function freshnessClaim(caps, laneOrScan, entry, now, { enabled = true, cadence = null, tiers = null, watched = false } = {}) {
  const c = caps || {};
  const l = laneOrScan || {};
  const lane = (entry && entry.lane) || {};
  const off = (why) => ({ kind: l.via === 'scan' ? 'scanned' : 'within', state: 'off', seconds: null, why });

  if (!enabled) return off('adapter-disabled');

  if (l.via === 'scan') {
    const secs = ageS(lane.lastScanAt, now);
    if (!l.source) return off(l.why || 'no-source');
    if (secs === null) return { kind: 'scanned', state: 'never', seconds: null };
    return { kind: 'scanned', state: 'aged', seconds: secs };
  }
  if (l.via === 'push' && l.live && l.carryContent) {
    return { kind: 'live', state: 'live', seconds: ageS(lane.lastPushAt, now) };
  }
  // Everything else — poll, a kick-mode push lane, a demoted or dead one — is
  // carried by polling, so the claim is the row's RESOLVED cadence
  // (`cadenceFor`: the owner's override, else its activity tier, the push
  // safety net folded in), never the lane the adapter declared.
  const cad = cadence || cadenceFor(c, l, entry, now, { tiers, watched });
  if (cad.paused) return { kind: 'within', state: 'paused', seconds: null };
  if (cad.seconds === null || cad.seconds === undefined) return { kind: 'within', state: 'unknown', seconds: null };
  // lane lark-search-poll: a CARRYING feed's claim is its own bound (every + overlap) — never the relaxed safety net it
  // no longer depends on; an open window's hot poll is shorter and is what it claims
  const fb = l.pollCadence === 'feed' || l.pollCadence === 'feed-only' ? num(l.feedSeconds) : null;
  if (fb !== null && (fb < cad.seconds || !cad.seconds)) return { kind: 'within', state: 'bound', seconds: fb, tier: cad.tier || null, source: 'feed' };
  return { kind: 'within', state: 'bound', seconds: cad.seconds, tier: cad.tier || null, source: cad.source };
}

// ── THE CADENCE A CONVERSATION IS POLLED AT (2026-09-26) ──────────────────
/** The design's defaults (§6.2); every one is a SETTING the engine hands in
 *  (`channels.pollHotSec` / `pollWarmSec` / `pollColdSec` /
 *  `hotRecentMinutes` / `warmRecentHours`). */
const TIER_DEFAULTS = Object.freeze({ hotSec: 30, warmSec: 300, coldSec: 900, hotRecentMinutes: 60, warmRecentHours: 24, relaxedSec: 300 });
/** The owner's ceiling: "30 minutes is too long — 15 at most". No setting and
 *  no override may push a conversation past it. */
const COLD_MAX_SEC = 900;
/** The owner's per-conversation override choices ("Refresh every ▸"). */
const REFRESH_CHOICES = Object.freeze([30, 60, 300, 900, 'paused']);
const validRefresh = (v) => REFRESH_CHOICES.includes(v);

/** hot | warm | cold for ONE entry: open in a window (`watched`) or a message
 *  inside the hot window ⇒ hot; inside the warm window ⇒ warm; else cold. */
function pollTier(entry, now, { tiers = null, watched = false } = {}) {
  const T = { ...TIER_DEFAULTS, ...(tiers || {}) };
  if (watched) return 'hot';
  const last = num(entry && entry.lastAt);
  if (last === null) return 'cold';
  const age = Number(now) - last;
  if (age <= Number(T.hotRecentMinutes) * 60e3) return 'hot';
  if (age <= Number(T.warmRecentHours) * 3600e3) return 'warm';
  return 'cold';
}
/**
 * THE ONE CADENCE RESOLVER — the scheduler's due time and the freshness chip
 * both read it, so the chip cannot claim a number the tick does not keep.
 *   override (`entry.refresh.every`: 30 | 60 | 300 | 900 | 'paused') >
 *   the push safety net (push live AND carrying content ⇒ the cold tier) >
 *   the activity tier;
 * then clamped to [the adapter's `pollInterval.floor`, COLD_MAX_SEC].
 * → `{seconds|null, tier, source:'override'|'push-safety'|'tier', paused}`.
 */
function cadenceFor(caps, laneOrScan, entry, now, { tiers = null, watched = false } = {}) {
  const T = { ...TIER_DEFAULTS, ...(tiers || {}) };
  const floor = Math.max(1, num(caps && caps.pollInterval && caps.pollInterval.floor) || 1);
  const clamp = (v) => Math.min(COLD_MAX_SEC, Math.max(floor, Math.round(Number(v))));
  const tier = pollTier(entry, now, { tiers: T, watched });
  const ov = entry && entry.refresh && typeof entry.refresh === 'object' ? entry.refresh.every : null;
  if (ov === 'paused') return { seconds: null, tier, source: 'override', paused: true };
  if (validRefresh(ov)) return { seconds: clamp(ov), tier, source: 'override', paused: false };
  const l = laneOrScan || {};
  const cold = clamp(T.coldSec);
  if (l.pollCadence === 'reconcile') return { seconds: cold, tier, source: 'push-safety', paused: false };
  // lane channel-feed-authority: an AUTHORITATIVE carrying feed names every changed conversation — a row it did not name
  // is not polled by a timer (0 s = never due by the clock); an open window (`watched`) keeps the hot refresh (the owner
  // looking). The feed's named rows, a kick, the owner's press and the owed marks are due by the engine, not by this.
  if (l.pollCadence === 'feed-only') {
    if (watched) return { seconds: clamp(T.hotSec), tier, paused: false, source: 'tier' };
    return { seconds: 0, tier, source: 'feed', paused: false };
  }
  const secs = tier === 'hot' ? T.hotSec : tier === 'warm' ? T.warmSec : T.coldSec;
  // lane lark-search-poll (owner decision 4, 2026-09-28: "5 minutes, not 15"): a CARRYING change feed relaxes every
  // row to AT LEAST the relaxed safety net (`channels.relaxedPollSec`, 300) — a cold row stays cold, never polled MORE
  // — while an open window (`watched`) keeps the hot tier: the index lag must not slow what the owner is reading
  if (l.pollCadence === 'feed') {
    if (watched) return { seconds: clamp(T.hotSec), tier, source: 'tier', paused: false };
    return { seconds: clamp(Math.max(Number(secs), Number(T.relaxedSec) || TIER_DEFAULTS.relaxedSec)), tier, source: 'feed-safety', paused: false };
  }
  return { seconds: clamp(secs), tier, source: 'tier', paused: false };
}

/** THE LEARNED BUDGET SENTENCE (lane gmail-quota-share): the vendor refused this account's quota, so its polling
 *  slowed itself (src/channel-budget.js) — the ceiling of the setting, WHEN the vendor refused (the shared bucket
 *  named as a POSSIBILITY: another instance cannot be seen from here) and when it is back at the setting.
 *  `budget.learned` = {ceiling, setting, refusedAt, fullAt} from the account row; '' at the setting. */
function learnedBudgetText(budget, { t = defaultT, vendor = '' } = {}) {
  const l = budget && budget.learned;
  if (!l || !(Number(l.ceiling) < Number(l.setting))) return '';
  const hm = (ms) => { const d = new Date(Number(ms)); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const unit = budget.unit === 'quota-unit' ? t('quota units') : t('requests');
  const args = { n: Math.round(Number(l.ceiling)), m: Math.round(Number(l.setting)), unit, back: Number(l.fullAt) > 0 ? hm(l.fullAt) : '—' };
  if (Number(l.refusedAt) > 0) return t("Polling at {n} of {m} {unit}/min — {vendor} refused this account's quota at {time}; another instance may be polling the same account · back to {m} by {back}", { ...args, vendor: vendor || t('The vendor'), time: hm(l.refusedAt) });
  return t('Polling at {n} of {m} {unit}/min · back to {m} by {back}', args);
}

/** THE VENDOR BUDGET SENTENCE (§6.2) — `{unit, limit, exhausted, waiting,
 *  resetInSeconds}` from the account row; empty while the budget holds. */
function budgetText(budget, { t = defaultT } = {}) {
  const b = budget || {};
  if (!b.exhausted) return '';
  const unit = b.unit === 'quota-unit' ? t('quota units') : t('requests');
  const args = { n: b.limit, unit, k: Number(b.waiting) || 0, s: Math.max(0, Math.round(Number(b.resetInSeconds) || 0)) };
  // WHO SPENT IT (2026-09-26, lane R2 verify): an agent's refreshes count
  // against the same minute — the card names them when they took a part
  const byAgents = Math.round(Number(b.spentBy && b.spentBy.agent) || 0);
  // lane R5: a PACED account names its per-second figure beside the minute's (drain rule 18)
  const r = Number(b.perSec) > 0 ? Math.round(Number(b.perSec) * 100) / 100 : 0;
  // verify r3 (T2 ②): the per-second bucket admits `burst` at once — a sliding minute holds up to {n} + {b}, and the
  // words say so when the bucket is wider than one request (the minute's figure alone read as the ceiling it is not)
  const bu = Number(b.burst) > 1 ? Math.round(Number(b.burst) * 100) / 100 : 0;
  if (r && bu) {
    if (byAgents > 0) return t('Vendor budget reached — {n} {unit}/min (at most {r}/s, {b} at once) for this account, {a} of them by agent refreshes; {k} conversations waiting, next refresh in {s} s', { ...args, r, b: bu, a: byAgents });
    return t('Vendor budget reached — {n} {unit}/min (at most {r}/s, {b} at once) for this account; {k} conversations waiting, next refresh in {s} s', { ...args, r, b: bu });
  }
  if (r) {
    if (byAgents > 0) return t('Vendor budget reached — {n} {unit}/min (at most {r}/s) for this account, {a} of them by agent refreshes; {k} conversations waiting, next refresh in {s} s', { ...args, r, a: byAgents });
    return t('Vendor budget reached — {n} {unit}/min (at most {r}/s) for this account; {k} conversations waiting, next refresh in {s} s', { ...args, r });
  }
  if (byAgents > 0) return t('Vendor budget reached — {n} {unit}/min for this account, {a} of them by agent refreshes; {k} conversations waiting, next refresh in {s} s', { ...args, a: byAgents });
  return t('Vendor budget reached — {n} {unit}/min for this account; {k} conversations waiting, next refresh in {s} s', args);
}

/** The account's PASS STATE as the card says it (2026-09-26, lane R2
 *  verify): `lastOkAt` = the last GOOD pass (a failed pass stamps `lastPass`
 *  too, and the card printed it as "last sync" while nothing was fetched),
 *  and — from the FIRST failure, not the third — `note` naming the code and
 *  when the next attempt runs (`backoffUntil`, the engine's in-memory
 *  back-off). `{lastOkAt, note}`; `note` is '' while the last pass was good. */
function passStateText(account, { t = defaultT, now = Date.now() } = {}) {
  const a = account || {};
  const lp = a.lastPass || null;
  const lastOkAt = Number(a.lastOkAt) > 0 ? Number(a.lastOkAt) : null;
  if (!lp || lp.ok !== false) return { lastOkAt, note: '' };
  const code = errorCodeText(lp.code || 'failed', { t });
  const until = Number(a.backoffUntil) || 0;
  const s = until > now ? Math.max(1, Math.ceil((until - now) / 1000)) : 0;
  // lane R5: a vendor RATE refusal is a short wait said by the VENDOR's name
  // (a declared label — `vendor` on the account view — worded by the device's
  // t(); "the vendor" when none is declared): "Google is limiting the rate ·
  // resuming in 12 s", never "paused" and never a failure count
  if (lp.code === 'rate-limited') {
    const vendor = a.vendor ? t(String(a.vendor)) : t('The vendor');
    return { lastOkAt, rate: true, note: s ? t('{vendor} is limiting the rate · resuming in {s} s', { vendor, s }) : t('{vendor} is limiting the rate · resuming at the next pass', { vendor }) };
  }
  return { lastOkAt, note: s ? t('{code} — retrying in {s} s', { code, s }) : t('{code} — retrying at the next pass', { code }) };
}

/** THE FIRST READ (lane R5): while an account's conversations are read for
 *  the first time (`scheduler.firstIngest` = {done, total, etaSec}) the card
 *  says how far it is and, at the account's pace, about how long the rest
 *  takes — the answer to "why is it slow" is a number, not a stall. '' once
 *  every conversation was read once. */
function firstReadText(scheduler, { t = defaultT } = {}) {
  const f = scheduler && scheduler.firstIngest;
  if (!f || !(Number(f.total) > 0) || Number(f.done) >= Number(f.total)) return '';
  const head = t('reading for the first time · {n}/{m} conversations', { n: Number(f.done) || 0, m: Number(f.total) });
  const eta = Number(f.etaSec);
  if (!(eta > 0)) return head;
  // verify r3: past 90 minutes the wait is said in hours and minutes ("about 5 h 49 min left", "about 2 h left") —
  // "about 349 min left" was said but nobody reads a wait that way
  const min = Math.ceil(eta / 60);
  let tail;
  if (eta < 60) tail = t('under a minute left');
  else if (min < 90) tail = t('about {min} min left', { min });
  else { const h = Math.floor(min / 60), m = min % 60; tail = m ? t('about {h} h {min} min left', { h, min: m }) : t('about {h} h left', { h }); }
  return `${head} · ${tail}`;
}

/** The sentence for a `freshnessClaim`. ONE producer per string, and the
 *  `t()` literals live here so the extractor finds them — but it is called
 *  from the CLIENT, which is the only place that knows the language. A claim
 *  whose `state` we do not recognise says so; it never guesses a number. */
function freshnessText(claim, { t = defaultT, short = false } = {}) {
  const f = claim || {};
  const age = () => humanAge(f.seconds);
  switch (f.state) {
    // `off` is one state with two lanes' words: a scan lane that is not
    // reading and a poll/push row nothing polls (untracked, or its adapter
    // disabled) are the same claim — no evidence is being gathered — so the
    // kind picks the verb and the state picks the sentence.
    case 'off': return f.kind === 'scanned' ? t('not scanning') : t('not polling');
    // `short`: the row PILL's words. The pill is drawn WHOLE (it never shrinks
    // or ellipsizes — the title yields), so its width budget lives HERE: every
    // pill word ≤ 82 px at 9/600 in the runner's face (DejaVu Sans), which
    // leaves the title design §4's 60 px in the 188 px panel's 148 px line.
    // "refresh paused" is 89 px in DejaVu Sans (79 in this box's Noto Sans):
    // the .185 mirror drew "refresh pau…" (2.369.186). Measured per face ×
    // language by test-channels-e2e ⑯; the sentence stays whole in the pill's
    // tooltip and everywhere else.
    case 'never': return short ? t('no scan yet') : t('not scanned yet');
    case 'aged': return short ? t('{age} ago', { age: age() }) : t('scanned {age} ago', { age: age() });
    case 'live': return t('live');
    case 'reconciling': return t('reconciling');
    case 'paused': return short ? t('paused') : t('refresh paused');
    case 'unknown': return t('polling');
    case 'bound': return t('within {age}', { age: age() });
    default: return t('unknown');
  }
}

/**
 * THE CODE VOCABULARY, IN WORDS (a3 i18n, 2026-09-18). The digest carries
 * CODES — `auth.why`, `lane.why`, `lastPass.code`, a wake's delivery `lane`,
 * a scan `source`, a held wake's `refused` — and the panel used to print them
 * raw (`needs re-authorization (token-expired)`, `SCAN · NO-STORE-ON-PLATFORM`).
 * Each composer below is the ONE place a code becomes a sentence, called by
 * the client with its own `t` (the freshnessText rule); a code the table does
 * not know is shown verbatim rather than hidden — a new code is a new row.
 */
function authWhyText(why, { t = defaultT } = {}) {
  switch (String(why || '')) {
    case 'token-expired': return t('the login expired');
    case 'refresh-token-expired': return t('the refresh token expired');
    case 'refresh-refused': return t('the vendor refused to refresh the login');
    case 'no-refresh-token': return t('no refresh token was granted');
    case 'last-pass-refused': return t('the last pass was refused as expired');
    case 'needs-reauth': return t('the vendor asks for a new consent');
    case 'never-authenticated': return t('never connected');
    case 'no-credentials': return t('no application credential');
    case '': return '';
    default: return String(why);
  }
}
/** `lane.why` (laneState / scanState) — why THIS lane is the one carrying the row. */
function laneWhyText(why, { t = defaultT } = {}) {
  switch (String(why || '')) {
    case 'scan': return t('scan');
    case 'poll': return t('poll');
    case 'demoted': return t('push demoted — polling');
    case 'push-dead': return t('push silent — polling');
    case 'exclusive': return t('push, exclusive');
    case 'kick-shared': return t('push nudges the cursor (shared)');
    case 'kick-unknown': return t('push nudges the cursor');
    case 'feed': return t('new-message search');
    case 'store': return t('local store');
    case 'user-chose-ui': return t('the client UI (chosen)');
    case 'no-store-on-platform': return t('no local store on this platform');
    case 'store-encrypted': return t('the local store is encrypted');
    case 'client-not-installed': return t('the client is not installed');
    case 'host-facts-stale': return t('host facts are stale');
    case 'tcc-denied': return t('access to the store was denied');
    case 'no-source': return t('no source');
    case '': return '';
    default: return String(why);
  }
}
/** A CHANNEL_ERROR_CODES entry (the registry's closed set) in words. */
function errorCodeText(code, { t = defaultT } = {}) {
  switch (String(code || '')) {
    case 'auth-expired': return t('login expired');
    case 'rate-limited': return t('rate limited');
    case 'not-found': return t('not found');
    case 'forbidden': return t('forbidden');
    case 'transport': return t('transport failure');
    case 'vendor-error': return t('vendor error');
    case 'too-large': return t('too large');
    case 'send-not-available': return t('sending not available');
    case 'not-supported': return t('not supported');
    case 'lost-at-boot': return t('lost at restart');
    case 'failed': return t('failed');
    case '': return '';
    default: return String(code);
  }
}
/** A delivery LANE (the conversation delivery ladder's answer) in words. */
function deliveryLaneText(lane, { t = defaultT } = {}) {
  switch (String(lane || '')) {
    case 'message': return t('a message into the session');
    case 'channel': return t('the channel socket');
    case 'rpc-queue': return t('the queue of the running turn');
    case 'user-inbox': return t('the For you tray'); // the lane CODE keeps its name; the words name the button the user sees (S3 verify F6)
    case 'remote-message': return t('a message on the owning machine');
    case 'stash': return t('the next-turn stash');
    case 'none': return t('nowhere');
    case '': return '';
    default: return String(lane);
  }
}
/** A scan SOURCE (`store` | `ui`) in words. */
function scanSourceText(source, { t = defaultT } = {}) {
  switch (String(source || '')) {
    case 'store': return t('the local store');
    case 'ui': return t('the client UI');
    case '': return '';
    default: return String(source);
  }
}
/** Why a wake was HELD (the engine's `refused` code beside its sentence). */
function wakeRefusalText(refused, { t = defaultT } = {}) {
  switch (String(refused || '')) {
    case 'no-live-session': return t('no live session in the group — kept for its next turn');
    case 'pacing': return t('the daily wake cap is reached — kept for later');
    case 'unwired': return t('no delivery ladder is wired');
    case 'error': return t('the delivery ladder threw');
    case 'spend': return t('the spend budget refused it');
    case 'row-unwritten': return t('its wake could not be recorded (the store write failed) — kept for its next turn');   // verify r4
    case 'stash-failed': return t('it could not be stored for the next turn (the disk write failed) — the receipt stays on this card');   // verify r4
    // verify r5: the ladder's other closed codes were shown RAW ("wrapper-no-steer") on the card and the chip
    case 'wrapper-no-steer': return t("this session's agent predates notification steering — delivering mid-turn would open a billed turn; kept for its next turn (restart the session to receive them mid-turn)");
    case 'no-wake': return t('no turn was running to join — delivering now would open a billed turn; kept for its next turn');
    case 'access-removed': return t('the notification was removed while it was on its way');
    case 'member-gone': return t('the member left the group while it was on its way — kept for the next one');
    case 'refused': return t('refused');
    case '': return '';
    default: return String(refused);
  }
}

// ── THE CHANGE FEED (lane lark-search-poll, B-5aab, 2026-09-28 — design §27) ───────────────
/** Feed modes / defaults as the resolver reads them (the arithmetic is src/channel-feed.js's; this module imports
 *  nothing, so the two numbers it needs are restated and pinned equal by test-channel-caps). */
const FEED_MODES = Object.freeze(['measuring', 'carrying', 'demoted']);
const FEED_DEFAULTS = Object.freeze({ everySec: 30, overlapSec: 60 });
/** The adapter's declared change feed (`caps.changeFeed`), or null. */
const changeFeedRow = (c) => (c && c.changeFeed && typeof c.changeFeed === 'object' ? c.changeFeed : null);
/** lane channel-feed-authority: the feed's AUTHORITY — `authoritative` (the vendor's own change log: Gmail's history.list;
 *  carrying from its first good answer, it replaces every per-row timer) | `measured` (Lark's search: coverage measured,
 *  never promised — carrying only once measured complete, and then only relaxes the rows). Undeclared = measured. */
const FEED_AUTHORITIES = Object.freeze(['authoritative', 'measured']);
const feedAuthoritative = (c) => { const d = changeFeedRow(c); return !!d && d.authority === 'authoritative'; };
/** The last instant the account's SCOPES changed or a consent landed (inc-muk9jj0j-rel3) — never `auth.updatedAt`,
 *  which every hourly refresh moves. ONE spelling: the engine's `credentialChangedAt` delegates here. */
function credentialChangedAt(rec) {
  return Math.max(Number(rec && rec.auth && rec.auth.scopesAt) || 0, Number(rec && rec.lastAuthAt) || 0);
}
/** The feed's claim (seconds): one tick plus the overlap — the time a message may take to be found. */
function feedBoundSec(o = {}) {
  const every = num(o && o.everySec) !== null ? Number(o.everySec) : FEED_DEFAULTS.everySec;
  const ov = num(o && o.overlapSec) !== null ? Math.max(30, Number(o.overlapSec)) : FEED_DEFAULTS.overlapSec;
  return every + ov;
}
/** The feed carries only while its last good page is younger than this (src/channel-feed.js `freshMs`). */
function feedFreshMs(o = {}) {
  const every = num(o && o.everySec) !== null ? Number(o.everySec) : FEED_DEFAULTS.everySec;
  const ov = num(o && o.overlapSec) !== null ? Math.max(30, Number(o.overlapSec)) : FEED_DEFAULTS.overlapSec;
  return Math.max(180e3, (3 * every + ov) * 1000);
}
/** Missed answers IN A ROW before the feed's wait is said as "not answering" while its last page is still fresh — the
 *  engine's FAILURES_BEFORE_LOUD (channels-engine.js), spelled here because this module imports nothing (verify r1). */
const FEED_LOUD_STRIKES = 3;
/** A shape park's offending field lists (lane lark-p2p), bounded: ≤ 3 lists × ≤ 6 names in the field alphabet. */
function shapeFields(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 16).map((l) => (Array.isArray(l) ? l.slice(0, 6).filter((x) => typeof x === 'string' && /^[A-Za-z0-9_.]{1,64}$/.test(x)) : [])).filter((l) => l.length).slice(0, 3);
}
/** HH:MM of an instant on this device's clock face (a PURE default; the panel passes its locale's). */
function hhmm(ms) {
  const d = new Date(Number(ms));
  if (!Number.isFinite(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/**
 * IS THE FEED ON, AND IS IT CARRYING THIS ACCOUNT — the ONE answer (§2.8). Positive evidence only:
 *   off        not declared / the account disabled / the owner's option `off` / the HELD sign-in lacks the scope
 *              (the gate is the held scope, never a probing call — zero search requests)
 *   refused    the vendor refused the SEARCH (its scope, an ignored time window, a shape) — lifted by a credential
 *              change (a Re-authorize) or its own `retryAt`
 *   backoff    the vendor is limiting the search (a 429 on ITS tier; why 'rate-limited') or the search is not answering
 *              (a 5xx / a timeout — verify r1; why 'failed') — the per-conversation polling carries on either way
 *   never      on, never ran · behind  its last good page is older than the fresh bound
 *   measuring | carrying | demoted     the measurement's mode (only `carrying` relaxes anything)
 * → { on, carrying, fresh, state, why, mode, scope, … }
 */
function feedState(caps, rec, now, { everySec = FEED_DEFAULTS.everySec, overlapSec = FEED_DEFAULTS.overlapSec } = {}) {
  const d = changeFeedRow(caps);
  const base = { on: false, carrying: false, fresh: false, state: 'off', why: null, mode: null, scope: d ? d.scope || null : null };
  if (!d) return { ...base, why: 'not-declared' };
  const r = rec && typeof rec === 'object' ? rec : {};
  if (r.enabled === false) return { ...base, why: 'adapter-disabled' };
  if (d.option && r.options && r.options[d.option] === 'off') return { ...base, why: 'option-off' };
  const held = Array.isArray(r.auth && r.auth.scopes) ? r.auth.scopes.map(String) : [];
  if (d.scope && !held.includes(d.scope)) {
    const refusedBy = Array.isArray(r.auth && r.auth.refusedScopes) ? r.auth.refusedScopes.map(String) : [];
    return { ...base, why: 'scope-not-granted', consentRefused: refusedBy.includes(d.scope) };
  }
  const f = r.feed && typeof r.feed === 'object' ? r.feed : {};
  // an AUTHORITATIVE feed is not measured: its mode is `carrying` by declaration — still positive evidence only (a fresh
  // good answer below; never run / behind / backing off / refused carries nothing)
  const mode = d.authority === 'authoritative' ? 'carrying' : FEED_MODES.includes(f.mode) ? f.mode : 'measuring';
  const ref = f.refused && typeof f.refused === 'object' ? f.refused : null;
  if (ref) {
    const lifted = credentialChangedAt(r) > (Number(ref.at) || 0) || (Number(ref.retryAt) > 0 && Number(now) >= Number(ref.retryAt));
    if (!lifted) return { ...base, state: 'refused', why: String(ref.code || 'refused'), mode, requiredScopes: Array.isArray(ref.requiredScopes) ? ref.requiredScopes.slice(0, 8) : [], retryAt: num(ref.retryAt), at: num(ref.at), fields: shapeFields(ref.fields) };
  }
  const on = { ...base, on: true, mode };
  // verify r1: the back-off says WHICH wait it is — the vendor limiting the search (a 429) or the search not answering (a
  // 5xx / a timeout / a refused shape: the feed's own failure ladder), never "limiting" for a search that is down.
  // lane lark-p2p verify r1: a LONE missed answer (fewer than FEED_LOUD_STRIKES in a row) while the last good page is
  // still fresh is not "not answering" — the feed delivered a window inside its bound (a 504 / 200 alternation read "is
  // not answering" on 235 of 240 ticks while a window completed every 30 s); the card keeps the mode's line. A 429, or a
  // row of three, or a stale last page, is said as the wait it is.
  const freshOk = Number(f.lastOkAt) > 0 && Number(now) - Number(f.lastOkAt) <= feedFreshMs({ everySec, overlapSec });
  const lone = f.backoffWhy === 'failed' && (Number(f.strikes) || 0) < FEED_LOUD_STRIKES && freshOk;
  if (Number(f.backoffUntil) > Number(now) && !lone) return { ...on, state: 'backoff', why: f.backoffWhy === 'failed' ? 'failed' : 'rate-limited', until: Number(f.backoffUntil) };
  if (!(Number(f.lastOkAt) > 0)) return { ...on, state: 'never' };
  if (Number(now) - Number(f.lastOkAt) > feedFreshMs({ everySec, overlapSec })) return { ...on, state: 'behind', ageSeconds: ageS(f.lastOkAt, Number(now)) };
  return { ...on, fresh: true, state: mode, carrying: mode === 'carrying' };
}
/**
 * THE CARD'S FEED LINE — `view` = the engine's `adapterView().feed` ({state, why, mode, everySec, relaxedSec,
 * measured: {total, missed, rate}, requiredScopes, until, scope}). '' where nothing needs saying (not declared,
 * disabled, or the scope is missing — the grants line says the one Re-authorize).
 */
function feedText(view, { t = defaultT, vendor = '', now = Date.now(), clock = hhmm } = {}) {
  const v = view && typeof view === 'object' ? view : {};
  const V = vendor || t('The vendor');
  const every = Number(v.everySec) || FEED_DEFAULTS.everySec;
  switch (v.state) {
    case 'off':
      return v.why === 'option-off' ? t('New-message search is off — each chat is checked on its own') : '';
    case 'refused':
      if (v.why === 'forbidden') return t('Search is off: {vendor} refused {scopes} — enable it in the app console, publish a version, then Re-authorize', { vendor: V, scopes: (Array.isArray(v.requiredScopes) && v.requiredScopes.length ? v.requiredScopes : [v.scope || 'search:message']).join(' + ') });
      if (v.why === 'time-range-ignored') return t('Search is off: {vendor} ignored its time window — each chat is checked on its own', { vendor: V });
      // lane lark-p2p (2026-09-30): the search ANSWERS, but this version cannot read its hits — said with WHAT it could
      // not read (the owner's card said nothing while 241 260 hits were dropped as malformed)
      if (v.why === 'shape') {
        const names = [...new Set(shapeFields(v.fields).flat())];
        return names.length
          ? t("{vendor}'s search answers, but its hits have a shape this version does not read (missing or unreadable: {fields}) — the single-chat feed is off until an update; each chat is checked on its own", { vendor: V, fields: names.join(', ') })
          : t("{vendor}'s search answers, but its hits have a shape this version does not read — the single-chat feed is off until an update; each chat is checked on its own", { vendor: V });
      }
      return t('Search is off: {vendor} answered in a shape this version does not read — each chat is checked on its own', { vendor: V });
    case 'backoff': {
      const s = Math.max(1, Math.ceil((Number(v.until) - Number(now)) / 1000));
      if (v.why === 'failed') {
        // lane lark-p2p: the back-off SAYS its count, its kind and its END — "until 03:28", never a countdown the card
        // freezes at (a card is drawn once per broadcast)
        const n = Math.floor(Number(v.strikes) || 0);
        const time = clock(Number(v.until));
        // verify r1: "in a row" needs a row — a single missed answer (every lone 504, a 30 s wait) reads as "is not
        // answering — until HH:MM", never "1× in a row"
        if (n >= 2 && (!v.strikeWhy || v.strikeWhy === 'transport')) return t("{vendor}'s search did not answer {n}× in a row — each chat is checked on its own until {time}", { vendor: V, n, time });
        // verify r3: a search that ANSWERS, with something that is not a search page (the envelope judge's `envelope` strike
        // kind: a changed API, a proxy page, a captive portal), is never "not answering" — the card says what it is
        if (v.strikeWhy === 'envelope') {
          if (n >= 2) return t("{vendor}'s search answered {n}× in a row with something that is not a search page — each chat is checked on its own until {time}", { vendor: V, n, time });
          return t("{vendor}'s search answered with something that is not a search page — each chat is checked on its own until {time}", { vendor: V, time });
        }
        if (n >= 2) return t("{vendor}'s search failed {n}× in a row — each chat is checked on its own until {time}", { vendor: V, n, time });
        return t("{vendor}'s search is not answering — each chat is checked on its own until {time}", { vendor: V, time });
      }
      return t('{vendor} is limiting the search · resuming in {s} s', { vendor: V, s });
    }
    case 'never': return t('New messages: searching for the first time');
    case 'behind': return t('Search is behind — each chat is checked on its own until it catches up');
    case 'measuring': {
      const m = v.measured || {};
      // verify r1: a measurement that already HAS its samples and finds the search missing messages says so — "checking …
      // (200/200)" for ever was the card of a search that never finds everything (a 10 % blind spot, every hit unusable)
      if ((Number(m.total) || 0) >= (Number(v.promoteMin) || 200) && Number(m.rate) > PUSH_MISS_THRESHOLD) {
        return t('Search misses {missed} of {total} messages ({pct}%) — each chat is checked on its own', { missed: Number(m.missed) || 0, total: Number(m.total) || 0, pct: (Math.round(Number(m.rate || 0) * 1000) / 10).toString() });
      }
      // verify r2 (item 2 #6): the words say WHY each chat is still polled on its own — a quiet account's measurement can
      // take days to hold its 200 messages (the sample floor), and a complete one still waits one full polling cycle
      // (every conversation read once on its own) before anything relaxes; "checking … (n/200)" said neither
      const pm = Number(v.promoteMin) || 200;
      if ((Number(m.total) || 0) >= pm) return t('New messages: a search every {s} s · {missed} of {total} messages missed — each chat is still checked on its own until one full polling cycle confirms it', { s: every, missed: Number(m.missed) || 0, total: Number(m.total) || 0 });
      return t('New messages: a search every {s} s · each chat is still checked on its own until {m} messages show it finds everything ({n}/{m})', { s: every, n: Math.min(Number(m.total) || 0, pm), m: pm });
    }
    case 'carrying': return t('New messages come from a search every {s} s; each chat is also checked every {min} min', { s: every, min: Math.max(1, Math.round((Number(v.relaxedSec) || 300) / 60)) });
    case 'demoted': {
      const m = v.measured || {};
      const pct = (Math.round(Number(m.rate || 0) * 1000) / 10).toString();
      return t('Search missed {missed} of {total} messages ({pct}%) — each chat is checked on its own again', { missed: Number(m.missed) || 0, total: Number(m.total) || 0, pct });
    }
    default: return '';
  }
}
/** Hits the search returned that this version could not read, BELOW the park (lane lark-p2p): said with the fields, so
 *  a feed that drops some of what it finds is never silent. '' when none were dropped. Verify r2: the count is the LAST
 *  HOUR's (`counters.malformedRecent`, the engine's ring), never the cumulative `malformed` — two stray items in one minute
 *  used to stay on the card as "4 search hits could not be read" for ever; a view without the recent count says nothing. */
function feedUnreadableText(view, { t = defaultT } = {}) {
  const c = view && view.counters && typeof view.counters === 'object' ? view.counters : null;
  const n = c ? Math.floor(Number(c.malformedRecent) || 0) : 0;
  if (!n) return '';
  const names = [...new Set(shapeFields(c.malformedFields).flat())];
  return names.length ? t('{n} search hits could not be read in the last hour (missing or unreadable: {fields})', { n, fields: names.join(', ') }) : t('{n} search hits could not be read in the last hour', { n });
}
/**
 * THE THREAD MEASUREMENT, said (lane lark-threads A5, 2026-10-01): whether the search's hits carry a thread id at all
 * (`threadHits`), what the hits the chat reads did not find turned out to be when read one by one (`missingFetched` —
 * thread replies the search indexes; `missingRefused`; `missingOther`), and the recent-roots rechecks (`rechecks`,
 * `recheckWidened`). Unmeasured on the real vendor until the owner's instance runs — this ONE sentence is how it
 * answers. '' before the feed read a page and before any recheck.
 */
function feedThreadsText(view, { t = defaultT } = {}) {
  const c = view && view.counters && typeof view.counters === 'object' ? view.counters : null;
  if (!c) return '';
  const n = (k) => Math.max(0, Math.floor(Number(c[k]) || 0));
  const parts = [];
  if (n('pages') > 0) parts.push(n('threadHits') ? t('{n} search hits named a thread', { n: n('threadHits') }) : t('no search hit has named a thread yet'));
  const byId = n('missingFetched') + n('missingRefused') + n('missingOther');
  if (byId) parts.push(t('{f} of {n} messages the chats did not list were thread replies, read one by one', { f: n('missingFetched'), n: byId }));
  if (n('missingWaiting')) parts.push(t('{n} waiting to be read one by one', { n: n('missingWaiting') }));   // verify r2 ②: a queue the owner can see (≤ 5 a tick)
  if (n('rechecks')) parts.push(t('{n} chat checks for new threads found {w}', { n: n('rechecks'), w: n('recheckWidened') }));
  return parts.length ? t('Threads: {parts}', { parts: parts.join(' · ') }) : '';
}
/** The single-chat catch-up (§2.7), said once it ran: how many single chats the first run found. */
function feedCatchUpText(cu, { t = defaultT } = {}) {
  const c = cu && typeof cu === 'object' ? cu : null;
  if (!c) return '';
  const d = Number(c.days) || 7;
  if (!c.done) return t('Looking for single chats from the last {d} days…', { d });
  const n = Number(c.found) || 0;
  if (!n) return '';
  return c.bounded ? t('Found {n} single chats from the last {d} days — quieter ones appear with their next message', { n, d }) : t('Found {n} single chats from the last {d} days', { n, d });
}
/** What ONE Re-authorize adds (owner ruling 2026-09-28, lane lark-search-poll §5.3): every declared grant whose
 *  scopes the sign-in does not hold, the account WANTS (its option is not off), and the vendor did not refuse — ONE
 *  sentence, one verb; a scope the vendor refused at the consent is named with the console step instead.
 *  `grants` = the engine's `adapterView().grants` ([{what: 'reactions'|'feed', scopes, missing, refused, wanted}]). */
function grantsText(grants, { t = defaultT, vendor = '' } = {}) {
  const list = Array.isArray(grants) ? grants.filter((g) => g && g.wanted !== false && Array.isArray(g.missing) && g.missing.length) : [];
  if (!list.length) return { text: '', warn: false };
  const refused = [];
  const adds = [];
  for (const g of list) {
    const r = (Array.isArray(g.refused) ? g.refused : []).filter((x) => g.missing.includes(x));
    if (r.length) refused.push(...r);
    else adds.push(g.what);
  }
  // lane lark-threads (B1/B5, MEASURED): `people` = reading people's profiles (who left a chat, the nickname, the department)
  const words = { reactions: t('reading reactions'), feed: t('new-message search and single chats'), people: t('reading people\'s profiles'), files: t('sending files') };
  const parts = [];
  if (refused.length) parts.push(refusedScopeText([...new Set(refused)], { t, vendor }));
  if (adds.length) parts.push(t('One Re-authorize adds: {what}', { what: adds.map((w) => words[w] || String(w)).join(' · ') }));
  return { text: parts.join(' · '), warn: refused.length > 0 };
}
/** The words of a born conversation that has no title yet (never the raw vendor id — §3.3). */
function untitledText(kind, { t = defaultT } = {}) {
  return kind === 'dm' ? t('Single chat') : t('New conversation');
}

/** Seconds to a short human string. Deliberately tiny and local: this module
 *  imports nothing, and the panel renders whatever it is handed. */
function humanAge(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  if (n < 60) return `${Math.round(n)}s`;
  if (n < 3600) return `${Math.round(n / 60)}m`;
  if (n < 86400) return `${Math.round(n / 3600)}h`;
  return `${Math.round(n / 86400)}d`;
}

module.exports = {
  sendWhyText, threadWhyText, reactWhyText, reactReadText, refusedScopeText,
  CONV_CAPS_TTL_MS, HOST_FACTS_TTL_MS, PUSH_HEARTBEAT_MS, SCAN_SOURCE_ORDER, OFFER_WHAT,
  PUSH_MISS_THRESHOLD, PUSH_MISS_MIN_SAMPLES, PUSH_MISS_WINDOW_MS, PUSH_MISS_MIN_KEEP, PUSH_CLAIMS,
  laneState, scanState, convCapsState, offers, authState,
  identityWarning, identityWarningText, freshnessClaim, freshnessText, humanAge,
  // 2026-09-26: the per-conversation cadence, the override choices, the vendor budget + push remedies
  TIER_DEFAULTS, COLD_MAX_SEC, REFRESH_CHOICES, validRefresh, pollTier, cadenceFor, budgetText, learnedBudgetText, passStateText, firstReadText, pushUnavailableText,
  authWhyText, laneWhyText, errorCodeText, deliveryLaneText, scanSourceText, wakeRefusalText,
  pushWindow, pushSamplesAdd, pushMissRate, pushDemotionVerdict, pushLaneText,
  // lane lark-search-poll: the change feed's one lane answer + its words
  FEED_MODES, FEED_DEFAULTS, feedState, FEED_AUTHORITIES, feedAuthoritative, feedText, feedCatchUpText, grantsText, untitledText, credentialChangedAt, feedBoundSec, feedFreshMs, changeFeedRow,
  // lane lark-p2p: a shape park's bounded field lists + the unreadable-hits line; verify r1: the lone-miss bound
  shapeFields, feedUnreadableText, FEED_LOUD_STRIKES,
  // lane lark-threads (A5): the thread measurement's one sentence
  feedThreadsText,
  // lane gmail-reply-known: why a send row was not resolved (closed) + the window's foot while it is not
  CONV_CAPS_FAIL_WHYS, sendFoot,
};
