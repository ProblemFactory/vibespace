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
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

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
  ok(A.canSee('visible') && !A.canMessage('visible') && A.canMessage('messageable') && !A.canSee('none'), 'rank predicates');
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
  ok(r1.ok && r1.lane === 'message' && r1.peerName === 'local-sess' && calls.local.length === 1, 'local rung delivers via this machine registry', JSON.stringify(r1));
  // 2.363.0: a successful post RENDERS THE CARD at the delivery site — the CLI
  // records server-posted injections with a body-less origin, so nothing else can
  ok(cards.length === 1 && cards[0].cid === 'cid-local' && cards[0].fromName === 'sender-A' && cards[0].text === 'raw body', 'ok delivery emits the peer card (fromName + raw cardText)', JSON.stringify(cards));
  // remote rung: no local peer, conversation-index names host-A
  localPeer = null;
  const r2 = await D.deliverToConversation('cid-remote', 'yo');
  ok(r2.ok && r2.lane === 'remote-message' && r2.hostId === 'host-A' && calls.remote.length === 1 && calls.remote[0].cid === 'cid-remote', 'remote rung routes via the owning machine daemon (transparent id)', JSON.stringify(r2));
  ok(cards.length === 2 && cards[1].cid === 'cid-remote' && cards[1].text === 'yo', 'remote ok delivery emits the card too (cardText defaults to the posted text)');
  // remote daemon miss → honest fail (caller stashes)
  remoteResult = { ok: false, reason: 'no live inbox on this machine' };
  const r3 = await D.deliverToConversation('cid-remote', 'yo2');
  ok(!r3.ok && r3.lane === 'remote-message' && r3.reason, 'remote miss reports honestly');
  // unknown everywhere
  const r4 = await D.deliverToConversation('cid-nowhere', 'x');
  ok(!r4.ok && /no live inbox/.test(r4.reason), 'unroutable conversation fails with a named reason');
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
  ok(ar.includes("app.get('/api/agent/msg/peers'") && ar.includes("app.post('/api/agent/msg/send'"), 'agent-routes exposes msg peers/send');
  ok(ar.split('INDEPENDENT of the jobs engine').length >= 3, 'msg stash drains at BOTH injection sites OUTSIDE the jobs-ready gate (review-caught coupling)');
  ok(/msg: 'msg-manual\.md'/.test(ar), 'vibespace-docs serves the msg manual');
  ok(ar.includes('vibespace-msg list') && ar.includes('billed turn'), 'tools intro teaches vibespace-msg incl. the cost semantics');
  const jw = read('src/server/jobs-wiring.js');
  ok(jw.includes('deliver.deliverToConversation') && !jw.includes('peerMsg.findPeer'), 'jobs-wiring consumes the SHARED ladder (no inline twin left)');
  const sv = read('server.js');
  ok(sv.includes("require('./src/server/conversation-deliver.js').create") && sv.includes('getJobs: jobsWiring.getJobs, deliver'), 'server wires ONE deliver instance into jobs + agent routes');
  ok(sv.includes("'/api/sessions/:id/msg-reachability'"), 'per-session reach override API exists');
  const ad = read('src/agentd/agentd.js');
  ok(ad.includes("'peer-post'") && ad.includes("msg.op === 'peer-post'"), 'agentd: peer-post op + capability');
  const cl = read('src/agentd/client.js');
  ok(cl.includes("m.op === 'peer-post-result'") && cl.includes('daemon lacks peer-post'), 'client: reply routed + capability-gated (old daemons never asked)');
  ok(fs.existsSync(path.join(REPO, 'data/bin/vibespace-msg')) && read('data/bin/vibespace-msg').includes('/api/agent/msg/send'), 'vibespace-msg CLI present and calls the API');
  ok(fs.existsSync(path.join(REPO, 'docs/agent/msg-manual.md')), 'msg manual exists');
  const sc = read('src/session-schema.js');
  ok(sc.includes('_msgReachability'), 'session schema registers the override field');
  // review-caught batch pins
  const cd = read('src/server/conversation-deliver.js');
  ok(cd.includes('const flush = ') && read('server.js').includes('deliver.flush()'), 'stash flush() wired into the shutdown belt (SIGTERM loses nothing)');
  ok(cd.includes('deviceBounded'), 'remote rung uses the BOUNDED device connect (no 2.7min request hangs)');
  ok(/AGENT_TOOLS[^\]]*vibespace-msg/.test(read('src/hosts.js').replace(/\n/g, ' ')), 'vibespace-msg ships to remote hosts (AGENT_TOOLS)');
  // 2.363.0 delivery-site card rendering (server-posted = body-less origin at the CLI)
  ok(sv.includes('emitPeerCard') && sv.includes('injectPeerCard'), 'server wires emitPeerCard → session normalizer injectPeerCard');
  ok(ar.includes('cardText: text'), 'msg/send passes the RAW body as the card text');
  ok(ar.split('deliver.emitPeerCard').length >= 5, 'all four stash-drain sites (msg ×2 + jobs ×2) render cards for drained messages');
  ok(read('src/jobs.js').includes("fromName: 'Background Work · '"), 'jobs owner-notify labels its card');
  ok(read('src/message-manager.js').includes('injectPeerCard'), 'normalizer exposes injectPeerCard');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
