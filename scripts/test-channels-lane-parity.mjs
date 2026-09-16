#!/usr/bin/env node
// LANE PARITY (docs/design-communication-panel.zh.md §6.1 / fence 12 / §19 P2;
// gate row `test-channels-lane-parity`).
//
// THE EXIT CONDITION, MEASURED: one day of traffic fed through the three
// receive lanes — push (a content-carrying lane), poll, scan — against the
// REAL engine, the REAL store and the REAL spend guard must produce the SAME
// record set, the SAME number of wakes and the SAME charge. Every lane calls
// the same `onFresh` funnel; the only lane-dependent step is fence 12's
// coalescing window, which exists because push delivers one message at a time
// where a poll pass is already a batch.
//
// THE CONTROL IS THE SETTING ITSELF: the same push traffic with
// `channels.pushCoalesceSeconds` = 0 must wake MORE (one wake per hit), which
// is the bill "turn on real-time push" used to multiply by. No patched copy —
// the setting is the product's own knob and it must be what makes the batch.
//
// Also: a record pushed once and then polled once is ONE record and never a
// second wake (§5 invariant 2 through the funnel), and the wake says WHY.
//
// Per-pid scratch dirs, free of any machine-global name; instants relative
// to Date.now() (nothing pins a calendar date).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const SG = require(path.join(REPO, 'src/server/spend-guard.js'));
const SA = require(path.join(REPO, 'src/spend-authorizer.js'));
const F = require(path.join(REPO, 'src/channel-filter.js'));
const { makeRecord, makeConversation } = require(path.join(REPO, 'src/channel-record.js'));

const ROOT = scratch('chan-parity');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });

const NOW = Date.now();
const CID = 'ops';
const AGENT = 'cid-agent-1';
const SLOT = { key: 'slot:member-a', name: 'Member A' };
const quiet = { log() {}, warn() {}, error() {} };

// ── ONE DAY OF TRAFFIC: 40 records over the last 24 h, 12 of them matching ─
function dayOfTraffic(adapterId) {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const hit = i % 10 === 0 || i % 10 === 3 || i % 10 === 7;   // 12 of 40
    out.push(makeRecord({
      adapterId, convId: CID, vendorId: `m${String(i).padStart(2, '0')}`,
      at: NOW - (40 - i) * 36 * 60e3,   // oldest first, 36 min apart → spans a day
      author: { id: i % 2 ? 'u-brook' : 'u-ada', name: i % 2 ? 'Brook' : 'Ada', isSelf: false, isBot: false },
      text: hit ? `the GPU box ${i} needs a look` : `status update ${i}`,
      mentions: [], attachments: [], replyTo: null, threadKey: CID, raw: {},
    }));
  }
  return out;
}
const FILTER = { match: 'any', rules: [{ kind: 'keyword', value: 'gpu' }] };
const EXPECTED_HITS = dayOfTraffic('x').filter((r) => F.matchRecord(F.validateFilter(FILTER).filter, r).hit).length;

// ── the money: the REAL spend guard, one per lane, generous caps ───────────
const LIMITS = { 'spend.unattendedPerIdentityHour': 200, 'spend.unattendedPerIdentityDay': 2000, 'spend.unattendedPerInstanceDay': 10000, 'spend.budgetNoticePct': 0 };
function mkGuard(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return SG.create({ dataDir: dir, serverSetting: (k) => LIMITS[k], log: () => {} });
}
const chargesOf = (guard) => SA.spendCounts(guard.snapshot().budget, SLOT.key, Date.now()).hour;

// ── the ladder STUB with the real ladder's money contract ──────────────────
// (authorize → deliver → note; a refusal is returned, never thrown; the
// engine stashes what it refuses through `stashFor`). The real ladder would
// scan the developer's ~/.claude/sessions — not a fixture's business.
function mkLadder(guard) {
  const calls = [], stash = [];
  return {
    calls, stash,
    async deliverToConversation(cid, text, opts = {}) {
      const v = guard.authorize({ reason: opts.spendReason, identity: SLOT, hold: true });
      if (!v.ok) return { ok: false, reason: `spend budget: ${v.why}`, refused: 'spend' };
      calls.push({ cid, text, opts, at: Date.now() });
      guard.note({ reason: opts.spendReason, identity: v.identity, hold: v.hold });
      return { ok: true, lane: 'message' };
    },
    stashFor(cid, env) { stash.push({ cid, ...env }); },
  };
}

// ── ONE adapter shape, three receive modes, one world each ─────────────────
function laneAdapter(kind, receive, world) {
  const plat = process.platform;
  const caps = {
    receive,
    pushTransport: receive === 'push' ? 'test-lane' : null,
    pushAckBudgetMs: receive === 'push' ? 3000 : null,
    pollInterval: { hot: 30, cold: 300, floor: 10 },
    scanSources: receive === 'scan' ? { [plat]: 'store' } : null,
    scanLatency: receive === 'scan' ? { store: 15, ui: 300 } : null,
    history: receive === 'scan' ? null : 'page',
    historyBySource: receive === 'scan' ? { store: 'since', ui: 'page' } : null,
    listConversations: true, sendAs: [], identityMarking: 'none', identityMarkingWhere: null, identityMarkingText: null,
    tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false, readReceipts: false, attachments: 'metadata',
  };
  return {
    kind, caps,
    create() {
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['test'], why: null }; } },
        async listConversations() { return { conversations: [makeConversation({ id: CID, vendorId: CID, title: 'Ops room', kind: 'group', participants: 'Ada, Brook', lastAt: null })], cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: [], why: 'read-only-adapter', at: Date.now() }; },
        async history(convId, { anchor = null, limit = 50 } = {}) {
          const all = world.records.filter((r) => r.convId === convId);
          let idx = 0;
          if (anchor) { const at = all.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; }
          const anchorFound = !anchor || idx > 0;
          const pending = all.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: anchorFound && drained, complete: anchorFound && drained };
        },
        live: receive === 'push' ? {
          start({ onEvent, onState } = {}) {
            world.push = { onEvent, onState, stopped: false };
            onState && onState({ state: 'live', at: Date.now() });
            return { stop() { world.push.stopped = true; onState && onState({ state: 'stopped', at: Date.now() }); } };
          },
        } : undefined,
        scanHost: receive === 'scan' ? async (hostId) => ({ hostId: hostId || null, platform: plat, clientInstalled: true, storePath: '/fixture/ChatStorage.sqlite', grant: 'granted', why: null, at: Date.now() }) : undefined,
      };
    },
  };
}

const engines = [];
async function runLane(receive, { coalesceSeconds = 0.3, name = receive } = {}) {
  const kind = `fake-${receive}`;                 // the seeded record's kind — our module REPLACES the shipped fake for it
  const dir = path.join(ROOT, name);
  const guard = mkGuard(path.join(dir, 'guard'));
  const ladder = mkLadder(guard);
  const world = { records: [], push: null };
  const registry = CH.createChannelRegistry();
  registry.register(laneAdapter(kind, receive, world));
  const events = [];
  const eng = ENG.create({
    dataDir: dir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: (m) => events.push(m), log: quiet,
    deliver: ladder, serverSetting: (k) => (k === 'channels.pushCoalesceSeconds' ? coalesceSeconds : undefined),
    liveSessions: () => [{ cid: AGENT, name: 'Worker', groups: [] }],
  });
  engines.push(eng);
  // discover, assign (filter first), track — the assignment exists BEFORE the first ingest
  await eng.pass(kind, { force: true });
  const fr = await eng.setFilter(kind, CID, FILTER);
  if (!fr.ok) throw new Error('setFilter: ' + fr.error);
  const ar = await eng.setAssignment(kind, CID, { principal: { kind: 'agent', id: AGENT, name: 'Worker' }, mode: 'filtered', filterId: fr.filter.id, notify: 'wake', authority: 'draft', dailyWakeCap: 100 });
  if (!ar.ok) throw new Error('setAssignment: ' + ar.error);
  const traffic = dayOfTraffic(kind);
  if (receive === 'push') {
    await eng.setTracked(kind, CID, true);          // an empty first walk anchors nothing to carry
    await eng.settleWakes();
    await eng.setPush(kind, { claimedExclusive: 'exclusive' });
    await eng.syncPushLanes();
    if (!world.push) throw new Error('push lane never armed');
    // the vendor's day arrives one event at a time; the lane's ack is the return
    for (const r of traffic) { world.records.push(r); await world.push.onEvent({ kind: 'record', eventId: `ev-${r.vendorId}`, convId: CID, record: r, at: Date.now() }); }
    await sleep(coalesceSeconds * 1000 + 250);
  } else {
    world.records.push(...traffic);
    await eng.setTracked(kind, CID, true);
    await eng.pass(kind, { force: true });
  }
  await eng.settleWakes();
  const snap = eng.store.index.snapshot().conversations[`${kind}/${CID}`];
  const ids = eng.store.readTail(kind, CID, { limit: 500 }).map((r) => r.vendorId).sort();
  return { kind, eng, world, ladder, guard, events, snap, ids, wakes: ladder.calls.length, charges: chargesOf(guard), lane: eng.laneOrScan(eng.adapterRecords().adapters.find((r) => r.id === kind), snap) };
}

// ── ① THE SAME DAY THROUGH THE THREE LANES ─────────────────────────────────
console.log('① one day of traffic through push / poll / scan');
const P = await runLane('push');
const L = await runLane('poll');
const S = await runLane('scan');
ok(P.lane.via === 'push' && P.lane.carryContent === true, `the push lane carried content (${P.lane.why})`);
ok(L.lane.via === 'poll' && S.lane.via === 'scan' && S.lane.source === 'store', `the poll lane polled, the scan lane read the store (${S.lane.why})`);
ok(P.ids.length === 40 && L.ids.length === 40 && S.ids.length === 40 && JSON.stringify(P.ids) === JSON.stringify(L.ids) && JSON.stringify(L.ids) === JSON.stringify(S.ids), `THE SAME RECORD SET on every lane (${P.ids.length} records)`);
ok(P.wakes >= 1 && L.wakes >= 1 && S.wakes >= 1, `every lane woke the agent at least once (push ${P.wakes}, poll ${L.wakes}, scan ${S.wakes})`);
ok(P.wakes === L.wakes && L.wakes === S.wakes && P.wakes === 1, `THE SAME WAKE COUNT (push ${P.wakes}, poll ${L.wakes}, scan ${S.wakes}) — one day's burst is ONE wake on every lane`);
ok(P.charges === L.charges && L.charges === S.charges && P.charges === 1, `THE SAME CHARGE on the credential slot (push ${P.charges}, poll ${L.charges}, scan ${S.charges})`);
const hitsOf = (r) => (r.snap.stats.wakes[0] || {}).n;
ok(hitsOf(P) === EXPECTED_HITS && hitsOf(L) === EXPECTED_HITS && hitsOf(S) === EXPECTED_HITS, `every lane's wake carried the same ${EXPECTED_HITS} hits`);
for (const r of [P, L, S]) {
  const c = r.ladder.calls[0];
  ok(c && c.cid === AGENT && c.opts.spendReason === 'channel-message' && c.opts.kind === 'notification', `${r.kind}: the wake went to the assigned agent through the ladder with spendReason 'channel-message' as a notification`);
  ok(c && /^### Channel message — fake-\w+ · Ops room/.test(c.text) && /matched: keyword "gpu"/.test(c.text) && /GPU box/.test(c.text), `${r.kind}: the block names the conversation, the rule that fired and the message`);
  ok(c && (c.text.match(/^from /gm) || []).length === F.BLOCK_MAX_RECORDS && new RegExp(`\\(${EXPECTED_HITS - F.BLOCK_MAX_RECORDS} older elided\\)`).test(c.text), `${r.kind}: ≤${F.BLOCK_MAX_RECORDS} records shown, the rest elided by count`);
  ok(r.snap.stats.hits7d === EXPECTED_HITS && r.snap.stats.msgs7d === 40, `${r.kind}: the after-the-fact measurement counts ${EXPECTED_HITS} hits of 40 messages`);
  ok(r.snap.pending.length === 0 && r.snap.pendingElided === 0, `${r.kind}: nothing left pending`);
}
ok(/coalesced|messages in \d+ s, one wake/.test(P.ladder.calls[0].text) && P.snap.stats.wakes[0].n === EXPECTED_HITS, 'the push wake SAYS it was coalesced ("N messages in S s, one wake")');
ok(!/one wake/.test(L.ladder.calls[0].text), 'a poll batch does not claim a coalescing window (it was a batch already)');

// ── ② THE CONTROL: the window is what buys the batch back ─────────────────
console.log('② control — coalescing off on the push lane');
const P0 = await runLane('push', { coalesceSeconds: 0, name: 'push-nocoalesce' });
ok(P0.ids.length === 40 && JSON.stringify(P0.ids) === JSON.stringify(P.ids), 'same record set');
ok(P0.wakes === EXPECTED_HITS && P0.wakes > P.wakes, `CONTROL: with channels.pushCoalesceSeconds = 0 the push lane woke ${P0.wakes} times (one per hit) — ${P0.wakes}× the coalesced lane's ${P.wakes}`);
ok(P0.charges === EXPECTED_HITS && P0.charges > P.charges, `CONTROL: …and charged the slot ${P0.charges} times — the bill the window exists to prevent`);
ok(P0.ladder.calls.every((c) => !/one wake/.test(c.text) && (c.text.match(/^from /gm) || []).length === 1), 'each uncoalesced wake carries exactly one record');

// ── ③ pushed once, polled once = one record, no second wake ───────────────
console.log('③ a record pushed once and polled once collapses to one');
{
  const before = P.wakes;
  const extra = makeRecord({ adapterId: P.kind, convId: CID, vendorId: 'm-late', at: Date.now(), author: { id: 'u-ada', name: 'Ada', isSelf: false, isBot: false }, text: 'GPU again', mentions: [], attachments: [], replyTo: null, threadKey: CID, raw: {} });
  P.world.records.push(extra);
  const r1 = await P.world.push.onEvent({ kind: 'record', eventId: 'ev-late-1', convId: CID, record: extra, at: Date.now() });
  const r2 = await P.world.push.onEvent({ kind: 'record', eventId: 'ev-late-2', convId: CID, record: extra, at: Date.now() });   // the vendor's at-least-once replay under a NEW event id
  await sleep(0.3 * 1000 + 250);
  await P.eng.settleWakes();
  await P.eng.pass(P.kind, { force: true });        // the reconciliation poll sees the same record
  await P.eng.settleWakes();
  const ids = P.eng.store.readTail(P.kind, CID, { limit: 500 }).map((r) => r.vendorId);
  ok(r1.persisted === true && r2.persisted === true && r2.duplicates === 1, `the replay was acked and absorbed (${JSON.stringify({ r1: r1.appended, r2: r2.duplicates })})`);
  ok(ids.filter((v) => v === 'm-late').length === 1 && ids.length === 41, 'ONE record in the log after push + replay + poll');
  ok(P.ladder.calls.length === before + 1, `ONE more wake, not two (${P.ladder.calls.length - before})`);
  ok(chargesOf(P.guard) === P.charges + 1, 'ONE more charge');
}

// ── ④ the funnel is lane-blind: a poll pass on the push adapter with no new
//      records wakes nobody and charges nothing ────────────────────────────
console.log('④ a quiet reconcile pass costs nothing');
{
  const w = P.ladder.calls.length, c = chargesOf(P.guard);
  await P.eng.pass(P.kind, { force: true });
  await P.eng.settleWakes();
  ok(P.ladder.calls.length === w && chargesOf(P.guard) === c, 'no fresh record ⇒ no wake, no charge');
}

for (const e of engines) { try { e.stop(); } catch {} }
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
