#!/usr/bin/env node
// test-create-waiting.mjs — B-ce65 (lane hub-loop-stalls; the B-864f follow-up): a create the hub holds up to BACK_MS (45 s) while
// its folder's mount comes up (src/server/cwd-wait.js whenBack, src/ws-create.js) SAYS SO. The page showed only its generic 15 s
// reply-watchdog toast («taking unusually long … reloading the tab abandons it») while the hub was still waiting on purpose.
//   ① the hub's frame: ws-create sends `create-waiting` {reqId, cwd, waitsFor, ms} in the mount-starting branch BEFORE it awaits
//      whenBack (a pin of the order, its plant checked)
//   ② THE PAGE (the REAL session-lifecycle createSession on layout-dup-world's stand-in hub): the frame ⇒ ONE «Waiting for …» toast
//      (a second frame says nothing more); the 15 s watchdog INSIDE that wait says nothing; the hub's answer then ⇒ nothing said
//      ever (the create ended); RED CONTROL the page without the frame's handling (a copy through anchored()) ⇒ the generic toast
//      at the watchdog, inside the wait
//   ③ a create still unanswered once the wait (+2 s) is over ⇒ the watchdog's words then: the watchdog is only moved, never lost
//   ④ ITS READ (B-ce65 TAKEN with smalls): the hub's `done` frame puts the window line back to its own words (RED: the line keeps
//      «Waiting for …»); a frame AFTER the watchdog spoke takes its toast away (RED: it stays); a create ended by an unnamed error then
//      CLOSED stays silent (RED: the silence rule that read only the first end ⇒ the toast into a closed window), and one ended by an
//      unnamed error alone still gets the watchdog's words — the same for a create ended LOST (a resume its harness does not re-send, whose socket
//      dropped and came back: driven through the rig's hang-up and reconnect), closed or not, and one the hub ANSWERED after an unnamed error
//      stays silent (RED: the answer counted only as the first end); a frame after the watchdog spoke arms it again, so a hub that
//      then dies is said (RED: no re-arm), and the done frame re-times a moved watchdog to its new deadline (RED: the old one); the
//      mount_down refusal carries its DOOR — «Show in Remote» opens the sidebar through its one show door (`_railShow`) and asks for
//      the mount's row until the panel has drawn it (RED: no door); the frame-before-wait order's check goes red on a copy with the
//      order swapped
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import fs from 'node:fs';
import path from 'node:path';
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { REPO, tick, S, T, DOC, hub, loadHandler, pageOn, loadLifecycle } from './layout-dup-world.mjs';

const { ok, report } = checker();
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('① the hub says it waits, before it waits');
{
  const WC = read('src/ws-create.js');
  const SEND = "ws.send(JSON.stringify({ type: 'create-waiting', reqId: data.reqId, cwd, waitsFor: w.name, ms: CW.BACK_MS }));";
  const BRANCH = "if (w && w.why === 'mount_starting') {", WAIT = 'if (await CW.whenBack(cwd)) missing = await dirMissing();';
  const DONE = "ws.send(JSON.stringify({ type: 'create-waiting', reqId: data.reqId, cwd, waitsFor: w.name, done: true }));";
  const orderOk = (src) => { const b = src.indexOf(BRANCH), sIdx = src.indexOf(SEND), wIdx = src.indexOf(WAIT), dIdx = src.indexOf(DONE); return src.split(SEND).length === 2 && src.split(WAIT).length === 2 && src.split(BRANCH).length === 2 && src.split(DONE).length === 2 && b >= 0 && b < sIdx && sIdx < wIdx && wIdx < dIdx; };
  const swapped = anchored(anchored(WC, SEND + '\n', '', 'ce65-order: the frame out'), WAIT, WAIT + '\n                ' + SEND, 'ce65-order: the frame after the wait');
  ok(orderOk(WC) && !orderOk(swapped),
    'ws-create: in the mount-starting branch the `create-waiting` frame (reqId, cwd, the mount\'s name, the bound) goes out BEFORE the bounded wait, and its `done` frame after it; RED (a copy with the frame moved after the wait): the check says so');
}

/** a page on the stand-in hub with the REAL createSession; every create's handler and options are kept (no answer of its own) */
function page(install) {
  const H = hub(loadHandler(), DOC({ 'desk-v': [] }), { alive: [S, T] });
  const P = pageOn(H, install, 'desk-v', { attachMs: 60000 });
  class Life {} install(Life);
  for (const k of ['resumeSession', 'createSession', '_openMountsAt', '_windowPending', '_snapshotWinBounds', '_placeCarried', '_reopenWin', '_reopenedAs', '_attachInRow', '_closeSecondView', '_markResume', '_closeFenced', '_fenceSays', '_winIs', '_pendingResumeWin', '_respawnAfterExit']) if (Life.prototype[k]) P.app[k] = Life.prototype[k].bind(P.app);
  Object.assign(P.app, { isMobile: false, _getBackendSessionDefaults: () => ({}), _viewIntoWindow: () => null });
  P.app.sidebar.getSessionConfig = () => ({}); P.app.sidebar._getSessionTasks = () => [];
  P.creates = []; P.lines = [];
  P.app.ws.request = (m, cb, o = {}) => { if (m && m.type === 'create') P.creates.push({ m, cb, o }); return () => {}; };
  const wp = P.app._windowPending; P.app._windowPending = (w, text) => { P.lines.push(text); const r = wp(w, text); return { set: (x) => { P.lines.push(x); r.set(x); }, remove: () => r.remove() }; };   // the window's own line, recorded
  return P;
}
// the lifecycle's toasts: its showToast is a stub of the rig that RECORDS each text (globalThis.__lifeToasts, as test-layout-dup-storm reads it)
const life = () => (globalThis.__lifeToasts ||= []);
const said = (t0) => life().slice(t0).map(String);
const WAITING = /^Waiting for /, LONG = /taking unusually long/;

const SRC = read('src/lib/session-lifecycle.js');
const install = await loadLifecycle();
const HANDLE = "      if (msg.type === 'create-waiting' && msg.reqId === reqId) {";
const installRed = await loadLifecycle(anchored(SRC, HANDLE, "      if (false && msg.type === 'create-waiting' && msg.reqId === reqId) {", 'ce65-no-waiting'));
// ④'s SEAM: the rig's showToast stub records the text only — a copy whose toasts go to a recorder that keeps the options (the door) and
// the removal (every call site through anchored(), count «any»)
const seamToasts = [];
globalThis.__ce65Toast = (tag) => (m, o = {}) => { const r = { tag, m: String(m), o, removed: false }; seamToasts.push(r); return { remove() { r.removed = true; } }; };
const seamed = (src, tag) => loadLifecycle(anchored(src, 'showToast(', `globalThis.__ce65Toast(${JSON.stringify(tag)})(`, tag, { count: 'any' }));
const toastsOf = (tag) => seamToasts.filter((x) => x.tag === tag);

const scene = async (inst, { answer = true, ms = 60000, again = 0, unnamedError = false, close = false, lost = false, backend = 'claude' } = {}) => {
  const P = page(inst), t0 = life().length, ends = [];
  P.app.resumeSession('fade0000-0000-4000-8000-0000000ce650', '/srv/nas/proj', 'Conv on the NAS', { backend, backendSessionId: 'fade0000-0000-4000-8000-0000000ce650', onCreateEnd: (how) => ends.push(how) });
  await tick(20);
  const c = P.creates[0];
  if (!c) return { sent: false };
  const frame = { type: 'create-waiting', reqId: c.m.reqId, cwd: c.m.cwd, waitsFor: 'NAS share', ms };
  c.cb(frame); c.cb(frame);   // the hub's frame (twice: said once)
  const afterFrame = said(t0);
  c.o.onTimeout && c.o.onTimeout();   // the 15 s reply watchdog fires — inside the hub's wait
  await tick(20);
  const atWatchdog = said(t0);
  if (again) c.cb({ ...frame, ms: again });   // a re-sent create's second wait: its frame moves the deadline again
  if (unnamedError) c.cb({ type: 'error', message: 'Failed to spawn session' });   // an error naming no request: an end of its own
  if (lost) { P.hangUp(); P.reconnect(); }   // the socket drops and comes back: a resume the harness does not re-send ends «lost» (the rig's rows re-send none; the backend is a label)
  if (close) { P.app._winIs = () => false; c.o.isAlive && c.o.isAlive(); }   // the window is closed now (the request's own isAlive reads it)
  if (answer) c.cb({ type: 'created', sessionId: 'new-ce65', cwd: c.m.cwd, mode: 'chat', reqId: c.m.reqId });
  return { sent: true, P, c, t0, ends, afterFrame, atWatchdog, answerNow: () => c.cb({ type: 'created', sessionId: 'new-ce65b', cwd: c.m.cwd, mode: 'chat', reqId: c.m.reqId }) };
};

console.log('② the page says what the create waits for, and the watchdog waits too');
{
  const g = await scene(install), r = await scene(installRed);
  ok(SRC.split(HANDLE).length === 2, 'the RED control\'s plant (the page\'s handling of the frame) is in session-lifecycle.js once');
  ok(g.sent && g.afterFrame.filter((x) => WAITING.test(x)).length === 1 && !g.atWatchdog.some((x) => LONG.test(x)),
    `the frame ⇒ ONE «Waiting for …» toast (${g.afterFrame.filter((x) => WAITING.test(x)).length}); the 15 s watchdog inside the hub's wait says nothing of «unusually long»`, g.atWatchdog);
  ok(r.sent && r.atWatchdog.some((x) => LONG.test(x)) && !r.afterFrame.some((x) => WAITING.test(x)),
    'RED (the page without the frame\'s handling): nothing said of the wait, and the generic «taking unusually long … reloading the tab abandons it» at 15 s while the hub still waits', r.atWatchdog);
  // THE TIMED SCENES, in two waits (a toast is the page's, not a create's: a wait groups scenes that expect the SAME, and counts tell
  // them apart): A — every scene silent; B — every scene speaks once
  const SILENCE = "        if (winClosed || answered) return;";
  const installOldSilence = await loadLifecycle(anchored(SRC, SILENCE, "        if (endSaid && (endHow === 'created' || endHow === 'refused' || endHow === 'closed')) return;", 'ce65-first-end-only'));   // stale-pins: kept — the RED copy plants the release's first-end-only rule back
  const installEndFirst = await loadLifecycle(anchored(SRC, SILENCE, "        if (winClosed || (endSaid && (endHow === 'created' || endHow === 'refused'))) return;", 'ce65-answer-after-end'));   // stale-pins: kept — the RED copy: the hub's answer counted only when it was the FIRST end
  const tA = life().length;
  const g2 = await scene(install, { ms: 1 }), g4 = await scene(install, { ms: 1, answer: false, again: 1500 }), g6 = await scene(install, { ms: 1, answer: false, unnamedError: true, close: true });
  const gl6 = await scene(install, { ms: 1, answer: false, backend: 'opencode', lost: true, close: true });
  const g7 = await scene(install, { ms: 1, unnamedError: true });   // an unnamed error (another create's), then THIS create's answer
  await tick(2300);
  g4.answerNow();   // answered now: its re-moved watchdog stays silent (and says nothing into the next wait)
  const longA = said(tA).filter((x) => LONG.test(x)).length;
  ok(g2.sent && g4.sent && g6.sent && gl6.sent && g7.sent && gl6.ends[0] === 'lost' && g7.ends[0] === 'error' && longA === 0, `past the moved watchdog's first time: nothing said (${longA}) — the create the hub answered ended; the one whose second frame moved the deadline is inside its wait; the one ended by an unnamed error and then CLOSED stays silent; the one ended LOST (its socket dropped and came back: ${gl6.ends.join('/')}) and then CLOSED stays silent; the one the hub ANSWERED after an unnamed error (${g7.ends.join('/')}) stays silent`, { said: said(tA), lostEnds: gl6.ends });
  console.log('③ a create still unanswered after the wait: the watchdog\'s words then (and ④\'s late scenes, in the SAME wait)');
  // EVERY copy is built first (a bundle each), so the timed scenes then start back to back — none of their timers fires early
  const REPL = "        if (watchToast) { try { watchToast.remove(); } catch { } watchToast = null; }   // its read (2): a frame AFTER the watchdog spoke replaces its words";
  const REARM = "        if (spoke || movedTimer) movedWatchdog();   // …and the watchdog watches the new wait: a hub that dies in it is still said (the 15 s timer fires once)";
  const DONE13 = 'waitsUntil = Date.now() + 13000;', RETIME = ' if (movedTimer) movedWatchdog(); }';
  const DOOR = "        else if (msg.code === 'mount_down' && msg.waitsFor && !msg.held) showToast(text, { type: 'error', action: { label: t('Show in Remote'), run: () => this._openMountsAt(msg.waitsFor) } });";   // (r3360: a held list's refusal names no mount to open)
  const start = async (inst, n) => { const P = page(inst); P.app.resumeSession(`fade0000-0000-4000-8000-0000000ce65${n}`, '/srv/nas/proj', 'Conv', { backend: 'claude', backendSessionId: `fade0000-0000-4000-8000-0000000ce65${n}` }); await tick(20); return { P, c: P.creates[0] }; };
  const fr = (c, ms) => c.cb({ type: 'create-waiting', reqId: c.m.reqId, cwd: c.m.cwd, waitsFor: 'NAS share', ms });
  const FAST = 'waitsUntil = Date.now() + 300;';
  const instLate = await seamed(SRC, 'late'), instLateR2 = await seamed(anchored(SRC, REPL, '', 'ce65-no-replace'), 'late-r2'), instLateR3 = await seamed(anchored(SRC, REARM, '', 'ce65-no-rearm'), 'late-r3');
  const instDone = await seamed(anchored(SRC, DONE13, FAST, 'done-fast'), 'done'), instDoneR = await seamed(anchored(anchored(SRC, DONE13 + RETIME, DONE13 + ' }', 'ce65-no-retime'), DONE13, FAST, 'done-r-fast'), 'done-r');
  const instDoorR = await seamed(anchored(SRC, DOOR, '', 'ce65-no-door'), 'door-r');
  // ④'s LATE SCENES (each copy's toasts carry its tag, apart from ③'s counts): (a) the watchdog speaks (no frame yet), then the frame
  // (a 1 ms wait) and the hub never answers ⇒ its first words taken away, and the watchdog speaks AGAIN after the new wait; (b) a frame
  // (60 s), the 15 s timer (moved), then the done frame — in a copy whose done deadline is 0.3 s, not 13 s — ⇒ it speaks at the NEW
  // deadline; (c) the refusal's door, its row asked for while the wait runs
  const late = async (inst) => { const { c } = await start(inst, 2); c.o.onTimeout(); await tick(10); fr(c, 1); };
  const done = async (inst) => { const { c } = await start(inst, 4); fr(c, 60000); c.o.onTimeout(); await tick(10); c.cb({ type: 'create-waiting', reqId: c.m.reqId, cwd: c.m.cwd, waitsFor: 'NAS share', done: true }); };
  const door = async (inst) => { const { P, c } = await start(inst, 3), s0 = seamToasts.length, shown = [], looks = []; P.app.sidebar._railShow = (id) => shown.push(id); P.app.sidebar._focusMountRow = (name) => { looks.push(name); return looks.length >= 3; }; c.cb({ type: 'error', reqId: c.m.reqId, code: 'mount_down', cwd: c.m.cwd, waitsFor: 'NAS share', message: 'the folder is on NAS share, which is not mounted right now' }); const t = seamToasts.slice(s0).find((x) => x.o && x.o.type === 'error'); if (t && t.o.action) t.o.action.run(); return { label: t && t.o.action && t.o.action.label, shown, looks }; };
  const tB = life().length;
  const g3 = await scene(install, { answer: false, ms: 1 }), g5 = await scene(install, { answer: false, ms: 1, unnamedError: true }), r6 = await scene(installOldSilence, { ms: 1, answer: false, unnamedError: true, close: true });
  const l5 = await scene(install, { ms: 1, answer: false, backend: 'opencode', lost: true }), rl6 = await scene(installOldSilence, { ms: 1, answer: false, backend: 'opencode', lost: true, close: true });
  const r7 = await scene(installEndFirst, { ms: 1, unnamedError: true });
  const dr = await door(instLate), drr = await door(instDoorR);
  await done(instDone); await done(instDoneR);
  await late(instLate); await late(instLateR2); await late(instLateR3);   // last: the earliest second speech is 2 s after these
  const longs = (tag) => toastsOf(tag).filter((x) => LONG.test(x.m));
  const early = said(tB).some((x) => LONG.test(x)), before = { late: longs('late').length, done: longs('done').length };
  await tick(2600);
  const longB = said(tB).filter((x) => LONG.test(x)).length;
  ok(SRC.split(SILENCE).length === 2 && g3.sent && g5.sent && r6.sent && l5.sent && rl6.sent && l5.ends[0] === 'lost' && rl6.ends[0] === 'lost' && r7.sent && !early && longB === 6, `the wait (+2 s) over: «taking unusually long» ${longB} times — the unanswered create, the one ended by an unnamed error, the one ended LOST with its window open (${l5.ends.join('/')}), and RED (the silence rule that read only the FIRST end) the closed windows' after an unnamed error and after a lost socket (${rl6.ends.join('/')}), and RED (the answer counted only as the FIRST end) the create answered after an unnamed error — a false «unusually long» on a running session — 6`, { early, longB, lostEnds: [l5.ends, rl6.ends] });

  console.log('④ its read: the wait\'s end, a frame after the watchdog, the refusal\'s door');
  const DONEH = "      if (msg.type === 'create-waiting' && msg.reqId === reqId && msg.done) {";
  const lineOf = async (inst) => { const P = page(inst); P.app.resumeSession('fade0000-0000-4000-8000-0000000ce651', '/srv/nas/proj', 'Conv', { backend: 'claude', backendSessionId: 'fade0000-0000-4000-8000-0000000ce651' }); await tick(20); const c = P.creates[0]; c.cb({ type: 'create-waiting', reqId: c.m.reqId, cwd: c.m.cwd, waitsFor: 'NAS share', ms: 60000 }); const mid = P.lines[P.lines.length - 1]; c.cb({ type: 'create-waiting', reqId: c.m.reqId, cwd: c.m.cwd, waitsFor: 'NAS share', done: true }); return { mid, last: P.lines[P.lines.length - 1], first: P.lines[0] }; };
  const ln = await lineOf(install), lnr = await lineOf(await loadLifecycle(anchored(SRC, DONEH, "      if (false && msg.type === 'create-waiting' && msg.reqId === reqId && msg.done) {", 'ce65-no-done')));
  ok(WAITING.test(String(ln.mid)) && ln.last === ln.first && !WAITING.test(String(ln.last)) && WAITING.test(String(lnr.last)), `the window line: «${String(ln.mid).slice(0, 30)}…» during the wait, back to «${ln.last}» at the hub's done; RED (no done handling): «${String(lnr.last).slice(0, 30)}…» stays`);
  const L = longs('late'), L2 = longs('late-r2'), L3 = longs('late-r3'), D = longs('done'), Dr = longs('done-r');
  ok(SRC.split(REPL).length === 2 && L.length === 2 && L[0].removed === true && L[1].removed === false && toastsOf('late').some((x) => WAITING.test(x.m)) && L2.length === 2 && L2[0].removed === false,
    `a frame AFTER the watchdog spoke: its «unusually long» toast is taken away (${L[0] && L[0].removed}) and the waiting words said; RED (no removal): both stand (${L2[0] && L2[0].removed})`);
  ok(SRC.split(REARM).length === 2 && before.late === 1 && L.length === 2 && L3.length === 1,
    `…and the hub never answers: the watchdog speaks AGAIN after the new wait (${L.length} in all); RED (no re-arm — the 15 s timer fires once): ${L3.length}`);
  ok(SRC.split(DONE13 + RETIME).length === 2 && before.done === 0 && D.length === 1 && Dr.length === 0,
    `the done frame after a moved watchdog: it speaks at the NEW deadline (${D.length}, the copy's 0.3 s + 2 s); RED (no re-time): ${Dr.length} — it waits for the old 60 s + 2 s`);
  ok(SRC.split(DOOR).length === 2 && dr.label === 'Show in Remote' && dr.shown.join() === 'mounts' && dr.looks.length === 3 && dr.looks.every((x) => x === 'NAS share') && !drr.label,
    `the mount_down refusal names its door: «${dr.label}» opens the sidebar through its one show door on ${dr.shown.join()} and asks for the mount's row until the panel has drawn it (${dr.looks.length} asks, then stops); RED (no door): ${drr.label || 'no button'}`);
  // the REAL row ask (sidebar-mounts' two methods, run over a stand-in document): the mount's row, else the machine's by the hub's
  // name for it (name, else host, else id), and false while nothing is drawn; RED: a copy without the machine's road
  const FOCUS_A = '    _focusMountRow(name) {', FOCUS_B = '    _showAddHostDialog(hd, from = null) {';
  const SBM = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  const FOCUS = SBM.slice(SBM.indexOf(FOCUS_A), SBM.indexOf(FOCUS_B));
  const MROAD = '      this._focusHostRow(h.id);\n      return true;';
  const rowOf = (ds) => { const r = { dataset: ds, seen: 0, marks: new Set(), scrollIntoView() { r.seen++; }, classList: { add: (k) => r.marks.add(k), remove: (k) => r.marks.delete(k) } }; return r; };
  const focus = (src, rows, hosts, name) => { const doc = { querySelectorAll: (sel) => rows.filter((r) => (sel.includes('data-mount-name') && r.dataset.mountName != null) || (sel.includes('data-host-id') && r.dataset.hostId != null)) }; const o = new Function('document', 'setTimeout', `return {${src}};`)(doc, () => 0); o._hostsData = { hosts }; return o._focusMountRow(name); };
  const mRow = rowOf({ mountName: 'NAS share' }), hRow = rowOf({ hostId: 'h1' }), hRow2 = rowOf({ hostId: 'h2' });
  const HOSTS = [{ id: 'h1', name: 'gpu box' }, { id: 'h2', host: 'build.lan' }];
  const f1 = focus(FOCUS, [mRow, hRow, hRow2], HOSTS, 'NAS share'), f2 = focus(FOCUS, [mRow, hRow, hRow2], HOSTS, 'gpu box'), f3 = focus(FOCUS, [mRow, hRow, hRow2], HOSTS, 'build.lan'), f4 = focus(FOCUS, [], HOSTS, 'NAS share');
  const f2r = focus(anchored(FOCUS, MROAD, '      return false;', 'ce65-no-machine-road'), [mRow, hRow], HOSTS, 'gpu box');
  ok(FOCUS.includes(MROAD) && f1 === true && mRow.seen === 1 && mRow.marks.has('need-focus') && f2 === true && hRow.seen === 1 && f3 === true && hRow2.seen === 1 && f4 === false && f2r === false,
    `the row ask: the mount's row shown and marked (${f1}), the machine's by its name (${f2}) or its host (${f3}), nothing drawn yet ⇒ ${f4} (asked again); RED (no machine road): ${f2r}`);
  ok(SBM.split("      row.dataset.mountName = m.name || '';").length === 2, 'PIN: every mount row carries its name (the door brings THAT row into view)');
}
report();
