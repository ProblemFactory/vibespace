#!/usr/bin/env node
// Peer-delivery registry lane (2.368.26, B-7c4a): conversation-deliver's
// rung 1.5 delivers to backends declaring capsOf(backend).peerDelivery ===
// 'rpc-queue' (codex) by writing a 'peer-message' stdin frame to the LIVE
// wrapper — which owns the app-server connection (idle ⇒ turn/start billed
// turn, busy ⇒ thread/queue/add; upstream-test-pinned semantics). Functional:
// a REAL deliver.create() over a temp data dir + a real sidecar file (shape =
// what codex-chat-wrapper actually writes), with negative controls — plus the
// wiring pins the 2.355.0 unstaged-wiring lesson demands.
//
// 2026-09-07 (owner: 系统通知默认应该是steering的 / 按照TUI实现吧): the frame
// carries a TYPED ORIGIN. `kind:'notification'` = VibeSpace itself speaking (a
// Background Work event, a system notice) and a busy codex session STEERS it
// into the running turn instead of opening a turn of its own after it;
// `kind:'peer'` = a person's message from another session, which keeps
// queueing. The LADDER only tags — the receiving wrapper picks the lane,
// because only it knows whether a turn is running (the wrapper-side legs live
// in test-codex-p2-wrapper ②f, against a real stub app-server). Which lane a
// harness uses at all is DERIVED, never declared:
// backend-caps notificationDelivery({peerDelivery, inputModes}).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// ── registry rows ──
const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
ok("claude declares peerDelivery 'cli-inbox'", capsOf('claude').peerDelivery === 'cli-inbox');
ok("codex declares peerDelivery 'rpc-queue'", capsOf('codex').peerDelivery === 'rpc-queue');
ok("shell + unknown backends are 'stash-only' (no live lane, no crash)", capsOf('shell').peerDelivery === 'stash-only' && capsOf('gemini').peerDelivery === 'stash-only');

// ── the NOTIFICATION lane is DERIVED from that row + the queue verb table ──
{
  const { notificationDelivery, BACKEND_CAPS } = require(path.join(REPO, 'src/backend-caps.js'));
  const { BACKEND_META, notificationDeliveryFor } = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  ok("codex: rpc-queue + a 'steer' verb ⇒ notifications STEER into the running turn", notificationDelivery(capsOf('codex')) === 'steer');
  ok("claude: the CLI's own inbox owns the decision ⇒ 'cli-inbox' (it queues mid-turn itself; we never write its stdin)", notificationDelivery(capsOf('claude')) === 'cli-inbox');
  ok("opencode/ACP v1: no live lane ⇒ 'stash' (and its queueVerbs deliberately omit 'steer' — session/prompt is one-at-a-time)", notificationDelivery(capsOf('opencode')) === 'stash' && !capsOf('opencode').inputModes.steer);
  ok("shell + an unknown backend ⇒ 'stash', never codex's lane by accident", notificationDelivery(capsOf('shell')) === 'stash' && notificationDelivery(capsOf('gemini')) === 'stash' && notificationDelivery(null) === 'stash');
  // THE DERIVATION LAW (the same one that makes inputModes.steer a view of
  // queueVerbs): an rpc-queue harness that cannot steer QUEUES — there is no
  // second place to declare "notifications steer", so a verb table and this
  // answer can never disagree.
  ok("a HYPOTHETICAL rpc-queue harness without the steer verb ⇒ 'queue' (derived, not declared)", notificationDelivery({ peerDelivery: 'rpc-queue', inputModes: { steer: false } }) === 'queue');
  ok('…and the same row WITH steer ⇒ steer', notificationDelivery({ peerDelivery: 'rpc-queue', inputModes: { steer: true } }) === 'steer');
  // the client mirrors peerDelivery next to inputModes and derives through the
  // SAME pure function — a drifted mirror would let Session Properties promise
  // a lane the server does not take (the S7 twin rule).
  for (const id of Object.keys(BACKEND_META)) {
    if (!BACKEND_META[id].caps) continue;
    ok(`${id}: client META caps.peerDelivery mirrors the server row`, BACKEND_META[id].caps.peerDelivery === capsOf(id).peerDelivery, `${BACKEND_META[id].caps.peerDelivery} vs ${capsOf(id).peerDelivery}`);
    ok(`${id}: notificationDeliveryFor(client) === notificationDelivery(server)`, notificationDeliveryFor(id) === notificationDelivery(BACKEND_CAPS[id]));
  }
}

// ── functional: real deliver.create() + real sidecar ──
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-peerdeliv-'));
fs.mkdirSync(path.join(dataDir, 'session-buffers'), { recursive: true });
const CID = '11111111-2222-4333-8444-555566667777';
const WID = 'sess-1-1000';
// sidecar shape = what codex-chat-wrapper.js writes (meta object incl. caps)
fs.writeFileSync(path.join(dataDir, 'session-buffers', WID + '.json'),
  JSON.stringify({ pid: process.pid, startedAt: Date.now(), mode: 'chat', backend: 'codex', threadId: CID, caps: { peerMessage: true } }));
const frames = [];
const activeSessions = new Map([[WID, {
  backend: 'codex', mode: 'chat', backendSessionId: CID, name: 'CxPeer', host: null,
  socketPath: path.join(dataDir, 'sockets', 'cw-' + WID),
  pty: { write: (s) => frames.push(s) },
}]]);
let cards = 0;
const deliver = require(path.join(REPO, 'src/server/conversation-deliver.js')).create({
  dataDir,
  peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false, reason: 'unused' }), postChannelEvent: async () => ({ ok: false }) },
  getHosts: () => null, getConvIndex: () => null,
  serverSetting: () => false, activeSessions,
  emitPeerCard: () => { cards++; return true; },
  log: () => { },
});
const r = await deliver.deliverToConversation(CID, 'Message from session "A": hello codex', { fromName: 'A', cardText: 'hello codex' });
ok("a live codex session delivers on lane 'rpc-queue'", r.ok === true && r.lane === 'rpc-queue' && r.peerName === 'CxPeer', JSON.stringify(r));
const frame = frames.length === 1 ? JSON.parse(frames[0]) : null;
ok("…as ONE 'peer-message' stdin frame carrying the text", !!frame && frame.type === 'peer-message' && /hello codex/.test(frame.text));
ok('…plus the card label fields (fromName + cardText) the wrapper writes into its webui_peer marker (P1: labelled peer card, not a "You" bubble)', !!frame && frame.fromName === 'A' && frame.cardText === 'hello codex', JSON.stringify(frame));
ok('…and NO in-memory peer card is emitted (the wrapper record is the ONE carrier — 2.362.2: the party holding the information renders it; a card here double-renders live)', cards === 0);
ok("…and TYPED as a peer message by default (a human's message keeps its own turn)", frame.kind === 'peer' && r.kind === 'peer', JSON.stringify([frame.kind, r.kind]));
frames.length = 0;
await deliver.deliverToConversation(CID, 'unlabelled');
ok('…label fields are explicit nulls when the caller passes none (wrapper falls back to frame parsing)', frames.length === 1 && JSON.parse(frames[0]).fromName === null && JSON.parse(frames[0]).cardText === null);
ok('peerReachable() sees the live rpc peer', deliver.peerReachable(CID) === true);
// THE TYPED ORIGIN (2026-09-07): a notification says so on the wire, so the
// wrapper can steer it into the running turn instead of queueing a turn.
frames.length = 0;
const rn = await deliver.deliverToConversation(CID, '[VibeSpace Background Work] task "nightly" (job-1): done.', { fromName: 'Background Work · nightly', kind: 'notification' });
ok("a notification is TAGGED kind:'notification' on the frame AND in the result", frames.length === 1 && JSON.parse(frames[0]).kind === 'notification' && rn.kind === 'notification', frames[0]);
frames.length = 0;
await deliver.deliverToConversation(CID, 'hello', { fromName: 'A', kind: 'shout' });
ok('an UNKNOWN origin is normalised to peer — the conservative lane, never a silent steer', JSON.parse(frames[0]).kind === 'peer', frames[0]);
frames.length = 0;
await deliver.deliverToConversation(CID, 'hello again', { fromName: 'A' });
ok('…and so is an absent one (older callers keep their behaviour)', JSON.parse(frames[0]).kind === 'peer', frames[0]);

// negative control 1: sidecar without caps (old wrapper) ⇒ falls to the miss path
fs.writeFileSync(path.join(dataDir, 'session-buffers', WID + '.json'),
  JSON.stringify({ pid: process.pid, startedAt: Date.now(), mode: 'chat', backend: 'codex', threadId: CID }));
frames.length = 0;
const r2 = await deliver.deliverToConversation(CID, 'again');
ok('an old wrapper (no caps advert) is never sent the frame — honest miss instead', r2.ok === false && frames.length === 0, JSON.stringify(r2));

// negative control 2: a claude-backend session never takes the rpc lane
activeSessions.set(WID, { ...activeSessions.get(WID), backend: 'claude' });
fs.writeFileSync(path.join(dataDir, 'session-buffers', WID + '.json'),
  JSON.stringify({ pid: process.pid, startedAt: Date.now(), caps: { peerMessage: true, frameFile: true } }));
frames.length = 0;
const r3 = await deliver.deliverToConversation(CID, 'again2');
ok('a claude session never rides rpc-queue (registry gate, even with a caps-bearing sidecar)', r3.ok === false && frames.length === 0, JSON.stringify(r3));

// ── B-d963: OLD-WRAPPER SKEW — a wrapper that cannot steer never gets a notification it would QUEUE ──
// A codex wrapper started before the verb table (2.369.63, which shipped the
// notification steer in the same release) adverts `inputQueue` and NO
// `queueVerbs` list (the sess-13 sidecar, verbatim below). Handed a
// kind:'notification' frame while a turn runs it does thread/queue/add — a
// BILLED turn after the current one (the owner saw two). The ladder reads the
// running process's own advert BEFORE writing and refuses with a TYPED miss so
// the caller stashes (next prompt, drained with the chat card) instead.
{
  const OLD_CAPS = { peerMessage: true, frameFile: true, threadScoped: true, inputQueue: true, responseStyle: true };
  const NEW_CAPS = { ...OLD_CAPS, queueVerbs: capsOf('codex').inputModes.queueVerbs.slice(), permissionRules: true, queueResync: true };
  const writeSidecar = (caps) => fs.writeFileSync(path.join(dataDir, 'session-buffers', WID + '.json'),
    JSON.stringify({ pid: process.pid, startedAt: Date.now(), mode: 'chat', backend: 'codex', threadId: CID, ...(caps ? { caps } : {}) }));
  const skewFrames = [];
  const S = { backend: 'codex', mode: 'chat', backendSessionId: CID, name: 'Cx13', host: null, socketPath: path.join(dataDir, 'sockets', 'cw-' + WID), _isStreaming: true, pty: { write: (x) => skewFrames.push(String(x)) } };
  const sessions = new Map([[WID, S]]);
  const money = { auth: 0, note: 0, release: 0 };
  const L = require(path.join(REPO, 'src/server/conversation-deliver.js')).create({
    dataDir,
    peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false, reason: 'unused' }), postChannelEvent: async () => ({ ok: false }) },
    getHosts: () => null, getConvIndex: () => null, serverSetting: () => false, activeSessions: sessions, emitPeerCard: () => true,
    authorizeSpend: () => { money.auth++; return { ok: true, identity: { key: 'slot-a', name: 'A' }, hold: { id: 'h' + money.auth } }; },
    noteSpend: () => { money.note++; }, releaseSpend: () => { money.release++; },
    log: () => { },
  });
  const { wrapperCaps } = require(path.join(REPO, 'src/server/wrapper-files.js'));
  const BUF = path.join(dataDir, 'session-buffers');
  writeSidecar(OLD_CAPS);
  ok('B-d963: wrapperCaps says a verb-LESS advert does NOT steer notifications (its own process wrote no verb table)', wrapperCaps(BUF, WID, S.socketPath).notificationSteer === false, JSON.stringify(wrapperCaps(BUF, WID, S.socketPath)));
  const r0 = await L.deliverToConversation(CID, '[VibeSpace Background Work] task "nightly" (job-1): done.', { fromName: 'Background Work · nightly', kind: 'notification', spendReason: 'job-notification' });
  ok("B-d963: a notification to a BUSY old wrapper is NOT written (it would queue a billed turn) — a typed miss 'wrapper-no-steer' the caller stashes", r0.ok === false && r0.refused === 'wrapper-no-steer' && skewFrames.length === 0, JSON.stringify(r0));
  ok('…the refusal SAYS what to do (restart the session) — a held entry must name its cause', /restart/i.test(r0.reason || ''), r0.reason);
  ok('…and the spend hold is GIVEN BACK, never charged (no turn happened)', money.note === 0 && money.release === 1, JSON.stringify(money));
  // the rules this does NOT change (negative controls)
  const r1 = await L.deliverToConversation(CID, 'hello from B', { fromName: 'session B' });
  ok("…a PERSON's message to the same busy old wrapper still queues (its own turn by design, old and new wrappers alike)", r1.ok === true && skewFrames.length === 1 && JSON.parse(skewFrames[0]).kind === 'peer', JSON.stringify(r1));
  S._isStreaming = false; skewFrames.length = 0;
  const r2 = await L.deliverToConversation(CID, '[VibeSpace Background Work] idle case', { fromName: 'Background Work · nightly', kind: 'notification' });
  ok('…an IDLE old wrapper still gets the notification (it opens a turn either way — the same lane a new wrapper takes)', r2.ok === true && skewFrames.length === 1, JSON.stringify(r2));
  S._isStreaming = true; skewFrames.length = 0;
  writeSidecar(NEW_CAPS);
  ok('B-d963: …a wrapper that NAMES a verb table with steer does steer notifications', wrapperCaps(BUF, WID, S.socketPath).notificationSteer === true);
  const r3 = await L.deliverToConversation(CID, '[VibeSpace Background Work] new wrapper', { fromName: 'Background Work · nightly', kind: 'notification' });
  ok('…and a BUSY new wrapper is written the frame, predicted steered (the ladder is unchanged for it)', r3.ok === true && r3.steered === true && skewFrames.length === 1 && JSON.parse(skewFrames[0]).kind === 'notification', JSON.stringify(r3));
  fs.rmSync(path.join(BUF, WID + '.json'));
  ok('…and NO sidecar at all is not a steer (never guess yes for a process that said nothing)', wrapperCaps(BUF, WID, S.socketPath).notificationSteer === false);
  // the caller's stash is TYPED with the new cause (the Background Work panel
  // names it instead of "the conversation has no live inbox")
  const M = require(path.join(REPO, 'src/job-model.js'));
  ok("B-d963: job-model types the stash 'wrapper-no-steer' from the ladder's answer (a closed HELD_KINDS member)", M.heldKind(r0, r0.reason) === 'wrapper-no-steer' && M.HELD_KINDS.includes('wrapper-no-steer'), M.heldKind(r0, r0.reason));
  const JL = await import(path.join(REPO, 'src/lib/jobs-layout.js'));
  const held = JL.heldText({ total: 1, byConversation: { [CID]: { count: 1, kinds: { 'wrapper-no-steer': 1 }, reason: { kind: 'wrapper-no-steer' } } } });
  ok('…and the panel sentence names the restart', /Restart this session/.test(held), held);
  writeSidecar({ peerMessage: true });
}

// ── B-d963: WHICH queued items are notifications — ONE list of the senders
// VibeSpace itself speaks as, shared by the client strip and pinned against
// every producer that delivers kind:'notification' ──
{
  const NS = require(path.join(REPO, 'src/notification-senders.js'));
  ok('B-d963: a Background Work queue row is a notification; a person is not; a typed kind:notification row is', NS.isNotificationQueueItem({ kind: 'peer', from: 'Background Work · nightly' }) && !NS.isNotificationQueueItem({ kind: 'peer', from: 'session B' }) && !NS.isNotificationQueueItem({ kind: 'user', from: 'Background Work · x' }) && NS.isNotificationQueueItem({ kind: 'notification' }));
  const files = ['src/jobs.js', 'src/server/browser-handback.js', 'src/server/channels-engine.js'];
  const producers = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) walk(rel); else if (/\.js$/.test(e.name) && /deliverToConversation\([^;]*kind: 'notification'/.test(read(rel))) producers.push(rel); } };
  walk('src');
  ok(`…the census finds every kind:'notification' producer (${producers.join(', ')})`, JSON.stringify(producers.sort()) === JSON.stringify(files.slice().sort()), producers);
  for (const f of producers) ok(`…${f} speaks under a sender the list names`, NS.NOTIFICATION_SENDERS.some((p) => read(f).includes(p)), f);
  ok('NEGATIVE CONTROL: a producer file with an unlisted sender fails the census', !NS.NOTIFICATION_SENDERS.some((p) => "fromName: 'Somebody new · x', kind: 'notification'".includes(p)));
}

// stash still works as the final rung
deliver.stashFor(CID, { source: 'agent', fromName: 'A', text: 'queued' });
ok('the stash rung is intact (queued + drained once)', deliver.drainStash(CID).length === 1 && deliver.drainStash(CID).length === 0);

// ── wrapper contract pins ──
const w = read('data/bin/codex-chat-wrapper.js');
// caps grew a NON-boolean member in 2026-09-07 (`queueVerbs`, the verb table the
// running wrapper serves) — the advert this suite owns is still peerMessage.
ok('the codex wrapper adverts caps.peerMessage in its sidecar meta', /caps: \{ peerMessage: true(, [a-zA-Z]+: (?:true|[A-Z_]+))* \}/.test(w), /caps: \{[^}]*\}/.exec(w)?.[0]);
ok("…serves the 'peer-message' verb: busy ⇒ thread/queue/add, idle ⇒ turn/start", /msg\.type === 'peer-message'/.test(w) && /meta\.activeTurnId\) \{[\s\S]{0,600}?await request\('thread\/queue\/add'/.test(w) && /noteQueued\(cid, \{ kind: 'peer', msgId: '', from: fromName, text \}\)/.test(w) && /await startTurn\(text\);/.test(w));
// The record grew TWO named facts (2026-09-07 rounds 2-3): which side of
// codex's own copy it lands on, and the submission id the app-server knows it
// by. The pin follows the shape; what it owns is unchanged — every lane writes
// the SAME labelled record.
ok('…records the peer user message itself (item notifications never carry userMessage) — with the webui_peer marker, on the steered, queued and turn paths', /const recordPeerMessage = \(afterCommit, queueCid\) => record\('response_item', \{\n\s*type: 'message', role: 'user', content: \[\{ type: 'input_text', text \}\],\n\s*webui_peer: \{ name: fromName, body: cardText \},/.test(w) && /thread\/queue\/add[\s\S]{0,400}recordPeerMessage\(false, cid\);/.test(w) && /await startTurn\(text\);\s*\n\s*recordPeerMessage\(true, ''\);/.test(w));
ok('…reports peer_message_result on EVERY lane, echoing text + fromName on failure so the server can re-stash with its label', /peer_message_result', \{ ok: true, mode: 'steered' \}/.test(w) && /peer_message_result', \{ ok: true, mode: 'queued', \.\.\.fell \}/.test(w) && /peer_message_result', \{ ok: true, mode: 'turn', \.\.\.fell \}/.test(w) && /peer_message_result', \{ ok: false, reason: e\.message, text, fromName \}/.test(w));
// the NOTIFICATION rule, at the wrapper: typed frame → steer lane; unknown
// origin → peer; the ACP wrapper has no steer verb and says so on the wire.
ok("…routes a kind:'notification' frame to turn/steer while busy, and leaves human peer messages on thread/queue/add", /const peerKind = msg\.kind === 'notification' \? 'notification' : 'peer';/.test(w) && /if \(peerKind === 'notification' && meta\.activeTurnId\)/.test(w) && /const notifCid = `notif-\$\{process\.pid\}/.test(w) && /await steerInput\(encodeUserInput\(text, \[\]\), notifCid\)/.test(w) && /noteRecordedUserCid\(notifCid\);\n\s*recordPeerMessage\(false, notifCid\)/.test(w));
{
  const acp = read('data/bin/acp-wrapper.js');
  ok('the ACP wrapper accepts the same typed frame and REPORTS that it cannot steer (ACP v1 has no such method) instead of silently queueing', /const peerKind = msg\.kind === 'notification' \? 'notification' : 'peer';/.test(acp) && /steer: 'unsupported'/.test(acp));
}
const cd = read('src/server/conversation-deliver.js');
ok('the LADDER tags the frame and never decides the lane itself (only the wrapper knows whether a turn is running)', /const kind = opts\.kind === 'notification' \? 'notification' : 'peer';/.test(cd) && /type: 'peer-message', text, fromName: opts\.fromName \|\| null, cardText: opts\.cardText \|\| null, kind \}/.test(cd));
const jb = read('src/jobs.js');
// Asserted by MEMBERSHIP, not verbatim: the options object gained
// `spendReason` with the spend ceiling (design-account-hardening §4.4c), and a
// pin on the exact literal fails for a field ADDED beside the one it protects.
ok("jobs.js TYPES its owner notifications (the wiring pin: a rule with no call site is dead code)", /deliverToConversation\(cid, text, \{[^}]*fromName: 'Background Work · ' \+ \(job\.name \|\| job\.id\)[^}]*kind: 'notification'[^}]*\}\)/.test(jb));
const ar = read('src/agent-routes.js');
ok('…while vibespace-msg (a PERSON writing to another session) passes no kind at all ⇒ peer', /deliver\.deliverToConversation\(target\.cid, framed, \{(?![^}]*\bkind:)[^}]*fromName[^}]*cardText: text[^}]*\}\)/.test(ar) && !/msg\/send[\s\S]{0,2000}kind: 'notification'/.test(ar));
const sp = read('src/lib/session-props.js');
ok('Session Properties STATES the rule (derived from the caps row, never a backend id)', /notificationDeliveryFor\(s\.backend \|\| 'claude'\)/.test(sp) && /Steered into the running turn/.test(sp) && /carries only itself/.test(sp));
const cev = read('src/server/stdout/codex-events.js');
ok('a notification that could NOT be steered is LOUD about the lane it took instead (no silent divergence from the documented rule)', /msg\.payload\.ok === true && msg\.payload\.steerFailed/.test(cev) && /turn\/steer refused/.test(cev));

// ── wiring pins (the 2.355.0 lesson: a pure fix with an unstaged call site stays dead while unit tests glow green) ──
const srv = read('server.js');
ok('server.js DESTRUCTURES recordCodexQuotaSignal from the engine (was exported-but-never-wired: the whole codex quota chain silently dead)', /probeUsageViaSession, recordCodexQuotaSignal, recordRateLimitEvent/.test(srv));
// The pin is MEMBERSHIP in the literal, not the literal's exact tail: anchoring
// on `… usageEstimator }` made this assert a hostage of whichever name happens
// to be last (2026-09-13 r3 added three and broke it). Slice the balanced
// `engine: { … }` that session-stdout is constructed with and ask whether the
// name is in it — the same shape test-fable-cap-pool-storm §10 generalises to
// every name the registered consumers destructure.
const stdoutEngineLiteral = (() => {
  const i = srv.indexOf("require('./src/server/session-stdout.js').create({");
  const s0 = srv.indexOf('{', srv.indexOf('engine: {', i));
  let d = 0;
  for (let j = s0; j < srv.length; j++) {
    if (srv[j] === '{') d++;
    else if (srv[j] === '}') { d--; if (!d) return srv.slice(s0 + 1, j); }
  }
  return '';
})();
ok('…and forwards it to session-stdout in the engine object',
  /(^|[,{\s])recordCodexQuotaSignal\s*[,}]/.test(stdoutEngineLiteral + '}'), stdoutEngineLiteral.slice(0, 120));
ok('…and passes getDeliver for the re-stash fallback', /getDeliver: \(\) => \{ try \{ return deliver; \} catch \{ return null; \} \}/.test(srv));
const ss = read('src/server/stdout/codex-events.js'); // S5: the codex-events consumer module
ok('stdout/codex-events re-stashes on peer_message_result ok:false (a promised message is never silently lost), keeping the echoed label', /peer_message_result' && msg\.payload\.ok === false && msg\.payload\.text/.test(ss) && /stashFor\?\.\(cid, \{ source: 'agent', fromName: msg\.payload\.fromName \|\| null, text: String\(msg\.payload\.text\) \}\)/.test(ss));
// …and it reaches stashFor THROUGH the lazy ref rather than calling it (round
// 3, reproduced): `deliverRef` is an mk() Proxy over a plain `{}` — truthy but
// NOT callable — so the shipped `deliverRef()?.stashFor(...)` threw TypeError
// into a bare `catch {}` on every failed delivery: the log line above said
// "re-stashing" and nothing was stashed. This grep only pins the SPELLING; the
// FUNCTIONAL proof (feed the record through the real stdout registry with an
// mk()-wrapped ref and assert stashFor received it, plus a drift guard over
// every consumer) lives in scripts/test-permission-rules.mjs, because a pin
// like this one is exactly what made the broken line look protected.
// Comment lines are exempt from the negative half — they are where the retired
// spelling is NAMED so the next reader knows what not to write.
const codeOnly = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
ok('…through the lazy ref, never CALLING it (a mk() Proxy is not a function — the shipped `deliverRef()` threw into a bare catch)', /deliverRef\?\.stashFor\?\./.test(ss) && !/deliverRef\s*\(/.test(codeOnly(ss)));
ok('…and the degrade catch on that path REPORTS instead of swallowing (2.276.0 — the silent catch is why this lived)', /catch \(e\) \{ console\.warn\(`\[deliver\] \$\{id\}: re-stash failed/.test(ss));
const acpEv = read('src/server/stdout/acp-events.js');
ok('ACP twin: same two properties on its own peer_result lane (the two consumers were copies of each other, so the bug was too)', /deliverRef\?\.stashFor\?\./.test(acpEv) && !/deliverRef\s*\(/.test(codeOnly(acpEv)) && /re-stash failed/.test(acpEv));
// NEGATIVE CONTROL: the shipped line really is what this pair rejects, and the
// replacement really is what it accepts (otherwise "no offender" is a regex bug).
ok('NEGATIVE CONTROL: the pin rejects the exact line that shipped and accepts the one that replaced it', (() => {
  const bad = "            try { if (cid) deliverRef()?.stashFor(cid, { source: 'agent' }); } catch {}";
  const good = "            try { if (cid) deliverRef?.stashFor?.(cid, { source: 'agent' }); } catch (e) {}";
  return /deliverRef\s*\(/.test(codeOnly(bad)) && !/deliverRef\s*\(/.test(codeOnly(good));
})());
const wf = read('src/server/wrapper-files.js');
ok('wrapperCaps surfaces peerMessage (stateless, negative verdicts never cached)', /peerMessage: !!\(caps && caps\.peerMessage\)/.test(wf));

fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
