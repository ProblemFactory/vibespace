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
// Every entry here is TRACKED: since r3 the claim reads `entry.tracked`
// strictly, because an untracked row is one nothing will ever fetch.
{
  const entry = { tracked: true, hot: true, lane: { lastScanAt: NOW - 240e3, lastPushAt: NOW - 2000 } };
  const a = C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: true, grant: 'granted', storePath: '/x', at: NOW }, NOW), entry, NOW);
  const b = C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: true, grant: 'granted', storePath: '/x', at: NOW + 600e3 }, NOW + 600e3), entry, NOW + 600e3);
  ok(a.kind === 'scanned' && a.seconds === 240 && b.seconds === 840,
    'the SAME entry at two different `now`s gives two different ages — a resolver that cannot see a clock cannot answer "how long ago"', JSON.stringify([a, b]));
  ok(/4m/.test(C.freshnessText(a)), 'the SENTENCE carries the human age', C.freshnessText(a));

  const livePush = C.freshnessClaim(pushCaps, C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive' }), entry, NOW), entry, NOW);
  ok(livePush.kind === 'live', 'a live, content-carrying push lane says "live"');
  const demoted = C.freshnessClaim(pushCaps, C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive', demotedAt: NOW }), entry, NOW), entry, NOW);
  ok(demoted.kind === 'within' && demoted.seconds === 30,
    'NEGATIVE CONTROL: a DEMOTED push lane draws the POLL cadence it is really on, not the lane it declared (an `active` a lane lies about is worse than no lane)');
  const cold = C.freshnessClaim(pollCaps, C.laneState(pollCaps, {}, {}, NOW), { tracked: true, hot: false, lane: {} }, NOW);
  ok(cold.seconds === 300, 'a cold row draws the COLD cadence — the hot/cold fact comes from the entry, not from a guess');
  const noSource = C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: false, at: NOW }, NOW), entry, NOW);
  ok(noSource.seconds === null && /not scanning/.test(C.freshnessText(noSource)), 'a scan lane with no source says so rather than printing an age for a lane that is not running');
}

// ── ⑥b THE CLAIM IS STRUCTURE; THE SENTENCE IS THE CLIENT'S (r2) ──
// `freshnessClaim` used to compose the words, and the ingest engine called it
// with no translator — so the freshness chip, the string this feature calls
// its honesty contract, shipped ENGLISH-ONLY to a zh/ja UI. The build's
// i18n scan could not see those keys either: they left the server as DATA.
{
  const entry = { tracked: true, hot: true, lane: { lastScanAt: NOW - 240e3, lastPushAt: NOW - 2000 } };
  const claims = [
    C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: false, at: NOW }, NOW), entry, NOW),
    C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: true, grant: 'granted', storePath: '/x', at: NOW }, NOW), { tracked: true, lane: {} }, NOW),
    C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: true, grant: 'granted', storePath: '/x', at: NOW }, NOW), entry, NOW),
    C.freshnessClaim(pushCaps, C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive' }), entry, NOW), entry, NOW),
    C.freshnessClaim(pushCaps, C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive' }), entry, NOW), entry, NOW),
    C.freshnessClaim(pollCaps, C.laneState(pollCaps, {}, {}, NOW), { tracked: true, hot: false, lane: {} }, NOW),
    C.freshnessClaim({ receive: 'poll' }, C.laneState({ receive: 'poll' }, {}, {}, NOW), { tracked: true, lane: {} }, NOW),
  ];
  ok(claims.every((c) => !('text' in c)),
    'NO claim carries a composed sentence — the resolver answers {kind, state, seconds} and nothing else', JSON.stringify(claims[0]));
  const states = claims.map((c) => c.state);
  ok(states.includes('off') && states.includes('never') && states.includes('aged') && states.includes('live') && states.includes('bound') && states.includes('unknown'),
    '`state` NAMES which sentence — `kind` alone collapses "not scanning" with "not scanned yet" and "reconciling" with "polling"', states.join(','));
  // reconciling needs an exclusive push lane read as the POLL cadence
  const reconciling = C.freshnessClaim(pushCaps, { via: 'push', live: true, carryContent: false, pollCadence: 'reconcile' }, entry, NOW);
  ok(reconciling.state === 'reconciling' && reconciling.kind === 'within', 'a reconciling lane has its own state', JSON.stringify(reconciling));

  const T = (str, params) => 'ZH<' + (params ? String(str).replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : str) + '>';
  ok(claims.every((c) => C.freshnessText(c, { t: T }).startsWith('ZH<')),
    'EVERY sentence goes through the injected translator — that is the whole point of the split', claims.map((c) => C.freshnessText(c, { t: T })).join(' | '));
  ok(C.freshnessText({ kind: 'within', state: 'no-such-state' }) === 'unknown',
    'a state this renderer does not recognise says so rather than inventing a number');
  ok(C.freshnessText(null) === 'unknown', 'and so does no claim at all');
}

// ── ⑥e A ROW NOTHING WILL EVER FETCH SAYS SO (r3) ──
// Every discovered conversation is UNTRACKED by default (§5 invariant 6) and
// a disabled adapter's rows are refused by the tick and the pass alike — yet
// the claim fell through to the declared poll cadence for both, so a row that
// would never be fetched said "within 5m" on the ONE surface this feature
// calls its honesty contract. The scan lane already had the vocabulary
// (`state:'off'` → "not scanning"); poll/push now share it ("not polling").
{
  const lanePoll = C.laneState(pollCaps, {}, {}, NOW);
  const lanePush = C.laneState(pushCaps, rec({ claimedExclusive: 'exclusive' }), {}, NOW);
  const laneScan = C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: true, grant: 'granted', storePath: '/x', at: NOW }, NOW);
  const tracked = { tracked: true, lane: { lastScanAt: NOW - 60e3, lastPushAt: NOW - 1000 } };
  const untracked = { tracked: false, lane: { lastScanAt: NOW - 60e3, lastPushAt: NOW - 1000 } };

  // POSITIVE CONTROLS first — a rule that always answers `off` is the same defect.
  ok(C.freshnessClaim(pollCaps, lanePoll, tracked, NOW).state === 'bound', 'POSITIVE CONTROL: a TRACKED poll row on an ENABLED adapter still claims its cadence');
  ok(C.freshnessClaim(pushCaps, lanePush, tracked, NOW).state === 'live', 'POSITIVE CONTROL: a tracked live push row still says live');
  ok(C.freshnessClaim(scanCaps, laneScan, tracked, NOW).state === 'aged', 'POSITIVE CONTROL: a tracked scanned row still says its age');

  const u1 = C.freshnessClaim(pollCaps, lanePoll, untracked, NOW);
  ok(u1.kind === 'within' && u1.state === 'off' && u1.seconds === null && u1.why === 'untracked',
    'an UNTRACKED poll row is `off` and names why — nothing is fetched for it, so "within 5m" was a promise about a fetch that would never happen', JSON.stringify(u1));
  ok(C.freshnessText(u1) === 'not polling', 'and the sentence is "not polling" — the poll/push lanes\' spelling of the scan lane\'s "not scanning"', C.freshnessText(u1));
  const u2 = C.freshnessClaim(pushCaps, lanePush, untracked, NOW);
  ok(u2.state === 'off' && u2.kind === 'within' && u2.why === 'untracked', 'an untracked row on a LIVE push lane is off too — the lane is live, this row is not ingested (§5 invariant 6)', JSON.stringify(u2));
  const u3 = C.freshnessClaim(scanCaps, laneScan, untracked, NOW);
  ok(u3.state === 'off' && u3.kind === 'scanned' && C.freshnessText(u3) === 'not scanning', 'an untracked scan row keeps the scan lane\'s own words', JSON.stringify(u3));

  const d1 = C.freshnessClaim(pollCaps, lanePoll, tracked, NOW, { enabled: false });
  ok(d1.state === 'off' && d1.why === 'adapter-disabled', 'a row on a DISABLED adapter is off with its own reason, tracked or not', JSON.stringify(d1));
  ok(C.freshnessClaim(pollCaps, lanePoll, untracked, NOW, { enabled: false }).why === 'adapter-disabled', 'the adapter\'s silence outranks the row\'s (the widest fact wins)');
  ok(C.freshnessClaim(pollCaps, lanePoll, { hot: true, lane: {} }, NOW).why === 'untracked',
    '`tracked` is read STRICTLY: an entry without the flag models an untracked row (that is what the store mints), never a tracked one by omission');
  ok(C.freshnessClaim(scanCaps, C.scanState(scanCaps, {}, { platform: 'darwin', clientInstalled: false, at: NOW }, NOW), tracked, NOW).why === 'client-not-installed',
    'a tracked scan row with no source still carries the RESOLVER\'s reason (the r2 `off` answer, now with its why)');
  ok(['off', 'never', 'aged', 'live', 'reconciling', 'unknown', 'bound'].every((s) => C.freshnessText({ kind: 'within', state: s }) !== ''), 'every state still renders a sentence');
}

// ⑥e NEGATIVE CONTROL — the shipped module minus its two gates (the r2
// shape) must claim "within 5m" on an untracked row and on a disabled
// adapter. The module imports nothing, so the copy lives in a scratch dir.
{
  const fsx = require('node:fs');
  const os = require('node:os');
  const src = fsx.readFileSync(path.join(REPO, 'src/channel-caps.js'), 'utf-8');
  const PRE = src.replace("  if (!enabled) return off('adapter-disabled');\n  if (!(entry && entry.tracked === true)) return off('untracked');\n", '');
  ok(PRE !== src, 'NEGATIVE CONTROL setup: the ungated r2 claim was reconstructed from the shipped bytes');
  const dir = fsx.mkdtempSync(path.join(os.tmpdir(), 'vs-chan-caps-pre-'));
  const pf = path.join(dir, 'channel-caps.prefix.js');
  fsx.writeFileSync(pf, PRE);
  try {
    const P = require(pf);
    const lanePoll = P.laneState(pollCaps, {}, {}, NOW);
    const u = P.freshnessClaim(pollCaps, lanePoll, { tracked: false, lane: {} }, NOW);
    ok(u.state === 'bound' && u.seconds === 300, 'NEGATIVE CONTROL: the r2 claim says "within 5m" on a row nothing will ever fetch', JSON.stringify(u));
    ok(P.freshnessClaim(pollCaps, lanePoll, { tracked: true, lane: {} }, NOW, { enabled: false }).state === 'bound', 'NEGATIVE CONTROL: …and on a DISABLED adapter');
  } finally { fsx.rmSync(dir, { recursive: true, force: true }); }
}

// ── ⑥c THE NINE SENTENCES HAVE zh + ja ENTRIES ──
// They are produced HERE (the extractor walks src/), but they used to be
// composed server-side and shipped as data, which is why they were missing.
{
  const fsx = require('node:fs');
  const zh = fsx.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf-8');
  const ja = fsx.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf-8');
  const src = fsx.readFileSync(path.join(REPO, 'src/channel-caps.js'), 'utf-8');
  const keys = [...new Set([...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]))];
  const missing = keys.filter((k) => !zh.includes(`"${k}"`) || !ja.includes(`"${k}"`));
  ok(keys.length >= 9, 'the census found this module\'s human-visible strings', String(keys.length));
  ok(!missing.length, 'every sentence this PURE module composes has a zh AND a ja entry', JSON.stringify(missing));
}

// ── ⑥d authState: 'connected' is a RESOLUTION, never an assertion (r2) ──
// The digest used to publish `rec.auth?.expiresAt ? 'connected' : 'connected'`
// — a ternary whose two branches are the same string — so an expired or
// never-authenticated adapter was announced to the panel as connected.
{
  const A = (auth, lastPass) => C.authState({ auth, lastPass }, NOW);
  ok(A({ tokenEnc: null, expiresAt: null, scopes: [] }).state === 'unknown',
    'an adapter that has never authenticated is `unknown`, never `connected` (the P0a fakes talk to nothing, and saying so is the point)');
  ok(A({ tokenEnc: 'x', expiresAt: NOW + 60e3 }).state === 'connected', 'a live token is connected');
  ok(A({ tokenEnc: 'x', expiresAt: NOW - 1 }).state === 'expired', 'a PASSED expiry is expired — a claim about the future is believed only once it has arrived');
  ok(A({ tokenEnc: 'x', expiresAt: NOW + 7 * 86400e3 }, { at: NOW, ok: false, code: 'auth-expired' }).state === 'expired',
    'THE LAST PASS OUTRANKS THE STAMP: a revoked or rotated credential carries a perfectly future expiry, and the vendor refusing us is measured evidence');
  ok(A({ tokenEnc: 'x', expiresAt: NOW + 60e3 }, { at: NOW, ok: false, code: 'transport' }).state === 'connected',
    'NEGATIVE CONTROL: a NON-auth failure says nothing about the credential');
  ok(A({ tokenEnc: null, expiresAt: null, scopes: ['fake'] }).state === 'connected',
    'scopes alone count as a credential — "we hold something" is the question, not "which field holds it"');
  ok(A({ expiresAt: NOW - 1 }).why === 'token-expired' && A({}).why === 'never-authenticated', 'every answer NAMES its reason');
}

// ── ⑦ the module is PURE ──
{
  const src = require('node:fs').readFileSync(path.join(REPO, 'src/channel-caps.js'), 'utf-8');
  ok(!/\brequire\(|\bimport\s/.test(src.replace(/^\s*\*.*$/gm, '')), 'src/channel-caps.js imports NOTHING (the panel, the engine and this suite all take the same rules)');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
