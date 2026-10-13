#!/usr/bin/env node
// test-decision-attention — FAST (lane decision-attention, D2 of docs/design-decision-api.zh.md §2.3 / §2.4; in-process,
// ZERO vendor calls). The REAL channels engine (a fake 'im' account, six conversations — two handed to an agent, i.e.
// FACT-tagged) + D1's REAL decision engine (src/server/decision-engine.js) over a FAKE fetch (OpenAI dialect):
//   ① THE SCAN: the first read answers before any judgment (0 calls when it returns — the scale law), then the 4
//     untagged rows ⇒ 4 calls, ONE record each with all 8 rubric questions (D1's probe 2026-10-12), ≤ 3 in flight;
//   ② THE CANDIDATE-SET CENSUS: no request ever names a fact-tagged row (the facts are free and stronger);
//   ③ THE VERDICT PATCHED IN: one partial broadcast per row the judge put over the threshold; the row's `judged`
//     {p, clauses, threshold}; statusTag 'judged'; the first read's attention list carries it; a row below is untagged;
//   ④ THE MEMO: a re-read makes NO call; a restart of both engines on the same data dir makes NO call and keeps the tags;
//   ⑤ THE LABELS: "not" drops the tag at once and is a labeled example in data/decision-examples.json (0600, newest
//     first); the next scan carries it and judges the other rows again (the examples hash is in the memo key);
//     "needs" tags a row the judge put below; a bad label / an unknown row is refused by name;
//   ⑥ NEVER JUDGE: the account's field ⇒ its tags gone and 0 calls; cleared ⇒ back;
//   ⑦ THE SWITCH: the attention feature off ⇒ 0 calls, `judging` false;
//   ⑧ THE DRAFT: the catalogue (20 questions) asked of each labeled example, PROPOSED lines (applied: false); again ⇒ memo;
//   ⑨ CONTROL (scripts/mutant-copy.mjs): the scan's candidate rule bypassed in a scratch copy ⇒ the census of ② is RED.
// (② first caught a real race: a row queued by a read BEFORE its hand-over was judged — each call re-asks the row as it is now.)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const DE = require(path.join(REPO, 'src/server/decision-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const REC = require(path.join(REPO, 'src/channel-record.js'));
const FO = require(path.join(REPO, 'src/channel-focus.js'));
const M = require(path.join(REPO, 'src/decision-model.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('decision-attention');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
let clock = Date.now();
const now = () => clock;

// ── the fake provider (OpenAI dialect): a record whose own part says URGENT needs you (0.86) ──
const got = [];
let inflight = 0, maxIn = 0;
const recordPart = (input) => String(input).split('———').pop();
async function fakeFetch(url, opts) {
  const body = JSON.parse(opts.body);
  got.push({ url, body, raw: opts.body, auth: opts.headers.authorization });
  inflight++; maxIn = Math.max(maxIn, inflight);
  await sleep(40);
  inflight--;
  const hot = /URGENT/.test(recordPart(body.input));
  const P = { needs_now: hot ? 0.86 : 0.22, asks_me: hot ? 0.9 : 0.1, deadline_money: hot ? 0.75 : 0.05, money: /Lunch|Contract/.test(recordPart(body.input)) ? 0.9 : 0.1 };   // money: the draft's leg (the two "needs" examples)
  const answers = body.questions.map((q) => ({ type: 'predicate', name: q.name, probability: P[q.name] !== undefined ? P[q.name] : 0.3 }));
  return { status: 200, ok: true, json: async () => ({ answers, usage: { input_tokens: Math.ceil(opts.body.length / 4) } }) };
}

// ── the world: six conversations of one account, the newest message from Ada inside the hour ──
const TITLES = ['Invoice URGENT', 'Handed one', 'Lunch plans', 'Handed two URGENT', 'Contract URGENT', 'Newsletter'];
const FACT = ['c1', 'c3'];
function worldModule(W) {
  return {
    kind: 'im',
    caps: { ...fake.fakePoll.caps, receive: 'poll', attachments: 'fetch', olderHistory: 'page', budget: { unit: 'request', default: 100000, settingKey: null, metered: true } },
    create(record) {
      const rec = (id, m) => REC.makeRecord({ adapterId: record.id, convId: id, vendorId: m.vendorId, at: m.at, author: m.author, text: m.text, attachments: [], threadKey: id, raw: {} });
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations() { return { conversations: [...W.values()].map((x) => REC.makeConversation({ id: x.id, title: x.title, kind: 'group', lastAt: x.recs[x.recs.length - 1].at })), cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
        async history(id) { const x = W.get(id); return { records: x.recs.map((m) => rec(id, m)), anchor: x.recs[x.recs.length - 1].vendorId, reachedAnchor: true, complete: true }; },
        async older() { return { records: [], exhausted: true }; },
      };
    },
  };
}
const world = () => new Map(TITLES.map((title, i) => [`c${i}`, { id: `c${i}`, title, recs: [0, 1].map((k) => ({ vendorId: `c${i}-m${k}`, at: clock - (i + 2) * 60e3 + k * 1000, author: { id: 'u1', name: 'Ada', isSelf: false, isBot: false }, text: k ? `${title}: can you look at this today?` : 'earlier line' })) }]));
const settings = { 'decision.attentionBlock': 'Invoices and contracts matter to me.' };
let plug = { enabled: true, config: { attention: true } };
function decisionEngine(dataDir) {
  const d = DE.create({ dataDir, integrations: { resolveIntegration: () => ({ values: { provider: 'openai', apiKey: 'sk-dummy-SECRET-123456', model: '' }, source: 'user' }) }, fetchImpl: fakeFetch, now, log: quiet });
  d.attachPlugin({ peek: () => plug, settings: () => plug.config || {} }); // lane plugin-settings-p0: the engine reads the settings rows
  return d;
}
async function engines(name, W, engineMod = ENG, fresh = true) {
  const dataDir = path.join(ROOT, name);
  if (fresh) {
    fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'im', kind: 'im', label: 'Team chat', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: true, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null }] }));
  }
  const registry = CH.createChannelRegistry();
  registry.register(worldModule(W));
  const events = [];
  const decision = decisionEngine(dataDir);
  const eng = engineMod.create({ dataDir, registry, env: {}, now, broadcast: (m) => events.push(m), serverSetting: (k) => settings[k], liveSessions: () => [], deliver: null, log: quiet, decisionEngine: decision });
  if (fresh) {
    await eng.pass('im', { force: true });
    for (const id of FACT) { const r = await eng.setAssignment('im', id, { principal: { kind: 'agent', id: `cid-${id}`, name: `Agent ${id}` }, mode: 'all' }); if (!r.ok) console.log('    setAssignment', JSON.stringify(r)); }
  }
  return { eng, events, dataDir, decision };
}
async function idle(eng) { for (let i = 0; i < 200; i++) { await sleep(20); if (eng.attention.idle()) return true; } return false; }
const rowOf = (d, id) => (d.conversations || []).find((c) => c.key === `im/${id}`);
const tagOf = (d, id) => { const r = rowOf(d, id); return r ? FO.statusTag(r, clock) : undefined; };
const factNamed = (bodies) => bodies.filter((g) => ['Handed one', 'Handed two'].some((t) => String(g.body.input).includes(t)));

console.log('① the scan: the first read never waits; 4 untagged rows ⇒ 4 calls of one record each, ≤ 3 in flight');
const W = world();
const A = await engines('main', W);
A.events.length = 0;
const t0 = Date.now();
const d0 = A.eng.digest();
const firstMs = Date.now() - t0;
ok(got.length === 0 && (d0.conversations || []).length === 6 && d0.judging === true, `the first read answered with all 6 rows BEFORE any judgment (0 calls at its return, ${firstMs} ms) and says judging: true`, { got: got.length, n: (d0.conversations || []).length, judging: d0.judging });
ok(FACT.every((id) => (tagOf(d0, id) || {}).code === 'assigned'), 'FIXTURE: the two handed-over rows wear the FACT tag (assigned)');
for (let i = 0; i < 400 && !(got.length === 4 && inflight > 0); i++) await sleep(1);
const midFlight = got.length === 4 && inflight > 0;
A.eng.digest(); A.eng.digest();   // reads while the LAST row's call is in flight (dequeued, no verdict yet)
ok(await idle(A.eng), 'the queue drains');
ok(midFlight && got.length === 4, `two reads while a row's call is in flight queue it NOT again — one call per row (${got.length} calls; the heavy leg's reload caught the double call)`);
ok(got.length === 4 && got.every((g) => g.body.questions.length === 8 && (String(g.body.input).match(/\[record\]/g) || []).length === 1 && /\/v1\/decisions$/.test(g.url)), 'exactly 4 calls — ONE record each, every one of the 8 rubric questions (needs_now + 7 clauses) in that call', got.map((g) => [g.body.questions.length, (String(g.body.input).match(/\[record\]/g) || []).length]));
ok(maxIn === 3, `the queue keeps ≤ 3 calls in flight (measured ${maxIn})`);
ok(got.every((g) => String(g.body.input).includes('Invoices and contracts matter to me.') && String(g.body.input).includes('Rubric v1') && !g.raw.includes('SECRET') && g.auth === 'Bearer sk-dummy-SECRET-123456'), 'each input carries the rubric v1 and the person\'s block as written; the key rides the header only, never the body');

console.log('② the candidate-set census: a fact-tagged row is never sent, not once');
ok(factNamed(got).length === 0, 'CENSUS: no request body names a fact-tagged row', factNamed(got).map((g) => recordPart(g.body.input).slice(0, 80)));

console.log('③ the verdict is patched in');
const partialKeys = A.events.filter((e) => e.type === 'channels-updated' && e.partial).flatMap((e) => e.changedKeys);
ok(partialKeys.slice().sort().join() === 'im/c0,im/c4', 'ONE partial broadcast per row the judge put over the threshold (c0, c4) — none for the rows below it', partialKeys);
const d1 = A.eng.digest();
const j0 = rowOf(d1, 'c0').judged, t0g = tagOf(d1, 'c0');
ok(t0g && t0g.code === 'judged' && t0g.p === 0.86 && j0.threshold === 0.7 && j0.clauses.join() === 'asks_me,deadline_money' && j0.rubricV === 1, 'the row carries judged {p 0.86, clauses asks_me + deadline_money, threshold 0.70} and statusTag says judged', { j0, t0g });
ok(tagOf(d1, 'c2') === null && tagOf(d1, 'c5') === null && (tagOf(d1, 'c4') || {}).code === 'judged', 'a row judged 0.22 stays untagged; Contract URGENT is judged');
ok(d1.attention.total === 4, `the first read's attention list = the 2 facts + the 2 judged rows (${d1.attention.total})`);
settings['decision.threshold'] = 0.9;
ok(tagOf(A.eng.digest(), 'c0') === null, 'the threshold setting at 0.90 takes the 0.86 row off (the row applies the CURRENT setting)');
delete settings['decision.threshold'];

console.log('④ the memo: a re-read and a restart never re-bill');
let n = got.length;
for (let i = 0; i < 3; i++) A.eng.digest();
await idle(A.eng);
ok(got.length === n, `three re-reads ⇒ 0 new calls (${got.length - n})`);
A.eng.store.index.flush();
const B = await engines('main', W, ENG, false);
const dB = B.eng.digest();
await idle(B.eng);
const dB2 = B.eng.digest();
ok(got.length === n && (tagOf(dB2, 'c0') || {}).code === 'judged' && (tagOf(dB2, 'c4') || {}).code === 'judged', `a restart of both engines on the same data dir ⇒ 0 calls (D1's memo on disk), the judged rows back after the first read (${got.length - n} calls)`, { first: tagOf(dB, 'c0'), after: tagOf(dB2, 'c0') });

console.log('⑤ the labels: a labeled example; "not" drops the tag at once; the next scan carries it');
const lastAt0 = rowOf(dB2, 'c0').lastAt;
B.events.length = 0;
const lb = B.eng.labelJudged('im/c0', lastAt0, 'not');
const dL = B.eng.digest();
const exFile = path.join(B.dataDir, 'decision-examples.json');
const ex = JSON.parse(fs.readFileSync(exFile, 'utf8')).examples;
ok(lb.ok && tagOf(dL, 'c0') === null && B.events.some((e) => e.partial && e.changedKeys.includes('im/c0')), '"not" drops the tag at once (one partial broadcast of the row)', lb);
ok((fs.statSync(exFile).mode & 0o777) === 0o600 && ex.length === 1 && ex[0].key === 'im/c0' && ex[0].verdict === 'not' && ex[0].lastAt === lastAt0 && ex[0].snippet.startsWith('Invoice URGENT') && ex[0].clauses.join() === 'asks_me,deadline_money', 'data/decision-examples.json (0600): {key, lastAt, snippet ≤ 200, verdict, clauses, at}', ex[0]);
n = got.length;
await idle(B.eng);
const again = got.slice(n);
ok(again.length === 3 && again.every((g) => String(g.body.input).includes('→ not') && !recordPart(g.body.input).includes('Invoice URGENT')) && factNamed(again).length === 0, 'the examples hash moved the memo keys: the 3 other untagged rows are judged again, each input carrying the example (→ not); the labeled row and the facts are not sent', again.map((g) => recordPart(g.body.input).slice(0, 60)));
const lastAt2 = rowOf(dL, 'c2').lastAt;
const ln = B.eng.labelJudged('im/c2', lastAt2, 'needs');
const dN = B.eng.digest();
ok(ln.ok && (tagOf(dN, 'c2') || {}).code === 'judged' && tagOf(dN, 'c2').source === 'you' && JSON.parse(fs.readFileSync(exFile, 'utf8')).examples[0].key === 'im/c2', '"needs" on a row the judge put at 0.22 tags it (source you) and is the NEWEST example');
ok(B.eng.labelJudged('im/c2', lastAt2, 'maybe').code === 'bad-request' && B.eng.labelJudged('im/nope', 1, 'not').code === 'not-found', 'a label other than needs / not, and an unknown row, are refused by name');
await idle(B.eng);

console.log('⑥ never judge this account');
n = got.length;
const nj = await B.eng.setJudge('im', 'never');
const dV = B.eng.digest();
B.eng.labelJudged('im/c5', rowOf(dV, 'c5').lastAt, 'not');   // the examples move — a judged account would be judged again
B.eng.digest();
await idle(B.eng);
ok(nj.ok && dV.adapters[0].judge === 'never' && (tagOf(dV, 'c4') === null) && tagOf(dV, 'c2') === null && got.length === n, '"never judge": the account\'s tags are gone (its label too) and NO call is made for its rows, even after the examples moved', { judge: dV.adapters[0].judge, c4: tagOf(dV, 'c4'), calls: got.length - n });
ok((await B.eng.setJudge('im', 'sometimes')).code === 'bad-request' && (await B.eng.setJudge('nope', 'never')).code === 'not-found', 'judge is never | null; an unknown account is not-found');
await B.eng.setJudge('im', null);
B.eng.digest();
await idle(B.eng);
ok(B.eng.digest().adapters[0].judge === null && (tagOf(B.eng.digest(), 'c2') || {}).code === 'judged' && got.length > n, 'cleared: the label is back and the rows are judged again');

console.log('⑦ the attention switch off ⇒ nothing is judged');
plug = { enabled: true, config: { attention: false } };
n = got.length;
B.eng.labelJudged('im/c4', rowOf(B.eng.digest(), 'c4').lastAt, 'needs');
const dOff = B.eng.digest();
await idle(B.eng);
ok(dOff.judging === false && got.length === n && B.eng.attention.status().on === false, 'the feature off: judging false, 0 calls', { judging: dOff.judging, calls: got.length - n });
plug = { enabled: true, config: { attention: true } };

console.log('⑧ "Draft from my recent decisions"');
n = got.length;
const dr = await B.eng.attention.draft();
const drCalls = got.slice(n);
ok(dr.ok && dr.applied === false && dr.read === 4 && dr.calls === 4 && drCalls.length === 4 && drCalls.every((g) => g.body.questions.length === 20) && dr.lines.length >= 1 && dr.lines.some((l) => l.name === 'money') && typeof dr.text === 'string' && dr.text.length > 0, 'the 20 catalogue questions asked of each of the 4 labeled examples (one call each) ⇒ PROPOSED lines, never applied', { ok: dr.ok, read: dr.read, calls: dr.calls, lines: dr.lines });
n = got.length;
const dr2 = await B.eng.attention.draft();
ok(dr2.ok && dr2.calls === 0 && got.length === n && dr2.text === dr.text, 'pressed again ⇒ the memo answers, 0 calls, the same proposal');
const Cdir = path.join(ROOT, 'onelabel');
fs.mkdirSync(Cdir, { recursive: true });
fs.writeFileSync(path.join(Cdir, 'decision-examples.json'), JSON.stringify({ v: 1, examples: [M.exampleOf({ key: 'im/x', lastAt: 1, title: 'x' }, 'needs')] }));
const lone = require(path.join(REPO, 'src/server/channels-attention.js')).create({ dataDir: Cdir, decision: decisionEngine(Cdir), now, log: quiet });
const dr3 = await lone.draft();
ok(!dr3.ok && dr3.why === 'need-both-labels' && dr3.read === 1, 'one kind of label only ⇒ nothing proposed, the reason named (and no call)');

console.log('⑨ CONTROL: the candidate filter bypassed in a scratch copy ⇒ the census is red');
const MUT = mutantCopies('decision-attention', REPO);
const attSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-attention.js'), 'utf8');
const anchor = "const FO = require('../channel-focus.js');";
ok(attSrc.includes(anchor) && (attSrc.match(/FO\.judgeCandidate\(/g) || []).length === 2, 'ANCHOR: the scan asks judgeCandidate twice — as it queues a row and again right before its call');
const attMut = MUT.write('src/server/channels-attention.js', attSrc.replace(anchor, "const FO = { ...require('../channel-focus.js'), judgeCandidate: () => true };"), 'no-filter');
const engSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
const engMut = MUT.load('src/server/channels-engine.js', engSrc.replace("require('./channels-attention.js')", `require(${JSON.stringify(attMut)})`), 'mut-attention');
n = got.length;
const C = await engines('control', world(), engMut);
C.eng.digest();
await idle(C.eng);
ok(factNamed(got.slice(n)).length >= 1, `CONTROL: with the filter bypassed the fact-tagged rows ARE sent (${factNamed(got.slice(n)).length}) — leg ② would be red`);
const anchor2 = "const v = typeof viewNow === 'function' ? viewNow(queued.key) : queued;";
ok(attSrc.includes(anchor2), 'ANCHOR: each call reads the row as it is now');
const attMut2 = MUT.write('src/server/channels-attention.js', attSrc.replace(anchor2, 'const v = queued;'), 'stale-row');
const engMut2 = MUT.load('src/server/channels-engine.js', engSrc.replace("require('./channels-attention.js')", `require(${JSON.stringify(attMut2)})`), 'mut-stale');
n = got.length;
const C2 = await engines('control-stale', world(), engMut2);
C2.eng.digest();
await idle(C2.eng);
ok(factNamed(got.slice(n)).length >= 1, `CONTROL: judging the QUEUED snapshot (no re-read before the call) sends the rows handed over after they were queued (${factNamed(got.slice(n)).length}) — the race leg ② caught`);
for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 4 })) ok(x.pass, 'tree: ' + x.name + (x.pass ? '' : ' — ' + x.detail));

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
