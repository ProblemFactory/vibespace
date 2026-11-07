#!/usr/bin/env node
// THE CHAT'S ORDER IN A REAL BROWSER (lane midturn-order — the owner, 2026-11-07: «你能不能确保chatview里的顺序就是事件的
// 实际顺序。你这interrupt在下正常人都会以为先读到了上面那句然后才interrupt？»). HEAVY: a scratch hub (this tree copied, its
// bundle built), a claude chat session on the stand-in CLI (scripts/fixtures/claude-stand-in-cli.cjs — the measured turn
// shape), headless Chrome under the runner's DejaVu fontconfig, trusted input. The fast half (the rules, the normalizer, the
// ops) is scripts/test-midturn-order.mjs.
//   ① THE OWNER'S SEQUENCE: a turn runs a tool · a message typed + Enter mid-tool (handed) · Stop · Stop again ⇒ the
//      window draws, top to bottom, the tool, «[Request interrupted by user for tool use]» + «Interrupted», «[Request
//      interrupted by user]» + «Interrupted», THEN the message — its chip «Unread when stopped — goes with your next
//      message» (CONTROL: the base tree draws the message above both interrupt rows, «Stays with the stopped turn»)
//   ② a reload (the hub's own slab) and ③ a hub restart (the rebuild from the wrapper's buffer) draw the same order
//   ④ zh: the same chip in Chinese — «停止时未读 · 随你的下一条消息送达»
//   ⑤ the person's next message is drawn right BELOW the kept one, the answer below both
//   ⑥ CONTROL, unchanged: a message handed mid-tool and READ at the tool result is drawn where it entered — below the tool
//      card, above the answer — «Steered»
// ROUND 2 (the r1 acceptance of 92943cdb1):
//   §0 IN-PROCESS, no browser — the tree's real normalizer over a 2 000+-record conversation feeding ChatView.prototype's own
//      create / move handlers on fake windows: F4 a move never moves the reader (a pinned tail, a scrolled-up window, a
//      window whose bottom cut through the unread block, a teleported slab — the three shapes, 0 re-reads, every window =
//      the server's slice), F3 the minimap's markers follow their cards (live = the reload's turnMap), m9 a card that
//      draws nothing is still counted
//   ⑦ M1 in the browser: a message that rode a tool result the CLI still held (the stand-in's STAND_IN_RIDE_MISS), Stop,
//      then the next message ⇒ the kept message stays below BOTH interrupt rows, the next message right below it
//   ⑧ r2 a phone, 360 px: the chip never squeezes the person's words — bubble mode (the chip wraps under the bubble) and
//      compact mode, en and ja, a shot each
// ROUND 3 (the r2 acceptance of 6c7d4d7ca):
//   §0 uses the RENDERER'S OWN null rule (ChatRenderers.drawsNothing — an unknown-record notice draws nothing) and every
//      shape carries such a notice right after the tool result (m11: a steered rider whose place is a card that draws
//      nothing is moved in place, never a re-read); a TELEPORTED slab that holds the unread message keeps it (m14)
//   §0b THE REAL WRAPPER over the stand-in, no browser: m15 a message READ at its tool result, a second one handed after,
//      Stop ⇒ the wrapper says `landed` for the one the follow-up's init does not name — «Steered» where it rode, the other
//      «Unread when stopped» below the stop; m12 two sends inside the Stop window + a second Stop ⇒ live = the restart
//   ⑦ (m17) also reads the MOVE OPS the window received: none lifts the kept rider (on the r1 tip the server emitted one —
//      its client's re-read then hid the climb in the DOM; the op is the wire's own record)
// Shots: $VS_MIDTURN_SHOTS (a dir) — the window after ①, ④, ⑤, ⑦ and the four phone faces.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, scratchDir, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, runnerFontEnv, realClicker, stopWrapper } from './scratch.mjs';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAND_IN = path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs');
let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1400) : '')); } return !!c; };
const skip = (name, why) => { skipped++; console.log(`  ○ SKIP ${name} — ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 100) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { } await sleep(step); } try { return !!(await fn()); } catch { return false; } };
const S = JSON.stringify;
const SHOTS = process.env.VS_MIDTURN_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
// THIS SUITE'S TEARDOWN RUNS FIRST AT EXIT (registered before any scratch dir is minted — scratch.mjs removes those at exit
// too, in registration order: a browser still alive then wrote its profile back)
const atExit = [];
process.on('exit', () => { for (const f of atExit.splice(0)) { try { f(); } catch { } } });
for (const [sig, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]]) process.on(sig, () => { for (const f of atExit.splice(0)) { try { f(); } catch { } } process.exit(code); });

// ── §0 IN-PROCESS: THE CLIENT'S OWN HANDLERS OVER A LONG CONVERSATION (r2 F4 / F3 / m9) ──
{
  console.log('§0 in-process: ChatView.prototype create / move over a 2 000+-record conversation, four window shapes');
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  const { ChatView } = await import(path.join(REPO, 'src/lib/chat-view.js'));
  const { ChatMinimap } = await import(path.join(REPO, 'src/lib/chat-minimap.js'));
  const { ChatRenderers } = await import(path.join(REPO, 'src/lib/chat-renderers.js'));
  // a fake list: ordered children, insertBefore / appendChild / remove / after — what the handlers use
  const fakeList = () => ({ children: [], classList: { add() { }, remove() { } },
    appendChild(el) { this._out(el); this.children.push(el); el.parentNode = this; return el; },
    insertBefore(el, ref) { this._out(el); const i = this.children.indexOf(ref); if (i < 0) this.children.push(el); else this.children.splice(i, 0, el); el.parentNode = this; return el; },
    _out(el) { const i = this.children.indexOf(el); if (i >= 0) this.children.splice(i, 1); } });
  const fakeEl = (m) => ({ dataset: { msgId: m.id }, parentNode: null, remove() { if (this.parentNode) this.parentNode._out(this); this.parentNode = null; }, after(x) { const l = this.parentNode; const i = l.children.indexOf(this); l._out(x); l.children.splice(i + 1, 0, x); x.parentNode = l; } });
  // r3 m11: THE RENDERER'S OWN null rule (renderSystemMsg returns null for exactly these) — never a rule of the suite's own
  const drawsNothing = (m) => (typeof ChatRenderers.drawsNothing === 'function' ? ChatRenderers.drawsNothing(m) : ((m.noticeKind === 'unknown-record' && m.content?.[0]?.type === 'unknown_record') || (m.noticeKind === 'unknown-fields' && m.content?.[0]?.type === 'unknown_fields')));
  const R0 = {
    queue: () => ({ type: 'queue_changed', items: [], verbs: ['remove', 'steer', 'steer-all', 'reorder', 'edit'] }),
    running: () => ({ type: 'system', subtype: 'session_state_changed', state: 'running' }),
    idle: () => ({ type: 'system', subtype: 'session_state_changed', state: 'idle' }),
    init: () => ({ type: 'system', subtype: 'init', session_id: 's', model: 'claude-sonnet-4-5', tools: [], cwd: '/tmp' }),
    toolUse: (id) => ({ type: 'assistant', message: { id: 'msg_' + id, role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'ls' } }] } }),
    toolResult: (id, rej) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: !!rej, content: rej ? "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed." : 'ok' }] } }),
    marker: (t) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: t ? '[Request interrupted by user for tool use]' : '[Request interrupted by user]' }] } }),
    result: (err) => ({ type: 'result', subtype: err ? 'error_during_execution' : 'success', is_error: !!err, session_id: 's' }),
    said: (t) => ({ type: 'assistant', message: { id: 'msg_' + t.replace(/\W+/g, '_'), role: 'assistant', content: [{ type: 'text', text: t }] } }),
    send: (t, id) => ({ type: 'user', message: { role: 'user', content: t }, msgId: id, timestamp: '2026-11-07T21:00:00.000Z', _fromWebui: true }),
    hand: (st, ids) => ({ type: 'input_handover', state: st, msg_ids: ids }),
    dropped: (kept) => ({ type: 'queue_dropped', dropId: 'd1', by: 'stop', turnId: null, items: [], kept: kept.length, keptIds: kept }),
    unknown: () => ({ type: 'system', subtype: 'a_kind_this_build_does_not_know', session_id: 's' }),   // ⇒ an unknown-record notice: draws nothing
  };
  // 1 000 tool rounds before the shape (2 000+ records), then the shape, live
  const history = [R0.queue(), R0.send('A first', 'm-a'), R0.running(), R0.init()];
  for (let i = 0; i < 1000; i++) history.push(R0.toolUse('toolu_h' + i), R0.toolResult('toolu_h' + i));
  const SHAPES = {
    // TWO unread messages each (B, C): the cut window ends INSIDE the unread block (it holds B, not C)
    'rider, then Stop': [R0.send('B rides', 'm-b'), R0.hand('handed', ['m-b']), R0.send('C rides too', 'm-c'), R0.hand('handed', ['m-c']), R0.toolUse('toolu_r'), R0.toolResult('toolu_r'), R0.unknown(), R0.dropped(['m-b', 'm-c']), R0.marker(false), R0.result(true), R0.hand('landed', ['m-b', 'm-c']), R0.idle(), R0.send('N next', 'm-n'), R0.running(), R0.init(), R0.said('reply N'), R0.result(false)],
    'Stop → kept': [R0.send('B kept', 'm-b'), R0.hand('handed', ['m-b']), R0.send('C kept too', 'm-c'), R0.hand('handed', ['m-c']), R0.dropped(['m-b', 'm-c']), R0.toolResult('toolu_h999', true), R0.unknown(), R0.marker(true), R0.result(true), R0.init(), R0.marker(false), R0.result(true), R0.idle(), R0.send('N next', 'm-n'), R0.running(), R0.init(), R0.said('reply N'), R0.result(false)],
    'steered rider before a notice that draws nothing': [R0.send('B rides', 'm-b'), R0.hand('handed', ['m-b']), R0.send('C rides too', 'm-c'), R0.hand('handed', ['m-c']), R0.toolUse('toolu_n'), R0.toolResult('toolu_n'), R0.unknown(), R0.said('answer'), R0.hand('landed', ['m-b', 'm-c']), R0.result(false), R0.idle()],
    'typed before the tool call': [R0.send('B early', 'm-b'), R0.hand('handed', ['m-b']), R0.send('C early too', 'm-c'), R0.hand('handed', ['m-c']), R0.said('let me look'), R0.toolUse('toolu_x'), R0.toolResult('toolu_x'), R0.unknown(), R0.hand('landed', ['m-b', 'm-c']), R0.said('answer'), R0.result(false), R0.idle()],
  };
  const userTurnIdx = (turnMap) => turnMap.filter((t) => t.role === 'user').map((t) => t.startIdx);
  for (const [name, shape] of Object.entries(SHAPES)) {
    const mm = createMessageManager('claude', 'mto0');
    for (const r of history) mm.processLive(r);
    // the views are built at two instants: before the shape (pinned / scrolled-up / teleported) and when the first message is afloat (cut)
    const total0 = mm.messages.length;
    const mkView = ({ start, end, pinned = false, teleported = false, ids = null }) => {
      const list = fakeList();
      const v = Object.assign(Object.create(ChatView.prototype), {
        _messageList: list, _elements: new Map(), _renderedMsgIds: new Set(), _messages: [], _windowStart: start, _windowEnd: end, _total: mm.messages.length,
        _pinned: pinned, _teleported: teleported, _loadingHistory: false, _readOnly: false, _newMsgCount: 0, _gapMinimapActive: false, _statusBar: null, _channelTouches: null, app: {},
        _scrollBtn: { innerHTML: '', classList: { remove() { } } }, rereads: 0, scrolls: 0,
        _renderers: { renderUserMsg: fakeEl, renderAssistantMsg: fakeEl, renderToolMsg: fakeEl, renderSystemMsg: (m) => ({ el: drawsNothing(m) ? null : fakeEl(m) }), addWrapToggles() { }, addOpenInEditorBtn() { } },
        _applyInitHealth() { }, _syncReviewAvailability() { }, _applyElementMarks() { }, _reserveFreshHeights() { }, _scheduleScrollBtnSync() { }, _trimTop() { }, _trace() { }, _getSessionIds: () => ({}),
        _scrollToBottom() { this.scrolls++; }, _reattach() { this.rereads++; },
      });
      const mini = Object.assign(Object.create(ChatMinimap.prototype), { _turnMap: [], _total: v._total, _fullExtent: null, _markerByTurn: new Map(),
        _minimap: { classList: { contains: () => true, add() { }, remove() { } }, children: [], appendChild() { } }, _messageList: { classList: { add() { } } }, _tocBtn: { classList: { remove() { } } } });
      mini.render = function (tm) { this._turnMap = tm; }; mini.syncBounds = () => { }; mini.setViewport = () => { }; mini.appendFullTurn = () => { };
      mini._turnMap = mm.turnMap().map((t) => ({ ...t }));
      v._chatMinimap = mini;
      const slab = ids ? mm.messages.filter((m) => ids.has(m.id)) : mm.messages.slice(start, end);
      for (const m of slab) { v._messages.push(m); v._renderedMsgIds.add(m.id); const el = drawsNothing(m) ? null : fakeEl(m); if (el) { v._elements.set(m.id, el); list.appendChild(el); } }
      return v;
    };
    const views = {
      'pinned tail': mkView({ start: total0 - 150, end: total0, pinned: true }),
      'scrolled up [700, 900)': mkView({ start: 700, end: 900 }),
      'teleported [500, 700)': mkView({ start: 500, end: 700, teleported: true, ids: new Set(mm.messages.slice(500, 700).map((m) => m.id)) }),
    };
    const teleIds = views['teleported [500, 700)']._messages.map((m) => m.id);
    const ops = []; mm.onOp((o) => { if (o.op === 'create' || o.op === 'move') ops.push(o); });
    let cutView = null, fed = 0, teleHeld = [];
    for (const r of shape) {
      const n0 = ops.length;
      mm.processLive(r);
      for (const o of ops.slice(n0)) for (const v of Object.values(views)) {
        if (o.op === 'create') v._onCreateMessage(o.message, o.before ? o : null); else v._onMoveMessage(o);
      }
      fed++;
      // the cut window: built the moment a message is afloat — its bottom ends INSIDE the afloat block (the float not held)
      if (!cutView && (typeof mm.afloatIds === 'function' ? mm.afloatIds() : []).length >= 2) {
        const t = mm.messages.length; cutView = mkView({ start: t - 200, end: t - 1 }); views['trim cut inside the unread block'] = cutView;
        // r3 m14: the reader jumped onto the unread message (a search hit) — a teleported slab [t−60, t) that holds it
        views['teleported onto the unread message'] = mkView({ start: t - 60, end: t, teleported: true, ids: new Set(mm.messages.slice(t - 60, t).map((m) => m.id)) });
        teleHeld = mm.messages.slice(t - 60, t).filter((m) => mm.afloatIds().includes(m.id)).map((m) => m.id);
      }
    }
    for (const [vn, v] of Object.entries(views)) {
      const held = v._messages.map((m) => m.id);
      const drawn = v._messageList.children.map((e) => e.dataset.msgId);
      const want = v._teleported ? null : mm.messages.slice(v._windowStart, v._windowEnd).map((m) => m.id);
      const inOrder = S(drawn) === S(held.filter((id) => v._elements.has(id)));
      const okWin = vn === 'teleported onto the unread message' ? teleHeld.every((id) => held.includes(id) && v._elements.get(id)?.parentNode === v._messageList)
        : v._teleported ? (S(held) === S(teleIds)) : (S(held) === S(want));
      ok(v.rereads === 0 && okWin && inOrder && (v._pinned || v.scrolls === 0) && v._total === mm.messages.length,
        `§0 F4 ${name} · ${vn}: the reader stays — 0 re-reads, ${vn === 'teleported onto the unread message' ? 'the person\'s messages the slab holds STAY drawn (r3 m14)' : `the window holds exactly the server's slice [${v._windowStart}, ${v._windowEnd}) in order${v._teleported ? ' (the slab keeps its cards)' : ''}`}, the count = the server's`,
        { rereads: v.rereads, scrolls: v.scrolls, total: [v._total, mm.messages.length], firstDiff: v._teleported ? null : held.findIndex((id, i) => id !== want[i]), n: [held.length, want && want.length] });
    }
    const pv = views['pinned tail'];
    ok(S(userTurnIdx(pv._chatMinimap._turnMap)) === S(userTurnIdx(mm.turnMap())), `§0 F3 ${name}: the live minimap's user markers sit where the reload's turnMap puts them (every marker followed its card)`, { live: userTurnIdx(pv._chatMinimap._turnMap).slice(-6), reload: userTurnIdx(mm.turnMap()).slice(-6) });
  }
  ok(true, '§0 m9: every window above counted the init cards that draw nothing (the count = the server\'s in each leg)');
}
// ── §0b THE REAL WRAPPER over the stand-in CLI, no hub, no browser (r3 m15 / m12) ──
{
  console.log('§0b the REAL chat-wrapper over the stand-in CLI: what the wrapper says decides the order (m15, m12)');
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const SS = require(path.join(REPO, 'src/session-store.js'));
  const ad = new ClaudeCodeAdapter({ buffersDir: os.tmpdir() });
  const label = (m) => { const t = (m.content || []).map((b) => (b.type === 'text' || b.type === 'system_info' ? b.text : '')).join(' ').replace(/\s+/g, ' ').trim();
    if (/for tool use\]/.test(t)) return 'i1'; if (/^\[Request interrupted by user\]/.test(t)) return 'i2'; if (m.role === 'system' && /^Interrupted/.test(t)) return 'I'; if (m.role === 'system') return null;
    if (m.role === 'tool') return 'tool'; if (m.role === 'assistant') return 'said'; return t.split(' ')[0] + (m.queueState ? `[${m.queueState}]` : ''); };
  const order = (mm) => mm.messages.map(label).filter(Boolean);
  async function wrapperLeg(variant, extra = {}) {
    const dir = scratchDir('mto-w-' + variant + (Object.keys(extra).length ? '-x' : ''));
    const env = { ...process.env, HOME: dir, STAND_IN_LONG_MS: '2500', ...(variant === 'readkept' || variant === 'ridekept2' ? { STAND_IN_POST_MS: '2500' } : { STAND_IN_PROMPT_HOOK_MS: '900', CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS: '1' }), ...extra };
    const w = spawn(process.execPath, [path.join(REPO, 'data/bin/chat-wrapper.js'), path.join(dir, 's.buf'), path.join(dir, 's.json'), process.execPath, STAND_IN], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], env });
    const live = createMessageManager('claude', 'mto-w');
    let moves = 0; live.onOp((o) => { if (o.op === 'move') moves++; });
    const recs = []; let lb = '';
    w.stdout.setEncoding('utf8');
    w.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i); lb = lb.slice(i + 1); let r = null; try { r = JSON.parse(l); } catch { continue; } recs.push(r); if (r.type !== '_stdin_ack') live.processLive(r); } });
    const say = (text, msgId, opts) => { const f = ad.formatChatInput(text, msgId, opts); live.processLive(f.userMsg); w.stdin.write(f.stdinPayload + '\n'); };
    const stopIt = () => w.stdin.write(ad.formatInterrupt() + '\n');
    const has = (p) => recs.some(p), results = () => recs.filter((r) => r.type === 'result').length;
    await until(() => fs.existsSync(path.join(dir, 's.json')), 8000);
    say('TOOL-A run the slow command', 'm-a');
    await until(() => has((r) => r.type === 'assistant' && JSON.stringify(r.message?.content || []).includes('tool_use')), 8000);
    await sleep(150);
    say('B the mid-turn message', 'm-b', { steer: true });
    await until(() => has((r) => r.type === 'input_handover' && JSON.stringify(r).includes('m-b')), 4000);
    if (variant === 'ridekept2') {
      // r4 m15: TWO riders — both handed while the tool runs, both MISS the request after its result (STAND_IN_RIDE_MISS)
      say('B2 a second one', 'm-b2', { steer: true });
      await until(() => has((r) => r.type === 'input_handover' && JSON.stringify(r).includes('m-b2')), 4000);
      await until(() => has((r) => r.type === 'user' && JSON.stringify(r.message?.content || '').includes('tool_result')), 8000);
      await sleep(150); stopIt();
      await until(() => results() >= 2, 8000); await sleep(1500);
    } else if (variant === 'readkept') {
      await until(() => has((r) => r.type === 'user' && JSON.stringify(r.message?.content || '').includes('tool_result')), 8000);
      await sleep(150);
      say('B2 handed after the result', 'm-b2', { steer: true });
      await until(() => has((r) => r.type === 'input_handover' && JSON.stringify(r).includes('m-b2')), 3000);
      await sleep(100); stopIt();
      await until(() => results() >= 2, 8000); await sleep(900);
    } else {
      await sleep(200); stopIt();
      await until(() => results() >= 1, 8000); await sleep(100);
      say('C typed inside the window', 'm-c', { steer: true }); await sleep(60);
      say('D a second one inside the window', 'm-d', { steer: true }); await sleep(80);
      stopIt();
      await until(() => results() >= 3, 10000); await sleep(1500);
    }
    // the wrapper ends (its buffer written at exit), the buffer is read, THEN its dir goes (stopWrapper, §55)
    await stopWrapper(w);
    const buffer = fs.existsSync(path.join(dir, 's.buf')) ? fs.readFileSync(path.join(dir, 's.buf'), 'utf8') : '';
    await stopWrapper(w, { dir });
    // the restart's rebuild: the wrapper's buffer (its copies of the mid-turn frames), merged and rebuilt by the tree's code
    const realHome = os.homedir; os.homedir = () => dir;
    let rb = null; try { const r = new SS.SessionMessages({ buffer, cwd: dir, claudeSessionId: null, backend: 'claude' }, 'mto-w-rb', { buffersDir: dir }).raw(); rb = createMessageManager('claude', 'mto-w'); rb.convertHistory(r); } finally { os.homedir = realHome; }
    const fromTool = (o) => o.slice(o.indexOf('tool'));
    return { moves, live: fromTool(order(live)), rebuild: rb ? fromTool(order(rb)) : null, landed: recs.filter((r) => r.type === 'input_handover' && r.state === 'landed').flatMap((r) => r.msg_ids), dropped: recs.filter((r) => r.type === 'queue_dropped').map((r) => r.keptIds || []) };
  }
  const rk = await wrapperLeg('readkept');
  ok(S(rk.live) === S(['tool', 'B[steered]', 'i2', 'I', 'i2', 'I', 'B2[kept]']) && rk.landed.includes('m-b') && !rk.landed.includes('m-b2') && S(rk.rebuild) === S(rk.live),
    '§0b m15 a message READ at its tool result, another handed after it, Stop ⇒ the follow-up\'s init names only the second: the wrapper says the first LANDED — «Steered» where it rode, the second «Unread when stopped» below both stop rows; the restart draws the same', rk);
  // r4 m15: THE SPLIT FOLLOW-UP (STAND_IN_SPLIT_FOLLOW — the shape the real CLI showed: each held frame its own follow-up)
  const SPLIT = { STAND_IN_SPLIT_FOLLOW: '1', STAND_IN_RIDE_MISS: '1' };
  const sp = await wrapperLeg('readkept', SPLIT);
  const keptTail = (o) => (o || []).filter((x) => /^B2?\[/.test(x));
  ok(S(keptTail(sp.live)) === S(['B[kept]', 'B2[kept]']) && sp.landed.length === 0 && sp.moves === 0 && sp.live.lastIndexOf('I') < sp.live.indexOf('B[kept]') && S(sp.rebuild) === S(sp.live),
    '§0b m15 r4 SPLIT follow-ups: a rider that MISSED its request (named by follow-up 1) and B2 (named by follow-up 2) — nothing called read, both «Unread when stopped» below every stop row, 0 moves, the restart the same (the riders are judged once, at the window\'s settle, against every follow-up\'s names)', sp);
  const sp2 = await wrapperLeg('ridekept2', SPLIT);
  ok(S(keptTail(sp2.live)) === S(['B[kept]', 'B2[kept]']) && sp2.landed.length === 0 && sp2.moves === 0 && S(sp2.rebuild) === S(sp2.live),
    '§0b m15 r4 two riders, both missed, SPLIT follow-ups: both kept below every stop row in the order sent — nothing landed, 0 moves', sp2);
  const w2 = await wrapperLeg('w2stop2two');
  const block = (o) => (o || []).filter((x) => /^[BCD]\[/.test(x));
  ok(S(block(w2.live)) === S(['B[kept]', 'C[removed]', 'D[removed]']) && S(block(w2.rebuild)) === S(block(w2.live)) && w2.live.lastIndexOf('I') < w2.live.indexOf('B[kept]') && w2.moves <= 2,
    '§0b m12 two sends inside the Stop window + a second Stop ⇒ the unread block in the order SENT (B, C, D) below the last stop row — live = the restart; r4: ≤ 2 move ops (6c7d4d7ca 2, never a cancelling pair)', w2);
}

// $VS_MTO_S0_ONLY=1: §0 alone (in-process, no hub, no browser — a round's quick check)
if (process.env.VS_MTO_S0_ONLY === '1') { console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped (§0 only)`); process.exit(fail ? 1 : 0); }

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
console.log('the chat window: a scratch hub, a claude session on the stand-in CLI, headless chrome (the runner\'s shape)');
if (!CHROME) { skip('all', 'no chrome/chromium'); console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`); process.exit(0); }
const VNC_ENV = await vncEnv();
const procs = new Set();
const wt = scratch('mto-wt');
const home = scratchHome('mto-home', fs);
const cwd = scratchDir('mto-cwd');
const chromeDir = scratchDir('mto-chrome');
const cleanup = () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const root of [chromeDir, home, wt, cwd]) { try { endRootedProcesses(root); } catch { } }
  try { fs.rmSync(wt, { recursive: true, force: true }); } catch { }
};
atExit.push(cleanup);
// the hub runs THIS tree: a copy (never a checkout — a RED control runs this file inside an archive copy of the base)
fs.mkdirSync(wt, { recursive: true });
for (const f of fs.readdirSync(REPO)) {
  if (['node_modules', '.git', 'docs', 'release'].includes(f) || /^CHANGELOG/.test(f)) continue;
  fs.cpSync(path.join(REPO, f), path.join(wt, f), { recursive: true, filter: (src) => !/\/data\/(?:session-buffers|sessions|logs)(?:\/|$)/.test(src) });
}
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${S(JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
// the CLI the hub spawns: answers the boot probes, else the stand-in (a TOOL- turn's Bash works 6 s)
const launcher = path.join(scratchDir('mto-bin'), 'claude');
fs.writeFileSync(launcher, `#!/bin/sh\ncase "$1" in --version) echo "2.1.312 (Claude Code) stand-in"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac\ncase "$PWD" in *ridemiss*) export STAND_IN_RIDE_MISS=1 STAND_IN_POST_MS=4000;; esac\nSTAND_IN_LONG_MS=6000 exec ${S(process.execPath)} ${S(STAND_IN)} "$@"\n`, { mode: 0o755 });
const [PORT, CDP_PORT] = await freePorts(2);
let journal = '';
const { DBUS_SESSION_BUS_ADDRESS: _bus, ...envNoBus } = process.env;   // a scratch hub never reaches the desktop bus
let srv = null;
const startServer = () => {
  srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: ['ignore', 'pipe', 'pipe'], env: { ...envNoBus, ...VNC_ENV, PORT: String(PORT), HOME: home, CLAUDE_CMD: launcher, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' } });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal = (journal + d).slice(-8000); }); srv.stderr.on('data', (d) => { journal = (journal + d).slice(-8000); });
};
const restartServer = async () => {
  const s = srv; const exited = new Promise((r) => s.once('exit', r));
  try { s.kill('SIGTERM'); } catch { }
  const t = setTimeout(() => { try { s.kill('SIGKILL'); } catch { } }, 8000);
  await exited; clearTimeout(t); procs.delete(s);
  startServer();
  return until(async () => (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok, 60000, 200);
};
startServer();
const fontEnv = runnerFontEnv(scratchDir('mto-fonts'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1200,900', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: { ...envNoBus, ...fontEnv } });
procs.add(chrome);
ok(await until(async () => (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok, 60000, 250), 'the scratch hub answered', journal.slice(-1200));
const ctl = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
const frames = []; ctl.on('message', (d) => { if (d.length > 65536) return; try { frames.push(JSON.parse(String(d))); } catch { } });
await new Promise((r, e) => { ctl.on('open', r); ctl.on('error', e); });
ctl.send(S({ type: 'create', backend: 'claude', mode: 'chat', cwd, reqId: 'c1', name: 'midturn order', cols: 80, rows: 24 }));
await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'c1'), 20000);
const created = frames.find((m) => m.type === 'created' && m.reqId === 'c1') || null;
ok(!!created, 'a claude chat session on the stand-in CLI', S(frames.filter((m) => m.reqId === 'c1')).slice(0, 400));
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
const cdpWs = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => cdpWs.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
cdpWs.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '?'); });
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); cdpWs.send(S({ id, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(S(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
const realClick = realClicker({ evalJs: ev, cdp });
const shot = async (name) => { if (!SHOTS) return; const r = await cdp('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Emulation.setCPUThrottlingRate', { rate: Number(process.env.VS_CPU_THROTTLE) || 4 });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
const load = async (lang) => {
  await cdp('Page.navigate', { url: 'about:blank' });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}` });
  await until(() => ev('!!(window.app && window.app.ready)'), 45000, 250);
  if (lang && (await ev(`localStorage.getItem('vibespace.lang')`)) !== lang) {
    await ev(`localStorage.setItem('vibespace.lang', ${S(lang)})`);
    return load(lang);
  }
  await ev('window.app.ready.then(() => true)');
};
/** The window of this session in the page — the restored layout's, else a fresh attach — once its history is in. */
let OPEN = { sid: created.sessionId, name: 'midturn order', cwd };
const open = () => ev(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let v = null;
  for (let i = 0; i < 20 && !v; i++) { v = [...window.app.sessions.values()].find((x) => x && x._chatInput && !x._disposed && x.sessionId === ${S(OPEN.sid)}) || null; if (!v) await sleep(250); }
  if (!v) { const winId = window.app.attachSession(${S(OPEN.sid)}, ${S(OPEN.name)}, ${S(OPEN.cwd)}, { mode: 'chat', backend: 'claude' }).id; for (let i = 0; i < 150; i++) { v = window.app.sessions.get(winId); if (v && v._chatInput && !v._readOnly) break; await sleep(200); } }
  for (let i = 0; i < 150 && v && !(v._messages || []).length; i++) await sleep(200);
  for (const el of document.querySelectorAll('[data-mto="1"]')) delete el.dataset.mto;
  if (v) { window.__mto = v; v._container.dataset.mto = '1'; }
  return { ok: !!(v && v._chatInput), ro: v ? !!v._readOnly : null, n: v ? (v._messages || []).length : 0 };
})()`);
/** THE DOM ORDER: every rendered row of the window, top to bottom, as a short label (+ the chip's state, label and title). */
const DOM_ORDER = `(() => {
  const v = window.__mto; const byId = new Map((v._messages || []).map((m) => [m.id, m]));
  return [...v._messageList.children].filter((el) => el.dataset && el.dataset.msgId && byId.has(el.dataset.msgId)).map((el) => {
    const m = byId.get(el.dataset.msgId);
    const t = (m.content || []).map((b) => (b.type === 'text' || b.type === 'system_info' ? b.text : b.type === 'tool_call' ? '⚙' + b.toolName : '')).join(' ').replace(/\\s+/g, ' ').trim();
    const chip = el.querySelector('[data-queue-state]');
    let label;
    if (/^\\[Request interrupted by user for tool use\\]/.test(t)) label = 'i1';
    else if (/^\\[Request interrupted by user\\]/.test(t)) label = 'i2';
    else if (m.role === 'system' && /^Interrupted/.test(t)) label = 'Interrupted';
    else if (m.role === 'system') label = null;
    else if (m.role === 'tool') label = 'tool';
    else if (m.role === 'assistant') label = 'said:' + t.slice(0, 16);
    else label = t.split(' ')[0];
    return label && { label, text: label === 'Interrupted' ? t : undefined, chip: chip ? chip.dataset.queueState : null, chipText: chip ? chip.textContent.trim() : null, chipTitle: chip ? chip.title : null };
  }).filter(Boolean);
})()`;
const order = () => ev(DOM_ORDER);
const labels = (o) => (o || []).map((r) => r.label + (r.chip ? `[${r.chip}]` : ''));
const focus = () => ev(`(() => { const t = window.__mto._chatInput._textarea; t.focus(); return document.activeElement === t; })()`);
const typeSend = async (text) => {
  await focus(); await cdp('Input.insertText', { text });
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
};
const streaming = () => ev(`!!document.querySelector('[data-mto="1"] .chat-interrupt-btn')`);
const chipOf = (word) => ev(`(() => { const v = window.__mto; const m = (v._messages || []).filter((x) => x.role === 'user' && JSON.stringify(x.content).includes(${S(word)})).pop(); return m ? (m.queueState || null) : undefined; })()`);
const toolCards = () => ev(`(window.__mto._messages || []).filter((m) => m.role === 'tool').length`);
const rows = (o, l) => (o || []).map((r, i) => (r.label === l ? i : -1)).filter((i) => i >= 0);

// ── ① THE OWNER'S SEQUENCE ──
console.log('① a tool runs · a message typed + Enter mid-tool · Stop · Stop again');
await load('en');
const o1 = await open();
ok(o1 && o1.ok && !o1.ro, 'the chat window opened live with a composer', o1);
await typeSend('TOOL-A run the slow command');
ok(await until(async () => (await toolCards()) >= 1, 20000), 'the turn ran its tool (a tool card)');
await typeSend('B the mid-turn message');
ok(await until(async () => (await chipOf('B the mid-turn')) === 'handed', 8000), 'the message was handed to the running turn (Enter, the CLI\'s default) — «Handed to the turn»', await chipOf('B the mid-turn'));
const stop1 = await realClick('[data-mto="1"] .chat-interrupt-btn');
await sleep(60);
const stop2 = (await streaming()) ? await realClick('[data-mto="1"] .chat-interrupt-btn') : false;
console.log(`  (Stop pressed: first ${stop1}, second ${stop2 ? 'pressed' : 'not needed — the turn had ended'})`);
ok(await until(async () => rows(await order(), 'i2').length >= 1 && rows(await order(), 'Interrupted').length >= 2 && !(await streaming()), 15000), 'the stop drew its rows: «…for tool use]», «[Request interrupted by user]», each with «Interrupted»', labels(await order()));
await sleep(400);
const after = await order();
const L = labels(after), b = L.findIndex((x) => /^B\[/.test(x));
console.log(`  DOM order: ${L.join(' · ')}`);
ok(b > rows(after, 'i1')[0] && b > rows(after, 'i2')[0] && b > Math.max(...rows(after, 'Interrupted')), '① THE ORDER THE AGENT LIVED: the message it never read is drawn BELOW both interrupt rows and their «Interrupted» rows', L);
ok(S(L.slice(L.indexOf('tool'))) === S(['tool', 'i1', 'Interrupted', 'i2', 'Interrupted', 'B[kept]']), '…exactly: the tool, the stop for tool use, the follow-up the wrapper stopped on its init, then the message', L);
ok(after.filter((r) => r.label === 'Interrupted').every((r) => r.text === 'Interrupted'), '① (r2 r1) each «Interrupted» row reads «Interrupted» alone — never a message\'s words above that message (the real CLI\'s interrupted result carries none; the stand-in now writes that shape)', after.filter((r) => r.label === 'Interrupted').map((r) => r.text));
const chip = after[b] || {};
ok(chip.chip === 'kept' && chip.chipText === 'Unread when stopped — goes with your next message' && /^Stop came before the agent read it\. It stays in the conversation and reaches the agent with the next message it gets/.test(chip.chipTitle || ''), '…its chip says the agent had not read it and where it goes: «Unread when stopped — goes with your next message»', chip);
await shot('after-en-kept');
const live1 = S(L);

// ── ② RELOAD ──
console.log('② a reload draws the same order');
await load('en');
ok((await open()).ok, 'the window reopened after the reload');
ok(await until(async () => S(labels(await order())) === live1, 8000), '② the reload (the hub\'s slab) draws the live order', { reload: labels(await order()), live: JSON.parse(live1) });

// ── ③ HUB RESTART ──
console.log('③ a hub restart (the rebuild from the wrapper\'s buffer) draws the same order');
ok(await restartServer(), 'the hub restarted (the session lives on in its own processes)', journal.slice(-600));
await load('en');
ok((await open()).ok, 'the window reopened after the restart');
// the stand-in writes no transcript: the person's FIRST prompt (a turn's start — the CLI's transcript is its only record) is
// not in a restart's rebuild on any tree; from the tool on, every row is the wrapper's buffer's — the order the law is about
const fromTool = (l) => S(l.slice(l.indexOf('tool')));
ok(await until(async () => fromTool(labels(await order())) === fromTool(JSON.parse(live1)), 15000), '③ the restart\'s rebuild draws the live order — the kept message below both interrupt rows, once', { rebuilt: labels(await order()), live: JSON.parse(live1) });

// ── ④ zh ──
console.log('④ the chip in Chinese');
await load('zh');
ok((await open()).ok, 'the window reopened in zh');
await until(async () => S(labels(await order())) === live1, 8000);
const zhRow = (await order()).find((r) => r.chip === 'kept') || {};
ok(zhRow.chipText === '停止时未读 · 随你的下一条消息送达' && /^停止先于 agent 读到它。/.test(zhRow.chipTitle || ''), '④ zh: «停止时未读 · 随你的下一条消息送达», the title says when it arrives', zhRow);
await shot('after-zh-kept');
await load('en');
ok((await open()).ok, 'back in en');

// ── ⑤ THE NEXT MESSAGE ──
console.log('⑤ the person\'s next message goes right below the kept one');
await typeSend('N the next message');
ok(await until(async () => labels(await order()).some((x) => /^said:reply: N the n/.test(x)) && !(await streaming()), 20000), 'the next turn answered', labels(await order()));
const L5 = labels(await order());
const kb = L5.findIndex((x) => /^B\[/.test(x));
ok(kb >= 0 && L5[kb + 1] === 'N' && /^said:reply: N the n/.test(L5[kb + 2] || ''), '⑤ the kept message, then the next message, then its answer — they reached the agent together', L5);
await shot('after-en-next');

// ── ⑥ CONTROL: HANDED AND READ — UNCHANGED ──
console.log('⑥ CONTROL: a message handed mid-tool and read at the tool result keeps its place');
await typeSend('TOOL-C another slow command');
ok(await until(async () => (await toolCards()) >= 2, 20000), 'the second turn ran its tool');
await typeSend('D handed mid tool');
ok(await until(async () => (await chipOf('D handed mid tool')) === 'steered' && !(await streaming()), 30000), 'it rode the tool result — «Steered»', await chipOf('D handed mid tool'));
const L6 = labels(await order());
const d = L6.findIndex((x) => /^D\[/.test(x)), t2 = L6.lastIndexOf('tool');
ok(d === t2 + 1 && /^said:/.test(L6[d + 1] || ''), '⑥ drawn where it entered: right below the tool card whose result carried it, above the answer that read it (as before this lane)', L6);

// ── ⑦ M1 IN THE BROWSER: the rider the CLI still held ──
console.log('⑦ (r2 M1) a message rides a tool result the CLI still holds · Stop · the next message');
const cwd2 = scratchDir('mto-cwd-ridemiss');
// ③ restarted the hub: the control socket of the first create is closed — a fresh one
const ctl2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
ctl2.on('message', (d) => { if (d.length > 65536) return; try { frames.push(JSON.parse(String(d))); } catch { } });
await new Promise((r, e) => { ctl2.on('open', r); ctl2.on('error', e); });
ctl2.send(S({ type: 'create', backend: 'claude', mode: 'chat', cwd: cwd2, reqId: 'c2', name: 'midturn ridemiss', cols: 80, rows: 24 }));
await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'c2'), 20000);
const created2 = frames.find((m) => m.type === 'created' && m.reqId === 'c2') || null;
if (!ok(!!created2, '⑦ a second claude session (its stand-in misses the request after the tool result: STAND_IN_RIDE_MISS)', S(frames.filter((m) => m.reqId === 'c2')).slice(0, 400))) { /* the legs below say why */ }
else {
  OPEN = { sid: created2.sessionId, name: 'midturn ridemiss', cwd: cwd2 };
  ok((await open()).ok, '⑦ its window opened live');
  await typeSend('TOOL-R run the slow command');
  ok(await until(async () => (await toolCards()) >= 1, 20000), '⑦ the turn ran its tool');
  await typeSend('B rides then kept');
  ok(await until(async () => (await chipOf('B rides then kept')) === 'handed', 8000), '⑦ handed to the running turn', await chipOf('B rides then kept'));
  // the tool result came (the frame rode it — but the CLI missed it): Stop while the model would answer
  ok(await until(() => ev(`(window.__mto._messages || []).some((m) => m.role === 'tool' && m.status === 'complete')`), 15000), '⑦ the tool result came (the frame rode it)');
  await realClick('[data-mto="1"] .chat-interrupt-btn');
  ok(await until(async () => rows(await order(), 'i2').length >= 2 && !(await streaming()), 15000), '⑦ the stop drew two «[Request interrupted by user]» rows (the turn, then the follow-up the wrapper stopped)', labels(await order()));
  await sleep(400);
  // r3 m17: the window's own record of every move it is told — read off the wire, before any re-read could redraw the DOM
  await ev(`(() => { const v = window.__mto; const orig = v._onMoveMessage.bind(v); v.__moves = []; v._onMoveMessage = (op) => { v.__moves.push({ id: op.id, from: op.from, to: op.to }); return orig(op); }; return true; })()`);
  await typeSend('N the next message');
  ok(await until(async () => labels(await order()).some((x) => /^said:reply: N the n/.test(x)) && !(await streaming()), 20000), '⑦ the next turn answered', labels(await order()));
  const L7 = labels(await order());
  console.log(`  DOM order: ${L7.join(' · ')}`);
  const k7 = L7.findIndex((x) => /^B\[/.test(x));
  ok(k7 > L7.lastIndexOf('i2') && L7[k7] === 'B[kept]' && L7[k7 + 1] === 'N' && /^said:reply: N the n/.test(L7[k7 + 2] || ''), '⑦ M1: the kept rider stays BELOW both interrupt rows when the next message comes (never lifted back to where it rode), the next message right below it', L7);
  const climbs = await ev(`(() => { const v = window.__mto; const b = (v._messages || []).find((m) => m.webuiMsgId && JSON.stringify(m.content).includes('B rides then kept')); return (v.__moves || []).filter((o) => b && o.id === b.id && o.to < o.from); })()`);
  ok(Array.isArray(climbs) && climbs.length === 0, '⑦ (r3 m17) …and the window was told NO move that lifts the kept rider (the wire\'s own record; on the r1 tip the server sent one, its client\'s re-read then hid the climb in the DOM)', climbs);
  await shot('after-en-ridemiss');
}

// ── ⑧ r2 A PHONE, 360 px: the chip never squeezes the person's words ──
console.log('⑧ (r2 r2) a phone at 360 px — bubble mode and compact mode, en and ja');
OPEN = { sid: created.sessionId, name: 'midturn order', cwd };
await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 760, deviceScaleFactor: 2, mobile: true });
const PHONE = `(() => { const v = window.__mto; const m = (v._messages || []).find((x) => x.role === 'user' && x.queueState === 'kept'); const el = m && v._elements.get(m.id); if (!el) return null;
  const chip = el.querySelector('.chat-queue-chip'), bubble = el.querySelector('.chat-bubble-user, .chat-compact-msg, .chat-text') || el;
  const r = (e) => { const q = e.getBoundingClientRect(); return { l: Math.round(q.left), r: Math.round(q.right), t: Math.round(q.top), b: Math.round(q.bottom), w: Math.round(q.width) }; };
  const text = el.querySelector('.chat-text') || bubble;
  return { row: r(el), chip: chip ? r(chip) : null, bubble: r(bubble), textOverflow: text.scrollWidth > text.clientWidth + 1, chipText: chip ? chip.textContent.trim() : null, compact: v._container.classList.contains('chat-compact') }; })()`;
for (const lang of ['en', 'ja']) {
  for (const compact of [false, true]) {
    await load(lang);
    await ev(`app.settings.set('chat.compactMode', ${compact}); true`); await sleep(600);
    ok((await open()).ok, `⑧ ${lang} ${compact ? 'compact' : 'bubble'}: the window opened at 360 px`);
    let g = null; await until(async () => !!(g = await ev(PHONE)), 8000);
    const fits = !!(g && g.chip && g.chip.r <= g.row.r + 1 && g.chip.l >= g.row.l - 1 && !g.textOverflow);
    const notSqueezed = !!(g && g.chip && (compact || g.chip.t >= g.bubble.b - 1 || g.bubble.w >= 0.5 * g.row.w));
    ok(fits && notSqueezed && g.compact === compact, `⑧ ${lang} ${compact ? 'compact' : 'bubble'} at 360 px: the chip stays inside the row and the person's words are whole${compact ? '' : ' — the chip wraps UNDER the bubble instead of squeezing it'}`, g);
    if (!compact) {
      // r4 note: a SHORT chip («Steered») goes under its bubble too, and that bubble stays right-aligned with the others
      const st = await ev(`(() => { const v = window.__mto; const user = (v._messages || []).filter((x) => x.role === 'user');
        const sd = user.find((x) => x.queueState === 'steered'), plain = user.find((x) => !x.queueState && JSON.stringify(x.content).includes('N the next message'));
        const r = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return { r: Math.round(q.right), t: Math.round(q.top), b: Math.round(q.bottom) }; };
        const el = sd && v._elements.get(sd.id), pl = plain && v._elements.get(plain.id);
        return { chip: r(el && el.querySelector('.chat-queue-chip')), bubble: r(el && el.querySelector('.chat-bubble-user')), plain: r(pl && pl.querySelector('.chat-bubble-user')) }; })()`);
      ok(st && st.chip && st.bubble && st.plain && st.chip.t >= st.bubble.b - 1 && Math.abs(st.bubble.r - st.plain.r) <= 2, `⑧ ${lang} bubble at 360 px (r4): a short chip («Steered») sits UNDER its bubble, and that bubble stays right-aligned with the other bubbles`, st);
    }
    await shot(`phone-${compact ? 'compact' : 'bubble'}-${lang}`);
  }
}
await cdp('Emulation.clearDeviceMetricsOverride');

ok(pageErrors.length === 0, 'no page exceptions', pageErrors.slice(0, 3));

try { cdpWs.close(); } catch { }
try { ctl.close(); } catch { }
try { ctl2.close(); } catch { }
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
cleanup();
process.exit(fail ? 1 : 0);
