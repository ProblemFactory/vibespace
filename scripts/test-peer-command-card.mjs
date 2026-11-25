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
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// r4456 (the flake census, round 2: «a wait is on the fact the leg judges»): the parse's ONE transcript lookup for a started command
// ends in session-brain's noteTurnCmdRecord — the CLI's record, or null once its retry ladder gave up — kept on the session as
// _turnOpen.cmdRecs; the card it carries is fed in the SAME synchronous step right after it (claude-stream-json peerCommandCard).
// So a leg reads the card, or the turn's opener, only once THAT lookup has answered — never after a fixed sleep (a slow lookup was a
// false red; a «no card» read before the lookup answered proved nothing). The bound is generous; its expiry is a NAMED harness line
const answered = (s, cmd) => !!(s && s._turnOpen && s._turnOpen.cmdRecs && s._turnOpen.cmdRecs.has(cmd));
const lookupDone = async (s, cmd, what, ms = 15000) => {
  const end = Date.now() + ms;
  while (!answered(s, cmd) && Date.now() < end) await sleep(10);
  if (!answered(s, cmd)) ok(`HARNESS (${what}): the transcript lookup for ${cmd} answered within ${ms} ms`, false, 'it never answered');
  return answered(s, cmd);
};
// the transcript's own reads, as the consumer makes them (the same fs.promises object): a STAT per attempt (made at once when an
// attempt runs: «no lookup» is read as none made), a CLOSE per finished read, and a HOLD on a file's open (the placement legs below)
const FSP = fs.promises, IO = { stats: new Map(), closes: new Map(), hold: new Map() };
const K = (f) => path.basename(String(f));   // keyed by the transcript's own name (<cid>.jsonl: one per session), whatever folder the lookup resolved
const bump = (m, f) => m.set(K(f), (m.get(K(f)) || 0) + 1);
const ioOf = (m, f) => m.get(K(f)) || 0;
{
  const stat0 = FSP.stat.bind(FSP), open0 = FSP.open.bind(FSP);
  FSP.stat = (f, ...a) => { bump(IO.stats, String(f)); return stat0(f, ...a); };
  FSP.open = async (f, ...a) => {
    const g = IO.hold.get(K(f)); if (g) await g.p;
    const fh = await open0(f, ...a), close0 = fh.close.bind(fh);
    fh.close = () => close0().finally(() => bump(IO.closes, String(f)));
    return fh;
  };
}
const holdOpen = (f) => { let go = null; const g = { p: new Promise((r) => { go = r; }) }; IO.hold.set(K(f), g); return () => { IO.hold.delete(K(f)); go(); }; };
// one turn of the timer list: a 0 ms timer the consumer set BEFORE this one (its lookup's first attempt) has run when this resolves
const turn = () => new Promise((r) => setTimeout(r, 0));

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
  await lookupDone(s, U, 'the incident shape');
  const c1 = cards(s);
  ok('the card is on screen right after command_lifecycle started (not at turn end)', c1.length === 1, `got ${c1.length}`);
  ok('…attributed to the sender by name (origin.name, never the socket path)', c1[0]?.peerFrom === 'Sender Session', c1[0]?.peerFrom);
  ok('…carrying the sender\'s words', (c1[0]?.content || []).map((b) => b.text).join('') === BODY);
  ok('…emitted as a live create op (a client attached mid-turn sees it)', s._ops.some((o) => o.op === 'create' && o.message?.originKind === 'peer-message'));
  p.data(J({ type: 'assistant', message: { id: 'm1', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'on it' }] }, uuid: 'a1', timestamp: new Date().toISOString() }));
  p.data(J(result(M)));
  await sleep(30);
  ok('the result rung dedups on msg_id — still exactly ONE card after the turn ends', cards(s).length === 1, `got ${cards(s).length}`);
  const statsBefore = ioOf(IO.stats, jsonl);
  p.data(J(started(U)));
  await turn();   // a second lookup's first attempt would have stated the transcript by now
  ok(`a re-emitted started for the same uuid is a no-op (per-attach seen set): no second lookup (${ioOf(IO.stats, jsonl) - statsBefore} reads more), one card`, cards(s).length === 1 && ioOf(IO.stats, jsonl) === statsBefore);
}

console.log('— the write races the frame: the record lands AFTER started → the retry finds it');
{
  const { s, p, jsonl } = mkSession('w-race');
  const U = 'aaaaaaaa-0000-4000-8000-000000000001', M = 'bbbbbbbb-0000-4000-8000-000000000001';
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: 'older', message: { role: 'user', content: 'x' } }));
  p.data(J(started(U)));
  const missed = await (async () => { const end = Date.now() + 15000; while (!(ioOf(IO.closes, jsonl) >= 1) && Date.now() < end) await sleep(10); return ioOf(IO.closes, jsonl) >= 1; })();   // its first attempt READ the transcript and missed
  if (!missed) ok('HARNESS (the write races the frame): the lookup\'s first attempt read the transcript within 15000 ms', false);
  ok('nothing yet while the transcript has no such record (its first read missed it, no answer kept)', missed && cards(s).length === 0 && !answered(s, U));
  fs.appendFileSync(jsonl, J(peerRecord(U, M)));
  await lookupDone(s, U, 'the write races the frame');
  ok('…and the card appears once the record is written (bounded retries)', cards(s).length === 1, `got ${cards(s).length}`);
}

console.log('— NEGATIVE CONTROLS: the lookup renders nothing for the shapes that are not this carrier\'s');
{
  const { s, p, jsonl } = mkSession('w-typed');
  const U = 'cccccccc-0000-4000-8000-000000000001';
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: U, message: { role: 'user', content: 'a prompt the user typed' }, promptSource: 'sdk', timestamp: new Date().toISOString() }));
  p.data(J(started(U)));
  await lookupDone(s, U, 'a typed prompt');
  ok('a TYPED prompt (no origin) → no card', cards(s).length === 0);
}
{
  const { s, p, jsonl } = mkSession('w-server-posted');
  const U = 'dddddddd-0000-4000-8000-000000000001';
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: U, isMeta: true, origin: { kind: 'peer', from: 'unknown' }, message: { role: 'user', content: 'Message from session "Jobs" (via vibespace-msg): hi' }, timestamp: new Date().toISOString() }));
  p.data(J(started(U)));
  await lookupDone(s, U, 'a server-posted delivery');
  ok('a SERVER-posted delivery (body-less origin, the deliver ladder already drew its card) → no second card from this carrier', cards(s).length === 0);
}
{
  const { s, p, jsonl } = mkSession('w-task-notif');
  const U = 'eeeeeeee-0000-4000-8000-000000000001';
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: U, origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification>done</task-notification>' }, timestamp: new Date().toISOString() }));
  p.data(J(started(U)));
  await lookupDone(s, U, 'a task-notification wake');
  ok('a task-notification wake → no peer card', cards(s).length === 0);
}
{
  // Claude Code's GENERIC `origin:{kind:"auto-continuation"}` (2026-09-22 verifier): 2.1.280 stamps it at ten
  // enqueue sites — plan-mode approval, the ultraplan hand-off, `/goal` proposal approval, dialog
  // nextInput… — and only ONE is its usage-limit continue. This carrier must neither draw a card for them
  // nor hand them to any brain consumer as something else. A second consumer instance with a RECORDING
  // brainRef (every method it is asked for is logged) watches the whole turn-start → result path.
  const brainLog = [];
  // lane conversation-facts (majordomo piece 2): `noteConvFacts` is the conversation's OBSERVATION step — handed EVERY record of the
  // CLI by design (src/conversation-facts.js factsStep records, it never judges a record as a card or a turn) — so it is not counted here
  const recBrain = new Proxy({}, { get: (_, name) => (typeof name === 'string' ? (...a) => { if (name !== 'noteConvFacts') brainLog.push([name, a[2]?.type || null]); } : undefined) });
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
    await lookupDone(sx, U, label);
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
  await turn();   // a lookup's first attempt would have stated the transcript by now
  ok(`a REMOTE-host session never looks up a local transcript (${ioOf(IO.stats, jsonl)} reads; the result rung still covers it)`, cards(s).length === 0 && ioOf(IO.stats, jsonl) === 0 && !answered(s, U));
  p.data(J(result(M)));
  ok('…and the result rung renders it there', cards(s).length === 1);
}
{
  const { s, p, jsonl } = mkSession('w-missing');
  fs.writeFileSync(jsonl, J({ type: 'user', uuid: 'zzz', message: { role: 'user', content: 'x' } }));
  p.data(J(started('99999999-0000-4000-8000-000000000001')));
  await lookupDone(s, '99999999-0000-4000-8000-000000000001', 'a uuid the transcript never carries');
  ok('a uuid the transcript never carries gives up after the bounded retries — no card, no throw (its answer kept as none)', cards(s).length === 0 && answered(s, '99999999-0000-4000-8000-000000000001') && s._turnOpen.cmdRecs.get('99999999-0000-4000-8000-000000000001') === null);
}
{
  // a device-fed copy of the JSONL record after the turn-start card: same msg_id, one card
  const { s, p, jsonl } = mkSession('w-device');
  const U = '12121212-0000-4000-8000-000000000001', M = '12121212-0000-4000-8000-000000000002';
  fs.writeFileSync(jsonl, J(peerRecord(U, M)));
  p.data(J(started(U)));
  await lookupDone(s, U, 'the device gap-fill');
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
  p.data(J(started(U(3)))); p.data(J(init(null))); await lookupDone(s, U(3), 'B-d868 the queued peer message');
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
  fs.appendFileSync(jsonl, J(peerRecord(U(7), M3))); await lookupDone(s, U(7), 'B-d868 the late lookup');   // the late lookup HAS answered: the newer turn's fact is read after it
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
  p.data(J(started(U('a')))); p.data(J(init(null))); await lookupDone(s, U('a'), 'B-d868 the peer turn with a helper');
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
  // r4456 (the flake census, round 2) — THE FIND PLACED FIRST, red at will by a hold, each on a session of its own:
  // (P1) «a slow lookup leaves the turn unrecorded»: the queued-peer road with the transcript's open HELD — read as the leg stood (the
  // opener after a wait that is not the lookup's answer), the turn's opener is still PENDING; the wait on the lookup's answer, once
  // the hold is let go, reads «peer» off the CLI's record
  {
    const h = mkSession('w-turnby-held'), Uh = U('h');
    fs.writeFileSync(h.jsonl, J(peerRecord(Uh, M3)));
    const go = holdOpen(h.jsonl);
    h.p.data(J(result(M3)));   // a turn this attach saw end: a command start counts only BETWEEN turns (session-brain: live === false), as at (2)
    h.p.data(J(started(Uh))); h.p.data(J(init(null)));
    await turn(); const asStood = said(h.s), answeredThen = answered(h.s, Uh), statedThen = ioOf(IO.stats, h.jsonl);   // its first attempt is out, its open held
    go(); await lookupDone(h.s, Uh, 'the placed peer read');
    const now = said(h.s);
    ok(`B-d868 PLACED (r4456): with the transcript's read HELD (its lookup out: ${statedThen} read), the opener read before the lookup's answer says «${asStood.by}» (${asStood.source}; answered: ${answeredThen}) — RED at will, the old fixed wait's false red; the wait on the lookup's answer says «${now.by}» (${now.source})`,
      statedThen >= 1 && asStood.by !== 'peer' && asStood.source === 'pending' && !answeredThen && now.by === 'peer' && now.source === 'cli-record', JSON.stringify({ asStood, now }));
    h.p.data(J(result(M3)));
  }
  // (P2) «a late lookup that writes over the newer turn could land after the read»: the late road with the transcript's open HELD
  // past the read, and a PLANTED fault of the leg's own (no product edit): session-brain's lookup hand-over wrapped so this command's
  // answer writes its opener over whatever turn runs — the shape before the identity rule. Read as the leg stood (before the lookup
  // answered) the newer turn's «task» is green and proves nothing; the wait on the lookup's answer catches the write-over — red at
  // will. (The real hand-over, unwrapped, keeps the newer turn's fact: the leg above, now read after its lookup answered)
  {
    const SBm = require(path.join(REPO, 'src/server/session-brain.js')), real = SBm.noteTurnCmdRecord;
    const h = mkSession('w-turnby-late-held'), Uj = U('j');
    fs.writeFileSync(h.jsonl, J({ type: 'user', uuid: 'older', message: { role: 'user', content: 'x' } }));
    const go = holdOpen(h.jsonl);
    SBm.noteTurnCmdRecord = (session, cmd, rec) => { real(session, cmd, rec); if (cmd === Uj && rec) session._turnBy = { by: 'peer', name: 'Sender Session', source: 'cli-record', at: Date.now() }; };   // THE PLANT
    try {
      h.p.data(J(result(M3)));   // between turns, as at (5)
      h.p.data(J(started(Uj))); h.p.data(J(init(null))); h.p.data(J(result(M3)));
      h.p.data(J(init(null))); h.p.data(J(T(U('k'), { kind: 'task-notification' })));
      fs.appendFileSync(h.jsonl, J(peerRecord(Uj, M3)));
      await turn(); const asStood = said(h.s), answeredThen = answered(h.s, Uj);
      go(); await lookupDone(h.s, Uj, 'the placed late lookup');
      const now = said(h.s);
      ok(`B-d868 PLACED (r4456), A PLANTED FAULT (a lookup that writes over the newer turn), its read HELD: read before the lookup answered (${answeredThen}) the newer turn says «${asStood.by}» — green, proving nothing; the wait on the lookup's answer catches the write-over («${now.by}») — RED at will`,
        asStood.by === 'task' && !answeredThen && now.by === 'peer', JSON.stringify({ asStood, now }));
    } finally { SBm.noteTurnCmdRecord = real; }
    h.p.data(J(result(M3)));
  }
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
    const MMx = require(MU.write('src/message-manager.js', editAnchor(MMsrc, fromMM, "  if (!o || typeof o !== 'object') return { by: 'person' };", "src/message-manager.js"), 'unproved-you'));
    ok(`CONTROL (B-d868): the copy that calls an unproved record «the person» answers ${MMx.turnOpenerOf(T('a', null)).by} — the leg goes red`, MMx.turnOpenerOf(T('a', null)).by === 'person');
  }
  const CSsrc = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8');
  const fromBg = "  if ((Array.isArray(background) ? background : []).some((b) => b !== key)) return { by: 'unrecorded', why: 'background' };";
  if (anchor(MMsrc, fromBg, 'B-d868 background')) {
    const MMb = require(MU.write('src/message-manager.js', editAnchor(MMsrc, fromBg, '', "src/message-manager.js"), 'no-background'));
    ok(`CONTROL (B-d868): the copy that ignores the background answers «${MMb.turnByForAsk({ by: 'person' }, ['peer']).by}» for a peer's helper — the leg goes red`, MMb.turnByForAsk({ by: 'person' }, ['peer']).by === 'person');
  }
  // THE ONE IMPLEMENTATION (主开发's as-if-must (2), 11:37Z): the opener's machine lives in session-brain, fed by the parse (every
  // record it sees) and the device stream (claudeSideEffects: the records the parse has not seen); the parse holds no inline twin
  const SBsrc = fs.readFileSync(path.join(REPO, 'src/server/session-brain.js'), 'utf8');
  ok('B-d868: ONE opener for both feeds — the parse feeds session-brain\'s noteTurnOpener (and its attach resets it), the device feed\'s claudeSideEffects feeds the same; the lookups keep a VERDICT; one transcript lookup in the parse',
    CSsrc.includes("try { TO.noteTurnOpener(session, msg, 'parse'); } catch { }") && CSsrc.includes("try { require('../session-brain.js').noteTurnAttach(session); } catch { }") && CSsrc.includes('TO.noteTurnCmdRecord(session, cmdUuid, rec);')
    && !/personUuids|noteTurnInit|turnOpen\./.test(CSsrc) && SBsrc.includes("    openerFed = true; try { noteTurnOpener(session, msg, 'device'); } catch { }") && SBsrc.includes('  st.cmdRecs.set(cmdUuid, v);') && (CSsrc.match(/findSessionJsonlPath\(/g) || []).length === 1);
  // PARITY, record for record: the same stream through the parse alone, the device feed alone, and the two interleaved (each
  // record first through one feed, then the other — the opener takes it once)
  const SB = require(path.join(REPO, 'src/server/session-brain.js'));
  const brain = SB.create({ engine: {}, applyTaskToolUpdate() { }, updateSessionTodos() { } });
  const V = (k) => 'd8680000-0000-4000-8000-0000000002' + k;
  const seq = [
    { type: 'frame_stamp', msg_id: 'web-p1', cli_uuid: V('01') },
    { type: 'system', subtype: 'init', uuid: V('02'), session_id: 'x', user_message_uuids: [V('01')] },
    { type: 'system', subtype: 'task_started', uuid: V('03'), task_id: 'bg-p', tool_use_id: 'toolu_p', is_backgrounded: true, task_type: 'local_agent' },
    { type: 'system', subtype: 'background_tasks_changed', uuid: V('04'), tasks: [{ task_id: 'bg-p', task_type: 'local_agent' }] },
    { type: 'assistant', uuid: V('05'), message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } },
    { type: 'result', uuid: V('06'), subtype: 'success', session_id: 'x' },
    { type: 'system', subtype: 'init', uuid: V('07'), session_id: 'x' },
    { type: 'user', uuid: V('08'), origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification>done</task-notification>' } },
    { type: 'system', subtype: 'background_tasks_changed', uuid: V('09'), tasks: [] },
    { type: 'result', uuid: V('10'), subtype: 'success', session_id: 'x' },
    { type: 'command_lifecycle', state: 'started', uuid: V('11'), command_uuid: V('12') },
    { type: 'system', subtype: 'init', uuid: V('13'), session_id: 'x' },
    { type: 'assistant', uuid: V('14'), message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } },
    { type: 'result', uuid: V('15'), subtype: 'success', session_id: 'x' },
    { type: 'frame_stamp', msg_id: 'web-p2', cli_uuid: V('16') },   // a SECOND person frame: sbSeenFirst once collapsed every frame_stamp onto one key
    { type: 'system', subtype: 'init', uuid: V('17'), session_id: 'x', user_message_uuids: [V('16')] },
  ];
  const facts = (sx) => `${(sx._turnBy && sx._turnBy.by) || 'unrecorded'}|${JSON.stringify(sx._turnByBackground || [])}`;
  const viaParse = mkSession('w-par-parse'), viaDev = { name: 'dev', host: 'h9', backend: 'claude' }, viaMix = mkSession('w-par-mix');
  const fP = [], fD = [], fM = [];
  seq.forEach((r, i) => {
    viaParse.p.data(J(r)); fP.push(facts(viaParse.s));
    if (brain.sbSeenFirst(viaDev, r)) brain.claudeSideEffects(viaDev, 'dev', r); fD.push(facts(viaDev));   // server.js's own device path: the gate, then the families
    const dev = () => { if (brain.sbSeenFirst(viaMix.s, r)) brain.claudeSideEffects(viaMix.s, 'mix', r); };
    if (i % 2) { dev(); viaMix.p.data(J(r)); } else { viaMix.p.data(J(r)); dev(); }
    fM.push(facts(viaMix.s));
  });
  // (B-3336's belt, 主开发 r794 restated r847: an init the PARSE NEVER BRINGS never reads as the person's — in the device-alone feed no
  // init has a parse copy: there «person» reads «unrecorded»; in this interleaving both person inits come device-first and the parse's
  // copy follows: the turn is decided exactly as the parse alone decides it)
  const beltOf = (x) => x.replace(/person/g, 'unrecorded');
  ok(`B-d868 PARITY (as-if-must (2), restated to B-3336's belt): the same stream through the parse alone and both interleaved gives the same opener record for record; the device feed alone the same — but an init the parse never brings never the person's (${fP.join(' · ')})`,
    JSON.stringify(fD) === JSON.stringify(fP.map(beltOf)) && JSON.stringify(fM) === JSON.stringify(fP) && fP[1].startsWith('person|') && fP[5].startsWith('unrecorded|') && fP[7].startsWith('task|') && fP[12].startsWith('unrecorded|') && fP[15].startsWith('person|')
      && !fD.some((x) => x.includes('person')) && viaDev._turnBy.source === 'device-init', JSON.stringify({ fP, fD, fM, devSource: viaDev._turnBy.source }));
  const brainCopy = (src, name) => MU.load('src/server/session-brain.js', src, name);
  // 主开发's as-if-must (12:09Z): A LATE BACKLOG FROM THE DEVICE FEED NEVER TAKES AN OLD TURN'S START AGAIN. (a) the stream's own
  // order: an init or a result from a feed that is BEHIND the last result this session saw opens and ends nothing; (b) an init
  // that already opened a turn never opens one again — both past the once-memory's size
  const Tm = (n) => new Date(Date.UTC(2026, 10, 18, 12, 0, 0) + n * 1000).toISOString();
  const say = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } };
  const backlogA = (B) => {   // a turn the PARSE never saw (a gap), its records reaching the device feed only after a newer turn
    const sx = { name: 'bk-a', backend: 'claude' }; B.noteTurnAttach(sx);
    for (let i = 0; i < 650; i++) B.noteTurnOpener(sx, { ...say, uuid: 'fa-' + i, timestamp: Tm(100 + i) }, 'parse');
    B.noteTurnOpener(sx, { type: 'result', uuid: V('ra') }, 'parse');
    B.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: V('ia') }, 'parse');
    B.noteTurnOpener(sx, { type: 'user', uuid: V('ua'), timestamp: Tm(800), origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification>done</task-notification>' } }, 'parse');
    for (const r of [{ type: 'frame_stamp', cli_uuid: V('pa') }, { ...say, uuid: V('oa'), timestamp: Tm(5) }, { type: 'system', subtype: 'init', uuid: V('i0'), user_message_uuids: [V('pa')] }]) B.noteTurnOpener(sx, r, 'device');
    return sx;
  };
  const backlogB = (B) => {   // a stream with NO stamps: the turn that opened replayed by the device feed after 650 other records
    const sx = { name: 'bk-b', backend: 'claude' }; B.noteTurnAttach(sx);
    const old = [{ type: 'frame_stamp', cli_uuid: V('pb') }, { type: 'system', subtype: 'init', uuid: V('ib'), user_message_uuids: [V('pb')] }, { ...say, uuid: V('ob') }, { type: 'result', uuid: V('rb') }];
    for (const r of old) B.noteTurnOpener(sx, r, 'parse');
    for (let i = 0; i < 650; i++) B.noteTurnOpener(sx, { ...say, uuid: 'fb-' + i }, 'parse');
    B.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: V('ic') }, 'parse');
    B.noteTurnOpener(sx, { type: 'user', uuid: V('uc'), origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification>done</task-notification>' } }, 'parse');
    for (const r of old.slice(0, 2)) B.noteTurnOpener(sx, r, 'device');
    return sx;
  };
  const bA = backlogA(SB), bB = backlogB(SB);
  ok(`B-d868 (as-if-must 12:09Z): a late backlog never takes an old turn's start — a turn the parse never saw, its records reaching the device feed BEHIND a newer result, opens nothing (${bA._turnBy.by}); an init that already opened a turn, replayed past the once-memory on a stream with no stamps, opens nothing (${bB._turnBy.by})`,
    bA._turnBy.by === 'task' && bB._turnBy.by === 'task', JSON.stringify({ a: bA._turnBy, b: bB._turnBy }));
  // the once-per-record rule's own leg (the reader: no red control covered it): the device feed's late copy of the LAST result
  // reaches the session after the next turn opened (a stream with no stamps) — taken once, it ends nothing
  const dupResult = (B) => { const sx = { name: 'dup', backend: 'claude' }; B.noteTurnAttach(sx); B.noteTurnOpener(sx, { type: 'result', uuid: V('r9') }, 'parse'); B.noteTurnOpener(sx, { type: 'frame_stamp', cli_uuid: V('p9') }, 'parse'); B.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: V('i9'), user_message_uuids: [V('p9')] }, 'parse'); B.noteTurnOpener(sx, { type: 'result', uuid: V('r9') }, 'device'); return sx; };
  const dR = dupResult(SB);
  ok(`B-d868: the once-per-record rule — the device feed's late copy of a result already taken ends nothing (${dR._turnBy.by}, live ${dR._turnLive})`, dR._turnBy.by === 'person' && dR._turnLive === true, JSON.stringify(dR._turnBy));
  // sbSeenFirst keys the wrapper's frame_stamp by the frame it names (it has no uuid): every one passes the device gate once
  const g = { name: 'g' };
  const gates = [brain.sbSeenFirst(g, { type: 'frame_stamp', cli_uuid: V('g1') }), brain.sbSeenFirst(g, { type: 'frame_stamp', cli_uuid: V('g2') }), brain.sbSeenFirst(g, { type: 'frame_stamp', cli_uuid: V('g1') })];
  ok(`B-d868 (its reader): sbSeenFirst keys a frame_stamp by its frame — two frames pass, a repeat does not (${gates.join(',')})`, gates.join() === 'true,true,false', gates.join());
  // RED CONTROLS (each anchored; a missing anchor fails BY NAME)
  const fromOrder = "  if ((msg.type === 'result' || (msg.type === 'system' && msg.subtype === 'init')) && (st.feedAt[feed] || 0) < st.resultAt) return;\n";
  const fromOpened = "  if (msg.type === 'system' && msg.subtype === 'init' && key) { if (st.opened.has(key)) return; st.opened.add(key); if (st.opened.size > 2000) st.opened.delete(st.opened.values().next().value); }\n";
  const fromSeen = "  if (key) { if (st.seen.has(key)) return;";
  const fromFsKey = "rec.uuid || (rec.type === 'frame_stamp' && rec.cli_uuid ? 'fs:' + rec.cli_uuid : ((rec.requestId";
  if (anchor(SBsrc, fromOrder, 'B-d868 the stream\'s order')) {
    const x = backlogA(brainCopy(SBsrc.replace(fromOrder, ''), 'no-order'));
    ok(`CONTROL (B-d868): the copy without the stream's order lets the backlog's old init take the turn running now («${x._turnBy.by}», ${x._turnBy.source} — B-3336's belt keeps a device-taken init from the person) — the leg goes red`, x._turnBy.by !== 'task' && x._turnBy.source === 'device-init' && x._turnLive === true, JSON.stringify(x._turnBy));
  }
  if (anchor(SBsrc, fromOpened, 'B-d868 an init opens once')) {
    const x = backlogB(brainCopy(SBsrc.replace(fromOpened, ''), 'no-opened'));
    ok(`CONTROL (B-d868): the copy that forgets the inits it opened lets an unstamped replay take the turn running now («${x._turnBy.by}», ${x._turnBy.source} — B-3336's belt keeps a device-taken init from the person) — the leg goes red`, x._turnBy.by !== 'task' && x._turnBy.source === 'device-init' && x._turnLive === true, JSON.stringify(x._turnBy));
  }
  if (anchor(SBsrc, fromSeen, 'B-d868 the once-gate')) {
    const x = dupResult(brainCopy(SBsrc.replace(fromSeen, '  if (key) { if (false) return;'), 'no-once'));
    ok(`CONTROL (B-d868): the copy without the once-gate lets the late copy of a result end the running turn («${x._turnBy.by}») — the leg goes red`, x._turnBy.by !== 'person');
  }
  if (anchor(SBsrc, fromFsKey, 'B-d868 the frame_stamp key')) {
    const B = brainCopy(SBsrc.replace(fromFsKey, "rec.uuid || (false ? '' : ((rec.requestId"), 'fs-collapse').create({ engine: {}, applyTaskToolUpdate() { }, updateSessionTodos() { } });
    const g2 = { name: 'g2' };
    const v = [B.sbSeenFirst(g2, { type: 'frame_stamp', cli_uuid: V('h1') }), B.sbSeenFirst(g2, { type: 'frame_stamp', cli_uuid: V('h2') })];
    ok(`CONTROL (B-d868): the copy keyed requestId:type:subtype collapses the second frame_stamp (${v.join(',')}) — the leg goes red`, v.join() === 'true,false');
  }
  // (cure 3, 主开发 12:32Z) THE DEVICE FEED'S POSITION IS NOTED WHERE IT DELIVERS — before the gate that may drop the record. The
  // parse REGISTERS every record in the brain's own seen-first gate (as the hub wires it), the device path is server.js's OWN line
  // (evaluated as written), and the parse sees a turn's stamped records but MISSES its result and the next init, which the device
  // feed alone supplies — the turn ends and the next opens (the tip before this cure dropped both as «behind»: the previous «you» stood)
  const SJ = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const devLineOf = (src) => { const l = src.split('\n').find((x) => x.includes('if (sbSeenFirst(sess, rec)) claudeSideEffects(sess, sess._webuiId || null, rec);')); if (!l) throw new Error("the anchor of the device path's line is not in server.js"); return l.replace(/\/\/.*$/, ''); };
  const gapRun = (lineText) => {
    const B = SB.create({ engine: {}, applyTaskToolUpdate() { }, updateSessionTodos() { } });
    const { attach: attachG } = consumer.create({ activeSessions, engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result', 'command_lifecycle']), _seenStreamTypes: new Set(),
      USAGE_SCANNER_PATH: path.join(tmp, 'none'), checkClaudeGoalStatus() { }, noteModelSeen() { }, sbSeenFirst: (sx2, m2) => B.sbSeenFirst(sx2, m2), hosts: null, usageHistory: null, pagesRef: { current: null } });
    const gid = 'w-gap-' + Math.random().toString(36).slice(2, 6), cid = 'c1d00000-0000-4000-8000-' + String(++n).padStart(12, '0');
    const sx = { mode: 'chat', backend: 'claude', name: gid, cwd: CWD, host: 'h-gap', keeperSid: 'k-gap', claudeSessionId: cid, backendSessionId: cid, sockName: 'cw-' + gid, buffer: '', createdAt: Date.now() };
    sx._normalizer = createMessageManager('claude', gid); activeSessions.set(gid, sx); const px = fakePty(); attachG(sx, gid, px, helpers);
    const dev = new Function('noteTurnFeed', 'sbSeenFirst', 'claudeSideEffects', 'sess', 'rec', lineText);
    const device = (r) => dev(B.noteTurnFeed, B.sbSeenFirst, B.claudeSideEffects, sx, r);
    const both = (r) => { px.data(J(r)); device(r); };   // the parse first (it registers), then the device feed (dropped by the gate)
    const G = (k) => 'd8680000-0000-4000-8000-0000000003' + k;
    both({ type: 'frame_stamp', cli_uuid: G('p0') }); both({ type: 'system', subtype: 'init', uuid: G('i0'), user_message_uuids: [G('p0')] });
    both({ type: 'assistant', uuid: G('a0'), timestamp: Tm(50), message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }); both({ type: 'result', uuid: G('r0') });
    both({ type: 'frame_stamp', cli_uuid: G('p1') }); both({ type: 'system', subtype: 'init', uuid: G('i1'), user_message_uuids: [G('p1')] });
    both({ type: 'assistant', uuid: G('a1'), timestamp: Tm(100), message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } });
    const before = { ...sx._turnBy };
    device({ type: 'result', uuid: G('r1') }); const ended = { by: sx._turnBy.by, source: sx._turnBy.source, live: sx._turnLive };   // the parse MISSED these two
    device({ type: 'system', subtype: 'init', uuid: G('i2') });
    activeSessions.delete(gid);
    return { before, ended, after: { by: sx._turnBy.by, source: sx._turnBy.source, live: sx._turnLive } };
  };
  const devLine = devLineOf(SJ);
  const gap = gapRun(devLine);
  ok(`B-d868 (cure 3): the parse misses a result and the next init, the device feed supplies them — the turn ends (${gap.ended.by}, ${gap.ended.source}, live ${gap.ended.live}) and the next opens (${gap.after.source}, live ${gap.after.live}); never the previous «${gap.before.by}»`,
    gap.before.by === 'person' && gap.ended.by === 'unrecorded' && gap.ended.source === 'turn-ended' && gap.ended.live === false && gap.after.source === 'pending' && gap.after.live === true, JSON.stringify(gap));
  const fromFeed = "noteTurnFeed(sess, rec, 'device'); ";
  if (anchor(devLine, fromFeed, 'B-d868 the device position noted before its gate')) {
    const g0 = gapRun(devLine.replace(fromFeed, ''));
    ok(`CONTROL (B-d868 cure 3): server.js's device line without the position (the tip before this cure) drops the result and the init the device alone supplied — the previous «${g0.after.by}» stands, live ${g0.after.live}`, g0.after.by === 'person' && g0.after.live === true, JSON.stringify(g0));
  }
  // B-3336 (主开发 r794, the panel's ruling): a stream sequence is the design for the day a paired machine's conversation may start a
  // turn by a press; TODAY that press refuses every such conversation, so the unit proves today's opener: THE BELT, THE PARSE'S
  // HAND-OVER past a throwing consumer, A FUZZ of both feeds, and THE COUPLING PIN. Every leg prints the facts it judges.
  const { anchored } = await import('./scratch.mjs');
  // 1. THE BELT (r794, restated r847) — an init the PARSE NEVER BRINGS never reads as the person's («unrecorded», source device-init);
  //    a device-first init holds it only UNTIL the parse's own copy of that init arrives: then the turn is decided as the parse alone
  const beltRun = (M) => {
    const sx = { name: 'belt', backend: 'claude', host: 'h-belt' }; M.noteTurnAttach(sx);
    const K = (k) => 'b3336000-0000-4000-8000-0000000009' + k;
    const now = () => ({ by: sx._turnBy.by, source: sx._turnBy.source, live: sx._turnLive, bg: JSON.stringify(sx._turnByBackground || []) });
    // (a) the init road, the ordinary race: the person's frame (the hub-side wrapper's stamp: the parse only), the device's init first…
    M.noteTurnOpener(sx, { type: 'frame_stamp', cli_uuid: K('p1') }, 'parse');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i1'), user_message_uuids: [K('p1')] }, 'device');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'task_started', uuid: K('t1'), task_id: 'bg-belt', tool_use_id: 'toolu_b', is_backgrounded: true, task_type: 'local_agent' }, 'device');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'background_tasks_changed', uuid: K('t2'), tasks: [{ task_id: 'bg-belt', task_type: 'local_agent' }] }, 'device');
    const first = now();
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i1'), user_message_uuids: [K('p1')] }, 'parse');   // …then the parse's own copy
    const copy = now();
    M.noteTurnOpener(sx, { type: 'result', uuid: K('r1') }, 'device');
    // (b) the first-record road: an init that names nothing, its first record the person's stamped user record — the device's both first
    M.noteTurnOpener(sx, { type: 'frame_stamp', cli_uuid: K('u2') }, 'parse');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i2') }, 'device');
    M.noteTurnOpener(sx, { type: 'user', uuid: K('u2'), message: { role: 'user', content: 'go on' } }, 'device');
    const second = now();
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i2') }, 'parse');   // the parse's copy of that init
    const secondCopy = now();
    M.noteTurnOpener(sx, { type: 'result', uuid: K('r2') }, 'parse');
    // (c) an init the parse NEVER brings (a parse gap): the person's stamp held, the device's init alone — the turn runs on, then ends
    M.noteTurnOpener(sx, { type: 'frame_stamp', cli_uuid: K('p3') }, 'parse');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i3'), user_message_uuids: [K('p3')] }, 'device');
    M.noteTurnOpener(sx, { type: 'assistant', uuid: K('a3'), message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }, 'device');
    const gapTurn = now();
    M.noteTurnOpener(sx, { type: 'result', uuid: K('r3') }, 'device');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i3'), user_message_uuids: [K('p3')] }, 'parse');   // a copy AFTER the turn's end decides nothing
    const late = now();
    // (d) the parse-taken path, unchanged
    M.noteTurnOpener(sx, { type: 'frame_stamp', cli_uuid: K('p4') }, 'parse');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i4'), user_message_uuids: [K('p4')] }, 'parse');
    const third = now();
    M.noteTurnOpener(sx, { type: 'result', uuid: K('r4') }, 'parse');
    // (e) the device delivers a whole person's turn — its init, a helper's start, its end — before the parse's copy of the init: the
    //     turn stays ended, and the helper still running is keyed as the parse alone keys it
    M.noteTurnOpener(sx, { type: 'frame_stamp', cli_uuid: K('p5') }, 'parse');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i5'), user_message_uuids: [K('p5')] }, 'device');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'task_started', uuid: K('t5'), task_id: 'bg-belt5', tool_use_id: 'toolu_b5', is_backgrounded: true, task_type: 'local_agent' }, 'device');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'background_tasks_changed', uuid: K('t6'), tasks: [{ task_id: 'bg-belt5', task_type: 'local_agent' }] }, 'device');
    M.noteTurnOpener(sx, { type: 'result', uuid: K('r5') }, 'device');
    const ended = now();
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i5'), user_message_uuids: [K('p5')] }, 'parse');
    const endedCopy = now();
    const task = (id, u) => ({ type: 'system', subtype: 'task_started', uuid: K(u), task_id: id, tool_use_id: 'toolu_' + id, is_backgrounded: true, task_type: 'local_agent' });
    const bgSet = (u, ids) => ({ type: 'system', subtype: 'background_tasks_changed', uuid: K(u), tasks: ids.map((id) => ({ task_id: id, task_type: 'local_agent' })) });
    // (f) the command road: the person's command started between turns, the device's command record, init (naming nothing) and a
    //     helper all before the parse's stamp of that command and its copy of the init — the stamp the command names decides
    M.noteTurnOpener(sx, { type: 'command_lifecycle', state: 'started', uuid: K('l6'), command_uuid: K('c6') }, 'device');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i6') }, 'device');
    M.noteTurnOpener(sx, task('bg-c6', 't7'), 'device'); M.noteTurnOpener(sx, bgSet('t8', ['bg-c6']), 'device');
    M.noteTurnOpener(sx, { type: 'frame_stamp', cli_uuid: K('c6') }, 'parse');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i6') }, 'parse');
    const cmdCopy = now();
    M.noteTurnOpener(sx, { type: 'result', uuid: K('r6') }, 'device');
    // (g) the first-record road with a helper on each side of the first record: the device's init, helper A, the person's user record
    //     (its stamp not parsed yet), helper B; then the parse's stamp and copy — A was launched before anyone knew (the parse alone keys
    //     it «unrecorded» too), B after the person's record (the person's)
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i7') }, 'device');
    M.noteTurnOpener(sx, task('bg-a7', 't9'), 'device');
    M.noteTurnOpener(sx, { type: 'user', uuid: K('u7'), message: { role: 'user', content: 'go on' } }, 'device');
    M.noteTurnOpener(sx, task('bg-b7', 'ta'), 'device'); M.noteTurnOpener(sx, bgSet('tb', ['bg-a7', 'bg-b7']), 'device');
    const firstRec = now();
    M.noteTurnOpener(sx, { type: 'frame_stamp', cli_uuid: K('u7') }, 'parse');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i7') }, 'parse');
    const firstRecCopy = now();
    M.noteTurnOpener(sx, { type: 'result', uuid: K('r7') }, 'device');
    // (h) an OLD copy decides only its own turn: a person's turn the device opened and ended, then a task notification's turn the device
    //     opened — the parse's late copy of the person's init arrives while the newer turn stands: the newer turn keeps its own opener
    M.noteTurnOpener(sx, { type: 'frame_stamp', cli_uuid: K('p8') }, 'parse');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i8'), user_message_uuids: [K('p8')] }, 'device');
    M.noteTurnOpener(sx, { type: 'result', uuid: K('r8') }, 'device');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i9') }, 'device');
    M.noteTurnOpener(sx, { type: 'user', uuid: K('u9'), origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification>done</task-notification>' } }, 'device');
    M.noteTurnOpener(sx, { type: 'system', subtype: 'init', uuid: K('i8'), user_message_uuids: [K('p8')] }, 'parse');
    return { first, copy, second, secondCopy, gapTurn, late, third, ended, endedCopy, cmdCopy, firstRec, firstRecCopy, oldCopy: now() };
  };
  const belt = beltRun(SB);
  console.log('  B-3336 belt (the facts judged): ' + JSON.stringify(belt));
  ok(`B-3336 THE BELT, the ordinary race: the device's init first (the person's stamp held) reads «${belt.first.by}» (${belt.first.source}) only until the parse's own copy arrives — then «${belt.copy.by}» (${belt.copy.source}), and the helper it launched under the belt is the person's (${belt.copy.bg})`,
    belt.first.by === 'unrecorded' && belt.first.source === 'device-init' && belt.first.live === true && belt.first.bg === '["unrecorded"]'
      && belt.copy.by === 'person' && belt.copy.source === 'frame-stamp' && belt.copy.live === true && belt.copy.bg === '["person"]', JSON.stringify(belt));
  ok(`B-3336 THE BELT, the turn's first record: after a device-first init that names nothing, the person's stamped user record reads «${belt.second.by}» (${belt.second.source}) until the parse's copy of the init — then «${belt.secondCopy.by}» (${belt.secondCopy.source})`,
    belt.second.by === 'unrecorded' && belt.second.source === 'device-init' && belt.second.live === true && belt.secondCopy.by === 'person' && belt.secondCopy.source === 'frame-stamp', JSON.stringify({ second: belt.second, secondCopy: belt.secondCopy }));
  ok(`B-3336 THE BELT, an init the parse never brings: the turn reads «${belt.gapTurn.by}» (${belt.gapTurn.source}) for as long as it runs; a copy after its end decides nothing (${belt.late.source})`,
    belt.gapTurn.by === 'unrecorded' && belt.gapTurn.source === 'device-init' && belt.gapTurn.live === true && belt.late.source === 'turn-ended' && belt.late.live === false, JSON.stringify({ gapTurn: belt.gapTurn, late: belt.late }));
  ok(`B-3336 the parse-taken path is unchanged: the parse's init with the person's stamp reads the person («${belt.third.by}», ${belt.third.source})`,
    belt.third.by === 'person' && belt.third.source === 'frame-stamp', JSON.stringify(belt.third));
  ok(`B-3336 THE BELT, the command road: a device-first init that consumed the person's command reads «${belt.cmdCopy.by}» (${belt.cmdCopy.source}) once the parse brings the command's stamp and the init's copy, its helper ${belt.cmdCopy.bg}`,
    belt.cmdCopy.by === 'person' && belt.cmdCopy.source === 'frame-stamp' && belt.cmdCopy.live === true && belt.cmdCopy.bg === '["person"]', JSON.stringify(belt.cmdCopy));
  ok(`B-3336 THE BELT, a helper on each side of the first record: before the copy «${belt.firstRec.by}» (${belt.firstRec.source}) ${belt.firstRec.bg}; after it «${belt.firstRecCopy.by}» (${belt.firstRecCopy.source}) ${belt.firstRecCopy.bg} — the helper launched before the person's record stays «unrecorded», as the parse alone keys it`,
    belt.firstRec.by === 'unrecorded' && belt.firstRec.bg === '["unrecorded"]' && belt.firstRecCopy.by === 'person' && belt.firstRecCopy.source === 'frame-stamp' && belt.firstRecCopy.bg === '["unrecorded","person"]', JSON.stringify({ firstRec: belt.firstRec, firstRecCopy: belt.firstRecCopy }));
  ok(`B-3336 THE BELT, an old copy decides only its own turn: the parse's late copy of an ended person's turn leaves the newer turn «${belt.oldCopy.by}» (${belt.oldCopy.source}), live ${belt.oldCopy.live}`,
    belt.oldCopy.by === 'task' && belt.oldCopy.source === 'cli-record' && belt.oldCopy.live === true, JSON.stringify(belt.oldCopy));
  ok(`B-3336 THE BELT, a whole turn the device delivered before the parse's copy of its init: the turn stays ended (${belt.endedCopy.source}), its helper still running is keyed as the parse alone keys it (${belt.ended.bg} → ${belt.endedCopy.bg})`,
    belt.ended.source === 'turn-ended' && belt.ended.bg === '["unrecorded"]' && belt.endedCopy.source === 'turn-ended' && belt.endedCopy.live === false && belt.endedCopy.bg === '["person"]', JSON.stringify({ ended: belt.ended, endedCopy: belt.endedCopy }));
  const noUpgrade = (src) => anchored(src, "  if (key && feed === 'parse' && msg.type === 'system' && msg.subtype === 'init' && st.belted.has(key)) ", "  if (false && key && feed === 'parse' && msg.type === 'system' && msg.subtype === 'init' && st.belted.has(key)) ", 'B-3336 the parse\'s copy of the opening init');
  {
    const b0 = beltRun(brainCopy(anchored(SBsrc, "    st.firstFromDevice = feed === 'device';", "    st.firstFromDevice = false;", 'B-3336 the belt'), 'no-belt'));
    ok(`CONTROL (B-3336): the copy without the belt reads an init the parse never brings as the person's («${b0.gapTurn.by}») — the leg goes red`, b0.gapTurn.by === 'person', JSON.stringify(b0.gapTurn));
    const b1 = beltRun(brainCopy(noUpgrade(SBsrc), 'no-upgrade'));
    const b2 = beltRun(brainCopy(anchored(SBsrc, '  const byInit = names.some(held) || held(b.cmd);', '  const byInit = names.some(held);', 'B-3336 the command\'s stamp'), 'no-cmd-stamp'));
    ok(`CONTROL (B-3336): the copy that forgets the command's stamp leaves the command road «${b2.cmdCopy.by}» ${b2.cmdCopy.bg} — the leg goes red`, b2.cmdCopy.by === 'unrecorded' && b2.cmdCopy.bg === '["unrecorded"]', JSON.stringify(b2.cmdCopy));
    const b3 = beltRun(brainCopy(anchored(SBsrc, 'afterFirst: !st.first', 'afterFirst: true', 'B-3336 a helper before the first record'), 'all-after-first'));
    ok(`CONTROL (B-3336): the copy that keys every helper as after the first record calls the helper launched before the person's record the person's (${b3.firstRecCopy.bg}) — a false «you», the leg goes red`, b3.firstRecCopy.bg === '["person"]', JSON.stringify(b3.firstRecCopy));
    const b4 = beltRun(brainCopy(anchored(SBsrc, '  const standing = st.belt === b && st.live === true;', '  const standing = st.live === true;', 'B-3336 the copy\'s own turn'), 'any-standing'));
    ok(`CONTROL (B-3336): the copy whose old copy decides whatever turn is live renames the newer turn «${b4.oldCopy.by}» — the leg goes red`, b4.oldCopy.by === 'person', JSON.stringify(b4.oldCopy));
    ok(`CONTROL (B-3336, r847): the copy without the parse copy's decision keeps the person's own turn «${b1.copy.by}» (${b1.copy.source}) after the parse's copy, its first-record turn «${b1.secondCopy.by}» and an ended turn's helper ${b1.endedCopy.bg} — the legs go red`, b1.copy.by === 'unrecorded' && b1.copy.bg === '["unrecorded"]' && b1.secondCopy.by === 'unrecorded' && b1.endedCopy.bg === '["unrecorded"]', JSON.stringify({ copy: b1.copy, secondCopy: b1.secondCopy, endedCopy: b1.endedCopy }));
  }
  {   // a throw INSIDE the opener is said once per session and counted — its callers' empty catches never see it
    const placeIn = (src) => anchored(src, 'function takeTurnRecord(session, msg, feed) {\n', "function takeTurnRecord(session, msg, feed) {\n  if (msg && msg.__openerThrow) throw new Error('a placed throw inside the opener (B-3336 leg)');\n", 'B-3336 the opener\'s own throw');
    const inside = (M) => {
      const sx = { name: 'op-thr', backend: 'claude' }; M.noteTurnAttach(sx);
      const warn = console.warn; let said = [], escaped = null;
      console.warn = (...a) => { said.push(a.join(' ')); };
      try { for (let i = 0; i < 3; i++) M.noteTurnOpener(sx, { type: 'result', uuid: 'op-thr-' + i, __openerThrow: true }, i % 2 ? 'device' : 'parse'); } catch (e) { escaped = e.message; } finally { console.warn = warn; }
      return { said, escaped, faults: sx._turnOpenerFaults || 0 };
    };
    const it = inside(brainCopy(placeIn(SBsrc), 'opener-throw'));
    console.log('  B-3336 the opener\'s own throw (the facts judged): ' + JSON.stringify(it));
    ok(`B-3336: a throw inside the opener is SAID once per session (${it.said.length} line) and counted (${it.faults}) — nothing escapes to its callers' empty catches`,
      it.escaped === null && it.faults === 3 && it.said.length === 1 && /the turn opener failed on a result record \(parse\): a placed throw inside the opener/.test(it.said[0]), JSON.stringify(it));
    const i0 = inside(brainCopy(anchored(placeIn(SBsrc), '    if (session._turnOpenerFaults === 1) console.warn(', '    if (false) console.warn(', 'B-3336 the opener says its fault'), 'opener-throw-unsaid'));
    ok(`CONTROL (B-3336): the copy whose opener does not say its fault leaves it unsaid (${i0.said.length} lines) — the leg goes red`, i0.said.length === 0 && i0.escaped === null, JSON.stringify(i0));
  }
  // 2. THE PARSE HANDS EVERY RECORD TO THE OPENER — a consumer that throws between the parse and the opener's call (a placed throw)
  //    never costs the opener its record: the catch hands it, once
  const parseRun = (cons) => {
    const B = SB.create({ engine: {}, applyTaskToolUpdate() { }, updateSessionTodos() { } });
    const { attach: attachP } = cons.create({ activeSessions, engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result', 'command_lifecycle']), _seenStreamTypes: new Set(),
      USAGE_SCANNER_PATH: path.join(tmp, 'none'), checkClaudeGoalStatus() { }, noteModelSeen() { }, sbSeenFirst: (sx2, m2) => B.sbSeenFirst(sx2, m2), hosts: null, usageHistory: null, pagesRef: { current: null } });
    const gid = 'w-thr-' + Math.random().toString(36).slice(2, 6), cid = 'c1d00000-0000-4000-8000-' + String(++n).padStart(12, '0');
    const sx = { mode: 'chat', backend: 'claude', name: gid, cwd: CWD, claudeSessionId: cid, backendSessionId: cid, sockName: 'cw-' + gid, buffer: '', createdAt: Date.now() };
    sx._normalizer = createMessageManager('claude', gid); activeSessions.set(gid, sx); const px = fakePty(); attachP(sx, gid, px, helpers);
    const T = (k) => 'b3336000-0000-4000-8000-0000000010' + k;
    try {
      px.data(J({ type: 'frame_stamp', cli_uuid: T('p0') })); px.data(J({ type: 'system', subtype: 'init', uuid: T('i0'), user_message_uuids: [T('p0')] }));
      const before = { by: sx._turnBy.by, live: sx._turnLive };
      px.data(J({ type: 'result', uuid: T('r0'), subtype: 'success', __placedThrow: true }));   // its handling throws before the opener's call
      return { before, after: { by: sx._turnBy.by, source: sx._turnBy.source, live: sx._turnLive } };
    } finally { activeSessions.delete(gid); }
  };
  {
    const placeThrow = (src) => anchored(src, '          parsed = true; parsedMsg = msg;\n', "          parsed = true; parsedMsg = msg;\n          if (msg.__placedThrow) throw new Error('a placed throw (B-3336 leg)');\n", 'B-3336 the placed throw');
    const pt = parseRun(require(MU.write('src/server/stdout/claude-stream-json.js', placeThrow(CSsrc), 'placed-throw')));
    console.log('  B-3336 placed throw (the facts judged): ' + JSON.stringify(pt));
    ok(`B-3336 THE PARSE'S HAND-OVER: a result whose handling THREW before the opener's call still ends the turn (live ${pt.before.live} → ${pt.after.live}, ${pt.after.source})`,
      pt.before.by === 'person' && pt.before.live === true && pt.after.live === false && pt.after.source === 'turn-ended', JSON.stringify(pt));
    const noGuard = anchored(placeThrow(CSsrc), "          if (parsedMsg && !openerFed && parsedMsg.type !== 'command_lifecycle') { try { TO.noteTurnOpener(session, parsedMsg, 'parse'); } catch { } }\n", '', 'B-3336 the catch hands the record');
    const p0 = parseRun(require(MU.write('src/server/stdout/claude-stream-json.js', noGuard, 'placed-throw-no-guard')));
    ok(`CONTROL (B-3336): the same placed throw in the copy without the catch's hand-over — the opener never hears the result: live ${p0.after.live}`, p0.after.live === true, JSON.stringify(p0));
  }
  {   // …and the DEVICE feed's twin (claudeSideEffects): a consumer that throws before its opener's call never costs the opener the record
    const placeDev = (src) => anchored(src, '    noteConvFacts(session, msg); // lane conversation-facts', "    if (msg.__placedThrow) throw new Error('a placed throw (B-3336 device leg)');\n    noteConvFacts(session, msg); // lane conversation-facts", 'B-3336 the device placed throw');
    const devThrow = (M) => {
      const B = M.create({ engine: {}, applyTaskToolUpdate() { }, updateSessionTodos() { } });
      const sx = { name: 'dev-thr', backend: 'claude', host: 'h-thr' }; M.noteTurnAttach(sx);
      const D = (k) => 'b3336000-0000-4000-8000-0000000011' + k;
      B.claudeSideEffects(sx, 'dev-thr', { type: 'system', subtype: 'init', uuid: D('i0'), session_id: 'x' });
      const before = { by: sx._turnBy.by, source: sx._turnBy.source, live: sx._turnLive };
      const warn = console.warn; let said = ''; console.warn = (...a) => { said += a.join(' '); };
      try { B.claudeSideEffects(sx, 'dev-thr', { type: 'result', uuid: D('r0'), subtype: 'success', __placedThrow: true }); } finally { console.warn = warn; }
      return { before, after: { by: sx._turnBy.by, source: sx._turnBy.source, live: sx._turnLive }, said };
    };
    const dt = devThrow(brainCopy(placeDev(SBsrc), 'device-placed-throw'));
    console.log('  B-3336 device placed throw (the facts judged): ' + JSON.stringify(dt));
    ok(`B-3336 THE DEVICE FEED'S HAND-OVER: a result whose device handling THREW before the opener's call still ends the turn (live ${dt.before.live} → ${dt.after.live}, ${dt.after.source}) and the failure is still said`,
      dt.before.live === true && dt.after.live === false && dt.after.source === 'turn-ended' && /device side-effects failed: a placed throw/.test(dt.said), JSON.stringify(dt));
    const d0 = devThrow(brainCopy(anchored(placeDev(SBsrc), "    if (!openerFed) { try { noteTurnOpener(session, msg, 'device'); } catch { } }", '', 'B-3336 the device catch hands the record'), 'device-placed-throw-no-guard'));
    ok(`CONTROL (B-3336): the same placed throw in the copy without the device catch's hand-over — the opener never hears the result: live ${d0.after.live}`, d0.after.live === true, JSON.stringify(d0));
  }
  // 3. A FUZZ OF TODAY'S OPENER (kept from the unnumbered half of unit one): both feeds deliver the whole stream in random
  //    interleavings, each in its own order — the device feed WITHOUT the wrapper's own stamps (they reach the parse only). At EVERY
  //    point both feeds stand level (each has delivered records 0..m — so the parse has brought every init up to m) the opener holds
  //    EXACTLY today's parse-alone state after record m (r847: no person→unrecorded allowance there; the device winning the race is
  //    the ordinary case)
  const fuzzSeq = [...seq, { type: 'result', uuid: V('18'), subtype: 'success', session_id: 'x' },
    { type: 'frame_stamp', msg_id: 'web-p4', cli_uuid: V('21') }, { type: 'system', subtype: 'init', uuid: V('22'), session_id: 'x' }, { type: 'user', uuid: V('21'), message: { role: 'user', content: 'go on' } },   // an init that names nothing: its first record — the person's stamped user record — decides
    { type: 'assistant', uuid: V('23'), message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }, { type: 'result', uuid: V('24'), subtype: 'success', session_id: 'x' },
    { type: 'frame_stamp', msg_id: 'web-p3', cli_uuid: V('19') }, { type: 'system', subtype: 'init', uuid: V('20'), session_id: 'x', user_message_uuids: [V('19')] }];
  const factOf = (sx) => ({ by: sx._turnBy.by, source: sx._turnBy.source, live: sx._turnLive, bg: JSON.stringify(sx._turnByBackground || []) });
  const want = (() => { const alone = { name: 'fz-alone', backend: 'claude', host: 'h-fz' }; SB.noteTurnAttach(alone); return fuzzSeq.map((r) => { SB.noteTurnOpener(alone, r, 'parse'); return JSON.stringify(factOf(alone)); }); })();   // TODAY's opener, the parse alone, after each record
  const fuzz = (M) => {
    let seed = 0x3336;
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const L = fuzzSeq.length, devSkips = (x) => x < L && fuzzSeq[x].type === 'frame_stamp';
    let runs = 0, points = 0, devFirstPoints = 0, devFirstPersonPoints = 0, beltSeen = 0; const bad = [];
    for (let k = 0; k < 300; k++) {
      const sx = { name: 'fz-' + k, backend: 'claude', host: 'h-fz' }; M.noteTurnAttach(sx);
      let i = 0, j = 0, devFirst = false;
      const judge = (m) => { points++; const g = JSON.stringify(factOf(sx)); if (devFirst) { devFirstPoints++; if (want[m].includes('"by":"person"')) devFirstPersonPoints++; } if (g !== want[m]) bad.push({ k, at: m, got: g, want: want[m] }); };
      while (i < L || j < L) {
        if (i === j && i > 0) judge(i - 1);   // level: records 0..i-1 delivered by both (judged before the device skips a stamp: a turn's end is a level point too)
        if (devSkips(j)) { j++; continue; }   // the device feed never carries the wrapper's own records
        const takeParse = j >= L || (i < L && rnd() < 0.5);
        const at = takeParse ? i : j, r = fuzzSeq[at];
        if (r.type === 'system' && r.subtype === 'init' && (takeParse ? i >= j : j >= i)) devFirst = !takeParse;   // which feed delivered this init first
        M.noteTurnOpener(sx, r, takeParse ? 'parse' : 'device');
        if (!takeParse && devFirst && sx._turnBy.source === 'device-init') beltSeen++;   // the belt held, between the device's init and the parse's copy
        if (takeParse) i++; else j++;
      }
      judge(L - 1);   // the end: both feeds have delivered all
      runs++;
    }
    return { runs, points, devFirstPoints, devFirstPersonPoints, beltSeen, bad };
  };
  {
    const fz = fuzz(SB);
    console.log(`  B-3336 fuzz (the facts judged): ${fz.runs} interleavings, ${fz.points} level points judged EXACTLY against today's parse alone — ${fz.devFirstPoints} inside a turn whose init the device delivered first (${fz.devFirstPersonPoints} of them a person's turn), the belt seen holding ${fz.beltSeen} times between the device's init and the parse's copy; ${fz.bad.length} mismatches (both feeds carry the whole stream, so it never generates an init the parse never brings — the fixed belt leg covers that)${fz.bad.length ? ' — ' + JSON.stringify(fz.bad.slice(0, 2)) : ''}`);
    ok(`B-3336 THE FUZZ: ${fz.runs} random interleavings of both whole feeds; at each of ${fz.points} level points the opener holds EXACTLY today's parse-alone state — ${fz.devFirstPersonPoints} of them inside a person's turn whose init the device won the race for; ${fz.bad.length} mismatches`,
      fz.runs === 300 && fz.points > 2 * fz.runs && fz.bad.length === 0 && fz.devFirstPersonPoints > 0 && fz.beltSeen > 0, JSON.stringify(fz.bad.slice(0, 3)));
    // the fuzz CAN fail: the copy without the once-memory (a late copy from the other feed counts again) and the copy without the parse
    // copy's decision (r847's regression: the device winning the race keeps a person's turn «not recorded»), each judged against the same parse alone
    const f0 = fuzz(brainCopy(anchored(SBsrc, 'if (st.seen.has(key)) return; ', '', 'B-3336 fuzz: the once-memory'), 'fuzz-no-once'));
    const f1 = fuzz(brainCopy(noUpgrade(SBsrc), 'fuzz-no-upgrade'));
    console.log(`  B-3336 fuzz controls (the facts judged): without the once-memory ${f0.bad.length} mismatches${f0.bad.length ? ' — first ' + JSON.stringify(f0.bad[0]) : ''}; without the parse copy's decision ${f1.bad.length}${f1.bad.length ? ' — first ' + JSON.stringify(f1.bad[0]) : ''}`);
    ok(`CONTROL (B-3336): the copy without the once-memory — the fuzz names mismatches at its level points (${f0.bad.length})`, f0.bad.length > 0, JSON.stringify(f0.bad.slice(0, 1)));
    ok(`CONTROL (B-3336, r847): the copy without the parse copy's decision — the fuzz names mismatches at its level points (${f1.bad.length}): a person's turn the device won the race for left «not recorded»`, f1.bad.length > 0 && f1.bad.some((x) => x.want.includes('"by":"person"') && x.got.includes('"by":"unrecorded"')), JSON.stringify(f1.bad.slice(0, 1)));
  }
  // 4. THE COUPLING PIN — the group hand-over press refuses a conversation on another machine (the ONLY road with two feeds) WITH ITS
  //    REASON, and that refusal is lifted only together with a stream sequence; the readers of the turn-live flag are a NAMED list,
  //    and those that can start a turn are named apart: a new reader is red by name
  {
    const SH = fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf8');
    const refusal = "    if (s.host) return { ok: false, code: 'not_steerable', error: 'this conversation runs on another machine — the group messages ride its next turn' };";
    const fnNamed = (node, name) => {   // the press's own function node, by the parser (a re-indent or a reflow moves nothing)
      if (!node || typeof node.type !== 'string') return null;
      if (node.type === 'FunctionDeclaration' && node.id && node.id.name === name) return node;
      for (const v of Object.values(node)) for (const c of (Array.isArray(v) ? v : [v])) { if (c && typeof c === 'object' && typeof c.type === 'string') { const r = fnNamed(c, name); if (r) return r; } }
      return null;
    };
    const hogNode = fnNamed(require(path.join(REPO, 'node_modules/acorn')).parse(SH, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true }), 'handOverGroups');
    const hog = hogNode ? SH.slice(hogNode.start, hogNode.end) : '';
    ok('B-3336 COUPLING: the group hand-over press (handOverGroups) refuses every conversation on another machine by name, BEFORE its spend gate — and its line says it is lifted only together with a stream sequence (row B-3336\'s design (B))',
      hog.length > 500 && SH.split(refusal).length === 2 && hog.includes(refusal) && hog.includes('spendGuard.authorize(') && hog.indexOf(refusal) < hog.indexOf('spendGuard.authorize(') && /B-3336 COUPLING[^\n]*lifted ONLY together with a stream sequence/.test(SH), { bodyBytes: hog.length, inBody: hog.includes(refusal), refusalAt: hog.indexOf(refusal), gateAt: hog.indexOf('spendGuard.authorize(') });
    const TURN_LIVE_READERS = Object.freeze({   // file → [reads, can it start a turn, what]
      'src/server/user-input.js': [1, true, 'the group hand-over (not_mid_turn) — behind the press\'s remote refusal'],
      'src/adapters/claude-code.js': [1, false, 'a Stop\'s settle stamp (_stopAskedAt) — a label, never a turn'],
    });
    // a read: `x._turnLive` / `x?._turnLive` / `x['_turnLive']` / a destructuring `{ _turnLive } =` — never `this.` (message-manager's own field) and never an assignment; a `//` comment is dropped (not one inside a string's `://`)
    const readsIn = (l) => { const c = l.replace(/(^|[^:'"\\])\/\/.*$/, '$1'); let k = 0; for (const m of c.matchAll(/(\w+)\s*(?:\?\.|\.)\s*_turnLive\b(\s*=(?!=))?/g)) if (m[1] !== 'this' && !m[2]) k++; k += (c.match(/\[\s*['"]_turnLive['"]\s*\]/g) || []).length; k += (c.match(/\{[^}]*\b_turnLive\b[^}]*\}\s*=[^=]/g) || []).length; return k; };
    const readersOf = (texts) => { const out = {}; for (const [f, t] of Object.entries(texts)) { if (!t.includes('_turnLive')) continue; for (const l of t.split('\n')) { const k = readsIn(l); if (k) out[f] = (out[f] || 0) + k; } } return out; };
    const srcFiles = ['server.js', ...fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).map((f) => 'src/' + String(f).split(path.sep).join('/')).filter((f) => f.endsWith('.js'))];
    const texts = Object.fromEntries(srcFiles.map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]));
    const judgeReaders = (found) => [...Object.keys(found).filter((f) => !TURN_LIVE_READERS[f]).map((f) => `${f}: ${found[f]} read(s) of the turn-live flag — a NEW reader: name it in TURN_LIVE_READERS, and say whether it can start a turn`),
      ...Object.entries(TURN_LIVE_READERS).filter(([f, [k]]) => (found[f] || 0) !== k).map(([f, [k]]) => `${f}: ${found[f] || 0} read(s), the list says ${k}`)];
    const found = readersOf(texts), wrong = judgeReaders(found);
    console.log('  B-3336 turn-live readers (the facts judged): ' + JSON.stringify(found));
    ok(`B-3336 COUPLING: the readers of the turn-live flag are the named list (${Object.entries(TURN_LIVE_READERS).map(([f, [, st, w]]) => `${f.split('/').pop()} — ${st ? 'CAN START A TURN' : 'a label'}: ${w}`).join('; ')})`, wrong.length === 0 && srcFiles.length > 100, wrong);
    ok('B-3336 COUPLING: the readers that can start a turn are exactly the group hand-over — the one behind the remote refusal', JSON.stringify(Object.entries(TURN_LIVE_READERS).filter(([, [, st]]) => st).map(([f]) => f)) === '["src/server/user-input.js"]'
      && /if \(session\._turnLive !== true\) return \{ ok: false, code: 'not_mid_turn'/.test(texts['src/server/user-input.js'] || ''), 'the starting reader moved');
    const planted = judgeReaders(readersOf({ ...texts, 'src/server/zz-new-reader.js': "function go(session) { if (session?._turnLive) startTurn(session); const url = 'http://x'; if (session['_turnLive']) go2(); const { _turnLive } = session; }\n" }));
    ok('CONTROL (B-3336): a planted NEW reader of the turn-live flag is red BY NAME — the shapes counted besides `.` (`?.`, a bracket, a one-line destructuring, after a `://` string)', planted.some((w) => /zz-new-reader\.js: 3 read\(s\) of the turn-live flag — a NEW reader/.test(w)), planted);
    // …and the turn-starting reader has ONE caller: the press — a second caller of the group hand-over origin would pass by the remote refusal
    const callersOf = (texts) => Object.entries(texts).flatMap(([f, t]) => (t.match(/origin:\s*'group-handover'/g) || []).map(() => f));
    const cal = callersOf(texts);
    ok(`B-3336 COUPLING: the group hand-over origin has ONE caller, the press behind the remote refusal (${cal.join(', ')})`, JSON.stringify(cal) === '["src/server/stash-handover.js"]' && hog.includes("origin: 'group-handover'"), cal);
    const cal2 = callersOf({ ...texts, 'src/server/zz-second-caller.js': "send(id, text, { origin: 'group-handover', steer: true });\n" });
    ok('CONTROL (B-3336): a planted second caller of the group hand-over origin is named', cal2.includes('src/server/zz-second-caller.js'), cal2);
    // the parse's hand-over is ONCE: the flag set right before the opener's call, the catch guarded by it
    const CSt = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8');
    const oncePin = (t) => /openerFed = true; try \{ TO\.noteTurnOpener\(session, msg, 'parse'\); \} catch \{ \}/.test(t) && /if \(parsedMsg && !openerFed && parsedMsg\.type !== 'command_lifecycle'\) \{ try \{ TO\.noteTurnOpener\(session, parsedMsg, 'parse'\); \} catch \{ \} \}/.test(t);
    ok('B-3336 the parse\'s hand-over is ONCE: `openerFed` is set right before the opener\'s call, and the catch hands a record only when it was not (never a command_lifecycle, whose fact waits on the skipped lookup)', oncePin(CSt), 'the hand-over\'s once-flag moved');
    ok('CONTROL (B-3336): the copy whose catch is not guarded by the once-flag fails the pin', !oncePin(anchored(CSt, 'if (parsedMsg && !openerFed && ', 'if (parsedMsg && ', 'B-3336 the once-flag')), 'the pin did not see the plant');
  }
  // (as-if-must (1)) AFTER A RE-ATTACH THE OPENER IS UNKNOWN until a turn starts in its sight: the person's turn, then a fresh
  // attach of the SAME session (a dead bridge healed, a parse gap) — never the previous «you»
  const ra = mkSession('w-reattach');
  ra.p.data(J({ type: 'frame_stamp', msg_id: 'web-r', cli_uuid: U('r') })); ra.p.data(J(init([U('r')])));
  const before = said(ra.s);
  attach(ra.s, 'w-reattach', fakePty(), helpers);
  const after = said(ra.s);
  ok(`B-d868 (as-if-must (1)): a re-attach makes the opener unknown (${before.by} → ${after.by}, ${after.source}) until a turn starts in its sight`, before.by === 'person' && after.by === 'unrecorded' && after.source === 'attach', JSON.stringify({ before, after }));
  // RED CONTROLS on the one implementation (session-brain), each anchored — a missing anchor fails BY NAME
  const brainOf = (src, name) => MU.load('src/server/session-brain.js', src, name);
  const run = (B, records, s0 = {}) => { const sx = { name: 'ctl', backend: 'claude', ...s0 }; B.noteTurnAttach(sx); for (const r of records) B.noteTurnOpener(sx, r, 'parse'); return sx; };
  const fromStart = "{ if (st.live === false) st.cmd = msg.command_uuid; return; }", fromEnd = "    setTurnBy(session, { by: 'unrecorded', source: 'turn-ended' });\n";
  const fromSay = "function sayBackground(session, st) { session._turnByBackground = [...new Set(st.bgLive.map((k) => st.launched.get(k) || 'unknown'))]; }";
  if (anchor(SBsrc, fromStart, 'B-d868 decide-at-the-start')) {
    const sx = run(brainOf(SBsrc.replace(fromStart, "{ st.live = true; if (st.persons.has(msg.command_uuid)) setTurnBy(session, { by: 'person', source: 'frame-stamp' }); return; }"), 'at-start'),
      [{ type: 'frame_stamp', cli_uuid: U(9) }, started(U(9)), assistant]);
    ok(`CONTROL (B-d868): the copy that decides at a command's start calls the steer after a restart «${sx._turnBy && sx._turnBy.by}» — the leg goes red`, !!sx._turnBy && sx._turnBy.by === 'person');
  }
  if (anchor(SBsrc, fromEnd, 'B-d868 the result ends it')) {
    const sx = run(brainOf(SBsrc.replace(fromEnd, ''), 'no-end'), [{ type: 'frame_stamp', cli_uuid: U(1) }, init([U(1)]), result(M3)]);
    ok(`CONTROL (B-d868): the copy whose result does not end the fact still says «${sx._turnBy && sx._turnBy.by}» between turns — the leg goes red`, !!sx._turnBy && sx._turnBy.by === 'person');
  }
  if (anchor(SBsrc, fromSay, 'B-d868 the opener at launch')) {
    const sx = run(brainOf(SBsrc.replace(fromSay, "function sayBackground(session, st) { session._turnByBackground = [...new Set(st.bgLive.map(() => openerKeyOf(session._turnBy)))]; }"), 'at-the-set'),
      [{ type: 'frame_stamp', cli_uuid: U('c') }, init([U('c')]), { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'bg-x', task_type: 'local_agent' }] }]);
    const v = require(path.join(REPO, 'src/message-manager.js')).turnByForAsk(sx._turnBy, sx._turnByBackground);
    ok(`CONTROL (B-d868): the copy that gives a running task the opener of the turn running when the set names it says «${v && v.by}» for a helper nobody saw start — the leg goes red`, !!v && v.by === 'person');
  }
  const fromAttach = "    try { require('../session-brain.js').noteTurnAttach(session); } catch { }";
  if (anchor(CSsrc, fromAttach, 'B-d868 the attach resets it')) {
    const CSx = require(MU.write('src/server/stdout/claude-stream-json.js', editAnchor(CSsrc, fromAttach, '', "src/server/stdout/claude-stream-json.js"), 'no-attach-reset'));
    const ax = CSx.create({ activeSessions, engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result', 'command_lifecycle']), _seenStreamTypes: new Set(), USAGE_SCANNER_PATH: path.join(tmp, 'none'), checkClaudeGoalStatus() { }, noteModelSeen() { }, sbSeenFirst: () => true, hosts: null, usageHistory: null, pagesRef: { current: null } });
    const rb = mkSession('w-reattach-ctl');
    rb.p.data(J({ type: 'frame_stamp', msg_id: 'web-rc', cli_uuid: U('d') })); rb.p.data(J(init([U('d')])));
    ax.attach(rb.s, 'w-reattach-ctl', fakePty(), helpers);
    ok(`CONTROL (B-d868): the copy whose attach does not reset the opener keeps «${rb.s._turnBy && rb.s._turnBy.by}» across a re-attach — the leg goes red`, !!rb.s._turnBy && rb.s._turnBy.by === 'person');
  }
}

console.log('— B-02a3: the consumer\'s facts for the group press — the live turn by the CLI\'s records, a Stop until idle, the wrapper\'s id-less word');
{
  const { s, p } = mkSession('w-gh');
  const said = [];
  p.data(J({ type: 'system', subtype: 'init', session_id: 'x', claude_code_version: '2.1.312' }));
  const live = s._turnLive;
  s._groupHandover = { said: (st) => said.push(st) };
  p.data(J({ type: 'input_handover', state: 'handed', msg_ids: ['web-1'], via: 'enter' }));   // a person's frame — never the group hand-over's
  p.data(J({ type: 'input_handover', state: 'handed', msg_ids: [], via: 'enter' }));
  p.data(J(result('cccccccc-0000-4000-8000-0000000002a3')));
  const ended = s._turnLive;
  s._stopAskedAt = Date.now();
  p.data(J({ type: 'system', subtype: 'session_state_changed', state: 'running', session_id: 'x' }));
  const stillStopping = s._stopAskedAt > 0;
  p.data(J({ type: 'system', subtype: 'session_state_changed', state: 'idle', session_id: 'x' }));
  // the third read: an INTERRUPTED result opens the Stop window whoever stopped it (a terminal's Stop never reaches the hub);
  // the follow-up's init the wrapper interrupts is live by its records, but the Stop still stands until the CLI's idle
  p.data(J({ type: 'system', subtype: 'init', session_id: 'x' }));
  p.data(J({ type: 'result', subtype: 'error_during_execution', is_error: true, terminal_reason: 'aborted_tools', session_id: 'x' }));
  const aborted = Number(s._stopAskedAt) > 0;
  p.data(J({ type: 'system', subtype: 'init', session_id: 'x' }));
  const followUp = { live: s._turnLive, stopping: Number(s._stopAskedAt) > 0 };
  p.data(J({ type: 'system', subtype: 'session_state_changed', state: 'idle', session_id: 'x' }));
  const fresh = mkSession('w-gh-fresh');
  ok(`B-02a3 (the third read): an interrupted result stamps the Stop (${aborted}); the follow-up's init is live yet the Stop stands (${JSON.stringify(followUp)}) until the idle (${s._stopAskedAt}); a fresh attach starts not live (${fresh.s._turnLive})`,
    aborted === true && followUp.live === true && followUp.stopping === true && s._stopAskedAt === 0 && fresh.s._turnLive === false, JSON.stringify({ aborted, followUp, stop: s._stopAskedAt, fresh: fresh.s._turnLive }));
  ok(`B-02a3: init ⇒ the turn is live (${live}), its result ends it (${ended}); the wrapper's word with NO message ids reaches the group hand-over, a person's frame's never (${JSON.stringify(said)}); a Stop settles at the CLI's idle, not before (${stillStopping} → ${s._stopAskedAt})`,
    live === true && ended === false && JSON.stringify(said) === '["handed"]' && stillStopping === true && s._stopAskedAt === 0, JSON.stringify({ live, ended, said, stop: s._stopAskedAt }));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
