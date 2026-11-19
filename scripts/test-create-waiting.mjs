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
  const b = WC.indexOf(BRANCH), sIdx = WC.indexOf(SEND), wIdx = WC.indexOf(WAIT);
  ok(WC.split(SEND).length === 2 && WC.split(WAIT).length === 2 && WC.split(BRANCH).length === 2 && b >= 0 && b < sIdx && sIdx < wIdx,
    'ws-create: in the mount-starting branch the `create-waiting` frame (reqId, cwd, the mount\'s name, the bound) goes out BEFORE the bounded wait');
}

/** a page on the stand-in hub with the REAL createSession; every create's handler and options are kept (no answer of its own) */
function page(install) {
  const H = hub(loadHandler(), DOC({ 'desk-v': [] }), { alive: [S, T] });
  const P = pageOn(H, install, 'desk-v', { attachMs: 60000 });
  class Life {} install(Life);
  for (const k of ['resumeSession', 'createSession', '_windowPending', '_snapshotWinBounds', '_placeCarried', '_reopenWin', '_reopenedAs', '_attachInRow', '_closeSecondView', '_markResume', '_closeFenced', '_fenceSays', '_winIs', '_pendingResumeWin', '_respawnAfterExit']) if (Life.prototype[k]) P.app[k] = Life.prototype[k].bind(P.app);
  Object.assign(P.app, { isMobile: false, _getBackendSessionDefaults: () => ({}), _viewIntoWindow: () => null });
  P.app.sidebar.getSessionConfig = () => ({}); P.app.sidebar._getSessionTasks = () => [];
  P.creates = [];
  P.app.ws.request = (m, cb, o = {}) => { if (m && m.type === 'create') P.creates.push({ m, cb, o }); return () => {}; };
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

const scene = async (inst, { answer = true, ms = 60000, again = 0 } = {}) => {
  const P = page(inst), t0 = life().length;
  P.app.resumeSession('fade0000-0000-4000-8000-0000000ce650', '/srv/nas/proj', 'Conv on the NAS', { backend: 'claude', backendSessionId: 'fade0000-0000-4000-8000-0000000ce650' });
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
  if (answer) c.cb({ type: 'created', sessionId: 'new-ce65', cwd: c.m.cwd, mode: 'chat', reqId: c.m.reqId });
  return { sent: true, P, t0, afterFrame, atWatchdog, answerNow: () => c.cb({ type: 'created', sessionId: 'new-ce65b', cwd: c.m.cwd, mode: 'chat', reqId: c.m.reqId }) };
};

console.log('② the page says what the create waits for, and the watchdog waits too');
{
  const g = await scene(install), r = await scene(installRed);
  ok(SRC.split(HANDLE).length === 2, 'the RED control\'s plant (the page\'s handling of the frame) is in session-lifecycle.js once');
  ok(g.sent && g.afterFrame.filter((x) => WAITING.test(x)).length === 1 && !g.atWatchdog.some((x) => LONG.test(x)),
    `the frame ⇒ ONE «Waiting for …» toast (${g.afterFrame.filter((x) => WAITING.test(x)).length}); the 15 s watchdog inside the hub's wait says nothing of «unusually long»`, g.atWatchdog);
  ok(r.sent && r.atWatchdog.some((x) => LONG.test(x)) && !r.afterFrame.some((x) => WAITING.test(x)),
    'RED (the page without the frame\'s handling): nothing said of the wait, and the generic «taking unusually long … reloading the tab abandons it» at 15 s while the hub still waits', r.atWatchdog);
  // the end of ②, two scenes in ONE wait (both must stay silent — a toast is the page's, not a create's, so only scenes that expect the
  // same can share a wait): the hub answered right after the watchdog; a re-sent create's second frame (a new 1.5 s bound) moved it again
  const g2 = await scene(install, { ms: 1 }), g4 = await scene(install, { ms: 1, answer: false, again: 1500 });
  await tick(2300);
  g4.answerNow();   // answered now: its re-moved watchdog stays silent (and says nothing into the next scene's wait)
  ok(g2.sent && g4.sent && !said(g2.t0).some((x) => LONG.test(x)), 'past the moved watchdog\'s first time: nothing said — the create the hub answered has ended, and the one whose second frame moved the deadline again is still inside its wait', said(g2.t0));
  const LSRC = SRC;
  ok(LSRC.split("        try { pending.set(words); } catch { }").length === 2 && LSRC.split("        if (endSaid && (endHow === 'created' || endHow === 'refused' || endHow === 'closed')) return;").length === 2,
    'PINS: the window\'s own line says the wait for its whole length (pending.set), and the moved watchdog is silent ONLY after the hub\'s answer or a closed window (a create lost with its socket still gets its words)');
  console.log('③ a create still unanswered after the wait: the watchdog\'s words then');
  const g3 = await scene(install, { answer: false, ms: 1 });
  const early = said(g3.t0).some((x) => LONG.test(x));
  await tick(2300);
  ok(g3.sent && !early && said(g3.t0).some((x) => LONG.test(x)), 'no answer by the end of the wait (+2 s) ⇒ «taking unusually long» then — the watchdog is moved, never lost', { early, after: said(g3.t0) });
}
report();
