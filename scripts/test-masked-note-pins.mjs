#!/usr/bin/env node
// THE MASKED NOTE — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-masked-note-chrome.mjs (its behaviour legs and every mutant / browser CONTROL stay there): r6 (m7): the For-you window draws a plain ask's detail as <pre class=iw-exit-cmd> by textContent, then linkifyInto over its pane (src/lib/inbox-window.js).
// Each block reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-masked-note-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(e).slice(0, 700) : '')); } return c; };
console.log('— r6 (m7): the For-you window\'s verbatim command (source pin)');
{
  const IW = fs.readFileSync(path.join(REPO, 'src/lib/inbox-window.js'), 'utf8');
  ok(IW.includes("else if (plain) { const pre = mk('pre', 'iw-exit-cmd'); pre.textContent = v.detail; c.detail.replaceChildren(pre); }") && /if \(plain\) linkifyInto\(c\.detail\);/.test(IW), 'r6 (m7): the For-you window draws a plain ask\'s detail as <pre class=iw-exit-cmd> by textContent, then linkifyInto over its pane (inbox-window.js, read)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
