// THE MODEL CHIP MATRIX (lane fable-52-cli-321 rounds 10–11) — every harness row of src/backend-caps.js × every door a model chip is
// painted from, driven on ONE root's REAL code:
//   the bar (src/lib/chat-status-bar.js ChatStatusBar) with its OWN pick / Lock closures (their text, bound to the bar) and its OWN
//     Lock-row condition (the `if (…)` that guards the row, its text);
//   chat-view's OWN meta lines (model-lock / model-facts / model-answer / served-model) and its live-init road;
//   ws-handler's OWN set-model case (its text) and its attach lines (the status a live attach sends);
//   src/server/model-ask.js where the root has it (the server's facts, the answer to a press);
//   SessionMessages.chatStatus() (src/session-store.js) over a Claude record list — the status a view-only window, the transcript
//   route and a resume's withStatus fetch send.
// The same driver runs on master (the oracle for every cell the law does not own — scripts/fixtures/chip-matrix-master.json, written
// by `node scripts/chip-matrix.mjs <masterRoot> --write`) and on this tree (test-status-bar-chips ⑪).
// A cell is {label, amber, locked, title, lockTip[, lockRow, cfg]}: the chip's text, whether it is amber (an «Auto-fallback»), whether
// it shows the lock, its title and the lock badge's words, and for the Lock doors whether the row was offered and what was saved.
// A door with several moments names each as `door@moment`. Beside each cell, a PROBE (round 13 — never written to the oracle): the
// bar's own fields at the end of the scene (master's: _statusModel, _servedModel, the lock, _servedBeforeLock), the facts the server
// DECLARES at that moment (a live session on a row that declares them; else null) and master's render over those fields (a fresh bar
// fed them through master's own roads — the `twin`).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

/** The doors a model chip is painted from (rounds 10 and 11), each a scene of steps over one root's real code. */
export const DOORS = Object.freeze([
  'reattach', 'pick', 'pick-reply', 'locked-pick', 'live-init', 'view-only-attach', 'transcript-route', 'withstatus-fetch', 'cost-op',
  // round 11: a page with no live session, the Lock row by the capability row, a lost answer, a resume that asks nothing, a fresh init
  'stopped-pick', 'stopped-lock', 'stopped-unlock', 'live-lock', 'lost-answer',
  'resume-2m@first-paint', 'resume-2m@attach', 'resume-2m@init', 'resume-2m@reply',
  'resume-helper@first-paint', 'resume-helper@attach', 'resume-helper@init', 'resume-helper@reply',
  'fresh-init@attach', 'fresh-init@init',
  // round 12: a conversation that ENDS while its window is open; a Lock in the gap before a resume's facts; a lock answered by another model
  'ended-pick', 'ended-lock', 'ended-unlock', 'ended-pick-lock', 'ended-after-pick', 'gap-lock', 'locked-above',
  // round 13: round 12's failed scenes — an end after a REAL fallback (plain and locked), the sign-in wall (read-only, the CLI alive), a
  // press in flight at the end, a refused id after a Lock, the second device that did not see the end, a stale frame
  'ended-fallback', 'ended-fallback-locked', 'wall@fallback', 'wall@reply', 'ended-pending-pick', 'ended-pending-lock', 'locked-refused-pick',
  'second-device-pick', 'second-device-lock', 'stale-frame',
]);
/** Model ids no harness names and none a prefix of another (master's alias-tolerant compare reads a prefix as the same model);
 *  A1 is what a CLI's init names for an ask of A (a resolved id the ask's string does not spell). */
export const A = 'model-alpha', B = 'model-beta', C = 'model-gamma', A1 = 'resolved-alpha';

class FakeEl {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this._html = ''; this.style = {}; this.dataset = {}; }
  get children() { return this.childNodes.filter((n) => n instanceof FakeEl); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get classList() { const el = this; return { add: (...c) => { el.className = [...new Set([...el.className.split(/\s+/).filter(Boolean), ...c])].join(' '); }, remove: (...c) => { el.className = el.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); }, contains: (c) => el.className.split(/\s+/).includes(c), toggle: () => { } }; }
  get title() { return this.getAttribute('title') || ''; }
  set title(v) { this.setAttribute('title', v); }
  get innerHTML() { return this._html; }
  set innerHTML(h) { this._html = String(h); }
  get textContent() { return this._html.replace(/<[^>]*>/g, ''); }
  set textContent(v) { this._html = String(v); }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) { if (n.parentNode) n.parentNode.removeChild(n); const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); n.parentNode = this; return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener() { }
  removeEventListener() { }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get isConnected() { return true; }
}

/** An arrow function's text out of a source (the chips suite's own reader): `head` up to its balanced body. */
/** The model chip a bar draws: its text, amber, lock mark, title and the lock badge's words. */
function chipOfBar(bar) {
  bar.render?.();
  const el = (bar.element?.children || []).find((e) => e.getAttribute('data-chip') === 'model');
  if (!el) return { label: null, amber: false, locked: false, title: '', lockTip: '' };
  const t = el.title || '', cut = t.indexOf(' · ');
  return { label: el.textContent.trim(), amber: /chat-status-model-fallback/.test(el.className), locked: /chat-status-model-locked/.test(el.className), title: cut < 0 ? t : t.slice(0, cut), lockTip: cut < 0 ? '' : t.slice(cut + 3) };
}

function arrowOf(src, head) {
  const at = src.indexOf(head); if (at < 0) return null;
  let i = src.indexOf('=>', at) + 2; while (src[i] === ' ') i++;
  const open = src.indexOf('(', at + head.indexOf('('));
  if (src[i] !== '{') return src.slice(open, src.indexOf(';\n', i));
  let d = 0, j = i; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(open, j + 1);
}

/** Drive every row × door on `root`'s real code → { rows: { <row>: { modelFacts, cells: { <door>: cell } } } }. */
export async function driveChipMatrix(root) {
  const R = (p) => path.join(root, p), txt = (p) => fs.readFileSync(R(p), 'utf8');
  const req = createRequire(R('src/ws-handler.js'));
  const doc0 = globalThis.document, set0 = globalThis.setTimeout, clear0 = globalThis.clearTimeout;
  // import FIRST with no document (the chips suite's order: utils.js wires its tooltip only when a document exists at import)
  delete globalThis.document;
  let ChatStatusBar, AM;
  try {
    ({ ChatStatusBar } = await import(pathToFileURL(R('src/lib/chat-status-bar.js')).href));
    AM = await import(pathToFileURL(R('src/lib/agent-meta.js')).href);
  } finally { if (doc0 !== undefined) globalThis.document = doc0; }
  globalThis.document = { createElement: (t) => new FakeEl(t), addEventListener() { }, removeEventListener() { }, body: new FakeEl('body'), documentElement: new FakeEl('html') };
  // TIME passes only when a scene says so: a timer a bar sets (an earlier tree's pending mark ended 8 s later in a browser) runs at `expire()`
  let timers = [];
  globalThis.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  globalThis.clearTimeout = (id) => { if (id) timers[id - 1] = null; };
  const expire = () => { for (let i = 0; i < timers.length; i++) { const fn = timers[i]; if (fn) { timers[i] = null; try { fn(); } catch { } } } };
  try {
    const CAPS = req('./backend-caps.js');
    const MA = fs.existsSync(R('src/server/model-ask.js')) ? req('./server/model-ask.js') : null;
    const MP = req('./model-providers.js');
    const { SessionMessages } = req('./session-store.js');
    const ws = txt('src/ws-handler.js');
    const a0 = ws.indexOf("        case 'set-model': {"), a1 = ws.indexOf("        case 'set-effort': {", a0);
    if (a0 < 0 || a1 < 0) throw new Error('ws-handler: the set-model case was not found');
    const runCase = new Function('data', 'activeSessions', 'adapterRegistry', 'readSessionMeta', 'writeSessionMeta', 'broadcastActiveSessions', 'broadcastToSession', 'ws', 'require', `switch (data.type) {\n${ws.slice(a0, a1)}\n}`);
    // the live attach's own lines: the lock fields, then (where the root has them) the transcript model and the declared facts
    const s0 = ws.indexOf('chatStatus.modelLocked = !!session._modelLocked;');
    if (s0 < 0) throw new Error('ws-handler: the attach status lines were not found');
    const fa = ws.indexOf('MA.modelFacts(session)', s0);
    const s1 = fa > 0 && fa - s0 < 3000 ? ws.indexOf('\n', fa) : ws.indexOf('\n', ws.indexOf('chatStatus.lockedModel', s0));
    const attachLines = new Function('chatStatus', 'session', 'require', ws.slice(s0, s1));
    const cv = txt('src/lib/chat-view.js');
    const metaLine = (sub, call) => { const m = new RegExp(`if \\(op\\.subtype === '${sub}'\\) \\{\\n\\s*((?:if \\([^\\n]*?\\) )?this\\._statusBar\\.${call}\\([^\\n]*\\);)`).exec(cv); return m ? new Function('op', m[1].replace('this._statusBar', 'this')) : null; };   // (round 14: a guard before the call runs with it)
    const lines = { lock: metaLine('model-lock', 'applyStatus'), facts: metaLine('model-facts', 'applyStatus'), answer: metaLine('model-answer', 'answerModel'), served: metaLine('served-model', 'setServedModel') };
    // the live-init road: a live init names the model it runs (the tree: chat-view's own _liveInitModel; master: any drawn init's model)
    const li = cv.indexOf('  _liveInitModel(msg) {');
    const liveInit = li >= 0
      ? (() => { const body = cv.slice(cv.indexOf('{', li) + 1, cv.indexOf('\n  }\n', li)); const fn = new Function('msg', body); return (bar, m) => fn.call({ _statusBar: bar }, { role: 'system', content: [{ initData: { model: m } }] }); })()
      : (/if \(se\.model\) this\._statusBar\.setModel\(se\.model\);/.test(cv) ? (bar, m) => bar.setModel(m) : null);
    // who tells a served model live: the root's own emitters (master's Claude manager did; Antigravity's ACP manager does)
    const mm = txt('src/message-manager.js'), acp = txt('src/acp-message-manager.js');
    const servedOp = { claude: /subtype: 'served-model'/.test(mm), antigravity: /modelFrom === 'agy'[^\n]*served-model/.test(acp) };
    const sb = txt('src/lib/chat-status-bar.js');
    const pickSrc = arrowOf(sb, 'const pick = (model) =>'), lockSrc = arrowOf(sb, 'lockItem.onclick = (ev) =>');
    if (!pickSrc || !lockSrc) throw new Error('chat-status-bar: the pick / Lock closures were not found');
    // the Lock row's OWN guard (master: the ui row; the tree: _lockRowOffered) — its text, run on the bar
    const rowCond = /      if \(([^\n]*)\) \{\n\s*const lockItem = document\.createElement\('div'\);/.exec(sb);
    if (!rowCond) throw new Error('chat-status-bar: the Lock row guard was not found');
    const rowOffered = new Function('uiRow', 'declaresModelFacts', `return !!(${rowCond[1]});`);
    // the road a view takes when its conversation ENDS while it stays open (chat-view's own _setReadOnly, its text)
    const ro = cv.indexOf('  _setReadOnly() {');
    const setRO = ro >= 0 ? new Function(cv.slice(cv.indexOf('{', ro) + 1, cv.indexOf('\n  }\n', ro))) : null;
    const bindArrow = (src, bar) => new Function('showToast', 't', 'dropdown', 'namedModel', `return (${src});`).call(bar, () => { bar.__toasts = (bar.__toasts || 0) + 1; }, (x) => x, { remove() { } }, MP.namedModel || ((m) => m));

    // Claude record lists — what a stopped / resumed conversation's chatStatus() reads:
    //   two models in one process (asked A, served B last: the cumulative modelUsage's FIRST key stays A);
    //   a helper first (the modelUsage's FIRST key is a helper's, C; the main model A served last);
    //   one model (A throughout)
    const usage = { input_tokens: 10, output_tokens: 5 };
    const HIST = {
      two: [{ type: 'system', subtype: 'init', model: A, session_id: 'h' }, { type: 'assistant', message: { id: 'm1', model: A, usage, content: [{ type: 'text', text: 'one' }] } }, { type: 'result', subtype: 'success', modelUsage: { [A]: { contextWindow: 200000 } }, total_cost_usd: 0.01 }, { type: 'assistant', message: { id: 'm2', model: B, usage, content: [{ type: 'text', text: 'two' }] } }, { type: 'result', subtype: 'success', modelUsage: { [A]: { contextWindow: 200000 }, [B]: { contextWindow: 200000 } }, total_cost_usd: 0.01 }],
      helper: [{ type: 'system', subtype: 'init', model: A, session_id: 'h' }, { type: 'assistant', message: { id: 'm1', model: A, usage, content: [{ type: 'text', text: 'one' }] } }, { type: 'result', subtype: 'success', modelUsage: { [C]: { contextWindow: 200000 }, [A]: { contextWindow: 200000 } }, total_cost_usd: 0.01 }],
      one: [{ type: 'system', subtype: 'init', model: A, session_id: 'h' }, { type: 'assistant', message: { id: 'm1', model: A, usage, content: [{ type: 'text', text: 'one' }] } }, { type: 'result', subtype: 'success', modelUsage: { [A]: { contextWindow: 200000 } }, total_cost_usd: 0.01 }],
    };
    const LAST = { two: B, helper: A, one: A };   // the model each list served last — what a resumed CLI runs
    const statusOf = (row, kind) => {
      if (row !== 'claude') return { model: A };   // another harness's store names its model; no served field on either root
      const sm = new SessionMessages({ cwd: '/tmp/chip-matrix', backend: 'claude', backendSessionId: 'chip-matrix-h', claudeSessionId: 'chip-matrix-h' }, 'chip-matrix');
      sm._all = HIST[kind].map((r) => JSON.parse(JSON.stringify(r)));
      return sm.chatStatus() || {};
    };

    const rows = {};
    for (const row of Object.keys(CAPS.BACKEND_CAPS)) {
      const modelFacts = CAPS.capsOf(row).modelFacts;
      const cells = {};
      // ── one world per scene: a server session (or none — a stopped view), its meta store, the frames it sends, one bar ──
      const world = ({ live = true, locked = false, spawn = A, dropAnswers = false } = {}) => {
        timers = [];
        const metas = {}, io = { readSessionMeta: (k) => metas[k] || null, writeSessionMeta: (k, v) => { metas[k] = v; } };
        const S = { id: 'cm', _webuiId: 'cm', backend: row, mode: 'chat', sockName: 'cw-cm', pty: { write() { } }, _spawnModel: spawn, _modelOrigin: spawn ? 'chosen' : null, _modelLocked: locked, _lockedModel: locked ? A : null };
        const active = new Map(live ? [['cm', S]] : []);
        const cfg = [];
        const bar = new ChatStatusBar({ send() { } }, live ? 'cm' : 'view-cm', { backend: row, getToolMsg: () => null, openSubagentViewer() { }, openInTempEditor() { }, onSearch() { }, onDesignRequest() { }, onConfigChange: (o) => cfg.push(o) });
        // frames reach the browser AFTER the press returns (a socket is asynchronous): queued, delivered at the end of each step
        const inbox = [];
        const flush = () => { while (inbox.length) { const g = inbox.shift(); g(); } };
        const deliverNow = (f) => {
          if (!f || f.type !== 'msg' || f.op !== 'meta') return;
          const line = { 'model-lock': lines.lock, 'model-facts': lines.facts, 'model-answer': lines.answer, 'served-model': lines.served }[f.subtype];
          if (line) line.call(bar, f);
          if ((f.subtype === 'model-facts' && f.data && f.data.modelFacts === true) || (f.subtype === 'model-answer' && f.data && f.data.facts)) sawFacts = true;
        };
        const deliver = (f) => { if (dropAnswers && f && f.subtype === 'model-answer') return; inbox.push(() => deliverNow(f)); };
        const sender = { send: (raw) => { let f = null; try { f = JSON.parse(raw); } catch { return; } if (f.type === 'error' && f.code === 'model-refused') inbox.push(() => bar.answerModel?.({ ok: false, answer: f.reqId ?? null })); else deliver(f); } };
        bar._ws = { send: (frame) => runCase(frame, active, { get: () => ({ formatSetModel: (m) => JSON.stringify({ type: 'control_request', request_id: 'rq-' + m, request: { subtype: 'set_model', model: m } }) }) }, io.readSessionMeta, io.writeSessionMeta, () => { }, (_s, _id, f) => deliver(f), sender, req) };
        const declares = () => !!(MA && MA.declares && MA.declares(S));
        // the server's facts at the start: the ask (the spawn model, numbered) and, for a conversation that ran, its CLI and one served record
        // (master's served-model op is CHANGE-only: a record served before this page attached is one its page never hears of — round 14)
        let lastOp = null;
        const seed = (ran) => { if (ran && servedOp[row]) lastOp = A; if (!declares()) return; try { MA.askAfter?.(S, null, io); } catch { } if (ran) { try { MA.noteCliModel?.(S, A, io); } catch { } try { MA.noteServed(S, A, { ...io, recId: 'r-a', feed: 'parse' }); } catch { } } };
        const attach = (status) => { const st = { ...status }; attachLines(st, S, req); if (st.modelFacts === true) sawFacts = true; bar.applyStatus(st); };
        const init = (m) => {   // the CLI's init names the model it runs: the client's live-init road on its record, then the server's facts
          if (liveInit) liveInit(bar, m);   // (claude-stream-json: the facts are told AFTER the init's record — round 13)
          if (declares() && MA.noteCliModel) { MA.noteCliModel(S, m, io); MA.broadcastFacts(S, 'cm', (_s, _id, f) => deliver(f)); }
        };
        const reply = (m, id) => {   // the CLI's next reply, served by `m`, told the way this root tells it
          if (declares()) { if (MA.noteServed(S, m, { ...io, recId: id || ('r-' + m), feed: 'parse' })) MA.broadcastFacts(S, 'cm', (_s, _id, f) => deliver(f)); }
          if (servedOp[row] && m !== lastOp) { lastOp = m; deliver({ type: 'msg', op: 'meta', subtype: 'served-model', data: { model: m } }); }   // the normalizer's op (master's), on both roots
        };
        const pick = (m) => { bindArrow(pickSrc, bar)(m); flush(); };
        const offered = () => rowOffered.call(bar, AM.uiRow, AM.declaresModelFacts || (() => false));
        const lock = () => { bindArrow(lockSrc, bar)({ stopPropagation() { } }); flush(); };
        const read = (extra = {}) => {
          flush();
          const fields = { s: bar._statusModel || '', v: bar._servedModel || null, l: !!bar._modelLocked, t: bar._lockedModel || null, b: !!bar._servedBeforeLock };
          probes[curDoor] = { fields, sawFacts, facts: (declares() && active.has('cm')) ? MA.modelFacts(S) : null, factsAtEnd, twin: twinOf(fields) };
          return { ...chipOfBar(bar), ...extra };
        };
        const savedCfg = () => cfg.reduce((o, p) => { for (const [k, v] of Object.entries(p)) { if (v === undefined) delete o[k]; else o[k] = v; } return o; }, {});
        // the CLI exits: the hub deletes the session (finishTeardown), the view stays open read-only (chat-view's own _setReadOnly)
        const readOnly = () => { if (setRO) setRO.call({ _readOnly: false, _chatInput: null, _showResumeBar() { }, _statusBar: bar }); };
        // `inFlight`: what the hub already sent (a press's answer, its broadcast) arrives AFTER the end
        let factsAtEnd = null, sawFacts = false;   // (the probe: did this bar ever take a declared status)
        const end = ({ inFlight = false } = {}) => { if (!inFlight) flush(); factsAtEnd = (declares() && active.has('cm')) ? MA.modelFacts(S) : null; active.delete('cm'); readOnly(); };
        const wall = () => { flush(); readOnly(); };                     // the sign-in wall: read-only, the CLI alive (the session kept)
        const gone = () => { flush(); active.delete('cm'); };            // the hub ended it; THIS page never saw the end (a second device)
        const pressOnly = (kind, m) => { if (kind === 'pick') bindArrow(pickSrc, bar)(m); else bindArrow(lockSrc, bar)({ stopPropagation() { } }); };   // no delivery yet
        const factsNow = () => ((declares() && active.has('cm')) ? MA.modelFacts(S) : null);
        return { S, bar, flush, deliver, seed, attach, init, reply, pick, offered, lock, read, savedCfg, end, wall, gone, pressOnly, factsNow };
      };
      const probes = {};
      let curDoor = null;
      // master's render over a cell's fields: a fresh bar of this row fed them through master's own roads (a status naming the model and
      // the lock, the served-model op, the model-lock op's mark)
      const twinOf = (f) => {
        const tb = new ChatStatusBar({ send() { } }, 'twin', { backend: row, getToolMsg: () => null, openSubagentViewer() { }, openInTempEditor() { }, onSearch() { }, onDesignRequest() { } });
        tb.applyStatus({ ...(f.s ? { model: f.s } : {}), modelLocked: f.l, lockedModel: f.t });
        if (f.v) tb.setServedModel(f.v);
        if (f.b) tb.applyStatus({ lockMoved: true });
        const c = chipOfBar(tb); tb.dispose?.(); return c;
      };
      const cell = (door, fn) => { curDoor = door; try { cells[door] = fn(); } catch (e) { cells[door] = { error: String(e && e.message || e).slice(0, 160) }; } };
      const live = (o) => { const w = world(o); w.seed(true); w.attach(row === 'claude' ? { model: A } : { model: A }); return w; };
      cell('reattach', () => live().read());
      cell('pick', () => { const w = live(); w.pick(B); return w.read(); });
      cell('pick-reply', () => { const w = live(); w.pick(B); w.reply(B); return w.read(); });
      cell('locked-pick', () => { const w = live({ locked: true }); w.pick(B); return w.read(); });
      cell('live-init', () => { const w = live(); w.init(C); return w.read(); });
      cell('view-only-attach', () => { const w = world({ live: false }); w.bar.applyStatus(statusOf(row, 'two')); return w.read(); });
      cell('transcript-route', () => { const w = world({ live: false }); w.bar.applyStatus(statusOf(row, 'two')); w.bar.applyStatus(statusOf(row, 'two')); return w.read(); });
      cell('withstatus-fetch', () => { const w = world({ live: false }); w.bar.applyStatus(statusOf(row, 'two')); return w.read(); });
      // a turn's cost op before any status named a model: its modelUsage's first key (chat-view's cost line → addCost)
      cell('cost-op', () => { const w = world(); w.bar.addCost(0.01, { [A]: { contextWindow: 200000 } }); return w.read(); });
      // ── round 11: a STOPPED conversation's view (no live session — the server answers nothing), every row ──
      cell('stopped-pick', () => { const w = world({ live: false }); w.bar.applyStatus(statusOf(row, 'two')); w.pick(C); expire(); return w.read({ cfg: w.savedCfg() }); });
      cell('stopped-lock', () => { const w = world({ live: false }); w.bar.applyStatus(statusOf(row, 'one')); const lockRow = w.offered(); if (lockRow) w.lock(); expire(); return w.read({ lockRow, cfg: w.savedCfg() }); });
      cell('stopped-unlock', () => { const w = world({ live: false }); w.bar.applyStatus({ ...statusOf(row, 'one'), modelLocked: true, lockedModel: A }); const lockRow = w.offered(); if (lockRow) w.lock(); expire(); return w.read({ lockRow, cfg: w.savedCfg() }); });
      // the Lock row on a LIVE window — by the harness's capability row (round 11's one ruled difference from master)
      cell('live-lock', () => { const w = live(); const lockRow = w.offered(); if (lockRow) w.lock(); return w.read({ lockRow, cfg: w.savedCfg() }); });
      // a pick whose ANSWER is lost (the conversation's broadcasts still arrive); its pending mark ends 8 s later
      cell('lost-answer', () => { const w = live({ dropAnswers: true }); w.pick(B); expire(); return w.read(); });
      // ── round 12: a conversation that ENDS while its window is open (it was live, held the facts, served A): then the presses ──
      const ended = (o) => { const w = live(o); w.reply(A); w.end(); return w; };
      cell('ended-pick', () => { const w = ended(); w.pick(B); expire(); return w.read({ cfg: w.savedCfg() }); });
      cell('ended-lock', () => { const w = ended(); const lockRow = w.offered(); if (lockRow) w.lock(); expire(); return w.read({ lockRow, cfg: w.savedCfg() }); });
      cell('ended-unlock', () => { const w = ended({ locked: true }); const lockRow = w.offered(); if (lockRow) w.lock(); expire(); return w.read({ lockRow, cfg: w.savedCfg() }); });
      // the ended bar starts from what it last SHOWED: a pick (B) answered and served, then the conversation ends
      cell('ended-after-pick', () => { const w = live(); w.pick(B); w.reply(B, 'r-after'); w.end(); expire(); return w.read(); });
      cell('ended-pick-lock', () => { const w = ended(); w.pick(B); expire(); const lockRow = w.offered(); if (lockRow) w.lock(); expire(); return w.read({ lockRow, cfg: w.savedCfg() }); });
      // the GAP (round 12, smaller 1): a resume that ASKS A (its saved pick), its first paint showing the record's last model (B), a Lock
      // pressed before the attach's facts — then the answer and the attach: the lock the server holds beside the config a resume reads
      cell('gap-lock', () => { const w = world({ spawn: A }); w.seed(false); w.bar.applyStatus(statusOf(row, 'two')); const lockRow = w.offered(); if (lockRow) w.lock(); w.flush(); w.attach(statusOf(row, 'two')); return w.read({ lockRow, cfg: w.savedCfg(), server: { locked: !!w.S._modelLocked, target: w.S._lockedModel || null } }); });
      // a LOCK answered by another model (round 12, smaller 2): locked on A, the CLI serves C
      cell('locked-above', () => { const w = live({ locked: true }); w.reply(C); return w.read(); });
      // a RESUME that asks for nothing: the first paint (the withStatus fetch), the live attach, the CLI's init, its first reply
      for (const [door, kind] of [['resume-2m', 'two'], ['resume-helper', 'helper']]) {
        let w = null;
        cell(`${door}@first-paint`, () => { w = world({ spawn: null }); w.bar.applyStatus(statusOf(row, kind)); return w.read(); });
        cell(`${door}@attach`, () => { w.seed(false); w.attach(statusOf(row, kind)); return w.read(); });
        cell(`${door}@init`, () => { w.init(LAST[kind]); return w.read(); });
        cell(`${door}@reply`, () => { w.reply(LAST[kind], 'r-next'); return w.read(); });
      }
      // a FRESH spawn on an ask (A): its attach (nothing reported yet), then its init naming the resolved id (A1)
      { let w = null;
        cell('fresh-init@attach', () => { w = world({ spawn: A }); w.seed(false); w.attach({}); return w.read(); });
        cell('fresh-init@init', () => { w.init(A1); return w.read(); }); }
      // ── round 13: round 12's failed scenes, on every row ──
      // a conversation that ends after a REAL fallback (A asked and served, then C) keeps its amber — plain and under a lock
      cell('ended-fallback', () => { const w = live(); w.reply(C); w.end(); return w.read(); });
      cell('ended-fallback-locked', () => { const w = live({ locked: true }); w.reply(C); w.end(); return w.read(); });
      // the SIGN-IN WALL: chat-view's own _setReadOnly while the CLI is alive — after a real fallback, then the next reply on the ask
      { let w = null;
        cell('wall@fallback', () => { w = live(); w.reply(C); w.wall(); return w.read(); });
        cell('wall@reply', () => { w.reply(A, 'r-wall'); return w.read(); }); }
      // a press IN FLIGHT when the conversation ends: the hub took its frame, what it sent back arrives after the end
      cell('ended-pending-pick', () => { const w = live(); w.reply(A); w.pressOnly('pick', B); w.end({ inFlight: true }); expire(); return w.read({ cfg: w.savedCfg() }); });
      cell('ended-pending-lock', () => { const w = live(); w.reply(A); const lockRow = w.offered(); if (lockRow) w.pressOnly('lock'); w.end({ inFlight: true }); expire(); return w.read({ lockRow, cfg: w.savedCfg() }); });
      // a REFUSED id after a Lock (Custom… «opus 5»): the hub's door refuses it
      cell('locked-refused-pick', () => { const w = live(); const lockRow = w.offered(); if (lockRow) w.lock(); w.pick('opus 5'); expire(); return w.read({ lockRow, cfg: w.savedCfg() }); });
      // the SECOND DEVICE that did not see the end: the hub deleted the session, this page never went read-only — then its presses
      cell('second-device-pick', () => { const w = live(); w.reply(A); w.gone(); w.pick(B); expire(); return w.read({ cfg: w.savedCfg() }); });
      cell('second-device-lock', () => { const w = live(); w.reply(A); w.gone(); const lockRow = w.offered(); if (lockRow) w.lock(); expire(); return w.read({ lockRow, cfg: w.savedCfg() }); });
      // a STALE frame: the facts as they stood before a pick, delivered after its answer (a root without facts has none to send)
      cell('stale-frame', () => { const w = live(); const old = w.factsNow(); w.pick(B); if (old) w.deliver({ type: 'msg', sessionId: 'cm', op: 'meta', subtype: 'model-facts', data: old }); return w.read(); });
      rows[row] = { modelFacts: modelFacts === true ? true : modelFacts === false ? false : null, cells, probes };
    }
    return { rows, servedOp };
  } finally {
    globalThis.document = doc0; globalThis.setTimeout = set0; globalThis.clearTimeout = clear0;
  }
}

// `node scripts/chip-matrix.mjs <root> [--write]` — prints the root's matrix; --write records it as master's oracle
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(process.argv[2] || '.');
  const out = await driveChipMatrix(root);
  let sha = null; try { sha = (await import('node:child_process')).execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { }
  const doc = { sha, doors: DOORS, rows: Object.fromEntries(Object.entries(out.rows).map(([r, v]) => [r, { modelFacts: v.modelFacts, cells: v.cells }])) };
  if (process.argv.includes('--write')) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    fs.writeFileSync(path.join(here, 'fixtures', 'chip-matrix-master.json'), JSON.stringify(doc, null, 1) + '\n');
    console.log('wrote scripts/fixtures/chip-matrix-master.json from', sha);
  } else console.log(JSON.stringify(doc, null, 1));
}
