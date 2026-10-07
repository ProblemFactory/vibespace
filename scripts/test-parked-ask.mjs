#!/usr/bin/env node
// A TURN PARKED ON A PERMISSION ASK IS NOT A DELIVERY STALL (lane parked-ask-stall,
// 2.369.229 — a fleet pod's D-docusign, inc-muxrol54-uv2d). MEASURED: a claude
// turn parked on a `can_use_tool` ask (a Bash call bypassPermissions did not
// cover) for 22 h; the wrapper's .buf ended session_state_changed
// (requires_action) → control_request can_use_tool → 3× commands_changed →
// control_response 85 B (the CLI's success answer to OUR post-restart
// apply_flag_settings push `vs-csi-NN` — ANOTHER id, not an answer) → 4×
// commands_changed. After the server restart the client logged "[chat] delivery
// stall … forcing re-attach" every 5 min — 74 times. Legs, each run against a
// tree root so the patched copies can prove the legs see the defect:
//   ① PURE: the stall verdict table (reattach | hold | give-up-once | none)
//   ② the ring: a restored session's turn state is the ring's last record
//   ③ the attach rebuild of the parked ask from the measured .buf shape
//   ④ the client: the REAL ChatView watchdog tick over 8 hours of 15 s ticks,
//      and the typing line's words for a parked turn
//   ⑤ 3 patched-copy controls: watchdog ignoring the turn state ⇒ RED;
//      unbounded re-attach ⇒ RED; attach dropping the parked ask ⇒ RED
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };

// ── the measured shape (buffer-only: the assistant tool_use rides the ring as it did on the pod) ──
const TU = 'toolu_01PARKEDxDocusignBash', RID = 'b3f1e2a4-6c5d-4e7f-8a9b-0c1d2e3f4a5b', HID = '7d3c1a52-91b4-4f0e-a2c8-5b0e6d4f9a13';
const CMD = 'bash -c "rm -rf ./ds-out && ./sign.sh"';
function ring({ answer = 'other' } = {}) {
  const cc = (i) => ({ type: 'system', subtype: 'commands_changed', uuid: `cc-${i}`, session_id: HID, commands: [] });
  const resp = answer === 'same'
    ? { type: 'control_response', response: { subtype: 'success', request_id: RID, response: { behavior: 'allow', updatedInput: {} } } }
    : { type: 'control_response', response: { subtype: 'success', request_id: 'vs-csi-12' } };
  return [
    { type: 'user', uuid: 'u-1', session_id: HID, message: { role: 'user', content: 'sign the envelope' } },
    { type: 'system', subtype: 'session_state_changed', state: 'running', uuid: 'ssc-0', session_id: HID },
    { type: 'assistant', uuid: 'a-1', session_id: HID, message: { id: 'msg_park1', role: 'assistant', model: 'claude-x', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: TU, name: 'Bash', input: { command: CMD } }] } },
    { type: 'system', subtype: 'session_state_changed', state: 'requires_action', uuid: 'ssc-1', session_id: HID },
    { type: 'control_request', request_id: RID, request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: CMD }, permission_suggestions: [], tool_use_id: TU } },
    cc(1), cc(2), cc(3), resp, cc(4), cc(5), cc(6), cc(7),
  ].map((r) => JSON.stringify(r)).join('\n') + '\n';
}

// ── the legs, against a tree root ──
function pureFacts(root) {
  const TS = require(path.join(root, 'src/turn-state.js'));
  const V = (o) => TS.stallVerdict({ streaming: true, inboundAgoMs: 400000, sinceReattachMs: 400000, ...o });
  return {
    TS,
    table: [
      ['not streaming', TS.stallVerdict({ streaming: false, inboundAgoMs: 9e6 }), 'none'],
      ['silent 60 s', V({ inboundAgoMs: 60000 }), 'none'],
      ['silent, cooling down', V({ sinceReattachMs: 60000 }), 'none'],
      ['silent 400 s, nothing open', V({}), 'reattach'],
      ['requires_action', V({ turnState: 'requires_action' }), 'hold'],
      ['an open ask (turn state unknown — a restored session)', V({ pendingAsks: [{ kind: 'main' }] }), 'hold'],
      ['an open ask count', V({ pendingAsks: 1 }), 'hold'],
      ['running + 2 forced', V({ turnState: 'running', forcedCount: 2 }), 'reattach'],
      ['3 forced, not yet said', V({ forcedCount: 3 }), 'give-up-once'],
      ['3 forced, already said', V({ forcedCount: 3, gaveUp: true }), 'hold'],
      ['re-armed (a record: forcedCount 0)', V({ forcedCount: 0, gaveUp: false }), 'reattach'],
    ],
  };
}

async function attachFacts(root, buf) {
  const TS = require(path.join(root, 'src/turn-state.js'));
  const TF = require(path.join(root, 'src/server/turn-facts.js'));
  const { SessionMessages } = require(path.join(root, 'src/session-store.js'));
  const { rebuildHistory } = require(path.join(root, 'src/normalizers.js'));
  // the restored session exactly as boot-restore builds it: sidecar streaming:true + the ring's turn state
  const restored = { mode: 'chat', _isStreaming: true, ...TS.restoredTurnState(buf) };
  const rec = TS.reconcileAttachStreaming({ turnStateSeen: restored._turnStateSeen === true, turnState: restored._turnState || null, isStreaming: true, sidecar: { streaming: true, ageMs: 9e6 } });
  const session = { backend: 'claude', cwd: path.join(REPO, '.no-such-cwd'), buffer: buf, mode: 'chat' };
  const sm = new SessionMessages(session, 'sess-53', {});
  const perms = sm.activePendingPermissions();
  await rebuildHistory(session, 'sess-53', sm.raw());
  const card = session._normalizer.messages.find((m) => m.toolCallId === TU);
  return {
    ringState: TS.turnStateInRing(buf),
    attachTurnState: restored._turnStateSeen ? (restored._turnState || null) : null,
    attachStreaming: rec.isStreaming,
    turnFact: TF.turnOf(restored),
    pendingPerms: Object.keys(perms),
    cardResolved: card?.permission ? card.permission.resolved : 'no-permission',
    pendingAsks: session._normalizer.pendingAsks(),
  };
}

async function clientFacts(root) {
  if (!globalThis.document) {
    const mk = () => ({ className: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild(c) { return c; }, addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
    globalThis.document = { createElement: mk, getElementById: () => null, body: mk(), documentElement: mk(), addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  }
  if (!globalThis.window) globalThis.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), location: { protocol: 'http:', host: 'localhost', search: '', hash: '' }, navigator: { userAgent: 'node' }, localStorage: { getItem: () => null, setItem() {} } };
  const { ChatView } = await import(pathToFileURL(path.join(root, 'src/lib/chat-view.js')).href);
  const realNow = Date.now;
  let clock = Date.parse('2026-10-06T23:34:00Z');
  Date.now = () => clock;
  const warn = console.warn; console.warn = () => {};
  try {
    const run = (over) => {
      const notes = [];
      let reattaches = 0;
      const v = Object.assign(Object.create(ChatView.prototype), {
        sessionId: 'sess-53', _readOnly: false, _typingSince: clock, _lastInboundAt: clock, _pendingAsks: [], _turnState: null,
        _renderers: { appendSystem: (txt) => { notes.push(txt); return { classList: { add() {} } }; } },
        // the re-attach's own `attached` answer is INBOUND (it resets the silence) but not a record
        _reattach() { reattaches++; v._lastInboundAt = clock; },
      }, over);
      const t0 = clock;
      for (let i = 0; i < (8 * 3600) / 15; i++) { clock += 15000; v._stallTick('sess-53'); }
      clock = t0;
      return { reattaches, notes };
    };
    const parked = run({ _turnState: 'requires_action', _pendingAsks: [{ kind: 'main', requestId: RID }] });
    const parkedRestoredBase = run({ _pendingAsks: [{ kind: 'main', requestId: RID }] }); // turn state unknown, the rebuilt ask alone
    const silent = run({ _turnState: 'running' });
    // the typing line of a parked turn
    const shown = [];
    const tv = Object.assign(Object.create(ChatView.prototype), {
      _typingSince: null, _pendingAsks: [], _turnState: null,
      _chatInput: { showTyping(l) { shown.push(l); } }, _statusBar: { setPendingAsks() {} },
    });
    tv._showTyping('thinking...');
    tv._noteTurnState('requires_action');
    tv._noteTurnState('running');
    tv._setPendingAsks([{ kind: 'main', requestId: RID }]);
    tv._setPendingAsks([]);
    return { parked, parkedRestoredBase, silent, shown };
  } finally { Date.now = realNow; console.warn = warn; }
}

// ── ①–④ on the tree ──
console.log('— ① PURE: the stall verdict');
const P = pureFacts(REPO);
for (const [n, got, want] of P.table) ok(`${n} ⇒ ${want}`, got === want, got);
ok('the bound is 3 forced re-attaches, at most one per 5 min, after 120 s of true silence', P.TS.STALL_MAX_REATTACH === 3 && P.TS.STALL_COOLDOWN_MS === 300000 && P.TS.STALL_SILENCE_MS === 120000);
ok('waitingOnUser: requires_action, or any open ask; running/idle/null with none is not', P.TS.waitingOnUser({ turnState: 'requires_action' }) && P.TS.waitingOnUser({ pendingAsks: [{}] }) && !P.TS.waitingOnUser({ turnState: 'running' }) && !P.TS.waitingOnUser({}));

console.log('— ② the ring: a restored session\'s turn state');
{
  const TS = P.TS;
  ok('the measured ring ⇒ requires_action (the later control_response of ANOTHER id and 7 commands_changed move nothing)', TS.turnStateInRing(ring()) === 'requires_action');
  ok('parsed records work the same', TS.turnStateInRing(ring().trim().split('\n').map((l) => JSON.parse(l))) === 'requires_action');
  ok('a ring with no turn-state record ⇒ null (an old CLI keeps the derived path)', TS.turnStateInRing('{"type":"assistant"}\n') === null && JSON.stringify(TS.restoredTurnState('')) === '{}');
  ok('an unknown state is never coerced (skipped, the earlier one stands)', TS.turnStateInRing('{"type":"system","subtype":"session_state_changed","state":"idle"}\n{"type":"system","subtype":"session_state_changed","state":"paused"}\n') === 'idle');
  ok('a torn last line is skipped', TS.turnStateInRing(ring() + '{"type":"system","subtype":"session_state_ch') === 'requires_action');
  const brSrc = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
  ok('boot-restore spreads the ring\'s turn state onto the restored session beside the sidecar flag', /_isStreaming: wrapperStreaming,[\s\S]{0,600}\.\.\.restoredTurnState\(savedBuffer\),/.test(brSrc));
}

console.log('— ③ the attach rebuild of a parked ask (the measured .buf shape)');
const A = await attachFacts(REPO, ring());
ok('the attach says requires_action (not a bare streaming:true)', A.attachTurnState === 'requires_action' && A.attachStreaming === true, A);
ok('the session list\'s turn fact is \'waiting\' (the sidebar / For-you dot), not \'running\'', A.turnFact === 'waiting', A.turnFact);
ok('the attach payload\'s pendingPermissions still holds the ask (the other-id control_response answers nothing)', A.pendingPerms.length === 1 && A.pendingPerms[0] === TU, A.pendingPerms);
ok('the rebuilt card is an OPEN permission card', A.cardResolved === null, A.cardResolved);
ok('…and the waiting chip\'s list names it', A.pendingAsks.length === 1 && A.pendingAsks[0].requestId === RID && A.pendingAsks[0].kind === 'main', A.pendingAsks);
{
  const B = await attachFacts(REPO, ring({ answer: 'same' }));
  ok('control: an answer of the SAME id settles it (no card, no ask) — the leg can tell them apart', B.pendingPerms.length === 0 && B.cardResolved === 'allowed' && B.pendingAsks.length === 0, B);
}

console.log('— ④ the client: the REAL watchdog tick, 8 hours of 15 s ticks');
const C = await clientFacts(REPO);
ok('a turn parked on an ask (requires_action) is never re-attached and nothing is said', C.parked.reattaches === 0 && C.parked.notes.length === 0, C.parked);
ok('…nor when only the rebuilt ask says so (a restored session that never heard a turn state)', C.parkedRestoredBase.reattaches === 0, C.parkedRestoredBase);
ok('a truly silent running turn: exactly 3 forced re-attaches in 8 hours (was 96)', C.silent.reattaches === 3, C.silent.reattaches);
ok('…then ONE dim note, said once', C.silent.notes.length === 1 && /^no output for \d+ min — the agent may be waiting on something not shown; Stop or check the session$/.test(C.silent.notes[0]), C.silent.notes);
ok('the typing line of a parked turn reads the chip\'s words, and gives its label back when the state moves on',
  JSON.stringify(C.shown) === JSON.stringify(['thinking...', 'waiting for you', 'thinking...', 'waiting for you', 'thinking...']), C.shown);

// ── ⑤ patched-copy controls ──
console.log('— ⑤ patched copies: each defect turns its leg RED');
{
  const base = scratchDir('parked-ask');
  try {
    const copy = (name, file, from, to) => {
      const root = path.join(base, name);
      fs.cpSync(path.join(REPO, 'src'), path.join(root, 'src'), { recursive: true });
      fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'));
      const fp = path.join(root, file);
      const src = fs.readFileSync(fp, 'utf8');
      if (!src.includes(from)) throw new Error(`mutant ${name}: anchor not found in ${file}`);
      fs.writeFileSync(fp, src.replace(from, to));
      return root;
    };
    const m1 = copy('ignores-turn-state', 'src/lib/chat-view.js',
      "streaming: true, turnState: this._turnState || null, pendingAsks: this._pendingAsks || [],", 'streaming: true, turnState: null, pendingAsks: [],');
    const c1 = await clientFacts(m1);
    ok('watchdog ignoring the turn state ⇒ the parked leg goes RED (it re-attaches a parked turn)', c1.parked.reattaches > 0, c1.parked.reattaches);
    const m2 = copy('unbounded', 'src/turn-state.js',
      "if ((Number(forcedCount) || 0) >= STALL_MAX_REATTACH) return gaveUp ? 'hold' : 'give-up-once';", '');
    const c2 = await clientFacts(m2);
    ok(`unbounded watchdog ⇒ the bound leg goes RED (${c2.silent.reattaches} re-attaches in 8 h, no note)`, c2.silent.reattaches > 3 && c2.silent.notes.length === 0, c2.silent);
    const m3 = copy('drops-parked-ask', 'src/session-store.js',
      'if (cr.request_id && answered.has(cr.request_id)) continue;', 'if (cr.request_id && answered.size) continue;');
    const a3 = await attachFacts(m3, ring());
    ok('attach dropping the parked ask (any control_response read as its answer) ⇒ the rebuild leg goes RED', a3.pendingPerms.length === 0, a3.pendingPerms);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
