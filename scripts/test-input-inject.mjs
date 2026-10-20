#!/usr/bin/env node
// LANE WIN-INPUT-ELEVATED — THE ELEVATED-INPUT FENCE (src/input-inject.js). The owner may raise the Windows device agent to
// run elevated (a one-time RunLevel-Highest scheduled task HE registers; the product forces nothing). When it is elevated the
// OS lets its SendInput reach ADMIN windows — so the product FENCES it: the UAC consent UI and the secure desktop are never
// automatable (denied by window class, ALWAYS — even elevated, even if an allow-list names them), an optional allow-list
// narrows where agents may type, and every elevated injection is one audit line.
//
//   ① PURE injectAllowed({windowClass, elevated, allow}) over every shape — the hard-deny beats the allow-list, an
//      unelevated daemon leaves the OS (UIPI) as the fence, an empty/absent class is allowed when elevated.
//   ② the client's capability gate: an old daemon's hello-ack has no `elevated` field ⇒ read as not-elevated (safe).
//   ③ the LIVE fence over an in-memory resident-script child (no real Windows): an elevated injector tells the script it is
//      elevated (E 1 — the unelevated UIPI short-circuit is dropped), reads the foreground window (F), and either sends +
//      audits (a normal window) or refuses + audits without sending a single press (the UAC consent UI).
//   ④ Controls (scripts/mutant-copy.mjs): a copy without the hard-deny ALLOWS the consent UI, and a copy without the
//      allow-list narrowing ALLOWS a window not in the list — both RED against the rows above.
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const I = require('../src/input-inject.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── ① PURE injectAllowed
console.log('① injectAllowed (PURE)');
const ROWS = [
  [{ windowClass: 'Chrome_WidgetWin_1', elevated: true, allow: null }, true, 'allowed'],
  [{ windowClass: 'Credential Dialog Xaml Host', elevated: true, allow: null }, false, 'consent-ui'],
  [{ windowClass: 'Credential Dialog Xaml Host', elevated: true, allow: ['Credential Dialog Xaml Host'] }, false, 'consent-ui'], // hard-deny beats an allow-list that names it
  [{ windowClass: 'Consent', elevated: true, allow: null }, false, 'consent-ui'],
  [{ windowClass: '$$$Secure UAP Background Dialog', elevated: true, allow: null }, false, 'secure-desktop'],
  [{ windowClass: 'UACBackgroundWindowClass', elevated: true, allow: null }, false, 'secure-desktop'],
  [{ windowClass: 'Notepad', elevated: true, allow: ['Chrome_WidgetWin_1'] }, false, 'not-in-allow'],
  [{ windowClass: 'Chrome_WidgetWin_1', elevated: true, allow: ['Chrome_WidgetWin_1', 'Notepad'] }, true, 'allowed'],
  [{ windowClass: 'Credential Dialog Xaml Host', elevated: false, allow: null }, false, 'consent-ui'], // the consent UI is denied even unelevated (belt)
  [{ windowClass: 'Notepad', elevated: false, allow: null }, true, 'uipi-os'],                          // unelevated: the OS/UIPI is the fence
  [{ windowClass: '', elevated: true, allow: null }, true, 'allowed'],                                  // class unknown (GetClassName failed) ⇒ allowed (secure desktop is OS-isolated)
];
for (const [inp, okWant, whyWant] of ROWS) { const r = I.injectAllowed(inp); ok(r.ok === okWant && r.why === whyWant, `${inp.windowClass || '(empty)'} elev=${inp.elevated} allow=${inp.allow ? inp.allow.length : '∅'} ⇒ ${okWant ? 'ok' : 'deny'}/${whyWant}`, r); }
ok(same(I.INJECT_DENY_CLASSES.slice().sort(), ['$$$Secure UAP Background Dialog', 'Consent', 'Credential Dialog Xaml Host', 'UACBackgroundWindowClass']), 'the deny set is the UAC consent UI + the secure desktop, by class', I.INJECT_DENY_CLASSES);
ok(I.injectAllowed() && I.injectAllowed().ok === true, 'no args ⇒ a safe allow (unelevated default), never a throw');

// ── ② the client's capability gate (an old daemon has no `elevated`)
console.log('② the client gate: info.elevated === true');
const gate = (info) => info?.elevated === true;
ok(gate({ elevated: true }) === true && gate({ elevated: false }) === false && gate({}) === false && gate(null) === false,
  'elevated only when the hello-ack says so; an old daemon (no field) ⇒ not-elevated, never asked to type into an admin window');

// ── ③ the LIVE fence over an in-memory resident-script child
console.log('③ the live fence (in-memory resident child)');
// a spawn() that returns an in-memory child speaking the resident protocol (ready → ok | front … per line)
function winSpawn(state) {
  return () => {
    const child = new EventEmitter();
    const out = new EventEmitter(); out.setEncoding = () => { };
    child.stdout = out; child.kill = () => { };
    let buf = '';
    const emit = (line) => process.nextTick(() => out.emit('data', line + '\r\n'));
    child.stdin = { on: () => { }, end: () => { }, write: (chunk) => { buf += chunk; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).replace(/\r$/, '').trim(); buf = buf.slice(i + 1); state.lines.push(l); const a = l.split(' '); emit(a[0] === 'F' ? 'front ' + Buffer.from(state.frontClass || '', 'utf8').toString('base64') + ' ' + Buffer.from(state.frontTitle || '', 'utf8').toString('base64') : 'ok'); } return true; } };
    emit('ready');
    return child;
  };
}
function winInjector(state) {
  return I.createInjector({ platform: 'win32', spawn: winSpawn(state), env: {}, elevated: true, allow: () => state.allow, audit: (l) => state.audits.push(l) });
}
function winInjectorWith(state, elevated) { return I.createInjector({ platform: 'win32', spawn: winSpawn(state), env: {}, elevated, allow: () => state.allow, audit: (l) => state.audits.push(l) }); }
{ // allowed: a normal window ⇒ the press goes in, one audit line (ok)
  const st = { lines: [], audits: [], frontClass: 'Chrome_WidgetWin_1', frontTitle: 'Untitled - Notepad', allow: null };
  const inj = winInjector(st);
  const r = await inj.inject([{ t: 'md', x: 5, y: 6, b: 0 }, { t: 'kd', c: 'KeyA' }]);
  inj.close();
  ok(r.ok && r.n === 2 && same(st.lines, ['E 1', 'F', 'M 5 6', 'D 0', 'K 30 0 0']), 'elevated + a normal window: E 1 told the script, F read the window, then the move/press/key all went in', { r, lines: st.lines });
  ok(st.audits.length === 1 && st.audits[0].ok === true && st.audits[0].why === 'allowed' && st.audits[0].windowClass === 'Chrome_WidgetWin_1' && st.audits[0].windowTitle === 'Untitled - Notepad' && st.audits[0].clicks === 1 && st.audits[0].keys === 1, 'one audit line: ok, the window class + title, the keys/clicks count', st.audits);
}
{ // denied: the UAC consent UI ⇒ NOT ONE press is sent, one audit line (deny)
  const st = { lines: [], audits: [], frontClass: 'Credential Dialog Xaml Host', frontTitle: 'User Account Control', allow: null };
  const inj = winInjector(st);
  const r = await inj.inject([{ t: 'md', x: 5, y: 6, b: 0 }, { t: 'kd', c: 'KeyA' }]);
  inj.close();
  ok(!r.ok && r.code === 'inject_not_allowed' && r.n === 0 && r.refused.length === 2 && r.refused.every((x) => x.code === 'inject_not_allowed' && x.detail === 'consent-ui'), 'elevated + the UAC consent UI: the whole batch is refused by name', r);
  ok(same(st.lines, ['E 1', 'F']) && !st.lines.some((l) => l.startsWith('D') || l.startsWith('K') || l.startsWith('M')), 'NOT ONE press reached the script — the fence refused before the first SendInput', st.lines);
  ok(st.audits.length === 1 && st.audits[0].ok === false && st.audits[0].why === 'consent-ui' && st.audits[0].windowClass === 'Credential Dialog Xaml Host', 'one audit line: the refused attempt on the consent UI is recorded', st.audits);
}
{ // allow-list narrowing: a window not in the owner's list ⇒ refused
  const st = { lines: [], audits: [], frontClass: 'RandomApp', frontTitle: 'x', allow: ['Chrome_WidgetWin_1'] };
  const inj = winInjector(st);
  const r = await inj.inject([{ t: 'md', x: 1, y: 1, b: 0 }]);
  inj.close();
  ok(!r.ok && r.refused[0].detail === 'not-in-allow' && same(st.lines, ['E 1', 'F']), 'an owner allow-list that omits this window class refuses it (nothing sent)', { r, lines: st.lines });
}
{ // NOT elevated ⇒ the fence is skipped entirely (the resident script keeps its own UIPI short-circuit); no E/F, no audit
  const st = { lines: [], audits: [], frontClass: 'Credential Dialog Xaml Host', frontTitle: 'x', allow: null };
  const inj = winInjectorWith(st, false); // elevated: false
  const r = await inj.inject([{ t: 'md', x: 2, y: 3, b: 0 }]);
  inj.close();
  ok(r.ok && same(st.lines, ['M 2 3', 'D 0']) && st.audits.length === 0, 'an UNELEVATED injector never sends E/F and never audits — the resident script keeps the UIPI short-circuit', { lines: st.lines, audits: st.audits });
}

// ── ④ MUTANT controls
console.log('④ controls: patched copies judged by the rows above');
const M = mutantCopies('inject-allow', REPO);
{
  const src = fs.readFileSync(path.join(REPO, 'src/input-inject.js'), 'utf8');
  const denyCut = "  if (Object.prototype.hasOwnProperty.call(INJECT_DENY, cls)) return { ok: false, why: INJECT_DENY[cls] };\n";
  ok(src.includes(denyCut), 'the hard-deny line is where the control cuts it');
  const Im = M.load('src/input-inject.js', src.replace(denyCut, ''), 'no-deny');
  ok(Im.injectAllowed({ windowClass: 'Credential Dialog Xaml Host', elevated: true }).ok === true, 'CONTROL: a copy WITHOUT the hard-deny allows the UAC consent UI — the consent-ui row above would be RED', Im.injectAllowed({ windowClass: 'Credential Dialog Xaml Host', elevated: true }));
  const allowCut = "  if (list && list.length && !list.includes(cls)) return { ok: false, why: 'not-in-allow' };\n";
  ok(src.includes(allowCut), 'the allow-list narrowing is where the control cuts it');
  const Im2 = M.load('src/input-inject.js', src.replace(allowCut, ''), 'no-allow');
  ok(Im2.injectAllowed({ windowClass: 'Notepad', elevated: true, allow: ['Chrome_WidgetWin_1'] }).ok === true, 'CONTROL: a copy WITHOUT the allow-list narrowing allows a window not in the list — the not-in-allow row above would be RED');
}
for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
