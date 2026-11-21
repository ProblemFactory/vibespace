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
//     (B) A SEND THE CLI ANSWERS WITHOUT A TURN — src/server/user-input.js raises the flag at every send; a local command
//         (/cost, /model, /context…) is answered by a `<local-command-stdout>` record and NO state word ⇒ the flag stands.
// THE CURE at the one place every road goes through, the CLI's last word: (A) the restore takes the flag FROM the ring's word
// (src/turn-state.js restoredStreaming; the sidecar only for a CLI that never says one); (B) under authority a send-raised flag
// held while the last word is idle drops at the CLI's reply (sendEndsAtLocalReply: only on what was observed — no pool stop);
// (C) THE RECORDER: the reconcile's ONE journal line names the kinds of the last three records before it (never content).
//   ① A on recorded lines + its RED (the release's seed) + controls (a ring cut mid-turn, a parked turn, a ring with no word)
//   ② B through the REAL parse + its RED (the release's parse, a copy) + the controls: a real new turn after a send holds the
//      flag; THE TWIN — a late reply of an earlier command after a new prompt, before its running word: the flag blinks and
//      ends UP; a reply while running, a parked turn, a sub-conversation's reply, a CLI with no word: nothing
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
console.log('— the recorded lines');
ok(TURN.length > 2 && TURN2.length > 2 && TURN.some((r) => r.type === 'result') && TURN2.some((r) => r.type === 'result') && isWord(TURN2[0], 'running') && isWord(TURN2[TURN2.length - 1], 'idle'),
  '2.1.308: two recorded turns, each from its running word to its idle word, results inside (the derived end)', [TURN.length, TURN2.length]);
ok(TURN2.some((r) => TS.recordKind(r) === 'user/prompt') && TURN2.some((r) => r.subtype === 'task_started') && TURN2.some((r) => TS.recordKind(r) === 'user/tool-result'), '…the second carries a steer (a main-thread user record mid-turn), a sub-task and a tool result');
ok(!!(COMMAND && CAVEAT && REPLY && SUMMARY), 'the recorded user shapes of a /compact typed after a turn: the command echo, its caveat, its reply, the summary');

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
      if (st === 'send') { s._isStreaming = true; trace.push(['send', true]); continue; } // src/server/user-input.js's write at every send (④)
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
// the release's parse: no reply branch, no kinds writer (a117cebb8 had neither)
const releaseSrc = anchored(anchored(csSrc, '} else if (sendEndsAtLocalReply(session, msg)) {', '} else if (false) {', 'release: no reply branch'),
  'try { noteRecordKind(session, msg); } catch { }', '', 'release: no kinds writer');
const releaseParse = M.load(CONSUMER, releaseSrc, 'release-parse');
const ORDER_B = [...TURN, 'send', CAVEAT, REPLY];
const T = TURN.length;
const b = drive(consumer, ORDER_B);
ok(b.trace[T - 1][0] === 'system/session_state_changed:idle' && b.trace[T - 1][1] === false && b.stops.length >= 1, 'the premise (REAL parse): the recorded turn ends on its idle word with the flag down, and the idle is the conversation\'s stop', b.trace[T - 1]);
ok(b.trace[T][1] === true && b.trace[T + 1][1] === true && b.s._turnState === 'idle', '…the send raises it while the CLI\'s last word is idle; the caveat changes nothing');
ok(b.flag === false && b.trace[T + 2][0] === 'user/local-reply', 'THE CURE: the CLI\'s reply (its <local-command-stdout>, no state word) ends the send — the flag is down', b.trace.slice(T));
ok(attachOf(b.s).action === 'none', '…so an attach has nothing to correct', attachOf(b.s));
ok(b.stops.length === 1, '…and it makes NO pool stop of its own (the idle word before the send was the stop)', b.stops);
const rb = drive(releaseParse, ORDER_B);
ok(rb.flag === true && attachOf(rb.s).action === 'authoritative', 'RED (the release\'s parse, a copy): the flag stands after the reply ⇒ the first attach «reconciled (authoritative) → false»', rb.trace.slice(T));
// controls
const upTo = (r, from, to) => r.trace.slice(from, to).every((x) => x[1] === true);
const c1 = drive(consumer, [...TURN, 'send', ...TURN2]);
ok(upTo(c1, T, T + TURN2.length) && c1.flag === false && c1.trace[c1.trace.length - 1][0] === 'system/session_state_changed:idle',
  'control: a real new turn after a send holds the flag from the send through its running word, its steer, its sub-task, its results — down at its idle only', c1.trace.slice(T).filter((x) => !x[1]));
const LATE = { ...REPLY, uuid: 'late-reply-ba09' };
const tw = drive(consumer, [...TURN, 'send', LATE, ...TURN2], { late: [LATE.uuid] });
ok(tw.trace[T][1] === true && tw.trace[T + 1][0] === 'user/local-reply' && tw.trace[T + 1][1] === false, 'THE TWIN: a late reply of an earlier command after a new prompt, before its running word — the flag blinks down…', tw.trace.slice(T, T + 3));
ok(tw.trace[T + 2][0] === 'system/session_state_changed:running' && upTo(tw, T + 2, T + 1 + TURN2.length) && tw.flag === false, '…and ends UP at the running word, held through the turn to its idle', tw.trace.slice(T + 1).filter((x) => !x[1]).length);
ok(tw.stops.length === 2, '…the blink makes no pool stop (a stop there would force a pool re-decide as the prompt goes out)', tw.stops);
const c2 = drive(consumer, [...TURN, 'send', ...TURN2.slice(0, 3), REPLY, ...TURN2.slice(3)]);
ok(c2.trace[T + 4][0] === 'user/local-reply' && c2.trace[T + 4][1] === true && upTo(c2, T, T + 1 + TURN2.length), 'control: a reply while the CLI says running leaves the flag up');
const c3 = drive(consumer, [...mid, { ...RUNNING, state: 'requires_action' }, REPLY]);
ok(c3.flag === true && c3.s._turnState === 'requires_action', 'control: a reply while a turn is parked on the person (requires_action) leaves the flag up');
const c4 = drive(consumer, [...TURN, 'send', { ...REPLY, parent_tool_use_id: 'toolu_mock_1' }, REPLY]);
ok(c4.trace[T + 1][1] === true && c4.flag === false, 'control: a sub-conversation\'s reply ends nothing; the main thread\'s reply then does', c4.trace.slice(T));
const c5 = drive(consumer, [...TURN.filter((r) => !isWord(r)), 'send', CAVEAT, REPLY]);
const r5 = drive(releaseParse, [...TURN.filter((r) => !isWord(r)), 'send', CAVEAT, REPLY]);
ok(c5.s._turnStateSeen !== true && c5.flag === r5.flag && JSON.stringify(c5.trace) === JSON.stringify(r5.trace), 'control: a CLI that never says a word keeps the derived road (no authority ⇒ the reply branch never fires: the same flag as the release)');

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
  'the parse writes the flag at FOUR places: two derived writes behind `!authoritative`, the state word, the reply branch', shapes);
ok(shapes.filter((l) => /_isStreaming = true/.test(l)).every((l) => l.startsWith('if (!authoritative)')), '…so under authority the ONE raising writer is the state word (no record of an ended turn can raise it)');
{ const rw = writes.find(([, l]) => l.startsWith("session._isStreaming = false; noteTurnFlight"));
  const lines = csSrc.split('\n'); const above = lines.slice(Math.max(0, rw[0] - 4), rw[0]).join('\n');
  ok(/\} else if \(sendEndsAtLocalReply\(session, msg\)\) \{/.test(above) && !/noteTurnStopped\?\.\(/.test(lines.slice(rw[0] - 4, rw[0] + 2).join('\n')), '…and the reply branch lowers it only behind sendEndsAtLocalReply (the observed idle word + the reply), with no pool stop'); }
const brSrc = read('src/server/boot-restore.js');
const brObj = brSrc.slice(brSrc.lastIndexOf('sockName: sockFile,', brSrc.indexOf('...restoredStreaming(')), brSrc.indexOf('_goalTokensUsed: wrapperGoalTokens,'));
ok(/\.\.\.restoredStreaming\(savedBuffer, wrapperStreaming\),/.test(brObj) && !/_isStreaming:/.test(brObj), 'boot-restore: the restored flag rides the ring\'s spread (restoredStreaming), no `_isStreaming:` key beside it', brObj.length);
const cw = read('data/bin/chat-wrapper.js');
ok(/if \(!\/\^<local-command-\/\.test\(uText\.trim\(\)\)\) \{ meta\.streaming = true; scheduleMeta\(\); \}/.test(cw) && /if \(msg\.type === 'result' \|\| \(msg\.type === 'system' && msg\.subtype === 'compact_boundary'\)\) \{\s*meta\.streaming = false;/.test(cw),
  'the sidecar\'s rule ①\'s premise reads: true at a user record that is no local-command echo, false at a result or a compact boundary');
ok(/const wasInFlight = requestInFlight\([^\n]*\n\s*session\._isStreaming = true;/.test(read('src/server/user-input.js')), 'the send ②\'s \'send\' step models: user-input raises the flag at every send');
const ws = read('src/ws-handler.js');
ok(/console\.log\(reconciledSay\(data\.sessionId, rec, session\._turnState, session\._lastKinds\)\);/.test(ws) && (ws.match(/streaming reconciled/g) || []).length === 0 /* stale-pins: kept — the absence is the leg: the line's words live in reconciledSay alone */, 'the attach reconcile journals through reconciledSay with the parse\'s kinds — its one line');
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(?:m?js)$/.test(e.name) ? [path.join(d, e.name)] : []));
  const files = [...walk(path.join(REPO, 'src')), path.join(REPO, 'server.js')];
  const writers = files.filter((f) => /_lastKinds\s*=[^=]/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(REPO, f));
  const callers = files.map((f) => [path.relative(REPO, f), fs.readFileSync(f, 'utf8').split('\n').filter((l) => /\bnoteRecordKind\(session, msg\)/.test(l) && !/function noteRecordKind/.test(l)).length]).filter(([, n]) => n);
  ok(JSON.stringify(writers) === JSON.stringify(['src/turn-state.js']) && JSON.stringify(callers) === JSON.stringify([[CONSUMER, 1]]), 'the kinds have ONE writer (turn-state.js), called at one place (the parse, for every parsed record)', { writers, callers });
}
ok(M.files.length > 0 && M.files.every((f) => !f.startsWith(REPO)), 'the patched copies live outside the tree');

report();
