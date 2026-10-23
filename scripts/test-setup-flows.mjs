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

console.log(`\ntest-setup-flows: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
