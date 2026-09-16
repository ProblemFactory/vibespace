#!/usr/bin/env node
// THE PUSH LANE (docs/design-communication-panel.zh.md §6.4, fence 11,
// decisions 18 + 20; gate row `test-channels-push`; P1b).
//
// The REAL engine over the REAL store with a REAL lane (src/channels/live/
// lane.js) whose transport is a fake push SERVER on a free loopback port —
// the vendor's role, played by `ws`: it emits events, it receives acks, and
// it can WITHHOLD a share of the records it hands to the poll, which is
// exactly the deployment shape §6.4's measurement exists to catch. Zero
// vendor calls; the Lark lane runs over a stub SDK and the Gmail lane over a
// fake fetch.
//
//   ① FENCE 11 — the ack arrives only after the record is in the durable log;
//      a vendor replay of the same event id is absorbed; a crash injected
//      between the persist and the index step loses nothing
//   ② heartbeat silence ⇒ the resolver reads `push-dead` and the cadence is
//      back at fast, while the socket is still connected; one frame revives it
//   ③ `stop()` is terminal for an arm in flight, and a lane is single-use
//   ④ THE EXIT CONDITION — a lane that DECLARES exclusivity it does not have
//      demotes itself, SAYS why with its numbers, and the demotion CHANGES
//      what the lane carries: the next event is a cursor kick, the record
//      arrives through the poll, kick mode adds NO sample (no ratchet), the
//      lane never climbs back by itself, and a RE-DECLARATION clears the
//      counters and retries the lane once (a fresh connection)
//   ⑤ `shared` / `unknown` never carry content; the route validates the claim
//   ⑥ the Lark lane: the SDK client built with the app credential, the ack =
//      the handler's return, a stopped lane refuses the ack, no SDK = parked
//   ⑦ the Gmail lane: watch first, a pulled note is a KICK, ack after the
//      engine answered, the named refusals (scope / options)
//
// Per-pid scratch dirs + a free port (scripts/scratch.mjs); the clock is
// injected and moved by hand where a window must pass.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms = 4000, step = 15) { const t0 = Date.now(); for (;;) { const v = pred(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

const { WebSocketServer, WebSocket } = require('ws');
const express = require('express');
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const C = require(path.join(REPO, 'src/channel-caps.js'));
const { startLane } = require(path.join(REPO, 'src/channels/live/lane.js'));
const { createLarkLive, eventToItem, SDK_NAME } = require(path.join(REPO, 'src/channels/live/lark.js'));
const { createGmailLive, PUBSUB_SCOPE, WATCH_RENEW_MAX_FAILS } = require(path.join(REPO, 'src/channels/live/gmail.js'));
const { makeRecord, makeConversation } = require(path.join(REPO, 'src/channel-record.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const routes = require(path.join(REPO, 'src/routes/channels.js'));

const ROOT = scratch('chan-push');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

// An injected clock: real time plus an offset the legs move by hand.
let offset = 0;
const now = () => Date.now() + offset;
const logs = [];
const log = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) };
const quiet = { log() {}, warn() {}, error() {} };

// ── THE FAKE PUSH SERVER (the vendor) ─────────────────────────────────────
const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await new Promise((r) => wss.once('listening', r));
const PUSH_URL = `ws://127.0.0.1:${wss.address().port}`;
const server = { conns: [], acks: [], connections: 0, ackHook: null };
wss.on('connection', (ws) => {
  server.connections++;
  server.conns.push(ws);
  ws.on('message', (buf) => {
    let f; try { f = JSON.parse(String(buf)); } catch { return; }
    if (f.type === 'ack') server.acks.push({ ...f, at: Date.now(), seen: server.ackHook ? server.ackHook(f) : null });
  });
  ws.on('close', () => { server.conns = server.conns.filter((c) => c !== ws); });
});
server.send = (frame) => { for (const c of server.conns) { try { c.send(JSON.stringify(frame)); } catch {} } };
server.waitAck = (eventId, ms = 4000) => waitFor(() => server.acks.find((a) => a.eventId === eventId), ms);

// THE WORLD the vendor holds: what push emits AND what the poll can read.
const A = 'fake-push', CID = 'ops';
const world = { convs: [{ id: CID, title: 'Ops room' }], records: new Map([[CID, []]]), gate: null };   // `gate`: a promise history() awaits while set
let seq = 0;
function mint(convId, text) {
  const i = ++seq;
  return makeRecord({ adapterId: A, convId, vendorId: `${convId}-r${i}`, at: now() + i, author: { id: 'u-ada', name: 'Ada', isSelf: false, isBot: false }, text: text || `message ${i}`, mentions: [], attachments: [], replyTo: null, threadKey: convId, raw: { i } });
}
/** Hand a record to the world; push it unless WITHHELD (the poll still sees it). */
function emit(convId, rec, { withhold = false } = {}) {
  world.records.get(convId).push(rec);
  const eventId = `ev-${rec.vendorId}`;
  if (!withhold) server.send({ type: 'event', eventId, convId, record: rec });
  return eventId;
}
const logHas = (vendorId) => { try { return fs.readFileSync(engRef.store.logPath(A, CID), 'utf-8').includes(`"vendorId":"${vendorId}"`); } catch { return false; } };
let engRef = null;

// ── THE ADAPTER: the shipped fake-push caps over a REAL lane + ws transport ─
function wsPushAdapter() {
  const caps = { ...fake.fakePush.caps };
  return {
    kind: A, caps,
    create(record = {}, deps = {}) {
      const clock = deps.now || now;
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null }; } },
        async listConversations() {
          return { conversations: world.convs.map((c) => makeConversation({ id: c.id, vendorId: c.id, title: c.title, kind: 'group', participants: 'Ada, Brook', lastAt: null })), cursor: null, complete: true };
        },
        async convCaps() { return { read: 'yes', sendAs: [], why: null, at: clock() }; },
        async history(convId, { anchor = null, limit = 50 } = {}) {
          if (world.gate) await world.gate;
          const all = world.records.get(convId) || [];
          let idx = 0;
          if (anchor) { const at = all.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; }
          const anchorFound = !anchor || idx > 0;
          const pending = all.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: anchorFound && drained, complete: anchorFound && drained };
        },
        live: {
          start({ onEvent, onState } = {}) {
            return startLane({
              name: 'fake-ws', onEvent, onState, now: clock, log: quiet, reconnectMinMs: 50, reconnectMaxMs: 200,
              async connect(h) {
                const ws = new WebSocket(PUSH_URL);
                await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
                ws.on('message', async (buf) => {
                  let f; try { f = JSON.parse(String(buf)); } catch { return; }
                  if (f.type === 'ping') { h.heard(); return; }
                  if (f.type !== 'event') return;
                  const r = await h.event({ kind: 'record', eventId: f.eventId, convId: f.convId, record: f.record, at: clock() });
                  if (r && r.ok === false && r.why === 'stopped') return;          // no ack for a stopped lane
                  try { ws.send(JSON.stringify({ type: 'ack', eventId: f.eventId, persisted: !!(r && r.persisted), duplicate: !!(r && r.duplicate) })); } catch {}
                });
                ws.on('close', () => h.closed('closed'));
                ws.on('error', () => {});
                return { close() { try { ws.close(); } catch {} } };
              },
            });
          },
        },
      };
    },
  };
}

// ── the engine ────────────────────────────────────────────────────────────
const registry = CH.createChannelRegistry();
registry.register(wsPushAdapter());
const events = [];
const eng = ENG.create({ dataDir: path.join(ROOT, 'e1'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: (m) => events.push(m), now, log });
engRef = eng;
const rec = () => eng.adapterRecords().adapters.find((r) => r.id === A);
const view = () => eng.adapterView(rec(), now());
const lane = () => eng.laneOrScan(rec(), {});
const missRate = () => C.pushMissRate((rec().push || {}).samples, now());
const resetBudget = () => { offset += 61e3; };   // the per-adapter request budget is per minute of the injected clock

// seed the world, discover, track (the first walk anchors the conversation)
for (let i = 0; i < 3; i++) emit(CID, mint(CID), { withhold: true });
await eng.pass(A, { force: true });
await eng.setTracked(A, CID, true);
await sleep(150);
await eng.pass(A, { force: true });
{
  const en = eng.store.index.snapshot().conversations[`${A}/${CID}`];
  ok(en && en.tracked && en.anchor, `the conversation is tracked and anchored by the first walk (anchor ${en && en.anchor})`);
}

// ── ① FENCE 11: persist → ack → process ──────────────────────────────────
console.log('① the ack arrives only after the record is durable');
{
  ok(view().push && view().push.state === null && view().push.claimedExclusive === 'unknown', 'before any declaration the push half is published as not started, claim unknown');
  const r = await eng.setPush(A, { claimedExclusive: 'exclusive' });
  ok(r.ok && r.push.claimedExclusive === 'exclusive', 'setPush declares exclusivity');
  const live = await waitFor(() => view().push.state === 'live');
  ok(!!live && server.connections === 1, `the lane is ARMED by the declaration and its handshake is positive evidence (state live, ${server.connections} connection)`);
  ok(lane().via === 'push' && lane().carryContent === true && lane().why === 'exclusive' && lane().pollCadence === 'reconcile', 'the resolver: live + exclusive ⇒ push carries content, the poll reconciles');

  server.ackHook = (f) => logHas(f.eventId.replace(/^ev-/, ''));
  const r1 = mint(CID, 'first pushed');
  const ev1 = emit(CID, r1);
  const ack = await server.waitAck(ev1);
  ok(ack && ack.persisted === true && ack.seen === true, 'FENCE 11: the vendor receives the ack AFTER the record is in the durable log (the server checked the log at ack time)');
  await sleep(400);
  const en = eng.store.index.snapshot().conversations[`${A}/${CID}`];
  ok(en.unread >= 1 && en.lane.lastPushAt && en.lane.via === 'push', `the index moves AFTER the ack (unread ${en.unread}, lastPushAt stamped, via push)`);
  ok(events.some((e) => e.type === 'channels-updated' && Array.isArray(e.changed) && e.changed.includes(CID)), 'ONE broadcast per push batch names the conversation');
  const lines = () => fs.readFileSync(eng.store.logPath(A, CID), 'utf-8').trim().split('\n').length;
  const before = lines();
  server.send({ type: 'event', eventId: ev1, convId: CID, record: r1 });      // the vendor's at-least-once replay
  const ack2 = await waitFor(() => server.acks.filter((a) => a.eventId === ev1).length >= 2);
  ok(!!ack2 && server.acks.filter((a) => a.eventId === ev1)[1].duplicate === true && lines() === before, 'a REPLAYED event id is acked and absorbed — the log does not grow');
  ok(missRate().total === 1 && missRate().missed === 0, `push-appended records count as judged, not missed (total ${missRate().total}, missed ${missRate().missed})`);

  // a crash BETWEEN the persist and the index step
  const orig = eng.store.index.update;
  let armed = true;
  eng.store.index.update = (fn) => { if (armed) { armed = false; return Promise.reject(new Error('injected crash after persist')); } return orig(fn); };
  const r2 = mint(CID, 'survives a crash');
  const ev2 = emit(CID, r2);
  const ack3 = await server.waitAck(ev2);
  await sleep(400);
  eng.store.index.update = orig;
  ok(ack3 && ack3.persisted === true && logHas(r2.vendorId) && !armed, 'the record is durable and acked even though the index step crashed');
  // Since P2 the funnel's DERIVED-ledger write (msgs7d) sits between the
  // persist and the batch flush too, so whichever consumer meets the injected
  // fault first must speak it — either spelling is the same promise kept.
  ok(logs.some((l) => /(push batch failed|msgs ledger failed|wake path failed): injected crash/.test(l)), 'the crash is SAID (never swallowed)');
  const p = await eng.pass(A, { force: true, origin: 'timer' });
  const en2 = eng.store.index.snapshot().conversations[`${A}/${CID}`];
  ok(p.ok && en2.unread >= 2 && missRate().missed === 0, `the reconciliation poll finds it already there (a duplicate, not a miss: missed ${missRate().missed}) and the index heals (unread ${en2.unread})`);
}

// ── ② heartbeat silence ⇒ push-dead ⇒ fast cadence ───────────────────────
console.log('② liveness is positive evidence');
{
  offset += C.PUSH_HEARTBEAT_MS + 1000;
  const l = lane();
  ok(l.via === 'poll' && l.why === 'push-dead' && l.pollCadence === 'fast' && l.carryContent === false, 'silence past the heartbeat window: the resolver reads the lane as DEAD and the cadence is fast — while the socket is still connected');
  ok(view().push.state === 'live' && /silent for/.test(C.pushLaneText(view().push, view().lane, { now: now() })), `the row says so: "${C.pushLaneText(view().push, view().lane, { now: now() })}"`);
  server.send({ type: 'ping' });
  const back = await waitFor(() => lane().why === 'exclusive');
  ok(!!back, 'one heard frame revives it — no reconnect, no re-declaration');
}

// ── ③ stop() is terminal; the lane is single-use ──────────────────────────
console.log('③ stop() is terminal for an arm in flight');
{
  // the lane core, directly: a connect that lands AFTER stop()
  let release; const conn = { closed: 0 }; const states = [];
  const l1 = startLane({ name: 't1', now, log: quiet, onState: (s) => states.push(s.state), onEvent: async () => ({ ok: true }), connect: () => new Promise((res) => { release = () => res({ close() { conn.closed++; } }); }) });
  l1.stop();
  release();
  await sleep(20);
  ok(conn.closed === 1 && states[states.length - 1] === 'stopped' && !states.includes('live'), 'a connection that lands after stop() is closed on the spot and never reports live');
  // handlers of a stopped arm
  let hh = null; let engineCalls = 0; const st2 = [];
  const l2 = startLane({ name: 't2', now, log: quiet, onState: (s) => st2.push(s.state), onEvent: async () => { engineCalls++; return { ok: true }; }, connect: async (h) => { hh = h; return { close() {} }; } });
  await sleep(10);
  ok(st2.includes('live'), 'positive control: the same lane reports live when the connect lands before stop()');
  l2.stop();
  const ans = await hh.event({ kind: 'record' });
  hh.heard();
  ok(ans && ans.ok === false && ans.why === 'stopped' && engineCalls === 0 && st2[st2.length - 1] === 'stopped', 'after stop(): event() answers {ok:false, why:stopped} WITHOUT calling the engine (no ack), heard() reports nothing');
  // engine level: switching push off stops the lane; on again = a NEW connection
  await eng.setPush(A, { enabled: false });
  await waitFor(() => server.conns.length === 0);
  ok(server.conns.length === 0 && lane().via === 'poll' && lane().why === 'poll', 'push switched off: the socket is closed and the resolver says poll');
  await eng.setPush(A, { enabled: true });
  const again = await waitFor(() => view().push.state === 'live' && server.connections === 2);
  ok(!!again, `push on again = a fresh arm, a fresh connection (${server.connections} connections so far) — the lane is single-use`);
}

// ── ④ THE EXIT CONDITION: a claimed exclusivity the lane does not have ───
console.log('④ a lane that declares exclusivity it does not have demotes itself, says why, and carries less');
{
  resetBudget();
  ok(!view().push.demotedAt && missRate().total <= 2, `starting clean (judged ${missRate().total}, demoted no)`);
  // 40 records: 28 pushed, 12 WITHHELD by the vendor (a second client got them)
  const pushed = [], withheld = [];
  for (let i = 0; i < 40; i++) {
    const r = mint(CID);
    if (i % 10 === 3 || i % 10 === 6 || i % 10 === 9) { emit(CID, r, { withhold: true }); withheld.push(r); }
    else pushed.push({ r, ev: emit(CID, r) });
  }
  const lastAck = await server.waitAck(pushed[pushed.length - 1].ev);
  ok(!!lastAck && pushed.every((p) => logHas(p.r.vendorId)) && withheld.every((w) => !logHas(w.vendorId)), 'the 28 pushed records are durable via push, the 12 withheld ones are not there yet');
  ok(!view().push.demotedAt, 'no demotion before the reconciliation poll has spoken');
  const p = await eng.pass(A, { force: true, origin: 'timer' });     // the 15-min reconciliation poll
  ok(p.ok && withheld.every((w) => logHas(w.vendorId)), 'the reconciliation poll brings the withheld 12 in');
  const v = view();
  const m = v.push.demoted || {};
  ok(!!v.push.demotedAt && v.push.demotedWhy === 'miss-rate' && m.missed === 12 && m.total >= 40 && m.rate > C.PUSH_MISS_THRESHOLD,
    `DEMOTED: ${m.missed} of ${m.total} records (${(m.rate * 100).toFixed(1)}%) were first seen by the poll — above the ${C.PUSH_MISS_THRESHOLD * 100}% threshold`);
  ok(logs.some((l) => /push is not exclusive here — 12 of \d+ records/.test(l)), 'the demotion is SAID in the log with its numbers');
  const sentence = C.pushLaneText(v.push, v.lane, { now: now() });
  ok(/not exclusive here/.test(sentence) && /12 of \d+ records/.test(sentence) && /fast cadence/.test(sentence), `the adapter row says why: "${sentence}"`);
  const l = lane();
  ok(l.via === 'poll' && l.why === 'demoted' && l.carryContent === false && l.pollCadence === 'fast', 'the resolver: DEMOTED outranks live + claim — no content, fast cadence');
  const last = events[events.length - 1];
  const row = last && last.digest && last.digest.adapters.find((a) => a.id === A);
  ok(row && row.push && row.push.demotedAt && row.lane.why === 'demoted', 'the broadcast digest carries the demotion (every client sees the row change)');
  ok(v.push.state === 'live' && server.conns.length === 1, 'the connection itself stays up — the lane is demoted, not stopped');

  // THE DEMOTION CHANGES WHAT THE LANE CARRIES
  const judgedAtDemotion = missRate().total;
  const hold = deferred();
  world.gate = hold.promise;                                  // the kick-origin pass cannot fetch until released
  const rk = mint(CID, 'after demotion');
  const evk = emit(CID, rk);
  const ackk = await server.waitAck(evk);
  await sleep(150);
  ok(ackk && ackk.persisted === false && ackk.seen === false && !logHas(rk.vendorId), 'the next pushed event is a CURSOR KICK: acked, NOT taken from the event, not in the log');
  world.gate = null;
  hold.resolve();
  const viaPoll = await waitFor(() => logHas(rk.vendorId), 6000);
  ok(!!viaPoll, 'and the record arrives through the kick-origin pass (the poll carries it)');
  ok(missRate().total === judgedAtDemotion, `kick mode adds NO sample (${missRate().total} judged before and after) — the ratio cannot ratchet`);
  resetBudget();
  for (let i = 0; i < 5; i++) emit(CID, mint(CID), { withhold: true });
  await eng.pass(A, { force: true, origin: 'timer' });
  ok(missRate().total === judgedAtDemotion, `a timer poll finding withheld records in kick mode adds NO sample either (${missRate().total})`);

  // NEVER climbs back by itself
  resetBudget();
  const demotedAt = view().push.demotedAt;
  const clean = [];
  for (let i = 0; i < 30; i++) { const r = mint(CID); clean.push({ r, ev: emit(CID, r) }); }
  await server.waitAck(clean[clean.length - 1].ev);
  await waitFor(() => logHas(clean[clean.length - 1].r.vendorId), 6000);
  ok(view().push.demotedAt === demotedAt && lane().why === 'demoted', '30 events the vendor delivers perfectly do NOT clear the demotion — the counters are not the trigger (the evidence that would clear it is what kick mode cannot produce)');
  ok(clean.every((c) => logHas(c.r.vendorId)) && missRate().total === judgedAtDemotion, 'all 30 arrived through the poll; still no samples');

  // RE-DECLARATION: the party that made the claim takes the demotion back
  const connsBefore = server.connections;
  const rd = await eng.setPush(A, { claimedExclusive: 'exclusive' });
  ok(rd.ok && rd.push.demotedAt === null && rd.push.missRate.total === 0 && rd.push.redeclaredAt, 're-declaring exclusivity clears the demotion and ZEROES the counters');
  const relive = await waitFor(() => view().push.state === 'live' && server.connections === connsBefore + 1);
  ok(!!relive, 'and retries the lane ONCE with a fresh arm (a new connection)');
  const rr = mint(CID, 'content again');
  const evr = emit(CID, rr);
  const ackr = await server.waitAck(evr);
  ok(ackr && ackr.persisted === true && lane().why === 'exclusive' && lane().carryContent === true, 'content mode is back: the next event is persisted before its ack');
  ok(logs.some((l) => /re-declared as 'exclusive'/.test(l)), 'the re-declaration is logged');
}

// ── ⑤ shared / unknown never carry; the route validates ──────────────────
console.log('⑤ shared / unknown are cursor kicks; the route');
{
  await eng.setPush(A, { claimedExclusive: 'shared' });
  await waitFor(() => view().push.state === 'live' && lane().why === 'kick-shared');
  const r = mint(CID, 'shared');
  const ev = emit(CID, r);
  const ack = await server.waitAck(ev);
  ok(ack && ack.persisted === false && lane().why === 'kick-shared' && lane().carryContent === false, '`shared`: the event is a kick, never content');
  ok(/cursor kicks only \(declared shared\)/.test(C.pushLaneText(view().push, view().lane, { now: now() })), 'the row says "cursor kicks only (declared shared)"');
  await eng.setPush(A, { claimedExclusive: 'unknown' });
  await waitFor(() => view().push.state === 'live' && lane().why === 'kick-unknown');
  ok(lane().why === 'kick-unknown' && lane().carryContent === false, '`unknown` (the default) is a kick too');

  routes.setup({ getEngine: () => eng });
  const app = express();
  app.use(express.json());
  app.use(routes.router);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const put = async (id, body) => { const r = await fetch(`${base}/api/channels/adapters/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const bad = await put(A, { push: { claimedExclusive: 'bogus' } });
  ok(bad.status === 400 && /claimedExclusive must be one of/.test(bad.body.error), 'PUT {push:{claimedExclusive:bogus}} is refused by name');
  const none = await put('fake-poll', { push: { claimedExclusive: 'exclusive' } });
  ok(none.status === 400 && none.body.code === 'no-push-lane', 'PUT push on an adapter with no push lane is `no-push-lane`');
  const good = await put(A, { push: { claimedExclusive: 'exclusive' } });
  ok(good.status === 200 && good.body.ok && good.body.push.claimedExclusive === 'exclusive', 'PUT {push:{claimedExclusive:exclusive}} re-declares through the route');
  const digest = await (await fetch(`${base}/api/channels`)).json();
  const drow = digest.adapters.find((a) => a.id === A);
  ok(drow && drow.push && drow.push.claimedExclusive === 'exclusive' && typeof drow.push.missRate.rate === 'number' && !('samples' in drow.push), 'the digest publishes the push half (claim, state, missRate summary) and never the raw sample batches');
  const noPush = digest.adapters.find((a) => a.id === 'fake-poll');
  ok(noPush && noPush.push === null, 'an adapter without a push lane publishes push:null (the panel gates its Push… control on it)');
  srv.close();
}

// ── ⑥ the Lark lane over a stub SDK ───────────────────────────────────────
console.log('⑥ the Lark long-connection lane');
{
  const instances = [];
  const sdk = {
    Domain: { Feishu: 'feishu', Lark: 'lark' }, LoggerLevel: { error: 1 },
    WSClient: class { constructor(o) { this.opts = o; this.closed = 0; instances.push(this); } async start({ eventDispatcher }) { this.dispatcher = eventDispatcher; } close() { this.closed++; } },
    EventDispatcher: class { constructor() { this.handles = new Map(); } register(map) { for (const [k, v] of Object.entries(map)) this.handles.set(k, v); return this; } invoke(type, data) { return this.handles.get(type)(data); } },
  };
  const gate = deferred();
  const seen = [], persisted = [], states = [];
  const live = createLarkLive({
    adapterId: 'lark', brand: 'lark', sdk, now, log: quiet,
    credential: () => ({ values: { appId: 'cli_app', appSecret: 'secret' } }),
    toRecord: async (convId, item) => makeRecord({ adapterId: 'lark', convId, vendorId: item.message_id, at: Number(item.create_time), author: { id: item.sender.id, name: '', isSelf: false, isBot: false }, text: JSON.parse(item.body.content).text, mentions: item.mentions.map((m) => ({ id: m.id, name: m.name })), attachments: [], replyTo: null, threadKey: null, raw: {} }),
  });
  const h = live.start({ onState: (s) => states.push(s), onEvent: async (ev) => { seen.push(ev); await gate.promise; persisted.push(ev.record.vendorId); return { ok: true, persisted: true }; } });
  await sleep(20);
  ok(instances.length === 1 && instances[0].opts.appId === 'cli_app' && instances[0].opts.domain === 'lark' && states.some((s) => s.state === 'live' && s.heard), 'the SDK client is built with the APP credential + the brand\'s domain; the handshake is positive evidence');
  const payload = { header: { event_id: 'evt-1', event_type: 'im.message.receive_v1' }, event: { sender: { sender_id: { open_id: 'ou_1' }, sender_type: 'user' }, message: { message_id: 'om_1', chat_id: 'oc_1', create_time: '1700000000000', message_type: 'text', content: '{"text":"hi @_user_1"}', mentions: [{ key: '@_user_1', id: { open_id: 'ou_2' }, name: 'Brook' }] } } };
  let settled = false;
  const p = instances[0].dispatcher.invoke('im.message.receive_v1', payload).then(() => { settled = true; });
  await sleep(40);
  ok(!settled && seen.length === 1 && persisted.length === 0, 'THE ACK IS THE HANDLER\'S RETURN: it does not resolve before the engine persisted');
  gate.resolve();
  await p;
  ok(settled && persisted[0] === 'om_1', '…and resolves once the record is durable');
  ok(seen[0].eventId === 'evt-1' && seen[0].convId === 'oc_1' && seen[0].record.text === 'hi @Brook' && seen[0].record.mentions[0].name === 'Brook', `the v2 payload lands as the REST item shape through the adapter's own normalizer — the @_user_1 ORDINAL resolves against the record's own mentions exactly as on the poll path (one normalizer, two arrivals): "${seen[0].record.text}"`);
  const item = eventToItem(payload);
  ok(item.mentions[0].key === '@_user_1' && item.mentions[0].id === 'ou_2' && item.sender.id === 'ou_1' && item.msg_type === 'text', 'eventToItem keeps the ordinal key + the resolved open_id + the sender');
  h.stop();
  let threw = null;
  try { await instances[0].dispatcher.invoke('im.message.receive_v1', { ...payload, header: { event_id: 'evt-2' } }); } catch (e) { threw = e; }
  ok(threw && /not acknowledged/.test(threw.message) && instances[0].closed === 1, 'after stop() the handler REFUSES the ack (the vendor redelivers to whoever is alive) and the client is closed');
  let installed = false; try { require.resolve(SDK_NAME); installed = true; } catch {}
  if (installed) console.log(`  … SKIP: ${SDK_NAME} is installed here, so the "not installed" refusal cannot be driven`);
  else {
    const st2 = [];
    const h2 = createLarkLive({ adapterId: 'lark', now, log: quiet, credential: () => ({ values: { appId: 'a', appSecret: 'b' } }), toRecord: async () => null }).start({ onState: (s) => st2.push(s), onEvent: async () => ({}) });
    await sleep(20);
    ok(st2.some((s) => s.state === 'unavailable' && /not installed/.test(s.why) && s.code === 'sdk-not-installed'), 'without the SDK the lane parks as `unavailable` naming the install line — never a crash, never a retry loop');
    h2.stop();
  }
  const st3 = [];
  const h3 = createLarkLive({ adapterId: 'lark', sdk, now, log: quiet, credential: () => ({ values: null, why: 'no app credential' }), toRecord: async () => null }).start({ onState: (s) => st3.push(s), onEvent: async () => ({}) });
  await sleep(20);
  ok(st3.some((s) => s.state === 'unavailable' && s.code === 'needs-credentials'), 'without an app credential the lane parks as `unavailable` (needs-credentials)');
  h3.stop();
}

// ── ⑦ the Gmail Pub/Sub pull lane over a fake fetch ───────────────────────
console.log('⑦ the Gmail push lane');
{
  const calls = [];
  let pulls = 0;
  const json = (b) => ({ ok: true, status: 200, json: async () => b });
  const fetchFn = async (url, init) => {
    calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
    if (/:pull$/.test(url)) {
      pulls++;
      if (pulls === 1) return json({ receivedMessages: [{ ackId: 'ack-1', message: { messageId: 'm-1', data: Buffer.from(JSON.stringify({ emailAddress: 'userA@example.com', historyId: '123' })).toString('base64') } }] });
      await sleep(100);
      return json({});
    }
    if (/:acknowledge$/.test(url)) return json({});
    throw new Error('unexpected ' + url);
  };
  const api = async (pathq, opts) => { calls.push({ url: 'gmail' + pathq, body: opts && opts.json }); return { historyId: '100', expiration: String(Date.now() + 7 * 86400e3) }; };
  const mk = (over = {}) => createGmailLive({ adapterId: 'gmail', api, accessToken: async () => 'tok', tokenScopes: () => ['https://www.googleapis.com/auth/gmail.readonly', PUBSUB_SCOPE], options: () => ({ topic: 'projects/p/topics/t', subscription: 'projects/p/subscriptions/s' }), fetch: fetchFn, now, log: quiet, pullTimeoutMs: 1000, ...over });
  const kicks = [], gs = [];
  const gh = mk().start({ onState: (s) => gs.push(s), onEvent: async (ev) => { kicks.push(ev); await sleep(30); return { ok: true, kicked: true }; } });
  const acked = await waitFor(() => calls.find((c) => /:acknowledge$/.test(c.url)));
  ok(calls[0] && calls[0].url === 'gmail/watch' && calls[0].body.topicName === 'projects/p/topics/t', 'users.watch is armed FIRST, with the topic');
  ok(kicks.length === 1 && kicks[0].kind === 'kick' && kicks[0].historyId === '123' && kicks[0].eventId === 'm-1' && !kicks[0].record, 'a pulled note is a CURSOR KICK carrying the historyId — never mail');
  ok(!!acked && acked.body.ackIds[0] === 'ack-1', 'the ack is sent after the engine answered');
  ok(gs.some((s) => s.state === 'live' && s.heard), 'a pull that answered is positive evidence');
  gh.stop();
  await sleep(20);
  const pullsAtStop = pulls;
  await sleep(250);
  ok(pulls <= pullsAtStop + 1, 'stop() ends the pull loop');
  const st2 = [];
  const h2 = mk({ tokenScopes: () => ['https://www.googleapis.com/auth/gmail.readonly'] }).start({ onState: (s) => st2.push(s), onEvent: async () => ({}) });
  await sleep(20);
  ok(st2.some((s) => s.state === 'unavailable' && s.code === 'scope-missing'), 'a token without the pubsub scope is a NAMED refusal (re-authorize with push enabled)');
  h2.stop();
  const st3 = [];
  const h3 = mk({ options: () => ({ topic: '', subscription: '' }) }).start({ onState: (s) => st3.push(s), onEvent: async () => ({}) });
  await sleep(20);
  ok(st3.some((s) => s.state === 'unavailable' && s.code === 'push-not-configured'), 'missing topic/subscription options are a NAMED refusal');
  h3.stop();
  // the default-off switch, through the ONE resolver
  const gmail = require(path.join(REPO, 'src/channels/gmail.js'));
  const on = { push: { enabled: true, claimedExclusive: 'exclusive', state: 'live', lastEventAt: now() } };
  const off = { push: { enabled: undefined, claimedExclusive: 'exclusive', state: 'live', lastEventAt: now() } };
  ok(C.laneState(gmail.caps, off, {}, now()).via === 'poll' && C.laneState(gmail.caps, on, {}, now()).via === 'push', 'an OPT-IN lane is the poll lane until the record says enabled:true (decision 20)');

  // A PERMANENT PULL FAILURE PARKS THE LANE (the P4 verifier's low): a 403 /
  // 404 pull was reported through `closed`, so the core reconnected — re-ran
  // users.watch and the pull — every ≤60 s forever, persisting and
  // broadcasting on every connecting↔reconnecting transition, and the row
  // read "reconnecting" instead of a named "unavailable" (design §6.4).
  {
    const c403 = []; let pulls403 = 0; const st = [];
    const f403 = async (url) => { c403.push({ url }); if (/:pull$/.test(url)) { pulls403++; return { ok: false, status: 403, json: async () => ({ error: { message: 'User not authorized to perform this action.', status: 'PERMISSION_DENIED' } }) }; } throw new Error('unexpected ' + url); };
    const api403 = async (pathq) => { c403.push({ url: 'gmail' + pathq }); return { historyId: '1', expiration: '0' }; };
    const h = mk({ fetch: f403, api: api403, reconnectMinMs: 20, reconnectMaxMs: 40 }).start({ onState: (s) => st.push(s), onEvent: async () => ({}) });
    const parked = await waitFor(() => st.find((s) => s.state === 'unavailable'));
    ok(parked && parked.code === 'pubsub-forbidden' && /403/.test(parked.why), `a 403 pull parks the lane as \`unavailable\` naming the code (${parked && parked.code}: ${parked && parked.why})`);
    await sleep(150);                                              // several reconnect windows
    ok(c403.filter((c) => c.url === 'gmail/watch').length === 1 && pulls403 === 1 && !st.some((s) => s.state === 'reconnecting') && h.state() === 'unavailable', `parked stays parked: users.watch ${c403.filter((c) => c.url === 'gmail/watch').length}×, pull ${pulls403}×, no reconnecting`);
    h.stop();
  }
  // CONTROL: a TRANSIENT pull failure (5xx) backs off and retries — not parked
  {
    let pulls503 = 0; const st = [];
    const f503 = async (url) => { if (/:pull$/.test(url)) { pulls503++; return { ok: false, status: 503, json: async () => ({}) }; } throw new Error('unexpected ' + url); };
    const h = mk({ fetch: f503 }).start({ onState: (s) => st.push(s), onEvent: async () => ({}) });
    await waitFor(() => pulls503 >= 1);
    await sleep(40);
    ok(pulls503 >= 1 && st.some((s) => s.state === 'live') && !st.some((s) => s.state === 'unavailable' || s.state === 'reconnecting') && h.state() === 'live', 'CONTROL: a 503 pull is retried on the backoff — the lane is neither parked nor reconnected');
    h.stop();
  }
  // THE WATCH RENEWAL: a refused renewal parks at once (the watch WILL lapse
  // and a pulling lane would read `live` while nothing is ever published);
  // a transient failure parks after WATCH_RENEW_MAX_FAILS in a row
  {
    let watches = 0; const st = [];
    const apiRefuse = async () => { watches++; if (watches === 1) return { historyId: '1', expiration: '0' }; const e = new Error('forbidden (403)'); e.retryable = false; throw e; };
    const h = mk({ api: apiRefuse, watchRenewMs: 15 }).start({ onState: (s) => st.push(s), onEvent: async () => ({}) });
    const parked = await waitFor(() => st.find((s) => s.state === 'unavailable'));
    const watchesAtPark = watches;
    await sleep(60);
    ok(parked && parked.code === 'watch-renew-failed' && /refused/.test(parked.why) && watchesAtPark === 2 && watches === 2, `a REFUSED renewal parks the lane at once and the renewal timer stops with it (${watches} watch calls)`);
    h.stop();
    let watches2 = 0; const st2 = [];
    const apiFlaky = async () => { watches2++; if (watches2 === 1) return { historyId: '1', expiration: '0' }; const e = new Error('503'); e.retryable = true; throw e; };
    const h2 = mk({ api: apiFlaky, watchRenewMs: 15 }).start({ onState: (s) => st2.push(s), onEvent: async () => ({}) });
    const parked2 = await waitFor(() => st2.find((s) => s.state === 'unavailable'));
    ok(parked2 && parked2.code === 'watch-renew-failed' && /failed 3× in a row/.test(parked2.why) && watches2 - 1 === WATCH_RENEW_MAX_FAILS, `a transient renewal failure parks after ${WATCH_RENEW_MAX_FAILS} consecutive misses (${watches2 - 1})`);
    h2.stop();
  }
}

eng.stop();
wss.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
