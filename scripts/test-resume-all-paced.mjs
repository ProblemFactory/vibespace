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
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + J(extra).slice(0, 1500) : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const DELAY = 420;   // the placed delay of the stand-in hub's answer (> the old 400 ms clock)
const CID = (i) => `fade0000-0000-4000-8000-00000000000${i}`;
const stoppedOf = (n) => Array.from({ length: n }, (_, k) => ({ sessionId: CID(k + 1), cwd: '/srv/q' + (k + 1), name: 'Conv ' + (k + 1), opts: { backend: 'claude', backendSessionId: CID(k + 1) } }));

/** a page on the stand-in hub with the REAL resume door; `answer(i, m)` → the frame the hub answers create i with (null: never) */
function page(install, { LM, answer = (i, m) => ({ type: 'created', sessionId: 'new-' + i, cwd: m.cwd, mode: 'chat', reqId: m.reqId }), delay = DELAY, recs = { 'desk-v': [] }, on = 'desk-v' } = {}) {
  const H = hub(loadHandler(), DOC(recs), { alive: [S, T] });
  const P = pageOn(H, install, on, { attachMs: 60000, ...(LM ? { LM } : {}) });
  class Life {} install(Life);
  for (const k of ['resumeSession', 'createSession', '_windowPending', '_snapshotWinBounds', '_placeCarried', '_reopenWin', '_reopenedAs', '_attachInRow', '_closeSecondView', '_markResume', '_closeFenced', '_fenceSays', '_winIs', '_pendingResumeWin', '_respawnAfterExit']) if (Life.prototype[k]) P.app[k] = Life.prototype[k].bind(P.app);   // stale-pins: kept — _closeSecondView lives in src/lib/session-lifecycle.js (this copies SessionLifecycle's methods); only src/lib/user-todos-actions.js lost the token (the manager design's piece 4)
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
  ok(gateOf(stopOf(prog[0])) && stopOf(prog[0]).textContent === 'Stop', '…with Stop at hand (the line\'s own button)', (prog[0] && prog[0].children || []).map((c) => [c.tagName, c.className, c.textContent]));
}

console.log('— ② A REFUSAL OF ONE is said, and the rest go on');
{
  const t0 = made.length, P = page(install, { delay: 30, answer: (i, m) => (i === 1 ? { type: 'error', reqId: m.reqId, error: 'The transcript could not be read' } : { type: 'created', sessionId: 'new-' + i, cwd: m.cwd, mode: 'chat', reqId: m.reqId }) });
  const r = await P.lm._resumeAll(stoppedOf(3)); await tick(5);
  const said = saidOf(t0);
  ok(P.creates.length === 3 && Math.max(...P.inFlightAtSend) === 1, 'the hub refuses create 2 ⇒ create 3 is still sent (one in flight throughout)', P.inFlightAtSend);
  ok(verdictOf(said.includes('1 of 3 conversations could not be resumed: Conv 2 (The transcript could not be read)')), 'the refusal is SAID — its name and the hub\'s why', { said, kept: r });
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
  ok(verdictOf(saidOf(t0).includes('Stopped: 1 of 3 resumed, 0 not resumed, 2 not started.')), 'and it is said: «Stopped: 1 of 3 resumed, 0 not resumed, 2 not started.»', saidOf(t0));
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
  ok(gateOf(atOnce) && P.creates.length === 3 && max === 1, 'a group of 1 live + 3 stopped ⇒ the live one attached at once, the 3 creates ONE in flight at a time', { atOnce, inFlightAtSend: P.inFlightAtSend });
  const st = read('src/lib/sidebar-tasks.js'), i = st.indexOf('resumeAllBtn.onclick = (e) => {'), body = st.slice(i, st.indexOf('};', i));
  ok(i > 0 && gateOf(/pressResumeGroup\(this\.app, taskSessions/.test(body)) && !/\.resumeSession\(/.test(body), 'the button (sidebar-tasks.js) resumes through pressResumeGroup (the pace, its throw said) — no resumeSession of its own in a loop', body.slice(0, 400));
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
  ok(verdictOf(saidOf(t0).includes('1 of 2 conversations could not be resumed: Conv 1 (the connection dropped before the server answered)')), '…and the lost one is named as not resumed, in the person\'s words', saidOf(t0));
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
  ok(P.creates.length === 3 && gateOf(seen.every(([w, d]) => w === 'v-f' && d === 'desk-v')) && P.app.wm.activeWindowId === 'v-f' && P.dm.activeDesktopId === 'desk-v',
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
  ok(gateOf(stopping[0]) && stopping[0].removed === true, '…and that line gives way to the final one when the create ends');
  ok(verdictOf(saidOf(t0).includes('Stopped: 1 of 4 resumed, 1 not resumed, 2 not started.')), 'the stopped line\'s numbers add up to the total — 1 resumed + 1 not resumed (refused) + 2 not started = 4', saidOf(t0));
}

console.log('— ⑪ S3: ONE SCREEN ON A PHONE; A THROW IN THE GROUP\'S PACE IS SAID');
{
  const t0 = made.length, long = 'x'.repeat(80), why = 'y'.repeat(160);
  const P = page(install, { delay: 5, answer: (i, m) => ({ type: 'error', reqId: m.reqId, error: why }) });
  await P.lm._resumeAll(stoppedOf(5).map((d) => ({ ...d, name: long + d.name }))); await tick(5);
  const line = saidOf(t0).find((x) => /could not be resumed/.test(x)) || '';
  ok(line.length > 0 && line.length <= 400 && (line.match(/x{39}…/g) || []).length === 3 && verdictOf(/and 2 more$/.test(line)), `the failure line is bounded — three names of ≤ 40 characters, reasons of ≤ 60, «and 2 more» (${line.length} characters)`, line);
  const { pressResumeGroup } = await import(pathToFileURL(path.join(REPO, 'src/lib/resume-pacer.js')).href);
  let unhandled = 0; const onU = () => { unhandled++; }; process.on('unhandledRejection', onU);
  const t1 = made.length;
  const r = await pressResumeGroup(P.app, [{ status: 'stopped', sessionId: CID(9), cwd: '/srv/q9', name: 'Conv 9' }], { nameOf: () => { throw new Error('a name read failed'); } });
  await tick(20); process.off('unhandledRejection', onU);
  ok(r === null && unhandled === 0 && verdictOf(saidOf(t1).includes('Resuming the group stopped early because of an error on this page.')), 'a throw inside the group\'s pace is SAID, never an unhandled rejection', { r, unhandled, said: saidOf(t1) });
}

console.log('— ⑫ B-864f: A FOLDER THAT WAITS FOR THE VAULT — never «gone»; each window resumes ITSELF once the vault is unlocked, in the pace\'s own lane');
{
  // the hub's vault_locked over a LOCAL folder (src/server/cwd-wait.js); the page's vault facts stood in by hooks the leg fires,
  // and the REAL resume-pacer's lane (the same module instance layout.js runs: one URL)
  const SRC = read('src/lib/session-lifecycle.js');
  const IMP_V = /^import \{ onVaultFacts, vaultFacts \} from '\.\/vault-unlock\.js';.*$/m, IMP_T = /^import \{ inTurn \} from '\.\/resume-pacer\.js';.*$/m;
  const { inTurn } = await import(pathToFileURL(PACER).href);
  const vf = new Set();
  Object.assign(globalThis, { __rapVault: (fn) => { vf.add(fn); return () => vf.delete(fn); }, __rapFacts: null, __rapTurn: inTurn });
  const facts = (f) => { globalThis.__rapFacts = f; for (const fn of [...vf]) fn(f); };
  const lifeOf = (mut = null) => {
    if (!IMP_V.test(SRC) || !IMP_T.test(SRC)) throw new Error('the lifecycle imports moved');
    const s0 = mut ? mut(SRC) : SRC;
    if (mut && s0 === SRC) throw new Error('the patched lifecycle changed nothing');
    return loadLifecycle(s0.replace(IMP_V, 'const onVaultFacts = (fn) => globalThis.__rapVault(fn); const vaultFacts = () => globalThis.__rapFacts;').replace(IMP_T, 'const inTurn = (fn) => globalThis.__rapTurn(fn);'));
  };
  const locked = (i, m) => ({ type: 'error', reqId: m.reqId, code: 'vault_locked', cwd: m.cwd, waitsFor: 'Studio Mac', message: `the vault is locked — the folder ${m.cwd} is on Studio Mac, which opens after the owner unlocks the vault with the second password` });
  const created = (i, m) => ({ type: 'created', sessionId: 'new-' + i, cwd: m.cwd, mode: 'chat', reqId: m.reqId });
  const pick = (m) => J({ cwd: m.cwd, resumeId: m.resumeId, mode: m.mode, backend: m.backend, sessionName: m.sessionName, model: m.model, permissionMode: m.permissionMode, effort: m.effort });
  const waitsLeg = async (inst, { unlockMidPace = false, already = false, archive = null, archivedAtAsk = null } = {}) => {
    vf.clear(); globalThis.__rapFacts = already ? { state: 'unlocked' } : { state: 'locked' };
    const t0 = made.length, n = unlockMidPace ? 4 : 3;
    const refused = new Set(), waits = (m) => (unlockMidPace ? m.resumeId === CID(1) : true);   // each waiting conversation is refused ONCE
    const P = page(inst, { delay: 10, answer: (i, m) => (waits(m) && !refused.has(m.resumeId) ? (refused.add(m.resumeId), locked(i, m)) : created(i, m)) });
    if (archivedAtAsk) P.app.sidebar.isArchived = (s) => !!(s && s.sessionKey === `claude:${archivedAtAsk}`);   // archived BEFORE its resume was asked
    const run = P.lm._resumeAll(stoppedOf(n));
    if (unlockMidPace) { for (let k = 0; k < 40 && P.creates.length < 2; k++) await tick(5); facts({ state: 'unlocked' }); }
    await run; await tick(5);
    const first = { creates: P.creates.length, said: saidOf(t0), waiting: vf.size };
    if (archive) P.app.sidebar.isArchived = (s) => !!(s && s.sessionKey === `claude:${archive}`);   // the person archives it WHILE IT WAITS (after the refusals)
    if (!unlockMidPace && !already) { facts({ state: 'locked' }); await tick(10); first.whileLocked = P.creates.length; facts({ state: 'unlocked' }); }
    const want = unlockMidPace ? 5 : archive ? 5 : 6;
    for (let k = 0; k < 120 && P.answered < want; k++) await tick(10);
    await tick(10); facts({ state: 'unlocked' }); await tick(30);
    const same = refused.size > 0 && [...refused].every((rid) => { const ms = P.creates.filter((m) => m.resumeId === rid); return ms.length === 2 && pick(ms[0]) === pick(ms[1]); });
    return { first, after: P.creates.length, max: Math.max(0, ...P.inFlightAtSend), same, left: vf.size, inFlightAtSend: P.inFlightAtSend, of2: P.creates.filter((m) => m.resumeId === CID(2)).length };
  };
  const w = await waitsLeg(await lifeOf());
  ok(w.first.creates === 3 && w.first.waiting === 3 && w.first.whileLocked === 3, 'three conversations whose folders wait for the vault: three refusals, each window waits (no gone dialog, nothing recreated); a tick still LOCKED starts nothing', w.first);
  ok(J(w.first.said) === J(['3 of 3 conversations wait for the vault — while this page is open, each resumes by itself once you unlock it.']), 'ONE line says it, in the page\'s words: they WAIT (counted apart from a failure), no toast per window', w.first.said);
  ok(w.after === 6 && w.max === 1 && verdictOf(w.same), 'the unlock ⇒ each conversation resumes ITSELF with the create it asked for, in turn — never two creates in flight', w);
  ok(w.left === 0, 'each window waited ONCE: a later unlocked tick starts nothing more', w);
  const mid = await waitsLeg(await lifeOf(), { unlockMidPace: true });
  ok(mid.after === 5 && mid.max === 1 && verdictOf(mid.same), 'unlocked WHILE the pace still has a create in flight: the waiting window takes its turn in the pace\'s lane — never two in flight', mid);
  const now = await waitsLeg(await lifeOf(), { already: true });
  ok(now.after === 6 && now.max === 1 && now.left === 0 && verdictOf(now.same), 'a vault already unlocked when the refusal lands (it was unlocked meanwhile): the window resumes at once, in the lane', now);
  const ar = await waitsLeg(await lifeOf(), { archive: CID(2) });
  ok(ar.after === 5 && ar.of2 === 1 && ar.max === 1, 'a conversation the person ARCHIVED while it waited (cure 2 — archiving leaves its window open, the create door reads no archive) is NOT resumed at the unlock (its one create was the refused one); the other two are', ar);
  const aa = await waitsLeg(await lifeOf(), { archivedAtAsk: CID(2) });
  ok(aa.after === 6 && aa.of2 === 2, 'one ALREADY archived when its resume was asked (Send my message again, a boot resume-all) is the person\'s own resume — it goes on at the unlock (cure 2b)', aa);
  const arRed = await waitsLeg(await lifeOf((x) => x.replace(/\n            if \(!archivedAtAsk && this\.sidebar\?\.isArchived\?\.\(convOf\)\)[^\n]*\n/, '\n')), { archive: CID(2) });
  ok(arRed.after === 6, 'RED control: the replay without the archive check (cure 1\'s shape) ⇒ the archived conversation is resumed', arRed);
  const aaRed = await waitsLeg(await lifeOf((x) => x.replace('if (!archivedAtAsk && this.sidebar?.isArchived?.(convOf))', 'if (this.sidebar?.isArchived?.(convOf))')), { archivedAtAsk: CID(2) });
  ok(aaRed.after === 5, 'RED control: «archived NOW» (cure 2\'s shape) ⇒ a resume the person asked of an archived conversation is dropped at the unlock, its message with it', aaRed);
  // the restack read (cure 3): the window of an archived-while-waiting conversation had promised to send the message the person
  // typed — the skip line gives its text back (source pin: the rig draws no window renderer; RED: cure 2's line, the text dropped)
  { const LS = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
    const quotes = (x) => x.includes("const typed = typeof createArgs.initialMessage === 'string' ? createArgs.initialMessage.trim() : '';") && x.includes("appendSystem(typed ? t('Not resumed \\u2014 this conversation was archived while it waited for the vault. The message you wrote was not sent: «{text}»', { text: typed })");
    ok(verdictOf(quotes(LS)), 'an archived-while-waiting window that carried a typed message says it was NOT sent and gives its text back (cure 3)');
    ok(!quotes(LS.replace("appendSystem(typed ? t('Not resumed \\u2014 this conversation was archived while it waited for the vault. The message you wrote was not sent: «{text}»', { text: typed }) : ", "appendSystem((")), 'RED control: cure 2\'s line (the message dropped unsaid) ⇒ the pin is red'); }
  const r1 = await waitsLeg(await lifeOf((x) => x.replace('        if (msg.resumesAtUnlock) {\n', '        if (false) {\n')));
  ok(r1.after === 3, 'RED control: the window that waits taken out (the .407 shape) ⇒ nothing resumes after the unlock', r1);
  const flood = (x) => x.replace('const turnOf = (fn) => inTurn(fn);', 'const turnOf = (fn) => fn();');
  const r2 = await waitsLeg(await lifeOf(flood));
  ok(r2.after === 6 && r2.max >= 2, 'RED control: the waits outside the lane ⇒ the unlock fires every create at once', r2);
  const r3 = await waitsLeg(await lifeOf(flood), { unlockMidPace: true });
  ok(r3.max >= 2, 'RED control: …and an unlock mid-pace puts a second create in flight beside the pace\'s', r3);
  ok(verdictOf(/if \(msg\.code === 'vault_locked' && msg\.cwd && !hostId && resumeId && !fork && sessionMode === 'chat'\) msg\.resumesAtUnlock = true;\n\s*pending\.remove\(\); settled\('refused', msg\);/.test(SRC)), 'the window that waits is a local chat RESUME (never a fork, a terminal or a machine\'s session), said on the answer BEFORE its end is told');
  delete globalThis.__rapVault; delete globalThis.__rapFacts; delete globalThis.__rapTurn;
  // the boot offer while LOCKED (layout.js _offerResumeAll): it reads the facts when the page has none, says so and unlocks FIRST
  const LY = read('src/lib/layout.js'), body = LY.slice(LY.indexOf('  async _offerResumeAll(stopped) {'), LY.indexOf('  async _resumeAll(stopped) {'));
  ok(gateOf(/if \(!vaultFacts\(\)\) await refreshVaultFacts\(\);/.test(body)) && gateOf(/const locked = vaultFacts\(\)\?\.state === 'locked';/.test(body)) && gateOf(/confirmText: locked \? t\('Unlock and resume all \{n\}'/.test(body)) && verdictOf(/if \(locked && vaultFacts\(\)\?\.state === 'locked'\) return await new Promise\(\(done\) => unlockThen\(\(\) => done\(this\._resumeAll\(stopped\)\), \{ ended: \(\) => done\(null\) \}\)\);[^\n]*\n      if \(locked && vaultFacts\(\)\?\.state !== 'unlocked'\) return null;[^\n]*\n      return await this\._resumeAll\(stopped\);/.test(body)), 'the boot offer while locked: the facts read first, «Unlock and resume all n», the unlock dialog first, the paced resumes from unlockThen (its close OR the unlock — test-vault-secrets ⑪ drives it)');
  ok(!/      if \(locked && vaultFacts\(\)\?\.state !== 'unlocked'\) return null;/.test(body.replace(/      if \(locked && vaultFacts\(\)\?\.state !== 'unlocked'\) return null;[^\n]*\n/, '')) && verdictOf(/      if \(locked && vaultFacts\(\)\?\.state !== 'unlocked'\) return null;/.test(body)), 'cure 4 (its read): a reset that lands while the offer\'s question is open resumes nothing — the offer returns before _resumeAll (RED: the line removed ⇒ the pin above is red)');
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
  if (ok(verdictOf(PS.includes(a)), 'mutant no-wait: the patched line exists in resume-pacer.js')) {
    const { resumeGroup } = await import(pathToFileURL(M.write('src/lib/resume-pacer.js', PS.replace(a, "    end('none', null, row);"), 'rap-nowait', { esm: true })).href);
    const { P, max } = await groupLeg(resumeGroup);
    ok(P.creates.length === 3 && max >= 2, `mutant no-wait (a pacer that never waits for the create's end): RED on the group button — ${max} in flight`);
  }
}

console.log('— ⑦ B-f64b cure (主开发 11:47Z): NOTHING AUTOMATIC STARTS A ROW STILL BEING CHECKED (a codex that may run in another terminal)');
{
  const RP = await import(pathToFileURL(PACER).href);
  const U = { status: 'stopped', liveness: 'unknown', backend: 'codex', backendSessionId: 'th-1', sessionId: 'th-1' };
  ok(gateOf(RP.livenessUnknown(U)) && !RP.livenessUnknown({ ...U, liveness: undefined }) && !RP.livenessUnknown({ ...U, status: 'external' }) && RP.unknownRowOf([U], 'codex', 'th-1') === U && RP.unknownRowOf([U], 'claude', 'th-1') === null,
    'the pure rule: a row is «still checking» when it is stopped AND its liveness is unknown — found by its backend and id');
  const rowsOf = (unknownAt) => stoppedOf(3).map((d, k) => ({ status: 'stopped', sessionId: d.sessionId, backendSessionId: d.sessionId, backend: 'claude', cwd: d.cwd, name: d.name, ...(k === unknownAt ? { liveness: 'unknown' } : {}) }));
  // the GROUP press (the sidebar's «Resume all»)
  const groupUnknown = async (resumeGroup) => { const P = page(install, { delay: 30 }); P.app.attachSession = () => null; const t0 = made.length; await resumeGroup(P.app, rowsOf(1), { nameOf: (x) => x.name }); await tick(5); return { creates: P.creates.length, said: saidOf(t0) }; };
  const g1 = await groupUnknown(RP.resumeGroup);
  ok(g1.creates === 2 && verdictOf(g1.said.some((x) => /^1 not resumed: still checking/.test(x))), 'the GROUP press: the row still being checked is not resumed (2 creates of 3) and it is SAID', g1);
  const PS2 = fs.readFileSync(PACER, 'utf8'), skip = "    if (livenessUnknown(s)) { checking.push(nameOf(s) || s.name); continue; }   // B-f64b cure: never started by a group press\n";
  if (!PS2.includes(skip)) throw new Error('the anchor of the control «B-f64b cure: the group skip» is not in the source');
  const g0 = await groupUnknown((await import(pathToFileURL(M.write('src/lib/resume-pacer.js', PS2.replace(skip, ''), 'rap-unknown-group', { esm: true })).href)).resumeGroup);
  ok(g0.creates === 3, 'CONTROL: a group press without the skip starts the row still being checked (RED for the leg above)', g0);
  // the BOOT's «resume all» (layout _resumeAll)
  const bootUnknown = async (LMx) => { const P = page(install, { delay: 30, ...(LMx ? { LM: LMx } : {}) }); P.app.sidebar._allSessions = rowsOf(2); const t0 = made.length; await P.lm._resumeAll(stoppedOf(3)); await tick(5); return { creates: P.creates.length, said: saidOf(t0) }; };
  const b1 = await bootUnknown();
  ok(b1.creates === 2 && verdictOf(b1.said.some((x) => /^1 not resumed: still checking/.test(x))), 'the BOOT\'s «resume all»: the row still being checked is not resumed (2 creates of 3) and it is SAID', b1);
  const LY2 = read('src/lib/layout.js'), fcut = "    const go = (stopped || []).filter((d) => !unknownRowOf(rows, d.opts?.backend, d.opts?.backendSessionId || d.sessionId));\n";
  if (!LY2.includes(fcut)) throw new Error('the anchor of the control «B-f64b cure: the boot filter» is not in the source');
  const b0 = await bootUnknown((await import(pathToFileURL(M.write('src/lib/layout.js', editAnchor(LY2, fcut, '    const go = stopped || [];\n', "src/lib/layout.js"), 'rap-unknown-boot', { esm: true })).href)).LayoutManager);
  ok(b0.creates === 2 && !b0.said.some((x) => /^1 not resumed: still checking/.test(x)) && verdictOf(b0.said.some((x) => /could not be resumed: .*still checking/.test(x))), 'CONTROL: a boot «resume all» without the filter — the backstop (resumeSession) still holds the row, and the pace reports it as a FAILURE instead of the skip\'s own words (RED for the leg above\'s «said»)', b0);
  // THE BACKSTOP (resumeSession): unattended or bulk starts nothing; a person's own press asks first — a no starts nothing, a yes starts it
  const lifeUnknown = async (inst) => {
    const P = page(inst, { delay: 30 });
    P.app.sidebar._allSessions = [{ status: 'stopped', liveness: 'unknown', backend: 'claude', sessionId: CID(1), backendSessionId: CID(1), cwd: '/srv/q1', name: 'Conv 1' }];
    const o = { backend: 'claude', backendSessionId: CID(1) };
    const asked = [];
    const r1 = P.app.resumeSession(CID(1), '/srv/q1', 'Conv 1', { ...o, unattended: true });
    const r2 = P.app.resumeSession(CID(1), '/srv/q1', 'Conv 1', { ...o, stay: true });
    P.app._askStillChecking = async (n) => { asked.push(n); return false; };
    const r3 = P.app.resumeSession(CID(1), '/srv/q1', 'Conv 1', { ...o });
    await tick(10);
    const before = P.creates.length;
    P.app._askStillChecking = async (n) => { asked.push(n); return true; };
    P.app.resumeSession(CID(1), '/srv/q1', 'Conv 1', { ...o });
    await tick(30);
    return { checking: [r1, r2, r3].map((r) => !!(r && r.checking)), before, after: P.creates.length, asked };
  };
  const l1 = await lifeUnknown(install);
  ok(gateOf(l1.checking.every(Boolean)) && l1.before === 0 && l1.after === 1 && l1.asked.length === 2,
    'resumeSession (the backstop): unattended or bulk starts nothing; a person\'s own press asks «still checking» first — a no starts nothing, a yes starts it (one create)', l1);
  const LS = read('src/lib/session-lifecycle.js'), gcut = '    if (!unknownOk && !excludeWebuiId && unknownRowOf(this.sidebar?._allSessions, backend, targetBackendId)) {';
  if (!LS.includes(gcut)) throw new Error('the anchor of the control «B-f64b cure: the backstop» is not in the source');
  const l0 = await lifeUnknown(await loadLifecycle(LS.replace(gcut, '    if (false && unknownRowOf(this.sidebar?._allSessions, backend, targetBackendId)) {')));
  ok(l0.before >= 1, 'CONTROL: a resumeSession without the backstop starts the row still being checked unattended (RED for the leg above)', l0);
  // cure 2 (主开发 12:17Z): A PERSON'S PRESET (layout loadPreset) — the rows it left because they are still being checked are SAID,
  // with the door to try again; the others are resumed
  const presetUnknown = async (LMx) => {
    const P = page(install, { delay: 30, ...(LMx ? { LM: LMx } : {}) });
    P.app.sidebar.getCustomName = () => null;
    const rows = rowsOf(1), keep = globalThis.fetch;
    globalThis.fetch = async (u) => ({ ok: true, json: async () => (String(u) === '/api/sessions' ? { sessions: rows } : { sessions: [] }) });
    P.lm._savedPresets = { p: { windows: stoppedOf(3).map((d) => ({ type: 'terminal', backend: 'claude', backendSessionId: d.sessionId })) } };
    const t0 = made.length;
    try { await P.lm.loadPreset('p'); await tick(40); } finally { globalThis.fetch = keep; }
    const el = toasts(t0).find((e) => /still checking/.test(toastText(e)));
    const door = !!(el && [...(el.children || [])].some((c) => /global-toast-action/.test(String(c.className || '')) && /Try again/.test(String(c.textContent || ''))));
    return { creates: P.creates.length, said: saidOf(t0), door };
  };
  const pr1 = await presetUnknown();
  ok(pr1.creates === 2 && gateOf(pr1.said.some((x) => /^1 not resumed: still checking/.test(x))) && verdictOf(pr1.door),
    'cure 2: a PERSON\'S PRESET resumes the two rows it knows and SAYS the one left because it is still being checked, with «Try again»', pr1);
  const LY3 = read('src/lib/layout.js'), tcut = LY3.match(/\n    if \(stillChecking\) showToast\([^\n]*/);
  if (!tcut) throw new Error('the anchor of the control «B-f64b cure 2: the preset\'s words» is not in the source');
  const pr0 = await presetUnknown((await import(pathToFileURL(M.write('src/lib/layout.js', editAnchor(LY3, tcut[0], '', "src/lib/layout.js"), 'rap-unknown-preset', { esm: true })).href)).LayoutManager);
  ok(pr0.creates === 2 && !pr0.said.some((x) => /still checking/.test(x)), 'CONTROL: a preset without its words leaves the row in silence (RED for the leg above)', pr0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
