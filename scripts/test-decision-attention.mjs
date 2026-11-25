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
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('decision-attention');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
let clock = Date.now();
const now = () => clock;

// ── the fake provider (OpenAI dialect): a record whose own part says URGENT needs you (0.86) ──
const got = [];
let inflight = 0, maxIn = 0;
let holdAt = 0, holdP = null, heldNow = false;   // r2988: the call numbered `holdAt` is HELD on `holdP` (a promise) — its flight a state, never a 40 ms window
const recordPart = (input) => String(input).split('———').pop();
// the judge's request body is a ONE-SHOT stream (lane judge-one-shot-body) — a fake reads it like the wire does
const bodyText = (init) => (typeof init.body === 'string' ? init.body : new Response(init.body).text());
async function fakeFetch(url, opts) {
  inflight++; maxIn = Math.max(maxIn, inflight);
  const raw = await bodyText(opts), body = JSON.parse(raw);
  got.push({ url, body, raw, auth: opts.headers.authorization });
  if (holdP && got.length === holdAt) { heldNow = true; try { await holdP; } finally { heldNow = false; } }   // r4310: the hold's own fact
  await sleep(40);
  inflight--;
  const hot = /URGENT/.test(recordPart(body.input));
  const P = { needs_now: hot ? 0.86 : 0.22, asks_me: hot ? 0.9 : 0.1, deadline_money: hot ? 0.75 : 0.05, money: /Lunch|Contract/.test(recordPart(body.input)) ? 0.9 : 0.1 };   // money: the draft's leg (the two "needs" examples)
  const answers = body.questions.map((q) => ({ type: 'predicate', name: q.name, probability: P[q.name] !== undefined ? P[q.name] : 0.3 }));
  return { status: 200, ok: true, json: async () => ({ answers, usage: { input_tokens: Math.ceil(raw.length / 4) } }) };
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
// r4310 (主开发; one UTC sighting in a whole gate at load 30+, green alone): «3 of 7 rows judged» — the old idle() polled 200 × 20 ms,
// a 4 s GUESS, and returned QUIETLY at its end. Under IO load each judgment's two durable journal writes (its reservation before the
// call, its journal line after) made the drain outlast the guess, and the next leg read the half-done drain as the product's answer.
// A WAIT IS ON THE FACT — the product's own idle() (nothing queued, flying or due) — with a GENEROUS bound whose expiry FAILS BY A
// NAMED HARNESS LINE; every wait of this suite goes through `until`
const SETTLE_MS = 120000;
async function until(fact, what, { boundMs = SETTLE_MS, say = ok } = {}) {
  const t0 = Date.now();
  while (!fact()) {
    if (Date.now() - t0 >= boundMs) { say(false, `HARNESS (r4310): ${typeof what === 'function' ? what() : what} — not within ${Math.round(boundMs / 1000)} s (the wait's bound, never the product's answer)`); return false; }
    await sleep(20);
  }
  return true;
}
const idle = (eng, opts = {}) => until(() => eng.attention.idle(), () => { const s = eng.attention.status(); return `the attention queue settles (still ${s.queued} queued, ${s.inFlight} in flight)`; }, opts);
const rowOf = (d, id) => (d.conversations || []).find((c) => c.key === `im/${id}`);
const tagOf = (d, id) => { const r = rowOf(d, id); return r ? FO.statusTag(r, clock) : undefined; };
const factNamed = (bodies) => bodies.filter((g) => ['Handed one', 'Handed two'].some((t) => String(g.body.input).includes(t)));

console.log('① the scan: the first read never waits; 4 untagged rows ⇒ 4 calls of one record each, ≤ 3 in flight');
const W = world();
const A = await engines('main', W);
A.events.length = 0;
let openLast = null; holdAt = got.length + 4; holdP = new Promise((r) => { openLast = r; });   // r2988: the LAST row's call held
const t0 = Date.now();
const d0 = A.eng.digest();
const firstMs = Date.now() - t0;
ok(got.length === 0 && (d0.conversations || []).length === 6 && d0.judging === true, `the first read answered with all 6 rows BEFORE any judgment (0 calls at its return, ${firstMs} ms) and says judging: true`, { got: got.length, n: (d0.conversations || []).length, judging: d0.judging });
ok(FACT.every((id) => (tagOf(d0, id) || {}).code === 'assigned'), 'FIXTURE: the two handed-over rows wear the FACT tag (assigned)');
// r2988 (one UTC sighting in a whole gate, green alone): the poll in 1 ms sleeps had to land inside the last call's 40 ms flight, and
// a loaded run's timers overshot it. The call is HELD now: the wait is on its state (bounded), and the reads' effect is read from
// the queue's own size, at once
await until(() => got.length === 4 && inflight > 0, 'the LAST row\'s call is in flight, HELD');   // r4310: on the fact, a named expiry
const midFlight = got.length === 4 && inflight > 0;
A.eng.digest(); A.eng.digest();   // reads while the LAST row's call is in flight (dequeued, no verdict yet)
const queuedAfter = A.eng.attention.status().queued;
holdP = null; openLast();
ok(await idle(A.eng), 'the queue drains');
ok(midFlight && queuedAfter === 0 && got.length === 4, `two reads while a row's call is in flight queue it NOT again — one call per row (${got.length} calls, ${queuedAfter} queued by the reads; the heavy leg's reload caught the double call)`);
ok(got.length === 4 && got.every((g) => g.body.questions.length === 8 && (String(g.body.input).match(/\[record\]/g) || []).length === 1 && /\/v1\/decisions$/.test(g.url)), 'exactly 4 calls — ONE record each, every one of the 8 rubric questions (needs_now + 7 clauses) in that call', got.map((g) => [g.body.questions.length, (String(g.body.input).match(/\[record\]/g) || []).length]));
ok(maxIn === 3, `the queue keeps ≤ 3 calls in flight (measured ${maxIn})`);
ok(got.every((g) => /^\n\n\[record\]\nfacts: addressed: no mention of the reader; kind: a group; 0 messages since the reader last read, \d+ min ago\ntitle: /.test(recordPart(g.body.input))) && A.eng.attention.status().scans === 1, 'lane decision-attention-facts: each record opens with its facts line (the backlog of a first walk is read by construction: 0 since the read line); the scan\'s facts built ONCE for the 4 rows', recordPart(got[0].body.input).slice(0, 200));
ok(got.every((g) => String(g.body.input).includes('Invoices and contracts matter to me.') && String(g.body.input).includes('Rubric v2') && !g.raw.includes('SECRET') && g.auth === 'Bearer sk-dummy-SECRET-123456'), 'each input carries the rubric v2 and the person\'s block as written; the key rides the header only, never the body');

console.log('①b r4310 THE WAIT IS ON THE FACT: a drain that outlasts any guess is waited for, and the wait\'s own bound fails by its name');
{
  const S = await engines('settle', world());   // run right after ①: the judge is on and the scan's calls are this world's own
  const n0 = got.length;
  // the scan's FIRST call HELD (its number counted from here, whatever this late world's scan holds): while it is held the drain
  // cannot be idle — the drain outlasts any guess; the wait below is on the hold's OWN fact (the fake vendor sits on it)
  let open1 = null; holdAt = n0 + 1; holdP = new Promise((r) => { open1 = r; });
  S.eng.digest();
  const w = idle(S.eng, { say: () => { } });
  await until(() => heldNow, 'the held call sits on its hold');
  const at = () => new Promise((r) => setImmediate(() => r('pending')));
  const whileHeld = await Promise.race([w.then(() => 'settled'), at()]);
  // the OLD shape, run while the call is held: a fixed count of polls that returns QUIETLY at its end (its count cut to one — the
  // same shape, its fault placed by the hold, never by a clock)
  const oldShape = async (eng) => { for (let i = 0; i < 1; i++) { await sleep(20); if (eng.attention.idle()) return true; } return false; };
  const oldEnded = await oldShape(S.eng), busyAtOldEnd = !S.eng.attention.idle();
  // THE BOUND's EXPIRY is NAMED: a second wait with a short bound, the call still held — it fails by its harness line
  const said = [];
  const expired = await idle(S.eng, { boundMs: 200, say: (c, n) => said.push({ c, n }) });
  holdP = null; open1();
  const settled = await w;
  ok(whileHeld === 'pending' && settled === true && got.length > n0 && !heldNow && S.eng.attention.idle(), '①b the wait on the fact holds while a call is HELD (the drain outlasts any guess) and ends when the drain does: the hold released, the queue idle', { whileHeld, settled, calls: got.length - n0 });
  ok(oldEnded === false && busyAtOldEnd, '①b RED CONTROL (the old shape: a fixed count of polls, quiet at its end): with the call HELD it ENDS while the drain is still busy — the next leg would read a half-done drain', { oldEnded, busyAtOldEnd });
  ok(expired === false && said.length === 1 && said[0].c === false && /^HARNESS \(r4310\): the attention queue settles \(still \d+ queued, \d+ in flight\) — not within 0 s/.test(said[0].n), '①b the wait\'s own bound, when it expires, FAILS BY ITS NAMED HARNESS LINE (never a quiet return)', said);
  got.splice(n0);   // the block's own calls given back: every later leg reads the calls it always read
}

console.log('② the candidate-set census: a fact-tagged row is never sent, not once');
ok(factNamed(got).length === 0, 'CENSUS: no request body names a fact-tagged row', factNamed(got).map((g) => recordPart(g.body.input).slice(0, 80)));

console.log('③ the verdict is patched in');
const partialKeys = A.events.filter((e) => e.type === 'channels-updated' && e.partial).flatMap((e) => e.changedKeys);
ok(partialKeys.slice().sort().join() === 'im/c0,im/c4', 'ONE partial broadcast per row the judge put over the threshold (c0, c4) — none for the rows below it', partialKeys);
const d1 = A.eng.digest();
const j0 = rowOf(d1, 'c0').judged, t0g = tagOf(d1, 'c0');
ok(t0g && t0g.code === 'judged' && t0g.p === 0.86 && j0.threshold === 0.7 && j0.clauses.join() === 'asks_me,deadline_money' && j0.rubricV === 2, 'the row carries judged {p 0.86, clauses asks_me + deadline_money, threshold 0.70} and statusTag says judged', { j0, t0g });
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
const attMut = MUT.write('src/server/channels-attention.js', editAnchor(attSrc, anchor, "const FO = { ...require('../channel-focus.js'), judgeCandidate: () => true };", "src/server/channels-attention.js"), 'no-filter');
const engSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
const engMut = MUT.load('src/server/channels-engine.js', editAnchor(engSrc, "require('./channels-attention.js')", `require(${JSON.stringify(attMut)})`, "src/server/channels-engine.js"), 'mut-attention');
n = got.length;
const C = await engines('control', world(), engMut);
C.eng.digest();
await idle(C.eng);
ok(factNamed(got.slice(n)).length >= 1, `CONTROL: with the filter bypassed the fact-tagged rows ARE sent (${factNamed(got.slice(n)).length}) — leg ② would be red`);
const anchor2 = "const v = typeof viewNow === 'function' ? viewNow(queued.key) : queued;";
ok(attSrc.includes(anchor2), 'ANCHOR: each call reads the row as it is now');
const attMut2 = MUT.write('src/server/channels-attention.js', editAnchor(attSrc, anchor2, 'const v = queued;', "src/server/channels-attention.js"), 'stale-row');
const engMut2 = MUT.load('src/server/channels-engine.js', editAnchor(engSrc, "require('./channels-attention.js')", `require(${JSON.stringify(attMut2)})`, "src/server/channels-engine.js"), 'mut-stale');
n = got.length;
const C2 = await engines('control-stale', world(), engMut2);
C2.eng.digest();
await idle(C2.eng);
ok(factNamed(got.slice(n)).length >= 1, `CONTROL: judging the QUEUED snapshot (no re-read before the call) sends the rows handed over after they were queued (${factNamed(got.slice(n)).length}) — the race leg ② caught`);
// r2988: the RED of ①'s in-flight leg, made by a HELD promise (never by load): the scan with the in-flight guard removed in a copy —
// the last row's call held, two reads queue that very row again (the queue's own size, read at once)
const anchor3 = 'queue.has(v.key) || flying.has(v.key) ||';
const attMut3 = MUT.write('src/server/channels-attention.js', editAnchor(attSrc, anchor3, 'queue.has(v.key) ||', "src/server/channels-attention.js"), 'no-flying');
const engMut3 = MUT.load('src/server/channels-engine.js', editAnchor(engSrc, "require('./channels-attention.js')", `require(${JSON.stringify(attMut3)})`, "src/server/channels-engine.js"), 'mut-flying');
{
  const C3 = await engines('control-flying', world(), engMut3);
  let open3 = null; holdAt = got.length + 4; holdP = new Promise((r) => { open3 = r; });
  const g0 = got.length;
  C3.eng.digest();
  await until(() => got.length === g0 + 4 && inflight > 0, 'the last row\'s call is in flight, HELD (the guard removed)');   // r4310
  const held3 = got.length === g0 + 4 && inflight > 0;
  C3.eng.digest(); C3.eng.digest();
  const queued3 = C3.eng.attention.status().queued;
  holdP = null; open3();
  await idle(C3.eng);
  ok(held3 && queued3 >= 1, `RED CONTROL (r2988: the in-flight guard removed, in a copy): with the last row's call HELD, two reads queue it AGAIN (${queued3} queued) — ①'s leg would read it`, { held3, queued3 });
}
for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 4 })) ok(x.pass, 'tree: ' + x.name + (x.pass ? '' : ' — ' + x.detail));

console.log('⑩ THE FACTS LINE through the REAL engine (lane decision-attention-facts): @ / reply / DM / unread since the read line / one mail in 2 inboxes / an automated sender / mail trimmed — never a name');
{
  // the world: a chat account (the owner = me1) + TWO mail accounts (caps.glyph 'mail') that both got the same notice 19 min apart
  const T0 = clock;
  const person = (id, name) => ({ id, name, isSelf: false, isBot: false });
  const ME = { id: 'me1', name: 'Owner Person', isSelf: true, isBot: false };
  const CHAT = new Map([
    ['ops', { kind: 'group', title: 'Ops room', recs: Array.from({ length: 30 }, (_, i) => ({ vendorId: `ops-${i}`, at: T0 - (40 - i) * 60e3, author: person(i % 2 ? 'u2' : 'u3', i % 2 ? 'userR Q' : 'Kato Y'), text: `ops line ${i}: the quota for next week` })) }],
    ['launch', { kind: 'group', title: 'Launch', recs: [{ vendorId: 'l-0', at: T0 - 9 * 60e3, author: person('u4', 'Will R'), text: 'this one should be @Owner Person', mentions: [{ kind: 'person', id: 'me1', name: 'Owner Person' }] }] }],
    ['review', { kind: 'group', title: 'Review', recs: [{ vendorId: 'r-0', at: T0 - 20 * 60e3, author: ME, text: 'I pushed the fix' }, { vendorId: 'r-1', at: T0 - 8 * 60e3, author: person('u5', 'Ada K'), text: 'looks good, merging', replyTo: 'r-0' }] }],
    ['dm', { kind: 'dm', title: 'Ada K', recs: [{ vendorId: 'd-0', at: T0 - 7 * 60e3, author: person('u5', 'Ada K'), text: 'lunch at noon?' }] }],
  ]);
  const NOTICE = ['A new setting for OAuth clients.', '', 'You are receiving this because you administer the suite.', '', ...Array.from({ length: 12 }, (_, i) => `Paragraph ${i}: the setting applies to agent clients; review them before the rollout.`), '', '© 2026 Example LLC, 1600 Example Parkway', 'You have received this mandatory update. Unsubscribe never applies.'].join('\n');
  const WS = person('workspace-noreply@example.com', 'The Workspace Team');
  const MAIL = {
    mail1: new Map([['n1', { kind: 'thread', title: '[Action Required] Mark AI agent OAuth clients', recs: [{ vendorId: 'n1-0', at: T0 - 30 * 60e3, author: WS, text: NOTICE, facts: [{ k: 'automated', v: 'notification' }] }] }],
      ['q1', { kind: 'thread', title: 'Re: licensing', recs: [{ vendorId: 'q1-0', at: T0 - 6 * 60e3, author: person('ann@example.com', 'Ann L'), text: 'Signed copy by Friday.\n\n-- \nAnn L | Partnerships\n\nOn Mon, Oct 12, 2026 at 9:14 AM Dana <\ndana@example.com> wrote:\n> Can you confirm the licensing terms?\n> QUOTED-TAIL' }] }]]),
    mail2: new Map([['n2', { kind: 'thread', title: 'Re: [Action Required] Mark AI agent OAuth clients', recs: [{ vendorId: 'n2-0', at: T0 - 11 * 60e3, author: WS, text: NOTICE }] }]]),
  };
  const mod = (kind, glyph) => ({
    kind,
    caps: { ...fake.fakePoll.caps, receive: 'poll', attachments: 'fetch', olderHistory: 'page', budget: { unit: 'request', default: 100000, settingKey: null, metered: true }, ...(glyph ? { glyph, facts: ['automated'] } : {}) },
    create(record) {
      const Wd = kind === 'chatx' ? CHAT : MAIL[record.id];
      const rec = (id, m) => REC.makeRecord({ adapterId: record.id, convId: id, vendorId: m.vendorId, at: m.at, author: m.author, text: m.text, attachments: [], threadKey: id, raw: {}, ...(m.mentions ? { mentions: m.mentions } : {}), ...(m.replyTo ? { replyTo: m.replyTo } : {}), ...(m.facts ? { facts: m.facts } : {}) });
      return {
        selfId: () => (kind === 'chatx' ? 'me1' : null),
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations() { return { conversations: [...Wd.entries()].map(([id, x]) => REC.makeConversation({ id, title: x.title, kind: x.kind, lastAt: x.recs[x.recs.length - 1].at })), cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
        async history(id) { const x = Wd.get(id); return { records: x.recs.map((m) => rec(id, m)), anchor: x.recs[x.recs.length - 1].vendorId, reachedAnchor: true, complete: true }; },
        async older() { return { records: [], exhausted: true }; },
      };
    },
  });
  const dataDir = path.join(ROOT, 'facts');
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  const acct = (id, kind, label) => ({ id, kind, label, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: true, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [acct('chat', 'chatx', 'Team chat'), acct('mail1', 'mailx', 'Work mail'), acct('mail2', 'mailx', 'Old mail')] }));
  const registry = CH.createChannelRegistry();
  registry.register(mod('chatx', null));
  registry.register(mod('mailx', 'mail'));
  // the at-you / replied / direct facts claim those rows on the first screen: off here, so the judge sees them (preset "judge only")
  for (const r of ['at-you', 'replied', 'direct']) settings[`channels.attention.rule.${r}`] = false;
  const decision = decisionEngine(dataDir);
  const eng = ENG.create({ dataDir, registry, env: {}, now, broadcast: () => { }, serverSetting: (k) => settings[k], liveSessions: () => [], deliver: null, log: quiet, decisionEngine: decision });
  for (const a of ['chat', 'mail1', 'mail2']) await eng.pass(a, { force: true });
  await eng.markRead('chat', 'ops', CHAT.get('ops').recs[9].at);   // the owner read up to line 9 ⇒ 20 unread
  const n0 = got.length;
  eng.digest();
  await idle(eng);
  const mine = got.slice(n0);
  const byTitle = (t) => mine.find((g) => recordPart(g.body.input).includes(`title: ${t}\n`));
  const factsOf = (g) => { const m = /\[record\]\nfacts: ([^\n]*)\n/.exec(String(g && g.body.input)); return m ? m[1] : null; };
  ok(mine.length === 7 && mine.every((g) => factsOf(g) !== null && recordPart(g.body.input).startsWith('\n\n[record]\nfacts: ')), `all 7 rows judged, each record's FIRST line is its facts line (${mine.length} calls)`, mine.map((g) => recordPart(g.body.input).slice(0, 90)));
  const F = Object.fromEntries(['Ops room', 'Launch', 'Review', 'Ada K', 'Re: licensing'].map((t) => [t, factsOf(byTitle(t))]));
  const notices = mine.filter((g) => /Action Required/.test(recordPart(g.body.input)));
  ok(/^addressed: no mention of the reader; kind: a group; .*20 messages since the reader last read, 3\d min ago$/.test(F['Ops room']), '"Ops room": no mention, a group, 20 messages since the read line (markRead at line 9)', F['Ops room']);
  ok(F.Launch.startsWith('addressed: @-mentioned the reader; kind: a group') && F.Review.startsWith('addressed: a reply to the reader\'s message; kind: a group; the reader last spoke here 20 min ago') && F['Ada K'].startsWith('addressed: a direct message; kind: a direct message'), 'an @ of the owner (the at-you rule\'s predicate), a reply to the owner\'s message (+ when they last spoke), a direct message', F);
  ok(notices.length === 2 && notices.every((g) => factsOf(g).includes('kind: an email thread') && factsOf(g).includes('the same message reached 2 of the reader\'s inboxes')) && notices.filter((g) => factsOf(g).includes('an automated or bulk sender (notification)')).length === 1, 'the notice in BOTH mail accounts (19 min apart, one subject with "Re:"): "the same message reached 2 of the reader\'s inboxes"; the copy whose headers said so: "an automated or bulk sender (notification)"', notices.map(factsOf));
  ok(notices.every((g) => recordPart(g.body.input).includes('You are receiving this') && !recordPart(g.body.input).includes('©') && !recordPart(g.body.input).includes('Unsubscribe')) && !recordPart(byTitle('Re: licensing').body.input).includes('QUOTED-TAIL') && !/wrote:|Partnerships/.test(recordPart(byTitle('Re: licensing').body.input)), 'mail bodies are trimmed before the cut: the notice\'s footer, the thread\'s signature and quoted reply are gone; the notice\'s opening line stays');
  const ops = recordPart(byTitle('Ops room').body.input).split('body: ')[1].split('\n');
  ok(ops[0] === 'userR Q: ops line 29: the quota for next week' && ops.filter((l) => /^(userR Q|Kato Y): ops line/.test(l)).length === 12 && ops.includes('(8 earlier unread messages omitted)') && !ops.some((l) => /ops line [0-9]:/.test(l)), 'the body = what the owner has not read: the 12 newest past the read line NEWEST FIRST + "(8 earlier unread messages omitted)" — nothing at or before the read line', ops.slice(0, 2).concat(ops.slice(-2)));
  const NAMES = ['userR', 'Kato', 'Will R', 'Ada K', 'Owner Person', 'Workspace Team', 'Ann L', 'me1', 'u2', 'u5', 'mail1', 'mail2', 'workspace-noreply', 'Ops room', 'Launch', 'licensing'];
  const leaked = mine.flatMap((g) => NAMES.filter((x) => factsOf(g).includes(x)));
  ok(leaked.length === 0, 'CENSUS: no facts line names a person, an account, an id, an address or a title (16 needles over 7 lines)', leaked);
  ok(eng.attention.status().scans === 1, `the scan's facts (the duplicate-inbox map over the live index) were built ONCE for the 7 rows (${eng.attention.status().scans})`);
  ok(mine.every((g) => g.body.questions.length === 8 && String(g.body.input).includes('Rubric v2 — ') && !String(g.body.input).includes(M.RUBRIC.clauses[0].instructions)), 'with the person\'s block: 8 questions; the [rubric] part is one line — no question\'s instructions ride twice');
  const journal = fs.readFileSync(path.join(dataDir, 'decision-journal.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.use === 'attention' && r.outcome === 'ok');
  ok(journal.length === 7 && journal.every((r) => r.p === 0.22 && r.rubric === 2), 'each journal line carries p (needs_now, 2 decimals) and rubric 2 — the next quality check needs no memo join', journal.map((r) => r.p));
  // an EMPTY block: 7 questions, no `matters`, the [userBlock] part absent; the memo key moved (the block hash) ⇒ judged again
  const blockWas = settings['decision.attentionBlock'];
  settings['decision.attentionBlock'] = '';
  const n1 = got.length;
  eng.digest();
  await idle(eng);
  const empty = got.slice(n1);
  ok(empty.length === 7 && empty.every((g) => g.body.questions.length === 7 && !g.body.questions.some((q) => q.name === 'matters') && !String(g.body.input).includes('[userBlock]')), 'an EMPTY "what matters to me" ⇒ 7 questions, `matters` never asked', empty.map((g) => g.body.questions.length));
  settings['decision.attentionBlock'] = blockWas;
  for (const r of ['at-you', 'replied', 'direct']) delete settings[`channels.attention.rule.${r}`];
}

console.log('⑪ IMPLICIT LABELS (decision.implicitLabels): a reply ⇒ "needs", listed and unopened 24 h ⇒ "not"; the person\'s label wins; OFF writes nothing');
{
  const run = async (name, on) => {
    settings['decision.implicitLabels'] = on;
    const Wd = world();
    const E = await engines(name, Wd);
    // a first walk's backlog is READ by construction: a new ask in "Invoice URGENT" arrives after it (unread — the leg's (b))
    clock += 60e3;   // after the listing instant (the read line of a first walk)
    Wd.get('c0').recs.push({ vendorId: 'c0-new', at: clock - 500, author: { id: 'u1', name: 'Ada', isSelf: false, isBot: false }, text: 'Invoice URGENT: second ask' });
    await E.eng.pass('im', { force: true });
    E.eng.digest();
    await idle(E.eng);
    const d = E.eng.digest();
    const judged = ['c0', 'c4'].every((id) => (tagOf(d, id) || {}).code === 'judged') && tagOf(d, 'c2') === null;
    // the owner answers in "Lunch plans" (judged 0.22 — a miss) an hour later; labels "Contract URGENT" themselves
    clock += 60 * 60e3;
    const c2 = Wd.get('c2');
    c2.recs.push({ vendorId: 'c2-me', at: clock - 1000, author: { id: 'me', name: 'Me', isSelf: true, isBot: false }, text: 'yes, noon works' });
    await E.eng.pass('im', { force: true });
    E.eng.labelJudged('im/c4', rowOf(d, 'c4').lastAt, 'needs');
    clock += 25 * 3600e3;   // a day passes — "Invoice URGENT" (listed) was never opened nor answered
    E.eng.digest();
    await idle(E.eng);
    const file = path.join(E.dataDir, 'decision-examples.json');
    const ex = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).examples : null;
    return { E, Wd, ex, judged, file };
  };
  const OFF = await run('implicit-off', false);
  ok(OFF.judged && OFF.ex.length === 1 && OFF.ex[0].key === 'im/c4' && !OFF.ex.some((x) => x.source === 'implicit') && OFF.E.eng.attention.status().implicit === 0, 'the switch OFF (the default): the reply and the unopened day write NOTHING — only the person\'s own label is in the file', OFF.ex);
  const ON = await run('implicit-on', true);
  const by = Object.fromEntries((ON.ex || []).map((x) => [x.key, x]));
  ok(ON.judged && by['im/c2'] && by['im/c2'].verdict === 'needs' && by['im/c2'].source === 'implicit', '(a) the owner replied in a row the judge put at 0.22 within 24 h of the verdict ⇒ an implicit "needs" example', by['im/c2']);
  ok(by['im/c0'] && by['im/c0'].verdict === 'not' && by['im/c0'].source === 'implicit', '(b) "Invoice URGENT" was listed (0.86) and left unopened and unanswered 24 h ⇒ an implicit "not"', by['im/c0']);
  ok(by['im/c4'] && by['im/c4'].verdict === 'needs' && !by['im/c4'].source && !by['im/c5'] && ON.E.eng.attention.status().implicit === 2, 'the person\'s own "needs" on Contract URGENT is untouched (an implicit one never replaces it); the 0.22 row nobody touched teaches nothing', ON.ex);
  // the next judged row's input: the person's label first, the inferred ones after it, marked
  const c5 = ON.Wd.get('c5');
  c5.recs.push({ vendorId: 'c5-new', at: clock - 1000, author: { id: 'u1', name: 'Ada', isSelf: false, isBot: false }, text: 'Newsletter: one more thing' });
  await ON.E.eng.pass('im', { force: true });
  const n2 = got.length;
  ON.E.eng.digest();
  await idle(ON.E.eng);
  const inp = String((got.slice(n2).find((g) => recordPart(g.body.input).includes('Newsletter')) || { body: {} }).body.input || '');
  const iMine = inp.indexOf('Contract URGENT'), iInf = inp.indexOf('(inferred)');
  ok(iMine > 0 && iInf > iMine && (inp.match(/\(inferred\)/g) || []).length === 2, 'the next call carries the person\'s label FIRST and the two inferred examples after it, each marked "(inferred)"', inp.split('———')[0].slice(-400));
  delete settings['decision.implicitLabels'];
}

console.log('⑫ B-dfa4: the judge\'s switch is read ONCE PER WALK — a walk over N rows rebuilt the plugin\'s settings N times (11.6 s in 3 holds on the owner\'s hub)');
{
  const walkRig = (mod) => {
    const dir = path.join(ROOT, `walk-${Math.random().toString(36).slice(2, 8)}`); fs.mkdirSync(dir, { recursive: true });
    const counted = { plug: { enabled: true, config: { attention: true } }, calls: 0 };
    const d = DE.create({ dataDir: dir, integrations: { resolveIntegration: () => ({ values: { provider: 'openai', apiKey: 'sk-dummy-SECRET-123456', model: '' }, source: 'user' }) }, fetchImpl: fakeFetch, now, log: quiet });
    d.attachPlugin({ peek: () => counted.plug, settings: () => { counted.calls++; return counted.plug.config || {}; } });
    const a = mod.create({ dataDir: dir, decision: d, now, log: quiet });
    return { a, counted, d };
  };
  const rows = Array.from({ length: 500 }, (_, i) => ({ key: `im/w${i}`, adapterId: 'im', lastAt: 1000 + i }));
  const walk = (a) => a.walk(() => { for (const en of rows) a.judgedFor(en); });   // a walk is a scope its caller marks (the engine marks digest and rows — ⑬)
  const ATT = require(path.join(REPO, 'src/server/channels-attention.js'));
  const R = walkRig(ATT);
  const k0 = R.counted.calls; R.d.settings(); const perCall = R.counted.calls - k0;   // what ONE settings read costs here
  await Promise.resolve(); await new Promise((r) => setImmediate(r));
  const c0 = R.counted.calls;
  walk(R.a);
  const one = R.counted.calls - c0;
  await Promise.resolve(); await new Promise((r) => setImmediate(r));
  R.counted.plug = { enabled: true, config: { attention: false } };   // a settings write BETWEEN two walks
  const c1 = R.counted.calls;
  walk(R.a);
  const two = R.counted.calls - c1;
  ok(perCall >= 1 && one === perCall && two === perCall && R.a.on() === false, `a walk over ${rows.length} rows reads the plugin's settings ONCE (${one} call${one === 1 ? '' : 's'} — one settings read is ${perCall}); the next walk reads again and sees a write made between them (${two}, switched off)`, JSON.stringify({ one, two }));
  // OUTSIDE a walk every read is fresh: a write and a read in the SAME tick see the write (the first cure kept the
  // switch to the next microtask — this suite's threshold and feature-off legs went red on the test machine)
  R.counted.plug = { enabled: true, config: { attention: true } };
  const sameTick = R.a.on();
  R.counted.plug = { enabled: true, config: { attention: false } };
  const sameTick2 = R.a.on();
  const inWalk = R.a.walk(() => { const x = R.a.on(); R.counted.plug = { enabled: true, config: { attention: true } }; return [x, R.a.on()]; });
  ok(sameTick === true && sameTick2 === false && inWalk[0] === false && inWalk[1] === false && R.a.on() === true, 'outside a walk a settings write and a read in the same tick see the write; inside ONE walk the switch is read once (a write inside it is seen by the next read after the walk)', { sameTick, sameTick2, inWalk });
  // CONTROL: the release's on() (asked per row)
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-attention.js'), 'utf8');
  const ON = '  function on() { return walkRead().on; }\n';
  ok(SRC.split(ON).length === 2, 'control setup: the walk-kept on() is present once');
  const MW = mutantCopies('att-walk', REPO);
  const Pre = MW.load('src/server/channels-attention.js', editAnchor(SRC, ON, '  function on() { return onNow(); }\n', "src/server/channels-attention.js"), 'per-row-on');
  const P = walkRig(Pre);
  const p0 = P.counted.calls;
  walk(P.a);
  ok(P.counted.calls - p0 >= rows.length * perCall, `RED CONTROL: the release's on() rebuilds the plugin's settings per row (${P.counted.calls - p0} for ${rows.length}) — the leg above is red on it`);
  for (const x of copiesCensus(MW.files, MW.dir, REPO, { minCopies: 1, label: '⑫ ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}

console.log('⑬ B-dfa4 (verdict): the law through the engine\'s OWN roads — a digest and a rows read the plugin\'s settings once over every row; a census holds every judge reader to a walk or to one row');
{
  // the judge is read PER ROW on two roads only: digest() (its first read, the needs-me count, the patch of kept rows —
  // all inside digest's walk) and rows() (the focus filter); every other reader reads ONE row
  const N = 80;
  const roadRig = async (mod, tag) => {
    const R = await engines(`roads-${tag}`, world(), mod);
    const ix = R.eng.store.index;
    await ix.update(() => { for (let i = 0; i < N; i++) Object.assign(ix.entry('im', `extra${i}`), { title: `Extra ${i}`, kind: 'group', lastAt: clock - (i + 10) * 60e3, unread: 1, readAt: 0 }); });
    let calls = 0;
    R.decision.attachPlugin({ peek: () => plug, settings: () => { calls++; return plug.config || {}; } });
    await Promise.resolve(); await new Promise((r) => setImmediate(r));
    const count = (fn) => { const c0 = calls; fn(); return calls - c0; };
    const out = { digest: count(() => R.eng.digest()), focus: count(() => R.eng.rows({ view: 'focus' })), all: count(() => R.eng.rows({ view: 'all' })), single: count(() => R.eng.attention.on()) };
    try { R.eng.stop(); } catch { }
    return out;
  };
  const got = await roadRig(ENG, 'real');
  ok(got.digest === got.single && got.focus === got.single && got.all <= got.single && got.single >= 1, `over ${N + 6} rows, ONE digest reads the plugin's settings as often as one read of the switch (${got.digest} = ${got.single}); one rows() of the focus view too (${got.focus}), of every row at most that (${got.all})`, got);
  const ESRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const MR = mutantCopies('att-roads', REPO);
  const WRAPS = [['digest', "  function digest(...args) { return attention.walk(() => digestWalk(...args)); }", "  function digest(...args) { return digestWalk(...args); }"], ['rows', "  function rows(...args) { return attention.walk(() => rowsWalk(...args)); }", "  function rows(...args) { return rowsWalk(...args); }"]];
  for (const [road, wrap, bare] of WRAPS) {
    ok(ESRC.split(wrap).length === 2, `control setup: ${road}'s walk wrapper is present once`);
    const c = await roadRig(MR.load('src/server/channels-engine.js', editAnchor(ESRC, wrap, bare, "src/server/channels-engine.js"), `no-${road}-walk`), `no-${road}`);
    const n = road === 'digest' ? c.digest : c.focus;
    // B-dfa4 cut 2: a digest's first read is KEPT — it judges the kept candidates and the judge's own rows, never every row —
    // so unwrapped it reads the settings once per row it JUDGES (more than once), where rows() still judges every row
    const need = road === 'digest' ? c.single + 2 : N;
    ok(n >= need, `RED CONTROL: ${road}'s walk wrapper removed — one ${road} reads the plugin's settings ${n} times over ${N + 6} rows (${road === 'digest' ? 'once per row it judges' : 'per row'})`, c);
  }
  // THE CENSUS: every engine function that reads the judge (attention.judgedFor / viewOf / on) or builds a row view
  // (rowView, which reads it) is a row of this table — a walk its road marks, a step reached only inside digest's walk
  // (its callers checked), or one row. A new reader is red until it says which.
  const ROADS = { digestWalk: 'walk', rowsWalk: 'walk', attnCount: 'in-digest', firstRead: 'in-digest', firstReadWalk: 'in-digest', firstReadOf: 'in-digest', attnRederive: 'in-digest', rowView: 'one-row', viewNow: 'one-row', conversationView: 'one-row', labelJudged: 'one-row' };
  // B-dfa4 cut 2: the kept first read and its definition (the walk) share firstReadOf; the gates' parity hook is a walk itself
  const INSIDE = new Set(['digestWalk', 'attnCount', 'attnPatch', 'totalsNow', 'attnRederive', 'firstRead', 'firstReadWalk', 'firstReadParity']);
  const census = (src) => {
    const L = src.split('\n');
    const owner = (i) => { for (let j = i; j >= 0; j--) { const m = /^  (?:async )?function (\w+)\(/.exec(L[j]) || /^    (\w+): (?:async )?\(/.exec(L[j]); if (m) return m[1]; } return '?'; };
    const callers = (name) => { const re = new RegExp(`(?:[^\\w.]|\\.\\.\\.)${name}\\(`);   // a call, a spread call (`...totalsNow(t)`)
    const out = new Set(); L.forEach((l, i) => { if (re.test(l) && !new RegExp(`function ${name}\\(`).test(l)) out.add(owner(i)); }); return [...out]; };
    const readers = new Set(); L.forEach((l, i) => { if (/attention\.(judgedFor|viewOf|on)\(|[^\w.]rowView\(/.test(l) && !/function rowView\(/.test(l)) readers.add(owner(i)); });
    const bad = [];
    for (const r of readers) if (!ROADS[r]) bad.push(`${r}: reads the judge per call and is no row of the census`);
    for (const [name, road] of Object.entries(ROADS)) {
      if (!readers.has(name)) bad.push(`${name}: a census row that reads nothing (dead)`);
      if (road === 'in-digest') for (const c of callers(name)) if (!INSIDE.has(c)) bad.push(`${name}: called from ${c}, outside digest's walk`);
    }
    for (const via of ['attnPatch', 'totalsNow']) for (const c of callers(via)) if (!INSIDE.has(c)) bad.push(`${via}: called from ${c}, outside digest's walk`);
    return { readers: [...readers].sort(), bad };
  };
  const real = census(ESRC);
  ok(!real.bad.length && real.readers.length === Object.keys(ROADS).length, `CENSUS: the ${real.readers.length} engine functions that read the judge are each a walk (digest, rows), a step inside digest's walk, or one row`, real);
  const stray = census(ESRC.replace("  function attentionTail(", "  function strayScan() { for (const en of Object.values(store.index.live())) attention.judgedFor(en, null); }\n  function attentionTail("));
  const leak = census(ESRC.replace("const pol = due.length || sig !== attnKept.sig ? attnRederive(due, t) : attnPolicies();", "const pol = due.length || sig !== attnKept.sig ? attnRederive(due, t) : attnPolicies(); function leakOut() { return firstRead(new Map(), {}, null); } leakOut;").replace("  function attentionTail(", "  function leakOut2() { return firstRead(new Map(), {}, null); }\n  function attentionTail("));
  ok(stray.bad.some((b) => b.startsWith('strayScan:')) && leak.bad.some((b) => b.startsWith('firstRead: called from leakOut2')), 'RED CONTROLS: a new function reading the judge row by row is named; a step of digest\'s walk called from outside it is named', { stray: stray.bad, leak: leak.bad });
  for (const x of copiesCensus(MR.files, MR.dir, REPO, { minCopies: 2, label: '⑬ ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}


console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
