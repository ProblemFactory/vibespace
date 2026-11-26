#!/usr/bin/env node
// B-87fd item (1), A RESUME IS A START (主开发 r4986): THE REAL ENGINE's CHOOSER — src/server/usage-pool-engine.js poolChooserForModel, the
// entry every spawn and every resume asks — for every kind of start a person makes: a model sent (a new conversation), a hint only (a
// resume by hand or one of a resume-all: no model, the instance default stands in), and no family at all. The pool's default BILLS
// PAID OVERAGE; beside an ordinary member that can serve now under the settle bar (5h 11 %) EVERY start lands on that member. Beside
// an ordinary member whose Fable cap is spent (its other buckets fine), a start that NAMED its family (opus) lands on it; a guessed or
// unknown family is judged FAIL CLOSED (every bucket the guess could mean) and stays on the default. A default that does not pay
// keeps the release's answer. RED: 17f782574's chooser in a copy (a hint ⇒ no placing; no family ⇒ the default before any decision).
// B-6a92's line «stays on the pool's default … held on another account's weekly instant» is said only for a start that STAYS: asked
// after the decision, since a start with no family on a held default that PAYS is placed too. RED: the line asked before it, in a copy.
// THE PIN ROAD (主开发 r5067): a start PINNED to a member that cannot serve (its weekly cap spent, lapsed, its sign-in dead, gone from
// the pool) is placed by the same law — every kind lands on the ordinary member; a pin that CAN serve is honoured, a paying one too.
// RED: 8a1ade3b7's pin block (the pinned placement asked on its own), in a copy. THE CENSUS: every return of the chooser, named.
// Every account and token is made up; the world is a temp folder; nothing is spawned.
import { scratchDir, anchored } from './scratch.mjs';   // FIRST of the lib imports (B-ba47): the suite runs on a temp home of its own
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ck = (n, c, detail) => { if (typeof c !== 'boolean') throw new TypeError(`ck() was handed a ${typeof c} as its condition: ${n}`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (detail === undefined ? '' : ' — ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600))); } };
const caught = async (fn) => { const o = console.log, w = console.warn, e = console.error; const lines = []; console.log = (...a) => { lines.push(a.map(String).join(' ')); }; console.warn = () => { }; console.error = () => { }; try { return { r: await fn(), lines }; } finally { console.log = o; console.warn = w; console.error = e; } };
const quiet = async (fn) => { const o = console.log, w = console.warn, e = console.error; console.log = () => { }; console.warn = () => { }; console.error = () => { }; try { return await fn(); } finally { console.log = o; console.warn = w; console.error = e; } };
const M = mutantCopies('pool-paying-start', REPO);
const readingLag = require(path.join(REPO, 'src/reading-lag.js'));
const NOW = Date.now(), S = Math.floor(NOW / 1000), H = 3600e3;
const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: ['tok', id].join('-'), refreshToken: ['r', id].join('-'), expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
// a reading: 5h and 7d utilization, a Fable cap's when given, and the producer's stated overage (paid overage IN USE, dated now)
const reading = ({ u5 = 0.1, u7 = 0.4, fable = null, paying = false } = {}) => ({
  fetchedAt: NOW - 60e3, source: 'on-demand',
  fiveHour: { utilization: u5, resetsAt: S + 2 * 3600 }, sevenDay: { utilization: u7, resetsAt: S + 4 * 86400 },
  scopedWeekly: fable == null ? [] : [{ name: 'Fable', utilization: fable, resetsAt: S + 4 * 86400 }],
  ...(paying ? { overage: { inUse: true, asOf: NOW - 60e3, status: 'allowed' } } : {}),
});

// the PINNED member X's scene: its reading by kind (lapsed: a serve record after its reading; signed out: no credentials file; outside:
// signed in, healthy, not a member of the pool — a member since removed)
const PIN_READ = { spent: { u5: 0.1, u7: 0.99 }, lapsed: { u5: 0.1, u7: 0.4 }, 'signed-out': { u5: 0.1, u7: 0.4 }, outside: { u5: 0.1, u7: 0.4 }, 'serves-paying': { paying: true, u5: 0.1, u7: 0.4 } };
// THE WORLD: the real AccountManager and the real pool engine over a temp data folder; the default D and one other member O. `held`:
// D HELD by B-6a92's same-instant check (scripts/test-reading-truth.mjs's recipe): D and Z, an account outside the pool, on ONE weekly
// instant to the second, neither proven; the engine's boot repair holds them
function world(engMod, { d, o, held = false, pinned = null }) {
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const root = scratchDir('pool-paying-start'), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache');
  const am = new AccountManager({ dataDir });
  const id = {};
  for (const tag of ['D', 'O', ...(held ? ['Z'] : []), ...(pinned ? ['X'] : [])]) { id[tag] = am.createSubscription({ name: 'acct-' + tag.toLowerCase() }).id; if (!(tag === 'X' && pinned === 'signed-out')) fs.writeFileSync(path.join(am.subDir(id[tag]), '.credentials.json'), CREDS(id[tag]), { mode: 0o600 }); }
  const P = am.createPool({ name: 'pool-start', members: [id.D, id.O, ...(pinned && pinned !== 'outside' ? [id.X] : [])] }).id;
  am.setPoolTarget(P, id.D); am.updatePool(P, { auto: true, hot: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, id.D + '.json'), JSON.stringify(reading(d)));
  fs.writeFileSync(path.join(cacheDir, id.O + '.json'), JSON.stringify(reading(o)));
  if (pinned) {
    fs.writeFileSync(path.join(cacheDir, id.X + '.json'), JSON.stringify(reading(PIN_READ[pinned])));
    if (pinned === 'lapsed') am.setServeState(id.X, { state: 'lapsed', since: NOW - H, why: 'made-up lapse words', lastFail: NOW });
  }
  if (held) {
    const INST = S + 4 * 86400 + 7 * 3600 + 17;
    for (const k of [id.D, id.Z]) {
      fs.writeFileSync(path.join(cacheDir, readingLag.windowSidecarName(k)), JSON.stringify({ sevenDay: INST, fiveHour: null, scoped: {}, at: NOW - 60e3, source: 'api', verifiedAt: NOW - 60e3, verifiedBy: 'rate-limit-events', n: 3, producer: 'login' }));
      fs.writeFileSync(path.join(cacheDir, readingLag.apiWindowSidecarName(k)), JSON.stringify({ sevenDay: INST, scoped: {}, at: NOW - 60e3, sessionId: null, source: 'rate-limit-events', n: 3, ring: [] }));
      const r = reading(k === id.D ? d : { u5: 0.2, u7: 0.3 }); r.sevenDay.resetsAt = INST; r.source = 'cli-usage';
      fs.writeFileSync(path.join(cacheDir, k + '.json'), JSON.stringify(r));
    }
  }
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const autoResume = { armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { }, statusFor: () => null };
  const eng = engMod.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice: () => { }, serverSetting: () => undefined, getAccounts: () => am,
    getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
    getAutoResume: () => autoResume, getQuotaProbe: () => null, getSessionMetaStore: () => null,
  });
  if (app.locals.usageEstimator) app.locals.usageEstimator.predictVerdict = () => ({ state: 'off', n: 0 });   // the raw readings: no estimate in the way
  if (held) { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { eng.repairIdentityAnchors('boot'); } finally { console.log = o; console.warn = w; } }   // the boot's warm: the standing check holds D (and Z)
  const tagOf = (x) => Object.keys(id).find((k) => id[k] === x) || x;
  return { eng, P, id, tagOf };
}
// THE THREE KINDS OF START, as the callers hand them (src/ws-create.js: hinted = !data.model, the model = data.model || the hint)
const OPUS = 'claude-opus-4-1';
const STARTS = [
  ['a new conversation (a model sent)', { model: OPUS }],
  ['a resume (a hint only: the instance default stands in)', { model: OPUS, hinted: true }],
  ['a start with no family', { model: undefined }],
];
const startsOn = async (engMod, scene) => { const out = []; for (const [n, opts] of STARTS) { const w = world(engMod, scene); const r = await quiet(() => w.eng.poolChooserForModel(w.P, opts)); out.push([n, w.tagOf(r)]); } return out; };

const ENG_REL = 'src/server/usage-pool-engine.js';
const engSrc = fs.readFileSync(path.join(REPO, ENG_REL), 'utf8');
const ENG = require(path.join(REPO, ENG_REL));
const PAYING_D = { paying: true, u5: 0.1, u7: 0.4 };
{ // 1. beside an ordinary member that can serve NOW under the settle bar (5h 11 %): every start lands on it
  const scene = { d: PAYING_D, o: { u5: 0.89, u7: 0.4 } };
  const got = await startsOn(ENG, scene);
  ck(`every kind of start on a paying default lands on the ordinary member that can serve now (${got.map(([n, t]) => `${n.split(' (')[0]} → ${t}`).join('; ')})`, got.every(([, t]) => t === 'O'), got);
}
{ // 2. beside an ordinary member whose FABLE cap is spent (its 5h and 7d fine): a named family (opus) lands on it; a guess stays — fail closed
  const scene = { d: PAYING_D, o: { u5: 0.1, u7: 0.4, fable: 0.99 } };
  const got = Object.fromEntries(await startsOn(ENG, scene));
  ck(`a start that NAMED its family (opus) lands on the member whose spent cap is another family's (→ ${got[STARTS[0][0]]})`, got[STARTS[0][0]] === 'O', got);
  ck(`a resume's hint and a start with no family are judged FAIL CLOSED on every bucket: the default stands (→ ${got[STARTS[1][0]]}, ${got[STARTS[2][0]]})`, got[STARTS[1][0]] === 'D' && got[STARTS[2][0]] === 'D', got);
}
{ // 3. a default that does NOT pay keeps the release's answer: a hint or no family stays on a healthy default
  const scene = { d: { u5: 0.1, u7: 0.4 }, o: { u5: 0.1, u7: 0.2 } };
  const got = await startsOn(ENG, scene);
  ck(`a default that does not pay keeps the release's answer for every kind of start (${got.map(([, t]) => t).join(', ')})`, got.every(([, t]) => t === 'D'), got);
}
{ // 4. B-6a92's line for a start with no family on a HELD default («stays on the pool's default …, held on another account's weekly
  // instant … names no model family to choose another member by») is said only when the start STAYS: on a held default that PAYS
  // such a start is placed off it (fail closed, every bucket), and it is never told it stays
  const STAYS = /stays on the pool's default .*held on another account's weekly instant/;
  const heldStart = async (engMod, d, opts = { model: undefined }) => { const w = world(engMod, { d, o: { u5: 0.1, u7: 0.2 }, held: true }); const { r, lines } = await caught(() => w.eng.poolChooserForModel(w.P, opts)); return { to: w.tagOf(r), said: lines.some((l) => STAYS.test(l)) }; };
  const ctl = await heldStart(ENG, { u5: 0.1, u7: 0.4 });
  ck(`CONTROL FIRST: a start with no family on a HELD default that does not pay stays on it, and the line says so (→ ${ctl.to}, said: ${ctl.said})`, ctl.to === 'D' && ctl.said, ctl);
  const got = await heldStart(ENG, PAYING_D);
  ck(`a start with no family on a held default that PAYS is placed off it, and is never told it stays (→ ${got.to}, said: ${got.said})`, got.to === 'O' && !got.said, got);
  // …and every other kind of start too: a held default that pays is judged as one read (the placing law binds every start, r4986)
  const kinds = []; for (const [n, opts] of STARTS.slice(0, 2)) kinds.push([n.split(' (')[0], (await heldStart(ENG, PAYING_D, opts)).to]);
  ck(`a new conversation and a resume on a held default that PAYS are placed off it too (${kinds.map(([n, t]) => `${n} → ${t}`).join('; ')})`, kinds.every(([, t]) => t === 'O'), kinds);
  // RED: the line asked BEFORE the decision, as 85bc67492 asked it (built from this tree's line: a tree without it cannot build it, and says so)
  let early = null;
  try { early = anchored(engSrc, 'if (!(d && d.to) && !fam && !staleDefault && heldForPool(cur) && ', 'if (!fam && !staleDefault && heldForPool(cur) && ', 'the held line asked before the decision'); } catch (e) { ck('RED CONTROL built (the held line asked before the decision)', false, String(e && e.message).slice(0, 200)); }   // stale-pins: kept (the RED's text IS 85bc67492's condition)
  if (early) { const red = await heldStart(M.load(ENG_REL, early, 'held-early'), PAYING_D); ck(`RED (the line asked before the decision): the start placed off the paying held default is told it stays (→ ${red.to}, said: ${red.said})`, red.to === 'O' && red.said, red); }
}
let pinTip = null;   // 8a1ade3b7's pin block in a copy (scene 5 builds it; the census reads it)
{ // 5. THE PIN ROAD (主开发 r5067): a resumed conversation PINNED to a member that cannot serve, beside a paying default and the ordinary
  // member «low» (scene 1's): every kind of start lands on the ordinary member — a pin that cannot serve is no pin for the placing
  const PINS = [['whose weekly cap is spent', 'spent'], ['that has lapsed', 'lapsed'], ['whose sign-in is dead', 'signed-out'], ['gone from the pool', 'outside']];
  const pinStarts = async (engMod, kind) => { const out = []; for (const [n, opts] of STARTS) { const w = world(engMod, { d: PAYING_D, o: { u5: 0.89, u7: 0.4 }, pinned: kind }); const r = await quiet(() => w.eng.poolChooserForModel(w.P, { ...opts, pin: w.id.X })); out.push([n.split(' (')[0], w.tagOf(r)]); } return out; };
  const say = (got) => got.map(([n, t]) => `${n} → ${t}`).join('; ');
  for (const [n, kind] of PINS) { const got = await pinStarts(ENG, kind); ck(`every kind of start PINNED to a member ${n} lands on the ordinary member that can serve now, never the paying default (${say(got)})`, got.every(([, t]) => t === 'O'), got); }
  const kept = await pinStarts(ENG, 'serves-paying');
  ck(`CONTROL: a pin that CAN serve is honoured whatever it costs — a pin to a member that pays, every kind of start (${say(kept)})`, kept.every(([, t]) => t === 'X'), kept);
  // RED: 8a1ade3b7's pin block — the pinned placement asked on its own (its automatic rules carry no start's mark), in a copy
  try { pinTip = anchored(engSrc, "      const dp = require('../account-pool-auto.js').decideStart({ family: fam, hinted, baseReadCache: base, pin, currentId: cur,", '      const dp = decidePinnedPlacement({ explicit: true, pin, currentId: cur,', "8a1ade3b7's pin block"); } catch (e) { ck('RED CONTROL built (8a1ade3b7\'s pin block)', false, String(e && e.message).slice(0, 200)); }   // stale-pins: kept (the RED's text IS 8a1ade3b7's pin call)
  if (pinTip) {
    const pinEng = M.load(ENG_REL, pinTip, 'pin-tip'), red = [];
    for (const [n, kind] of PINS) for (const [s, t] of await pinStarts(pinEng, kind)) red.push([`${kind}: ${s}`, t]);
    ck(`RED (8a1ade3b7's pin block): every start pinned to a member that cannot serve lands on the PAYING default (${say(red)})`, red.every(([, t]) => t === 'D'), red);
  }
}
{ // THE CHOOSER CALLS THE ONE ENTRY: its decision is decideStart's, with the start's family, its hint and the bare reading; no
  // decidePoolSwitch of its own and no `placing: !hinted` beside it — the leg's start kinds and the chooser cannot part again
  const body = (t) => { const i = t.indexOf('\nfunction poolChooserForModel('); const j = t.indexOf('\nfunction ', i + 10); return i < 0 ? '' : t.slice(i, j < 0 ? undefined : j); };
  // THE CENSUS (主开发 r5067): EVERY return of the chooser, in its order, named — a new one breaks it until it is named here
  const RETURNS = [
    ['return null;', 'not a pooled account'],
    ['return rec;', "the create's question: the record a move onto a fallback left (no placement)"],
    ['return null;', "the store's peek: nothing to peek at"],
    ['return to && /^pv-/.test(String(to)) && memberCanServe(poolId, to, null, null, Date.now(), hinted ? null : fam) ? to : null;', "the store's peek: the fallback provider the conversation was moved to, when it can serve"],
    ['return to;', 'the cold move lands: the member a cross-provider move already chose, while it can serve'],
    ['return pin;', 'the pin road (decideStart): a pin that can serve, honoured'],
    ['return dp.to;', "the pin road (decideStart): the pinned placement's target"],
    ['return memberServeLapsed(cur) ? fallbackDefaultTarget(poolId, cur) : cur;', 'the pin road (decideStart) named no target: the default, never a lapsed one'],
    ['return null;', 'the move back fails closed: no family, or a lapsed default'],
    ['return fallbackDefaultTarget(poolId, cur);', 'the lapsed-default guard, before the entry'],
    ['return cur;', "the entry's null: no family on a default that does not pay (the release)"],
    ['return null;', 'the move back: a proving pick is no place to come back to'],
    ['return placed && !claimDecided(placed, () => { const b = chooseNow();', "the move back: decideStart's target, unless a claim decided it"],
    ['return (b && b.to) || cur;', "the move back's counterfactual: decideStart over the bare door"],
    ['return (b && b.to) || cur;', "the spawn's counterfactual: decideStart over the bare door"],
    ['return (d && d.to) || (staleDefault ? ((d && d.holdTo) || fallbackDefaultTarget(poolId, cur) || null) : cur);', "the entry's decision (decideStart)"],
    ['return null;', 'the chooser failed: the default target'],
  ];
  const wired = (t) => { const b = body(t); const rets = [...b.matchAll(/\breturn\b[^;\n]*;?/g)].map((m) => m[0]); return JSON.stringify(rets) === JSON.stringify(RETURNS.map(([x]) => x)) && (b.match(/decideStart\(\{/g) || []).length === 2 && /const dp = require\('\.\.\/account-pool-auto\.js'\)\.decideStart\(\{ family: fam, hinted, baseReadCache: base, pin, currentId: cur,/.test(b) && /const chooseNow = \(\) => decideStart\(\{ family: fam, hinted, defaultStale: staleDefault, baseReadCache: base, currentId: cur,/.test(b) && !/decidePoolSwitch\(|decidePinnedPlacement\(/.test(b) && (b.match(/decideStart\(\{[^\n]*readReading: poolReadReading\(\),/g) || []).length === 2 && !/placing: !hinted/.test(b) && /if \(!d && !fam && !staleDefault\) return cur;/.test(b); };   // stale-pins: kept (the RED's text IS 17f782574's chooser)
  ck(`THE CENSUS: every return of the chooser is named (${RETURNS.length}), and every decision it returns is decideStart's (two calls: the pin road and the entry, each handed the bare reading), no decidePoolSwitch or decidePinnedPlacement of its own`, wired(engSrc));
  // RED (r5108's small): 644e65583's pin call, which handed no bare reading (the entry did), in the text
  let noReading = null;
  try { noReading = anchored(engSrc, 'nowSec: nowSecOf(), readReading: poolReadReading(), hot: true,', 'nowSec: nowSecOf(), hot: true,', "644e65583's pin call"); } catch (e) { ck('RED CONTROL built (644e65583\'s pin call)', false, String(e && e.message).slice(0, 200)); }   // stale-pins: kept (the RED's text IS 644e65583's pin call)
  if (noReading) ck('RED: a pin road that hands no bare reading breaks the census (644e65583\'s pin call)', !wired(noReading));
  if (pinTip) ck('RED: 8a1ade3b7\'s pin block breaks the census (the pinned placement asked on its own)', !wired(pinTip));
  // RED: 17f782574's chooser — a hint ⇒ no placing, no family ⇒ the default before any decision (built from THIS tree's lines: a tree
  // without them cannot build it, and says so)
  let tip = null;
  try { tip = anchored(anchored(anchored(engSrc,
    "    const chooseNow = () => decideStart({ family: fam, hinted, defaultStale: staleDefault, baseReadCache: base, currentId: cur,", "    const chooseNow = () => require('../account-pool-auto.js').decidePoolSwitch({ placing: !hinted, currentId: cur,", 'the tip\'s chooser call'),
    "    if (!d && !fam && !staleDefault) return cur;   // no identity, the default not paying: the pool's default (the release)\n", '', 'the tip: no null answer'),
    "    // (no identity, a default the pool still lists → the pool's default target: decideStart answers null for it below, unless the default\n", "    if (!fam && !staleDefault) return cur; // no identity → the pool's default target\n    // (no identity, a default the pool still lists → the pool's default target: decideStart answers null for it below, unless the default\n", 'the tip: no family returns first'); } catch (e) { tip = null; ck('RED CONTROL built (17f782574\'s chooser from this tree\'s lines)', false, String(e && e.message).slice(0, 200)); }
  if (tip) {
    ck('RED: the tip\'s chooser is not the one entry\'s', !wired(tip));
    const tipEng = M.load(ENG_REL, tip, 'tip-chooser');
    const got = await startsOn(tipEng, { d: PAYING_D, o: { u5: 0.89, u7: 0.4 } });
    ck(`RED (17f782574's chooser): a resume and a start with no family land on the PAYING default and bill (${got.map(([n, t]) => `${n.split(' (')[0]} → ${t}`).join('; ')})`, got[1][1] === 'D' && got[2][1] === 'D', got);
  }
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'paying-start: ' })) ck(r.name, r.pass);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
