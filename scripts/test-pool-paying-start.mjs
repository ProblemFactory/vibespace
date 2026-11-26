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

// THE WORLD: the real AccountManager and the real pool engine over a temp data folder; the default D and one other member O. `held`:
// D HELD by B-6a92's same-instant check (scripts/test-reading-truth.mjs's recipe): D and Z, an account outside the pool, on ONE weekly
// instant to the second, neither proven; the engine's boot repair holds them
function world(engMod, { d, o, held = false }) {
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const root = scratchDir('pool-paying-start'), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache');
  const am = new AccountManager({ dataDir });
  const id = {};
  for (const tag of (held ? ['D', 'O', 'Z'] : ['D', 'O'])) { id[tag] = am.createSubscription({ name: 'acct-' + tag.toLowerCase() }).id; fs.writeFileSync(path.join(am.subDir(id[tag]), '.credentials.json'), CREDS(id[tag]), { mode: 0o600 }); }
  const P = am.createPool({ name: 'pool-start', members: [id.D, id.O] }).id;
  am.setPoolTarget(P, id.D); am.updatePool(P, { auto: true, hot: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, id.D + '.json'), JSON.stringify(reading(d)));
  fs.writeFileSync(path.join(cacheDir, id.O + '.json'), JSON.stringify(reading(o)));
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
{ // THE CHOOSER CALLS THE ONE ENTRY: its decision is decideStart's, with the start's family, its hint and the bare reading; no
  // decidePoolSwitch of its own and no `placing: !hinted` beside it — the leg's start kinds and the chooser cannot part again
  const body = (t) => { const i = t.indexOf('\nfunction poolChooserForModel('); const j = t.indexOf('\nfunction ', i + 10); return i < 0 ? '' : t.slice(i, j < 0 ? undefined : j); };
  const wired = (t) => { const b = body(t); return /const chooseNow = \(\) => decideStart\(\{ family: fam, hinted, defaultStale: staleDefault, baseReadCache: base, currentId: cur,/.test(b) && !/decidePoolSwitch\(/.test(b) && !/placing: !hinted/.test(b) && /if \(!d && !fam && !staleDefault\) return cur;/.test(b); };   // stale-pins: kept (the RED's text IS 17f782574's chooser)
  ck('the chooser asks the one entry (decideStart) with the start\'s family, its hint and the bare reading — no decision of its own', wired(engSrc));
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
