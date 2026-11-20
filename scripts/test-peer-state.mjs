#!/usr/bin/env node
// test-peer-state.mjs — row B-95fc U1 (lane login-request-card, 2026-11-20; the shape TAKEN by 主开发 r223): A PAIRED MACHINE ANSWERS
// FOR ITS OWN INBOX. In process, over the REAL ladder and its retry park (src/server/conversation-deliver.js), the hand-over's waiting
// line (src/server/stash-handover.js waitingAll) and the REAL device client's gate (src/agentd/client.js peerState), with a stand-in
// machine handle and a stand-in machines list:
//   ① the shared lookup (src/peer-messaging.js): a record whose pid lives but whose socket is not served yet counts as `starting`
//   ② a delivery to a conversation that ENDED there: the remote miss is typed «not running» on the machine's reply, and ONE wake is
//      owed — RED CONTROL: today's untyped miss (no wake owed, the resume never comes)
//   ③ a CLI still starting there (live, no inbox): no wake owed (its next turn carries the words)
//   ④ an OLDER agent is NEVER asked (no peer-state in its hello — an unknown op hangs): today's road, said once, and the person reads
//      why (the row's «its device agent is older: update it») — RED CONTROL: the client asking regardless
//   ⑤ a HELD machines list: nothing parked, nothing ENDED — an owed wake is asked again after the read — RED CONTROL: bl-jobs' «running
//      with nobody to carry it»
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { ok, report } = checker();
const PM = require(path.join(REPO, 'src/peer-messaging.js'));
const DELIVER = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const SH = require(path.join(REPO, 'src/server/stash-handover.js'));
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const JM_MODEL = require(path.join(REPO, 'src/job-model.js'));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const ROOT = scratchDir('peer-state');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const settle = async () => { for (let i = 0; i < 20; i++) await null; };
const CID = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NO_INBOX = 'no live inbox for this conversation on this machine';

console.log('① the shared lookup: a CLI still starting');
{
  const reg = path.join(ROOT, 'reg'); fs.mkdirSync(reg, { recursive: true });
  const st = fs.readFileSync('/proc/self/stat', 'utf8'), procStart = st.slice(st.lastIndexOf(')') + 2).split(' ')[19];
  fs.writeFileSync(path.join(reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: CID(1), messagingSocketPath: path.join(ROOT, 'no-socket.sock'), procStart, startedAt: Date.now() }));
  const a = PM.lookupPeer(CID(1), reg);
  ok(a.peer === null && a.starting === 1, 'a record whose pid LIVES but whose socket is not served yet counts as «starting» (a CLI still starting — live, no inbox)', a);
  const sock = path.join(ROOT, 'served.sock'); const srv = net.createServer(() => { }); await new Promise((r) => srv.listen(sock, r));
  fs.writeFileSync(path.join(reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: CID(1), messagingSocketPath: sock, procStart, startedAt: Date.now() }));
  const b = PM.lookupPeer(CID(1), reg);
  ok(!!b.peer && b.starting === 0, '…once its socket is served: the record passes (live, its inbox open)', b);
  srv.close();
  const c = PM.lookupPeer(CID(2), reg);
  ok(c.peer === null && c.starting === 0 && c.candidates === 0, 'no record of the conversation: neither (not running there)', c);
}

/** the rig: the REAL ladder + park; a stand-in machine (its peerPost misses, its peerState says what it says) and machines list */
function rig(name, { state = { live: false, inbox: false }, held = () => false, mod = DELIVER } = {}) {
  const dataDir = path.join(ROOT, name); fs.mkdirSync(dataDir, { recursive: true });
  const c = { now: 1_790_000_000_000, timers: [] };
  const retryClock = { now: () => c.now, setTimeout: (fn, ms) => { const t = { at: c.now + Math.max(0, ms), fn }; c.timers.push(t); return t; }, clearTimeout: (t) => { const i = c.timers.indexOf(t); if (i >= 0) c.timers.splice(i, 1); } };
  const R = { c, asked: 0, posts: 0, wakes: [], logs: [], hooked: [] };
  const dm = { peerPost: async () => { R.posts++; return { ok: false, reason: NO_INBOX }; }, peerState: typeof state === 'function' ? state : async () => { R.asked++; return state; } };
  const hosts = { deviceBounded: async () => dm, device: async () => dm, get: () => ({ id: 'h-1', name: 'box-p' }), held };
  const sessions = new Map();
  R.deliver = mod.create({
    dataDir, activeSessions: sessions, serverSetting: () => undefined, retryClock, log: (...a) => R.logs.push(a.join(' ')), renderBatch: AR.renderMsgStash,
    peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) },
    getHosts: () => hosts, getConvIndex: () => ({ ownerHost: () => 'h-1' }), emitPeerCard: () => true,
    authorizeSpend: () => ({ ok: true, identity: { key: 'slot-1', name: 'Personal' }, hold: { id: 'h' } }), noteSpend: () => { }, releaseSpend: () => { },
  });
  R.deliver.onRetry?.((ev, cid, e, extra) => { if (ev === 'wake') R.wakes.push({ cid, ...extra }); });
  R.deliver.registerEndedWake((cid, e) => { R.hooked.push(cid); return new Promise(() => { }); });   // the line holds it (U1 owes the wake; U2 delivers it)
  R.view = SH.create({ activeSessions: sessions, getDeliver: () => R.deliver, getJobs: () => null, broadcastSessions: () => { }, renderMsgStash: AR.renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, log: { log() { }, warn() { } }, now: () => c.now, dataDir });
  R.fire = async () => { for (const t of c.timers.splice(0)) { c.now = Math.max(c.now, t.at); t.fn(); } await settle(); };
  /** a job's result for an ENDED owner, the jobs producer's order: the delivery, its words stashed FIRST, then the owed wake iff not running */
  R.result = async (cid, text) => {
    const r = await R.deliver.deliverToConversation(cid, text, { kind: 'notification', spendReason: 'job-notification', fromName: 'Background Work · nightly' });
    R.deliver.stashFor(cid, { source: 'agent', kind: 'notification', fromName: 'Background Work · nightly', text });
    const p = r && r.notRunning === true ? R.deliver.parkEndedWake(cid, { producer: 'jobs', spendReason: 'job-notification', kind: 'notification', fromName: 'Background Work · nightly', reason: 'done', meta: { jobId: 'jb-n', jobName: 'nightly', wake: 'result' } }) : null;
    return { r, p };
  };
  return R;
}
const DSRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');

console.log('② a conversation that ENDED on the paired machine: «not running» on its reply, ONE wake owed');
{
  const X = CID(10);
  const R = rig('ended');
  const { r, p } = await R.result(X, 'nightly report finished');
  ok(R.posts === 1 && R.asked === 1 && r.notRunning === true && r.remoteEnded === true && !!p && p.parked === true && R.deliver.endedEntries(X).length === 1,
    'the machine says the conversation runs nowhere there: the remote miss is typed «not running» and the conversation is owed ONE wake', { r, p, asked: R.asked });
  const NOASK = mutantCopies('peer-state-never-asked', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "          const there = r && /no live inbox/.test(String(r.reason || '')) ? await remoteStateOf(dm, cid, hid) : undefined;", "          const there = undefined;", 'never-asked'), 'never-asked');
  const C = rig('ended-red', { mod: NOASK });
  const rc = await C.result(X, 'nightly report finished');
  ok(rc.r.notRunning !== true && rc.p === null && C.deliver.endedEntries(X).length === 0, '② RED CONTROL: today\'s untyped miss — no wake owed, the resume never comes (the words wait for a prompt nobody types)', rc.r);
}

console.log('③ a CLI still starting there: no wake owed');
{
  const X = CID(11);
  const R = rig('starting', { state: { live: true, inbox: false } });
  const { r, p } = await R.result(X, 'nightly report finished');
  ok(R.asked === 1 && r.notRunning !== true && p === null && R.deliver.endedEntries(X).length === 0, 'live there without its inbox yet (a CLI starting): never typed «not running», no wake (its next turn carries the words)', r);
  R.deliver.parkEndedWake(X, { producer: 'jobs', spendReason: 'job-notification', kind: 'notification', reason: 'done', meta: { jobId: 'jb-n' } });
  ok(R.deliver.endedEntries(X).length === 0, '…and the park reads it as live (ownerHostOf\'s «reachable», not contradicted by its machine)', {});
}

console.log('④ an OLDER agent is never asked; the person reads why');
{
  // the REAL client's gate: an agent whose hello has no peer-state is never sent the op (an unknown op hangs)
  let sent = 0;
  const old = await DeviceManager.prototype.peerState.call({ helloInfo: () => ({ capabilities: ['probe', 'peer-post'] }), _request: async () => { sent++; return {}; } }, CID(12));
  const neu = await DeviceManager.prototype.peerState.call({ helloInfo: () => ({ capabilities: ['probe', 'peer-post', 'peer-state'] }), _request: async (m) => { sent++; return { live: false, inbox: false, op: m.op }; } }, CID(12));
  ok(old === null && neu && neu.live === false && sent === 1, 'the client sends peer-state ONLY to an agent whose hello advertises it — an older one answers null, asked nothing', { old, neu, sent });
  const CSRC = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  const ASKS = mutantCopies('peer-state-asks-all', REPO).load('src/agentd/client.js', anchored(CSRC, "    if (!info || !Array.isArray(info.capabilities) || !info.capabilities.includes('peer-state')) return null;\n    const r = await this._request({ op: 'peer-state'", "    const r = await this._request({ op: 'peer-state'", 'asks-all'), 'asks-all');
  sent = 0;
  await ASKS.DeviceManager.prototype.peerState.call({ helloInfo: () => ({ capabilities: ['probe'] }), _request: async () => { sent++; return {}; } }, CID(12));
  ok(sent === 1, '④ RED CONTROL: the client asking regardless — an older agent sent an op it does not know (it hangs)', { sent });
  // the ladder over an older agent: today's road, said ONCE, the person reads why
  const X = CID(13), Y = CID(14);
  const R = rig('older', { state: async () => null });
  const a = await R.result(X, 'first'), b = await R.result(Y, 'second');
  const w = R.view.waitingAll();
  ok(a.r.notRunning !== true && a.p === null && R.logs.filter((l) => /its device agent is older/.test(l)).length === 1 && !!w[X] && w[X].code === 'agent_older' && w[X].n === 1,
    'an older agent: today\'s road (stashed, no wake), said ONCE per machine — and the row tells the person why («its device agent is older: update it»)', { logs: R.logs.filter((l) => /older/.test(l)), w: w[X] });
}

console.log('⑤ a HELD machines list: nothing parked, nothing ended');
{
  const X = CID(15);
  let heldNow = false;
  const run = async (mod) => {
    heldNow = false;
    const name = 'held-' + (mod === DELIVER ? 'a' : 'b');
    const R1 = rig(name, { held: () => heldNow, mod });
    await R1.result(X, 'nightly report finished');   // owed while the list reads (durable on disk)
    const owed = R1.deliver.endedEntries(X).length;
    // A HUB RESTART over the same data while the list is HELD: what the machine said is in memory only (gone); the owed wake is on disk
    heldNow = true;
    const R2 = rig(name, { held: () => heldNow, mod });
    const parkedHeld = R2.deliver.parkEndedWake(CID(16), { producer: 'jobs', spendReason: 'job-notification', kind: 'notification', reason: 'done', meta: { jobId: 'jb-m' } });
    await R2.fire();   // the attempt runs while the list is held
    return { owed, parkedHeld, after: R2.deliver.endedEntries(X).length, running: R2.wakes.filter((w) => w.cid === X && w.outcome === 'running').length };
  };
  const g = await run(DELIVER);
  ok(g.owed === 1 && g.parkedHeld.parked === false && g.parkedHeld.held === true && g.after === 1 && g.running === 0,
    'while the machines list is HELD: a new wake is not parked (unknown), and the owed one is NOT ended — it waits for the read', g);
  const NOHOLD = mutantCopies('peer-state-held-ends', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "    if (hostsHeld() && !localSessionFor(cid)) { for (const e of [...ends, ...waiting]) e.nextAt = clock.now() + 30e3;", "    if (false) { for (const e of [...ends, ...waiting]) e.nextAt = clock.now() + 30e3;", 'held-ends'), 'held-ends');
  const gr = await run(NOHOLD);
  ok(gr.after === 0 && gr.running === 1, '⑤ RED CONTROL: a held list taken for «reachable» — the owed wake ENDS «running» with nobody to carry the words (bl-jobs\' sentence)', gr);
}

report();
