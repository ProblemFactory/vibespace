#!/usr/bin/env node
// CHANNEL CAPABILITIES (docs/design-communication-panel.zh.md §4, §6.4, §12.5;
// gate row `test-channel-caps`). The two resolvers and the three readers, each
// precedence rule driven over its own table AND its own negative control —
// because the failure mode this module exists to stop is a resolver that is
// always right in one direction (a lane that always says `live`, a `convCaps`
// that always says `unknown`) and therefore useless.
//
//   laneState   DEMOTED > LIVE > CLAIM, and `unknown` never carries content
//   scanState   FACTS FRESH > PLATFORM > CLIENT PRESENT > GRANT > 'ui', and a
//               REFUSED read is a NAMED answer, never a silent fall back
//   convCaps    a CACHE with a TTL and an honest degrade
//   offers      both halves must allow it; `unknown` ⇒ not offered + a reason
//   freshness   answers "how long ago", so it reads the clock it is HANDED
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const C = require(path.join(REPO, 'src/channel-caps.js'));
const NOW = 1789000000000;

const pushCaps = { receive: 'push', pushTransport: 'ws-long-conn', pushAckBudgetMs: 3000, pollInterval: { hot: 30, cold: 300, floor: 10 }, history: 'page', sendAs: ['user'], identityMarking: 'unknown' };
const pollCaps = { ...pushCaps, receive: 'poll', pushTransport: null };
const scanCaps = {
  receive: 'scan', pollInterval: { hot: 30, cold: 300, floor: 10 }, sendAs: [], identityMarking: 'none',
  scanSources: { darwin: 'store', win32: 'ui', linux: 'ui' },
  scanLatency: { store: 15, ui: 300 },
  historyBySource: { store: 'since', ui: 'page' },
};
const rec = (push) => ({ push: { enabled: true, state: 'live', lastEventAt: NOW - 1000, claimedExclusive: 'unknown', ...push } });

// ── ① laneState: DEMOTED > LIVE > CLAIM ──
{
  const t = [
    // [label, push record, expect {via, carryContent, live, pollCadence, why}]
    ['a claim of EXCLUSIVE on a live lane carries content and drops polling to reconcile',
      { claimedExclusive: 'exclusive' }, { via: 'push', carryContent: true, live: true, pollCadence: 'reconcile', why: 'exclusive' }],
    ['SHARED is a cursor kick, and polling stays fast',
      { claimedExclusive: 'shared' }, { via: 'push', carryContent: false, live: true, pollCadence: 'fast', why: 'kick-shared' }],
    ['UNKNOWN is the DEFAULT and it never carries content — declare nothing, get the conservative behaviour',
      { claimedExclusive: 'unknown' }, { via: 'push', carryContent: false, live: true, pollCadence: 'fast', why: 'kick-unknown' }],
    ['DEMOTED beats a live exclusive claim, and the row draws the lane it is REALLY on',
      { claimedExclusive: 'exclusive', demotedAt: NOW - 5 }, { via: 'poll', carryContent: false, live: false, pollCadence: 'fast', why: 'demoted' }],
    ['a lane silent past the heartbeat window is NOT live, whatever it claims',
      { claimedExclusive: 'exclusive', lastEventAt: NOW - C.PUSH_HEARTBEAT_MS - 1 }, { via: 'poll', carryContent: false, live: false, pollCadence: 'fast', why: 'push-dead' }],
    ['a lane that never heard anything is not live either (liveness is POSITIVE evidence)',
      { claimedExclusive: 'exclusive', lastEventAt: null }, { via: 'poll', carryContent: false, live: false, pollCadence: 'fast', why: 'push-dead' }],
    ['`state` must SAY live — a connected socket that never spoke is not evidence',
      { claimedExclusive: 'exclusive', state: 'connecting' }, { via: 'poll', carryContent: false, live: false, pollCadence: 'fast', why: 'push-dead' }],
    ['push disabled on the record = the poll lane',
      { enabled: false, claimedExclusive: 'exclusive' }, { via: 'poll', carryContent: false, live: false, pollCadence: 'fast', why: 'poll' }],
  ];
  for (const [label, p, want] of t) {
    const got = C.laneState(pushCaps, rec(p), {}, NOW);
    ok(JSON.stringify(got) === JSON.stringify(want), label, JSON.stringify(got));
  }
  ok(JSON.stringify(C.laneState(pollCaps, {}, {}, NOW)) === JSON.stringify({ via: 'poll', carryContent: false, live: false, pollCadence: 'fast', why: 'poll' }), 'a poll adapter is the poll lane');
  const scanLane = C.laneState(scanCaps, {}, {}, NOW);
  ok(scanLane.via === 'scan' && scanLane.carryContent === false, 'a SCAN pass is a batch exactly like a poll pass — it never carries content through the coalescing window (r6)');
  // NEGATIVE CONTROL for the whole precedence: a resolver reading the STATIC
  // declaration (the pre-r4 shape) answers `carryContent:true` on a demoted
  // lane — the defect `laneState` exists to make impossible.
  const preFix = (caps) => ({ carryContent: caps.pushExclusivity === 'exclusive' });
  ok(preFix({ pushExclusivity: 'exclusive' }).carryContent === true
     && C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive', demotedAt: NOW - 5 }), {}, NOW).carryContent === false,
    'NEGATIVE CONTROL: the retired per-KIND `caps.pushExclusivity` shape still carries content on a DEMOTED lane; the resolver does not');
}

// ── ② scanState: freshness > platform > client > grant > 'ui' ──
{
  const facts = (o) => ({ platform: 'darwin', clientInstalled: true, storePath: '/x/ChatStorage.sqlite', grant: 'granted', why: null, at: NOW - 1000, ...o });
  const s = (o, r = {}) => C.scanState(scanCaps, r, facts(o), NOW);

  const good = s({});
  ok(good.source === 'store' && good.history === 'since' && good.latencySeconds === 15 && good.storePath === '/x/ChatStorage.sqlite' && good.why === 'store',
    'POSITIVE CONTROL: darwin + client present + grant held resolves to the STORE — a resolver that always narrows to nothing is the same defect as one that always says unknown', JSON.stringify(good));
  ok(good.via === 'scan' && good.carryContent === false, 'scanState answers `via` so the union with laneState is EXPLICIT, never sniffed from which keys happen to exist (r6)');

  const lin = s({ platform: 'linux', storePath: null, grant: null });
  ok(lin.source === 'ui' && lin.history === 'page' && lin.latencySeconds === 300 && lin.why === 'no-store-on-platform', 'a platform declared `ui` resolves to ui with the reason, and gets ITS source\'s history mode', JSON.stringify(lin));
  ok(s({ platform: 'linux', storePath: null, grant: null, why: 'store-encrypted' }).why === 'store-encrypted', 'the adapter\'s own scanHost reason survives — "the vendor encrypted it" and "there is no client here" are different facts the wizard renders differently');

  ok(s({ grant: 'denied' }).source === null && s({ grant: 'denied' }).why === 'tcc-denied', 'a REFUSED read is a NAMED answer with source:null');
  ok(s({ grant: 'needed' }).why === 'tcc-denied' && s({ grant: 'unpromptable' }).why === 'tcc-denied', 'every not-granted state is the same named refusal');
  ok(s({ grant: 'denied' }).source !== 'ui', 'NEGATIVE CONTROL: a refused read NEVER falls back to `ui` — that would swap a 15-second lane for a 5-minute one behind the user\'s back, and the latency on the row is this whole class\'s honesty contract');
  ok(s({ clientInstalled: false }).source === null && s({ clientInstalled: false }).why === 'client-not-installed', '"not installed" is a named refusal, not an empty scan (an empty result is byte-identical to "we are not looking")');
  ok(s({ platform: 'sunos' }).source === null && s({ platform: 'sunos' }).why === 'no-source', 'a platform the adapter never declared has no lane at all');

  const stale = C.scanState(scanCaps, {}, facts({ at: NOW - C.HOST_FACTS_TTL_MS - 1 }), NOW);
  ok(stale.source === null && stale.why === 'host-facts-stale', 'host facts past their TTL are an answer about a machine at some PAST time — freshness is checked FIRST, because every level below it reads those facts');
  ok(C.scanState(scanCaps, {}, null, NOW).why === 'host-facts-stale', 'no facts at all degrades the same way');
  ok(good.hostFactsAgeSeconds === 1 && stale.hostFactsAgeSeconds > 0, 'the answer carries the AGE of the facts it resolved from, so the panel can say it');

  // the narrowing law, both directions
  ok(C.scanState(scanCaps, { scan: { chosenSource: 'ui' } }, facts({}), NOW).why === 'user-chose-ui', 'falling back to `ui` where `store` is declared is the USER\'s choice in the wizard, and it is NAMED as such');
  ok(C.scanState(scanCaps, { scan: { chosenSource: 'store' } }, facts({ platform: 'linux', storePath: null, grant: null }), NOW).source === 'ui',
    'NEGATIVE CONTROL: a choice of `store` on a platform declaring only `ui` is IGNORED — a resolution may only NARROW, or "we never verified reading that library" is undone by one optimistic answer');
  ok(C.scanState(pollCaps, {}, facts({}), NOW).source === null, 'scanState on a non-scan adapter answers nothing');
}

// ── ③ convCaps is a CACHE with a TTL ──
{
  const fresh = { read: 'yes', sendAs: ['user'], why: null, at: NOW - 60e3 };
  ok(JSON.stringify(C.convCapsState(fresh, NOW).sendAs) === '["user"]' && C.convCapsState(fresh, NOW).read === 'yes',
    'POSITIVE CONTROL: a FRESH entry still offers the control (a rule that always answers `unknown` is the same defect as no rule)');
  const old = { ...fresh, at: NOW - C.CONV_CAPS_TTL_MS - 1 };
  ok(C.convCapsState(old, NOW).read === 'unknown' && C.convCapsState(old, NOW).sendAs.length === 0 && C.convCapsState(old, NOW).why === 'stale',
    'past the TTL it degrades to unknown/[]/stale — a week-old `sendAs` cached before the user left that group would otherwise still draw the composer');
  ok(C.convCapsState(null, NOW).at === null && C.convCapsState(null, NOW).ageSeconds === null,
    'NEGATIVE CONTROL: never-asked is `at: null`, NOT the epoch — `Number(null)` is 0 and would render as an age of 56 years');
}

// ── ④ offers: both halves, and `unknown` is a reason not a permission ──
{
  const yes = { read: 'yes', sendAs: ['user'], at: NOW };
  ok(C.offers(pushCaps, yes, 'send-as-user', NOW).offered === true, 'declared AND resolved ⇒ offered');
  ok(C.offers(pushCaps, { read: 'yes', sendAs: [], why: 'left-group', at: NOW }, 'send-as-user', NOW).why === 'left-group',
    'resolved NO ⇒ not offered, with the adapter\'s own reason');
  ok(C.offers({ ...pushCaps, sendAs: [] }, yes, 'send-as-user', NOW).why === 'read-only-adapter',
    'NEGATIVE CONTROL: a read-only ADAPTER refuses even when a conversation answered optimistically — a resolution may only narrow');
  ok(C.offers(pushCaps, yes, 'send-as-bot', NOW).why === 'not-declared-for-this-identity', 'an identity the adapter never declared is refused BY NAME');
  ok(C.offers(pushCaps, null, 'send-as-user', NOW).offered === false && C.offers(pushCaps, null, 'send-as-user', NOW).why === 'unknown',
    '`unknown` renders as NOT OFFERED plus a reason — never as "allowed"');
  ok(C.offers(pushCaps, yes, 'fetch-attachment', NOW).why === 'attachments-not-fetchable' && C.offers({ ...pushCaps, attachments: 'fetch' }, yes, 'fetch-attachment', NOW).offered === true, 'attachments follow the same rule');
  ok(C.offers(pushCaps, yes, 'sell-the-company', NOW).why === 'unknown-capability', 'an unknown capability name is refused rather than guessed');
}

// ── ⑤ identityWarning: `unknown` warns exactly as loudly as `marked` ──
{
  ok(C.identityWarning({ identityMarking: 'none' }).level === 'none', 'a channel that shows the user\'s own name says nothing extra');
  ok(C.identityWarning({ identityMarking: 'marked' }).level === 'warn', 'a `marked` channel warns');
  ok(C.identityWarning({ identityMarking: 'unknown' }).level === 'warn', 'so does `unknown` — an unverified claim about whose name appears is not a reason to say nothing');
  ok(C.identityWarning({ identityMarking: 'nonsense' }).marking === 'unknown', 'an unreadable declaration is `unknown`, never `none`');
  ok(C.identityWarningText(C.identityWarning({ identityMarking: 'marked', identityMarkingText: 'Recipients see the app.' })) === 'Recipients see the app.',
    'the adapter\'s own sentence is shown VERBATIM (it is a statement about a vendor\'s UI, not product chrome)');
  ok(C.identityWarningText(C.identityWarning({ identityMarking: 'unknown' }), { t: (s) => 'ZH:' + s }).startsWith('ZH:'), 'our own fallback sentence goes through the injected translator');
  // r2: the RESOLVER returns structure and never a sentence — the server
  // calls it with no translator (it cannot have one: the digest is broadcast
  // to every client while the language is per DEVICE), so a sentence composed
  // there is English for everybody by construction.
  ok(!('text' in C.identityWarning({ identityMarking: 'unknown' })),
    'identityWarning carries NO composed sentence — `verbatim` (the adapter\'s own words) is the one string allowed on the wire', JSON.stringify(C.identityWarning({ identityMarking: 'unknown' })));
  ok(C.identityWarningText(C.identityWarning({ identityMarking: 'none' })) === '', 'a `none` channel renders no sentence at all');
}

// ── ⑥ freshnessClaim reads the clock it is HANDED ──
// Since 2026-09-26 (a linked account is an aggregated IM) there is no
// `tracked` gate: every conversation of an account is fetched, so the claim
// is the RESOLVED cadence of the row (`cadenceFor`) — hot / warm / cold by
// activity, or the owner's override — and `tracked` is ignored if a stale
// entry still carries it.
{
  const entry = { lastAt: NOW - 60e3, lane: { lastScanAt: NOW - 240e3, lastPushAt: NOW - 2000 } };
  const a = C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: true, grant: 'granted', storePath: '/x', at: NOW }, NOW), entry, NOW);
  const b = C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: true, grant: 'granted', storePath: '/x', at: NOW + 600e3 }, NOW + 600e3), entry, NOW + 600e3);
  ok(a.kind === 'scanned' && a.seconds === 240 && b.seconds === 840,
    'the SAME entry at two different `now`s gives two different ages — a resolver that cannot see a clock cannot answer "how long ago"', JSON.stringify([a, b]));
  ok(/4m/.test(C.freshnessText(a)), 'the SENTENCE carries the human age', C.freshnessText(a));

  const livePush = C.freshnessClaim(pushCaps, C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive' }), entry, NOW), entry, NOW);
  ok(livePush.kind === 'live', 'a live, content-carrying push lane says "live"');
  const demoted = C.freshnessClaim(pushCaps, C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive', demotedAt: NOW }), entry, NOW), entry, NOW);
  ok(demoted.kind === 'within' && demoted.seconds === 30,
    'NEGATIVE CONTROL: a DEMOTED push lane draws the POLL cadence it is really on (a hot row: 30 s), not the lane it declared', JSON.stringify(demoted));
  const cold = C.freshnessClaim(pollCaps, C.laneState(pollCaps, {}, {}, NOW), { lastAt: NOW - 30 * 86400e3, lane: {} }, NOW);
  ok(cold.seconds === 900, 'a cold row (no message for a month) draws the COLD tier — 15 min, the owner\'s maximum', JSON.stringify(cold));
  const legacyUntracked = C.freshnessClaim(pollCaps, C.laneState(pollCaps, {}, {}, NOW), { tracked: false, lastAt: NOW - 60e3, lane: {} }, NOW);
  ok(legacyUntracked.state === 'bound' && legacyUntracked.seconds === 30, 'a stale `tracked:false` on an entry gates NOTHING any more (every conversation is fetched)', JSON.stringify(legacyUntracked));
  const noSource = C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: false, at: NOW }, NOW), entry, NOW);
  ok(noSource.seconds === null && /not scanning/.test(C.freshnessText(noSource)), 'a scan lane with no source says so rather than printing an age for a lane that is not running');
  const paused = C.freshnessClaim(pollCaps, C.laneState(pollCaps, {}, {}, NOW), { lastAt: NOW - 60e3, refresh: { every: 'paused' }, lane: {} }, NOW);
  ok(paused.state === 'paused' && /paused/.test(C.freshnessText(paused)), 'a PAUSED override says so, never an age it will not keep', JSON.stringify(paused));
  const off = C.freshnessClaim(pollCaps, C.laneState(pollCaps, {}, {}, NOW), entry, NOW, { enabled: false });
  ok(off.state === 'off' && /not polling/.test(C.freshnessText(off)), 'a DISABLED account\'s rows say "not polling"');
}

// ── ⑥b THE CLAIM IS STRUCTURE; THE SENTENCE IS THE CLIENT'S (r2) ──
{
  const entry = { lastAt: NOW - 60e3, lane: { lastScanAt: NOW - 240e3, lastPushAt: NOW - 2000 } };
  const claims = [
    C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: false, at: NOW }, NOW), entry, NOW),
    C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: true, grant: 'granted', storePath: '/x', at: NOW }, NOW), { lane: {} }, NOW),
    C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: true, grant: 'granted', storePath: '/x', at: NOW }, NOW), entry, NOW),
    C.freshnessClaim(pushCaps, C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive' }), entry, NOW), entry, NOW),
    C.freshnessClaim(pollCaps, C.laneState(pollCaps, {}, {}, NOW), { lane: {} }, NOW),
    C.freshnessClaim(pollCaps, C.laneState(pollCaps, {}, {}, NOW), { refresh: { every: 'paused' }, lane: {} }, NOW),
  ];
  ok(claims.every((c) => !('text' in c)),
    'NO claim carries a composed sentence — the resolver answers {kind, state, seconds} and nothing else', JSON.stringify(claims[0]));
  const states = claims.map((c) => c.state);
  ok(states.includes('off') && states.includes('never') && states.includes('aged') && states.includes('live') && states.includes('bound') && states.includes('paused'),
    'every state a row can be in is produced by the table', JSON.stringify(states));
  ok(C.PUSH_CLAIMS.join() === 'exclusive,shared,unknown', 'the three claims are a closed set');
}

// ── ⑧ THE CADENCE A ROW IS POLLED AT (2026-09-26: per conversation) ──
// override > tier, clamped to [the adapter's floor, the cold tier]; hot = open
// in a window or a message in the last hour; warm = the last day; the push
// safety net drops every row to the cold tier while push carries content.
{
  const T = { hotSec: 30, warmSec: 300, coldSec: 900, hotRecentMinutes: 60, warmRecentHours: 24 };
  const poll = C.laneState(pollCaps, {}, {}, NOW);
  const cad = (entry, opts = {}) => C.cadenceFor(opts.caps || pollCaps, opts.lane || poll, entry, NOW, { tiers: T, watched: !!opts.watched });
  const table = [
    ['a message 10 min ago ⇒ hot', { lastAt: NOW - 10 * 60e3 }, {}, { tier: 'hot', seconds: 30, source: 'tier' }],
    ['open in a window, no message for a month ⇒ hot', { lastAt: NOW - 30 * 86400e3 }, { watched: true }, { tier: 'hot', seconds: 30, source: 'tier' }],
    ['a message 3 h ago ⇒ warm', { lastAt: NOW - 3 * 3600e3 }, {}, { tier: 'warm', seconds: 300, source: 'tier' }],
    ['a message 3 days ago ⇒ cold', { lastAt: NOW - 3 * 86400e3 }, {}, { tier: 'cold', seconds: 900, source: 'tier' }],
    ['never a message ⇒ cold', {}, {}, { tier: 'cold', seconds: 900, source: 'tier' }],
    ['override 60 s beats a cold tier', { lastAt: null, refresh: { every: 60 } }, {}, { seconds: 60, source: 'override' }],
    ['override 900 s beats a hot tier', { lastAt: NOW - 60e3, refresh: { every: 900 } }, {}, { seconds: 900, source: 'override' }],
    ['override paused ⇒ no timer fetch at all', { lastAt: NOW - 60e3, refresh: { every: 'paused' } }, {}, { seconds: null, source: 'override', paused: true }],
    ['push carrying content ⇒ the cold safety net for a hot row', { lastAt: NOW - 60e3 }, { caps: pushCaps, lane: C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive' }), {}, NOW) }, { seconds: 900, source: 'push-safety' }],
    ['…but the owner\'s override still wins over the safety net', { lastAt: NOW - 60e3, refresh: { every: 30 } }, { caps: pushCaps, lane: C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive' }), {}, NOW) }, { seconds: 30, source: 'override' }],
    ['a kick-only push lane keeps the tiers (push cannot guarantee completeness)', { lastAt: NOW - 60e3 }, { caps: pushCaps, lane: C.laneState(pushCaps, rec({}), {}, NOW) }, { seconds: 30, source: 'tier' }],
  ];
  for (const [label, entry, opts, want] of table) {
    const got = cad(entry, opts);
    ok(Object.entries(want).every(([k, v]) => got[k] === v), label, JSON.stringify(got));
  }
  const floor = C.cadenceFor({ ...pollCaps, pollInterval: { floor: 45 } }, poll, { lastAt: NOW - 60e3 }, NOW, { tiers: T });
  ok(floor.seconds === 45, 'the vendor floor clamps a faster tier (Gmail\'s floor is 30, a hot 10 s setting cannot go below it)', JSON.stringify(floor));
  const capped = C.cadenceFor(pollCaps, poll, {}, NOW, { tiers: { ...T, coldSec: 3600 } });
  ok(capped.seconds === C.COLD_MAX_SEC && C.COLD_MAX_SEC === 900, 'a cold setting above 15 min is clamped to 900 (the owner: "15 minutes at most")', JSON.stringify(capped));
  ok(C.REFRESH_CHOICES.join() === '30,60,300,900,paused', 'the override choices are a closed set', String(C.REFRESH_CHOICES));
  ok(C.validRefresh(60) && C.validRefresh('paused') && !C.validRefresh(45) && !C.validRefresh('fast'), 'validRefresh accepts only the declared choices');
  const dflt = C.cadenceFor(pollCaps, poll, { lastAt: NOW - 60e3 }, NOW);
  ok(dflt.seconds === 30 && dflt.tier === 'hot', 'with no tiers handed in, the design defaults apply (hot 30 / warm 300 / cold 900)', JSON.stringify(dflt));
}

// ── ⑨ THE CARD'S SENTENCES FOR PUSH AND THE BUDGET (2026-09-26) ──
{
  const t = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : String(s));
  const sdk = C.pushLaneText({ enabled: true, state: 'unavailable', lastStateCode: 'sdk-not-installed', lastStateWhy: 'the official Lark SDK (@larksuiteoapi/node-sdk) is not installed …' }, { via: 'poll' }, { t });
  ok(/npm install @larksuiteoapi\/node-sdk/.test(sdk) && /restart/.test(sdk) && /im:message\.group_msg/.test(sdk) && /polled|polling/.test(sdk), 'the SDK-missing push lane says the exact remedy (install, restart, the event subscription, the scope) and that polling carries it meanwhile', sdk);
  const g = C.pushLaneText({ enabled: true, state: 'unavailable', lastStateCode: 'push-not-configured' }, { via: 'poll' }, { t });
  ok(/topic/i.test(g) && /subscription/i.test(g), 'a Gmail push without its Pub/Sub options says which two options', g);
  const unknownCode = C.pushLaneText({ enabled: true, state: 'unavailable', lastStateCode: 'something-new', lastStateWhy: 'vendor words' }, { via: 'poll' }, { t });
  ok(/vendor words/.test(unknownCode), 'an unknown code falls back to the lane\'s own words (a new code is a new row, never silence)', unknownCode);
  const live = C.pushLaneText({ enabled: true, state: 'live', claimedExclusive: 'exclusive' }, { via: 'push', live: true, carryContent: true }, { t, coldSeconds: 900 });
  ok(/15 min|15m/.test(live), 'a live content lane names the safety-net cadence', live);
  const b = C.budgetText({ unit: 'request', limit: 60, exhausted: true, waiting: 37, resetInSeconds: 23 }, { t });
  ok(/60/.test(b) && /37/.test(b) && /23/.test(b) && /request/.test(b), 'the budget sentence names the cap, the queue and the wait', b);
  ok(C.budgetText({ unit: 'quota-unit', limit: 3000, exhausted: false }, { t }) === '', 'a budget that is not exhausted says nothing');
  ok(/quota unit/.test(C.budgetText({ unit: 'quota-unit', limit: 3000, exhausted: true, waiting: 1, resetInSeconds: 5 }, { t })), 'Gmail\'s budget is worded in quota units');
  // lane R5: the per-second figure, the vendor's rate words, the first read
  const bp = C.budgetText({ unit: 'quota-unit', limit: 3000, perSec: 40, exhausted: true, waiting: 2, resetInSeconds: 9, spentBy: { agent: 5 } }, { t });
  ok(/3000 quota units\/min/.test(bp) && /at most 40\/s/.test(bp) && /5 of them by agent/.test(bp), 'a PACED account\'s budget sentence names units/min AND units/s (and the agents\' part)', bp);
  const NOW = 1_800_000_000_000;
  const rl = (extra) => ({ lastPass: { ok: false, code: 'rate-limited' }, backoffUntil: NOW + 12_000, ...extra });
  const gr = C.passStateText(rl({ vendor: 'Google' }), { t, now: NOW });
  ok(gr.rate === true && gr.note === 'Google is limiting the rate · resuming in 12 s', 'a RATE refusal is said by the vendor\'s declared name with the wait — never "failed", never "paused"', JSON.stringify(gr));
  const zt = (s2, p) => t({ 'Feishu': '飞书', '{vendor} is limiting the rate · resuming in {s} s': '{vendor} 限速中 · {s} 秒后继续' }[s2] || s2, p);
  ok(C.passStateText(rl({ vendor: 'Feishu' }), { t: zt, now: NOW }).note === '飞书 限速中 · 12 秒后继续', 'the vendor name is a KEY the device\'s t() words (Feishu ⇒ 飞书)');
  ok(C.passStateText(rl({}), { t, now: NOW }).note === 'The vendor is limiting the rate · resuming in 12 s' && C.passStateText(rl({ vendor: 'Google', backoffUntil: NOW - 1 }), { t, now: NOW }).note === 'Google is limiting the rate · resuming at the next pass', 'no declared name ⇒ "The vendor"; a lapsed wait ⇒ "at the next pass"');
  const tr = C.passStateText({ lastPass: { ok: false, code: 'transport' }, backoffUntil: NOW + 30_000 }, { t, now: NOW });
  ok(!tr.rate && tr.note === 'transport failure — retrying in 30 s', 'any other failure keeps its code words and its retry', JSON.stringify(tr));
  const fr = (f) => C.firstReadText({ firstIngest: f }, { t });
  ok(fr({ done: 100, total: 873, etaSec: 773 }) === 'reading for the first time · 100/873 conversations · about 13 min left' && fr({ done: 870, total: 873, etaSec: 3 }) === 'reading for the first time · 870/873 conversations · under a minute left' && fr({ done: 5, total: 9, etaSec: null }) === 'reading for the first time · 5/9 conversations', 'the first read says how far and, at the pace, how long (rounded UP to whole minutes, "under a minute" below one)');
  ok(fr({ done: 873, total: 873, etaSec: 0 }) === '' && C.firstReadText(null) === '' && C.firstReadText({ firstIngest: null }) === '', 'once every conversation was read once the line is gone');
  // verify r3: past 90 minutes the wait is hours + minutes (349 min under a 100/min budget was said as "349 min")
  ok(fr({ done: 0, total: 873, etaSec: 349 * 60 }) === 'reading for the first time · 0/873 conversations · about 5 h 49 min left' && fr({ done: 0, total: 10, etaSec: 7200 }) === 'reading for the first time · 0/10 conversations · about 2 h left' && fr({ done: 0, total: 10, etaSec: 89 * 60 }) === 'reading for the first time · 0/10 conversations · about 89 min left' && fr({ done: 0, total: 10, etaSec: 90 * 60 }) === 'reading for the first time · 0/10 conversations · about 1 h 30 min left',
    'past 90 minutes the ETA says hours and minutes (349 min = "about 5 h 49 min left"; a whole hour names no minutes; 89 min stays minutes)');
  const ZH = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default;
  const zh = (s2, p) => t(ZH[s2] || s2, p);
  const zb = C.budgetText({ unit: 'quota-unit', limit: 3000, exhausted: true, waiting: 12, resetInSeconds: 30, spentBy: { agent: 400 }, perSec: 40 }, { t: zh });
  ok(zb.includes('其中 400 来自 agent 主动刷新') && !zb.includes('次是') && ZH['about {h} h {min} min left'] && ZH['about {h} h left'], `the zh budget sentence names the agents' units without 次 ("${zb}"), and the hours ETA has its zh entries`, zb);
  const pillSrc = require('node:fs').readFileSync(path.join(REPO, 'src/channel-caps.js'), 'utf-8');
  const pausedReturns = (pillSrc.match(/state: 'paused'/g) || []).length;
  ok(pausedReturns === 1 && /if \(cad\.paused\) return \{ kind: 'within', state: 'paused'/.test(pillSrc), 'the row pill\'s "paused" has ONE producer — the owner\'s own override (cadenceFor) — so a vendor\'s rate wait can never read "refresh paused"');
}

// ── ⑩ THREADS + REACTIONS (lane channel-threads, spec §2): four controls × {declared, narrowed, unknown, stale},
// the two rows through validateCaps (every refusal named), Lark's scope verdict, the new words ──
{
  const CH = require(path.join(REPO, 'src/channels/index.js'));
  const lark = require(path.join(REPO, 'src/channels/lark.js'));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const TH = { read: 'vendor', replyInto: true, listing: 'separate' };
  const RX = { read: 'list', add: true, remove: 'own', vocabulary: 'names', custom: 'none', perMessageMax: null };
  const full = { ...pollCaps, threads: TH, reactions: RX };
  const fresh = (extra = {}) => ({ read: 'yes', sendAs: ['user'], why: null, at: NOW - 1000, threads: { replyInto: true, mode: 'chat', why: null }, reactions: { read: true, add: true, why: null }, ...extra });
  const o = (caps, cc, what) => C.offers(caps, cc, what, NOW);
  ok(['thread-reply', 'react', 'unreact', 'read-reactions'].every((w) => C.OFFER_WHAT.includes(w)), 'OFFER_WHAT learns the four controls');
  // declared + resolved ⇒ offered
  ok(['thread-reply', 'react', 'unreact', 'read-reactions'].every((w) => o(full, fresh(), w).offered), 'declared AND resolved ⇒ every control offered');
  // NOT declared ⇒ never offered whatever the resolution says (the NARROW law)
  ok(o(pollCaps, fresh(), 'thread-reply').why === 'no-threads' && o(pollCaps, fresh(), 'react').why === 'no-reactions' && o(pollCaps, fresh(), 'read-reactions').why === 'no-reactions', 'an adapter that declares no row offers nothing — the resolution cannot widen it');
  ok(o({ ...full, reactions: { ...RX, remove: 'none' } }, fresh(), 'unreact').why === 'react-not-declared', 'remove none ⇒ unreact not offered by name');
  // narrowed
  ok(o(full, fresh({ threads: { replyInto: false, mode: 'chat', why: 'topic-forbidden' } }), 'thread-reply').why === 'topic-forbidden', 'a group that refused replies in threads (230071, remembered) narrows thread-reply with its reason');
  ok(o(full, fresh({ reactions: { read: false, add: true, why: 'reactions-scope-not-granted' } }), 'read-reactions').why === 'reactions-scope-not-granted' && o(full, fresh({ reactions: { read: false, add: true, why: 'reactions-scope-not-granted' } }), 'react').offered, 'reading needs its scope (not held ⇒ named), adding does not (im:message is held)');
  ok(o(full, fresh({ sendAs: [], why: 'send-scope-not-granted' }), 'thread-reply').why === 'send-scope-not-granted', 'replying into a thread is a SEND — no send identity ⇒ not offered with the send reason');
  ok(o(full, fresh({ read: 'no', why: 'not-a-member', reactions: { read: false, add: false, why: 'not-a-member' } }), 'react').why === 'not-a-member', 'not a member ⇒ no reaction control, the reason named');
  // unknown / stale / predating the rows
  ok(!o(full, null, 'react').offered && o(full, null, 'react').why === 'unknown' && o(full, null, 'thread-reply').why === 'unknown', 'no convCaps at all ⇒ `unknown`, never allowed');
  ok(o(full, fresh({ at: NOW - C.CONV_CAPS_TTL_MS - 1 }), 'read-reactions').why === 'stale', 'a stale cache ⇒ `stale`');
  const old = fresh(); delete old.threads; delete old.reactions;
  ok(o(full, old, 'thread-reply').why === 'unknown' && o(full, old, 'react').why === 'unknown', 'a fresh cache that PREDATES the rows (resolved before this lane) ⇒ not offered (the migration re-resolves it)');
  ok(C.convCapsState(fresh(), NOW).threads.replyInto === true && C.convCapsState(old, NOW).threads === null && C.convCapsState(null, NOW).reactions === null, 'convCapsState carries the narrowed rows (null when unknown)');
  // validateCaps: the two rows, every refusal named
  const good = { receive: 'poll', history: 'page', sendAs: ['user'], identityMarking: 'none' };
  const refuse = (caps, re, name) => { let m = null; try { CH.validateCaps('x', caps); } catch (e) { m = e.message; } ok(m && re.test(m), name, m); };
  ok(CH.validateCaps('x', { ...good, threads: TH, reactions: RX }) === true, 'a complete threads + reactions declaration validates');
  refuse({ ...good, sendAs: [], threads: TH }, /replyInto on a read-only adapter/, 'threads.replyInto on a sendAs:[] adapter is refused (replying into a thread is a send)');
  refuse({ ...good, reactions: { ...RX, read: 'none' } }, /add with read 'none'/, 'reactions.add with read none is refused (a control whose result can never be shown)');
  refuse({ ...good, threads: { ...TH, read: 'maybe' } }, /threads\.read must be one of/, 'an unknown threads.read is refused');
  refuse({ ...good, threads: { ...TH, listing: 'sometimes' } }, /threads\.listing must be one of/, 'an unknown threads.listing is refused');
  refuse({ ...good, reactions: { ...RX, vocabulary: 'klingon' } }, /vocabulary must be one of/, 'an unknown vocabulary is refused');
  refuse({ ...good, reactions: { ...RX, perMessageMax: 0 } }, /perMessageMax/, 'perMessageMax must be a positive integer or null');
  refuse({ ...good, reactions: { ...RX, add: false } }, /remove 'own' without add/, "remove 'own' without add is refused");
  ok(CH.METHOD_GATES.threadHistory({ threads: TH }) && !CH.METHOD_GATES.threadHistory({ threads: { ...TH, listing: 'inline' } }) && CH.METHOD_GATES.reactions({ reactions: RX }) && CH.METHOD_GATES.react({ reactions: RX }) && CH.METHOD_GATES.unreact({ reactions: RX }) && !CH.METHOD_GATES.emojiImage({ reactions: RX }) && CH.METHOD_GATES.reactionSet({ reactions: RX }) && !CH.METHOD_GATES.reactions({}), 'the six METHOD_GATES rows follow the capability rows (spec §2.1); a module with no row declares none');
  // Lark's scope verdict (capsOfScopes) — the credential-change re-judge narrows reactions like sending
  const v0 = lark.capsOfScopes(lark.SCOPES);
  ok(eq(v0.sendAs, ['user']) && v0.reactions.add === true && v0.reactions.read === false && v0.reactions.why === 'reactions-scope-not-granted', 'Lark with today\'s consent: send + ADD a reaction (im:message), READ not granted (by name)');
  const v1 = lark.capsOfScopes([...lark.SCOPES, 'im:message.reactions:read']);
  ok(v1.reactions.read && v1.reactions.add && v1.reactions.why === null, '…with im:message.reactions:read held: read + add');
  const v2 = lark.capsOfScopes(['im:chat:readonly']);
  ok(eq(v2.sendAs, []) && !v2.reactions.add && !v2.reactions.read, 'a read-only consent: neither');
  ok(lark.REACTIONS_GRANT.scopes.join() === 'im:message.reactions:read' && lark.REACTIONS_GRANT.console === true, 'the reactions grant names the scope and the console step (like sendGrant)');
  // the words
  ok(C.threadWhyText('topic-forbidden') === 'This group does not allow replies in threads' && C.reactWhyText('reactions-scope-not-granted', { scopes: ['im:message.reactions:read'] }) === 'Reactions can be read after one Re-authorize (im:message.reactions:read)' && C.reactWhyText('policy-off') === 'agent reactions are turned off for this account' && C.reactWhyText('not-a-member') === C.sendWhyText('not-a-member'), 'every new reason has words (a shared reason reuses the send sentence)');
  // owner ruling (2026-09-28): the account card's / the window's / the chips' ONE sentence for a sign-in that cannot read reactions
  {
    const S = 'im:message.reactions:read';
    const rows = [
      [{ scopes: [S], missing: [S], refused: [], wanted: true }, `Reactions can be read after one Re-authorize (${S})`],
      [{ scopes: [S], missing: [S], refused: [S], wanted: true }, `Lark refused ${S} — enable it in the app console and Re-authorize`],
      [{ scopes: [S], missing: [S], refused: [], wanted: false }, ''],
      [{ scopes: [S], missing: [], refused: [S], wanted: true }, ''],
      [null, ''],
    ];
    const got = rows.map(([g]) => C.reactReadText(g, { vendor: 'Lark' }));
    ok(rows.every(([, want], i) => got[i] === want), 'reactReadText: missing ⇒ "can be read after one Re-authorize (scope)"; refused ⇒ the vendor\'s refusal by name; the option off or nothing missing ⇒ silent', JSON.stringify(got));
    ok(C.reactWhyText('reactions-scope-not-granted', { refused: [S] }) === `The vendor refused ${S} — enable it in the app console and Re-authorize` && C.reactWhyText('reactions-scope-not-granted') === 'Reactions can be read after one Re-authorize', 'reactWhyText without a vendor / without scopes still says a whole sentence');
  }
}

// ── ⑧b THE CHANGE FEED (lane lark-search-poll, B-5aab — design §27): the ONE lane answer, its precedence, the
// relaxed cadence, the claim and the words ──
{
  const F = require(path.join(REPO, 'src/channel-feed.js'));
  const DECL = { via: 'search', scope: 'search:message', option: 'search', pageSize: 30, pagesPerPass: 5, perMin: 10, maxWindowSec: 3600, catchUp: { chatType: 'p2p', pagesMax: 20 }, describes: true };
  const feedCaps = { ...pushCaps, changeFeed: DECL };
  const HELD = ['im:message', 'search:message'];
  const acct = (o = {}) => ({ enabled: true, options: {}, auth: { scopes: HELD, scopesAt: NOW - 3600e3 }, lastAuthAt: NOW - 3600e3, push: { enabled: true, state: 'stopped', lastEventAt: null, claimedExclusive: 'unknown' }, ...o, feed: { lastOkAt: NOW - 10e3, mode: 'carrying', ...(o.feed || {}) } });
  const rows = [
    ['not declared', pushCaps, acct(), { state: 'off', why: 'not-declared', on: false, carrying: false }],
    ['the account disabled', feedCaps, acct({ enabled: false }), { state: 'off', why: 'adapter-disabled', on: false }],
    ['the owner turned the option off', feedCaps, acct({ options: { search: 'off' } }), { state: 'off', why: 'option-off', on: false }],
    ['the HELD sign-in lacks search:message (zero search requests)', feedCaps, acct({ auth: { scopes: ['im:message'] } }), { state: 'off', why: 'scope-not-granted', on: false }],
    ['the vendor refused the search scope (parked)', feedCaps, acct({ feed: { refused: { at: NOW - 60e3, code: 'forbidden', requiredScopes: ['search:message'] } } }), { state: 'refused', why: 'forbidden', on: false }],
    ['…lifted by a credential change after the refusal (a Re-authorize)', feedCaps, acct({ lastAuthAt: NOW - 1000, feed: { refused: { at: NOW - 60e3, code: 'forbidden' } } }), { state: 'carrying', on: true, carrying: true }],
    ['an ignored time window parks for 24 h…', feedCaps, acct({ feed: { refused: { at: NOW - 3600e3, code: 'time-range-ignored', retryAt: NOW + 23 * 3600e3 } } }), { state: 'refused', why: 'time-range-ignored' }],
    ['…and retries after it', feedCaps, acct({ feed: { refused: { at: NOW - 25 * 3600e3, code: 'time-range-ignored', retryAt: NOW - 3600e3 } } }), { state: 'carrying', carrying: true }],
    ['the vendor limiting the search (a back-off carries nothing)', feedCaps, acct({ feed: { backoffUntil: NOW + 30e3 } }), { state: 'backoff', why: 'rate-limited', on: true, carrying: false }],
    ['verify r1: the search NOT ANSWERING (a 5xx / a timeout — the feed\'s own failure ladder) says so', feedCaps, acct({ feed: { backoffUntil: NOW + 30e3, backoffWhy: 'failed' } }), { state: 'backoff', why: 'failed', on: true, carrying: false }],
    ['never ran', feedCaps, acct({ feed: { lastOkAt: null } }), { state: 'never', on: true, carrying: false }],
    ['behind (its last good page older than the fresh bound)', feedCaps, acct({ feed: { lastOkAt: NOW - 181e3 } }), { state: 'behind', on: true, carrying: false }],
    ['measuring', feedCaps, acct({ feed: { mode: 'measuring' } }), { state: 'measuring', on: true, carrying: false, fresh: true }],
    ['carrying (fresh + measured complete)', feedCaps, acct(), { state: 'carrying', on: true, carrying: true, fresh: true }],
    ['demoted', feedCaps, acct({ feed: { mode: 'demoted' } }), { state: 'demoted', on: true, carrying: false }],
  ];
  for (const [label, c, r, want] of rows) {
    const got = C.feedState(c, r, NOW);
    const bad = Object.entries(want).filter(([k, v]) => got[k] !== v);
    ok(!bad.length, `feedState: ${label} ⇒ ${want.state}${want.why ? ` (${want.why})` : ''}`, JSON.stringify(got));
  }
  ok(C.feedFreshMs({ everySec: 30, overlapSec: 60 }) === F.freshMs(30, 60) && C.feedFreshMs({ everySec: 120, overlapSec: 90 }) === F.freshMs(120, 90) && JSON.stringify(C.FEED_MODES) === JSON.stringify(F.MODES), 'the resolver\'s restated numbers equal the PURE feed module\'s (fresh bound, modes)');
  ok(C.credentialChangedAt({ auth: { scopesAt: 5, updatedAt: 99 }, lastAuthAt: 7 }) === 7, 'credentialChangedAt = max(scopesAt, lastAuthAt) — never the hourly refresh\'s updatedAt');
  // THE LANE PRECEDENCE: push exclusive + live > a carrying feed > today's answer
  const exclusive = acct({ push: { enabled: true, state: 'live', lastEventAt: NOW - 1000, claimedExclusive: 'exclusive' } });
  const kick = acct({ push: { enabled: true, state: 'live', lastEventAt: NOW - 1000, claimedExclusive: 'unknown' } });
  const l1 = C.laneState(feedCaps, exclusive, {}, NOW);
  const l2 = C.laneState(feedCaps, kick, {}, NOW);
  const l3 = C.laneState(feedCaps, acct({ feed: { mode: 'measuring' } }), {}, NOW);
  const l4 = C.laneState({ ...pollCaps, changeFeed: DECL }, acct(), {}, NOW, { feed: { everySec: 60, overlapSec: 90 } });
  ok(l1.pollCadence === 'reconcile' && l1.why === 'exclusive', 'laneState: a live EXCLUSIVE push lane still wins over a carrying feed (reconcile)', JSON.stringify(l1));
  ok(l2.via === 'poll' && l2.pollCadence === 'feed' && l2.why === 'feed' && l2.carryContent === false && l2.feedSeconds === 90, 'laneState: a carrying feed beats a kick-mode push lane — the poll lane at the feed cadence, claiming every + overlap (90 s)', JSON.stringify(l2));
  ok(l3.pollCadence === 'fast' && l3.why !== 'feed', 'laneState: a MEASURING feed relaxes nothing (positive evidence only)', JSON.stringify(l3));
  ok(l4.pollCadence === 'feed' && l4.feedSeconds === 150, 'laneState on a poll adapter with a feed: the settings reach the claim (60 + 90 = 150 s)', JSON.stringify(l4));
  // THE CADENCE (owner decision 4: 5 minutes; watched keeps hot; a cold row never polls MORE)
  const T = { ...C.TIER_DEFAULTS, relaxedSec: 300 };
  const hotEn = { key: 'k', lastAt: NOW - 60e3 }, warmEn = { key: 'k', lastAt: NOW - 3 * 3600e3 }, coldEn = { key: 'k', lastAt: NOW - 3 * 86400e3 };
  const c1 = C.cadenceFor(feedCaps, l2, hotEn, NOW, { tiers: T });
  const c2 = C.cadenceFor(feedCaps, l2, hotEn, NOW, { tiers: T, watched: true });
  const c3 = C.cadenceFor(feedCaps, l2, coldEn, NOW, { tiers: T });
  const c4 = C.cadenceFor(feedCaps, l2, warmEn, NOW, { tiers: { ...T, relaxedSec: 600 } });
  const c5 = C.cadenceFor(feedCaps, l2, { ...hotEn, refresh: { every: 60 } }, NOW, { tiers: T });
  const c6 = C.cadenceFor(feedCaps, l2, { ...hotEn, refresh: { every: 'paused' } }, NOW, { tiers: T, watched: true });
  ok(c1.seconds === 300 && c1.source === 'feed-safety', 'cadenceFor(feed): a hot row relaxes to the 5-min safety net', JSON.stringify(c1));
  ok(c2.seconds === 30 && c2.source === 'tier', 'cadenceFor(feed): an OPEN window keeps the hot 30 s (the index lag never slows what the owner reads)', JSON.stringify(c2));
  ok(c3.seconds === 900 && c4.seconds === 600, 'cadenceFor(feed): a cold row stays at 900 (never polled MORE); the setting moves the net (600)', JSON.stringify([c3, c4]));
  ok(c5.source === 'override' && c5.seconds === 60 && c6.paused === true, 'cadenceFor(feed): the owner\'s override and pause still win');
  // THE CLAIM
  const f1 = C.freshnessClaim(feedCaps, l2, hotEn, NOW, { tiers: T });
  const f2 = C.freshnessClaim(feedCaps, l2, hotEn, NOW, { tiers: T, watched: true });
  ok(f1.state === 'bound' && f1.seconds === 90 && f1.source === 'feed' && f2.seconds === 30, 'freshnessClaim(feed): "within 90 s" (the feed\'s bound, source feed), never the 5-min net it no longer depends on; an open window claims its 30 s', JSON.stringify([f1, f2]));
  // THE WORDS
  const w = (v) => C.feedText(v, { vendor: 'Lark', now: NOW });
  const W1 = {
    optOff: w({ state: 'off', why: 'option-off' }), scope: w({ state: 'off', why: 'scope-not-granted' }), none: w({ state: 'off', why: 'not-declared' }),
    forbidden: w({ state: 'refused', why: 'forbidden', requiredScopes: ['search:message'] }), ignored: w({ state: 'refused', why: 'time-range-ignored' }), shape: w({ state: 'refused', why: 'contract' }),
    backoff: w({ state: 'backoff', until: NOW + 12e3 }), down: w({ state: 'backoff', why: 'failed', until: NOW + 30e3 }), never: w({ state: 'never' }), behind: w({ state: 'behind' }),
    measuring: w({ state: 'measuring', everySec: 30, measured: { total: 57 } }), carrying: w({ state: 'carrying', everySec: 30, relaxedSec: 300 }),
    measuringMiss: w({ state: 'measuring', everySec: 30, promoteMin: 200, measured: { total: 760, missed: 76, rate: 0.1 } }), measuringFull: w({ state: 'measuring', everySec: 30, promoteMin: 200, measured: { total: 300, missed: 3, rate: 0.01 } }),
    demoted: w({ state: 'demoted', measured: { missed: 5, total: 60, rate: 5 / 60 } }),
  };
  const WANT = {
    optOff: 'New-message search is off — each chat is checked on its own', scope: '', none: '',
    forbidden: 'Search is off: Lark refused search:message — enable it in the app console, publish a version, then Re-authorize',
    ignored: 'Search is off: Lark ignored its time window — each chat is checked on its own',
    shape: 'Search is off: Lark answered in a shape this version does not read — each chat is checked on its own',
    backoff: 'Lark is limiting the search · resuming in 12 s', never: 'New messages: searching for the first time',
    down: 'Lark search is not answering — each chat is checked on its own · retrying in 30 s',
    behind: 'Search is behind — each chat is checked on its own until it catches up',
    measuring: 'New messages: a search every 30 s · each chat is still checked on its own until 200 messages show it finds everything (57/200)',
    carrying: 'New messages come from a search every 30 s; each chat is also checked every 5 min',
    measuringMiss: 'Search misses 76 of 760 messages (10%) — each chat is checked on its own',
    measuringFull: 'New messages: a search every 30 s · 3 of 300 messages missed — each chat is still checked on its own until one full polling cycle confirms it',
    demoted: 'Search missed 5 of 60 messages (8.3%) — each chat is checked on its own again',
  };
  const badW = Object.keys(WANT).filter((k) => W1[k] !== WANT[k]);
  ok(!badW.length, 'feedText: every state says one sentence (a missing scope says nothing here — the grants line does)', badW.map((k) => `${k}: ${JSON.stringify(W1[k])}`).join(' | '));
  // verify r3 (the revert table: r2's quiet-feed sentences lost their zh / ja entries and no gate noticed — i18n-check only
  // WARNS on a gap, the chrome census is heavy): EVERY word this module says — each `t('…')` literal in its source,
  // grep-derived — has its zh AND ja entry. CONTROL: the same judge over a dictionary missing one of them flags it.
  {
    const fsx = require('node:fs');
    const ZHd = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, JAd = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
    const csrc = fsx.readFileSync(path.join(REPO, 'src/channel-caps.js'), 'utf-8');
    const keys = new Set([...csrc.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")));
    const gaps = (zh, ja) => [...keys].filter((k) => !zh[k] || !ja[k]);
    const k0 = 'New messages: a search every {s} s · {missed} of {total} messages missed — each chat is still checked on its own until one full polling cycle confirms it';
    ok(keys.size >= 100 && keys.has(k0) && !gaps(ZHd, JAd).length, `every word channel-caps says (${keys.size} t() keys, grep-derived) has its zh AND ja entry`, gaps(ZHd, JAd).join(' | '));
    const { [k0]: _drop, ...zhLess } = ZHd;
    ok(gaps(zhLess, JAd).join('|') === k0, 'CONTROL: the judge flags a dictionary missing the quiet feed\'s sentence');
  }
  const cu = [C.feedCatchUpText({ done: false, days: 7 }), C.feedCatchUpText({ done: true, found: 4, days: 7 }), C.feedCatchUpText({ done: true, found: 20, days: 7, bounded: true }), C.feedCatchUpText({ done: true, found: 0 })];
  ok(cu[0] === 'Looking for single chats from the last 7 days…' && cu[1] === 'Found 4 single chats from the last 7 days' && cu[2] === 'Found 20 single chats from the last 7 days — quieter ones appear with their next message' && cu[3] === '', 'feedCatchUpText: in progress / found / bounded / nothing found (silent)', JSON.stringify(cu));
  const RX = 'im:message.reactions:read', S = 'search:message', P2P = 'im:message.p2p_msg:get_as_user';
  const g = (o) => C.grantsText(o, { vendor: 'Lark' });
  const G = {
    both: g([{ what: 'reactions', missing: [RX], refused: [], wanted: true }, { what: 'feed', missing: [S, P2P], refused: [], wanted: true }]),
    one: g([{ what: 'reactions', missing: [], refused: [], wanted: true }, { what: 'feed', missing: [S], refused: [], wanted: true }]),
    off: g([{ what: 'reactions', missing: [RX], refused: [], wanted: false }, { what: 'feed', missing: [S], refused: [], wanted: false }]),
    refused: g([{ what: 'reactions', missing: [RX], refused: [RX], wanted: true }, { what: 'feed', missing: [S], refused: [], wanted: true }]),
    none: g([]),
  };
  ok(G.both.text === 'One Re-authorize adds: reading reactions · new-message search and single chats' && !G.both.warn, 'grantsText: an account predating both lanes says ONE line with ONE Re-authorize', JSON.stringify(G.both));
  ok(G.one.text === 'One Re-authorize adds: new-message search and single chats' && G.off.text === '' && G.none.text === '', 'grantsText: only what is missing and WANTED (an option switched off says nothing)', JSON.stringify([G.one, G.off]));
  ok(G.refused.text === `Lark refused ${RX} — enable it in the app console and Re-authorize · One Re-authorize adds: new-message search and single chats` && G.refused.warn, 'grantsText: a scope the vendor refused at the consent is named with the console step, the rest still one Re-authorize', JSON.stringify(G.refused));
  ok(C.untitledText('dm') === 'Single chat' && C.untitledText('group') === 'New conversation' && C.laneWhyText('feed') === 'new-message search', 'a born conversation without a title is worded ("Single chat"), never its raw id; the lane reason "feed" has words');
}

// ── ⑦ the module is PURE ──
{
  const src = require('node:fs').readFileSync(path.join(REPO, 'src/channel-caps.js'), 'utf-8');
  ok(!/\brequire\(|\bimport\s/.test(src.replace(/^\s*\*.*$/gm, '')), 'src/channel-caps.js imports NOTHING (the panel, the engine and this suite all take the same rules)');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
