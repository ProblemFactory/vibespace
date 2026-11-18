#!/usr/bin/env node
// THE PEER CARD AT TURN START (inc-mu6bfv1t-4drq, 2026-09-18, owner: one session
// sent another a message; the receiver started working on it, but the chat view
// never showed the message existed). Forensics on the 2.1.274 buffer: another session's harness
// SendMessage woke the receiver through the CLI's own inbox socket; stdout
// carried `command_lifecycle {state:'started', command_uuid}` at 02:02:22Z and
// the sender's words ONLY in the terminal `result.origin` at 02:06:5x — the
// 2.362.2 mining rendered the card at turn END, so for four minutes the agent
// visibly answered nothing. `command_uuid` IS the JSONL uuid of the user record
// the CLI wrote ~13 ms after enqueue (38fa716a… on both sides of the capture):
// the consumer looks that record up in the session's own transcript tail and
// injects the card NOW, dedup'd by msg_id against the result rung.
//
// Real consumer (src/server/stdout/claude-stream-json.js) over a fake pty, a
// REAL normalizer, a fixture transcript under a scratch HOME (never the real
// ~/.claude — the 2026-09-09 lesson), and the negative controls that keep the
// lookup from inventing cards: a typed prompt, a body-less server-posted
// origin, a uuid the transcript never carries, a remote-host session.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── scratch HOME: the lookup resolves ~/.claude/projects through os.homedir() ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-peer-cmd-'));
process.env.HOME = tmp;
const { cwdToProjectDir } = require(path.join(REPO, 'src/session-store.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const consumerSrc = read('src/server/stdout/claude-stream-json.js');
const consumer = require(path.join(REPO, 'src/server/stdout/claude-stream-json.js'));

// engine stub derived from the consumer's OWN destructure (the census lesson of test-stdout-registry)
const engine = { _vsuPending: new Map(), resolveUsageKey: () => '__global__', usageEstimator: { noteLive() { } }, modelsMatch: () => false, servedDefinesModel: () => false, rerouteAnnouncedBy: () => null };
for (const part of (/const \{([^}]*)\} = engine;/.exec(consumerSrc) || ['', ''])[1].split(',')) {
  const name = part.split(':')[0].replace(/\/\/.*$/, '').trim();
  if (/^[A-Za-z_$][\w$]*$/.test(name) && !(name in engine)) engine[name] = () => { };
}
const activeSessions = new Map();
const broadcasts = [];
const { attach } = consumer.create({
  activeSessions, engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result', 'command_lifecycle']), _seenStreamTypes: new Set(),
  USAGE_SCANNER_PATH: path.join(tmp, 'none'), checkClaudeGoalStatus() { }, noteModelSeen() { }, sbSeenFirst: () => true, hosts: null, usageHistory: null, pagesRef: { current: null },
});
const helpers = {
  feedLive: (s, m) => { s._normalizer?.processLive(m); }, broadcastToSession: (s, id, m) => broadcasts.push({ id, ...m }), broadcastActiveSessions() { },
  readSessionMeta: () => ({}), writeSessionMeta() { }, updateSessionTodos() { }, applyTaskToolUpdate() { }, emitTaskListTodos() { },
};
const fakePty = () => { const h = { data: null, exit: null, onData(cb) { h.data = cb; }, onExit(cb) { h.exit = cb; } }; return h; };
const J = (o) => JSON.stringify(o) + '\n';
const cards = (s) => s._normalizer.messages.filter((m) => m.originKind === 'peer-message');

const CWD = path.join(tmp, 'work');
fs.mkdirSync(CWD, { recursive: true });
const projDir = path.join(tmp, '.claude', 'projects', cwdToProjectDir(CWD));
fs.mkdirSync(projDir, { recursive: true });
let n = 0;
const mkSession = (id, extra = {}) => {
  const cid = 'c1d00000-0000-4000-8000-' + String(++n).padStart(12, '0');
  const s = { mode: 'chat', backend: 'claude', name: id, cwd: CWD, host: null, claudeSessionId: cid, backendSessionId: cid, sockName: 'cw-' + id, buffer: '', createdAt: Date.now(), ...extra };
  s._normalizer = createMessageManager('claude', id);
  s._ops = []; s._normalizer.onOp((op) => s._ops.push(op));
  activeSessions.set(id, s);
  const p = fakePty(); attach(s, id, p, helpers);
  return { s, p, cid, jsonl: path.join(projDir, cid + '.jsonl') };
};
const BODY = '请确认三件事，我再拉起隧道——先不要动，等我回复。';
const ORIGIN = (msgId) => ({ kind: 'peer', from: 'uds:/run/user/1000/cc-socks/19463.sock', verifiedPeerPid: 19463, verifiedPeerProcStart: '90233', msg_id: msgId, name: 'Sender Session', fromMode: 'bypass', body: BODY });
const peerRecord = (uuid, msgId) => ({ parentUuid: 'p0', isSidechain: false, userType: 'external', cwd: CWD, sessionId: 'x', version: '2.1.274', type: 'user',
  message: { role: 'user', content: `Another Claude session sent a message:\n<cross-session-message from="uds:/run/user/1000/cc-socks/19463.sock" from-name="Sender Session" from-mode="bypass">\n${BODY}\n</cross-session-message>\n\nThis came from another Claude session — not typed by your user.` },
  isMeta: true, origin: ORIGIN(msgId), promptSource: 'sdk', uuid, timestamp: new Date().toISOString() });
const started = (uuid) => ({ type: 'command_lifecycle', command_uuid: uuid, state: 'started', uuid: 'cl-' + uuid, session_id: 'x' });
const result = (msgId) => ({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, origin: ORIGIN(msgId), session_id: 'x', total_cost_usd: 0.1 });

console.log('— the incident shape: SendMessage delivery → card at turn START, one card after the result');
{
  const { s, p, jsonl } = mkSession('w-live');
  const U = '38fa716a-286c-4555-937c-657cdd1fd6c3', M = 'aab20665-ecbb-430b-819e-d930f0c59969';
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: 'older', message: { role: 'user', content: 'earlier typed prompt' }, timestamp: new Date().toISOString() }) + J(peerRecord(U, M)));
  p.data(J(started(U)));
  await sleep(120);
  const c1 = cards(s);
  ok('the card is on screen right after command_lifecycle started (not at turn end)', c1.length === 1, `got ${c1.length}`);
  ok('…attributed to the sender by name (origin.name, never the socket path)', c1[0]?.peerFrom === 'Sender Session', c1[0]?.peerFrom);
  ok('…carrying the sender\'s words', (c1[0]?.content || []).map((b) => b.text).join('') === BODY);
  ok('…emitted as a live create op (a client attached mid-turn sees it)', s._ops.some((o) => o.op === 'create' && o.message?.originKind === 'peer-message'));
  p.data(J({ type: 'assistant', message: { id: 'm1', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'on it' }] }, uuid: 'a1', timestamp: new Date().toISOString() }));
  p.data(J(result(M)));
  await sleep(30);
  ok('the result rung dedups on msg_id — still exactly ONE card after the turn ends', cards(s).length === 1, `got ${cards(s).length}`);
  p.data(J(started(U)));
  await sleep(120);
  ok('a re-emitted started for the same uuid is a no-op (per-attach seen set)', cards(s).length === 1);
}

console.log('— the write races the frame: the record lands AFTER started → the retry finds it');
{
  const { s, p, jsonl } = mkSession('w-race');
  const U = 'aaaaaaaa-0000-4000-8000-000000000001', M = 'bbbbbbbb-0000-4000-8000-000000000001';
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: 'older', message: { role: 'user', content: 'x' } }));
  p.data(J(started(U)));
  await sleep(60);
  ok('nothing yet while the transcript has no such record', cards(s).length === 0);
  fs.appendFileSync(jsonl, J(peerRecord(U, M)));
  await sleep(400);
  ok('…and the card appears once the record is written (bounded retries)', cards(s).length === 1, `got ${cards(s).length}`);
}

console.log('— NEGATIVE CONTROLS: the lookup renders nothing for the shapes that are not this carrier\'s');
{
  const { s, p, jsonl } = mkSession('w-typed');
  const U = 'cccccccc-0000-4000-8000-000000000001';
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: U, message: { role: 'user', content: 'a prompt the user typed' }, promptSource: 'sdk', timestamp: new Date().toISOString() }));
  p.data(J(started(U)));
  await sleep(120);
  ok('a TYPED prompt (no origin) → no card', cards(s).length === 0);
}
{
  const { s, p, jsonl } = mkSession('w-server-posted');
  const U = 'dddddddd-0000-4000-8000-000000000001';
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: U, isMeta: true, origin: { kind: 'peer', from: 'unknown' }, message: { role: 'user', content: 'Message from session "Jobs" (via vibespace-msg): hi' }, timestamp: new Date().toISOString() }));
  p.data(J(started(U)));
  await sleep(120);
  ok('a SERVER-posted delivery (body-less origin, the deliver ladder already drew its card) → no second card from this carrier', cards(s).length === 0);
}
{
  const { s, p, jsonl } = mkSession('w-task-notif');
  const U = 'eeeeeeee-0000-4000-8000-000000000001';
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: U, origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification>done</task-notification>' }, timestamp: new Date().toISOString() }));
  p.data(J(started(U)));
  await sleep(120);
  ok('a task-notification wake → no peer card', cards(s).length === 0);
}
{
  // Claude Code's GENERIC `origin:{kind:"auto-continuation"}` (2026-09-22 verifier): 2.1.280 stamps it at ten
  // enqueue sites — plan-mode approval, the ultraplan hand-off, `/goal` proposal approval, dialog
  // nextInput… — and only ONE is its usage-limit continue. This carrier must neither draw a card for them
  // nor hand them to any brain consumer as something else. A second consumer instance with a RECORDING
  // brainRef (every method it is asked for is logged) watches the whole turn-start → result path.
  const brainLog = [];
  const recBrain = new Proxy({}, { get: (_, name) => (typeof name === 'string' ? (...a) => { brainLog.push([name, a[2]?.type || null]); } : undefined) });
  const { attach: attachRec } = consumer.create({
    activeSessions, engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result', 'command_lifecycle']), _seenStreamTypes: new Set(),
    USAGE_SCANNER_PATH: path.join(tmp, 'none'), checkClaudeGoalStatus() { }, noteModelSeen() { }, sbSeenFirst: () => true, hosts: null, usageHistory: null, pagesRef: { current: null }, brainRef: recBrain,
  });
  const shapes = [
    ['plan approval', 'Implement the following plan:\n\n# Plan\n1. do it'],
    ['/goal approval', '/goal ship the release'],
    ['ultraplan hand-off', 'The user approved the ultraplan in the browser. Here is the plan:\n\nImplement this plan.'],
  ];
  for (const [label, text] of shapes) {
    const cid = 'c1d00000-0000-4000-8000-' + String(++n).padStart(12, '0');
    const id = 'w-ac-' + label.replace(/\W+/g, '-');
    const sx = { mode: 'chat', backend: 'claude', name: id, cwd: CWD, host: null, claudeSessionId: cid, backendSessionId: cid, sockName: 'cw-' + id, buffer: '', createdAt: Date.now() };
    sx._normalizer = createMessageManager('claude', id);
    activeSessions.set(id, sx);
    const px = fakePty(); attachRec(sx, id, px, helpers);
    const U = 'acacacac-0000-4000-8000-' + String(n).padStart(12, '0');
    fs.writeFileSync(path.join(projDir, cid + '.jsonl'), J({ type: 'user', uuid: U, isMeta: false, origin: { kind: 'auto-continuation' }, message: { role: 'user', content: text }, timestamp: new Date().toISOString() }));
    brainLog.length = 0;
    px.data(J(started(U)));
    await sleep(120);
    px.data(J({ type: 'result', subtype: 'success', is_error: false, origin: { kind: 'auto-continuation' }, session_id: 'x' }));
    await sleep(20);
    ok(`${label} (origin auto-continuation) → no peer card, and the brain is handed nothing`, cards(sx).length === 0 && brainLog.length === 0, JSON.stringify(brainLog));
    if (label === 'plan approval') {
      // NEGATIVE CONTROL for the "handed nothing" half: the recorder is live on this very session
      px.data(J({ type: 'system', subtype: 'vcs_state_changed', kind: 'push', branch: 'b', cwd: CWD, session_id: 'x', uuid: 'v-' + U }));
      ok('…NEGATIVE CONTROL: the same recording brain DOES see a record the consumer hands it (the silence is a measurement)', brainLog.some((c) => c[0] === 'noteVcsState'), JSON.stringify(brainLog));
    }
  }
}
{
  const { s, p, jsonl } = mkSession('w-remote', { host: 'host-remote' });
  const U = 'ffffffff-0000-4000-8000-000000000001', M = 'ffffffff-0000-4000-8000-000000000002';
  fs.writeFileSync(jsonl, J(peerRecord(U, M)));
  p.data(J(started(U)));
  await sleep(120);
  ok('a REMOTE-host session never looks up a local transcript (the result rung still covers it)', cards(s).length === 0);
  p.data(J(result(M)));
  ok('…and the result rung renders it there', cards(s).length === 1);
}
{
  const { s, p, jsonl } = mkSession('w-missing');
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: 'zzz', message: { role: 'user', content: 'x' } }));
  p.data(J(started('99999999-0000-4000-8000-000000000001')));
  await sleep(3100);
  ok('a uuid the transcript never carries gives up after the bounded retries — no card, no throw', cards(s).length === 0);
}
{
  // a device-fed copy of the JSONL record after the turn-start card: same msg_id, one card
  const { s, p, jsonl } = mkSession('w-device');
  const U = '12121212-0000-4000-8000-000000000001', M = '12121212-0000-4000-8000-000000000002';
  fs.writeFileSync(jsonl, J(peerRecord(U, M)));
  p.data(J(started(U)));
  await sleep(120);
  s._normalizer.processLive(peerRecord(U, M));
  ok('the JSONL user record arriving later (device gap-fill) dedups on msg_id — one card', cards(s).length === 1, `got ${cards(s).length}`);
  const { s: s2 } = mkSession('w-rebuild');
  s2._normalizer.processLive(peerRecord(U, M));
  s2._normalizer.processLive(result(M));
  ok('a plain rebuild (record first, then result) still renders exactly one card — the guard is msg_id-keyed, not order-keyed', cards(s2).length === 1);
  const { s: s3 } = mkSession('w-legacy');
  s3._normalizer.injectPeerCard({ fromName: 'A', text: 'same body twice is legitimate' });
  s3._normalizer.injectPeerCard({ fromName: 'A', text: 'same body twice is legitimate' });
  ok('msg_id-less injections (server-posted cards) are never containment-deduped (the 2.362.2 review lesson)', cards(s3).length === 2);
}

console.log('— wiring pins (the unstaged-wiring class)');
{
  ok('the consumer calls the lookup on command_lifecycle started, local sessions only', /msg\.type === 'command_lifecycle' && msg\.state === 'started' && typeof msg\.command_uuid === 'string' && msg\.command_uuid && !session\.host\) peerCommandCard\(msg\.command_uuid\);/.test(consumerSrc));
  ok('…through the rebuild-gated peer-card writer (feedPeerCard), never processLive', /const po = peerOriginOf\(o, text\);[^\n]*\n\s*feedPeerCard\(session, \{ fromName: po\.name, text: o\.body, msgId: o\.msg_id \|\| null, kind: po\.via \}\);/.test(consumerSrc) && !/_normalizer\.injectPeerCard/.test(consumerSrc));
  ok('…bounded: a ≤512 KB tail read and a finite retry ladder', /512 \* 1024/.test(consumerSrc) && /const PEER_CMD_RETRY_MS = \[0, 150, 600, 2000\];/.test(consumerSrc));
  const sv = read('server.js');
  ok('server.js lists command_lifecycle as a HANDLED stream type (the breadcrumb must not cry unhandled for a handled type)', /'command_lifecycle',/.test(sv));
  const mm = read('src/message-manager.js');
  ok('injectPeerCard notes msgId and refuses a msg_id already on screen', /injectPeerCard\(\{ fromName, text, msgId = null(, resetCredit = null)?(, kind = null)?(, group = null)?(, exitRun = null)?(, channel = null)?(, belongsTo = null)? \}\)/.test(mm) && /if \(msgId && this\._peerMsgIds\.has\(msgId\)\) return null;\s*\n\s*this\._notePeerMsgId\(msgId\);/.test(mm));
  ok('the user-record and attachment peer sites skip a msg_id already rendered', (mm.match(/origin\.msg_id && this\._peerMsgIds\.has\([a-z]+\.origin\.msg_id\)\) return;/g) || []).length === 2);
  ok('ci.mjs runs this suite', /'test-peer-command-card'/.test(read('scripts/ci.mjs')));
}

console.log('— B-d868: WHO STARTED THE TURN — a kept fact with its source (session._turnBy), decided at the turn\'s init, the REAL consumer');
{
  const T = (uuid, origin, content = 'x') => ({ type: 'user', uuid, message: { role: 'user', content }, ...(origin ? { origin } : {}), timestamp: new Date().toISOString() });
  const init = (names) => ({ type: 'system', subtype: 'init', session_id: 'x', claude_code_version: '2.1.312', ...(names ? { user_message_uuids: names } : {}) });
  const said = (s) => ({ ...(s._turnBy || { by: 'unrecorded', source: 'none' }) });
  const assistant = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } };
  const { s, p, jsonl } = mkSession('w-turnby');
  const U = (k) => 'd8680000-0000-4000-8000-00000000000' + k, M3 = 'cccccccc-0000-4000-8000-000000000003';
  fs.writeFileSync(jsonl, J(peerRecord(U(3), M3)));
  // (1) the person sends to an idle CLI: the wrapper stamps the frame (frame_stamp), the CLI opens the turn with NO command start
  // (the real 2.1.312 — scripts/fixtures/claude-cli/2.1.312-stamped.jsonl) and its init names the stamp
  p.data(J({ type: 'frame_stamp', msg_id: 'web-1', cli_uuid: U(1) })); p.data(J(init([U(1)]))); p.data(J(T(U(1), null, 'typed words')));
  const person = said(s);
  p.data(J({ type: 'frame_stamp', msg_id: 'web-2', cli_uuid: U(2) })); p.data(J(started(U(2)))); await sleep(30);   // a steer: a command start INSIDE the turn
  const steered = said(s);
  p.data(J(result(M3)));
  const ended = said(s);
  // (2) a queued peer message: its command starts BETWEEN turns, the init names nothing — read off the CLI's own record (the
  // peer card's ONE lookup)
  p.data(J(started(U(3)))); p.data(J(init(null))); await sleep(300);
  const peer = said(s);
  p.data(J(result(M3)));
  // (3) the reader's must 1: a background task's turn the CLI opens by itself — no command start, no names; the turn's first
  // record says it (never the previous turn's «you»)
  p.data(J(init(null))); p.data(J(T(U(4), { kind: 'task-notification' }, '<task-notification>done</task-notification>')));
  const task = said(s);
  p.data(J(result(M3)));
  // (4) a typed-looking frame the wrapper never stamped, and a turn whose model speaks first
  p.data(J(init(null))); p.data(J(T(U(5), null, 'typed, never stamped')));
  const unstamped = said(s);
  p.data(J(result(M3))); p.data(J(init(null))); p.data(J(assistant));
  const silent = said(s);
  p.data(J(result(M3)));
  // (5) the reader's note 8: a lookup that answers after its turn ended never writes over the newer turn's fact
  p.data(J(started(U(7)))); p.data(J(init(null))); p.data(J(result(M3)));
  p.data(J(init(null))); p.data(J(T(U(8), { kind: 'task-notification' })));
  fs.appendFileSync(jsonl, J(peerRecord(U(7), M3))); await sleep(800);
  const late = said(s);
  ok(`B-d868 RED-able (fe1d59c41: no such fact): the person's send to an idle CLI ⇒ «person» from the init's names (${JSON.stringify(person)}); a steer inside that turn changes nothing (${steered.by}); the result ends the fact (${ended.by}, ${ended.source})`,
    person.by === 'person' && person.source === 'frame-stamp' && steered.by === 'person' && steered.at === person.at && ended.by === 'unrecorded' && ended.source === 'turn-ended', JSON.stringify({ person, steered, ended }));
  ok(`B-d868: a queued peer message ⇒ «peer» with its sender's name, read off the CLI's own record (${JSON.stringify(peer)}); a background task's own turn (no command start) ⇒ «task» from its first record (${task.by}, ${task.source})`,
    peer.by === 'peer' && peer.name === 'Sender Session' && peer.source === 'cli-record' && task.by === 'task' && task.source === 'cli-record', JSON.stringify({ peer, task }));
  ok(`B-d868 — NEVER «you» UNPROVED (主开发 09:01Z): an unstamped typed-looking record ⇒ «unrecorded» (${unstamped.by}); a turn whose model speaks first ⇒ «unrecorded» (${silent.by}, ${silent.source}); a late lookup leaves the newer turn's fact (${late.by})`,
    unstamped.by === 'unrecorded' && silent.by === 'unrecorded' && silent.source === 'no-record' && late.by === 'task', JSON.stringify({ unstamped, silent, late }));
  // (7) the delta read's must: a background task a peer's turn launched still runs when the person's own turn asks — the ask
  // reads «not recorded», never the running turn's «you»; once the set no longer names it, the turn's own opener again
  p.data(J(result(M3)));   // (5) left a turn running
  fs.appendFileSync(jsonl, J(peerRecord(U('a'), M3)));
  p.data(J(started(U('a')))); p.data(J(init(null))); await sleep(300);
  // the real order (2.1.312-frames lines 14–15): the level set names the helper BEFORE its own task_started
  const BG = { task_id: 'bg-1', task_type: 'local_agent', description: 'helper' };
  p.data(J({ type: 'system', subtype: 'background_tasks_changed', tasks: [BG] }));
  p.data(J({ type: 'system', subtype: 'task_started', task_id: 'bg-1', tool_use_id: 'toolu_bg_1', description: 'helper', is_backgrounded: true, task_type: 'local_agent' }));
  const bgPeer = said(s);
  p.data(J(result(M3)));
  p.data(J({ type: 'frame_stamp', msg_id: 'web-b', cli_uuid: U('b') })); p.data(J(init([U('b')])));
  const MM0 = require(path.join(REPO, 'src/message-manager.js'));
  const askDuring = MM0.turnByForAsk(s._turnBy, s._turnByBackground);
  // the CLI drops a member for a record or two around its phase changes and names it again (message-manager's own note) —
  // the re-named helper is STILL the peer's, never the running turn's
  p.data(J({ type: 'system', subtype: 'background_tasks_changed', tasks: [] })); p.data(J({ type: 'system', subtype: 'background_tasks_changed', tasks: [BG] }));
  const askBlip = MM0.turnByForAsk(s._turnBy, s._turnByBackground);
  p.data(J({ type: 'system', subtype: 'background_tasks_changed', tasks: [] }));
  const askAfter = MM0.turnByForAsk(s._turnBy, s._turnByBackground);
  p.data(J(result(M3)));
  ok(`B-d868 (the delta reads' must): a helper a peer's turn launched still runs when the person's turn asks ⇒ «${askDuring && askDuring.by}» (${askDuring && askDuring.why}), never «you» — also after the set drops and re-names it (${askBlip && askBlip.by}); the set empties ⇒ «${askAfter && askAfter.by}»`,
    bgPeer.by === 'peer' && askDuring && askDuring.by === 'unrecorded' && askDuring.why === 'background' && askBlip && askBlip.by === 'unrecorded' && askAfter && askAfter.by === 'person', JSON.stringify({ bgPeer, askDuring, askBlip, askAfter, bg: s._turnByBackground }));
  // a FRESH attach (a hub restart): the set names a task this attach never saw start ⇒ «unknown» ⇒ the person's turn asks «not recorded»
  const fr = mkSession('w-turnby-fresh');
  fr.p.data(J({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'bg-old', task_type: 'local_agent' }] }));
  fr.p.data(J({ type: 'frame_stamp', msg_id: 'web-f', cli_uuid: U('f') })); fr.p.data(J(init([U('f')])));
  const askFresh = MM0.turnByForAsk(fr.s._turnBy, fr.s._turnByBackground);
  ok(`B-d868: after a restart, a helper nobody saw start is «unknown» ⇒ the person's turn asks «${askFresh && askFresh.by}», never «you» (${JSON.stringify(fr.s._turnByBackground)})`, fr.s._turnBy.by === 'person' && askFresh && askFresh.by === 'unrecorded' && JSON.stringify(fr.s._turnByBackground) === '["unknown"]', JSON.stringify({ tb: fr.s._turnBy, bg: fr.s._turnByBackground }));
  // (8) the REAL record order (the delta read's should): the real 2.1.312's own task-notification turn — init, the model, its
  // result, no user record on stdout (scripts/fixtures/claude-cli/2.1.312-frames.jsonl lines 23–25) ⇒ «not recorded»
  const real = fs.readFileSync(path.join(REPO, 'scripts/fixtures/claude-cli/2.1.312-frames.jsonl'), 'utf8').split('\n').slice(22, 24);
  for (const l of real) p.data(l + '\n');
  const realTask = said(s);
  p.data(J(result(M3)));
  ok(`B-d868: the real CLI's own task-notification turn (init → the model, no stdout user record) reads «${realTask.by}» (${realTask.source}) — honest, never a guess`, realTask.by === 'unrecorded' && realTask.source === 'no-record' && real.length === 2 && /"subtype":"init"/.test(real[0]), JSON.stringify(realTask));
  const PURE2 = [MM0.turnByForAsk({ by: 'person' }, []), MM0.turnByForAsk({ by: 'person' }, ['person']), MM0.turnByForAsk({ by: 'person' }, ['peer|N']), MM0.turnByForAsk({ by: 'peer', name: 'N' }, ['peer|N']), MM0.turnByForAsk({ by: 'peer', name: 'B' }, ['peer|A']), MM0.turnByForAsk({ by: 'person' }, ['unknown']), MM0.turnByForAsk(null, ['peer|N'])];
  ok(`B-d868 PURE turnByForAsk: no background, or only this opener's (its kind AND name) ⇒ the opener; another opener's, another peer's, or an unknown one ⇒ «not recorded» (background); no fact ⇒ null (${JSON.stringify(PURE2)})`,
    JSON.stringify(PURE2) === '[{"by":"person"},{"by":"person"},{"by":"unrecorded","why":"background"},{"by":"peer","name":"N"},{"by":"unrecorded","why":"background"},{"by":"unrecorded","why":"background"},null]', JSON.stringify(PURE2));
  // (6) the reader's must 2: a hub restart mid-turn — a FRESH consumer, the turn already running, and the person steers
  const r = mkSession('w-turnby-restart');
  r.p.data(J({ type: 'frame_stamp', msg_id: 'web-6', cli_uuid: U(6) })); r.p.data(J(started(U(6)))); r.p.data(J(assistant)); await sleep(30);
  const restarted = said(r.s);
  ok(`B-d868: after a restart mid-turn a steer is never the opener — the turn says «unrecorded» until its own init (${restarted.by})`, restarted.by !== 'person', JSON.stringify(restarted));
  // the PURE classifier and its controls (anchors that fail BY NAME — the 06:25Z rule)
  const MMsrc = fs.readFileSync(path.join(REPO, 'src/message-manager.js'), 'utf8'), MM = require(path.join(REPO, 'src/message-manager.js'));
  const pure = typeof MM.turnOpenerOf === 'function' ? [MM.turnOpenerOf(null, { stamped: true }).by, MM.turnOpenerOf(T('a', null)).by, MM.turnOpenerOf(null).by, MM.turnOpenerOf(T('b', { kind: 'peer', from: 'unknown' }, 'body-less')).by, MM.turnOpenerOf(T('c', { kind: 'something-new' })).kind] : null;
  ok(`B-d868 PURE turnOpenerOf: stamped ⇒ person; no origin, no record ⇒ unrecorded; a name-less server post ⇒ server; an unknown origin keeps its kind (${JSON.stringify(pure)})`, JSON.stringify(pure) === '["person","unrecorded","unrecorded","server","something-new"]', JSON.stringify(pure));
  const { mutantCopies } = await import('./mutant-copy.mjs'), MU = mutantCopies('d868', REPO);
  const anchor = (src, from, name) => { const k = src.split(from).length - 1; ok(`the anchor of the control ${name} is in the source (once)`, k === 1, `found ${k} times`); return k === 1; };
  const fromMM = "  if (!o || typeof o !== 'object') return { by: 'unrecorded' };";
  if (anchor(MMsrc, fromMM, 'B-d868 never-you')) {
    const MMx = require(MU.write('src/message-manager.js', MMsrc.replace(fromMM, "  if (!o || typeof o !== 'object') return { by: 'person' };"), 'unproved-you'));
    ok(`CONTROL (B-d868): the copy that calls an unproved record «the person» answers ${MMx.turnOpenerOf(T('a', null)).by} — the leg goes red`, MMx.turnOpenerOf(T('a', null)).by === 'person');
  }
  const CSsrc = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8');
  const fromBg = "  if ((Array.isArray(background) ? background : []).some((b) => b !== key)) return { by: 'unrecorded', why: 'background' };";
  if (anchor(MMsrc, fromBg, 'B-d868 background')) {
    const MMb = require(MU.write('src/message-manager.js', MMsrc.replace(fromBg, ''), 'no-background'));
    ok(`CONTROL (B-d868): the copy that ignores the background answers «${MMb.turnByForAsk({ by: 'person' }, ['peer']).by}» for a peer's helper — the leg goes red`, MMb.turnByForAsk({ by: 'person' }, ['peer']).by === 'person');
  }
  ok('B-d868: the opener lookups keep a VERDICT, never the transcript record (the delta read: up to 32 whole records); the background set is read off the CLI\'s own level set and each task\'s own start', CSsrc.includes('      cmdRecs.set(cmdUuid, v);') && !CSsrc.includes('cmdRecs.set(cmdUuid, rec)') && CSsrc.includes("if (msg.type === 'system' && msg.subtype === 'background_tasks_changed' && Array.isArray(msg.tasks)) noteBackground(msg.tasks);") && CSsrc.includes("if (msg.type === 'system' && msg.subtype === 'task_started' && msg.task_id != null) noteTaskStarted(msg);"));
  const fromStart = "msg.command_uuid && !turnOpen.live) turnOpen.cmd = msg.command_uuid;", fromEnd = "      setTurnBy({ by: 'unrecorded', source: 'turn-ended' });\n";
  ok(`B-d868 wiring: the stamp is kept; a command start counts only BETWEEN turns; the init decides; the turn's records and the result follow`, CSsrc.includes("if (msg.type === 'frame_stamp' && typeof msg.cli_uuid === 'string' && msg.cli_uuid) { personUuids.add(msg.cli_uuid);") && CSsrc.includes(fromStart)
    && CSsrc.includes("if (msg.type === 'system' && msg.subtype === 'init') noteTurnInit(msg);") && CSsrc.includes("else if (msg.type === 'user' || msg.type === 'assistant') noteTurnRecord(msg);") && CSsrc.includes("if (msg.type === 'result') noteTurnEnded();")
    && CSsrc.includes('noteCmdRecord(cmdUuid, rec);') && (CSsrc.match(/findSessionJsonlPath\(/g) || []).length === 1, 'the opener reads the peer card\'s ONE transcript lookup (one findSessionJsonlPath in the file, as at the base — the reader\'s should 6: no second sync read per turn)');
  const consumer = (src, name) => {
    const CSx = require(MU.write('src/server/stdout/claude-stream-json.js', src, name));
    const ax = CSx.create({ activeSessions, engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result', 'command_lifecycle']), _seenStreamTypes: new Set(), USAGE_SCANNER_PATH: path.join(tmp, 'none'), checkClaudeGoalStatus() { }, noteModelSeen() { }, sbSeenFirst: () => true, hosts: null, usageHistory: null, pagesRef: { current: null } });
    const cid = 'c1d00000-0000-4000-8000-99999999999' + name.length % 10, sx = { mode: 'chat', backend: 'claude', name: 'x', cwd: CWD, host: null, claudeSessionId: cid, backendSessionId: cid, sockName: 'cw-' + name, buffer: '', createdAt: Date.now() };
    sx._normalizer = createMessageManager('claude', 'w-' + name); activeSessions.set('w-' + name, sx); const px = fakePty(); ax.attach(sx, 'w-' + name, px, helpers);
    return { sx, px, done: () => activeSessions.delete('w-' + name) };
  };
  if (anchor(CSsrc, fromStart, 'B-d868 decide-at-the-start')) {
    const c = consumer(CSsrc.replace(fromStart, 'msg.command_uuid) { turnOpen.cmd = msg.command_uuid; noteTurnInit({}); }'), 'at-start');
    c.px.data(J({ type: 'frame_stamp', msg_id: 'web-9', cli_uuid: U(9) })); c.px.data(J(started(U(9)))); c.px.data(J(assistant));
    ok(`CONTROL (B-d868): the copy that decides at a command's start calls the steer after a restart «${c.sx._turnBy && c.sx._turnBy.by}» — the leg goes red`, !!c.sx._turnBy && c.sx._turnBy.by === 'person');
    c.done();
  }
  if (anchor(CSsrc, fromEnd, 'B-d868 the result ends it')) {
    const c = consumer(CSsrc.replace(fromEnd, ''), 'no-end');
    c.px.data(J({ type: 'frame_stamp', msg_id: 'web-a', cli_uuid: U(1) })); c.px.data(J(init([U(1)]))); c.px.data(J(result(M3)));
    ok(`CONTROL (B-d868): the copy whose result does not end the fact still says «${c.sx._turnBy && c.sx._turnBy.by}» between turns — the leg goes red`, !!c.sx._turnBy && c.sx._turnBy.by === 'person');
    c.done();
  }
  const fromSay = "    const sayBackground = () => { session._turnByBackground = [...new Set(bgLive.map((k) => launched.get(k) || 'unknown'))]; };";
  if (anchor(CSsrc, fromSay, 'B-d868 the opener at launch')) {
    const c = consumer(CSsrc.replace(fromSay, "    const sayBackground = () => { session._turnByBackground = [...new Set(bgLive.map(() => openerKey(session._turnBy)))]; };"), 'at-the-set');
    c.px.data(J({ type: 'frame_stamp', msg_id: 'web-c', cli_uuid: U('c') })); c.px.data(J(init([U('c')])));
    c.px.data(J({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'bg-x', task_type: 'local_agent' }] }));
    const v = require(path.join(REPO, 'src/message-manager.js')).turnByForAsk(c.sx._turnBy, c.sx._turnByBackground);
    ok(`CONTROL (B-d868): the copy that gives a running task the opener of the turn running when the set names it says «${v && v.by}» for a helper nobody saw start — the leg goes red`, !!v && v.by === 'person');
    c.done();
  }
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
