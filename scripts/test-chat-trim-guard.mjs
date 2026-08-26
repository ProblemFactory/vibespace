#!/usr/bin/env node
// Fold-dominated trim guard (inc-mtajy6wr "上翻的时候出现大量白屏", 2.368.29):
// with semantic collapse folding whole tool/agent runs, a 150-message window
// can render shorter than the viewport — trimBottom then removes the only
// VISIBLE content and every wheel-tick teleports the window 50 messages
// through fold-space on a white screen (captured: extendTop:done sh=787=ch
// every ~0.5s, ws 4572→4036). The guard: while the rendered window is
// shorter than ~2 viewports, the cap grows to 600 instead of trimming.
// DOM-heavy machinery has no functional harness — these pins keep the guard
// (and its symmetry) from being refactored away silently.
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const cv = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');

const guards = cv.match(/if \(list && list\.scrollHeight < list\.clientHeight \* 2\) maxRendered = 600;/g) || [];
ok('the short-window guard exists in BOTH trims (bottom AND top — downward paging through folds is the mirror image)', guards.length === 2, `found ${guards.length}`);
ok('trimBottom carries the guard', /_trimBottom\(maxRendered = 150\) \{[\s\S]{0,900}maxRendered = 600;/.test(cv));
ok('trimTop carries the guard', /_trimTop\(maxRendered = 150\) \{[\s\S]{0,900}maxRendered = 600;/.test(cv));
ok('the incident is named at the guard (future readers find the bundle)', /inc-mtajy6wr/.test(cv));
ok('the trim trace tags survive (the capture channel that caught this)', cv.includes("this._trace('trimBottom'") && cv.includes("_trace('extendTop:done'"));
ok('the loadHistory fill-viewport auto-load is still height-gated (it terminates once headers accumulate past one viewport)', /this\._windowStart > 0 && this\._messageList\.scrollHeight <= this\._messageList\.clientHeight/.test(cv));

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
