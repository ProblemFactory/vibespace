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
  ok('…through the rebuild-gated peer-card writer (feedPeerCard), never processLive', /feedPeerCard\(session, \{ fromName: peerDisplayName\(o, text\), text: o\.body, msgId: o\.msg_id \|\| null \}\);/.test(consumerSrc) && !/_normalizer\.injectPeerCard/.test(consumerSrc));
  ok('…bounded: a ≤512 KB tail read and a finite retry ladder', /512 \* 1024/.test(consumerSrc) && /const PEER_CMD_RETRY_MS = \[0, 150, 600, 2000\];/.test(consumerSrc));
  const sv = read('server.js');
  ok('server.js lists command_lifecycle as a HANDLED stream type (the breadcrumb must not cry unhandled for a handled type)', /'command_lifecycle',/.test(sv));
  const mm = read('src/message-manager.js');
  ok('injectPeerCard notes msgId and refuses a msg_id already on screen', /injectPeerCard\(\{ fromName, text, msgId = null \}\)/.test(mm) && /if \(msgId && this\._peerMsgIds\.has\(msgId\)\) return null;\s*\n\s*this\._notePeerMsgId\(msgId\);/.test(mm));
  ok('the user-record and attachment peer sites skip a msg_id already rendered', (mm.match(/origin\.msg_id && this\._peerMsgIds\.has\([a-z]+\.origin\.msg_id\)\) return;/g) || []).length === 2);
  ok('ci.mjs runs this suite', /'test-peer-command-card'/.test(read('scripts/ci.mjs')));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
