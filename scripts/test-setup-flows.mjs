#!/usr/bin/env node
// test-setup-flows — the tour's «Connect your agents» step (lane door-signin-card, rule 3).
// The welcome wizard lives in an App mixin (installSetupFlows) with a live DOM, themeManager and
// ws, so the humane card itself is rendered behaviorally in test-signin-card-ui; HERE we pin the
// step's integration invariants in the source so a refactor can't silently restore the dead end:
//   ① the step mounts the shared SignInCard (into #ob-signin) — the same card the chat shows;
//   ② the connect step is NOT skipped silently: Continue, when nothing is signed in, warns once
//      (#ob-signin-warn) and relabels to «Continue anyway» before it advances;
//   ③ readiness (_obReady: a terminal login or a named account/pool) is computed from backend-status;
//   ④ the terminal road is kept, folded under «Advanced» (ob-advanced);
//   ⑤ the old dead-end pitch line is gone.
//   ⑥ (lane signin-card-real-screen) the guided modal's terminal re-attaches on a socket reconnect (the naive41 dead modal);
//   ⑦ the Advanced road's Claude «Log in» = the card's own login run on its raw screen (one run per account).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const s = fs.readFileSync(path.join(ROOT, 'src/lib/setup-flows.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); if (info !== undefined) console.log('    ', String(info).slice(0, 200)); } };

// the step-1 region: from the «Connect your agents» header to the start of step 2
const i = s.indexOf("t('Connect your agents')");
const j = s.indexOf("} else if (step === 2)", i);
ok(i > 0 && j > i, 'step-1 region located', { i, j });
const step1 = s.slice(i, j > i ? j : s.length);

ok(/import \{ SignInCard \} from '\.\/signin-card\.js'/.test(s), '① setup-flows imports the shared SignInCard');
ok(/id="ob-signin"/.test(step1) && /new SignInCard\(/.test(step1) && /\.mount\(content\.querySelector\('#ob-signin'\)\)/.test(step1), '① the step mounts a SignInCard into #ob-signin', step1.match(/new SignInCard[^\n]*/)?.[0]);

ok(/id="ob-signin-warn"/.test(step1), '② the step has a warning element (#ob-signin-warn)');
ok(/!this\._obSignedIn && !this\._obReady && !this\._obWarnedOnce/.test(step1), '② Continue gates on not-signed-in + not-ready + not-yet-warned', step1.match(/if \(!this\._obSignedIn[^\n]*/)?.[0]);
ok(/obNext\.textContent = t\('Continue anyway'\)/.test(step1) && step1.indexOf("obNext.textContent = t('Continue anyway')") < step1.indexOf('step = 2; render();', step1.indexOf('obNext.onclick')), '② the warn + relabel happens BEFORE the advance (not silent)');

ok(/this\._obReady =/.test(step1) && /namedLoggedIn/.test(step1), '③ _obReady is computed from backend-status (login or named/pool)', step1.match(/this\._obReady =[^\n]*/)?.[0]);

ok(/class="ob-advanced"/.test(step1) && /<summary>/.test(step1) && /id="ob-backends"/.test(step1), '④ the terminal/backends road is kept, folded under Advanced');

ok(!/VibeSpace drives the official CLIs — log in once, credentials persist/.test(s), '⑤ the old dead-end pitch line is gone');
ok(/the humane sign-in card inline/.test(step1), '⑤ the step carries the lane comment');

// ⑥ lane signin-card-real-screen — the naive41 DEAD «Log in to Claude Code» modal (2.369.344): its terminal answered keys,
//    then stopped echoing, while its HTTP done-poll kept working and flipped it to ✓ by itself. ROOT: app.js re-attaches
//    every terminal in `this.sessions` when the socket reconnects; the guided modal's terminal lives in the modal, not
//    there — after the first reconnect (the tab in the background while the person signs in elsewhere) it was attached
//    to nothing. (主开发's TTL hypothesis is refuted by test-claude-signin ⑰: a run's TTL kills its own helper tree only.)
{
  const at = s.indexOf('    runGuidedCli({ title, cmd, hint, checkDone }) {');
  let body = null;
  if (at > 0) { const i0 = s.indexOf('{', s.indexOf(')', at)); let d = 0; for (let k = i0; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) { body = s.slice(i0 + 1, k); break; } } }
  ok(!!body, '⑥ (setup) runGuidedCli read off setup-flows.js');
  const sent = [], states = [], globals = new Set(); let fits = 0, closed = 0;
  const el = () => ({ innerHTML: '', isConnected: true, querySelector: () => el(), appendChild() { } });
  const modalBody = el();
  class TerminalSession { constructor(win, ws, sid) { this.sid = sid; } fit() { fits++; } dispose() { } }
  const app = { ws: { send: (m) => sent.push(m), onGlobal: (f) => globals.add(f), offGlobal: (f) => globals.delete(f), onStateChange: (h) => states.push(h), offStateChange: (h) => { const k = states.indexOf(h); if (k >= 0) states.splice(k, 1); } }, killSession: () => { }, themeManager: {}, settings: {} };
  const fn = new Function('createModalShell', 'escHtml', 't', 'TerminalSession', 'SIGN_IN', 'MutationObserver', 'document', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'clearInterval',
    'return function ({ title, cmd, hint, checkDone }) {' + (body || '') + '}')(
    () => ({ body: modalBody, close: () => { closed++; } }), (x) => String(x), (x) => x, TerminalSession, 'sign-in',
    class { observe() { } disconnect() { } }, { body: {}, createElement: () => el() }, (f) => f(), () => 0, () => 0, () => { });
  fn.call(app, { title: 'Log in to Claude Code', cmd: 'the-login-command', checkDone: async () => false });
  const create = sent.find((m) => m.type === 'create');
  [...globals].forEach((f) => f({ type: 'created', reqId: create && create.reqId, sessionId: 'gc-s1' }));
  const before = sent.length;
  states.slice().forEach((h) => h(true)); // the socket reconnects
  const attach = sent.slice(before).find((m) => m.type === 'attach');
  ok(attach && attach.sessionId === 'gc-s1' && fits >= 1, '⑥ a socket reconnect RE-ATTACHES the guided modal\'s terminal (attach {sessionId}) and re-fits it — it never goes deaf', sent.slice(before));
  states.slice().forEach((h) => h(false));
  ok(sent.slice(before).filter((m) => m.type === 'attach').length === 1, '⑥ a disconnect attaches nothing');
}
// ⑦ the tour's «Advanced → terminal» for the card's harness IS the card's own login run on its raw screen (one run per
//    account — a live one is joined, never a second TUI beside it); Codex keeps its guided terminal
{
  ok(/if \(capsOf\(key\)\.oauthUsage === true && !isInstall && typeof this\._openSignInCard === 'function'\) \{ this\._openSignInCard\(\{ rawFirst: true, onClose: \(\) => refresh\(\) \}\); return; \}/.test(s), '⑦ the Claude «Log in» of the Advanced road opens the sign-in card on its raw screen (rawFirst) — a declared caps row, never an id');
  ok(s.indexOf("this._openSignInCard({ rawFirst: true") < s.indexOf('await this.runGuidedCli({', s.indexOf("this._openSignInCard({ rawFirst: true")), '⑦ …before the guided terminal (which the other harnesses keep)');
  const MA = fs.readFileSync(path.join(ROOT, 'src/lib/manage-agents.js'), 'utf8');
  ok(/_openSignInCard\(\{ rawFirst = false, onClose = null \} = \{\}\) \{/.test(MA) && /new SignInCard\(\{ ws: this\.ws, hasWaiting: \(\) => false, rawFirst,/.test(MA), '⑦ Manage agents\' sign-in modal takes rawFirst + onClose (the same card)');
}

console.log(`\ntest-setup-flows: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
