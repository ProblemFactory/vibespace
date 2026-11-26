#!/usr/bin/env node
// THE QUEUED WAKE (lane queued-is-not-woke, law 1 — row B-580f, 主开发's brief 2026-11-11 and ruling 2026-11-12).
// THE INCIDENT: an Antigravity conversation's turn never ended (a run_command that never returned); three messages sent
// to it with --wake were each answered «woke 1 agent = 1 billed turn», drawn «read by» and charged to the spend ceiling —
// while its wrapper held them in its queue for six hours. THE LAW: the sender is told what the addressee DID, not what
// the hub wrote. A frame its wrapper queues behind a running turn is «waiting for <name>'s current turn (running since
// HH:MM)», the group's mark is not «read», the charge is OWED (authorized at the send, charged once when a turn carries
// it, released when it is handed back). Claude's cli-inbox into a running turn: true words, master's charge (ruled).
// The REAL groups-engine + conversation-deliver + channel store; ⑦ the REAL agy wrapper over the fake agy's `stuck`
// turn, through the REAL acp-events consumer. Each section's red control is a patched copy (⑩).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // B-0d3e: a red control's edit through THE anchored door — an anchor gone or found twice fails by name
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };   // (name, condition, detail)
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const G = require(path.join(REPO, 'src/channel-groups.js'));
const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
const DELIVER = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-queued-wake-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });

const A = 'aaaaaaaa-0000-4000-8000-00000000000a';   // the sender
const X = 'bbbbbbbb-0000-4000-8000-00000000000b';   // the addressee
const T_TURN = Date.parse('2026-11-11T17:10:03Z');   // the incident's run_command

/** a hub with ONE addressee session (`be`), in a turn or idle, its wrapper replaced by the hooks the stdout consumers call */
function world(be = 'antigravity', { streaming = true, dataDir = null, store = null, mod = DELIVER, ge = GE, guard = null, caps = null, pid = process.pid, overCap = false } = {}) {
  const dir = dataDir || fs.mkdtempSync(path.join(ROOT, be + '-'));
  fs.mkdirSync(path.join(dir, 'session-buffers'), { recursive: true });
  const st = store || createChannelStore({ dir: path.join(dir, 'channels') });
  const wid = 'w-' + be, frames = [], posts = [];
  const S = { backend: be, mode: 'chat', name: 'xray', host: null, socketPath: path.join(dir, 'cw-' + wid), _isStreaming: streaming, _turnStateSeen: true, _turnOpenedAt: streaming ? T_TURN : undefined, pty: { write: (f) => frames.push(JSON.parse(String(f))) } };
  if (be === 'claude') S.claudeSessionId = X; else S.backendSessionId = X;
  if (be !== 'claude') fs.writeFileSync(path.join(dir, 'session-buffers', wid + '.json'), JSON.stringify({ pid, startedAt: Date.now(), mode: 'chat', backend: be, threadId: X, caps: caps || (be === 'codex' ? { peerMessage: true, queueVerbs: ['remove', 'steer', 'steer-all'] } : { peerMessage: true, notificationSteer: false }) }));
  const money = { auth: 0, notes: [], releases: 0, returned: new Set() };   // notes: every noteSpend (a reservation names its frame); returned: reservations given back
  const deliver = mod.create({
    dataDir: dir, activeSessions: new Map([[wid, S]]), serverSetting: () => undefined, getHosts: () => null, getConvIndex: () => null,
    peerMsg: { findPeer: (cid) => (be === 'claude' && cid === X ? { name: 'xray', socketPath: '/dev/null', pid: process.pid } : null), postToPeer: async (peer, text) => { posts.push(text); return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) },
    emitPeerCard: () => true,
    reservationState: guard ? (rid) => guard.reservationState(rid) : null,
    waitingReservations: guard && overCap ? () => guard.waitingReservations() : null,   // B-0a33 cure (c): the guard's waiting reservations (and overCap) — opt-in, as server.js wires it
    authorizeSpend: (req) => { money.auth++; if (guard) return guard.authorize(req); return { ok: true, identity: { key: 'slot-1', name: 'slot one' }, hold: 'h' + money.auth }; },
    noteSpend: (rec) => { money.notes.push({ reason: rec && rec.reason, identity: rec && rec.identity && rec.identity.key, reservation: (rec && rec.reservation) || null, carried: !!(rec && rec.carried) }); if (guard) guard.note(rec); }, releaseSpend: (rec) => { money.releases++; if (rec && rec.reservation) money.returned.add(rec.reservation); if (guard) guard.release(rec); },
    log: () => { },
  });
  let t = Date.parse('2026-11-11T19:00:00Z');
  const roster = [{ cid: A, name: 'alpha', groups: ['tg1'], reachability: null }, { cid: X, name: 'xray', groups: ['tg1'], reachability: null }];
  const eng = ge.create({ store: st, deliver, broadcast: () => { }, now: () => (t += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() { }, warn() { }, log() { } } });
  const row = (gid, rec) => G.deliveryOf(eng.get(gid), rec, { log: [rec] }).find((x) => x.member === X) || null;
  const settle = (mode, ok = true) => deliver.settleRpcDelivery(X, { ok, mode });
  // charged = the units the guard holds: every stamp, minus the reservations given back (by their ids)
  return { dir, store: st, eng, deliver, S, frames, posts, money, row, settle, charged: () => money.notes.filter((n) => !n.carried && !(n.reservation && money.returned.has(n.reservation))).length, converted: () => money.notes.filter((n) => n.carried).length };
}
const settleTick = () => new Promise((r) => setImmediate(r));

console.log('① THE INCIDENT AT THE ENGINE — three --wake messages to an Antigravity conversation in a turn');
let W1, gid1, sent1 = [];
{
  W1 = world('antigravity');
  const s0 = await W1.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false });   // the pair, a quiet first message
  gid1 = s0.group.id;
  for (const text of ['are you there?', 'still waiting', 'please reply']) sent1.push(await W1.eng.post({ group: gid1, from: A, text, wake: true }));
  await settleTick();
  ok('① each --wake is answered QUEUED, never woke: the post\'s result lists the addressee under `queued` (with the turn it waits behind), `woke` is empty — 3 of 3',
    sent1.every((s) => s.ok && (s.woke || []).length === 0 && (s.queued || []).length === 1 && s.queued[0].member === X && s.queued[0].since === T_TURN), JSON.stringify(sent1.map((s) => ({ woke: s.woke, queued: s.queued }))));
  const rows = sent1.map((s) => W1.row(gid1, s.message));
  ok('① …and each record reads «waiting for xray\'s current turn» (deliveryOf `queued`, since = the running turn\'s start), never «read by»',
    rows.every((r) => r && r.state === 'queued' && r.since === T_TURN), JSON.stringify(rows));
  ok('① …the frames were written (the wrapper holds them), and each send TOOK ITS UNIT as a RESERVATION — a stamp named by its frame\'s id, counted like a spent turn (round 2: the owner\'s ceiling is never passed by queueing)', W1.frames.length === 3 && W1.money.auth === 3 && W1.money.notes.filter((n) => !n.carried).length === 3 && W1.money.notes.every((n) => /^qw-/.test(n.reservation || '')) && W1.charged() === 3, JSON.stringify(W1.money));
  // the wrapper's records: its queue grows (queue_changed), each frame answered «queued» (peer_result)
  for (let i = 0; i < 3; i++) { W1.deliver.noteQueueItems(X, Array.from({ length: i + 1 }, (_, k) => ({ id: 'q' + (k + 1) })), { fresh: true }); ok(`① the wrapper answers frame ${i + 1} «queued» ⇒ the settle says so; its reservation stands (no second unit)`, W1.settle('queued') === 'queued' && W1.charged() === 3 && W1.money.notes.filter((n) => !n.carried).length === 3); }
  ok('① …no hold is left open and nothing was given back: each hold BECAME its reservation', W1.money.releases === 0, JSON.stringify(W1.money));
  const rep = W1.eng.reportsForTurn(X);
  ok('① NO SECOND CARRIER: the addressee\'s next-turn report holds none of the three (they are in its wrapper\'s queue — a report would send them twice)',
    !sent1.some((s) => rep && rep.text && rep.text.includes(s.message.text)), rep && rep.text);
  ok('① the ladder keeps one entry per queued frame, each bound to its own queue item', W1.deliver.queuedEntries(X).length === 3);
}

console.log('② THE TURN ENDS — the wrapper drains one frame per turn; each is charged ONCE and read when its own turn starts');
{
  const drain = (left) => { W1.deliver.noteTurnEnded(X); W1.deliver.noteQueueItems(X, left.map((id) => ({ id })), { fresh: true }); W1.deliver.noteTurnStarted(X); };
  drain(['q2', 'q3']); await settleTick();
  let st = sent1.map((s) => W1.row(gid1, s.message).state);
  ok('② the first frame\'s turn starts ⇒ its record reads «read by» (the hand-over clock = that turn), the other two still wait for the current turn', st.join() === 'handed,queued,queued' && Number.isFinite(W1.row(gid1, sent1[0].message).at), st.join());
  ok('② …the turn that carries it IS its reserved unit: nothing more is charged (3 units, the authorization\'s identity and reason)', W1.charged() === 3 && W1.money.notes.filter((n) => !n.carried).length === 3 && W1.money.notes[0].reason === 'peer-message' && W1.money.notes[0].identity === 'slot-1', JSON.stringify(W1.money.notes));
  drain(['q3']); drain([]); await settleTick();
  st = sent1.map((s) => W1.row(gid1, s.message).state);
  ok('② …each later turn carries the next: all three read, three units — one per turn that carried a message, each taken at its send', st.join() === 'handed,handed,handed' && W1.charged() === 3 && W1.money.notes.filter((n) => !n.carried).length === 3, JSON.stringify({ st, n: W1.charged() }));
  W1.deliver.noteTurnEnded(X); W1.deliver.noteTurnStarted(X);
  ok('② …a later turn charges nothing more, and the ladder holds nothing', W1.charged() === 3 && W1.deliver.queuedEntries(X).length === 0);
}

console.log('③ STOP HANDS THE THREE BACK — once each, never charged, then read at the next turn');
{
  const W = world('antigravity');
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const sent = [];
  for (const text of ['one', 'two', 'three']) sent.push(await W.eng.post({ group: gid, from: A, text, wake: true }));
  for (let i = 0; i < 3; i++) { W.deliver.noteQueueItems(X, Array.from({ length: i + 1 }, (_, k) => ({ id: 's' + k })), { fresh: true }); W.settle('queued'); }
  // Stop: the wrapper empties its queue and hands each peer item back (peer_result ok:false + its words, mode-less)
  W.deliver.noteQueueItems(X, [], { fresh: true });
  const back = W.frames.map((f) => W.deliver.noteHandedBack(X, f.text, 'dropped by Stop before it was delivered'));
  await settleTick();
  ok('③ Stop: each of the three frames is recognised by its words and handed back (3 of 3)', back.every(Boolean), JSON.stringify(back));
  ok('③ …each reservation RETURNED by its id (3 of 3) — no unit kept for a turn that never ran; the ledger holds them only as words for the next turn', W.charged() === 0 && W.money.returned.size === 3 && W.deliver.queuedEntries(X).every((e) => e.state === 'restashed'), JSON.stringify(W.money));
  ok('③ …the records say «waiting for xray\'s next turn» (the words ride the stash, master\'s road), never «read»', sent.every((s) => W.row(gid, s.message).state === 'waiting'));
  ok('③ …a second hand-back of the same words finds nothing (once)', W.deliver.noteHandedBack(X, W.frames[0].text) === false);
  W.deliver.noteTurnStarted(X); await settleTick();
  ok('③ a turn start alone reads nothing: the words are in the stash (three entries, once each, with the ref their drain answers)', sent.every((s) => W.row(gid, s.message).state === 'waiting') && W.deliver.stashEntries(X).length === 3 && W.deliver.stashEntries(X).every((e) => /^queued-wake:/.test(e.ref || '')));
  W.deliver.drainStash(X); await settleTick();
  ok('③ the stash HANDS the three to a turn (its drain) ⇒ read, still charged nothing (the stash rode a turn somebody else paid for)', sent.every((s) => W.row(gid, s.message).state === 'handed') && W.charged() === 0 && W.deliver.queuedEntries(X).length === 0);
}

console.log('④ A HUB RESTART between the queue and the drain — the owed charge and the mark survive, the drain charges once');
{
  const W = world('antigravity');
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const s = await W.eng.post({ group: gid, from: A, text: 'across a restart', wake: true });
  W.deliver.noteQueueItems(X, [{ id: 'r1' }], { fresh: true }); W.settle('queued');
  SW.storeWriter().flushSync();
  const held = JSON.parse(fs.readFileSync(path.join(W.dir, 'msg-queued.json'), 'utf8'));
  ok('④ the queued entry is on disk (msg-queued.json, through the store writer): its reservation, its words, its mark, its bound item', held.entries.length === 1 && held.entries[0].reserved === true && /across a restart/.test(held.entries[0].text) && held.entries[0].mark && held.entries[0].mark.gid === gid && held.entries[0].bind[0] === 'r1', JSON.stringify(held));
  // the new hub: the same data dir and store (the wrapper outlived the hub)
  const W2 = world('antigravity', { dataDir: W.dir, store: W.store });
  ok('④ the restarted hub holds the entry again', W2.deliver.queuedEntries(X).length === 1 && W2.row(gid, s.message).state === 'queued');
  W2.deliver.noteQueueItems(X, [], { fresh: true }); await settleTick();   // the first queue it reads: the item is gone (it ran while the hub was down)
  ok('④ …the first queue the new hub reads no longer holds the item ⇒ carried, read — and charged NOTHING more (its unit was reserved at the send, by the first hub)', W2.money.notes.filter((n) => !n.carried).length === 0 && W.charged() === 1 && W2.row(gid, s.message).state === 'handed' && W2.deliver.queuedEntries(X).length === 0, JSON.stringify({ w2: W2.money, w1: W.money }));
}

console.log('⑤ FAILS CLOSED — a frame the wrapper never answers is never silently free');
{
  const W = world('antigravity');
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  await W.eng.post({ group: gid, from: A, text: 'nobody answers this', wake: true });
  ok('⑤ the settle window passes with no answer ⇒ nothing settles; its reservation STANDS (counted — never a silent give-away)', W.deliver.settleRpcDelivery(X, { ok: true, mode: 'queued', now: Date.now() + 121 * 1000 }) === null && W.charged() === 1);
  ok('⑤ …and the entry is KEPT (law 2\'s bound speaks for it), nothing returned', W.deliver.queuedEntries(X).length === 1 && W.money.returned.size === 0);
  W.deliver.noteTurnEnded(X); W.deliver.noteTurnStarted(X); await settleTick();   // the running turn ends, the next starts (nothing bound: the oldest frame rides it)
  ok('⑤ …the next turn after the running one carries it ⇒ still ONE unit', W.charged() === 1 && W.money.notes.filter((n) => !n.carried).length === 1 && W.deliver.queuedEntries(X).length === 0, JSON.stringify(W.money));
}

console.log('⑥ CLAUDE in a turn (ruled 2026-11-12): the CLI takes the post INTO its running turn — true words, master\'s charge');
{
  const W = world('claude');
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const s = await W.eng.post({ group: gid, from: A, text: 'join the turn', wake: true });
  ok('⑥ the wake is a wake, flagged `intoTurn` (the CLI says «handed into xray\'s running turn»), read, charged ONCE as on master',
    (s.woke || []).length === 1 && s.woke[0].intoTurn === true && !(s.queued || []).length && W.row(gid, s.message).state === 'handed' && W.charged() === 1, JSON.stringify({ woke: s.woke, n: W.charged() }));
  const W0 = world('claude', { streaming: false });
  const g0 = (await W0.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const s0 = await W0.eng.post({ group: g0, from: A, text: 'idle', wake: true });
  ok('⑥ …an IDLE claude: a plain wake (no intoTurn), charged once — master unchanged', s0.woke.length === 1 && !s0.woke[0].intoTurn && W0.charged() === 1);
}

console.log('⑦ THE INCIDENT, REAL PROCESSES — the agy wrapper over the fake agy\'s `stuck` turn, through the real acp-events consumer');
{
  const { spawn } = await import('node:child_process');
  const D = fs.mkdtempSync(path.join(ROOT, 'real-'));
  const BUF = path.join(D, 'session-buffers'); fs.mkdirSync(BUF, { recursive: true });
  const env0 = { ...process.env }; for (const k of Object.keys(env0)) if (/^VIBESPACE_|^ACP_WEBUI_|^AGY_|^CLAUDE_CODE_/.test(k)) delete env0[k];
  const CID = 'a9e7c0de-1111-4222-8333-0000deadbeef', WID = 'sess-77-1000';
  const kid = spawn(process.execPath, [path.join(REPO, 'data/bin/agy-wrapper.js'), path.join(BUF, WID + '.buf'), path.join(BUF, WID + '.json'), path.join(REPO, 'scripts/fixtures/antigravity-agy')], {
    env: { ...env0, HOME: D, AGY_WEBUI_CWD: D, AGY_WEBUI_BACKEND: 'antigravity', AGY_WEBUI_RESUME_ID: CID, AGY_WEBUI_AUTH_GRACE_MS: '400', AGY_STUB_LOG: path.join(D, 'stub.log') }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const until = async (pred, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = pred(); if (v) return v; await new Promise((r) => setTimeout(r, 15)); } throw new Error('timeout: ' + what); };
  try {
    const frames = [];
    const S = { backend: 'antigravity', mode: 'chat', backendSessionId: null, claudeSessionId: null, name: 'verifier', host: null, buffer: '', sockName: null, socketPath: path.join(D, 'cw-' + WID), pty: { write: (s) => { frames.push(String(s)); kid.stdin.write(s); } } };
    const money = { auth: 0, notes: 0, releases: 0, returned: 0 };
    const L = DELIVER.create({
      dataDir: D, activeSessions: new Map([[WID, S]]), serverSetting: () => undefined, getHosts: () => null, getConvIndex: () => null,
      peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => true,
      authorizeSpend: () => { money.auth++; return { ok: true, identity: { key: 'slot-1', name: 's1' }, hold: 'h' + money.auth }; }, noteSpend: () => { money.notes++; }, releaseSpend: (rec) => { money.releases++; if (rec && rec.reservation) money.returned++; }, log: () => { },
    });
    const C = require(path.join(REPO, 'src/server/stdout/acp-events.js')).create({ engine: { noteTurnEnd: () => { } }, noteHarnessModels: () => { }, deliverRef: L, permissionRulesRef: null });
    const noop = () => { };
    const log0 = console.log; console.log = (...a) => { const s = a.join(' '); if (!s.startsWith('[deliver]')) log0(...a); };
    C.attach(S, WID, { onData: (cb) => { kid.stdout.setEncoding('utf8'); kid.stdout.on('data', cb); } }, { feedLive: noop, broadcastToSession: noop, broadcastActiveSessions: noop, readSessionMeta: () => null, writeSessionMeta: noop, updateSessionTodos: noop });
    await until(() => S.backendSessionId === CID, 8000, 'the session adopted');
    const store = createChannelStore({ dir: path.join(D, 'channels') });
    const roster = [{ cid: A, name: 'alpha', groups: ['tg1'], reachability: null }, { cid: CID, name: 'verifier', groups: ['tg1'], reachability: null }];
    const eng = GE.create({ store, deliver: L, broadcast: () => { }, now: () => Date.now(), roster: () => roster, groupSetting: () => 'none', log: { info() { }, warn() { }, log() { } } });
    const gid = (await eng.sendToAgent({ from: A, to: CID, text: 'hello', wake: false })).group.id;
    // the person's prompt opens the turn that never ends: a run_command goes ACTIVE, nothing follows
    kid.stdin.write(JSON.stringify({ type: 'chat-input', text: 'run the driver (stuck)', msgId: 'u-stuck' }) + '\n');
    await until(() => S._isStreaming === true, 5000, 'the turn open');
    const sent = [];
    for (const text of ['12:02 are you alive?', '15:52 status?', '16:02 please answer']) sent.push(await eng.post({ group: gid, from: A, text, wake: true }));
    await until(() => L.queuedEntries(CID).filter((e) => e.state === 'queued').length === 3, 5000, 'three answered «queued» by the REAL wrapper');
    const rows = () => sent.map((s) => G.deliveryOf(eng.get(gid), s.message, { log: [s.message] }).find((x) => x.member === CID).state).join();
    ok('⑦ the three sends: «waiting for verifier\'s current turn» — queued, not woke; the rows `queued`; each unit RESERVED at the send (the incident said woke ×3, read ×3)',
      sent.every((s) => !(s.woke || []).length && (s.queued || []).length === 1) && rows() === 'queued,queued,queued' && money.notes === 3 && money.auth === 3, JSON.stringify({ rows: rows(), money }));
    await new Promise((r) => setTimeout(r, 300));
    ok('⑦ …the turn stays open (no result ever comes) and the three stay waiting — no mark, their three units held, no matter how long', S._isStreaming === true && rows() === 'queued,queued,queued' && money.notes === 3 && money.returned === 0);
    // Stop — the owner's door: the wrapper ends the turn, empties its queue and hands each peer item back
    kid.stdin.write(JSON.stringify({ type: 'interrupt' }) + '\n');
    await until(() => L.stashEntries(CID).length >= 3, 8000, 'the three re-stashed');
    await new Promise((r) => setTimeout(r, 150));
    const st = L.stashEntries(CID);
    ok('⑦ Stop hands the three over ONCE: three stash entries carrying their words (never a fourth), the three reservations RETURNED', st.length === 3 && sent.every((s) => st.some((e) => String(e.text).includes(s.message.text))) && money.returned === 3, JSON.stringify({ n: st.length, money }));
    ok('⑦ …the records now wait for the next turn (`waiting`), and the ladder holds them only as words for it', rows() === 'waiting,waiting,waiting' && L.queuedEntries(CID).every((e) => e.state === 'restashed'), rows());
    console.log = log0;
  } finally { try { kid.kill('SIGKILL'); } catch { } }
}

console.log('⑧ CODEX — the same law through its own records (peer_message_result, queue_changed)');
{
  const W = world('codex');
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const s = await W.eng.post({ group: gid, from: A, text: 'queue me', wake: true });
  W.deliver.noteQueueItems(X, [{ id: 'peer-1-1' }], { fresh: true });
  ok('⑧ a --wake to codex in a turn: queued (thread/queue/add), «waiting for xray\'s current turn», its unit reserved', (s.queued || []).length === 1 && W.settle('queued') === 'queued' && W.row(gid, s.message).state === 'queued' && W.charged() === 1);
  W.deliver.noteTurnEnded(X); W.deliver.noteTurnStarted(X); W.deliver.noteQueueItems(X, [], { fresh: true }); await settleTick();   // codex: turn/started may precede the queue's republish
  ok('⑧ …its turn starts and the queue no longer holds it (either order) ⇒ read, still one unit', W.row(gid, s.message).state === 'handed' && W.charged() === 1 && W.money.notes.filter((n) => !n.carried).length === 1);
  const n = await W.deliver.deliverToConversation(X, 'job done', { kind: 'notification', spendReason: 'job-notification' });
  ok('⑧ a NOTIFICATION into a running codex turn still STEERS, free — master\'s cell, rowed for the owner (not this lane\'s)', n.ok && n.steered === true && !n.queued && W.settle('steered') === 'free');
}

console.log('⑨ WIRING — the consumers feed the ladder by PROPERTY ACCESS; the words reach the CLI, the window, zh / ja');
{
  const acp = read('src/server/stdout/acp-events.js'), cdx = read('src/server/stdout/codex-events.js');
  for (const [name, src] of [['acp-events', acp], ['codex-events', cdx]]) {
    ok(`⑨ ${name}: queue_changed → noteQueueItems, the turn's start → noteTurnStarted (+ _turnOpenedAt), its end → noteTurnEnded, a mode-less hand-back → noteHandedBack — each by property access on the lazy ref`,
      ['deliverRef?.noteQueueItems?.(', 'deliverRef?.noteTurnStarted?.(', 'deliverRef?.noteTurnEnded?.(', 'deliverRef?.noteHandedBack?.(', 'session._turnOpenedAt = Date.now();'].every((n) => src.includes(n)));
  }
  const msg = read('data/bin/vibespace-msg');
  ok('⑨ vibespace-msg says a queued wake as waiting («waiting (not billed yet): xray\'s current turn (running since …)»), a claude one as «handed into …»; read\'s clause names the `queued` row',
    /waiting \(not billed yet\): /.test(msg) && msg.includes('handed into ${[...into].map(') && msg.includes("wk.delivered === 'queued'") && /x\.state === 'queued' \? `waiting for \$\{x\.name\}'s current turn/.test(msg));
  const routes = read('src/agent-routes.js');
  ok('⑨ the send answer carries `queued` (name + since) and `intoTurn`; a read row carries `since`', /queued: \(r\.queued \|\| \[\]\)\.map/.test(routes) && /intoTurn: msgNames\(/.test(routes) && /since: d\.since/.test(routes));
  // round 2 SMALL: the owner's toast and a channel receipt say the same truth (driven, not read)
  const CW = await import(path.join(REPO, 'src/lib/channel-words.js'));
  const toastQ = CW.wakeEchoText({ woke: [], queued: [{ member: X }] }), toastIn = CW.wakeEchoText({ woke: [{ member: X, intoTurn: true }] });
  ok('⑨ the owner\'s toast: a queued wake is «waiting behind a running turn — billed when a turn carries it» (never «woke nobody — no billed turn»); a claude hand-in is «handed into a running turn = 1 billed turn» (never «woke 1 agent»)',
    /1 waiting behind a running turn — billed when a turn carries it/.test(toastQ) && !/woke nobody/.test(toastQ) && /1 handed into a running turn = 1 billed turn/.test(toastIn) && !/woke 1 agent/.test(toastIn), JSON.stringify({ toastQ, toastIn }));
  const CP = require(path.join(REPO, 'src/channel-policy.js'));
  const fate = CP.receiptFateOf({ receipt: true, draftedBy: { kind: 'agent', name: 'xray' }, receiptDelivery: { ok: true, at: Date.parse('2026-11-12T09:00:00Z'), woke: true, queued: true, lane: 'rpc-queue' } });
  ok('⑨ a channel receipt delivered into a queue reads «Queued for xray at 09:00 — it runs when its current turn ends», never «woken for it»', fate.queued === true && fate.woke === false && CP.receiptFateText(fate) === 'Queued for xray at 09:00 — it runs when its current turn ends', CP.receiptFateText(fate));
  const words = read('src/lib/channel-words.js');
  ok('⑨ the window words the `queued` row and counts it', /case 'queued': return/.test(words) && /'\{n\} waiting for a current turn'/.test(words));
  for (const lang of ['zh', 'ja']) {
    const t = read(`src/lib/i18n-${lang}.js`);
    ok(`⑨ ${lang}: the three new strings are translated`, ["\"Waiting for {name}'s current turn (running since {time})\"", "\"Waiting for {name}'s current turn\"", '"delivery::{n} waiting for a current turn"'].every((k) => t.includes(k)));
  }
}


console.log('⑪ THE CEILING (round 2 MUST) — the REAL spend guard at 3 an hour: queueing never takes a conversation past it');
const GUARD = require(path.join(REPO, 'src/server/spend-guard.js'));
const realGuard = (dir) => { const settings = { 'spend.unattendedPerIdentityHour': 3 }; return GUARD.create({ dataDir: dir, serverSetting: (k) => settings[k], identityOf: () => ({ key: 'slot-1', name: 'slot one' }), getUserTodos: () => null, log: () => { } }); };
const hourOf = (g) => ((g.snapshot().budget.identities || {})['slot-1'] || []).length;
{
  const dir = fs.mkdtempSync(path.join(ROOT, 'ceil-')); const guard = realGuard(dir);
  const W = world('antigravity', { dataDir: dir, guard });
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const sent = [];
  for (let i = 0; i < 8; i++) { sent.push(await W.eng.post({ group: gid, from: A, text: 'm' + i, wake: true })); W.deliver.noteQueueItems(X, Array.from({ length: Math.min(i + 1, 3) }, (_, k) => ({ id: 'c' + k })), { fresh: true }); W.settle('queued'); }
  const shape = sent.map((s) => (s.queued || []).length ? 'Q' : (s.refused || []).length ? 'R' : '?').join('');
  ok('⑪ eight --wake sends to a conversation in a turn at cap 3: the first three QUEUED, sends 4 to 8 REFUSED at the send, by name (the hour cap) — frames written: 3', shape === 'QQQRRRRR' && W.frames.length === 3 && sent.slice(3).every((s) => /hour/.test(String((s.refused || [])[0] && s.refused[0].reason))), JSON.stringify({ shape, frames: W.frames.length, r: sent[3].refused }));
  ok('⑪ …the hour reads 3 the moment they are queued (the reservations count like spent turns)', hourOf(guard) === 3, String(hourOf(guard)));
  for (const left of [['c1', 'c2'], ['c2'], []]) { W.deliver.noteTurnEnded(X); W.deliver.noteQueueItems(X, left.map((id) => ({ id })), { fresh: true }); W.deliver.noteTurnStarted(X); }
  await settleTick();
  ok('⑪ the turn ends and the wrapper runs the three: EXACTLY 3 turns, the hour still reads 3 (each carried turn is its own reserved unit)', hourOf(guard) === 3 && W.deliver.queuedEntries(X).length === 0, String(hourOf(guard)));
  const dir2 = fs.mkdtempSync(path.join(ROOT, 'ceil-stop-')); const g2 = realGuard(dir2);
  const W2 = world('antigravity', { dataDir: dir2, guard: g2 });
  const gid2 = (await W2.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  for (let i = 0; i < 3; i++) { await W2.eng.post({ group: gid2, from: A, text: 's' + i, wake: true }); W2.settle('queued'); }
  const before = hourOf(g2);
  W2.deliver.noteQueueItems(X, [], { fresh: true }); for (const f of W2.frames) W2.deliver.noteHandedBack(X, f.text, 'dropped by Stop');
  ok('⑪ Stop instead: 0 billed — the three reservations RETURNED (the hour 3 → 0)', before === 3 && hourOf(g2) === 0, JSON.stringify({ before, after: hourOf(g2) }));
}

console.log('⑫ AFTER A RESTART THE HUB ASKS (round 2, moderate 1) — an idle wrapper is asked for its queue; the answer settles the entry');
{
  const W = world('antigravity', { caps: { peerMessage: true, notificationSteer: false, queueResync: true } });
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const s = await W.eng.post({ group: gid, from: A, text: 'carried while the hub was down', wake: true });
  W.deliver.noteQueueItems(X, [{ id: 'z1' }], { fresh: true }); W.settle('queued'); SW.storeWriter().flushSync();
  const W2 = world('antigravity', { dataDir: W.dir, store: W.store, streaming: false, caps: { peerMessage: true, notificationSteer: false, queueResync: true } });
  const asked = W2.deliver.noteAttached(W2.S);
  ok('⑫ the restarted hub ASKS the wrapper holding its frame for its queue (queue-resync, the verb its sidecar adverts)', asked === true && W2.frames.some((f) => f.type === 'queue-resync'), JSON.stringify(W2.frames));
  W2.deliver.noteQueueItems(X, [], { fresh: true }); await settleTick();   // the wrapper's answer: the item is gone (its turn ran while the hub was down)
  ok('⑫ …its answer settles the entry: carried, read, no second unit — never «waiting» for hours behind an idle wrapper', W2.row(gid, s.message).state === 'handed' && W2.deliver.queuedEntries(X).length === 0 && W2.money.notes.filter((n) => !n.carried).length === 0);
}

console.log('⑬ THE WRAPPER IS GONE (round 2, moderate 2) — the HUB hands its frames back to the next-turn road, once');
{
  const W = world('antigravity');
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const s = await W.eng.post({ group: gid, from: A, text: 'held by a wrapper that dies', wake: true });
  W.deliver.noteQueueItems(X, [{ id: 'g1' }], { fresh: true }); W.settle('queued');
  const stopped = G.deliveryOf(W.eng.get(gid), s.message, { log: [s.message], liveness: () => ({ state: 'stopped' }) })[0];
  ok('⑬ a STOPPED addressee is checked before the queue: «waiting — xray is stopped», never «waiting for its current turn»', stopped.state === 'waiting' && stopped.stopped === true, JSON.stringify(stopped));
  const back = W.deliver.noteProcessGone(X);
  await settleTick();
  const st = W.deliver.stashEntries(X);
  ok('⑬ the wrapper\'s process is gone ⇒ the hub hands the frame back: ONE stash entry with its words, its reservation RETURNED, the row waits for the next turn', back.length === 1 && st.length === 1 && /held by a wrapper that dies/.test(st[0].text) && W.charged() === 0 && W.row(gid, s.message).state === 'waiting');
  ok('⑬ …a second notice of the same death hands nothing back twice', W.deliver.noteProcessGone(X).length === 0 && W.deliver.stashEntries(X).length === 1);
  W.deliver.drainStash(X); await settleTick();
  ok('⑬ …read only when the stash hands its words to a turn', W.row(gid, s.message).state === 'handed' && W.charged() === 0);
  // the panel's d4, as it happens: the conversation is killed and RESUMED by a NEW wrapper process (another pid in its sidecar)
  const Wk = world('antigravity');
  const gk = (await Wk.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const sk = await Wk.eng.post({ group: gk, from: A, text: 'queued, then killed', wake: true });
  Wk.deliver.noteQueueItems(X, [{ id: 'k1' }], { fresh: true }); Wk.settle('queued');   // the OLD process's last queue held it (seen by this hub)
  fs.writeFileSync(path.join(Wk.dir, 'session-buffers', 'w-antigravity.json'), JSON.stringify({ pid: 424242, startedAt: Date.now(), mode: 'chat', backend: 'antigravity', caps: { peerMessage: true, notificationSteer: false } }));
  Wk.deliver.noteTurnStarted(X); Wk.deliver.noteQueueItems(X, [{ id: 'q1-99999' }], { fresh: true }); Wk.deliver.noteTurnEnded(X); Wk.deliver.noteQueueItems(X, [], { fresh: true }); Wk.deliver.noteTurnStarted(X); await settleTick();
  ok('⑬ (the panel\'s d4) a RESUMED conversation (a new wrapper pid): the old process\'s last queue held the frame ⇒ KNOWN not run — handed back by the hub (one plain stash entry), its reservation returned; the new process\'s turns never carry it', Wk.row(gk, sk.message).state === 'waiting' && Wk.deliver.stashEntries(X).length === 1 && !Wk.deliver.stashEntries(X)[0].text.startsWith('(This may repeat') && Wk.charged() === 0, JSON.stringify({ row: Wk.row(gk, sk.message), n: Wk.charged() }));
}

console.log('⑬b THE BOOT ROADS (round 3, MUST 2) — the REAL guard: the hour never drops below the turns that ran; unknown counts as owed');
{
  const { spawnSync } = await import('node:child_process');
  const deadPid = spawnSync(process.execPath, ['-e', '']).pid;   // a process that has exited
  // (a) the wrapper RAN the frame while the hub was down, then exited: no queue seen, no process to ask ⇒ UNKNOWN
  {
    const dir = fs.mkdtempSync(path.join(ROOT, 'boot-a-')); const guard = realGuard(dir);
    const W = world('antigravity', { dataDir: dir, guard, pid: deadPid });
    const g = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
    await W.eng.post({ group: g, from: A, text: 'ran while the hub was down', wake: true }); W.settle('queued'); SW.storeWriter().flushSync();
    const W2 = world('antigravity', { dataDir: dir, store: W.store, guard, pid: deadPid }); W2.S.pty = null;   // restarted: its process is gone
    W2.deliver.sweepQueued(); await settleTick();
    const st = W2.deliver.stashEntries(X);
    ok('⑬b (a) the process ended while the hub was down and nothing tells whether the frame ran ⇒ the unit STAYS (the hour reads 1, never 0), the words ride the next turn ONCE, marked as a possible repeat', hourOf(guard) === 1 && st.length === 1 && st[0].text.startsWith('(This may repeat an earlier message.)'), JSON.stringify({ hour: hourOf(guard), st: st.map((e) => e.text.slice(0, 80)) }));
    W2.deliver.drainStash(X); await settleTick();
    ok('⑬b (a) …read when the stash hands it to a turn; the hour still 1 (that turn is the reserved unit)', hourOf(guard) === 1 && W2.deliver.queuedEntries(X).length === 0);
  }
  // (b) a carry not yet persisted at a kill, then the wrapper's death: the guard's CONVERTED mark says it ran
  {
    const dir = fs.mkdtempSync(path.join(ROOT, 'boot-b-')); const guard = realGuard(dir);
    const W = world('antigravity', { dataDir: dir, guard, pid: deadPid });
    const g = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
    await W.eng.post({ group: g, from: A, text: 'carried, killed, then the wrapper died', wake: true });
    W.deliver.noteQueueItems(X, [{ id: 'b1' }], { fresh: true }); W.settle('queued'); SW.storeWriter().flushSync();
    const stale = fs.readFileSync(path.join(dir, 'msg-queued.json'), 'utf8');
    W.deliver.noteTurnEnded(X); W.deliver.noteQueueItems(X, [], { fresh: true }); W.deliver.noteTurnStarted(X);   // carried (the guard marks it converted, on disk) …
    fs.writeFileSync(path.join(dir, 'msg-queued.json'), stale);   // … killed before the carry's own record landed
    const rid = JSON.parse(stale).entries[0].id;
    ok('⑬b (b) the carry CONVERTED the reservation in the guard (on disk before the carry\'s record) — a return of that id now returns nothing', guard.reservationState(rid) === 'converted' && guard.release({ reservation: rid }) === false && hourOf(guard) === 1);
    const W2 = world('antigravity', { dataDir: dir, store: W.store, guard, pid: deadPid }); W2.S.pty = null;
    W2.deliver.sweepQueued(); await settleTick();
    ok('⑬b (b) …the restarted hub reads the guard\'s word: CARRIED — no second copy of the words, the hour 1', W2.deliver.stashEntries(X).length === 0 && W2.deliver.queuedEntries(X).length === 0 && hourOf(guard) === 1);
  }
  // (c) a LIVE wrapper not yet attached at +60 s (a pipe session joins late; a re-attach backoff nulls the pty)
  {
    const dir = fs.mkdtempSync(path.join(ROOT, 'boot-c-')); const guard = realGuard(dir);
    const W = world('antigravity', { dataDir: dir, guard });   // the holder = a live pid (this process)
    const g = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
    await W.eng.post({ group: g, from: A, text: 'a live wrapper, not attached yet', wake: true }); W.settle('queued'); SW.storeWriter().flushSync();
    const W2 = world('antigravity', { dataDir: dir, store: W.store, guard }); W2.S.pty = null;
    W2.deliver.sweepQueued(); W2.deliver.noteTurnStarted(X); await settleTick();
    ok('⑬b (c) a live wrapper not yet attached keeps its frame and its unit: nothing handed back, nothing stashed, the hour 1 — «not attached yet» is not «gone»', W2.deliver.queuedEntries(X).length === 1 && W2.deliver.queuedEntries(X)[0].state === 'queued' && W2.deliver.stashEntries(X).length === 0 && hourOf(guard) === 1);
  }
  // a death the hub SAW with the frame still in that process's last queue ⇒ KNOWN: returned, delivered once (plain)
  {
    const dir = fs.mkdtempSync(path.join(ROOT, 'boot-d-')); const guard = realGuard(dir);
    const W = world('antigravity', { dataDir: dir, guard });
    const g = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
    await W.eng.post({ group: g, from: A, text: 'a death the hub saw', wake: true }); W.deliver.noteQueueItems(X, [{ id: 'd1' }], { fresh: true }); W.settle('queued');
    W.deliver.noteProcessGone(X); await settleTick();
    ok('⑬b a death the hub SAW, the frame still in the last queue that process published ⇒ known not run: the hour 1 → 0, one plain stash entry', hourOf(guard) === 0 && W.deliver.stashEntries(X).length === 1 && !W.deliver.stashEntries(X)[0].text.startsWith('(This may repeat'));
  }
}

console.log('⑬c THE KILL AND THE ARCHIVE ROADS (round 3, moderate 3) — at the act, never at the next boot');
{
  const wsh = read('src/ws-handler.js'), ge = read('src/server/groups-engine.js'), srv = read('server.js');
  ok('⑬c the ws kill road (it removes the session BEFORE its pty exits) hands the held frames back AT THE ACT; an archive drops them (groups-engine onConversationEnded → noteConversationEnded); server.js hands ws-handler the ladder',
    /getDeliver\(\)\?\.noteProcessGone\?\.\(qc, 'the conversation was terminated'\)/.test(wsh) && wsh.indexOf("noteProcessGone?.(qc, 'the conversation was terminated')") < wsh.indexOf('activeSessions.delete(data.sessionId);') && /deliver\?\.noteConversationEnded\?\.\(cid, why\)/.test(ge) && /getDeliver: \(\) => \{ try \{ return deliver; \} catch \{ return null; \} \},/.test(srv));
  const dir = fs.mkdtempSync(path.join(ROOT, 'arch-')); const guard = realGuard(dir);
  const W = world('antigravity', { dataDir: dir, guard });
  const g = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  await W.eng.post({ group: g, from: A, text: 'in the queue at the archive', wake: true }); W.deliver.noteQueueItems(X, [{ id: 'ar1' }], { fresh: true }); W.settle('queued');
  await W.eng.post({ group: g, from: A, text: 'never seen in a queue', wake: true }); W.settle('queued');
  const before = hourOf(guard);
  const n = W.deliver.noteConversationEnded(X, 'archived'); SW.storeWriter().flushSync();
  const file = JSON.parse(fs.readFileSync(path.join(dir, 'msg-queued.json'), 'utf8'));
  ok('⑬c an ARCHIVE drops its held frames at the act (none left on disk): the one its last queue held is returned (known not run), the one never seen in a queue stays counted (unknown)', n === 2 && file.entries.length === 0 && before === 2 && hourOf(guard) === 1, JSON.stringify({ n, before, after: hourOf(guard), left: file.entries.length }));
}

console.log('⑭ A CRASH BETWEEN A CARRY AND ITS PERSIST (round 2, moderate 3) — one unit, never two (the guard is idempotent by the frame\'s id)');
{
  const dir = fs.mkdtempSync(path.join(ROOT, 'crash-')); const guard = realGuard(dir);
  const W = world('antigravity', { dataDir: dir, guard });
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  await W.eng.post({ group: gid, from: A, text: 'carried, then a kill', wake: true });
  W.deliver.noteQueueItems(X, [{ id: 'k1' }], { fresh: true }); W.settle('queued'); SW.storeWriter().flushSync();
  const fileBefore = fs.readFileSync(path.join(dir, 'msg-queued.json'), 'utf8');
  W.deliver.noteTurnEnded(X); W.deliver.noteQueueItems(X, [], { fresh: true }); W.deliver.noteTurnStarted(X);   // carried …
  fs.writeFileSync(path.join(dir, 'msg-queued.json'), fileBefore);   // … and killed before the carry's persist: the file still holds it
  const W2 = world('antigravity', { dataDir: dir, store: W.store, guard });
  W2.deliver.noteQueueItems(X, [], { fresh: true }); await settleTick();   // the new hub carries it AGAIN
  const rid = JSON.parse(fileBefore).entries[0].id;
  guard.note({ reason: 'peer-message', identity: { key: 'slot-1', name: 'slot one' }, reservation: rid });   // even a second note for that id …
  ok('⑭ the entry carried twice across the kill is still ONE unit — the hour reads 1, the guard holds one stamp for its id', hourOf(guard) === 1, String(hourOf(guard)));
}

console.log('⑮ THE BOUND REFUSES AT THE SEND (round 2, moderate 4) — a money record is never forgotten');
{
  const W = world('antigravity');
  const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
  let refusedAt = null;
  for (let i = 0; i <= QW.PER_CONVERSATION_MAX; i++) {
    const r = await W.deliver.deliverToConversation(X, 'n' + i, { kind: 'peer', spendReason: 'peer-message' });
    if (!r.ok) { refusedAt = { i, r }; break; }
  }
  ok(`⑮ ${QW.PER_CONVERSATION_MAX} frames wait behind one running turn; the next is REFUSED at the send, by name (queued-full), no frame written, nothing dropped`,
    refusedAt && refusedAt.i === QW.PER_CONVERSATION_MAX && refusedAt.r.refused === 'queued-full' && /bound is 50/.test(refusedAt.r.reason) && W.frames.length === QW.PER_CONVERSATION_MAX && W.deliver.queuedEntries(X).length === QW.PER_CONVERSATION_MAX && W.charged() === QW.PER_CONVERSATION_MAX, JSON.stringify(refusedAt && refusedAt.r));
}

console.log('⑯ THE ONE PREDICATE (round 4, MUST 1) — a unit is returned only on evidence NEWER than every turn start the hub has seen');
{
  const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
  /** one frame queued behind a turn with the REAL guard; `after` = what the hub saw after the first listing; `exit` = the exit taken */
  async function road(after, exit) {
    const dir = fs.mkdtempSync(path.join(ROOT, 'pred-')); const guard = realGuard(dir);
    const W = world('antigravity', { dataDir: dir, guard });
    const g = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
    await W.eng.post({ group: g, from: A, text: 'one frame', wake: true });
    W.deliver.noteQueueItems(X, [{ id: 'q1' }], { fresh: after !== 'old-wrapper' }); W.settle('queued');
    if (after === 'U3') { W.deliver.noteTurnEnded(X); W.deliver.noteTurnStarted(X); }   // a turn started after the listing (it may carry q1); no listing since
    if (after === 'U3c') { W.deliver.noteTurnEnded(X); W.deliver.noteTurnStarted(X); W.deliver.noteQueueItems(X, [{ id: 'q1' }]); }   // codex: the CACHED queue re-published at the start (no fresh mark)
    if (after === 'person') { W.deliver.noteTurnEnded(X); W.deliver.noteTurnStarted(X); W.deliver.noteQueueItems(X, [{ id: 'q1' }], { fresh: true }); }   // the PERSON's turn started; the wrapper's listing read after it still holds q1
    const h0 = hourOf(guard);
    if (exit === 'gone') W.deliver.noteProcessGone(X);
    if (exit === 'kill') W.deliver.noteProcessGone(X, 'the conversation was terminated');   // the ws kill road, at the act (U3k)
    if (exit === 'holder') { fs.writeFileSync(path.join(dir, 'session-buffers', 'w-antigravity.json'), JSON.stringify({ pid: 424242, startedAt: Date.now(), mode: 'chat', backend: 'antigravity', caps: { peerMessage: true, notificationSteer: false } })); W.deliver.noteQueueItems(X, [], { fresh: true }); }   // a NEW process states its queue
    if (exit === 'dropped') W.deliver.noteConversationEnded(X, 'archived');
    await settleTick();
    return { h0, hour: hourOf(guard), stash: W.deliver.stashEntries(X).map((e) => (e.text.startsWith(QW.REPEAT_HEAD) ? 'marked' : 'plain')), left: W.deliver.queuedEntries(X).filter((e) => e.state !== 'restashed').length };   // live entries left (a marked one waits restashed for its drain)
  }
  const same = (r, want) => r.h0 === 1 && r.hour === want.hour && JSON.stringify(r.stash) === JSON.stringify(want.stash) && r.left === 0;
  for (const after of ['U3', 'U3c']) {
    for (const exit of ['gone', 'kill', 'holder']) {
      const r = await road(after, exit);
      ok(`⑯ ${after} (${after === 'U3' ? 'a turn start after the listing, nothing listed since' : 'the cached queue re-published at the start'}) → ${exit === 'gone' ? 'the process gone' : exit === 'kill' ? 'Terminate (U3k)' : 'a new holder'}: UNKNOWN — the hour stays 1, the words once, MARKED`, same(r, { hour: 1, stash: ['marked'] }), JSON.stringify(r));
    }
    const d = await road(after, 'dropped');
    ok(`⑯ ${after} → the conversation dropped (archive): the unit STAYS counted (the hour 1)`, same(d, { hour: 1, stash: [] }), JSON.stringify(d));
  }
  const old = await road('old-wrapper', 'gone');
  ok('⑯ an OLD wrapper\'s listing (no fresh mark) is no evidence: its process gone ⇒ unknown — the hour 1, marked', same(old, { hour: 1, stash: ['marked'] }), JSON.stringify(old));
  for (const exit of ['gone', 'holder']) {
    const r = await road('fresh', exit);
    ok(`⑯ a FRESH listing, no turn start since → ${exit === 'gone' ? 'the process gone' : 'a new holder'}: KNOWN not run — returned (the hour 1 → 0), one PLAIN copy`, same(r, { hour: 0, stash: ['plain'] }), JSON.stringify(r));
  }
  const fd = await road('fresh', 'dropped');
  ok('⑯ a FRESH listing, no turn start since → dropped: returned (the hour 0)', same(fd, { hour: 0, stash: [] }), JSON.stringify(fd));
  // what a frame queued behind a turn the PERSON started gets
  for (const exit of ['gone', 'holder', 'dropped']) {
    const r = await road('person', exit);
    ok(`⑯ a frame still queued behind a turn the PERSON started, the wrapper's listing read AFTER that start still holding it → ${exit}: known not run — returned (the hour 0)${exit === 'dropped' ? '' : ', one plain copy'}`, same(r, { hour: 0, stash: exit === 'dropped' ? [] : ['plain'] }), JSON.stringify(r));
  }
  const ps = await road('U3', 'gone');
  ok('⑯ …and with no listing read after the person\'s start (the U3 shape): kept and marked, never returned', same(ps, { hour: 1, stash: ['marked'] }), JSON.stringify(ps));
  // ONE predicate: every exit that returns a unit reads knownNotRun — no exit carries its own copy of the test
  const qsrc = read('src/server/queued-wakes.js');
  const exits = ['function noteHolder(', 'function dropConversation(', 'function handBackGone('].map((h) => { const i = qsrc.indexOf(h); const j = qsrc.indexOf('\n  }\n', i); return qsrc.slice(i, j); });
  ok('⑯ ONE predicate: the three exits (a new holder, the conversation dropped, the process gone) each read knownNotRun(e); none tests the mirror itself', exits.every((b) => /knownNotRun\(e\)/.test(b) && !/m\.ids\.has/.test(b)) && (qsrc.match(/m\.idsFresh === true && m\.idsSeq > m\.startSeq/g) || []).length === 1, JSON.stringify(exits.map((b) => b.slice(0, 60))));
  const cw = read('data/bin/codex-chat-wrapper.js'), aw = read('data/bin/agy-wrapper.js');
  ok('⑯ the fresh mark: codex marks only a complete thread/queue/list read (never the cached re-publish at the turn start); agy marks its own queue as it is; the consumers pass it',
    /publishQueue\(items, \{ fresh: listed\.complete === true \}\)/.test(cw) && (cw.match(/publishQueue\([^)]*fresh:/g) || []).length === 1 && /emitTaskEvent\('queue_changed', \{ items, turn_id: meta\.activeTurnId \|\| null, verbs: QUEUE_VERBS_SERVED, \.\.\.\(fresh \? \{ fresh: true \} : \{\}\) \}\)/.test(cw) && (cw.match(/fresh: true/g) || []).length === 1 && /record\('queue_changed', \{ items, turn_id: meta\.activePromptId \|\| null, verbs: QUEUE_VERBS, fresh: true \}\)/.test(aw)
    && /noteQueueItems\?\.\(session\.backendSessionId, msg\.items, \{ fresh: msg\.fresh === true \}\)/.test(read('src/server/stdout/acp-events.js')) && /noteQueueItems\?\.\(qc, payload\.items, \{ fresh: payload\.fresh === true \}\)/.test(read('src/server/stdout/codex-events.js')));
  // the codex record census knows the new field: an undeclared one becomes an «unknown_fields» card IN THE TRANSCRIPT (the
  // round-4 heavy claim caught it — test-codex-p2-wrapper «no queue message ever enters the transcript»)
  {
    const CMM = require(path.join(REPO, 'src/codex-message-manager.js')); const Mgr = CMM.CodexMessageManager || CMM;
    const m = new Mgr('qw-fresh');
    m.processLive({ timestamp: new Date().toISOString(), type: 'event_msg', payload: { type: 'queue_changed', items: [], turn_id: 't1', verbs: ['remove'], fresh: true } });
    ok('⑯ a codex queue_changed carrying `fresh: true` is session state only — no «unknown_fields» card enters the transcript (src/record-shape.js declares the field)', m.messages.length === 0 && m.queueState().length === 0, JSON.stringify(m.messages.map((x) => x.content)));
  }
}

console.log('⑰ THE GUARD BEFORE A MARKED COPY (round 4, small) — a frame the guard knows RAN gets no second copy when its process ends with the hub up');
{
  const dir = fs.mkdtempSync(path.join(ROOT, 'conv-up-')); const guard = realGuard(dir);
  const W = world('antigravity', { dataDir: dir, guard });
  const g = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  await W.eng.post({ group: g, from: A, text: 'carried, its record lost', wake: true });
  W.deliver.noteQueueItems(X, [{ id: 'u1' }], { fresh: true }); W.settle('queued'); SW.storeWriter().flushSync();
  const stale = fs.readFileSync(path.join(dir, 'msg-queued.json'), 'utf8');
  W.deliver.noteTurnEnded(X); W.deliver.noteQueueItems(X, [], { fresh: true }); W.deliver.noteTurnStarted(X);   // carried: converted in the guard
  fs.writeFileSync(path.join(dir, 'msg-queued.json'), stale);   // the carry's own record never landed
  const W2 = world('antigravity', { dataDir: dir, store: W.store, guard }); W2.S.pty = null;   // the wrapper alive (this pid): kept at boot
  W2.deliver.sweepQueued(); await settleTick();
  const kept = W2.deliver.queuedEntries(X).length;
  W2.deliver.noteProcessGone(X); await settleTick();   // then it dies with the hub up (U10)
  ok('⑰ (U10) converted, kept at boot, then its process ends with the hub up: the guard\'s word decides — carried, NO stash copy, the hour 1', kept === 1 && W2.deliver.stashEntries(X).length === 0 && W2.deliver.queuedEntries(X).length === 0 && hourOf(guard) === 1, JSON.stringify({ kept, stash: W2.deliver.stashEntries(X).length, hour: hourOf(guard) }));
  const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
  ok('⑰ the repeat mark is short and true on every road: «(This may repeat an earlier message.)» — no «while VibeSpace was restarting»', QW.REPEAT_HEAD === '(This may repeat an earlier message.)\n' && QW.REPEAT_HEAD.length < 40);
}

console.log('⑱ A DRAIN NEVER STAMPS; A LIVE CARRY ALWAYS COUNTS (round 4, moderate 4) — the REAL guard');
{
  const { spawnSync } = await import('node:child_process');
  const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
  const REAL_NOW = Date.now; let skew = 0;
  Date.now = () => REAL_NOW() + skew;
  try {
    // U12: a kept (unknown) reservation whose marked repeat drains 25 h later — its stamp aged out; the drain rides the person's turn
    const dir = fs.mkdtempSync(path.join(ROOT, 'u12-')); const guard = realGuard(dir);
    const W = world('antigravity', { dataDir: dir, guard, pid: deadPid });
    const g = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
    await W.eng.post({ group: g, from: A, text: 'kept, drained a day later', wake: true }); W.settle('queued'); SW.storeWriter().flushSync();
    const W2 = world('antigravity', { dataDir: dir, store: W.store, guard, pid: deadPid }); W2.S.pty = null;
    W2.deliver.sweepQueued(); await settleTick();
    const atSweep = hourOf(guard);
    skew = 25 * 3600e3;
    guard.authorize({ reason: 'auto-resume', identity: { key: 'slot-1', name: 'slot one' }, hold: false });   // any read prunes: the stamp is gone
    const notesBefore = W2.money.notes.length;
    W2.deliver.drainStash(X); await settleTick();
    const stamps = ((guard.snapshot().budget.identities || {})['slot-1'] || []).length;
    ok('⑱ (U12) a marked repeat whose reservation aged out drains 25 h later on somebody else\'s turn: 0 stamps added (the drain converts a stamp still there, never adds one)', atSweep === 1 && stamps === 0 && W2.money.notes.length === notesBefore + 1 && W2.money.notes[notesBefore].carried === true, JSON.stringify({ atSweep, stamps, notes: W2.money.notes.slice(notesBefore) }));
    skew = 0;
    // M7f: a LIVE carry whose stamp is gone (the guard file lost) — the unattended turn that runs it is counted once, now
    const dir3 = fs.mkdtempSync(path.join(ROOT, 'm7f-')); const g3 = realGuard(dir3);
    const W3 = world('antigravity', { dataDir: dir3, guard: g3 });
    const gg = (await W3.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
    await W3.eng.post({ group: gg, from: A, text: 'queued, the guard file lost', wake: true }); W3.deliver.noteQueueItems(X, [{ id: 'f1' }], { fresh: true }); W3.settle('queued');
    SW.storeWriter().flushSync();
    fs.rmSync(path.join(dir3, 'spend-budget.json'), { force: true });
    const g4 = realGuard(dir3);   // a fresh guard: no stamp for the frame
    const W4 = world('antigravity', { dataDir: dir3, store: W3.store, guard: g4 });
    W4.deliver.noteQueueItems(X, [{ id: 'f1' }], { fresh: true });
    const before = hourOf(g4);
    W4.deliver.noteTurnEnded(X); W4.deliver.noteQueueItems(X, [], { fresh: true }); W4.deliver.noteTurnStarted(X); await settleTick();   // a LIVE carry
    const st = (g4.snapshot().budget.identities['slot-1'] || []);
    ok('⑱ (M7f) a LIVE carry of a frame whose stamp is gone adds exactly 1 (stamped converted, counted in the window it runs in); a second note of that id adds nothing', before === 0 && st.length === 1 && st[0].conv === true && (g4.note({ reason: 'peer-message', identity: { key: 'slot-1', name: 'slot one' }, reservation: st[0].rid, carried: true }), hourOf(g4) === 1), JSON.stringify({ before, st }));
  } finally { Date.now = REAL_NOW; }
  // A2: the reservation was never recorded (the guard threw at the send) — the live carry still counts the turn, once
  {
    const dirA = fs.mkdtempSync(path.join(ROOT, 'a2-')); const gA = realGuard(dirA);
    const QWm = require(path.join(REPO, 'src/server/queued-wakes.js'));
    let first = true; const calls = [];
    const Q = QWm.create({ dataDir: dirA, writer: { dirty() { } }, noteSpend: (r) => { calls.push(r); if (first) { first = false; throw new Error('the guard file is unwritable'); } return gA.note(r); } });
    const e = Q.noteWritten(X, { charged: { reason: 'peer-message', identity: { key: 'slot-1', name: 'slot one' } }, text: 'never reserved' });
    Q.answer(e.id, { ok: true, mode: 'queued' }); Q.noteQueue(X, [{ id: 'a2' }], undefined, { fresh: true });
    Q.noteTurnEnded(X); Q.noteQueue(X, [], undefined, { fresh: true }); Q.noteTurnStarted(X);
    ok('⑱ (A2) a frame whose reservation was never recorded (the guard threw at the send) is counted ONCE by its live carry — the hour 0 → 1, converted', e.reserved === false && calls.length === 2 && calls[1].carried === true && calls[1].drain === false && hourOf(gA) === 1, JSON.stringify({ calls: calls.map((c) => ({ carried: !!c.carried, drain: !!c.drain })), hour: hourOf(gA) }));
  }
}

console.log('⑲ AN ENTRY THAT LEAVES IS SAID IN ITS ROW (round 4, moderate 5) — evicted, aged out: «not delivered — send it again»');
{
  // the panel's (evict): 40 queued, Stop hands all back, the stash keeps 30 — 30 handed, 10 «not delivered»
  const dir = fs.mkdtempSync(path.join(ROOT, 'evict-')); const guard = GUARD.create({ dataDir: dir, serverSetting: (k) => ({ 'spend.unattendedPerIdentityHour': 200 })[k], identityOf: () => ({ key: 'slot-1', name: 'slot one' }), getUserTodos: () => null, log: () => { } });
  const W = world('antigravity', { dataDir: dir, guard });
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const sent = [];
  for (let i = 0; i < 40; i++) { sent.push(await W.eng.post({ group: gid, from: A, text: 'busy ' + i, wake: true })); W.deliver.noteQueueItems(X, Array.from({ length: i + 1 }, (_, k) => ({ id: 'e' + k })), { fresh: true }); W.settle('queued'); }
  W.deliver.noteQueueItems(X, [], { fresh: true });
  for (const f of W.frames) W.deliver.noteHandedBack(X, f.text, 'dropped by Stop');
  W.deliver.noteTurnEnded(X); await settleTick();
  W.deliver.noteTurnStarted(X); W.deliver.drainStash(X); await settleTick(); await settleTick();
  const rows = {}; for (const s of sent) { const r = W.row(gid, s.message); const k = r.state + (r.why ? ':' + r.why : ''); rows[k] = (rows[k] || 0) + 1; }
  ok('⑲ (evict) 40 queued, all handed back by Stop, the stash keeps 30: 30 rows «handed», 10 rows «not delivered» (why: dropped) — never «waiting» for good; the hour 0', rows.handed === 30 && rows['undeliverable:dropped'] === 10 && hourOf(guard) === 0 && W.deliver.queuedEntries(X).length === 0, JSON.stringify(rows));
  const CW = await import(path.join(REPO, 'src/lib/channel-words.js'));
  const dropRow = { ...G.deliveryOf(W.eng.get(gid), sent[0].message, { log: [sent[0].message] }).find((x) => x.member === X), name: 'xray' };
  const said = CW.deliveryRowText(dropRow, { t: (k, p) => k.replace(/\{(\w+)\}/g, (_, n) => String(p[n])) });
  const cli = read('data/bin/vibespace-msg');
  ok('⑲ …what the sender reads says so: «not delivered — the copy for xray was dropped before a turn read it; send it again» (vibespace-msg and the window\'s words)', /x\.why === 'dropped' \? `not delivered — the copy for \$\{x\.name\} was dropped before a turn read it; send it again`/.test(cli) && /Not delivered — the copy for \{name\} was dropped before a turn read it; send it again/.test(read('src/lib/channel-words.js')) && said === 'Not delivered — the copy for xray was dropped before a turn read it; send it again', String(said));
  // U14: 32 handed back, the stash keeps 30 — 2 «not delivered»
  const W5 = world('antigravity');
  const g5 = (await W5.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const s5 = [];
  for (let i = 0; i < 32; i++) { s5.push(await W5.eng.post({ group: g5, from: A, text: 'busy ' + i, wake: true })); W5.deliver.noteQueueItems(X, Array.from({ length: i + 1 }, (_, k) => ({ id: 'e' + k })), { fresh: true }); W5.settle('queued'); }
  W5.deliver.noteQueueItems(X, [], { fresh: true });
  for (const f of W5.frames) W5.deliver.noteHandedBack(X, f.text, 'dropped by Stop');
  W5.deliver.noteTurnEnded(X); W5.deliver.noteTurnStarted(X); W5.deliver.drainStash(X); await settleTick(); await settleTick();
  const r5 = {}; for (const s of s5) { const r = W5.row(g5, s.message); const k = r.state + (r.why ? ':' + r.why : ''); r5[k] = (r5[k] || 0) + 1; }
  ok('⑲ (U14) 32 handed back, the stash keeps 30: 30 «handed», the oldest 2 «not delivered»', r5.handed === 30 && r5['undeliverable:dropped'] === 2 && W5.row(g5, s5[0].message).state === 'undeliverable' && W5.row(g5, s5[1].message).state === 'undeliverable', JSON.stringify(r5));
  // aged out at load (a restashed entry, a live one) and in a running hub
  const W6 = world('antigravity');
  const g6 = (await W6.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const a6 = await W6.eng.post({ group: g6, from: A, text: 'handed back, never drained', wake: true }); W6.deliver.noteQueueItems(X, [{ id: 'a1' }], { fresh: true }); W6.settle('queued');
  const b6 = await W6.eng.post({ group: g6, from: A, text: 'kept, its wrapper never back', wake: true }); W6.settle('queued');
  W6.deliver.noteQueueItems(X, [{ id: 'a1' }, { id: 'b1' }], { fresh: true });
  W6.deliver.noteHandedBack(X, W6.frames[0].text, 'dropped by Stop'); await settleTick(); SW.storeWriter().flushSync();
  const f6 = path.join(W6.dir, 'msg-queued.json'); const j6 = JSON.parse(fs.readFileSync(f6, 'utf8'));
  for (const e of j6.entries) { e.at -= 8 * 24 * 3600e3; if (e.backAt) e.backAt -= 8 * 24 * 3600e3; }
  fs.writeFileSync(f6, JSON.stringify(j6));
  const stashFile = fs.readFileSync(path.join(W6.dir, 'msg-stash.json'), 'utf8');
  const W7 = world('antigravity', { dataDir: W6.dir, store: W6.store }); await settleTick(); await settleTick();
  const ra = W7.row(g6, a6.message), rb = W7.row(g6, b6.message);
  ok('⑲ aged out AT LOAD (8 days): the LIVE entry leaves, its row «not delivered» (why: dropped); the handed-back one whose words still wait in the stash STAYS — «waiting for the next turn» is true (it leaves at their drain or eviction)', j6.entries.map((e) => e.state).sort().join() === 'queued,restashed' && W7.deliver.queuedEntries(X).map((e) => e.state).join() === 'restashed' && ra.state === 'waiting' && rb.state === 'undeliverable' && rb.why === 'dropped', JSON.stringify({ states: j6.entries.map((e) => e.state), ra, rb }));
  const d8 = fs.mkdtempSync(path.join(ROOT, 'age-gone-'));
  fs.mkdirSync(path.join(d8, 'session-buffers'), { recursive: true });
  fs.writeFileSync(path.join(d8, 'msg-queued.json'), JSON.stringify(j6));
  const st8 = JSON.parse(stashFile); for (const k of Object.keys(st8)) st8[k] = st8[k].filter((e) => !String(e && e.ref || '').startsWith('queued-wake:'));
  fs.writeFileSync(path.join(d8, 'msg-stash.json'), JSON.stringify(st8));   // the words are gone (the stash file lost them)
  const W8 = world('antigravity', { dataDir: d8, store: W6.store }); await settleTick(); await settleTick();
  const ra8 = W8.row(g6, a6.message);
  ok('⑲ …and once its words are GONE from the stash, the handed-back entry ages out at load too: its row «not delivered» (why: dropped)', W8.deliver.queuedEntries(X).length === 0 && ra8.state === 'undeliverable' && ra8.why === 'dropped', JSON.stringify({ ra8 }));
  const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
  let t = 1000; const said8 = [];
  const Q = QW.create({ dataDir: fs.mkdtempSync(path.join(ROOT, 'age-run-')), now: () => t, writer: { dirty: () => { } } });
  Q.onDropped((cid, e, x) => said8.push(x.why));
  Q.noteWritten(X, { text: 'kept for ever?' });
  t += QW.LIVE_MAX_AGE_MS + 1;
  ok('⑲ in a RUNNING hub (U13: kept at boot, its wrapper never back): the entry leaves by age at the next read, send or turn start — said («aged out»); the ladder checks hourly', Q.entriesFor(X).length === 0 && said8.join() === 'aged out' && /const ageTick = \(\) => \{ try \{ queued\.ageOut\(\); \}/.test(read('src/server/conversation-deliver.js')), JSON.stringify(said8));
}

console.log('⑳ THE FOUR STATES A BOOT CAN FIND (round 4, moderate 3) — the entry with / without its carry record × the stamp with / without its converted mark; none returns a unit that may have run');
{
  const { spawnSync } = await import('node:child_process');
  const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
  const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
  // one frame queued (the files BEFORE its carry), then carried (the files AFTER) — the holder's process then gone
  const dir = fs.mkdtempSync(path.join(ROOT, 'four-')); const guard = realGuard(dir);
  const W = world('antigravity', { dataDir: dir, guard, pid: deadPid });
  await W.deliver.deliverToConversation(X, 'the frame of the four states', { kind: 'peer', spendReason: 'peer-message' });
  W.deliver.noteQueueItems(X, [{ id: 'f4' }], { fresh: true }); W.settle('queued'); SW.storeWriter().flushSync(); guard.flush();
  const entryHeld = fs.readFileSync(path.join(dir, 'msg-queued.json'), 'utf8'), stampReserved = fs.readFileSync(path.join(dir, 'spend-budget.json'), 'utf8');
  W.deliver.noteTurnEnded(X); W.deliver.noteQueueItems(X, [], { fresh: true }); W.deliver.noteTurnStarted(X); SW.storeWriter().flushSync(); guard.flush();
  const entryCarried = fs.readFileSync(path.join(dir, 'msg-queued.json'), 'utf8'), stampConverted = fs.readFileSync(path.join(dir, 'spend-budget.json'), 'utf8');
  const emptyBudget = JSON.stringify({ v: 1, budget: { v: 1, identities: {}, instance: [], notices: {}, attended: [] } });
  async function boot(entryFile, budgetFile) {
    const d = fs.mkdtempSync(path.join(ROOT, 'four-b-'));
    fs.writeFileSync(path.join(d, 'msg-queued.json'), entryFile); fs.writeFileSync(path.join(d, 'spend-budget.json'), budgetFile);
    const g = realGuard(d); const B = world('antigravity', { dataDir: d, guard: g, pid: deadPid }); B.S.pty = null;
    B.deliver.sweepQueued(); await settleTick();
    const st = B.deliver.stashEntries(X).map((e) => (e.text.startsWith(QW.REPEAT_HEAD) ? 'marked' : 'plain'));
    const r = { hour: hourOf(g), stash: st, held: B.deliver.queuedEntries(X).length };
    B.deliver.drainStash(X); await settleTick();
    r.hourAfterDrain = hourOf(g);
    return r;
  }
  const rows = {
    'entry held, stamp reserved': await boot(entryHeld, stampReserved),
    'entry held, stamp converted': await boot(entryHeld, stampConverted),
    'entry carried, stamp reserved': await boot(entryCarried, stampReserved),
    'entry carried, stamp converted': await boot(entryCarried, stampConverted),
    'entry held, stamp lost (the kill window)': await boot(entryHeld, emptyBudget),
  };
  const R = (k) => rows[k];
  ok('⑳ entry HELD × stamp RESERVED (killed before the carry, or the carry\'s records both lost): unknown — the unit STAYS (hour 1), the words once, MARKED; the drain adds nothing', R('entry held, stamp reserved').hour === 1 && JSON.stringify(R('entry held, stamp reserved').stash) === '["marked"]' && R('entry held, stamp reserved').hourAfterDrain === 1, JSON.stringify(R('entry held, stamp reserved')));
  ok('⑳ entry HELD × stamp CONVERTED (the guard\'s write landed, the carry record did not): carried — no copy, the unit kept (hour 1)', R('entry held, stamp converted').hour === 1 && R('entry held, stamp converted').stash.length === 0 && R('entry held, stamp converted').held === 0, JSON.stringify(R('entry held, stamp converted')));
  ok('⑳ entry CARRIED × stamp RESERVED (the carry record landed, the conversion did not): nothing held — the stamp stays counted as promised until it ages out (hour 1), never returned', R('entry carried, stamp reserved').hour === 1 && R('entry carried, stamp reserved').stash.length === 0 && R('entry carried, stamp reserved').held === 0, JSON.stringify(R('entry carried, stamp reserved')));
  ok('⑳ entry CARRIED × stamp CONVERTED: done — one unit (hour 1)', R('entry carried, stamp converted').hour === 1 && R('entry carried, stamp converted').stash.length === 0 && R('entry carried, stamp converted').held === 0, JSON.stringify(R('entry carried, stamp converted')));
  ok('⑳ (named) the stamp LOST — a kill inside the guard\'s 500 ms debounce, the loss the release has for every spend: the words once, marked; the drain adds nothing (hour 0) — bounded by the spends of that one window', R('entry held, stamp lost (the kill window)').hour === 0 && JSON.stringify(R('entry held, stamp lost (the kill window)').stash) === '["marked"]' && R('entry held, stamp lost (the kill window)').hourAfterDrain === 0, JSON.stringify(R('entry held, stamp lost (the kill window)')));
}

console.log('㉑ AN ENTRY BINDS ITS OWN FRAME (follow-up 2026-11-13: a person\'s line or another peer\'s frame listed first is not it)');
{
  const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
  const S = JSON.stringify;
  const mk = () => { const dir = fs.mkdtempSync(path.join(ROOT, 'qw-bind-')); const spend = []; const q = QW.create({ dataDir: dir, writer: { dirty() { } }, noteSpend: (r) => spend.push(['note', r.carried ? 'carried' : 'reserve']), releaseSpend: () => spend.push(['release']), log: () => { } }); const ev = []; q.onCarried((cid, e, x) => ev.push(['carried', e.id, x.how])); q.onHandedBack((cid, e, x) => ev.push(['back', e.id])); return { q, ev, spend }; };   // the public entry carries its id, never its words
  const CID = 'conv-bind', PID = '4242';
  const start = () => { const w = mk(); w.q.noteTurnStarted(CID); w.q.noteQueue(CID, [], PID, { fresh: true }); return w; };
  const state = (w) => w.q.entriesFor(CID).map((e) => e.state);
  // A — the person's line queued in the same round trip (codex / agy state its kind): the peer frame binds the PEER item
  { const w = start(); const e = w.q.noteWritten(CID, { charged: { reason: 'peer-message' }, text: 'P', fromName: 'alpha', holder: PID });
    w.q.noteQueue(CID, [{ id: 'p', kind: 'peer', from: 'alpha' }, { id: 'h', kind: 'user' }], PID, { fresh: true }); w.q.answer(e.id, { mode: 'queued' });
    w.q.noteTurnEnded(CID); w.q.noteQueue(CID, [{ id: 'p', kind: 'peer', from: 'alpha' }], PID, { fresh: true }); w.q.noteTurnStarted(CID);   // the person's ⚡: h ran, p still queued
    ok('㉑ A: the person\'s line h listed beside the peer frame p, h run first (⚡): the entry is STILL QUEUED — never «read» while its frame waits', S(state(w)) === S(['queued']) && !w.ev.some((x) => x[0] === 'carried'), JSON.stringify({ st: state(w), ev: w.ev })); }
  // B — no kind stated (an older listing), FIFO: p written first, h after; p runs, h still queued, then a kill
  { const w = start(); const e = w.q.noteWritten(CID, { charged: { reason: 'peer-message' }, text: 'P', holder: PID });
    w.q.noteQueue(CID, [{ id: 'p' }, { id: 'h' }], PID, { fresh: true }); w.q.answer(e.id, { mode: 'queued' });
    w.q.noteTurnEnded(CID); w.q.noteTurnStarted(CID); w.q.noteQueue(CID, [{ id: 'h' }], PID, { fresh: true });
    const stash = []; w.q.handBackGone(CID, (pe, x) => stash.push(x.text), 'the conversation was terminated');
    ok('㉑ B: no kind in the listing — the EARLIEST unseen item is the frame (queue order = write order): p ran ⇒ carried; the kill hands NOTHING back (never sent twice)', w.ev.some((x) => x[0] === 'carried' && x[1] === e.id) && stash.length === 0, JSON.stringify({ ev: w.ev, stash })); }
  // C — two frames of ONE sender in one round trip: FIFO, p1 runs; then a kill
  { const w = start(); const e1 = w.q.noteWritten(CID, { charged: { reason: 'peer-message' }, text: 'P1', fromName: 'alpha', holder: PID }); const e2 = w.q.noteWritten(CID, { charged: { reason: 'peer-message' }, text: 'P2', fromName: 'alpha', holder: PID });
    w.q.answer(e1.id, { mode: 'queued' }); w.q.answer(e2.id, { mode: 'queued' });
    w.q.noteQueue(CID, [{ id: 'p1', kind: 'peer', from: 'alpha' }, { id: 'p2', kind: 'peer', from: 'alpha' }], PID, { fresh: true });
    w.q.noteTurnEnded(CID); w.q.noteTurnStarted(CID); w.q.noteQueue(CID, [{ id: 'p2', kind: 'peer', from: 'alpha' }], PID, { fresh: true });
    const carried = w.ev.filter((x) => x[0] === 'carried').map((x) => x[1]);
    const stash = []; w.q.handBackGone(CID, (pe, x) => stash.push(x.text), 'the conversation was terminated');
    ok('㉑ C: two frames of one sender — p1 ran ⇒ P1 carried (read), P2 still waits; the kill hands back P2 ONLY (P1 never re-sent, P2 never lost while marked read)', S(carried) === S([e1.id]) && S(stash) === S(['P2']), JSON.stringify({ carried, stash })); }
  // D — two SENDERS: beta's frame listed before alpha's — each entry binds its own sender's item
  { const w = start(); const ea = w.q.noteWritten(CID, { charged: { reason: 'peer-message' }, text: 'A1', fromName: 'alpha', holder: PID }); const eb = w.q.noteWritten(CID, { charged: { reason: 'peer-message' }, text: 'B1', fromName: 'beta', holder: PID });
    w.q.answer(ea.id, { mode: 'queued' }); w.q.answer(eb.id, { mode: 'queued' });
    w.q.noteQueue(CID, [{ id: 'qb', kind: 'peer', from: 'beta' }, { id: 'qa', kind: 'peer', from: 'alpha' }], PID, { fresh: true });
    w.q.noteTurnEnded(CID); w.q.noteTurnStarted(CID); w.q.noteQueue(CID, [{ id: 'qa', kind: 'peer', from: 'alpha' }], PID, { fresh: true });   // beta's ran first
    const carried = w.ev.filter((x) => x[0] === 'carried').map((x) => x[1]);
    ok('㉑ D: two senders, beta\'s frame listed (and run) first — B1 is carried, A1 still waits: each entry is bound by its sender, never by «newest»', S(carried) === S([eb.id]) && S(w.q.entriesFor(CID).map((x) => [x.id, x.state])) === S([[ea.id, 'queued']]), JSON.stringify({ carried, st: state(w) })); }
  // E — THE SCENE THE KIND DECIDES (the readers' person-first scene, 2026-11-13): the person's line reaches the wrapper
  //     just BEFORE the hub's peer frame, in one chunk — both unseen at the frame's write, the person's listed FIRST (agy
  //     lists a person's line with no `from`); the person's ⚡ runs it, the frame still waits. «Earliest» alone would bind
  //     the person's line; only the listing's kind keeps it off.
  { const w = start(); const e = w.q.noteWritten(CID, { charged: { reason: 'peer-message' }, text: 'P', fromName: 'alpha', holder: PID });
    w.q.noteQueue(CID, [{ id: 'h', kind: 'user', from: null }, { id: 'p', kind: 'peer', from: 'alpha' }], PID, { fresh: true }); w.q.answer(e.id, { mode: 'queued' });
    w.q.noteTurnEnded(CID); w.q.noteTurnStarted(CID); w.q.noteQueue(CID, [{ id: 'p', kind: 'peer', from: 'alpha' }], PID, { fresh: true });   // h ran (⚡), p waits
    const stash = []; w.q.handBackGone(CID, (pe, x) => stash.push(x.text), 'the conversation was terminated');
    ok('㉑ E: the person\'s line h listed BEFORE the peer frame p (both unseen at the write), h run first (⚡): the entry is NOT carried while p waits, and the kill hands P back (its unit returned, never lost while marked read)', !w.ev.some((x) => x[0] === 'carried') && S(stash) === S(['P']), JSON.stringify({ ev: w.ev, stash })); }
  // E′ — the same with a wrapper's own nudge / retry (kind 'system', agy and acp list it) listed first: not a peer frame either
  { const w = start(); const e = w.q.noteWritten(CID, { charged: { reason: 'peer-message' }, text: 'P', fromName: 'alpha', holder: PID });
    w.q.noteQueue(CID, [{ id: 's', kind: 'system', from: null }, { id: 'p', kind: 'peer', from: 'alpha' }], PID, { fresh: true }); w.q.answer(e.id, { mode: 'queued' });
    w.q.noteTurnEnded(CID); w.q.noteTurnStarted(CID); w.q.noteQueue(CID, [{ id: 'p', kind: 'peer', from: 'alpha' }], PID, { fresh: true });   // the nudge ran, p waits
    ok('㉑ E′: a wrapper nudge s (kind \'system\') listed BEFORE the peer frame p, s run first: the entry is NOT carried while p waits', !w.ev.some((x) => x[0] === 'carried') && S(state(w)) === S(['queued']), JSON.stringify({ ev: w.ev, st: state(w) })); }
  ok('㉑ the module binds by what the listing says an item IS, and takes the earliest (never `fresh[fresh.length - 1]`)', /e\.bind = \[fresh\[0\]\];/.test(read('src/server/queued-wakes.js')) && !/fresh\[fresh\.length - 1\]/.test(read('src/server/queued-wakes.js')) && /it\.kind && it\.kind !== 'peer'/.test(read('src/server/queued-wakes.js')));
}

console.log('㉒ AN UNREAD msg-queued.json IS NEVER WRITTEN OVER (B-e3fe) — what it holds is the record until it reads again or is removed');
// THE ROW: the file was there and could not be read (torn, an I/O error, another shape) ⇒ the reconcile held off, but the
// first persist() wrote this process's { v:2, entries } over it — the frames it held (their words, their reservations) gone
const T22 = Date.parse('2026-11-19T03:00:00Z');
const TORN_QW = '{ "v": 2, "entries": [{ "id": "old-1", "cid": "conv-u", "state": "queued"';   // torn mid-write: unparsable
const OLD_QW = JSON.stringify({ v: 2, entries: [{ id: 'old-1', cid: 'conv-u', state: 'queued', at: T22 - 60e3, kind: 'peer', text: 'the old frame', digest: 'd-old', bind: ['q-old'], reserved: true, holder: '4141' }] });
// one hub's queued-wakes over a file it reads through `disk.now` (text; null = removed; 'EIO' = a read error); every write recorded
const mkUnread = (mod, onDisk) => {
  let clock = T22;
  const w = { disk: { now: onDisk }, writes: [], reads: 0, logs: [], adv: (ms) => { clock += ms; } };
  w.q = mod.create({ dataDir: fs.mkdtempSync(path.join(ROOT, 'qw-unread-')), now: () => clock, writer: { dirty: (file, o) => w.writes.push(o.produce()) },
    readFile: () => { w.reads++; if (w.disk.now === null) throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }); if (w.disk.now === 'EIO') throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return w.disk.now; },
    noteSpend: () => { }, releaseSpend: () => { }, log: (...a) => w.logs.push(a.join(' ')) });
  return w;
};
const unreadFrame = (w, text) => { const e = w.q.noteWritten('conv-u', { charged: { reason: 'peer-message' }, text, holder: '4242' }); w.q.answer(e.id, { mode: 'queued' }); return e; };
const lastWrite = (w) => (w.writes.length ? JSON.parse(w.writes[w.writes.length - 1]) : null);
{
  const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
  const S = JSON.stringify;
  // A — torn at boot: a frame is written and answered (two persists) — nothing is written; said once
  const a = mkUnread(QW, TORN_QW); const a1 = unreadFrame(a, 'new words 1'); unreadFrame(a, 'new words 2');
  ok('㉒ A: msg-queued.json torn at boot, two frames written and answered (four persists) — NOTHING is written over it, and the journal says so once',
    a.writes.length === 0 && a.logs.filter((l) => l.includes('is not written while it cannot be read')).length === 1 && a.q.entriesFor('conv-u').length === 2, S({ writes: a.writes.length, logs: a.logs }));
  // B — the re-read is bounded: inside UNREAD_RECHECK_MS no read; after it, still torn ⇒ still no write
  const readsAtBoot = a.reads; a.adv(30e3); unreadFrame(a, 'new words 3'); const readsIn = a.reads;
  a.adv(QW.UNREAD_RECHECK_MS); unreadFrame(a, 'new words 4');
  ok('㉒ B: the file is read again at most once a UNREAD_RECHECK_MS (60 s): none 30 s after the failure, one after 90 s — still torn, still not written',
    QW.UNREAD_RECHECK_MS === 60e3 && readsAtBoot === 1 && readsIn === 1 && a.reads === 2 && a.writes.length === 0, S({ readsAtBoot, readsIn, reads: a.reads, writes: a.writes.length }));
  // B′ — a clock that steps back never lengthens the wait: the next write reads the file again at once
  { const b = mkUnread(QW, TORN_QW); b.adv(-3600e3); unreadFrame(b, 'back');
    ok('㉒ B′: the clock steps back an hour after the failure — the next write reads the file again at once (still torn: still not written), never an hour more of waiting',
      b.reads === 2 && b.writes.length === 0, S({ reads: b.reads, writes: b.writes.length })); }
  // C — repaired: it reads again ⇒ what it holds joins this process's entries, and the writes resume with BOTH
  a.disk.now = OLD_QW; a.adv(QW.UNREAD_RECHECK_MS); unreadFrame(a, 'new words 5');
  const c = lastWrite(a), cIds = c ? c.entries.map((e) => e.id) : [];
  ok('㉒ C: the file repaired — at the next write past the bound it reads again: its frame (old-1, its words) and this process\'s five are written together; the journal says it reads again',
    a.writes.length > 0 && cIds.includes('old-1') && cIds.includes(a1.id) && cIds.length === 6 && c.entries.find((e) => e.id === 'old-1').text === 'the old frame' && a.q.entriesFor('conv-u').some((e) => e.id === 'old-1') && a.logs.some((l) => l.includes('reads again')), S({ cIds, n: a.writes.length }));
  // D — an I/O error at boot, then the owner removes the file ⇒ the writes resume with this process's entries only
  const d = mkUnread(QW, 'EIO'); unreadFrame(d, 'd1'); const dHeld = d.writes.length;
  d.disk.now = null; d.adv(QW.UNREAD_RECHECK_MS); unreadFrame(d, 'd2');
  const dw = lastWrite(d);
  ok('㉒ D: a read error at boot ⇒ not written; the file then removed ⇒ the next write past the bound writes this process\'s two frames (the count starts over from what it holds)',
    dHeld === 0 && !!dw && dw.entries.length === 2 && d.logs.some((l) => l.includes('was removed')), S({ dHeld, dw }));
  // E — JSON that is no record (another build's shape, a stray value) is unread too — never an empty record to write over
  const e1 = mkUnread(QW, S({ v: 3, items: [{ id: 'x' }] })); unreadFrame(e1, 'e1');
  const e2 = mkUnread(QW, 'null'); unreadFrame(e2, 'e2');
  ok('㉒ E: a file of another shape ({ v:3, items }) or a bare null reads as UNREAD — neither is written over', e1.writes.length === 0 && e2.writes.length === 0, S({ e1: e1.writes, e2: e2.writes }));
  // F — a file that reads is written at once (the guard never holds a readable record), its frame kept beside the new one
  const f = mkUnread(QW, OLD_QW); unreadFrame(f, 'f1'); const fw = lastWrite(f);
  ok('㉒ F: a readable file is written at once, its frame kept beside the new one — the guard holds only what could not be read', !!fw && fw.entries.length === 2 && fw.entries.some((x) => x.id === 'old-1') && f.reads === 1, S({ fw }));
  ok('㉒ persist() asks stillUnread() before every write, and the boot and the re-read share ONE reader (readHeld)',
    /function persist\(\) \{\n    if \(stillUnread\(\)\) \{/.test(read('src/server/queued-wakes.js')) && read('src/server/queued-wakes.js').split('readHeld()').length === 3);
}

console.log('㉓ THE HOLD IS SAID, WITH ITS DOOR (B-e3fe follow-up, 主开发 04:02Z) — ONE For-you item while the file cannot be read; «Set it aside»');
{
  const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
  const QF = require(path.join(REPO, 'src/server/queued-file-for-you.js'));
  const FA = require(path.join(REPO, 'src/foryou-actions.js'));
  const S = JSON.stringify;
  // a For-you store that records what a producer files and resolves (the store's own add / setStatus / forSession shape)
  const store = () => { const items = []; return { items, add: (key, it) => { const ex = items.find((x) => x.key === key && x.itemKey && x.itemKey === it.itemKey && x.status === 'open'); if (ex) return { id: ex.id }; const x = { id: 'ut' + (items.length + 1), key, status: 'open', ...it }; items.push(x); return { id: x.id }; }, setStatus: (id, st) => { const x = items.find((y) => y.id === id); if (x) x.status = st; }, forSession: (keys) => items.filter((x) => keys.includes(x.key)) }; };
  // one hub: the REAL queued-wakes over a REAL data dir (its default reader), the REAL producer wired to it as jobs-wiring does
  const hub = (mod = QW, qf = QF, onDisk = TORN_QW, { ut: ut0 = null, rename = null } = {}) => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'qw-hold-')); if (onDisk != null) fs.writeFileSync(path.join(dir, 'msg-queued.json'), onDisk);
    let clock = T22; const writes = [];
    const q = mod.create({ dataDir: dir, now: () => clock, writer: { dirty: (f, o) => writes.push(o.produce()) }, noteSpend: () => { }, releaseSpend: () => { }, log: () => { }, ...(rename ? { rename } : {}) });
    const ut = ut0 || store(), deliver = { queuedFileState: () => q.fileState(), onQueuedFileState: (fn) => q.onFileState(fn), queuedSetAside: () => q.setAside() };
    qf.create({ getUserTodos: () => ut, deliver, log: () => { } });
    return { dir, q, ut, writes, adv: (ms) => { clock += ms; }, open: () => ut.items.filter((x) => x.status === 'open') };
  };
  // an EARLIER RUN's open item already in the store (the store outlives a restart)
  const earlier = () => { const u = store(); u.add('queued-wakes', { origin: 'server', kind: 'action', sessionName: 'Agent messages', text: 'x', action: { type: 'queued-file-unread' }, itemKey: 'queued-file-unread' }); return u; };
  // A — the boot finds it torn: ONE item, «This machine», naming the file, with the door's type; nothing written
  const a = hub(); unreadFrame(a, 'held words');
  const it = a.open()[0];
  ok('㉓ A: msg-queued.json torn at boot ⇒ ONE For-you item (origin server, head «Agent messages», high) naming data/msg-queued.json, action queued-file-unread — and nothing written',
    a.open().length === 1 && it.origin === 'server' && it.sessionName === 'Agent messages' && it.urgency === 'high' && it.action.type === 'queued-file-unread' && it.i18n.text.key === QF.TEXT && it.i18n.text.params.file === 'data/msg-queued.json' && a.writes.length === 0 && FA.FORYOU_HEADS['Agent messages'] === 'Agent messages', S({ it, writes: a.writes.length }));
  // B — the person's «Set it aside»: the file RENAMED beside it (its bytes kept), the writes resume, the item resolves itself
  const r = await a.q.setAside();
  const aside = fs.readdirSync(a.dir).filter((f) => f.startsWith('msg-queued.json.unreadable-'));
  const last = a.writes.length ? JSON.parse(a.writes[a.writes.length - 1]) : null;
  ok('㉓ B: «Set it aside» renames the torn file beside it (its bytes kept — nothing deleted), the record is written again with this process\'s frame, and the item resolves itself',
    r.ok && r.state === 'pass' && aside.length === 1 && fs.readFileSync(path.join(a.dir, aside[0]), 'utf8') === TORN_QW && !fs.existsSync(path.join(a.dir, 'msg-queued.json')) && !!last && last.entries.length === 1 && a.open().length === 0 && a.q.fileState().unread === false, S({ r, aside, n: a.writes.length, open: a.open().length }));
  // C — a press after the file was repaired (inside the re-read bound): it reads once more FIRST — the file joins, nothing moves
  const c = hub(); fs.writeFileSync(path.join(c.dir, 'msg-queued.json'), OLD_QW); c.adv(5e3);
  const rc = await c.q.setAside();
  ok('㉓ C: the file repaired a moment before the press — the press reads it once more first: «nothing to set aside», no file moved, its frame joined, the item resolved',
    rc.ok && rc.state === 'none' && fs.readdirSync(c.dir).filter((f) => f.includes('.unreadable-')).length === 0 && c.q.entriesFor('conv-u').some((e) => e.id === 'old-1') && c.open().length === 0, S({ rc, open: c.open().length }));
  // D — a readable file (or none): no item at all
  const d = hub(QW, QF, OLD_QW), d0 = hub(QW, QF, null);
  ok('㉓ D: a readable file, or none at all ⇒ no item (the door is only for a file that cannot be read)', d.ut.items.length === 0 && d0.ut.items.length === 0 && (await d.q.setAside()).state === 'none', S({ d: d.ut.items.length, d0: d0.ut.items.length }));
  // E — the door is declared by the registry row (the model never branches on the type), its words in zh and ja; the route is a person's press
  const row = FA.ROW_OF['queued-file-unread'], jw = read('src/server/jobs-wiring.js');
  const { dictEntries } = await import('./i18n-extract.mjs');
  const ZH = new Map([...dictEntries(read('src/lib/i18n-zh.js'))].map((e) => [e.key, e.value])), JA = new Map([...dictEntries(read('src/lib/i18n-ja.js'))].map((e) => [e.key, e.value]));
  const words = [QF.TEXT, QF.DETAIL, row.checkAgain, row.checkLabel, row.checkSaid.done, row.checkSaid.none, row.checkSaid.failed, 'Agent messages'];
  ok('㉓ E: the row declares the door (checkRoute /api/queued-wakes/set-aside, its said words) and every new sentence is in zh and ja',
    row.producer === 'src/server/queued-file-for-you.js' && row.card === 'inbox-window' && row.checkRoute === '/api/queued-wakes/set-aside' && words.every((k) => ZH.has(k) && JA.has(k)), words.filter((k) => !ZH.has(k) || !JA.has(k)).join(' | '));
  const WO = require(path.join(REPO, 'src/write-origin.js'));
  ok('㉓ E: the route is a PERSON\'S press — the owner\'s page verdict (ownerPageWhy) refuses before the ladder is asked; a bearer is refused by it',
    /app\.post\('\/api\/queued-wakes\/set-aside', async \(req, res\) => \{\n    const w = require\('\.\.\/write-origin\.js'\)\.ownerPageWhy\(req\);[^\n]*\n    if \(w\) return res\.status\(403\)/.test(jw) && WO.ownerPageWhy({ headers: { authorization: 'Bearer x', 'sec-fetch-site': 'same-origin' } }) === 'bearer' && WO.ownerPageWhy({ headers: { 'sec-fetch-site': 'same-origin' } }) === null);
  // THE CURE (round wz96dfzt3's MUST): an earlier run's open item is CLOSED — by a boot that reads the file (or finds it gone), and
  // by a press that finds no hold (its own button answers «nothing to set aside» AND closes it)
  const f1 = hub(QW, QF, OLD_QW, { ut: earlier() }), f2 = hub(QW, QF, null, { ut: earlier() });
  ok('㉓ F: the store holds an earlier run\'s open item; this boot READS the file (or finds it gone) ⇒ the item is closed at wiring — never left open with words now false',
    f1.open().length === 0 && f2.open().length === 0 && f1.ut.items.length === 1, S({ f1: f1.ut.items.map((x) => x.status), f2: f2.ut.items.map((x) => x.status) }));
  const g = hub(QW, QF, OLD_QW); g.ut.add('queued-wakes', { origin: 'server', kind: 'action', text: 'x', action: { type: 'queued-file-unread' }, itemKey: 'queued-file-unread' });
  const rg = await g.q.setAside();
  ok('㉓ G: a press with NO hold behind it (the item outlived its cause) answers «nothing to set aside» and closes the item', rg.ok && rg.state === 'none' && g.open().length === 0, S({ rg, open: g.open().length }));
  // small 3: two presses racing on one torn file — only the press whose rename moved it says «set aside»
  const h = hub(); const [p1, p2] = await Promise.all([h.q.setAside(), h.q.setAside()]);
  const asideH = fs.readdirSync(h.dir).filter((f2x) => f2x.startsWith('msg-queued.json.unreadable-'));
  ok('㉓ H: two presses racing — exactly ONE says «set aside» (its rename moved the file, its dest exists), the other «nothing to set aside»; the item is closed',
    [p1, p2].filter((x) => x.state === 'pass').length === 1 && [p1, p2].filter((x) => x.state === 'none').length === 1 && asideH.length === 1 && asideH[0] === [p1, p2].find((x) => x.state === 'pass').dest && h.open().length === 0, S({ p1, p2, asideH }));
  // small 2: a refused rename answers its CODE only — the toast says the row's declared sentence first, the code after it
  const iH = hub(QW, QF, TORN_QW, { rename: async () => { throw Object.assign(new Error('EACCES: permission denied, rename'), { code: 'EACCES' }); } });
  const ri = await iH.q.setAside();
  const acts = read('src/lib/user-todos-actions.js');
  // the toast line: the declared sentence, then the code. B-af94 (moved onto .413) put ONE door in front of it — a MOUNT route's code
  // worded in the reader's language (/api/mounts/… only) — so this route (/api/queued-wakes/…) falls through to the same words; any
  // other prefix is red by its text (toastPre)
  const TOAST_TAIL = "(r && r.error) || t(said.failed) + (r && r.code ? ` (${String(r.code).slice(0, 40)})` : ''), { type: 'error' });";
  const MOUNT_FIRST = "(r && r.code && String(checkRow.checkRoute).startsWith('/api/mounts/') && mountWords(r.code, r.params, { t, lang: resolveLang() })) || ";
  const toastLines = acts.split('\n').map((l) => l.trim()).filter((l) => l.includes(TOAST_TAIL));
  const toastPre = toastLines.length === 1 && toastLines[0].startsWith('showToast(') ? toastLines[0].slice('showToast('.length, toastLines[0].indexOf(TOAST_TAIL)) : null;
  ok('㉓ I: a refused rename answers {ok:false, code} (no bare text), the file stays where it was, the item stays open — and the press\'s toast is the declared sentence, then the code',
    ri.ok === false && ri.code === 'EACCES' && !('error' in ri) && fs.readFileSync(path.join(iH.dir, 'msg-queued.json'), 'utf8') === TORN_QW && iH.open().length === 1
      && toastPre !== null && (toastPre === '' || toastPre === MOUNT_FIRST), S({ ri, toastPre }));
  // small 1: the press reads the file OFF the loop — setAside awaits the async reader and never calls the bounded synchronous re-read
  const qsrc0 = read('src/server/queued-wakes.js'), sa = qsrc0.slice(qsrc0.indexOf('  async function setAside() {'), qsrc0.indexOf('\n  }\n', qsrc0.indexOf('  async function setAside() {')));
  ok('㉓ J: the press\'s re-read is OFF the loop — setAside awaits readHeldAsync (fs.promises) and calls neither stillUnread() nor readHeld()', sa.length > 200 && /await readHeldAsync\(\)/.test(sa) && !/stillUnread\(\)|readHeld\(\)/.test(sa) && /await require\('fs'\)\.promises\.readFile\(file, 'utf8'\)/.test(qsrc0));
  // RED CONTROLS (setup-checked anchors; each fails by name when its anchor is gone)
  const MH = mutantCopies('queued-wake-hold', REPO);
  const qsrc = read('src/server/queued-wakes.js'), fsrc = read('src/server/queued-file-for-you.js');
  const REN = "    try { await ren(file, dest); moved = true; }", SUB = "  if (deliver && typeof deliver.onQueuedFileState === 'function') deliver.onQueuedFileState((ev) => { if (ev && ev.unread === false) settled(ev.how); });";
  ok('㉓ setup: the rename and the item\'s resolve are each in their module once', qsrc.split(REN).length === 2 && fsrc.split(SUB).length === 2);
  const NoRen = MH.load('src/server/queued-wakes.js', anchored(qsrc, REN, '    try { /* no rename */ moved = true; }', 'no-rename'), 'no-rename');
  const ar = hub(NoRen); await ar.q.setAside();
  ok('㉓ CONTROL: without the rename the torn file stays where it was, under its own name — nothing is set aside (㉓ B can go red)', fs.readdirSync(ar.dir).filter((f) => f.includes('.unreadable-')).length === 0 && fs.readFileSync(path.join(ar.dir, 'msg-queued.json'), 'utf8') === TORN_QW);
  const NoSub = MH.load('src/server/queued-file-for-you.js', anchored(fsrc, SUB, '', 'no-resolve'), 'no-resolve');
  const as = hub(QW, NoSub); await as.q.setAside();
  ok('㉓ CONTROL: without the producer\'s listener the item stays open after the file is set aside (㉓ B can go red)', as.open().length === 1);
  const BOOT = "else if (st) settled('boot'); }", NONE = "    if (!unread) { fileSettled('none'); return { ok: true, state: 'none' }; }";
  ok('㉓ setup: the boot\'s close and the no-hold press\'s close are each in their module once', fsrc.split(BOOT).length === 2 && qsrc.split(NONE).length === 2);
  const NoBoot = MH.load('src/server/queued-file-for-you.js', anchored(fsrc, BOOT, '}', 'no-boot-close'), 'no-boot-close');
  ok('㉓ CONTROL: without the boot\'s close an earlier run\'s item stays open at a boot that reads the file (㉓ F can go red)', hub(QW, NoBoot, OLD_QW, { ut: earlier() }).open().length === 1);
  const NoNone = MH.load('src/server/queued-wakes.js', anchored(qsrc, NONE, "    if (!unread) return { ok: true, state: 'none' };", 'no-none-close'), 'no-none-close');
  const gn = hub(NoNone, QF, OLD_QW); gn.ut.add('queued-wakes', { origin: 'server', kind: 'action', text: 'x', action: { type: 'queued-file-unread' }, itemKey: 'queued-file-unread' }); await gn.q.setAside();
  ok('㉓ CONTROL: a no-hold press that only answers «none» leaves the item open — its button closes nothing (㉓ G can go red)', gn.open().length === 1);
}

console.log('㉔ AN OLD AGENT\'S FRAME, SAID FOR REAL (B-0a33 cure (c)) — the REAL ladder\'s pullQueued answers «no-remove», the REAL guard files the For-you line');
{
  const GUARDm = require(path.join(REPO, 'src/server/spend-guard.js'));
  const run = async (mod) => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'unheld-')); const settings = { 'spend.unattendedPerIdentityHour': 5 }; const filed = [];
    const ut = { add: (key, it) => { filed.push({ key, it }); return { id: 'u' + filed.length }; }, idsWhere: () => [], setStatus: () => { } };
    const guard = GUARDm.create({ dataDir: dir, serverSetting: (k) => settings[k], identityOf: () => ({ key: 'slot-1', name: 'slot one' }), getUserTodos: () => ut, log: () => { } });
    const W = world('antigravity', { dataDir: dir, guard, mod, overCap: true });   // the agy advert serves no «remove»: an agent too old to give a frame back
    const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
    await W.eng.post({ group: gid, from: A, text: 'held behind the turn', wake: true });
    W.deliver.noteQueueItems(X, [{ id: 'q1' }], { fresh: true }); W.settle('queued');   // bound as ⑪ binds (the earliest unseen item)
    settings['spend.unattendedPerIdentityHour'] = 0;   // the cap lowered below what waits
    W.deliver.queuedEntries(X);   // a sweep: ageOut → rejudge → the real pullQueued
    const got = filed.filter((f) => f.it && typeof f.it.itemKey === 'string' && f.it.itemKey.startsWith('spend-unheld:'));
    got.why = { notes: W.money.notes.slice(-4), entries: W.deliver.queuedEntries(X), filed: filed.map((f) => f.it && f.it.itemKey) };   // what a red names
    return got;
  };
  const got = await run(DELIVER);
  ok('㉔ a frame waiting in an agent that serves no «remove», the cap lowered below it: the REAL pullQueued answers no-remove and the REAL guard files ONE For-you line, under the conversation it waits behind',
    got.length === 1 && /could not be held: its agent is too old to give a queued message back/.test(got[0].it.text) && got[0].it.sessionName === 'Spending', JSON.stringify({ got: got.map((g) => ({ key: g.key, text: g.it.text, itemKey: g.it.itemKey })), why: got.why }));
  const dsrc = read('src/server/conversation-deliver.js'), NR = "return 'no-remove';";
  ok('㉔ setup: pullQueued\'s «no-remove» is in the ladder once', dsrc.split(NR).length === 2);
  const NoNR = mutantCopies('queued-wake-nr', REPO).load('src/server/conversation-deliver.js', editAnchor(dsrc, NR, 'return false;', "src/server/conversation-deliver.js"), 'no-remove-false');
  ok('㉔ CONTROL: a ladder whose pullQueued still answers false files NO line — the person is never told (㉔ can go red)', (await run(NoNR)).length === 0);
}

console.log('㉕ A SETTINGS WRITE ASKS AGAIN (B-0a33 cure (d)) — the re-judge paces its asks; `fresh` (a write that moved the caps) asks every frame over a cap once more');
{
  const QWm = require(path.join(REPO, 'src/server/queued-wakes.js'));
  const run = (mod) => {
    const pulls = []; let over = [];
    const q = mod.create({ dataDir: fs.mkdtempSync(path.join(ROOT, 'qw-fresh-')), writer: { dirty() { } }, noteSpend: () => { }, releaseSpend: () => { }, waitingOverCap: () => over, pull: (cid, item) => { pulls.push(item); return true; }, log: () => { } });
    const e = q.noteWritten('conv-f', { charged: { reason: 'peer-message' }, text: 'F', fromName: 'alpha', holder: '4242' });
    q.answer(e.id, { mode: 'queued' }); over = [e.id];
    q.noteQueue('conv-f', [{ id: 'f1', kind: 'peer', from: 'alpha' }], '4242', { fresh: true });   // bound — and judged (one ask)
    const afterBind = pulls.length; q.rejudge(); const afterSweep = pulls.length; q.rejudge({ fresh: true }); const afterWrite = pulls.length;
    return { afterBind, afterSweep, afterWrite };
  };
  const r = run(QWm);
  ok('㉕ a frame over the cap is asked back ONCE for what it is (bound: one ask); a sweep asks nothing more; a settings write (`fresh`) asks it once more', r.afterBind === 1 && r.afterSweep === 1 && r.afterWrite === 2, JSON.stringify(r));
  const qsrc = read('src/server/queued-wakes.js'), FR = 'if (!fresh && !again && e.pulled && (';
  ok('㉕ setup: the re-judge\'s fresh test is in queued-wakes once', qsrc.split(FR).length === 2);
  const NoFresh = mutantCopies('queued-wake-fresh', REPO).load('src/server/queued-wakes.js', editAnchor(qsrc, FR, 'if (!again && e.pulled && (', "src/server/queued-wakes.js"), 'no-fresh');
  ok('㉕ CONTROL: a re-judge that ignores `fresh` never asks again after a settings write (㉕ can go red)', run(NoFresh).afterWrite === 1, JSON.stringify(run(NoFresh)));
}

console.log('⑩ RED CONTROLS — patched copies: each law-1 rule removed, its leg goes red');
{
  const MUT = mutantCopies('queued-wake', REPO);
  const dsrc = read('src/server/conversation-deliver.js');
  const BRANCH = '          else if (rpc.s._isStreaming === true) {';
  ok('⑩ setup: the in-turn branch is in the ladder once', dsrc.split(BRANCH).length === 2);
  const NoBranch = MUT.load('src/server/conversation-deliver.js', editAnchor(dsrc, BRANCH, '          else if (false) {', "src/server/conversation-deliver.js"), 'no-branch');
  const W = world('antigravity', { mod: NoBranch });
  const gid = (await W.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const sent = [];
  for (const text of ['a', 'b', 'c']) sent.push(await W.eng.post({ group: gid, from: A, text, wake: true }));
  ok('⑩ WITHOUT the in-turn branch the incident is back: woke ×3, read ×3, charged ×3 at the stdin write (① can go red)',
    sent.every((s) => (s.woke || []).length === 1 && !(s.queued || []).length) && sent.every((s) => W.row(gid, s.message).state === 'handed') && W.charged() === 3, JSON.stringify({ n: W.charged() }));
  // the marker moves with a queued wake (no second carrier): without it, the next-turn report re-sends what the queue holds
  const gsrc = read('src/server/groups-engine.js');
  const MOVE = "      if (!(Number(m.reportedUpTo) >= upTo)) m.reportedUpTo = upTo;\n      m.queued = ";
  ok('⑩ setup: markQueued moves the marker once', gsrc.split(MOVE).length === 2);
  const NoMove = MUT.load('src/server/groups-engine.js', editAnchor(gsrc, MOVE, '      m.queued = ', "src/server/groups-engine.js"), 'no-marker-move');
  const W4 = world('antigravity', { ge: NoMove });
  const g4 = (await W4.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const s4 = await W4.eng.post({ group: g4, from: A, text: 'held by the queue', wake: true });
  const rep4 = W4.eng.reportsForTurn(X);
  ok('⑩ WITHOUT the marker move, the next-turn report re-sends the queued record — a second carrier (① «no second carrier» can go red)', !!(rep4 && rep4.text && rep4.text.includes(s4.message.text)), rep4 && rep4.text);
  // the queued delivery state: without it a queued record reads «read by» (the incident's second lie)
  const msrc = read('src/channel-groups.js');
  const Q = "    const q = queuedFor(m, at);\n    const handed = !q && Number.isFinite(m.reportedUpTo) && m.reportedUpTo >= at;";
  ok('⑩ setup: deliveryOf reads the queued entry once', msrc.split(Q).length === 2);
  const NoQ = MUT.load('src/channel-groups.js', editAnchor(msrc, Q, "    const q = null;\n    const handed = Number.isFinite(m.reportedUpTo) && m.reportedUpTo >= at;", "src/channel-groups.js"), 'no-queued-state');
  const W5 = world('antigravity');
  const g5 = (await W5.eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
  const s5 = await W5.eng.post({ group: g5, from: A, text: 'still in the queue', wake: true });
  const real5 = G.deliveryOf(W5.eng.get(g5), s5.message, { log: [s5.message] })[0].state, mut5 = NoQ.deliveryOf(W5.eng.get(g5), s5.message, { log: [s5.message] })[0].state;
  ok('⑩ WITHOUT the queued state a record its wrapper holds reads «read by» — the incident\'s second lie (① can go red)', real5 === 'queued' && mut5 === 'handed', JSON.stringify({ real5, mut5 }));
  // B-e3fe: persist()'s guard removed ⇒ the first write replaces an unreadable msg-queued.json (the row's scene)
  const qsrc = read('src/server/queued-wakes.js');
  const GUARD = "    if (stillUnread()) {   // B-e3fe: never written over while it cannot be read\n";
  ok('⑩ setup: persist() asks stillUnread() once', qsrc.split(GUARD).length === 2);
  const NoGuard = MUT.load('src/server/queued-wakes.js', editAnchor(qsrc, GUARD, '    if (false) {\n', "src/server/queued-wakes.js"), 'no-unread-guard');
  const wg = mkUnread(NoGuard, TORN_QW); unreadFrame(wg, 'new words'); const wgLast = lastWrite(wg);
  ok('⑩ WITHOUT the guard the torn msg-queued.json is WRITTEN OVER at the first write with this process\'s entry alone — the frame it held is gone (㉒ A can go red)',
    wg.writes.length > 0 && !!wgLast && wgLast.v === 2 && wgLast.entries.length === 1 && !wg.writes.some((x) => x.includes('old-1')), JSON.stringify({ n: wg.writes.length, wgLast }));
  // B-e3fe: the join removed ⇒ a file that reads again is written over with this process's entries alone
  const JOIN = "      entries = [...entries, ...held.entries.filter((e) => !ids.has(e.id))];";
  ok('⑩ setup: the re-read joins the file\'s entries once', qsrc.split(JOIN).length === 2);
  const NoJoin = MUT.load('src/server/queued-wakes.js', editAnchor(qsrc, JOIN, '      entries = [...entries];', "src/server/queued-wakes.js"), 'no-unread-join');
  const wj = mkUnread(NoJoin, TORN_QW); unreadFrame(wj, 'j1'); wj.disk.now = OLD_QW; wj.adv(60e3); unreadFrame(wj, 'j2'); const wjLast = lastWrite(wj);
  ok('⑩ WITHOUT the join, the file that reads again is written over with this process\'s two frames alone — old-1 is lost (㉒ C can go red)',
    !!wjLast && wjLast.entries.length === 2 && !wjLast.entries.some((x) => x.id === 'old-1'), JSON.stringify({ wjLast }));
}

console.log('㉖ 主开发 r5164 (2), a silence of the release: a frame a wrapper hands back that is NOT on disk is said by name, on every road (the ladder\'s own, the re-stash) — ACP, codex — r5176: the journal');
{
  const MS = mutantCopies('queued-wake-silence', REPO);
  const REC = { acp: { type: 'acp', kind: 'peer_result', ok: false, text: 'a frame the wrapper handed back', reason: 'stop' },
    codex: { type: 'event_msg', payload: { type: 'peer_message_result', ok: false, text: 'a frame the wrapper handed back', reason: 'stop' } } };
  const scene = (Mod, kind, road) => {
    let reached = 0, healthReads = 0; const warns = [], noop = () => { };
    // the plant: the stash is HELD (its health «not durable»). `reached` is its WITNESS (r5135 law 1): the road the frame took was reached —
    // the ladder's own (noteHandedBack: true, it stashes with its ref) or the reader's re-stash (stashFor)
    const deliverRef = { noteHandedBack: () => { if (road === 'ours') { reached++; return true; } return false; }, restoreFrame: () => 0,
      stashFor: () => { if (road === 'restash') reached++; return { stored: false, taken: true, why: 'taken, not on disk' }; },
      stashHealth: () => { healthReads++; return { durable: false, held: true, error: 'the list of messages waiting for conversations could not be read' }; } };
    const C = Mod.create({ engine: { noteTurnEnd: noop }, noteHarnessModels: noop, deliverRef, permissionRulesRef: null });
    const S = { buffer: '', backendSessionId: 'cid-hb' }; let feed = null;
    C.attach(S, 'w-hb', { onData: (cb) => { feed = cb; } }, { feedLive: noop, broadcastToSession: noop, broadcastActiveSessions: noop, readSessionMeta: () => null, writeSessionMeta: noop, updateSessionTodos: noop });
    const w0 = console.warn, l0 = console.log; console.warn = (...x) => warns.push(x.join(' ')); console.log = () => { };
    try { feed(JSON.stringify(REC[kind]) + '\n'); } finally { console.warn = w0; console.log = l0; }
    return { reached, healthReads, said: warns.some((l) => /the frame the wrapper handed back \(\d+ chars, for cid-hb\) is not on disk — the list of messages waiting for conversations could not be read: lost if VibeSpace restarts before it reads again, unless that conversation's next turn takes it first/.test(l)) };
  };
  const NEW = 'try { const h = cid ? deliverRef?.stashHealth?.() : null; if (h && h.durable === false) console.warn(';
  const OLD = 'try { const h = null; if (h && h.durable === false) console.warn(';
  for (const [kind, rel] of [['acp', 'src/server/stdout/acp-events.js'], ['codex', 'src/server/stdout/codex-events.js']]) {
    for (const road of ['restash', 'ours']) {
      const r = scene(require(path.join(REPO, rel)), kind, road);
      if (r.reached !== 1) console.log(`  SKIP ㉖ ${kind} ${road}: the hand-back never reached its road (${JSON.stringify(r)})`);
      else ok(`㉖ ${kind}, the ${road === 'ours' ? 'ladder\'s own' : 're-stash'} road: the handed-back frame not on disk is SAID by name in the journal (its size, its conversation, why and its bound) — the stash's own health read once`, r.said && r.healthReads === 1, JSON.stringify(r));
    }
    const rx = scene(MS.load(rel, anchored(read(rel), NEW, OLD, `${kind}: the release (the stash's state not read)`), `silence-${kind}`), kind, 'restash');
    if (rx.reached !== 1) console.log(`  SKIP ㉖ ${kind} RED: the hand-back never reached the stash (${JSON.stringify(rx)})`);
    else ok(`㉖ ${kind} RED CONTROL (the release: nothing read after the hand-back): nothing is said`, !rx.said, JSON.stringify(rx));
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
