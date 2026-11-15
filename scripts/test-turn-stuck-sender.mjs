#!/usr/bin/env node
// A MESSAGE QUEUED BEHIND A STUCK TURN SAYS WHERE IT IS (lane turn-never-silent, law L4 — pick 5): ① the hub's turn watch keeps
// ONE fact on the session (`_turnStuckSince`) while it says the turn is stuck, and drops it when the turn moves, ends, or the
// person keeps waiting; ② a message queued behind that turn is answered with it (the REAL groups engine over the REAL deliverer);
// ③ the REAL vibespace-msg says it to its sender («a turn stuck since …; the owner has been asked»); ④ the wait watch's sender
// entry says it too. Delivered as today once the turn is released — no turn is started by any of it. RED on pick 4.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const MIN = 60e3;
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-turn-stuck-sender-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const TWatch = require(path.join(REPO, 'src/server/turn-watch.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));

console.log('— ① the watch keeps ONE fact on the session while it says the turn is stuck');
{
  const T0 = 1_800_000_000_000; let clock = T0;
  const dir = fs.mkdtempSync(path.join(ROOT, 'w-'));
  const side = (o) => fs.writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ pid: 9, childPid: 10, turnOpenedAt: T0, ...o }));
  side({ cliWroteAt: T0 });
  const tools = new Map([['t', { block: { name: 'run_command' } }]]);
  const s = { mode: 'chat', backend: 'antigravity', name: 'xray', _isStreaming: true, _normalizer: { openTool: () => (tools.size ? { name: 'run_command' } : null) } };
  const sessions = new Map([['x', s]]);
  const ut = new UserTodoManager({ dataDir: fs.mkdtempSync(path.join(dir, 'd-')), onChange: () => { } });
  const reader = { readBelow: async () => ({ readable: true, alive: true, at: clock, cut: false, list: [{ pid: 11, startTicks: 5, ticks: 1 }] }) };
  const w = TWatch.create({ activeSessions: sessions, buffersDir: dir, getUserTodos: () => ut, sessionKeyOf: () => 'k', procTree: reader, now: () => clock, mono: () => clock, log: { log: () => { } } });
  const at = async (m) => { clock = T0 + m * MIN; await w.sweep(); };
  for (let m = 0; m <= 9; m++) await at(m);
  ok(!('_turnStuckSince' in s), 'nine minutes: no fact (nothing said)');
  await at(10);
  ok(s._turnStuckSince === T0, 'said as stuck: `_turnStuckSince` = since when nothing was written (the item\'s own instant)', s._turnStuckSince);
  side({ cliWroteAt: T0 + 11 * MIN }); await at(11);
  ok(!('_turnStuckSince' in s), 'the turn moved (a line): the fact is gone');
  side({ cliWroteAt: T0 + 11 * MIN }); for (let m = 12; m <= 21; m++) await at(m);
  ok(s._turnStuckSince === T0 + 11 * MIN, 'stuck again: the fact again, from the new silence');
  w.keepWaiting('x');
  ok(!('_turnStuckSince' in s), 'the person keeps waiting: the fact is gone (not said as stuck until another full bound)');
  for (let m = 22; m <= 32; m++) await at(m);
  s._isStreaming = false; await at(33);
  ok(!('_turnStuckSince' in s), 'the turn ended: the fact is gone');
}

console.log('— ② the REAL groups engine over the REAL deliverer: a wake queued behind a stuck turn is answered with it');
{
  const DELIVER = require(path.join(REPO, 'src/server/conversation-deliver.js'));
  const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
  const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
  const A = 'aaaaaaaa-0000-4000-8000-00000000000a', X = 'bbbbbbbb-0000-4000-8000-00000000000b';
  const T_TURN = Date.parse('2026-11-11T17:10:03Z'), T_STUCK = Date.parse('2026-11-11T17:10:05Z');
  const run = async (stuck) => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'g-'));
    fs.mkdirSync(path.join(dir, 'session-buffers'), { recursive: true });
    const wid = 'w-agy', frames = [];
    const S = { backend: 'antigravity', mode: 'chat', name: 'xray', host: null, socketPath: path.join(dir, 'cw-' + wid), _isStreaming: true, _turnStateSeen: true, _turnOpenedAt: T_TURN, backendSessionId: X, pty: { write: (f) => frames.push(JSON.parse(String(f))) } };
    if (stuck) S._turnStuckSince = T_STUCK;
    fs.writeFileSync(path.join(dir, 'session-buffers', wid + '.json'), JSON.stringify({ pid: process.pid, startedAt: Date.now(), mode: 'chat', backend: 'antigravity', threadId: X, caps: { peerMessage: true, notificationSteer: false, inputQueue: true, queueVerbs: ['remove', 'steer', 'reorder', 'edit'] } }));
    const deliver = DELIVER.create({ dataDir: dir, activeSessions: new Map([[wid, S]]), serverSetting: () => undefined, getHosts: () => null, getConvIndex: () => null,
      peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: true }) }, emitPeerCard: () => true,
      authorizeSpend: () => ({ ok: true, identity: { key: 'slot-1', name: 'slot one' }, hold: 'h1' }), noteSpend: () => { }, releaseSpend: () => { }, log: () => { } });
    let t = Date.parse('2026-11-11T19:00:00Z');
    const roster = [{ cid: A, name: 'alpha', groups: ['tg1'], reachability: null }, { cid: X, name: 'xray', groups: ['tg1'], reachability: null }];
    const eng = GE.create({ store: createChannelStore({ dir: path.join(dir, 'channels') }), deliver, broadcast: () => { }, now: () => (t += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() { }, warn() { }, log() { } } });
    const s0 = await eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false });
    return eng.post({ group: s0.group.id, from: A, text: 'are you there?', wake: true });
  };
  const yes = await run(true), no = await run(false);
  ok(yes.ok && (yes.queued || []).length === 1 && yes.queued[0].stuckSince === T_STUCK && yes.queued[0].since === T_TURN, 'behind a turn the hub says is stuck: the queued answer carries since when (beside the turn\'s own start)', yes.queued);
  ok(no.ok && (no.queued || []).length === 1 && !('stuckSince' in no.queued[0]), 'behind a turn that is merely running: no such fact (the answer as before)', no.queued);
  ok((yes.woke || []).length === 0, 'it is still queued, never woke — delivered as today once the turn is released (no turn is started)');
}

console.log('— ③ the REAL vibespace-msg says it to its sender');
{
  const answer = { ok: true, posted: true, group: { id: 'g1', name: 'alpha · xray', pair: true }, message: { vendorId: 'm1' }, chars: 14, woke: [], queued: [{ member: 'x', name: 'xray', since: Date.parse('2026-11-15T03:10:00Z'), stuckSince: Date.parse('2026-11-15T03:12:00Z') }] };
  const srv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => { b += d; }); q.on('end', () => { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify(answer)); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const out = await new Promise((res) => {
    const c = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-msg'), 'send', 'xray', 'are you there?', '--wake'], { env: { PATH: process.env.PATH, HOME: ROOT, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_' + 'x'.repeat(40) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; }); c.on('exit', () => res(o));
  });
  srv.close();
  ok(/waiting \(not billed yet\): xray's current turn \(running since 03:10Z\) — a turn stuck since 03:12Z; the owner has been asked/.test(out), 'the sender reads WHERE its message is: «xray\'s current turn (running since 03:10Z) — a turn stuck since 03:12Z; the owner has been asked»', out.slice(0, 600));
}

console.log('— ④ the wait watch\'s sender entry (shape C) says it too');
{
  const WW = require(path.join(REPO, 'src/wait-words.js'));
  const e = WW.senderEntry([{ name: 'xray', n: 2, oldestText: '03:10 PT', openedText: '03:05 PT', stuckText: '03:12 PT' }]);
  ok(/to «xray» \(2, the oldest sent at 03:10 PT; in a turn since 03:05 PT — a turn stuck since 03:12 PT; the owner has been asked\)/.test(e), 'its entry names the stuck turn and that the owner has been asked', e);
  ok(!/stuck/.test(WW.senderEntry([{ name: 'xray', n: 1, oldestText: '03:10 PT', openedText: '03:05 PT' }])), 'a turn merely running: the entry as before');
}

console.log('— ⑤ P7 (主开发 04:44Z): a sender ALREADY waiting when the turn becomes stuck is told — once, at its next turn, free');
{
  const DELIVER = require(path.join(REPO, 'src/server/conversation-deliver.js'));
  const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
  const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
  const A = 'aaaaaaaa-0000-4000-8000-00000000000a', X = 'bbbbbbbb-0000-4000-8000-00000000000b';
  const T0 = Date.parse('2026-11-11T19:00:00Z');
  const dir = fs.mkdtempSync(path.join(ROOT, 'p7-')); fs.mkdirSync(path.join(dir, 'session-buffers'), { recursive: true });
  const wid = 'w-agy', frames = [];
  const S = { backend: 'antigravity', mode: 'chat', name: 'xray', host: null, socketPath: path.join(dir, 'cw-' + wid), _isStreaming: true, _turnStateSeen: true, _turnOpenedAt: T0, backendSessionId: X,
    _normalizer: { openTool: () => ({ name: 'run_command' }) }, pty: { write: (f) => frames.push(String(f)) } };
  const side = { pid: process.pid, startedAt: T0, mode: 'chat', backend: 'antigravity', threadId: X, childPid: 4001, cliWroteAt: T0, turnOpenedAt: T0, caps: { peerMessage: true, notificationSteer: false, inputQueue: true, queueVerbs: ['remove', 'steer', 'reorder', 'edit'] } };
  fs.writeFileSync(path.join(dir, 'session-buffers', wid + '.json'), JSON.stringify(side));
  const sessions = new Map([[wid, S]]);
  const deliver = DELIVER.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined, getHosts: () => null, getConvIndex: () => null,
    peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: true }) }, emitPeerCard: () => true,
    authorizeSpend: () => ({ ok: true, identity: { key: 'slot-1', name: 'slot one' }, hold: 'h1' }), noteSpend: () => { }, releaseSpend: () => { }, log: () => { } });
  let clock = T0;
  const roster = [{ cid: A, name: 'alpha', groups: ['tg1'], reachability: null }, { cid: X, name: 'xray', groups: ['tg1'], reachability: null }];
  const eng = GE.create({ store: createChannelStore({ dir: path.join(dir, 'channels') }), deliver, broadcast: () => { }, now: () => (clock += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() { }, warn() { }, log() { } } });
  const s0 = await eng.sendToAgent({ from: A, to: X, text: 'hello', wake: false });
  const sent = await eng.post({ group: s0.group.id, from: A, text: 'are you there?', wake: true });
  ok(sent.ok && (sent.queued || []).length === 1 && !('stuckSince' in sent.queued[0]), 'alpha\'s wake is queued behind xray\'s running turn (not stuck yet — no such fact in its answer)');
  const ut = new UserTodoManager({ dataDir: fs.mkdtempSync(path.join(dir, 'd-')), onChange: () => { } });
  const reader = { readBelow: async () => ({ readable: true, alive: true, at: clock, cut: false, list: [{ pid: 4100, startTicks: 5, ticks: 1 }] }) };
  const w = TWatch.create({ activeSessions: sessions, buffersDir: path.join(dir, 'session-buffers'), getUserTodos: () => ut, getGroups: () => eng, getDeliver: () => deliver, sessionKeyOf: () => 'k', procTree: reader, now: () => clock, mono: () => clock, log: { log: () => { } } });
  const at = async (m) => { clock = T0 + m * MIN; await w.sweep(); };
  for (let m = 1; m <= 9; m++) await at(m);
  const framesBefore = frames.length;
  ok(!deliver.drainStash(A).some((e) => String(e.slot || '').startsWith(TWatch.SLOT)), 'nine minutes: nothing told');
  await at(11);
  const got = deliver.drainStash(A).filter((e) => String(e.slot || '').startsWith(TWatch.SLOT));
  ok(got.length === 1 && /Your group message to «xray» waits behind its current turn — a turn stuck since .+; the owner has been asked\. It is handed over when that turn is released\./.test(got[0].text) && got[0].fromName === 'VibeSpace', 'at the stuck moment: ONE line in alpha\'s stash — where its message is, since when, that the owner was asked (the same sentence a new sender gets)', got.map((e) => e.text));
  ok(frames.length === framesBefore && !frames.some((f) => /stuck since/.test(f)), 'a stash line, delivered at alpha\'s NEXT turn — never a wake (nothing more written to any CLI at that moment), never a billed turn', { before: framesBefore, after: frames.length });
  for (let m = 12; m <= 30; m++) await at(m);
  ok(!deliver.drainStash(A).some((e) => String(e.slot || '').startsWith(TWatch.SLOT)), 'readings after it: never told twice for the same stuck turn');
  fs.writeFileSync(path.join(dir, 'session-buffers', wid + '.json'), JSON.stringify({ ...side, cliWroteAt: T0 + 31 * MIN }));
  await at(31);
  ok(!deliver.drainStash(A).some((e) => String(e.slot || '').startsWith(TWatch.SLOT)), 'the turn moved: nothing more is said (its ordinary delivery says that)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
