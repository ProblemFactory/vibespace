#!/usr/bin/env node
// THE POSTURE LADDER (lane duo-build-1 slice 4 — SPEC-v3 rev 3.3 §1.4 / §1.6 / §3 / §5; research-v4 B.5). Fast, in-process,
// PURE src/fold-posture.js + wiring pins:
//   ① targetOf — research-v4 B.5's table: horizontal segments:2 = book (only trigger), vertical segments:2 = laptop (only
//     trigger), folded + 1 segment + the regular class = pending (changes nothing), folded on the compact class = none
//     (the cover's tent / standing is a stable folded + 1 segment), flags off (every query false) = none — RED CONTROL:
//     rev 3.2's «folded and wider than tall ⇒ book» would cut the 594 px cover's tent in two
//   ② foldStep — into book / laptop after 120 ms, out after 300 ms, pending at once with its 1.5 s timeout, pending → none
//     at once, book ⇄ laptop through the leave settle
//   ③ seamOf — the design seam (20 px) centred on the shared edge; the platform's wider mask wins; no env() ⇒ 475.5
//   ④ laptopYield — §5's yielding order at 867 px: the strip goes at K > 197, the bar at K > 317, the composer may touch
//     the band at K > 361; at the spec's own K = 300: the strip gone, the dead zone 17, the bar kept
//   ⑤ wiring pins — the ladder's owner listens to the six queries + resize (+ devicePosture only when present), never
//     persists the state, counts a pending timeout; `pending` has no rule in the stylesheet; book / laptop rules exist
//     only under the regular class
// Run: node scripts/test-fold-posture.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const F = require(path.join(REPO, 'src/fold-posture.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const M = (o) => ({ h1: false, h2: false, v1: false, v2: false, folded: false, cont: false, ...o });

console.log('① targetOf (research-v4 B.5)');
{
  const rows = [
    [M({ h2: true, folded: true }), 'regular', 'book', 'horizontal-viewport-segments: 2 ⇒ book'],
    [M({ v2: true, h1: true, folded: true }), 'regular', 'laptop', 'vertical-viewport-segments: 2 ⇒ laptop (h1 is true too in a laptop — v2 wins)'],
    [M({ folded: true, h1: true, v1: true }), 'regular', 'pending', 'folded + 1 segment on the inner display ⇒ pending (wait, change nothing)'],
    [M({ folded: true, h1: true, v1: true }), 'compact', 'none', 'folded + 1 segment on the COVER (tent / standing) ⇒ none — the compact class ignores folded'],
    [M({ h1: true, v1: true, cont: true }), 'regular', 'none', 'flat (continuous, 1 segment) ⇒ none'],
    [M({}), 'regular', 'none', 'flags off: every query false ⇒ none (no different from «unsupported»)'],
    [M({ folded: true }), 'desktop', 'none', 'folded on a desktop class ⇒ none'],
  ];
  for (const [m, vc, want, what] of rows) ok(F.targetOf(m, vc) === want, what, F.targetOf(m, vc));
  const rev32 = (m, w, h) => (m.folded && w > h ? 'book' : 'none'); // the rule rev 3.3 deleted
  ok(rev32(M({ folded: true }), 594, 368) === 'book' && F.targetOf(M({ folded: true, h1: true }), 'compact') === 'none', 'RED CONTROL: rev 3.2\'s «folded and wider than tall ⇒ book» cuts the cover\'s 594×368 tent in two — the ladder does not');
}

console.log('② foldStep (the timings)');
{
  const s = (state, target) => F.foldStep({ state, target });
  ok(s('none', 'book').to === 'book' && s('none', 'book').delayMs === F.FOLD_ENTER_MS && F.FOLD_ENTER_MS === 120, 'none → book after the 120 ms enter settle');
  ok(s('pending', 'laptop').to === 'laptop' && s('pending', 'laptop').delayMs === 120, 'pending → laptop after 120 ms');
  ok(s('book', 'none').to === 'none' && s('book', 'none').delayMs === F.FOLD_LEAVE_MS && F.FOLD_LEAVE_MS === 300, 'book → none after the 300 ms leave settle (HIG: favour small adjustments)');
  ok(s('none', 'pending').to === 'pending' && s('none', 'pending').delayMs === 0 && s('none', 'pending').timeout === F.FOLD_PENDING_MS && F.FOLD_PENDING_MS === 1500, 'none → pending at once (it changes nothing), with its 1.5 s timeout');
  ok(s('pending', 'none').to === 'none' && s('pending', 'none').delayMs === 0, 'pending → none at once (continuous again)');
  ok(s('book', 'laptop').delayMs === 300 && s('laptop', 'pending').delayMs === 300, 'book ⇄ laptop and a fold → pending go through the leave settle');
  ok(s('book', 'book').to === null && s('pending', 'pending').timeout === 1500, 'the same state: stay (a pending keeps its timeout)');
  ok(F.FOLD_STATES.join() === 'none,pending,book,laptop', 'the four states of <html data-fold>');
}

console.log('③ seamOf');
{
  const a = F.seamOf({ edge: 475.5 });
  ok(a.width === 20 && a.from === 465.5 && a.to === 485.5 && !a.guessed, 'Safari\'s zero-width edge at 475.5 ⇒ our 20 px design seam 465.5–485.5');
  const b = F.seamOf({ edge: 475, gap: 32 });
  ok(b.width === 32 && b.from === 459, 'Android Chrome\'s wider mask (32) wins over ours');
  const c = F.seamOf({ edge: NaN });
  ok(c.edge === 475.5 && c.guessed && F.FOLD_EDGE_FALLBACK === 475.5 && F.FOLD_SEAM_PX === 20, 'no env() ⇒ the constructed 475.5 (the regular class only), marked guessed');
}

console.log('④ laptopYield (SPEC-v3 §5)');
{
  const y0 = F.laptopYield({ K: 0, innerHeight: 867 });
  ok(y0.yFold === 391.5 && y0.thresholds.strip === 197 && y0.thresholds.bar === 317 && y0.thresholds.band === 361, 'at 867: y_fold 391.5 (innerHeight − 475.5), thresholds 197 / 317 / 361', y0);
  ok(y0.strip && y0.bar && y0.dead === 24 && !y0.intoBand, 'no keyboard: the strip, the bar and the 24 px dead zone');
  const y300 = F.laptopYield({ K: 300, innerHeight: 867 });
  ok(!y300.strip && y300.bar && y300.dead === 17 && !y300.intoBand, 'the spec\'s own K = 300: ① the strip gone, ② the dead zone 17, ③ the bar KEPT', y300);
  ok(F.laptopYield({ K: 197 }).strip && !F.laptopYield({ K: 198 }).strip, '① the strip goes only past 197');
  ok(F.laptopYield({ K: 317 }).bar && !F.laptopYield({ K: 318 }).bar, '③ the bar goes only past 317');
  ok(!F.laptopYield({ K: 361 }).intoBand && F.laptopYield({ K: 362 }).intoBand, '④ the composer may touch the band only past 361');
  ok(F.laptopYield({ K: 0, innerHeight: 867, yFold: 400 }).yFold === 400, 'env(viewport-segment-bottom 0 0) wins over the constructed line');
}

console.log('⑤ wiring pins');
{
  const lad = read('src/lib/fold-ladder.js'), kb = read('src/lib/keyboard-inset.js'), app = read('src/lib/app.js'), css = read('public/style.css');
  ok(/for \(const \[k, q\] of Object\.entries\(FOLD_MQ\)\)/.test(lad) && /addEventListener\('change', tick\)/.test(lad) && /addEventListener\('resize', tick\)/.test(lad) && /navigator\.devicePosture\?\.addEventListener\?\.\('change', tick\)/.test(lad), 'the owner listens to the six queries, resize (a re-read) and devicePosture only when present');
  ok(!/localStorage|sessionStorage/.test(lad) && /track\('event', 'fold-pending-timeout'\)/.test(lad), 'the state is never persisted; a pending timeout is counted (fold-pending-timeout)');
  ok(/this\._foldLadder = installFoldLadder\(this\);/.test(app) && /this\._keyboardInset = installKeyboardInset\(\);/.test(app), 'the App installs the ladder and the keyboard reader');
  ok(/const open = lost > 120 && vv\.scale <= 1\.2;/.test(kb) && /laptopYield\(/.test(kb), 'the keyboard: > 120 px of the layout viewport lost and not pinch-zoomed (SPEC-v3 §7); §5\'s yield in the laptop pose');
  ok(!/data-fold="pending"/.test(css) && /html\[data-vc="regular"\]\[data-fold="book"\]/.test(css) && /html\[data-vc="regular"\]\[data-fold="laptop"\]/.test(css) && !/\[data-fold="book"\](?![^{]*data-vc)/.test(css.replace(/html\[data-vc="regular"\]\[data-fold="book"\]/g, '')), 'pending has NO rule; book / laptop rules exist only under the regular class');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
