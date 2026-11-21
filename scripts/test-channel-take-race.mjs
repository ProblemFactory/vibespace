#!/usr/bin/env node
// THE TAKE RACE — B-1ca5 (lane lg-text-legs-3): ONE DELIVERY STARTS AT MOST ONE BILLED TURN, across two chains and one ladder
// await. A billed site (wakeNow, flushScopeNow) takes the hand-over mark of what it is about to start BEFORE its first await;
// a start that took writes the mark over its takes, every other end gives them back by name; a second chain that meets a take
// waits for that start (bounded) and reads again. The REAL engine over the fake adapter, a stand-in ladder whose calls can be
// HELD (a stall placed in the window, never load) — every leg prints its count of starts, every lock has a RED control
// through anchored() (a moved line fails by name). Moved here from test-channel-revisions ⑧ (round w8ghfur9h, 主开发 r367:
// «the take-race legs move to a fast suite of their own»): the race, the digest first, both restarts; and the round's three —
// stop while a waiter is parked, the ONE deadline, the park judged at write time.
// PART B (round w5y5digbw — the shape): ② the ONE verdict every billed site asks at every read (its written table, the marks its
// reader sees, the census of its sites, must 2's law of order); ③ the family's finds in the engine — the in-flight row kept
// (r432), one message one turn for one watcher (must 1), the stop after the digest's wait; ④ the hand-over's clear of the same
// receiver's other rows at each of its three sites, only on a hand-over a restart keeps (must 3).
// THE REMAINDER (主开发 r1194 — THE DOOR): ⑥ three chains, then a restart: a record handed to a receiver is never started for it
// again, whatever row survives (the verdict reads the hand's own durable ledger); ⑦ the door keys the RECORD, never the vendor id.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Rev = require(path.join(REPO, 'src/channel-revisions.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok() was handed a ${typeof c} as its condition (arguments swapped, or not a verdict): ${n}`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const J = (x) => JSON.stringify(x);
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const FAKE = require(path.join(REPO, 'src/channels/fake.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const ROOT = scratchDir('chan-take-race');
const MUT = mutantCopies('chan-take-race', REPO);
const A = 'fake-poll', OPS = 'fake-poll-ops', ANN = 'fake-poll-announce';
const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker' };
const acc = (p) => ({ principal: p, authority: 'draft' });
const GRP = { kind: 'group', id: 'G' };
const NOTE_FROM = 'Channels · recalls';   // the rig's notes()/blocks() read it (the same stand-ins as test-channel-revisions')
/** One engine over `dataDir` — the same stand-ins as test-channel-revisions' (a fake adapter, a stub ladder that can be HELD,
 *  a stub stash); a restart = a second engine over the same folder and clock. */
function dayStartClock() { const t0 = Date.now(); const day0 = Math.floor(t0 / 86400e3) * 86400e3 + 60e3; let skew = 0; const f = () => day0 + (Date.now() - t0) + skew; f.advance = (ms) => { skew += ms; }; return f; }
/** One engine over `dataDir` (a restart = a second one over the same dir, the same clock): the fake answers a stored
 *  message by id from its revisions file; every by-id ask is counted; the stub ladder delivers, the stub stash keeps. */
function mkEngine(ENGM, dataDir, { clock = dayStartClock(), refuse = false, roster = null, readMembership = null, log = null, heldBound = null, gate = null, answer = null, stashThrows = null, onTakeWait = null, stashAnswer = null } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const REVS = path.join(dataDir, 'revisions.json');
  if (!fs.existsSync(REVS)) fs.writeFileSync(REVS, J({ revisions: {} }));
  const delivered = [], stashed = [], asked = [], refused = [], starts = [];
  const deliver = {
    // `refuse`: the ladder says no (the spend cap) — the engine stashes the refused block for the next turn
    // B-1ca5: `starts` = every ladder call (a billed turn's START); `gate(k)` = a promise the k-th call waits on (a STALL placed in
    // the window), `answer(k)` = a planted refusal for the k-th call, `stashThrows(cid, e)` = a planted stash failure
    deliverToConversation: async (cid, text, o) => { const k = starts.length; starts.push({ cid, text }); const g = gate ? gate(k) : null; if (g) await g; const a = answer ? answer(k) : null; if (a) { refused.push({ cid, text, o }); return a; } if (refuse) { refused.push({ cid, text, o }); return { ok: false, reason: 'the spend cap is reached', refused: 'cap' }; } delivered.push({ cid, text, o }); return { ok: true, lane: 'message' }; },
    stashFor: (cid, e) => { if (stashThrows && stashThrows(cid, e)) throw new Error('the stash refused (planted)'); stashed.push({ cid, ...e }); return stashAnswer ? stashAnswer(cid, e) : { stored: true }; },   // `stashAnswer`: a planted «held in memory only»
  };
  const registry = CH.createChannelRegistry();
  const fk = FAKE.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'], now: clock, revisionsFile: REVS });
  const mk0 = fk.create;
  fk.create = (record, deps) => { const a = mk0(record, deps); const by = a.revisionOf; a.revisionOf = (convId, o) => { asked.push(o && o.messageId); return by(convId, o); }; return a; };
  registry.register(fk);
  const eng = ENGM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: () => {}, userTodos: new UserTodoManager({ dataDir, now: clock }), deliver, now: clock, log: log || { log() {}, warn() {}, error() {} }, liveSessions: () => (roster ? roster() : [{ cid: 'agent-1', name: 'Worker', groups: [] }, { cid: 'agent-2', name: 'Other', groups: [] }]), readMembership, ...(heldBound ? { heldBound } : {}), ...(onTakeWait ? { onTakeWait } : {}) });
  const recall = (...vids) => { const j = JSON.parse(fs.readFileSync(REVS, 'utf8')); for (const v of vids) j.revisions[v] = { state: 'recalled' }; fs.writeFileSync(REVS, J(j)); };
  const tail = (c) => { const m = eng.messages(A, c, { limit: 5 }); return m.records || m; };
  const recOf = () => eng.adapterRecords().adapters.find((r) => r.id === A);
  const woke = (c) => ((eng.store.index.live()[`${A}/${c}`] || {}).wokeFor || []);
  const recalled = (c, vid) => !!Rev.recalledAtOf(eng.store.readSide(A, c, { msgs: new Set([vid]) }).filter((x) => x && x.k === 'fx'));
  const notes = () => stashed.filter((x) => x.fromName === NOTE_FROM);
  const blocks = () => stashed.filter((x) => x.fromName !== NOTE_FROM);   // the message blocks themselves (a stashed refusal, the free stash)
  // the cadence is one by-id ask per message per hour: the next pass an hour on re-reads what a wake carried
  const hourLater = async () => { clock.advance(61 * 60e3); return eng.pass(A, { force: true }); };
  return { eng, clock, delivered, refused, stashed, asked, starts, recall, tail, recOf, woke, recalled, notes, blocks, hourLater };
}

// RECORDS handed — the woken-for ledger's rows of ONE message for ONE receiver
const recs = (w, cid, r, conv = OPS) => w.woke(conv).filter((x) => x && x.cid === cid && x.vid === Rev.wokeKeyOf(r.vendorId)).length;
const pause = (ms) => new Promise((res) => setTimeout(res, ms));
/** A wait for WHAT HAPPENED, bounded: → whether it did. */
const waitFor = async (f, ms) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await pause(15); return !!f(); };
const src = engineSource(REPO);
// B-1ca5's remainder — THE DOOR: markOf reads the conversation's durable ledger (the hand's own write) when the memory map holds
// nothing, so a record handed to a receiver (or for a watcher) is never started for it again, whatever row survives. A control that
// wants the release's SECOND start after a restart therefore cuts the door too: the clears are no longer the only guard
const DOOR = '    return v === undefined ? ledgerMark(adapterId, convId, name, h) : markFrom(v);\n';
const noDoor = (x) => anchored(x, DOOR, '    return markFrom(v);\n', 'no-door');

console.log('① the take race: two chains, one ladder await, ONE start');
{
  // ── B-1ca5 (主开发 r199): ONE DELIVERY STARTS AT MOST ONE BILLED TURN, across two chains and one ladder await. THE STALL IN
  //    THE WINDOW (never load): the Task Group's wake hands m8 to agent-1 and is HELD inside its ladder await; the account
  //    digest — the SECOND chain (the account's scope chain), carrying the same m8 for the same agent — arrives while it is
  //    held. The cure: the first took the mark before its await; the second waits for that start, reads «handed», does
  //    nothing. A FAILED first start (refused, its stash refused) gives its take back by name: the second then starts, once ──
  // the second chain REACHED ITS READ: it waits for the start in flight (the engine's `onTakeWait`), or — in the release's
  // order, where nothing is taken — it starts its own ladder call; bounded, a red by name at the bound (never a fixed sleep)
  const reachedBy = (sig, ms = 5000) => { let tm = null; return Promise.race([sig.then(() => true), new Promise((r) => { tm = setTimeout(() => r(false), ms); })]).finally(() => clearTimeout(tm)); };
  async function raceLeg(ENGM, tag, { fail = false, waitMs = null } = {}) {
    let open = () => {}, entered = () => {}, reached = () => {};
    const gate1 = new Promise((r) => { open = r; }), in1 = new Promise((r) => { entered = r; }), atRead = new Promise((r) => { reached = r; });
    const w = mkEngine(ENGM, path.join(ROOT, tag), {
      roster: () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }],
      gate: (k) => (k === 0 ? (entered(), gate1) : (reached(), null)),
      onTakeWait: () => reached(),
      answer: (k) => (fail && k === 0 ? { ok: false, reason: 'the spend cap is reached (planted)', refused: 'cap' } : null),
      stashThrows: () => fail,
      heldBound: waitMs ? { takeWaitMs: waitMs } : null,
    });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m8 = w.tail(OPS).slice(-1)[0];
    const fresh = w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });   // the group's wake STARTS and is held in its ladder await; the account digest parks m8
    await in1;
    const second = w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // the SECOND chain arrives inside the window
    const atReadSeen = await reachedBy(atRead);   // it reached its read (waiting on the take, or starting in the release's order)
    if (waitMs) await second.then(() => {}, () => {});   // a bounded wait runs out BEFORE the first start's await ends
    open();   // the first start's await ends
    const [, d] = await Promise.all([fresh, second]);
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const pendFor = (pk) => ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m8.id && p.for === pk).length;
    const out = { atRead: atReadSeen, starts: w.starts.length, billed: w.delivered.length, refused: w.refused.length, toAgent1: w.starts.filter((x) => x.cid === 'agent-1').length, second: { ok: !!(d && d.ok), why: (d && d.why) || null }, rows: recs(w, 'agent-1', m8), keptDigest: pendFor('agent:agent-1') };
    await w.eng.stop();
    return out;
  }
  const NO_TAKE = '    const vW = judgeHits(rec.id, convId, pk, target.cid, hits, { ranOut: true, take: target.cid ? true : null });\n';   // B-1ca5 part B: the wake's take is made IN the verdict's call
  const NO_GIVE = '    } finally { giveBack(take); }   // B-1ca5: a start that did not take gives its takes back, by name (one that took is done already)\n';
  ok(src.split(NO_TAKE).length === 2 && src.split(NO_GIVE).length === 2, 'control setup: the wake\'s take and its give-back are present once each');
  const rc = await raceLeg(ENG, 'race');
  console.log(`    starts (ladder calls) — the race, cured: ${rc.starts} (billed ${rc.billed})`);
  ok(rc.atRead && rc.starts === 1 && rc.billed === 1 && rc.rows === 1 && !rc.second.ok,
    `B-1ca5: two chains, one ladder await, ONE delivery — the second chain found the first's mark, waited, and did nothing: ${rc.starts} start (${rc.billed} billed; the digest: ${rc.second.why})`, J(rc));
  const rcR = await raceLeg(MUT.load('src/server/channels-engine.js', anchored(src, NO_TAKE, NO_TAKE.replace('take: target.cid ? true : null', 'take: null'), 'mark-after-the-await'), 'mark-after-the-await'), 'race-red');
  console.log(`    starts (ladder calls) — the release's order (the mark written only after the await): ${rcR.starts} (billed ${rcR.billed})`);
  ok(rcR.atRead && rcR.starts === 2 && rcR.billed === 2, `RED CONTROL: the release's order (no take before the await) — the second chain read the mark empty: ${rcR.starts} starts, ${rcR.billed} billed for ONE delivery`, J(rcR));
  const fl = await raceLeg(ENG, 'race-fail', { fail: true });
  console.log(`    starts (ladder calls) — the first start refused, its take given back: ${fl.starts} (billed ${fl.billed}, refused ${fl.refused})`);
  ok(fl.atRead && fl.starts === 2 && fl.billed === 1 && fl.refused === 1 && fl.second.ok && fl.rows === 1,
    `B-1ca5: the FIRST start refused (its stash refused too) GIVES ITS TAKE BACK by name — the second chain then starts the delivery, ONCE: ${fl.billed} billed (${fl.starts} starts, ${fl.refused} refused)`, J(fl));
  const flR = await raceLeg(MUT.load('src/server/channels-engine.js', anchored(src, NO_GIVE, '    } finally { }\n', 'take-never-given-back'), 'take-never-given-back'), 'race-fail-red', { fail: true, waitMs: 300 });
  console.log(`    starts (ladder calls) — a take never given back: ${flR.starts} (billed ${flR.billed})`);
  ok(flR.atRead && flR.billed === 0 && !flR.second.ok && flR.keptDigest === 1, `RED CONTROL: a refused start that never gives its take back holds the delivery back — the second chain waited its bound and started nothing: ${flR.billed} billed; its own row KEPT past the bound (${flR.keptDigest}), never cleared`, J(flR));
  // B-1ca5 follow-up (round wb6bftuuc) — THE OTHER ORDER: the DIGEST starts first and is held in its ladder await; the Task
  // Group's wake (the conversation's chain) carries the same m8 to the same agent second. The digest's own take and give-back,
  // each with its own RED control.
  async function digestFirstLeg(ENGM, tag, { fail = false, waitMs = null } = {}) {
    let open = () => {}, entered = () => {}, reached = () => {};
    const gate1 = new Promise((r) => { open = r; }), in1 = new Promise((r) => { entered = r; }), atRead = new Promise((r) => { reached = r; });
    const live = { 'agent-1': [] };   // agent-1 joins G only after m8 is parked: the group's row holds m8 meanwhile
    const w = mkEngine(ENGM, path.join(ROOT, tag), {
      roster: () => [{ cid: 'agent-1', name: 'Worker', groups: live['agent-1'] }, { cid: 'agent-2', name: 'Other', groups: [] }],
      gate: (k) => (k === 0 ? (entered(), gate1) : (reached(), null)),
      answer: (k) => (fail && k === 0 ? { ok: false, reason: 'the spend cap is reached (planted)', refused: 'cap' } : null),
      stashThrows: () => fail,
      onTakeWait: () => reached(),
      heldBound: waitMs ? { takeWaitMs: waitMs } : null,
    });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const [m7, m8] = w.tail(OPS).slice(-2);
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });   // the group has no live member: m8 waits as its row; the digest parks it too
    live['agent-1'] = ['G'];
    const first = w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // the DIGEST starts first and is held in its ladder await
    await in1;
    const second = w.eng.onFresh(w.recOf(), OPS, [m7], { origin: 'test' });   // the group's wake carries m8 (its row) + m7 to agent-1
    const atReadSeen = await reachedBy(atRead);
    if (waitMs) await second.then(() => {}, () => {});
    open();
    const [d] = await Promise.all([first, second]);
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const out = { atRead: atReadSeen, starts: w.starts.length, billed: w.delivered.length, digest: { ok: !!(d && d.ok) }, m8: recs(w, 'agent-1', m8), m7: recs(w, 'agent-1', m7),
      keptGroup: ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m8.id && p.for === 'group:G').length };
    await w.eng.stop();
    return out;
  }
  const DIGEST_TAKE = '        const vR = judgeHits(rec.id, h.id, pk, target.cid, g.hits, { ranOut: true, take: take || true });\n';   // B-1ca5 part B: the digest's take is made IN its read after the wait
  const DIGEST_GIVE = '      } finally { giveBack(take); }   // B-1ca5: a digest that did not take gives its takes back, by name\n';
  ok(src.split(DIGEST_TAKE).length === 2 && src.split(DIGEST_GIVE).length === 2, 'control setup: the digest\'s take and its give-back are present once each');
  const df = await digestFirstLeg(ENG, 'digest-first');
  console.log(`    starts (ladder calls) — the digest first, the group's wake second: ${df.starts} (m8 handed ${df.m8} time(s))`);
  ok(df.atRead && df.digest.ok && df.m8 === 1 && df.m7 === 1, `B-1ca5, THE OTHER ORDER: the digest took m8 before its await; the group's wake met the take, waited, and carried only m7 — m8 handed ONCE (${df.m8}), ${df.starts} starts`, J(df));
  const dfR = await digestFirstLeg(MUT.load('src/server/channels-engine.js', anchored(src, DIGEST_TAKE, DIGEST_TAKE.replace('take: take || true', 'take: null'), 'digest-no-take'), 'digest-no-take'), 'digest-first-red');
  console.log(`    starts (ladder calls) — the digest without its take: ${dfR.starts} (m8 handed ${dfR.m8} time(s))`);
  ok(dfR.m8 === 2, `RED CONTROL: the digest without its take — the group's wake read the mark empty and handed m8 again: ${dfR.m8} times`, J(dfR));
  const dfg = await digestFirstLeg(ENG, 'digest-first-fail', { fail: true });
  console.log(`    starts (ladder calls) — the digest refused, its take given back: ${dfg.starts} (m8 handed ${dfg.m8} time(s))`);
  ok(dfg.atRead && !dfg.digest.ok && dfg.m8 === 1, `B-1ca5: the DIGEST refused (its stash refused too) gives its take back by name — the group's wake then hands m8 ONCE (${dfg.m8})`, J(dfg));
  const dfgR = await digestFirstLeg(MUT.load('src/server/channels-engine.js', anchored(src, DIGEST_GIVE, '      } finally { }\n', 'digest-never-gives-back'), 'digest-never-gives-back'), 'digest-first-fail-red', { fail: true, waitMs: 300 });
  ok(dfgR.m8 === 0 && dfgR.keptGroup === 1, `RED CONTROL: a refused digest that never gives its take back — the group's wake waited its bound, handed m8 to nobody (${dfgR.m8}), its row KEPT (${dfgR.keptGroup})`, J(dfgR));

  // B-1ca5 follow-up (1) — A RESTART AFTER A WAIT THAT RAN OUT: the digest's wait runs out (its row kept), the group's start
  // then hands m8, the hub restarts, the digest is flushed again: the kept row learned that m8 was handed — no second start
  async function restartLeg(ENGM, tag) {
    let open = () => {}, entered = () => {}, reached = () => {};
    const gate1 = new Promise((r) => { open = r; }), in1 = new Promise((r) => { entered = r; }), atRead = new Promise((r) => { reached = r; });
    const roster = () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }];
    const dataDir = path.join(ROOT, tag);
    const w = mkEngine(ENGM, dataDir, { roster, gate: (k) => (k === 0 ? (entered(), gate1) : null), onTakeWait: () => reached(), heldBound: { takeWaitMs: 200 } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m8 = w.tail(OPS).slice(-1)[0];
    const fresh = w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });   // the group's wake takes m8 and is held
    await in1;
    const d1 = await w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // the digest waits 200 ms, runs out, keeps its row
    const atReadSeen = await reachedBy(atRead, 1);
    const keptThen = ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m8.id && p.for === 'agent:agent-1').length;
    open(); await fresh;   // the group's start hands m8
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const keptAfter = ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m8.id && p.for === 'agent:agent-1').length;
    const s1 = w.starts.length;
    await w.eng.stop();
    const w2 = mkEngine(ENGM, dataDir, { clock: w.clock, roster });   // THE RESTART: the mark in memory is gone
    const d2 = await w2.eng.flushScope(A, 'account', null, 'agent:agent-1');
    if (w2.eng.settleWakes) await w2.eng.settleWakes();
    const out = { atRead: atReadSeen, firstDigest: (d1 && d1.why) || null, keptThen, keptAfter, startsBefore: s1, startsAfterRestart: w2.starts.length, afterRestart: { ok: !!(d2 && d2.ok), why: (d2 && d2.why) || null }, m8: recs(w2, 'agent-1', m8) };
    await w2.eng.stop();
    return out;
  }
  const KEPT_CLEAR = '      if (ok || stashKept) clearKept(e2, take, convId);   // B-1ca5 follow-up (1): the rows waiters kept for this start, in the same durable write — only on a hand-over a restart keeps (must 3)\n';
  ok(src.split(KEPT_CLEAR).length === 2, 'control setup: the wake\'s clear of the rows kept for it is present once');
  const rs = await restartLeg(ENG, 'restart');
  console.log(`    starts (ladder calls) — before the restart ${rs.startsBefore}, after it ${rs.startsAfterRestart}`);
  ok(rs.atRead && rs.keptThen === 1 && rs.keptAfter === 0 && rs.startsBefore === 1 && rs.startsAfterRestart === 0 && rs.m8 === 1,
    `B-1ca5 follow-up: the digest's wait ran out and its row was KEPT (${rs.keptThen}); the group's start then handed m8 and cleared it in its own write (${rs.keptAfter}); after a RESTART nothing starts again (${rs.startsAfterRestart}) — m8 handed once`, J(rs));
  const RCV_CLEAR = '      if (ok || stashKept) clearForReceiver(e2, target.cid, hits, pk);   // B-1ca5 round w8ghfur9h: the same receiver\'s rows on other roads, in the same write\n';
  const rsR = await restartLeg(MUT.load('src/server/channels-engine.js', noDoor(anchored(anchored(src, KEPT_CLEAR, '', 'kept-row-never-learns'), RCV_CLEAR, '', 'receiver-rows-never-cleared')), 'kept-row-never-learns'), 'restart-red');
  console.log(`    starts (ladder calls) — the kept row never learns: before ${rsR.startsBefore}, after the restart ${rsR.startsAfterRestart}`);
  ok(rsR.keptAfter === 1 && rsR.startsAfterRestart === 1 && rsR.m8 === 2, `RED CONTROL: a kept row that never learns its message was handed — after the restart the digest starts m8 AGAIN: ${rsR.startsBefore} + ${rsR.startsAfterRestart} starts, m8 handed ${rsR.m8} times`, J(rsR));
  // B-1ca5's remainder — THE DOOR ALONE: the same scene with both clears CUT but the door kept: the stale row survives the hand's
  // write, and after the RESTART the verdict reads the ledger (handed to agent-1) and starts nothing — whatever row survived
  const rsD = await restartLeg(MUT.load('src/server/channels-engine.js', anchored(anchored(src, KEPT_CLEAR, '', 'kept-row-never-learns'), RCV_CLEAR, '', 'receiver-rows-never-cleared'), 'door-alone'), 'restart-door-alone');
  console.log(`    starts (ladder calls) — the clears cut, the door kept: before ${rsD.startsBefore}, after the restart ${rsD.startsAfterRestart} (the row survived the hand: ${rsD.keptAfter})`);
  ok(rsD.keptAfter === 1 && rsD.startsAfterRestart === 0 && rsD.m8 === 1, `THE DOOR (B-1ca5's remainder): with both clears cut the stale row SURVIVES the hand (${rsD.keptAfter}), and after the restart the verdict reads the hand's own durable ledger — nothing starts again (${rsD.startsAfterRestart}); m8 handed once`, J(rsD));
  // B-1ca5 follow-up, the round's check (主开发 r362) — THE RESTART IN THE OTHER ORDER: the DIGEST hands m8 while the group's wake
  // waited past its bound and KEPT its row; the digest's own durable write clears that row (its ticket marked handed BEFORE the
  // write); after a RESTART the group's flush starts nothing (at 31388d007 the digest marked its ticket only after the write)
  async function digestRestartLeg(ENGM, tag) {
    let open = () => {}, entered = () => {}, reached = () => {};
    const gate1 = new Promise((r) => { open = r; }), in1 = new Promise((r) => { entered = r; }), atRead = new Promise((r) => { reached = r; });
    const live = { 'agent-1': [] };
    const roster = () => [{ cid: 'agent-1', name: 'Worker', groups: live['agent-1'] }, { cid: 'agent-2', name: 'Other', groups: [] }];
    const dataDir = path.join(ROOT, tag);
    const w = mkEngine(ENGM, dataDir, { roster, gate: (k) => (k === 0 ? (entered(), gate1) : null), onTakeWait: () => reached(), heldBound: { takeWaitMs: 200 } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const [m7, m8] = w.tail(OPS).slice(-2);
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });   // the group's row and the digest's row both hold m8
    live['agent-1'] = ['G'];
    const first = w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // the DIGEST takes m8 and is held
    await in1;
    await w.eng.onFresh(w.recOf(), OPS, [m7], { origin: 'test' });   // the group's wake waits 200 ms, runs out, KEEPS its m8 row, carries m7
    const atReadSeen = await reachedBy(atRead, 1);
    const pendG = () => ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m8.id && p.for === 'group:G').length;
    const keptThen = pendG();
    open(); await first;   // the digest hands m8 — its write clears the kept row
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const keptAfter = pendG();
    const digestRowM7 = ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m7.id && p.for === 'agent:agent-1').length;   // before the restart: the digest's own m7 row, once the group's wake handed m7
    await w.eng.stop();
    const w2 = mkEngine(ENGM, dataDir, { clock: w.clock, roster: () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }] });   // THE RESTART
    await w2.eng.flushPending(A, OPS);   // the group's pending flush (as the boot's)
    if (w2.eng.settleWakes) await w2.eng.settleWakes();
    const out = { atRead: atReadSeen, keptThen, keptAfter, startsAfterRestart: w2.starts.length, m8: recs(w2, 'agent-1', m8), m7: recs(w2, 'agent-1', m7), digestRowM7 };
    await w2.eng.stop();
    return out;
  }
  const DIGEST_KEPT_CLEAR = '          if (ok || stashKept) clearKept(e2, take, h.id);   // B-1ca5 follow-up (1): the rows waiters kept for this digest, in the same durable write — only on a hand-over a restart keeps (must 3)\n';
  ok(src.split(DIGEST_KEPT_CLEAR).length === 2, 'control setup: the digest\'s clear of the rows kept for it is present once');
  const dr = await digestRestartLeg(ENG, 'digest-restart');
  console.log(`    starts (ladder calls) — after the restart, the digest having handed m8: ${dr.startsAfterRestart} (m8 handed ${dr.m8} time(s))`);
  ok(dr.atRead && dr.keptThen === 1 && dr.keptAfter === 0 && dr.startsAfterRestart === 0 && dr.m8 === 1 && dr.m7 === 1 && dr.digestRowM7 === 0,
    `B-1ca5 follow-up, THE OTHER ORDER: the group's wake KEPT its m8 row past its wait (${dr.keptThen}); the DIGEST then handed m8 and cleared that row in its own write (${dr.keptAfter}); the group's wake handed m7 and cleared the digest's own m7 row (the same receiver, another road: ${dr.digestRowM7}); after a RESTART nothing starts (${dr.startsAfterRestart}) — m8 and m7 handed once each`, J(dr));
  const drRcv = await digestRestartLeg(MUT.load('src/server/channels-engine.js', noDoor(anchored(src, RCV_CLEAR, '', 'receiver-rows-never-cleared')), 'receiver-rows-never-cleared'), 'digest-restart-rcv-red');
  ok(drRcv.digestRowM7 === 1 && drRcv.m7 === 2, `RED CONTROL: a hand-over that leaves the same receiver's row on another road — the digest's m7 row survives the group's hand-over (${drRcv.digestRowM7}) and after the restart m7 is handed AGAIN: ${drRcv.m7} times`, J(drRcv));
  const drR = await digestRestartLeg(MUT.load('src/server/channels-engine.js', noDoor(anchored(src, DIGEST_KEPT_CLEAR, '', 'digest-kept-row-never-learns')), 'digest-kept-row-never-learns'), 'digest-restart-red');
  console.log(`    starts (ladder calls) — the digest's kept rows never cleared: after the restart ${drR.startsAfterRestart} (m8 handed ${drR.m8} time(s))`);
  ok(drR.keptAfter === 1 && drR.startsAfterRestart === 1 && drR.m8 === 2, `RED CONTROL: the digest's kept row never learns (as at 31388d007, where its ticket said «handed» only after its write) — after the restart the group's flush hands m8 AGAIN: ${drR.m8} times`, J(drR));

  // ── B-1ca5 round w8ghfur9h (主开发 r367) — THE THREE THE ROUND ASKED ──

  // (1) STOP WHILE A WAITER IS PARKED: the digest takes m8 and is held; the group's wake carries m8 (its row) + m7 and waits for
  //     the digest's start; stop() settles that wait AT ONCE, and the wake starts NOTHING of what is left of its block (m7 is
  //     held for the next boot, never billed after the stop)
  async function stopLeg(ENGM, tag) {
    let open = () => {}, entered = () => {}, reached = () => {};
    const gate1 = new Promise((r) => { open = r; }), in1 = new Promise((r) => { entered = r; }), atRead = new Promise((r) => { reached = r; });
    const live = { 'agent-1': [] };
    const w = mkEngine(ENGM, path.join(ROOT, tag), {
      roster: () => [{ cid: 'agent-1', name: 'Worker', groups: live['agent-1'] }, { cid: 'agent-2', name: 'Other', groups: [] }],
      gate: (k) => (k === 0 ? (entered(), gate1) : null),
      onTakeWait: () => reached(),
    });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const [m7, m8] = w.tail(OPS).slice(-2);
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
    live['agent-1'] = ['G'];
    const first = w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // the digest takes m8 and is held (#0)
    await in1;
    const second = w.eng.onFresh(w.recOf(), OPS, [m7], { origin: 'test' });   // the group's wake: m8 (its row) + m7 — m8 taken, so it waits
    const parked = await reachedBy(atRead);
    const stopping = Promise.resolve(w.eng.stop());   // stop while the waiter is parked (its own bound is 30 s)
    const settled = await reachedBy(second.then(() => true, () => true));   // it settles at the stop — not at its 30 s bound
    const startsAfterStop = w.starts.length - 1;   // #0 is the digest's held call
    open(); await first.then(() => {}, () => {}); await stopping;
    const m7held = ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m7.id && p.for === 'group:G').length;
    return { parked, settled, startsAfterStop, m7held };
  }
  const STOP_AFTER_WAIT = '    // B-1ca5 round w8ghfur9h: a wait that stop() settled — what is left of the block is HELD (as the stop path at the top), never started\n    if (stopped) {\n';
  const sp = await stopLeg(ENG, 'stop-waiter');
  console.log(`    starts (ladder calls) — stop() while the group's wake waited: ${sp.startsAfterStop} after the stop (the wait settled at the stop: ${sp.settled})`);
  ok(sp.parked && sp.settled && sp.startsAfterStop === 0 && sp.m7held === 1,
    `round w8ghfur9h (1): stop() while a waiter is parked — the wait settles AT THE STOP (never at its 30 s bound) and the wake starts NOTHING of its block (${sp.startsAfterStop} starts after the stop); m7 is held for the next boot (${sp.m7held})`, J(sp));
  const spR = await stopLeg(MUT.load('src/server/channels-engine.js', anchored(src, STOP_AFTER_WAIT, STOP_AFTER_WAIT.replace('    if (stopped) {\n', '    if (false) {\n'), 'no-stop-after-wait'), 'stop-after-wait'), 'stop-waiter-red');
  ok(spR.startsAfterStop === 1, `RED CONTROL: the wake that does not read the stop again after its wait starts m7 AFTER the stop: ${spR.startsAfterStop} start(s)`, J(spR));

  // (2) ONE DEADLINE: two conversations, each with a record a Task Group's wake holds in flight; the account digest carries both
  //     and waits ONE bound for its whole block — both waits read the same deadline (the engine's `onTakeWait` says it)
  async function deadlineLeg(ENGM, tag) {
    const opens = [], ins = [];
    const gates = [0, 1].map(() => new Promise((r) => { opens.push(r); }));
    const entered = [0, 1].map(() => new Promise((r) => { ins.push(r); }));
    const waits = [];
    const w = mkEngine(ENGM, path.join(ROOT, tag), {
      roster: () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }],
      gate: (k) => (k <= 1 ? (ins[k](), gates[k]) : null),
      onTakeWait: (x) => waits.push({ convId: x.convId, until: x.until }),
      heldBound: { takeWaitMs: 300 },
    });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    for (const c of [OPS, ANN]) await w.eng.setGrain(A, { kind: 'conversation', convId: c }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const o = w.tail(OPS).slice(-1)[0], a = w.tail(ANN).slice(-1)[0];
    const f1 = w.eng.onFresh(w.recOf(), OPS, [o], { origin: 'test' }); await entered[0];   // the Ops room's group wake holds o in flight (#0)
    const f2 = w.eng.onFresh(w.recOf(), ANN, [a], { origin: 'test' }); await entered[1];   // the announcements' group wake holds a in flight (#1)
    const pendD = (c, rec) => ((w.eng.store.index.live()[`${A}/${c}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === rec.id && p.for === 'agent:agent-1').length;
    const parked = await waitFor(() => pendD(OPS, o) === 1 && pendD(ANN, a) === 1, 3000);
    const t0 = Date.now();
    const d = await w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // the digest carries o and a: one bound for both
    const waitedMs = Date.now() - t0;
    opens.forEach((f) => f()); await Promise.all([f1, f2]);
    if (w.eng.settleWakes) await w.eng.settleWakes();
    await w.eng.stop();
    return { parked, waits, sameDeadline: waits.length === 2 && waits[0].until === waits[1].until, apart: waits.length === 2 ? waits[1].until - waits[0].until : null, waitedMs, digest: (d && d.why) || null };
  }
  const DEADLINE = '      if (target.cid) for (const h of held) if (judgeHits(rec.id, h.id, pk, target.cid, h.carried.hits).wait.length) await waitTaken(rec.id, h.id, names, h.carried.hits, until);   // B-1ca5 part B: the verdict at this read\n';
  const dl = await deadlineLeg(ENG, 'one-deadline');
  console.log(`    the digest's block over two held conversations waited ${dl.waitedMs} ms (its bound 300 ms); the two waits' deadlines ${dl.apart} ms apart`);
  ok(dl.parked && dl.sameDeadline, `round w8ghfur9h (2): ONE DEADLINE — the digest's two waits (two conversations, each with a record in flight) read the same deadline (${dl.apart} ms apart; the block waited ${dl.waitedMs} ms for a bound of 300)`, J(dl));
  const dlR = await deadlineLeg(MUT.load('src/server/channels-engine.js', anchored(src, DEADLINE, DEADLINE.replace('h.carried.hits, until);', 'h.carried.hits);'), 'deadline-not-handed'), 'deadline-not-handed'), 'one-deadline-red');   // stale-pins: kept (the control plants the wait without its deadline)
  ok(dlR.waits.length === 2 && dlR.apart >= 250, `RED CONTROL: the deadline not handed to the wait — each conversation waits a bound of its own: the deadlines ${dlR.apart} ms apart (the block waited ${dlR.waitedMs} ms)`, J(dlR));

  // (3) THE PARK JUDGED AT WRITE TIME: the group's wake for a FRESH r meets the digest's take, waits its bound, runs out — and its
  //     park of r lands only AFTER the digest has handed r (its write held in the window by the leg). keepPending's `skip` reads
  //     the ticket handed at write time: the row is never written, so a restart finds nothing to start again
  async function parkLeg(ENGM, tag) {
    const opens = [], ins = [];
    const gates = [0, 1].map(() => new Promise((r) => { opens.push(r); }));
    const entered = [0, 1].map(() => new Promise((r) => { ins.push(r); }));
    let reached = () => {};
    const atRead = new Promise((r) => { reached = r; });
    const w = mkEngine(ENGM, path.join(ROOT, tag), {
      roster: () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }],
      gate: (k) => (k <= 1 ? (ins[k](), gates[k]) : null),
      onTakeWait: () => reached(),
      heldBound: { takeWaitMs: 200 },
    });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const [r0, r] = w.tail(OPS).slice(-2);
    const pend = (rec, pk) => ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === rec.id && p.for === pk).length;
    const f0 = w.eng.onFresh(w.recOf(), OPS, [r0], { origin: 'test' }); await entered[0];   // a blocker: the group's wake for r0 holds the chain (#0)
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });   // the digest watches from now on (r0 is not its)
    const f1 = w.eng.onFresh(w.recOf(), OPS, [r], { origin: 'test' });   // r: the digest parks it; the group's wake for r queues behind #0
    const parkedForDigest = await waitFor(() => pend(r, 'agent:agent-1') === 1, 3000);
    const d = w.eng.flushScope(A, 'account', null, 'agent:agent-1'); await entered[1];   // the DIGEST takes r and is held (#1)
    const upd0 = w.eng.store.index.update.bind(w.eng.store.index);
    let armed = false, release = () => {}, inHold = () => {};
    const holding = new Promise((res) => { inHold = res; }), gateW = new Promise((res) => { release = res; });
    w.eng.store.index.update = async (fn, o) => { if (armed) { armed = false; inHold(); await gateW; } return upd0(fn, o); };
    opens[0]();   // the blocker ends: the queued wake for r runs, finds r taken by the digest, and waits
    const waiting = await reachedBy(atRead);
    armed = true;   // its next write — the one after its bound runs out — is held in the window
    const held = await reachedBy(holding, 3000);
    opens[1](); await d;   // the digest hands r: its ticket says handed, its own write runs (the waiter's still held)
    release(); await f1; await f0;
    w.eng.store.index.update = upd0;
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const out = { parkedForDigest, waiting, held, rRow: pend(r, 'group:G'), handed: recs(w, 'agent-1', r), starts: w.starts.length };
    await w.eng.stop();
    return out;
  }
  const PARK_SKIP = "      const hits = hits0 && typeof hits0.skip === 'function' ? hits0.filter((h) => !hits0.skip(h)) : hits0;   // B-1ca5 follow-up: judged when the row is WRITTEN\n";
  const pk1 = await parkLeg(ENG, 'park-at-write');
  console.log(`    the waiter's late park, written after the digest handed r: ${pk1.rRow} row(s) (r handed ${pk1.handed} time(s))`);
  ok(pk1.parkedForDigest && pk1.waiting && pk1.held && pk1.rRow === 0 && pk1.handed === 1,
    `round w8ghfur9h (3): THE PARK JUDGED AT WRITE TIME — the waiter's park of r landed after the digest handed r, read the ticket handed, and wrote nothing (${pk1.rRow} rows; r handed once)`, J(pk1));
  const pkR = await parkLeg(MUT.load('src/server/channels-engine.js', anchored(src, PARK_SKIP, "      const hits = hits0;\n", 'park-not-judged'), 'park-not-judged'), 'park-at-write-red');
  ok(pkR.rRow === 1, `RED CONTROL: a park NOT judged at write time writes r's row after r was handed — a row a restart would start again (${pkR.rRow})`, J(pkR));
}

console.log('② THE ONE VERDICT (B-1ca5 part B, round w5y5digbw): its table, the marks its reader sees, and the census of its sites');
{
  const V = require(path.join(REPO, 'src/server/channels-verdict.js'));
  // THE TABLE, written out — «watcher receiver after-the-wait → verdict». Marks: - none · H handed · F in flight by ANOTHER
  // start · O in flight by THIS chain's own take. Every combination (4 × 4 × 2 = 32); the family's three finds are named rows
  const TABLE = `
    - - 0 deliver | - - 1 deliver | - H 0 spent | - H 1 spent | - F 0 wait | - F 1 kept | - O 0 deliver | - O 1 deliver
    H - 0 spent | H - 1 spent | H H 0 spent | H H 1 spent | H F 0 spent | H F 1 spent | H O 0 spent | H O 1 spent
    F - 0 wait | F - 1 kept | F H 0 spent | F H 1 spent | F F 0 wait | F F 1 kept | F O 0 wait | F O 1 kept
    O - 0 deliver | O - 1 deliver | O H 0 spent | O H 1 spent | O F 0 wait | O F 1 kept | O O 0 deliver | O O 1 deliver`;
  const NAMED = {
    '- H 1': 'r362 — a KEPT row whose holder handed (its write marked the receiver first): spent, never started again',
    'F - 0': 'r432 — the FIRST read while another start holds the record under this watcher: wait, never spent (the loss)',
    'H - 1': 'w5y5digbw must 1 — the read AFTER the wait, the block handed it to another member of this watcher: spent, never delivered again',
  };
  const OWN = { id: 'own' }, OTHER = { id: 'other' };
  const MK = { '-': null, H: { handed: true }, F: { flying: OTHER }, O: { flying: OWN } };
  const rows = TABLE.trim().split(/\s*\|\s*|\n\s*/).filter(Boolean).map((x) => x.trim().split(/\s+/));
  const wrong = [];
  for (const [w, r, t, want] of rows) { const got = V.deliveryVerdict({ watcher: MK[w], receiver: MK[r], own: OWN, ranOut: t === '1' }); if (got !== want || !V.VERDICTS.includes(got)) wrong.push({ row: `${w} ${r} ${t}`, want, got }); }
  const combos = new Set(rows.map(([w, r, t]) => `${w} ${r} ${t}`));
  console.log(`    the table: ${rows.length} rows, ${combos.size} distinct combinations, ${wrong.length} wrong`);
  ok(rows.length === 32 && combos.size === 32 && wrong.length === 0, `THE TABLE: every combination of the record's marks under the watcher's name and the receiver's, before and after the wait, answers its written verdict (${rows.length} rows, ${wrong.length} wrong)`, J(wrong));
  for (const [row, name] of Object.entries(NAMED)) {
    const [w, r, t] = row.split(' '), want = rows.find((x) => x.slice(0, 3).join(' ') === row)[3];
    ok(V.deliveryVerdict({ watcher: MK[w], receiver: MK[r], own: OWN, ranOut: t === '1' }) === want, `THE TABLE'S NAMED ROW «${row} → ${want}»: ${name}`);
  }
  // THE MARKS ITS READER SEES (markFrom): the hand-over map's raw value → a mark — a ticket that took reads HANDED (the r362
  // order: a start marks its ticket handed before its durable write), one given back reads nothing, one in flight is its ticket
  const tkOpen = { done: false }, tkTook = { done: true, handed: true }, tkBack = { done: true, handed: false };
  const MF = [[undefined, null], [1795200000000, { handed: true }], [{ ticket: tkOpen, at: 1 }, { flying: tkOpen }], [{ ticket: tkTook, at: 1 }, { handed: true }], [{ ticket: tkBack, at: 1 }, null]];
  const mfWrong = MF.filter(([v, want]) => { const got = V.markFrom(v); return !(got === want || (got && want && got.handed === want.handed && got.flying === want.flying)); });
  ok(mfWrong.length === 0, `THE MARKS: never marked → none; a time → handed; a take in flight → that start's ticket; a take that TOOK → handed (r362: the clear judged after the mark); a take given back → none (${MF.length} rows)`, J(mfWrong.map(([v]) => v)));

  // THE CENSUS (round w5y5digbw): the billed sites read the marks ONLY through the verdict's reader. markOf / deliveryVerdict are
  // called inside judgeHits alone (markFrom inside markOf), takeOf only by the wait and the ticket list, the map itself only by
  // the mark's own writers; each billed site (wakeNow, flushScopeNow, stashHits) asks judgeHits. A hand read is red BY NAME.
  function markCensus(text) {
    const RULES = [
      [/\bmarkOf\(/, 'markOf', ['judgeHits']],
      [/\bdeliveryVerdict\(/, 'deliveryVerdict', ['judgeHits']],
      [/\bmarkFrom\(/, 'markFrom', ['markOf']],
      [/\btakeOf\(/, 'takeOf', ['ticketsOf', 'waitTaken']],
      [/\bhanded\.(get|has)\(|\bof handed\b/, 'the hand-over map', ['markHanded', 'takeOf', 'markOf', 'takeHits', 'giveBack']],
      // round wig9owq5o: a TICKET's state is a mark too — the starts that hold a record (ticketsOf) and whether one handed (.handed)
      [/\bticketsOf\(/, 'ticketsOf (the starts holding a record)', ['keepFor', 'skipHandedOf']],
      [/\.handed\b/, 'a ticket\'s state (.handed)', ['tookIt', 'clearKept', 'skipHandedOf']],
    ];
    const out = [], asks = new Set();
    let fn = null;
    for (const l of text.split('\n')) {
      const m = /^ {2}(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(|^ {2}const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/.exec(l);
      if (m) fn = m[1] || m[2];
      if (/^\s*(?:async\s+)?function\s/.test(l)) continue;   // a definition line names itself
      const code = l.replace(/\/\/.*$/, '');   // a comment names, it does not read
      for (const [rx, what, allowed] of RULES) if (rx.test(code) && !allowed.includes(fn)) out.push(`${fn}: reads ${what} by hand`);
      if (/\bjudgeHits\(/.test(code)) asks.add(fn);
    }
    for (const site of ['wakeNow', 'flushScopeNow', 'stashHits']) if (!asks.has(site)) out.push(`${site}: never asks the verdict`);
    return [...new Set(out)];
  }
  const cs = markCensus(src);
  console.log(`    the census over src/server/channels-engine.js: ${cs.length} hand read(s)`);
  ok(cs.length === 0, 'THE CENSUS: every billed site (wakeNow, flushScopeNow, stashHits) asks the ONE verdict at its reads; no function outside the verdict\'s reader reads a mark by hand', J(cs));
  const VW = '    const vW = judgeHits(rec.id, convId, pk, target.cid, hits, { ranOut: true, take: target.cid ? true : null });\n';
  const csR = markCensus(anchored(src, VW, '    const byHand = markOf(rec.id, convId, pk, hits[0]);\n' + VW, 'census-hand-read'));
  ok(J(csR) === J(['wakeNow: reads markOf by hand']), `RED CONTROL: a copy whose wake reads one mark by hand — the census names it: ${J(csR)}`);
  const VS = '    const vS = judgeHits(rec.id, convId, pk, target.cid, all, { ranOut: true });\n';
  const csR2 = markCensus(anchored(src, VS, '    const vS = { deliver: all.filter((h) => !takeOf(rec.id, convId, pk, h)), wait: [], kept: [], spent: [], ticket: null };\n', 'census-own-verdict'));
  ok(J(csR2) === J(['stashHits: reads takeOf by hand']), `RED CONTROL: a copy whose stash makes its own verdict — the census names it: ${J(csR2)}`);
  const csR3 = markCensus(anchored(src, VW, VW + "    const byTicket = ticketsOf(rec.id, convId, names, hits[0]).some((tk) => tk.handed);\n", 'census-ticket-read'));
  ok(J(csR3) === J(['wakeNow: reads ticketsOf (the starts holding a record) by hand', "wakeNow: reads a ticket's state (.handed) by hand"]), `RED CONTROL (round wig9owq5o): a copy whose wake reads a ticket's state by hand — the census names both reads: ${J(csR3)}`);

  // MUST 2 (round w5y5digbw), A LAW OF ORDER: the stash takes nothing — it MARKS — so from its delivering read to its mark is
  // ONE synchronous step: no await on the straight path between them (an await in a branch that returns is no hand-over). The
  // law's census reads stashHits' own lines at its top level; the order as it was (the park of a record in flight BEFORE the
  // mark) is red by name
  function stashOrder(text) {
    const a = text.indexOf(VS), b = text.indexOf('    markHanded(rec.id, convId, pk, fresh, now());', a);
    if (a < 0 || b < 0) return ['stashHits: its read or its mark is not where the census looks'];
    const between = text.slice(a + VS.length, b).split('\n');
    return between.filter((l) => /^ {4}\S/.test(l) && /\bawait\b/.test(l.replace(/\/\/.*$/, '')) && !/\breturn\b/.test(l) && !/=\s*async\s*\(/.test(l)).map((l) => 'stashHits: an await between its read and its mark — ' + l.trim().slice(0, 60));
  }
  const so = stashOrder(src);
  ok(so.length === 0, 'MUST 2 — THE STASH READS, STASHES AND MARKS IN ONE STEP: no await on the straight path from its delivering read to its mark (the park of a record still in flight comes after the mark)', J(so));
  const FRESH = '    const fresh = seen ? vS.deliver.filter((h) => !(h.record && seen.has(h.record.id))) : vS.deliver;\n';
  const soR = stashOrder(anchored(src, FRESH, FRESH + '    await parkFlying();\n', 'stash-park-before-mark'));
  ok(soR.length === 1, `RED CONTROL: the order as it was (the park of a record in flight between the read and the mark) — the census names it: ${J(soR)}`);
}

console.log('③ THE FAMILY\'S FINDS IN THE ENGINE (fast; round w5y5digbw items 6 and 8): the in-flight row kept, the double bill of must 1, the stop after the digest\'s wait');
{
  // Both finds need TWO CHAINS OF ONE WATCHER on one conversation. Production has none while round 15's hold stands (each
  // chain a watcher reads is held by the block that reads it); a copy whose chain queue lets a second digest of the same scope
  // run beside the first stands in for that hold cut — the only way the two meet. Each leg runs the CURED engine in that world
  // and its RED control plants the read as it was.
  const QUEUE = '    const prev = wakeChains.get(key) || Promise.resolve();\n    const run = prev.then(() => fn(), () => fn());\n';   // serialWake's (the outbox family has a queue line of its own)
  const unqueued = (text) => anchored(text, QUEUE, '    const prev = wakeChains.get(key) || Promise.resolve();\n    const run = Promise.resolve().then(() => fn());\n', 'two-chains-of-one-watcher');
  const reachedBy = (sig, ms = 5000) => { let tm = null; return Promise.race([sig.then(() => true), new Promise((r) => { tm = setTimeout(() => r(false), ms); })]).finally(() => clearTimeout(tm)); };
  // ONE SCENE: the group G (members agent-1 and agent-2) watches the account by a digest; m waits as G's row. Digest #1 takes m
  // for its member and is HELD in its ladder; digest #2 of the same watcher reads while #1 is in flight (PLACED: it waits on #1's
  // take, `onTakeWait`, or it settles); then #1's ladder answers (handed, or refused with its stash refused: it gives its take
  // back). `cursorTo2`: another digest of the group moved the round-robin's cursor meanwhile, so #2 picks agent-2
  async function twoDigestLeg(ENGM, tag, { refuse = false, cursorTo2 = false } = {}) {
    let open = () => {}, entered = () => {}, waited = () => {};
    const gate1 = new Promise((r) => { open = r; }), in1 = new Promise((r) => { entered = r; }), sawWait = new Promise((r) => { waited = r; });
    const w = mkEngine(ENGM, path.join(ROOT, tag), {
      roster: () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: ['G'] }],
      gate: (k) => (k === 0 ? (entered(), gate1) : null),
      answer: (k) => (refuse && k === 0 ? { ok: false, reason: 'the spend cap is reached (planted)', refused: 'cap' } : null),
      stashThrows: () => refuse,
      onTakeWait: () => waited(),
    });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(GRP)], watchers: [{ principal: GRP, notify: 'digest', digestMinutes: 30 }] });
    const m = w.tail(OPS).slice(-1)[0];
    await w.eng.onFresh(w.recOf(), OPS, [m], { origin: 'test' });   // G's row holds m (the window not yet over)
    const rowG = () => ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m.id && p.for === 'group:G').length;
    const rowBefore = rowG();
    const first = w.eng.flushScope(A, 'account', null, 'group:G');   // digest #1 takes m and is held in its ladder
    await in1;
    if (cursorTo2) await w.eng.store.index.update((ix) => { ix.rotations = ix.rotations || {}; ix.rotations.G = 1; });   // another digest of G moved the cursor
    let settled = false;
    const second = w.eng.flushScope(A, 'account', null, 'group:G').then((x) => { settled = true; return x; });   // digest #2, the same watcher
    const placed = await reachedBy(Promise.race([sawWait, second.then(() => {})]));   // it reached its read while #1 was in flight
    const readWhileHeld = placed && w.starts.length >= 1;
    const settledBeforeOpen = settled;
    open();
    const [d1, d2] = await Promise.all([first, second]);
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const out = { rowBefore, placed: readWhileHeld, settledBeforeOpen, first: { ok: !!(d1 && d1.ok), why: (d1 && d1.why) || null }, second: { ok: !!(d2 && d2.ok), why: (d2 && d2.why) || null, cid: (d2 && d2.cid) || null },
      starts: w.starts.map((x) => x.cid), billed: w.delivered.map((x) => x.cid), toA1: recs(w, 'agent-1', m), toA2: recs(w, 'agent-2', m), rowAfter: rowG() };
    await w.eng.stop();
    return out;
  }
  const FIRST_READ = '        const v0 = judgeHits(rec.id, en.id, pk, null, pend0.hits);\n';
  const AFTER_WAIT = '        const vR = judgeHits(rec.id, h.id, pk, target.cid, g.hits, { ranOut: true, take: take || true });\n';
  // (a) r432 — A ROW WITH A RECORD STILL IN FLIGHT IS KEPT AT EVERY READ: digest #1 is refused after #2 read; #2 kept the row at
  // its first read, waited, and delivers m ONCE
  const la = await twoDigestLeg(MUT.load('src/server/channels-engine.js', unqueued(src), 'two-digests'), 'kept-in-flight', { refuse: true });
  console.log(`    starts (ladder calls) — #1 refused after #2 read: ${la.starts.length} (${J(la.starts)}), m handed ${la.toA1 + la.toA2} time(s), its row left ${la.rowAfter}`);
  ok(la.rowBefore === 1 && la.placed && !la.settledBeforeOpen && !la.first.ok && la.second.ok && la.toA1 + la.toA2 === 1 && la.rowAfter === 0,
    `r432 (fast): digest #2 read while #1 held m in flight — it KEPT m in its block and WAITED; #1 was refused and gave m back; #2 then delivered m ONCE (${la.toA1 + la.toA2}), its row gone after (${la.rowAfter})`, J(la));
  const laR = await twoDigestLeg(MUT.load('src/server/channels-engine.js', anchored(unqueued(src), FIRST_READ, '        const v0 = ((v) => ({ ...v, spent: [...v.spent, ...v.wait] }))(judgeHits(rec.id, en.id, pk, null, pend0.hits));\n', 'first-read-counts-a-take-as-handed'), 'two-digests-red-a'), 'kept-in-flight-red', { refuse: true });
  ok(laR.settledBeforeOpen && laR.second.why === 'nothing-pending' && laR.toA1 + laR.toA2 === 0 && laR.rowAfter === 0,
    `RED CONTROL: the first read as it was (a take counted as handed) — #2 answered «${laR.second.why}» at once and cleared the row; #1 refused: m handed ${laR.toA1 + laR.toA2} times, ${laR.rowAfter} rows — the person's message LOST`, J(laR));
  // (b) MUST 1 — ONE MESSAGE, ONE BILLED TURN FOR ONE WATCHER: #1 hands m to agent-1; #2 (agent-2 by the moved cursor) reads the
  // WATCHER's mark after its wait and starts nothing
  const lb = await twoDigestLeg(MUT.load('src/server/channels-engine.js', unqueued(src), 'two-digests'), 'one-watcher-two-members', { cursorTo2: true });
  console.log(`    starts (ladder calls) — #1 handed m to agent-1, #2 picked agent-2: ${lb.starts.length} (${J(lb.starts)}); m to agent-1 ${lb.toA1}, to agent-2 ${lb.toA2}`);
  ok(lb.placed && lb.first.ok && !lb.second.ok && lb.second.why === 'nothing-pending' && lb.starts.length === 1 && lb.toA1 === 1 && lb.toA2 === 0,
    `MUST 1 (fast): the block handed m to agent-1 while digest #2 of the same watcher (agent-2 by the moved cursor) waited — #2's read after the wait saw the WATCHER's mark: «${lb.second.why}», ONE billed turn (${lb.starts.length})`, J(lb));
  const lbR = await twoDigestLeg(MUT.load('src/server/channels-engine.js', anchored(unqueued(src), AFTER_WAIT, '        const vR = ((v) => { v.ticket = takeHits(rec.id, h.id, names, v.deliver, take); return v; })(judgeHits(rec.id, h.id, names[1], target.cid, g.hits, { ranOut: true }));\n', 'after-the-wait-reads-the-receiver-only'), 'two-digests-red-b'), 'one-watcher-two-members-red', { cursorTo2: true });
  ok(lbR.starts.length === 2 && lbR.toA1 === 1 && lbR.toA2 === 1, `RED CONTROL: the read after the wait as it was (the RECEIVER's mark only) — #2 delivered m to agent-2 too: ${lbR.starts.length} billed turns (${J(lbR.starts)}) for one message of one watcher`, J(lbR));

  // (c) item 8 — THE DIGEST'S STOP AFTER ITS WAIT: the account digest carries Announcements' m7 (free) and the Ops room's m8 (held
  // in flight by the group's wake); stop() while it waits ⇒ it starts NOTHING of its block (the wake's own branch: ① stopLeg)
  async function digestStopLeg(ENGM, tag) {
    let open = () => {}, entered = () => {}, waited = () => {};
    const gate1 = new Promise((r) => { open = r; }), in1 = new Promise((r) => { entered = r; }), sawWait = new Promise((r) => { waited = r; });
    const w = mkEngine(ENGM, path.join(ROOT, tag), {
      roster: () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }],
      gate: (k) => (k === 0 ? (entered(), gate1) : null),
      onTakeWait: () => waited(),
    });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m7 = w.tail(ANN).slice(-1)[0], m8 = w.tail(OPS).slice(-1)[0];
    await w.eng.onFresh(w.recOf(), ANN, [m7], { origin: 'test' });   // the digest's row for Announcements' m7
    const fresh = w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });   // the group's wake takes m8 and is held
    await in1;
    const d = w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // the digest carries m7 + m8 and waits for m8
    const parked = await reachedBy(sawWait);
    const s0 = w.starts.length;
    const stopping = Promise.resolve(w.eng.stop());
    const dr = await d.then((x) => x, () => null);
    const startsAfterStop = w.starts.length - s0;
    open(); await fresh.then(() => {}, () => {}); await stopping;
    return { parked, startsAfterStop, digest: (dr && dr.why) || null, m7: recs(w, 'agent-1', m7, ANN) };
  }
  const DIGEST_STOP = '      if (stopped) {   // B-1ca5 round w8ghfur9h: after a wait stop() settled the digest starts nothing; its rows stay pending, and one in flight elsewhere is named to that start\n';
  const ds = await digestStopLeg(ENG, 'digest-stop');
  console.log(`    starts (ladder calls) — stop() while the digest waited: ${ds.startsAfterStop} after the stop (its answer «${ds.digest}»)`);
  ok(ds.parked && ds.startsAfterStop === 0 && ds.digest === 'stopped' && ds.m7 === 0, `item 8: stop() while the account digest waited for a record in flight — it starts NOTHING of its block (${ds.startsAfterStop} starts after the stop), «${ds.digest}», m7 held for the next boot`, J(ds));
  const dsR = await digestStopLeg(MUT.load('src/server/channels-engine.js', anchored(src, DIGEST_STOP, DIGEST_STOP.replace('if (stopped) {', 'if (false) {'), 'digest-no-stop-after-wait'), 'digest-no-stop-after-wait'), 'digest-stop-red');
  ok(dsR.startsAfterStop === 1, `RED CONTROL: the digest that does not read the stop again after its wait starts m7 AFTER the stop: ${dsR.startsAfterStop} start(s)`, J(dsR));
}

console.log('④ THE HAND-OVER CLEARS THE SAME RECEIVER\'S OTHER ROWS — a control at each of clearForReceiver\'s three sites, and MUST 3: only on a hand-over a restart keeps');
{
  // (the WAKE's site: ① digestRestartLeg's RED «receiver-rows-never-cleared»)
  const pendFor = (w, r, pk, conv = OPS) => ((w.eng.store.index.live()[`${A}/${conv}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === r.id && p.for === pk).length;
  // THE DIGEST's site: agent-1's own account digest and the group G's (agent-1 its one live member) both hold m; G's digest hands
  // m to agent-1 — its write drops agent-1's own row for m (the same record, the same receiver); after a RESTART agent-1's digest
  // starts nothing. `refused`: G's ladder refuses and its stash answers «held in memory only» — no hand-over a restart keeps,
  // so agent-1's row STAYS (must 3) and m reaches agent-1 after the restart
  async function digestClearLeg(ENGM, tag, { refused = false } = {}) {
    const roster = () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }];
    const dataDir = path.join(ROOT, tag);
    const w = mkEngine(ENGM, dataDir, { roster, answer: (k) => (refused && k === 0 ? { ok: false, reason: 'the spend cap is reached (planted)', refused: 'cap' } : null), stashAnswer: refused ? () => ({ stored: false, why: 'held in memory only (planted)' }) : null });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT), acc(GRP)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }, { principal: GRP, notify: 'digest', digestMinutes: 30 }] });
    const m = w.tail(OPS).slice(-1)[0];
    await w.eng.onFresh(w.recOf(), OPS, [m], { origin: 'test' });   // both digests hold m
    const before = { own: pendFor(w, m, 'agent:agent-1'), group: pendFor(w, m, 'group:G') };
    const g = await w.eng.flushScope(A, 'account', null, 'group:G');
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const ownAfter = pendFor(w, m, 'agent:agent-1');
    await w.eng.stop();
    const w2 = mkEngine(ENGM, dataDir, { clock: w.clock, roster });   // THE RESTART: the marks (memory) are gone
    const d2 = await w2.eng.flushScope(A, 'account', null, 'agent:agent-1');
    if (w2.eng.settleWakes) await w2.eng.settleWakes();
    const out = { before, group: { ok: !!(g && g.ok), stashed: !!(g && g.stashed), why: (g && g.why) || null }, ownAfter, startsAfterRestart: w2.starts.length, afterRestart: (d2 && (d2.ok ? 'delivered' : d2.why)) || null };
    await w2.eng.stop();
    return out;
  }
  const DIGEST_RCV = '          if (ok || stashKept) clearForReceiver(e2, target.cid, h.carried.hits, pk);   // B-1ca5 round w8ghfur9h: the same receiver\'s rows on other roads, in the same write (must 3: durable only)\n';
  const dc = await digestClearLeg(ENG, 'digest-clear');
  console.log(`    the group's digest handed m to agent-1: agent-1's own row ${dc.before.own} → ${dc.ownAfter}; after the restart ${dc.startsAfterRestart} start(s)`);
  ok(dc.before.own === 1 && dc.before.group === 1 && dc.group.ok && dc.ownAfter === 0 && dc.startsAfterRestart === 0, `THE DIGEST'S SITE: the group's digest handed m to agent-1 and its write dropped agent-1's own row for m (${dc.before.own} → ${dc.ownAfter}); after a RESTART nothing starts again (${dc.startsAfterRestart})`, J(dc));
  const dcR = await digestClearLeg(MUT.load('src/server/channels-engine.js', noDoor(anchored(src, DIGEST_RCV, '', 'digest-receiver-rows-never-cleared')), 'digest-receiver-rows-never-cleared'), 'digest-clear-red');
  ok(dcR.ownAfter === 1 && dcR.startsAfterRestart === 1, `RED CONTROL: the digest's hand-over that leaves the same receiver's row — after the restart agent-1's digest starts m AGAIN (${dcR.startsAfterRestart})`, J(dcR));
  const dm = await digestClearLeg(ENG, 'digest-clear-memory', { refused: true });
  ok(dm.group.stashed && dm.ownAfter === 1 && dm.startsAfterRestart === 1, `MUST 3 AT THE DIGEST: the group's digest refused and its stash held m «in memory only» — agent-1's own row STAYS (${dm.ownAfter}); after the restart m reaches agent-1 (${dm.startsAfterRestart} start)`, J(dm));
  const dmR = await digestClearLeg(MUT.load('src/server/channels-engine.js', anchored(src, DIGEST_RCV, DIGEST_RCV.replace('if (ok || stashKept) clearForReceiver', 'if (ok || stashed) clearForReceiver'), 'digest-clears-on-any-stash'), 'digest-clears-on-any-stash'), 'digest-clear-memory-red', { refused: true });   // stale-pins: kept (the control plants the clear as it was: on ANY stash)
  ok(dmR.ownAfter === 0 && dmR.startsAfterRestart === 0, `RED CONTROL: the digest clearing on ANY stash (as it was) — agent-1's row dropped for a stash a restart forgets (${dmR.ownAfter}); after the restart nothing brings m (${dmR.startsAfterRestart}): the message LOST`, J(dmR));

  // THE STASH's site: agent-1's own account digest holds r and m; it takes r and is HELD in its ladder (r in flight for agent-1);
  // the group G (agent-1 its one live member) rides the Ops room on the NEXT-TURN road: its stash of [r, m] waits on r (200 ms),
  // keeps r, stashes m for agent-1 — and drops agent-1's own row for m in its write; after a RESTART agent-1's digest starts
  // nothing for m. `memory`: the stash answers «held in memory only» — agent-1's row STAYS (must 3)
  async function stashClearLeg(ENGM, tag, { memory = false } = {}) {
    let open = () => {}, entered = () => {};
    const gate1 = new Promise((r) => { open = r; }), in1 = new Promise((r) => { entered = r; });
    const roster = () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }];
    const dataDir = path.join(ROOT, tag);
    const w = mkEngine(ENGM, dataDir, { roster, gate: (k) => (k === 0 ? (entered(), gate1) : null), heldBound: { takeWaitMs: 200 }, stashAnswer: memory ? () => ({ stored: false, why: 'held in memory only (planted)' }) : null });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    const [r, m] = w.tail(OPS).slice(-2);
    await w.eng.onFresh(w.recOf(), OPS, [r], { origin: 'test' });   // agent-1's digest holds r
    const first = w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // it takes r and is held
    await in1;
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP, delivery: 'next-turn' }] });
    await w.eng.onFresh(w.recOf(), OPS, [r, m], { origin: 'test' });   // the digest holds m too; the group's stash of [r, m] waits on r, then stashes m
    // the stash's ledger row for m and its clear are ONE write: wait for that row (bounded; a red by name at the bound)
    const wrote = await waitFor(() => recs(w, 'agent-1', m) >= 1, 3000);
    const ownAfterStash = pendFor(w, m, 'agent:agent-1');
    const stashedM = w.blocks().filter((b) => b.cid === 'agent-1').length;
    open(); await first;
    if (w.eng.settleWakes) await w.eng.settleWakes();
    await w.eng.stop();
    const w2 = mkEngine(ENGM, dataDir, { clock: w.clock, roster });   // THE RESTART
    const d2 = await w2.eng.flushScope(A, 'account', null, 'agent:agent-1');
    if (w2.eng.settleWakes) await w2.eng.settleWakes();
    const out = { wrote, stashedM, ownAfterStash, startsAfterRestart: w2.starts.length, afterRestart: (d2 && (d2.ok ? 'delivered' : d2.why)) || null };
    await w2.eng.stop();
    return out;
  }
  const STASH_RCV = 'if (e2 && durableS) clearForReceiver(e2, target.cid, fresh, pk);';
  const sc = await stashClearLeg(ENG, 'stash-clear');
  console.log(`    the group's stash handed m to agent-1: agent-1's own row for m → ${sc.ownAfterStash}; after the restart ${sc.startsAfterRestart} start(s)`);
  ok(sc.wrote && sc.stashedM === 1 && sc.ownAfterStash === 0 && sc.startsAfterRestart === 0, `THE STASH'S SITE: the group's next-turn stash handed m to agent-1 and its write dropped agent-1's own row for m (${sc.ownAfterStash}); after a RESTART nothing starts again (${sc.startsAfterRestart})`, J(sc));
  const scR = await stashClearLeg(MUT.load('src/server/channels-engine.js', noDoor(anchored(src, STASH_RCV, 'if (false) clearForReceiver(e2, target.cid, fresh, pk);', 'stash-receiver-rows-never-cleared')), 'stash-receiver-rows-never-cleared'), 'stash-clear-red');
  ok(scR.ownAfterStash === 1 && scR.startsAfterRestart === 1, `RED CONTROL: the stash's hand-over that leaves the same receiver's row — after the restart agent-1's digest starts m AGAIN (${scR.startsAfterRestart})`, J(scR));
  const sm = await stashClearLeg(ENG, 'stash-clear-memory', { memory: true });
  ok(sm.wrote && sm.stashedM === 1 && sm.ownAfterStash === 1 && sm.startsAfterRestart === 1, `MUST 3 AT THE STASH: the group's stash held m «in memory only» — agent-1's own row STAYS (${sm.ownAfterStash}); after the restart m reaches agent-1 (${sm.startsAfterRestart} start)`, J(sm));
  const smR = await stashClearLeg(MUT.load('src/server/channels-engine.js', anchored(src, STASH_RCV, 'if (e2) clearForReceiver(e2, target.cid, fresh, pk);', 'stash-clears-on-any-stash'), 'stash-clears-on-any-stash'), 'stash-clear-memory-red', { memory: true });   // stale-pins: kept (the control plants the clear as it was: on ANY stash)
  ok(smR.ownAfterStash === 0 && smR.startsAfterRestart === 0, `RED CONTROL: the stash clearing on ANY stash (as it was) — agent-1's row dropped for a stash a restart forgets (${smR.ownAfterStash}); after the restart nothing brings m (${smR.startsAfterRestart}): the message LOST`, J(smR));
}

console.log('⑤ round wig9owq5o — THE NEXT-TURN PENDING STASH KEEPS A ROW THE VERDICT KEPT FOR ITS HOLDER');
{
  // The scene of the round's must: the account digest of agent-1 (its holder) has taken m and sits in its ladder; the group G
  // (agent-1 its one live member) rides the Ops room on the NEXT-TURN road and its row of m waits as a pending row; G's pending
  // flush reaches stashPending → stashHits (fromPending): agent-1's mark is in flight, the stash waits its bound (200 ms), its read
  // says KEPT for m — the pending clear must leave that row. The holder is then REFUSED (its stash refused too) and gives m back:
  // the row the holder's give-back counts on is still there, and G's next flush delivers m ONCE
  const pendFor = (w, r, pk, conv = OPS) => ((w.eng.store.index.live()[`${A}/${conv}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === r.id && p.for === pk).length;
  async function pendingKeptLeg(ENGM, tag) {
    let open = () => {}, entered = () => {}, waited = false, stashCalls = 0;
    const gate1 = new Promise((r) => { open = r; }), in1 = new Promise((r) => { entered = r; });
    const live = { 'agent-1': [] };
    const w = mkEngine(ENGM, path.join(ROOT, tag), {
      roster: () => [{ cid: 'agent-1', name: 'Worker', groups: live['agent-1'] }, { cid: 'agent-2', name: 'Other', groups: [] }],
      gate: (k) => (k === 0 ? (entered(), gate1) : null),
      answer: (k) => (k === 0 ? { ok: false, reason: 'the spend cap is reached (planted)', refused: 'cap' } : null),
      stashThrows: () => ++stashCalls === 1,   // the FIRST stash is the refused holder's (G's first flush stashes nothing: m is kept)
      onTakeWait: () => { waited = true; },
      heldBound: { takeWaitMs: 200 },
    });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP, delivery: 'next-turn' }] });
    const m = w.tail(OPS).slice(-1)[0];
    await w.eng.onFresh(w.recOf(), OPS, [m], { origin: 'test' });   // G has no live member: its row of m waits; the digest holds m too
    live['agent-1'] = ['G'];
    const rowBefore = pendFor(w, m, 'group:G');
    const first = w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // the HOLDER takes m and is held in its ladder
    await in1;
    const fl = await w.eng.flushPending(A, OPS, { pk: 'group:G' });   // G's pending flush: the stash waits its bound, reads «kept» for m
    const placed = waited;   // the stash met the holder's take and waited (the engine's seam), not a guess
    const rowKept = pendFor(w, m, 'group:G');
    open(); await first;   // the holder is REFUSED (its stash refused too): it gives m back
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const rowAfterGiveBack = pendFor(w, m, 'group:G');
    await w.eng.flushPending(A, OPS, { pk: 'group:G' });   // G's next flush: nobody holds m now
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const out = { rowBefore, placed, stash: (fl && (fl.why || (fl.ok ? 'ok' : null))) || null, rowKept, rowAfterGiveBack, delivered: recs(w, 'agent-1', m), rowEnd: pendFor(w, m, 'group:G') };
    await w.eng.stop();
    return out;
  }
  const KEPT_PENDING = "    if (fromPending && fromPending.ids) for (const h of vS.kept) if (h && h.record) fromPending.ids.delete(h.record.id);\n";
  const pk = await pendingKeptLeg(ENG, 'pending-kept');
  console.log(`    G's row of m: before ${pk.rowBefore}, after the pending stash read «kept» ${pk.rowKept}, after the holder gave back ${pk.rowAfterGiveBack}; m delivered ${pk.delivered} time(s)`);
  ok(pk.rowBefore === 1 && pk.placed && pk.rowKept === 1 && pk.rowAfterGiveBack === 1 && pk.delivered === 1 && pk.rowEnd === 0,
    `round wig9owq5o MUST: the next-turn pending stash read «kept» for m (its holder in flight past the stash's bound) and its clear LEFT the row (${pk.rowKept}); the holder gave m back and the row was still there (${pk.rowAfterGiveBack}); G's next flush delivered m ONCE (${pk.delivered})`, J(pk));
  const pkR = await pendingKeptLeg(MUT.load('src/server/channels-engine.js', anchored(src, KEPT_PENDING, '', 'pending-clears-a-kept-row'), 'pending-clears-a-kept-row'), 'pending-kept-red');
  ok(pkR.rowKept === 0 && pkR.delivered === 0, `RED CONTROL: the pending stash's clear as it was — the KEPT row cleared (${pkR.rowKept}); the holder gave m back to a row that was gone: m delivered ${pkR.delivered} times — the watcher never hears of it`, J(pkR));
}

console.log('⑥ B-1ca5\'s REMAINDER — THREE CHAINS, THEN A RESTART: the door refuses the stale row, whatever chain left it');
{
  // agent-1's account digest (chain 1) takes m and sits in its ladder; the group G (agent-1 its one live member, a WAKE watcher)
  // flushes its pending row (chain 2): it meets the take, waits its bound and KEEPS its row on chain 1's ticket; chain 1 is REFUSED
  // (its stash refused too) and gives m back; the digest flushes again (chain 3) and HANDS m to agent-1 — G's own row (it names no
  // member) is on no list chain 3 clears and SURVIVES. The hub restarts; G's pending flush: the door reads the hand's own ledger
  // (m handed to agent-1) — zero more starts, each count printed. RED: the door cut — m starts for agent-1 a second time.
  const pendFor = (w, r, pk, conv = OPS) => ((w.eng.store.index.live()[`${A}/${conv}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === r.id && p.for === pk).length;
  async function threeChainsLeg(ENGM, tag) {
    let open = () => {}, entered = () => {}, waited = false, stashCalls = 0;
    const gate1 = new Promise((r) => { open = r; }), in1 = new Promise((r) => { entered = r; });
    const live = { 'agent-1': [] };
    const dataDir = path.join(ROOT, tag);
    const roster = () => [{ cid: 'agent-1', name: 'Worker', groups: live['agent-1'] }, { cid: 'agent-2', name: 'Other', groups: [] }];
    const w = mkEngine(ENGM, dataDir, {
      roster,
      gate: (k) => (k === 0 ? (entered(), gate1) : null),
      answer: (k) => (k === 0 ? { ok: false, reason: 'the spend cap is reached (planted)', refused: 'cap' } : null),
      stashThrows: () => ++stashCalls === 1,   // the FIRST stash is the refused holder's: it gives m back, nothing kept for it
      onTakeWait: () => { waited = true; },
      heldBound: { takeWaitMs: 200 },
    });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m = w.tail(OPS).slice(-1)[0];
    await w.eng.onFresh(w.recOf(), OPS, [m], { origin: 'test' });   // G has no live member yet: its row of m waits; the digest holds m too
    live['agent-1'] = ['G'];
    const first = w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // CHAIN 1: the digest takes m, held in its ladder
    await in1;
    await w.eng.flushPending(A, OPS, { pk: 'group:G' });   // CHAIN 2: G's wake meets the take, waits, keeps its row on chain 1
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const placed = waited, rowKept = pendFor(w, m, 'group:G');
    open(); await first;   // chain 1 REFUSED (its stash refused too): it gives m back
    if (w.eng.settleWakes) await w.eng.settleWakes();
    await w.eng.flushScope(A, 'account', null, 'agent:agent-1');   // CHAIN 3: the digest takes m again and HANDS it to agent-1
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const rowAfter3 = pendFor(w, m, 'group:G'), startsBefore = w.starts.length, handedBefore = recs(w, 'agent-1', m);
    await w.eng.stop();
    const w2 = mkEngine(ENGM, dataDir, { clock: w.clock, roster: () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }] });   // THE RESTART
    await w2.eng.flushPending(A, OPS, { pk: 'group:G' });   // G's pending flush (as the boot's)
    if (w2.eng.settleWakes) await w2.eng.settleWakes();
    const out = { placed, rowKept, rowAfter3, startsBefore, handedBefore, startsAfterRestart: w2.starts.length, handed: recs(w2, 'agent-1', m), rowEnd: pendFor(w2, m, 'group:G') };
    await w2.eng.stop();
    return out;
  }
  const tc = await threeChainsLeg(ENG, 'three-chains');
  console.log(`    G's row of m: kept on chain 1 ${tc.rowKept}, after chain 3 handed m ${tc.rowAfter3}; starts before the restart ${tc.startsBefore} (chain 1 refused, chain 3 handed), after it ${tc.startsAfterRestart}; m handed to agent-1 ${tc.handed} time(s); G's row at the end ${tc.rowEnd}`);
  ok(tc.placed && tc.rowKept === 1 && tc.rowAfter3 === 1 && tc.startsBefore === 2 && tc.handedBefore === 1 && tc.startsAfterRestart === 0 && tc.handed === 1 && tc.rowEnd === 0,
    `B-1ca5's REMAINDER — THREE CHAINS: G's row kept on chain 1 survives chain 3's hand (${tc.rowAfter3}, on no list it clears); after the RESTART the door reads the hand's ledger — ZERO more starts (${tc.startsAfterRestart}), m handed to agent-1 once, the stale row dropped at the door (${tc.rowEnd})`, J(tc));
  const tcR = await threeChainsLeg(MUT.load('src/server/channels-engine.js', noDoor(src), 'three-chains-no-door'), 'three-chains-red');
  console.log(`    the door cut: after the restart ${tcR.startsAfterRestart} start(s), m handed to agent-1 ${tcR.handed} time(s)`);
  ok(tcR.rowAfter3 === 1 && tcR.startsAfterRestart === 1 && tcR.handed === 2, `RED CONTROL: the door cut (the memory map alone) — after the restart G's surviving row starts m for agent-1 a SECOND time (${tcR.startsAfterRestart} start, handed ${tcR.handed} times)`, J(tcR));
  // the door's fact lives as long as a row that could start it again: the ledger's cap never drops a row whose message still has a
  // pending row (PURE: channel-revisions.js capWokeRows) — RED: the cap as it was drops it with the oldest
  const rows = Array.from({ length: 50 }, (_, i) => ({ vid: `v${i}`, cid: `c${i % 3}`, at: i }));
  const kept = Rev.capWokeRows(rows, 40, new Set(['v0'])), plain = Rev.capWokeRows(rows, 40);
  ok(kept.length === 40 && kept.some((r) => r.vid === 'v0') && !plain.some((r) => r.vid === 'v0'), `the ledger's cap keeps a row whose message still has a pending row (v0 kept, ${kept.length} rows) — RED: the cap as it was (no pending set) drops it with the oldest`);
}

console.log('⑦ B-1ca5\'s REMAINDER — THE DOOR KEYS THE RECORD: a stored copy that shares the vendor id is no record handed');
{
  // the memory map keys a mark by the RECORD id, and the door's durable half reads the same key (`rid`): a second record that
  // carries the same vendor id (a stored copy, as test-channel-agent-watch parks thirty) is still delivered — RED: the door keyed
  // on the vendor message refuses the copy (and the heavy suite's thirty with it)
  const RID_DOOR = '    return rows.some((w) => w && w.door === 1 && w.rid === rid && (recv !== null ? w.cid === recv : w.pk === name)) ? { handed: true } : null;\n';
  ok(src.split(RID_DOOR).length === 2, 'control setup: the door\'s ledger read (by the record id) is present once');
  async function copyLeg(ENGM, tag) {
    const live = { 'agent-1': [] };
    const roster = () => [{ cid: 'agent-1', name: 'Worker', groups: live['agent-1'] }, { cid: 'agent-2', name: 'Other', groups: [] }];
    const w = mkEngine(ENGM, path.join(ROOT, tag), { roster });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m = w.tail(OPS).slice(-1)[0];
    const en = () => w.eng.store.index.live()[`${A}/${OPS}`] || {};
    await w.eng.onFresh(w.recOf(), OPS, [m], { origin: 'test' });   // G has no live member yet: its row of m waits
    const row = (en().pending || []).find((p) => p && p.record && p.record.id === m.id && p.for === 'group:G');
    const parked = row ? JSON.parse(J(row)) : null;
    live['agent-1'] = ['G'];
    await w.eng.flushPending(A, OPS, { pk: 'group:G' });   // m HANDED to agent-1: the door's row names the record
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const s1 = w.starts.length;
    const doorRow = (en().wokeFor || []).filter((x) => x && x.door === 1 && x.rid === String(m.id) && x.cid === 'agent-1').length;
    const copyId = `${m.id}-copy`;
    if (parked) en().pending.push({ ...parked, record: { ...parked.record, id: copyId, text: 'a stored copy' } });   // same vendor id, another record
    await w.eng.flushPending(A, OPS, { pk: 'group:G' });
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const out = { parked: !!parked, s1, doorRow, starts: w.starts.length, copyLeft: (en().pending || []).filter((p) => p && p.record && p.record.id === copyId).length };
    await w.eng.stop();
    return out;
  }
  const cp = await copyLeg(ENG, 'door-copy');
  console.log(`    starts: m handed ${cp.s1}, then the copy ${cp.starts - cp.s1} (the door's row of m: ${cp.doorRow}, the copy's row left ${cp.copyLeft})`);
  ok(cp.parked && cp.s1 === 1 && cp.doorRow === 1 && cp.starts === 2 && cp.copyLeft === 0, `THE DOOR KEYS THE RECORD: m handed once (the door's row names it: ${cp.doorRow}); a stored copy sharing m's vendor id is ANOTHER record — it starts (${cp.starts - cp.s1}), its row gone`, J(cp));
  const cpR = await copyLeg(MUT.load('src/server/channels-engine.js', anchored(src, RID_DOOR, '    return rows.some((w) => w && w.door === 1 && w.vid === Rev.wokeKeyOf(r.vendorId) && (recv !== null ? w.cid === recv : w.pk === name)) ? { handed: true } : null;\n', 'door-by-vendor-id'), 'door-by-vendor-id'), 'door-copy-red');
  ok(cpR.s1 === 1 && cpR.starts === 1 && cpR.copyLeft === 0, `RED CONTROL: the door keyed on the vendor message — the copy is refused at the door (${cpR.starts - cpR.s1} starts), dropped though no card of it was ever handed`, J(cpR));
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
