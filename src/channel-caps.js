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
function pushLaneText(push, lane, { t = defaultT, now = null } = {}) {
  const p = push || {};
  const l = lane || {};
  const pct = (r) => (Math.round(Number(r) * 1000) / 10).toString();
  if (p.enabled === false) return p.optIn ? t('push off (available — turn it on under Push…)') : t('push off');
  if (p.demotedAt) {
    const d = p.demoted || {};
    return t('push is not exclusive here — fell back to cursor kicks, polling returned to the fast cadence ({missed} of {total} records, {pct}%, were first seen by the reconciliation poll)', { missed: d.missed || 0, total: d.total || 0, pct: pct(d.rate || 0) });
  }
  if (p.state === 'unavailable') return t('push unavailable: {why}', { why: p.lastStateWhy || t('unknown') });
  if (!p.state) return t('push not started');
  if (l.via === 'push' && l.live && l.carryContent) return t('push live — carrying messages (declared exclusive); the poll reconciles every 15 min');
  if (l.via === 'push' && l.live) return p.claimedExclusive === 'shared' ? t('push live — cursor kicks only (declared shared)') : t('push live — cursor kicks only (exclusivity not declared)');
  // Connected but silent past the heartbeat window: the resolver reads it as
  // dead (positive evidence only) and polling is back at the fast cadence.
  if (p.state === 'live' && l.why === 'push-dead') {
    const age = num(p.lastEventAt) !== null && num(now) !== null ? humanAge(ageS(p.lastEventAt, Number(now))) : '';
    return age ? t('push silent for {age} — polling at the fast cadence until it speaks', { age }) : t('push silent — polling at the fast cadence until it speaks');
  }
  return t('push {state} — polling at the fast cadence', { state: p.state });
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
function laneState(caps, adapterRecord, entry, now) {
  const c = caps || {};
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
    return { state: 'needs-credentials', why: adapterState.why || 'no-credentials', expiresAt: null, missing: Array.isArray(adapterState.missing) ? adapterState.missing.slice() : [] };
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
  if (!e || at === null || now - at > ttlMs) return { read: 'unknown', sendAs: [], why: e ? 'stale' : 'unknown', at: at, ageSeconds: ageS(at, now) };
  const read = ['yes', 'no', 'unknown'].includes(e.read) ? e.read : 'unknown';
  return { read, sendAs: Array.isArray(e.sendAs) ? e.sendAs.slice() : [], why: e.why || null, at, ageSeconds: ageS(at, now) };
}

/** The reasons a control is not offered, in the order they are checked. */
const OFFER_WHAT = ['send-as-user', 'send-as-bot', 'fetch-attachment', 'read'];

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
  if (what === 'fetch-attachment') {
    if (c.attachments !== 'fetch') return { offered: false, why: 'attachments-not-fetchable' };
    return resolved.read === 'yes' ? { offered: true, why: null } : { offered: false, why: resolved.why || 'unknown' };
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
    case 'send-scope-not-granted': return t('sending needs the send permission on the connected app — reconnect (Connect again) to request it; on Lark that also means enabling im:message + im:message.send_as_user and publishing a version');
    case 'read-only-adapter': return t('this channel is read-only');
    case 'read-only-mailbox': return t('this conversation is read-only');
    case 'not-a-member': return t('you are not a member of this conversation');
    case 'left-group': return t('you left this conversation');
    case 'bot-not-in-chat': return t('the bot is not in this chat');
    case 'not-declared-for-this-identity': return t('this identity cannot send on this channel');
    case 'stale': return t('the send capability has not been re-checked recently');
    case 'unknown': return t('the send capability is not known yet');
    default: return String(why);
  }
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
 * A ROW NOTHING WILL EVER FETCH SAYS SO (r3). Every discovered conversation is
 * UNTRACKED by default (§5 invariant 6: nothing is ingested until the user
 * tracks it — and untracked is all P0a ever shows until someone clicks), and a
 * disabled adapter's rows are refused by the tick and the pass alike. The
 * claim used to fall through to the declared poll cadence for both, so a row
 * that would never be fetched said "within 5m" — a promise about a fetch that
 * would not happen, on the ONE surface this feature calls its honesty
 * contract. Both facts are in the caller's hands at digest time
 * (`entry.tracked`, the adapter row's `enabled`), so they are INPUTS here: the
 * answer is the lane's own `off` vocabulary, which the scan lane already had
 * for "no source" and which `freshnessText` now renders as "not polling" for
 * every other lane. `why` names the silencing fact — contract, not prose —
 * and `tracked` is read STRICTLY (`=== true`): a fixture that forgets the flag
 * models an untracked row, because that is what the store mints.
 */
function freshnessClaim(caps, laneOrScan, entry, now, { enabled = true } = {}) {
  const c = caps || {};
  const l = laneOrScan || {};
  const lane = (entry && entry.lane) || {};
  const off = (why) => ({ kind: l.via === 'scan' ? 'scanned' : 'within', state: 'off', seconds: null, why });

  if (!enabled) return off('adapter-disabled');
  if (!(entry && entry.tracked === true)) return off('untracked');

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
  // carried by polling, so the claim is the POLL cadence for this row's own
  // heat, not the lane the adapter declared.
  if (l.pollCadence === 'reconcile') return { kind: 'within', state: 'reconciling', seconds: null };
  const hot = !!(entry && (entry.hot || entry.assignment));
  const pi = c.pollInterval || {};
  const secs = num(hot ? pi.hot : pi.cold);
  if (secs === null) return { kind: 'within', state: 'unknown', seconds: null };
  return { kind: 'within', state: 'bound', seconds: secs };
}

/** The sentence for a `freshnessClaim`. ONE producer per string, and the
 *  `t()` literals live here so the extractor finds them — but it is called
 *  from the CLIENT, which is the only place that knows the language. A claim
 *  whose `state` we do not recognise says so; it never guesses a number. */
function freshnessText(claim, { t = defaultT } = {}) {
  const f = claim || {};
  const age = () => humanAge(f.seconds);
  switch (f.state) {
    // `off` is one state with two lanes' words: a scan lane that is not
    // reading and a poll/push row nothing polls (untracked, or its adapter
    // disabled) are the same claim — no evidence is being gathered — so the
    // kind picks the verb and the state picks the sentence.
    case 'off': return f.kind === 'scanned' ? t('not scanning') : t('not polling');
    case 'never': return t('not scanned yet');
    case 'aged': return t('scanned {age} ago', { age: age() });
    case 'live': return t('live');
    case 'reconciling': return t('reconciling');
    case 'unknown': return t('polling');
    case 'bound': return t('within {age}', { age: age() });
    default: return t('unknown');
  }
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
  sendWhyText,
  CONV_CAPS_TTL_MS, HOST_FACTS_TTL_MS, PUSH_HEARTBEAT_MS, SCAN_SOURCE_ORDER, OFFER_WHAT,
  PUSH_MISS_THRESHOLD, PUSH_MISS_MIN_SAMPLES, PUSH_MISS_WINDOW_MS, PUSH_MISS_MIN_KEEP, PUSH_CLAIMS,
  laneState, scanState, convCapsState, offers, authState,
  identityWarning, identityWarningText, freshnessClaim, freshnessText, humanAge,
  pushWindow, pushSamplesAdd, pushMissRate, pushDemotionVerdict, pushLaneText,
};
