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
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, J, tick, made, toasts, toastText, S, T, DOC, hub, loadHandler, pageOn, loadLifecycle } from './layout-dup-world.mjs';
import { mutantCopies } from './mutant-copy.mjs';

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + J(extra).slice(0, 1500) : '')); } return !!c; };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const DELAY = 420;   // the placed delay of the stand-in hub's answer (> the old 400 ms clock)
const CID = (i) => `fade0000-0000-4000-8000-00000000000${i}`;
const stoppedOf = (n) => Array.from({ length: n }, (_, k) => ({ sessionId: CID(k + 1), cwd: '/srv/q' + (k + 1), name: 'Conv ' + (k + 1), opts: { backend: 'claude', backendSessionId: CID(k + 1) } }));

/** a page on the stand-in hub with the REAL resume door; `answer(i, m)` → the frame the hub answers create i with (null: never) */
function page(install, { LM, answer = (i, m) => ({ type: 'created', sessionId: 'new-' + i, cwd: m.cwd, mode: 'chat', reqId: m.reqId }), delay = DELAY } = {}) {
  const H = hub(loadHandler(), DOC({ 'desk-v': [] }), { alive: [S, T] });
  const P = pageOn(H, install, 'desk-v', { attachMs: 60000, ...(LM ? { LM } : {}) });
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
  ok(saidOf(t0).includes('Stopped: 1 of 3 resumed — the other 2 were not started.'), 'and it is said: «Stopped: 1 of 3 resumed — the other 2 were not started.»', saidOf(t0));
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
  ok(i > 0 && /resumeGroup\(this\.app, taskSessions/.test(body) && !/\.resumeSession\(/.test(body), 'the button (sidebar-tasks.js) resumes through resumeGroup — no resumeSession of its own in a loop', body.slice(0, 400));
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
