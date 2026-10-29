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
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { stopWrapper } from './scratch.mjs';
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
  const files = ['src/jobs.js', 'src/server/browser-handback.js', 'src/server/channel-api-cards.js', 'src/server/channels-engine.js', 'src/server/channels-outbound.js', 'src/server/stash-handover.js'];   // + the stash hand-over (2026-09-27), + B-2198's raw-API receipt (int212)
  const producers = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) walk(rel); else if (/\.js$/.test(e.name) && /deliverToConversation\([^;]*kind: 'notification'/.test(read(rel))) producers.push(rel); } };
  walk('src');
  ok(`…the census finds every kind:'notification' producer (${producers.join(', ')})`, JSON.stringify(producers.sort()) === JSON.stringify(files.slice().sort()), producers);
  for (const f of producers) ok(`…${f} speaks under a sender the list names`, NS.NOTIFICATION_SENDERS.some((p) => read(f).includes(p)), f);
  ok('NEGATIVE CONTROL: a producer file with an unlisted sender fails the census', !NS.NOTIFICATION_SENDERS.some((p) => "fromName: 'Somebody new · x', kind: 'notification'".includes(p)));
  // lane-pairing ⑥: the exit's display-only card ("ran `…` on <machine> — exit 0 · 1.2 s") speaks as "Machines · <machine>"
  // through feedPeerCard (never delivered, never billed) — its sender is a listed prefix and its producer names it
  const exitSrc = read('src/exit-proxy.js');
  ok("lane-pairing ⑥: 'Machines · ' is a notification sender, and src/exit-proxy.js's card producer speaks under it (kind notification)", NS.NOTIFICATION_SENDERS.includes('Machines · ') && /fromName: `Machines · \$\{machine\}`, kind: 'notification'/.test(exitSrc) && NS.isNotificationSender('Machines · Macbook') && NS.isVibespaceNotice('Machines · Macbook', 'ran `id` on Macbook — exit 0 · 0.1 s', 'notification'));
  ok('…and the card view titles it by the machine, the words as its body', JSON.stringify(NS.noticeCardView('Machines · Macbook', 'ran `id` on Macbook — exit 0 · 0.1 s')) === JSON.stringify({ title: { text: 'Machines · Macbook' }, body: 'ran `id` on Macbook — exit 0 · 0.1 s', folded: false }));
}

// stash still works as the final rung
deliver.stashFor(CID, { source: 'agent', fromName: 'A', text: 'queued' });
ok('the stash rung is intact (queued + drained once)', deliver.drainStash(CID).length === 1 && deliver.drainStash(CID).length === 0);

// ── wrapper contract pins ──
const w = read('data/bin/codex-chat-wrapper.js');
// caps grew a NON-boolean member in 2026-09-07 (`queueVerbs`, the verb table the
// running wrapper serves) — the advert this suite owns is still peerMessage.
ok('the codex wrapper adverts caps.peerMessage in its sidecar meta', /caps: \{ peerMessage: true(, [a-zA-Z]+: (?:true|[A-Z_]+))* \}/.test(w), /caps: \{[^}]*\}/.exec(w)?.[0]);
ok("…serves the 'peer-message' verb: busy ⇒ thread/queue/add, idle ⇒ turn/start", /msg\.type === 'peer-message'/.test(w) && /meta\.activeTurnId\) \{[\s\S]{0,600}?await request\('thread\/queue\/add'/.test(w) && /noteQueued\(cid, \{ kind: 'peer', msgId: '', from: fromName, text, via: peerKind \}\)/.test(w) && /await startTurn\(text\);/.test(w));
// The record grew TWO named facts (2026-09-07 rounds 2-3): which side of
// codex's own copy it lands on, and the submission id the app-server knows it
// by. The pin follows the shape; what it owns is unchanged — every lane writes
// the SAME labelled record.
ok('…records the peer user message itself (item notifications never carry userMessage) — with the webui_peer marker, on the steered, queued and turn paths', /const recordPeerMessage = \(afterCommit, queueCid\) => record\('response_item', \{\n\s*type: 'message', role: 'user', content: \[\{ type: 'input_text', text \}\],\n\s*webui_peer: \{ name: fromName, body: cardText, kind: peerKind(?:, \.\.\.\(peerChannel \? \{ channel: peerChannel \} : \{\}\))?(?:, \.\.\.\(peerGroup \? \{ group: peerGroup \} : \{\}\))? \},/.test(w) && /thread\/queue\/add[\s\S]{0,400}recordPeerMessage\(false, cid\);/.test(w) && /await startTurn\(text\);\s*\n\s*recordPeerMessage\(true, ''\);/.test(w));
ok('…reports peer_message_result on EVERY lane, echoing text + fromName on failure so the server can re-stash with its label', /peer_message_result', \{ ok: true, mode: 'steered' \}/.test(w) && /peer_message_result', \{ ok: true, mode: 'queued', \.\.\.fell \}/.test(w) && /peer_message_result', \{ ok: true, mode: 'turn', \.\.\.fell \}/.test(w) && /peer_message_result', \{ ok: false, reason: e\.message, text, fromName, kind: peerKind \}/.test(w));
// the NOTIFICATION rule, at the wrapper: typed frame → steer lane; unknown
// origin → peer; the ACP wrapper has no steer verb and says so on the wire.
ok("…routes a kind:'notification' frame to turn/steer while busy, and leaves human peer messages on thread/queue/add", /const peerKind = msg\.kind === 'notification' \? 'notification' : 'peer';/.test(w) && /if \(peerKind === 'notification' && meta\.activeTurnId\)/.test(w) && /const notifCid = `notif-\$\{process\.pid\}/.test(w) && /await steerInput\(encodeUserInput\(text, \[\]\), notifCid\)/.test(w) && /noteRecordedUserCid\(notifCid\);\n\s*recordPeerMessage\(false, notifCid\)/.test(w));
{
  const acp = read('data/bin/acp-wrapper.js');
  ok('the ACP wrapper accepts the same typed frame and REPORTS that it cannot steer (ACP v1 has no such method) instead of silently queueing', /const peerKind = msg\.kind === 'notification' \? 'notification' : 'peer';/.test(acp) && /steer: 'unsupported'/.test(acp));
}
const cd = read('src/server/conversation-deliver.js');
ok('the LADDER tags the frame and never decides the lane itself (only the wrapper knows whether a turn is running)', /const kind = opts\.kind === 'notification' \? 'notification' : 'peer';/.test(cd) && /type: 'peer-message', text, fromName: opts\.fromName \|\| null, cardText: opts\.cardText \|\| null, kind(?:, \.\.\.\(opts\.channel \? \{ channel: opts\.channel \} : \{\}\))?(?:, \.\.\.\(opts\.group \? \{ group: opts\.group \} : \{\}\))? \}/.test(cd));
const jb = read('src/jobs.js');
// Asserted by MEMBERSHIP, not verbatim: the options object gained
// `spendReason` with the spend ceiling (design-account-hardening §4.4c), and a
// pin on the exact literal fails for a field ADDED beside the one it protects.
ok("jobs.js TYPES its owner notifications (the wiring pin: a rule with no call site is dead code)", /deliverToConversation\(cid, text, \{[^}]*fromName: 'Background Work · ' \+ this\.labelOf\(job\)[^}]*kind: 'notification'[^}]*\}\)/.test(jb));
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
ok('stdout/codex-events re-stashes on peer_message_result ok:false (a promised message is never silently lost), keeping the echoed label and path (kind, S3 verify F3)', /peer_message_result' && msg\.payload\.ok === false && msg\.payload\.text/.test(ss) && /stashFor\?\.\(cid, \{ source: 'agent', kind: msg\.payload\.kind \|\| null, fromName: msg\.payload\.fromName \|\| null, text: String\(msg\.payload\.text\) \}\)/.test(ss));
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

// B-df40 part 1 (lane settings-prune): THE LADDER HAS NO RUNG 0. The experimental VibeSpace channel socket
// (agents.vibespaceChannel, data/channel-socks/<wid>.sock, peerMsg.postChannelEvent) is removed: with EVERY setting
// on — the retired key included — and a socket file left on disk for the live session, a peer message reaches the
// local CLI inbox (rung 1) exactly as before and the channel post is never called. The control is a PATCHED COPY of
// conversation-deliver.js with the old rung put back: the same assertion must read it as a channel delivery.
{
  const CHCID = 'cid-df40-0000-0000-0000-000000000001', CHWID = 'w-df40';
  fs.mkdirSync(path.join(dataDir, 'channel-socks'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channel-socks', CHWID + '.sock'), '');   // the leftover a session of the old build had
  const run = async (CDmod) => {
    const calls = { channel: 0, inbox: [] };
    const sessions = new Map([[CHWID, { backend: 'claude', mode: 'chat', claudeSessionId: CHCID, name: 'Ch', host: null }]]);
    const L = CDmod.create({
      dataDir,
      peerMsg: { findPeer: (c) => (c === CHCID ? { socketPath: '/nowhere.sock', name: 'Ch' } : null), postToPeer: async (peer, text) => { calls.inbox.push(text); return { ok: true }; }, postChannelEvent: async () => { calls.channel++; return { ok: true }; } },
      getHosts: () => null, getConvIndex: () => null, serverSetting: () => true, activeSessions: sessions, emitPeerCard: () => true,
      authorizeSpend: () => ({ ok: true, identity: { key: 'slot-a', name: 'A' }, hold: { id: 'h-df40' } }), noteSpend: () => { }, releaseSpend: () => { },
      log: () => { },
    });
    const r = await L.deliverToConversation(CHCID, 'hello from B', { fromName: 'session B' });
    return { r, calls };
  };
  const firstRungIsInbox = ({ r, calls }) => r.ok === true && r.lane === 'message' && calls.inbox.length === 1 && calls.inbox[0].includes('hello from B') && calls.channel === 0;
  const real = await run(require(path.join(REPO, 'src/server/conversation-deliver.js')));
  ok('B-df40: every setting on + a channel socket on disk ⇒ the peer message lands on rung 1 (the local CLI inbox), the channel post is never called', firstRungIsInbox(real), JSON.stringify({ r: real.r, channel: real.calls.channel, inbox: real.calls.inbox.length }));
  const cdSrc = read('src/server/conversation-deliver.js');
  ok('B-df40: the ladder names no channel socket, no postChannelEvent and journals no lane \'channel\' any more', !/postChannelEvent|channel-socks|vibespaceChannel|lane: 'channel'/.test(cdSrc));
  ok('B-df40: peer-messaging exports no postChannelEvent (the channel ingress is gone with its script)', !('postChannelEvent' in require(path.join(REPO, 'src/peer-messaging.js'))) && !fs.existsSync(path.join(REPO, 'data/bin/vibespace-channel.js')));
  const RUNG1 = "      // rung 1: this machine's CLI inbox registry\n";
  const RUNG0 = `      try {
        if (!noWake && serverSetting?.('agents.vibespaceChannel') === true && activeSessions) {
          for (const [wid, s] of activeSessions) {
            if (addressableId(s) !== cid) continue;
            const sock = path.join(dataDir, 'channel-socks', wid + '.sock');
            if (!fs.existsSync(sock)) continue;
            const rc = await peerMsg.postChannelEvent(sock, text, { kind: 'peer_message' });
            if (rc.ok) { spent(); cardOk(); return { ok: true, lane: 'channel', kind, peerName: s.name || null }; }
          }
        }
      } catch (e) { log('[deliver] channel lane failed (falling through):', e.message); }
`;
  ok('CONTROL scope: the anchor the patched copy re-adds the rung at is present once', cdSrc.split(RUNG1).length === 2);
  const M = mutantCopies('peer-delivery', REPO);
  const mutant = await run(M.load('src/server/conversation-deliver.js', cdSrc.replace(RUNG1, RUNG0 + RUNG1), 'rung0'));
  ok('NEGATIVE CONTROL: a patched copy with rung 0 put back delivers on the channel lane — the assertion above reads it as NOT the inbox (it can go red)', !firstRungIsInbox(mutant) && mutant.r.lane === 'channel' && mutant.calls.channel === 1 && mutant.calls.inbox.length === 0, JSON.stringify(mutant.r));
  // V1's shape at the spawn: a session option left over from the old build is ignored — no development-channels flag, no channel MCP server
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const argv = new ClaudeCodeAdapter({ claudeCmd: 'claude' }).buildSessionArgs({ cwd: '/tmp', mode: 'chat', vibespaceChannel: { script: '/x/vibespace-channel.js', sock: '/x/w.sock' } }).args;
  ok('B-df40: a spawn handed the old vibespaceChannel option builds argv without --dangerously-load-development-channels or a vibespace channel MCP config', Array.isArray(argv) && argv.includes('--settings') && !argv.includes('--mcp-config') && !argv.includes('--dangerously-load-development-channels') && !argv.some((a) => /VIBESPACE_CHANNEL_SOCK|vibespace-channel\.js/.test(String(a))), JSON.stringify(argv));
  const ccSrc = read('src/adapters/claude-code.js');
  const TUI = '    // TUI renderer for terminal-mode sessions';
  const OLD_PUSH = "    if (options.vibespaceChannel && options.vibespaceChannel.script) { args.push('--mcp-config', JSON.stringify({ mcpServers: { vibespace: { command: process.execPath, args: [options.vibespaceChannel.script], env: { VIBESPACE_CHANNEL_SOCK: options.vibespaceChannel.sock } } } })); args.push('--dangerously-load-development-channels', 'server:vibespace'); }\n";
  const { ClaudeCodeAdapter: MutAdapter } = M.load('src/adapters/claude-code.js', ccSrc.replace(TUI, OLD_PUSH + TUI), 'channel-flags');
  const mutArgv = new MutAdapter({ claudeCmd: 'claude' }).buildSessionArgs({ cwd: '/tmp', mode: 'chat', vibespaceChannel: { script: '/x/vibespace-channel.js', sock: '/x/w.sock' } }).args;
  ok('NEGATIVE CONTROL: a patched adapter with the old flag push put back emits --dangerously-load-development-channels for the same options (the argv leg can go red)', ccSrc.split(TUI).length === 2 && mutArgv.includes('--dangerously-load-development-channels') && mutArgv.includes('--mcp-config'));
}

// ── rung 1 over the REAL registry rule (lane peer-registry-identity, 2026-10-14) ──
// The hub after the 10:26 hard freeze: a resumed conversation has TWO registrations; the pre-freeze one's low pid now
// names another process (EPERM ⇒ "alive"), sorts first, and its socket is gone. The ladder over the REAL lookup (an
// injected registry dir) must post to the live record, and say "stale registration(s) only" when none passes.
{
  const PM = require(path.join(REPO, 'src/peer-messaging.js'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-peerid-'));
  const reg = path.join(root, 'sessions'); fs.mkdirSync(reg);
  const HCID = '5f4369df-0b7e-4c51-9d1a-2e8f6a7c3b10';
  const st = fs.readFileSync('/proc/self/stat', 'utf8'); const REAL = st.slice(st.lastIndexOf(')') + 2).split(' ')[19];
  const liveSock = path.join(root, 'live.sock'); const got = [];
  const srv = net.createServer((c) => { let b = ''; c.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\n')) >= 0) { got.push(JSON.parse(b.slice(0, i))); b = b.slice(i + 1); } }); });
  await new Promise((r) => srv.listen(liveSock, r));
  const stale = { pid: process.pid, sessionId: HCID, startedAt: 1791069101439, procStart: String(Number(REAL) + 113000), messagingSocketPath: path.join(root, 'pre-freeze.sock'), name: '企业助手', version: '2.1.296' };
  const live = { ...stale, startedAt: 1791912553717, procStart: String(REAL), messagingSocketPath: liveSock };
  const put = (files) => { for (const f of fs.readdirSync(reg)) fs.unlinkSync(path.join(reg, f)); for (const [f, r] of files) fs.writeFileSync(path.join(reg, f), JSON.stringify(r)); };
  const mk = (peerMsg) => { const logs = []; const d = require(path.join(REPO, 'src/server/conversation-deliver.js')).create({ dataDir: fs.mkdtempSync(path.join(root, 'd-')), peerMsg, getHosts: () => null, getConvIndex: () => null, serverSetting: () => false, activeSessions: new Map(), emitPeerCard: () => true, log: (...a) => logs.push(a.join(' ')) }); return { d, logs }; };
  const realPM = { findPeer: (c) => PM.findPeer(c, reg), lookupPeer: (c) => PM.lookupPeer(c, reg), postToPeer: PM.postToPeer };

  put([[`${process.pid}.json`, stale], [`9${process.pid}.json`, live]]);   // the stale file sorts first
  const A = mk(realPM);
  const ra = await A.d.deliverToConversation(HCID, 'Message from session "B": 现在交给它', { fromName: 'B' });
  await new Promise((r) => setTimeout(r, 100));
  ok('the hub\'s shape (stale record sorts first, its pid alive with another start time): rung 1 delivers to the LIVE record', ra.ok === true && ra.lane === 'message' && got.some((f) => f.type === 'user' && /现在交给它/.test(f.message.content)), JSON.stringify(ra));
  ok('…and the journal says nothing about stale registrations when one passed', !A.logs.some((l) => /stale registration/.test(l)), A.logs.join(' | '));

  put([[`${process.pid}.json`, stale]]);
  const B = mk(realPM); const nb = got.length;
  const rb = await B.d.deliverToConversation(HCID, 'only a stale record', { fromName: 'B' });
  const lb = B.logs.join('\n');
  ok('stale registrations only: nothing is posted, the ladder ends not-running', rb.ok === false && rb.notRunning === true && got.length === nb, JSON.stringify(rb));
  ok('…and the journal SAYS so: "stale registration(s) only — pid reused / socket absent" + the counts', lb.includes(`[deliver] ${HCID}: no live inbox on this machine — stale registration(s) only — pid reused / socket absent (candidates: 1, stale: 1 (pid-reused: 1, socket-absent: 1))`), lb);
  ok('…never "the conversation is not running" for a registry that held records', !/conversation is not running/.test(lb), lb);

  put([]);
  const C = mk(realPM);
  await C.d.deliverToConversation(HCID, 'no record at all', { fromName: 'B' });
  ok('no record of the session at all: rung 1 is silent (a codex / remote / stopped conversation is not a stale one)', !C.logs.some((l) => /stale registration|local peer post/.test(l)), C.logs.join(' | '));

  // a record that PASSED, then a final refusal: "not running" only when the re-judged registry has no passing record
  put([[`9${process.pid}.json`, live]]);
  const refuse = { ok: false, reason: 'socket error: connect ECONNREFUSED', code: 'ECONNREFUSED', phase: 'connect', transient: false };
  const D = mk({ ...realPM, postToPeer: async () => refuse });
  await D.d.deliverToConversation(HCID, 'refused by a live registration', { fromName: 'B' });
  ok('a final refusal while the registration still passes: the line says the socket refused a LIVE registration — not "not running"', D.logs.some((l) => /local peer post to .*live\.sock failed: socket error: connect ECONNREFUSED .* — the socket refused the post, though a registration still passes its identity check \(pid \d+, pid\+start; candidates: 1, stale: 0\)/.test(l)) && !D.logs.some((l) => /not running/.test(l)), D.logs.join(' | '));
  const E = mk({ ...realPM, postToPeer: async () => { put([]); return { ...refuse, reason: 'socket error: connect ENOENT', code: 'ENOENT' }; } });
  await E.d.deliverToConversation(HCID, 'the CLI exited between the lookup and the post', { fromName: 'B' });
  ok('…the CLI gone between the lookup and the post (no record passes now): "the socket is not served: the conversation is not running"', E.logs.some((l) => /failed: socket error: connect ENOENT .* — the socket is not served: the conversation is not running$/.test(l)), E.logs.join(' | '));
  put([[`9${process.pid}.json`, live]]);
  const F = mk({ ...realPM, postToPeer: async () => { put([[`${process.pid}.json`, stale]]); return { ...refuse, reason: 'socket error: connect ENOENT', code: 'ENOENT' }; } });
  await F.d.deliverToConversation(HCID, 'only a stale record is left after the miss', { fromName: 'B' });
  ok('…only stale records left after the miss: the line names them (stale registration(s) only + the counts)', F.logs.some((l) => /— the socket is not served: stale registration\(s\) only — pid reused \/ socket absent \(candidates: 1, stale: 1 \(pid-reused: 1, socket-absent: 1\)\)$/.test(l)), F.logs.join(' | '));

  // RED CONTROL: the base's lookup (the FIRST record whose pid answers kill -0) behind the same ladder posts to the
  // stale socket and stashes — the owner's 「联系不上这个 agent」
  const src = read('src/peer-messaging.js');
  const RULE = '    const v = registryIdentityOk(rec, pr);\n';
  const CHOICE = '    if (!best || startedOf(rec) > startedOf(best.rec)) best = { rec, identity: v.identity };\n';
  const M = mutantCopies('peerid-deliv', REPO);
  const Old = M.load('src/peer-messaging.js', src.replace(RULE, "    const v = rec.messagingSocketPath && pidAlive(rec.pid) ? { ok: true, reasons: [], identity: 'pid-only' } : { ok: false, reasons: ['pid-gone'] };\n").replace(CHOICE, '    if (!best) best = { rec, identity: v.identity };\n'), 'pidonly');
  put([[`${process.pid}.json`, stale], [`9${process.pid}.json`, live]]);
  const n0 = got.length;
  const G = mk({ findPeer: (c) => Old.findPeer(c, reg), postToPeer: PM.postToPeer });
  const rg = await G.d.deliverToConversation(HCID, 'pid-only rule', { fromName: 'B' });
  ok('RED CONTROL: the pid-only first-record lookup behind the same ladder posts to the STALE socket and fails not-running (the incident)', rg.ok === false && rg.notRunning === true && got.length === n0 && G.logs.some((l) => l.includes('pre-freeze.sock failed: socket error: connect ENOENT')), JSON.stringify(rg) + ' | ' + G.logs.join(' | '));
  srv.close();
  fs.rmSync(root, { recursive: true, force: true });
}

// ── lane agy-peer-wake: RUNG 1.5 FOR AN ANTIGRAVITY SESSION — THE FRAME ROUND TRIP, never a hand-declared lane ──
// The owner (2026-10-24) woke a LIVE Antigravity conversation with `vibespace-msg send … --wake` and was told «woke 0
// agents · 1 wake refused»: the row said stash-only and the wrapper adverted peerMessage:false, though it served the
// frame. Here the REAL ladder writes into the REAL agy wrapper (its own sidecar is the advert findRpcPeer reads) over
// the fake agy, and the wrapper's stdout goes through the REAL acp-events consumer, whose `peer_result` handlers
// re-stash and SETTLE — the whole road the owner's message takes, measured.
{
  const { spawn } = await import('node:child_process');
  const { addressableId } = require(path.join(REPO, 'src/claude-lock-capture.js'));
  const { notificationDelivery, deriveInputModes } = require(path.join(REPO, 'src/backend-caps.js'));
  const { wrapperCaps } = require(path.join(REPO, 'src/server/wrapper-files.js'));
  const M = require(path.join(REPO, 'src/job-model.js'));
  const AGY_WRAPPER = path.join(REPO, 'data/bin/agy-wrapper.js'), AGY_STUB = path.join(REPO, 'scripts/fixtures/antigravity-agy');
  const HOLD = path.join(REPO, 'scripts/fixtures/sidecar-write-hold.cjs');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agy-peer-'));
  const BUF = path.join(D, 'session-buffers');
  fs.mkdirSync(BUF, { recursive: true });
  // a wrapper COPY lives at <root>/data/bin beside <root>/src → the repo's src (its requires of src/ resolve)
  fs.mkdirSync(path.join(D, 'red', 'data', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'src'), path.join(D, 'red', 'src'));
  const wsrc = read('data/bin/agy-wrapper.js');
  const ADVERT = 'caps: { frameFile: true, peerMessage: true, notificationSteer: false,';
  const RED = path.join(D, 'red', 'data', 'bin', 'agy-wrapper.js');
  fs.writeFileSync(RED, wsrc.replace(ADVERT, 'caps: { frameFile: true, peerMessage: false,'));
  // …and the same red copy with the PRE-.358 sidecar write (in place: truncate, then the bytes) — ④'s negative control
  const ATOMIC = 'fs.writeFileSync(tmp, JSON.stringify(meta)); fs.renameSync(tmp, metaFile);';
  fs.mkdirSync(path.join(D, 'inplace', 'data', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'src'), path.join(D, 'inplace', 'src'));
  const INPLACE = path.join(D, 'inplace', 'data', 'bin', 'agy-wrapper.js');
  fs.writeFileSync(INPLACE, fs.readFileSync(RED, 'utf8').replace(ATOMIC, 'fs.writeFileSync(metaFile, JSON.stringify(meta));'));
  const until = async (pred, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = pred(); if (v) return v; await new Promise((r) => setTimeout(r, 15)); } throw new Error('timeout: ' + what); };
  const env0 = { ...process.env };
  for (const k of Object.keys(env0)) if (/^VIBESPACE_|^ACP_WEBUI_|^AGY_|^CLAUDE_CODE_/.test(k)) delete env0[k];
  const ACID = 'a9e7c0de-1111-4222-8333-444455556666', RCID = 'a9e7c0de-1111-4222-8333-777788889999';
  const AWID = 'sess-90-1000', RWID = 'sess-91-1000', OWID = 'sess-93-1000';
  const OCID = 'a9e7c0de-1111-4222-8333-aaaabbbbcccc';
  const stubLog = (wid) => path.join(D, wid + '.stub.log');
  const lines = (wid) => { try { return fs.readFileSync(stubLog(wid), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.stdin).map((x) => JSON.parse(x.stdin).message.content); } catch { return []; } };
  // HOME = the scratch dir: the wrapper's store reads and the fake agy see nobody's real store
  // `hold` = a dir: the wrapper runs under the hold preload (its next sidecar write, once armed, held between truncate and bytes)
  const startAgy = (wrapper, wid, cid, hold = null) => spawn(process.execPath, [...(hold ? ['--require', HOLD] : []), wrapper, path.join(BUF, wid + '.buf'), path.join(BUF, wid + '.json'), AGY_STUB], {
    env: { ...env0, HOME: D, AGY_WEBUI_CWD: D, AGY_WEBUI_BACKEND: 'antigravity', AGY_WEBUI_RESUME_ID: cid, AGY_WEBUI_AUTH_GRACE_MS: '400', AGY_STUB_SLOW_MS: '900', AGY_STUB_LOG: stubLog(wid), ...(hold ? { VS_HOLD_DIR: hold } : {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const HOLD_R = path.join(D, 'hold-red'), HOLD_O = path.join(D, 'hold-inplace');
  for (const h of [HOLD_R, HOLD_O]) fs.mkdirSync(h);
  const kids = [startAgy(AGY_WRAPPER, AWID, ACID), startAgy(RED, RWID, RCID, HOLD_R), startAgy(INPLACE, OWID, OCID, HOLD_O)];
  const [A, R, O] = kids;
  try {
    // the session the hub holds: backendSessionId comes from the wrapper's own `session` record (the consumer adopts it)
    const S = { backend: 'antigravity', mode: 'chat', backendSessionId: null, claudeSessionId: null, name: 'AgyPeer', host: null, buffer: '', sockName: null, socketPath: path.join(D, 'cw-' + AWID), pty: { write: (s) => { frames.push(String(s)); A.stdin.write(s); } } };
    const RS = { backend: 'antigravity', mode: 'chat', backendSessionId: RCID, claudeSessionId: null, name: 'AgyOld', host: null, buffer: '', sockName: null, socketPath: path.join(D, 'cw-' + RWID), pty: { write: (s) => { redFrames.push(String(s)); R.stdin.write(s); } } };
    const IS = { backend: 'antigravity', mode: 'chat', backendSessionId: OCID, claudeSessionId: null, name: 'AgyInPlace', host: null, buffer: '', sockName: null, socketPath: path.join(D, 'cw-' + OWID), pty: { write: (s) => { inFrames.push(String(s)); O.stdin.write(s); } } };
    const OS = { backend: 'opencode', mode: 'chat', backendSessionId: 'oc-live-1', claudeSessionId: null, name: 'Oc', host: null, pty: { write: () => { } } };
    const frames = [], redFrames = [], inFrames = [];
    const money = { auth: 0, note: 0, release: 0 };
    const L = require(path.join(REPO, 'src/server/conversation-deliver.js')).create({
      dataDir: D,
      peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false, reason: 'unused' }), postChannelEvent: async () => ({ ok: false }) },
      getHosts: () => null, getConvIndex: () => null, serverSetting: () => false,
      activeSessions: new Map([[AWID, S], [RWID, RS], ['sess-92-1000', OS], [OWID, IS]]), emitPeerCard: () => true,
      authorizeSpend: () => { money.auth++; return { ok: true, identity: { key: 'slot-a', name: 'A' }, hold: { id: 'h' + money.auth } }; },
      noteSpend: () => { money.note++; }, releaseSpend: () => { money.release++; },
      log: () => { },
    });
    // the REAL consumer over the wrapper's stdout; its deliverRef is the ladder (settles + stashes are recorded)
    const settles = [], logs = [];
    const deliverRef = { ...L, settleRpcDelivery: (cid, o) => { const v = L.settleRpcDelivery(cid, o); settles.push({ cid, ...o, v, at: Date.now() }); return v; } };
    const C = require(path.join(REPO, 'src/server/stdout/acp-events.js')).create({ engine: { noteTurnEnd: () => { } }, noteHarnessModels: () => { }, deliverRef, permissionRulesRef: null });
    const noop = () => { };
    const log0 = console.log;
    console.log = (...a) => { const s = a.join(' '); if (s.startsWith('[deliver]')) logs.push(s); else log0(...a); };
    try {
      C.attach(S, AWID, { onData: (cb) => { A.stdout.setEncoding('utf8'); A.stdout.on('data', cb); } }, { feedLive: noop, broadcastToSession: noop, broadcastActiveSessions: noop, readSessionMeta: () => null, writeSessionMeta: noop, updateSessionTodos: noop });
      await until(() => S.backendSessionId === ACID, 8000, 'the session record adopted');
      ok('agy-peer-wake: the live agy session is ADDRESSED by its own conversation id (addressableId = the backendSessionId its wrapper journaled — the cid vibespace-msg resolves; agy has no fork, so the verify-r6 rule never hides it)', addressableId(S) === ACID && S.claudeSessionId === null, JSON.stringify({ a: addressableId(S), b: S.backendSessionId }));
      // the CONTENT, never the file (ci358-reds item 7): an in-place sidecar exists from its first truncate on
      await until(() => [AWID, RWID, OWID].every((w) => wrapperCaps(BUF, w, null).reason === 'ok'), 5000, 'the three sidecars, each carrying its caps');
      ok("agy-peer-wake: the antigravity row rides rung 1.5 — peerDelivery 'rpc-queue' — and the REAL wrapper's sidecar adverts peerMessage", capsOf('antigravity').peerDelivery === 'rpc-queue' && wrapperCaps(BUF, AWID, S.socketPath).peerMessage === true && L.peerReachable(ACID) === true);
      // ① IDLE ⇒ THE WAKE
      const t0 = Date.now();
      const r1 = await L.deliverToConversation(ACID, 'Message from session "B": wake up, agy', { fromName: 'session B', cardText: 'wake up, agy' });
      ok("agy-peer-wake ①: an IDLE agy session — the ladder answers ok on lane 'rpc-queue' (never the stash), not predicted free", r1.ok === true && r1.lane === 'rpc-queue' && r1.steered === false && r1.peerName === 'AgyPeer' && frames.length === 1 && JSON.parse(frames[0]).type === 'peer-message', JSON.stringify(r1));
      const s1 = await until(() => settles[0], 8000, 'the first settle');
      const rtt = s1.at - t0;
      ok(`agy-peer-wake ①: …the wrapper's answer comes back through acp-events and SETTLES the frame: mode 'turn' → 'already-charged' (charged once, at the write) — the measured round trip: ${rtt} ms`, s1.cid === ACID && s1.ok === true && s1.mode === 'turn' && s1.v === 'already-charged' && money.note === 1 && money.release === 0, JSON.stringify({ s1, money }));
      await until(() => lines(AWID).length >= 1, 5000, 'the line reached agy');
      ok('agy-peer-wake ①: …and agy got ONE line: the «Message from session B:» head + the words (a billed turn opened = the wake)', lines(AWID)[0] === 'Message from session B:\nMessage from session "B": wake up, agy', lines(AWID));
      // ② BUSY: a notification is NOT predicted free (agy's steer is a stop + a new turn) — charged at the write, queued
      await until(() => S._isStreaming === false, 8000, 'the peer turn ended');
      A.stdin.write(JSON.stringify({ type: 'chat-input', text: 'a slow one', msgId: 'u-slow' }) + '\n');
      await until(() => S._isStreaming === true, 5000, 'busy');
      ok("agy-peer-wake ②: the derived lane — antigravity's notifications take 'queue' (its row DECLARES steerJoinsTurn:false), codex's still 'steer'", notificationDelivery(capsOf('antigravity')) === 'queue' && notificationDelivery(capsOf('codex')) === 'steer' && capsOf('antigravity').inputModes.steer === true);
      ok("agy-peer-wake ②: RED CONTROL — the same verb list WITHOUT the declaration derives 'steer': the busy notification would be predicted FREE (the lie a stop + new turn would bill)", notificationDelivery({ peerDelivery: 'rpc-queue', inputModes: deriveInputModes({ queue: true, queueVerbs: capsOf('antigravity').inputModes.queueVerbs }) }) === 'steer');
      ok('agy-peer-wake ②: …and the PROCESS says it too: wrapperCaps takes the explicit notificationSteer:false over its list\'s derived true (explicit beats derived)', wrapperCaps(BUF, AWID, S.socketPath).notificationSteer === false && wrapperCaps(BUF, AWID, S.socketPath).queueVerbs.includes('steer'));
      const r2 = await L.deliverToConversation(ACID, '[VibeSpace Background Work] task "nightly" (job-1): done.', { fromName: 'Background Work · nightly', kind: 'notification', spendReason: 'job-notification' });
      ok('agy-peer-wake ②: a notification to the BUSY agy is written, steered:false, and CHARGED at the write (a billed turn is never predicted free)', r2.ok === true && r2.steered === false && frames.length === 2 && JSON.parse(frames[1]).kind === 'notification' && money.note === 2, JSON.stringify({ r2, money }));
      const s2 = await until(() => settles[1], 5000, 'the second settle');
      ok("agy-peer-wake ②: …the wrapper answers mode 'queued' (settle: 'already-charged') and the consumer SAYS the notification found no steer (codex's steerFailed twin)", s2.mode === 'queued' && s2.v === 'already-charged' && logs.some((l) => /rpc-queue: no steer into the running turn on antigravity — the notification took the 'queued' lane instead/.test(l)), JSON.stringify({ s2, logs }));
      const r3 = await L.deliverToConversation(ACID, '[VibeSpace] a receipt', { fromName: 'Channels · API', kind: 'notification', noWake: true, spendReason: 'channel-receipt' });
      ok('agy-peer-wake ②: a noWake notice to the busy agy is REFUSED before any frame, its words true ("would not join the running turn"), the hold given back', r3.ok === false && r3.refused === 'no-wake' && /would not join the running turn/.test(r3.reason) && frames.length === 2 && money.release === 1, JSON.stringify({ r3, money }));
      // ③ a queued peer dropped by Stop goes BACK: ok:false + its words, mode-less (about an earlier frame) ⇒ re-stashed
      const r4 = await L.deliverToConversation(ACID, 'one more thing', { fromName: 'session C', cardText: 'one more thing' });
      await until(() => settles[2], 5000, 'the third settle');
      A.stdin.write(JSON.stringify({ type: 'interrupt' }) + '\n');
      await until(() => L.stashEntries(ACID).length >= 2, 5000, 'the re-stash');
      const st = L.stashEntries(ACID);
      ok('agy-peer-wake ③: Stop drops the queue (the owner\'s law) and the two queued frames come BACK — the REAL consumer re-stashes their words with their sender and path', r4.ok === true && st.some((e) => e.text === 'one more thing' && e.fromName === 'session C' && e.kind === 'peer') && st.some((e) => /task "nightly"/.test(e.text) && e.kind === 'notification'), JSON.stringify(st.map((e) => [e.text, e.fromName, e.kind])));
      ok("agy-peer-wake ③: …and those answers settle NOTHING ('not-ours' — mode-less, about earlier frames): every frame was charged exactly once", settles.slice(3).every((s) => s.v === 'not-ours' && s.mode === null) && settles.slice(3).length === 2 && money.note === 3, JSON.stringify({ tail: settles.slice(3), money }));
      // ④ THE RED COPY: the same wrapper with peerMessage:false — findRpcPeer skips it, nothing is written, and the miss
      // names the cure (the owner's own conversation: its wrapper predates this lane until the session restarts).
      // ASKED WHILE ITS SIDECAR IS BEING WRITTEN (ci358-reds item 7, the .358 mirror's fast red: the runner's ④ landed on
      // the copy's own sidecar write, which truncated the file before its bytes — the ladder read it EMPTY, 'no-sidecar',
      // and said «no live inbox … any reachable machine»). Both copies' next sidecar write is HELD between its truncate and
      // its bytes (armed, then a queue-resync makes the write) and ④ asks inside the hold: the runner's order, every run.
      for (const h of [HOLD_R, HOLD_O]) fs.writeFileSync(path.join(h, 'arm'), '');
      for (const k of [R, O]) k.stdin.write(JSON.stringify({ type: 'queue-resync' }) + '\n');
      await until(() => fs.existsSync(path.join(HOLD_R, 'held')) && fs.existsSync(path.join(HOLD_O, 'held')), 5000, 'both copies\' next sidecar write held (armed + a queue-resync)');
      const heldOf = (h) => fs.readFileSync(path.join(h, 'held'), 'utf8');
      const seen = (wid) => { let bytes = -1; try { bytes = fs.statSync(path.join(BUF, wid + '.json')).size; } catch { } return { bytes, read: wrapperCaps(BUF, wid, null).reason }; };   // what the leg saw
      const rr = await L.deliverToConversation(RCID, 'wake up, old one', { fromName: 'session B' });
      const seenR = seen(RWID);
      ok('agy-peer-wake ④: RED COPY (peerMessage:false, the base advert) — findRpcPeer SKIPS it: no frame, the ladder misses (asked while its sidecar write is held: the held bytes are a temp file\'s, the sidecar stays whole)', wsrc.includes(ADVERT) && heldOf(HOLD_R).startsWith(path.join(BUF, RWID + '.json.')) && seenR.read === 'ok' && wrapperCaps(BUF, RWID, RS.socketPath).peerMessage === false && rr.ok === false && redFrames.length === 0 && !rr.notRunning, JSON.stringify({ rr, sidecar: seenR, held: heldOf(HOLD_R) }));
      ok('agy-peer-wake ④: …and the miss SAYS it is running with a process that predates live messages + the cure (restart), never «no live inbox … any reachable machine»', /running, but its agent's process predates live messages — restart the session/.test(rr.reason) && !/no live inbox/.test(rr.reason) && M.heldKind(rr, rr.reason) === 'not-reachable', rr.reason + ' | sidecar ' + JSON.stringify(seenR));
      const ri = await L.deliverToConversation(OCID, 'wake up, old one', { fromName: 'session B' });
      const seenI = seen(OWID);
      ok('agy-peer-wake ④: NEGATIVE CONTROL — the pre-.358 IN-PLACE sidecar write under the same hold shows the ladder an EMPTY file: «no live inbox … any reachable machine», notRunning — the runner\'s ✗ (the two legs above can go red)', wsrc.split(ATOMIC).length === 2 && heldOf(HOLD_O) === path.join(BUF, OWID + '.json') && seenI.bytes === 0 && seenI.read === 'no-sidecar' && ri.ok === false && ri.notRunning === true && /no live inbox for this conversation on any reachable machine/.test(ri.reason) && inFrames.length === 0, JSON.stringify({ ri, sidecar: seenI, held: heldOf(HOLD_O) }));
      for (const h of [HOLD_R, HOLD_O]) fs.writeFileSync(path.join(h, 'release'), '');
      // …and every chat wrapper the hub reads with wrapperCaps writes its sidecar the same way (a temp file renamed over it)
      const persistOf = (f) => { const t = read(f), i = t.indexOf('function persistMeta() {'); return i < 0 ? '' : t.slice(i, t.indexOf(t[i + 24] === '\n' ? '\n}\n' : '\n', i)); };
      const WRAPPERS = ['data/bin/chat-wrapper.js', 'data/bin/codex-chat-wrapper.js', 'data/bin/acp-wrapper.js', 'data/bin/agy-wrapper.js'];
      ok('…every chat wrapper REPLACES its sidecar (temp file + rename), none rewrites it in place (ci358-reds item 7)', WRAPPERS.every((f) => /fs\.renameSync\(tmp, metaFile\)/.test(persistOf(f)) && !/writeFileSync\(metaFile/.test(persistOf(f))), WRAPPERS.filter((f) => !/fs\.renameSync\(tmp, metaFile\)/.test(persistOf(f)) || /writeFileSync\(metaFile/.test(persistOf(f))));
      // ci358-reds round 2: the pin's scope is the WHOLE file — the boot write included (chat-wrapper's went through writeFileSync(metaFile)
      // until round 2); the one in-place write left is the exit record (overwriteIfPresent: opened r+, never truncated, padded to the
      // old length — it must never recreate a sidecar the hub already removed)
      ok('…no chat wrapper writes its sidecar with writeFileSync(metaFile, …) ANYWHERE — the boot write is persistMeta\'s too (ci358-reds round 2)', WRAPPERS.every((f) => !/writeFileSync\(metaFile/.test(read(f))) && /\{ const e = persistMeta\(\); if \(e\) log\(`meta write failed/.test(read('data/bin/chat-wrapper.js')), WRAPPERS.filter((f) => /writeFileSync\(metaFile/.test(read(f))).join(' ') || 'chat-wrapper\'s boot write is not persistMeta');
      ok('…and a write or rename that throws unlinks its own temp (best-effort) — a temp is left only by a wrapper killed between the two, the age sweep\'s business', WRAPPERS.every((f) => /catch(?: \(e\))? \{ try \{ fs\.unlinkSync\(tmp\); \} catch \{ ?\}/.test(persistOf(f))), WRAPPERS.filter((f) => !/catch(?: \(e\))? \{ try \{ fs\.unlinkSync\(tmp\); \} catch \{ ?\}/.test(persistOf(f))).join(' '));
      const ro = await L.deliverToConversation('oc-live-1', 'hello opencode', { fromName: 'session B' });
      ok('agy-peer-wake ④: a RUNNING session whose harness has no live lane (opencode, stash-only) is said as running — not "not running"', ro.ok === false && /running, but its agent takes no message mid-session/.test(ro.reason) && !ro.notRunning, JSON.stringify(ro));
      const rn = await L.deliverToConversation('no-such-conversation', 'hello?', { fromName: 'session B' });
      ok('agy-peer-wake ④: …while a conversation running NOWHERE keeps its words + type (the classifier still reads it not-running)', rn.ok === false && rn.notRunning === true && /no live inbox for this conversation on any reachable machine/.test(rn.reason) && M.heldKind(rn, rn.reason) === 'not-running', JSON.stringify(rn));
    } finally { console.log = log0; }
  } catch (e) { ok('agy-peer-wake: the round trip ran to its end (a timeout here = a leg above never got its answer)', false, e.message); }
  finally {
    for (const h of [HOLD_R, HOLD_O]) { try { fs.writeFileSync(path.join(h, 'release'), ''); } catch { } }   // a leg that threw inside the hold
    await Promise.all(kids.map((k) => stopWrapper(k)));   // §55: the wrapper's SIGTERM record lands before the dir goes
    await stopWrapper(null, { dir: D });
  }
}

// ── ci358-reds round 2: THE AGE SWEEP reaps a sidecar temp a dead wrapper left (killed between its temp write and the rename) ──
{
  const { sweepAgedWrapperFiles } = require(path.join(REPO, 'src/server/wrapper-files.js'));
  const SD = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agesweep-'));
  const now = Date.now(), cutoff = now - 7 * 86400000, aged = (now - 8 * 86400000) / 1000;
  const plant = (fn, old) => { const p = path.join(SD, fn); fs.writeFileSync(p, '{"pid":4242}'); if (old) fs.utimesSync(p, aged, aged); return p; };
  const deadTmp = plant('sess-7-1000.json.4242.tmp', true), deadBuf = plant('sess-7-1000.buf', true), deadSide = plant('sess-7-1000.json', true);
  const youngTmp = plant('sess-8-1000.json.4343.tmp', false), liveTmp = plant('sess-9-1000.json.4444.tmp', true), stranger = plant('notes.json.tmp', true);
  let n = null;
  try { n = sweepAgedWrapperFiles(SD, { cutoff, isActive: (id) => id === 'sess-9-1000' }); } catch (e) { n = 'threw: ' + e.message; }
  const left = `swept ${n}; left: ${fs.readdirSync(SD).sort().join(' ')}`;
  ok('age sweep (ci358-reds round 2): a sidecar TEMP untouched for longer than the age, of a session not live, is REAPED', !fs.existsSync(deadTmp), left);
  ok('age sweep: …beside the old law\'s own files — the dead session\'s aged .buf and .json go too (3 unlinked)', !fs.existsSync(deadBuf) && !fs.existsSync(deadSide) && n === 3, left);
  ok('age sweep CONTROL: a temp YOUNGER than the age is left alone', fs.existsSync(youngTmp), left);
  ok('age sweep CONTROL: a LIVE session\'s aged temp is left alone (the same id rule as its .buf / .json)', fs.existsSync(liveTmp), left);
  ok('age sweep CONTROL: a file not shaped <id>.buf / <id>.json / <id>.json.<pid>.tmp is never touched', fs.existsSync(stranger), left);
  ok('age sweep WIRING: server.js\'s boot sweep IS this function over BUFFERS_DIR with the live-session check — no inline pattern of its own', /sweepAgedWrapperFiles\(BUFFERS_DIR, \{ cutoff, isActive: \(id\) => activeSessions\.has\(id\) \}\)/.test(srv) && !srv.includes('(buf|json)'));
  fs.rmSync(SD, { recursive: true, force: true });
}

fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
