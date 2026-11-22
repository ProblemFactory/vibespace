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
//   FOLLOW-UP (主开发 r491): ⑬ an unreadable registry is said BY NAME — the wait stops at its first read (RED: polls its bound), the
//      hub's rung and hand-over carry registry_unread and its words, the journal says it once a machine (RED: at every delivery)
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
function rig(name, { state = { live: false, inbox: false }, held = () => false, mod = DELIVER, post = null, owner = () => 'h-1', hello = null, connect = null, link = null, dial = null, paired = () => true, store = null, noList = false } = {}) {
  const dataDir = path.join(ROOT, name); fs.mkdirSync(dataDir, { recursive: true });
  const c = { now: 1_790_000_000_000, timers: [] };
  const retryClock = { now: () => c.now, setTimeout: (fn, ms) => { const t = { at: c.now + Math.max(0, ms), fn }; c.timers.push(t); return t; }, clearTimeout: (t) => { const i = c.timers.indexOf(t); if (i >= 0) c.timers.splice(i, 1); } };
  const R = { c, asked: 0, posts: 0, wakes: [], logs: [], hooked: [], spend: { auth: 0, note: 0, release: 0 }, sent: [] };
  const dm = { peerPost: async (a) => { R.posts++; R.sent.push(a); return post ? post(a) : { ok: false, reason: NO_INBOX }; }, peerState: typeof state === 'function' ? state : async () => { R.asked++; return state; } };
  if (hello) dm.helloInfo = () => ({ capabilities: hello });
  // B-2566's remainder: `connect` = the bounded connect (it may throw: the machine did not answer), `link` = the list's own classifier
  // (hosts.linkState: never a probe), `dial` = the host record's dial facts (when it was last connected / disconnected)
  // r1645: a leg that needs a machine's PAIRING hands a REAL machines list (`store`, src/hosts.js on a scratch folder) — its get / held
  // are the store's own; only the machine's link (linkState) and its connect stay the rig's stand-ins
  const hosts = store ? Object.assign(store, { deviceBounded: connect || (async () => dm), device: async () => dm, ...(link ? { linkState: (id) => link(id) } : {}) })
    : { deviceBounded: connect || (async () => dm), device: async () => dm, get: () => { const pd = paired(); if (pd === 'throws') throw new Error('hosts.json could not be read'); return pd ? { id: 'h-1', name: 'box-p', ...(dial ? { dial: dial() } : {}) } : undefined; }, held, ...(link ? { linkState: (id) => link(id) } : {}) };
  R.dm = dm; R.store = store;
  const sessions = new Map();
  R.deliver = mod.create({
    dataDir, activeSessions: sessions, serverSetting: () => undefined, retryClock, log: (...a) => R.logs.push(a.join(' ')), renderBatch: AR.renderMsgStash,
    peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) },
    getHosts: () => (noList ? null : hosts), getConvIndex: () => ({ ownerHost: (cid) => owner(cid) }), emitPeerCard: () => true,
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
const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
/** THE REAL machines list on a scratch folder (r1645): `records` written as its hosts.json; `'held'` = a hosts.json that cannot be read
 *  (a folder in its place: the read fails ⇒ the store HOLDS, by its own law); the store reads it as it boots */
function realStore(tag, records) {
  const dir = path.join(ROOT, 'store-' + tag); fs.mkdirSync(dir, { recursive: true });
  if (records === 'held') fs.mkdirSync(path.join(dir, 'hosts.json'), { recursive: true }); else fs.writeFileSync(path.join(dir, 'hosts.json'), JSON.stringify({ hosts: records }));
  return new HostManager({ dataDir: dir });
}
const MACHINE_H1 = () => ({ id: 'h-1', name: 'box-p', transport: 'dial', deviceId: 'dev-h1', dial: { lastConnectAt: 1_790_000_000_000 - 5 * 3600e3, lastDisconnectAt: 1_790_000_000_000 - 2 * 3600e3 } });

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
  const KEEP = mutantCopies('peer-state-memory-kept', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "          if (r && r.ok) { remoteEnded.delete(cid); unreachable.delete(hid); clearAway(cid); }   // B-95fc U1: it runs there again (B-2566: its machine answered for it — the held wake's word)\n", "          if (r && r.ok) { unreachable.delete(hid); clearAway(cid); }\n", 'landed-post-keeps-ended'), 'landed-post-keeps-ended');
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

console.log('⑬ an UNREADABLE registry is said BY NAME: the wait stops at its first read, the hub carries the words, said once a machine (主开发 r491)');
{
  const notDir = path.join(ROOT, 'reg13-a-file'); fs.writeFileSync(notDir, 'x');
  const n1 = [];
  const w = await PM.waitForPeer(CID(50), { waitMs: 60000, dir: notDir, sleep: async (ms) => { n1.push(ms); } });
  ok(w.peer === null && w.unread === 'ENOTDIR' && w.waited === 0 && n1.length === 0, 'a registry folder that cannot be READ ends the wait at its FIRST look (no minute of polling), named by its error', w);
  const STOP = "    if (look.unread) return { peer: null, waited, cut: false, unread: look.unread, why: look.why };   // B-95fc follow-up: an unreadable registry ends the wait at once — said by name, never a minute of polling\n";
  const POLLS = mutantCopies('peer-wait-polls-unread', REPO).load('src/peer-messaging.js', anchored(MSRC, STOP, '', 'polls-the-unreadable'), 'polls-the-unreadable');
  const n2 = []; const wr = await POLLS.waitForPeer(CID(50), { waitMs: 3000, dir: notDir, sleep: async (ms) => { n2.push(ms); } });
  ok(wr.waited === 3000 && n2.length > 1, '⑬ RED CONTROL: without the stop the machine polls an unreadable folder for its whole bound', { waited: wr.waited, naps: n2.length });
  const a = await PM.peerPostAnswer({ cid: CID(50), text: 't', inboxWaitMs: 60000 }, { dir: notDir, sleep: async () => { } });
  const b = await PM.peerPostAnswer({ cid: CID(50), text: 't' }, { dir: notDir });
  ok(a.ok === false && a.code === 'registry_unread' && /its machine could not read its conversations' registry \(ENOTDIR\)/.test(a.reason) && b.code === 'registry_unread',
    'the agent\'s answer names it (registry_unread, the reason) — with a wait and without one; never «its inbox did not open», never «no live inbox»', { a, b });
  // the hub: the rung and the wake's hand-over carry the words; the journal says it ONCE a machine
  const X = CID(51), Y = CID(52);
  const R = rig('unread-handover', { post: async ({ cid: c, text, waitMs = 0 }) => PM.peerPostAnswer({ cid: c, text, inboxWaitMs: waitMs }, { dir: notDir, sleep: async () => { } }) });
  const r1 = await R.deliver.deliverToConversation(X, 'one', { kind: 'notification', spendReason: 'job-notification', inboxWaitMs: 60000 });
  await R.deliver.deliverToConversation(Y, 'two', { kind: 'notification', spendReason: 'job-notification', inboxWaitMs: 60000 });
  const said = R.logs.filter((l) => /its machine could not read its conversations' registry/.test(l));
  ok(r1.ok === false && r1.code === 'registry_unread' && r1.notRunning !== true && /could not read its conversations' registry/.test(r1.reason) && said.length === 1 && R.spend.note === 0,
    'the hub\'s rung carries the named code and its words (never «not running»), nothing charged — and the journal says it ONCE for that machine across two deliveries', { r1, said: said.length });
  R.deliver.stashFor(X, { source: 'agent', kind: 'notification', fromName: 'Background Work · nightly', text: 'nightly report' });
  const ho = await R.view.handOverWake(X, R.view.claimForWake(X), { reason: 'job-notification', inboxWaitMs: 60000 });
  ok(ho.ok === false && ho.code === 'registry_unread' && /could not read its conversations' registry/.test(ho.error) && R.deliver.stashCount(X) >= 1, 'the wake\'s hand-over says it by name and the words keep waiting', ho);
  const ONCE = mutantCopies('peer-unread-said-every-time', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "  const sayUnread = (hid, why) => { if (saidUnread.has(hid)) return; saidUnread.add(hid);", "  const sayUnread = (hid, why) => { saidUnread.add(hid);", 'said-every-time'), 'said-every-time');
  const RR = rig('unread-red', { mod: ONCE, post: async ({ cid: c, text, waitMs = 0 }) => PM.peerPostAnswer({ cid: c, text, inboxWaitMs: waitMs }, { dir: notDir, sleep: async () => { } }) });
  await RR.deliver.deliverToConversation(X, 'one', { kind: 'notification', spendReason: 'job-notification', inboxWaitMs: 60000 });
  await RR.deliver.deliverToConversation(Y, 'two', { kind: 'notification', spendReason: 'job-notification', inboxWaitMs: 60000 });
  ok(RR.logs.filter((l) => /could not read its conversations' registry/.test(l)).length === 2, '⑬ RED CONTROL: said at every delivery — the journal floods for one machine', {});
  const WSRC = fs.readFileSync(path.join(REPO, 'src/server/delivery-wake.js'), 'utf8');
  ok(WSRC.includes("if (ho && ho.code === 'registry_unread') {") && WSRC.includes("but its machine could not read its conversations' registry — the message waits for its next turn"), 'the wake line words the machine\'s unreadable registry as its own line (source pin)');
}


console.log('⑭ B-2566\'s remainder: a paired machine that CANNOT BE REACHED — not «live»; the park keeps what is owed, in order, until it replies');
{
  // THE LAW (主开发 r1277): a wake held for a machine that did not reply ends «running» ONLY on that machine's own word about THAT
  // conversation — a delivery that landed there, or its answer (peer-state: it runs ⇒ running; it ended ⇒ the resume line) — never on
  // the link's word alone and never on the absence of a mark; the hold stands from what is durable (the entry's `away`), read with the
  // link's state. Three scenes on stand-ins with a placed clock, each with its RED copy of the ladder.
  const X = CID(140);
  const OLD_HOLD = "    if (!localSessionFor(cid) && hostUnreachable(ownerHostOf(cid))) { for (const e of [...ends, ...waiting]) e.nextAt = clock.now() + 60e3; writeRetrySoon(); scheduleRetry(); return; }";   // de4ba0831's hold: the mark in memory, the link's word
  const LAW = "    if (held.length && !localSessionFor(cid)) { judgeAway(cid, held[0].away.hostId, [...ends, ...waiting]); return; }";
  const DURABLE = "    return h && linkOf(h.away.hostId) !== 'online' ? { hostId: h.away.hostId, since: Number(h.away.since) || null } : null;";
  const LINKS_WORD = mutantCopies('peer-state-links-word', REPO).load('src/server/conversation-deliver.js', anchored(anchored(DSRC, LAW, OLD_HOLD, 'the-links-word'), DURABLE, '    return null;', 'no-durable-hold'), 'the-links-word');
  /** one rig over `dir`: the machine shut (no handle, the list offline) unless `box` says otherwise; its answer = `state` */
  const machine = (name, mod, box, state) => {
    const R = rig(name, { mod, state, hello: box.hello || null, owner: () => (box.owner === undefined ? 'h-1' : box.owner), link: () => box.link, store: realStore(name, [MACHINE_H1()]), connect: async () => { if (box.gate) await box.gate; if (box.up) return R.dm; throw Object.assign(new Error('the machine did not answer within 6000 ms'), { code: 'connect_timeout' }); } });
    return R;
  };
  const facts = (R) => ({ owed: R.deliver.endedEntries(X).length, away: R.deliver.endedEntries(X).map((e) => !!e.away), hooked: R.hooked.length, running: R.wakes.filter((w) => w.cid === X && w.outcome === 'running').length, live: R.deliver.liveForWake(X) });

  // the park: no handle + the list says offline ⇒ typed «not running» + unreachable; ONE wake owed, carrying its `away` (durable)
  const box0 = { up: false, link: 'offline' };
  const R0 = machine('law-park', DELIVER, box0, { live: true, inbox: true });
  const { r, p } = await R0.result(X, 'nightly report finished');
  const ent = R0.deliver.endedEntries(X)[0];
  ok(r.notRunning === true && r.unreachable === true && r.hostId === 'h-1' && r.since === 1_790_000_000_000 - 2 * 3600e3 && p.parked === true && ent && ent.away && ent.away.hostId === 'h-1' && R0.deliver.liveForWake(X) === false && R0.posts === 0,
    'no handle + the list says offline ⇒ UNREACHABLE (silent since the dial facts\' disconnect); ONE wake owed, carrying `away` ON ITSELF (written with the entry); nothing posted', { r, parked: p, away: ent && ent.away });
  // held while away — and NO file write while only its next look moves (r1277 (1))
  const file = path.join(ROOT, 'law-park', 'msg-retry.json'), before = fs.statSync(file).mtimeMs;
  await new Promise((res) => setTimeout(res, 20));
  for (let i = 0; i < 4; i++) { R0.c.now += 61e3; await R0.fire(); }
  await new Promise((res) => setTimeout(res, 120));
  const heldF = facts(R0), after = fs.statSync(file).mtimeMs;
  ok(heldF.owed === 1 && heldF.hooked === 0 && heldF.running === 0 && heldF.live === false && after === before,
    'HELD while away (four looks, a minute apart): never the resume line, never «running» — and the park\'s file is NOT rewritten for a look that changes nothing durable', { ...heldF, fileWritten: after !== before });

  // SCENE 1 — A RESTART: a fresh ladder over the SAME park file, the link still offline ⇒ the wake still owed and held
  const restart = async (mod, tag) => {
    const box = { up: false, link: 'offline' };
    const A = machine('law-restart-' + tag, mod, box, { live: true, inbox: true });
    await A.result(X, 'nightly report finished');
    const B = machine('law-restart-' + tag, mod, box, { live: true, inbox: true });   // the same data folder: the next process
    for (let i = 0; i < 3; i++) { B.c.now += 61e3; await B.fire(); }
    return facts(B);
  };
  const s1 = await restart(DELIVER, 'g'), s1r = await restart(LINKS_WORD, 'r');
  ok(s1.owed === 1 && s1.away[0] === true && s1.hooked === 0 && s1.running === 0 && s1.live === false,
    'SCENE 1, A RESTART: the next process over the same park file, the list still offline ⇒ the wake is STILL owed and held (its `away` is durable) — never «running»', s1);
  ok(s1r.running === 1 && s1r.owed === 0, 'SCENE 1 RED: the hold read from memory and the link alone (a copy of the ladder) ⇒ the new process ends it «running» while the laptop is shut', s1r);

  // SCENE 2 — A FLAP: the link reads «online» for a moment inside the outage, the machine never answers ⇒ still held
  const flap = async (mod, tag) => {
    const box = { up: false, link: 'offline' };
    const F = machine('law-flap-' + tag, mod, box, { live: true, inbox: true });
    await F.result(X, 'nightly report finished');
    box.link = 'online';   // a dark wake: the link is up, the machine does not answer (no handle)
    F.c.now += 61e3; await F.fire(); await settle();
    box.link = 'offline';
    F.c.now += 61e3; await F.fire();
    return facts(F);
  };
  const s2 = await flap(DELIVER, 'g'), s2r = await flap(LINKS_WORD, 'r');
  ok(s2.owed === 1 && s2.running === 0 && s2.hooked === 0, 'SCENE 2, A FLAP: the link «online» for a moment, the machine silent ⇒ the wake is still owed and held (the link\'s word alone ends nothing)', s2);
  ok(s2r.running === 1, 'SCENE 2 RED: the link\'s word alone (a copy of the ladder) ⇒ the flap ends it «running»', s2r);

  // SCENE 3 — THE LAPTOP REBOOTED OVERNIGHT: the link returns, the machine answers that the conversation ENDED there ⇒ the resume line
  const rebooted = async (mod, tag, state) => {
    const box = { up: false, link: 'offline' };
    const M3 = machine('law-reboot-' + tag, mod, box, state);
    await M3.result(X, 'nightly report finished');
    box.link = 'online'; box.up = true;   // 08:00: the machine replies
    M3.c.now += 61e3; await M3.fire(); await settle(); await M3.fire(); await settle();
    return { ...facts(M3), asked: M3.asked };
  };
  const s3 = await rebooted(DELIVER, 'g', { live: false, inbox: false }), s3r = await rebooted(LINKS_WORD, 'r', { live: false, inbox: false });
  ok(s3.asked === 1 && s3.hooked === 1 && s3.running === 0, 'SCENE 3, A REBOOTED LAPTOP: at the reply the machine is ASKED about this conversation, answers it ENDED there ⇒ the RESUME LINE is asked (the results go out through it)', s3);
  ok(s3r.running === 1 && s3r.hooked === 0 && s3r.asked === 0, 'SCENE 3 RED: the link\'s word alone (a copy of the ladder) ⇒ «running» without asking, no resume: the results would wait for a typed prompt', s3r);
  const s4 = await rebooted(DELIVER, 'live', { live: true, inbox: true });
  ok(s4.asked === 1 && s4.running === 1 && s4.hooked === 0 && s4.owed === 0, '…and a machine that answers the conversation RUNS there ⇒ «running» on its own word (its next turn and the hand-over carry the words)', s4);

  // A PAIRING REMOVED (r1277 (6)): the list READ the machine gone ⇒ the held wake is refused BY NAME — never held for ever
  const boxU = { up: false, link: 'offline' };
  const U = machine('law-unpaired', DELIVER, boxU, { live: true, inbox: true });
  await U.result(X, 'nightly report finished');
  Promise.resolve(U.store.remove('h-1')).catch(() => { });   // a person unpairs it: the REAL store's own removal (its get now throws «host not found»)
  boxU.link = 'unknown';
  U.c.now += 61e3; await U.fire();
  const uw = U.wakes.filter((w) => w.cid === X);
  ok(U.deliver.endedEntries(X).length === 0 && uw.length === 1 && uw[0].outcome === 'refused' && uw[0].code === 'unpaired' && /no longer paired/.test(uw[0].why || ''),
    'A PAIRING REMOVED: the held wake is refused by name (code unpaired — «its machine is no longer paired — open the conversation to read what waits for it»)', uw);

  // THE LAW, COMPLETED (r1397 (1)): a machine that CANNOT give its word takes the release's road once the link has stood a bound, and
  // the row says why — RED for each: the tip before this cure (9e93dc0c9) held it for ever
  const release = async (mod, tag, kind) => {
    const box = { up: false, link: 'offline', ...(kind === 'older' ? { hello: ['peer-state'] } : {}) };   // an older agent: no peer-post-wait ⇒ never asked
    const M = machine('law-wordless-' + kind + '-' + tag, mod, box, { live: false, inbox: false });
    await M.result(X, 'nightly report finished');
    if (kind === 'older') { box.link = 'online'; box.up = true; } else box.link = 'unknown';   // an ssh-only machine: its link reads «unknown» once its memo ends
    M.c.now += 61e3; await M.fire(); await settle();
    const early = facts(M);
    M.c.now += 11 * 60e3; await M.fire(); await settle(); await M.fire(); await settle();
    return { early, late: facts(M), answer: M.deliver.endedAnswerOf ? M.deliver.endedAnswerOf(X) : null, asked: M.asked };
  };
  const WORDLESS_OLDER = mutantCopies('peer-state-older-forever', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "      if (st === null) { if (!wordlessSince.has(cid)) { wordlessSince.set(cid, clock.now()); if (wordlessSince.size > 500) wordlessSince.delete(wordlessSince.keys().next().value); } return; }   // an older agent: it cannot say — the bound starts", "      if (st === null) return;", 'older-held-for-ever'), 'older-held-for-ever');
  const WORDLESS_LINK = mutantCopies('peer-state-nolink-forever', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "    if (link === 'unknown') { const from = Math.max(...all.map((e) => Number(e.away && (e.away.at || e.away.since)) || Number(e.firstAt) || 0)); if (from && clock.now() - from >= REMOTE_ENDED_MS) releaseWordless(cid, all, 'no_link'); return; }", "    if (link === 'unknown') return;", 'nolink-held-for-ever'), 'nolink-held-for-ever');
  const o = await release(DELIVER, 'g', 'older'), or = await release(WORDLESS_OLDER, 'r', 'older');
  ok(o.early.owed === 1 && o.early.running === 0 && o.late.owed === 0 && o.late.running === 1 && o.late.hooked === 0 && o.answer && o.answer.code === 'agent_older',
    'an OLDER agent (no such op: never asked) with its link back: held a bound, then the release\'s road — «running», and the row says why (agent_older: update it)', { early: o.early, late: o.late, answer: o.answer });
  ok(or.late.owed === 1 && or.late.running === 0, '(1) RED: the tip before this cure (a copy) ⇒ an older agent\'s wake is held FOR EVER while its machine is online', or.late);
  const n = await release(DELIVER, 'g', 'nolink'), nr = await release(WORDLESS_LINK, 'r', 'nolink');
  ok(n.early.owed === 1 && n.late.owed === 0 && n.late.running === 1 && n.answer && n.answer.code === 'no_link' && n.asked === 0,
    'a machine with NO device link (its link «unknown»: never asked): the bound from the hold\'s start, then the release\'s road — the row says why (no_link)', { late: n.late, answer: n.answer });
  ok(nr.late.owed === 1 && nr.late.running === 0, '(1) RED: the tip before this cure (a copy) ⇒ an ssh-only machine\'s wake is held FOR EVER', nr.late);

  // (2) «THE LIST CANNOT SAY» IS NOT «UNPAIRED»: a read of the machines list that THROWS keeps the wake — RED: the cure's first check
  const cannotSay = async (mod, tag) => {
    const box = { up: false, link: 'offline' };
    const C = machine('law-cannot-say-' + tag, mod, box, { live: true, inbox: true });
    await C.result(X, 'nightly report finished');
    Object.defineProperty(C.store, '_state', { configurable: true, get() { throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } });   // the REAL store's read fails some other way
    C.c.now += 61e3; await C.fire();
    return { owed: C.deliver.endedEntries(X).length, refused: C.wakes.filter((w) => w.cid === X && w.code === 'unpaired').length };
  };
  const PAIR_CATCH = "    catch (e) { return e && e.code === 'host_not_found' ? { reply: 'gone' } : UNKNOWN; }";
  const OLD_PAIRED = mutantCopies('peer-state-guessed-unpaired', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, PAIR_CATCH, "    catch { return { reply: 'gone' }; }", 'any-throw-is-gone'), 'any-throw-is-gone');
  const cs = await cannotSay(DELIVER, 'g'), csr = await cannotSay(OLD_PAIRED, 'r');
  ok(cs.owed === 1 && cs.refused === 0, '(2) a machines list whose read THROWS cannot say — the wake is KEPT (never «unpaired»: that turns its notices for good)', cs);
  ok(csr.refused === 1 && csr.owed === 0, '(2) RED: every throw read as «gone» (a copy) ⇒ a list that could not be read refuses the wake as «unpaired»', csr);

  // (4) an «ended» answer landing DURING A STOP hands nothing to the resume line — RED: the stop's check removed
  const stopped = async (mod, tag) => {
    const box = { up: false, link: 'offline' };
    const S = machine('law-stop-' + tag, mod, box, { live: false, inbox: false });
    await S.result(X, 'nightly report finished');
    box.link = 'online'; box.up = true;
    let answer; box.gate = new Promise((res) => { answer = res; });   // the machine's answer is held until after the stop
    S.c.now += 61e3; await S.fire();   // the ask leaves …
    S.deliver.closeRetries();          // … the server stops …
    answer(); await settle(); await settle();   // … and only then the machine answers «ended»
    return { hooked: S.hooked.length, asked: S.asked };
  };
  const NOSTOP = mutantCopies('peer-state-ask-ignores-stop', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "      if (retryClosed) return;   // r1397 (4): an answer landing during a stop hands nothing to the resume line\n", '', 'ask-ignores-stop'), 'ask-ignores-stop');
  const st = await stopped(DELIVER, 'g'), str = await stopped(NOSTOP, 'r');
  ok(st.asked === 1 && st.hooked === 0, '(4) the machine\'s «ended» landing during a stop hands nothing to the resume line', st);
  ok(str.hooked === 1, '(4) RED: the stop\'s check removed (a copy) ⇒ the resume line is asked after the stop', str);

  // (5) «silent since» is the OUTAGE's start: a flap (the dial's disconnect moves) never moves it
  const boxF = { up: false, link: 'offline' };
  const F5 = machine('law-since', DELIVER, boxF, { live: true, inbox: true });
  await F5.result(X, 'nightly report finished');
  const sinceA = F5.deliver.machineAwayOf('h-1');
  F5.store.get('h-1').dial.lastDisconnectAt = 1_790_000_000_000 - 60e3;   // a two-second dark wake: the record's dial facts now say it disconnected a minute ago
  await F5.deliver.deliverToConversation(CID(143), 'another result', { kind: 'notification', spendReason: 'job-notification' });
  const sinceB = F5.deliver.machineAwayOf('h-1');
  ok(sinceA && sinceB && sinceA.since === 1_790_000_000_000 - 2 * 3600e3 && sinceB.since === sinceA.since, '(5) «silent since» is the OUTAGE\'s start — a later disconnect (a flap) never moves it', { before: sinceA, after: sinceB });
}
{
  // a machine the list knows NOTHING of ('unknown': an ssh host with no facts) is never marked — today's road (an untyped miss); and a
  // post that lands clears the mark though the list still says offline (the list lags; the machine answered)
  const Y = CID(141), box = { up: false, link: 'unknown' };
  const R = rig('unreachable-unknown', { link: () => box.link, connect: async () => { if (box.up) return R.dm; throw new Error('the machine did not answer within 6000 ms'); }, post: () => ({ ok: true, peerName: 'p' }) });
  const r1 = await R.deliver.deliverToConversation(Y, 'x', { kind: 'notification', spendReason: 'job-notification' });
  ok(r1.ok === false && !r1.unreachable && !r1.notRunning && R.deliver.unreachableOf(Y) === null && R.deliver.liveForWake(Y) === true,
    'the list says UNKNOWN (no facts): never marked — the miss stays untyped, the conversation «live» as today (no evidence is not evidence)', { r1, live: R.deliver.liveForWake(Y) });
  box.link = 'offline';
  const r2 = await R.deliver.deliverToConversation(Y, 'x', { kind: 'notification', spendReason: 'job-notification' });
  box.up = true;
  const r3 = await R.deliver.deliverToConversation(Y, 'y', { kind: 'notification', spendReason: 'job-notification' });
  ok(r2.unreachable === true && r3.ok === true && R.deliver.unreachableOf(Y) === null && R.deliver.liveForWake(Y) === true,
    'a post that LANDS clears the mark while the list still says offline (the machine answered; the list lags)', { r2: { unreachable: r2.unreachable }, r3: { ok: r3.ok }, after: R.deliver.unreachableOf(Y) });
  box.up = false; box.link = 'offline';
  await R.deliver.deliverToConversation(Y, 'z', { kind: 'notification', spendReason: 'job-notification' });
  R.c.now += 11 * 60e3; box.link = 'unknown';
  ok(R.deliver.unreachableOf(Y) === null, 'past the bound, once the list can no longer say (unknown), the mark goes — the bound an ended reply has', { after: R.deliver.unreachableOf(Y) });
}

{
  // a HELD machines list cannot say — its linkState answers 'offline' on purpose (the pool's dark-source defense): NOTHING is marked
  // (the hold's own rule: a remote owner is «unknown», never ended) — RED CONTROL: the hold's word removed from the link's reader
  const Z = CID(142);
  const held = async (mod) => {
    const tag = 'unreachable-held-' + Math.random().toString(36).slice(2, 7);
    const R = rig(tag, { mod, store: realStore(tag, 'held'), link: () => 'offline', connect: async () => { throw new Error('the machines list is held — read again'); } });
    const r = await R.deliver.deliverToConversation(Z, 'x', { kind: 'notification', spendReason: 'job-notification' });
    return { unreachable: !!(r && r.unreachable), mark: R.deliver.unreachableOf(Z) };
  };
  const h = await held(DELIVER);
  ok(h.unreachable === false && h.mark === null, 'a HELD machines list (its linkState says offline for the pool\'s defense) marks NOTHING — unknown, never unreachable', h);
  const HELDMARK = mutantCopies('peer-state-held-marks', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, "  const linkOf = (hid) => { if (hostsHeld()) return 'unknown'; try {", "  const linkOf = (hid) => { try {", 'held-reads-offline'), 'held-reads-offline');
  const hr = await held(HELDMARK);
  ok(hr.unreachable === true, '⑭ RED CONTROL: the hold\'s word removed from the link\'s reader ⇒ a held list marks every paired machine unreachable', hr);
}


console.log('⑮ B-2566\'s remainder (r1645): THE PAIRING READ — one function, three replies, judged by ONE TABLE over the REAL machines list');
{
  // the table: each row a REAL store (src/hosts.js) on a scratch folder, read through the deliver engine's own pairing read
  const PAIR_CATCH = "    catch (e) { return e && e.code === 'host_not_found' ? { reply: 'gone' } : UNKNOWN; }";
  const ROWS = [
    ['a paired machine', () => realStore('pair-paired', [MACHINE_H1()]), 'paired'],
    ['a machine the list READ gone (another machine paired, not this one)', () => realStore('pair-absent', [{ ...MACHINE_H1(), id: 'h-2' }]), 'gone'],
    ['a machine a person REMOVED (the store\'s own remove)', () => { const st = realStore('pair-removed', [MACHINE_H1()]); Promise.resolve(st.remove('h-1')).catch(() => { }); return st; }, 'gone'],
    ['a list HELD unread (its hosts.json cannot be read)', () => realStore('pair-held', 'held'), 'unknown'],
    ['no list at all', () => null, 'unknown'],
    ['a read that fails some other way (EIO)', () => { const st = realStore('pair-eio', [MACHINE_H1()]); Object.defineProperty(st, '_state', { configurable: true, get() { throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } }); return st; }, 'unknown'],
  ];
  const table = (mod) => ROWS.map(([what, make, want]) => { const store = make(); const R = rig('pair-' + Math.random().toString(36).slice(2, 7), { mod, ...(store ? { store } : { noList: true }) }); return { what, want, got: R.deliver.pairingOf('h-1') }; });
  const t = table(DELIVER);
  ok(t.every((r) => r.got === r.want), 'THE TABLE over the real store: paired ⇒ paired · read gone / removed ⇒ gone · held / no list / another failure ⇒ cannot say (unknown) — each row\'s reply named', t);
  const ALLKEEP = mutantCopies('peer-state-pair-catch-all-keeps', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, PAIR_CATCH, '    catch { return UNKNOWN; }', 'any-throw-keeps'), 'any-throw-keeps');
  const ALLGONE = mutantCopies('peer-state-pair-catch-all-gone', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, PAIR_CATCH, "    catch { return { reply: 'gone' }; }", 'any-throw-gone'), 'any-throw-gone');
  const tk = table(ALLKEEP), tg = table(ALLGONE);
  ok(tk.filter((r) => r.got !== r.want).map((r) => r.what).join(' | ') === ROWS.filter((r) => r[2] === 'gone').map((r) => r[0]).join(' | '),
    '⑮ RED (the must of r1645): every throw read as «cannot say» (a copy) ⇒ the REMOVED machines read as kept — named', tk.filter((r) => r.got !== r.want));
  ok(tg.filter((r) => r.got !== r.want).map((r) => r.what).join(' | ') === 'a read that fails some other way (EIO)',
    '⑮ RED (r1397 (2)): every throw read as «gone» (a copy) ⇒ a read that failed some other way refuses as unpaired — named', tg.filter((r) => r.got !== r.want));

  // THE CENSUS: every reader of a machine in the deliver engine asks pairingOf — the store's own get is called in ONE place
  const fnAt = (src, at) => { const before = src.slice(0, at); const m = [...before.matchAll(/\n  (?:async )?function (\w+)\(|\n  const (\w+) = /g)].pop(); return m ? (m[1] || m[2]) : '?'; };
  const readers = (src) => [...src.matchAll(/(?:\bhosts|getHosts\s*(?:\?\.)?\(\s*\))\s*(?:\?\.|\.)\s*get\s*(?:\?\.)?\(/g)].map((m) => fnAt(src, m.index));
  const here = readers(DSRC);
  const planted = DSRC.replace("  const silentSinceOf = (hid) => {", "  const silentSinceOf = (hid) => { const _x = getHosts().get(hid);");
  ok(here.join() === 'pairingOf' && readers(planted).length === 2 && readers(planted).includes('silentSinceOf'),
    'THE CENSUS: the machines list\'s get is called in ONE place in the deliver engine — pairingOf; every reader of a machine asks it (CONTROL: a planted direct read is named)', { readers: here, planted: readers(planted) });
}


console.log('⑯ B-2566\'s remainder (r1730): «gone» by the store\'s CODE; a HELD list ends nothing on every road');
{
  // (1) the REAL store says a machine it read gone by a TYPED code (src/hosts.js get) — the pairing read matches the code, never the words
  const st = realStore('code-gone', [{ ...MACHINE_H1(), id: 'h-2' }]);
  let thrown = null; try { st.get('h-1'); } catch (e) { thrown = { code: e.code, message: e.message }; }
  ok(thrown && thrown.code === 'host_not_found' && thrown.message === 'host not found', '(1) the real store\'s not-found throw carries its TYPED code (host_not_found — src/mount-error-words.js\'s own, so a page\'s words do not move)', thrown);
  // (2) a conversation no ONE machine can be named for (two machines claim it) while the list is HELD: the judge ends nothing — the
  // wake stays held past the bound; RED: the held return removed (a copy) ⇒ released after the bound with the no-link word
  const X = CID(160);
  const HELD_RETURN = "    if (hostsHeld()) return;   // r1730 (2): a HELD list ends NOTHING, on every road (an owner no one machine can be named for reaches here past attemptEnded's held return)\n";
  const NOHELD = mutantCopies('peer-state-held-ends-nothing', REPO).load('src/server/conversation-deliver.js', anchored(DSRC, HELD_RETURN, '', 'held-ends-wake'), 'held-ends-wake');
  const heldTwoOwners = async (mod, tag) => {
    const box = { up: false, link: 'offline' };
    const R = rig('held-two-' + tag, { mod, owner: () => (box.owner === undefined ? 'h-1' : box.owner), link: () => box.link, store: realStore('held-two-' + tag, [MACHINE_H1()]), connect: async () => { throw Object.assign(new Error('the machine did not answer within 6000 ms'), { code: 'connect_timeout' }); } });
    await R.result(X, 'nightly report finished');
    box.owner = null;   // two machines claim it now: no ONE owner can be named
    R.store._unreadHold({ code: 'EIO', why: 'i/o error, read' });   // the REAL store's own hold: its read failed
    R.c.now += 11 * 60e3; await R.fire(); await R.fire();
    return { owed: R.deliver.endedEntries(X).length, running: R.wakes.filter((w) => w.cid === X && w.outcome === 'running').length, held: R.store.held() };
  };
  const g = await heldTwoOwners(DELIVER, 'g'), r = await heldTwoOwners(NOHELD, 'r');
  ok(g.held === true && g.owed === 1 && g.running === 0, '(2) a HELD list and an owner no one machine can be named for: the wake is KEPT past the bound — a held list ends nothing', g);
  ok(r.running === 1 && r.owed === 0, '(2) RED: the held return removed (a copy) ⇒ the wake is released after the bound under the no-link word', r);
}

report();
