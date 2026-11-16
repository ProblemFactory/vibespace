#!/usr/bin/env node
// test-resume-all-paced.mjs — lane resume-all-paced, L1 (主开发 2026-11-16 18:13Z; the field incident: after a restart the boot
// offer's «Resume all» fired one resume every 400 ms on a fixed clock whatever the hub answered — 68 creates in five minutes, the
// hub's loop held 10–139 s, its liveness probe restarted it; the sidebar's group button fired every resume in ONE loop).
// THE LAW: a bulk resume never floods the hub — ONE create in flight, the next when the previous one's create has ENDED (the hub's
// answer, an error it sent, the window closed, a socket lost with no resend), never on a clock and never at the 15 s watchdog; the
// person sees «Resuming i of n…» and can stop it; a refusal of one is said and the rest go on. The same law for the group button.
// THE RIG: the REAL page (layout-dup-world — the real LayoutManager, the real resumeSession → createSession) over a STAND-IN HUB
// that answers each create after a PLACED delay (420 ms — longer than the old 400 ms clock, so the clock fires a create while the
// one before it is unanswered). No load, no real CLI, no billed turn.
//   ① the boot door (layout.js _resumeAll): 3 conversations ⇒ 3 creates, never two in flight; «Resuming i of n…» ONE line, updated
//   ② a refusal of one (the hub's error for create 2) is said by name and why; the rest go on
//   ③ Stop: pressed while create 1 is in flight ⇒ no create after its answer; «Stopped: 1 of 3 resumed — the other 2 were not started.»
//   ④ the 15 s watchdog is NOT an end: the pacer waits on; the answer moves it
//   ⑤ the sidebar's group button (resume-pacer resumeGroup): a live member attached at once, the stopped ones paced; the button calls it
//   ⑥ RED CONTROLS: the old clock (the master's _resumeAll, verbatim) — two creates in flight; a pacer that never waits — a flood
//   ⑦–⑪ 主开发's look at L1 (19:11Z): M1 a lost socket after the watchdog still ends the create; M2 only the press acts as a press;
//   M4 the person's words for every end; S1 Stop answered at once; S2 the stopped numbers add up; S3 one phone screen, a throw said
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, J, tick, made, toasts, toastText, S, T, DOC, hub, loadHandler, pageOn, loadLifecycle, files } from './layout-dup-world.mjs';
import { mutantCopies } from './mutant-copy.mjs';

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + J(extra).slice(0, 1500) : '')); } return !!c; };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const DELAY = 420;   // the placed delay of the stand-in hub's answer (> the old 400 ms clock)
const CID = (i) => `fade0000-0000-4000-8000-00000000000${i}`;
const stoppedOf = (n) => Array.from({ length: n }, (_, k) => ({ sessionId: CID(k + 1), cwd: '/srv/q' + (k + 1), name: 'Conv ' + (k + 1), opts: { backend: 'claude', backendSessionId: CID(k + 1) } }));

/** a page on the stand-in hub with the REAL resume door; `answer(i, m)` → the frame the hub answers create i with (null: never) */
function page(install, { LM, answer = (i, m) => ({ type: 'created', sessionId: 'new-' + i, cwd: m.cwd, mode: 'chat', reqId: m.reqId }), delay = DELAY, recs = { 'desk-v': [] }, on = 'desk-v' } = {}) {
  const H = hub(loadHandler(), DOC(recs), { alive: [S, T] });
  const P = pageOn(H, install, on, { attachMs: 60000, ...(LM ? { LM } : {}) });
  class Life {} install(Life);
  for (const k of ['resumeSession', 'createSession', '_windowPending', '_snapshotWinBounds', '_placeCarried', '_reopenWin', '_reopenedAs', '_attachInRow', '_closeSecondView', '_markResume', '_closeFenced', '_fenceSays', '_winIs', '_pendingResumeWin', '_respawnAfterExit']) if (Life.prototype[k]) P.app[k] = Life.prototype[k].bind(P.app);
  Object.assign(P.app, { isMobile: false, _getBackendSessionDefaults: () => ({}), _viewIntoWindow: () => null });   // a refused resume's view-only rescue: the rig has no ChatView (not this suite's law)
  P.app.sidebar.getSessionConfig = () => ({}); P.app.sidebar._getSessionTasks = () => [];
  P.creates = []; P.reqOpts = []; P.answered = 0; P.inFlightAtSend = []; P.answerNow = [];
  P.app.ws.request = (m, cb, o = {}) => {
    if (m && m.type === 'create') {
      const i = P.creates.length; P.creates.push(m); P.reqOpts.push(o);
      P.inFlightAtSend.push(P.creates.length - P.answered);   // this create and every one before it not answered yet
      const reply = () => { if (P.answerNow[i] === 'done') return; P.answerNow[i] = 'done'; const f = answer(i, m); P.answered++; if (f && !(o.isAlive && !o.isAlive())) cb(f); };
      P.answerNow[i] = reply;
      if (delay != null) setTimeout(reply, delay);
    }
    return () => {};
  };
  return P;
}
const progOf = (t0) => toasts(t0).filter((e) => e.dataset && e.dataset.progress === 'resume-all');
const saidOf = (t0) => toasts(t0).filter((e) => !(e.dataset && e.dataset.progress === 'resume-all')).map(toastText);
const stopOf = (el) => ((el && el.children) || []).find((c) => /global-toast-action/.test(String(c.className || '')));

const install = await loadLifecycle();
const M = mutantCopies('rap', REPO);

console.log('— ① THE BOOT DOOR (layout.js _resumeAll): one create in flight, the next when the previous one ANSWERED');
async function bootLeg(LM, quiet = false) {
  const t0 = made.length, P = page(install, { LM });
  const run = P.lm._resumeAll(stoppedOf(3));
  const seen = [];
  for (let k = 0; k < 40 && P.answered < 3; k++) { await tick(60); const p = progOf(t0); if (p.length) seen.push(toastText(p[p.length - 1])); }
  await run; await tick(5);
  return { P, t0, seen: [...new Set(seen)], max: Math.max(0, ...P.inFlightAtSend) };
}
{
  const { P, t0, seen, max } = await bootLeg();
  ok(P.creates.length === 3 && max === 1, `3 stopped conversations ⇒ 3 creates, NEVER two in flight (the stand-in hub answers each after ${DELAY} ms — longer than the old 400 ms clock)`, { creates: P.creates.length, inFlightAtSend: P.inFlightAtSend });
  const prog = progOf(t0);
  ok(prog.length === 1 && J(seen) === J(['Resuming 1 of 3…', 'Resuming 2 of 3…', 'Resuming 3 of 3…']) && prog[0].removed === true, 'the person sees it as it goes: ONE line «Resuming i of 3…», updated in place, gone at the end', { seen, lines: prog.length });
  ok(stopOf(prog[0]) && stopOf(prog[0]).textContent === 'Stop', '…with Stop at hand (the line\'s own button)', (prog[0] && prog[0].children || []).map((c) => [c.tagName, c.className, c.textContent]));
}

console.log('— ② A REFUSAL OF ONE is said, and the rest go on');
{
  const t0 = made.length, P = page(install, { delay: 30, answer: (i, m) => (i === 1 ? { type: 'error', reqId: m.reqId, error: 'The transcript could not be read' } : { type: 'created', sessionId: 'new-' + i, cwd: m.cwd, mode: 'chat', reqId: m.reqId }) });
  const r = await P.lm._resumeAll(stoppedOf(3)); await tick(5);
  const said = saidOf(t0);
  ok(P.creates.length === 3 && Math.max(...P.inFlightAtSend) === 1, 'the hub refuses create 2 ⇒ create 3 is still sent (one in flight throughout)', P.inFlightAtSend);
  ok(said.includes('1 of 3 conversations could not be resumed: Conv 2 (The transcript could not be read)'), 'the refusal is SAID — its name and the hub\'s why', { said, kept: r });
}

console.log('— ③ STOP: pressed while create 1 is in flight — nothing after its answer');
{
  const t0 = made.length, P = page(install, { delay: null });
  const run = P.lm._resumeAll(stoppedOf(3));
  await tick(20);
  const prog = progOf(t0), b = prog[0] && stopOf(prog[0]);
  ok(P.creates.length === 1 && !!b, 'create 1 in flight, the progress line and its Stop shown', { creates: P.creates.length, lines: prog.length });
  b && b.onclick({ stopPropagation() {} });
  await tick(20); P.answerNow[0](); await run; await tick(5);
  ok(P.creates.length === 1, 'Stop ⇒ no create after the one in flight (it is answered, nothing follows)', P.creates.length);
  ok(saidOf(t0).includes('Stopped: 1 of 3 resumed, 0 not resumed, 2 not started.'), 'and it is said: «Stopped: 1 of 3 resumed, 0 not resumed, 2 not started.»', saidOf(t0));
}

console.log('— ④ THE 15 s WATCHDOG IS NOT AN END: a hub too slow to answer is a hub not to feed');
{
  const P = page(install, { delay: null });
  const run = P.lm._resumeAll(stoppedOf(2));
  await tick(20);
  P.reqOpts[0].onTimeout && P.reqOpts[0].onTimeout();   // the reply watchdog fires (createSession: a toast, the wait released)
  await tick(30);
  ok(P.creates.length === 1, 'the watchdog fired on create 1 ⇒ create 2 is NOT sent', P.creates.length);
  P.answerNow[0](); await tick(30);
  ok(P.creates.length === 2, '…the hub\'s answer to create 1 ⇒ create 2 goes', P.creates.length);
  P.answerNow[1](); await run;
}

console.log('— ⑤ THE SIDEBAR\'S GROUP BUTTON (resume-pacer resumeGroup): the same law');
const PACER = path.join(REPO, 'src/lib/resume-pacer.js');
async function groupLeg(resumeGroup) {
  const P = page(install, { delay: 40 }), attached = [];
  P.app.attachSession = (sid) => { attached.push({ sid, creates: P.creates.length }); return null; };
  const sessions = [{ status: 'live', webuiId: 'live-9', name: 'Live', cwd: '/srv/l' }, ...stoppedOf(3).map((d) => ({ status: 'stopped', sessionId: d.sessionId, backendSessionId: d.sessionId, cwd: d.cwd, name: d.name, backend: 'claude' }))];
  const run = resumeGroup(P.app, sessions, { nameOf: (s) => s.name });
  const atOnce = attached.length === 1 && attached[0].creates <= 1;
  await run;
  return { P, atOnce, max: Math.max(0, ...P.inFlightAtSend) };
}
{
  const { resumeGroup } = await import(pathToFileURL(PACER).href);
  const { P, atOnce, max } = await groupLeg(resumeGroup);
  ok(atOnce && P.creates.length === 3 && max === 1, 'a group of 1 live + 3 stopped ⇒ the live one attached at once, the 3 creates ONE in flight at a time', { atOnce, inFlightAtSend: P.inFlightAtSend });
  const st = read('src/lib/sidebar-tasks.js'), i = st.indexOf('resumeAllBtn.onclick = (e) => {'), body = st.slice(i, st.indexOf('};', i));
  ok(i > 0 && /pressResumeGroup\(this\.app, taskSessions/.test(body) && !/\.resumeSession\(/.test(body), 'the button (sidebar-tasks.js) resumes through pressResumeGroup (the pace, its throw said) — no resumeSession of its own in a loop', body.slice(0, 400));
}

console.log('— ⑦ M1: EVERY END OF A CREATE IS SEEN — the watchdog disarms nothing that sees one');
{
  const t0 = made.length, P = page(install, { delay: null });
  const items = stoppedOf(2).map((d) => ({ ...d, opts: { ...d.opts, backend: 'antigravity' } }));   // a harness whose resume is NOT sent again on reconnect
  const run = P.lm._resumeAll(items);
  await tick(20);
  P.reqOpts[0].onTimeout && P.reqOpts[0].onTimeout();   // the hub held past 15 s: the watchdog fires
  await tick(20);
  const held = P.creates.length;
  P.hangUp(); await tick(10); P.reconnect(); await tick(40);   // the liveness probe restarted the hub: the socket dropped and came back, nothing re-sent
  ok(held === 1 && P.creates.length === 2, 'the watchdog fired on create 1, then its socket dropped with no resend ⇒ the pace moves on (create 2 sent)', { held, creates: P.creates.length });
  P.answerNow[1] && P.answerNow[1](); await run; await tick(5);
  ok(saidOf(t0).includes('1 of 2 conversations could not be resumed: Conv 1 (the connection dropped before the server answered)'), '…and the lost one is named as not resumed, in the person\'s words', saidOf(t0));
}

console.log('— ⑧ M2: ONLY THE PRESS ACTS AS A PRESS — the group\'s later members take neither the focus nor the desktop on show');
{
  const row = (id, i) => ({ winId: id, title: `Conv ${i} — /srv/q${i}`, type: 'chat', isMinimized: false, isMaximized: false, gridBounds: { left: 0.1 * i, top: 0.05 * i, width: 0.3, height: 0.4 }, zIndex: 200 + i,
    backend: 'claude', backendSessionId: CID(i), claudeSessionId: CID(i), cwd: '/srv/q' + i, serverSessionId: 'dead-' + i });
  const P = page(install, { delay: 30, recs: { 'desk-v': [row('v-r1', 1), files('v-f', 0)], 'desk-x': [row('x-r2', 2), files('x-f', 3)], 'desk-y': [row('y-r3', 3)] } });
  // window.js's focus rules on the rig's wm (test-layout-dup-storm's zRules): a focus raises and takes the keys; a window made QUIET leaves them
  { const wm = P.app.wm, cw = wm.createWindow;
    wm.focusWindow = (id) => { const w = wm.windows.get(id); if (w) { w.element.style.zIndex = String(wm.zIndex++); wm.activeWindowId = id; } };
    wm.createWindow = (o) => { const prev = wm.activeWindowId, w = cw(o); if (w) { w.element.style.zIndex = String(wm.zIndex++); if (o && o.quiet) wm.activeWindowId = prev; else wm.focusWindow(w.id); } return w; }; }
  const { resumeGroup } = await import(pathToFileURL(path.join(REPO, 'src/lib/resume-pacer.js')).href);
  const members = [1, 2, 3].map((i) => ({ status: 'stopped', sessionId: CID(i), backendSessionId: CID(i), cwd: '/srv/q' + i, name: 'Conv ' + i, backend: 'claude' }));
  const run = resumeGroup(P.app, members, { nameOf: (m) => m.name });
  await tick(5);
  P.dm.activeDesktopId !== 'desk-v' && await P.dm.switchTo('desk-v');
  P.app.wm.focusWindow('v-f');   // after the press the person works in v-f, on desk-v
  const seen = [];
  for (let k = 0; k < 40 && P.answered < 3; k++) { await tick(20); seen.push([P.app.wm.activeWindowId, P.dm.activeDesktopId]); }
  await run; await tick(10);
  ok(P.creates.length === 3 && seen.every(([w, d]) => w === 'v-f' && d === 'desk-v') && P.app.wm.activeWindowId === 'v-f' && P.dm.activeDesktopId === 'desk-v',
    'members 2 and 3 (rows on desk-x and desk-y) resume AFTER the press: the person\'s window v-f keeps the focus and desk-v stays on show throughout', { creates: P.creates.length, seen: [...new Set(seen.map(J))], end: [P.app.wm.activeWindowId, P.dm.activeDesktopId] });
}

console.log('— ⑨ M4: EVERY WORD A PERSON READS IS THE PERSON\'S — an end with no text from the hub is said in a sentence of ours');
{
  const t0 = made.length, P = page(install, { delay: 20, answer: (i, m) => (i === 0 ? { type: 'error', reqId: m.reqId, code: 'spawn_failed' } : { type: 'created', sessionId: 'new-' + i, cwd: m.cwd, mode: 'chat', reqId: m.reqId }) });
  const real = P.app.resumeSession; let calls = 0;
  P.app.resumeSession = function (...a) { if (++calls === 2) throw new Error('TypeError: x is undefined (an internal page error)'); return real.apply(this, a); };
  await P.lm._resumeAll(stoppedOf(3)); await tick(5);
  const line = saidOf(t0).find((x) => /could not be resumed/.test(x)) || '';
  ok(line === '2 of 3 conversations could not be resumed: Conv 1 (the server refused it without a reason), Conv 2 (it could not be started on this page)', 'a refusal with only a code, and a page error, read as sentences of ours — never «spawn_failed», «threw» or the exception\'s text', line);
}

console.log('— ⑩ S1 + S2: STOP IS ANSWERED AT ONCE; THE STOPPED LINE ADDS UP');
{
  const t0 = made.length, P = page(install, { delay: null, answer: (i, m) => (i === 0 ? { type: 'error', reqId: m.reqId, error: 'the transcript could not be read' } : { type: 'created', sessionId: 'new-' + i, cwd: m.cwd, mode: 'chat', reqId: m.reqId }) });
  const run = P.lm._resumeAll(stoppedOf(4));
  await tick(20); P.answerNow[0](); await tick(20);   // create 1 refused; create 2 in flight
  const prog = progOf(t0), b = prog[prog.length - 1] && stopOf(prog[prog.length - 1]);
  b && b.onclick({ stopPropagation() {} }); await tick(5);
  const stopping = toasts(t0).filter((e) => e.dataset && e.dataset.progress === 'resume-all-stopping');
  ok(stopping.length === 1 && toastText(stopping[0]) === 'Stopping after the conversation now starting…' && !stopping[0].removed && P.creates.length === 2, 'Stop with create 2 in flight ⇒ at ONCE «Stopping after the conversation now starting…» (before its answer)', stopping.map(toastText));
  P.answerNow[1](); await run; await tick(5);
  ok(stopping[0] && stopping[0].removed === true, '…and that line gives way to the final one when the create ends');
  ok(saidOf(t0).includes('Stopped: 1 of 4 resumed, 1 not resumed, 2 not started.'), 'the stopped line\'s numbers add up to the total — 1 resumed + 1 not resumed (refused) + 2 not started = 4', saidOf(t0));
}

console.log('— ⑪ S3: ONE SCREEN ON A PHONE; A THROW IN THE GROUP\'S PACE IS SAID');
{
  const t0 = made.length, long = 'x'.repeat(80), why = 'y'.repeat(160);
  const P = page(install, { delay: 5, answer: (i, m) => ({ type: 'error', reqId: m.reqId, error: why }) });
  await P.lm._resumeAll(stoppedOf(5).map((d) => ({ ...d, name: long + d.name }))); await tick(5);
  const line = saidOf(t0).find((x) => /could not be resumed/.test(x)) || '';
  ok(line.length > 0 && line.length <= 400 && (line.match(/x{39}…/g) || []).length === 3 && /and 2 more$/.test(line), `the failure line is bounded — three names of ≤ 40 characters, reasons of ≤ 60, «and 2 more» (${line.length} characters)`, line);
  const { pressResumeGroup } = await import(pathToFileURL(path.join(REPO, 'src/lib/resume-pacer.js')).href);
  let unhandled = 0; const onU = () => { unhandled++; }; process.on('unhandledRejection', onU);
  const t1 = made.length;
  const r = await pressResumeGroup(P.app, [{ status: 'stopped', sessionId: CID(9), cwd: '/srv/q9', name: 'Conv 9' }], { nameOf: () => { throw new Error('a name read failed'); } });
  await tick(20); process.off('unhandledRejection', onU);
  ok(r === null && unhandled === 0 && saidOf(t1).includes('Resuming the group stopped early because of an error on this page.'), 'a throw inside the group\'s pace is SAID, never an unhandled rejection', { r, unhandled, said: saidOf(t1) });
}

console.log('— ⑥ RED CONTROLS');
{
  // the master's _resumeAll, VERBATIM (2.369.404 d7f42cc21) — the fixed 400 ms clock
  const LY = read('src/lib/layout.js'), i = LY.indexOf('  async _resumeAll(stopped) {'), j = LY.indexOf('\n  }\n', i) + 4;
  const OLD = `  async _resumeAll(stopped) {
    let kept = 0;
    for (let i = 0; i < stopped.length; i++) {
      const d = stopped[i];
      try { const r = this.app.resumeSession(d.sessionId, d.cwd, d.name, { ...(d.opts || {}), stay: true }); if (r && r.row) kept++; } catch {}
      if (i < stopped.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
    if (kept) showToast(kept === 1 ? t('Resumed 1 conversation where it was') : t('Resumed {n} conversations where they were', { n: kept }), { type: 'info', duration: 5000 });
    return kept;
  }
`;
  if (ok(i > 0 && j > i, 'mutant clock: the patched body exists in layout.js')) {
    const LMx = (await import(pathToFileURL(M.write('src/lib/layout.js', LY.slice(0, i) + OLD + LY.slice(j), 'rap-clock', { esm: true })).href)).LayoutManager;
    const { P, max } = await bootLeg(LMx);
    ok(P.creates.length === 3 && max >= 2, `mutant clock (the master's 400 ms loop): RED — a create sent while the one before it was unanswered (in flight at each send: ${J(P.inFlightAtSend)})`);
  }
  const PS = fs.readFileSync(PACER, 'utf8'), a = '    if (!sent) end(\'none\', null, row);';
  if (ok(PS.includes(a), 'mutant no-wait: the patched line exists in resume-pacer.js')) {
    const { resumeGroup } = await import(pathToFileURL(M.write('src/lib/resume-pacer.js', PS.replace(a, "    end('none', null, row);"), 'rap-nowait', { esm: true })).href);
    const { P, max } = await groupLeg(resumeGroup);
    ok(P.creates.length === 3 && max >= 2, `mutant no-wait (a pacer that never waits for the create's end): RED on the group button — ${max} in flight`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
