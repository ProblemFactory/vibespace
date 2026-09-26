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
}

// ── ⑦ the module is PURE ──
{
  const src = require('node:fs').readFileSync(path.join(REPO, 'src/channel-caps.js'), 'utf-8');
  ok(!/\brequire\(|\bimport\s/.test(src.replace(/^\s*\*.*$/gm, '')), 'src/channel-caps.js imports NOTHING (the panel, the engine and this suite all take the same rules)');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
