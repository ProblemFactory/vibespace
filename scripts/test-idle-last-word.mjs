#!/usr/bin/env node
// B-ba09 — THE IDLE WORD IS THE LAST WORD (2.369.414). The attach reconcile found claude conversations IDLE by the CLI's own word
// while the hub's `_isStreaming` still said streaming (2026-11-15 00:28:53Z, two conversations): their stop, and a pool move
// deferred to it, waited for someone to open the window. THE HUNT read every writer of the flag at the release (a117cebb8):
//   · the parse (src/server/stdout/claude-stream-json.js): under authority its ONE raising writer is the state word — result,
//     compact_boundary and a user record stand down (`if (!authoritative)`); a retry (api_retry) and a resumed or self-started
//     turn (init) write a label only; a sub-conversation's records never reach the turn branch; a steer held behind a turn runs
//     as the CLI's own turn under 'running' (the recorded 2.1.308 frames below carry one). So NO parsed order of two records
//     raises the flag after an idle (④ pins every writer by its guard);
//   · the device feed (src/server/session-brain.js claudeSideEffects) writes no flag;
//   · OUTSIDE the parse, TWO ORDERS leave it up after the idle word:
//     (A) THE RESTORE — the ring ends result → idle, then the user records the CLI writes for a /compact typed after the
//         turn (the command echo, its caveat, its reply, the summary): the wrapper sidecar's DERIVED `streaming` turns TRUE at
//         the echo and the summary, and boot-restore seeded the flag from the sidecar beside the ring's idle ⇒ restored idle AND
//         streaming, and the first attach said «streaming reconciled (authoritative) → false»;
//     (B) A SEND THE CLI ANSWERS WITHOUT A TURN — src/server/user-input.js raises the flag at every send; a local command is
//         answered by the CLI itself (MEASURED 2.1.321, scripts/fixtures/claude-cli/2.1.321-typed-model.jsonl: a typed /model by
//         an init, a <synthetic> record and a num_turns-0 result; a set_model the hub writes by a <local-command-stdout> record;
//         the recorded /compact reply) and NO state word seen ⇒ the flag stands.
// THE CURE at the one place every road goes through, the CLI's last word: (A) the restore takes the flag FROM the ring's word
// (src/turn-state.js restoredStreaming; the sidecar only for a CLI that never says one); (B) under authority a send-raised flag
// held while the last word is idle drops at the CLI's no-turn answer (sendEndsAtLocalReply: only on what was observed, never a late
// record); the pool's stop there only when the person's last send was itself a local command (stopsAtLocalReply — the twin's
// blink, an earlier command's answer after a new prompt, forces nothing);
// (C) THE RECORDER: the reconcile's ONE journal line names the kinds of the last three records before it (never content).
//   ① A on recorded lines + its RED (the release's seed) + controls (a ring cut mid-turn, a parked turn, a ring with no word)
//   ② B through the REAL parse, each with its RED on a copy: the reply and the measured typed answer end the send (RED: the
//      release's parse); the stop comes at them (RED: the cure without it); a LATE answer ends nothing (RED: no late rule); THE
//      TWINS (an earlier command's answer after a prompt; the lock's set_model answer after a prompt) blink, end UP at the running
//      word and force no stop (RED: a stop at every answer); controls: a new turn after a send, an answer while running, a
//      parked turn, a sub-conversation's reply, a CLI with no word, a CLI that says running for the command
//   ③ C: kinds are closed words (every recorded record + planted content); the parse keeps the last three; the line names
//      them + its RED (the release's parse keeps none)
//   ④ the wiring: the parse's flag writers by guard, boot-restore's spread, the sidecar's rule (①'s premise), the send's
//      write, the reconcile's one line, the one writer of the kinds
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const TS = require(path.join(REPO, 'src/turn-state.js'));
const { MessageManager } = require(path.join(REPO, 'src/message-manager.js'));
const N = require(path.join(REPO, 'src/normalizers.js'));
const CONSUMER = 'src/server/stdout/claude-stream-json.js';

const { ok, report } = checker();

// ── the recorded lines ──
const recsOf = (rel) => read(rel).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((o) => o && typeof o === 'object' && !o._about);
const isWord = (r, st) => r && r.type === 'system' && r.subtype === 'session_state_changed' && (st === undefined || r.state === st);
const CLI308 = recsOf('scripts/fixtures/claude-cli/2.1.308-stamped.jsonl');
const turnFrom = (from) => { const a = CLI308.findIndex((r, i) => i >= from && isWord(r, 'running')); const b = CLI308.findIndex((r, i) => i > a && isWord(r, 'idle')); return a < 0 || b < 0 ? [] : CLI308.slice(a, b + 1); };
const TURN = turnFrom(0);                                       // running … a result … the held frame's own turn … a result … idle
const TURN2 = turnFrom(CLI308.indexOf(TURN[TURN.length - 1]) + 1); // running … a steer … a sub-task … a tool result … a result … idle
const RUNNING = TURN[0];
const UREC = recsOf('scripts/fixtures/message-origin/claude-user-records.jsonl');
const textOf = (r) => { const c = r && r.message && r.message.content; return typeof c === 'string' ? c : (Array.isArray(c) ? c.map((b) => (b && b.text) || '').join('') : ''); };
const pick = (re, more = () => true) => UREC.find((r) => re.test(textOf(r).trim()) && more(r));
const COMMAND = pick(/^<command-name>\/compact/);
const CAVEAT = pick(/^<local-command-caveat>/);
const REPLY = pick(/^<local-command-stdout>/);
const SUMMARY = pick(/^This session is being continued/, (r) => r.isCompactSummary === true);
const CLI321 = recsOf('scripts/fixtures/claude-cli/2.1.321-typed-model.jsonl');   // MEASURED on stdout (its _about row says how)
const TYPED_ANSWER = CLI321.slice(0, 3);   // a typed /model: init, a <synthetic> assistant record, a result with num_turns 0
const SETMODEL_ECHO = CLI321[3], SETMODEL_ACK = CLI321[4];   // a set_model the hub writes: <local-command-stdout>Set model to … (isReplay) + its control_response
console.log('— the recorded lines');
ok(TURN.length > 2 && TURN2.length > 2 && TURN.some((r) => r.type === 'result') && TURN2.some((r) => r.type === 'result') && isWord(TURN2[0], 'running') && isWord(TURN2[TURN2.length - 1], 'idle'),
  '2.1.308: two recorded turns, each from its running word to its idle word, results inside (the derived end)', [TURN.length, TURN2.length]);
ok(TURN2.some((r) => TS.recordKind(r) === 'user/prompt') && TURN2.some((r) => r.subtype === 'task_started') && TURN2.some((r) => TS.recordKind(r) === 'user/tool-result'), '…the second carries a steer (a main-thread user record mid-turn), a sub-task and a tool result');
ok(!!(COMMAND && CAVEAT && REPLY && SUMMARY), 'the recorded user shapes of a /compact typed after a turn: the command echo, its caveat, its reply, the summary — each recorded; the ORDERS below are composed here from recorded records, not recorded in that order');
ok(TYPED_ANSWER[0].subtype === 'init' && TYPED_ANSWER[1].message.model === '<synthetic>' && TYPED_ANSWER[2].type === 'result' && TYPED_ANSWER[2].num_turns === 0
  && SETMODEL_ECHO.type === 'user' && SETMODEL_ECHO.isReplay === true && /^<local-command-stdout>Set model to /.test(textOf(SETMODEL_ECHO).trim()) && SETMODEL_ACK.type === 'control_response',
  'MEASURED 2.1.321 (the fixture\'s _about): a TYPED /model is answered by an init, a <synthetic> assistant record and a num_turns-0 result; a set_model the hub writes by a <local-command-stdout> user record (isReplay) and its control_response');

// ═══ ① A: a restored session's flag is the ring's last word ═══
console.log('— ① A: the restore');
// the wrapper sidecar's `streaming` by the wrapper's own rule (data/bin/chat-wrapper.js, pinned in ④): true at a user record that
// is no `<local-command-` echo, false at a result or a compact boundary
const sidecarOver = (recs) => { let v = false; for (const r of recs) { if (r.type === 'user' && !/^<local-command-/.test(textOf(r).trim())) v = true; if (r.type === 'result' || (r.type === 'system' && r.subtype === 'compact_boundary')) v = false; } return v; };
const ringOf = (recs) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
const AFTER = [COMMAND, CAVEAT, REPLY, SUMMARY];
const recsA = [...TURN, ...AFTER], ringA = ringOf(recsA), sidecarA = sidecarOver(recsA);
ok(TS.turnStateInRing(ringA) === 'idle' && sidecarA === true, 'the premise: the ring\'s last word is idle while the derived sidecar says streaming');
const attachOf = (s) => TS.reconcileAttachStreaming({ turnStateSeen: s._turnStateSeen === true, turnState: s._turnState || null, isStreaming: !!s._isStreaming, sidecar: null });
const releaseSeed = (ring, sc) => ({ _isStreaming: !!sc, ...TS.restoredTurnState(ring) }); // a117cebb8's boot-restore: the sidecar's flag beside the ring's word
const curedA = TS.restoredStreaming(ringA, sidecarA), relA = releaseSeed(ringA, sidecarA);
ok(curedA._isStreaming === false && curedA._turnStateSeen === true && curedA._turnState === 'idle', 'THE CURE: the restore takes the flag from the ring\'s idle ⇒ not streaming, the authority latched', curedA);
ok(attachOf(curedA).action === 'none', '…so the first attach has nothing to correct', attachOf(curedA));
ok(relA._isStreaming === true && attachOf(relA).action === 'authoritative' && attachOf(relA).isStreaming === false, 'RED (the release\'s seed): restored idle AND streaming ⇒ the first attach «reconciled (authoritative) → false», the row\'s journal line', attachOf(relA));
const mid = TURN.slice(0, TURN.findIndex((r) => r.type === 'result'));
ok(TS.restoredStreaming(ringOf(mid), false)._isStreaming === true && TS.restoredStreaming(ringOf(mid), false)._turnState === 'running', 'control: a ring cut mid-turn (last word running) restores streaming whatever the sidecar says');
ok(TS.restoredStreaming(ringOf([...mid, { ...RUNNING, state: 'requires_action' }]), false)._isStreaming === true, 'control: a parked turn (requires_action) restores streaming (waiting on the person, not ended)');
const noWord = recsA.filter((r) => !isWord(r));
ok(TS.restoredStreaming(ringOf(noWord), true)._isStreaming === true && TS.restoredStreaming(ringOf(noWord), false)._isStreaming === false && !('_turnStateSeen' in TS.restoredStreaming(ringOf(noWord), true)),
  'control: a ring with NO state word (a CLI that never says one) keeps the sidecar both ways and latches no authority');

// ═══ ② B: a send the CLI answers without a turn, through the REAL parse ═══
console.log('— ② B: the real parse');
const csSrc = read(CONSUMER);
const STREAM_TYPES = new Set(['system', 'assistant', 'user', 'result', 'control_request', 'control_response', 'control_cancel_request', 'queue_changed', 'queued_input', 'command_lifecycle', 'input_handover']);
function drive(consumer, steps, { late = [] } = {}) {
  const stops = [];
  const engine = { _vsuPending: new Map(), resolveUsageKey: () => '__global__', usageEstimator: { noteLive() {} }, modelsMatch: () => false, servedDefinesModel: () => false, rerouteAnnouncedBy: () => null,
    noteTurnStopped: (x) => stops.push(x._turnState), recordIsLate: (x, m) => !!(m && late.includes(m.uuid)) };
  for (const part of (/const \{([^}]*)\} = engine;/.exec(csSrc) || ['', ''])[1].split(',')) {
    const name = part.split(':')[0].replace(/\/\/.*$/, '').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(name) && !(name in engine)) engine[name] = () => {};
  }
  const activeSessions = new Map();
  const { attach } = consumer.create({
    activeSessions, engine, CLAUDE_STREAM_TYPES: STREAM_TYPES, _seenStreamTypes: new Set(),
    USAGE_SCANNER_PATH: path.join(scratch('idle-last-word'), 'none'), checkClaudeGoalStatus() {}, noteModelSeen() {}, sbSeenFirst: () => true, hosts: null, usageHistory: null, pagesRef: { current: null },
  });
  const helpers = { feedLive: N.feedLive, broadcastToSession() {}, broadcastActiveSessions() {}, readSessionMeta: () => ({}), writeSessionMeta() {}, updateSessionTodos() {}, applyTaskToolUpdate() {}, emitTaskListTodos() {} };
  const id = 'sess-ba09';
  const s = { mode: 'chat', backend: 'claude', name: 'ba09', cwd: '/tmp', host: null, claudeSessionId: null, backendSessionId: null, sockName: 'cw-ba09', buffer: '', createdAt: Date.now(), _webuiId: id, _taskRecords: {} };
  s._normalizer = new MessageManager(id);
  activeSessions.set(id, s);
  const h = { data: null, onData(cb) { h.data = cb; }, onExit() {} };
  const trace = [];
  const warn = console.warn, log = console.log;
  console.warn = () => {}; console.log = () => {};
  try {
    attach(s, id, h, helpers);
    for (const st of steps) {
      if (st && typeof st.send === 'string') { s._isStreaming = true; s._lastSendLocal = TS.localCommandText(st.send); trace.push(['send', true]); continue; } // src/server/user-input.js's two writes at every send (④)
      h.data(JSON.stringify(st) + '\n');
      trace.push([TS.recordKind(st), s._isStreaming === true]);
    }
  } finally {
    console.warn = warn; console.log = log;
    activeSessions.delete(id);
    try { for (const w of (s.subagentWatchers || new Map()).values()) { if (w && w.retry) clearTimeout(w.retry); if (w && w.watcher && w.watcher.close) w.watcher.close(); } } catch {}
  }
  return { s, trace, stops, flag: s._isStreaming === true };
}
const consumer = require(path.join(REPO, CONSUMER));
const M = mutantCopies('idle-last-word', REPO);
// the copies: the release's parse (no answer branch, no kinds writer — a117cebb8 had neither); the cure without the late rule;
// without the stop; with a stop at every answer
const B_DOOR = 'if (!recordIsLate?.(session, msg) && sendEndsAtLocalReply(session, msg)) {';
const B_STOP = 'if (stopsAtLocalReply(session)) { try { noteTurnStopped?.(session); } catch { } }';
const releaseSrc = anchored(anchored(csSrc, B_DOOR, 'if (false) {', 'release: no answer branch'), 'try { noteRecordKind(session, msg); } catch { }', '', 'release: no kinds writer');
const releaseParse = M.load(CONSUMER, releaseSrc, 'release-parse');
const noLateParse = M.load(CONSUMER, anchored(csSrc, B_DOOR, 'if (sendEndsAtLocalReply(session, msg)) {' /* stale-pins: kept — the control's plant: the door without its late rule */, 'no late rule'), 'no-late');
const noStopParse = M.load(CONSUMER, anchored(csSrc, B_STOP, '', 'no stop'), 'no-stop');
const everyStopParse = M.load(CONSUMER, anchored(csSrc, B_STOP, 'try { noteTurnStopped?.(session); } catch { }', 'a stop at every answer'), 'every-stop');
const PROMPT = { send: 'Please fix the login page' }, COMPACT = { send: '/compact' }, COST = { send: '/cost' }, MODEL = { send: '/model opus' };
const T = TURN.length;
const ORDER_B = [...TURN, COMPACT, CAVEAT, REPLY];
const b = drive(consumer, ORDER_B);
ok(b.trace[T - 1][0] === 'system/session_state_changed:idle' && b.trace[T - 1][1] === false && b.stops.length >= 1, 'the premise (REAL parse): the recorded turn ends on its idle word with the flag down, and the idle is the conversation\'s stop', b.trace[T - 1]);
ok(b.trace[T][1] === true && b.trace[T + 1][1] === true && b.s._turnState === 'idle', '…the send raises it while the CLI\'s last word is idle; the caveat changes nothing');
ok(b.flag === false && b.trace[T + 2][0] === 'user/local-reply', 'THE CURE: the CLI\'s reply (its <local-command-stdout>, no state word) ends the send — the flag is down', b.trace.slice(T));
ok(attachOf(b.s).action === 'none', '…so an attach has nothing to correct', attachOf(b.s));
ok(b.stops.length === 2 && b.stops[1] === 'idle', '…and it is the conversation\'s STOP (the person\'s last send was itself a local command: no prompt waits behind it) — a pool move deferred while the flag stood is decided HERE', b.stops);
const rb = drive(releaseParse, ORDER_B);
ok(rb.flag === true && attachOf(rb.s).action === 'authoritative', 'RED (the release\'s parse, a copy): the flag stands after the reply ⇒ the first attach «reconciled (authoritative) → false»', rb.trace.slice(T));
const nb = drive(noStopParse, ORDER_B);
ok(nb.flag === false && nb.stops.length === 1, 'RED (the cure without its stop, a copy): the flag is down but no stop comes — the deferred move waits for the next real turn\'s idle', nb.stops);
const ORDER_TYPED = [...TURN, MODEL, ...TYPED_ANSWER];
const ty = drive(consumer, ORDER_TYPED), rty = drive(releaseParse, ORDER_TYPED);
ok(ty.trace[T + 2][1] === true && ty.flag === false && ty.trace[ty.trace.length - 1][0] === 'result/success:no_turn' && ty.stops.length === 2,
  'THE MEASURED ANSWER: a typed /model answered by an init, a <synthetic> record and a num_turns-0 result (no state word) — the flag is down at that result, and it is the stop', ty.trace.slice(T));
ok(rty.flag === true && attachOf(rty.s).action === 'authoritative', 'RED (the release\'s parse): the same answer leaves the flag up ⇒ the attach corrects it', rty.trace.slice(T));
// (1) A LATE ANSWER NEVER FIRES B — judged late as the branch above already judges (a dead bridge's heal draining an old backlog)
const LATE = { ...REPLY, uuid: 'late-reply-ba09' };
const lt = drive(consumer, [...TURN, COMPACT, LATE], { late: [LATE.uuid] });
ok(lt.flag === true && lt.stops.length === 1, '(1) a LATE reply (the late rule says so) ends nothing and stops nothing', lt.trace.slice(T));
const rlt = drive(noLateParse, [...TURN, COMPACT, LATE], { late: [LATE.uuid] });
ok(rlt.flag === false, 'RED (the cure without the late rule, a copy): the late reply drops the flag', rlt.trace.slice(T));
const db = drive(consumer, [...TURN, PROMPT, LATE, ...TURN2], { late: [LATE.uuid] });
ok(db.trace[T + 1][0] === 'user/local-reply' && db.trace.slice(T, T + 1 + TURN2.length).every((x) => x[1] === true) && db.flag === false,
  '(1) a dead bridge\'s heal draining an old reply after the person\'s new send: no blink at all — up from the send to the turn\'s idle', db.trace.slice(T).filter((x) => !x[1]).length);
// controls
const upTo = (r, from, to) => r.trace.slice(from, to).every((x) => x[1] === true);
const c1 = drive(consumer, [...TURN, PROMPT, ...TURN2]);
ok(upTo(c1, T, T + TURN2.length) && c1.flag === false && c1.trace[c1.trace.length - 1][0] === 'system/session_state_changed:idle',
  'control: a real new turn after a send holds the flag from the send through its running word, its steer, its sub-task, its results — down at its idle only', c1.trace.slice(T).filter((x) => !x[1]));
// (2) THE TWIN'S BLINK forces nothing: the answer of an EARLIER command lands after the person's prompt, before its running word
const tw = drive(consumer, [...TURN, COST, PROMPT, REPLY, ...TURN2]);
ok(tw.trace[T + 2][0] === 'user/local-reply' && tw.trace[T + 2][1] === false && tw.trace[T + 3][0] === 'system/session_state_changed:running' && upTo(tw, T + 3, T + 2 + TURN2.length) && tw.flag === false,
  'THE TWIN («/cost» then a prompt, the reply after both): the flag blinks down at the reply and ends UP at the running word, held to the idle', tw.trace.slice(T, T + 4));
ok(tw.stops.length === 2, '…and the blink forces NO stop (the last send was the prompt: a stop would force a pool re-decide as it goes out)', tw.stops);
const lk = drive(consumer, [...TURN, PROMPT, SETMODEL_ECHO, SETMODEL_ACK, ...TURN2]);
ok(lk.trace[T + 1][0] === 'user/local-reply' && lk.trace[T + 1][1] === false && upTo(lk, T + 3, T + 2 + TURN2.length) && lk.stops.length === 2,
  'THE LOCK\'S TWIN (the measured set_model answer landing after the person\'s prompt): a blink, up at the running word, no stop', { blink: lk.trace[T + 1], stops: lk.stops });
const etw = drive(everyStopParse, [...TURN, COST, PROMPT, REPLY, ...TURN2]), elk = drive(everyStopParse, [...TURN, PROMPT, SETMODEL_ECHO, SETMODEL_ACK, ...TURN2]);
ok(etw.stops.length === 3 && elk.stops.length === 3, 'RED (a stop at every answer, a copy): both twins force a pool stop as the prompt goes out', [etw.stops, elk.stops]);
const c2 = drive(consumer, [...TURN, PROMPT, ...TURN2.slice(0, 3), REPLY, TYPED_ANSWER[2], ...TURN2.slice(3)]);
ok(c2.trace[T + 4][0] === 'user/local-reply' && c2.trace[T + 5][0] === 'result/success:no_turn' && upTo(c2, T, T + 2 + TURN2.length) && c2.stops.length === 2,
  'control: a reply or a num_turns-0 result while the CLI says running leaves the flag up and stops nothing');
const c3 = drive(consumer, [...mid, { ...RUNNING, state: 'requires_action' }, REPLY]);
ok(c3.flag === true && c3.s._turnState === 'requires_action', 'control: a reply while a turn is parked on the person (requires_action) leaves the flag up');
const c4 = drive(consumer, [...TURN, COMPACT, { ...REPLY, parent_tool_use_id: 'toolu_mock_1' }, REPLY]);
ok(c4.trace[T + 1][1] === true && c4.flag === false, 'control: a sub-conversation\'s reply ends nothing; the main thread\'s reply then does', c4.trace.slice(T));
const c5 = drive(consumer, [...TURN.filter((r) => !isWord(r)), COMPACT, CAVEAT, REPLY]);
const r5 = drive(releaseParse, [...TURN.filter((r) => !isWord(r)), COMPACT, CAVEAT, REPLY]);
ok(c5.s._turnStateSeen !== true && c5.flag === r5.flag && JSON.stringify(c5.trace) === JSON.stringify(r5.trace), 'control: a CLI that never says a word keeps the derived road (no authority ⇒ the answer branch never fires: the same flag as the release)');
const c6 = drive(consumer, [...TURN, COMPACT, RUNNING, REPLY]);
ok(c6.flag === true && c6.stops.length === 1 && c6.s._lastSendLocal === false, 'control: a CLI that says running for the command — the state word answers the send (the stamp cleared), so its reply under running neither drops nor stops', { flag: c6.flag, stops: c6.stops });

// ═══ ③ C: the recorder ═══
console.log('— ③ C: the recorder');
const KIND_SHAPE = /^(?:sub:)?[a-z_]{1,40}(?:\/[a-z_-]{1,40})?(?::[a-z_]{1,20})?$/;
const USER_KINDS = new Set(['user/tool-result', 'user/local-reply', 'user/local-note', 'user/command', 'user/compact-summary', 'user/meta', 'user/prompt']);
const allRecs = [...CLI308, ...recsOf('scripts/fixtures/claude-cli/2.1.312-frames.jsonl'), ...UREC];
const kinds = allRecs.map((r) => TS.recordKind(r));
ok(kinds.every((k) => KIND_SHAPE.test(k)) && allRecs.every((r, i) => r.type !== 'user' || USER_KINDS.has(kinds[i].replace(/^sub:/, ''))),
  `every recorded record (${allRecs.length}) has a kind of the closed shape; a user record\'s kind is one of ${USER_KINDS.size} words`, kinds.filter((k) => !KIND_SHAPE.test(k)));
const planted = [
  { type: 'user', message: { content: '<local-command-stdout>planted words here</local-command-stdout>' } },
  { type: 'user', message: { content: [{ type: 'text', text: 'planted words here' }] } },
  { type: 'Planted Words', subtype: 'x' },
  { type: 'system', subtype: 'planted words', state: 'idle' },
  { type: 'system', subtype: 'session_state_changed', state: 'planted' },
  { type: 'result', subtype: 'planted words' },
];
const pk = planted.map((r) => TS.recordKind(r));
ok(pk.every((k) => KIND_SHAPE.test(k) && !/planted/i.test(k)), 'planted content never reaches a kind (text, a type or subtype outside the closed words, an unknown state)', pk);
ok(JSON.stringify(b.s._lastKinds) === JSON.stringify(['system/session_state_changed:idle', 'user/local-note', 'user/local-reply']), 'the parse keeps the last three kinds, in order (B\'s order: the idle word, the caveat, the reply)', b.s._lastKinds);
const line = TS.reconciledSay('sess-ba09', attachOf(rb.s), rb.s._turnState, b.s._lastKinds);
ok(/streaming reconciled \(authoritative\) → false · the last records: system\/session_state_changed:idle, user\/local-note, user\/local-reply$/.test(line) && !/Compacted|caveat|command below/i.test(line), 'the reconcile\'s journal line says what it corrected and names the three kinds — no word of any record', line);
const relLine = TS.reconciledSay('sess-ba09', attachOf(rb.s), rb.s._turnState, rb.s._lastKinds);
ok(rb.s._lastKinds === undefined && /the last records: none seen by this process$/.test(relLine), 'RED (the release\'s parse keeps no kinds): the same correction\'s line can name none', relLine);
ok(/\(sidecar-heal, the harness last said running\)/.test(TS.reconciledSay('s', { action: 'sidecar-heal', staleAuthority: true, isStreaming: false }, 'running', [])), 'a stale-authority correction still names the harness\'s last word');

// ═══ ④ the wiring ═══
console.log('— ④ the wiring');
const writes = csSrc.split('\n').map((l, i) => [i, l.trim()]).filter(([, l]) => /session\._isStreaming\s*=[^=]/.test(l) && !/^\/\//.test(l));
const shapes = writes.map(([, l]) => l);
ok(shapes.length === 4 && shapes.filter((l) => l.startsWith('if (!authoritative) session._isStreaming = ')).length === 2 && shapes.includes('session._isStreaming = eff.streaming;')
  && shapes.includes("session._isStreaming = false; noteTurnFlight(session, Date.now()); newLabel = '';"),
  'the parse writes the flag at FOUR places: two derived writes behind `!authoritative`, the state word, the no-turn answer', shapes);
ok(shapes.filter((l) => /_isStreaming = true/.test(l)).every((l) => l.startsWith('if (!authoritative)')), '…so under authority the ONE raising writer is the state word (no record of an ended turn can raise it)');
{ const rw = writes.find(([, l]) => l.startsWith("session._isStreaming = false; noteTurnFlight"));
  const lines = csSrc.split('\n'); const above = lines.slice(Math.max(0, rw[0] - 4), rw[0]).join('\n');
  const below = lines.slice(rw[0] + 1, rw[0] + 3).join('\n');
  ok(/if \(!recordIsLate\?\.\(session, msg\) && sendEndsAtLocalReply\(session, msg\)\) \{/.test(above) && /^\s*if \(stopsAtLocalReply\(session\)\) \{ try \{ noteTurnStopped\?\.\(session\); \} catch \{ \} \}\n\s*session\._lastSendLocal = false;/.test(below)
    && (csSrc.match(/noteTurnStopped\?\.\(session\)/g) || []).length === 2,
    '…and the answer branch lowers it only behind the late rule + sendEndsAtLocalReply (the observed idle word + a no-turn answer); its pool stop only behind stopsAtLocalReply (the idle word\'s own stop is the other)', below); }
ok(/session\._isStreaming = eff\.streaming;\n\s*session\._lastSendLocal = false;/.test(csSrc), 'the state word clears the send stamp (it answers every send before it)');
const brSrc = read('src/server/boot-restore.js');
const brObj = brSrc.slice(brSrc.lastIndexOf('sockName: sockFile,', brSrc.indexOf('...restoredStreaming(')), brSrc.indexOf('_goalTokensUsed: wrapperGoalTokens,'));
ok(/\.\.\.restoredStreaming\(savedBuffer, wrapperStreaming\),/.test(brObj) && !/_isStreaming:/.test(brObj), 'boot-restore: the restored flag rides the ring\'s spread (restoredStreaming), no `_isStreaming:` key beside it', brObj.length);
const cw = read('data/bin/chat-wrapper.js');
ok(/if \(!\/\^<local-command-\/\.test\(uText\.trim\(\)\)\) \{ meta\.streaming = true; scheduleMeta\(\); \}/.test(cw) && /if \(msg\.type === 'result' \|\| \(msg\.type === 'system' && msg\.subtype === 'compact_boundary'\)\) \{\s*meta\.streaming = false;/.test(cw),
  'the sidecar\'s rule ①\'s premise reads: true at a user record that is no local-command echo, false at a result or a compact boundary');
ok(/const wasInFlight = requestInFlight\([^\n]*\n\s*session\._isStreaming = true;\n\s*session\._lastSendLocal = localCommandText\(text\);/.test(read('src/server/user-input.js')), 'the send ②\'s send step models: user-input raises the flag and stamps whether the text is itself a local command, at every send');
ok(TS.localCommandText('/cost') && TS.localCommandText(' /model opus ') && TS.localCommandText('/compact') && !TS.localCommandText('Please fix the login page') && !TS.localCommandText('/ not a command') && !TS.localCommandText('a/b') && !TS.localCommandText(null),
  'the stamp\'s words: a slash and a command name lead the text, nothing else');
const ws = read('src/ws-handler.js');
ok(/console\.log\(reconciledSay\(data\.sessionId, rec, session\._turnState, session\._lastKinds\)\);/.test(ws) && (ws.match(/streaming reconciled/g) || []).length === 0 /* stale-pins: kept — the absence is the leg: the line's words live in reconciledSay alone */, 'the attach reconcile journals through reconciledSay with the parse\'s kinds — its one line');
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(?:m?js)$/.test(e.name) ? [path.join(d, e.name)] : []));
  const files = [...walk(path.join(REPO, 'src')), path.join(REPO, 'server.js')];
  const writers = files.filter((f) => /_lastKinds\s*=[^=]/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(REPO, f));
  const callers = files.map((f) => [path.relative(REPO, f), fs.readFileSync(f, 'utf8').split('\n').filter((l) => /\bnoteRecordKind\(session, msg\)/.test(l) && !/function noteRecordKind/.test(l)).length]).filter(([, n]) => n);
  ok(JSON.stringify(writers) === JSON.stringify(['src/turn-state.js']) && JSON.stringify(callers) === JSON.stringify([[CONSUMER, 1]]), 'the kinds have ONE writer (turn-state.js), called at one place (the parse, for every parsed record)', { writers, callers });
  const stamps = files.map((f) => [path.relative(REPO, f), (fs.readFileSync(f, 'utf8').match(/_lastSendLocal\s*=[^=]/g) || []).length]).filter(([, n]) => n).sort((x, y) => x[0].localeCompare(y[0]));
  ok(JSON.stringify(stamps) === JSON.stringify([[CONSUMER, 2], ['src/server/user-input.js', 1]]), 'the send stamp: ONE writer at the send (user-input), cleared only by the parse (the state word, the no-turn answer)', stamps);
}
ok(M.files.length > 0 && M.files.every((f) => !f.startsWith(REPO)), 'the patched copies live outside the tree');

report();
