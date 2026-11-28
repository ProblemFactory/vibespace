#!/usr/bin/env node
// Communication Channels v1 (2.362.0): agent-to-agent messaging.
// 1. ACL matrix — src/msg-acl.js (PURE): same-group mutual, group
//    externalVisibility, per-session override widening-only, ungrouped
//    singleton, multi-group union.
// 2. Delivery ladder — src/server/conversation-deliver.js with injected
//    fakes: local rung, remote daemon rung (conversation-index routing),
//    stash round trip + persistence.
// 3. Wiring pins (the unstaged-wiring class): routes, drain, jobs-wiring
//    consumption, agentd op three-touch, CLI + manual presence.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';   // B-6721: the remote rung's «unanswered» control
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

// ── 1. ACL matrix ──
{
  const A = require(REPO + '/src/msg-acl.js');
  const gs = (settings) => (gid) => settings[gid] || 'none';
  const t = (groups, reachability) => ({ cid: 'x', groups, reachability });
  ok(A.levelFor(t(['g1']), ['g1'], gs({})) === 'messageable', 'same group → messageable');
  ok(A.levelFor(t(['g1']), ['g2'], gs({})) === 'none', 'different group, closed → none');
  ok(A.levelFor(t(['g1']), ['g2'], gs({ g1: 'visible' })) === 'visible', 'group externalVisibility=visible → visible');
  ok(A.levelFor(t(['g1']), ['g2'], gs({ g1: 'messageable' })) === 'messageable', 'group externalVisibility=messageable → messageable');
  ok(A.levelFor(t(['g1'], 'messageable'), ['g2'], gs({})) === 'messageable', 'session override opens one session');
  ok(A.levelFor(t(['g1'], 'visible'), ['g2'], gs({ g1: 'messageable' })) === 'messageable', 'override never NARROWS a group grant (max wins)');
  ok(A.levelFor(t(['g1', 'g3']), ['g3'], gs({})) === 'messageable', 'multi-group target: any shared group wins');
  ok(A.levelFor(t([]), ['g1'], gs({})) === 'none', 'ungrouped target = singleton, closed');
  ok(A.levelFor(t([], 'visible'), ['g1'], gs({})) === 'visible', 'ungrouped target opened by its own override');
  ok(A.levelFor(t(['g1']), [], gs({ g1: 'visible' })) === 'visible', 'ungrouped SENDER can still see what is externally visible');
  ok(gateOf(A.canSee('visible')) && !A.canMessage('visible') && gateOf(A.canMessage('messageable')) && !A.canSee('none'), 'rank predicates');
}

// ── 2. delivery ladder ──
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-deliver-'));
  const calls = { local: [], remote: [], channel: [] };
  let localPeer = null;
  let remoteResult = { ok: true, peerName: 'remote-sess' };
  const fakePeerMsg = {
    findPeer: (cid) => localPeer,
    postToPeer: async (peer, text) => { calls.local.push({ peer, text }); return { ok: true }; },
    postChannelEvent: async () => ({ ok: false }),
  };
  const fakeHosts = {
    get: (id) => (id === 'host-A' ? { id } : null),
    device: async (id) => ({ peerPost: async ({ cid, text }) => { calls.remote.push({ id, cid, text }); return remoteResult; } }),
    convIndex: { ownerHost: (cid) => (cid === 'cid-remote' ? 'host-A' : null) },
  };
  const cards = [];
  const D = require(REPO + '/src/server/conversation-deliver.js').create({
    dataDir: dir, peerMsg: fakePeerMsg, getHosts: () => fakeHosts, getConvIndex: () => fakeHosts.convIndex,
    serverSetting: () => undefined, activeSessions: new Map(),
    emitPeerCard: (cid, card) => cards.push({ cid, ...card }),
  });
  // local rung
  localPeer = { socketPath: '/tmp/x.sock', name: 'local-sess' };
  const r1 = await D.deliverToConversation('cid-local', 'hi', { fromName: 'sender-A', cardText: 'raw body' });
  ok(gateOf(r1.ok) && r1.lane === 'message' && r1.peerName === 'local-sess' && calls.local.length === 1, 'local rung delivers via this machine registry', JSON.stringify(r1));
  // 2.363.0: a successful post RENDERS THE CARD at the delivery site — the CLI
  // records server-posted injections with a body-less origin, so nothing else can
  ok(cards.length === 1 && cards[0].cid === 'cid-local' && cards[0].fromName === 'sender-A' && cards[0].text === 'raw body', 'ok delivery emits the peer card (fromName + raw cardText)', JSON.stringify(cards));
  // remote rung: no local peer, conversation-index names host-A
  localPeer = null;
  const r2 = await D.deliverToConversation('cid-remote', 'yo');
  ok(gateOf(r2.ok) && r2.lane === 'remote-message' && r2.hostId === 'host-A' && calls.remote.length === 1 && calls.remote[0].cid === 'cid-remote', 'remote rung routes via the owning machine daemon (transparent id)', JSON.stringify(r2));
  ok(cards.length === 2 && cards[1].cid === 'cid-remote' && cards[1].text === 'yo', 'remote ok delivery emits the card too (cardText defaults to the posted text)');
  // remote daemon miss → honest fail (caller stashes)
  remoteResult = { ok: false, reason: 'no live inbox on this machine' };
  const r3 = await D.deliverToConversation('cid-remote', 'yo2');
  ok(!r3.ok && r3.lane === 'remote-message' && verdictOf(r3.reason), 'remote miss reports honestly');
  // B-6721 (round w8g2bt5bs's should; the move check w3pnpw53m's MUST): the remote rung says `unanswered` ONLY when the request LEFT
  // and no answer came — and both «left, no reply» shapes are MADE BY THE CLIENT'S OWN CODE: the REAL DeviceManager (src/agentd/client.js)
  // over the stream transport talks to a stand-in DEVICE on the real Mux, which (a) never answers the peer-post (the client's own
  // bound fires — its op name and its words) or (b) drops the link with the request pending (the client's own close path rejects it).
  // Never `unanswered`: (c) an error the device ANSWERED, (d) a device without the capability (nothing left). RED: the previous shape.
  const { Mux, PROTO_VERSION } = require(REPO + '/src/agentd/mux.js');
  const { DeviceManager } = require(REPO + '/src/agentd/client.js');
  const net = require('node:net');
  const deviceThat = async (onPost, caps = ['peer-post']) => {
    let smux = null;
    const srv = net.createServer((sock) => {
      smux = new Mux(sock, { onControl: (m) => { if (m.op === 'hello') smux.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '1.1.1', capabilities: caps, platform: 'linux' }); else if (m.op === 'peer-post') onPost(m, smux, sock); }, onData: (c, b) => smux.credit(c, b.length), onDead: () => { } });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const s = await new Promise((res, rej) => { const c = net.connect(srv.address().port, '127.0.0.1'); c.on('connect', () => res(c)); c.on('error', rej); });
    const dm = new DeviceManager({ dataDir: dir, bundlePath: path.join(dir, 'no-bundle-here.js'), version: '1.1.1', log: () => { }, transport: { kind: 'stream', hostToken: 'vsht_x', getStream: () => s } });
    await dm.connect();   // the link is up BEFORE the post (the bound shortened below is the request's own, never the handshake's)
    return { dm, close: () => { try { dm.stop(); } catch { } try { s.destroy(); } catch { } try { srv.close(); } catch { } } };
  };
  // `short`: ONLY where the device never answers — peer-post's OWN 15 s bound (client.js peerPost) shortened in time only; every other
  // case keeps the real bound (its close or its answer comes first — a 40 ms bound for all lost those races on a loaded test machine)
  const throughDevice = async (DD, onPost, caps, { short = false } = {}) => {
    const dev = await deviceThat(onPost, caps);
    const was = fakeHosts.device; fakeHosts.device = async () => dev.dm;
    const realST = globalThis.setTimeout;
    if (short) globalThis.setTimeout = (fn, ms, ...a) => realST(fn, ms === 15000 ? 40 : ms, ...a);
    try { return await DD.deliverToConversation('cid-remote', 'yo3'); } finally { globalThis.setTimeout = realST; fakeHosts.device = was; dev.close(); }
  };
  const uaOf = async (DD) => ({
    timeout: await throughDevice(DD, () => { }, undefined, { short: true }),   // (a) the device never answers: the client's own bound
    lost: await throughDevice(DD, (m, mux, sock) => setImmediate(() => sock.destroy())),   // (b) the link drops with the request pending
    answered: await throughDevice(DD, (m, mux) => mux.control({ op: 'peer-post-result', id: m.id, error: 'the device answered an error' })),   // (c)
    gate: await throughDevice(DD, () => { }, []),   // (d) no peer-post capability: nothing leaves
  });
  const ua = await uaOf(D);
  ok(gateOf(/peer-post timeout/.test(ua.timeout.reason)) && gateOf(/link lost/.test(ua.lost.reason)) && ua.timeout.unanswered === true && ua.lost.unanswered === true && !ua.answered.unanswered && !ua.gate.unanswered && verdictOf(Object.values(ua).every((x) => x.ok === false && x.lane === 'remote-message')),
    'B-6721: the remote rung says «unanswered» for the CLIENT\'s own «left, no reply» errors — its request bound and its lost link — and never for an error the device answered or a missing capability (the real DeviceManager over the real Mux)', JSON.stringify(ua));
  const CDSRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const MCU = mutantCopies('agent-msg-unanswered', REPO);
  const CDany = MCU.load('src/server/conversation-deliver.js', anchored(CDSRC, "          const unanswered = !!undo2 && !!e && (e.code === 'link_lost' || e.message === 'peer-post timeout');", '          const unanswered = !!undo2;', 'B-6721: unanswered for any throw after the turn armed'), 'cd-unanswered');
  const Dany = CDany.create({ dataDir: dir, peerMsg: fakePeerMsg, getHosts: () => fakeHosts, getConvIndex: () => fakeHosts.convIndex, serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => { } });
  const uaR = await uaOf(Dany);
  ok(uaR.answered.unanswered === true && uaR.gate.unanswered === true, 'RED control: the previous shape says «unanswered» for an error the device answered and for a missing capability (nothing was posted — the chain ended with a «may have landed» journal line)', JSON.stringify(uaR));
  // THE CENSUS (the MUST's law): every way the client's request maker (`_request`) ends a request is pinned by name and count — a NEW
  // way to fail is red here until the rung says which side it is on: BEFORE THE SEND (an act without a valid sender, the act gate, the
  // connect, the device's allow list) — nothing left; an ANSWER (the device's error; or the lost link's own synthetic answer, `linkLost`
  // ⇒ code link_lost — LEFT, no reply); the request's own BOUND (`<op> timeout` — LEFT, no reply)
  const CLSRC = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  const ROADS = [
    ['before the send: an act without a valid sender', '    if (act && !DA.validBy(payload.by)) return this._refuseAct(payload);'],
    ['before the send: the act gate (a refusal throws)', '    const facts = asked !== undefined ? asked : act && DA.auditable(payload) ? await this._gate(payload, { consent }) : null;'],
    ['before the send: the connect', '    const conn = await this.connect();'],
    ['before the send: the device\'s allow list', '    const noFlag = this._policyError(conn, payload, true); if (noFlag) return Promise.reject(gateRefusal(noFlag));'],
    ['an ANSWER (the device\'s error, or the lost link\'s synthetic answer)', '        return m.error ? reject(replyError(m)) : resolve(m);'],
    // lane lg-remote-hardening (B-7f0b D8) meets this census: TWO roads more, each by name — an answer over its op's cap, and a
    // request the Mux will not send (over the line's bound)
    ['an ANSWER over its op\'s cap (answer-too-large, the link kept)', "          return reject(Object.assign(new Error(`${this._machineName() || 'the machine'}: its answer to ${payload.op} is "],
    ['before the send: a request the Mux will not send (control-line-too-large, nothing pending)', '      try { conn.mux.control({ ...payload, id }); } catch (e) {'],
    ['LEFT, no reply: the request\'s own bound', "reject(new Error(payload.op + ' timeout')); } }, payload.waitMs || payload.timeoutMs || 30000);"],
  ];
  const roadsOf = (src) => {
    const a = src.indexOf('  async _request(payload'), b = src.indexOf('  /** One audit line of an act sent through this client');
    const body = a >= 0 && b > a ? src.slice(a, b) : '';
    return { body, pinned: ROADS.every(([, line]) => body.split(line).length === 2), rejects: (body.match(/\breject\(/g) || []).length, awaits: (body.match(/\bawait\b/g) || []).length, returns: (body.match(/\breturn this\._refuseAct\(|\breturn Promise\.reject\(/g) || []).length };
  };
  const census = (src) => { const r = roadsOf(src); return r.pinned && r.rejects === 5 && r.awaits === 2 && r.returns === 2 && src.split("for (const r of pending.values()) { try { r({ error: 'device link lost', linkLost: true }); } catch { } }").length === 2 && src.includes("m.linkLost ? { code: 'link_lost' } : {}") && src.includes("const r = await this._request({ op: 'peer-post', cid, text, timeoutMs: 15000 + wait, by, ...(wait ? { inboxWaitMs: wait } : {}) });"); };
  ok(verdictOf(census(CLSRC)), 'census (B-6721, the MUST): the client\'s request maker ends a request on exactly EIGHT roads, pinned by name — five before the send (B-7f0b D8: a request the Mux will not send), the answer (the lost link\'s own `linkLost` answer among them, code link_lost), the request\'s own bound (`peer-post timeout`); the rung\'s «unanswered» judges the last two', JSON.stringify((() => { const r = roadsOf(CLSRC); return { pinned: r.pinned, rejects: r.rejects, awaits: r.awaits, returns: r.returns }; })()));
  ok(!census(anchored(CLSRC, '      try { conn.mux.control({ ...payload, id }); } catch (e) {', "      if (payload.op === 'x') { conn.pending.delete(id); reject(new Error('x')); return; }\n      try { conn.mux.control({ ...payload, id }); } catch (e) {", 'B-6721: a new way for a request to fail')), 'RED control: a NEW way for a request to end (an added reject) is red until the rung says which side it is on');
  // unknown everywhere
  const r4 = await D.deliverToConversation('cid-nowhere', 'x');
  ok(!r4.ok && verdictOf(/no live inbox/.test(r4.reason)), 'unroutable conversation fails with a named reason');
  ok(cards.length === 2, 'failed deliveries emit NO card (the stash drain renders later instead)');
  // stash round trip + persistence across instances
  D.stashFor('cid-nowhere', { source: 'agent', fromName: 'tester', text: 'queued msg' });
  ok(D.stashCount('cid-nowhere') === 1, 'stash holds the envelope');
  await new Promise((r) => setTimeout(r, 700)); // debounced persist
  const D2 = require(REPO + '/src/server/conversation-deliver.js').create({ dataDir: dir, peerMsg: fakePeerMsg, getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, activeSessions: new Map() });
  const drained = D2.drainStash('cid-nowhere');
  ok(drained.length === 1 && drained[0].fromName === 'tester' && drained[0].source === 'agent', 'stash survives restart and drains ONCE (channel-ready envelope)', JSON.stringify(drained));
  ok(D2.drainStash('cid-nowhere').length === 0, 'second drain is empty');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── 3. wiring pins ──
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
  const ar = read('src/agent-routes.js');
  ok(gateOf(ar.includes("app.get('/api/agent/msg/peers'")) && verdictOf(ar.includes("app.post('/api/agent/msg/send'")), 'agent-routes exposes msg peers/send');
  ok(ar.split('INDEPENDENT of the jobs engine').length >= 3, 'msg stash drains at BOTH injection sites OUTSIDE the jobs-ready gate (review-caught coupling)');
  ok(require(path.join(REPO, 'src/agent-routes.js')).AGENT_DOC_TOPICS.msg === 'msg-manual.md', 'vibespace-docs serves the msg manual');   // lane cli-registry: the topics are the registry's rows
  ok(gateOf(ar.includes('vibespace-msg list')) && verdictOf(ar.includes('billed turn')), 'tools intro teaches vibespace-msg incl. the cost semantics');
  const jw = read('src/server/jobs-wiring.js');
  ok(gateOf(jw.includes('deliver.deliverToConversation')) && !jw.includes('peerMsg.findPeer'), 'jobs-wiring consumes the SHARED ladder (no inline twin left)');
  const sv = read('server.js');
  ok(gateOf(sv.includes("require('./src/server/conversation-deliver.js').create")) && verdictOf(sv.includes('getJobs: jobsWiring.getJobs, deliver')), 'server wires ONE deliver instance into jobs + agent routes');
  ok(verdictOf(sv.includes("'/api/sessions/:id/msg-reachability'")), 'per-session reach override API exists');
  const ad = read('src/agentd/agentd.js');
  ok(gateOf(ad.includes("'peer-post'")) && verdictOf(ad.includes("msg.op === 'peer-post'")), 'agentd: peer-post op + capability');
  const cl = read('src/agentd/client.js');
  ok(gateOf(cl.includes("m.op === 'peer-post-result'")) && verdictOf(cl.includes('daemon lacks peer-post')), 'client: reply routed + capability-gated (old daemons never asked)');
  ok(gateOf(fs.existsSync(path.join(REPO, 'data/bin/vibespace-msg'))) && verdictOf(read('data/bin/vibespace-msg').includes('/api/agent/msg/send')), 'vibespace-msg CLI present and calls the API');
  ok(verdictOf(fs.existsSync(path.join(REPO, 'docs/agent/msg-manual.md'))), 'msg manual exists');
  const sc = read('src/session-schema.js');
  ok(verdictOf(sc.includes('_msgReachability')), 'session schema registers the override field');
  // review-caught batch pins
  const cd = read('src/server/conversation-deliver.js');
  ok(gateOf(cd.includes('const flush = ')) && verdictOf(read('server.js').includes('deliver.flush()')), 'stash flush() wired into the shutdown belt (SIGTERM loses nothing)');
  ok(verdictOf(cd.includes('deviceBounded')), 'remote rung uses the BOUNDED device connect (no 2.7min request hangs)');
  ok(verdictOf(/AGENT_TOOLS[^\]]*vibespace-msg/.test(read('src/hosts.js').replace(/\n/g, ' '))), 'vibespace-msg ships to remote hosts (AGENT_TOOLS)');
  // 2.363.0 delivery-site card rendering (server-posted = body-less origin at the CLI)
  ok(gateOf(sv.includes('emitPeerCard')) && verdictOf(/feedPeerCard\(s, card\)/.test(sv)), 'server wires emitPeerCard → feedPeerCard gate → session normalizer injectPeerCard (2.369.16: never a direct injectPeerCard — it wrote mid-history during a rebuild)');
  ok(verdictOf(ar.includes('cardText: text')), 'msg/send passes the RAW body as the card text');
  // channel-jump verify r5: the four drain sites are TWO helpers (drainStashUnderCap / drainNotifsUnderCap — the drains fit
  // the inline cap or wait), each the ONE card writer for its store, each called from both hook routes
  ok(gateOf(/function drainStashUnderCap[\s\S]{0,3400}?deliver\.emitPeerCard\(cid, \{ fromName: e\.fromName \|\| null, text: e\.text, kind: stashKindOf\(e\) \}\)/.test(ar)) && gateOf(/function drainNotifsUnderCap[\s\S]{0,2600}?deliver\.emitPeerCard\(cid, \{ fromName: 'Background Work · '/.test(ar))
    && ar.split('= drainStashUnderCap(deliver, ').length === 3 && ar.split('= drainNotifsUnderCap(jm, deliver, ').length === 3,
    'all four stash-drain sites (msg ×2 + jobs ×2) render cards for drained messages — through the two fit-or-wait helpers, each called by task-context AND prompt-context (verify r5)');
  ok(verdictOf(read('src/jobs.js').includes("fromName: 'Background Work · '")), 'jobs owner-notify labels its card');
  ok(verdictOf(read('src/message-manager.js').includes('injectPeerCard')), 'normalizer exposes injectPeerCard');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
