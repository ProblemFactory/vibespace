#!/usr/bin/env node
// THE BROWSER LIVE VIEW — SOURCE PIN (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-browser-live.mjs (its worktree server + headless chrome legs stay there, ⑥'s behavioural negative control among them):
// the fading boot splash takes no clicks — pointer-events none in the statement that starts the fade (src/client.js), with its text-only
// CONTROL. The file is read BY NAME, so ci.mjs's affected rule selects this suite on a change of it.
// Run: node scripts/test-browser-live-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 600) : '')); } return !!c; };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
console.log('— the boot splash takes no clicks while it fades (source pin)');
// integration 2.369.192 (B-b122, the .190 heavy red): the boot splash fades at opacity 0 over everything (z-index 999999)
// for 300 ms after app.ready and took the first press of a freshly loaded page. SOURCE PIN: its pointer-events go the
// moment the fade starts (the same statement, BEFORE the opacity); the behavioural pin is ⑥'s negative control — its
// press right after a reload (clickOnce waits for elementFromPoint to be the picture, which a pointer-events:none
// splash never is)
{
  const cj = fs.readFileSync(path.join(repo, 'src/client.js'), 'utf8');
  const line = cj.split('\n').find((l) => /getElementById\('loading-screen'\)/.test(l) ? false : /\bsplash\.style\.opacity = '0'/.test(l)) || '';
  const pe = line.indexOf("splash.style.pointerEvents = 'none'"), op = line.indexOf("splash.style.opacity = '0'");
  ok(pe >= 0 && op > pe && /setTimeout\(\(\) => splash\.remove\(\), 300\)/.test(line), 'the fading boot splash takes no clicks: pointer-events none is set in the statement that starts the fade, before the opacity (src/client.js)', line.trim());
  const pre = line.replace("splash.style.pointerEvents = 'none'; ", '');
  ok(pre !== line && pre.indexOf("splash.style.pointerEvents = 'none'") < 0, 'CONTROL: the pre-fix statement (opacity only) carries no pointer-events — the pin above can go red');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
