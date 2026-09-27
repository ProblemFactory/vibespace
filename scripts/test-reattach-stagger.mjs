#!/usr/bin/env node
// THE OPS OF THE STAGGER WINDOW ARE HELD FOR THE REBUILD (B-63f1 ②, lane S1
// verify r2, 2026-09-26). After a server restart a page NOT reloaded re-attaches
// and gets an `attached` frame of a NEW epoch; the view defers the slab swap by
// 0–500 ms (the 2.338.0 stagger: N windows rebuilding in one tick froze the
// page). Every op the server emitted inside that window ran into the list the
// slab was about to REPLACE — and advanced the seq watermark — so `_fullViewReset`
// wiped them and no resume by seq ever replayed them (measured on real pages:
// 9 of 12 restarts on the lane build, 4 of 6 on master). Now `_onOp` queues while
// a rebuild is pending and the rebuild drains the queue AFTER the slab it
// post-dates. The real ChatView prototype over a fake ws + fake timers:
//   ① an epoch-changed `attached` arms ONE timer; ops inside the window are held
//      (not rendered, the watermark untouched); the rebuild renders the slab then
//      the held ops in order; the watermark = the last applied op
//   ② a held op the slab already describes (seq ≤ opSeq) is skipped, a create the
//      slab holds anyway dedups by id — nothing renders twice
//   ③ a `lagged` inside the window ⇒ a second `attached` of the same rebuild
//      supersedes the held snapshot: the view is rebuilt from the NEWER slab, the
//      ops it already holds are skipped, the view is whole
//   ④ a HELD resume arriving while pending has its replay queued; ops of another
//      epoch are not this slab's; dispose ends a pending rebuild; a queue past
//      the cap poisons the watermark instead of dropping a card
//   ⑤ CONTROL (scripts/mutant-copy.mjs): the pre-fix `_onOp` (no hold) — the ops
//      land in the old list and the reset wipes them; the ① leg goes red
// Run: node scripts/test-reattach-stagger.mjs (~0.5 s, no network)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

// ── fake timers: setTimeout/clearTimeout captured per leg, fired by hand ──
const timers = [];
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
globalThis.setTimeout = (fn, ms) => { const t = { fn, ms, dead: false }; timers.push(t); return t; };
globalThis.clearTimeout = (t) => { if (t && typeof t === 'object') t.dead = true; else realClearTimeout(t); };
// only the RESET timers are judged (≤ RESET_JITTER_MS): _reattach also arms its
// 20 s retry ladder and the 30 s input re-enable, which never fire here
const isReset = (t) => !t.dead && t.ms <= 500;
const fireTimers = () => { const due = timers.filter(isReset); for (const t of due) { t.dead = true; t.fn(); } return due.length; };
const pendingTimers = () => timers.filter(isReset);

const { ChatView } = await import(path.join(REPO, 'src/lib/chat-view.js'));

/** A view over the real prototype: rendering is a list of ids; loadHistory is the
 *  real one's contract at this level (the slab replaces the list, ids remembered,
 *  the meta's opSeq adopted by the real _applyLiveMeta). */
function mkView(Proto, { epoch = 'e1', lastSeq = 10 } = {}) {
  const sent = []; const handlers = [];
  const ws = { send(m) { sent.push(m); }, onGlobal(h) { handlers.push(h); }, offGlobal(h) { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); }, attachesInFlight: () => 0 };
  const v = Object.create(Proto);
  const rendered = [];
  Object.assign(v, {
    sessionId: 'sid-stagger', ws, app: {}, _readOnly: false, _disconnected: false, _disposed: false, _suspended: false,
    _normEpoch: epoch, _seqEpoch: epoch, _serverOpSeq: lastSeq, _lastSeq: lastSeq,
    _chatInput: { setDisconnected() { } }, _hideTyping() { }, _renderers: { appendSystem() { } }, _trace() { },
    _messages: [], _elements: new Map(), _renderedMsgIds: new Set(), _newMsgCount: 0, _total: 0, _windowStart: 0, _windowEnd: 0,
    _messageList: { querySelectorAll: () => [] }, _resetGapAfterJump() { }, _noteRecordKind() { }, _onServerStreamLabel() { }, applyStatus() { },
    _reattachCatchUp() { v.catchUps = (v.catchUps || 0) + 1; }, _attachSlabHint: () => 'floor', _onMeta(op) { v.metas = (v.metas || []).concat(op.subtype); },
    _onCreateMessage(m) { if (v._renderedMsgIds.has(m.id)) return; v._renderedMsgIds.add(m.id); v._messages.push(m); rendered.push(m.id); },
    _onEditMessage(id, fields) { const m = v._messages.find((x) => x.id === id); if (m) Object.assign(m, fields); v.edits = (v.edits || []).concat(id); },
    loadHistory(messages, total, isStreaming, meta) { v.loads = (v.loads || 0) + 1; for (const m of messages) v._onCreateMessage(m); v._total = total; v._windowEnd = total; if (meta) v._applyLiveMeta(meta); },
  });
  v.sent = sent; v.handlers = handlers; v.rendered = rendered;
  return v;
}
const op = (seq, id, extra = {}) => ({ type: 'msg', sessionId: 'sid-stagger', op: 'create', seq, message: { id, role: 'assistant', content: [{ type: 'text', text: id }] }, ...extra });
const editOp = (seq, id, fields) => ({ type: 'msg', sessionId: 'sid-stagger', op: 'edit', seq, id, fields });
const attached = (epoch, opSeq, ids, extra = {}) => ({ type: 'attached', sessionId: 'sid-stagger', normEpoch: epoch, opSeq, totalCount: ids.length, messages: ids.map((id) => ({ id, role: 'assistant', content: [{ type: 'text', text: id }] })), ...extra });
/** deliver a frame the way ws.js does: the permanent handler first (it stamps the epoch), then the temp one */
const deliver = (v, frame) => { if (frame.type === 'attached' && frame.normEpoch) v._normEpoch = frame.normEpoch; for (const h of [...v.handlers]) h(frame); };
const liveOp = (v, o) => { if (v._resetPending) { v._onOp(o); return; } v._onOp(o); };

function legs(Proto, label, expectFix = true) {
  const r = {};
  // ① the window: attached (new epoch) → ops → the timer fires → the slab, then the ops
  {
    timers.length = 0;
    const v = mkView(Proto);
    v._messages = [{ id: 'old-9' }, { id: 'old-10' }]; v._renderedMsgIds = new Set(['old-9', 'old-10']);
    v._reattach(true);
    deliver(v, attached('e2', 3, ['n1', 'n2', 'n3']));
    r.armed = pendingTimers().length === 1 && v._resetPending != null && v.loads === undefined;
    liveOp(v, op(4, 'n4')); liveOp(v, op(5, 'n5')); liveOp(v, editOp(6, 'n4', { edited: true }));
    r.heldNotRendered = !v.rendered.includes('n4') && !v.rendered.includes('n5') && v._messages.length === 2;
    r.watermarkUntouched = v._lastSeq === 10 && v._seqEpoch === 'e1';
    const fired = fireTimers();
    r.oneTimer = fired === 1 && pendingTimers().length === 0;
    r.slabThenOps = JSON.stringify(v._messages.map((m) => m.id)) === JSON.stringify(['n1', 'n2', 'n3', 'n4', 'n5']) && v._messages.find((m) => m.id === 'n4')?.edited === true;
    r.watermarkApplied = v._lastSeq === 6 && v._seqEpoch === 'e2' && v._serverOpSeq === 3;
    r.pendingCleared = v._resetPending == null && v._resetQueue == null;
    r.catchUps = v.catchUps || 0;
    r.leg1 = r.armed && r.heldNotRendered && r.watermarkUntouched && r.oneTimer && r.slabThenOps && r.watermarkApplied && r.pendingCleared && r.catchUps === 0;
  }
  // ② dedup: a held op the slab describes (seq ≤ opSeq) is skipped; a create whose id the slab holds anyway renders once
  {
    timers.length = 0;
    const v = mkView(Proto);
    v._reattach(true);
    // an op of the new epoch that arrived BEFORE its attached (the server's rebuild await) ran into the old list, tagged e1 — the slab holds it
    liveOp(v, op(1, 'n1'));
    deliver(v, attached('e2', 3, ['n1', 'n2', 'n3']));
    liveOp(v, op(3, 'n3'));           // ≤ opSeq: in the slab
    liveOp(v, op(4, 'n4'));           // > opSeq: this slab's follower
    liveOp(v, op(5, 'n2', {}));       // > opSeq but an id the slab holds (a replayed frame) — dedups by id
    fireTimers();
    const ids = v._messages.map((m) => m.id);
    r.noDouble = ids.length === new Set(ids).size && JSON.stringify(ids) === JSON.stringify(['n1', 'n2', 'n3', 'n4']);
    r.renderedOnce = v.rendered.filter((x) => x === 'n1').length === 2 /* once in the old list, once in the slab: the old list is WIPED between */ && v.rendered.filter((x) => x === 'n3').length === 1 && v.rendered.filter((x) => x === 'n2').length === 1;
    r.leg2 = r.noDouble && r.renderedOnce && v._lastSeq === 5;
  }
  // ③ a `lagged` inside the window: the second attached (same epoch, newer slab) supersedes; the view is whole
  {
    timers.length = 0;
    const v = mkView(Proto);
    v._reattach(true);
    deliver(v, attached('e2', 3, ['n1', 'n2', 'n3']));
    liveOp(v, op(4, 'n4')); liveOp(v, op(5, 'n5'));
    v._onLagged({ type: 'lagged', sessionId: 'sid-stagger', normEpoch: 'e2', seq: 5 });
    const frame = [...v.sent].reverse().find((m) => m.type === 'attach');
    r.laggedReattached = !!frame && frame.sinceEpoch === 'e1' && frame.sinceSeq === 10; // the view still holds e1's position: the server answers a full slab
    deliver(v, attached('e2', 6, ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']));   // the newer snapshot (built after n4..n6)
    liveOp(v, op(7, 'n7'));
    r.stillOneTimer = pendingTimers().length === 1 && v._resetPending && v._resetPending.opSeq === 6;
    fireTimers();
    const ids = v._messages.map((m) => m.id);
    r.wholeAfterLagged = JSON.stringify(ids) === JSON.stringify(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']) && ids.length === new Set(ids).size && v.loads === 1;
    r.leg3 = r.laggedReattached && r.stillOneTimer && r.wholeAfterLagged && v._lastSeq === 7 && (v.catchUps || 0) === 0;
  }
  // ④ a HELD resume while pending queues its replay; foreign-epoch ops are not this slab's; dispose; the cap
  {
    timers.length = 0;
    const v = mkView(Proto);
    v._reattach(true);
    deliver(v, attached('e2', 3, ['n1', 'n2', 'n3']));
    liveOp(v, op(4, 'n4'));
    v._reattach(false);
    deliver(v, { type: 'attached', sessionId: 'sid-stagger', normEpoch: 'e2', opSeq: 5, slab: 'held', replay: [op(5, 'n5')] });
    fireTimers();
    r.heldQueued = JSON.stringify(v._messages.map((m) => m.id)) === JSON.stringify(['n1', 'n2', 'n3', 'n4', 'n5']) && v.loads === 1;
    // a second restart inside the window: ops tagged e2 are dropped by the e3 slab
    const w = mkView(Proto);
    w._reattach(true);
    deliver(w, attached('e2', 3, ['n1', 'n2', 'n3']));
    liveOp(w, op(4, 'n4'));
    w._reattach(false);
    deliver(w, attached('e3', 2, ['m1', 'm2']));
    liveOp(w, op(3, 'm3'));
    fireTimers();
    r.foreignDropped = JSON.stringify(w._messages.map((m) => m.id)) === JSON.stringify(['m1', 'm2', 'm3']) && w._lastSeq === 3 && w._seqEpoch === 'e3';
    // dispose ends a pending rebuild
    const d = mkView(Proto);
    d._reattach(true);
    deliver(d, attached('e2', 3, ['n1']));
    liveOp(d, op(4, 'n4'));
    d._disposed = true; if (d._resetTimer) { clearTimeout(d._resetTimer); d._resetTimer = null; } d._resetPending = null; d._resetQueue = null; // what dispose() does (its DOM teardown is not runnable here)
    r.disposeEnds = fireTimers() === 0 && d.loads === undefined;
    // the cap: a queue past RESET_QUEUE_CAP poisons the watermark, never drops silently
    const c = mkView(Proto);
    c._reattach(true);
    deliver(c, attached('e2', 3, ['n1']));
    for (let i = 0; i < 10001; i++) liveOp(c, op(4 + i, 'x' + i));
    r.capPoisons = c._seqPoisoned === true && (c._resetQueue || []).length === 10000;
    const sentBefore = c.sent.length;
    fireTimers();
    // verify r2: the rebuild's own heal (`_seqPoisoned = false` after the slab) must NOT
    // clear an overflow — the op past the cap was never held, so the view is not whole:
    // poisoned again after the drain + an attach asking for NO seq (the full rung heals it)
    const healAttach = c.sent.slice(sentBefore).find((m) => m.type === 'attach');
    r.capStaysPoisoned = c._seqPoisoned === true && !!healAttach && healAttach.sinceSeq === undefined && c._resetOverflow === false;
    // a rebuild that THROWS poisons the watermark (the ops held for it are gone with it)
    const x = mkView(Proto);
    x._reattach(true);
    deliver(x, attached('e2', 3, ['n1']));
    liveOp(x, op(4, 'n4'));
    x.loadHistory = () => { throw new Error('render failed'); };
    let threw = false; try { fireTimers(); } catch { threw = true; }
    r.throwPoisons = threw && x._seqPoisoned === true && x._resetPending == null;
    r.leg4 = r.heldQueued && r.foreignDropped && r.disposeEnds && r.capPoisons && r.capStaysPoisoned && r.throwPoisons;
  }
  if (!expectFix) return r;
  ok(`${label} ① an epoch-changed attached arms ONE timer; the ops inside the window are held (not rendered, watermark untouched)`, r.armed && r.heldNotRendered && r.watermarkUntouched && r.oneTimer, r);
  ok(`${label} ① …the rebuild renders the slab, then the held ops IN ORDER (an edit lands on its create); the watermark = the last applied op; nothing pending, no catch-up`, r.slabThenOps && r.watermarkApplied && r.pendingCleared && r.catchUps === 0, r);
  ok(`${label} ② a held op the slab already describes (seq ≤ opSeq) is skipped and a create the slab holds dedups by id — nothing renders twice`, r.leg2, r);
  ok(`${label} ③ a lagged inside the window re-attaches from the OLD position (a full slab, never a held resume), the newer snapshot supersedes, the view is whole with one rebuild`, r.leg3, r);
  ok(`${label} ④ a held resume while pending queues its replay; ops of another epoch are not this slab's; dispose ends the rebuild; a queue past the cap poisons the watermark`, r.heldQueued && r.foreignDropped && r.disposeEnds && r.capPoisons, r);
  ok(`${label} ④ (r2) …and the overflow SURVIVES the rebuild's heal: poisoned after the drain + an attach with no seq (the full rung heals it); a rebuild that throws poisons the watermark`, r.capStaysPoisoned && r.throwPoisons, { capStaysPoisoned: r.capStaysPoisoned, throwPoisons: r.throwPoisons });
  return r;
}

console.log('① – ④ the real ChatView prototype over a fake ws + fake timers');
const fixed = legs(ChatView.prototype, 'fix');

console.log('⑤ the jitter seam + wiring');
{
  const v = mkView(ChatView.prototype);
  const j = Array.from({ length: 50 }, () => v._resetJitterMs());
  ok('⑤ _resetJitterMs() = 0–500 ms (the 2.338.0 stagger is kept; a suite pins it to its maximum through the seam)', j.every((x) => x >= 0 && x < 500) && new Set(j).size > 1);
  timers.length = 0;
  v._resetJitterMs = () => 500;
  v._reattach(true);
  deliver(v, attached('e2', 1, ['n1']));
  ok('⑤ the timer is armed with the seam\'s value', pendingTimers().length === 1 && pendingTimers()[0].ms === 500);
  fireTimers();
  const cv = read('src/lib/chat-view.js');
  ok('⑤ wiring: _onOp holds while a rebuild is pending — the FIRST thing it does', /_onOp\(op\) \{\s*\n(\s*\/\/.*\n)*\s*if \(this\._resetPending\) \{ this\._holdResetOp\(op\); return; \}/.test(cv));
  ok('⑤ wiring: the epoch branch arms the reset (and a pending one re-arms with the newer snapshot); no bare setTimeout(_fullViewReset) is left', /if \(epochChanged \|\| this\._resetPending\) \{[\s\S]*?this\._armViewReset\(msg\);/.test(cv) && !/setTimeout\(\(\) => \{ if \(!this\._disposed\) this\._fullViewReset\(msg\); \}/.test(cv));
  ok('⑤ wiring: _fullViewReset consumes the pending state FIRST and drains AFTER loadHistory (the slab it post-dates)', (() => { const a = cv.indexOf('  _fullViewReset(msg) {'); const b = cv.indexOf('this._resetPending = null;', a); const c = cv.indexOf('this.loadHistory(msg.messages || [], msg.totalCount || 0, msg.isStreaming, msg);', a); const d = cv.indexOf('this._drainResetQueue(held, msg);', a); return a > 0 && b > a && c > b && d > c; })());
  ok('⑤ wiring: dispose ends a pending rebuild', /if \(this\._resetTimer\) \{ clearTimeout\(this\._resetTimer\); this\._resetTimer = null; \}[^\n]*\n\s*this\._resetPending = null; this\._resetQueue = null;/.test(cv.slice(cv.indexOf('  dispose() {'))));
}

console.log('⑥ CONTROL: the pre-fix _onOp (no hold) — the ops of the window land in the list the slab replaces');
{
  const M = mutantCopies('reattach-stagger', REPO);
  const src = read('src/lib/chat-view.js');
  const needle = '    if (this._resetPending) { this._holdResetOp(op); return; }\n';
  ok('⑥ the patch site exists', src.includes(needle));
  const mut = M.write('src/lib/chat-view.js', src.replace(needle, ''), 'no-hold');
  const { ChatView: Mut } = await import(pathToFileURL(mut).href);
  const r = legs(Mut.prototype, '⑥ mutant', false);
  ok('⑥ CONTROL: without the hold the window\'s ops are rendered into the OLD list, the watermark moves, and the rebuild WIPES them (the measured loss) — leg ① can go red', r.heldNotRendered === false && r.watermarkUntouched === false && r.slabThenOps === false, r);
  ok('⑥ CONTROL: …and the lagged-in-window leg is not whole either', r.wholeAfterLagged === false, r);
  // ⑥b (r2): the rebuild's heal clearing an overflow (the pre-r2 shape) — the ④ (r2) leg can go red
  const needle2 = '    if (overflow) {\n      this._seqPoisoned = true;';
  ok('⑥b the overflow-heal patch site exists', src.includes(needle2));
  const mut2 = M.write('src/lib/chat-view.js', src.replace(needle2, '    if (false) {\n      this._seqPoisoned = true;'), 'overflow-cleared');
  const { ChatView: Mut2 } = await import(pathToFileURL(mut2).href);
  const r2 = legs(Mut2.prototype, '⑥b mutant', false);
  ok('⑥b CONTROL: without the overflow re-poison the heal clears the flag and no heal attach is sent — the dropped op is lost with a clean watermark', r2.capStaysPoisoned === false && r2.capPoisons === true, { capStaysPoisoned: r2.capStaysPoisoned });
  for (const row of copiesCensus(M.files, M.dir, REPO, { label: '⑥ ' })) ok(row.name, row.pass, row.detail);
}

globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
console.log(`\n${fail ? '✗' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
