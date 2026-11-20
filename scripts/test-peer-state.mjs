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
//   U2 — THE HAND-OVER WAITS THERE (peer-post inboxWaitMs behind «peer-post-wait»):
//   ⑥ the machine's own bounded poll of its registry folder: found when the record appears, ended at its bound (≤ 60 s), ended when
//      the link is destroyed — RED CONTROL: no link look
//   ⑦ the client sends the wait only to an agent that keeps it, its request timer past it — RED CONTROL: sent to every agent
//   ⑧ THE RACE (the stall in its window: the record comes only after the post left the hub): ONE frame, one authorization, one
//      charge — RED CONTROL: no wait («no live inbox»); a wait that runs out charges nothing
//   ⑨ the wake's hand-over hands its bound to a remote session and says the machine's miss; the words keep waiting
//   ROUND w00h341sv: ⑤ a LOCAL conversation under a held list is still parked (RED: the hold for every cid); ⑩ the agent runs THESE
//      bodies (RED: its wait removed), an unreadable registry is an error the hub keeps unknown (RED: read as empty); ⑪ the ten-minute
//      memory cleared by a landed post and expired (RED: kept); ⑫ peer-state alone counts as older (RED: asked), its word leaves on update
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
function rig(name, { state = { live: false, inbox: false }, held = () => false, mod = DELIVER, post = null, owner = () => 'h-1', hello = null } = {}) {
  const dataDir = path.join(ROOT, name); fs.mkdirSync(dataDir, { recursive: true });
  const c = { now: 1_790_000_000_000, timers: [] };
  const retryClock = { now: () => c.now, setTimeout: (fn, ms) => { const t = { at: c.now + Math.max(0, ms), fn }; c.timers.push(t); return t; }, clearTimeout: (t) => { const i = c.timers.indexOf(t); if (i >= 0) c.timers.splice(i, 1); } };
  const R = { c, asked: 0, posts: 0, wakes: [], logs: [], hooked: [], spend: { auth: 0, note: 0, release: 0 }, sent: [] };
  const dm = { peerPost: async (a) => { R.posts++; R.sent.push(a); return post ? post(a) : { ok: false, reason: NO_INBOX }; }, peerState: typeof state === 'function' ? state : async () => { R.asked++; return state; } };
  if (hello) dm.helloInfo = () => ({ capabilities: hello });
  const hosts = { deviceBounded: async () => dm, device: async () => dm, get: () => ({ id: 'h-1', name: 'box-p' }), held };
  const sessions = new Map();
  R.deliver = mod.create({
    dataDir, activeSessions: sessions, serverSetting: () => undefined, retryClock, log: (...a) => R.logs.push(a.join(' ')), renderBatch: AR.renderMsgStash,
    peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) },
    getHosts: () => hosts, getConvIndex: () => ({ ownerHost: (cid) => owner(cid) }), emitPeerCard: () => true,
    authorizeSpend: () => { R.spend.auth++; return { ok: true, identity: { key: 'slot-1', name: 'Personal' }, hold: { id: 'h' } }; }, noteSpend: () => { R.spend.note++; }, releaseSpend: () => { R.spend.release++; },
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
  const NOHOLD = mutantCopies('peer-state-held-ends', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "    if (hostsHeld() && !localSessionFor(cid) && ownerHostOf(cid)) { for (const e of [...ends, ...waiting]) e.nextAt = clock.now() + 30e3;", "    if (false) { for (const e of [...ends, ...waiting]) e.nextAt = clock.now() + 30e3;", 'held-ends'), 'held-ends');
  const gr = await run(NOHOLD);
  ok(gr.after === 0 && gr.running === 1, '⑤ RED CONTROL: a held list taken for «reachable» — the owed wake ENDS «running» with nobody to carry the words (bl-jobs\' sentence)', gr);
  // round w00h341sv MUST 1: the hold makes only a REMOTE owner unknown — a conversation THIS machine's index calls local is parked as
  // before under a held list (at the release the owner reader answered «none» for it) — RED CONTROL: the held branch for every cid
  const L = CID(17);
  const RL = rig('held-local', { held: () => true, owner: () => 'local' });
  const pl = RL.deliver.parkEndedWake(L, { producer: 'jobs', spendReason: 'job-notification', kind: 'notification', reason: 'done', meta: { jobId: 'jb-l' } });
  ok(pl.parked === true && pl.held !== true && RL.deliver.endedEntries(L).length === 1, 'a held machines list: a LOCAL ended conversation (the index calls it local) is still owed its wake — parked as at the release', pl);
  const PARK = "    if (hostsHeld() && !localSessionFor(cid) && ownerHostOf(cid)) return { parked: false, live: true, held: true };";
  const ALLHELD = mutantCopies('peer-state-held-local', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, PARK, "    if (hostsHeld() && !localSessionFor(cid)) return { parked: false, live: true, held: true };", 'held-for-every-cid'), 'held-for-every-cid');
  const RR = rig('held-local-red', { held: () => true, owner: () => 'local', mod: ALLHELD });
  const pr = RR.deliver.parkEndedWake(L, { producer: 'jobs', spendReason: 'job-notification', kind: 'notification', reason: 'done', meta: { jobId: 'jb-l' } });
  ok(pr.parked === false && pr.held === true && RR.deliver.endedEntries(L).length === 0, '⑤ RED CONTROL: the held branch for every conversation — a LOCAL ended conversation\'s wake is never parked (its words sit in the stash for good)', pr);
}

// ── U2: THE HAND-OVER WAITS THERE (peer-post inboxWaitMs, capability «peer-post-wait») ─────────────────────────────────────────
const MSRC = fs.readFileSync(path.join(REPO, 'src/peer-messaging.js'), 'utf8');
const st0 = fs.readFileSync('/proc/self/stat', 'utf8'), PROC_START = st0.slice(st0.lastIndexOf(')') + 2).split(' ')[19];
const recordOf = (reg, cid, sock) => fs.writeFileSync(path.join(reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: cid, messagingSocketPath: sock, procStart: PROC_START, startedAt: Date.now() }));
/** a stand-in MACHINE over a planted registry that runs THE DEVICE AGENT'S OWN peer-post body (src/peer-messaging.js peerPostAnswer —
 *  src/agentd/agentd.js calls the same function, pinned below), the client's `waitMs` handed on as the agent's `inboxWaitMs` — its
 *  record is written only at `plantAt` (the wait's nth nap: AFTER the post left the hub) */
function machine(reg, sock, cid, { plantAt = 2, mod = PM } = {}) {
  const M = { naps: [] };
  M.sleep = async (ms) => { M.naps.push(ms); if (M.naps.length === plantAt) recordOf(reg, cid, sock); };
  M.post = async ({ cid: c, text, waitMs = 0 }) => mod.peerPostAnswer({ cid: c, text, inboxWaitMs: waitMs }, { dir: reg, sleep: M.sleep });
  return M;
}
/** an inbox socket that counts the frames carrying `needle` */
async function inbox(name, needle) {
  const sock = path.join(ROOT, name + '.sock'); const I = { sock, seen: '' };
  I.srv = net.createServer((c) => c.on('data', (d) => { I.seen += d.toString('utf8'); }));
  await new Promise((r) => I.srv.listen(sock, r));
  I.count = () => (I.seen.match(new RegExp(needle, 'g')) || []).length;
  I.settled = async () => { for (let i = 0; i < 100 && !I.count(); i++) await new Promise((r) => setTimeout(r, 10)); };
  return I;
}

console.log('⑥ the machine\'s own bounded wait (src/peer-messaging.js waitForPeer)');
{
  const reg = path.join(ROOT, 'reg6'); fs.mkdirSync(reg, { recursive: true });
  const I = await inbox('w6', 'x');
  const M = machine(reg, I.sock, CID(20));
  const w = await PM.waitForPeer(CID(20), { waitMs: 60000, dir: reg, sleep: M.sleep });
  ok(!!w.peer && w.waited === 300 && M.naps.join(',') === '100,200' && w.cut === false, 'a record written DURING the wait is found at the next look — a doubling poll of the machine\'s own folder (100 ms, 200 ms)', { waited: w.waited, naps: M.naps });
  const n2 = []; const none = await PM.waitForPeer(CID(21), { waitMs: 2500, dir: reg, sleep: async (ms) => { n2.push(ms); } });
  ok(none.peer === null && none.waited === 2500 && n2.join(',') === '100,200,400,800,1000', 'no record: the wait ends at its bound (2.5 s = 100 + 200 + 400 + 800 + 1000), never past it', { waited: none.waited, naps: n2 });
  const n3 = []; const capped = await PM.waitForPeer(CID(21), { waitMs: 600000, dir: reg, sleep: async (ms) => { n3.push(ms); } });
  ok(capped.waited === PM.PEER_WAIT_MAX_MS && PM.PEER_WAIT_MAX_MS === 60000 && n3.reduce((a, b) => a + b, 0) === 60000, 'a wait asked for 10 min is held to the machine\'s own bound (60 s)', { waited: capped.waited });
  const n4 = []; let alive = true;
  const cut = await PM.waitForPeer(CID(22), { waitMs: 60000, dir: reg, alive: () => alive, sleep: async (ms) => { n4.push(ms); if (n4.length === 2) alive = false; } });
  ok(cut.cut === true && cut.peer === null && cut.waited === 300 && n4.length === 2, 'the link DESTROYED mid-wait: the wait ends at its next look (cut — nobody to answer, nothing posted)', cut);
  const ALIVE = "    if (!alive()) return { peer: null, waited, cut: true, why: 'the asker went' };\n";
  const NOCUT = mutantCopies('peer-wait-no-cut', REPO).load('src/peer-messaging.js', anchored(MSRC, ALIVE, '', 'no-alive-look'), 'no-alive-look');
  let a5 = true; const n5 = [];
  const red = await NOCUT.waitForPeer(CID(22), { waitMs: 3000, dir: reg, alive: () => a5, sleep: async (ms) => { n5.push(ms); if (n5.length === 2) a5 = false; } });
  ok(red.cut !== true && red.waited === 3000, '⑥ RED CONTROL: without the link look the wait runs to its bound after its asker went (a held slot for nobody)', red);
  I.srv.close();
}

console.log('⑦ the client sends the wait ONLY to an agent that keeps it; the request\'s own timer covers it');
{
  const CSRC = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  const callOf = (DM) => async (caps, waitMs, sent) => DM.prototype.peerPost.call({ connect: async () => ({ info: { capabilities: caps } }), _request: async (m) => { sent.push(m); return { ok: true, id: 1, op: 'peer-post-result' }; } }, { cid: CID(23), text: 't', waitMs });
  const call = callOf(DeviceManager), sent = [];
  await call(['peer-post', 'peer-post-wait'], 60000, sent); await call(['peer-post'], 60000, sent); await call(['peer-post', 'peer-post-wait'], 0, sent); await call(['peer-post', 'peer-post-wait'], 600000, sent);
  ok(sent[0].inboxWaitMs === 60000 && sent[0].timeoutMs === 75000 && !('waitMs' in sent[0]) && !('inboxWaitMs' in sent[1]) && sent[1].timeoutMs === 15000 && !('inboxWaitMs' in sent[2]) && sent[3].inboxWaitMs === 60000,
    'the wait goes ONLY to an agent whose hello has peer-post-wait (an older one posts at once, as today), bounded at 60 s, its request timer 15 s past it — and never named `waitMs` (the request maker\'s own bound reads that first)', sent.map((m) => ({ w: m.inboxWaitMs, t: m.timeoutMs })));
  const GATE = " && conn.info?.capabilities?.includes?.('peer-post-wait') ? Math.min(60000, Math.floor(waitMs)) : 0;";
  const ALL = mutantCopies('peer-post-wait-to-all', REPO).load('src/agentd/client.js', anchored(CSRC, GATE, " ? Math.min(60000, Math.floor(waitMs)) : 0;", 'wait-to-every-agent'), 'wait-to-every-agent');
  const sentRed = []; await callOf(ALL.DeviceManager)(['peer-post'], 60000, sentRed);
  ok(sentRed[0].inboxWaitMs === 60000, '⑦ RED CONTROL: the wait sent regardless of the capability — an older agent ignores it and posts before the inbox opens', sentRed[0]);
}

console.log('⑧ THE RACE: the hand-over posts while the resumed CLI is still starting there — the machine waits, ONE frame, ONE charge');
{
  const X = CID(30);
  const reg = path.join(ROOT, 'reg8'); fs.mkdirSync(reg, { recursive: true });
  const I = await inbox('w8', 'the nightly report');
  const M = machine(reg, I.sock, X);
  const R = rig('race', { post: M.post });
  const r = await R.deliver.deliverToConversation(X, 'the nightly report', { kind: 'notification', spendReason: 'job-notification', fromName: 'Background Work · nightly', inboxWaitMs: 60000 });
  await I.settled();
  ok(r.ok === true && r.lane === 'remote-message' && R.sent[0].waitMs === 60000 && M.naps.length === 2 && I.count() === 1 && R.spend.auth === 1 && R.spend.note === 1,
    'the record appears only AFTER the post left the hub: the machine waits for it, posts ONCE — one frame on its inbox, one authorization, one charge', { r, naps: M.naps, frames: I.count(), spend: R.spend });
  // RED: the ladder without the wait — the post goes at once, into a machine whose CLI has not opened its inbox yet
  const NOWAIT = mutantCopies('peer-post-no-wait', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, ", ...(waitMs ? { waitMs } : {}) });\n", " });\n", 'ladder-without-the-wait'), 'ladder-without-the-wait');
  const reg2 = path.join(ROOT, 'reg8b'); fs.mkdirSync(reg2, { recursive: true });
  const I2 = await inbox('w8b', 'the nightly report'); const M2 = machine(reg2, I2.sock, X);
  const C = rig('race-red', { post: M2.post, mod: NOWAIT });
  const rc = await C.deliver.deliverToConversation(X, 'the nightly report', { kind: 'notification', spendReason: 'job-notification', fromName: 'Background Work · nightly', inboxWaitMs: 60000 });
  ok(rc.ok !== true && /no live inbox/.test(String(rc.reason || '')) && I2.count() === 0 && C.spend.note === 0, '⑧ RED CONTROL: no wait — «no live inbox», nothing delivered (the words wait for a turn nobody starts)', rc);
  // a wait that RUNS OUT: inbox_not_open, nothing posted, NOTHING charged (the hold given back)
  const reg3 = path.join(ROOT, 'reg8c'); fs.mkdirSync(reg3, { recursive: true });
  const I3 = await inbox('w8c', 'the nightly report'); const M3 = machine(reg3, I3.sock, X, { plantAt: Infinity });
  const T = rig('race-timeout', { post: M3.post });
  const rt = await T.deliver.deliverToConversation(X, 'the nightly report', { kind: 'notification', spendReason: 'job-notification', fromName: 'Background Work · nightly', inboxWaitMs: 60000 });
  ok(rt.ok === false && rt.code === 'inbox_not_open' && I3.count() === 0 && T.spend.auth === 1 && T.spend.note === 0 && T.spend.release === 1,
    'a wait that runs out on the machine: inbox_not_open, nothing posted — one authorization, NO charge, its hold given back', { rt, spend: T.spend });
  for (const x of [I, I2, I3]) x.srv.close();
}

console.log('⑨ the wake\'s hand-over carries the wait for a session on a paired machine, and says the machine\'s miss');
{
  const WK = require(path.join(REPO, 'src/server/delivery-wake.js'));
  const ask = WK.inboxOfOver({ deliver: () => ({ peerReachable: () => true }), activeSessions: new Map([['s-remote', { host: 'h-1', backend: 'claude', socketPath: '/nope' }], ['s-local', { backend: 'claude', pty: {}, socketPath: '/nope' }]]), registryIds: () => new Set() });
  const rem = ask(CID(31), 's-remote'), loc = ask(CID(31), 's-local');
  ok(rem.open === true && rem.remote === true && loc.open !== true, 'a resumed session on a PAIRED machine reads «open, remote» at once (the hub never polls that registry); a local one still waits for its own registry', { rem, loc });
  const X = CID(32);
  const reg = path.join(ROOT, 'reg9'); fs.mkdirSync(reg, { recursive: true });
  const I = await inbox('w9', 'nightly report finished');
  const M = machine(reg, I.sock, X);
  const R = rig('handover', { post: M.post });
  await R.result(X, 'nightly report finished');   // the words stashed (and a wake owed: the machine said it ended there)
  const claim = R.view.claimForWake(X);
  const ho = await R.view.handOverWake(X, claim, { reason: 'job-notification', inboxWaitMs: 60000 });
  await I.settled();
  ok(claim.ok && ho.ok === true && R.sent[R.sent.length - 1].waitMs === 60000 && I.count() === 1, 'the wake\'s hand-over hands the wait to the machine: the stashed words land ONCE after its CLI opened its inbox', { ho, frames: I.count() });
  const reg2 = path.join(ROOT, 'reg9b'); fs.mkdirSync(reg2, { recursive: true });
  const M2 = machine(reg2, I.sock, CID(33), { plantAt: Infinity });
  const R2 = rig('handover-timeout', { post: M2.post });
  await R2.result(CID(33), 'never lands');
  const before = R2.deliver.stashCount(CID(33));
  const ho2 = await R2.view.handOverWake(CID(33), R2.view.claimForWake(CID(33)), { reason: 'job-notification', inboxWaitMs: 60000 });
  ok(ho2.ok === false && ho2.code === 'inbox_not_open' && R2.deliver.stashCount(CID(33)) === before && before >= 1, 'the machine\'s wait ran out: the hand-over says inbox_not_open and the words keep waiting (nothing lost, nothing charged)', { ho2, before });
  const WSRC = fs.readFileSync(path.join(REPO, 'src/server/delivery-wake.js'), 'utf8');
  ok(WSRC.includes('...(inbox.remote ? { inboxWaitMs: INBOX_WAIT_MS } : {})') && WSRC.includes("if (ho && ho.code === 'inbox_not_open') {"), 'the wake line passes its own bound (INBOX_WAIT_MS) to a remote hand-over and words the machine\'s miss as its own (source pin)');
  I.srv.close();
}

console.log('⑩ the device agent runs THESE bodies; an unreadable registry is unknown, never «nothing lives» (round w00h341sv)');
{
  const ASRC = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  ok(ASRC.includes("require('./../peer-messaging.js').peerStateOf(msg.cid)") && ASRC.includes("require('./../peer-messaging.js').peerPostAnswer({ cid: msg.cid, text: msg.text, inboxWaitMs: msg.inboxWaitMs }, { alive: () => !mux._dead })"),
    'the agent\'s peer-state and peer-post handlers call the SHARED bodies these legs run — never a copy (source pin)');
  // RED: the wait taken out of the agent's own body — ⑧'s race is lost on the machine itself
  const X = CID(40);
  const NW = mutantCopies('peer-post-answer-no-wait', REPO).load('src/peer-messaging.js', anchored(MSRC, "  const waitMs = Number.isFinite(inboxWaitMs) && inboxWaitMs > 0 ? inboxWaitMs : 0;\n", "  const waitMs = 0;\n", 'answer-without-wait'), 'answer-without-wait');
  const reg = path.join(ROOT, 'reg10'); fs.mkdirSync(reg, { recursive: true });
  const I = await inbox('w10', 'the nightly report');
  const R = rig('agent-no-wait', { post: machine(reg, I.sock, X, { mod: NW }).post });
  const r = await R.deliver.deliverToConversation(X, 'the nightly report', { kind: 'notification', spendReason: 'job-notification', fromName: 'Background Work · nightly', inboxWaitMs: 60000 });
  ok(r.ok !== true && I.count() === 0 && R.spend.note === 0, '⑩ RED CONTROL: the agent\'s own body without its wait — «no live inbox», nothing delivered (the race ⑧ wins is lost)', r);
  I.srv.close();
  // an unreadable registry folder: an ERROR (the hub keeps unknown), a missing one: nothing lives
  const notDir = path.join(ROOT, 'reg10-a-file'); fs.writeFileSync(notDir, 'x');
  let threw = null; try { PM.peerStateOf(CID(41), { dir: notDir }); } catch (e) { threw = String(e.message); }
  const missing = PM.peerStateOf(CID(41), { dir: path.join(ROOT, 'no-such-registry') });
  ok(/its registry folder could not be read \(ENOTDIR\)/.test(threw || '') && missing.live === false && missing.inbox === false, 'a registry folder that cannot be READ answers an error (unknown); one that does not exist answers «nothing lives»', { threw, missing });
  const UNREAD = "    if (e && e.code !== 'ENOENT') return { peer: null, candidates: 0, stale: 0, unread: String(e.code || 'EIO'), why: `candidates: 0, stale: 0 (the registry could not be read: ${e.code || 'EIO'})` };\n";
  const EMPTY = mutantCopies('peer-state-unread-empty', REPO).load('src/peer-messaging.js', anchored(MSRC, UNREAD, '', 'unread-as-empty'), 'unread-as-empty');
  let redThrew = null, red = null; try { red = EMPTY.peerStateOf(CID(41), { dir: notDir }); } catch (e) { redThrew = e.message; }
  ok(redThrew === null && red && red.live === false, '⑩ RED CONTROL: an unreadable folder read as empty — «not running», the miss typed ended on a machine that could not look', red);
  // the hub over a machine whose answer is an error: unknown — no «not running», no wake
  const Y = CID(42);
  const H = rig('unread-hub', { state: async () => { throw new Error('its registry folder could not be read (EACCES)'); } });
  const h = await H.result(Y, 'nightly report finished');
  ok(h.r.notRunning !== true && h.p === null && H.deliver.endedEntries(Y).length === 0, '…and the hub reads that error as UNKNOWN: today\'s road (stashed, no wake), never «not running»', h.r);
}

console.log('⑪ the ten-minute memory of «ended there»: a post that lands clears it, and it expires');
{
  const X = CID(43), Y = CID(44);
  let landing = false;
  const meta2 = { producer: 'jobs', spendReason: 'job-notification', kind: 'notification', reason: 'done', meta: { jobId: 'jb-2' } };
  const life = async (mod) => {
    landing = false;
    const R = rig('memory-' + (mod === DELIVER ? 'a' : 'b'), { mod, post: async () => landing ? { ok: true, peerName: 'p' } : { ok: false, reason: NO_INBOX } });
    await R.result(X, 'first');   // its machine said it ended there: remembered, a wake owed
    landing = true; await R.deliver.deliverToConversation(X, 'a later message', { kind: 'notification', spendReason: 'job-notification' });   // …then a post LANDS
    const afterPost = R.deliver.parkEndedWake(X, meta2);
    landing = false; await R.result(Y, 'second');
    const before = R.deliver.parkEndedWake(Y, meta2);
    R.c.now += 10 * 60e3 + 1;   // past REMOTE_ENDED_MS
    const afterTtl = R.deliver.parkEndedWake(Y, { ...meta2, meta: { jobId: 'jb-3' } });
    return { afterPost, before, afterTtl };
  };
  const g = await life(DELIVER);
  ok(g.afterPost.live === true && g.afterPost.parked === false && g.before.parked === true && g.afterTtl.live === true && g.afterTtl.parked === false,
    'a post that LANDS clears «ended there» (it runs again: live); unlanded, the memory parks a wake, and past ten minutes it is forgotten (live again — the machine is asked anew)', g);
  const KEEP = mutantCopies('peer-state-memory-kept', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "          if (r && r.ok) remoteEnded.delete(cid);   // B-95fc U1: it runs there again\n", '', 'landed-post-keeps-ended'), 'landed-post-keeps-ended');
  const gr = await life(KEEP);
  ok(gr.afterPost.live !== true, '⑪ RED CONTROL: a landed post that does not clear the memory — a conversation running again there still reads «ended»', gr.afterPost);
}

console.log('⑫ an agent with peer-state but NOT peer-post-wait counts as older (its hand-over could not wait); updated, its word leaves');
{
  const X = CID(45);
  const half = rig('half-agent', { hello: ['peer-post', 'peer-state'] });
  const a = await half.result(X, 'x');
  const wa = half.view.waitingAll()[X];
  ok(half.asked === 0 && a.r.notRunning !== true && a.p === null && wa && wa.code === 'agent_older', 'an agent with peer-state alone is never asked and keeps today\'s road (no resume whose hand-over would race) — the row says «older»', { asked: half.asked, wa });
  const NOCAPS = mutantCopies('peer-state-half-asked', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "Array.isArray(caps) && !caps.includes('peer-post-wait') ? null : ", '', 'half-agent-asked'), 'half-agent-asked');
  const red = rig('half-agent-red', { hello: ['peer-post', 'peer-state'], mod: NOCAPS });
  const b = await red.result(X, 'x');
  ok(red.asked === 1 && b.r.notRunning === true && !!b.p, '⑫ RED CONTROL: the half agent asked — a wake owed whose hand-over cannot wait on that machine', { asked: red.asked });
  const full = rig('agent-updated', { hello: ['peer-post', 'peer-state', 'peer-post-wait'] });
  const both = await full.result(CID(46), 'y');
  ok(full.asked === 1 && both.r.notRunning === true && !!both.p, 'an agent with both is asked (the road of ②)', { asked: full.asked });
  // the «older» word LEAVES when the agent is updated (the same conversation; the agent now answers)
  const updated = async (mod) => {
    let answer = null;
    const U = rig('older-then-updated-' + (mod === DELIVER ? 'a' : 'b'), { mod, state: async () => answer });
    await U.result(CID(47), 'z');
    const was = (U.view.waitingAll()[CID(47)] || {}).code;
    answer = { live: false, inbox: false };
    await U.result(CID(47), 'z again');
    return { was, now: (U.view.waitingAll()[CID(47)] || {}).code || null };
  };
  const u = await updated(DELIVER);
  ok(u.was === 'agent_older' && u.now !== 'agent_older', 'once the agent answers peer-state (updated), the row no longer says «its device agent is older»', u);
  const STAY = mutantCopies('peer-state-older-stays', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "    else if (st) { const a = endedAnswers.get(cid); if (a && a.code === 'agent_older') endedAnswers.delete(cid); }", '', 'older-word-stays'), 'older-word-stays');
  const us = await updated(STAY);
  ok(us.now === 'agent_older', '⑫ RED CONTROL: the word never cleared — an updated agent\'s row still says it is older', us);
}

report();
