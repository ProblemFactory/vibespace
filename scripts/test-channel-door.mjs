#!/usr/bin/env node
// THE DOOR — B-1ca5's remainder and its follow (lane lg-text-legs-3; 主开发 r1194, r1273): A RECORD HANDED TO A RECEIVER IS NEVER
// STARTED FOR THAT RECEIVER AGAIN, WHATEVER ROW SURVIVES. When the memory map holds no mark (a restart, a mark forgotten), the
// verdict reads the conversation's durable ledger row the hand's one write left (`ledgerMark`): the record, the receiver, the
// watcher. The REAL engine over the fake adapter and a stand-in ladder (the rig of test-channel-take-race, whose race and
// verdict legs this suite's door completes): ① three chains, then a restart — and two restarts in a row, a week apart; ② the
// door keys the RECORD, never the vendor id; ③ the door's read touches nothing; ④ a start that fails after the ladder was asked
// (no door row, delivered later; the note AFTER the reply) and the one window left; ⑤ the same cut on both sides; ⑥ a record
// with no vendor id has a door. Every lock has its RED control through anchored(); every leg prints its counts. Moved out of
// test-channel-take-race by the follow (the fast tier's 10 s).
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
const ROOT = scratchDir('chan-door');
const MUT = mutantCopies('chan-door', REPO);
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
  const delivered = [], stashed = [], asked = [], refused = [], starts = [], replies = [];   // replies: the time each ladder call answered
  const deliver = {
    // `refuse`: the ladder says no (the spend cap) — the engine stashes the refused block for the next turn
    // B-1ca5: `starts` = every ladder call (a billed turn's START); `gate(k)` = a promise the k-th call waits on (a STALL placed in
    // the window), `answer(k)` = a planted refusal for the k-th call, `stashThrows(cid, e)` = a planted stash failure
    deliverToConversation: async (cid, text, o) => { const k = starts.length; starts.push({ cid, text }); const g = gate ? gate(k) : null; if (g) await g; replies.push(Date.now()); const a = answer ? answer(k) : null; if (a) { refused.push({ cid, text, o }); return a; } if (refuse) { refused.push({ cid, text, o }); return { ok: false, reason: 'the spend cap is reached', refused: 'cap' }; } delivered.push({ cid, text, o }); return { ok: true, lane: 'message' }; },
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
  // B-1ca5 follow (r1273): `park(rows)` = pending rows written through the store's ONE door (a durable update), never pushed
  // into the live map behind it
  const park = (conv, rows) => eng.store.index.update(() => { const e = eng.store.index.entry(A, conv, { create: false }); if (e) for (const r of rows) e.pending.push(r); }, { durable: true });
  return { eng, clock, delivered, refused, stashed, asked, starts, replies, recall, tail, recOf, woke, recalled, notes, blocks, hourLater, park };
}

// RECORDS handed — the woken-for ledger's rows of ONE message for ONE receiver
const recs = (w, cid, r, conv = OPS) => w.woke(conv).filter((x) => x && x.cid === cid && x.vid === Rev.wokeKeyOf(r.vendorId)).length;
const src = engineSource(REPO);
// B-1ca5's remainder — THE DOOR: markOf reads the conversation's durable ledger (the hand's own write) when the memory map holds
// nothing, so a record handed to a receiver (or for a watcher) is never started for it again, whatever row survives. A control that
// wants the release's SECOND start after a restart therefore cuts the door too: the clears are no longer the only guard
const DOOR = '    return v === undefined ? ledgerMark(adapterId, convId, name, h) : markFrom(v);\n';
const noDoor = (x) => anchored(x, DOOR, '    return markFrom(v);\n', 'no-door');

console.log('① B-1ca5\'s REMAINDER — THREE CHAINS, THEN A RESTART: the door refuses the stale row, whatever chain left it');
{
  // agent-1's account digest (chain 1) takes m and sits in its ladder; the group G (agent-1 its one live member, a WAKE watcher)
  // flushes its pending row (chain 2): it meets the take, waits its bound and KEEPS its row on chain 1's ticket; chain 1 is REFUSED
  // (its stash refused too) and gives m back; the digest flushes again (chain 3) and HANDS m to agent-1 — G's own row (it names no
  // member) is on no list chain 3 clears and SURVIVES. The hub restarts; G's pending flush: the door reads the hand's own ledger
  // (m handed to agent-1) — zero more starts, each count printed. RED: the door cut — m starts for agent-1 a second time.
  const pendFor = (w, r, pk, conv = OPS) => ((w.eng.store.index.live()[`${A}/${conv}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === r.id && p.for === pk).length;
  async function threeChainsLeg(ENGM, tag, { twice = false } = {}) {
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
    const [m2, m] = w.tail(OPS).slice(-2);   // m2: another message of this conversation (the week-apart road's)
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
    const roster2 = () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }];
    let w2 = mkEngine(ENGM, dataDir, { clock: w.clock, roster: roster2 });   // THE RESTART
    let between = null;
    if (twice) {
      // B-1ca5 follow (r1273, 4) — TWO RESTARTS IN A ROW, A WEEK APART: the first boot, eight days on, hands ANOTHER message of
      // this conversation (m2, the account digest's) to agent-1 — that note rewrites the ledger, where m's door row is past the
      // 7-day age and lives only because G's stale row of m still waits; the second boot flushes G
      w.clock.advance(8 * 86400e3);
      await w2.park(OPS, [{ record: m2, why: [], at: w.clock(), road: 'wake', for: 'agent:agent-1' }]);
      await w2.eng.flushScope(A, 'account', null, 'agent:agent-1');
      if (w2.eng.settleWakes) await w2.eng.settleWakes();
      between = { starts: w2.starts.length, m2: recs(w2, 'agent-1', m2), doorOfM: w2.woke(OPS).filter((x) => x && x.door === 1 && x.rid === String(m.id)).length, rowOfM: pendFor(w2, m, 'group:G') };
      await w2.eng.stop();
      w2 = mkEngine(ENGM, dataDir, { clock: w.clock, roster: roster2 });   // THE SECOND RESTART
    }
    await w2.eng.flushPending(A, OPS, { pk: 'group:G' });   // G's pending flush (as the boot's)
    if (w2.eng.settleWakes) await w2.eng.settleWakes();
    const out = { placed, rowKept, rowAfter3, startsBefore, handedBefore, between, startsAfterRestart: w2.starts.length, handed: recs(w2, 'agent-1', m), rowEnd: pendFor(w2, m, 'group:G') };
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
  // B-1ca5 follow (r1273, 4) — TWO RESTARTS IN A ROW, A WEEK APART (the age's protection): RED: the age's `pend` term cut — the
  // first boot's note drops m's door row with the old ones, and the second boot starts m again
  const tw = await threeChainsLeg(ENG, 'three-chains-twice', { twice: true });
  console.log(`    two restarts, a week apart: the first boot handed m2 (${tw.between && tw.between.starts} start), m's door row kept by its waiting row (${tw.between && tw.between.doorOfM}, G's row ${tw.between && tw.between.rowOfM}); after the second, ${tw.startsAfterRestart} start(s), m handed ${tw.handed} time(s)`);
  ok(!!tw.between && tw.between.starts === 1 && tw.between.m2 === 1 && tw.between.doorOfM === 1 && tw.between.rowOfM === 1 && tw.startsAfterRestart === 0 && tw.handed === 1 && tw.rowEnd === 0,
    `TWO RESTARTS IN A ROW, A WEEK APART: the first boot's note (m2) rewrote the ledger and KEPT m's door row past the 7-day age (G's row of m still waits: ${tw.between && tw.between.doorOfM}); the second boot starts nothing (${tw.startsAfterRestart}), m handed once, the stale row dropped at the door`, J(tw));
  const AGE_KEEP = '    const prev = Array.isArray(en.wokeFor) ? en.wokeFor.filter((w) => w && (Number(w.at) > t - Rev.RECHECK_WOKE_MS || pend.has(w.rid))) : [];\n';
  const twR = await threeChainsLeg(MUT.load('src/server/channels-engine.js', anchored(src, AGE_KEEP, '    const prev = Array.isArray(en.wokeFor) ? en.wokeFor.filter((w) => w && (Number(w.at) > t - Rev.RECHECK_WOKE_MS)) : [];\n', 'door-row-ages-out'), 'door-row-ages-out'), 'three-chains-twice-red', { twice: true });
  ok(!!twR.between && twR.between.doorOfM === 0 && twR.startsAfterRestart === 1, `RED CONTROL: the age's protection cut — the first boot's note dropped m's door row with the old ones (${twR.between && twR.between.doorOfM}), and the second boot starts m for agent-1 AGAIN (${twR.startsAfterRestart} start)`, J(twR));
  // the door's fact lives as long as a row that could start it again: the ledger's cap never drops a row whose message still has a
  // pending row (PURE: channel-revisions.js capWokeRows) — RED: the cap as it was drops it with the oldest
  const rows = Array.from({ length: 50 }, (_, i) => ({ vid: `v${i}`, cid: `c${i % 3}`, door: 1, rid: `r${i}`, at: i }));
  const kept = Rev.capWokeRows(rows, 40, new Set(['r0'])), plain = Rev.capWokeRows(rows, 40), byVid = Rev.capWokeRows(rows, 40, new Set(['v0']));
  ok(kept.length === 40 && kept.some((r) => r.rid === 'r0') && !plain.some((r) => r.rid === 'r0') && !byVid.some((r) => r.rid === 'r0'), `the ledger's cap keeps a door row whose RECORD still has a pending row (r0 kept, ${kept.length} rows; the protection names record ids, a vendor id protects nothing) — RED: the cap as it was (no pending set) drops it with the oldest`);
}

console.log('② B-1ca5\'s REMAINDER — THE DOOR KEYS THE RECORD: a stored copy that shares the vendor id is no record handed');
{
  // the memory map keys a mark by the RECORD id, and the door's durable half reads the same key (`rid`): a second record that
  // carries the same vendor id (a stored copy, as test-channel-agent-watch parks thirty) is still delivered — RED: the door keyed
  // on the vendor message refuses the copy (and the heavy suite's thirty with it)
  const RID_DOOR = '    return rows.some((w) => w && w.door === 1 && w.rid === rid && (recv !== null ? w.cid === recv : w.pk === pkCut)) ? { handed: true } : null;\n';
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
    if (parked) await w.park(OPS, [{ ...parked, record: { ...parked.record, id: copyId, text: 'a stored copy' } }]);   // same vendor id, another record
    await w.eng.flushPending(A, OPS, { pk: 'group:G' });
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const out = { parked: !!parked, s1, doorRow, starts: w.starts.length, copyLeft: (en().pending || []).filter((p) => p && p.record && p.record.id === copyId).length };
    await w.eng.stop();
    return out;
  }
  const cp = await copyLeg(ENG, 'door-copy');
  console.log(`    starts: m handed ${cp.s1}, then the copy ${cp.starts - cp.s1} (the door's row of m: ${cp.doorRow}, the copy's row left ${cp.copyLeft})`);
  ok(cp.parked && cp.s1 === 1 && cp.doorRow === 1 && cp.starts === 2 && cp.copyLeft === 0, `THE DOOR KEYS THE RECORD: m handed once (the door's row names it: ${cp.doorRow}); a stored copy sharing m's vendor id is ANOTHER record — it starts (${cp.starts - cp.s1}), its row gone`, J(cp));
  const cpR = await copyLeg(MUT.load('src/server/channels-engine.js', anchored(src, RID_DOOR, '    return rows.some((w) => w && w.door === 1 && w.vid === Rev.wokeKeyOf(r.vendorId) && (recv !== null ? w.cid === recv : w.pk === pkCut)) ? { handed: true } : null;\n', 'door-by-vendor-id'), 'door-by-vendor-id'), 'door-copy-red');
  ok(cpR.s1 === 1 && cpR.starts === 1 && cpR.copyLeft === 0, `RED CONTROL: the door keyed on the vendor message — the copy is refused at the door (${cpR.starts - cpR.s1} starts), dropped though no card of it was ever handed`, J(cpR));
}

console.log('③ B-1ca5 follow (r1273, 1) — THE DOOR\'S READ TOUCHES NOTHING: a hundred door reads, no row marked changed');
{
  // every key the store marks changed goes through its touchKey, which FIRES the touch hooks (inside an update at its end,
  // outside at once): a hook that counts the conversation's key counts what entered the dirty set. A hundred records the
  // memory map holds no mark for wait on the NEXT-TURN road; the account digest judges each (a door read each) and leaves
  // them waiting — nothing of the row changes. RED: the tip's read (the store's ENTRY accessor, outside an update)
  const READ = '    const en = store.index.rows()[`${adapterId}/${convId}`];\n';
  ok(src.split(READ).length === 2, 'control setup: the door\'s read-only row read is present once');
  async function touchLeg(ENGM, tag) {
    const w = mkEngine(ENGM, path.join(ROOT, tag));
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    const m = w.tail(OPS).slice(-1)[0];
    await w.park(OPS, Array.from({ length: 100 }, (_, i) => ({ record: { ...m, id: `${m.id}-nt${i}`, vendorId: `${m.vendorId}-nt${i}` }, why: [], at: w.clock(), road: 'next-turn', for: 'agent:agent-1' })));
    const key = `${A}/${OPS}`;
    let touched = 0;
    w.eng.store.index.onTouch((k) => { if (k === key || k === null) touched++; });
    const r = await w.eng.flushScope(A, 'account', null, 'agent:agent-1');
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const out = { touched, starts: w.starts.length, left: ((w.eng.store.index.live()[key] || {}).pending || []).length, why: (r && r.why) || null };
    await w.eng.stop();
    return out;
  }
  const tl = await touchLeg(ENG, 'door-touch');
  console.log(`    a hundred door reads: the row touched ${tl.touched} time(s), ${tl.left} rows still waiting, ${tl.starts} starts`);
  ok(tl.touched === 0 && tl.left === 100 && tl.starts === 0, `THE DOOR'S READ TOUCHES NOTHING: a hundred door reads (the digest judged a hundred waiting records) marked the row changed ${tl.touched} times — no hook fired, the dirty set took nothing; the rows wait as they were`, J(tl));
  const tlR = await touchLeg(MUT.load('src/server/channels-engine.js', anchored(src, READ, '    let en = null;\n    try { en = store.index.entry(adapterId, convId, { create: false }); } catch { en = null; }\n', 'door-read-touches'), 'door-read-touches'), 'door-touch-red');   // stale-pins: kept (the RED: the tip's read put back)
  ok(tlR.touched >= 100 && tlR.left === 100, `RED CONTROL: the tip's read (the store's entry accessor, outside an update) — the same hundred reads marked the row changed ${tlR.touched} times (each a hook run, the row written again at the next flush)`, J(tlR));
}

console.log('④ B-1ca5 follow (r1273, 3 + 4) — A START THAT FAILS AFTER THE LADDER WAS ASKED: no door row, the message still owed and delivered later; the note comes AFTER the ladder\'s reply');
{
  // G's wake asks the ladder: REFUSED (the spend cap), its stash refused too — nothing was handed, so no door row: the row
  // stays owed; G's later flush delivers it ONCE; a restart then starts nothing. The ORDER is the leg's pin: a note written
  // BEFORE the ladder's reply (RED) leaves a door row for a start that failed — the later flush refuses it at the door and
  // the message is LOST. The window left (THE ONE WINDOW, kb): a process that dies between the ladder's reply and the
  // durable write has no door row — printed below, the time from the reply to the write answered on this machine
  const LADDER = "      try { r = await deliver.deliverToConversation(target.cid, text, { kind: 'notification', spendReason: 'channel-message', fromName, cardText, channel }); }\n";
  ok(src.split(LADDER).length === 2, 'control setup: the wake road\'s ladder call is present once');
  async function failLeg(ENGM, tag) {
    let stashCalls = 0;
    const roster = () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }];
    const dataDir = path.join(ROOT, tag);
    const w = mkEngine(ENGM, dataDir, { roster, answer: (k) => (k === 0 ? { ok: false, reason: 'the spend cap is reached (planted)', refused: 'cap' } : null), stashThrows: () => ++stashCalls === 1 });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m = w.tail(OPS).slice(-1)[0];
    const owed = (ww) => ((ww.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m.id && p.for === 'group:G').length;
    const door = (ww) => ww.woke(OPS).filter((x) => x && x.door === 1 && x.rid === String(m.id)).length;
    await w.eng.onFresh(w.recOf(), OPS, [m], { origin: 'test' });   // G's wake: the ladder REFUSES, the stash refuses too
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const afterFail = { starts: w.starts.length, delivered: w.delivered.length, door: door(w), owed: owed(w) };
    await w.eng.flushPending(A, OPS, { pk: 'group:G' });   // later: the owed message
    const tEnd = Date.now();
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const windowMs = w.replies.length >= 2 ? tEnd - w.replies[w.replies.length - 1] : null;
    const later = { starts: w.starts.length, delivered: w.delivered.length, door: door(w), owed: owed(w) };
    await w.eng.stop();
    const w2 = mkEngine(ENGM, dataDir, { clock: w.clock, roster });   // THE RESTART
    await w2.eng.flushPending(A, OPS, { pk: 'group:G' });
    if (w2.eng.settleWakes) await w2.eng.settleWakes();
    const out = { afterFail, later, windowMs, startsAfterRestart: w2.starts.length };
    await w2.eng.stop();
    return out;
  }
  const fl = await failLeg(ENG, 'door-fail');
  console.log(`    the failed start: ${fl.afterFail.starts} ladder call, ${fl.afterFail.delivered} delivered, door rows ${fl.afterFail.door}, owed ${fl.afterFail.owed}; later ${fl.later.starts - fl.afterFail.starts} start, delivered ${fl.later.delivered}, door rows ${fl.later.door}; after a restart ${fl.startsAfterRestart} start(s)`);
  console.log(`    THE ONE WINDOW (kb): the ladder's reply → the durable write answered: ${fl.windowMs} ms on this machine (one act appended and fsync'd)`);
  ok(fl.afterFail.starts === 1 && fl.afterFail.delivered === 0 && fl.afterFail.door === 0 && fl.afterFail.owed === 1 && fl.later.starts === 2 && fl.later.delivered === 1 && fl.later.door === 1 && fl.later.owed === 0 && fl.startsAfterRestart === 0,
    `A START THAT FAILS AFTER THE LADDER WAS ASKED leaves NO door row (${fl.afterFail.door}) and the message OWED (${fl.afterFail.owed}); the later flush delivers it once (door row ${fl.later.door}); a restart starts nothing (${fl.startsAfterRestart})`, J(fl));
  const NOTE_FIRST = "      try { await store.index.update(() => { const e0 = store.index.entry(rec.id, convId, { create: false }); if (e0) noteDelivered(e0, hits, target.cid, t, pk, true); }, { durable: true }); } catch { }\n";
  const flR = await failLeg(MUT.load('src/server/channels-engine.js', anchored(src, LADDER, NOTE_FIRST + LADDER, 'note-before-the-ladder'), 'note-before-the-ladder'), 'door-fail-red');
  ok(flR.afterFail.door === 1 && flR.later.delivered === 0 && flR.later.owed === 0, `RED CONTROL: the note written BEFORE the ladder's reply — the failed start left a door row (${flR.afterFail.door}), the later flush refused the owed message at the door: delivered ${flR.later.delivered}, the row dropped — a LOST delivery`, J(flR));
}

console.log('⑤ B-1ca5 follow (r1273, 5) — THE DOOR COMPARES THE SAME CUT THE NOTE KEEPS: a receiver whose conversation key is longer than the cut');
{
  // the note keeps a receiver's id to 128 characters and a watcher's name to 256; the door compares the same cut. A receiver
  // key may hold 200 characters (a conversation key) — here 157: the account digest hands m to that agent, G's own row of m
  // survives (it names no member), and after the restart G's flush goes to the same agent: the RECEIVER half must refuse
  // it. (A watcher name passes 256 only as a group's per-member key — an id of up to 120, «>», a member's key — and is
  // compared the same way.) RED: the tip's compare, uncut — the stale row starts m a second time
  const LC = `agent-${'l'.repeat(150)}`;
  const AL = { kind: 'agent', id: LC, name: 'Long' };
  const RECV = '    const recv = name.startsWith(\'→\') ? doorCut(name.slice(1), DOOR_CID_MAX) : null, pkCut = recv === null ? doorCut(name, DOOR_PK_MAX) : null;\n';
  ok(src.split(RECV).length === 2, 'control setup: the door\'s cut of the names it compares is present once');
  async function cutLeg(ENGM, tag) {
    const live = { [LC]: [] };
    const roster = () => [{ cid: LC, name: 'Long', groups: live[LC] }, { cid: 'agent-2', name: 'Other', groups: [] }];
    const dataDir = path.join(ROOT, tag);
    const w = mkEngine(ENGM, dataDir, { roster });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AL)], watchers: [{ principal: AL, notify: 'digest', digestMinutes: 30 }] });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m = w.tail(OPS).slice(-1)[0];
    await w.eng.onFresh(w.recOf(), OPS, [m], { origin: 'test' });   // G has no live member yet: its row of m waits; the digest holds m
    await w.eng.flushScope(A, 'account', null, `agent:${LC}`);   // the digest HANDS m to the long-keyed agent
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const s1 = w.starts.length;
    const doorCid = w.woke(OPS).filter((x) => x && x.door === 1 && x.rid === String(m.id)).map((x) => String(x.cid).length);
    const rowG = ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m.id && p.for === 'group:G').length;
    await w.eng.stop();
    live[LC] = ['G'];   // after the restart the agent is G's live member
    const w2 = mkEngine(ENGM, dataDir, { clock: w.clock, roster });
    await w2.eng.flushPending(A, OPS, { pk: 'group:G' });
    if (w2.eng.settleWakes) await w2.eng.settleWakes();
    const out = { cidLen: LC.length, s1, doorCid, rowG, startsAfterRestart: w2.starts.length };
    await w2.eng.stop();
    return out;
  }
  const cl = await cutLeg(ENG, 'door-cut');
  console.log(`    a receiver key of ${cl.cidLen} characters, kept as ${cl.doorCid.join(', ')}; G's row of m ${cl.rowG}; after the restart ${cl.startsAfterRestart} start(s)`);
  ok(cl.s1 === 1 && cl.doorCid.length === 1 && cl.doorCid[0] === 128 && cl.rowG === 1 && cl.startsAfterRestart === 0, `THE SAME CUT ON BOTH SIDES: a receiver key of ${cl.cidLen} characters is kept to 128 and compared at 128 — G's surviving row of m, to the same agent after the restart, is refused by the receiver half (${cl.startsAfterRestart} starts)`, J(cl));
  const clR = await cutLeg(MUT.load('src/server/channels-engine.js', anchored(src, RECV, '    const recv = name.startsWith(\'→\') ? name.slice(1) : null, pkCut = recv === null ? name : null;\n', 'door-names-uncut'), 'door-names-uncut'), 'door-cut-red');   // stale-pins: kept (the RED: the tip's uncut compare put back)
  ok(clR.rowG === 1 && clR.startsAfterRestart === 1, `RED CONTROL: the names compared UNCUT (the tip) — the stored key (128) never equals the agent's (${clR.cidLen}): G's surviving row starts m for the same agent a SECOND time (${clR.startsAfterRestart} start)`, J(clR));
}

console.log('⑥ B-1ca5 follow (r1273, 2) — A RECORD WITH NO VENDOR ID HAS A DOOR: its row keyed by the record id alone');
{
  // a record that carries no vendor id (the recall ledger cannot ask it by id, so it had no row at all) is handed to agent-1;
  // its door row names the record (`vid: null`); the recall's recheck an hour on asks the vendor nothing for it; a stale row
  // of it survives; after a restart nothing starts. RED: the tip's skip (no vendor id ⇒ no row) — it starts again
  const SKIP = '      if (!vid && !rid) continue;   // neither a recall row nor a door row\n';
  ok(src.split(SKIP).length === 2, 'control setup: the note\'s skip (neither a recall row nor a door row) is present once');
  async function noVidLeg(ENGM, tag) {
    const roster = () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }];
    const dataDir = path.join(ROOT, tag);
    const w = mkEngine(ENGM, dataDir, { roster });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m = w.tail(OPS).slice(-1)[0];
    const nv = { ...m, id: `${m.id}-novid`, text: 'a record with no vendor id' };
    delete nv.vendorId;
    const row = { record: nv, why: [], at: w.clock(), road: 'wake', for: 'group:G' };
    await w.park(OPS, [row]);
    await w.eng.flushPending(A, OPS, { pk: 'group:G' });   // HANDED to agent-1
    if (w.eng.settleWakes) await w.eng.settleWakes();
    const s1 = w.starts.length;
    const door = w.woke(OPS).filter((x) => x && x.door === 1 && x.rid === nv.id && x.vid === null).length;
    const a0 = w.asked.length;
    await w.hourLater();   // the recall's recheck an hour on
    const askedNull = w.asked.slice(a0).filter((x) => x === null || x === undefined || x === 'null').length;
    await w.park(OPS, [{ ...row, at: w.clock() }]);   // a stale row of it survives
    await w.eng.stop();
    const w2 = mkEngine(ENGM, dataDir, { clock: w.clock, roster });   // THE RESTART
    await w2.eng.flushPending(A, OPS, { pk: 'group:G' });
    if (w2.eng.settleWakes) await w2.eng.settleWakes();
    const out = { s1, door, askedNull, startsAfterRestart: w2.starts.length };
    await w2.eng.stop();
    return out;
  }
  const nl = await noVidLeg(ENG, 'door-novid');
  console.log(`    a record with no vendor id: handed (${nl.s1} start), its door row ${nl.door}, the recheck's asks for it ${nl.askedNull}; after a restart ${nl.startsAfterRestart} start(s)`);
  ok(nl.s1 === 1 && nl.door === 1 && nl.askedNull === 0 && nl.startsAfterRestart === 0, `A RECORD WITH NO VENDOR ID HAS A DOOR: its row names the record (${nl.door}, no vendor id), the recheck asks nothing for it (${nl.askedNull}), and its stale row after a restart starts nothing (${nl.startsAfterRestart})`, J(nl));
  const nlR = await noVidLeg(MUT.load('src/server/channels-engine.js', anchored(src, SKIP, '      if (!vid) continue;\n', 'no-vendor-id-no-row'), 'no-vendor-id-no-row'), 'door-novid-red');   // stale-pins: kept (the RED: the tip's skip put back)
  ok(nlR.door === 0 && nlR.startsAfterRestart === 1, `RED CONTROL: the tip's skip (no vendor id ⇒ no row) — no door row (${nlR.door}), and after the restart its stale row starts it AGAIN (${nlR.startsAfterRestart} start)`, J(nlR));
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
